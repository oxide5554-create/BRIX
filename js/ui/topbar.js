// ============================================================
//  brix • js/ui/topbar.js
//  Верхняя панель: логотип, профиль игрока (клик — окно профиля),
//  уведомления, язык RU/EN, полный экран.
// ============================================================
window.BrixTopBar = (function () {
  'use strict';

  var topbarGen = 0;   // поколение панели (отписка живых обработчиков)

  function render() {
    var S = BrixState.data;
    var t = function (k, p) { return BrixState.t(k, p); };

    var el = document.getElementById('topbar');
    var fsIcon = document.fullscreenElement ? 'minimize' : 'maximize';
    var unread = (S.social && S.social.notifs ? S.social.notifs.length : 0);

    el.innerHTML =
      '<div class="topbar-left">' +
        '<button class="burger" data-burger aria-label="Menu">' + BrixIcon('menu', 22) + '</button>' +
        '<div class="logo">' +
          '<img src="assets/icon.png" alt="" draggable="false">' +
          '<div class="logo-text">' +
            '<span class="logo-name">BRIX</span>' +
            '<span class="mini-badge">' + t('common.beta') + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="topbar-right">' +
        // ✅ v0.3.3: ОБЩИЙ счётчик онлайна (сервер + вкладки в лобби)
        '<div class="online-chip" data-online title="' + t('top.onlineTotal') + '">' +
          '<span class="ic">' + BrixIcon('users', 13) + '</span>' +
          '<span class="cap">' + t('top.onlineTotal') + '</span>' +
          '<span class="val" data-online-n>…</span>' +
        '</div>' +
        // профиль — клик открывает окно профиля
        '<button class="profile-chip" data-profile title="' + t('top.profile') + '">' +
          '<div class="avatar-round">' + S.settings.nick.slice(0, 1).toUpperCase() + '</div>' +
          '<div>' +
            '<div class="nick">' + S.settings.nick + '</div>' +
            '<div class="lvl">' + t('top.lvl') + ' ' + S.level + '</div>' +
          '</div>' +
        '</button>' +
        // уведомления (колокольчик) с числом непрочитанных
        '<button class="icon-btn" data-bell title="' + t('top.notifications') + '">' +
          BrixIcon('bell', 18) +
          '<span class="bell-badge' + (unread ? '' : ' none') + '" data-bell-n>' + (unread || '') + '</span>' +
        '</button>' +
        // язык
        '<div class="lang-switch">' +
          '<button class="' + (S.lang === 'ru' ? 'active' : '') + '" data-lang="ru">RU</button>' +
          '<button class="' + (S.lang === 'en' ? 'active' : '') + '" data-lang="en">EN</button>' +
        '</div>' +
        // полный экран
        '<button class="icon-btn fs-btn" data-fs title="' + t('top.fullscreen') + '">' + BrixIcon(fsIcon, 17) + '</button>' +
      '</div>';

    // события
    el.querySelector('[data-profile]').onclick = function () {
      menuAudio.click();
      BrixModals.profileModal();
    };
    el.querySelector('[data-bell]').onclick = function () {
      menuAudio.click();
      openBellPanel();
    };
    el.querySelectorAll('[data-lang]').forEach(function (b) {
      b.onclick = function () {
        menuAudio.click();
        BrixState.setLang(b.dataset.lang);
      };
    });
    el.querySelector('[data-fs]').onclick = function () {
      menuAudio.click();
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    };
    el.querySelector('[data-burger]').onclick = function () {
      menuAudio.click();
      openMobileMenu();
    };

    /* живое обновление счётчика онлайна и значка колокольчика */
    var myGen = ++topbarGen;
    function onSocial() {
      if (myGen !== topbarGen || !document.body.contains(el)) return;
      var nEl = el.querySelector('[data-online-n]');
      if (nEl) nEl.textContent = BrixFriends.onlineTotal();
      var bEl = el.querySelector('[data-bell-n]');
      var un = (BrixState.data.social && BrixState.data.social.notifs ? BrixState.data.social.notifs.length : 0);
      if (bEl) {
        bEl.textContent = un || '';
        bEl.classList.toggle('none', !un);
      }
    }
    window.addEventListener('brix-social', onSocial);
  }

  /** ✅ v0.3.3: окно уведомлений колокольчика */
  function openBellPanel() {
    var back = document.createElement('div');
    back.className = 'overlay';
    back.style.zIndex = 70;

    function draw() {
      var notifs = (BrixState.data.social && BrixState.data.social.notifs) || [];
      var rows = notifs.length ? notifs.map(function (n) {
        var actions;
        if (n.kind === 'declined') {
          actions =
            '<button class="btn-rust-primary" data-resend="' + n.id + '">' + BrixState.t('bell.resend') + '</button>' +
            '<button class="btn-rust" data-ok="' + n.id + '">' + BrixState.t('bell.ok') + '</button>';
        } else if (n.kind === 'invite') {
          /* ✅ v0.4.62: ЗАЯВКА В ДРУЗЬЯ прямо в колокольчике —
             «вам предложили дружить» + ПРИНЯТЬ / ИГНОРИРОВАТЬ */
          actions =
            '<button class="btn-rust-primary" data-faccept="' + n.id + '">' + BrixState.t('bell.accept') + '</button>' +
            '<button class="btn-rust" data-fignore="' + n.id + '">' + BrixState.t('bell.ignore') + '</button>';
        } else {
          actions = '<button class="btn-rust-primary" data-ok="' + n.id + '">' + BrixState.t('bell.ok') + '</button>';
        }
        return '<div class="notif-row">' +
          '<div class="notif-date">' + BrixIcon('calendar', 12) + ' ' + BrixFriends.fmtDate(n.date) + '</div>' +
          '<div class="notif-text">' + n.text + '</div>' +
          '<div class="notif-actions">' + actions + '</div>' +
        '</div>';
      }).join('') : '<div class="notif-empty">' + BrixState.t('top.notificationsEmpty') + '</div>';

      back.innerHTML =
        '<div class="modal-box rust-card bell-panel rust-scroll">' +
          '<div class="panel-head">' +
            '<h2 class="font-h">' + BrixState.t('bell.title') + '</h2>' +
            '<button class="close-btn" data-close>' + BrixIcon('x', 17) + '</button>' +
          '</div>' +
          '<div class="notif-list">' + rows + '</div>' +
        '</div>';

      back.querySelector('[data-close]').onclick = function () { back.remove(); };
      /* ✅ v0.4.62: ПРИНЯТЬ заявку из колокольчика → друзья;
         ИГНОРИРОВАТЬ → отклонить + убрать уведомление */
      back.querySelectorAll('[data-faccept]').forEach(function (b) {
        b.onclick = function () {
          menuAudio.buy();
          var n = notifs.filter(function (x) { return x.id === b.dataset.faccept; })[0];
          if (n) {
            // id заявки берём из входящих по имени (в уведомлении только ник)
            var req = ((BrixState.data.social || {}).incoming || [])
              .filter(function (x) { return x.name === n.name; })[0];
            if (req) BrixFriends.accept(req.id, req.name);
            BrixState.socialNotifResolve(n.id);
          }
          draw();
          try { window.dispatchEvent(new CustomEvent('brix-social')); } catch (eS) {}
        };
      });
      back.querySelectorAll('[data-fignore]').forEach(function (b) {
        b.onclick = function () {
          menuAudio.back();
          var n = notifs.filter(function (x) { return x.id === b.dataset.fignore; })[0];
          if (n) {
            var req = ((BrixState.data.social || {}).incoming || [])
              .filter(function (x) { return x.name === n.name; })[0];
            if (req) BrixFriends.decline(req.id, req.name);
            BrixState.socialNotifResolve(n.id);
          }
          draw();
        };
      });
      back.querySelectorAll('[data-ok]').forEach(function (b) {
        b.onclick = function () {
          menuAudio.click();
          BrixState.socialNotifResolve(b.dataset.ok);
          draw();
        };
      });
      back.querySelectorAll('[data-resend]').forEach(function (b) {
        b.onclick = function () {
          menuAudio.click();
          var n = notifs.filter(function (x) { return x.id === b.dataset.resend; })[0];
          if (n) {
            var res = BrixFriends.resend(n.name);
            BrixToast.toast({ description: res === 'sent'
              ? BrixState.t('fr.inviteSentTo', { name: n.name })
              : BrixState.t('fr.inviteOffline') });
          }
          BrixState.socialNotifResolve(b.dataset.resend);
          draw();
        };
      });
    }

    draw();
    back.onclick = function (e) { if (e.target === back) back.remove(); };
    document.body.appendChild(back);
  }

  /** Мобильная версия: гамбургер открывает выезжающее меню */
  function openMobileMenu() {
    var back = document.createElement('div');
    back.className = 'mobile-drawer-back';
    back.innerHTML =
      '<div class="mobile-drawer">' +
        '<div class="drawer-head">' +
          '<img src="assets/icon.png" alt="" style="width:28px;height:28px;object-fit:contain">' +
          '<button class="icon-btn" data-close>' + BrixIcon('x', 20) + '</button>' +
        '</div>' +
        '<nav id="drawerNav"></nav>' +
      '</div>';

    document.body.appendChild(back);
    BrixSidebar.render(document.getElementById('drawerNav'));

    back.onclick = function (e) {
      if (e.target === back || e.target.closest('[data-close]')) back.remove();
    };
  }

  return { render: render, openMobileMenu: openMobileMenu };
})();
