// ============================================================
//  brix • js/game/footprints.js
//  ✅ v0.4.42 СЛЕДЫ НОГ на песке и снегу
//  - идёшь по песку или снегу — за тобой остаются следы ботинок:
//    левый/правый по очереди, направлены ПО ХОДУ, лежат ПО НАКЛОНУ
//    рельефа, тают при появлении (мягкая прозрачность);
//  - СВОИХ следов максимум 50: как только пошёл 51-й — САМЫЙ ПЕРВЫЙ
//    начинает таять (FIFO), «мусор» не копится и не лагает;
//  - ЧУЖИЕ игроки тоже оставляют следы (свой лимит 24, общий пул —
//    чтобы на сервере с толпой не плодить сотни мешей);
//  - на траве/камне/земле/постройках/в прыжке следов НЕТ — только
//    песок (BrixTerrain.surfaceAt = 1) и снег (= 2).
//  Декали: одна PlaneGeometry на всех, материалы клонируются на
//  след (нужен свой opacity для рождения/таяния) — копеечная цена.
// ============================================================
window.BrixFootprints = (function () {
  'use strict';

  var MAX_LOCAL = 50;      // ✅ требование: своих следов не больше 50
  var MAX_REMOTE = 24;     // чужие — общий лимит, чтобы не лагало
  var STEP_WALK = 0.78;    // шаг при ходьбе (м)
  var STEP_RUN = 1.08;     // шаг при беге (м)
  var FADE_IN = 0.16;      // рождение следа
  var FADE_OUT = 0.55;     // таяние «уступившего место» следа
  var DEPTH_EPS = 0.045;   // подъём над рельефом против мерцания
  var AIR_EYE = 2.4;       // глаза выше земли на столько — не на земле

  var scene = null;
  var geo = null;
  var tex = null;
  var matSand = null;
  var matSnow = null;
  var pool = [];           // следы локального игрока
  var rpool = [];          // следы чужих игроков
  var last = null;         // {x, z, side}
  var rlast = {};          // id -> {x, z, side}

  /* ---------- текстура подошвы (белая — красится материалом) ---------- */
  function makePrintTexture() {
    var cv = document.createElement('canvas');
    cv.width = 64; cv.height = 112;
    var c = cv.getContext('2d');
    c.fillStyle = '#ffffff';
    // ступня и каблук — два овала
    c.beginPath(); c.ellipse(32, 36, 17, 25, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(32, 84, 13, 15, 0, 0, Math.PI * 2); c.fill();
    // протектор — вырезаем полосы
    c.globalCompositeOperation = 'destination-out';
    var y;
    for (y = 22; y < 54; y += 7) c.fillRect(19, y, 26, 2.6);
    for (y = 74; y < 94; y += 6) c.fillRect(23, y, 18, 2.4);
    c.fillRect(29, 54, 6, 24);   // перемычка
    c.globalCompositeOperation = 'source-over';
    var t = new THREE.CanvasTexture(cv);
    t.anisotropy = 4;
    return t;
  }

  function makeMat(colorHex, opacity) {
    return new THREE.MeshBasicMaterial({
      map: tex,
      color: colorHex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
  }

  /* ---------- спавн одного следа ---------- */
  /** list — пул; x/z — точка; dirX/dirZ — направление шага (уже
      нормализованное); type — 1 песок / 2 снег; side — 0 лево / 1 право */
  function spawn(list, x, z, dirX, dirZ, type, side) {
    var T = window.BrixTerrain;
    if (!scene || !geo || !T || !T.meshHeightAt) return;

    var gy = T.meshHeightAt(x, z);

    // меш следа: свой материал (opacity у каждого свой)
    var mesh = new THREE.Mesh(geo, (type === 2 ? matSnow : matSand).clone());
    mesh.position.set(x, gy + DEPTH_EPS, z);
    mesh.renderOrder = 2;
    mesh.matrixAutoUpdate = false;

    // 1) нормаль рельефа — след лежит ПО НАКЛОНУ
    var e = 0.55;
    var hx = T.meshHeightAt(x + e, z) - T.meshHeightAt(x - e, z);
    var hz = T.meshHeightAt(x, z + e) - T.meshHeightAt(x, z - e);
    var up = new THREE.Vector3(-hx, 2 * e, -hz).normalize();

    // 2) направление шага проецируем на плоскость поверхности
    var f = new THREE.Vector3(dirX, 0, dirZ);
    if (f.lengthSq() < 1e-6) f.set(1, 0, 0);
    f.addScaledVector(up, -f.dot(up)).normalize();

    // 3) базис: локальная -Z геометрии (носок) → по ходу движения.
    //    Плоскость развёрнута rotateX(-90°): носок смотрит в -Z,
    //    поэтому «вперёд» едет в столбец Z с обратным знаком.
    var bz = f.clone().negate();
    var right = new THREE.Vector3().crossVectors(up, bz);
    var m = new THREE.Matrix4().makeBasis(right, up, bz);
    mesh.quaternion.setFromRotationMatrix(m);

    // 4) сдвиг влево/вправо от линии хода + зеркало левого следа
    var perpX = -dirZ, perpZ = dirX;
    var off = (side === 0 ? -1 : 1) * 0.12;
    mesh.position.x += perpX * off;
    mesh.position.z += perpZ * off;
    if (side === 0) mesh.scale.x = -1;

    mesh.updateMatrix();
    mesh.updateMatrixWorld(true);
    scene.add(mesh);

    list.push({
      mesh: mesh,
      age: 0,
      dying: false,
      dieT: 0,
      baseOpacity: type === 2 ? 0.62 : 0.52
    });
  }

  /** ✅ ЛИМИТ: живых следов больше max — САМЫЙ ПЕРВЫЙ начинает таять */
  function evict(list, max) {
    var alive = 0, i, first = null;
    for (i = 0; i < list.length; i++) if (!list[i].dying) alive++;
    while (alive >= max) {
      first = null;
      for (i = 0; i < list.length; i++) {
        if (!list[i].dying) { first = list[i]; break; }
      }
      if (!first) break;
      first.dying = true;
      first.dieT = first.age;
      alive--;
    }
  }

  function tickPool(list, dt) {
    for (var i = list.length - 1; i >= 0; i--) {
      var it = list[i];
      it.age += dt;
      var o;
      if (it.dying) {
        o = 1 - (it.age - it.dieT) / FADE_OUT;
        if (o <= 0) {
          scene.remove(it.mesh);
          it.mesh.material.dispose();   // клон — только он и нужен
          list.splice(i, 1);
          continue;
        }
      } else {
        o = Math.min(1, it.age / FADE_IN);
      }
      it.mesh.material.opacity = it.baseOpacity * o;
    }
  }

  /* ================= ПУБЛИЧНОЕ ================= */

  /** вызывается один раз при создании мира */
  function init(sc) {
    scene = sc;
    geo = new THREE.PlaneGeometry(0.24, 0.42);
    geo.rotateX(-Math.PI / 2);      // лежит плашмя, носок в -Z
    tex = makePrintTexture();
    matSand = makeMat(0x3a2c18, 0);   // вдавленный мокрый песок (тёмный)
    matSnow = makeMat(0x51647d, 0);   // углубление в снегу (сине-серая тень)
  }

  /** каждый кадр: следы локального игрока.
      controls — FpsController (position/yaw), mv — getMoveState() */
  function trackLocal(controls, mv, dt) {
    if (!scene || !controls || !mv) return;
    var T = window.BrixTerrain;
    if (!T || !T.surfaceAt) return;

    // в прыжке и стоя на месте следов нет
    if (!mv.onGround || !mv.moving) { last = null; return; }

    var px = controls.position.x, pz = controls.position.z;
    var gy = T.meshHeightAt(px, pz);
    // на постройках/в воздухе следов нет: глаза сильно выше земли
    if (controls.position.y - gy > AIR_EYE) { last = null; return; }

    if (!last) { last = { x: px, z: pz, side: 0 }; return; }

    var dx = px - last.x, dz = pz - last.z;
    var dist = Math.sqrt(dx * dx + dz * dz);
    last.x = px; last.z = pz;

    // телепорт/респавн — не рисуем «шлейф»
    if (dist > 4) { return; }

    var stepLen = mv.sprint ? STEP_RUN : STEP_WALK;
    if (dist < stepLen) return;

    var sType = T.surfaceAt(px, pz);
    if (sType === 0) return;    // трава/земля/камень — след не нужен

    last.side ^= 1;
    spawn(pool, px, pz, dx / dist, dz / dist, sType, last.side);
    // ✅ больше 50 своих следов — первые ИСЧЕЗАЮТ
    evict(pool, MAX_LOCAL);
  }

  /** каждый кадр: следы чужого игрока (после его update) */
  function trackRemote(id, rp) {
    if (!scene || !rp || rp.dead) return;
    var T = window.BrixTerrain;
    if (!T || !T.surfaceAt || !rp.cur) return;

    var cx = rp.cur.x, cz = rp.cur.z;
    var st = rlast[id];
    if (!st) { rlast[id] = { x: cx, z: cz, side: 0 }; return; }

    var dx = cx - st.x, dz = cz - st.z;
    var dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.9) return;
    st.x = cx; st.z = cz;
    if (dist > 4) return;

    var gy = T.meshHeightAt(cx, cz);
    if (rp.cur.y - gy > AIR_EYE) return;   // на постройке
    var sType = T.surfaceAt(cx, cz);
    if (sType === 0) return;

    st.side ^= 1;
    spawn(rpool, cx, cz, dx / dist, dz / dist, sType, st.side);
    evict(rpool, MAX_REMOTE);
  }

  /** каждый кадр: рождение/таяние всех следов */
  function tick(dt) {
    if (!scene) return;
    tickPool(pool, dt);
    tickPool(rpool, dt);
  }

  /** при выходе из мира */
  function dispose() {
    if (!scene) return;
    var i;
    for (i = 0; i < pool.length; i++) {
      scene.remove(pool[i].mesh);
      pool[i].mesh.material.dispose();
    }
    for (i = 0; i < rpool.length; i++) {
      scene.remove(rpool[i].mesh);
      rpool[i].mesh.material.dispose();
    }
    pool = []; rpool = []; rlast = {}; last = null;
    if (geo) geo.dispose();
    if (tex) tex.dispose();
    if (matSand) matSand.dispose();
    if (matSnow) matSnow.dispose();
    geo = null; tex = null; matSand = null; matSnow = null;
    scene = null;
  }

  return {
    init: init,
    trackLocal: trackLocal,
    trackRemote: trackRemote,
    tick: tick,
    dispose: dispose,
    /** ✅ отладка (F12): сколько следов живо в пулах */
    stats: function () {
      function alive(list) {
        var n = 0;
        for (var i = 0; i < list.length; i++) if (!list[i].dying) n++;
        return n;
      }
      return { local: alive(pool), localShown: pool.length, remote: alive(rpool) };
    }
  };
})();
