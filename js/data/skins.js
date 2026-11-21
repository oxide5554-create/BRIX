// ============================================================
//  brix • js/data/skins.js
//  ✅ v0.4.60 СКИНЫ — КОСТЮМЫ НА АККАУНТЕ (не предметы!).
//
//  Скин покупается в магазине ОДИН РАЗ (монеты) и помечается
//  «КУПЛЕНО» на аккаунте (state.ownedSkinIds) — в инвентаре его
//  НЕТ. Чтобы сделать предмет со скином: крафт-меню (Q) → выбери
//  чертёж → нажми на БОЛЬШУЮ ИКОНКУ ПРЕДМЕТА → откроется список
//  всех скинов этого предмета → выбери любой купленный → обычный
//  СКАФТ → предмет создастся сразу С ЭТИМ СКИНОМ (обёртка в руках
//  + иконка в хотбаре). Скин никогда не тратится и не теряется.
//
//  id      — идентификатор скина (им же подписан слот инвентаря
//            и синхронизация обёртки между игроками, поле si)
//  item    — id БАЗОВОГО предмета из BrixItems, на который скин
//            надевается (список в крафт-меню строится по нему)
//  iconUrl — PNG-рендер скинутого предмета (иконка слота/магазина)
//  wrap    — UV-обёртка на модель в руках (см. weaponskins.js)
// ============================================================
window.BrixData = window.BrixData || {};
(function () {
  'use strict';
  function ax(u) { return window.BrixAsset ? window.BrixAsset(u) : u; }

  BrixData.SKINS = [
    {
      id: 'exkimo', item: 'revolver', type: 'weapon', rarity: 'rare', price: 450,
      name: { ru: 'Револьвер «Экскимо»', en: 'Revolver “Eskimo”' },
      short: { ru: '«Экскимо»', en: '“Eskimo”' },
      iconUrl: ax('assets/icons/skin_revolver_exkimo.png')
    },
    {
      id: 'candy', item: 'thompson', type: 'weapon', rarity: 'epic', price: 700,
      name: { ru: 'Томпсон «Леденцовый выстрел»', en: 'Thompson “Candy Shot”' },
      short: { ru: '«Леденцовый выстрел»', en: '“Candy Shot”' },
      iconUrl: ax('assets/icons/skin_thompson_candy.png')
    },
    {
      id: 'gift', item: 'c4', type: 'weapon', rarity: 'rare', price: 550,
      name: { ru: 'С4 «Бомбический подарок»', en: 'C4 “Bomb Gift”' },
      short: { ru: '«Бомбический подарок»', en: '“Bomb Gift”' },
      iconUrl: ax('assets/icons/skin_c4_gift.png')
    },
    {
      id: 'frozen', item: 'stoneAxe', type: 'tool', rarity: 'uncommon', price: 300,
      name: { ru: 'Каменный топор «Замороженое дерево»', en: 'Stone Axe “Frozen Wood”' },
      short: { ru: '«Замороженое дерево»', en: '“Frozen Wood”' },
      iconUrl: ax('assets/icons/skin_stone_axe_frozen.png')
    },
    {
      /* ✅ v0.4.62: скин «Ретро» — для ЖЕЛЕЗНОЙ кирки (pickaxe.glb),
         а не каменной: обёртка рисовалась по развёртке pickaxe.glb
         (проверено наложением UV-контура) */
      id: 'retro', item: 'ironPickaxe', type: 'tool', rarity: 'uncommon', price: 300,
      name: { ru: 'Железная кирка «Ретро»', en: 'Iron Pickaxe “Retro”' },
      short: { ru: '«Ретро»', en: '“Retro”' },
      iconUrl: ax('assets/icons/skin_pickaxe_retro.png')
    },
    {
      id: 'ice', item: 'ironAxe', type: 'tool', rarity: 'rare', price: 400,
      name: { ru: 'Железный топор «Ледяные руны»', en: 'Iron Axe “Ice Runes”' },
      short: { ru: '«Ледяные руны»', en: '“Ice Runes”' },
      iconUrl: ax('assets/icons/skin_iron_axe_ice.png')
    }
  ];

  /** все скины, надевающиеся на предмет baseItemId */
  BrixData.skinsForItem = function (baseItemId) {
    return (BrixData.SKINS || []).filter(function (s) { return s.item === baseItemId; });
  };
  /** скин по id (или null) */
  BrixData.skinById = function (skinId) {
    var list = BrixData.SKINS || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === skinId) return list[i];
    return null;
  };
})();
