// ============================================================
//  brix • js/game/building.js
//  ✅ v0.4.6 СТРОИТЕЛЬСТВО (как в Rust: план строителя)
//
//  - ПРЕДМЕТ «План строителя» в хотбаре (слот 7). В руках — синий
//    ватман-свиток (см. firstperson.js). Z открывает меню ТОЛЬКО с
//    планом в руках.
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
//  - КОЛЛИЗИИ: стены — AABB-коллайдеры (сквозь них не пройти);
//    по палубе фундамента и по потолку можно ХОДИТЬ (floorAt с
//    шагом-ступенькой, как у площадок чекблоков).
//  - СИНХРОНИЗАЦИЯ: постройки АВТОРИТЕТНЫ У СЕРВЕРА (server.js):
//    заявка bplace → сервер проверяет правила (фундамент под стеной,
//    стена под потолком, дедуп клетки/края) → bnew ВСЕМ. Снапшот
//    идёт в welcome (objs.bd) — новые игроки сразу видят дом.
//    Хранение — world-objs.json: дом ПЕРЕЖИВАЕТ перезапуск сервера.
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

  /* ---------- детали ---------- */
  var PIECES = [
    { id: 'f', name: 'Фундамент', nameEn: 'Foundation',
      desc: 'Палуба на четырёх толстых ногах. Следует рельефу, магнитится к соседнему',
      descEn: 'A deck on four thick posts. Follows terrain, snaps to a neighbour' },
    { id: 'w', name: 'Стена', nameEn: 'Wall',
      desc: 'Ставится на один из четырёх краёв фундамента',
      descEn: 'Snaps to one of the four foundation edges' },
    { id: 'c', name: 'Потолок', nameEn: 'Ceiling',
      desc: 'Накрывает клетку, у которой есть стена',
      descEn: 'Covers a cell that has a wall' }
  ];
  // углы деталей на колесе (экранные, 0° = вправо): как в референсе
  // фундамент выделен справа, стена слева-снизу, потолок слева-сверху
  var PIECE_ANGLES = [0, 130, 230];

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
    _mat = {
      deck: new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.88, metalness: 0.02 }),
      wall: new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9, metalness: 0.02 }),
      ceil: new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.92, metalness: 0.02 }),
      post: new THREE.MeshStandardMaterial({ map: postTex, roughness: 0.95, metalness: 0.0 }),
      beam: new THREE.MeshStandardMaterial({ map: postTex, roughness: 0.95, metalness: 0.0,
        color: 0xb9a288 })
    };
    _disposables.push(deckTex, wallTex, ceilTex, postTex);
    _geo = {
      deck: new THREE.BoxGeometry(CELL, DECK_T, CELL),
      wall: new THREE.BoxGeometry(CELL, WALL_H, WALL_T),
      wbeam: new THREE.BoxGeometry(CELL + 0.05, 0.16, WALL_T + 0.06),
      ceil: new THREE.BoxGeometry(CELL, CEIL_T, CELL),
      joist: new THREE.BoxGeometry(CELL, 0.15, 0.2),
      dbeamX: new THREE.BoxGeometry(CELL + 0.1, 0.1, 0.16),
      dbeamZ: new THREE.BoxGeometry(0.16, 0.1, CELL + 0.1),
      post: new THREE.CylinderGeometry(POST_R, POST_R * 1.18, 1, 10)
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

  /** стена: плита + горизонтальная балка. Локальный ноль — низ стены */
  function buildWallGroup(rec) {
    var g = new THREE.Group();
    var slab = shadow(new THREE.Mesh(_geo.wall, _mat.wall));
    slab.position.y = WALL_H / 2;
    g.add(slab);
    var beam = shadow(new THREE.Mesh(_geo.wbeam, _mat.beam));
    beam.position.y = WALL_H * 0.48;
    g.add(beam);
    var e = rec.e;
    var X0 = rec.gx * CELL, Z0 = rec.gz * CELL, half = CELL / 2;
    if (e === 0) { g.position.set(X0, rec.top, Z0 - half); }
    else if (e === 2) { g.position.set(X0, rec.top, Z0 + half); }
    else if (e === 1) { g.position.set(X0 + half, rec.top, Z0); g.rotation.y = Math.PI / 2; }
    else { g.position.set(X0 - half, rec.top, Z0); g.rotation.y = Math.PI / 2; }
    return { group: g, slab: slab };
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

  /* ---------- реестр: применение/удаление записи ---------- */
  function destroyEntry(entry) {
    if (!entry) return;
    if (entry.group && _scene) _scene.remove(entry.group);
    var ri = rayTargets.indexOf(entry.deck || entry.slab);
    if (ri >= 0) rayTargets.splice(ri, 1);
  }

  function rebuildAux() {
    // полы/потолки читаются прямо из cellRecs (floorAt); здесь — коллайдеры:
    // СТЕНЫ (полная высота) и ПАЛУБЫ (бок: под палубой не пройти насквозь,
    // но сверху feet > maxY-0.1 — ходьба по палубе не блокируется)
    wallBoxes.length = 0;
    edgeRecs.forEach(function (entry) {
      var r = entry.rec;
      var X0 = r.gx * CELL, Z0 = r.gz * CELL, half = CELL / 2, t2 = WALL_T / 2;
      if (r.e === 0 || r.e === 2) {
        wallBoxes.push({ minX: X0 - half, maxX: X0 + half,
          minZ: Z0 - t2, maxZ: Z0 + t2,
          minY: r.top, maxY: r.top + WALL_H, active: true });
      } else {
        wallBoxes.push({ minX: X0 - t2, maxX: X0 + t2,
          minZ: Z0 - half, maxZ: Z0 + half,
          minY: r.top, maxY: r.top + WALL_H, active: true });
      }
    });
    cellRecs.forEach(function (cell) {
      if (cell.f) {
        var r2 = cell.f.rec, cx = r2.gx * CELL, cz = r2.gz * CELL, h2 = CELL / 2;
        wallBoxes.push({ minX: cx - h2, maxX: cx + h2,
          minZ: cz - h2, maxZ: cz + h2,
          minY: r2.top - 1.15, maxY: r2.top, active: true });
      }
    });
  }

  /** поставить запись у себя (оптимистично или от сервера/вкладки) */
  function applyRecord(b, opts) {
    opts = opts || {};
    if (!b || !inited) return null;
    var cellKey = key(b.gx, b.gz);
    var canon, ekey;

    if (b.ty === 'w') {
      canon = canonicalEdge(b.gx, b.gz, b.e);
      ekey = key(canon.gx, canon.gz) + ',' + canon.e;
      var ex = edgeRecs.get(ekey);
      if (ex) {
        // тот же край: если id отличается (локальный → серверный) — тихо
        // заменяем id, меш уже стоит; если id совпал — просто эхо
        ex.rec.id = b.id;
        return ex.rec;
      }
    } else {
      if (!cellRecs.has(cellKey)) cellRecs.set(cellKey, { f: null, c: null });
      var cell = cellRecs.get(cellKey);
      var slot = b.ty === 'f' ? 'f' : 'c';
      if (cell[slot]) {
        if (cell[slot].rec.id === b.id) return cell[slot].rec;   // эхо
        // ключ тот же, id новый (локальная → серверная): переставляем id
        cell[slot].rec.id = b.id;
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

    // звук: свои — сразу; чужие — с затуханием по дистанции
    if (!opts.silent) {
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
    var cellKey = key(rec.gx, rec.gz);
    if (rec.ty === 'w') {
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
    return out;
  }

  /* ============================================================
     СИНХРОНИЗАЦИЯ
     ============================================================ */
  var LS_KEY = 'brix-builds-v1';

  function applySnapshot(list) {
    (list || []).forEach(function (b) { applyRecord(b, { silent: true }); });
  }

  function saveLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(allRecords())); }
    catch (e) { /* недоступно — играем без сохранения вкладок */ }
  }

  function loadLocal() {
    try {
      var a = JSON.parse(localStorage.getItem(LS_KEY));
      if (Array.isArray(a) && a.length) applySnapshot(a);
    } catch (e) { /* нет сохранения */ }
  }

  function onBnew(msg) {
    if (!msg || !msg.b) return;
    var remote = msg.pid !== (window.BrixNet && BrixNet.id);
    applyRecord(msg.b, { remote: remote });
    // подтверждение своей оптимистичной постройки
    for (var tid in pendingPlace) {
      var p = pendingPlace[tid];
      if (p.rec.ty === msg.b.ty && p.rec.gx === msg.b.gx &&
          p.rec.gz === msg.b.gz && (p.rec.ty !== 'w' || p.rec.e === msg.b.e)) {
        clearTimeout(p.timer);
        delete pendingPlace[tid];
      }
    }
    if (window.BrixNet && BrixNet.mode !== 'server') saveLocal();
  }

  function onBdeny(msg) {
    var p = pendingPlace[msg && msg.tid];
    if (!p) return;
    clearTimeout(p.timer);
    delete pendingPlace[msg.tid];
    removeRecord(p.rec);
    if (window.BrixHud) {
      var why = { busy: L('Здесь уже стоит постройка', 'Occupied'),
        nofound: L('Под постройкой должен быть фундамент', 'Needs a foundation below'),
        nowall: L('Сначала поставь стену', 'Place a wall first'),
        spam: L('Слишком быстро', 'Too fast') }[msg.why] ||
        L('Сервер не дал построить', 'Server denied the build');
      BrixHud.toast(why);
    }
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

  /** план для СТЕНЫ по точке прицела (и мешу, в который попали) */
  function planWall(P, hit) {
    var gx, gz;
    // если попали в палуду/стену — берём её клетку
    var viaMesh = null, o = hit && hit.object;
    while (o) {
      if (o.userData && o.userData.bcell) { viaMesh = o.userData.bcell; break; }
      o = o.parent;
    }
    if (viaMesh) {
      var parts = viaMesh.split(',');
      gx = parseInt(parts[0], 10); gz = parseInt(parts[1], 10);
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
    if (edgeRecs.has(ekey)) return { valid: false, why: 'busy' };
    // ✅ МАГНИТ К КРАЮ: стена встаёт ровно на край фундамента
    return { valid: true, ty: 'w', gx: gx, gz: gz, e: e, top: anchorCell.f.rec.top };
  }

  /** план для ПОТОЛКА: клетка должна иметь фундамент И хотя бы одну стену */
  function planCeiling(P, hit) {
    var gx, gz;
    var viaEdge = null, o2 = hit && hit.object;
    while (o2) {
      if (o2.userData && o2.userData.bedge) { viaEdge = o2.userData.bedge; break; }
      o2 = o2.parent;
    }
    if (viaEdge) {
      var pp = viaEdge.split(',');
      gx = parseInt(pp[0], 10); gz = parseInt(pp[1], 10);
    } else {
      gx = Math.round(P.x / CELL); gz = Math.round(P.z / CELL);
    }
    var cell = cellRecs.get(key(gx, gz));
    if (!cell || !cell.f) return { valid: false, why: 'nofound' };
    if (cell.c) return { valid: false, why: 'busy' };
    // есть ли стена на любом из 4 краёв клетки (канонические ключи)
    var hasWall = edgeRecs.has(key(gx, gz) + ',0') ||
                  edgeRecs.has(key(gx, gz) + ',3') ||
                  edgeRecs.has(key(gx, gz + 1) + ',0') ||
                  edgeRecs.has(key(gx + 1, gz) + ',3');
    if (!hasWall) return { valid: false, why: 'nowall' };
    return { valid: true, ty: 'c', gx: gx, gz: gz, top: Math.round((cell.f.rec.top + WALL_H) * 100) / 100 };
  }

  function holdingPlan() {
    try {
      var inv = window.BrixInventory && BrixInventory.get();
      if (!inv) return false;
      var it = inv.getSelectedItem();
      return !!(it && it.tool === 'plan');
    } catch (e) { return false; }
  }

  function uiBlocked() {
    return !!((window.BrixInventory && BrixInventory.get() && BrixInventory.get().isOpen) ||
      (window.BrixLootMenu && BrixLootMenu.isOpen()) ||
      (window.BrixMiniMenu && BrixMiniMenu.isAnyOpen()));
  }

  function updateGhost() {
    if (!ghost.group) return;
    var active = holdingPlan() && !menu.open && !uiBlocked() &&
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
      ghost.group.visible = false;
      ghost.shown = false;
      ghost.plan = null;
      return;
    }
    var P = hits[0].point;
    var plan;
    if (current === 'f') plan = planFoundation(P);
    else if (current === 'w') plan = planWall(P, hits[0]);
    else plan = planCeiling(P, hits[0]);
    if (!plan) { ghost.group.visible = false; ghost.shown = false; return; }
    ghost.plan = plan;
    ghost.valid = !!plan.valid;
    if (current === 'w') {
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
    if (window.BrixGame.state.phase !== 'playing' || menu.open || uiBlocked()) return;
    if (placeCd > 0 || !ghost.shown || !ghost.plan || !ghost.plan.valid) return;
    var plan = ghost.plan;
    placeCd = PLACE_CD;
    var tid = 'T' + Math.random().toString(36).slice(2, 9);
    var rec = { id: 'L' + (++localSeq), ty: plan.ty, gx: plan.gx, gz: plan.gz,
      top: plan.top, by: myName, at: Date.now() };
    if (plan.ty === 'w') rec.e = plan.e;
    applyRecord(rec);                        // у себя — СРАЗУ (оптимистично)
    if (window.BrixNet && BrixNet.mode === 'server') {
      pendingPlace[tid] = { rec: rec };
      BrixNet.sendBplace(plan.ty, plan.gx, plan.gz, plan.e, plan.top, tid);
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
    menu.hover = bestD < 66 ? best : -1;
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
      BrixGame.state.phase === 'playing' && !uiBlocked();
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
    try {
      myName = (window.BrixNet && BrixNet.NAME) || myName;
    } catch (e) { /* ник по умолчанию */ }

    WATER_LEVEL = (window.BrixTerrain && BrixTerrain.WATER_LEVEL) || 2.2;

    buildMaterials();
    ray = new THREE.Raycaster();
    center2 = new THREE.Vector2(0, 0);
    rebuildGhost();

    // звуки строительства (3 сэмпла от пользователя, играют рандомно)
    if (window.BrixSfx) {
      BrixSfx.load('build1', sfxUrl('assets/sfx/build/Construction_Wooden_Build_03.wav'));
      BrixSfx.load('build2', sfxUrl('assets/sfx/build/Construction_Wooden_Build_04.wav'));
      BrixSfx.load('build3', sfxUrl('assets/sfx/build/Construction_Wooden_PickUp_04.wav'));
    }

    // сеть: постройки авторитетны у сервера; вкладки — через BroadcastChannel
    if (window.BrixNet) {
      BrixNet.on('bnew', onBnew);
      BrixNet.on('bdeny', onBdeny);
    }
    if (window.BrixNet && BrixNet.mode !== 'server') loadLocal();
    else {
      // серверный режим: localStorage — только страховка, снимок главнее.
      // Загружаем ПОКА снимок сервера не пришёл, чтобы дом был виден сразу
      loadLocal();
    }

    // мышь: меню выбора детали живёт на дельтах pointer lock
    document.addEventListener('mousemove', menuMouseMove);
    _onLockChange = function () {
      if (!document.pointerLockElement && menu.open) closeMenu(true);
    };
    document.addEventListener('pointerlockchange', _onLockChange);

    inited = true;
    console.log('[BrixBuilding] v0.4.6 строительство готово: фундамент/стена/потолок, ' +
      'Z — меню (только с планом), ЛКМ — поставить');
  }

  function sfxUrl(u) { return window.BrixAsset ? window.BrixAsset(u) : u; }
  var _onLockChange = null;

  function tick(dt) {
    if (!inited) return;
    if (placeCd > 0) placeCd = Math.max(0, placeCd - dt);
    // ✅ страховка: план убрали из рук — меню закрывается само
    if (menu.open && !holdingPlan()) closeMenu(true);
    updateGhost();
    updateHint();
  }

  function shutdown() {
    if (!inited) return;
    document.removeEventListener('mousemove', menuMouseMove);
    if (_onLockChange) document.removeEventListener('pointerlockchange', _onLockChange);
    if (ghost.group && _scene) _scene.remove(ghost.group);
    cellRecs.forEach(function (cell) {
      if (cell.f) destroyEntry(cell.f);
      if (cell.c) destroyEntry(cell.c);
    });
    edgeRecs.forEach(destroyEntry);
    cellRecs.clear(); edgeRecs.clear(); fTop.clear();
    rayTargets.length = 0; wallBoxes.length = 0;
    for (var tid in pendingPlace) { clearTimeout(pendingPlace[tid].timer); }
    pendingPlace = {};
    if (menu.el && menu.el.parentElement) menu.el.parentElement.removeChild(menu.el);
    menu.el = null; menu.open = false;
    if (hintEl && hintEl.parentElement) hintEl.parentElement.removeChild(hintEl);
    hintEl = null;
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
    CURRENT: function () { return current; }
  };
})();
