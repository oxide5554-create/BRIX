// ============================================================
//  brix • js/game/arena.js
//  ✅ v0.4.66 ПВП-АРЕНА «ПОЛИГОН» (СЕКТОР-9) — ПОЛНЫЙ ПОРТ
//  локации из референса БЕЗ УРЕЗАНИЙ (текстуры — arena-tex.js):
//  · бетонный пол с эмблемой «СЕКТОР-9», стены с трафаретами «09
//    ЗАКРЫТЫЙ ПЕРИМЕТР», знамёна отрядов СТАЛЬ/ПЛАМЯ (колышутся),
//    бункеры, платформа со ступенями и укрытиями, ящики
//    «7.62×39 БОЕПРИПАСЫ», барьеры, баки, паллеты, ящики-боеприпасы
//    со светящейся кромкой, кондиционеры, трубы, прожекторные вышки
//    с объёмными конусами, декали зон «БАЗА · СТАЛЬ/ПЛАМЯ», ПЫЛЬ;
//  · БОТЫ: 1 красный бот (ВИПЕР-1) — ИИ из референса (патруль/
//    поиск/бой, стрейф, очереди), ТРАССЕРЫ НАШИ (как у игроков),
//    вспышка из текстур СЕКТОР-9; ✅ фикс видимости (боты были на
//    3.45 м под полом — теперь стоят на полу арены);
//  · КАРТА (M): drawMap рисует локацию сверху + точки ботов.
// ============================================================
window.BrixArena = (function () {
  'use strict';

  /* ---------- константы локации (как в референсе, метры) ---------- */
  var FLOOR_W = 62, FLOOR_D = 46;
  var HALF_W = FLOOR_W / 2, HALF_D = FLOOR_D / 2;
  var AY = 3.45;                          // верх бетонного пола в мире (terrain pvp = 3.2)
  var STEP = 0.55, GRAV = 14;
  var BOTS_TOTAL = 1;                     // ✅ v0.4.66: ОДИН бот на арене

  var built = false;
  var solids = [];
  var worldBoxes = [];
  var bots = [];
  var opts = null;
  var killCount = 0;

  var botNames = ['ВИПЕР', 'ПРИЗРАК', 'КОБРА', 'ШАКАЛ', 'ГРОМ', 'ЗУБР'];
  var SPAWNS = [[10, 18.5], [-10, 18.5], [4, 19], [-4, 19]];
  var BOT_SPAWNS = [[10, -18.5], [-10, -18.5], [4, -19], [-4, -19]];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randi(a, b) { return Math.floor(rand(a, b + 1)); }

  /* ---------- солиды и мешы ---------- */
  var MAT = null, TEX = null;

  function addSolid(x, y, z, w, h, d, ry) {
    ry = ry || 0;
    var c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
    var hx = (w * c + d * s) / 2, hz = (w * s + d * c) / 2;
    solids.push({ x0: x - hx, x1: x + hx, y0: y, y1: y + h, z0: z - hz, z1: z + hz });
  }

  function mesh(geo, mat, x, y, z, opt) {
    opt = opt || {};
    var m = new THREE.Mesh(geo, mat);
    m.position.set(x, AY + y, z);
    m.rotation.set(opt.rx || 0, opt.ry || 0, opt.rz || 0);
    if (opt.cast) m.castShadow = true;
    if (opt.recv !== false) m.receiveShadow = true;
    (opt.parent || opts.scene).add(m);
    return m;
  }

  function solidBox(w, h, d, mat, x, y, z, opt) {
    opt = opt || {};
    var m = mesh(MAT.gBox(w, h, d), mat, x, y + h / 2, z, opt);
    addSolid(x, y, z, w, h, d, opt.ry || 0);
    return m;
  }

  function rebuildWorldBoxes() {
    worldBoxes.length = 0;
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      worldBoxes.push({
        minX: s.x0, maxX: s.x1,
        minY: AY + s.y0, maxY: AY + s.y1,
        minZ: s.z0, maxZ: s.z1, active: true
      });
    }
  }

  /* ============================================================
     ЛОКАЦИЯ — ПОЛНЫЙ ПОРТ buildWorld (всё, без урезаний)
     ============================================================ */
  var world = { banners: [], cones: [], dust: null };

  function buildWorld(scene) {
    var E_BLUE = MAT.emis(0x4da3ff, 2.6), E_RED = MAT.emis(0xff5a3c, 2.6);
    var E_AMBER = MAT.emis(0xffb347, 2.4), E_LENS = MAT.emis(0xffd9a0, 3.4);
    var i;

    // пол-плита с БЕТОННОЙ ТЕКСТУРОЙ (швы/пятна/трещины)
    var slab = mesh(MAT.gBox(FLOOR_W, 0.5, FLOOR_D), MAT.floor, 0, -0.25, 0);
    addSolid(0, -0.5, 0, FLOOR_W, 0.5, FLOOR_D);

    // периметр-стены (7 м) + верхний металлический бортик
    solidBox(FLOOR_W, 7, 1, MAT.wall, 0, 0, -HALF_D - 0.5);
    solidBox(FLOOR_W, 7, 1, MAT.wall, 0, 0, HALF_D + 0.5);
    solidBox(1, 7, FLOOR_D + 2, MAT.wallSide, -HALF_W - 0.5, 0, 0);
    solidBox(1, 7, FLOOR_D + 2, MAT.wallSide, HALF_W + 0.5, 0, 0);
    mesh(MAT.gBox(FLOOR_W, 1.1, 1.06), MAT.metal, 0, 6.45, -HALF_D - 0.5, { cast: true });
    mesh(MAT.gBox(FLOOR_W, 1.1, 1.06), MAT.metal, 0, 6.45, HALF_D + 0.5, { cast: true });
    mesh(MAT.gBox(1.06, 1.1, FLOOR_D + 2), MAT.metal, -HALF_W - 0.5, 6.45, 0, { cast: true });
    mesh(MAT.gBox(1.06, 1.1, FLOOR_D + 2), MAT.metal, HALF_W + 0.5, 6.45, 0, { cast: true });

    // светящиеся командные полосы: красная север, синяя юг, янтарные бока
    mesh(MAT.gBox(60, 0.1, 0.08), E_RED, 0, 5.35, -HALF_D + 0.04);
    mesh(MAT.gBox(60, 0.1, 0.08), E_BLUE, 0, 5.35, HALF_D - 0.04);
    mesh(MAT.gBox(0.08, 0.1, 44), E_AMBER, -HALF_W + 0.04, 5.35, 0);
    mesh(MAT.gBox(0.08, 0.1, 44), E_AMBER, HALF_W - 0.04, 5.35, 0);

    // пилоны по стенам
    var pxs = [-20, -10, 0, 10, 20], pzs = [-11, 0, 11];
    for (i = 0; i < pxs.length; i++) {
      solidBox(0.9, 7.4, 0.9, MAT.concreteSmall, pxs[i], 0, -HALF_D + 0.4);
      solidBox(0.9, 7.4, 0.9, MAT.concreteSmall, pxs[i], 0, HALF_D - 0.4);
    }
    for (i = 0; i < pzs.length; i++) {
      solidBox(0.9, 7.4, 0.9, MAT.concreteSmall, -HALF_W + 0.4, 0, pzs[i]);
      solidBox(0.9, 7.4, 0.9, MAT.concreteSmall, HALF_W - 0.4, 0, pzs[i]);
    }

    // угловые кирпичные бункеры + рифлёные крыши + янтарная кромка
    var bunk = [[-24, -16], [24, -16], [-24, 16], [24, 16]];
    for (i = 0; i < bunk.length; i++) {
      var bx = bunk[i][0], bz = bunk[i][1];
      solidBox(7, 3.4, 5, MAT.brick, bx, 0, bz);
      mesh(MAT.gBox(7.5, 0.24, 5.5), MAT.treadRoof, bx, 3.52, bz, { cast: true });
      mesh(MAT.gBox(7.5, 0.1, 0.1), E_AMBER, bx, 3.3, bz + (bz < 0 ? 2.78 : -2.78));
    }

    // ЦЕНТРАЛЬНАЯ ПЛАТФОРМА 14×10 + окантовка + ЭМБЛЕМА СЕКТОР-9
    solidBox(14, 1.5, 10, MAT.platSide, 0, 0, 0);
    mesh(MAT.gBox(14.1, 0.1, 10.1), MAT.tread, 0, 1.52, 0, { cast: true });
    mesh(MAT.gBox(14.15, 0.14, 0.16), MAT.hazard, 0, 1.55, -5.02);
    mesh(MAT.gBox(14.15, 0.14, 0.16), MAT.hazard, 0, 1.55, 5.02);
    mesh(MAT.gBox(0.16, 0.14, 10.1), MAT.hazard, -7.02, 1.55, 0);
    mesh(MAT.gBox(0.16, 0.14, 10.1), MAT.hazard, 7.02, 1.55, 0);
    var emb = mesh(MAT.gPlane(8, 8),
      new THREE.MeshBasicMaterial({ map: TEX.emblem, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2 }),
      0, 1.585, 0, { rx: -Math.PI / 2 });
    emb.renderOrder = 1;

    // ступени (запад и восток, 6 шт × 0.25 м) с янтарной кромкой
    for (i = 0; i < 6; i++) {
      var h = (i + 1) * 0.25, dx = 0.834;
      var wx = -12 + dx * (i + 0.5), ex = 12 - dx * (i + 0.5);
      solidBox(dx, h, 4, MAT.treadStep, wx, 0, 0);
      solidBox(dx, h, 4, MAT.treadStep, ex, 0, 0);
      mesh(MAT.gBox(0.07, 0.05, 4), MAT.amberPaint, wx - dx / 2 + 0.04, h + 0.02, 0);
      mesh(MAT.gBox(0.07, 0.05, 4), MAT.amberPaint, ex + dx / 2 - 0.04, h + 0.02, 0);
    }

    // низкие укрытия на платформе (север/юг края)
    var zcs = [-4.8, 4.8];
    for (i = 0; i < zcs.length; i++) {
      var zc = zcs[i];
      solidBox(5, 0.9, 0.35, MAT.concreteSmall, -4.5, 1.5, zc);
      solidBox(5, 0.9, 0.35, MAT.concreteSmall, 4.5, 1.5, zc);
      mesh(MAT.gBox(5, 0.08, 0.4), MAT.hazard, -4.5, 2.42, zc);
      mesh(MAT.gBox(5, 0.08, 0.4), MAT.hazard, 4.5, 2.42, zc);
    }

    // опорные столбы
    var pil = [[-14, -11], [14, -11], [-14, 11], [14, 11]];
    for (i = 0; i < pil.length; i++) {
      solidBox(1, 7, 1, MAT.concreteSmall, pil[i][0], 0, pil[i][1]);
      mesh(MAT.gBox(1.2, 0.3, 1.2), MAT.darkSteel, pil[i][0], 6.9, pil[i][1], { cast: true });
      mesh(MAT.gBox(0.9, 0.08, 0.9), E_AMBER, pil[i][0], 6.72, pil[i][1]);
    }

    // кластеры ящиков «БОЕПРИПАСЫ» (как в референсе)
    var crate = function (x, z, s2, y, ry) {
      s2 = s2 || 1.2; y = y || 0; ry = ry || 0;
      solidBox(s2, s2, s2, MAT.crate, x, y, z, { ry: ry, cast: true });
    };
    crate(-18, 4); crate(-16.6, 4.6, 1.2, 0, 0.3); crate(-17.3, 4.3, 1.2, 1.2, 0.15);
    crate(18, -4); crate(16.6, -4.6, 1.2, 0, -0.3); crate(17.3, -4.3, 1.2, 1.2, -0.15);
    crate(-6, -13); crate(-4.7, -13); crate(-5.3, -11.8); crate(-5.3, -12.6, 1.2, 1.2, 0.2);
    crate(6, 13); crate(4.7, 13); crate(5.3, 11.8); crate(5.3, 12.6, 1.2, 1.2, -0.2);
    solidBox(2.4, 1.4, 1.2, MAT.crate, 12, 0, 8, { ry: 0.2 }); crate(14, 7.4, 1.2, 0, -0.25);
    solidBox(2.4, 1.4, 1.2, MAT.crate, -12, 0, -8, { ry: 0.2 }); crate(-14, -7.4, 1.2, 0, -0.25);
    crate(22, 10, 1.2, 0, 0.4); crate(-22, -10, 1.2, 0, 0.4);

    // джерси-барьеры
    var barrier = function (x, z, rot) {
      solidBox(rot ? 0.55 : 2.6, 1.1, rot ? 2.6 : 0.55, MAT.hazard, x, 0, z, { cast: true });
    };
    barrier(-2, 8, false); barrier(2, -8, false);
    barrier(-20, -6, true); barrier(20, 6, true);
    barrier(8, -16, false); barrier(-8, 16, false);

    // топливные баки
    var fxs = [-26, 26];
    for (i = 0; i < fxs.length; i++) {
      var fx = fxs[i];
      solidBox(1.6, 1.8, 3, MAT.metal, fx, 0, 0);
      mesh(MAT.gBox(1.64, 0.5, 3.04), MAT.hazard, fx, 1.1, 0, { cast: true });
      mesh(MAT.gBox(0.3, 0.25, 0.3), MAT.darkSteel, fx, 1.92, 0.9, { cast: true });
    }

    // паллеты (шагаемый мусор)
    var pal = [[-10, 14, 0.3], [11, -13, -0.2], [24, -8, 0.8], [-24, 8, -0.6], [3, -17, 0.1]];
    for (i = 0; i < pal.length; i++) {
      mesh(MAT.gBox(1.7, 0.12, 1.25), MAT.crate, pal[i][0], 0.06, pal[i][1], { ry: pal[i][2], cast: true });
      addSolid(pal[i][0], 0, pal[i][1], 1.7, 0.12, 1.25, pal[i][2]);
    }

    // кондиционеры на стенах + трубы
    var acs = [[-15, -21.7, 0], [15, 21.7, Math.PI], [-29.7, 6, Math.PI / 2]];
    for (i = 0; i < acs.length; i++) {
      mesh(MAT.gBox(1.6, 1.1, 0.7), MAT.metal, acs[i][0], 3.6, acs[i][1], { ry: acs[i][2], cast: true });
      var az = acs[i][1] + (acs[i][2] === 0 ? 0.38 : acs[i][2] === Math.PI ? -0.38 : 0);
      mesh(MAT.gBox(1.4, 0.06, 0.06), E_AMBER, acs[i][0], 3.1, az, { ry: acs[i][2] });
    }
    mesh(MAT.gCyl(0.13, 44), MAT.darkSteel, -29.6, 6.1, 0, { rx: Math.PI / 2, cast: true });
    mesh(MAT.gCyl(0.13, 44), MAT.darkSteel, 29.6, 6.1, 0, { rx: Math.PI / 2, cast: true });
    mesh(MAT.gCyl(0.1, 60), MAT.darkSteel, 0, 6.55, -21.6, { rz: Math.PI / 2, cast: true });
    mesh(MAT.gCyl(0.07, 60), MAT.darkSteel, 0, 6.25, -21.6, { rz: Math.PI / 2 });

    // трафареты «09 ЗАКРЫТЫЙ ПЕРИМЕТР» на стенах
    var ws = function (x, z, ry, w2, h2) {
      var m = mesh(MAT.gPlane(w2 || 6, h2 || 6),
        new THREE.MeshBasicMaterial({ map: TEX.wallStencil, transparent: true, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -2 }),
        x, 3.4, z, { ry: ry });
      m.renderOrder = 1;
    };
    ws(29.93, 0, -Math.PI / 2); ws(-29.93, 0, Math.PI / 2); ws(-12, -21.93, 0, 5, 5);

    // декали зон спавна «БАЗА · СТАЛЬ/ПЛАМЯ»
    var zb = mesh(MAT.gPlane(11, 6.5),
      new THREE.MeshBasicMaterial({ map: TEX.zoneBlue, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2 }),
      0, 0.02, 18, { rx: -Math.PI / 2 });
    zb.renderOrder = 1;
    var zr = mesh(MAT.gPlane(11, 6.5),
      new THREE.MeshBasicMaterial({ map: TEX.zoneRed, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2 }),
      0, 0.02, -18, { rx: -Math.PI / 2 });
    zr.renderOrder = 1;

    // ЗНАМЁНА отрядов (колышутся — см. tickFx)
    var bannerDefs = [[-21.85, 'red', TEX.bannerRed], [21.85, 'blue', TEX.bannerBlue]];
    for (i = 0; i < bannerDefs.length; i++) {
      var bd = bannerDefs[i];
      var g = new THREE.PlaneGeometry(3, 4.4, 10, 14);
      var m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        map: bd[2], transparent: true, side: THREE.DoubleSide, roughness: 0.9, alphaTest: 0.1
      }));
      m.position.set(0, AY + 4.1, bd[0]);
      if (bd[0] > 0) m.rotation.y = Math.PI;
      m.castShadow = true;
      opts.scene.add(m);
      world.banners.push({ mesh: m, base: g.attributes.position.array.slice(), geo: g });
      mesh(MAT.gBox(3.4, 0.12, 0.12), MAT.darkSteel, 0, 6.35, bd[0]);
      mesh(MAT.gBox(3.2, 0.06, 0.06), bd[1] === 'red' ? E_RED : E_BLUE, 0, 6.24, bd[0] + (bd[0] < 0 ? 0.08 : -0.08));
    }

    // ящики-боеприпасы со светящейся кромкой (центр платформы + зоны)
    var ammoCrate = function (x, y, z) {
      solidBox(1.4, 1, 1.1, MAT.crate, x, y, z);
      mesh(MAT.gBox(1.44, 0.09, 1.14), E_AMBER, x, y + 0.82, z);
    };
    ammoCrate(0, 1.5, 0); ammoCrate(0, 0, 19.5); ammoCrate(0, 0, -19.5);

    // прожекторные вышки на бункерах (2 настоящих SpotLight)
    var tower = function (tx, tz, real) {
      mesh(MAT.gCyl(0.09, 5), MAT.darkSteel, tx, 5.9, tz, { cast: true });
      var head = new THREE.Group();
      head.position.set(tx, AY + 8.35, tz);
      opts.scene.add(head);
      var dir = new THREE.Vector3(-tx * 0.7, 0, -tz * 0.7).normalize();
      head.lookAt(tx + dir.x * 10, AY, tz + dir.z * 10);
      var hb = new THREE.Mesh(MAT.gBox(1.3, 0.55, 0.85), MAT.metal);
      hb.castShadow = true; head.add(hb);
      var lens = new THREE.Mesh(MAT.gPlane(1.1, 0.4), E_LENS);
      lens.position.set(0, -0.05, 0.44); head.add(lens);
      var from = new THREE.Vector3(tx, AY + 8.2, tz);
      var to = new THREE.Vector3(tx * 0.28, AY, tz * 0.28);
      var len = from.distanceTo(to);
      var cone = new THREE.Mesh(new THREE.ConeGeometry(6.5, len, 20, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffc07a, transparent: true, opacity: 0.045,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      cone.position.copy(from).add(to).multiplyScalar(0.5);
      cone.lookAt(to); cone.rotateX(-Math.PI / 2);
      opts.scene.add(cone);
      world.cones.push(cone);
      if (real && THREE.SpotLight) {
        var sp = new THREE.SpotLight(0xffd9a0, 260, 70, 0.62, 0.55, 1.6);
        sp.position.set(tx, AY + 8.3, tz);
        sp.target.position.set(tx * 0.28, AY, tz * 0.28);
        opts.scene.add(sp); opts.scene.add(sp.target);
      }
    };
    tower(24, -16, true); tower(-24, 16, true); tower(-24, -16, false); tower(24, 16, false);

    // ПЫЛЬ в лучах прожекторов
    var dn = 280, dp = new Float32Array(dn * 3), ds = new Float32Array(dn);
    for (i = 0; i < dn; i++) {
      dp[i * 3] = rand(-29, 29); dp[i * 3 + 1] = rand(0.3, 7); dp[i * 3 + 2] = rand(-21, 21);
      ds[i] = rand(0, Math.PI * 2);
    }
    var dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3).setUsage(THREE.DynamicDrawUsage));
    var dust = new THREE.Points(dg, new THREE.PointsMaterial({
      size: 0.055, map: TEX.dot, transparent: true, opacity: 0.4, color: 0xffd9a0,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    dust.position.y = AY;
    opts.scene.add(dust);
    world.dust = { pts: dust, base: dp.slice(), seeds: ds, n: dn };
  }

  /* ============================================================
     ФИЗИКА (порт из референса)
     ============================================================ */
  function groundAtLocal(x, z, feet) {
    var g = 0;
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 && s.y1 <= feet + STEP && s.y1 > g) g = s.y1;
    }
    return g;
  }

  function resolveXZLocal(e, r, h) {
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      if (e.y < s.y1 - STEP && e.y + h > s.y0 + 0.02) {
        if (e.x + r > s.x0 && e.x - r < s.x1 && e.z + r > s.z0 && e.z - r < s.z1) {
          var dxl = e.x + r - s.x0, dxr = s.x1 - (e.x - r);
          var dzl = e.z + r - s.z0, dzr = s.z1 - (e.z - r);
          var m = Math.min(dxl, dxr, dzl, dzr);
          if (m === dxl) e.x = s.x0 - r; else if (m === dxr) e.x = s.x1 + r;
          else if (m === dzl) e.z = s.z0 - r; else e.z = s.z1 + r;
        }
      }
    }
    e.x = clamp(e.x, -HALF_W + r, HALF_W - r);
    e.z = clamp(e.z, -HALF_D + r, HALF_D - r);
  }

  var _N = { x: 0, y: 0, z: 0 };
  function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
    var tmin = 0.0001, tmax = 1e9, ax = -1, sg = 1, t1, t2, tt, inv;
    if (Math.abs(dx) < 1e-9) { if (ox < x0 || ox > x1) return -1; }
    else { inv = 1 / dx; t1 = (x0 - ox) * inv; t2 = (x1 - ox) * inv; var s1 = -1; if (t1 > t2) { tt = t1; t1 = t2; t2 = tt; s1 = 1; } if (t1 > tmin) { tmin = t1; ax = 0; sg = s1; } if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1; }
    if (Math.abs(dy) < 1e-9) { if (oy < y0 || oy > y1) return -1; }
    else { inv = 1 / dy; t1 = (y0 - oy) * inv; t2 = (y1 - oy) * inv; var s2 = -1; if (t1 > t2) { tt = t1; t1 = t2; t2 = tt; s2 = 1; } if (t1 > tmin) { tmin = t1; ax = 1; sg = s2; } if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1; }
    if (Math.abs(dz) < 1e-9) { if (oz < z0 || oz > z1) return -1; }
    else { inv = 1 / dz; t1 = (z0 - oz) * inv; t2 = (z1 - oz) * inv; var s3 = -1; if (t1 > t2) { tt = t1; t1 = t2; t2 = tt; s3 = 1; } if (t1 > tmin) { tmin = t1; ax = 2; sg = s3; } if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1; }
    _N.x = ax === 0 ? sg : 0; _N.y = ax === 1 ? sg : 0; _N.z = ax === 2 ? sg : 0;
    return tmin;
  }

  function segClearLocal(ax, ay, az, bx, by, bz) {
    var dx = bx - ax, dy = by - ay, dz = bz - az;
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      if (s.y1 < Math.min(ay, by) - 0.05) continue;
      var t = rayBox(ax, ay, az, dx, dy, dz, s.x0, s.y0, s.z0, s.x1, s.y1, s.z1);
      if (t >= 0 && t < 0.995) return false;
    }
    return true;
  }

  /* ============================================================
     НАВ-ГРАФ (порт buildGraph)
     ============================================================ */
  var nodes = [], edges = [];
  function addNode(x, y, z) { nodes.push({ x: x, y: y, z: z }); edges.push([]); return nodes.length - 1; }
  function link(a, b) { if (edges[a].indexOf(b) === -1) { edges[a].push(b); edges[b].push(a); } }

  function buildGraph() {
    var grid = [], gx, gz;
    for (gx = -27; gx <= 27; gx += 4.5) for (gz = -19; gz <= 19; gz += 4.75) {
      var g = groundAtLocal(gx, gz, 0);
      var blocked = false;
      for (var i = 0; i < solids.length; i++) {
        var s = solids[i];
        if (g < s.y1 - STEP && g + 1.7 > s.y0 + 0.02 &&
            gx + 0.45 > s.x0 && gx - 0.45 < s.x1 && gz + 0.45 > s.z0 && gz - 0.45 < s.z1) { blocked = true; break; }
      }
      if (!blocked) grid.push(addNode(gx, g, gz));
    }
    var i2, j2, a, b, d;
    for (i2 = 0; i2 < grid.length; i2++) for (j2 = i2 + 1; j2 < grid.length; j2++) {
      a = nodes[grid[i2]]; b = nodes[grid[j2]];
      d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < 6.5 && Math.abs(a.y - b.y) < 0.6 &&
          segClearLocal(a.x, Math.max(a.y, b.y) + 1.05, a.z, b.x, Math.max(a.y, b.y) + 1.05, b.z)) link(grid[i2], grid[j2]);
    }
    var plat = [];
    var pp = [[-5.5, 0], [5.5, 0], [-2, -3.2], [2, -3.2], [-2, 3.2], [2, 3.2]];
    for (i2 = 0; i2 < pp.length; i2++) plat.push(addNode(pp[i2][0], 1.5, pp[i2][1]));
    for (i2 = 0; i2 < plat.length; i2++) for (j2 = i2 + 1; j2 < plat.length; j2++) {
      a = nodes[plat[i2]]; b = nodes[plat[j2]];
      if (segClearLocal(a.x, 2.6, a.z, b.x, 2.6, b.z)) link(plat[i2], plat[j2]);
    }
    for (var side = -1; side <= 1; side += 2) {
      var best = 1e9, foot = -1, gi;
      for (gi = 0; gi < grid.length; gi++) {
        var n3 = nodes[grid[gi]];
        var d3 = Math.hypot(n3.x - side * 13.5, n3.z);
        if (d3 < best) { best = d3; foot = grid[gi]; }
      }
      var prev = foot;
      for (var si = 0; si < 6; si++) {
        var sx = side === -1 ? (-12 + 0.834 * (si + 0.5)) : (12 - 0.834 * (si + 0.5));
        var ni = addNode(sx, (si + 1) * 0.25, 0);
        link(prev, ni); prev = ni;
      }
      link(prev, side === -1 ? plat[0] : plat[1]);
    }
  }

  function nearestNode(x, z, y) {
    var best = -1, bd = 1e9;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (Math.abs(n.y - y) > 1.2) continue;
      var d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function bfsPath(from, to) {
    if (from < 0 || to < 0) return null;
    if (from === to) return [to];
    var prev = new Int16Array(nodes.length).fill(-1);
    prev[from] = from;
    var q = [from];
    while (q.length) {
      var c = q.shift();
      var nb = edges[c];
      for (var i = 0; i < nb.length; i++) {
        if (prev[nb[i]] !== -1) continue;
        prev[nb[i]] = c;
        if (nb[i] === to) {
          var path = [to], p = to;
          while (p !== from) { p = prev[p]; path.push(p); }
          return path.reverse();
        }
        q.push(nb[i]);
      }
    }
    return null;
  }

  /* ============================================================
     БОТ (порт класса Bot; ✅ v0.4.66: стоит НА полу арены —
     group.y = AY + pos.y; 1 бот; трассеры наши — opts.addTracer)
     ============================================================ */
  var DIFF = { spread: 0.05, dmg: 11, burst: [3, 5], cool: [0.7, 1.4], react: 0.45, speed: 3.5 };

  function nameSprite(name) {
    var c = document.createElement('canvas'); c.width = 256; c.height = 64;
    var ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(7,9,14,.55)'; ctx.fillRect(28, 10, 200, 44);
    ctx.fillStyle = '#ff5a3c'; ctx.fillRect(28, 10, 6, 44);
    ctx.font = '700 26px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e9e5da'; ctx.fillText(name, 134, 33);
    var t = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    sp.scale.set(1.5, 0.375, 1);
    return sp;
  }

  function Bot(idx) {
    this.name = botNames[idx % botNames.length] + '-' + (idx + 1);
    this.spread = DIFF.spread * rand(0.85, 1.2);
    this.dmg = DIFF.dmg;
    this.burstR = DIFF.burst;
    this.coolR = DIFF.cool;
    this.react = DIFF.react;
    this.speed = DIFF.speed * rand(0.92, 1.08);
    this.pos = new THREE.Vector3();
    this.vy = 0; this.yaw = 0; this.hp = 100; this.state = 'patrol';
    this.target = null; this.lastSeen = new THREE.Vector3(); this.seenT = -99;
    this.path = []; this.thinkT = rand(0, 0.25); this.repathT = 0; this.reactT = 0;
    this.strafeSign = 1; this.strafeT = 0; this.burstLeft = 0; this.shotT = 0;
    this.coolT = rand(0.5, 1.5);
    this.deadT = 0; this.respawnT = 0;
    this.fallAxis = Math.random() < 0.5 ? 'x' : 'z'; this.fallDir = 1;
    this.walkT = rand(0, 9); this.flashK = 0; this.stuckT = 0;
    this.lastPos = new THREE.Vector3();
    this.build();
    this.respawn(true);
  }

  Bot.prototype.build = function () {
    var scene = opts.scene;
    var g = new THREE.Group(); this.group = g; scene.add(g);
    var acc = 0xff5a3c;
    var visor = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: acc, emissiveIntensity: 2.2, roughness: 0.35 });
    var pad = new THREE.MeshStandardMaterial({ color: 0x14161a, emissive: acc, emissiveIntensity: 0.9, roughness: 0.5 });
    this.vestMat = MAT.vest.clone();
    var add = function (geo, mat, x, y, z, parent) {
      var m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      (parent || g).add(m);
      return m;
    };
    // ноги с бедренными шарнирами
    this.legL = new THREE.Group(); this.legL.position.set(-0.11, 0.82, 0); g.add(this.legL);
    this.legR = new THREE.Group(); this.legR.position.set(0.11, 0.82, 0); g.add(this.legR);
    add(MAT.gBox(0.15, 0.74, 0.19), MAT.fabric, 0, -0.4, 0, this.legL);
    add(MAT.gBox(0.15, 0.74, 0.19), MAT.fabric, 0, -0.4, 0, this.legR);
    add(MAT.gBox(0.16, 0.1, 0.26), MAT.darkSteel, 0, -0.76, -0.03, this.legL);
    add(MAT.gBox(0.16, 0.1, 0.26), MAT.darkSteel, 0, -0.76, -0.03, this.legR);
    // корпус + разгрузка
    add(MAT.gBox(0.46, 0.62, 0.28), this.vestMat, 0, 1.15, 0);
    add(MAT.gBox(0.48, 0.1, 0.3), MAT.fabric, 0, 0.86, 0);
    add(MAT.gBox(0.11, 0.14, 0.07), MAT.fabric, -0.13, 1.04, -0.17);
    add(MAT.gBox(0.11, 0.14, 0.07), MAT.fabric, 0, 1.04, -0.17);
    add(MAT.gBox(0.11, 0.14, 0.07), MAT.fabric, 0.13, 1.04, -0.17);
    add(MAT.gBox(0.34, 0.4, 0.14), MAT.fabric, 0, 1.2, 0.2);
    add(MAT.gBox(0.14, 0.09, 0.2), pad, -0.28, 1.43, 0);
    add(MAT.gBox(0.14, 0.09, 0.2), pad, 0.28, 1.43, 0);
    // голова + визор
    var head = new THREE.Group(); head.position.set(0, 1.64, 0); g.add(head);
    add(MAT.gBox(0.24, 0.24, 0.26), MAT.fabric, 0, 0, 0, head);
    add(MAT.gBox(0.28, 0.14, 0.3), MAT.metal, 0, 0.1, 0, head);
    add(MAT.gBox(0.2, 0.07, 0.02), visor, 0, 0.01, -0.14, head);
    // руки
    add(MAT.gBox(0.11, 0.4, 0.13), MAT.fabric, -0.3, 1.22, -0.08).rotation.x = -0.5;
    add(MAT.gBox(0.11, 0.42, 0.13), MAT.fabric, 0.3, 1.24, -0.05).rotation.x = -0.9;
    add(MAT.gBox(0.1, 0.3, 0.1), MAT.fabric, -0.22, 1.12, -0.3).rotation.set(-1.2, 0, 0.5);
    // винтовка
    var rifle = new THREE.Group(); rifle.position.set(0.1, 1.3, -0.28); g.add(rifle);
    add(MAT.gBox(0.05, 0.06, 0.3), MAT.gunmetal, 0, 0, 0, rifle);
    add(MAT.gBox(0.05, 0.05, 0.14), MAT.gunwood, 0, -0.005, -0.2, rifle);
    add(MAT.gCyl(0.012, 0.24, 8), MAT.gunmetal, 0, 0, -0.38, rifle).rotation.x = Math.PI / 2;
    add(MAT.gBox(0.04, 0.09, 0.06), MAT.gunmetal, 0, -0.07, 0.02, rifle).rotation.x = 0.35;
    add(MAT.gBox(0.04, 0.06, 0.16), MAT.gunwood, 0, -0.01, 0.22, rifle);
    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0, -0.52); rifle.add(this.muzzle);
    // ник + полоска хп
    this.nameSp = nameSprite(this.name); this.nameSp.position.y = 2.06; g.add(this.nameSp);
    this.barG = new THREE.Group(); this.barG.position.y = 1.9; g.add(this.barG);
    var bg = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.06),
      new THREE.MeshBasicMaterial({ color: 0x0d1219, transparent: true, opacity: 0.8, depthWrite: false }));
    this.barG.add(bg);
    this.barFg = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.035),
      new THREE.MeshBasicMaterial({ color: acc, depthWrite: false }));
    this.barFg.position.z = 0.001; this.barG.add(this.barFg);
    // блоб-тень под ботом
    this.blob = new THREE.Mesh(MAT.gPlane(1.4, 1.4),
      new THREE.MeshBasicMaterial({ map: TEX.blob, transparent: true, depthWrite: false, opacity: 0.5 }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.03;
    g.add(this.blob);
  };

  Bot.prototype.chestOfPlayer = function () {
    var f = opts.getFeet();
    return { x: f.x, y: f.y + 1.25, z: f.z };
  };

  Bot.prototype.think = function () {
    var fx = this.pos.x, fz = this.pos.z, fy = this.pos.y;
    var eyeY = fy + 1.6;
    var alive = opts && !opts.isDead();
    if (alive) {
      var c = this.chestOfPlayer();
      var d = Math.hypot(c.x - fx, c.z - fz);
      if (d < 34) {
        var los = segClearLocal(fx, eyeY, fz, c.x, c.y - AY, c.z);
        if (los) {
          if (this.target !== 'player') this.reactT = this.react * rand(0.8, 1.3);
          this.target = 'player'; this.los = true; this.state = 'engage';
          this.lastSeen.set(c.x, c.y - AY, c.z); this.seenT = performance.now() / 1000;
          return;
        }
      }
    }
    this.los = false;
    if (this.target && performance.now() / 1000 - this.seenT < 4) this.state = 'seek';
    else { this.target = null; this.state = 'patrol'; }
    if (this.state === 'seek') {
      this.repathT -= 0.22;
      if (this.repathT <= 0 || !this.path.length) {
        this.repathT = 1.2;
        this.path = bfsPath(nearestNode(fx, fz, fy), nearestNode(this.lastSeen.x, this.lastSeen.z, 0)) || [];
      }
    } else if (this.state === 'patrol') {
      if (!this.path.length && Math.random() < 0.5)
        this.path = bfsPath(nearestNode(fx, fz, fy), randi(0, nodes.length - 1)) || [];
    } else if (this.state === 'engage' && this.target) {
      var c2 = this.chestOfPlayer();
      var d2 = Math.hypot(c2.x - fx, c2.z - fz);
      if (d2 > 19) {
        this.repathT -= 0.22;
        if (this.repathT <= 0 || !this.path.length) {
          this.repathT = 1.2;
          this.path = bfsPath(nearestNode(fx, fz, fy), nearestNode(c2.x, c2.z, 0)) || [];
        }
      } else this.path = [];
    }
  };

  Bot.prototype.respawn = function (first) {
    var best = BOT_SPAWNS[0], bd = -1;
    var f = opts && opts.getFeet ? opts.getFeet() : { x: 0, z: 0 };
    for (var i = 0; i < BOT_SPAWNS.length; i++) {
      var md = Math.hypot(BOT_SPAWNS[i][0] - f.x, BOT_SPAWNS[i][1] - f.z) + rand(0, 3);
      if (md > bd) { bd = md; best = BOT_SPAWNS[i]; }
    }
    this.pos.set(best[0], 0, best[1]);
    this.vy = 0; this.hp = 100; this.state = 'patrol'; this.target = null;
    this.path = []; this.deadT = 0; this.flashK = 0;
    this.group.position.set(this.pos.x, AY + this.pos.y, this.pos.z);
    this.group.rotation.set(0, 0, 0);
    this.group.visible = true;
    this.nameSp.material.opacity = 1;
    if (!first) this.thinkT = 0;
  };

  Bot.prototype.update = function (dt) {
    if (this.state === 'dead') {
      this.deadT += dt;
      var k = Math.min(1, this.deadT / 0.38);
      var ang = k * k * Math.PI / 2 * this.fallDir;
      this.group.rotation.set(this.fallAxis === 'x' ? ang : 0, this.yaw, this.fallAxis === 'z' ? ang : 0);
      this.group.position.set(this.pos.x, AY + this.pos.y, this.pos.z);
      if (this.deadT > 2.2) {
        var s = Math.max(0, 1 - (this.deadT - 2.2) / 0.8);
        this.group.position.y = AY + this.pos.y - (1 - s) * 1.4;
        this.nameSp.material.opacity = s;
        this.barG.visible = false;
      }
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.respawn();
      return;
    }
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.22; this.think(); }

    var wx = 0, wz = 0, spd = this.speed;
    if (this.state === 'engage' && this.target && this.los && this.path.length === 0) {
      var c = this.chestOfPlayer();
      var dx = c.x - this.pos.x, dz = c.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = rand(0.7, 1.6); this.strafeSign *= -1; }
      var pxv = -dz / d * this.strafeSign, pzv = dx / d * this.strafeSign;
      var rangeErr = clamp((d - 11) * 0.14, -1, 1);
      wx = pxv * 0.8 + dx / d * rangeErr; wz = pzv * 0.8 + dz / d * rangeErr;
      spd = this.speed * 0.8;
    } else if (this.path.length) {
      var n = nodes[this.path[0]];
      var ddx = n.x - this.pos.x, ddz = n.z - this.pos.z, dd = Math.hypot(ddx, ddz);
      if (dd < 0.85) this.path.shift();
      else { wx = ddx / dd; wz = ddz / dd; }
      if (this.state === 'patrol') spd = this.speed * 0.62;
    }

    var wl = Math.hypot(wx, wz);
    if (wl > 0.01) { wx /= wl; wz /= wl; }
    this.pos.x += wx * spd * dt; this.pos.z += wz * spd * dt;
    resolveXZLocal(this.pos, 0.35, 1.7);
    this.vy -= GRAV * dt; this.pos.y += this.vy * dt;
    var gr = groundAtLocal(this.pos.x, this.pos.z, this.pos.y + Math.max(0, -this.vy * dt));
    if (this.pos.y <= gr) { this.pos.y = gr; this.vy = 0; }
    this.stuckT += dt;
    if (this.stuckT > 0.7) {
      var moved = this.pos.distanceTo(this.lastPos);
      if (moved < 0.12 && wl > 0.01) {
        this.path = bfsPath(nearestNode(this.pos.x, this.pos.z, this.pos.y), randi(0, nodes.length - 1)) || [];
        this.strafeSign *= -1;
      }
      this.lastPos.copy(this.pos); this.stuckT = 0;
    }
    var targetYaw = this.yaw;
    if (this.state === 'engage' && this.target) {
      var c3 = this.chestOfPlayer();
      targetYaw = Math.atan2(-(c3.x - this.pos.x), -(c3.z - this.pos.z));
    } else if (wl > 0.01) targetYaw = Math.atan2(-wx, -wz);
    var dy = targetYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, 10 * dt);
    this.group.position.set(this.pos.x, AY + this.pos.y, this.pos.z);
    this.group.rotation.set(0, this.yaw, 0);
    var moveAmt = wl * spd;
    this.walkT += dt * moveAmt * 2.4;
    var sw = Math.sin(this.walkT) * Math.min(0.55, moveAmt * 0.16);
    this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
    this.group.position.y = AY + this.pos.y + Math.abs(Math.sin(this.walkT)) * 0.03 * Math.min(1, moveAmt * 0.3);
    this.barG.lookAt(opts.camera.position);
    var hpF = clamp(this.hp / 100, 0, 1);
    this.barFg.scale.x = Math.max(0.001, hpF);
    this.barFg.position.x = -(1 - hpF) * 0.34;
    this.barG.visible = true;
    this.nameSp.material.opacity = 1;
    if (this.flashK > 0) {
      this.flashK = Math.max(0, this.flashK - dt * 5);
      this.vestMat.emissive.setHex(0xff3b30);
      this.vestMat.emissiveIntensity = this.flashK * 1.4;
    }
    this.reactT -= dt; this.shotT -= dt; this.coolT -= dt;
    if (this.state === 'engage' && this.target && this.los && this.reactT <= 0 && !opts.isDead()) {
      if (this.burstLeft > 0) {
        if (this.shotT <= 0) { this.shotT = 0.115; this.burstLeft--; this.shoot(); }
      } else if (this.coolT <= 0) {
        this.burstLeft = randi(this.burstR[0], this.burstR[1]);
        this.coolT = rand(this.coolR[0], this.coolR[1]);
      }
    }
  };

  var _v1 = null, _v2 = null, _v3 = null;

  Bot.prototype.shoot = function () {
    if (!_v1) { _v1 = new THREE.Vector3(); _v2 = new THREE.Vector3(); _v3 = new THREE.Vector3(); }
    this.muzzle.getWorldPosition(_v1);
    var c = this.chestOfPlayer();
    var f = opts.getFeet();
    var py = f.y - AY;
    var tSpeed = opts.getPlayerSpeed ? opts.getPlayerSpeed() : 0;
    var dx = c.x - _v1.x, dy2 = c.y - _v1.y, dz = c.z - _v1.z;
    var dist = Math.sqrt(dx * dx + dy2 * dy2 + dz * dz);
    var spread = this.spread + dist * 0.0007 + tSpeed * 0.003;
    _v2.set(dx, dy2, dz).normalize();
    _v3.set(0, 1, 0).cross(_v2).normalize();
    var up = _v3.clone().cross(_v2);
    var a = rand(0, Math.PI * 2), rr = spread * Math.sqrt(Math.random());
    _v2.addScaledVector(_v3, Math.cos(a) * rr).addScaledVector(up, Math.sin(a) * rr).normalize();
    flashAt(_v1.x, _v1.y, _v1.z);
    try {
      var cam = opts.camera.position;
      var dc = _v1.distanceTo(cam);
      var vol = Math.max(0.04, 1 - dc / 55);
      if (window.BrixSfx) BrixSfx.play('akShot', { volume: vol * 0.8, jitter: 0.03 });
    } catch (eS) {}
    var wallT = bulletBlockLocal(_v1.x, _v1.y, _v1.z, _v2.x, _v2.y, _v2.z, 80);
    var pt = rayBox(_v1.x, _v1.y, _v1.z, _v2.x, _v2.y, _v2.z,
      f.x - 0.32, py, f.z - 0.32, f.x + 0.32, py + 1.78, f.z + 0.32);
    var hitDist = (pt >= 0 && (wallT < 0 || pt < wallT)) ? pt : -1;
    var wallDist = wallT >= 0 ? wallT : 80;
    var flyDist = hitDist >= 0 ? hitDist : wallDist;
    var end = _v1.clone().addScaledVector(_v2, flyDist);
    /* ✅ v0.4.66: ТРАССЕР КАК У ИГРОКОВ (наша система addTracer,
       вид 'ak'); свой простой — если хук не передан */
    if (opts.addTracer) {
      try { opts.addTracer(_v1.clone(), end, 'ak'); } catch (eT) { addSimpleTracer(_v1.clone(), end); }
    } else addSimpleTracer(_v1.clone(), end);
    if (hitDist >= 0) opts.onPlayerHit(this.dmg, this.name);
  };

  /* ---------- эффекты ботов (вспышка из TEX.flash + запасной трассер) ---------- */
  var fxTracers = [], fxFlash = [];
  function addSimpleTracer(from, to) {
    var g = new THREE.BufferGeometry().setFromPoints([from, to]);
    var m = new THREE.Line(g, new THREE.LineBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    opts.scene.add(m);
    fxTracers.push({ line: m, t: 0.14 });
  }
  function flashAt(x, y, z) {
    var s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.flash, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    s.scale.set(0.55, 0.55, 1);
    s.position.set(x, y, z);
    opts.scene.add(s);
    fxFlash.push({ s: s, t: 0.07 });
  }
  function tickFx(dt) {
    var i;
    for (i = fxTracers.length - 1; i >= 0; i--) {
      var tr = fxTracers[i];
      tr.t -= dt;
      tr.line.material.opacity = Math.max(0, tr.t / 0.14) * 0.9;
      if (tr.t <= 0) {
        opts.scene.remove(tr.line);
        tr.line.geometry.dispose(); tr.line.material.dispose();
        fxTracers.splice(i, 1);
      }
    }
    for (i = fxFlash.length - 1; i >= 0; i--) {
      var fl = fxFlash[i];
      fl.t -= dt;
      fl.s.material.opacity = Math.max(0, fl.t / 0.07) * 0.95;
      if (fl.t <= 0) {
        opts.scene.remove(fl.s);
        fl.s.material.dispose();
        fxFlash.splice(i, 1);
      }
    }
    /* знамёна колышутся */
    var tNow = performance.now() / 1000;
    for (i = 0; i < world.banners.length; i++) {
      var b = world.banners[i];
      var pos = b.geo.attributes.position;
      var base = b.base;
      for (var vi = 0; vi < pos.count; vi++) {
        var bx = base[vi * 3], by = base[vi * 3 + 1];
        var wave = Math.sin(tNow * 2.1 + by * 1.4 + bx * 0.6) * 0.07 * (1 - (by + 2.2) / 4.4);
        pos.array[vi * 3] = bx + wave;
        pos.array[vi * 3 + 2] = Math.sin(tNow * 1.6 + by) * 0.045;
      }
      pos.needsUpdate = true;
    }
    /* пыль дрейфует */
    if (world.dust) {
      var d = world.dust, arr = d.pts.geometry.attributes.position.array;
      for (var di = 0; di < d.n; di++) {
        var sx = d.seeds[di];
        arr[di * 3] = d.base[di * 3] + Math.sin(tNow * 0.35 + sx) * 1.6;
        arr[di * 3 + 1] = d.base[di * 3 + 1] + Math.sin(tNow * 0.5 + sx * 2) * 0.7;
        arr[di * 3 + 2] = d.base[di * 3 + 2] + Math.cos(tNow * 0.3 + sx) * 1.6;
      }
      d.pts.geometry.attributes.position.needsUpdate = true;
    }
  }

  /* ---------- попадания ИГРОКА по ботам ---------- */
  function botHit(originW, dirW, maxD) {
    var ox = originW.x, oy = originW.y - AY, oz = originW.z;
    var best = null;
    for (var i = 0; i < bots.length; i++) {
      var b = bots[i];
      if (b.state === 'dead') continue;
      var t = rayBox(ox, oy, oz, dirW.x, dirW.y, dirW.z,
        b.pos.x - 0.3, b.pos.y, b.pos.z - 0.24,
        b.pos.x + 0.3, b.pos.y + 1.85, b.pos.z + 0.24);
      if (t >= 0 && (!maxD || t <= maxD)) {
        var headT = rayBox(ox, oy, oz, dirW.x, dirW.y, dirW.z,
          b.pos.x - 0.2, b.pos.y + 1.5, b.pos.z - 0.2,
          b.pos.x + 0.2, b.pos.y + 1.85, b.pos.z + 0.2);
        if (!best || t < best.d) {
          best = {
            d: t, bot: b, hs: headT >= 0,
            point: originW.clone().addScaledVector(dirW, t)
          };
        }
      }
    }
    return best;
  }

  function damageBot(bot, dmg, hs) {
    if (!bot || bot.state === 'dead') return false;
    bot.hp -= hs ? dmg * 1.6 : dmg;
    bot.flashK = 1;
    bot.lastSeen.set(opts.getFeet().x, opts.getFeet().y - AY, opts.getFeet().z);
    bot.seenT = performance.now() / 1000;
    if (bot.target !== 'player') { bot.target = 'player'; bot.state = 'seek'; bot.repathT = 0; }
    if (bot.hp <= 0) {
      bot.state = 'dead';
      bot.deadT = 0;
      bot.respawnT = 5;
      bot.barG.visible = false;
      killCount++;
      if (window.BrixHud && BrixHud.toast) {
        BrixHud.toast(hs ? ('ГОЛОВА! ' + bot.name + ' убит · всего: ' + killCount)
                         : (bot.name + ' убит · всего: ' + killCount));
      }
      return true;
    }
    return false;
  }

  /* ---------- пули останавливаются стенами арены ---------- */
  function bulletBlockLocal(ox, oy, oz, dx, dy, dz, maxD) {
    var best = -1;
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      var t = rayBox(ox, oy, oz, dx, dy, dz, s.x0, s.y0, s.z0, s.x1, s.y1, s.z1);
      if (t >= 0 && (best < 0 || t < best)) best = t;
    }
    if (best >= 0 && maxD && best > maxD) return -1;
    return best;
  }

  function bulletBlock(originW, dirW, maxD) {
    var t = bulletBlockLocal(originW.x, originW.y - AY, originW.z, dirW.x, dirW.y, dirW.z, maxD);
    if (t < 0) return null;
    return { d: t, p: originW.clone().addScaledVector(dirW, t) };
  }

  /* ---------- пол игрока на арене (для контроллера) ---------- */
  function floorAt(x, z, feetY) {
    var best = null;
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      var top = AY + s.y1;
      if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 &&
          top <= feetY + STEP && (best === null || top > best)) best = top;
    }
    return best;
  }

  /* ============================================================
     КАРТА (миникарта M): локация сверху + боты
     ============================================================ */
  function drawMap(ctx, toX, toZ) {
    var x0 = toX(-HALF_W), x1 = toX(HALF_W), z0 = toZ(-HALF_D), z1 = toZ(HALF_D);
    ctx.fillStyle = '#3d3b38';
    ctx.fillRect(Math.min(x0, x1), Math.min(z0, z1), Math.abs(x1 - x0), Math.abs(z1 - z0));
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      if (s.y1 < 0.4) continue;
      var h = s.y1;
      ctx.fillStyle = h >= 3 ? '#5b5650' : h >= 1.3 ? '#6e6a63' : '#847e75';
      ctx.fillRect(Math.min(toX(s.x0), toX(s.x1)), Math.min(toZ(s.z0), toZ(s.z1)),
        Math.abs(toX(s.x1) - toX(s.x0)), Math.abs(toZ(s.z1) - toZ(s.z0)));
    }
    ctx.fillStyle = 'rgba(77,163,255,.25)';
    ctx.fillRect(Math.min(toX(-5.5), toX(5.5)), Math.min(toZ(15), toZ(21)),
      Math.abs(toX(5.5) - toX(-5.5)), Math.abs(toZ(21) - toZ(15)));
    ctx.fillStyle = 'rgba(255,90,60,.25)';
    ctx.fillRect(Math.min(toX(-5.5), toX(5.5)), Math.min(toZ(-21), toZ(-15)),
      Math.abs(toX(5.5) - toX(-5.5)), Math.abs(toZ(-15) - toZ(-21)));
    for (var b = 0; b < bots.length; b++) {
      if (bots[b].state === 'dead') continue;
      ctx.fillStyle = '#ff5a3c';
      ctx.beginPath();
      ctx.arc(toX(bots[b].pos.x), toZ(bots[b].pos.z), 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ============================================================
     СБОРКА / ТИК
     ============================================================ */
  var lastScene = null;

  /** ✅ v0.4.66: СБРОС при выходе из мира — иначе при повторном входе
      арена/боты остаются в ВЫБРОШЕННОЙ старой сцене и становятся
      невидимыми (главная причина «невидимых ботов») */
  function reset() {
    if (!built) return;
    try {
      for (var i = 0; i < bots.length; i++) {
        if (lastScene && bots[i].group) lastScene.remove(bots[i].group);
      }
      if (lastScene && world.dust && world.dust.pts) lastScene.remove(world.dust.pts);
      for (i = 0; i < world.banners.length; i++) {
        if (lastScene && world.banners[i].mesh) lastScene.remove(world.banners[i].mesh);
      }
    } catch (eR) {}
    bots.length = 0;
    solids.length = 0;
    worldBoxes.length = 0;
    nodes.length = 0;
    edges.length = 0;
    world.banners = []; world.cones = []; world.dust = null;
    built = false;
    killCount = 0;
    opts = null;
    lastScene = null;
    console.log('[BrixArena] локация сброшена (мир выгружен)');
  }

  function build(scene) {
    if (built) return;
    lastScene = scene;
    opts = { scene: scene, camera: null, getFeet: null, isDead: null,
      onPlayerHit: null, getPlayerSpeed: null, addTracer: null };
    window.BrixArenaTex.generate();
    TEX = window.BrixArenaTex.TEX;
    MAT = window.BrixArenaTex.MAT;
    buildWorld(scene);
    rebuildWorldBoxes();
    buildGraph();
    built = true;
    console.log('[BrixArena] «ПОЛИГОН» (СЕКТОР-9, полный порт): солидов ' +
      solids.length + ', узлов ' + nodes.length + ', ботов ' + BOTS_TOTAL);
  }

  function startBots(o) {
    opts.camera = o.camera;
    opts.getFeet = o.getFeet;
    opts.isDead = o.isDead;
    opts.onPlayerHit = o.onPlayerHit;
    opts.getPlayerSpeed = o.getPlayerSpeed;
    opts.addTracer = o.addTracer || null;
    if (bots.length) return;
    for (var i = 0; i < BOTS_TOTAL; i++) bots.push(new Bot(i));
    console.log('[BrixArena] ботов в бою: ' + bots.length);
  }

  function tick(dt, camera) {
    if (!built) return;
    opts.camera = camera;
    for (var i = 0; i < bots.length; i++) bots[i].update(dt);
    tickFx(dt);
  }

  function spawnPoint() {
    var sp = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
    return { x: sp[0], z: sp[1], y: AY };
  }

  return {
    build: build,
    reset: reset,
    startBots: startBots,
    tick: tick,
    floorAt: floorAt,
    bulletBlock: bulletBlock,
    botHit: botHit,
    damageBot: damageBot,
    drawMap: drawMap,
    spawnPoint: spawnPoint,
    getBots: function () { return bots; },
    isBuilt: function () { return built; },
    getKillCount: function () { return killCount; },
    boxes: function () { return worldBoxes; },
    BOTS_TOTAL: BOTS_TOTAL,
    AY: AY
  };
})();
