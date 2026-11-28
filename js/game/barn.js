// ============================================================
//  brix • js/game/barn.js                                v0.6.0
//  ЛОКАЦИЯ «АМБАР» — перенос из игры GLM (репозиторий
//  oxide5554-create/-glm, scr/world/locations/warehouse.js):
//  красный стальной ангар 30×20 м на бетонной плите 38×30 —
//  стальной каркас, рваная крыша, зелёные панели стен, офис с
//  балконом и лестницей, стеллажи, кучи ящиков, поддоны,
//  контейнеры, погрузчик, бочки, шины, заборы, верстак, лампы.
//
//  НА КАРТЕ 2 АМБАРА: места ищутся детерминированно ПО СИДУ
//  карты (у каждой вайп-карты свои амбары), на суше, на самом
//  ровном месте, не на дороге и не у спавна. Оба амбара
//  ПОМЕЧЕНЫ НА КАРТЕ (M) иконкой с подписью «АМБАР» —
//  рисует minimenu.js по списку BrixBarn.list().
//
//  ФИЗИКА (контракт как у BrixLighthouse):
//   - AABB-коллайдеры → controls.addBoxColliders (стены/ящики/
//     контейнеры не пропускают, на низкое можно ЗАЙТИ сверху —
//     ступенька 0.55 м, как у построек);
//   - floorAt(x, z, feetY) — верх плиты, ящиков, контейнеров,
//     офиса и балкона: по всему этому можно ХОДИТЬ;
//   - ось поворота ТОЛЬКО кратна 90° — AABB остаются осями.
//
//  Деревья/руды/трава/кактусы под амбарами НЕ СТАВЯТСЯ:
//  world.js спрашивает BrixBarn.blocks(x, z).
// ============================================================
window.BrixBarn = (function () {
  'use strict';

  var TAU = Math.PI * 2;
  function clampN(x, a, b) { return Math.min(b, Math.max(a, x)); }

  function rngFrom(seed) {
    var a = (seed | 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* сид карты → смещение генераторов (тот же множитель, что в world.js) */
  function seedOff() { return ((window.BRIX_TERRAIN_SEED || 0) | 0) * 7919; }

  /* ============================================================
     СЛИЯНИЕ ГЕОМЕТРИЙ (в three.min.js r158 нет BufferGeometryUtils)
     Все примитивы (Box/Cylinder/Sphere/Torus) — индексированные,
     атрибуты position/normal/uv — сливаем честно, со сдвигом индексов
     ============================================================ */
  function mergeGeos(list) {
    var vcount = 0, icount = 0, i;
    for (i = 0; i < list.length; i++) {
      vcount += list[i].attributes.position.count;
      icount += list[i].index.count;
    }
    var pos = new Float32Array(vcount * 3);
    var nor = new Float32Array(vcount * 3);
    var uv = new Float32Array(vcount * 2);
    var idx = vcount > 65535 ? new Uint32Array(icount) : new Uint16Array(icount);
    var vo = 0, io = 0;
    for (i = 0; i < list.length; i++) {
      var g = list[i];
      pos.set(g.attributes.position.array, vo * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, vo * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
      var gi = g.index.array;
      for (var k = 0; k < gi.length; k++) idx[io + k] = gi[k] + vo;
      io += gi.length; vo += g.attributes.position.count;
      g.dispose();
    }
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }

  /* ============================================================
     ТЕКСТУРЫ (canvas, процедурные) — 1:1 из GLM warehouse.js
     ============================================================ */
  function cv(w, h, draw) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h); return c;
  }
  function mkTex(c) {
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function blotches(x, w, h, rnd, n, color, a, rmin, rmax) {
    for (var i = 0; i < n; i++) {
      x.fillStyle = color.replace('A', (a * (0.5 + rnd() * 0.5)).toFixed(3));
      x.beginPath(); x.arc(rnd() * w, rnd() * h, rmin + rnd() * (rmax - rmin), 0, TAU); x.fill();
    }
  }
  function corrugated(x, w, h, step, dark, light) {
    for (var px = 0; px < w; px += step) {
      var g = x.createLinearGradient(px, 0, px + step, 0);
      g.addColorStop(0, dark); g.addColorStop(0.5, light); g.addColorStop(1, dark);
      x.fillStyle = g; x.fillRect(px, 0, step, h);
    }
  }

  function makeTextures(signText) {
    var rnd = rngFrom(12345);
    var T = {};
    T.concrete = mkTex(cv(512, 512, function (x, w, h) {
      x.fillStyle = '#8d8f8b'; x.fillRect(0, 0, w, h);
      for (var i = 0; i < 5000; i++) { x.fillStyle = 'rgba(' + (rnd() < 0.5 ? '40,40,40' : '200,200,195') + ',' + (0.05 + rnd() * 0.1) + ')'; x.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3); }
      blotches(x, w, h, rnd, 14, 'rgba(30,30,28,A)', 0.14, 20, 70);
      blotches(x, w, h, rnd, 6, 'rgba(70,95,45,A)', 0.2, 10, 40);
      x.strokeStyle = 'rgba(35,36,34,0.9)'; x.lineWidth = 3;
      for (var p = 0; p < 340; p += 170) {       // швы плит (неровные)
        x.beginPath(); x.moveTo(p + rnd() * 6, 0);
        for (var y = 0; y <= h; y += 64) x.lineTo(p + rnd() * 10, y); x.stroke();
        x.beginPath(); x.moveTo(0, p + rnd() * 6);
        for (var xx = 0; xx <= w; xx += 64) x.lineTo(xx, p + rnd() * 10); x.stroke();
      }
      x.lineWidth = 1.2;
      for (var j = 0; j < 16; j++) {
        x.strokeStyle = 'rgba(40,40,38,' + (0.4 + rnd() * 0.4) + ')'; x.beginPath();
        var px = rnd() * w, py = rnd() * h; x.moveTo(px, py);
        for (var k = 0; k < 6; k++) { px += (rnd() - 0.5) * 50; py += (rnd() - 0.5) * 50; x.lineTo(px, py); } x.stroke();
      }
    }));
    T.redMetal = mkTex(cv(256, 256, function (x, w, h) {
      x.fillStyle = '#962a23'; x.fillRect(0, 0, w, h);
      blotches(x, w, h, rnd, 70, 'rgba(110,55,25,A)', 0.4, 4, 22);
      blotches(x, w, h, rnd, 30, 'rgba(190,190,185,A)', 0.2, 2, 8);
      for (var i = 0; i < 50; i++) { x.fillStyle = 'rgba(30,10,8,' + (rnd() * 0.25) + ')'; x.fillRect(rnd() * w, 0, 1 + rnd() * 2, h); }
    }));
    T.roof = mkTex(cv(256, 256, function (x, w, h) {
      corrugated(x, w, h, 16, '#6e1f1a', '#a53128');
      blotches(x, w, h, rnd, 80, 'rgba(105,60,30,A)', 0.45, 4, 26);
      blotches(x, w, h, rnd, 40, 'rgba(185,188,188,A)', 0.25, 2, 12);
    }));
    T.green = mkTex(cv(256, 256, function (x, w, h) {
      x.fillStyle = '#44614a'; x.fillRect(0, 0, w, h);
      for (var px = 0; px < w; px += 32) { x.fillStyle = 'rgba(15,30,20,0.55)'; x.fillRect(px, 0, 2, h); x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(px + 3, 0, 3, h); }
      blotches(x, w, h, rnd, 30, 'rgba(190,175,140,A)', 0.3, 3, 18);
      var g = x.createLinearGradient(0, h * 0.6, 0, h); g.addColorStop(0, 'rgba(40,30,20,0)'); g.addColorStop(1, 'rgba(40,30,20,0.55)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    }));
    T.crate = mkTex(cv(256, 256, function (x, w, h) {
      x.fillStyle = '#b39d6b'; x.fillRect(0, 0, w, h);
      for (var y = 0; y < h; y += 64) { x.fillStyle = 'rgba(60,45,20,0.6)'; x.fillRect(0, y, w, 3); }
      for (var i = 0; i < 70; i++) { x.strokeStyle = 'rgba(90,70,35,' + (0.1 + rnd() * 0.2) + ')'; x.beginPath(); var y2 = rnd() * h; x.moveTo(0, y2); x.lineTo(w, y2 + (rnd() - 0.5) * 6); x.stroke(); }
      x.fillStyle = 'rgba(95,80,50,0.9)'; x.fillRect(14, 0, 20, h); x.fillRect(w - 34, 0, 20, h);
      x.fillStyle = 'rgba(30,25,15,0.9)'; for (var y3 = 16; y3 < h; y3 += 64) { x.fillRect(22, y3, 4, 4); x.fillRect(w - 26, y3, 4, 4); }
      blotches(x, w, h, rnd, 14, 'rgba(50,40,25,A)', 0.2, 6, 24);
    }));
    T.pallet = mkTex(cv(256, 256, function (x, w, h) {
      x.fillStyle = '#85694a'; x.fillRect(0, 0, w, h);
      for (var y = 0; y < h; y += 50) { x.fillStyle = 'rgba(25,15,8,0.7)'; x.fillRect(0, y, w, 4); }
      for (var i = 0; i < 60; i++) { x.strokeStyle = 'rgba(40,25,10,' + (0.15 + rnd() * 0.25) + ')'; x.beginPath(); var y2 = rnd() * h; x.moveTo(0, y2); x.lineTo(w, y2); x.stroke(); }
    }));
    T.rustFence = mkTex(cv(256, 256, function (x, w, h) {
      corrugated(x, w, h, 16, '#7a3f22', '#b4693a');
      blotches(x, w, h, rnd, 40, 'rgba(205,200,188,A)', 0.55, 6, 30);
      blotches(x, w, h, rnd, 50, 'rgba(60,30,15,A)', 0.4, 4, 20);
    }));
    function cont(base, d, l) {
      return mkTex(cv(256, 256, function (x, w, h) {
        x.fillStyle = base; x.fillRect(0, 0, w, h);
        corrugated(x, w, h, 16, d, l);
        blotches(x, w, h, rnd, 40, 'rgba(110,60,30,A)', 0.4, 3, 20);
        for (var i = 0; i < 20; i++) { x.fillStyle = 'rgba(20,15,10,' + (rnd() * 0.3) + ')'; x.fillRect(rnd() * w, 0, 2, h); }
      }));
    }
    T.contG = cont('#3e6a48', '#2a4a33', '#4c7e57');
    T.contR = cont('#8e2e25', '#5f1d17', '#a63a2f');
    T.wood = mkTex(cv(256, 256, function (x, w, h) {
      x.fillStyle = '#7b5d3a'; x.fillRect(0, 0, w, h);
      for (var y = 0; y < h; y += 42) { x.fillStyle = 'rgba(20,12,6,0.7)'; x.fillRect(0, y, w, 3); }
      for (var i = 0; i < 80; i++) { x.strokeStyle = 'rgba(40,25,10,' + (0.1 + rnd() * 0.25) + ')'; x.beginPath(); var y2 = rnd() * h; x.moveTo(0, y2); x.lineTo(w, y2 + (rnd() - 0.5) * 4); x.stroke(); }
    }));
    T.sign = mkTex(cv(512, 160, function (x, w, h) {
      x.fillStyle = '#b5532a'; x.fillRect(0, 0, w, h);
      blotches(x, w, h, rnd, 40, 'rgba(60,30,15,A)', 0.4, 4, 24);
      x.fillStyle = '#16120f'; x.font = 'bold 84px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(signText, w / 2, h / 2 + 4);
      x.strokeStyle = '#16120f'; x.lineWidth = 6; x.strokeRect(6, 6, w - 12, h - 12);
    }));
    return T;
  }

  /* ============================================================
     Построитель: боксы копятся по материалам и сливаются в один меш
     ============================================================ */
  var _q, _m, _p, _s1, _e;
  function initTemps() {
    _q = new THREE.Quaternion(); _m = new THREE.Matrix4();
    _p = new THREE.Vector3(); _s1 = new THREE.Vector3(1, 1, 1); _e = new THREE.Euler();
  }

  function boxGeo(w, h, d, tile) {
    var g = new THREE.BoxGeometry(w, h, d);
    var uv = g.attributes.uv;
    var dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (var f = 0; f < 6; f++) for (var i = 0; i < 4; i++) {
      var k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tile);
    }
    return g;
  }

  function Builder() { this.parts = new Map(); this.solids = []; }
  Builder.prototype.push = function (g, mat) {
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
  };
  Builder.prototype.place = function (g, x, y, z, rx, ry, rz) {
    _e.set(rx || 0, ry || 0, rz || 0, 'YXZ'); _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s1); g.applyMatrix4(_m);
  };
  Builder.prototype.box = function (mat, w, h, d, x, y, z, o) {
    o = o || {};
    var g = boxGeo(w, h, d, o.tile || 2);
    this.place(g, x, y, z, o.rx, o.ry, o.rz);
    this.push(g, mat);
    if (o.solid) this.solidC(x, y, z, w, h, d, o.ry || 0);
    return g;
  };
  Builder.prototype.cyl = function (mat, rt, rb, h, seg, x, y, z, o) {
    o = o || {};
    var g = new THREE.CylinderGeometry(rt, rb, h, seg);
    this.place(g, x, y, z, o.rx, o.ry, o.rz); this.push(g, mat); return g;
  };
  Builder.prototype.torus = function (mat, R, r, x, y, z, o) {
    o = o || {};
    var g = new THREE.TorusGeometry(R, r, 8, 16);
    this.place(g, x, y, z, o.rx, o.ry, o.rz); this.push(g, mat); return g;
  };
  Builder.prototype.sphere = function (mat, r, x, y, z) {
    var g = new THREE.SphereGeometry(r, 8, 6); this.place(g, x, y, z); this.push(g, mat);
  };
  Builder.prototype.solidC = function (x, y, z, w, h, d, ry) {
    if (Math.abs(Math.sin(ry || 0)) > 0.99) { var t = w; w = d; d = t; }
    this.solids.push({ minX: x - w / 2, maxX: x + w / 2, minY: y - h / 2, maxY: y + h / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  };
  Builder.prototype.solidR = function (minX, maxX, minY, maxY, minZ, maxZ) {
    this.solids.push({ minX: minX, maxX: maxX, minY: minY, maxY: maxY, minZ: minZ, maxZ: maxZ });
  };

  /* ============================================================
     ГЕОМЕТРИЯ АМБАРА — порт build-части createWarehouse (GLM).
     Возвращает { group, solids, mats, geos } — локальные координаты,
     0 = верх бетонной плиты
     ============================================================ */
  function buildBarnGeometry(rng, signText) {
    initTemps();   /* ← пораньше: temps нужны уже первым b.box() */
    var rn = function (a, b) { return a + rng() * (b - a); };
    var T = makeTextures(signText);
    var std = function (o) {
      var m = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.9, metalness: 0.05 }, o));
      return m;
    };
    var M = {
      concrete: std({ map: T.concrete }), red: std({ map: T.redMetal, metalness: 0.25, roughness: 0.75 }),
      roof: std({ map: T.roof, metalness: 0.2, roughness: 0.8, side: THREE.DoubleSide }),
      green: std({ map: T.green }), crate: std({ map: T.crate }),
      crateD: std({ map: T.crate, color: 0xb9a78a }), pallet: std({ map: T.pallet }),
      fence: std({ map: T.rustFence, metalness: 0.2, side: THREE.DoubleSide }),
      contG: std({ map: T.contG, metalness: 0.2 }), contR: std({ map: T.contR, metalness: 0.2 }),
      wood: std({ map: T.wood }), sign: std({ map: T.sign }),
      steel: std({ color: 0x4a4d50, metalness: 0.5, roughness: 0.6 }),
      rackBlue: std({ color: 0x2f4f6a, metalness: 0.4, roughness: 0.6 }),
      rackOrange: std({ color: 0xb8651f, metalness: 0.4, roughness: 0.6 }),
      glass: std({ color: 0x1c2a33, metalness: 0.6, roughness: 0.25 }),
      tire: std({ color: 0x151515, roughness: 1 }), dark: std({ color: 0x1b1b1b }),
      fork: std({ color: 0xc9c6b8, metalness: 0.2, roughness: 0.8 }), forkDark: std({ color: 0x3a3a38, metalness: 0.3 }),
      bulb: new THREE.MeshBasicMaterial({ color: 0xfff1c0 }),
      bRed: std({ color: 0x9c2a24, metalness: 0.4 }), bBlue: std({ color: 0x2b4c78, metalness: 0.4 }),
      bYel: std({ color: 0xbf9a26, metalness: 0.4 }), bGreen: std({ color: 0x3a6a3d, metalness: 0.4 }),
      grass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide })
    };
    var b = new Builder();
    var L = 30, W = 20, HE = 6, HR = 8.6;

    // ---------- бетонная плита (с «фундаментом» вниз, чтобы скрыть неровность земли) ----------
    b.box(M.concrete, 38, 3, 30, 0, -1.5, 0, { tile: 6, solid: true });

    // ---------- стальной каркас ----------
    var rafA = Math.atan2(HR - HE, W / 2);
    var rafL = Math.hypot(W / 2, HR - HE);
    var xs = [-15, -9, -3, 3, 9, 15];
    for (var xi = 0; xi < xs.length; xi++) {
      var x = xs[xi];
      for (var s = -1; s <= 1; s += 2) {
        b.box(M.red, 0.4, HE, 0.4, x, HE / 2, s * 10, { solid: true, tile: 2 });
        b.box(M.steel, 0.7, 0.12, 0.7, x, 0.06, s * 10);
        b.box(M.red, 0.3, 0.4, rafL, x, (HE + HR) / 2 + 0.1, s * W / 4, { rx: s * rafA });
        var sl = Math.hypot(5, HR - HE - 0.2);
        b.box(M.red, 0.14, 0.18, sl, x, HE + 0.1 + (HR - HE - 0.2) / 2, s * 2.5, { rx: s * Math.atan2(HR - HE - 0.2, 5) });
      }
      b.box(M.red, 0.2, 0.3, W, x, HE, 0);
      b.box(M.red, 0.18, HR - HE, 0.18, x, (HE + HR) / 2, 0);
    }
    var zArr = [-9, -6.5, -4, -1.5, 1.5, 4, 6.5, 9];
    for (var zi = 0; zi < zArr.length; zi++) {
      var zc = zArr[zi];
      var y = HE + (HR - HE) * (1 - Math.abs(zc) / 10) + 0.28;
      b.box(M.steel, L + 1.5, 0.1, 0.16, 0, y, zc);
    }
    b.box(M.red, L + 2, 0.16, 0.5, 0, HR + 0.28, 0);

    // ---------- крыша (часть листов «сорвана», как в Rust) ----------
    var sheetLen = rafL + 0.7;
    for (var s2 = -1; s2 <= 1; s2 += 2) for (var i2 = 0; i2 < 8; i2++) {
      if (rng() < 0.16) continue;
      var x2 = -14 + i2 * 4;
      b.box(M.roof, 4.02, 0.05, sheetLen, x2 + rn(-0.03, 0.03), (HE + HR) / 2 + 0.38, s2 * (W / 4 + 0.15),
        { rx: s2 * rafA, rz: rn(-0.015, 0.015), tile: 4 });
    }

    // ---------- стены (зелёные панели, часть сломана) ----------
    for (var wi = 0; wi < 12; wi++) {                         // задняя (z = -10), ворота справа
      var cx0 = -13.75 + wi * 2.5; if (wi >= 10) continue;
      var h0 = rn(3.0, 3.7);
      b.box(M.green, 2.45, h0, 0.14, cx0, h0 / 2, -10.0, { solid: true, tile: 2.5 });
    }
    for (var wi2 = 0; wi2 < 8; wi2++) {                       // правая (x = +15), проём посередине
      if (wi2 === 4 || wi2 === 5) continue;
      var cz0 = -8.75 + wi2 * 2.5, h1 = rn(2.8, 3.6);
      b.box(M.green, 0.14, h1, 2.45, 15.0, h1 / 2, cz0, { solid: true, tile: 2.5 });
    }

    // ---------- офис с балконом + лестница ----------
    var OX0 = -14.6, OX1 = -6.9, OZ0 = -9.8, OZ1 = -3.9, OH = 2.76;
    b.box(M.green, OX1 - OX0 - 0.2, OH - 0.12, OZ1 - OZ0 - 0.2, (OX0 + OX1) / 2, (OH - 0.12) / 2, (OZ0 + OZ1) / 2, { tile: 2.5 });
    b.box(M.wood, OX1 - OX0, 0.12, OZ1 - OZ0, (OX0 + OX1) / 2, OH - 0.06, (OZ0 + OZ1) / 2, { tile: 2 });
    b.solidR(OX0, OX1, 0, OH, OZ0, OZ1);
    b.box(M.dark, 1.0, 2.0, 0.06, -8.3, 1.0, OZ1 - 0.06);                 // дверь
    b.box(M.glass, 1.5, 0.9, 0.06, -13.4, 1.6, OZ1 - 0.06);               // окна
    b.box(M.glass, 1.5, 0.9, 0.06, -10.6, 1.6, OZ1 - 0.06);
    b.box(M.wood, 1.7, 0.1, 0.12, -13.4, 1.1, OZ1 - 0.04); b.box(M.wood, 1.7, 0.1, 0.12, -10.6, 1.1, OZ1 - 0.04);
    b.box(M.sign, 2.6, 0.8, 0.05, -11.0, 2.35, OZ1 - 0.04 + 0.03, { tile: 2.6 });
    // перила балкона (с проходом у лестницы x∈[-12.5,-11.1])
    var RH = 1.0, ry0 = OH;
    var rail = function (x0, x1, z0, z1) {
      var cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = Math.max(0.1, x1 - x0), d = Math.max(0.1, z1 - z0);
      b.box(M.wood, w, 0.07, d, cx, ry0 + 0.9, cz); b.box(M.wood, w, 0.07, d, cx, ry0 + 0.5, cz);
      b.solidR(cx - w / 2, cx + w / 2, ry0, ry0 + RH, cz - d / 2, cz + d / 2);
    };
    rail(OX0, -12.6, OZ1 - 0.05, OZ1); rail(-11.0, OX1, OZ1 - 0.05, OZ1);
    rail(OX0, OX1, OZ0, OZ0 + 0.05); rail(OX0, OX0 + 0.05, OZ0, OZ1); rail(OX1 - 0.05, OX1, OZ0, OZ1);
    for (var ri = 0; ri <= 6; ri++) b.box(M.wood, 0.12, RH, 0.12, OX0 + 0.06 + ri * ((OX1 - OX0 - 0.12) / 6), ry0 + RH / 2, OZ1 - 0.04);
    b.box(M.wood, 0.12, RH, 0.12, OX0 + 0.06, ry0 + RH / 2, OZ0 + 0.06);
    b.box(M.wood, 0.12, RH, 0.12, OX1 - 0.06, ry0 + RH / 2, OZ0 + 0.06);
    // лестница: 5 ступеней по 0.552 м (вдоль -Z от балкона)
    var stairsZ = function (xc, wd, zEdge, dir, n, h, d, mat) {
      for (var i = 0; i < n; i++) {
        var top = (i + 1) * h, len = (n - i) * d;
        var cz = zEdge + dir * len / 2;
        b.box(mat, wd, top, len, xc, top / 2, cz, { tile: 1.5, solid: true });
      }
    };
    stairsZ(-11.8, 1.4, OZ1, +1, 5, OH / 5, 0.55, M.wood);
    b.box(M.wood, 0.08, 1.0, 0.08, -12.55, 0.5, OZ1 + 2.75 - 0.04);
    b.box(M.wood, 0.08, 1.0, 0.08, -11.05, 0.5, OZ1 + 2.75 - 0.04);

    // ---------- стеллажи ----------
    function crate(x, y, z, w, h, d, solid) {
      b.box(rng() < 0.3 ? M.crateD : M.crate, w, h, d, x, y + h / 2, z, { solid: solid !== false, tile: 1.1 });
    }
    function rackBay(cx, cz, tall) {
      var w = 3.0, d = 1.3;
      var levels = tall ? [0.3, 1.75, 3.2] : [0.3, 3.4];
      for (var sx = -1; sx <= 1; sx += 2) for (var sz = -1; sz <= 1; sz += 2)
        b.box(M.rackBlue, 0.1, 4.6, 0.1, cx + sx * (w / 2 - 0.05), 2.3, cz + sz * (d / 2 - 0.05));
      for (var li = 0; li < levels.length; li++) {
        var yl = levels[li];
        for (var sz2 = -1; sz2 <= 1; sz2 += 2) b.box(M.rackOrange, w, 0.12, 0.08, cx, yl, cz + sz2 * (d / 2 - 0.04));
        b.box(M.wood, w - 0.1, 0.05, d - 0.1, cx, yl + 0.085, cz, { tile: 1.5 });
      }
      var plan2 = tall ? [[0.41, 3], [1.86, 3], [3.31, 2]] : [[0.41, 3], [3.51, 2]];
      for (var pi = 0; pi < plan2.length; pi++) {
        var lvl = plan2[pi][0], cnt = plan2[pi][1];
        for (var k = 0; k < cnt; k++) {
          if (lvl > 3 && rng() < 0.4) continue;
          var h = lvl > 3 ? rn(0.7, 0.95) : rn(1.0, 1.25);
          crate(cx + (k - (cnt - 1) / 2) * 0.98, lvl, cz + rn(-0.04, 0.04), 0.92, h, 1.05);
        }
      }
    }
    rackBay(-4.5, -9.0); rackBay(-1.5, -9.0); rackBay(1.5, -9.0); rackBay(4.5, -9.0);
    rackBay(-3.5, -3.4, false); rackBay(-0.5, -3.4, false); rackBay(2.5, -3.4, false);
    // ступени из ящиков на низкий ряд стеллажей
    var stairsX = function (xEdge, dir, zc, wd, n, h, d, mat) {
      for (var i = 0; i < n; i++) {
        var top = (i + 1) * h, len = (n - i) * d;
        b.box(mat, len, top, wd, xEdge + dir * len / 2, top / 2, zc, { tile: 1.1, solid: true });
      }
    };
    stairsX(4.0, +1, -3.4, 1.3, 3, 0.5, 1.0, M.crateD);

    // ---------- поддоны ----------
    function palletParts(x, y, z, ry) {
      var c = Math.cos(ry), s = Math.sin(ry);
      var put = function (lx, ly, lz, w, h, d) {
        b.box(M.pallet, w, h, d, x + lx * c + lz * s, y + ly, z - lx * s + lz * c, { ry: ry, tile: 1.2 });
      };
      for (var i = 0; i < 5; i++) put(0, 0.135, -0.43 + i * 0.215, 1.2, 0.03, 0.14);
      for (var j = 0; j < 3; j++) { var lz2 = [-0.42, 0, 0.42][j]; put(0, 0.075, lz2, 1.2, 0.09, 0.1); }
      for (var k = 0; k < 3; k++) put(-0.5 + k * 0.5, 0.015, 0, 0.14, 0.03, 1.0);
    }
    for (var st = 0; st < 14; st++) palletParts(12 + rn(-0.04, 0.04), st * 0.15, -3 + rn(-0.04, 0.04), rn(-0.03, 0.03));
    b.solidR(11.4, 12.6, 0, 2.1, -3.5, -2.5);
    palletParts(-6.5, 0, 6.5, 0); b.solidC(-6.5, 0.075, 6.5, 1.2, 0.15, 1.0, 0);
    palletParts(2, 0, -0.5, 0); b.solidC(2, 0.075, -0.5, 1.2, 0.15, 1.0, 0);
    palletParts(-4.5, 0, 3.0, 0); b.solidC(-4.5, 0.075, 3.0, 1.2, 0.15, 1.0, 0);

    // ---------- кучи ящиков ----------
    function pile(cx, cz, nx, nz, levels) {
      for (var l = 0; l < levels; l++) {
        var ax = Math.max(1, nx - l), az = Math.max(1, nz - l);
        for (var i = 0; i < ax; i++) for (var k = 0; k < az; k++) {
          if (l > 0 && rng() < 0.15) continue;
          var sz = rn(0.92, 1.05);
          crate(cx + (i - (ax - 1) / 2) * 1.04 + rn(-0.02, 0.02), l * 1.0, cz + (k - (az - 1) / 2) * 1.04, sz, sz, sz);
        }
      }
    }
    pile(-8.0, -0.8, 2, 1, 2); pile(-9.5, 2.5, 1, 1, 1); pile(-12.5, 5.5, 2, 2, 2);
    pile(0.5, 2.0, 1, 1, 3); pile(3.5, 8.0, 2, 2, 2); pile(-3.5, 8.0, 2, 1, 1);
    pile(10.0, -6.5, 2, 2, 2); pile(13.0, 8.5, 1, 2, 1);

    // ---------- контейнеры (+ ступени из ящиков наверх) ----------
    b.box(M.contG, 6.0, 2.6, 2.4, 10.5, 1.3, 5.5, { solid: true, tile: 2.6 });
    stairsX(7.5, -1, 5.5, 1.4, 5, 0.52, 0.9, M.crate);
    b.box(M.contR, 6.0, 2.6, 2.4, -6.0, 1.3, 12.8, { solid: true, tile: 2.6 });
    stairsX(-3.0, +1, 12.8, 1.4, 5, 0.52, 0.9, M.crateD);
    b.box(M.steel, 0.12, 2.5, 0.08, 10.5 - 3.0, 1.3, 5.5 + 1.22);
    b.box(M.steel, 0.12, 2.5, 0.08, 10.5 + 3.0, 1.3, 5.5 + 1.22);
    b.box(M.steel, 0.12, 2.5, 0.08, -6.0 - 3.0, 1.3, 12.8 + 1.22);
    b.box(M.steel, 0.12, 2.5, 0.08, -6.0 + 3.0, 1.3, 12.8 + 1.22);

    // ---------- погрузчик ----------
    var fx = -2.0, fz = 3.0;
    b.box(M.fork, 1.2, 0.75, 2.0, fx, 0.62, fz, { solid: true });
    b.box(M.forkDark, 1.2, 0.8, 0.5, fx, 0.7, fz + 1.05);
    b.box(M.forkDark, 0.5, 0.15, 0.5, fx, 1.07, fz + 0.15);
    var fS = [-0.75, 0.75];
    for (var sx3 = -1; sx3 <= 1; sx3 += 2) for (var wi4 = 0; wi4 < 2; wi4++) {
      b.cyl(M.tire, 0.33, 0.33, 0.26, 12, fx + sx3 * 0.6, 0.33, fz + fS[wi4], { rz: Math.PI / 2 });
    }
    var fM = [-0.2, 0.55];
    for (var sx4 = -1; sx4 <= 1; sx4 += 2) for (var mi = 0; mi < 2; mi++) {
      b.box(M.forkDark, 0.07, 1.15, 0.07, fx + sx4 * 0.52, 1.6, fz + fM[mi]);
    }
    b.box(M.fork, 1.18, 0.07, 0.95, fx, 2.2, fz + 0.18);
    b.solidR(fx - 0.59, fx + 0.59, 2.15, 2.25, fz - 0.3, fz + 0.66);
    b.box(M.forkDark, 0.09, 2.3, 0.1, fx - 0.4, 1.35, fz - 1.15);
    b.box(M.forkDark, 0.09, 2.3, 0.1, fx + 0.4, 1.35, fz - 1.15);
    b.box(M.forkDark, 0.9, 0.12, 0.1, fx, 2.2, fz - 1.15); b.box(M.forkDark, 0.9, 0.12, 0.1, fx, 0.9, fz - 1.15);
    b.solidR(fx - 0.45, fx + 0.45, 0, 2.4, fz - 1.22, fz - 1.08);
    b.box(M.forkDark, 0.12, 0.05, 1.1, fx - 0.3, 0.1, fz - 1.75);
    b.box(M.forkDark, 0.12, 0.05, 1.1, fx + 0.3, 0.1, fz - 1.75);

    // ---------- бочки, шины ----------
    function barrel(x, z, mat) {
      b.cyl(mat, 0.29, 0.29, 0.88, 12, x, 0.44, z); b.cyl(M.dark, 0.3, 0.3, 0.04, 12, x, 0.86, z); b.cyl(M.dark, 0.3, 0.3, 0.04, 12, x, 0.44, z);
      b.solidC(x, 0.44, z, 0.5, 0.88, 0.5);
    }
    barrel(13.2, -7.5, M.bRed); barrel(13.9, -7.0, M.bBlue); barrel(13.4, -6.2, M.bYel);
    barrel(12.6, -6.9, M.bRed); barrel(14.0, -5.9, M.bGreen);
    barrel(-13.5, 3.0, M.bBlue); barrel(-13.0, 3.7, M.bRed); barrel(-13.9, 3.9, M.bYel);
    b.torus(M.tire, 0.33, 0.13, -13.8, 0.13, 8.0, { rx: Math.PI / 2 });
    b.torus(M.tire, 0.33, 0.13, -13.8, 0.39, 8.0, { rx: Math.PI / 2 });
    b.torus(M.tire, 0.33, 0.13, -13.8, 0.65, 8.0, { rx: Math.PI / 2 });
    b.solidC(-13.8, 0.39, 8.0, 0.9, 0.78, 0.9);
    b.torus(M.tire, 0.33, 0.13, -12.7, 0.13, 8.4, { rx: Math.PI / 2 }); b.solidC(-12.7, 0.13, 8.4, 0.9, 0.26, 0.9);

    // ---------- заборы из гофры (передние углы) ----------
    function fence(x0, x1, z) {
      var n = Math.round((x1 - x0) / 3.2);
      for (var i = 0; i <= n; i++) b.box(M.wood, 0.2, 2.9, 0.2, x0 + i * (x1 - x0) / n, 1.45, z);
      var w = (x1 - x0) / n;
      for (var j = 0; j < n; j++) {
        var cx = x0 + (j + 0.5) * w;
        b.box(M.fence, w - 0.05, 1.3, 0.06, cx, 0.75, z + 0.12, { rz: rn(-0.02, 0.02), tile: 3 });
        b.box(M.fence, w - 0.05, 1.1, 0.06, cx, 2.0, z - 0.12, { rz: rn(-0.03, 0.03), tile: 3 });
        b.box(M.wood, w - 0.1, 0.12, 0.08, cx, 1.45, z + 0.18);
      }
      b.solidR(x0 - 0.1, x1 + 0.1, 0, 2.9, z - 0.2, z + 0.2);
    }
    fence(-14.5, -8.5, 10.7); fence(9.5, 14.5, 10.7);

    // ---------- доп. декор по свободным местам ----------
    var reserved = [
      [-13.2, -10.2, -4.3, 1.4],   // подход к лестнице на балкон
      [1.0, 8.4, 3.8, 7.4],        // ступени на зелёный контейнер
      [-3.6, 2.4, 11.0, 14.8],     // ступени на красный контейнер
      [3.4, 8.6, -4.7, -2.1],      // ступени на низкий стеллаж
      [10.2, 15.5, -12, -6.5],     // задние ворота
      [12.5, 19, -0.5, 5.5],       // проём в правой стене
      [-6.2, 6.2, -9.8, -8.2],     // ряд стеллажей A
      [-5.2, 4.2, -4.1, -2.7],     // ряд стеллажей B
      [-7.0, 0.0, -6.9, -5.3]      // верстак
    ];
    function freeSpot(w, d, m) {
      m = m === undefined ? 0.6 : m;
      for (var t = 0; t < 80; t++) {
        var x = rn(-17, 17), z = rn(-13, 13);
        var x0 = x - w / 2 - m, x1 = x + w / 2 + m, z0 = z - d / 2 - m, z1 = z + d / 2 + m;
        var ok = true;
        for (var si = 0; si < b.solids.length; si++) {
          var q = b.solids[si];
          if (q.minY > -1 && q.maxY > 0.05 && x1 > q.minX && x0 < q.maxX && z1 > q.minZ && z0 < q.maxZ) { ok = false; break; }
        }
        if (!ok) continue;
        for (var ri = 0; ri < reserved.length; ri++) {
          var r = reserved[ri];
          if (x1 > r[0] && x0 < r[1] && z1 > r[2] && z0 < r[3]) { ok = false; break; }
        }
        if (!ok) continue;
        return [x, z];
      }
      return null;
    }
    for (var ei = 0; ei < 12; ei++) {
      var nx = 1 + Math.floor(rng() * 2), nz = 1 + Math.floor(rng() * 2), lv = 1 + Math.floor(rng() * 3);
      var p = freeSpot(nx * 1.1, nz * 1.1, 0.5); if (p) pile(p[0], p[1], nx, nz, lv);
    }
    for (var gi = 0; gi < 5; gi++) {
      var pg = freeSpot(1.6, 1.6, 0.4); if (!pg) continue;
      var mats2 = [M.bRed, M.bBlue, M.bYel, M.bGreen];
      var nB = 3 + Math.floor(rng() * 3);
      for (var k2 = 0; k2 < nB; k2++) {
        barrel(pg[0] + (k2 % 2) * 0.62 + rn(-0.04, 0.04), pg[1] + Math.floor(k2 / 2) * 0.62 + rn(-0.04, 0.04), mats2[Math.floor(rng() * 4)]);
      }
    }
    for (var ci = 0; ci < 3; ci++) {           // кабельные катушки
      var pc = freeSpot(1.3, 1.0, 0.5); if (!pc) continue;
      var xx = pc[0], zz = pc[1];
      b.cyl(M.wood, 0.62, 0.62, 0.07, 14, xx - 0.38, 0.62, zz, { rz: Math.PI / 2 });
      b.cyl(M.wood, 0.62, 0.62, 0.07, 14, xx + 0.38, 0.62, zz, { rz: Math.PI / 2 });
      b.cyl(M.dark, 0.22, 0.22, 0.7, 10, xx, 0.62, zz, { rz: Math.PI / 2 });
      b.cyl(M.steel, 0.5, 0.5, 0.66, 14, xx, 0.62, zz, { rz: Math.PI / 2 });
      b.solidC(xx, 0.62, zz, 0.95, 1.24, 1.24);
    }
    var sack = std({ color: 0xb4a275, roughness: 1 });
    for (var si2 = 0; si2 < 3; si2++) {        // мешки (пирамидка)
      var ps = freeSpot(1.6, 0.9, 0.4); if (!ps) continue;
      for (var l2 = 0; l2 < 3; l2++) for (var k3 = 0; k3 < 3 - l2; k3++) {
        var sx5 = ps[0] + (k3 - (2 - l2) / 2) * 0.62, sy5 = 0.13 + l2 * 0.26;
        b.box(sack, 0.6, 0.26, 0.4, sx5, sy5, ps[1], { ry: rn(-0.08, 0.08) }); b.solidC(sx5, sy5, ps[1], 0.6, 0.26, 0.4);
      }
    }
    for (var bi = 0; bi < 4; bi++) {           // газовые баллоны и канистры
      var pb = freeSpot(1.0, 1.0, 0.3); if (!pb) continue;
      for (var k4 = 0; k4 < 3; k4++) {
        var bx4 = pb[0] + k4 * 0.3, bz4 = pb[1] + rn(-0.1, 0.1);
        b.cyl(M.bRed, 0.12, 0.12, 1.0, 10, bx4, 0.5, bz4); b.cyl(M.steel, 0.05, 0.05, 0.1, 6, bx4, 1.05, bz4);
      }
      b.solidC(pb[0] + 0.3, 0.5, pb[1], 0.84, 1.0, 0.3);
      b.box(M.bGreen, 0.35, 0.45, 0.16, pb[0] + 1.0, 0.225, pb[1] + 0.3, { ry: rn(-0.5, 0.5) });
    }
    // верстак у офиса
    b.box(M.wood, 2.2, 0.08, 0.9, -3.5, 0.9, -6.1, { tile: 1.5 });
    b.box(M.steel, 0.08, 0.86, 0.08, -3.5 - 1.02, 0.43, -6.1 - 0.38);
    b.box(M.steel, 0.08, 0.86, 0.08, -3.5 - 1.02, 0.43, -6.1 + 0.38);
    b.box(M.steel, 0.08, 0.86, 0.08, -3.5 + 1.02, 0.43, -6.1 - 0.38);
    b.box(M.steel, 0.08, 0.86, 0.08, -3.5 + 1.02, 0.43, -6.1 + 0.38);
    b.box(M.wood, 2.1, 0.06, 0.8, -3.5, 0.3, -6.1); b.box(M.bRed, 0.5, 0.26, 0.3, -3.0, 1.07, -6.1); b.box(M.steel, 0.2, 0.2, 0.14, -4.2, 1.04, -6.0);
    b.solidR(-4.6, -2.4, 0, 0.94, -6.55, -5.65);
    // стойки-ограничители у задних ворот
    for (var so = 0; so < 5; so++) {
      var x5 = 11.0 + so * 0.9, z5 = -8.8;
      b.cyl(M.bYel, 0.09, 0.09, 1.0, 8, x5, 0.5, z5); b.cyl(M.dark, 0.095, 0.095, 0.14, 8, x5, 0.62, z5); b.cyl(M.dark, 0.095, 0.095, 0.14, 8, x5, 0.9, z5);
      b.solidC(x5, 0.5, z5, 0.18, 1.0, 0.18);
    }
    // цепи с крюками под фермами
    var chainPos = [[-9, -2], [-3, -6], [3, 1.5], [9, -4], [9, 7]];
    for (var chi = 0; chi < chainPos.length; chi++) {
      var cx6 = chainPos[chi][0], cz6 = chainPos[chi][1];
      b.box(M.dark, 0.04, 1.8, 0.04, cx6, 5.05, cz6); b.box(M.steel, 0.22, 0.05, 0.05, cx6, 4.12, cz6); b.box(M.steel, 0.05, 0.25, 0.05, cx6 + 0.1, 3.98, cz6);
    }
    // упавшие листы кровли и мусор на полу (без коллизий — ниже шага)
    for (var fi = 0; fi < 4; fi++) {
      var pf = freeSpot(3, 1.5, 0.3); if (!pf) continue;
      b.box(M.roof, 3.6, 0.04, 1.8, pf[0], 0.06, pf[1], { ry: rng() * TAU, rx: rn(-0.05, 0.05), rz: rn(-0.05, 0.05), tile: 3 });
    }
    for (var di = 0; di < 70; di++) {
      var dx5 = rn(-17, 17), dz5 = rn(-13, 13);
      var hit = false;
      for (var si3 = 0; si3 < b.solids.length; si3++) {
        var s3 = b.solids[si3];
        if (s3.minY > -1 && s3.maxY > 0.05 && dx5 > s3.minX - 0.1 && dx5 < s3.maxX + 0.1 && dz5 > s3.minZ - 0.1 && dz5 < s3.maxZ + 0.1) { hit = true; break; }
      }
      if (hit) continue;
      var k5 = rng();
      if (k5 < 0.45) b.box(M.wood, rn(0.5, 1.4), 0.05, 0.1, dx5, 0.03, dz5, { ry: rng() * TAU, rz: rn(-0.08, 0.08) });
      else if (k5 < 0.8) b.box(M.crateD, rn(0.2, 0.45), 0.12, rn(0.2, 0.4), dx5, 0.06, dz5, { ry: rng() * TAU });
      else b.box(M.tire, rn(0.8, 1.6), 0.012, rn(0.6, 1.2), dx5, 0.008, dz5, { ry: rng() * TAU });
    }

    // ---------- лампы под крышей ----------
    var lampPos = [[-9, -5], [-3, 5], [3, -5], [9, 5], [3, 5], [-9, 5]];
    for (var li2 = 0; li2 < lampPos.length; li2++) {
      var lx3 = lampPos[li2][0], lz3 = lampPos[li2][1];
      b.box(M.dark, 0.02, 0.5, 0.02, lx3, 5.75, lz3);
      b.cyl(M.dark, 0.1, 0.38, 0.26, 10, lx3, 5.38, lz3); b.sphere(M.bulb, 0.09, lx3, 5.2, lz3);
    }

    // ---------- столб ЛЭП снаружи ----------
    b.box(M.wood, 0.32, 9.5, 0.32, -20.5, 4.75, -6, { tile: 2 });
    b.box(M.wood, 2.4, 0.16, 0.16, -20.5, 8.8, -6); b.box(M.wood, 2.0, 0.14, 0.14, -20.5, 7.9, -6);
    b.cyl(M.glass, 0.05, 0.05, 0.16, 6, -21.5, 8.98, -6);
    b.cyl(M.glass, 0.05, 0.05, 0.16, 6, -20.5, 8.98, -6);
    b.cyl(M.glass, 0.05, 0.05, 0.16, 6, -19.5, 8.98, -6);

    // ---------- сорняки в трещинах плит ----------
    var gp = [], gc = [];
    for (var wi3 = 0; wi3 < 110; wi3++) {
      var wx5 = rn(-18, 18), wz5 = rn(-14, 14);
      var hit2 = false;
      for (var si4 = 0; si4 < b.solids.length; si4++) {
        var s4 = b.solids[si4];
        if (s4.maxY > 0.2 && wx5 > s4.minX - 0.4 && wx5 < s4.maxX + 0.4 && wz5 > s4.minZ - 0.4 && wz5 < s4.maxZ + 0.4) { hit2 = true; break; }
      }
      if (hit2) continue;
      var n2 = 4 + Math.floor(rng() * 4);
      for (var k6 = 0; k6 < n2; k6++) {
        var a = rng() * TAU, ox = wx5 + Math.cos(a) * rn(0, 0.15), oz = wz5 + Math.sin(a) * rn(0, 0.15);
        var h3 = rn(0.25, 0.6), wd = 0.05, lean = rn(0.05, 0.2), la = rng() * TAU;
        var tx = ox + Math.cos(la) * lean, tz = oz + Math.sin(la) * lean;
        var px2 = -Math.sin(a) * wd, pz2 = Math.cos(a) * wd;
        gp.push(ox - px2, 0.02, oz - pz2, ox + px2, 0.02, oz + pz2, tx, h3, tz);
        var g1 = rn(0.25, 0.45);
        gc.push(0.08, 0.2, 0.05, 0.08, 0.2, 0.05, 0.3, g1 + 0.2, 0.1);
      }
    }
    var grassGeo = new THREE.BufferGeometry();
    grassGeo.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    grassGeo.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3));
    grassGeo.computeVertexNormals();

    // ---------- сборка: слить боксы по материалам ----------
    var group = new THREE.Group(); group.name = 'BrixBarn';
    var geos = [], mats = [];
    b.parts.forEach(function (geosOfMat, mat) {
      var g = mergeGeos(geosOfMat);
      var mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
      geos.push(g); mats.push(mat);
    });
    var grassMesh = new THREE.Mesh(grassGeo, M.grass);
    grassMesh.receiveShadow = true; group.add(grassMesh);
    geos.push(grassGeo); mats.push(M.grass);

    return { group: group, solids: b.solids, geos: geos, mats: mats };
  }

  /* ============================================================
     ПЛАНИРОВЩИК: 2 места под амбары (детерминированно по сиду)
     ============================================================ */
  var planned = false;
  var spots = [];

  /* ============================================================
     ПЛАНИРОВЩИК: места под амбары берём из ТЕРРЕЙНА (T.barnPads —
     ровные площадки в формуле рельефа, 1:1 на клиенте и сервере).
     Здесь остаётся только поворот (0/90/180/270° — AABB осевые).
     ============================================================ */

  function plan() {
    if (planned) return spots;
    planned = true;
    spots = [];
    var T = window.BrixTerrain;
    if (!T || window.BRIX_PVP) return spots;
    var pads = T.barnPads ? T.barnPads() : [];
    var rng = rngFrom(5501 + seedOff());
    for (var i = 0; i < pads.length; i++) {
      spots.push({
        x: pads[i].x,
        z: pads[i].z,
        y: pads[i].y,
        rot: Math.floor(rng() * 4) * Math.PI / 2
      });
    }
    return spots;
  }

  /** точка внутри зоны амбара (с запасом margin) — деревья/руды/трава не ставятся */
  function blocks(x, z, margin) {
    if (!spots.length) return false;
    margin = margin === undefined ? 3 : margin;
    for (var i = 0; i < spots.length; i++) {
      var s = spots[i], c = Math.cos(s.rot), sn = Math.sin(s.rot);
      var dx = x - s.x, dz = z - s.z;
      var lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      if (Math.abs(lx) < 19 + margin && Math.abs(lz) < 15 + margin) return true;
    }
    return false;
  }

  /* ============================================================
     ПОСТРОЙКА В СЦЕНЕ + ФИЗИКА
     ============================================================ */
  var built = false;
  var inited = false;
  var boxes = [];        // мировые AABB → controls.addBoxColliders
  var groups = [];       // THREE.Group в сцене
  var sceneRef = null;   // для dispose
  var geosAll = [], matsAll = [];

  /** локальный AABB → мировой (поворот кратен 90° — оси совпадают) */
  function worldBox(s, gx, gy, gz, yaw) {
    var c = Math.round(Math.cos(yaw)), sn = Math.round(Math.sin(yaw));
    var ax = s.minX * c + s.minZ * sn, az = -s.minX * sn + s.minZ * c;
    var bx = s.maxX * c + s.maxZ * sn, bz = -s.maxX * sn + s.maxZ * c;
    return {
      minX: gx + Math.min(ax, bx), maxX: gx + Math.max(ax, bx),
      minZ: gz + Math.min(az, bz), maxZ: gz + Math.max(az, bz),
      minY: gy + s.minY, maxY: gy + s.maxY,
      active: true
    };
  }

  function build(scene) {
    if (built) return api;
    built = true;
    var T = window.BrixTerrain;
    var list = plan();
    if (!T || !list.length || !scene) return api;
    sceneRef = scene;
    for (var k = 0; k < list.length; k++) {
      var s = list[k];
      var rng = rngFrom(11000 + k * 977 + (seedOff() & 1023));
      var parts = buildBarnGeometry(rng, 'АМБАР №' + (k + 1));
      // посадка: плита ложится по САМОЙ ВЫСОКОЙ точке отрисованной сетки под ней
      var c = Math.cos(s.rot), sn = Math.sin(s.rot);
      var hi = -1e9;
      for (var i = -3; i <= 3; i++) {
        for (var j = -2; j <= 2; j++) {
          var lx = i * 6, lz = j * 6;
          var wx = s.x + lx * c + lz * sn;
          var wz = s.z - lx * sn + lz * c;
          var h = (T.meshHeightAt ? T.meshHeightAt(wx, wz) : T.heightAt(wx, wz));
          if (h > hi) hi = h;
        }
      }
      var gy = hi + 0.04;
      parts.group.position.set(s.x, gy, s.z);
      parts.group.rotation.y = s.rot;
      scene.add(parts.group);
      groups.push(parts.group);
      geosAll.push.apply(geosAll, parts.geos);
      matsAll.push.apply(matsAll, parts.mats);
      // AABB плиты — «пол» амбара в floorAt (по ней ходим внутри)
      for (var si = 0; si < parts.solids.length; si++) {
        boxes.push(worldBox(parts.solids[si], s.x, gy, s.z, s.rot));
      }
      console.log('[BrixBarn] амбар №' + (k + 1) + ': ' + s.x + ' : ' + s.z +
        ' (поворот ' + Math.round(s.rot * 180 / Math.PI) + '°, солидов ' + parts.solids.length + ')');
    }
    inited = true;
    window.__brixBarns = list.map(function (s) { return { x: s.x, z: s.z, rot: s.rot }; });
    return api;
  }

  /** пол под ногами: верх плиты/ящиков/контейнеров/офиса/балкона
      (контракт building.floorAt — вызывается из gameworld groundAt) */
  function floorAt(x, z, feetY) {
    if (!inited) return null;
    var best = null;
    var lim = feetY + 0.55;                       // та же ступенька, что у построек
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (b.active === false) continue;
      if (x < b.minX - 0.3 || x > b.maxX + 0.3 || z < b.minZ - 0.3 || z > b.maxZ + 0.3) continue;
      if (b.maxY <= lim && (best === null || b.maxY > best)) best = b.maxY;
    }
    return best;
  }

  function dispose() {
    if (sceneRef) {
      for (var i = 0; i < groups.length; i++) sceneRef.remove(groups[i]);
    }
    sceneRef = null;
    groups.length = 0;
    geosAll.forEach(function (g) { g.dispose(); });
    matsAll.forEach(function (m) { m.dispose(); });
    geosAll.length = 0; matsAll.length = 0; boxes.length = 0;
    inited = false; built = false; planned = false; spots = [];
    window.__brixBarns = null;
  }

  var api = {
    plan: plan,
    build: build,
    floorAt: floorAt,
    blocks: blocks,
    isReady: function () { return inited; },
    list: function () { return window.__brixBarns || []; },
    boxes: boxes,          /* мировые AABB для controls.addBoxColliders */
    dispose: dispose
  };
  return api;
})();
