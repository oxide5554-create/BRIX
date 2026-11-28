// ============================================================
//  brix • js/game/world.js
//  Сборка мира Brixland: небо (шейдер), солнце с тенями, вода,
//  растительность и РУДЫ. Деревья — 3D-модель pine_tree.glb
//  (InstancedMesh по мешам модели), руды — модели из PickSky:
//    iron  = stylized_silver_ore (silver ore = ЖЕЛЕЗО)
//    sulfur= stylized_gold_ore   (gold ore = СЕРА)
//    stone = stone.glb (gold ore без золотых камней)
//  Каждая рудная жила — копаемая киркой запись с health.
//  ✅ v0.2.5: кусты и декоративные камни-валуны УДАЛЕНЫ по просьбе —
//  в мире остаются только деревья и ЛОМАЕМЫЕ руды (камень/железо/сера).
//  ✅ v0.2.8: ТРАВА — иконка пользователя grass.png стала настоящей
//  травой: крестовые билборды (2 плоскости) инстансами по всему миру,
//  качание ветром в шейдере. Лагерь на спавне. Полный перенос из lib/game/world.ts.
//  ✅ v0.2.9: 1) у деревьев и рудных жил есть КОЛЛАЙДЕРЫ (сквозь стволы
//  и камни не пройти; коллайдер исчезает, когда дерево спилено/жила
//  выработана); 2) рубка только по СТВОЛУ — меши дерева размечены
//  (материал «Trank» = ствол, «Leavs» = листва); 3) рудные жилы
//  ОПУЩЕНЫ ВНИЗ: ставятся по высоте отрисованной сетки террейна
//  (meshHeightAt) и утапливаются на ~20% высоты — больше не «летают».
// ============================================================
window.BrixWorld = (function () {
  'use strict';

  var T = window.BrixTerrain;
  var N = window.BrixNoise;

  /* ✅ v0.5.23: смещение сида для генераторов объектов — деревья, руды,
     лагерь, облака на вайп-карте СВОИ (сид 0 = прежний BrixLand) */
  function seedOffW() { return ((window.BRIX_TERRAIN_SEED || 0) | 0) * 7919; }

  var nextFrame = function () {
    /* ✅ v0.5.24: гонка rAF/таймер — загрузка не замирает в фоновой вкладке */
    return new Promise(function (r) {
      var done = false;
      var fin = function () { if (!done) { done = true; r(); } };
      requestAnimationFrame(fin);
      setTimeout(fin, 60);
    });
  };

  /** Пологий ли склон в точке (приблизительный градиент высоты) */
  function slopeAt(x, z, d) {
    d = d || 2;
    var dx = (T.heightAt(x + d, z) - T.heightAt(x - d, z)) / (2 * d);
    var dz = (T.heightAt(x, z + d) - T.heightAt(x, z - d)) / (2 * d);
    return Math.sqrt(dx * dx + dz * dz);
  }

  /* ---------------- Небо ---------------- */

  /* ✅ v0.4.51 ЖИВОЕ НЕБО: палитры ведёт BrixEnvironment (сутки),
     солнце ходит по небосводу, ночью выходят ЗВЁЗДЫ и ЛУНА, у
     горизонта — закатный ореол; облака стали мягкими (canvas-
     градиент вместо жёстких плит) + отдельный слой ХМУРЫХ туч,
     которые затягивают небо и ЗАКРЫВАЮТ СОЛНЦЕ (ведёт погода).
     ✅ v0.4.52: облака и в ЯСНУЮ погоду — их теперь 20, они
     заметнее, закат красит их в золото, ночью они темнеют; в
     шейдер неба добавлены РАДУГА (кольцо напротив солнца) и
     ВСПЫШКА МОЛНИИ (пишет storm.js) */
  function createSky(scene) {
    var geo = new THREE.SphereGeometry(1600, 24, 14);
    var mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x5c86b0) },
        horizonColor: { value: new THREE.Color(0xd3c8ab) },
        sunDir: { value: new THREE.Vector3(-0.45, 0.62, -0.4).normalize() },
        sunColor: { value: new THREE.Color(0xfff1cf) },
        sunDim: { value: 1 },        // тучи приглушают солнце
        glowK: { value: 0 },         // закатный ореол у горизонта
        moonDir: { value: new THREE.Vector3(0.45, 0.5, 0.4).normalize() },
        moonI: { value: 0 },         // луна видна ночью
        flashK: { value: 0 }         // ✅ v0.4.52: вспышка молнии 0..1
        /* ✅ v0.5.13: радуга УДАЛЕНА — рисовалась двумя вертикальными
           радужными «стенами» от горизонта до зенита (азимутальная
           математика вместо полярной) и висела ясным днём */
      },
      vertexShader: [
        'varying vec3 vDir;',
        'void main() {',
        '  vDir = position;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 topColor;',
        'uniform vec3 horizonColor;',
        'uniform vec3 sunDir;',
        'uniform vec3 sunColor;',
        'uniform float sunDim;',
        'uniform float glowK;',
        'uniform vec3 moonDir;',
        'uniform float moonI;',
        'uniform float flashK;',
        'varying vec3 vDir;',
        'void main() {',
        '  vec3 d = normalize(vDir);',
        '  float t = clamp(d.y, 0.0, 1.0);',
        '  vec3 col = mix(horizonColor, topColor, pow(t, 0.6));',
        '  float s = max(dot(d, normalize(sunDir)), 0.0);',
        '  /* солнце: диск + широкий ореол, тучи гасят */',
        '  col += sunColor * ((pow(s, 350.0) * 1.4 + pow(s, 8.0) * 0.14) * sunDim);',
        '  /* закат/рассвет: тёплое зарево вокруг солнца у горизонта */',
        '  col += sunColor * pow(s, 3.0) * 0.34 * glowK * sunDim;',
        '  /* луна: диск + мягкое гало (ночью) */',
        '  float m = max(dot(d, normalize(moonDir)), 0.0);',
        '  col += vec3(0.82, 0.88, 1.0) * (pow(m, 1500.0) * 2.4 + pow(m, 90.0) * 0.16) * moonI;',
        '  /* ✅ v0.4.52 молния: небо коротко вспыхивает (плавный спад ведёт storm.js) */',
        '  col += vec3(0.85, 0.9, 1.0) * flashK * (0.3 + 0.45 * (1.0 - t));',
        '  /* ✅ v0.5.13 радуга удалена (баг-лучи вместо дуги) */',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -10;
    scene.add(mesh);

    /* ✅ ЗВЁЗДЫ — Points на верхней полусфере, ночью проявляются,
       в хмуро прячутся за тучами; медленно вращаются */
    var starGeo = new THREE.BufferGeometry();
    var starPos = new Float32Array(420 * 3);
    var srng = N.makeRng(20261120);
    for (var si = 0; si < 420; si++) {
      var sa = srng() * Math.PI * 2;
      var sy = 0.12 + srng() * 0.88;                 // над горизонтом
      var sr = Math.sqrt(Math.max(0, 1 - sy * sy));
      starPos[si * 3] = Math.cos(sa) * sr * 1540;
      starPos[si * 3 + 1] = sy * 1540;
      starPos[si * 3 + 2] = Math.sin(sa) * sr * 1540;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    var starMat = new THREE.PointsMaterial({
      color: 0xdfe8ff, size: 2.4, sizeAttenuation: false,
      transparent: true, opacity: 0, depthWrite: false, fog: false
    });
    var stars = new THREE.Points(starGeo, starMat);
    stars.frustumCulled = false;
    mesh.add(stars);

    /* ✅ v0.7.0 текстура облака — из файла города «МИРНЫЙ»
       (cloudCanvas 1:1: 16 пышных клубов + теневой слой снизу).
       Старая «пята» из 5 пятен заменена на пышные облака города */
    function cloudTexture() {
      var c = document.createElement('canvas');
      c.width = 256; c.height = 160;
      var g = c.getContext('2d');
      var rr2 = function (a, b) { return a + srng() * (b - a); };
      for (var i = 0; i < 16; i++) {
        var x = 50 + rr2(0, 156), y = 58 + rr2(0, 52), r = 22 + rr2(0, 30);
        var grd = g.createRadialGradient(x, y - r * .25, r * .1, x, y, r);
        grd.addColorStop(0, 'rgba(255,255,255,.95)');
        grd.addColorStop(.65, 'rgba(248,248,250,.55)');
        grd.addColorStop(1, 'rgba(240,240,245,0)');
        g.fillStyle = grd;
        g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
      for (var j = 0; j < 7; j++) {
        var x2 = 60 + rr2(0, 136), y2 = 104 + rr2(0, 20), r2 = 18 + rr2(0, 18);
        var g2s = g.createRadialGradient(x2, y2, 1, x2, y2, r2);
        g2s.addColorStop(0, 'rgba(190,198,212,.4)');
        g2s.addColorStop(1, 'rgba(190,198,212,0)');
        g.fillStyle = g2s;
        g.beginPath(); g.arc(x2, y2, r2, 0, 7); g.fill();
      }
      return new THREE.CanvasTexture(c);
    }
    var cloudTex = cloudTexture();

    /* ✅ v0.7.0 ПТИЦЫ из файла города «МИРНЫЙ»: 3 силуэта-галочки
       (birdCanvas 1:1), кружат высоко над игроком, машут крыльями
       (scale.y пульс). Обновляются в tick(camera) ниже */
    var birds = [];
    (function makeBirds() {
      var bc = document.createElement('canvas');
      bc.width = 64; bc.height = 32;
      var bg = bc.getContext('2d');
      bg.strokeStyle = 'rgba(25,22,20,.9)'; bg.lineWidth = 3.4; bg.lineCap = 'round';
      bg.beginPath(); bg.moveTo(6, 22); bg.quadraticCurveTo(20, 6, 32, 18);
      bg.quadraticCurveTo(44, 6, 58, 22); bg.stroke();
      var birdTex = new THREE.CanvasTexture(bc);
      for (var i = 0; i < 3; i++) {
        var s = new THREE.Sprite(new THREE.SpriteMaterial({
          map: birdTex, fog: true, transparent: true, opacity: .85
        }));
        s.scale.set(2.2, 1.1, 1);
        s.userData = {
          a: srng() * 7, rad: 60 + srng() * 50, h: 50 + srng() * 30,
          sp: .05 + srng() * .05, fl: srng() * 7
        };
        mesh.add(s);          /* птицы — дети небосвода (он ходит за камерой) */
        birds.push(s);
      }
    })();

    /* ✅ v0.4.52 дневные облака — И В ЯСНУЮ ПОГОДУ их теперь 20 (было
       12), заметнее и мягче; закат/рассвет красит их в золото,
       ночью они темнеют, в хмуро бледнеют и прячутся под тучи.
       ✅ ФИКС «ОБЛАКОВ НЕ ВИДНО»: плоскости повёрнуты нормалью ВВЕРХ,
       а игрок смотрит с земли СНИЗУ — FrontSide отсекал заднюю грань,
       и облака были НЕВИДИМЫ. Теперь side: DoubleSide — видны всегда */
    var clouds = new THREE.Group();
    var rng = N.makeRng(777 + seedOffW());   /* ✅ v0.5.23: облака по сиду */
    var cloudMat = new THREE.MeshBasicMaterial({
      color: 0xf7f5ef,
      alphaMap: cloudTex,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide
    });
    for (var i = 0; i < 20; i++) {
      var w = 90 + rng() * 150;
      var g2 = new THREE.PlaneGeometry(w, w * (0.5 + rng() * 0.3));
      var m = new THREE.Mesh(g2, cloudMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(
        (rng() - 0.5) * T.WORLD_SIZE * 1.6,
        165 + rng() * 80,
        (rng() - 0.5) * T.WORLD_SIZE * 1.6
      );
      clouds.add(m);
    }
    scene.add(clouds);

    /* ✅ ХМУРЫЕ ТУЧИ — большой нижний слой, затягивает небо и закрывает
       солнце; opacity ведёт погода (gloomyK), цвет — почти чёрный.
       ✅ v0.4.52: тоже DoubleSide (видны с земли, как и дневные) */
    var storm = new THREE.Group();
    var srng2 = N.makeRng(1313);
    var stormMat = new THREE.MeshBasicMaterial({
      color: 0x33383f,
      alphaMap: cloudTex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide
    });
    for (var j = 0; j < 11; j++) {
      var sw = 150 + srng2() * 160;
      var g3 = new THREE.PlaneGeometry(sw, sw * (0.55 + srng2() * 0.35));
      var m2 = new THREE.Mesh(g3, stormMat);
      m2.rotation.x = -Math.PI / 2;
      m2.position.set(
        (srng2() - 0.5) * T.WORLD_SIZE * 1.7,
        118 + srng2() * 45,
        (srng2() - 0.5) * T.WORLD_SIZE * 1.7
      );
      storm.add(m2);
    }
    scene.add(storm);

    /* переиспользуемые цвета — без аллокаций в кадре */
    var _day = new THREE.Color(0xf7f5ef), _dayGloom = new THREE.Color(0x8d939b);
    var _storm = new THREE.Color(0x33383f), _stormHi = new THREE.Color(0x565d66);
    var _nightCloud = new THREE.Color(0x333c4d);   /* ✅ v0.4.52: ночные облака */

    return {
      tick: function (camera) {
        mesh.position.copy(camera.position);
        var i2;
        for (i2 = 0; i2 < clouds.children.length; i2++) {
          var c1 = clouds.children[i2];
          c1.position.x += 0.02 * (1 + (i2 % 3) * 0.4);
          if (c1.position.x > T.WORLD_SIZE * 0.9) c1.position.x = -T.WORLD_SIZE * 0.9;
        }
        for (i2 = 0; i2 < storm.children.length; i2++) {
          var c2 = storm.children[i2];
          c2.position.x += 0.05 * (1 + (i2 % 4) * 0.3);   // тучи несут быстрее
          if (c2.position.x > T.WORLD_SIZE * 0.95) c2.position.x = -T.WORLD_SIZE * 0.95;
        }
        stars.rotation.y += 0.00016;   // звёздное небо медленно плывёт
        /* ✅ v0.7.0 птицы из файла города: кружат над игроком,
           машут крыльями (пульс scale.y) — как в «МИРНОМ» */
        var tB = performance.now() * 0.001;
        for (i2 = 0; i2 < birds.length; i2++) {
          var brd = birds[i2], u = brd.userData;
          u.a += u.sp * 0.016; u.fl += 0.016 * 9;
          brd.position.set(
            Math.cos(u.a) * u.rad,
            u.h + Math.sin(tB * 0.5 + u.rad) * 2,
            Math.sin(u.a) * u.rad
          );
          brd.scale.y = 1.1 * (0.55 + 0.45 * Math.abs(Math.sin(u.fl)));
        }
      },
      /* ✅ v0.4.51: сюда каждый кадр пишет BrixEnvironment */
      updateEnv: function (e) {
        mat.uniforms.topColor.value.copy(e.zen);
        mat.uniforms.horizonColor.value.copy(e.hor);
        mat.uniforms.sunColor.value.copy(e.sun);
        var az = e.sunAz, el = Math.max(-0.999, Math.min(0.999, e.sunEl));
        var ce = Math.sqrt(Math.max(0, 1 - el * el));
        mat.uniforms.sunDir.value.set(Math.cos(az) * ce, el, Math.sin(az) * ce).normalize();
        mat.uniforms.sunDim.value = 1 - 0.88 * e.cloudDark;
        mat.uniforms.glowK.value = e.glowK;
        /* луна — по ту сторону неба, поднимается, когда солнце садится */
        var mel = Math.min(0.85, Math.max(0.1, -e.sunEl * 0.75 + 0.14));
        var mce = Math.sqrt(Math.max(0, 1 - mel * mel));
        mat.uniforms.moonDir.value
          .set(Math.cos(az + Math.PI) * mce, mel, Math.sin(az + Math.PI) * mce).normalize();
        mat.uniforms.moonI.value = e.nightK;
        mat.uniforms.flashK.value = e.flashK || 0;      /* ✅ v0.4.52 */
        /* ✅ v0.5.13: радуга удалена */
        /* звёзды: ночь включает, тучи выключают */
        starMat.opacity = e.nightK * (1 - e.cloudDark * 0.92);
        /* ✅ v0.4.52 облака: в ясную — заметные (0.46), в хмуро бледнеют;
           закатное зарево красит их в золото, ночью темнеют */
        cloudMat.opacity = 0.46 - 0.30 * e.cloudDark;
        cloudMat.color.copy(_day).lerp(_dayGloom, e.cloudDark * 0.85);
        if (e.glowK > 0.01) cloudMat.color.lerp(e.hor, e.glowK * 0.5);
        if (e.nightK > 0.01) cloudMat.color.lerp(_nightCloud, e.nightK * 0.75);
        stormMat.opacity = 0.82 * e.cloudDark;
        stormMat.color.copy(_storm).lerp(_stormHi, 1 - e.cloudDark);
      },
      dispose: function () {
        scene.remove(mesh);
        scene.remove(clouds);
        scene.remove(storm);
        geo.dispose();
        mat.dispose();
        starGeo.dispose();
        starMat.dispose();
        cloudMat.dispose();
        stormMat.dispose();
        cloudTex.dispose();
        clouds.children.forEach(function (c) { c.geometry.dispose(); });
        storm.children.forEach(function (c) { c.geometry.dispose(); });
      }
    };
  }

  /* ---------------- Свет ---------------- */

  /* ✅ v0.4.51: солнце ХОДИТ ПО НЕБУ (азимут/высоту ведёт
     BrixEnvironment), источник света ночью — ЛУНА (мягкий синий),
     хмуро гасит и солнце, и полусферный свет */
  function createLights(scene, quality) {
    var hemi = new THREE.HemisphereLight(0x9ab8d0, 0x54503e, 1.15);
    scene.add(hemi);

    var sun = new THREE.DirectionalLight(0xffe2b4, 3.0);
    sun.position.set(-120, 170, -95);
    if (quality !== 'low') {
      sun.castShadow = true;
      var size = quality === 'high' ? 4096 : 2048;
      sun.shadow.mapSize.set(size, size);
      var sc = sun.shadow.camera;
      sc.left = -85; sc.right = 85; sc.top = 85; sc.bottom = -85;
      sc.near = 20; sc.far = 480;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.6;
    }
    scene.add(sun);
    scene.add(sun.target);

    var sunOffset = new THREE.Vector3(-120, 170, -95);
    var _sv = new THREE.Vector3(), _mv = new THREE.Vector3();

    return {
      sun: sun,
      sunOffset: sunOffset,
      tick: function (playerPos) {
        sun.position.copy(playerPos).add(sunOffset);
        sun.target.position.copy(playerPos);
        sun.target.updateMatrixWorld();
      },
      /* ✅ v0.4.51: каждый кадр из environment */
      updateEnv: function (e) {
        var az = e.sunAz, el = Math.max(-0.999, Math.min(0.999, e.sunEl));
        var ce = Math.sqrt(Math.max(0, 1 - el * el));
        _sv.set(Math.cos(az) * ce, el, Math.sin(az) * ce);
        /* луна встаёт, когда солнце ушло под горизонт */
        var mel = Math.min(0.85, Math.max(0.12, -e.sunEl * 0.75 + 0.14));
        var mce = Math.sqrt(Math.max(0, 1 - mel * mel));
        _mv.set(Math.cos(az + Math.PI) * mce, mel, Math.sin(az + Math.PI) * mce);
        _sv.lerp(_mv, e.nightK).normalize();
        sunOffset.copy(_sv).multiplyScalar(170);
        sun.color.copy(e.sunC);
        sun.intensity = Math.max(0.05, e.sunI * (1 - 0.8 * e.cloudDark));
        hemi.color.copy(e.hemiSky);
        hemi.groundColor.copy(e.hemiGnd);
        hemi.intensity = Math.max(0.08, e.hemiI * (1 - 0.35 * e.cloudDark));
      }
    };
  }

  /* ---------------- Вода ---------------- */

  function createWater(scene) {
    /* ✅ v0.5.25: вода ДО ГОРИЗОНТА (просьба владельца «пустое место —
       не фон, а вода»): было 2.6 размера мира — за краем виден фон.
       Теперь 9 размеров мира: во все стороны океан без «пустоты» */
    var geo = new THREE.PlaneGeometry(T.WORLD_SIZE * 9, T.WORLD_SIZE * 9);
    var mat = new THREE.MeshStandardMaterial({
      color: 0x3f6d66,
      transparent: true,
      opacity: 0.84,
      roughness: 0.3,
      metalness: 0.08
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = T.WATER_LEVEL;
    mesh.renderOrder = 1;
    scene.add(mesh);

    /* ✅ v0.4.51: вода живёт вместе со светом — тёмная ночью,
       закатная у горизонта, серая в хмуро (цвета переиспользуем) */
    var W_DAY = new THREE.Color(0x3f6d66), W_NIGHT = new THREE.Color(0x14262e),
      W_DUSK = new THREE.Color(0x5d5a63), W_GLOOM = new THREE.Color(0x46545a);
    var _wc = new THREE.Color();

    return {
      tick: function (t) {
        mat.opacity = 0.82 + Math.sin(t * 0.6) * 0.04;
      },
      updateEnv: function (e) {
        _wc.copy(W_DAY);
        _wc.lerp(W_NIGHT, e.nightK);
        _wc.lerp(W_DUSK, e.glowK * 0.6);
        _wc.lerp(W_GLOOM, e.gloomyK * 0.6);
        mat.color.copy(_wc);
      },
      dispose: function () {
        scene.remove(mesh);
        geo.dispose();
        mat.dispose();
      }
    };
  }

  /* ---------------- 3D-модели (GLB) ---------------- */

  // ✅ v0.2.10: деревья и жилы больше не имеют «здоровья в ударах» —
  // у них ЗАПАС РЕСУРСА (woodLeft / left), который снимают инструменты
  var TREE_MODEL_URL = 'assets/models/pine_tree.glb';
  var ORE_MODELS = {
    iron: 'assets/models/ore_iron.glb',      // silver ore = железо
    sulfur: 'assets/models/ore_sulfur.glb',  // gold ore = сера
    stone: 'assets/models/stone.glb'         // обычный камень (gold ore без золотых камней)
  };

  // ✅ v0.2.9 — коллайдеры и посадка руд
  var TRUNK_MAT_RE = /trank|trunk|wood|log|bark/i;  // материал ствола (у листвы — «Leavs»)
  var PLAYER_RADIUS = 0.35;        // «толщина» игрока для коллайдеров
  var ORE_SINK_K = 0.2;            // руда утапливается на 20% своей высоты
                                   // (у модели камень внизу сужается в один
                                   // тонкий шип — без посадки она «висит» в воздухе)
  var ORE_TOP_H = 2.0;             // высота жилы после подгонки scale, м
  // ✅ v0.2.10 — запас ресурсов (экономика по просьбе игрока):
  var TREE_WOOD_MIN = 56, TREE_WOOD_MAX = 80;  // древесины в одном дереве
  var ORE_TOTAL = { sulfur: 20, iron: 40, stone: 60 }; // запас одной жилы

  function loadModel(url) {
    /* ✅ v0.5.9: СБОРКА МИРА НЕ ВИСНЕТ — промис НИКОГДА не реджектится:
       glb.js на ошибку даёт заглушку-куб, а это страховка (пустая
       группа) на случай, когда даже THREE-заглушку собрать нечем.
       Раньше rejected-промис останавливал buildDecor навсегда —
       экран загрузки замирал на 53%/79% */
    return new Promise(function (ok) {
      var u = window.BrixAsset ? window.BrixAsset(url) : url;
      BrixGLB.load(u, function (group) { ok(group); },
        function () { ok(new THREE.Group()); });
    });
  }

  /**
   * Из загруженной GLB-модели достаём меши и сдвигаем их так,
   * чтобы ОСНОВАНИЕ модели (min.y) было в (0,0,0) по центру.
   * Возвращает { parts: [{geo, mat}], size } — size до сдвига.
   */
  function extractParts(group) {
    var box = new THREE.Box3().setFromObject(group);
    var c = box.getCenter(new THREE.Vector3());
    var size = box.getSize(new THREE.Vector3());
    var shift = new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z);
    var parts = [];
    group.traverse(function (o) {
      if (o.isMesh && o.geometry) {
        o.geometry.applyMatrix4(shift);
        o.geometry.computeBoundingSphere();
        parts.push({ geo: o.geometry, mat: o.material });
      }
    });
    return { parts: parts, size: size };
  }

  /* матрицы-помощники для анимации инстансов деревьев */
  var _mT = new THREE.Matrix4();
  var _mTn = new THREE.Matrix4();
  var _mR = new THREE.Matrix4();
  var _mOut = new THREE.Matrix4();
  var _mScale = new THREE.Matrix4();

  /**
   * Пересобрать матрицу дерева/руды: поворот вокруг основания (x,y,z).
   * M = T(B) · R · T(-B) · M0
   */
  function baseMatrix(rec, m0, angle, axis, hideScale) {
    _mT.makeTranslation(rec.x, rec.y, rec.z);
    _mTn.makeTranslation(-rec.x, -rec.y, -rec.z);
    if (axis === 'x') _mR.makeRotationX(angle);
    else _mR.makeRotationZ(angle);
    _mOut.multiplyMatrices(_mT, _mR).multiply(_mTn).multiply(m0);
    if (hideScale) {
      _mScale.makeScale(0.0001, 0.0001, 0.0001);
      _mOut.multiply(_mScale);
    }
    return _mOut;
  }

  /* ---------------- Растительность и руды ---------------- */

  async function buildDecor(scene, yieldProgress) {
    /* ✅ v0.5.23: ДЕРЕВЬЯ И РУДЫ — ПО СИДУ КАРТЫ (пользователь: «своя
       генерация»): у каждой вайп-карты лес и жилы стоят в СВОИХ местах.
       Сид 0 (BrixLand) → прежняя расстановка без изменений */
    var rng = N.makeRng(20261113 + seedOffW());
    var dummy = new THREE.Object3D();
    var i;
    var decorDisposables = [];

    /* ---- 0. 3D-модели: ёлка + 3 руды (GLB) ---- */
    var treeGlb = await loadModel(TREE_MODEL_URL);
    var treeModel = extractParts(treeGlb);
    await yieldProgress(0.08);
    await nextFrame();

    var oreGlb = {};
    var oreModel = {};
    var oreTypes = ['iron', 'sulfur', 'stone'];
    for (i = 0; i < oreTypes.length; i++) {
      var ot = oreTypes[i];
      oreGlb[ot] = await loadModel(ORE_MODELS[ot]);
      oreModel[ot] = extractParts(oreGlb[ot]);
      await yieldProgress(0.08 + (i + 1) * 0.06);
      await nextFrame();
    }
    await yieldProgress(0.28);

    var colliders = [];   // ✅ v0.2.9: цилиндры деревьев и рудных жил (и башни маяка)
    var decorBoxes = [];  // ✅ v0.4.24: AABB маяка (стены/ступени/выступы/площадка)

    /* ---- 0b. ✅ v0.4.24 ЛОКАЦИЯ «МАЯК» на Большом озере (61, 50) ----
       Модель + коллайдеры (лестница/выступы/палуба/стены) — BrixLighthouse.
       Не загрузился (нет файла / file://) — игра работает без него */
    if (window.BrixLighthouse) {
      try {
        var lh = await BrixLighthouse.build(scene, loadModel, yieldProgress);
        colliders.push.apply(colliders, lh.colliders);   // башня-цилиндр — в общий список
        decorBoxes = lh.boxes;                           // AABB — отдельным списком (ниже)
        console.log('[BrixWorld] маяк на озере построен: боксов ' + lh.boxes.length);
      } catch (eLh) {
        console.warn('[BrixWorld] маяк не загрузился (не критично):', eLh && eLh.message);
      }
    }
    await yieldProgress(0.3);
    await nextFrame();

    /* ---- 0c. ✅ v0.4.64 ПВП-АРЕНА «ПЕПЕЛ» (сервер BrixPvP) ----
       Не лес, а ЛОКАЦИЯ: детерминированный поиск ровной площадки у
       центра карты → там арена ~78 м без единого дерева, с кольцами
       валунов-укрытий (ниже, после руды). Точка запоминается в
       window.__brixArena — gameworld спавнит игроков в центре. */
    var arena = null;
    if (window.BRIX_PVP) {
      var bestSlope = 1e9, bestX = 0, bestZ = 0;
      for (var ai = 0; ai < 260; ai++) {
        var ax = (rng() - 0.5) * 320;
        var az = (rng() - 0.5) * 320;
        var ah = T.heightAt(ax, az);
        if (ah < 4 || ah > 30) continue;
        var asl = slopeAt(ax, az);
        /* ровность всей площадки: сама точка + 4 точки по кольцу 40 м */
        var worst = asl;
        for (var ak = 0; ak < 4; ak++) {
          var aa = ak * Math.PI / 2 + 0.4;
          worst = Math.max(worst,
            slopeAt(ax + Math.cos(aa) * 40, az + Math.sin(aa) * 40));
        }
        if (worst < bestSlope) { bestSlope = worst; bestX = ax; bestZ = az; }
      }
      arena = { x: Math.round(bestX), z: Math.round(bestZ), r: 78 };
      window.__brixArena = arena;
      console.log('[BrixWorld] арена «Пепел»: центр ' + arena.x + ' : ' + arena.z +
        ' (наклон ' + bestSlope.toFixed(2) + ')');
    }

    /* ---- 1. деревья: расстановка ---- */
    var trees = [];
    /* ✅ v0.5.24: попыток больше — архипелаг даёт ~26% суши (было ~45%):
       цель 340 деревьев достигается и на карте из островов */
    /* ✅ v0.5.25: мир 2000 м (было 900) — деревьев ~2.5x больше */
    var treeTries = window.BRIX_PVP ? 1600 : 15000;  // арена: «не лес»
    for (i = 0; i < treeTries && trees.length < (window.BRIX_PVP ? 150 : 850); i++) {
      var x = (rng() - 0.5) * T.WORLD_SIZE * 0.94;
      var z = (rng() - 0.5) * T.WORLD_SIZE * 0.94;
      /* ✅ v0.4.64: на ПВП-арене деревьев нет вообще */
      if (arena) {
        var dxa = x - arena.x, dza = z - arena.z;
        if (dxa * dxa + dza * dza < arena.r * arena.r) continue;
      }
      var h = T.heightAt(x, z);
      var forest = N.fbm(x * 0.008 + 50, z * 0.008 + 80, 909, 3);
      if (forest < 0.5) continue;
      if (h < 3.5 || h > 42 || slopeAt(x, z) > 0.45) continue;
      // ✅ v0.4.38: деревья не растут НА грунтовой дороге (коридор 3.4 м)
      if (window.BrixRoad && BrixRoad.near(x, z, 3.4)) continue;
      /* ✅ v0.6.0 АМБАРЫ: под плитой и в проходах деревьев нет */
      if (window.BrixBarn && BrixBarn.blocks(x, z)) continue;
      /* ✅ v0.7.0 ГОРОД: в стенах «МИРНОГО» деревья не растут */
      if (window.BrixCity && BrixCity.blocks(x, z)) continue;
      /* ✅ v0.5.22: в ПУСТЫНЕ ели не растут — там кактусы (ниже);
         в арктике ёлки остаются, но получают снежный оттенок (ниже) */
      if (T.climateAt && T.climateAt(x, z) === 'desert') continue;
      /* ✅ v0.5.24 ФИКС «ЛЕТАЮЩИЕ ДЕРЕВЬЯ»: h — ГЛАДКАЯ heightAt, а меш
         земли — сетка ~3.5 м с линейной интерполяцией; на буграх дерево
         по heightAt ВИСЕЛО над отрисованной землёй. Ставим по сетке
         рендера (meshHeightAt, как руда) и утапливаем ствол на 0.35 м */
      trees.push({
        x: x, z: z,
        y: (T.meshHeightAt ? T.meshHeightAt(x, z) : h) - 0.35,
        scale: 0.8 + rng() * 0.8,
        rot: rng() * Math.PI * 2
      });
      if (i % 400 === 399) {
        await yieldProgress(0.28 + (i / treeTries) * 0.22);
        await nextFrame();
      }
    }
    await yieldProgress(0.5);

    /* ---- 1b. деревья: инстансы мешей модели pine_tree.glb ---- */
    var treeScaleK = 5.5 / Math.max(treeModel.size.y, 0.01); // высота ≈ 5.5 м
    // ✅ v0.2.9: радиус СТВОЛА по геометрии стволовой части (для коллайдера);
    // у модели pine_tree.glb ствол — материал «Trank», листва — «Leavs»
    var trunkRadius = 0.18;
    treeModel.parts.forEach(function (part) {
      if (!TRUNK_MAT_RE.test((part.mat && part.mat.name) || '')) return;
      part.geo.computeBoundingBox();
      var b = part.geo.boundingBox;
      trunkRadius = Math.max(trunkRadius, Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2);
    });
    var treeMeshes = trees.map(function (p, idx) {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.rot, 0);
      dummy.scale.setScalar(p.scale * treeScaleK);
      dummy.updateMatrix();
      return dummy.matrix.clone();
    });
    var treeInst = treeModel.parts.map(function (part) {
      var im = new THREE.InstancedMesh(part.geo, part.mat, trees.length);
      treeMeshes.forEach(function (m, k) { im.setMatrixAt(k, m); });
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = true;
      im.receiveShadow = true;
      im.userData.isTree = true;
      // ✅ v0.2.9: этот InstancedMesh — СТВОЛ (рубить можно только его)
      im.userData.isTrunkPart = TRUNK_MAT_RE.test((part.mat && part.mat.name) || '');
      scene.add(im);
      return im;
    });
    await yieldProgress(0.56);
    await nextFrame();

    /* записи по каждому дереву — для рубки (тряска/падение) + КОЛЛАЙДЕРЫ */
    var treeRecords = trees.map(function (p, idx) {
      var rec = {
        i: idx,
        x: p.x, y: p.y, z: p.z, scale: p.scale,
        m0: treeMeshes[idx],
        // ✅ v0.2.10: в дереве 56–80 древесины; топор снимает свою норму
        // за удар (каменный 2, железный 4) — когда запас кончился, падает
        woodLeft: TREE_WOOD_MIN + Math.floor(rng() * (TREE_WOOD_MAX - TREE_WOOD_MIN + 1)),
        state: 'alive',          // alive | shake | falling | fallen | gone
        shakeT: 0, fallT: 0, hideT: 0,
        fallDir: 1,
        /* ✅ v0.5.22: климат дерева — арктические получают снежный оттенок */
        climate: T.climateAt ? T.climateAt(p.x, p.z) : null
      };
      // коллайдер ствола: радиус геометрии ствола × масштаб дерева + запас
      var c = {
        x: p.x, z: p.z,
        r: trunkRadius * p.scale * treeScaleK * 1.1 + 0.1,
        kind: 'tree', active: true
      };
      colliders.push(c);
      rec.collider = c;
      return rec;
    });

    /* ✅ v0.5.22 СНЕЖНЫЕ ЕЛИ АРКТИКИ: у листвы («Leavs») свои цвета
       вершин-инстансов — инстансы в арктике белеют (иней), у кромки —
       чуть желтее. Ствол не трогаем */
    treeInst.forEach(function (im) {
      if (im.userData.isTrunkPart || !im.setColorAt) return;
      var snowC = new THREE.Color(0xeef4fa);
      var dryC = new THREE.Color(0xd9d0a0);
      var any = false;
      treeRecords.forEach(function (rec, k) {
        if (rec.climate === 'arctic') { im.setColorAt(k, snowC); any = true; }
        else if (rec.climate === 'desert') { im.setColorAt(k, dryC); any = true; }
      });
      if (any && im.instanceColor) im.instanceColor.needsUpdate = true;
    });

    /* ---- 1c. ✅ v0.5.22 КАКТУСЫ ПУСТЫНИ (вайп-мир) ----
       Сагуаро (assets/models/cactus_saguaro.glb) растёт ТОЛЬКО в
       пустыне (T.climateAt = 'desert'): детерминированно по rng,
       как деревья. Коллайдеры — сквозь 3-метровый кактус не пройти.
       Модель тяжёлая (HD) — ставим умеренно, инстансами по частям */
    var cactiRecords = [];
    if (!window.BRIX_PVP && window.BRIX_BIOMES) {
      var cactusGlb = await loadModel('assets/models/cactus_saguaro.glb');
      var cactusModel = extractParts(cactusGlb);
      var cactusK = 2.6 / Math.max(cactusModel.size.y, 0.01);  // высота ≈ 2.6–3.6 м
      var cactusRecs = [];
      /* ✅ v0.5.22a: 4000 попыток и мягче фильтры — зона пустыни может
         быть небольшой, кактусы должны заполнить её весь */
      /* ✅ v0.5.25: мир больше — кактусов вдвое больше */
      for (var ci = 0; ci < 8000 && cactusRecs.length < 60; ci++) {
        var cx2 = (rng() - 0.5) * T.WORLD_SIZE * 0.9;
        var cz2 = (rng() - 0.5) * T.WORLD_SIZE * 0.9;
        if (!T.climateAt || T.climateAt(cx2, cz2) !== 'desert') continue;
        var ch2 = T.heightAt(cx2, cz2);
        if (ch2 < 2.6 || ch2 > 40 || slopeAt(cx2, cz2) > 0.42) continue;
        if (window.BrixRoad && BrixRoad.near(cx2, cz2, 3.0)) continue;
        /* ✅ v0.6.0 АМБАРЫ: кактусы не растут под плитой */
        if (window.BrixBarn && BrixBarn.blocks(cx2, cz2)) continue;
        /* ✅ v0.7.0 ГОРОД: кактусы не растут в стенах «МИРНОГО» */
        if (window.BrixCity && BrixCity.blocks(cx2, cz2)) continue;
        cactusRecs.push({
          x: cx2, y: T.meshHeightAt ? T.meshHeightAt(cx2, cz2) : ch2, z: cz2,
          scale: 0.85 + rng() * 0.55,
          rot: rng() * Math.PI * 2
        });
      }
      var cactusInsts = cactusModel.parts.map(function (part) {
        var im = new THREE.InstancedMesh(part.geo, part.mat, cactusRecs.length);
        cactusRecs.forEach(function (r, k) {
          dummy.position.set(r.x, r.y, r.z);
          dummy.rotation.set(0, r.rot, 0);
          dummy.scale.setScalar(r.scale * cactusK);
          dummy.updateMatrix();
          im.setMatrixAt(k, dummy.matrix);
        });
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = true;
        im.receiveShadow = true;
        scene.add(im);
        decorDisposables.push(im);
        return im;
      });
      cactusRecs.forEach(function (r, k) {
        var cc = {
          x: r.x, z: r.z,
          r: 0.45 * r.scale * cactusK + 0.08,
          kind: 'cactus', active: true
        };
        colliders.push(cc);
        cactiRecords.push({ i: k, x: r.x, y: r.y, z: r.z, collider: cc, meshes: cactusInsts });
      });
      /* отладочный доступ (автотесты): координаты кактусов */
      window.__brixCacti = cactusRecs;
      if (cactusRecs.length) {
        console.log('[BrixWorld] пустыня: кактусов ' + cactusRecs.length);
      }
      await yieldProgress(0.545);
      await nextFrame();
    }

    /* ---- 1c-bis. ✅ v0.7.0 КУСТЫ ПУСТЫНИ (перенос из файла города
       «МИРНЫЙ», bushCanvas 1:1): сухие ветвистые кусты растут ПО ВСЕЙ
       ПУСТЫНЕ (climateAt === 'desert'), кактусов мало — кусты заполняют
       биом. Без коллайдеров (куст можно раздвинуть, как в городе) ---- */
    if (!window.BRIX_PVP && window.BRIX_BIOMES) {
      var dBushCv = document.createElement('canvas');
      dBushCv.width = 160; dBushCv.height = 160;
      (function (ctx) {
        var brng = N.makeRng(90210);
        var brr = function (a, b) { return a + brng() * (b - a); };
        var bri = function (a, b) { return Math.floor(brr(a, b + 1)); };
        var branch = function (x, y, ang, len, depth) {
          if (depth <= 0 || len < 4) return;
          var nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
          ctx.strokeStyle = 'rgba(' + bri(120, 150) + ',' + bri(105, 128) + ',' + bri(75, 95) + ',.95)';
          ctx.lineWidth = depth * .8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
          if (depth <= 2) {
            ctx.fillStyle = 'rgba(' + bri(140, 170) + ',' + bri(140, 160) + ',' + bri(80, 105) + ',.8)';
            ctx.beginPath(); ctx.ellipse(nx, ny, brr(2, 4.5), brr(1.4, 3), ang, 0, 7); ctx.fill();
          }
          branch(nx, ny, ang + brr(.2, .7), len * brr(.6, .8), depth - 1);
          branch(nx, ny, ang - brr(.2, .7), len * brr(.6, .8), depth - 1);
        };
        for (var i = 0; i < 7; i++) branch(80 + brr(-14, 14), 158, -Math.PI / 2 + brr(-.5, .5), brr(26, 44), 5);
      })(dBushCv.getContext('2d'));
      var dBushTex = new THREE.CanvasTexture(dBushCv);
      var dBushMat = new THREE.MeshStandardMaterial({
        map: dBushTex, alphaTest: .35, side: THREE.DoubleSide, roughness: 1, vertexColors: true
      });
      var dBushGeos = [], dBushCols = [];
      var dCol = new THREE.Color();
      var dPlaced = 0;
      for (var dbi = 0; dbi < 22000 && dPlaced < 240; dbi++) {
        var dbx = (rng() - 0.5) * T.WORLD_SIZE * 0.9;
        var dbz = (rng() - 0.5) * T.WORLD_SIZE * 0.9;
        if (!T.climateAt || T.climateAt(dbx, dbz) !== 'desert') continue;
        var dbh = T.heightAt(dbx, dbz);
        if (dbh < 2.6 || dbh > 40 || slopeAt(dbx, dbz) > 0.5) continue;
        if (window.BrixRoad && BrixRoad.near(dbx, dbz, 3.0)) continue;
        if (window.BrixBarn && BrixBarn.blocks(dbx, dbz)) continue;
        if (window.BrixCity && BrixCity.blocks(dbx, dbz, 2)) continue;
        var sc1 = 0.7 + rng() * 1.1;
        var pg1 = new THREE.PlaneGeometry(1.5 * sc1, 1.4 * sc1);
        dummy.position.set(dbx, (T.meshHeightAt ? T.meshHeightAt(dbx, dbz) : dbh) + 0.7 * sc1, dbz);
        dummy.rotation.set(0, rng() * Math.PI * 2, 0);
        dummy.scale.setScalar(1); dummy.updateMatrix();
        pg1.applyMatrix4(dummy.matrix);
        var pg2 = new THREE.PlaneGeometry(1.5 * sc1, 1.4 * sc1);
        dummy.rotation.set(0, rng() * Math.PI * 2, 0); dummy.updateMatrix();
        pg2.applyMatrix4(dummy.matrix);
        dCol.setHSL(.1, 0.2 + rng() * 0.15, 0.35 + rng() * 0.15);
        [pg1, pg2].forEach(function (pgg) {
          var cnt = pgg.attributes.position.count, arr = new Float32Array(cnt * 3);
          for (var vi = 0; vi < cnt; vi++) {
            arr[vi * 3] = dCol.r; arr[vi * 3 + 1] = dCol.g; arr[vi * 3 + 2] = dCol.b;
          }
          pgg.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        });
        dBushGeos.push(pg1); dBushGeos.push(pg2);
        dPlaced++;
      }
      if (dBushGeos.length) {
        /* слияние с вершинными цветами (кактусы рядом не сливаются) */
        var vcount2 = 0, icount2 = 0;
        for (var dg = 0; dg < dBushGeos.length; dg++) {
          vcount2 += dBushGeos[dg].attributes.position.count;
          icount2 += dBushGeos[dg].index.count;
        }
        var dPos = new Float32Array(vcount2 * 3), dNor = new Float32Array(vcount2 * 3);
        var dUv = new Float32Array(vcount2 * 2), dColArr = new Float32Array(vcount2 * 3);
        var dIdx = vcount2 > 65535 ? new Uint32Array(icount2) : new Uint16Array(icount2);
        var dvo = 0, dio = 0;
        for (var dg2 = 0; dg2 < dBushGeos.length; dg2++) {
          var dgg = dBushGeos[dg2];
          dPos.set(dgg.attributes.position.array, dvo * 3);
          dNor.set(dgg.attributes.normal.array, dvo * 3);
          dUv.set(dgg.attributes.uv.array, dvo * 2);
          dColArr.set(dgg.attributes.color.array, dvo * 3);
          var dgidx = dgg.index.array;
          for (var dk = 0; dk < dgidx.length; dk++) dIdx[dio + dk] = dgidx[dk] + dvo;
          dio += dgidx.length; dvo += dgg.attributes.position.count;
          dgg.dispose();
        }
        var dBushGeo = new THREE.BufferGeometry();
        dBushGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
        dBushGeo.setAttribute('normal', new THREE.BufferAttribute(dNor, 3));
        dBushGeo.setAttribute('uv', new THREE.BufferAttribute(dUv, 2));
        dBushGeo.setAttribute('color', new THREE.BufferAttribute(dColArr, 3));
        dBushGeo.setIndex(new THREE.BufferAttribute(dIdx, 1));
        var dBushMesh = new THREE.Mesh(dBushGeo, dBushMat);
        dBushMesh.receiveShadow = true;
        scene.add(dBushMesh);
        decorDisposables.push(dBushMesh);
        window.__brixDesertBushes = dPlaced;
        console.log('[BrixWorld] пустыня: кустов ' + dPlaced);
      }
      await yieldProgress(0.552);
      await nextFrame();
    }

    /* ---- 2. ✅ РУДНЫЕ ЖИЛЫ (киркой): камень / железо / сера ---- */
    // v0.2.5: кусты и декоративные камни убраны — остались только
    // ЛОМАЕМЫЕ жилы. Размещение как у камней: больше в горах и на склонах;
    // железо — среднегорье, сера — высокие горы, камень — везде.
    var oreCfg = [
      /* ✅ v0.5.24: попыток больше — суша архипелага ~26%, цель по
         числу руд должна достигаться и на островах */
      /* ✅ v0.5.25: мир 2000 м — руды ~2.5x больше, иначе пусто */
      { type: 'stone',  count: 270, tries: 10000, hMin: 2.6,  hMax: 46, slope: 0.55, base: 0.62 },
      { type: 'iron',   count: 150, tries: 9000, hMin: 10,   hMax: 46, slope: 0.30, base: 0.74 },
      { type: 'sulfur', count: 150, tries: 9000, hMin: 16,   hMax: 48, slope: 0.30, base: 0.86 }
    ];
    var oreNodes = {};    // type → records[]
    var oreTargets = [];  // [{mesh, type}] для raycast в gameworld

    for (var oc = 0; oc < oreCfg.length; oc++) {
      var cfg = oreCfg[oc];
      var model = oreModel[cfg.type];
      var kScale = 2.0 / Math.max(model.size.y, 0.01);   // высота жилы ≈ 2 м
      // ✅ v0.2.9: радиус камня по геометрии модели (для коллайдера)
      var oreRadius = 0.5;
      model.parts.forEach(function (part) {
        part.geo.computeBoundingBox();
        var b = part.geo.boundingBox;
        oreRadius = Math.max(oreRadius, Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2);
      });
      var recs = [];
      for (i = 0; i < cfg.tries && recs.length < cfg.count; i++) {
        var ox = (rng() - 0.5) * T.WORLD_SIZE * 0.92;
        var oz = (rng() - 0.5) * T.WORLD_SIZE * 0.92;
        var oh = T.heightAt(ox, oz);
        var sl = slopeAt(ox, oz);
        if (oh < cfg.hMin || oh > cfg.hMax) continue;
        if (sl > cfg.slope) continue;
        /* ✅ v0.6.0 АМБАРЫ: руда не торчит из плиты и стен */
        if (window.BrixBarn && BrixBarn.blocks(ox, oz, 2)) continue;
        /* ✅ v0.7.0 ГОРОД: руды в стенах «МИРНОГО» нет */
        if (window.BrixCity && BrixCity.blocks(ox, oz, 2)) continue;
        // в горах чаще, на равнине реже
        if (sl < 0.18 && rng() > 0.35) continue;
        // ✅ v0.2.9: ОПУСКАЕМ РУДУ ВНИЗ.
        // 1) ставим по высоте отрисованной сетки террейна (meshHeightAt):
        //    heightAt — гладкая функция, а меш — сетка ~3.5 м, на буграх
        //    объект по heightAt висит над землёй;
        // 2) утапливаем на ~20% высоты жилы: у модели камень внизу сужается
        //    в один тонкий шип, видимая масса заметно выше — без посадки
        //    «камень/железо/сера летают над землёй».
        var oScale = 0.55 + rng() * 0.65;
        var sink = ORE_SINK_K * ORE_TOP_H * oScale;
        recs.push({
          i: recs.length,
          x: ox, y: (T.meshHeightAt ? T.meshHeightAt(ox, oz) : oh) - sink, z: oz,
          scale: oScale,
          rot: rng() * Math.PI * 2,
          type: cfg.type,
          // ✅ v0.2.10: запас жилы — сера 20, железо 40, камень 60;
          // кирка снимает свою норму за удар (каменная 2, железная 4)
          left: ORE_TOTAL[cfg.type],
          state: 'alive',
          shakeT: 0,
          m0: null
        });
      }
      var mats = [];
      recs.forEach(function (rec) {
        dummy.position.set(rec.x, rec.y, rec.z);
        dummy.rotation.set(0, rec.rot, 0);
        dummy.scale.setScalar(rec.scale * kScale);
        dummy.updateMatrix();
        rec.m0 = dummy.matrix.clone();
        mats.push(rec.m0);
      });
      // ✅ v0.2.9: коллайдер каждой жилы (камень нельзя пройти насквозь);
      // bbox радиус щедрый — сжимаем до 0.75 и добавляем запас в controls
      recs.forEach(function (rec) {
        var c = {
          x: rec.x, z: rec.z,
          r: oreRadius * kScale * rec.scale * 0.75 + 0.05,
          kind: 'ore', active: true
        };
        colliders.push(c);
        rec.collider = c;
      });
      var insts = model.parts.map(function (part) {
        var im = new THREE.InstancedMesh(part.geo, part.mat, recs.length);
        mats.forEach(function (m, k) { im.setMatrixAt(k, m); });
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = true;
        im.receiveShadow = true;
        im.userData.oreType = cfg.type;
        im.userData.records = recs;
        scene.add(im);
        oreTargets.push({ mesh: im, type: cfg.type });
        return im;
      });
      recs.meshes = insts;
      oreNodes[cfg.type] = recs;
      await yieldProgress(cfg.base);
      await nextFrame();
    }
    await yieldProgress(0.86);
    await nextFrame();

    /* ---- 2b. ✅ v0.4.64 УКРЫТИЯ АРЕНЫ «ПЕПЕЛ» ----
       Кольца валунов + «стены» из камней на площадке арены: декоративные
       инстансы модели камня (не руда — не ломается, но с коллайдерами).
       Детерминированно по rng — у всех игроков одинаково. */
    if (arena) {
      var rockModel = oreModel.stone;
      var rockK = 2.0 / Math.max(rockModel.size.y, 0.01);
      var rockPts = [];
      // два кольца укрытий + 4 «стены» поперёк арены
      for (var ri = 0; ri < 2; ri++) {
        var rr = 16 + ri * 24;
        var rn = 7 + ri * 5;
        for (var rj = 0; rj < rn; rj++) {
          var ra = (rj / rn) * Math.PI * 2 + ri * 0.35;
          var rx = arena.x + Math.cos(ra) * (rr + (rng() - 0.5) * 4);
          var rz = arena.z + Math.sin(ra) * (rr + (rng() - 0.5) * 4);
          if (slopeAt(rx, rz) > 0.5) continue;
          rockPts.push({ x: rx, z: rz, s: 0.8 + rng() * 1.1, rot: rng() * Math.PI * 2 });
        }
      }
      for (var wi = 0; wi < 4; wi++) {
        var wa = wi * Math.PI / 2 + 0.35;
        var wdx = Math.cos(wa), wdz = Math.sin(wa);
        for (var wj = 0; wj < 6; wj++) {
          var wx = arena.x + wdx * (6 + wj * 2.2) - wdz * (5 + rng() * 1.5);
          var wz = arena.z + wdz * (6 + wj * 2.2) + wdx * (5 + rng() * 1.5);
          if (slopeAt(wx, wz) > 0.5) continue;
          rockPts.push({ x: wx, z: wz, s: 0.65 + rng() * 0.7, rot: wa + rng() * 0.4 });
        }
      }
      rockPts.forEach(function (rp) {
        rockModel.parts.forEach(function (part) {
          var m = new THREE.InstancedMesh(part.geo, part.mat, 1);
          dummy.position.set(rp.x,
            (T.meshHeightAt ? T.meshHeightAt(rp.x, rp.z) : T.heightAt(rp.x, rp.z)) -
              ORE_SINK_K * ORE_TOP_H * rp.s * 0.9, rp.z);
          dummy.rotation.set(0, rp.rot, 0);
          dummy.scale.setScalar(rp.s * rockK);
          dummy.updateMatrix();
          m.setMatrixAt(0, dummy.matrix);
          m.castShadow = true;
          m.receiveShadow = true;
          scene.add(m);
          decorDisposables.push(m);
        });
        // коллайдер валуна (цилиндр) — пули/игроки не проходят
        colliders.push({
          x: rp.x, z: rp.z,
          r: 0.9 * rp.s * rockK,
          kind: 'rock', active: true
        });
      });
      console.log('[BrixWorld] укрытий арены: ' + rockPts.length);
    }

    /* ---- 3. ✅ ТРАВА (v0.2.8): иконка grass.png → билборды по миру ----
       Текстуру делаем из иконки пользователя (assets/textures/grass.png),
       каждый кустик = 2 скрещенные плоскости, инстансы, качание ветром. */
    var GRASS_COUNT = 7000;   /* ✅ v0.5.25: мир больше — травы больше */
    var grassTime = { value: 0 };
    var grassMesh = null;
    try {
      /* ✅ v0.5.9: текстура травы с retry (3 попытки / 2 c / 10 c) —
         через туннель grass.png мог прийти 504, и трава пропадала
         без единого повтора. Заглушка не нужна: блок в try/catch,
         без текстуры мир просто строится без травы */
      var grassUrl = window.BrixAsset ? window.BrixAsset('assets/textures/grass.png') : 'assets/textures/grass.png';
      var grassIm = window.BrixFetch
        ? await BrixFetch.image(grassUrl)
        : await new Promise(function (ok, no) {
            var loader = new THREE.TextureLoader();
            loader.load(grassUrl, ok, undefined, no);
          });
      if (!grassIm) throw new Error('grass.png не загрузился после 3 попыток');
      var grassTex = new THREE.Texture(grassIm);
      grassTex.needsUpdate = true;
      if (THREE.SRGBColorSpace) grassTex.colorSpace = THREE.SRGBColorSpace;
      grassTex.anisotropy = 4;

      // геометрия: два скрещённых quad'а 1×1, основание в y=0
      var gGeo = new THREE.BufferGeometry();
      var gp = new Float32Array([
        -0.5, 0, 0,   0.5, 0, 0,   0.5, 1, 0,  -0.5, 1, 0,   // quad вдоль X
        0, 0, -0.5,  0, 0, 0.5,   0, 1, 0.5,   0, 1, -0.5    // quad вдоль Z
      ]);
      var guv = new Float32Array([
        0, 0,  1, 0,  1, 1,  0, 1,
        0, 0,  1, 0,  1, 1,  0, 1
      ]);
      // нормали вверх — трава освещается как земля, без тёмных сторон
      var gn = new Float32Array(24);
      for (var gni = 0; gni < 8; gni++) { gn[gni * 3 + 1] = 1; }
      gGeo.setAttribute('position', new THREE.BufferAttribute(gp, 3));
      gGeo.setAttribute('uv', new THREE.BufferAttribute(guv, 2));
      gGeo.setAttribute('normal', new THREE.BufferAttribute(gn, 3));
      gGeo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);

      var grassMat = new THREE.MeshLambertMaterial({
        map: grassTex,
        alphaTest: 0.42,
        side: THREE.DoubleSide
      });
      // ✅ качание ветром: подмешиваем в вершинный шейдер uTime
      grassMat.onBeforeCompile = function (shader) {
        shader.uniforms.uTime = grassTime;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uTime;')
          .replace('#include <begin_vertex>', [
            '#include <begin_vertex>',
            '#ifdef USE_INSTANCING',
            '  vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);',
            '#else',
            '  vec3 iPos = vec3(0.0);',
            '#endif',
            '  float gBend = position.y * position.y;',
            '  float gSw = sin(uTime * 1.4 + iPos.x * 0.53 + iPos.z * 0.37) * 0.6 +',
            '              sin(uTime * 2.9 + iPos.x * 1.17 + iPos.z * 0.7) * 0.4;',
            '  transformed.x += gSw * 0.085 * gBend;',
            '  transformed.z += cos(uTime * 1.13 + iPos.x * 0.4 + iPos.z * 0.61) * 0.05 * gBend;'
          ].join('\n'));
      };

      // расстановка: пологие низины и луга, кустами (шум плотности)
      var grassList = [];
      var gTries = 40000;   /* ✅ v0.5.25: под новый GRASS_COUNT 7000 */
      for (i = 0; i < gTries && grassList.length < GRASS_COUNT; i++) {
        var gx = (rng() - 0.5) * T.WORLD_SIZE * 0.93;
        var gz = (rng() - 0.5) * T.WORLD_SIZE * 0.93;
        var gh = T.heightAt(gx, gz);
        if (gh < T.WATER_LEVEL + 1.0 || gh > 30) continue;   // без пляжа и гор
        if (slopeAt(gx, gz) > 0.38) continue;
        // ✅ v0.4.38: кустики травы не лезут на грунтовую дорогу (2.8 м)
        if (window.BrixRoad && BrixRoad.near(gx, gz, 2.8)) continue;
        /* ✅ v0.6.0 АМБАРЫ: трава не прорастает сквозь бетонную плиту */
        if (window.BrixBarn && BrixBarn.blocks(gx, gz, 1)) continue;
        /* ✅ v0.7.0 ГОРОД: трава не прорастает сквозь асфальт «МИРНОГО» */
        if (window.BrixCity && BrixCity.blocks(gx, gz, 1)) continue;
        var patch = N.fbm(gx * 0.02 + 31, gz * 0.02 + 117, 6199, 3);
        if (patch < 0.42) continue;                          // куртины, а не равномерный ковёр
        grassList.push({
          x: gx, y: gh - 0.03, z: gz,
          s: 0.75 + rng() * 0.75,
          r: rng() * Math.PI * 2,
          v: 0.86 + rng() * 0.28                            // вариация яркости
        });
        if (i % 5000 === 4999) {
          await yieldProgress(0.86 + 0.06 * (grassList.length / GRASS_COUNT));
          await nextFrame();
        }
      }
      grassMesh = new THREE.InstancedMesh(gGeo, grassMat, grassList.length);
      var gCol = new THREE.Color();
      var dry = new THREE.Color(0x8a8749);   // сухая трава Brixland
      var juicy = new THREE.Color(0xffffff);
      for (i = 0; i < grassList.length; i++) {
        var gg2 = grassList[i];
        dummy.position.set(gg2.x, gg2.y, gg2.z);
        dummy.rotation.set(0, gg2.r, 0);
        dummy.scale.set(gg2.s, gg2.s * (0.85 + (gg2.v - 0.86) * 0.6), gg2.s);
        dummy.updateMatrix();
        grassMesh.setMatrixAt(i, dummy.matrix);
        gCol.copy(juicy).lerp(dry, (1 - gg2.v) * 0.55);
        grassMesh.setColorAt(i, gCol);
      }
      grassMesh.instanceMatrix.needsUpdate = true;
      if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
      grassMesh.castShadow = false;
      grassMesh.receiveShadow = true;
      grassMesh.userData.isGrass = true;
      scene.add(grassMesh);
      console.log('[BrixWorld] трава: ' + grassList.length + ' кустиков расставлено');
    } catch (e2) {
      console.warn('[BrixWorld] трава не построилась (не критично):', e2);
    }
    await yieldProgress(1);
    await nextFrame();

    /* ---- 5. ✅ v0.5.21 ТЫКВЕННЫЕ ЛОЗЫ: детерминированное размещение
       (формула 1:1 с сервером — см. js/game/vines.js), модели
       pumpkin_vine.glb + pumpkin.glb. Рост/сбор тикает СЕРВЕР
       (brix-vines.js), синхронизация и сохранение как у аирдропов ---- */
    try {
      if (window.BrixVines) BrixVines.build(scene);
    } catch (eVin) {
      console.warn('[BrixWorld] лозы не построились (не критично):', eVin);
    }

    /* анимация: тряска/падение деревьев + тряска/исчезновение руды */
    var decorRef = {
      treeMeshes: treeInst,
      // ✅ v0.2.9: только стволовые меши (рубка) и все меши (луч гаснет о листву)
      trunkMeshes: treeInst.filter(function (im) { return im.userData.isTrunkPart; }),
      trunks: treeInst[treeInst.length - 1],   // совместимость со старым API
      foliage: treeInst[0],
      trees: treeRecords,
      oreTargets: oreTargets,
      ores: oreNodes,
      colliders: colliders,                    // ✅ v0.2.9: для физики игрока
      lighthouseBoxes: decorBoxes,             // ✅ v0.4.24: AABB маяка (стены/ступени/выступы)
      tick: function (delta) {
        // ветер в траве (uTime в шейдере)
        grassTime.value += delta;
        var dirty = false;
        for (var k = 0; k < treeRecords.length; k++) {
          var rec = treeRecords[k];
          if (rec.state === 'shake') {
            rec.shakeT -= delta;
            var a = Math.sin(rec.shakeT * 50) * 0.03 * Math.max(0, rec.shakeT);
            var m = baseMatrix(rec, rec.m0, a, 'x');
            setTreeMatrix(rec.i, m);
            dirty = true;
            if (rec.shakeT <= 0) rec.state = 'alive';
          } else if (rec.state === 'falling') {
            // ✅ v0.2.9: дерево падает — ствол уходит с точки, коллайдер off
            if (rec.collider) rec.collider.active = false;
            rec.fallT += delta;
            var t = Math.min(rec.fallT / 1.8, 1);
            var az = t * t * (Math.PI / 2) * 0.94 * rec.fallDir;
            setTreeMatrix(rec.i, baseMatrix(rec, rec.m0, az, 'z'));
            dirty = true;
            if (t >= 1) rec.state = 'fallen';
          } else if (rec.state === 'fallen') {
            rec.hideT += delta;
            if (rec.hideT > 2.5) {
              setTreeMatrix(rec.i, baseMatrix(rec, rec.m0, Math.PI / 2 * 0.94 * rec.fallDir, 'z', true));
              dirty = true;
              rec.state = 'gone';
            }
          }
        }
        if (dirty) treeInst.forEach(function (im) { im.instanceMatrix.needsUpdate = true; });

        // руда: тряска после удара (меши жилы — oreNodes[type].meshes)
        var oreDirty = false;
        oreTypes.forEach(function (type) {
          var insts = oreNodes[type].meshes || [];
          oreNodes[type].forEach(function (rec2) {
            if (rec2.state === 'shake') {
              rec2.shakeT -= delta;
              var a2 = Math.sin(rec2.shakeT * 50) * 0.04 * Math.max(0, rec2.shakeT);
              var m2 = baseMatrix(rec2, rec2.m0, a2, 'x');
              insts.forEach(function (im) { im.setMatrixAt(rec2.i, m2); });
              oreDirty = true;
              if (rec2.shakeT <= 0) {
                rec2.state = 'alive';
                insts.forEach(function (im) { im.setMatrixAt(rec2.i, rec2.m0); });
              }
            }
          });
        });
        if (oreDirty) {
          oreTypes.forEach(function (type) {
            oreNodes[type].meshes.forEach(function (im) { im.instanceMatrix.needsUpdate = true; });
          });
        }
      },
      /** жила выработана: спрятать все меши записи (scale → 0) */
      hideOre: function (rec) {
        rec.state = 'gone';
        // ✅ v0.2.9: жила рассыпалась — коллайдер больше не нужен
        if (rec.collider) rec.collider.active = false;
        var m = baseMatrix(rec, rec.m0, 0, 'x', true);
        var insts = oreNodes[rec.type].meshes || [];
        insts.forEach(function (im) { im.setMatrixAt(rec.i, m); });
        insts.forEach(function (im) { im.instanceMatrix.needsUpdate = true; });
      },
      dispose: function () {
        treeInst.forEach(function (im) { scene.remove(im); });
        oreTypes.forEach(function (type) {
          (oreNodes[type].meshes || []).forEach(function (im) { scene.remove(im); });
        });
        if (grassMesh) {
          scene.remove(grassMesh);
          grassMesh.geometry.dispose();
          grassMesh.material.map && grassMesh.material.map.dispose();
          grassMesh.material.dispose();
        }
        treeModel.parts.forEach(function (p) { p.geo.dispose(); });
        oreTypes.forEach(function (type) {
          oreModel[type].parts.forEach(function (p) { p.geo.dispose(); });
        });
      }
    };

    /** поставить матрицу дерева сразу во все меши модели */
    function setTreeMatrix(idx, m) {
      treeInst.forEach(function (im) { im.setMatrixAt(idx, m); });
    }

    decorDisposables.push(decorRef);

    return decorRef;
  }

  /* ---------------- Лагерь на спавне ---------------- */

  function buildSpawnCamp(scene, spawn) {
    var group = new THREE.Group();
    var disposables = [];
    var rng = N.makeRng(4242 + seedOffW());   /* ✅ v0.5.23: лагерь по сиду */

    // лагерь ставим в 6 м в сторону от точки спавна, чтобы не мешал обзору
    var dirAngle = rng() * Math.PI * 2;
    var campCX = spawn.x + Math.cos(dirAngle) * 6;
    var campCZ = spawn.z + Math.sin(dirAngle) * 6;

    var crateColors = [0x5a4632, 0x4b3d2d, 0x514234];
    for (var i = 0; i < 4; i++) {
      var s = 0.7 + rng() * 0.5;
      var geo = new THREE.BoxGeometry(s, s, s);
      var mat = new THREE.MeshStandardMaterial({
        color: crateColors[i % crateColors.length],
        roughness: 0.92
      });
      var m = new THREE.Mesh(geo, mat);
      var a = (i / 4) * Math.PI * 2 + rng();
      var d = 2.5 + rng() * 2;
      var cax = campCX + Math.cos(a) * d, caz = campCZ + Math.sin(a) * d;
      m.position.set(
        cax,
        /* ✅ v0.5.24: по сетке рендера (как руда/деревья) — не летают */
        (T.meshHeightAt ? T.meshHeightAt(cax, caz) : T.heightAt(cax, caz)) + s / 2 - 0.08,
        caz
      );
      m.rotation.y = rng() * Math.PI;
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      disposables.push(geo, mat);
    }

    // костровая бочка
    var barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.0, 10);
    var barrelMat = new THREE.MeshStandardMaterial({ color: 0x3a2f24, roughness: 0.9 });
    var barrel = new THREE.Mesh(barrelGeo, barrelMat);
    var bx = campCX + 3.2;
    var bz = campCZ - 1.4;
    barrel.position.set(bx, T.heightAt(bx, bz) + 0.5, bz);
    barrel.castShadow = true;
    group.add(barrel);
    disposables.push(barrelGeo, barrelMat);

    var flameGeo = new THREE.SphereGeometry(0.28, 8, 8);
    var flameMat = new THREE.MeshBasicMaterial({ color: 0xe08030 });
    var flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(bx, T.heightAt(bx, bz) + 1.1, bz);
    flame.scale.y = 1.4;
    group.add(flame);
    disposables.push(flameGeo, flameMat);

    var fire = new THREE.PointLight(0xd8792a, 1.6, 13, 2);
    fire.position.set(bx, T.heightAt(bx, bz) + 1.5, bz);
    group.add(fire);

    scene.add(group);

    return {
      tick: function (t) {
        fire.intensity = 1.4 + Math.sin(t * 9) * 0.3 + Math.sin(t * 23) * 0.2;
        flame.scale.y = 1.3 + Math.sin(t * 11) * 0.25;
        flame.scale.x = 1 + Math.sin(t * 17) * 0.15;
      },
      dispose: function () {
        scene.remove(group);
        disposables.forEach(function (d) { d.dispose(); });
      }
    };
  }

  /* ---------------- Точка спавна ---------------- */

  /** Ищет ровное место недалеко от центра карты */
  async function findSpawn() {
    /* ✅ v0.5.26 СПАВН У БЕРЕГА: спираль поиска идёт от ТОЧКИ СПАВНА
       из плана архипелага (плато на побережье), а не от центра карты */
    var SP = (T.layoutInfo && T.layoutInfo() && T.layoutInfo().spawn) ||
      { x: 0, z: 0 };
    for (var ring = 0; ring < 14; ring++) {
      var rad = ring * 7;
      var steps = Math.max(8, ring * 10);
      for (var i = 0; i < steps; i++) {
        var a = (i / steps) * Math.PI * 2;
        var x = SP.x + Math.cos(a) * rad;
        var z = SP.z + Math.sin(a) * rad;
        var h = T.heightAt(x, z);
        if (h > T.WATER_LEVEL + 1.2 && slopeAt(x, z, 1.5) < 0.14) {
          await nextFrame();
          return new THREE.Vector3(x, h, z);
        }
      }
      await nextFrame();
    }
    return new THREE.Vector3(SP.x, T.heightAt(SP.x, SP.z), SP.z);
  }

  return {
    createSky: createSky,
    createLights: createLights,
    createWater: createWater,
    buildDecor: buildDecor,
    buildSpawnCamp: buildSpawnCamp,
    findSpawn: findSpawn
  };
})();
