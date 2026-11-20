// ============================================================
//  brix • js/game/adminpanel.js
//  ✅ v0.4.52 ПАНЕЛЬ РАЗРАБОТЧИКА (клавиша 9) — ТОЛЬКО для ID
//  владельца сервера. Сервер подтверждает админа по BRIX-ID
//  аккаунта (сообщение adminon после welcome) и ПРОВЕРЯЕТ каждую
//  команду — клиентский флаг включает только интерфейс.
//
//  ✅ v0.4.52 НОВОЕ:
//   · ПОГОДА И ВРЕМЯ — СИГНАЛЫ СЕРВЕРУ: кнопки ЯСНО/ХМУРО и
//     РАССВЕТ/ДЕНЬ/ЗАКАТ/СУМЕРКИ/НОЧЬ — сервер меняет своё
//     состояние (envState), сразу рассылает всем 'dnc' и
//     объявление 'atoast' («Админ сменил погоду: …»), пишет
//     world-env.json — всё переживает рестарт. Переход плавный:
//     тучи собираются/солнце гаснет мягко, без скачков;
//   · ПРОХОД СКВОЗЬ СТЕНЫ (noclip): полёт насквозь стен/дверей/
//     окон и любых построек — Space вверх, C вниз (controls.js);
//
//  Функции (в стиле мини-меню/меню игры):
//   · БЕСКОНЕЧНОЕ ХП — урон от игроков не применяется (сервер);
//   · ОТКРЫВАТЬ ЛЮБЫЕ ЗАМКИ — F открывает любую дверь с кодом;
//   · ПРЕДМЕТЫ — взять ЛЮБУЮ вещь в любом количестве (дерево, металл…);
//   · ПОСТРОЙКИ — удалить все постройки на сервере (1 кнопка);
//   · ТЕЛЕПОРТ — на выбранные координаты X/Z;
//   · ИГРОКИ — список всех: телепорт К НЕМУ / ПЕРЕМЕСТИТЬ К СЕБЕ / БАН
//     (бан персистентный: bans.json на сервере, переживает рестарт);
//   · РЕСПАВН ЯЩИКОВ И БОЧЕК — мгновенно, с новым лутом;
//   · УБРАТЬ ВСЕ ДРОПЫ — очистить выпавшие предметы;
//   · СКОРОСТЬ ×2 — переключатель бега.
//
//  Пока панель открыта — управление стоит, рендер и сеть ЖИВУТ
//  (как у мини-меню на M). Повторное нажатие 9 или ESC — закрыть.
// ============================================================
window.BrixAdmin = (function () {
  'use strict';

  var opts = null;            // { getPos, tp } — от gameworld.js
  var root = null;            // слой панели
  var enabled = false;        // сервер подтвердил админа (adminon)
  var open = false;
  var god = false;            // бесконечное ХП
  var masterkey = false;      // открывать любые замки
  var speedOn = false;        // скорость ×2
  var rosterTimer = null;
  var toastOnce = false;
  var hintShown = false;     // ✅ v0.4.16: подсказка «почему 9 молчит»

  function t() { return window.BrixState ? BrixState.data.lang : 'ru'; }
  function ru(en) { return t() === 'en' ? en : arguments[1] || en; }

  function toast(msg, secs) {
    if (window.BrixHud && window.BrixGame &&
        BrixGame.state.phase === 'playing') {
      BrixHud.toast(msg, secs || 4);
    } else if (window.BrixToast) {
      BrixToast.toast({ description: msg });
    }
  }

  function sendOp(op, extra) {
    var m = { t: 'admin', op: op };
    if (extra) for (var k in extra) m[k] = extra[k];
    try { window.BrixNet && BrixNet.send(m); } catch (e) {}
  }

  /* ✅ v0.4.16: свой BRIX-ID — из ростера (своя строка self:true)
     заполняется и БЕЗ сервера: net.js кладёт её из профиля */
  function ownAid() {
    try {
      var ros = window.BrixNet ? BrixNet.getRoster() : [];
      for (var i = 0; i < ros.length; i++) {
        if (ros[i].self) return String(ros[i].aid || '');
      }
    } catch (e) {}
    return '';
  }

  /* Нажал 9, а панель не открылась? Раньше это молчало — теперь
     один раз за сессию показываем ТОЧНУЮ причину. Три случая:
     1) игра ВООБЩЕ без сервера (WS не открылся — режим «вкладки»);
     2) сервер СТАРЫЙ (server.js до v0.4.15 — панели в нём нет);
     3) сервер новый, но ID не подтвердил (admins.json не в той папке
        или сервер не перезапущен) — /status покажет правду.
     Показываем только в «чистой» игре (не в меню, не в инвентаре,
     не при вводе кода замка — там 9 это цифра кода!) */
  function maybeHint(e) {
    if (hintShown) return;
    if (!e || (e.code !== 'Digit9' && e.code !== 'Numpad9')) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (!window.BrixGame || BrixGame.state.phase !== 'playing') return;
    if (window.BrixBuilding && BrixBuilding.isUiBlocked &&
        BrixBuilding.isUiBlocked()) return;
    if (blockedByOtherUi()) return;
    hintShown = true;
    var id = ownAid();
    var mode = window.BrixNet ? BrixNet.mode : 'off';
    if (mode !== 'server') {
      toast('Панель работает ТОЛЬКО на своём сервере. Сейчас игра БЕЗ ' +
        'сервера (режим «вкладки»): запусти START-MULTIPLAYER.bat и ' +
        'подключись к серверу в меню. Твой BRIX-ID: ' + (id || 'нет'), 14);
      return;
    }
    if (!window.BrixNet.serverSv) {
      toast('Ты на сервере, но server.js СТАРЫЙ (панели в нём нет). Скопируй ' +
        'новый server.js в папку сервера и ПЕРЕЗАПУСТИ его: закрой чёрное ' +
        'окно сервера и запусти заново. Твой BRIX-ID: ' + (id || 'нет') +
        ' — он верный', 14);
      return;
    }
    toast('Сервер v' + BrixNet.serverSv + ' работает, но не подтвердил твой ID. ' +
      'Открой в браузере http://' + (location.hostname || 'localhost') +
      ':8787/status — там папка сервера и его список админов. Твой ' +
      'BRIX-ID: ' + (id || 'нет'), 14);
  }

  /* ============================================================
     СЕТЬ: подтверждение админа, результаты команд, телепорт, бан
     (типы сообщений только для панели — слоты свободны)
     ============================================================ */
  if (window.BrixNet) {
    BrixNet.on('adminon', function () {
      enabled = true;
      if (!toastOnce) {
        toastOnce = true;
        toast(ru('Developer panel ready — press 9',
          'Панель разработчика готова — клавиша 9'), 6);
      }
    });
    BrixNet.on('adeny', function (msg) {
      /* ✅ v0.4.23: РАЗНЫЕ причины отказа — разный текст.
         why='unknown'  -> на сервере СТАРЫЙ server.js (команды 'god' там
                           ещё нет; он и бессмертие защищал по-старому)
         why='notadmin' -> сервер новый, но твой BRIX-ID не в admins.json
                           (или сервер не перезапущен после правки)
         без why        -> тоже «не админ» (очень старый server.js) */
      var sv = (window.BrixNet && BrixNet.serverSv) || '';
      if (msg && msg.why === 'unknown') {
        toast('Команду отклонил СТАРЫЙ server.js' + (sv ? ' (v' + sv + ')' : '') +
          ': в нём ещё нет тумблера бессмертия. Замени server.js на новый и ' +
          'ОБЯЗАТЕЛЬНО ПЕРЕЗАПУСТИ сервер: закрой чёрное окно (Ctrl+C) и запусти ' +
          'заново — в шапке окна должно быть «BRIX server v' +
          (window.BRIX_VER || '0.4.23') + '»', 14);
      } else if (msg && msg.why === 'notadmin') {
        toast('Сервер не подтвердил тебя как АДМИНА: впиши свой BRIX-ID в ' +
          'admins.json (рядом с server.js) и перезапусти сервер. Проверить: ' +
          'открой в браузере http://' + (location.hostname || 'localhost') +
          ':8787/status — там папка сервера и список админов', 14);
      } else {
        toast(ru('Server denied the admin command',
          'Сервер отклонил команду админа'), 5);
      }
    });
    BrixNet.on('aok', function (msg) {
      if (msg && msg.info) toast(msg.info, 6);
      if (open && msg.op === 'ban') renderRoster();
    });
    BrixNet.on('atp', function (msg) {
      if (!opts || typeof opts.tp !== 'function') return;
      opts.tp(msg.x, msg.z);
      toast(ru('Teleport: ' + Math.round(msg.x) + ' : ' + Math.round(msg.z),
        'Телепорт: ' + Math.round(msg.x) + ' : ' + Math.round(msg.z)), 4);
    });
    BrixNet.on('banned', function (msg) {
      toast(ru('This account is BANNED on the server',
        'Этот аккаунт ЗАБАНЕН на сервере'), 8);
      try { window.BrixNet && BrixNet.disconnect(); } catch (e) {}
    });
    BrixNet.on('dclr', function () {
      try { window.BrixProps && BrixProps.clearDrops(); } catch (e) {}
    });
  }

  /* ============================================================
     ДОМ: создаётся лениво, один раз. Стиль — как панель списка
     игроков мини-меню (brix-mm-list): тёмный, blur, Oswald
     ============================================================ */

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function secTitle(txt) {
    return el('div', 'bap-sec-title font-h', txt);
  }

  /** переключатель ВКЛ/ВЫКЛ (активный — ржаво-оранжевый) */
  function toggleBtn(label, get, set) {
    var b = el('button', 'bap-toggle font-h');
    function paint() {
      b.textContent = label + ': ' + (get() ? 'ВКЛ' : 'ВЫКЛ');
      b.classList.toggle('on', !!get());
    }
    b.onclick = function () {
      set(!get());
      paint();
      if (window.menuAudio) menuAudio.click();
    };
    paint();
    return b;
  }

  function ensureRoot() {
    if (root) return root;
    root = el('div', 'brix-admin hidden');
    root.id = 'brixAdmin';

    var card = el('div', 'bap-card');
    root.appendChild(card);

    /* шапка */
    var head = el('div', 'bap-head');
    head.appendChild(el('div', 'bap-title font-h', 'PANEL DEVELOPERA'));
    head.appendChild(el('div', 'bap-sub', 'BRIX · v0.4.52 · только для владельца сервера'));
    var x = el('button', 'bap-close');
    x.innerHTML = window.BrixIcon ? BrixIcon('x', 16) : '✕';
    x.onclick = function () { if (window.menuAudio) menuAudio.back(); close(); };
    head.appendChild(x);
    card.appendChild(head);

    /* тело со скроллом */
    var body = el('div', 'bap-body');

    /* ---------- 1. ИГРОК-ФЛАГИ ---------- */
    body.appendChild(secTitle('ВОЗМОЖНОСТИ'));
    var flags = el('div', 'bap-flags');
    flags.appendChild(toggleBtn('БЕСКОНЕЧНОЕ ХП',
      function () { return god; },
      function (v) {
        god = v;
        /* ✅ v0.4.22 ФИКС «ИГРОКИ НЕ УМИРАЮТ»: бессмертие синхронизируется
           с СЕРВЕРОМ — урон не применяется только при включённом тумблере
           (раньше админский BRIX-ID был неуязвим ВСЕГДА, даже во второй
           тест-вкладке с тем же аккаунтом — игроки не умирали).
           ✅ v0.4.52: теперь бессмертие защищает и от УРОНА ОТ ВЫСОТЫ
           (раньше падение с крыши убивало даже с бесконечным ХП) */
        if (window.BrixNet && BrixNet.mode === 'server' && BrixNet.send) {
          BrixNet.send({ t: 'admin', op: 'god', v: v });
        }
        if (v && window.BrixGame && BrixGame.state.phase === 'playing') healSelf();
      }));
    flags.appendChild(toggleBtn('ОТКРЫВАТЬ ЛЮБЫЕ ЗАМКИ',
      function () { return masterkey; },
      function (v) { masterkey = v; }));
    flags.appendChild(toggleBtn('СКОРОСТЬ ×2',
      function () { return speedOn; },
      function (v) { speedOn = v; }));
    /* ✅ v0.4.52 NOCLIP — полёт сквозь стены/двери/окна */
    flags.appendChild(toggleBtn('ПРОХОД СКВОЗЬ СТЕНЫ',
      function () { return !!(window.__brixControls && window.__brixControls.noclip); },
      function (v) {
        if (!window.__brixControls || !window.__brixControls.setNoclip) {
          toast(ru('Enter the world first', 'Сначала войди в игру — мир ещё не построен'), 4);
          return;
        }
        window.__brixControls.setNoclip(v);
        toast(v ? 'NOCLIP ВКЛ — лети сквозь стены/двери/окна. WASD — куда смотришь, Space — вверх, C — вниз'
              : 'NOCLIP ВЫКЛ — стены снова мешают', 7);
      }));
    body.appendChild(flags);

    /* ---------- ✅ v0.4.52 1.5. ПОГОДА И ВРЕМЯ — СИГНАЛЫ СЕРВЕРУ ---------- */
    body.appendChild(secTitle('ПОГОДА И ВРЕМЯ — СИГНАЛЫ СЕРВЕРУ'));
    var wxRow = el('div', 'bap-flags');
    var wxBtns = [
      ['ЯСНО', 'clear', 'Тучи разойдутся, солнце вернётся — у ВСЕХ игроков'],
      ['ХМУРО', 'gloomy', 'Тёмные тучи затянут небо и закроют солнце, пойдёт дождь — у ВСЕХ']
    ];
    wxBtns.forEach(function (p2) {
      var b = el('button', 'bap-btn font-h', p2[0]);
      b.title = p2[2];
      b.onclick = function () {
        if (window.menuAudio) menuAudio.click();
        sendOp('wx', { v: p2[1] });
      };
      wxRow.appendChild(b);
    });
    body.appendChild(wxRow);
    var phRow = el('div', 'bap-flags');
    var phBtns = [
      ['РАССВЕТ', 'dawn'], ['ДЕНЬ', 'day'], ['ЗАКАТ', 'sunset'],
      ['СУМЕРКИ', 'dusk'], ['НОЧЬ', 'night']
    ];
    phBtns.forEach(function (p3) {
      var b3 = el('button', 'bap-btn bap-btn-small font-h', p3[0]);
      b3.title = 'Сервер переведёт время суток на начало фазы «' + p3[0] + '» — у всех игроков';
      b3.onclick = function () {
        if (window.menuAudio) menuAudio.click();
        sendOp('phase', { v: p3[1] });
      };
      phRow.appendChild(b3);
    });
    body.appendChild(phRow);
    body.appendChild(el('div', 'bap-note',
      'Сигнал уходит СЕРВЕРУ — он меняет своё время и погоду и сразу рассылает всем. ' +
      'Переход плавный: тучи собираются и солнце гаснет мягко, небо «проезжает» к новой фазе. ' +
      'Состояние пишется в world-env.json — переживает рестарт сервера.'));

    /* ---------- 2. ПРЕДМЕТЫ ---------- */
    body.appendChild(secTitle('ПРЕДМЕТЫ — ВЗЯТЬ ЛЮБУЮ ВЕЩЬ'));
    var grid = el('div', 'bap-items');
    var ITEMS = (window.BrixInventory && BrixInventory.ITEMS) || {};
    Object.keys(ITEMS).forEach(function (id) {
      var it = ITEMS[id];
      var row = el('div', 'bap-item');
      row.appendChild(el('img', 'bap-item-icon'));
      row.lastChild.src = it.icon || '';
      row.lastChild.alt = it.name || id;
      row.lastChild.draggable = false;
      row.appendChild(el('div', 'bap-item-name', it.name || id));
      var qty = el('input', 'bap-item-qty');
      qty.type = 'number';
      qty.min = '1';
      qty.max = '1000';
      qty.value = it.stackable ? '10' : '1';
      if (!it.stackable) { qty.disabled = true; qty.title = 'Не штабелируется'; }
      row.appendChild(qty);
      var take = el('button', 'bap-btn bap-btn-small', 'ВЗЯТЬ');
      take.onclick = function () {
        var inv = window.BrixInventory && BrixInventory.get();
        if (!inv) return;
        var n = it.stackable ? Math.max(1, Math.min(1000, parseInt(qty.value, 10) || 1)) : 1;
        if (inv.addItem(id, n)) {
          try { inv.showPickup(id, n); } catch (e) {}
          toast('Выдано: ' + n + ' × ' + (it.name || id), 3);
          if (window.menuAudio) menuAudio.click();
        } else {
          toast(ru('No space in inventory', 'Нет места в инвентаре'), 4);
        }
      };
      row.appendChild(take);
      grid.appendChild(row);
    });
    body.appendChild(grid);

    /* ---------- 3. ПОСТРОЙКИ ---------- */
    body.appendChild(secTitle('СЕРВЕР: ПОСТРОЙКИ'));
    var wipe = el('button', 'bap-btn bap-btn-danger font-h', 'УДАЛИТЬ ВСЕ ПОСТРОЙКИ');
    var wipeArm = null;
    wipe.onclick = function () {
      if (window.menuAudio) menuAudio.click();
      if (!wipeArm) {   // двухшаговое подтверждение — случайный клик не снесёт дома
        wipeArm = setTimeout(function () {
          wipeArm = null;
          wipe.textContent = 'УДАЛИТЬ ВСЕ ПОСТРОЙКИ';
          wipe.classList.remove('armed');
        }, 3000);
        wipe.textContent = 'ТОЧНО? НАЖМИ ЕЩЁ РАЗ';
        wipe.classList.add('armed');
        return;
      }
      clearTimeout(wipeArm); wipeArm = null;
      wipe.textContent = 'УДАЛИТЬ ВСЕ ПОСТРОЙКИ';
      wipe.classList.remove('armed');
      sendOp('wipebuilds');
    };
    body.appendChild(wipe);
    body.appendChild(el('div', 'bap-note',
      'Фундаменты, стены, окна, двери и потолки ВСЕХ игроков. ' +
      'Лут, бочки и дропы не трогаются. У игроков дом уберётся сам.'));

    /* ---------- 4. ТЕЛЕПОРТ ---------- */
    body.appendChild(secTitle('ТЕЛЕПОРТ ПО КООРДИНАТАМ'));
    var tpRow = el('div', 'bap-tprow');
    var inX = el('input', 'bap-tp-in');
    var inZ = el('input', 'bap-tp-in');
    inX.type = 'number'; inX.placeholder = 'X'; inX.step = '1';
    inZ.type = 'number'; inZ.placeholder = 'Z'; inZ.step = '1';
    tpRow.appendChild(inX); tpRow.appendChild(inZ);
    var here = el('button', 'bap-btn bap-btn-small', 'ГДЕ Я');
    here.title = 'Подставить текущие координаты';
    here.onclick = function () {
      if (opts && opts.getPos) {
        var pos = opts.getPos();
        inX.value = Math.round(pos.x);
        inZ.value = Math.round(pos.z);
      }
    };
    tpRow.appendChild(here);
    body.appendChild(tpRow);
    var tpBtn = el('button', 'bap-btn font-h', 'ТЕЛЕПОРТИРОВАТЬСЯ');
    tpBtn.onclick = function () {
      if (window.menuAudio) menuAudio.click();
      var x = parseInt(inX.value, 10), z = parseInt(inZ.value, 10);
      if (!isFinite(x) || !isFinite(z)) {
        toast(ru('Enter X and Z', 'Введи X и Z'), 4);
        return;
      }
      sendOp('tp', { x: x, z: z });
    };
    body.appendChild(tpBtn);

    /* ---------- 5. ИГРОКИ ---------- */
    body.appendChild(secTitle('ИГРОКИ НА СЕРВЕРЕ'));
    var rosterBox = el('div', 'bap-roster');
    body.appendChild(rosterBox);

    /* ---------- 6. МИР: ящики и дропы ---------- */
    body.appendChild(secTitle('МИР: ЯЩИКИ И ДРОПЫ'));
    var rsp = el('button', 'bap-btn font-h', 'РЕСПАВН ЯЩИКОВ И БОЧЕК');
    rsp.title = 'Все ящики и бочки вернутся с НОВЫМ лутом — у всех игроков сразу';
    rsp.onclick = function () {
      if (window.menuAudio) menuAudio.click();
      sendOp('respawn');
    };
    body.appendChild(rsp);
    var dcl = el('button', 'bap-btn font-h', 'УБРАТЬ ВСЕ ДРОПЫ');
    dcl.style.marginTop = '8px';
    dcl.title = 'Убрать с земли все выпавшие предметы (скрап/метал/труба)';
    dcl.onclick = function () {
      if (window.menuAudio) menuAudio.click();
      sendOp('cleardrops');
    };
    body.appendChild(dcl);

    /* ---------- 7. ✅ v0.4.25 СКИНЫ (ТЕСТ) ----------
       Скины оружия: пока ТОЛЬКО отсюда, для теста.
       В магазин скинов (меню игры) скин НЕ добавляется. */
    body.appendChild(secTitle('СКИНЫ (ТЕСТ — В МАГАЗИНЕ НЕТ)'));
    var skinBox = el('div', 'bap-skins');
    body.appendChild(skinBox);
    body.appendChild(el('div', 'bap-note',
      'Надеть/снять скин. Пока он надет — железная кирка выглядит «Ретро» ' +
      'в руках и в инвентаре. В магазине скинов его НЕТ — это тест.'));
    paintSkins();

    function paintSkins() {
      skinBox.innerHTML = '';
      var list = (window.BrixWeaponSkins && BrixWeaponSkins.list()) || [];
      if (!list.length) {
        skinBox.appendChild(el('div', 'bap-note', 'Скинов пока нет.'));
        return;
      }
      list.forEach(function (sk) {
        var it = (window.BrixInventory && BrixInventory.ITEMS[sk.item]) || {};
        var isOn = window.BrixWeaponSkins && !!BrixWeaponSkins.equipped(sk.item);
        var nm = (BrixState.data.lang === 'en') ? (sk.name.en || sk.name.ru) : (sk.name.ru || sk.name.en);
        var row = el('div', 'bap-skin' + (isOn ? ' on' : ''));
        var ico = el('img', 'bap-skin-ico');
        ico.src = sk.icon; ico.alt = nm; ico.draggable = false;
        row.appendChild(ico);
        var mid = el('div', 'bap-skin-mid');
        mid.appendChild(el('div', 'bap-skin-name', nm));
        mid.appendChild(el('div', 'bap-skin-item', 'на предмет: ' + (it.name || sk.item)));
        row.appendChild(mid);
        var btn = el('button', 'bap-btn bap-btn-small font-h', isOn ? 'СНЯТЬ' : 'НАДЕТЬ');
        btn.onclick = function () {
          if (window.menuAudio) menuAudio.click();
          if (!window.BrixWeaponSkins) return;
          if (isOn) {
            BrixWeaponSkins.unequipItem(sk.item);
            toast('Скин снят: ' + nm, 4);
          } else {
            BrixWeaponSkins.setEquip(sk.id);
            toast('Скин надет: ' + nm + ' — выбери железную кирку в хотбаре (клавиша 5)', 6);
          }
          paintSkins();   // перерисовать кнопки
        };
        row.appendChild(btn);
        skinBox.appendChild(row);
      });
    }

    card.appendChild(body);

    document.body.appendChild(root);
    return root;
  }

  /* ---------- список игроков (обновляется, пока панель открыта) ---------- */

  function renderRoster() {
    if (!root || !open) return;
    var box = root.querySelector('.bap-roster');
    if (!box) return;
    box.innerHTML = '';
    var ros = [];
    try { ros = window.BrixNet ? BrixNet.getRoster() : []; } catch (e) {}
    if (!ros.length) {
      box.appendChild(el('div', 'bap-roster-empty', 'Список пуст (одиночная игра?)'));
      return;
    }
    ros.forEach(function (pl) {
      var row = el('div', 'bap-pl' + (pl.self ? ' self' : ''));
      row.appendChild(el('div', 'bap-pl-nick',
        (pl.n || '???') + (pl.self ? ' <i>— это ты</i>' : '')));
      row.appendChild(el('div', 'bap-pl-id', pl.aid || 'без BRIX-ID'));
      if (!pl.self) {
        var acts = el('div', 'bap-pl-acts');
        var mk = function (txt, title, fn, danger) {
          var b = el('button', 'bap-btn bap-btn-small' + (danger ? ' bap-btn-danger' : ''), txt);
          b.title = title;
          b.onclick = function () { if (window.menuAudio) menuAudio.click(); fn(b); };
          return b;
        };
        acts.appendChild(mk('К НЕМУ', 'Телепортироваться к игроку', function () {
          sendOp('tpto', { tid: pl.id });
        }));
        acts.appendChild(mk('СЮДА', 'Переместить игрока к себе', function () {
          sendOp('bring', { tid: pl.id });
        }));
        var banArm = null;
        acts.appendChild(mk('БАН', 'Забанить аккаунт (персистентно)', function (b) {
          if (!banArm) {
            banArm = setTimeout(function () {
              banArm = null;
              b.textContent = 'БАН';
              b.classList.remove('armed');
            }, 3000);
            b.textContent = 'ТОЧНО?';
            b.classList.add('armed');
            return;
          }
          clearTimeout(banArm); banArm = null;
          b.textContent = 'БАН';
          b.classList.remove('armed');
          sendOp('ban', { tid: pl.id });
        }, true));
        row.appendChild(acts);
      }
      box.appendChild(row);
    });
  }

  function startRosterTimer() {
    stopRosterTimer();
    renderRoster();
    rosterTimer = setInterval(renderRoster, 1500);
  }
  function stopRosterTimer() {
    if (rosterTimer) { clearInterval(rosterTimer); rosterTimer = null; }
  }

  /* ---------- лечение себя при включении god ---------- */
  function healSelf() {
    try { window.BrixNet && BrixNet.mode === 'server' && BrixNet.send({ t: 'prespawn' }); } catch (e) {}
  }

  /* ============================================================
     ОТКРЫТИЕ/ЗАКРЫТИЕ (как мини-меню: мышь свободна, сеть живёт)
     ============================================================ */

  function blockedByOtherUi() {
    var inv = window.BrixInventory && BrixInventory.get();
    if (inv && inv.isOpen) return true;
    if (window.BrixLootMenu && BrixLootMenu.isOpen()) return true;
    if (window.BrixMiniMenu && BrixMiniMenu.isAnyOpen()) return true;
    /* ✅ v0.4.25: крафт-панель (Q) открыта — 9 молчит */
    if (window.BrixCraft && BrixCraft.isOpen()) return true;
    return false;
  }

  function isOpen() { return open; }

  function togglePanel() {
    if (open) { close(); return; }
    openPanel();
  }

  function openPanel() {
    if (open || !enabled || !opts) return;
    if (blockedByOtherUi()) return;
    if (!window.BrixGame || BrixGame.state.phase !== 'playing') return;
    open = true;
    ensureRoot();
    root.classList.remove('hidden');
    renderRoster();
    startRosterTimer();
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) {}
  }

  function close() {
    if (!open) return;
    open = false;
    stopRosterTimer();
    if (root) root.classList.add('hidden');
    // возврат мыши в игру (с повторами — после Esc браузер даёт lock не сразу)
    var tries = 0;
    var retry = function () {
      if (!open || !window.BrixGame || BrixGame.state.phase !== 'playing') return;
      var canvas = document.querySelector('#gameMount canvas');
      if (!canvas || document.pointerLockElement === canvas) return;
      try {
        var p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(function () {
          if (tries < 6) setTimeout(retry, 300);
        });
      } catch (e) {
        if (tries < 6) setTimeout(retry, 300);
      }
      tries++;
    };
    setTimeout(retry, 80);
  }

  /* ============================================================
     КЛАВИАТУРА: 9 — открыть/закрыть, ESC — закрыть
     (панель слушает сама — как мини-меню на M)
     ============================================================ */

  document.addEventListener('keydown', function (e) {
    if (!enabled) { maybeHint(e); return; }   // ✅ v0.4.16: объяснить, почему молчит
    // ввод текста/цифр в полях панели — не перехватываем
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    var playing = window.BrixGame && BrixGame.state.phase === 'playing';
    if (!playing) return;
    // клавиатура кодового замка/перелаз — 9 вводит код, не открывает панель
    if (window.BrixBuilding && BrixBuilding.isUiBlocked && BrixBuilding.isUiBlocked()) return;
    if (e.code === 'Digit9' || e.code === 'Numpad9') {
      if (!open && blockedByOtherUi()) return;
      e.preventDefault();
      if (window.menuAudio) menuAudio.click();
      togglePanel();
    } else if (e.code === 'Escape' && open) {
      e.preventDefault();
      close();
    }
  });

  /* ============================================================
     ПУБЛИЧНОЕ API
     ============================================================ */

  return {
    /** gameworld.js при спавне: { getPos: () => {x,z}, tp: (x,z) } */
    init: function (o) { opts = o || {}; },
    /** флаги читают controls.js (скорость) и building.js (замки) */
    get god() { return god; },
    get masterkey() { return masterkey; },
    get speedOn() { return speedOn; },
    get enabled() { return enabled; },
    isOpen: isOpen,
    open: openPanel,
    close: close,
    /** полный сброс при выходе из мира (gameworld.stop) — сервер
        заново подтвердит админа при следующем входе (adminon) */
    shutdown: function () {
      close();
      /* ✅ v0.4.22: при выходе из мира сообщаем серверу, что бессмертие выключено */
      if (god && window.BrixNet && BrixNet.mode === 'server' && BrixNet.send) {
        BrixNet.send({ t: 'admin', op: 'god', v: false });
      }
      enabled = false;
      toastOnce = false;
      hintShown = false;                     // ✅ v0.4.16: снова подсказать в новом мире
      god = false;
      masterkey = false;
      speedOn = false;
      /* ✅ v0.4.52: noclip выключается вместе с миром */
      try {
        if (window.__brixControls && window.__brixControls.setNoclip) {
          window.__brixControls.setNoclip(false);
        }
      } catch (eNc) {}
      opts = null;
      if (root) { root.classList.add('hidden'); }
    }
  };
})();
