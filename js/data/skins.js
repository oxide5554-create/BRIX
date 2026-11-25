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
      /* ✅ v0.5.22: в магазине ОДИН скин — «Ледяные руны» (просьба игрока:
         остальные скины из магазина убраны). Файлы обёрток остальных
         скинов сохранены в assets/skins/ на случай возврата */
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
