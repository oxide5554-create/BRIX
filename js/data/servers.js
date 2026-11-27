// ============================================================
//  brix • js/data/servers.js
//  ✅ v0.5.24 ДВА ОФИЦИАЛЬНЫХ СЕРВЕРА (карта BrixLand УДАЛЕНА
//  по просьбе игрока — «оставь только 2 сервера»):
//    BRIX • Генерация (процедурная карта) — порт 8789: АРХИПЕЛАГ
//      по сиду (4-6 островов, вода вместо пустых мест), вайп раз в
//      сутки с ОТСЧЁТОМ в чате и киком всех, аирдропы с C4;
//    BRIX • BrixPvP (пвп-арена)          — порт 8788, «ПОЛИГОН».
//  Меню живёт ОТДЕЛЬНО — порт 8780 (реалм «menu», только раздача
//  интерфейса, без мира). У каждого игрового сервера СВОИ сохранения
//  (папка data/<realm>/) и свой инвентарь игроков.
// ============================================================
window.BrixData = window.BrixData || {};

window.BrixData.SERVERS = [
  {
    id: 'brixwipe',
    realm: 'brixwipe',
    name: 'BRIX • Генерация',
    port: 8789,
    map: 'Процедурная карта (архипелаг, вайп раз в сутки)',
    mode: 'vanilla',        // выживание с регулярным вайпом
    modeKey: 'srv.mode.wipe',
    size: 3000,
    ping: 12,
    max: 25,
    biomes: 1               // пустыня + арктика + кактусы
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
  }
];

/** сервер по id (brixwipe / brixpvp) */
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

/* совместимость со старым кодом (мини-меню, ИГРАТЬ) — основной
   сервер теперь «Генерация» (процедурная карта). Игроки со старым
   lastServerId='brixland' автоматически попадают на него */
window.BrixData.ADMIN_SERVER = window.BrixData.serverById('brixwipe');
