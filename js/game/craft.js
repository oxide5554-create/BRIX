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
//
//  ✅ v0.4.60 СКИНЫ — КОСТЮМЫ НА АККАУНТЕ: в превью чертежа БОЛЬШАЯ
//  ИКОНКА ПРЕДМЕТА — КНОПКА. Клик по ней открывает СПИСОК ВСЕХ СКИНОВ
//  ЭТОГО ПРЕДМЕТА: «без скина» + купленные (некупленные видны серыми —
//  купить в магазине, меню игры). Выбрал скин → обычный СКАФТ →
//  предмет создаётся сразу с этим скином (иконка слота + обёртка
//  в руках, у других игроков тоже). Скин хранится в слоте инвентаря
//  и НИКОГДА не тратится. Каталог: js/data/skins.js, обёртки:
//  js/data/weaponskins.js. Скины есть у револьвера, томпсона, С4,
//  каменного топора и каменной кирки.
// ============================================================
window.BrixCraft = (function () {
  'use strict';

  var root = null;          // слой панели
  var open = false;
  var selId = null;         // выбранный чертёж
  var cat = 'all';          // вкладка
  var qty = 1;
  /* ✅ v0.4.60: выбранный СКИН для текущего чертежа (null — без скина).
     Скин — «костюм» с аккаунта (ownedSkinIds); сбрасывается при смене
     чертежа. Крафтит предмет со скином БЕЗ траты скина */
  var selSkin = null;

  /* ---------- скины (костюмы на аккаунте — js/data/skins.js) ---------- */

  /** все скины, которые надеваются на предмет этого чертежа */
  function skinsOf(rec) {
    return (window.BrixData && BrixData.skinsForItem) ? BrixData.skinsForItem(rec.out) : [];
  }
  /** id скинов, купленных на аккаунте */
  function ownedSkins() {
    var S = window.BrixState && BrixState.data;
    return (S && S.ownedSkinIds) || [];
  }
  function skinName(sk) {
    return lang() === 'en' ? (sk.name.en || sk.name.ru) : sk.name.ru;
  }
  /** выбранный скин ЭТОГО чертежа (объект) или null */
  function chosenSkin(rec) {
    if (!selSkin) return null;
    var list = skinsOf(rec);
    for (var i = 0; i < list.length; i++) if (list[i].id === selSkin) return list[i];
    return null;
  }

  /* ---------- рецепты ---------- */
  var CATS = {
    tool:   { ru: 'ИНСТРУМЕНТЫ', en: 'TOOLS' },
    weapon: { ru: 'ОРУЖИЕ',      en: 'WEAPONS' },
    comp:   { ru: 'КОМПОНЕНТЫ',  en: 'COMPONENTS' },
    /* ✅ v0.4.44: вкладка патронов/взрывчатки */
    ammo:   { ru: 'ПАТРОНЫ',     en: 'AMMO' }
  };
  var RECIPES = [
    /* ✅ v0.4.60: скины больше НЕ в рецептах — они берутся из каталога
       BrixData.SKINS по базовому предмету (skinsForItem). Чертёж один,
       клик по его иконке открывает список скинов */
    { id: 'stoneAxe',     cat: 'tool',   out: 'stoneAxe',     req: [['wood', 10]] },
    { id: 'stonePickaxe', cat: 'tool',   out: 'stonePickaxe', req: [['stone', 15], ['wood', 10]] },
    { id: 'ironAxe',      cat: 'tool',   out: 'ironAxe',      req: [['wood', 20], ['metal', 5]] },
    { id: 'ironPickaxe',  cat: 'tool',   out: 'ironPickaxe',  req: [['wood', 20], ['metal', 5]] },
    { id: 'buildingPlan', cat: 'tool',   out: 'buildingPlan', req: [['wood', 5]] },
    { id: 'rifleAk',      cat: 'weapon', out: 'rifleAk',      req: [['pipe', 1], ['rifleBody', 1], ['scrap', 40], ['spring', 2]] },
    /* ✅ v0.4.35 томпсон — чуть дешевле калаша (скорострельный, но слабый) */
    { id: 'thompson',     cat: 'weapon', out: 'thompson',     req: [['pipe', 1], ['scrap', 30], ['metal', 25], ['spring', 1]] },
    { id: 'shotgun',      cat: 'weapon', out: 'shotgun',      req: [['pipe', 2], ['metal', 40], ['spring', 1]] },
    { id: 'revolver',     cat: 'weapon', out: 'revolver',     req: [['scrap', 15], ['metal', 30]] },
    /* ✅ v0.4.36 револьвер-карабин 3× — снайпер: переделка револьвера
       (удлинённый ствол + оптика + приклад). Дорого: нужна сама база
       (револьвер), труба на удлинение и пружина на УСМ оптики */
    { id: 'rev3x',        cat: 'weapon', out: 'rev3x',        req: [['revolver', 1], ['pipe', 2], ['spring', 1], ['metal', 20]] },
    /* ✅ v0.4.40 булава — тяжёлое оружие: дерево на рукоять, металл на
       голову и обручи. Дорого — она ОДНОУДАРНАЯ (в голову 97) */
    { id: 'mace',         cat: 'weapon', out: 'mace',         req: [['wood', 30], ['metal', 25], ['scrap', 10]] },
    /* ✅ v0.4.46 ШПРИЦ (+46 хп): медицина из металлолома и фрагментов
       (игла/корпус). Ещё падает из военных ящиков */
    { id: 'syringe',      cat: 'tool',   out: 'syringe',      req: [['scrap', 20], ['metal', 10]] },
    /* ✅ v0.4.44 С4 — НОВЫЙ РЕЦЕПТ (просьба игрока): 100 пороха +
       25 скрапа + 15 метал фрагментов. Порох делается из плавленой
       серы (печка), скрап/метал — из бочек и плавки железа */
    { id: 'c4',           cat: 'weapon', out: 'c4',           req: [['gunpowder', 100], ['scrap', 25], ['metal', 15]] },
    { id: 'pipe',         cat: 'comp',   out: 'pipe',         req: [['metal', 12], ['scrap', 24]] },
    { id: 'spring',       cat: 'comp',   out: 'spring',       req: [['metal', 13], ['scrap', 26]] },
    /* ============================================================
       ✅ v0.4.44 ПОРОХ И ПАТРОНЫ (просьба игрока, ровно его количества):
       ПОРОХ — из плавленой серы (печка: 1 сера плавится 4 с), 1:1
       ПАТРОН ДРОБОВИКА (дробь) — 4 пороха + 6 метал фрагментов → 2 шт
       ПАТРОН КАЛАША (винтовочный) — 10 пороха + 8 фрагментов → 12 шт
       ПАТРОНЫ (пистолетные, револьвер/томпсон не в счёт — у томпсона
       винтовочные) — 12 пороха + 4 фрагмента → 24 шт
       ============================================================ */
    { id: 'gunpowder',    cat: 'ammo',   out: 'gunpowder',    req: [['sulfurM', 1]], yield: 1 },
    { id: 'shotgunShell', cat: 'ammo',   out: 'shotgunShell', req: [['gunpowder', 4], ['metal', 6]], yield: 2 },
    { id: 'rifleBullet',  cat: 'ammo',   out: 'rifleBullet',  req: [['gunpowder', 10], ['metal', 8]], yield: 12 },
    { id: 'ammoPistol',   cat: 'ammo',   out: 'ammo',         req: [['gunpowder', 12], ['metal', 4]], yield: 24 }
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
    /* ✅ v0.4.60: скин — костюм в слоте, у базового предмета ОДНА иконка;
       иконку скина берут отдельно через BrixWeaponSkins.iconFor(skinId) */
    return itemDef(id).icon || '';
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
            /* ✅ v0.4.60: ИКОНКА ПРЕДМЕТА — КНОПКА. У предметов со скинами
               клик открывает СПИСОК ВСЕХ СКИНОВ ЭТОГО ПРЕДМЕТА (как в
               референсе): выбрал — СКАФТ создаст предмет с этим скином */
            '<div class="bxc-shot-wrap" id="bxcShotWrap">' +
              '<button class="bxc-shot" id="bxcShot" type="button">' +
                '<img id="bxcImg" alt="" draggable="false">' +
                '<span class="bxc-shot-arrow font-h">▾</span>' +
              '</button>' +
              '<div class="bxc-skin-menu hidden" id="bxcSkinMenu"></div>' +
            '</div>' +
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
    /* ✅ v0.4.60: клик по ИКОНКЕ ПРЕДМЕТА — открыть/закрыть список скинов */
    root.querySelector('#bxcShot').onclick = function () {
      if (!skinsOf(recById(selId) || RECIPES[0]).length) return;   // скинов нет — молчим
      sfx('hover');
      toggleSkinMenu();
    };
    /* клик мимо меню (и мимо иконки) — закрыть список скинов */
    document.addEventListener('mousedown', function (e) {
      if (!open || !root) return;
      var w = root.querySelector('#bxcShotWrap');
      if (w && !w.contains(e.target)) closeSkinMenu();
    });

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
    var tabs = [['all', ru('ALL', 'ВСЕ')], ['tool', CATS.tool], ['weapon', CATS.weapon], ['ammo', CATS.ammo], ['comp', CATS.comp]];
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

  /* ---------- левая панель: превью + список скинов + таблица ресурсов ---------- */

  /* ✅ v0.4.60: СПИСОК СКИНОВ ПРЕДМЕТА — открывается кликом по большой
     иконке в превью (как на референсе игрока). В списке: «без скина» +
     все скины этого предмета; купленные — активны, некупленные серые */

  function closeSkinMenu() {
    var m = root && root.querySelector('#bxcSkinMenu');
    if (m) m.classList.add('hidden');
  }

  function toggleSkinMenu() {
    var m = root.querySelector('#bxcSkinMenu');
    if (!m) return;
    if (!m.classList.contains('hidden')) { closeSkinMenu(); return; }
    var rec = recById(selId) || RECIPES[0];
    var own = ownedSkins();
    var items = [{ id: '', icon: itemIcon(rec.out), nm: ru('NO SKIN', 'БЕЗ СКИНА'), own: true }];
    skinsOf(rec).forEach(function (sk) {
      items.push({
        id: sk.id,
        icon: (window.BrixWeaponSkins && BrixWeaponSkins.iconFor(sk.id)) || sk.iconUrl,
        nm: skinName(sk),
        own: own.indexOf(sk.id) !== -1
      });
    });
    m.innerHTML =
      '<div class="bxc-sm-cap font-h">' + ru('PICK A SKIN', 'ВЫБЕРИ СКИН') + '</div>' +
      items.map(function (it) {
        return '<button class="bxc-sm-item font-h' + (it.id === (selSkin || '') ? ' on' : '') +
          (it.own ? '' : ' lock') + '" data-sk="' + it.id + '">' +
          '<img src="' + it.icon + '" alt="" draggable="false">' +
          '<span class="nm">' + esc(it.nm) + '</span>' +
          '<span class="st">' + (it.own ? (it.id === (selSkin || '') ? '●' : '✓') : ru('NOT OWNED', 'НЕ КУПЛЕНО')) + '</span>' +
          '</button>';
      }).join('') +
      '<div class="bxc-sm-hint">' +
      ru('Crafting with a skin is a regular craft — the skin is not spent and stays owned',
         'Крафт со скином — обычный крафт, скин не тратится и остаётся купленным') + '</div>';

    [].slice.call(m.querySelectorAll('.bxc-sm-item')).forEach(function (b) {
      b.onmouseenter = function () { sfx('hover'); };
      b.onclick = function () {
        var id = b.getAttribute('data-sk') || null;
        if (b.classList.contains('lock')) {
          sfx('back');
          toast(ru('This skin is not bought — open the game menu → SKINS and buy it',
            'Скин не куплен — открой меню игры → «СКИНЫ» и купи его'), 6);
          return;
        }
        sfx('click');
        selSkin = id;
        closeSkinMenu();
        paintLeft();
      };
    });

    m.classList.remove('hidden');
  }

  function paintLeft() {
    var rec = recById(selId) || RECIPES[0];
    var iv = inv();
    var sk = chosenSkin(rec);
    var list = skinsOf(rec);

    var name = root.querySelector('#bxcName');
    var img = root.querySelector('#bxcImg');
    /* превью показывает ВЫБРАННЫЙ вид: скин (имя + PNG-рендер) или обычный */
    name.textContent = sk ? skinName(sk) : itemName(rec.out);
    var icon = (sk && window.BrixWeaponSkins && BrixWeaponSkins.iconFor(sk.id)) || itemIcon(rec.out);
    img.src = icon;
    img.alt = name.textContent;

    /* иконка-кнопка: у предметов со скинами — стрелка «▾» и подсказка */
    var shot = root.querySelector('#bxcShot');
    if (shot) {
      shot.classList.toggle('hasskins', list.length > 0);
      shot.classList.toggle('skinned', !!sk);
      shot.title = list.length
        ? (sk ? ru('Click: pick another skin', 'Нажми: выбрать другой скин')
              : ru('Click: pick a skin', 'Нажми: выбрать скин'))
        : '';
    }

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
        /* ✅ v0.4.60: у скинутого слота — иконка скина + имя со скином */
        var sic = (s.skin && window.BrixWeaponSkins && BrixWeaponSkins.iconFor(s.skin)) || s.item.icon;
        var snm = itemName(s.item.id);
        if (s.skin && window.BrixData && BrixData.skinById) {
          var sk2 = BrixData.skinById(s.skin);
          if (sk2) snm += ' — ' + skinName(sk2);
        }
        d.title = snm + (s.item.stackable ? ' ×' + s.count : '');
        d.innerHTML =
          '<img src="' + sic + '" alt="" draggable="false">' +
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
          '<div class="bxc-row-name">' + esc(itemName(rec.out)) +
            /* ✅ v0.4.60: у предмета есть скины — маркер; сам выбор в превью,
               кликом по иконке предмета */
            (skinsOf(rec).length ? ' <span class="bxc-skin-badge font-h">' + ru('HAS SKINS', 'ЕСТЬ СКИН') + '</span>' : '') +
          '</div>' +
          '<div class="bxc-row-req">' + reqHtml + '</div>' +
        '</div>' +
        '<div class="bxc-row-cc font-h">' + (cc >= 1 ? '×' + cc : ru('NO RES', 'НЕТ РЕС.')) + '</div>';
      row.onclick = function () {
        sfx('hover');
        selId = rec.id;
        selSkin = null;   // новый чертёж — выбор скина заново (по умолчанию без скина)
        closeSkinMenu();
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
    /* ✅ v0.4.60: предмет создаётся БАЗОВЫЙ; выбранный скин (если куплен
       и подходит предмету) прикрепляется к слоту — «костюм». Скин НЕ
       тратится: ресурсов списывается ровно как в обычном крафте */
    var sk = chosenSkin(rec);
    var skinId = sk ? sk.id : null;
    var outId = rec.out;
    var made = 0;
    var madeRuns = 0;   /* ✅ v0.4.44: число запусков (рецепт может давать yield > 1) */
    var want = qty;
    for (var i = 0; i < want; i++) {
      // хватает ресурсов на ещё один?
      var ok = true;
      for (var k = 0; k < rec.req.length; k++) {
        if (iv.countItem(rec.req[k][0]) < rec.req[k][1]) { ok = false; break; }
      }
      if (!ok) break;
      // есть куда положить? (скинутое стакается только с таким же скином)
      if (iv.freeSpaceFor(outId, skinId) < 1) {
        toast(ru('No space in inventory', 'Нет места в инвентаре'), 4);
        break;
      }
      // списываем ресурсы
      for (var j = 0; j < rec.req.length; j++) {
        iv.removeCountByItem(rec.req[j][0], rec.req[j][1]);
      }
      /* ✅ v0.4.44: рецепт выдаёт yield предметов за 1 крафт
         (дробь ×2, винтовочные ×12, пистолетные ×24) */
      iv.addItem(outId, rec.yield || 1, 0, skinId);
      made += (rec.yield || 1);
      madeRuns++;
    }
    if (made > 0) {
      try { iv.showPickup(outId, made, skinId); } catch (e) {}
      toast(ru('Crafted: ' + made + ' × ' + itemName(outId) + (sk ? ' — ' + skinName(sk) : ''),
        'Скрафчено: ' + made + ' × ' + itemName(outId) + (sk ? ' — ' + skinName(sk) : '')), 4);
      sfx('click');
    } else if (madeRuns === 0) {
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
    if (root) {
      root.classList.add('hidden');
      closeSkinMenu();   // ✅ v0.4.60: список скинов не переживает панель
    }
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
      /* ✅ v0.4.64 ПВП-АРЕНА: крафта на арене НЕТ — Q молчит */
      if (window.BRIX_PVP) return;
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
      selSkin = null;   // ✅ v0.4.59: сброс выбора скина
      if (root) root.classList.add('hidden');
    }
  };
})();
