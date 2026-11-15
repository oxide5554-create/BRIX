// ============================================================
//  brix • js/game/background.js
//  Живой 3D-фон главного меню: ночная сцена с туманом,
//  сторожевой вышкой, штабелями ящиков, бочками, костровой
//  бочкой с мерцающим светом, парящей пылью и параллаксом
//  камеры за курсором. Полный перенос из BackgroundScene.tsx.
// ============================================================
window.BrixBackground = (function () {
  'use strict';

  var QUALITY_CAP = {
    low:    { dpr: 1,   dust: 120 },
    medium: { dpr: 1.5, dust: 240 },
    high:   { dpr: 2,   dust: 380 }
  };

  var RUST_COLORS = [0x5a4632, 0x4b3d2d, 0x3c3427, 0x514234];
  var BARREL_COLORS = [0x46392b, 0x39402f, 0x4d3729];

  var api = null; // { setPixelRatio, rebuildDust }

  function mount(el) {
    var scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0c0e0d, 0.055);
    scene.background = new THREE.Color(0x0c0e0d);

    var camera = new THREE.PerspectiveCamera(55, el.clientWidth / el.clientHeight, 0.1, 70);
    camera.position.set(0, 2.4, 9);

    var renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    var quality = BrixState.data.settings.quality;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY_CAP[quality].dpr));
    el.appendChild(renderer.domElement);

    /* ---------- свет ---------- */
    scene.add(new THREE.HemisphereLight(0x3a3d3a, 0x0d0f0d, 0.55));
    var moon = new THREE.DirectionalLight(0x6a736e, 0.32);
    moon.position.set(-6, 11, -5);
    scene.add(moon);

    var lamp = new THREE.PointLight(0xd8622a, 2.1, 16, 1.7);
    lamp.position.set(-3.4, 3.35, 2.4);
    scene.add(lamp);

    var fire = new THREE.PointLight(0xd8792a, 1.5, 9, 2);
    fire.position.set(3.4, 1.5, 1.8);
    scene.add(fire);

    /* ---------- земля ---------- */
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({ color: 0x131512, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    var disposables = [ground.geometry, ground.material];

    /* ---------- утилиты ---------- */
    var group = new THREE.Group();
    scene.add(group);

    function box(w, h, d, color, x, y, z, ry) {
      ry = ry || 0;
      var mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: color, roughness: 0.92 })
      );
      mesh.position.set(x, y, z);
      mesh.rotation.y = ry;
      group.add(mesh);
      disposables.push(mesh.geometry, mesh.material);
      return mesh;
    }

    function cyl(rt, rb, h, color, x, y, z) {
      var mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(rt, rb, h, 10),
        new THREE.MeshStandardMaterial({ color: color, roughness: 0.9 })
      );
      mesh.position.set(x, y, z);
      group.add(mesh);
      disposables.push(mesh.geometry, mesh.material);
      return mesh;
    }

    /* ---------- сторожевая вышка ---------- */
    var TX = -6.5, TZ = -5.5;
    var legColor = 0x2e2822;
    [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]].forEach(function (dd) {
      cyl(0.07, 0.1, 4.6, legColor, TX + dd[0], 2.3, TZ + dd[1]);
    });
    box(2.3, 0.14, 2.3, 0x332b22, TX, 4.65, TZ);
    box(1.7, 1.0, 1.7, 0x27211b, TX, 5.25, TZ);
    var roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.7, 0.9, 4),
      new THREE.MeshStandardMaterial({ color: 0x1d1813, roughness: 0.95 })
    );
    roof.position.set(TX, 6.2, TZ);
    roof.rotation.y = Math.PI / 4;
    group.add(roof);
    disposables.push(roof.geometry, roof.material);

    /* ---------- фонарный столб ---------- */
    cyl(0.05, 0.07, 3.3, 0x24211c, -3.4, 1.65, 2.4);
    box(0.5, 0.07, 0.07, 0x24211c, -3.25, 3.3, 2.4);
    var lampHead = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.3, 0.34),
      new THREE.MeshStandardMaterial({
        color: 0x1a1712,
        emissive: 0xd8622a,
        emissiveIntensity: 1.6,
        roughness: 0.7
      })
    );
    lampHead.position.set(-3.4, 3.22, 2.4);
    group.add(lampHead);
    disposables.push(lampHead.geometry, lampHead.material);

    /* ---------- ящики и бочки ---------- */
    function seedRandom(seed) {
      var s = seed;
      return function () {
        s = (s * 16807 + 11) % 2147483647;
        return (s % 10000) / 10000;
      };
    }
    var rnd = seedRandom(1337);

    function crateCluster(cx, cz, n, seedRot) {
      for (var i = 0; i < n; i++) {
        var s = 0.7 + rnd() * 0.8;
        var color = RUST_COLORS[Math.floor(rnd() * RUST_COLORS.length)];
        var layer = i % 3;
        box(
          s, s, s, color,
          cx + (rnd() - 0.5) * 1.6,
          s / 2 + layer * 0.85 * (rnd() > 0.45 ? 1 : 0.2),
          cz + (rnd() - 0.5) * 1.6,
          seedRot + rnd() * 0.8
        );
      }
    }
    crateCluster(4.2, 3.2, 7, 0.2);
    crateCluster(6.2, 1.2, 4, 1.1);
    crateCluster(-5.4, 1.8, 3, 0.6);

    function barrelRow(cx, cz, n) {
      for (var i = 0; i < n; i++) {
        var color = BARREL_COLORS[Math.floor(rnd() * BARREL_COLORS.length)];
        var b = cyl(0.34, 0.34, 0.95, color, cx + i * 0.85, 0.48, cz);
        if (i === n - 1 && n > 2) {
          b.rotation.z = Math.PI / 2.1;
          b.position.set(cx + i * 0.85 + 0.7, 0.34, cz + 0.3);
        }
      }
    }
    barrelRow(-8.4, 2.6, 3);
    barrelRow(2.2, -2.6, 2);

    /* костровая бочка */
    var fireBarrel = cyl(0.42, 0.42, 1.0, 0x3a2f24, 3.4, 0.5, 1.8);
    fireBarrel.rotation.y = 0.4;
    var flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xe08030 })
    );
    flame.position.set(3.4, 1.15, 1.8);
    flame.scale.y = 1.4;
    group.add(flame);
    disposables.push(flame.geometry, flame.material);

    /* ---------- сухие деревья на заднем плане ---------- */
    for (var i = 0; i < 5; i++) {
      var x = -12 + i * 5.5 + rnd() * 2;
      var z = -11 - rnd() * 4;
      var h = 2.4 + rnd() * 1.6;
      cyl(0.05, 0.13, h, 0x1d1a16, x, h / 2, z);
      cyl(0.03, 0.05, h * 0.4, 0x1d1a16, x + 0.25, h * 0.72, z);
    }

    /* ---------- пыль ---------- */
    var dustState = { points: null, vel: [], count: 0 };

    function buildDust(count) {
      if (dustState.points) {
        scene.remove(dustState.points);
        dustState.points.geometry.dispose();
        dustState.points.material.dispose();
        dustState.points = null;
      }
      var pos = new Float32Array(count * 3);
      dustState.vel = new Array(count);
      for (var j = 0; j < count; j++) {
        pos[j * 3] = (Math.random() - 0.5) * 22;
        pos[j * 3 + 1] = 0.2 + Math.random() * 5.5;
        pos[j * 3 + 2] = -8 + Math.random() * 13;
        dustState.vel[j] = 0.0015 + Math.random() * 0.0035;
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var mat = new THREE.PointsMaterial({
        color: 0x9a8f6a,
        size: 0.05,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        sizeAttenuation: true
      });
      var pts = new THREE.Points(geo, mat);
      scene.add(pts);
      dustState.points = pts;
      dustState.count = count;
    }
    buildDust(QUALITY_CAP[quality].dust);

    /* ---------- мышь / параллакс ---------- */
    var parallax = { tx: 0, ty: 0, x: 0, y: 0 };
    var onPointer = function (e) {
      parallax.tx = e.clientX / window.innerWidth - 0.5;
      parallax.ty = e.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener('pointermove', onPointer);

    var onResize = function () {
      if (!el.clientWidth || !el.clientHeight) return;
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener('resize', onResize);

    /* ---------- цикл ---------- */
    var clock = new THREE.Clock();
    var raf = 0;

    function tick() {
      raf = requestAnimationFrame(tick);
      var t = clock.getElapsedTime();
      var s = BrixState.data.settings;

      // мерцание фонаря и костра
      lamp.intensity = 2.0 + Math.sin(t * 13) * 0.22 + Math.sin(t * 31) * 0.16;
      fire.intensity = 1.4 + Math.sin(t * 9) * 0.3 + Math.sin(t * 23) * 0.2;
      flame.scale.y = 1.3 + Math.sin(t * 11) * 0.25;
      flame.scale.x = 1 + Math.sin(t * 17) * 0.15;

      // пыль плывёт вверх
      if (dustState.points && s.particles) {
        var arr = dustState.points.geometry.attributes.position;
        for (var j = 0; j < dustState.count; j++) {
          var y = arr.getY(j) + dustState.vel[j];
          if (y > 5.8) y = 0.2;
          arr.setY(j, y);
          arr.setX(j, arr.getX(j) + Math.sin(t * 0.5 + j) * 0.0008);
        }
        arr.needsUpdate = true;
        dustState.points.visible = true;
      } else if (dustState.points) {
        dustState.points.visible = false;
      }

      // камера: медленный дрейф + параллакс
      var enableParallax = s.parallax;
      parallax.x += (enableParallax ? parallax.tx : 0) - parallax.x;
      parallax.y += (enableParallax ? parallax.ty : 0) - parallax.y;
      camera.position.x = Math.sin(t * 0.05) * 0.7 + parallax.x * 1.2;
      camera.position.y = 2.4 + Math.sin(t * 0.09) * 0.14 - parallax.y * 0.5;
      camera.lookAt(Math.sin(t * 0.04) * 0.5, 1.7, 0);

      renderer.render(scene, camera);
    }
    tick();

    api = {
      setPixelRatio: function (v) { renderer.setPixelRatio(Math.min(window.devicePixelRatio, v)); },
      rebuildDust: function (count) { buildDust(count); }
    };

    return {
      dispose: function () {
        cancelAnimationFrame(raf);
        window.removeEventListener('pointermove', onPointer);
        window.removeEventListener('resize', onResize);
        disposables.forEach(function (d) { d.dispose(); });
        renderer.dispose();
        if (renderer.domElement.parentElement === el) el.removeChild(renderer.domElement);
        api = null;
      }
    };
  }

  /** реакция на смену качества и частиц */
  function applyQuality() {
    if (!api) return;
    var q = QUALITY_CAP[BrixState.data.settings.quality];
    api.setPixelRatio(q.dpr);
    api.rebuildDust(BrixState.data.settings.particles ? q.dust : 0);
  }

  return { mount: mount, applyQuality: applyQuality };
})();
