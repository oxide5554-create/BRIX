// ============================================================
//  brix • js/game/firstperson.js
//  РУКИ ОТ 1-ГО ЛИЦА — порт scr/3d/firstPersonPlayer.js из
//  репозитория (vldSL05/rust-like → oxide5554-create/-glm).
//
//  Подход РЕПОЗИТОРА (как в шутерах):
//  - РУКИ БЕРУТСЯ ОТ 3D-МОДЕЛИ ИГРОКА (player_claude.glb):
//    полный риг Mixamo, IK рук, пальцы обхватывают рукоять.
//  - Руки + оружие рендерятся в ОТДЕЛЬНОЙ СЦЕНЕ поверх мира:
//    handsScene + статичная handsCamera (renderer.clearDepth).
//  - В 1-м лице видны только меши с материалом *arms*,
//    остальное тело скрыто (_applyVisibility).
//  - КАМЕННЫЙ ТОПОР (stone_axe.glb — та же модель, что в v0.2.3) и
//    КАМЕННАЯ КИРКА (stone_pickaxe.glb) держит ОДНА правая рука,
//    машут как раньше: atk1/atk2 (два чередующихся замаха).
//  - ✅ v0.2.10 ЖЕЛЕЗНАЯ КИРКА (pickaxe.glb) — теперь ТОЖЕ ОДНА правая рука
//    ТОЧНО КАК ТОПОР: тот же хват, тот же размер (0.58 м), ЛЕВАЯ РУКА СКРЫТА,
//    удар atk1; голова кирки повёрнута ВПЕРЁД (а не влево)
//  - ✅ v0.2.9 ЖЕЛЕЗНЫЙ ТОПОР (iron_axe.glb — модель пользователя
//    simple_axe.glb) — ОДНА правая рука, машет ОДНИМ ударом atk1
//    (без второго замаха), ЛЕВАЯ РУКА СКРЫТА: кости левой руки
//    схлопываются (scale→0), в 1-м лице видна только правая рука.
//  - Анимации: idle (дыхание) + atk1/atk2 (топор и каменная кирка) +
//    atkP — удар железной кирки ПО ПРЯМОЙ (с v0.2.10 не используется).
//
//  Публичный API (совместим со старым BrixFirstPerson):
//    new BrixFirstPerson(camera, renderer)
//    .loaded, .visible, .camera
//    .setWeapon('axe'|'pickaxe'|'ironPickaxe'|'ironAxe'|null) — оружие из хотбара
//    .setVisible(bool)      — совместимость: топор вкл/выкл
//    .triggerSwing('atk1'|'atk2')
//    .update(dt, opts)
//    .renderOverlay()       — рендер рук поверх мира (после renderer.render)
//    .dispose()
// ============================================================
window.BrixFirstPerson = (function () {
  'use strict';

  var D = Math.PI / 180;

  // Хват топора (из preview-claude.html репозитория)
  var GRIP = { sS: 0.52, sC: 1.0, sT: 0.8, sG: 0.14, sX: 0.72, sP: 0.032, sR: 90 };
  var ARMS_SCALE = 1.4;
  var AXE_TARGET_LEN = 0.55; // длина топора в руке, м
  var AXE_YAW = 0;           // доворот головы топора вокруг рукояти (град)

  // ✅ КАМЕННАЯ КИРКА — одна правая рука, машет как топор (как в v0.2.4)
  var GRIP_SPICK = Object.assign({}, GRIP);
  var SPICK_TARGET_LEN = 0.55; // длина каменной кирки в руке, м
  var SPICK_YAW = 0;           // доворот головы вокруг рукояти (град)

  // ✅ v0.2.8 ЖЕЛЕЗНАЯ КИРКА была ДВУРУКОЙ
  // ✅ v0.2.10 железная кирка — ТОЧНО КАК ТОПОР: одна правая рука,
  //    левая скрыта, тот же хват и тот же размер рукояти в руке
  var GRIP_PICKAXE = Object.assign({}, GRIP);
  var PICKAXE_TARGET_LEN = 0.58;   // длина железной кирки в руке, м — как у топора
  var PICKAXE_PIVOT_Y = 0;         // сдвиг кирки по рукояти (в единицах модели)
  var PICKAXE_YAW = 0;             // ✅ v0.2.10: доворот головы кирки вокруг рукояти.
                                   // шипы кирки теперь ВПЕРЁД (по направлению удара),
                                   // а не влево-вправо (было 90 в v0.2.8/v0.2.9)

  // ✅ v0.2.9 ЖЕЛЕЗНЫЙ ТОПОР — одна правая рука, левая скрыта,
  // один удар atk1 (без бокового замаха atk2)
  var GRIP_IRONAXE = Object.assign({}, GRIP);
  var IRON_AXE_TARGET_LEN = 0.58;  // длина железного топора в руке, м
  var IRON_AXE_YAW = 180;          // ✅ v0.3.6: топор смотрит ВПЕРЁД (был развёрнут на игрока)
                                   // лезвие железного топора смотрит ВПЕРЁД-ВПРАВО
                                   // ТОЧНО КАК У КАМЕННОГО ТОПОРА (широкая грань
                                   // видна игроку, кромка по направлению удара);
                                   // в v0.2.9 было 90 — лезвие стояло «ребром» влево

  var PLAYER_URL = 'assets/models/player_claude.glb';
  var AXE_URL = 'assets/models/stone_axe.glb';        // ✅ каменный топор — модель из v0.2.3
  var SPICK_URL = 'assets/models/stone_pickaxe.glb';  // каменная кирка
  var PICKAXE_URL = 'assets/models/pickaxe.glb';      // железная кирка (модель пользователя)
  var IRON_AXE_URL = 'assets/models/iron_axe.glb';    // ✅ v0.2.9 железный топор (simple_axe.glb)
  /* ✅ v0.4.5 РЕВОЛЬВЕР (модель пользователя colt_detective_gun.glb).
     Модель приходит сразу в метрах (~19 см по длине). ДЕРЖАНИЕ СВОЁ,
     не как у топора: рукоять в правой ладони, СТВОЛ ВПЕРЁД, левая
     рука подхватывает снизу. Анимации: отдача выстрела (shoot),
     перезарядка — оружие опускается ВНИЗ и возвращается (reload),
     прицеливание — плавное подведение к глазам (aim) */
  var REVOLVER_URL = 'assets/models/revolver.glb';
  var REV_TARGET_LEN = 0.30;   // длина револьвера в руке, м
  // довороты модели в кисти (подбирались по скриншотам): ствол — вперёд (-Z)
  var REV_ROT = { x: 0, y: 0, z: -25 };      // ствол вперёд-вровень (модель: ствол = +X)
  var REV_POS = { x: 0.02, y: 0.02, z: 0 };

  // Камера рук (должна совпадать с renderOverlay) — ЗНАЧЕНИЯ ИЗ РЕПОЗИТОРА:
  // позиция (0, 1.7, 0), прицел (0, 1.0, 5).
  var HANDS_CAM_POS = null;    // создаются после THREE
  var HANDS_CAM_TARGET = null;
  var CAM_TARGET_Y = 1.0;

  // ✅ Авто-подгонка ИНСТРУМЕНТА под хват (порт fitPickaxeLikeAxe из репозитория).
  // Модель может иметь любой pivot/ориентацию: находим длинную ось
  // (рукоять), конец с головой (там шире), ось головы — и приводим к виду
  // топора: рукоять вдоль +Y, голова вверху, НИЖНИЙ КОНЕЦ РУКОЯТИ в (0,0,0).
  function fitToolLikeAxe(proto, targetLen) {
    proto.updateMatrixWorld(true);
    var inv = proto.matrixWorld.clone().invert();
    var P = [], v = new THREE.Vector3();
    proto.traverse(function (o) {
      if (!(o.isMesh && o.geometry && o.geometry.attributes.position)) return;
      var a = o.geometry.attributes.position;
      var m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      for (var i = 0; i < a.count; i++) {
        v.fromBufferAttribute(a, i).applyMatrix4(m);
        P.push(v.x, v.y, v.z);
      }
    });
    var n = P.length / 3;
    if (n < 4) return;
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (var i2 = 0; i2 < n; i2++) {
      for (var k = 0; k < 3; k++) {
        var c = P[i2 * 3 + k];
        if (c < mn[k]) mn[k] = c;
        if (c > mx[k]) mx[k] = c;
      }
    }
    var size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
    var L = size.indexOf(Math.max(size[0], size[1], size[2]));   // длинная ось = рукоять
    if (size[L] < 1e-6) return;
    var o1 = (L + 1) % 3, o2 = (L + 2) % 3;
    // боковой размах у двух концов рукояти (первые/последние 25%)
    var span = function (lo, hi) {
      var a = [Infinity, Infinity], b = [-Infinity, -Infinity];
      for (var j = 0; j < n; j++) {
        var f = (P[j * 3 + L] - mn[L]) / size[L];
        if (f < lo || f > hi) continue;
        var x1 = P[j * 3 + o1], x2 = P[j * 3 + o2];
        if (x1 < a[0]) a[0] = x1;
        if (x1 > b[0]) b[0] = x1;
        if (x2 < a[1]) a[1] = x2;
        if (x2 > b[1]) b[1] = x2;
      }
      return [b[0] - a[0], b[1] - a[1]];
    };
    var lowS = span(0, 0.25), highS = span(0.75, 1);
    var headHigh = Math.max(highS[0], highS[1]) >= Math.max(lowS[0], lowS[1]);
    var headS = headHigh ? highS : lowS;
    var latAxis = headS[0] >= headS[1] ? o1 : o2;                // ось головы (самая широкая)
    var ex = new THREE.Vector3().setComponent(latAxis, 1);
    var ey = new THREE.Vector3().setComponent(L, headHigh ? 1 : -1);
    var ez = new THREE.Vector3().crossVectors(ex, ey);
    proto.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, ey, ez).transpose());
    var sc = targetLen / size[L];
    proto.scale.setScalar(sc);
    // нижний конец рукояти (центр сечения) → в начало координат
    var endV = headHigh ? mn[L] : mx[L];
    var end = new THREE.Vector3(), cnt = 0, s1 = 0, s2 = 0;
    for (var j2 = 0; j2 < n; j2++) {
      var f2 = (P[j2 * 3 + L] - mn[L]) / size[L];
      if ((headHigh && f2 <= 0.08) || (!headHigh && f2 >= 0.92)) {
        s1 += P[j2 * 3 + o1]; s2 += P[j2 * 3 + o2]; cnt++;
      }
    }
    end.setComponent(L, endV);
    end.setComponent(o1, cnt ? s1 / cnt : 0);
    end.setComponent(o2, cnt ? s2 / cnt : 0);
    proto.position.copy(end.multiplyScalar(sc).applyQuaternion(proto.quaternion).negate());
    proto.updateMatrixWorld(true);
    console.log('[BrixFirstPerson] инструмент: длинная ось=' + 'xyz'[L] +
      ', голова на ' + (headHigh ? '+' : '-') + ', ось головы=' + 'xyz'[latAxis]);
  }

  // Базовая поза (общая)
  var IDLE = {
    hy: 0, sx: 2, sy: 0, hx: 0,
    ltx: 4, ltk: 6, rtx: -3, rtk: 8,
    rx: 0.22, ry: -0.62, rz: 0.5, rphi: 28, ryaw: 6, roll: 90, curl: 0.9, thumb: 0.8,
    lx: -0.25, ly: -0.85, lz: 0.12, lcurl: 0.35
  };

  // Поза idle с ТОПОРОМ
  var FIDLE_AXE = Object.assign({}, IDLE, {
    sx: 0, hx: 0,
    rx: 0.12, ry: 0.08, rz: 0.8, rphi: 35, ryaw: 8, roll: 90, curl: 0.9,
    lx: -0.1, ly: -0.05, lz: 0.72, lcurl: 0.3
  });

  // ✅ Поза idle с ЖЕЛЕЗНОЙ КИРКОЙ (две руки на рукояти; левая ставится сама).
  // ✅ v0.2.8: кирка держится БЛИЖЕ к груди и ПО ЦЕНТРУ (rx↓, rz↓) — раньше
  // она висела в 0.5 м впереди справа, и левая рука (размах 0.55 м)
  // НЕ ДОТЯГИВАЛАСЬ до рукояти на 13 см — хват был кривой.
  // ОСИ: rx — вбок (Rt), ry — вверх/вниз (Ut), rz — вперёд (Ft)
  var FIDLE_PICK = Object.assign({}, FIDLE_AXE, {
    rx: 0.02, ry: 0.02, rz: 0.52,   // кирка перед грудью: не у самого лица,
                                    // но в досягаемости левой руки
    curl: 0.95                       // наклон как у топора (rphi 35, ryaw 8)
  });

  // ✅ v0.4.5 поза idle с РЕВОЛЬВЕРом: правая рука перед грудью, ладонь
  // вертикальна (rphi 0 — ствол вперёд), левая подхватывает снизу
  var FIDLE_REV = Object.assign({}, IDLE, {
    sx: 0, hx: 0,
    rx: 0.20, ry: 0.22, rz: 0.50, rphi: 0, ryaw: 0, roll: 90, curl: 0.95, thumb: 0.95,
    lx: 0.06, ly: 0.02, lz: 0.62, lcurl: 0.6
  });

  // ✅ v0.4.5 поза ПРИЦЕЛИВАНИЯ: рука выше и дальше, ствол вровень взгляду
  // (камера рук при этом чуть поднимается — см. renderOverlay)
  var FPOSE_AIM = Object.assign({}, FIDLE_REV, {
    rx: 0.02, ry: 0.38, rz: 0.58, rphi: 18, ryaw: 0, curl: 1, thumb: 1,
    lx: 0.05, ly: 0.12, lz: 0.56, lcurl: 0.7
  });

  function lerpP(a, b, t) {
    var o = {};
    for (var k in a) o[k] = (typeof a[k] === 'number' && typeof b[k] === 'number') ? a[k] + (b[k] - a[k]) * t : a[k];
    return o;
  }

  var mk = function (base) {
    return function (t, p, e) { return { t: t, p: Object.assign({}, base, p), e: e }; };
  };
  var k1Axe = mk(FIDLE_AXE);
  var k1Pick = mk(FIDLE_PICK);
  var k1Rev = mk(FIDLE_REV);   // ✅ v0.4.5: кейфреймы револьвера

  var CL = {
    atk1: {
      dur: 1.2,
      keys: [
        k1Axe(0,    {}),
        k1Axe(0.10, { rx: 0.30, rphi: 10, curl: 1 }),
        k1Axe(0.35, { rx: 0.55, rphi: -10, curl: 1 }),
        k1Axe(0.38, { rx: 0.55, rphi: -10, curl: 1 }),
        k1Axe(0.55, { rx: -0.30, rphi: 80, curl: 1 }, 'in'),
        k1Axe(0.62, { rx: -0.25, rphi: 75, curl: 1 }),
        k1Axe(1.20, {})
      ]
    },
    atk2: {
      dur: 1.2,
      keys: [
        k1Axe(0,    {}),
        k1Axe(0.08, { rx: 0.10, ry: 0.15, rphi: 15, curl: 1 }),
        k1Axe(0.20, { rx: 0.35, ry: 0.40, rphi: -5, curl: 1 }),
        k1Axe(0.35, { rx: 0.50, ry: 0.55, rphi: -20, curl: 1 }),
        k1Axe(0.38, { rx: 0.50, ry: 0.55, rphi: -20, curl: 1 }),
        k1Axe(0.50, { rx: -0.10, ry: 0.10, lz: 0.85, rphi: 60, curl: 1 }, 'in'),
        k1Axe(0.56, { rx: -0.35, ry: -0.35, lz: 1.00, rphi: 85, curl: 1 }, 'in'),
        k1Axe(0.62, { rx: -0.30, ry: -0.30, lz: 0.95, rphi: 80, curl: 1 }),
        k1Axe(0.75, { rx: -0.15, ry: -0.15, lz: 0.85, rphi: 70, curl: 1 }),
        k1Axe(1.20, {})
      ]
    },
    // ✅ atkP — ОДИН удар киркой ПО ПРЯМОЙ: замах строго вверх (ry +),
    // удар строго вниз (ry −), без бокового заноса (rx ≈ 0).
    // Левая рука следует за рукоятью сама (IK каждый кадр).
    atkP: {
      dur: 0.9,
      keys: [
        k1Pick(0,    {}),
        k1Pick(0.16, { rx: -0.02, ry: 0.42, rz: 0.72, rphi: 8,  curl: 1, sx: 0 }),
        k1Pick(0.32, { rx: -0.02, ry: 0.55, rz: 0.75, rphi: -8, curl: 1, sx: 0 }),
        k1Pick(0.42, { rx: -0.04, ry: -0.10, rz: 0.62, rphi: 95,  curl: 1, sx: 0 }, 'in'),
        k1Pick(0.52, { rx: -0.04, ry: -0.16, rz: 0.58, rphi: 100, curl: 1, sx: 0 }),
        k1Pick(0.90, {})
      ]
    },
    /* ✅ v0.4.5 ОТДАЧА ВЫСТРЕЛА (0.35 с ≈ кулдаун 0.3 с): рука резко
       подаётся ВВЕРХ-НАЗАД (ry+ = вверх, rz− = к себе), кисть откидывается
       стволом вверх (rphi−), затем плавно возвращается */
    shoot: {
      dur: 0.35,
      keys: [
        k1Rev(0,    {}),
        k1Rev(0.09, { ry: 0.05, rz: 0.40, rphi: -10, sx: -1.4 }),
        k1Rev(0.17, { ry: 0.042, rz: 0.415, rphi: -8, sx: -1 }),
        k1Rev(0.35, {})
      ]
    },
    /* ✅ v0.4.5 ПЕРЕЗАРЯДКА (2.2 с = RELOAD_DUR в gameworld.js): оружие
       плавно опускается ВНИЗ-ВПЕРЕД (игрок «опускает револьвер вниз» —
       без спец-анимации барабана), держится внизу, в конце поднимается */
    reload: {
      dur: 2.2,
      keys: [
        k1Rev(0,    {}),
        k1Rev(0.42, { ry: -0.30, rz: 0.30, rx: 0.22, rphi: 26, curl: 1, sx: 5 }, 'in'),
        k1Rev(0.62, { ry: -0.36, rz: 0.26, rx: 0.24, rphi: 30, curl: 1, sx: 6 }),
        k1Rev(1.70, { ry: -0.36, rz: 0.26, rx: 0.24, rphi: 30, curl: 1, sx: 6 }),
        k1Rev(1.95, { ry: -0.12, rz: 0.38, rx: 0.10, rphi: 12, curl: 0.97, sx: 3 }),
        k1Rev(2.2,  {})
      ]
    }
  };

  function sm(u) { return u * u * (3 - 2 * u); }

  function sample(keys, tn) {
    var i = 0;
    while (i < keys.length - 2 && tn >= keys[i + 1].t) i++;
    var a = keys[i], b = keys[i + 1];
    var u = Math.min(1, Math.max(0, (tn - a.t) / (b.t - a.t)));
    u = b.e === 'in' ? u * u * u : sm(u);
    var o = {};
    for (var k in a.p) o[k] = a.p[k] + (b.p[k] - a.p[k]) * u;
    return o;
  }

  /* ============================================================ */

  function FirstPersonPlayer(camera, renderer) {
    this.camera = camera;
    this.renderer = renderer || null;

    HANDS_CAM_POS = new THREE.Vector3(0, 1.7, 0);
    HANDS_CAM_TARGET = new THREE.Vector3(0, CAM_TARGET_Y, 5);

    this.handsScene = new THREE.Scene();

    // Свет на руки (как в репозитории)
    this.handsScene.add(new THREE.HemisphereLight(0xcfe0ff, 0x3a2e24, 0.8));
    var sun = new THREE.DirectionalLight(0xfff0dc, 2.3);
    sun.position.set(3, 5, 3.5);
    this.handsScene.add(sun);
    var rim = new THREE.DirectionalLight(0x7fa8ff, 1.1);
    rim.position.set(-3, 2.5, -3);
    this.handsScene.add(rim);
    var fill = new THREE.DirectionalLight(0xffc9a0, 0.5);
    fill.position.set(-3, 1, 3);
    this.handsScene.add(fill);

    this.handsCamera = new THREE.PerspectiveCamera(74, 1, 0.02, 200);

    this.model = null;
    this.axe = null;          // {holder, wrap} — каменный топор
    this.stonePick = null;    // {holder, wrap} — каменная кирка
    this.ironPick = null;     // {holder, wrap} — железная кирка
    this.ironAxe = null;      // {holder, wrap} — железный топор (v0.2.9)
    this.revolver = null;     // {holder, wrap} — револьвер (v0.4.5)
    this.axeHolder = null;    // ссылки для совместимости
    this.pickaxeHolder = null;
    this.handBone = null;
    this.loaded = false;
    this.visible = false;
    this._firstPerson = true;
    this._swingType = null;
    this._animTime = 0;
    this._clock = 0;
    this.currentWeapon = 'none';
    this._aiming = false;     // ✅ v0.4.5: ПКМ — прицеливание
    this._aimBlend = 0;       // 0..1 — плавное подведение к глазам

    this._load();
  }

  /* ---------- загрузка моделей игрока и топора ---------- */
  FirstPersonPlayer.prototype._load = function () {
    var self = this;
    function loadModel(url) {
      return new Promise(function (ok, no) {
        BrixGLB.load(url, function (group) { ok(group); }, no);
      });
    }
    Promise.all([
      loadModel(PLAYER_URL),
      loadModel(AXE_URL),
      loadModel(SPICK_URL),
      loadModel(PICKAXE_URL),
      loadModel(IRON_AXE_URL)
    ]).then(function (r) {
      self._init(r[0], r[1], r[2], r[3], r[4]);
      // ✅ v0.4.5: револьвер грузится ОТДЕЛЬНО (на file:// его нет во
      // встроенных моделях — руки остаются работоспособными без него)
      loadModel(REVOLVER_URL).then(function (rvg) {
        if (self._attachRevolver) self._attachRevolver(rvg);
      }).catch(function () {
        console.warn('[BrixFirstPerson] револьвер не загрузился (запускай через сервер) — руки работают, револьвер будет без модели');
      });
      console.log('[BrixFirstPerson] руки готовы: топоры, кирки (v0.4.5, револьвер догружается отдельно)');
    }).catch(function (err) {
      console.error('[BrixFirstPerson] ошибка загрузки:', err);
      if (window.BrixFatal) {
        window.BrixFatal('не загрузились модели рук (' + (err && err.message ? err.message : err) + ') — в папке игры нет assets/models/player_claude.glb, stone_axe.glb, stone_pickaxe.glb, pickaxe.glb или iron_axe.glb (запускай через START-GAME.bat)');
      }
    });
  };

  /* ---------- сборка: риг, кости, кадры кистей, топор, кирка ---------- */
  FirstPersonPlayer.prototype._init = function (pg, ag, spg, pkg, iag) {
    var model = pg;
    this.model = model;
    this.handsScene.add(model);

    model.updateMatrixWorld(true);
    // модель в сантиметрах? (Hips высоко) → ×0.01
    var hipsY = null;
    var findHips = function (o) {
      if (!o || hipsY !== null) return;
      if (o.isBone && /Hips/i.test(o.name || '')) {
        var p = new THREE.Vector3();
        o.getWorldPosition(p);
        hipsY = p.y; return;
      }
      if (o.children) for (var i = 0; i < o.children.length; i++) findHips(o.children[i]);
    };
    findHips(model);
    if (hipsY !== null && hipsY > 50) {
      model.scale.multiplyScalar(0.01);
      model.updateMatrixWorld(true);
      console.log('[BrixFirstPerson] масштаб модели: ×0.01');
    }

    // меши (скелетные — SkinnedMesh)
    var meshes = [];
    var walkShadows = function (o) {
      if (!o) return;
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        o.frustumCulled = false;
        meshes.push(o);
      }
      if (o.children) for (var i = 0; i < o.children.length; i++) walkShadows(o.children[i]);
    };
    walkShadows(model);
    model.updateMatrixWorld(true);
    this.meshes = meshes;

    // кости: имя без mixamorig: и суффикса _NN
    var B = {}, rest = {};
    var walkBones = function (o) {
      if (!o) return;
      if (o.isBone) {
        var k = (o.name || '').replace(/^mixamorig:?/, '').replace(/_\d+$/, '');
        B[k] = o;
      }
      if (o.children) for (var i = 0; i < o.children.length; i++) walkBones(o.children[i]);
    };
    walkBones(model);
    this.bones = B;
    for (var k in B) {
      var b = B[k];
      rest[k] = {
        q: b.quaternion.clone(),
        s: b.scale.clone(),
        wq: b.getWorldQuaternion(new THREE.Quaternion())
      };
    }
    this.rest = rest;

    var wp = function (bone) { return bone.getWorldPosition(new THREE.Vector3()); };
    var UP = new THREE.Vector3(0, 1, 0);
    var RT = wp(B.RightShoulder).clone().sub(wp(B.LeftShoulder)).setY(0).normalize();
    var FW = new THREE.Vector3().crossVectors(UP, RT);
    var LF = RT.clone().negate();
    this.UP = UP; this.RT = RT; this.FW = FW; this.LF = LF;
    this.REST_ANKLE = wp(B.LeftFoot).y;

    // кадры кистей: вперёд (f), вверх (a), нормаль (c/n), длина ладони
    var HF = {}, AXC = {}, AXF = {}, AXN = {}, SG = {};
    var loc = function (key, v) { return v.clone().applyQuaternion(rest[key].wq.clone().invert()); };
    ['Left', 'Right'].forEach(function (s) {
      var h = wp(B[s + 'Hand']);
      var m = wp(B[s + 'HandMiddle1']);
      var i2 = wp(B[s + 'HandIndex1']);
      var pk = wp(B[s + 'HandPinky1']);
      var f = m.clone().sub(h);
      var palmLen = f.length(); f.normalize();
      var a = i2.clone().sub(pk);
      a.addScaledVector(f, -a.dot(f)).normalize();
      var c = new THREE.Vector3().crossVectors(f, a);
      var n = c.clone();
      if (n.dot(new THREE.Vector3(-h.x, 0, 0)) < 0) n.negate();
      HF[s] = {
        f: f, a: a, c: c, n: n, palmLen: palmLen, h0: h.clone(),
        wq: rest[s + 'Hand'].wq.clone(),
        inv: B[s + 'Hand'].matrixWorld.clone().invert(),
        ws: new THREE.Vector3().setFromMatrixScale(B[s + 'Hand'].matrixWorld).x
      };
      SG[s] = {
        curl: Math.sign(new THREE.Vector3().crossVectors(a, f).dot(n)) || 1,
        tf:   Math.sign(c.dot(n)) || 1,
        tn:   Math.sign(new THREE.Vector3().crossVectors(n, a).dot(f)) || 1
      };
      ['Index', 'Middle', 'Ring', 'Pinky'].forEach(function (F) {
        [1, 2, 3].forEach(function (kn) {
          var key = s + 'Hand' + F + kn;
          AXC[key] = loc(key, a);
        });
      });
      [1, 2, 3].forEach(function (kn) {
        var key = s + 'HandThumb' + kn;
        AXF[key] = loc(key, f);
        AXN[key] = loc(key, n);
      });
    });
    this.HF = HF; this.AXC = AXC; this.AXF = AXF; this.AXN = AXN; this.SG = SG;

    /* ✅ сборка ИНСТРУМЕНТА: авто-подгонка (pivot модели не важен) →
       обёртка (wrap) хранит подгонку, а хват (placeLikeAxe) двигает
       ТОЛЬКО holder — подгонка не затирается */
    var self = this;
    var walkMat = function walkMat(o) {
      if (!o) return;
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        o.frustumCulled = false;
        var m = o.material;
        if (m) {
          m.side = THREE.DoubleSide;
          if (m.map) m.map.anisotropy = 8;
          m.metalness = 0;
          m.roughness = Math.max(m.roughness !== undefined ? m.roughness : 1, 0.75);
        }
      }
      if (o.children) for (var i = 0; i < o.children.length; i++) walkMat(o.children[i]);
    };
    var makeTool = function (proto, targetLen, yawDeg, pivotY) {
      fitToolLikeAxe(proto, targetLen);
      if (yawDeg) proto.rotateY(yawDeg * D); // доворот головы вокруг рукояти
      proto.position.y += pivotY;
      walkMat(proto);
      var wrap = new THREE.Group();
      wrap.add(proto);
      var holder = new THREE.Group();
      holder.add(wrap);
      B.RightHand.add(holder);
      holder.visible = false;
      return { holder: holder, wrap: wrap };
    };

    /* КАМЕННЫЙ ТОПОР — модель stone_axe.glb (как в v0.2.3) */
    this.axe = makeTool(ag, AXE_TARGET_LEN, AXE_YAW, 0);
    this.axeHolder = this.axe.holder;
    /* КАМЕННАЯ КИРКА — одна правая рука, машет как топор */
    this.stonePick = makeTool(spg, SPICK_TARGET_LEN, SPICK_YAW, 0);
    /* ЖЕЛЕЗНАЯ КИРКА — две руки, один удар по прямой */
    this.ironPick = makeTool(pkg, PICKAXE_TARGET_LEN, PICKAXE_YAW, PICKAXE_PIVOT_Y);
    this.pickaxeHolder = this.ironPick.holder;
    /* ✅ ЖЕЛЕЗНЫЙ ТОПОР (v0.2.9) — одна правая рука, левая скрыта */
    this.ironAxe = makeTool(iag, IRON_AXE_TARGET_LEN, IRON_AXE_YAW, 0);

    /* ✅ v0.4.5 РЕВОЛЬВЕР — СВОЯ сборка (не как у топора): модель уже
       в метрах (~19 см), масштаб по габаритам, довороты REV_ROT подбирают
       «ствол вперёд, рукоять в ладонь». Сборку вызывает конструктор после
       отдельной загрузки модели (_attachRevolver) */
    this._attachRevolver = function (rvg) {
      if (self.revolver) return;
      rvg.updateMatrixWorld(true);
      var box = new THREE.Box3().setFromObject(rvg);
      var size = box.getSize(new THREE.Vector3());
      var sc = REV_TARGET_LEN / Math.max(size.x, size.y, size.z, 1e-6);
      rvg.scale.setScalar(sc);
      walkMat(rvg);
      var wrap = new THREE.Group();
      wrap.add(rvg);
      var holder = new THREE.Group();
      holder.add(wrap);
      B.RightHand.add(holder);
      holder.visible = self.currentWeapon === 'revolver' && self.visible;
      self.revolver = { holder: holder, wrap: wrap };
      console.log('[BrixFirstPerson] револьвер в руках готов');
    };

    this.handBone = B.RightHand;

    this._poseHelpers();

    this.loaded = true;
    // ✅ v0.4.5: восстанавливаем ТО ЖЕ оружие, что выбрал хотбар
    // (раньше setVisible(this.visible) всегда ставил 'axe' и перетирал
    // револьвер сразу после загрузки моделей)
    this.setWeapon(this.currentWeapon === 'none' ? null : this.currentWeapon);

    // для хотбара: топор считается выбранным, если setVisible(true)
  };

  /* ---------- помощники поз (setWQ / IK / кисти / пальцы) ---------- */
  FirstPersonPlayer.prototype._poseHelpers = function () {
    var self = this;
    var B = this.bones, rest = this.rest;
    var wp = function (b) { return b.getWorldPosition(new THREE.Vector3()); };

    this.setWQ = function (b, q) {
      var pq = b.parent.getWorldQuaternion(new THREE.Quaternion());
      b.quaternion.copy(pq.invert().multiply(q));
      b.updateMatrixWorld(true);
    };
    this.rotW = function (b, ax, ang) {
      self.setWQ(b, new THREE.Quaternion().setFromAxisAngle(ax, ang).multiply(b.getWorldQuaternion(new THREE.Quaternion())));
    };
    this.aimW = function (b, from, to) {
      self.setWQ(b, new THREE.Quaternion().setFromUnitVectors(from, to).multiply(b.getWorldQuaternion(new THREE.Quaternion())));
    };

    // двухкостный IK (плечо-предплечье-кисть) с полюсом локтя
    this.ik = function (arm, fore, hand, target, pole) {
      var S = wp(arm), E = wp(fore), W = wp(hand);
      var l1 = E.distanceTo(S), l2 = W.distanceTo(E);
      var d = target.clone().sub(S);
      var dist = Math.min(d.length(), l1 + l2 - 1e-4);
      dist = Math.max(dist, Math.abs(l1 - l2) + 1e-3);
      d.normalize();
      var x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
      var h = Math.sqrt(Math.max(l1 * l1 - x * x, 0));
      var p = pole.clone().addScaledVector(d, -pole.dot(d)).normalize();
      var En = S.clone().addScaledVector(d, x).addScaledVector(p, h);
      self.aimW(arm, E.clone().sub(S).normalize(), En.clone().sub(S).normalize());
      var E2 = wp(fore), W2 = wp(hand), T2 = S.clone().addScaledVector(d, dist);
      self.aimW(fore, W2.clone().sub(E2).normalize(), T2.clone().sub(E2).normalize());
    };

    this.orientHand = function (side, f2, a2) {
      var H = self.HF[side];
      var m0 = new THREE.Matrix4().makeBasis(H.f, H.a, H.c);
      var m1 = new THREE.Matrix4().makeBasis(f2, a2, new THREE.Vector3().crossVectors(f2, a2));
      var qm = new THREE.Quaternion().setFromRotationMatrix(m1.multiply(m0.clone().transpose()));
      self.setWQ(self.bones[side + 'Hand'], qm.multiply(H.wq));
    };

    var q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
    this.fingers = function (side, curl, thumb) {
      var g = self.SG[side];
      ['Index', 'Middle', 'Ring', 'Pinky'].forEach(function (F, fi) {
        [70, 80, 55].forEach(function (deg, n) {
          var k = side + 'Hand' + F + (n + 1);
          var mult = [1, 1.05, 1.1, 1.15][fi];
          self.bones[k].quaternion.copy(rest[k].q)
            .multiply(q1.setFromAxisAngle(self.AXC[k], g.curl * deg * D * curl * mult));
        });
      });
      [[35, 22], [30, 8], [30, 4]].forEach(function (pair, n) {
        var k = side + 'HandThumb' + (n + 1);
        self.bones[k].quaternion.copy(rest[k].q)
          .multiply(q1.setFromAxisAngle(self.AXF[k], g.tf * pair[0] * D * thumb))
          .multiply(q2.setFromAxisAngle(self.AXN[k], g.tn * pair[1] * D * thumb));
      });
    };

    this.reach = function (s) {
      var a = wp(self.bones[s + 'Arm']), e = wp(self.bones[s + 'ForeArm']);
      return a.distanceTo(e) + e.distanceTo(wp(self.bones[s + 'Hand']));
    };

    // хват топора: рукоять через ладонь (GRIP из репозитория)
    var placeLikeAxe = function (roll, holder, weapon, grip) {
      var H = self.HF.Right;
      var gx = grip.sX, gp = grip.sP, G = grip.sG, S = grip.sS;
      var pos = H.h0.clone()
        .addScaledVector(H.f, H.palmLen * gx)
        .addScaledVector(H.n, gp)
        .applyMatrix4(H.inv);
      holder.position.copy(pos);
      var fl = H.f.clone().applyQuaternion(H.wq.clone().invert());
      var al = H.a.clone().applyQuaternion(H.wq.clone().invert());
      var cl = new THREE.Vector3().crossVectors(fl, al);
      var qb = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fl, al, cl));
      holder.quaternion.copy(qb)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (roll + grip.sR) * D));
      holder.scale.setScalar(S / H.ws);
      weapon.position.set(0, -G, 0);
    };
    this.placeAxe = function (roll) { placeLikeAxe(roll, self.axe.holder, self.axe.wrap, GRIP); };
    // ✅ каменная кирка — тот же хват, одна правая рука
    this.placeStonePick = function (roll) { placeLikeAxe(roll, self.stonePick.holder, self.stonePick.wrap, GRIP_SPICK); };
    // ✅ железная кирка — тот же хват, левая рука подхватывается сама
    this.placeIronPick = function (roll) { placeLikeAxe(roll, self.ironPick.holder, self.ironPick.wrap, GRIP_PICKAXE); };
    // ✅ v0.2.9 железный топор — тот же хват, одна правая рука
    this.placeIronAxe = function (roll) { placeLikeAxe(roll, self.ironAxe.holder, self.ironAxe.wrap, GRIP_IRONAXE); };

    // ✅ v0.4.5 хват РЕВОЛЬВЕРА: рукоять в правой ладони (чуть выше,
    // чем у топора), СТВОЛ ВПЕРЁД. Довороты/сдвиг — константы REV_ROT/REV_POS
    this.placeRevolver = function () {
      var H = self.HF.Right;
      var pos = H.h0.clone()
        .addScaledVector(H.f, H.palmLen * 0.5)
        .addScaledVector(H.n, 0.005)
        .applyMatrix4(H.inv);
      self.revolver.holder.position.copy(pos);
      var fl = H.f.clone().applyQuaternion(H.wq.clone().invert());
      var al = H.a.clone().applyQuaternion(H.wq.clone().invert());
      var cl = new THREE.Vector3().crossVectors(fl, al);
      var qb = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fl, al, cl));
      self.revolver.holder.quaternion.copy(qb);
      self.revolver.holder.scale.setScalar(GRIP.sS / H.ws);
      self.revolver.wrap.rotation.set(REV_ROT.x * D, REV_ROT.y * D, REV_ROT.z * D);
      self.revolver.wrap.position.set(REV_POS.x, REV_POS.y, REV_POS.z);
    };

    // рамка камеры рук
    (function () {
      var cf = HANDS_CAM_TARGET.clone().sub(HANDS_CAM_POS).normalize();
      var cr = new THREE.Vector3().crossVectors(cf, new THREE.Vector3(0, 1, 0)).normalize();
      var cu = new THREE.Vector3().crossVectors(cr, cf).normalize();
      self.camFrame = { pos: HANDS_CAM_POS.clone(), f: cf, u: cu, r: cr };
    })();

    /* ---------- применение позы к ригу ---------- */
    this.pose = function (p, fp) {
      var B = self.bones, rest = self.rest;
      var UP = self.UP, RT = self.RT, FW = self.FW, LF = self.LF;
      var wpp = function (b) { return b.getWorldPosition(new THREE.Vector3()); };

      for (var k in B) {
        B[k].quaternion.copy(rest[k].q);
        B[k].scale.copy(rest[k].s);
      }
      if (fp) {
        B.LeftArm.scale.multiplyScalar(ARMS_SCALE);
        B.RightArm.scale.multiplyScalar(ARMS_SCALE);
        // ✅ v0.2.10: у железной кирки левая рука больше НЕ тянется к рукояти —
        // она скрыта (как у железного топора), обе руки держат всё одной правой
      }
      self.model.position.y = 0;
      self.model.updateMatrixWorld(true);

      self.rotW(B.Hips, UP, p.hy * D);
      ['Spine', 'Spine1', 'Spine2'].forEach(function (k) {
        self.rotW(B[k], UP, p.sy * D / 3);
        self.rotW(B[k], LF, p.sx * D / 3);
      });
      self.rotW(B.Head, LF, p.hx * D);
      [['Left', p.ltx, p.ltk], ['Right', p.rtx, p.rtk]].forEach(function (pair) {
        var s = pair[0], tx = pair[1], tk = pair[2];
        self.rotW(B[s + 'UpLeg'], LF, -tx * D);
        self.rotW(B[s + 'Leg'], LF, tk * D);
        self.rotW(B[s + 'Foot'], LF, (tx - tk) * D);
      });
      self.model.updateMatrixWorld(true);
      self.model.position.y = self.REST_ANKLE - Math.min(wpp(B.LeftFoot).y, wpp(B.RightFoot).y);
      self.model.updateMatrixWorld(true);

      var qT = B.Spine2.getWorldQuaternion(new THREE.Quaternion()).multiply(rest.Spine2.wq.clone().invert());
      var Ut = UP.clone().applyQuaternion(qT);
      var Ft = FW.clone().applyQuaternion(qT);
      var Rt = RT.clone().applyQuaternion(qT);
      var tgt = function (S, L, x, y, z) {
        return S.clone().addScaledVector(Rt, x * L).addScaledVector(Ut, y * L).addScaledVector(Ft, z * L);
      };

      var LR = self.reach('Right'), SR = wpp(B.RightArm);
      var LL = self.reach('Left'), SL = wpp(B.LeftArm);
      var rightPole = Ut.clone().multiplyScalar(-1).addScaledVector(Rt, 0.5).addScaledVector(Ft, -0.3);
      var leftPole  = Ut.clone().multiplyScalar(-1).addScaledVector(Rt, -0.5).addScaledVector(Ft, -0.3);

      /* ✅ ПРАВАЯ РУКА + оружие (топор ИЛИ кирка) */
      self.ik(B.RightArm, B.RightForeArm, B.RightHand, tgt(SR, LR, p.rx, p.ry, p.rz), rightPole);
      var ph = p.rphi * D;
      var a2 = Ut.clone().multiplyScalar(Math.cos(ph)).addScaledVector(Ft, Math.sin(ph))
        .applyAxisAngle(Ut, p.ryaw * D).normalize();
      var fd = wpp(B.RightHand).clone().sub(wpp(B.RightForeArm)).normalize();
      var pr = fd.clone().addScaledVector(a2, -fd.dot(a2));
      var ln = pr.length(); pr.normalize();
      var gg = new THREE.Vector3().crossVectors(a2, Rt).normalize();
      if (gg.dot(pr) < 0) gg.negate();
      var w = Math.min(1, Math.max(0, (ln - 0.35) / 0.35));
      var f2 = pr.multiplyScalar(w).addScaledVector(gg, 1 - w).normalize();
      self.orientHand('Right', f2, a2);
      self.fingers('Right', p.curl, p.thumb);

      /* ЛЕВАЯ РУКА */
      if ((self.currentWeapon === 'ironAxe' && self.ironAxe) ||
          (self.currentWeapon === 'ironPickaxe' && self.ironPick)) {
        // ✅ v0.2.9 ЖЕЛЕЗНЫЙ ТОПОР / ✅ v0.2.10 ЖЕЛЕЗНАЯ КИРКА — левая рука
        // СКРЫТА: кости левой руки схлопываются (scale → ~0). Риг — SkinnedMesh:
        // вершины, привязанные к костям левой руки, стягиваются в точку плеча и
        // рука исчезает (в 1-м лице виден только материал *arms*, остальное тело
        // скрыто, так что деформаций больше нигде не видно). Правая рука с
        // инструментом уже заняла своё место, инструмент ставится ниже.
        B.LeftArm.scale.setScalar(0.001);
        B.LeftForeArm.scale.setScalar(0.001);
        B.LeftHand.scale.setScalar(0.001);
      } else {
        // (расслабленная, как в репозитории для топора)
        self.ik(B.LeftArm, B.LeftForeArm, B.LeftHand, tgt(SL, LL, p.lx, p.ly, p.lz), leftPole);
        var fl = wpp(B.LeftHand).clone().sub(wpp(B.LeftForeArm)).normalize();
        var al = Ut.clone().multiplyScalar(0.8).addScaledVector(Rt, 0.5);
        al.addScaledVector(fl, -al.dot(fl)).normalize();
        self.orientHand('Left', fl, al);
        self.fingers('Left', p.lcurl, 0.3);
      }

      self.model.updateMatrixWorld(true);
      // все инструменты — хват ОДНОЙ правой руки:
      // каменный топор, каменная кирка, железный топор и железная кирка
      // (левая рука расслаблена или схлопнута выше)
      if (self.currentWeapon === 'axe') self.placeAxe(p.roll !== undefined ? p.roll : 90);
      else if (self.currentWeapon === 'pickaxe') self.placeStonePick(p.roll !== undefined ? p.roll : 90);
      else if (self.currentWeapon === 'ironAxe') self.placeIronAxe(p.roll !== undefined ? p.roll : 90);
      else if (self.currentWeapon === 'ironPickaxe') self.placeIronPick(p.roll !== undefined ? p.roll : 90);
      else if (self.currentWeapon === 'revolver' && self.revolver) self.placeRevolver();
    };
  };

  /* ---------- видимость: в 1-м лице только руки (материал *arms*) ---------- */
  FirstPersonPlayer.prototype._applyVisibility = function (showArms) {
    if (!this.model || !this.meshes) return;
    this.visible = showArms;
    for (var i = 0; i < this.meshes.length; i++) {
      var m = this.meshes[i];
      var mn = (m.material && m.material.name) || '';
      var isArm = /arms/i.test(mn);
      if (this._firstPerson) m.visible = showArms && isArm;
      else m.visible = showArms;
    }
  };

  /** ✅ Выбор оружия: 'axe' | 'pickaxe' (каменная) | 'ironPickaxe' (железная) |
   *  'ironAxe' (железный топор, v0.2.9) | 'revolver' (v0.4.5) | null */
  FirstPersonPlayer.prototype.setWeapon = function (type) {
    this.currentWeapon = type || 'none';
    var showArms = this.currentWeapon === 'axe' ||
                   this.currentWeapon === 'pickaxe' ||
                   this.currentWeapon === 'ironPickaxe' ||
                   this.currentWeapon === 'ironAxe' ||
                   this.currentWeapon === 'revolver';
    // запоминаем состояние ВСЕГДА: если модели ещё грузятся,
    // оно применится в _init после загрузки
    this.visible = showArms;
    this._swingType = null;
    this._aiming = false;
    this._aimBlend = 0;
    if (!this.model || !this.meshes) return;
    this._applyVisibility(showArms);
    if (this.axe) this.axe.holder.visible = showArms && this.currentWeapon === 'axe';
    if (this.stonePick) this.stonePick.holder.visible = showArms && this.currentWeapon === 'pickaxe';
    if (this.ironPick) this.ironPick.holder.visible = showArms && this.currentWeapon === 'ironPickaxe';
    if (this.ironAxe) this.ironAxe.holder.visible = showArms && this.currentWeapon === 'ironAxe';
    if (this.revolver) this.revolver.holder.visible = showArms && this.currentWeapon === 'revolver';
  };

  /** ✅ v0.4.5 ОТДАЧА: проиграть анимацию выстрела (короткий кик руки) */
  FirstPersonPlayer.prototype.playShoot = function () {
    if (!this.loaded || !this.visible || this.currentWeapon !== 'revolver') return;
    this._swingType = 'shoot';
    this._animTime = 0;
  };

  /** ✅ v0.4.5 ПЕРЕЗАРЯДКА: опустить револьвер вниз и вернуть (2.2 с) */
  FirstPersonPlayer.prototype.playReload = function () {
    if (!this.loaded || !this.visible || this.currentWeapon !== 'revolver') return;
    this._swingType = 'reload';
    this._animTime = 0;
    this._aiming = false;
  };

  /** ✅ v0.4.5 ПРИЦЕЛИВАНИЕ (ПКМ): on=true — плавно подводим к глазам */
  FirstPersonPlayer.prototype.setAim = function (on) {
    this._aiming = !!on;
  };

  /** прогресс прицеливания 0..1 — gameworld плавно жмёт FOV камеры */
  FirstPersonPlayer.prototype.aimProgress = function () {
    return this._aimBlend || 0;
  };

  /** v=true — топор в руке (выбран в хотбаре), false — руки скрыты (совместимость) */
  FirstPersonPlayer.prototype.setVisible = function (v) {
    this.setWeapon(v ? 'axe' : null);
  };

  /** triggerSwing('atk1'|'atk2') — как в репозитории */
  FirstPersonPlayer.prototype.triggerSwing = function (type) {
    if (!this.loaded || !this.visible) return;
    if (!CL[type]) return;
    this._swingType = type;
    this._animTime = 0;
  };

  /** обновление позы каждый кадр (без рендера) */
  FirstPersonPlayer.prototype.update = function (dt, opts) {
    if (!this.loaded) return;
    this._clock += dt;

    // ✅ v0.4.5: покой зависит от оружия — с револьвером своя стойка
    var idle;
    if (this.currentWeapon === 'revolver') idle = FIDLE_REV;
    else idle = FIDLE_AXE;

    // ✅ v0.4.5 ПРИЦЕЛИВАНИЕ: плавно 0..1 (не мгновенно). Прицел работает
    // только с револьвером в руках и пока не играет выстрел/перезарядка
    var wantAim = this._aiming && this.currentWeapon === 'revolver' && !this._swingType;
    this._aimBlend += ((wantAim ? 1 : 0) - this._aimBlend) * Math.min(1, dt * 9);
    if (this._aimBlend < 0.002) this._aimBlend = 0;

    var p;
    if (this._swingType) {
      var c = CL[this._swingType];
      this._animTime += dt;
      if (this._animTime >= c.dur) {
        this._swingType = null;
        p = Object.assign({}, idle);
      } else {
        p = sample(c.keys, Math.max(0, this._animTime) / c.dur);
      }
    } else {
      p = Object.assign({}, idle);
      p.sx += Math.sin(this._clock * 1.8) * 0.8; // дыхание в покое
    }

    // прицеливание накладывается ПОВЕРХ (лёгкий лер): даже во время
    // отдачи револьвер остаётся у глаз
    if (this._aimBlend > 0) p = lerpP(p, FPOSE_AIM, this._aimBlend);

    this.pose(p, true);
  };

  /** рендер рук ПОВЕРХ мира (вызывать после renderer.render(scene, camera)) */
  FirstPersonPlayer.prototype.renderOverlay = function () {
    if (!this.loaded || !this.visible) return;
    if (!this.renderer) return;

    // ✅ v0.4.5: при прицеливании камера рук чуть поднимается (смотрим
    // поверх револьвера) — плавно, вместе с позой
    var aim = this._aimBlend || 0;
    HANDS_CAM_POS.set(0, 1.7 - 0.05 * aim, 0);
    HANDS_CAM_TARGET.set(0, CAM_TARGET_Y + 0.40 * aim, 5);
    this.handsCamera.position.copy(HANDS_CAM_POS);
    this.handsCamera.up.set(0, 1, 0);
    this.handsCamera.lookAt(HANDS_CAM_TARGET);
    this.handsCamera.fov = 74;
    this.handsCamera.aspect = this.camera.aspect;
    this.handsCamera.near = 0.02;
    this.handsCamera.far = 200;
    this.handsCamera.updateProjectionMatrix();

    var prevAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.setRenderTarget(null);
    this.renderer.clearDepth();
    this.renderer.render(this.handsScene, this.handsCamera);
    this.renderer.autoClear = prevAutoClear;
  };

  FirstPersonPlayer.prototype.dispose = function () {
    var self = this;
    if (this.model && this.model.parent) this.model.parent.remove(this.model);
    if (this.handsScene) {
      this.handsScene.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          var mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(function (m) { m.dispose(); });
        }
      });
      while (this.handsScene.children.length) this.handsScene.remove(this.handsScene.children[0]);
    }
    this.model = null;
    this.axe = null;
    this.axeHolder = null;
    this.stonePick = null;
    this.ironPick = null;
    this.ironAxe = null;
    this.revolver = null;
    this.pickaxeHolder = null;
    this.bones = null;
    this.loaded = false;
    this.visible = false;
  };

  return FirstPersonPlayer;
})();
