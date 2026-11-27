// ============================================================
//  brix • js/game/chat.js — ЧАТ (v0.5.22)
//  ✅ v0.5.22 (просьба игрока): чат на ENTER, для мобильных —
//  КНОПКА «ЧАТ» слева-снизу (рядом с остальными кнопками).
//
//  Как работает:
//   · ENTER (или T) открывает строку ввода ПОВЕРХ игры — pointer
//     lock не выходит, мир не ставится на паузу;
//   · пока чат открыт, guard в CAPTURE-фазе гасит ВСЕ клавиши до
//     игровых слушателей (WASD не двигает игрока, 1-6 не листают
//     хотбар, Q/E/Z не открывают меню) — читаем только наш input;
//   · ENTER — отправить (пустая строка — закрыть), ESC — закрыть;
//   · сообщения уезжают на сервер ({t:'chat'}), сервер рассылает
//     всем {t:'chat', id, n, c, m}; в режиме вкладок BroadcastChannel
//     доставляет сам; в соло сообщение просто появляется у себя;
//   · мобильные: кнопка ЧАТ (touch.js) открывает клавиатуру.
//  Стиль — наш игровой (rust-card, Oswald, оранжевый акцент).
// ============================================================
window.BrixChat = (function () {
  'use strict';

  var root = null, listEl = null, inputEl = null, sendBtn = null, capEl = null;
  var built = false, open = false;
  var messages = [];              // {n, c, m, t}
  var lastSend = 0;
  var MAX_MESSAGES = 60;
  var SEND_COOLDOWN = 700;        // мс между сообщениями (клиентский анти-спам)

  function t(k, p) { return window.BrixState ? BrixState.t(k, p) : k; }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- CSS — наш стиль, без HTML-вида ---------- */
  var CSS = [
    '#brixChat{position:fixed;left:14px;bottom:86px;z-index:62;width:min(420px,60vw);',
    'font-family:Oswald,Roboto Condensed,sans-serif;display:none;',
    '-webkit-user-select:none;user-select:none}',
    '#brixChat.bxc-on{display:block}',
    /* лента сообщений (✅ FIX: id был «bxcList» — НАШ КРАФТ-ПАНЕЛЬ
       строит список чертежей с тем же id «bxcList» (js/game/craft.js).
       Из-за дубликата id правило «#bxcList{overflow:hidden;
       pointer-events:none}» действовало И НА СПИСОК ЧЕРТЕЖЕЙ:
       крамп paneл не листался и рецепты не выбирались. Список чата
       теперь «#bxcChatList» — уникальный id) */
    '#bxcChatList{max-height:34vh;overflow:hidden;display:flex;flex-direction:column;',
    'justify-content:flex-end;gap:3px;margin-bottom:6px;pointer-events:none}',
    '.bxc-msg{background:rgba(18,20,19,.72);border-left:3px solid rgba(224,163,60,.8);',
    'padding:4px 9px;border-radius:3px;color:#f2ead6;font:13px/1.4 Roboto Condensed,sans-serif;',
    'text-shadow:0 1px 2px rgba(0,0,0,.7);width:fit-content;max-width:100%;',
    'box-shadow:0 2px 8px rgba(0,0,0,.35);word-break:break-word}',
    '.bxc-msg .bxc-name{font-weight:700;letter-spacing:.02em;margin-right:6px}',
    '.bxc-msg.bxc-old{opacity:.55}',
    /* строка ввода */
    '#bxcRow{display:flex;gap:6px;align-items:stretch}',
    '#bxcInput{flex:1;min-width:0;background:rgba(18,20,19,.85);border:1px solid rgba(242,234,214,.35);',
    'border-radius:3px;color:#f2ead6;font:14px/1.3 Roboto Condensed,sans-serif;',
    'padding:8px 10px;outline:none;-webkit-user-select:text;user-select:text}',
    '#bxcInput:focus{border-color:#e0a33c;box-shadow:0 0 0 1px rgba(224,163,60,.5)}',
    '#bxcInput::placeholder{color:rgba(242,234,214,.45)}',
    '#bxcSend{background:linear-gradient(180deg,#e0a33c,#c9852a);border:none;border-radius:3px;',
    'color:#1b1408;font-family:Oswald,sans-serif;font-weight:700;font-size:12px;letter-spacing:.08em;',
    'padding:0 14px;cursor:pointer}',
    '#bxcSend:active{filter:brightness(.9)}',
    /* подпись-подсказка */
    '#bxcCap{color:rgba(185,196,208,.85);font:11px/1.4 Roboto Condensed,sans-serif;',
    'text-shadow:0 1px 2px rgba(0,0,0,.8);margin-bottom:4px}',
    /* ---------- КНОПКА ЧАТ (мобильные + общий доступ) ---------- */
    '#bxcBtn{position:fixed;left:calc(18px + env(safe-area-inset-left));z-index:63;',
    'width:56px;height:40px;border-radius:4px;border:1px solid rgba(242,234,214,.4);',
    'background:rgba(20,23,22,.62);color:#f2ead6;font-family:Oswald,sans-serif;',
    'font-weight:700;font-size:12px;letter-spacing:.1em;cursor:pointer;display:none;',
    'box-shadow:0 2px 10px rgba(0,0,0,.45);touch-action:manipulation}',
    '#bxcBtn.bxc-on{display:block}',
    '#bxcBtn:active{background:rgba(224,163,60,.4);border-color:#e0a33c}'
  ].join('\n');

  function build() {
    if (built) return;
    built = true;
    var st = document.createElement('style');
    st.id = 'bxcStyle';
    st.textContent = CSS;
    document.head.appendChild(st);

    root = document.createElement('div');
    root.id = 'brixChat';
    root.innerHTML =
      '<div id="bxcChatList"></div>' +
      '<div id="bxcCap"></div>' +
      '<div id="bxcRow">' +
        '<input id="bxcInput" maxlength="120" autocomplete="off" ' +
          'placeholder="' + esc(t('chat.placeholder')) + '">' +
        '<button id="bxcSend">' + esc(t('chat.send')) + '</button>' +
      '</div>';
    document.body.appendChild(root);
    listEl = root.querySelector('#bxcChatList');
    inputEl = root.querySelector('#bxcInput');
    capEl = root.querySelector('#bxcCap');
    sendBtn = root.querySelector('#bxcSend');
    sendBtn.onclick = function () { sendCurrent(); };

    /* кнопка ЧАТ — видна в игре (на телефоне всегда, на ПК тоже можно) */
    var btn = document.createElement('button');
    btn.id = 'bxcBtn';
    btn.textContent = 'ЧАТ';
    btn.onclick = function () { show(true); };
    document.body.appendChild(btn);

    /* ---------- GUARD КЛАВИШ (capture) ----------
       пока чат открыт — гасим ВСЕ keydown/keyup до игровых слушателей.
       Внутри guard-а сами обрабатываем Enter/Esc. */
    document.addEventListener('keydown', function (e) {
      if (!open) return;
      e.stopPropagation();
      if (e.code === 'Enter') {
        e.preventDefault();
        sendCurrent();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        show(false);
      } else if (e.code === 'Tab') {
        e.preventDefault();
      }
    }, true);
    document.addEventListener('keyup', function (e) {
      if (!open) return;
      e.stopPropagation();
      e.preventDefault();
    }, true);

    /* входящие сообщения: сервер-режим и вкладки (BroadcastChannel
       доставляет через тот же BrixNet.on) */
    if (window.BrixNet) {
      BrixNet.on('chat', function (msg) {
        if (!msg) return;
        addMessage(msg.n || 'Игрок', msg.c || '#e2572b', String(msg.m || ''), msg.id);
      });
    }
    console.log('[BrixChat] чат готов (Enter — открыть)');
  }

  /* ---------- сообщения ---------- */
  function addMessage(name, color, text, id) {
    messages.push({ n: name, c: color, m: text, id: id, t: Date.now() });
    if (messages.length > MAX_MESSAGES) messages.shift();
    renderList();
  }

  function renderList() {
    if (!listEl) return;
    var n = messages.length;
    if (!n) {
      listEl.innerHTML = '<div class="bxc-msg bxc-old">' + esc(t('chat.empty')) + '</div>';
      return;
    }
    var html = '';
    var from = Math.max(0, n - 9);
    for (var i = from; i < n; i++) {
      var m = messages[i];
      html += '<div class="bxc-msg' + (i < n - 1 ? ' bxc-old' : '') + '">' +
        '<span class="bxc-name" style="color:' + esc(m.c) + '">' + esc(m.n) + ':</span>' +
        esc(m.m) + '</div>';
    }
    listEl.innerHTML = html;
  }

  /* ---------- отправка ---------- */
  function sendCurrent() {
    var v = (inputEl.value || '').trim();
    if (!v) { show(false); return; }
    if (Date.now() - lastSend < SEND_COOLDOWN) {
      capEl.textContent = t('chat.mute');
      return;
    }
    lastSend = Date.now();
    inputEl.value = '';
    addMessage(myName(), myColor(), v, 'me');
    if (window.BrixNet) BrixNet.send({ t: 'chat', m: v.slice(0, 120) });
    capEl.textContent = '';
    /* ✅ FIX «вайп от админа не работает, если в чате писали»: раньше
       после отправки чат ОСТАВАЛСЯ открытым с фокусом в поле ввода,
       а capture-guard чата гасил ВСЕ клавиши до игровых слушателей —
       клавиша 9 (панель разработчика/вайп) и другие просто не доходили
       до игры, пока чат не закроешь вручную. Теперь отправка = Enter
       отправил И закрыл ввод (как в Rust): клавиатура сразу
       возвращается игре */
    show(false);
  }

  function myName() {
    try { return BrixState.data.settings.nick || 'Игрок'; } catch (e) { return 'Игрок'; }
  }
  function myColor() {
    try { return (window.BrixNet && BrixNet.COLOR) ? BrixNet.COLOR : '#e2572b'; }
    catch (e) { return '#e2572b'; }
  }

  /* ---------- открыть/закрыть ---------- */
  function show(v) {
    if (!built && v) build();
    if (!built) return;
    if (open === v) return;
    open = v;
    root.classList.toggle('bxc-on', v);
    capEl.textContent = v ? t('chat.open') : '';
    if (v) {
      renderList();
      setTimeout(function () { try { inputEl.focus(); } catch (e) {} }, 30);
    } else {
      try { inputEl.blur(); } catch (e) {}
    }
  }

  /** игра вызывает: show(true) по Enter/кнопке, видна ли кнопка ЧАТ.
      На тач-устройствах кнопка НЕ рисуется — там ЧАТ есть в блоке
      тач-кнопок (touch.js btxAux), чтобы не дублировать */
  function sync(visible) {
    if (!built) {
      if (!visible) return;
      build();
    }
    var touchUi = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    var btn = document.getElementById('bxcBtn');
    if (btn) btn.classList.toggle('bxc-on', !!visible && !open && !touchUi);
    if (!visible && open) show(false);
  }

  return {
    show: show,
    isOpen: function () { return open; },
    sync: sync,
    addLocal: addMessage
  };
})();
