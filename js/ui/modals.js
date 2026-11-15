// ============================================================
//  brix • js/ui/modals.js
//  Всплывающие окна: подтверждение, профиль, смена ника,
//  окно бета-теста при запуске.
// ============================================================
window.BrixModals = (function () {
  'use strict';

  function overlay(z) {
    var ov = document.createElement('div');
    ov.className = 'overlay';
    ov.style.zIndex = z || 70;
    return ov;
  }

  /* ---------- универсальный диалог подтверждения ---------- */
  function confirmDialog(opts) {
    var ov = overlay(70);
    ov.innerHTML =
      '<div class="modal-box rust-card" style="max-width:440px" role="alertdialog">' +
        '<h3 class="modal-title font-h">' + opts.title + '</h3>' +
        '<p class="modal-text">' + opts.body + '</p>' +
        '<div class="modal-foot">' +
          '<button class="btn-rust" data-cancel>' + opts.cancelText + '</button>' +
          '<button class="btn-rust-primary" data-confirm>' + opts.confirmText + '</button>' +
        '</div>' +
      '</div>';

    ov.onclick = function (e) { if (e.target === ov) { menuAudio.back(); opts.onCancel(); ov.remove(); } };
    ov.querySelector('[data-cancel]').onclick = function () { menuAudio.back(); opts.onCancel(); ov.remove(); };
    ov.querySelector('[data-confirm]').onclick = function () { menuAudio.click(); opts.onConfirm(); ov.remove(); };
    document.body.appendChild(ov);
  }

  /* ---------- окно смены никнейма (2–9 символов) ---------- */
  var NICK_RE = /^[\p{L}\p{N}_-]+$/u;
  function validateNick(raw) {
    var v = raw.trim();
    if (v.length < 2) return 'min';
    if (v.length > 9) return 'max';
    if (!NICK_RE.test(v)) return 'chars';
    return null;
  }

  function nickModal(onClose, mandatory) {
    // ✅ v0.3.4: mandatory — первый вход, отменить нельзя
    var S = BrixState.data;
    var ov = overlay(78);
    ov.innerHTML =
      '<div class="modal-box rust-card nick-box" role="dialog">' +
        '<h3 class="modal-title font-h">' +
          BrixState.t(mandatory ? 'nick.titleFirst' : 'nick.title') + '</h3>' +
        '<label class="nick-label">' + BrixState.t('nick.label') + '</label>' +
        '<input class="nick-input" maxlength="18" placeholder="' + S.settings.nick.replace(/"/g, '&quot;') + '">' +
        '<div class="nick-under">' +
          '<span class="hint" data-err>' + BrixState.t('nick.hint') + '</span>' +
          '<span class="hint" data-count>' + BrixState.t('nick.counter', { n: 0 }) + '</span>' +
        '</div>' +
        '<div class="modal-foot">' +
          (mandatory ? '' : '<button class="btn-rust" data-cancel>' + BrixState.t('nick.cancel') + '</button>') +
          '<button class="btn-rust-primary" data-save>' + BrixState.t('nick.save') + '</button>' +
        '</div>' +
      '</div>';

    var input = ov.querySelector('.nick-input');
    var errEl = ov.querySelector('[data-err]');
    var cntEl = ov.querySelector('[data-count]');
    var saveBtn = ov.querySelector('[data-save]');

    function currentError() { return validateNick(input.value); }

    function refresh() {
      var err = currentError();
      if (err) {
        errEl.textContent = BrixState.t('nick.err.' + err);
        errEl.className = 'err';
      } else {
        errEl.textContent = BrixState.t('nick.hint');
        errEl.className = 'hint';
      }
      var n = input.value.length;
      cntEl.textContent = BrixState.t('nick.counter', { n: n });
      cntEl.className = n > 9 ? 'counter bad' : 'counter hint';
      saveBtn.disabled = !!err;
    }

    input.addEventListener('input', refresh);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !saveBtn.disabled) save();
      if (e.key === 'Escape' && !mandatory) { menuAudio.back(); close(); }
    });

    function save() {
      var err = validateNick(input.value);
      if (err) { menuAudio.error(); return; }
      var clean = input.value.trim();
      BrixState.updateSettings({ nick: clean });
      BrixState.setNickSet();
      BrixToast.toast({ description: BrixState.t('nick.saved', { name: clean }) });
      menuAudio.buy();
      close();
    }

    function close() { ov.remove(); if (onClose) onClose(); }

    var cancelBtn = ov.querySelector('[data-cancel]');
    if (cancelBtn) cancelBtn.onclick = function () { menuAudio.back(); close(); };
    saveBtn.onclick = save;
    ov.onclick = function (e) { if (e.target === ov && !mandatory) close(); };

    document.body.appendChild(ov);
    input.focus();
    refresh();
  }

  /* ---------- окно профиля игрока ---------- */
  function profileModal(onClose) {
    var id = BrixState.ensureProfileId();
    var S = BrixState.data;

    var hours = S.hoursPlayed.toFixed(1).replace('.', ',');

    var ov = overlay(78);
    ov.innerHTML =
      '<div class="modal-box rust-card profile-box" role="dialog">' +
        '<div class="profile-head">' +
          '<div class="avatar-round">' + S.settings.nick.slice(0, 1).toUpperCase() + '</div>' +
          '<div>' +
            '<h3 class="font-h">' + BrixState.t('profile.title') + '</h3>' +
            '<div class="sub">' + BrixState.t('common.beta') + ' · BRIX v0.3.5</div>' +
          '</div>' +
        '</div>' +
        '<div class="profile-rows">' +
          '<div class="profile-row"><span class="lbl">' + BrixIcon('hash') + BrixState.t('profile.id') + '</span><span class="val">' + id + '</span></div>' +
          '<div class="profile-row"><span class="lbl">' + BrixIcon('user') + BrixState.t('profile.name') + '</span><span class="val">' + S.settings.nick + '</span></div>' +
          '<div class="profile-row"><span class="lbl">' + BrixIcon('award') + BrixState.t('profile.level') + '</span><span class="val">' + S.level + '</span></div>' +
          '<div class="profile-row"><span class="lbl">' + BrixIcon('clock') + BrixState.t('profile.hours') + '</span><span class="val">' + BrixState.t('profile.hoursVal', { n: hours }) + '</span></div>' +
        '</div>' +
        '<div class="modal-foot">' +
          '<button class="btn-rust" data-nick>' + BrixState.t('profile.changeNick') + '</button>' +
          '<button class="btn-rust-primary" data-close>' + BrixState.t('profile.close') + '</button>' +
        '</div>' +
      '</div>';

    function close() { ov.remove(); if (onClose) onClose(); }

    ov.querySelector('[data-close]').onclick = function () { menuAudio.back(); close(); };
    ov.querySelector('[data-nick]').onclick = function () {
      menuAudio.click();
      nickModal();
    };
    ov.onclick = function (e) { if (e.target === ov) close(); };

    document.body.appendChild(ov);
  }

  /* ---------- окно бета-теста при каждом открытии игры ---------- */
  function betaWelcome(onClose) {
    var ov = overlay(80);
    ov.innerHTML =
      '<div class="modal-box rust-card beta-box" role="alertdialog">' +
        '<div class="beta-head">' +
          '<img src="assets/icon.png" alt="">' +
          '<div>' +
            '<div class="t1">BRIX</div>' +
            '<div class="t2">' + BrixState.t('beta.title') + '</div>' +
          '</div>' +
          '<span class="mini-badge">' + BrixState.t('common.beta') + '</span>' +
        '</div>' +
        '<h3 class="beta-hello">' + BrixState.t('beta.hello') + '</h3>' +
        '<p class="body">' + BrixState.t('beta.body1') + '</p>' +
        '<p class="body">' + BrixState.t('beta.body2') + '</p>' +
        '<div class="beta-working">' +
          '<div class="cap">' + BrixState.t('beta.working') + '</div>' +
          '<ul>' +
            '<li>' + BrixIcon('check', 13) + BrixState.t('beta.work1') + '</li>' +
            '<li>' + BrixIcon('check', 13) + BrixState.t('beta.work2') + '</li>' +
            '<li>' + BrixIcon('check', 13) + BrixState.t('beta.work3') + '</li>' +
          '</ul>' +
        '</div>' +
        '<div class="beta-foot">' +
          '<button class="btn-rust-primary" data-ok>' + BrixState.t('beta.ok') + '</button>' +
        '</div>' +
      '</div>';

    function close() { ov.remove(); if (onClose) onClose(); }
    ov.querySelector('[data-ok]').onclick = function () { menuAudio.click(); close(); };
    ov.onclick = function (e) { if (e.target === ov) close(); };

    document.body.appendChild(ov);
  }

  return {
    confirmDialog: confirmDialog,
    nickModal: nickModal,
    profileModal: profileModal,
    betaWelcome: betaWelcome
  };
})();
