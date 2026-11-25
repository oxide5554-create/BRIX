// ============================================================
//  brix • js/ui/sidebar.js
//  Вертикальное меню слева как в референсе:
//  ИГРАТЬ / СЕРВЕРА / ДРУЗЬЯ / НОВОСТИ / СКИНЫ / НАСТРОЙКИ / ВЫХОД.
//  ✅ v0.4.60: СКИНЫ — магазин костюмов: купил один раз → «КУПЛЕНО» на
//  аккаунте (в инвентарь ничего не падает). Применение — в крафт-меню
//  (Q): клик по иконке предмета → список скинов → выбрал → СКАФТ.
//  ✅ v0.4.64: МАГАЗИН СКИНОВ (вкладка СКИНЫ) — ТОЛЬКО ДЛЯ АДМИНОВ:
//  обычным игрокам пункт не показывается. Админ определяется по
//  adminIds из /status (admins.json сервера) или по adminon в игре.
//  ИГРАТЬ подключает к последнему серверу (по умолчанию BrixLand).
// ============================================================
window.BrixSidebar = (function () {
  'use strict';

  var ITEMS = [
    { key: 'play',    labelKey: 'menu.play' },
    { key: 'servers', labelKey: 'menu.servers' },
    { key: 'friends', labelKey: 'menu.friends' },
    { key: 'rewards', labelKey: 'menu.rewards', rewardBadge: true },  /* ✅ v0.5.23 */
    { key: 'news',    labelKey: 'menu.news', badge: true },
    { key: 'skins',   labelKey: 'menu.skins', adminOnly: true },  // ✅ v0.4.64
    { key: 'options', labelKey: 'menu.options' },
    { key: 'quit',    labelKey: 'menu.quit' }
  ];

  var lastNav = null;   // для перерисовки, когда придёт статус админа

  function isAdmin() {
    return !!(window.BrixFriends && BrixFriends.isAdminAccount &&
      BrixFriends.isAdminAccount());
  }

  function onItem(key) {
    var S = BrixState.data;
    if (key === 'quit') {
      menuAudio.click();
      BrixState.setQuitOpen(true);
      return;
    }
    if (key === 'rewards') {
      /* ✅ v0.5.23: НАГРАДНАЯ ПОЛКА — модаль поверх меню (кнопка в меню,
         а не в игре — просьба игрока). Прогресс до уровня + забрать монеты */
      menuAudio.click();
      if (window.BrixRewards) BrixRewards.openMenu();
      return;
    }
    if (key === 'play') {
      // ИГРАТЬ = подключение к последнему серверу
      // (✅ v0.4.64: по умолчанию — BrixLand из списка серверов)
      menuAudio.click();
      var serverId = S.lastServerId ||
        (BrixData.SERVERS && BrixData.SERVERS[0] && BrixData.SERVERS[0].id) ||
        BrixData.ADMIN_SERVER.id;
      BrixState.setLastServer(serverId);
      BrixGame.connect(serverId);
      return;
    }
    if (S.screen === key) return;
    menuAudio.click();
    BrixState.setScreen(key);
  }

  function render(nav) {
    lastNav = nav;
    var S = BrixState.data;
    var unseen = Math.max(0, BrixData.NEWS.length - S.newsSeenIds.length);

    nav.innerHTML = '<ul class="flex flex-col"></ul>';
    var ul = nav.querySelector('ul');

    ITEMS.forEach(function (it) {
      /* ✅ v0.4.64: магазин скинов скрыт у НЕ-админов */
      if (it.adminOnly && !isAdmin()) return;
      var li = document.createElement('li');
      var btn = document.createElement('button');
      var active = it.key !== 'play' && it.key !== 'quit' && S.screen === it.key;
      btn.className = 'menu-item' + (active ? ' active' : '');
      /* ✅ v0.5.23: на пункте НАГРАДЫ — счётчик незабранных наград */
      var rwBadge = it.rewardBadge && window.BrixRewards ? BrixRewards.unclaimed() : 0;
      btn.innerHTML =
        '<span>' + BrixState.t(it.labelKey) + '</span>' +
        (it.badge && unseen > 0 ? '<span class="mini-badge">' + unseen + '</span>' : '') +
        (it.rewardBadge && rwBadge > 0 ? '<span class="mini-badge bxr-badge">' + rwBadge + '</span>' : '');
      btn.onmouseenter = function () { menuAudio.hover(); };
      btn.onclick = function () { onItem(it.key); };
      li.appendChild(btn);
      ul.appendChild(li);
    });
    /* бейджу наград нужен золотой стиль — один раз добавим css */
    if (!document.getElementById('bxrBadgeStyle')) {
      var stl = document.createElement('style');
      stl.id = 'bxrBadgeStyle';
      stl.textContent = '.mini-badge.bxr-badge{background:linear-gradient(180deg,#e0a33c,#c9852a);color:#1b1408;border-color:#6d4413}';
      document.head.appendChild(stl);
    }
  }

  /* ✅ v0.5.23: забрал награду в полке — счётчик на пункте меню гаснет */
  function refreshBadge() {
    if (lastNav && document.body.contains(lastNav)) render(lastNav);
  }

  /* статус админа приходит АСИНХРОННО (/status каждые 3 с) — как только
     появился, перерисовываем меню, чтобы админ увидел вкладку СКИНЫ */
  window.addEventListener('brix-social', function () {
    if (lastNav && document.body.contains(lastNav)) render(lastNav);
  });

  return { render: render, refreshBadge: refreshBadge };
})();
