// ============================================================
//  brix • js/game/environment.js  ✅ v0.4.52
//  СУТКИ И ПОГОДА — клиентская половина. Часы ТИКАЮТ НА СЕРВЕРЕ
//  (server.js шлёт 'dnc' раз в секунду и кладёт состояние в welcome);
//  клиент только ПЛАВНО ДОГОНЯЕТ серверное время и рисует:
//    • фазы суток: рассвет 2 мин → день 12 мин → закат 3 мин →
//      сумерки 1.5 мин → ночь 10 мин (полный цикл 28.5 минут);
//    • погоду: ясно 20 мин ↔ хмуро 15 мин (тучи закрывают солнце,
//      густой туман, дождь/снег — частицы рисует precipitation.js);
//    • живое небо: солнце ходит по небосводу, палитры меняются,
//      ночью звёзды и луна; туман и экспозиция дышат вместе со светом.
//  ✅ v0.4.52:
//    • ПЛАВНЫЕ ПЕРЕХОДЫ ТУЧИ↔СВЕТ: любые причины смены погоды
//      (естественная смена, сигнал админа, догонка сервера) проходят
//      через экспоненциальное сглаживание — солнце, ТЕНИ и туман
//      гаснут/загораются мягко, без ступенек;
//    • ПЕРЕЛЁТ ВРЕМЕНИ: большой скачок серверного времени (админ
//      переключил фазу) небо ПРОЕЗЖАЕТ плавно, а не телепортом;
//    • РАДУГА ПОСЛЕ ДОЖДЯ: дождь кончился, солнце вышло — на небе
//      появляется радуга напротив солнца и плавно тает (~50 с).
//  СОЛО/ВКЛАДКИ (сервера нет): те же часы идут локально с нуля
//  (рассвет), математика фаз — 1:1 как в server.js.
//  Все палитры/цвета пересчитываются каждый кадр БЕЗ создания
//  объектов (переиспользуемые THREE.Color) — нагрузка ~0.
// ============================================================
window.BrixEnvironment = (function () {
  'use strict';

  /* ---------------- фазы суток (секунды) ---------------- */

  var PHASES = [
    { id: 'dawn',   dur: 120 },   // рассвет — малая фаза между ночью и днём
    { id: 'day',    dur: 720 },   // день — 12 минут
    { id: 'sunset', dur: 180 },   // закат — 3 минуты
    { id: 'dusk',   dur: 90 },    // сумерки — малая фаза между закатом и ночью
    { id: 'night',  dur: 600 }    // ночь — 10 минут
  ];
  var CYCLE_LEN = 1710;          // 120+720+180+90+600 = 28.5 минут

  /* ---------------- погода (секунды) ---------------- */

  var WX = [
    { id: 'clear',  dur: 1200 },  // ясно — 20 минут
    { id: 'gloomy', dur: 900 }    // хмуро — 15 минут: тучи, туман, осадки
  ];
  var WX_LEN = 2100;

  /* палитры: у каждой фазы цвет НАЧАЛА и цвет КОНЦА — фазы сшиты
     друг с другом (конец ночи = начало рассвета и т.д.), поэтому
     переходы всегда плавные и насыщенные */

  function C2(a, b) {
    return [new THREE.Color(a), new THREE.Color(b)];
  }
  function N2(a, b) { return [a, b]; }

  var PAL = {
    dawn: {
      zen: C2(0x101631, 0x5f97d0), hor: C2(0x2c3050, 0xffc98a),
      sun: C2(0x8a90b8, 0xffe6b8), fog: C2(0x1a2130, 0xe0bfa0),
      hemiSky: C2(0x202a48, 0xa5c0dc), hemiGnd: C2(0x171a1e, 0x5c574b),
      hemiI: N2(0.24, 0.9), sunI: N2(0.35, 2.7),
      sunC: C2(0x9db8e8, 0xffd090), exp: N2(1.02, 1.18),
      el: function (k) { return -0.3 + 0.65 * k; }   // солнце встаёт из-за горизонта
    },
    day: {
      zen: C2(0x3e78c4, 0x4b86cf), hor: C2(0xbcdcec, 0xcfe6f2),
      sun: C2(0xfff2cf, 0xfff2cf), fog: C2(0xc5d8e2, 0xcddde6),
      hemiSky: C2(0x9ab8d0, 0xa5c3d8), hemiGnd: C2(0x54503e, 0x5c5844),
      hemiI: N2(1.15, 1.2), sunI: N2(3.0, 3.0),
      sunC: C2(0xffe2b4, 0xffe2b4), exp: N2(1.18, 1.18),
      el: function (k) { return 0.35 + 0.65 * Math.sin(Math.PI * k); }  // пик в полдень
    },
    sunset: {
      zen: C2(0x4b86cf, 0x74469e), hor: C2(0xcfe6f2, 0xff5f3c),
      sun: C2(0xfff2cf, 0xff8d4a), fog: C2(0xcddde6, 0xd88a6e),
      hemiSky: C2(0xa5c3d8, 0x8a6a9a), hemiGnd: C2(0x5c5844, 0x4a3830),
      hemiI: N2(1.2, 0.6), sunI: N2(3.0, 1.7),
      sunC: C2(0xffe2b4, 0xff9048), exp: N2(1.18, 1.14),
      el: function (k) { return 0.35 * (1 - k); }    // солнце опускается к горизонту
    },
    dusk: {
      zen: C2(0x74469e, 0x1c2144), hor: C2(0xff5f3c, 0x3a3458),
      sun: C2(0xff8d4a, 0x80609a), fog: C2(0xd88a6e, 0x3a3a52),
      hemiSky: C2(0x8a6a9a, 0x2e3358), hemiGnd: C2(0x4a3830, 0x241f1e),
      hemiI: N2(0.6, 0.28), sunI: N2(1.7, 0.4),
      sunC: C2(0xff9048, 0x9078b8), exp: N2(1.14, 1.04),
      el: function (k) { return -0.3 * k; }          // под горизонтом
    },
    night: {
      zen: C2(0x1c2144, 0x101631), hor: C2(0x3a3458, 0x2c3050),
      sun: C2(0x80609a, 0x8a90b8), fog: C2(0x3a3a52, 0x1a2130),
      hemiSky: C2(0x2e3358, 0x202a48), hemiGnd: C2(0x241f1e, 0x171a1e),
      hemiI: N2(0.28, 0.24), sunI: N2(0.4, 0.35),
      sunC: C2(0x9078b8, 0x9db8e8), exp: N2(1.04, 1.02),
      el: function (k) { return -0.3 - 0.25 * Math.sin(Math.PI * k); }  // луна в зените
    }
  };

  /* вода: дневная / закатная / ночная — лерп между ними */
  var WATER_DAY = new THREE.Color(0x3f6d66);
  var WATER_DUSK = new THREE.Color(0x5d5a63);
  var WATER_NIGHT = new THREE.Color(0x14262e);
  var WATER_GLOOM = new THREE.Color(0x46545a);

  /* ---------------- состояние ---------------- */

  var phaseIdx = 0, phaseK = 0;      // текущая фаза и её прогресс 0..1
  var ct = 0;                        // секунды от начала цикла (рассвет = 0)
  var wxIdx = 0, wt = 0;             // погода и её прогресс (секунды)
  var srv = null;                    // последнее состояние сервера {ct,wx,wt}
  var ready = false;
  /* ✅ v0.4.52: сглаженные «визуальные» силы — сюда падают цели (сырые
     значения из расписания погоды), а рисуется всегда плавное значение */
  var smCloud = 0, smRain = 0;
  /* ✅ v0.4.52: радуга — таймер жизни (1 = только что появились) и
     «память дождя»: сколько секунд назад был сильный дождь (для
     надёжного триггера — и при естественной погоде, и после сигнала
     админа, когда всё сглаживается быстро) */
  var rainbowT = 0, rainMemory = 0;

  var scene = null, sky = null, lights = null, water = null, renderer = null;
  var bgCol = null;

  /* переиспользуемые цвета (БЕЗ new в кадре) */
  var _zen = new THREE.Color(), _hor = new THREE.Color(), _sun = new THREE.Color(),
    _fog = new THREE.Color(), _hSky = new THREE.Color(), _hGnd = new THREE.Color(),
    _sunC = new THREE.Color(), _tmpC = new THREE.Color();

  /* публичное «сейчас» — то, что читают sky/lights/вода/частицы/HUD */
  var cur = {
    phase: 'dawn', phaseK: 0,
    wx: 'clear', gloomyK: 0,          // 0..1 — насколько всё хмуро (тучи/туман)
    rainK: 0,                          // 0..1 — сила осадков (дождь ДО зимы)
    snowTarget: 0,                     // 0..1 — доля снега (считает gameworld: winterK)
    sunEl: 0, sunAz: 0, nightK: 0,
    cloudDark: 0, fogDensity: 0.00092,
    clock: '05:00',
    /* ✅ v0.4.52: вспышка молнии 0..1 (пишет storm.js) и радуга 0..1 */
    flashK: 0,
    rainbowK: 0,
    /* цвета — пересчитываются каждый кадр */
    zen: _zen, hor: _hor, sun: _sun, fog: _fog,
    hemiSky: _hSky, hemiGnd: _hGnd, hemiI: 1.15,
    sunI: 3.0, sunC: _sunC, exp: 1.18,
    glowK: 0                           // насколько солнце «в огне» у горизонта
  };

  /* ---------------- утилиты ---------------- */

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function sstep(a, b, x) {
    var t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mixC(out, pair, k) {
    out.copy(pair[0]).lerp(pair[1], k);
    return out;
  }

  function phaseIndexAt(t) {
    var acc = 0;
    for (var i = 0; i < PHASES.length; i++) {
      acc += PHASES[i].dur;
      if (t < acc) return i;
    }
    return PHASES.length - 1;
  }
  function wxIndexAt(id) {
    for (var i = 0; i < WX.length; i++) if (WX[i].id === id) return i;
    return 0;
  }

  /* ---------------- серверное состояние ---------------- */

  /** server.js: 'dnc' {ct, wx, wt} раз в секунду + welcome.dnc при входе */
  function setServerState(msg) {
    if (!msg) return;
    srv = {
      ct: Math.max(0, Math.min(CYCLE_LEN, Number(msg.ct) || 0)),
      wx: String(msg.wx || 'clear'),
      wt: Math.max(0, Number(msg.wt) || 0)
    };
    if (!ready) {   // мир ещё строится — применяем сразу, чтобы не ждать
      ct = srv.ct;
      wxIdx = wxIndexAt(srv.wx);
      wt = srv.wt;
      smCloud = 0; smRain = 0;   // ✅ v0.4.52: в новом мире без истории — плавный подъём
      srv = null;   // синхронизированы — дальше мягкая догонка в update
      ready = true;
    }
  }

  /* ---------------- главный такт ---------------- */

  function update(dt, winterK) {
    dt = Math.min(dt, 0.1);   // защита от прыжка после лага/возврата из свёрнутой вкладки

    /* часы идут локально — плавная анимация каждый кадр */
    ct += dt;
    if (ct >= CYCLE_LEN) ct -= CYCLE_LEN;
    wt += dt;
    if (wt >= WX[wxIdx].dur) { wxIdx = (wxIdx + 1) % WX.length; wt = 0; }

    /* мягкая синхронизация с сервером (пуши 1 Гц): догоняем на 8%/кадр,
       при разрыве >10 с — ✅ v0.4.52 ПЕРЕЛЁТ вместо телепорта (админ
       переключил время суток — небо плавно едет к новому времени,
       солнце садится/встаёт, ничего не мигает) */
    if (srv) {
      var dCt = srv.ct - ct;
      if (Math.abs(dCt) > 10) {
        var sweep = CYCLE_LEN / 5 * dt;      // весь цикл — не дольше 5 секунд
        if (Math.abs(dCt) <= sweep) ct = srv.ct;
        else ct += (dCt > 0 ? sweep : -sweep);
      } else {
        ct += dCt * Math.min(1, dt * 5);
      }
      if (srv.wx !== WX[wxIdx].id) { wxIdx = wxIndexAt(srv.wx); wt = srv.wt; }
      else {
        var dWt = srv.wt - wt;
        if (Math.abs(dWt) > 10) wt = srv.wt;
        else wt += dWt * Math.min(1, dt * 5);
      }
    }

    /* --- фаза суток --- */
    phaseIdx = phaseIndexAt(ct);
    var ph = PHASES[phaseIdx];
    var acc = 0;
    for (var i = 0; i < phaseIdx; i++) acc += PHASES[i].dur;
    phaseK = clamp01((ct - acc) / ph.dur);

    var pal = PAL[ph.id];
    cur.phase = ph.id;
    cur.phaseK = phaseK;

    /* --- погода --- */
    cur.wx = WX[wxIdx].id;
    var wd = WX[wxIdx].dur;
    /* тучи собираются/рассеиваются по 75 секунд с краёв хмурого периода */
    var gloom = cur.wx === 'gloomy' ? 1 : 0;
    /* осадки начинаются, когда тучи уже собрались (+25 с), и кончаются
       чуть раньше их рассеивания — всё ПЛАВНО, без резких включений */
    var rainRaw = gloom * sstep(25, 65, wt) * (1 - sstep(wd - 65, wd - 25, wt));

    /* ✅ v0.4.52 ПЛАВНЫЕ ПЕРЕХОДЫ ТУЧИ↔СВЕТ: сырые цели выше могут
       смениться мгновенно (сигнал админа, скачок wt при догонке сервера).
       Поэтому ВСЁ, что рисуется (солнце, ТЕНИ, туман, звёзды, тучи,
       осадки, вода), читает СГЛАЖЕННЫЕ значения — экспоненциальное
       сглаживание не даёт ни одной ступеньки, где бы ни сменнулась
       причина. Хмуро набирается/уходит ~4.5 с, дождь — ~2.2 с */
    smCloud += (gloom - smCloud) * Math.min(1, dt / 4.5);
    if (Math.abs(smCloud - gloom) < 0.004) smCloud = gloom;
    smRain += (rainRaw - smRain) * Math.min(1, dt / 2.2);
    if (Math.abs(smRain - rainRaw) < 0.004) smRain = rainRaw;

    cur.cloudDark = smCloud;
    cur.gloomyK = smCloud;
    cur.rainK = smRain;
    cur.snowTarget = cur.rainK * clamp01(winterK || 0);

    /* --- солнце по небосводу --- */
    cur.sunEl = pal.el(phaseK);
    cur.sunAz = (ct / CYCLE_LEN) * Math.PI * 2 + 2.1;
    cur.nightK = sstep(0.06, -0.12, cur.sunEl);
    cur.glowK = clamp01(1 - Math.abs(cur.sunEl) * 1.8) * (cur.sunEl > -0.12 ? 1 : 0);

    /* ✅ v0.4.52 РАДУГА ПОСЛЕ ДОЖДЯ: недавно (≤20 с) был сильный дождь,
       осадки кончились (сила < 0.22), тучи уже разошлись (dark < 0.75),
       солнце над горизонтом — над горизонтом НАПРОТИВ СОЛНЦА всплывает
       радуга и плавно тает ~50 с. «Память дождя» гарантирует радугу и при
       быстром сглаженном переходе (сигнал админа ХМУРО→ЯСНО днём), и
       при естественной смене погоды — в тот момент, когда небо очистилось */
    if (cur.rainK > 0.5) rainMemory = 20;
    else rainMemory = Math.max(0, rainMemory - dt);
    if (rainbowT > 0) rainbowT = Math.max(0, rainbowT - dt / 50);
    if (rainMemory > 0 && rainbowT <= 0 && cur.rainK < 0.22 &&
        cur.cloudDark < 0.75 && cur.sunEl > 0.04 && cur.nightK < 0.5) {
      rainbowT = 1;
    }
    cur.rainbowK = clamp01(rainbowT) * sstep(0.03, 0.14, cur.sunEl) *
      (1 - sstep(0.5, 0.85, cur.cloudDark)) * (1 - cur.nightK);

    /* --- палитра: лерп «начало → конец» внутри фазы --- */
    mixC(_zen, pal.zen, phaseK); mixC(_hor, pal.hor, phaseK);
    mixC(_sun, pal.sun, phaseK); mixC(_fog, pal.fog, phaseK);
    mixC(_hSky, pal.hemiSky, phaseK); mixC(_hGnd, pal.hemiGnd, phaseK);
    mixC(_sunC, pal.sunC, phaseK);
    cur.hemiI = lerp(pal.hemiI[0], pal.hemiI[1], phaseK);
    cur.sunI = lerp(pal.sunI[0], pal.sunI[1], phaseK);
    cur.exp = lerp(pal.exp[0], pal.exp[1], phaseK);

    /* хмуро приглушает всё живое: тучи закрывают солнце, краски сереют */
    _zen.lerp(_tmpC.set(0x525a63), cur.cloudDark * 0.55);
    _hor.lerp(_tmpC.set(0x767d84), cur.cloudDark * 0.55);
    _fog.lerp(_tmpC.set(0x6e767c), cur.cloudDark * 0.5);
    _hSky.lerp(_tmpC.set(0x5f6a72), cur.cloudDark * 0.5);

    /* туман: базовый + густой в хмуро + чуть плотнее ночью */
    cur.fogDensity = 0.00092 + 0.0032 * cur.gloomyK + 0.0006 * cur.nightK;

    /* игровые часы: рассвет начинается в 05:00 */
    var mins = (5 * 60 + (ct / CYCLE_LEN) * 24 * 60) % (24 * 60);
    var hh = Math.floor(mins / 60), mm = Math.floor(mins % 60);
    cur.clock = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;

    /* --- применяем к сцене --- */
    if (!ready) ready = true;
    if (sky && sky.updateEnv) sky.updateEnv(cur);
    if (lights && lights.updateEnv) lights.updateEnv(cur);
    if (water && water.updateEnv) water.updateEnv(cur);
    if (scene && scene.fog) {
      scene.fog.color.copy(_fog);
      scene.fog.density = cur.fogDensity;
    }
    if (bgCol) bgCol.copy(_fog);
    if (renderer) renderer.toneMappingExposure = cur.exp;
  }

  /* ---------------- создание ---------------- */

  /**
   * create(scene, sky, lights, water, renderer)
   * sky/lights/water — объекты из BrixWorld (у них появились updateEnv).
   */
  function create(sceneRef, skyRef, lightsRef, waterRef, rendererRef) {
    scene = sceneRef;
    sky = skyRef;
    lights = lightsRef;
    water = waterRef;
    renderer = rendererRef;
    if (scene && scene.background && scene.background.isColor) {
      bgCol = scene.background;
    }
    return api;
  }

  /* ---------------- вопросы наружу ---------------- */

  function isNight() {
    /* ночь = сумерки + ночь (для холода: ночью в зиме мороз ×2) */
    return cur.phase === 'night' || cur.phase === 'dusk';
  }
  function phaseKey() { return cur.phase; }
  function weatherKey() { return cur.wx; }
  function clockText() { return cur.clock; }
  /** строка для HUD: «07:15 · День · Хмуро» */
  function hudText() {
    var t = window.BrixState ? BrixState.t : function (k) { return k; };
    var s = cur.clock + ' · ' + t('env.' + cur.phase);
    if (cur.wx === 'gloomy') s += ' · ' + t('wx.gloomy');
    return s;
  }

  function dispose() {
    scene = null; sky = null; lights = null; water = null;
    renderer = null; bgCol = null; srv = null; ready = false;
    smCloud = 0; smRain = 0; rainbowT = 0; rainMemory = 0;
  }

  var api = {
    create: create,
    update: update,
    setServerState: setServerState,
    isNight: isNight,
    phaseKey: phaseKey,
    weatherKey: weatherKey,
    clockText: clockText,
    hudText: hudText,
    cur: cur,
    CYCLE_LEN: CYCLE_LEN,
    dispose: dispose
  };
  return api;
})();
