/* ============================================================
 *  brix • brix-airdrop.js — СЕРВЕРНЫЙ СИМ АИРДРОПА (v0.5.20)
 *  Подключается ТОЛЬКО в реалме brixland (server.js: REALM === 'brixland').
 *
 *  ✈ САМОЛЁТ:
 *  • раз в 30 МИНУТ (или по команде админа op:'airdrop') вылетает
 *    транспорт: старт ЗА краем острова (радиус ~680 м от центра),
 *    случайная хорда — из 14 попыток выбирается та, у которой
 *    БОЛЬШЕ СУШИ вдоль пути (море = heightAt < 2.4);
 *  • высота = максимальный рельеф вдоль пути + 42 м (не цепляет
 *    горы, полёт ПЛАВНЫЙ: постоянная скорость 26 м/с, без рывков);
 *  • СБРАСЫВАЕТ 1–3 ЯЩИКА (шансы 35/40/25%) в точках ВДОЛЬ ПУТИ
 *    по сухой земле, между точками минимум 90 м — два дропа в одном
 *    месте исключены; сбросив груз, летит ДАЛЬше в том же
 *    направлении и исчезает за краем карты;
 *  • ОПТИМИЗАЦИЯ СЕТИ: положение самолёта НЕ шлётся каждый кадр.
 *    Клиент сам «докручивает» полёт (постоянные скорость/курс), сервер
 *    только: 1 пакет 'plane' на вылет + 'planeS' якорь раз в 2 с
 *    (клиент плавно подтягивается) + 'planeGone'. Ящики: 'adNew' при
 *    сбросе, 'adLand' при касании, 'adGone' когда опустел.
 *
 *  📦 ЯЩИК (аирдроп):
 *  • падает с парашютом МЕДЛЕННО (5.5 м/с, v0.5.20), сброс — ТОЛЬКО
 *    когда самолёт долетел до точки (CHORD_START + d); ПРИЗЕМЛЯЕТСЯ
 *    на первое, чего коснётся:
 *     земля/горы, ФУНДАМЕНТ и ПОТОЛОК (крыша) построек, насыпь чекблока
 *     (surfaceAt в server.js: рельеф + клетки f/c + чекблоки);
 *  • ЛУТ ХРАНИТСЯ НА СЕРВЕРЕ (worldObjs.adrops, world-objs.json v8):
 *    виден тем, кто зашёл ПОСЛЕ падения и ВО ВРЕМЯ падения; лут
 *    «очень неплохой» — военный+ (калаш/томпсон/дробовик/С4/порох…);
 *  • F у ящика → 'adOpen' (ответ 'adLoot'); взять — 'adTake'
 *    (оптимистично у клиента, сервер — авторитет, всем 'adLoot');
 *  • ПУСТОЙ ящик убирается ('adGone'), сервер пишет на диск сразу.
 *  • ✅ v0.5.21: УПАВШИЙ ящик, который НИКТО НЕ ЗАЛУТАЛ, через
 *    20 МИНУТ (ADROP_LIFE_MS) исчезает сам: таймер с момента касания
 *    земли (lt в world-objs.json — переживает рестарт сервера);
 *    пустым ящикам неважно — они убираются сразу при опустении.
 *
 *  Протокол (всем): 'plane' {x,y,z,dx,dz,sp,age}, 'planeS' {x,y,z},
 *   'planeGone', 'adNew' {id,x,y,z,st,fall,inv,mags}, 'adLand' {id,y},
 *   'adGone' {id}, 'adLoot' {id,inv,mags[,pid,tid,item,amt]}, 'adDeny'.
 *  От клиента: 'adOpen' {id}, 'adTake' {id,item,amt,tid}.
 * ============================================================ */
'use strict';

const WATER_MIN = 2.4;        // суше этой высоты (уровень моря 2.2 + запас)
/* ✅ v0.5.25: мир 2000x2000 м (было 900) — хорда самолёта длиннее,
   чтобы старт/исчезновение были ЗА краем новой карты */
const ISLAND_R = 1000;        // половина мира (WORLD_HALF, terrain.js)
const CHORD_START = 1150;     // старт самолёта от центра (за краем)
const CHORD_END = 2600;       // где исчезает (улетел в том же направлении)
const PLANE_SP = 26;          // скорость самолёта, м/с (~94 км/ч)
const FALL_SP = 5.5;          // ✅ v0.5.20 скорость падения ящика, м/с (медленнее — просили)
const ADROP_MAX = 30;         // страховка: не больше 30 ящиков в мире
const AUTO_MS = 30 * 60 * 1000;   // ✈ каждые 30 минут
const ADROP_LIFE_MS = 20 * 60 * 1000;  // ✅ v0.5.21: упал и не залутан — через 20 мин исчезает

let api = null;               // { broadcast, players, worldObjs, heightAt,
                              //  surfaceAt, markDirty, writeWorldNow }
let plane = null;             // { sx, sz, y, dx, dz, sp, born, dist,
                              //   drops: [{d, x, z}], di, syncT }
let planeTick = 0;

function log(s) { console.log('[air] ' + s); }

/* ---------- ЛУТ v0.5.24: ГАРАНТИРОВАННАЯ C4 В ПЕРВОМ ЯЩИКЕ.
   База — всегда, дальше РОЗЫГРЫШ: повезёт (50%) — военная часть
   (корпус АК/С4/шприц), не повезёт — скромный добор (труба/пружина).
   Ствол максимум один (50%), обойма НЕ ПОЛНАЯ — 10 патронов ---------- */
function rollAirdropLoot(forceC4) {
  const r = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  const loot = { scrap: r(6, 16), metal: r(4, 10), gunpowder: r(5, 14),
    ammo: r(4, 12) };
  if (Math.random() < 0.5) {
    /* ПОВЕЗЁТ: военная часть */
    if (Math.random() < 0.6) loot.rifleBody = 1;      // корпус АК
    if (Math.random() < 0.4) loot.c4 = 1;
    if (Math.random() < 0.5) loot.syringe = 1;
    if (Math.random() < 0.3) loot.berdanaBody = 1;
  } else {
    /* НЕ ПОВЕЗЁТ: скромный добор */
    if (Math.random() < 0.5) loot.pipe = r(1, 2);
    if (Math.random() < 0.4) loot.spring = r(1, 2);
    if (Math.random() < 0.15) loot.berdanaBody = 1;
  }
  /* ✅ v0.5.24 (просьба игрока): в первом ящике ОБЯЗАТЕЛЬНО есть C4 —
     объявление в чат честно пишет «АИРДРОП ВЫЛЕТЕЛ С C4» */
  if (forceC4) loot.c4 = 1;
  /* СТВОЛ: максимум один из пула; обойма частичная — «чуть-чуть» */
  const guns = ['rifleAk', 'thompson', 'shotgun', 'rev3x', 'mace'];
  const MAGS = { rifleAk: 10, thompson: 10, shotgun: 2, rev3x: 2, mace: 0 };
  const mags = {};
  if (Math.random() < 0.5) {
    const g = guns[Math.floor(Math.random() * guns.length)];
    loot[g] = 1;
    if (MAGS[g]) mags[g] = [MAGS[g]];
  }
  if (Math.random() < 0.15) loot.revolver = 1;
  return { loot: loot, mags: mags };
}

/* ---------- ПОВЕРХНОСТЬ ДЛЯ ПРИЗЕМЛЕНИЯ — считает server.js ---------- */
function surfaceY(x, z) { return api ? api.surfaceAt(x, z) : 0; }
function hAt(x, z) { return api ? api.heightAt(x, z) : 0; }

/* ---------- ВЫЛЕТ САМОЛЁТА ---------- */
function spawnPlane() {
  if (!api) return null;
  /* хорда: 14 попыток, берём ту, где вдоль пути БОЛЬШЕ СУШИ
     (✅ v0.5.24: коридор шире и центр смещается сильнее — архипелаг
     из нескольких островов, суша не только у центра карты) */
  let best = null, bestLand = -1;
  for (let i = 0; i < 14; i++) {
    const th = Math.random() * Math.PI * 2;
    const dx = Math.cos(th), dz = Math.sin(th);
    const a2 = Math.random() * Math.PI * 2, rr = Math.random() * 520;   /* ✅ v0.5.25: мир больше */
    const ox = Math.cos(a2) * rr, oz = Math.sin(a2) * rr;
    let land = 0, total = 0, maxH = -1e9;
    /* ✅ v0.5.25: острова разбросаны до 800 м от центра — коридор
       семплов шире (±860 м), иначе самолёт «не находит» сушу */
    for (let d = -860; d <= 860; d += 40) {
      const h = hAt(ox + dx * d, oz + dz * d);
      total++;
      if (h > WATER_MIN) land++;
      if (h > maxH) maxH = h;
    }
    if (land / total > bestLand) {
      bestLand = land / total;
      best = { dx: dx, dz: dz, ox: ox, oz: oz, maxH: maxH };
    }
  }
  if (!best || bestLand < 0.20) {
    log('вылет отменён: путь над морем (' + Math.round(bestLand * 100) + '% суши)');
    return null;
  }
  /* ✅ v0.5.20: самолёт ЧУТЬ ВЫШЕ (просили) — было +42/мин 85/макс 150 */
  const y = Math.min(165, Math.max(105, Math.round(best.maxH + 58)));
  /* ТОЧКИ СБРОСА: 1–3 (35/40/25%), вдоль пути, по земле, ≥90 м между */
  const roll = Math.random();
  const n = roll < 0.35 ? 1 : (roll < 0.75 ? 2 : 3);
  const drops = [];
  let guard = 0;
  while (drops.length < n && guard++ < 80) {
    /* сброс ВОКРУГ пересечения с островами (d≈0): ±430 м, только суша */
    const d = -430 + Math.random() * 860;
    const x = best.ox + best.dx * d, z = best.oz + best.dz * d;
    if (hAt(x, z) <= WATER_MIN) continue;                // не в воду
    if (drops.some((p) => Math.hypot(p.x - x, p.z - z) < 90)) continue;
    drops.push({ d: d, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 });
  }
  if (!drops.length) { log('вылет отменён: не нашёл сухих точек сброса'); return null; }
  drops.sort((a, b) => a.d - b.d);
  /* ✅ v0.5.24 ЛУТ РОЛЛИТСЯ ЗДЕСЬ (в первом ящике — ГАРАНТИРОВАННАЯ
     C4): список груза идёт в объявление в чат, createAirdrop берёт
     готовый лут — «ящик на земле» и «анонс» совпадают */
  drops.forEach((p, idx) => {
    const rl = rollAirdropLoot(idx === 0);
    p.loot = rl.loot;
    p.mags = rl.mags;
  });
  plane = {
    sx: best.ox - best.dx * CHORD_START,
    sz: best.oz - best.dz * CHORD_START,
    y: y, dx: best.dx, dz: best.dz, sp: PLANE_SP,
    dist: 0, drops: drops, di: 0, syncT: 0
  };
  api.broadcast({ t: 'plane', x: plane.sx, y: y, z: plane.sz,
    dx: plane.dx, dz: plane.dz, sp: plane.sp, age: 0, nd: drops.length }, null);
  api.broadcast({ t: 'atoast', m: '✈ САМОЛЁТ С ГРУЗОМ идёт к острову — ' +
    drops.length + ' аирдроп' + (drops.length > 1 ? 'а' : '') + '!' }, null);
  /* ✅ v0.5.24 (просьба игрока): объявление в ЧАТ от имени SERVER —
     «SERVER: АИРДРОП ВЫЛЕТЕЛ С C4 — ПОЗИЦИЯ: сетка (x : z)».
     Позиция — точка ПЕРВОГО ящика (в нём гарантированная C4) */
  const c4drop = drops[0];
  api.broadcast({
    t: 'chat', id: 'srv', n: 'SERVER', c: '#e0a33c',
    m: '✈ АИРДРОП ВЫЛЕТЕЛ С C4 — ПОЗИЦИЯ: ' + gridOf(c4drop.x, c4drop.z) +
      ' (' + Math.round(c4drop.x) + ' : ' + Math.round(c4drop.z) + ')'
  }, null);
  log('самолёт вылетел: курс ' + Math.round(Math.atan2(plane.dz, plane.dx) * 180 / Math.PI) +
    '°, высота ' + y + ' м, сбросов ' + drops.length +
    ' (суша ' + Math.round(bestLand * 100) + '%)');
  return { n: drops.length, y: y };
}

/* ✅ v0.5.25: квадрат сетки A1..K11 по мировым координатам (как карта
   на M — сетка 11×11 под мир 2000 м, было A1..F6 под 900 м) */
function gridOf(x, z) {
  const L = 'ABCDEFGHIJK';
  const HALF = 1000, CELL = (HALF * 2) / 11;
  const cx = Math.max(0, Math.min(10, Math.floor((x + HALF) / CELL)));
  const cz = Math.max(0, Math.min(10, Math.floor((z + HALF) / CELL)));
  return L[cx] + (cz + 1);
}

function createAirdrop(x, z, y, preLoot, preMags) {
  if (!api) return;
  const wo = api.worldObjs;
  wo.adropSeq = (wo.adropSeq | 0) + 1;
  while (wo.adrops.length >= ADROP_MAX) {
    const gone = wo.adrops.shift();
    api.broadcast({ t: 'adGone', id: gone.id }, null);
  }
  const rl = preLoot ? { loot: preLoot, mags: preMags || {} } : rollAirdropLoot(false);
  const rec = {
    id: 'ad' + wo.adropSeq,
    x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10,
    y: Math.round(y * 10) / 10,
    st: 'fall', inv: rl.loot, mags: rl.mags, at: Date.now()
  };
  wo.adrops.push(rec);
  api.broadcast({ t: 'adNew', id: rec.id, x: rec.x, y: rec.y, z: rec.z,
    st: 'fall', fall: FALL_SP, inv: rec.inv, mags: rec.mags }, null);
  api.markDirty();
  api.writeWorldNow();       // переживает kill -9 и в момент падения
  log('сброшен ' + rec.id + ' (' + rec.x + ', ' + rec.z + ') — видов лута ' +
    Object.keys(rl.loot).length);
}

/* ---------- ТИК 2 ГЦ (server.js setInterval 500 мс) ---------- */
function tick(dt) {
  if (!api) return;
  /* --- самолёт --- */
  if (plane) {
    plane.dist += plane.sp * dt;
    plane.syncT += dt;
    /* ✅ v0.5.20 СБРОС ТОЛЬКО НАД ТОЧКОЙ (просили: «самолёт дошёл до
       места — потом дроп упал», а было «падает сразу»). dist самолёта
       считается от СТАРТА хорды (CHORD_START до точки d≈0), а p.d —
       от начала координат хорды: над точкой p.d самолёт в момент
       dist = CHORD_START + p.d. Раньше сравнивали с «сырым» p.d
       (−330..330) — отрицательные d сбрасывались сразу на спавне */
    while (plane.di < plane.drops.length &&
        plane.dist >= CHORD_START + plane.drops[plane.di].d) {
      const p = plane.drops[plane.di++];
      /* ✅ v0.5.24: лут уже ПРОКАТАН при вылете (первый ящик — с C4,
         как было объявлено в чате) — берём готовый */
      createAirdrop(p.x, p.z, plane.y - 3, p.loot, p.mags);
    }
    /* якорь синхронизации раз в 2 с (клиент сам докручивает между) */
    if (plane.syncT >= 2 && api.players.size) {
      plane.syncT = 0;
      api.broadcast({ t: 'planeS', x: plane.sx + plane.dx * plane.dist,
        y: plane.y, z: plane.sz + plane.dz * plane.dist }, null);
    }
    /* улетел за край — исчез */
    if (plane.dist > CHORD_END) {
      plane = null;
      api.broadcast({ t: 'planeGone' }, null);
      log('самолёт улетел за край карты');
    }
  }
  /* --- падающие ящики --- */
  let changed = false;
  const wo = api.worldObjs;
  for (const d of wo.adrops) {
    if (d.st !== 'fall') continue;
    d.y = Math.round((d.y - FALL_SP * dt) * 10) / 10;
    const surf = surfaceY(d.x, d.z);
    if (d.y <= surf) {
      d.y = Math.round(surf * 100) / 100;
      d.st = 'ok';
      d.lt = Date.now();     // ✅ v0.5.21: момент касания — старт 20 минут
      api.broadcast({ t: 'adLand', id: d.id, y: d.y }, null);
      log(d.id + ' приземлился (' + d.x + ', ' + d.z + ') на ' + d.y);
      changed = true;
    }
  }
  if (changed) { api.markDirty(); api.writeWorldNow(); }

  /* --- ✅ v0.5.21: УПАВШИЙ И НЕ ЗАЛУТАННЫЙ ящик исчезает через 20 мин.
     Таймер (lt) писан на диск — переживает рестарт сервера: за 20 мин
     никто не добрался — ящик убирается у всех и в сейве --- */
  let expired = 0;
  const nowMs = Date.now();
  for (let i = wo.adrops.length - 1; i >= 0; i--) {
    const d = wo.adrops[i];
    if (!d || d.st !== 'ok' || !d.lt) continue;
    if (nowMs - d.lt < ADROP_LIFE_MS) continue;
    wo.adrops.splice(i, 1);
    api.broadcast({ t: 'adGone', id: d.id }, null);
    log(d.id + ' никто не залутал за ' + (ADROP_LIFE_MS / 60000) +
      ' мин — исчез (' + d.x + ', ' + d.z + ')');
    expired++;
  }
  if (expired) {
    api.broadcast({ t: 'atoast',
      m: '📦 Аирдроп никто не забрал за 20 минут — он исчез' }, null);
    api.markDirty();
    api.writeWorldNow();
  }
}

/* ---------- F У ЯЩИКА / ВЗЯТИЕ ПРЕДМЕТА ---------- */
function handleOpen(p, msg) {
  if (!api || !p.state) return;
  const d = api.worldObjs.adrops.find((x) => x.id === String(msg.id || ''));
  if (!d || d.st !== 'ok') return;
  const dx = p.state.x - d.x, dz = p.state.z - d.z;
  if (dx * dx + dz * dz > 36) return;                    // >6 м
  p.send({ t: 'adLoot', id: d.id, inv: d.inv, mags: d.mags || {} });
}

function handleTake(p, msg) {
  if (!api || !p.state) return;
  const d = api.worldObjs.adrops.find((x) => x.id === String(msg.id || ''));
  if (!d || d.st !== 'ok') { p.send({ t: 'adDeny', id: msg.id }); return; }
  const dx = p.state.x - d.x, dz = p.state.z - d.z;
  if (dx * dx + dz * dz > 36) { p.send({ t: 'adDeny', id: d.id }); return; }
  const item = String(msg.item || '');
  const have = (d.inv[item] | 0);
  if (!have) { p.send({ t: 'adDeny', id: d.id }); return; }
  let amt = Math.max(1, Math.floor(Number(msg.amt) || have));
  amt = Math.min(amt, have);
  d.inv[item] = have - amt;
  /* обойма уходит ВМЕСТЕ со стволом (как у трупов, v0.4.54) */
  let mag = 0;
  if (Array.isArray(d.mags[item]) && d.mags[item].length) {
    mag = d.mags[item].shift() | 0;
    if (!d.mags[item].length) delete d.mags[item];
  }
  const empty = !Object.keys(d.inv).some((k) => (d.inv[k] | 0) > 0);
  if (empty) {
    api.worldObjs.adrops = api.worldObjs.adrops.filter((x) => x !== d);
    api.broadcast({ t: 'adGone', id: d.id }, null);
    log(d.id + ' опустел — убран (' + p.name + ' забрал ' + item + ')');
  } else {
    api.broadcast({ t: 'adLoot', id: d.id, inv: d.inv, mags: d.mags || {},
      pid: p.id, tid: String(msg.tid || ''), item: item, amt: amt, mag: mag }, null);
  }
  api.markDirty();
  api.writeWorldNow();
}

/* ---------- ВЫЗОВ АДМИНОМ / АВТОТИК 30 МИН ---------- */
function callPlane(who) {
  if (plane) return 'Самолёт уже в воздухе — дождись сброса';
  const res = spawnPlane();
  if (!res) return 'Вылет не состоялся: не нашёл пути над сушей';
  if (who && who !== 'auto') log('вызов админом: ' + who);
  return 'Самолёт вылетел: сбросов ' + res.n + ', высота ' + res.y + ' м';
}

/* ---------- ДАННЫЕ ДЛЯ WELCOME (зашёл во время/после падения) ---------- */
function snapshotDrops() {
  if (!api) return [];
  return api.worldObjs.adrops.map((d) => ({
    id: d.id, x: d.x, y: d.y, z: d.z, st: d.st, fall: FALL_SP,
    inv: d.inv, mags: d.mags || {}
  }));
}

function planeState() {
  if (!plane) return null;
  return {
    x: plane.sx + plane.dx * plane.dist, y: plane.y,
    z: plane.sz + plane.dz * plane.dist,
    dx: plane.dx, dz: plane.dz, sp: plane.sp,
    dist: plane.dist, end: CHORD_END
  };
}

module.exports.init = function (deps) {
  api = deps;
  if (!Array.isArray(api.worldObjs.adrops)) api.worldObjs.adrops = [];
  /* ✅ v0.5.21: упавшим ящикам из СТАРОГО сейва (без метки lt) даём
     СВЕЖИЕ 20 минут — обновление не должно удалять их мгновенно */
  api.worldObjs.adrops.forEach((d) => {
    if (d && d.st === 'ok' && !d.lt) d.lt = Date.now();
  });
  /* ✈ автотик каждые 30 минут — только если на сервере есть игроки */
  setInterval(() => {
    if (api.players.size >= 1) callPlane('auto');
  }, AUTO_MS);
  log('система аирдропов запущена: самолёт каждые ' +
    (AUTO_MS / 60000) + ' мин, ящиков в мире ' + api.worldObjs.adrops.length);
};
module.exports.tick = tick;
module.exports.callPlane = callPlane;
module.exports.handleOpen = handleOpen;
module.exports.handleTake = handleTake;
module.exports.snapshotDrops = snapshotDrops;
module.exports.planeState = planeState;
