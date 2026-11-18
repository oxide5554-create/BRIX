/* ============================================================
 *  brix • js/game/remoteplayer.js — ДРУГИЕ ИГРОКИ (v0.3.1)
 *
 *  Персонаж в стиле Rust: голый торс, серые шорты, лысая голова
 *  с ЛИЦОМ (глаза с зрачками, уши, нос, борода), босые ступни.
 *  ВЕРХНЯЯ ЧАСТЬ ТЕЛА (торс+шорты+шея+голова+лицо) — ОДИН МЕШ:
 *  все детали слиты в единую BufferGeometry с vertex-цветами и
 *  сглаженными нормалями — никакой блочности, гладкая «скульптура».
 *  Руки/ноги — гладкие капсулы (кожа), кисти — сферы.
 *
 *  Анимации — процедурные (каждый кадр считаются углы суставов):
 *   idle (дыхание), run (бег), jump (прыжок),
 *   atk1/atk2 (замах-удар тем, что в руке).
 *  В руке — НАСТОЯЩАЯ 3Д-МОДЕЛЬ инструмента (GLB: каменный/железный
 *  топор, каменная/железная кирка — те же файлы, что у рук 1-го лица).
 *
 *  Позиция/поворот — интерполяция к данным сети (12 Гц).
 * ============================================================ */
window.BrixRemotePlayer = (function () {
  'use strict';

  var SWING_DUR = 0.55;      // длительность удара — как в 1-м лице
  // ✅ v0.4.5: длительности боевых анимаций (синхронно с 1-м лицом)
  var ANIM_DUR = { atk1: 0.55, atk2: 0.55, shoot: 0.35, reload: 2.2 };
  // ✅ v0.4.19: у дробовика свои тайминги (синхронно с gameworld.js)
  var SG_ANIM = { shoot: 0.9, reload: 2.6 };
  var animDurFor = function (a, tool) {
    if (tool === 'shotgun' && SG_ANIM[a] !== undefined) return SG_ANIM[a];
    return ANIM_DUR[a] || SWING_DUR;
  };
  // ✅ v0.4.5: разворот револьвера в кисти (ствол вперёд, как в 1-м лице)
  var REV_REMOTE = {
    rot: { x: -0.15, y: Math.PI / 2 + 0.05, z: 0 },
    pos: { x: 0.02, y: -0.03, z: -0.06 }
  };
  // ✅ v0.4.19: разворот ДРОБОВИКА в кисти (длинный — чуть наклонён вниз,
  // чтобы не тыкался в небо; рукоять в правой руке, ствол вперёд)
  var SG_REMOTE = {
    rot: { x: -0.08, y: Math.PI / 2 + 0.05, z: 0 },
    pos: { x: 0.02, y: -0.03, z: -0.06 }
  };
  // ✅ v0.4.21: разворот КАЛАША в кисти (ствол длинный — чуть вниз;
  // сам ak47.glb разворачивается в загрузчике: ствол из +Y → −Z)
  var RIFLE_REMOTE = {
    rot: { x: -0.08, y: Math.PI / 2 + 0.05, z: 0 },
    pos: { x: 0.02, y: -0.03, z: -0.06 }
  };

  // палитра «Rust-персонажа»
  var SKIN = 0xc9996f;       // кожа (посветлее, чтобы читалась)
  var HAIR = 0x3a2a1a;       // тёмно-каштановые волосы/борода
  var SHORTS = 0x9a9488;     // серые выцветшие шорты
  var EYE_WHITE = 0xe8e2d6;
  var PUPIL = 0x241d15;

  var BODY_MAT = null;       // ОДИН материал на весь персонаж (vertexColors)
  var TOOLS = null;          // {axe, pickaxe, ironPickaxe, ironAxe} — GLB
  var TOOL_WAITERS = null;

  function ensureMat() {
    if (BODY_MAT) return;
    BODY_MAT = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      emissive: 0x241c14     // чтобы персонаж читался в тени
    });
  }

  /* ---------- слепление геометрии ---------- */

  /** геометрия с готовым цветом (vertex colors) */
  function painted(geo, hex, matrix) {
    var g = geo.toNonIndexed();
    if (matrix) g.applyMatrix4(matrix);
    var n = g.attributes.position.count;
    var colors = new Float32Array(n * 3);
    var c = new THREE.Color(hex);
    for (var i = 0; i < n; i++) {
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }

  /** СЛИЯНИЕ нескольких геометрий в ОДНУ (позиции/нормали/цвета) */
  function mergeGeos(list) {
    var total = 0;
    list.forEach(function (g) { total += g.attributes.position.count; });
    var pos = new Float32Array(total * 3);
    var nor = new Float32Array(total * 3);
    var col = new Float32Array(total * 3);
    var off = 0;
    list.forEach(function (g) {
      pos.set(g.attributes.position.array, off);
      nor.set(g.attributes.normal.array, off);
      col.set(g.attributes.color.array, off);
      off += g.attributes.position.count * 3;
      g.dispose();
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return out;
  }

  /** вариация цвета по треугольникам — чтобы волосы не были «плоскими» */
  function hairify(geo, amt) {
    var col = geo.attributes.color.array;
    for (var t = 0; t < col.length; t += 9) {
      var h = (t * 2654435761) % 1000 / 1000;          // псевдослучайно, стабильно
      var f = 1 + (h - 0.5) * 2 * (amt || 0.16);
      for (var k = 0; k < 9; k++) col[t + k] = Math.min(1, Math.max(0, col[t + k] * f));
    }
    return geo;
  }

  function mat4(px, py, pz, rx, ry, rz, sx, sy, sz) {
    var m = new THREE.Matrix4();
    var q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0));
    m.compose(new THREE.Vector3(px, py, pz), q, new THREE.Vector3(sx || 1, sy || 1, sz || 1));
    return m;
  }

  /** гладкая капсула: общая длина len, ВЕРХ в суставе (y=0), свисает вниз */
  function capsuleGeo(r, len) {
    var g = new THREE.CapsuleGeometry(r, Math.max(len - 2 * r, 0.01), 4, 12);
    g.translate(0, -len / 2, 0);
    return g;
  }

  /** БОРДА: сфера, обрезанная по нижней ПЕРЕДНЕЙ части головы
   *  (фильтр в локальных координатах сферы; модель смотрит на -Z) */
  function beardGeo() {
    var g = new THREE.SphereGeometry(0.153, 16, 12).toNonIndexed();
    var src = g.attributes.position.array;
    var keep = [];
    for (var t = 0; t < src.length; t += 9) {
      var cy = (src[t + 1] + src[t + 4] + src[t + 7]) / 3;
      var cz = (src[t + 2] + src[t + 5] + src[t + 8]) / 3;
      // нижняя треть и передняя часть лица
      if (cy < -0.02 && cz < 0.06) {
        for (var k = 0; k < 9; k++) keep.push(src[t + k]);
      }
    }
    g.dispose();
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(keep), 3));
    out.computeVertexNormals();
    return out;
  }

  /** ВЕРХ ТЕЛА ОДНИМ МЕШОМ: торс + шорты + шея + голова + лицо */
  function buildBodyCore() {
    var parts = [];

    // торс (голый): тело вращения от пояса к плечам
    var torsoPts = [
      new THREE.Vector2(0.001, 1.00),
      new THREE.Vector2(0.155, 1.01),
      new THREE.Vector2(0.150, 1.10),
      new THREE.Vector2(0.163, 1.20),
      new THREE.Vector2(0.190, 1.30),
      new THREE.Vector2(0.205, 1.38),
      new THREE.Vector2(0.190, 1.44),
      new THREE.Vector2(0.105, 1.50),
      new THREE.Vector2(0.001, 1.53)
    ].map(function (v) { return new THREE.Vector2(v.x, v.y); });
    var torso = painted(new THREE.LatheGeometry(torsoPts, 20), SKIN, null);
    // пропорции: широкие плечи, плоская грудь
    torso.applyMatrix4(mat4(0, 0, 0, 0, 0, 0, 1.18, 1, 0.78));
    parts.push(torso);

    // шорты (серые): от середины бедра до пояса
    var shortsPts = [
      new THREE.Vector2(0.001, 0.70),
      new THREE.Vector2(0.175, 0.71),
      new THREE.Vector2(0.178, 0.88),
      new THREE.Vector2(0.170, 1.00),
      new THREE.Vector2(0.150, 1.06),
      new THREE.Vector2(0.001, 1.07)
    ].map(function (v) { return new THREE.Vector2(v.x, v.y); });
    var shorts = painted(new THREE.LatheGeometry(shortsPts, 20), SHORTS, null);
    shorts.applyMatrix4(mat4(0, 0, 0, 0, 0, 0, 1.22, 1, 0.9));
    parts.push(shorts);

    // шея
    parts.push(painted(new THREE.CylinderGeometry(0.055, 0.062, 0.09, 10), SKIN, mat4(0, 1.555, 0)));

    // голова (лысая, как в референсе)
    parts.push(painted(new THREE.SphereGeometry(0.145, 18, 14), SKIN, mat4(0, 1.665, 0.01, 0, 0, 0, 0.92, 1.06, 0.96)));

    // уши
    parts.push(painted(new THREE.SphereGeometry(0.03, 8, 6), SKIN, mat4(-0.132, 1.67, 0.02, 0, 0, 0, 0.6, 1, 0.8)));
    parts.push(painted(new THREE.SphereGeometry(0.03, 8, 6), SKIN, mat4(0.132, 1.67, 0.02, 0, 0, 0, 0.6, 1, 0.8)));

    // нос
    parts.push(painted(new THREE.SphereGeometry(0.028, 8, 6), SKIN, mat4(0, 1.655, -0.135, 0, 0, 0, 0.8, 1.1, 0.9)));

    // ГЛАЗА: белки + зрачки (лицо смотрит на -Z)
    parts.push(painted(new THREE.SphereGeometry(0.026, 10, 8), EYE_WHITE, mat4(-0.055, 1.685, -0.108, 0, 0, 0, 1, 1.1, 0.55)));
    parts.push(painted(new THREE.SphereGeometry(0.026, 10, 8), EYE_WHITE, mat4(0.055, 1.685, -0.108, 0, 0, 0, 1, 1.1, 0.55)));
    parts.push(painted(new THREE.SphereGeometry(0.012, 8, 6), PUPIL, mat4(-0.055, 1.682, -0.129)));
    parts.push(painted(new THREE.SphereGeometry(0.012, 8, 6), PUPIL, mat4(0.055, 1.682, -0.129)));

    // ВОЛОСЫ: борода-«щетка» с вариацией цвета, усы, брови
    parts.push(hairify(painted(beardGeo(), HAIR, mat4(0, 1.665, 0.012)), 0.22));
    // усы над верхней губой
    parts.push(hairify(painted(new THREE.SphereGeometry(0.052, 10, 6), HAIR,
      mat4(0, 1.628, -0.125, 0, 0, 0, 1.7, 0.5, 0.6)), 0.2));
    // брови
    parts.push(hairify(painted(new THREE.SphereGeometry(0.038, 8, 5), HAIR,
      mat4(-0.058, 1.718, -0.112, 0.15, 0, 0.12, 1.9, 0.4, 0.55)), 0.15));
    parts.push(hairify(painted(new THREE.SphereGeometry(0.038, 8, 5), HAIR,
      mat4(0.058, 1.718, -0.112, 0.15, 0, -0.12, 1.9, 0.4, 0.55)), 0.15));

    var geo = mergeGeos(parts);
    return new THREE.Mesh(geo, BODY_MAT);
  }

  /* ---------- инструменты (GLB — те же файлы, что у рук 1-го лица) ---------- */

  /** подгонка модели инструмента КАК В РУКАХ 1-ГО ЛИЦА (BrixFirstPerson):
   *  находим длинную ось (рукоять), ориентируем её вдоль +Y головой вверх,
   *  нижний конец рукояти — в (0,0,0), масштаб к targetLen */
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
    var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (var i2 = 0; i2 < n; i2++) {
      for (var k = 0; k < 3; k++) {
        var c = P[i2 * 3 + k];
        if (c < mn[k]) mn[k] = c;
        if (c > mx[k]) mx[k] = c;
      }
    }
    var size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
    var L = size.indexOf(Math.max(size[0], size[1], size[2]));
    if (size[L] < 1e-6) return;
    var o1 = (L + 1) % 3, o2 = (L + 2) % 3;
    var span = function (lo, hi) {
      var a = [1e9, 1e9], b = [-1e9, -1e9];
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
    var latAxis = headS[0] >= headS[1] ? o1 : o2;
    var ex = new THREE.Vector3().setComponent(latAxis, 1);
    var ey = new THREE.Vector3().setComponent(L, headHigh ? 1 : -1);
    var ez = new THREE.Vector3().crossVectors(ex, ey);
    proto.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, ey, ez).transpose());
    var sc = targetLen / size[L];
    proto.scale.setScalar(sc);
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
  }

  function loadTools(onReady) {
    if (TOOLS) { onReady(TOOLS); return; }
    if (TOOL_WAITERS) { TOOL_WAITERS.push(onReady); return; }
    TOOL_WAITERS = [onReady];
    TOOLS = {};
    var defs = {
      axe: ['assets/models/stone_axe.glb', 0.55],
      pickaxe: ['assets/models/stone_pickaxe.glb', 0.55],
      ironPickaxe: ['assets/models/pickaxe.glb', 0.58],
      ironAxe: ['assets/models/iron_axe.glb', 0.58],
      revolver: ['assets/models/revolver.glb', 0.30],   // ✅ v0.4.5
      shotgun: ['assets/models/shotgun.glb', 0.62],     // ✅ v0.4.19
      rifle: ['assets/models/ak47.glb', 0.72]           // ✅ v0.4.21
    };
    var left = Object.keys(defs).length;
    Object.keys(defs).forEach(function (key) {
      var url = window.BrixAsset ? window.BrixAsset(defs[key][0]) : defs[key][0];
      BrixGLB.load(url, function (group, size) {
        if (key === 'revolver' || key === 'shotgun' || key === 'rifle') {
          // револьвер/дробовик/калаш НЕ «топор»: не разворачиваем по длинной
          // оси, просто масштабируем по габаритам — поворот в _applyTool
          var sc = defs[key][1] / Math.max(size.x, size.y, size.z, 1e-6);
          group.scale.setScalar(sc);
          if (key === 'rifle') {
            // ✅ v0.4.21: у ak47.glb ствол вдоль +Y — преповорот +Y → −Z,
            // чтобы стойка в _applyTool работала как у дробовика
            group.rotation.x = -Math.PI / 2;
          }
        } else {
          fitToolLikeAxe(group, defs[key][1]);   // рукоять вдоль +Y, голова вверх, низ в нуле
        }
        var wrap = new THREE.Group();
        wrap.add(group);
        TOOLS[key] = wrap;
        if (--left === 0) {
          var arr = TOOL_WAITERS; TOOL_WAITERS = null;
          arr.forEach(function (fn) { fn(TOOLS); });
        }
      }, function () { if (--left === 0) { var arr = TOOL_WAITERS; TOOL_WAITERS = null; arr.forEach(function (fn) { fn(TOOLS); }); } });
    });
  }

  /* ---------- сам персонаж ---------- */

  function RemotePlayer(name, color) {
    ensureMat();
    loadTools(function () { this._applyTool(true); }.bind(this));

    this.name = name;
    this.color = color || '#e2572b';

    var g = new THREE.Group();          // корень (на земле, повёрнут по yaw)

    // ВЕРХ ТЕЛА — ОДИН МЕШ (торс+шорты+шея+голова+глаза+борода)
    this.core = buildBodyCore();
    g.add(this.core);

    // конечности: гладкие капсулы кожи + кисти-сферы
    this.arms = {};
    var self = this;
    ['L', 'R'].forEach(function (s) {
      var seg = {
        upper: new THREE.Mesh(capsuleGeo(0.055, 0.30), BODY_MAT),
        fore: new THREE.Mesh(capsuleGeo(0.048, 0.28), BODY_MAT),
        hand: new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), BODY_MAT),
        shoulder: new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), BODY_MAT)
      };
      // ✅ v0.3.3: держатель инструмента — в КОРНЕ персонажа (оси модели),
      // позиция каждый кадр берётся из кисти (update) — раньше держатель
      // наследовал наклон предплечья, и лезвие «смотрело назад»
      var holder = new THREE.Group();
      g.add(holder);
      seg.holder = holder;
      self.arms[s] = seg;
      g.add(seg.upper, seg.fore, seg.hand, seg.shoulder);
    });

    this.legs = {};
    ['L', 'R'].forEach(function (s) {
      var seg = {
        thigh: new THREE.Mesh(capsuleGeo(0.072, 0.46), BODY_MAT),
        shin: new THREE.Mesh(capsuleGeo(0.058, 0.44), BODY_MAT),
        knee: new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), BODY_MAT),
        foot: new THREE.Mesh(capsuleGeo(0.052, 0.20), BODY_MAT)
      };
      seg.foot.rotation.x = Math.PI / 2;         // ступня вперёд (модель смотрит на -Z)
      self.legs[s] = seg;
      g.add(seg.thigh, seg.shin, seg.knee, seg.foot);
    });

    // плашка с именем
    this.tag = nameTag(name, this.color);
    g.add(this.tag);

    // ✅ v0.4.5: полоска здоровья + боевое состояние
    this.hpBar = makeHpBar();
    g.add(this.hpBar.sp);
    this.hp = 100;
    this.dead = false;
    this._sinkT = 0;
    this._hpHideT = 0;

    // анимация
    this.animT = 0;
    this.swingT = -1;
    this.swingKind = 'atk1';
    this.cur = { x: 0, y: 0, z: 0, yaw: 0 };
    this.tgt = { x: 0, y: 0, z: 0, yaw: 0, a: 'idle', tool: '', ph: 0 };
    this.lastPh = 0;
    this.curTool = '';
    this._pendingTool = false;

    this.group = g;
    this._tmpV = new THREE.Vector3();
    this._applyTool();
  }

  RemotePlayer.prototype._applyTool = function (force) {
    if (!this.tgt) return;                 // конструктор ещё не дочистил поля
    var want = this.tgt.tool || 'axe';     // пусто — держит каменный топор
    if (!force && want === this.curTool) return;
    this.curTool = want;
    var self = this;
    ['L', 'R'].forEach(function (s) {
      var h = self.arms[s].holder;
      while (h.children.length) h.remove(h.children[0]);
    });
    if (!want) return;
    if (!TOOLS) { this._pendingTool = true; return; }
    var proto = TOOLS[want];
    if (!proto) return;
    var m = proto.clone(true);
    if (want === 'revolver' || want === 'shotgun' || want === 'rifle') {
      // ✅ v0.4.5: револьвер держится СВОЕЙ стороной — ствол вперёд
      // ✅ v0.4.19: дробовик тоже (SG_REMOTE — чуть ниже наклон)
      // ✅ v0.4.21: калаш (RIFLE_REMOTE)
      var RC = want === 'shotgun' ? SG_REMOTE : want === 'rifle' ? RIFLE_REMOTE : REV_REMOTE;
      m.rotation.set(RC.rot.x, RC.rot.y, RC.rot.z);
      m.position.set(RC.pos.x, RC.pos.y, RC.pos.z);
      this.arms.R.holder.add(m);
      this._pendingTool = false;
      return;
    }
    // лезвие модели смотрит в -Z (проверено по геометрии GLB):
    // наклон рукояти вперёд из кулака — лезвие сразу смотрит ВПЕРЁД
    m.rotation.set(-0.55, 0, 0);
    m.position.set(0.01, -0.02, -0.03);
    this.arms.R.holder.add(m);
    this._pendingTool = false;
  };

  /** поворот сегмента: капсула свисает ИЗ сустава A в направлении B
   *  (геометрия построена вниз по локальному -Y, поэтому база — вектор ВНИЗ) */
  var _v = null, _q = null, _DOWN = null;
  function aim(seg, ax, ay, az, bx, by, bz) {
    if (!_v) { _v = new THREE.Vector3(); _q = new THREE.Quaternion(); _DOWN = new THREE.Vector3(0, -1, 0); }
    _v.set(bx - ax, by - ay, bz - az);
    var l = _v.length() || 1;
    _v.divideScalar(l);
    _q.setFromUnitVectors(_DOWN, _v);
    seg.quaternion.copy(_q);
    seg.position.set(ax, ay, az);
  }

  var _fk = { ex: 0, ey: 0, ez: 0, wx: 0, wy: 0, wz: 0 };
  /** конечность (FK): сустав J, наклон a (0 = вниз, + вперёд, град),
   *  боковой разворот y (град), сгиб b (град); len1/len2 — длины сегментов */
  function limbPose(jx, jy, jz, aPitch, aYaw, bBend, len1, len2) {
    var D = Math.PI / 180;
    var ap = aPitch * D, ay = aYaw * D, ab = (aPitch + bBend) * D;
    var ex = jx + Math.sin(ay) * Math.cos(ap) * len1;
    var ey = jy - Math.cos(ap) * len1;
    var ez = jz + Math.cos(ay) * Math.sin(ap) * len1;
    var wx = ex + Math.sin(ay) * Math.cos(ab) * len2;
    var wy = ey - Math.cos(ab) * len2;
    var wz = ez + Math.cos(ay) * Math.sin(ab) * len2;
    _fk.ex = ex; _fk.ey = ey; _fk.ez = ez;
    _fk.wx = wx; _fk.wy = wy; _fk.wz = wz;
    return _fk;
  }

  /** плашка с именем над головой */
  function nameTag(name, color) {
    var cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(10,12,16,0.55)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(8, 8, 240, 48, 12); else ctx.rect(8, 8, 240, 48);
    ctx.fill();
    ctx.font = 'bold 26px Arial, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 128, 33);
    ctx.strokeStyle = color || '#e2572b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(8, 8, 240, 48, 12); else ctx.rect(8, 8, 240, 48);
    ctx.stroke();
    var tex = new THREE.CanvasTexture(cv);
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true }));
    sp.scale.set(0.9, 0.225, 1);
    sp.position.y = 2.02;
    return sp;
  }

  /** ✅ v0.4.5 ПОЛОСКА ЗДОРОВЬЯ над головой (появляется при уроне,
      прячется через 4 с). Canvas-texture — перерисовка при каждом хите */
  function makeHpBar() {
    var cv = document.createElement('canvas');
    cv.width = 128; cv.height = 16;
    var tex = new THREE.CanvasTexture(cv);
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, depthTest: false, transparent: true
    }));
    sp.scale.set(0.62, 0.078, 1);
    sp.position.y = 1.84;
    sp.visible = false;
    sp.renderOrder = 5;
    return { sp: sp, cv: cv, tex: tex };
  }

  RemotePlayer.prototype.update = function (dt, st) {
    if (st) this.tgt = st;

    // интерполяция позиции/поворота
    var k = 1 - Math.exp(-10 * dt);
    this.cur.x += (this.tgt.x - this.cur.x) * k;
    this.cur.y += (this.tgt.y - this.cur.y) * k;
    this.cur.z += (this.tgt.z - this.cur.z) * k;
    var dy = this.tgt.yaw - this.cur.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.cur.yaw += dy * k;

    var g = this.group;
    /* ✅ v0.4.28: присед чужого игрока (st.c) — модель плавно ниже и приземистей:
       стоя ноги на 1.7 ниже глаз, в приседе на 1.05; силуэт сжимается по Y */
    var crT = this.tgt.c ? 1 : 0;
    if (this._crK === undefined) this._crK = 0;
    this._crK += (crT - this._crK) * Math.min(1, dt * 8);
    var feet = 1.7 - 0.65 * this._crK;
    g.position.set(this.cur.x, this.cur.y - feet, this.cur.z);
    g.rotation.y = this.cur.yaw;
    g.scale.y = 1 - 0.38 * this._crK;

    // ✅ v0.4.5: смерть — игрок уходит под землю и исчезает
    if (this.dead) {
      this._sinkT += dt;
      g.position.y -= Math.min(this._sinkT * 1.5, 1.9);
      if (this._sinkT > 1.3) g.visible = false;
      if (this._hpHideT > 0) { this._hpHideT -= dt; if (this._hpHideT <= 0) this.hpBar.sp.visible = false; }
      return;
    }
    g.visible = true;

    // полоска хп прячется сама через 4 с после последнего урона
    if (this.hpBar.sp.visible) {
      this._hpHideT -= dt;
      if (this._hpHideT <= 0) this.hpBar.sp.visible = false;
    }

    // ✅ v0.3.3: инструмент стоит в кисти, но ориентирован от корня
    g.updateMatrixWorld(true);
    this.arms.R.hand.getWorldPosition(this._tmpV);
    if (this.arms.R.holder) {
      this.arms.R.holder.position.copy(g.worldToLocal(this._tmpV.clone()));
    }

    // удар/выстрел/перезарядка: новая фаза меньше прежней (или сменилась
    // анимация) — перезапуск
    var a = this.tgt.a || 'idle';
    if (a === 'atk1' || a === 'atk2' || a === 'shoot' || a === 'reload') {
      var dur = animDurFor(a, this.curTool);
      if (a !== this.swingKind || this.tgt.ph < this.lastPh || this.swingT < 0) {
        this.swingKind = a;
        this.swingT = Math.max(this.tgt.ph, 0.001) * dur;
      }
      this.lastPh = this.tgt.ph;
    } else {
      this.swingT = -1;
      this.lastPh = 0;
    }
    if (this.swingT >= 0) this.swingT += dt;

    this.animT += dt;
    this._pose();
    if (this._pendingTool && TOOLS) this._applyTool(true);
    else this._applyTool();
  };

  RemotePlayer.prototype._pose = function () {
    var t = this.animT;
    var swinging = this.swingT >= 0 && this.swingT < animDurFor(this.swingKind, this.curTool);

    var bob = 0, lean = 0;
    var armP = { L: 6, R: 6 }, armY = { L: 14, R: -14 }, armB = { L: 16, R: 16 };
    var legP = { L: 0, R: 0 }, legB = { L: 2, R: 2 };

    if (swinging) {
      if (this.swingKind === 'shoot') {
        // ✅ v0.4.5 ВЫСТРЕЛ: руки вскинуты вперёд (ствол в цель), короткий
        // кик отдачи вверх и плавный возврат
        var sph = Math.min(this.swingT / animDurFor('shoot', this.curTool), 1);
        var kick = Math.sin(Math.min(sph * 1.7, 1) * Math.PI);
        armP.R = -80 - kick * 14;
        armY.R = -12;
        armB.R = 12;
        armP.L = -52 - kick * 6;
        armY.L = 14;
        armB.L = 48;
      } else if (this.swingKind === 'reload') {
        // ✅ v0.4.5 ПЕРЕЗАРЯДКА: опустил оружие вниз, возится с барабаном
        var rph = Math.min(this.swingT / animDurFor('reload', this.curTool), 1);
        var dip = rph < 0.2 ? rph / 0.2 : rph > 0.85 ? Math.max(0, (1 - rph) / 0.15) : 1;
        armP.R = 6 - dip * 4;
        armY.R = -14;
        armB.R = 16 + dip * 46;
        armP.L = 4 + dip * 2;
        armY.L = 12;
        armB.L = 16 + dip * 40;
        lean = dip * 12;
      } else {
        // удар: 0..0.4 замах вверх-назад, потом резкий мах вперёд-вниз
        var ph = Math.min(this.swingT / SWING_DUR, 1);
        var sw = ph < 0.4 ? ph / 0.4 : 1 - Math.min((ph - 0.4) / 0.35, 1);
        var up = -88 * sw;
        if (this.swingKind === 'atk1') {
          armP.R = 25 + up * 0.9;
          armY.R = -20 - sw * 10;
          armB.R = 32 - sw * 26;
          lean = -3 * sw;
        } else {
          armP.R = 25 + up * 0.5;
          armY.R = -62 * sw + 20;
          armB.R = 42 - sw * 32;
          lean = -2 * sw;
        }
        armP.L = 12; armB.L = 22;
      }
    } else if (this.curTool === 'revolver' || this.curTool === 'shotgun' ||
               this.curTool === 'rifle') {
      // ✅ v0.4.5: С РЕВОЛЬВЕРОМ в руках — готовая стойка (руки вперёд),
      // а не «руки по швам»; бег/прыжок ниже переопределяют
      // ✅ v0.4.19: та же стойка с ДРОБОВИКОМ
      // ✅ v0.4.21: с КАЛАШОМ — обе руки вперёд (левая подхватывает цевьё)
      armP.R = -38; armY.R = -12; armB.R = 20;
      armP.L = -22; armY.L = 12; armB.L = 32;
      if (this.tgt.a === 'run') {
        var u2 = t * 9.5;
        legP.L = Math.sin(u2) * 42;
        legP.R = Math.sin(u2 + Math.PI) * 42;
        legB.L = Math.max(0, -Math.sin(u2)) * 55 + 8;
        legB.R = Math.max(0, -Math.sin(u2 + Math.PI)) * 55 + 8;
        armP.L = -18 + Math.sin(u2 + Math.PI) * 12;
        armP.R = -34 + Math.sin(u2) * 12;
        armB.L = 36; armB.R = 22;
        bob = Math.abs(Math.sin(u2)) * 0.045;
        lean = 9;
        /* ✅ v0.4.22: у револьвера/дробовика на бегу оружие ПРИЖАТО К ГРУДИ —
           правая рука согнута сильнее (кисть у груди, ствол вверх-влево);
           левая у револьвера машет свободно (у дробовика она и так опущена —
           отдельный оверрайд ниже, v0.4.20) */
        if (this.curTool === 'revolver' || this.curTool === 'shotgun') {
          armP.R = 2 + Math.sin(u2) * 8;
          armY.R = -24;
          armB.R = 74;
        }
        if (this.curTool === 'revolver') {
          armP.L = 8 + Math.sin(u2 + Math.PI) * 30;
          armB.L = 42;
          armY.L = 6;
        }
      } else if (this.tgt.a === 'jump') {
        legP.L = legP.R = -38;
        legB.L = legB.R = 62;
        armP.L = armP.R = -30;
        armB.L = armB.R = 26;
        lean = 6;
      } else {
        var br2 = Math.sin(t * 1.9);
        armP.R = -38 + br2 * 1.5;
        armP.L = -22 - br2 * 1.5;
        bob = br2 * 0.012;
      }
    } else if (this.tgt.a === 'run') {
      var u = t * 9.5;
      legP.L = Math.sin(u) * 42;
      legP.R = Math.sin(u + Math.PI) * 42;
      legB.L = Math.max(0, -Math.sin(u)) * 55 + 8;
      legB.R = Math.max(0, -Math.sin(u + Math.PI)) * 55 + 8;
      armP.L = 8 + Math.sin(u + Math.PI) * 30;
      armP.R = 8 + Math.sin(u) * 30;
      armB.L = 42; armB.R = 42;
      bob = Math.abs(Math.sin(u)) * 0.045;
      lean = 9;
    } else if (this.tgt.a === 'jump') {
      legP.L = legP.R = -38;
      legB.L = legB.R = 62;
      armP.L = armP.R = -28;
      armB.L = armB.R = 26;
      lean = 6;
    } else { // idle: дыхание
      var br = Math.sin(t * 1.9);
      armP.L = 6 + br * 1.5; armP.R = 6 - br * 1.5;
      armB.L = 16 + br * 2; armB.R = 16 - br * 2;
      bob = br * 0.012;
    }

    /* ✅ v0.4.20: с ДРОБОВИКОМ левая рука УБРАНА — дробовик держит
       ТОЛЬКО правая (как в 1-м лице). У чужих игроков левая рука висит
       спокойно (покой/бег/прыжок/выстрел/перезарядка — везде опущена) */
    if (this.curTool === 'shotgun') {
      if (!swinging && this.tgt.a === 'run') {
        armP.L = 8 + Math.sin(u2 + Math.PI) * 30;
        armB.L = 42; armY.L = 14;
      } else if (!swinging && this.tgt.a === 'jump') {
        armP.L = -28; armB.L = 26; armY.L = 14;
      } else {
        var brL = Math.sin(t * 1.9);
        armP.L = 6 + brL * 1.5; armB.L = 16 + brL * 2; armY.L = 14;
      }
    }

    var bobM = bob * 0.6;
    this.core.position.y = bobM;
    this.core.rotation.x = lean * Math.PI / 180;

    var shY = 1.44 + bobM * 0.7;
    var hipY = 0.98 + bobM * 0.3;

    // руки
    var self = this;
    ['L', 'R'].forEach(function (s) {
      var seg = self.arms[s];
      var jx = s === 'L' ? -0.27 : 0.27, jy = shY, jz = 0.02;
      seg.shoulder.position.set(jx, jy, jz);
      var p = limbPose(jx, jy, jz, armP[s], armY[s], armB[s], 0.30, 0.28);
      aim(seg.upper, jx, jy, jz, p.ex, p.ey, p.ez);
      aim(seg.fore, p.ex, p.ey, p.ez, p.wx, p.wy, p.wz);
      seg.hand.position.set(p.wx, p.wy, p.wz);
    });

    // ноги
    ['L', 'R'].forEach(function (s) {
      var seg = self.legs[s];
      var jx = s === 'L' ? -0.105 : 0.105, jy = hipY, jz = 0;
      var p = limbPose(jx, jy, jz, legP[s], 0, legB[s], 0.46, 0.44);
      aim(seg.thigh, jx, jy, jz, p.ex, p.ey, p.ez);
      aim(seg.shin, p.ex, p.ey, p.ez, p.wx, p.wy, p.wz);
      seg.knee.position.set(p.ex, p.ey, p.ez);
      seg.foot.position.set(p.wx, p.wy + 0.045, p.wz - 0.055);
    });
  };

  /* ---------- ✅ v0.4.5: здоровье, смерть и возрождение ---------- */

  /** обновить полоску здоровья над головой (вызывается при попадании) */
  RemotePlayer.prototype.setHp = function (hp) {
    this.hp = Math.max(0, Math.min(100, hp | 0));
    var ctx = this.hpBar.cv.getContext('2d');
    var w = 128, h = 16;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(8,10,9,0.72)';
    ctx.fillRect(0, 0, w, h);
    var f = this.hp / 100;
    ctx.fillStyle = f > 0.55 ? '#9fd47c' : f > 0.25 ? '#e0c25c' : '#e05c50';
    ctx.fillRect(2, 2, Math.max(0, (w - 4) * f), h - 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    this.hpBar.tex.needsUpdate = true;
    this.hpBar.sp.visible = this.hp < 100 && this.hp > 0 && !this.dead;
    this._hpHideT = 4;
  };

  /** умер: уходит под землю и исчезает */
  RemotePlayer.prototype.die = function () {
    if (this.dead) return;
    this.dead = true;
    this._sinkT = 0;
    this.hpBar.sp.visible = false;
  };

  /** возродился: снова видим, хп полное */
  RemotePlayer.prototype.respawn = function () {
    this.dead = false;
    this._sinkT = 0;
    this.hp = 100;
    this.hpBar.sp.visible = false;
    this.group.visible = true;
  };

  return RemotePlayer;
})();
