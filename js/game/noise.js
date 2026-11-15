// ============================================================
//  brix • js/game/noise.js
//  Детерминированный шум для процедурной генерации мира BRIX.
//  Полный перенос из lib/game/noise.ts.
// ============================================================
window.BrixNoise = (function () {
  'use strict';

  /** Быстрый хэш целочисленной сетки → 0..1 */
  function hash2(ix, iz, seed) {
    var h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function smooth(t) { return t * t * (3 - 2 * t); }

  /** Value noise с билинейной интерполяцией → 0..1 */
  function valueNoise(x, z, seed) {
    var ix = Math.floor(x), iz = Math.floor(z);
    var fx = x - ix, fz = z - iz;
    var a = hash2(ix, iz, seed);
    var b = hash2(ix + 1, iz, seed);
    var c = hash2(ix, iz + 1, seed);
    var d = hash2(ix + 1, iz + 1, seed);
    var u = smooth(fx), v = smooth(fz);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  /** Фрактальный шум (сумма октав) → 0..1 */
  function fbm(x, z, seed, octaves) {
    octaves = octaves || 4;
    var amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (var i = 0; i < octaves; i++) {
      sum += valueNoise(x * freq, z * freq, seed + i * 101) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }

  /** Ridged-шум для остроконечных гор → 0..1 */
  function ridged(x, z, seed, octaves) {
    octaves = octaves || 4;
    var amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (var i = 0; i < octaves; i++) {
      var v = 1 - Math.abs(2 * valueNoise(x * freq, z * freq, seed + i * 131) - 1);
      v *= v;
      sum += v * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  }

  /** Гауссов бамп (для отдельных гор и котловины озера) */
  function gauss(x, z, cx, cz, sigma) {
    var dx = x - cx, dz = z - cz;
    return Math.exp(-(dx * dx + dz * dz) / (2 * sigma * sigma));
  }

  function smoothstep(a, b, x) {
    var t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  /** Детерминированный ГПСЧ (xorshift) */
  function makeRng(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };

  return { hash2: hash2, valueNoise: valueNoise, fbm: fbm, ridged: ridged,
    gauss: gauss, smoothstep: smoothstep, lerp: lerp, makeRng: makeRng, clamp: clamp };
})();
