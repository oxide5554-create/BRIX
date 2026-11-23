/* ============================================================
 *  brix • js/net/wsurl.js — АДРЕС СЕРВЕРА ПО ОКРУЖЕНИЮ (v0.5.8)
 *
 *  ✅ Проблема: игра работала только на http://localhost — при
 *  пробросе порта через Dev Tunnels (https://) браузер блокировал
 *  НЕЗАЩИЩЁННОЕ подключение ws:// (Mixed Content), и игра уходила
 *  в «БЕЗ сервера».
 *
 *  Решение — адрес определяется автоматически из адреса страницы:
 *   · http://localhost:8787            → ws://localhost:8787 (как было)
 *   · http://192.168.1.5:8787 (LAN)    → ws://192.168.1.5:8787 (как было)
 *   · https://lpxm82mp-8787.euw.devtunnels.ms (Dev Tunnels)
 *       → wss://lpxm82mp-8787.euw.devtunnels.ms (главный)
 *       → wss://lpxm82mp-8788.euw.devtunnels.ms (PvP)
 *     Dev Tunnels даёт КАЖДОМУ порту свой поддомен вида
 *     <id>-<порт>.<регион>.devtunnels.ms и сам проксирует wss://
 *     на локальный ws:// — SSL на Node.js НЕ нужен;
 *   · https://мой-домен (реверс-прокси на том же хосте)
 *       → wss://мой-домен (тот же хост, прокси разрулит порты);
 *
 *  Ручной оверрайд (приоритет выше автоопределения):
 *   · ?brixws=wss://host:port   — параметр адресной строки;
 *   · localStorage['brix-ws']   — для всех портов;
 *   · localStorage['brix-ws-8788'] — для конкретного порта.
 * ============================================================ */
window.BrixWsUrl = (function () {
  'use strict';

  /* Dev Tunnels: <id>-<порт>.<регион>.<...> — id ленивый, порт
     обязателен цифрами 2–5 знаков и дальше ТОЧКА (иначе «42» в
     «tun-42-8787» совпадёт неправильно; регексп откатится к 8787) */
  var TUNNEL_RE = /^(.+?)-(\d{2,5})((?:\.[^.]+)+)$/;

  function override(port, loc) {
    try {
      var qs = new URLSearchParams(loc.search || '');
      var ov = qs.get('brixws');
      if (!ov && window.localStorage) {
        ov = window.localStorage.getItem('brix-ws-' + port) ||
             window.localStorage.getItem('brix-ws');
      }
      if (ov) return String(ov).replace(/^http/i, 'ws'); // http(s)→ws(s)
    } catch (e) {}
    return null;
  }

  /* базовые части хоста: [порт-в-поддомене | null, хост-строка] */
  function parts(port, loc, proto) {
    var ov = override(port, loc);
    if (ov) return ov;
    var host = loc.hostname || 'localhost';
    var m = (proto === 'https') ? TUNNEL_RE.exec(host) : null;
    if (m) return (proto === 'https' ? 'wss://' : 'ws://') +
      m[1] + '-' + port + m[3];
    if (proto === 'https') {
      // реверс-прокси без «порта в поддомене»: тот же хост/порт
      return 'wss://' + (loc.host || host);
    }
    // обычный http-хостинг — прежнее поведение (порт как есть)
    return 'ws://' + host + ':' + port;
  }

  return {
    /** адрес WebSocket для порта `port` (8787 главный, 8788 PvP) */
    ws: function (port, loc) {
      var loc2 = loc || window.location;
      return parts(Number(port) || 8787, loc2,
        loc2.protocol === 'https:' ? 'https' : 'http');
    },
    /** адрес HTTP (GET /status, POST /invite) для того же порта */
    http: function (port, loc) {
      var p = Number(port) || 8787, loc2 = loc || window.location;
      var ov = override(p, loc2);
      if (ov) return ov.replace(/^ws/i, 'http');      // ws(s)→http(s)
      var host = loc2.hostname || 'localhost';
      var m = (loc2.protocol === 'https:') ? TUNNEL_RE.exec(host) : null;
      if (m) return 'https://' + m[1] + '-' + p + m[3];
      if (loc2.protocol === 'https:') return 'https://' + (loc2.host || host);
      return 'http://' + host + ':' + p;
    },
    /** true, если страница открыта по https (туннель/прокси) */
    isSecure: function () {
      try { return window.location.protocol === 'https:'; } catch (e) { return false; }
    }
  };
})();
