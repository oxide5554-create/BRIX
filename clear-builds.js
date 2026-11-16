#!/usr/bin/env node
/* ============================================================
   BRIX v0.4.14 — ОЧИСТКА СЕРВЕРА ОТ ВСЕХ ПОСТРОЕК
   ------------------------------------------------------------
   Удаляет из world-objs.json ВСЕ постройки игроков:
   фундаменты, стены, окна, дверные проёмы, двери, потолки.
   Лут ящиков, бочки, дропы и всё остальное НЕ трогает.

   ✅ v0.4.13 — ГЛАВНОЕ ИСПРАВЛЕНИЕ («батник не работал»):
   1) Повышает «поколение мира» (epoch) в world-objs.json.
      Раньше постройки ВОСКРЕСАЛИ: у каждого игрока в браузере
      есть страховочный бэкап (localStorage), и при входе клиент
      сам предлагал его серверу («добрал 32 постр. из бэкапа» в
      логе сервера). Теперь сервер видит «бэкап из прошлого
      поколения» и НЕ принимает его — постройки не возвращаются.
   2) Отказывается работать, если сервер ЕЩЁ РАБОТАЕТ: он держит
      мир в памяти и при остановке записывает его обратно на диск.

   ✅ v0.4.14 — ЕЩЁ ЖЁСТЧЕ:
   3) Поколение мира хранится ЕЩЁ И в отдельном файле
      world-epoch.json. Если world-objs.json потерялся/удалился
      вручную — эпоха всё равно выживает, и старые бэкапы
      браузеров НЕ примутся (именно так «воскресали 32 из бэка»
      при ручном удалении файла).
   4) Батник переименован в CLEAR-BUILDS.bat: у старого имени
      была битая кодировка в ZIP, и cmd.exe не открывал файл
      (LF-переводы строк + кириллица в имени).

   Перед запуском ОСТАНОВИТЕ сервер (закройте его окно).

   Запуск:  node clear-builds.js          (или CLEAR-BUILDS.bat)
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FILE = path.join(__dirname, 'world-objs.json');
/* ✅ v0.4.14: поколение мира дублируем в ОТДЕЛЬНЫЙ файл — он выживает,
   даже если world-objs.json удалён/потерян. Сервер читает его при
   старте (freshWorldObjs/loadWorldObjs), поэтому «свежий» мир всё
   равно знает, что постройки ДО очистки принимать нельзя */
const EPOCH_FILE = path.join(__dirname, 'world-epoch.json');

function readSidecarEp() {
  try {
    let raw = fs.readFileSync(EPOCH_FILE, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    return (JSON.parse(raw).ep) | 0;
  } catch (e) { return 0; }
}

function writeSidecarEp(ep) {
  try { fs.writeFileSync(EPOCH_FILE, JSON.stringify({ ep: ep | 0 })); }
  catch (e) { console.log('  (не смог записать world-epoch.json: ' + e.message + ')'); }
}

/* ✅ v0.4.13: сервер держит мир В ПАМЯТИ — пока он работает, чистить
   бесполезно: при закрытии/сохранении он запишет постройки обратно.
   Батник ставит BRIX_FORCE=1, если игрок подтвердил «всё равно» */
function serverRunning() {
  if (process.platform !== 'win32') return false;
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq node.exe" /NH',
      { encoding: 'utf8', timeout: 10000 });
    return /node\.exe/i.test(out);
  } catch (e) { return false; }   // tasklist не найден — не мешаем
}

function main() {
  const forced = process.env.BRIX_FORCE === '1';

  if (!forced && serverRunning()) {
    console.log('');
    console.log('  ==================================================');
    console.log('  СЕРВЕР СЕЙЧАС РАБОТАЕТ (найден запущенный node.exe).');
    console.log('  Чистить СЕЙЧАС бесполезно: сервер хранит постройки');
    console.log('  в памяти и запишет их обратно в файл при остановке.');
    console.log('  ==================================================');
    console.log('  1) Закройте ЧЁРНОЕ ОКНО СЕРВЕРА (или Ctrl+C в нём).');
    console.log('  2) Запустите CLEAR-BUILDS.bat заново.');
    console.log('');
    return;
  }

  if (!fs.existsSync(FILE)) {
    /* ✅ v0.4.14: файла мира нет (удалили вручную / сбой). Построек и
       так нет, НО поколение всё равно ПОВЫШАЕМ в world-epoch.json —
       иначе сервер стартует с epoch=0 и примет старые бэкапы браузеров:
       именно так постройки «воскресали» после ручного удаления файла */
    const prev = readSidecarEp();
    writeSidecarEp(prev + 1);
    console.log('');
    console.log('  Файл world-objs.json не найден — построек и так нет.');
    console.log('  Поколение мира зафиксировано: ' + (prev + 1) +
      ' (файл world-epoch.json).');
    console.log('  Старые бэкапы браузеров больше НЕ воскресят постройки.');
    console.log('  (Он появляется после первого запуска сервера)');
    console.log('');
    return;
  }

  /* читаю с защитой от BOM (некоторые редакторы добавляют его) */
  let raw = fs.readFileSync(FILE, 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);

  let j;
  try { j = JSON.parse(raw); }
  catch (e) {
    console.log('  ОШИБКА: world-objs.json повреждён (' + e.message + ').');
    console.log('  Ничего не изменилось. Файл можно удалить — сервер создаст новый.');
    return;
  }

  const builds = Array.isArray(j.builds) ? j.builds : [];
  const f = builds.filter((b) => b && b.ty === 'f').length;
  const w = builds.filter((b) => b && b.ty === 'w').length;
  const wi = builds.filter((b) => b && b.ty === 'wi').length;
  const dw = builds.filter((b) => b && b.ty === 'dw').length;
  const dr = builds.filter((b) => b && b.ty === 'dr').length;
  const c = builds.filter((b) => b && b.ty === 'c').length;

  if (!builds.length && !(j.epoch | 0)) {
    console.log('');
    console.log('  Построек на сервере нет — чистить нечего.');
    console.log('');
    return;
  }

  /* страховочная копия: вернуть можно простым переименованием */
  const bak = FILE + '.backup-' + new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(bak, JSON.stringify(j));

  j.builds = [];
  /* ✅ v0.4.13: НОВОЕ ПОКОЛЕНИЕ МИРА — всё, что было построено ДО этой
     очистки, сервер больше не примет из клиентских бэкапов. Бэкапы,
     сделанные ПОСЛЕ очистки (новые дома), по-прежнему спасаются.
     ✅ v0.4.14: эпоха берётся МАКСИМУМОМ из файла и сайдкара — если
     файл откатили/потеряли, поколение всё равно не откатится */
  const prevEp = Math.max((Number(j.epoch) | 0) || 0, readSidecarEp());
  j.epoch = prevEp + 1;
  fs.writeFileSync(FILE, JSON.stringify(j));
  writeSidecarEp(j.epoch);   /* ✅ v0.4.14: дублируем в world-epoch.json */

  console.log('');
  console.log('  ПОСТРОЙКИ УДАЛЕНЫ:');
  console.log('    фундаментов:  ' + f);
  console.log('    стен:         ' + w);
  console.log('    окон:         ' + wi);
  console.log('    проёмов:      ' + dw);
  console.log('    дверей:       ' + dr);
  console.log('    потолков:     ' + c);
  console.log('  Поколение мира (epoch): ' + j.epoch + ' — постройки до');
  console.log('  очистки больше НЕ воскреснут из бэкапов браузеров.');
  console.log('  (дубль поколения: world-epoch.json — v0.4.14)');
  console.log('  Копия старого мира: ' + path.basename(bak));
  console.log('  Лут ящиков, бочки и дропы НЕ тронуты.');
  console.log('  Теперь запустите сервер заново (START-MULTIPLAYER.bat).');
  console.log('  У игроков дом уберётся сам при следующем входе.');
  console.log('');
}

main();
