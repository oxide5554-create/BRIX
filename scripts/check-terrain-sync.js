// ============================================================
//  scripts/check-terrain-sync.js — СВЕРКА РЕЛЬЕФА СЕРВЕРА И КЛИЕНТА
//  Извлекает heightAt из server.js (brixHeightAt) и js/game/terrain.js
//  (heightAt), подставляет один и тот же сид и сравнивает высоты
//  в сотнях точек. |Δ| > 1e-9 = ФАТАЛЬНО (лозы/тыквы разъедутся).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

/* ---------- 1. CLIENT: шум + heightAt в песочнице ---------- */
function clientHeightFn(seed) {
  const sandbox = { window: {} };
  const vm = require('vm');
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/game/noise.js'), 'utf8'), ctx);
  /* минимальный THREE-стаб: terrain.js создаёт цвета на уровне модуля */
  sandbox.THREE = {
    Color: function (hex) {
      this.hex = hex;
      this.r = ((hex >> 16) & 255) / 255;
      this.g = ((hex >> 8) & 255) / 255;
      this.b = (hex & 255) / 255;
      this.set = function () { return this; };
      this.lerp = function () { return this; };
      this.clone = function () { return new sandbox.THREE.Color(this.hex); };
      this.copy = function () { return this; };
    }
  };
  // terrain.js — вырежем IIFE и вытащим heightAt через экспорт модуля
  let src = fs.readFileSync(path.join(ROOT, 'js/game/terrain.js'), 'utf8');
  vm.runInContext(src, ctx);
  const BrixTerrain = sandbox.window.BrixTerrain;
  if (!BrixTerrain) throw new Error('client BrixTerrain не собрался');
  sandbox.window.BRIX_TERRAIN_SEED = seed;
  sandbox.window.BRIX_PVP_FLAT = false;
  sandbox.window.BRIX_BIOMES = 0;
  return (x, z) => BrixTerrain.heightAt(x, z);
}

/* ---------- 2. SERVER: brixHeightAt + зависимости ---------- */
function serverHeightFn(seed) {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  // всё, что нужно: хэш/шум/гаусс/смуcстеп/лерп/ридж + план + высота
  const grab = (name) => {
    const re = new RegExp('function ' + name + '\\s*\\(', 'g');
    const m = re.exec(src);
    if (!m) throw new Error('в server.js не найдена функция ' + name);
    // баланс скобок от начала объявления
    let i = src.indexOf('{', m.index), depth = 0, j = i;
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') { depth--; if (!depth) break; }
    }
    return src.slice(m.index, j + 1);
  };
  const parts = ['brixHash2', 'brixValueNoise', 'brixFbm', 'brixRidged',
    'brixGauss', 'brixSmoothstep', 'brixLerp', 'brixLayout', 'brixHeightCore',
    'brixBarnPads', 'brixTempAt', 'brixCityPad', 'brixHeightAt']
    .map(grab).join('\n');
  const sandbox = {
    TERRAIN_SEED: seed,
    SEED_MULT: 7919,
    /* ✅ фикс: было 450 (до v0.5.25) — из-за этого рельеф «разъезжался»
       У КРАЯ КАРТЫ. В server.js COLD_WORLD_HALF = 1000 (мир 2000 м) */
    COLD_WORLD_HALF: 1000,
    REALM: 'brixwipe',
    S_HILLS: 1013, S_DETAIL: 2027, S_COAST: 10101,   /* v0.5.24: сид рваного берега */
    _layoutFor: -1, _layout: null,
    _bpFor: -1, _bpCache: null,                      /* ✅ v0.6.0: кэш пада амбаров */
    _cityFor: -1, _cityCache: null, _cityDone: false,  /* ✅ v0.7.0: кэш пада города */
    srvSeedOff: function () { return sandbox.TERRAIN_SEED * sandbox.SEED_MULT; }
  };
  const vm = require('vm');
  const ctx = vm.createContext(sandbox);
  vm.runInContext(parts + '\nthis._h = brixHeightAt;', ctx);
  return (x, z) => sandbox._h(x, z);
}

/* ---------- 3. Сравнение ---------- */
const seed = Number(process.argv[2] || 607058);
const hc = clientHeightFn(seed);
const hs = serverHeightFn(seed);
let worst = 0, worstAt = null;
for (let i = 0; i < 3000; i++) {
  const x = (Math.random() * 2 - 1) * 460;
  const z = (Math.random() * 2 - 1) * 460;
  const a = hc(x, z), b = hs(x, z);
  const d = Math.abs(a - b);
  if (d > worst) { worst = d; worstAt = [Math.round(x), Math.round(z)]; }
}
console.log('сид:', seed);
console.log('максимальная разница высот сервер/клиент:', worst.toExponential(3),
  'в точке', worstAt);
if (worst < 1e-9) {
  console.log('OK: рельеф сервера и клиента ИДЕНТИЧЕН — лозы/тыквы совпадут');
  process.exit(0);
} else {
  console.log('FAIL: рельеф разъехался!');
  process.exit(1);
}
