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
    /* ✅ v0.5.24 ПОЛНЫЙ РЕДИЗАЙН ПОЛКИ — стиль игры (Rust-палитра
       css/base.css): тёмный металл с диагональной штриховкой и
       заклёпками, ржаво-красный акцент (--rust), костяной текст,
       Oswald-стенсил в заголовках. Старая золотисто-бежевая полка
       выглядела чужеродной */
    '#bxrWrap{position:fixed;inset:0;z-index:150;display:none;place-items:center;',
    'background:rgba(4,6,5,.7);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}',
    '#bxrWrap.bxr-on{display:grid}',
    '#bxrPanel{width:min(640px,96vw);max-height:min(680px,88vh);display:none;flex-direction:column;',
    'background:repeating-linear-gradient(115deg,#171b19 0 22px,#141817 22px 44px),#141817;',
    'border:1px solid #2c3330;border-radius:6px;overflow:hidden;',
    'box-shadow:0 24px 80px rgba(0,0,0,.75),inset 0 1px 0 rgba(255,255,255,.05);',
    'font-family:Roboto Condensed,Oswald,sans-serif;-webkit-user-select:none;user-select:none}',
    '#bxrPanel.bxr-on{display:flex}',
    /* шапка: ржаво-красная полоса + стенсил-заголовок + заклёпки */
    '#bxrHead{display:flex;align-items:center;justify-content:space-between;gap:10px;',
    'padding:0 16px;height:52px;position:relative;',
    'background:linear-gradient(180deg,#8f2d1f,#6e2115 70%,#571a10);',
    'border-bottom:2px solid #3a130b;box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 3px 10px rgba(0,0,0,.4)}',
    '#bxrHead h3{margin:0;font-family:Oswald,sans-serif;font-weight:600;font-size:17px;',
    'letter-spacing:.16em;color:#f4ede0;text-transform:uppercase;',
    'text-shadow:0 2px 0 rgba(0,0,0,.45)}',
    '#bxrHead .bxr-rivet{position:absolute;width:6px;height:6px;border-radius:50%;',
    'background:radial-gradient(circle at 35% 30%,#7d837d,#3a3f3c 70%);',
    'box-shadow:0 1px 1px rgba(0,0,0,.6)}',
    '#bxrClose{background:rgba(10,12,11,.55);border:1px solid rgba(242,234,214,.28);border-radius:4px;',
    'color:#f2ead6;width:30px;height:30px;cursor:pointer;font-size:14px;line-height:1;',
    'transition:border-color .12s,color .12s}',
    '#bxrClose:hover{border-color:var(--rust,#cd412f);color:#ff9d84}',
    /* блок уровня: большая цифра в металлической плашке + прогресс */
    '#bxrProg{padding:14px 16px 16px;border-bottom:1px solid #262c29;',
    'background:linear-gradient(180deg,#1a1e1c,#161a18);display:flex;gap:14px;align-items:center}',
    '#bxrLvlBox{flex-shrink:0;width:84px;height:84px;border-radius:6px;position:relative;',
    'background:linear-gradient(160deg,#232826,#181c1a);',
    'border:1px solid #343a37;box-shadow:inset 0 2px 0 rgba(255,255,255,.06),0 4px 12px rgba(0,0,0,.4);',
    'display:flex;flex-direction:column;align-items:center;justify-content:center}',
    '#bxrLvl{font-family:Oswald,sans-serif;font-weight:700;font-size:34px;line-height:1;',
    'color:#f4ede0;text-shadow:0 2px 0 rgba(0,0,0,.5)}',
    '#bxrLvlBox .bxr-cap{font:600 9px/1 Oswald,sans-serif;letter-spacing:.22em;',
    'color:#8b938f;margin-top:5px;text-transform:uppercase}',
    '#bxrProgMain{flex:1;min-width:0}',
    '#bxrLvlRow{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:9px;gap:8px}',
    '#bxrNext{font:600 12px/1.3 Oswald,sans-serif;color:#d8a25a;letter-spacing:.08em;',
    'text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#bxrCoins{font:600 12px/1.3 Oswald,sans-serif;color:#d6d9d4;letter-spacing:.06em;',
    'display:flex;align-items:center;gap:6px;flex-shrink:0}',
    '#bxrBar{height:14px;border-radius:3px;background:#0b0d0c;',
    'border:1px solid #2c3330;overflow:hidden;position:relative;',
    'box-shadow:inset 0 2px 5px rgba(0,0,0,.6)}',
    '#bxrBarFill{height:100%;width:0;border-radius:2px;',
    'background:linear-gradient(180deg,#e2553d,#a73421 60%,#7d2416);',
    'box-shadow:inset 0 1px 0 rgba(255,255,255,.25);',
    'transition:width .45s cubic-bezier(.2,.8,.2,1)}',
    '#bxrBarTicks{position:absolute;inset:0;display:flex;pointer-events:none}',
    '#bxrBarTicks i{flex:1;border-right:1px solid rgba(11,13,12,.55)}',
    '#bxrBarTicks i:last-child{border-right:none}',
    '#bxrBarTxt{margin-top:8px;font:12px/1.4 Roboto Condensed,sans-serif;',
    'color:rgba(214,217,212,.8);letter-spacing:.03em}',
    /* список наград: строки-карточки */
    '#bxrList{overflow-y:auto;padding:10px 12px 12px;flex:1}',
    '#bxrList::-webkit-scrollbar{width:10px}',
    '#bxrList::-webkit-scrollbar-thumb{background:#3a413d;border-radius:5px;',
    'border:2px solid #161a18}',
    '#bxrList::-webkit-scrollbar-track{background:#101312}',
    '.bxr-row{display:flex;align-items:center;gap:12px;padding:9px 10px;margin-bottom:6px;',
    'background:linear-gradient(180deg,#1d2220,#171b19);',
    'border:1px solid #2a302d;border-left:3px solid #3a413d;border-radius:4px;',
    'transition:border-color .12s,background .12s}',
    '.bxr-row.bxr-cur{border-left-color:var(--rust,#cd412f);',
    'background:linear-gradient(180deg,#242a27,#1a1e1c)}',
    '.bxr-row.bxr-row-done{opacity:.62}',
    '.bxr-row.bxr-row-locked{opacity:.5}',
    '.bxr-lvl{font-family:Oswald,sans-serif;font-weight:700;font-size:13px;color:#d6d9d4;',
    'width:78px;flex-shrink:0;letter-spacing:.08em;display:flex;align-items:center;gap:7px}',
    '.bxr-tag{background:#262c29;border:1px solid #3a413d;border-radius:3px;',
    'padding:3px 7px;box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}',
    '.bxr-prize{flex:1;display:flex;align-items:center;gap:9px;min-width:0;',
    'font:14px/1.3 Roboto Condensed,sans-serif;color:rgba(214,217,212,.92)}',
    '.bxr-coin{width:22px;height:22px;border-radius:50%;flex-shrink:0;',
    '.bxr-coin-sm{width:15px;height:15px;border-width:1.5px}',
    'background:radial-gradient(circle at 35% 28%,#f0d289,#d8a25a 52%,#8f6527);',
    'border:2px solid #5c421a;box-shadow:0 1px 4px rgba(0,0,0,.55)}',
    '.bxr-claim{background:linear-gradient(180deg,#e2553d,#b03a24 55%,#8a2b1a);',
    'border:1px solid #6e2115;border-radius:4px;color:#fff;',
    'font-family:Oswald,sans-serif;font-weight:700;font-size:12px;',
    'letter-spacing:.1em;padding:9px 16px;cursor:pointer;flex-shrink:0;',
    'box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 2px 6px rgba(0,0,0,.4);',
    'text-transform:uppercase;transition:filter .12s,transform .06s}',
    '.bxr-claim:hover{filter:brightness(1.12)}',
    '.bxr-claim:active{filter:brightness(.92);transform:translateY(1px)}',
    '.bxr-claim.bxr-done{background:#1f2a1c;color:#9fd084;cursor:default;',
    'border:1px solid #34482e;box-shadow:none',
    '.bxr-claim.bxr-locked{background:#222624;color:rgba(214,217,212,.4);',
    'cursor:default;border:1px solid #2a302d;box-shadow:none}',
    '.bxr-cap{padding:11px 16px 13px;font:12px/1.4 Roboto Condensed,sans-serif;',
    'color:rgba(214,217,212,.55);border-top:1px solid #262c29;',
    'background:linear-gradient(180deg,#161a18,#141817)}',
    /* тост опыта в игре — маленькая строка в правом нижнем углу */
    '#bxrToast{position:fixed;right:calc(16px + env(safe-area-inset-right));',
    'bottom:calc(16px + env(safe-area-inset-bottom));z-index:63;display:none;',
    'background:rgba(14,16,15,.9);border:1px solid var(--rust,#cd412f);border-radius:4px;',
    'border-left:3px solid var(--rust,#cd412f);',
    'color:#ffd9c9;font:13px/1.4 Roboto Condensed,sans-serif;padding:9px 13px;',
    'box-shadow:0 4px 16px rgba(0,0,0,.55);letter-spacing:.02em;',
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

    /* подложка + панель (открывается ИЗ МЕНЮ) — ✅ v0.5.24 новая
       разметка под редизайн: шапка с заклёпками, блок уровня с
       крупной цифрой и шкалой с насечками, список карточек-строк */
    var wrap = document.createElement('div');
    wrap.id = 'bxrWrap';
    wrap.innerHTML =
      '<div id="bxrPanel">' +
        '<div id="bxrHead">' +
          '<h3>' + esc(t('rw.title')) + '</h3>' +
          '<span class="bxr-rivet" style="left:8px;top:8px"></span>' +
          '<span class="bxr-rivet" style="left:8px;bottom:8px"></span>' +
          '<span class="bxr-rivet" style="right:52px;top:8px"></span>' +
          '<span class="bxr-rivet" style="right:52px;bottom:8px"></span>' +
          '<button id="bxrClose">&#10005;</button>' +
        '</div>' +
        '<div id="bxrProg">' +
          '<div id="bxrLvlBox">' +
            '<div id="bxrLvl"></div>' +
            '<div class="bxr-cap">' + esc(t('rw.levelShort')) + '</div>' +
          '</div>' +
          '<div id="bxrProgMain">' +
            '<div id="bxrLvlRow">' +
              '<span id="bxrNext"></span>' +
              '<span id="bxrCoins"><span class="bxr-coin bxr-coin-sm"></span><span id="bxrCoinsN"></span></span>' +
            '</div>' +
            '<div id="bxrBar"><div id="bxrBarFill"></div>' +
              '<div id="bxrBarTicks"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
            '</div>' +
            '<div id="bxrBarTxt"></div>' +
          '</div>' +
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

    document.getElementById('bxrLvl').textContent = lvl;
    document.getElementById('bxrNext').textContent = isMax ? t('rw.max') : t('rw.next', { n: lvl + 1 });
    document.getElementById('bxrCoinsN').textContent = (S.coins || 0) + ' ' + t('rw.coins');
    var k = isMax ? 1 : Math.max(0, Math.min(1, xp / need));
    document.getElementById('bxrBarFill').style.width = (k * 100).toFixed(1) + '%';
    /* «250 опыта, до 2 уровня осталось 50» — как просил игрок */
    document.getElementById('bxrBarTxt').textContent = isMax
      ? xp + ' / —'
      : xp + ' / ' + need + '  ·  ' + (need - xp) + ' ' + t('rw.left') + ' ' + (lvl + 1);

    /* список уровней: от 1 до level+10 (но не меньше 20 строк) —
       ✅ v0.5.24: строки-карточки с тегом уровня, монетой и кнопкой */
    var listEl = document.getElementById('bxrList');
    if (!listEl) return;
    var upto = Math.min(max, Math.max(lvl + 10, 20));
    var claimed2 = S.claimedLevels || [];
    var reward = window.BrixState ? BrixState.levelReward(1) : 50;
    var html = '';
    for (var L = 1; L <= upto; L++) {
      var state2, cls, rowCls = 'bxr-row';
      if (claimed2.indexOf(L) !== -1) {
        state2 = t('rw.claimed'); cls = 'bxr-done'; rowCls += ' bxr-row-done';
      } else if (L <= lvl) {
        state2 = t('rw.claim', { n: reward }); cls = '';
        if (L === lvl) rowCls += ' bxr-cur';
      } else {
        state2 = t('rw.locked', { n: L }); cls = 'bxr-locked'; rowCls += ' bxr-row-locked';
      }
      html += '<div class="' + rowCls + '">' +
        '<span class="bxr-lvl"><span class="bxr-tag">' + esc(t('rw.level', { n: L })) + '</span></span>' +
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
          try { if (window.BrixHud) BrixHud.toast('+' + reward + ' ' + t('rw.coins'), 3); } catch (e1) {}
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
