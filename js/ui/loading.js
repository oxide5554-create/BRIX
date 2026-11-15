// ============================================================
//  brix • js/ui/loading.js
//  Экран реальной загрузки мира: этапы и прогресс приходят
//  из процесса сборки мира (gameworld.js), советы вращаются.
//  Полный перенос из LoadingScreen.tsx.
// ============================================================
window.BrixLoading = (function () {
  'use strict';

  var TIPS = ['load.tip1', 'load.tip2', 'load.tip3', 'load.tip4', 'load.tip5'];
  var tipIdx = Math.floor(Math.random() * TIPS.length);
  var tipTimer = null;

  function show() {
    var el = document.getElementById('loadingScreen');
    el.classList.remove('hidden');

    el.querySelector('#loadingTitle').textContent = BrixState.t('load.title');
    el.querySelector('[data-server]').textContent = BrixData.ADMIN_SERVER.name;
    drawStage(BrixGame.state);

    // советы вращаются каждые 2.6 c
    if (tipTimer) clearInterval(tipTimer);
    drawTip();
    tipTimer = setInterval(function () {
      tipIdx = (tipIdx + 1) % TIPS.length;
      drawTip();
    }, 2600);
  }

  function hide() {
    if (tipTimer) { clearInterval(tipTimer); tipTimer = null; }
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

  return { init: init };
})();
