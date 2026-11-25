// ============================================================
//  brix • js/core/audio.js
//  Синтезированный звук меню (WebAudio, без ассетов):
//  короткие эффекты + низкий фоновый эмбиент с порывами ветра.
//  Клик — пользовательский сэмпл assets/sfx/click.mp3,
//  при его отсутствии — синтезированный «тук».
//  Полный перенос из src/lib/menu/audio.ts.
// ============================================================
window.menuAudio = (function () {
  'use strict';

  var ctx = null;
  var master = null;
  var musicGain = null;
  var sfxGain = null;
  var noiseBuf = null;
  var clickBuf = null; // сэмпл клика (mp3 пользователя)
  var ambientStarted = false;
  var gustTimer = null;

  var enabled = true;
  var musicVol = 0.5;
  var sfxVol = 0.6;

  /** Инициализация — только по первому жесту пользователя */
  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();

      master = ctx.createGain();
      master.gain.value = enabled ? 1 : 0;
      master.connect(ctx.destination);

      musicGain = ctx.createGain();
      musicGain.gain.value = musicVol * 0.5;
      musicGain.connect(master);

      sfxGain = ctx.createGain();
      sfxGain.gain.value = sfxVol;
      sfxGain.connect(master);

      // Буфер коричневого шума 2 c
      var len = Math.floor(ctx.sampleRate * 2);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      var last = 0;
      for (var i = 0; i < len; i++) {
        var white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        d[i] = last * 3.5;
      }

      startAmbient();
      loadClickSample();
      loadMenuMusic();   // ✅ v0.5.21: музыка меню — трек игрока safe_zone.ogg
      /* ✅ v0.5.21: музыка играет ТОЛЬКО В МЕНЮ — ушёл в игру
         (loading/playing) — стоп, вернулся в меню — продолжает */
      try {
        if (window.BrixGame && BrixGame.on) {
          BrixGame.on(function (g5) { setInGame(g5.phase !== 'idle'); });
        }
      } catch (eBg) {}
    } catch (e) {
      ctx = null; // WebAudio недоступен — меню работает без звука
    }
  }

  /* ---------- ✅ v0.5.21 МУЗЫКА МЕНЮ (assets/sfx/menu/safe_zone.ogg):
     трек пользователя «safe zone» крутится ЛУПОМ через musicGain
     (громкость musicVol, мьют и отключение звука уважаются). Если файл
     не доехал/не декодировался — меню остаётся с синтезированным
     эмбиентом (стартует выше), ничего не ломается ---------- */
  var musicBuf = null;
  var musicSrc = null;
  var inGame = false;
  var MUSIC_GAIN = 0.85;              // громкость трека поверх эмбиента
  function startMusicSrc() {
    if (!ctx || !musicBuf || musicSrc) return;
    var src = ctx.createBufferSource();
    src.buffer = musicBuf;
    src.loop = true;
    var g4 = ctx.createGain();
    g4.gain.value = MUSIC_GAIN;
    src.connect(g4); g4.connect(musicGain);
    src.start(0);
    musicSrc = src;
  }
  function setInGame(v) {
    inGame = !!v;
    if (!ctx) return;
    if (inGame && musicSrc) {
      try { musicSrc.stop(); } catch (eM1) {}
      try { musicSrc.disconnect(); } catch (eM2) {}
      musicSrc = null;
    } else if (!inGame && musicBuf) {
      startMusicSrc();
    }
  }
  function loadMenuMusic() {
    if (!ctx || musicBuf) return;
    var u = window.BrixAsset
      ? window.BrixAsset('assets/sfx/menu/safe_zone.ogg')
      : 'assets/sfx/menu/safe_zone.ogg';
    var get = window.BrixFetch
      ? BrixFetch.bytes(u)
      : fetch(u).then(function (r) {
          if (!r.ok) throw new Error('no music');
          return r.arrayBuffer();
        });
    get.then(function (ab) { return ctx.decodeAudioData(ab); })
      .then(function (buf) {
        musicBuf = buf;
        if (!inGame) { startMusicSrc(); }
        console.log('[menuAudio] музыка меню (safe_zone) готова');
      })
      .catch(function () { musicBuf = null; });   // синт-эмбиент продолжает
  }

  /** Загрузка пользовательского звука нажатия (assets/sfx/click.mp3) */
  function loadClickSample() {
    if (!ctx) return;
    /* ✅ v0.5.9: retry 3 попытки / 2 c / таймаут 10 c (BrixFetch) —
       через туннель mp3 приходил 504 и звук нажатия пропадал навсегда;
       при полном провале — синтез (clickBuf = null) */
    var u = window.BrixAsset ? window.BrixAsset('assets/sfx/click.mp3') : 'assets/sfx/click.mp3';
    var get = window.BrixFetch
      ? BrixFetch.bytes(u)
      : fetch(u).then(function (r) {
          if (!r.ok) throw new Error('no sample');
          return r.arrayBuffer();
        });
    get.then(function (ab) { return ctx.decodeAudioData(ab); })
      .then(function (buf) { clickBuf = buf; })
      .catch(function () { clickBuf = null; });
  }

  function setEnabled(v) {
    enabled = v;
    if (!ctx || !master) return;
    var t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.linearRampToValueAtTime(v ? 1 : 0, t + 0.25);
  }

  function setVolumes(music, sfx) {
    musicVol = music;
    sfxVol = sfx;
    if (!ctx || !musicGain || !sfxGain) return;
    var t = ctx.currentTime;
    musicGain.gain.linearRampToValueAtTime(music * 0.5, t + 0.2);
    sfxGain.gain.linearRampToValueAtTime(sfx, t + 0.2);
  }

  /* ---------- эффекты ---------- */

  function hover() { blip(2600, 0.03, 0.10, 'highpass'); }

  function click() {
    // пользовательский сэмпл нажатия, при отсутствии — синтез
    if (ready() && clickBuf) {
      var t0 = ctx.currentTime;
      var src = ctx.createBufferSource();
      src.buffer = clickBuf;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.9, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + clickBuf.duration + 0.05);
      src.connect(g); g.connect(sfxGain);
      src.start(t0);
      return;
    }
    thunk(190, 70, 0.09, 0.5);
  }

  function back() { thunk(120, 45, 0.12, 0.45); }

  function error() {
    if (!ready()) return;
    var t0 = ctx.currentTime;
    [196, 208].forEach(function (f) {
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.22, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
      o.connect(g); g.connect(sfxGain);
      o.start(t0); o.stop(t0 + 0.25);
    });
  }

  function buy() {
    if (!ready()) return;
    var t0 = ctx.currentTime;
    [[660, 0], [880, 0.09], [1320, 0.18]].forEach(function (fd) {
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = fd[0];
      g.gain.setValueAtTime(0.0001, t0 + fd[1]);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + fd[1] + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + fd[1] + 0.3);
      o.connect(g); g.connect(sfxGain);
      o.start(t0 + fd[1]); o.stop(t0 + fd[1] + 0.32);
    });
  }

  /* ---------- приватное ---------- */

  function ready() {
    if (!ctx || !enabled) return false;
    if (ctx.state === 'suspended') ctx.resume();
    return !!sfxGain;
  }

  function blip(freq, dur, gain, filter) {
    if (!ready()) return;
    var t0 = ctx.currentTime;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    var g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.02);
  }

  function thunk(from, to, dur, gain) {
    if (!ready()) return;
    var t0 = ctx.currentTime;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(from, t0);
    o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(gain * 0.35, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.05);
    o.connect(g); g.connect(sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.08);
    blip(900, 0.05, gain * 0.3, 'lowpass');
  }

  function startAmbient() {
    if (!ctx || !musicGain || ambientStarted) return;
    ambientStarted = true;
    var t0 = ctx.currentTime;

    // Низкий рокот: шум → lowpass
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    var g = ctx.createGain();
    g.gain.value = 0.5;
    // Медленное «дыхание» громкости
    var lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    var lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.18;
    lfo.connect(lfoGain); lfoGain.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(musicGain);
    src.start(t0);
    lfo.start(t0);

    // Саб-дрон
    var sub = ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.value = 46;
    var subG = ctx.createGain();
    subG.gain.value = 0.05;
    sub.connect(subG); subG.connect(musicGain);
    sub.start(t0);

    scheduleGust();
  }

  /** Порыв ветра каждые 8–14 секунд */
  function scheduleGust() {
    if (gustTimer) clearTimeout(gustTimer);
    var delay = 8000 + Math.random() * 6000;
    gustTimer = setTimeout(function () {
      if (ctx && musicGain && noiseBuf) {
        var t0 = ctx.currentTime;
        var src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        src.loop = true;
        var bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 1.1;
        bp.frequency.setValueAtTime(300, t0);
        bp.frequency.linearRampToValueAtTime(1100, t0 + 2.2);
        bp.frequency.linearRampToValueAtTime(240, t0 + 4.5);
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.16, t0 + 2.2);
        g.gain.linearRampToValueAtTime(0.0001, t0 + 4.5);
        src.connect(bp); bp.connect(g); g.connect(musicGain);
        src.start(t0);
        src.stop(t0 + 4.8);
      }
      scheduleGust();
    }, delay);
  }

  return {
    init: init,
    setEnabled: setEnabled,
    setVolumes: setVolumes,
    hover: hover,
    click: click,
    back: back,
    error: error,
    buy: buy
  };
})();
