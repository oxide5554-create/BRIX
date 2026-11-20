// ============================================================
//  brix • js/game/building.js
//  ✅ v0.4.7 СТРОИТЕЛЬСТВО (как в Rust: план строителя)
//
//  ✅ v0.4.10 ДВЕРИ И ОКНА (6 деталей в меню Z):
//  - ОКНО (wi) — стена с проёмом: сквозь неё видно, пуля пролетает,
//    а игрок перелазит по ПРЫЖКУ В УПОР (скриптовая анимация);
//  - ДВЕРНОЙ ПРОЁМ (dw) — стена с проходом, отверстие под дверь;
//  - ДВЕРЬ (dr) — ставится ТОЛЬКО в дверной проём (наведи и ЛКМ).
//    Открывается/закрывается на F с анимацией; закрытая — не пускает.
//    Сразу с КОДОВЫМ ЗАМКОМ (как в Rust): зелёная лампа — кода нет,
//    красная — есть. Владелец (BRIX-ID) задаёт/меняет код на F,
//    чужой вводит его на F; кто ввёл верно — больше не спрашивается,
//    пока владелец не сменит код. Всё живёт на сервере: код, открыт/
//    закрыт, список «кто разгадал» — в world-objs.json, как у бочек;
//  - ПУЛЯ: стрельба теперь проверяет постройки (bulletBlock) — через
//    стену/дверь/потолок не летит, через проём окна/двери — летит.
//
//  - ПРЕДМЕТ «План строителя» теперь В ИНВЕНТАРЕ (не в хотбаре, хотбар 6
//    слотов): открой инвентарь (E), КЛИКНИ по плану — он в руках (см.
//    firstperson.js). Z открывает меню ТОЛЬКО с планом в руках.
//  - МЕНЮ — радиальное колесо как в референсе: 3 детали по кругу,
//    в центре — название и описание выбранной. Выбор движением мыши
//    (работает под pointer lock: направление от центра экрана),
//    ЛКМ — выбрать и закрыть, Z/Esc — закрыть.
//  - ДЕТАЛИ (3): ФУНДАМЕНТ — палуба 3×3 м на 4 ТОЛСТЫХ ногах; палуба
//    СЛЕДУЕТ РЕЛЬЕФУ (ноги разной длины, верх по самой высокой точке
//    клетки); рядом с фундаментом МАГНИТИТСЯ К НЕМУ ПО ВЫСОТЕ.
//    СТЕНА — ставится на ОДИН ИЗ 4 КРАЁВ фундамента (магнит к краю).
//    ПОТОЛОК — накрывает клетку, у которой ЕСТЬ СТЕНА. Стена без
//    фундамента и потолок без стены НЕ ставятся.
//  - ТЕКСТУРА дерева МНОГОСЛОЙНАЯ (canvas): базовый градиент →
//    волокна → планки с тёмными стыками → сучки → гвозди → грязь →
//    попиксельный шум. У палубы/стены/потолка/ног свои варианты.
//  - КОЛЛИЗИИ (✅ улучшены в v0.4.7): стены — AABB-коллайдеры со
//    подгонкой концов на 4 см (углы соседних стен больше не «липнут»);
//    ПОТОЛКИ — свои AABB (плита сплошная: сверху ходьба, снизу
//    прыжком не пролетаешь); ПАЛУБЫ — бок сплошной, сверху ходьба.
//    Движение игрока — раздельно по осям X и Z (см. controls.js):
//    между соседними фундаментами бег плавный, стены не «дёргают».
//  - СИНХРОНИЗАЦИЯ: постройки АВТОРИТЕТНЫ У СЕРВЕРА (server.js):
//    заявка bplace → сервер проверяет правила (фундамент под стеной,
//    стена под потолком, дедуп клетки/края) → bnew ВСЕМ. Снапшот
//    идёт в welcome (objs.bd) — новые игроки сразу видят дом.
//    Хранение — world-objs.json: дом ПЕРЕЖИВАЕТ перезапуск сервера
//    И живёт в памяти сервера, даже когда на сервере 0 игроков.
//    Без сервера (вкладки/соло): BroadcastChannel + localStorage.
// ============================================================
window.BrixBuilding = (function () {
  'use strict';

  /* ---------- размеры (м) ---------- */
  var CELL = 3;          // клетка сетки (фундамент 3×3)
  var DECK_T = 0.24;     // толщина палубы
  var DECK_LIFT = 1.0;   // верх палубы над самой высокой точкой рельефа клетки
  var POST_R = 0.17;     // «толстая палка»-нога: радиус 17 см
  var WALL_H = 3;        // высота стены
  var WALL_T = 0.26;     // толщина стены
  var CEIL_T = 0.24;     // толщина потолка
  var STEP_UP = 0.55;    // ступенька, на которую игрок забирается при ходьбе
  var MAX_PLACE_DIST = 9;// дальше — призрак скрыт
  var PLACE_CD = 0.25;   // между установками
  var WATER_LEVEL = 2.2;
  /* ✅ v0.4.10 размеры окон/дверей (относительно НИЗА стены, м) */
  var EYE = 1.7;         // глаза над ногами (как в controls.js)
  var WI_Y0 = 0.95;      // низ окна
  var WI_Y1 = 2.10;      // верх окна
  var WI_HALF = 0.45;    // половина ширины окна
  var DW_HALF = 0.57;    // половина ширины дверного проёма
  var DW_H = 2.2;        // высота проёма
  var DOOR_OPEN_ANGLE = -1.9; // угол открытой двери (рад)

  /* ---------- детали (✅ v0.4.10: 6 штук) ---------- */
  var PIECES = [
    { id: 'f', name: 'Фундамент', nameEn: 'Foundation',
      desc: 'Палуба на четырёх толстых ногах. Следует рельефу, магнитится к соседнему',
      descEn: 'A deck on four thick posts. Follows terrain, snaps to a neighbour' },
    { id: 'w', name: 'Стена', nameEn: 'Wall',
      desc: 'Ставится на один из четырёх краёв фундамента',
      descEn: 'Snaps to one of the four foundation edges' },
    { id: 'wi', name: 'Окно', nameEn: 'Window',
      desc: 'Стена с окном: видно и стрелять можно сквозь. Прыжок в упор — перелаз',
      descEn: 'Wall with a window: see through, shoot through, jump to vault' },
    { id: 'dw', name: 'Дверной проём', nameEn: 'Doorway',
      desc: 'Стена с проходом. В проём потом ставится дверь',
      descEn: 'Wall with a passage. A door goes here later' },
    { id: 'dr', name: 'Дверь', nameEn: 'Door',
      desc: 'Наведи на дверной проём и ставь. F — открыть/закрыть, замок с кодом',
      descEn: 'Aim at a doorway and place. F to open/close, coded lock' },
    { id: 'c', name: 'Потолок', nameEn: 'Ceiling',
      desc: 'Накрывает клетку, у которой есть стена',
      descEn: 'Covers a cell that has a wall' },
    /* ✅ v0.4.22 сундук-хранилище: содержимое живёт на сервере */
    { id: 'ch', name: 'Сундук', nameEn: 'Chest',
      desc: 'Хранилище: положи ресурсы — они сохранятся на сервере даже после выхода. Ставится на землю и на фундамент. F — открыть',
      descEn: 'Storage: put resources in — the server keeps them after you leave. Place on ground or foundation. F to open' }
  ];
  // углы деталей на колесе (экранные, 0° = вправо): 7 сегментов по кругу
  var PIECE_ANGLES = [0, 51, 103, 154, 206, 257, 309];
  var EDGE_TY = { w: 1, wi: 1, dw: 1, dr: 1 };   // краевые детали (на край фундамента)

  function L(ru, en) {
    try { return (window.BrixState && BrixState.data.lang === 'en') ? en : ru; }
    catch (e) { return ru; }
  }
  function key(gx, gz) { return gx + ',' + gz; }
  /** канонизация края — СИМВОЛ В СИМВОЛ как в server.js (v0.4.6) */
  function canonicalEdge(gx, gz, e) {
    if (e === 2) return { gx: gx, gz: gz + 1, e: 0 };
    if (e === 1) return { gx: gx + 1, gz: gz, e: 3 };
    return { gx: gx, gz: gz, e: (e === 3 ? 3 : 0) };
  }

  /* ============================================================
     МНОГОСЛОЙНАЯ ДЕРЕВЯННАЯ ТЕКСТУРА (canvas, 512×512):
     1) база-градиент  2) планки с разной яркостью  3) волокна
     4) тёмные стыки + светлая кромка  5) сучки  6) гвозди
     7) грязь/потёртости  8) попиксельный шум
     ============================================================ */
  function rgb255(r, g, b, k) {
    k = k === undefined ? 1 : k;
    return 'rgb(' + Math.min(255, r * k | 0) + ',' + Math.min(255, g * k | 0) + ',' + Math.min(255, b * k | 0) + ')';
  }
  function woodCanvas(opts) {
    var S = 512;
    var c = document.createElement('canvas');
    c.width = c.height = S;
    var x = c.getContext('2d');
    var planks = opts.planks || 8;
    var vertical = !!opts.vertical;
    var base = opts.tone || [150, 108, 62];   // тёплое дерево Brixland
    var ph = S / planks;

    // 1) база: диагональный градиент (объём, не плоский цвет)
    var gr = x.createLinearGradient(0, 0, vertical ? S : S * 0.4, vertical ? S * 0.4 : S);
    gr.addColorStop(0, rgb255(base[0], base[1], base[2], 1.1));
    gr.addColorStop(0.55, rgb255(base[0], base[1], base[2], 1.0));
    gr.addColorStop(1, rgb255(base[0], base[1], base[2], 0.82));
    x.fillStyle = gr;
    x.fillRect(0, 0, S, S);

    // 2) планки: у каждой своя яркость
    for (var p = 0; p < planks; p++) {
      var k = 0.88 + Math.random() * 0.26;
      x.fillStyle = rgb255(base[0], base[1], base[2], k);
      if (vertical) x.fillRect(p * ph, 0, ph, S); else x.fillRect(0, p * ph, S, ph);
    }

    // 3) волокна: тёмные и светлые волнистые линии внутри планок
    for (var p2 = 0; p2 < planks; p2++) {
      var lines = 12 + (Math.random() * 9 | 0);
      for (var i = 0; i < lines; i++) {
        var dark = Math.random() < 0.72;
        x.strokeStyle = dark ? 'rgba(58,38,20,' + (0.05 + Math.random() * 0.13).toFixed(3) + ')'
                             : 'rgba(235,208,160,' + (0.04 + Math.random() * 0.09).toFixed(3) + ')';
        x.lineWidth = 0.8 + Math.random() * 1.7;
        x.beginPath();
        var off = (vertical ? p2 * ph : 0) + Math.random() * ph;
        if (vertical) {
          x.moveTo(off, 0);
          for (var s = 1; s <= 8; s++) x.lineTo(off + Math.sin(s * 1.15 + p2 * 2.4) * 2.4, s * S / 8);
        } else {
          x.moveTo(0, p2 * ph + Math.random() * ph);
          for (var s2 = 1; s2 <= 8; s2++) x.lineTo(s2 * S / 8, p2 * ph + Math.random() * ph * 0.9 + ph * 0.05 + Math.sin(s2 * 1.15 + p2 * 2.4) * 2.4);
        }
        x.stroke();
      }
    }

    // 4) стыки планок: тёмный зазор + светлая кромка снизу (рельеф планки)
    for (var p3 = 0; p3 <= planks; p3++) {
      var y3 = p3 * ph;
      x.fillStyle = 'rgba(28,18,9,0.8)';
      if (vertical) x.fillRect(y3 - 1, 0, 2.4, S); else x.fillRect(0, y3 - 1, S, 2.4);
      x.fillStyle = 'rgba(255,228,180,0.13)';
      if (vertical) x.fillRect(y3 + 1.6, 0, 1.2, S); else x.fillRect(0, y3 + 1.6, S, 1.2);
    }

    // 5) сучки: тёмные овалы с лучами
    var nKnots = 4 + (Math.random() * 5 | 0);
    for (var kk = 0; kk < nKnots; kk++) {
      var kx = Math.random() * S, ky = Math.random() * S, kr = 3 + Math.random() * 7;
      var rg = x.createRadialGradient(kx, ky, 0.5, kx, ky, kr);
      rg.addColorStop(0, 'rgba(50,32,16,0.85)');
      rg.addColorStop(0.55, 'rgba(72,48,24,0.45)');
      rg.addColorStop(1, 'rgba(72,48,24,0)');
      x.fillStyle = rg;
      x.beginPath(); x.ellipse(kx, ky, kr, kr * 0.62, Math.random() * Math.PI, 0, Math.PI * 2); x.fill();
    }

    // 6) гвозди: по краям планок, металл с бликом
    for (var p4 = 1; p4 < planks; p4++) {
      for (var nn = 0; nn < 3; nn++) {
        var nx = 40 + Math.random() * (S - 80), ny = p4 * ph + 6;
        var ng = x.createRadialGradient(nx - 1, ny - 1, 0.3, nx, ny, 3.2);
        ng.addColorStop(0, 'rgba(220,220,215,0.95)');
        ng.addColorStop(0.5, 'rgba(110,110,105,0.8)');
        ng.addColorStop(1, 'rgba(40,40,38,0.55)');
        x.fillStyle = ng;
        x.beginPath(); x.arc(nx, ny, 3, 0, Math.PI * 2); x.fill();
      }
    }

    // 7) грязь/потёртости: мягкие тёмные и светлые пятна
    for (var d = 0; d < 26; d++) {
      var dx2 = Math.random() * S, dy2 = Math.random() * S, dr = 8 + Math.random() * 36;
      var dg = x.createRadialGradient(dx2, dy2, 1, dx2, dy2, dr);
      var dark2 = Math.random() < 0.6;
      dg.addColorStop(0, dark2 ? 'rgba(40,28,14,' + (0.05 + Math.random() * 0.09).toFixed(3) + ')'
                               : 'rgba(240,220,180,' + (0.04 + Math.random() * 0.07).toFixed(3) + ')');
      dg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = dg;
      x.beginPath(); x.arc(dx2, dy2, dr, 0, Math.PI * 2); x.fill();
    }

    // 8) попиксельный шум — иначе краска выглядит «пластиковой»
    var img = x.getImageData(0, 0, S, S), dd = img.data;
    for (var ii = 0; ii < dd.length; ii += 4) {
      var n2 = (Math.random() * 2 - 1) * 9;
      dd[ii] += n2; dd[ii + 1] += n2; dd[ii + 2] += n2;
    }
    x.putImageData(img, 0, 0);
    return c;
  }

  function canvasTex(c) {
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (THREE.SRGBColorSpace !== undefined) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  /* ---------- материалы/геометрии (общие, создаются в init) ---------- */
  var _mat = null, _geo = null, _disposables = [];

  function buildMaterials() {
    var deckTex = canvasTex(woodCanvas({ planks: 7, tone: [158, 114, 66] }));
    var wallTex = canvasTex(woodCanvas({ planks: 6, vertical: true, tone: [143, 102, 58] }));
    var ceilTex = canvasTex(woodCanvas({ planks: 8, tone: [128, 96, 58] }));
    var postTex = canvasTex(woodCanvas({ planks: 3, vertical: true, tone: [110, 78, 44] }));
    var leafTex = canvasTex(woodCanvas({ planks: 5, vertical: true, tone: [124, 89, 50] }));
    var chestTex = canvasTex(woodCanvas({ planks: 5, tone: [121, 86, 50] }));   // ✅ v0.4.22
    _mat = {
      deck: new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.88, metalness: 0.02 }),
      wall: new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9, metalness: 0.02 }),
      ceil: new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.92, metalness: 0.02 }),
      post: new THREE.MeshStandardMaterial({ map: postTex, roughness: 0.95, metalness: 0.0 }),
      beam: new THREE.MeshStandardMaterial({ map: postTex, roughness: 0.95, metalness: 0.0,
        color: 0xb9a288 }),
      /* ✅ v0.4.10: дверь, металл замка и лампочки замка */
      leaf: new THREE.MeshStandardMaterial({ map: leafTex, roughness: 0.85, metalness: 0.02 }),
      lock: new THREE.MeshStandardMaterial({ color: 0x45464b, roughness: 0.45, metalness: 0.65 }),
      lampOn: new THREE.MeshBasicMaterial({ color: 0x46d95c }),   // зелёная — кода нет
      lampOff: new THREE.MeshBasicMaterial({ color: 0xe23c2a }),  // красная — код есть
      /* ✅ v0.4.22: сундук — доски, тёмные накладки, железо, латунь */
      chestWood: new THREE.MeshStandardMaterial({ map: chestTex, roughness: 0.85, metalness: 0.02 }),
      chestDark: new THREE.MeshStandardMaterial({ color: 0x392c1c, roughness: 0.92, metalness: 0.02 }),
      chestIron: new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5, metalness: 0.6 }),
      chestBrass: new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.42, metalness: 0.65 })
    };
    _disposables.push(deckTex, wallTex, ceilTex, postTex, leafTex, chestTex);
    _geo = {
      deck: new THREE.BoxGeometry(CELL, DECK_T, CELL),
      wall: new THREE.BoxGeometry(CELL, WALL_H, WALL_T),
      wbeam: new THREE.BoxGeometry(CELL + 0.05, 0.16, WALL_T + 0.06),
      ceil: new THREE.BoxGeometry(CELL, CEIL_T, CELL),
      joist: new THREE.BoxGeometry(CELL, 0.15, 0.2),
      dbeamX: new THREE.BoxGeometry(CELL + 0.1, 0.1, 0.16),
      dbeamZ: new THREE.BoxGeometry(0.16, 0.1, CELL + 0.1),
      post: new THREE.CylinderGeometry(POST_R, POST_R * 1.18, 1, 10),
      /* ✅ v0.4.10: окно (4 части стены + подоконник/перемычка) */
      wiBot: new THREE.BoxGeometry(CELL, WI_Y0, WALL_T),
      wiTop: new THREE.BoxGeometry(CELL, WALL_H - WI_Y1, WALL_T),
      wiSide: new THREE.BoxGeometry(CELL / 2 - WI_HALF, WI_Y1 - WI_Y0, WALL_T),
      wiSill: new THREE.BoxGeometry(WI_HALF * 2 + 0.16, 0.1, WALL_T + 0.10),
      wiLintel: new THREE.BoxGeometry(WI_HALF * 2 + 0.16, 0.1, WALL_T + 0.10),
      /* ✅ v0.4.10: дверной проём (2 столба + перемычка + наличники) */
      dwSide: new THREE.BoxGeometry(CELL / 2 - DW_HALF, WALL_H, WALL_T),
      dwTop: new THREE.BoxGeometry(DW_HALF * 2, WALL_H - DW_H, WALL_T),
      dwTrimV: new THREE.BoxGeometry(0.12, DW_H + 0.06, WALL_T + 0.09),
      dwTrimH: new THREE.BoxGeometry(DW_HALF * 2 + 0.20, 0.12, WALL_T + 0.09),
      /* ✅ v0.4.10: дверь + кодовый замок */
      doorLeaf: new THREE.BoxGeometry(DW_HALF * 2 - 0.04, DW_H - 0.04, 0.09),
      lockBox: new THREE.BoxGeometry(0.3, 0.4, 0.12),
      lockDot: new THREE.BoxGeometry(0.1, 0.1, 0.03)
    };
    for (var k in _geo) _disposables.push(_geo[k]);
  }

  /* ============================================================
     СОСТОЯНИЕ
     ============================================================ */
  var _scene = null, _camera = null, _terrainMesh = null, _groundY = null,
      _controls = null, _getPos = null, _quality = 'medium';
  var inited = false;

  var cellRecs = new Map();   // 'gx,gz' -> {f:{rec,group,deck}|null, c:{rec,group}|null}
  var edgeRecs = new Map();   // 'gx,gz,e' (канонический) -> {rec, group}
  var fTop = new Map();       // 'gx,gz' -> высота палубы (магнит + серверная проверка)
  var rayTargets = [];        // палубы и стены — для луча призрака
  var wallBoxes = [];         // AABB стен (мутируем на месте; ссылку держит controls)

  /* ============================================================
     ✅ v0.4.31 ЛОМАНИЕ ПОСТРОЕК: у каждой детали есть ХП.
       НОВЫЕ ХП: фундамент — 350, остальные постройки (стена/окно/
       проём/дверь/потолок) — 300, сундук — 25 (как был).
     Урон ТОЛЬКО топорами/кирками, «1 хп за N ударов» (дробный):
       каменный топор — 0.2 хп/удар (5 ударов = 1 хп)
       каменная кирка — 0.25 хп/удар (4 удара = 1 хп)
       железная кирка — 0.5 хп/удар (2 удара = 1 хп)
       железный топор — 1/3 хп/удар (3 удара = 1 хп)
     В серверном режиме авторитет — СЕРВЕР: он шлёт 'bhp' (остаток) и
     'brem' (сломал, удаляется у ВСЕХ). В соло/вкладках — localHit.
     hitGroups — группы для луча удара и луча ХП-бара, pieceById —
     id -> запись (ХП-бар прицела, звук, чистка), pieceHp — остаток хп
     ============================================================ */
  var hitGroups = [];         // THREE.Group каждой живой детали
  var pieceById = new Map();  // id -> entry { rec, group, ... }
  var pieceHp = new Map();    // id -> остаток хп (сервер шлёт 'bhp', соло — localHit)
  var BUILD_MAX_HP = { f: 350, w: 300, wi: 300, dw: 300, c: 300, dr: 300, ch: 25 };
  /* ✅ v0.4.40 БУЛАВА по постройкам: 2 хп за удар (просьба игрока) —
     тот же урон и на сервере (server.js BUILD_DMG.mace)
     ✅ v0.4.41 С4 по постройкам: 400 хп ЗА ВЗРЫВ (каждая постройка в
     радиусе). Только СОЛО/вкладки: в серверном режиме урон считает
     server.js в case 'c4boom' — туда BUILD_DMG.c4 НЕ добавляем, чтобы
     подделанный bhit не ломал стены одним ударом */
  var BUILD_DMG = { axe: 0.2, pickaxe: 0.25, ironPickaxe: 0.5, ironAxe: 1 / 3, mace: 2,
    c4: 400 };
  function buildMaxHp(ty) { return BUILD_MAX_HP[ty] || 300; }

  var current = 'f';          // выбранная деталь
  var placeCd = 0;
  var localSeq = 0;
  var pendingPlace = {};      // tid -> {rec, timer} (ожидание ответа сервера)
  var myName = 'Строитель';

  /* ---------- публичное: пол под ногами (фундамент/потолок) ---------- */
  function floorAt(x, z, feetY) {
    var best = null;
    cellRecs.forEach(function (cell) {
      if (cell.f) {
        var cx = cell.f.rec.gx * CELL, cz = cell.f.rec.gz * CELL;
        if (Math.abs(x - cx) <= CELL / 2 && Math.abs(z - cz) <= CELL / 2 &&
            cell.f.rec.top <= feetY + STEP_UP && (best === null || cell.f.rec.top > best)) {
          best = cell.f.rec.top;
        }
      }
      if (cell.c) {
        var cx2 = cell.c.rec.gx * CELL, cz2 = cell.c.rec.gz * CELL;
        var ct = cell.c.rec.top + CEIL_T;
        if (Math.abs(x - cx2) <= CELL / 2 && Math.abs(z - cz2) <= CELL / 2 &&
            ct <= feetY + STEP_UP && (best === null || ct > best)) {
          best = ct;
        }
      }
    });
    return best;
  }

  /* ============================================================
     СБОРКА МЕШЕЙ
     ============================================================ */
  function shadow(o) {
    o.castShadow = _quality !== 'low';
    o.receiveShadow = true;
    return o;
  }

  /** фундамент: палуба + рамка + 4 ТОЛСТЫЕ НОГИ (длина — по рельефу угла) */
  function buildFoundationGroup(rec) {
    var g = new THREE.Group();
    var deck = shadow(new THREE.Mesh(_geo.deck, _mat.deck));
    deck.position.y = -DECK_T / 2;
    deck.userData.bcell = key(rec.gx, rec.gz);
    g.add(deck);

    // рамка по периметру — палуба не «плоская доска»
    var b1 = shadow(new THREE.Mesh(_geo.dbeamX, _mat.beam)); b1.position.set(0, -0.06, CELL / 2 - 0.08); g.add(b1);
    var b2 = shadow(new THREE.Mesh(_geo.dbeamX, _mat.beam)); b2.position.set(0, -0.06, -(CELL / 2 - 0.08)); g.add(b2);
    var b3 = shadow(new THREE.Mesh(_geo.dbeamZ, _mat.beam)); b3.position.set(CELL / 2 - 0.08, -0.06, 0); g.add(b3);
    var b4 = shadow(new THREE.Mesh(_geo.dbeamZ, _mat.beam)); b4.position.set(-(CELL / 2 - 0.08), -0.06, 0); g.add(b4);

    // 4 толстые ноги: нижний конец зарыт в землю на 0.45 м ниже рельефа угла
    var offs = [[-1.26, -1.26], [1.26, -1.26], [1.26, 1.26], [-1.26, 1.26]];
    for (var i = 0; i < offs.length; i++) {
      var th = _groundY(rec.gx * CELL + offs[i][0], rec.gz * CELL + offs[i][1]);
      var len = Math.max(0.2, rec.top - (th - 0.45));
      var post = shadow(new THREE.Mesh(_geo.post, _mat.post));
      post.scale.y = len;
      post.position.set(offs[i][0], -len / 2 + 0.02, offs[i][1]);
      g.add(post);
    }
    g.position.set(rec.gx * CELL, rec.top, rec.gz * CELL);
    return { group: g, deck: deck };
  }

  /** общий низ стены/окна/проёма/двери: позиция и поворот группы по краю.
      Локальный ноль — НИЗ стены, центр по длине */
  function placeEdge(g, rec) {
    var e = rec.e;
    var X0 = rec.gx * CELL, Z0 = rec.gz * CELL, half = CELL / 2;
    if (e === 0) { g.position.set(X0, rec.top, Z0 - half); }
    else if (e === 2) { g.position.set(X0, rec.top, Z0 + half); }
    else if (e === 1) { g.position.set(X0 + half, rec.top, Z0); g.rotation.y = Math.PI / 2; }
    else { g.position.set(X0 - half, rec.top, Z0); g.rotation.y = Math.PI / 2; }
  }

  /** стена: плита + горизонтальная балка */
  function buildWallGroup(rec) {
    var g = new THREE.Group();
    var slab = shadow(new THREE.Mesh(_geo.wall, _mat.wall));
    slab.position.y = WALL_H / 2;
    g.add(slab);
    var beam = shadow(new THREE.Mesh(_geo.wbeam, _mat.beam));
    beam.position.y = WALL_H * 0.48;
    g.add(beam);
    placeEdge(g, rec);
    return { group: g, slab: slab };
  }

  /** ✅ v0.4.10 ОКНО: стена с проёмом (низ/верх/бока) + подоконник и
      перемычка. Сквозь проём видно и летит пуля; игрок перелазит прыжком */
  function buildWindowGroup(rec) {
    var g = new THREE.Group();
    var parts = [];
    function part(geo, x, y, mat) {
      var m = shadow(new THREE.Mesh(geo, mat || _mat.wall));
      m.position.set(x, y, 0);
      m.userData.bwin = rec.id;
      g.add(m); parts.push(m);
      return m;
    }
    part(_geo.wiBot, 0, WI_Y0 / 2);                       // под окном
    part(_geo.wiTop, 0, WI_Y1 + (WALL_H - WI_Y1) / 2);    // над окном
    part(_geo.wiSide, -(CELL / 2 + WI_HALF) / 2, (WI_Y0 + WI_Y1) / 2);   // слева
    part(_geo.wiSide, (CELL / 2 + WI_HALF) / 2, (WI_Y0 + WI_Y1) / 2);    // справа
    part(_geo.wiSill, 0, WI_Y0, _mat.beam);               // подоконник
    part(_geo.wiLintel, 0, WI_Y1, _mat.beam);             // перемычка
    placeEdge(g, rec);
    return { group: g, slab: parts[0], solids: parts.slice(1) };
  }

  /** ✅ v0.4.10 ДВЕРНОЙ ПРОЁМ: 2 столба + перемычка + наличники.
      Проём 1.14×2.2 м — свободно проходит игрок, позже — дверь */
  function buildDoorwayGroup(rec) {
    var g = new THREE.Group();
    var parts = [];
    function part(geo, x, y, mat) {
      var m = shadow(new THREE.Mesh(geo, mat || _mat.wall));
      m.position.set(x, y, 0);
      g.add(m); parts.push(m);
      return m;
    }
    part(_geo.dwSide, -(CELL / 2 + DW_HALF) / 2, WALL_H / 2);   // столб слева
    part(_geo.dwSide, (CELL / 2 + DW_HALF) / 2, WALL_H / 2);    // столб справа
    part(_geo.dwTop, 0, DW_H + (WALL_H - DW_H) / 2);            // перемычка
    part(_geo.dwTrimV, -(DW_HALF + 0.06), DW_H / 2, _mat.beam); // наличник слева
    part(_geo.dwTrimV, DW_HALF + 0.06, DW_H / 2, _mat.beam);    // наличник справа
    part(_geo.dwTrimH, 0, DW_H + 0.06, _mat.beam);              // наличник сверху
    placeEdge(g, rec);
    return { group: g, slab: parts[0], solids: parts.slice(1) };
  }

  /** ✅ v0.4.12: НЕВИДИМЫЙ увеличенный хитбокс замка (кэшируется — один
      на все двери): попадание рядом с замком = «на замок». Размер —
      чуть больше самого замка, ЦЕНТР ПОЛОТНА НЕ ЗАХВАТЫВАЕТ:
      F у центра двери = открыть/закрыть, F у края (замок) = код */
  var _lockHitGeo = null, _lockHitMat = null;
  function lockHitMesh() {
    if (!_lockHitGeo) {
      _lockHitGeo = new THREE.BoxGeometry(0.34, 0.42, 0.3);
      _lockHitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0,
        depthWrite: false, depthTest: false });
      _disposables.push({ dispose: function () {
        if (_lockHitGeo) { _lockHitGeo.dispose(); _lockHitGeo = null; }
        if (_lockHitMat) { _lockHitMat.dispose(); _lockHitMat = null; }
      } });
    }
    return new THREE.Mesh(_lockHitGeo, _lockHitMat);
  }

  /** ✅ v0.4.10 ДВЕРЬ: рама (= проём) + полотно на петле + КОДОВЫЙ ЗАМК
      с лампочкой (зелёная — кода нет, красная — есть). Полотно вращается
      вокруг левой петли (leafPivot) — анимация открытия в tick() */
  function buildDoorGroup(rec) {
    var g = new THREE.Group();
    var parts = [];
    function part(geo, x, y, mat) {
      var m = shadow(new THREE.Mesh(geo, mat || _mat.wall));
      m.position.set(x, y, 0);
      m.userData.bid = rec.id;
      g.add(m); parts.push(m);
      return m;
    }
    part(_geo.dwSide, -(CELL / 2 + DW_HALF) / 2, WALL_H / 2);
    part(_geo.dwSide, (CELL / 2 + DW_HALF) / 2, WALL_H / 2);
    part(_geo.dwTop, 0, DW_H + (WALL_H - DW_H) / 2);
    part(_geo.dwTrimV, -(DW_HALF + 0.06), DW_H / 2, _mat.beam);
    part(_geo.dwTrimV, DW_HALF + 0.06, DW_H / 2, _mat.beam);
    part(_geo.dwTrimH, 0, DW_H + 0.06, _mat.beam);
    // полотно на петле (левый край проёма); вращается целиком при открытии
    var pivot = new THREE.Group();
    pivot.position.set(-DW_HALF + 0.02, 0, 0);
    var leaf = shadow(new THREE.Mesh(_geo.doorLeaf, _mat.leaf));
    leaf.position.set(DW_HALF - 0.02, DW_H / 2, 0);
    leaf.userData.bid = rec.id;
    pivot.add(leaf);
    // кодовый замок на полотне (у края открывания, торчит наружу)
    var lock = shadow(new THREE.Mesh(_geo.lockBox, _mat.lock));
    lock.position.set(DW_HALF - 0.16, 1.42, 0.1);
    lock.userData.bid = rec.id; lock.userData.block = 1;
    pivot.add(lock);
    /* ✅ fix 0.4.12 «НЕ ПОПАДАЮ ПО ЗАМКУ»: замок маленький — попасть лучом
       трудно. Добавляем НЕВИДИМЫЙ увеличенный хитбокс вокруг него:
       наведение рядом с замком = «на замок» (подсказка и F работают) */
    var lockHit = lockHitMesh();
    lockHit.position.set(DW_HALF - 0.22, 1.4, 0.14);
    lockHit.userData.bid = rec.id; lockHit.userData.block = 1;
    lockHit.renderOrder = -1;
    pivot.add(lockHit);
    var dot = new THREE.Mesh(_geo.lockDot, (rec.hc ? _mat.lampOff : _mat.lampOn));
    dot.position.set(DW_HALF - 0.16, 1.18, 0.17);
    dot.userData.bid = rec.id; dot.userData.bdot = 1;
    pivot.add(dot);
    pivot.rotation.y = rec.open ? DOOR_OPEN_ANGLE : 0;
    g.add(pivot);
    parts.push(leaf); parts.push(lock);
    placeEdge(g, rec);
    return { group: g, slab: parts[0], solids: parts.slice(1),
      leafPivot: pivot, leaf: leaf, lock: lock, dot: dot, lockHit: lockHit };
  }

  /** потолок: плита + 2 лага снизу (видны из комнаты). Ноль — НИЗ плиты */
  function buildCeilingGroup(rec) {
    var g = new THREE.Group();
    var slab = shadow(new THREE.Mesh(_geo.ceil, _mat.ceil));
    slab.position.y = CEIL_T / 2;
    g.add(slab);
    var j1 = shadow(new THREE.Mesh(_geo.joist, _mat.beam)); j1.position.set(0, -0.075, 0.75); g.add(j1);
    var j2 = shadow(new THREE.Mesh(_geo.joist, _mat.beam)); j2.position.set(0, -0.075, -0.75); g.add(j2);
    g.position.set(rec.gx * CELL, rec.top, rec.gz * CELL);
    return { group: g, slab: slab };
  }

  /* ============================================================
     ✅ v0.4.22 СУНДУК-ХРАНИЛИЩЕ — процедурная модель: корпус из
     досок с тёмными швами, угловые накладки, две железные полосы,
     петли, латунная щеколда. Крышка висит на ОСИ у ЗАДНЕЙ кромки
     (lidPivot) и откидывается назад при открытии (анимация в tick)
     ============================================================ */
  var _chestGeo = null;
  function chestGeo() {
    if (_chestGeo) return _chestGeo;
    _chestGeo = {
      base: new THREE.BoxGeometry(0.86, 0.42, 0.52),
      plinth: new THREE.BoxGeometry(0.92, 0.07, 0.58),
      trim: new THREE.BoxGeometry(0.06, 0.42, 0.56),
      gap: new THREE.BoxGeometry(0.015, 0.40, 0.012),
      band: new THREE.BoxGeometry(0.90, 0.07, 0.56),
      lid: new THREE.BoxGeometry(0.86, 0.10, 0.52),
      lidBand: new THREE.BoxGeometry(0.90, 0.10, 0.04),
      hinge: new THREE.BoxGeometry(0.10, 0.05, 0.06),
      latch: new THREE.BoxGeometry(0.09, 0.12, 0.05),
      hasp: new THREE.BoxGeometry(0.05, 0.09, 0.035)
    };
    _disposables.push({ dispose: function () {
      if (!_chestGeo) return;
      for (var k in _chestGeo) {
        if (_chestGeo[k] && _chestGeo[k].dispose) _chestGeo[k].dispose();
      }
      _chestGeo = null;
    } });
    return _chestGeo;
  }

  function buildChestGroup(rec) {
    var G = chestGeo();
    var g = new THREE.Group();
    var wood = _mat.chestWood, dark = _mat.chestDark,
        iron = _mat.chestIron, brass = _mat.chestBrass;
    function m(geo, mat, x, y, z, parent) {
      var mm = shadow(new THREE.Mesh(geo, mat));
      mm.position.set(x, y, z);
      mm.userData.bid = rec.id;
      (parent || g).add(mm);
      return mm;
    }
    /* корпус: поднижник + доски + тёмные швы + угловые накладки */
    m(G.plinth, dark, 0, 0.045, 0);
    m(G.base, wood, 0, 0.29, 0);
    m(G.gap, dark, -0.145, 0.29, 0.263);   // швы между досками (спереди)
    m(G.gap, dark, 0.145, 0.29, 0.263);
    m(G.gap, dark, -0.145, 0.29, -0.263);  // и сзади
    m(G.gap, dark, 0.145, 0.29, -0.263);
    m(G.trim, dark, -0.40, 0.29, 0);
    m(G.trim, dark, 0.40, 0.29, 0);
    /* железные полосы-обивки корпуса */
    m(G.band, iron, 0, 0.16, 0);
    m(G.band, iron, 0, 0.42, 0);
    /* петли на задней кромке */
    m(G.hinge, iron, -0.30, 0.50, -0.24);
    m(G.hinge, iron, 0.30, 0.50, -0.24);
    /* латунная щеколда на передней стенке */
    m(G.latch, brass, 0, 0.44, 0.272);
    /* крышка: группа с осью у задней верхней кромки корпуса */
    var lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.50, -0.26);
    var lid = m(G.lid, wood, 0, 0.05, 0.26, lidPivot);
    m(G.lidBand, iron, 0, 0.05, 0.09, lidPivot);
    m(G.lidBand, iron, 0, 0.05, 0.43, lidPivot);
    m(G.hasp, brass, 0, -0.03, 0.52, lidPivot);
    g.add(lidPivot);
    return { group: g, lidPivot: lidPivot, lid: lid };
  }

  /* ---------- реестр: применение/удаление записи ---------- */
  var solidMeshes = [];       // ✅ v0.4.10: доп. меши окон/дверей — для пуль
  var doorEntries = new Map(); // ✅ v0.4.10: id двери -> entry (анимация/луч F)

  function pushSolids(entry) {
    if (!entry.solids) return;
    for (var i = 0; i < entry.solids.length; i++) solidMeshes.push(entry.solids[i]);
  }

  function destroyEntry(entry) {
    if (!entry) return;
    if (entry.group && _scene) _scene.remove(entry.group);
    var ri = rayTargets.indexOf(entry.deck || entry.slab);
    if (ri >= 0) rayTargets.splice(ri, 1);
    // ✅ v0.4.10: доп. меши уходят из списка «для пуль»
    if (entry.solids) {
      for (var i = 0; i < entry.solids.length; i++) {
        var si = solidMeshes.indexOf(entry.solids[i]);
        if (si >= 0) solidMeshes.splice(si, 1);
      }
    }
    if (entry.rec && entry.rec.ty === 'dr') doorEntries.delete(entry.rec.id);
    /* ✅ v0.4.28: деталь уходит из реестра ломания */
    var gi = hitGroups.indexOf(entry.group);
    if (gi >= 0) hitGroups.splice(gi, 1);
    if (entry.rec) { pieceById.delete(entry.rec.id); pieceHp.delete(entry.rec.id); }
  }

  function rebuildAux() {
    // полы/потолки читаются прямо из cellRecs (floorAt); здесь — коллайдеры:
    // ✅ v0.4.7: СТЕНЫ (полная высота, концы подогнаны на 4 см — соседние
    // стены больше не образуют «липкий» угол), ПОТОЛКИ (сплошная плита:
    // сверху ходьба, снизу не перепрыгнуть) и ПАЛУБЫ (бок: под палубой
    // не пройти насквозь, но сверху feet > maxY-0.1 — ходьба не блокируется)
    // ✅ v0.4.10: ОКНО — проём свободен (перелаз/пуля), ДВЕРНОЙ ПРОЁМ —
    // открыт сверху донизу, ДВЕРЬ — бокс активен только когда закрыта
    wallBoxes.length = 0;
    var END_INSET = 0.04;   // подгонка концов стены по длине (углы)
    function ebox(x0, x1, z0, z1, y0, y1, act) {
      wallBoxes.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1,
        minY: y0, maxY: y1, active: act !== false });
    }
    edgeRecs.forEach(function (entry) {
      var r = entry.rec;
      var X0 = r.gx * CELL, Z0 = r.gz * CELL, half = CELL / 2, t2 = WALL_T / 2;
      if (r.e === 0 || r.e === 2) {
        // ✅ v0.4.7 ИСПРАВЛЕНИЕ v0.4.6: коллайдер был в ЦЕНТРЕ клетки,
        // а сама стена — на КРАЮ (отсюда «дёргает» между фундаментами
        // и проход сквозь видимую стену). Теперь бокс точно на краю
        var wz = r.e === 0 ? Z0 - half : Z0 + half;
        var xA = X0 - half + END_INSET, xB = X0 + half - END_INSET;
        if (r.ty === 'w') {
          ebox(xA, xB, wz - t2, wz + t2, r.top, r.top + WALL_H);
        } else if (r.ty === 'wi') {
          // окно: под/над проёмом и два простенка по бокам
          ebox(xA, xB, wz - t2, wz + t2, r.top, r.top + WI_Y0);
          ebox(xA, xB, wz - t2, wz + t2, r.top + WI_Y1, r.top + WALL_H);
          ebox(xA, X0 - WI_HALF, wz - t2, wz + t2, r.top + WI_Y0, r.top + WI_Y1);
          ebox(X0 + WI_HALF, xB, wz - t2, wz + t2, r.top + WI_Y0, r.top + WI_Y1);
        } else {
          // дверной проём и дверь: столбы + перемычка
          ebox(xA, X0 - DW_HALF, wz - t2, wz + t2, r.top, r.top + WALL_H);
          ebox(X0 + DW_HALF, xB, wz - t2, wz + t2, r.top, r.top + WALL_H);
          ebox(X0 - DW_HALF, X0 + DW_HALF, wz - t2, wz + t2, r.top + DW_H, r.top + WALL_H);
          if (r.ty === 'dr') {
            // полотно двери: не пускает только когда ЗАКРЫТА
            ebox(X0 - DW_HALF, X0 + DW_HALF, wz - t2, wz + t2,
              r.top, r.top + DW_H, !r.open);
          }
        }
      } else {
        var wx = r.e === 1 ? X0 + half : X0 - half;
        var zA = Z0 - half + END_INSET, zB = Z0 + half - END_INSET;
        if (r.ty === 'w') {
          ebox(wx - t2, wx + t2, zA, zB, r.top, r.top + WALL_H);
        } else if (r.ty === 'wi') {
          ebox(wx - t2, wx + t2, zA, zB, r.top, r.top + WI_Y0);
          ebox(wx - t2, wx + t2, zA, zB, r.top + WI_Y1, r.top + WALL_H);
          ebox(wx - t2, wx + t2, zA, Z0 - WI_HALF, r.top + WI_Y0, r.top + WI_Y1);
          ebox(wx - t2, wx + t2, Z0 + WI_HALF, zB, r.top + WI_Y0, r.top + WI_Y1);
        } else {
          ebox(wx - t2, wx + t2, zA, Z0 - DW_HALF, r.top, r.top + WALL_H);
          ebox(wx - t2, wx + t2, Z0 + DW_HALF, zB, r.top, r.top + WALL_H);
          ebox(wx - t2, wx + t2, Z0 - DW_HALF, Z0 + DW_HALF, r.top + DW_H, r.top + WALL_H);
          if (r.ty === 'dr') {
            ebox(wx - t2, wx + t2, Z0 - DW_HALF, Z0 + DW_HALF,
              r.top, r.top + DW_H, !r.open);
          }
        }
      }
    });
    cellRecs.forEach(function (cell) {
      if (cell.f) {
        var r2 = cell.f.rec, cx = r2.gx * CELL, cz = r2.gz * CELL, h2 = CELL / 2;
        wallBoxes.push({ minX: cx - h2, maxX: cx + h2,
          minZ: cz - h2, maxZ: cz + h2,
          minY: r2.top - 1.15, maxY: r2.top, active: true });
      }
      // ✅ v0.4.7 КОЛЛИЗИЯ ПОТОЛКА: сплошная плита 3×3 м и 24 см толщиной.
      // Внутри комнаты (feet + 0.25 < minY) — не мешает; сверху на плите
      // (feet + 0.55 >= maxY) — ходьба; сбоку/снизу в прыжке — сплошная
      if (cell.c) {
        var r3 = cell.c.rec, cx2 = r3.gx * CELL, cz2 = r3.gz * CELL, h3 = CELL / 2;
        wallBoxes.push({ minX: cx2 - h3, maxX: cx2 + h3,
          minZ: cz2 - h3, maxZ: cz2 + h3,
          minY: r3.top, maxY: r3.top + CEIL_T, active: true });
      }
    });
  }

  /** поставить запись у себя (оптимистично или от сервера/вкладки).
      ✅ v0.4.10: краевые детали w/wi/dw/dr — единый реестр по каноническому
      краю; окно/проём ЗАМЕНЯЮТ стену, дверь — дверной проём (на том же
      крае, старый меш сносится, старая запись возвращается в _replaced
      для отката при bdeny) */
  function applyRecord(b, opts) {
    opts = opts || {};
    if (!b || !inited) return null;
    /* ✅ v0.4.22 СУНДУК — свободная постройка, свой реестр (не на сетке) */
    if (b.ty === 'ch') return applyChest(b, opts);
    var cellKey = key(b.gx, b.gz);
    var canon, ekey;

    if (EDGE_TY[b.ty]) {
      canon = canonicalEdge(b.gx, b.gz, b.e);
      ekey = key(canon.gx, canon.gz) + ',' + canon.e;
      var ex = edgeRecs.get(ekey);
      if (ex) {
        if (ex.rec.id === b.id) {
          // эхо: обновляем ЖИВОЕ состояние двери (open/hc/own)
          if (b.ty === 'dr') {
            var ch = (ex.rec.open ? 1 : 0) !== (b.open ? 1 : 0) ||
                     (ex.rec.hc ? 1 : 0) !== (b.hc ? 1 : 0);
            ex.rec.open = b.open ? 1 : 0;
            ex.rec.hc = b.hc ? 1 : 0;
            if (b.own !== undefined) ex.rec.own = b.own;
            if (ch) applyDoorState(ex);
          }
          return ex.rec;
        }
        // на крае уже что-то стоит (оптимистичный локальный меш или
        // предыдущая деталь) — сносим и ставим новую (сервер главнее)
        var old = ex.rec;
        destroyEntry(ex);
        edgeRecs.delete(ekey);
        ex = null;
        if (old.id !== b.id) {
          b._replacedOld = old;          // для отката bdeny
          /* ✅ fix 0.4.11: замена «L…» → серверный id (эхо своей постройки
             или добор badopt) — звук строительства НЕ играем: свой звук
             уже прозвучал при оптимистичной установке, а массовый добор
             дома после reconnect не должен греметь серией ударов */
          b._silentReid = String(old.id).charAt(0) === 'L';
        }
      }
    } else {
      if (!cellRecs.has(cellKey)) cellRecs.set(cellKey, { f: null, c: null });
      var cell = cellRecs.get(cellKey);
      var slot = b.ty === 'f' ? 'f' : 'c';
      if (cell[slot]) {
        if (cell[slot].rec.id === b.id) return cell[slot].rec;   // эхо
        // ключ тот же, id новый (локальная → серверная): переставляем id
        var oldId = cell[slot].rec.id;
        cell[slot].rec.id = b.id;
        /* ✅ v0.4.28: реестр ломания должен знать новый (серверный) id —
           иначе bhp/brem по серверному id не найдут деталь */
        if (pieceById.get(oldId) === cell[slot]) {
          pieceById.delete(oldId);
          pieceHp.delete(oldId);
          pieceById.set(b.id, cell[slot]);
          pieceHp.set(b.id, b.hp !== undefined ? b.hp : buildMaxHp(b.ty));
          cell[slot].group.traverse(function (o) {
            if (o.isMesh && o.userData.bid === oldId) o.userData.bid = b.id;
          });
        }
        if (slot === 'f') fTop.set(cellKey, b.top);
        return cell[slot].rec;
      }
    }

    var built, entry = { rec: b };
    if (b.ty === 'f') {
      built = buildFoundationGroup(b);
      entry.group = built.group; entry.deck = built.deck;
      rayTargets.push(built.deck);
      var cellF = cellRecs.get(cellKey);
      cellF.f = entry;
      fTop.set(cellKey, b.top);
    } else if (b.ty === 'w') {
      built = buildWallGroup(b);
      entry.group = built.group; entry.slab = built.slab;
      built.slab.userData.bedge = ekey;
      rayTargets.push(built.slab);
      edgeRecs.set(ekey, entry);
    } else if (b.ty === 'wi') {
      built = buildWindowGroup(b);
      entry.group = built.group; entry.slab = built.slab; entry.solids = built.solids;
      built.slab.userData.bedge = ekey;
      rayTargets.push(built.slab);
      pushSolids(entry);
      edgeRecs.set(ekey, entry);
    } else if (b.ty === 'dw') {
      built = buildDoorwayGroup(b);
      entry.group = built.group; entry.slab = built.slab; entry.solids = built.solids;
      built.slab.userData.bedge = ekey;
      rayTargets.push(built.slab);
      pushSolids(entry);
      edgeRecs.set(ekey, entry);
    } else if (b.ty === 'dr') {
      built = buildDoorGroup(b);
      entry.group = built.group; entry.slab = built.slab; entry.solids = built.solids;
      entry.leafPivot = built.leafPivot; entry.leaf = built.leaf;
      entry.lock = built.lock; entry.dot = built.dot;
      entry.lockHit = built.lockHit || null;
      built.slab.userData.bedge = ekey;
      rayTargets.push(built.slab);
      pushSolids(entry);
      edgeRecs.set(ekey, entry);
      doorEntries.set(b.id, entry);
    } else if (b.ty === 'c') {
      built = buildCeilingGroup(b);
      entry.group = built.group; entry.slab = built.slab;
      var cellC = cellRecs.get(cellKey);
      cellC.c = entry;
    } else {
      return null;
    }
    _scene.add(entry.group);
    rebuildAux();

    /* ✅ v0.4.28: деталь в реестре ломания — луч удара, всплывающее ХП, чистка */
    entry.group.traverse(function (o) {
      if (o.isMesh && !o.userData.bid) o.userData.bid = b.id;
    });
    hitGroups.push(entry.group);
    pieceById.set(b.id, entry);
    if (pieceHp.get(b.id) === undefined) {
      pieceHp.set(b.id, (b.hp !== undefined ? b.hp : buildMaxHp(b.ty)));
    }

    // звук: свои — сразу; чужие — с затуханием по дистанции
    if (!opts.silent && !b._silentReid) {
      var vol = 0.8;
      if (opts.remote && _getPos) {
        var dx = (b.gx * CELL) - _getPos().x, dz = (b.gz * CELL) - _getPos().z;
        var d = Math.sqrt(dx * dx + dz * dz);
        vol = Math.max(0, 0.85 - d / 45);
        if (vol < 0.02) return entry;
        vol *= vol;
      }
      var names = ['build1', 'build2', 'build3'];
      if (window.BrixSfx) {
        BrixSfx.play(names[Math.floor(Math.random() * names.length)],
          { volume: vol, jitter: 0.05 });
      }
    }
    return entry;
  }

  function removeRecord(rec) {
    if (!rec) return;
    /* ✅ v0.4.22: сундук — свой реестр, в сеточные индексы не входит */
    if (rec.ty === 'ch') {
      var cen = chestRecs.get(rec.id);
      if (cen && _scene) _scene.remove(cen.group);
      chestRecs.delete(rec.id);
      /* ✅ v0.4.28: сундук уходит из реестра ломания */
      var cgi = hitGroups.indexOf(cen && cen.group);
      if (cgi >= 0) hitGroups.splice(cgi, 1);
      pieceById.delete(rec.id); pieceHp.delete(rec.id);
      return;
    }
    var cellKey = key(rec.gx, rec.gz);
    if (EDGE_TY[rec.ty]) {
      var canon = canonicalEdge(rec.gx, rec.gz, rec.e);
      var ekey = key(canon.gx, canon.gz) + ',' + canon.e;
      var en = edgeRecs.get(ekey);
      if (en && en.rec.id === rec.id) { destroyEntry(en); edgeRecs.delete(ekey); }
    } else {
      var cell = cellRecs.get(cellKey);
      if (cell) {
        var slot = rec.ty === 'f' ? 'f' : 'c';
        if (cell[slot] && cell[slot].rec.id === rec.id) {
          destroyEntry(cell[slot]);
          cell[slot] = null;
          if (slot === 'f') fTop.delete(cellKey);
        }
      }
    }
    rebuildAux();
  }

  function allRecords() {
    var out = [];
    cellRecs.forEach(function (cell) {
      if (cell.f) out.push(cell.f.rec);
      if (cell.c) out.push(cell.c.rec);
    });
    edgeRecs.forEach(function (en) { out.push(en.rec); });
    /* ✅ v0.4.22: сундуки тоже едут в бэкап localStorage (с их содержимым) */
    chestRecs.forEach(function (en) { out.push(en.rec); });
    return out;
  }

  /* ============================================================
     ✅ v0.4.41 С4: все детали в РАДИУсе точки взрыва — мир координат
     детали (фундамент/потолок — центр клетки на их высоте, стена —
     центр края на низе, сундук — его точка). Урон накладывает
     gameworld (localHit 'c4' в соло, сервер в мультиплеере)
     ============================================================ */
  function pieceWorldPos(rec) {
    var half = CELL / 2;
    if (rec.ty === 'ch') return new THREE.Vector3(rec.x, rec.y || 0, rec.z);
    if (rec.e !== undefined) {
      var c = { x: rec.gx * CELL + (rec.e === 1 ? half : rec.e === 3 ? -half : 0),
        z: rec.gz * CELL + (rec.e === 2 ? half : rec.e === 0 ? -half : 0) };
      return new THREE.Vector3(c.x, (rec.top || 0) + WALL_H / 2, c.z);
    }
    return new THREE.Vector3(rec.gx * CELL, rec.top || 0, rec.gz * CELL);
  }
  function piecesInRadius(x, y, z, r) {
    var out = [];
    var r2 = r * r;
    allRecords().forEach(function (rec) {
      var p = pieceWorldPos(rec);
      var dx = p.x - x, dz = p.z - z;
      var dh = dx * dx + dz * dz;
      if (dh > r2) return;
      if (Math.abs(p.y - y) > 5.5) return;   // по высоте ±5.5 м
      out.push({ id: rec.id, ty: rec.ty, pos: p });
    });
    return out;
  }

  /* ============================================================
     ✅ v0.4.22 РЕЕСТР СУНДУКОВ: id -> { rec, group, lidPivot, open,
     target }. rec.cont — содержимое ({ itemId: count }), живёт в
     записи постройки: на сервере, в бэкапе localStorage, в снимках
     ============================================================ */
  var chestRecs = new Map();
  var CHEST_OPEN_ANGLE = 1.85;   // ~106° — крышка откидывается назад

  function placeChest(en) {
    en.group.position.set(en.rec.x, en.rec.y, en.rec.z);
    en.group.rotation.y = en.rec.rot || 0;
    en.group.visible = true;
  }

  function applyChest(b, opts) {
    opts = opts || {};
    if (!_scene) return null;
    /* серверное эхо своей оптимистичной установки: локальный «L…» сундук
       в той же точке заменяем серверным (иначе он задвоится) */
    var dup = null;
    chestRecs.forEach(function (en) {
      if (String(en.rec.id).charAt(0) !== 'L') return;
      var dx = en.rec.x - b.x, dz = en.rec.z - b.z;
      if (dx * dx + dz * dz < 0.02) dup = en;
    });
    if (dup) {
      _scene.remove(dup.group);
      chestRecs.delete(dup.rec.id);
      b._silentReid = true;
    }
    var ex = chestRecs.get(b.id);
    if (ex) {
      /* эхо/снимок: обновляем живую запись (позицию и содержимое) */
      ex.rec.x = b.x; ex.rec.z = b.z; ex.rec.y = b.y;
      if (b.rot !== undefined) ex.rec.rot = b.rot;
      if (b.cont !== undefined) ex.rec.cont = b.cont || {};
      if (b.by !== undefined) ex.rec.by = b.by;
      if (b.own !== undefined) ex.rec.own = b.own;
      placeChest(ex);
      return ex.rec;
    }
    var built = buildChestGroup(b);
    var en = { rec: b, group: built.group, lidPivot: built.lidPivot,
      open: 0, target: 0 };
    chestRecs.set(b.id, en);
    _scene.add(built.group);
    placeChest(en);
    /* ✅ v0.4.28: сундук в реестре ломания (хп 25, любой удар почти убивает) */
    built.group.traverse(function (o) {
      if (o.isMesh && !o.userData.bid) o.userData.bid = b.id;
    });
    hitGroups.push(built.group);
    pieceById.set(b.id, en);
    if (pieceHp.get(b.id) === undefined) {
      pieceHp.set(b.id, (b.hp !== undefined ? b.hp : buildMaxHp('ch')));
    }
    if (!opts.silent && !b._silentReid && window.BrixSfx) {
      BrixSfx.play('build' + (1 + Math.floor(Math.random() * 3)),
        { volume: 0.55, jitter: 0.03 });
    }
    return b;
  }

  /* ============================================================
     СИНХРОНИЗАЦИЯ
     ============================================================ */
  var LS_KEY = 'brix-builds-v1';

  /* ✅ v0.4.13 — ПОКОЛЕНИЕ МИРА (epoch), лечение «батник не работает»:
     CLEAR-BUILDS.bat повышает epoch в world-objs.json. Клиент хранит
     в бэкапе ПОКОЛЕНИЕ, при котором записи были известны серверу, и
     присылает его в badopt. Сервер отвергает бэкап из старого поколения
     и шлёт bwipe — клиент сам выкидывает очищенные постройки (и из мира,
     и из бэкапа). Потеря файла на сервере (свежий мир, epoch=0) по-прежнему
     спасается добором, как в 0.4.12.
     serverEp — текущее поколение с сервера; backupEp — поколение записей
     бэкапа (минимальное среди живых записей — консервативно) */
  var serverEp = 0;
  var backupEp = 0;
  var wipeToasted = false;

  /* ✅ v0.4.9 — ГЛАВНЫЙ ФИКС «ДОМ ПРОПАДАЕТ ПРИ ПЕРЕЗАХОДЕ»:
     раньше applyRecord молча отбрасывал ПОСТРОЙКИ, если мир ещё не
     построен (!inited), а loadLocal() вызывался ВНУТРИ init() ДО
     inited=true — локальный бэкап из localStorage НЕ ВОССТАНАВЛИВАЛСЯ
     НИКОГДА. Теперь: 1) очередь — снапшот, пришедший до init, ждёт и
     применяется после; 2) inited=true ставится СРАЗУ после сборки
     материалов/призрака, ещё до loadLocal. Бэкап (вкладки/соло) и
     снимок сервера (welcome) теперь применяются всегда */
  var pendingSnapshot = null;
  var pendingEp = 0;          /* ✅ v0.4.13: поколение снимка, пришедшего до init */
  var adoptToasted = false;

  /* ✅ fix 0.4.11 «НА СТАРЫЕ ФУНДАМЕНТЫ НЕЛЬЗЯ СТРОИТЬ»: если сервер
     потерял часть мира (перенос папки сервера без world-objs.json, сбой
     файла, рестарт «с чистого листа») — дом у клиента всё равно ВИДЕН
     (страховочный бэкап в localStorage), но сервер не знал таких
     фундаментов и ОТКАЗЫВАЛ в каждой стене/окне («нет фундамента»).
     Теперь после каждого снимка клиент сравнивает СВОИ записи с
     идентификаторами СЕРВЕРА: всё, чего в снимке нет (и локальные
     «L…», и прежние серверные «b…», которые сервер потерял) уходит
     серверу на добор. Занятые клетки/края сервер пропускает, свободные
     принимает, рассылает всем и сохраняет на диск. Как у бочек: мир
     снова единый у всех игроков */
  function adoptLocalToServer(snapList) {
    if (!window.BrixNet || BrixNet.mode !== 'server') return;
    var known = {};
    (snapList || []).forEach(function (b) { if (b && b.id) known[b.id] = true; });
    var lost = [];
    allRecords().forEach(function (r) {
      /* ✅ v0.4.13: на добор едет только поколение бэкапа (backupEp) —
         смешанных эпох не предлагает: сервер всё равно отвергнет старые */
      if (r && r.id && !known[r.id] && (r._ep | 0) === backupEp) lost.push(r);
    });
    if (!lost.length) return;
    try {
      BrixNet.send({ t: 'badopt', list: lost, ep: backupEp });   // ✅ v0.4.13: поколение бэкапа
      if (window.BrixHud && !adoptToasted) {
        adoptToasted = true;
        BrixHud.toast(L('Сервер добрал ' + lost.length + ' постр. из вашего бэкапа',
          'Server adopted ' + lost.length + ' builds from your backup'), 6);
      }
    } catch (e) { /* нет связи — попробуем при следующем снимке */ }
  }

  function applySnapshot(list, ep) {
    /* ✅ v0.4.13: поколение мира из снимка сервера (objs.ep)
       ✅ v0.4.18: снимок ПРОШЛОГО поколения (ep меньше текущего)
       применять НЕЛЬЗЯ. Так бывает, когда welcome ещё летит по сети,
       а админ в этот момент стёр постройки и нам уже пришёл bwipe.
       Раньше такой снимок ПОНИЖАЛ serverEp и возвращал стёртые дома
       (записи получали старое _ep — bwipe их больше не подчищал).
       Правило: сервер главнее, поколение растёт только вверх */
    var newEp = Math.round(Number(ep)) | 0;
    if (newEp < serverEp) return;
    serverEp = newEp;
    if (!inited) {
      // мир ещё строится — копим, применим в init() (см. ниже)
      pendingEp = serverEp;
      pendingSnapshot = (pendingSnapshot || []).concat(list || []);
      return;
    }
    (list || []).forEach(function (b) {
      if (b) b._ep = serverEp;   // ✅ v0.4.13: запись известна серверу в ЭТОМ поколении
      applyRecord(b, { silent: true });
    });
    adoptLocalToServer(list);   // ✅ fix 0.4.11: добор построек, которых сервер не знает
    saveLocal();   // ✅ v0.4.9: бэкап всегда свежий, во всех режимах
  }

  function saveLocal() {
    try {
      /* ✅ v0.4.13: в бэкап едет МИНИМАЛЬНОЕ поколение среди записей —
         если в памяти ещё висит хоть одна устаревшая (до очистки),
         бэкап остаётся в старом поколении и сервер его отвергнет */
      var recs = allRecords();
      var minEp = serverEp;
      if (recs.length) {
        minEp = recs[0]._ep | 0;
        recs.forEach(function (r) { var e2 = (r && r._ep) | 0; if (e2 < minEp) minEp = e2; });
      }
      backupEp = minEp;
      localStorage.setItem(LS_KEY, JSON.stringify({ ep: minEp, list: recs }));
    } catch (e) { /* недоступно — играем без сохранения вкладок */ }
  }

  function loadLocal() {
    try {
      var a = JSON.parse(localStorage.getItem(LS_KEY));
      if (!a) return;
      /* ✅ v0.4.13: новый формат {ep, list}; старый — просто массив (ep=0) */
      if (Array.isArray(a)) a = { ep: 0, list: a };
      backupEp = Math.round(Number(a.ep)) | 0;
      if (!Array.isArray(a.list) || !a.list.length) return;
      a.list.forEach(function (r) {
        if (r) { r._ep = backupEp; applyRecord(r, { silent: true }); }
      });
    } catch (e) { /* нет сохранения */ }
  }

  function onBnew(msg) {
    if (!msg || !msg.b) return;
    /* ✅ v0.4.13: сервер подтвердил запись в ТЕКУЩЕМ поколении мира */
    msg.b._ep = serverEp;
    var remote = msg.pid !== (window.BrixNet && BrixNet.id);
    applyRecord(msg.b, { remote: remote });
    // подтверждение своей оптимистичной постройки
    for (var tid in pendingPlace) {
      var p = pendingPlace[tid];
      /* ✅ v0.4.22: сундук сверяем по точке (x/z), сеточные — по клетке */
      var sameSpot = (p.rec.ty === 'ch')
        ? (p.rec.x === msg.b.x && p.rec.z === msg.b.z)
        : (p.rec.gx === msg.b.gx && p.rec.gz === msg.b.gz &&
           (p.rec.ty !== 'w' || p.rec.e === msg.b.e));
      if (p.rec.ty === msg.b.ty && sameSpot) {
        clearTimeout(p.timer);
        delete pendingPlace[tid];
      }
    }
    // ✅ v0.4.9: бэкап в localStorage — во ВСЕХ режимах (страхование)
    saveLocal();
  }

  /* ✅ v0.4.13: сервер отклонил бэкап (bwipe) — постройки были ОЧИЩЕНЫ
     батником CLEAR-BUILDS.bat Выкидываем все записи старого поколения
     (и из мира, и из бэкапа) — «дом-призрак» не остаётся даже у себя */
  function onBwipe(msg) {
    var wEp = Math.round(Number(msg && msg.ep)) | 0;
    if (wEp > serverEp) serverEp = wEp;
    if (wEp <= backupEp) return;   // бэкап не старее очистки — не наше дело
    var recs = allRecords();
    var removed = 0;
    recs.forEach(function (r) {
      if ((r._ep | 0) < wEp) { removeRecord(r); removed++; }
    });
    saveLocal();
    if (window.BrixHud && removed && !wipeToasted) {
      wipeToasted = true;
      BrixHud.toast(L('Постройки были очищены на сервере',
        'Builds were wiped on the server'), 6);
    }
    console.log('[BrixBuilding] bwipe: убрал ' + removed +
      ' постр. старого поколения (epoch ' + wEp + ')');
  }

  /* ✅ v0.4.18 СТРАХОВКА «ПУСТЬ ИГРОК ТОЖЕ НЕ ВИДИТ»: сервер ДВАЖДЫ
     отказал в установке («нет фундамента») в клетке, где у игрока
     фундамент ВИДЕН. Значит у игрока — призрак: постройка стёрта на
     сервере (админ-панель / CLEAR-BUILDS.bat), а bwipe до него не
     дошёл (дисконнект во время очистки). Сервер главнее — убираем
     фундамент и потолок этой клетки и у игрока */
  function removeGhostCell(gx, gz) {
    var cell = cellRecs.get(key(gx, gz));
    if (!cell) return;
    var removed = 0;
    if (cell.f) { removeRecord(cell.f.rec); removed++; }
    if (cell.c) { removeRecord(cell.c.rec); removed++; }
    if (!removed) return;
    saveLocal();
    if (window.BrixHud) {
      BrixHud.toast(L('Этот фундамент стёрт на сервере — убрал и у вас',
        'This foundation was wiped on the server — removed locally too'), 5);
    }
    console.log('[BrixBuilding] removeGhostCell: убрал призрак-постройки клетки ' +
      gx + ',' + gz + ' (сервер дважды ответил «нет фундамента»)');
  }

  function onBdeny(msg) {
    var p = pendingPlace[msg && msg.tid];
    if (!p) return;
    clearTimeout(p.timer);
    delete pendingPlace[msg.tid];
    removeRecord(p.rec);
    // ✅ v0.4.10: если новая деталь ЗАМЕНИЛА старую (стена→окно и т.п.) —
    // при отказе сервера возвращаем старую на место
    if (p.old) applyRecord(p.old, { silent: true });
    /* ✅ v0.4.12 «НА СТАРЫЕ ФУНДАМЕНТЫ НЕЛЬЗЯ СТРОИТЬ» — финальное лечение:
       сервер не знал фундамент, на который игрок смотрел (потерянный
       world-objs.json, сбой файла, старая сетка). Клиент ДОБИРАЕТ свои
       постройки серверу (badopt — сервер берёт свободные клетки) и ОДИН
       раз повторяет установку сам. Игрок жмёт ЛКМ как обычно — дом строится */
    if (msg.why === 'nofound' && window.BrixNet && BrixNet.mode === 'server' &&
        p.plan) {
      if (!p.retried) {
        /* ✅ v0.4.12: первый отказ — пробуем добор из бэкапа (так чинится
           «сервер потерял world-objs.json») */
        p.retried = true;
        forceAdopt();
        if (window.BrixHud) {
          BrixHud.toast(L('Сервер не знал этот фундамент — добираю из бэкапа…',
            'Server missed this foundation — restoring from backup…'), 4);
        }
        setTimeout(function () {
          retryPlace(p.plan);
        }, 380);
        return;
      }
      /* ✅ v0.4.18: повтор ТОЖЕ отклонён → добор не помог, фундамент
         серверу действительно не известен — это призрак. Убираем его
         и у игрока (раньше модель висела вечно: сервер «не видит»,
         а игрок видит) */
      removeGhostCell(p.plan.gx, p.plan.gz);
    }
    if (window.BrixHud) {
      var why = { busy: L('Здесь уже стоит постройка', 'Occupied'),
        nofound: L('Под постройкой должен быть фундамент', 'Needs a foundation below'),
        nowall: L('Сначала поставь стену', 'Place a wall first'),
        nodw: L('Дверь ставится в дверной проём', 'A door needs a doorway'),
        spam: L('Слишком быстро', 'Too fast') }[msg.why] ||
        L('Сервер не дал построить', 'Server denied the build');
      BrixHud.toast(why);
    }
  }

  /* ✅ v0.4.12: добор ВСЕХ своих построек серверу (как при входе, но по
     требованию). Сервер пропустит занятые клетки/края — безопасно */
  function forceAdopt() {
    try {
      var list = allRecords().filter(function (r) {
        return r && (r._ep | 0) === backupEp;   // ✅ v0.4.13: только поколение бэкапа
      }).slice(0, 400);
      if (!list.length) return;
      BrixNet.send({ t: 'badopt', list: list, ep: backupEp });   // ✅ v0.4.13
    } catch (e) { /* нет связи */ }
  }

  /* ✅ v0.4.12: повтор установки тем же планом после добора фундамента */
  function retryPlace(plan) {
    if (window.BrixGame.state.phase !== 'playing') return;
    var tid = 'T' + Math.random().toString(36).slice(2, 9);
    var rec = { id: 'L' + (++localSeq), ty: plan.ty, gx: plan.gx, gz: plan.gz,
      top: plan.top, by: myName, at: Date.now(), _ep: serverEp };   // ✅ v0.4.13
    if (plan.e !== undefined) rec.e = plan.e;
    applyRecord(rec);
    pendingPlace[tid] = { rec: rec, old: rec._replacedOld || null,
      plan: plan, retried: true };
    BrixNet.sendBplace(plan.ty, plan.gx, plan.gz, plan.e, plan.top, tid,
      plan.px, plan.pz);
    placeFallbackTimer(tid);
    saveLocalTry();
  }

  function placeFallbackTimer(tid) {
    pendingPlace[tid].timer = setTimeout(function () {
      if (!pendingPlace[tid]) return;
      delete pendingPlace[tid];
      // ✅ как в v0.4.0: старый сервер молчит — постройка работает ЛОКАЛЬНО
      if (window.BrixHud) {
        BrixHud.toast(L('Старый server.js не знает строительства: дом виден только вам. ' +
          'Перезапусти сервер из новой папки', 'Old server.js: your build is local only. Restart the server'), 7);
      }
    }, 1600);
  }

  /* ✅ v0.4.22: сундук — своя страховка с текстом про сундук */
  function chestPlaceFallbackTimer(tid) {
    pendingPlace[tid].timer = setTimeout(function () {
      if (!pendingPlace[tid]) return;
      delete pendingPlace[tid];
      if (window.BrixHud) {
        /* ✅ v0.4.23: показываем РЕАЛЬНУЮ версию сервера — сразу видно,
           что процесс сервера не перезапущен (или server.js заменён
           не в той папке) */
        var svOld = (window.BrixNet && BrixNet.serverSv) || 'старый';
        BrixHud.toast(L('Сервер отвечает как v' + svOld + ' — он ещё не знает сундуков, ' +
          'поставленный сундук виден только вам. server.js нужно не только заменить, но и ' +
          'ПЕРЕЗАПУСТИТЬ сервер: закрой чёрное окно (Ctrl+C) и запусти заново (README-FIX-v0.4.23)',
          'Old server.js (v' + svOld + '): chest is local only. Replace server.js AND restart the server'), 9);
      }
    }, 1600);
  }

  /* ============================================================
     УСТАНОВКА (ЛКМ с планом) + ПРИЗРАК
     ============================================================ */
  var ghost = { group: null, mats: null, valid: false, plan: null, shown: false };
  var ray = null;
  var center2 = null;

  function ghostMats() {
    return {
      ok: new THREE.MeshBasicMaterial({ color: 0x8fd07a, transparent: true,
        opacity: 0.42, depthWrite: false }),
      bad: new THREE.MeshBasicMaterial({ color: 0xe05a4a, transparent: true,
        opacity: 0.42, depthWrite: false })
    };
  }

  function rebuildGhost() {
    if (ghost.group && _scene) _scene.remove(ghost.group);
    var g = new THREE.Group();
    var kind = current;
    if (kind === 'f') {
      var d = new THREE.Mesh(_geo.deck, null); d.position.y = -DECK_T / 2; g.add(d); g.userData.m = d;
      var offs = [[-1.26, -1.26], [1.26, -1.26], [1.26, 1.26], [-1.26, 1.26]];
      offs.forEach(function (o) {
        var p = new THREE.Mesh(_geo.post, null);
        p.scale.y = 1.2; p.position.set(o[0], -0.6, o[1]); g.add(p);
      });
    } else if (kind === 'w') {
      var w = new THREE.Mesh(_geo.wall, null); w.position.y = WALL_H / 2; g.add(w); g.userData.m = w;
    } else if (kind === 'wi' || kind === 'dw' || kind === 'dr') {
      // ✅ v0.4.10: призрак окна/проёма/двери — из ТЕХ ЖЕ частей
      function mk(geo, x, y) {
        var m = new THREE.Mesh(geo, null);
        m.position.set(x, y, 0); g.add(m); return m;
      }
      if (kind === 'wi') {
        mk(_geo.wiBot, 0, WI_Y0 / 2);
        mk(_geo.wiTop, 0, WI_Y1 + (WALL_H - WI_Y1) / 2);
        mk(_geo.wiSide, -(CELL / 2 + WI_HALF) / 2, (WI_Y0 + WI_Y1) / 2);
        mk(_geo.wiSide, (CELL / 2 + WI_HALF) / 2, (WI_Y0 + WI_Y1) / 2);
      } else {
        mk(_geo.dwSide, -(CELL / 2 + DW_HALF) / 2, WALL_H / 2);
        mk(_geo.dwSide, (CELL / 2 + DW_HALF) / 2, WALL_H / 2);
        mk(_geo.dwTop, 0, DW_H + (WALL_H - DW_H) / 2);
      }
      if (kind === 'dr') {
        var lf = mk(_geo.doorLeaf, 0, DW_H / 2);   // полотно по центру проёма
        g.userData.m = lf;
      } else {
        g.userData.m = g.children[0];
      }
    } else if (kind === 'ch') {
      // ✅ v0.4.22 призрак сундука: поднижник + корпус + крышка из ТЕХ ЖЕ геометрий
      var cg = chestGeo();
      var cpl = new THREE.Mesh(cg.plinth, null); cpl.position.y = 0.045; g.add(cpl);
      var cb = new THREE.Mesh(cg.base, null); cb.position.y = 0.29; g.add(cb);
      var cl = new THREE.Mesh(cg.lid, null); cl.position.set(0, 0.55, 0); g.add(cl);
      g.userData.m = cb;
    } else {
      var c = new THREE.Mesh(_geo.ceil, null); c.position.y = CEIL_T / 2; g.add(c); g.userData.m = c;
    }
    g.visible = false;
    _scene.add(g);
    ghost.group = g;
    ghost.mats = ghost.mats || ghostMats();
  }

  function setGhostColor(ok) {
    if (!ghost.group || !ghost.mats) return;
    ghost.group.traverse(function (o) {
      if (o.isMesh) o.material = ok ? ghost.mats.ok : ghost.mats.bad;
    });
  }

  /** план для ФУНДАМЕНТА по точке прицела */
  function planFoundation(P) {
    var gx = Math.round(P.x / CELL), gz = Math.round(P.z / CELL);
    var cell = cellRecs.get(key(gx, gz));
    if (cell && cell.f) return { valid: false, why: 'busy', gx: gx, gz: gz };
    // ✅ МАГНИТ: у соседа (4 стороны) есть фундамент → берём ЕГО высоту
    var snap = null;
    var nb = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (var i = 0; i < nb.length; i++) {
      var t = fTop.get(key(gx + nb[i][0], gz + nb[i][1]));
      if (t !== undefined && snap === null) snap = t;
    }
    var top;
    if (snap !== null) {
      top = snap;
    } else {
      // свободная установка: верх палубы по САМОЙ ВЫСОКОЙ точке клетки
      var hMax = -1e9, hMin = 1e9;
      var pts = [[0, 0], [-1.3, -1.3], [1.3, -1.3], [1.3, 1.3], [-1.3, 1.3]];
      for (var j = 0; j < pts.length; j++) {
        var h = _groundY(gx * CELL + pts[j][0], gz * CELL + pts[j][1]);
        if (h > hMax) hMax = h;
        if (h < hMin) hMin = h;
      }
      if (hMax - hMin > 2.8) return { valid: false, why: 'slope', gx: gx, gz: gz };
      if (hMax < WATER_LEVEL - 0.15) return { valid: false, why: 'water', gx: gx, gz: gz };
      top = Math.round((hMax + DECK_LIFT) * 100) / 100;
    }
    return { valid: true, ty: 'f', gx: gx, gz: gz, top: top };
  }

  /** ✅ v0.4.10 план для КРАЕВОЙ детали (стена/окно/проём) по точке прицела.
      Окно и проём можно ставить и ВМЕТО существующей стены (замена);
      на край с окном/проёмом/дверью — нельзя */
  function planOnEdge(P, hit, ty) {
    var gx, gz;
    // если попали в палубу/стену/окно/проём — берём её клетку
    var viaMesh = null, viaEdge2 = null, o = hit && hit.object;
    while (o) {
      /* ✅ fix 0.4.11: ПОПАЛИ В СТЕНУ/ОКНО/ПРОЁМ — их канонический ключ
         (bedge) точно знает клетку-анкер. Раньше клетку «угадывали»
         округлением точки прицела и на половине краёв промахивались —
         призрак краснел «нет фундамента», хотя фундамент рядом */
      if (!viaEdge2 && o.userData && o.userData.bedge) viaEdge2 = o.userData.bedge;
      if (o.userData && o.userData.bcell) { viaMesh = o.userData.bcell; break; }
      o = o.parent;
    }
    if (viaMesh) {
      var parts = viaMesh.split(',');
      gx = parseInt(parts[0], 10); gz = parseInt(parts[1], 10);
    } else if (viaEdge2) {
      var ppE = viaEdge2.split(',');
      gx = parseInt(ppE[0], 10); gz = parseInt(ppE[1], 10);
    } else {
      gx = Math.round(P.x / CELL); gz = Math.round(P.z / CELL);
    }
    var anchorCell = cellRecs.get(key(gx, gz));
    if (!anchorCell || !anchorCell.f) return { valid: false, why: 'nofound' };
    // ближайший край клетки: куда смещена точка прицела от центра
    var dx = P.x - gx * CELL, dz = P.z - gz * CELL;
    var e = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 1 : 3) : (dz > 0 ? 2 : 0);
    var canon = canonicalEdge(gx, gz, e);
    var ekey = key(canon.gx, canon.gz) + ',' + canon.e;
    var ex = edgeRecs.get(ekey);
    if (ex) {
      var et = ex.rec.ty;
      if (ty === 'w') return { valid: false, why: 'busy' };
      // окно/проём встают ВМЕТО обычной стены (замена) — иначе нельзя
      if ((ty === 'wi' || ty === 'dw') && et !== 'w') return { valid: false, why: 'busy' };
    }
    // ✅ МАГНИТ К КРАЮ: деталь встаёт ровно на край фундамента
    return { valid: true, ty: ty, gx: gx, gz: gz, e: e, top: anchorCell.f.rec.top };
  }

  /** центр края (мировые координаты середины стены) — для поиска проёма */
  function edgeCenter(r) {
    var half = CELL / 2;
    if (r.e === 0) return { x: r.gx * CELL, z: r.gz * CELL - half };
    if (r.e === 2) return { x: r.gx * CELL, z: r.gz * CELL + half };
    if (r.e === 1) return { x: r.gx * CELL + half, z: r.gz * CELL };
    return { x: r.gx * CELL - half, z: r.gz * CELL };
  }

  /** ✅ v0.4.10 план для ДВЕРИ: нужна ДВЕРНАЯ РАМА (dw) — целимся прямо в
      неё (рама ловит луч) или берём ближайший проём к точке прицела */
  function planDoor(P, hit) {
    var viaEdge = null, o2 = hit && hit.object;
    while (o2) {
      if (o2.userData && o2.userData.bedge) { viaEdge = o2.userData.bedge; break; }
      o2 = o2.parent;
    }
    if (viaEdge) {
      var en = edgeRecs.get(viaEdge);
      if (en && en.rec.ty === 'dw') {
        var pp = viaEdge.split(',');
        return { valid: true, ty: 'dr', gx: +pp[0], gz: +pp[1], e: +pp[2], top: en.rec.top };
      }
      return { valid: false, why: en ? 'busy' : 'nodw' };
    }
    // свободный поиск: ближайший дверной проём к точке прицела
    var best = null, bestD = 1.35;
    edgeRecs.forEach(function (en2) {
      if (en2.rec.ty !== 'dw') return;
      var c = edgeCenter(en2.rec);
      var d = Math.hypot(P.x - c.x, P.z - c.z);
      if (d < bestD) { bestD = d; best = en2.rec; }
    });
    if (best) return { valid: true, ty: 'dr', gx: best.gx, gz: best.gz, e: best.e, top: best.top };
    return { valid: false, why: 'nodw' };
  }

  /** план для ПОТОЛКА: клетка должна иметь фундамент И хотя бы одну стену.
      ✅ v0.4.41 МАГНИТ ПОТОЛКА (было «сложно нормально поставить»):
      1) целишься в СТЕНУ — потолок встаёт в клетку, где ТЫ стоишь (внутреннюю),
         а не в «якорную» клетку края (раньше часто ставился в соседнюю);
      2) целишься в НЕБО/мимо — потолок ищется НАД ИГРОКОМ и на клетку ВПЕРЁД
         по взгляду (внутри комнаты луч всё равно ни во что не упирался);
      3) целишься в УЖЕ ПОСТАВЛЕННЫЙ потолок — достройка продолжается:
         берётся СОСЕДНЯЯ клетка в направлении от игрока к точке прицела;
      4) прежняя логика (точка прицела) осталась как резервный кандидат.
      Порядок проверки: первый кандидат, у которого есть фундамент +
      стена + нет потолка — и есть план */
  function planCeiling(P, hit) {
    // разбираем, во что попал луч (стена — bedge, палуба/потолок — bcell)
    var viaEdge = null, viaCell = null, o2 = hit && hit.object;
    while (o2) {
      if (!viaCell && o2.userData && o2.userData.bcell) viaCell = o2.userData.bcell;
      if (!viaEdge && o2.userData && o2.userData.bedge) viaEdge = o2.userData.bedge;
      o2 = o2.parent;
    }
    // клетка игрока и клетка «вперёд по взгляду»
    var pcx = null, pcz = null;
    if (_getPos) {
      pcx = Math.round(_getPos().x / CELL);
      pcz = Math.round(_getPos().z / CELL);
    }
    var fwdCell = null;
    if (pcx !== null && _camera) {
      var dir = new THREE.Vector3();
      _camera.getWorldDirection(dir);
      var fx = pcx + (Math.abs(dir.x) > 0.4 ? (dir.x > 0 ? 1 : -1) : 0);
      var fz = pcz + (Math.abs(dir.z) > 0.4 ? (dir.z > 0 ? 1 : -1) : 0);
      if (fx !== pcx || fz !== pcz) fwdCell = { gx: fx, gz: fz };
    }
    // кандидаты (gx,gz) в порядке приоритета
    var cands = [];
    function pushCand(gx, gz) {
      if (gx === null || gz === null || isNaN(gx) || isNaN(gz)) return;
      for (var i = 0; i < cands.length; i++) {
        if (cands[i].gx === gx && cands[i].gz === gz) return;
      }
      cands.push({ gx: gx, gz: gz });
    }
    if (viaEdge) {
      // стена: обе клетки края; ПЕРВОЙ — та, где стоит игрок
      var pp = viaEdge.split(',');
      var ax = parseInt(pp[0], 10), az = parseInt(pp[1], 10), ae = parseInt(pp[2], 10);
      var bx = ax, bz = az;                    // вторая клетка края
      if (ae === 0) bz = az - 1;
      else if (ae === 3) bx = ax - 1;
      var firstIn = (pcx !== null && pcx === bx && pcz === bz);
      if (firstIn) { pushCand(bx, bz); pushCand(ax, az); }
      else { pushCand(ax, az); pushCand(bx, bz); }
    }
    if (viaCell) {
      // попали в палубу/потолок: та клетка + сосед в направлении взгляда
      var cp = viaCell.split(',');
      var cx = parseInt(cp[0], 10), cz = parseInt(cp[1], 10);
      pushCand(cx, cz);
      var dxc = P.x - cx * CELL, dzc = P.z - cz * CELL;
      if (Math.abs(dxc) > Math.abs(dzc)) pushCand(cx + (dxc > 0 ? 1 : -1), cz);
      else pushCand(cx, cz + (dzc > 0 ? 1 : -1));
    }
    if (viaEdge && !viaCell) {
      // целимся в стену изНУТРИ — потолок над ИГРОКОМ главнее точки прицела
      pushCand(pcx, pcz);
      if (fwdCell) pushCand(fwdCell.gx, fwdCell.gz);
    }
    // точка прицела (прежнее поведение; P может быть null — вызов «по игроку»)
    if (P) pushCand(Math.round(P.x / CELL), Math.round(P.z / CELL));
    pushCand(pcx, pcz);
    if (fwdCell) pushCand(fwdCell.gx, fwdCell.gz);

    for (var i = 0; i < cands.length; i++) {
      var gx = cands[i].gx, gz = cands[i].gz;
      var cell = cellRecs.get(key(gx, gz));
      if (!cell || !cell.f) continue;          // нет фундамента
      if (cell.c) continue;                    // потолок уже стоит
      // есть ли стена на любом из 4 краёв клетки (канонические ключи)
      var hasWall = edgeRecs.has(key(gx, gz) + ',0') ||
                    edgeRecs.has(key(gx, gz) + ',3') ||
                    edgeRecs.has(key(gx, gz + 1) + ',0') ||
                    edgeRecs.has(key(gx + 1, gz) + ',3');
      if (!hasWall) continue;
      return { valid: true, ty: 'c', gx: gx, gz: gz,
        top: Math.round((cell.f.rec.top + WALL_H) * 100) / 100 };
    }
    // ничего подходящего — прежняя причина (по первой клетке-якорю, если была)
    if (viaEdge) {
      var pp2 = viaEdge.split(',');
      var cell2 = cellRecs.get(key(parseInt(pp2[0], 10), parseInt(pp2[1], 10)));
      if (!cell2 || !cell2.f) return { valid: false, why: 'nofound' };
    }
    return { valid: false, why: 'nowall' };
  }

  function holdingPlan() {
    try {
      var inv = window.BrixInventory && BrixInventory.get();
      if (!inv) return false;
      /* ✅ v0.4.9 (по просьбе игрока): строим ТОЛЬКО когда план стоит
         В СЛОТЕ ХОТБАРА и этот слот выбран (план в руках, onSelect
         уже переключил руки на ватман). Клик по плану в рюкзаке больше
         НЕ берёт его в руки — сначала перетащи план в хотбар */
      var it = inv.getSelectedItem();
      return !!(it && it.tool === 'plan');
    } catch (e) { return false; }
  }

  function uiBlocked() {
    return !!((window.BrixInventory && BrixInventory.get() && BrixInventory.get().isOpen) ||
      (window.BrixLootMenu && BrixLootMenu.isOpen()) ||
      (window.BrixMiniMenu && BrixMiniMenu.isAnyOpen()));
  }

  /* ============================================================
     ✅ v0.4.22 СУНДУК: свободная установка — на землю и на палубу
     фундамента. Высоту берём из точки луча (на фундаменте — ИЗ
     ЗАПИСИ клетки, чтобы сундук не парил), поворот — лицом к игроку.
     В воде, на склоне и рядом с другим сундуком ставиться нельзя
     ============================================================ */
  function planChest(P, hit) {
    var wn = (hit && hit.face && hit.object)
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
      : null;
    if (!wn || wn.y < 0.55) return null;              // только горизонтальное
    var x = P.x, z = P.z, y = P.y;
    var onDeck = !!(hit.object.userData && hit.object.userData.bcell);
    if (onDeck) {
      var fcell = cellRecs.get(hit.object.userData.bcell);
      if (fcell && fcell.f) y = fcell.f.rec.top;      // точно по палубе фундамента
      else onDeck = false;
    }
    var valid = true;
    if (y < WATER_LEVEL + 0.1) valid = false;         // не в воде
    chestRecs.forEach(function (en) {
      var dx = en.rec.x - x, dz = en.rec.z - z;
      if (dx * dx + dz * dz < 1.44) valid = false;    // рядом другой сундук
    });
    var rot = 0;
    if (_camera) rot = Math.atan2(_camera.position.x - x, _camera.position.z - z);
    return { ty: 'ch', x: x, z: z, y: y, rot: rot, valid: valid };
  }

  function updateGhost() {
    if (!ghost.group) return;
    var active = holdingPlan() && !menu.open && !isUiBlocked() &&
      window.BrixGame && BrixGame.state.phase === 'playing';
    if (!active) {
      ghost.group.visible = false;
      ghost.shown = false;
      ghost.plan = null;
      return;
    }
    ray.setFromCamera(center2, _camera);
    ray.far = MAX_PLACE_DIST;
    // луч: рельеф + уже поставленные палубы/стены (целиться можно и в дом)
    var targets = _terrainMesh ? [_terrainMesh] : [];
    targets = targets.concat(rayTargets);
    var hits = ray.intersectObjects(targets, false);
    if (!hits.length) {
      /* ✅ v0.4.41 МАГНИТ ПОТОЛКА БЕЗ ЛУЧА: внутри комнаты смотрим ВВЕРХ —
         луч ни во что не упирается (потолка ещё нет), и раньше призрак
         просто исчезал — потолок было не поставить. Теперь для потолка
         план ищется ПО ИГРОКУ (клетка под ногами + клетка вперёд) */
      if (current === 'c') {
        var planSky = planCeiling(null, null);
        if (planSky && planSky.valid) {
          planSky.px = _getPos ? _getPos().x : planSky.gx * CELL;
          planSky.pz = _getPos ? _getPos().z : planSky.gz * CELL;
          ghost.plan = planSky;
          ghost.valid = true;
          ghost.group.position.set(planSky.gx * CELL, planSky.top || 0, planSky.gz * CELL);
          ghost.group.rotation.y = 0;
          setGhostColor(true);
          ghost.group.visible = true;
          ghost.shown = true;
          return;
        }
      }
      ghost.group.visible = false;
      ghost.shown = false;
      ghost.plan = null;
      return;
    }
    var P = hits[0].point;
    var plan;
    if (current === 'f') plan = planFoundation(P);
    else if (current === 'c') plan = planCeiling(P, hits[0]);
    else if (current === 'dr') plan = planDoor(P, hits[0]);
    else if (current === 'ch') plan = planChest(P, hits[0]);   // ✅ v0.4.22
    else plan = planOnEdge(P, hits[0], current);   // 'w' | 'wi' | 'dw'
    if (!plan) { ghost.group.visible = false; ghost.shown = false; return; }
    /* ✅ v0.4.12: точку прицела едет НА СЕРВЕР (px/pz) — сервер сам
       проверяет, что под лучом есть фундамент. Лечит «старые фундаменты»:
       любое расхождение координат клиент/сервер больше не ломает стройку */
    plan.px = P.x; plan.pz = P.z;
    ghost.plan = plan;
    ghost.valid = !!plan.valid;
    if (current === 'ch') {
      // ✅ v0.4.22 сундук: свободные координаты + поворот к игроку
      ghost.group.position.set(plan.x, plan.y, plan.z);
      ghost.group.rotation.y = plan.rot || 0;
    } else if (EDGE_TY[current]) {
      ghost.group.position.set(plan.gx * CELL + (plan.e === 1 ? CELL / 2 : plan.e === 3 ? -CELL / 2 : 0),
        plan.top || 0,
        plan.gz * CELL + (plan.e === 2 ? CELL / 2 : plan.e === 0 ? -CELL / 2 : 0));
      ghost.group.rotation.y = (plan.e === 1 || plan.e === 3) ? Math.PI / 2 : 0;
    } else {
      ghost.group.position.set(plan.gx * CELL, plan.top || 0, plan.gz * CELL);
      ghost.group.rotation.y = 0;
    }
    setGhostColor(!!plan.valid);
    ghost.group.visible = true;
    ghost.shown = true;
  }

  /** ЛКМ с планом — установить выбранную деталь */
  function tryPlace() {
    if (window.BrixGame.state.phase !== 'playing' || menu.open || isUiBlocked()) return;
    if (placeCd > 0 || !ghost.shown || !ghost.plan || !ghost.plan.valid) return;
    var plan = ghost.plan;
    placeCd = PLACE_CD;
    var tid = 'T' + Math.random().toString(36).slice(2, 9);
    /* ============================================================
       ✅ v0.4.22 СУНДУК — свободная постройка: свои координаты и свой
       канал сервера (chplace). Вкладки/соло — bnew + localStorage
       ============================================================ */
    if (plan.ty === 'ch') {
      var chRec = { id: 'L' + (++localSeq), ty: 'ch', x: plan.x, z: plan.z,
        y: plan.y, rot: plan.rot, by: myName, at: Date.now(),
        _ep: serverEp, cont: {} };
      applyRecord(chRec);                    // у себя — СРАЗУ (оптимистично)
      pendingPlace[tid] = { rec: chRec, old: null, plan: plan };
      if (window.BrixNet && BrixNet.mode === 'server') {
        if (BrixNet.serverVer >= 50) {
          BrixNet.sendChestPlace(plan.x, plan.z, plan.y, plan.rot, tid);
          chestPlaceFallbackTimer(tid);
          saveLocalTry();
        } else {
          /* старый server.js (до 0.4.22) сундуков не знает — не ставим */
          pendingPlace[tid].timer = setTimeout(function () {
            delete pendingPlace[tid];
          }, 50);
          removeRecord(chRec);
          /* ✅ v0.4.23: точная причина — сервер v0.4.21 или старее работает
             СЕЙЧАС (не перезапущен после замены server.js) */
          var svCh = (window.BrixNet && BrixNet.serverSv) || 'старый';
          if (window.BrixHud) BrixHud.toast(L(
            'Сундук пока НЕ поставлен: сервер работает как v' + svCh +
            ' — замени server.js и ОБЯЗАТЕЛЬНО перезапусти сервер (Ctrl+C, потом запусти заново; в шапке окна должно быть «BRIX server v0.4.23»)',
            'Chest needs the updated server.js AND a server RESTART'), 9);
        }
      } else {
        if (window.BrixNet) {
          BrixNet.send({ t: 'bnew', pid: (BrixNet.id || 'tab') + ':p', b: chRec });
        }
        saveLocal();
      }
      return;
    }
    var rec = { id: 'L' + (++localSeq), ty: plan.ty, gx: plan.gx, gz: plan.gz,
      top: plan.top, by: myName, at: Date.now(), _ep: serverEp };   // ✅ v0.4.13
    if (plan.e !== undefined) rec.e = plan.e;
    applyRecord(rec);                        // у себя — СРАЗУ (оптимистично)
    // ✅ v0.4.10: запоминаем, ЧТО заменили (стена→окно/проём, проём→дверь)
    // — при отказе сервера вернём на место
    // ✅ v0.4.12: храним ПЛАН — при nofound сервер доберёт фундамент
    // из бэкапа и мы ОДИН раз повторим установку автоматически
    pendingPlace[tid] = { rec: rec, old: rec._replacedOld || null, plan: plan };
    if (window.BrixNet && BrixNet.mode === 'server') {
      BrixNet.sendBplace(plan.ty, plan.gx, plan.gz, plan.e, plan.top, tid,
        plan.px, plan.pz);
      placeFallbackTimer(tid);
      saveLocalTry();
    } else {
      // вкладки: рассылаем другим; соло — только localStorage
      if (window.BrixNet) {
        BrixNet.send({ t: 'bnew', pid: (BrixNet.id || 'tab') + ':p', b: rec });
      }
      saveLocal();
    }
  }

  function saveLocalTry() {
    // в серверном режиме localStorage — страховка на случай «только у меня
    // работает»: снимок сервера всё равно главнее и придёт в welcome
    saveLocal();
  }

  /* ============================================================
     ✅ v0.4.10 ДВЕРЬ И КОДОВЫЙ ЗАМОК: состояние, анимация,
     права (владелец/разгадавшие), клавиатура кода — как в Rust.
     Код ХРАНИТСЯ ТОЛЬКО НА СЕРВЕРЕ (rec.code не покидает server.js);
     клиент знает только «есть код» (rec.hc) и «я его разгадал» (myUnl)
     ============================================================ */
  var myUnl = {};            // замки, код которых я уже ввёл верно
  var lastTog = null;        /* ✅ fix 0.4.11: последняя оптимистичная дверь
                    {id, to} — для ОТКАТА, если сервер не пустил */

  function myNick() {
    /* ✅ fix 0.4.11: сервер режет ник до 16 символов (p.name) — сравниваем
       владельца в ТОЙ ЖЕ форме, иначе «n:ДлинныйНик» ≠ «n:ОбрезанныйНик» */
    try { return String((window.BrixNet && BrixNet.NAME) || myName).slice(0, 16); }
    catch (e) { return String(myName).slice(0, 16); }
  }
  /** ключ владельца: BRIX-ID профиля, для гостей — 'n:'+ник.
      Он же живёт на сервере в rec.own — переживёт перезаход.
      ✅ fix 0.4.11: BRIX-ID создаётся СРАЗУ (раньше — только при первом
      открытии профиля: дверь, поставленная до этого, навсегда теряла
      владельца — F по своей двери требовал код) */
  function ownerKey() {
    try {
      var aid = (window.BrixState && BrixState.ensureProfileId && BrixState.ensureProfileId()) ||
                (window.BrixState && BrixState.data.profileId) || '';
      return aid ? String(aid) : ('n:' + myNick());
    } catch (e) { return 'n:' + myNick(); }
  }
  /* ✅ fix 0.4.11: владелец узнаётся в ОБОИХ формах, которые сервер мог
     записать: новый BRIX-ID и старый «n:ник» (двери из прошлых сессий).
     Раньше совпадала только одна — свои двери «не открывались» */
  function isOwner(rec) {
    if (!rec || !rec.own) return false;
    try {
      var aid = (window.BrixState && BrixState.data.profileId) || '';
      if (aid && rec.own === String(aid)) return true;
    } catch (e) {}
    return rec.own === ('n:' + myNick());
  }
  function applyUnl(list) { (list || []).forEach(function (id) { myUnl[id] = true; }); }
  /** можно ли открыть дверь БЕЗ ввода кода */
  function doorAuth(rec) {
    /* ✅ v0.4.15: админ (ID владельца, подтверждён сервером) открывает
       ЛЮБЫЕ замки — F по чужой закрытой двери просто открывает её */
    if (window.BrixAdmin && BrixAdmin.masterkey) return true;
    if (!rec.hc) return true;           // кода нет — зелёная лампа
    if (isOwner(rec)) return true;      // владелец всегда может
    return !!myUnl[rec.id];             // уже разгадал этот замок
  }

  function findEntry(id) { return doorEntries.get(id) || null; }
  function findRec(id) {
    var found = null;
    cellRecs.forEach(function (cell) {
      if (!found && cell.f && cell.f.rec.id === id) found = cell.f.rec;
      if (!found && cell.c && cell.c.rec.id === id) found = cell.c.rec;
    });
    if (found) return found;
    var e2 = null;
    edgeRecs.forEach(function (en) { if (!e2 && en.rec.id === id) e2 = en.rec; });
    return e2;
  }

  /** лампочка замка: зелёная (кода нет) / красная (код есть) */
  function updateLight(en) {
    if (en && en.dot && _mat) en.dot.material = en.rec.hc ? _mat.lampOff : _mat.lampOn;
  }
  /** привести меш двери к rec (без анимации — для снимков/рестарта) */
  function applyDoorState(en) {
    if (en.leafPivot) {
      en.leafPivot.rotation.y = en.rec.open ? DOOR_OPEN_ANGLE : 0;
      en.anim = null;
    }
    updateLight(en);
    rebuildAux();
  }

  /** локально открыть/закрыть: анимация + звук + коллизия полотна */
  function setDoorLocal(en, open, silent) {
    var rec = en.rec;
    if ((rec.open ? 1 : 0) === (open ? 1 : 0)) return;
    rec.open = open ? 1 : 0;
    if (en.leafPivot) {
      en.anim = { from: en.leafPivot.rotation.y, to: rec.open ? DOOR_OPEN_ANGLE : 0, t: 0 };
    }
    if (!silent && window.BrixSfx) BrixSfx.play('doorMove', { volume: 0.42, jitter: 0.05 });
    rebuildAux();   // бокс полотна active = !open
  }

  /** F по двери: открыть/закрыть (свой/разгадавший/без кода).
      В серверном режиме решает сервер; во вкладках — сами */
  function toggleDoor(en) {
    var rec = en.rec;
    var next = rec.open ? 0 : 1;
    setDoorLocal(en, next);
    lastTog = { id: rec.id, to: next };   /* ✅ fix 0.4.11: для отката */
    if (window.BrixNet && BrixNet.mode === 'server') {
      BrixNet.send({ t: 'btog', id: rec.id });
    } else if (window.BrixNet && BrixNet.mode === 'tabs') {
      BrixNet.send({ t: 'bdoor', id: rec.id, open: next });
      saveLocal();
    }
  }

  /* ---------- наведение на дверь/замок + подсказка ---------- */
  /* ✅ v0.4.32 fix: подсказку двери и ХП-бар нужно крепить в #gameHud
     (слой HUD ВНУТРИ #gameLayer, z-index 60), а не в <body>. Всё, что
     висит на <body> с z-index ниже 60, рисуется ПОД игровым экраном и
     НИКОГДА не видно — из-за этого ХП-бар построек и подсказка «F —
     ОТКРЫТЬ ДВЕРЬ» были невидимы. #gameHud может исчезнуть при выходе
     из игры раньше teardown — поэтому каждый раз берём живой узел */
  var _intRay = null;
  var aim = { hit: false, en: null, onLock: false, t: 0 };
  var doorHintEl = null;
  function uiHost() {
    return document.getElementById('gameHud') || document.body;
  }
  function ensureDoorHint() {
    if (doorHintEl && doorHintEl.parentElement === uiHost()) return doorHintEl;
    if (doorHintEl && doorHintEl.parentElement) doorHintEl.parentElement.removeChild(doorHintEl);
    doorHintEl = document.createElement('div');
    doorHintEl.id = 'brixDoorHint';
    /* ✅ v0.4.32: top 64% — раньше 56%, но теперь там ХП-бар прицела
       (50%+38px..+84px) — текст «F — ОТКРЫТЬ ДВЕРЬ» лип на бар */
    doorHintEl.style.cssText = 'position:fixed;left:50%;top:64%;transform:translateX(-50%);' +
      'z-index:8;color:#ffe9b8;font:13px/1.4 Consolas,monospace;letter-spacing:.06em;' +
      'text-shadow:0 1px 4px rgba(0,0,0,.95);pointer-events:none;display:none;';
    uiHost().appendChild(doorHintEl);
    return doorHintEl;
  }
  function doorHintText(en, onLock) {
    var rec = en.rec;
    if (onLock && isOwner(rec)) {
      return rec.hc ? L('F — СМЕНИТЬ КОД ЗАМКА', 'F — CHANGE LOCK CODE')
                    : L('F — ЗАДАТЬ КОД ЗАМКА', 'F — SET LOCK CODE');
    }
    if (rec.open) return L('F — ЗАКРЫТЬ ДВЕРЬ', 'F — CLOSE DOOR');
    if (doorAuth(rec)) return L('F — ОТКРЫТЬ ДВЕРЬ', 'F — OPEN DOOR');
    if (rec.hc) return L('F — ВВЕСТИ КОД', 'F — ENTER CODE');
    return '';
  }
  function aimCheck(force) {
    if (!force && aim.t > 0) return;
    aim.t = 0.12;
    aim.hit = false; aim.en = null; aim.onLock = false;
    if (!_intRay || !_camera) return;
    if (pad.open || vault || menu.open || uiBlocked() ||
        !window.BrixGame || BrixGame.state.phase !== 'playing') return;
    var targets = [];
    doorEntries.forEach(function (en) {
      if (en.leaf) targets.push(en.leaf);
      if (en.lock) targets.push(en.lock);
      if (en.lockHit) targets.push(en.lockHit);   // ✅ fix 0.4.12: большой хитбокс
      if (en.dot) targets.push(en.dot);
    });
    if (!targets.length) return;
    _intRay.setFromCamera(center2, _camera);
    _intRay.far = 3.4;
    var hits = _intRay.intersectObjects(targets, false);
    if (!hits.length) return;
    var m = hits[0].object;
    var en = m.userData && m.userData.bid ? doorEntries.get(m.userData.bid) : null;
    if (!en) return;
    aim.hit = true; aim.en = en;
    aim.onLock = !!(m.userData.bdot || m.userData.block);
  }
  function updateDoorHint() {
    aimCheck(false);
    var el = ensureDoorHint();
    var txt = aim.hit ? doorHintText(aim.en, aim.onLock) : '';
    if (!txt) { el.style.display = 'none'; return; }
    if (el.textContent !== txt) el.textContent = txt;
    el.style.display = 'block';
  }

  /** F — дверь/замок. Вызывается gameworld ПЕРЕД tryPickup;
      true = «я обработал F» (подбор лута не запускается) */
  function interact() {
    if (!inited) return false;
    /* ✅ fix 0.4.12: клавиатура открыта — F закрывает её ЗДЕСЬ (раньше
       полагались на padKeyDown, но gameworld теперь гасит событие через
       stopImmediatePropagation — закрытие переехало сюда) */
    if (pad.open) { closePad(); return true; }
    if (vault || menu.open || uiBlocked()) return false;
    if (!window.BrixGame || BrixGame.state.phase !== 'playing') return false;
    aimCheck(true);
    if (!aim.hit || !aim.en) return false;
    var rec = aim.en.rec;
    if (aim.onLock && isOwner(rec)) { openPad('set', rec.id); return true; }
    if (doorAuth(rec)) { toggleDoor(aim.en); return true; }
    if (rec.open) { toggleDoor(aim.en); return true; }   // открытую чужую можно закрыть
    openPad('enter', rec.id);                            // чужой закрытый — код
    return true;
  }

  /* ============================================================
     ✅ v0.4.22 СУНДУК: наведение (F), содержимое, крышка.
     chestAim() возвращает id сундука, если прицел в 3 м смотрит на
     него — gameworld открывает меню и включает анимацию крышки
     ============================================================ */
  function chestAim() {
    if (!inited || !_intRay || !_camera || !center2) return null;
    if (pad.open || vault || menu.open || uiBlocked()) return null;
    if (!window.BrixGame || BrixGame.state.phase !== 'playing') return null;
    if (!chestRecs.size) return null;
    _intRay.setFromCamera(center2, _camera);
    _intRay.far = 3.0;
    /* ✅ v0.4.41 ФИКС «СУНДУК ОТКРЫВАЕТСЯ СКВОЗЬ СТЕНУ»: раньше луч шёл
       ТОЛЬКО по сундукам — стена/дверь между игроком и сундуком луч не
       перехватывали, и сундук за стеной открывался на 3 м. Теперь в луче
       участвуют ВСЕ постройки + рельеф: сундук откроется, только если он
       ПЕРВОЕ, во что упёрся взгляд (стена ближе — сундук не открыть) */
    var targets = [];
    chestRecs.forEach(function (en) { if (en.group) targets.push(en.group); });
    var solids = rayTargets.slice();
    if (_terrainMesh) solids.push(_terrainMesh);
    targets = targets.concat(solids);
    var hits = _intRay.intersectObjects(targets, true);
    if (!hits.length) return null;
    var o = hits[0].object;
    while (o && !(o.userData && o.userData.bid && chestRecs.has(o.userData.bid))) {
      o = o.parent;
    }
    return o ? o.userData.bid : null;
  }
  /** содержимое сундука ({itemId: count}) или null — если это не сундук */
  function chestCont(id) {
    var en = chestRecs.get(id);
    return en ? (en.rec.cont || {}) : null;
  }
  /** сервер/сеть прислал свежее содержимое — обновляем живую запись */
  function setChestCont(id, cont) {
    var en = chestRecs.get(id);
    if (!en) return;
    en.rec.cont = cont || {};
    saveLocal();
  }
  /** анимация крышки: 1 — открыть, 0 — закрыть (плавно, в tick) */
  function chestLid(id, open) {
    var en = chestRecs.get(id);
    if (!en) return;
    en.target = open ? 1 : 0;
  }

  /* ---------- КЛАВИАТУРА КОДОВОГО ЗАМКА (как на референсе) ---------- */
  var pad = { open: false, mode: null, id: null, code: '', el: null, openedAt: 0 };
  function ensurePad() {
    if (pad.el) return;
    var el = document.createElement('div');
    el.id = 'brixPad';
    el.style.cssText = 'position:fixed;inset:0;z-index:72;display:none;' +
      'background:rgba(8,8,6,0.55);align-items:center;justify-content:center;';
    var btk = 'background:#2b2a26;border:1px solid #56524a;color:#efe9db;' +
      'font:20px/1 Consolas,monospace;width:56px;height:46px;margin:3px;' +
      'border-radius:5px;cursor:pointer;box-shadow:0 2px 0 #191713;';
    var html =
      '<div style="background:#171512;border:2px solid #5c564b;border-radius:10px;' +
      'width:246px;padding:14px 16px 16px;box-shadow:0 18px 60px rgba(0,0,0,.7);">' +
      '<div id="brixPadTitle" class="font-h" style="text-align:center;color:#e8dfc8;' +
      'font-size:11px;letter-spacing:.14em;margin-bottom:8px;"></div>' +
      '<div id="brixPadDisp" style="background:#0c0b09;border:1px solid #46413a;' +
      'border-radius:6px;color:#ffd23e;font:26px/1.4 Consolas,monospace;letter-spacing:.35em;' +
      'text-align:center;height:40px;margin-bottom:4px;"></div>' +
      '<div id="brixPadMsg" style="text-align:center;color:#9a948a;font:11px/1.6 ' +
      'Consolas,monospace;min-height:16px;margin-bottom:6px;"></div>' +
      '<div style="display:flex;justify-content:center;flex-wrap:wrap;">';
    var keys = ['7','8','9','4','5','6','1','2','3','0','C'];
    for (var i = 0; i < keys.length; i++) {
      html += '<button data-k="' + keys[i] + '" style="' + btk + '">' + keys[i] + '</button>';
    }
    html += '</div>' +
      '<div style="text-align:center;color:#6f6a60;font:10px Consolas,monospace;margin-top:8px;">' +
      L('цифры на клавиатуре · F/Esc — закрыть', 'keyboard digits · F/Esc — close') + '</div></div>';
    el.innerHTML = html;
    document.body.appendChild(el);
    el.addEventListener('mousedown', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('button[data-k]') : null;
      if (b) { ev.preventDefault(); padKey(b.getAttribute('data-k')); }
    });
    pad.el = el;
    pad.disp = el.querySelector('#brixPadDisp');
    pad.msg = el.querySelector('#brixPadMsg');
    pad.title = el.querySelector('#brixPadTitle');
  }
  function openPad(mode, id) {
    ensurePad();
    pad.open = true; pad.mode = mode; pad.id = id; pad.code = '';
    /* ✅ fix 0.4.12 «ПРОСТО ИГРАЕТ ЗВУК»: запоминаем время открытия —
       ТО ЖЕ САМОЕ нажатие F, что открыло клавиатуру, докатывается до
       слушателя padKeyDown (оба на document) и МГНОВЕННО закрывало
       панель: игрок видел только звук клика. Теперь F/Esc в первые
       250 мс после открытия игнорируются (см. padKeyDown) */
    pad.openedAt = performance.now();
    /* ✅ fix 0.4.11 «ОТКРЫВАЕТСЯ ПАУЗА»: раньше здесь был exitPointerLock —
       игра считала мышь «потерянной» и показывала СТАРОЕ мини-меню ПАУЗА
       («Кликните по экрану…») ПОВЕРХ клавиатуры замка. Теперь pointer lock
       НЕ трогаем: мышь и так отключена (controls.enabled=false при
       открытом pad), код вводится ЦИФРАМИ с клавиатуры, F/Esc — закрыть.
       Если игрок был в паузе — гасим её сами (onPad) */
    if (_onPad) _onPad(true);
    pad.el.style.display = 'flex';
    if (pad.title) {
      pad.title.textContent = mode === 'set'
        ? L('КОДОВЫЙ ЗАМОК · НОВЫЙ КОД', 'CODE LOCK · SET CODE')
        : L('КОДОВЫЙ ЗАМОК · ВВЕДИТЕ КОД', 'CODE LOCK · ENTER CODE');
    }
    padMsg('', '#9a948a');
    refreshPad();
    if (window.menuAudio) menuAudio.click();
  }
  function closePad() {
    if (!pad.open) return;
    pad.open = false;
    if (pad.el) pad.el.style.display = 'none';
    pad.code = '';
    /* ✅ fix 0.4.11: после закрытия возвращаем мышь в игру сами — игроку
       не нужно кликать по экрану паузы */
    if (_onPad) _onPad(false);
    if (window.menuAudio) menuAudio.click();
  }
  function padMsg(txt, color) {
    if (pad.msg) { pad.msg.textContent = txt || ''; pad.msg.style.color = color || '#9a948a'; }
  }
  function refreshPad() {
    if (pad.disp) pad.disp.textContent = pad.code || '····';
  }
  function padKey(k) {
    if (!pad.open) return;
    if (k === 'C') { pad.code = ''; padMsg('', '#9a948a'); refreshPad(); return; }
    if (pad.code.length >= 4) return;
    if (!/^[0-9]$/.test(k)) return;
    pad.code += k;
    refreshPad();
    if (pad.code.length === 4) setTimeout(padSubmit, 160);
  }
  function padSubmit() {
    if (!pad.open || pad.code.length !== 4) return;
    var rec = findRec(pad.id);
    if (pad.mode === 'set') {
      // ВЛАДЕЛЕЦ задаёт/меняет код: сервер сбрасывает «разгаданность» у всех
      if (window.BrixNet && BrixNet.mode === 'server') {
        BrixNet.send({ t: 'bcode', id: pad.id, code: pad.code });
      } else {
        if (rec) { rec.code = pad.code; rec.hc = 1; rec.unl = {}; updateLight(findEntry(rec.id)); }
        // «разгаданность» старого кода больше не действует (у других
        // вкладок то же самое сделает приходящий block → onBlock)
        delete myUnl[pad.id];
        if (window.BrixNet && BrixNet.mode === 'tabs') {
          BrixNet.send({ t: 'block', id: pad.id, hc: 1 });
        }
        saveLocal();
      }
      padMsg(L('Код сохранён — лампа горит красным', 'Code saved — lamp is red'), '#8fd07a');
      setTimeout(closePad, 500);
    } else {
      // ЧУЖОЙ вводит код
      if (window.BrixNet && BrixNet.mode === 'server') {
        BrixNet.send({ t: 'btry', id: pad.id, code: pad.code });
        padMsg(L('Проверяем…', 'Checking…'), '#cfc8bb');
      } else if (rec && String(rec.code || '') === pad.code) {
        myUnl[pad.id] = true;
        var en = findEntry(pad.id);
        if (en) setDoorLocal(en, 1);
        padMsg(L('Верно! Дверь открыта', 'Correct! Door opened'), '#8fd07a');
        setTimeout(closePad, 400);
      } else {
        padMsg(L('Неверный код', 'Wrong code'), '#e0685c');
        pad.code = '';
        refreshPad();
      }
    }
  }
  function padKeyDown(e) {
    if (!pad.open) return;
    /* ✅ fix 0.4.12: то же нажатие F, что ОТКРЫЛО панель, не должно её
       закрывать (см. openPad). Повторное нажатие (после 250 мс) работает */
    if ((e.code === 'Escape' || e.code === 'KeyF') &&
        performance.now() - pad.openedAt < 250) return;
    if (e.code === 'Escape' || e.code === 'KeyF') { closePad(); e.preventDefault(); return; }
    if (e.code === 'Backspace') { pad.code = pad.code.slice(0, -1); refreshPad(); e.preventDefault(); return; }
    var m = /^Digit([0-9])$/.exec(e.code) || /^Numpad([0-9])$/.exec(e.code);
    if (m) { padKey(m[1]); e.preventDefault(); }
  }

  /* ============================================================
     ✅ v0.4.10 ПЕРЕЛАЗ ЧЕРЕЗ ОКНО: прыжок в упор к окну —
     скриптовая анимация переносит игрока сквозь проём
     ============================================================ */
  var vault = null;
  var vaultCd = 0;
  function lerp(a, b, k) { return a + (b - a) * k; }
  /** плоскость окна: ось нормали, координата плоскости, центр по стене */
  function windowPlane(rec) {
    var half = CELL / 2;
    if (rec.e === 0) return { axis: 'z', plane: rec.gz * CELL - half, along0: rec.gx * CELL, top: rec.top };
    if (rec.e === 2) return { axis: 'z', plane: rec.gz * CELL + half, along0: rec.gx * CELL, top: rec.top };
    if (rec.e === 1) return { axis: 'x', plane: rec.gx * CELL + half, along0: rec.gz * CELL, top: rec.top };
    return { axis: 'x', plane: rec.gx * CELL - half, along0: rec.gz * CELL, top: rec.top };
  }
  function vaultTick(dt) {
    if (!_controls) return;
    if (vault) {
      // ИГРАЕТ АНИМАЦИЯ: управление заморожено, путь ведёт через проём
      vault.t += dt;
      var t = Math.min(1, vault.t / vault.dur);
      var perp;
      if (t < 0.42) perp = lerp(vault.s * 0.62, vault.s * 0.10, t / 0.42);
      else if (t < 0.58) perp = lerp(vault.s * 0.10, -vault.s * 0.12, (t - 0.42) / 0.16);
      else perp = lerp(-vault.s * 0.12, -vault.s * 0.80, (t - 0.58) / 0.42);
      var along = t < 0.5 ? lerp(vault.along0, 0, t / 0.5) : 0;
      var feet;
      if (t < 0.45) feet = lerp(vault.feet0, 1.12, t / 0.45);        // подъем к проёму
      else if (t < 0.62) feet = lerp(1.12, 1.00, (t - 0.45) / 0.17); // над подоконником
      else feet = lerp(1.00, vault.endFeet, (t - 0.62) / 0.38);      // спуск по ту сторону
      var wx = vault.axis === 'z' ? vault.along0 + along : vault.plane + perp;
      var wz = vault.axis === 'z' ? vault.plane + perp : vault.along0 + along;
      _controls.position.set(wx, vault.top + feet + EYE, wz);
      _controls._grounded = false;
      _controls._vy = 0;
      // камера: взгляд вверх при подъеме, вниз при спуске
      _controls.pitch = vault.pitch0 +
        (t < 0.5 ? 0.34 * Math.sin(t / 0.5 * Math.PI)
                 : -0.22 * Math.sin((t - 0.5) / 0.5 * Math.PI));
      if (t >= 1) {
        _controls.position.set(vault.endX, vault.top + vault.endFeet + EYE, vault.endZ);
        _controls._grounded = true;
        _controls._vy = 0;
        _controls.pitch = vault.pitch0;
        vaultCd = 1.2;
        vault = null;
      }
      return;
    }
    if (vaultCd > 0) { vaultCd -= dt; return; }
    if (!window.BrixGame || BrixGame.state.phase !== 'playing' || uiBlocked() || pad.open) return;
    var st = _controls.getMoveState ? _controls.getMoveState() : null;
    if (!st || !st.moving || st.onGround) return;   // надо ПРЫЖОК + движение
    var pos = _controls.position;
    var feetG = pos.y - EYE;
    var done = false;
    edgeRecs.forEach(function (en) {
      if (done || en.rec.ty !== 'wi') return;
      var pl = windowPlane(en.rec);
      var perp2 = pl.axis === 'z' ? pos.z - pl.plane : pos.x - pl.plane;
      var along2 = pl.axis === 'z' ? pos.x - pl.along0 : pos.z - pl.along0;
      var rf = feetG - pl.top;                     // ноги над низом стены
      if (rf < 0.30 || rf > 1.5) return;           // высота прыжка у окна
      if (Math.abs(perp2) > 0.62 || Math.abs(along2) > 1.05) return;  // в упор
      var s = perp2 >= 0 ? 1 : -1;
      var endPerp = -s * 0.80;                     // приземлиться по ту сторону
      var ex = pl.axis === 'z' ? pl.along0 : pl.plane + endPerp;
      var ez = pl.axis === 'z' ? pl.plane + endPerp : pl.along0;
      var fl = floorAt(ex, ez, pl.top + 0.6);
      /* ✅ fix 0.4.11 «КИДАЕТ В НЕБО»: раньше endFeet был АБСОЛЮТНОЙ мировой
         высотой (pl.top — уровень палубы), а ниже он ПРИБАВЛЯЛСЯ К НЕЙ ЖЕ
         ещё раз: position.y = top + endFeet + EYE → игрока взлетало на
         6+ м вверх в конце перелаза. Теперь приземление — ОТНОСИТЕЛЬНО
         палубы: берём самую высокую опору по ту сторону (палуба/рельеф/
         потолок) и считаем её ПРЕВЫШЕНИЕ над палубой (максимум 1.25 м) */
      var landing = Math.max(pl.top, _groundY ? _groundY(ex, ez) : 0,
        (fl !== null && fl !== undefined) ? fl : -1e9);
      var endFeet = Math.max(0, Math.min(1.25, landing - pl.top));
      vault = {
        axis: pl.axis, plane: pl.plane, top: pl.top,
        along0: Math.max(-0.5, Math.min(0.5, along2)),
        s: s, t: 0, dur: 0.95,
        feet0: Math.max(0.3, Math.min(1.4, rf)),
        endFeet: endFeet, endX: ex, endZ: ez,
        pitch0: _controls.pitch || 0
      };
      done = true;
    });
  }

  /** UI занят для игры: чужие меню + наша клавиатура + перелаз */
  function isUiBlocked() {
    return !!vault || pad.open || uiBlocked();
  }

  /* ---------- ✅ v0.4.10 ПУЛЯ: где её останавливает постройка.
     Возвращает {p, d} или null. В проёме окна/двери меша нет — пуля
     летит; стену/потолок/палубу/раму/полотно — ловит */
  var _bRay = null;
  function bulletBlock(origin, dir, maxDist) {
    if (!inited || !_bRay) return null;
    var targets = rayTargets.concat(solidMeshes);
    if (!targets.length) return null;
    _bRay.set(origin, dir);
    _bRay.far = maxDist || 140;
    var hits = _bRay.intersectObjects(targets, false);
    if (!hits.length) return null;
    return { p: hits[0].point, d: hits[0].distance };
  }

  /* ---------- сеть v0.4.10: дверь/замок живут на сервере ---------- */
  /* ✅ v0.4.31 СНОС ДОХОДИТ ДЛЯ ЛЮБОЙ ДЕТАЛИ: ищем в общем реестре
     pieceById (там и сундуки). Раньше findRec знал только сетку
     (фундаменты/стены/потолки) — сломанный на сервере СУНДУК оставался
     висеть у других игроков, хотя brem приходил */
  function onBrem(msg) {
    if (!msg || !msg.id) return;
    var en = pieceById.get(String(msg.id));
    if (en && en.rec) { removeRecord(en.rec); return; }
    removeRecord(findRec(msg.id));
  }

  /* ============================================================
     ✅ v0.4.31 ЛОМАНИЕ: API для gameworld
       hitTargets()  — группы деталей для луча удара (ЛКМ)
       findPiece(o)  — меш из луча -> { id, ty } (по userData.bid)
       pieceInfo(id) — { id, ty, group }
       localHit(id, tool) — локальный урон (соло/вкладки без сервера),
                            дробный: «1 хп за N ударов»
       setPieceHp(id, hp) — свежий остаток хп от сервера ('bhp') —
                            кормит ХП-бар прицела и бэкап localStorage
     ============================================================ */
  function hitTargets() {
    return hitGroups.slice();
  }
  function findPiece(o) {
    while (o && !(o.userData && o.userData.bid)) o = o.parent;
    if (!o) return null;
    var id = o.userData.bid;
    var en = pieceById.get(id);
    return { id: id, ty: en && en.rec ? en.rec.ty : null };
  }
  function pieceInfo(id) {
    var en = pieceById.get(String(id || ''));
    if (!en) return null;
    return { id: en.rec.id, ty: en.rec.ty, group: en.group };
  }
  function localHit(id, tool) {
    var en = pieceById.get(String(id || ''));
    if (!en) return null;
    var max = buildMaxHp(en.rec.ty);
    var dmg = BUILD_DMG[tool] || 0;
    if (!dmg) return null;
    /* ✅ v0.4.31: урон дробный, округляем до 0.001 — копится точно,
       «5 ударов каменным топором = ровно 1 хп» */
    var hp = Math.round(((pieceHp.get(en.rec.id) === undefined ?
      (en.rec.hp !== undefined ? en.rec.hp : max) : pieceHp.get(en.rec.id)) - dmg) * 1000) / 1000;
    if (hp <= 0) {
      removeRecord(en.rec);
      return { dead: true, id: en.rec.id, max: max };
    }
    pieceHp.set(en.rec.id, hp);
    en.rec.hp = hp;
    return { id: en.rec.id, hp: hp, max: max };
  }
  /* ✅ v0.4.31: остаток хп, присланное СЕРВЕРОМ ('bhp' — идёт всем игрокам,
     не только бьющему). Пишем и в pieceHp (ХП-бар прицела), и в rec.hp
     (бэкап localStorage), чтобы у каждого игрока были актуальные цифры */
  function setPieceHp(id, hp, max) {
    var k = String(id || '');
    if (!k || typeof hp !== 'number') return;
    var en = pieceById.get(k);
    if (max && typeof max === 'number' && hp > max) hp = max;
    pieceHp.set(k, hp);
    if (en && en.rec) en.rec.hp = hp;
  }
  /* ============================================================
     ✅ v0.4.31/0.4.32 ХП-БАР ПРИЦЕЛА: смотришь на постройку (≤ 6 м) — под
     прицелом появляется её полоса хп, и ТОЛЬКО ОДНОЙ — той, в которую
     смотришь (как в Rust). Отвёл взгляд — бар исчез. Отображается:
     название детали, полоса (зелёная → жёлтая → красная) и «хп / макс».
     Данные: pieceHp — обновляется из 'bhp' сервера (все игроки) и
     welcome-снимка; в соло/вкладках — localHit. Постройка при ударе
     НЕ шевелится — только бар меняется
     ============================================================ */
  var _hpRay = null;
  var hpBar = { el: null, name: null, fill: null, num: null, acc: 0, id: null };
  var PIECE_HP_NAME = {
    f: ['ФУНДАМЕНТ', 'FOUNDATION'], w: ['СТЕНА', 'WALL'],
    wi: ['ОКНО', 'WINDOW'], dw: ['ДВЕРНОЙ ПРОЁМ', 'DOORWAY'],
    dr: ['ДВЕРЬ', 'DOOR'], c: ['ПОТОЛОК', 'CEILING'], ch: ['СУНДУК', 'CHEST']
  };
  function ensureHpBar() {
    if (hpBar.el && hpBar.el.parentElement === uiHost()) return hpBar.el;
    if (hpBar.el && hpBar.el.parentElement) hpBar.el.parentElement.removeChild(hpBar.el);
    hpBar.name = null; hpBar.fill = null; hpBar.num = null;
    var el = document.createElement('div');
    el.id = 'brixBuildHpBar';
    el.style.cssText = 'position:fixed;left:50%;top:calc(50% + 38px);' +
      'transform:translateX(-50%);z-index:7;width:216px;pointer-events:none;display:none;';
    el.innerHTML =
      '<div id="brixBuildHpName" class="font-h" style="text-align:center;color:#f2e8cf;' +
      'font-size:11px;letter-spacing:.14em;text-transform:uppercase;' +
      'text-shadow:0 1px 3px rgba(0,0,0,.92);margin-bottom:4px;"></div>' +
      '<div style="height:10px;border-radius:5px;background:rgba(10,9,7,0.72);' +
      'border:1px solid rgba(255,255,255,0.28);box-shadow:0 2px 10px rgba(0,0,0,.55);' +
      'overflow:hidden;"><div id="brixBuildHpFill" style="height:100%;width:100%;' +
      'background:#7ec96b;transition:width .1s ease,background .1s ease;"></div></div>' +
      '<div id="brixBuildHpNum" style="margin-top:3px;text-align:center;color:#d8d2c4;' +
      'font:11px Consolas,monospace;text-shadow:0 1px 3px rgba(0,0,0,.92);"></div>';
    /* ✅ v0.4.32 fix: крепим в HUD (#gameHud), а не в <body> — раньше бар
       с z-index:7 оказывался ПОД #gameLayer (z-index:60, весь мир) и был
       НЕВИДИМ. Внутри #gameHud (z-index:62) бар выше прицела/хотбара,
       а пауза (z-index:64) всё равно накрывает его — как в Rust */
    uiHost().appendChild(el);
    hpBar.el = el;
    hpBar.name = el.querySelector('#brixBuildHpName');
    hpBar.fill = el.querySelector('#brixBuildHpFill');
    hpBar.num = el.querySelector('#brixBuildHpNum');
    return el;
  }
  /** «349.8 / 350»: целое — без дробной части, дробное — один знак */
  function fmtHpVal(hp, max) {
    if (hp >= max - 0.005) return String(max);
    var r = Math.round(Math.max(0, hp) * 10) / 10;
    if (Math.abs(r - Math.round(r)) < 0.049) return String(Math.round(r));
    return r.toFixed(1);
  }
  function hpBarHide() {
    if (hpBar.el && hpBar.el.style.display !== 'none') hpBar.el.style.display = 'none';
  }
  function hpBarTick(dt) {
    if (!inited) return;
    hpBar.acc -= dt;
    if (hpBar.acc <= 0) {
      hpBar.acc = 0.08;   // пересчёт прицела ~12 раз/с — плавно и дёшево
      hpBar.id = null;
      if (_hpRay && _camera && center2 && window.BrixGame &&
          BrixGame.state.phase === 'playing' && !isUiBlocked() && hitGroups.length) {
        _hpRay.setFromCamera(center2, _camera);
        _hpRay.far = 6.0;   // «рядом» — та же дистанция, что у сервера для bhit
        var hits = _hpRay.intersectObjects(hitGroups, true);
        if (hits.length) {
          var pc = findPiece(hits[0].object);
          if (pc && pc.id) hpBar.id = pc.id;
        }
      }
    }
    if (!hpBar.id) { hpBarHide(); return; }
    var en = pieceById.get(hpBar.id);
    if (!en || !en.rec) { hpBar.id = null; hpBarHide(); return; }   // сломали — бар исчез
    var max = buildMaxHp(en.rec.ty);
    var hp = pieceHp.has(hpBar.id) ? pieceHp.get(hpBar.id)
      : (en.rec.hp !== undefined ? en.rec.hp : max);
    if (hp > max) hp = max;
    ensureHpBar();
    var nm = PIECE_HP_NAME[en.rec.ty] || ['ПОСТРОЙКА', 'BUILD'];
    var nmTxt = L(nm[0], nm[1]);
    if (hpBar.name.textContent !== nmTxt) hpBar.name.textContent = nmTxt;
    var pct = Math.max(0, Math.min(100, hp / max * 100));
    var wTxt = pct.toFixed(1) + '%';
    if (hpBar.fill.style.width !== wTxt) hpBar.fill.style.width = wTxt;
    var col = pct > 60 ? '#7ec96b' : (pct > 30 ? '#e2b13c' : '#e05a4a');
    if (hpBar.fill.style.background !== col) hpBar.fill.style.background = col;
    var numTxt = fmtHpVal(hp, max) + ' / ' + max;
    if (hpBar.num.textContent !== numTxt) hpBar.num.textContent = numTxt;
    if (hpBar.el.style.display !== 'block') hpBar.el.style.display = 'block';
  }
  function onBdoor(msg) {
    if (!msg || !msg.id) return;
    var en = findEntry(msg.id);
    if (en) setDoorLocal(en, !!msg.open);
  }
  function onBlock(msg) {
    if (!msg || !msg.id) return;
    var rec = findRec(msg.id);
    if (!rec) return;
    rec.hc = msg.hc ? 1 : 0;
    if (rec.hc) delete myUnl[rec.id];   // владелец сменил код — все вводят заново
    updateLight(findEntry(rec.id));
  }
  function onDunl(msg) {
    if (!msg || !msg.id) return;
    myUnl[msg.id] = true;
    if (pad.open && pad.id === msg.id && pad.mode === 'enter') {
      padMsg(L('Верно! Дверь открыта', 'Correct! Door opened'), '#8fd07a');
      setTimeout(closePad, 350);
    }
  }
  function onBdenyD(msg) {
    if (pad.open && pad.mode === 'enter') {
      padMsg(L('Неверный код', 'Wrong code'), '#e0685c');
      pad.code = '';
      refreshPad();
      return;
    }
    /* ✅ fix 0.4.11: сервер ОТКАЗАЛ во включении двери (чужой закрытый
       замок) — раньше оптимистично открытая дверь ОСТАВАЛАСЬ открытой
       локально, только тост. Теперь: откат двери + СРАЗУ клавиатура
       кода (как в Rust: замок не пускает — вводи код) */
    if (lastTog && msg && lastTog.id === msg.id) {
      var en0 = findEntry(lastTog.id);
      if (en0) setDoorLocal(en0, !lastTog.to, true);
      lastTog = null;
      if (window.BrixHud) {
        BrixHud.toast(L('Замок: доступ запрещён — введите код', 'Lock: access denied — enter code'));
      }
      openPad('enter', msg.id);
      return;
    }
    if (window.BrixHud) BrixHud.toast(L('Замок: доступ запрещён', 'Lock: access denied'));
  }

  /* ============================================================
     РАДИАЛЬНОЕ МЕНЮ (как в референсе: колесо с деталями,
     в центре — выбранная). Работает под pointer lock: выбор
     НАПРАВЛЕНИЕМ мыши от центра экрана, ЛКМ — выбрать.
     ============================================================ */
  var menu = { open: false, el: null, segs: [], center: null, hover: -1, accX: 0, accY: 0 };

  function svgIcon(kind, size) {
    var s = size || 34;
    var stroke = 'fill="none" stroke="#e8e4da" stroke-width="1.5" stroke-linejoin="round"';
    if (kind === 'f') {
      // куб-фундамент
      return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24">' +
        '<path d="M12 3.2l8 4.4v8.8l-8 4.4-8-4.4V7.6l8-4.4z" ' + stroke + '/>' +
        '<path d="M12 12l8-4.4M12 12L4 7.6M12 12v8.8" ' + stroke + '/></svg>';
    }
    if (kind === 'w') {
      // стена-кладка
      return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24">' +
        '<rect x="3.5" y="4.5" width="17" height="15" ' + stroke + '/>' +
        '<path d="M3.5 9.5h17M3.5 14.5h17M9.2 4.5v5M14.8 9.5v5M9.2 14.5v5" ' + stroke + '/></svg>';
    }
    if (kind === 'wi') {
      // ✅ v0.4.10 окно: стена с квадратным проёмом
      return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24">' +
        '<rect x="3.5" y="4.5" width="17" height="15" ' + stroke + '/>' +
        '<rect x="8.5" y="9" width="7" height="6" ' + stroke + '/></svg>';
    }
    if (kind === 'dw') {
      // ✅ v0.4.10 дверной проём: стена с высоким проходом
      return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24">' +
        '<rect x="3.5" y="4.5" width="17" height="15" ' + stroke + '/>' +
        '<path d="M8.5 19.5v-9h7v9" ' + stroke + '/></svg>';
    }
    if (kind === 'ch') {
      // ✅ v0.4.22 сундук: крышка + щеколда
      return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24">' +
        '<path d="M4 12h16v7.5H4z" ' + stroke + '/>' +
        '<path d="M4 12v-2.2c0-1.2 1-2.2 2.2-2.2h11.6c1.2 0 2.2 1 2.2 2.2V12" ' + stroke + '/>' +
        '<path d="M10.5 12v3.2h3V12" ' + stroke + '/></svg>';
    }
    if (kind === 'dr') {
      // ✅ v0.4.10 дверь: полотно с ручкой, приоткрытая
      return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24">' +
        '<path d="M5 4.5h9.5v15H5z" ' + stroke + '/>' +
        '<path d="M14.5 4.5L19 7v10l-4.5 2.5" ' + stroke + '/>' +
        '<circle cx="12" cy="12.5" r="0.9" fill="#e8e4da"/></svg>';
    }
    // потолок: плита
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24">' +
      '<path d="M12 6.5l8.5 4.2L12 15 3.5 10.7 12 6.5z" ' + stroke + '/>' +
      '<path d="M3.5 10.7v3.6L12 18.5l8.5-4.2v-3.6" ' + stroke + '/></svg>';
  }

  function buildMenuDom() {
    var el = document.createElement('div');
    el.id = 'brixBuildMenu';
    el.style.cssText = 'position:fixed;inset:0;z-index:60;display:none;pointer-events:none;';
    var R = 118;   // радиус колеса
    var html = '<div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 46%,rgba(0,0,0,0.34),rgba(0,0,0,0.12) 55%,rgba(0,0,0,0));"></div>';
    html += '<div class="bwm-wrap" style="position:absolute;left:50%;top:46%;width:320px;height:320px;' +
      'transform:translate(-50%,-50%);">';
    // обод колеса
    html += '<div style="position:absolute;inset:22px;border-radius:50%;' +
      'background:radial-gradient(circle,rgba(24,23,20,0.28) 52%,rgba(24,23,20,0.62) 72%,rgba(24,23,20,0.1) 73%);' +
      'box-shadow:0 10px 44px rgba(0,0,0,0.5),inset 0 0 0 1px rgba(255,255,255,0.08);"></div>';
    // сегменты по кругу
    for (var i = 0; i < PIECES.length; i++) {
      var a = PIECE_ANGLES[i] * Math.PI / 180;
      var px = 160 + Math.cos(a) * R, py = 160 + Math.sin(a) * R;
      html += '<div class="bwm-seg" data-i="' + i + '" style="position:absolute;left:' + px + 'px;top:' + py + 'px;' +
        'transform:translate(-50%,-50%);width:74px;height:74px;border-radius:50%;' +
        'background:rgba(30,29,26,0.88);border:1px solid rgba(255,255,255,0.14);' +
        'display:flex;align-items:center;justify-content:center;' +
        'transition:transform .12s ease,border-color .12s ease,background .12s ease;">' +
        svgIcon(PIECES[i].id, 36) + '</div>';
    }
    // центр: выбранная деталь
    html += '<div class="bwm-center" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);' +
      'width:136px;height:136px;border-radius:50%;background:rgba(20,19,17,0.94);' +
      'border:1px solid rgba(255,255,255,0.16);display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;box-shadow:0 6px 26px rgba(0,0,0,0.55);">' +
      '<div class="bwm-cicon" style="line-height:0;"></div>' +
      '<div class="bwm-cname font-h" style="margin-top:6px;font-size:13px;letter-spacing:.14em;' +
      'text-transform:uppercase;color:#f2ead6;"></div></div>';
    html += '</div>';
    // подпись под колесом
    html += '<div class="bwm-desc" style="position:absolute;left:50%;top:calc(46% + 178px);' +
      'transform:translateX(-50%);max-width:420px;text-align:center;' +
      'color:#cfc8bb;font:12px/1.55 Consolas,monospace;text-shadow:0 1px 3px rgba(0,0,0,.9);"></div>';
    html += '<div style="position:absolute;left:50%;top:calc(46% + 206px);transform:translateX(-50%);' +
      'color:#8b918a;font:11px Consolas,monospace;text-shadow:0 1px 2px rgba(0,0,0,.9);">' +
      L('ЛКМ — выбрать · Z / Esc — закрыть', 'LMB — pick · Z / Esc — close') + '</div>';
    el.innerHTML = html;
    document.body.appendChild(el);
    menu.el = el;
    menu.segs = [];
    var segs = el.querySelectorAll('.bwm-seg');
    for (var s = 0; s < segs.length; s++) menu.segs.push(segs[s]);
    menu.center = el.querySelector('.bwm-center');
    paintMenuSelection();
  }

  function paintMenuSelection() {
    var idx = PIECES.map(function (p) { return p.id; }).indexOf(current);
    for (var i = 0; i < menu.segs.length; i++) {
      var hl = i === menu.hover || (menu.hover < 0 && i === idx);
      menu.segs[i].style.borderColor = hl ? '#e2572b' : 'rgba(255,255,255,0.14)';
      menu.segs[i].style.background = hl ? 'rgba(74,36,22,0.92)' : 'rgba(30,29,26,0.88)';
      menu.segs[i].style.transform = 'translate(-50%,-50%) scale(' + (hl ? 1.14 : 1) + ')';
    }
    var piece = PIECES[idx];
    if (menu.center) {
      menu.center.querySelector('.bwm-cicon').innerHTML = svgIcon(piece.id, 40);
      menu.center.querySelector('.bwm-cname').textContent =
        L(piece.name, piece.nameEn);
    }
    var desc = menu.el.querySelector('.bwm-desc');
    if (desc) desc.textContent = L(piece.desc, piece.descEn);
  }

  function openMenu() {
    if (menu.open) return;
    if (window.BrixGame.state.phase !== 'playing' || uiBlocked()) return;
    if (!menu.el) buildMenuDom();
    menu.open = true;
    menu.accX = 0; menu.accY = 0; menu.hover = -1;
    menu.el.style.display = 'block';
    paintMenuSelection();
    if (ghost.group) ghost.group.visible = false;
    if (window.menuAudio) menuAudio.click();
  }

  function closeMenu(silent) {
    if (!menu.open) return;
    menu.open = false;
    if (menu.el) menu.el.style.display = 'none';
    menu.hover = -1;
    if (!silent && window.menuAudio) menuAudio.click();
    if (window.BrixHud) {
      var piece = PIECES[PIECES.map(function (p) { return p.id; }).indexOf(current)];
      BrixHud.toast(L('Деталь: ' + piece.name + ' — ЛКМ ставит, глядя на место', 
        'Piece: ' + piece.nameEn + ' — aim and press LMB'), 3);
    }
  }

  function toggleMenu() {
    // ✅ Z работает ТОЛЬКО когда план строителя В РУКАХ
    if (!holdingPlan()) return;
    if (menu.open) closeMenu();
    else openMenu();
  }

  function menuMouseMove(e) {
    if (!menu.open) return;
    if (document.pointerLockElement) {
      // под pointer lock: копим дельты — направление от центра колеса
      menu.accX += e.movementX || 0;
      menu.accY += e.movementY || 0;
    } else {
      // без захвата: курсор сам указывает направление от центра экрана
      menu.accX = e.clientX - window.innerWidth / 2;
      menu.accY = e.clientY - window.innerHeight * 0.46;
    }
    var len = Math.hypot(menu.accX, menu.accY);
    if (len < 22) { menu.hover = -1; paintMenuSelection(); return; }
    var a = Math.atan2(menu.accY, menu.accX) * 180 / Math.PI;   // экранные: y вниз
    var best = -1, bestD = 1e9;
    for (var i = 0; i < PIECE_ANGLES.length; i++) {
      var d = Math.abs(((a - PIECE_ANGLES[i]) % 360 + 540) % 360 - 180);
      if (d < bestD) { bestD = d; best = i; }
    }
    menu.hover = bestD < 34 ? best : -1;   // 6 сегментов: окно выбора уже
    paintMenuSelection();
  }

  function menuClick() {
    if (!menu.open) return;
    if (menu.hover >= 0) {
      current = PIECES[menu.hover].id;
      rebuildGhost();
    }
    closeMenu();
  }

  /* ============================================================
     ПОДСКАЗКА НАД ХОТБАРОМ
     ============================================================ */
  var hintEl = null;
  function ensureHint() {
    if (hintEl) return hintEl;
    hintEl = document.createElement('div');
    hintEl.id = 'brixBuildHint';
    hintEl.style.cssText = 'position:absolute;left:50%;bottom:86px;transform:translateX(-50%);' +
      'z-index:6;color:#e8dfc8;font:12px/1.4 Consolas,monospace;text-shadow:0 1px 3px rgba(0,0,0,.9);' +
      'pointer-events:none;display:none;';
    (document.getElementById('gameHud') || document.body).appendChild(hintEl);
    return hintEl;
  }

  function updateHint() {
    var el = ensureHint();
    var on = holdingPlan() && !menu.open && window.BrixGame &&
      BrixGame.state.phase === 'playing' && !isUiBlocked();
    if (!on) { el.style.display = 'none'; return; }
    var piece = PIECES[PIECES.map(function (p) { return p.id; }).indexOf(current)];
    el.textContent = L('ПЛАН · ' + piece.name.toUpperCase() +
      ' — ЛКМ: поставить · Z: детали', 'PLAN · ' + piece.nameEn.toUpperCase() +
      ' — LMB: place · Z: pieces');
    el.style.display = 'block';
  }

  /* ============================================================
     ИНИЦИАЛИЗАЦИЯ / ТИК / ВЫКЛЮЧЕНИЕ
     ============================================================ */
  function init(opts) {
    if (inited) return;
    _scene = opts.scene;
    _camera = opts.camera;
    _terrainMesh = opts.terrainMesh;
    _groundY = opts.groundY;
    _controls = opts.controls;
    _getPos = opts.getPos || null;
    _quality = opts.quality || 'medium';
    _onPad = opts.onPad || null;   /* ✅ fix 0.4.11: пауза не мешает клавиатуре замка */
    try {
      myName = (window.BrixNet && BrixNet.NAME) || myName;
    } catch (e) { /* ник по умолчанию */ }

    WATER_LEVEL = (window.BrixTerrain && BrixTerrain.WATER_LEVEL) || 2.2;

    buildMaterials();
    ray = new THREE.Raycaster();
    center2 = new THREE.Vector2(0, 0);
    _intRay = new THREE.Raycaster();   // ✅ v0.4.10: луч F по двери/замку
    _bRay = new THREE.Raycaster();     // ✅ v0.4.10: луч пули по постройкам
    _hpRay = new THREE.Raycaster();    // ✅ v0.4.31: луч ХП-бара прицела
    rebuildGhost();

    // ✅ v0.4.9: СРАЗУ после сборки материалов/призрака — раньше inited
    // ставился В КОНЦЕ init(), и loadLocal() ниже молча терял ВСЕ
    // постройки из localStorage (applyRecord выходил по !inited) —
    // дом исчезал при каждом перезаходе без сервера. Теперь бэкап
    // применяется всегда; очередь pendingSnapshot — на случай,
    // если bnew/snapshot придёт между подпиской и этой строкой
    inited = true;

    // звуки строительства (3 сэмпла от пользователя, играют рандомно)
    if (window.BrixSfx) {
      BrixSfx.load('build1', sfxUrl('assets/sfx/build/Construction_Wooden_Build_03.wav'));
      BrixSfx.load('build2', sfxUrl('assets/sfx/build/Construction_Wooden_Build_04.wav'));
      BrixSfx.load('build3', sfxUrl('assets/sfx/build/Construction_Wooden_PickUp_04.wav'));
      BrixSfx.load('doorMove', sfxUrl('assets/sfx/wood/chop_2.wav'));   // ✅ v0.4.10
    }

    // сеть: постройки авторитетны у сервера; вкладки — через BroadcastChannel
    if (window.BrixNet) {
      BrixNet.on('bnew', onBnew);
      BrixNet.on('bdeny', onBdeny);
      // ✅ v0.4.10: дверь/замок — события сервера (и вкладок)
      BrixNet.on('brem', onBrem);
      BrixNet.on('bdoor', onBdoor);
      BrixNet.on('block', onBlock);
      BrixNet.on('dunl', onDunl);
      BrixNet.on('bcodedeny', onBdenyD);
      BrixNet.on('bdeny-d', onBdenyD);
      BrixNet.on('bwipe', onBwipe);   // ✅ v0.4.13: мир очищен батником
    }
    if (window.BrixNet && BrixNet.mode !== 'server') loadLocal();
    else {
      // серверный режим: localStorage — только страховка, снимок главнее.
      // Загружаем ПОКА снимок сервера не пришёл, чтобы дом был виден сразу
      loadLocal();
    }
    // ✅ v0.4.9: применяем постройки, пришедшие ДО готовности мира
    if (pendingSnapshot && pendingSnapshot.length) {
      var snap = pendingSnapshot;
      var snapEp = pendingEp;          // ✅ v0.4.13
      pendingSnapshot = null; pendingEp = 0;
      applySnapshot(snap, snapEp);
    }

    // мышь: меню выбора детали живёт на дельтах pointer lock
    document.addEventListener('mousemove', menuMouseMove);
    // ✅ v0.4.10: клавиатура кодового замка (цифры/F/Esc)
    document.addEventListener('keydown', padKeyDown);
    _onLockChange = function () {
      if (!document.pointerLockElement && menu.open) closeMenu(true);
    };
    document.addEventListener('pointerlockchange', _onLockChange);

    console.log('[BrixBuilding] v0.4.13 строительство готово: 6 деталей ' +
      '(фундамент/стена/окно/проём/дверь/потолок), окно — перелаз прыжком, ' +
      'дверь на F с кодовым замком (зелёная/красная лампа), ' +
      'всё сохраняется на сервере + localStorage-бэкап, ' +
      'epoch мира — очистка батником работает');
  }

  function sfxUrl(u) { return window.BrixAsset ? window.BrixAsset(u) : u; }
  var _onLockChange = null;
  var _onPad = null;          /* ✅ fix 0.4.11: колбэк «замок открыт/закрыт» из gameworld */

  function tick(dt) {
    if (!inited) return;
    if (placeCd > 0) placeCd = Math.max(0, placeCd - dt);
    // ✅ страховка: план убрали из рук — меню закрывается само
    if (menu.open && !holdingPlan()) closeMenu(true);
    updateGhost();
    updateHint();
    // ✅ v0.4.10: анимация дверей (плавное вращение полотна)
    doorEntries.forEach(function (en) {
      if (en.anim && en.leafPivot) {
        en.anim.t += dt;
        var k = Math.min(1, en.anim.t / 0.5);
        k = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;   // easeInOut
        en.leafPivot.rotation.y = en.anim.from + (en.anim.to - en.anim.from) * k;
        if (en.anim.t >= 0.5) { en.leafPivot.rotation.y = en.anim.to; en.anim = null; }
      }
    });
    /* ✅ v0.4.22: плавное открытие/закрытие крышек сундуков */
    chestRecs.forEach(function (en) {
      if (Math.abs(en.open - en.target) > 0.001) {
        en.open += (en.target - en.open) * Math.min(1, dt * 7);
        if (Math.abs(en.open - en.target) < 0.002) en.open = en.target;
        if (en.lidPivot) en.lidPivot.rotation.x = CHEST_OPEN_ANGLE * en.open;
      }
    });
    vaultTick(dt);          // перелаз через окно
    /* ✅ v0.4.32 fix: aim.t НИКОГДА не уменьшался — aimCheck(false) после
       первого вызова уходил в ранний return навсегда, и подсказка «F —
       ОТКРЫТЬ ДВЕРЬ» не появлялась НИКОГДА (F всё же открывал дверь,
       потому что interact() зовёт aimCheck(true) без троттлинга) */
    if (aim.t > 0) aim.t = Math.max(0, aim.t - dt);
    updateDoorHint();       // подсказка F у двери/замка
    hpBarTick(dt);          // ✅ v0.4.31: ХП-бар той постройки, в которую смотришь
  }

  function shutdown() {
    if (!inited) return;
    // ✅ v0.4.9: СНАЧАЛА бэкап в localStorage (пока записи живы),
    // потом teardown — дом не теряется при выходе в меню
    saveLocal();
    document.removeEventListener('mousemove', menuMouseMove);
    document.removeEventListener('keydown', padKeyDown);   // ✅ v0.4.10
    if (_onLockChange) document.removeEventListener('pointerlockchange', _onLockChange);
    if (ghost.group && _scene) _scene.remove(ghost.group);
    cellRecs.forEach(function (cell) {
      if (cell.f) destroyEntry(cell.f);
      if (cell.c) destroyEntry(cell.c);
    });
    edgeRecs.forEach(destroyEntry);
    cellRecs.clear(); edgeRecs.clear(); fTop.clear(); doorEntries.clear();
    rayTargets.length = 0; wallBoxes.length = 0; solidMeshes.length = 0;
    myUnl = {}; vault = null; vaultCd = 0; closePad();
    for (var tid in pendingPlace) { clearTimeout(pendingPlace[tid].timer); }
    pendingPlace = {};
    if (menu.el && menu.el.parentElement) menu.el.parentElement.removeChild(menu.el);
    menu.el = null; menu.open = false;
    if (hintEl && hintEl.parentElement) hintEl.parentElement.removeChild(hintEl);
    hintEl = null;
    if (doorHintEl && doorHintEl.parentElement) doorHintEl.parentElement.removeChild(doorHintEl);
    doorHintEl = null;
    /* ✅ v0.4.31: убрать ХП-бар прицела */
    if (hpBar.el && hpBar.el.parentElement) hpBar.el.parentElement.removeChild(hpBar.el);
    hpBar.el = null; hpBar.name = null; hpBar.fill = null; hpBar.num = null;
    hpBar.id = null; hpBar.acc = 0;
    _hpRay = null;
    _disposables.forEach(function (d) { if (d.dispose) d.dispose(); });
    _disposables.length = 0;
    _mat = null; _geo = null; _scene = null; _camera = null; _terrainMesh = null;
    ghost.group = null; ghost.mats = null; ray = null;
    inited = false;
  }

  return {
    init: init,
    tick: tick,
    shutdown: shutdown,
    floorAt: floorAt,
    wallBoxes: function () { return wallBoxes; },
    toggleMenu: toggleMenu,
    isMenuOpen: function () { return menu.open; },
    menuClick: menuClick,
    tryPlace: tryPlace,
    holdingPlan: holdingPlan,
    selectPiece: function (id) { current = id; if (inited) rebuildGhost(); },
    applySnapshot: applySnapshot,
    applyRecord: applyRecord,
    count: function () { return allRecords().length; },
    CURRENT: function () { return current; },
    /* ✅ v0.4.10: дверь/замок/окно */
    interact: interact,                 // F — дверь/замок (gameworld вызывает первой)
    /* ✅ v0.4.22: сундук-хранилище */
    chestAim: chestAim,                 // F наведён на сундук — вернуть его id (или null)
    chestCont: chestCont,               // содержимое сундука ({item: count}) или null
    setChestCont: setChestCont,         // обновить содержимое (сервер главнее)
    chestLid: chestLid,                 // крышка: 1 открыть, 0 закрыть (анимация в tick)
    /* ✅ v0.4.28: ломание построек (хп + удары) */
    hitTargets: hitTargets,             // группы деталей для луча ЛКМ
    findPiece: findPiece,               // меш -> { id, ty }
    pieceInfo: pieceInfo,               // id -> { id, ty, group } (ХП-плашка)
    localHit: localHit,                 // локальный урон (соло/вкладки)
    setPieceHp: setPieceHp,             // ✅ v0.4.31: хп от сервера ('bhp') — для ХП-бара
    piecesInRadius: piecesInRadius,     // ✅ v0.4.41: детали в радиусе взрыва С4
    bulletBlock: bulletBlock,           // где пуля встречает постройку
    isUiBlocked: isUiBlocked,           // клавиатура замка/перелаз — гасят движение
    applyUnl: applyUnl,                 // «какие замки я разгадал» из welcome
    findRec: findRec,
    doorCount: function () { var n = 0; doorEntries.forEach(function () { n++; }); return n; },
    /* внутренности для тестов (jsdom) */
    _test: function () {
      return {
        edgeRecs: edgeRecs, cellRecs: cellRecs, doorEntries: doorEntries,
        solidMeshes: solidMeshes, wallBoxes: wallBoxes, myUnl: myUnl,
        vault: function () { return vault; }, pad: pad,
        setVault: function (v) { vault = v; }, ownerKey: ownerKey,
        isOwner: isOwner, doorAuth: doorAuth, setDoorLocal: setDoorLocal,
        windowPlane: windowPlane, PIECES: PIECES,
        /* ✅ fix 0.4.11: план-функции и откат двери — для автотестов */
        planOnEdge: planOnEdge, planFoundation: planFoundation,
        planDoor: planDoor, planCeiling: planCeiling, fTop: fTop,
        toggleDoor: toggleDoor, lastTog: function () { return lastTog; },
        onBdenyD: onBdenyD, onBdoor: onBdoor, myNick: myNick,
        /* ✅ fix 0.4.12: клавиатура замка — тест потока клавиш F */
        openPad: openPad, closePad: closePad, padKeyDown: padKeyDown,
        interact: interact, onBdeny: onBdeny,
        /* ✅ v0.4.18: тесты очистки построек (bwipe/nofound-страховка) */
        onBwipe: onBwipe, removeGhostCell: removeGhostCell,
        /* ✅ v0.4.22: тесты сундука */
        chestRecs: chestRecs, applyChest: applyChest, planChest: planChest,
        chestAim: chestAim, chestCont: chestCont, setChestCont: setChestCont,
        chestLid: chestLid, removeRecord: removeRecord,
        serverEp: function () { return serverEp; },
        backupEp: function () { return backupEp; },
        pendingSnapshot: function () { return pendingSnapshot; },
        setInited: function (v) { inited = !!v; }
      };
    }
  };
})();
