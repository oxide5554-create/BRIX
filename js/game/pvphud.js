// ============================================================
//  brix • js/game/pvphud.js — HUD КОМАНДНОГО БОЯ «ПОЛИГОНА» (v0.5.0)
//  · СВЕРХУ ПО ЦЕНТРУ — ТАБЛИЦА КОМАНД: иконка СТАЛЬ (синий бот) +
//    счёт килов синих | лимит 30 | счёт красных + иконка ПЛАМЯ
//    (красный бот). Обновляется от 'bscore' (сервер) / локального
//    сима арены;
//  · ПОБЕДА (команда добила до лимита): большой баннер 5 с;
//  · СМЕРТЬ НА АРЕНЕ: вместо меню карты — счётчик «ВОЗРОЖДЕНИЕ
//    ЧЕРЕЗ 2…» (респавн через 2 с — gameworld.js);
//  · бейдж команды игрока «ТЫ: СТАЛЬ».
// ============================================================
window.BriXPvPHud = (function () {
  'use strict';

  var el = null, blueEl = null, redEl = null, limitEl = null;
  var winEl = null, winTimer = null;
  var respawnEl = null, respawnTick = null;
  var teamBadge = null;
  var boardEl = null, boardTick = null;
  var built = false;

  /* иконка бойца команды — ПОРТРЕТ УЧЁНОГО (ScientistRigged в противогазе,
     синий/красный: assets/icons/pvp-blue.png / pvp-red.png; файлы сделаны
     из референс-портретов команды). Если файл не загрузился — под ним
     запасной SVG-силуэт того же цвета */
  function botIcon(color, flip) {
    var file = color === '#4da3ff' ? 'blue' : 'red';
    var img = '<img src="assets/icons/pvp-' + file + '.png" alt="" draggable="false" ' +
      'onerror="this.style.display=\'none\';var s=this.nextElementSibling;if(s)s.style.display=\'\';" ' +
      'style="width:30px;height:30px;border-radius:50%;object-fit:cover;flex:none;' +
      (flip ? 'transform:scaleX(-1);' : '') +
      'box-shadow:0 0 10px ' + color + '66;">';
    var svg = '<svg width="30" height="26" viewBox="0 0 30 26" style="display:none;' +
      (flip ? 'transform:scaleX(-1);' : '') + '" fill="none">' +
      '<circle cx="11" cy="4.4" r="3.2" fill="' + color + '"/>' +
      '<path d="M7.4 3.6h7.2" stroke="' + color + '" stroke-width="1.6" stroke-linecap="round"/>' +
      '<path d="M11 8v6.5" stroke="' + color + '" stroke-width="4.2" stroke-linecap="round"/>' +
      '<path d="M11 14.5l-2.6 8M11 14.5l2.6 8" stroke="' + color + '" stroke-width="3.2" stroke-linecap="round"/>' +
      '<path d="M11 9.6l4.8 2.4 6.6-1.4M11 10.6l4.2 1.6 6-0.4" stroke="' + color + '" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<rect x="21.6" y="8.6" width="6.2" height="2.6" rx="0.9" fill="' + color + '"/>' +
      '<path d="M27.2 10.2h2.4" stroke="' + color + '" stroke-width="1.4" stroke-linecap="round"/>' +
      '</svg>';
    return img + svg;
  }

  function build() {
    if (built) return;
    built = true;
    el = document.createElement('div');
    el.id = 'brixPvpHud';
    el.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:150;' +
      'display:flex;align-items:center;gap:12px;padding:7px 18px 7px 12px;' +
      'background:linear-gradient(180deg,rgba(10,14,20,.88),rgba(10,14,20,.78));' +
      'border:1px solid rgba(122,140,160,.35);border-radius:12px;' +
      'box-shadow:0 10px 34px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.06);' +
      'font-family:Consolas,monospace;user-select:none;pointer-events:none;' +
      'max-width:94vw;';
    el.innerHTML =
      '<span style="display:flex;align-items:center;gap:7px;">' + botIcon('#4da3ff') +
        '<b id="brixPvpBlue" style="font-size:21px;font-weight:700;color:#4da3ff;' +
        'text-shadow:0 0 14px rgba(77,163,255,.55);min-width:2ch;text-align:right;">0</b>' +
        '<span style="font-size:10px;letter-spacing:.14em;color:#8fb4d8;">СТАЛЬ</span></span>' +
      '<span id="brixPvpLimit" style="font-size:12px;color:#c9b47a;letter-spacing:.1em;' +
        'border:1px solid rgba(201,180,122,.4);border-radius:99px;padding:3px 11px;background:rgba(201,180,122,.08);">ДО 30</span>' +
      '<span style="display:flex;align-items:center;gap:7px;">' +
        '<span style="font-size:10px;letter-spacing:.14em;color:#e0a394;">ПЛАМЯ</span>' +
        '<b id="brixPvpRed" style="font-size:21px;font-weight:700;color:#ff5a3c;' +
        'text-shadow:0 0 14px rgba(255,90,60,.55);min-width:2ch;">0</b>' +
        botIcon('#ff5a3c', true) + '</span>';
    document.body.appendChild(el);
    blueEl = el.querySelector('#brixPvpBlue');
    redEl = el.querySelector('#brixPvpRed');
    limitEl = el.querySelector('#brixPvpLimit');

    // бейдж «ТЫ: СТАЛЬ» под таблицей
    teamBadge = document.createElement('div');
    teamBadge.style.cssText = 'position:fixed;top:58px;left:50%;transform:translateX(-50%);' +
      'z-index:150;font-family:Consolas,monospace;font-size:10px;letter-spacing:.16em;' +
      'color:#9fc6ee;background:rgba(77,163,255,.1);border:1px solid rgba(77,163,255,.35);' +
      'border-radius:99px;padding:3px 12px;pointer-events:none;user-select:none;';
    teamBadge.textContent = 'ТЫ: СТАЛЬ (СИНИЕ)';
    document.body.appendChild(teamBadge);

    // победный баннер
    winEl = document.createElement('div');
    winEl.style.cssText = 'position:fixed;inset:0;z-index:210;display:none;place-items:center;' +
      'pointer-events:none;';
    winEl.innerHTML = '<div id="brixPvpWinBox" style="text-align:center;padding:26px 58px;' +
      'background:rgba(8,10,14,.88);border:2px solid #c9b47a;border-radius:16px;' +
      'box-shadow:0 30px 90px rgba(0,0,0,.7), 0 0 60px rgba(201,180,122,.15);">' +
      '<div id="brixPvpWinT" style="font-family:Consolas,monospace;font-size:44px;font-weight:700;' +
      'letter-spacing:.22em;text-transform:uppercase;">ПОБЕДА</div>' +
      '<div id="brixPvpWinS" style="font-family:Consolas,monospace;font-size:17px;color:#c9b47a;' +
      'margin-top:10px;letter-spacing:.1em;"></div></div>';
    document.body.appendChild(winEl);

    // счётчик респавна (вместо меню карты)
    respawnEl = document.createElement('div');
    respawnEl.style.cssText = 'position:fixed;left:50%;top:38%;transform:translate(-50%,-50%);' +
      'z-index:225;display:none;text-align:center;pointer-events:none;';
    respawnEl.innerHTML = '<div id="brixPvpRespT" style="font-family:Consolas,monospace;' +
      'font-size:30px;font-weight:700;letter-spacing:.2em;color:#ffd9c9;' +
      'text-shadow:0 2px 18px rgba(0,0,0,.8);">ВОЗРОЖДЕНИЕ</div>' +
      '<div id="brixPvpRespN" style="font-family:Consolas,monospace;font-size:56px;font-weight:700;' +
      'color:#ff6a4e;margin-top:6px;text-shadow:0 0 30px rgba(255,90,60,.5);">2</div>';
    document.body.appendChild(respawnEl);
  }

  function destroy() {
    if (el) { el.remove(); el = null; }
    if (teamBadge) { teamBadge.remove(); teamBadge = null; }
    if (winEl) { winEl.remove(); winEl = null; }
    if (respawnEl) { respawnEl.remove(); respawnEl = null; }
    if (boardEl) { boardEl.remove(); boardEl = null; }
    if (winTimer) { clearInterval(winTimer); winTimer = null; }
    if (respawnTick) { clearInterval(respawnTick); respawnTick = null; }
    if (boardTick) { clearInterval(boardTick); boardTick = null; }
    built = false;
  }

  /** счёт килов: 'bscore' от сервера или локальный сим арены */
  function setScores(blue, red, limit) {
    build();
    el.style.display = 'flex';
    teamBadge.style.display = 'block';
    if (blueEl) blueEl.textContent = String(blue | 0);
    if (redEl) redEl.textContent = String(red | 0);
    if (limitEl) limitEl.textContent = 'ДО ' + (limit || 30);
  }

  /** победа: 'bwin' — баннер 5 с */
  function showWin(team, blue, red) {
    build();
    var isBlue = team !== 'red';
    var t = winEl.querySelector('#brixPvpWinT');
    var s = winEl.querySelector('#brixPvpWinS');
    t.textContent = isBlue ? 'ПОБЕДА: СТАЛЬ' : 'ПОБЕДА: ПЛАМЯ';
    t.style.color = isBlue ? '#4da3ff' : '#ff5a3c';
    t.style.textShadow = isBlue ? '0 0 40px rgba(77,163,255,.5)' : '0 0 40px rgba(255,90,60,.5)';
    s.textContent = (blue | 0) + ' : ' + (red | 0) + ' — НОВЫЙ РАУНД ЧЕРЕЗ 5 С';
    winEl.style.display = 'grid';
    if (winTimer) clearTimeout(winTimer);
    winTimer = setTimeout(function () { winEl.style.display = 'none'; }, 5000);
  }

  /** респавн через 2 с без меню карты (счётчик 2 → 1 → спавн) */
  function showRespawn(seconds) {
    build();
    var n = respawnEl.querySelector('#brixPvpRespN');
    var left = Math.max(1, Math.floor(seconds || 2));
    n.textContent = String(left);
    respawnEl.style.display = 'block';
    if (respawnTick) clearInterval(respawnTick);
    respawnTick = setInterval(function () {
      left--;
      if (left <= 0) { hideRespawn(); return; }
      n.textContent = String(left);
    }, 1000);
  }

  function hideRespawn() {
    if (respawnEl) respawnEl.style.display = 'none';
    if (respawnTick) { clearInterval(respawnTick); respawnTick = null; }
  }

  /* ============================================================
     ✅ v0.5.5 ЛИДЕРБОРД МАТЧА ('blead' после 30 киллов): в стиле
     игры — тёмная панель, золото #c9b47a, Consolas, uppercase.
     Таблица: БОЕЦ | УБИЙСТВ | СМЕРТЕЙ | К/Д; своя строка — золотая
     рамка + бейдж «ВЫ»; топ-3 — медальные цвета. Внизу — обратный
     отсчёт до СЛЕДУЮЩЕЙ КАРТЫ (ротация). Прячется на 'bmap'.
     ============================================================ */
  function showLeaderboard(msg) {
    build();
    /* ✅ победный баннер под доской «просвечивал» — гасим */
    if (winEl) { winEl.style.display = 'none'; }
    if (winTimer) { clearTimeout(winTimer); winTimer = null; }
    var rows = (msg && msg.rows) || [];
    var dur = (msg && msg.dur) || 8;
    var nextName = (msg && msg.next && msg.next.name) || null;   // v0.5.6: карты одна — next нет
    var myId = (window.BrixNet && BrixNet.id !== undefined && BrixNet.id !== null)
      ? String(BrixNet.id) : null;
    var medal = ['#ffd97a', '#cfd6e0', '#d9a06b'];

    var body = '';
    var maxRows = Math.min(rows.length, 10);
    for (var i = 0; i < maxRows; i++) {
      var r = rows[i];
      var isBlue = r.t !== 'red';
      var tc = isBlue ? '#4da3ff' : '#ff5a3c';
      var kd = (r.k / Math.max(1, r.d)).toFixed(2);
      var numC = i < 3 ? medal[i] : 'rgba(160,170,185,.75)';
      var own = myId !== null && String(r.id) === myId;
      body +=
        '<div style="display:flex;align-items:center;gap:10px;padding:5px 12px;margin:3px 0;' +
        'border-radius:8px;background:' + (own ? 'rgba(201,180,122,.13)' : 'rgba(255,255,255,.03)') + ';' +
        (own ? 'border:1px solid rgba(201,180,122,.55);' : 'border:1px solid rgba(122,140,160,.14);') + '">' +
        '<span style="width:26px;text-align:right;font-weight:700;font-size:14px;color:' + numC + ';">' + (i + 1) + '</span>' +
        '<span style="width:9px;height:9px;border-radius:50%;flex:none;background:' + tc + ';' +
        'box-shadow:0 0 8px ' + tc + '88;"></span>' +
        '<span style="flex:1;font-size:13.5px;color:#e8e4da;letter-spacing:.04em;white-space:nowrap;' +
        'overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(String(r.n || 'БОЕЦ')) +
        (own ? ' <b style="color:#c9b47a;font-size:10px;letter-spacing:.12em;">ВЫ</b>' : '') + '</span>' +
        '<span style="width:64px;text-align:center;font-size:15px;font-weight:700;color:' + tc + ';">' + (r.k | 0) + '</span>' +
        '<span style="width:64px;text-align:center;font-size:14px;color:#b9b2a4;">' + (r.d | 0) + '</span>' +
        '<span style="width:56px;text-align:center;font-size:14px;font-weight:700;color:#c9b47a;">' + kd + '</span>' +
        '</div>';
    }

    var isBlueWin = (!msg || msg.team !== 'red');
    var winColor = isBlueWin ? '#4da3ff' : '#ff5a3c';

    boardEl = document.createElement('div');
    boardEl.id = 'brixPvpBoard';
    boardEl.style.cssText = 'position:fixed;inset:0;z-index:440;display:grid;place-items:center;' +
      'background:radial-gradient(ellipse at center,rgba(4,6,10,.62),rgba(4,6,10,.9));' +
      'animation:brixBoardIn .35s ease-out;pointer-events:none;';
    boardEl.innerHTML =
      '<div style="width:min(520px,94vw);max-height:86vh;overflow:auto;padding:26px 30px 22px;' +
      'background:linear-gradient(180deg,rgba(10,14,20,.94),rgba(8,10,14,.94));' +
      'border:2px solid #c9b47a;border-radius:16px;' +
      'box-shadow:0 30px 90px rgba(0,0,0,.75), 0 0 60px rgba(201,180,122,.12), inset 0 1px 0 rgba(255,255,255,.06);">' +
      '<div style="font-family:Consolas,monospace;font-size:12px;letter-spacing:.34em;color:#c9b47a;' +
      'text-align:center;">ИТОГИ МАТЧА</div>' +
      '<div style="font-family:Consolas,monospace;text-align:center;margin:10px 0 16px;' +
      'font-size:30px;font-weight:700;letter-spacing:.1em;color:' + winColor + ';' +
      'text-shadow:0 0 34px ' + winColor + '55;">' +
      (isBlueWin ? 'ПОБЕДА: СТАЛЬ' : 'ПОБЕДА: ПЛАМЯ') +
      ' <span style="color:#c9b47a;">' + ((msg && msg.blue) | 0) + ':' + ((msg && msg.red) | 0) + '</span></div>' +
      '<div style="display:flex;gap:10px;padding:6px 12px 8px;border-bottom:1px solid rgba(201,180,122,.3);' +
      'font-family:Consolas,monospace;font-size:10px;letter-spacing:.14em;color:#8fb4d8;">' +
      '<span style="width:26px;"></span><span style="width:9px;"></span>' +
      '<span style="flex:1;">БОЕЦ</span>' +
      '<span style="width:64px;text-align:center;">УБИЙСТВ</span>' +
      '<span style="width:64px;text-align:center;">СМЕРТЕЙ</span>' +
      '<span style="width:56px;text-align:center;">К/Д</span></div>' +
      '<div style="font-family:Consolas,monospace;margin:6px 0 14px;">' + body + '</div>' +
      '<div style="border-top:1px solid rgba(201,180,122,.3);padding-top:12px;text-align:center;' +
      'font-family:Consolas,monospace;font-size:12px;letter-spacing:.14em;color:#9fb7cc;">' +
      (nextName ? 'СЛЕДУЮЩАЯ КАРТА: <b style="color:#c9b47a;">' + escapeHtml(nextName) + '</b>' : '') +
      '<span style="display:block;margin-top:6px;font-size:16px;color:#e8d9b0;">' +
      'НОВЫЙ РАУНД ЧЕРЕЗ <b id="brixBoardCnt" style="font-size:22px;">' + dur + '</b> С</span></div>' +
      '</div>';
    document.body.appendChild(boardEl);
    var cnt = boardEl.querySelector('#brixBoardCnt');
    var left = dur;
    if (boardTick) clearInterval(boardTick);
    boardTick = setInterval(function () {
      left--;
      if (left <= 0 || !boardEl) { hideLeaderboard(); return; }
      if (cnt) cnt.textContent = String(left);
    }, 1000);
  }
  function hideLeaderboard() {
    if (boardTick) { clearInterval(boardTick); boardTick = null; }
    if (boardEl) { boardEl.remove(); boardEl = null; }
  }
  /* заголовки/имена приходят из сети — экранируем на всякий случай */
  function escapeHtml(s2) {
    return String(s2).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  return {
    build: build,
    destroy: destroy,
    setScores: setScores,
    showWin: showWin,
    showRespawn: showRespawn,
    hideRespawn: hideRespawn,
    showLeaderboard: showLeaderboard,
    hideLeaderboard: hideLeaderboard
  };
})();
