#!/usr/bin/env node
/* test_brix_airdrop.js — проверка АИРДРОПА на «Генерации»:
 * админ вызывает op:'airdrop' → самолёт вылетает, в чат падает
 * «SERVER: ✈ АИРДРОП ВЫЛЕТЕЛ С C4 — ПОЗИЦИЯ: …».
 * Требует BRIX-E2ETST в admins.json. */
'use strict';
const http = require('http');
const crypto = require('crypto');
const PORT = 8789;
const AID = 'BRIX-E2ETST';

function wsConnect(port) {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      host: '127.0.0.1', port, path: '/', method: 'GET',
      headers: {
        'Connection': 'Upgrade', 'Upgrade': 'websocket',
        'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13',
        'Origin': 'http://127.0.0.1:' + port
      }
    });
    req.on('upgrade', (res, sock) => resolve({ sock }));
    req.on('response', (res) => reject(new Error('no upgrade: ' + res.statusCode)));
    req.on('error', reject);
    req.end();
  });
}
function wsSend(sock, obj) {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) header = Buffer.from([0x81, len]);
  else { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2); }
  sock.write(Buffer.concat([header, payload]));
}
function makeParser(onMsg) {
  let buf = Buffer.alloc(0);
  return (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (true) {
      if (buf.length < 2) return;
      const len1 = buf[1] & 0x7f;
      let off = 2, len = len1;
      if (len1 === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len1 === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + len) return;
      const payload = buf.slice(off, off + len);
      buf = buf.slice(off + len);
      try { onMsg(JSON.parse(payload.toString('utf8'))); } catch (e) {}
    }
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const con = await wsConnect(PORT);
  const msgs = [];
  con.sock.on('data', makeParser((m) => msgs.push(m)));
  wsSend(con.sock, { t: 'hello', n: 'Аир-Тест', c: '#e2572b', lvl: 1, aid: AID });
  await sleep(800);
  wsSend(con.sock, { t: 's', x: 0, y: 6, z: 0, yaw: 0, a: 'idle', hp: 100 });
  await sleep(300);
  wsSend(con.sock, { t: 'admin', op: 'airdrop' });
  /* самолёт летит ~26 c через карту; ждём до 45 с анонс/сброс */
  const t0 = Date.now();
  let chatAd = null, planeMsg = null, adNew = null, adLand = null;
  while (Date.now() - t0 < 50000) {
    await sleep(500);
    chatAd = msgs.find((m) => m.t === 'chat' && /АИРДРОП ВЫЛЕТЕЛ/.test(m.m || ''));
    planeMsg = planeMsg || msgs.find((m) => m.t === 'plane');
    adNew = adNew || msgs.find((m) => m.t === 'adNew');
    adLand = adLand || msgs.find((m) => m.t === 'adLand');
    if (adLand || (adNew && chatAd)) break;
  }
  const aok = msgs.find((m) => m.t === 'aok' && m.op === 'airdrop');
  console.log('aok:', aok && aok.info);
  console.log('чат-анонс:', chatAd ? chatAd.m : 'НЕТ');
  console.log('самолёт (plane):', planeMsg ? 'вылетел, y=' + planeMsg.y : 'НЕТ');
  console.log('ящик сброшен (adNew):', adNew ? adNew.id + ' @ ' + adNew.x + ':' + adNew.z + (adNew.inv && adNew.inv.c4 ? ' С C4' : '') : 'нет (ещё летит — норма)');
  console.log('ящик приземлился (adLand):', adLand ? adLand.id : 'нет (падает 5.5 м/с — норма)');
  const pass = !!chatAd && !!planeMsg;
  console.log(pass ? 'AIRDROP TEST OK' : 'AIRDROP TEST FAIL');
  try { con.sock.destroy(); } catch (e) {}
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error('УПАЛ:', e.message); process.exit(2); });
