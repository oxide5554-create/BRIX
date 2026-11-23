/* ============================================================
 *  brix • brixpvp-bots.js — СЕРВЕРНЫЙ СИМ БОТОВ «ПОЛИГОНА» (v0.5.7)
 *  ✅ v0.5.7: СТРЕЛЯЮТ СТОЯ — в очереди (burstLeft>0) бот замирает,
 *  стрейф/смена дистанции только в паузах между очередями.
 *  ✅ v0.5.6: ОДНА КАРТА («ПОРТ» удалён) + ЛИДЕРБОРД: победа до 30 →
 *  'blead' (киллы/смерти/КД всех бойцов) 8 с → НОВЫЙ РАУНД (сброс
 *  счёта/статистики, респавн) на той же карте. 'bmap' не шлётся.
 *  ✅ v0.5.2: боты ЛИЦОМ по ходу, НЕРФ; ✅ v0.5.3 магазин/перезарядка.
 *  Подключается ТОЛЬКО в реалме brixpvp (server.js: REALM === 'brixpvp').
 *
 *  Команды: СТАЛЬ (синие, юг, z>0) и ПЛАМЯ (красные, север, z<0).
 *  · на арене всегда 10 бойцов: 5 синих + 5 красных;
 *  · КАЖДЫЙ ИГРОК — синий (СТАЛЬ): при входе игрока СЕРВЕР УБИРАЕТ
 *    одного СИНЕГО бота (синих ботов = 5 − игроки), состав сторон
 *    остаётся 5 на 5; вышел игрок — бот вернулся;
 *  · ИИ ботов авторитетен у сервера: патруль/поиск/бой по нав-графу;
 *  · боты стреляют в БЛИЖАЙШЕГО врага с прямой видимостью, очередями
 *    2–4 патрона, урон 7, магазин 30, перезарядка 2.6 с;
 *  · своих не убивают; phit игрок-в-игрок на арене блокируется;
 *  · ПОБЕДА ДО 30 → ЛИДЕРБОРД → НОВЫЙ РАУНД (v0.5.6).
 *
 *  Протокол (всем):
 *   'bots'   {b: [[i, x, y, z, yaw, st, hp, team, name], ...]}  10 Гц;
 *   'bshot'  {i, f, e}                    выстрел (трассер);
 *   'bdead'  {i, by, hs}                  убит;
 *   'bspawn' {i}                          респавн бота;
 *   'bscore' {blue, red, limit}           счёт команд;
 *   'bwin'   {team, blue, red}            победа до 30;
 *   'blead'  {team, blue, red, dur,
 *             rows:[{id, n, t, k, d}]}    ЛИДЕРБОРД (v0.5.5).
 *  От клиента:
 *   'bhit'   {i, dmg, hs} — урон боту (сервер проверяет дистанцию).
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
/* ✅ v0.5.5: РЕЕСТР КАРТ — общий модуль с клиентом */
const MapData = require('./js/game/arena-mapdata.js');

/* ---------- арена (как в js/game/arena.js) ---------- */
const AY = 3.45;                 // верх пола арены в мировых координатах
const STEP = 0.55, GRAV = 14;
const BOTS_LIMIT = 30;           // победа до 30 килов

/* ✅ v0.5.5: солиды ВСЕХ карт из arena-solids.json (v2: {maps:{id:{solids}}},
   фолбэк на старый формат v1 — только СЕКТОР-9) */
let solidsByMap = {};
try {
  const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'arena-solids.json'), 'utf8'));
  if (j.maps) solidsByMap = j.maps;
  else solidsByMap = { sektor9: { solids: j.solids || [] } };
} catch (e) {
  console.log('[bots] НЕТ arena-solids.json — боты без коллизий: ' + e.message);
}

let curMapId = MapData.ORDER[0];
let SOLIDS = (solidsByMap[curMapId] || {}).solids || [];
let HALF_W = 31, HALF_D = 23;    // габариты ТЕКУЩЕЙ карты (setMap)

function groundAtLocal(x, z, feet) {
  let g = 0;
  for (let i = 0; i < SOLIDS.length; i++) {
    const s = SOLIDS[i];
    if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 && s.y1 <= feet + STEP && s.y1 > g) g = s.y1;
  }
  return g;
}

function resolveXZLocal(e, r, h) {
  for (let i = 0; i < SOLIDS.length; i++) {
    const s = SOLIDS[i];
    if (e.y < s.y1 - STEP && e.y + h > s.y0 + 0.02) {
      if (e.x + r > s.x0 && e.x - r < s.x1 && e.z + r > s.z0 && e.z - r < s.z1) {
        const dxl = e.x + r - s.x0, dxr = s.x1 - (e.x - r);
        const dzl = e.z + r - s.z0, dzr = s.z1 - (e.z - r);
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) e.x = s.x0 - r; else if (m === dxr) e.x = s.x1 + r;
        else if (m === dzl) e.z = s.z0 - r; else e.z = s.z1 + r;
      }
    }
  }
  e.x = Math.max(-HALF_W + r, Math.min(HALF_W - r, e.x));
  e.z = Math.max(-HALF_D + r, Math.min(HALF_D - r, e.z));
}

function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = 0.0001, tmax = 1e9;
  let t1, t2, tt;
  if (Math.abs(dx) < 1e-9) { if (ox < x0 || ox > x1) return -1; }
  else { const inv = 1 / dx; t1 = (x0 - ox) * inv; t2 = (x1 - ox) * inv;
    if (t1 > t2) { tt = t1; t1 = t2; t2 = tt; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1; }
  if (Math.abs(dy) < 1e-9) { if (oy < y0 || oy > y1) return -1; }
  else { const inv = 1 / dy; t1 = (y0 - oy) * inv; t2 = (y1 - oy) * inv;
    if (t1 > t2) { tt = t1; t1 = t2; t2 = tt; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1; }
  if (Math.abs(dz) < 1e-9) { if (oz < z0 || oz > z1) return -1; }
  else { const inv = 1 / dz; t1 = (z0 - oz) * inv; t2 = (z1 - oz) * inv;
    if (t1 > t2) { tt = t1; t1 = t2; t2 = tt; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1; }
  return tmin;
}

function segClearLocal(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  for (let i = 0; i < SOLIDS.length; i++) {
    const s = SOLIDS[i];
    if (s.y1 < Math.min(ay, by) - 0.05) continue;
    const t = rayBox(ax, ay, az, dx, dy, dz, s.x0, s.y0, s.z0, s.x1, s.y1, s.z1);
    if (t >= 0 && t < 0.995) return false;
  }
  return true;
}

function bulletBlockLocal(ox, oy, oz, dx, dy, dz, maxD) {
  let best = -1;
  for (let i = 0; i < SOLIDS.length; i++) {
    const s = SOLIDS[i];
    const t = rayBox(ox, oy, oz, dx, dy, dz, s.x0, s.y0, s.z0, s.x1, s.y1, s.z1);
    if (t >= 0 && (best < 0 || t < best)) best = t;
  }
  if (best >= 0 && maxD && best > maxD) return -1;
  return best;
}

/* ---------- нав-граф (порт из arena.js) ---------- */
const nodes = [], edges = [];
function addNode(x, y, z) { nodes.push({ x: x, y: y, z: z }); edges.push([]); return nodes.length - 1; }
function link(a, b) { if (edges[a].indexOf(b) === -1) { edges[a].push(b); edges[b].push(a); } }

let graphBuilt = false;
function buildGraph() {
  if (graphBuilt || !SOLIDS.length) return;
  graphBuilt = true;
  /* ✅ v0.5.5: сетка по габаритам ТЕКУЩЕЙ карты + нав-зоны из реестра */
  const m = MapData.get(curMapId);
  const nav = m.nav || [];
  const grid = [];
  for (let gx = -(HALF_W - 4); gx <= HALF_W - 4; gx += 4.5)
    for (let gz = -(HALF_D - 4); gz <= HALF_D - 4; gz += 4.75) {
      const g = groundAtLocal(gx, gz, 0);
      let blocked = false;
      for (let i = 0; i < SOLIDS.length; i++) {
        const s = SOLIDS[i];
        if (g < s.y1 - STEP && g + 1.7 > s.y0 + 0.02 &&
            gx + 0.45 > s.x0 && gx - 0.45 < s.x1 && gz + 0.45 > s.z0 && gz - 0.45 < s.z1) { blocked = true; break; }
      }
      if (!blocked) grid.push(addNode(gx, g, gz));
    }
  for (let i2 = 0; i2 < grid.length; i2++) for (let j2 = i2 + 1; j2 < grid.length; j2++) {
    const a = nodes[grid[i2]], b = nodes[grid[j2]];
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d < 6.5 && Math.abs(a.y - b.y) < 0.6 &&
        segClearLocal(a.x, Math.max(a.y, b.y) + 1.05, a.z, b.x, Math.max(a.y, b.y) + 1.05, b.z)) link(grid[i2], grid[j2]);
  }
  /* платформы (plates) — узлы по pts, связаны при видимости */
  const plates = [];
  for (let z1 = 0; z1 < nav.length; z1++) {
    if (!nav[z1].plate) continue;
    const pn = nav[z1].plate;
    const plat = [];
    for (let pp = 0; pp < pn.pts.length; pp++) plat.push(addNode(pn.pts[pp][0], pn.y, pn.pts[pp][1]));
    for (let i3 = 0; i3 < plat.length; i3++) for (let j3 = i3 + 1; j3 < plat.length; j3++) {
      const a2 = nodes[plat[i3]], b2 = nodes[plat[j3]];
      if (segClearLocal(a2.x, pn.y + 1.1, a2.z, b2.x, pn.y + 1.1, b2.z)) link(plat[i3], plat[j3]);
    }
    plates.push(plat);
  }
  /* лестницы (stairs): цепочка ступеней; foot → сетка, конец → plate */
  for (let z2 = 0; z2 < nav.length; z2++) {
    if (!nav[z2].stairs) continue;
    const st = nav[z2].stairs;
    let best = 1e9, foot = -1;
    for (let gi = 0; gi < grid.length; gi++) {
      const n3 = nodes[grid[gi]];
      const d3 = Math.hypot(n3.x - st.foot[0], n3.z - st.foot[1]);
      if (d3 < best) { best = d3; foot = grid[gi]; }
    }
    let prev = foot;
    for (let si = 0; si < st.n; si++) {
      const ni = addNode(st.x + st.dx * (si + 0.5), st.y0 * (si + 1), st.z + st.dz * (si + 0.5));
      link(prev, ni); prev = ni;
    }
    const plate = plates[st.plate] || [];
    let bd2 = 1e9, bi = plate.length ? plate[0] : -1;
    for (let pi = 0; pi < plate.length; pi++) {
      const n4 = nodes[plate[pi]];
      const d4 = Math.hypot(n4.x - nodes[prev].x, n4.z - nodes[prev].z);
      if (d4 < bd2) { bd2 = d4; bi = plate[pi]; }
    }
    if (bi >= 0) link(prev, bi);
  }
}

/* ✅ v0.5.5: СМЕНА КАРТЫ — солиды, габариты, спавны, нав-граф заново */
function setMap(id) {
  const m = MapData.get(id);
  curMapId = m.id;
  SOLIDS = (solidsByMap[m.id] || {}).solids || [];
  HALF_W = m.w / 2; HALF_D = m.d / 2;
  nodes.length = 0; edges.length = 0; graphBuilt = false;
  buildGraph();
  console.log('[bots] карта: ' + m.name + ' — солидов ' + SOLIDS.length +
    ', узлов нав-графа ' + nodes.length);
}

function nearestNode(x, z, y) {
  let best = -1, bd = 1e9;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (Math.abs(n.y - y) > 1.2) continue;
    const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function bfsPath(from, to) {
  if (from < 0 || to < 0) return null;
  if (from === to) return [to];
  const prev = new Int16Array(nodes.length).fill(-1);
  prev[from] = from;
  const q = [from];
  while (q.length) {
    const c = q.shift();
    const nb = edges[c];
    for (let i = 0; i < nb.length; i++) {
      if (prev[nb[i]] !== -1) continue;
      prev[nb[i]] = c;
      if (nb[i] === to) {
        const out = [to];
        let p = to;
        while (p !== from) { p = prev[p]; out.push(p); }
        return out.reverse();
      }
      q.push(nb[i]);
    }
  }
  return null;
}

/* ---------- сим ----------
   ✅ v0.5.2 НЕРФ: боты были слишком сильные (очередь 3–5×11 урона
   каждые 0.7–1.4 с убивала игрока за ~2 с под огнём). Теперь:
   урон 7 (было 11), разброс 0.075 (был 0.05), реакция 0.75 с
   (была 0.45), пауза между очередями 1.5–2.8 с (+30% «наблюдение»
   ×2.2 — боты не стреляют ВСЕГДА), магазин 30 с перезарядкой 2.6 с,
   очередь 2–4,
   темп внутри очереди 0.14 с (был 0.115), скорость 3.2 */
const DIFF = { spread: 0.075, dmg: 7, burst: [2, 4], cool: [1.5, 2.8], react: 0.75, speed: 3.2 };
/* ✅ v0.5.5: спавны ботов — от ТЕКУЩЕЙ карты (реестр) */
function botSpawns(team) {
  return MapData.get(curMapId).botSpawns[team];
}
const TEAM_NAMES = { blue: 'СТАЛЬ', red: 'ПЛАМЯ' };

const bots = [];
let botSeq = 0;
let score = { blue: 0, red: 0 };
let roundOver = 0;      // ms таймер паузы лидерборда (0 — бой идёт)
let api = null;         // { broadcast, players, countInGame }
/* ✅ v0.5.5: статистика матча — ключ 'p'+id игрока / 'b'+i бота */
let stats = new Map();

function statKey(byOrVictim) {
  return byOrVictim.k === 'player' ? 'p' + byOrVictim.id : 'b' + byOrVictim.i;
}
function statOf(key) {
  if (!stats.has(key)) stats.set(key, { n: '', t: 'blue', k: 0, d: 0 });
  return stats.get(key);
}

function rand(a, b) { return a + Math.random() * (b - a); }
function randi(a, b) { return Math.floor(rand(a, b + 1)); }

function aliveBots() { return bots.filter(b => b.state !== 'dead'); }

/** игроки на арене: [{id, name, god, x, y, z, feetY(local)}] в ЛОКАЛЬНЫХ коорд. */
function arenaPlayers() {
  const out = [];
  if (!api) return out;
  api.players.forEach((p) => {
    if (!p.state || p.dead) return;
    const lx = p.state.x, lz = p.state.z;
    if (Math.abs(lx) > HALF_W + 1 || Math.abs(lz) > HALF_D + 1) return;
    out.push({
      ref: p, id: p.id, name: p.name, god: !!p.god, team: 'blue',
      x: lx, y: p.state.y - AY, z: lz
    });
  });
  return out;
}

function makeBot(team, idx) {
  const b = {
    i: botSeq++, team: team, idx: idx,
    name: TEAM_NAMES[team] + '-' + (idx + 1),
    x: 0, y: 0, z: 0, vy: 0, yaw: team === 'red' ? 0 : Math.PI,
    hp: 100, state: 'patrol', st: 0,
    target: null, lastSeen: { x: 0, y: 0, z: 0 }, seenT: -99,
    path: [], thinkT: rand(0, 0.25), repathT: 0, reactT: 0,
    strafeSign: Math.random() < 0.5 ? 1 : -1, strafeT: 0,
    burstLeft: 0, shotT: 0, coolT: rand(0.5, 1.5), lastShotT: 0,
    ammo: 30, reloadT: 0,                       // ✅ v0.5.3: магазин/перезарядка
    spread: DIFF.spread * rand(0.85, 1.2), speed: DIFF.speed * rand(0.92, 1.08),
    deadT: 0, respawnT: 0, stuckT: 0, lastX: 0, lastZ: 0
  };
  spawnBot(b, true);
  return b;
}

function spawnBot(b, first) {
  const enemies = targetsOf(b);
  const SPAWNS = botSpawns(b.team);
  let best = SPAWNS[0], bd = -1;
  for (const sp of SPAWNS) {
    let md = 1e9;
    for (const t of enemies) md = Math.min(md, Math.hypot(sp[0] - t.x, sp[1] - t.z));
    md += rand(0, 4);
    if (md > bd) { bd = md; best = sp; }
  }
  b.x = best[0]; b.z = best[1]; b.y = groundAtLocal(b.x, b.z, 2);
  b.vy = 0; b.hp = 100; b.state = 'patrol'; b.target = null;
  b.path = []; b.deadT = 0; b.respawnT = 0; b.reactT = 0;
  b.ammo = 30; b.reloadT = 0; b.burstLeft = 0;   // ✅ v0.5.3: полный магазин
  b.yaw = b.team === 'red' ? 0 : Math.PI;
  b.st = 0;
  b.lastX = b.x; b.lastZ = b.z;
  if (!first && api) api.broadcast({ t: 'bspawn', i: b.i }, null);
}

/** все живые враги бота: игроки чужой команды + боты чужой команды */
function targetsOf(b) {
  const out = [];
  for (const pl of arenaPlayers()) if (pl.team !== b.team) out.push(pl);
  for (const ob of bots) {
    if (ob === b || ob.team === b.team || ob.state === 'dead') continue;
    out.push({ kind: 'bot', id: ob.i, name: ob.name, team: ob.team, x: ob.x, y: ob.y, z: ob.z, bot: ob });
  }
  return out;
}

function botThink(b, dt) {
  const fy = b.y + 1.6;
  let bestT = null, bestD = 1e9;
  const list = targetsOf(b);
  for (const t of list) {
    const d = Math.hypot(t.x - b.x, t.z - b.z);
    if (d > 40 || d >= bestD) continue;
    const cy = (t.y !== undefined ? t.y : 0) + 1.25;
    if (segClearLocal(b.x, fy, b.z, t.x, cy, t.z)) { bestT = t; bestD = d; }
  }
  if (bestT) {
    if (!b.target || b.target.id !== bestT.id) b.reactT = DIFF.react * rand(0.8, 1.3);
    b.target = bestT; b.los = true; b.state = 'engage';
    b.lastSeen = { x: bestT.x, y: bestT.y, z: bestT.z }; b.seenT = Date.now() / 1000;
    return;
  }
  b.los = false;
  if (b.target && Date.now() / 1000 - b.seenT < 4) b.state = 'seek';
  else { b.target = null; b.state = 'patrol'; }
  if (b.state === 'seek') {
    b.repathT -= dt;
    if (b.repathT <= 0 || !b.path.length) {
      b.repathT = 1.2;
      b.path = bfsPath(nearestNode(b.x, b.z, b.y), nearestNode(b.lastSeen.x, b.lastSeen.z, 0)) || [];
    }
  } else if (b.state === 'patrol') {
    if (!b.path.length && Math.random() < 0.5)
      b.path = bfsPath(nearestNode(b.x, b.z, b.y), randi(0, nodes.length - 1)) || [];
  } else if (b.state === 'engage' && b.target) {
    const d2 = Math.hypot(b.target.x - b.x, b.target.z - b.z);
    if (d2 > 19) {
      b.repathT -= dt;
      if (b.repathT <= 0 || !b.path.length) {
        b.repathT = 1.2;
        b.path = bfsPath(nearestNode(b.x, b.z, b.y), nearestNode(b.target.x, b.target.z, 0)) || [];
      }
    } else b.path = [];
  }
}

/** выстрел бота: ближайший враг по лучу с разбросом; стены перекрывают */
function botShoot(b, dt) {
  const t = b.target;
  if (!t) return;
  const mx = b.x, my = b.y + 1.45, mz = b.z;
  // ствол смотрит на грудь цели (до 1.25 локально)
  let dx = t.x - mx, dy = (t.y + 1.25) - my, dz = t.z - mz;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  const spread = b.spread + dist * 0.0007;
  dx /= dist; dy /= dist; dz /= dist;
  // конус разброса (перпендикулярный базис)
  const rx = -dz, rz = dx;                     // горизонтальный перпендикуляр
  const a = rand(0, Math.PI * 2), rr = spread * Math.sqrt(Math.random());
  dx += Math.cos(a) * rr * rx; dz += Math.sin(a) * rr * rx; dy += Math.sin(a) * rr * rz * 0.4;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  dx /= len; dy /= len; dz /= len;

  const wallT = bulletBlockLocal(mx, my, mz, dx, dy, dz, 80);
  const wallDist = wallT >= 0 ? wallT : 80;

  // жертвы: игроки чужой команды + боты чужой команды (своих не задеваем)
  let hit = null;
  for (const pl of arenaPlayers()) {
    if (pl.team === b.team) continue;
    if (pl.god) continue;
    const tt = rayBox(mx, my, mz, dx, dy, dz,
      pl.x - 0.32, pl.y, pl.z - 0.32, pl.x + 0.32, pl.y + 1.78, pl.z + 0.32);
    if (tt >= 0 && tt < wallDist && (!hit || tt < hit.d))
      hit = { d: tt, kind: 'player', pl: pl };
  }
  for (const ob of bots) {
    if (ob === b || ob.team === b.team || ob.state === 'dead') continue;
    const tt = rayBox(mx, my, mz, dx, dy, dz,
      ob.x - 0.3, ob.y, ob.z - 0.24, ob.x + 0.3, ob.y + 1.85, ob.z + 0.24);
    if (tt >= 0 && tt < wallDist && (!hit || tt < hit.d))
      hit = { d: tt, kind: 'bot', bot: ob };
  }

  const fly = hit ? hit.d : wallDist;
  const ex = mx + dx * fly, ey = my + dy * fly, ez = mz + dz * fly;
  if (api) api.broadcast({ t: 'bshot', i: b.i, f: [mx, my + AY, mz], e: [ex, ey + AY, ez] }, null);
  b.lastShotT = 0.18;                          // ст об 4 (shoot) для клиентов

  if (!hit) return;
  if (hit.kind === 'player') {
    const p = hit.pl.ref;
    p.hp = Math.max(0, (p.hp === undefined ? 100 : p.hp) - DIFF.dmg);
    /* ✅ v0.5.2: bk:'bot' — жертва на клиенте отличает урон ОТ БОТА
       (разрешён) от урона ИГРОК-ПО-ИГРОКУ (на арене блокируется) */
    api.broadcast({ t: 'phit', tid: p.id, hp: Math.round(p.hp),
      by: b.name, bk: 'bot', kind: 'shot', w: 'ak' }, null);
    if (p.hp <= 0) {
      p.dead = true;
      api.broadcast({ t: 'pdeath', tid: p.id, by: b.name }, null);
      addKill('red', { k: 'bot', i: b.i, n: b.name },
        { k: 'player', id: p.id, n: p.name }, false);
      console.log('[bots] ' + b.name + ' убил игрока ' + p.name);
    }
  } else {
    const ob = hit.bot;
    ob.hp -= DIFF.dmg;
    if (ob.hp <= 0) killBot(ob, { k: 'bot', i: b.i, n: b.name }, false);
    else ob.lastSeen = { x: b.x, y: b.y, z: b.z };
  }
}

function killBot(b, by, hs) {
  b.state = 'dead';
  b.deadT = 0; b.respawnT = 5;
  b.st = 5;
  addKill(by.k === 'player' ? 'blue' : (by.i !== undefined ? teamOfBotIdx(by.i) : 'blue'),
    by, { k: 'bot', i: b.i, n: b.name }, hs);
  api.broadcast({ t: 'bdead', i: b.i, by: by, hs: hs ? 1 : 0 }, null);
  console.log('[bots] ' + b.name + ' убит — счёт СТАЛЬ ' + score.blue + ' : ' + score.red + ' ПЛАМЯ');
}

function teamOfBotIdx(i) {
  for (const b of bots) if (b.i === i) return b.team;
  return 'blue';
}

/** сборка строк лидерборда: все живые участники матча (игроки + боты) */
function leaderboardRows() {
  const out = [];
  /* игроки: имя из api.players даже если статов нет (0/0) */
  if (api) {
    api.players.forEach((p) => {
      const st = stats.get('p' + p.id);
      out.push({ id: String(p.id), n: p.name, t: 'blue',
        k: st ? st.k : 0, d: st ? st.d : 0 });
    });
  }
  for (const b of bots) {
    const st = stats.get('b' + b.i);
    out.push({ id: 'b' + b.i, n: b.name, t: b.team,
      k: st ? st.k : 0, d: st ? st.d : 0 });
  }
  out.sort((a, b) => b.k - a.k || a.d - b.d);
  return out;
}

function addKill(team, by, victim, hs) {
  if (roundOver) return;
  score[team]++;
  /* ✅ v0.5.5: статистика матча (киллы стрелку, смерти жертве) */
  const ks = statOf(statKey(by));
  ks.k++;
  const ds = statOf(statKey(victim));
  ds.d++;
  if (api) api.broadcast({ t: 'bscore', blue: score.blue, red: score.red, limit: BOTS_LIMIT }, null);
  if (score[team] >= BOTS_LIMIT) {
    roundOver = 8;                            // 8 с лидерборда, потом НОВЫЙ РАУНД
    if (api) {
      api.broadcast({ t: 'bwin', team: team, blue: score.blue, red: score.red }, null);
      /* ✅ ЛИДЕРБОРД: rows — {id, n, t, k, d}; КД клиент считает сам.
         ✅ v0.5.6: СМЕНЫ КАРТЫ НЕТ (карта одна) — next не шлём */
      api.broadcast({
        t: 'blead', team: team, blue: score.blue, red: score.red, dur: 8,
        rows: leaderboardRows().slice(0, 12)
      }, null);
      api.broadcast({ t: 'atoast',
        m: 'ПОБЕДА: ' + TEAM_NAMES[team] + ' ' + score.blue + ':' + score.red +
           ' — лидерборд, новый раунд через 8 с' }, null);
    }
    console.log('[bots] ПОБЕДА команды ' + TEAM_NAMES[team] + ' ' + score.blue + ':' +
      score.red + ' → лидерборд 8 с → новый раунд');
  }
}

/** сколько ботов каждой команды нужно при N игроках (все игроки — СТАЛЬ) */
function wantedBots(nPlayers) {
  const blue = Math.max(0, 5 - nPlayers);
  const total = Math.max(0, 10 - nPlayers);
  const red = Math.min(5, total - blue);
  return { blue: blue, red: red };
}

function reconcile() {
  const n = api ? api.countInGame() : 0;
  const want = wantedBots(n);
  const have = { blue: 0, red: 0 };
  bots.forEach(b => { if (b.state !== 'dead') have[b.team]++; else have[b.team] += 0; });
  const totalHave = { blue: 0, red: 0 };
  bots.forEach(b => totalHave[b.team]++);
  if (totalHave.blue === want.blue && totalHave.red === want.red) return;
  // лишние: сначала резервных синих (место заняли игроки), потом красных
  while (totalHave.blue > want.blue) {
    const idx = bots.findIndex(b => b.team === 'blue');
    if (idx < 0) break;
    bots.splice(idx, 1);
    totalHave.blue--;
  }
  while (totalHave.red > want.red) {
    const idx = bots.findIndex(b => b.team === 'red');
    if (idx < 0) break;
    bots.splice(idx, 1);
    totalHave.red--;
  }
  let bi = 0, ri = 0;
  bots.forEach(b => { if (b.team === 'blue') b.idx = bi++; else b.idx = ri++; });
  while (totalHave.blue < want.blue) { bots.push(makeBot('blue', totalHave.blue++)); }
  while (totalHave.red < want.red) { bots.push(makeBot('red', totalHave.red++)); }
  bi = 0; ri = 0;
  bots.forEach(b => { if (b.team === 'blue') b.idx = bi++; else b.idx = ri++; });
  if (api) console.log('[bots] состав: СТАЛЬ ботов ' + want.blue + ' + игроков ' + n +
    ' против ПЛАМЯ ' + want.red);
}

function step(dt) {
  // пауза лидерборда: боты стоят, потом НОВЫЙ РАУНД (✅ v0.5.6 — без смены карты)
  if (roundOver) {
    roundOver -= dt;
    if (roundOver <= 0) {
      roundOver = 0;
      score = { blue: 0, red: 0 };
      stats = new Map();                      // статистика нового матча
      bots.forEach(b => { b.hp = 100; b.state = 'patrol'; b.st = 0; spawnBot(b, true); });
      if (api) {
        api.broadcast({ t: 'bscore', blue: 0, red: 0, limit: BOTS_LIMIT }, null);
        api.broadcast({ t: 'atoast', m: 'НОВЫЙ РАУНД — счёт 0:0, до ' +
          BOTS_LIMIT + ' килов' }, null);
      }
      console.log('[bots] новый раунд: счёт 0:0, боты на спавнах');
    }
    return;
  }
  reconcile();
  const playersList = arenaPlayers();
  for (const b of bots) {
    if (b.state === 'dead') {
      b.deadT += dt; b.respawnT -= dt;
      if (b.respawnT <= 0) spawnBot(b, false);
      continue;
    }
    b.thinkT -= dt;
    if (b.thinkT <= 0) { b.thinkT = 0.22; botThink(b, dt); }

    let wx = 0, wz = 0, spd = b.speed;
    if (b.state === 'engage' && b.target && b.los && !b.path.length) {
      /* ✅ v0.5.7: СТРЕЛЯЕТ СТОЯ — пока идёт очередь (burstLeft>0) бот
         замирает на месте; стрейф и смена дистанции — только в паузах
         между очередями (по просьбе: «стреляют и потом двигаются») */
      if (b.burstLeft <= 0) {
        const t = b.target;
        const dx = t.x - b.x, dz = t.z - b.z, d = Math.hypot(dx, dz) || 1;
        b.strafeT -= dt;
        if (b.strafeT <= 0) { b.strafeT = rand(0.7, 1.6); b.strafeSign *= -1; }
        const pxv = -dz / d * b.strafeSign, pzv = dx / d * b.strafeSign;
        const rangeErr = Math.max(-1, Math.min(1, (d - 11) * 0.14));
        wx = pxv * 0.8 + dx / d * rangeErr; wz = pzv * 0.8 + dz / d * rangeErr;
        spd = b.speed * 0.8;
      }
    } else if (b.path.length) {
      const n = nodes[b.path[0]];
      const ddx = n.x - b.x, ddz = n.z - b.z, dd = Math.hypot(ddx, ddz);
      if (dd < 0.85) b.path.shift();
      else { wx = ddx / dd; wz = ddz / dd; }
      if (b.state === 'patrol') spd = b.speed * 0.62;
    }

    const wl = Math.hypot(wx, wz);
    if (wl > 0.01) { wx /= wl; wz /= wl; }
    b.x += wx * spd * dt; b.z += wz * spd * dt;
    const e = { x: b.x, y: b.y, z: b.z };
    resolveXZLocal(e, 0.35, 1.7);
    b.x = e.x; b.z = e.z;
    b.vy -= GRAV * dt; b.y += b.vy * dt;
    const gr = groundAtLocal(b.x, b.z, b.y + Math.max(0, -b.vy * dt));
    if (b.y <= gr) { b.y = gr; b.vy = 0; }

    // застрял — случайный маршрут
    b.stuckT += dt;
    if (b.stuckT > 0.7) {
      const moved = Math.hypot(b.x - b.lastX, b.z - b.lastZ);
      if (moved < 0.12 && wl > 0.01) {
        b.path = bfsPath(nearestNode(b.x, b.z, b.y), randi(0, nodes.length - 1)) || [];
        b.strafeSign *= -1;
      }
      b.lastX = b.x; b.lastZ = b.z; b.stuckT = 0;
    }

    // поворот к цели/движению. ✅ v0.5.2: БЕЗ отрицаний — модель смотрит
    // ЛИЦОМ (+Z) по направлению движения/цели. Раньше было atan2(-dx,-dz):
    // +Z смотрел НАЗАД — боты бегали «спиной вперёд»
    let targetYaw = b.yaw;
    if (b.state === 'engage' && b.target)
      targetYaw = Math.atan2(b.target.x - b.x, b.target.z - b.z);
    else if (wl > 0.01) targetYaw = Math.atan2(wx, wz);
    let dy = targetYaw - b.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    b.yaw += dy * Math.min(1, 10 * dt);

    // огонь. ✅ v0.5.3: магазин 30 → ПЕРЕЗАРЯДКА 2.6 с (st=6, клиенты
    // показывают позу перезарядки). Боты НЕ СТРЕЛЯЮТ ВСЕГДА: длиннее
    // пауза между очередями и 30% «наблюдение» — вдвое дольше держат
    // цель в прицеле, не открывая огонь
    b.reactT -= dt; b.shotT -= dt; b.coolT -= dt; b.lastShotT -= dt;
    if (b.reloadT > 0) {
      b.reloadT -= dt;
      if (b.reloadT <= 0) { b.reloadT = 0; b.ammo = 30; }
    } else if (b.state === 'engage' && b.target && b.los && b.reactT <= 0) {
      if (b.burstLeft > 0) {
        if (b.shotT <= 0) {
          b.shotT = 0.14; b.burstLeft--;
          if (b.ammo > 0) { b.ammo--; botShoot(b, dt); }
          if (b.ammo <= 0) { b.reloadT = 2.6; b.burstLeft = 0; }
        }
      } else if (b.coolT <= 0) {
        b.burstLeft = randi(DIFF.burst[0], DIFF.burst[1]);
        b.coolT = rand(DIFF.cool[0], DIFF.cool[1]);
        if (Math.random() < 0.3) b.coolT *= 2.2;    // «наблюдает»
      }
    }

    // состояние для клиентов (анимации): 0 idle, 1 walk, 2 run, 3 aim,
    // 4 shoot, 5 dead, ✅ v0.5.3: 6 reload
    if (b.reloadT > 0) b.st = 6;
    else if (b.lastShotT > 0) b.st = 4;
    else if (b.state === 'engage') b.st = 3;
    else if (spd > 3.05 && wl > 0.01) b.st = 2;
    else if (wl > 0.01) b.st = 1;
    else b.st = 0;
  }
  void playersList;
}

/* ---------- публичный API ---------- */
module.exports.init = function (opts) {
  api = opts;
  setMap(MapData.ORDER[0]);                   // ✅ v0.5.5: первая карта из реестра
  reconcile();
  /* ✅ ТЕСТОВЫЙ хук (только с BRIX_TEST=1): SIGUSR2 = досимулировать
     киллы синих до лимита — для автотеста ротации карт */
  if (process.env.BRIX_TEST) {
    process.on('SIGUSR2', function () {
      if (roundOver) return;
      console.log('[bots] TEST: форс победы СТАЛИ');
      let guard = 0;
      while (score.blue < BOTS_LIMIT && guard++ < 40)
        addKill('blue', { k: 'bot', i: -1, n: 'ТЕСТ' },
          { k: 'bot', i: -2, n: 'ТЕСТ-жертва' }, false);
    });
  }
  console.log('[bots] сим «ПОЛИГОНА» запущен: карта ' + MapData.get(curMapId).name +
    ', солидов ' + SOLIDS.length + ', узлов нав-графа ' + nodes.length);
};

/** снапшот для welcome нового игрока */
module.exports.snapshot = function () {
  return {
    team: 'blue', limit: BOTS_LIMIT,
    map: curMapId,                            // ✅ v0.5.5: карта для клиента
    mapName: MapData.get(curMapId).name,
    blue: score.blue, red: score.red,
    b: encodeBots()
  };
};

function encodeBots() {
  const out = [];
  for (const b of bots) {
    /* [0]=i, [1..3]=xyz (МИР), [4]=yaw, [5]=st, [6]=hp, [7]=команда,
       [8]=имя (иконка над ботом) */
    out.push([b.i,
      +b.x.toFixed(2), +(b.y + AY).toFixed(2), +b.z.toFixed(2),
      +b.yaw.toFixed(2), b.st, Math.max(0, Math.round(b.hp)),
      b.team === 'blue' ? 'b' : 'r', b.name]);
  }
  return out;
}

/** тик 10 Гц: шаг сима + рассылка состояний */
module.exports.tick = function (dt) {
  if (!api) return;
  step(dt);
  if (api.players.size) {
    api.broadcast({ t: 'bots', b: encodeBots() }, null);
  }
};

/** выстрел игрока по боту: свои защищены, дистанция и потолок урона */
module.exports.handleBhit = function (p, msg) {
  if (!p.state) return null;
  const i = Number(msg.i);
  const b = bots.find(x => x.i === i);
  if (!b || b.state === 'dead') return null;
  /* ✅ СВОИХ НЕ УБИВАЕМ: игрок — СТАЛЬ (синие), урон синим ботам
     игнорируется полностью (защита и от читов, и от ошибок клиента) */
  if (b.team === 'blue') return null;
  const lx = p.state.x, lz = p.state.z;
  const d2 = (lx - b.x) * (lx - b.x) + (lz - b.z) * (lz - b.z);
  if (d2 > 90 * 90) return null;               // дальше 90 м — чит
  const dmg = Math.max(0, Math.min(35, Number(msg.dmg) || 0));
  if (!dmg) return null;
  b.hp -= dmg;
  b.lastSeen = { x: lx, y: p.state.y - AY, z: lz }; b.seenT = Date.now() / 1000;
  if (b.target === null || b.target === undefined) { b.state = 'seek'; b.repathT = 0; }
  if (b.hp <= 0 && b.state !== 'dead') {
    killBot(b, { k: 'player', id: p.id, n: p.name }, !!msg.hs);
    /* ✅ v0.5.3: килл подтверждён — игрок может забрать награду
       (полные патроны у клиента + полное хп через 'kreward') */
    p.lastRewardAt = Date.now();
  }
  return { t: 'bupd', i: b.i, hp: Math.max(0, Math.round(b.hp)) };
};
