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
    var latest = BrixData.NEWS[0];

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

  // ================= СЕРВЕРА (ADMIN) =================
  function renderServers(layer) {
    var srv = BrixData.ADMIN_SERVER;

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
          '<div class="srv-wrap">' +
            // карточка сервера
            '<div class="rust-card server-card">' +
              '<div class="srv-top">' +
                '<div style="display:flex;align-items:center;gap:16px">' +
                  '<div style="display:grid;place-items:center;width:48px;height:48px;flex-shrink:0;border:1px solid rgba(205,65,47,.6);background:rgba(205,65,47,.15);color:var(--rust-bright)">' +
                    BrixIcon('shieldcheck', 24) +
                  '</div>' +
                  '<div>' +
                    '<div class="srv-title-row">' +
                      '<span class="mini-badge">' + BrixState.t('srv.admin.badge') + '</span>' +
                      '<h3 class="srv-name font-h">' + srv.name + '</h3>' +
                    '</div>' +
                    '<div class="srv-meta">' +
                      '<span><span class="ic">' + BrixIcon('globe', 13) + '</span>' + srv.map + '</span>' +
                      '<span><span class="ic">' + BrixIcon('map', 13) + '</span>' + BrixState.t('srv.admin.sizeVal') + '</span>' +
                      '<span><span class="ic">' + BrixIcon('crown', 13) + '</span>' + BrixState.t('srv.admin.mode') + '</span>' +
                      '<span><span class="ic">' + BrixIcon('users', 13) + '</span><span data-srv-online>…</span></span>' +
                      '<span class="good"><span>' + BrixIcon('signal', 13) + '</span>' + srv.ping + ' ms</span>' +
                    '</div>' +
                  '</div>' +
                '</div>' +
                '<div class="srv-status">' +
                  '<span class="ping-dot"></span>' +
                  '<span class="st">' + BrixState.t('srv.admin.status') + '</span>' +
                  '<button class="btn-rust-primary" data-connect>' + BrixState.t('srv.admin.connect') + '</button>' +
                '</div>' +
              '</div>' +
              // особенности
              '<div class="srv-features">' +
                '<div>' + BrixIcon('check', 13) + BrixState.t('srv.admin.feature1') + '</div>' +
                '<div>' + BrixIcon('check', 13) + BrixState.t('srv.admin.feature2') + '</div>' +
                '<div>' + BrixIcon('check', 13) + BrixState.t('srv.admin.feature3') + '</div>' +
              '</div>' +
              // ✅ v0.3.3: РЕАЛЬНЫЕ игроки на сервере (без выдуманных)
              '<div class="srv-roster" data-roster></div>' +
            '</div>' +
            // инфо ADMIN
            '<div class="srv-info-grid">' +
              '<div class="rust-card srv-info">' +
                '<div class="cap" style="color:var(--rust-bright)">' + BrixState.t('srv.admin.infoTitle') + '</div>' +
                '<p>' + BrixState.t('srv.admin.info') + '</p>' +
                '<div class="access">' + BrixIcon('shieldcheck', 13) + BrixState.t('srv.admin.access') + '</div>' +
              '</div>' +
              '<div class="rust-card srv-info">' +
                '<div class="cap" style="color:var(--ember)">' + BrixState.t('srv.admin.lastPlayed') + '</div>' +
                '<p class="last-name">' + (BrixState.data.lastServerId ? srv.name : '—') + '</p>' +
                '<p>' + BrixState.t('srv.admin.note') + '</p>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    bindClose(layer);
    layer.querySelector('[data-connect]').onmouseenter = function () { menuAudio.hover(); };
    layer.querySelector('[data-connect]').onclick = function () {
      menuAudio.click();
      BrixState.setLastServer(BrixData.ADMIN_SERVER.id);
      BrixGame.connect(BrixData.ADMIN_SERVER.id);
    };

    /* ✅ v0.3.3: живой онлайн — опрос /status каждые 4 секунды.
       Счётчик РЕАЛЬНЫЙ: сервер сам считает подключённых игроков,
       при выходе игрока в меню или из игры он уменьшается. */
    var onlineEl = layer.querySelector('[data-srv-online]');
    var rosterEl = layer.querySelector('[data-roster]');
    function drawSrvStatus() {
      var info = window.BrixFriends ? BrixFriends.serverInfo() : { ok: false, players: 0, names: [] };
      var pp = function (n) { return window.BrixFriends ? BrixFriends.pluralPeople(n, BrixState.data.lang) : '?'; };
      if (info.ok) {
        // ✅ v0.3.4: «1 человек / 2 человека / 3 человека»
        onlineEl.textContent = info.players + '/' + (info.max || 64) + ' — ' +
          info.players + ' ' + pp(info.players) + ' ' + BrixState.t('srv.onlineWord');
        var names = info.names || [];
        var html = '<div class="srv-roster-cap font-h">' + BrixIcon('users', 13) +
          ' ' + BrixState.t('srv.roster') + ' — ' + names.length + ' ' + pp(names.length) + '</div>';
        if (names.length) {
          html += '<div class="srv-roster-list">' + names.map(function (n) {
            var hue = avatarHue(n);
            return '<span class="srv-player"><span class="sp-dot"></span>' + n + '</span>';
          }).join('') + '</div>';
        } else {
          html += '<div class="srv-nobody">' + BrixState.t('srv.nobody') + '</div>';
        }
        rosterEl.innerHTML = html;
      } else {
        onlineEl.textContent = BrixState.t('srv.offline');
        rosterEl.innerHTML = '<div class="srv-roster-cap font-h">' + BrixIcon('users', 13) +
          ' ' + BrixState.t('srv.roster') + '</div><div class="srv-nobody">' + BrixState.t('srv.offline') + '</div>';
      }
    }
    drawSrvStatus();
    var srvTimer = setInterval(function () {
      if (!document.body.contains(onlineEl)) { clearInterval(srvTimer); return; }
      drawSrvStatus();
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
      [
        { id: 'friends', key: 'fr.tabs.friends', n: so().friends.length },
        { id: 'invites', key: 'fr.tabs.in',      n: so().incoming.length },
        { id: 'out',     key: 'fr.tabs.out',     n: so().outgoing.length }
      ].forEach(function (tab) {
        var b = document.createElement('button');
        b.className = frTab === tab.id ? 'active' : '';
        b.textContent = BrixState.t(tab.key) + (tab.n ? ' — ' + tab.n : '');
        b.onmouseenter = function () { menuAudio.hover(); };
        b.onclick = function () { menuAudio.click(); frTab = tab.id; drawTabs(); drawBody(); };
        tabsEl.appendChild(b);
      });
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
      else if (frTab === 'invites') drawInvitesTab();
      else drawOutTab();
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
    var featured = BrixData.NEWS[0];
    var rest = BrixData.NEWS.slice(1);
    var artHues = [14, 32, 100, 45, 80];

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
  var RARITY = {
    common:    { color: '#a8b0a6', glow: 'rgba(168,176,166,0.14)' },
    uncommon:  { color: '#7fae62', glow: 'rgba(127,174,98,0.14)' },
    rare:      { color: '#d8a25a', glow: 'rgba(216,162,90,0.16)' },
    epic:      { color: '#cd412f', glow: 'rgba(205,65,47,0.18)' },
    legendary: { color: '#e8c35a', glow: 'rgba(232,195,90,0.2)' }
  };

  var SKIN_TABS = [
    { id: 'all',      labelKey: 'skins.tab.all' },
    { id: 'weapon',   labelKey: 'skins.tab.weapon' },
    { id: 'tool',     labelKey: 'skins.tab.tool' },
    { id: 'clothing', labelKey: 'skins.tab.clothing' },
    { id: 'misc',     labelKey: 'skins.tab.misc' }
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
      var S2 = BrixState.data;
      var list = BrixData.SKINS.filter(function (s) {
        return curTab === 'all' ? true : s.type === curTab;
      });

      gridEl.innerHTML = '';
      list.forEach(function (skin, i) {
        var isOwned = S2.ownedSkinIds.indexOf(skin.id) !== -1;
        var isEquipped = S2.equippedSkinIds.indexOf(skin.id) !== -1;
        var r = RARITY[skin.rarity];

        var card = document.createElement('div');
        card.className = 'rust-card skin-card' + (isEquipped ? ' equipped' : '');
        if (isEquipped) card.style.boxShadow = '0 0 24px ' + RARITY.legendary.glow;
        card.style.animationDelay = Math.min(i * 0.04, 0.35) + 's';

        card.innerHTML =
          '<div class="icon-area" style="background:radial-gradient(ellipse at 50% 35%, ' + r.glow + ', rgba(0,0,0,0.35) 75%), rgba(255,255,255,0.03);color:' + r.color + '">' +
            BrixData.itemIcon(skin.icon, 'item') +
            (isEquipped ? '<span class="mini-badge equipped-badge">' + BrixState.t('skins.equippedMark') + '</span>' : '') +
            '<span class="rarity-dot" style="background:' + r.color + ';box-shadow:0 0 8px ' + r.color + '"></span>' +
          '</div>' +
          '<div class="name">' + skin.name[S2.lang] + '</div>' +
          '<div class="rarity" style="color:' + r.color + '">' + BrixState.t('skins.rarity.' + skin.rarity) + '</div>' +
          '<div class="foot">' +
            (isOwned
              ? '<span class="owned">' + BrixState.t('skins.owned') + '</span>'
              : '<span class="price">' + BrixIcon('coins', 12) + (skin.price === 0 ? '—' : skin.price) + '</span>') +
            (isOwned
              ? '<button class="btn-rust' + (isEquipped ? ' equipped' : '') + '" data-equip>' + BrixState.t(isEquipped ? 'skins.unequip' : 'skins.equip') + '</button>'
              : '<button class="btn-rust-primary" data-buy>' + BrixState.t('skins.buy') + '</button>') +
          '</div>';

        card.querySelectorAll('button').forEach(function (b) {
          b.onmouseenter = function () { menuAudio.hover(); };
        });

        var equipBtn = card.querySelector('[data-equip]');
        if (equipBtn) {
          equipBtn.onclick = function () {
            menuAudio.click();
            BrixState.toggleEquipSkin(skin.id);
            BrixToast.toast({
              description: isEquipped
                ? BrixState.t('skins.unequipped', { name: skin.name[BrixState.data.lang] })
                : BrixState.t('skins.equipped', { name: skin.name[BrixState.data.lang] })
            });
          };
        }

        var buyBtn = card.querySelector('[data-buy]');
        if (buyBtn) {
          buyBtn.onclick = function () {
            var ok = BrixState.buySkin(skin.id, skin.price);
            if (ok) {
              menuAudio.buy();
              BrixToast.toast({ description: BrixState.t('skins.bought', { name: skin.name[BrixState.data.lang] }) });
            } else {
              menuAudio.error();
              BrixToast.toast({ description: BrixState.t('skins.notEnough') });
            }
          };
        }

        gridEl.appendChild(card);
      });

      layer.querySelector('[data-coins]').textContent = BrixState.data.coins;
    }

    drawTabs();
    drawGrid();
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
