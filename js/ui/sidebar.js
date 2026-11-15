// ============================================================
//  brix • js/ui/sidebar.js
//  Вертикальное меню слева как в референсе:
//  ИГРАТЬ / СЕРВЕРА / ДРУЗЬЯ / НОВОСТИ / СКИНЫ / НАСТРОЙКИ / ВЫХОД.
//  Кнопка ИГРАТЬ подключает к последнему серверу.
// ============================================================
window.BrixSidebar = (function () {
  'use strict';

  var ITEMS = [
    { key: 'play',    labelKey: 'menu.play' },
    { key: 'servers', labelKey: 'menu.servers' },
    { key: 'friends', labelKey: 'menu.friends' },
    { key: 'news',    labelKey: 'menu.news', badge: true },
    { key: 'skins',   labelKey: 'menu.skins' },
    { key: 'options', labelKey: 'menu.options' },
    { key: 'quit',    labelKey: 'menu.quit' }
  ];

  function onItem(key) {
    var S = BrixState.data;
    if (key === 'quit') {
      menuAudio.click();
      BrixState.setQuitOpen(true);
      return;
    }
    if (key === 'play') {
      // ИГРАТЬ = подключение к последнему серверу
      menuAudio.click();
      var serverId = S.lastServerId || BrixData.ADMIN_SERVER.id;
      BrixState.setLastServer(serverId);
      BrixGame.connect(serverId);
      return;
    }
    if (S.screen === key) return;
    menuAudio.click();
    BrixState.setScreen(key);
  }

  function render(nav) {
    var S = BrixState.data;
    var unseen = Math.max(0, BrixData.NEWS.length - S.newsSeenIds.length);

    nav.innerHTML = '<ul class="flex flex-col"></ul>';
    var ul = nav.querySelector('ul');

    ITEMS.forEach(function (it) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      var active = it.key !== 'play' && it.key !== 'quit' && S.screen === it.key;
      btn.className = 'menu-item' + (active ? ' active' : '');
      btn.innerHTML =
        '<span>' + BrixState.t(it.labelKey) + '</span>' +
        (it.badge && unseen > 0 ? '<span class="mini-badge">' + unseen + '</span>' : '');
      btn.onmouseenter = function () { menuAudio.hover(); };
      btn.onclick = function () { onItem(it.key); };
      li.appendChild(btn);
      ul.appendChild(li);
    });
  }

  return { render: render };
})();
