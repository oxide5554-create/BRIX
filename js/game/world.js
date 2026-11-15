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

  var nextFrame = function () {
    return new Promise(function (r) { requestAnimationFrame(function () { r(); }); });
  };

  /** Пологий ли склон в точке (приблизительный градиент высоты) */
  function slopeAt(x, z, d) {
    d = d || 2;
    var dx = (T.heightAt(x + d, z) - T.heightAt(x - d, z)) / (2 * d);
    var dz = (T.heightAt(x, z + d) - T.heightAt(x, z - d)) / (2 * d);
    return Math.sqrt(dx * dx + dz * dz);
  }

  /* ---------------- Небо ---------------- */

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
        sunColor: { value: new THREE.Color(0xfff1cf) }
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
        'varying vec3 vDir;',
        'void main() {',
        '  vec3 d = normalize(vDir);',
        '  float t = clamp(d.y, 0.0, 1.0);',
        '  vec3 col = mix(horizonColor, topColor, pow(t, 0.6));',
        '  float s = max(dot(d, normalize(sunDir)), 0.0);',
        '  col += sunColor * (pow(s, 350.0) * 1.4 + pow(s, 8.0) * 0.14);',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -10;
    scene.add(mesh);

    /* облака — плоские полупрозрачные плиты */
    var clouds = new THREE.Group();
    var rng = N.makeRng(777);
    var cloudMat = new THREE.MeshBasicMaterial({
      color: 0xf2f0ea,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      fog: false
    });
    for (var i = 0; i < 10; i++) {
      var w = 70 + rng() * 110;
      var g2 = new THREE.PlaneGeometry(w, w * (0.5 + rng() * 0.3));
      var m = new THREE.Mesh(g2, cloudMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(
        (rng() - 0.5) * T.WORLD_SIZE * 1.6,
        170 + rng() * 70,
        (rng() - 0.5) * T.WORLD_SIZE * 1.6
      );
      clouds.add(m);
    }
    scene.add(clouds);

    return {
      tick: function (camera) {
        mesh.position.copy(camera.position);
        clouds.children.forEach(function (c, i) {
          c.position.x += 0.02 * (1 + (i % 3) * 0.4);
          if (c.position.x > T.WORLD_SIZE * 0.9) c.position.x = -T.WORLD_SIZE * 0.9;
        });
      },
      dispose: function () {
        scene.remove(mesh);
        scene.remove(clouds);
        geo.dispose();
        mat.dispose();
        cloudMat.dispose();
        clouds.children.forEach(function (c) { c.geometry.dispose(); });
      }
    };
  }

  /* ---------------- Свет ---------------- */

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

    return {
      sun: sun,
      sunOffset: sunOffset,
      tick: function (playerPos) {
        sun.position.copy(playerPos).add(sunOffset);
        sun.target.position.copy(playerPos);
        sun.target.updateMatrixWorld();
      }
    };
  }

  /* ---------------- Вода ---------------- */

  function createWater(scene) {
    var geo = new THREE.PlaneGeometry(T.WORLD_SIZE * 2.6, T.WORLD_SIZE * 2.6);
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

    return {
      tick: function (t) {
        mat.opacity = 0.82 + Math.sin(t * 0.6) * 0.04;
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
    return new Promise(function (ok, no) {
      var u = window.BrixAsset ? window.BrixAsset(url) : url;
      BrixGLB.load(u, function (group) { ok(group); }, no);
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
    var rng = N.makeRng(20261113);
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

    /* ---- 1. деревья: расстановка (как раньше) ---- */
    var trees = [];
    var treeTries = 3200;
    for (i = 0; i < treeTries && trees.length < 340; i++) {
      var x = (rng() - 0.5) * T.WORLD_SIZE * 0.94;
      var z = (rng() - 0.5) * T.WORLD_SIZE * 0.94;
      var h = T.heightAt(x, z);
      var forest = N.fbm(x * 0.008 + 50, z * 0.008 + 80, 909, 3);
      if (forest < 0.5) continue;
      if (h < 3.5 || h > 42 || slopeAt(x, z) > 0.45) continue;
      trees.push({
        x: x, z: z, y: h,
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
    var colliders = [];   // ✅ v0.2.9: цилиндры деревьев и рудных жил
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
        fallDir: 1
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

    /* ---- 2. ✅ РУДНЫЕ ЖИЛЫ (киркой): камень / железо / сера ---- */
    // v0.2.5: кусты и декоративные камни убраны — остались только
    // ЛОМАЕМЫЕ жилы. Размещение как у камней: больше в горах и на склонах;
    // железо — среднегорье, сера — высокие горы, камень — везде.
    var oreCfg = [
      { type: 'stone',  count: 110, tries: 2000, hMin: 2.6,  hMax: 46, slope: 0.55, base: 0.62 },
      { type: 'iron',   count: 60,  tries: 1800, hMin: 10,   hMax: 46, slope: 0.30, base: 0.74 },
      { type: 'sulfur', count: 60,  tries: 1800, hMin: 16,   hMax: 48, slope: 0.30, base: 0.86 }
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

    /* ---- 3. ✅ ТРАВА (v0.2.8): иконка grass.png → билборды по миру ----
       Текстуру делаем из иконки пользователя (assets/textures/grass.png),
       каждый кустик = 2 скрещенные плоскости, инстансы, качание ветром. */
    var GRASS_COUNT = 4200;
    var grassTime = { value: 0 };
    var grassMesh = null;
    try {
      var grassTex = await new Promise(function (ok, no) {
        var loader = new THREE.TextureLoader();
        loader.load(window.BrixAsset ? window.BrixAsset('assets/textures/grass.png') : 'assets/textures/grass.png',
          ok, undefined, no);
      });
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
      var gTries = 26000;
      for (i = 0; i < gTries && grassList.length < GRASS_COUNT; i++) {
        var gx = (rng() - 0.5) * T.WORLD_SIZE * 0.93;
        var gz = (rng() - 0.5) * T.WORLD_SIZE * 0.93;
        var gh = T.heightAt(gx, gz);
        if (gh < T.WATER_LEVEL + 1.0 || gh > 30) continue;   // без пляжа и гор
        if (slopeAt(gx, gz) > 0.38) continue;
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
    var rng = N.makeRng(4242);

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
      m.position.set(
        campCX + Math.cos(a) * d,
        T.heightAt(campCX + Math.cos(a) * d, campCZ + Math.sin(a) * d) + s / 2,
        campCZ + Math.sin(a) * d
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
    for (var ring = 0; ring < 14; ring++) {
      var rad = ring * 7;
      var steps = Math.max(8, ring * 10);
      for (var i = 0; i < steps; i++) {
        var a = (i / steps) * Math.PI * 2;
        var x = Math.cos(a) * rad;
        var z = Math.sin(a) * rad;
        var h = T.heightAt(x, z);
        if (h > T.WATER_LEVEL + 1.2 && slopeAt(x, z, 1.5) < 0.14) {
          await nextFrame();
          return new THREE.Vector3(x, h, z);
        }
      }
      await nextFrame();
    }
    return new THREE.Vector3(0, T.heightAt(0, 0), 0);
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
