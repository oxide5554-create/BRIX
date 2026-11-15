// ============================================================
//  brix • js/data/itemicons.js
//  Силуэтные иконки предметов для магазина скинов.
//  Все path нарисованы на сетке 64x64, заливка currentColor,
//  «прорези» — обводка цветом фона карточки.
//  Полный перенос из components/menu/ItemIcon.tsx.
// ============================================================
window.BrixData = window.BrixData || {};

window.BrixData.itemIcon = (function () {
  'use strict';

  var CUT = '#141716';

  var shapes = {
    hatchet: function () {
      return '<path d="M11 57 L37 31 L43 37 L17 63 Z"/>' +
        '<path d="M34 30 L46 6 C56 10 61 19 58 29 L46 38 C42 35 38 32 34 30 Z"/>' +
        '<path d="M44 16 L53 25" stroke="' + CUT + '" stroke-width="2.4" fill="none"/>';
    },
    pickaxe: function () {
      return '<path d="M27 16 L35 16 L39 58 L31 58 Z"/>' +
        '<path d="M4 27 C10 11 54 11 60 27 L53 31 C47 19 17 19 11 31 Z"/>';
    },
    rifle: function () {
      return '<path d="M2 29 L12 27 L12 38 L2 40 Z"/>' +
        '<rect x="12" y="26" width="32" height="11"/>' +
        '<rect x="44" y="29" width="16" height="4"/>' +
        '<rect x="51" y="25" width="3" height="4"/>' +
        '<path d="M24 37 L33 37 L30 51 L21 49 Z"/>' +
        '<path d="M37 37 L43 37 L41 47 L36 45 Z"/>' +
        '<path d="M14 29 H42" stroke="' + CUT + '" stroke-width="1.6" fill="none"/>';
    },
    pistol: function () {
      return '<path d="M8 23 H45 V33 H8 Z"/>' +
        '<rect x="45" y="25" width="11" height="5"/>' +
        '<circle cx="24" cy="28" r="7.5"/>' +
        '<circle cx="24" cy="28" r="3" fill="' + CUT + '"/>' +
        '<path d="M10 33 L21 33 L18 50 L8 47 Z"/>';
    },
    bow: function () {
      return '<path d="M18 5 C40 15 40 49 18 59" stroke="currentColor" stroke-width="4.5" fill="none" stroke-linecap="round"/>' +
        '<path d="M18 5 L18 59" stroke="currentColor" stroke-width="2" fill="none"/>' +
        '<path d="M14 32 H46" stroke="currentColor" stroke-width="3" fill="none"/>' +
        '<path d="M42 27 L52 32 L42 37 Z"/>';
    },
    bandana: function () {
      return '<path d="M12 24 H52 V38 C46 45 18 45 12 38 Z"/>' +
        '<path d="M52 25 L61 19 L59 28 Z"/>' +
        '<path d="M12 30 L3 26 L7 35 Z"/>' +
        '<path d="M12 24 H52" stroke="' + CUT + '" stroke-width="2" fill="none"/>';
    },
    hoodie: function () {
      return '<path d="M23 6 C23 2 41 2 41 6 L43 13 H21 Z"/>' +
        '<path d="M21 13 C13 17 9 24 9 33 L13 58 H24 L28 36 H36 L40 58 H51 L55 33 C55 24 51 17 43 13 Z"/>' +
        '<path d="M26 46 H38 M29 16 V24 M35 16 V24" stroke="' + CUT + '" stroke-width="2" fill="none"/>';
    },
    pants: function () {
      return '<path d="M17 8 H47 L52 58 H36 L32 32 L28 58 H12 Z"/>' +
        '<path d="M17 12 H47" stroke="' + CUT + '" stroke-width="2" fill="none"/>' +
        '<path d="M17 8 L17 58 M47 8 L47 58" stroke="' + CUT + '" stroke-width="1.6" fill="none"/>';
    },
    helmet: function () {
      return '<path d="M12 36 C12 17 52 17 52 36 Z"/>' +
        '<path d="M8 36 H56 V42 C56 44 54 46 52 46 H12 C10 46 8 44 8 42 Z"/>' +
        '<path d="M12 32 C14 26 20 22 28 21" stroke="' + CUT + '" stroke-width="2.4" fill="none"/>';
    },
    door: function () {
      return '<path d="M18 4 H46 V60 H18 Z"/>' +
        '<path d="M24 6 V58 M30 6 V58 M36 6 V58 M20 20 H44 M20 46 H44" stroke="' + CUT + '" stroke-width="1.8" fill="none"/>' +
        '<circle cx="41" cy="34" r="3" fill="' + CUT + '"/>';
    },
    bag: function () {
      return '<rect x="8" y="20" width="48" height="24" rx="12"/>' +
        '<path d="M22 20 V44 M38 20 V44" stroke="' + CUT + '" stroke-width="2.4" fill="none"/>' +
        '<circle cx="14" cy="32" r="4" fill="' + CUT + '"/>';
    },
    crate: function () {
      return '<path d="M10 12 H54 V52 H10 Z"/>' +
        '<path d="M10 12 L54 52 M54 12 L10 52" stroke="' + CUT + '" stroke-width="3" fill="none"/>' +
        '<rect x="10" y="29" width="44" height="4" fill="' + CUT + '"/>';
    }
  };

  /** SVG-строка иконки предмета (класс задаёт размер и цвет) */
  return function (name, className) {
    var fn = shapes[name] || shapes.hatchet;
    return '<svg viewBox="0 0 64 64" class="' + (className || '') +
      '" fill="currentColor" aria-hidden="true">' + fn() + '</svg>';
  };
})();
