/* ============================================================
 *  brix • js/game/airdrop.js — АИРДРОПЫ (v0.5.20)
 *  ✈ САМОЛЁТ (assets/models/plane.glb) + 📦 ЯЩИКИ С ПАРАШЮТОМ
 *  (assets/models/airdrop.glb). ВНУТРИ МОДЕЛИ: СКИН-МЕШ — это
 *  КУПОЛ ПАРАШЮТА (материал PickUp_Airdrop_A_D, большой), а
 *  СТАТИЧЕСКИЙ меш — ЯЩИК (материал PickUp_CarePackage_B_D,
 *  маленький ~0.7 м) — имена материалов обманчивы! При посадке
 *  ТАЕТ КУПОЛ, ЯЩИК ОСТАЁТСЯ. Звук полёта — assets/sfx/airplane
 *  /Airdrop.wav (loop, громкость по дистанции).
 *
 *  ОПТИМИЗАЦИЯ СЕТИ (без пинга): сервер шлёт ТОЛЬКО ключевые
 *  события ('plane' вылет, 'planeS' якорь раз в 2 с, 'planeGone',
 *  'adNew'/'adLand'/'adGone'). Полёт и падение клиент ДОКРУЧИВАЕТ
 *  сам: скорость и курс постоянные — движение ПЛАВНОЕ, каждый кадр
 *  считается локально, между якорями расхождение подтягивается
 *  мягким лерпом (рывков нет, пакетов почти нет).
 *
 *  СИНХРОНИЗАЦИЯ: ящики живут НА СЕРВЕРЕ (welcome присылает и
 *  упавшие, и ПАДАЮЩИЕ с текущей высотой) — зашёл после/во время
 *  падения: увидишь всё как остальные. Лут серверный: F у ящика →
 *  'adOpen' → 'adLoot'; взять — 'adTake' (оптимистично, сервер —
 *  авторитет); опустел — 'adGone'.
 * ============================================================ */
window.BrixAirdrop = (function () {
  'use strict';

  var scene = null, cam = null;
  var planeProto = null, modelsTried = false;
  var planeMesh = null;
  var gone = {};             /* id удалённых/отменённых (модель летит асинхронно) */
  var plane = null;          /* {sx,sz,y,dx,dz,sp,dist,end} — клиентский докрут */
  var planeAudio = null;
  var map = {};              /* id -> {id,x,z,y,st,inv,mags,grp,chute,ring,tag,swingT,fade} */
  var pending = [];          /* ящики, пришедшие до готовности сцены/модели */
  var pendingTake = {};      /* tid -> {id,item,amt,mag} — откат при adDeny */
  var MODEL_Y = 1.05;        /* низ ящика в модели на -1.05 — садим на дно */
  var YAW_OFF = Math.PI;     /* ориентация модели самолёта по курсу */

  function myId() { return (window.BrixNet && BrixNet.id) || ''; }
  function mode() { return (window.BrixNet && BrixNet.mode) || 'off'; }
  function invInst() { return (window.BrixInventory && BrixInventory.get()) || null; }
  function toast(s, d) { if (window.BrixHud && BrixHud.toast) BrixHud.toast(s, d || 4); }

  function setScene(s, camera) {
    scene = s;
    if (camera) cam = camera;
    loadModels();
    if (scene && pending.length) {
      var list = pending.splice(0, pending.length);
      list.forEach(function (rec) { spawnDrop(rec); });
    }
  }

  function loadModels() {
    if (modelsTried || !scene || !window.BrixGLB) return;
    modelsTried = true;
    BrixGLB.load('assets/models/plane.glb', function (g) {
      planeProto = g;
      if (plane && !planeMesh) ensurePlane();
      console.log('[BrixAirdrop] модель самолёта готова');
    });
    /* ✅ v0.5.19: ящик заранее НЕ грузим — каждому дропу своя копия
       модели (spawnDrop → BrixGLB.load), см. причину там */
  }

  /* ============================ ✈ САМОЛЁТ ============================ */
  function ensurePlane() {
    if (!plane || !scene || !planeProto || planeMesh) return;
    planeMesh = planeProto.clone(true);
    planeMesh.scale.setScalar(1);
    scene.add(planeMesh);
    if (!planeAudio) {
      try {
        /* ✅ v0.5.18: путь как в архиве — папка airplane (была airdrop → 404) */
        planeAudio = new Audio('assets/sfx/airplane/Airdrop.wav');
        planeAudio.loop = true;
        planeAudio.volume = 0;
        planeAudio.play().catch(function () {});
      } catch (eA) { planeAudio = null; }
    } else {
      planeAudio.currentTime = 0;
      planeAudio.play().catch(function () {});
    }
  }

  function planeFromMsg(msg) {
    /* от якоря (x,y,z при dist) строим стартовую точку пути */
    var dist = (msg.dist !== undefined) ? Number(msg.dist)
      : Number(msg.sp || 0) * Number(msg.age || 0);
    plane = {
      sx: Number(msg.x) - Number(msg.dx || 0) * dist,
      sz: Number(msg.z) - Number(msg.dz || 0) * dist,
      y: Number(msg.y), dx: Number(msg.dx || 0), dz: Number(msg.dz || 1),
      sp: Number(msg.sp || 26), dist: dist,
      end: (msg.end !== undefined) ? Number(msg.end) : 1540
    };
    ensurePlane();
  }

  function planeGoneLocal() {
    if (planeMesh && scene) { scene.remove(planeMesh); }
    planeMesh = null;
    plane = null;
    if (planeAudio) { planeAudio.pause(); planeAudio.currentTime = 0; }
  }

  /* ============================ 📦 ЯЩИКИ ============================ */
  function nameTag(name) {
    var cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(28,22,6,0.62)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(8, 8, 240, 48, 12); else ctx.rect(8, 8, 240, 48);
    ctx.fill();
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.fillStyle = '#ffe08a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✈ ' + String(name || 'АИРДРОП').slice(0, 14), 128, 33);
    ctx.strokeStyle = 'rgba(255,214,122,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(8, 8, 240, 48, 12); else ctx.rect(8, 8, 240, 48);
    ctx.stroke();
    var tex = new THREE.CanvasTexture(cv);
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true }));
    sp.scale.set(1.15, 0.29, 1);
    return sp;
  }

  /* ✅ v0.5.19 ПРИЧИНА «ЯЩИК НЕВИДИМ, ПАРАШЮТ ЕСТЬ»: модель аирдропа
     СКИННАЯ (внутри скелет + SkinnedMesh). Object3D.clone() рвёт
     привязку скелета — после clone()+rebind скин-меш уезжал: v0.5.17
     «невидимый ящик», v0.5.18 «парашют без ящика».
     РЕШЕНИЕ: каждому ящику — СВОЯ свежая загрузка через BrixGLB.load
     (парсит файл заново: свои кости, свой Skeleton). Файл 180 КБ
     локальный, ящиков немного — цена копеечная. Если файл не доехал,
     BrixGLB даст серый куб-заглушку — ящик всё равно ВИДЕН и его
     можно открыть */
  function spawnDrop(rec) {
    if (!rec || !rec.id) return;
    var old = map[rec.id];
    if (old) {
      old.inv = rec.inv || old.inv;
      old.mags = rec.mags || old.mags;
      if (rec.st && rec.st !== old.st) setDropState(old, rec.st, rec.y);
      return;
    }
    if (!scene) { pending.push(rec); return; }
    if (gone[rec.id]) return;                  // удалён, пока грузилась модель
    BrixGLB.load('assets/models/airdrop.glb', function (g) { mountDrop(rec, g); });
  }

  function mountDrop(rec, grp) {
    if (!scene || gone[rec.id]) { disposeDeep(grp); return; }
    if (map[rec.id]) { disposeDeep(grp); return; }   // дубль adNew — уже висит
    /* ✅ v0.5.20: ПЕРЕПРИВЯЗКА СКЕЛЕТА ТОЛЬКО ЗДЕСЬ (glb.js вернули
       к identity-бинду — там руки/игроки). Купол аирдропа — скин-меш
       под нодой с трансформом, identity-бинд его сдвигает; бинд с
       мировой матрицей меша (пока группа ещё на identity) ставит
       купол на место — проверено скриншотом v0.5.19 */
    grp.updateMatrixWorld(true);
    grp.traverse(function (o) {
      if (o.isSkinnedMesh && o.skeleton) {
        o.bind(o.skeleton, o.matrixWorld.clone());
      }
    });
    /* ✅ v0.5.20: ГЛАВНАЯ ЛОВУШКА МАТЕРИАЛОВ — парашют это СКИН-МЕШ
       (PickUp_Airdrop_A_D, большой), а ЯЩИК — статический меш с
       материалом PickUp_CarePackage_B_D! Раньше по имени
       «carepackage» мы таяли ЯЩИК и оставляли КУПОЛ. Теперь: тает
       то, что СКИНОВОЕ (купол), ящик всегда остаётся. У каждой
       свежей загрузки свои материалы — таяние не заденет соседей */
    var chute = [];
    grp.traverse(function (o) {
      if (o.isMesh) {
        o.frustumCulled = false;
        if (o.isSkinnedMesh && o.material) {
          o.material.transparent = true;
          chute.push(o);                       // купол парашюта
        }
      }
    });
    var ring = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.2, 28),
      new THREE.MeshBasicMaterial({ color: 0xffd97a, transparent: true, opacity: 0.3,
        side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    var tag = nameTag('АИРДРОП');
    tag.position.y = 1.9;
    grp.add(ring);
    grp.add(tag);
    scene.add(grp);
    map[rec.id] = {
      id: rec.id, x: Number(rec.x) || 0, z: Number(rec.z) || 0,
      y: Number(rec.y) || 0, st: rec.st || 'fall',
      fall: Number(rec.fall) || 5.5,
      inv: rec.inv || {}, mags: rec.mags || {},
      grp: grp, chute: chute, ring: ring, tag: tag,
      swingT: Math.random() * 3, fade: -1
    };
    var e = map[rec.id];
    e.grp.position.set(e.x, e.y + MODEL_Y, e.z);
    setDropState(e, e.st, e.y);
    if (e.st === 'ok') {
      /* ящик уже лежит (welcome/перезаход) — парашют УЖЕ растаял */
      e.fade = -2;
      e.chute.forEach(function (m) {
        m.visible = false;
        if (m.material) m.material.opacity = 0;
      });
    }
  }

  /* полная утилизация СВОЕЙ копии модели: свежий парс владеет
     геометриями/материалами/текстурами и ни с кем ими не делится */
  function disposeDeep(grp) {
    if (!grp) return;
    grp.traverse(function (o) {
      if (o.geometry) { try { o.geometry.dispose(); } catch (e1) {} }
      if (o.material) {
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(function (m) {
          if (m.map) { try { m.map.dispose(); } catch (e2) {} }
          try { m.dispose(); } catch (e3) {}
        });
      }
    });
  }

  /** переключение состояния: 'fall' (парашут стоит) / 'ok' (тает) */
  function setDropState(e, st, y) {
    e.st = st;
    if (st === 'ok' && typeof y === 'number' && isFinite(y)) e.y = y;
    if (st === 'ok' && e.fade < 0 && e.chute.length) e.fade = 0;   // запускаем таяние
    if (st === 'fall' && e.chute.length) {
      e.chute.forEach(function (m) { m.visible = true; });
      e.fade = -1;
    }
  }

  function build(drops, planeMsg) {
    (drops || []).forEach(function (rec) { spawnDrop(rec); });
    if (planeMsg) planeFromMsg(planeMsg);
  }

  function remove(id) {
    var e = map[id];
    if (!e) { gone[id] = 1; return; }          // отмена ещё летящей загрузки
    if (e.grp && scene) {
      scene.remove(e.grp);
      /* ✅ v0.5.19: у каждого ящика СВОЯ копия модели — утилизируем
         всю геометрию/материалы/текстуры (без этого копился бы GPU-мусор) */
      disposeDeep(e.grp);
    }
    if (e.ring) { try { e.ring.geometry.dispose(); e.ring.material.dispose(); } catch (er) {} }
    if (e.tag) { try { e.tag.material.map.dispose(); e.tag.material.dispose(); } catch (er) {} }
    gone[id] = 1;
    delete map[id];
    if (window.BrixLootMenu && BrixLootMenu.openId() === id) BrixLootMenu.close();
  }

  function has(id) { return !!map[id]; }
  function get(id) { return map[id] || null; }

  /** ближайший ПРИЗЕМЛИВШИЙСЯ ящик в радиусе maxD (для клавиши F) */
  function nearest(pos, maxD) {
    var best = (maxD || 4.2) * (maxD || 4.2), found = null;
    for (var k in map) {
      var e = map[k];
      if (e.st !== 'ok' || !e.grp) continue;
      var dx = e.grp.position.x - pos.x, dz = e.grp.position.z - pos.z;
      var d2 = dx * dx + dz * dz;
      if (d2 < best) { best = d2; found = k; }
    }
    return found;
  }

  /** F у ящика: меню сразу локально, сервер уточнит 'adLoot' */
  function loot(id) {
    var e = map[id];
    if (!e || !window.BrixLootMenu) return;
    BrixLootMenu.open(id, e.inv, 0, 'ad', 'АИРДРОП', e.mags);
    if (mode() === 'server') BrixNet.send({ t: 'adOpen', id: id });
  }

  /** ЗАБРАТЬ предмет: оптимистично у себя, сервер — авторитет */
  function take(id, item, amt) {
    var e = map[id];
    if (!e || !item) return;
    amt = Math.max(0, Math.floor(amt || 0));
    var have = e.inv[item] || 0;
    if (!have) return;
    var I = invInst();
    if (I && I.freeSpaceFor) {
      var fits = I.freeSpaceFor(item);
      if (fits <= 0) { toast('Инвентарь полон'); return; }
      if (amt > fits || amt <= 0) amt = fits;
      if (amt <= 0) return;
    } else if (amt <= 0) amt = have;
    amt = Math.min(amt, have);
    var tid = 'A' + Math.random().toString(36).slice(2, 9);
    var mag = 0;
    if (e.mags && Array.isArray(e.mags[item]) && e.mags[item].length) {
      mag = e.mags[item].shift() | 0;
      if (!e.mags[item].length) delete e.mags[item];
    }
    pendingTake[tid] = { id: id, item: item, amt: amt, mag: mag };
    var inv2 = Object.assign({}, e.inv);
    inv2[item] = have - amt;
    e.inv = inv2;
    if (I) {
      I.addItem(item, amt, mag);
      if (I.showPickup) I.showPickup(item, amt);
    }
    if (window.BrixLootMenu && BrixLootMenu.openId() === id) {
      BrixLootMenu.update(id, inv2, e.mags);
    }
    if (mode() === 'server') BrixNet.send({ t: 'adTake', id: id, item: item, amt: amt, tid: tid });
  }

  /** откат отказа сервера: предмет вернулся в ящик */
  function deny(msg) {
    var p = pendingTake[msg.tid];
    if (!p) return;
    delete pendingTake[msg.tid];
    var I = invInst();
    if (I) I.removeCountByItem(p.item, p.amt);
    var e = map[p.id];
    if (e) {
      e.inv = Object.assign({}, e.inv);
      e.inv[p.item] = (e.inv[p.item] || 0) + p.amt;
      if (p.mag) {
        e.mags = e.mags || {};
        e.mags[p.item] = Array.isArray(e.mags[p.item]) ? e.mags[p.item] : [];
        e.mags[p.item].unshift(p.mag);
      }
      if (window.BrixLootMenu && BrixLootMenu.openId() === p.id) {
        BrixLootMenu.update(p.id, e.inv, e.mags);
      }
    }
    toast('Сервер отклонил: подойди ближе');
  }

  function applyLoot(msg) {
    var e = map[msg.id];
    if (!e) return;
    e.inv = msg.inv || {};
    if (msg.mags) e.mags = msg.mags;
    var mine = msg.pid === myId();
    if (mine && msg.tid) delete pendingTake[msg.tid];
    if (window.BrixLootMenu && BrixLootMenu.openId() === msg.id) {
      BrixLootMenu.update(msg.id, e.inv, e.mags);
    }
  }

  /** все события самолёта и ящиков */
  function onNet(msg) {
    if (!msg || !msg.t) return;
    switch (msg.t) {
      case 'plane': planeFromMsg(msg); break;
      case 'planeS': {
        /* мягкая коррекция мёртвого счёта — без рывков */
        if (!plane) { planeFromMsg(msg); break; }
        var tx = Number(msg.x), tz = Number(msg.z);
        var proj = Math.hypot(tx - plane.sx, tz - plane.sz);
        if (isFinite(proj)) plane.corr = proj - plane.dist;
        break;
      }
      case 'planeGone': planeGoneLocal(); break;
      case 'adNew': spawnDrop(msg); break;
      case 'adLand': {
        var e = map[String(msg.id || '')];
        if (e) setDropState(e, 'ok', Number(msg.y));
        break;
      }
      case 'adGone': remove(String(msg.id || '')); break;
      case 'adLoot': applyLoot(msg); break;
      case 'adDeny': deny(msg); break;
    }
  }

  /* ---------- ТИК: полёт, падение, таяние парашюта, звук ---------- */
  function tick(dt) {
    /* самолёт: докрутка каждый кадр + мягкая подтяжка к якорю */
    if (plane) {
      plane.dist += plane.sp * dt;
      if (plane.corr) {
        var k = Math.min(1, dt * 2.2);
        plane.dist += plane.corr * k;
        plane.corr *= (1 - k);
        if (Math.abs(plane.corr) < 0.05) plane.corr = 0;
      }
      if (plane.dist >= plane.end) planeGoneLocal();
    }
    if (planeMesh && plane) {
      var px = plane.sx + plane.dx * plane.dist;
      var pz = plane.sz + plane.dz * plane.dist;
      planeMesh.position.set(px, plane.y, pz);
      planeMesh.rotation.y = Math.atan2(plane.dx, plane.dz) + YAW_OFF;
      if (planeAudio && window.BrixGame && BrixGame.state) {
        var playing = BrixGame.state.phase === 'playing';
        var vol = 0;
        if (playing && cam) {
          var d = planeMesh.position.distanceTo(cam.position);
          vol = Math.max(0, Math.min(0.85, 0.85 * (1 - d / 320)));
        }
        planeAudio.volume = vol;
        if (playing && planeAudio.paused) planeAudio.play().catch(function () {});
        if (!playing && !planeAudio.paused) planeAudio.pause();
      }
    }
    /* ящики */
    for (var k in map) {
      var e = map[k];
      e.swingT += dt;
      if (e.st === 'fall') {
        e.y -= e.fall * dt;
        e.grp.position.set(e.x, e.y + MODEL_Y, e.z);
        e.grp.rotation.z = Math.sin(e.swingT * 1.35) * 0.055;
        e.grp.rotation.x = Math.cos(e.swingT * 1.05) * 0.045;
      } else {
        /* посадка: докрутка до точной высоты сервера */
        var ty = e.y + MODEL_Y;
        var cur = e.grp.position.y;
        if (Math.abs(cur - ty) > 0.01) {
          e.grp.position.y = cur + (ty - cur) * Math.min(1, dt * 5);
        }
        e.grp.rotation.z *= Math.max(0, 1 - dt * 3);
        e.grp.rotation.x *= Math.max(0, 1 - dt * 3);
      }
      /* ✅ v0.5.20: тает ТОЛЬКО купол (скин-меш) — прозрачность.
         Подъём/сжатие убрали: скин-вершины идут за КОСТЯМИ и не
         реагируют на scale/position самого меша */
      if (e.fade >= 0) {
        e.fade += dt;
        var t = Math.min(1, e.fade / 1.3);
        e.chute.forEach(function (m) {
          m.visible = t < 1;
          m.material.opacity = 1 - t;
        });
        if (t >= 1) e.fade = -2;                    // готово — больше не трогаем
      }
      /* золотое кольцо-маячок у приземлившегося */
      if (e.ring) {
        e.ring.visible = e.st === 'ok';
        e.ring.material.opacity = 0.16 + 0.16 * (0.5 + 0.5 * Math.sin(e.swingT * 2.2));
        e.ring.position.y = 0.06 - MODEL_Y;
      }
      if (e.tag) e.tag.position.y = (e.st === 'ok' ? 1.9 : 2.4) +
        0.03 * Math.sin(e.swingT * 1.6);
    }
  }

  return {
    setScene: setScene,
    build: build,
    spawnDrop: spawnDrop,
    remove: remove,
    has: has,
    get: get,
    nearest: nearest,
    loot: loot,
    take: take,
    onNet: onNet,
    tick: tick,
    count: function () { return Object.keys(map).length; },
    planeActive: function () { return !!plane; },
    /* 🧪 тестам: прямая ссылка на камеру (поставить ящик перед носом) */
    debugCam: function () { return cam; }
  };
})();
