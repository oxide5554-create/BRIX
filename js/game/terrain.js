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

  var C_GRASS_A = new THREE.Color(0x66773d);
  var C_GRASS_B = new THREE.Color(0x8a8749);
  var C_DIRT = new THREE.Color(0x6e5a3a);
  var C_ROCK = new THREE.Color(0x7c7870);
  var C_SNOW = new THREE.Color(0xdfe5ea);
  var C_SAND = new THREE.Color(0xb3a173);
  var C_DEEP = new THREE.Color(0x2f4340);

  /** Цвет вершины по высоте, крутизне (normal.y) и шумам влажности */
  function colorAt(h, ny, x, z, out) {
    var m = N.fbm(x * 0.02, z * 0.02, S_MOIST, 3);

    // трава: от сочной к сухой по влажности
    out.copy(C_GRASS_A).lerp(C_GRASS_B, m);

    // земля на средних высотах
    var dirtK = N.smoothstep(16, 34, h) * 0.65;
    out.lerp(C_DIRT, dirtK);

    // камень на крутых склонах
    var rockK = N.smoothstep(0.22, 0.48, 1 - ny);
    out.lerp(C_ROCK, rockK);

    // снег на вершинах (держится на пологих участках)
    var snowK = N.smoothstep(44, 58, h) * N.smoothstep(0.3, 0.55, ny);
    out.lerp(C_SNOW, snowK);

    // песчаные пляжи у воды
    var sandK = 1 - N.smoothstep(2.4, 3.8, h);
    out.lerp(C_SAND, sandK);

    // тёмное дно
    var deepK = 1 - N.smoothstep(-3, 1.2, h);
    out.lerp(C_DEEP, deepK * 0.75);

    // мелкая рябь цвета
    var d = N.fbm(x * 0.35, z * 0.35, S_DITHER, 2);
    var k = 0.92 + d * 0.16;
    out.r = Math.min(1, out.r * k);
    out.g = Math.min(1, out.g * k);
    out.b = Math.min(1, out.b * k);
    return out;
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

    // 2) цвета вершин
    var nor = geo.attributes.normal;
    var colors = new Float32Array(total * 3);
    var c = new THREE.Color();
    for (start = 0; start < total; start += CHUNK) {
      end = Math.min(total, start + CHUNK);
      for (i = start; i < end; i++) {
        colorAt(pos.getY(i), nor.getY(i), pos.getX(i), pos.getZ(i), c);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
      await yieldProgress(0.5 + 0.5 * (end / total));
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

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
    buildTerrainGeometry: buildTerrainGeometry
  };
})();
