/* ============================================================
 *  brix • server.js — АВТОРИТЕТНЫЙ СЕРВЕР МУЛЬТИПЛЕЕРА (v0.3.1)
 *  Как в Rust/Oxide: сервер — хозяин мира.
 *
 *  Ноль зависимостей: чистый Node.js.
 *   1. Раздаёт файлы игры по http://localhost:8787
 *      (чтобы не возиться с file:// и кэшем).
 *   2. WebSocket-сервер (свой, без npm) на том же порту.
 *
 *  ЧТО СЕРВЕР ХРАНИТ (авторитетно):
 *   - список игроков (ростер): id, имя, цвет, последнее состояние;
 *   - состояние мира: запас каждого дерева и каждой рудной жилы.
 *
 *  ПРАВИЛА:
 *   - новый игрок получает welcome: свой id (назначает сервер),
 *     СПИСОК ВСЕХ ТЕКУЩИХ ИГРОКОВ с их позициями и состояние мира
 *     → сразу видит и старых игроков, и общий запас ресурсов;
 *   - все остальные получают join/leave при входе/выходе;
 *   - удар по ресурсу: клиент шлёт ЗАПРОС, сервер применяет его к
 *     миру (сам считает остаток, сам решает «упало/рассыпалось»,
 *     сам выбирает сторону падения) и рассылает результат всем;
 *   - игрок, молчащий дольше 30 с, выбрасывается из ростера.
 * ============================================================ */
'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = 8787;
const ROOT = __dirname;
const PLAYER_TIMEOUT = 90000;   // молчание дольше этого — игрок «выпал» (фоновые вкладки шлют pong)

/* ✅ v0.3.8: РЕСПАВН ПО ТАЙМЕРУ СЕРВЕРА (не по перезагрузке клиента!) */
const BARREL_RESPAWN_MS = 12 * 60 * 1000;          // бочка — 12 минут
const CRATE_RESPAWN_MS = {                          // ящик чекблока (как в репозитории)
  wooden: 5 * 60 * 1000,
  military: 25 * 60 * 1000
};

/* ---------- 1. Статика ---------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
  '.bin': 'application/octet-stream',
  '.bat': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

/* ✅ v0.3.5: заявки в друзья игрокам, которых сейчас нет на сервере.
   Хранятся по нику 15 минут: игрок заходит — сервер сам доставляет */
const pendingInvites = new Map();   // lower(ник) -> [{from, fromId, at}]
function deliverPending(target) {
  const key = String(target.name || '').trim().toLowerCase();
  const list = pendingInvites.get(key);
  if (!list || !list.length) return 0;
  let n = 0;
  list.forEach((inv) => {
    if (Date.now() - inv.at > 15 * 60 * 1000) return;
    target.send({ t: 'fsoc', from: inv.from, fromId: inv.fromId,
      kind: 'finvite', data: null });
    n++;
    console.log('[soc] ' + target.name + ' получил отложенную заявку от ' + inv.from);
  });
  pendingInvites.delete(key);
  return n;
}

function serveFile(req, res, urlPath) {
  let p = urlPath.split('?')[0].split('#')[0];
  // ✅ v0.3.5: заявка в друзья прямо из МЕНЮ (WS ещё не подключён).
  // Игрок онлайн → доставляем сразу; нет → кладём в очередь на 15 мин
  if (req.method === 'OPTIONS' && p === '/invite') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }
  if (req.method === 'POST' && p === '/invite') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      let j = null;
      try { j = JSON.parse(body); } catch (e) {}
      const from = String((j && j.from) || '').trim().slice(0, 16);
      const fromId = String((j && j.fromId) || '').trim().slice(0, 24);
      const to = String((j && j.to) || '').trim().toLowerCase().slice(0, 16);
      const out = (o) => {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(o));
      };
      if (!from || !to || from.toLowerCase() === to) { out({ ok: false, why: 'bad' }); return; }
      // сам себе — нельзя
      let delivered = false;
      players.forEach((target) => {
        if (target.name.toLowerCase() === to) {
          target.send({ t: 'fsoc', from: from, fromId: fromId, kind: 'finvite', data: null });
          delivered = true;
        }
      });
      if (delivered) {
        console.log('[soc] ' + from + ' → ' + to + ': заявка доставлена (онлайн)');
        out({ ok: true, delivered: true, queued: false });
      } else if (to.startsWith('brix-')) {
        out({ ok: false, why: 'byid' });   // офлайн-поиск только по нику
      } else {
        const list = pendingInvites.get(to) || [];
        if (list.length >= 10) { out({ ok: false, why: 'full' }); return; }
        list.push({ from: from, fromId: fromId, at: Date.now() });
        pendingInvites.set(to, list);
        console.log('[soc] ' + from + ' → ' + to + ': заявка в очереди (игрок офлайн)');
        out({ ok: true, delivered: false, queued: true });
      }
    });
    return;
  }
  // ✅ v0.3.3: живой счётчик онлайна — сколько игроков РЕАЛЬНО на сервере
  if (p === '/status') {
    const names = [];
    players.forEach((pl) => names.push(pl.name));
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      ok: true, players: players.size, max: 64, inGame: countInGame(),
      names: names, map: 'Brixland'
    }));
    return;
  }
  if (p === '/' || p === '') p = '/index.html';
  const file = path.normalize(path.join(ROOT, decodeURIComponent(p)));
  // не даём выйти за пределы папки игры
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found: ' + p); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
}

/* ---------- 2. WebSocket (свой, без npm) ---------- */

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function wsAccept(key) {
  return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
}

/** закодировать ТЕКСТОВЫЙ фрейм сервер -> клиент (без маски) */
function wsEncodeText(str) {
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let head;
  if (len < 126) {
    head = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x81; head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x81; head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([head, payload]);
}

/** парсер потока клиентских фреймов (клиенты шлют МАСКИРОВАННЫЕ фреймы) */
function wsParser(onMessage, onClose) {
  let buf = Buffer.alloc(0);
  return function feed(chunk) {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2); off = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2)); off = 10;
      }
      const maskLen = masked ? 4 : 0;
      if (buf.length < off + maskLen + len) return;
      const payload = buf.slice(off + maskLen, off + maskLen + len);
      if (masked) {
        const mask = buf.slice(off, off + 4);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }
      buf = buf.slice(off + maskLen + len);
      if (opcode === 0x8) { onClose(); return; }         // close
      if (opcode === 0x9) continue;                      // ping
      if (opcode === 0xA) continue;                      // pong
      if ((opcode === 0x1 || opcode === 0x2) && fin) {
        onMessage(payload.toString('utf8'), opcode);
      }
    }
  };
}

/* ---------- 3. АВТОРИТЕТНОЕ СОСТОЯНИЕ ---------- */

const players = new Map();   // id -> {id, name, c, sock, send, state, last}
let nextNum = 1;
let world = null;            // {trees: [{w, g, fd}], ores: {iron: [], sulfur: [], stone: []}}

function broadcast(obj, excludeId) {
  const text = JSON.stringify(obj);
  players.forEach((p) => {
    if (p.id === excludeId) return;
    try { p.sock.write(wsEncodeText(text)); } catch (e) { /* умрёт само */ }
  });
}

/* ✅ v0.3.6: счётчик онлайна меняет ТОЛЬКО СЕРВЕР и пушит его КАЖДОМУ
   игроку сразу при входе/выходе — игроки на число не влияют */
// ✅ v0.4.1: два понятных счётчика: НА СЕРВЕРЕ (все подключения,
// включая тех, кто ещё в меню) и В ИГРЕ (уже заспавнились в мир)
function countInGame() {
  let n = 0;
  players.forEach((p) => { if (p.state) n++; });
  return n;
}

function pushCount() {
  broadcast({ t: 'cnt', n: players.size, g: countInGame() }, null);
}

function rosterFor() {
  const out = [];
  players.forEach((p) => {
    // ✅ v0.4.3: в ростере ещё и уровень (lvl) + BRIX-ID (aid) аккаунта
    // ✅ v0.4.5: и здоровье — у нового игрока полоски хп у всех сразу
    out.push({ id: p.id, n: p.name, c: p.c, lvl: p.lvl || 1, aid: p.aid || '',
      hp: p.dead ? 0 : (p.hp === undefined ? 100 : p.hp),
      s: p.state || null });
  });
  return out;
}

/* ✅ v0.3.7: МИР ОБЪЕКТОВ — ЧЕКБЛОКИ С ЛОМАЮЩИМИСЯ БОЧКАМИ.
   Одиночных бочек и ящиков на карте больше НЕТ: всё лутаемое живёт
   внутри чекблоков (как в репозитории oxide5554-create/-glm,
   scr/world/locations/checkblock.js):
   1 предмет-декорация (стиралка / холодильник / ЭЛТ-телевизор) +
   2-3 ЛОМАЮЩИЕСЯ бочки (одна лежит, с разливом) + ящик с лутом + мусор.
   HP бочек, разбитие, дропы и лут ящиков — АВТОРИТЕТНО у сервера. */
const OBJ_SEED = 20261114;
function makeObjRng(seed) {
  let a = (seed === undefined ? OBJ_SEED : seed) | 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const CHECKBLOCK_COUNT = 40;   // ✅ v0.3.8: 40 кандидатов — клиент отсеет
                               // воду/склоны (детерминированно), останется ~15-20

/* ✅ v0.3.7: ОДНА формула раскладки чекблоков — и у сервера, и в режиме
   вкладок (gameworld.js __buildLocalObjects). ВАЖНО: последовательность
   вызовов rnd() в обеих копиях должна совпадать СИМВОЛ В СИМВОЛ */
function buildCheckblockLayout(seed) {
  const rnd = makeObjRng(seed);
  const ITEMS = ['washer', 'fridge', 'tv'];
  const cb = [];
  for (let i = 0; i < CHECKBLOCK_COUNT; i++) {
    let x, z;
    do { x = (rnd() - 0.5) * 680; z = (rnd() - 0.5) * 680; }
    while (Math.sqrt(x * x + z * z) < 40);
    const rec = {
      id: 'c' + i,
      x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10,
      rot: Math.round(rnd() * 628) / 100,
      item: ITEMS[Math.floor(rnd() * 3)],
      seed: 1 + Math.floor(rnd() * 1000000),
      mil: rnd() < 0.05 ? 1 : 0,
      taken: false,
      barrels: []
    };
    const nb = rnd() < 0.5 ? 2 : 3, a0 = rnd() * Math.PI * 2;
    for (let j = 0; j < nb; j++) {
      const a = a0 + j * (0.7 + rnd() * 0.4);
      const d = 1.2 + rnd() * 0.8 + j * 0.15;
      rec.barrels.push({
        id: rec.id + 'b' + j,
        lx: Math.round(Math.cos(a) * d * 100) / 100,
        lz: Math.round(Math.sin(a) * d * 100) / 100,
        wy: Math.round(rnd() * 628) / 100,
        lying: j === 0 ? 1 : 0,
        hp: 2, brk: false
      });
    }
    cb.push(rec);
  }
  return cb;
}

/* ✅ v0.3.8: ЛУТ ЯЩИКА — рецепт из репозитория (scr/world/crates.js rollLoot):
   скрап всегда, метал/пружина/труба с шансом, корпус берданки/АК — редко.
   Лут ХРАНИТСЯ НА СЕРВЕРЕ: взял один предмет — у всех осталось остальное */
function rollLoot(mil) {
  const r = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  const loot = { scrap: r(4, 8), metal: 0, spring: 0, pipe: 0, rifleBody: 0,
    berdanaBody: 0, revolver: 0, ammo: 0 };
  if (Math.random() < 0.6) loot.metal = r(4, 16);
  if (Math.random() < 0.5) loot.spring = r(1, 3);
  if (Math.random() < 0.5) loot.pipe = r(1, 3);
  // ✅ v0.4.5: ПАТРОНЫ (4–15) только в ВОЕННОМ ящике; РЕВОЛЬВЕР
  // встречается и в военном (шанс выше), и в деревянном
  if (Math.random() < 0.7) loot.ammo = r(4, 15);
  if (mil) {
    loot.rifleBody = 1;                        // корпус АК — в военном ящике всегда
    if (Math.random() < 0.35) loot.revolver = 1;
    if (Math.random() < 0.25) loot.berdanaBody = 1;
  } else {
    if (Math.random() < 0.12) loot.revolver = 1;
    if (Math.random() < 0.35) loot.berdanaBody = 1;
  }
  return loot;
}

/* ✅ v0.3.8: ПЕРСИСТЕНТНОСТЬ — состояние мира (лут ящиков, HP бочек, дропы)
   живёт в world-objs.json и ПЕРЕЖИВАЕТ перезапуск сервера.
   «Перезагрузил игру — ресурсы те же» работает, потому что состояние
   вообще не у клиента: клиент при входе получает снимок сервера */
const OBJS_FILE = path.join(ROOT, 'world-objs.json');
let saveTimer = null;
function markDirty() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const data = {
        v: 3,
        dropSeq: worldObjs.dropSeq,
        cb: worldObjs.cb.map((c) => ({
          id: c.id, x: c.x, z: c.z, rot: c.rot, item: c.item, seed: c.seed, mil: c.mil,
          taken: c.taken, gone: c.gone, loot: c.loot,
          barrels: c.barrels.map((b) => ({ id: b.id, lx: b.lx, lz: b.lz, wy: b.wy,
            lying: b.lying, hp: b.hp, brk: b.brk }))
        })),
        drops: Array.from(worldObjs.drops.values())
      };
      fs.writeFile(OBJS_FILE, JSON.stringify(data), () => {});
    } catch (e) { console.log('[objs] не сохранил мир: ' + e.message); }
  }, 800);
}

function freshWorldObjs() {
  const cb = buildCheckblockLayout(OBJ_SEED);
  cb.forEach((c) => { c.gone = false; c.loot = rollLoot(c.mil); });
  return { cb, drops: new Map(), dropSeq: 0 };
}

function loadWorldObjs() {
  try {
    if (!fs.existsSync(OBJS_FILE)) return null;
    const j = JSON.parse(fs.readFileSync(OBJS_FILE, 'utf8'));
    if (!j || j.v !== 3 || !Array.isArray(j.cb)) return null;
    const drops = new Map();
    (j.drops || []).forEach((d) => { if (d && d.id) drops.set(d.id, d); });
    return { cb: j.cb, drops, dropSeq: j.dropSeq || 0 };
  } catch (e) { return null; }
}

const _loaded = loadWorldObjs();
const worldObjs = _loaded || freshWorldObjs();
if (_loaded) console.log('[objs] мир загружен из world-objs.json (лут/бочки как были)');

/* после перезапуска сервера продолжаются таймеры респавна
   для всего, что было сломано/опустошено до него */
function scheduleBarrelRespawn(b, ms) {
  setTimeout(() => {
    if (!b.brk) return;
    b.brk = false;
    b.hp = 2;
    broadcast({ t: 'brespawn', id: b.id, hp: 2 }, null);
    markDirty();
    console.log('[objs] бочка ' + b.id + ' заспавнилась заново (таймер сервера)');
  }, ms);
}
function scheduleCrateRespawn(c, ms) {
  setTimeout(() => {
    if (!c.gone) return;
    c.gone = false;
    c.taken = false;
    c.loot = rollLoot(c.mil);
    broadcast({ t: 'cbrespawn', id: c.id, loot: c.loot, mil: c.mil }, null);
    markDirty();
    console.log('[objs] ящик чекблока ' + c.id + ' заспавнился с новым лутом');
  }, ms);
}
worldObjs.cb.forEach((c) => {
  if (c.gone) scheduleCrateRespawn(c, CRATE_RESPAWN_MS[c.mil ? 'military' : 'wooden']);
  c.barrels.forEach((b) => { if (b.brk) scheduleBarrelRespawn(b, BARREL_RESPAWN_MS); });
});

/* плоский индекс бочек: id -> {cb, bar} — быстрый поиск при ударе */
const barrelIndex = new Map();
worldObjs.cb.forEach((c) => c.barrels.forEach((b) => barrelIndex.set(b.id, { cb: c, bar: b })));

/* мировые координаты бочки: локальные (lx, lz) внутри чекблока + поворот */
function barrelWorld(c, b) {
  const cos = Math.cos(c.rot), sin = Math.sin(c.rot);
  return {
    x: Math.round((c.x + b.lx * cos + b.lz * sin) * 10) / 10,
    z: Math.round((c.z - b.lx * sin + b.lz * cos) * 10) / 10
  };
}

function objsSnapshot() {
  return {
    cb: worldObjs.cb.map((c) => ({
      id: c.id, x: c.x, z: c.z, rot: c.rot, item: c.item, seed: c.seed, mil: c.mil,
      taken: c.taken, gone: c.gone, loot: c.loot,
      bar: c.barrels.map((b) => ({ id: b.id, lx: b.lx, lz: b.lz, wy: b.wy,
        lying: b.lying, hp: b.hp, brk: b.brk }))
    })),
    dr: Array.from(worldObjs.drops.values()).map((d) =>
      ({ id: d.id, kind: d.kind, x: d.x, z: d.z, amt: d.amt }))
  };
}

function spawnDropsForBarrel(c, b) {
  const w = barrelWorld(c, b);
  const out = [];
  const nScr = 1 + Math.floor(Math.random() * 2);   // 1-2 скрапа
  const nMet = Math.random() > 0.45 ? 1 : 0;        // 0-1 метал фрагмент
  const nPip = Math.random() < 0.4 ? 1 : 0;         // ✅ v0.3.8: труба тоже падает
  const plan = [];
  for (let i = 0; i < nScr; i++) plan.push('scrap');
  if (nMet) plan.push('metal');
  if (nPip) plan.push('pipe');
  plan.forEach((kind) => {
    const id = 'd' + (worldObjs.dropSeq++);
    const dx = (Math.random() - 0.5) * 2.2, dz = (Math.random() - 0.5) * 2.2;
    const drop = { id, kind,
      x: Math.round((w.x + dx) * 10) / 10,
      z: Math.round((w.z + dz) * 10) / 10,
      amt: kind === 'scrap' ? 2 + Math.floor(Math.random() * 5)
         : kind === 'metal' ? 1 + Math.floor(Math.random() * 3)
         : 1 + Math.floor(Math.random() * 2) };
    worldObjs.drops.set(id, drop);
    out.push(drop);
  });
  return out;
}

const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

function dropPlayer(p, reason) {
  if (!players.has(p.id)) return;
  players.delete(p.id);
  pushCount();   // ✅ v0.3.6: счётчик уменьшился — сразу всем
  try { p.sock.destroy(); } catch (e) {}
  console.log('[mp] ' + p.name + ' (' + p.id + ') ' + reason + ' (игроков: ' + players.size + ')');
  broadcast({ t: 'leave', id: p.id });
}

function dropSocket(p) {
  if (players.has(p.id)) dropPlayer(p, 'отключился');
}

/** первый клиент задаёт мир (мир детерминированный — seed общий у всех) */
function initWorld(meta) {
  if (!meta || !meta.trees || !meta.ores) return false;
  world = {
    trees: meta.trees.map(function (tr) {
      return { w: Math.max(0, tr.w | 0), g: 0, fd: 1 };
    }),
    ores: {
      iron: meta.ores.iron.map(function (v) { return Math.max(0, v | 0); }),
      sulfur: meta.ores.sulfur.map(function (v) { return Math.max(0, v | 0); }),
      stone: meta.ores.stone.map(function (v) { return Math.max(0, v | 0); })
    }
  };
  console.log('[mp] мир принят: деревьев ' + world.trees.length +
    ', жилы iron/sulfur/stone: ' + world.ores.iron.length + '/' +
    world.ores.sulfur.length + '/' + world.ores.stone.length);
  return true;
}

/** АВТОРИТЕТНОЕ применение удара по ресурсу */
function applyHit(p, msg) {
  if (!world) return null;
  if (msg.k === 'tree') {
    const idx = msg.i | 0;
    const rec = world.trees[idx];
    if (!rec || rec.g) return null;
    const y = Math.max(1, msg.y | 0);
    const l = Math.max(0, rec.w - y);
    rec.w = l;
    const out = { t: 'hit', k: 'tree', i: idx, l: l, by: p.id };
    if (l <= 0) {
      rec.g = 1;
      rec.fd = Math.random() > 0.5 ? 1 : -1;   // сторона падения — решает СЕРВЕР
      out.d = 1;
      out.fd = rec.fd;
    } else { out.d = 0; }
    return out;
  }
  // руда
  const arr = world.ores[msg.ty];
  if (!arr) return null;
  const idx2 = msg.i | 0;
  if (arr[idx2] === undefined || arr[idx2] <= 0) return null;
  const y2 = Math.max(1, msg.y | 0);
  const l2 = Math.max(0, arr[idx2] - y2);
  arr[idx2] = l2;
  return { t: 'hit', k: 'ore', ty: msg.ty, i: idx2, l: l2, d: l2 <= 0 ? 1 : 0, by: p.id };
}

/* ---------- 4. HTTP-сервер + upgrade ---------- */

const server = http.createServer((req, res) => serveFile(req, res, req.url));

server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { sock.destroy(); return; }
  sock.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + wsAccept(key) + '\r\n\r\n'
  );
  sock.setNoDelay(true);

  const p = {
    id: null, name: '', c: '#e2572b',
    sock: sock,
    state: null,          // последнее состояние движения
    hp: 100,              // ✅ v0.4.5: здоровье (ПвП) — авторитет сервера
    dead: false,
    last: Date.now(),
    send: null
  };

  const feed = wsParser(
    (text) => {
      p.last = Date.now();
      let msg;
      try { msg = JSON.parse(text); } catch (e) { return; }
      if (!msg || !msg.t) return;

      /* --- регистрация игрока (сервер назначает id) --- */
      if (msg.t === 'hello') {
        p.id = 'u' + (nextNum++);
        p.name = String(msg.n || ('Игрок-' + p.id.slice(1).padStart(2, '0'))).slice(0, 16);
        p.c = String(msg.c || '#e2572b').slice(0, 24);
        // ✅ v0.4.3: уровень профиля и BRIX-ID — для списка игроков
        // в мини-меню (M). Присылаются клиентом, сервер только хранит
        p.lvl = Math.max(1, Math.min(9999, Number(msg.lvl) || 1));
        p.aid = String(msg.aid || '').slice(0, 16);
        p.send = (obj2) => { try { sock.write(wsEncodeText(JSON.stringify(obj2))); } catch (e) {} };
        players.set(p.id, p);
        if (!world && msg.meta) initWorld(msg.meta);
        // АВТОРИТЕТНЫЙ welcome: свой id + ВСЕ игроки с позициями + мир
        p.send({
          t: 'welcome',
          ver: 44,               // ✅ v0.4.5: протокол боя (snd/phit/pdeath/prespawn), hp в ростере
          id: p.id,
          players: rosterFor().filter(function (r) { return r.id !== p.id; }),
          world: world ? {
            trees: world.trees.map(function (tr) { return { w: tr.w, g: tr.g, fd: tr.fd }; }),
            ores: {
              iron: world.ores.iron.slice(),
              sulfur: world.ores.sulfur.slice(),
              stone: world.ores.stone.slice()
            }
          } : null,
          objs: objsSnapshot()   // ✅ v0.3.6: бочки/чекблоки/дропы (авторитет сервера)
        });
        // ✅ v0.4.3: в join едет lvl/aid — у всех игроков список полный сразу
        broadcast({ t: 'join', id: p.id, n: p.name, c: p.c,
          lvl: p.lvl || 1, aid: p.aid || '' }, p.id);
        console.log('[mp] ' + p.name + ' (' + p.id + ') вошёл (игроков: ' + players.size + ')');
        // ✅ v0.3.6: мгновенный пуш нового счётчика всем
        pushCount();
        // ✅ v0.3.5: отложенные заявки в друзья — «дойдут, когда зайдёшь»
        deliverPending(p);
        return;
      }
      if (!p.id) return; // не представился — игнор

      switch (msg.t) {
        case 's':           // состояние игрока: запоминаем + ретранслируем другим
          // ✅ v0.4.1: первое состояние = игрок вышел в игру — пушим
          // счётчики (иначе «В ИГРЕ» у других остаётся 0 до следующего пуша)
          if (!p.state) pushCount();
          p.state = {
            x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw,
            a: msg.a, tool: msg.tool, ph: msg.ph, n: p.name
          };
          broadcast({ t: 's', id: p.id, x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw,
            a: msg.a, tool: msg.tool, ph: msg.ph, n: p.name }, p.id);
          break;
        case 'hit': {       // ЗАПРОС удара: решает сервер
          const res = applyHit(p, msg);
          if (res) {
            console.log('[mp] ' + p.name + ' бьёт ' + res.k +
              (res.ty ? '/' + res.ty : '') + '#' + res.i + ' → остаток ' + res.l +
              (res.d ? ' (исчерпан)' : ''));
            broadcast(res, p.id);
          }
          break;
        }
        case 'bye':
          dropPlayer(p, 'вышел');
          break;
        /* ✅ v0.3.7: удар по бочке (внутри чекблока) — СЕРВЕР считает HP.
           Игроки на состояние не влияют: шлют заявку, сервер решает */
        case 'ping':   // ✅ v0.4.0: клиент проверяет «жив ли сервер»
          p.send({ t: 'pong' });
          break;

        case 'bhit': {
          const rec = barrelIndex.get(String(msg.id || ''));
          if (!rec || rec.bar.brk) break;
          if (!p.lastBHit) p.lastBHit = {};
          // защита от спама: не чаще 4 ударов/с на бочку
          const now = Date.now();
          if (p.lastBHit[rec.bar.id] && now - p.lastBHit[rec.bar.id] < 250) break;
          p.lastBHit[rec.bar.id] = now;
          const dmg = (msg.tool === 'ironAxe' || msg.tool === 'ironPickaxe') ? 2 : 1;
          rec.bar.hp -= dmg;
          if (rec.bar.hp <= 0) {
            rec.bar.hp = 0;
            rec.bar.brk = true;
            const drops = spawnDropsForBarrel(rec.cb, rec.bar);
            // ✅ v0.3.8: бочка вернётся по ТАЙМЕРУ СЕРВЕРА — и у всех сразу
            scheduleBarrelRespawn(rec.bar, BARREL_RESPAWN_MS);
            broadcast({ t: 'brk', id: rec.bar.id, drops }, null);   // и бьющему тоже
            markDirty();
            console.log('[objs] бочка ' + rec.bar.id + ' (чекблок ' + rec.cb.id +
              ') разбита (' + p.name + '), дропов: ' + drops.length +
              ' — вернётся через ' + Math.round(BARREL_RESPAWN_MS / 60000) + ' мин');
          } else {
            broadcast({ t: 'bhp', id: rec.bar.id, hp: rec.bar.hp }, null);
            markDirty();
          }
          break;
        }
        /* ✅ v0.3.6: подбор дропа — проверяем дистанцию по ПОСЛЕДНЕЙ
           ИЗВЕСТНОЙ позиции игрока (сервер не верит клиенту вслепую) */
        case 'btake': {
          const d = worldObjs.drops.get(String(msg.id || ''));
          if (!d) break;
          const pos = p.state || null;
          if (pos && dist2(pos.x, pos.z, d.x, d.z) > 36) break;  // >6 м — не верим
          worldObjs.drops.delete(d.id);
          broadcast({ t: 'btaken', id: d.id, pid: p.id, item: d.kind, amt: d.amt }, null);
          markDirty();
          console.log('[objs] ' + p.name + ' подобрал ' + d.kind + ' x' + d.amt);
          break;
        }
        /* ✅ v0.3.8: открыть ЛУТ-МЕНЮ ящика — сервер отвечает текущим лутом */
        case 'cbopen': {
          const c = worldObjs.cb.find((x) => x.id === String(msg.id || ''));
          if (!c || c.gone) break;
          const pos3 = p.state || null;
          if (pos3 && dist2(pos3.x, pos3.z, c.x, c.z) > 100) break;  // >10 м
          p.send({ t: 'cbopen', id: c.id, loot: c.loot, mil: c.mil });
          break;
        }
        /* ✅ v0.3.8: взять ОДИН ВИД предмета из ящика.
           Лут хранится на СЕРВЕРЕ: взял скрап — у всех остался
           пружина/металл; пустой ящик исчезает у всех и возвращается
           по таймеру сервера с новым лутом.
           ✅ v0.4.1: amt — взять ЧАСТЬ стека (перетащил в свой стек —
           заберётся столько, сколько влезает); без amt — весь стек */
        case 'cbtake': {
          const tid = String(msg.tid || '');
          const c = worldObjs.cb.find((x) => x.id === String(msg.id || ''));
          // ✅ v0.4.2: при отказе клиенту шлётся cbdeny — он ОТКАТИТ
          // оптимистично добавленный предмет (раньше отказ был «немым»
          // и предмет пропадал у игрока)
          if (!c || c.gone) {
            if (tid) p.send({ t: 'cbdeny', id: msg.id, item: msg.item, tid });
            break;
          }
          const pos2 = p.state || null;
          if (pos2 && dist2(pos2.x, pos2.z, c.x, c.z) > 100) {  // >10 м
            if (tid) p.send({ t: 'cbdeny', id: msg.id, item: msg.item, tid });
            break;
          }
          const item = String(msg.item || '');
          const avail = (c.loot && c.loot[item]) || 0;
          if (avail <= 0) {                          // такого предмета уже нет
            if (tid) p.send({ t: 'cbdeny', id: msg.id, item: msg.item, tid });
            break;
          }
          const amt = (msg.amt > 0) ? Math.min(Math.floor(msg.amt), avail) : avail;
          c.loot[item] = avail - amt;
          const empty = Object.keys(c.loot).every((k) => !c.loot[k]);
          if (empty) {
            c.gone = true;
            c.taken = true;
            scheduleCrateRespawn(c, CRATE_RESPAWN_MS[c.mil ? 'military' : 'wooden']);
            console.log('[objs] ящик ' + c.id + ' пуст — исчезнет у всех, вернётся через ' +
              Math.round(CRATE_RESPAWN_MS[c.mil ? 'military' : 'wooden'] / 60000) + ' мин');
          }
          broadcast({ t: 'cbloot', id: c.id, loot: c.loot, pid: p.id,
            item, amt, gone: empty, tid }, null);
          markDirty();
          console.log('[objs] ' + p.name + ' взял из ящика ' + c.id + ': ' + item + ' x' + amt);
          break;
        }
        /* ✅ v0.4.1: ПОЛОЖИТЬ свой предмет В ЯЩИК (drag&drop в обратную
           сторону). Содержимое инвентаря сервер не отслеживает —
           клиент сам вычел предмет у себя ДО отправки; лут ящика
           авторитетен и рассылается всем через cbloot */
        case 'cbput': {
          const c = worldObjs.cb.find((x) => x.id === String(msg.id || ''));
          if (!c || c.gone) break;
          const pos4 = p.state || null;
          if (pos4 && dist2(pos4.x, pos4.z, c.x, c.z) > 100) break;  // >10 м
          const item = String(msg.item || '');
          if (!item) break;
          const amt = Math.max(1, Math.min(999, Math.floor(msg.amt || 1)));
          c.loot[item] = (c.loot[item] || 0) + amt;
          broadcast({ t: 'cbloot', id: c.id, loot: c.loot, pid: p.id,
            item, amt, gone: false, put: true }, null);
          markDirty();
          console.log('[objs] ' + p.name + ' положил в ящик ' + c.id + ': ' + item + ' x' + amt);
          break;
        }
        /* ✅ v0.3.3: соцсеть — пересылка заявок в друзья адресату по имени.
           Сервер только доставляет: {t:'fsend', to:'Ник', kind, data} →
           адресату {t:'fsoc', from, fromId, kind, data} */
        case 'fsend': {
          const to = String(msg.to || '').trim().toLowerCase();
          if (!to) break;
          let delivered = false;
          players.forEach((target) => {
            if (target === p) return;
            if (target.name.toLowerCase() === to) {
              target.send({ t: 'fsoc', from: p.name, fromId: msg.fromId || p.id,
                kind: String(msg.kind || ''), data: msg.data || null });
              delivered = true;
            }
          });
          if (!delivered && p.send) p.send({ t: 'fsoc-miss', to: msg.to, kind: msg.kind });
          break;
        }
        /* ✅ v0.4.5 БОЙ: звук выстрела/перезарядки — ретранслируем всем
           остальным (они сами гасят громкость по дистанции до источника) */
        case 'snd': {
          broadcast({ t: 'snd', by: p.id, k: String(msg.k || 'shot'),
            x: Number(msg.x) || 0, z: Number(msg.z) || 0 }, p.id);
          break;
        }
        /* ✅ v0.4.5 ПВП: заявка попадания. ХП — АВТОРИТЕТ СЕРВЕРА:
           пуля 20 (шутер в 130 м), удар инструментом ≤10 (в 6 м).
           Убил → pdeath всем; труп ждёт prespawn от жертвы */
        case 'phit': {
          const target = players.get(String(msg.tid || ''));
          if (!target || !target.state || target.dead) break;
          if (!p.state) break;
          const kind = String(msg.kind || 'shot');
          const d2 = dist2(p.state.x, p.state.z, target.state.x, target.state.z);
          if (kind === 'shot' && d2 > 130 * 130) break;      // дальше 130 м
          if (kind !== 'shot' && d2 > 6 * 6) break;          // дальше 6 м
          const dmg = Math.max(0, Math.min(kind === 'shot' ? 20 : 10,
            Math.floor(Number(msg.dmg) || 0)));
          if (!dmg) break;
          target.hp = Math.max(0, (target.hp === undefined ? 100 : target.hp) - dmg);
          broadcast({ t: 'phit', tid: target.id, hp: target.hp,
            by: p.id, kind }, null);
          if (target.hp <= 0) {
            target.dead = true;
            broadcast({ t: 'pdeath', tid: target.id, by: p.id }, null);
            console.log('[mp] ' + p.name + ' убил ' + target.name +
              (kind === 'shot' ? ' (выстрел)' : ' (инструментом)'));
          }
          break;
        }
        /* ✅ v0.4.5: жертва сама сообщает о своей смерти (надёжнее, чем
           выводить по hp=0 у стрелка) — рассылаем остальным */
        case 'pdeath': {
          if (msg.tid === p.id) {
            p.dead = true;
            p.hp = 0;
          }
          broadcast({ t: 'pdeath', tid: String(msg.tid || p.id),
            by: String(msg.by || '') }, p.id);
          break;
        }
        /* ✅ v0.4.5: возрождение — хп восстанавливает СЕРВЕР */
        case 'prespawn': {
          p.dead = false;
          p.hp = 100;
          broadcast({ t: 'prespawn', tid: p.id }, p.id);
          break;
        }
      }
    },
    () => dropSocket(p)
  );

  sock.on('data', (buf) => {
    // ✅ v0.3.4: ЛЮБОЙ пакет (в т.ч. pong от фона) = игрок жив.
    // Раньше фоновая вкладка переставала слать состояния и её выбрасывало
    // по таймауту, хотя она была в игре — счётчик уменьшался зря.
    p.last = Date.now();
    feed(buf);
  });
  sock.on('error', () => dropSocket(p));
  sock.on('close', () => dropSocket(p));

  // ping каждые 25 с — чтобы браузеры не рвали соединение
  const pingTimer = setInterval(() => {
    try { sock.write(Buffer.from([0x89, 0x00])); } catch (e) { clearInterval(pingTimer); }
  }, 25000);
  sock.on('close', () => clearInterval(pingTimer));
  sock.on('error', () => clearInterval(pingTimer));
});

/* таймауты: молчунов выбрасываем из ростера (как в Rust) */
setInterval(() => {
  const now = Date.now();
  const dead = [];
  players.forEach((p) => { if (now - p.last > PLAYER_TIMEOUT) dead.push(p); });
  dead.forEach((p) => dropPlayer(p, 'таймаут'));
}, 5000);

/* ---------- 5. Старт ---------- */

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║   BRIX МУЛЬТИПЛЕЕР — АВТОРИТЕТНЫЙ СЕРВЕР     ║');
  console.log('  ║   Открой в браузере:                         ║');
  console.log('  ║   http://localhost:' + PORT + '                      ║');
  console.log('  ║   (каждое новое окно — новый игрок)          ║');
  console.log('  ║   Остановить: Ctrl+C                         ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
});
