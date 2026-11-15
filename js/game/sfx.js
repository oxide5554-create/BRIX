// ============================================================
//  brix • js/game/sfx.js
//  Игровые звуки (WebAudio): сэмплы из репозитория — рубка дерева,
//  падение дерева. Подход как в SoundManager репозитория, но без
//  позиционирования — хватает громкости и случайного pitch.
//  Контекст создаётся по первому жесту пользователя.
// ============================================================
window.BrixSfx = (function () {
  'use strict';

  var ctx = null;
  var master = null;
  var buffers = {};
  var pending = {};

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 1;
      master.connect(ctx.destination);
      // догружаем то, что запросили до инициализации
      Object.keys(pending).forEach(function (name) {
        load(name, pending[name]);
      });
      pending = {};
    } catch (e) {
      ctx = null;
    }
  }

  /** Предзагрузка сэмпла (можно вызывать до init) */
  function load(name, url) {
    if (!ctx) { pending[name] = url; return; }
    // 1) встроенный сэмпл (js/game/embeddata.js) — работает даже без сервера
    var base = url.split('/').pop();
    var embedded = window.BrixEmbed && window.BrixEmbed.sounds && window.BrixEmbed.sounds[base];
    var bytes = embedded
      ? Promise.resolve(window.BrixEmbed.b64ab(embedded))
      : fetch(url).then(function (r) {
          if (!r.ok) throw new Error('sfx ' + r.status);
          return r.arrayBuffer();
        });
    bytes
      .then(function (ab) { return ctx.decodeAudioData(ab); })
      .then(function (buf) { buffers[name] = buf; })
      .catch(function () { buffers[name] = null; });
  }

  /**
   * Проиграть сэмпл.
   * @param {string} name
   * @param {{volume?:number, rate?:number, jitter?:number}} opts
   */
  function play(name, opts) {
    opts = opts || {};
    if (!ctx || !buffers[name]) return;
    if (ctx.state === 'suspended') ctx.resume();
    var t0 = ctx.currentTime;
    var src = ctx.createBufferSource();
    src.buffer = buffers[name];
    var jitter = opts.jitter !== undefined ? opts.jitter : 0.06;
    src.playbackRate.value = (opts.rate || 1) + (Math.random() * 2 - 1) * jitter;
    var g = ctx.createGain();
    var vol = opts.volume !== undefined ? opts.volume : 0.8;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol * 0.25), t0 + src.buffer.duration);
    src.connect(g); g.connect(master);
    src.start(t0);
    return src;
  }

  function setEnabled(v) {
    if (master) master.gain.value = v ? 1 : 0;
  }

  return { init: init, load: load, play: play, setEnabled: setEnabled };
})();
