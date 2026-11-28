// ============================================================
//  brix • js/game/city.js                                v0.7.0
//  ЛОКАЦИЯ «МИРНЫЙ» — ТОЧНЫЙ ПЕРЕНОС города из файла владельца
//  («МИРНЫЙ — закрытая зона», Qwen_html_20261127_ms6yfd5pk.html):
//  бетонная стена с колючей проволокой и воротами RESTRICTED AREA,
//  площадь, асфальтовые дороги с разметкой и зеброй, ж/д тупик,
//  7 домов с процедурными фасадами, АВТОБАЗА №2 с ангарными
//  воротами, магазин «ПРОДУКТЫ», павильон «АВТОМАТЫ · 24Ч»,
//  вышка, машины, столбы с провисшими проводами, бочки, ящики,
//  шины, мусор, руины, сухие деревья и кусты.
//
//  ✅ ИЗМЕНЕНИЯ ПО ПРОСЬБЕ ВЛАДЕЛЬЦА (всё остальное — 1:1):
//   1) ЛЕСТНИЦА НА КРЫШУ автобазы УДАЛЕНА (была с восточной стороны);
//   2) ЗЕЛЁНАЯ СВЕТЯЩАЯСЯ ДВЕРЬ магазина заменена на ОБЫЧНУЮ
//      стальную (без неона и зелёного света);
//   3) АВТОМАТЫ РАБОТАЮТ: подошёл + F → ОКНО МАГАЗИНА
//      · автомат «ОРУЖИЕ · 24Ч» — стволы (калаш, томпсон, дробовик,
//        револьвер, револьвер-карабин 3×, булава, С4);
//      · автомат «ТЫКВЫ · ШПРИЦЫ · ПАТРОНЫ» — тыквы, шприцы и
//        патроны (пистолетные, калаш, дробовик);
//      · третий автомат мёртвый (как в оригинале, декорация);
//      оплата — МЕТАЛЛОЛОМ (scrap) из инвентаря;
//   4) город ОДИН на карту, место — только в ЛЕСНОМ (умеренном)
//      биоме (cityPad в terrain.js, 1:1 с server.js brixCityPad).
//
//  ФИЗИКА (контракт как у BrixBarn/BrixLighthouse):
//   - AABB-коллайдеры → controls.addBoxColliders (стены/дома/
//     машины/пропсы не пропускают, на низкое можно ЗАЙТИ сверху);
//   - floorAt(x, z, feetY) — верх ящиков/паллет/барьеров: по всему
//     этому можно ХОДИТЬ;
//   - поворот площадки ТОЛЬКО кратен 90° — AABB остаются осевыми.
//
//  Деревья/руды/кактусы/трава/кусты ПОД ГОРОДОМ НЕ СТАВЯТСЯ:
//  world.js спрашивает BrixCity.blocks(x, z).
//  КАРТА (M): иконку города рисует minimenu.js по BrixCity.list().
// ============================================================
window.BrixCity = (function () {
  'use strict';

  var TAU = Math.PI * 2;
  function clampN(x, a, b) { return Math.min(b, Math.max(a, x)); }

  function rngFrom(seed) {
    var a = (seed | 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* сид карты → смещение генераторов (тот же множитель, что в world.js) */
  function seedOff() { return ((window.BRIX_TERRAIN_SEED || 0) | 0) * 7919; }

  /* ============================================================
     СЛИЯНИЕ ГЕОМЕТРИЙ (как в barn.js — без BufferGeometryUtils)
     ============================================================ */
  function mergeGeos(list) {
    var vcount = 0, icount = 0, i;
    for (i = 0; i < list.length; i++) {
      vcount += list[i].attributes.position.count;
      /* IcosahedronGeometry (PolyhedronGeometry) — БЕЗ индекса */
      icount += list[i].index ? list[i].index.count : list[i].attributes.position.count;
    }
    var pos = new Float32Array(vcount * 3);
    var nor = new Float32Array(vcount * 3);
    var uv = new Float32Array(vcount * 2);
    var idx = vcount > 65535 ? new Uint32Array(icount) : new Uint16Array(icount);
    var vo = 0, io = 0;
    for (i = 0; i < list.length; i++) {
      var g = list[i];
      pos.set(g.attributes.position.array, vo * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, vo * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
      var gi;
      if (g.index) gi = g.index.array;
      else {                       /* неиндексированная — порядковая */
        gi = new Uint32Array(g.attributes.position.count);
        for (var q = 0; q < gi.length; q++) gi[q] = q;
      }
      for (var k = 0; k < gi.length; k++) idx[io + k] = gi[k] + vo;
      io += gi.length; vo += g.attributes.position.count;
      g.dispose();
    }
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }

  /* ============================================================
     ТЕКСТУРЫ (canvas) — порт 1:1 из файла города
     ============================================================ */
  function cv(w, h, draw) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h); return c;
  }
  function mkTex(c, rx, ry) {
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (rx) t.repeat.set(rx, ry || rx);
    if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  /* общий ГПСЧ текстур — тот же сид (20261128), что в файле города */
  var _trnd = rngFrom(20261128);
  function R() { return _trnd(); }
  function rr(a, b) { return a + R() * (b - a); }
  function ri(a, b) { return Math.floor(rr(a, b + 1)); }

  function grime(ctx, w, h, n, alpha, dark) {
    for (var i = 0; i < n; i++) {
      var x = R() * w, y = R() * h, r = rr(4, 40);
      ctx.save(); ctx.translate(x, y); ctx.scale(r, r * rr(.5, 1.6));
      var c = dark !== false
        ? 'rgba(30,24,18,' + (alpha * R()).toFixed(3) + ')'
        : 'rgba(230,222,205,' + (alpha * R()).toFixed(3) + ')';
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, 7); ctx.fill();
      ctx.restore();
    }
  }
  function cracks(ctx, w, h, n, col) {
    ctx.strokeStyle = col || 'rgba(25,20,15,.55)'; ctx.lineWidth = 1;
    for (var i = 0; i < n; i++) {
      var x = R() * w, y = R() * h; ctx.beginPath(); ctx.moveTo(x, y);
      var steps = ri(5, 14);
      for (var s = 0; s < steps; s++) { x += rr(-16, 16); y += rr(2, 20); ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }
  function streaks(ctx, w, h, n, col) {
    for (var i = 0; i < n; i++) {
      var x = R() * w, y = R() * h * .5, len = rr(20, h * .6), wd = rr(2, 7);
      var g = ctx.createLinearGradient(0, y, 0, y + len);
      g.addColorStop(0, col || 'rgba(40,30,20,.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, wd, len);
    }
  }
  var BRICKS = ['#8a5a42', '#7d4f3a', '#93644a', '#6f4634', '#9a6b50', '#835540'];
  function brickPattern(ctx, w, h, bw, bh) {
    for (var y = 0, row = 0; y < h; y += bh, row++)
      for (var x = (row % 2 ? -bw / 2 : 0); x < w; x += bw) {
        ctx.fillStyle = BRICKS[ri(0, 5)]; ctx.fillRect(x + 1, y + 1, bw - 2, bh - 2);
      }
  }
  function plasterWallCanvas(w, h) {
    return cv(w, h, function (ctx) {
      brickPattern(ctx, w, h, 26, 12);
      ctx.fillStyle = '#c9c2b2';
      for (var i = 0; i < 160; i++) {
        var x = R() * w, y = R() * h, r = rr(18, 70);
        ctx.save(); ctx.translate(x, y); ctx.scale(1, rr(.6, 1.4));
        ctx.globalAlpha = rr(.75, 1); ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1; grime(ctx, w, h, 90, .25); streaks(ctx, w, h, 26); cracks(ctx, w, h, 14);
    });
  }
  function brickWallCanvas(w, h) {
    return cv(w, h, function (ctx) {
      brickPattern(ctx, w, h, 26, 12); grime(ctx, w, h, 110, .35);
      streaks(ctx, w, h, 30); cracks(ctx, w, h, 10);
      ctx.fillStyle = 'rgba(180,170,150,.18)';
      for (var i = 0; i < 24; i++) ctx.fillRect(R() * w, R() * h, rr(20, 90), rr(10, 50));
    });
  }
  function rustMetalCanvas(w, h, base) {
    return cv(w, h, function (ctx) {
      ctx.fillStyle = base || '#7d8288'; ctx.fillRect(0, 0, w, h);
      for (var x = 0; x < w; x += 14) {
        var g = ctx.createLinearGradient(x, 0, x + 14, 0);
        g.addColorStop(0, 'rgba(255,255,255,.10)'); g.addColorStop(.5, 'rgba(0,0,0,.16)');
        g.addColorStop(1, 'rgba(255,255,255,.06)');
        ctx.fillStyle = g; ctx.fillRect(x, 0, 14, h);
      }
      for (var i = 0; i < 130; i++) {
        var x2 = R() * w, y = R() * h, r = rr(5, 34);
        ctx.save(); ctx.translate(x2, y); ctx.scale(1, rr(.5, 2));
        ctx.fillStyle = 'rgba(' + (120 + ri(0, 60)) + ',' + (55 + ri(0, 30)) + ',' +
          (25 + ri(0, 15)) + ',' + rr(.25, .8).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.restore();
      }
      streaks(ctx, w, h, 40, 'rgba(110,55,25,.4)'); grime(ctx, w, h, 50, .2);
      ctx.fillStyle = 'rgba(30,26,22,.5)';
      for (var y2 = 0; y2 < h; y2 += h / 4) ctx.fillRect(0, y2, w, 2);
    });
  }
  function facadeCanvas(floors, cols, style, w, h) {
    w = w || 512; h = h || 512;
    return cv(w, h, function (ctx) {
      var base = style === 'plaster' ? plasterWallCanvas(w, h)
        : style === 'brick' ? brickWallCanvas(w, h) : rustMetalCanvas(w, h, '#8b8f94');
      ctx.drawImage(base, 0, 0);
      var mx = w * .09, my = h * .08, gw = (w - mx * 2) / cols, gh = (h - my * 2) / floors,
        ww = gw * .56, wh = gh * .58;
      for (var f = 0; f < floors; f++) for (var c = 0; c < cols; c++) {
        var x = mx + c * gw + (gw - ww) / 2, y = my + f * gh + (gh - wh) / 2;
        ctx.fillStyle = '#3d3831'; ctx.fillRect(x - 4, y - 4, ww + 8, wh + 8);
        var fate = R();
        if (fate < .45) {
          ctx.fillStyle = '#0d0b09'; ctx.fillRect(x, y, ww, wh);
          ctx.fillStyle = 'rgba(140,160,175,.35)';
          for (var s = 0; s < 4; s++) {
            ctx.beginPath();
            var sx = x + R() * ww, sy = y + R() * wh;
            ctx.moveTo(sx, sy); ctx.lineTo(sx + rr(-14, 14), sy + rr(6, 20));
            ctx.lineTo(sx + rr(4, 16), sy + rr(-4, 8)); ctx.closePath(); ctx.fill();
          }
        } else if (fate < .67) {
          ctx.fillStyle = '#141210'; ctx.fillRect(x, y, ww, wh);
          var boards = ['#6e5638', '#7a6142', '#5f4a30'];
          for (var p = 0; p < 3; p++) {
            ctx.save(); ctx.translate(x + ww / 2, y + wh * (p + .5) / 3);
            ctx.rotate(rr(-.12, .12)); ctx.fillStyle = boards[p % 3];
            ctx.fillRect(-ww * .62, -wh * .09, ww * 1.24, wh * .18); ctx.restore();
          }
        } else {
          var g = ctx.createLinearGradient(x, y, x + ww, y + wh);
          g.addColorStop(0, '#2a3138'); g.addColorStop(.5, '#46545f'); g.addColorStop(1, '#1c2126');
          ctx.fillStyle = g; ctx.fillRect(x, y, ww, wh);
          ctx.strokeStyle = '#5a544a'; ctx.lineWidth = 3; ctx.beginPath();
          ctx.moveTo(x + ww / 2, y); ctx.lineTo(x + ww / 2, y + wh);
          ctx.moveTo(x, y + wh / 2); ctx.lineTo(x + ww, y + wh / 2); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(20,16,12,.5)'; ctx.fillRect(x - 6, y + wh + 4, ww + 12, 4);
        var sg = ctx.createLinearGradient(0, y + wh, 0, y + wh + gh * .5);
        sg.addColorStop(0, 'rgba(35,28,20,.4)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sg; ctx.fillRect(x, y + wh + 6, ww, gh * .5);
      }
      grime(ctx, w, h, 40, .2);
    });
  }
  function concreteCanvas(w, h, tone) {
    return cv(w, h, function (ctx) {
      ctx.fillStyle = tone || '#b3ada1'; ctx.fillRect(0, 0, w, h);
      grime(ctx, w, h, 120, .22); grime(ctx, w, h, 40, .12, false);
      ctx.strokeStyle = 'rgba(40,34,26,.4)'; ctx.lineWidth = 2;
      for (var x = 0; x <= w; x += w / 4) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (var y = 0; y <= h; y += h / 3) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      cracks(ctx, w, h, 16); streaks(ctx, w, h, 34);
      ctx.fillStyle = 'rgba(90,80,60,.25)';
      for (var i = 0; i < 30; i++) ctx.fillRect(R() * w, h - rr(4, h * .2), rr(6, 30), rr(4, h * .2));
    });
  }
  function asphaltCanvas(w, h) {
    return cv(w, h, function (ctx) {
      ctx.fillStyle = '#57544e'; ctx.fillRect(0, 0, w, h);
      for (var i = 0; i < 2600; i++) {
        var g = ri(60, 120);
        ctx.fillStyle = 'rgba(' + g + ',' + (g - 3) + ',' + (g - 8) + ',.4)';
        ctx.fillRect(R() * w, R() * h, 2, 2);
      }
      cracks(ctx, w, h, 22, 'rgba(20,18,15,.7)'); grime(ctx, w, h, 60, .25);
      for (var j = 0; j < 10; j++) {
        ctx.fillStyle = 'rgba(25,22,18,.6)';
        ctx.beginPath(); ctx.ellipse(R() * w, R() * h, rr(8, 26), rr(5, 16), R() * 3, 0, 7); ctx.fill();
      }
    });
  }
  function dirtCanvas(w, h) {
    return cv(w, h, function (ctx) {
      ctx.fillStyle = '#9a8a68'; ctx.fillRect(0, 0, w, h);
      for (var i = 0; i < 40; i++) {
        var x = R() * w, y = R() * h, r = rr(20, 80);
        ctx.save(); ctx.translate(x, y); ctx.scale(1, rr(.5, 1.4));
        var g = ctx.createRadialGradient(0, 0, 1, 0, 0, r);
        var dark = R() < .5;
        g.addColorStop(0, dark ? 'rgba(120,104,74,.35)' : 'rgba(180,166,128,.3)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.restore();
      }
      for (var j = 0; j < 2200; j++) {
        var g2 = ri(110, 160);
        ctx.fillStyle = 'rgba(' + g2 + ',' + (g2 - 12) + ',' + (g2 - 34) + ',.35)';
        ctx.fillRect(R() * w, R() * h, rr(1, 2.4), rr(1, 2.4));
      }
      grime(ctx, w, h, 60, .18); cracks(ctx, w, h, 8, 'rgba(70,58,38,.35)');
    });
  }
  function gravelCanvas(w, h) {
    return cv(w, h, function (ctx) {
      ctx.fillStyle = '#7c766b'; ctx.fillRect(0, 0, w, h);
      for (var i = 0; i < 3200; i++) {
        var g = ri(70, 150);
        ctx.fillStyle = 'rgba(' + g + ',' + (g - 6) + ',' + (g - 14) + ',.7)';
        ctx.beginPath(); ctx.arc(R() * w, R() * h, rr(1, 3.4), 0, 7); ctx.fill();
      }
      grime(ctx, w, h, 40, .2);
    });
  }
  function woodCanvas(w, h, tone) {
    return cv(w, h, function (ctx) {
      ctx.fillStyle = tone || '#7a5c3a'; ctx.fillRect(0, 0, w, h);
      for (var y = 0; y < h; y += h / 6) {
        ctx.fillStyle = 'rgba(0,0,0,' + rr(.1, .3).toFixed(2) + ')'; ctx.fillRect(0, y, w, 2);
        for (var i = 0; i < 26; i++) {
          ctx.strokeStyle = 'rgba(40,26,12,' + rr(.1, .35).toFixed(2) + ')'; ctx.lineWidth = 1;
          ctx.beginPath(); var yy = y + R() * (h / 6); ctx.moveTo(0, yy);
          ctx.bezierCurveTo(w * .3, yy + rr(-3, 3), w * .7, yy + rr(-3, 3), w, yy); ctx.stroke();
        }
      }
      grime(ctx, w, h, 40, .25);
    });
  }
  function tileWallCanvas(w, h) {
    return cv(w, h, function (ctx) {
      ctx.fillStyle = '#b8b2a2'; ctx.fillRect(0, 0, w, h);
      var th = h * .42;
      for (var y = h - th; y < h; y += 22) for (var x = 0; x < w; x += 22) {
        ctx.fillStyle = (x / 22 + y / 22) % 2 ? '#9fb8a8' : '#c8cfc0';
        ctx.fillRect(x + 1, y + 1, 20, 20);
      }
      ctx.fillStyle = 'rgba(40,36,28,.5)'; ctx.fillRect(0, h - th - 3, w, 3);
      grime(ctx, w, h, 90, .3); streaks(ctx, w, h, 26); cracks(ctx, w, h, 8);
      ctx.fillStyle = 'rgba(70,60,40,.3)';
      for (var i = 0; i < 20; i++) ctx.fillRect(R() * w, h - rr(4, 30), rr(6, 26), rr(4, 30));
    });
  }
  function restrictedSignCanvas() {
    return cv(512, 256, function (ctx, w, h) {
      ctx.fillStyle = '#ddd6c6'; ctx.fillRect(0, 0, w, h);
      var stripe = function (y) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, y, w, 26); ctx.clip();
        for (var x = -30; x < w + 30; x += 34) {
          ctx.fillStyle = (x / 34) % 2 ? '#b8352a' : '#ddd6c6';
          ctx.save(); ctx.translate(x, y); ctx.transform(1, 0, -.6, 1, 0, 0);
          ctx.fillRect(0, 0, 17, 26); ctx.restore();
        }
        ctx.restore();
      };
      stripe(0); stripe(h - 26);
      ctx.fillStyle = '#17130f'; ctx.textAlign = 'center';
      ctx.font = '700 74px Impact,"Arial Black",sans-serif';
      ctx.fillText('RESTRICTED', w / 2, h * .48); ctx.fillText('AREA', w / 2, h * .78);
      ctx.font = '20px Consolas,monospace'; ctx.fillStyle = '#8a2c22';
      ctx.fillText('· ЗОНА ЗАКРЫТА · СЕКТОР C-4 ·', w / 2, h * .92);
      grime(ctx, w, h, 70, .3); streaks(ctx, w, h, 24, 'rgba(120,60,25,.4)');
      ctx.strokeStyle = '#4a4238'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, w - 8, h - 8);
    });
  }
  function graffitiCanvas(text, col) {
    return cv(512, 220, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      ctx.font = 'italic 700 120px "Comic Sans MS","Segoe Script",cursive';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = col || '#16130f'; ctx.shadowBlur = 14; ctx.fillStyle = col || '#16130f';
      ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(-.04); ctx.fillText(text, 0, 0); ctx.restore();
      ctx.shadowBlur = 0;
      for (var i = 0; i < 10; i++) {
        var x = rr(w * .15, w * .85), y = h * .62;
        ctx.strokeStyle = col || '#16130f'; ctx.lineWidth = rr(1.5, 3.5);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rr(-3, 3), y + rr(12, 46)); ctx.stroke();
      }
    });
  }
  function productsSignCanvas() {
    return cv(256, 96, function (ctx, w, h) {
      ctx.fillStyle = '#3f5a38'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#cfc7ae'; ctx.lineWidth = 4; ctx.strokeRect(5, 5, w - 10, h - 10);
      ctx.fillStyle = '#e8e0c8'; ctx.font = '700 44px Impact,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('ПРОДУКТЫ', w / 2, h * .64);
      grime(ctx, w, h, 40, .35); streaks(ctx, w, h, 12, 'rgba(110,60,25,.4)');
    });
  }
  function vendingSignCanvas() {
    return cv(512, 110, function (ctx, w, h) {
      ctx.fillStyle = '#241a10'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#e0b341'; ctx.lineWidth = 5; ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.fillStyle = '#ffcf5e'; ctx.font = '700 56px Impact,sans-serif'; ctx.textAlign = 'center';
      ctx.shadowColor = '#ffb347'; ctx.shadowBlur = 18;
      ctx.fillText('АВТОМАТЫ · 24Ч', w / 2, h * .68); ctx.shadowBlur = 0;
      grime(ctx, w, h, 26, .25);
    });
  }
  function marqueeCanvas(text) {
    return cv(320, 110, function (ctx, w, h) {
      ctx.fillStyle = '#151312'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 6; ctx.strokeRect(2, 2, w - 4, h - 4);
      ctx.fillStyle = '#e8c22e'; ctx.font = 'italic 700 52px "Comic Sans MS","Segoe Script",cursive';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(-.035);
      ctx.shadowColor = 'rgba(232,194,46,.5)'; ctx.shadowBlur = 4;
      ctx.fillText(text, 0, 0); ctx.restore(); ctx.shadowBlur = 0;
      for (var i = 0; i < 6; i++) {
        var x = rr(w * .2, w * .8);
        ctx.strokeStyle = 'rgba(232,194,46,.6)'; ctx.lineWidth = rr(1, 2.4);
        ctx.beginPath(); ctx.moveTo(x, h * .68); ctx.lineTo(x + rr(-2, 2), h * .68 + rr(6, 18)); ctx.stroke();
      }
      grime(ctx, w, h, 18, .3);
    });
  }
  /* зелёный фосфорный экран автомата — port drawScreen */
  function drawScreen(ctx, w, h, title, state) {
    ctx.fillStyle = '#07230d'; ctx.fillRect(0, 0, w, h);
    var g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * .7);
    g.addColorStop(0, 'rgba(90,255,110,.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    for (var y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1.6);
    ctx.fillStyle = '#9dff7a'; ctx.textAlign = 'left';
    ctx.font = '700 22px Consolas,monospace';
    ctx.fillText('SHOP-O-MATIC', 14, 30);
    ctx.font = '18px Consolas,monospace';
    ctx.fillText('ТОВАР: ' + title, 14, 62);
    ctx.fillText(state === 'idle' ? 'ГОТОВ ►' : 'ВЫДАЧА...', 14, 90);
    ctx.fillStyle = state === 'idle' ? '#c4ffae' : '#ffe08a';
    ctx.fillText(state === 'idle' ? '[F] КУПИТЬ' : 'ПОДОЖДИ', 14, 118);
    ctx.fillStyle = '#9dff7a';
    for (var i = 0; i < 8; i++) ctx.fillRect(14 + i * 14, 140, 8, 6 * (1 + ((i * 7) % 4)));
    ctx.strokeStyle = 'rgba(157,255,122,.5)'; ctx.lineWidth = 3; ctx.strokeRect(4, 4, w - 8, h - 8);
  }
  function scriptDecalCanvas() {
    return cv(256, 80, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(235,232,222,.9)';
      ctx.font = 'italic 700 40px "Brush Script MT","Segoe Script",cursive';
      ctx.textAlign = 'center'; ctx.fillText("Refreshin'", w / 2, h * .55);
      ctx.font = '16px Consolas,monospace'; ctx.fillText('SHOP-O-MATIC', w / 2, h * .85);
    });
  }
  function depotSignCanvas() {
    return cv(640, 120, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(232,226,208,.82)';
      ctx.font = '700 78px Impact,"Arial Black",sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('АВТОБАЗА №2', w / 2, h * .62);
      ctx.font = '26px Consolas,monospace'; ctx.fillStyle = 'rgba(232,226,208,.6)';
      ctx.fillText('РЕМЗОНА · СКЛАД · СЕКТОР C-4', w / 2, h * .92);
      ctx.globalCompositeOperation = 'destination-out';
      for (var i = 0; i < 160; i++) ctx.fillRect(R() * w, R() * h, ri(2, 10), ri(1, 5));
      ctx.globalCompositeOperation = 'source-over';
    });
  }
  function posterCanvas(title, lines, bg, fg) {
    return cv(256, 360, function (ctx, w, h) {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = fg; ctx.textAlign = 'center';
      ctx.font = '700 44px Impact,sans-serif'; ctx.fillText(title, w / 2, h * .2);
      ctx.font = '22px Consolas,monospace';
      for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], w / 2, h * .38 + i * 34);
      ctx.strokeStyle = fg; ctx.lineWidth = 3; ctx.strokeRect(8, 8, w - 16, h - 16);
      grime(ctx, w, h, 50, .35); streaks(ctx, w, h, 14);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.moveTo(w, h); ctx.lineTo(w - rr(20, 60), h); ctx.lineTo(w, h - rr(20, 60));
      ctx.closePath(); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
    });
  }
  function roadLineCanvas() {
    return cv(128, 32, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h); ctx.fillStyle = 'rgba(220,214,190,.65)'; ctx.fillRect(6, 10, 74, 12);
      for (var i = 0; i < 40; i++) ctx.clearRect(R() * w, R() * h, ri(2, 7), ri(2, 5));
    });
  }
  function crosswalkCanvas() {
    return cv(256, 128, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      for (var x = 8; x < w; x += 42) { ctx.fillStyle = 'rgba(215,208,185,.5)'; ctx.fillRect(x, 6, 26, h - 12); }
      for (var i = 0; i < 120; i++) ctx.clearRect(R() * w, R() * h, ri(2, 9), ri(2, 7));
    });
  }
  function roadSignCanvas() {
    return cv(256, 96, function (ctx, w, h) {
      ctx.fillStyle = '#2e5a3a'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#e8e0c8'; ctx.lineWidth = 4; ctx.strokeRect(5, 5, w - 10, h - 10);
      ctx.fillStyle = '#e8e0c8'; ctx.font = '700 40px Impact,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('МИРНЫЙ →', w / 2, h * .66);
      grime(ctx, w, h, 30, .35);
    });
  }
  function garageDoorCanvas() {
    return cv(256, 256, function (ctx, w, h) {
      ctx.fillStyle = '#7a6a58'; ctx.fillRect(0, 0, w, h);
      for (var y = 0; y < h; y += 22) {
        var g = ctx.createLinearGradient(0, y, 0, y + 22);
        g.addColorStop(0, 'rgba(255,255,255,.14)'); g.addColorStop(.5, 'rgba(0,0,0,.28)');
        g.addColorStop(1, 'rgba(255,255,255,.08)'); ctx.fillStyle = g; ctx.fillRect(0, y, w, 22);
        ctx.fillStyle = 'rgba(20,16,12,.5)'; ctx.fillRect(0, y + 20, w, 2);
      }
      for (var i = 0; i < 90; i++) {
        var x = R() * w, y2 = R() * h, r = rr(4, 22);
        ctx.save(); ctx.translate(x, y2); ctx.scale(1, rr(.6, 2));
        ctx.fillStyle = 'rgba(' + (120 + ri(0, 50)) + ',' + (55 + ri(0, 25)) + ',25,' + rr(.25, .7).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.restore();
      }
      streaks(ctx, w, h, 30, 'rgba(110,55,25,.4)'); grime(ctx, w, h, 40, .25);
    });
  }
  function bushCanvas() {
    return cv(160, 160, function (ctx) {
      ctx.clearRect(0, 0, 160, 160);
      var branch = function (x, y, ang, len, depth) {
        if (depth <= 0 || len < 4) return;
        var nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
        ctx.strokeStyle = 'rgba(' + ri(120, 150) + ',' + ri(105, 128) + ',' + ri(75, 95) + ',.95)';
        ctx.lineWidth = depth * .8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
        if (depth <= 2) {
          ctx.fillStyle = 'rgba(' + ri(140, 170) + ',' + ri(140, 160) + ',' + ri(80, 105) + ',.8)';
          ctx.beginPath(); ctx.ellipse(nx, ny, rr(2, 4.5), rr(1.4, 3), ang, 0, 7); ctx.fill();
        }
        branch(nx, ny, ang + rr(.2, .7), len * rr(.6, .8), depth - 1);
        branch(nx, ny, ang - rr(.2, .7), len * rr(.6, .8), depth - 1);
      };
      for (var i = 0; i < 7; i++) branch(80 + rr(-14, 14), 158, -Math.PI / 2 + rr(-.5, .5), rr(26, 44), 5);
    });
  }

  /* ============================================================
     Построитель: примитивы копятся по материалам и сливаются
     ============================================================ */
  var _q, _m, _p, _s1, _e;
  function initTemps() {
    _q = new THREE.Quaternion(); _m = new THREE.Matrix4();
    _p = new THREE.Vector3(); _s1 = new THREE.Vector3(1, 1, 1); _e = new THREE.Euler();
  }
  function boxGeo(w, h, d, tile) {
    var g = new THREE.BoxGeometry(w, h, d);
    var uv = g.attributes.uv;
    var dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (var f = 0; f < 6; f++) for (var i = 0; i < 4; i++) {
      var k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tile);
    }
    return g;
  }
  function Builder() { this.parts = new Map(); this.solids = []; }
  Builder.prototype.push = function (g, mat) {
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
  };
  Builder.prototype.place = function (g, x, y, z, rx, ry, rz) {
    _e.set(rx || 0, ry || 0, rz || 0, 'YXZ'); _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s1); g.applyMatrix4(_m);
  };
  Builder.prototype.box = function (mat, w, h, d, x, y, z, o) {
    o = o || {};
    var g = boxGeo(w, h, d, o.tile || 2);
    this.place(g, x, y, z, o.rx, o.ry, o.rz);
    this.push(g, mat);
    if (o.solid) this.solidC(x, y, z, w, h, d, o.ry || 0);
    return g;
  };
  Builder.prototype.cyl = function (mat, rt, rb, h, seg, x, y, z, o) {
    o = o || {};
    var g = new THREE.CylinderGeometry(rt, rb, h, seg);
    this.place(g, x, y, z, o.rx, o.ry, o.rz); this.push(g, mat); return g;
  };
  Builder.prototype.sphere = function (mat, r, x, y, z) {
    var g = new THREE.SphereGeometry(r, 8, 6); this.place(g, x, y, z); this.push(g, mat);
  };
  Builder.prototype.solidC = function (x, y, z, w, h, d, ry) {
    if (Math.abs(Math.sin(ry || 0)) > 0.99) { var t = w; w = d; d = t; }
    this.solids.push({ minX: x - w / 2, maxX: x + w / 2, minY: y - h / 2, maxY: y + h / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  };
  /* плоский AABB от руки (порт solid(x,z,w,d) файла города: y0..y1) */
  Builder.prototype.solidR = function (x, z, w, d, y0, y1) {
    this.solids.push({ minX: x - w / 2, maxX: x + w / 2, minY: y0, maxY: y1, minZ: z - d / 2, maxZ: z + d / 2 });
  };
  /* готовый меш (материал-массив и пр.) — добавляется в сцену отдельно */
  Builder.prototype.attach = function (mesh) {
    if (!this.attached) this.attached = [];
    this.attached.push(mesh);
  };
  /* плоскость-полотно (вывески/афиши/граффити), повёрнутая ry.
     Возвращает ГОТОВУЮ ГЕОМЕТРИЮ (для b.push в общий слитый меш) */
  function makePlane(mat, w, h, x, y, z, ry) {
    var g = new THREE.PlaneGeometry(w, h);
    _e.set(0, ry || 0, 0, 'YXZ'); _q.setFromEuler(_e);
    _p.set(x, y, z); _s1.set(1, 1, 1); _m.compose(_p, _q, _s1);
    g.applyMatrix4(_m);
    return g;
  }

  /* ============================================================
     ГЕОМЕТРИЯ ГОРОДА — порт мира «МИРНЫЙ» (локальные координаты,
     0 = земля площадки). Всё как в файле владельца, КРОМЕ:
     лестницы на крышу автобазы НЕТ, зелёной двери НЕТ.
     Возвращает { group, solids, machines, geos, mats }
     ============================================================ */
  function buildCityGeometry(rng) {
    initTemps();
    var rn = function (a, b) { return a + rng() * (b - a); };
    var b = new Builder();
    var machines = [];   // {x, z, ry, name, kind, dead}

    var T = {
      concrete: mkTex(concreteCanvas(512, 512)),
      concreteDark: mkTex(concreteCanvas(256, 256, '#8f897d')),
      concretePlaza: mkTex(concreteCanvas(512, 512, '#b6b0a4'), 6, 4),
      concreteWall: mkTex(concreteCanvas(512, 256, '#a8a296'), 8, 1),
      plaster: mkTex(plasterWallCanvas(512, 512)),
      brick: mkTex(brickWallCanvas(512, 512)),
      rust: mkTex(rustMetalCanvas(256, 256)),
      rustOrange: mkTex(rustMetalCanvas(256, 256, '#a35a2c')),
      rustGreen: mkTex(rustMetalCanvas(256, 256, '#5c6b4a')),
      rustGrey: mkTex(rustMetalCanvas(256, 256, '#8b8f94'), 2, 1),
      rustGate: mkTex(rustMetalCanvas(256, 256, '#6e6a62')),
      gravel: mkTex(gravelCanvas(256, 256), 2, 2),
      wood: mkTex(woodCanvas(256, 256)),
      woodDark: mkTex(woodCanvas(256, 256, '#5d452c')),
      tile: mkTex(tileWallCanvas(512, 256), 2, 1),
      asphalt: mkTex(asphaltCanvas(512, 256), 10, 1),
      asphalt2: mkTex(asphaltCanvas(256, 512), 1, 6),
      dirtPath: mkTex(dirtCanvas(256, 256), 1, 8),
      dirtPath2: mkTex(dirtCanvas(256, 256), 1, 3),
      plazaFloor: mkTex(concreteCanvas(256, 256, '#8f8a7c'), 3, 2),
      restricted: mkTex(restrictedSignCanvas()),
      prodSign: mkTex(productsSignCanvas()),
      vendSign: mkTex(vendingSignCanvas()),
      depotSign: mkTex(depotSignCanvas()),
      roadLine: mkTex(roadLineCanvas(), 16, 1),
      crosswalk: mkTex(crosswalkCanvas()),
      roadSign: mkTex(roadSignCanvas()),
      garageDoor: mkTex(garageDoorCanvas()),
      scriptDecal: mkTex(scriptDecalCanvas()),
      posterDrink: mkTex(posterCanvas('ПЕЙТЕ', ['КОЛУ', 'ХОЛОДНУЮ', '15 КОП'], '#a83c30', '#f2ede0')),
      posterPrices: mkTex(posterCanvas('ЦЕНЫ', ['ПАТРОНЫ .. 15', 'ПИСТОЛЕТ .. 40', 'АПТЕЧКА .. 20'], '#d8d2c0', '#2a2620')),
      posterGlory: mkTex(posterCanvas('СЛАВА', ['ТРУДУ', '1961'], '#d8d2c0', '#8a2c22')),
      posterEvac: mkTex(posterCanvas('ОБЪЯВ-', ['ЛЕНИЕ', 'ЭВАКУАЦИЯ', 'ЗАВЕРШЕНА'], '#c8c2b0', '#2a2620')),
      grafRebels: mkTex(graffitiCanvas('Rebels')),
      grafMirny: mkTex(graffitiCanvas('МИРНЫЙ', '#7a2c20')),
      grafC4: mkTex(graffitiCanvas('C-4', '#2e5a9a')),
      graf24: mkTex(graffitiCanvas('24', '#2e5a9a'))
    };

    var M = {
      concrete: new THREE.MeshStandardMaterial({ map: T.concrete, roughness: .95 }),
      concreteDark: new THREE.MeshStandardMaterial({ map: T.concreteDark, roughness: .97 }),
      concretePlaza: new THREE.MeshStandardMaterial({ map: T.concretePlaza, roughness: .96 }),
      concreteWall: new THREE.MeshStandardMaterial({ map: T.concreteWall, roughness: .96 }),
      concreteFloor: new THREE.MeshStandardMaterial({ map: T.plazaFloor, roughness: .9 }),
      plaster: new THREE.MeshStandardMaterial({ map: T.plaster, roughness: .94 }),
      brick: new THREE.MeshStandardMaterial({ map: T.brick, roughness: .96 }),
      rust: new THREE.MeshStandardMaterial({ map: T.rust, roughness: .82, metalness: .25 }),
      rustOrange: new THREE.MeshStandardMaterial({ map: T.rustOrange, roughness: .85, metalness: .2 }),
      rustGreen: new THREE.MeshStandardMaterial({ map: T.rustGreen, roughness: .85, metalness: .2 }),
      rustGrey: new THREE.MeshStandardMaterial({ map: T.rustGrey, roughness: .85, metalness: .25 }),
      rustGate: new THREE.MeshStandardMaterial({ map: T.rustGate, roughness: .85, metalness: .3 }),
      gravel: new THREE.MeshStandardMaterial({ map: T.gravel, roughness: 1 }),
      wood: new THREE.MeshStandardMaterial({ map: T.wood, roughness: .92 }),
      woodDark: new THREE.MeshStandardMaterial({ map: T.woodDark, roughness: .95 }),
      tile: new THREE.MeshStandardMaterial({ map: T.tile, roughness: .9 }),
      asphalt: new THREE.MeshStandardMaterial({ map: T.asphalt, roughness: .98 }),
      asphalt2: new THREE.MeshStandardMaterial({ map: T.asphalt2, roughness: .98 }),
      dirtPath: new THREE.MeshStandardMaterial({ map: T.dirtPath, roughness: 1, transparent: true, opacity: .9 }),
      dirtPath2: new THREE.MeshStandardMaterial({ map: T.dirtPath2, roughness: 1, transparent: true, opacity: .9 }),
      darkMetal: new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: .7, metalness: .5 }),
      railMetal: new THREE.MeshStandardMaterial({ color: 0x6e5a48, roughness: .4, metalness: .85 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x1c242c, roughness: .25, metalness: .6 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x232120, roughness: .95 }),
      tarp: new THREE.MeshStandardMaterial({ map: T.rustGreen, roughness: .95 }),
      sandbag: new THREE.MeshStandardMaterial({ color: 0x9a8a64, roughness: 1 }),
      paper: new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 1, side: THREE.DoubleSide }),
      brickLoose: new THREE.MeshStandardMaterial({ color: 0x8a5a42, roughness: .96 }),
      trashBag: new THREE.MeshStandardMaterial({ color: 0x22261f, roughness: .55 }),
      bottle: new THREE.MeshStandardMaterial({ color: 0x3f6b3a, roughness: .2, metalness: .1 }),
      canRed: new THREE.MeshStandardMaterial({ color: 0xb8352a, roughness: .35, metalness: .6 }),
      coneOrange: new THREE.MeshStandardMaterial({ color: 0xd8642e, roughness: .8 }),
      hydrant: new THREE.MeshStandardMaterial({ color: 0xa83c30, roughness: .7, metalness: .3 }),
      garageDoor: new THREE.MeshStandardMaterial({ map: T.garageDoor, roughness: .85, metalness: .25 }),
      vendBlue: new THREE.MeshStandardMaterial({ map: mkTex(rustMetalCanvas(128, 256, '#2e6f8e')), roughness: .65, metalness: .3 }),
      vendWhite: new THREE.MeshStandardMaterial({ color: 0xd8d5cc, roughness: .6, metalness: .15 }),
      vendRust: new THREE.MeshStandardMaterial({ map: mkTex(rustMetalCanvas(128, 128, '#7a4a2a')), roughness: .85, metalness: .2 }),
      hose: new THREE.MeshStandardMaterial({ color: 0xd8b23c, roughness: .7 }),
      keypadDark: new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: .6 }),
      btnRed: new THREE.MeshStandardMaterial({ color: 0x8a2c22, emissive: 0xc8402e, emissiveIntensity: .35, roughness: .5 }),
      btnBlue: new THREE.MeshStandardMaterial({ color: 0x2e4a7a, emissive: 0x2e5a9a, emissiveIntensity: .35, roughness: .5 }),
      btnWhite: new THREE.MeshStandardMaterial({ color: 0xcfcabe, emissive: 0x8a8a80, emissiveIntensity: .2, roughness: .5 }),
      ammoBox: new THREE.MeshStandardMaterial({ color: 0x5c6b4a, roughness: .8 }),
      gunMetal: new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: .45, metalness: .7 }),
      medWhite: new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: .6 }),
      darkInner: new THREE.MeshStandardMaterial({ color: 0x0d0b09, roughness: 1 }),
      /* ✅ ОБЫЧНАЯ СТАЛЬНАЯ ДВЕРЬ (была зелёная светящаяся) */
      doorSteel: new THREE.MeshStandardMaterial({ color: 0x54514a, roughness: .8, metalness: .3 })
    };

    /* ---------- разметка-helper: плоский бокс-«полотно» ---------- */
    function flat(mat, w, d, x, y, z, opts) {
      opts = opts || {};
      return b.box(mat, w, .04, d, x, y, z, { tile: opts.tile });
    }

    /* ================= ПЛОЩАДЬ / ДОРОГИ (порт GROUND/ROADS) ================= */
    flat(M.concretePlaza, 56, 44, 0, .02, 0, { tile: 1 });            // plaza
    flat(M.asphalt, 122, 8, 0, .035, 30, { tile: 1 });                // road
    flat(M.asphalt2, 7, 66, -34, .03, 13, { tile: 1 });               // road2
    /* разметка + зебра — полоски без коллайдеров */
    b.box(new THREE.MeshBasicMaterial({ map: T.roadLine, transparent: true, depthWrite: false }),
      118, .05, .45, 0, .05, 30);
    b.box(new THREE.MeshBasicMaterial({ map: T.crosswalk, transparent: true, depthWrite: false }),
      4.4, .05, 7.6, 36, .05, 30, { ry: Math.PI / 2 });
    flat(M.dirtPath, 5, 40, 16, .028, 46, { tile: 1 });               // path к ж/д
    flat(M.dirtPath2, 3.4, 12, -46, .028, 35, { tile: 1 });           // path2
    for (var mi = 0; mi < 3; mi++) {                                   // люки
      var mh = [[-12, 30], [24, 30], [6, 10]][mi];
      b.cyl(M.darkMetal, .5, .5, .05, 18, mh[0], .045, mh[1]);
    }

    /* ================= СТЕНА / ВОРОТА / КОЛЮЧКА (порт WALLS) ================= */
    var WALL = { x0: -62, x1: 62, z0: -48, z1: 66, h: 6, t: .7 };
    var runs = [
      { x: 0, z: WALL.z0, w: 124, d: WALL.t },
      { x: (WALL.x0 + 10) / 2, z: WALL.z1, w: 72, d: WALL.t },
      { x: (22 + WALL.x1) / 2, z: WALL.z1, w: 40, d: WALL.t },
      { x: WALL.x0, z: (WALL.z0 + WALL.z1) / 2, w: WALL.t, d: 114 },
      { x: WALL.x1, z: (WALL.z0 + WALL.z1) / 2, w: WALL.t, d: 114 }
    ];
    for (var wi = 0; wi < runs.length; wi++) {
      var r = runs[wi];
      b.box(M.concreteWall, r.w, WALL.h, r.d, r.x, WALL.h / 2, r.z, { tile: 3 });
      b.box(M.concreteDark, r.w + .15, .25, r.d + .15, r.x, WALL.h + .12, r.z);
      b.solidR(r.x, r.z, Math.max(r.w, 1), Math.max(r.d, 1), 0, WALL.h + .25);
    }
    /* колючка: кронштейны + «струны» (тонкие длинные боксы) */
    var barbLines = [
      [WALL.x0, WALL.z0, WALL.x1, WALL.z0], [WALL.x0, WALL.z1, 10, WALL.z1],
      [22, WALL.z1, WALL.x1, WALL.z1], [WALL.x0, WALL.z0, WALL.x0, WALL.z1],
      [WALL.x1, WALL.z0, WALL.x1, WALL.z1]
    ];
    for (var bl = 0; bl < barbLines.length; bl++) {
      var L4 = barbLines[bl];
      var len4 = Math.hypot(L4[2] - L4[0], L4[3] - L4[1]);
      var cx4 = (L4[0] + L4[2]) / 2, cz4 = (L4[1] + L4[3]) / 2;
      var ry4 = Math.abs(L4[2] - L4[0]) < 1 ? Math.PI / 2 : 0;
      b.box(M.darkMetal, .06, .85, .06, cx4, 6.1, cz4);   // стойки через ~3 м упростим: сплошная лента
      b.box(M.darkMetal, ry4 ? .1 : len4, .08, ry4 ? len4 : .1, cx4, 6.55, cz4);
      b.box(M.darkMetal, ry4 ? .1 : len4, .08, ry4 ? len4 : .1, cx4, 6.35, cz4);
    }
    /* ворота: рама + 6 створок + таблички RESTRICTED с двух сторон */
    b.box(M.rust, .5, 7, .9, 10, 3.5, WALL.z1);
    b.box(M.rust, .5, 7, .9, 22, 3.5, WALL.z1);
    b.box(M.rust, 12.5, .6, .9, 16, 6.8, WALL.z1);
    for (var gi = 0; gi < 6; gi++)
      b.box(M.rustGate, 1.85, 5.6, .18, 11 + gi * 2, 2.9, WALL.z1);
    b.box(M.rustGate, 11.6, .35, .24, 16, 1.1, WALL.z1);
    b.box(M.rustGate, 11.6, .35, .24, 16, 4.6, WALL.z1);
    b.solidR(16, WALL.z1, 12.5, 1.2, 0, 7);
    var signMat = new THREE.MeshStandardMaterial({ map: T.restricted, roughness: .8 });
    b.push(makePlane(signMat, 5.6, 2.8, 16, 3.6, WALL.z1 - .55, Math.PI), signMat);
    b.push(makePlane(signMat, 5.6, 2.8, 16, 3.6, WALL.z1 + .55, 0), signMat);
    /* граффити на стенах */
    b.push(makePlane(new THREE.MeshBasicMaterial({ map: T.grafRebels, transparent: true, depthWrite: false }),
      5, 2.2, 2, 2.3, WALL.z1 - .42, Math.PI),
      new THREE.MeshBasicMaterial({ map: T.grafRebels, transparent: true, depthWrite: false }));
    b.push(makePlane(new THREE.MeshBasicMaterial({ map: T.grafMirny, transparent: true, depthWrite: false }),
      4.4, 1.9, -24, 2.1, WALL.z0 + .42, 0),
      new THREE.MeshBasicMaterial({ map: T.grafMirny, transparent: true, depthWrite: false }));
    b.push(makePlane(new THREE.MeshBasicMaterial({ map: T.grafC4, transparent: true, depthWrite: false }),
      3.4, 1.5, WALL.x1 - .42, 2.2, -10, -Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: T.grafC4, transparent: true, depthWrite: false }));
    /* мешки с песком (2 гряды, как в оригинале) */
    var sbSpots = [];
    for (var row = 0; row < 3; row++) for (var i5 = 0; i5 < 11 - row * 2; i5++)
      sbSpots.push([8 + row * .4 + i5 * .8, .18 + row * .34, 63.4 - row * .1, rr(-.2, .2)]);
    for (var row2 = 0; row2 < 2; row2++) for (var i6 = 0; i6 < 8; i6++)
      sbSpots.push([48 + i6 * .8, .18 + row2 * .34, -44 + row2 * .1, rr(-.2, .2)]);
    for (var sbi = 0; sbi < sbSpots.length; sbi++) {
      var sb = sbSpots[sbi];
      b.box(M.sandbag, 1.05, .38, .62, sb[0], sb[1] + .09, sb[2], { ry: sb[3] });
    }
    b.solidR(12, 63.3, 9.5, 1.2, 0, 1.1);
    b.solidR(51, -44, 7, 1, 0, .8);

    /* ================= Ж/Д ТУПИК (порт RAILWAY) ================= */
    b.box(M.gravel, 4.2, .22, 46, 16, .11, 44, { tile: 4 });
    b.box(M.railMetal, .14, .18, 46, 16 - .75, .32, 44);
    b.box(M.railMetal, .14, .18, 46, 16 + .75, .32, 44);
    for (var sl = 0; sl < 62; sl++)
      b.box(M.woodDark, 2.4, .12, .26, 16 + rr(-.04, .04), .24, 22 + sl * .72);
    b.box(M.woodDark, 2.2, .3, .3, 16, .7, 22.2);
    b.box(M.woodDark, .3, .9, .3, 15.2, .45, 22.4);
    b.box(M.woodDark, .3, .9, .3, 16.8, .45, 22.4);
    b.solidR(16, 22.3, 2.6, .8, 0, 1);

    /* ================= ДОМА (порт BUILDINGS — фасады 1:1) ================= */
    /* корпус дома с материалом-массивом (6 граней) + крошба + дверь+крыльцо */
    function building(x, z, w, d, h, floors, cols, style, ry, ruinTop, balconies) {
      var frontTex = mkTex(facadeCanvas(floors, cols, style));
      var sideTex = mkTex(facadeCanvas(floors, Math.max(2, Math.round(cols * d / w)), style));
      var roofMat = new THREE.MeshStandardMaterial({ map: mkTex(gravelCanvas(256, 256), 2, 2), roughness: 1 });
      var frontMat = new THREE.MeshStandardMaterial({ map: frontTex, roughness: .94 });
      var sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness: .94 });
      var bodyMats = [sideMat, sideMat, roofMat, M.concreteDark, frontMat, frontMat];
      var g = new THREE.BoxGeometry(w, h, d);
      var mesh = new THREE.Mesh(g, bodyMats);
      mesh.position.set(x, h / 2, z);
      if (ry) mesh.rotation.y = ry;
      mesh.castShadow = true; mesh.receiveShadow = true;
      b.attach(mesh);
      /* крошба верха + дверь + крыльцо — слитая деталь (plaster/brick) */
      var detMat = style === 'plaster' ? M.plaster : (style === 'brick' ? M.brick : M.rustGrey);
      var details = [];
      function det(geo, dx, dy, dz, rxx, ryy, rzz) {
        _e.set(rxx || 0, ryy || 0, rzz || 0, 'YXZ'); _q.setFromEuler(_e);
        _p.set(dx, dy, dz); _s1.set(1, 1, 1); _m.compose(_p, _q, _s1);
        geo.applyMatrix4(_m); details.push(geo);
      }
      if (ruinTop) {
        var n = Math.floor(w / 1.4);
        for (var ii = 0; ii < n; ii++) {
          if (rng() < .4) continue;
          var bw = rr(.8, 1.6), bh = rr(.3, 1.6);
          det(new THREE.BoxGeometry(bw, bh, .4), -w / 2 + ii * (w / n) + bw / 2, h + bh / 2, -d / 2 + .2);
          if (rng() < .6) det(new THREE.BoxGeometry(bw, rr(.3, 1.2), .4), -w / 2 + ii * (w / n) + bw / 2, h + rr(.2, .8), d / 2 - .2);
        }
        for (var i8 = 0; i8 < Math.floor(d / 1.6); i8++) {
          if (rng() < .5) continue;
          det(new THREE.BoxGeometry(.4, rr(.3, 1.3), rr(.8, 1.5)), -w / 2 + .2, h + rr(.2, .7), -d / 2 + i8 * 1.6);
        }
        for (var i9 = 0; i9 < 5; i9++)
          det(new THREE.BoxGeometry(.16, .16, rr(2, 4)), rr(-w / 2 + 1, w / 2 - 1), h + rr(.1, .5), rr(-d / 2, d / 2), rr(-.3, .3), rr(0, 3), rr(-.2, .2));
      }
      det(new THREE.BoxGeometry(1.6, 2.4, .3), 0, 1.2, d / 2 + .05);
      det(new THREE.BoxGeometry(2.4, .18, 1), 0, .09, d / 2 + .5);
      det(new THREE.BoxGeometry(2.8, .18, 1.4), 0, 0, d / 2 + .7);
      var detMesh = new THREE.Mesh(mergeGeos(details), detMat);
      detMesh.castShadow = true;
      if (ry) { detMesh.position.set(x, 0, z); detMesh.rotation.y = ry; }
      b.attach(detMesh);
      /* балконы */
      if (balconies) {
        var bal = [];
        for (var f2 = 1; f2 < floors; f2++) for (var c2 = 0; c2 < cols; c2++) {
          if (rng() < .3) continue;
          var bx = -w / 2 + w * .09 + (c2 + .5) * (w * .82 / cols), by = f2 * (h / floors) + .15;
          bal.push(xfBox(1.7, .12, .9, bx, by, d / 2 + .45));
          bal.push(xfBox(1.7, .06, .06, bx, by + .95, d / 2 + .88));
          for (var rr2 = 0; rr2 < 5; rr2++) bal.push(xfBox(.05, .95, .05, bx - .8 + rr2 * .4, by + .5, d / 2 + .88));
        }
        var bm = new THREE.Mesh(mergeGeos(bal), M.concreteDark);
        bm.castShadow = true;
        if (ry) { bm.position.set(x, 0, z); bm.rotation.y = ry; }
        b.attach(bm);
      }
      var cs = Math.abs(Math.cos(ry || 0)), sn = Math.abs(Math.sin(ry || 0));
      b.solidR(x, z, w * cs + d * sn, w * sn + d * cs, 0, h);
    }
    function xfBox(w, h, d, x, y, z, rx, ry, rz) {
      _e.set(rx || 0, ry || 0, rz || 0, 'YXZ'); _q.setFromEuler(_e);
      _p.set(x, y, z); _s1.set(1, 1, 1); _m.compose(_p, _q, _s1);
      var g = new THREE.BoxGeometry(w, h, d); g.applyMatrix4(_m); return g;
    }

    building(-42, -14, 14, 10, 14, 4, 5, 'plaster', .05, true, true);
    /* обломок дома рядом */
    b.box(M.plaster, 4.5, 3.6, 3.6, -48, 1.8, -19, { ry: .3, rz: .12 });
    b.box(M.plaster, 2.6, 2.2, 2.6, -50, 1.1, -16, { ry: -.2, rz: -.1 });
    for (var bi2 = 0; bi2 < 6; bi2++)
      b.box(M.woodDark, .18, .18, rr(3, 5), -42 + rr(-5, 5), 14 + rr(0, 1), -14 + rr(-3, 3), rr(-.5, .5), rr(0, 3), rr(-.4, .4));
    b.solidR(-49, -18, 6, 5, 0, 3.8);
    building(-24, -38, 16, 9, 10, 3, 6, 'brick', -.04, true, false);
    building(6, -40, 9, 9, 13, 4, 3, 'plaster', .1, true, false);
    building(-10, 52, 12, 9, 8, 3, 4, 'plaster', .03, true, false);
    /* обрушенный угол */
    b.box(M.brick, 5, 4.4, 7, -16, 2.2, 52, { rz: -.06 });
    b.box(M.brick, 3.4, 2.2, 4.4, -19, 1.1, 49, { ry: .4, rz: .1 });
    b.box(M.brick, 1.8, 1.1, 1.8, -21, .55, 55);
    b.solidR(-17, 52, 8, 8, 0, 4.4);

    /* ---------- АВТОБАЗА №2 (порт AUTO DEPOT) ---------- */
    building(30, 44, 18, 12, 7.5, 2, 4, 'brick', 0, true, false);
    /* рамы + ангарные ворота (средние открыты) */
    for (var gxI = 0; gxI < 3; gxI++) {
      var gxx = [24, 30, 36][gxI];
      b.box(M.concreteDark, .3, 3.8, .4, gxx - 1.8, 1.9, 38.1);
      b.box(M.concreteDark, .3, 3.8, .4, gxx + 1.8, 1.9, 38.1);
      b.box(M.concreteDark, 3.9, .35, .4, gxx, 3.85, 38.1);
    }
    var doorsDef = [[24, 0], [30, .55], [36, 0]];
    for (var di = 0; di < 3; di++) {
      var dd = doorsDef[di], dh = 3.5 * (1 - dd[1]);
      b.box(M.garageDoor, 3.3, dh, .12, dd[0], 3.6 - dh / 2, 38.05);
      if (dd[1] > 0) {
        b.box(M.darkInner, 3.3, 3.5 * dd[1], .06, dd[0], 3.5 * dd[1] / 2, 38.02);
      }
    }
    b.box(M.rust, 18.4, .22, 2.4, 30, 4.35, 37.2);          // козырёк
    for (var brI = 0; brI < 4; brI++)
      b.box(M.darkMetal, .1, 1.4, .1, [22, 27, 33, 38][brI], 4.9, 36.6, { rx: .5 });
    b.push(makePlane(new THREE.MeshBasicMaterial({ map: T.depotSign, transparent: true, depthWrite: false }),
      11, 2.05, 30, 6.2, 37.94, Math.PI),
      new THREE.MeshBasicMaterial({ map: T.depotSign, transparent: true, depthWrite: false }));
    /* бак + вентшахты + антенна на крыше */
    b.box(M.rustOrange, 3, 1.8, 2, 26, 8.6, 46);
    b.box(M.rustOrange, .14, 1, .14, 24.8, 7.9, 45.2);
    b.box(M.rustOrange, .14, 1, .14, 27.2, 7.9, 45.2);
    b.box(M.rustOrange, .14, 1, .14, 24.8, 7.9, 46.8);
    b.box(M.rustOrange, .14, 1, .14, 27.2, 7.9, 46.8);
    b.cyl(M.rust, .22, .26, 1.6, 8, 33, 8.3, 42);
    b.cyl(M.rust, .18, .22, 1.2, 8, 35, 8.1, 46);
    b.cyl(M.rust, .04, .06, 4, 6, 37, 9.5, 48);
    b.box(M.rust, 1.2, .05, .05, 37, 11, 48);
    /* гофрированная пристройка */
    b.box(M.rustGrey, 4, 3.2, 5, 41, 1.6, 47, { tile: 2 });
    b.box(M.rust, 4.4, .14, 5.4, 41, 3.27, 47, { rz: .06 });
    b.solidR(41, 47, 4, 5, 0, 3.3);
    /* ✅ ЛЕСТНИЦА НА КРЫШУ УДАЛЕНА (была с восточной стороны) */
    /* двигатель + бочка перед воротами */
    b.box(M.darkMetal, .9, .6, .7, 27, .3, 35.4, { ry: .4 });
    b.cyl(M.darkMetal, .12, .12, .5, 8, 27, .75, 35.4, { rz: Math.PI / 2 });
    b.box(M.darkMetal, .3, .3, .3, 27.4, .7, 35.2);
    b.solidR(27, 35.4, 1.2, 1, 0, .9);

    /* ---------- МАГАЗИН «ПРОДУКТЫ» ---------- */
    building(50, 44, 10, 9, 6.5, 2, 3, 'brick', 0, false, false);
    /* навес-козырёк полосатый */
    b.box(M.rustGate, 6.4, .08, 2.2, 50, 3.9, 38.6, { rx: -Math.PI / 2 + .5 });
    /* ✅ ДВЕРЬ ОБЫЧНАЯ СТАЛЬНАЯ (зелёная светящаяся удалена) */
    b.box(M.doorSteel, 1.4, 2.4, .1, 50, 1.2, 39.43);
    b.box(M.darkMetal, .06, .3, .06, 50.5, 1.2, 39.36);     // ручка
    b.box(M.concreteDark, 1.8, .12, 1, 50, .06, 39.9);      // ступенька
    b.box(M.darkMetal, .08, .08, 1.3, 46.8, 5.1, 38.5);
    b.box(M.darkMetal, .08, .5, .08, 46.8, 4.85, 37.95);
    b.push(makePlane(new THREE.MeshStandardMaterial({ map: T.prodSign, roughness: .85, side: THREE.DoubleSide }),
      2.2, .85, 46.8, 4.63, 37.95, 0),
      new THREE.MeshStandardMaterial({ map: T.prodSign, roughness: .85, side: THREE.DoubleSide }));

    building(40, 58, 10, 7, 4.5, 1, 4, 'rust', .05, false, false);

    /* ================= ВЫШКА (порт WATCHTOWER) ================= */
    {
      var legs = [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]];
      for (var li = 0; li < 4; li++) b.box(M.rustOrange, .3, 9.5, .3, 52 + legs[li][0], 4.75, -40 + legs[li][1]);
      for (var lvl = 0; lvl < 3; lvl++) {
        var yy = 1.6 + lvl * 3;
        b.box(M.rustOrange, 3.5, .14, .14, 52, yy, -41.6);
        b.box(M.rustOrange, 3.5, .14, .14, 52, yy, -38.4);
        b.box(M.rustOrange, .14, .14, 3.5, 50.4, yy, -40);
        b.box(M.rustOrange, .14, .14, 3.5, 53.6, yy, -40);
        b.box(M.rustOrange, .1, 3.4, .1, 52, yy + 1.5, -41.6, { rz: .72 });
        b.box(M.rustOrange, .1, 3.4, .1, 52, yy + 1.5, -38.4, { rz: -.72 });
      }
      b.box(M.rustOrange, 4.4, .25, 4.4, 52, 9.5, -40);
      for (var ri3 = 0; ri3 < 16; ri3++) b.box(M.rustOrange, .5, .05, .05, 52, .6 + ri3 * .58, -38.15);
      b.box(M.rustOrange, .06, 9.6, .06, 51.75, 4.8, -38.15);
      b.box(M.rustOrange, .06, 9.6, .06, 52.25, 4.8, -38.15);
      var cabinMat = new THREE.MeshStandardMaterial({ map: mkTex(rustMetalCanvas(256, 256, '#8a8478')), roughness: .85, metalness: .2 });
      b.box(cabinMat, 3.6, 2.3, 3.6, 52, 10.8, -40);
      b.box(M.glass, 3.7, .8, 3.7, 52, 11.1, -40);
      var roofG = new THREE.ConeGeometry(3, 1.1, 4);
      _e.set(0, Math.PI / 4, 0, 'YXZ'); _q.setFromEuler(_e); _p.set(52, 12.5, -40);
      _s1.set(1, 1, 1); _m.compose(_p, _q, _s1); roofG.applyMatrix4(_m);
      b.push(roofG, M.rust);
      b.solidR(52, -40, 4, 4, 0, 9.5);
    }

    /* ================= МАШИНЫ (порт VEHICLES) ================= */
    function wheels(list, r, cx, cz, ry) {
      for (var wI = 0; wI < list.length; wI++) {
        var lx = list[wI][0], lz = list[wI][1];
        var wx = cx + lx * Math.cos(ry || 0) + lz * Math.sin(ry || 0);
        var wz = cz - lx * Math.sin(ry || 0) + lz * Math.cos(ry || 0);
        b.cyl(M.rubber, r, r, .3, 14, wx, r, wz, { rz: Math.PI / 2 });
      }
    }
    /* пикап с тентом (4,2) */
    b.box(M.rustOrange, 2.1, .9, 1.5, 4, .95, -.6, { ry: -.35, rz: .015 });
    b.box(M.rustOrange, 2.2, 1.5, 1.6, 4, 1.55, .9, { ry: -.35, rz: .015 });
    b.box(M.rustOrange, 2.25, .12, 1.7, 4, 2.36, .9, { ry: -.35, rz: .015 });
    b.box(M.rustOrange, 2.3, .35, 5.4, 4, .72, 3.4, { ry: -.35, rz: .015 });
    b.box(M.glass, 1.9, .75, .06, 4 - 1.9 * Math.sin(-.35) * -1 + .32, 1.75, 2.28, { rx: -.12, ry: -.35 });
    b.box(M.glass, .06, .7, 1.2, 2.93, 1.7, 2.1, { ry: -.35 });
    b.box(M.glass, .06, .7, 1.2, 5.07, 1.7, 2.1, { ry: -.35 });
    b.box(M.wood, 2.3, .14, 3.6, 4, .95, 5.9, { ry: -.35 });
    for (var bedI = 0; bedI < 4; bedI++) {
      b.box(M.wood, 2.3, .28, .08, 4, 1.15 + bedI * .32, 7.66, { ry: -.35 });
      b.box(M.wood, .08, .28, 3.6, 4 - 1.12 * Math.cos(-.35), 1.15 + bedI * .32, 5.9 + 1.12 * Math.sin(-.35), { ry: -.35 });
      b.box(M.wood, .08, .28, 3.6, 4 + 1.12 * Math.cos(-.35), 1.15 + bedI * .32, 5.9 - 1.12 * Math.sin(-.35), { ry: -.35 });
    }
    b.box(M.wood, 2.3, .9, .1, 4, 1.5, 4.12, { ry: -.35 });
    wheels([[-1.05, -.4], [1.05, -.4], [-1.05, 3.2], [1.05, 3.2], [-1.05, 4.6], [1.05, 4.6]], .5, 4, 2, -.35);
    b.box(M.darkMetal, 2.3, .25, .2, 4, .6, -1.45, { ry: -.35 });
    b.solidR(4, 2, 3.2, 7.6, 0, 2.4);
    /* грузовик с тентом (24,30) */
    b.box(M.rustGreen, 2.2, 1, 1.6, 24, 1.1, 27.3, { ry: Math.PI / 2 + .08 });
    b.box(M.rustGreen, 2.3, 1.5, 1.7, 24, 1.85, 28.8, { ry: Math.PI / 2 + .08 });
    b.box(M.rustGreen, 2.35, .12, 1.8, 24, 2.66, 28.8, { ry: Math.PI / 2 + .08 });
    b.box(M.rustGreen, 2.4, .4, 6, 24, .85, 30.6, { ry: Math.PI / 2 + .08 });
    b.box(M.glass, 2, .8, .06, 24, 2.05, 27.94, { rx: -.1, ry: Math.PI / 2 + .08 });
    /* тент-полуцилиндр */
    var tarpG = new THREE.CylinderGeometry(1.25, 1.25, 4.4, 12, 1, true, 0, Math.PI);
    _e.set(0, 0, Math.PI / 2, 'YXZ'); _q.setFromEuler(_e); _p.set(0, 0, 0);
    _s1.set(1, 1, 1); _m.compose(_p, _q, _s1); tarpG.applyMatrix4(_m);
    _e.set(0, Math.PI / 2 + .08, 0, 'YXZ'); _q.setFromEuler(_e); _p.set(24, 1.6, 30.9);
    _m.compose(_p, _q, _s1); tarpG.applyMatrix4(_m);
    b.push(tarpG, M.tarp);
    b.box(M.tarp, 2.4, 1.3, .06, 24, 1.65, 33.1, { ry: Math.PI / 2 + .08 });
    b.box(M.tarp, 2.4, 1.3, .06, 24, 1.65, 28.7, { ry: Math.PI / 2 + .08 });
    wheels([[-1.1, -2.5], [1.1, -2.5], [-1.1, .6], [1.1, .6], [-1.1, 2.2], [1.1, 2.2]], .55, 24, 30, Math.PI / 2 + .08);
    b.solidR(24, 30, 7.8, 3.2, 0, 2.7);
    /* легковушка (-20,46) */
    b.box(new THREE.MeshStandardMaterial({ map: mkTex(rustMetalCanvas(256, 256, '#7a3a2a')), roughness: .9, metalness: .2 }),
      1.8, .65, 4.2, -20, .62, 46, { ry: .7, rz: -.05 });
    b.box(new THREE.MeshStandardMaterial({ map: mkTex(rustMetalCanvas(256, 256, '#7a3a2a')), roughness: .9, metalness: .2 }),
      1.6, .6, 2, -20, 1.2, 46.2, { ry: .7, rz: -.05 });
    b.box(new THREE.MeshStandardMaterial({ map: mkTex(rustMetalCanvas(256, 256, '#7a3a2a')), roughness: .9, metalness: .2 }),
      1.65, .08, 2.1, -20, 1.53, 46.2, { ry: .7, rz: -.05 });
    b.box(M.glass, 1.5, .5, .05, -20.5, 1.2, 45.3, { rx: -.35, ry: .7 });
    b.box(M.glass, 1.5, .5, .05, -19.5, 1.2, 47.1, { rx: .35, ry: .7 });
    b.solidR(-20, 46, 2.6, 4.6, 0, 1.7);
    b.box(M.brickLoose, .5, .3, .5, -20.8, .15, 44.6);
    b.box(M.brickLoose, .5, .3, .5, -19.2, .15, 47.4);
    /* шасси с колёсами (52,-24) */
    b.box(M.rust, 2, .3, 5, 52, .5, -24, { ry: .3 });
    b.box(M.rust, 2.1, .8, 1.4, 52.6, 1, -26.2, { ry: .3 });
    b.cyl(M.rust, .45, .45, .25, 12, 51.2, .45, -25.6, { rz: Math.PI / 2 });
    b.cyl(M.rust, .45, .45, .25, 12, 53, .45, -22.4, { rz: Math.PI / 2 });
    b.solidR(52, -24, 3, 6, 0, 1.4);

    /* ================= СТОЛБЫ / ПРОВОДА / ФОНАРИ ================= */
    var poleXs = [-52, -30, -8, 14, 36, 56];
    for (var pi2 = 0; pi2 < poleXs.length; pi2++) {
      var px = poleXs[pi2];
      var lean = px === 14 ? .12 : rr(-.03, .03);
      b.box(M.woodDark, .26, 9, .26, px, 4.5, 35, { rz: lean, tile: 3 });
      b.box(M.woodDark, 2.2, .12, .12, px + lean * 8, 8.6, 35);
      b.box(M.woodDark, .08, .3, .08, px - 1 + lean * 8, 8.8, 35);
      b.box(M.woodDark, .08, .3, .08, px + 1 + lean * 8, 8.8, 35);
      b.solidR(px, 35, .5, .5, 0, 9);
      /* провисший провод к следующему столбу (тонкая лента) */
      if (pi2 < poleXs.length - 1) {
        var nx = poleXs[pi2 + 1];
        var segs = 8;
        for (var sg2 = 0; sg2 < segs; sg2++) {
          var t5 = (sg2 + .5) / segs;
          var wx5 = px + (nx - px) * t5;
          var sag = Math.sin(t5 * Math.PI) * 1.2;
          b.box(M.darkMetal, Math.abs(nx - px) / segs * 1.1, .05, .05, wx5, 8.9 - sag, 34.9);
          b.box(M.darkMetal, Math.abs(nx - px) / segs * 1.1, .05, .05, wx5, 8.9 - sag * 1.15, 35.1);
        }
      }
    }
    var lampDefs = [[-20, 18, 0, false], [20, 18, Math.PI, false], [-20, -18, 0, true], [20, -18, Math.PI, false]];
    for (var lmi = 0; lmi < 4; lmi++) {
      var ld = lampDefs[lmi];
      var side = (ld[2] === 0) ? 1 : -1;
      b.box(M.darkMetal, .14, 6.4, .14, ld[0], 3.2, ld[1], { rz: ld[3] ? .14 : 0 });
      b.box(M.darkMetal, 1.5, .08, .08, ld[0] + side * .7, 6.3, ld[1]);
      b.box(M.darkMetal, .55, .16, .28, ld[0] + side * 1.35, 6.24, ld[1], { rz: ld[3] ? .5 : 0 });
      b.solidR(ld[0], ld[1], .35, .35, 0, 6.4);
    }

    /* ================= ПРОПСЫ (порт PROPS) ================= */
    /* бочки */
    var bSpots = [[36, 36], [36.8, 36.4], [36.2, 37.2], [-30, -24], [10, -30], [48, 52], [49, 52.6], [-44, 16], [26, 14], [-6, 18],
      [-36, 52], [22, 58], [54, -12], [-14, -30]];
    for (var bsi = 0; bsi < bSpots.length; bsi++) {
      var nB = 1 + Math.floor(rng() * 3);
      for (var bi3 = 0; bi3 < nB; bi3++) {
        var tipped = rng() < .25;
        var bx2 = bSpots[bsi][0] + rr(-.7, .7), bz2 = bSpots[bsi][1] + rr(-.7, .7);
        if (tipped) b.cyl(M.rust, .32, .32, .92, 12, bx2, .33, bz2, { rx: Math.PI / 2, ry: rng() * 3, rz: rng() * 3 });
        else b.cyl(M.rust, .32, .32, .92, 12, bx2, .46, bz2, { ry: rng() * 3, rz: rr(-.04, .04) });
      }
      b.solidR(bSpots[bsi][0], bSpots[bsi][1], 1.8, 1.8, 0, 1);
    }
    /* ящики */
    var cSpots = [[12, 14], [-14, 12], [32, 24], [42, 36], [-32, 2], [-22, -28], [46, 50], [14, 56], [-40, 30], [8, -16]];
    for (var csi = 0; csi < cSpots.length; csi++) {
      var nC = 1 + Math.floor(rng() * 3);
      for (var ci2 = 0; ci2 < nC; ci2++) {
        var stackUp = ci2 > 0 && rng() < .5;
        b.box(M.wood, .9, .9, .9,
          cSpots[csi][0] + rr(-.8, .8), .45 + (stackUp ? .9 : 0), cSpots[csi][1] + rr(-.8, .8),
          { ry: rng() * 3, rz: rr(-.03, .03) });
      }
      b.solidR(cSpots[csi][0], cSpots[csi][1], 2, 2, 0, nC > 1 ? 1.8 : .9);
    }
    /* шины */
    var tSpots = [[22, 22], [-16, -20], [40, 48], [54, 36], [-42, 22], [8, 40], [-28, 40], [30, -14]];
    for (var tsi = 0; tsi < tSpots.length; tsi++) {
      var nT = 1 + Math.floor(rng() * 3);
      for (var ti = 0; ti < nT; ti++) {
        var tor = new THREE.TorusGeometry(.34, .14, 8, 16);
        _e.set(Math.PI / 2, 0, rng() * 3, 'YXZ'); _q.setFromEuler(_e);
        _p.set(tSpots[tsi][0] + rr(-.03, .03), .14 + ti * .27, tSpots[tsi][1] + rr(-.03, .03));
        _s1.set(1, 1, 1); _m.compose(_p, _q, _s1); tor.applyMatrix4(_m);
        b.push(tor, M.rubber);
      }
      if (rng() < .5) {
        var tor2 = new THREE.TorusGeometry(.34, .14, 8, 16);
        _e.set(1.25, 0, rng() * 3, 'YXZ'); _q.setFromEuler(_e);
        _p.set(tSpots[tsi][0] + .55, .42, tSpots[tsi][1] + .2);
        _s1.set(1, 1, 1); _m.compose(_p, _q, _s1); tor2.applyMatrix4(_m);
        b.push(tor2, M.rubber);
      }
    }
    /* мусорные контейнеры */
    for (var dxi = 0; dxi < 2; dxi++) {
      var dDef = [[44, 50, .2], [-16, 58, -.4]][dxi];
      b.box(M.rustGreen, 1.9, 1.15, 1.15, dDef[0], .75, dDef[1], { ry: dDef[2] });
      b.box(M.rust, 1.95, .08, 1.2, dDef[0], 1.36, dDef[1] - .1, { rx: -.35, ry: dDef[2] });
      b.solidR(dDef[0], dDef[1], 2.1, 1.4, 0, 1.4);
    }
    /* мешки с мусором */
    var bagSpots = [[44, 50], [-16, 58], [46, 51], [-14, 57]];
    for (var bgi = 0; bgi < 16; bgi++) {
      var sp2 = bagSpots[bgi % 4];
      b.sphere(M.trashBag, .32 * rr(.8, 1.3), sp2[0] + rr(-1.6, 1.6), .22, sp2[1] + rr(-1.4, 1.4));
    }
    /* поддоны */
    var palSpots = [[-30, 16, .3], [16, -24, -.2], [34, 52, .8], [-8, 26, .1], [48, 38, -.6]];
    for (var psi = 0; psi < palSpots.length; psi++) {
      var ps = palSpots[psi];
      for (var pp = 0; pp < 5; pp++) b.box(M.wood, 1.2, .04, .14, ps[0], .12, ps[1] - .5 + pp * .25, { ry: ps[2] });
      for (var pq = 0; pq < 3; pq++) b.box(M.wood, .12, .1, 1.1, ps[0] - .5 + pq * .5, .05, ps[1], { ry: ps[2] });
      b.solidR(ps[0], ps[1], 1.4, 1.4, 0, .25);
    }
    /* кабели-бобины */
    for (var spi = 0; spi < 2; spi++) {
      var sp3 = [[-26, 10], [12, -30]][spi];
      b.cyl(M.wood, .6, .6, .08, 14, sp3[0] - .3, .6, sp3[1], { rz: Math.PI / 2 });
      b.cyl(M.wood, .6, .6, .08, 14, sp3[0] + .3, .6, sp3[1], { rz: Math.PI / 2 });
      b.cyl(M.wood, .24, .24, .55, 10, sp3[0], .6, sp3[1], { rz: Math.PI / 2 });
      b.solidR(sp3[0], sp3[1], 1.3, 1.3, 0, .95);
    }
    /* трубы у дороги */
    b.push(new THREE.TorusGeometry(.42, .17, 8, 14), M.concrete);
    /* тачка (44,36) */
    b.box(M.darkMetal, .6, .05, .9, 44, .55, 36, { ry: .6, rz: .06 });
    b.box(M.darkMetal, .6, .5, .04, 44, .8, 35.55, { ry: .6 });
    b.box(M.darkMetal, .6, .5, .04, 44, .8, 36.45, { ry: .6 });
    b.box(M.darkMetal, .04, .5, .9, 43.7, .8, 36, { ry: .6 });
    b.box(M.darkMetal, .04, .5, .9, 44.3, .8, 36, { ry: .6 });
    b.cyl(M.rubber, .08, .08, .08, 10, 43.75, .08, 35.65);
    b.cyl(M.rubber, .08, .08, .08, 10, 44.25, .08, 35.65);
    b.cyl(M.rubber, .08, .08, .08, 10, 43.75, .08, 36.35);
    b.cyl(M.rubber, .08, .08, .08, 10, 44.25, .08, 36.35);
    b.solidR(44, 36, 1, 1.2, 0, 1.05);
    /* конусы */
    var coneSpots = [[2, 33], [-3, 33], [34, 27], [38, 33], [12, 60], [20, 60], [-34, 20], [-34, 26]];
    for (var coi = 0; coi < 8; coi++) {
      var coneG = new THREE.ConeGeometry(.16, .5, 10);
      b.place(coneG, coneSpots[coi][0], .25, coneSpots[coi][1], rr(-.08, .08), rng() * 3, rr(-.08, .08));
      b.push(coneG, M.coneOrange);
    }
    /* гидрант */
    b.cyl(M.hydrant, .14, .18, .7, 10, 10, .35, 26);
    b.sphere(M.hydrant, .16, 10, .75, 26);
    b.cyl(M.hydrant, .06, .06, .3, 8, 10, .55, 26, { rz: Math.PI / 2 });
    b.solidR(10, 26, .5, .5, 0, .9);
    /* дорожный знак «МИРНЫЙ →» */
    b.cyl(M.darkMetal, .05, .05, 2.4, 8, 10, 1.2, 56);
    b.push(makePlane(new THREE.MeshStandardMaterial({ map: T.roadSign, roughness: .7, side: THREE.DoubleSide }),
      1.5, .56, 10, 2.2, 56, Math.PI),
      new THREE.MeshStandardMaterial({ map: T.roadSign, roughness: .7, side: THREE.DoubleSide }));
    b.solidR(10, 56, .3, .3, 0, 2.4);
    /* барьеры */
    var barDefs = [[-6, 26.4, .1], [10, 33.6, -.15], [46, 26.6, .05], [-46, 33.4, .2]];
    for (var bai = 0; bai < 4; bai++) {
      b.box(M.concreteDark, 2.2, .9, .5, barDefs[bai][0], .45, barDefs[bai][1], { ry: barDefs[bai][2] });
      b.solidR(barDefs[bai][0], barDefs[bai][1], 2.4, .8, 0, .9);
    }
    /* кондиционеры на стенах */
    b.box(M.rust, .8, .5, .3, -42, 6, -8.8);
    b.box(M.rust, .8, .5, .3, -38, 9, -8.8);
    b.box(M.rust, .8, .5, .3, 30, 5, 38.1);
    /* афиши на стенах */
    var posterDefs = [
      { tex: T.posterGlory, x: -24, y: 2.4, z: -33.4, ry: 0 },
      { tex: T.posterEvac, x: 6, y: 2.2, z: -35.4, ry: 0 },
      { tex: T.posterDrink, x: 45.4, y: 2, z: 44, ry: -Math.PI / 2 }
    ];
    for (var pdi = 0; pdi < 3; pdi++) {
      var pd = posterDefs[pdi];
      var pm = new THREE.MeshStandardMaterial({ map: pd.tex, roughness: .9 });
      b.push(makePlane(pm, 1, 1.4, pd.x, pd.y, pd.z, pd.ry), pm);
    }
    /* доски-обрезки у стен */
    b.box(M.wood, .18, 2.6, .05, -47.5, 1.2, -8.6, { rx: .25, rz: .1 });
    b.box(M.wood, .18, 2.4, .05, -47.2, 1.1, -8.6, { rx: .3, rz: -.06 });
    b.box(M.wood, .18, 2.8, .05, 21.2, 1.3, 40, { rx: .28, rz: .08 });
    b.box(M.wood, .18, 2.2, .05, -13, 1, 47.6, { rx: .3, ry: .4, rz: .1 });
    b.box(M.wood, .18, 2.5, .05, 41, 1.2, 54.6, { rx: .26, rz: -.08 });
    /* камни и кирпичи (кучи) */
    var piles = [[-49, -18, 3.5], [-17, 52, 4], [16, 62, 2.6], [6, -35, 2.6], [-24, -33, 2.6], [40, 54, 2.2], [-10, 47, 2.6],
      [52, -36, 2.2], [0, -44, 3], [-54, 44, 2.6], [30, 20, 2], [-44, -30, 2.4]];
    for (var pli = 0; pli < piles.length; pli++) {
      var pile = piles[pli], nR = Math.floor(pile[2] * 8);
      for (var rki = 0; rki < nR; rki++) {
        var ang = rng() * Math.PI * 2, dd = rng() * pile[2];
        var rockG = new THREE.IcosahedronGeometry(.5, 0);
        b.place(rockG, pile[0] + Math.cos(ang) * dd,
          rr(.05, .5) * (1 - dd / pile[2]) + .1, pile[1] + Math.sin(ang) * dd,
          rng() * 3, rng() * 3, rng() * 3);
        _s1.set(rr(.3, 1.3), rr(.25, .9), rr(.3, 1.3));
        _q.identity(); _m.compose(_p.set(0, 0, 0), _q, _s1); rockG.applyMatrix4(_m);
        _s1.set(1, 1, 1);
        b.push(rockG, M.concreteDark);
      }
      for (var brI2 = 0; brI2 < 10 + Math.floor(rng() * 10); brI2++) {
        var ang2 = rng() * Math.PI * 2, dd2 = rng() * (pile[2] + 1.5);
        b.box(M.brickLoose, .24, .11, .12, pile[0] + Math.cos(ang2) * dd2, .06, pile[1] + Math.sin(ang2) * dd2,
          { ry: rng() * 3, rz: rr(-.1, .1) });
      }
      if (pile[2] > 3) b.solidR(pile[0], pile[1], pile[2] * 1.2, pile[2] * 1.2, 0, 1.2);
    }
    /* бумага / бутылки / банки */
    for (var ppi = 0; ppi < 90; ppi++) {
      var papG = new THREE.PlaneGeometry(.22, .3);
      b.place(papG, rr(-56, 56), .03, rr(-44, 62), -Math.PI / 2 + rr(-.08, .08), 0, rng() * 3);
      b.push(papG, M.paper);
    }
    for (var bti = 0; bti < 26; bti++) {
      var lying = rng() < .6;
      b.cyl(M.bottle, .035, .04, .22, 8, rr(-50, 50), lying ? .04 : .11, rr(-40, 60),
        { rx: lying ? Math.PI / 2 : 0, ry: rng() * 3, rz: lying ? rng() * 3 : 0 });
    }
    for (var cni = 0; cni < 30; cni++) {
      var lying2 = rng() < .7;
      b.cyl(M.canRed, .04, .04, .12, 8, rr(-50, 50), lying2 ? .04 : .06, rr(-40, 60),
        { rx: lying2 ? Math.PI / 2 : 0, ry: rng() * 3, rz: lying2 ? rng() * 3 : 0 });
    }

    /* ================= ПАВИЛЬОН «АВТОМАТЫ · 24Ч» ================= */
    var PV = { x: -46, z: 44, w: 8, d: 6, h: 3.4, t: .25 };
    b.box(M.tile, PV.w, PV.h, PV.t, PV.x, PV.h / 2, PV.z + PV.d / 2, { tile: 2 });
    b.solidR(PV.x, PV.z + PV.d / 2, PV.w, PV.t, 0, PV.h);
    b.box(M.tile, PV.t, PV.h, PV.d, PV.x - PV.w / 2, PV.h / 2, PV.z, { tile: 1 });
    b.solidR(PV.x - PV.w / 2, PV.z, PV.t, PV.d, 0, PV.h);
    b.box(M.tile, PV.t, PV.h, PV.d, PV.x + PV.w / 2, PV.h / 2, PV.z, { tile: 1 });
    b.solidR(PV.x + PV.w / 2, PV.z, PV.t, PV.d, 0, PV.h);
    var segW = (PV.w - 1.9) / 2;
    b.box(M.tile, segW, PV.h, PV.t, PV.x - 1.9 / 2 - segW / 2, PV.h / 2, PV.z - PV.d / 2, { tile: 1 });
    b.solidR(PV.x - 1.9 / 2 - segW / 2, PV.z - PV.d / 2, segW, PV.t, 0, PV.h);
    b.box(M.tile, segW, PV.h, PV.t, PV.x + 1.9 / 2 + segW / 2, PV.h / 2, PV.z - PV.d / 2, { tile: 1 });
    b.solidR(PV.x + 1.9 / 2 + segW / 2, PV.z - PV.d / 2, segW, PV.t, 0, PV.h);
    b.box(M.tile, 1.9, PV.h - 2.5, PV.t, PV.x, 2.5 + (PV.h - 2.5) / 2, PV.z - PV.d / 2, { tile: 1 });
    b.box(M.concreteDark, PV.w + .5, .22, PV.d + .5, PV.x, PV.h + .11, PV.z);
    flat(M.concreteFloor, PV.w - .3, PV.d - .3, PV.x, .045, PV.z, { tile: 1 });
    b.box(M.darkMetal, .14, 2.5, .34, PV.x - 1.9 / 2, 1.25, PV.z - PV.d / 2);
    b.box(M.darkMetal, .14, 2.5, .34, PV.x + 1.9 / 2, 1.25, PV.z - PV.d / 2);
    b.box(M.darkMetal, 1.9 + .3, .14, .34, PV.x, 2.52, PV.z - PV.d / 2);
    b.box(M.darkMetal, 1.9 + .6, .12, .9, PV.x, .06, PV.z - PV.d / 2 - .4);
    /* светящаяся вывеска + плакаты + часы + кондиционер */
    var signVendMat = new THREE.MeshStandardMaterial({
      map: T.vendSign, emissive: 0xffb347, emissiveMap: T.vendSign, emissiveIntensity: .85, roughness: .7
    });
    b.push(makePlane(signVendMat, 4.6, 1, PV.x, 2.95, PV.z - PV.d / 2 - .16, Math.PI), signVendMat);
    var post1Mat = new THREE.MeshStandardMaterial({ map: T.posterDrink, roughness: .9 });
    b.push(makePlane(post1Mat, 1, 1.4, PV.x + 2.6, 1.7, PV.z - PV.d / 2 - .14, Math.PI), post1Mat);
    b.push(makePlane(new THREE.MeshBasicMaterial({ map: T.graf24, transparent: true, depthWrite: false }),
      2, 1, PV.x - 2.6, 1.5, PV.z - PV.d / 2 - .14, Math.PI),
      new THREE.MeshBasicMaterial({ map: T.graf24, transparent: true, depthWrite: false }));
    b.box(M.rust, .9, .5, .6, PV.x + 2.4, PV.h + .47, PV.z + 1.4);
    b.cyl(M.rust, .2, .2, .06, 12, PV.x + 2.4, PV.h + .5, PV.z + 1.1, { rx: Math.PI / 2 });
    /* ЦЕНЫ на боковой стене */
    var post2Mat = new THREE.MeshStandardMaterial({ map: T.posterPrices, roughness: .9 });
    b.push(makePlane(post2Mat, 1, 1.4, PV.x - PV.w / 2 + .14, 1.75, PV.z - 1, Math.PI / 2), post2Mat);
    /* часы */
    b.cyl(new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: .6 }), .22, .22, .03, 20, PV.x + 2.6, 2.6, PV.z + PV.d / 2 - .14, { rx: Math.PI / 2 });
    /* скамейка */
    b.box(M.wood, .4, .08, 2, PV.x + PV.w / 2 - .5, .45, PV.z - .6);
    b.box(M.wood, .08, .45, .08, PV.x + PV.w / 2 - .5, .22, PV.z - 1.5);
    b.box(M.wood, .08, .45, .08, PV.x + PV.w / 2 - .5, .22, PV.z + .3);
    b.box(M.wood, .06, .5, 2, PV.x + PV.w / 2 - .28, .75, PV.z - .6);
    b.solidR(PV.x + PV.w / 2 - .5, PV.z - .6, .6, 2.2, 0, .8);

    /* ================= АВТОМАТЫ (порт makeVending) ================= */
    var glassMat = new THREE.MeshStandardMaterial({
      color: 0x9fc8d8, transparent: true, opacity: .2, roughness: .12, metalness: .1, side: THREE.DoubleSide
    });
    function makeVending(x, z, ry, marquee, screenTitle, kind, dead) {
      var mgMachines = machines;
      var tilt = dead ? .09 : 0;
      /* plinth + корпус + рама */
      b.box(M.concreteDark, 1.3, .14, .85, x, .07, z);
      b.box(M.vendBlue, 1.05, 1.95, .68, x, 1.1, z, { ry: ry, rz: tilt });
      var wfParts = [
        xfBox(.08, 1.95, .06, -.53, 1.1, -.35), xfBox(.08, 1.95, .06, .53, 1.1, -.35),
        xfBox(1.14, .08, .06, 0, 2.04, -.35), xfBox(1.14, .08, .06, 0, .16, -.35)
      ];
      var wfMesh = new THREE.Mesh(mergeGeos(wfParts), M.vendWhite);
      wfMesh.castShadow = true;
      wfMesh.position.set(x, 0, z); wfMesh.rotation.y = ry; wfMesh.rotation.z = tilt;
      b.attach(wfMesh);
      /* витрина: задник + товар + полки + стекло + рамка */
      var winBack = new THREE.Mesh(new THREE.PlaneGeometry(.36, 1.05),
        new THREE.MeshStandardMaterial({
          color: 0x101418, emissive: 0x223038, emissiveIntensity: dead ? 0 : .35
        }));
      winBack.position.set(x + .28 * Math.cos(ry), 1.25, z - .3 * Math.cos(ry));
      winBack.rotation.y = ry + Math.PI; winBack.rotation.z = tilt;
      b.attach(winBack);
      var goods = [];
      for (var s4 = 0; s4 < 3; s4++) for (var p4 = 0; p4 < 3; p4++) {
        var gx4 = -.4 + p4 * .12, gy4 = .86 + s4 * .32;
        if (kind === 'ammo') goods.push(xfBox(.09, .07, .06, gx4, gy4, -.32));
        else if (kind === 'gun') goods.push(xfBox(.1, .05, .04, gx4, gy4, -.32));
        else goods.push(xfBox(.08, .09, .05, gx4, gy4, -.32));
      }
      var goodsMesh = new THREE.Mesh(mergeGeos(goods),
        kind === 'ammo' ? M.ammoBox : kind === 'gun' ? M.gunMetal : M.medWhite);
      goodsMesh.position.set(x, 0, z); goodsMesh.rotation.y = ry; goodsMesh.rotation.z = tilt;
      b.attach(goodsMesh);
      var shelves = [];
      for (var shI = 0; shI < 3; shI++) shelves.push(xfBox(.36, .02, .08, -.28, .8 + shI * .32, -.32));
      var shelvesMesh = new THREE.Mesh(mergeGeos(shelves), M.vendWhite);
      shelvesMesh.position.set(x, 0, z); shelvesMesh.rotation.y = ry; b.attach(shelvesMesh);
      var winGlass = new THREE.Mesh(new THREE.PlaneGeometry(.36, 1.05), glassMat);
      winGlass.position.set(x + .28 * Math.cos(ry), 1.25, z - .365 * Math.cos(ry));
      winGlass.rotation.y = ry + Math.PI; b.attach(winGlass);
      var winFrame = new THREE.Mesh(mergeGeos([
        xfBox(.04, 1.1, .04, -.47, 1.25, -.36), xfBox(.04, 1.1, .04, -.09, 1.25, -.36),
        xfBox(.42, .04, .04, -.28, 1.79, -.36), xfBox(.42, .04, .04, -.28, .71, -.36)
      ]), M.vendWhite);
      winFrame.position.set(x, 0, z); winFrame.rotation.y = ry; b.attach(winFrame);
      /* жёлтый шланг */
      var hosePts = [
        new THREE.Vector3(-.46, 1.85, -.4), new THREE.Vector3(-.52, 1.5, -.46),
        new THREE.Vector3(-.5, 1.05, -.44), new THREE.Vector3(-.44, .85, -.48),
        new THREE.Vector3(-.38, 1.0, -.5), new THREE.Vector3(-.4, 1.25, -.46)
      ];
      var hoseCurve = new THREE.CatmullRomCurve3(hosePts);
      var hoseG = new THREE.TubeGeometry(hoseCurve, 24, .024, 6);
      _e.set(0, ry, tilt, 'YXZ'); _q.setFromEuler(_e); _p.set(x, 0, z);
      _s1.set(1, 1, 1); _m.compose(_p, _q, _s1); hoseG.applyMatrix4(_m);
      b.push(hoseG, M.hose);
      b.cyl(M.darkMetal, .03, .045, .14, 8, x - .4 * Math.cos(ry), 1.32, z + .4 * Math.sin(ry), { ry: ry });
      /* ЭКРАН (отдельный меш — обновляемая текстура) */
      var sc = document.createElement('canvas'); sc.width = 256; sc.height = 170;
      var sctx = sc.getContext('2d');
      drawScreen(sctx, 256, 170, dead ? '---' : screenTitle, 'idle');
      if (dead) { sctx.fillStyle = '#0a0f0a'; sctx.fillRect(0, 0, 256, 170); }
      var stex = new THREE.CanvasTexture(sc);
      if (THREE.SRGBColorSpace) stex.colorSpace = THREE.SRGBColorSpace;
      var screenMat = new THREE.MeshStandardMaterial({
        map: stex, emissive: 0xffffff, emissiveMap: stex, emissiveIntensity: dead ? 0 : 1.35, roughness: .4
      });
      var bezel = new THREE.Mesh(boxGeo(.56, .48, .06, 2), M.keypadDark);
      bezel.position.set(x + .24 * Math.cos(ry), 1.55, z - .35 * Math.cos(ry));
      bezel.rotation.y = ry; b.attach(bezel);
      var screen = new THREE.Mesh(new THREE.PlaneGeometry(.5, .36), screenMat);
      screen.position.set(x + .24 * Math.cos(ry), 1.55, z - .385 * Math.cos(ry));
      screen.rotation.y = ry + Math.PI; b.attach(screen);
      /* клавиатура + LED + монетник */
      var reds = [], blues = [], whites = [];
      for (var kr = 0; kr < 4; kr++) for (var kc = 0; kc < 3; kc++) {
        var kb = xfBox(.07, .06, .02, .12 + kc * .12, 1.19 - kr * .09, -.385);
        var pick = (kr + kc) % 3;
        (pick === 0 ? reds : pick === 1 ? blues : whites).push(kb);
      }
      var kbParts = [[reds, M.btnRed], [blues, M.btnBlue], [whites, M.btnWhite]];
      for (var kbI = 0; kbI < 3; kbI++) {
        var kbMesh = new THREE.Mesh(mergeGeos(kbParts[kbI][0]), kbParts[kbI][1]);
        kbMesh.position.set(x, 0, z); kbMesh.rotation.y = ry; b.attach(kbMesh);
      }
      var ledMat = new THREE.MeshStandardMaterial({
        color: 0x113311, emissive: 0x66ff66, emissiveIntensity: dead ? 0 : 1
      });
      b.box(ledMat, .05, .03, .02, x + .4 * Math.cos(ry), 1.28, z - .385 * Math.cos(ry), { ry: ry });
      b.box(M.vendRust, .03, .12, .02, x + .44 * Math.cos(ry), .95, z - .385 * Math.cos(ry), { ry: ry });
      /* декаль-надпись */
      var scriptMesh = new THREE.Mesh(new THREE.PlaneGeometry(.5, .16),
        new THREE.MeshBasicMaterial({ map: T.scriptDecal, transparent: true, depthWrite: false }));
      scriptMesh.position.set(x + .24 * Math.cos(ry), .72, z - .352 * Math.cos(ry));
      scriptMesh.rotation.y = ry + Math.PI; b.attach(scriptMesh);
      /* лоток выдачи */
      b.box(M.vendRust, .84, .3, .05, x, .52, z - .36 * Math.cos(ry), { ry: ry });
      b.box(new THREE.MeshStandardMaterial({ color: 0x141210, roughness: .8 }), .8, .16, .1, x, .3, z - .32 * Math.cos(ry), { ry: ry });
      /* вентиляция */
      for (var vI = 0; vI < 4; vI++)
        b.box(M.keypadDark, .92, .025, .03, x, .1 + vI * .045, z - .35 * Math.cos(ry), { ry: ry });
      /* верхняя табличка-маркиза (текст) */
      var mqMat = new THREE.MeshStandardMaterial({ map: mkTex(marqueeCanvas(marquee)), roughness: .8 });
      b.box(mqMat, 1.3, .44, .08, x, 2.32, z - .12 * Math.cos(ry), { rx: -.14, ry: ry });
      b.box(M.darkMetal, .06, .3, .06, x - .5 * Math.cos(ry), 2.12, z + .1 * Math.sin(ry), { ry: ry });
      b.box(M.darkMetal, .06, .3, .06, x + .5 * Math.cos(ry), 2.12, z - .1 * Math.sin(ry), { ry: ry });
      /* гофрированное обрамление + доска */
      b.box(M.rustGrey, 1.7, 2.75, .06, x, 1.4, z + .36 * Math.cos(ry), { ry: ry, tile: 1 });
      b.box(M.wood, .12, 2.4, .06, x + .82 * Math.cos(ry), 1.2, z - .3 * Math.sin(ry), { ry: ry, rz: .05 });
      if (!dead) {
        b.solidR(x, z, 1.2, .9, 0, 2.2);
        mgMachines.push({ x: x, z: z, ry: ry, name: screenTitle, kind: kind, dead: false });
      } else {
        b.solidR(x, z, 1.2, .9, 0, 2.1);
        mgMachines.push({ x: x, z: z, ry: ry, name: '---', kind: 'dead', dead: true });
      }
    }
    /* 2 РАБОЧИХ автомата (F — окно магазина) + 1 мёртвый (декор) */
    makeVending(PV.x - 1.6, PV.z + PV.d / 2 - .62, 0, 'Оружие!', 'ОРУЖИЕ', 'gun', false);
    makeVending(PV.x, PV.z + PV.d / 2 - .62, 0, 'Тыквы!', 'ТЫКВЫ·ШПРИЦЫ·ПАТРОНЫ', 'med', false);
    makeVending(PV.x + 1.6, PV.z + PV.d / 2 - .62, 0, 'OUT...', '---', 'med', true);
    makeVending(PV.x - PV.w / 2 + .62, PV.z - 1.1, Math.PI / 2, 'OUT...', '---', 'med', true);

    /* ================= КУСТЫ И СУХИЕ ДЕРЕВЬЯ ВНУТРИ СТЕН ================= */
    var bushTexture = mkTex(bushCanvas());
    var bushMatC = new THREE.MeshStandardMaterial({ map: bushTexture, alphaTest: .35, side: THREE.DoubleSide, roughness: 1 });
    var bushGeos = [];
    var bushCol = new THREE.Color();
    var placedBush = 0, triesB = 0;
    while (placedBush < 140 && triesB < 900) {
      triesB++;
      var bx5 = rr(-60, 60), bz5 = rr(-46, 64);
      if (Math.abs(bx5) < 29 && bz5 > -23 && bz5 < 23 && rng() < .9) continue;
      var blocked5 = false;
      for (var sI5 = 0; sI5 < b.solids.length; sI5++) {
        var ss5 = b.solids[sI5];
        if (bx5 > ss5.minX - .4 && bx5 < ss5.maxX + .4 && bz5 > ss5.minZ - .4 && bz5 < ss5.maxZ + .4) { blocked5 = true; break; }
      }
      if (blocked5) continue;
      bushCol.setHSL(.1, rr(.2, .35), rr(.35, .5));
      var bg1 = new THREE.PlaneGeometry(1.5 * rr(.6, 1.4), 1.4 * rr(.6, 1.4));
      b.place(bg1, bx5, .7, bz5, 0, rng() * 3, 0);
      var bg2 = new THREE.PlaneGeometry(1.5 * rr(.6, 1.4), 1.4 * rr(.6, 1.4));
      b.place(bg2, bx5, .7, bz5, 0, rng() * 3 + Math.PI / 2, 0);
      /* вершинные цвета — кусты разные по тону, как в оригинале */
      [bg1, bg2].forEach(function (bgg) {
        var cnt = bgg.attributes.position.count, arr = new Float32Array(cnt * 3);
        for (var vi = 0; vi < cnt; vi++) { arr[vi * 3] = bushCol.r; arr[vi * 3 + 1] = bushCol.g; arr[vi * 3 + 2] = bushCol.b; }
        bgg.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      });
      bushGeos.push(bg1); bushGeos.push(bg2);
      placedBush++;
    }
    if (bushGeos.length) {
      var bushMesh = new THREE.Mesh(mergeGeosBush(bushGeos),
        new THREE.MeshStandardMaterial({
          map: bushTexture, alphaTest: .35, side: THREE.DoubleSide,
          roughness: 1, vertexColors: true
        }));
      bushMesh.castShadow = false; bushMesh.receiveShadow = false;
      b.attach(bushMesh);
    }

    /* ================= СБОРКА: слить примитивы по материалам ================= */
    var group = new THREE.Group(); group.name = 'BrixCity';
    b.parts.forEach(function (geosOfMat, mat) {
      if (!geosOfMat.length) return;
      var merged = mergeGeos(geosOfMat);
      var mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
    });
    if (b.attached) {
      for (var ai = 0; ai < b.attached.length; ai++) group.add(b.attached[ai]);
    }
    return { group: group, solids: b.solids, machines: machines };
  }

  /* слияние геометрий С ВЕРШИННЫМИ ЦВЕТАМИ (кусты) */
  function mergeGeosBush(list) {
    var vcount = 0, icount = 0, i;
    for (i = 0; i < list.length; i++) {
      vcount += list[i].attributes.position.count;
      icount += list[i].index ? list[i].index.count : list[i].attributes.position.count;
    }
    var pos = new Float32Array(vcount * 3);
    var nor = new Float32Array(vcount * 3);
    var uv = new Float32Array(vcount * 2);
    var col = new Float32Array(vcount * 3);
    var idx = new Uint32Array(icount);
    var vo = 0, io = 0;
    for (i = 0; i < list.length; i++) {
      var g = list[i];
      pos.set(g.attributes.position.array, vo * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, vo * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
      if (g.attributes.color) col.set(g.attributes.color.array, vo * 3);
      var gi;
      if (g.index) gi = g.index.array;
      else {
        gi = new Uint32Array(g.attributes.position.count);
        for (var q = 0; q < gi.length; q++) gi[q] = q;
      }
      for (var k = 0; k < gi.length; k++) idx[io + k] = gi[k] + vo;
      io += gi.length; vo += g.attributes.position.count;
      g.dispose();
    }
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }

  /* ============================================================
     ПЛАНИРОВЩИК: ОДНО место под город — из ТЕРРЕЙНА (T.cityPad —
     ровная площадка в лесном биоме, 1:1 на клиенте и сервере).
     Здесь остаётся только поворот (0/90/180/270° — AABB осевые).
     ============================================================ */
  var planned = false;
  var spot = null;      /* { x, z, y, rot } */

  function plan() {
    if (planned) return spot;
    planned = true;
    spot = null;
    var T = window.BrixTerrain;
    if (!T || window.BRIX_PVP || !T.cityPad) return spot;
    var pad = T.cityPad();
    if (!pad) return spot;
    var rng = rngFrom(7701 + seedOff());
    spot = {
      x: pad.x, z: pad.z, y: pad.y,
      rot: Math.floor(rng() * 4) * Math.PI / 2
    };
    return spot;
  }

  /** точка внутри городской зоны (с запасом margin) — деревья/руды/
      кактусы/трава/кусты не ставятся */
  function blocks(x, z, margin) {
    if (!spot) return false;
    margin = margin === undefined ? 3 : margin;
    var dx = x - spot.x, dz = z - spot.z;
    return Math.abs(dx) < 66 + margin && Math.abs(dz) < 70 + margin;
  }

  /* ============================================================
     ПОСТРОЙКА В СЦЕНЕ + ФИЗИКА
     ============================================================ */
  var built = false;
  var inited = false;
  var boxes = [];        // мировые AABB → controls.addBoxColliders
  var groupRef = null;   // THREE.Group в сцене
  var sceneRef = null;   // для dispose
  var geosAll = [], matsAll = [];
  var vendList = [];     // мировые позиции работающих автоматов
  var lights = [];       // точечные источники города (убираются в dispose)

  /** локальный AABB → мировой (поворот кратен 90° — оси совпадают) */
  function worldBox(s, gx, gy, gz, yaw) {
    var c = Math.round(Math.cos(yaw)), sn = Math.round(Math.sin(yaw));
    var ax = s.minX * c + s.minZ * sn, az = -s.minX * sn + s.minZ * c;
    var bx = s.maxX * c + s.maxZ * sn, bz = -s.maxX * sn + s.maxZ * c;
    return {
      minX: gx + Math.min(ax, bx), maxX: gx + Math.max(ax, bx),
      minZ: gz + Math.min(az, bz), maxZ: gz + Math.max(az, bz),
      minY: gy + s.minY, maxY: gy + s.maxY,
      active: true
    };
  }

  function build(scene) {
    if (built) return api;
    built = true;
    var T = window.BrixTerrain;
    var s = plan();
    if (!T || !s || !scene) return api;
    sceneRef = scene;
    var rng = rngFrom(22001 + (seedOff() & 1023));
    var parts = buildCityGeometry(rng);
    /* посадка: площадка плоская — берём высоту ОТРИСОВАННОЙ сетки в центре */
    var gy = (T.meshHeightAt ? T.meshHeightAt(s.x, s.z) : s.y) + 0.05;
    parts.group.position.set(s.x, gy, s.z);
    parts.group.rotation.y = s.rot;
    scene.add(parts.group);
    groupRef = parts.group;
    for (var i = 0; i < parts.group.children.length; i++) {
      var ch = parts.group.children[i];
      if (ch.geometry) { geosAll.push(ch.geometry); }
    }
    /* свет павильона: вывеска + тёплый + холодный + зелёный CRT */
    var cosr = Math.cos(s.rot), sinr = Math.sin(s.rot);
    function worldPos(lx, lz) {
      return [s.x + lx * cosr + lz * sinr, s.z - lx * sinr + lz * cosr];
    }
    if (!window.BRIX_PVP) {
      var pvW = worldPos(-46, 44);
      var l1 = new THREE.PointLight(0xffb347, 1.5, 16, 2);
      l1.position.set(pvW[0], gy + 3.2, pvW[1] - 3 * cosr);
      scene.add(l1); lights.push(l1);
      var l2 = new THREE.PointLight(0xffd9a0, 2.4, 22, 2);
      l2.position.set(pvW[0], gy + 3.3, pvW[1]);
      scene.add(l2); lights.push(l2);
      var l3 = new THREE.PointLight(0x66ff88, 1.4, 11, 2);
      l3.position.set(pvW[0], gy + 1.6, pvW[1] + 1.4 * cosr);
      scene.add(l3); lights.push(l3);
    }
    /* AABB коллайдеры */
    for (var si = 0; si < parts.solids.length; si++) {
      boxes.push(worldBox(parts.solids[si], s.x, gy, s.z, s.rot));
    }
    /* работающие автоматы → мировые координаты (для F-взаимодействия) */
    vendList = [];
    for (var mi = 0; mi < parts.machines.length; mi++) {
      var mc = parts.machines[mi];
      if (mc.dead) continue;
      var wp = worldPos(mc.x, mc.z);
      vendList.push({
        x: wp[0], z: wp[1], y: gy,
        name: mc.name, kind: mc.kind,
        title: mc.kind === 'gun' ? 'ОРУЖИЕ · 24Ч' : 'ТЫКВЫ · ШПРИЦЫ · ПАТРОНЫ'
      });
    }
    inited = true;
    window.__brixCity = { x: s.x, z: s.z, rot: s.rot, machines: vendList.length };
    window.__brixCityGroup = parts.group;   /* доступ автотестов (материалы/меши) */
    console.log('[BrixCity] город «МИРНЫЙ»: ' + s.x + ' : ' + s.z +
      ' (поворот ' + Math.round(s.rot * 180 / Math.PI) + '°, солидов ' +
      parts.solids.length + ', автоматов ' + vendList.length + ')');
    return api;
  }

  /** пол под ногами: верх ящиков/паллет/барьеров/боньек (контракт barn) */
  function floorAt(x, z, feetY) {
    if (!inited) return null;
    var best = null;
    var lim = feetY + 0.55;
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (b.active === false) continue;
      if (x < b.minX - 0.3 || x > b.maxX + 0.3 || z < b.minZ - 0.3 || z > b.maxZ + 0.3) continue;
      if (b.maxY <= lim && (best === null || b.maxY > best)) best = b.maxY;
    }
    return best;
  }

  /** ближайший РАБОЧИЙ автомат (для подсказки [F] и открытия магазина) */
  function vendNear(pos, maxDist) {
    if (!inited) return null;
    maxDist = maxDist || 3.0;
    var best = null, bestD = maxDist;
    for (var i = 0; i < vendList.length; i++) {
      var v = vendList[i];
      var dx = v.x - pos.x, dz = v.z - pos.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  }

  function dispose() {
    if (sceneRef) {
      if (groupRef) sceneRef.remove(groupRef);
      for (var i = 0; i < lights.length; i++) sceneRef.remove(lights[i]);
    }
    sceneRef = null; groupRef = null;
    lights.length = 0;
    geosAll.forEach(function (g) { g.dispose(); });
    geosAll.length = 0;
    matsAll.length = 0;
    boxes.length = 0; vendList.length = 0;
    inited = false; built = false; planned = false; spot = null;
    window.__brixCity = null;
    window.__brixCityGroup = null;
  }

  /* ============================================================
     МАГАЗИН АВТОМАТА (F) — окно поверх игры в стиле BRIX:
     слева товар с ценой (лом), справа баланс. КУПИТЬ — клик.
     ============================================================ */
  var GOODS = {
    gun: [
      { id: 'revolver',   n: 1, price: 120 },
      { id: 'shotgun',    n: 1, price: 180 },
      { id: 'thompson',   n: 1, price: 220 },
      { id: 'rifleAk',    n: 1, price: 300 },
      { id: 'rev3x',      n: 1, price: 200 },
      { id: 'mace',       n: 1, price: 80 },
      { id: 'c4',         n: 1, price: 250 }
    ],
    med: [
      { id: 'pumpkin',      n: 1,  price: 15 },
      { id: 'syringe',      n: 1,  price: 60 },
      { id: 'ammo',         n: 24, price: 30 },
      { id: 'rifleBullet',  n: 12, price: 45 },
      { id: 'shotgunShell', n: 2,  price: 25 }
    ]
  };

  var shopRoot = null, shopCur = null, shopLastOpen = 0, shopBuy = null;

  function itemName(id) {
    var d = (window.BrixItems && BrixItems[id]) || {};
    var ru = d.name || id;
    return (window.BrixState && BrixState.data && BrixState.data.lang === 'en') ? (d.nameEn || ru) : ru;
  }
  function itemIcon(id) {
    var d = (window.BrixItems && BrixItems[id]) || {};
    return d.icon || '';
  }
  function inv() {
    return (window.BrixInventory && BrixInventory.get()) || { slots: [] };
  }

  function ensureShop() {
    if (shopRoot) return shopRoot;
    /* стили магазина — один раз (в стиле лут-меню BRIX + фосфор CRT) */
    if (!document.getElementById('vendShopCss')) {
      var st = document.createElement('style');
      st.id = 'vendShopCss';
      st.textContent =
        '#vendShopGoods{display:flex;flex-direction:column;gap:6px;min-width:420px}' +
        '.vend-row{display:flex;align-items:center;gap:10px;padding:7px 10px;' +
        'background:rgba(20,14,9,.75);border:1px solid #3a2e22;border-radius:4px}' +
        '.vend-row:hover{border-color:#8dff6a;background:rgba(28,22,13,.9)}' +
        '.vend-ico{width:34px;height:34px;object-fit:contain}' +
        '.vend-name{flex:1;font:14px "Segoe UI",sans-serif;color:#ece1d1}' +
        '.vend-price{font:12px Consolas,monospace;color:#e0b341;white-space:nowrap}' +
        '.vend-buy{cursor:pointer;user-select:none;font:13px Consolas,monospace;color:#9dff7a;' +
        'border:1px solid #4a7a45;border-radius:3px;padding:4px 12px;white-space:nowrap}' +
        '.vend-buy:hover{background:#2e5a2a;color:#d8ffc4}';
      document.head.appendChild(st);
    }
    shopRoot = document.createElement('div');
    shopRoot.id = 'vendShop';
    shopRoot.className = 'crate-overlay hidden';
    shopRoot.style.zIndex = '60';
    shopRoot.innerHTML =
      '<div class="crate-panel" style="max-width:520px">' +
      '  <button class="crate-close-btn" id="vendShopClose">X</button>' +
      '  <div class="crate-title font-h" id="vendShopTitle">АВТОМАТ</div>' +
      '  <div style="font:12px Consolas,monospace;color:#9dff7a;margin:2px 0 10px">' +
      '    ОПЛАТА МЕТАЛЛОЛОМОМ · <span id="vendShopScrap">0</span> ЛОМ</div>' +
      '  <div id="vendShopGoods"></div>' +
      '  <div class="crate-close-hint">F / ESC / X — закрыть · клик по товару — купить</div>' +
      '</div>';
    document.body.appendChild(shopRoot);
    document.getElementById('vendShopClose').onclick = function () { closeShop(); };
    shopRoot.addEventListener('mousedown', function (e) {
      if (e.target === shopRoot) closeShop();
    });
    shopBuy = function (itemId, n, price) {
      var I = inv();
      if (!I || !I.countItem) return;
      var have = I.countItem('scrap');
      if (have < price) {
        if (window.BrixHud) BrixHud.toast('Не хватает металлолома: нужно ' + price + ', есть ' + have, 3);
        return;
      }
      var fits = I.freeSpaceFor ? I.freeSpaceFor(itemId) : n;
      if (fits < n) {
        if (window.BrixHud) BrixHud.toast('Инвентарь полон — освободи место', 3);
        return;
      }
      I.removeCountByItem('scrap', price);
      I.addItem(itemId, n);
      if (window.BrixHud) BrixHud.toast('Куплено: ' + itemName(itemId) +
        (n > 1 ? ' ×' + n : '') + ' (−' + price + ' лома)', 3);
      renderShop();
    };
    document.addEventListener('keydown', function (e) {
      if (!isShopOpen()) return;
      if (e.code === 'Escape' || e.code === 'KeyF') {
        if (e.code === 'KeyF' && performance.now() - shopLastOpen < 300) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        closeShop();
      }
    });
    return shopRoot;
  }

  function renderShop() {
    if (!shopCur) return;
    var box = document.getElementById('vendShopGoods');
    var scrapEl = document.getElementById('vendShopScrap');
    var I = inv();
    if (scrapEl) scrapEl.textContent = I && I.countItem ? I.countItem('scrap') : 0;
    if (!box) return;
    box.innerHTML = '';
    var list = GOODS[shopCur.kind] || [];
    for (var i = 0; i < list.length; i++) {
      (function (g) {
        var row = document.createElement('div');
        row.className = 'vend-row';
        row.innerHTML =
          '<img class="vend-ico" src="' + itemIcon(g.id) + '" alt="" draggable="false">' +
          '<span class="vend-name">' + itemName(g.id) + (g.n > 1 ? ' ×' + g.n : '') + '</span>' +
          '<span class="vend-price">' + g.price + ' ЛОМ</span>' +
          '<span class="vend-buy">КУПИТЬ</span>';
        row.querySelector('.vend-buy').addEventListener('click', function () {
          if (shopBuy) shopBuy(g.id, g.n, g.price);
        });
        box.appendChild(row);
      })(list[i]);
    }
  }

  function isShopOpen() { return !!(shopRoot && !shopRoot.classList.contains('hidden')); }

  function openShop(vend) {
    ensureShop();
    shopCur = vend;
    shopLastOpen = performance.now();
    document.getElementById('vendShopTitle').textContent =
      'АВТОМАТ «' + (vend.title || vend.name) + '»';
    renderShop();
    shopRoot.classList.remove('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function closeShop() {
    if (!shopRoot) return;
    shopRoot.classList.add('hidden');
    shopCur = null;
  }

  var api = {
    plan: plan,
    build: build,
    floorAt: floorAt,
    blocks: blocks,
    vendNear: vendNear,
    openShop: openShop,
    closeShop: closeShop,
    isShopOpen: isShopOpen,
    isReady: function () { return inited; },
    list: function () {
      return window.__brixCity ? [window.__brixCity] : [];
    },
    boxes: boxes,
    dispose: dispose
  };
  return api;
})();
