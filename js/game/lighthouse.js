// ============================================================
//  brix • js/game/lighthouse.js                    ✅ v0.4.24
//  ЛОКАЦИЯ «МАЯК» на Большом озере: остров с маяком у
//  координат (61, 50) — модель assets/models/lighthouse.glb
//  (генератор — scripts/gen_lighthouse.js, SCALE 2.5, ~70 м).
//
//  ФИЗИКА (как у построек: пол + AABB + цилиндры):
//  - ОСТРОВ: ходьба по камню — высота считается ТОЙ ЖЕ формулой,
//    что рисует меш (шум детерминированный) — ноги точно на камне;
//  - ЛЕСТНИЦА от дна озера к двери: 34 ступени по 0.425 м —
//    ХОДЬБА без прыжков (ступенька игры 0.55);
//  - ПАРКУР на галерею: 5 каменных выступов по спирали на стене,
//    шаг 1.4 м — прыжками (прыжок игрока 1.54) до парапета, и
//    дальше ПАЛУБА-кольцо вокруг башни (17.25 м) + парапет (18.25);
//  - СТЕНЫ базы и БАШНЯ: не пропускают (16 сегментов-AABB + цилиндр).
//  Все числа синхронизированы с gen_lighthouse.js — меняй В ОБОИХ.
// ============================================================
window.BrixLighthouse = (function () {
  'use strict';

  /* ---------- размещение в мире ---------- */
  var MODEL_URL = 'assets/models/lighthouse.glb';
  var X = 61, Z = 50;          // центр острова (координаты с фото игрока)
  var Y0 = 0;                  // уровень «0» модели: пляж/дно совпадают с котловиной
  var SC = 2.5;                // масштаб модели (как в генераторе)
  var STEP_UP = 0.55;          // та же «ступенька», что у построек (building.js)

  /* ---------- шум острова — КОПИЯ формул генератора (1:1) ---------- */
  var PI2 = Math.PI * 2;
  function clampN(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function lerpN(a, b, t) { return a + (b - a) * t; }
  function smoothN(a, b, x) { var t = clampN((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function h3(x, y, z) { var s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
  function n3(x, y, z) {
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    var r = 0;
    for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) for (var k = 0; k < 2; k++)
      r += h3(xi + i, yi + j, zi + k) * (i ? u : 1 - u) * (j ? v : 1 - v) * (k ? w : 1 - w);
    return r;
  }
  function fbm(x, y, z, o) {
    var a = .5, f = 1, s = 0, t = 0;
    for (var i = 0; i < o; i++) { s += a * n3(x * f, y * f, z * f); t += a; a *= .5; f *= 2.03; }
    return s / t;
  }

  /** высота камня острова в ЛОКАЛЬНЫХ НЕМАСШТАБИРОВАННЫХ координатах
      (та же формула, что в surface() генератора; null = за островом) */
  function islandH(xu, zu) {
    var r = Math.hypot(xu, zu);
    if (r > 20) return null;
    var th = Math.atan2(zu, xu), c = Math.cos(th), s = Math.sin(th);
    var R = 13 + 4 * fbm(c * 1.3 + 5, s * 1.3 + 5, 2, 3);
    if (r > R) return null;
    var t = clampN((r - 5.5) / (R - 5.5), 0, 1);
    var h = 2.4 - 3.4 * Math.pow(t, .8);
    var n1 = (fbm(xu * .3, 0, zu * .3, 4) - .5) * 5,
        rg = 1 - Math.abs(2 * fbm(xu * .8, 1.7, zu * .8, 4) - 1);
    h += (n1 + rg * 1.3 - .6) * smoothN(0, .5, t) * (1 - smoothN(.8, 1, t));
    h += (fbm(xu * 3, 2, zu * 3, 3) - .5) * .35 * smoothN(0, .3, t);
    h = lerpN(h, Math.round(h * 2) / 2, .25 * smoothN(.1, .5, t));
    h = lerpN(h, -4.5, smoothN(.82, 1, t));   // юба утоплена в дно озера
    return h;
  }

  /* ---------- геометрия лестницы/выступов (КОПИЯ чисел генератора) ---------- */
  var SA = .35, CS = Math.cos(SA), SN = Math.sin(SA);
  var ST_N = 34, ST_RISE = .17, ST_RUN = .25, ST_BOTTOM = -4.5;
  var LG_N = 5, LG_STEP_Y = .56, LG_STEP_A = .22, LG_Y0 = 4.66, LG_A0 = SA + .12;

  /** AABB повернутого бокса: локальная X (ширина) -> (sinA, -cosA),
      локальная Z (глубина) -> (cosA, sinA); см. box() генератора */
  function rotBox(cxu, czu, wu, du, angA, y0u, y1u) {
    var c = Math.sin(angA), s = Math.cos(angA);      // rotY = PI/2 - angA
    var hw = wu / 2, hd = du / 2;
    var mx = 0, Mx = 0, mz = 0, Mz = 0;
    for (var i = 0; i < 4; i++) {
      var lx = (i & 1 ? hw : -hw), lz = (i & 2 ? hd : -hd);
      var wx = cxu + lx * c + lz * s, wz = czu - lx * s + lz * c;
      if (i === 0) { mx = Mx = wx; mz = Mz = wz; }
      else { mx = Math.min(mx, wx); Mx = Math.max(Mx, wx); mz = Math.min(mz, wz); Mz = Math.max(Mz, wz); }
    }
    return { minX: X + mx * SC, maxX: X + Mx * SC,
             minZ: Z + mz * SC, maxZ: Z + Mz * SC,
             minY: Y0 + y0u * SC, maxY: Y0 + y1u * SC, active: true };
  }

  var boxes = [];        // AABB для controls (_boxBlocked/_resolveBoxes)
  var walk = [];         // боксы, по верху которых можно ХОДИТЬ (floorAt)
  var colliders = [];    // цилиндры для controls (_resolveColliders)

  (function buildColliderData() {
    var bot = Y0 + ST_BOTTOM * SC;
    /* площадка у двери */
    var plat = rotBox(CS * 5.7, SN * 5.7, 1.8, 1.4, SA, ST_BOTTOM, 4.1);
    boxes.push(plat); walk.push(plat);
    /* 34 ступени: топ 4.1-0.17i, от двери до дна озера */
    for (var i = 1; i <= ST_N; i++) {
      var top_ = 4.1 - ST_RISE * i, d = 6.4 + ST_RUN * (i - .5);
      var st = rotBox(CS * d, SN * d, 1.8, ST_RUN + .01, SA, ST_BOTTOM, top_);
      boxes.push(st); walk.push(st);
    }
    /* 5 выступов-паркуров по спирали (верх = yTop) */
    for (var k = 0; k < LG_N; k++) {
      var a = LG_A0 + LG_STEP_A * k, yTop = LG_Y0 + LG_STEP_Y * k;
      var lg = rotBox(Math.cos(a) * 5.75, Math.sin(a) * 5.75, 1.5, 1.5, a, yTop - .3, yTop);
      boxes.push(lg); walk.push(lg);
    }
    /* стена базы: 96 КОРОТКИХ сегментов по кольцу (длинные AABB
       «раздуваются» поворотом и зажимают палубу/выступы).
       Кольцо r 11.9..13.5 м, от дна озера до парапета 7.3 */
    var WR_IN = 4.76, WR_OUT = 5.4, WR_MID = (WR_IN + WR_OUT) / 2, WT = WR_OUT - WR_IN;
    var WSEG = 96;
    for (var s16 = 0; s16 < WSEG; s16++) {
      var wa = (s16 + .5) / WSEG * PI2;
      var seg = rotBox(Math.cos(wa) * WR_MID, Math.sin(wa) * WR_MID,
        2 * WR_MID * Math.tan(Math.PI / WSEG) + .15, WT, wa, ST_BOTTOM, 7.3);
      boxes.push(seg);
    }
    /* башня в центре палубы: точный цилиндр */
    colliders.push({ x: X, z: Z, r: 2.85 * SC, active: true });
  })();

  /* ---------- пол под ногами (контракт как building.floorAt) ---------- */
  var DECK_Y = 6.9 * SC, PARA_Y = 7.3 * SC;
  var TOWER_R = 2.85 * SC, DECK_OUT = 4.88 * SC, PARA_IN = 4.8 * SC, PARA_OUT = 5.3 * SC;

  function floorAt(x, z, feetY) {
    var best = null;
    var lim = feetY + STEP_UP;
    function consider(top) {
      if (top <= lim && (best === null || top > best)) best = top;
    }
    /* камень острова (та же поверхность, что рисуется).
       ✅ БЕЗ ступеньки (как чекблок-насыпи): заплыв/ТП на остров —
       мгновенно стоишь на камне; крутые обрывы «поднимают» сразу.
       Так игрок НЕ ЗАСТРЕВАЕТ в скале ни при ходьбе, ни после ТП */
    var hI = islandH((x - X) / SC, (z - Z) / SC);
    if (hI !== null) {
      var topI = Y0 + hI * SC;
      if (best === null || topI > best) best = topI;
    }
    /* ступени/площадка/выступы */
    for (var i = 0; i < walk.length; i++) {
      var b = walk[i];
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) consider(b.maxY);
    }
    /* палуба-кольцо вокруг башни + парапет.
       ✅ палуба — БЕЗ ступеньки (как чекблок-насыпи): если игрок оказался
       внутри базы (админ-ТП, крайний случай) — мгновенно поднимается НА
       палубу и свободно выходит, никто не застревает под палубой */
    var dx = x - X, dz = z - Z, r2 = dx * dx + dz * dz;
    if (r2 < DECK_OUT * DECK_OUT && r2 > TOWER_R * TOWER_R) {
      if (best === null || DECK_Y > best) best = DECK_Y;
    }
    if (r2 < PARA_OUT * PARA_OUT && r2 > PARA_IN * PARA_IN) consider(PARA_Y);
    return best;
  }

  /* ---------- сборка: модель в сцену ---------- */
  /* ✅ v0.4.28: МАЯК ВРЕМЕННО ВЫКЛЮЧЕН (решение игрока). Файлы НЕ удалены:
     поставь true — маяк снова поедет в мир без других правок */
  var ENABLED = false;
  var inited = false;

  function build(scene, loadModel, yieldProgress) {
    if (!ENABLED) {
      return Promise.resolve({ boxes: [], colliders: [] });
    }
    return loadModel(MODEL_URL).then(function (group) {
      group.position.set(X, Y0, Z);
      /* тени: у статических мешей загрузчик их выключает */
      group.traverse(function (o) {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
      });
      scene.add(group);
      inited = true;
      if (yieldProgress) return yieldProgress(0.3).then(function () {
        return { boxes: boxes, colliders: colliders };
      });
      return { boxes: boxes, colliders: colliders };
    });
  }

  return {
    build: build,
    floorAt: floorAt,
    isReady: function () { return inited; },
    pos: { x: X, z: Z, y: Y0 }
  };
})();
