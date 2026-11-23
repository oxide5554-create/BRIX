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
//  ✅ v0.5.0 КОМАНДНЫЙ БОЙ: СТАЛЬ (синие) против ПЛАМЯ (красные).
//    БОТЫ — УЧЁНЫЕ (ScientistRigged, риг/анимации — arena-bot.js,
//    порт bot-studio v3: стойка/шаг/бег/прицел/огонь/смерть, хват
//    АК двухкостным IK, игровой ak47.glb):
//    · синие — scientist_body_albedo_blue.png (встроен в GLB);
//    · красные — тот же костюм в КРАСНОМ раскрасе
//      (scientist_body_albedo_red.png);
//    · на арене 10 ботов (5+5); ВХОД ИГРОКА — один СИНИЙ бот уходит
//      (игрок играет за СТАЛЬ, состав сторон остаётся 5 на 5);
//    · в серверном режиме боты СИНХРОННЫ: их считает server.js
//      (brixpvp-bots.js) и рассылает 'bots' 10 Гц — все игроки видят
//      ОДНИХ ботов, которые стреляют в БЛИЖАЙШЕГО врага;
//    · СВОИХ НЕ УБИТЬ: попадания по синим игнорируются (и у клиента,
//      и на сервере), синие боты не целятся в игрока;
//    · СЧЁТ КИЛОВ КОМАНД сверху (pvphud.js), ПОБЕДА ДО 30.
//    · вне сервера (вкладки/соло) — ЛОКАЛЬНЫЙ сим тех же ботов.
//  · КАРТА (M): drawMap рисует локацию сверху + точки ботов по командам.
// ============================================================
window.BrixArena = (function () {
  'use strict';

  /* ---------- константы локации (метры) ----------
     ✅ v0.5.5: размер/спавны — от РЕЕСТРА КАРТ (window.BrixMapData):
     «СЕКТОР-9» 62×46 ⇄ «ПОРТ · ПРИЧАЛ-7» 76×56, ротация после
     каждого раунда. Значения ниже — для карты по умолчанию,
     applyMap() переприсваивает при сборке */
  var FLOOR_W = 62, FLOOR_D = 46;
  var HALF_W = FLOOR_W / 2, HALF_D = FLOOR_D / 2;
  var AY = 3.45;                          // верх бетонного пола в мире (terrain pvp = 3.2)
  var STEP = 0.55, GRAV = 14;
  var BOTS_TOTAL = 10;                    // ✅ v0.5.0: 10 ботов (5 СТАЛЬ + 5 ПЛАМЯ)

  var built = false;
  var curMapId = null;                    // ✅ v0.5.5: текущая карта
  var pendingMap = null;                  // карта из welcome (арена ещё не собрана)
  var solids = [];
  var worldBoxes = [];
  var worldGroup = null;                  // ✅ v0.5.5: ВСЯ геометрия карты в одной группе — смена карты сносит её целиком

  var botNames = ['СТАЛЬ', 'ПЛАМЯ'];
  var SPAWNS = [[10, 18.5], [-10, 18.5], [4, 19], [-4, 19]];
  /* ✅ v0.5.0: команды по ЗОНАМ — СТАЛЬ (синие) юг, ПЛАМЯ (красные) север */
  var BOT_SPAWNS_BLUE = [[10, 18.5], [-10, 18.5], [4, 19], [-4, 19], [0, 19.5]];
  var BOT_SPAWNS_RED = [[10, -18.5], [-10, -18.5], [4, -19], [-4, -19], [0, -19.5]];
  var opts = null;

  /** определение карты по id (реестр BrixMapData, фолбэк — СЕКТОР-9) */
  function mapDef(id) {
    var MD = window.BrixMapData;
    if (MD && MD.MAPS[id]) return MD.MAPS[id];
    return MD ? MD.get(null) : null;
  }
  /** применить размер/спавны карты */
  function applyMap(id) {
    var m = mapDef(id) || mapDef('sektor9');
    curMapId = m.id;
    FLOOR_W = m.w; FLOOR_D = m.d;
    HALF_W = m.w / 2; HALF_D = m.d / 2;
    SPAWNS = m.spawns;
    BOT_SPAWNS_BLUE = m.botSpawns.blue;
    BOT_SPAWNS_RED = m.botSpawns.red;
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randi(a, b) { return Math.floor(rand(a, b + 1)); }

  /* ---------- солиды и мешы ---------- */
  var MAT = null, TEX = null;

  /**
   * ✅ v0.5.5: addSolid с МЕТКОЙ ПОВЕРХНОСТИ (m: 'wood'|'metal'…) —
   * по ней BrixFx красит пыль попаданий. Метка берётся из opt.tag,
   * а если не задана — из material→tag таблицы TAG_OF.
   */
  var TAG_OF = null;                       // Map: material → 'wood'|'metal'…
  function matTag(mat, explicit) {
    if (explicit) return explicit;
    if (TAG_OF && mat && TAG_OF.get(mat)) return TAG_OF.get(mat);
    return null;
  }
  function addSolid(x, y, z, w, h, d, ry, tag) {
    ry = ry || 0;
    var c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
    var hx = (w * c + d * s) / 2, hz = (w * s + d * c) / 2;
    var so = { x0: x - hx, x1: x + hx, y0: y, y1: y + h, z0: z - hz, z1: z + hz };
    if (tag) so.m = tag;
    solids.push(so);
  }
  /** ✅ v0.5.5: тип поверхности в точке (для цвета пыли) */
  function solidAt(x, y, z) {
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      if (x >= s.x0 && x <= s.x1 && y >= s.y0 - 0.1 && y <= s.y1 + 0.1 &&
          z >= s.z0 && z <= s.z1 && s.m) return s.m;
    }
    return null;
  }

  function mesh(geo, mat, x, y, z, opt) {
    opt = opt || {};
    var m = new THREE.Mesh(geo, mat);
    m.position.set(x, AY + y, z);
    m.rotation.set(opt.rx || 0, opt.ry || 0, opt.rz || 0);
    if (opt.cast) m.castShadow = true;
    if (opt.recv !== false) m.receiveShadow = true;
    /* ✅ v0.5.5: вся карта в worldGroup — смена карты сносит группу целиком */
    (opt.parent || worldGroup || opts.scene).add(m);
    return m;
  }

  function solidBox(w, h, d, mat, x, y, z, opt) {
    opt = opt || {};
    var m = mesh(MAT.gBox(w, h, d), mat, x, y + h / 2, z, opt);
    addSolid(x, y, z, w, h, d, opt.ry || 0, matTag(mat, opt.tag));
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
     ЛОКАЦИЯ — «ПОЛИГОН» (СЕКТОР-9): ПОЛНЫЙ ПОРТ buildWorld
     ✅ v0.5.6: вторая карта «ПОРТ» УДАЛЕНА (по решению) — одна
     карта, ротации нет; реестр карт (arena-mapdata) оставлен
     как источник спавнов/нав-зон для этой карты.
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
      worldGroup.add(m);
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
      worldGroup.add(head);
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
      worldGroup.add(cone);
      world.cones.push(cone);
      if (real && THREE.SpotLight) {
        var sp = new THREE.SpotLight(0xffd9a0, 260, 70, 0.62, 0.55, 1.6);
        sp.position.set(tx, AY + 8.3, tz);
        sp.target.position.set(tx * 0.28, AY, tz * 0.28);
        worldGroup.add(sp); worldGroup.add(sp.target);
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
    worldGroup.add(dust);
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
    /* ✅ v0.5.5: сетка по размеру КАРТЫ + нав-зоны из arena-mapdata
       (платформы-plates + лестницы-stairs) — у каждой карты свои */
    var m = mapDef(curMapId) || {};
    var nav = m.nav || [];
    var grid = [], gx, gz;
    for (gx = -(HALF_W - 4); gx <= HALF_W - 4; gx += 4.5)
      for (gz = -(HALF_D - 4); gz <= HALF_D - 4; gz += 4.75) {
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
    /* платформы (plates): узлы по pts, все связаны при видимости */
    var plates = [];
    for (i2 = 0; i2 < nav.length; i2++) {
      if (!nav[i2].plate) continue;
      var pn = nav[i2].plate;
      var plat = [];
      for (var pp2 = 0; pp2 < pn.pts.length; pp2++)
        plat.push(addNode(pn.pts[pp2][0], pn.y, pn.pts[pp2][1]));
      for (i2 = 0; i2 < plat.length; i2++) for (j2 = i2 + 1; j2 < plat.length; j2++) {
        a = nodes[plat[i2]]; b = nodes[plat[j2]];
        if (segClearLocal(a.x, pn.y + 1.1, a.z, b.x, pn.y + 1.1, b.z)) link(plat[i2], plat[j2]);
      }
      plates.push(plat);
    }
    /* лестницы (stairs): цепочка ступеней, foot → сетка, конец → plate */
    for (i2 = 0; i2 < nav.length; i2++) {
      if (!nav[i2].stairs) continue;
      var st = nav[i2].stairs;
      var best2 = 1e9, foot = -1, gi2;
      for (gi2 = 0; gi2 < grid.length; gi2++) {
        var n4 = nodes[grid[gi2]];
        var d4 = Math.hypot(n4.x - st.foot[0], n4.z - st.foot[1]);
        if (d4 < best2) { best2 = d4; foot = grid[gi2]; }
      }
      var prev = foot;
      for (var si2 = 0; si2 < st.n; si2++) {
        var sx2 = st.x + st.dx * (si2 + 0.5), sz2 = st.z + st.dz * (si2 + 0.5);
        var ni2 = addNode(sx2, st.y0 * (si2 + 1), sz2);
        link(prev, ni2); prev = ni2;
      }
      /* конец лестницы → ближайший узел своей платформы */
      var plate = plates[st.plate] || [];
      var best3 = 1e9, bi3 = plate.length ? plate[0] : -1;
      for (var pi3 = 0; pi3 < plate.length; pi3++) {
        var n5 = nodes[plate[pi3]];
        var d5 = Math.hypot(n5.x - nodes[prev].x, n5.z - nodes[prev].z);
        if (d5 < best3) { best3 = d5; bi3 = plate[pi3]; }
      }
      if (bi3 >= 0) link(prev, bi3);
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
     ✅ v0.5.0 БОТЫ «ПОЛИГОНА» — КОМАНДЫ СТАЛЬ/ПЛАМЯ.
     Серверный режим: server.js считает ботов (brixpvp-bots.js) и
     шлёт 'bots' 10 Гц — арена только РИСУЕТ вью (arena-bot.js,
     учёный ScientistRigged с процедурными анимациями bot-studio)
     и шлёт 'bhit' при попаданиях. Вне сервера — ЛОКАЛЬНЫЙ сим
     тех же команд (вкладки/соло): та же ИИ-логика на этом нав-графе.
     ============================================================ */
  var KILL_LIMIT = 30;                    // победа до 30 килов
  var MY_TEAM = 'blue';                   // все игроки — СТАЛЬ (синие)
  var views = {};                         // i -> BotView (arena-bot.js)
  var viewInfo = {};                      // i -> {team, name}
  var feedMode = false;                   // пришёл ли фид сервера
  var feedT = 0;
  var pendingFeed = null;                 // фид до постройки арены (welcome раньше build)
  var scores = { blue: 0, red: 0 };
  var killCount = 0;                      // мои килы (для статистики)
  var localSim = [];                      // локальный сим (вне сервера)
  var LDIFF = { spread: 0.075, dmg: 7, burst: [2, 4], cool: [1.5, 2.8], react: 0.75, speed: 3.2 };
  var LOCAL_TEAMS = [['СТАЛЬ', 'blue'], ['ПЛАМЯ', 'red']];
  var lbotSeq = 0;

  function ensureView(i, team, name) {
    if (!window.BrixBotRig) return null;
    if (views[i]) return views[i];
    var v = BrixBotRig.create(opts.scene, team, name || 'БОТ-' + (i + 1), i);
    v.pos.set(0, AY, 0);
    views[i] = v;
    viewInfo[i] = { team: team, name: name || 'БОТ-' + (i + 1) };
    return v;
  }

  /* ---------- ФИД СЕРВЕРА: 'bots' 10 Гц ---------- */
  function feedBots(list) {
    feedMode = true;
    feedT = performance.now() / 1000;
    /* ✅ локальный сим работал (обрыв был временный) — фид вернулся:
       сим глушим, его вью убираем */
    if (opts && opts.localSim && localSim.length) {
      opts.localSim = false;
      localSim.length = 0;
      for (var lk in views) if (String(lk).charAt(0) === 'L') removeView(lk);
      console.log('[BrixArena] фид ботов вернулся — локальный сим остановлен');
    }
    if (!built || !opts) { pendingFeed = list; return; }
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      var b = list[i];                     // [i, x, y, z, yaw, st, hp, team, name]
      if (!Array.isArray(b) || b.length < 8) continue;
      var id = b[0], team = b[7] === 'r' ? 'red' : 'blue';
      var nm = b.length > 8 && b[8] ? String(b[8]) : (team === 'red' ? 'ПЛАМЯ' : 'СТАЛЬ') + '-' + id;
      seen[id] = true;
      if (!viewInfo[id]) viewInfo[id] = { team: team, name: nm };
      else viewInfo[id].name = nm;
      var v = ensureView(id, team, nm);
      if (v) {
        v.tPos.set(b[1], b[2], b[3]);
        v.tYaw = b[4];
        v.st = b[5];
        v.setHp(b[6]);
        if (v.pos.lengthSq() < 0.01 && !v.built0) { v.pos.copy(v.tPos); v.built0 = true; }
      }
    }
    // ушедшие из фида боты (игрок занял слот) — вид убираем
    for (var key in views) if (!seen[key]) removeView(key);
  }

  function removeView(i) {
    if (views[i]) { views[i].dispose(); delete views[i]; }
    delete viewInfo[i];
  }

  /** 'bshot' — выстрел бота: трассер + звук.
      ✅ v0.5.6: НИКАКИХ вспышек и дыр от ботов — дыры видны только
      от СВОИХ выстрелов (BrixFx.impact звать в gameworld.js) */
  function feedShot(i, f, e) {
    if (!built) return;
    var v = views[i];
    if (v) { v.triggerShot(); v.lastShotFx = 0; }
    var from = new THREE.Vector3(f[0], f[1], f[2]);
    var to = new THREE.Vector3(e[0], e[1], e[2]);
    if (opts.addTracer) { try { opts.addTracer(from, to, 'ak'); } catch (eT) { addSimpleTracer(from, to); } }
    else addSimpleTracer(from, to);
    try {
      var cam = opts.camera ? opts.camera.position : from;
      var vol = Math.max(0.04, 1 - from.distanceTo(cam) / 55);
      if (window.BrixSfx) BrixSfx.play('akShot', { volume: vol * 0.8, jitter: 0.03 });
    } catch (eS) {}
  }

  /** 'bdead' — бот убит (визуал); счёт приходит отдельно в 'bscore' */
  function feedDeath(i) {
    if (!built) return;
    if (views[i]) views[i].die();
  }

  /** 'bspawn' — бот вернулся */
  function feedSpawn(i) {
    if (!built) return;
    if (views[i]) views[i].revive();
  }

  /** 'bscore' — счёт килов команд */
  function feedScore(blue, red, limit) {
    scores.blue = blue; scores.red = red;
    if (limit) KILL_LIMIT = limit;
    if (opts && opts.onScore) { try { opts.onScore(scores.blue, scores.red, KILL_LIMIT); } catch (eS) {} }
  }

  /** 'bwin' — команда добила до лимита */
  function feedWin(team, blue, red) {
    if (opts && opts.onWin) { try { opts.onWin(team, blue, red); } catch (eW) {} }
  }

  /* ============================================================
     ЛОКАЛЬНЫЙ СИМ (вне сервера: соло/вкладки) — те же команды,
     та же ИИ-логика (порт старого бота v0.4.66 + команды).
     ============================================================ */
  function makeLocalBot(team, name, idx) {
    return {
      i: 'L' + (lbotSeq++), team: team, name: name,
      spread: LDIFF.spread * rand(0.85, 1.2),
      dmg: LDIFF.dmg,
      burstR: LDIFF.burst, coolR: LDIFF.cool,
      react: LDIFF.react, speed: LDIFF.speed * rand(0.92, 1.08),
      pos: new THREE.Vector3(), vy: 0, yaw: 0, hp: 100, state: 'patrol', st: 0,
      target: null, lastSeen: new THREE.Vector3(), seenT: -99,
      path: [], thinkT: rand(0, 0.25), repathT: 0, reactT: 0,
      strafeSign: 1, strafeT: 0, burstLeft: 0, shotT: 0,
      ammo: 30, reloadT: 0,   /* ✅ v0.5.3: магазин/перезарядка */
      coolT: rand(0.5, 1.5), deadT: 0, respawnT: 0,
      lastShotT: 9, stuckT: 0, lastPos: new THREE.Vector3()
    };
  }

  function spawnLocalBot(b, first) {
    var sps = b.team === 'red' ? BOT_SPAWNS_RED : BOT_SPAWNS_BLUE;
    var best = sps[0], bd = -1;
    var f = opts && opts.getFeet ? opts.getFeet() : { x: 0, z: 0 };
    for (var i = 0; i < sps.length; i++) {
      var md = Math.hypot(sps[i][0] - f.x, sps[i][1] - f.z) + rand(0, 3);
      if (md > bd) { bd = md; best = sps[i]; }
    }
    b.pos.set(best[0], 0, best[1]);
    b.vy = 0; b.hp = 100; b.state = 'patrol'; b.target = null;
    b.path = []; b.deadT = 0; b.reactT = 0; b.st = 0;
    b.ammo = 30; b.reloadT = 0; b.burstLeft = 0;  /* ✅ v0.5.3 */
    b.yaw = b.team === 'red' ? 0 : Math.PI;
    var v = ensureView(b.i, b.team, b.name);
    if (v) { v.tPos.set(best[0], AY, best[1]); v.pos.copy(v.tPos); v.tYaw = b.yaw; v.revive(); }
    if (!first) b.thinkT = 0;
  }

  /** живые враги локального бота: игрок (только для ПЛАМЯ) + чужие боты */
  function localTargetsOf(b) {
    var out = [];
    var alive = opts && !opts.isDead();
    if (alive && b.team !== MY_TEAM) {
      var f = opts.getFeet();
      out.push({ kind: 'player', x: f.x, y: f.y - AY, z: f.z, name: 'ИГРОК' });
    }
    for (var i = 0; i < localSim.length; i++) {
      var ob = localSim[i];
      if (ob === b || ob.team === b.team || ob.state === 'dead') continue;
      out.push({ kind: 'bot', x: ob.pos.x, y: ob.pos.y, z: ob.pos.z, name: ob.name, bot: ob });
    }
    return out;
  }

  function localThink(b, dt) {
    var fy = b.pos.y + 1.6;
    var bestT = null, bestD = 1e9;
    var list = localTargetsOf(b);
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      var d = Math.hypot(t.x - b.pos.x, t.z - b.pos.z);
      if (d > 40 || d >= bestD) continue;
      if (segClearLocal(b.pos.x, fy, b.pos.z, t.x, t.y + 1.25, t.z)) { bestT = t; bestD = d; }
    }
    if (bestT) {
      if (!b.target || b.target.name !== bestT.name) b.reactT = b.react * rand(0.8, 1.3);
      b.target = bestT; b.los = true; b.state = 'engage';
      b.lastSeen.set(bestT.x, bestT.y, bestT.z); b.seenT = performance.now() / 1000;
      return;
    }
    b.los = false;
    if (b.target && performance.now() / 1000 - b.seenT < 4) b.state = 'seek';
    else { b.target = null; b.state = 'patrol'; }
    if (b.state === 'seek') {
      b.repathT -= dt;
      if (b.repathT <= 0 || !b.path.length) {
        b.repathT = 1.2;
        b.path = bfsPath(nearestNode(b.pos.x, b.pos.z, b.pos.y), nearestNode(b.lastSeen.x, b.lastSeen.z, 0)) || [];
      }
    } else if (b.state === 'patrol') {
      if (!b.path.length && Math.random() < 0.5)
        b.path = bfsPath(nearestNode(b.pos.x, b.pos.z, b.pos.y), randi(0, nodes.length - 1)) || [];
    } else if (b.state === 'engage' && b.target) {
      var d2 = Math.hypot(b.target.x - b.pos.x, b.target.z - b.pos.z);
      if (d2 > 19) {
        b.repathT -= dt;
        if (b.repathT <= 0 || !b.path.length) {
          b.repathT = 1.2;
          b.path = bfsPath(nearestNode(b.pos.x, b.pos.z, b.pos.y), nearestNode(b.target.x, b.target.z, 0)) || [];
        }
      } else b.path = [];
    }
  }

  function localShoot(b) {
    var t = b.target;
    if (!t) return;
    var mx = b.pos.x, my = b.pos.y + 1.45, mz = b.pos.z;
    var dx = t.x - mx, dy = (t.y + 1.25) - my, dz = t.z - mz;
    var dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    var spread = b.spread + dist * 0.0007;
    dx /= dist; dy /= dist; dz /= dist;
    var rx = -dz, rz = dx;
    var a = rand(0, Math.PI * 2), rr = spread * Math.sqrt(Math.random());
    dx += Math.cos(a) * rr * rx; dz += Math.sin(a) * rr * rx; dy += Math.sin(a) * rr * rz * 0.4;
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= len; dy /= len; dz /= len;
    var wallT = bulletBlockLocal(mx, my, mz, dx, dy, dz, 80);
    var wallDist = wallT >= 0 ? wallT : 80;
    var hit = null;
    for (var i = 0; i < localSim.length; i++) {
      var ob = localSim[i];
      if (ob === b || ob.team === b.team || ob.state === 'dead') continue;
      var tt = rayBox(mx, my, mz, dx, dy, dz,
        ob.pos.x - 0.3, ob.pos.y, ob.pos.z - 0.24,
        ob.pos.x + 0.3, ob.pos.y + 1.85, ob.pos.z + 0.24);
      if (tt >= 0 && tt < wallDist && (!hit || tt < hit.d)) hit = { d: tt, kind: 'bot', bot: ob };
    }
    var alive = opts && !opts.isDead();
    if (alive && b.team !== MY_TEAM) {
      var f = opts.getFeet();
      var py = f.y - AY;
      var pt = rayBox(mx, my, mz, dx, dy, dz,
        f.x - 0.32, py, f.z - 0.32, f.x + 0.32, py + 1.78, f.z + 0.32);
      if (pt >= 0 && pt < wallDist && (!hit || pt < hit.d)) hit = { d: pt, kind: 'player' };
    }
    var fly = hit ? hit.d : wallDist;
    var from = new THREE.Vector3(mx, my + AY, mz);
    var to = new THREE.Vector3(mx + dx * fly, my + dy * fly + AY, mz + dz * fly);
    if (TEX && TEX.flash) BrixBotRig.flashAt(opts.scene, TEX.flash, from.x, from.y, from.z);
    if (opts.addTracer) { try { opts.addTracer(from, to, 'ak'); } catch (eT) { addSimpleTracer(from, to); } }
    else addSimpleTracer(from, to);
    try {
      var cam = opts.camera.position;
      var vol = Math.max(0.04, 1 - from.distanceTo(cam) / 55);
      if (window.BrixSfx) BrixSfx.play('akShot', { volume: vol * 0.8, jitter: 0.03 });
    } catch (eS) {}
    b.lastShotT = 0;
    if (!hit) return;
    if (hit.kind === 'player') {
      if (opts.onPlayerHit) opts.onPlayerHit(b.dmg, b.name);
    } else {
      hit.bot.hp -= b.dmg;
      hit.bot.lastSeen.set(b.pos.x, b.pos.y, b.pos.z);
      if (hit.bot.hp <= 0) localKillBot(hit.bot, { k: 'bot', n: b.name, team: b.team });
    }
  }

  function localKillBot(b, by) {
    b.state = 'dead';
    b.deadT = 0; b.respawnT = 5; b.st = 5;
    if (views[b.i]) views[b.i].die();
    var team = by.team || (by.k === 'player' ? MY_TEAM : null);
    if (team) {
      scores[team]++;
      if (opts.onScore) { try { opts.onScore(scores.blue, scores.red, KILL_LIMIT); } catch (eS) {} }
      if (opts.onWin && (scores.blue >= KILL_LIMIT || scores.red >= KILL_LIMIT)) {
        opts.onWin(scores.blue >= KILL_LIMIT ? 'blue' : 'red', scores.blue, scores.red);
        scores = { blue: 0, red: 0 };
      }
    }
    if (by.k === 'player') {
      killCount++;
      if (window.BrixHud && BrixHud.toast) {
        BrixHud.toast(b.name + ' убит · счёт СТАЛЬ ' + scores.blue + ' : ' + scores.red + ' ПЛАМЯ');
      }
      /* ✅ v0.5.3: награда за килл — полные патроны + полное хп */
      if (opts && opts.onPlayerKill) { try { opts.onPlayerKill('bot'); } catch (eK) {} }
    }
  }

  function startLocalSim() {
    feedMode = false;
    // соло: игрок — СТАЛЬ, поэтому синих ботов 4, красных 5 (5 на 5)
    var plan = [[0, 'СТАЛЬ-1', 'blue'], [1, 'СТАЛЬ-2', 'blue'], [2, 'СТАЛЬ-3', 'blue'], [3, 'СТАЛЬ-4', 'blue'],
      [4, 'ПЛАМЯ-1', 'red'], [5, 'ПЛАМЯ-2', 'red'], [6, 'ПЛАМЯ-3', 'red'], [7, 'ПЛАМЯ-4', 'red'], [8, 'ПЛАМЯ-5', 'red']];
    for (var i = 0; i < plan.length; i++) {
      var b = makeLocalBot(plan[i][2], plan[i][1], i);
      localSim.push(b);
      spawnLocalBot(b, true);
    }
    console.log('[BrixArena] ЛОКАЛЬНЫЙ сим: ботов ' + localSim.length + ' (СТАЛЬ 4 + ПЛАМЯ 5)');
  }

  function localTick(dt) {
    for (var i = 0; i < localSim.length; i++) {
      var b = localSim[i];
      if (b.state === 'dead') {
        b.deadT += dt; b.respawnT -= dt;
        if (b.respawnT <= 0) spawnLocalBot(b, false);
        continue;
      }
      b.thinkT -= dt;
      if (b.thinkT <= 0) { b.thinkT = 0.22; localThink(b, dt); }
      var wx = 0, wz = 0, spd = b.speed;
      if (b.state === 'engage' && b.target && b.los && !b.path.length) {
        /* ✅ v0.5.7: СТРЕЛЯЕТ СТОЯ — в очереди замирает, стрейф/дистанция
           только в паузах между очередями (как на сервере) */
        if (b.burstLeft <= 0) {
          var t = b.target;
          var dx = t.x - b.pos.x, dz = t.z - b.pos.z, d = Math.hypot(dx, dz) || 1;
          b.strafeT -= dt;
          if (b.strafeT <= 0) { b.strafeT = rand(0.7, 1.6); b.strafeSign *= -1; }
          var pxv = -dz / d * b.strafeSign, pzv = dx / d * b.strafeSign;
          var rangeErr = clamp((d - 11) * 0.14, -1, 1);
          wx = pxv * 0.8 + dx / d * rangeErr; wz = pzv * 0.8 + dz / d * rangeErr;
          spd = b.speed * 0.8;
        }
      } else if (b.path.length) {
        var n = nodes[b.path[0]];
        var ddx = n.x - b.pos.x, ddz = n.z - b.pos.z, dd = Math.hypot(ddx, ddz);
        if (dd < 0.85) b.path.shift();
        else { wx = ddx / dd; wz = ddz / dd; }
        if (b.state === 'patrol') spd = b.speed * 0.62;
      }
      var wl = Math.hypot(wx, wz);
      if (wl > 0.01) { wx /= wl; wz /= wl; }
      b.pos.x += wx * spd * dt; b.pos.z += wz * spd * dt;
      resolveXZLocal(b.pos, 0.35, 1.7);
      b.vy -= GRAV * dt; b.pos.y += b.vy * dt;
      var gr = groundAtLocal(b.pos.x, b.pos.z, b.pos.y + Math.max(0, -b.vy * dt));
      if (b.pos.y <= gr) { b.pos.y = gr; b.vy = 0; }
      b.stuckT += dt;
      if (b.stuckT > 0.7) {
        var moved = b.pos.distanceTo(b.lastPos);
        if (moved < 0.12 && wl > 0.01) {
          b.path = bfsPath(nearestNode(b.pos.x, b.pos.z, b.pos.y), randi(0, nodes.length - 1)) || [];
          b.strafeSign *= -1;
        }
        b.lastPos.copy(b.pos); b.stuckT = 0;
      }
      /* ✅ v0.5.2: БЕЗ отрицаний — лицом (+Z) по движению/цели
         (как в brixpvp-bots.js; раньше боты шли спиной вперёд) */
      var targetYaw = b.yaw;
      if (b.state === 'engage' && b.target)
        targetYaw = Math.atan2(b.target.x - b.pos.x, b.target.z - b.pos.z);
      else if (wl > 0.01) targetYaw = Math.atan2(wx, wz);
      var dy2 = targetYaw - b.yaw;
      while (dy2 > Math.PI) dy2 -= Math.PI * 2;
      while (dy2 < -Math.PI) dy2 += Math.PI * 2;
      b.yaw += dy2 * Math.min(1, 10 * dt);
      // ст для анимаций
      b.lastShotT += dt;
      if (b.reloadT > 0) b.st = 6;   /* ✅ v0.5.3: перезарядка */
      else if (b.lastShotT < 0.18) b.st = 4;
      else if (b.state === 'engage') b.st = 3;
      else if (spd > 3.05 && wl > 0.01) b.st = 2;
      else if (wl > 0.01) b.st = 1;
      else b.st = 0;
      /* ✅ v0.5.3: огонь как на сервере — магазин 30, ПЕРЕЗАРЯДКА 2.6 с
         (st=6), пауза 1.5–2.8 с + 30% «наблюдение» ×2.2 (не стреляют
         ВСЕГДА) */
      b.reactT -= dt; b.shotT -= dt; b.coolT -= dt;
      if (b.reloadT > 0) {
        b.reloadT -= dt;
        if (b.reloadT <= 0) { b.reloadT = 0; b.ammo = 30; }
      } else if (b.state === 'engage' && b.target && b.los && b.reactT <= 0) {
        if (b.burstLeft > 0) {
          if (b.shotT <= 0) {
            b.shotT = 0.14; b.burstLeft--;
            if (b.ammo > 0) { b.ammo--; localShoot(b); }
            if (b.ammo <= 0) { b.reloadT = 2.6; b.burstLeft = 0; }
          }
        } else if (b.coolT <= 0) {
          b.burstLeft = randi(LDIFF.burst[0], LDIFF.burst[1]);
          b.coolT = rand(LDIFF.cool[0], LDIFF.cool[1]);
          if (Math.random() < 0.3) b.coolT *= 2.2;  /* наблюдает */
        }
      }
      var v = views[b.i];
      if (v) {
        v.tPos.set(b.pos.x, AY + b.pos.y, b.pos.z);
        v.tYaw = b.yaw;
        v.st = b.st;
        v.setHp(b.hp);
      }
    }
  }

  /* ---------- эффекты ботов (вспышка — в BrixBotRig.flashAt) ---------- */
  var fxTracers = [];
  function addSimpleTracer(from, to) {
    var g = new THREE.BufferGeometry().setFromPoints([from, to]);
    var m = new THREE.Line(g, new THREE.LineBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    worldGroup.add(m);
    fxTracers.push({ line: m, t: 0.14 });
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

  /* ---------- попадания ИГРОКА по ботам ----------
     ✅ v0.5.0: СВОИХ НЕ УБИВАЕМ — синие боты (команда игрока СТАЛЬ)
     отфильтрованы из проверки попадания: по ним нет ни хит-маркера,
     ни урона. Красные боты принимают урон через сервер ('bhit') или
     локальный сим */
  function botHit(originW, dirW, maxD) {
    var ox = originW.x, oy = originW.y - AY, oz = originW.z;
    var best = null;
    for (var key in views) {
      var v = views[key];
      var info = viewInfo[key];
      if (!info || info.team === MY_TEAM) continue;      // свои — мимо
      if (v.dead || v.st === 5) continue;
      var b = { x: v.pos.x, y: v.pos.y - AY, z: v.pos.z };
      var t = rayBox(ox, oy, oz, dirW.x, dirW.y, dirW.z,
        b.x - 0.3, b.y, b.z - 0.24,
        b.x + 0.3, b.y + 1.85, b.z + 0.24);
      if (t >= 0 && (!maxD || t <= maxD)) {
        var headT = rayBox(ox, oy, oz, dirW.x, dirW.y, dirW.z,
          b.x - 0.2, b.y + 1.5, b.z - 0.2,
          b.x + 0.2, b.y + 1.85, b.z + 0.2);
        if (!best || t < best.d) {
          best = {
            d: t, bot: { id: key }, hs: headT >= 0,
            point: originW.clone().addScaledVector(dirW, t)
          };
        }
      }
    }
    /* локальный сим: та же проверка по объектам сима */
    for (var i = 0; i < localSim.length; i++) {
      var lb = localSim[i];
      if (lb.team === MY_TEAM || lb.state === 'dead') continue;
      var t2 = rayBox(ox, oy, oz, dirW.x, dirW.y, dirW.z,
        lb.pos.x - 0.3, lb.pos.y, lb.pos.z - 0.24,
        lb.pos.x + 0.3, lb.pos.y + 1.85, lb.pos.z + 0.24);
      if (t2 >= 0 && (!maxD || t2 <= maxD)) {
        var headT2 = rayBox(ox, oy, oz, dirW.x, dirW.y, dirW.z,
          lb.pos.x - 0.2, lb.pos.y + 1.5, lb.pos.z - 0.2,
          lb.pos.x + 0.2, lb.pos.y + 1.85, lb.pos.z + 0.2);
        if (!best || t2 < best.d) {
          best = {
            d: t2, bot: { lbot: lb }, hs: headT2 >= 0,
            point: originW.clone().addScaledVector(dirW, t2)
          };
        }
      }
    }
    return best;
  }

  /**
   * ✅ v0.5.0: урон боту. Серверный режим — шлём 'bhit' (сервер
   * авторитетен: пересчитает, пришлёт 'bdead'/'bscore'), локальный
   * сим — урон сразу. Возвращает true (для хит-маркера).
   */
  function damageBot(bot, dmg, hs) {
    if (!bot) return false;
    /* локальный сим */
    if (bot.lbot) {
      if (bot.lbot.state === 'dead') return false;
      bot.lbot.hp -= hs ? dmg * 1.6 : dmg;
      if (views[bot.lbot.i]) views[bot.lbot.i].setHp(bot.lbot.hp);
      if (bot.lbot.hp <= 0) localKillBot(bot.lbot, { k: 'player', team: MY_TEAM });
      return true;
    }
    /* фид сервера: свои вообще не доходят сюда (botHit фильтрует),
       на сервере дублируется защита; отправляем биту */
    if (BrixNet && BrixNet.mode === 'server') {
      BrixNet.send({ t: 'bhit', i: bot.id, dmg: dmg, hs: hs ? 1 : 0 });
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
    /* ✅ v0.5.5: зоны спавна — из определения карты */
    var zn = (mapDef(curMapId) || {}).zone || { x0: -5.5, x1: 5.5, zB0: 15, zB1: 21, zR0: -21, zR1: -15 };
    ctx.fillStyle = 'rgba(77,163,255,.25)';
    ctx.fillRect(Math.min(toX(zn.x0), toX(zn.x1)), Math.min(toZ(zn.zB0), toZ(zn.zB1)),
      Math.abs(toX(zn.x1) - toX(zn.x0)), Math.abs(toZ(zn.zB1) - toZ(zn.zB0)));
    ctx.fillStyle = 'rgba(255,90,60,.25)';
    ctx.fillRect(Math.min(toX(zn.x0), toX(zn.x1)), Math.min(toZ(zn.zR0), toZ(zn.zR1)),
      Math.abs(toX(zn.x1) - toX(zn.x0)), Math.abs(toZ(zn.zR1) - toZ(zn.zR0)));
    /* ✅ v0.5.0: боты на карте цветом команды */
    for (var key in views) {
      var v = views[key];
      if (v.dead || v.st === 5) continue;
      ctx.fillStyle = viewInfo[key] && viewInfo[key].team === 'red' ? '#ff5a3c' : '#4da3ff';
      ctx.beginPath();
      ctx.arc(toX(v.pos.x), toZ(v.pos.z), 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ============================================================
     СБОРКА / ТИК
     ============================================================ */
  var lastScene = null;

  /* ✅ v0.5.5: снос ВСЕЙ геометрии карты (группа + геометрии;
     материалы общие — не диспоузим, текстуры в arena-tex тоже) */
  function disposeWorldGroup() {
    if (!worldGroup) return;
    try {
      worldGroup.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material.userData && o.material.userData.own) o.material.dispose();
      });
      if (lastScene) lastScene.remove(worldGroup);
    } catch (eD) {}
    worldGroup = null;
  }

  /** ✅ v0.5.5: полный снос (без сброса сетевых опций) — для смены карты */
  function hardReset() {
    for (var key in views) views[key].dispose();
    views = {};
    viewInfo = {};
    localSim.length = 0;
    disposeWorldGroup();
    solids.length = 0;
    worldBoxes.length = 0;
    nodes.length = 0;
    edges.length = 0;
    fxTracers.length = 0;
    world.banners = []; world.cones = []; world.dust = null;
    built = false;
  }

  /** ✅ v0.5.5: 'bmap' — сменить карту: снос + пересборка на месте */
  function feedMap(id) {
    if (!window.BrixMapData || !window.BrixMapData.MAPS[id]) return;
    if (!built) { pendingMap = id; return; }
    if (id === curMapId) return;
    console.log('[BrixArena] ротация карт: ' + curMapId + ' → ' + id);
    var sc = lastScene;
    hardReset();
    build(sc, id);
    if (opts) console.log('[BrixArena] новая карта готова: ' + (mapDef(id) || {}).name);
  }

  /** ✅ v0.4.66: СБРОС при выходе из мира — иначе при повторном входе
      арена/боты остаются в ВЫБРОШЕННОЙ старой сцене и становятся
      невидимыми (главная причина «невидимых ботов») */
  function reset() {
    if (!built) return;
    try {
      for (var key in views) views[key].dispose();
    } catch (eR) {}
    views = {};
    viewInfo = {};
    localSim.length = 0;
    disposeWorldGroup();                    // ✅ v0.5.5: вся геометрия карты в группе
    solids.length = 0;
    worldBoxes.length = 0;
    nodes.length = 0;
    edges.length = 0;
    world.banners = []; world.cones = []; world.dust = null;
    built = false;
    feedMode = false;
    killCount = 0;
    scores = { blue: 0, red: 0 };
    opts = null;
    lastScene = null;
    console.log('[BrixArena] локация сброшена (мир выгружен)');
  }

  function build(scene, mapId) {
    if (built) return;
    /* ✅ v0.5.5: карта из welcome (feedMap до постройки) или явная */
    if (pendingMap && (!mapId || mapId === pendingMap)) { mapId = pendingMap; pendingMap = null; }
    applyMap(mapId || curMapId || 'sektor9');
    lastScene = scene;
    opts = { scene: scene, camera: null, getFeet: null, isDead: null,
      onPlayerHit: null, getPlayerSpeed: null, addTracer: null,
      onScore: null, onWin: null, myTeam: MY_TEAM };
    window.BrixArenaTex.generate();
    TEX = window.BrixArenaTex.TEX;
    MAT = window.BrixArenaTex.MAT;
    /* ✅ v0.5.5: таблица материал → тип поверхности (цвет пыли BrixFx) */
    TAG_OF = new Map();
    if (MAT.crate) TAG_OF.set(MAT.crate, 'wood');
    if (MAT.metal) TAG_OF.set(MAT.metal, 'metal');
    if (MAT.darkSteel) TAG_OF.set(MAT.darkSteel, 'metal');
    if (MAT.treadRoof) TAG_OF.set(MAT.treadRoof, 'metal');
    if (MAT.wall) TAG_OF.set(MAT.wall, 'concrete');
    if (MAT.wallSide) TAG_OF.set(MAT.wallSide, 'concrete');
    if (MAT.concreteSmall) TAG_OF.set(MAT.concreteSmall, 'concrete');
    if (MAT.brick) TAG_OF.set(MAT.brick, 'concrete');
    if (MAT.platSide) TAG_OF.set(MAT.platSide, 'concrete');
    if (MAT.tread) TAG_OF.set(MAT.tread, 'metal');
    if (MAT.treadStep) TAG_OF.set(MAT.treadStep, 'metal');
    if (MAT.hazard) TAG_OF.set(MAT.hazard, 'concrete');
    worldGroup = new THREE.Group();
    scene.add(worldGroup);
    buildWorld(scene);
    rebuildWorldBoxes();
    buildGraph();
    /* ✅ v0.5.0: ресурсы ботов (GLB учёного, красная текстура, АК) */
    if (window.BrixBotRig) BrixBotRig.preload();
    built = true;
    /* ✅ v0.5.0: боты из welcome приехали ДО постройки арены —
       применяем сейчас */
    if (pendingFeed) { var pf = pendingFeed; pendingFeed = null; feedBots(pf); }
    console.log('[BrixArena] «' + (mapDef(curMapId) || {}).name + '»: солидов ' +
      solids.length + ', узлов ' + nodes.length + ', ботов ' + BOTS_TOTAL);
  }

  function startBots(o) {
    opts.camera = o.camera;
    opts.getFeet = o.getFeet;
    opts.isDead = o.isDead;
    opts.onPlayerHit = o.onPlayerHit;
    opts.getPlayerSpeed = o.getPlayerSpeed;
    opts.addTracer = o.addTracer || null;
    opts.onScore = o.onScore || null;
    opts.onWin = o.onWin || null;
    opts.localSim = !!o.localSim;
    if (window.BrixBotRig) {
      BrixBotRig.preload().then(function () {
        if (opts && opts.localSim && !localSim.length && !feedMode) startLocalSim();
      });
    } else if (o.localSim) startLocalSim();
    console.log('[BrixArena] боты: режим ' + (opts.localSim ? 'ЛОКАЛЬНЫЙ сим' : 'фид сервера'));
  }

  function tick(dt, camera) {
    if (!built) return;
    opts.camera = camera;
    if (opts.localSim && !feedMode && localSim.length) localTick(dt);
    /* ✅ v0.5.0: фид сервера отвалился (старый сервер/обрыв) — поднимаем
       локальный сим, чтобы арена не осталась пустой. Фид-вью убираем,
       чтобы не дублировались с симом. Порог 15 с: слабые машины рендерят
       кадры по несколько секунд (SwiftShader) — не путаем с обрывом */
    if (!opts.localSim && feedMode && performance.now() / 1000 - feedT > 15 &&
        window.BrixBotRig && BrixBotRig.RES.ready) {
      console.log('[BrixArena] фид ботов пропал — включаю локальный сим');
      for (var fk in views) removeView(fk);
      viewInfo = {};
      opts.localSim = true;
      startLocalSim();
    }
    for (var key in views) {
      var v = views[key];
      v.setCamera(camera);
      v.tick(dt);
    }
    if (window.BrixBotRig) BrixBotRig.tickFlash(dt);
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
    /* ✅ v0.5.0: фид ботов от сервера + счёт команд */
    feedBots: feedBots,
    /* ✅ v0.5.7: доступ к вью бота (тесты/камера смерти) */
    getView: function (i) { return views[i]; },
    feedShot: feedShot,
    feedDeath: feedDeath,
    feedSpawn: feedSpawn,
    feedScore: feedScore,
    feedWin: feedWin,
    /* ✅ v0.5.5: ротация карт + текущая карта + тип поверхности */
    feedMap: feedMap,
    getMapId: function () { return curMapId; },
    getMapName: function () { return (mapDef(curMapId) || {}).name || ''; },
    solidAt: solidAt,
    getScores: function () { return { blue: scores.blue, red: scores.red, limit: KILL_LIMIT }; },
    isFeedMode: function () { return feedMode; },
    getBots: function () { return views; },
    isBuilt: function () { return built; },
    getKillCount: function () { return killCount; },
    boxes: function () { return worldBoxes; },
    BOTS_TOTAL: BOTS_TOTAL,
    AY: AY
  };
})();
