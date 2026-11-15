// ============================================================
//  brix • js/game/inventory.js
//  ХОТБАР + ИНВЕНТАРЬ BRIX — собственный стиль (rust-дизайн игры),
//  механика портирована из репозитория (scr/ui/hotbar.js и
//  scr/ui/inventory.js): 6 слотов быстрого доступа + сетка 6x3,
//  drag & drop, стеки, клавиши 1-6, колесо мыши, E — открыть/закрыть.
//  Открывается поверх игры без всяких меню.
// ============================================================
// пробивка кэша браузера: к пути добавляется ?v=<версия> (см. index.html)
function BrixAx(u) { return window.BrixAsset ? window.BrixAsset(u) : u; }

window.BrixItems = {
  stoneAxe: {
    id: 'stoneAxe', name: 'Каменный топор', nameEn: 'Stone Axe',
    icon: BrixAx('assets/icons/stone_axe.png'), stackable: false, tool: 'axe'
  },
  stonePickaxe: {
    id: 'stonePickaxe', name: 'Каменная кирка', nameEn: 'Stone Pickaxe',
    icon: BrixAx('assets/icons/stone_pickaxe.png'), stackable: false, tool: 'pickaxe'
  },
  ironPickaxe: {
    id: 'ironPickaxe', name: 'Железная кирка', nameEn: 'Iron Pickaxe',
    icon: BrixAx('assets/icons/pickaxe.png'), stackable: false, tool: 'ironPickaxe'
  },
  ironAxe: {
    id: 'ironAxe', name: 'Железный топор', nameEn: 'Iron Axe',
    icon: BrixAx('assets/icons/iron_axe.png'), stackable: false, tool: 'ironAxe'
  },
  /* ✅ v0.4.5 РЕВОЛЬВЕР (модель пользователя colt_detective_gun.glb):
     стреляет патронами, обойма 6, урон 20 (5 выстрелов = убийство);
     в слоте показывает остаток обоймы (0–6) — slot.mag */
  revolver: {
    id: 'revolver', name: 'Револьвер', nameEn: 'Revolver',
    icon: BrixAx('assets/icons/revolver.png'), stackable: false, tool: 'revolver'
  },
  /* ✅ v0.4.5 патроны для револьвера (штабелируются; выпадают из военных ящиков) */
  ammo: {
    id: 'ammo', name: 'Патроны', nameEn: 'Ammo',
    icon: BrixAx('assets/icons/ammo_pistol.png'), stackable: true, stack: 128
  },
  /* ✅ v0.3.6: ресурсы из репозитория — металлолом и метал фрагмент */
  scrap: {
    id: 'scrap', name: 'Металлолом', nameEn: 'Scrap',
    icon: BrixAx('assets/icons/scrap.png'), stackable: true, stack: 1000
  },
  metal: {
    id: 'metal', name: 'Метал фрагмент', nameEn: 'Metal Fragment',
    icon: BrixAx('assets/icons/metal.png'), stackable: true, stack: 1000
  },
  wood: {
    id: 'wood', name: 'Дерево', nameEn: 'Wood',
    icon: BrixAx('assets/icons/wood.png'), stackable: true, stack: 1000
  },
  stone: {
    id: 'stone', name: 'Камень', nameEn: 'Stone',
    icon: BrixAx('assets/icons/stone.png'), stackable: true, stack: 1000
  },
  rock: {
    id: 'rock', name: 'Булыжник', nameEn: 'Rock',
    icon: BrixAx('assets/icons/rock.png'), stackable: true, stack: 1000
  },
  iron: {
    id: 'iron', name: 'Железо', nameEn: 'Iron',
    icon: BrixAx('assets/icons/iron.png'), stackable: true, stack: 1000
  },
  sulfur: {
    id: 'sulfur', name: 'Сера', nameEn: 'Sulfur',
    icon: BrixAx('assets/icons/sulfur.png'), stackable: true, stack: 1000
  },
  /* ✅ v0.3.8: лут ящиков чекблоков — иконки из репозитория (scr/ui/icons) */
  pipe: {
    id: 'pipe', name: 'Труба', nameEn: 'Pipe',
    icon: BrixAx('assets/icons/pipe.png'), stackable: true, stack: 1000
  },
  spring: {
    id: 'spring', name: 'Пружина', nameEn: 'Spring',
    icon: BrixAx('assets/icons/spring.png'), stackable: true, stack: 1000
  },
  rifleBody: {
    id: 'rifleBody', name: 'Корпус АК', nameEn: 'Rifle Body',
    icon: BrixAx('assets/icons/rifle_body.png'), stackable: true, stack: 100
  },
  berdanaBody: {
    id: 'berdanaBody', name: 'Корпус берданки', nameEn: 'Berdana Body',
    icon: BrixAx('assets/icons/berdana_body.png'), stackable: true, stack: 100
  }
};

window.BrixInventory = (function () {
  'use strict';

  var HOTBAR_SIZE = 6;
  var COLS = 5;            // ✅ v0.3.2: сетка 5x4 как в референсе (Rust)
  var ROWS = 4;
  var instance = null;

  function langName(item) {
    return BrixState.data.lang === 'en' ? (item.nameEn || item.name) : item.name;
  }

  /** иконка предмета — img на весь слот (как renderIcon в репозитории) */
  function renderIcon(item) {
    if (!item) return '';
    if (item.icon) {
      return '<img src="' + item.icon + '" alt="' + langName(item) + '" draggable="false">' +
        '<i class="bx-icon-fallback"></i>';
    }
    return '';
  }

  function Inventory() {
    this.slots = new Array(HOTBAR_SIZE + COLS * ROWS).fill(null);
    this.activeSlot = 0;
    this.isOpen = false;
    this.onSelect = null;     // callback(item|null, index)
    this.dom = null;
    this._dragging = false;

    // стартовый набор ✅ v0.4.5: РЕВОЛЬВЕР в слоте 1 (обойма полная — 6)
    // и 50 ПАТРОНОВ в слоте 2; инструменты сдвинулись вправо,
    // дерево/камень ушли в рюкзак
    this.slots[0] = { item: BrixItems.revolver, count: 1, mag: 6 };
    this.slots[1] = { item: BrixItems.ammo, count: 50 };
    this.slots[2] = { item: BrixItems.stoneAxe, count: 1 };
    this.slots[3] = { item: BrixItems.stonePickaxe, count: 1 };
    this.slots[4] = { item: BrixItems.ironPickaxe, count: 1 };
    this.slots[5] = { item: BrixItems.ironAxe, count: 1 };
    // рюкзак: немного ресурсов на старт
    this.slots[6] = { item: BrixItems.wood, count: 10 };
    this.slots[7] = { item: BrixItems.stone, count: 5 };

    this._mount();
    this._bind();
    var self = this;
    requestAnimationFrame(function () { self.renderAll(); });
  }

  /* ================= DOM ================= */

  Inventory.prototype._mount = function () {
    var hud = document.getElementById('gameHud');
    var root = document.createElement('div');
    root.id = 'brixInvRoot';
    root.innerHTML =
      // хотбар
      '<div class="bx-hotbar" id="bxHotbar"></div>' +
      // инвентарь
      '<div class="bx-inv hidden" id="bxInv">' +
        '<div class="bx-inv-panel">' +
          '<div class="bx-inv-head">' +
            '<div class="bx-inv-title" id="bxInvTitle"></div>' +
            '<button class="bx-inv-close" id="bxInvClose" aria-label="✕"></button>' +
          '</div>' +
          '<div class="bx-inv-grid" id="bxInvGrid"></div>' +
          '<div class="bx-inv-sub" id="bxInvSub"></div>' +
          '<div class="bx-inv-hotrow" id="bxInvHotrow"></div>' +
          '<div class="bx-inv-hint" id="bxInvHint"></div>' +
        '</div>' +
      '</div>' +
      // всплывающие добычи
      '<div class="bx-pickups" id="bxPickups"></div>';
    hud.appendChild(root);

    this.dom = {
      root: root,
      hotbar: root.querySelector('#bxHotbar'),
      inv: root.querySelector('#bxInv'),
      invGrid: root.querySelector('#bxInvGrid'),
      invHotrow: root.querySelector('#bxInvHotrow'),
      pickups: root.querySelector('#bxPickups'),
      title: root.querySelector('#bxInvTitle'),
      sub: root.querySelector('#bxInvSub'),
      hint: root.querySelector('#bxInvHint'),
      closeBtn: root.querySelector('#bxInvClose')
    };
    var self = this;
    this.dom.closeBtn.addEventListener('click', function () { self.toggle(); });
  };

  Inventory.prototype._bind = function () {
    var self = this;

    this._onKeyDown = function (e) {
      if (BrixGame.state.phase !== 'playing') return;
      // цифры 1-6 — слоты (когда инвентарь закрыт)
      if (!self.isOpen && e.code.indexOf('Digit') === 0) {
        var n = parseInt(e.code.replace('Digit', ''), 10);
        if (n >= 1 && n <= HOTBAR_SIZE) { self.select(n - 1); return; }
      }
      // E — инвентарь
      // ✅ v0.4.4: мини-меню (M) или карта открыты — инвентарь не открываем
      // (как просил игрок: с открытым меню ничего из игровой UI не открывается)
      if (e.code === 'KeyE') {
        if (window.BrixMiniMenu && BrixMiniMenu.isAnyOpen()) return;
        e.preventDefault();
        self.toggle();
        return;
      }
      // ESC в открытом инвентаре — закрыть
      if (self.isOpen && e.code === 'Escape') {
        self.toggle();
      }
    };
    this._onWheel = function (e) {
      if (BrixGame.state.phase !== 'playing' || self.isOpen) return;
      if (!document.pointerLockElement) return;
      var dir = e.deltaY > 0 ? 1 : -1;
      self.select((self.activeSlot + dir + HOTBAR_SIZE) % HOTBAR_SIZE);
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('wheel', this._onWheel, { passive: true });
  };

  /* ================= слоты ================= */

  Inventory.prototype.select = function (index) {
    if (index < 0 || index >= HOTBAR_SIZE) return;
    this.activeSlot = index;
    this.renderHotbar();
    var slot = this.slots[index];
    if (this.onSelect) this.onSelect(slot ? slot.item : null, index);
  };

  Inventory.prototype.getSelectedItem = function () {
    var slot = this.slots[this.activeSlot];
    return slot ? slot.item : null;
  };

  Inventory.prototype.addItem = function (itemId, count) {
    count = count || 1;
    var item = BrixItems[itemId];
    if (!item) return false;
    var changed = false;

    // стекуемые — сначала в существующие стеки (хотбар → рюкзак)
    if (item.stackable) {
      for (var pass = 0; pass < 2; pass++) {
        var from = pass === 0 ? 0 : HOTBAR_SIZE;
        var to = pass === 0 ? HOTBAR_SIZE : this.slots.length;
        for (var i = from; i < to && count > 0; i++) {
          var s = this.slots[i];
          if (s && s.item.id === itemId && s.count < item.stack) {
            var add = Math.min(item.stack - s.count, count);
            s.count += add; count -= add; changed = true;
          }
        }
      }
    }
    // пустые слоты: сначала хотбар (для незатекуемых), потом рюкзак
    for (var pass2 = item.stackable ? 1 : 0; pass2 < 2 && count > 0; pass2++) {
      var from2 = pass2 === 0 ? 0 : HOTBAR_SIZE;
      var to2 = pass2 === 0 ? HOTBAR_SIZE : this.slots.length;
      for (var j = from2; j < to2 && count > 0; j++) {
        if (!this.slots[j]) {
          var put = item.stackable ? Math.min(item.stack, count) : count;
          this.slots[j] = { item: item, count: put };
          count -= put; changed = true;
        }
      }
    }

    if (changed) { this.renderAll(); this._notifySelect(); }
    return changed;
  };

  Inventory.prototype.countItem = function (itemId) {
    var total = 0;
    for (var i = 0; i < this.slots.length; i++) {
      var s = this.slots[i];
      if (s && s.item.id === itemId) total += s.count;
    }
    return total;
  };

  Inventory.prototype.swapItems = function (source, target) {
    if (!source || !target) return;
    var idxOf = function (s) {
      return s.type === 'hotbar' ? s.index : HOTBAR_SIZE + s.index;
    };
    var a = idxOf(source), b = idxOf(target);
    if (a === b) return;
    var A = this.slots[a], B = this.slots[b];
    if (A && B && A.item.id === B.item.id && B.item.stackable) {
      var space = B.item.stack - B.count;
      var move = Math.min(space, A.count);
      B.count += move; A.count -= move;
      if (A.count <= 0) this.slots[a] = null;
    } else {
      this.slots[a] = B; this.slots[b] = A;
    }
    this.renderAll();
    this._notifySelect();
  };

  Inventory.prototype._notifySelect = function () {
    // после изменений пересылаем выбранный предмет (например, топор убрали)
    if (this.onSelect) {
      var slot = this.slots[this.activeSlot];
      this.onSelect(slot ? slot.item : null, this.activeSlot);
    }
  };


  /* ✅ v0.4.2: сколько штук предмета МОЖНО вместить прямо сейчас
     (свободные стеки + пустые слоты). Нужно ДО отправки взятия из
     ящика — раньше предмет «исчезал», если слоты были заняты */
  Inventory.prototype.freeSpaceFor = function (itemId) {
    var item = BrixItems[itemId];
    if (!item) return 0;
    var space = 0;
    var i, s;
    if (item.stackable) {
      for (i = 0; i < this.slots.length; i++) {
        s = this.slots[i];
        if (s && s.item.id === itemId && s.count < item.stack) space += item.stack - s.count;
      }
    }
    for (i = 0; i < this.slots.length; i++) {
      if (!this.slots[i]) space += item.stackable ? item.stack : 1;
    }
    return space;
  };

  /* ✅ v0.4.2: удалить n штук предмета по всем слотам (ОТКАТ
     оптимистичного взятия, если сервер отказал) */
  Inventory.prototype.removeCountByItem = function (itemId, n) {
    var left = n;
    for (var i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      var s = this.slots[i];
      if (s && s.item.id === itemId) {
        var take = Math.min(left, s.count);
        s.count -= take;
        left -= take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    if (left < n) { this.renderAll(); this._notifySelect(); }
    return n - left;
  };

  /* ✅ v0.4.1: вычесть n штук из слота index (положил предмет в ящик
     через drag&drop в лут-меню). Возвращает сколько реально вычтено */
  Inventory.prototype.removeCount = function (index, n) {
    var s = this.slots[index];
    if (!s || n <= 0) return 0;
    var take = Math.min(n, s.count);
    s.count -= take;
    if (s.count <= 0) this.slots[index] = null;
    this.renderAll();
    if (this.isOpen) this.renderAll();
    this._notifySelect();
    return take;
  };

  /* ================= рендер ================= */

  Inventory.prototype._slotEl = function (slot, type, index) {
    var self = this;
    var div = document.createElement('div');
    // ✅ v0.3.2: по референсу — плоские слоты БЕЗ цифр и БЕЗ подсветок
    div.className = 'bx-slot' + (slot ? '' : ' empty');

    var inner = '';
    if (slot) {
      inner += renderIcon(slot.item);
      // ✅ v0.3.3: количество В УГЛУ СЛОТА вернули (12 дерева)
      if (slot.item.stackable && slot.count > 1) {
        inner += '<span class="bx-count">' + slot.count + '</span>';
      }
      // ✅ v0.4.5: У РЕВОЛЬВЕРА — остаток ОБОЙМЫ (0–6) СНИЗУ иконки:
      // игрок всегда видит, сколько патронов заряжено
      if (slot.item.tool === 'revolver') {
        inner += '<span class="bx-mag' + (!slot.mag ? ' empty' : '') + '">' +
          (slot.mag || 0) + '</span>';
      }
      div.title = langName(slot.item);
    }
    div.innerHTML = inner;

    if (slot) {
      div.draggable = true;
      div.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', JSON.stringify({ type: type, index: index }));
        e.dataTransfer.effectAllowed = 'move';
        requestAnimationFrame(function () { div.classList.add('dragging'); });
        self._dragging = true;
      });
      div.addEventListener('dragend', function () {
        div.classList.remove('dragging');
        self._dragging = false;
      });
    }
    div.addEventListener('dragover', function (e) { e.preventDefault(); div.classList.add('drag-over'); });
    div.addEventListener('dragleave', function () { div.classList.remove('drag-over'); });
    div.addEventListener('drop', function (e) {
      e.preventDefault();
      div.classList.remove('drag-over');
      var data = e.dataTransfer.getData('text/plain');
      if (!data) return;
      try { self.swapItems(JSON.parse(data), { type: type, index: index }); } catch (err) {}
    });
    if (type === 'hotbar') {
      div.addEventListener('click', function () { self.select(index); });
    }
    return div;
  };

  Inventory.prototype.renderHotbar = function () {
    if (!this.dom) return;
    var el = this.dom.hotbar;
    el.innerHTML = '';
    for (var i = 0; i < HOTBAR_SIZE; i++) {
      el.appendChild(this._slotEl(this.slots[i], 'hotbar', i));
    }
  };

  Inventory.prototype.renderInventory = function () {
    if (!this.dom) return;
    var grid = this.dom.invGrid;
    grid.innerHTML = '';
    for (var i = HOTBAR_SIZE; i < this.slots.length; i++) {
      grid.appendChild(this._slotEl(this.slots[i], 'inv', i - HOTBAR_SIZE));
    }
    var row = this.dom.invHotrow;
    row.innerHTML = '';
    for (var k = 0; k < HOTBAR_SIZE; k++) {
      row.appendChild(this._slotEl(this.slots[k], 'hotbar', k));
    }
  };

  Inventory.prototype.renderAll = function () {
    this.renderHotbar();
    if (this.isOpen) this.renderInventory();
  };

  /* ================= открытие/закрытие ================= */

  Inventory.prototype.toggle = function () {
    this.isOpen = !this.isOpen;
    this.dom.inv.classList.toggle('hidden', !this.isOpen);
    this.dom.hotbar.classList.toggle('hidden', this.isOpen);
    if (this.isOpen) {
      this.renderInventory();
      this._applyLang();
      if (document.pointerLockElement) document.exitPointerLock();
    } else {
      // возврат захвата мыши (браузер требует жест — keydown им является).
      // ✅ fix 0.4.5a: авто-повтор — после Esc браузер ~1.25 c не даёт
      // pointer lock (SecurityError «cannot be acquired immediately after
      // the user has exited the lock»); раньше попытка была одна и падала
      // в консоль необработанной ошибкой, мышь оставалась свободной
      var retryLock = function (tries) {
        tries = tries || 0;
        if (BrixGame.state.phase !== 'playing' || BrixInventory.get().isOpen) return;
        var canvas = document.querySelector('#gameMount canvas');
        if (!canvas || document.pointerLockElement === canvas) return;
        try {
          var p = canvas.requestPointerLock();
          if (p && p.catch) p.catch(function () {
            if (tries < 6) setTimeout(function () { retryLock(tries + 1); }, 300);
          });
        } catch (e) {
          if (tries < 6) setTimeout(function () { retryLock(tries + 1); }, 300);
        }
      };
      setTimeout(retryLock, 80);
    }
  };

  Inventory.prototype._applyLang = function () {
    this.dom.title.textContent = BrixState.t('inv.title');
    this.dom.sub.textContent = '';
    this.dom.hint.textContent = BrixState.t('inv.hint');
    this.dom.closeBtn.textContent = '✕';
  };

  /* ================= всплывающая добыча ================= */

  Inventory.prototype.showPickup = function (itemId, count) {
    var item = BrixItems[itemId];
    if (!item || !this.dom) return;
    var el = document.createElement('div');
    el.className = 'bx-pickup';
    el.innerHTML =
      '<img src="' + item.icon + '" alt="">' +
      '<span>+' + count + ' ' + (BrixState.data.lang === 'en' ? (item.nameEn || item.name) : item.name) + '</span>';
    var host = this.dom.pickups;
    host.appendChild(el);
    setTimeout(function () { el.classList.add('out'); }, 1100);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1500);
    // не больше 5 всплывашек одновременно
    while (host.children.length > 5) host.removeChild(host.firstChild);
  };

  Inventory.prototype.destroy = function () {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('wheel', this._onWheel);
    if (this.dom && this.dom.root.parentNode) this.dom.root.parentNode.removeChild(this.dom.root);
    this.dom = null;
  };

  /* ================= singleton ================= */

  return {
    init: function () {
      if (!instance) instance = new Inventory();
      return instance;
    },
    get: function () { return instance; },
    ITEMS: BrixItems
  };
})();
