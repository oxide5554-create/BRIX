/* ============================================================
   brix • js/core/patch.js — ЗАГРУЗОЧНЫЙ ЭКРАН ОБНОВЛЕНИЙ (v0.5.12)

   Сплэш при старте страницы теперь показывает РЕАЛЬНУЮ загрузку
   обновлений: server.js отдаёт /manifest.json (список файлов кода
   и мелких ассетов с размерами и mtime), клиент сравнивает его со
   своими записями в localStorage ('brixPatch') и докачивает ТО,
   ЧТО ИЗМЕНИЛОСЬ — сколько бы обновлений игрок ни пропустил:
   все МБ/КБ/ГБ суммируются в один прогресс с реальными байтами
   (stream reader). Нечего качать (или сервер старый/недоступен) —
   сплэш скрывается сразу и меню открывается без задержки.

   Объём манифеста: index.html, js/, css/, assets/icons,
   assets/menu, assets/fonts, assets/textures (~30 МБ всего).
   Тяжёлые media (models 107 МБ, sfx) не в списке: они отдаются
   с Cache-Control immutable на год и меняются крайне редко.
   ============================================================ */
window.BrixPatch = (function () {
  'use strict';

  var MAX_WAIT = 25000;      // предохранитель: не держим меню дольше
  var PARALLEL = 3;          // одновременных загрузок

  var rec = null;            // {build, files:{url:{m,s}}}

  function loadRecords() {
    try { return JSON.parse(localStorage.getItem('brixPatch') || '{}'); }
    catch (e) { return {}; }
  }
  function saveRecords() {
    try { localStorage.setItem('brixPatch', JSON.stringify(rec)); } catch (e) {}
  }

  /* ---------- мини-UI на сплэше ---------- */
  var uiReady = false;
  function uiEnsure() {
    if (uiReady) return;
    uiReady = true;
    var box = document.getElementById('splashUpd');
    if (box) box.style.display = 'block';
  }
  function fmt(b) {
    if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' ГБ';
    if (b >= 1048576) return (b / 1048576).toFixed(1) + ' МБ';
    return Math.max(0, Math.round(b / 1024)) + ' КБ';
  }
  function uiText(s) {
    var el = document.getElementById('splashUpdText');
    if (el) el.textContent = s;
  }
  function uiProgress(done, total) {
    var fill = document.getElementById('splashUpdFill');
    if (fill) fill.style.width = (total ? Math.round(done / total * 100) : 100) + '%';
    uiText('ЗАГРУЗКА ОБНОВЛЕНИЙ · ' + fmt(done) + ' / ' + fmt(total));
  }

  /* ---------- манифест ---------- */
  function fetchManifest() {
    return new Promise(function (ok) {
      var t = setTimeout(function () { ok(null); }, 4000);
      try {
        fetch('manifest.json?ts=' + Date.now(), { cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) { clearTimeout(t); ok(j && j.ok ? j : null); })
          .catch(function () { clearTimeout(t); ok(null); });
      } catch (e) { clearTimeout(t); ok(null); }
    });
  }

  /** что изменилось с прошлой загрузки: mtime/size или новый файл */
  function diffFiles(man) {
    var old = (rec && rec.files) || {};
    return (man.files || []).filter(function (f) {
      var p = old[f.u];
      return !p || p.m !== f.m || p.s !== f.s;
    });
  }

  /** одна загрузка с РЕАЛЬНЫМ подсчётом байт (stream reader) */
  function downloadOne(f, onBytes) {
    return new Promise(function (done) {
      try {
        fetch(f.u, { cache: 'reload' })   // мимо кэша: честные байты
          .then(function (r) {
            if (!r || !r.ok) { done(0); return; }
            if (r.body && r.body.getReader) {
              var reader = r.body.getReader();
              var got = 0;
              function step() {
                reader.read().then(function (chunk) {
                  if (chunk.done) { done(got); return; }
                  got += chunk.value.byteLength;
                  onBytes(chunk.value.byteLength);
                  step();
                }).catch(function () { done(got); });
              }
              step();
            } else {
              r.arrayBuffer().then(function (buf) {
                onBytes(buf.byteLength);
                done(buf.byteLength);
              }).catch(function () { done(0); });
            }
          })
          .catch(function () { done(0); });
      } catch (e) { done(0); }
    });
  }

  /**
   * Проверка обновлений при старте. onDone вызывается ВСЕГДА
   * (не загрузили / нечего загружать / таймаут — меню открывается).
   */
  function run(onDone) {
    rec = loadRecords();
    var finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      try { onDone && onDone(); } catch (e2) {}
    }
    var guard = setTimeout(finish, MAX_WAIT);

    fetchManifest().then(function (man) {
      if (!man) { clearTimeout(guard); finish(); return; }   // старый сервер — сразу меню
      var changed = diffFiles(man);
      if (!changed.length) {
        /* нечего обновлять — запоминаем сборку и сразу меню */
        rec = { build: man.build || '', ts: Date.now(),
          files: indexFiles(man) };
        saveRecords();
        clearTimeout(guard);
        finish();
        return;
      }
      var total = 0, done = 0;
      changed.forEach(function (f) { total += Number(f.s) || 0; });
      uiEnsure();
      uiProgress(done, total);
      console.log('[Patch] обновлений: ' + changed.length + ' файлов, ' + fmt(total));
      var i = 0;
      function worker() {
        if (i >= changed.length) return Promise.resolve();
        var f = changed[i++];
        return downloadOne(f, function (n) {
          done += n;
          uiProgress(done, total);
        }).then(function (bytes) {
          rec.files = rec.files || {};
          rec.files[f.u] = { m: f.m, s: f.s };
          if (!bytes) console.warn('[Patch] не докачан: ' + f.u);
          return worker();
        });
      }
      var ws = [];
      for (var w = 0; w < PARALLEL && w < changed.length; w++) ws.push(worker());
      Promise.all(ws).then(function () {
        rec.build = man.build || '';
        rec.ts = Date.now();
        saveRecords();
        clearTimeout(guard);
        console.log('[Patch] обновление загружено: ' + fmt(done));
        finish();
      }, function () { clearTimeout(guard); finish(); });
    });
  }

  /** полный индекс манифеста — хранится, чтобы на след. старт сравнивать */
  function indexFiles(man) {
    var out = {};
    (man.files || []).forEach(function (f) { out[f.u] = { m: f.m, s: f.s }; });
    return out;
  }

  return { run: run };
})();
