// ============================================================
//  brix • js/game/terrainlook.js
//  ✅ v0.4.42 ТЕКСТУРЫ БИОМОВ + КРАСИВЫЕ ПЕРЕХОДЫ
//  Раньше земля была ПЛОСКИМИ вершинными цветами (без текстур):
//  трава/песок/снег выглядели однотонной заливкой. Теперь:
//  1) terrain.js считает на вершинах ВЕСА слоёв (brixSplat) — те же
//     рваные границы, что у миникарты;
//  2) здесь генерируются ПРОЦЕДУРНЫЕ бесшовные текстуры 256×256
//     (сочный луг, сухостой, земля, камень, снег, песок, дно) —
//     без единого внешнего файла, всё рисуется на canvas;
//  3) onBeforeCompile внедряет в MeshStandardMaterial смешивание:
//     текстура каждого слоя берётся в МИРОВЫХ координатах, края
//     слоёв дополнительно рвутся попиксельным шумом, снег блестит,
//     крупные пятна света/тени дают живую землю.
//  Если что-то не так со шейдером — apply() просто не трогает
//  материал, и мир остаётся с новой вершинной палитрой (fallback).
// ============================================================
window.BrixTerrainLook = (function () {
  'use strict';

  /* ---------- детерминированный ГПСЧ (тот же, что у мира) ---------- */
  function makeRng(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /* ---------- бесшовный value-noise (периодическая решётка) ---------- */
  function pHash(ix, iz, seed) {
    var h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function pNoise(x, z, period, seed) {
    var ix = Math.floor(x), iz = Math.floor(z);
    var fx = x - ix, fz = z - iz;
    var x0 = ((ix % period) + period) % period, z0 = ((iz % period) + period) % period;
    var x1 = (x0 + 1) % period, z1 = (z0 + 1) % period;
    var a = pHash(x0, z0, seed), b = pHash(x1, z0, seed);
    var c = pHash(x0, z1, seed), d = pHash(x1, z1, seed);
    var u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function pFbm(x, z, period, seed, oct) {
    var sum = 0, amp = 0.5, norm = 0, freq = 1;
    for (var i = 0; i < oct; i++) {
      sum += pNoise(x * freq, z * freq, period * freq, seed + i * 101) * amp;
      norm += amp; amp *= 0.5; freq *= 2;
    }
    return sum / norm;
  }

  /* ---------- рисование с ОБВЁРТКОЙ края (текстуры бесшовные) ---------- */
  /** вызывает draw(dx, dy) во всех нужных смещениях, чтобы мазок,
      пересекающий край тайла, продолжился с другой стороны */
  function wrapDraw(ctx, S, x, y, r, draw) {
    var xs = [0], zs = [0];
    if (x - r < 0) xs.push(S); if (x + r > S) xs.push(-S);
    if (y - r < 0) zs.push(S); if (y + r > S) zs.push(-S);
    for (var i = 0; i < xs.length; i++) {
      for (var j = 0; j < zs.length; j++) {
        ctx.save();
        ctx.translate(xs[i], zs[j]);
        draw();
        ctx.restore();
      }
    }
  }

  /** мягкое пятно ( radial gradient ) с обвёрткой края */
  function blob(ctx, S, rng, colors, rMin, rMax, alpha) {
    var x = rng() * S, y = rng() * S;
    var r = rMin + rng() * (rMax - rMin);
    var col = colors[(rng() * colors.length) | 0];
    wrapDraw(ctx, S, x, y, r, function () {
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(' + col + ',' + alpha + ')');
      g.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    });
  }

  /** травинка / штрих: короткая линия с лёгким наклоном */
  function blade(ctx, S, rng, colors, lenMin, lenMax, alpha) {
    var x = rng() * S, y = rng() * S;
    var len = lenMin + rng() * (lenMax - lenMin);
    var ang = Math.PI / 2 + (rng() - 0.5) * 0.9;
    var dx = Math.cos(ang) * len, dy = Math.sin(ang) * len;
    ctx.strokeStyle = 'rgba(' + colors[(rng() * colors.length) | 0] + ',' +
      (alpha * (0.6 + rng() * 0.4)) + ')';
    ctx.lineWidth = 0.8 + rng() * 1.1;
    wrapDraw(ctx, S, x, y, len, function () {
      ctx.beginPath();
      ctx.moveTo(x - dx / 2, y - dy / 2);
      ctx.quadraticCurveTo(x, y, x + dx / 2, y + dy / 2);
      ctx.stroke();
    });
  }

  /** финальное зерно: ±amp яркости на каждый пиксель */
  function grain(ctx, S, rng, amp) {
    var img = ctx.getImageData(0, 0, S, S);
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var g = (rng() - 0.5) * 2 * amp;
      d[i] = Math.max(0, Math.min(255, d[i] + g));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + g));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + g));
    }
    ctx.putImageData(img, 0, 0);
  }

  /* ============ ХУДОЖНИКИ СЛОЁВ (256×256, тайлится) ============ */

  function paintGrassLush(ctx, S, rng) {
    ctx.fillStyle = '#55702c'; ctx.fillRect(0, 0, S, S);
    var i;
    for (i = 0; i < 420; i++) blob(ctx, S, rng,
      ['74,100,38', '95,125,48', '62,88,32', '110,140,60', '48,70,26'], 7, 34, 0.3);
    for (i = 0; i < 1500; i++) blade(ctx, S, rng,
      ['47,74,24', '58,92,30', '127,160,74', '143,178,84', '84,112,44'], 4, 10, 0.55);
    for (i = 0; i < 90; i++) blade(ctx, S, rng, ['168,190,96', '186,204,110'], 3, 6, 0.4);
    grain(ctx, S, rng, 11);
  }

  function paintGrassDry(ctx, S, rng) {
    ctx.fillStyle = '#8b8449'; ctx.fillRect(0, 0, S, S);
    var i;
    for (i = 0; i < 420; i++) blob(ctx, S, rng,
      ['124,116,64', '156,148,85', '110,104,58', '168,156,96', '94,90,50'], 7, 34, 0.3);
    for (i = 0; i < 1400; i++) blade(ctx, S, rng,
      ['94,92,48', '107,100,54', '179,169,103', '196,183,120', '125,112,60'], 4, 10, 0.55);
    for (i = 0; i < 70; i++) blade(ctx, S, rng, ['141,104,58', '120,92,52'], 3, 7, 0.45);
    grain(ctx, S, rng, 11);
  }

  function paintDirt(ctx, S, rng) {
    ctx.fillStyle = '#6e5a3a'; ctx.fillRect(0, 0, S, S);
    var i;
    for (i = 0; i < 400; i++) blob(ctx, S, rng,
      ['94,77,48', '122,101,64', '82,66,42', '134,114,76', '70,56,36'], 6, 30, 0.32);
    // корешки и борозды
    for (i = 0; i < 46; i++) {
      var x = rng() * S, y = rng() * S, len = 10 + rng() * 26;
      ctx.strokeStyle = 'rgba(58,45,28,' + (0.12 + rng() * 0.12) + ')';
      ctx.lineWidth = 1 + rng();
      wrapDraw(ctx, S, x, y, len, function () {
        ctx.beginPath();
        ctx.moveTo(x - len / 2, y);
        ctx.quadraticCurveTo(x, y + (rng() - 0.5) * 6, x + len / 2, y + (rng() - 0.5) * 4);
        ctx.stroke();
      });
    }
    // камешки
    for (i = 0; i < 300; i++) {
      var px = rng() * S, py = rng() * S, pr = 0.7 + rng() * 1.7;
      ctx.fillStyle = rng() < 0.55 ? 'rgba(63,51,32,0.6)' : 'rgba(147,130,95,0.5)';
      wrapDraw(ctx, S, px, py, pr, function () {
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    grain(ctx, S, rng, 13);
  }

  function paintRock(ctx, S, rng) {
    ctx.fillStyle = '#807b73'; ctx.fillRect(0, 0, S, S);
    var i;
    for (i = 0; i < 460; i++) blob(ctx, S, rng,
      ['110,106,98', '141,136,128', '96,92,85', '154,149,140', '86,82,75'], 6, 32, 0.3);
    // трещины — ломаные со сломом
    for (i = 0; i < 26; i++) {
      var x = rng() * S, y = rng() * S;
      ctx.strokeStyle = 'rgba(66,62,55,' + (0.35 + rng() * 0.25) + ')';
      ctx.lineWidth = 0.8 + rng() * 1.2;
      wrapDraw(ctx, S, x, y, 46, function () {
        ctx.beginPath();
        ctx.moveTo(x, y);
        var cx = x, cy = y;
        for (var k = 0; k < 5; k++) {
          cx += (rng() - 0.5) * 22; cy += (rng() - 0.5) * 22;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      });
    }
    grain(ctx, S, rng, 12);
  }

  function paintSnow(ctx, S, rng) {
    ctx.fillStyle = '#e9eef5'; ctx.fillRect(0, 0, S, S);
    var i;
    // мягкие голубые тени и белые надува (бледные — без «пятен-плиток»)
    for (i = 0; i < 160; i++) blob(ctx, S, rng,
      ['213,224,236', '200,213,228', '240,245,250', '228,236,244'], 12, 60, 0.22);
    // позёмка — длинные волнистые полосы
    for (i = 0; i < 60; i++) {
      var x = rng() * S, y = rng() * S, len = 40 + rng() * 90;
      ctx.strokeStyle = rng() < 0.5 ? 'rgba(251,253,255,0.3)' : 'rgba(198,211,226,0.25)';
      ctx.lineWidth = 1 + rng() * 2;
      wrapDraw(ctx, S, x, y, len, function () {
        ctx.beginPath();
        ctx.moveTo(x - len / 2, y);
        ctx.bezierCurveTo(x - len / 6, y - 4 - rng() * 3, x + len / 6, y + 4 + rng() * 3, x + len / 2, y);
        ctx.stroke();
      });
    }
    grain(ctx, S, rng, 6);
    // искры-блёстки поверх
    for (i = 0; i < 500; i++) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + rng() * 0.5) + ')';
      ctx.fillRect(rng() * S, rng() * S, 1, 1);
    }
  }

  function paintSand(ctx, S, rng) {
    ctx.fillStyle = '#c4a97a'; ctx.fillRect(0, 0, S, S);
    var i;
    for (i = 0; i < 380; i++) blob(ctx, S, rng,
      ['184,156,108', '208,183,135', '196,173,125', '173,145,100', '216,195,148'], 7, 32, 0.3);
    // рябь — волнистые линии по горизонтали с шумовым сдвигом
    for (i = 0; i < 70; i++) {
      var y = rng() * S, x = rng() * S, len = 50 + rng() * 120;
      ctx.strokeStyle = rng() < 0.5 ? 'rgba(160,133,84,0.3)' : 'rgba(217,194,150,0.32)';
      ctx.lineWidth = 1 + rng() * 1.6;
      wrapDraw(ctx, S, x, y, len, function () {
        ctx.beginPath();
        ctx.moveTo(x - len / 2, y);
        ctx.bezierCurveTo(x - len / 6, y - 3 - rng() * 3, x + len / 6, y + 3 + rng() * 3, x + len / 2, y);
        ctx.stroke();
      });
    }
    // крупные тёмные песчинки
    for (i = 0; i < 420; i++) {
      ctx.fillStyle = 'rgba(120,96,60,' + (0.25 + rng() * 0.3) + ')';
      ctx.fillRect(rng() * S, rng() * S, 1.2, 1.2);
    }
    grain(ctx, S, rng, 10);
  }

  function paintDeep(ctx, S, rng) {
    ctx.fillStyle = '#2a3f3c'; ctx.fillRect(0, 0, S, S);
    var i;
    for (i = 0; i < 300; i++) blob(ctx, S, rng,
      ['34,53,47', '49,71,63', '29,46,43', '61,84,72'], 10, 44, 0.3);
    // илистые светлые разводы
    for (i = 0; i < 60; i++) {
      var x = rng() * S, y = rng() * S, len = 24 + rng() * 50;
      ctx.strokeStyle = 'rgba(61,82,72,' + (0.15 + rng() * 0.15) + ')';
      ctx.lineWidth = 1.5 + rng() * 2;
      wrapDraw(ctx, S, x, y, len, function () {
        ctx.beginPath();
        ctx.moveTo(x - len / 2, y);
        ctx.quadraticCurveTo(x, y + (rng() - 0.5) * 8, x + len / 2, y + (rng() - 0.5) * 6);
        ctx.stroke();
      });
    }
    grain(ctx, S, rng, 7);
  }

  /* ---------- сборка текстур ---------- */
  var _texs = null;

  function buildTextures() {
    if (_texs) return _texs;
    var S = 256;
    function make(seed, painter) {
      var cv = document.createElement('canvas');
      cv.width = S; cv.height = S;
      var ctx = cv.getContext('2d');
      painter(ctx, S, makeRng(seed));
      var t = new THREE.CanvasTexture(cv);
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      if (THREE.SRGBColorSpace !== undefined) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }
    _texs = {
      lush: make(101, paintGrassLush),
      dry: make(202, paintGrassDry),
      dirt: make(303, paintDirt),
      rock: make(404, paintRock),
      snow: make(505, paintSnow),
      sand: make(606, paintSand),
      deep: make(707, paintDeep)
    };
    return _texs;
  }

  /* ================= ВНЕДРЕНИЕ В ШЕЙДЕР ================= */

  var VERT_HEAD = [
    'attribute vec4 brixSplat;',    // земля / камень / снег / песок
    'attribute vec2 brixSplat2;',   // дно / влажность (сочный-сухой луг)
    'varying vec4 vBxSplat;',
    'varying vec2 vBxSplat2;',
    'varying vec3 vBxWpos;'
  ].join('\n');

  var FRAG_HEAD = [
    'varying vec4 vBxSplat;',
    'varying vec2 vBxSplat2;',
    'varying vec3 vBxWpos;',
    'uniform sampler2D bxTexLush;',,
    'uniform sampler2D bxTexDry;',
    'uniform sampler2D bxTexDirt;',
    'uniform sampler2D bxTexRock;',
    'uniform sampler2D bxTexSnow;',
    'uniform sampler2D bxTexSand;',
    'uniform sampler2D bxTexDeep;',
    'float bxHash(vec2 p) {',
    '  p = fract(p * vec2(123.34, 345.45));',
    '  p += dot(p, p + 34.345);',
    '  return fract(p.x * p.y);',
    '}',
    'float bxNoise(vec2 p) {',
    '  vec2 i = floor(p); vec2 f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  float a = bxHash(i); float b = bxHash(i + vec2(1.0, 0.0));',
    '  float c = bxHash(i + vec2(0.0, 1.0)); float d = bxHash(i + vec2(1.0, 1.0));',
    '  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);',
    '}',
    'float bxFbm(vec2 p) {',
    '  float s = 0.0; float a = 0.5;',
    '  for (int i = 0; i < 3; i++) { s += bxNoise(p) * a; p *= 2.03; a *= 0.5; }',
    '  return s / 0.875;',
    '}',
    '/* rvanyj kraj sloya: shum silnee vsego na granice */',
    'float bxDither(float k, float n, float amt) {',
    '  return clamp(k + (n - 0.5) * amt * (1.0 - abs(2.0 * k - 1.0)), 0.0, 1.0);',
    '}',
    'vec3 brixTerrainColor() {',
    '  vec2 wxz = vBxWpos.xz;',
    '  float dirtK = vBxSplat.x;',
    '  float rockK = vBxSplat.y;',
    '  float snowK = vBxSplat.z;',
    '  float sandK = vBxSplat.w;',
    '  float deepK = vBxSplat2.x;',
    '  float moist = clamp(vBxSplat2.y, 0.0, 1.0);',
    '  /* POPIXELNAYA rvanost kraev (okolo 1.3 m) sverh vershinnoj:',
    '     granica bioma ne vyglyadit linejkoj dazhe vblizi */',
    '  float nF = bxFbm(wxz * 0.75);',
    '  dirtK = bxDither(dirtK, nF, 0.22);',
    '  rockK = bxDither(rockK, bxFbm(wxz * 0.9 + 17.3), 0.24);',
    '  snowK = bxDither(snowK, nF * 0.6 + bxFbm(wxz * 0.5 + 41.7) * 0.4, 0.30);',
    '  sandK = bxDither(sandK, nF, 0.26);',
    '  /* smeshenie tekstur v MIROVYH koordinatah - tajl ne plyvyot */',
    '  vec3 col = mix(texture2D(bxTexLush, wxz * (1.0 / 4.2)).rgb,',
    '                 texture2D(bxTexDry, wxz * (1.0 / 3.7)).rgb, moist);',
    '  col = mix(col, texture2D(bxTexDirt, wxz * (1.0 / 5.0)).rgb, dirtK);',
    '  col = mix(col, texture2D(bxTexRock, wxz * (1.0 / 6.5)).rgb, rockK);',
    '  col = mix(col, texture2D(bxTexSnow, wxz * (1.0 / 7.5)).rgb, snowK);',
    '  col = mix(col, texture2D(bxTexSand, wxz * (1.0 / 4.0)).rgb, sandK);',
    '  col = mix(col, texture2D(bxTexDeep, wxz * (1.0 / 8.0)).rgb, deepK * 0.75);',
    '  /* krupnye pyatna sveta/teni - zemlya zhyvaya na lyuboj distancii */',
    '  col *= 0.90 + bxFbm(wxz * 0.055) * 0.20;',
    '  /* blestki: sneg i mokryj pesok lovyat solnce redkimi iskrami */',
    '  float spK = step(0.996, bxHash(floor(wxz * 8.0))) *',
    '    max(snowK, sandK * 0.4);',
    '  col += vec3(spK * 0.35);',
    '  return col;',
    '}'
  ].join('\n');

  /** ✅ применяется ОДИН раз к материалу террейна.
      Возвращает список текстур для dispose (gameworld.js). */
  function apply(mat) {
    var t = buildTextures();

    mat.onBeforeCompile = function (shader) {
      shader.uniforms.bxTexLush = { value: t.lush };
      shader.uniforms.bxTexDry = { value: t.dry };
      shader.uniforms.bxTexDirt = { value: t.dirt };
      shader.uniforms.bxTexRock = { value: t.rock };
      shader.uniforms.bxTexSnow = { value: t.snow };
      shader.uniforms.bxTexSand = { value: t.sand };
      shader.uniforms.bxTexDeep = { value: t.deep };

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
        .replace('#include <begin_vertex>',
          '#include <begin_vertex>\n' +
          '  vBxSplat = brixSplat;\n' +
          '  vBxSplat2 = brixSplat2;')
        .replace('#include <project_vertex>',
          '#include <project_vertex>\n' +
          '  vBxWpos = (modelMatrix * vec4(transformed, 1.0)).xyz;');

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
        .replace('#include <color_fragment>',
          'diffuseColor.rgb = brixTerrainColor();');
    };
    /* свой ключ кэша программы — чтобы three не переиспользовал
       чужую программу для этого материала */
    mat.customProgramCacheKey = function () { return 'brix-terrain-splat-v1'; };

    return [t.lush, t.dry, t.dirt, t.rock, t.snow, t.sand, t.deep];
  }

  return { apply: apply, buildTextures: buildTextures };
})();
