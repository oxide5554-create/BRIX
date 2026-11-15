// ============================================================
//  brix • js/social/social.js
//  ✅ v0.3.4 СОТСЕТЬ BRIX: друзья, заявки, присутствие.
//  - ОДИН АККАУНТ на устройство (aid = BRIX-XXXXXX из localStorage),
//    но у КАЖДОЙ ВКЛАДКИ свой сессионный id (sid) — иначе вкладки
//    не видят друг друга (v0.3.3 считал сообщения «своими»)
//  - присутствие: «на сервере» / «в лобби» / «не в сети»
//  - транспорт заявок: канал вкладок одного браузера
//    (BroadcastChannel) + пересылка через сервер ('fsend' → 'fsoc')
//  - реальный счётчик онлайна: HTTP /status сервера (меняет его
//    ТОЛЬКО сервер — игрок просто видит)
//  Данные хранятся в BrixState.data.social (localStorage).
// ============================================================
window.BrixFriends = (function () {
  'use strict';

  var CH = 'brix-social';
  var bc = null;
  try { bc = new BroadcastChannel(CH); } catch (e) { bc = null; }

  /* сессия вкладки: новый sid при каждом открытии вкладки */
  var SID = 'T' + Math.random().toString(36).slice(2, 10);

  var peers = {};            // sid -> {sid, aid, name, status: 'lobby'|'game', last}
  var serverInfo = { ok: false, players: 0, inGame: 0, names: [], ts: 0 };
  var selfStatus = 'lobby';
  var inited = false;

  function emitChange() {
    try { window.dispatchEvent(new CustomEvent('brix-social')); } catch (e) {}
  }

  function S() {
    var d = BrixState.data;
    if (!d.social) d.social = { friends: [], incoming: [], outgoing: [], notifs: [] };
    return d.social;
  }

  function myAid() { return BrixState.ensureProfileId(); }
  function myName() { return (BrixState.data.settings && BrixState.data.settings.nick) || 'Игрок'; }

  function toast(desc) {
    try { BrixToast.toast({ description: desc }); } catch (e) {}
  }

  function fmtDate(ts) {
    var d = new Date(ts);
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /** «1 человек / 2 человека / 5 человек» */
  function pluralPeople(n, lang) {
    if (lang === 'en') return n === 1 ? 'player' : 'players';
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return 'человек';
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return 'человека';
    return 'человек';
  }

  /* ================= ТРАНСПОРТ: канал вкладок ================= */

  function postToPeers(msg) {
    if (!bc) return;
    msg.sid = msg.sid || SID;
    msg.aid = msg.aid || myAid();
    msg.fromName = msg.fromName || myName();
    try { bc.postMessage(msg); } catch (e) {}
  }

  if (bc) {
    bc.onmessage = function (ev) {
      var m = ev.data;
      if (!m || !m.t) return;
      if (m.t === 'pres') {
        if (m.sid && m.sid !== SID) {
          peers[m.sid] = { sid: m.sid, aid: m.aid || '', name: m.name || '?',
            status: m.st || 'lobby', last: Date.now() };
        }
        emitChange();
        return;
      }
      if (m.sid && m.sid === SID) return;   // своё (та же вкладка)
      switch (m.t) {
        case 'freq':   onInvite(m, false); break;
        case 'fres':   onResponse(m); break;
      }
    };
  }

  /* ================= ТРАНСПОРТ: сервер ================= */

  function viaServer(toName, kind, data) {
    if (window.BrixNet && BrixNet.mode === 'server' && BrixNet.sendSocial) {
      BrixNet.sendSocial(toName, kind, data);
      return true;
    }
    return false;
  }

  /* ✅ v0.3.5: заявка ИЗ МЕНЮ (WS ещё не подключён) — через HTTP.
     Сервер либо доставит сразу, либо сохранит на 15 минут:
     игрок получит её, как только зайдёт на сервер */
  function httpInvite(to) {
    var base = (location.port === '8787') ? location.origin : 'http://localhost:8787';
    fetch(base + '/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: myName(), fromId: myAid(), to: to })
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok) {
          if (!j.delivered) toast(BrixState.t('fr.queued', { name: to }));
        } else {
          // сервер отказал (не найден/сам себе) — убираем из исходящих
          var so = S();
          so.outgoing = so.outgoing.filter(function (f) {
            return f.name.toLowerCase() !== to.toLowerCase();
          });
          emitChange();
          toast(BrixState.t('fr.inviteOffline'));
        }
      })
      .catch(function () { toast(BrixState.t('fr.inviteOffline')); });
  }

  /* ================= ПРИЁМ ================= */

  /** пришла заявка в друзья (из вкладки или с сервера) */
  function onInvite(m, fromServer) {
    var aid = m.aid || m.fromId || '';
    var name = m.fromName || m.from || 'Игрок';
    // ✅ v0.3.6: заявка от ДРУГОЙ ВКЛАДКИ (тот же аккаунт, свой sid) —
    // это живой игрок-тестер, принимаем; true-свой (тот же sid) — нет
    var isSiblingTab = !fromServer && m.sid && m.sid !== SID;
    if (aid === myAid() && !fromServer && !isSiblingTab) return;
    var res = BrixState.socialRequestIn(aid, name);
    if (res === 'auto') {
      // взаимная заявка — сразу друзья, сообщаем встречно
      respond(aid, name, 'accept');
    } else if (res === 'in') {
      toast(name + ' ' + BrixState.t('fr.requestIn'));
      try { menuAudio.click(); } catch (e) {}
    }
    emitChange();
  }

  /** ответ на МОЁ приглашение */
  function onResponse(m) {
    var so = S();
    var byAid = m.aid || m.fromId || '';
    // по ID аккаунта, а для серверного пути — и по имени (ответ приходит с сервера)
    var mine = so.outgoing.filter(function (f) { return f.id === byAid; })[0] ||
      (m.fromName ? so.outgoing.filter(function (f) {
        return f.name.toLowerCase() === String(m.fromName).toLowerCase();
      })[0] : null);
    if (!mine) return;
    if (m.res === 'accept') {
      // принимаем: убираем из «моих приглашений», добавляем в друзья
      so.outgoing = so.outgoing.filter(function (f) { return f !== mine; });
      if (!so.friends.some(function (f) { return f.id === mine.id; })) {
        so.friends.push({ id: mine.id, name: m.fromName || mine.name, at: Date.now() });
      }
      BrixState.socialNotif({ kind: 'accepted',
        text: BrixState.t('fr.notifAccepted', { name: m.fromName || mine.name }) });
      try { menuAudio.buy(); } catch (e) {}
    } else {
      // отказ: уведомление с датой и кнопками «Отправить опять» / «Понятно»
      so.outgoing = so.outgoing.filter(function (f) { return f !== mine; });
      BrixState.socialNotif({ kind: 'declined', name: m.fromName || mine.name,
        text: BrixState.t('fr.notifDeclined', { name: m.fromName || mine.name }) });
      try { menuAudio.error(); } catch (e) {}
    }
    emitChange();
  }

  function respond(toAid, toName, res) {
    // вкладкам — напрямую; на сервер — по имени (адресат ищется по нику)
    postToPeers({ t: 'fres', toAid: toAid, res: res });
    viaServer(toName || '', res === 'accept' ? 'faccept' : 'fdecline',
      { toAid: toAid });
  }

  /* ================= ИСХОДЯЩЕЕ ================= */

  /** пригласить игрока по нику или ID (BRIX-XXXXXX) */
  function invite(query) {
    var q = String(query || '').trim();
    if (!q) return 'empty';
    var so = S();

    var aidGuess = /^BRIX-[A-Z2-9]{6}$/i.test(q) ? q.toUpperCase() : null;
    // ✅ v0.3.6: другой TAB того же аккаунта — живой игрок, приглашать можно
    var selfPeer = null;
    for (var ks in peers) {
      if (peers[ks].name.toLowerCase() === q.toLowerCase() ||
          peers[ks].aid === q) { selfPeer = peers[ks]; break; }
    }
    if (!selfPeer) {
      if (q.toLowerCase() === myName().toLowerCase() || q === myAid()) return 'self';
      if (so.friends.some(function (f) {
        return f.id === q || f.name.toLowerCase() === q.toLowerCase();
      })) return 'dup';
      if (so.outgoing.some(function (f) {
        return f.id === q || f.name.toLowerCase() === q.toLowerCase();
      })) return 'dup';
    }

    // 1) среди живых вкладок этого браузера (по имени или ID аккаунта)
    var peer = null;
    for (var k in peers) {
      var p = peers[k];
      if (p.aid === q || p.name.toLowerCase() === q.toLowerCase()) { peer = p; break; }
    }
    if (peer) {
      BrixState.socialInvite(peer.aid || ('srv-' + peer.name), peer.name);
      postToPeers({ t: 'freq', toAid: peer.aid || '', toName: peer.name });
      emitChange();
      return 'sent';
    }
    // 2) через сервер (по нику): в игре — по WS, из меню — по HTTP
    if (viaServer(q, 'finvite', { toAid: aidGuess })) {
      BrixState.socialInvite(aidGuess || ('srv-' + q), q);
      emitChange();
      return 'sent';
    }
    if (aidGuess) return 'offline';      // по ID — только онлайн-игроки
    BrixState.socialInvite('srv-' + q, q);
    httpInvite(q);
    emitChange();
    return 'sent';
  }

  function accept(id, name) {
    var req = BrixState.socialAccept(id);
    if (!req) return;
    // вкладкам — напрямую по ID аккаунта; серверу — по имени приглашённого
    postToPeers({ t: 'fres', toAid: id, res: 'accept' });
    viaServer(name || '', 'faccept', { toAid: id });
    emitChange();
  }

  function decline(id, name) {
    BrixState.socialDecline(id);
    postToPeers({ t: 'fres', toAid: id, res: 'decline' });
    viaServer(name || '', 'fdecline', { toAid: id });
    emitChange();
  }

  function cancelOut(id, name) {
    BrixState.socialCancelOut(id);
    emitChange();
  }

  /** «Отправить опять» из колокольчика */
  function resend(name) { return invite(name); }

  /* ================= ПРИСУТСТВИЕ ================= */

  function computeSelfStatus() {
    var inGame = window.BrixGame && BrixGame.state.phase !== 'idle';
    return inGame ? 'game' : 'lobby';
  }

  function prunePeers() {
    var now = Date.now(), changed = false;
    for (var k in peers) {
      if (now - peers[k].last > 7000) { delete peers[k]; changed = true; }
    }
    return changed;
  }

  function tick() {
    selfStatus = computeSelfStatus();
    var changed = prunePeers();
    postToPeers({ t: 'pres', st: selfStatus });
    if (changed) emitChange();
  }

  /** статус друга: 'server' | 'lobby' | 'offline' */
  function statusOf(friend) {
    for (var k in peers) {
      var p = peers[k];
      if (p.aid === friend.id ||
          p.name.toLowerCase() === friend.name.toLowerCase()) {
        if (p.status === 'game') return 'server';
        return 'lobby';
      }
    }
    if (serverInfo.ok && serverInfo.names.some(function (n) {
      return n.toLowerCase() === friend.name.toLowerCase();
    })) return 'server';
    return 'offline';
  }

  /* ================= ИГРОКИ ДЛЯ ПОИСКА ================= */

  /** все известные живые игроки (вкладки этого браузера + сервер) */
  function knownPlayers() {
    var out = {};
    for (var k in peers) {
      var p = peers[k];
      var key = p.aid || ('srv-' + p.name);
      out[key] = { id: key, name: p.name };
    }
    if (serverInfo.ok) {
      serverInfo.names.forEach(function (n) {
        var key = 'srv-' + n;
        if (!out[key]) out[key] = { id: key, name: n };
      });
    }
    return out;
  }

  /* ================= ОНЛАЙН СЕРВЕРА (/status) ================= */

  function statusUrl() {
    try {
      if (location.port === '8787') return location.origin + '/status';
    } catch (e) {}
    return 'http://localhost:8787/status';
  }

  function pollStatus() {
    fetch(statusUrl(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.ok) {
          var changed = serverInfo.players !== j.players || serverInfo.ok !== true;
          serverInfo = { ok: true, players: j.players, max: j.max, inGame: j.inGame, names: j.names || [], ts: Date.now() };
          if (changed) emitChange();
        } else throw new Error('bad');
      })
      .catch(function () {
        if (serverInfo.ok) { serverInfo = { ok: false, players: 0, names: [], ts: Date.now() }; emitChange(); }
      });
  }

  /* ================= ИНИЦИАЛИЗАЦИЯ ================= */

  function init() {
    if (inited) return;
    inited = true;
    myAid();
    tick();
    setInterval(tick, 2000);          // присутствие каждые 2 с
    pollStatus();
    setInterval(pollStatus, 3000);    // онлайн сервера каждые 3 с
    window.addEventListener('beforeunload', function () {
      if (bc) try { bc.postMessage({ t: 'pres', st: 'bye', sid: SID }); } catch (e) {}
    });

    // входящие с сервера
    if (window.BrixNet) {
      BrixNet.on('social', function (msg) {
        if (msg.kind === 'finvite') {
          onInvite({ aid: msg.fromId, fromName: msg.from }, true);
        } else if (msg.kind === 'faccept' || msg.kind === 'fdecline') {
          onResponse({ res: msg.kind === 'faccept' ? 'accept' : 'decline',
            aid: msg.data && msg.data.toAid, fromName: msg.from });
        }
      });
      BrixNet.on('socialMiss', function (msg) {
        toast(BrixState.t('fr.notFound', { name: msg.to || '' }));
        var so = S();
        so.outgoing = so.outgoing.filter(function (f) { return f.name !== msg.to; });
        emitChange();
      });
    }
  }

  return {
    init: init,
    invite: invite,
    accept: accept,
    decline: decline,
    cancelOut: cancelOut,
    resend: resend,
    statusOf: statusOf,
    knownPlayers: knownPlayers,
    peers: function () { return peers; },
    serverInfo: function () { return serverInfo; },
    selfStatus: function () { return selfStatus; },
    sessionId: function () { return SID; },
    fmtDate: fmtDate,
    pluralPeople: pluralPeople,
    /** ОБЩИЙ онлайн для меню: число меняет ТОЛЬКО СЕРВЕР.
     *  Сервер недоступен (режим вкладок) — считаем вкладки в игре. */
    onlineTotal: function () {
      if (serverInfo.ok) return serverInfo.players;
      var game = 0;
      for (var k in peers) { if (peers[k].status === 'game') game++; }
      return game;
    }
  };
})();
