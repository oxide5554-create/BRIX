// ============================================================
//  brix • js/game/hitmarker.js
//  ✅ v0.4.40 ХИТ-МАРКЕРЫ (по просьбе игрока): стилизованный крест
//  («X» из четырёх засечек, НЕ точка) в центре экрана при ПОПАДАНИИ
//  по чужому игроку:
//    • белый  — попал В ТЕЛО;
//    • красный — попал В ГОЛОВУ (крупнее + расходящееся кольцо).
//  Логика зон живёт в gameworld.js (hitZone): голова = верх модели
//  чужого игрока (выше 1.48 м от ног, с учётом приседа). Маркер
//  показывает и стрелок при выстреле/ударе, и дробовик (один маркер
//  на выстрел: красный, если ≥2 дробины в голову).
//  API: window.BrixHitmarker.show(zone) — zone 'head' | 'body'.
//  Стили инлайн (файл самодостаточен), анимации — Web Animations API.
// ============================================================
window.BrixHitmarker = (function () {
  'use strict';

  var root = null;        // контейнер в #gameHud (или body)
  var cur = null;         // текущий маркер (новый заменяет старый)

  function ensureRoot() {
    if (root) return root;
    root = document.createElement('div');
    root.id = 'brixHitmarker';
    root.style.cssText =
      'position:absolute;left:50%;top:50%;width:0;height:0;' +
      'pointer-events:none;z-index:6;transform:translate(0,0);';
    /* ✅ хост — боевой HUD (#gameHud); его нет (меню) — на body (fixed) */
    var host = document.getElementById('gameHud');
    if (!host) {
      host = document.body;
      root.style.position = 'fixed';
    }
    host.appendChild(root);
    return root;
  }

  /** одна засечка креста: полоска со скруглением, повёрнутая на 45° */
  function tick(px, py, len, th, color, glow) {
    var t = document.createElement('div');
    t.style.cssText =
      'position:absolute;left:' + px + 'px;top:' + py + 'px;' +
      'width:' + len + 'px;height:' + th + 'px;' +
      'margin-left:' + (-len / 2) + 'px;margin-top:' + (-th / 2) + 'px;' +
      'border-radius:' + (th / 2) + 'px;background:' + color + ';' +
      'box-shadow:0 0 3px ' + glow + ', 0 0 1px rgba(0,0,0,0.55);' +
      'transform-origin:center center;';
    return t;
  }

  /** показать маркер. zone: 'head' (красный, крупнее, с кольцом)
      | 'body' (белый). Опции: { big: true } — усилить (дробовик в упор),
      { hold: true } — НЕ удалять маркер по таймеру (для скриншотов/тестов) */
  function show(zone, opts) {
    var R = ensureRoot();
    var head = zone === 'head';
    var big = head || (opts && opts.big);

    /* новый маркер заменяет старый (как в Rust — без кучи крестов) */
    if (cur && cur.parentNode) cur.parentNode.removeChild(cur);
    var box = document.createElement('div');
    box.style.cssText = 'position:absolute;left:0;top:0;';
    cur = box;
    R.appendChild(box);

    var S = big ? 1.22 : 1.0;               // масштаб креста
    var off = 5.2 * S;                      // отступ засечек от центра
    var len = 6.4 * S, th = 2.1 * S;        // длина/толщина засечки
    var color = head ? '#e6392f' : '#f4f2ec';
    var glow = head ? 'rgba(230,57,47,0.55)' : 'rgba(255,255,255,0.4)';
    /* 4 засечки под 45°: Х-крест из углов */
    var dirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (var i = 0; i < dirs.length; i++) {
      var t = tick(dirs[i][0] * off, dirs[i][1] * off, len, th, color, glow);
      t.style.transform = 'rotate(45deg)';
      /* позиции диагональные: сдвигаем полоску в угол и вращаем */
      t.style.left = (dirs[i][0] * off) + 'px';
      t.style.top = (dirs[i][1] * off) + 'px';
      box.appendChild(t);
    }
    /* у красного — расходящееся кольцо-акцент */
    if (head) {
      var ring = document.createElement('div');
      var rd = 10 * S;
      ring.style.cssText =
        'position:absolute;left:0;top:0;width:' + rd + 'px;height:' + rd + 'px;' +
        'margin-left:' + (-rd / 2) + 'px;margin-top:' + (-rd / 2) + 'px;' +
        'border:1.6px solid rgba(230,57,47,0.85);border-radius:50%;' +
        'box-shadow:0 0 6px rgba(230,57,47,0.4);';
      box.appendChild(ring);
      try {
        ring.animate([
          { transform: 'scale(0.5)', opacity: 0.9 },
          { transform: 'scale(1.9)', opacity: 0 }
        ], { duration: 430, easing: 'cubic-bezier(0.2,0.7,0.3,1)' });
      } catch (e) {}
    }
    /* само появление: масштаб с перелётом + растворение */
    try {
      box.animate([
        { transform: 'scale(0.55)', opacity: 0.15 },
        { transform: 'scale(1.08)', opacity: 1, offset: 0.28 },
        { transform: 'scale(1)', opacity: 1, offset: 0.55 },
        { transform: 'scale(0.92)', opacity: 0 }
      ], { duration: head ? 560 : 430, easing: 'ease-out' });
    } catch (e2) {}
    if (opts && opts.hold) return;   // тесты/скриншоты: маркер висит, пока не заменят
    var life = head ? 560 : 430;
    setTimeout(function () {
      if (cur === box && box.parentNode) box.parentNode.removeChild(box);
    }, life + 40);
  }

  return { show: show };
})();
