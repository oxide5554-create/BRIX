/* ============================================================
 *  brix • server.js — АВТОРИТЕТНЫЙ СЕРВЕР МУЛЬТИПЛЕЕРА (v0.4.7)
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

/* ✅ v0.4.17: версия СЕРВЕРА — едет в welcome.sv и /status. Клиент по ней
   видит: подключился ли он вообще к НОВОМУ серверу (старый server.js
   версии не присылает — и панель на 9 молчит). В консоли при старте
   печатается ПОЛНЫЙ ПУТЬ папки сервера — чтобы admins.json правился
   именно там, где сервер РЕАЛЬНО запущен */
const SRV_VER = '0.4.17';
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
      names: names, map: 'Brixland',
      /* ✅ v0.4.17: диагностика панели разработчика — открой в браузере
         http://<адрес>:8787/status и видно: версию сервера, ПАПКУ,
         откуда он запущен, и какие ID он считает админами */
      ver: SRV_VER, folder: ROOT, adminIds: Array.from(ADMIN_AIDS)
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
   ✅ v0.4.7 ПОСТРОЙКИ: фундаменты/стены/потолки живут В ПАМЯТИ СЕРВЕРА
   (worldObjs.builds) независимо от игроков: когда на сервере 0 игроков,
   дом никуда не девается; новый игрок получает весь дом в welcome
   (objs.bd); файл пишется через 800 мс после изменения, КАЖДЫЕ 20 с
   для надёжности и при остановке сервера (Ctrl+C) — ничего не теряется.
   «Перезагрузил игру — ресурсы те же» работает, потому что состояние
   вообще не у клиента: клиент при входе получает снимок сервера */
const OBJS_FILE = path.join(ROOT, 'world-objs.json');
/* ✅ v0.4.14: поколение мира дублируем в отдельный файл world-epoch.json.
   Если world-objs.json потерялся/удалили вручную — эпоха выживает, и
   сервер НЕ примет старые бэкапы браузеров («воскресшие 32 постройки
   из бэка» после ручной чистки). Пишется при каждом сохранении мира,
   читается при старте (в т.ч. для свежего мира) */
const EPOCH_FILE = path.join(ROOT, 'world-epoch.json');

function readEpochSidecar() {
  try {
    let raw = fs.readFileSync(EPOCH_FILE, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    return (JSON.parse(raw).ep) | 0;
  } catch (e) { return 0; }
}

function writeEpochSidecar(ep) {
  try { fs.writeFileSync(EPOCH_FILE, JSON.stringify({ ep: ep | 0 })); }
  catch (e) { /* не критично: эпоха остаётся и в world-objs.json */ }
}

/* ============================================================
   ✅ v0.4.15 АДМИН-ПАНЕЛЬ РАЗРАБОТЧИКА (клавиша 9, только у владельца
   сервера). Администратор определяется ПО BRIX-ID АККАУНТА (aid из
   hello) — ник подделать легко, а ID живёт в localStorage игрока.
   Сервер проверяет КАЖДУЮ команду (клиентский флаг — только для UI).

   Команды (t:'admin', op:…):
     wipebuilds — удалить ВСЕ постройки + поднять поколение (bwipe всем);
     tp {x,z}   — телепорт СЕБЯ на координаты;
     tpto {tid} — телепорт СЕБЯ к игроку;
     bring {tid}— телепорт ИГРОКА к себе;
     ban {tid}  — забанить аккаунт (bans.json, персистентно) и кикнуть;
     respawn    — мгновенный респавн ВСЕХ ящиков и бочек с новым лутом;
     cleardrops — убрать все выпавшие предметы (дропы) с сервера.

   Бесконечное ХП — сервер НЕ применяет урон к админу (case 'phit').
   Открытие любых замков — server обходит проверку кода (case 'btog').
   ============================================================ */
const ADMIN_AIDS = new Set([
  'BRIX-GH6ZGS'          // ← ID разработчика (владелец сервера)
]);

/* ✅ v0.4.16: СВОЙ список админов — файл admins.json рядом с server.js.
   Не надо больше править server.js! Формат файла:
       ["BRIX-A1B2C3", "BRIX-XXXXXX"]
   Как узнать свой BRIX-ID (любой из трёх способов):
     1) нажать 9 в игре — подсказка на экране покажет ТВОЙ ID;
     2) консоль сервера: при входе каждого игрока печатается его ID;
     3) мини-меню (M) → список игроков → своя строка, там ID.
   Файл создаётся автоматически, если его нет. Изменения — после
   ПЕРЕЗАПУСКА сервера. Панель (клавиша 9) откроется только у тех,
   чей ID есть в этом списке (или встроен выше) */
const ADMINS_FILE = path.join(ROOT, 'admins.json');
if (!fs.existsSync(ADMINS_FILE)) {
  try { fs.writeFileSync(ADMINS_FILE, JSON.stringify([], null, 2)); }
  catch (e) { console.log('[admin] не создал admins.json: ' + e.message); }
}
try {
  const rawA = fs.readFileSync(ADMINS_FILE, 'utf8');
  const jA = JSON.parse(rawA.charCodeAt(0) === 0xFEFF ? rawA.slice(1) : rawA);
  if (Array.isArray(jA)) jA.forEach((id) => {
    const s = String(id || '').trim();
    if (s) ADMIN_AIDS.add(s.slice(0, 16));
  });
  console.log('[admin] админы по ID: ' + Array.from(ADMIN_AIDS).join(', '));
  console.log('[start] BRIX сервер v' + SRV_VER + ' · папка сервера: ' + ROOT);
  console.log('[start] admins.json правится ИМЕННО в этой папке, потом перезапуск сервера');
} catch (e) {
  console.log('[admin] admins.json не прочитан (' + e.message +
    ') — работает только встроенный ID');
}
function isAdminP(p) {
  return !!(p && p.aid && ADMIN_AIDS.has(p.aid));
}

/* БАН-ЛИСТ: bans.json рядом с server.js — переживает перезапуск.
   Формат: [{ key, n, aid, by, at }] — key = BRIX-ID или 'n:Ник'
   (для игроков без аккаунта). Пишется при каждом бане */
const BANS_FILE = path.join(ROOT, 'bans.json');
let bans = [];
try {
  const rawB = fs.readFileSync(BANS_FILE, 'utf8');
  const jB = JSON.parse(rawB.charCodeAt(0) === 0xFEFF ? rawB.slice(1) : rawB);
  if (Array.isArray(jB)) bans = jB.filter((b) => b && b.key);
} catch (e) { bans = []; }

function saveBans() {
  try { fs.writeFileSync(BANS_FILE, JSON.stringify(bans)); }
  catch (e) { console.log('[admin] не сохранил bans.json: ' + e.message); }
}

function isBanned(aid, name) {
  const nk = 'n:' + String(name || '');
  return bans.some((b) =>
    (aid && b.key === aid) || (name && b.key === nk));
}

let saveTimer = null;
let worldDirty = false;          // ✅ v0.4.7: есть несохранённые изменения

function writeWorldNow() {
  try {
    const data = {
      v: 4,
      dropSeq: worldObjs.dropSeq,
      cb: worldObjs.cb.map((c) => ({
        id: c.id, x: c.x, z: c.z, rot: c.rot, item: c.item, seed: c.seed, mil: c.mil,
        taken: c.taken, gone: c.gone, loot: c.loot,
        barrels: c.barrels.map((b) => ({ id: b.id, lx: b.lx, lz: b.lz, wy: b.wy,
          lying: b.lying, hp: b.hp, brk: b.brk }))
      })),
      drops: Array.from(worldObjs.drops.values()),
      // ✅ v0.4.6/0.4.7: ПОСТРОЙКИ (фундаменты/стены/потолки) — переживают
      //    перезапуск сервера, как и весь остальной мир
      builds: worldObjs.builds,
      epoch: worldObjs.epoch | 0   // ✅ v0.4.13: поколение мира
    };
    fs.writeFileSync(OBJS_FILE, JSON.stringify(data));
    writeEpochSidecar(worldObjs.epoch | 0);   // ✅ v0.4.14: дубль поколения
    worldDirty = false;
  } catch (e) { console.log('[objs] не сохранил мир: ' + e.message); }
}

function markDirty() {
  worldDirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writeWorldNow();
  }, 800);
}

/* ✅ v0.4.7: страховые сохранения — каждые 20 с, если что-то менялось,
   и гарантированная запись при остановке сервера (Ctrl+C / kill).
   Постройки не теряются, даже если сервер убили сразу после bplace */
setInterval(() => { if (worldDirty) writeWorldNow(); }, 20000);
function saveOnExit() {
  try { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } writeWorldNow(); } catch (e) {}
}
process.on('SIGINT', () => { saveOnExit(); process.exit(0); });
process.on('SIGTERM', () => { saveOnExit(); process.exit(0); });
process.on('exit', () => { try { saveOnExit(); } catch (e) {} });

function freshWorldObjs() {
  const cb = buildCheckblockLayout(OBJ_SEED);
  cb.forEach((c) => { c.gone = false; c.loot = rollLoot(c.mil); });
  /* ✅ v0.4.13: epoch — поколение мира. CLEAR-BUILDS.bat повышает его
     в world-objs.json; если клиент приносит бэкап из СТАРОГО поколения
     (до очистки) — сервер НЕ принимает его назад, а клиент сам чистит
     свой localStorage. ✅ v0.4.14: свежий мир помнит поколение через
     world-epoch.json, поэтому потеря файла больше НЕ сбрасывает эпоху */
  return { cb, drops: new Map(), dropSeq: 0, builds: [],
    /* ✅ v0.4.14: свежий мир ВСЁ РАВНО помнит поколение (сайдкар) —
       старые бэкапы браузеров не примутся даже после потери файла */
    epoch: readEpochSidecar() };
}

function loadWorldObjs() {
  try {
    if (!fs.existsSync(OBJS_FILE)) return null;
    const j = JSON.parse(fs.readFileSync(OBJS_FILE, 'utf8'));
    // ✅ v0.4.6: v3 (старый файл без построек) читаем и апгрейдим до v4
    if (!j || (j.v !== 3 && j.v !== 4) || !Array.isArray(j.cb)) return null;
    const drops = new Map();
    (j.drops || []).forEach((d) => { if (d && d.id) drops.set(d.id, d); });
    const builds = Array.isArray(j.builds) ? j.builds.filter((b) =>
      b && (b.ty === 'f' || b.ty === 'w' || b.ty === 'c' ||
            b.ty === 'wi' || b.ty === 'dw' || b.ty === 'dr') &&
      Number.isFinite(b.gx) && Number.isFinite(b.gz) && Number.isFinite(b.top)) : [];
    return { cb: j.cb, drops, dropSeq: j.dropSeq || 0, builds,
      /* ✅ v0.4.14: берём МАКСИМУМ из файла и сайдкара — откат файла
         в прошлое поколение невозможен */
      epoch: Math.max(j.epoch | 0, readEpochSidecar()) };   // ✅ v0.4.13: поколение мира
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

/* ============================================================
   ✅ v0.4.6 СТРОИТЕЛЬСТВО (как в Rust: план строителя)
   - фундамент: клетка сетки 3×3 м, ставится на 4 ноги, следует
     рельефу (высоту считает КЛИЕНТ — рельеф у всех одинаковый,
     детерминированный noise); рядом с фундаментом МАГНИТИТСЯ
     по его высоте (клиент шлёт готовую высоту соседа)
   - стена: ставится на ОДИН из 4 КРАЁВ фундамента; сервер
     проверяет, что фундамент существует, и берёт высоту ИЗ него
   - потолок: накрывает клетку, у которой ЕСТЬ СТЕНА; высота —
     тоже из фундамента сервера
   Канонизация краёв (важно для дедупликации): у клетки 4 края,
   но южный край = северный край клетки сверху, восточный =
   западный клетки правее. Поэтому каждая стена хранится один раз:
   ключ (gx, gz, e), e ∈ {0: северный, 3: западный}. */
const CELL = 3;               // размер клетки сетки, м
const WALL_H = 3;             // высота стены, м
function canonicalEdge(gx, gz, e) {
  if (e === 2) return { gx: gx, gz: gz + 1, e: 0 };   // южный край клетки → северный край клетки (gz+1)
  if (e === 1) return { gx: gx + 1, gz: gz, e: 3 };   // восточный край клетки → западный край клетки (gx+1)
  return { gx: gx, gz: gz, e: (e === 3 ? 3 : 0) };
}
/* индексы построек: клетка -> запись (фундамент/потолок), край -> стена/
   окно/проём/дверь (✅ v0.4.10) */
const buildCell = new Map();   // 'gx,gz' -> {f: rec, c: rec}
const buildEdge = new Map();   // 'gx,gz,e' -> rec краевой детали
worldObjs.builds.forEach((b) => {
  if (b.ty === 'w' || b.ty === 'wi' || b.ty === 'dw' || b.ty === 'dr') {
    const ce = canonicalEdge(b.gx, b.gz, b.e);
    b.gx = ce.gx; b.gz = ce.gz; b.e = ce.e;
    buildEdge.set(b.gx + ',' + b.gz + ',' + b.e, b);
  } else {
    const key = b.gx + ',' + b.gz;
    if (!buildCell.has(key)) buildCell.set(key, {});
    buildCell.get(key)[b.ty === 'f' ? 'f' : 'c'] = b;
  }
});
let buildSeq = worldObjs.builds.reduce((m, b) => Math.max(m, Number(String(b.id).slice(1)) || 0), 0);

function hasWallOnCell(gx, gz) {
  return !!(buildEdge.get(gx + ',' + gz + ',0') || buildEdge.get(gx + ',' + gz + ',3') ||
            buildEdge.get(gx + ',' + (gz + 1) + ',0') || buildEdge.get((gx + 1) + ',' + gz + ',3'));
}

/* ✅ v0.4.10: публичная копия постройки — БЕЗ кода замка и списка
   разгадавших: код НИКОГДА не покидает сервер (в bnew/welcome едет
   только «есть код» hc и владелец own) */
function publicBuild(b) {
  const out = { id: b.id, ty: b.ty, gx: b.gx, gz: b.gz, top: b.top,
    by: b.by, at: b.at };
  if (b.e !== undefined) out.e = b.e;
  if (b.ty === 'dr') {
    out.open = b.open ? 1 : 0;
    out.hc = (b.code && String(b.code).length === 4) ? 1 : 0;
    out.own = b.own || '';
  }
  return out;
}

/** АВТОРИТЕТНАЯ установка постройки. Возвращает {b} или строку-причину отказа.
    ✅ v0.4.12 «НА СТАРЫЕ ФУНДАМЕНТЫ НЕЛЬЗЯ СТРОИТЬ»: клиент теперь шлёт
    ТОЧКУ ПРИЦЕЛА (px, pz — мировые координаты, куда смотрел луч). Сервер
    САМ находит клетку и край по точке, координаты клетки от клиента —
    только резерв. Любое расхождение координат «клиент/сервер» (старые
    фундаменты из прошлых версий, перенос папки, бэкап) больше не мешает:
    под лучом в радиусе клетки фундамент есть — стройка разрешена */
function applyPlace(p, msg) {
  const ty = String(msg.ty || '');
  let gx = Math.round(Number(msg.gx) | 0);
  let gz = Math.round(Number(msg.gz) | 0);
  if (!Number.isFinite(gx) || !Number.isFinite(gz)) return 'bad';
  /* точка прицела (клиент v0.4.12+). Резать по 5000 — защита от мусора */
  let px = Number(msg.px), pz = Number(msg.pz);
  const hasPt = Number.isFinite(px) && Number.isFinite(pz) &&
    Math.abs(px) <= 5000 && Math.abs(pz) <= 5000;
  const now = Date.now();
  if (p.lastPlace && now - p.lastPlace < 200) return 'spam';   // не чаще 5/с
  p.lastPlace = now;

  /* клетка под точкой прицела */
  const ptx = hasPt ? Math.round(px / CELL) : null;
  const ptz = hasPt ? Math.round(pz / CELL) : null;
  function cellHasF(cx, cz) {
    const c = buildCell.get(cx + ',' + cz);
    return !!(c && c.f);
  }
  /* выбрать якорную клетку. Порядок:
     1) клетка от КЛИЕНТА — она точная, когда луч попал в палубу или стену
        (клиент берёт её из userData меша, не «угадывает»);
     2) клетка под ТОЧКОЙ ПРИЦЕЛА — лечит «старые фундаменты»: даже если
        координаты клетки у клиента разъехались, фундамент под лучом
        найдётся;
     3) 4 соседа точки прицела (луч в самый край палубы). */
  function anchorFor() {
    if (cellHasF(gx, gz)) return { gx: gx, gz: gz };
    if (ptx !== null && cellHasF(ptx, ptz)) return { gx: ptx, gz: ptz };
    if (ptx !== null) {
      const nb = [[ptx + 1, ptz], [ptx - 1, ptz], [ptx, ptz + 1], [ptx, ptz - 1]];
      for (let i = 0; i < nb.length; i++) {
        if (cellHasF(nb[i][0], nb[i][1])) return { gx: nb[i][0], gz: nb[i][1] };
      }
    }
    return null;
  }

  if (ty === 'f') {
    const key = gx + ',' + gz;
    const cell = buildCell.get(key);
    if (cell && cell.f) return 'busy';
    // высоту палубы даёт клиент (рельеф детерминированный и одинаков у всех);
    // соседние фундаменты клиент уже сам «примагнитил» по высоте соседа
    const top = Math.max(-20, Math.min(300, Number(msg.top) || 0));
    const rec = { id: 'b' + (++buildSeq), ty: 'f', gx, gz, top,
      by: p.name, at: now };
    worldObjs.builds.push(rec);
    if (!buildCell.has(key)) buildCell.set(key, {});
    buildCell.get(key).f = rec;
    markDirty();
    console.log('[build] ' + p.name + ' поставил ФУНДАМЕНТ (' + gx + ',' + gz +
      ') высота ' + top.toFixed(1));
    return { b: publicBuild(rec) };
  }

  if (ty === 'w' || ty === 'wi' || ty === 'dw') {
    /* клетка-якорь: та, где стоит фундамент. v0.4.12: берём её ПО ТОЧКЕ
       ПРИЦЕЛА (сервер главнее), координаты клиента — только резерв */
    const an = anchorFor();
    if (!an) return 'nofound';                        // фундамента нет нигде рядом
    gx = an.gx; gz = an.gz;
    const key = gx + ',' + gz;
    const cell = buildCell.get(key);
    /* край: куда от центра клетки смещена точка прицела — та же формула,
       что у клиента (planOnEdge), поэтому призрак и сервер ВСЕГДА
       согласованы. Клиентский e используется только если луч попал
       точно в центр клетки (формула вырождается) */
    let e;
    if (hasPt) {
      const dx = px - gx * CELL, dz = pz - gz * CELL;
      if (Math.abs(dx) < 0.05 && Math.abs(dz) < 0.05) {
        e = Math.max(0, Math.min(3, Number(msg.e) | 0));
      } else {
        e = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 1 : 3) : (dz > 0 ? 2 : 0);
      }
    } else {
      e = Math.max(0, Math.min(3, Number(msg.e) | 0));
    }
    // Дедупликация — по ФИЗИЧЕСКОМУ краю: канонический ключ одинаков
    // для «юг клетки A» и «север клетки B», постройка не задвоится
    const ce = canonicalEdge(gx, gz, e);
    const ekey = ce.gx + ',' + ce.gz + ',' + ce.e;
    const exist = buildEdge.get(ekey);
    if (ty === 'w') {
      if (exist) return 'busy';                       // край занят
    } else {
      // окно/проём встают ВМЕТО обычной стены (замена); на крае с
      // окном/проёмом/дверью — нельзя
      if (exist && exist.ty !== 'w') return 'busy';
    }
    const rec = { id: 'b' + (++buildSeq), ty, gx: gx, gz: gz, e: e,
      top: cell.f.top,                // ВЫСОТА ИЗ ФУНДАМЕНТА СЕРВЕРА — у всех одинаково
      by: p.name, at: now };
    /* замена (окно/проём вместо стены): старая запись УХОДИТ ИЗ МИРА —
       иначе при рестарте stale-стена снова занимала бы край */
    if (exist) {
      const oi = worldObjs.builds.indexOf(exist);
      if (oi >= 0) worldObjs.builds.splice(oi, 1);
    }
    worldObjs.builds.push(rec);
    buildEdge.set(ekey, rec);
    markDirty();
    console.log('[build] ' + p.name + ' поставил ' +
      ({ w: 'СТЕНУ', wi: 'ОКНО', dw: 'ДВЕРНОЙ ПРОЁМ' }[ty] || ty) +
      ' (' + gx + ',' + gz + ', край ' + e + ') на фундамент ' + key +
      (exist ? ' — вместо ' + exist.id : ''));
    if (exist) return { b: publicBuild(rec), old: exist.id };   // замена стены
    return { b: publicBuild(rec) };
  }

  if (ty === 'dr') {
    /* дверь — в ДВЕРНОЙ ПРОЁМ. v0.4.12: проём ищем по точке прицела
       (ближайший dw-край), координаты клиента — резерв */
    let dwRec = null, dwKey = null;
    if (hasPt) {
      const half = CELL / 2;
      let bestD = 2.2;
      buildEdge.forEach((b2, k2) => {
        if (b2.ty !== 'dw') return;
        const cx = b2.gx * CELL + (b2.e === 1 ? half : b2.e === 3 ? -half : 0);
        const cz = b2.gz * CELL + (b2.e === 2 ? half : b2.e === 0 ? -half : 0);
        const d = Math.hypot(px - cx, pz - cz);
        if (d < bestD) { bestD = d; dwRec = b2; dwKey = k2; }
      });
    }
    if (!dwRec) {
      const e0 = Math.max(0, Math.min(3, Number(msg.e) | 0));
      const ce0 = canonicalEdge(gx, gz, e0);
      const k0 = ce0.gx + ',' + ce0.gz + ',' + ce0.e;
      const b0 = buildEdge.get(k0);
      if (b0 && b0.ty === 'dw') { dwRec = b0; dwKey = k0; }
    }
    if (!dwRec) return 'nodw';                        // дверного проёма нет
    const rec = { id: 'b' + (++buildSeq), ty: 'dr',
      gx: dwRec.gx, gz: dwRec.gz, e: dwRec.e, top: dwRec.top,
      by: p.name, at: now,
      own: p.aid || ('n:' + p.name),  // владелец — BRIX-ID (ник для гостей)
      open: 0, code: null, unl: {} };
    /* проём УХОДИТ ИЗ МИРА (замена dw → dr), иначе при рестарте рама
       вернулась бы на край и дверь «потерялась» */
    const dwIdx = worldObjs.builds.indexOf(dwRec);
    if (dwIdx >= 0) worldObjs.builds.splice(dwIdx, 1);
    worldObjs.builds.push(rec);
    buildEdge.set(dwRec.gx + ',' + dwRec.gz + ',' + dwRec.e, rec);
    markDirty();
    console.log('[build] ' + p.name + ' поставил ДВЕРЬ (' + dwRec.gx + ',' +
      dwRec.gz + ', край ' + dwRec.e + ') в проём — владелец ' + rec.own);
    return { b: publicBuild(rec), old: dwRec.id };
  }

  if (ty === 'c') {
    /* потолок — над клеткой с фундаментом И стеной. v0.4.12: клетку берём
       по точке прицела, клиентские координаты — резерв */
    const an = anchorFor();
    if (!an) return 'nofound';
    gx = an.gx; gz = an.gz;
    const key = gx + ',' + gz;
    const cell = buildCell.get(key);
    if (cell.c) return 'busy';
    if (!hasWallOnCell(gx, gz)) return 'nowall';      // потолок требует СТЕНУ
    const rec = { id: 'b' + (++buildSeq), ty: 'c', gx, gz,
      top: Math.round((cell.f.top + WALL_H) * 100) / 100,   // низ потолка = верх фундамента + стена
      by: p.name, at: now };
    worldObjs.builds.push(rec);
    cell.c = rec;
    markDirty();
    console.log('[build] ' + p.name + ' поставил ПОТОЛОК (' + gx + ',' + gz +
      ') на высоте ' + rec.top.toFixed(1));
    return { b: publicBuild(rec) };
  }

  return 'bad';
}

/* мировые координаты бочки: локальные (lx, lz) внутри чекблока + поворот */
function barrelWorld(c, b) {
  const cos = Math.cos(c.rot), sin = Math.sin(c.rot);
  return {
    x: Math.round((c.x + b.lx * cos + b.lz * sin) * 10) / 10,
    z: Math.round((c.z - b.lx * sin + b.lz * cos) * 10) / 10
  };
}

function objsSnapshot(p) {
  return {
    cb: worldObjs.cb.map((c) => ({
      id: c.id, x: c.x, z: c.z, rot: c.rot, item: c.item, seed: c.seed, mil: c.mil,
      taken: c.taken, gone: c.gone, loot: c.loot,
      bar: c.barrels.map((b) => ({ id: b.id, lx: b.lx, lz: b.lz, wy: b.wy,
        lying: b.lying, hp: b.hp, brk: b.brk }))
    })),
    dr: Array.from(worldObjs.drops.values()).map((d) =>
      ({ id: d.id, kind: d.kind, x: d.x, z: d.z, amt: d.amt })),
/* ✅ v0.4.10: постройки в снапшоте — новый игрок сразу видит дом
   (даже если на сервере сейчас 0 игроков: builds живёт в памяти сервера).
   publicBuild: код замка не уходит клиенту; dunl — какие замки этот
   игрок УЖЕ РАЗГАДАЛ (после перезахода код заново не спрашивается).
   ✅ v0.4.13: ep — поколение мира; клиент хранит его в бэкапе и
   присылает обратно в badopt: устаревший бэкап (до ОЧИСТКИ) сервер
   отвергает и отправляет клиенту bwipe — дом убирается и у него */
    bd: worldObjs.builds.map(publicBuild),
    ep: worldObjs.epoch | 0,
    dunl: (p && worldObjs.builds.some((b) => b.ty === 'dr'))
      ? worldObjs.builds
          /* ✅ fix 0.4.11: «разгаданность» узнаётся в ОБОИХ формах ключа —
             BRIX-ID и старый «n:ник» — после перезахода код заново
             не спрашивается */
          .filter((b) => b.ty === 'dr' && b.code && b.unl &&
            ((p.aid && b.unl[p.aid]) || b.unl['n:' + p.name]))
          .map((b) => b.id)
      : []
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

/* ============================================================
   ✅ v0.4.15: обработка админ-команд. КАЖДАЯ проверяет isAdminP —
   подделать команду со стороны клиента бесполезно
   ============================================================ */
function adminOp(p, msg) {
  const op = String(msg.op || '');
  if (!isAdminP(p)) {
    p.send({ t: 'adeny', op });
    console.log('[admin] ОТКАЗ (' + op + '): ' + p.name +
      ' не администратор (aid=' + (p.aid || 'нет') + ')');
    return;
  }
  switch (op) {
    /* удалить ВСЕ постройки: + поколение, bwipe всем (дома уберутся
       сами, бэкапы старого поколения сервер больше не примет) */
    case 'wipebuilds': {
      const n = worldObjs.builds.length;
      worldObjs.builds = [];
      buildCell.clear();
      buildEdge.clear();
      worldObjs.epoch = Math.max(worldObjs.epoch | 0, readEpochSidecar()) + 1;
      writeEpochSidecar(worldObjs.epoch);
      writeWorldNow();
      broadcast({ t: 'bwipe', ep: worldObjs.epoch | 0 }, null);
      p.send({ t: 'aok', op, info: 'Удалено построек: ' + n +
        ' · поколение мира: ' + worldObjs.epoch });
      console.log('[admin] ' + p.name + ' удалил все постройки (' + n +
        '), epoch=' + worldObjs.epoch);
      break;
    }
    /* телепорт СЕБЯ на координаты (кламп — не выйти за край мира) */
    case 'tp': {
      const x = Math.max(-800, Math.min(800, Number(msg.x) || 0));
      const z = Math.max(-800, Math.min(800, Number(msg.z) || 0));
      if (p.state) { p.state.x = x; p.state.z = z; p.state.a = 'idle'; }
      p.send({ t: 'atp', x, z });
      console.log('[admin] ' + p.name + ' телепортировался на ' + x + ' : ' + z);
      break;
    }
    /* телепорт СЕБЯ к игроку */
    case 'tpto': {
      const target = players.get(String(msg.tid || ''));
      if (!target || !target.state) { p.send({ t: 'aok', op, info: 'Игрок не найден или ещё в меню' }); break; }
      const x = Math.round(target.state.x * 10) / 10;
      const z = Math.round(target.state.z * 10) / 10;
      if (p.state) { p.state.x = x; p.state.z = z; p.state.a = 'idle'; }
      p.send({ t: 'atp', x, z });
      console.log('[admin] ' + p.name + ' телепортировался к ' + target.name + ' (' + x + ' : ' + z + ')');
      break;
    }
    /* телепорт ИГРОКА к себе */
    case 'bring': {
      const target = players.get(String(msg.tid || ''));
      if (!target || !target.state) { p.send({ t: 'aok', op, info: 'Игрок не найден или ещё в меню' }); break; }
      if (!p.state) { p.send({ t: 'aok', op, info: 'Сначала выйди в игру — тебя не видно серверу' }); break; }
      const x = Math.round(p.state.x * 10) / 10;
      const z = Math.round(p.state.z * 10) / 10;
      target.state.x = x; target.state.z = z; target.state.a = 'idle';
      target.send({ t: 'atp', x, z, by: p.name });
      p.send({ t: 'aok', op, info: 'Игрок ' + target.name + ' перемещён к тебе' });
      console.log('[admin] ' + p.name + ' переместил ' + target.name + ' к себе (' + x + ' : ' + z + ')');
      break;
    }
    /* забанить аккаунт (персистентно в bans.json) и кикнуть прямо сейчас */
    case 'ban': {
      const target = players.get(String(msg.tid || ''));
      if (!target) { p.send({ t: 'aok', op, info: 'Игрок не найден' }); break; }
      if (isAdminP(target)) { p.send({ t: 'aok', op, info: 'Администратора забанить нельзя' }); break; }
      const key = target.aid || ('n:' + target.name);
      if (!bans.some((b) => b.key === key)) {
        bans.push({ key, n: target.name, aid: target.aid || '',
          by: p.name, at: Date.now() });
        saveBans();
      }
      target.send({ t: 'banned', by: p.name });
      dropPlayer(target, 'забанен ' + p.name);
      p.send({ t: 'aok', op, info: 'Забанен: ' + target.name +
        (target.aid ? ' (' + target.aid + ')' : ' (без аккаунта, по нику)') });
      console.log('[admin] ' + p.name + ' забанил ' + target.name +
        ' (key=' + key + ', всего банов: ' + bans.length + ')');
      break;
    }
    /* мгновенный респавн ВСЕХ ящиков и бочек: лут перебрасывается заново,
       сломанные бочки встают — и у ВСЕХ игроков сразу */
    case 'respawn': {
      let nc = 0, nb = 0;
      worldObjs.cb.forEach((c) => {
        c.gone = false; c.taken = false;
        c.loot = rollLoot(c.mil);
        broadcast({ t: 'cbrespawn', id: c.id, loot: c.loot, mil: c.mil }, null);
        nc++;
        c.barrels.forEach((b) => {
          if (!b.brk) return;
          b.brk = false; b.hp = 2;
          broadcast({ t: 'brespawn', id: b.id, hp: 2 }, null);
          nb++;
        });
      });
      markDirty();
      writeWorldNow();
      p.send({ t: 'aok', op, info: 'Ящиков вернул: ' + nc + ' · бочек вернул: ' + nb });
      console.log('[admin] ' + p.name + ' заспавнил ящики/бочки (' + nc + '/' + nb + ')');
      break;
    }
    /* убрать все выпавшие предметы (дропы) с земли */
    case 'cleardrops': {
      const nd = worldObjs.drops.size;
      worldObjs.drops.clear();
      writeWorldNow();
      broadcast({ t: 'dclr' }, null);
      p.send({ t: 'aok', op, info: 'Убрано дропов: ' + nd });
      console.log('[admin] ' + p.name + ' убрал дропы (' + nd + ')');
      break;
    }
    default:
      p.send({ t: 'adeny', op, why: 'unknown' });
  }
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
        const aidCand = String(msg.aid || '').slice(0, 16);
        const nameCand = String(msg.n || '').slice(0, 16);
        /* ✅ v0.4.15: бан-лист ПЕРЕД регистрацией — забаненный не войдёт */
        if (isBanned(aidCand, nameCand)) {
          try {
            sock.write(wsEncodeText(JSON.stringify(
              { t: 'banned' })));
          } catch (e) {}
          try { sock.destroy(); } catch (e) {}
          console.log('[admin] отказано в входе (забанен): ' +
            nameCand + ' (aid=' + (aidCand || 'нет') + ')');
          return;
        }
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
          ver: 49,               // ✅ v0.4.12: геометрическая привязка (px/pz), добор (badopt)
          /* ✅ v0.4.17: sv — версия СЕРВЕРА (клиент отличит новый сервер
             от старого), adm — подтвердил ли сервер ЭТОГО игрока админом
             (для диагностики; панель включается по adminon) */
          sv: SRV_VER,
          adm: isAdminP(p) ? 1 : 0,
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
      /* ✅ v0.4.10: постройки — публичные копии без кода замка,
         dunl — замки, которые ЭТОТ игрок уже разгадал */
          objs: objsSnapshot(p)   // ✅ v0.3.6: бочки/чекблоки/дропы (авторитет сервера)
        });
        // ✅ v0.4.3: в join едет lvl/aid — у всех игроков список полный сразу
        broadcast({ t: 'join', id: p.id, n: p.name, c: p.c,
          lvl: p.lvl || 1, aid: p.aid || '' }, p.id);
        /* ✅ v0.4.16: BRIX-ID КАЖДОГО вошедшего — в консоли сервера.
           Так владелец узнаёт свой ID, чтобы вписать его в admins.json */
        console.log('[mp] ' + p.name + ' (' + p.id + ', BRIX-ID: ' +
          (p.aid || 'нет') + ') вошёл (игроков: ' + players.size + ')' +
          (isAdminP(p) ? ' — АДМИН' : ''));
        // ✅ v0.4.15: админу — отдельное подтверждение (клиент включает панель на 9)
        if (isAdminP(p)) p.send({ t: 'adminon' });
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
        /* ✅ v0.4.15 АДМИН-ПАНЕЛЬ: все команды разработчика (см. adminOp) */
        case 'admin':
          adminOp(p, msg);
          break;
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
          /* ✅ v0.4.15: у админа БЕСКОНЕЧНОЕ ХП — сервер не применяет урон,
             полоска не падает и у стрелка не показывается */
          if (isAdminP(target)) break;
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
        /* ✅ v0.4.6 СТРОИТЕЛЬСТВО: заявка установки (фундамент/стена/потолок).
           Сервер проверяет правила (стена — только на край фундамента,
           потолок — только где есть стена) и рассылает результат ВСЕМ,
           включая поставившего (тот уже поставил у себя оптимистично —
           повтор не задвоится: ключ клетки/края тот же) */
        case 'bplace': {
          const res = applyPlace(p, msg);
          if (res && res.b) {
            // ✅ v0.4.10: замена (стена→окно/проём, проём→дверь) —
            // сначала всем снос старой детали, потом новая постройка
            if (res.old) broadcast({ t: 'brem', id: res.old }, null);
            broadcast({ t: 'bnew', pid: p.id, b: res.b }, null);
            // ✅ v0.4.9: постройка пишется на диск СРАЗУ (не через дебаунс
            // 800 мс) — даже kill -9 сразу после установки ничего не теряет
            writeWorldNow();
          } else {
            p.send({ t: 'bdeny', tid: msg.tid || '', why: res || 'bad' });
          }
          break;
        }
        /* ✅ v0.4.10 ДВЕРЬ (F): открыть/закрыть. Решает СЕРВЕР: чужой
           закрытый замок не откроет; владелец и разгадавшие — могут */
        case 'btog': {
          const d = worldObjs.builds.find((b) => b.id === String(msg.id || '') && b.ty === 'dr');
          if (!d) break;
          /* ✅ fix 0.4.11: владелец узнаётся в ОБОИХ формах ключа — новый
             BRIX-ID и старый «n:ник» (двери из прошлых сессий, когда
             клиент ещё не слал aid). Раньше после появления ID сервер
             отказывал СОБСТВЕННИКУ в открытии его двери */
          const ownT = (d.own === p.aid) || (d.own === ('n:' + p.name));
          const unlT = d.unl && ((p.aid && d.unl[p.aid]) || d.unl['n:' + p.name]);
          /* ✅ v0.4.15: админ открывает ЛЮБУЮ дверь, даже с чужим кодом */
          if (d.code && !ownT && !unlT && !isAdminP(p)) {
            p.send({ t: 'bdeny-d', id: d.id });   // чужой и не разгадал
            break;
          }
          d.open = d.open ? 0 : 1;
          broadcast({ t: 'bdoor', id: d.id, open: d.open }, null);
          markDirty();
          writeWorldNow();
          console.log('[build] ' + p.name + ' ' + (d.open ? 'открыл' : 'закрыл') + ' дверь ' + d.id);
          break;
        }
        /* ✅ v0.4.10: ВЛАДЕЛЕЦ задаёт/меняет код (4 цифры). Смена кода
           сбрасывает «разгаданность» у ВСЕХ — лампа горит красным */
        case 'bcode': {
          const d = worldObjs.builds.find((b) => b.id === String(msg.id || '') && b.ty === 'dr');
          if (!d) break;
          /* ✅ fix 0.4.11: код ставит владелец — в ОБОИХ формах ключа */
          if (!((d.own === p.aid) || (d.own === ('n:' + p.name)))) break;
          const code = String(msg.code || '').replace(/\D/g, '').slice(0, 4);
          if (code.length !== 4) break;
          d.code = code;
          d.unl = {};                            // все вводят заново
          broadcast({ t: 'block', id: d.id, hc: 1 }, null);
          markDirty();
          writeWorldNow();
          console.log('[build] ' + p.name + ' задал код замка ' + d.id);
          break;
        }
        /* ✅ v0.4.10: ЧУЖОЙ вводит код. Верный → игрок навсегда вписывается
           в «разгадавшие» (живёт на сервере по BRIX-ID), дверь открывается;
           неверный → bcodedeny */
        case 'btry': {
          const d = worldObjs.builds.find((b) => b.id === String(msg.id || '') && b.ty === 'dr');
          if (!d) break;
          /* ✅ fix 0.4.11: «разгаданность» пишем под СТАБИЛЬНЫМ ключом
             (BRIX-ID), но узнаём и по старому «n:ник» — после перезахода
             код заново НЕ спрашивается, даже если ключ поменялся */
          const code = String(msg.code || '').replace(/\D/g, '').slice(0, 4);
          if (!d.code || code !== d.code) {
            p.send({ t: 'bcodedeny', id: d.id });
            break;
          }
          if (!d.unl) d.unl = {};
          const unlKey = p.aid || ('n:' + p.name);
          d.unl[unlKey] = 1;
          if (p.aid) d.unl['n:' + p.name] = 1;   // совместимость со старыми ключами
          d.open = 1;
          broadcast({ t: 'bdoor', id: d.id, open: 1 }, null);
          p.send({ t: 'dunl', id: d.id });
          markDirty();
          writeWorldNow();
          console.log('[build] ' + p.name + ' разгадал код замка ' + d.id + ' — дверь открыта');
          break;
        }
        /* ✅ v0.4.11 ДОБОР ПОСТРОЕК: клиент при входе прислал записи с
           ЛОКАЛЬНЫМ id («L…») — сервер их НИКОГДА не подтверждал. Так
           бывает, когда сервер потерял world-objs.json (перенос папки,
           сбой): дом у игрока ВИДЕН из бэкапа, но сервер отказывает в
           каждой стене («нет фундамента»). Сервер добирает свободные
           клетки/края (сервер ГЛАВНЕЕ: занятые пропускаются), рассылает
           bnew всем и сразу пишет на диск */
        case 'badopt': {
          /* ✅ v0.4.13: ЗАЩИТА ОТ ВОСКРЕШЕНИЯ ОЧИЩЕННЫХ ПОСТРОЕК.
             Клиент хранит бэкап построек в localStorage и при входе
             предлагает его серверу (badopt). Если бэкап из СТАРОГО
             поколения мира (msg.ep меньше текущего epoch, повышаемого
             CLEAR-BUILDS.bat) — сервер отказывает и шлёт bwipe:
             клиент сам выкидывает устаревшие постройки из бэкапа.
             epoch=0 на сервере (свежий мир после сбоя) — добор работает
             как раньше, «спасение» дома при потере файла не тронуто */
          const clEp = Math.round(Number(msg.ep)) | 0;
          const svEp = worldObjs.epoch | 0;
          if (svEp > 0 && clEp < svEp) {
            p.send({ t: 'bwipe', ep: svEp });
            console.log('[build] отклонил устаревший бэкап ' + p.name +
              ' (бэкап epoch ' + clEp + ', мир epoch ' + svEp +
              ' — постройки были очищены)');
            break;
          }
          const list = Array.isArray(msg.list) ? msg.list.slice(0, 400) : [];
          if (!list.length) break;
          /* ✅ порядок добора: сначала фундаменты, потом краевые детали,
             потом потолки — СТРОГО (нельзя order[ty] || 9: ноль «фундамент»
             фальсив и улетал в конец — дверь добиралась раньше фундамента
             и отбрасывалась как «без фундамента») */
          const order = { f: 0, w: 1, wi: 1, dw: 1, dr: 1, c: 2 };
          const rank = (ty) => Object.prototype.hasOwnProperty.call(order, ty) ? order[ty] : 9;
          list.sort((a, b2) => rank(a.ty) - rank(b2.ty));
          let adopted = 0;
          for (const raw of list) {
            const ty2 = String(raw.ty || '');
            const gx2 = Math.round(Number(raw.gx) | 0);
            const gz2 = Math.round(Number(raw.gz) | 0);
            if (!Number.isFinite(gx2) || !Number.isFinite(gz2)) continue;
            const top2 = Math.max(-20, Math.min(300, Number(raw.top) || 0));
            const by2 = String(raw.by || p.name).slice(0, 16);
            const now2 = Date.now();
            if (ty2 === 'f') {
              const key2 = gx2 + ',' + gz2;
              const cell2 = buildCell.get(key2);
              if (cell2 && cell2.f) continue;           // сервер уже знает
              const rec2 = { id: 'b' + (++buildSeq), ty: 'f', gx: gx2, gz: gz2,
                top: top2, by: by2, at: now2 };
              worldObjs.builds.push(rec2);
              if (!buildCell.has(key2)) buildCell.set(key2, {});
              buildCell.get(key2).f = rec2;
              broadcast({ t: 'bnew', pid: p.id, b: publicBuild(rec2) }, null);
              adopted++;
            } else if (ty2 === 'w' || ty2 === 'wi' || ty2 === 'dw' || ty2 === 'dr') {
              const e2 = Math.max(0, Math.min(3, Number(raw.e) | 0));
              const ce2 = canonicalEdge(gx2, gz2, e2);
              const ekey2 = ce2.gx + ',' + ce2.gz + ',' + ce2.e;
              if (buildEdge.has(ekey2)) continue;       // край занят — сервер главнее
              const cell3 = buildCell.get(gx2 + ',' + gz2);
              if (!cell3 || !cell3.f) continue;         // фундамента нет — не принимаем
              const rec3 = ty2 === 'dr'
                ? { id: 'b' + (++buildSeq), ty: 'dr', gx: gx2, gz: gz2, e: e2,
                    top: cell3.f.top, by: by2, at: now2,
                    own: String(raw.own || p.aid || ('n:' + p.name)).slice(0, 32),
                    open: raw.open ? 1 : 0, code: null, unl: {} }
                : { id: 'b' + (++buildSeq), ty: ty2, gx: gx2, gz: gz2, e: e2,
                    top: cell3.f.top, by: by2, at: now2 };
              worldObjs.builds.push(rec3);
              buildEdge.set(ekey2, rec3);
              broadcast({ t: 'bnew', pid: p.id, b: publicBuild(rec3) }, null);
              adopted++;
            } else if (ty2 === 'c') {
              const key3 = gx2 + ',' + gz2;
              const cell4 = buildCell.get(key3);
              if (!cell4 || !cell4.f) continue;
              if (cell4.c) continue;
              if (!hasWallOnCell(gx2, gz2)) continue;
              const rec4 = { id: 'b' + (++buildSeq), ty: 'c', gx: gx2, gz: gz2,
                top: Math.round((cell4.f.top + WALL_H) * 100) / 100,
                by: by2, at: now2 };
              worldObjs.builds.push(rec4);
              cell4.c = rec4;
              broadcast({ t: 'bnew', pid: p.id, b: publicBuild(rec4) }, null);
              adopted++;
            }
          }
          if (adopted > 0) {
            markDirty();
            writeWorldNow();
            console.log('[build] добрал ' + adopted + ' постр. из бэкапа ' + p.name +
              ' (прислано ' + list.length + ')');
          }
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
