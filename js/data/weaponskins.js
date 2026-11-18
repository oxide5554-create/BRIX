// ============================================================
//  brix • js/data/weaponskins.js
//  ✅ v0.4.25 СКИНЫ ОРУЖИЯ (первая система скинов на 3D-модели).
//  Скин = ОБЁРТКА (UV-текстура на модель в руках от 1-го лица)
//  + ИКОНКА (рендер — показывается в хотбаре/инвентаре/лут-меню).
//
//  ВАЖНО (по просьбе игрока): пока скины выдаются ТОЛЬКО через
//  панель разработчика (клавиша 9) для ТЕСТА. В МАГАЗИН СКИНОВ
//  (js/data/skins.js, меню игры) скин НЕ добавляется — это потом.
//
//  Файлы первого скина «Ретро» (от пользователя):
//    assets/skins/pickaxe_retro_wrap.png  — обёртка (UV-развертка)
//    assets/icons/skin_pickaxe_retro.png  — иконка (рендер кирки)
// ============================================================
window.BrixWeaponSkins = (function () {
  'use strict';

  function ax(u) { return window.BrixAsset ? window.BrixAsset(u) : u; }

  /* ---------- реестр скинов ----------
     item — id предмета из BrixItems (skin ложится на ВСЕ экземпляры),
     wrap — UV-текстура (накладывается на модель в руках),
     icon — иконка предмета, пока скин надет */
  var SKINS = [
    {
      id: 'pickaxe-retro',
      item: 'ironPickaxe',
      name: { ru: 'Кирка «Ретро»', en: 'Pickaxe “Retro”' },
      wrap: ax('assets/skins/pickaxe_retro_wrap.png'),
      icon: ax('assets/icons/skin_pickaxe_retro.png')
    }
  ];

  /* ---------- надетые скины: itemId -> skinId ----------
     Хранятся в localStorage: тест-скин не теряется при перезаходе */
  var LS = 'brixWeaponSkins';
  var equipped = {};
  var listeners = [];

  function load() {
    try {
      var raw = localStorage.getItem(LS);
      if (raw) {
        var o = JSON.parse(raw);
        for (var k in o) {
          // скин существует и действительно для этого предмета
          var s = byId(o[k]);
          if (s && s.item === k) equipped[k] = s.id;
        }
      }
    } catch (e) { /* приватный режим — просто без сохранения */ }
  }

  function persist() {
    try { localStorage.setItem(LS, JSON.stringify(equipped)); } catch (e) {}
  }

  function byId(id) {
    for (var i = 0; i < SKINS.length; i++) if (SKINS[i].id === id) return SKINS[i];
    return null;
  }

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](); } catch (e) {}
    }
  }

  load();

  return {
    /** весь список скинов (админ-панель) */
    list: function () { return SKINS; },
    byId: byId,
    /** скин, надетый на предмет itemId (или null) */
    equipped: function (itemId) {
      var id = equipped[itemId];
      return id ? byId(id) : null;
    },
    /** иконка предмета С УЧЁТОМ скина (или null — оставить обычную) */
    iconFor: function (itemId) {
      var s = this.equipped(itemId);
      return s ? s.icon : null;
    },
    /** UV-обёртка предмета (или null — обычная модель) */
    wrapFor: function (itemId) {
      var s = this.equipped(itemId);
      return s ? s.wrap : null;
    },
    /** надеть скин на его предмет (скины других предметов не трогаем) */
    setEquip: function (skinId) {
      var s = skinId ? byId(skinId) : null;
      if (!s) return null;
      equipped[s.item] = s.id;
      persist();
      notify();
      return s;
    },
    /** снять скин с конкретного предмета */
    unequipItem: function (itemId) {
      delete equipped[itemId];
      persist();
      notify();
    },
    /** подписка на изменения (перерисовать хотбар, наложить текстуру) */
    on: function (fn) { listeners.push(fn); }
  };
})();
