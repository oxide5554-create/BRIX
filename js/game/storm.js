// ============================================================
//  brix • js/game/storm.js  ✅ НОВОЕ v0.4.52 — ГРОЗА (фича 1)
//  В хмурую погоду с сильным дождём (не в снегу!) время от времени
//  БЬЁТ МОЛНИЯ, следом прилетает ГРОМ:
//    • вспышка: шейдер неба коротко светлеет (uniform flashK в
//      world.js, пишет BrixEnvironment.cur.flashK) + солнечный и
//      полусферный свет коротко усиливаются — ТЕНИ на миг
//      «дёргаются» и всё вокруг вспыхивает, как от настоящей
//      молнии; вспышка мерцает (двойной/тройной разряд);
//    • гром: assets/sfx/weather/thunder1.wav / thunder2.wav
//      (синтезированные раскаты) играют с задержкой 0.4–1.8 с
//      после вспышки — звук «доезжает», как в жизни;
//    • ФПС не проседает: молния — только uniform + два числа
//      интенсивности света, ни одной новой отрисовки.
//  Вызывается из gameworld.js: BrixStorm.create(scene) при сборке
//  мира и storm.update(dt, env, lights) после env.update в кадре.
// ============================================================
window.BrixStorm = (function () {
  'use strict';

  var flashK = 0;        // текущая сила вспышки 0..1 (гаснет сама)
  var timer = 10;        // сек до следующей вспышки (тик в грозу)
  var flickerT = 0;      // остаток мерцания (двойной разряд)

  /* гром — через общий BrixSfx (уважает вкл/выкл звука и кэш) */
  function loadSounds() {
    if (!window.BrixSfx) return;
    var u = function (x) { return window.BrixAsset ? window.BrixAsset(x) : x; };
    try {
      BrixSfx.load('thunder1', u('assets/sfx/weather/thunder1.wav'));
      BrixSfx.load('thunder2', u('assets/sfx/weather/thunder2.wav'));
    } catch (e) { /* звук не критичен */ }
  }

  /** один разряд: вспышка + задержанный гром */
  function strike() {
    flashK = 1;
    flickerT = 0.28 + Math.random() * 0.22;   // 2-й/3-й подрезряд
    try {
      if (window.BrixSfx) {
        var delay = 0.4 + Math.random() * 1.4;
        window.setTimeout(function () {
          try {
            BrixSfx.play(Math.random() < 0.5 ? 'thunder1' : 'thunder2',
              { volume: 0.55, jitter: 0.1 });
          } catch (e) {}
        }, delay * 1000);
      }
    } catch (e) {}
  }

  function create() {
    loadSounds();
    timer = 8 + Math.random() * 10;
    flashK = 0;
    return api;
  }

  /**
   * Такт кадра — вызывать ПОСЛЕ env.update (чтобы подмешать вспышку
   * в уже выставленный свет; env.update на следующем кадре вернёт
   * базовые значения — накопления нет).
   * @param dt  кадр в секундах
   * @param env BrixEnvironment (cur.rainK/gloomyK/snowTarget/flashK)
   * @param lights {sun, hemi, ...} из BrixWorld.createLights
   */
  function update(dt, env, lights) {
    if (!env || !env.cur) return;
    var c = env.cur;

    /* «грозовость» места: сильный дождь при хмуром небе, НЕ снег */
    var stormK = Math.max(0, c.rainK - c.snowTarget) * Math.max(c.gloomyK, 0.35);

    /* таймер тикает заметно только в грозу — в ясную просто спит */
    timer -= dt * (0.3 + stormK * 2.6);
    if (stormK > 0.45 && timer <= 0) {
      strike();
      timer = 7 + Math.random() * 14;          // разряды каждые ~7–21 с
    }

    /* затухание вспышки + мерцание (как настоящий разряд) */
    flashK = Math.max(0, flashK - dt * 3.4);
    var fk = flashK;
    if (flickerT > 0) {
      flickerT -= dt;
      fk = Math.max(fk, flashK * (0.55 + 0.45 * Math.sin(flickerT * 47.0)));
    }
    /* пишем в env.cur — шейдер неба заберёт на следующем updateEnv */
    env.cur.flashK = fk;

    /* подмешиваем свет: солнечный (резко светлеют ТЕНИ) + полусферный */
    if (lights && lights.sun && lights.hemi) {
      lights.sun.intensity += fk * 2.6;
      lights.hemi.intensity += fk * 1.4;
    }
  }

  function dispose() {
    flashK = 0;
    flickerT = 0;
    timer = 10;
  }

  var api = {
    create: create,
    update: update,
    dispose: dispose,
    /** для отладки: сила вспышки прямо сейчас */
    flash: function () { return flashK; }
  };
  return api;
})();
