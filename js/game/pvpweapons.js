// ============================================================
//  brix • js/game/pvpweapons.js
//  ✅ v0.4.65 ПВП-АРЕНА (сервер BrixPvP): клавиша E открывает
//  СПИСОК ОРУЖИЯ как на референсе (фото) — КАТЕГОРИИ-колонки
//  (РЕВОЛЬВЕРЫ / ДРОБОВИКИ / АВТОМАТЫ) с зелёными шапками и
//  тёмными карточками: силуэт оружия, название, обойма.
//  ✅ v0.4.65: С4 и БУЛАВЫ на арене больше НЕТ — только огнестрелы.
//  Инструментов (кирка, топор и т.д.) в списке никогда не было.
//  Клик по оружию = выдать себе + взять в руки (патроны бесконечные:
//  обойма заправляется при перезарядке, запас не тратится).
//  ПОВТОРНОЕ нажатие E / ESC / клик мимо — закрыть.
// ============================================================
window.BrixPvpWeapons = (function () {
  'use strict';

  /* ✅ v0.4.65: категории как на фото — колонки с шапками */
  var CATEGORIES = [
    { key: 'pvp.cat.rev', ids: ['revolver', 'rev3x'] },
    { key: 'pvp.cat.sg',  ids: ['shotgun'] },
    { key: 'pvp.cat.ak',  ids: ['rifleAk', 'thompson'] }
  ];

  var root = null;
  var openFlag = false;

  function t(k) { return window.BrixState ? BrixState.t(k) : k; }

  function itemName(id) {
    var it = window.BrixItems && BrixItems[id];
    if (!it) return id;
    var lang = window.BrixState ? BrixState.data.lang : 'ru';
    if (lang === 'en' && it.nameEn) return it.nameEn;
    return it.name || id;
  }

  function itemIcon(id) {
    var it = window.BrixItems && BrixItems[id];
    return (it && it.icon) || '';
  }

  function magMaxOf(id) {
    var it = window.BrixItems && BrixItems[id];
    return (it && window.BrixInventory && BrixInventory.GUN_MAG_MAX[it.tool]) || 0;
  }

  function ensureRoot() {
    if (root) return root;
    root = document.createElement('div');
    root.id = 'brixPvpWeapons';
    root.className = 'brix-pvpw hidden';
    var cols = CATEGORIES.map(function (cat) {
      var cards = cat.ids.map(function (id) {
        var mm = magMaxOf(id);
        return '<button class="brix-pvpw-card" data-w="' + id + '">' +
          '<span class="ic"><img src="' + itemIcon(id) + '" alt=""></span>' +
          '<span class="nm font-h">' + itemName(id) + '</span>' +
          '<span class="meta">' + (mm ? t('pvp.mag', { n: mm }) : t('pvp.melee')) + '</span>' +
        '</button>';
      }).join('');
      return '<div class="brix-pvpw-col">' +
        '<div class="col-head font-h">' + t(cat.key) + '</div>' +
        '<div class="col-cards">' + cards + '</div>' +
      '</div>';
    }).join('');
    root.innerHTML =
      '<div class="brix-pvpw-panel">' +
        '<div class="head">' +
          '<div class="title font-h">' + t('pvp.title') + '</div>' +
          '<div class="sub">' + t('pvp.sub') + '</div>' +
          '<button class="close font-h" data-close>ESC</button>' +
        '</div>' +
        '<div class="cols">' + cols + '</div>' +
        '<div class="hint">' + t('pvp.hint') + '</div>' +
      '</div>';
    document.body.appendChild(root);

    root.addEventListener('click', function (e) {
      if (e.target === root) { close(); return; }          // клик мимо
      var btn = e.target.closest('[data-w]');
      if (btn) { equip(btn.getAttribute('data-w')); return; }
      if (e.target.closest('[data-close]')) close();
    });
    return root;
  }

  /** выдать оружие и СРАЗУ взять в руки (select → hands.setWeapon) */
  function equip(id) {
    var inv = window.BrixInventory && BrixInventory.get();
    if (!inv || !window.BrixItems || !BrixItems[id]) return;
    /* уже есть — просто берём в руки */
    var idx = -1, i, s;
    for (i = 0; i < inv.slots.length; i++) {
      s = inv.slots[i];
      if (s && s.item && s.item.id === id) { idx = i; break; }
    }
    if (idx === -1) {
      /* mag: у огнестрела обойма сразу полная (клампится по лимиту ствола) */
      var added = false;
      try { added = inv.addItem(id, 1, magMaxOf(id) || 999); } catch (eA) {}
      for (i = 0; i < inv.slots.length; i++) {
        s = inv.slots[i];
        if (s && s.item && s.item.id === id) { idx = i; break; }
      }
      /* ✅ v0.4.66: инвентарь ПОЛОН (вещи с BrixLand) — кладём оружие
         в ТЕКУЩИЙ слот принудительно: дробовик/револьвер-карабин
         выбираются всегда */
      if (idx === -1 && !added) {
        var it = BrixItems[id];
        if (it) {
          inv.slots[inv.activeSlot] = { item: it, count: 1,
            mag: magMaxOf(id) || undefined };
          idx = inv.activeSlot;
          inv.renderAll();
        }
      }
    }
    if (idx >= 0 && idx < inv.slots.length) {
      inv.select(idx);
      if (window.menuAudio) menuAudio.click();
      close();
    }
  }

  function open() {
    if (openFlag) return;
    if (window.BrixGame && BrixGame.state.phase !== 'playing') return;
    /* не открываем поверх инвентаря/мини-меню/лута */
    var inv = window.BrixInventory && BrixInventory.get();
    if (inv && inv.isOpen) return;
    if (window.BrixMiniMenu && BrixMiniMenu.isAnyOpen()) return;
    if (window.BrixLootMenu && BrixLootMenu.isOpen()) return;
    openFlag = true;
    ensureRoot();
    root.classList.remove('hidden');
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) {}
  }

  function close() {
    openFlag = false;
    if (root) root.classList.add('hidden');
    /* вернуть мышь в игру */
    var canvas = document.querySelector('#gameMount canvas');
    if (canvas && window.BrixGame && BrixGame.state.phase === 'playing') {
      try { var p = canvas.requestPointerLock(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    }
  }

  function toggle() { if (openFlag) close(); else open(); }
  function isOpen() { return openFlag; }

  /* ESC закрывает (если открыто) */
  document.addEventListener('keydown', function (e) {
    if (!openFlag) return;
    if (e.code === 'Escape' || e.code === 'KeyE') { e.preventDefault(); close(); }
  });

  return { toggle: toggle, open: open, close: close, isOpen: isOpen, equip: equip };
})();
