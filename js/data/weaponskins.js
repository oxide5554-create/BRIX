// ============================================================
//  brix • js/data/weaponskins.js
//  ✅ v0.4.60 СКИНЫ — КОСТЮМЫ НА АККАУНТЕ.
//
//  Скин — НЕ предмет: покупается один раз в магазине и хранится
//  на аккаунте (BrixState.data.ownedSkinIds). В крафт-меню (Q)
//  жмёшь на ИКОНКУ предмета в превью чертежа → открывается список
//  всех скинов этого предмета → выбрал → обычный СКАФТ → предмет
//  создаётся сразу со скином. Скин хранится В СЛОТЕ инвентаря
//  (slot.skin = id скина) и НИКОГДА не тратится.
//
//  Реестр: id СКИНА → обёртка (UV) + доп. карты + иконка.
//  setSkinItem/wrapFor/getTex работают с id скина и синхронизируются
//  между игроками полем si (sendState) — как раньше, только id
//  теперь скиновый. Каталог скинов — js/data/skins.js.
// ============================================================
window.BrixWeaponSkins = (function () {
  'use strict';

  function ax(u) { return window.BrixAsset ? window.BrixAsset(u) : u; }

  /* ---------- реестр скинов ----------
     ключ = id скина из BrixData.SKINS (skins.js):
       wrap  — UV-обёртка (накладывается на модель в руках),
       rough — roughnessMap (если модель поддерживает),
       metal — metalnessMap (если модель поддерживает),
       icon  — PNG-рендер скинутого предмета (иконка слота)   */
  var REG = {
    /* Револьвер «Экскимо» — шоколадное мороженое (файлы игрока) */
    exkimo: {
      wrap:  ax('assets/skins/revolver_exkimo_wrap.png'),
      rough: ax('assets/skins/revolver_exkimo_roughness.png'),
      metal: ax('assets/skins/revolver_exkimo_metallic.png'),
      icon:  ax('assets/icons/skin_revolver_exkimo.png')
    },
    /* Томпсон «Леденцовый выстрел» — красно-белая карамель */
    candy: {
      wrap: ax('assets/skins/thompson_candy_wrap.png'),
      icon: ax('assets/icons/skin_thompson_candy.png')
    },
    /* С4 «Бомбический подарок» — красные шашки с золотой лентой */
    gift: {
      wrap: ax('assets/skins/c4_gift_wrap.png'),
      icon: ax('assets/icons/skin_c4_gift.png')
    },
    /* Каменный топор «Замороженое дерево» — лёд на древке */
    frozen: {
      wrap: ax('assets/skins/stone_axe_frozen_wrap.png'),
      icon: ax('assets/icons/skin_stone_axe_frozen.png')
    },
    /* Каменная кирка «Ретро» — оранжево-серый классический окрас */
    retro: {
      wrap: ax('assets/skins/pickaxe_retro_wrap.png'),
      icon: ax('assets/icons/skin_pickaxe_retro.png')
    },
    /* ✅ v0.4.61 Железный топор «Ледяные руны» — лёд со светящимися
       рунами (арт игрока, развёртка iron_axe.glb) */
    ice: {
      wrap: ax('assets/skins/iron_axe_ice_wrap.png'),
      icon: ax('assets/icons/skin_iron_axe_ice.png')
    }
  };

  function def(skinId) { return REG[skinId] || null; }
  function isSkinned(skinId) { return !!REG[skinId]; }

  /** UV-обёртка скина (или null — обычная модель) */
  function wrapFor(skinId) {
    var d = REG[skinId];
    return d ? d.wrap : null;
  }

  /** PNG-иконка скинутого предмета (или null — обычная иконка) */
  function iconFor(skinId) {
    var d = REG[skinId];
    return d ? d.icon || null : null;
  }

  /* ---------- кэш текстур (грузятся один раз по адресу) ---------- */
  var texCache = {};
  function getTex(url, cb) {
    if (texCache[url]) { cb(texCache[url]); return; }
    var loader = new THREE.TextureLoader();
    loader.load(url, function (tex) {
      tex.flipY = false; // ✅ v0.4.61 конвенция glTF (как в glb.js) — обёртка не перевёрнута
      if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      texCache[url] = tex;
      cb(tex);
    }, undefined, function () {
      console.warn('[BrixWeaponSkins] текстура не загрузилась: ' + url);
    });
  }

  return {
    /** весь реестр (отладка в консоли) */
    list: function () { return REG; },
    def: def,
    isSkinned: isSkinned,
    wrapFor: wrapFor,
    iconFor: iconFor,
    getTex: getTex
  };
})();
