// ============================================================
//  brix • js/game/lootmenu.js
//  ✅ v0.3.9 ЛУТ-МЕНЮ ЯЩИКА — порт сплит-панели из РЕПОЗИТОРИЯ
//  (scr/ui/crateUI.js): слева сетка ЯЩИКА (12 слотов деревянный /
//  18 военный), справа ИНВЕНТАРЬ игрока и ХОТБАР — как в Rust.
//  ✅ v0.4.1 ПЕРЕДЕЛАНО:
//   • НАСТОЯЩИЙ DRAG & DROP, как в основном инвентаре (HTML5
//     dragstart/drop): предмет из ящика можно ПЕРЕТАЩИТЬ в любой
//     слот инвентаря/хотбара — и НАОБОРОТ, свой предмет можно
//     перетащить В ЯЩИК (положить на хранение). Свой-свой —
//     переставляется тем же перетаскиванием.
//   • При перетаскивании из ящика в занятый слот берётся столько,
//     сколько влезает в этот стек (остаток остаётся в ящике).
//   • Клик по предмету ящика по-прежнему забирает весь стек.
//   • Инвентарь в лут-меню = ВСЕ 20 ЯЧЕЕК той же компоновкой,
//     что и в обычном инвентаре: рюкзак 5×3 (14) + хотбар (6) —
//     «сходство», как просил игрок.
//  Лут хранится на СЕРВЕРЕ: взял скрап — остальные предметы
//  остаются у всех. F открывает и закрывает (защита 300 мс),
//  ESC / ✕ / клик мимо — закрыть. Ящик можно открывать многократно.
//  Иконки предметов — из репозитория (scr/ui/icons).
// ============================================================
window.BrixLootMenu = (function () {
  'use strict';

  var root = null;
  var curId = null;
  var curLoot = null;
  var curMil = 0;
  var curMode = null;   /* ✅ v0.4.22: 'chest' — меню сундука «наоборот» */
  var onTake = null;   // (cbId, item, amt) — забрать из ящика
  var onPut = null;    // (cbId, item, amt, fromIndex) — положить в ящик
  var onClose = null;
  var lastOpen = 0;    // ✅ защита от немедленного закрытия тем же F (репо)

  function t(k) { return window.BrixState ? BrixState.t(k) : k; }

  function itemName(id) {
    var d = (window.BrixItems && BrixItems[id]) || { id: id, name: id, nameEn: id };
    return (window.BrixState && BrixState.data.lang === 'en') ? (d.nameEn || d.name) : d.name;
  }
  function itemIcon(id) {
    var d = (window.BrixItems && BrixItems[id]) || {};
    /* ✅ v0.4.25: если на предмет надет СКИН — иконка скина */
    var sk = window.BrixWeaponSkins ? BrixWeaponSkins.iconFor(id) : null;
    return sk || d.icon || '';
  }
  /* лимит стека предмета (BrixItems: stackable + stack) */
  function stackLimit(id) {
    var d = (window.BrixItems && BrixItems[id]) || {};
    return d.stackable ? (d.stack || 99) : 1;
  }
  function crateTitle(mil) {
    return mil ? t('loot.titleMil') : t('loot.titleWood');
  }

  function backpackCount() {
    return Math.max(0, inv().slots.length - 6);
  }

  function ensure() {
    if (root) return root;
    root = document.createElement('div');
    root.id = 'lootMenu';
    root.className = 'crate-overlay hidden';
    root.innerHTML =
      '<div class="crate-panel">' +
      '  <button class="crate-close-btn" id="lootClose">X</button>' +
      '  <div class="crate-col">' +
      '    <div class="crate-title font-h" id="lootTitle"></div>' +
      '    <div class="crate-grid" id="lootCrateGrid"></div>' +
      '  </div>' +
      '  <div class="crate-col">' +
      '    <div class="crate-title font-h" id="lootInvCap">' + t('loot.inv') + '</div>' +
      '    <div class="crate-grid crate-grid-inv" id="lootInvGrid"></div>' +
      '    <div class="crate-title font-h" style="margin-top:8px">' + t('loot.hotbar') + '</div>' +
      '    <div class="crate-grid crate-grid-hot" id="lootHotbarGrid"></div>' +
      '  </div>' +
      '  <div class="crate-close-hint" id="lootHint">' + t('loot.hint') + '</div>' +
      '</div>';
    document.body.appendChild(root);
    document.getElementById('lootClose').onclick = function () { close(); };
    // клик мимо панели — закрыть (как в репозитории)
    root.addEventListener('mousedown', function (e) {
      if (e.target === root) close();
    });
    return root;
  }

  /* ---------- доступ к инвентарю игрока ---------- */

  function inv() {
    return (window.BrixInventory && BrixInventory.get()) || { slots: [] };
  }
  /** сколько такого предмета ещё влезет в слот idx (0 — не влезет) */
  function slotSpace(idx, itemId) {
    var s = inv().slots[idx];
    if (!s) return stackLimit(itemId);          // пустой слот — целый стек
    if (s.item && s.item.id === itemId && s.item.stackable !== false && stackLimit(itemId) > 1) {
      return Math.max(0, stackLimit(itemId) - s.count);
    }
    return 0;                                    // занят другим предметом
  }

  /* ---------- обработка перетаскивания ---------- */

  function onDragStart(e, payload) {
    e.dataTransfer.setData('text/plain', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'move';
    if (e.target && e.target.classList) {
      e.target.classList.add('dragging');
      var clear = function () { e.target.classList.remove('dragging'); };
      e.target.addEventListener('dragend', clear, { once: true });
    }
  }
  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (e.currentTarget.classList) e.currentTarget.classList.add('drag-over');
  }
  function onDragLeave(e) {
    if (e.currentTarget.classList) e.currentTarget.classList.remove('drag-over');
  }

  /** ПЕРЕТАЩИЛИ ИЗ ЯЩИКА на свой слот idx: взять столько, сколько влезает */
  function dropCrateToOwn(item, idx) {
    var amt = (curLoot && curLoot[item]) || 0;
    if (!amt || !curId) return;
    var space = slotSpace(idx, item);
    var take = space > 0 ? Math.min(space, amt) : amt;   // занят другим — как клик
    if (onTake) onTake(curId, item, take);
  }
  /** ПЕРЕТАЩИЛИ СВОЙ слот idx В ЯЩИК: положить весь стек.
      ✅ v0.4.8: ПЛАН СТРОИТЕЛЯ в ящик положить по-прежнему НЕЛЬЗЯ */
  function dropOwnToCrate(idx) {
    var s = inv().slots[idx];
    if (!s || !curId) return;
    if (s.item && s.item.tool === 'plan') return;
    if (onPut) onPut(curId, s.item.id, s.count, idx);
  }
  /** СВОЙ-СВОЙ: перестановка стеков (как в основном инвентаре) */
  function dropOwnToOwn(fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    var I = inv();
    if (!I.swapItems) return;
    var a = fromIdx, b = toIdx;
    var A = I.slots[a], B = I.slots[b];
    if (A && B && A.item.id === B.item.id && stackLimit(A.item.id) > 1) {
      var space = stackLimit(A.item.id) - B.count;
      var move = Math.min(space, A.count);
      B.count += move; A.count -= move;
      if (A.count <= 0) I.slots[a] = null;
      if (I.renderAll) I.renderAll();
      if (I._notifySelect) I._notifySelect();
    } else {
      I.swapItems({ type: a < 6 ? 'hotbar' : 'inv', index: a < 6 ? a : a - 6 },
                  { type: b < 6 ? 'hotbar' : 'inv', index: b < 6 ? b : b - 6 });
    }
  }

  /* ---------- отрисовка слотов ---------- */

  /** слот ящика: клик — забрать весь стек; можно перетащить в инвентарь;
      НА НЕГО можно перетащить свой предмет (положить в ящик) */
  function renderCrateSlot(container, item, count) {
    var el = document.createElement('div');
    el.className = 'crate-slot crate-slot-live';
    if (item) {
      var ico = document.createElement('div');
      ico.className = 'slot-icon';
      ico.innerHTML = '<img src="' + itemIcon(item) + '" alt="" draggable="false">';
      el.appendChild(ico);
      if (count > 1) {
        var c = document.createElement('div');
        c.className = 'count';
        c.textContent = count;
        el.appendChild(c);
      }
      el.title = itemName(item);
      el.draggable = true;
      el.addEventListener('dragstart', function (e) {
        onDragStart(e, { src: 'crate', item: item });
      });
      el.addEventListener('click', function () {
        if (onTake && curId) onTake(curId, item, (curLoot && curLoot[item]) || 0);
      });
    }
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('drop', function (e) {
      e.preventDefault();
      el.classList.remove('drag-over');
      var data; try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (err) { return; }
      if (!data) return;
      if (data.src === 'own' && typeof data.index === 'number') dropOwnToCrate(data.index);
    });
    container.appendChild(el);
  }

  /** свой слот (0–19): можно перетащить сюда предмет из ящика,
      свой предмет можно унести в другой слот или в ящик.
      ✅ v0.4.22: в режиме сундука КЛИК по своему предмету — положить стек В СУНДУК */
  function renderOwnSlot(container, slot, idx) {
    var el = document.createElement('div');
    el.className = 'crate-slot crate-slot-own' + (idx < 6 ? ' own-hot' : '');
    if (slot) {
      var ico = document.createElement('div');
      ico.className = 'slot-icon';
      ico.innerHTML = '<img src="' + itemIcon(slot.item.id) + '" alt="" draggable="false">';
      el.appendChild(ico);
      if (slot.count > 1) {
        var c = document.createElement('div');
        c.className = 'count';
        c.textContent = slot.count;
        el.appendChild(c);
      }
      el.title = itemName(slot.item.id);
      // ✅ v0.4.8: план строителя ТОЖЕ перетаскивается — можно переставить
      // его между рюкзаком и хотбаром, пока открыт ящик (в сам ящик нельзя)
      el.draggable = true;
      el.addEventListener('dragstart', function (e) {
        onDragStart(e, { src: 'own', index: idx });
      });
      /* ✅ v0.4.22 СУНДУК «наоборот»: один клик — весь стек в сундук */
      if (curMode === 'chest') {
        el.classList.add('crate-slot-put');
        el.addEventListener('click', function () {
          if (!slot || !curId || !onPut) return;
          if (slot.item && slot.item.tool === 'plan') return;  // план — нельзя
          onPut(curId, slot.item.id, slot.count, idx);
        });
      }
    }
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('dragleave', onDragLeave);
    // ✅ v0.4.8: на слот с планом можно бросить СВОЙ предмет (обмен местами),
    // а предмет из ЯЩИКА на план не кладётся (план не заменяется лутом)
    el.addEventListener('drop', function (e) {
      e.preventDefault();
      el.classList.remove('drag-over');
      var data; try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (err) { return; }
      if (!data) return;
      if (data.src === 'crate' && slot && slot.item && slot.item.tool === 'plan') return;
      if (data.src === 'crate') dropCrateToOwn(data.item, idx);
      else if (data.src === 'own' && typeof data.index === 'number') dropOwnToOwn(data.index, idx);
    });
    container.appendChild(el);
  }

  function render() {
    var grid = document.getElementById('lootCrateGrid');
    var invGrid = document.getElementById('lootInvGrid');
    var hotGrid = document.getElementById('lootHotbarGrid');
    /* ✅ v0.4.22: у сундука 16 слотов (ящики: деревянный 12 / военный 18) */
    var size = curMode === 'chest' ? 16 : (curMil ? 18 : 12);

    // --- ящик: лут разворачиваем в слоты ---
    grid.innerHTML = '';
    var keys = Object.keys(curLoot || {}).filter(function (k) { return curLoot[k] > 0; });
    for (var i = 0; i < size; i++) {
      if (i < keys.length) renderCrateSlot(grid, keys[i], curLoot[keys[i]]);
      else renderCrateSlot(grid, null, 0);
    }

    // --- инвентарь игрока: ВСЕ РЮКЗАЧНЫЕ ЯЧЕЙКИ (в игре их 20:
    //     сетка 5x4, как в обычном инвентаре .bx-inv-grid),
    //     ниже ХОТБАР 6 в ряд — полная «сходство» ---
    var I = inv();
    invGrid.innerHTML = '';
    for (var s = 6; s < I.slots.length; s++) renderOwnSlot(invGrid, I.slots[s], s);
    hotGrid.innerHTML = '';
    for (var h = 0; h < 6; h++) renderOwnSlot(hotGrid, I.slots[h], h);
  }

  /** открыть меню ящика (id чекблока, лут, mil, mode — ✅ v0.4.22 'chest') */
  function open(id, loot, mil, mode) {
    ensure();
    curId = id;
    curMil = mil || 0;
    curMode = mode || null;
    lastOpen = performance.now();
    document.getElementById('lootTitle').textContent =
      curMode === 'chest' ? t('loot.titleChest') : crateTitle(curMil);
    /* ✅ v0.4.22: у сундука своя подсказка — «класть» на первом месте */
    var hintEl = document.getElementById('lootHint');
    if (hintEl) {
      hintEl.textContent = curMode === 'chest' ? t('loot.hintChest') : t('loot.hint');
    }
    document.getElementById('lootInvCap').innerHTML =
      t('loot.inv') + ' <span style="color:#8a8a8a;font-weight:400">· ' + backpackCount() + '</span>';
    curLoot = loot || {};
    render();
    root.classList.remove('hidden');
    // освободить курсор мыши (как в репозитории)
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** сервер прислал новый лут этого ящика — перерисовать, если открыт */
  function update(id, loot) {
    if (root && !root.classList.contains('hidden') && curId === id) {
      curLoot = loot || {};
      render();
    }
  }

  function close() {
    if (!root || root.classList.contains('hidden')) return;
    var closingId = curId;              /* ✅ v0.4.22: id уходит в onClose (крышка сундука) */
    root.classList.add('hidden');
    curId = null;
    curLoot = null;
    curMode = null;
    if (onClose) onClose(closingId);
  }

  function isOpen() { return !!(root && !root.classList.contains('hidden')); }
  function openId() { return isOpen() ? curId : null; }
  function lastOpenTs() { return lastOpen; }
  function init(opts) {
    onTake = opts.take;
    onPut = opts.put || null;
    onClose = opts.close;
  }

  document.addEventListener('keydown', function (e) {
    if (!isOpen()) return;
    if (e.code === 'Escape' || e.code === 'KeyF') {
      // ✅ репозиторий: игнорируем F первые 300 мс после открытия,
      // иначе то же нажатие немедленно закрыло бы ящик
      if (e.code === 'KeyF' && performance.now() - lastOpen < 300) return;
      e.preventDefault();
      // ✅ СТОП ДАЛЬШЕ: этот же keydown дошёл бы до tryPickup в gameworld
      // и МГНОВЕННО ПЕРЕОТКРЫЛ ящик (меню «не закрывалось» — как у игрока).
      // Обработчик лут-меню зарегистрирован раньше gameworld.js, поэтому
      // stopImmediatePropagation реально перехватывает событие
      e.stopImmediatePropagation();
      close();
    }
  });

  return {
    init: init,
    open: open,
    update: update,
    close: close,
    isOpen: isOpen,
    openId: openId,
    lastOpenTs: lastOpenTs
  };
})();
