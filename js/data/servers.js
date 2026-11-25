// ============================================================
//  brix • js/data/servers.js
//  ✅ v0.5.22 СПИСОК СЕРВЕРОВ BRIX — ТРИ официальных реалма:
//    BRIX • BrixLand  (выживание)  — порт 8787, прежний мир;
//    BRIX • BrixPvP   (пвп-арена)  — порт 8788, локация «ПОЛИГОН»;
//    BRIX • BrixWipe  (вайп-мир)   — порт 8789, карта на генерации:
//      СЕРВЕР сам тикает время до вайпа (каждые СУТКИ), в момент
//      вайпа стирает мир, берёт НОВЫЙ сид и рассылает всем — карта
//      генерируется заново (пустыня, арктика, кактусы).
//  Меню живёт ОТДЕЛЬНО — порт 8780 (реалм «menu», только раздача
//  интерфейса, без мира). У каждого игрового сервера СВОИ сохранения
//  (папка data/<realm>/) и свой инвентарь игроков.
// ============================================================
window.BrixData = window.BrixData || {};

window.BrixData.SERVERS = [
  {
    id: 'brixland',
    realm: 'brixland',
    name: 'BRIX • BrixLand',
    port: 8787,
    map: 'Brixland',
    mode: 'vanilla',        // выживание: хотбар, крафт, стройка
    modeKey: 'srv.mode.vanilla',
    size: 3000,
    ping: 12,
    max: 25                 // лимит выживания 25
  },
  {
    id: 'brixpvp',
    realm: 'brixpvp',
    name: 'BRIX • BrixPvP',
    port: 8788,
    map: 'Полигон (СЕКТОР-9)',
    mode: 'pvp',            // пвп: только оружие, E — список оружия
    modeKey: 'srv.mode.pvp',
    size: 3000,
    ping: 12,
    max: 10                 // лимит арены 10
  },
  {
    id: 'brixwipe',
    realm: 'brixwipe',
    name: 'BRIX • BrixWipe',
    port: 8789,
    map: 'Генерация (вайп раз в сутки)',
    mode: 'vanilla',        // выживание с регулярным вайпом
    modeKey: 'srv.mode.wipe',
    size: 3000,
    ping: 12,
    max: 25,
    biomes: 1               // ✅ v0.5.22: пустыня + арктика + кактусы
  }
];

/** сервер по id (brixland / brixpvp / brixwipe) */
window.BrixData.serverById = function (id) {
  var list = window.BrixData.SERVERS || [];
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return list[0] || null;
};

/** сервер по realm-имени (реалм приходит из welcome сервера) */
window.BrixData.serverByRealm = function (realm) {
  var list = window.BrixData.SERVERS || [];
  for (var i = 0; i < list.length; i++) if (list[i].realm === realm) return list[i];
  return list[0] || null;
};

/* совместимость со старым кодом (мини-меню, ИГРАТЬ) —
   основной сервер — BrixLand */
window.BrixData.ADMIN_SERVER = window.BrixData.serverById('brixland');
