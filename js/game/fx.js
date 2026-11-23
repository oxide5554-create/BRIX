/* ============================================================
 *  brix • js/game/fx.js — BrixFx: СЛЕДЫ ПОПАДАНИЙ (v0.5.6)
 *  ✅ v0.5.6: ВСПЫШКИ ПОЛНОСТЬЮ УБРАНЫ (по просьбе) — остались
 *  только ДЫРЫ (декали, пул 42, перезапись по кругу) и ПЫЛЬ
 *  (частицы с гравитацией, цвет по поверхности: дерево/металл/
 *  бетон). Дыры видны ТОЛЬКО от СВОИХ выстрелов: feedShot ботов
 *  impact больше не вызывает — это делает gameworld.js в СВОЁМ
 *  выстреле.
 *  Модуль самостоятельный (свои canvas-текстуры) — работает и
 *  на арене «Полигона», и в BrixLand по постройкам.
 *
 *  API:
 *    setScene(scene)      — сцена текущего мира (пул переезжает);
 *    impact(point, dir)   — дыра + пыль в точке попадания, dir —
 *                           направление полёта пули;
 *    tick(dt)             — вызывать из игрового цикла;
 *    reset()              — выход из мира.
 * ============================================================ */
window.BrixFx = (function () {
  'use strict';

  var scene = null, group = null;
  var TEX = {};

  /* ---------- canvas-текстуры (свои, без зависимости от arena-tex) ---------- */
  function makeCanvas(s2) {
    var c = document.createElement('canvas');
    c.width = c.height = s2;
    return c;
  }
  function buildTex() {
    if (TEX.hole) return;
    /* дыра: тёмный рваный овал с каймой выбитого материала */
    var c = makeCanvas(64), g = c.getContext('2d');
    g.clearRect(0, 0, 64, 64);
    var grd = g.createRadialGradient(32, 32, 2, 32, 32, 26);
    grd.addColorStop(0, 'rgba(10,8,6,0.95)');
    grd.addColorStop(0.45, 'rgba(24,20,16,0.85)');
    grd.addColorStop(0.72, 'rgba(52,44,36,0.45)');
    grd.addColorStop(1, 'rgba(70,60,50,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(32, 32, 26, 0, 7); g.fill();
    /* рваные щербинки вокруг */
    g.strokeStyle = 'rgba(16,12,9,0.8)'; g.lineWidth = 2;
    for (var i = 0; i < 7; i++) {
      var a = i / 7 * Math.PI * 2 + 0.4, r1 = 10 + (i % 3) * 3;
      g.beginPath();
      g.moveTo(32 + Math.cos(a) * r1, 32 + Math.sin(a) * r1);
      g.lineTo(32 + Math.cos(a) * (r1 + 7), 32 + Math.sin(a) * (r1 + 7));
      g.stroke();
    }
    TEX.hole = new THREE.CanvasTexture(c);

    /* мягкое пятно пыли/дыма */
    var c2 = makeCanvas(64), g2 = c2.getContext('2d');
    var grd2 = g2.createRadialGradient(32, 32, 1, 32, 32, 30);
    grd2.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd2.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    grd2.addColorStop(1, 'rgba(255,255,255,0)');
    g2.fillStyle = grd2;
    g2.beginPath(); g2.arc(32, 32, 30, 0, 7); g2.fill();
    TEX.smoke = new THREE.CanvasTexture(c2);
  }

  /* ---------- дыры (пул декалей, перезапись по кругу) ---------- */
  var HOLES = 42, holes = [], holeIdx = 0, holeMat = null;
  var holeGeo = null;
  function initHoles() {
    holeGeo = new THREE.PlaneGeometry(1, 1);
    holeMat = new THREE.MeshBasicMaterial({
      map: TEX.hole, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4
    });
    for (var i = 0; i < HOLES; i++) {
      var m = new THREE.Mesh(holeGeo, holeMat);
      m.visible = false; m.renderOrder = 2;
      m.userData.noShadow = true;
      group.add(m);
      holes.push(m);
    }
  }

  /* ---------- пыль (пул всплесков частиц) ---------- */
  var BURSTS = 12, PPN = 16, bursts = [], burstIdx = 0;
  function initBursts() {
    for (var b = 0; b < BURSTS; b++) {
      var pos = new Float32Array(PPN * 3), vel = new Float32Array(PPN * 3);
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      var mat = new THREE.PointsMaterial({
        size: 0.13, map: TEX.smoke, transparent: true, opacity: 0.85,
        depthWrite: false, color: 0xb9b3a8
      });
      var pts = new THREE.Points(geo, mat);
      pts.visible = false; pts.frustumCulled = false;
      group.add(pts);
      bursts.push({ pts: pts, vel: vel, t: 0, life: 0.8, pos: pos });
    }
  }

  /* цвет пыли: дерево — светло-коричневый, металл — серый, бетон — беж */
  function dustColor(kind) {
    if (kind === 'wood') return 0xb98c5a;
    if (kind === 'metal') return 0x9aa0a6;
    if (kind === 'spark') return 0xffcf8a;
    return 0xb9b3a8;
  }
  /** тип поверхности в точке: сперва солиды арены (метка m), иначе бетон */
  function surfaceKindAt(p) {
    try {
      if (window.BrixArena && BrixArena.isBuilt() && BrixArena.solidAt) {
        var k = BrixArena.solidAt(p.x, p.y - 3.45, p.z);
        if (k) return k;
      }
    } catch (eK) {}
    return 'concrete';
  }

  /** ✅ ГЛАВНОЕ: дыра + пыль в точке попадания (только СВОИ выстрелы) */
  function impact(point, dir, kindOverride) {
    if (!group || !point) return;
    var d = dir && dir.lengthSq ? dir.clone().normalize()
      : new THREE.Vector3(0, 1, 0);
    var kind = kindOverride || surfaceKindAt(point);

    /* дыра: чуть отступив ОТ поверхности навстречу пуле */
    var m = holes[holeIdx]; holeIdx = (holeIdx + 1) % HOLES;
    var s2 = 0.17 + Math.random() * 0.12;
    m.visible = true;
    m.scale.set(s2, s2, 1);
    m.position.copy(point).addScaledVector(d, -0.02);
    m.lookAt(m.position.clone().sub(d));
    m.rotation.z = Math.random() * Math.PI * 2;
    m.userData.kind = kind;

    /* пыль: 16 частиц полуконусом НАВСТРЕЧУ пуле */
    var b = bursts[burstIdx]; burstIdx = (burstIdx + 1) % BURSTS;
    var arr = b.pos, v = b.vel;
    var base = kind === 'metal' ? 0.55 : 0.8;
    for (var i = 0; i < PPN; i++) {
      arr[i * 3] = point.x; arr[i * 3 + 1] = point.y; arr[i * 3 + 2] = point.z;
      var a = Math.random() * Math.PI * 2, rr = Math.random() * 1.6;
      v[i * 3] = (-d.x + Math.cos(a) * rr) * (0.6 + Math.random() * 1.2);
      v[i * 3 + 1] = (-d.y + 0.9 + Math.sin(a) * rr * 0.5) * (0.6 + Math.random() * 1.1) * base;
      v[i * 3 + 2] = (-d.z + Math.sin(a) * rr) * (0.6 + Math.random() * 1.2);
      if (Math.random() < 0.14) v[i * 3 + 1] += 1.6;   // щепки выше
    }
    b.pts.material.color.setHex(dustColor(kind));
    b.pts.material.opacity = 0.85;
    b.pts.material.size = kind === 'wood' ? 0.16 : 0.12;
    b.t = b.life; b.pts.visible = true;
    b.pts.geometry.attributes.position.needsUpdate = true;
  }

  /* ---------- тик ---------- */
  function tick(dt) {
    if (!group) return;
    for (var i = 0; i < bursts.length; i++) {
      var b = bursts[i];
      if (b.t <= 0) continue;
      b.t -= dt;
      var arr = b.pos, v = b.vel;
      for (var p = 0; p < PPN; p++) {
        v[p * 3 + 1] -= 6.5 * dt;              // гравитация
        arr[p * 3] += v[p * 3] * dt;
        arr[p * 3 + 1] += v[p * 3 + 1] * dt;
        arr[p * 3 + 2] += v[p * 3 + 2] * dt;
      }
      b.pts.geometry.attributes.position.needsUpdate = true;
      b.pts.material.opacity = Math.max(0, b.t / b.life) * 0.85;
      if (b.t <= 0) b.pts.visible = false;
    }
  }

  /* ---------- сцена / сброс ---------- */
  function setScene(s2) {
    if (s2 === scene) return;
    buildTex();
    if (group && scene) { try { scene.remove(group); } catch (eR) {} }
    scene = s2;
    if (!scene) { group = null; return; }
    if (!group) {
      group = new THREE.Group();
      initHoles(); initBursts();
    }
    scene.add(group);
    for (var i = 0; i < holes.length; i++) holes[i].visible = false;
    for (var b2 = 0; b2 < bursts.length; b2++) { bursts[b2].t = 0; bursts[b2].pts.visible = false; }
  }
  function reset() { setScene(null); }

  return {
    setScene: setScene,
    impact: impact,
    tick: tick,
    reset: reset
  };
})();
