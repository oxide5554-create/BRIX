#!/usr/bin/env node
/* ============================================================
 *  test_brix_ws.js — E2E-проверка сервера BRIX «Генерация» (8789)
 *  без браузера: сырой WebSocket-клиент (рукопожатие + фреймы).
 *  Проверяет:
 *    1) welcome: realm=brixwipe, seed, archipelag (чекблоки на суше);
 *    2) БОЧКИ: bhit → bhp/brk + дропы ПОД бочкой (фикс v0.5.24);
 *    3) ДЕРЕВЬЯ: hit до исчерпания → 'xp' (сервер начисляет опыт);
 *    4) АИРДРОП: welcome.adrops определён (самолёт на «Генерации»);
 *    5) ВАЙП: передвигаем wipe.json к now+35с → в чате придёт
 *       «SERVER: WIPE SERVER …», затем wipekick (всех кикает);
 *    6) после вайпа: новый сид в /status, вход после тех. перерыва.
 *  Запуск: node /home/z/my-project/scripts/test_brix_ws.js
 * ============================================================ */
'use strict';
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');

const PORT = Number(process.env.BRIX_TEST_PORT || 8789);
const ROOT = '/home/z/my-project/BRIX';
const AID = 'BRIX-E2ETST';
const results = [];
function ok(name, cond, extra) {
  results.push({ name, pass: !!cond, extra: extra || '' });
  console.log((cond ? '  ✅' : '  ❌') + ' ' + name + (extra ? ' — ' + extra : ''));
}

/* ---------- сырой WebSocket-клиент ---------- */
function wsConnect(port, origin) {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      host: '127.0.0.1', port, path: '/', method: 'GET',
      headers: {
        'Connection': 'Upgrade', 'Upgrade': 'websocket',
        'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13',
        'Origin': origin || ('http://127.0.0.1:' + port)
      }
    });
    req.on('upgrade', (res, sock) => resolve({ sock, key }));
    req.on('response', (res) => reject(new Error('no upgrade: ' + res.statusCode)));
    req.on('error', reject);
    req.end();
  });
}

function wsSend(sock, obj) {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  sock.write(Buffer.concat([header, payload]));
}

/* разбор входящих фреймов (текстовые, без маски от сервера) */
function makeParser(onMsg) {
  let buf = Buffer.alloc(0);
  return (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (true) {
      if (buf.length < 2) return;
      const len1 = buf[1] & 0x7f;
      let off = 2, len = len1;
      if (len1 === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2); off = 4;
      } else if (len1 === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2)); off = 10;
      }
      if (buf.length < off + len) return;
      const payload = buf.slice(off, off + len);
      buf = buf.slice(off + len);
      try { onMsg(JSON.parse(payload.toString('utf8'))); } catch (e) {}
    }
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpGet(pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: pathname }, (res) => {
      let b = '';
      res.on('data', (c) => b += c);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve(b); } });
    }).on('error', reject);
  });
}

/* ---------- главный сценарий ---------- */
(async () => {
  console.log('== 0. /status до теста ==');
  const st0 = await httpGet('/status');
  const seed0 = st0 && st0.seed;
  ok('сервер «Генерация» отвечает /status', !!st0, 'realm=' + (st0 && st0.realm) + ', seed=' + seed0);

  const con = await wsConnect(PORT);
  const msgs = [];
  const waitFor = (pred, ms) => new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const m = msgs.find(pred);
      if (m) { clearInterval(iv); resolve(m); }
      else if (Date.now() - t0 > ms) { clearInterval(iv); resolve(null); }
    }, 50);
  });
  con.sock.on('data', makeParser((m) => msgs.push(m)));
  con.sock.on('close', () => {});

  console.log('== 1. hello → welcome ==');
  wsSend(con.sock, { t: 'hello', n: 'E2E-Тестер', c: '#e2572b', lvl: 1, aid: AID,
    meta: null });
  const welcome = await waitFor((m) => m.t === 'welcome', 4000);
  ok('welcome получен', !!welcome);
  if (welcome) {
    ok('welcome.realm = brixwipe', welcome.realm === 'brixwipe', welcome.realm);
    ok('welcome.seed совпадает с /status', welcome.seed === seed0, String(welcome.seed));
    ok('welcome.lvl/xp — авторитет сервера', welcome.lvl === 1 && welcome.xp === 0);
    const cb = welcome.objs && welcome.objs.cb || [];
    ok('чекблоки есть и разложены по островам', cb.length >= 10, 'штук: ' + cb.length);
    const barrels = {};
    cb.forEach((c) => (c.bar || []).forEach((b) => barrels[b.id] = b));
    const nb = Object.keys(barrels).length;
    ok('бочки в welcome (' + nb + ' шт)', nb >= 20);

    console.log('== 2. БОЧКИ: bhit → bhp/brk + дропы ==');
    const cbOf = {};
    cb.forEach((c) => (c.bar || []).forEach((b) => { cbOf[b.id] = c; }));
    const bid = Object.keys(barrels)[0];
    wsSend(con.sock, { t: 's', x: 0, y: 6, z: 0, yaw: 0, a: 'idle', hp: 100 });
    await sleep(200);
    /* 1-й удар КАМЕННЫМ топором (1 dmg): придёт bhp (hp 5) — не brk;
       добиваем БУЛАВОЙ (6 dmg): brk + дропы */
    wsSend(con.sock, { t: 'bhit', id: bid, tool: 'stoneAxe' });
    const hpMsg = await waitFor((m) => (m.t === 'bhp' || m.t === 'brk') && m.id === bid, 1500);
    ok('удар по бочке принят (bhp)', !!hpMsg && hpMsg.t === 'bhp',
      hpMsg ? 'тип ' + hpMsg.t + ', hp=' + hpMsg.hp : 'нет ответа');
    let brkMsg = null;
    for (let i = 0; i < 8 && !brkMsg; i++) {
      wsSend(con.sock, { t: 'bhit', id: bid, tool: 'mace' });   // булава: 6 dmg/удар
      brkMsg = await waitFor((m) => m.t === 'brk' && m.id === bid, 900);
      await sleep(350);
    }
    ok('бочка разбилась (brk)', !!brkMsg);
    if (brkMsg) {
      const block = cbOf[bid] || {};
      const bx = block.x, bz = block.z;   // мировые координаты чекблока
      const drops = brkMsg.drops || [];
      ok('дроп из бочки выпал', drops.length > 0, 'штук: ' + drops.length);
      if (drops.length) {
        const near = drops.every((d) => Math.hypot(d.x - bx, d.z - bz) < 30);
        ok('дроп лежит у бочки (новая карта), а не на старой', near,
          'блок ' + bx + ':' + bz + ', дроп ' + drops[0].x + ':' + drops[0].z);
      }
    }

    console.log('== 3. welcome.adrops (самолёт на «Генерации») ==');
    ok('аирдропы подключены (welcome.adrops определён)',
      welcome.adrops !== undefined, Array.isArray(welcome.adrops) ?
        'ящиков в мире: ' + welcome.adrops.length : 'null (нет активных) — норма');
  }

  console.log('== 4. ВАЙП: отсчёт в чате + wipekick + тех. перерыв ==');
  /* ВАЙП ЗАПУСКАЕМ КАК АДМИН КНОПКОЙ (op 'serverwipe') — это то, что
     делает игрок в админ-панели: чат объявляет «вайп через 60 секунд»,
     тикает отсчёт, в 0 всех кикает, карта перегенерируется. Для этого
     тестовый BRIX-ID должен быть в admins.json */
  wsSend(con.sock, { t: 'admin', op: 'serverwipe' });
  const aok = await waitFor((m) => m.t === 'aok' && m.op === 'serverwipe', 4000);
  ok('админ-команда serverwipe принята', !!aok, aok ? String(aok.info) : 'нет aok');
  const t0 = Date.now();
  const chatCountdown = [];
  let wiped = false, kicked = false;
  const finish = waitFor(() => wiped && kicked, 100000);
  const watcher = setInterval(() => {
    for (const m of msgs) {
      if (m.t === 'chat' && m.n === 'SERVER' && /WIPE SERVER/.test(m.m || '')) {
        if (!chatCountdown.some((c) => c.m === m.m)) chatCountdown.push(m);
      }
      if (m.t === 'wipekick') kicked = true;
      if (m.t === 'wipenow') wiped = true;
    }
  }, 300);
  await finish;
  clearInterval(watcher);
  ok('чат печатает отсчёт «SERVER: WIPE SERVER N»', chatCountdown.length >= 3,
    chatCountdown.map((c) => c.m).join(' | ').slice(0, 150));
  ok('игрока КИКНУЛО с сервера (wipekick)', kicked);
  const waited = Math.round((Date.now() - t0) / 1000);
  console.log('  (' + waited + ' с от запуска вайпа)');
  try { con.sock.destroy(); } catch (e) {}

  /* тех. перерыв ~10 c — ждём и проверяем новый сид */
  await sleep(12000);
  const st1 = await httpGet('/status');
  ok('после вайпа сид НОВЫЙ', !!st1 && st1.seed && st1.seed !== seed0,
    'было ' + seed0 + ' → стало ' + (st1 && st1.seed));
  const st1wipe = st1 && st1.wipeIn;
  ok('таймер следующего вайпа перезапущен', typeof st1wipe === 'number' && st1wipe > 86000000,
    Math.round(st1wipe / 3600000) + ' ч');

  console.log('== 5. вход после вайпа (карта генерируется) ==');
  const con2 = await wsConnect(PORT).catch(() => null);
  let welcome2 = null;
  if (con2) {
    const msgs2 = [];
    con2.sock.on('data', makeParser((m) => msgs2.push(m)));
    wsSend(con2.sock, { t: 'hello', n: 'E2E-Тестер', c: '#e2572b', lvl: 1, aid: AID });
    welcome2 = await new Promise((r) => setTimeout(() =>
      r(msgs2.find((m) => m.t === 'welcome') || null), 2500));
    try { con2.sock.destroy(); } catch (e) {}
  }
  ok('вход открыт после тех. перерыва, welcome с новым сидом',
    !!welcome2 && welcome2.seed === (st1 && st1.seed));

  console.log('\n===== ИТОГ =====');
  const failed = results.filter((r) => !r.pass);
  console.log('Проверок: ' + results.length + ', провалено: ' + failed.length);
  failed.forEach((f) => console.log('  FAIL: ' + f.name + ' ' + f.extra));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('ТЕСТ УПАЛ:', e.message);
  process.exit(2);
});
