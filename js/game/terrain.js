// ============================================================
//  brix • js/game/terrain.js
//  ✅ v0.5.24 АРХИПЕЛАГ ПО СИДУ: карта — не один круглый остров,
//  а 4-6 островов (главный + 3-5 спутников), между ними — ВОДА.
//  Каждая вайп-карта получает СВОЙ архипелаг: число островов,
//  их размер и разброс, высота гор (пиков) и амплитуда холмов
//  зависят от сида — «рельеф, размер и горы» меняются полностью.
//  Пустых мест нет: всё вне островов — океан (высота -7).
//  Высота heightAt используется и геометрией, и физикой игрока,
//  так что мир и коллизии всегда совпадают.
//  ЗЕРКАЛО 1:1 на сервере — server.js brixLayout/brixHeightAt
//  (проверка: node scripts/check-terrain-sync.js <сид>).
// ============================================================
window.BrixTerrain = (function () {
  'use strict';

  var N = window.BrixNoise;

  /* ✅ v0.5.25: мир увеличен 900 → 2000 м (просьба владельца «карты
     маленькие») — большой остров + 3 малых далеко в океане */
  var WORLD_SIZE = 2000;   // размер карты, условных метров
  var WORLD_HALF = WORLD_SIZE / 2;
  var WATER_LEVEL = 2.2;
  var TERRAIN_SEG = 400;   // ✅ v0.5.25: больше сегментов под большой мир (шаг ~5 м)

  // сиды слоёв шума
  var S_HILLS = 1013;
  var S_DETAIL = 2027;
  var S_MOIST = 5059;
  var S_DITHER = 6067;
  // ✅ v0.4.42 переходы между биомами: отдельные сиды на возмущение
  // границ (крупное «гуляние» линии) и пятна (рваные края биомов)
  var S_TRANS = 7079;
  var S_PATCH = 8081;
  /* ✅ v0.5.24 береговая линия: шум «рваного» края островов */
  var S_COAST = 10101;
  /* ✅ v0.5.22 ПУСТЫНЯ И АРКТИКА (вайп-мир): крупный шум ТЕМПЕРАТУРЫ
     делит карту на климатические зоны. Включается сервером
     (welcome/status.biomes → window.BRIX_BIOMES = 1) только на
     BrixWipe — BrixLand остаётся прежним */
  var S_TEMP = 9099;

  /* ✅ v0.4.64 СВОЙ РЕЛЬЕФ НА КАЖДОМ СЕРВЕРЕ: гамма-смещение сидов.
     BrixPvP ставит window.BRIX_TERRAIN_SEED = 77701 ДО генерации —
     арена «Пепел» получает ПОЛНОСТЬЮ другой ландшафт (холмы, горы,
     озеро, биомы), а не копию BrixLand. 0 — стандартный Brixland */
  function seedOff() { return (window.BRIX_TERRAIN_SEED || 0) * 7919; }

  /* ✅ v0.5.24 ПЛАН АРХИПЕЛАГА ПО СИДУ (1:1 с server.js brixLayout —
     МЕНЯТЬ ТОЛЬКО В ОБОИХ ФАЙЛАХ СРАЗУ!): острова {x, z, r, peaks[]},
     озеро на главном острове и амплитуда холмов. Главный остров
     (спавн) стоит у центра, 3-5 спутников разбросаны по квадрату
     карты — у каждой вайп-карты СВОЙ архипелаг: число островов,
     размер, разброс, высота гор. Всё вне островов — океан. */
  var _layoutSeed = -1, _layout = null;
  function layoutAt() {
    var seed = (window.BRIX_TERRAIN_SEED || 0) | 0;
    if (_layoutSeed === seed && _layout) return _layout;
    var islands, lake = null, hillAmp, spawn;
    if (!seed) {
      /* соло/режим вкладок без сервера: красивый фиксированный архипелаг */
      /* ✅ v0.5.25 БОЛЬШАЯ КАРТА: мир 2000x2000 м — ОДИН большой остров
         (спавн, озеро, 2 горы) + 3 малых ДАЛЕКО в океане. Копия 1:1 в terrain.js! */
      islands = [
        { x: 0, z: 0, r: 430, peaks: [
          { x: 80, z: -160, r: 120, a: 70 },
          { x: -170, z: 110, r: 80, a: 40 }
        ] },
        { x: -750, z: -330, r: 140, peaks: [{ x: -730, z: -300, r: 60, a: 48 }] },
        { x: 730, z: -420, r: 120, peaks: [{ x: 700, z: -390, r: 52, a: 40 }] },
        { x: 640, z: 640, r: 150, peaks: [{ x: 610, z: 610, r: 64, a: 52 }] }
      ];
      lake = { x: 180, z: -160, r: 90 };
      hillAmp = 20;
      spawn = { x: 365, z: -30 };   /* ✅ v0.5.26: спавн у берега */
    } else {
      /* новая карта: детерминированный ПСЧ от сида (одинаковый у сервера) */
      var a = (seed ^ 0x9E3779B9) >>> 0;
      function nxt() {
        a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
        return a / 4294967296;
      }
      /* ✅ v0.5.25 БОЛЬШАЯ КАРТА (просьба владельца «карты маленькие,
         сделай большую»): мир 2000x2000 м. Ровно 4 острова: ОДИН большой
         (спавн, озеро, 2 горы) + 3 малых — ДАЛЕКО в океане (680-800 м от
         центра), между ними и большим островом всегда открытое море.
         Копия 1:1 в terrain.js layoutAt — МЕНЯТЬ В ОБОИХ ФАЙЛАХ СРАЗУ! */
      /* главный остров: БОЛЬШОЙ, у центра (±90 м), радиус 400..470 */
      const mx = Math.round((nxt() - 0.5) * 180);
      const mz = Math.round((nxt() - 0.5) * 180);
      const mr = Math.round(400 + nxt() * 70);
      hillAmp = 12 + Math.round(nxt() * 14);      // амплитуда холмов 12..26
      const mPeaks = [];
      /* большая гора (55..85 м) — подальше от плато спавна */
      {
        const pa = nxt() * Math.PI * 2, pd = mr * (0.5 + nxt() * 0.25);
        mPeaks.push({
          x: Math.round(mx + Math.cos(pa) * pd),
          z: Math.round(mz + Math.sin(pa) * pd),
          r: Math.round(mr * (0.20 + nxt() * 0.10)), a: Math.round(55 + nxt() * 30)
        });
      }
      /* вторая гора поменьше (26..46 м) */
      {
        const pa2 = nxt() * Math.PI * 2, pd2 = mr * (0.45 + nxt() * 0.25);
        mPeaks.push({
          x: Math.round(mx + Math.cos(pa2) * pd2),
          z: Math.round(mz + Math.sin(pa2) * pd2),
          r: Math.round(mr * (0.15 + nxt() * 0.08)), a: Math.round(26 + nxt() * 20)
        });
      }
      islands = [{ x: mx, z: mz, r: mr, peaks: mPeaks }];
      /* ровно 3 малых острова-спутника — ДАЛЕКО в океане (680..800 м от
         центра, прежняя «кучка у центра» убрана) */
      const baseA = nxt() * Math.PI * 2;
      for (let i = 0; i < 3; i++) {
        const ang = baseA + i * (Math.PI * 2 / 3) + (nxt() - 0.5) * 0.5;
        const dist = 680 + nxt() * 120;           // 680..800 от центра
        let r = Math.round(100 + nxt() * 60);     // 100..160
        const lim = 930 - dist;                   // не вылезать за край мира
        if (r > lim) r = Math.max(80, Math.round(lim));
        const cx = Math.round(Math.cos(ang) * dist);
        const cz = Math.round(Math.sin(ang) * dist);
        const pa3 = nxt() * Math.PI * 2, pd3 = r * 0.3 * nxt();
        islands.push({
          x: cx, z: cz, r: r,
          peaks: [{
            x: Math.round(cx + Math.cos(pa3) * pd3),
            z: Math.round(cz + Math.sin(pa3) * pd3),
            r: Math.round(r * (0.3 + nxt() * 0.15)),
            a: Math.round(28 + nxt() * 27)        // 28..55 м
          }]
        });
      }
      /* озеро на главном острове (70% карт), вне плато спавна */
      if (nxt() < 0.7) {
        const la = nxt() * Math.PI * 2, ld = 260 + nxt() * 90;
        lake = {
          x: Math.round(mx + Math.cos(la) * ld),
          z: Math.round(mz + Math.sin(la) * ld),
          r: Math.round(60 + nxt() * 35)          // сигма 60..95
        };
      }
      /* ✅ v0.5.26 СПАВН У БЕРЕГА: плато на побережье главного острова
         (~1.15 сигмы от центра, у кромки воды). Копия 1:1 с server.js! */
      var sa = nxt() * Math.PI * 2;
      var sd = Math.round(mr * 1.15);
      spawn = {
        x: Math.round(mx + Math.cos(sa) * sd),
        z: Math.round(mz + Math.sin(sa) * sd)
      };
    }
    _layout = { islands: islands, lake: lake, hillAmp: hillAmp, spawn: spawn };
    _layoutSeed = seed;
    return _layout;
  }
  /** точки островов/озера текущей карты (лоадер — для текста) */
  function layoutInfo() { return layoutAt(); }

  /**
   * Высота рельефа в точке мира. Используется и для геометрии,
   * и для физики игрока (высота пола под ногами).
   * ✅ v0.5.24: АРХИПЕЛАГ — базовая высота океан (-7), каждый остров
   * поднимает рельеф своей гауссовой маской с РВАНЫМ берегом (шум
   * S_COAST), внутри — холмы по сиду + свои пики-горы. Плато спавна
   * на главном острове, озеро тонет в рельефе. Край мира (по квадрату,
   * не по кругу!) уходит в океан.
   */
  function heightAt(x, z) {
    /* ✅ v0.4.65 ПВП-АРЕНА: плоская локация вместо рельефа — бетонная
       равнина 0.8 м с лёгкой детализацией, море остаётся за краем.
       Никаких холмов/гор/озера — арена «ПОЛИГОН» строится поверх. */
    if (window.BRIX_PVP_FLAT) {
      var flatR = Math.sqrt(x * x + z * z) / WORLD_HALF;
      var flatEdge = N.smoothstep(0.88, 1.02, flatR);
      /* 3.2 — ВЫШЕ уровня моря (2.2), иначе арена «тонет» и на карте вода */
      return N.lerp(3.2 + (N.fbm(x * 0.05, z * 0.05, S_DETAIL + seedOff(), 2) - 0.5) * 0.22, -7, flatEdge);
    }
    var LY = layoutAt();
    var h = -7;                                    // океанское дно
    for (var i = 0; i < LY.islands.length; i++) {
      var I = LY.islands[i];
      var dx = x - I.x, dz = z - I.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d > I.r * 1.5) continue;                 // далеко от острова — маска 0
      /* рваная береговая линия: радиус острова «гуляет» шумом */
      var wob = (N.fbm(x * 0.02 + 7.7, z * 0.02 + 3.3, S_COAST + seedOff(), 3) - 0.5) * 0.4;
      var rn = d / I.r + wob;
      var k = 1 - N.smoothstep(0.6, 1.1, rn);      // 1 в центре острова, 0 за берегом
      if (k <= 0) continue;
      /* локальный рельеф острова: холмы (амплитуда по сиду) + деталь */
      var base = 4.2
        + (N.fbm(x * 0.012, z * 0.012, S_HILLS + seedOff() + i * 17, 4) - 0.45) * LY.hillAmp
        + (N.fbm(x * 0.05, z * 0.05, S_DETAIL + seedOff(), 3) - 0.5) * 3.5;
      /* свои горы-пики (гауссовы шапки) */
      var pk = 0;
      for (var pi = 0; pi < I.peaks.length; pi++) {
        var P = I.peaks[pi];
        pk += P.a * N.gauss(x, z, P.x, P.z, P.r);
      }
      var kh = -7 + (base + pk + 7) * k;
      if (kh > h) h = kh;                          // острова складываются максимумом
    }
    /* плато спавна — ровная площадка У БЕРЕГА (✅ v0.5.26: центр —
       LY.spawn из плана архипелага, раньше был центр карты (0,0)) */
    var sx = LY.spawn ? LY.spawn.x : 0, sz = LY.spawn ? LY.spawn.z : 0;
    var dm = Math.sqrt((x - sx) * (x - sx) + (z - sz) * (z - sz));
    if (dm < 95) h = N.lerp(5.4, h, N.smoothstep(45, 95, dm));   /* ✅ v0.5.26: площадка шире — гарантированная суша у берега */
    /* котловина озера — только вне плато спавна */
    if (LY.lake) {
      var lakeG = N.gauss(x, z, LY.lake.x, LY.lake.z, LY.lake.r);
      if (lakeG > 0.01) h -= 16 * lakeG * N.smoothstep(70, 105, dm);
    }
    /* край мира — ПО КВАДРАТУ (не по кругу): карта занимает весь
       экран, угол не «срезается» кругом */
    var edge = N.smoothstep(0.94, 1.04, Math.max(Math.abs(x), Math.abs(z)) / WORLD_HALF);
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
  /* ✅ v0.5.22: температура точки 0..1 (крупный шум с рваными краями).
     0..0.32 — арктика (вечный снег), 0.62..1 — пустыня (пески и кактусы) */
  function tempAt(x, z) {
    return N.fbm(x * 0.0012 + 31.7, z * 0.0012 + 11.3, S_TEMP + seedOff(), 3);
  }
  /** ✅ v0.5.22: климат точки для растительности — 'desert' | 'arctic' | null.
     Пороги выровнены с отрисовкой песка/снега в biomeKsAt: кактусы растут
     ровно там, где рисуется песок, зимние ели — где снег */
  function climateAt(x, z) {
    if (!window.BRIX_BIOMES) return null;
    var t = tempAt(x, z);
    if (t >= 0.62) return 'desert';
    if (t <= 0.36) return 'arctic';
    return null;
  }
  function biomeKsAt(h, ny, x, z) {
    var moist = N.fbm(x * 0.02, z * 0.02, S_MOIST + seedOff(), 3);
    // крупное возмущение границ: двигает высотные пороги биомов
    var wobble = (N.fbm(x * 0.013, z * 0.013, S_TRANS + seedOff(), 3) - 0.5) * 9.0;
    // мелкие пятна: рвут край на лоскуты
    var patch = N.fbm(x * 0.09, z * 0.09, S_PATCH + seedOff(), 2);

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

    /* ✅ v0.5.22 КЛИМАТИЧЕСКИЕ ЗОНЫ (только вайп-мир, BRIX_BIOMES=1):
       жара → ПУСТЫНЯ (пески до горизонта, снега нет), холод → АРКТИКА
       (вечный снег почти от воды, песков нет). Границы гуляют тем же
       крупным шумом + рваные пятна — переходы живые, не прямые линии */
    if (window.BRIX_BIOMES) {
      var temp = tempAt(x, z);
      var desertK = ragged(N.smoothstep(0.58, 0.70, temp), patch, 0.4);
      var arcticK = ragged(1 - N.smoothstep(0.30, 0.42, temp), patch, 0.4);
      if (desertK > 0) {
        _ks.sandK = Math.max(_ks.sandK, desertK);
        _ks.moist = Math.max(_ks.moist, 0.92);   // сухая трава на кромке пустыни
        _ks.snowK *= (1 - desertK);
        _ks.dirtK *= (1 - desertK);
      }
      if (arcticK > 0) {
        _ks.snowK = Math.max(_ks.snowK, arcticK * N.smoothstep(0.16, 0.34, ny));
        _ks.sandK *= (1 - arcticK);
        _ks.moist = Math.min(_ks.moist, 0.35);
      }
    }
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
    /* ✅ v0.5.22: климат точки ('desert'/'arctic'/null) — кактусы и
       зимние ели в world.js, следы в песке/снегу (footprints) */
    climateAt: climateAt,
    tempAt: tempAt,
    /* ✅ v0.5.23: план карты (озеро/пики по сиду) — road.js строит
       СВОЙ путь, лоадер показывает «карта №сид» */
    layoutInfo: layoutInfo,
    buildTerrainGeometry: buildTerrainGeometry
  };
})();
