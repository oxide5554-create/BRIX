// ============================================================
//  brix • js/game/arena-bot.js — РИГ БОТА «ПОЛИГОНА» (v0.5.7)
//  ✅ v0.5.7: смерть — ПАДЕНИЕ КОРПУСА ОТ НОГ (inner.rotation, труп
//  лежит НА земле — раньше висел в воздухе); ноги ВДОЛЬ движения
//  (стрейф — приставной шаг с доворотом бёдер до ±86°, без маха
//  вперёд-назад); переходы состояний мягче (веса damp 11→8);
//  ✅ v0.5.2: калаш КОМПАКТНЫЙ (0.62 м) перед грудью, хват на ключицах;
//  бег ВСЕМ ТЕЛОМ (наклон, таз, скручивание, плечи, взгляд держится);
//  труп ЗАМИРАЕТ бит-в-бит
//  Порт движка процедурных анимаций из tools/bot-studio.html v3:
//  · модель — учёный ScientistRigged.glb (конверт из FBX, текстуры
//    встроены; у КРАСНОЙ команды тело перекрашено в
//    scientist_body_albedo_red.png — модель та же);
//  · СТОЙКА (дыхание, перенос веса, взгляд по сторонам), ШАГ (мах
//    бедра, сгиб колена, подскок таза, стопа), БЕГ (наклон, каденс),
//    ПРИЦЕЛ/ОГОНЬ (вскидка к глазам, отдача-пружины, палец на
//    спуске), СМЕРТЬ (корпус валится от ног, конечности подкашиваются);
//  · ХВАТ ОРУЖИЯ: правая — рукоять/спуск, левая — цевьё,
//    двухкостный IK; оружие — НАСТОЯЩИЙ игровой ak47.glb
//    (метки хвата из габаритов, как в bot-studio adoptGLB);
//    резервный процедурный АК и манекен — если GLB не читается.
// ============================================================
window.BrixBotRig = (function () {
  'use strict';

  var D2R = Math.PI / 180;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  function damp(x, y, lambda, dt) { return THREE.MathUtils.damp(x, y, lambda, dt); }
  function rnd(a, b) { return b === undefined ? Math.random() * a : a + Math.random() * (b - a); }
  function kf(u, K) {
    if (u <= K[0][0]) return K[0][1];
    for (var i = 1; i < K.length; i++) {
      if (u <= K[i][0]) {
        var a = K[i - 1], b = K[i], s = (u - a[0]) / (b[0] - a[0]);
        s = s * s * (3 - 2 * s);
        return a[1] + (b[1] - a[1]) * s;
      }
    }
    return K[K.length - 1][1];
  }
  function sstep(x, a, b) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  /* ---------- материалы (бот-студия) ---------- */
  var M = {
    suit: new THREE.MeshStandardMaterial({ color: 0x2f6db5, roughness: 0.72, metalness: 0.05 }),
    suitD: new THREE.MeshStandardMaterial({ color: 0x24568f, roughness: 0.78 }),
    strap: new THREE.MeshStandardMaterial({ color: 0x1a2530, roughness: 0.85 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.92 }),
    mask: new THREE.MeshStandardMaterial({ color: 0x232a31, roughness: 0.6, metalness: 0.15 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x0d2b33, roughness: 0.25, metalness: 0.2, emissive: 0x35e0ff, emissiveIntensity: 0.55 }),
    pouch: new THREE.MeshStandardMaterial({ color: 0x2b5a94, roughness: 0.7 }),
    buckle: new THREE.MeshStandardMaterial({ color: 0xd98a2b, roughness: 0.45, metalness: 0.4 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x7a4a26, roughness: 0.55, metalness: 0.05 }),
    woodD: new THREE.MeshStandardMaterial({ color: 0x5e3419, roughness: 0.6 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.34, metalness: 0.85 }),
    metalD: new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.42, metalness: 0.8 }),
    bake: new THREE.MeshStandardMaterial({ color: 0x8a4a1f, roughness: 0.5, metalness: 0.1 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.3, metalness: 0.9 })
  };

  /* ---------- резервный АК (бот-студия buildAK) ---------- */
  function buildAK() {
    var g = new THREE.Group(); g.name = 'BrixAK';
    var bx = function (w, h, d, mat, x, y, z, rx, ry, rz, parent) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, rz || 0);
      m.castShadow = true; (parent || g).add(m); return m;
    };
    var cyl = function (r, l, mat, x, y, z, rx, parent) {
      var m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 12), mat);
      m.position.set(x, y, z); m.rotation.x = rx === undefined ? Math.PI / 2 : rx;
      m.castShadow = true; (parent || g).add(m); return m;
    };
    bx(0.062, 0.075, 0.30, M.metal, 0, 0, -0.02);
    bx(0.058, 0.022, 0.26, M.metalD, 0, 0.047, -0.02);
    bx(0.05, 0.028, 0.045, M.metalD, 0, 0.052, 0.10);
    cyl(0.011, 0.30, M.metalD, 0, 0.015, 0.40);
    cyl(0.014, 0.18, M.metal, 0, 0.048, 0.27);
    cyl(0.016, 0.05, M.metalD, 0, 0.015, 0.565);
    cyl(0.006, 0.05, M.metalD, 0, 0.075, 0.44, 0);
    cyl(0.004, 0.34, M.metalD, 0, -0.008, 0.36);
    bx(0.055, 0.05, 0.16, M.wood, 0, -0.012, 0.25);
    bx(0.05, 0.036, 0.14, M.wood, 0, 0.055, 0.26);
    bx(0.05, 0.09, 0.24, M.wood, 0, -0.02, -0.30, -0.07);
    bx(0.035, 0.10, 0.045, M.bake, 0, -0.095, -0.075, 0.21);
    bx(0.008, 0.028, 0.012, M.metal, 0.045, 0.03, 0.02, 0.25);
    var mag = new THREE.Group(); mag.name = 'Magazine'; g.add(mag);
    var mp = new THREE.Vector3(0, -0.075, 0.045), ang = 0.12;
    for (var i = 0; i < 4; i++) {
      bx(0.045, 0.078, 0.06, M.bake, mp.x, mp.y, mp.z, ang, 0, 0, mag);
      if (i < 3) { ang += 0.24; mp = mp.clone().add(new THREE.Vector3(0, -Math.cos(ang) * 0.068, Math.sin(ang) * 0.068)); }
    }
    var mk = function (x, y, z) { var o = new THREE.Object3D(); o.position.set(x, y, z); g.add(o); return o; };
    return { group: g, markers: { grip: mk(0, -0.085, -0.075), fore: mk(0, -0.032, 0.25), muzzle: mk(0, 0.015, 0.59), eject: mk(0.038, 0.03, 0.02) } };
  }

  /* ---------- загрузка ресурсов (GLB учёный + ak47 + красная текстура) ---------- */
  var RES = {
    ready: false, pending: null,
    glbUrl: null, redTex: null, akScene: null, akSize: null, failed: false
  };
  var GLB_URL = 'assets/models/bot-scientist/ScientistRigged.glb';
  var RED_URL = 'assets/models/bot-scientist/textures/scientist_body_albedo_red.png';
  var AK_URL = 'assets/models/ak47.glb';

  function preload() {
    if (RES.ready) return Promise.resolve(true);
    if (RES.pending) return RES.pending;
    RES.pending = new Promise(function (resolve) {
      var left = 3;
      var done = function () { left--; if (left === 0) { RES.ready = true; RES.failed = !RES.glbUrl; resolve(!RES.failed); } };
      // 1 — GLB учёного (один раз в blob-URL, парсим на каждого бота)
      /* ✅ v0.5.9: retry 3 попытки / 2 c / таймаут 10 c (BrixFetch) —
         туннель отдаёт 504 и рвёт HTTP2, раньше бот сразу становился
         манекеном; кэш-буст через BrixAsset — обновление модели
         доходит игрокам даже с Cache-Control immutable */
      var glbGet = window.BrixFetch
        ? BrixFetch.bytes(window.BrixAsset ? window.BrixAsset(GLB_URL) : GLB_URL)
            .then(function (ab) { return new Blob([ab]); })
        : fetch(GLB_URL).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.blob();
          });
      glbGet.then(function (blob) { RES.glbUrl = URL.createObjectURL(blob); done(); })
        .catch(function () { console.warn('[BotRig] GLB учёного не читается — будет манекен'); done(); });
      // 2 — красная текстура тела (GLB синий встроен)
      var redUrl = window.BrixAsset ? window.BrixAsset(RED_URL) : RED_URL;
      var redGet = window.BrixFetch
        ? BrixFetch.image(redUrl)
        : new Promise(function (ok, no) {
            var tl = new THREE.TextureLoader();
            tl.setCrossOrigin(false);
            tl.load(redUrl, ok, undefined, no);
          });
      redGet.then(function (im) {
        if (im) {
          var t = new THREE.Texture(im);
          t.needsUpdate = true;
          if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
          t.flipY = false;                       // glTF-UV: как встроенные текстуры
          t.anisotropy = 8;
          RES.redTex = t;
        } else console.warn('[BotRig] красная текстура не загрузилась');
        done();
      }).catch(function () { console.warn('[BotRig] красная текстура не загрузилась'); done(); });
      // 3 — игровой калаш (не критично — есть процедурный)
      if (window.BrixGLB) {
        BrixGLB.load(AK_URL, function (group, size) { RES.akScene = group; RES.akSize = size; done(); },
          function () { done(); });
      } else done();
    });
    return RES.pending;
  }

  /* ---------- имена/спрайты ---------- */
  var TEAM_ACC = { blue: '#4da3ff', red: '#ff5a3c' };

  function nameSprite(name, team) {
    var c = document.createElement('canvas'); c.width = 256; c.height = 64;
    var ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(7,9,14,.55)'; ctx.fillRect(28, 10, 200, 44);
    ctx.fillStyle = TEAM_ACC[team] || '#fff'; ctx.fillRect(28, 10, 6, 44);
    ctx.font = '700 24px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e9e5da'; ctx.fillText(name, 136, 33);
    var t = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    sp.scale.set(1.5, 0.375, 1);
    return sp;
  }

  /* ---------- классификация костей (бот-студия) ---------- */
  function classifyBones(root) {
    var all = [];
    root.traverse(function (n) { if (n.isBone) all.push(n); });
    var norm = function (n) { return n.name.replace(/^mixamorig[:_]?/i, '').replace(/^bip_/i, 'bip').toLowerCase(); };
    var sideOf = function (n) {
      var s = norm(n);
      if (/left|_l$|_l[^a-z]|\.l$|^l_|collar_l|_l\d/.test(s)) return 'L';
      if (/right|_r$|_r[^a-z]|\.r$|^r_|collar_r|_r\d/.test(s)) return 'R';
      return null;
    };
    var find = function (pats, side) {
      for (var pi = 0; pi < pats.length; pi++) {
        for (var bi = 0; bi < all.length; bi++) {
          if (pats[pi].test(norm(all[bi]))) {
            if (side === null) return all[bi];
            if (sideOf(all[bi]) === side) return all[bi];
          }
        }
      }
      return null;
    };
    var map = {};
    map.hips = find([/hips?$/, /pelvis/, /bippelvis/], null);
    map.spine = find([/spine1?$/, /spine_?1/, /abdomen/, /waist/, /bipspine$/], null) || map.hips;
    map.chest = find([/spine[23]/, /chest/, /torso/, /bipspine[12]/], null) || map.spine;
    map.neck = find([/neck/], null);
    map.head = find([/head/], null);
    ['L', 'R'].forEach(function (sd) {
      map['shoulder' + sd] = find([/shoulder/, /collar/, /clavicle/], sd);
      map['upperArm' + sd] = find([/upperarm/, /^arm/, /uparm/, /bipupperarm/, /arm$/], sd);
      map['forearm' + sd] = find([/forearm/, /lowerarm/, /biplowerarm/, /elbow/], sd);
      map['hand' + sd] = find([/hand/, /wrist/, /biphand/], sd);
      map['thigh' + sd] = find([/upleg/, /thigh/, /biphip/, /upperleg/], sd);
      /* ✅ v0.5.3: КРИТИЧНЫЙ ФИКС «НЕТ АНИМАЦИИ ХОДЬБЫ» — в mixamo-скелетах
         голени называются LeftLeg/RightLeg (после нормализации «leftleg»),
         а паттерн /^leg/ их НЕ ловил → calfL/calfR были null и КОЛЕНИ
         НИКОГДА НЕ СГИБАЛИСЬ (боты шли на прямых ногах-колодках).
         Fallback [^p]leg$ ловит «leftleg/rightleg», но не «leftupleg»
         (бедро); паттерны calf/shin/knee идут ПЕРВЫМИ для других скелетов */
      map['calf' + sd] = find([/calf/, /shin/, /bipknee/, /lowerleg/, /knee/,
        /^leg/, /[^p]leg$/], sd);
      map['foot' + sd] = find([/foot/, /ankle/, /bipfoot/], sd);
    });
    var fingers = all.filter(function (b) { return /thumb|index|middle|ring|pinky|finger/i.test(b.name); });
    return { map: map, fingers: fingers, all: all };
  }

  /* ---------- вью бота ---------- */
  var _v1 = null, _v2 = null, _q = null, _q2 = null, _e = null, _up = null;
  function temps() {
    if (!_v1) {
      _v1 = new THREE.Vector3(); _v2 = new THREE.Vector3();
      _q = new THREE.Quaternion(); _q2 = new THREE.Quaternion();
      _e = new THREE.Euler(); _up = new THREE.Vector3(0, 1, 0);
    }
  }

  /* ✅ v0.5.3: ЯКОРЬ ОРУЖИЯ — компактный АК ПЕРЕД ГРУДЬЮ (не у головы!).
     v0.5.2 поднимал прицел «к глазам» — выглядело как АК НАД ГОЛОВОЙ.
     Теперь базовая стойка: хват на уровне груди (1.33 м), в прицеле
     ствол поднимается только до ПЛЕЧА (1.41 м) */
  var PRESET = { fwd: 0.24, up: 0.03, right: 0.05, pitch: -3, roll: 0 };

  function BotView(scene, team, name, idx) {
    temps();
    this.scene = scene;
    this.team = team;
    this.name = name;
    this.idx = idx;
    this.pos = new THREE.Vector3();          // мировая (визуальная, сглаженная)
    this.tPos = new THREE.Vector3();         // цель из фида
    this.yaw = 0; this.tYaw = 0;
    this.st = 0;                             // 0 idle … 5 dead (фид)
    this.hp = 100;
    this.dead = false;
    this.deathT = 0; this.deathSeed = rnd(1);
    this.gaitPh = rnd(6.28); this.gaitCad = 0.82;
    this.t = rnd(9);
    this.W = { idle: 1, walk: 0, run: 0, aim: 0, shoot: 0, reload: 0 };
    this.recoil = { z: 0, zv: 0, p: 0, pv: 0, y: 0, yv: 0 };
    this.triggerPulse = 0;
    this.mv = 0;                              // сила движения 0..1
    this.gripReturn = 1;
    this.weaponDropped = false; this.dropVel = new THREE.Vector3(); this.dropAng = new THREE.Vector3();
    this.dropSleep = false;
    this.anchorCur = { fwd: PRESET.fwd, up: PRESET.up, right: PRESET.right, pitch: 0, roll: 0 };
    this.fallAxis = Math.random() < 0.5 ? 'x' : 'z';
    this.fallDir = 1;
    this.flashK = 0;

    var g = new THREE.Group(); this.group = g; scene.add(g);
    this.wrapper = g;

    // ник + хп + тень (как у бота v0.4.66)
    this.nameSp = nameSprite(name, team); this.nameSp.position.y = 2.06; g.add(this.nameSp);
    this.barG = new THREE.Group(); this.barG.position.y = 1.9; g.add(this.barG);
    var bg = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.06),
      new THREE.MeshBasicMaterial({ color: 0x0d1219, transparent: true, opacity: 0.8, depthWrite: false }));
    this.barG.add(bg);
    this.barFg = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.035),
      new THREE.MeshBasicMaterial({ color: team === 'blue' ? 0x4da3ff : 0xff5a3c, depthWrite: false }));
    this.barFg.position.z = 0.001; this.barG.add(this.barFg);
    // мигание при попадании: полоска + вспышка одежды
    var self = this;
    this.setHp(100);

    this.buildModel();
  }

  BotView.prototype.setHp = function (hp) {
    this.hp = clamp(hp, 0, 100);
    var f = clamp(this.hp / 100, 0, 1);
    this.barFg.scale.x = Math.max(0.001, f);
    this.barFg.position.x = -(1 - f) * 0.34;
  };

  /** построение модели: GLB учёного или резервный манекен.
      ✅ бот может создаться из фида ДО загрузки ресурсов — ждём
      preload, потом строим (иначе все боты уходят в манекен) */
  BotView.prototype.buildModel = function () {
    var self = this;
    var inner = new THREE.Group();
    this.group.add(inner);
    this.inner = inner;
    var start = function () {
      var fin = function () {
        // риг + оружие
        self.bindRig();
        self.mountWeapon();
        self.wrapper.position.set(self.pos.x, self.pos.y, self.pos.z);
      };
      if (RES.glbUrl && window.BrixGLB) {
        BrixGLB.load(RES.glbUrl, function (root, size) {
          self.isMannequin = false;
          console.log('[BotRig] учёный построен: ' + self.name + ' · рост ' + size.y.toFixed(1));
        // нормализация роста 1.8 м (GLB в условных единицах FBX)
        var sc = 1.8 / Math.max(size.y, 0.001);
        root.scale.setScalar(sc);
        root.updateMatrixWorld(true);
        var bb = new THREE.Box3().setFromObject(root);
        var c = bb.getCenter(new THREE.Vector3());
        root.position.x -= c.x; root.position.z -= c.z; root.position.y -= bb.min.y;
        inner.add(root);
        // КРАСНАЯ команда: тело — перекрашенная текстура
        if (self.team === 'red' && RES.redTex) {
          root.traverse(function (n) {
            if (n.isMesh || n.isSkinnedMesh) {
              var ms = Array.isArray(n.material) ? n.material : [n.material];
              ms.forEach(function (m) {
                if (/body/i.test(m.name || '') || (m.map && /blue/i.test(m.map.name || ''))) {
                  m.map = RES.redTex; m.needsUpdate = true;
                }
              });
            }
          });
        }
        // линия контраста команды: свечение на глазах-маске
        var acc = self.team === 'blue' ? 0x4da3ff : 0xff5a3c;
        root.traverse(function (n) {
          if ((n.isMesh || n.isSkinnedMesh) && /mask/i.test(n.material && n.material.name || '')) {
            n.material.emissive = new THREE.Color(acc);
            n.material.emissiveIntensity = 0.35;
          }
        });
        fin();
      }, function (err) {
        console.warn('[BotRig] учёный не спарсился — манекен (' + self.name + '): ' +
          (err && (err.message || err)));
        self.buildMannequin(); fin();
      });
      } else {
        self.buildMannequin(); fin();
      }
    };
    /* ✅ ресурсы ещё грузятся? — строим после preload (GLB готов) */
    if (!RES.ready) preload().then(function () { start(); });
    else start();
  };

  /** резервный манекен (бот-студия buildBot, те же кости по именам) */
  BotView.prototype.buildMannequin = function () {
    this.isMannequin = true;
    console.log('[BotRig] манекен-фолбэк для бота ' + this.name);
    var mk = function (name, x, y, z, parent) {
      var b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); parent.add(b); return b;
    };
    var root = new THREE.Group(); root.name = 'BrixMannequin';
    var hips = mk('Hips', 0, 1.0, 0, root);
    var spine = mk('Spine', 0, 0.12, 0, hips), chest = mk('Chest', 0, 0.16, 0, spine);
    var neck = mk('Neck', 0, 0.20, 0, chest), head = mk('Head', 0, 0.09, 0, neck);
    this.mannequin = root;
    this.inner.add(root);
    // упрощённый корпус (визуально близко к учёному)
    var box = function (w, h, d, mat, x, y, z, parent) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
    };
    box(0.30, 0.17, 0.20, M.suit, 0, -0.02, 0, hips);
    box(0.31, 0.24, 0.21, M.suitD, 0, 0.22, 0, spine);
    box(0.34, 0.30, 0.22, M.suit, 0, 0.34, 0, chest);
    box(0.06, 0.09, 0.05, M.rubber, 0, 0.10, 0, neck);
    box(0.24, 0.24, 0.24, M.suit, 0, 0.06, 0.01, head);
    box(0.21, 0.16, 0.18, M.mask, 0, 0.05, 0.05, head);
    var self = this;
    ['L', 'R'].forEach(function (sd) {
      var s = sd === 'L' ? -1 : 1;
      var sh = mk('Shoulder' + sd, s * 0.10, 0.14, 0, chest);
      var ua = mk('UpperArm' + sd, s * 0.09, -0.02, 0, sh);
      var fa = mk('ForeArm' + sd, s * 0.24, -0.14, 0, ua);
      var ha = mk('Hand' + sd, s * 0.22, -0.16, 0, fa);
      box(0.08, 0.26, 0.09, M.suit, s * 0.13, -0.12, 0, ua);
      box(0.075, 0.24, 0.08, M.suit, s * 0.23, -0.16, 0, fa);
      box(0.075, 0.09, 0.10, M.rubber, s * 0.44, -0.18, 0, ha);
      var th = mk('Thigh' + sd, s * 0.10, -0.02, 0, hips);
      var ca = mk('Calf' + sd, 0, -0.44, 0, th);
      var fo = mk('Foot' + sd, 0, -0.44, 0, ca);
      box(0.12, 0.46, 0.13, M.suit, s * 0.10, -0.24, 0, th);
      box(0.10, 0.44, 0.11, M.suit, s * 0.10, -0.66, 0, ca);
      box(0.10, 0.08, 0.24, M.rubber, s * 0.10, -0.88, 0.04, fo);
    });
    this.pos.y = this.pos.y;  // рост уже в метрах (1.8)
  };

  BotView.prototype.bindRig = function () {
    var info = classifyBones(this.inner);
    this.rig = info.map;
    this.rig.all = info.all;
    this.rig.fingerBones = info.fingers;
    this.botFBX = info.all.some(function (b) { return /mixamorig/i.test(b.name); });
    var REST = this.REST = new Map();
    info.all.forEach(function (b) { REST.set(b, { q: b.quaternion.clone(), p: b.position.clone() }); });
    this.fingerRecs = [];
    var self = this;
    ['L', 'R'].forEach(function (sd) {
      var hand = self.rig['hand' + sd];
      if (!hand) return;
      info.fingers.filter(function (f) { return self.sideMatch(f, sd); }).forEach(function (f) {
        var depth = 1, n = f;
        while (n.parent && n.parent !== hand && depth < 4) { n = n.parent; depth++; }
        var isThumb = /thumb/i.test(f.name);
        var restQ = f.getWorldQuaternion(new THREE.Quaternion());
        var childF = f.children.find(function (c) { return c.isBone && /thumb|index|middle|ring|pinky|finger/i.test(c.name); });
        var dirBot = childF ? childF.position.clone().normalize().applyQuaternion(restQ)
          : f.position.clone().normalize().applyQuaternion(f.parent.getWorldQuaternion(new THREE.Quaternion()));
        self.fingerRecs.push({
          bone: f, side: sd, depth: depth, isThumb: isThumb,
          max: isThumb ? (depth === 1 ? 40 : 45) * D2R : (depth === 1 ? 55 : depth === 2 ? 65 : 40) * D2R,
          restQ: restQ, axisLocal: new THREE.Vector3(1, 0, 0),
          sign: new THREE.Vector3().crossVectors(new THREE.Vector3(1, 0, 0).applyQuaternion(restQ), dirBot).dot(new THREE.Vector3(0, 0, 1)) >= 0 ? 1 : -1
        });
      });
    });
  };

  BotView.prototype.sideMatch = function (b, sd) {
    var s = b.name.toLowerCase();
    if (sd === 'L') return /left|_l\b|_l$|\.l|l1|l2|l3|_l\d|\bl_|_l[^a-z]/.test(s);
    return /right|_r\b|_r$|\.r|r1|r2|r3|_r\d|\br_|_r[^a-z]/.test(s);
  };

  /* ---------- оружие: игровой ak47.glb + метки хвата ---------- */
  BotView.prototype.mountWeapon = function () {
    var self = this;
    var wr = this.weaponRoot = new THREE.Group();
    this.scene.add(wr);
    var fin = function (content, markers) {
      self.weaponContent = content;
      self.weaponMarkers = markers;
      wr.add(content);
      content.traverse(function (n) { if (n.isMesh) n.castShadow = true; });
    };
    var useAK = function (group, size) {
      // ствол вдоль +Z (как в bot-studio adoptGLB для ak47)
      // ✅ v0.5.2: масштаб 0.62 (было 0.88) — калаш в руках КОМПАКТНЫЙ
      var wrap = new THREE.Group();
      var inner2 = new THREE.Group(); inner2.add(group); wrap.add(inner2);
      var sc = 0.62 / Math.max(size.z, 0.001);
      inner2.scale.setScalar(sc);
      inner2.updateMatrixWorld(true);
      var bb = new THREE.Box3().setFromObject(inner2);
      var sz = bb.getSize(new THREE.Vector3());
      var fy = function (f) { return bb.min.y + sz.y * f; };
      var fz = function (f) { return bb.min.z + sz.z * f; };
      var mk = function (x, y, z) { var o = new THREE.Object3D(); o.position.set(x, y, z); wrap.add(o); return o; };
      fin(wrap, {
        grip: mk(0, fy(0.22), fz(0.33)),
        fore: mk(0, fy(0.38), fz(0.66)),
        muzzle: mk(0, fy(0.72), bb.max.z),
        eject: mk(sz.x * 0.3, fy(0.6), fz(0.42))
      });
    };
    if (RES.akScene) {
      RES.akScene.updateMatrixWorld(true);
      useAK(RES.akScene.clone(true), RES.akSize.clone());
    } else {
      var ak = buildAK();
      ak.group.scale.setScalar(0.62);
      fin(ak.group, ak.markers);
    }
  };

  /* ---------- математика позы (порт bot-studio) ---------- */
  BotView.prototype.resetPose = function () {
    var REST = this.REST;
    if (!REST) return;
    REST.forEach(function (r, b) { b.quaternion.copy(r.q); b.position.copy(r.p); });
  };
  function rotB(b, ax, rad, WQ) {
    if (!b || Math.abs(rad) < 1e-6) return;
    _v1.set(ax === 'x' ? 1 : 0, ax === 'y' ? 1 : 0, ax === 'z' ? 1 : 0).applyQuaternion(WQ);
    b.getWorldQuaternion(_q); _v1.applyQuaternion(_q.invert()).normalize();
    _q2.setFromAxisAngle(_v1, rad);
    b.quaternion.multiply(_q2);
  }
  function moveB(b, x, y, z, WQ, wrapper) {
    if (!b) return;
    b.parent.getWorldQuaternion(_q).invert();
    var s = wrapper.getWorldScale(_v2).x || 1;
    _v1.set(x, y, z).applyQuaternion(WQ).applyQuaternion(_q).divideScalar(s);
    b.position.add(_v1);
  }
  function applyWorldQuat(b, qw) {
    b.parent.getWorldQuaternion(_q);
    _q2.copy(_q).invert().multiply(qw).multiply(_q);
    b.quaternion.premultiply(_q2);
  }
  function solveIK(upper, lower, end, target, pole) {
    if (!upper || !lower || !end) return false;
    upper.updateWorldMatrix(true, false); lower.updateWorldMatrix(true, false); end.updateWorldMatrix(true, false);
    var Sp = upper.getWorldPosition(new THREE.Vector3());
    var Ep = lower.getWorldPosition(new THREE.Vector3());
    var Wp = end.getWorldPosition(new THREE.Vector3());
    var L1 = Sp.distanceTo(Ep), L2 = Ep.distanceTo(Wp);
    if (L1 < 1e-5 || L2 < 1e-5) return false;
    var toT = target.clone().sub(Sp);
    var d = toT.length();
    var maxD = (L1 + L2) * 0.999, minD = Math.abs(L1 - L2) + 1e-4;
    var stretched = d > maxD; d = clamp(d, minD, maxD);
    var dir = toT.normalize();
    var T = Sp.clone().addScaledVector(dir, d);
    var poleDir = pole.clone().sub(Sp);
    var axis = new THREE.Vector3().crossVectors(dir, poleDir);
    if (axis.lengthSq() < 1e-10) { axis.set(0, 0, 1); if (Math.abs(dir.dot(axis)) > 0.9) axis.set(1, 0, 0); axis.cross(dir); }
    axis.normalize();
    var cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
    var a = Math.acos(cosA);
    var dA = dir.clone().applyAxisAngle(axis, a), dB = dir.clone().applyAxisAngle(axis, -a);
    var pp = poleDir.clone().addScaledVector(dir, -poleDir.dot(dir));
    var up = dA.dot(pp) >= dB.dot(pp) ? dA : dB;
    var q = new THREE.Quaternion().setFromUnitVectors(Ep.clone().sub(Sp).normalize(), up);
    applyWorldQuat(upper, q); upper.updateWorldMatrix(true, true);
    var E2 = lower.getWorldPosition(new THREE.Vector3());
    var W2 = end.getWorldPosition(new THREE.Vector3());
    var q2 = new THREE.Quaternion().setFromUnitVectors(W2.clone().sub(E2).normalize(), T.clone().sub(E2).normalize());
    applyWorldQuat(lower, q2); lower.updateWorldMatrix(true, true);
    return !stretched;
  }
  function frameQ(k, p) {
    var z = p.clone().normalize();
    var y = k.clone().addScaledVector(z, -k.dot(z)).normalize();
    var x = new THREE.Vector3().crossVectors(y, z).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }
  BotView.prototype.orientHand = function (sd, knuckleW, palmW, weight) {
    // поза хвата фиксирована на момент бинда: мировая база кисти в покое
    if (!this.handRecs) this.handRecs = {};
    var rec = this.handRecs[sd];
    if (!rec) {
      var hand = this.rig['hand' + sd];
      if (!hand) return;
      var knuckle0 = new THREE.Vector3(0, -0.35, 1).normalize();
      var palm0 = new THREE.Vector3(sd === 'R' ? -1 : 1, 0, 0.15).normalize();
      rec = this.handRecs[sd] = {
        bone: hand, knuckle0: knuckle0, palm0: palm0,
        restWorldQ: hand.getWorldQuaternion(new THREE.Quaternion())
      };
    }
    var k0 = rec.knuckle0.clone().applyQuaternion(this.WQ), p0 = rec.palm0.clone().applyQuaternion(this.WQ);
    var q0 = frameQ(k0, p0), q1 = frameQ(knuckleW, palmW);
    var delta = q1.multiply(q0.invert());
    var restW = rec.restWorldQ.clone().premultiply(this.WQ);
    var targetQ = delta.multiply(restW);
    var pq = rec.bone.parent.getWorldQuaternion(new THREE.Quaternion());
    var local = pq.invert().multiply(targetQ);
    rec.bone.quaternion.slerp(local, weight);
  };

  /* ---------- public: фид ---------- */
  BotView.prototype.feed = function (x, y, z, yaw, st, hp) {
    this.tPos.set(x, y, z);
    this.tYaw = yaw;
    this.st = st;
    if (hp !== undefined && hp !== null) this.setHp(hp);
    if (st === 5 && !this.dead) this.die();
    if (st !== 5 && this.dead) this.revive();
  };

  BotView.prototype.die = function () {
    if (this.dead) return;
    this.dead = true;
    this.deathT = 0.0001;
    this.deathSeed = rnd(1);
    /* ✅ v0.5.7: вид падения — назад (75%) или вбок (25%), выбирается
       один раз; корпус падает ЦЕЛИКОМ от ног (inner.rotation) —
       труп гарантированно лежит НА ЗЕМЛЕ (раньше кости-таз оставляли
       тело висеть в воздухе — «летают») */
    this.fallKind = Math.random() < 0.75 ? 'back' : 'side';
    this.fallSign = Math.random() < 0.5 ? 1 : -1;
    this.barG.visible = false;
  };
  BotView.prototype.revive = function () {
    if (!this.dead && this.deathT === 0) return;
    this.dead = false;
    this.deathT = 0;
    this.barG.visible = true;
    this.gripReturn = 0;
    this.weaponDropped = false;
    this.dropSleep = false;
    this.flashK = 0;
    if (this.inner) this.inner.rotation.set(0, 0, 0);
    this.resetPose();
  };
  BotView.prototype.triggerShot = function () {
    this.triggerPulse = 1;
    this.lastShotT = 0;
  };

  /* ---------- поза смерти (бот-студия DEATH — теперь только curl
     конечностей). ✅ v0.5.7: само падение делает inner.rotation —
     корпус целиком от ног, труп лежит НА ЗЕМЛЕ (v0.5.2 падал через
     кости таза и висел в воздухе — «летают») */
  var DEATH = {
    hipsY: [[0, 0], [0.12, -0.06], [0.32, -0.44], [0.6, -0.8], [1, -0.88]],
    hipsZ: [[0, 0], [0.25, -0.05], [0.6, -0.22], [1, -0.3]],
    hipsRX: [[0, 0], [0.16, -0.4], [0.42, -1.15], [0.75, -1.46], [1, -1.52]],
    hipsRZ: [[0, 0], [0.35, 0.12], [1, 0.24]],
    spineX: [[0, 0], [0.14, -0.5], [0.45, 0.3], [1, 0.4]],
    chestX: [[0, 0], [0.14, -0.55], [0.5, 0.26], [1, 0.18]],
    headX: [[0, 0], [0.16, -0.6], [0.55, -0.12], [1, -0.38]],
    thighL: [[0, 0], [0.18, -1.05], [0.5, -0.5], [1, -0.3]],
    thighR: [[0, 0], [0.2, -0.5], [0.55, 0.15], [1, 0.3]],
    calfL: [[0, 0], [0.2, 1.5], [0.55, 0.45], [1, 0.3]],
    calfR: [[0, 0], [0.22, 1.2], [0.55, 0.3], [1, 0.12]],
    armX: [[0, 0], [0.15, -0.9], [0.5, -1.45], [1, -1.45]],
    armZ: [[0, 0], [0.3, 0.4], [1, 0.62]],
    foreX: [[0, 0], [0.3, -0.55], [1, -0.32]]
  };

  /* ---------- тик: сглаживание + процедурная анимация ---------- */
  BotView.prototype.tick = function (dt) {
    var self = this;
    this.t += dt;
    /* ✅ v0.5.2: ТРУП ЗАМЕР — падение длится 0.7 с, после этого бот
       полностью статичен (только ник тускнеет). Раньше у трупа
       продолжали жить IK, пружины отдачи и лерп позиции — казалось,
       что мёртвый «двигается» */
    if (this.dead && this.deathT >= 1) {
      this.nameSp.material.opacity = 0.25;
      return;
    }
    // сглаживание фида (10 Гц → плавно). ✅ v0.5.2: у умирающего позиция
    // и поворот ЗАМОРОЖЕНЫ в точке смерти — труп не скользит по полу
    if (!this.dead) {
      this.pos.lerp(this.tPos, Math.min(1, dt * 10));
      var dy = this.tYaw - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * Math.min(1, dt * 10);
    }
    // скорость из сдвига цели (для анимации ходьбы).
    // ✅ v0.5.4: + ФАКТИЧЕСКАЯ скорость (м/с) для каденса и НАПРАВЛЕНИЕ
    // движения относительно корпуса (для поворота бёдер при стрейфе)
    var ltp = this.lastTPos;
    var moved = this.tPos.distanceTo(ltp || this.tPos) / Math.max(dt, 0.001);
    this.lastTPos = this.tPos.clone();          /* обновляем ВСЕГДА */
    var relTgt = this.moveRel || 0;
    if (ltp) {
      var vdx = this.tPos.x - ltp.x, vdz = this.tPos.z - ltp.z;
      if (vdx * vdx + vdz * vdz > 0.0009) {      // реально сдвинулся за тик
        var dyR = Math.atan2(vdx, vdz) - this.yaw;
        while (dyR > Math.PI) dyR -= Math.PI * 2;
        while (dyR < -Math.PI) dyR += Math.PI * 2;
        relTgt = dyR;
      }
    }
    this.moveRel = damp(this.moveRel || 0, relTgt, 6, dt);
    this.spd = damp(this.spd || 0, Math.min(6, moved), 6, dt);
    this.mv = damp(this.mv, clamp(moved / 3.5, 0, 1), 6, dt);
    this.running = moved > 3.05;

    // цели весов состояний из st фида (✅ v0.5.7: lambda 8 — переходы
    // стойка↔бег↔прицел ЧУТЬ ПЛАВНЕЕ, без рывков; ✅ v0.5.3: +6 перезарядка)
    var tgt = { idle: 0, walk: 0, run: 0, aim: 0, shoot: 0, reload: 0 };
    if (!this.dead) {
      if (this.st === 0) tgt.idle = 1;
      else if (this.st === 1) tgt.walk = 1;
      else if (this.st === 2) tgt.run = 1;
      else if (this.st === 3) tgt.aim = 1;
      else if (this.st === 4) { tgt.aim = 1; tgt.shoot = 1; }
      else if (this.st === 6) { tgt.reload = 1; }
    }
    var W = this.W;
    W.idle = damp(W.idle, tgt.idle, 8, dt);
    W.walk = damp(W.walk, tgt.walk, 8, dt);
    W.run = damp(W.run, tgt.run, 8, dt);
    W.aim = damp(W.aim, tgt.aim, 8, dt);
    W.shoot = damp(W.shoot, tgt.shoot, 8, dt);
    W.reload = damp(W.reload, tgt.reload, 7, dt);
    if (this.dead) this.deathT = clamp(this.deathT + dt / 0.8, 0, 1);
    else this.deathT = clamp(this.deathT - dt / 0.5, 0, 0.0001);
    var holdW = 1 - sstep(this.deathT, 0.05, 0.3);

    // пружины отдачи
    var rc = this.recoil;
    rc.zv += (-140 * rc.z - 16 * rc.zv) * dt; rc.z += rc.zv * dt;
    rc.pv += (-120 * rc.p - 13 * rc.pv) * dt; rc.p = clamp(rc.p + rc.pv * dt, -0.02, 0.14);
    rc.yv += (-110 * rc.y - 14 * rc.yv) * dt; rc.y += rc.yv * dt;
    this.triggerPulse = Math.max(0, this.triggerPulse - dt * 8);
    this.lastShotT = (this.lastShotT || 0) + dt;

    // каденс шага. ✅ v0.5.4: ЧАСТОТА ШАГОВ = СКОРОСТЬ (0.5 Гц на м/с,
    // до 2.2): бот идёт 2 м/с → 1 Гц, стрейфит 2.6 м/с → 1.3 Гц, бегит
    // 3.4 м/с → 1.7 Гц. Раньше каденс был ФИКСИРОВАННЫМ (0.82/1.75 Гц) —
    // при быстром стрейфе ноги перебирали в 1.5 раза реже, чем нужно —
    // «движения быстрые, а анимация долгие»
    this.gaitCad = damp(this.gaitCad, clamp(0.5 * this.spd, 0, 2.2), 5, dt);
    this.gaitPh += dt * 2 * Math.PI * this.gaitCad;
    var gaitPitch = 0, gaitRoll = 0;

    var rig = this.rig;
    var wrapper = this.wrapper;
    wrapper.rotation.y = this.yaw;
    wrapper.position.set(this.pos.x, this.pos.y, this.pos.z);
    wrapper.updateMatrixWorld(true);
    this.WQ = wrapper.getWorldQuaternion(new THREE.Quaternion());
    var WQ = this.WQ;
    if (!rig) return;                          // модель ещё грузится

    this.resetPose();
    if (this.deathT > 0.001) {
      /* ✅ v0.5.7: ПАДЕНИЕ КОРПУСА ОТ НОГ. inner (origin на уровне стоп)
         валится назад (-X-поворот: тело ложится на спину за -Z) или
         вбок (Z-поворот) — тело ЦЕЛИКОМ ложится на землю, никакого
         «полёта». Конечности слегка подкашиваются (curl). */
      var u = this.deathT, r1 = (this.deathSeed - 0.5);
      var k = sstep(u, 0.03, 0.9);
      this.inner.rotation.x = this.fallKind === 'back' ? -1.5 * k : 0;
      this.inner.rotation.z = this.fallKind === 'side' ? this.fallSign * 1.46 * k : 0;
      this.inner.rotation.y = r1 * 0.4 * k;
      var curl = 0.55 * k;
      rotB(rig.thighL, 'x', kf(u, DEATH.thighL) * curl, WQ);
      rotB(rig.thighR, 'x', kf(u, DEATH.thighR) * curl, WQ);
      rotB(rig.calfL, 'x', kf(u, DEATH.calfL) * curl, WQ);
      rotB(rig.calfR, 'x', kf(u, DEATH.calfR) * curl, WQ);
      rotB(rig.upperArmL, 'x', kf(u, DEATH.armX) * 0.4 * k, WQ);
      rotB(rig.upperArmR, 'x', kf(u, DEATH.armX) * 0.4 * k, WQ);
      rotB(rig.upperArmL, 'z', -kf(u, DEATH.armZ) * curl, WQ);
      rotB(rig.upperArmR, 'z', kf(u, DEATH.armZ) * curl, WQ);
      rotB(rig.forearmL, 'x', kf(u, DEATH.foreX) * curl, WQ);
      rotB(rig.forearmR, 'x', kf(u, DEATH.foreX) * curl, WQ);
      rotB(rig.head, 'x', kf(u, DEATH.headX) * 0.4 * k, WQ);
    } else {
      /* ✅ v0.5.3: НОГИ ЖИВУТ ПРИ ЛЮБОМ ДВИЖЕНИИ. Раньше гейт считался
         ТОЛЬКО из состояния (st=3 прицел → W.walk=0): бот, стрейфящий
         в прицеле, скользил с ногами-колодками — «анимации ходьбы нет».
         Теперь вес шага берётся из ФАКТИЧЕСКОГО перемещения (this.mv):
         прицел/перезарядка/стойка не выключают перебор ног */
      var aimish = W.aim + W.shoot + W.reload * 0.5,
          wk = Math.max(W.walk, this.mv * (1 - W.run)),
          rn = W.run;
      var mv = Math.min(1, wk + rn), still = 1 - mv;
      var ph = this.gaitPh, swL = Math.sin(ph), cwL = Math.cos(ph), swR = -swL, cwR = -cwL;
      var t = this.t;
      var breathe = Math.sin(t * 1.55) * still;
      var shift = Math.sin(t * 0.38) * still;
      var lookYaw = (Math.sin(t * 0.33) * 0.55 + Math.sin(t * 0.11) * 0.45) * 0.17 * still * (1 - 0.8 * aimish);
      var lookPitch = (Math.sin(t * 0.21) * 0.6 + Math.sin(t * 0.47) * 0.4) * 0.06 * (1 - aimish);
      /* ✅ v0.5.2 БЕГ ВСЕМ ТЕЛОМ: сильный наклон вперёд, таз качает
         влево-вправо и приседает на шаге, грудь крутится ПРОТИВ таза,
         позвоночник скручивается, плечи пружинят в такт, голова
         компенсирует наклон и держит взгляд на цели; у оружия своя
         раскачка в ритме шагов. Раньше двигались только ноги */
      var lean = 0.05 + 0.26 * rn + 0.06 * aimish;
      var bobA = 0.042 * wk + 0.095 * rn;
      var gaitYaw = Math.sin(ph) * (0.085 * wk + 0.14 * rn);
      gaitPitch = Math.sin(2 * ph + 1.1) * 0.02 * mv;
      gaitRoll = Math.sin(ph + 0.4) * (0.02 * wk + 0.045 * rn);
      moveB(rig.hips,
        shift * 0.013 + Math.cos(ph) * (0.013 * wk + 0.024 * rn),
        Math.sin(t * 1.55) * 0.006 * still + bobA * (0.5 + 0.5 * Math.cos(2 * ph)) - 0.012 * mv
          - Math.abs(Math.sin(ph)) * 0.03 * rn,
        0, WQ, wrapper);
      /* ✅ v0.5.7: НОГИ — ТОЛЬКО ВДОЛЬ ДВИЖЕНИЯ. Бёдра доворачиваются к
         направлению движения до ±86° (стрейф влево/вправо → ноги
         смотрят в сторону), а амплитуда качания вперёд-назад гасится
         по продвижению вбок (|cos(moveRel)|): при чистом стрейфе ноги
         НЕ машут вперёд-назад — мелкий приставной шаг + наклон корпуса
         в сторону движения. Верх тела (spine/chest) компенсирует
         обратно — прицел остаётся на цели (v0.5.4) */
      var mRel = this.moveRel || 0;
      var hipTurn = clamp(mRel, -1.5, 1.5)
        * Math.min(1, this.mv * 2.2) * (1 - 0.5 * W.run);
      var align = Math.abs(Math.cos(clamp(mRel, -Math.PI, Math.PI)));  // 1 вперёд/назад, 0 — стрейф
      var strafeK = Math.abs(Math.sin(clamp(mRel, -Math.PI, Math.PI))) // боковая составляющая
        * Math.min(1, this.mv * 1.6);
      var strafeDir = Math.sin(mRel) >= 0 ? 1 : -1;
      rotB(rig.hips, 'y', gaitYaw + shift * 0.03 - 0.12 * aimish + hipTurn, WQ);
      rotB(rig.hips, 'z', Math.cos(ph) * (0.05 * wk + 0.085 * rn) + shift * 0.02
        - strafeDir * 0.05 * strafeK, WQ);
      rotB(rig.hips, 'x', 0.02 * aimish + 0.04 * wk + 0.17 * rn, WQ);
      var legAmp = (1 - 0.3 * aimish) * (0.3 + 0.7 * align);   // стрейф → качание вперёд гаснет
      var ampT = (0.52 * wk + 0.92 * rn) * legAmp,
          kAmp = (0.95 * wk + 1.55 * rn) * legAmp;
      var tL = -0.05 - 0.05 * aimish + swL * ampT, tR = 0.08 + 0.08 * aimish + swR * ampT;
      var knL = (0.14 + kAmp * Math.max(0, -cwL)) * mv, knR = (0.14 + kAmp * Math.max(0, -cwR)) * mv;
      rotB(rig.thighL, 'x', tL, WQ); rotB(rig.thighL, 'z', -0.07, WQ);
      rotB(rig.thighR, 'x', tR, WQ); rotB(rig.thighR, 'z', 0.07, WQ);
      rotB(rig.calfL, 'x', 0.10 + knL, WQ); rotB(rig.calfR, 'x', 0.14 + knR, WQ);
      rotB(rig.footL, 'x', -(tL + 0.10 + knL) * 0.55
        + Math.max(0, swL) * (0.30 * wk + 0.55 * rn)
        - Math.max(0, -swL) * (0.35 * wk + 0.60 * rn)
        - Math.max(0, -cwL) * 0.18 * mv, WQ);
      rotB(rig.footR, 'x', -(tR + 0.14 + knR) * 0.55
        + Math.max(0, swR) * (0.30 * wk + 0.55 * rn)
        - Math.max(0, -swR) * (0.35 * wk + 0.60 * rn)
        - Math.max(0, -cwR) * 0.18 * mv, WQ);
      rotB(rig.footL, 'y', 0.10, WQ); rotB(rig.footR, 'y', -0.22 - 0.1 * aimish, WQ);
      rotB(rig.spine, 'x', lean * 0.5 + breathe * 0.012 + 0.06 * W.reload, WQ);
      /* ✅ v0.5.7: лёгкий наклон корпуса В СТОРОНУ стрейфа */
      rotB(rig.spine, 'z', -strafeDir * 0.07 * strafeK, WQ);
      /* ✅ v0.5.4: верх тела разворачивается НАЗАД против поворота бёдер —
         прицел остаётся на цели, даже когда ноги смотрят в сторону */
      rotB(rig.spine, 'y', -gaitYaw * 0.5 * rn - hipTurn * 0.35, WQ);
      rotB(rig.chest, 'x', lean * 0.55 + Math.abs(Math.sin(ph)) * 0.03 * rn
        + breathe * 0.016 - rc.p * 0.3 + 0.10 * W.reload, WQ);
      rotB(rig.chest, 'y', -gaitYaw * 0.95 + rc.y * 0.22 - hipTurn * 0.65, WQ);
      rotB(rig.chest, 'z', -Math.cos(ph) * (0.03 * wk + 0.05 * rn) - shift * 0.015, WQ);
      rotB(rig.shoulderL, 'z', breathe * 0.016 + Math.sin(ph) * 0.035 * rn + 0.10 * W.reload, WQ);
      rotB(rig.shoulderR, 'z', -breathe * 0.016 - Math.sin(ph) * 0.035 * rn, WQ);
      rotB(rig.neck, 'x', lookPitch * 0.4 - 0.06 * rn, WQ);
      /* голова «стоит» прямо, пока корпус наклонён: минус наклон груди;
         ✅ v0.5.3: при перезарядке бот смотрит НА ОРУЖИЕ */
      rotB(rig.head, 'x', 0.07 * aimish + lookPitch + breathe * 0.008
        - lean * 0.55 - Math.abs(Math.sin(ph)) * 0.02 * rn + 0.30 * W.reload, WQ);
      rotB(rig.head, 'y', lookYaw + gaitYaw * 0.4 + 0.07 * aimish, WQ);
    }
    wrapper.updateMatrixWorld(true);

    /* ---------- якорь оружия + IK рук ---------- */
    var aimish2 = W.aim + W.shoot;
    /* ✅ v0.5.3: прицел — ствол до ПЛЕЧА (1.41 м), не к глазам;
       перезарядка (st=6): ствол опускается и заваливается набок */
    var liftUp = 0.08 * aimish2 - 0.07 * W.reload,
        liftFwd = -0.05 * aimish2 - 0.06 * W.reload,
        liftRight = -PRESET.right * 0.7 * aimish2;
    var ac = this.anchorCur;
    ac.fwd = damp(ac.fwd, PRESET.fwd + liftFwd, 8, dt);
    ac.up = damp(ac.up, PRESET.up + liftUp + (this.botFBX ? 0.04 : 0), 8, dt);
    ac.right = damp(ac.right, PRESET.right + liftRight, 8, dt);
    ac.pitch = damp(ac.pitch, PRESET.pitch + 8 * W.reload, 8, dt);
    ac.roll = damp(ac.roll, PRESET.roll + 28 * W.reload, 8, dt);
    var chestW = rig.chest ? rig.chest.getWorldPosition(new THREE.Vector3()) : _v2.set(0, 1.3, 0).clone();
    var swayAmp = (1 - 0.5 * W.walk) * (1 - 0.55 * aimish2);
    /* ✅ v0.5.2: оружие качается В РИТМ ШАГОВ бега (вверх-вниз и
       чуть в стороны), как у настоящего бегущего с АК */
    var swayX = Math.sin(this.t * 0.9) * 0.004 * swayAmp + Math.sin(this.gaitPh) * 0.014 * W.run;
    var swayY = Math.sin(this.t * 1.7) * 0.005 * swayAmp
      + Math.abs(Math.sin(this.t * 2 * Math.PI * 0.9)) * 0.012 * W.walk
      + Math.abs(Math.sin(this.gaitPh)) * 0.02 * W.run;
    var tmpV = _v1.set(ac.right + swayX, ac.up + swayY, ac.fwd).applyQuaternion(WQ).clone();
    var anchorPos = chestW.clone().add(tmpV)
      .addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(WQ), -rc.z * 0.05);
    _e.set((ac.pitch) * D2R - rc.p + gaitPitch,
      rc.y + Math.sin(this.t * 0.7) * 0.006 * swayAmp,
      (ac.roll) * D2R + gaitRoll, 'YXZ');
    var anchorQ = new THREE.Quaternion().setFromEuler(_e).premultiply(WQ);
    var wr = this.weaponRoot;
    if (wr) {
      // смерть: оружие вылетает из рук (как в бот-студии)
      if (holdW < 0.5 && !this.weaponDropped) {
        this.weaponDropped = true; this.dropSleep = false; this.gripReturn = 0;
        wr.updateWorldMatrix(true, false);
        this.dropVel.set(rnd(-0.4, 0.4), rnd(0.3, 0.8), rnd(0.6, 1.2)).applyQuaternion(WQ);
        this.dropAng.set(rnd(-3, 3), rnd(-3, 3), rnd(-3, 3));
      }
      if (holdW >= 0.5 && this.weaponDropped) { this.weaponDropped = false; this.gripReturn = 0; }
      if (!this.weaponDropped) this.gripReturn = Math.min(1, this.gripReturn + dt * 2.6);
      if (this.weaponDropped) {
        if (!this.dropSleep) {
          this.dropVel.y -= 9.8 * dt;
          wr.position.addScaledVector(this.dropVel, dt);
          wr.quaternion.multiply(_q2.setFromEuler(_e.set(this.dropAng.x * dt, this.dropAng.y * dt, this.dropAng.z * dt)));
          if (wr.position.y < this.pos.y + 0.06) {
            wr.position.y = this.pos.y + 0.06;
            this.dropVel.y *= -0.28; this.dropVel.x *= 0.6; this.dropVel.z *= 0.6;
            this.dropAng.multiplyScalar(0.5);
            if (this.dropVel.length() < 0.2) {
              this.dropSleep = true;
              var yawOnly = new THREE.Euler(0, new THREE.Euler().setFromQuaternion(wr.quaternion, 'YXZ').y, Math.PI / 2, 'YXZ');
              wr.quaternion.setFromEuler(yawOnly);
            }
          }
        }
      } else {
        var gr = sstep(this.gripReturn, 0, 1);
        wr.position.lerp(anchorPos, gr < 1 ? Math.max(0.12, gr) : 1);
        wr.quaternion.slerp(anchorQ, gr < 1 ? Math.max(0.12, gr) : 1);
      }
      wr.updateWorldMatrix(true, true);
    }

    // IK: правая на рукояти, левая на цевье
    if (this.weaponMarkers && holdW > 0.02) {
      var gsd = 'R', ssd = 'L';
      var gHand = rig['hand' + gsd], sHand = rig['hand' + ssd];
      var gUpper = rig['upperArm' + gsd], gFore = rig['forearm' + gsd];
      var sUpper = rig['upperArm' + ssd], sFore = rig['forearm' + ssd];
      var wq = wr ? wr.quaternion : WQ;
      var gripW = this.weaponMarkers.grip.getWorldPosition(new THREE.Vector3());
      var foreW = this.weaponMarkers.fore.getWorldPosition(new THREE.Vector3());
      if (gUpper && gFore && gHand) {
        var gTarget = gripW.clone().add(new THREE.Vector3(0.014, 0.015, -0.02).applyQuaternion(wq));
        var shR = gUpper.getWorldPosition(new THREE.Vector3());
        var poleR = shR.clone().add(new THREE.Vector3(-0.42, -0.95, -0.15).applyQuaternion(WQ));
        solveIK(gUpper, gFore, gHand, gTarget, poleR);
        var kn = new THREE.Vector3(0, -0.35, 1).normalize().applyQuaternion(wq);
        var pm = new THREE.Vector3(-1, 0, 0.15).normalize().applyQuaternion(wq);
        this.orientHand(gsd, kn, pm, holdW);
      }
      if (sUpper && sFore && sHand) {
        var sTarget = foreW.clone().add(new THREE.Vector3(-0.012, -0.02, -0.01).applyQuaternion(wq));
        var shL = sUpper.getWorldPosition(new THREE.Vector3());
        var poleL = shL.clone().add(new THREE.Vector3(0.35, -0.9, 0.12).applyQuaternion(WQ));
        solveIK(sUpper, sFore, sHand, sTarget, poleL);
        var kn2 = new THREE.Vector3(0.2, -0.4, 1).normalize().applyQuaternion(wq);
        var pm2 = new THREE.Vector3(0.85, 0.5, 0).normalize().applyQuaternion(wq);
        this.orientHand(ssd, kn2, pm2, holdW);
      }
      // пальцы: хват + палец на спуске
      var cG = 0.78, cS = 0.88;
      var tp = this.triggerPulse;
      this.fingerRecs.forEach(function (r) {
        var c = r.side === 'R' ? cG : cS;
        if (r.side === 'R' && /index/i.test(r.bone.name)) c = c * 0.35 + tp * 0.22;
        c *= holdW;
        if (r.isThumb) c *= 0.7;
        _q2.setFromAxisAngle(r.axisLocal, r.sign * r.max * c);
        r.bone.quaternion.multiply(_q2);
      });
    }
    wrapper.updateMatrixWorld(true);

    // вспышка при попадании (одежда мигает) — у манекена, у GLB полоска хп
    if (this.flashK > 0) {
      this.flashK = Math.max(0, this.flashK - dt * 5);
      this.nameSp.material.opacity = 0.4 + 0.6 * (1 - this.flashK);
    } else this.nameSp.material.opacity = this.dead ? 0.25 : 1;
    this.barG.lookAt(cameraPos);
  };

  var cameraPos = new THREE.Vector3(0, 10, 0);
  BotView.prototype.setCamera = function (c) { cameraPos = c; };

  BotView.prototype.dispose = function () {
    if (this.weaponRoot) { this.scene.remove(this.weaponRoot); }
    this.scene.remove(this.group);
  };

  /* ---------- вспышка выстрела бота (общая) ---------- */
  var fxFlash = [];
  function flashAt(scene, tex, x, y, z) {
    var s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    s.scale.set(0.55, 0.55, 1);
    s.position.set(x, y, z);
    scene.add(s);
    fxFlash.push({ s: s, t: 0.07, scene: scene });
  }
  function tickFlash(dt) {
    for (var i = fxFlash.length - 1; i >= 0; i--) {
      var fl = fxFlash[i];
      fl.t -= dt;
      fl.s.material.opacity = Math.max(0, fl.t / 0.07) * 0.95;
      if (fl.t <= 0) { fl.scene.remove(fl.s); fl.s.material.dispose(); fxFlash.splice(i, 1); }
    }
  }

  return {
    preload: preload,
    create: function (scene, team, name, idx) { return new BotView(scene, team, name, idx); },
    flashAt: flashAt,
    tickFlash: tickFlash,
    RES: RES
  };
})();
