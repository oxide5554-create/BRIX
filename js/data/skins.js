// ============================================================
//  brix • js/data/skins.js
//  Скины. В демо-режиме покупается за локальные монеты.
//  Полный перенос из data/skins.ts.
// ============================================================
window.BrixData = window.BrixData || {};

window.BrixData.SKINS = [
  { id: 'hatchet-rusty',   icon: 'hatchet',  name: { ru: 'Топор «Старый друг»',           en: 'Hatchet “Old Friend”' },       type: 'tool',     rarity: 'common',    price: 0 },
  { id: 'pickaxe-copper',  icon: 'pickaxe',  name: { ru: 'Кирка «Медный рудник»',         en: 'Pickaxe “Copper Mine”' },      type: 'tool',     rarity: 'uncommon',  price: 250 },
  { id: 'rifle-scarlet',   icon: 'rifle',    name: { ru: 'Автомат «Алый шов»',            en: 'Rifle “Scarlet Seam”' },       type: 'weapon',   rarity: 'epic',      price: 1200 },
  { id: 'rifle-bone',      icon: 'rifle',    name: { ru: 'Автомат «Костяная бронза»',     en: 'Rifle “Bone Bronze”' },        type: 'weapon',   rarity: 'legendary', price: 2400 },
  { id: 'pistol-ironwood', icon: 'pistol',   name: { ru: 'Револьвер «Железное дерево»',   en: 'Revolver “Ironwood”' },        type: 'weapon',   rarity: 'rare',      price: 600 },
  { id: 'bow-ember',       icon: 'bow',      name: { ru: 'Лук «Тлеющий уголь»',           en: 'Bow “Ember”' },                type: 'weapon',   rarity: 'uncommon',  price: 300 },
  { id: 'bandana-crimson', icon: 'bandana',  name: { ru: 'Бандана «Кровавый шёлк»',       en: 'Bandana “Crimson Silk”' },     type: 'clothing', rarity: 'common',    price: 150 },
  { id: 'hoodie-rusty',    icon: 'hoodie',   name: { ru: 'Худи «Ржавый ветер»',           en: 'Hoodie “Rusty Wind”' },        type: 'clothing', rarity: 'rare',      price: 450 },
  { id: 'pants-camo',      icon: 'pants',    name: { ru: 'Штаны «Хвойный камуфляж»',      en: 'Pants “Pine Camo”' },          type: 'clothing', rarity: 'common',    price: 0 },
  { id: 'helmet-scar',     icon: 'helmet',   name: { ru: 'Каска «Шрам»',                  en: 'Helmet “Scar”' },              type: 'clothing', rarity: 'epic',      price: 900 },
  { id: 'door-gears',      icon: 'door',     name: { ru: 'Дверь «Шестерни»',              en: 'Door “Gears”' },               type: 'misc',     rarity: 'rare',      price: 500 },
  { id: 'bag-wanderer',    icon: 'bag',      name: { ru: 'Спальник «Странник»',           en: 'Bag “Wanderer”' },             type: 'misc',     rarity: 'uncommon',  price: 200 },
  { id: 'crate-king',      icon: 'crate',    name: { ru: 'Ящик «Королевский груз»',       en: 'Crate “Royal Cargo”' },        type: 'misc',     rarity: 'legendary', price: 1800 }
];
