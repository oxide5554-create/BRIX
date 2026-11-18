// ============================================================
//  brix • js/game/craft.js
//  ✅ v0.4.25 КРАФТ-ПАНЕЛЬ (клавиша Q) — стиль как на референсе
//  (крафт Rust legacy): слева ПРЕВЬЮ чертежа (иконка, таблица
//  ресурсов «КОЛ-ВО / РЕСУРС / НУЖНО / ЕСТЬ», количество, кнопка
//  СКАФТ, полка ИНВЕНТАРЬ), справа СПИСОК ЧЕРТЕЖЕЙ с вкладками
//  и оранжевыми строчками ресурсов. Выбранный чертёж — с зелёной
//  подсветкой, зелёным остаётся и СКАФТ, когда ресурсов хватает.
//
//  Рецепты v0.4.25 (по просьбе игрока, ровно его количества):
//    КАМЕННЫЙ ТОПОР     — 10 дерева
//    КАМЕННАЯ КИРКА     — 15 камня + 10 дерева
//    ЖЕЛЕЗНЫЙ ТОПОР     — 20 дерева + 5 метал фрагментов
//    ЖЕЛЕЗНАЯ КИРКА     — 20 дерева + 5 метал фрагментов (как топор)
//    ПЛАН СТРОИТЕЛЯ     — 5 дерева
//    КАЛАШ              — 1 труба + 1 корпус АК + 40 металлолома + 2 пружины
//    ДРОБОВИК           — 2 трубы + 40 метал фрагментов + 1 пружина
//    РЕВОЛЬВЕР          — 15 металлолома + 30 метал фрагментов
//    ТРУБА              — 12 метал фрагментов + 24 металлолома
//    ПРУЖИНА            — 13 метал фрагментов + 26 металлолома
//
//  Пока панель открыта — управление стоит (Q/ESC закрывают),
//  рендер и сеть ЖИВУТ (как у мини-меню M). Крафт МГНОВЕННЫЙ:
//  ресурсы списываются, предмет падает в инвентарь.
// ============================================================
window.BrixCraft = (function () {
  'use strict';

  var root = null;          // слой панели
  var open = false;
  var selId = null;         // выбранный чертёж
  var cat = 'all';          // вкладка
  var qty = 1;

  /* ---------- рецепты ---------- */
  var CATS = {
    tool:   { ru: 'ИНСТРУМЕНТЫ', en: 'TOOLS' },
    weapon: { ru: 'ОРУЖИЕ',      en: 'WEAPONS' },
    comp:   { ru: 'КОМПОНЕНТЫ',  en: 'COMPONENTS' }
  };
  var RECIPES = [
    { id: 'stoneAxe',     cat: 'tool',   out: 'stoneAxe',     req: [['wood', 10]] },
    { id: 'stonePickaxe', cat: 'tool',   out: 'stonePickaxe', req: [['stone', 15], ['wood', 10]] },
    { id: 'ironAxe',      cat: 'tool',   out: 'ironAxe',      req: [['wood', 20], ['metal', 5]] },
    { id: 'ironPickaxe',  cat: 'tool',   out: 'ironPickaxe',  req: [['wood', 20], ['metal', 5]] },
    { id: 'buildingPlan', cat: 'tool',   out: 'buildingPlan', req: [['wood', 5]] },
    { id: 'rifleAk',      cat: 'weapon', out: 'rifleAk',      req: [['pipe', 1], ['rifleBody', 1], ['scrap', 40], ['spring', 2]] },
    { id: 'shotgun',      cat: 'weapon', out: 'shotgun',      req: [['pipe', 2], ['metal', 40], ['spring', 1]] },
    { id: 'revolver',     cat: 'weapon', out: 'revolver',     req: [['scrap', 15], ['metal', 30]] },
    { id: 'pipe',         cat: 'comp',   out: 'pipe',         req: [['metal', 12], ['scrap', 24]] },
    { id: 'spring',       cat: 'comp',   out: 'spring',       req: [['metal', 13], ['scrap', 26]] }
  ];

  function lang() { return window.BrixState ? BrixState.data.lang : 'ru'; }
  function ru(en) { return lang() === 'en' ? en : arguments[1]; }

  function itemDef(id) {
    return (window.BrixItems && BrixItems[id]) ||
      { id: id, name: id, nameEn: id, icon: '' };
  }
  function itemName(id) {
    var d = itemDef(id);
    return lang() === 'en' ? (d.nameEn || d.name) : d.name;
  }
  function itemIcon(id) {
    /* ✅ v0.4.25: если на предмет надет СКИН — иконка скина */
    var d = itemDef(id);
    var sk = window.BrixWeaponSkins ? BrixWeaponSkins.iconFor(id) : null;
    return sk || d.icon || '';
  }

  function inv() { return (window.BrixInventory && BrixInventory.get()) || null; }

  function toast(msg, secs) {
    if (window.BrixHud && window.BrixGame && BrixGame.state.phase === 'playing') {
      BrixHud.toast(msg, secs || 4);
    } else if (window.BrixToast) {
      BrixToast.toast({ description: msg });
    }
  }

  function sfx(kind) {
    try { if (window.menuAudio) menuAudio[kind](); } catch (e) {}
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- данные для отрисовки ---------- */

  /** сколько раз МОЖНО скрафтить прямо сейчас */
  function canCraftCount(rec) {
    var iv = inv();
    if (!iv) return 0;
    var n = Infinity;
    for (var i = 0; i < rec.req.length; i++) {
      var have = iv.countItem(rec.req[i][0]);
      n = Math.min(n, Math.floor(have / rec.req[i][1]));
    }
    return n === Infinity ? 0 : n;
  }

  function recById(id) {
    for (var i = 0; i < RECIPES.length; i++) if (RECIPES[i].id === id) return RECIPES[i];
    return null;
  }

  /* ============================================================
     ДОМ: создаётся лениво, один раз
     ============================================================ */

  function ensure() {
    if (root) return root;
    root = document.createElement('div');
    root.id = 'brixCraft';
    root.className = 'bx-craft hidden';
    root.innerHTML =
      '<div class="bxc-wrap">' +
        /* ЛЕВАЯ ПАНЕЛЬ — превью выбранного чертежа */
        '<div class="bxc-panel bxc-left">' +
          '<div class="bxc-head"><span class="bxc-cap font-h">' + ru('BLUEPRINT', 'ЧЕРТЕЖ') +
            '</span><button class="bxc-x" id="bxcClose">✕</button></div>' +
          '<div class="bxc-preview">' +
            '<div class="bxc-name font-h" id="bxcName"></div>' +
            '<div class="bxc-shot"><img id="bxcImg" alt=""></div>' +
          '</div>' +
          '<div class="bxc-table" id="bxcTable"></div>' +
          '<div class="bxc-qty">' +
            '<span class="bxc-x1 font-h">x1</span>' +
            '<input class="bxc-qty-in" id="bxcQtyIn" type="number" min="1" max="99" value="1">' +
            '<button class="bxc-step" id="bxcMinus">−</button>' +
            '<button class="bxc-step" id="bxcPlus">+</button>' +
            '<button class="bxc-craft font-h" id="bxcCraftBtn">' + ru('CRAFT', 'СКАФТ') + '</button>' +
          '</div>' +
          '<div class="bxc-invcap font-h">' + ru('INVENTORY', 'ИНВЕНТАРЬ') + '</div>' +
          '<div class="bxc-inv" id="bxcInv"></div>' +
        '</div>' +
        /* ПРАВАЯ ПАНЕЛЬ — список чертежей */
        '<div class="bxc-panel bxc-right">' +
          '<div class="bxc-head"><span class="bxc-cap font-h">' + ru('BLUEPRINTS', 'ЧЕРТЕЖИ') +
            '</span><span class="bxc-unlocked" id="bxcUnlocked"></span></div>' +
          '<div class="bxc-tabs" id="bxcTabs"></div>' +
          '<div class="bxc-list" id="bxcList"></div>' +
        '</div>' +
      '</div>' +
      '<div class="bxc-hint font-h">' +
        ru('Q — close · pick a blueprint on the right · CRAFT makes it', 'Q — закрыть · справа выбери чертёж · СКАФТ — сделать') + '</div>';

    document.body.appendChild(root);

    root.querySelector('#bxcClose').onclick = function () { sfx('back'); close(); };
    root.addEventListener('mousedown', function (e) {
      if (e.target === root) { sfx('back'); close(); }
    });
    root.querySelector('#bxcMinus').onclick = function () { setQty(qty - 1); };
    root.querySelector('#bxcPlus').onclick = function () { setQty(qty + 1); };
    root.querySelector('#bxcQtyIn').addEventListener('change', function () {
      setQty(parseInt(this.value, 10) || 1);
    });
    root.querySelector('#bxcCraftBtn').onclick = function () { craft(); };

    paintTabs();
    if (!selId) selId = RECIPES[0].id;
    return root;
  }

  function setQty(n) {
    qty = Math.max(1, Math.min(99, n || 1));
    var inp = root && root.querySelector('#bxcQtyIn');
    if (inp) inp.value = qty;
    paintLeft();
    paintList();     // полоса «можно скрафтить» не меняется, но обновим недостающие
  }

  /* ---------- вкладки категорий ---------- */
  function paintTabs() {
    var host = root.querySelector('#bxcTabs');
    host.innerHTML = '';
    var tabs = [['all', ru('ALL', 'ВСЕ')], ['tool', CATS.tool], ['weapon', CATS.weapon], ['comp', CATS.comp]];
    tabs.forEach(function (tb) {
      var label = typeof tb[1] === 'string' ? tb[1] : (lang() === 'en' ? tb[1].en : tb[1].ru);
      var b = document.createElement('button');
      b.className = 'bxc-tab font-h' + (cat === tb[0] ? ' on' : '');
      b.textContent = label;
      b.onclick = function () {
        sfx('hover');
        cat = tb[0];
        paintTabs();
        paintList();
      };
      host.appendChild(b);
    });
  }

  /* ---------- левая панель: превью + таблица ресурсов ---------- */
  function paintLeft() {
    var rec = recById(selId) || RECIPES[0];
    var iv = inv();
    var name = root.querySelector('#bxcName');
    var img = root.querySelector('#bxcImg');
    name.textContent = itemName(rec.out);
    img.src = itemIcon(rec.out);
    img.alt = itemName(rec.out);

    var tbl = root.querySelector('#bxcTable');
    var html =
      '<div class="bxc-tr bxc-th">' +
        '<span>' + ru('AMOUNT', 'КОЛ-ВО') + '</span><span>' + ru('ITEM TYPE', 'РЕСУРС') +
        '</span><span>' + ru('TOTAL', 'НУЖНО') + '</span><span>' + ru('HAVE', 'ЕСТЬ') + '</span>' +
      '</div>';
    rec.req.forEach(function (r) {
      var have = iv ? iv.countItem(r[0]) : 0;
      var need = r[1] * qty;
      var ok = have >= need;
      html +=
        '<div class="bxc-tr' + (ok ? ' ok' : ' miss') + '">' +
          '<span>' + r[1] * qty + '</span>' +
          '<span class="bxc-res"><i style="background-image:url(\'' + itemIcon(r[0]) + '\')"></i>' +
            esc(itemName(r[0])) + '</span>' +
          '<span>' + r[1] * qty + '</span>' +
          '<span>' + have + '</span>' +
        '</div>';
    });
    tbl.innerHTML = html;

    var btn = root.querySelector('#bxcCraftBtn');
    var cc = canCraftCount(rec);
    btn.classList.toggle('ready', cc >= 1);
    btn.textContent = ru('CRAFT', 'СКАФТ') + (qty > 1 ? ' ×' + qty : '');
    btn.title = cc >= 1
      ? ru('Make ' + qty + ' (resources allow ' + cc + ')',
           'Сделать ×' + qty + ' (ресурсов хватает на ' + cc + ')')
      : ru('Not enough resources', 'Не хватает ресурсов');
  }

  /* ---------- полка ИНВЕНТАРЬ (все слоты с иконками) ---------- */
  function paintInv() {
    var host = root.querySelector('#bxcInv');
    var iv = inv();
    host.innerHTML = '';
    if (!iv) return;
    iv.slots.forEach(function (s) {
      var d = document.createElement('div');
      d.className = 'bxc-inv-slot' + (s ? '' : ' empty');
      if (s) {
        d.title = itemName(s.item.id) + (s.item.stackable ? ' ×' + s.count : '');
        d.innerHTML =
          '<img src="' + itemIcon(s.item.id) + '" alt="" draggable="false">' +
          (s.item.stackable && s.count > 1 ? '<b>' + s.count + '</b>' : '');
      }
      host.appendChild(d);
    });
  }

  /* ---------- правая панель: список чертежей ---------- */
  function paintList() {
    var host = root.querySelector('#bxcList');
    host.innerHTML = '';
    var total = RECIPES.length;
    var unlocked = 0;
    RECIPES.forEach(function (rec) {
      if (canCraftCount(rec) >= 1) unlocked++;
    });
    var unl = root.querySelector('#bxcUnlocked');
    if (unl) unl.textContent = ru(unlocked + ' OF ' + total + ' AVAILABLE',
      'ДОСТУПНО ' + unlocked + ' ИЗ ' + total);

    RECIPES.forEach(function (rec) {
      if (cat !== 'all' && rec.cat !== cat) return;
      var cc = canCraftCount(rec);
      var row = document.createElement('div');
      row.className = 'bxc-row' + (rec.id === selId ? ' sel' : '') + (cc >= 1 ? '' : ' nores');
      var reqHtml = rec.req.map(function (r) {
        return r[1] + ' ' + esc(itemName(r[0]));
      }).join(ru(', ', ', '));
      row.innerHTML =
        '<img class="bxc-row-ico" src="' + itemIcon(rec.out) + '" alt="" draggable="false">' +
        '<div class="bxc-row-mid">' +
          '<div class="bxc-row-name">' + esc(itemName(rec.out)) + '</div>' +
          '<div class="bxc-row-req">' + reqHtml + '</div>' +
        '</div>' +
        '<div class="bxc-row-cc font-h">' + (cc >= 1 ? '×' + cc : ru('NO RES', 'НЕТ РЕС.')) + '</div>';
      row.onclick = function () {
        sfx('hover');
        selId = rec.id;
        qty = 1;
        var inp = root.querySelector('#bxcQtyIn');
        if (inp) inp.value = 1;
        paintList();
        paintLeft();
      };
      host.appendChild(row);
    });
  }

  function paintAll() {
    paintLeft();
    paintInv();
    paintList();
  }

  /* ============================================================
     СКАФТ: списываем ресурсы, выдаём предмет
     ============================================================ */

  function craft() {
    var iv = inv();
    var rec = recById(selId);
    if (!iv || !rec) return;
    var made = 0;
    var want = qty;
    for (var i = 0; i < want; i++) {
      // хватает ресурсов на ещё один?
      var ok = true;
      for (var k = 0; k < rec.req.length; k++) {
        if (iv.countItem(rec.req[k][0]) < rec.req[k][1]) { ok = false; break; }
      }
      if (!ok) break;
      // есть куда положить?
      if (iv.freeSpaceFor(rec.out) < 1) {
        toast(ru('No space in inventory', 'Нет места в инвентаре'), 4);
        break;
      }
      // списываем ресурсы
      for (var j = 0; j < rec.req.length; j++) {
        iv.removeCountByItem(rec.req[j][0], rec.req[j][1]);
      }
      iv.addItem(rec.out, 1);
      made++;
    }
    if (made > 0) {
      try { iv.showPickup(rec.out, made); } catch (e) {}
      toast(ru('Crafted: ' + made + ' × ' + itemName(rec.out),
        'Скрафчено: ' + made + ' × ' + itemName(rec.out)), 4);
      sfx('click');
    } else if (i === 0) {
      // не хватило с первого же раза — называем первый недостающий ресурс
      var miss = null;
      for (var m = 0; m < rec.req.length; m++) {
        if (iv.countItem(rec.req[m][0]) < rec.req[m][1]) {
          miss = (rec.req[m][1] - iv.countItem(rec.req[m][0])) + ' ' + itemName(rec.req[m][0]);
          break;
        }
      }
      toast(miss ? ru('Missing: ' + miss, 'Не хватает: ' + miss)
                 : ru('Not enough resources', 'Не хватает ресурсов'), 5);
      sfx('back');
    }
    paintAll();
  }

  /* ============================================================
     ОТКРЫТИЕ/ЗАКРЫТИЕ (как мини-меню: мышь свободна, сеть живёт)
     ============================================================ */

  function blockedByOtherUi() {
    var iv = inv();
    if (iv && iv.isOpen) return true;
    if (window.BrixLootMenu && BrixLootMenu.isOpen()) return true;
    if (window.BrixMiniMenu && BrixMiniMenu.isAnyOpen()) return true;
    if (window.BrixAdmin && BrixAdmin.isOpen()) return true;
    return false;
  }

  function isOpen() { return open; }

  function openPanel() {
    if (open) return;
    if (blockedByOtherUi()) return;
    if (!window.BrixGame || BrixGame.state.phase !== 'playing') return;
    open = true;
    ensure();
    paintAll();
    root.classList.remove('hidden');
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) {}
  }

  function close() {
    if (!open) return;
    open = false;
    if (root) root.classList.add('hidden');
    // возврат мыши в игру (с повторами — после Esc браузер даёт lock не сразу)
    var tries = 0;
    var retry = function () {
      if (open || !window.BrixGame || BrixGame.state.phase !== 'playing') return;
      var canvas = document.querySelector('#gameMount canvas');
      if (!canvas || document.pointerLockElement === canvas) return;
      try {
        var p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(function () {
          if (tries < 6) setTimeout(retry, 300);
        });
      } catch (e) {
        if (tries < 6) setTimeout(retry, 300);
      }
      tries++;
    };
    setTimeout(retry, 80);
  }

  function toggle() {
    if (open) close();
    else openPanel();
  }

  /* ---------- КЛАВИАТУРА: Q — открыть/закрыть, ESC — закрыть ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    var playing = window.BrixGame && BrixGame.state.phase === 'playing';
    if (!playing) return;
    // клавиатура кодового замка/перелаза — Q вводит текст, не открывает крафт
    if (window.BrixBuilding && BrixBuilding.isUiBlocked && BrixBuilding.isUiBlocked()) return;
    if (e.code === 'KeyQ') {
      // инвентарь/лут/меню/панель открыты — Q молчит (Q там может быть кодом)
      if (!open && blockedByOtherUi()) return;
      e.preventDefault();
      sfx(open ? 'back' : 'click');
      toggle();
    } else if (e.code === 'Escape' && open) {
      e.preventDefault();
      close();
    }
  });

  /* ---------- публичное API ---------- */
  return {
    toggle: toggle,
    open: openPanel,
    close: close,
    isOpen: isOpen,
    /** полный сброс при выходе из мира (gameworld.stop) */
    shutdown: function () {
      close();
      qty = 1;
      if (root) root.classList.add('hidden');
    }
  };
})();
