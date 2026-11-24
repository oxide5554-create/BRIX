// ============================================================
//  brix • js/data/servers.js
//  ✅ v0.4.64 СПИСОК СЕРВЕРОВ BRIX — два официальных реалма:
//    BRIX • BrixLand (выживание) — порт 8787, прежний мир;
//    BRIX • BrixPvP  (пвп-арена) — порт 8788, свой мир «Арена
//    Пепел» (другой рельеф, арена без леса, только оружие).
//  У каждого сервера СВОИ сохранения (папка data/<realm>/ на
//  сервере) и СВОЙ живой счётчик игроков (опрос /status).
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
    max: 25                 // ✅ v0.5.16: лимит выживания 25 (было 64)
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
    max: 10                 // ✅ v0.5.16: лимит арены 10 (было 64)
  }
];

/** сервер по id (brixland / brixpvp) */
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

/* ✅ v0.4.64: совместимость со старым кодом (мини-меню, ИГРАТЬ) —
   «админ-сервер» больше не отдельное понятие: основной сервер — BrixLand */
window.BrixData.ADMIN_SERVER = window.BrixData.serverById('brixland');
