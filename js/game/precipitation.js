// ============================================================
//  brix • js/game/precipitation.js  ✅ v0.4.51
//  ОСАДКИ — НАСТОЯЩИЙ 3D (не 2D-оверлей) С ОПТИМИЗАЦИЕЙ ПОД ФПС:
//    • дождь — InstancedMesh «капель-полос» (билборды, вытянутые по
//      вектору падения): падение, ветер и оборачивание вокруг камеры
//      считает ВИДЕОКАРТА в вершинном шейдере. Процессор обновляет
//      только uniform'ы (время/позицию камеры/силу) — частиц можно
//      поставить много, а ФПС не падает;
//    • снег — THREE.Points с мягкой круглой текстурой из шейдера,
//      снежинки кружатся и летят медленнее дождя;
//    • ПЕРЕХОД ДОЖДЬ↔СНЕГ ПЛАВНЫЙ: два коэффициента (uRain/uSnow)
//      лерпятся несколько секунд — в зиме (снеговая линия) дождь
//      незаметно превращается в снег, и обратно;
//    • ЗВУК ДОЖДА: бесшовный луп assets/sfx/rain/rain_loop.ogg
//      (конец клипа перетёк в начало — стыка не слышно), тихий,
//      включение/выключение через linearRamp — «звук подъезжает»,
//      без щелчков и обрывов. В снеге дождь затихает.
//  Осадки следуют за камерой (зона вокруг игрока), frustumCulled off.
// ============================================================
window.BrixPrecip = (function () {
  'use strict';

  var scene = null;
  var rainMesh = null, snowPoints = null;
  var rainMat = null, snowMat = null;
  var quality = 'medium';

  /* сглаженные силы (цели приходят из BrixEnvironment.cur) */
  var rainS = 0, snowS = 0;

  /* ---------------- звук дождя ---------------- */

  var actx = null, rainGain = null, rainSrc = null, rainBuf = null;
  var rainVol = 0, lastRamp = 0, audioReady = false;

  function ensureAudio() {
    if (audioReady) return;
    audioReady = true;   // одна попытка — без спама
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      actx = new AC();
      rainGain = actx.createGain();
      rainGain.gain.value = 0;
      rainGain.connect(actx.destination);
      var url = window.BrixAsset
        ? window.BrixAsset('assets/sfx/rain/rain_loop.ogg')
        : 'assets/sfx/rain/rain_loop.ogg';
      fetch(url)
        .then(function (r) { if (!r.ok) throw new Error('rain ' + r.status); return r.arrayBuffer(); })
        .then(function (ab) { return actx.decodeAudioData(ab); })
        .then(function (buf) {
          rainBuf = buf;
          if (!actx) return;
          rainSrc = actx.createBufferSource();
          rainSrc.buffer = buf;
          rainSrc.loop = true;                 // луп бесшовный — стык не слышен
          rainSrc.connect(rainGain);
          rainSrc.start(0);
        })
        .catch(function () { actx = null; });
    } catch (e) { actx = null; }
  }

  /** плавно тянем громкость к цели (linearRamp — без щелчков/обрывов) */
  function audioTick(target) {
    if (!actx || !rainGain) return;
    if (actx.state === 'suspended') { try { actx.resume(); } catch (e) {} }
    var now = actx.currentTime;
    if (Math.abs(target - rainVol) < 0.004) return;
    if (now - lastRamp < 0.25) return;      // не чаще 4 раз/с — иначе спам автоматизации
    lastRamp = now;
    rainVol = target;
    try {
      rainGain.gain.cancelScheduledValues(now);
      rainGain.gain.setValueAtTime(rainGain.gain.value, now);
      /* 2.2 секунды — дождь «подъезжает» и «уезжает» мягко */
      rainGain.gain.linearRampToValueAtTime(target, now + 2.2);
    } catch (e) {}
  }

  /* ---------------- геометрия/материалы ---------------- */

  function rainCount() {
    return quality === 'high' ? 1500 : quality === 'low' ? 400 : 900;
  }
  function snowCount() {
    return quality === 'high' ? 850 : quality === 'low' ? 220 : 500;
  }

  var RAIN_VS = [
    'attribute vec4 aSeed;',      // x,z — место в зоне, y — стартовая высота, w — скорость
    'attribute float aLen;',      // длина капли-полосы
    'uniform float uTime;',
    'uniform vec3 uCam;',
    'uniform vec3 uRight;',
    'uniform float uBox;',
    'uniform float uH;',
    'uniform float uWind;',
    'varying float vA;',
    'void main() {',
    '  vec3 p = vec3(aSeed.x, aSeed.y, aSeed.z);',
    '  p.y = mod(p.y - uTime * aSeed.w, uH);',                        // падение + обёртка по высоте
    '  p.x = mod(p.x + uWind * uTime * 2.0 + uBox, uBox * 2.0) - uBox;', // ветер + обёртка по ширине
    '  vec3 wpos = vec3(uCam.x + p.x, uCam.y - 4.0 + p.y, uCam.z + p.z);',
    '  vec3 vel = normalize(vec3(uWind, -1.0, 0.0));',                // капля тянется по вектору падения
    '  vec3 pos = wpos + uRight * position.x * 0.045 + vel * position.y * (0.5 + aLen);',
    '  vec4 mv = modelViewMatrix * vec4(pos, 1.0);',
    '  gl_Position = projectionMatrix * mv;',
    '  vA = 1.0 - smoothstep(uBox * 0.45, uBox, length(p.xz));',      // мягкий край зоны
    '}'
  ].join('\n');

  var RAIN_FS = [
    'uniform float uStrength;',
    'uniform vec3 uTint;',
    'varying float vA;',
    'void main() {',
    '  float a = uStrength * vA;',
    '  if (a < 0.012) discard;',
    '  gl_FragColor = vec4(uTint, a * 0.34);',
    '}'
  ].join('\n');

  var SNOW_VS = [
    'attribute float aSize;',
    'attribute float aPhase;',
    'uniform float uTime;',
    'uniform vec3 uCam;',
    'uniform float uBox;',
    'uniform float uH;',
    'uniform float uWind;',
    'varying float vA;',
    'void main() {',
    '  vec3 p = position;',
    '  p.y = mod(p.y - uTime * (0.55 + aPhase * 0.35), uH);',         // снежинка летит медленно
    '  p.x += sin(uTime * 0.7 + aPhase * 19.0) * 1.7 + uWind * uTime * 3.0;',
    '  p.x = mod(p.x + uBox * 3.0, uBox * 2.0) - uBox;',
    '  vec3 wpos = vec3(uCam.x + p.x, uCam.y - 4.0 + p.y, uCam.z + p.z);',
    '  vec4 mv = modelViewMatrix * vec4(wpos, 1.0);',
    '  gl_PointSize = aSize * (170.0 / max(1.0, -mv.z));',            // перспективный размер
    '  gl_Position = projectionMatrix * mv;',
    '  vA = 1.0 - smoothstep(uBox * 0.45, uBox, length(p.xz));',
    '}'
  ].join('\n');

  var SNOW_FS = [
    'uniform float uStrength;',
    'uniform vec3 uTint;',
    'varying float vA;',
    'void main() {',
    '  float d = length(gl_PointCoord - vec2(0.5));',
    '  float a = smoothstep(0.5, 0.14, d) * uStrength * vA;',
    '  if (a < 0.012) discard;',
    '  gl_FragColor = vec4(uTint, a * 0.85);',
    '}'
  ].join('\n');

  function makeRain(sceneRef) {
    var n = rainCount();
    var geo = new THREE.PlaneGeometry(1, 1);
    var seeds = new Float32Array(n * 4);
    var lens = new Float32Array(n);
    var R = 21, H = 26;
    for (var i = 0; i < n; i++) {
      seeds[i * 4] = (Math.random() * 2 - 1) * R;
      seeds[i * 4 + 1] = Math.random() * H;
      seeds[i * 4 + 2] = (Math.random() * 2 - 1) * R;
      seeds[i * 4 + 3] = 9 + Math.random() * 6;      // скорость падения, м/с
      lens[i] = Math.random() * 0.8;
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geo.setAttribute('aLen', new THREE.InstancedBufferAttribute(lens, 1));
    rainMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uCam: { value: new THREE.Vector3() },
        uRight: { value: new THREE.Vector3(1, 0, 0) },
        uBox: { value: R }, uH: { value: H }, uWind: { value: 0.12 },
        uStrength: { value: 0 },
        uTint: { value: new THREE.Color(0xcfe0ff) }
      },
      vertexShader: RAIN_VS, fragmentShader: RAIN_FS,
      transparent: true, depthWrite: false, side: THREE.DoubleSide
    });
    rainMesh = new THREE.InstancedMesh(geo, rainMat, n);
    rainMesh.frustumCulled = false;
    rainMesh.renderOrder = 9;
    var zero = new THREE.Matrix4();
    for (var k = 0; k < n; k++) rainMesh.setMatrixAt(k, zero);
    rainMesh.instanceMatrix.needsUpdate = true;
    sceneRef.add(rainMesh);
  }

  function makeSnow(sceneRef) {
    var n = snowCount();
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(n * 3);
    var sizes = new Float32Array(n);
    var phases = new Float32Array(n);
    var R = 18, H = 24;
    for (var i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * R;
      pos[i * 3 + 1] = Math.random() * H;
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * R;
      sizes[i] = 0.28 + Math.random() * 0.4;
      phases[i] = Math.random();
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    snowMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uCam: { value: new THREE.Vector3() },
        uBox: { value: R }, uH: { value: H }, uWind: { value: 0.1 },
        uStrength: { value: 0 },
        uTint: { value: new THREE.Color(0xf4f8ff) }
      },
      vertexShader: SNOW_VS, fragmentShader: SNOW_FS,
      transparent: true, depthWrite: false
    });
    snowPoints = new THREE.Points(geo, snowMat);
    snowPoints.frustumCulled = false;
    snowPoints.renderOrder = 9;
    sceneRef.add(snowPoints);
  }

  /* ---------------- создание / такт / выгрузка ---------------- */

  function create(sceneRef, qualitySetting) {
    scene = sceneRef;
    quality = qualitySetting || 'medium';
    try {
      makeRain(scene);
      makeSnow(scene);
    } catch (e) {
      console.warn('[BrixPrecip] осадки не поднялись (не критично):', e && e.message);
    }
    return api;
  }

  var _right = null;
  function update(dt, camera, env) {
    if (!rainMesh || !snowMat || !env || !env.cur) return;
    var c = env.cur;

    /* цели: дождь идёт, когда хмуро, но в зиме превращается в снег —
       переход задают коэффициенты снеговой линии (winterK у environment) */
    var rainTarget = Math.max(0, c.rainK - c.snowTarget);
    var snowTarget = c.snowTarget;
    var k = Math.min(1, dt * 0.8);            // ~2-3 секунды на плавный переход
    rainS += (rainTarget - rainS) * k;
    snowS += (snowTarget - snowS) * k;

    var t = performance.now() / 1000;
    var wind = 0.1 + 0.08 * Math.sin(t * 0.3) + c.gloomyK * 0.1;   // в хмуро ветер сильнее

    /* цвет осадок: днём светлые, ночью темнеют (умножено на лунный свет) */
    var dayK = 1 - c.nightK;

    rainMat.uniforms.uTime.value = t;
    rainMat.uniforms.uCam.value.copy(camera.position);
    if (!_right) _right = new THREE.Vector3();
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion);   // right камеры для билборда
    _right.y = 0;
    if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
    _right.normalize();
    rainMat.uniforms.uRight.value.copy(_right);
    rainMat.uniforms.uWind.value = wind;
    rainMat.uniforms.uStrength.value = rainS;
    rainMat.uniforms.uTint.value.setRGB(
      0.55 + 0.45 * dayK, 0.62 + 0.38 * dayK, 0.72 + 0.28 * dayK);

    snowMat.uniforms.uTime.value = t;
    snowMat.uniforms.uCam.value.copy(camera.position);
    snowMat.uniforms.uWind.value = wind * 0.6;
    snowMat.uniforms.uStrength.value = snowS;
    snowMat.uniforms.uTint.value.setRGB(
      0.62 + 0.38 * dayK, 0.68 + 0.32 * dayK, 0.78 + 0.22 * dayK);

    /* звук: тихий; громкость = сила дождя, в снеге почти затихает;
       настройки звука игрока уважаем (sound/sfxVol) */
    var vol = 0;
    try {
      var st = window.BrixState ? BrixState.data.settings : null;
      var on = st ? (st.sound !== false) : true;
      var sv = st ? (st.sfxVol !== undefined ? st.sfxVol : 0.6) : 0.6;
      vol = 0.34 * rainS * (1 - 0.85 * snowS) * (on ? 1 : 0) * sv;
    } catch (e) { vol = 0.34 * rainS * (1 - 0.85 * snowS); }
    audioTick(vol);
  }

  function dispose() {
    if (scene && rainMesh) { scene.remove(rainMesh); rainMesh.geometry.dispose(); rainMat.dispose(); }
    if (scene && snowPoints) { scene.remove(snowPoints); snowPoints.geometry.dispose(); snowMat.dispose(); }
    rainMesh = null; snowPoints = null; rainMat = null; snowMat = null;
    rainS = 0; snowS = 0;
    try { if (rainSrc) { rainSrc.stop(); rainSrc.disconnect(); } } catch (e) {}
    try { if (rainGain) rainGain.disconnect(); } catch (e) {}
    rainSrc = null; rainGain = null; actx = null; rainBuf = null;
    rainVol = 0; audioReady = false;
  }

  var api = {
    create: create,
    update: update,
    dispose: dispose,
    /** для отладки: текущие сглаженные силы */
    strengths: function () { return { rain: rainS, snow: snowS }; }
  };
  return api;
})();
