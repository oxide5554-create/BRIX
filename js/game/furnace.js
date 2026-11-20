// ============================================================
//  brix • js/game/furnace.js — МЕНЮ ПЕЧКИ (v0.4.44)
//  Интерфейс КАК НА РЕФЕРЕНСЕ (Large Furnace из Rust, фото игрока):
//  слева — ПЕЧКА: сверху ТОПЛИВО (дерево), стрелка вниз, ВХОД
//  (сера + железо), стрелка вниз, ВЫХОД (плавленая сера + метал
//  фрагменты); справа — ИНВЕНТАРЬ игрока (рюкзак + хотбар).
//  Клик по своему дереву/сере/железу — положить в печку; клик по
//  слоту печки — забрать всё. Кнопка ВКЛ/ВЫКЛ запускает плавку.
//
//  Состояние печки (cont/on) живёт НА СЕРВЕРЕ: сервер раз в секунду
//  сам плавит (сера 4 с/шт → плавленая сера, железо 6 с/шт → метал
//  фрагмент, 1 дерево горит 8 с) и рассылает 'fust' ВСЕМ — у всех
//  игроков печка одинаковая и переживает рестарт. Клиент шлёт
//  fuplace/futog/fuput/futake и оптимистично правит инвентарь;
//  серверный fust/fudenied всё корректирует.
// ============================================================
window.BrixFurnace = (function () {
  'use strict';

  var root = null;
  var curId = null;
  var rec = null;              // rec печки из BrixBuilding.furnaceCont (живой)
  var pendingTake = {};        // tid -> {item, amt} — для отката 'fudenied'
  var lastOpen = 0;

  function t(k, o) { return window.BrixState ? BrixState.t(k, o) : k; }
  function L(ru, en) { return t(ru, en); }
  function inv() { return (window.BrixInventory && BrixInventory.get()) || null; }
  function lang() { return window.BrixState ? BrixState.data.lang : 'ru'; }

  function itemName(id) {
    var d = (window.BrixItems && BrixItems[id]) || { id: id, name: id, nameEn: id };
    return lang() === 'en' ? (d.nameEn || d.name) : d.name;
  }
  function itemIcon(id) {
    var d = (window.BrixItems && BrixItems[id]) || {};
    var sk = window.BrixWeaponSkins ? BrixWeaponSkins.iconFor(id) : null;
    return sk || d.icon || '';
  }

  /* ---------- DOM ---------- */

  function ensure() {
    if (root) return root;
    root = document.createElement('div');
    root.id = 'brixFurnace';
    root.className = 'hidden';
    root.style.cssText = 'position:fixed;inset:0;z-index:74;display:flex;' +
      'align-items:center;justify-content:center;background:rgba(8,8,6,0.62);';
    var slotCss = 'position:relative;width:64px;height:64px;background:#211f1a;' +
      'border:1px solid #4a453c;border-radius:5px;display:flex;align-items:center;' +
      'justify-content:center;cursor:pointer;';
    var capCss = 'font:700 11px Oswald,sans-serif;letter-spacing:.18em;color:#9a948a;' +
      'text-transform:uppercase;margin:0 0 6px 2px;';
    root.innerHTML =
      '<div style="display:flex;gap:18px;align-items:stretch;">' +
        /* ЛЕВАЯ ПАНЕЛЬ — ПЕЧКА (как на фото: топливо → вход → выход) */
        '<div style="background:linear-gradient(180deg,#2a2723,#1c1a16);border:1px solid #5c564b;' +
          'border-radius:10px;padding:16px 18px 14px;box-shadow:0 18px 60px rgba(0,0,0,.7);min-width:340px;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
            '<div class="font-h" id="bxFuTitle" style="font-size:15px;letter-spacing:.2em;color:#e8dfc8;">' +
              t('fu.title') + '</div>' +
            '<button id="bxFuClose" style="background:none;border:none;color:#b9b2a4;' +
              'font-size:18px;cursor:pointer;line-height:1;">X</button>' +
          '</div>' +
          '<div style="' + capCss + '">' + t('fu.fuel') + '</div>' +
          '<div id="bxFuFuel" style="display:flex;gap:8px;"></div>' +
          '<div style="text-align:center;color:#6f6a60;font-size:16px;line-height:1;margin:6px 0;">↓</div>' +
          '<div style="' + capCss + '">' + t('fu.input') + '</div>' +
          '<div id="bxFuInput" style="display:flex;gap:8px;"></div>' +
          '<div style="text-align:center;color:#6f6a60;font-size:16px;line-height:1;margin:6px 0;">↓</div>' +
          '<div style="' + capCss + '">' + t('fu.output') + '</div>' +
          '<div id="bxFuOut" style="display:flex;gap:8px;"></div>' +
          '<div style="display:flex;align-items:center;gap:10px;margin-top:14px;">' +
            '<button id="bxFuTog" class="font-h" style="flex:1;padding:10px;border-radius:6px;' +
              'border:1px solid #7a5a2e;cursor:pointer;font-size:13px;letter-spacing:.14em;' +
              'text-transform:uppercase;color:#fff;"></button>' +
            '<div id="bxFuHint" style="color:#8b8478;font:11px/1.5 Consolas,monospace;flex:1;"></div>' +
          '</div>' +
        '</div>' +
        /* ПРАВАЯ ПАНЕЛЬ — ИНВЕНТАРЬ игрока */
        '<div style="background:linear-gradient(180deg,#2a2723,#1c1a16);border:1px solid #5c564b;' +
          'border-radius:10px;padding:16px 18px 14px;box-shadow:0 18px 60px rgba(0,0,0,.7);">' +
          '<div class="font-h" style="font-size:15px;letter-spacing:.2em;color:#e8dfc8;margin-bottom:10px;">' +
            t('fu.inv') + '</div>' +
          '<div id="bxFuInv" style="display:grid;grid-template-columns:repeat(5,64px);gap:8px;"></div>' +
          '<div class="font-h" style="' + capCss + 'margin-top:10px;">' + t('fu.hotbar') + '</div>' +
          '<div id="bxFuHot" style="display:grid;grid-template-columns:repeat(6,64px);gap:8px;"></div>' +
          '<div style="color:#8b8478;font:11px/1.5 Consolas,monospace;margin-top:10px;">' +
            t('fu.putHint') +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
    root.querySelector('#bxFuClose').onclick = function () { close(); };
    root.addEventListener('mousedown', function (e) {
      if (e.target === root) close();
    });
    root.querySelector('#bxFuTog').onclick = function () {
      if (!curId || !window.BrixNet) return;
      if (BrixNet.mode === 'server') BrixNet.sendFuTog(curId);
      else if (rec) {
        // соло/вкладки: локальная печка (сервера нет) — сами плавим
        rec.on = rec.on ? 0 : 1;
        refresh();
      }
      if (window.menuAudio) menuAudio.click();
    };
    document.addEventListener('keydown', _onKey);
    return root;
  }

  function _onKey(e) {
    if (!isOpen()) return;
    if (e.code === 'Escape' || e.code === 'KeyF') {
      if (e.code === 'KeyF' && performance.now() - lastOpen < 300) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    }
  }

  /* ---------- отрисовка ---------- */

  function slot(host, item, count, onClick, tag) {
    var el = document.createElement('div');
    el.style.cssText = 'position:relative;width:64px;height:64px;background:#211f1a;' +
      'border:1px solid #4a453c;border-radius:5px;display:flex;align-items:center;' +
      'justify-content:center;' + (onClick ? 'cursor:pointer;' : 'cursor:default;');
    if (count > 0 && item) {
      var img = document.createElement('img');
      img.src = itemIcon(item);
      img.style.cssText = 'width:44px;height:44px;object-fit:contain;pointer-events:none;';
      img.draggable = false;
      el.appendChild(img);
      if (count > 1) {
        var c = document.createElement('b');
        c.textContent = count;
        c.style.cssText = 'position:absolute;right:4px;bottom:2px;color:#e8dfc8;' +
          'font:700 13px Consolas,monospace;text-shadow:0 1px 2px #000;';
        el.appendChild(c);
      }
      el.title = itemName(item);
    }
    if (tag) {
      var tg = document.createElement('span');
      tg.textContent = tag;
      tg.style.cssText = 'position:absolute;left:4px;top:2px;color:#6f6a60;font:9px Consolas,monospace;';
      el.appendChild(tg);
    }
    if (onClick) el.onclick = onClick;
    host.appendChild(el);
  }

  function renderFurnaceSlot(host, item, tag) {
    var have = rec && rec.cont ? (rec.cont[item] | 0) : 0;
    slot(host, item, have, have > 0 ? function () { take(item); } : null, tag);
  }

  function renderOwnSlot(host, s, idx) {
    var el = document.createElement('div');
    el.style.cssText = 'position:relative;width:64px;height:64px;background:#211f1a;' +
      'border:1px solid #4a453c;border-radius:5px;display:flex;align-items:center;justify-content:center;';
    if (s && s.item) {
      var img = document.createElement('img');
      img.src = itemIcon(s.item.id);
      img.style.cssText = 'width:44px;height:44px;object-fit:contain;pointer-events:none;';
      img.draggable = false;
      el.appendChild(img);
      if (s.count > 1) {
        var c = document.createElement('b');
        c.textContent = s.count;
        c.style.cssText = 'position:absolute;right:4px;bottom:2px;color:#e8dfc8;' +
          'font:700 13px Consolas,monospace;text-shadow:0 1px 2px #000;';
        el.appendChild(c);
      }
      el.title = itemName(s.item.id);
      if (s.item.id === 'wood' || s.item.id === 'sulfur' || s.item.id === 'iron') {
        el.style.cursor = 'pointer';
        el.onclick = function () { put(idx); };
      }
    }
    host.appendChild(el);
  }

  function refresh() {
    if (!root || !isOpen()) return;
    var fuel = root.querySelector('#bxFuFuel');
    var input = root.querySelector('#bxFuInput');
    var out = root.querySelector('#bxFuOut');
    fuel.innerHTML = ''; input.innerHTML = ''; out.innerHTML = '';
    renderFurnaceSlot(fuel, 'wood', 'FUEL');
    renderFurnaceSlot(input, 'sulfur', '4 ' + t('fu.spc'));
    renderFurnaceSlot(input, 'iron', '6 ' + t('fu.spc'));
    renderFurnaceSlot(out, 'sulfurM');
    renderFurnaceSlot(out, 'metal');
    var tog = root.querySelector('#bxFuTog');
    var on = rec && rec.on ? 1 : 0;
    tog.textContent = on ? t('fu.off') : t('fu.on');
    tog.style.background = on
      ? 'linear-gradient(180deg,#a8430e,#7c2c08)'
      : 'linear-gradient(180deg,#4e6a35,#37501f)';
    root.querySelector('#bxFuHint').textContent = on
      ? t('fu.hintOn')
      : t('fu.hintOff');
    // инвентарь игрока
    var I = inv();
    var invG = root.querySelector('#bxFuInv');
    var hotG = root.querySelector('#bxFuHot');
    invG.innerHTML = ''; hotG.innerHTML = '';
    if (!I) return;
    for (var s = 6; s < I.slots.length; s++) renderOwnSlot(invG, I.slots[s], s);
    for (var h = 0; h < 6; h++) renderOwnSlot(hotG, I.slots[h], h);
  }

  /* ---------- положить / забрать (оптимистично, сервер корректирует) ---------- */

  function put(idx) {
    var I = inv();
    if (!I || !rec || !curId) return;
    var s = I.slots[idx];
    if (!s || !s.item) return;
    var item = s.item.id;
    if (item !== 'wood' && item !== 'sulfur' && item !== 'iron') return;
    var amt = s.count;
    I.removeCountByItem(item, amt);
    rec.cont = rec.cont || {};
    rec.cont[item] = (rec.cont[item] | 0) + amt;
    refresh();
    if (window.menuAudio) menuAudio.click();
    if (BrixNet.mode === 'server') BrixNet.sendFuPut(curId, item, amt);
    else if (BrixNet.mode === 'tabs') BrixNet.send({ t: 'fust', id: curId, cont: rec.cont, on: rec.on });
  }

  function take(item) {
    var I = inv();
    if (!I || !rec || !curId) return;
    var have = (rec.cont[item] | 0);
    if (have <= 0) return;
    var amt = have;
    if (I.freeSpaceFor) {
      var fits = I.freeSpaceFor(item);
      if (fits <= 0) { toast(t('fu.noSpace')); return; }
      amt = Math.min(amt, fits);
    }
    var tid = '';
    if (BrixNet.mode === 'server') {
      tid = 'T' + Math.random().toString(36).slice(2, 9);
      pendingTake[tid] = { id: curId, item: item, amt: amt };
    }
    I.addItem(item, amt);
    if (I.showPickup) I.showPickup(item, amt);
    rec.cont[item] = have - amt;
    if (rec.cont[item] <= 0) delete rec.cont[item];
    refresh();
    if (window.menuAudio) menuAudio.click();
    if (BrixNet.mode === 'server') BrixNet.sendFuTake(curId, item, amt, tid);
    else if (BrixNet.mode === 'tabs') BrixNet.send({ t: 'fust', id: curId, cont: rec.cont, on: rec.on });
  }

  function toast(msg) {
    if (window.BrixHud && window.BrixGame && BrixGame.state.phase === 'playing') {
      BrixHud.toast(msg, 4);
    }
  }

  /* сервер отказал во взятии — откат: предмет вернулся в печку */
  function deny(msg) {
    var p = pendingTake[msg.tid];
    if (!p) return;
    delete pendingTake[msg.tid];
    var I = inv();
    if (I) I.removeCountByItem(p.item, p.amt);
    if (rec && curId === msg.id) {
      rec.cont = rec.cont || {};
      rec.cont[p.item] = (rec.cont[p.item] | 0) + p.amt;
      refresh();
    }
  }

  /* сервер/вкладки прислали состояние 'fust' — обновляем запись */
  function onFust(msg) {
    if (!msg || !msg.id) return;
    if (window.BrixBuilding) BrixBuilding.setFurnaceState(msg.id, msg.cont, msg.on);
    if (curId === msg.id) {
      if (window.BrixBuilding) rec = BrixBuilding.furnaceCont(msg.id);
      refresh();
    }
  }

  /* ---------- открытие/закрытие ---------- */

  function isOpen() { return !!(root && !root.classList.contains('hidden')); }
  function openId() { return isOpen() ? curId : null; }

  function open(id) {
    if (!window.BrixBuilding) return;
    var r = BrixBuilding.furnaceCont(id);
    if (!r) return;
    ensure();
    curId = id;
    rec = r;
    lastOpen = performance.now();
    /* ✅ v0.4.44 fix: СНАЧАЛА показать панель, потом рендерить — refresh()
       выходит рано, пока root ещё hidden (слоты не рисовались) */
    root.classList.remove('hidden');
    refresh();
    if (document.pointerLockElement) document.exitPointerLock();
    if (window.menuAudio) menuAudio.click();
  }

  function close() {
    if (!isOpen()) return;
    root.classList.add('hidden');
    curId = null;
    rec = null;
    var canvas = document.querySelector('#gameMount canvas');
    if (canvas && window.BrixGame && BrixGame.state.phase === 'playing') {
      try {
        var p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(function () {});
      } catch (e) {}
    }
  }

  function shutdown() {
    close();
    if (root) root.classList.add('hidden');
  }

  /* ---------- СОЛО/ВКЛАДКИ: сервера нет — плавим ЛОКАЛЬНО ----------
     Та же математика, что у сервера (server.js тик печек): 1 дерево
     горит 8 с, сера 4 с/шт → sulfurM, железо 6 с/шт → metal */
  var FUEL_BURN_SEC = 8;
  var SMELT_SEC = { sulfur: 4, iron: 6 };
  var SMELT_OUT = { sulfur: 'sulfurM', iron: 'metal' };
  var _acc = null;           // {fuel: 0, sulfur: 0, iron: 0} — накопители прогресса
  setInterval(function () {
    if (BrixNet.mode === 'server') return;   // в сервер-режиме плавит server.js
    if (!window.BrixBuilding) return;
    var anyChanged = false;
    window.BrixBuilding._furnaces(function (r) {
      if (!r || !r.on) return;
      r.cont = r.cont || {};
      _acc = _acc || { fuel: 0, sulfur: 0, iron: 0 };
      if ((r.cont.wood || 0) <= 0) { r.on = 0; anyChanged = true; return; }
      _acc.fuel += 1;
      if (_acc.fuel >= FUEL_BURN_SEC) {
        _acc.fuel -= FUEL_BURN_SEC;
        r.cont.wood = (r.cont.wood | 0) - 1;
        if (r.cont.wood <= 0) { delete r.cont.wood; }
        anyChanged = true;
      }
      ['sulfur', 'iron'].forEach(function (ore) {
        if ((r.cont[ore] || 0) <= 0) return;
        _acc[ore] += 1;
        if (_acc[ore] >= SMELT_SEC[ore]) {
          _acc[ore] -= SMELT_SEC[ore];
          r.cont[ore] = (r.cont[ore] | 0) - 1;
          if (r.cont[ore] <= 0) delete r.cont[ore];
          r.cont[SMELT_OUT[ore]] = (r.cont[SMELT_OUT[ore]] | 0) + 1;
          anyChanged = true;
        }
      });
    });
    if (anyChanged) {
      if (window.BrixBuilding) window.BrixBuilding._furnacesDirty();
      refresh();
    }
  }, 1000);

  return {
    open: open,
    close: close,
    isOpen: isOpen,
    openId: openId,
    refresh: refresh,
    onFust: onFust,
    deny: deny,
    shutdown: shutdown
  };
})();
