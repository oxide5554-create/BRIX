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
      /* ✅ v0.4.62: заявка — в КОЛОКОЛЬЧИК (просьба игрока: «сообщение
         приходит игроку в вкладку где колокольчик — «вам предложили
         дружить» и там игнорировать или принят») */
      try {
        BrixState.socialNotif({ kind: 'invite', name: name,
          text: BrixState.t('fr.notifInvite', { name: name }) });
      } catch (eN) {}
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

  /* ================= ВСЕ ИГРОКИ (✅ v0.4.62) ================= */

  /** «в сети сейчас» / «был(а) N мин/ч/дн назад» — для вкладки ВСЕ ИГРОКИ */
  function lastSeenText(p) {
    if (p.on) return BrixState.t('fr.onlineNow');
    var d = Math.max(0, Date.now() - (Number(p.ls) || 0));
    var mins = Math.floor(d / 60000);
    if (mins < 60) return BrixState.t('fr.lastSeenMin', { n: Math.max(1, mins) });
    var hrs = Math.floor(mins / 60);
    if (hrs < 48) return BrixState.t('fr.lastSeenH', { n: hrs });
    return BrixState.t('fr.lastSeenD', { n: Math.floor(hrs / 24) });
  }

  var allPlayers = [];       // реестр сервера: [{id, name, on, ls}] — ls = был в сети
  function requestAll() {
    if (window.BrixNet && BrixNet.mode === 'server') {
      try { BrixNet.send({ t: 'plist' }); } catch (e) {}
    }
  }

  /** все игроки, которые ИГРАЛИ или ИГРАЮТ: реестр сервера
     (social.json: aid, имя, «был в сети») + живые вкладки + ростер.
     Онлайн-статус живых перекрывает «был в сети» из реестра */
  function allPlayersList() {
    var out = {};
    (allPlayers || []).forEach(function (p) {
      if (p && p.id) out[p.id] = { id: p.id, name: p.name || 'Игрок',
        on: p.on ? 1 : 0, ls: Number(p.ls) || 0 };
    });
    // живой ростер сервера — «в сети сейчас», точное имя
    if (serverInfo.ok && serverInfo.names) {
      serverInfo.names.forEach(function (n) {
        var key = 'srv-' + n;
        var ex = null;
        for (var k in out) {
          if (out[k].name.toLowerCase() === String(n).toLowerCase()) { ex = out[k]; break; }
        }
        if (ex) { ex.on = 1; ex.ls = Date.now(); }
        else out[key] = { id: key, name: n, on: 1, ls: Date.now() };
      });
    }
    // вкладки этого браузера — тоже живые игроки
    for (var pk in peers) {
      var p2 = peers[pk];
      var key2 = p2.aid || ('srv-' + p2.name);
      var ex2 = null;
      for (var k3 in out) {
        if (out[k3].name.toLowerCase() === String(p2.name).toLowerCase()) { ex2 = out[k3]; break; }
      }
      if (ex2) { ex2.on = 1; ex2.ls = Date.now(); }
      else out[key2] = { id: key2, name: p2.name, on: 1, ls: Date.now() };
    }
    var arr = Object.keys(out).map(function (k) { return out[k]; });
    arr.sort(function (a, b) { return (b.on - a.on) || (b.ls - a.ls); });
    return arr;
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

  /* ✅ v0.4.64: /status ОБОИХ серверов (BrixLand 8787, BrixPvP 8788) —
     у вкладки «СЕРВЕРА» свой живой счётчик у каждого. Опрос всех портов
     из BrixData.SERVERS одним таймером; serverInfo(port) отдаёт кэш. */
  function statusUrl(port) {
    var p = Number(port) || 8787;
    try {
      if (location.port === String(p)) return location.origin + '/status';
    } catch (e) {}
    return 'http://' + (location.hostname || 'localhost') + ':' + p + '/status';
  }

  var statusCache = {};    // port -> {ok, players, max, inGame, names, ts, adminIds}

  function pollStatus() {
    var ports = [8787];
    if (window.BrixData && BrixData.SERVERS) {
      BrixData.SERVERS.forEach(function (s) {
        var p = Number(s.port) || 8787;
        if (ports.indexOf(p) === -1) ports.push(p);
      });
    }
    ports.forEach(function (port) {
      fetch(statusUrl(port), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (j && j.ok) {
            var prev = statusCache[port] || serverInfo;
            var changed = prev.players !== j.players || prev.ok !== true;
            statusCache[port] = {
              ok: true, players: j.players, max: j.max, inGame: j.inGame,
              names: j.names || [], ts: Date.now(),
              /* adminIds — для «магазин скинами только у админов» */
              adminIds: j.adminIds || null,
              mode: j.mode || null
            };
            if (port === 8787) {
              serverInfo = statusCache[port];   // старые потребители (дом, друзья)
              if (changed) emitChange();
            }
          } else throw new Error('bad');
        })
        .catch(function () {
          var prev = statusCache[port];
          if (prev && prev.ok) {
            statusCache[port] = { ok: false, players: 0, names: [], ts: Date.now() };
            if (port === 8787) { serverInfo = statusCache[port]; emitChange(); }
          }
        });
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
    requestAll();
    setInterval(requestAll, 12000);   // ✅ v0.4.62: реестр игроков каждые 12 с
    window.addEventListener('beforeunload', function () {
      if (bc) try { bc.postMessage({ t: 'pres', st: 'bye', sid: SID }); } catch (e) {}
    });

    // входящие с сервера
    if (window.BrixNet) {
      BrixNet.on('plist', function (msg) {
        allPlayers = (msg && Array.isArray(msg.list)) ? msg.list : [];
        emitChange();
      });
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
    allPlayersList: allPlayersList,   // ✅ v0.4.62: все игравшие/играющие
    lastSeenText: lastSeenText,       // ✅ v0.4.62: «был N ч назад»
    peers: function () { return peers; },
    /* ✅ v0.4.64: online КОНКРЕТНОГО сервера — serverInfo(порт) без
       аргумента = BrixLand 8787 (как раньше) */
    serverInfo: function (port) {
      if (port === undefined || port === null || Number(port) === 8787) return serverInfo;
      return statusCache[Number(port)] || { ok: false, players: 0, names: [] };
    },
    /* ✅ v0.4.64: ЭТОТ аккаунт — админ? (по adminIds из /status; до
       ответа сервера считаем админом и после adminon в игре) */
    isAdminAccount: function () {
      if (window.BrixAdmin && BrixAdmin.enabled) return true;
      var aid = myAid();
      if (!aid) return false;
      for (var k in statusCache) {
        var c = statusCache[k];
        if (c.ok && c.adminIds && c.adminIds.indexOf(aid) !== -1) return true;
      }
      return false;
    },
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
