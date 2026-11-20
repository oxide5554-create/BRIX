// ============================================================
//  brix • js/main.js
//  Оболочка меню (перенос GameMenu.tsx): 3D-фон, сайдбар,
//  шапка, панели экранов, звук, диалог выхода, окно бета-теста
//  и игровой мир.
// ============================================================
(function () {
  'use strict';

  // маркер сборки: если этой строки нет в консоли — браузер загрузил СТАРЫЕ файлы
  // (нажми Ctrl+Shift+R, чтобы обновить кэш)
  console.log('%cBRIX v0.4.23 — ДИАГНОСТИКА СТАРОГО СЕРВЕРА: при подключении игра проверяет версию server.js и подсказывает, когда сервер нужно ПЕРЕЗАПУСТИТЬ; точные причины «сервер отклонил» (старый server.js / не админ); ХП в серверном режиме — только от сервера; сундук-хранилище 0.4.22, калаш 0.4.21, дробовик 0.4.19', 'color:#e2572b;font-weight:bold');

  var currentLayer = null;

  /* ---------- красная плашка с ошибкой ПРЯМО НА ЭКРАНЕ ----------
     чтобы проблемы были видны без консоли (F12) */
  function showFatal(msg) {
    var el = document.getElementById('brixFatal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'brixFatal';
      el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;' +
        'background:#7f1d1d;color:#fff;font:12px/1.5 Consolas,monospace;padding:10px 14px;' +
        'border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.6);white-space:pre-wrap';
      (document.body || document.documentElement).appendChild(el);
    }
    el.textContent = 'ОШИБКА: ' + msg;
  }
  window.BrixFatal = showFatal;

  window.addEventListener('error', function (e) {
    var where = (e.filename || '').split('/').pop();
    showFatal(e.message + (where ? '  [' + where + ':' + e.lineno + ']' : ''));
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason || {};
    showFatal(r.message || String(r));
  });

  /* ---------- самопроверка файлов прямо в меню ----------
     внизу слева: зелёная «✓ все файлы на месте» или красная — чего именно нет.
     Рядом ссылка «обновить кэш» — жёсткая перезагрузка БЕЗ Ctrl+Shift+R:
     сносит CacheStorage и берёт страницу с новым ?v= (браузер гарантированно
     качает свежие файлы). */
  var selfCheckMsg = '';
  var selfCheckColor = '';

  function versionHtml() {
    var html = BrixState.t('footer.version');
    if (selfCheckMsg) {
      html += ' &nbsp;·&nbsp; <span style="color:' + selfCheckColor + '">' + selfCheckMsg + '</span>';
    }
    html += ' &nbsp; <a href="#" class="brixRefreshLink" style="color:#e8b45a;text-decoration:underline;white-space:nowrap">обновить кэш</a>';
    return html;
  }

  function paintVersion() {
    var el = document.getElementById('sidebarVersion');
    var elM = document.getElementById('mobileVersion');
    var html = versionHtml();
    if (el) el.innerHTML = html;
    if (elM) elM.innerHTML = html;
    Array.prototype.forEach.call(document.querySelectorAll('.brixRefreshLink'), function (a) {
      a.onclick = function (ev) { ev.preventDefault(); forceRefresh(); };
    });
  }

  /** жёсткая перезагрузка с пробивкой кэша (можно звать из консоли: BrixForceRefresh()) */
  function forceRefresh() {
    try {
      if (window.caches && caches.keys) {
        caches.keys().then(function (keys) { keys.forEach(function (k) { caches.delete(k); }); });
      }
    } catch (e) { /* нет CacheStorage — не страшно */ }
    try { sessionStorage.removeItem('brixVjump'); } catch (e) {}
    var search = window.location.search;
    var url = window.location.pathname + search;
    if (/([?&])v=/.test(url)) url = url.replace(/([?&])v=[^&]*/, '$1v=' + Date.now());
    else url += (search ? '&' : '?') + 'v=' + Date.now();
    window.location.replace(url + window.location.hash);
  }
  window.BrixForceRefresh = forceRefresh;

  function runSelfCheck() {
    function paint(msg, color) {
      selfCheckMsg = msg;
      selfCheckColor = color;
      paintVersion();
    }

    // 1) новые скрипты вообще загружены? (если index.html старый — их нет)
    var scriptsOk = !!(window.BrixInventory && window.BrixFirstPerson &&
                       window.BrixGLB && window.BrixSfx && window.BrixBuilding);
    if (!scriptsOk) {
      paint('✗ нет новых скриптов — старый index.html в кэше. Нажми «обновить кэш» справа или Ctrl+Shift+R', '#ff6b5e');
      return;
    }

    // 2) версия three.js (нужна r152+)
    var rev = parseInt(window.THREE && THREE.REVISION, 10) || 0;
    if (rev && rev < 152) {
      paint('✗ старый three.js r' + rev + ' — нужен js/lib/three.min.js из архива', '#ff6b5e');
      return;
    }

    // 3) на месте ли файлы ассетов на сервере
    if (window.location.protocol === 'file:') {
      paint('открыто как файл — модель и звуки встроены, так тоже работает; лучше через START-GAME.bat', '#e8b45a');
      return;
    }
    var files = [
      'assets/fonts/Oswald-400-cyrillic.woff2',
      'assets/icons/stone_axe.png',
      'assets/icons/stone_pickaxe.png',
      'assets/icons/pickaxe.png',
      'assets/icons/iron_axe.png',
      'assets/icons/iron.png',
      'assets/icons/sulfur.png',
      'assets/models/stone_axe.glb',
      'assets/models/player_claude.glb',
      'assets/models/stone_pickaxe.glb',
      'assets/models/pickaxe.glb',
      'assets/models/iron_axe.glb',
      'assets/models/pine_tree.glb',
      'assets/models/ore_iron.glb',
      'assets/models/ore_sulfur.glb',
      'assets/models/stone.glb',
      'assets/models/barrel_rust.glb',
      'assets/models/scrap.glb',
      'assets/models/wooden_crate.glb',
      'assets/models/military_crate.glb',
      'assets/icons/pipe.png',
      'assets/icons/spring.png',
      'assets/icons/rifle_body.png',
      'assets/icons/berdana_body.png',
      'assets/sfx/wood/chop_1.wav',
      'assets/sfx/boch/metal_hit.wav',
      'assets/sfx/boch/barrel_break.ogg',
      'assets/textures/grass.png',
      'assets/sfx/stone/stone_hit_1.wav',
      'assets/sfx/stone/stone_break.ogg',
      /* ✅ v0.4.7: стройка — иконка плана (новая, от пользователя) и 3 звука строительства */
      'assets/icons/building_plan.png',
      'assets/sfx/build/Construction_Wooden_Build_03.wav',
      'assets/sfx/build/Construction_Wooden_Build_04.wav',
      'assets/sfx/build/Construction_Wooden_PickUp_04.wav'
    ];
    var bust = function (u) { return window.BrixAsset ? window.BrixAsset(u) : u; };
    var head = function (u) {
      return fetch(bust(u), { method: 'HEAD' }).then(function (r) { return r.ok; })
        .catch(function () { return false; });
    };
    Promise.all(files.map(function (u) {
      return head(u).then(function (ok) { return ok ? null : u; });
    })).then(function (missing) {
      missing = missing.filter(Boolean);
      if (missing.length) {
        paint('✗ сервер не отдаёт: ' + missing.join(' , ') + ' — в папке игры нет assets/ из архива', '#ff6b5e');
      } else {
        paint('✓ сборка v0.4.7 — все файлы на месте', '#8fd07a');
      }
    });
  }

  /* ---------- отрисовка активного экрана ---------- */
  function renderScreen() {
    var S = BrixState.data;
    var host = document.getElementById('screenHost');

    // убрать предыдущий слой
    if (currentLayer) host.removeChild(currentLayer);

    currentLayer = document.createElement('div');
    currentLayer.className = 'screen-layer';

    switch (S.screen) {
      case 'home':    BrixScreens.renderHome(currentLayer); break;
      case 'servers': BrixScreens.renderServers(currentLayer); break;
      case 'friends': BrixScreens.renderFriends(currentLayer); break;
      case 'news':    BrixScreens.renderNews(currentLayer); break;
      case 'skins':   BrixScreens.renderSkins(currentLayer); break;
      default:        BrixScreens.renderOptions(currentLayer); break;
    }

    host.appendChild(currentLayer);
  }

  /* ---------- перерисовка хрома меню ---------- */
  function renderChrome() {
    BrixTopBar.render();
    BrixSidebar.render(document.getElementById('mainNav'));
    paintVersion();
    renderSocialRail();
  }

  function renderSocialRail() {
    var rail = document.getElementById('socialRail');
    var links = [
      { icon: 'globe', title: 'Website' },
      { icon: 'messagecircle', title: 'Discord' },
      { icon: 'youtube', title: 'YouTube' },
      { icon: 'twitter', title: 'X' },
      { icon: 'instagram', title: 'Instagram' },
      { icon: 'twitch', title: 'Twitch' }
    ];
    rail.innerHTML = '';
    links.forEach(function (l) {
      var b = document.createElement('button');
      b.title = l.title;
      b.setAttribute('aria-label', l.title);
      b.innerHTML = BrixIcon(l.icon, 16);
      b.onmouseenter = function () { menuAudio.hover(); };
      b.onclick = function () { menuAudio.click(); };
      rail.appendChild(b);
    });
  }

  /* ---------- диалог выхода + прощание ---------- */
  function renderQuit() {
    var S = BrixState.data;
    var host = document.getElementById('quitRoot');
    host.innerHTML = '';

    if (S.quitOpen) {
      BrixModals.confirmDialog({
        title: BrixState.t('quit.title'),
        body: BrixState.t('quit.body'),
        confirmText: BrixState.t('quit.confirm'),
        cancelText: BrixState.t('quit.cancel'),
        onConfirm: function () { BrixState.setQuitDone(true); },
        onCancel: function () { BrixState.setQuitOpen(false); }
      });
    }

    if (S.quitDone) {
      var el = document.createElement('div');
      el.className = 'quit-done';
      el.innerHTML =
        '<div class="inner">' +
          '<p>' + BrixState.t('quit.farewell') + '</p>' +
          '<button class="btn-rust">' + BrixState.t('quit.return') + '</button>' +
        '</div>';
      el.querySelector('button').onmouseenter = function () { menuAudio.hover(); };
      el.querySelector('button').onclick = function () {
        menuAudio.click();
        BrixState.setQuitDone(false);
      };
      host.appendChild(el);
    }
  }

  /* ---------- окно бета-теста при каждом открытии игры ---------- */
  function showBetaOnce() {
    BrixModals.betaWelcome(function () {
      // ✅ v0.3.4: первый вход на устройстве — сразу «Укажите свой ник».
      // Ник сохраняется; аккаунт один на устройство (все вкладки — он же)
      if (!BrixState.data.nickSet) {
        BrixModals.nickModal(null, true);
      }
    });
  }

  /* ---------- игровой слой (мир + HUD + пауза) ---------- */
  function showGameLayer() {
    document.getElementById('gameLayer').classList.remove('hidden');
    document.getElementById('menuChrome').classList.add('hidden');
    document.getElementById('pauseOverlay').classList.remove('hidden');
    try {
      BrixGameWorld.start(document.getElementById('gameMount'));
    } catch (err) {
      // вместо чёрного экрана — понятная ошибка на экране
      showFatal('не удалось запустить мир: ' + (err && err.message ? err.message : err));
      document.getElementById('menuChrome').classList.remove('hidden');
      document.getElementById('gameLayer').classList.add('hidden');
      document.getElementById('pauseOverlay').classList.add('hidden');
      BrixGame.disconnect();
    }
  }

  function hideGameLayer() {
    BrixGameWorld.stop();
    document.getElementById('gameLayer').classList.add('hidden');
    document.getElementById('menuChrome').classList.remove('hidden');
    document.getElementById('pauseOverlay').classList.add('hidden');
  }

  /* ✅ fix 0.4.5a: захват мыши с АВТО-ПОВТОРОМ. После выхода из pointer
     lock по Esc браузер ~1.25 с отвечает SecurityError «Pointer lock
     cannot be acquired immediately after the user has exited the lock» —
     раньше это падало необработанной ошибкой «Uncaught (in promise)»
     в консоль, а кнопка ПРОДОЛЖИТЬ не срабатывала с первого раза. */
  function requestLockWithRetry(canvas, tries) {
    if (!canvas || document.pointerLockElement === canvas) return;
    tries = tries || 0;
    try {
      var p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(function () {
        if (tries < 6) setTimeout(function () { requestLockWithRetry(canvas, tries + 1); }, 300);
      });
    } catch (e) {
      if (tries < 6) setTimeout(function () { requestLockWithRetry(canvas, tries + 1); }, 300);
    }
  }

  function bindPauseButtons() {
    document.getElementById('btnResume').onmouseenter = function () { menuAudio.hover(); };
    document.getElementById('btnResume').onclick = function () {
      menuAudio.click();
      requestLockWithRetry(document.querySelector('#gameMount canvas'));
    };
    document.getElementById('btnDisconnect').onmouseenter = function () { menuAudio.hover(); };
    document.getElementById('btnDisconnect').onclick = function () {
      menuAudio.back();
      BrixGame.disconnect();
    };
  }

  function renderHudServer() {
    var srv = BrixData.ADMIN_SERVER;
    var t = function (k) { return BrixState.t(k); };
    document.getElementById('hudServerName').textContent = srv.name;
    document.getElementById('hudServerInfo').textContent =
      t('hud.server') + ': ' + srv.map + ' · ' + srv.ping + ' ms · ' + srv.players + '/' + srv.max;
    document.getElementById('hudHint').textContent = t('hud.hint');
    document.getElementById('hudFpsCap').textContent = t('hud.fps') + ': ';
    document.getElementById('hudPosCap').textContent = t('hud.pos') + ': ';
    /* ✅ v0.4.51: подпись игровых часов (HH:MM · фаза · погода) */
    var timeCap = document.getElementById('hudTimeCap');
    if (timeCap) timeCap.textContent = t('hud.time') + ': ';
    document.getElementById('pauseTitle').textContent = t('pause.title');
    document.getElementById('pauseHint').textContent = t('pause.lockHint');
    document.getElementById('btnResume').textContent = t('pause.resume');    document.getElementById('btnDisconnect').textContent = t('pause.disconnect');
  }

  /* ---------- старт ---------- */
  window.addEventListener('DOMContentLoaded', function () {
    // сохранения из localStorage
    BrixState.hydrate();

    // звук по первому жесту
    var initAudio = function () {
      menuAudio.init();
      if (window.BrixSfx) BrixSfx.init();
    };
    window.addEventListener('pointerdown', initAudio, { once: true });
    window.addEventListener('keydown', initAudio, { once: true });

    // громкости и вкл/выкл звука
    menuAudio.setEnabled(BrixState.data.settings.sound);
    menuAudio.setVolumes(BrixState.data.settings.musicVol, BrixState.data.settings.sfxVol);

    // сплэш-экран уже скрыт (гидрация синхронная)
    document.getElementById('splash').classList.add('hidden');

    // 3D-фон меню
    BrixBackground.mount(document.getElementById('bgScene'));

    // интерфейс меню
    renderChrome();
    renderScreen();
    renderQuit();
    bindPauseButtons();
    renderHudServer();
    BrixLoading.init();
    /* ✅ v0.4.1: ЖИВОЙ онлайн в карточке сервера (пауза/HUD).
       Раньше стояли статичные данные ADMIN_SERVER (players: 0) —
       игрок видел «0/64» даже когда на сервере были люди. Теперь
       каждые 3 с берём реальный опрос /status из BrixFriends */
    setInterval(function () {
      var el = document.getElementById('hudServerInfo');
      if (!el) return;
      var info = window.BrixFriends ? BrixFriends.serverInfo() : { ok: false };
      var srv = BrixData.ADMIN_SERVER;
      var t = function (k) { return BrixState.t(k); };
      if (info.ok) {
        el.textContent = t('hud.server') + ': ' + srv.map + ' · НА СЕРВЕРЕ: ' +
          info.players + '/' + (info.max || 64) +
          (info.inGame !== undefined ? ' · В ИГРЕ: ' + info.inGame : '');
      }
    }, 3000);
    // ✅ v0.3.3: соцсеть — присутствие, заявки в друзья, онлайн сервера
    if (window.BrixFriends) BrixFriends.init();

    // окно бета-теста при каждом открытии игры
    showBetaOnce();

    // самопроверка файлов (результат — внизу слева в меню)
    runSelfCheck();

    /* ---------- подписки на изменения ---------- */
    var lastScreen = BrixState.data.screen;

    BrixState.on(function (data) {
      // экран переключили — перерисовать панель
      if (data.screen !== lastScreen) {
        lastScreen = data.screen;
        // анимация выхода (x:60 → 0 как в оригинале, но в обратную сторону)
        if (currentLayer) {
          var layer = currentLayer;
          layer.classList.add('exiting');
          setTimeout(function () {
            if (layer === currentLayer) renderScreen();
            else renderScreen();
          }, 150);
        } else {
          renderScreen();
        }
      }
      renderChrome();
      renderQuit();
      menuAudio.setEnabled(data.settings.sound);
      menuAudio.setVolumes(data.settings.musicVol, data.settings.sfxVol);
      if (window.BrixSfx) BrixSfx.setEnabled(data.settings.sound);
      BrixBackground.applyQuality();
    });

    BrixGame.on(function (g) {
      if (g.phase !== 'idle') {
        // мир вместо меню
        if (document.getElementById('gameLayer').classList.contains('hidden')) {
          showGameLayer();
        }
        document.getElementById('gameHud').classList.toggle('hidden', g.phase !== 'playing');
        // пауза видна, пока мышь не захвачена (как в оригинале)
        document.getElementById('pauseOverlay').classList.toggle('hidden', g.phase !== 'playing');
      } else {
        hideGameLayer();
      }
    });
  });
})();
