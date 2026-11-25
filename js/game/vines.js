// ============================================================
//  brix • js/game/vines.js — ТЫКВЕННЫЕ ЛОЗЫ (v0.5.21)
//  🎃 Растительность: лоза (assets/models/pumpkin_vine.glb), на ней
//  растёт тыква (assets/models/pumpkin.glb). Сорвал (F рядом) — тыква
//  в инвентарь, через 8 МИНУТ на лозе вырастает новая.
//
//  СИНХРОНИЗАЦИЯ — КАК У АИРДРОПА/БОЧЕК: тикает НА СЕРВЕРЕ
//  (brix-vines.js): сорвал → сервер проверил → ВСЕМ 'vineUpd'
//  (у всех тыква исчезла), выросла → 'vineUpd'. Всё состояние
//  приезжает в welcome.vines. Сейв — world-objs.json (v8, vines).
//
//  РАЗМЕЩЕНИЕ ДЕТЕРМИНИРОВАННОЕ: формула 1:1 у сервера и клиента
//  (как heightAt/noise). МЕНЯТЬ ТОЛЬКО В ОБОИХ ФАЙЛАХ СРАЗУ —
//  индекс лозы должен совпадать с индексом состояния сервера!
//  Коллайдера нет — мягкая растительность, проходима насквозь.
//  Соло/вкладки (без сервера): локальный тик роста, старт — все
//  с тыквами; на ПВП-арене лоз нет (как деревьев).
// ============================================================
window.BrixVines = (function () {
  'use strict';

  /* --- КОНСТАНТЫ — 1:1 С brix-vines.js (сервер). НЕ РАЗЪЕЗЖАТЬ! --- */
  var VINE_SEED = 97531;
  var VINE_CELL = 16;
  var VINE_HALF = 28;
  var GROW_MS = 8 * 60 * 1000;      // тыква вырастает за 8 минут (как у сервера)

  var scene = null;
  var spots = [];                   // [{x, z, y, r}] — детерминированный список
  var st = [];                      // [{g, t}] — состояние (сервер/локальное)
  var entries = [];                 // [{grp, pmp}] — meshes по индексу лозы
  var vineProto = null, pumpkinProto = null;
  var pendingState = null;          // welcome приехал ДО сборки мира
  var pendingTake = {};             // i -> 1 — ждём подтверждения (откат при deny)
  var built = false;

  function N() { return window.BrixNoise; }
  function T() { return window.BrixTerrain; }
  function mode() { return (window.BrixNet && BrixNet.mode) || 'off'; }
  function invInst() { return (window.BrixInventory && BrixInventory.get()) || null; }

  /* --- РАЗМЕЩЕНИЕ — ФОРМУЛА 1:1 С brix-vines.js. НЕ РАЗЪЕЗЖАТЬ! --- */
  function computeSpots() {
    var H = T().heightAt, fbm = N().fbm, hash2 = N().hash2;
    var out = [];
    for (var ix = -VINE_HALF; ix <= VINE_HALF; ix++) {
      for (var iz = -VINE_HALF; iz <= VINE_HALF; iz++) {
        if (hash2(ix, iz, VINE_SEED) >= 0.14) continue;   // плотность — как у сервера (~61 лоза)
        var x = ix * VINE_CELL + (hash2(ix, iz, VINE_SEED + 1) - 0.5) * VINE_CELL * 0.8;
        var z = iz * VINE_CELL + (hash2(ix, iz, VINE_SEED + 2) - 0.5) * VINE_CELL * 0.8;
        var h = H(x, z);
        if (h < 3 || h > 38) continue;
        var sl = Math.max(
          Math.abs(H(x + 2, z) - H(x - 2, z)),
          Math.abs(H(x, z + 2) - H(x, z - 2))) / 4;
        if (sl > 0.28) continue;
        var forest = fbm(x * 0.008 + 50, z * 0.008 + 80, 909, 3);
        if (forest > 0.62) continue;
        out.push({
          x: Math.round(x * 100) / 100,
          z: Math.round(z * 100) / 100,
          y: Math.round(h * 100) / 100,
          r: hash2(ix, iz, VINE_SEED + 3) * Math.PI * 2
        });
      }
    }
    return out;
  }

  /* ============================ СБОРКА МИРА ============================ */
  /** зовёт world.js после рельефа (treeModel/ores уже построены) */
  function build(scn) {
    if (window.BRIX_PVP) return;             // на арене лоз нет (как деревьев)
    scene = scn || scene;
    if (!scene || !window.BrixGLB) return;
    spots = computeSpots();
    if (!st.length) {                        // welcome ещё не ехал — все с тыквой
      st = spots.map(function () { return { g: 1, t: 0 }; });
    } else if (pendingState) {               // welcome успел приехать раньше
      applyState(pendingState);
      pendingState = null;
    }
    loadModels();
  }

  /* ✅ v0.5.21a ЗАГЛУШКА ≠ МОДЕЛЬ: если файл не доехал (404 — файла
     нет на сервере, или сеть/туннель 504) — BrixGLB ставит серый куб.
     Раньше мы молча строили лозы из заглушек и всё. Теперь:
     1) заглушка распознаётся и грузим модель ПОВТОРНО каждые 10 с
        (до 12 раз ~ 2 мин) — файл можно положить на сервер БЕЗ
        перезагрузки страницы, лозы пересоберутся сами (remount);
     2) в консоли сразу видно, КАКОЙ путь не отдаётся. */
  var MODEL_RETRY_MS = 10000;
  var MODEL_MAX_RETRY = 12;
  var triedVine = false, triedPumpkin = false;
  var retries = { vine: 0, pumpkin: 0 };

  function isStub(g) {
    return !g || g.name === 'brixGlbPlaceholder';
  }

  function modelUrl(kind) {
    return kind === 'vine'
      ? 'assets/models/pumpkin_vine.glb'
      : 'assets/models/pumpkin.glb';
  }

  function loadModels() {
    if (!scene || !window.BrixGLB || !spots.length) return;
    if (!triedVine) { triedVine = true; loadOne('vine'); }
    if (!triedPumpkin) { triedPumpkin = true; loadOne('pumpkin'); }
  }

  function loadOne(kind) {
    var url = modelUrl(kind);
    BrixGLB.load(url, function (g, size) {
      if (isStub(g)) { scheduleRetry(kind); return; }
      if (kind === 'vine') {
        vineProto = g;
        vineProto.userData.k = 0.8 / Math.max(size.y, 0.01);  // лоза ≈ 0.8 м
        console.log('[BrixVines] модель лозы готова');
      } else {
        pumpkinProto = g;
        pumpkinProto.userData.k = 0.45 / Math.max(size.y, 0.01); // тыква ≈ 0.45 м
        console.log('[BrixVines] модель тыквы готова');
      }
      if (vineProto && pumpkinProto) {
        if (built) remount(); else mountAll();
      }
    });
  }

  function scheduleRetry(kind) {
    var url = modelUrl(kind);
    if (retries[kind] >= MODEL_MAX_RETRY) {
      console.warn('[BrixVines] «' + url + '» не загрузился после ' +
        MODEL_MAX_RETRY + ' попыток — на сервере НЕТ этого файла. ' +
        'Положи его в папку игры точно по пути ' + url +
        ' и обнови страницу (SelfCheck внизу слева тоже покажет, чего не хватает)');
      return;
    }
    retries[kind]++;
    console.warn('[BrixVines] «' + url + '» не доехал — повтор ' +
      retries[kind] + '/' + MODEL_MAX_RETRY + ' через ' +
      (MODEL_RETRY_MS / 1000) + ' с (файл можно положить прямо сейчас — лозы пересоберутся)');
    setTimeout(function () { loadOne(kind); }, MODEL_RETRY_MS);
  }

  /** реальные модели доехали ПОСЛЕ сборки (стояли заглушки) —
     убрать старые группы и расставить лозы заново */
  function remount() {
    if (!built || !scene) return;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i] && entries[i].grp) scene.remove(entries[i].grp);
    }
    entries = [];
    built = false;
    mountAll();
    console.log('[BrixVines] модели доехали — лозы пересобраны с настоящими моделями');
  }

  /** расставить все лозы (после загрузки обеих моделей) */
  function mountAll() {
    if (built || !scene || !vineProto || !pumpkinProto) return;
    built = true;
    var vk = vineProto.userData.k || 2.2;
    var pk = pumpkinProto.userData.k || 1.5;
    for (var i = 0; i < spots.length; i++) {
      var sp = spots[i];
      var grp = vineProto.clone(true);
      grp.position.set(sp.x, sp.y, sp.z);
      grp.rotation.y = sp.r;
      grp.scale.setScalar(vk);
      /* тыква — дитя лозы (прячется/показывается вместе с ней).
         Масштаб ДЕЛИМ на vk: родитель уже растянут — итоговый
         масштаб тыквы должен быть pk, а не pk*vk */
      var pmp = pumpkinProto.clone(true);
      pmp.scale.setScalar(pk / vk);
      /* смещения в ЛОКАЛЬНЫХ единицах (родитель умножит на vk):
         чуть в стороне от центра лозы и на листьях */
      pmp.position.set(
        Math.cos(sp.r) * (0.22 / vk), 0.14 / vk, Math.sin(sp.r) * (0.22 / vk));
      pmp.rotation.y = sp.r * 1.7;
      pmp.visible = !!(st[i] && st[i].g);
      grp.add(pmp);
      scene.add(grp);
      entries.push({ grp: grp, pmp: pmp });
    }
    console.log('[BrixVines] лоз на карте: ' + entries.length +
      ', с тыквой: ' + grownCount());
  }

  function grownCount() {
    var n = 0;
    for (var i = 0; i < st.length; i++) if (st[i] && st[i].g) n++;
    return n;
  }

  /* ============================ СОСТОЯНИЕ ============================ */
  function applyState(arr) {
    if (!Array.isArray(arr)) return;
    st = arr.map(function (s) {
      return { g: s && s.g ? 1 : 0, t: (s && s.t) || 0 };
    });
    for (var i = 0; i < entries.length && i < st.length; i++) {
      setPumpkin(i, st[i].g);
    }
  }

  /** welcome приехал после сборки — применяем сразу */
  function feedState(arr) {
    if (built) applyState(arr);
    else pendingState = arr;
  }

  function setPumpkin(i, grown) {
    var e = entries[i];
    if (e && e.pmp) e.pmp.visible = !!grown;
  }

  /* ============================ ВЗАИМОДЕЙСТВИЕ ============================ */
  /** ближайшая лоза С ТЫКВОЙ в радиусе maxD → индекс или -1 (для клавиши F) */
  function nearest(pos, maxD) {
    var best = (maxD || 4.2) * (maxD || 4.2), found = -1;
    for (var i = 0; i < spots.length && i < st.length; i++) {
      if (!st[i].g) continue;
      var dx = spots[i].x - pos.x, dz = spots[i].z - pos.z;
      var d2 = dx * dx + dz * dz;
      if (d2 < best) { best = d2; found = i; }
    }
    return found;
  }

  /** F у лозы: тыква в инвентарь ОПТИМИСТИЧНО, сервер — авторитет */
  function take(i) {
    if (i < 0 || !st[i] || !st[i].g) return;
    var sp = spots[i];
    if (!sp) return;
    var I = invInst();
    if (I && I.freeSpaceFor && I.freeSpaceFor('pumpkin') <= 0) {
      if (window.BrixHud) BrixHud.toast('Инвентарь полон', 3);
      return;
    }
    if (I) {
      I.addItem('pumpkin', 1);
      if (I.showPickup) I.showPickup('pumpkin', 1);
    }
    pendingTake[i] = 1;
    st[i] = { g: 0, t: Date.now() + GROW_MS };   // локальный тик покажет рост
    setPumpkin(i, 0);
    if (mode() === 'server') {
      BrixNet.send({ t: 'vineTake', i: i });
    } else if (mode() === 'tabs') {
      /* вкладки: другие вкладки синхронятся через relay (без выдачи им предмета) */
      BrixNet.send({ t: 'vineTake', i: i });
    }
    /* соло: чисто локально — выроснет через 8 мин (tick) */
  }

  /** откат отказа сервера: предмет убрали; тыкву показываем ТОЛЬКО
     если сервер подтвердил, что она на лозе (g=1) — при гонке
     «двое сорвали одновременно» у проигравшего призрака не будет */
  function deny(i, serverG) {
    if (!pendingTake[i]) return;
    delete pendingTake[i];
    var I = invInst();
    if (I && I.removeCountByItem) I.removeCountByItem('pumpkin', 1);
    if (st[i]) {
      if (serverG === undefined || serverG === 1) {
        st[i].g = 1;                       // тыква на месте — вернули как было
        st[i].t = 0;
      } else {
        st[i].g = 0;                       // лоза уже пуста — слушаемся сервера
        if (!st[i].t) st[i].t = Date.now() + GROW_MS;
      }
    }
    setPumpkin(i, st[i] ? st[i].g : 0);
    if (window.BrixHud) BrixHud.toast('Сервер отклонил: подойди ближе', 3);
  }

  /* ============================ СЕТЬ ============================ */
  function onNet(msg) {
    if (!msg || !msg.t) return;
    switch (msg.t) {
      case 'vineUpd': {
        var ups = Array.isArray(msg.u) ? msg.u : [];
        for (var k = 0; k < ups.length; k++) {
          var u = ups[k];
          var i = u.i | 0;
          if (!st[i]) continue;
          st[i].g = u.g ? 1 : 0;
          st[i].t = u.g ? 0 : (Number(u.t) || Date.now() + GROW_MS);
          delete pendingTake[i];               // сервер подтвердил — не откатываем
          setPumpkin(i, st[i].g);
        }
        break;
      }
      case 'vineDeny':
        deny(msg.i | 0, msg.g);
        break;
      case 'vineTake': {
        /* режим вкладок: СОРВАЛ ДРУГОЙ — тыква исчезает (без выдачи предмета) */
        if (mode() === 'server') break;        // в сервер-режиме relay не бывает
        var i2 = msg.i | 0;
        if (!st[i2] || !st[i2].g) break;
        st[i2] = { g: 0, t: Date.now() + GROW_MS };
        setPumpkin(i2, 0);
        break;
      }
    }
  }

  /* ============================ ТИК ============================ */
  /** локальный рост по t: работает во всех режимах (в сервер-режиме
     просто не ждём 'vineUpd' от сервера — значение то же) */
  function tick() {
    if (!built) return;
    var now = Date.now();
    for (var i = 0; i < st.length; i++) {
      var s = st[i];
      if (!s.g && s.t && now >= s.t) {
        s.g = 1;
        s.t = 0;
        setPumpkin(i, 1);
      }
    }
  }

  return {
    build: build,
    feedState: feedState,
    tick: tick,
    nearest: nearest,
    take: take,
    onNet: onNet,
    ready: function () { return built; },
    spotsCount: function () { return spots.length; },
    grownCount: grownCount
  };
})();
