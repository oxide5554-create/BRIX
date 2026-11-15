// ============================================================
//  brix • js/ui/toast.js
//  Всплывающие уведомления внизу справа (как в оригинале),
//  автозакрытие через 5 секунд + крестик.
// ============================================================
window.BrixToast = (function () {
  'use strict';

  var root = null;

  function ensureRoot() {
    if (!root) root = document.getElementById('toastRoot');
    return root;
  }

  /** toast({ description: 'Текст' }) */
  function toast(opts) {
    var host = ensureRoot();
    if (!host) return;

    // не больше одного тоста одновременно (как TOAST_LIMIT = 1)
    while (host.firstChild) host.removeChild(host.firstChild);

    var el = document.createElement('div');
    el.className = 'toast';

    var desc = document.createElement('div');
    desc.className = 'toast-desc';
    desc.textContent = opts.description || '';
    el.appendChild(desc);

    var x = document.createElement('button');
    x.className = 'toast-x';
    x.innerHTML = BrixIcon('x', 14);
    x.onclick = function () { close(); };
    el.appendChild(x);

    var timer = setTimeout(close, 5000);
    function close() {
      clearTimeout(timer);
      if (el.parentNode) el.parentNode.removeChild(el);
    }

    host.appendChild(el);
  }

  return { toast: toast };
})();
