/* ============================================================
 *  brix • js/game/corpses.js — ТРУПЫ-ЛУТБОКСЫ (v0.4.43)
 *
 *  Когда игрок умирает, его ВЕСЬ инвентарь уходит в ТРУП:
 *  • тело падает на землю (рэгдолл в remoteplayer.js), а на месте
 *    смерти остаётся труп-лутбокс: лежащая кукла в цвете игрока +
 *    красное пульсирующее кольцо + плашка «ТРУП · Ник»;
 *  • подойти и нажать F — открывается лут-меню (как у ящика):
 *    все ресурсы погибшего можно забрать (клик / drag&drop);
 *  • СИНХРОНИЗАЦИЯ: труп живёт НА СЕРВЕРЕ (worldObjs.corpses) —
 *    его видят все, включая тех, кто зашёл ПОСЛЕ смерти (welcome
 *    кладёт трупы в снапшот), и он переживает перезапуск сервера;
 *  • опустел — сервер убирает труп ('corpseGone'); ✅ v0.4.50: НЕЗАЛУТАННЫЙ
 *    труп исчезает через 10 минут (залутанный — через 20);
 *  • СОЛО/ВКЛАДКИ: труп живёт локально (вкладки синхронизируются
 *    через BroadcastChannel) — после респауна можно вернуть свои вещи.
 * ============================================================ */
window.BrixCorpses = (function () {
  'use strict';

  var scene = null;
  var pending = [];          // трупы, пришедшие до готовности сцены
  var map = {};              // id -> {id,x,y,z,n,c,inv,grp,ring,tag,t}
  var pendingTake = {};      // tid -> {id,item,amt} — оптимистичные взятия

  function t(k, o) { return window.BrixState ? BrixState.t(k, o) : k; }
  function myId() { return (window.BrixNet && BrixNet.id) || ''; }
  function mode() { return (window.BrixNet && BrixNet.mode) || 'off'; }
  function invInst() { return (window.BrixInventory && BrixInventory.get()) || null; }
  function toast(s, d) { if (window.BrixHud && BrixHud.toast) BrixHud.toast(s, d || 4); }

  function setScene(s) {
    scene = s;
    if (scene && pending.length) {
      var list = pending.splice(0, pending.length);
      list.forEach(function (rec) { spawn(rec); });
    }
  }

  function groundY(x, z, fb) {
    try {
      if (window.BrixTerrain && BrixTerrain.heightAt) {
        var h = BrixTerrain.heightAt(x, z);
        if (typeof h === 'number' && isFinite(h)) return h;
      }
    } catch (e) {}
    return fb || 0;
  }

  /* ✅ v0.4.44: высота ПОД ТРУПОМ С УЧЁТОМ ПОСТРОЕК — труп ложится не только
     в землю, но и НА ФУНДАМЕНТ, ПОТОЛОК (и 2 этаж) и насыпь чекблока.
     Ищем самую высокую опору НЕ ВЫШЕ точки смерти + ступенька 0.8 м:
     BrixBuilding.floorAt(x, z, feetY) возвращает верх палубы/потолка,
     если тот в пределах ступеньки от переданных ног (тут — от смерти).
     Возвращаем максимум(рельеф, постройка) — как в groundAt gameworld'а */
  function corpseY(x, z, diedY) {
    var h = groundY(x, z, diedY || 0);
    var base = (diedY !== undefined && diedY !== null && isFinite(diedY))
      ? diedY : h;
    try {
      if (window.BrixBuilding && BrixBuilding.floorAt) {
        var bf = BrixBuilding.floorAt(x, z, base + 0.8);
        if (bf !== null && bf > h && bf <= base + 1.2) h = bf;
      }
    } catch (e2) {}
    try {
      if (window.BrixProps && BrixProps.padAt) {
        var pad = BrixProps.padAt(x, z);
        if (pad && pad.d <= 4.4 && pad.top > h && pad.top <= base + 1.2) h = pad.top;
      }
    } catch (e3) {}
    return h;
  }

  function hashYaw(id) {
    var h = 7;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return (Math.abs(h) % 628) / 100;
  }

  /* ============================================================
     ✅ v0.4.50 ТТЛ ТРУПОВ НА КЛИЕНТЕ (соло/вкладки; в сетевой игре
     авторитет — СЕРВЕР, он сам рассылает 'corpseGone'):
     «трупы исчезают через каждые 10 мин, если их никто не залутал».
     НЕЗАЛУТАННЫЙ труп (с него ничего не брали) — 10 минут, ЗАЛУТАННЫЙ
     (looted) — 20 минут страховки; опустевший убирается сразу (checkEmpty).
     ============================================================ */
  var CORPSE_TTL_UNLOOTED = 10 * 60;   // сек
  var CORPSE_TTL_LOOTED = 20 * 60;     // сек

  /** лежащая кукла: торс/голова/сложенные конечности в цвете игрока */
  function makeBody(color, name) {
    var g = new THREE.Group();
    var cap = function (r, l) {
      try { return new THREE.CapsuleGeometry(r, l, 4, 10); }
      catch (e) { return new THREE.CylinderGeometry(r, r, l + r * 2, 10); }
    };
    var shirt = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color || '#b0722f'), roughness: 0.88, metalness: 0.02 });
    var pants = new THREE.MeshStandardMaterial({ color: 0x39423d, roughness: 0.92 });
    var skin = new THREE.MeshStandardMaterial({ color: 0xc9a882, roughness: 0.8 });
    // торс — лежит вдоль Z (голова в -Z)
    var torso = new THREE.Mesh(cap(0.155, 0.40), shirt);
    torso.rotation.x = Math.PI / 2;
    torso.position.set(0, 0.17, 0.02);
    g.add(torso);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), skin);
    head.position.set(0, 0.16, -0.33);
    g.add(head);
    var legs = [[-0.10, -0.14], [0.10, 0.14]];
    for (var i = 0; i < 2; i++) {
      var leg = new THREE.Mesh(cap(0.075, 0.40), pants);
      leg.rotation.x = Math.PI / 2;
      leg.rotation.y = legs[i][1];
      leg.position.set(legs[i][0], 0.13, 0.52);
      g.add(leg);
    }
    var arms = [[-0.26, 0.55], [0.26, -0.55]];
    for (var j = 0; j < 2; j++) {
      var arm = new THREE.Mesh(cap(0.058, 0.30), shirt);
      arm.rotation.x = Math.PI / 2;
      arm.rotation.y = arms[j][1];
      arm.position.set(arms[j][0], 0.11, -0.02);
      g.add(arm);
    }
    // красное пульсирующее кольцо — «здесь лут»
    var ring = new THREE.Mesh(
      new THREE.RingGeometry(0.52, 0.70, 26),
      new THREE.MeshBasicMaterial({ color: 0xe0392a, transparent: true, opacity: 0.3,
        side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.035;
    g.add(ring);
    // плашка «ТРУП · Ник»
    var tag = nameTag(name || '?');
    tag.position.y = 0.62;
    g.add(tag);
    return { grp: g, ring: ring, tag: tag, mats: [shirt, pants, skin] };
  }

  function nameTag(name) {
    var cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(30,8,6,0.62)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(8, 8, 240, 48, 12); else ctx.rect(8, 8, 240, 48);
    ctx.fill();
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.fillStyle = '#ffb9a8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('corpse.tag', { n: String(name || '?').slice(0, 14) }), 128, 33);
    ctx.strokeStyle = 'rgba(224,57,42,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(8, 8, 240, 48, 12); else ctx.rect(8, 8, 240, 48);
    ctx.stroke();
    var tex = new THREE.CanvasTexture(cv);
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true }));
    sp.scale.set(1.05, 0.26, 1);
    return sp;
  }

  /** создать/обновить труп (rec: {id,x,y,z,n,c,inv, ✅ v0.4.54 mags})
      mags — {id: [обойма, обойма, ...]}: обоймы огнестрела умирают В ТРУПЕ,
      а не обнуляются (убил игрока с 20 патронами в калаше — там и лутаешь 20) */
  function spawn(rec) {
    if (!rec || !rec.id) return;
    var old = map[rec.id];
    if (old) {
      old.inv = rec.inv || old.inv;
      if (rec.mags) old.mags = rec.mags;             // ✅ v0.4.54
      if (rec.lt) old.looted = true;   // ✅ v0.4.50: сервер сказал «уже лутали»
      if (old.grp) old.grp.position.set(rec.x, corpseY(rec.x, rec.z, rec.y), rec.z);
      return;
    }
    if (!scene) { pending.push(rec); return; }
    var body = makeBody(rec.c, rec.n);
    var y = corpseY(rec.x, rec.z, rec.y);
    body.grp.position.set(rec.x, y, rec.z);
    body.grp.rotation.y = hashYaw(String(rec.id));
    /* ✅ v0.4.44: id трупа в userData группы — луч aimed() находит труп */
    body.grp.userData.cid = rec.id;
    scene.add(body.grp);
    /* ✅ v0.4.50: сервер присылает age (возраст трупа в мс) и lt
       («уже лутали») — новичок не «омолаживает» старые трупы */
    map[rec.id] = { id: rec.id, x: rec.x, y: y, z: rec.z,
      n: rec.n || '?', c: rec.c || '', inv: rec.inv || {},
      mags: rec.mags || {},                           // ✅ v0.4.54 обоймы
      grp: body.grp, ring: body.ring, tag: body.tag, t: Math.random() * 3,
      born: Date.now() - Math.max(0, Number(rec.age) || 0),
      looted: !!rec.lt };
  }

  function build(list) {
    (list || []).forEach(function (rec) { spawn(rec); });
  }

  function dispose(e) {
    if (!scene || !e || !e.grp) return;
    scene.remove(e.grp);
    e.grp.traverse(function (o) {
      if (o.geometry) { try { o.geometry.dispose(); } catch (er) {} }
      if (o.material && o.material.map) { try { o.material.map.dispose(); } catch (er) {} }
      if (o.material) { try { o.material.dispose(); } catch (er) {} }
    });
  }

  function remove(id) {
    var e = map[id];
    if (!e) return;
    dispose(e);
    delete map[id];
    if (window.BrixLootMenu && BrixLootMenu.openId() === id) BrixLootMenu.close();
  }

  function has(id) { return !!map[id]; }
  function get(id) { return map[id] || null; }

  /** ближайший труп в радиусе maxD (для клавиши F) */
  function nearest(pos, maxD) {
    var best = (maxD || 3.2) * (maxD || 3.2), found = null;
    for (var k in map) {
      var e = map[k];
      if (!e.grp) continue;
      var dx = e.grp.position.x - pos.x, dz = e.grp.position.z - pos.z;
      var d2 = dx * dx + dz * dz;
      if (d2 < best) { best = d2; found = k; }
    }
    return found;
  }

  /* ============================================================
     ✅ v0.4.44 ТРУП — ПО НАВЕДЕНИЮ, НЕ «ПО БЛИЗОСТИ» (просьба игрока):
     из камеры идёт ЛУЧ на группы трупов + постройки + рельеф. Труп
     открывается только если он ПЕРВЫЙ, во что упёрся взгляд в 3.4 м —
     это же ЗАПРЕТ ЛУТА ЧЕРЕЗ СТЕНУ (просьба игрока): стена между
     игроком и трупом перехватывает луч раньше трупа
     ============================================================ */
  var _ray = null;
  /* ✅ v0.4.45 FIX «three.min.js: THREE.Sprite: "Raycaster.camera" needs to be
     set … Cannot read properties of null (reading 'matrixWorld')»: у трупа
     плашка «ТРУП · Ник» — это THREE.Sprite, а Sprite.raycast требует
     raycaster.camera. Раньше камера не передавалась → при нажатии F падал
     TypeError и лут трупа не открывался вовсе. Теперь gameworld передаёт
     камеру (как уже делается в v0.4.5 для ников игроков), плюс страховка:
     try/catch с временным отключением спрайтов, чтобы F не ломался никогда */
  function aimed(origin, dir, maxD, cam) {
    if (!scene || !window.THREE) return null;
    var bestD = maxD || 3.4;
    var targets = [];
    for (var k in map) {
      if (map[k].grp) targets.push(map[k].grp);
    }
    if (!targets.length) return null;
    if (!_ray) _ray = new THREE.Raycaster();
    if (cam) _ray.camera = cam;      // спрайтам (плашкам) нужна камера
    _ray.set(origin, dir);
    _ray.far = bestD;
    var hits;
    try {
      hits = _ray.intersectObjects(targets, true);
    } catch (eR) {
      /* камера не пришла (старый вызов) — глушим спрайты и повторяем */
      var saved = [];
      for (var ti = 0; ti < targets.length; ti++) {
        (function (grp) {
          grp.traverse(function (o) {
            if (o.isSprite) { saved.push([o, o.raycast]); o.raycast = function () {}; }
          });
        })(targets[ti]);
      }
      hits = _ray.intersectObjects(targets, true);
      for (var si = 0; si < saved.length; si++) saved[si][0].raycast = saved[si][1];
    }
    if (!hits.length) return null;
    var corpseHit = hits[0];
    // стена/рельеф ближе трупа — лут через препятствие запрещён
    try {
      var blockers = [];
      if (window.BrixBuilding && BrixBuilding.hitTargets) {
        var bt = BrixBuilding.hitTargets();
        if (bt && bt.length) blockers = blockers.concat(bt);
      }
      if (window.__brixTerrainMesh) blockers.push(window.__brixTerrainMesh);
      if (blockers.length) {
        _ray.set(origin, dir);
        _ray.far = Math.max(0.01, corpseHit.distance - 0.05);
        var bh = _ray.intersectObjects(blockers, true);
        if (bh.length) return null;   // что-то стоит между — не открываем
      }
    } catch (eB) {}
    // id трупа: ищем в userData вверх по родителям (group.userData.cid)
    var o = corpseHit.object;
    while (o && !(o.userData && o.userData.cid)) o = o.parent;
    return o ? (o.userData ? o.userData.cid : null) : null;
  }

  /** открыть лут-меню трупа (локальная копия — сервер уточнит corpseLoot'ом) */
  function loot(id) {
    var e = map[id];
    if (!e || !window.BrixLootMenu) return;
    /* ✅ v0.4.54: mags — обоймы стволов в трупе (меню показывает остаток) */
    BrixLootMenu.open(id, e.inv, 0, 'corpse', e.n, e.mags);
  }

  function checkEmpty(id) {
    var e = map[id];
    if (!e) return;
    var empty = !Object.keys(e.inv).some(function (k) { return (e.inv[k] | 0) > 0; });
    if (!empty) return;
    if (mode() === 'server') {
      // сервер сам разошлёт corpseGone (и остальным, и нам)
    } else {
      if (mode() === 'tabs') BrixNet.send({ t: 'corpseGone', id: id });
      remove(id);
    }
  }

  /** ЗАБРАТЬ предмет из трупа: оптимистично у себя, сервер — авторитет */
  function take(id, item, amt) {
    var e = map[id];
    if (!e || !item) return;
    amt = Math.max(0, Math.floor(amt || 0));
    var have = e.inv[item] || 0;
    if (!have) return;
    var I = invInst();
    if (I && I.freeSpaceFor) {
      var fits = I.freeSpaceFor(item);
      if (fits <= 0) { toast(t('corpse.full')); return; }
      if (amt > fits || amt <= 0) amt = fits;      // клик без amt — сколько влезет
      if (amt <= 0) return;
    } else if (amt <= 0) amt = have;
    amt = Math.min(amt, have);
    var tid = '';
    if (mode() === 'server') {
      tid = 'T' + Math.random().toString(36).slice(2, 9);
      pendingTake[tid] = { id: id, item: item, amt: amt };
    }
    e.looted = true;   // ✅ v0.4.50: с трупа лутали — TTL 20 мин вместо 10
    var inv2 = Object.assign({}, e.inv);
    inv2[item] = have - amt;
    /* ✅ v0.4.54 СИНХРОНИЗАЦИЯ ПАТРОНОВ: обойма уходит из трупа ВМЕСТЕ
       со стволом (mags {id: [...]} — по обойме на каждый ствол вида;
       забрали 1 из 2 калашей — у забранного обойма из очереди) */
    var mag = 0;
    if (e.mags && Array.isArray(e.mags[item]) && e.mags[item].length) {
      mag = e.mags[item].shift() | 0;
      if (!e.mags[item].length) delete e.mags[item];
      if (pendingTake[tid]) pendingTake[tid].mag = mag;   // для отката deny
    }
    var mags2 = e.mags ? Object.assign({}, e.mags) : {};
    if (I) {
      I.addItem(item, amt, mag);
      if (I.showPickup) I.showPickup(item, amt);
    }
    e.inv = inv2;
    e.mags = mags2;
    if (window.BrixLootMenu && BrixLootMenu.openId() === id) BrixLootMenu.update(id, inv2, mags2);
    if (mode() === 'server') {
      BrixNet.send({ t: 'corpseTake', id: id, item: item, amt: amt, tid: tid });
    } else if (mode() === 'tabs') {
      BrixNet.send({ t: 'corpseLoot', id: id, inv: inv2, mags: mags2, pid: myId(),
        item: item, amt: amt, tid: 'tab' });
    }
    checkEmpty(id);
  }

  /** откат отказа сервера: предмет вернулся в труп */
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
      /* ✅ v0.4.54: обойма тоже возвращается в труп (в начало очереди) */
      if (p.mag) {
        e.mags = e.mags || {};
        e.mags[p.item] = Array.isArray(e.mags[p.item]) ? e.mags[p.item] : [];
        e.mags[p.item].unshift(p.mag);
      }
      if (window.BrixLootMenu && BrixLootMenu.openId() === p.id) BrixLootMenu.update(p.id, e.inv, e.mags);
    }
    toast(t('corpse.deny'));
  }

  function applyLoot(msg) {
    var e = map[msg.id];
    if (!e) return;
    e.inv = msg.inv || {};
    if (msg.mags) e.mags = msg.mags;   // ✅ v0.4.54: сервер прислал обоймы трупа
    if (msg.amt) e.looted = true;   // ✅ v0.4.50: кто-то что-то взял — расширенный TTL
    var mine = msg.pid === myId();
    if (mine && msg.tid) delete pendingTake[msg.tid];
    else if (mine && !msg.tid && msg.item) {
      // старый сервер без tid — предмет добавляем тут (как applyCrateLoot);
      // ✅ v0.4.54: старый сервер обойму не шлёт — будет 0, как раньше
      var I = invInst();
      if (I) {
        I.addItem(msg.item, msg.amt || 0);
        if (I.showPickup) I.showPickup(msg.item, msg.amt || 0);
      }
    }
    if (window.BrixLootMenu && BrixLootMenu.openId() === msg.id) BrixLootMenu.update(msg.id, e.inv, e.mags);
    checkEmpty(msg.id);
  }

  /** все события corpse* (сервер/вкладки/соло) */
  function onNet(msg) {
    if (!msg || !msg.t) return;
    switch (msg.t) {
      case 'corpseNew': spawn(msg); break;
      case 'corpseLoot': applyLoot(msg); break;
      case 'corpseGone': remove(String(msg.id || '')); break;
      case 'corpseDeny': deny(msg); break;
    }
  }

  /** пульс колец + лёгкое покачивание плашек + ✅ v0.4.50: ТТЛ трупов */
  function tick(dt) {
    var ttlOn = (mode() !== 'server');   // в сетевой игре решает сервер
    var nowMs = Date.now();
    for (var k in map) {
      var e = map[k];
      /* ✅ v0.4.50: незалутанный труп исчезает через 10 мин, залутанный —
         через 20. В режиме вкладок — сообщаем остальным ('corpseGone'),
         в соло — просто убираем */
      if (ttlOn && e.born &&
          nowMs - e.born > (e.looted ? CORPSE_TTL_LOOTED : CORPSE_TTL_UNLOOTED) * 1000) {
        if (mode() === 'tabs') BrixNet.send({ t: 'corpseGone', id: k });
        remove(k);
        continue;
      }
      if (!e.ring) continue;
      e.t += dt;
      e.ring.material.opacity = 0.20 + 0.14 * (0.5 + 0.5 * Math.sin(e.t * 2.4));
      if (e.tag) e.tag.position.y = 0.62 + 0.025 * Math.sin(e.t * 1.7);
    }
  }

  return {
    setScene: setScene,
    build: build,
    spawn: spawn,
    remove: remove,
    has: has,
    get: get,
    nearest: nearest,
    /* ✅ v0.4.44: труп ПО НАВЕДЕНИЮ + запрет лута через стену;
       ✅ v0.4.45: aimed(origin, dir, maxD, cam) — камера для спрайтов */
    aimed: aimed,
    loot: loot,
    take: take,
    onNet: onNet,
    tick: tick,
    count: function () { return Object.keys(map).length; }
  };
})();
