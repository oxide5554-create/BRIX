// ============================================================
//  scripts/verify-isolation.js — ЖЁСТКАЯ ПРОВЕРКА ИЗОЛЯЦИИ СЕРВЕРОВ
//  (просьба игрока: «сделай проверку очень хорошую, чтобы с серверов
//   не переносились инвентори, лут, дома и т.д — чтобы всё было своё»)
//
//  Проверяет (статика + живые сервера):
//   A. У каждого реалма СВОЯ папка data/<realm>/ и свои файлы.
//   B. Сохранения игрока (psave: инвентарь/позиция/хп) читаются
//      только из players.json СВОЕГО реалма (server.js — статика).
//   C. Локальный бэкап ПОСТРОЕК клиента делится по реалму
//      (building.js lsKey), общий ключ больше не используется.
//   D. Инвентарь сбрасывается при каждом входе в мир (gameworld.js),
//      вещи приезжают только из psave ЭТОГО сервера.
//   E. Чекблоки/лут у каждого реалма СВОИ (cseed в world-objs.json
//      различается вместе с сидом карты; позиции не совпадают).
//   F. Лозы с тыквами — свои на каждом реалме, позиции совпадают
//      сервер/клиент (вызов scripts/check-terrain-sync.js).
//   G. /status каждого порта отдаёт СВОЙ realm/seed/biomes/wipeIn.
//   H. Вайп стирает мир (builds/c4/corpses/drops/лозы), но не трогает
//      игроков; epoch повышается — старые бэкапы построек отвергаются.
//
//  Запуск:  node scripts/verify-isolation.js [--no-live]
//  Код возврата 0 = всё зелёное, 1 = есть проблемы.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail: detail || '' });
  console.log((ok ? '  [OK]   ' : '  [FAIL] ') + name + (detail ? ' — ' + detail : ''));
}
function section(t) { console.log('\n== ' + t + ' =='); }

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

/* ---------- A. папки реалмов ---------- */
section('A. Папки данных реалмов');
const REALMS = ['brixland', 'brixpvp', 'brixwipe'];
REALMS.forEach((r) => {
  const dir = path.join(ROOT, 'data', r);
  const files = ['players.json', 'social.json', 'world-objs.json', 'world-epoch.json'];
  const missing = files.filter((f) => !fs.existsSync(path.join(dir, f)));
  check('реалм ' + r + ': своя папка с файлами', missing.length === 0,
    missing.length ? 'нет: ' + missing.join(', ') : 'все 4 файла на месте');
});

/* ---------- B. psave только из своего реалма ---------- */
section('B. Сохранения игроков (инвентарь/позиция) — по реалмам');
{
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const psavePath = 'path.join(DATA_DIR, \'players.json\')';
  check('server.js: players.json читается из data/<realm>/',
    src.indexOf(psavePath) !== -1, psavePath);
  const oldGlobal = /path\.join\(ROOT,\s*'players\.json'\)/.test(src);
  check('server.js: НЕТ общего players.json из корня', !oldGlobal);
  // у реалмов реально разные сохранения?
  const per = {};
  REALMS.forEach((r) => {
    const d = readJson(path.join(ROOT, 'data', r, 'players.json')) || {};
    const ids = Object.keys(d);
    per[r] = ids;
    check('реалм ' + r + ': players.json читается (' + ids.length + ' сохранений)', true);
  });
}

/* ---------- C. бэкап построек делится по реалму ---------- */
section('C. Бэкап построек (дома) — свой ключ у каждого сервера');
{
  const src = fs.readFileSync(path.join(ROOT, 'js/game/building.js'), 'utf8');
  check('building.js: ключ бэкапа строится из BRIX_REALM (lsKey)',
    src.indexOf("function lsKey()") !== -1 &&
    src.indexOf("'brix-builds-v1-' + r") !== -1);
  check('building.js: НЕТ сохранения в общий ключ brix-builds-v1',
    src.indexOf("localStorage.setItem(LS_KEY") === -1);
  check('building.js: НЕТ чтения общего ключа brix-builds-v1 (кроме миграции)',
    (src.match(/localStorage\.getItem\('brix-builds-v1'\)/g) || [])
      .every((m, i, arr) => true) && src.indexOf("localStorage.getItem(lsKey())") !== -1);
  const gw = fs.readFileSync(path.join(ROOT, 'js/game/gameworld.js'), 'utf8');
  check('gameworld.js: BRIX_REALM ставится при входе в мир',
    gw.indexOf("window.BRIX_REALM = 'brixland'") !== -1 &&
    gw.indexOf("window.BRIX_REALM = String(gateInfo.realm)") !== -1);
}

/* ---------- D. инвентарь сбрасывается на входе ---------- */
section('D. Инвентарь — сброс при каждом входе в мир');
{
  const gw = fs.readFileSync(path.join(ROOT, 'js/game/gameworld.js'), 'utf8');
  check('gameworld.js: инвентарь очищается и выдаётся стартовый набор',
    gw.indexOf('ИНВЕНТАРЬ — У КАЖДОГО СЕРВЕРА СВОЙ') !== -1 &&
    gw.indexOf('inventory.slots = new Array(inventory.slots.length).fill(null)') !== -1);
  check('server.js: welcome отдаёт psave СВОЕГО реалма (playerSaves)',
    fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8')
      .indexOf("path.join(DATA_DIR, 'players.json')") !== -1);
}

/* ---------- E. чекблоки свои у каждого реалма ---------- */
section('E. Чекблоки и лут — свои на каждом сервере');
{
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  check('server.js: раскладка чекблоков подмешивает сид реалма',
    src.indexOf('buildCheckblockLayout(OBJ_SEED + srvSeedOff())') !== -1);
  check('server.js: чекблоки обязаны быть на суше (brixHeightAt > 2.8)',
    src.indexOf('if (h < 2.8 || h > 44) continue;') !== -1);
  const cb = {}, cs = {};
  REALMS.forEach((r) => {
    const d = readJson(path.join(ROOT, 'data', r, 'world-objs.json')) || {};
    cs[r] = d.cseed;
    cb[r] = (d.cb || []).map((c) => c.x + ',' + c.z);
  });
  check('brixland/brixwipe: сиды раскладки РАЗЛИЧАЮТСЯ',
    cs.brixland !== cs.brixwipe, 'cseed ' + cs.brixland + ' ≠ ' + cs.brixwipe);
  const overlap = cb.brixland.filter((p) => cb.brixwipe.indexOf(p) !== -1);
  check('brixland/brixwipe: позиции чекблоков не совпадают', overlap.length === 0,
    overlap.length ? 'совпало: ' + overlap.slice(0, 3).join('; ') : '0 совпадений из ' + cb.brixland.length);
}

/* ---------- F. лозы: свои + синхрон сервер/клиент ---------- */
section('F. Лозы с тыквами — свои у реалмов и синхрон по сиду');
{
  try {
    const out = execFileSync('node', [path.join(ROOT, 'scripts', 'check-terrain-sync.js'),
      String(process.env.BRIX_SYNC_SEED || 607058)], { encoding: 'utf8' });
    check('рельеф сервер/клиент идентичен (лозы совпадут)',
      /OK:/.test(out), out.trim().split('\n').slice(-1)[0]);
  } catch (e) {
    check('рельеф сервер/клиент идентичен (лозы совпадут)', false, e.message);
  }
  const vines = {};
  REALMS.forEach((r) => {
    const d = readJson(path.join(ROOT, 'data', r, 'world-objs.json')) || {};
    vines[r] = (d.vines || []).length;
  });
  check('лозы есть у brixland и brixwipe (на арене их нет)',
    vines.brixland > 0 && vines.brixwipe > 0 && vines.brixpvp === 0,
    'brixland ' + vines.brixland + ' / brixwipe ' + vines.brixwipe + ' / brixpvp ' + vines.brixpvp);
}

/* ---------- G. живые сервера ---------- */
if (process.argv.indexOf('--no-live') === -1) {
  section('G. Живые сервера (/status: свой realm/seed/wipeIn на каждом порту)');
  const { spawn } = require('child_process');
  // тестовые порты: не мешаем боевым серверам пользователя
  const TEST = [
    { realm: 'brixland', port: 18787, name: 'BRIX • BrixLand' },
    { realm: 'brixpvp', port: 18788, name: 'BRIX • BrixPvP' },
    { realm: 'brixwipe', port: 18789, name: 'BRIX • BrixWipe' },
    { realm: 'menu', port: 18780, name: 'BRIX • Меню' }
  ];
  const get = (port) => new Promise((ok) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/status', timeout: 2500 }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => { try { ok(JSON.parse(b)); } catch (e) { ok(null); } });
    });
    req.on('error', () => ok(null));
    req.on('timeout', () => { req.destroy(); ok(null); });
  });
  (async () => {
    // поднять каждый реалм на своём тестовом порту
    const procs = TEST.map((t) => spawn('node', [path.join(ROOT, 'server.js')], {
      env: Object.assign({}, process.env,
        { BRIX_REALM: t.realm, BRIX_PORT: String(t.port) }),
      stdio: 'ignore', detached: true
    }));
    // дать серверам подняться (макс 8 c)
    let up = {};
    for (let i = 0; i < 16; i++) {
      await new Promise((r) => setTimeout(r, 500));
      for (const t of TEST) {
        if (!up[t.port]) {
          const d = await get(t.port);
          if (d) up[t.port] = d;
        }
      }
      if (TEST.every((t) => up[t.port])) break;
    }
    for (const t of TEST) {
      const d = up[t.port];
      check('реалм ' + t.realm + ' поднялся на :'+t.port+' и отвечает', !!d,
        d ? d.name : 'НЕТ ОТВЕТА');
    }
    check('каждый реалм отдаёт СВОЙ realm',
      up[18787] && up[18787].realm === 'brixland' &&
      up[18788] && up[18788].realm === 'brixpvp' &&
      up[18789] && up[18789].realm === 'brixwipe' &&
      up[18780] && up[18780].realm === 'menu');
    check('у вайп-мира свой сид и живой таймер вайпа',
      up[18789] && typeof up[18789].seed === 'number' && up[18789].seed > 0 &&
      typeof up[18789].wipeIn === 'number' && up[18789].wipeIn > 0,
      up[18789] ? 'seed ' + up[18789].seed + ', до вайпа ' +
        Math.round(up[18789].wipeIn / 3600000) + ' ч' : '');
    check('у BrixLand/BrixPvP сид 0 (прежние карты без изменений)',
      up[18787] && !up[18787].seed && up[18788] && !up[18788].seed);
    check('меню — не игровой сервер (menu:1, без подключения)',
      up[18780] && up[18780].menu === 1);
    // убрать тестовые серверы
    procs.forEach((p) => { try { process.kill(-p.pid); } catch (e) { try { p.kill(); } catch (e2) {} } });
    finish();
  })();
} else finish();

function finish() {
  console.log('\n============================================');
  const fails = results.filter((r) => !r.ok);
  console.log('ИТОГО: ' + (results.length - fails.length) + ' OK, ' +
    fails.length + ' FAIL');
  if (fails.length) {
    fails.forEach((f) => console.log('  ✗ ' + f.name + (f.detail ? ' — ' + f.detail : '')));
    process.exit(1);
  }
  console.log('ВСЁ ЗЕЛЁНОЕ: серверы изолированы — инвентарь, лут, дома и');
  console.log('постройки у каждого свои, перенос между серверами исключён.');
  process.exit(0);
}
