// ============================================================
//  brix • js/game/inventory.js
//  ХОТБАР + ИНВЕНТАРЬ BRIX — собственный стиль (rust-дизайн игры),
//  механика портирована из репозитория (scr/ui/hotbar.js и
//  scr/ui/inventory.js): ✅ v0.4.7 — хотбар СНОВА 6 слотов (клавиши 1-6,
//  колесо мыши), а «ПЛАН СТРОИТЕЛЯ» переехал В ИНВЕНТАРЬ (первая ячейка
//  рюкзака): КЛИК по плану — взять в руки (Z открывает меню стройки),
//  повторный клик или выбор другого слота — убрать.
//  ✅ v0.4.8 — ПЛАН СТРОИТЕЛЯ БОЛЬШЕ НЕ ЗАКРЕПЛЁН: его МОЖНО перетащить
//  в любой слот хотбара (и обратно в рюкзак), как обычный предмет.
//  ✅ v0.4.9 — СТРОИТЬ МОЖНО ТОЛЬКО С ПЛАНОМ В ХОТБАРЕ: перетащи план
//  в слот 1–6 и выбери его — план в руках (ватман), Z открывает стройку.
//  Клик по плану В РЮКЗАКЕ больше не берёт его в руки (подсказка).
//  В ящик план положить по-прежнему нельзя (см. lootmenu.js).
//  Сетка 5x4, drag & drop, стеки, E — открыть/закрыть.
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
  /* ✅ v0.4.53 ФАКЕЛ (модель пользователя non-textured_burning_torch_4.glb
     → assets/models/torch.glb, оптимизирована: убрана анимация «Burning» —
     пламя СТАТИЧНОЕ и свет РОВНЫЙ, без мерцания):
     • держится КАК ТОПОР (одна правая рука), выдаётся в слот 1;
     • НИКАКОГО УРОНА — факел НЕ БЬЁТ: ЛКМ с ним ничего не делает
       (см. hitWithTool в gameworld.js), он только СВЕТИТ;
     • НОЧЬЮ вокруг игрока включается ровный тёплый свет (одна PointLight
       без теней — дёшево для FPS), днём гаснет (см. gameworld.js) */
  torch: {
    id: 'torch', name: 'Факел', nameEn: 'Torch',
    icon: BrixAx('assets/icons/torch.png'), stackable: false, tool: 'torch'
  },
  /* ✅ v0.4.5 РЕВОЛЬВЕР (модель пользователя colt_detective_gun.glb):
     стреляет патронами, обойма 6; ✅ v0.4.40 урон: В ГОЛОВУ 18, в тело 9
     (таблица игрока: тело = голова / 2); в слоте показывает остаток
     обоймы (0–6) — slot.mag */
  revolver: {
    id: 'revolver', name: 'Револьвер', nameEn: 'Revolver',
    icon: BrixAx('assets/icons/revolver.png'), stackable: false, tool: 'revolver'
  },
  /* ✅ v0.4.19 ДРОБОВИК (модель shotgun.glb из репозитория
     oxide5554-create/-glm, сконвертирована в GLB с текстурами):
     стреляет ДРОБЬЮ — 8 дробин за выстрел, обойма 2;
     ✅ v0.4.40 урон ПО ДИСТАНЦИИ: в упор (≤10 м) 13 за дробину в обе зоны
     — весь заряд 104, СРАЗУ УБИВАЕТ; средняя (10–28 м) — 4.5 в голову /
     2.25 в тело за дробину; далеко (28–45 м) — по 1.25; дальше 45 м дробь
     НЕ ДОСТАЁТ. В слоте показывает остаток (0–2) — slot.mag, как у револьвера */
  shotgun: {
    id: 'shotgun', name: 'Дробовик', nameEn: 'Shotgun',
    icon: BrixAx('assets/icons/shotgun.png'), stackable: false, tool: 'shotgun'
  },
  /* ✅ v0.4.19 патроны для дробовика (штабелируются; иконка от пользователя) */
  shotgunShell: {
    id: 'shotgunShell', name: 'Патрон дробовика', nameEn: 'Shotgun Shell',
    icon: BrixAx('assets/icons/shotgun_shell.png'), stackable: true, stack: 64
  },
  /* ✅ v0.4.21 КАЛАШ (модель ak47.glb из репозитория -glm, хват/руки/прицел
     как там): стреляет ОДИНОЧНЫМИ с автоогнем при зажатой ЛКМ (0.10 с между
     выстрелами, 600 в/мин), обойма 30; ✅ v0.4.40 урон: В ГОЛОВУ 33,
     в тело 17; в слоте показывает остаток (0–30) — slot.mag, как у револьвера/дробовика */
  rifleAk: {
    id: 'rifleAk', name: 'Калаш', nameEn: 'AK Rifle',
    icon: BrixAx('assets/icons/rifle_ak.png'), stackable: false, tool: 'rifle'
  },
  /* ✅ v0.4.21 винтовочные патроны для калаша (штабелируются; иконка от пользователя) */
  rifleBullet: {
    id: 'rifleBullet', name: 'Патрон калаша', nameEn: 'Rifle Bullet',
    icon: BrixAx('assets/icons/rifle_bullet.png'), stackable: true, stack: 128
  },
  /* ✅ v0.4.35 ТОМПСОН (пистолет-пулемёт, модель пользователя
     thompson_submachine_gun-_luis_novoa.glb): держится КАК КАЛАШ, но
     СКОРОСТРЕЛЬНОСТЬ БОЛЬШЕ (800 в/мин против 600) и УРОН МЕНЬШЕ
     (12 против 20); обойма 30; патроны — те же винтовочные (rifleBullet);
     в слоте показывает остаток (0–30) — slot.mag, как у калаша */
  thompson: {
    id: 'thompson', name: 'Томпсон', nameEn: 'Thompson',
    icon: BrixAx('assets/icons/thompson.png'), stackable: false, tool: 'smg'
  },
  /* ✅ v0.4.36 РЕВОЛЬВЕР-КАРАБИН 3× (снайперский, модель пользователя
     crafted_revolver_carabine.glb): револьвер со встроенной оптикой —
     ПКМ открывает прицел 3× с хорошим приближением и суперточностью;
     урон 45 (3 выстрела = убийство), барабан 6, кулдаун 0.9 с;
     хват/звук как у револьвера (звук чуть тяжелее); в слоте показывает
     остаток барабана (0–6) — slot.mag, как у револьвера */
  rev3x: {
    id: 'rev3x', name: 'Револьвер-карабин 3×', nameEn: 'Scoped Revolver 3×',
    icon: BrixAx('assets/icons/revolver3x.png'), stackable: false, tool: 'rev3x'
  },
  /* ✅ v0.4.40 БУЛАВА (модель пользователя rusted_mace_-_fantasy_weapon.glb
     → assets/models/mace.glb): тяжёлое оружие ближнего боя — ДОЛГИЙ замах
     (~1.2 с до удара) но ОГРОМНЫЙ урон: в голову 97 (почти всегда насмерть),
     в тело 49; по постройкам — 2 хп за удар; бочка ломается с одного удара;
     держится как топор. Иконка — рендер самой модели (мэйкскрин) */
  mace: {
    id: 'mace', name: 'Булава', nameEn: 'Mace',
    icon: BrixAx('assets/icons/mace.png'), stackable: false, tool: 'mace'
  },
  /* ✅ v0.4.41 С4 (модель пользователя C4.glb → assets/models/c4.glb):
     взрывчатка. В руках — ПО ЦЕНТРУ, обе руки держат блок ЗА БОКА
     (полностью заняты). ЛКМ — бросок с физикой: летит по дуге,
     прилипает к земле/стенам/потолку, 15 «тыков» (пищит всё ТИШЕ,
   «писклявее» и БЫСТРЕЕ с каждым тыком), после 15-го — ВЗРЫВ:
     постройки в радиусе −400 хп за удар, игроки в радиусе — насмерть.
     Крафт: металлолом 20 + метал 40 + сера 15. Иконка — рендер модели
     ✅ v0.4.46 СТАК 10 ШТУК (просьба игрока: «пусть С4 стакаются
     по 10 штук, а не 1»): stackable: true, stack: 10 — в одном слоте
     до 10 блоков; бросок снимает 1 из стека (throwC4 — removeCount) */
  c4: {
    id: 'c4', name: 'С4', nameEn: 'C4',
    icon: BrixAx('assets/icons/c4.png'), stackable: true, stack: 10, tool: 'c4'
  },
  /* ✅ v0.4.46 ШПРИЦ (модель пользователя medical_syringe... → syringe.glb):
     МЕДИЦИНА по образцу Rust: ЛКМ — УКОЛ (клип 5.73 с из GLB, руки наши),
     на момент «продавил поршень» (3.45 с) восстанавливает 46 ХП и
     расходуется. Стакается по 10 (как С4). Крафт: 20 металлолома +
     10 метал фрагментов; выпадает из ВОЕННЫХ ящиков */
  syringe: {
    id: 'syringe', name: 'Шприц', nameEn: 'Syringe',
    icon: BrixAx('assets/icons/syringe.png'), stackable: true, stack: 10, tool: 'syringe'
  },
  /* ✅ v0.5.21 ТЫКВА (модель пользователя pumpkin.glb →
     assets/models/pumpkin.glb, иконка pumpkin.png): ЕДА с тыквенных
     лоз (растут в поле, тыква на лозе — рост/сбор тикает НА СЕРВЕРЕ,
     см. js/game/vines.js + brix-vines.js). В хотбаре ЛКМ — СЪЕСТЬ
     (как шприц, но БЕЗ анимации поедания): мгновенно +12 ХП,
     тыква расходуется. Стакается по 10 */
  pumpkin: {
    id: 'pumpkin', name: 'Тыква', nameEn: 'Pumpkin',
    icon: BrixAx('assets/icons/pumpkin.png'), stackable: true, stack: 10, tool: 'pumpkin'
  },
  /* ✅ v0.4.7 ПЛАН СТРОИТЕЛЯ — живёт В ИНВЕНТАРЕ (не в хотбаре):
     открой инвентарь (E) и КЛИКНИ по плану — он в руках (синий ватман),
     дальше Z — меню строительства (фундамент/стена/потолок),
     ЛКМ ставит деталь. Без плана в руках Z не работает.
     Выбрал другой слот / ещё раз кликнул по плану — план убран */
  buildingPlan: {
    id: 'buildingPlan', name: 'План строителя', nameEn: 'Building Plan',
    icon: BrixAx('assets/icons/building_plan.png'), stackable: false, tool: 'plan'
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
  /* ✅ v0.4.44 ПЛАВЛЕНАЯ СЕРА (иконка от пользователя, Sulfur.png): получается
     в ПЕЧКЕ — 1 сера плавится за 4 секунды за дерево. Из плавленой серы
     в крафте делается ПОРОХ */
  sulfurM: {
    id: 'sulfurM', name: 'Плавленая сера', nameEn: 'Molten Sulfur',
    icon: BrixAx('assets/icons/sulfur_molten.png'), stackable: true, stack: 1000
  },
  /* ✅ v0.4.44 ПОРОХ (иконка от пользователя, Gun Powder.png): крафт из
     плавленой серы (2 серы = 1 порох). Нужен для С4 и всех патронов */
  gunpowder: {
    id: 'gunpowder', name: 'Порох', nameEn: 'Gun Powder',
    icon: BrixAx('assets/icons/gunpowder.png'), stackable: true, stack: 1000
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
  /* ============================================================
     ✅ v0.4.60 СКИНЫ — КОСТЮМЫ НА АККАУНТЕ, НЕ ПРЕДМЕТЫ. Скин
     покупается один раз в магазине (монеты) и хранится на аккаунте
     (BrixState.data.ownedSkinIds). В крафт-меню жмёшь на иконку
     предмета → список скинов → выбрал → СКАФТ → предмет создаётся
     со скином. Скин живёт В СЛОТЕ (slot.skin = id скина), иконку
     и обёртку берёт из BrixWeaponSkins/BrixData.SKINS — отдельных
     предметов-скинов и вариантных предметов больше НЕТ.
     ============================================================ */
};

window.BrixInventory = (function () {
  'use strict';

  // ✅ v0.4.7: хотбар 6 слотов (как было в v0.4.5), а «План строителя» —
  // предмет ИНВЕНТАРЯ: клик по нему в рюкзаке берёт план в руки
  var HOTBAR_SIZE = 6;
  var COLS = 5;            // ✅ v0.3.2: сетка 5x4 как в референсе (Rust)
  var ROWS = 4;
  var instance = null;

  function langName(item) {
    return BrixState.data.lang === 'en' ? (item.nameEn || item.name) : item.name;
  }

  /** имя СЛОТА с учётом скина: «Револьвер» или
   *  «Револьвер — Револьвер «Экскимо»» (скин — костюм на аккаунте,
   *  хранится в slot.skin, предмет остаётся базовым) */
  function slotName(slot) {
    if (!slot || !slot.item) return '';
    var base = langName(slot.item);
    if (!slot.skin) return base;
    var sk = (window.BrixData && BrixData.skinById) ? BrixData.skinById(slot.skin) : null;
    if (!sk) return base;
    var nm = BrixState.data.lang === 'en' ? (sk.name.en || sk.name.ru) : sk.name.ru;
    return base + ' — ' + nm;
  }

  /** иконка СЛОТА: у скинутого — PNG-рендер скина (см. weaponskins.js) */
  function slotIcon(slot) {
    if (slot && slot.skin && window.BrixWeaponSkins) {
      var sic = BrixWeaponSkins.iconFor(slot.skin);
      if (sic) return sic;
    }
    return (slot && slot.item) ? slot.item.icon : '';
  }

  /** иконка предмета — img на весь слот (как renderIcon в репозитории)
   *  ✅ v0.4.60: skin — id скина слота; иконка скина перекрывает базовую */
  function renderIcon(item, skin) {
    if (!item) return '';
    var icon = item.icon;
    if (skin && window.BrixWeaponSkins) {
      var sic = BrixWeaponSkins.iconFor(skin);
      if (sic) icon = sic;
    }
    if (icon) {
      return '<img src="' + icon + '" alt="' + langName(item) + '" draggable="false">' +
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
    // ✅ v0.4.9: план строителя берётся в руки ТОЛЬКО выбором слота
    // хотбара (перетащи план в слот 1–6 и выбери его). Механика
    // «клик в рюкзаке — взять в руки» (planEquipped) удалена

    // ✅ v0.4.44 СТАРТОВЫЙ НАБОР ПО ПРОСЬБЕ ИГРОКА: «в начале игры или после
    //    смерти дают КАМЕННЫЙ ТОПОР И КАМЕННУЮ КИРКУ И ВСЁ». Револьвер/патроны/
    //    железные инструменты/план/ресурсы больше НЕ выдаются — всё это
    //    добывается и крафтится (план строителя — крафт «5 дерева»)
    // ✅ v0.4.53 ФАКЕЛ в СЛОТЕ 1 (просьба игрока: держать факел клавишей 1,
    //    как топор): топор и кирка сдвинулись на слоты 2 и 3
    /* ✅ v0.4.66 ПВП-АРЕНА: стартовый набор (факел/топор/кирка) в
       конструкторе НЕ выдаётся — на арене инвентарь ПУСТОЙ */
    if (!window.BRIX_PVP) {
      this.slots[0] = { item: BrixItems.torch, count: 1 };
      this.slots[1] = { item: BrixItems.stoneAxe, count: 1 };
      this.slots[2] = { item: BrixItems.stonePickaxe, count: 1 };
    }

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
      /* ✅ v0.4.15: панель разработчика открыта — играют только её поля:
         цифры в её инпутах не переключают хотбар, E не открывает инвентарь
         ✅ v0.4.25: то же при открытой КРАФТ-ПАНЕЛИ (Q) — цифры в поле
         количества вводят число, а не дёргают слоты */
      if (window.BrixAdmin && BrixAdmin.isOpen()) return;
      if (window.BrixCraft && BrixCraft.isOpen()) return;
      /* ✅ fix 0.4.12: открыт кодовый замок/перелаз — цифры ВВОДЯТ КОД,
         а не переключают слоты хотбара (иначе код «1234» дёргал слоты) */
      if (!self.isOpen && e.code.indexOf('Digit') === 0 &&
          !window.BRIX_PVP &&   /* ✅ v0.4.65: на арене цифры 1–6 НЕ работают */
          !(window.BrixBuilding && BrixBuilding.isUiBlocked && BrixBuilding.isUiBlocked())) {
        var n = parseInt(e.code.replace('Digit', ''), 10);
        if (n >= 1 && n <= HOTBAR_SIZE) { self.select(n - 1); return; }
      }
      // E — инвентарь
      // ✅ v0.4.4: мини-меню (M) или карта открыты — инвентарь не открываем
      // (как просил игрок: с открытым меню ничего из игровой UI не открывается)
      if (e.code === 'KeyE') {
        // ✅ v0.4.25: крафт-панель (Q) открыта — E не открывает инвентарь
        if (window.BrixCraft && BrixCraft.isOpen()) return;
        if (window.BrixMiniMenu && BrixMiniMenu.isAnyOpen()) return;
        /* ✅ v0.4.64 ПВП-АРЕНА: E открывает СПИСОК ОРУЖИЯ (инвентаря
           на арене нет — только бой) */
        if (window.BRIX_PVP && window.BrixPvpWeapons) {
          e.preventDefault();
          BrixPvpWeapons.toggle();
          return;
        }
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
    /* ✅ v0.4.60: третьим аргументом — СКИН слота (обёртка в руках) */
    if (this.onSelect) this.onSelect(slot ? slot.item : null, index, slot ? (slot.skin || null) : null);
  };

  /* ✅ v0.4.60: выбранный СЛОТ целиком (item + skin) — нужно gameworld
     для синхронизации обёртки другим игрокам и psave */
  Inventory.prototype.getSelectedSlot = function () {
    return this.slots[this.activeSlot] || null;
  };

  /* ✅ v0.4.9: equipPlan/isPlanEquipped удалены — план строителя теперь
     берётся в руки только через слот хотбара (select(index)) */

  Inventory.prototype.getSelectedItem = function () {
    var slot = this.slots[this.activeSlot];
    return slot ? slot.item : null;
  };

  /* ✅ v0.4.54 СИНХРОНИЗАЦИЯ ПАТРОНОВ: обоймы у оружия теперь ПЕРЕЖИВАЮТ
     смерть/лут трупа/сохранение. addItem принимает ТРЕТИЙ параметр mag —
     сколько патронов в обойме у добавляемого ствола (0 — как раньше)
     ✅ v0.4.60 СКИНЫ: ЧЕТВЁРТЫЙ параметр skin — id скина («костюма»).
     Скинутые стакаются ТОЛЬКО с одинаковым скином (С4 «Бомбический
     подарок» не смешивается с обычной С4); у нестакуемого каждый
     ствол — свой слот со своим slot.skin */
  Inventory.GUN_MAG_MAX = { revolver: 6, shotgun: 2, rifle: 30, smg: 30, rev3x: 6 };

  Inventory.prototype.addItem = function (itemId, count, mag, skin) {
    count = count || 1;
    skin = skin || null;
    var item = BrixItems[itemId];
    if (!item) return false;
    var changed = false;

    // обойма: только у огнестрела, обрезается по лимиту ствола
    var magMax = Inventory.GUN_MAG_MAX[item.tool] || 0;
    mag = Math.max(0, Math.min(magMax, Math.floor(Number(mag) || 0)));

    // стекуемые — сначала в существующие стеки (хотбар → рюкзак)
    if (item.stackable) {
      for (var pass = 0; pass < 2; pass++) {
        var from = pass === 0 ? 0 : HOTBAR_SIZE;
        var to = pass === 0 ? HOTBAR_SIZE : this.slots.length;
        for (var i = from; i < to && count > 0; i++) {
          var s = this.slots[i];
          if (s && s.item.id === itemId && (s.skin || null) === skin && s.count < item.stack) {
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
          /* ✅ v0.4.46 ФИКС «ДВА КАЛАША СТАКУТСЯ»: нестакуемое (оружие/
             инструмент) кладётся ПО 1 ШТУКЕ на слот — как в Rust. Раньше
             count валился целиком в один слот: взял из сундука 2 калаша —
             получил ОДИН слот «Калаш ×2». Теперь каждый калаш — свой слот */
          var put = item.stackable ? Math.min(item.stack, count) : 1;
          /* ✅ fix v0.4.20: у ОГНЕСТРЕЛА в слоте сразу есть ОБОЙМА (mag).
             Раньше дробовик/револьвер из админ-панели или ящика приходил
             БЕЗ mag — перезарядка считала «2 − undefined = NaN» и обойма
             не заполнялась, сколько патронов ни было в запасе */
          this.slots[j] = { item: item, count: put };
          /* ✅ v0.4.60: скин-«костюм» прикрепляется к слоту */
          if (skin) this.slots[j].skin = skin;
          /* ✅ v0.4.35: томпсон (tool 'smg') тоже с обоймой */
          /* ✅ v0.4.36: револьвер-карабин (tool 'rev3x') — тоже */
          if (item.tool === 'revolver' || item.tool === 'shotgun' ||
              item.tool === 'rifle' || item.tool === 'smg' ||
              item.tool === 'rev3x') {
            /* ✅ v0.4.54: обойма приходит ВМЕСТЕ с оружием (труп/сохранение) —
               уходит в ПЕРВЫЙ добавленный ствол, остальные — 0 */
            this.slots[j].mag = mag;
            mag = 0;
          }
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
    /* ✅ v0.4.8: план строителя больше не закреплён — его можно перетащить
       в хотбар и обратно, на его слот можно положить другой предмет
       (в ящик план класть по-прежнему нельзя — см. lootmenu.js)
       ✅ v0.4.60: скинутые стаканы не смешиваются с обычными */
    if (A && B && A.item.id === B.item.id && B.item.stackable &&
        (A.skin || null) === (B.skin || null)) {
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
    // ✅ v0.4.60: третьим аргументом идёт СКИН слота (костюм в руках)
    if (this.onSelect) {
      var slot = this.slots[this.activeSlot];
      this.onSelect(slot ? slot.item : null, this.activeSlot, slot ? (slot.skin || null) : null);
    }
  };


  /* ✅ v0.4.2: сколько штук предмета МОЖНО вместить прямо сейчас
     (свободные стеки + пустые слоты). Нужно ДО отправки взятия из
     ящика — раньше предмет «исчезал», если слоты были заняты
     ✅ v0.4.60: skin — скинутые стакаются только с таким же скином */
  Inventory.prototype.freeSpaceFor = function (itemId, skin) {
    var item = BrixItems[itemId];
    if (!item) return 0;
    skin = skin || null;
    var space = 0;
    var i, s;
    if (item.stackable) {
      for (i = 0; i < this.slots.length; i++) {
        s = this.slots[i];
        if (s && s.item.id === itemId && (s.skin || null) === skin && s.count < item.stack) space += item.stack - s.count;
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
    var isPlan = !!(slot && slot.item.tool === 'plan');
    if (slot) {
      inner += renderIcon(slot.item, slot.skin);
      // ✅ v0.3.3: количество В УГЛУ СЛОТА вернули (12 дерева)
      if (slot.item.stackable && slot.count > 1) {
        inner += '<span class="bx-count">' + slot.count + '</span>';
      }
      // ✅ v0.4.5: У РЕВОЛЬВЕРА — остаток ОБОЙМЫ (0–6) СНИЗУ иконки:
      // игрок всегда видит, сколько патронов заряжено
      // ✅ v0.4.19: то же у ДРОБОВИКА (0–2)
      // ✅ v0.4.21: то же у КАЛАША (0–30)
      // ✅ v0.4.35: то же у ТОМПСОНА (0–30)
      // ✅ v0.4.36: то же у РЕВОЛЬВЕРА-КАРАБИНА 3× (0–6)
      if (slot.item.tool === 'revolver' || slot.item.tool === 'shotgun' ||
          slot.item.tool === 'rifle' || slot.item.tool === 'smg' ||
          slot.item.tool === 'rev3x') {
        inner += '<span class="bx-mag' + (!slot.mag ? ' empty' : '') + '">' +
          (slot.mag || 0) + '</span>';
      }
      // ✅ v0.4.9: план В ВЫБРАННОМ слоте хотбара = в руках — подсветка
      if (isPlan && type === 'hotbar' && index === self.activeSlot) {
        div.classList.add('plan-active');
      }
      div.title = isPlan
        ? (BrixState.data.lang === 'en'
          ? 'Building Plan — drag into the hotbar (slot 1–6) and select it · Z: build menu'
          : 'План строителя — перетащи в хотбар (слот 1–6) и выбери его · Z: меню стройки')
        : slotName(slot);   // ✅ v0.4.60: имя с учётом скина слота
    }
    div.innerHTML = inner;

    // ✅ v0.4.8: перетаскивать можно ЛЮБОЙ предмет, включая план строителя
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
    // ✅ v0.4.9: КЛИК по плану В РЮКЗАКЕ больше НЕ берёт его в руки —
    // вместо этого подсказка: план надо перетащить в хотбар и выбрать слот
    if (isPlan && type === 'inv') {
      div.classList.add('bx-plan');
      div.addEventListener('click', function () {
        if (window.BrixHud) {
          BrixHud.toast(BrixState.data.lang === 'en'
            ? 'Building Plan: drag it into the hotbar (1–6) and select the slot — then Z builds'
            : 'План строителя: перетащи в хотбар (1–6) и выбери слот — тогда Z строит', 5);
        }
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
    // ✅ v0.4.9: план строителя берётся в руки через ХОТБАР
    this.dom.sub.textContent = BrixState.data.lang === 'en'
      ? 'Building Plan — drag it into the hotbar and select the slot · Z — build'
      : 'План строителя — перетащи в хотбар и выбери слот · Z — стройка';
    this.dom.hint.textContent = BrixState.t('inv.hint');
    this.dom.closeBtn.textContent = '✕';
  };

  /* ================= всплывающая добыча ================= */

  /* ✅ v0.4.60: skin — у скинутого показываем иконку скина и его имя */
  Inventory.prototype.showPickup = function (itemId, count, skin) {
    var item = BrixItems[itemId];
    if (!item || !this.dom) return;
    var icon = item.icon;
    var nm = BrixState.data.lang === 'en' ? (item.nameEn || item.name) : item.name;
    if (skin) {
      if (window.BrixWeaponSkins) {
        var sic = BrixWeaponSkins.iconFor(skin);
        if (sic) icon = sic;
      }
      if (window.BrixData && BrixData.skinById) {
        var sk = BrixData.skinById(skin);
        if (sk) nm = BrixState.data.lang === 'en' ? (sk.name.en || sk.name.ru) : sk.name.ru;
      }
    }
    var el = document.createElement('div');
    el.className = 'bx-pickup';
    el.innerHTML =
      '<img src="' + icon + '" alt="">' +
      '<span>+' + count + ' ' + nm + '</span>';
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
    /* ✅ v0.4.54: лимиты обойм огнестрела (нужны gameworld.js при сборе
       трупа — какие стволы несут обойму) */
    GUN_MAG_MAX: Inventory.GUN_MAG_MAX,
    /* ✅ v0.4.44: СТАРТОВЫЙ НАБОР ПОСЛЕ СМЕРТИ — каменный топор + каменная
       кирка (просьба игрока «после смерти дают каменный топор и каменную
       кирку и всё»). Полный инвентарь погибшего лежит в трупе-лутбоксе
       ✅ v0.4.53/54: факел — в слот 1 (клавиша 1), топор и кирка — 2 и 3 */
    giveStarterKit: function () {
      if (!instance) return;
      /* ✅ v0.4.66: на арене стартового набора нет */
      if (window.BRIX_PVP) return;
      instance.slots[0] = { item: BrixItems.torch, count: 1 };
      instance.slots[1] = { item: BrixItems.stoneAxe, count: 1 };
      instance.slots[2] = { item: BrixItems.stonePickaxe, count: 1 };
      instance.renderAll();
      if (instance._notifySelect) instance._notifySelect();
    },
    ITEMS: BrixItems
  };
})();
