// ============================================================
//  brix • js/ui/loading.js
//  Экран реальной загрузки мира: этапы и прогресс приходят
//  из процесса сборки мира (gameworld.js), советы вращаются.
//  Полный перенос из LoadingScreen.tsx.
// ============================================================
window.BrixLoading = (function () {
  'use strict';

  /* ✅ v0.5.11: подсказки — только то, что есть в игре (i18n:
     load.tip1…tip10 — управление/строительство/стрельба/инвентарь);
     смена каждые 2-5 c (случайный интервал, как просили) */
  var TIPS = ['load.tip1', 'load.tip2', 'load.tip3', 'load.tip4', 'load.tip5',
    'load.tip6', 'load.tip7', 'load.tip8', 'load.tip9', 'load.tip10'];
  var tipIdx = Math.floor(Math.random() * TIPS.length);
  var tipTimer = null;

  function scheduleTip() {
    if (tipTimer) clearTimeout(tipTimer);
    /* 2000-5000 мс, равномерно */
    tipTimer = setTimeout(function () {
      tipIdx = (tipIdx + 1) % TIPS.length;
      drawTip();
      scheduleTip();
    }, 2000 + Math.floor(Math.random() * 3001));
  }

  /* ✅ v0.5.23: строка «НОВАЯ КАРТА №…» — заполняет gameworld.js */
  function setMapInfo(txt) {
    var el = document.getElementById('loadingMap');
    if (!el) return;
    if (txt) { el.textContent = txt; el.style.display = ''; }
    else { el.textContent = ''; el.style.display = 'none'; }
  }

  function show() {
    var el = document.getElementById('loadingScreen');
    el.classList.remove('hidden');
    setMapInfo('');

    el.querySelector('#loadingTitle').textContent = BrixState.t('load.title');
    el.querySelector('[data-server]').textContent = BrixData.ADMIN_SERVER.name;
    drawStage(BrixGame.state);

    /* ✅ v0.5.11: советы вращаются каждые 2-5 c (случайный интервал).
       show() вызывается на КАЖДЫЙ emit прогресса (по 10-20 раз в
       секунду во время сборки) — таймер смены перезапускать нельзя,
       иначе совет никогда не сменится: стартуем ротацию только если
       она ещё не идёт */
    if (!tipTimer) { drawTip(); scheduleTip(); }
  }

  function hide() {
    if (tipTimer) { clearTimeout(tipTimer); tipTimer = null; }
    document.getElementById('loadingScreen').classList.add('hidden');
  }

  function drawTip() {
    var el = document.getElementById('loadingTip');
    el.textContent = BrixState.t(TIPS[tipIdx]);
    el.classList.remove('swap');
    void el.offsetWidth; // перезапуск анимации
    el.classList.add('swap');
  }

  function drawStage(g) {
    /* ✅ v0.5.11: пока идёт предзагрузка иконок, этап и прогресс
       рисует preload.js — не перетираем («Загрузка ресурсов… X%») */
    if (window.BrixPreload && BrixPreload.uiActive) return;
    document.getElementById('loadingStage').textContent = g.stage ? BrixState.t(g.stage) : '';
    var pct = Math.floor(g.progress);
    document.getElementById('loadingFill').style.width = pct + '%';
    document.getElementById('loadingPct').textContent = pct + '%';
  }

  /** подписка на состояние игры */
  function init() {
    BrixGame.on(function (g) {
      if (g.phase === 'loading') show();
      else hide();
      if (g.phase === 'loading') drawStage(g);
    });
  }

  return { init: init, setMapInfo: setMapInfo };
})();
