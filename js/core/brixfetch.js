/* ============================================================
   brix • js/core/brixfetch.js — АССЕТЫ С RETRY (v0.5.9)

   Через Dev Tunnels тяжёлые файлы падают: 504 Gateway Timeout,
   ERR_HTTP2_PROTOCOL_ERROR (fetch кидает TypeError), медленный
   первый прогрев туннеля. Браузер сам НЕ переспрашивает — игра
   висела на загрузке (53%/79%). Правила для всех ассетов:
   · 3 попытки, между ними пауза 2 сек;
   · таймаут попытки 10 сек (AbortController);
   · повтор при: сетевом сбое (в т.ч. ERR_HTTP2_PROTOCOL_ERROR),
     ответах 5xx (в т.ч. 504) и 429; 404/403 НЕ повторяем —
     файл не появится;
   · image() после последней попытки отдаёт null («мягкий» отказ) —
     вызывающий рисует заглушку/пропускает, игра НЕ виснет;
   · bytes() бросает исключение после 3-й попытки — у glb.js и
     звука свои fallback'и (встроенная копия/синтез).
   ============================================================ */
window.BrixFetch = (function () {
  'use strict';

  var TRIES = 3, DELAY = 2000, TIMEOUT = 10000;

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  /** ArrayBuffer с retry. opts: {tries, delay, timeout, cache} */
  function bytes(u, opts) {
    opts = opts || {};
    var tries = opts.tries || TRIES,
        delay = opts.delay || DELAY,
        timeout = opts.timeout || TIMEOUT;
    var lastErr = null;

    function attempt(n) {
      var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timer = ctl ? setTimeout(function () {
        try { ctl.abort(); } catch (e) {}
      }, timeout) : null;
      var opt = ctl ? { signal: ctl.signal } : {};
      opt.cache = opts.cache || 'default';
      return fetch(u, opt)
        .then(function (r) {
          if (timer) clearTimeout(timer);
          if (r.ok) return r.arrayBuffer();
          /* 404/403 — файла нет и не появится: повтор бессмыслен */
          if (r.status < 500 && r.status !== 429) {
            var noRetry = new Error('HTTP ' + r.status);
            noRetry.noRetry = true;
            throw noRetry;
          }
          /* 500/502/503/504/429 — туннель/прокси, надо переспросить */
          throw new Error('HTTP ' + r.status);
        })
        .catch(function (err) {
          if (timer) clearTimeout(timer);
          lastErr = err;
          if (err && err.noRetry) throw err;   // 404/403 — сразу навсегда
          if (n + 1 < tries) {
            console.warn('[BrixFetch] ' + u + ' — попытка ' + (n + 1) + '/' + tries +
              ' не удалась (' + ((err && err.message) || err) + '), повтор через ' + delay + ' мс');
            return sleep(delay).then(function () { return attempt(n + 1); });
          }
          throw lastErr;
        });
    }
    return attempt(0);
  }

  /** Image с retry. opts.tries/delay/timeout; opts.softFail (по умолч.
      true) → resolve(null) вместо исключения после 3-й попытки */
  function image(u, opts) {
    opts = opts || {};
    var tries = opts.tries || TRIES,
        delay = opts.delay || DELAY,
        timeout = opts.timeout || TIMEOUT;
    var softFail = opts.softFail !== false;

    function attempt(n) {
      return new Promise(function (ok, no) {
        if (typeof Image === 'undefined') { no(new Error('нет Image')); return; }
        var im = new Image();
        var done = false;
        var timer = setTimeout(function () {
          if (done) return;
          done = true;
          im.src = '';
          no(new Error('таймаут ' + timeout + ' мс'));
        }, timeout);
        im.onload = function () {
          if (done) return;
          done = true; clearTimeout(timer); ok(im);
        };
        im.onerror = function () {
          if (done) return;
          done = true; clearTimeout(timer); no(new Error('не грузится'));
        };
        im.src = u;
      }).catch(function (err) {
        if (n + 1 < tries) {
          console.warn('[BrixFetch] ' + u + ' — попытка ' + (n + 1) + '/' + tries +
            ' не удалась (' + ((err && err.message) || err) + '), повтор через ' + delay + ' мс');
          return sleep(delay).then(function () { return attempt(n + 1); });
        }
        if (softFail) {
          console.warn('[BrixFetch] ' + u + ' — ЗАГЛУШКА (все ' + tries + ' попытки исчерпаны)');
          return null;
        }
        throw err;
      });
    }
    return attempt(0);
  }

  return {
    bytes: bytes,
    image: image,
    sleep: sleep,
    TRIES: TRIES,
    DELAY: DELAY,
    TIMEOUT: TIMEOUT
  };
})();
