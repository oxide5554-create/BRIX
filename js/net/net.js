/* ============================================================
 *  brix • js/net/net.js — СЕТЬ МУЛЬТИПЛЕЕРА (v0.3.1)
 *
 *  Два транспорта (выбираются автоматически):
 *   1. WebSocket на ws://<хост>:8787 — АВТОРИТЕТНЫЙ сервер brix
 *      (server.js): сервер назначает id, держит ростер игроков и
 *      общее состояние мира (запасы деревьев/руд) как в Rust/Oxide.
 *      Работает между РАЗНЫМИ компьютерами/браузерами.
 *   2. BroadcastChannel — резерв для двух вкладок одного браузера
 *      (даже с file://, без сервера).
 *  Если ни то, ни другое недоступно — одиночная игра.
 *
 *  События для игры (BrixNet.on(...)):
 *   welcome(msg) — от сервера: {id, players:[{id,n,c,s}...], world:{trees,ores}}
 *   join(id, name, color) / leave(id) — ростер изменился
 *   state(msg) — состояние чужого игрока 12 Гц
 *   hit(msg) — результат удара по ресурсу (СЕРВЕР решил): {k,ty,i,l,d,fd,by}
 * ============================================================ */
window.BrixNet = (function () {
  'use strict';

  var ID = null;            // назначается сервером в welcome
  // ✅ v0.3.4: настоящий ник из профиля (не «Игрок-J1V»)
  function profileNick() {
    try {
      var n = window.BrixState && BrixState.data.settings && BrixState.data.settings.nick;
      return (n && String(n).trim()) || '';
    } catch (e) { return ''; }
  }
  var NAME = profileNick() || 'Игрок';
  // цвет игрока для плашки имени (тёплые игровые тона)
  var HUES = [210, 20, 130, 280, 45, 170, 330, 90];
  var COLOR = 'hsl(' + HUES[Math.floor(Math.random() * HUES.length)] + ',55%,55%)';

  var ws = null;          // WebSocket или null
  var bc = null;          // BroadcastChannel или null
  var mode = 'off';
  var serverVer = 0;   // ✅ v0.4.2: версия протокола сервера (welcome.ver)
  var serverSv = '';   // ✅ v0.4.17: версия СЕРВЕРА (welcome.sv) — пусто = сервер СТАРЫЙ       // 'server' | 'tabs' | 'off'
  var serverFolder = '';   // ✅ v0.4.29: папка РЕАЛЬНО работающего сервера (welcome.folder)
  var oldSrvWarned = false;   // ✅ v0.4.23: предупредили о старом сервере один раз

  /* ✅ v0.4.23: сравнение версий «0.4.22» -> 40022. Если сервер СТАРЫЙ —
     кричим об этом СРАЗУ при подключении (toast 15 сек + console.warn).
     Без этого игрок меняет server.js, но не перезапускает сервер — и
     получает «сундук не ставится» / «сервер отклонил» / «не умирают» */
  function verNum(s) {
    var a = String(s || '').split('.');
    return (parseInt(a[0], 10) || 0) * 10000 +
           (parseInt(a[1], 10) || 0) * 100 +
           (parseInt(a[2], 10) || 0);
  }
  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  /* ✅ v0.4.29: ПЕРСИСТЕНТНЫЙ красный баннер вместо 15-секундного toast.
     Игрок не успевал прочитать короткий toast и продолжал играть на
     старом сервере (ломание построек не работает). Баннер висит СВЕРХУ
     пока версии не совпадут: hideVerBanner() срабатывает на каждом
     welcome — как только игрок перезапустит сервер и переподключится,
     баннер исчезнет сам. Также показывает ПАПКУ сервера — сразу видно,
     что server.js заменили не в той папке */
  function hideVerBanner() {
    var b = document.getElementById('brixVerBanner');
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }
  function showVerBanner(cl, sv) {
    hideVerBanner();
    var b = document.createElement('div');
    b.id = 'brixVerBanner';
    var folder = serverFolder
      ? 'Папка РЕАЛЬНО работающего сервера: <b>' + escHtml(serverFolder) + '</b>'
      : 'Проверить версию и папку сервера: <b>http://localhost:8787/status</b>';
    b.innerHTML =
      '<div class="vbt"><b>СЕРВЕР СТАРЫЙ:</b> на сервере v' + escHtml(sv) + ', клиент v' + escHtml(cl) + '</div>' +
      '<div class="vbs">Урон по постройкам, сундук и бессмертие НЕ работают, пока сервер не обновят.</div>' +
      '<div class="vbs">' + folder + '</div>' +
      '<div class="vbs">1) Ctrl+Shift+Esc → «Подробности» → все <b>node.exe</b> → «Снять задачу» (или taskkill /F /IM node.exe)</div>' +
      '<div class="vbs">2) Запусти START-MULTIPLAYER.bat — в шапке должно быть «BRIX server v' + escHtml(cl) + '»</div>' +
      '<div class="vbs">3) Ничего не вышло? Замени server.js в ТАМ папке из шага выше — не в другой копии игры</div>' +
      '<div class="vbclose" id="brixVerBannerX">✕</div>';
    b.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:400;' +
      'max-width:660px;padding:14px 42px 14px 18px;background:linear-gradient(135deg,#5c1208,#8a1e10);' +
      'color:#ffe7dc;border:1px solid #ff8a63;border-radius:6px;box-shadow:0 12px 50px rgba(0,0,0,.7);' +
      'font:13px/1.55 Consolas,monospace;letter-spacing:.02em;text-align:left;';
    var t = b.querySelector('.vbt');
    if (t) t.style.cssText = 'font-size:16px;letter-spacing:.06em;margin-bottom:6px;';
    var xs = b.querySelectorAll('.vbs');
    for (var i = 0; i < xs.length; i++) xs[i].style.cssText = 'opacity:.92;margin:2px 0;';
    var x = b.querySelector('.vbclose');
    if (x) {
      x.style.cssText = 'position:absolute;top:8px;right:12px;font:16px Consolas,monospace;cursor:pointer;color:#ffb59a;';
      x.onclick = hideVerBanner;
    }
    document.body.appendChild(b);
  }
  function warnIfServerOld() {
    var cl = String(window.BRIX_VER || '');
    var sv = serverSv;
    if (!cl || !sv || verNum(sv) >= verNum(cl)) {   // всё хорошо
      oldSrvWarned = false;
      hideVerBanner();
      return;
    }
    if (oldSrvWarned) return;
    oldSrvWarned = true;
    console.warn('[net] СЕРВЕР СТАРЫЙ: сервер v' + sv + ', клиент v' + cl +
      (serverFolder ? ', папка сервера: ' + serverFolder : ''));
    showVerBanner(cl, sv);
  }

  var statusEl = null;
  var handlers = {
    welcome: null,        // (msg) — ростер + мир от сервера
    state: null,          // (msg)
    hit: null,            // (msg)
    join: null,           // (id, name, c)
    leave: null           // (id)
  };
  var seen = {};          // id -> время последнего «пинга» (режим вкладок)

  /* ✅ v0.4.3: РОСТЕР для списка игроков (мини-меню, клавиша M):
     id -> {id, n, c, lvl, aid, last} — ник, УРОВЕНЬ профиля и
     BRIX-ID аккаунта. Наполняют welcome/join (сервер) и hi (вкладки) */
  var roster = {};
  function ownLvl() {
    try { return (window.BrixState && BrixState.data.level) || 1; } catch (e) { return 1; }
  }
  function ownAid() {
    /* ✅ fix 0.4.11: BRIX-ID создаётся СРАЗУ при подключении, а не при
       первом открытии профиля. Раньше: игрок входил без ID → сервер
       писал владельцем двери «n:ник» → позже появлялся ID → клиент
       переставал узнавать свою дверь (F требовал код). Теперь ключ
       владельца стабилен с первого входа */
    try {
      if (window.BrixState && BrixState.ensureProfileId) {
        var id = BrixState.ensureProfileId();
        if (id) return String(id);
      }
      return (window.BrixState && BrixState.data.profileId) || '';
    } catch (e) { return ''; }
  }

  function peersCount() {
    var n = 0;
    var now = performance.now();
    for (var k in seen) {
      if (now - seen[k] < 3000) n++;
      else delete seen[k];
    }
    return n;
  }

  /* ---------- приём ---------- */

  function handle(msg) {
    if (!msg || !msg.t) return;
    if (msg.id && ID && msg.id === ID) return;   // своё эхо (режим вкладок)
    switch (msg.t) {
      case 'welcome':
        serverVer = msg.ver || 0;   // ✅ v0.4.2: версия протокола сервера (welcome.ver)
        serverSv = String(msg.sv || '');   // ✅ v0.4.17: старый server.js версии НЕ пришлёт
        serverFolder = String(msg.folder || '');   // ✅ v0.4.29: папка запущенного сервера
        ID = msg.id;
        /* ✅ v0.4.23: СРАЗУ предупреждаем, если сервер СТАРЫЙ (старее клиента).
           Симптомы старого server.js: «сундук не ставится», «сервер
           отклонил команду админа» (тумблер бессмертия), «игроков нельзя
           убить» (старый сервер защищал админский BRIX-ID всегда).
           Причина почти всегда одна: server.js заменили, но СЕРВЕР НЕ
           ПЕРЕЗАПУСТИЛИ — или запустили из другой папки */
        try { warnIfServerOld(); } catch (e0) {}
        // ✅ v0.4.3: ростер от сервера — истина для списка игроков
        roster = {};
        (msg.players || []).forEach(function (p) {
          roster[p.id] = { id: p.id, n: p.n, c: p.c, lvl: p.lvl, aid: p.aid,
            last: performance.now() };
        });
        // свой ник не перебиваем выдуманным — шлём из профиля
        if (!NAME || NAME === 'Игрок') NAME = profileNick() || NAME;
        if (handlers.welcome) handlers.welcome(msg);
        break;
      case 'join':
        if (msg.id) {
          seen[msg.id] = performance.now();
          // ✅ v0.4.3: новый игрок — в ростер (ник/уровень/BRIX-ID)
          roster[msg.id] = { id: msg.id, n: msg.n, c: msg.c, lvl: msg.lvl,
            aid: msg.aid, last: performance.now() };
        }
        if (handlers.join) handlers.join(msg.id, msg.n, msg.c);
        break;
      case 'leave':
        delete seen[msg.id];
        delete roster[msg.id];   // ✅ v0.4.3
        if (handlers.leave) handlers.leave(msg.id);
        break;
      case 's':
        seen[msg.id] = performance.now();
        // ✅ v0.4.3: состояние живого игрока держит его в ростере
        if (!roster[msg.id]) {
          roster[msg.id] = { id: msg.id, n: msg.n, lvl: msg.lvl, aid: msg.aid };
        } else {
          if (msg.n) roster[msg.id].n = msg.n;
          roster[msg.id].last = performance.now();
        }
        if (handlers.state) handlers.state(msg);
        break;
      case 'hit':
        if (handlers.hit) handlers.hit(msg);
        break;
      /* ✅ v0.3.3: соцсеть — входящие заявки в друзья через сервер */
      case 'fsoc':
        if (handlers.social) handlers.social(msg);
        break;
      case 'fsoc-miss':
        if (handlers.socialMiss) handlers.socialMiss(msg);
        break;
      /* ✅ v0.3.6: мир объектов — всё авторитетно от сервера */
      case 'bhp':
        if (handlers.bhp) handlers.bhp(msg);
        break;
      /* ✅ v0.4.0: ответ на ping — «сервер отвечает ✓» на HUD */
      case 'pong':
        if (handlers.pong) handlers.pong(msg);
        break;
      case 'brk':
        if (handlers.brk) handlers.brk(msg);
        break;
      case 'btaken':
        if (handlers.btaken) handlers.btaken(msg);
        break;
      case 'cbtaken':
        if (handlers.cbtaken) handlers.cbtaken(msg);
        break;
      /* ✅ v0.3.8: лут-меню ящика и респавн бочек — всё от сервера */
      case 'cbopen':
        if (handlers.cbopen) handlers.cbopen(msg);
        break;
      case 'cbloot':
        if (handlers.cbloot) handlers.cbloot(msg);
        break;
      case 'cbrespawn':
        if (handlers.cbrespawn) handlers.cbrespawn(msg);
        break;
      case 'brespawn':
        if (handlers.brespawn) handlers.brespawn(msg);
        break;
      /* ✅ v0.4.6 СТРОИТЕЛЬСТВО: сервер подтвердил постройку (bnew — всем,
         в т.ч. поставившему: он применяет повтором по ключу без задвоения)
         или отказал (bdeny — откат оптимистичной установки) */
      case 'bnew':
        if (handlers.bnew) handlers.bnew(msg);
        break;
      case 'bdeny':
        if (handlers.bdeny) handlers.bdeny(msg);
        break;
      /* ✅ v0.4.10 ДВЕРИ/ОКНА/ЗАМКИ: снос заменённой детали (brem),
         дверь открыли/закрыли (bdoor), лампа замка — код задан/сменён
         (block), «ты разгадал этот замок» (dunl), отказы сервера */
      case 'brem':
        if (handlers.brem) handlers.brem(msg);
        break;
      case 'bdoor':
        if (handlers.bdoor) handlers.bdoor(msg);
        break;
      case 'block':
        if (handlers.block) handlers.block(msg);
        break;
      case 'dunl':
        if (handlers.dunl) handlers.dunl(msg);
        break;
      case 'bcodedeny':
        if (handlers.bcodedeny) handlers.bcodedeny(msg);
        break;
      case 'bdeny-d':
        if (handlers["bdeny-d"]) handlers["bdeny-d"](msg);
        break;
      /* ✅ v0.4.18 ОЧИСТКА ПОСТРОЕК: сервер стёр ВСЕ постройки (админ-
         панель «УДАЛИТЬ ВСЕ ПОСТРОЙКИ» или CLEAR-BUILDS.bat) и разослал
         bwipe с новым поколением мира (ep). Клиент обязан выбросить
         старые 3D-модели, иначе остаётся «дом-призрак»: игрок его ВИДИТ,
         а сервер про него НЕ ЗНАЕТ и отказывает в каждой стене
         («нет фундамента»). ГЛАВНЫЙ ФИКС: раньше случая bwipe в этом
         switch НЕ БЫЛО — сообщение молча терялось ЗДЕСЬ, обработчик
         onBwipe в building.js никогда не вызывался, и модели висели */
      case 'bwipe':
        if (handlers.bwipe) handlers.bwipe(msg);
        break;
      /* --- ✅ v0.4.22 СУНДУК-ХРАНИЛИЩЕ ---
         chestst   — содержимое сундука (открытие/кладка/взятие);
         chestdeny — сервер отказал в взятии (откат оптимистичного);
         chestanim — крышка открылась/закрылась у другого игрока */
      case 'chestst':
        if (handlers.chestst) handlers.chestst(msg);
        break;
      case 'chestdeny':
        if (handlers.chestdeny) handlers.chestdeny(msg);
        break;
      case 'chestanim':
        if (handlers.chestanim) handlers.chestanim(msg);
        break;
      /* --- ✅ v0.4.15 АДМИН-ПАНЕЛЬ РАЗРАБОТЧИКА (клавиша 9) ---
         adminon — ты админ (сервер подтвердил по BRIX-ID);
         adeny   — сервер ОТКАЗАЛ в команде (не админ/неизвестная op);
         aok     — команда выполнена (info — текст для тоста);
         atp     — сервер телепортирует тебя (x, z);
         banned  — твой аккаунт забанен (соединение закроется);
         dclr    — сервер убрал все дропы (клиент чистит мешы) */
      case 'adminon':
        if (handlers.adminon) handlers.adminon(msg);
        break;
      case 'adeny':
        if (handlers.adeny) handlers.adeny(msg);
        break;
      case 'aok':
        if (handlers.aok) handlers.aok(msg);
        break;
      case 'atp':
        if (handlers.atp) handlers.atp(msg);
        break;
      case 'banned':
        if (handlers.banned) handlers.banned(msg);
        break;
      case 'dclr':
        if (handlers.dclr) handlers.dclr(msg);
        break;
      case 'cnt':
        // счётчик онлайна пушит сервер — мгновенно, каждому.
        // ✅ v0.4.1: g — сколько из них В ИГРЕ (state) vs в меню
        if (handlers.cnt) handlers.cnt(msg.n, msg.g);
        break;
      case 'bhit':
        // режим вкладок: заявка удара от другой вкладки (сервер-режим
        // обрабатывает 'bhit' сам и назад не пересылает)
        if (handlers.bhitReq) handlers.bhitReq(msg);
        break;
      /* --- ✅ v0.4.5 БОЙ: звук выстрела/перезарядки, попадания,
             смерти и возрождения (в сервер-режиме рассылает server.js,
             во вкладках — BroadcastChannel) --- */
      case 'snd':
        if (handlers.snd) handlers.snd(msg);
        break;
      case 'phit':
        if (handlers.phit) handlers.phit(msg);
        break;
      case 'pdeath':
        if (handlers.pdeath) handlers.pdeath(msg);
        break;
      case 'prespawn':
        if (handlers.prespawn) handlers.prespawn(msg);
        break;
      /* --- режим вкладок (без сервера) --- */
      case 'hi':
        seen[msg.id] = performance.now();
        // ✅ v0.4.3: вкладка представилась — в ростер
        roster[msg.id] = { id: msg.id, n: msg.n, c: msg.c, lvl: msg.lvl,
          aid: msg.aid, last: performance.now() };
        if (handlers.join) handlers.join(msg.id, msg.n, msg.c);
        if (msg.need && handlers.worldReq) handlers.worldReq(msg.id);
        break;
      case 'world':
        if (handlers.world) handlers.world(msg);
        break;
      case 'need':
        if (handlers.worldReq) handlers.worldReq(msg.id);
        break;
      case 'bye':
        delete seen[msg.id];
        if (handlers.leave) handlers.leave(msg.id);
        break;
    }
  }

  function onRaw(text) {
    var msg;
    try { msg = JSON.parse(text); } catch (e) { return; }
    handle(msg);
  }

  /* ---------- отправка ---------- */

  function send(obj) {
    var text;
    try { text = JSON.stringify(obj); } catch (e) { return; }
    if (mode === 'server' && ws && ws.readyState === 1) { ws.send(text); return; }
    if (mode === 'tabs' && bc) {
      obj.id = obj.id || ID || 'local';
      bc.postMessage(JSON.stringify(obj));
    }
  }

  /* ---------- подключение ---------- */

  function tryWebSocket(onDone) {
    var host = location.hostname || 'localhost';
    var sock;
    try { sock = new WebSocket('ws://' + host + ':8787'); }
    catch (e) { onDone(null); return; }
    var settled = false;
    var timer = setTimeout(function () {
      if (!settled) { settled = true; try { sock.close(); } catch (e) {} onDone(null); }
    }, 1500);
    sock.onopen = function () {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      onDone(sock);
    };
    sock.onerror = function () {
      if (!settled) { settled = true; clearTimeout(timer); onDone(null); }
    };
    sock.onclose = function () {
      if (!settled) { settled = true; clearTimeout(timer); onDone(null); }
      else if (mode === 'server') {
        // сервер умер → пробуем вкладки
        ws = null;
        connectTabs();
      }
    };
    sock.onmessage = function (ev) { onRaw(typeof ev.data === 'string' ? ev.data : ''); };
  }

  function connectTabs() {
    if (typeof BroadcastChannel === 'undefined') { mode = 'off'; paint(); return; }
    try { bc = new BroadcastChannel('brix-mp-v1'); }
    catch (e) { mode = 'off'; paint(); return; }
    bc.onmessage = function (ev) { onRaw(ev.data); };
    mode = 'tabs';
    if (!ID) ID = 'p' + Math.random().toString(36).slice(2, 8);
    paint();
  }

  function connect(meta) {
    tryWebSocket(function (sock) {
      if (sock) {
        ws = sock;
        mode = 'server';
        NAME = profileNick() || NAME;
        // ✅ v0.4.3: в hello едет уровень профиля и BRIX-ID —
        // сервер кладёт их в ростер (список игроков в мини-меню)
        send({ t: 'hello', n: NAME, c: COLOR, lvl: ownLvl(), aid: ownAid(),
          meta: meta || null });
        paint();
      } else {
        connectTabs();
        if (mode !== 'off') announce(true);
      }
    });
  }

  function announce(needWorld) {
    NAME = profileNick() || NAME;
    send({ t: 'hi', n: NAME, c: COLOR, lvl: ownLvl(), aid: ownAid(), need: !!needWorld });
  }

  function disconnect() {
    send({ t: 'bye' });
    if (ws) { try { ws.close(); } catch (e) {} ws = null; }
    if (bc) { try { bc.close(); } catch (e) {} bc = null; }
    mode = 'off';
    seen = {};
    roster = {};   // ✅ v0.4.3
    paint();
  }

  /* ---------- строка статуса ---------- */

  function label() {
    // ✅ v0.4.1: «В ИГРЕ» вместо «игроков» — раньше рядом стояло
    // «НА СЕРВЕРЕ СЕЙЧАС: 2» и было непонятно, что означают числа
    if (mode === 'server') return 'СЕТЬ: сервер · В ИГРЕ: ' + (peersCount() + 1);
    if (mode === 'tabs') return 'СЕТЬ: вкладки · В ИГРЕ: ' + (peersCount() + 1);
    return 'СЕТЬ: одиночная игра';
  }

  function paint() {
    if (statusEl) statusEl.textContent = label();
  }

  function setStatusEl(el) {
    statusEl = el;
    paint();
  }

  /* ---------- такт: пинги вкладок и статус ---------- */

  var hbT = 0;
  function tick(dt, myState) {
    if (mode === 'off') return;
    hbT -= dt;
    if (hbT <= 0) {
      hbT = 1;
      if (mode === 'tabs') announce(false);   // пинг в режиме вкладок
      paint();
    }
    if (myState) sendState(myState);
  }

  /** состояние игрока: {x,y,z,yaw,a,tool,ph} — a: idle|run|jump|atk1|atk2 */
  function sendState(st) {
    if (mode === 'off') return;
    st.t = 's';
    send(st);
  }

  /** ✅ v0.3.3: отправить соцсообщение (заявка в друзья) игроку по имени —
   *  сервер пересылает адресату (см. 'fsend' в server.js) */
  function sendSocial(to, kind, data) {
    send({ t: 'fsend', to: to, fromId: (window.BrixState && BrixState.data.profileId) || '',
      kind: kind, data: data || null });
  }

  /** ЗАПРОС удара по ресурсу + готовый РЕЗУЛЬТАТ (для вкладок без сервера):
   *  сервер использует только y (сам решает всё остальное), а другие
   *  вкладки берут готовые l/d/fd отправителя. */
  function sendHit(kind, type, idx, y, l, d, fd) {
    if (mode === 'off') return;
    var msg = { t: 'hit', k: kind, ty: type || null, i: idx, y: y };
    if (l !== undefined && l !== null) msg.l = l;
    if (d) msg.d = 1;
    if (fd !== undefined && fd !== null) msg.fd = fd;
    send(msg);
  }

  /* ✅ v0.3.6: бочки/дропы/чекблоки — заявки серверу (решает сервер) */
  function sendBhit(id, tool) {
    if (mode === 'off') return;
    send({ t: 'bhit', id: id, tool: tool || '' });
  }
  function sendBtake(id) {
    if (mode === 'off') return;
    send({ t: 'btake', id: id });
  }
  /* ✅ v0.3.8: открыть лут-меню ящика чекблока */
  function sendCbOpen(id) {
    if (mode !== 'server') return;
    send({ t: 'cbopen', id: id });
  }
  /* ✅ v0.3.8: взять предмет из ящика (id чекблока + вид предмета).
     ✅ v0.4.1: amt — сколько ВЗЯТЬ (клик = весь стек, драг в стек =
     сколько влезает); без amt сервер отдаёт весь стек как раньше */
  function sendCbTake(id, item, amt, tid) {
    if (mode === 'off') return;
    var m = { t: 'cbtake', id: id, item: item };
    if (amt > 0) m.amt = Math.floor(amt);
    if (tid) m.tid = tid;
    send(m);
  }
  /* ✅ v0.4.1: положить свой предмет В ЯЩИК (drag&drop в обратную
     сторону). Сервер добавляет в лут ящика и рассылает всем cbloot */
  function sendCbPut(id, item, amt) {
    if (mode === 'off') return;
    send({ t: 'cbput', id: id, item: item, amt: Math.max(1, Math.floor(amt || 1)) });
  }

  /* ✅ v0.4.6 БОЙ: звук выстрела/перезарядки (x/z — где звук случился,
     слушатели гасят громкость по дистанции), попадание по игроку
     (ХП решает сервер), возрождение */
  function sendSnd(kind, pos) {
    if (mode === 'off') return;
    send({ t: 'snd', k: kind,
      x: pos ? +pos.x.toFixed(1) : 0, z: pos ? +pos.z.toFixed(1) : 0 });
  }

  /* ✅ v0.4.6 СТРОИТЕЛЬСТВО: заявка установки постройки.
     ty: 'f' фундамент | 'w' стена | 'c' потолок;
     gx/gz — клетка сетки 3 м, e — край (стены), top — высота
     (только фундамент: высоту палубы считает клиент по рельефу,
     стена/потолок берут высоту фундамента у СЕРВЕРА).
     ✅ v0.4.12: px/pz — ТОЧКА ПРИЦЕЛА (мировые координаты). Сервер
     привязывает постройку к клетке под лучом сам — расхождение
     координат клиент/сервер («старые фундаменты») больше не мешает */
  function sendBplace(ty, gx, gz, e, top, tid, px, pz) {
    if (mode === 'off') return;
    var m = { t: 'bplace', ty: ty, gx: gx, gz: gz };
    if (e !== undefined && e !== null) m.e = e;
    if (top !== undefined && top !== null) m.top = top;
    if (tid) m.tid = tid;
    if (typeof px === 'number' && isFinite(px)) m.px = Math.round(px * 100) / 100;
    if (typeof pz === 'number' && isFinite(pz)) m.pz = Math.round(pz * 100) / 100;
    send(m);
  }
  /* ✅ v0.4.28: + w — id оружия (для меню смерти жертвы: «УБИТ: Garry — Дробовик») */
  function sendPhit(tid, dmg, kind, w) {
    if (mode === 'off') return;
    send({ t: 'phit', tid: tid, dmg: Math.max(1, Math.floor(dmg || 1)),
      kind: kind || 'shot', w: String(w || '') });
  }
  /* ✅ v0.4.22 СУНДУК: установка, открытие, кладка, взятие, анимация крышки */
  function sendChestPlace(x, z, y, rot, tid) {
    if (mode === 'off') return;
    var m = { t: 'chplace', x: Math.round(x * 100) / 100,
      z: Math.round(z * 100) / 100, y: Math.round(y * 100) / 100,
      rot: Math.round(rot * 100) / 100 };
    if (tid) m.tid = tid;
    send(m);
  }
  function sendChestOpen(id) {
    if (mode === 'off') return;
    send({ t: 'chestopen', id: id });
  }
  function sendChestPut(id, item, amt) {
    if (mode === 'off') return;
    send({ t: 'chestput', id: id, item: item, amt: amt });
  }
  function sendChestTake(id, item, amt, tid) {
    if (mode === 'off') return;
    var m = { t: 'chesttake', id: id, item: item, amt: amt };
    if (tid) m.tid = tid;
    send(m);
  }
  function sendChestAnim(id, open) {
    if (mode === 'off') return;
    send({ t: 'chestanim', id: id, open: open ? 1 : 0 });
  }
  function sendRespawn() {
    if (mode === 'off') return;
    send({ t: 'prespawn' });
  }

  /** снимок мира конкретному игроку (режим вкладок) */
  function sendWorldTo(toId, snapshot) {
    snapshot.t = 'world';
    snapshot.to = toId;
    send(snapshot);
  }

  return {
    get NAME() { return NAME; },   // ✅ v0.3.4: живой ник (не снимок на момент загрузки)
    COLOR: COLOR,
    connect: connect,
    disconnect: disconnect,
    tick: tick,
    sendState: sendState,
    /* ✅ v0.3.8: send экспортирован — им пользовались objLocalDamage и
       tryPickup в режиме вкладок, из-за отсутствия функции игра падала
       с «BrixNet.send is not a function» и БОЧКИ НЕ ЛОМАЛИСЬ */
    send: send,
    sendHit: sendHit,
    sendBhit: sendBhit,
    sendBtake: sendBtake,
    sendCbOpen: sendCbOpen,
    sendCbTake: sendCbTake,
    sendCbPut: sendCbPut,
    /* ✅ v0.4.5: бой — звук/попадание/возрождение */
    sendSnd: sendSnd,
    sendPhit: sendPhit,
    sendRespawn: sendRespawn,
    /* ✅ v0.4.6: строительство — заявка установки */
    sendBplace: sendBplace,
    /* ✅ v0.4.22: сундук-хранилище */
    sendChestPlace: sendChestPlace,
    sendChestOpen: sendChestOpen,
    sendChestPut: sendChestPut,
    sendChestTake: sendChestTake,
    sendChestAnim: sendChestAnim,
    sendSocial: sendSocial,
    sendWorldTo: sendWorldTo,
    setStatusEl: setStatusEl,
    on: function (name, fn) { handlers[name] = fn; },
    get mode() { return mode; },
    get serverVer() { return serverVer; },
    get serverSv() { return serverSv; },   // ✅ v0.4.17: для диагностики панели (9)
    get id() { return ID; },
    peersCount: peersCount,
    /* ✅ v0.4.3: список игроков для мини-меню (ник, уровень, BRIX-ID).
       Своя строка всегда первая и помечена self: true */
    getRoster: function () {
      var out = [];
      var now = performance.now();
      for (var k in roster) {
        // в режиме вкладок молчунов старше 5 с выносим (hi идёт раз в секунду)
        if (mode === 'tabs' && now - (roster[k].last || 0) > 5000) continue;
        out.push(roster[k]);
      }
      out.push({ id: ID, n: NAME, c: COLOR, lvl: ownLvl(), aid: ownAid(), self: true });
      out.sort(function (a, b) {
        if (a.self) return -1;
        if (b.self) return 1;
        return String(a.n || '').localeCompare(String(b.n || ''), 'ru');
      });
      return out;
    }
  };
})();
