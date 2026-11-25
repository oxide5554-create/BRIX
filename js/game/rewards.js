// ============================================================
//  brix • js/game/rewards.js — НАГРАДНАЯ ПОЛКА ЗА УРОВНИ (v0.5.23)
//  ✅ v0.5.23 (просьба игрока «Наградную полку сделать В МЕНЮ, как
//  кнопку, а не в игре»): кнопки в правом нижнем углу игры БОЛЬШЕ НЕТ.
//  Полка живёт в ГЛАВНОМ МЕНЮ — пункт «НАГРАДЫ» в списке слева
//  (js/ui/sidebar.js). Открыл — видишь:
//   · текущий УРОВЕНЬ и линию прогресса: сколько опыта осталось
//     до следующего уровня (дерево 25, камень 30, железо/сера 15 —
//     опыт дают ПОСЛЕ полного ломания, см. gameworld.js);
//   · НАГРАДЫ за каждый уровень — монеты: забирай кнопкой.
//   · в игре при добыче остаётся ТОЛЬКО тост «+25 опыта — дерево».
//  Стиль — наш игровой (Oswald, оранжевый акцент, тёмный металл),
//  никаких «html-подобных» белых блоков.
// ============================================================
window.BrixRewards = (function () {
  'use strict';

  var panel = null;
  var built = false, open = false, menuMode = false;

  function t(k, p) { return window.BrixState ? BrixState.t(k, p) : k; }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var CSS = [
    '#bxrPanel{width:min(420px,94vw);max-height:min(580px,80vh);display:none;flex-direction:column;',
    'background:linear-gradient(165deg,rgba(30,25,18,.97),rgba(18,15,11,.97));',
    'border:1px solid rgba(224,163,60,.4);border-radius:10px;',
    'box-shadow:0 18px 60px rgba(0,0,0,.65);overflow:hidden;',
    'font-family:Oswald,Roboto Condensed,sans-serif;-webkit-user-select:none;user-select:none}',
    '#bxrPanel.bxr-on{display:flex}',
    /* модаль меню: по центру экрана с затемнением */
    '#bxrWrap{position:fixed;inset:0;z-index:150;display:none;place-items:center;',
    'background:rgba(5,7,6,.62);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}',
    '#bxrWrap.bxr-on{display:grid}',
    '#bxrHead{display:flex;align-items:center;justify-content:space-between;',
    'padding:14px 16px 10px;border-bottom:1px solid rgba(224,163,60,.22)}',
    '#bxrHead h3{margin:0;font-family:Oswald,sans-serif;font-weight:600;font-size:16px;',
    'letter-spacing:.1em;color:#f2ead6;text-transform:uppercase}',
    '#bxrClose{background:none;border:1px solid rgba(242,234,214,.3);border-radius:4px;',
    'color:#f2ead6;width:28px;height:28px;cursor:pointer;font-size:14px;line-height:1}',
    '#bxrClose:hover{border-color:#e0a33c;color:#e0a33c}',
    /* прогресс */
    '#bxrProg{padding:12px 16px 14px;border-bottom:1px solid rgba(224,163,60,.16)}',
    '#bxrLvlRow{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px}',
    '#bxrLvl{font-family:Oswald,sans-serif;font-weight:700;font-size:22px;color:#e0a33c;',
    'letter-spacing:.06em}',
    '#bxrNext{font:13px/1.3 Roboto Condensed,sans-serif;color:rgba(242,234,214,.8)}',
    '#bxrBar{height:10px;border-radius:5px;background:rgba(0,0,0,.55);',
    'border:1px solid rgba(242,234,214,.18);overflow:hidden;position:relative}',
    '#bxrBarFill{height:100%;width:0;border-radius:5px;',
    'background:linear-gradient(90deg,#a86a1e,#e0a33c 60%,#ffd97a);',
    'box-shadow:0 0 10px rgba(224,163,60,.55);transition:width .45s cubic-bezier(.2,.8,.2,1)}',
    '#bxrBarTxt{margin-top:6px;font:12px/1.4 Roboto Condensed,sans-serif;',
    'color:rgba(242,234,214,.75);letter-spacing:.02em}',
    /* список наград */
    '#bxrList{overflow-y:auto;padding:8px 12px 14px;flex:1}',
    '#bxrList::-webkit-scrollbar{width:8px}',
    '#bxrList::-webkit-scrollbar-thumb{background:rgba(224,163,60,.4);border-radius:4px}',
    '#bxrList::-webkit-scrollbar-track{background:rgba(0,0,0,.3)}',
    '.bxr-row{display:flex;align-items:center;gap:10px;padding:8px 6px;',
    'border-bottom:1px solid rgba(242,234,214,.08)}',
    '.bxr-row:last-child{border-bottom:none}',
    '.bxr-lvl{font-family:Oswald,sans-serif;font-weight:700;font-size:14px;color:#f2ead6;',
    'width:86px;flex-shrink:0;letter-spacing:.04em}',
    '.bxr-prize{flex:1;display:flex;align-items:center;gap:8px;',
    'font:14px/1.3 Roboto Condensed,sans-serif;color:rgba(242,234,214,.9)}',
    '.bxr-coin{width:20px;height:20px;border-radius:50%;flex-shrink:0;',
    'background:radial-gradient(circle at 35% 30%,#ffd97a,#e0a33c 55%,#a86a1e);',
    'border:2px solid #6d4413;box-shadow:0 1px 4px rgba(0,0,0,.5)}',
    '.bxr-claim{background:linear-gradient(180deg,#e0a33c,#c9852a);border:none;border-radius:4px;',
    'color:#1b1408;font-family:Oswald,sans-serif;font-weight:700;font-size:11px;',
    'letter-spacing:.08em;padding:7px 12px;cursor:pointer;flex-shrink:0}',
    '.bxr-claim:active{filter:brightness(.9)}',
    '.bxr-claim.bxr-done{background:rgba(94,151,71,.25);color:#9fd084;cursor:default;',
    'border:1px solid rgba(94,151,71,.5)}',
    '.bxr-claim.bxr-locked{background:rgba(242,234,214,.1);color:rgba(242,234,214,.45);',
    'cursor:default;border:1px solid rgba(242,234,214,.15)}',
    '.bxr-cap{padding:10px 16px 14px;font:12px/1.4 Roboto Condensed,sans-serif;',
    'color:rgba(242,234,214,.55);border-top:1px solid rgba(224,163,60,.16)}',
    /* тост опыта в игре — маленькая строка в правом нижнем углу */
    '#bxrToast{position:fixed;right:calc(16px + env(safe-area-inset-right));',
    'bottom:calc(16px + env(safe-area-inset-bottom));z-index:63;display:none;',
    'background:rgba(18,20,19,.88);border:1px solid rgba(224,163,60,.5);border-radius:5px;',
    'color:#ffd97a;font:13px/1.4 Roboto Condensed,sans-serif;padding:8px 12px;',
    'box-shadow:0 4px 14px rgba(0,0,0,.5);letter-spacing:.02em;',
    'font-family:Roboto Condensed,Oswald,sans-serif}',
    'body.brix-touch-ui #bxrToast{bottom:calc(120px + env(safe-area-inset-bottom))}'
  ].join('\n');

  function build() {
    if (built) return;
    built = true;
    var st = document.createElement('style');
    st.id = 'bxrStyle';
    st.textContent = CSS;
    document.head.appendChild(st);

    /* подложка + панель (открывается ИЗ МЕНЮ) */
    var wrap = document.createElement('div');
    wrap.id = 'bxrWrap';
    wrap.innerHTML =
      '<div id="bxrPanel">' +
        '<div id="bxrHead">' +
          '<h3>' + esc(t('rw.title')) + '</h3>' +
          '<button id="bxrClose">&#10005;</button>' +
        '</div>' +
        '<div id="bxrProg">' +
          '<div id="bxrLvlRow">' +
            '<span id="bxrLvl"></span>' +
            '<span id="bxrNext"></span>' +
          '</div>' +
          '<div id="bxrBar"><div id="bxrBarFill"></div></div>' +
          '<div id="bxrBarTxt"></div>' +
        '</div>' +
        '<div id="bxrList"></div>' +
        '<div class="bxr-cap">' + esc(t('rw.reward')) + '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    panel = wrap.querySelector('#bxrPanel');
    wrap.querySelector('#bxrClose').onclick = function () { setOpen(false); };
    /* клик мимо панели — закрыть */
    wrap.addEventListener('mousedown', function (e) {
      if (e.target === wrap) setOpen(false);
    });

    /* тост опыта (в игре) */
    var toast = document.createElement('div');
    toast.id = 'bxrToast';
    document.body.appendChild(toast);

    /* сервер — авторитет уровня в мультиплеере: welcome/'xp' */
    if (window.BrixNet) {
      BrixNet.on('xp', function (msg) {
        if (!msg) return;
        if (window.BrixState) {
          BrixState.setLevelSync(msg.lvl, msg.xp);
        }
        if (msg.gained) toastGain(msg.gained, msg.src || '');
      });
      BrixNet.on('welcome', function (msg) {
        if (msg && msg.lvl !== undefined && window.BrixState) {
          BrixState.setLevelSync(msg.lvl, msg.xp || 0);
        }
      });
    }
    console.log('[BrixRewards] полка наград готова (кнопка в меню)');
  }

  /* ---------- тосты опыта ---------- */
  var toastTimer = null;
  function toastGain(n, src) {
    if (!window.BrixState) return;
    var el = document.getElementById('bxrToast');
    if (!el) return;
    el.textContent = t('rw.gain', { n: n, src: src });
    el.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.style.display = 'none'; }, 2600);
  }

  /** показываем «+N опыта — источник» и обновляем цифры (зовёт игра) */
  function gain(n, src) {
    if (!built) build();
    toastGain(n, src);
    /* локальный уровень (соло/вкладки): сервер в мультиплеере шлёт 'xp' */
    var res = window.BrixState ? BrixState.addXp(n) : null;
    if (res && res.lvlUp) {
      try { if (window.BrixHud) BrixHud.toast(t('rw.lvlup', { n: res.level }), 5); } catch (e) {}
    }
    paint();
  }

  /** сколько уровней с НЕзабранной наградой (для бейджа в меню) */
  function unclaimed() {
    var S = window.BrixState ? BrixState.data : null;
    if (!S) return 0;
    var claimed = S.claimedLevels || [];
    var n = 0;
    for (var i = 1; i <= (S.level || 1); i++) if (claimed.indexOf(i) === -1) n++;
    return n;
  }

  /* ---------- отрисовка ---------- */
  function paint() {
    if (!built) return;
    var S = window.BrixState ? BrixState.data : { level: 1, xp: 0 };
    var lvl = S.level || 1, xp = S.xp || 0;
    var max = window.BrixState ? BrixState.MAX_LEVEL : 250;
    var need = window.BrixState ? BrixState.xpNeeded(lvl) : 300 * lvl;
    var isMax = lvl >= max;

    document.getElementById('bxrLvl').textContent = t('rw.level', { n: lvl });
    document.getElementById('bxrNext').textContent = isMax ? t('rw.max') : t('rw.next', { n: lvl + 1 });
    var k = isMax ? 1 : Math.max(0, Math.min(1, xp / need));
    document.getElementById('bxrBarFill').style.width = (k * 100).toFixed(1) + '%';
    /* «250 опыту, до 2 уровня осталось 50» — как просил игрок */
    document.getElementById('bxrBarTxt').textContent = isMax
      ? xp + ' / —'
      : xp + ' / ' + need + '  ·  ' + (need - xp) + ' до ' + (lvl + 1) + ' уровня';

    /* список уровней: от 1 до level+10 (но не меньше 20 строк) */
    var listEl = document.getElementById('bxrList');
    if (!listEl) return;
    var upto = Math.min(max, Math.max(lvl + 10, 20));
    var claimed2 = S.claimedLevels || [];
    var reward = window.BrixState ? BrixState.levelReward(1) : 50;
    var html = '';
    for (var L = 1; L <= upto; L++) {
      var state2, cls;
      if (claimed2.indexOf(L) !== -1) { state2 = t('rw.claimed'); cls = 'bxr-done'; }
      else if (L <= lvl) { state2 = t('rw.claim', { n: reward }); cls = ''; }
      else { state2 = t('rw.locked', { n: L }); cls = 'bxr-locked'; }
      html += '<div class="bxr-row">' +
        '<span class="bxr-lvl">' + esc(t('rw.level', { n: L })) + '</span>' +
        '<span class="bxr-prize"><span class="bxr-coin"></span>' + reward + '</span>' +
        '<button class="bxr-claim ' + cls + '" data-lvl="' + L + '"' +
          (cls ? ' disabled' : '') + '>' + esc(state2) + '</button>' +
        '</div>';
    }
    listEl.innerHTML = html;
    Array.prototype.forEach.call(listEl.querySelectorAll('.bxr-claim:not(.bxr-done):not(.bxr-locked)'), function (b) {
      b.onclick = function () {
        var L2 = b.getAttribute('data-lvl') | 0;
        if (window.BrixState && BrixState.claimLevelReward(L2)) {
          try { menuAudio.buy(); } catch (e0) {}
          try { if (window.BrixHud) BrixHud.toast('+' + reward + ' монет', 3); } catch (e1) {}
        }
        paint();
      };
    });
    /* автоскролл к текущему уровню */
    var cur = listEl.querySelector('[data-lvl="' + Math.min(lvl, upto) + '"]');
    if (cur) listEl.scrollTop = Math.max(0, cur.offsetTop - 80);
  }

  function setOpen(v) {
    if (!built) build();
    open = !!v;
    document.getElementById('bxrWrap').classList.toggle('bxr-on', open);
    panel.classList.toggle('bxr-on', open);
    if (open) { menuMode = true; paint(); }
    /* бейдж пункта меню обновить */
    try { if (window.BrixSidebar) BrixSidebar.refreshBadge(); } catch (eB) {}
  }

  /* ---------- API для меню (sidebar.js) ---------- */
  /** открыть полку из главного меню */
  function openMenu() {
    setOpen(true);
  }
  function closeMenu() { setOpen(false); }
  function isOpen() { return open; }

  /** совместимость со старым вызовом игры: кнопки в игре больше нет —
      только убедиться, что обработчики сети построены */
  function sync(visible) {
    if (visible && !built) build();
    if (!visible && open) setOpen(false);
  }

  return {
    sync: sync,
    gain: gain,
    paint: paint,
    openMenu: openMenu,
    closeMenu: closeMenu,
    isOpen: isOpen,
    unclaimed: unclaimed
  };
})();
