/* ============================================================
   brix • js/core/preload.js — ПРЕДЗАГРУЗКА ИКОНОК (v0.5.11)

   Иконки (инвентарь/оружия/скины) — это <img src="…">, браузер
   качает их ЛЕНИВО в момент первого рендера UI, то есть УЖЕ В
   ИГРЕ. Через Dev Tunnels одновременный вал десятков картинок +
   WS-пакеты «захлёбывал» туннель. Теперь:

   · start() — собирает адреса из BrixItems и BrixWeaponSkins и
     грузит их через BrixFetch.image (retry 3×/2 c/таймаут 10 c)
     с НЕБОЛЬШОЙ параллельностью (5), а не Promise.all — иначе
     туннель снова захлёбывается, просто на старте;
   · стартует автоматически в меню (main.js, фоновой режим);
   · whenReady() — перед входом в игру: рисует прогресс прямо в
     ЕДИНЫЙ экран загрузки (loadingScreen, этап «Загрузка
     ресурсов… X%») — ОТДЕЛЬНОГО второго экрана больше нет;
   · ТОЛЬКО ПОСЛЕ этого gameworld.js открывает WebSocket — нет
     гонки, туннель цел;
   · не догрузившиеся иконки не блокируют игру навсегда: лимит
     времени (60 c) или null от BrixFetch — и игра стартует,
     картинка появится позже из обычного <img>.
   ============================================================ */
window.BrixPreload = (function () {
  'use strict';

  var CONCURRENCY = 5;      // одновременных загрузок (не Promise.all!)
  var BUDGET_MS = 60000;    // глобальный лимит ожидания в whenReady()

  var urls = [];            // собранные адреса (уникальные)
  var collected = false;
  var started = false;
  var readyPromise = null;
  var prog = { done: 0, total: 0, failed: [] };

  /** собираем адреса всех иконок/скинов из данных игры */
  function collect() {
    if (collected) return urls;
    collected = true;
    var seen = {};
    function add(u) {
      if (!u || typeof u !== 'string') return;
      if (/^(data:|blob:)/.test(u)) return;
      if (seen[u]) return;
      seen[u] = true;
      urls.push(u);
    }
    try {
      /* предметы инвентаря (torch/axe/… — у каждого icon) */
      if (window.BrixItems) {
        Object.keys(window.BrixItems).forEach(function (k) {
          var it = window.BrixItems[k];
          if (it && it.icon) add(it.icon);
        });
      }
      /* скины оружия: icon + текстуры обёртки (wrap/rough/metal) */
      if (window.BrixWeaponSkins && BrixWeaponSkins.list) {
        var REG = BrixWeaponSkins.list();
        Object.keys(REG).forEach(function (id) {
          var s = REG[id];
          if (!s) return;
          ['icon', 'wrap', 'rough', 'metal'].forEach(function (f) { add(s[f]); });
        });
      }
    } catch (e) {}
    return urls;
  }

  /** одна картинка: BrixFetch (retry) или обычный Image */
  function fetchOne(u) {
    if (window.BrixFetch) return BrixFetch.image(u);
    return new Promise(function (ok) {
      var im = new Image();
      im.onload = function () { ok(im); };
      im.onerror = function () { ok(null); };
      im.src = u;
    });
  }

  /**
   * Начать предзагрузку (идемпотентно). onProgress(frac, url) — по мере дела.
   * @returns {Promise} resolves всегда (misses — в .failed)
   */
  function start(onProgress) {
    if (readyPromise) return readyPromise;
    started = true;
    var list = collect();
    prog.total = list.length;
    if (!list.length) { readyPromise = Promise.resolve(true); return readyPromise; }

    readyPromise = new Promise(function (done) {
      var misses = [];
      var i = 0;
      function finish() {
        prog.failed = misses;
        if (misses.length) {
          console.warn('[Preload] не догрузились (' + misses.length + '): ' +
            misses.join(', '));
        } else {
          console.log('[Preload] все ресурсы в кэше: ' + prog.done + ' шт.');
        }
        done(true);
      }
      /* воркеры по CONCURRENCY — туннель получает 5 запросов, а не 60 */
      function worker() {
        if (i >= list.length) return Promise.resolve();
        var u = list[i++];
        return fetchOne(u).then(function (im) {
          prog.done++;
          if (!im) misses.push(u);
          if (onProgress) {
            try { onProgress(prog.done / list.length, u); } catch (e2) {}
          }
          return worker();
        }).catch(function () { return worker(); });
      }
      var ws = [];
      for (var w = 0; w < CONCURRENCY && w < list.length; w++) ws.push(worker());
      Promise.all(ws).then(finish, finish);
    });
    return readyPromise;
  }

  /* ---------- прогресс в ЕДИНОМ экране загрузки (v0.5.11) ----------
     Раньше был свой fullscreen-оверлей «Загрузка ресурсов... X%»
     ПОВЕРХ игрового loadingScreen — игрок видел два экрана подряд.
     Теперь пишем прямо в #loadingStage/#loadingFill/#loadingPct,
     пока идёт предзагрузка (loading.js не перетирает: uiActive). */

  var uiActive = false;
  var uiTimer = null;

  function pct() {
    return prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
  }

  function paintUi() {
    if (!uiActive) return;
    var stage = document.getElementById('loadingStage');
    if (!stage) return;
    var p = pct();
    var label = (window.BrixState ? BrixState.t('load.step.assets') : 'Загрузка ресурсов…');
    stage.textContent = label + ' ' + p + '%';
    var fill = document.getElementById('loadingFill');
    if (fill) fill.style.width = p + '%';
    var pctEl = document.getElementById('loadingPct');
    if (pctEl) pctEl.textContent = p + '%';
  }

  function uiShow() {
    if (uiActive) return;
    uiActive = true;
    paintUi();
    if (uiTimer) clearInterval(uiTimer);
    uiTimer = setInterval(paintUi, 120);
  }

  function uiHide() {
    uiActive = false;
    if (uiTimer) { clearInterval(uiTimer); uiTimer = null; }
  }

  /**
   * Дождаться предзагрузки перед входом в игру. Сам вызывает start();
   * прогресс идёт в экран загрузки (loadingScreen уже виден — фаза
   * «loading»). Ждём до BUDGET_MS, потом игра стартует всё равно.
   */
  function whenReady() {
    start(null);
    uiShow();
    return Promise.race([
      readyPromise,
      new Promise(function (ok) { setTimeout(ok, BUDGET_MS); })
    ]).then(function (r) {
      uiHide();
      return r === true;
    });
  }

  return {
    start: start,
    whenReady: whenReady,
    urls: function () { return collect().slice(); },
    get progress() { return prog.total ? prog.done / prog.total : 1; },
    get total() { return prog.total; },
    get done() { return prog.done; },
    get failed() { return prog.failed.slice(); },
    get started() { return started; },
    /* ✅ v0.5.11: true, пока предзагрузка рисует прогресс в loadingScreen */
    get uiActive() { return uiActive; }
  };
})();
