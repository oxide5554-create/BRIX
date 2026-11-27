// ============================================================
//  brix • js/game/road.js
//  ✅ v0.4.40 ЕДИНСТВЕННАЯ ГРУНТОВАЯ ДОРОГА Brixland — НОВАЯ, ВОКРУГ
//  ОЗЕРА. Что изменилось к v0.4.39 (по просьбе игрока «сделай дорогу
//  другую» — старая жала по КРАЯМ карты W→S→E):
//  1) МАРШРУТ: открытая цепочка (НЕ кольцо) длиной ~1500 м, идёт ВОКРУГ
//     БОЛЬШОГО ОЗЕРА — главной достопримечательности карты — и через
//     ЦЕНТР карты: от юго-западной низины вдоль южного берега озера,
//     вверх по восточному берегу, через северный берег и вниз по северо-
//     западу к западному побережью. Разрыв цепи — на западе (между
//     стартом и финишем ~245 м). Маршрут проверен скриптом по реальному
//     рельефу (road_check3.js, поверхность meshHeightAt): все 1500 точек
//     пути — нигде ни воды (<2.8), ни снега (>44); максимальный уклон
//     0.65 (33° — горная грунтовка на восточном подъёме).
//  2) БОЛЬШЕ И ЯРЧЕ: ширина 3.8 м (было 3.2), тона подняты по яркости
//     и раздвинуты по контрасту — светлая выбитая пыль в следе колёс,
//     тёмная мокрая земля в промоинах, рыжая глина пятнами, серая
//     гравийная крошка. Полосатость по длине (~25-30 м) сохранена.
//  3) НА КАРТЕ (M) дорога по-прежнему ПРОСТАЯ ПРОРИСОВАННАЯ ЛИНИЯ —
//     теми же пикселями, что горы и земля (minimenu.buildMapImage
//     спрашивает mapMask), линия стала чуть жирнее.
//  Трава и деревья дорогу не перечеркивают (world.js спрашивает near()).
// ============================================================
window.BrixRoad = (function () {
  'use strict';

  var N = window.BrixNoise;

  /* контрольные точки маршрута (проверены road_check3.js по meshHeightAt:
     min h = 3.2, max h = 40.7 — вода < 2.2, снег > 44 — ни разу;
     макс. уклон 0.65). Порядок: ЮЗ низина → южный берег озера →
     восточный берег → северный берег → северо-запад → западное побережье */
  var WP = [
    [-55, 55], [-5, -25], [45, -55], [85, -70], [125, -60],
    [170, -45], [220, -55], [270, -75], [298, -45], [318, -5],
    [320, 40], [330, 100], [330, 170], [300, 215],
    [308, 240], [318, 262], [322, 285], [314, 295], [300, 301],
    [280, 303], [238, 307], [225, 309], [210, 310], [198, 311],
    [186, 312], [174, 312], [160, 309], [148, 305], [128, 298],
    [95, 297], [55, 295], [10, 290],
    [-40, 252], [-80, 230], [-120, 216], [-160, 208],
    [-195, 198], [-255, 135], [-300, 70]
  ];

  var WIDTH = 3.8;       // ширина дороги, м (v0.4.40: было 3.2)
  var LIFT = 0.07;       // над рельефом, м (иначе полосит z-fighting)
  var SAMPLES = 1100;    // точек полилинии (шаг ≈ 1.4 м)

  /* ✅ v0.5.23 СВОЙ ПУТЬ ДОРОГИ НА КАЖДОЙ КАРТЕ (пользователь: «свой
     путь дороги»): у карты с сидом > 0 маршрут ГЕНЕРИРУЕТСЯ — детерминиро-
     ванный ПСЧ от сида шагает от спавна к краям, огибая воду и крутые
     склоны (высота из T.heightAt — она уже по сиду). У BrixLand (сид 0)
     остаётся проверенный маршрут WP — карта не меняется. */
  function makeWps() {
    var T = window.BrixTerrain;
    var seed = (window.BRIX_TERRAIN_SEED || 0) | 0;
    /* ✅ v0.5.24: путь генерируется на ЛЮБОЙ карте — рельеф стал
       архипелагом, старый фиксированный WP (сид 0) проходил бы по
       океану. WP остаётся только как аварийный путь без BrixTerrain */
    if (!T) return WP;
    var a = (seed ^ 0x68BC21EB) >>> 0;
    function nxt() {
      a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
      return a / 4294967296;
    }
    var wps = [];
    var x = -40 + nxt() * 40, z = -40 + nxt() * 40;   // старт у спавна
    var ang = nxt() * Math.PI * 2;
    var steps = 30 + Math.floor(nxt() * 10);          // 30..39 сегментов
    for (var s = 0; s < steps; s++) {
      ang += (nxt() - 0.5) * 1.1;                     // извилистость
      var len = 42 + nxt() * 26;                      // сегмент 42..68 м
      var cx = 0, cz = 0, ok = false;
      for (var t = 0; t < 6; t++) {                   // до 6 попыток сегмента
        var na = ang + (t ? (nxt() - 0.5) * 1.6 : 0); // отклонить курс
        var nx = x + Math.cos(na) * len, nz = z + Math.sin(na) * len;
        var rr = Math.sqrt(nx * nx + nz * nz);
        if (rr > 385) continue;                      // не уходим в море
        var h = T.heightAt(nx, nz);
        if (h < 3.2 || h > 42) continue;             // ни воды, ни снежников
        var sl = Math.max(
          Math.abs(T.heightAt(nx + 4, nz) - T.heightAt(nx - 4, nz)),
          Math.abs(T.heightAt(nx, nz + 4) - T.heightAt(nx, nz - 4))) / 8;
        if (sl > 0.5) continue;                      // не пропасть
        cx = Math.round(nx); cz = Math.round(nz);
        ang = na;
        ok = true;
        break;
      }
      if (!ok) break;                                // упёрлись — хватит
      wps.push([cx, cz]);
      x = cx; z = cz;
    }
    if (wps.length < 8) return WP;                   // защита от вырождения
    return wps;
  }

  /* тона дороги (v0.4.40 «ярче и контрастнее») — линейные RGB 0..1.
     Диапазоны подобраны по квантилям шума вдоль пути:
     n1: 5%=0.26, 50%=0.50, 95%=0.73 — пороги сжаты к центру,
     иначе при игровом свете (hemi 1.15 + sun 3.0) пятна «съедаются» */
  var C_BASE = [0.553, 0.466, 0.310];  // 0x8d774f утоптанная земля (светлее)
  var C_DARK = [0.259, 0.196, 0.114];  // 0x42321d тёмная мокрая земля
  var C_LIGHT = [0.796, 0.713, 0.502]; // 0xcbB680 светлая выбитая пыль
  var C_RED = [0.631, 0.416, 0.255];   // 0xa16a41 рыжеватая глина
  var C_EDGE = [0.439, 0.427, 0.271];  // 0x706d45 смесь с травой (края)

  var PTS = null;        // [{x, z}] — сглаженный путь (открытый Catmull-Rom)

  /* открытый Catmull-Rom по контрольным точкам (без THREE — нужен и
     на карте до построения сцены) */
  function crPoint(p, t) {
    var n = p.length - 1;
    var f = t * n, i = Math.min(n - 1, Math.floor(f)), u = f - i;
    var P0 = p[Math.max(0, i - 1)], P1 = p[i], P2 = p[i + 1], P3 = p[Math.min(n, i + 2)];
    var u2 = u * u, u3 = u2 * u;
    var out = [0, 0];
    for (var k = 0; k < 2; k++) {
      out[k] = 0.5 * ((2 * P1[k]) + (-P0[k] + P2[k]) * u +
        (2 * P0[k] - 5 * P1[k] + 4 * P2[k] - P3[k]) * u2 +
        (-P0[k] + 3 * P1[k] - 3 * P2[k] + P3[k]) * u3);
    }
    return out;
  }

  function ensurePts() {
    if (PTS) return PTS;
    var wps = makeWps();   /* ✅ v0.5.23: свой маршрут для карты с сидом */
    PTS = [];
    for (var s = 0; s < SAMPLES; s++) {
      var p = crPoint(wps, s / (SAMPLES - 1));
      PTS.push({ x: p[0], z: p[1] });
    }
    return PTS;
  }

  /** многотонный цвет дороги в точке (x, z). band: 0 = левый край,
      1 = центр (след колёс), 2 = правый край. Возвращает [r, g, b] */
  function roadColor(x, z, band) {
    var r, g, b;
    /* крупный шум: пятна тона — мокрая тёмная земля ↔ светлая пыль */
    var n1 = N.fbm(x * 0.09, z * 0.09, 7717, 3);
    r = C_BASE[0]; g = C_BASE[1]; b = C_BASE[2];
    if (n1 < 0.47) {
      var kd = Math.min(1, (0.47 - n1) / 0.17);    // 0..1 к тёмной земле
      r += (C_DARK[0] - r) * kd;
      g += (C_DARK[1] - g) * kd;
      b += (C_DARK[2] - b) * kd;
    } else if (n1 > 0.53) {
      var kl = Math.min(1, (n1 - 0.53) / 0.2);     // к светлой пыли
      r += (C_LIGHT[0] - r) * kl;
      g += (C_LIGHT[1] - g) * kl;
      b += (C_LIGHT[2] - b) * kl;
    }
    /* средняя крапчатость: мелкие промоины/проталины между пятнами */
    var n3 = N.fbm(x * 0.22, z * 0.22, 9103, 2);
    var km = Math.max(0, (n3 - 0.5) / 0.22) * 0.5;
    r += (C_DARK[0] - r) * km;
    g += (C_DARK[1] - g) * km;
    b += (C_DARK[2] - b) * km;
    /* рыжая глина — узкая полоса по уровню шума (пятна, не везде) */
    var kr = Math.max(0, 1 - Math.abs(n1 - 0.5) / 0.11) * 0.9;
    r += (C_RED[0] - r) * kr;
    g += (C_RED[1] - g) * kr;
    b += (C_RED[2] - b) * kr;
    /* мелкая крошка: камешки/песчинки ±22% (v0.4.40 контрастнее) */
    var n2 = 0.78 + N.fbm(x * 0.35, z * 0.35, 8291, 2) * 0.44;
    r *= n2; g *= n2; b *= n2;
    /* след колёс: центр выбит заметно светлее и чуть желтее */
    if (band === 1) { r *= 1.10; g *= 1.08; b *= 1.03; }
    /* края: темнее и уходят в траву — дорога «вросла» в луг */
    if (band !== 1) {
      r += (C_EDGE[0] - r) * 0.6;
      g += (C_EDGE[1] - g) * 0.6;
      b += (C_EDGE[2] - b) * 0.6;
    }
    return [Math.min(1, r), Math.min(1, g), Math.min(1, b)];
  }

  /** близко ли к дороге (для травы/деревьев world.js): dist < m → true.
      точек много и они плотные (1.4 м) — квадраты расстояний до точек */
  function near(x, z, m) {
    var pts = ensurePts();
    var m2 = m * m;
    for (var i = 0; i < pts.length; i++) {
      var dx = pts[i].x - x, dz = pts[i].z - z;
      if (dx * dx + dz * dz < m2) return true;
    }
    return false;
  }

  /** лента дороги по рельефу. T = window.BrixTerrain. Возвращает
      { mesh, dispose } — mesh добавить в сцену, dispose в disposables.
      ТРИ вершины на поперечник (край/центр/край) + вершинные цвета */
  function build(scene, T) {
    var pts = ensurePts();
    var n = pts.length;
    var pos = new Float32Array(n * 3 * 3);
    var col = new Float32Array(n * 3 * 3);
    var idx = [];
    for (var i = 0; i < n; i++) {
      // направление и поперечник
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      var dx = b.x - a.x, dz = b.z - a.z;
      var len = Math.sqrt(dx * dx + dz * dz) || 1;
      var lx = -dz / len, lz = dx / len;          // влево от хода
      var hw = WIDTH / 2;
      for (var band = 0; band < 3; band++) {
        var sgn = band === 0 ? 1 : (band === 1 ? 0 : -1);
        var x = pts[i].x + lx * hw * sgn;
        var z = pts[i].z + lz * hw * sgn;
        var y = T.meshHeightAt(x, z) + LIFT;
        var o = (i * 3 + band) * 3;
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
        var c = roadColor(pts[i].x, pts[i].z, band);
        /* полосатость ПО ДЛИНЕ пути: чередование светлых/тёмных
           вытоптанных участков каждые ~25-30 м — гарантированная
           многотонность в любом месте дороги */
        var rowMix = 0.76 + 0.48 * Math.sin(i * 0.09 + 2.3 * Math.sin(i * 0.013));
        col[o] = Math.min(1, c[0] * rowMix);
        col[o + 1] = Math.min(1, c[1] * rowMix);
        col[o + 2] = Math.min(1, c[2] * rowMix);
      }
      if (i < n - 1) {
        // две полосы: (левый, центр) и (центр, правый)
        var L0 = i * 3, C0 = i * 3 + 1, R0 = i * 3 + 2;
        var L1 = L0 + 3, C1 = C0 + 3, R1 = R0 + 3;
        idx.push(L0, L1, C0, C0, L1, C1);
        idx.push(C0, C1, R0, R0, C1, R1);
      }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    // нормали вверх — дорога освещается как земля
    var nrm = new Float32Array(n * 3 * 3);
    for (var j = 0; j < n * 3; j++) nrm[j * 3 + 1] = 1;
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));

    var mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,          // цвет ЗАДАЁТ вершина (много тонов)
      vertexColors: true,
      roughness: 1, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    mesh.userData.isRoad = true;
    scene.add(mesh);
    return {
      mesh: mesh,
      dispose: function () {
        scene.remove(mesh);
        geo.dispose();
        mat.dispose();
      }
    };
  }

  /** маска дороги для КАРТЫ (minimenu.buildMapImage рисует её «как землю»).
      mask — Float32Array[MAP_PX*MAP_PX]; stamp-диски по точкам пути.
      v0.4.40: линия чуть жирнее (+1.0 px) и плотнее к центру */
  function mapMask(MAP_PX, HALF) {
    var pts = ensurePts();
    var mask = new Float32Array(MAP_PX * MAP_PX);
    var k = MAP_PX / (HALF * 2);          // мировых ед. → пиксели
    var rPx = Math.max(1.6, WIDTH / 2 * k + 1.0);   // жирнее — линия видна
    var r2 = rPx * rPx;
    for (var i = 0; i < pts.length; i++) {
      var px = (pts[i].x + HALF) * k;
      var pz = (pts[i].z + HALF) * k;
      var x0 = Math.max(0, Math.floor(px - rPx)), x1 = Math.min(MAP_PX - 1, Math.ceil(px + rPx));
      var z0 = Math.max(0, Math.floor(pz - rPx)), z1 = Math.min(MAP_PX - 1, Math.ceil(pz + rPx));
      for (var iz = z0; iz <= z1; iz++) {
        for (var ix = x0; ix <= x1; ix++) {
          var ddx = ix - px, ddz = iz - pz;
          var d2 = ddx * ddx + ddz * ddz;
          if (d2 >= r2) continue;
          var v = 1 - 0.35 * Math.sqrt(d2) / rPx;   // мягкий край, плотный центр
          var o = iz * MAP_PX + ix;
          if (v > mask[o]) mask[o] = v;
        }
      }
    }
    return mask;
  }

  return {
    build: build,
    near: near,
    mapMask: mapMask,
    points: ensurePts,
    WIDTH: WIDTH
  };
})();
