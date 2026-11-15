// ============================================================
//  brix • js/data/servers.js
//  Панель серверов ADMIN: один служебный тестовый сервер
//  (бета-тест BRIX). Полный перенос из data/servers.ts.
// ============================================================
window.BrixData = window.BrixData || {};

window.BrixData.ADMIN_SERVER = {
  id: 'admin-test',
  name: 'BRIX Test Server',
  map: 'Brixland',
  size: 3000,           // средний размер карты
  mode: 'vanilla',
  wipe: '—',
  players: 0,   // ✅ v0.3.3: реальный онлайн берётся из /status
  max: 64,
  ping: 12,
  categories: ['admin']
};

window.BrixData.SERVERS = [window.BrixData.ADMIN_SERVER];
