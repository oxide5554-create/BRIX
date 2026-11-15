// ============================================================
//  brix • js/game/gameworld.js
//  Игровой мир BRIX: настоящий рендер Three.js на весь экран.
//  При подключении мир реально собирается (ландшафт →
//  растительность → вода/небо → шейдеры → спавн), прогресс
//  отдаётся в экран загрузки, затем игрок появляется на
//  острове Brixland. HUD и пауза — здесь же.
//
//  + Хотбар и инвентарь (собственный стиль BRIX)
//  + Руки от 1-го лица ИЗ 3D-МОДЕЛИ ИГРОКА (риг) + 3 инстру:
//    КАМЕННЫЙ ТОПОР (stone_axe.glb) и КАМЕННАЯ КИРКА (stone_pickaxe.glb) —
//    одна правая рука, машут как в v0.2.3/v0.2.4 (atk1/atk2);
//    ЖЕЛЕЗНАЯ КИРКА (pickaxe.glb) — ДВЕ РУКИ на рукояти, ОДИН удар по
//    прямой atkP, добывает ТОЛЬКО камень/серу/железо
//  + ✅ v0.3.0 МУЛЬТИПЛЕЕР: другие игроки (процедурные гладкие персонажи
//    из капсул/сфер/тел вращения — без кубов), синхронизация позиции
//    X/Y/Z, поворота, анимаций (покой/бег/прыжок/удар) и предмета
//    в руках; общий запас деревьев и руд для всех игроков (события
//    ударов + снимок мира новому игроку). Трава не синхронизируется.
//  + Рубка деревьев (pine_tree.glb): ЛКМ — замах, древесина в инвентарь,
//    тряска и падение деревьев, звуки из репозитория.
//  + ✅ ДОБЫЧА КИРКОЙ: рудные жилы железа (silver ore), серы (gold ore)
//    и камня (stone.glb) — модели пользователя, железо/сера/камень в инвентарь.
//  + ✅ v0.2.10 ЭКОНОМИКА: дерево содержит 56–80 древесины (каменный топор
//    +2 за удар, железный +4); жила серы = 20, железа = 40, камня = 60
//    (каменная кирка +2 за удар, железная +4). Железная кирка теперь
//    держится ОДНОЙ рукой точно как топор и машет одним ударом atk1;
//    голова железной кирки и железного топора повёрнута ВПЕРЁД.
// ============================================================

/* ✅ v0.4.0 BrixHud — всплывающие подсказки (toast) поверх игры.
   Показывается при срабатывании страховок: если старый сервер
   не отвечает на удары/открытие ящика, игра делает это локально
   и ОБЯЗАТЕЛЬНО говорит об этом игроку. */
window.BrixHud = (function () {
  var el = null, timer = null;
  function ensure() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'brixToast';
    el.className = 'brix-toast';
    document.body.appendChild(el);
    return el;
  }
  function toast(msg, sec) {
    var e = ensure();
    e.textContent = msg;
    e.classList.add('show');
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { e.classList.remove('show'); }, (sec || 4) * 1000);
  }
  return { toast: toast };
})();

window.BrixGameWorld = (function () {
  'use strict';

  var T = window.BrixTerrain;

  var nextFrame = function () {
    return new Promise(function (r) { requestAnimationFrame(function () { r(); }); });
  };
  var sleep = function (ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  };

  var session = null; // текущий запуск мира

  /* ---------- рубка: тайминги из репозитория ---------- */
  var TOOL_ANIM_DURATION = 0.55; // полная длительность анимации удара (сек)
  var TOOL_HIT_FRAME = 0.18;     // момент hit-frame в анимации (сек)
  var TOOL_RANGE = 3.6;          // дальность удара (м)
  // ✅ v0.2.10 — новая экономика добычи (по просьбе игрока):
  // дерево содержит 56–80 древесины; каменный топор снимает по 2,
  // железный топор по 4 за удар; жила серы = 20 серы, железа = 40,
  // камня = 60; каменная кирка снимает по 2, железная кирка по 4 за удар
  var STONE_AXE_WOOD = 2;   // древесины за удар каменным топором
  var IRON_AXE_WOOD = 4;    // древесины за удар железным топором
  var STONE_PICK_YIELD = 2; // единиц за удар каменной киркой (камень/сера/железо)
  var IRON_PICK_YIELD = 4;  // единиц за удар железной киркой
  var lastSwingKind = 'atk1'; // ✅ v0.3.0: последняя анимация удара (для сети)

  function start(mount) {
    var cancelled = false;

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa8b8c6);
    scene.fog = new THREE.FogExp2(0xc0c4b4, 0.00092);

    var camera = new THREE.PerspectiveCamera(72, mount.clientWidth / mount.clientHeight, 0.05, 2000);
    // камера в графе сцены — иначе дети (рука с топором) не рендерятся
    scene.add(camera);

    var quality = BrixState.data.settings.quality;
    var renderer = new THREE.WebGLRenderer({
      antialias: true, // не мыльная картинка
      powerPreference: 'high-performance'
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'low' ? 1 : quality === 'high' ? 2 : 1.5));
    renderer.shadowMap.enabled = quality !== 'low';
    renderer.shadowMap.type = THREE.PCFShadowMap;
    mount.appendChild(renderer.domElement);

    /* контроллер создаём сразу, спавн — после генерации.
       ✅ v0.3.9: groundAt — высота земли С УЧЁТОМ ровных площадок
       чекблоков: по насыпи можно подняться и ХОДИТЬ по плоской
       вершине (коллайдер ходьбы, как просил игрок) */
    var groundAt = function (x, z) {
      var h = T.heightAt(x, z);
      if (window.BrixProps) {
        var pad = BrixProps.padAt(x, z);
        if (pad) {
          if (pad.d <= 4.4) {
            if (pad.top > h) h = pad.top;                 // плоская вершина
          } else {
            var t = (pad.d - 4.4) / 1.0;                  // 4.4..5.4 — склон
            var target = pad.top + (h - pad.top) * t;     // плавный подъём
            if (target > h) h = target;
          }
        }
      }
      return h;
    };
    var controls = new BrixControls.FpsController(renderer.domElement, groundAt);
    controls.onPointerLockLost = function () { setLocked(false); };

    var onLockChange = function () {
      setLocked(document.pointerLockElement === renderer.domElement);
    };
    document.addEventListener('pointerlockchange', onLockChange);

    var onCanvasClick = function () {
      if (BrixGame.state.phase === 'playing' && !lockedRef &&
          !isInvOpen() && !isLootOpen()) {
        menuAudio.click();
        controls.requestLock();
      }
    };
    renderer.domElement.addEventListener('click', onCanvasClick);

    var worldRefs = [];
    var raf = 0;
    var playTimer = null;
    var disposables = [];
    var lockedRef = false;
    var hud = { fpsFrames: 0, fpsLast: performance.now(), posLast: 0 };

    function isInvOpen() {
      var inv = window.BrixInventory && BrixInventory.get();
      return !!(inv && inv.isOpen);
    }

    /* ✅ v0.3.8: лут-меню ящика открыт — курсор свободен, пауза не нужна */
    function isLootOpen() {
      return !!(window.BrixLootMenu && BrixLootMenu.isOpen());
    }

    function setLocked(v) {
      lockedRef = v;
      updateHudLock(v);
    }

    /* ---------- HUD ---------- */
    var hudEl = document.getElementById('gameHud');
    var fpsEl = document.getElementById('hudFps');
    var posEl = document.getElementById('hudPos');

    function updateHudLock(v) {
      if (BrixGame.state.phase !== 'playing') return;
      var hud = document.getElementById('gameHud');
      var pause = document.getElementById('pauseOverlay');
      hud.classList.toggle('dimmed', !v && !isInvOpen() && !isLootOpen());
      // инвентарь/лут-меню открыты — паузу не показываем (своя панель поверх игры)
      pause.classList.toggle('hidden', v || isInvOpen() || isLootOpen());
    }

    /* ---------- инвентарь, рука с топором, звуки ---------- */
    // защита от неполной установки: если новых скриптов нет —
    // бросаем понятную ошибку (она покажется красной плашкой на экране)
    if (!window.BrixInventory || !window.BrixFirstPerson || !window.BrixSfx || !window.BrixGLB) {
      throw new Error(
        'в папке игры не хватает новых скриптов: js/game/glb.js, js/game/sfx.js, ' +
        'js/game/firstperson.js, js/game/inventory.js — полностью замени папку игры ' +
        'папкой brix/ из архива и обнови страницу через Ctrl+Shift+R'
      );
    }
    var inventory = BrixInventory.init();
    // руки от 1-го лица — порт FirstPersonPlayer из репозитория:
    // риг игрока (player_claude.glb) + топор (axe_claude.glb) в отдельной сцене
    var hands = new BrixFirstPerson(camera, renderer);
    var decor = null;   // деревья/кусты/камни (из buildDecor)
    var terrain = null; // для отсечения ударов через рельеф
    var toolCooldown = 0;

    // выбор в хотбаре → показать/спрятать руки с нужным инструментом
    inventory.onSelect = function (item) {
      var tool = (item && item.tool) || null;
      hands.setWeapon(tool === 'axe' || tool === 'pickaxe' || tool === 'ironPickaxe' ||
        tool === 'ironAxe' ? tool : null);
    };

    // звуки рубки (сэмплы из репозитория) — с пробивкой кэша браузера
    function sfxUrl(u) { return window.BrixAsset ? window.BrixAsset(u) : u; }
    BrixSfx.load('chop1', sfxUrl('assets/sfx/wood/chop_1.wav'));
    BrixSfx.load('chop2', sfxUrl('assets/sfx/wood/chop_2.wav'));
    BrixSfx.load('treeFall', sfxUrl('assets/sfx/wood/tree_falling.ogg'));
    // ✅ звуки ЛОМАНИЯ КАМНЕЙ — взяты из референс-репозитория (папка sounds):
    //    «Stone Hit 01–03.wav» — удары кирки по камню,
    //    «StoneBreak_01.ogg» — жила рассыпается
    // ✅ v0.3.6: звуки бочек из репозитория (oxide5554-create/-glm)
    BrixSfx.load('barrelBreak', sfxUrl('assets/sfx/boch/barrel_break.ogg'));
    BrixSfx.load('metalHit', sfxUrl('assets/sfx/boch/metal_hit.wav'));
    BrixSfx.load('stoneHit1', sfxUrl('assets/sfx/stone/stone_hit_1.wav'));
    BrixSfx.load('stoneHit2', sfxUrl('assets/sfx/stone/stone_hit_2.wav'));
    BrixSfx.load('stoneHit3', sfxUrl('assets/sfx/stone/stone_hit_3.wav'));
    BrixSfx.load('stoneBreak', sfxUrl('assets/sfx/stone/stone_break.ogg'));
    var stoneHits = ['stoneHit1', 'stoneHit2', 'stoneHit3'];

    // стартовое состояние: слот 0 — каменный топор
    var startSel = inventory.slots[0];
    hands.setWeapon(startSel && startSel.item.tool ? startSel.item.tool : 'axe');

    // ✅ v0.3.0: чужие игроки и строка статуса сети (уровень start(),
    // чтобы их видели и отладочный хук, и stop() при выходе)
    var remotes = {};
    var mpEl = null;
    var remoteRoot = null;

    // отладочный доступ для автотестов
    window.__brixDebug = {
      controls: controls,
      inventory: inventory,
      hands: hands,
      camera: camera,
      getDecor: function () { return decor; },
      hitWithTool: hitWithTool,
      remotes: remotes,           // ✅ v0.3.0: чужие игроки (для автотестов)
      scene: scene
    };

    /* ---------- ЛКМ — удар топором ---------- */
    var screenCenter = new THREE.Vector2(0, 0);
    var raycaster = new THREE.Raycaster();
    var swingCounter = 0;

    // ✅ v0.3.6: предзагрузка GLB бочки и скрапа (из репозитория)
    if (window.BrixProps) BrixProps.preload();

    /* ====== v0.3.7: ЧЕКБЛОКИ С ЛОМАЮЩИМИСЯ БОЧКАМИ + ДРОПЫ ======
       Одиночных бочек/ящиков больше нет — всё лутаемое в чекблоках.
       Всё авторитетно у СЕРВЕРА: клиент шлёт заявку (bhit/btake),
       сервер считает HP/дропы и пушит результат всем */
    var hintEl = null;
    function buildObjects(objs) {
      if (!window.BrixProps) return;
      window.__objsBuilt = true;   // сервер прислал свои объекты
      BrixProps.build(objs, {
        scene: scene,
        groundY: window.BrixTerrain ? BrixTerrain.heightAt : function () { return 0; }
      });
    }

    function hitProp(prop, tool) {
      if (!prop || prop.dead) return;
      BrixSfx.play('metalHit', { volume: 0.8, jitter: 0.08 });
      if (prop.kind === 'barrel') {
        if (BrixNet.mode === 'server') {
          BrixNet.sendBhit(prop.id, tool);   // сервер решает: HP/разбит/дропы
          // ✅ v0.4.0 СТРАХОВКА: если сервер МОЛЧИТ 1.2 с (работает старая
          //    версия server.js без 'bhit' или лагает сеть) — применяем
          //    удар локально. Бочки ломаются при ЛЮБОЙ версии сервера
          scheduleLocalHit(prop.id, tool);
        } else {
          // режим вкладок/соло: считаем локально и рассылаем результат
          objLocalDamage(prop.id, tool);
        }
      }
    }

    /* ✅ v0.4.0: отложенный локальный урон, пока сервер не ответил */
    var pendingHits = {};
    function scheduleLocalHit(id, tool) {
      if (pendingHits[id]) clearTimeout(pendingHits[id]);
      pendingHits[id] = setTimeout(function () {
        delete pendingHits[id];
        if (cancelled || BrixGame.state.phase !== 'playing') return;
        objLocalDamage(id, tool);
        BrixHud.toast(BrixState.t('diag.hitFallback'), 6);
      }, 1200);
    }
    function clearPendingHit(id) {
      if (pendingHits[id]) { clearTimeout(pendingHits[id]); delete pendingHits[id]; }
    }

    function objLocalDamage(id, tool) {
      // ✅ v0.3.8 ИСПРАВЛЕНО: раньше здесь вызывался BrixNet.send, которого
      // НЕ БЫЛО в net.js → «Uncaught TypeError: BrixNet.send is not a
      // function» → урон не применялся и БОЧКИ НЕ ЛОМАЛИСЬ (режим вкладок).
      // Теперь: считаем урон локально, применяем СРАЗУ у себя и
      // рассылаем другим вкладкам (в соло send() просто молчит)
      if (!window.__objLocal) window.__objLocal = { hp: {}, _barrelPos: {}, loot: {} };
      var L = window.__objLocal;
      var bp = window.BrixProps ? BrixProps.barrelPos(id) : null;
      if (bp) { L._barrelPos[id] = { x: bp.x, z: bp.z }; }
      L.hp[id] = (L.hp[id] === undefined ? 2 : L.hp[id]) -
        ((tool === 'ironAxe' || tool === 'ironPickaxe') ? 2 : 1);
      var hpMsg = { t: 'bhp', id: id, hp: Math.max(L.hp[id], 0) };
      var brkMsg = null;
      if (L.hp[id] <= 0) {
        var drops = [];
        for (var i = 0; i < 1 + Math.floor(Math.random() * 2); i++) {
          drops.push({ id: 'dl' + Math.random().toString(36).slice(2, 8),
            kind: 'scrap', x: 0, z: 0, amt: 2 + Math.floor(Math.random() * 5) });
        }
        if (Math.random() > 0.5) drops.push({ id: 'dl' + Math.random().toString(36).slice(2, 8),
          kind: 'metal', x: 0, z: 0, amt: 1 + Math.floor(Math.random() * 3) });
        if (Math.random() < 0.4) drops.push({ id: 'dl' + Math.random().toString(36).slice(2, 8),
          kind: 'pipe', x: 0, z: 0, amt: 1 + Math.floor(Math.random() * 2) });
        // позиции вокруг бочки подставит приёмная сторона по своим бочкам
        brkMsg = { t: 'brk', id: id, drops: drops };
      }
      BrixNet.send(hpMsg);
      if (brkMsg) BrixNet.send(brkMsg);
      // ✅ у себя применяем сразу — BroadcastChannel не эхоит своё сообщение,
      // а без этого бьющий не видел ни урона, ни разбития
      BrixProps.applyHp(id, hpMsg.hp);
      if (brkMsg) objApplyBrk(brkMsg);
    }

    function objApplyBrk(msg) {
      if (!window.BrixProps) return;
      BrixProps.breakBarrel(msg.id);
      BrixSfx.play('barrelBreak', { volume: 1 });
      (msg.drops || []).forEach(function (d) {
        // ✅ v0.3.7: сервер присылает АБСОЛЮТНЫЕ координаты дропа;
        // в режиме вкладок координат нет — раскладываем вокруг бочки
        if ((!d.x || !d.z) && window.__objLocal) {
          var src = window.__objLocal._barrelPos && window.__objLocal._barrelPos[msg.id];
          if (src) {
            d.x = +(src.x + (Math.random() - 0.5) * 2.4).toFixed(1);
            d.z = +(src.z + (Math.random() - 0.5) * 2.4).toFixed(1);
          }
        }
        BrixProps.spawnDrop(d);
      });
    }

    /* ✅ v0.3.8: применение подбора дропа (общее для сервера и вкладок) */
    function applyTaken(msg) {
      BrixProps.removeDrop(msg.id);
      if (msg.pid === BrixNet.id) {
        inventory.addItem(msg.item, msg.amt);
        inventory.showPickup(msg.item, msg.amt);
      }
    }

    /* ---------- ✅ v0.3.8: ЛУТ-МЕНЮ ЯЩИКА ---------- */

    function rollLootLocal(mil) {
      // рецепт из репозитория (тот же, что у сервера) — для режима вкладок
      var r = function (min, max) { return min + Math.floor(Math.random() * (max - min + 1)); };
      var loot = { scrap: r(4, 8), metal: 0, spring: 0, pipe: 0, rifleBody: 0, berdanaBody: 0 };
      if (Math.random() < 0.6) loot.metal = r(4, 16);
      if (Math.random() < 0.5) loot.spring = r(1, 3);
      if (Math.random() < 0.5) loot.pipe = r(1, 3);
      if (mil) {
        loot.rifleBody = 1;
        if (Math.random() < 0.25) loot.berdanaBody = 1;
      } else if (Math.random() < 0.35) loot.berdanaBody = 1;
      return loot;
    }

    function openCrateLocal(id) {
      // вкладки/соло: лут живёт в __objLocal.loot, кидаем локально
      var L = window.__objLocal || (window.__objLocal = { hp: {}, _barrelPos: {}, loot: {} });
      if (!L.loot[id]) {
        // если лут пришёл со снимком (BrixProps) — берём его, иначе кидаем
        L.loot[id] = BrixProps.crateLoot(id) || rollLootLocal(0);
      }
      BrixLootMenu.open(id, L.loot[id], 0);
    }

    function takeCrateLocal(id, item, amt) {
      var L = window.__objLocal || (window.__objLocal = { hp: {}, _barrelPos: {}, loot: {} });
      var loot = L.loot[id];
      if (!loot || !loot[item]) return;
      var have = loot[item];
      var take = (amt > 0) ? Math.min(amt, have) : have;   // ✅ v0.4.1: часть стека
      // ✅ v0.4.2: не берём больше, чем влезает в инвентарь
      var fits = inventory.freeSpaceFor(item);
      if (fits <= 0) { if (window.BrixHud) BrixHud.toast('Инвентарь полон'); return; }
      if (take > fits) take = fits;
      loot[item] = have - take;
      var empty = Object.keys(loot).every(function (k) { return !loot[k]; });
      var msg = { t: 'cbloot', id: id, loot: loot, pid: BrixNet.id, item: item, amt: take, gone: empty };
      BrixNet.send(msg);                      // другим вкладкам
      applyCrateLoot(msg);                    // ✅ себе сразу
    }

    /* ✅ v0.4.2: ОПТИМИСТИЧНОЕ ВЗЯТИЕ — предмет появляется в инвентаре
       МГНОВЕННО при клике/драге, а не когда дойдёт ответ сервера.
       Троттлинг фоновой вкладки (таймеры раз в ~2 с) раньше растягивал
       этот путь на секунды — у игрока предмет «исчезал», потом
       «возвращался». Сервер подтверждает через cbloot с tid (ничего не
       задваивается), при отказе шлёт cbdeny — откатываем предмет */
    var pendingTake = {};

    function takeCrateOptimistic(id, item, amt) {
      amt = Math.max(0, amt | 0);
      var fits = inventory.freeSpaceFor(item);
      if (fits <= 0) { if (window.BrixHud) BrixHud.toast('Инвентарь полон'); return; }
      if (amt > fits) amt = fits;
      if (amt <= 0) return;
      var tid = 'T' + Math.random().toString(36).slice(2, 9);
      pendingTake[tid] = { id: id, item: item, amt: amt, ts: performance.now() };
      // мгновенно у себя: лут ящика и инвентарь
      var srv = window.__objLocalSrv = window.__objLocalSrv || {};
      var loot = srv[id] = Object.assign({}, BrixProps.crateLoot(id) || {});
      loot[item] = Math.max(0, (loot[item] || 0) - amt);
      BrixProps.setCrateLoot(id, loot);
      if (BrixLootMenu.openId() === id) BrixLootMenu.update(id, loot);
      inventory.addItem(item, amt);
      inventory.showPickup(item, amt);
      BrixNet.sendCbTake(id, item, amt, tid);
    }

    function denyCrateTake(msg) {
      var p = pendingTake[msg.tid];
      if (!p) return;
      delete pendingTake[msg.tid];
      inventory.removeCountByItem(p.item, p.amt);
      // вернуть предмет в лут ящика у себя (сервер его не списал)
      var srv = window.__objLocalSrv = window.__objLocalSrv || {};
      var loot = srv[p.id] = Object.assign({}, BrixProps.crateLoot(p.id) || {});
      loot[p.item] = (loot[p.item] || 0) + p.amt;
      BrixProps.setCrateLoot(p.id, loot);
      if (BrixLootMenu.openId() === p.id) BrixLootMenu.update(p.id, loot);
      if (window.BrixHud) BrixHud.toast('Сервер не дал взять: подойди ближе / предмет уже взят');
    }

    /* ✅ v0.4.1: положить свой предмет В ЯЩИК (drag&drop).
       Применяем у себя СРАЗУ (лут ящика + вычет из инвентаря),
       затем сообщаем: сервер рассылает cbloot всем, в режиме
       вкладок — BroadcastChannel, в соло просто молчит */
    function putCrateLocal(id, item, amt, fromIndex) {
      amt = Math.max(1, amt || 1);
      var L = window.__objLocal || (window.__objLocal = { hp: {}, _barrelPos: {}, loot: {} });
      var loot = L.loot[id];
      if (!loot) { loot = L.loot[id] = {}; }
      // снимок BrixProps актуален и в серверном режиме (открыт из cbopen)
      var snap = BrixProps.crateLoot(id);
      if (BrixNet.mode === 'server') {
        // серверный режим: ведём локальную копию поверх снимка
        var srv = window.__objLocalSrv = window.__objLocalSrv || {};
        if (!srv[id]) srv[id] = Object.assign({}, snap || {});
        loot = L.loot[id] = srv[id];
      }
      loot[item] = (loot[item] || 0) + amt;
      if (inventory.removeCount(fromIndex, amt) <= 0) return;   // слот уже пуст
      var msg = { t: 'cbloot', id: id, loot: loot, pid: BrixNet.id,
        item: item, amt: amt, gone: false, put: true };
      if (BrixNet.mode === 'server') BrixNet.sendCbPut(id, item, amt);
      else BrixNet.send(msg);
      applyCrateLoot(msg);                    // себе: меню + площадка ящика
    }

    function applyCrateLoot(msg) {
      if (!window.BrixProps) return;
      BrixProps.setCrateLoot(msg.id, msg.loot);
      if (msg.gone) {
        BrixProps.removeCrate(msg.id);
        if (BrixLootMenu.openId() === msg.id) BrixLootMenu.close();
      } else if (BrixLootMenu.openId() === msg.id) {
        BrixLootMenu.update(msg.id, msg.loot);
      }
      if (msg.pid === BrixNet.id) {
        // ✅ v0.4.1: put:true — я САМ положил предмет в ящик и уже вычел
        //    его из инвентаря ДО отправки; назад добавлять нельзя.
        // ✅ v0.4.2: msg.tid — подтверждение МОЕГО оптимистичного взятия
        //    (предмет добавлен мгновенно при клике, тут только сверяем)
        if (!msg.put && !msg.tid) {
          inventory.addItem(msg.item, msg.amt);
          inventory.showPickup(msg.item, msg.amt);
        }
        if (msg.tid) delete pendingTake[msg.tid];
      }
    }

    function tryPickup() {
      if (BrixGame.state.phase !== 'playing' || !window.BrixProps) return;
      // F закрывает меню — но НЕ тем же нажатием, которым открыл
      // (защита 300 мс как в репозитории scr/ui/crateUI.js)
      if (isLootOpen()) {
        if (performance.now() - BrixLootMenu.lastOpenTs() >= 300) BrixLootMenu.close();
        return;
      }
      // ✅ v0.4.2: направление взгляда — F работает ТОЛЬКО когда
      // прицел наведён на ящик/дроп (конус ~10°)
      var fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      var pick = BrixProps.nearestPickup(controls.position, 3, fwd);
      if (!pick) return;
      if (pick.kind === 'drop') {
        if (BrixNet.mode === 'server') {
          BrixNet.sendBtake(pick.id);
        } else {
          // ✅ v0.3.8: раньше здесь падало «BrixNet.send is not a function»
          var msg = { t: 'btaken', id: pick.id, pid: BrixNet.id,
            item: pick.item, amt: pick.amount };
          applyTaken(msg);      // себе сразу
          BrixNet.send(msg);    // и другим вкладкам
        }
      } else {
        if (BrixNet.mode === 'server') {
          // сервер пришлёт cbopen с ТЕКУЩИМ лутом (он хранится у него).
          // ✅ v0.3.9: controls.enabled НЕ трогаем здесь! Раньше
          //    отключали ДО ответа сервера — если ответ не пришёл
          //    (старый сервер, лаг), игрок ЗАМИРАЛ: ни идти, ни бить.
          //    Теперь enabled выставляет сам открытый лут-меню, а
          //    каждый кадр анимации самовосстанавливает его (см. tick)
          BrixNet.sendCbOpen(pick.id);
          // ✅ v0.4.0 СТРАХОВКА: если сервер молчит 1.5 с (старая версия
          //    server.js не знает 'cbopen') — открываем ящик локально из
          //    снимка мира. Ящик работает при ЛЮБОЙ версии сервера
          (function (cbId) {
            setTimeout(function () {
              if (cancelled || BrixGame.state.phase !== 'playing') return;
              if (!BrixLootMenu.isOpen() && BrixLootMenu.openId() !== cbId) {
                openCrateLocal(cbId);
                BrixHud.toast(BrixState.t('diag.openFallback'), 6);
              }
            }, 1500);
          })(pick.id);
        } else {
          openCrateLocal(pick.id);
        }
      }
    }

    document.addEventListener('keydown', function (e) {
      if (e.code === 'KeyF') tryPickup();
    });

    /* ✅ v0.3.8: лут-меню — клик по предмету = заявка серверу */
    if (window.BrixLootMenu) {
      BrixLootMenu.init({
        take: function (cbId, item, amt) {
          // ✅ v0.4.2: сервер 42+ понимает tid — берём ОПТИМИСТИЧНО
          // (мгновенно); старый сервер — как раньше, по cbloot
          if (BrixNet.mode === 'server' && BrixNet.serverVer >= 42) takeCrateOptimistic(cbId, item, amt || 0);
          else if (BrixNet.mode === 'server') BrixNet.sendCbTake(cbId, item, amt);
          else takeCrateLocal(cbId, item, amt);
        },
        /* ✅ v0.4.1: перетащил свой предмет В ЯЩИК — положить на хранение */
        put: function (cbId, item, amt, fromIndex) {
          putCrateLocal(cbId, item, amt, fromIndex);
        },
        close: function () {
          // ✅ v0.3.9: controls.enabled вернёт сам tick (самовосстановление).
          //    Мышь возвращаем в игру (как в репозитории closeCrateUI —
          //    __requestPointerLock); если браузер откажет, появится
          //    штатная пауза «кликните по экрану» — это не застревание
          var canvas = document.querySelector('#gameMount canvas');
          if (canvas && BrixGame.state.phase === 'playing' && !isInvOpen()) {
            try { var p = canvas.requestPointerLock(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
          }
        }
      });
    }

    if (window.BrixNet) {
      /* ✅ v0.4.0: ответ сервера снимает отложенный локальный урон */
      BrixNet.on('bhp', function (msg) { clearPendingHit(msg.id); BrixProps.applyHp(msg.id, msg.hp); });
      BrixNet.on('brk', function (msg) { clearPendingHit(msg.id); objApplyBrk(msg); });
      BrixNet.on('btaken', applyTaken);
      /* ✅ v0.3.8: лут ящика изменился (кто-то взял предмет) — у всех */
      BrixNet.on('cbloot', applyCrateLoot);
      /* ✅ v0.4.2: сервер отказал в оптимистичном взятии — откат */
      BrixNet.on('cbdeny', denyCrateTake);
      /* ✅ v0.3.8: сервер ответил на открытие ящика текущим лутом */
      BrixNet.on('cbopen', function (msg) {
        BrixLootMenu.open(msg.id, msg.loot, msg.mil ? 1 : 0);
      });
      /* ✅ v0.3.8: пустой ящик вернулся с новым лутом — сразу у всех */
      BrixNet.on('cbrespawn', function (msg) {
        BrixProps.respawnCrate(msg.id, msg.loot);
      });
      /* ✅ v0.3.8: бочка вернулась по таймеру сервера */
      BrixNet.on('brespawn', function (msg) {
        BrixProps.respawnBarrel(msg.id);
      });
      // режим вкладок: заявка удара от другой вкладки
      BrixNet.on('bhitReq', function (msg) {
        if (BrixNet.mode !== 'tabs') return;
        objLocalDamage(msg.id, msg.tool || '');
      });
      // ✅ v0.3.6: счётчик пушит СЕРВЕР — мгновенно для каждого игрока.
      // ✅ v0.4.1: g — сколько из подключённых В ИГРЕ (остальные в меню)
      BrixNet.on('cnt', function (n, g) {
        window.__brixServerCount = n;
        window.__brixServerInGame = (typeof g === 'number') ? g : undefined;
      });
    }

    function findTreeByHit(hitObj, instanceId) {
      if (!decor) return null;
      if (decor.treeMeshes && decor.treeMeshes.indexOf(hitObj) >= 0) {
        return decor.trees[instanceId] || null;
      }
      return null;
    }

    /** ✅ v0.2.9: этот меш дерева — СТВОЛ? (материал «Trank»).
        Рубить можно только ствол: удар по листве не даёт древесины. */
    function isTrunkMesh(hitObj) {
      return !!(decor && decor.trunkMeshes && decor.trunkMeshes.indexOf(hitObj) >= 0);
    }

    function findOreByHit(hitObj, instanceId) {
      if (!decor || !decor.oreTargets) return null;
      for (var i = 0; i < decor.oreTargets.length; i++) {
        if (decor.oreTargets[i].mesh === hitObj) {
          return decor.oreTargets[i].mesh.userData.records[instanceId] || null;
        }
      }
      return null;
    }

    /* ✅ удар топором по дереву. Дерево содержит 56–80 древесины
       (world.js), топор снимает свою норму за удар (каменный 2,
       железный 4); когда дерево «пустое» — оно падает */
    function hitTree(rec, tool) {
      if (!rec || rec.state === 'falling' || rec.state === 'fallen' || rec.state === 'gone') return;
      rec.shakeT = 0.35;
      if (rec.state === 'alive') rec.state = 'shake';
      BrixSfx.play('chop1', { volume: 0.9 });
      var wood = tool === 'ironAxe' ? IRON_AXE_WOOD : STONE_AXE_WOOD;
      // не снять больше, чем в дереве осталось
      if (rec.woodLeft !== undefined && rec.woodLeft < wood) wood = Math.max(rec.woodLeft, 0);
      inventory.addItem('wood', wood);
      inventory.showPickup('wood', wood);
      if (rec.woodLeft !== undefined) rec.woodLeft -= wood;
      var fell = 0;
      if (rec.woodLeft <= 0) {
        rec.state = 'falling';
        rec.fallT = 0;
        rec.fallDir = Math.random() > 0.5 ? 1 : -1;
        fell = 1;
        BrixSfx.play('treeFall', { volume: 1 });
      }
      // ✅ v0.3.2: шлём и ЗАПРОС (сервер решает сам), и ГОТОВЫЙ РЕЗУЛЬТАТ
      // (остаток/«упало»/сторона) — чтобы вкладки без сервера тоже сходились
      BrixNet.sendHit('tree', null, rec.i, wood, rec.woodLeft, fell,
        rec.fallDir || 1);
    }

    /* ✅ удар киркой по рудной жиле: железо / сера / камень.
       В жиле фиксированный запас (сера 20, железо 40, камень 60),
       кирка снимает свою норму за удар (каменная 2, железная 4).
       Звуки — сэмплы «Stone Hit / Stone Break» из референс-репозитория */
    function hitOre(rec, tool) {
      if (!rec || rec.state !== 'alive') return;
      rec.shakeT = 0.3;
      rec.state = 'shake';
      BrixSfx.play(stoneHits[Math.floor(Math.random() * stoneHits.length)],
        { volume: 0.85, jitter: 0.08 });
      var itemId = rec.type === 'iron' ? 'iron'
                 : rec.type === 'sulfur' ? 'sulfur' : 'stone';
      var amount = tool === 'ironPickaxe' ? IRON_PICK_YIELD : STONE_PICK_YIELD;
      // не снять больше, чем осталось в жиле
      if (rec.left !== undefined && rec.left < amount) amount = Math.max(rec.left, 0);
      inventory.addItem(itemId, amount);
      inventory.showPickup(itemId, amount);
      if (rec.left !== undefined) rec.left -= amount;
      var broke = 0;
      if (rec.left <= 0) {
        decor.hideOre(rec);
        broke = 1;
        BrixSfx.play('stoneBreak', { volume: 0.95 });   // жила рассыпалась
      }
      // ✅ v0.3.2: и ЗАПРОС серверу, и готовый результат для вкладок
      BrixNet.sendHit('ore', rec.type, rec.i, amount, rec.left, broke, 1);
    }

    function hitWithTool() {
      if (toolCooldown > 0) return;
      toolCooldown = TOOL_ANIM_DURATION;
      var sel0 = inventory.getSelectedItem();
      var tool0 = sel0 && sel0.tool;
      // ✅ v0.2.10 железная кирка — теперь ТОЖЕ держится одной рукой и машет
      //    одним ударом вперёд (atk1), точно как железный топор;
      //    железный топор — один удар atk1;
      //    каменный топор и каменная кирка — два чередующихся замаха (как раньше)
      var kind;
      if (tool0 === 'ironPickaxe' || tool0 === 'ironAxe') kind = 'atk1';
      else kind = (swingCounter++ % 2 === 0) ? 'atk1' : 'atk2';
      lastSwingKind = kind;   // для мультиплеера: какую анимацию видят другие
      hands.triggerSwing(kind);
      BrixSfx.play('chop2', { volume: 0.35 });

      // hit detection ОТЛОЖЕН до hit-frame анимации (как в репозитории)
      setTimeout(function () {
        if (cancelled || BrixGame.state.phase !== 'playing') return;
        var sel = inventory.getSelectedItem();
        var tool = sel && sel.tool;
        raycaster.setFromCamera(screenCenter, camera);
        raycaster.far = TOOL_RANGE;
        var targets = [];
        // ✅ v0.2.9 топоры (каменный и железный) рубят ТОЛЬКО СТВОЛ:
        // в цели идут стволовые меши дерева (материал «Trank») и земля.
        // Листва в луче не участвует — удар по листве не даёт древесины
        // (луч проходит сквозь неё мимо ствола → нечего рубить).
        if (decor) {
          if ((tool === 'axe' || tool === 'ironAxe') && decor.trunkMeshes && decor.trunkMeshes.length) {
            decor.trunkMeshes.forEach(function (m) { targets.push(m); });
          }
          if ((tool === 'pickaxe' || tool === 'ironPickaxe') && decor.oreTargets) {
            decor.oreTargets.forEach(function (o) { targets.push(o.mesh); });
          }
        }
        if (terrain) targets.push(terrain);
        if (!targets.length) return;
        // ✅ v0.3.6: сначала ПРОПСЫ (бочки/ящики чекблоков) — они ближе.
        // ✅ v0.4.0: бочки ломаются и КУЛАКОМ (без инструмента) — раньше
        //    пустая рука вообще не била по бочкам и игрок думал, что
        //    «бочки не ломаются»
        if (window.BrixProps && (tool === 'axe' || tool === 'ironAxe' ||
            tool === 'pickaxe' || tool === 'ironPickaxe' || !tool)) {
          var propTargets = BrixProps.barrelTargets().concat(BrixProps.crateTargets());
          if (propTargets.length) {
            var propHits = raycaster.intersectObjects(propTargets, true);
            if (propHits.length) {
              // ✅ v0.3.9: НЕВИДИМЫЙ ХИТБОКС ЯЩИКА НЕ ПРЕГРАЖДАЕТ УДАР.
              //    Раньше бралось ПЕРВОЕ попадание: если перед бочкой стоял
              //    хитбокс ящика (1.8 м vs 2.1 м), удар «съедался» об него —
              //    бочки за ящиком казались неломаемыми (жалоба игрока).
              //    Как в репозитории: ящик реагирует только на F, а ЛКМ
              //    ищет первую БОЧКУ вдоль луча
              var barrelProp = null;
              for (var hi = 0; hi < propHits.length; hi++) {
                var pp = BrixProps.findProp(propHits[hi].object);
                if (pp && pp.kind === 'barrel') { barrelProp = pp; break; }
              }
              if (barrelProp) { hitProp(barrelProp, tool); return; }
            }
          }
        }
        var hits = raycaster.intersectObjects(targets, false);
        if (hits.length === 0) return;
        var first = hits[0];
        if (tool === 'pickaxe' || tool === 'ironPickaxe') {
          var ore = findOreByHit(first.object, first.instanceId);
          if (ore) hitOre(ore, tool);
        } else {
          // ✅ v0.2.9: рубим ТОЛЬКО если луч попал в СТВОЛ. Попал в листву
          //    (или в землю перед деревом) — дерево не трясётся, древесины нет.
          if (!isTrunkMesh(first.object)) return;
          var rec = findTreeByHit(first.object, first.instanceId);
          if (rec) hitTree(rec, tool);
        }
      }, TOOL_HIT_FRAME * 1000);
    }

    var onMouseDown = function (e) {
      if (BrixGame.state.phase !== 'playing' || !lockedRef) return;
      if (isInvOpen()) return;
      if (e.button === 0) hitWithTool();
    };
    renderer.domElement.addEventListener('mousedown', onMouseDown);

    /* ---------- создание мира и реальная загрузка ---------- */
    var run = async function () {
      var setStage = function (k, p) {
        if (!cancelled) BrixGame.setStage(k, Math.round(p));
      };
      var yieldStage = function (k, base, span) {
        return function (frac) {
          setStage(k, base + frac * span);
          return nextFrame();
        };
      };

      try {
        /* 1 — подключение (короткая сетевая пауза) */
        setStage('load.step.connect', 3);
        await sleep(500);
        if (cancelled) return;
        setStage('load.step.auth', 8);
        await sleep(400);
        if (cancelled) return;

        /* 2 — ландшафт: настоящая генерация высот и цветов */
        var terrainGeo = await T.buildTerrainGeometry(yieldStage('load.step.terrain', 10, 42));
        if (cancelled) return;

        var terrainMat = new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 1,
          metalness: 0
        });
        terrain = new THREE.Mesh(terrainGeo, terrainMat);
        terrain.receiveShadow = quality !== 'low';
        scene.add(terrain);
        disposables.push(terrainGeo, terrainMat);

        /* 3 — растительность и камни */
        setStage('load.step.flora', 53);
        decor = await BrixWorld.buildDecor(scene, yieldStage('load.step.flora', 53, 30));

        /* ================= МУЛЬТИПЛЕЕР (v0.3.1) =================
           АВТОРИТЕТНЫЙ СЕРВЕР (как в Rust/Oxide):
           - сервер держит ростер игроков и общий мир (запасы);
           - новый игрок получает welcome: СПИСОК ВСЕХ ИГРОКОВ с их
             позициями (видит старых!) + состояние мира;
           - удар по ресурсу: клиент шлёт ЗАПРОС, сервер считает
             остаток и решает «упало/рассыпалось», рассылает всем;
           - игроки: X/Y/Z, высота, поворот, анимация, инструмент
             в руках — 12 раз в секунду;
           - трава НЕ синхронизируется (декорация). */
        remoteRoot = new THREE.Group();      // все чужие игроки
        scene.add(remoteRoot);
        var mpSendT = 0;

        function ensureRemote(id, name) {
          if (!remotes[id]) {
            remotes[id] = new BrixRemotePlayer(name || 'Игрок', null);
            remoteRoot.add(remotes[id].group);
          }
          return remotes[id];
        }

        /** удар ДРУГОГО игрока по ресурсу — применяем у себя
            (предметы не начисляем: они падают в инвентарь бьющего) */
        function applyRemoteHit(msg) {
          if (!decor) return;
          if (msg.k === 'tree') {
            var rec = decor.trees[msg.i];
            if (!rec || rec.state === 'falling' || rec.state === 'fallen' || rec.state === 'gone') return;
            // ✅ v0.3.2: остаток — от сервера/отправителя; если его нет,
            // вычитаем сами (синхронизация количества дерева между вкладками)
            if (msg.l !== undefined && msg.l !== null) rec.woodLeft = msg.l;
            else if (msg.y !== undefined) rec.woodLeft = Math.max(0, (rec.woodLeft || 0) - msg.y);
            var fell = msg.d !== undefined ? msg.d : (rec.woodLeft <= 0 ? 1 : 0);
            if (fell) {
              rec.state = 'falling';
              rec.fallT = 0;
              rec.fallDir = msg.fd || (Math.random() > 0.5 ? 1 : -1);
              if (rec.collider) rec.collider.active = false;
              BrixSfx.play('treeFall', { volume: 0.7 });
            } else {
              rec.shakeT = 0.35;
              if (rec.state === 'alive') rec.state = 'shake';
            }
          } else {
            var arr = decor.ores[msg.ty];
            if (!arr) return;
            var rec2 = arr[msg.i];
            if (!rec2 || rec2.state !== 'alive') return;
            if (msg.l !== undefined && msg.l !== null) rec2.left = msg.l;
            else if (msg.y !== undefined) rec2.left = Math.max(0, (rec2.left || 0) - msg.y);
            var broke = msg.d !== undefined ? msg.d : (rec2.left <= 0 ? 1 : 0);
            if (broke) {
              decor.hideOre(rec2);
              BrixSfx.play('stoneBreak', { volume: 0.7 });
            } else {
              rec2.shakeT = 0.3;
              rec2.state = 'shake';
            }
          }
        }

        /** мета для сервера (первый вошедший задаёт мир): запасы деревьев и руд */
        function buildWorldMeta() {
          return {
            trees: decor.trees.map(function (r) {
              return { w: (r.state === 'alive' || r.state === 'shake') ? r.woodLeft : 0 };
            }),
            ores: {
              iron: decor.ores.iron.map(function (r) { return r.state === 'alive' ? r.left : 0; }),
              sulfur: decor.ores.sulfur.map(function (r) { return r.state === 'alive' ? r.left : 0; }),
              stone: decor.ores.stone.map(function (r) { return r.state === 'alive' ? r.left : 0; })
            }
          };
        }

        /** применить авторитетный снимок мира (welcome сервера) */
        function applyWorldState(worldMsg) {
          if (!decor || !worldMsg || !worldMsg.trees) return;
          decor.trees.forEach(function (rec, idx) {
            var s = worldMsg.trees[idx];
            if (!s) return;
            rec.woodLeft = s.w;
            if (s.g && (rec.state === 'alive' || rec.state === 'shake')) {
              // дерево уже срублено у других: доигрываем падение локально
              rec.state = 'falling';
              rec.fallT = 1.8;
              rec.fallDir = s.fd || 1;
              if (rec.collider) rec.collider.active = false;
            }
          });
          ['iron', 'sulfur', 'stone'].forEach(function (type) {
            var arr2 = worldMsg.ores && worldMsg.ores[type];
            if (!arr2) return;
            decor.ores[type].forEach(function (rec3, idx3) {
              var v = arr2[idx3];
              if (v === undefined) return;
              rec3.left = v;
              if (v <= 0 && rec3.state === 'alive') decor.hideOre(rec3);
            });
          });
        }

        /** снимок мира в формате режима вкладок (без сервера) */
        function buildTabsSnapshot() {
          return {
            tr: decor.trees.map(function (r) {
              return { w: r.woodLeft, f: (r.state !== 'alive' && r.state !== 'shake') ? 1 : 0,
                       g: r.state === 'gone' ? 1 : 0, fd: r.fallDir || 1 };
            }),
            or: {
              iron: decor.ores.iron.map(function (r) { return r.state === 'alive' ? r.left : 0; }),
              sulfur: decor.ores.sulfur.map(function (r) { return r.state === 'alive' ? r.left : 0; }),
              stone: decor.ores.stone.map(function (r) { return r.state === 'alive' ? r.left : 0; })
            }
          };
        }

        /* режим вкладок (без сервера): снимок мира от другой вкладки */
        function applyTabsSnapshot(msg) {
          if (!decor || !msg.tr) return;
          applyWorldState({ trees: msg.tr.map(function (s) { return { w: s.w, g: s.g, fd: s.fd }; }),
            ores: msg.or });
        }

        BrixNet.on('welcome', function (msg) {
          // РОСТЕР: создаём ВСЕХ игроков, которые уже были в мире
          (msg.players || []).forEach(function (p) {
            var rp = ensureRemote(p.id, p.n);
            if (p.s) rp.update(0, { x: p.s.x, y: p.s.y, z: p.s.z, yaw: p.s.yaw, a: p.s.a, tool: p.s.tool, ph: p.s.ph || 0 });
          });
          if (msg.world) applyWorldState(msg.world);
          // ✅ v0.3.6: бочки/чекблоки/дропы (позиции и состояние сервера)
          if (msg.objs) buildObjects(msg.objs);
        });
        if (!window.__brixObjLocalInit) {
          window.__brixObjLocalInit = true;
          // режим вкладок: мир объектов строим ПО ТОЙ ЖЕ ФОРМУЛЕ, что у
          // сервера (server.js buildCheckblockLayout, seed 20261114).
          // ✅ v0.3.7: одиночных бочек/ящиков нет — только чекблоки с
          //    ломающимися бочками. ПОРЯДОК ВЫЗОВОВ rnd() = СИМВОЛ В СИМВОЛ
          //    с серверной копией, иначе раскладка у вкладок разойдётся!
          window.__buildLocalObjects = function () {
            if (!window.BrixProps || window.__objsBuilt) return;   // сервер уже прислал
            var a = 20261114;
            function rnd() {
              a |= 0; a = a + 0x6D2B79F5 | 0;
              var t = Math.imul(a ^ a >>> 15, 1 | a);
              t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
              return ((t ^ t >>> 14) >>> 0) / 4294967296;
            }
            var ITEMS = ['washer', 'fridge', 'tv'];
            var cb = [];
            for (var i = 0; i < 40; i++) {
              var x, z;
              do { x = (rnd() - 0.5) * 680; z = (rnd() - 0.5) * 680; } while (Math.sqrt(x * x + z * z) < 40);
              var rec = { id: 'c' + i,
                x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10,
                rot: Math.round(rnd() * 628) / 100,
                item: ITEMS[Math.floor(rnd() * 3)],
                seed: 1 + Math.floor(rnd() * 1000000),
                mil: rnd() < 0.05 ? 1 : 0,
                taken: false, bar: [] };
              var nb = rnd() < 0.5 ? 2 : 3, a0 = rnd() * Math.PI * 2;
              for (var j = 0; j < nb; j++) {
                var ang = a0 + j * (0.7 + rnd() * 0.4);
                var d = 1.2 + rnd() * 0.8 + j * 0.15;
                rec.bar.push({ id: rec.id + 'b' + j,
                  lx: Math.round(Math.cos(ang) * d * 100) / 100,
                  lz: Math.round(Math.sin(ang) * d * 100) / 100,
                  wy: Math.round(rnd() * 628) / 100,
                  lying: j === 0 ? 1 : 0, hp: 2, brk: false });
              }
              // ✅ v0.3.8: лут ящика для вкладок (на сервере — свой rollLoot)
              rec.gone = false;
              rec.loot = rollLootLocal(rec.mil);
              cb.push(rec);
            }
            buildObjects({ cb: cb, dr: [] });
          };
          // сервер отвечает welcome'ом ~1 с; нет — значит режим вкладок
          setTimeout(function () { window.__buildLocalObjects(); }, 3000);
        }
        BrixNet.on('join', function (id, name) { ensureRemote(id, name); });
        BrixNet.on('leave', function (id) {
          if (remotes[id]) {
            remoteRoot.remove(remotes[id].group);
            delete remotes[id];
          }
        });
        BrixNet.on('state', function (msg) {
          var rp = ensureRemote(msg.id, msg.n);
          rp.update(0, { x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, a: msg.a, tool: msg.tool, ph: msg.ph || 0 });
        });
        BrixNet.on('hit', applyRemoteHit);
        BrixNet.on('worldReq', function (toId) {
          BrixNet.sendWorldTo(toId, buildTabsSnapshot());
        });
        BrixNet.on('world', applyTabsSnapshot);

        // строка статуса сети на HUD
        mpEl = document.createElement('div');
        mpEl.style.cssText = 'position:absolute;left:12px;bottom:34px;z-index:6;' +
          'color:#b9c4d0;font:11px/1.5 Consolas,monospace;text-shadow:0 1px 2px rgba(0,0,0,.8);' +
          'pointer-events:none;white-space:pre';
        (hudEl || mount).appendChild(mpEl);
        BrixNet.setStatusEl(mpEl);

        // ✅ v0.4.0 ДИАГНОСТИКА ВЕРХНЕЙ СТРОКОЙ HUD: версия клиента +
        //    режим сети + «отвечает ли сервер» (ping/pong каждые 12 с).
        //    По одному взгляду на этот угол видно: играет ли браузер
        //    свежими файлами и жив ли server.js — так пользователь
        //    сразу заметит старый кэш или незапущенный/старый сервер
        var diagEl = document.createElement('div');
        diagEl.style.cssText = 'position:absolute;left:12px;top:12px;z-index:6;' +
          'color:#9fb3c8;font:11px/1.5 Consolas,monospace;text-shadow:0 1px 2px rgba(0,0,0,.8);' +
          'pointer-events:none;white-space:pre';
        (hudEl || mount).appendChild(diagEl);
        var serverAlive = null;   // null = ещё не проверяли, true/false = pong
        function renderDiag() {
          var ver = 'BRIX v0.4.2';
          var net = BrixNet.mode === 'server' ? 'СЕТЬ: сервер' : 'СЕТЬ: вкладки';
          var hp;
          if (BrixNet.mode !== 'server') hp = '· сервер не нужен';
          else if (serverAlive === null) hp = '· сервер: проверяю…';
          else if (serverAlive) hp = '· сервер отвечает ✓';
          else hp = '· СЕРВЕР НЕ ОТВЕЧАЕТ ✗ (старая версия? перезапусти из новой папки)';
          // ✅ v0.4.1: два ПОНЯТНЫХ счётчика вместо трёх разных:
          // НА СЕРВЕРЕ — все подключения (включая тех, кто в меню) —
          // с сервера (cnt), В ИГРЕ — считаем локально (мы + кого видим),
          // чтобы число было актуальным сразу, а не после пуша
          var srv = window.__brixServerCount;
          var cnt;
          var ingameLocal = Object.keys(remotes).length + 1;
          if (BrixNet.mode === 'server' && srv !== undefined) {
            cnt = ' · НА СЕРВЕРЕ: ' + srv + ' · В ИГРЕ: ' + ingameLocal;
          } else {
            cnt = ' · В ИГРЕ: ' + ingameLocal;
          }
          diagEl.textContent = ver + ' · ' + net + cnt + (hp ? ' ' + hp : '');
          diagEl.style.color = serverAlive === false ? '#e08a6d' : '#9fb3c8';
        }
        renderDiag();
        setInterval(renderDiag, 2000);
        // ping/pong: сервер отвечает мгновенно; «НЕ ОТВЕЧАЕТ» — только
        // если ответа нет 4 с (не мигает между пингами)
        var awaitingPong = false;
        BrixNet.on('pong', function () {
          awaitingPong = false;
          serverAlive = true;
          renderDiag();
        });
        var pingCycle = function () {
          if (cancelled || BrixNet.mode !== 'server') return;
          awaitingPong = true;
          BrixNet.send({ t: 'ping' });
          setTimeout(function () {
            if (!awaitingPong || cancelled) return;
            awaitingPong = false;
            serverAlive = false;
            renderDiag();
          }, 4000);
        };
        // первый пинг почти сразу, дальше — каждые 12 с
        setTimeout(function () { pingCycle(); }, 1500);
        var pingTimer = setInterval(pingCycle, 12000);

        /* ✅ v0.4.1: ЕДИНЫЙ счётчик — теперь верхняя строка-диагностика
           показывает ВСЁ сразу: «BRIX v0.4.1 · сервер отвечает ✓ ·
           НА СЕРВЕРЕ: 2 · В ИГРЕ: 1». Отдельной жёлтой строки внизу
           больше нет — раньше рядом были «игроков: 1» и «НА СЕРВЕРЕ
           СЕЙЧАС: 2» и было непонятно, что как считать */
        window.__brixCountEl = null;   // бывший элемент нижней строки

        // ✅ v0.3.6: подсказка подбора у прицела
        hintEl = document.createElement('div');
        hintEl.style.cssText = 'position:absolute;left:50%;top:56%;transform:translateX(-50%);' +
          'z-index:6;color:#ffd98a;font:13px/1.4 Consolas,monospace;text-shadow:0 1px 3px rgba(0,0,0,.9);' +
          'pointer-events:none;display:none';
        (hudEl || mount).appendChild(hintEl);
        var hintTimer = setInterval(function () {
          if (cancelled) { clearInterval(hintTimer); return; }
          if (!window.BrixProps) { return; }
          if (BrixGame.state.phase !== 'playing' ||
              (window.BrixLootMenu && BrixLootMenu.isOpen())) {
            hintEl.style.display = 'none'; return;
          }
          var fwdH = new THREE.Vector3();
          camera.getWorldDirection(fwdH);
          var pick = BrixProps.nearestPickup(controls.position, 3, fwdH);
          if (pick) {
            hintEl.style.display = 'block';
            hintEl.textContent = pick.kind === 'cb'
              ? '[F] — ' + BrixState.t('hint.openCrate')
              : '[F] — ' + BrixState.t('hint.pickup', { item: BrixState.t('item.' + pick.item) });
          } else {
            hintEl.style.display = 'none';
          }
        }, 250);

        BrixNet.connect(buildWorldMeta());
        /* ================= /МУЛЬТИПЛЕЕР ================= */
        if (cancelled) return;
        // ✅ v0.2.9: коллайдеры деревьев и рудных жил (стволы и камни
        // больше не проходимы насквозь)
        if (controls.setColliders && decor.colliders) controls.setColliders(decor.colliders);

        /* 4 — вода, небо, свет */
        setStage('load.step.sky', 84);
        await nextFrame();
        var water = BrixWorld.createWater(scene);
        var sky = BrixWorld.createSky(scene);
        var lights = BrixWorld.createLights(scene, quality);
        disposables.push(water, sky, { dispose: function () { scene.remove(lights.sun); scene.remove(lights.sun.target); } });

        /* 5 — компиляция шейдеров (реальная) */
        setStage('load.step.shaders', 91);
        await nextFrame();
        if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
        else renderer.compile(scene, camera);
        if (cancelled) return;

        /* 6 — точка спавна и лагерь */
        setStage('load.step.spawn', 96);
        var spawn = await BrixWorld.findSpawn();
        if (cancelled) return;
        var camp = BrixWorld.buildSpawnCamp(scene, spawn);
        disposables.push(camp);
        setStage('load.step.spawn', 100);
        await nextFrame();
        if (cancelled) return;

        /* спавн игрока: смотрим в сторону дальних гор */
        var look = new THREE.Vector3(-230, 0, -150);
        var dir = look.clone().sub(spawn);
        var yaw = Math.atan2(-dir.x, -dir.z);
        controls.spawnAt(spawn.x, spawn.z, yaw);
        controls.enabled = true;

        /* цикл рендера */
        var clock = new THREE.Clock();
        var loop = function () {
          raf = requestAnimationFrame(loop);
          var dt = clock.getDelta();
          var tt = clock.getElapsedTime();

          // ✅ v0.3.9 САМОВОССТАНОВЛЕНИЕ управления: enabled ВЫВОДИТСЯ
          //    из состояния (лут-меню/инвентарь открыты?), а не хранится.
          //    Раньше enabled=false ставился один раз и если меню не
          //    открывалось (старый сервер не отвечал на cbopen), игрок
          //    ЗАМИРАЛ НАВСЕГДА: «экран замерзает», бочки «не ломаются»,
          //    ящики «не открываются» — один и тот же залипший флаг.
          controls.enabled = !isInvOpen() && !isLootOpen();
          controls.update(camera, dt);
          if (toolCooldown > 0) toolCooldown = Math.max(0, toolCooldown - dt);

          // рука от 1-го лица: ходьба/бег/дыхание/удар
          var mv = controls.getMoveState();
          hands.update(dt, { speed: mv.moving ? (mv.sprint ? 10.5 : 6) : 0, onGround: mv.onGround, sprint: mv.sprint });

          // деревья: тряска и падение
          if (decor) decor.tick(dt);

          /* МУЛЬТИПЛЕЕР: чужие игроки + отправка своего состояния 12 Гц */
          BrixNet.tick(dt, null);
          mpSendT -= dt;
          if (mpSendT <= 0) {
            mpSendT = 1 / 12;
            var mv2 = controls.getMoveState();
            var sel2 = inventory.getSelectedItem();
            // анимация для других: удар (по таймеру анимации рук) / прыжок / бег / покой
            var anim2 = 'idle';
            if (toolCooldown > 0) anim2 = lastSwingKind;
            else if (!mv2.onGround) anim2 = 'jump';
            else if (mv2.moving) anim2 = 'run';
            // фаза удара 0..1 — чтобы чужой игрок махал синхронно
            var ph2 = toolCooldown > 0 ? 1 - toolCooldown / TOOL_ANIM_DURATION : 0;
            BrixNet.sendState({
              x: +controls.position.x.toFixed(2),
              y: +controls.position.y.toFixed(2),
              z: +controls.position.z.toFixed(2),
              yaw: +controls.yaw.toFixed(2),
              a: anim2,
              tool: sel2 && sel2.item && sel2.item.tool ? sel2.item.tool : '',
              ph: +ph2.toFixed(2),
              n: BrixNet.NAME
            });
          }
          if (window.BrixProps) BrixProps.tick(dt);
        for (var rk in remotes) remotes[rk].update(dt, null);

          lights.tick(controls.position);
          sky.tick(camera);
          water.tick(tt);
          camp.tick(tt);

          renderer.render(scene, camera);

          // руки от 1-го лица — поверх мира (отдельная сцена, как в репозитории)
          hands.renderOverlay();

          /* FPS и координаты */
          hud.fpsFrames++;
          var now = performance.now();
          if (now - hud.fpsLast >= 500) {
            if (fpsEl) fpsEl.textContent = Math.round((hud.fpsFrames * 1000) / (now - hud.fpsLast));
            hud.fpsFrames = 0;
            hud.fpsLast = now;
            if (posEl) {
              posEl.textContent = controls.position.x.toFixed(0) + ' · ' +
                controls.position.y.toFixed(0) + ' · ' + controls.position.z.toFixed(0);
            }
          }
        };
        loop();

        /* учёт времени в игре для профиля */
        playTimer = setInterval(function () {
          if (lockedRef) BrixState.addPlaySeconds(1);
        }, 1000);

        worldRefs.push({ dispose: function () { cancelAnimationFrame(raf); } });
        BrixGame.setPlaying();
      } catch (err) {
        console.error('world build failed', err);
        if (window.BrixFatal) {
          BrixFatal('Ошибка загрузки мира: ' + (err && err.message ? err.message : err));
        }
        stop();
        BrixGame.disconnect();
      }
    };

    var onResize = function () {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    session = {
      stop: stop
    };

    function stop() {
      cancelled = true;
      window.removeEventListener('resize', onResize);
      document.removeEventListener('pointerlockchange', onLockChange);
      renderer.domElement.removeEventListener('click', onCanvasClick);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      if (raf) cancelAnimationFrame(raf);
      if (playTimer) clearInterval(playTimer);
      worldRefs.forEach(function (d) { d.dispose(); });
      disposables.forEach(function (d) { d.dispose(); });
      hands.dispose();
      if (window.__brixDebug) delete window.__brixDebug;
      // ✅ v0.3.0: выходим из сети и убираем чужих игроков
      BrixNet.disconnect();
      for (var rk in remotes) delete remotes[rk];
      if (mpEl && mpEl.parentElement) mpEl.parentElement.removeChild(mpEl);
      if (hintEl && hintEl.parentElement) hintEl.parentElement.removeChild(hintEl);
      window.__brixCountEl = null;
      window.__brixServerCount = undefined;
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      session = null;
    }

    void run();

    return session;
  }

  function stop() {
    if (session) session.stop();
  }

  return { start: start, stop: stop };
})();
