// ============================================================
//  brix • js/game/terrain.js
//  Ландшафт Brixland: остров с горами (ridged-шум + пики),
//  холмами, озером, пляжами и морем по краям карты.
//  Высота heightAt используется и геометрией, и физикой
//  игрока, так что мир и коллизии всегда совпадают.
//  Полный перенос из lib/game/terrain.ts.
// ============================================================
window.BrixTerrain = (function () {
  'use strict';

  var N = window.BrixNoise;

  var WORLD_SIZE = 900;   // размер карты, условных метров
  var WORLD_HALF = WORLD_SIZE / 2;
  var WATER_LEVEL = 2.2;
  var TERRAIN_SEG = 256;

  // сиды слоёв шума
  var S_HILLS = 1013;
  var S_DETAIL = 2027;
  var S_MOUNT_MASK = 3041;
  var S_MOUNT = 4051;
  var S_MOIST = 5059;
  var S_DITHER = 6067;
  // ✅ v0.4.42 переходы между биомами: отдельные сиды на возмущение
  // границ (крупное «гуляние» линии) и пятна (рваные края биомов)
  var S_TRANS = 7079;
  var S_PATCH = 8081;

  /** Гауссова «шапка» отдельной горы */
  function peak(x, z, cx, cz, sigma, amp) {
    return amp * N.gauss(x, z, cx, cz, sigma);
  }

  /**
   * Высота рельефа в точке мира. Используется и для геометрии,
   * и для физики игрока (высота пола под ногами).
   */
  function heightAt(x, z) {
    var r = Math.sqrt(x * x + z * z) / WORLD_HALF;

    // плато спавна в центре
    var spawnBlend = N.smoothstep(0.14, 0.3, r);

    // холмы
    var hills = (N.fbm(x * 0.012, z * 0.012, S_HILLS, 4) - 0.45) * 30;
    var detail = (N.fbm(x * 0.05, z * 0.05, S_DETAIL, 3) - 0.5) * 3.5;

    // маска горного кольца у краёв карты
    var mountMask = N.smoothstep(0.55, 0.82,
      r + (N.fbm(x * 0.005 + 7.3, z * 0.005 + 2.9, S_MOUNT_MASK, 3) - 0.5) * 0.55);
    var ridge = Math.pow(N.ridged(x * 0.006, z * 0.006, S_MOUNT, 4), 1.3) * 72;

    // отдельные заметные пики
    var peaks =
      peak(x, z, -230, -150, 95, 56) +
      peak(x, z, 255, -230, 105, 64) +
      peak(x, z, -130, 255, 85, 42);

    // котловина озера
    var lakeG = N.gauss(x, z, 170, 150, 110);
    var lakeMask = N.smoothstep(0.15, 0.7, lakeG);

    var h = 5 + spawnBlend * (hills + detail) * (1 - lakeMask * 0.85);
    h += ridge * mountMask;
    h += peaks * N.smoothstep(0.25, 0.45, r);
    h -= 18 * lakeG;

    // море за краем карты
    var edge = N.smoothstep(0.88, 1.02, r);
    h = N.lerp(h, -7, edge);

    return h;
  }

  var MESH_STEP = WORLD_SIZE / TERRAIN_SEG;
  var _meshGrid = null;   // высоты сетки террейна (ленивая инициализация)

  /**
   * ✅ v0.2.9: высота РЕНДЕРИМОЙ поверхности земли в точке.
   * Меш террейна — сетка ~3.5 м с линейной интерполяцией между
   * вершинами, а heightAt — гладкая функция: на буграх объекты,
   * поставленные по heightAt, «висят» над отрисованной землёй.
   * Здесь та же сетка, что у PlaneGeometry(TERRAIN_SEG), билинейно.
   */
  function meshHeightAt(x, z) {
    if (!_meshGrid) {
      _meshGrid = [];
      for (var j = 0; j <= TERRAIN_SEG; j++) {
        var row = [];
        for (var i = 0; i <= TERRAIN_SEG; i++) {
          row.push(heightAt(-WORLD_HALF + i * MESH_STEP, -WORLD_HALF + j * MESH_STEP));
        }
        _meshGrid.push(row);
      }
    }
    var fx = (x + WORLD_HALF) / MESH_STEP;
    var fz = (z + WORLD_HALF) / MESH_STEP;
    var i0 = Math.max(0, Math.min(TERRAIN_SEG - 1, Math.floor(fx)));
    var j0 = Math.max(0, Math.min(TERRAIN_SEG - 1, Math.floor(fz)));
    var tx = Math.min(1, Math.max(0, fx - i0));
    var tz = Math.min(1, Math.max(0, fz - j0));
    var h00 = _meshGrid[j0][i0], h10 = _meshGrid[j0][i0 + 1];
    var h01 = _meshGrid[j0 + 1][i0], h11 = _meshGrid[j0 + 1][i0 + 1];
    var a = h00 + (h10 - h00) * tx;
    var b = h01 + (h11 - h01) * tx;
    return a + (b - a) * tz;
  }

  /* ✅ v0.4.42 НОВАЯ ПАЛИТРА БИОМОВ — сочнее и контрастнее:
     луг зелёный (не болотный), сухостой тёплый, песок пляжный,
     снег чистый с голубиной тенью, камень холоднее, дно бирюзовое */
  var C_GRASS_A = new THREE.Color(0x5c7c30);
  var C_GRASS_B = new THREE.Color(0x9a9150);
  var C_DIRT = new THREE.Color(0x7c6238);
  var C_ROCK = new THREE.Color(0x8b857b);
  var C_SNOW = new THREE.Color(0xecf1f6);
  var C_SAND = new THREE.Color(0xcbb27c);
  var C_DEEP = new THREE.Color(0x29423d);

  /** Рваная граница слоя: максимальное возмущение — на самом краю
      (k≈0.5), там где слой уже «полн» или «пуст» — не трогаем.
      patch — шум 0..1, amt — сила рваности. Без аллокаций. */
  function ragged(k, patch, amt) {
    if (k <= 0 || k >= 1) return k;
    var edge = 1 - Math.abs(2 * k - 1);
    k += (patch - 0.5) * amt * edge;
    return k < 0 ? 0 : (k > 1 ? 1 : k);
  }

  /* ✅ v0.4.42 ВЕСА СЛОЁВ БИОМОВ + КРАСИВЫЕ ПЕРЕХОДЫ.
     Отличия от старой раскраски:
     1) граница каждого биома «гуляет» крупным шумом (±4.5 м) —
        линии трава→земля→снег→песок живые, не ровные полосы;
     2) края рваные пятнами (ragged) — островки снега на кромке,
        лоскуты песка на пляже, проплешины земли на лугу;
     3) те же веса едут в геометрию (brixSplat) и едят текстуры
        в шейдере (terrainlook.js) — карта и мир выглядят ОДНО.
     Результат пишется в общий пул _ks (без аллокаций в цикле). */
  var _ks = { moist: 0, dirtK: 0, rockK: 0, snowK: 0, sandK: 0, deepK: 0 };
  function biomeKsAt(h, ny, x, z) {
    var moist = N.fbm(x * 0.02, z * 0.02, S_MOIST, 3);
    // крупное возмущение границ: двигает высотные пороги биомов
    var wobble = (N.fbm(x * 0.013, z * 0.013, S_TRANS, 3) - 0.5) * 9.0;
    // мелкие пятна: рвут край на лоскуты
    var patch = N.fbm(x * 0.09, z * 0.09, S_PATCH, 2);

    // трава: от сочной к сухой по влажности (с пятнистостью тона)
    _ks.moist = Math.min(1, Math.max(0, moist + (patch - 0.5) * 0.35));

    // земля на средних высотах — граница гуляет, край рваный
    var dirtEdge = 16 + wobble;
    _ks.dirtK = ragged(N.smoothstep(dirtEdge, dirtEdge + 16, h) * 0.68, patch, 0.5);

    // камень на крутых склонах
    _ks.rockK = ragged(N.smoothstep(0.2, 0.52, 1 - ny), patch, 0.45);

    // снег на вершинах (держится на пологих участках), снеговая линия гуляет
    var snowLine = 44 + wobble * 1.2;
    _ks.snowK = ragged(N.smoothstep(snowLine, snowLine + 13, h) *
      N.smoothstep(0.28, 0.56, ny), patch, 0.55);

    // песчаные пляжи у воды — полоса мягче и край рванее
    var sandEdge = 2.5 + wobble * 0.4;
    _ks.sandK = ragged(1 - N.smoothstep(sandEdge, sandEdge + 1.9, h), patch, 0.55);

    // тёмное дно
    _ks.deepK = 1 - N.smoothstep(-3, 1.2, h);
    return _ks;
  }

  /** Цвет вершины по высоте, крутизне (normal.y) и шумам влажности.
      ✅ v0.4.42: использует biomeKsAt — миникарта (minimenu.js)
      раскрашивается ТЕМИ ЖЕ рваными границами, что и мир. */
  function colorAt(h, ny, x, z, out) {
    var ks = biomeKsAt(h, ny, x, z);

    // трава: от сочной к сухой по влажности
    out.copy(C_GRASS_A).lerp(C_GRASS_B, ks.moist);

    // земля на средних высотах
    out.lerp(C_DIRT, ks.dirtK);

    // камень на крутых склонах
    out.lerp(C_ROCK, ks.rockK);

    // снег на вершинах
    out.lerp(C_SNOW, ks.snowK);

    // песчаные пляжи у воды
    out.lerp(C_SAND, ks.sandK);

    // тёмное дно
    out.lerp(C_DEEP, ks.deepK * 0.75);

    // мелкая рябь цвета
    var d = N.fbm(x * 0.35, z * 0.35, S_DITHER, 2);
    var k = 0.92 + d * 0.16;
    out.r = Math.min(1, out.r * k);
    out.g = Math.min(1, out.g * k);
    out.b = Math.min(1, out.b * k);
    return out;
  }

  /** ✅ v0.4.42: тип поверхности под ногами — для следов (footprints.js).
      0 — обычная (трава/земля/камень), 1 — песок, 2 — снег.
      Берёт высоту РЕНДЕРИМОЙ сетки (meshHeightAt) — следы совпадают
      с тем, что игрок видит. */
  function surfaceAt(x, z) {
    var h = meshHeightAt(x, z);
    var e = 0.6;
    var sx = (meshHeightAt(x + e, z) - meshHeightAt(x - e, z)) / (2 * e);
    var sz = (meshHeightAt(x, z + e) - meshHeightAt(x, z - e)) / (2 * e);
    var ny = 1 / Math.sqrt(1 + sx * sx + sz * sz);
    var ks = biomeKsAt(h, ny, x, z);
    if (ks.sandK > 0.5) return 1;
    if (ks.snowK > 0.45) return 2;
    return 0;
  }

  /**
   * Строит геометрию ландшафта построчно, отдавая прогресс —
   * это и есть «реальная загрузка» мира.
   */
  async function buildTerrainGeometry(yieldProgress) {
    var geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, TERRAIN_SEG, TERRAIN_SEG);
    geo.rotateX(-Math.PI / 2);

    var pos = geo.attributes.position;
    var total = pos.count;
    var CHUNK = 2000;
    var start, end, i;

    // 1) высоты
    for (start = 0; start < total; start += CHUNK) {
      end = Math.min(total, start + CHUNK);
      for (i = start; i < end; i++) {
        pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
      }
      await yieldProgress(end / total);
    }

    geo.computeVertexNormals();

    // 2) цвета вершин + ✅ v0.4.42 splat-веса биомов для шейдера
    //    (brixSplat: земля/камень/снег/песок, brixSplat2: дно/влажность —
    //    terrainlook.js смешивает по ним ПРОЦЕДУРНЫЕ ТЕКСТУРЫ)
    var nor = geo.attributes.normal;
    var colors = new Float32Array(total * 3);
    var splat = new Float32Array(total * 4);
    var splat2 = new Float32Array(total * 2);
    var c = new THREE.Color();
    for (start = 0; start < total; start += CHUNK) {
      end = Math.min(total, start + CHUNK);
      for (i = start; i < end; i++) {
        var vx = pos.getX(i), vz = pos.getZ(i);
        colorAt(pos.getY(i), nor.getY(i), vx, vz, c);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
        splat[i * 4] = _ks.dirtK;
        splat[i * 4 + 1] = _ks.rockK;
        splat[i * 4 + 2] = _ks.snowK;
        splat[i * 4 + 3] = _ks.sandK;
        splat2[i * 2] = _ks.deepK;
        splat2[i * 2 + 1] = _ks.moist;
      }
      await yieldProgress(0.5 + 0.5 * (end / total));
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('brixSplat', new THREE.BufferAttribute(splat, 4));
    geo.setAttribute('brixSplat2', new THREE.BufferAttribute(splat2, 2));

    return geo;
  }

  return {
    WORLD_SIZE: WORLD_SIZE,
    WORLD_HALF: WORLD_HALF,
    WATER_LEVEL: WATER_LEVEL,
    TERRAIN_SEG: TERRAIN_SEG,
    heightAt: heightAt,
    meshHeightAt: meshHeightAt,
    colorAt: colorAt,
    surfaceAt: surfaceAt,
    biomeKsAt: biomeKsAt,
    buildTerrainGeometry: buildTerrainGeometry
  };
})();
