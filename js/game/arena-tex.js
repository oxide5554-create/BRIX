// ============================================================
//  brix • js/game/arena-tex.js
//  ✅ v0.4.66 ПОЛНЫЙ ПОРТ ТЕКСТУРНОЙ ФАБРИКИ «СЕКТОР-9» (из
//  референса, БЕЗ УРЕЗАНИЙ): шум/фбм, 3-слойные текстуры
//  (albedo + height→normal + roughness), ВСЕ материалы арены:
//  бетонный пол с швами/пятнами/трещинами, стены с опалубкой и
//  потёками, кирпич бункеров (перевязка, сколы), металлопанели с
//  болтами и трафаретами, сигнальные полосы со сколами, рифлёный
//  металл, деревянные ящики «7.62×39 БОЕПРИПАСЫ», ламинат АК,
//  воронёная сталь, ткань/разгрузка ботов, декали (эмблема
//  СЕКТОР-9, зоны БАЗА·СТАЛЬ/ПЛАМЯ, трафарет «09 ЗАКРЫТЫЙ
//  ПЕРИМЕТР», знамёна отрядов), пулевые отверстия/вспышки/пыль.
// ============================================================
window.BrixArenaTex = (function () {
  'use strict';

  /* ---------- утилиты (порт) ---------- */
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function randi(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function makeNoise(seed) {
    var r = rng(seed), g = new Float32Array(256), p = new Uint8Array(512), i, j, t;
    for (i = 0; i < 256; i++) { g[i] = r(); p[i] = i; }
    for (i = 255; i > 0; i--) { j = Math.floor(r() * (i + 1)); t = p[i]; p[i] = p[j]; p[j] = t; }
    for (i = 0; i < 256; i++) p[i + 256] = p[i];
    var fade = function (x) { return x * x * (3 - 2 * x); };
    return function (x, y) {
      var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      var X = xi & 255, Y = yi & 255, u = fade(xf), v = fade(yf);
      var a = g[p[p[X] + Y]], b = g[p[p[X + 1] + Y]], c = g[p[p[X] + Y + 1]], d = g[p[p[X + 1] + Y + 1]];
      return lerp(lerp(a, b, u), lerp(c, d, u), v);
    };
  }
  function fbmFactory(n) {
    return function (x, y, oct) {
      oct = oct || 4;
      var v = 0, a = 0.5, f = 1, tot = 0, i;
      for (i = 0; i < oct; i++) { v += n(x * f, y * f) * a; tot += a; a *= 0.5; f *= 2; }
      return v / tot;
    };
  }

  /* ---------- фабрика текстур (albedo + height→normal + roughness) ---------- */
  var maxAniso = 4;
  function C(size) { var c = document.createElement('canvas'); c.width = c.height = size; return c; }

  function pxPass(size, ctxA, ctxH, ctxR, f) {
    var ia = ctxA.createImageData(size, size), ih = ctxH.createImageData(size, size), ir = ctxR.createImageData(size, size);
    var da = ia.data, dh = ih.data, dr = ir.data, o = { r: 0, g: 0, b: 0, h: 128, ro: 200 };
    var i = 0, x, y;
    for (y = 0; y < size; y++) for (x = 0; x < size; x++) {
      f(x, y, o);
      da[i] = o.r; da[i + 1] = o.g; da[i + 2] = o.b; da[i + 3] = 255;
      dh[i] = dh[i + 1] = dh[i + 2] = o.h; dh[i + 3] = 255;
      dr[i] = dr[i + 1] = dr[i + 2] = o.ro; dr[i + 3] = 255;
      i += 4;
    }
    ctxA.putImageData(ia, 0, 0); ctxH.putImageData(ih, 0, 0); ctxR.putImageData(ir, 0, 0);
  }

  function normalFromHeight(hc, strength) {
    var s = hc.width, src = hc.getContext('2d').getImageData(0, 0, s, s).data;
    var out = C(s), ctx = out.getContext('2d'), id = ctx.createImageData(s, s), d = id.data;
    var H = function (x, y) { return src[(((y + s) % s) * s + ((x + s) % s)) * 4]; };
    var i = 0, x, y;
    for (y = 0; y < s; y++) for (x = 0; x < s; x++) {
      var nx = (H(x - 1, y) - H(x + 1, y)) * strength / 255;
      var ny = (H(x, y - 1) - H(x, y + 1)) * strength / 255;
      var inv = 1 / Math.hypot(nx, ny, 1);
      d[i] = (nx * inv * 0.5 + 0.5) * 255; d[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      d[i + 2] = (inv * 0.5 + 0.5) * 255; d[i + 3] = 255; i += 4;
    }
    ctx.putImageData(id, 0, 0); return out;
  }

  function makeTex(cA, cH, cR, opt) {
    opt = opt || {};
    var repeat = opt.repeat || [1, 1], nStrength = opt.nStrength === undefined ? 2 : opt.nStrength;
    var srgb = opt.srgb === undefined ? true : opt.srgb;
    var t = function (c, srgbC) {
      var tx = new THREE.CanvasTexture(c);
      tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
      tx.repeat.set(repeat[0], repeat[1]);
      tx.anisotropy = maxAniso;
      if (srgbC && THREE.SRGBColorSpace) tx.colorSpace = THREE.SRGBColorSpace;
      return tx;
    };
    return { map: t(cA, srgb), nrm: t(normalFromHeight(cH, nStrength), false), rgh: t(cR, false) };
  }
  function cloneTexSet(ts, rx, ry) {
    var o = {}, k;
    for (k in { map: 1, nrm: 1, rgh: 1 }) {
      var t = ts[k].clone(); t.repeat.set(rx, ry); t.needsUpdate = true; o[k] = t;
    }
    return o;
  }
  function stdMat(ts, opt) {
    opt = opt || {};
    return new THREE.MeshStandardMaterial({
      map: ts.map, normalMap: ts.nrm, roughnessMap: ts.rgh, roughness: 1,
      metalness: opt.metalness || 0.05,
      normalScale: new THREE.Vector2(opt.normalScale || 1, opt.normalScale || 1),
      emissive: opt.emissive || 0, emissiveIntensity: opt.emissiveIntensity || 0
    });
  }

  /* ---------- рисовательные помощники (порт) ---------- */
  function crackPath(r, x, y, steps, len) {
    var pts = [[x, y]], a = r() * Math.PI * 2, i;
    for (i = 0; i < steps; i++) {
      a += (r() - 0.5) * 1.1;
      var l = len * (0.5 + r());
      x += Math.cos(a) * l; y += Math.sin(a) * l;
      pts.push([x, y]);
    }
    return pts;
  }
  function drawCrack(ctx, pts, w, col) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 0; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  function stain(ctx, r, x, y, rad, col, alpha) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = col;
    ctx.beginPath();
    var n = randi(9, 13), i;
    for (i = 0; i <= n; i++) {
      var a = i / n * Math.PI * 2, rr = rad * (0.55 + r() * 0.7);
      var px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.8;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.shadowColor = col; ctx.shadowBlur = rad * 0.5; ctx.fill();
    ctx.restore();
  }
  function speckle(ctx, r, n, size, cols, aMax) {
    for (var i = 0; i < n; i++) {
      ctx.globalAlpha = r() * aMax; ctx.fillStyle = choice(cols);
      var s = 1 + r() * 2;
      ctx.fillRect(r() * size, r() * size, s, s);
    }
    ctx.globalAlpha = 1;
  }
  function stencil(ctx, txt, x, y, size, col, alpha, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
    ctx.globalAlpha = alpha; ctx.fillStyle = col;
    ctx.font = '700 ' + size + 'px "JetBrains Mono",monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, 0, 0); ctx.restore();
  }

  /* ============================================================
     ГЕНЕРАЦИЯ ВСЕХ ТЕКСТУР (порт genTextures, без урезаний)
     ============================================================ */
  var TEX = {};
  var MAT = null;

  function genFloor() {
    var s = 1024, a = C(s), h = C(s), ro = C(s);
    var ac = a.getContext('2d'), hc = h.getContext('2d'), rc = ro.getContext('2d');
    var n = makeNoise(11), fb = fbmFactory(n), r = rng(101);
    pxPass(s, ac, hc, rc, function (x, y, o) {
      var tx = Math.floor(x / 512), ty = Math.floor(y / 512), th = ((tx * 7 + ty * 13) % 5) - 2;
      var v = 92 + fb(x * 0.008, y * 0.008, 5) * 52 + fb(x * 0.05, y * 0.05, 3) * 20 + th * 4;
      o.r = v * 0.97; o.g = v; o.b = v * 1.06;
      o.h = 118 + fb(x * 0.02, y * 0.02, 4) * 36;
      o.ro = 196 + fb(x * 0.03, y * 0.03, 3) * 34;
    });
    var i, ctx2;
    for (i = 0; i < 2; i++) {
      ctx2 = i ? hc : ac;
      ctx2.strokeStyle = i ? '#2a2a2a' : '#33363c'; ctx2.lineWidth = 7;
      for (var k = 0; k <= 2; k++) {
        ctx2.beginPath(); ctx2.moveTo(k * 512, 0); ctx2.lineTo(k * 512, s); ctx2.stroke();
        ctx2.beginPath(); ctx2.moveTo(0, k * 512); ctx2.lineTo(s, k * 512); ctx2.stroke();
      }
    }
    ac.strokeStyle = '#8d939e'; ac.lineWidth = 1.5; ac.globalAlpha = 0.5;
    for (i = 0; i <= 2; i++) {
      ac.beginPath(); ac.moveTo(i * 512 + 5, 0); ac.lineTo(i * 512 + 5, s); ac.stroke();
      ac.beginPath(); ac.moveTo(0, i * 512 + 5); ac.lineTo(s, i * 512 + 5); ac.stroke();
    }
    ac.globalAlpha = 1;
    for (i = 0; i < 9; i++) stain(ac, r, r() * s, r() * s, 40 + r() * 110, i % 3 ? '#181a1f' : '#6e4520', 0.16 + r() * 0.14);
    for (i = 0; i < 9; i++) stain(rc, r, r() * s, r() * s, 50 + r() * 100, '#5a5a5a', 0.35);
    ac.lineCap = 'round';
    for (i = 0; i < 14; i++) {
      ac.globalAlpha = 0.05 + r() * 0.05;
      ac.strokeStyle = r() < 0.5 ? '#14161a' : '#9aa2ad'; ac.lineWidth = 18 + r() * 46;
      ac.beginPath();
      var x0 = r() * s, y0 = r() * s;
      ac.moveTo(x0, y0);
      ac.quadraticCurveTo(x0 + (r() - 0.5) * 500, y0 + (r() - 0.5) * 500, x0 + (r() - 0.5) * 800, y0 + (r() - 0.5) * 800);
      ac.stroke();
    }
    ac.globalAlpha = 1;
    for (i = 0; i < 6; i++) {
      var pts = crackPath(r, r() * s, r() * s, randi(24, 46), 13);
      drawCrack(ac, pts, 2.4, '#26282d'); drawCrack(ac, pts, 1, '#17181c'); drawCrack(hc, pts, 3.4, '#1c1c1c');
      if (r() < 0.6) {
        var b = pts[randi(4, pts.length - 2)];
        var bp = crackPath(r, b[0], b[1], randi(8, 16), 10);
        drawCrack(ac, bp, 1.4, '#232529'); drawCrack(hc, bp, 2, '#222');
      }
    }
    speckle(ac, r, 2200, s, ['#b9bfc9', '#22242a'], 0.22);
    TEX.floor = makeTex(a, h, ro, { repeat: [15, 11], nStrength: 2.4 });
  }

  function genWall() {
    var s = 1024, a = C(s), h = C(s), ro = C(s);
    var ac = a.getContext('2d'), hc = h.getContext('2d'), rc = ro.getContext('2d');
    var n = makeNoise(23), fb = fbmFactory(n), n1 = makeNoise(77), r = rng(202);
    pxPass(s, ac, hc, rc, function (x, y, o) {
      var col = 0.86 + n1(x * 0.02, 3.7) * 0.22;
      var v = (118 + fb(x * 0.006, y * 0.006, 5) * 48 + fb(x * 0.04, y * 0.04, 3) * 16) * col;
      v -= Math.max(0, (y / s - 0.72)) * 90;
      o.r = v * 1.02; o.g = v; o.b = v * 0.96;
      o.h = 120 + fb(x * 0.02, y * 0.02, 4) * 30;
      o.ro = 205 + fb(x * 0.05, y * 0.05, 2) * 26;
    });
    var i;
    for (i = 1; i < 4; i++) {
      var y = i * 256;
      ac.strokeStyle = '#3c3f45'; ac.lineWidth = 5;
      ac.beginPath(); ac.moveTo(0, y); ac.lineTo(s, y); ac.stroke();
      hc.strokeStyle = '#222'; hc.lineWidth = 7;
      hc.beginPath(); hc.moveTo(0, y); hc.lineTo(s, y); hc.stroke();
      var g = ac.createLinearGradient(0, y, 0, y + 70);
      g.addColorStop(0, 'rgba(20,20,24,.28)'); g.addColorStop(1, 'rgba(20,20,24,0)');
      ac.fillStyle = g; ac.fillRect(0, y, s, 70);
      for (var x = 64; x < s; x += 192) {
        ac.fillStyle = '#585c64'; ac.fillRect(x - 8, y - 8, 16, 16);
        ac.fillStyle = '#7e828c'; ac.fillRect(x - 8, y - 8, 16, 3);
        hc.fillStyle = '#d8d8d8'; hc.fillRect(x - 8, y - 8, 16, 16);
        if (r() < 0.55) {
          var len = 50 + r() * 130;
          var gr = ac.createLinearGradient(0, y + 8, 0, y + 8 + len);
          gr.addColorStop(0, 'rgba(122,66,28,.4)'); gr.addColorStop(1, 'rgba(122,66,28,0)');
          ac.fillStyle = gr; ac.fillRect(x - 2 - r() * 3, y + 8, 3 + r() * 4, len);
        }
      }
    }
    for (i = 0; i < 7; i++) stain(ac, r, r() * s, s * 0.4 + r() * s * 0.6, 50 + r() * 120, '#17181d', 0.15 + r() * 0.12);
    for (i = 0; i < 4; i++) {
      var pts = crackPath(r, r() * s, r() * s * 0.7, randi(20, 38), 12);
      drawCrack(ac, pts, 2, '#2c2e33'); drawCrack(hc, pts, 3, '#1e1e1e');
    }
    speckle(ac, r, 1500, s, ['#a7adb8', '#1e2025'], 0.18);
    TEX.wall = makeTex(a, h, ro, { repeat: [10, 1], nStrength: 2.2 });
  }

  function genBrick() {
    var s = 512, a = C(s), h = C(s), ro = C(s);
    var ac = a.getContext('2d'), hc = h.getContext('2d'), rc = ro.getContext('2d');
    var n = makeNoise(31), fb = fbmFactory(n), r = rng(303);
    var bw = 128, bh = 56, m = 8;
    var tones = [[110, 63, 46], [122, 74, 51], [93, 53, 38], [104, 58, 40], [86, 48, 36]];
    pxPass(s, ac, hc, rc, function (x, y, o) {
      var row = Math.floor(y / bh), off = (row % 2) * bw / 2;
      var bx = ((x + off) % bw), by = y % bh;
      var col = Math.floor(((x + off) % s) / bw) + row * 4;
      var inM = bx < m || by < m;
      if (inM) {
        var v0 = 84 + fb(x * 0.06, y * 0.06, 3) * 22;
        o.r = v0; o.g = v0 * 0.96; o.b = v0 * 0.9; o.h = 62; o.ro = 225; return;
      }
      var t = tones[Math.abs((col * 2654435761) >> 8) % tones.length];
      var edge = Math.min(bx - m, by - m, bw - bx, bh - by);
      var k = 0.82 + fb(x * 0.05, y * 0.05, 4) * 0.4;
      if (edge < 5) k *= 0.78;
      o.r = t[0] * k; o.g = t[1] * k; o.b = t[2] * k;
      o.h = 158 + fb(x * 0.08, y * 0.08, 3) * 30 - (edge < 3 ? 24 : 0);
      o.ro = 208 + fb(x * 0.1, y * 0.1, 2) * 24;
    });
    var i;
    for (i = 0; i < 10; i++) {
      var row = randi(0, 8), off = (row % 2) * bw / 2;
      var x = ((randi(0, 3) * bw - off) + s) % s, y = row * bh;
      ac.fillStyle = '#57534e'; hc.fillStyle = '#3c3c3c';
      var ctxs = [ac, hc];
      for (var ci = 0; ci < 2; ci++) {
        ctxs[ci].beginPath();
        ctxs[ci].moveTo(x + m, y + m);
        ctxs[ci].lineTo(x + m + 8 + r() * 14, y + m);
        ctxs[ci].lineTo(x + m, y + m + 6 + r() * 10);
        ctxs[ci].closePath(); ctxs[ci].fill();
      }
    }
    for (i = 0; i < 5; i++) stain(ac, r, r() * s, r() * s, 30 + r() * 60, '#15130f', 0.2);
    var g = ac.createLinearGradient(0, s * 0.6, 0, s);
    g.addColorStop(0, 'rgba(10,10,12,0)'); g.addColorStop(1, 'rgba(10,10,12,.4)');
    ac.fillStyle = g; ac.fillRect(0, 0, s, s);
    speckle(ac, r, 700, s, ['#c9a184', '#1a1512'], 0.16);
    TEX.brick = makeTex(a, h, ro, { repeat: [6, 5], nStrength: 3 });
  }

  function genMetal() {
    var s = 512, a = C(s), h = C(s), ro = C(s);
    var ac = a.getContext('2d'), hc = h.getContext('2d'), rc = ro.getContext('2d');
    var n = makeNoise(41), fb = fbmFactory(n), r = rng(404);
    pxPass(s, ac, hc, rc, function (x, y, o) {
      var brush = n(x * 0.006, y * 0.42) * 16 + fb(x * 0.004, y * 0.05, 3) * 13;
      var v = 58 + brush;
      o.r = v * 0.94; o.g = v; o.b = v * 1.14;
      o.h = 126 + n(x * 0.01, y * 0.5) * 10;
      o.ro = 136 + brush * 1.6;
    });
    ac.strokeStyle = '#1c2026'; ac.lineWidth = 12; ac.strokeRect(6, 6, s - 12, s - 12);
    hc.strokeStyle = '#3a3a3a'; hc.lineWidth = 14; hc.strokeRect(6, 6, s - 12, s - 12);
    ac.strokeStyle = '#78828f'; ac.lineWidth = 2;
    ac.beginPath(); ac.moveTo(14, s - 14); ac.lineTo(14, 14); ac.lineTo(s - 14, 14); ac.stroke();
    ac.strokeStyle = '#252a31';
    ac.beginPath(); ac.moveTo(s - 14, 14); ac.lineTo(s - 14, s - 14); ac.lineTo(14, s - 14); ac.stroke();
    var bolt = function (x, y) {
      var sets = [[ac, '#2c3138', '#8b95a2'], [hc, '#e0e0e0', null]], si;
      for (si = 0; si < 2; si++) {
        var ctx = sets[si][0];
        ctx.fillStyle = sets[si][1];
        ctx.beginPath();
        for (var i = 0; i < 6; i++) {
          var a2 = i / 6 * Math.PI * 2 + Math.PI / 6;
          var px = x + Math.cos(a2) * 10, py = y + Math.sin(a2) * 10;
          if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.closePath(); ctx.fill();
        if (sets[si][2]) {
          ctx.strokeStyle = sets[si][2]; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(x - 7, y - 4); ctx.lineTo(x, y - 8); ctx.lineTo(x + 7, y - 4); ctx.stroke();
        }
      }
    };
    bolt(36, 36); bolt(s - 36, 36); bolt(36, s - 36); bolt(s - 36, s - 36);
    var i;
    for (i = 0; i < 24; i++) {
      var x = r() * s, y = r() * s, a3 = r() * Math.PI, l = 24 + r() * 110;
      ac.strokeStyle = r() < 0.6 ? 'rgba(185,196,210,.28)' : 'rgba(15,17,20,.4)';
      ac.lineWidth = 1;
      ac.beginPath(); ac.moveTo(x, y); ac.lineTo(x + Math.cos(a3) * l, y + Math.sin(a3) * l); ac.stroke();
      rc.strokeStyle = '#5c5c5c'; rc.lineWidth = 1.4;
      rc.beginPath(); rc.moveTo(x, y); rc.lineTo(x + Math.cos(a3) * l, y + Math.sin(a3) * l); rc.stroke();
    }
    for (i = 0; i < 4; i++) {
      var x2 = r() * s, y2 = s * 0.75 + r() * s * 0.22;
      stain(ac, r, x2, y2, 26 + r() * 46, '#7a4526', 0.4);
      stain(ac, r, x2, y2, 14 + r() * 22, '#5d3320', 0.5);
      stain(rc, r, x2, y2, 30 + r() * 40, '#e8e8e8', 0.5);
    }
    stencil(ac, '07', s * 0.5, s * 0.42, 84, '#cfd6df', 0.34);
    stencil(ac, 'СЕК-9 · НЕ КАНТОВАТЬ', s * 0.5, s * 0.56, 20, '#cfd6df', 0.3);
    speckle(ac, r, 500, s, ['#9aa6b5', '#14161a'], 0.14);
    TEX.metal = makeTex(a, h, ro, { repeat: [1, 1], nStrength: 1.7 });
  }

  function genHazard() {
    var s = 512, a = C(s), h = C(s), ro = C(s);
    var ac = a.getContext('2d'), hc = h.getContext('2d'), rc = ro.getContext('2d');
    var n = makeNoise(53), fb = fbmFactory(n), r = rng(505);
    pxPass(s, ac, hc, rc, function (x, y, o) {
      var brush = n(x * 0.006, y * 0.4) * 14;
      var v = 54 + brush;
      o.r = v * 0.94; o.g = v; o.b = v * 1.12; o.h = 126; o.ro = 140;
    });
    hc.fillStyle = '#808080'; hc.fillRect(0, 0, s, s);
    var st = C(s), sc = st.getContext('2d');
    sc.save(); sc.translate(s / 2, s / 2); sc.rotate(-Math.PI / 4);
    for (var i = -8; i < 8; i++) {
      sc.fillStyle = i % 2 ? '#20232a' : '#d99a1f';
      sc.fillRect(-s, i * 64, s * 2, 64);
    }
    sc.restore();
    sc.globalCompositeOperation = 'destination-out';
    for (i = 0; i < 260; i++) {
      var x = r() * s, y = r() * s, nn = randi(5, 8), j;
      sc.beginPath();
      for (j = 0; j <= nn; j++) {
        var a2 = j / nn * Math.PI * 2, rr = 2 + r() * 9;
        var px = x + Math.cos(a2) * rr, py = y + Math.sin(a2) * rr;
        if (j) sc.lineTo(px, py); else sc.moveTo(px, py);
      }
      sc.closePath(); sc.fill();
    }
    sc.globalCompositeOperation = 'source-over';
    ac.drawImage(st, 0, 0);
    rc.drawImage(st, 0, 0);
    rc.globalAlpha = 0.5; rc.fillStyle = '#969696'; rc.fillRect(0, 0, s, s); rc.globalAlpha = 1;
    for (i = 0; i < 16; i++) {
      var x2 = r() * s, y2 = r() * s, a3 = r() * Math.PI, l = 20 + r() * 80;
      ac.strokeStyle = 'rgba(190,200,212,.25)'; ac.lineWidth = 1;
      ac.beginPath(); ac.moveTo(x2, y2); ac.lineTo(x2 + Math.cos(a3) * l, y2 + Math.sin(a3) * l); ac.stroke();
    }
    for (i = 0; i < 4; i++) stain(ac, r, r() * s, s * 0.6 + r() * s * 0.4, 26 + r() * 40, '#4a2c16', 0.35);
    var g = ac.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.32)');
    ac.fillStyle = g; ac.fillRect(0, 0, s, s);
    TEX.hazard = makeTex(a, h, ro, { repeat: [2.6, 1.1], nStrength: 1.8 });
  }

  function genTread() {
    var s = 512, a = C(s), h = C(s), ro = C(s);
    var ac = a.getContext('2d'), hc = h.getContext('2d'), rc = ro.getContext('2d');
    var n = makeNoise(61), fb = fbmFactory(n), r = rng(606);
    pxPass(s, ac, hc, rc, function (x, y, o) {
      var v = 66 + fb(x * 0.02, y * 0.02, 4) * 20;
      o.r = v * 0.95; o.g = v; o.b = v * 1.12; o.h = 116; o.ro = 150;
    });
    var stud = function (x, y, rot) {
      var sets = [[ac, '#5c6572', '#8d97a5', '#232830'], [hc, '#e8e8e8', null, null], [rc, '#5a5a5a', null, null]];
      for (var si = 0; si < 3; si++) {
        var ctx = sets[si][0];
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
        ctx.fillStyle = sets[si][1];
        ctx.beginPath();
        ctx.moveTo(-19, 0); ctx.lineTo(-13, -5.5); ctx.lineTo(13, -5.5); ctx.lineTo(19, 0);
        ctx.lineTo(13, 5.5); ctx.lineTo(-13, 5.5); ctx.closePath(); ctx.fill();
        if (sets[si][2]) {
          ctx.strokeStyle = sets[si][2]; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(-16, -1); ctx.lineTo(-12, -4.5); ctx.lineTo(12, -4.5); ctx.stroke();
          ctx.strokeStyle = sets[si][3];
          ctx.beginPath(); ctx.moveTo(-12, 4.5); ctx.lineTo(12, 4.5); ctx.lineTo(16, 1); ctx.stroke();
        }
        ctx.restore();
      }
    };
    for (var gy = 0; gy < 8; gy++) for (var gx = 0; gx < 8; gx++) {
      var x = gx * 64 + 32, y = gy * 64 + 32;
      stud(x - 11, y - 11, (gx + gy) % 2 ? Math.PI / 4 : -Math.PI / 4);
      stud(x + 11, y + 11, (gx + gy) % 2 ? Math.PI / 4 : -Math.PI / 4);
    }
    for (var i = 0; i < 5; i++) stain(ac, r, r() * s, r() * s, 26 + r() * 50, '#101318', 0.3);
    speckle(ac, r, 600, s, ['#98a3b2', '#12151a'], 0.16);
    TEX.tread = makeTex(a, h, ro, { repeat: [26, 19], nStrength: 2.6 });
  }

  function genCrate() {
    var s = 512, a = C(s), h = C(s), ro = C(s);
    var ac = a.getContext('2d'), hc = h.getContext('2d'), rc = ro.getContext('2d');
    var n = makeNoise(71), fb = fbmFactory(n), r = rng(707);
    var pw = 102;
    pxPass(s, ac, hc, rc, function (x, y, o) {
      var pi = Math.floor(x / pw), ph = ((pi * 2654435761) >> 6) % 7 - 3;
      var grain = fb(x * 0.24, y * 0.012, 4) * 30 + Math.sin(x * 0.5 + fb(x * 0.05, y * 0.02, 2) * 9) * 5;
      if ((x % pw) < 4) { o.r = 42; o.g = 32; o.b = 22; o.h = 44; o.ro = 225; return; }
      var k = 0.8 + grain / 60;
      o.r = (138 + ph * 3) * k; o.g = (104 + ph * 2) * k; o.b = (64 + ph) * k;
      o.h = 140 + grain; o.ro = 192 + grain * 0.5;
    });
    var i;
    for (i = 0; i < 4; i++) {
      var x = randi(1, 4) * pw + randi(14, 80), y = r() * s;
      var ctxs = [[ac, '#3a2a18'], [hc, '#4a4a4a']];
      for (var ci = 0; ci < 2; ci++) {
        ctxs[ci][0].fillStyle = ctxs[ci][1];
        ctxs[ci][0].beginPath();
        var nn = 8;
        for (var j = 0; j <= nn; j++) {
          var a2 = j / nn * Math.PI * 2, rr = 4 + r() * 7;
          var px = x + Math.cos(a2) * rr, py = y + Math.sin(a2) * rr * 1.7;
          if (j) ctxs[ci][0].lineTo(px, py); else ctxs[ci][0].moveTo(px, py);
        }
        ctxs[ci][0].closePath(); ctxs[ci][0].fill();
      }
    }
    ac.fillStyle = 'rgba(52,38,22,.55)';
    ac.fillRect(0, 0, s, 26); ac.fillRect(0, s - 26, s, 26);
    hc.fillStyle = '#6a6a6a';
    hc.fillRect(0, 0, s, 26); hc.fillRect(0, s - 26, s, 26);
    var bracket = function (x, y, fx, fy) {
      ac.fillStyle = '#33383f'; hc.fillStyle = '#dcdcdc';
      ac.fillRect(x, y, 58 * fx, 16 * fy); ac.fillRect(x, y, 16 * fx, 58 * fy);
      hc.fillRect(x, y, 58 * fx, 16 * fy); hc.fillRect(x, y, 16 * fx, 58 * fy);
      ac.fillStyle = '#8b95a2';
      ac.fillRect(x + 4 * fx, y + 4 * fy, 5 * fx, 5 * fy);
      ac.fillRect(x + 40 * fx, y + 4 * fy, 5 * fx, 5 * fy);
      ac.fillRect(x + 4 * fx, y + 40 * fy, 5 * fx, 5 * fy);
    };
    bracket(0, 0, 1, 1); bracket(s, 0, -1, 1); bracket(0, s, 1, -1); bracket(s, s, -1, -1);
    ac.fillStyle = '#1e2126';
    for (var pi2 = 0; pi2 < 5; pi2++) {
      var xn = pi2 * pw + pw / 2;
      ac.fillRect(xn, 34, 4, 4); ac.fillRect(xn, s - 40, 4, 4);
    }
    stencil(ac, '7.62×39', s / 2, s * 0.42, 46, '#1f232a', 0.8);
    stencil(ac, 'БОЕПРИПАСЫ', s / 2, s * 0.54, 30, '#1f232a', 0.75);
    stencil(ac, 'ПАРТИЯ 09 · 1080 ШТ', s / 2, s * 0.63, 15, '#1f232a', 0.6);
    ac.save(); ac.globalAlpha = 0.65; ac.fillStyle = '#d99a1f';
    ac.beginPath(); ac.moveTo(s * 0.78, s * 0.2); ac.lineTo(s * 0.86, s * 0.2); ac.lineTo(s * 0.82, s * 0.13); ac.closePath(); ac.fill();
    ac.restore();
    for (i = 0; i < 5; i++) stain(ac, r, r() * s, r() * s, 24 + r() * 40, '#241a10', 0.25);
    speckle(ac, r, 600, s, ['#c7a877', '#221a10'], 0.18);
    TEX.crate = makeTex(a, h, ro, { repeat: [1, 1], nStrength: 2.2 });
  }

  function genGunwood() {
    var s = 256, a = C(s), h = C(s), ro = C(s);
    var ac = a.getContext('2d'), hc = h.getContext('2d'), rc = ro.getContext('2d');
    var n = makeNoise(83), fb = fbmFactory(n);
    pxPass(s, ac, hc, rc, function (x, y, o) {
      var grain = fb(x * 0.02, y * 0.3, 4) * 26 + Math.sin(y * 0.55 + fb(x * 0.03, y * 0.06, 2) * 7) * 6;
      var band = Math.sin(y * 0.05) * 8;
      o.r = 122 + grain + band; o.g = 58 + grain * 0.55 + band * 0.5; o.b = 28 + grain * 0.3;
      o.h = 128 + grain * 0.4; o.ro = 104 + grain * 0.8;
    });
    TEX.gunwood = makeTex(a, h, ro, { repeat: [1, 1], nStrength: 1.2 });
  }

  function genGunmetal() {
    var s = 256, a = C(s), h = C(s), ro = C(s);
    var ac = a.getContext('2d'), hc = h.getContext('2d'), rc = ro.getContext('2d');
    var n = makeNoise(89), fb = fbmFactory(n), r = rng(808);
    pxPass(s, ac, hc, rc, function (x, y, o) {
      var v = 34 + fb(x * 0.08, y * 0.08, 4) * 14;
      o.r = v; o.g = v * 1.04; o.b = v * 1.12;
      o.h = 128 + fb(x * 0.2, y * 0.2, 2) * 8;
      o.ro = 142 + fb(x * 0.1, y * 0.1, 3) * 30;
    });
    for (var i = 0; i < 14; i++) {
      var x = r() * s, y = r() * s, a2 = r() * Math.PI, l = 10 + r() * 50;
      ac.strokeStyle = 'rgba(160,170,185,.2)'; ac.lineWidth = 0.8;
      ac.beginPath(); ac.moveTo(x, y); ac.lineTo(x + Math.cos(a2) * l, y + Math.sin(a2) * l); ac.stroke();
    }
    TEX.gunmetal = makeTex(a, h, ro, { repeat: [1, 1], nStrength: 1 });
  }

  function genFabric() {
    var s = 256, a = C(s), h = C(s), ro = C(s);
    var ac = a.getContext('2d'), hc = h.getContext('2d'), rc = ro.getContext('2d');
    var n = makeNoise(97), fb = fbmFactory(n);
    pxPass(s, ac, hc, rc, function (x, y, o) {
      var w = ((x % 4 < 2) ^ (y % 4 < 2)) ? 6 : -4;
      var v = 44 + fb(x * 0.06, y * 0.06, 3) * 14 + w;
      o.r = v * 0.94; o.g = v; o.b = v * 0.82; o.h = 128 + w * 2; o.ro = 232;
    });
    TEX.fabric = makeTex(a, h, ro, { repeat: [1, 1], nStrength: 1 });
    var a2 = C(s), h2 = C(s), r2 = C(s);
    var ac2 = a2.getContext('2d'), hc2 = h2.getContext('2d'), rc2 = r2.getContext('2d');
    pxPass(s, ac2, hc2, rc2, function (x, y, o) {
      var w = ((x % 4 < 2) ^ (y % 4 < 2)) ? 5 : -3;
      var v = 34 + fb(x * 0.06, y * 0.06, 3) * 12 + w;
      o.r = v * 0.92; o.g = v; o.b = v * 0.8; o.h = 126 + w * 2; o.ro = 235;
    });
    for (var y = 26; y < s; y += 44) {
      ac2.fillStyle = 'rgba(70,76,60,.8)'; ac2.fillRect(0, y, s, 13);
      hc2.fillStyle = '#b4b4b4'; hc2.fillRect(0, y, s, 13);
      ac2.fillStyle = 'rgba(20,22,16,.9)';
      for (var x = 6; x < s; x += 22) ac2.fillRect(x, y + 5, 10, 3);
    }
    TEX.vest = makeTex(a2, h2, r2, { repeat: [1, 1], nStrength: 1.4 });
  }

  function genDecals() {
    var r = rng(1010), i, j;
    // пулевое отверстие
    var bh = C(128), bc = bh.getContext('2d');
    bc.fillStyle = 'rgba(150,155,165,.28)';
    bc.beginPath();
    var nn = 11;
    for (j = 0; j <= nn; j++) {
      var a = j / nn * Math.PI * 2, rr = 34 + r() * 22;
      var px = 64 + Math.cos(a) * rr, py = 64 + Math.sin(a) * rr;
      if (j) bc.lineTo(px, py); else bc.moveTo(px, py);
    }
    bc.closePath(); bc.fill();
    for (i = 0; i < 7; i++) {
      var a2 = r() * Math.PI * 2, l = 22 + r() * 32;
      bc.strokeStyle = 'rgba(18,19,23,.6)'; bc.lineWidth = 1.4;
      bc.beginPath(); bc.moveTo(64, 64); bc.lineTo(64 + Math.cos(a2) * l, 64 + Math.sin(a2) * l); bc.stroke();
    }
    bc.fillStyle = 'rgba(12,13,16,.95)';
    bc.beginPath(); nn = 9;
    for (j = 0; j <= nn; j++) {
      var a3 = j / nn * Math.PI * 2, rr2 = 8 + r() * 8;
      var px2 = 64 + Math.cos(a3) * rr2, py2 = 64 + Math.sin(a3) * rr2;
      if (j) bc.lineTo(px2, py2); else bc.moveTo(px2, py2);
    }
    bc.closePath(); bc.fill();
    TEX.bullet = new THREE.CanvasTexture(bh);
    if (THREE.SRGBColorSpace) TEX.bullet.colorSpace = THREE.SRGBColorSpace;
    // вспышка (звезда)
    var fc = C(128), fx = fc.getContext('2d');
    var fg = fx.createRadialGradient(64, 64, 2, 64, 64, 62);
    fg.addColorStop(0, 'rgba(255,255,240,1)'); fg.addColorStop(0.3, 'rgba(255,196,110,.95)');
    fg.addColorStop(0.7, 'rgba(255,120,40,.45)'); fg.addColorStop(1, 'rgba(255,90,30,0)');
    fx.fillStyle = fg;
    fx.beginPath();
    var spikes = 10;
    for (j = 0; j <= spikes * 2; j++) {
      var a4 = j / (spikes * 2) * Math.PI * 2, rr3 = j % 2 ? 18 + r() * 10 : 34 + r() * 28;
      var px3 = 64 + Math.cos(a4) * rr3, py3 = 64 + Math.sin(a4) * rr3;
      if (j) fx.lineTo(px3, py3); else fx.moveTo(px3, py3);
    }
    fx.closePath(); fx.fill();
    TEX.flash = new THREE.CanvasTexture(fc);
    if (THREE.SRGBColorSpace) TEX.flash.colorSpace = THREE.SRGBColorSpace;
    // мягкая частица
    var pc = C(64), pctx = pc.getContext('2d');
    var pg = pctx.createRadialGradient(32, 32, 1, 32, 32, 30);
    pg.addColorStop(0, 'rgba(255,255,255,1)'); pg.addColorStop(0.5, 'rgba(255,255,255,.5)');
    pg.addColorStop(1, 'rgba(255,255,255,0)');
    pctx.fillStyle = pg; pctx.fillRect(0, 0, 64, 64);
    TEX.dot = new THREE.CanvasTexture(pc);
    // блоб-тень
    var sc2 = C(128), sctx = sc2.getContext('2d');
    var sg = sctx.createRadialGradient(64, 64, 4, 64, 64, 60);
    sg.addColorStop(0, 'rgba(0,0,0,.62)'); sg.addColorStop(0.7, 'rgba(0,0,0,.3)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    sctx.fillStyle = sg; sctx.fillRect(0, 0, 128, 128);
    TEX.blob = new THREE.CanvasTexture(sc2);
    // знамёна отрядов (СТАЛЬ синее / ПЛАМЯ красное)
    var banner = function (team) {
      var w2 = 512, h2 = 768;
      var c = document.createElement('canvas'); c.width = w2; c.height = h2;
      var ctx = c.getContext('2d');
      var blue = team === 'blue';
      var base = blue ? '#101f38' : '#33100b';
      var acc = blue ? '#4da3ff' : '#ff5a3c';
      var acc2 = blue ? '#7cc0ff' : '#ffb347';
      ctx.fillStyle = base; ctx.fillRect(0, 0, w2, h2);
      var n2 = makeNoise(blue ? 111 : 222), fb2 = fbmFactory(n2);
      var id = ctx.getImageData(0, 0, w2, h2), d = id.data, ii = 0, x, y;
      for (y = 0; y < h2; y++) for (x = 0; x < w2; x++) {
        var v = (fb2(x * 0.02, y * 0.02, 3) - 0.5) * 36 + (((x % 4 < 2) ^ (y % 4 < 2)) ? 4 : -3);
        d[ii] += v; d[ii + 1] += v; d[ii + 2] += v; ii += 4;
      }
      ctx.putImageData(id, 0, 0);
      ctx.strokeStyle = acc; ctx.lineWidth = 10; ctx.strokeRect(24, 24, w2 - 48, h2 - 96);
      ctx.strokeStyle = acc2; ctx.lineWidth = 2; ctx.strokeRect(40, 40, w2 - 80, h2 - 128);
      ctx.save(); ctx.translate(w2 / 2, 270);
      ctx.fillStyle = acc;
      ctx.beginPath();
      ctx.moveTo(0, -130); ctx.lineTo(110, -80); ctx.lineTo(110, 40); ctx.lineTo(0, 130);
      ctx.lineTo(-110, 40); ctx.lineTo(-110, -80); ctx.closePath(); ctx.fill();
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.moveTo(0, -108); ctx.lineTo(90, -64); ctx.lineTo(90, 30); ctx.lineTo(0, 106);
      ctx.lineTo(-90, 30); ctx.lineTo(-90, -64); ctx.closePath(); ctx.fill();
      ctx.fillStyle = acc2;
      if (blue) {
        ctx.beginPath();
        ctx.moveTo(14, -84); ctx.lineTo(-44, 10); ctx.lineTo(-6, 10); ctx.lineTo(-16, 84);
        ctx.lineTo(46, -16); ctx.lineTo(6, -16); ctx.closePath(); ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -86); ctx.lineTo(34, -20); ctx.lineTo(18, -20); ctx.lineTo(48, 30);
        ctx.lineTo(24, 30); ctx.lineTo(40, 84); ctx.lineTo(0, 40); ctx.lineTo(-40, 84);
        ctx.lineTo(-24, 30); ctx.lineTo(-48, 30); ctx.lineTo(-18, -20); ctx.lineTo(-34, -20);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = acc2;
      ctx.font = '700 84px "Russo One",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(blue ? 'СТАЛЬ' : 'ПЛАМЯ', w2 / 2, 540);
      ctx.fillStyle = 'rgba(233,229,218,.75)';
      ctx.font = '700 26px "JetBrains Mono",monospace';
      ctx.fillText('ОТРЯД · СЕКТОР-9', w2 / 2, 590);
      ctx.fillStyle = acc;
      for (var x3 = 60; x3 < w2 - 60; x3 += 44) {
        ctx.beginPath(); ctx.moveTo(x3, 640); ctx.lineTo(x3 + 22, 640); ctx.lineTo(x3 + 11, 662); ctx.closePath(); ctx.fill();
      }
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.moveTo(0, h2);
      var xx = 0;
      while (xx < w2) { var step = 24 + r() * 40; ctx.lineTo(xx, h2 - 14 - r() * 36); xx += step; }
      ctx.lineTo(w2, h2); ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      var t = new THREE.CanvasTexture(c);
      if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    TEX.bannerBlue = banner('blue'); TEX.bannerRed = banner('red');
    // эмблема на полу платформы
    var ec = C(512), ex = ec.getContext('2d');
    ex.strokeStyle = 'rgba(255,179,71,.8)'; ex.lineWidth = 10;
    ex.beginPath();
    for (j = 0; j <= 8; j++) {
      var a5 = j / 8 * Math.PI * 2 + Math.PI / 8;
      var px4 = 256 + Math.cos(a5) * 225, py4 = 256 + Math.sin(a5) * 225;
      if (j) ex.lineTo(px4, py4); else ex.moveTo(px4, py4);
    }
    ex.closePath(); ex.stroke();
    ex.strokeStyle = 'rgba(255,179,71,.4)'; ex.lineWidth = 3;
    ex.beginPath();
    for (j = 0; j <= 8; j++) {
      var a6 = j / 8 * Math.PI * 2 + Math.PI / 8;
      var px5 = 256 + Math.cos(a6) * 195, py5 = 256 + Math.sin(a6) * 195;
      if (j) ex.lineTo(px5, py5); else ex.moveTo(px5, py5);
    }
    ex.closePath(); ex.stroke();
    ex.fillStyle = 'rgba(255,214,150,.85)';
    ex.font = '700 92px "Russo One",sans-serif';
    ex.textAlign = 'center'; ex.textBaseline = 'middle';
    ex.fillText('СЕКТОР-9', 256, 236);
    ex.fillStyle = 'rgba(233,229,218,.55)';
    ex.font = '700 30px "JetBrains Mono",monospace';
    ex.fillText('ЦЕНТРАЛЬНАЯ ПЛАТФОРМА', 256, 310);
    ex.globalCompositeOperation = 'destination-out';
    for (i = 0; i < 160; i++) ex.fillRect(r() * 512, r() * 512, 2 + r() * 8, 2 + r() * 8);
    ex.globalCompositeOperation = 'source-over';
    TEX.emblem = new THREE.CanvasTexture(ec);
    if (THREE.SRGBColorSpace) TEX.emblem.colorSpace = THREE.SRGBColorSpace;
    // декали зон спавна
    var zone = function (blue) {
      var c = document.createElement('canvas'); c.width = 512; c.height = 320;
      var ctx = c.getContext('2d');
      var col = blue ? 'rgba(77,163,255,' : 'rgba(255,90,60,';
      ctx.strokeStyle = col + '.85)'; ctx.lineWidth = 12; ctx.strokeRect(10, 10, 492, 300);
      ctx.fillStyle = col + '.22)'; ctx.fillRect(10, 10, 492, 300);
      for (var x = 30; x < 480; x += 64) {
        ctx.fillStyle = col + '.7)';
        ctx.beginPath(); ctx.moveTo(x, 270); ctx.lineTo(x + 30, 270); ctx.lineTo(x + 15, 240); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = col + '.9)';
      ctx.font = '700 74px "Russo One",sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(blue ? 'БАЗА · СТАЛЬ' : 'БАЗА · ПЛАМЯ', 256, 140);
      ctx.font = '700 24px "JetBrains Mono",monospace';
      ctx.fillStyle = 'rgba(233,229,218,.6)';
      ctx.fillText('ТОЧКА ВОЗРОЖДЕНИЯ', 256, 190);
      ctx.globalCompositeOperation = 'destination-out';
      var rr = rng(blue ? 1 : 2);
      for (var i2 = 0; i2 < 120; i2++) ctx.fillRect(rr() * 512, rr() * 320, 2 + rr() * 9, 2 + rr() * 9);
      ctx.globalCompositeOperation = 'source-over';
      var t = new THREE.CanvasTexture(c);
      if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    TEX.zoneBlue = zone(true); TEX.zoneRed = zone(false);
    // трафарет на стене «09 ЗАКРЫТЫЙ ПЕРИМЕТР»
    var wc = C(512), wx = wc.getContext('2d');
    wx.fillStyle = 'rgba(255,179,71,.6)';
    wx.font = '700 230px "Russo One",sans-serif'; wx.textAlign = 'center';
    wx.fillText('09', 256, 270);
    wx.fillStyle = 'rgba(233,229,218,.45)';
    wx.font = '700 34px "JetBrains Mono",monospace';
    wx.fillText('ЗАКРЫТЫЙ ПЕРИМЕТР', 256, 360);
    wx.globalCompositeOperation = 'destination-out';
    for (i = 0; i < 200; i++) wx.fillRect(r() * 512, r() * 512, 2 + r() * 10, 2 + r() * 7);
    wx.globalCompositeOperation = 'source-over';
    TEX.wallStencil = new THREE.CanvasTexture(wc);
    if (THREE.SRGBColorSpace) TEX.wallStencil.colorSpace = THREE.SRGBColorSpace;
  }

  /* ---------- материалы арены (порт MAT) ---------- */
  function buildMaterials() {
    MAT = {
      floor: stdMat(TEX.floor, { normalScale: 1.1 }),
      wall: stdMat(TEX.wall, { normalScale: 1 }),
      wallSide: stdMat(cloneTexSet(TEX.wall, 7.3, 1), { normalScale: 1 }),
      brick: stdMat(TEX.brick, { normalScale: 1.2 }),
      metal: stdMat(TEX.metal, { metalness: 0.6, normalScale: 1 }),
      hazard: stdMat(TEX.hazard, { metalness: 0.35, normalScale: 1 }),
      tread: stdMat(TEX.tread, { metalness: 0.65, normalScale: 1.2 }),
      treadStep: stdMat(cloneTexSet(TEX.tread, 1.7, 0.7), { metalness: 0.65, normalScale: 1.2 }),
      treadRoof: stdMat(cloneTexSet(TEX.tread, 7, 5), { metalness: 0.65, normalScale: 1.2 }),
      crate: stdMat(TEX.crate, { normalScale: 1.1 }),
      gunwood: stdMat(TEX.gunwood, { normalScale: 0.8 }),
      gunmetal: stdMat(TEX.gunmetal, { metalness: 0.75, normalScale: 0.7 }),
      fabric: stdMat(TEX.fabric),
      vest: stdMat(TEX.vest),
      concreteSmall: stdMat(cloneTexSet(TEX.wall, 0.35, 1)),
      platSide: stdMat(cloneTexSet(TEX.wall, 2.6, 0.28)),
      amberPaint: new THREE.MeshStandardMaterial({ color: 0xd99a1f, roughness: 0.55, metalness: 0.2 }),
      darkSteel: new THREE.MeshStandardMaterial({ color: 0x232830, roughness: 0.5, metalness: 0.7 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xc8a24a, roughness: 0.3, metalness: 0.9 })
    };
    MAT.emis = function (color, i) {
      return new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: color, emissiveIntensity: i || 2.4, roughness: 0.4 });
    };
    MAT.gBox = function (w, h, d) {
      var k = 'b' + w + ',' + h + ',' + d;
      if (!MAT._geo) MAT._geo = {};
      return MAT._geo[k] || (MAT._geo[k] = new THREE.BoxGeometry(w, h, d));
    };
    MAT.gCyl = function (r, h, s) {
      var k = 'c' + r + ',' + h + ',' + (s || 10);
      if (!MAT._geo) MAT._geo = {};
      return MAT._geo[k] || (MAT._geo[k] = new THREE.CylinderGeometry(r, r, h, s || 10));
    };
    MAT.gPlane = function (w, h) {
      var k = 'p' + w + ',' + h;
      if (!MAT._geo) MAT._geo = {};
      return MAT._geo[k] || (MAT._geo[k] = new THREE.PlaneGeometry(w, h));
    };
  }

  function generate() {
    if (TEX.floor) return;
    try { maxAniso = Math.min(8, window.__brixRendererCapabilities || 4); } catch (e) {}
    console.log('[BrixArenaTex] генерация текстур СЕКТОР-9…');
    genFloor(); genWall(); genBrick(); genMetal(); genHazard(); genTread();
    genCrate(); genGunwood(); genGunmetal(); genFabric(); genDecals();
    buildMaterials();
    console.log('[BrixArenaTex] готово: 11 текстур + декали');
  }

  return {
    generate: generate,
    get TEX() { return TEX; },
    get MAT() { return MAT; },
    stdMat: stdMat,
    cloneTexSet: cloneTexSet
  };
})();
