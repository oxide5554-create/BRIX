// ============================================================
//  brix • js/game/props.js
//  ✅ v0.3.7 ЧЕКБЛОКИ 1-в-1 ИЗ РЕПОЗИТОРИЯ (oxide5554-create/-glm,
//  scr/world/locations/checkblock.js + scr/world/boch.js):
//  - ЧЕКБЛОК: грязное пятно, 1 предмет-декорация (СТИРАЛКА /
//    ХОЛОДИЛЬНИК / ЭЛТ-ТЕЛЕВИЗОР), 2-3 ЛОМАЮЩИЕСЯ бочки
//    (одна лежит + разлив), ящик с лутом (wooden/military GLB),
//    мусор: доски, ветки, банки, картон, покрышка, кирпичи
//  - ОДИНОЧНЫХ бочек и ящиков на карте больше НЕТ — всё лутаемое
//    живёт только в чекблоках (как просил игрок)
//  - ФИКС «БОЧКИ НЕ ЛОМАЮТСЯ»: у каждой бочки ПОЛНЫЙ ХИТБОКС —
//    невидимый цилиндр (material.visible=false — не рендерится,
//    но raycast ловит, проверено на three r158). Раньше луч
//    проходил сквозь редкие меши GLB и удар «терялся»
//  - ДРОПЫ: СКРАП (rust_scrap_v2.glb) и МЕТАЛ ФРАГМЕНТ
//    (ржавые пластины в стиле репозитория) — крутятся над землёй
//  - ВСЁ СИНХРОННО: HP/разбитие/дропы/лут считает СЕРВЕР,
//    игрок шлёт заявки (bhit/btake/cbtake)
//  Данные приходят из welcome (objs) и сообщений bhp/brk/btaken/cbtaken.
// ============================================================
window.BrixProps = (function () {
  'use strict';

  var BARREL_URL = 'assets/models/barrel_rust.glb';
  var SCRAP_URL = 'assets/models/scrap.glb';
  var WOODEN_URL = 'assets/models/wooden_crate.glb';
  var MILITARY_URL = 'assets/models/military_crate.glb';

  var H = Math.PI / 2, TAU = Math.PI * 2;

  var _scene = null;
  var _groundY = function (x, z) { return 0; };
  var _barrelProto = null;   // THREE.Group (GLB) или null → процедурная
  var _scrapProto = null;
  var _woodenProto = null;
  var _milProto = null;
  var _pendingBarrels = [];  // группы, ждущие GLB (как в репозитории)
  var _pendingScraps = [];
  var _pendingCrates = [];   // {group, mil}

  var barrels = {};          // id -> {id, x, z (МИРОВЫЕ), group, hp, brk, shakeT}
  var drops = {};            // id -> {id, kind, x, z, amt, group, t}
  var crates = {};           // id -> {id, x, z, hitbox, taken}
  var barrelMeshes = [];     // группы бочек — для raycast
  var crateMeshes = [];      // невидимые хитбоксы ящиков — для raycast
  var debris = [];           // обломки разбитых бочек (визуал, не синхронится)
  var cbPads = [];           // ✅ v0.3.9: ровные площадки чекблоков — ходьба по ним
                             // [{x, z, top}] — top = высота плоской вершины насыпи

  /* ---------- детерминированный rng (тот же, что у сервера) ---------- */

  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---------- общая текстура грязи/потёков (порт из репозитория) ---------- */

  var _dirt = null;
  function dirtTex() {
    if (_dirt) return _dirt;
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 128, 128);
    for (var i = 0; i < 260; i++) {
      x.fillStyle = 'rgba(' + (60 + Math.random() * 50 | 0) + ',' + (40 + Math.random() * 30 | 0) + ',20,' + (Math.random() * 0.13) + ')';
      x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 14, 0, TAU); x.fill();
    }
    for (var j = 0; j < 40; j++) {
      x.fillStyle = 'rgba(80,45,15,' + (0.08 + Math.random() * 0.15) + ')';
      x.fillRect(Math.random() * 128, 0, 1 + Math.random() * 3, 20 + Math.random() * 100);
    }
    _dirt = new THREE.CanvasTexture(c); _dirt.wrapS = _dirt.wrapT = THREE.RepeatWrapping;
    if (THREE.SRGBColorSpace) _dirt.colorSpace = THREE.SRGBColorSpace;
    return _dirt;
  }
  function mk(c, r, m, map) {
    return new THREE.MeshStandardMaterial({
      color: c, roughness: r === undefined ? 0.8 : r, metalness: m || 0,
      map: (map === false) ? null : dirtTex()
    });
  }

  /* ---------- геометрические помощники (порт из репозитория) ---------- */

  function at(p, o, x, y, z) {
    o.position.set(x || 0, y || 0, z || 0); p.add(o); return o;
  }
  function cyl(r1, r2, h, m, seg) {
    if (!isFinite(r1) || r1 <= 0) r1 = 0.01;
    if (!isFinite(r2) || r2 <= 0) r2 = 0.01;
    if (!isFinite(h) || h <= 0) h = 0.01;
    return new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg || 16), m);
  }
  function rbox(w, h, d, r, m) { // скруглённый параллелепипед (скос кромок)
    var bv = Math.min(r, d * 0.25, w * 0.25, h * 0.25),
        W = w - 2 * bv, Hh = h - 2 * bv, rr = Math.max(0.002, r - bv);
    var x = -W / 2, y = -Hh / 2, s = new THREE.Shape();
    s.moveTo(x + rr, y); s.lineTo(x + W - rr, y); s.quadraticCurveTo(x + W, y, x + W, y + rr);
    s.lineTo(x + W, y + Hh - rr); s.quadraticCurveTo(x + W, y + Hh, x + W - rr, y + Hh);
    s.lineTo(x + rr, y + Hh); s.quadraticCurveTo(x, y + Hh, x, y + Hh - rr);
    s.lineTo(x, y + rr); s.quadraticCurveTo(x, y, x + rr, y);
    var g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * bv, bevelEnabled: true, bevelSize: bv, bevelThickness: bv, bevelSegments: 2, curveSegments: 5 });
    g.translate(0, 0, -(d - 2 * bv) / 2); return new THREE.Mesh(g, m);
  }
  var _up = new THREE.Vector3(0, 1, 0);
  function seg(p, a, b, r1, r2, m) { // конический сегмент между точками (ветки)
    var d = b.clone().sub(a), o = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, d.length(), 7), m);
    o.position.copy(a).add(b).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(_up, d.normalize()); p.add(o);
  }

  /* ====================== ПРЕДМЕТЫ (порт из репозитория) ====================== */

  function washer(rn) {
    var g = new THREE.Group(), white = mk(0xd8dad4, 0.5, 0.12), gray = mk(0x7d8185, 0.45, 0.6), light = mk(0xb9bcb8, 0.5, 0.2), dark = mk(0x17191c, 0.7, 0.1, false);
    var glass = new THREE.MeshStandardMaterial({ color: 0x2c4a5c, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.5 });
    var lcd = new THREE.MeshStandardMaterial({ color: 0x0b2a1a, emissive: 0x1fa060, emissiveIntensity: 0.6 });
    at(g, rbox(0.6, 0.84, 0.6, 0.035, white), 0, 0.46, 0);
    at(g, rbox(0.62, 0.03, 0.62, 0.015, gray), 0, 0.895, 0);
    at(g, rbox(0.56, 0.13, 0.03, 0.012, light), 0, 0.77, 0.305);
    at(g, cyl(0.036, 0.04, 0.03, gray), -0.2, 0.77, 0.33).rotation.x = H;
    at(g, new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.028, 0.004), dark), -0.2, 0.785, 0.347);
    for (var i = 0; i < 3; i++) at(g, cyl(0.014, 0.014, 0.012, dark), -0.07 + i * 0.045, 0.76, 0.322).rotation.x = H;
    at(g, rbox(0.1, 0.04, 0.012, 0.005, lcd), 0.12, 0.77, 0.322);
    at(g, rbox(0.11, 0.075, 0.012, 0.006, dark), 0.22, 0.77, 0.322);
    // отверстие и барабан
    at(g, cyl(0.2, 0.2, 0.08, dark, 28), 0, 0.4, 0.3).rotation.x = H;
    at(g, cyl(0.17, 0.17, 0.02, gray, 28), 0, 0.4, 0.26).rotation.x = H;
    // дверца на петле (приоткрыта)
    var door = new THREE.Group(); door.position.set(-0.24, 0.4, 0.315); door.rotation.y = -rn(0.15, 1.25); g.add(door);
    at(door, new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.034, 12, 32), gray), 0.24, 0, 0);
    var dome = at(door, new THREE.Mesh(new THREE.SphereGeometry(0.19, 24, 12, 0, TAU, 0, H), glass), 0.24, 0, -0.005);
    dome.rotation.x = H; dome.scale.set(1, 0.55, 1);
    at(door, new THREE.Mesh(new THREE.TorusGeometry(0.188, 0.012, 8, 28), light), 0.24, 0, -0.01);
    at(door, rbox(0.03, 0.09, 0.04, 0.012, gray), 0.47, 0, 0.03);
    for (var s = -1; s <= 1; s += 2) at(door, cyl(0.012, 0.012, 0.05, gray, 8), 0, s * 0.1, 0);
    for (var k = 0; k < 4; k++) {
      var cc = [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]][k];
      at(g, cyl(0.025, 0.03, 0.03, dark, 10), cc[0], 0.015, cc[1]);
    }
    g.rotation.z = rn(-0.03, 0.03);
    return { g: g, r: 0.45 };
  }

  function fridge(rn) {
    var g = new THREE.Group(), body = mk(0x9ec7b5, 0.45, 0.15), chrome = mk(0xcfd3d6, 0.25, 0.8), dark = mk(0x15181b, 0.8, 0, false), shelf = mk(0xc9cfd1, 0.4, 0.3);
    at(g, rbox(0.7, 1.66, 0.68, 0.045, body), 0, 0.88, 0);
    at(g, rbox(0.66, 0.06, 0.02, 0.01, dark), 0, 1.2, 0.345);                // щель между дверцами
    at(g, rbox(0.68, 0.5, 0.05, 0.025, body), 0, 1.44, 0.35);                // морозилка
    at(g, cyl(0.011, 0.011, 0.26, chrome, 8), 0.28, 1.36, 0.4);
    for (var y1 = 0; y1 < 2; y1++) at(g, cyl(0.008, 0.008, 0.05, chrome, 8), 0.28, 1.36, 0.38).rotation.x = H;
    at(g, rbox(0.1, 0.03, 0.01, 0.005, mk(0xd9a524, 0.3, 0.7)), -0.2, 1.6, 0.378);   // шильдик
    // нижняя дверь — приоткрыта, внутри полки
    at(g, rbox(0.62, 1.0, 0.02, 0.01, dark), 0, 0.64, 0.335);
    for (var i = 0; i < 4; i++) at(g, rbox(0.58, 0.015, 0.05, 0.005, shelf), 0, 0.28 + i * 0.26, 0.345);
    var door = new THREE.Group(); door.position.set(-0.345, 0.64, 0.355); door.rotation.y = -rn(0.35, 1.0); g.add(door);
    at(door, rbox(0.68, 1.06, 0.055, 0.025, body), 0.345, 0, 0);
    at(door, cyl(0.011, 0.011, 0.5, chrome, 8), 0.6, 0.15, 0.05);
    for (var y2 = 0; y2 < 2; y2++) at(door, cyl(0.008, 0.008, 0.05, chrome, 8), 0.6, -0.05 + y2 * 0.4, 0.035).rotation.x = H;
    for (var j = 0; j < 3; j++) at(door, rbox(0.56, 0.012, 0.05, 0.005, shelf), 0.345, -0.3 + j * 0.28, -0.045);
    for (var k = 0; k < 4; k++) {
      var cc = [[-0.28, -0.26], [0.28, -0.26], [-0.28, 0.26], [0.28, 0.26]][k];
      at(g, cyl(0.03, 0.035, 0.04, dark, 10), cc[0], 0.02, cc[1]);
    }
    g.rotation.z = rn(-0.02, 0.02);
    return { g: g, r: 0.5 };
  }

  function tv(rn) {
    var g = new THREE.Group(), wood = mk(0x5a3a22, 0.6, 0.05), black = mk(0x131415, 0.5, 0.2, false), plank = mk(0x7a5a38, 0.85);
    var glass = new THREE.MeshStandardMaterial({ color: 0x1b3b3b, roughness: 0.12, metalness: 0.35, emissive: 0x06201f });
    // паллета
    for (var i = -1; i <= 1; i++) at(g, rbox(0.09, 0.09, 0.9, 0.01, plank), i * 0.45, 0.045, 0);
    for (var p = 0; p < 5; p++) at(g, rbox(1.0, 0.02, 0.15, 0.005, plank), 0, 0.1, -0.36 + p * 0.18);
    var y0 = 0.11, t = new THREE.Group(); t.position.y = y0; t.rotation.y = rn(-0.5, 0.5); g.add(t);
    at(t, rbox(0.64, 0.52, 0.5, 0.035, wood), 0, 0.26, 0);
    at(t, rbox(0.54, 0.43, 0.04, 0.02, black), -0.04, 0.27, 0.25);
    var scr = at(t, new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), glass), -0.04, 0.27, 0.235); scr.scale.set(0.235, 0.18, 0.07);
    at(t, rbox(0.1, 0.38, 0.02, 0.008, black), 0.26, 0.27, 0.255);                  // панель справа
    for (var y1 = 0; y1 < 2; y1++) at(t, cyl(0.026, 0.028, 0.03, mk(0xc9c5b8, 0.4, 0.4), 14), 0.26, 0.4 - y1 * 0.1, 0.275).rotation.x = H;
    for (var s = 0; s < 5; s++) at(t, new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, 0.01), mk(0x2a2a2a, 0.9, 0, false)), 0.26, 0.2 - s * 0.025, 0.268);
    // антенна «рожки»
    at(t, new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 8, 0, TAU, 0, H), black), 0, 0.52, 0);
    for (var s2 = -1; s2 <= 1; s2 += 2) {
      var r = at(t, cyl(0.004, 0.003, 0.55, mk(0xb8bcc0, 0.3, 0.9, false), 6), s2 * 0.17, 0.78, 0);
      r.rotation.z = -s2 * 0.6;
      at(t, new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 6), black), s2 * 0.34, 1.02, 0);
    }
    g.rotation.y = rn(0, TAU);
    return { g: g, r: 0.55 };
  }
  var ITEMS = { washer: washer, fridge: fridge, tv: tv };

  /* ====================== МУСОР (порт из репозитория) ====================== */

  function mud(rn, rad, col, op) {
    var geo = new THREE.CircleGeometry(1, 24), p = geo.attributes.position;
    for (var i = 1; i < p.count; i++) {
      var k = rn(0.7, 1.15); p.setXY(i, p.getX(i) * k, p.getY(i) * k);
    }
    var o = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col || 0x3a2c1e, roughness: 1, transparent: true, opacity: op === undefined ? 0.85 : op, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    o.rotation.x = -H; o.scale.set(rad * rn(0.8, 1.2), rad * rn(0.8, 1.2), 1); return o;
  }
  function plank(rn) {
    var g = new THREE.Group(), L = rn(0.5, 1.3), W = rn(0.09, 0.16),
        c = [0x7a5a38, 0x8a6a44, 0x6a4c2e, 0x5e4a36][rn(0, 4) | 0];
    at(g, rbox(L, 0.025, W, 0.006, mk(c, 0.9)), 0, 0.0125, 0);
    for (var s = -1; s <= 1; s += 2) if (rn(0, 1) < 0.6) at(g, cyl(0.007, 0.007, 0.012, mk(0x333333, 0.5, 0.8, false), 6), s * (L / 2 - 0.05), 0.03, 0);
    return g;
  }
  function branch(rn) {
    var g = new THREE.Group(), m = mk(0x4e3a28, 0.95);
    var p = new THREE.Vector3(), d = new THREE.Vector3(1, 0, rn(-0.2, 0.2)).normalize(), r = 0.022;
    for (var i = 0; i < 3; i++) {
      var q = p.clone().addScaledVector(d, rn(0.25, 0.45)); seg(g, p, q, r, r * 0.7, m);
      if (i > 0 && rn(0, 1) < 0.85) seg(g, q, q.clone().add(new THREE.Vector3(rn(0.05, 0.15), rn(0.02, 0.1), rn(-0.18, 0.18))), r * 0.5, r * 0.2, m);
      p = q; r *= 0.7; d.y += rn(-0.1, 0.15); d.z += rn(-0.3, 0.3); d.normalize();
    }
    g.position.y = 0.02; return g;
  }
  function can(rn) {
    var g = new THREE.Group(), c = [0xb0b4b8, 0xa83a2a, 0x2f5f8f, 0x8a8d90][rn(0, 4) | 0];
    at(g, cyl(0.033, 0.033, 0.11, mk(c, 0.35, 0.8, false), 12), 0, 0, 0);
    at(g, cyl(0.03, 0.03, 0.012, mk(0x888b8e, 0.3, 0.9, false), 12), 0, 0.056, 0);
    g.rotation.z = H + rn(-0.2, 0.2); g.position.y = 0.033; return g;
  }
  function cardboard(rn) {
    var g = new THREE.Group(), m = mk(0xb08a58, 0.95);
    at(g, rbox(0.5, 0.3, 0.4, 0.008, m), 0, 0.15, 0);
    at(g, rbox(0.5, 0.012, 0.2, 0.004, m), 0, 0.31, 0.2).rotation.x = -0.7;
    at(g, rbox(0.5, 0.012, 0.2, 0.004, m), 0, 0.31, -0.2).rotation.x = 0.9;
    g.rotation.set(rn(-0.12, 0.12), 0, rn(-0.12, 0.12)); return g;
  }
  function tire() {
    var g = new THREE.Group(), t = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.11, 14, 28), mk(0x1c1c1e, 0.95, 0, false));
    t.rotation.x = H; t.position.y = 0.11; g.add(t);
    at(g, cyl(0.2, 0.2, 0.05, mk(0x6a6d70, 0.5, 0.6, false), 20), 0, 0.09, 0); return g;
  }
  function brick(rn) {
    var o = rbox(0.2, 0.065, 0.1, 0.006, mk(0x8a4a38 + (rn(0, 1) * 0x101010 | 0), 0.95));
    o.position.y = 0.033; o.rotation.set(rn(-0.2, 0.2), rn(0, TAU), rn(-0.2, 0.2)); return o;
  }

  /* ---------- процедурные fallback-модели (пока GLB не готов) ---------- */

  function mkBarrelFallback() {
    var g = new THREE.Group();
    var body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 1.05, 14),
      new THREE.MeshStandardMaterial({ color: 0x6b5a3f, roughness: 0.75, metalness: 0.45 }));
    body.position.y = 0.52;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    for (var i = 0; i < 2; i++) {
      var rib = new THREE.Mesh(
        new THREE.TorusGeometry(0.43, 0.035, 6, 16),
        new THREE.MeshStandardMaterial({ color: 0x4a3d2c, roughness: 0.8, metalness: 0.5 }));
      rib.rotation.x = Math.PI / 2;
      rib.position.y = 0.32 + i * 0.4;
      g.add(rib);
    }
    return g;
  }

  function mkCrateFallback(mil) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.72, 0.68),
      new THREE.MeshStandardMaterial({ color: mil ? 0x4a5548 : 0x8a6a44, roughness: 0.85, metalness: mil ? 0.25 : 0.05 }));
    body.position.y = 0.36;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    var lid = new THREE.Mesh(
      new THREE.BoxGeometry(1.04, 0.06, 0.72),
      new THREE.MeshStandardMaterial({ color: mil ? 0x3a4238 : 0x6e5233, roughness: 0.85 }));
    lid.position.y = 0.73;
    g.add(lid);
    for (var i = -1; i <= 1; i += 2) {
      var band = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.74, 0.7),
        new THREE.MeshStandardMaterial({ color: 0x4a4a4c, roughness: 0.6, metalness: 0.5 }));
      band.position.set(i * 0.32, 0.36, 0);
      g.add(band);
    }
    return g;
  }

  function mkMetalFragment() {
    // ✅ v0.3.7 метал фрагмент: ржавые пластины + болт (GLB фрагмента
    //    в репозитории нет — модель в стиле репозитория, rusty metal)
    var g = new THREE.Group();
    var rust1 = new THREE.MeshStandardMaterial({ color: 0x9a5a30, roughness: 0.6, metalness: 0.65 });
    var rust2 = new THREE.MeshStandardMaterial({ color: 0x74451f, roughness: 0.7, metalness: 0.55 });
    var steel = new THREE.MeshStandardMaterial({ color: 0x5a5d63, roughness: 0.4, metalness: 0.8 });
    var p1 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.016, 0.15), rust1);
    p1.rotation.set(0.1, 0.5, -0.06); p1.castShadow = true; g.add(p1);
    var p2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.014, 0.11), rust2);
    p2.position.set(0.09, 0.03, 0.05); p2.rotation.set(-0.15, -0.7, 0.1); p2.castShadow = true; g.add(p2);
    var p3 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.08), steel);
    p3.position.set(-0.08, 0.02, -0.06); p3.rotation.set(0.2, 1.1, 0.05); p3.castShadow = true; g.add(p3);
    var bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 8), steel);
    bolt.position.set(0.02, 0.05, 0.02); bolt.rotation.set(1.2, 0.4, 0.3); bolt.castShadow = true; g.add(bolt);
    var nut = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 6), rust2);
    nut.position.set(-0.03, 0.04, 0.09); nut.castShadow = true; g.add(nut);
    return g;
  }

  /* ✅ v0.3.8: ТРУБА — ржавая, с фланцами (падает из бочек).
     GLB трубы в репозитории нет (там она только иконкой scr/ui/icons/pipe.webp),
     поэтому модель в стиле репозитория */
  function mkPipeModel() {
    var g = new THREE.Group();
    var rust = new THREE.MeshStandardMaterial({ color: 0x8a5a38, roughness: 0.65, metalness: 0.6 });
    var dark = new THREE.MeshStandardMaterial({ color: 0x5d4a33, roughness: 0.7, metalness: 0.55 });
    var pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 10), rust);
    pipe.rotation.z = H; pipe.position.y = 0.05; pipe.castShadow = true; g.add(pipe);
    for (var i = -1; i <= 1; i += 2) {
      var fl = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 10), dark);
      fl.rotation.z = H; fl.position.set(i * 0.2, 0.05, 0); fl.castShadow = true; g.add(fl);
    }
    var pipe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.3, 10), dark);
    pipe2.rotation.z = H + 0.45; pipe2.position.set(0.06, 0.05, 0.08); pipe2.castShadow = true; g.add(pipe2);
    return g;
  }

  /* ✅ v0.3.8: ПРУЖИНА — стальная спираль (лут ящиков чекблоков) */
  function mkSpringModel() {
    var g = new THREE.Group();
    var steel = new THREE.MeshStandardMaterial({ color: 0x82868c, roughness: 0.38, metalness: 0.85 });
    var coil = new THREE.Group();
    for (var i = 0; i < 6; i++) {
      var t = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.02, 8, 18), steel);
      t.rotation.x = H; t.position.y = 0.02 + i * 0.045;
      t.castShadow = true; coil.add(t);
    }
    coil.rotation.z = 0.55; coil.position.y = 0.10; g.add(coil);
    return g;
  }

  /* ✅ v0.4.2: СКРАП — крупная груда ржавого металла (0.32 м), собирается
     кодом, ВИДИМА всегда. Раньше клон scrap.glb был мелкий и терялся
     на фоне насыпи — игроку казалось, что дроп «не виден» */
  function mkScrapModel() {
    var g = new THREE.Group();
    var rust1 = new THREE.MeshStandardMaterial({ color: 0x9a5a30, roughness: 0.62, metalness: 0.62 });
    var rust2 = new THREE.MeshStandardMaterial({ color: 0x74451f, roughness: 0.72, metalness: 0.5 });
    var dark = new THREE.MeshStandardMaterial({ color: 0x55534e, roughness: 0.55, metalness: 0.72 });
    var pieces = [
      [0.30, 0.05, 0.22, 0, 0.028, 0, 0.06, 0.4, -0.04, rust1],
      [0.22, 0.05, 0.16, 0.12, 0.075, 0.08, -0.18, 0.9, 0.12, rust2],
      [0.18, 0.045, 0.14, -0.11, 0.07, -0.06, 0.22, 1.4, -0.16, dark],
      [0.12, 0.05, 0.09, 0.02, 0.115, -0.05, -0.3, 2.1, 0.2, rust1],
      [0.10, 0.035, 0.12, -0.05, 0.045, 0.10, 0.5, 0.2, -0.3, dark]
    ];
    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i];
      var m = new THREE.Mesh(new THREE.BoxGeometry(p[0], p[1], p[2]), p[9]);
      m.position.set(p[3], p[4], p[5]);
      m.rotation.set(p[6], p[7], p[8]);
      m.castShadow = true;
      g.add(m);
    }
    return g;
  }

  function mkScrapFallback() {
    var g = new THREE.Group();
    var m = new THREE.MeshStandardMaterial({ color: 0x6e7075, roughness: 0.45, metalness: 0.75 });
    for (var i = 0; i < 4; i++) {
      var p = new THREE.Mesh(new THREE.BoxGeometry(0.16 + (i % 3) * 0.05, 0.04, 0.05), m);
      p.position.set((Math.random() - 0.5) * 0.16, 0.02 + i * 0.015, (Math.random() - 0.5) * 0.16);
      p.rotation.set((Math.random() - 0.5) * 0.6, Math.random() * Math.PI, (Math.random() - 0.5) * 0.6);
      g.add(p);
    }
    return g;
  }

  function placeGltf(proto, targetLen) {
    // нормализуем размер прототипа (как в репозитории: bbox → targetLen)
    proto.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(proto);
    var size = box.getSize(new THREE.Vector3());
    var len = Math.max(size.x, size.y, size.z);
    if (len > 0.001) proto.scale.multiplyScalar(targetLen / len);
    proto.updateMatrixWorld(true);
    var box2 = new THREE.Box3().setFromObject(proto);
    proto.position.y -= box2.min.y;
    proto.updateMatrixWorld(true);
  }

  /* ---------- предзагрузка GLB ---------- */

  function loadProto(url, targetLen, done) {
    if (!window.BrixGLB) { done(null); return; }
    BrixGLB.load(url, function (group) {
      try { placeGltf(group, targetLen); } catch (e) { done(null); return; }
      done(group);
    }, function () { done(null); });
  }

  function preload() {
    loadProto(BARREL_URL, 0.9, function (g) {          // ✅ 0.9 — как в репозитории (TARGET_LEN)
      _barrelProto = g;
      _flushPending(_pendingBarrels, g, false);
    });
    loadProto(SCRAP_URL, 0.3, function (g) {
      _scrapProto = g;
      _flushPending(_pendingScraps, g, false);
    });
    loadProto(WOODEN_URL, 1.0, function (g) { _woodenProto = g; _flushCrates(false); });
    loadProto(MILITARY_URL, 1.0, function (g) { _milProto = g; _flushCrates(false); });
  }

  // отложенная замена процедурных моделей на GLB (порт из репозитория)
  function _flushPending(list, proto) {
    if (!proto) { list.length = 0; return; }
    list.forEach(function (group) {
      while (group.children.length) group.remove(group.children[0]);
      var clone = proto.clone(true);
      clone.traverse(function (o) {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
      });
      group.add(clone);
    });
    list.length = 0;
  }

  function _crateModel(mil) {
    var proto = mil ? _milProto : _woodenProto;
    if (proto) {
      var clone = proto.clone(true);
      clone.traverse(function (o) {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true;
          if (o.material) { o.material = o.material.clone(); o.material.side = THREE.DoubleSide; }
        }
      });
      return clone;
    }
    return null;
  }

  function _flushCrates() {
    if (!_woodenProto && !_milProto) return;
    _pendingCrates.forEach(function (pc) {
      while (pc.group.children.length) pc.group.remove(pc.group.children[0]);
      var m = _crateModel(pc.mil);
      pc.group.add(m || mkCrateFallback(pc.mil));
    });
    _pendingCrates.length = 0;
  }

  /* ---------- ЛОМАЮЩАЯСЯ БОЧКА (порт createBreakableBarrel) ---------- */

  function createBreakableBarrel() {
    var group = new THREE.Group();
    if (_barrelProto) {
      var clone = _barrelProto.clone(true);
      clone.traverse(function (o) {
        if (o.isMesh && o.material) o.material = o.material.clone();
      });
      group.add(clone);
    } else {
      group.add(mkBarrelFallback());
      _pendingBarrels.push(group);
    }
    group.userData.isBreakableBarrel = true;
    // ✅ ФИКС «БОЧКИ НЕ ЛОМАЮТСЯ»: ПОЛНЫЙ ХИТБОКС — невидимый цилиндр,
    //    покрывающий ВСЮ бочку. material.visible=false → не рендерится,
    //    но raycast работает (проверено на three r158).
    //    Раньше удар ловили только редкие меши GLB → бочка «не ломалась».
    var hitbox = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 1.0, 12),
      new THREE.MeshBasicMaterial({ visible: false }));
    hitbox.position.y = 0.5;
    hitbox.userData.isBarrelHitbox = true;
    group.add(hitbox);
    return group;
  }

  /* ---------- сборка ---------- */

  function tagInteractable(root, info) {
    root.traverse(function (o) {
      if (o.isMesh) {
        o.userData.brixProp = info;
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  function build(objs, opts) {
    _scene = opts.scene;
    _groundY = opts.groundY || _groundY;
    if (opts.clear !== false) clearAll();

    var cb = (objs && objs.cb) || [];
    cb.forEach(function (c) { buildCheckblock(c, !!c.taken); });

    var dr = (objs && objs.dr) || [];
    dr.forEach(function (d) { spawnDrop(d); });
  }

  /** мировые координаты локальной точки чекблока (та же математика, что у сервера) */
  function cbWorld(c, lx, lz) {
    var cos = Math.cos(c.rot || 0), sin = Math.sin(c.rot || 0);
    return { x: c.x + lx * cos + lz * sin, z: c.z - lx * sin + lz * cos };
  }

  function buildCheckblock(c, taken) {
    // ✅ v0.3.8: ТОЛЬКО РОВНАЯ СУХАЯ ЗЕМЛЯ (просьба игрока: «чтобы ничего
    //    не проходило сквозь землю и не летало»). Замеряем высоты центра
    //    и кольца R=3.8: под водой или на склоне чекблок НЕ строим.
    //    Проверка детерминированная (heightAt одинаков у всех клиентов),
    //    поэтому «бракованные» позиции не видит никто — рассинхрона нет
    var y0 = _groundY(c.x, c.z);
    var hMax = y0, hMin = y0;
    for (var si = 0; si < 8; si++) {
      var sa = si / 8 * TAU;
      var sh = _groundY(c.x + Math.cos(sa) * 3.8, c.z + Math.sin(sa) * 3.8);
      if (sh > hMax) hMax = sh;
      if (sh < hMin) hMin = sh;
    }
    if (window.BrixTerrain && hMax < (BrixTerrain.WATER_LEVEL || 2.2) + 1.0) return;
    if (hMax - hMin > 3.2) return;   // очень крутой склон → объекты «летали»
    var y = hMax - 0.05;             // чуть ниже самой высокой точки — ничего не тонет

    var g = new THREE.Group();
    // ✅ v0.3.8: земляная НАСЫПЬ вместо плоского пятна — заполняет рельеф
    //    под чекблоком (высота подстраивается под склон), сверху ровно
    var moundH = (hMax - hMin) + 1.0;
    var moundMat = new THREE.MeshStandardMaterial({
      color: 0x9a7b52, roughness: 1.0, metalness: 0.0, map: dirtTex(),
      // ✅ лёгкая подсветка теневой стороны: иначе насыпь на склоне
      //    против солнца читается чёрной стеной (см. скрин)
      emissive: 0x2e2416, emissiveIntensity: 0.6
    });
    var mound = new THREE.Mesh(
      new THREE.CylinderGeometry(4.4, 5.4, moundH, 26),
      moundMat);
    mound.position.y = 0.09 - moundH / 2;   // верх насыпи на +0.09, низ ниже hMin
    mound.receiveShadow = true;
    g.add(mound);
    var pad = mud(rn0(c), 4.2, 0x3f3122, 0.5); pad.position.y = 0.095; g.add(pad);

    // всё содержимое стоит на ровной площадке (local y = 0.09 над насыпью)
    var flat = new THREE.Group(); flat.position.y = 0.09; g.add(flat);

    // ✅ раскладка мусора/техники — детерминированный rng по seed
    //    сервера: у всех игроков чекблок выглядит ОДИНАКОВО
    var R = mulberry(c.seed || 12345), rn = function (a, b) { return a + R() * (b - a); };

    // главный предмет (стиралка / холодильник / телевизор)
    var name = ITEMS[c.item] ? c.item : 'washer';
    var it = ITEMS[name](rn); it.g.rotation.y += rn(0, TAU); flat.add(it.g);

    // ✅ 2-3 ЛОМАЮЩИЕСЯ бочки (раскладку прислал СЕРВЕР): одна лежит + разлив
    var bar = c.bar || [];
    bar.forEach(function (b) {
      var barrel = createBreakableBarrel();
      tagInteractable(barrel, { kind: 'barrel', id: b.id });
      var w = cbWorld(c, b.lx, b.lz);
      if (b.lying) {
        barrel.position.y = -0.45;
        var lay = new THREE.Group(); lay.add(barrel);
        lay.rotation.z = H; lay.position.y = 0.3;
        var holder = new THREE.Group(); holder.add(lay);
        holder.rotation.y = b.wy || 0; holder.position.set(b.lx, 0, b.lz);
        var spill = mud(rn, 0.55, 0x15110c, 0.8); spill.position.set(-0.75, 0.006, 0);
        holder.add(spill);
        flat.add(holder);
      } else {
        barrel.position.set(b.lx, 0, b.lz);
        barrel.rotation.y = b.wy || 0;
        flat.add(barrel);
      }
      barrels[b.id] = {
        id: b.id, x: w.x, z: w.z, group: barrel,
        /* ✅ v0.4.44: бочки 6 хп (камень 6 ударов / железо 4 / булава 1); старые
           сохранения с hp 2 подтягиваются до 6 (визуал урона делится на 6) */
        hp: (b.brk ? 0 : (b.hp !== undefined ? Math.max(b.hp, 6) : 6)),
        brk: !!b.brk, shakeT: 0, lying: !!b.lying
      };
      if (b.brk) barrel.visible = false;
      else barrelMeshes.push(barrel);
      if (b.hp !== undefined && b.hp < 6) applyDmgVisual(barrels[b.id]);
    });

    // ящик с лутом (wooden/military GLB из репозитория) — лут-меню по F
    var ca = rn(0, TAU), cd = rn(1.5, 2.3);
    var cx = Math.cos(ca) * cd, cz = Math.sin(ca) * cd;
    var cw = cbWorld(c, cx, cz);   // ✅ мировая позиция ящика — по ней ловится F
    var crate = new THREE.Group();
    var cm = _crateModel(c.mil);
    if (!cm) { cm = mkCrateFallback(c.mil); _pendingCrates.push({ group: crate, mil: c.mil }); }
    crate.add(cm);
    crate.position.set(cx, 0, cz);
    crate.rotation.y = rn(0, TAU);
    flat.add(crate);
    // невидимый хитбокс ящика (как в репозитории) — по нему ловится прицел
    var hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.9, 0.9),
      new THREE.MeshBasicMaterial({ visible: false }));
    hitbox.position.set(cx, 0.45, cz);
    tagInteractable(hitbox, { kind: 'cb', id: c.id });
    flat.add(hitbox);
    var gone = !!c.gone;
    crates[c.id] = { id: c.id, x: cw.x, z: cw.z, hitbox: hitbox, group: crate,
      gone: gone, loot: c.loot || null, mil: c.mil ? 1 : 0 };
    if (gone) {
      crate.visible = false;
      hitbox.userData.brixProp.dead = true;
    } else {
      crateMeshes.push(hitbox);
    }

    // мусор (как в репозитории)
    var scatter = function (o, rMin, rMax, yy) {
      var a = rn(0, TAU), d = rn(rMin, rMax);
      o.position.x += Math.cos(a) * d; o.position.z += Math.sin(a) * d;
      o.position.y += yy || 0; o.rotation.y += rn(0, TAU); flat.add(o); return o;
    };
    for (var i = 0; i < 3; i++) { var m = mud(rn, rn(0.5, 1.1)); m.position.y = 0.005 + i * 0.001; scatter(m, 0.5, 3.2); }
    var nPl = 5 + (R() * 4 | 0);
    for (var p = 0; p < nPl; p++) { var pl = scatter(plank(rn), 0.8, 3.4); pl.rotation.z = rn(-0.1, 0.1); }
    var pile = new THREE.Group(); pile.position.set(rn(-2.5, 2.5), 0, rn(-2.5, 2.5));
    for (var pi = 0; pi < 3; pi++) { var pp = plank(rn); pp.position.y = pi * 0.026; pp.rotation.y = rn(-0.5, 0.5); pile.add(pp); }
    flat.add(pile);
    var nBr = 4 + (R() * 3 | 0);
    for (var bi = 0; bi < nBr; bi++) scatter(branch(rn), 0.8, 3.6);
    var nCn = 2 + (R() * 3 | 0);
    for (var ci = 0; ci < nCn; ci++) scatter(can(rn), 0.7, 3.0);
    for (var ki = 0; ki < 5; ki++) scatter(brick(rn), 0.9, 3.0);
    scatter(cardboard(rn), 1.6, 2.8);
    if (R() < 0.6) scatter(tire(), 1.8, 3.0);

    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.set(c.x, y, c.z);
    // ✅ v0.3.8 КЛЮЧЕВОЙ ФИКС: поворот чекблока. Раньше группа НЕ
    //    поворачивалась (g.rotation.y не задан), а сервер считает
    //    мировые координаты бочек с поворотом rot → бочки на экране
    //    стояли до 3 м в стороне от серверных координат: дропы падали
    //    «не там», прицел по barrelPos промахивался, у игрока
    //    складывалось впечатление, что «бочки не ломаются»
    g.rotation.y = c.rot || 0;
    _scene.add(g);

    // ✅ v0.3.9: ровная площадка чекблока — по ней можно ХОДИТЬ
    //    (groundAt в gameworld поднимает игрока через padAt)
    cbPads.push({ x: c.x, z: c.z, top: y + 0.09 });
  }

  /** ✅ v0.3.9: площадка чекблока в точке (x,z) — {top, d, x, z} или null.
      d — расстояние от центра (внутри 4.4 — плоская вершина,
      до 5.4 — склона насыпи, по которому игрок поднимается).
      ✅ v0.4.1: возвращает и ЦЕНТР (x,z) — чтобы притягивать дропы
      с бочек на плоскую вершину насыпи */
  function padAt(x, z) {
    for (var i = 0; i < cbPads.length; i++) {
      var p = cbPads[i];
      var dx = x - p.x, dz = z - p.z;
      var d2 = dx * dx + dz * dz;
      if (d2 < 29.16) return { top: p.top, d: Math.sqrt(d2), x: p.x, z: p.z };   // 5.4^2
    }
    return null;
  }

  /** ✅ v0.3.8: детерминированный rn для пятна грязи ДО rng seed
      (насыпь одинакова у всех и не зависит от остальной раскладки) */
  function rn0(c) {
    var R0 = mulberry((c.seed || 12345) + 7);
    return function (a, b) { return a + R0() * (b - a); };
  }

  /* ---------- дропы (скрап / метал / труба / пружина) ---------- */

  function spawnDrop(d) {
    if (drops[d.id]) return;
    // ✅ v0.4.2: дроп ПАДАЕТ с бочки и приземляется на РОВНУЮ ВЕРШИНУ
    //    насыпи чекблока (d ≤ 3.4). Раньше: spawnDrop ставил дроп на
    //    насыпь, но tick КАЖДЫЙ КАДР опускал его на высоту РЕЛЬЕФА —
    //    дроп оказывался ВНУТРИ насыпи и был НЕ ВИДЕН («модель вообще
    //    не видна»). Теперь базовая высота считается одинаково здесь
    //    и в tick — через dropGroundY()
    var pad = padAt(d.x, d.z);
    if (pad && pad.d > 3.4) {
      var k = 3.4 / Math.max(pad.d, 0.001);
      d.x = pad.x + (d.x - pad.x) * k;
      d.z = pad.z + (d.z - pad.z) * k;
      pad = padAt(d.x, d.z);
    }
    var gy = dropGroundY(d.x, d.z);
    var g = new THREE.Group();
    // ✅ v0.4.2: модели ВСЕГДА собранные кодом — крупнее (0.3–0.8 м) и
    //    ржавого цвета, как в репозитории. Клон scrap.glb часто был
    //    почти незаметен на насыпи
    if (d.kind === 'scrap') g.add(mkScrapModel());
    else if (d.kind === 'pipe') g.add(mkPipeModel());
    else if (d.kind === 'spring') g.add(mkSpringModel());
    else g.add(mkMetalFragment());
    g.position.set(d.x, gy + 1.0, d.z);
    g.rotation.y = Math.random() * TAU;
    _scene.add(g);
    drops[d.id] = { id: d.id, kind: d.kind, x: d.x, z: d.z, amt: d.amt || 1,
      group: g, t: Math.random() * 6,
      baseY: gy + 0.12,                 // высота покоя (лежит на земле)
      fall: { vy: 0, bounces: 0 } };    // ✅ падение с гравитацией
  }

  /** базовая высота земли для дропа/обломков: вершина насыпи чекблока
      или рельеф — ЕДИНЫЙ источник правды для spawnDrop и tick */
  function dropGroundY(x, z) {
    var pad = padAt(x, z);
    return pad ? pad.top : _groundY(x, z);
  }

  function removeDrop(id) {
    var d = drops[id];
    if (!d) return;
    if (_scene && d.group) _scene.remove(d.group);
    delete drops[id];
  }

  /* ✅ v0.4.15: убрать ВСЕ дропы (админ-панель, сервер прислал dclr) */
  function clearDrops() {
    if (_scene) {
      for (var id in drops) _scene.remove(drops[id].group);
    }
    drops = {};
  }

  /* ---------- обломки бочки (визуал, как в репозитории) ---------- */

  function spawnDebris(x, z) {
    if (!_scene) return;
    // ✅ v0.4.2: единая высота земли (насыпь чекблока / рельеф)
    var y = dropGroundY(x, z);
    var group = new THREE.Group();
    group.position.set(x, y, z);
    var m1 = new THREE.MeshStandardMaterial({ color: 0x6b5a3f, roughness: 0.6, metalness: 0.4 });
    var m2 = new THREE.MeshStandardMaterial({ color: 0x1d1e20, roughness: 0.8, metalness: 0.3 });
    for (var i = 0; i < 5; i++) {
      var w = 0.08 + Math.random() * 0.07, h = 0.06 + Math.random() * 0.06, d = 0.06 + Math.random() * 0.04;
      var piece = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), Math.random() > 0.5 ? m1 : m2);
      piece.position.set((Math.random() - 0.5) * 0.15, 0.25 + Math.random() * 0.2, (Math.random() - 0.5) * 0.15);
      piece.rotation.set(Math.random() - 0.5, Math.random() * TAU, Math.random() - 0.5);
      piece.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 2.5, (Math.random() - 0.5) * 3);
      piece.userData.rotVel = new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5);
      group.add(piece);
    }
    _scene.add(group);
    debris.push({ group: group, t: 1.5 });
  }

  function tickDebris(dt) {
    for (var i = debris.length - 1; i >= 0; i--) {
      var db = debris[i];
      db.t -= dt;
      var live = false;
      db.group.children.forEach(function (piece) {
        var v = piece.userData.vel;
        if (!v) return;
        v.y -= 9.8 * dt;
        piece.position.x += v.x * dt; piece.position.y += v.y * dt; piece.position.z += v.z * dt;
        var floor = _groundY(db.group.position.x + piece.position.x, db.group.position.z + piece.position.z);
        if (piece.position.y < floor + 0.03) { piece.position.y = floor + 0.03; v.set(0, 0, 0); }
        else {
          piece.rotation.x += piece.userData.rotVel.x * dt;
          piece.rotation.y += piece.userData.rotVel.y * dt;
          piece.rotation.z += piece.userData.rotVel.z * dt;
          live = true;
        }
      });
      if (db.t <= 0) {
        if (_scene) _scene.remove(db.group);
        debris.splice(i, 1);
      }
    }
  }

  /* ---------- состояние бочек (команды сервера) ---------- */

  function applyDmgVisual(b) {
    var dmg = 1 - Math.max(b.hp, 0) / 6;   /* ✅ v0.4.44: шкала 6 хп */
    b.group.scale.y = 1 - dmg * 0.18;
    b.group.rotation.z = dmg * 0.12;
  }

  function applyHp(id, hp) {
    var b = barrels[id];
    if (!b) return;
    b.hp = hp;
    b.shakeT = 0.3;
    // визуальный урон: бочка проседает и кренится
    applyDmgVisual(b);
  }

  function breakBarrel(id) {
    var b = barrels[id];
    if (!b || b.brk) return;
    b.brk = true;
    b.hp = 0;
    b.group.visible = false;
    var idx = barrelMeshes.indexOf(b.group);
    if (idx >= 0) barrelMeshes.splice(idx, 1);
    spawnDebris(b.x, b.z);   // обломки (визуал у каждого игрока свой)
  }

  /* ✅ v0.3.8: бочка вернулась по таймеру СЕРВЕРА (не по перезагрузке!) */
  function respawnBarrel(id) {
    var b = barrels[id];
    if (!b) return;
    b.brk = false;
    b.hp = 6;   /* ✅ v0.4.44: полные 6 хп */
    b.shakeT = 0;
    b.group.visible = true;
    b.group.scale.y = 1;
    b.group.rotation.z = 0;
    b.group.rotation.x = 0;
    if (barrelMeshes.indexOf(b.group) < 0) barrelMeshes.push(b.group);
  }

  /* ✅ v0.3.8: пустой ящик ИСЧЕЗАЕТ у всех (лут кончился) */
  function removeCrate(id) {
    var c = crates[id];
    if (!c || c.gone) return;
    c.gone = true;
    if (c.hitbox && c.hitbox.userData.brixProp) c.hitbox.userData.brixProp.dead = true;
    if (c.group) c.group.visible = false;
    var idx = crateMeshes.indexOf(c.hitbox);
    if (idx >= 0) crateMeshes.splice(idx, 1);
  }

  /* ✅ v0.3.8: ящик вернулся с НОВЫМ лутом — сразу у всех.
     ✅ v0.4.44: сервер сам выбирает ТИП ящика при каждом респавне
     (деревянный/военный) — mil приходит в cbrespawn, модель меняем */
  function respawnCrate(id, loot, mil) {
    var c = crates[id];
    if (!c) return;
    c.gone = false;
    if (loot) c.loot = loot;
    if (c.hitbox && c.hitbox.userData.brixProp) c.hitbox.userData.brixProp.dead = false;
    if (c.group) {
      if (mil !== undefined) {
        var newMil = mil ? 1 : 0;
        if (c.mil !== newMil) {
          c.mil = newMil;
          while (c.group.children.length) c.group.remove(c.group.children[0]);
          var m = _crateModel(newMil);
          c.group.add(m || mkCrateFallback(newMil));
        }
      }
      c.group.visible = true;
    }
    if (crateMeshes.indexOf(c.hitbox) < 0) crateMeshes.push(c.hitbox);
  }

  /* ---------- поиск цели удара / подбора ---------- */

  function findProp(obj) {
    var o = obj;
    while (o) {
      if (o.userData && o.userData.brixProp) return o.userData.brixProp;
      o = o.parent;
    }
    return null;
  }

  /* ✅ v0.4.2: dir — направление ВЗГЛЯДА (камера). Если задано,
     предмет/ящик реагируют ТОЛЬКО когда прицел наведён на них
     (горизонтальный конус ~10°) — «пусть только реагируют если
     на них наведён прицел», как просил игрок */
  var AIM_COS = Math.cos(10 * Math.PI / 180);
  function nearestPickup(pos, maxDist, dir) {
    var dirH = null;
    if (dir) {
      var fl = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
      if (fl > 0.0001) dirH = { x: dir.x / fl, z: dir.z / fl };
    }
    function aimed(dx, dz) {
      if (!dirH) return true;
      var l = Math.sqrt(dx * dx + dz * dz);
      if (l < 0.0001) return true;
      return (dx / l) * dirH.x + (dz / l) * dirH.z >= AIM_COS;
    }
    var best = null, bestD = maxDist * maxDist;
    for (var id in drops) {
      var d = drops[id];
      var dx = d.x - pos.x, dz = d.z - pos.z;
      var dd = dx * dx + dz * dz;
      if (dd < bestD && aimed(dx, dz)) { bestD = dd; best = { kind: 'drop', id: id, item: d.kind, amount: d.amt }; }
    }
    for (var cid in crates) {
      var c = crates[cid];
      if (c.gone) continue;
      var dx2 = c.x - pos.x, dz2 = c.z - pos.z;
      var dd2 = dx2 * dx2 + dz2 * dz2;
      if (dd2 < bestD && aimed(dx2, dz2)) { bestD = dd2; best = { kind: 'cb', id: cid }; }
    }
    return best;
  }

  /* ---------- анимация ---------- */

  function tick(dt) {
    for (var id in drops) {
      var d = drops[id];
      d.t += dt;
      if (d.fall) {
        // ✅ v0.4.2: падение с бочки: гравитация → удар → отскок ×2 → покой
        d.fall.vy -= 16 * dt;
        d.group.position.y += d.fall.vy * dt;
        d.group.rotation.y += dt * 3.5;          // крутится в полёте
        if (d.group.position.y <= d.baseY) {
          d.group.position.y = d.baseY;
          if (Math.abs(d.fall.vy) > 2.2 && d.fall.bounces < 2) {
            d.fall.vy = -d.fall.vy * 0.32;
            d.fall.bounces++;
          } else {
            d.fall = null;                        // приземлился — покой
            d.group.rotation.x = 0; d.group.rotation.z = 0;
          }
        }
      } else {
        d.group.rotation.y += dt * 0.8;
        // лежит НА ПЛОЩАДКЕ чекблока (dropGroundY учитывает насыпь!)
        d.group.position.y = dropGroundY(d.x, d.z) + 0.12 + Math.sin(d.t * 2.4) * 0.04;
      }
    }
    for (var bid in barrels) {
      var b = barrels[bid];
      if (b.shakeT > 0) {
        b.shakeT -= dt;
        b.group.rotation.x = Math.sin(b.shakeT * 40) * 0.04 * b.shakeT;
        if (b.shakeT <= 0) b.group.rotation.x = 0;
      }
    }
    tickDebris(dt);
  }

  function clearAll() {
    if (_scene) {
      for (var id in barrels) _scene.remove(barrels[id].group);
      for (var id2 in drops) _scene.remove(drops[id2].group);
      for (var id3 in crates) _scene.remove(crates[id3].hitbox.parent || crates[id3].hitbox);
      debris.forEach(function (db) { _scene.remove(db.group); });
    }
    barrels = {}; drops = {}; crates = {}; cbPads = [];
    barrelMeshes = []; crateMeshes = []; debris = [];
    _pendingBarrels = []; _pendingScraps = []; _pendingCrates = [];
  }

  return {
    preload: preload,
    build: build,
    tick: tick,
    applyHp: applyHp,
    breakBarrel: breakBarrel,
    respawnBarrel: respawnBarrel,
    padAt: padAt,
    spawnDrop: spawnDrop,
    removeDrop: removeDrop,
    clearDrops: clearDrops,   // ✅ v0.4.15: админ-панель — «убрать все дропы»
    removeCrate: removeCrate,
    respawnCrate: respawnCrate,
    crateLoot: function (id) {
      var c = crates[id];
      return c ? c.loot : null;
    },
    setCrateLoot: function (id, loot) {
      var c = crates[id];
      if (c) c.loot = loot;
    },
    findProp: findProp,
    nearestPickup: nearestPickup,
    barrelTargets: function () { return barrelMeshes; },
    barrelPos: function (id) {
      var b = barrels[id];
      return b ? { x: b.x, z: b.z } : null;
    },
    crateTargets: function () { return crateMeshes; },
    isReady: function () { return { barrel: !!_barrelProto, scrap: !!_scrapProto, crates: !!_woodenProto }; }
  };
})();
