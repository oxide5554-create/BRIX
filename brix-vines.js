/* ============================================================
 *  brix • brix-vines.js — СЕРВЕРНЫЙ СИМ ТЫКВЕННЫХ ЛОЗ (v0.5.21)
 *  Подключается ТОЛЬКО в реалме brixland (server.js: REALM === 'brixland').
 *
 *  🎃 ЛОЗА (pumpkin vine):
 *  • РАЗМЕЩЕНИЕ ДЕТЕРМИНИРОВАННОЕ — формула 1:1 скопирована в
 *    js/game/vines.js (как heightAt/noise: «одна формула у сервера и
 *    клиента»). Сетка 16 м по острову, хэш решает «есть лоза или нет»,
 *    дальше условия: суша 3..38 м, пологий склон, не в гуще леса.
 *    МЕНЯТЬ ФОРМУЛУ МОЖНО ТОЛЬКО В ОБОИХ ФАЙЛАХ СРАЗУ — иначе у
 *    сервера и клиента лозы разъедутся по индексам!
 *  • ТЫКВА РАСТЁТ НА СЕРВЕРЕ: у каждой лозы {g, t} — g: тыква висит
 *    (1) или сорвана (0), t: когда вырастет снова (ms, epoch). После
 *    сбора тыква вырастает через 8 МИНУТ (VINE_GROW_MS). Тик 1 ГЦ.
 *  • СИНХРОНИЗАЦИЯ: сорвал игрок → сервер проверяет дистанцию (6 м)
 *    и авторитетно ставит g=0, ВСЕМ 'vineUpd' {u:[{i,g,t}]} — тыква
 *    исчезает у всех; выросла → 'vineUpd' {u:[{i,g:1}]}. Зашёл позже —
 *    всё состояние приезжает в welcome.vines (snapshot).
 *  • СОХРАНЕНИЕ: worldObjs.vines пишется в world-objs.json
 *    (v8, поле vines) — переживает рестарт сервера, как бочки/аирдропы.
 *    Если длина не совпала (формула изменилась) — перезаполняется:
 *    все лозы с тыквой.
 *  • САМ ПРЕДМЕТ тыкве выдаёт КЛИЕНТ (оптимистично, инвентарь
 *    клиентский); сервер — авторитет состояния лозы: отказ → 'vineDeny',
 *    клиент откатывает выдачу (как у аирдропа).
 *
 *  Протокол: всем 'vineUpd' {u: [{i, g, t}]}; клиенту 'vineDeny' {i}.
 *  От клиента: 'vineTake' {i}.
 * ============================================================ */
'use strict';

const VINE_GROW_MS = 8 * 60 * 1000;  // 🎃 тыква вырастает за 8 минут после сбора
const VINE_SEED = 97531;             // сид размещения лоз (как у сервера, см. client)
const VINE_CELL = 16;                // клетка сетки, м
const VINE_HALF = 28;                // клетки -28..28 → ±448 м (остров 450)
const TAKE_R2 = 36;                  // сорвать можно не дальше 6 м

let api = null;                      // { broadcast, players, worldObjs, heightAt,
                                     //  fbm, markDirty, writeWorldNow }
let spots = [];                      // [{x, z, y, r}] — координаты лоз (индекс = id)
let state = [];                      // [{g, t}] — тот же индекс (worldObjs.vines)

function log(s) { console.log('[vine] ' + s); }

/* ---------- ХЭШ СЕТКИ — копия js/game/noise.js hash2, 1:1 ---------- */
function vineHash2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* ---------- РАЗМЕЩЕНИЕ ЛОЗ — ФОРМУЛА 1:1 С js/game/vines.js!
   Менять только в обоих файлах сразу ---------- */
function computeSpots(heightAt, fbm) {
  const out = [];
  for (let ix = -VINE_HALF; ix <= VINE_HALF; ix++) {
    for (let iz = -VINE_HALF; iz <= VINE_HALF; iz++) {
      if (vineHash2(ix, iz, VINE_SEED) >= 0.14) continue;   // плотность сетки (~61 лоза)
      const x = ix * VINE_CELL +
        (vineHash2(ix, iz, VINE_SEED + 1) - 0.5) * VINE_CELL * 0.8;
      const z = iz * VINE_CELL +
        (vineHash2(ix, iz, VINE_SEED + 2) - 0.5) * VINE_CELL * 0.8;
      const h = heightAt(x, z);
      if (h < 3 || h > 38) continue;                          // не в море/на вершинах
      /* склон: выборка ±2 м (как slopeAt у клиента), лоза на пологом */
      const sl = Math.max(
        Math.abs(heightAt(x + 2, z) - heightAt(x - 2, z)),
        Math.abs(heightAt(x, z + 2) - heightAt(x, z - 2))) / 4;
      if (sl > 0.28) continue;
      /* не в гуще леса (лес-фактор деревьев, seed 909) — тыква любит поляны */
      const forest = fbm(x * 0.008 + 50, z * 0.008 + 80, 909, 3);
      if (forest > 0.62) continue;
      out.push({
        x: Math.round(x * 100) / 100,
        z: Math.round(z * 100) / 100,
        y: Math.round(h * 100) / 100,
        r: vineHash2(ix, iz, VINE_SEED + 3) * Math.PI * 2    // поворот (визуал)
      });
    }
  }
  return out;
}

/* ---------- ИНИЦИАЛИЗАЦИЯ (server.js, после загрузки worldObjs) ---------- */
module.exports.init = function (deps) {
  api = deps;
  spots = computeSpots(api.heightAt, api.fbm);
  const wo = api.worldObjs;
  /* длилась ли формула: сейв совпадает по длине — держим как было;
     не совпала (новый мир/изменили формулу) — перезаполняем */
  if (!Array.isArray(wo.vines) || wo.vines.length !== spots.length) {
    wo.vines = spots.map(() => ({ g: 1, t: 0 }));
    if (wo.vines.length) log('лозы перезаполнены (все с тыквой): ' + wo.vines.length);
  }
  state = wo.vines;
  state.forEach((s) => { s.g = s && s.g ? 1 : 0; s.t = (s && s.t) || 0; });
  let grown = 0;
  state.forEach((s) => { if (s.g) grown++; });
  log('лозы на карте: ' + spots.length + ', с тыквой сейчас: ' + grown +
    ', регенерация тыквы ' + (VINE_GROW_MS / 60000) + ' мин');
};

/* ---------- ТИК 1 ГЦ (server.js setInterval 1000 мс): рост тыквы ---------- */
module.exports.tick = function () {
  if (!api || !state.length) return;
  const now = Date.now();
  const ups = [];
  for (let i = 0; i < state.length; i++) {
    const s = state[i];
    if (!s.g && s.t && now >= s.t) {
      s.g = 1;
      s.t = 0;
      ups.push({ i: i, g: 1 });
    }
  }
  if (ups.length) {
    api.broadcast({ t: 'vineUpd', u: ups }, null);
    api.markDirty();
    log('выросло тыкв: ' + ups.length);
  }
};

/* ---------- КЛИЕНТ СОРВАЛ ТЫКВУ ('vineTake' {i}) ---------- */
module.exports.handleTake = function (p, msg) {
  if (!api || !p.state) return;
  const i = msg.i | 0;
  const sp = spots[i];
  const s = state[i];
  /* ✅ g в отказе — авторитетное состояние лозы: клиент не покажет
     тыкву-призрак, если эту лозу уже успел обобрать другой */
  if (!sp || !s || !s.g) { p.send({ t: 'vineDeny', i: i, g: s ? s.g : 0 }); return; }
  const dx = p.state.x - sp.x, dz = p.state.z - sp.z;
  if (dx * dx + dz * dz > TAKE_R2) {
    p.send({ t: 'vineDeny', i: i, g: 1 });
    return;
  }
  s.g = 0;
  s.t = Date.now() + VINE_GROW_MS;
  /* всем — тыква исчезла; у взявшего она уже в руках (оптимистично) */
  api.broadcast({ t: 'vineUpd', u: [{ i: i, g: 0, t: s.t }] }, null);
  api.markDirty();
  api.writeWorldNow();       // переживает kill -9 и сразу после сбора
  log(p.name + ' сорвал тыкву с лозы ' + i + ' (' + sp.x + ', ' + sp.z + ')');
};

/* ---------- ДАННЫЕ ДЛЯ WELCOME (зашёл позже — видит как все) ---------- */
module.exports.snapshot = function () {
  if (!api) return [];
  return state.map((s) => ({ g: s.g, t: s.t || 0 }));
};

/* 🧪 для тестов детерминизма (клиент должен дать ТОТ ЖЕ список) */
module.exports.computeSpots = computeSpots;
module.exports.spotsCount = function () { return spots.length; };
