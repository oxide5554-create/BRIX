// ============================================================
//  brix • js/game/minimenu.js
//  ✅ v0.4.3 МИНИ-МЕНЮ В ИГРЕ (клавиша M) — по референсу
//  «Admin Menu» (Rust): игра остаётся на сервере и ВИДНА
//  за спиной, тёмнеют только углы (вигнетка). Слева — крупные
//  пункты, как в референсе:
//    ПРОДОЛЖИТЬ      — закрыть мини-меню, игра снова идёт;
//    СПИСОК ИГРОКОВ  — панель в правом углу: ники, уровни и ID
//                      ВСЕХ игроков этого сервера. Закрывается
//                      ПОВТОРНЫМ нажатием той же кнопки, а также
//                      сама при закрытии мини-меню;
//    КАРТА           — карта мира на весь экран со СВОБОДНОЙ
//                      мышью: настоящий рельеф Brixland (горы,
//                      море, озеро, пляжи — те же цвета, что у
//                      3D-земли), сетка квадратов A1–F6 как в
//                      Rust, игрок обозначен СВОЕЙ иконкой
//                      (assets/marker.webp, белый фон убираем
//                      КОДОМ) — маленькой, точно под игроком,
//                      острым концом ВПЕРЁД по взгляду. Закрытие
//                      — крестик в углу → возврат в мини-меню;
//    ВЫХОД В МЕНЮ    — маленькое окно «Вы точно хотите выйти?»
//                      с кнопками НЕТ / ДА, где ДА разблокируется
//                      только через 5 секунд (защита от случайного
//                      выхода, таймер на кнопке);
//  Пока мини-меню/карта открыты: управление отключено,
//  инвентарь (E) и ящики (F) НЕ открываются, но рендер и сеть
//  ЖИВУТ — сервер видит игрока (12 Гц).
// ============================================================
window.BrixMiniMenu = (function () {
  'use strict';

  var opts = null;          // { getPos, onExit } — от gameworld.js
  var root = null;          // слой мини-меню (вигнетка + пункты)
  var mapRoot = null;       // слой карты
  var listEl = null;        // панель списка игроков
  var listOpen = false;
  var menuOpen = false;
  var mapOpen = false;
  var listTimer = null;
  var mapImage = null;      // offscreen canvas с готовой картой
  var mapBuilding = false;
  var markerImg = null;     // иконка игрока БЕЗ белого фона (canvas)

  /* ✅ v0.4.4: окошко подтверждения выхода «Вы точно хотите выйти?» */
  var quitRoot = null;
  var quitOpen = false;
  var quitTimer = null;
  var QUIT_WAIT = 5;        // секунд до разблокировки кнопки «ДА»

  function t(k, p) { return window.BrixState ? BrixState.t(k, p) : k; }

  function ax(u) { return window.BrixAsset ? window.BrixAsset(u) : u; }

  /* ============================================================
     ДОМ: создаётся лениво, один раз
     ============================================================ */

  function ensureRoot() {
    if (root) return root;
    root = document.createElement('div');
    root.id = 'brixMiniMenu';
    root.className = 'brix-mm hidden';
    // вигнетка: центр прозрачный (игра видна), углы тёмные
    root.innerHTML =
      '<div class="brix-mm-dim"></div>' +
      '<div class="brix-mm-col">' +
        '<div class="brix-mm-head">' +
          '<div class="brix-mm-title font-h">BRIX</div>' +
          '<div class="brix-mm-sub font-h">' + t('mm.subtitle') + '</div>' +
        '</div>' +
        '<div class="brix-mm-server">' +
          '<div class="name" id="brixMmSrvName"></div>' +
          '<div class="online" id="brixMmSrvOnline"></div>' +
        '</div>' +
        '<nav class="brix-mm-items" id="brixMmItems"></nav>' +
        '<div class="brix-mm-hint">' + t('mm.hint') + '</div>' +
      '</div>';
    document.body.appendChild(root);

    var items = root.querySelector('#brixMmItems');
    var defs = [
      { key: 'resume',  fn: onResume },
      { key: 'players', fn: toggleList },
      { key: 'map',     fn: openMap },
      { key: 'exit',    fn: openQuit }
    ];
    defs.forEach(function (d) {
      var b = document.createElement('button');
      b.className = 'brix-mm-item font-h';
      b.dataset.mm = d.key;
      b.textContent = t('mm.' + d.key);
      b.onmouseenter = function () { if (window.menuAudio) menuAudio.hover(); };
      b.onclick = function () {
        if (window.menuAudio) menuAudio.click();
        d.fn();
      };
      items.appendChild(b);
    });

    /* ---------- панель списка игроков (правый угол) ---------- */
    listEl = document.createElement('div');
    listEl.id = 'brixMmList';
    listEl.className = 'brix-mm-list hidden';
    document.body.appendChild(listEl);
    return root;
  }

  function ensureMapRoot() {
    if (mapRoot) return mapRoot;
    mapRoot = document.createElement('div');
    mapRoot.id = 'brixMapOverlay';
    mapRoot.className = 'brix-map hidden';
    mapRoot.innerHTML =
      '<div class="brix-map-inner">' +
        '<canvas id="brixMapCanvas"></canvas>' +
        '<button class="brix-map-close" id="brixMapClose" title="' +
          t('mm.mapClose') + '">' + (window.BrixIcon ? BrixIcon('x', 20) : 'X') + '</button>' +
        '<div class="brix-map-sector font-h" id="brixMapSector"></div>' +
        '<div class="brix-map-build font-h" id="brixMapBuild">' + t('mm.mapBuild') + '</div>' +
      '</div>';
    document.body.appendChild(mapRoot);
    mapRoot.querySelector('#brixMapClose').onclick = function () {
      if (window.menuAudio) menuAudio.back();
      closeMap();           // ✅ после карты — снова мини-меню
    };
    return mapRoot;
  }

  /* ============================================================
     СОСТОЯНИЕ: открыто/закрыто
     ============================================================ */

  function isOpen() { return menuOpen; }

  /** открыт ЛЮБОЙ слой (мини-меню или карта) — управление стоит */
  function isAnyOpen() { return menuOpen || mapOpen; }

  function blockedByOtherUi() {
    var inv = window.BrixInventory && BrixInventory.get();
    if (inv && inv.isOpen) return true;
    if (window.BrixLootMenu && BrixLootMenu.isOpen()) return true;
    /* ✅ v0.4.25: крафт-панель (Q) открыта — M молчит */
    if (window.BrixCraft && BrixCraft.isOpen()) return true;
    return false;
  }

  function open() {
    if (menuOpen || mapOpen || quitOpen || !opts) return;
    if (blockedByOtherUi()) return;               // инвентарь/лут открыты — M молчит
    if (!window.BrixGame || BrixGame.state.phase !== 'playing') return;
    menuOpen = true;
    ensureRoot();
    root.classList.remove('hidden');
    paintServer();
    // ✅ v0.4.4 старую карточку-паузу прячем: сейчас своя панель поверх игры
    // (в headless/без захвата мыши она могла висеть с момента спавна)
    var pause = document.getElementById('pauseOverlay');
    if (pause) pause.classList.add('hidden');
    var hud = document.getElementById('gameHud');
    if (hud) hud.classList.remove('dimmed');
    // мышь освобождаем (пункты кликабельны), игра продолжает рендер и сеть
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) {}
  }

  /** ✅ v0.4.4: список игроков закрывается ВМЕСТЕ с мини-меню */
  function closeList() {
    listOpen = false;
    if (listEl) listEl.classList.add('hidden');
    var btn = root && root.querySelector('[data-mm="players"]');
    if (btn) btn.classList.remove('active');
  }

  function closeAll() {
    menuOpen = false;
    mapOpen = false;
    if (root) root.classList.add('hidden');
    if (mapRoot) mapRoot.classList.add('hidden');
    closeList();
    stopListTimer();
  }

  /** ПРОДОЛЖИТЬ / M / ESC — закрыть всё и вернуть мышь в игру */
  function onResume() {
    closeAll();
    if (!opts) return;
    var canvas = document.querySelector('#gameMount canvas');
    if (canvas && window.BrixGame && BrixGame.state.phase === 'playing') {
      try { var p = canvas.requestPointerLock(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    }
  }

  /** M: окошко выхода → карта → мини-меню → закрыть всё */
  function toggle() {
    if (quitOpen) return;             // окошко поверх — M молчит
    if (mapOpen) { closeMap(); return; }
    if (menuOpen) { onResume(); return; }
    open();
  }

  /* ============================================================
     ШАПКА: имя сервера + живой онлайн
     ============================================================ */

  function paintServer() {
    /* ✅ v0.4.64: имя ТЕКУЩЕГО сервера (brixland/brixpvp), не только
       «админ-сервер»: смотрим serverId, на который подключились */
    var srv = (window.BrixData && BrixData.serverById && window.BrixGame)
      ? BrixData.serverById(BrixGame.state.serverId) : null;
    if (!srv) srv = (window.BrixData && BrixData.ADMIN_SERVER) || {};
    var nameEl = root.querySelector('#brixMmSrvName');
    var onlineEl = root.querySelector('#brixMmSrvOnline');
    nameEl.textContent = srv.name || 'BRIX';
    var n = 0;
    if (window.BrixNet) {
      var roster = BrixNet.getRoster();
      n = roster.length;
      // в серверном режиме сервер пушит точное число подключений
      if (BrixNet.mode === 'server' && window.__brixServerCount !== undefined) {
        n = window.__brixServerCount;
      }
    }
    onlineEl.textContent = t('mm.online', { n: n, max: srv.max || 64 });
  }

  /* ============================================================
     СПИСОК ИГРОКОВ (правый угол): ник · уровень · ID
     ============================================================ */

  function toggleList() {
    listOpen = !listOpen;
    if (listOpen) {
      ensureRoot();
      paintList();
      listEl.classList.remove('hidden');
      // живое обновление: кто-то вошёл/вышел — список сам переписывается
      stopListTimer();
      listTimer = setInterval(function () {
        if (!menuOpen || !listOpen) { stopListTimer(); return; }
        paintList();
      }, 1000);
    } else {
      closeList();
      return;
    }
    var btn = root.querySelector('[data-mm="players"]');
    if (btn) btn.classList.add('active');
  }

  function stopListTimer() {
    if (listTimer) { clearInterval(listTimer); listTimer = null; }
  }

  function paintList() {
    var roster = window.BrixNet ? BrixNet.getRoster() : [];
    var srv = (window.BrixData && BrixData.ADMIN_SERVER) || {};
    var rows = '';
    roster.forEach(function (p) {
      var lvl = (p.lvl !== undefined && p.lvl !== null) ? p.lvl : '—';
      rows +=
        '<div class="brix-mm-row' + (p.self ? ' self' : '') + '">' +
          '<div class="nick" title="' + escapeHtml(p.n || '') + '">' +
            escapeHtml(p.n || '') + (p.self ? '<span class="you">' + t('mm.you') + '</span>' : '') +
          '</div>' +
          '<div class="meta">' +
            '<span class="lvl">' + t('mm.lvl', { n: lvl }) + '</span>' +
            '<span class="pid">' + escapeHtml(p.aid || '') + '</span>' +
          '</div>' +
        '</div>';
    });
    if (!rows) rows = '<div class="brix-mm-empty">' + t('mm.listEmpty') + '</div>';
    listEl.innerHTML =
      '<div class="head">' +
        '<div class="title font-h">' + t('mm.listTitle') + '</div>' +
        '<div class="sub">' + t('mm.listHint', { n: roster.length, name: srv.name || '' }) + '</div>' +
      '</div>' +
      '<div class="rows">' + rows + '</div>';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ============================================================
     ВЫХОД В МЕНЮ: маленькое окно «Вы точно хотите выйти?» с
     кнопками НЕТ / ДА. Кнопка «ДА» ЗАБЛОКИРОВАНА 5 секунд —
     на ней тикает таймер «ДА (5)…(1)», потом становится «ДА».
     ESC и клик мимо окошка = НЕТ.
     ============================================================ */

  function ensureQuit() {
    if (quitRoot) return quitRoot;
    quitRoot = document.createElement('div');
    quitRoot.id = 'brixMmQuit';
    quitRoot.className = 'brix-quit hidden';
    quitRoot.innerHTML =
      '<div class="brix-quit-card">' +
        '<div class="title font-h">' + t('mm.quitTitle') + '</div>' +
        '<div class="text">' + t('mm.quitText') + '</div>' +
        '<div class="btns">' +
          '<button class="no font-h" id="brixQuitNo">' + t('mm.quitNo') + '</button>' +
          '<button class="yes font-h" id="brixQuitYes" disabled>' +
            t('mm.quitWait', { s: QUIT_WAIT }) + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(quitRoot);
    quitRoot.querySelector('#brixQuitNo').onclick = function () {
      if (window.menuAudio) menuAudio.back();
      cancelQuit();
    };
    quitRoot.querySelector('#brixQuitYes').onclick = function () {
      if (window.menuAudio) menuAudio.click();
      confirmQuit();
    };
    // клик мимо карточки = НЕТ (случайный выход исключён)
    quitRoot.onclick = function (e) { if (e.target === quitRoot) cancelQuit(); };
    return quitRoot;
  }

  function openQuit() {
    quitOpen = true;
    ensureQuit();
    var yes = quitRoot.querySelector('#brixQuitYes');
    yes.disabled = true;
    yes.textContent = t('mm.quitWait', { s: QUIT_WAIT });
    quitRoot.classList.remove('hidden');
    if (quitTimer) clearInterval(quitTimer);
    var sec = QUIT_WAIT;
    quitTimer = setInterval(function () {
      sec--;
      if (sec <= 0) {
        clearInterval(quitTimer); quitTimer = null;
        yes.disabled = false;
        yes.textContent = t('mm.quitYes');
      } else {
        yes.textContent = t('mm.quitWait', { s: sec });
      }
    }, 1000);
  }

  function cancelQuit() {
    quitOpen = false;
    if (quitTimer) { clearInterval(quitTimer); quitTimer = null; }
    if (quitRoot) quitRoot.classList.add('hidden');
  }

  function confirmQuit() {
    cancelQuit();
    exitToMenu();
  }

  function exitToMenu() {
    cancelQuit();
    closeAll();
    var fn = opts && opts.onExit;
    opts = null;
    if (fn) fn();   // gameworld.js: BrixGame.disconnect() → стоп мира и сети
  }

  /* ============================================================
     КАРТА BRIXLAND — настоящий рельеф мира
     ------------------------------------------------------------
     Каждая точка = BrixTerrain.meshHeightAt (та же сетка 257×257,
     что у отрисованной земли) + BrixTerrain.colorAt (ТЕ ЖЕ цвета:
     трава/земля/камень/снег/песок) + вода ниже уровня моря +
    hillshade (свет с северо-запада). Сетка A1–F6 (6×6 по 150 м),
     игрок — иконка marker.webp, повёрнутая по yaw.
     ============================================================ */

  var MAP_PX = 640;          // разрешение картинки карты
  var GRID = 6;              // 6×6 квадратов, как в Rust
  var CELL = 900 / GRID;     // 150 м на клетку

  function buildMapImage() {
    var T = window.BrixTerrain;
    if (!T) return null;
    var HALF = T.WORLD_HALF, WATER = T.WATER_LEVEL;
    var cv = document.createElement('canvas');
    cv.width = MAP_PX; cv.height = MAP_PX;
    var ctx = cv.getContext('2d');
    var img = ctx.createImageData(MAP_PX, MAP_PX);
    var data = img.data;

    // 1) высоты (отдельный проход — нужен для уклона соседей)
    var H = new Float32Array(MAP_PX * MAP_PX);
    var STEP = (HALF * 2) / MAP_PX;
    var x, z, px, pz;
    for (pz = 0; pz < MAP_PX; pz++) {
      z = -HALF + (pz + 0.5) * STEP;
      for (px = 0; px < MAP_PX; px++) {
        x = -HALF + (px + 0.5) * STEP;
        H[pz * MAP_PX + px] = T.meshHeightAt(x, z);
      }
    }

    /* ✅ v0.4.38 ДОРОГА: маска единственной грунтовой дороги (BrixRoad) —
       на карте она видна КАК ПРОСТО ПРОРИСОВАННАЯ ЛИНИЯ, теми же
       пикселями, что горы и земля (не отдельный слой поверх) */
    var roadMask = window.BrixRoad ? BrixRoad.mapMask(MAP_PX, HALF) : null;

    // 2) цвета: суша — colorAt мира, вода — глубина, всё с hillshade
    var col = new THREE.Color();
    var L = new THREE.Vector3(-0.45, 0.62, -0.4).normalize();
    var nrm = new THREE.Vector3();
    for (pz = 0; pz < MAP_PX; pz++) {
      for (px = 0; px < MAP_PX; px++) {
        var idx = pz * MAP_PX + px;
        var h = H[idx];
        var wx = -HALF + (px + 0.5) * STEP;
        var wz = -HALF + (pz + 0.5) * STEP;
        var r, g, b;

        if (h < WATER) {
          // вода: мелко у берега — светло-бирюзовая, глубоко — тёмная
          var dpt = Math.min(1, (WATER - h) / 5.5);
          dpt = Math.pow(dpt, 0.72);
          r = 93 + (24 - 93) * dpt;
          g = 143 + (52 - 143) * dpt;
          b = 158 + (64 - 158) * dpt;
        } else {
          // нормаль по соседям (шаг 2 пикселя ≈ 2.8 м)
          var hx1 = H[pz * MAP_PX + Math.max(0, px - 2)];
          var hx2 = H[pz * MAP_PX + Math.min(MAP_PX - 1, px + 2)];
          var hz1 = H[Math.max(0, pz - 2) * MAP_PX + px];
          var hz2 = H[Math.min(MAP_PX - 1, pz + 2) * MAP_PX + px];
          var dhx = (hx2 - hx1) / ((hx2 === hx1 ? 2 : 4) * STEP);
          var dhz = (hz2 - hz1) / ((hz2 === hz1 ? 2 : 4) * STEP);
          var ny = 1 / Math.sqrt(1 + dhx * dhx + dhz * dhz);
          T.colorAt(h, ny, wx, wz, col);
          // hillshade: солнце как в мире (-0.45, 0.62, -0.4)
          nrm.set(-dhx, 1, -dhz).normalize();
          var light = 0.66 + 0.6 * Math.max(0, nrm.dot(L));
          r = col.r * 255 * light;
          g = col.g * 255 * light;
          b = col.b * 255 * light;
          /* ✅ v0.4.38: линия дороги — та же земля (0x85734d), с тем же
             hillshade, поверх цвета суши по маске BrixRoad */
          if (roadMask && roadMask[idx] > 0) {
            var rk = roadMask[idx] * 0.85;
            r = r * (1 - rk) + 0x85 * light * rk;
            g = g * (1 - rk) + 0x73 * light * rk;
            b = b * (1 - rk) + 0x4d * light * rk;
          }
        }
        var o = idx * 4;
        data[o] = Math.max(0, Math.min(255, r));
        data[o + 1] = Math.max(0, Math.min(255, g));
        data[o + 2] = Math.max(0, Math.min(255, b));
        data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  /** квадрат A1…F6 по мировым координатам */
  function sectorAt(x, z) {
    var LETTERS = 'ABCDEF';
    var cx = Math.floor((x + 450) / CELL);
    var cz = Math.floor((z + 450) / CELL);
    cx = Math.max(0, Math.min(GRID - 1, cx));
    cz = Math.max(0, Math.min(GRID - 1, cz));
    return LETTERS[cx] + (cz + 1);
  }

  function openMap() {
    mapOpen = true;
    ensureMapRoot();
    mapRoot.classList.remove('hidden');
    // список игроков прячем — карта на весь экран
    if (listOpen) listEl.classList.add('hidden');
    drawMap();
  }

  function closeMap() {
    mapOpen = false;
    if (mapRoot) mapRoot.classList.add('hidden');
    if (menuOpen && listOpen) listEl.classList.remove('hidden');
  }

  function drawMap() {
    var cv = mapRoot.querySelector('#brixMapCanvas');
    var buildEl = mapRoot.querySelector('#brixMapBuild');
    var sectorEl = mapRoot.querySelector('#brixMapSector');

    // тяжёлая картинка строится ОДИН раз и кэшируется
    if (!mapImage) {
      if (mapBuilding) return;
      mapBuilding = true;
      buildEl.style.display = 'block';
      setTimeout(function () {
        mapImage = buildMapImage();
        mapBuilding = false;
        if (mapOpen) drawMap();
      }, 30);
      return;
    }
    buildEl.style.display = 'none';

    // ✅ v0.4.4 иконка игрока: грузим webp и УБИРАЕМ БЕЛЫЙ ФОН кодом —
    // почти белые пиксели (фон, шахматка, светлая кайма) делаем прозрачными.
    // Сам пин красный с тёмным кружком — не задеваем
    if (!markerImg) loadMarker();

    // вписать квадрат карты в экран с полями под подписи сетки
    var dpr = window.devicePixelRatio || 1;
    var vw = mapRoot.clientWidth, vh = mapRoot.clientHeight;
    var MARGIN = 34;
    var size = Math.max(200, Math.min(vw, vh) - MARGIN * 2);
    cv.width = Math.round(size * dpr);
    cv.height = Math.round(size * dpr);
    cv.style.width = size + 'px';
    cv.style.height = size + 'px';
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    var T = window.BrixTerrain;
    var HALF = T ? T.WORLD_HALF : 450;

    // сетка сначала — подложка с полем под буквы/цифры
    var M = 30;   // отступ карты внутри canvas под подписи
    var mapS = size - M;
    ctx.fillStyle = 'rgba(10,12,11,0.92)';
    ctx.fillRect(0, 0, size, size);

    // сама карта
    ctx.drawImage(mapImage, M, M, mapS, mapS);

    /* ✅ v0.4.65 ПВП-АРЕНА: ЛОКАЦИЯ «ПОЛИГОН» рисуется поверх рельефа —
       стены, бункеры, платформа, ящики + КРАСНЫЕ ТОЧКИ ботов */
    if (window.BRIX_PVP && window.BrixArena && BrixArena.isBuilt()) {
      var toX = function (wx) { return M + ((wx + HALF) / (HALF * 2)) * mapS; };
      var toZ = function (wz) { return M + ((wz + HALF) / (HALF * 2)) * mapS; };
      BrixArena.drawMap(ctx, toX, toZ);
    }

    // границы карты и клетки
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    for (var i = 1; i < GRID; i++) {
      var p = M + (mapS / GRID) * i;
      ctx.beginPath(); ctx.moveTo(p, M); ctx.lineTo(p, M + mapS); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(M, p); ctx.lineTo(M + mapS, p); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.strokeRect(M, M, mapS, mapS);

    // подписи: буквы сверху (A–F), цифры слева (1–6) — как в Rust
    ctx.fillStyle = 'rgba(214,217,212,0.85)';
    ctx.font = '600 12px Oswald, Arial Narrow, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var LETTERS = 'ABCDEF';
    for (var c = 0; c < GRID; c++) {
      ctx.fillText(LETTERS[c], M + (mapS / GRID) * (c + 0.5), M / 2);
    }
    for (var r = 0; r < GRID; r++) {
      ctx.fillText(String(r + 1), M / 2, M + (mapS / GRID) * (r + 0.5));
    }

    // игрок: маленькая иконка БЕЗ фона, точно под игроком,
    // острым концом ВПЕРЁД по направлению взгляда
    var pos = opts && opts.getPos ? opts.getPos() : null;
    if (pos) {
      var mx = M + ((pos.x + HALF) / (HALF * 2)) * mapS;
      var my = M + ((pos.z + HALF) / (HALF * 2)) * mapS;
      var MW = 15, MH = 26;              // ✅ v0.4.4: заметно меньше (было 22×38)
      if (markerImg) {
        ctx.save();
        ctx.translate(mx, my);
        // ✅ v0.4.4: якорь — ЦЕНТР иконки (позиция всегда точно под
        // игроком, «на берегу а не в море»), а указывает пин острым
        // концом туда, КУДА СМОТРИТ игрок: вперёд = (-sin yaw, -cos yaw)
        ctx.rotate(Math.PI - pos.yaw);
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 3;
        ctx.drawImage(markerImg, -MW / 2, -MH / 2, MW, MH);
        ctx.restore();
      } else {
        // пока иконка не готова — маленькая красная точка
        ctx.fillStyle = '#e2553d';
        ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fill();
      }
      // квадрат игрока (C4) + координаты — как в Rust
      sectorEl.textContent = sectorAt(pos.x, pos.z) +
        ' · ' + Math.round(pos.x) + ' : ' + Math.round(pos.z);
    } else {
      sectorEl.textContent = '';
    }
  }

  /** грузит marker.webp и снимает белый фон (canvas → прозрачность) */
  function loadMarker() {
    /* ✅ v0.5.9: загрузка с retry (BrixFetch: 3 попытки / 2 c / 10 c) —
       через туннель webp мог прийти 504, и маркер игрока не появлялся */
    var apply = function (im) {
      try {
        var c = document.createElement('canvas');
        c.width = im.naturalWidth; c.height = im.naturalHeight;
        var cx = c.getContext('2d');
        cx.drawImage(im, 0, 0);
        var d = cx.getImageData(0, 0, c.width, c.height);
        var p = d.data;
        for (var i = 0; i < p.length; i += 4) {
          if (p[i] > 215 && p[i + 1] > 215 && p[i + 2] > 215) p[i + 3] = 0;
        }
        cx.putImageData(d, 0, 0);
        markerImg = c;                  // дальше рисуем обработанный canvas
      } catch (e) { markerImg = im; }   // не вышло — рисуем как есть
      if (mapOpen) drawMap();
    };
    if (window.BrixFetch) {
      BrixFetch.image(ax('assets/marker.webp')).then(function (im) { if (im) apply(im); });
    } else {
      var im = new Image();
      im.onload = function () { apply(im); };
      im.src = ax('assets/marker.webp');
    }
  }

  /* ============================================================
     КЛАВИАТУРА: M — открыть/закрыть, ESC — шаг назад
     (мини-меню слушает САМО: gameworld.js только отключает
     управление и даёт getPos/onExit)
     ============================================================ */

  document.addEventListener('keydown', function (e) {
    var playing = window.BrixGame && BrixGame.state.phase === 'playing';
    if (!playing) return;
    if (e.code === 'KeyM') {
      // инвентарь/лут-меню открыты — M не перехватываем
      var inv = window.BrixInventory && BrixInventory.get();
      if (inv && inv.isOpen) return;
      if (window.BrixLootMenu && BrixLootMenu.isOpen()) return;
      e.preventDefault();
      toggle();
    } else if (e.code === 'Escape') {
      // ESC: окошко выхода → карта → мини-меню → закрыть.
      // Пока мышь захвачена (игра) ESC сначала снимает pointer lock —
      // не мешаем штатной паузе
      if (quitOpen) { cancelQuit(); }
      else if (mapOpen) { closeMap(); }
      else if (menuOpen) { onResume(); }
    }
  });

  /* ============================================================
     ПУБЛИЧНОЕ API
     ============================================================ */

  return {
    /** gameworld.js при спавне: { getPos: () => {x, z, yaw}, onExit: fn } */
    init: function (o) {
      opts = o || {};
      /* ✅ v0.4.65: новый мир (BrixLand ↔ арена) — карта строится заново */
      mapImage = null;
      mapBuilding = false;
    },
    toggle: toggle,
    open: open,
    /** закрыть всё и вернуть мышь в игру (ПРОДОЛЖИТЬ) */
    resume: onResume,
    isOpen: isOpen,
    /** мини-меню ИЛИ карта открыты — управление стоит, сеть живёт */
    isAnyOpen: isAnyOpen,
    /* ✅ v0.4.44: ГОТОВАЯ КАРТА МИРА (гладкая, как в мини-меню) —
       меню смерти рисует её вместо своей пиксельной */
    mapImage: function () {
      if (!mapImage && !mapBuilding) {
        mapBuilding = true;
        mapImage = buildMapImage();
        mapBuilding = false;
      }
      return mapImage;
    },
    /** полный сброс при выходе из мира (gameworld.stop) */
    shutdown: function () {
      cancelQuit();
      closeAll();
      opts = null;
    }
  };
})();
