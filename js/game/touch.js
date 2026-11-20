// ============================================================
//  brix • js/game/touch.js
//  ✅ v0.4.41 МОБИЛЬНОЕ УПРАВЛЕНИЕ (тач-экраны):
//  - ДЖОЙСТИК ХОДЬБЫ слева-снизу (аналоговый: чем дальше ведёшь —
//    тем быстрее, до бега с кнопкой БЕГ);
//  - КАМЕРА ЧУВСТВУЕТ ПАЛЬЦЫ: свайп по экрану (правая часть) крутит
//    взгляд, многопальцево (один палец на джойстике, другой смотрит);
//  - КНОПКА НА КАЖДУЮ ФУНКЦИЮ: УДАР (ЛКМ), ПРИЦЕЛ (ПКМ, удержание),
//    ПРЫЖОК, БЕГ (переключатель), F взаимодействие (сундук/дверь/лут),
//    КРАФТ (Q), СУМКА (E), СТРОЙКА (Z), R перезарядка, СИД (C),
//    II меню (M);
//  - АДАПТАЦИЯ ПОД ЛЮБОЙ ЭКРАН: размеры через clamp() от vmin,
//    safe-area вырезы (чёлка), работает и в портрете, и в альбоме;
//  - БЕЗ ЛАГОВ: слушатели висят на ПОСТОЯННЫХ элементах (не на документе),
//    transform вместо reflow, никакой работы в кадре без тачей.
//  Включается АВТОМАТИЧЕСКИ на тач-устройствах в фазе playing
//  (принудительно: localStorage.brixTouch = '1').
//  pointer lock на телефоне не нужен: гейворлд считает игру
//  «залоченной», пока BrixTouch.isActive() (управление включено).
// ============================================================
window.BrixTouch = (function () {
  'use strict';

  var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  var forced = false;
  try { forced = localStorage.getItem('brixTouch') === '1'; } catch (e) {}

  var root = null, lookLayer = null, joyZone = null, knob = null;
  var built = false, visible = false;
  var tapped = false;   // первый «включающий» клик в текущей сессии игры

  // джойстик
  var joyId = null, joyCX = 0, joyCY = 0, joyR = 60;
  var vec = { x: 0, y: 0 };
  // камера
  var lookId = null, lookX = 0, lookY = 0;
  // тогглы
  var runOn = false;
  var aimHeld = false;
  var attackHeld = false;

  var LOOK_SENS = 0.0042;      // чувствительность камеры (рад на пиксель)
  var btnEls = {};             // data-act -> элемент (подсветка тогглов)

  var CSS = [
    '#brixTouch{position:fixed;inset:0;z-index:60;pointer-events:none;display:none;',
    'font-family:inherit;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}',
    '#brixTouch.btx-on{display:block}',
    /* слой камеры под кнопками: ловит свайпы везде, кроме кнопок */
    '#btxLook{position:absolute;inset:0;pointer-events:auto;touch-action:none}',
    /* ---------- ДЖОЙСТИК ---------- */
    '#btxJoy{position:absolute;left:calc(14px + env(safe-area-inset-left));',
    'bottom:calc(16px + env(safe-area-inset-bottom));',
    'width:var(--btxJoyS);height:var(--btxJoyS);border-radius:50%;',
    'background:rgba(20,23,22,.34);border:2px solid rgba(242,234,214,.28);',
    'pointer-events:auto;touch-action:none}',
    '#btxKnob{position:absolute;left:50%;top:50%;width:42%;height:42%;',
    'margin-left:-21%;margin-top:-21%;border-radius:50%;',
    'background:rgba(242,234,214,.62);box-shadow:0 2px 10px rgba(0,0,0,.5);',
    'transform:translate(0,0);will-change:transform}',
    /* ---------- КНОПКИ ---------- */
    '.btx-btn{pointer-events:auto;touch-action:none;box-sizing:border-box;',
    'display:flex;align-items:center;justify-content:center;',
    'width:var(--btxBtn);height:var(--btxBtn);border-radius:50%;',
    'background:rgba(20,23,22,.5);border:2px solid rgba(242,234,214,.34);',
    'color:#f2ead6;font-weight:700;font-size:calc(var(--btxBtn)*.30);',
    'text-align:center;line-height:1.05;letter-spacing:.02em;',
    'box-shadow:0 2px 12px rgba(0,0,0,.45);padding:0}',
    '.btx-btn:active,.btx-btn.btx-hot{background:rgba(242,234,214,.28)}',
    '.btx-btn.btx-on{border-color:#e0a33c;background:rgba(224,163,60,.32)}',
    '.btx-big{width:calc(var(--btxBtn)*1.55);height:calc(var(--btxBtn)*1.55);',
    'font-size:calc(var(--btxBtn)*.34)}',
    '.btx-sm{width:calc(var(--btxBtn)*.78);height:calc(var(--btxBtn)*.78);',
    'font-size:calc(var(--btxBtn)*.26)}',
    /* правая боевая группа */
    '#btxMain{position:absolute;right:calc(14px + env(safe-area-inset-right));',
    'bottom:calc(16px + env(safe-area-inset-bottom));',
    'display:grid;grid-template-columns:auto auto;gap:calc(var(--btxBtn)*.28);',
    'align-items:end;justify-items:end;pointer-events:none}',
    '#btxMain > *{pointer-events:auto}',
    /* левая служебная колонка (над джойстиком) */
    '#btxAux{position:absolute;left:calc(18px + env(safe-area-inset-left));',
    'bottom:calc(30px + env(safe-area-inset-bottom) + var(--btxJoyS));',
    'display:grid;grid-template-columns:repeat(3,auto);',
    'gap:calc(var(--btxBtn)*.24);pointer-events:none}',
    '#btxAux > *{pointer-events:auto}',
    /* пауза — правый верхний угол */
    '#btxPause{position:absolute;top:calc(12px + env(safe-area-inset-top));',
    'right:calc(12px + env(safe-area-inset-right));pointer-events:auto}',
    /* размеры под любой экран: от 44 до 78 px в зависимости от vмin */
    '#brixTouch{--btxBtn:clamp(46px,9.5vmin,78px);',
    '--btxJoyS:clamp(120px,30vmin,215px)}',
    /* на «широких» телефонах в портрете кнопки чуть крупнее руки */
    '@media (max-width:420px){#brixTouch{--btxBtn:clamp(44px,10.5vmin,64px)}}',
    /* очень короткий альбом (телефон лежачий) — прижать всё выше от краёв */
    '@media (max-height:420px){',
    '#btxMain{bottom:calc(10px + env(safe-area-inset-bottom))}',
    '#btxJoy{bottom:calc(10px + env(safe-area-inset-bottom))}}'
  ].join('\n');

  function anyUiOpen() {
    var inv = window.BrixInventory && BrixInventory.get();
    if (inv && inv.isOpen) return true;
    if (window.BrixLootMenu && BrixLootMenu.isOpen()) return true;
    if (window.BrixMiniMenu && BrixMiniMenu.isAnyOpen()) return true;
    if (window.BrixCraft && BrixCraft.isOpen()) return true;
    if (window.BrixAdmin && BrixAdmin.isOpen()) return true;
    if (window.BrixBuilding && BrixBuilding.isMenuOpen && BrixBuilding.isMenuOpen()) return true;
    if (window.BrixBuilding && BrixBuilding.isUiBlocked && BrixBuilding.isUiBlocked()) return true;
    return false;
  }

  function build() {
    if (built) return;
    built = true;
    var st = document.createElement('style');
    st.id = 'btxStyle';
    st.textContent = CSS;
    document.head.appendChild(st);

    root = document.createElement('div');
    root.id = 'brixTouch';
    root.innerHTML =
      '<div id="btxLook"></div>' +
      '<div id="btxJoy"><div id="btxKnob"></div></div>' +
      '<div id="btxAux">' +
        '<button class="btx-btn" data-act="use">F</button>' +
        '<button class="btx-btn" data-act="craft">КРАФТ</button>' +
        '<button class="btx-btn" data-act="inv">СУМКА</button>' +
        '<button class="btx-btn" data-act="build">СТРОЙ</button>' +
        '<button class="btx-btn" data-act="reload">R</button>' +
        '<button class="btx-btn" data-act="crouch">СИД</button>' +
      '</div>' +
      '<div id="btxMain">' +
        '<button class="btx-btn" data-act="run">БЕГ</button>' +
        '<button class="btx-btn" data-act="jump">ПРЫЖ</button>' +
        '<button class="btx-btn" data-act="aim">ПРИЦ</button>' +
        '<button class="btx-btn btx-big" data-act="attack">УДАР</button>' +
      '</div>' +
      '<button class="btx-btn btx-sm" id="btxPause" data-act="pause">II</button>';
    document.body.appendChild(root);
    knob = root.querySelector('#btxKnob');
    joyZone = root.querySelector('#btxJoy');
    lookLayer = root.querySelector('#btxLook');
    Array.prototype.forEach.call(root.querySelectorAll('.btx-btn'), function (b) {
      btnEls[b.dataset.act] = b;
    });

    /* ---------- ДЖОЙСТИК ---------- */
    joyZone.addEventListener('touchstart', function (e) {
      if (joyId !== null) return;
      e.preventDefault();
      var t = e.changedTouches[0];
      joyId = t.identifier;
      var r = joyZone.getBoundingClientRect();   // один раз на касание
      joyCX = r.left + r.width / 2;
      joyCY = r.top + r.height / 2;
      joyR = r.width / 2;
      moveKnob(t.clientX, t.clientY);
    }, { passive: false });

    /* ---------- КАМЕРА (свайп по свободному месту) ---------- */
    lookLayer.addEventListener('touchstart', function (e) {
      e.preventDefault();
      /* первый тап по «пустому» экрану = клик по канвасу: на телефоне это
         включает игру (гейворлд считает её залоченной) и играет звук UI */
      var cv = canvasEl();
      if (cv && !tapped) {
        cv.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        tapped = true;
      }
      if (lookId !== null) return;
      var t = e.changedTouches[0];
      lookId = t.identifier;
      lookX = t.clientX; lookY = t.clientY;
    }, { passive: false });

    /* движение обоих пальцев обрабатывает root (не перегружаем слои) */
    root.addEventListener('touchmove', function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === joyId) {
          e.preventDefault();
          moveKnob(t.clientX, t.clientY);
        } else if (t.identifier === lookId) {
          e.preventDefault();
          var dx = t.clientX - lookX, dy = t.clientY - lookY;
          lookX = t.clientX; lookY = t.clientY;
          var c = controlsRef();
          if (c && c.touchLook) c.touchLook(dx, dy);
        }
      }
    }, { passive: false });

    function endTouch(e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === joyId) {
          joyId = null;
          vec.x = 0; vec.y = 0;
          knob.style.transform = 'translate(0,0)';
        } else if (t.identifier === lookId) {
          lookId = null;
        }
      }
    }
    root.addEventListener('touchend', endTouch);
    root.addEventListener('touchcancel', endTouch);

    /* ---------- КНОПКИ ---------- */
    Array.prototype.forEach.call(root.querySelectorAll('.btx-btn'), function (b) {
      var act = b.dataset.act;
      b.addEventListener('touchstart', function (e) {
        e.preventDefault();
        e.stopPropagation();
        b.classList.add('btx-hot');
        press(act, true, b);
      }, { passive: false });
      b.addEventListener('touchend', function (e) {
        e.preventDefault();
        e.stopPropagation();
        b.classList.remove('btx-hot');
        press(act, false, b);
      }, { passive: false });
      b.addEventListener('touchcancel', function (e) {
        b.classList.remove('btx-hot');
        press(act, false, b);
      });
    });
    console.log('[BrixTouch] мобильное управление готово');
  }

  function moveKnob(x, y) {
    var dx = x - joyCX, dy = y - joyCY;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d > joyR) { dx = dx / d * joyR; dy = dy / d * joyR; }
    vec.x = dx / joyR;
    vec.y = -dy / joyR;   // вверх = вперёд
    knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  }

  function controlsRef() {
    return window.__brixControls || null;
  }

  /** синтетическое нажатие клавиши (E/Q/Z/F/R/M/C — все меню слушают keydown).
      Диспетчимся на DOCUMENT: часть слушателей висит на document (крафт),
      часть — на window (управление); событие всплывает document → window,
      поэтому получают его ВСЕ */
  function key(code, down) {
    var ev = new KeyboardEvent(down ? 'keydown' : 'keyup',
      { code: code, bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
  }

  function canvasEl() {
    return document.querySelector('#gameMount canvas');
  }

  function mouse(btn, down) {
    var cv = canvasEl();
    if (!cv) return;
    var w = window.innerWidth / 2, h = window.innerHeight / 2;
    cv.dispatchEvent(new MouseEvent(down ? 'mousedown' : 'mouseup',
      { button: btn, bubbles: true, clientX: w, clientY: h }));
  }

  /** нажатие/отпускание кнопки действия */
  function press(act, down, el) {
    switch (act) {
      case 'attack':
        attackHeld = down;
        mouse(0, down);                 // ЛКМ: удар/выстрел/бросок С4
        break;
      case 'aim':
        aimHeld = down;
        mouse(2, down);                 // ПКМ: прицел (удержание)
        break;
      case 'jump':
        if (down) {
          key('Space', true);
          setTimeout(function () { key('Space', false); }, 160);
        }
        break;
      case 'run':
        if (down) {
          runOn = !runOn;
          el.classList.toggle('btx-on', runOn);
          key('ShiftLeft', runOn);      // keydown ВКЛ / keyup ВЫКЛ
        }
        break;
      case 'crouch':
        if (down) { key('KeyC', true); setTimeout(function () { key('KeyC', false); }, 60); }
        break;
      case 'use':      if (down) { key('KeyF', true); setTimeout(function () { key('KeyF', false); }, 60); } break;
      case 'craft':    if (down) { key('KeyQ', true); setTimeout(function () { key('KeyQ', false); }, 60); } break;
      case 'inv':      if (down) { key('KeyE', true); setTimeout(function () { key('KeyE', false); }, 60); } break;
      case 'build':    if (down) { key('KeyZ', true); setTimeout(function () { key('KeyZ', false); }, 60); } break;
      case 'reload':   if (down) { key('KeyR', true); setTimeout(function () { key('KeyR', false); }, 60); } break;
      case 'pause':    if (down) { key('KeyM', true); setTimeout(function () { key('KeyM', false); }, 60); } break;
    }
  }

  /** аналоговый вектор джойстика {x: -1..1 (вбок), y: -1..1 (вперёд)} */
  function moveVec() { return vec; }

  /** управление активно? (тач-устройство + играем + controls включён —
      controls.enabled уже ложный при смерти/открытых меню/замке) */
  function isActive() {
    if (!isTouch && !forced) return false;
    if (!visible) return false;
    if (anyUiOpen()) return false;
    if (!window.BrixGame || BrixGame.state.phase !== 'playing') return false;
    var c = window.__brixControls;
    if (!c || !c.enabled) return false;
    return true;
  }

  /** вызывается из цикла гейворлда каждый кадр — дёшево */
  function sync() {
    var want = isTouch || forced;
    var phaseOk = !!window.BrixGame && BrixGame.state.phase === 'playing';
    if (!phaseOk) tapped = false;   // новая сессия — снова нужен включающий тап
    var c = window.__brixControls;
    var show = want && phaseOk && !!(c && c.enabled) && !anyUiOpen();
    if (show !== visible) {
      visible = show;
      if (!built && show) build();
      if (built) root.classList.toggle('btx-on', show);
      if (!show) {   // на всякий случай сбросить зажатое
        vec.x = 0; vec.y = 0; joyId = null; lookId = null;
        if (attackHeld) { attackHeld = false; mouse(0, false); }
        if (aimHeld) { aimHeld = false; mouse(2, false); }
        if (runOn) { runOn = false; key('ShiftLeft', false);
          if (btnEls.run) btnEls.run.classList.remove('btx-on'); }
      }
    }
  }

  return {
    sync: sync,
    isActive: isActive,
    moveVec: moveVec,
    isTouchDevice: function () { return isTouch || forced; }
  };
})();
