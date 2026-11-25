// ============================================================
//  brix • js/ui/screens.js
//  Экраны меню: домашний, сервера ADMIN, друзья, новости,
//  скины, настройки. Полный перенос из components/screens.
// ============================================================
window.BrixScreens = (function () {
  'use strict';

  // ---------- декоративная «сцена» новости: солнце и холмы ----------
  function newsArt(hue, className) {
    return '<svg viewBox="0 0 320 120" preserveAspectRatio="none" class="' + (className || '') + '" aria-hidden="true">' +
      '<defs><linearGradient id="sky-' + hue + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="hsl(' + hue + ' 30% 14%)"/>' +
      '<stop offset="100%" stop-color="hsl(' + hue + ' 45% 8%)"/></linearGradient></defs>' +
      '<rect width="320" height="120" fill="url(#sky-' + hue + ')"/>' +
      '<circle cx="235" cy="42" r="22" fill="hsl(' + hue + ' 55% 34%)" opacity="0.8"/>' +
      '<path d="M0 92 L70 58 L128 90 L190 50 L250 86 L320 62 L320 120 L0 120 Z" fill="hsl(' + hue + ' 22% 10%)"/>' +
      '<path d="M0 104 L90 78 L180 102 L260 80 L320 96 L320 120 L0 120 Z" fill="hsl(' + hue + ' 18% 6%)"/>' +
      '</svg>';
  }

  function tagColor(tag) {
    switch (tag) {
      case 'update':  return '#cd412f';
      case 'event':   return '#b0642f';
      case 'devblog': return '#5d635c';
      case 'store':   return '#d8a25a';
    }
    return '#cd412f';
  }

  function tagChip(tag) {
    return '<span class="mini-badge tag-chip" style="background:' + tagColor(tag) + '">' +
      BrixState.t('news.tag.' + tag) + '</span>';
  }

  // ================= ДОМАШНИЙ ЭКРАН =================
  function renderHome(layer) {
    var S = BrixState.data;
    /* ✅ v0.5.22: новостная лента ОЧИЩЕНА — если новостей нет,
       «СВЕЖЕЕ В НОВОСТЯХ» не показывается вовсе */
    var latest = BrixData.NEWS && BrixData.NEWS[0];

    if (!latest) {
      layer.innerHTML =
        '<p class="home-hint">' + BrixState.t('home.hint') + '</p>';
      return;
    }

    layer.innerHTML =
      '<p class="home-hint">' + BrixState.t('home.hint') + '</p>' +
      '<button class="news-teaser float-slow">' +
        '<div class="tag">' + BrixState.t('home.teaserTag') + '</div>' +
        '<div class="title">' + latest.title[S.lang] + '</div>' +
        '<div class="excerpt">' + latest.excerpt[S.lang] + '</div>' +
        '<div class="cta">' + BrixState.t('home.teaserCta') + ' &rarr;</div>' +
      '</button>';

    var teaser = layer.querySelector('.news-teaser');
    teaser.onmouseenter = function () { menuAudio.hover(); };
    teaser.onclick = function () {
      menuAudio.click();
      BrixState.setScreen('news');
    };
  }

  // ================= СЕРВЕРА (✅ v0.4.64 СПИСОК ОФИЦИАЛЬНЫХ СЕРВЕРОВ) =================
  // Два реалма: BrixLand (выживание) и BrixPvP (арена). У каждого — свой
  // живой счётчик онлайна (опрос /status своего порта) и свой состав
  // игроков. Карточки «СЛУЖЕБНЫЙ СЕРВЕР»/«Последний сервер» убраны,
  // надписи ADMIN больше нет — вкладка для всех игроков.
  /* ✅ v0.5.23: «через 12 ч 34 м» из миллисекунд — для таймера вайпа */
  function fmtWipe(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    if (h > 0) return BrixState.t('wipe.timer') + ' ' + h + ' ч ' + (m < 10 ? '0' : '') + m + ' м';
    return BrixState.t('wipe.timer') + ' ' + m + ' м';
  }

  function renderServers(layer) {
    var servers = BrixData.SERVERS || [];

    var cards = servers.map(function (srv) {
      var isPvp = srv.mode === 'pvp';
      var isWipe = srv.realm === 'brixwipe';
      var icon = isPvp ? BrixIcon('swords', 24) : BrixIcon('trees', 24);
      var iconStyle = isPvp
        ? 'display:grid;place-items:center;width:48px;height:48px;flex-shrink:0;border:1px solid rgba(205,65,47,.6);background:rgba(205,65,47,.15);color:var(--rust-bright)'
        : 'display:grid;place-items:center;width:48px;height:48px;flex-shrink:0;border:1px solid rgba(94,151,71,.6);background:rgba(94,151,71,.15);color:#8fce6c';
      return (
        '<div class="rust-card server-card" data-server-card="' + srv.id + '">' +
          '<div class="srv-top">' +
            '<div style="display:flex;align-items:center;gap:16px">' +
              '<div style="' + iconStyle + '">' + icon + '</div>' +
              '<div>' +
                '<div class="srv-title-row">' +
                  '<span class="mini-badge">' + BrixState.t(srv.modeKey || 'srv.mode.vanilla') + '</span>' +
                  '<h3 class="srv-name font-h">' + srv.name + '</h3>' +
                '</div>' +
                '<div class="srv-meta">' +
                  '<span><span class="ic">' + BrixIcon('globe', 13) + '</span>' + srv.map + '</span>' +
                  '<span><span class="ic">' + BrixIcon('map', 13) + '</span>' + srv.size + '</span>' +
                  '<span><span class="ic">' + BrixIcon('users', 13) + '</span><span data-srv-online="' + srv.id + '">…</span></span>' +
                  /* ✅ v0.5.11: пинг карточки — РЕАЛЬНЫЙ (RTT /status),
                     фейковые 12 ms из servers.js больше не показываются */
                  '<span class="good"><span>' + BrixIcon('signal', 13) + '</span><span data-srv-ping="' + srv.id + '">—</span></span>' +
                  /* ✅ v0.5.23: ВАЙП-МИР — таймер «ВАЙП ЧЕРЕЗ …» (пользователь:
                     «чтобы было написано когда будет вайп, через сколько часов —
                     чтобы не гадать») */
                  (isWipe
                    ? '<span class="good"><span>' + BrixIcon('clock', 13) + '</span><span data-srv-wipe="' + srv.id + '">—</span></span>'
                    : '') +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="srv-status">' +
              '<span class="ping-dot"></span>' +
              '<span class="st" data-srv-state="' + srv.id + '">' + BrixState.t('srv.online') + '</span>' +
              '<button class="btn-rust-primary" data-connect="' + srv.id + '">' + BrixState.t('srv.connect') + '</button>' +
            '</div>' +
          '</div>' +
          /* ✅ v0.5.12: подсказки в вкладке СЕРВЕРА УБРАНЫ вовсе —
             «фичи»-галочки, описание и строка «выберите сервер…»
             (подсказки остались только на экране загрузки игры) */
          '<div class="srv-roster" data-roster="' + srv.id + '"></div>' +
        '</div>');
    }).join('');

    layer.innerHTML =
      '<div class="screen-panel">' +
        '<div class="panel-head">' +
          '<div>' +
            '<h2 class="font-h">' + BrixState.t('srv.title') + '</h2>' +
            '<p class="subtitle">' + BrixState.t('srv.subtitle') + '</p>' +
          '</div>' +
          '<div class="head-right">' +
            '<button class="close-btn" data-close>' + BrixIcon('x', 17) + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="panel-body rust-scroll">' +
          '<div class="srv-wrap">' + cards + '</div>' +
        '</div>' +
      '</div>';

    bindClose(layer);

    /* ✅ v0.5.9: опрос НЕ-основных серверов (PvP 8788) стартует ТОЛЬКО
       когда игрок сам открыл экран «СЕРВЕРА» — из главного меню 8788
       не долбится каждые 3 с (Dev Tunnels без куки давал сотни
       CORS-ошибок в консоли) */
    if (window.BrixFriends && BrixFriends.watchPort) {
      servers.forEach(function (srv) {
        if (Number(srv.port) !== 8787) BrixFriends.watchPort(srv.port);
      });
    }

    /* ПОДКЛЮЧИТЬСЯ: lastServer + connect (сервер сам выберет порт) */
    servers.forEach(function (srv) {
      var btn = layer.querySelector('[data-connect="' + srv.id + '"]');
      if (!btn) return;
      btn.onmouseenter = function () { menuAudio.hover(); };
      btn.onclick = function () {
        menuAudio.click();
        BrixState.setLastServer(srv.id);
        BrixGame.connect(srv.id);
      };
    });

    /* ЖИВЫЕ счётчики ОБОИХ серверов: опрос /status каждого реалма
       каждые 4 секунды. Счётчик свой у каждого сервера. */
    var pp = function (n) { return window.BrixFriends ? BrixFriends.pluralPeople(n, BrixState.data.lang) : '?'; };
    function drawAll() {
      servers.forEach(function (srv) {
        var info = window.BrixFriends ? BrixFriends.serverInfo(srv.port) : { ok: false };
        var onlineEl = layer.querySelector('[data-srv-online="' + srv.id + '"]');
        var stateEl = layer.querySelector('[data-srv-state="' + srv.id + '"]');
        var pingEl = layer.querySelector('[data-srv-ping="' + srv.id + '"]');
        var cardEl = layer.querySelector('[data-server-card="' + srv.id + '"]');
        var connectBtn = layer.querySelector('[data-connect="' + srv.id + '"]');
        var rosterEl = layer.querySelector('[data-roster="' + srv.id + '"]');
        if (!onlineEl || !rosterEl) return;
        /* ✅ v0.5.11: УМНАЯ ПРОВЕРКА СЕРВЕРОВ. Порт не запущен →
           карточка серая, статус «НА ОБСЛУЖИВАНИИ», кнопка входа
           ЗАБЛОКИРОВАНА (проб запустили при загрузке меню — probeAll) */
        var down = !info.ok;
        if (cardEl) cardEl.classList.toggle('srv-down', down);
        if (connectBtn) connectBtn.disabled = down;
        if (down) {
          onlineEl.textContent = BrixState.t('srv.offline');
          if (stateEl) stateEl.textContent = BrixState.t('srv.maintenance');
          if (pingEl) pingEl.textContent = '—';
          rosterEl.innerHTML = '<div class="srv-roster-cap font-h">' + BrixIcon('users', 13) +
            ' ' + BrixState.t('srv.roster') + '</div><div class="srv-nobody">' +
            BrixState.t('srv.maintenance') + '</div>';
          return;
        }
        /* ✅ v0.5.11: живой сервер — РЕАЛЬНЫЙ пинг (RTT последнего
           /status), вместо фиксированных 12 ms */
        if (pingEl) {
          pingEl.textContent = (info.ms !== undefined && info.ms !== null)
            ? info.ms + ' ms' : '—';
        }
        /* ✅ v0.5.23: ТАЙМЕР ВАЙПА на карточке BrixWipe — сколько
           часов/минут осталось, обновляется с каждым /status */
        var wipeEl = layer.querySelector('[data-srv-wipe="' + srv.id + '"]');
        if (wipeEl) {
          wipeEl.textContent = (typeof info.wipeIn === 'number')
            ? fmtWipe(info.wipeIn) : '—';
        }
        if (stateEl) stateEl.textContent = BrixState.t('srv.online');
        onlineEl.textContent = info.players + '/' + (info.max || srv.max || 64) + ' — ' +
          info.players + ' ' + pp(info.players) + ' ' + BrixState.t('srv.onlineWord');
        var names = info.names || [];
        var html = '<div class="srv-roster-cap font-h">' + BrixIcon('users', 13) +
          ' ' + BrixState.t('srv.roster') + ' — ' + names.length + ' ' + pp(names.length) + '</div>';
        if (names.length) {
          html += '<div class="srv-roster-list">' + names.map(function (n) {
            return '<span class="srv-player"><span class="sp-dot"></span>' + n + '</span>';
          }).join('') + '</div>';
        } else {
          html += '<div class="srv-nobody">' + BrixState.t('srv.nobody') + '</div>';
        }
        rosterEl.innerHTML = html;
      });
    }
    drawAll();
    var srvTimer = setInterval(function () {
      if (!document.body.contains(layer)) { clearInterval(srvTimer); return; }
      drawAll();
    }, 4000);
  }

  // ================= ДРУЗЬЯ (v0.3.3: 3 под-вкладки + соцсеть) =================
  function avatarHue(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return h;
  }

  var frTab = 'friends';   // текущая под-вкладка: friends | invites | out
  var frGen = 0;           // поколение панели (для отписки живых обработчиков)

  var FR_STATUS_META = {
    server:  { ring: 'ring-in-game', dot: 'dot-in-game' },
    lobby:   { ring: 'ring-online',  dot: 'dot-online'  },
    offline: { ring: 'ring-offline', dot: 'dot-offline' }
  };

  /** строка игрока соцсети; always — кнопки видны всегда (не по ховеру) */
  function socialRow(f, status, statusText, actionsHtml, always) {
    var hue = avatarHue(f.name);
    var meta = FR_STATUS_META[status] || FR_STATUS_META.offline;

    var div = document.createElement('div');
    div.className = 'friend-row';
    div.dataset.fid = f.id;
    div.innerHTML =
      '<div class="fr-avatar">' +
        '<div class="circle" style="background:linear-gradient(135deg, hsl(' + hue + ' 22% 26%), hsl(' + hue + ' 30% 16%))">' + f.name.slice(0, 1).toUpperCase() + '</div>' +
        '<span class="ring ' + meta.ring + '"></span>' +
        '<span class="dot ' + meta.dot + '"></span>' +
      '</div>' +
      '<div class="fr-info">' +
        '<div class="fr-name-row">' +
          '<span class="fr-name">' + f.name + '</span>' +
          // ✅ v0.3.4: ID показываем только настоящий (BRIX-…), служебные не выводим
          (f.id && String(f.id).indexOf('BRIX-') === 0 ? '<span class="fr-id">' + f.id + '</span>' : '') +
        '</div>' +
        '<div class="fr-status-text">' + statusText + '</div>' +
      '</div>' +
      '<div class="row-action fr-actions' + (always ? ' always' : '') + '">' + actionsHtml + '</div>';
    return div;
  }

  function renderFriends(layer) {
    layer.innerHTML =
      '<div class="screen-panel">' +
        '<div class="panel-head">' +
          '<div>' +
            '<h2 class="font-h">' + BrixState.t('fr.title') + '</h2>' +
            '<p class="subtitle" data-subtitle></p>' +
          '</div>' +
          '<div class="head-right">' +
            '<button class="close-btn" data-close>' + BrixIcon('x', 17) + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="panel-body rust-scroll">' +
          '<div class="fr-wrap">' +
            // ✅ v0.3.3: три под-вкладки сверху
            '<div class="skins-tabs fr-tabs" data-tabs></div>' +
            '<div data-tabbody></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    bindClose(layer);
    var tabsEl = layer.querySelector('[data-tabs]');
    var bodyEl = layer.querySelector('[data-tabbody]');
    var myGen = ++frGen;
    var curRefresh = null;   // ✅ v0.3.4: обновляет ТОЛЬКО список — ввод не сбрасывается
    var myNick = (BrixState.data.settings.nick || '').toLowerCase();

    function so() { return BrixState.data.social; }

    function drawTabs() {
      tabsEl.innerHTML = '';
      /* ✅ v0.4.62: ДВЕ вкладки (просьба игрока) — «ДРУЗЬЯ» и «ВСЕ ИГРОКИ»
         (все, кто играл или играет; у каждого «был N ч назад»).
         Входящие заявки теперь в КОЛОКОЛЬЧИКЕ — там «Принять/Игнорировать».
         Себя из «ВСЕ ИГРОКИ» не показываем — и из счётчика тоже */
      var myId = BrixState.data.profileId;
      var playersN = BrixFriends.allPlayersList().filter(function (p) {
        return p.id !== myId && String(p.name || '').toLowerCase() !== myNick;
      }).length;
      [
        { id: 'friends', key: 'fr.tabs.friends', n: so().friends.length },
        { id: 'players', key: 'fr.tabPlayers',   n: playersN }
      ].forEach(function (tab) {
        var b = document.createElement('button');
        b.className = frTab === tab.id ? 'active' : '';
        b.textContent = BrixState.t(tab.key) + (tab.n ? ' — ' + tab.n : '');
        b.onmouseenter = function () { menuAudio.hover(); };
        b.onclick = function () { menuAudio.click(); frTab = tab.id; drawTabs(); drawBody(); };
        tabsEl.appendChild(b);
      });
    }

    /* ---------- ✅ v0.4.62 ПРОФИЛЬ ИГРОКА ----------
       Клик по игроку (друг или из «ВСЕ ИГРОКИ») → аватар, имя, ID,
       «в сети / был N ч назад» и кнопки ПРИГЛАСИТЬ / УДАЛИТЬ ИЗ ДРУЗЕЙ */
    function socialProfile(p, onRefresh) {
      var back = document.createElement('div');
      back.className = 'overlay';
      back.style.zIndex = 70;
      var isSelf = p.id === BrixState.data.profileId ||
        String(p.name || '').toLowerCase() === myNick;
      var isFriend = so().friends.some(function (f) {
        return f.id === p.id || f.name.toLowerCase() === String(p.name || '').toLowerCase();
      });
      var hue = avatarHue(String(p.name || '?'));
      var st = BrixFriends.statusOf(p);
      var statusText = st === 'offline' && p.ls ? BrixFriends.lastSeenText(p)
        : st === 'server' ? BrixState.t('fr.status.server')
        : st === 'lobby' ? BrixState.t('fr.status.lobby')
        : BrixFriends.lastSeenText(p);

      back.innerHTML =
        '<div class="modal-box rust-card bell-panel rust-scroll">' +
          '<div class="panel-head">' +
            '<h2 class="font-h">' + BrixState.t('fr.profile') + '</h2>' +
            '<button class="close-btn" data-close>' + BrixIcon('x', 17) + '</button>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:14px;padding:6px 4px 12px">' +
            '<div class="fr-ava" style="width:52px;height:52px;font-size:20px;background:hsl(' + hue + ',45%,38%)">' +
              String(p.name || '?').slice(0, 1).toUpperCase() + '</div>' +
            '<div style="min-width:0">' +
              '<div class="fr-name-row"><span class="fr-name" style="font-size:16px">' + (p.name || '?') + '</span></div>' +
              '<div class="fr-status-text">' + statusText + '</div>' +
              '<div class="fr-status-text" style="opacity:0.7">' + BrixState.t('fr.profileId') + ': ' + p.id + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="notif-actions" data-actions></div>' +
        '</div>';

      back.querySelector('[data-close]').onclick = function () { back.remove(); };
      back.onclick = function (e) { if (e.target === back) back.remove(); };

      var act = back.querySelector('[data-actions]');
      function closeAnd(fn) { back.remove(); if (fn) fn(); }
      if (isSelf) {
        act.innerHTML = '<div class="fr-empty" style="padding:4px 0 0">' + BrixState.t('fr.inviteSelf') + '</div>';
      } else if (isFriend) {
        var rb = document.createElement('button');
        rb.className = 'btn-rust danger';
        rb.textContent = BrixState.t('fr.remove');
        rb.onclick = function (e) {
          e.stopPropagation();
          menuAudio.click();
          BrixModals.confirmDialog({
            title: BrixState.t('fr.removeTitle'),
            body: BrixState.t('fr.removeBody', { name: p.name }),
            confirmText: BrixState.t('fr.remove'),
            cancelText: BrixState.t('common.cancel'),
            onConfirm: function () { BrixState.removeFriend(p.id); closeAnd(onRefresh); },
            onCancel: function () {}
          });
        };
        act.appendChild(rb);
      } else {
        var ib = document.createElement('button');
        ib.className = 'btn-rust-primary';
        ib.textContent = BrixState.t('fr.inviteNew');
        ib.onclick = function (e) {
          e.stopPropagation();
          menuAudio.click();
          var res = BrixFriends.invite(p.id.indexOf('srv-') === 0 ? p.name : p.id);
          if (res === 'sent') { menuAudio.buy(); BrixToast.toast({ description: BrixState.t('fr.inviteSentTo', { name: p.name }) }); closeAnd(onRefresh); }
          else if (res === 'dup') { menuAudio.error(); BrixToast.toast({ description: BrixState.t('fr.inviteDup') }); }
          else { menuAudio.error(); BrixToast.toast({ description: BrixState.t('fr.inviteOffline') }); }
        };
        act.appendChild(ib);
      }
      document.body.appendChild(back);
    }

    /* ---------- ВКЛАДКА «ВСЕ ИГРОКИ» (✅ v0.4.62) ----------
       Все, кто играл или играет: имя + «в сети» / «был N ч назад».
       Клик по игроку → профиль (ПРИГЛАСИТЬ / УДАЛИТЬ ИЗ ДРУЗЕЙ) */
    function drawPlayersTab() {
      bodyEl.innerHTML = '<div data-list></div>';
      var listEl = bodyEl.querySelector('[data-list]');

      function redraw() {
        if (myGen !== frGen) return;
        var list = BrixFriends.allPlayersList().filter(function (p) {
          return p.id !== BrixState.data.profileId &&
            String(p.name || '').toLowerCase() !== myNick;
        });
        listEl.innerHTML = '';
        if (!list.length) {
          listEl.innerHTML = '<div class="fr-empty">' + BrixState.t('fr.emptyPlayers') + '</div>';
          return;
        }
        var wrap = document.createElement('div');
        wrap.className = 'fr-list';
        list.forEach(function (p) {
          var isFriend = so().friends.some(function (f) {
            return f.id === p.id || f.name.toLowerCase() === String(p.name || '').toLowerCase();
          });
          var st = BrixFriends.statusOf(p);
          var statusText = BrixFriends.lastSeenText(p) +
            (isFriend ? ' · ' + BrixState.t('fr.tabs.friends') : '');
          var row = socialRow(p, st === 'offline' ? 'offline' : st, statusText, '', false);
          row.style.cursor = 'pointer';
          row.onclick = function (e) {
            if (e.target.closest('button')) return;   // кнопки — сами
            menuAudio.click();
            socialProfile(p, redraw);
          };
          wrap.appendChild(row);
        });
        listEl.appendChild(wrap);
      }
      curRefresh = redraw;
      redraw();
    }

    /* ---------- ВКЛАДКА «ДРУЗЬЯ» ----------
       ✅ v0.3.4: поиск ТОЛЬКО здесь (префиксный: «б» → все на «б»,
       «бо» → на «бо»…), ввод НЕ сбрасывается (перерисовывается
       только список), найденные игроки — с кнопкой ПРИГЛАСИТЬ. */
    function drawFriendsTab() {
      bodyEl.innerHTML =
        '<div class="fr-controls">' +
          '<div class="fr-search">' + BrixIcon('search', 15) +
            '<input class="rust-input" data-search placeholder="' + BrixState.t('fr.search') + '">' +
          '</div>' +
        '</div>' +
        '<div data-list></div>';
      var listEl = bodyEl.querySelector('[data-list]');
      var searchInput = bodyEl.querySelector('[data-search]');

      function removeFriendRow(f, row) {
        row.querySelector('[data-act="remove"]').onclick = function () {
          menuAudio.click();
          BrixModals.confirmDialog({
            title: BrixState.t('fr.removeTitle'),
            body: BrixState.t('fr.removeBody', { name: f.name }),
            confirmText: BrixState.t('fr.remove'),
            cancelText: BrixState.t('common.cancel'),
            onConfirm: function () { BrixState.removeFriend(f.id); },
            onCancel: function () {}
          });
        };
        row.querySelectorAll('button').forEach(function (b) { b.onmouseenter = function () { menuAudio.hover(); }; });
      }

      function friendRowEl(f) {
        var st = BrixFriends.statusOf(f);
        var statusText = st === 'server' ? BrixState.t('fr.status.server')
          : st === 'lobby' ? BrixState.t('fr.status.lobby') : BrixState.t('fr.status.offline');
        var row = socialRow(f, st, statusText,
          '<button title="' + BrixState.t('fr.remove') + '" class="danger" data-act="remove">' + BrixIcon('trash', 14) + '</button>');
        removeFriendRow(f, row);
        /* ✅ v0.4.62: клик по другу → ПРОФИЛЬ (пригласить/удалить) */
        row.style.cursor = 'pointer';
        row.onclick = function (e) {
          if (e.target.closest('button')) return;
          menuAudio.click();
          socialProfile(f, curRefresh);
        };
        return { row: row, st: st };
      }

      function foundRowEl(p) {
        var isSelfTab = p.id === BrixState.data.profileId;
        var row = socialRow(p, 'lobby', isSelfTab ? BrixState.t('fr.selfTab') : BrixState.t('fr.foundPlayer'),
          '<button class="btn-rust-primary" data-act="invite">' + BrixState.t('fr.inviteNew') + '</button>', true);
        row.querySelector('[data-act="invite"]').onclick = function () {
          var res = BrixFriends.invite(p.name);
          if (res === 'sent') { menuAudio.buy(); BrixToast.toast({ description: BrixState.t('fr.inviteSentTo', { name: p.name }) }); }
          else if (res === 'dup') { menuAudio.error(); BrixToast.toast({ description: BrixState.t('fr.inviteDup') }); }
          else if (res === 'self') { menuAudio.error(); BrixToast.toast({ description: BrixState.t('fr.inviteSelf') }); }
          else { menuAudio.error(); BrixToast.toast({ description: BrixState.t('fr.inviteOffline') }); }
          redraw();
        };
        row.querySelectorAll('button').forEach(function (b) { b.onmouseenter = function () { menuAudio.hover(); }; });
        return row;
      }

      function redraw() {
        if (myGen !== frGen) return;
        var q = searchInput.value.trim().toLowerCase();
        var soAll = so();

        // мои друзья: ПРЕФИКС по имени или ID (без запроса — весь список)
        var friends = soAll.friends.filter(function (f) {
          return q ? (f.name.toLowerCase().indexOf(q) === 0 || String(f.id).toLowerCase().indexOf(q) === 0) : true;
        });

        listEl.innerHTML = '';
        if (!friends.length && !q) {
          listEl.innerHTML = '<div class="fr-empty">' + BrixState.t('fr.emptyFriends') + '</div>';
          return;
        }

        var online = [], offline = [];
        friends.forEach(function (f) {
          var e = friendRowEl(f);
          (e.st === 'offline' ? offline : online).push(e.row);
        });

        // ✅ найденные НЕ-друзья (вкладки этого браузера + игроки сервера),
        // у каждого справа кнопка ПРИГЛАСИТЬ — считаем ДО вывода пустых
        // сообщений (found нужен и там)
        var found = [];
        if (q) {
          var known = BrixFriends.knownPlayers();
          for (var key in known) {
            var p = known[key];
            if (p.name.toLowerCase().indexOf(q) !== 0 && String(p.id).toLowerCase().indexOf(q) !== 0) continue;
            // ✅ v0.3.6: вкладку с ТЕМ ЖЕ НИКОМ больше не скрываем —
            // она живая (другая вкладка), её можно найти и пригласить.
            // Но СЕБЯ из серверного ростера (я в игре) не показываем
            if (String(p.id).indexOf('srv-') === 0 && p.name.toLowerCase() === myNick) continue;
            if (soAll.friends.some(function (f) { return f.id === p.id || f.name.toLowerCase() === p.name.toLowerCase(); })) continue;
            if (soAll.outgoing.some(function (f) { return f.id === p.id || f.name.toLowerCase() === p.name.toLowerCase(); })) continue;
            found.push(p);
          }
        }

        if (online.length) {
          var w1 = document.createElement('div');
          w1.className = 'fr-list';
          online.forEach(function (r) { w1.appendChild(r); });
          listEl.appendChild(w1);
        }
        if (offline.length) {
          var h = document.createElement('h3');
          h.className = 'fr-offline-head font-h';
          h.textContent = BrixState.t('fr.offlineSection') + ' — ' + offline.length;
          listEl.appendChild(h);
          var w2 = document.createElement('div');
          w2.className = 'fr-list';
          offline.forEach(function (r) { w2.appendChild(r); });
          listEl.appendChild(w2);
        }
        if (!friends.length && q) {
          var msg = found.length ? BrixState.t('fr.noFriendMatch')
            : BrixState.t('fr.noPlayerMatch', { q: searchInput.value.trim() });
          listEl.innerHTML = '<div class="fr-empty">' + msg + '</div>';
        }

        if (q) {
          if (found.length) {
            var h2 = document.createElement('h3');
            h2.className = 'fr-offline-head font-h';
            h2.textContent = BrixState.t('fr.foundHead') + ' — ' + found.length;
            listEl.appendChild(h2);
            var w3 = document.createElement('div');
            w3.className = 'fr-list';
            found.forEach(function (p) { w3.appendChild(foundRowEl(p)); });
            listEl.appendChild(w3);
          }

          // ✅ v0.3.5: игрока нет в списке — можно пригласить ПО НИКУ:
          // заявка уйдёт через сервер и дойдёт, когда он будет на сервере
          if (searchInput.value.trim().toLowerCase() !== myNick) {
            var hint2 = document.createElement('div');
            hint2.className = 'fr-hint';
            hint2.textContent = BrixState.t('fr.byNameHint', { q: searchInput.value.trim() });
            listEl.appendChild(hint2);
            var w4 = document.createElement('div');
            w4.className = 'fr-list';
            var byName = document.createElement('div');
            byName.className = 'friend-row';
            byName.innerHTML =
              '<div class="fr-ava">' + BrixIcon('user-plus', 16) + '</div>' +
              '<div class="fr-info">' +
                '<div class="fr-name-row"><span class="fr-name">' + BrixState.t('fr.byName', { q: searchInput.value.trim() }) + '</span></div>' +
                '<div class="fr-status-text">' + BrixState.t('fr.byNameSub') + '</div>' +
              '</div>' +
              '<button class="btn-rust-primary" data-act="byname">' + BrixState.t('fr.inviteNew') + '</button>';
            byName.querySelector('[data-act="byname"]').onclick = function () {
              var q2 = searchInput.value.trim();
              var res = BrixFriends.invite(q2);
              if (res === 'sent') { menuAudio.buy(); BrixToast.toast({ description: BrixState.t('fr.inviteSentTo', { name: q2 }) }); }
              else if (res === 'dup') { menuAudio.error(); BrixToast.toast({ description: BrixState.t('fr.inviteDup') }); }
              else if (res === 'self') { menuAudio.error(); BrixToast.toast({ description: BrixState.t('fr.inviteSelf') }); }
              else { menuAudio.error(); BrixToast.toast({ description: BrixState.t('fr.inviteOffline') }); }
              redraw();
            };
            byName.querySelectorAll('button').forEach(function (b) { b.onmouseenter = function () { menuAudio.hover(); }; });
            w4.appendChild(byName);
            listEl.appendChild(w4);
          }
        }
      }
      searchInput.addEventListener('input', redraw);
      curRefresh = redraw;
      redraw();
    }

    /* ---------- ВКЛАДКА «ПРИГЛАШЕНИЯ» (входящие) ---------- */
    function drawInvitesTab() {
      bodyEl.innerHTML = '<div data-list></div>';
      var listEl = bodyEl.querySelector('[data-list]');

      function redraw() {
        if (myGen !== frGen) return;
        var inc = so().incoming;
        listEl.innerHTML = '';
        if (!inc.length) {
          listEl.innerHTML = '<div class="fr-empty">' + BrixState.t('fr.emptyIn') + '</div>';
          return;
        }
        var wrap = document.createElement('div');
        wrap.className = 'fr-list';
        inc.forEach(function (f) {
          var when = BrixFriends.fmtDate(f.at);
          var statusText = BrixState.t('fr.inAt', { d: when });
          var row = socialRow(f, 'lobby', statusText,
            '<button class="btn-rust-primary" data-act="accept">' + BrixState.t('fr.accept') + '</button>' +
            '<button class="btn-rust" data-act="decline">' + BrixState.t('fr.decline') + '</button>', true);
          row.querySelector('[data-act="accept"]').onclick = function () {
            menuAudio.buy(); BrixFriends.accept(f.id, f.name);
          };
          row.querySelector('[data-act="decline"]').onclick = function () {
            menuAudio.back(); BrixFriends.decline(f.id, f.name);
          };
          row.querySelectorAll('button').forEach(function (b) { b.onmouseenter = function () { menuAudio.hover(); }; });
          wrap.appendChild(row);
        });
        listEl.appendChild(wrap);
      }
      curRefresh = redraw;
      redraw();
    }

    /* ---------- ВКЛАДКА «МОИ ПРИГЛАШЕНИЯ» (только список — ✅ v0.3.4) ---------- */
    function drawOutTab() {
      // ✅ v0.3.4: поисковика здесь больше нет — приглашать через поиск
      // во вкладке «ДРУЗЬЯ»; здесь только список отправленных приглашений
      bodyEl.innerHTML =
        '<div class="fr-hint">' + BrixState.t('fr.outHint') + '</div>' +
        '<div data-list></div>';
      var listEl = bodyEl.querySelector('[data-list]');

      function redraw() {
        if (myGen !== frGen) return;
        var out = so().outgoing;
        listEl.innerHTML = '';
        if (!out.length) {
          listEl.innerHTML = '<div class="fr-empty">' + BrixState.t('fr.emptyOut') + '</div>';
          return;
        }
        var wrap = document.createElement('div');
        wrap.className = 'fr-list';
        out.forEach(function (f) {
          var when = BrixFriends.fmtDate(f.at);
          var row = socialRow(f, 'offline', BrixState.t('fr.sentAt', { d: when }),
            '<button class="btn-rust" data-act="cancel">' + BrixState.t('fr.cancelInvite') + '</button>', true);
          row.querySelector('[data-act="cancel"]').onclick = function () {
            menuAudio.back(); BrixFriends.cancelOut(f.id, f.name);
          };
          row.querySelectorAll('button').forEach(function (b) { b.onmouseenter = function () { menuAudio.hover(); }; });
          wrap.appendChild(row);
        });
        listEl.appendChild(wrap);
      }
      curRefresh = redraw;
      redraw();
    }

    function drawBody() {
      curRefresh = null;
      if (frTab === 'friends') drawFriendsTab();
      else drawPlayersTab();      // ✅ v0.4.62: вторая вкладка — ВСЕ ИГРОКИ
      layer.querySelector('[data-subtitle]').textContent = '';
    }

    // живое обновление: соцсобытия приходят из BrixFriends.
    // ✅ v0.3.4: перерисовываем ТОЛЬКО список (drawBody пересоздавал
    // поле поиска — ввод «стирался» каждые 2 секунды)
    function onSocial() {
      if (myGen !== frGen) return;
      drawTabs();
      if (curRefresh) curRefresh();
      else drawBody();
    }
    window.addEventListener('brix-social', onSocial);

    drawTabs();
    drawBody();
  }

  // ================= НОВОСТИ =================
  function renderNews(layer) {
    var S = BrixState.data;
    var featured = BrixData.NEWS && BrixData.NEWS[0];
    var rest = featured ? BrixData.NEWS.slice(1) : [];
    var artHues = [14, 32, 100, 45, 80];

    /* ✅ v0.5.22: лента очищена — аккуратная пустая вкладка вместо падения */
    if (!featured) {
      layer.innerHTML =
        '<div class="screen-panel">' +
          '<div class="panel-head">' +
            '<div>' +
              '<h2 class="font-h">' + BrixState.t('news.title') + '</h2>' +
              '<p class="subtitle">' + BrixState.t('news.subtitle') + '</p>' +
            '</div>' +
            '<div class="head-right">' +
              '<button class="close-btn" data-close>' + BrixIcon('x', 17) + '</button>' +
            '</div>' +
          '</div>' +
          '<div class="panel-body rust-scroll">' +
            '<div class="news-wrap"><div class="fr-empty">Пока новостей нет</div></div>' +
          '</div>' +
        '</div>';
      bindClose(layer);
      return;
    }

    layer.innerHTML =
      '<div class="screen-panel">' +
        '<div class="panel-head">' +
          '<div>' +
            '<h2 class="font-h">' + BrixState.t('news.title') + '</h2>' +
            '<p class="subtitle">' + BrixState.t('news.subtitle') + '</p>' +
          '</div>' +
          '<div class="head-right">' +
            '<button class="close-btn" data-close>' + BrixIcon('x', 17) + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="panel-body rust-scroll">' +
          '<div class="news-wrap">' +
            // избранная новость
            '<article class="rust-card news-featured">' +
              '<button data-article="' + featured.id + '">' +
                '<div class="art">' +
                  newsArt(artHues[0], 'news-art') +
                  '<div class="chips">' + tagChip(featured.tag) + '</div>' +
                  '<div class="date">' + BrixIcon('calendar', 12) + featured.date + '</div>' +
                '</div>' +
                '<div class="body">' +
                  '<h3 class="font-h">' + featured.title[S.lang] + '</h3>' +
                  '<p class="excerpt">' + featured.excerpt[S.lang] + '</p>' +
                  '<span class="read">' + BrixState.t('news.read') + ' &rarr;</span>' +
                '</div>' +
              '</button>' +
            '</article>' +
            // лента
            '<div class="news-list" data-rows></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    bindClose(layer);

    var rows = layer.querySelector('[data-rows]');
    rest.forEach(function (a, i) {
      var btn = document.createElement('button');
      btn.className = 'news-row';
      btn.style.animationDelay = (0.05 + i * 0.05) + 's';
      btn.innerHTML =
        '<div class="thumb">' + newsArt(artHues[(i + 1) % artHues.length]) + '</div>' +
        '<div style="min-width:0;flex:1">' +
          '<div class="meta">' + tagChip(a.tag) +
            '<span class="date">' + BrixIcon('calendar', 11) + a.date + '</span>' +
          '</div>' +
          '<h4>' + a.title[S.lang] + '</h4>' +
          '<p class="excerpt">' + a.excerpt[S.lang] + '</p>' +
        '</div>';
      btn.onmouseenter = function () { menuAudio.hover(); };
      btn.onclick = function () { menuAudio.click(); openArticle(a); };
      rows.appendChild(btn);
    });

    layer.querySelector('[data-article="' + featured.id + '"]').onmouseenter = function () { menuAudio.hover(); };
    layer.querySelector('[data-article="' + featured.id + '"]').onclick = function () {
      menuAudio.click();
      openArticle(featured);
    };

    // прочтено: снять бейдж через 1.2 c (как в оригинале)
    setTimeout(function () {
      BrixState.markNewsSeen(BrixData.NEWS.map(function (n) { return n.id; }));
    }, 1200);
  }

  function openArticle(a) {
    var S = BrixState.data;
    var artHues = [14, 32, 100, 45, 80];
    var idx = BrixData.NEWS.indexOf(a);

    var ov = document.createElement('div');
    ov.className = 'overlay';
    ov.style.zIndex = 75;
    ov.innerHTML =
      '<div class="modal-box rust-card news-reader rust-scroll">' +
        '<button class="back font-h">' + BrixIcon('arrowleft', 14) + BrixState.t('news.back') + '</button>' +
        '<div class="meta">' + tagChip(a.tag) +
          '<span class="date">' + BrixIcon('calendar', 11) + a.date + '</span>' +
        '</div>' +
        '<h2 class="font-h">' + a.title[S.lang] + '</h2>' +
        '<p class="quote">' + a.excerpt[S.lang] + '</p>' +
        '<div class="art">' + newsArt(artHues[idx % artHues.length]) + '</div>' +
        '<div class="paras">' +
          a.body[S.lang].map(function (p) { return '<p>' + p + '</p>'; }).join('') +
        '</div>' +
      '</div>';

    function close() { ov.remove(); }
    ov.querySelector('.back').onmouseenter = function () { menuAudio.hover(); };
    ov.querySelector('.back').onclick = function () { menuAudio.back(); close(); };
    ov.onclick = function (e) { if (e.target === ov) close(); };
    document.body.appendChild(ov);
  }

  // ================= СКИНЫ =================
  // ✅ v0.4.60 СКИНЫ — КОСТЮМЫ НА АККАУНТЕ: покупка ОДИН РАЗ помечает
  // скин «КУПЛЕНО» (state.ownedSkinIds) и НИКОГДА не кладёт предмет в
  // инвентарь. Скин применяется при КРАФТЕ: крафт-меню (Q) → чертёж →
  // клик по иконке предмета → список скинов → выбрал купленный → СКАФТ.
  var RARITY = {
    common:    { color: '#a8b0a6', glow: 'rgba(168,176,166,0.14)' },
    uncommon:  { color: '#7fae62', glow: 'rgba(127,174,98,0.14)' },
    rare:      { color: '#d8a25a', glow: 'rgba(216,162,90,0.16)' },
    epic:      { color: '#cd412f', glow: 'rgba(205,65,47,0.18)' },
    legendary: { color: '#e8c35a', glow: 'rgba(232,195,90,0.2)' }
  };

  var SKIN_TABS = [
    { id: 'all',    labelKey: 'skins.tab.all' },
    { id: 'weapon', labelKey: 'skins.tab.weapon' },
    { id: 'tool',   labelKey: 'skins.tab.tool' }
  ];

  function renderSkins(layer) {
    var S = BrixState.data;
    var curTab = 'all';

    layer.innerHTML =
      '<div class="screen-panel">' +
        '<div class="panel-head">' +
          '<div>' +
            '<h2 class="font-h">' + BrixState.t('skins.title') + '</h2>' +
            '<p class="subtitle">' + BrixState.t('skins.subtitle') + '</p>' +
          '</div>' +
          '<div class="head-right">' +
            '<div class="balance-chip">' +
              BrixIcon('coins', 15) +
              '<span class="val" data-coins>' + S.coins + '</span>' +
              '<span class="cap">' + BrixState.t('skins.balance') + '</span>' +
            '</div>' +
            '<button class="close-btn" data-close>' + BrixIcon('x', 17) + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="panel-body rust-scroll">' +
          '<div style="margin:0 auto;max-width:860px">' +
            '<div class="skins-hint">' + BrixState.t('skins.hint') + '</div>' +
            '<div class="skins-tabs" data-tabs></div>' +
            '<div class="skins-grid" data-grid></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    bindClose(layer);

    var tabsEl = layer.querySelector('[data-tabs]');
    var gridEl = layer.querySelector('[data-grid]');

    function drawTabs() {
      tabsEl.innerHTML = '';
      SKIN_TABS.forEach(function (tab) {
        var b = document.createElement('button');
        b.className = tab.id === curTab ? 'active' : '';
        b.textContent = BrixState.t(tab.labelKey);
        b.onmouseenter = function () { menuAudio.hover(); };
        b.onclick = function () {
          menuAudio.click();
          curTab = tab.id;
          drawTabs();
          drawGrid();
        };
        tabsEl.appendChild(b);
      });
    }

    function drawGrid() {
      var list = ((window.BrixData && BrixData.SKINS) || []).filter(function (s) {
        return curTab === 'all' ? true : s.type === curTab;
      });

      gridEl.innerHTML = '';
      list.forEach(function (skin, i) {
        var r = RARITY[skin.rarity] || RARITY.common;
        var owned = (S.ownedSkinIds || []).indexOf(skin.id) !== -1;

        var card = document.createElement('div');
        card.className = 'rust-card skin-card' + (owned ? ' owned' : '');
        card.style.animationDelay = Math.min(i * 0.04, 0.35) + 's';

        card.innerHTML =
          '<div class="icon-area" data-view style="background:radial-gradient(ellipse at 50% 35%, ' + r.glow + ', rgba(0,0,0,0.35) 75%), rgba(255,255,255,0.03);cursor:pointer" title="' +
            BrixState.t('skins.view3d') + '">' +
            '<img src="' + skin.iconUrl + '" alt="" draggable="false" style="max-width:82%;max-height:82%;object-fit:contain;filter:drop-shadow(0 6px 10px rgba(0,0,0,0.5))">' +
            '<span class="rarity-dot" style="background:' + r.color + ';box-shadow:0 0 8px ' + r.color + '"></span>' +
            (owned ? '<span class="owned-mark font-h">' + BrixState.t('skins.ownedMark') + '</span>' : '') +
          '</div>' +
          '<div class="name">' + (skin.name[S.lang] || skin.name.ru) + '</div>' +
          '<div class="rarity" style="color:' + r.color + '">' + BrixState.t('skins.rarity.' + skin.rarity) + '</div>' +
          '<div class="foot">' +
            '<span class="price">' + (owned ? '' : BrixIcon('coins', 12) + skin.price) + '</span>' +
            (owned
              ? '<button class="btn-rust-primary" disabled>' + BrixState.t('skins.owned') + '</button>'
              : '<button class="btn-rust-primary" data-buy>' + BrixState.t('skins.buy') + '</button>') +
          '</div>';

        card.querySelectorAll('button').forEach(function (b) {
          b.onmouseenter = function () { menuAudio.hover(); };
        });

        /* ✅ v0.4.62: клик по КАРТИНКЕ — 3D-осмотр скина (вращение, покупка) */
        var viewArea = card.querySelector('[data-view]');
        if (viewArea) {
          viewArea.onclick = function () {
            menuAudio.click();
            skinPreview(skin, function () {
              drawGrid();
              var c = layer.querySelector('[data-coins]');
              if (c) c.textContent = BrixState.data.coins;
            });
          };
        }

        var buyBtn = card.querySelector('[data-buy]');
        if (buyBtn) {
          buyBtn.onclick = function () {
            var nm = skin.name[BrixState.data.lang] || skin.name.ru;
            if (BrixState.buySkin(skin.id, skin.price)) {
              menuAudio.buy();
              BrixToast.toast({ description: BrixState.t('skins.bought', { name: nm }) });
              drawGrid();   // карточка сразу становится «КУПЛЕНО»
            } else {
              menuAudio.error();
              BrixToast.toast({ description: BrixState.t('skins.notEnough') });
            }
            layer.querySelector('[data-coins]').textContent = BrixState.data.coins;
          };
        }

        gridEl.appendChild(card);
      });
    }

    drawTabs();
    drawGrid();
  }

  /* ============================================================
     ✅ v0.4.62 3D-ОСМОТР СКИНА В МАГАЗИНЕ (просьба игрока: «нажми на
     скин — он пойдёт в 3D без руки, можно крутить-вертеть и купить»).
     Клик по КАРТИНКЕ скина → модальное окно: настоящая 3D-модель
     предмета (iron_axe.glb / revolver.glb / ...) с надетой обёрткой
     скина, БЕЗ РУК. Тянешь мышью/пальцем — вращается; отпустил —
     медленно крутится сам. Кнопки КУПИТЬ / КУПЛЕНО / ЗАКРЫТЬ.
     ============================================================ */
  var SKIN_MODEL_URL = {
    revolver:    'assets/models/revolver.glb',
    thompson:    'assets/models/thompson.glb',
    c4:          'assets/models/c4.glb',
    stoneAxe:    'assets/models/stone_axe.glb',
    ironPickaxe: 'assets/models/pickaxe.glb',
    ironAxe:     'assets/models/iron_axe.glb'
  };

  function skinPreview(skin, onBought) {
    if (!window.THREE || !window.BrixGLB) return;
    var url = SKIN_MODEL_URL[skin.item];
    if (!url) return;
    var L = BrixState.data.lang === 'en' ? 'en' : 'ru';

    var back = document.createElement('div');
    back.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(8,10,14,0.82);' +
      'display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(3px)';
    var panel = document.createElement('div');
    panel.style.cssText = 'position:relative;width:min(92vw,560px);max-height:92vh;overflow:auto;' +
      'background:linear-gradient(160deg,#26221c,#191712);border:1px solid #4a4034;border-radius:10px;' +
      'box-shadow:0 24px 70px rgba(0,0,0,0.65);padding:14px 16px 16px;font-family:inherit;color:#e8e2d6';
    var r = RARITY[skin.rarity] || RARITY.common;
    var owned = (BrixState.data.ownedSkinIds || []).indexOf(skin.id) !== -1;

    panel.innerHTML =
      '<div style="display:flex;align-items:flex-start;gap:10px">' +
        '<div style="flex:1;min-width:0">' +
          '<div class="font-h" style="font-size:17px">' + (skin.name[L] || skin.name.ru) + '</div>' +
          '<div style="font-size:12px;margin-top:2px;color:' + r.color + '">' +
            BrixState.t('skins.rarity.' + skin.rarity) + ' · ' +
            (owned ? BrixState.t('skins.owned') : (skin.price + ' ' + BrixState.t('skins.balance'))) +
          '</div>' +
        '</div>' +
        '<button data-x style="background:none;border:none;color:#9a927f;cursor:pointer;padding:4px">' + BrixIcon('x', 18) + '</button>' +
      '</div>' +
      '<div data-stage style="position:relative;margin:10px auto 0;border-radius:8px;overflow:hidden;' +
        'background:radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.05), rgba(0,0,0,0.5) 75%);' +
        'border:1px solid rgba(255,255,255,0.08);touch-action:none;cursor:grab">' +
        '<canvas data-cnv style="display:block;width:100%;height:auto"></canvas>' +
      '</div>' +
      '<div style="font-size:11.5px;color:#9a927f;text-align:center;margin-top:6px">' +
        BrixState.t('skins.rotate') + '</div>' +
      '<div style="display:flex;gap:10px;margin-top:10px">' +
        '<button data-buy class="btn-rust-primary font-h" style="flex:1;justify-content:center;display:flex;align-items:center;gap:7px">' +
          (owned ? BrixState.t('skins.owned') : (BrixIcon('coins', 14) + '<span>' + BrixState.t('skins.buy') + ' ' + skin.price + '</span>')) +
        '</button>' +
        '<button data-close class="font-h" style="padding:9px 16px;background:#3a332a;border:1px solid #55483a;' +
          'border-radius:6px;color:#e8e2d6;cursor:pointer">ЗАКРЫТЬ</button>' +
      '</div>';
    back.appendChild(panel);
    document.body.appendChild(back);

    var canvas = panel.querySelector('[data-cnv]');
    var stage = panel.querySelector('[data-stage]');
    var buyBtn = panel.querySelector('[data-buy]');
    var W = 640, H = 640;

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H, false);
    canvas.style.aspectRatio = '1/1';

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(32, 1, 0.01, 20);
    camera.position.set(0.75, 0.42, 2.55);
    camera.lookAt(0, 0, 0);
    scene.add(camera);
    scene.add(new THREE.HemisphereLight(0xdfeaff, 0x3a3f4a, 0.95));
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    var key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(1.8, 2.4, 2.6); scene.add(key);
    var fill = new THREE.DirectionalLight(0xbfd8ff, 0.6);
    fill.position.set(-2, -0.6, 1.4); scene.add(fill);

    var group = new THREE.Group();
    scene.add(group);
    var yaw = 0.8, pitch = -0.22, dragging = false, lastX = 0, lastY = 0, raf = 0, closed = false;
    var prev = performance.now();

    function frame(now) {
      if (closed) return;
      var dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      if (!dragging) yaw += dt * 0.45;              // медленно крутится сам
      group.rotation.set(pitch, yaw, 0, 'YXZ');
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    stage.addEventListener('pointerdown', function (e) {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      stage.style.cursor = 'grabbing';
      try { stage.setPointerCapture(e.pointerId); } catch (eP) {}
    });
    stage.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      yaw += (e.clientX - lastX) * 0.011;
      pitch = Math.max(-1.25, Math.min(1.25, pitch + (e.clientY - lastY) * 0.008));
      lastX = e.clientX; lastY = e.clientY;
    });
    var stopDrag = function () { dragging = false; stage.style.cursor = 'grab'; };
    stage.addEventListener('pointerup', stopDrag);
    stage.addEventListener('pointercancel', stopDrag);

    function close() {
      closed = true;
      cancelAnimationFrame(raf);
      renderer.dispose();
      back.remove();
      document.removeEventListener('keydown', onEsc);
    }
    function onEsc(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onEsc);
    panel.querySelector('[data-x]').onclick = close;
    panel.querySelector('[data-close]').onclick = function () { menuAudio.click(); close(); };
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });

    buyBtn.onclick = function () {
      if ((BrixState.data.ownedSkinIds || []).indexOf(skin.id) !== -1) return;
      if (BrixState.buySkin(skin.id, skin.price)) {
        menuAudio.buy();
        BrixToast.toast({ description: BrixState.t('skins.bought', { name: skin.name[L] || skin.name.ru }) });
        buyBtn.innerHTML = BrixState.t('skins.owned');
        buyBtn.disabled = true; buyBtn.style.opacity = '0.6';
        if (onBought) onBought();
      } else {
        menuAudio.error();
        BrixToast.toast({ description: BrixState.t('skins.notEnough') });
      }
    };
    if (owned) { buyBtn.disabled = true; buyBtn.style.opacity = '0.6'; }

    /* модель: грузим GLB, нормализуем, надеваем обёртку скина */
    BrixGLB.load(url + (url.indexOf('?') < 0 ? '?skinview=1' : ''), function (g) {
      if (closed) return;
      var box = new THREE.Box3().setFromObject(g);
      var size = box.getSize(new THREE.Vector3());
      var c = box.getCenter(new THREE.Vector3());
      var k = 1.25 / (Math.max(size.x, size.y, size.z) || 1);
      g.position.set(-c.x, -c.y, -c.z);
      var inner = new THREE.Group();
      inner.add(g);
      inner.scale.setScalar(k);
      group.add(inner);
      /* обёртка скина поверх базовой текстуры (flipY=false — glTF).
         ✅ v0.4.63 ФИКС «ОБЁРТКА НЕПРАВИЛЬНО СИДИТ»: у большинства
         моделей (revolver.glb и др.) материал metalness=1 — без
         карты металличности металл «съедает» окрас обёртки (в руках
         спасает env-освещение сцены, в витрине его нет). Теперь:
         массивы материалов обрабатываются каждый; если у скина есть
         rough/metal карты — ставим их (как в руках); если нет —
         витринный вид: metalness 0.15 / roughness 0.6 */
      var wrapUrl = (window.BrixWeaponSkins && BrixWeaponSkins.wrapFor(skin.id)) || null;
      var skDef = (window.BrixWeaponSkins && BrixWeaponSkins.def(skin.id)) || null;
      if (wrapUrl) {
        var applyWrap = function (tex, roughTex, metalTex) {
          if (closed) return;
          g.traverse(function (o) {
            if (!o.isMesh || !o.material) return;
            var mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach(function (m) {
              m.map = tex;
              if (m.color) m.color.setHex(0xffffff);
              if (roughTex || metalTex) {
                if (roughTex && 'roughnessMap' in m) { m.roughnessMap = roughTex; m.roughness = 1; }
                if (metalTex && 'metalnessMap' in m) { m.metalnessMap = metalTex; m.metalness = 1; }
              } else {
                if ('roughnessMap' in m) { m.roughnessMap = null; m.roughness = 0.6; }
                if ('metalnessMap' in m) { m.metalnessMap = null; m.metalness = 0.15; }
              }
              m.needsUpdate = true;
            });
          });
        };
        BrixWeaponSkins.getTex(wrapUrl, function (tex) {
          var needR = skDef && skDef.rough, needM = skDef && skDef.metal;
          if (!needR && !needM) { applyWrap(tex, null, null); return; }
          var left = (needR ? 1 : 0) + (needM ? 1 : 0);
          var rT = null, mT = null;
          var doneM = function () { if (--left === 0) applyWrap(tex, rT, mT); };
          if (needR) BrixWeaponSkins.getTex(skDef.rough, function (t) { rT = t; doneM(); });
          if (needM) BrixWeaponSkins.getTex(skDef.metal, function (t) { mT = t; doneM(); });
        });
      }
    }, function () { /* модель не загрузилась — окно остаётся с фоном */ });
  }

  // ================= НАСТРОЙКИ =================
  function renderOptions(layer) {
    var S = BrixState.data;

    layer.innerHTML =
      '<div class="screen-panel">' +
        '<div class="panel-head">' +
          '<div>' +
            '<h2 class="font-h">' + BrixState.t('opt.title') + '</h2>' +
            '<p class="subtitle">' + BrixState.t('opt.subtitle') + '</p>' +
          '</div>' +
          '<div class="head-right">' +
            '<button class="close-btn" data-close>' + BrixIcon('x', 17) + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="panel-body rust-scroll">' +
          '<div class="opt-wrap">' +
            // ГРАФИКА
            '<section class="rust-card opt-section">' +
              '<h3 class="font-h">' + BrixIcon('monitor', 15) + BrixState.t('opt.graphics') + '</h3>' +
              '<div class="rows">' +
                '<div class="opt-row"><span>' + BrixState.t('opt.quality') + '</span>' +
                  '<div class="ctl" data-select="quality"></div></div>' +
                '<div class="opt-row"><span>' + BrixState.t('opt.particles') + '</span>' +
                  '<div class="ctl" data-switch="particles"></div></div>' +
                '<div class="opt-row"><span>' + BrixState.t('opt.parallax') + '</span>' +
                  '<div class="ctl" data-switch="parallax"></div></div>' +
              '</div>' +
            '</section>' +
            // ЗВУК
            '<section class="rust-card opt-section">' +
              '<h3 class="font-h">' + BrixIcon('volume', 15) + BrixState.t('opt.sound') + '</h3>' +
              '<div class="rows">' +
                '<div class="opt-row"><span>' + BrixState.t('opt.soundToggle') + '</span>' +
                  '<div class="ctl" data-switch="sound"></div></div>' +
                '<div class="opt-row"><span>' + BrixState.t('opt.musicVol') + '</span>' +
                  '<div class="ctl" data-slider="musicVol"></div></div>' +
                '<div class="opt-row"><span>' + BrixState.t('opt.sfxVol') + '</span>' +
                  '<div class="ctl" data-slider="sfxVol"></div></div>' +
              '</div>' +
            '</section>' +
            // ИГРА
            '<section class="rust-card opt-section">' +
              '<h3 class="font-h">' + BrixIcon('gamepad', 15) + BrixState.t('opt.game') + '</h3>' +
              '<div class="rows">' +
                '<div class="opt-row"><span>' + BrixState.t('opt.lang') + '</span>' +
                  '<div class="ctl" data-select="lang"></div></div>' +
                '<div class="opt-row"><span>' + BrixState.t('opt.nick') + '</span>' +
                  '<div class="ctl nick-ctl">' +
                    '<span class="cur" data-nick>' + S.settings.nick + '</span>' +
                    '<button class="btn-rust" data-nick-open>' + BrixState.t('opt.nickBtn') + '</button>' +
                  '</div></div>' +
              '</div>' +
            '</section>' +
            '<p class="opt-note">' + BrixState.t('opt.note') + '</p>' +
          '</div>' +
        '</div>' +
      '</div>';

    bindClose(layer);

    // --- селекты ---
    function makeSelect(mount, value, items, onChange) {
      mount.innerHTML =
        '<div class="select">' +
          '<button class="select-btn"><span data-v></span>' + BrixIcon('chevron', 15) + '</button>' +
          '<div class="select-list"></div>' +
        '</div>';
      var box = mount.querySelector('.select');
      var vEl = mount.querySelector('[data-v]');
      var list = mount.querySelector('.select-list');

      function drawVal() {
        var cur = items.find(function (i) { return i.id === value(); });
        vEl.textContent = cur ? cur.label : '';
      }
      items.forEach(function (it) {
        var b = document.createElement('button');
        b.textContent = it.label;
        b.onclick = function () {
          box.classList.remove('open');
          if (it.id !== value()) onChange(it.id);
          drawVal();
          drawSel();
        };
        b.dataset.id = it.id;
        list.appendChild(b);
      });
      function drawSel() {
        list.querySelectorAll('button').forEach(function (b) {
          b.className = b.dataset.id === value() ? 'sel' : '';
        });
      }
      mount.querySelector('.select-btn').onclick = function () {
        box.classList.toggle('open');
      };
      drawVal();
      drawSel();
    }

    var st = function () { return BrixState.data; };

    makeSelect(layer.querySelector('[data-select="quality"]'),
      function () { return st().settings.quality; },
      [
        { id: 'low', label: BrixState.t('opt.q.low') },
        { id: 'medium', label: BrixState.t('opt.q.medium') },
        { id: 'high', label: BrixState.t('opt.q.high') }
      ],
      function (v) { menuAudio.click(); BrixState.updateSettings({ quality: v }); });

    makeSelect(layer.querySelector('[data-select="lang"]'),
      function () { return st().lang; },
      [
        { id: 'ru', label: 'Русский' },
        { id: 'en', label: 'English' }
      ],
      function (v) { menuAudio.click(); BrixState.setLang(v); });

    // --- свитчи ---
    function makeSwitch(mount, get, set) {
      mount.innerHTML = '<button class="switch' + (get() ? ' on' : '') + '"><span class="knob"></span></button>';
      mount.querySelector('.switch').onclick = function () {
        menuAudio.click();
        set(!get());
        mount.querySelector('.switch').className = 'switch' + (get() ? ' on' : '');
      };
    }

    makeSwitch(layer.querySelector('[data-switch="particles"]'),
      function () { return st().settings.particles; },
      function (v) { BrixState.updateSettings({ particles: v }); });
    makeSwitch(layer.querySelector('[data-switch="parallax"]'),
      function () { return st().settings.parallax; },
      function (v) { BrixState.updateSettings({ parallax: v }); });
    var soundMount = layer.querySelector('[data-switch="sound"]');
    makeSwitch(soundMount,
      function () { return st().settings.sound; },
      function (v) { BrixState.updateSettings({ sound: v }); });

    // --- слайдеры ---
    function makeSlider(mount, get, set) {
      mount.innerHTML = '<div class="slider-wrap' + (st().settings.sound ? '' : ' disabled') + '">' +
        '<input type="range" min="0" max="100" value="' + Math.round(get() * 100) + '"></div>';
      var input = mount.querySelector('input');
      function paint() {
        input.style.setProperty('--fill', input.value + '%');
      }
      input.addEventListener('input', function () {
        set(input.value / 100);
        paint();
      });
      paint();
    }

    makeSlider(layer.querySelector('[data-slider="musicVol"]'),
      function () { return st().settings.musicVol; },
      function (v) { BrixState.updateSettings({ musicVol: v }); });
    makeSlider(layer.querySelector('[data-slider="sfxVol"]'),
      function () { return st().settings.sfxVol; },
      function (v) { BrixState.updateSettings({ sfxVol: v }); });

    // --- ник ---
    layer.querySelector('[data-nick-open]').onmouseenter = function () { menuAudio.hover(); };
    layer.querySelector('[data-nick-open]').onclick = function () {
      menuAudio.click();
      BrixModals.nickModal();
    };
  }

  // закрытие панели → на домашний экран
  function bindClose(layer) {
    var btn = layer.querySelector('[data-close]');
    if (!btn) return;
    btn.onmouseenter = function () { menuAudio.hover(); };
    btn.onclick = function () {
      menuAudio.back();
      BrixState.setScreen('home');
    };
  }

  return {
    renderHome: renderHome,
    renderServers: renderServers,
    renderFriends: renderFriends,
    renderNews: renderNews,
    renderSkins: renderSkins,
    renderOptions: renderOptions
  };
})();
