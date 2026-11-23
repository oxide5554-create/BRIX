/* ============================================================
 *  brix • server.js — АВТОРИТЕТНЫЙ СЕРВЕР МУЛЬТИПЛЕЕРА (v0.4.7)
 *  Как в Rust/Oxide: сервер — хозяин мира.
 *
 *  Ноль зависимостей: чистый Node.js.
 *   1. Раздаёт файлы игры по http://localhost:8787
 *      (чтобы не возиться с file:// и кэшем).
 *   2. WebSocket-сервер (свой, без npm) на том же порту.
 *
 *  ЧТО СЕРВЕР ХРАНИТ (авторитетно):
 *   - список игроков (ростер): id, имя, цвет, последнее состояние;
 *   - состояние мира: запас каждого дерева и каждой рудной жилы.
 *
 *  ПРАВИЛА:
 *   - новый игрок получает welcome: свой id (назначает сервер),
 *     СПИСОК ВСЕХ ТЕКУЩИХ ИГРОКОВ с их позициями и состояние мира
 *     → сразу видит и старых игроков, и общий запас ресурсов;
 *   - все остальные получают join/leave при входе/выходе;
 *   - удар по ресурсу: клиент шлёт ЗАПРОС, сервер применяет его к
 *     миру (сам считает остаток, сам решает «упало/рассыпалось»,
 *     сам выбирает сторону падения) и рассылает результат всем;
 *   - игрок, молчащий дольше 30 с, выбрасывается из ростера.
 * ============================================================ */
'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/* ✅ v0.4.64 ДВА СЕРВЕРА ОДНИМ КОДОМ: BRIX_REALM решает, КТО этот процесс.
   Запуск (см. START-GAME.bat):
     node server.js                                → BrixLand  (порт 8787, выживание)
     BRIX_REALM=brixpvp BRIX_PORT=8788 node server.js → BrixPvP (порт 8788, пвп-арена)
   У каждого реалма СВОЯ папка data/<realm>/ — свои миры, свои сохранения
   игроков, свои регистры соцсети и свой счётчик онлайна (/status).
   admins.json и bans.json — ОБЩИЕ (в корне): админ/бан — на весь BRIX */
const REALM = (process.env.BRIX_REALM || 'brixland').toLowerCase() === 'brixpvp'
  ? 'brixpvp' : 'brixland';
const PORT = Number(process.env.BRIX_PORT) || (REALM === 'brixpvp' ? 8788 : 8787);
const ROOT = __dirname;

/* ✅ v0.4.64 метаданные реалма: имя и режим едут в /status и welcome —
   по ним клиент включает вкладку серверов и ПВП-режим интерфейса */
const SRV_NAME = REALM === 'brixpvp' ? 'BRIX • BrixPvP' : 'BRIX • BrixLand';
const SRV_MODE = REALM === 'brixpvp' ? 'pvp' : 'vanilla';

/* ✅ v0.4.64 ПАПКА ДАННЫХ РЕАЛМА: data/brixland/ и data/brixpvp/.
   Старые файлы из корня (до v0.4.64) переезжают в data/brixland —
   мир, сохранения и соцсеть BrixLand НЕ ТЕРЯЮТСЯ */
const DATA_DIR = path.join(ROOT, 'data', REALM);
fs.mkdirSync(DATA_DIR, { recursive: true });
if (REALM === 'brixland') {
  ['world-objs.json', 'world-epoch.json', 'players.json', 'social.json']
    .forEach(function (f) {
      var from = path.join(ROOT, f), to = path.join(DATA_DIR, f);
      try {
        if (fs.existsSync(from) && !fs.existsSync(to)) {
          fs.renameSync(from, to);
          console.log('[data] миграция ' + f + ' → data/brixland/');
        }
      } catch (eMig) { console.log('[data] миграция ' + f + ' не удалась: ' + eMig.message); }
    });
}

/* ✅ v0.4.17: версия СЕРВЕРА — едет в welcome.sv и /status. Клиент по ней
   видит: подключился ли он вообще к НОВОМУ серверу (старый server.js
   версии не присылает — и панель на 9 молчит). В консоли при старте
   печатается ПОЛНЫЙ ПУТЬ папки сервера — чтобы admins.json правился
   именно там, где сервер РЕАЛЬНО запущен */
const SRV_VER = '0.5.9';   /* ✅ v0.5.0 — ЗАМЕНИ server.js И ПЕРЕЗАПУСТИ:
   1) КОМАНДНЫЙ БОЙ НА АРЕНЕ (реалм brixpvp): боты-учёные считает
      СЕРВЕР (brixpvp-bots.js + arena-solids.json) — СТАЛЬ (синие)
      против ПЛАМЯ (красные), 10 ботов, при входе игрока один синий
      уходит; боты стреляют в ближайшего врага ('bots' 10 Гц,
      'bshot', 'bdead'/'bspawn', 'bscore', 'bwin' — победа до 30);
      'bhit' — урон игрока по красному боту (своих не убить);
      урон игрок-в-игрока на арене заблокирован; welcome.pvp —
      снапшот ботов и счёта новичку.
   —— История: v0.4.51 — сутки/погода на сервере ('dnc' 1 Гц, welcome.dnc,
      world-env.json), холод ночью в зиме ×2.
   —— История: v0.4.50 — трупы 10 мин, С4 в горах, звук шприца.
   —— История: v0.4.46 — лестница (2 марша, коллайдер ступеней, потолок
      в клетке запрещён), окно на 2 этаж, фикс разрушения руды, фикс
      F по трупу (камера в луч наводки); v0.4.43 — С4 на сервере,
      обломки, трупы-лутбоксы; v0.4.44 — этажность, печка, бочки,
      урон от высоты, военный лут. */
/* —— Архив истории сервера (v0.4.30–0.4.46 подробнее):
   3) ПЕЧКА ty 'fu' (fuplace/futog/fuput/futake + 'fust' всем): плавит серу
      4 с/шт → sulfurM и железо 6 с/шт → metal ЗА ДЕРЕВО (1 шт/8 с); состояние
      cont/on живёт на сервере, переживает рестарт; кончилось дерево — гаснет сама.
   4) БОЧКИ 6 хп: камень/кулак 1 (6 ударов), железо 1.5 (4 удара), БУЛАВА 6
      (1 удар); постройки: булава 30 за удар. Старые бочки (hp 2) мигрируют до 6.
   5) УРОН ОТ ВЫСОТЫ: case 'fdmg' — сервер применяет урон падения ТОЛЬКО жертве
      (≤100), остальным phit kind 'fall'; pdeath w 'fall' → «ТЫ РАЗБИЛСЯ».
   6) С4: фьюз РОВНО 8.015 с (C4_FUSE_MS=8015, 12 тыков — таблица совпадает
      с клиентом); броски до 30 м (было 10/12 — «С4 не ломает маленькие дома»).
   7) ТРУПЫ: пустой труп НЕ СОЗДАЁТСЯ.
   8) ЧЕКБЛОКИ: сервер сам выбирает тип ящика (30% военных) и перебрасывает
      его при каждом респавне; ВОЕННЫЙ ЛУТ: калаш/томпсон/дробовик/булава/
      карабин + патроны + С4 + порох.
   История: v0.4.43 — С4 на сервере, обломки, трупы-лутбоксы; 0.4.37–42 —
   защита видеокарты, булава, хит-маркеры, таблица урона, дорога, биомы.
   ✅ v0.4.43 С4 НА СЕРВЕРЕ + ОБЛОМКИ + ТРУПЫ-ЛУТБОКСЫ.
   ЛОГИКА СЕРВЕРА МЕНЯЛАСЬ — замени server.js и ПЕРЕЗАПУСТИ:
   1) С4 ТИКАЕТ В СЕРВЕРЕ (а не у игрока): сервер хранит каждую С4
      (id, точка, нормаль, кто поставил, время постановки), сам взрывает
      её через 11.24 с и сам считает урон (постройки −400, игроки −250).
      Игрок вышел из игры — бомба ВСЁ РАВНО взорвётся. Новый игрок,
      зашедший ПОСЛЕ постановки, видит блок (снапшот c4 с остатком фьюза)
      и слышит тыки с правильной фазы. С4 ПЕРЕЖИВАЕТ ПЕРЕЗАПУСК СЕРВЕРА
      (world-objs.json v6).
   2) ОБЛОМКИ: всё, что взрыв С4 снёс, НЕ исчезает молча — сервер
      рассылает 'debris', и у ВСЕХ игроков разрушенная деталь
      распадается на решётку 5×5 кусков, которые физически падают на
      землю и через ~7 с растворяются (у всех одинаково).
   3) ТРУПЫ-ЛУТБОКСЫ: при смерти игрока его ВЕСЬ инвентарь уходит в
      труп (rec.id = 'rNN'), труп видят все, синхронизируется сервером,
      сохраняется в world-objs.json (новые игроки его видят), лутается
      по F как ящик. Опустел — убран. TTL 20 минут.
   4) РЭГДОЛЛ: чужой игрок при смерти больше не уходит под землю —
      «кости пропадают», тело падает на землю (клиент, remoteplayer.js).
   Прошлое (v0.4.42) — текстуры биомов + следы ног (логика сервера не менялась).
   Прошлые версии (0.4.37–41) работают как раньше: защита видеокарты (WebGL
   context lost), булава, хит-маркеры, новая таблица урона (голова/тело=голова/2,
   дробовик по дистанции), дорога вокруг озера, хват томпсона/карабина.
   ✅ v0.4.41 С4 (СТАРОЕ ПОВЕДЕНИЕ, заменено в 0.4.43): фьюз жил на клиенте
   бросавшего, сервер только считал урон по 'c4boom' — теперь таймер и
   взрыв авторитетно держит сервер (клиентский 'c4boom' работает как
   failsafe и для совместимости со старыми клиентами).
   ✅ v0.4.39 ХВАТ ПО ГЕОМЕТРИИ + КАРАБИН + ДОРОГА МНОГОТОННАЯ
   (логика сервера НЕ менялась): только поднята версия. Клиент 0.4.39 —
   1) хват томпсона по вершинам модели (точка рукояти = центр бокса рукояти,
   левая рука на ВЕРТИКАЛЬНОЙ передней рукоятке M1928, ADS dist 0.64);
   2) револьвер-карабин 3×: крупнее (0.62 м), отодвинут вправо от хотбара,
   в прицеле очень точный (разброс ×0.02);
   3) дорога-цепочка ВОКРУГ КАРТЫ (1325 м) и МНОГОТОННАЯ (вершинные цвета:
   мокрая земля/пыль/глина/след колёс/края в траву, полосы по длине).
   Замени server.js и ПЕРЕЗАПУСТИ сервер, иначе баннер «СЕРВЕР СТАРЫЙ»
   (клиент 0.4.39 > сервер 0.4.38).
   ✅ v0.4.38 ХВАТ ОРУЖИЯ + ДОРОГА (логика сервера НЕ менялась):
   только поднята версия — клиент 0.4.38 чинит хват томпсона (знак сдвига
   рукояти в нормализации модели — руки «не держали» оружие) и хват
   револьвера-карабина 3× (ладонь была на проволочном прикладе — «сквозь
   руки»; теперь RVX.gx: рукоять точно в ладони, как у обычного револьвера),
   и добавляет ЕДИНСТВЕННУЮ грунтовую дорогу-цепочку (road.js: лента по
   рельефу + линия на карте M). Замени server.js и ПЕРЕЗАПУСТИ сервер,
   иначе игра покажет баннер «СЕРВЕР СТАРЫЙ» (клиент 0.4.38 > сервер 0.4.37).
   ✅ v0.4.37 ФИКС ПАДЕНИЯ ВИДЕОДРАЙВЕРА (WebGL Context Lost):
   только поднята версия — ЛОГИКА СЕРВЕРА НЕ МЕНЯЛАСЬ. Клиент 0.4.37
   научился переживать сбой видеокарты (CONTEXT_LOST_WEBGL → пауза
   рендера → автовосстановление без перезагрузки страницы) и перестал
   рендерить фон меню во время игры (экономия видеопамяти).
   ВАЖНО: замени server.js и ПЕРЕЗАПУСТИ сервер, чтобы игра не
   показывала баннер «СЕРВЕР СТАРЫЙ» (клиент 0.4.37 > сервер 0.4.36).
   ✅ v0.4.36 РЕВОЛЬВЕР-КАРАБИН 3× + ПОТОЛОК УРОНА ПО ОРУЖИЮ:
   1) новый снайпер — пуля rev3x (45) НЕ проходит под старым потолком 'shot' (≤20),
      теперь потолок урона считается по оружию из phit (msg.w):
      shotgun 96 (8 дробин по 12), rev3x 45, ak/revolver 20, thompson 12, прочее 20;
   2) ФИКС ПОПУТНО: раньше ЛЮБОЙ выстрел резался до 20 — дробовик в мультиплеере
      НЕ МОГ убить с одного выстрела (в упор до 96 дробью). Теперь честно.
   ✅ v0.4.35 ТОМПСОН: пуля томпсона (12) проходит под потолком 'thompson' (12).
   Оружие и дистанция едут в phit как раньше.
   ✅ v0.4.34 ЗИМНИЙ АПДЕЙТ ЭТАП 1 — УРОН ОТ ХОЛОДА:
   1) сервер считает ШКАЛУ ХОЛОДА (0..100) для каждого игрока по ВЫСОТЕ
      рельефа — та же детерминированная формула heightAt, что в
      js/game/terrain.js (горы со снегом = зима);
   2) в зиме шкала РАСТЁТ (чем выше/снежнее — тем быстрее), ХП тает тем
      сильнее, чем больше шкала (с 30 холода); умер → pdeath (cold:1);
   3) вышел из зимы — шкала ПО НЕМНОЖКУ тает, в тепле исчезает полностью;
   4) раз в секунду каждому игроку пушится 'cold' {v,z,hp} — клиент
      рисует баннер температуры (TOO COLD -11°) и ИНЕЙ по углам экрана,
      который постепенно «размораживается»;
   5) respawn сбрасывает холод; бессмертие (god) защищает от урона.
   ✅ v0.4.32 (без изменений в 0.4.34):
   1) сломанная постройка уходит из мира СЕРВЕРА ПОЛНОСТЬЮ: из worldObjs.builds
      И из индексов buildCell/buildEdge (раньше сервер «помнил» клетку/край до
      перезапуска — на сломанный фундамент можно было ставить стены), brem
      доходит всем — никто не рендерит сломанное, новичкам оно не приедет;
   2) НОВЫЕ ХП: фундамент 350, остальные постройки 300 (дверь была 150);
   3) НОВЫЙ УРОН (дробный, «1 хп за N ударов»): каменный топор 0.2/удар,
      каменная кирка 0.25, железная кирка 0.5, железный топор 1/3;
   4) хп переживает и 0 игроков, и перезапуск сервера (миграция старой
      шкалы 200/150 → 350/300 при загрузке world-objs.json v4);
   5) сундук — как был (25 хп).
   ✅ v0.4.31 (клиент building.js) FIX «ХП-БАР НЕ ВИДЕН»: бар и подсказка
   двери крепятся в #gameHud, а не в <body> (были ПОД игровым экраном).
   Предыдущее 0.4.30: ПОСТРОЙКИ СНОВА ЛОМАЮТСЯ — в switch был ВТОРОЙ
   case 'bhit' (постройки), который JavaScript НИКОГДА не выполнял (первый
   совпавший case 'bhit' — бочки — выигрывал). Клиент js/net/net.js:
   BrixNet.on() больше не затирает предыдущий обработчик, а строит цепочку */
const PLAYER_TIMEOUT = 90000;   // молчание дольше этого — игрок «выпал» (фоновые вкладки шлют pong)

/* ✅ v0.3.8: РЕСПАВН ПО ТАЙМЕРУ СЕРВЕРА (не по перезагрузке клиента!) */
const BARREL_RESPAWN_MS = 12 * 60 * 1000;          // бочка — 12 минут
const CRATE_RESPAWN_MS = {                          // ящик чекблока (как в репозитории)
  wooden: 5 * 60 * 1000,
  military: 25 * 60 * 1000
};

/* ✅ v0.4.44: С4 ТИКАЕТ В СЕРВЕРЕ. Полный фьюз = 12 тыков (7.5 с,
   интервалы 0.735 − 0.02·i — ТАБЛИЦА СОВПАДАЕТ С КЛИЕНТОМ c4Interval(i))
   + последний интервал 0.515 с = 8.015 с от постановки до взрыва */
const C4_FUSE_MS = 8015;
/* ✅ v0.4.43: ТРУП-ЛУТБОКС живёт НА СЕРВЕРЕ (потом убирается по TTL),
   опустел — убирается сразу. Переживает перезапуск сервера.
   ✅ v0.4.50: TTL — 10 минут для незалутанного, 20 для залутанного (ниже) */
/* ✅ v0.4.50 ТТЛ ТРУПОВ (просьба игрока: «трупы исчезают через каждые
   10 мин, если их никто не залутал»): НЕЗАЛУТАННЫЙ труп живёт 10 минут
   (было 20), а с которого УЖЕ ЧТО-ТО взяли (lt=1) — 20 минут страховки
   (опустел — убирается сразу в 'corpseTake', как и было) */
const CORPSE_TTL_MS = 10 * 60 * 1000;
const CORPSE_TTL_LOOTED_MS = 20 * 60 * 1000;
const CORPSE_MAX = 24;

/* ---------- 1. Статика ---------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
  '.bin': 'application/octet-stream',
  '.bat': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

/* ✅ v0.3.5: заявки в друзья игрокам, которых сейчас нет на сервере.
   Хранятся по нику 15 минут: игрок заходит — сервер сам доставляет */
const pendingInvites = new Map();   // lower(ник) -> [{from, fromId, at}]
function deliverPending(target) {
  const key = String(target.name || '').trim().toLowerCase();
  const list = pendingInvites.get(key);
  if (!list || !list.length) return 0;
  let n = 0;
  list.forEach((inv) => {
    if (Date.now() - inv.at > 15 * 60 * 1000) return;
    target.send({ t: 'fsoc', from: inv.from, fromId: inv.fromId,
      kind: 'finvite', data: null });
    n++;
    console.log('[soc] ' + target.name + ' получил отложенную заявку от ' + inv.from);
  });
  pendingInvites.delete(key);
  return n;
}

function serveFile(req, res, urlPath) {
  let p = urlPath.split('?')[0].split('#')[0];
  // ✅ v0.3.5: заявка в друзья прямо из МЕНЮ (WS ещё не подключён).
  // Игрок онлайн → доставляем сразу; нет → кладём в очередь на 15 мин
  if (req.method === 'OPTIONS' && p === '/invite') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }
  if (req.method === 'POST' && p === '/invite') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      let j = null;
      try { j = JSON.parse(body); } catch (e) {}
      const from = String((j && j.from) || '').trim().slice(0, 16);
      const fromId = String((j && j.fromId) || '').trim().slice(0, 24);
      const to = String((j && j.to) || '').trim().toLowerCase().slice(0, 16);
      const out = (o) => {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(o));
      };
      if (!from || !to || from.toLowerCase() === to) { out({ ok: false, why: 'bad' }); return; }
      // сам себе — нельзя
      let delivered = false;
      players.forEach((target) => {
        if (target.name.toLowerCase() === to) {
          target.send({ t: 'fsoc', from: from, fromId: fromId, kind: 'finvite', data: null });
          delivered = true;
        }
      });
      if (delivered) {
        console.log('[soc] ' + from + ' → ' + to + ': заявка доставлена (онлайн)');
        out({ ok: true, delivered: true, queued: false });
      } else if (to.startsWith('brix-')) {
        out({ ok: false, why: 'byid' });   // офлайн-поиск только по нику
      } else {
        const list = pendingInvites.get(to) || [];
        if (list.length >= 10) { out({ ok: false, why: 'full' }); return; }
        list.push({ from: from, fromId: fromId, at: Date.now() });
        pendingInvites.set(to, list);
        console.log('[soc] ' + from + ' → ' + to + ': заявка в очереди (игрок офлайн)');
        out({ ok: true, delivered: false, queued: true });
      }
    });
    return;
  }
  // ✅ v0.3.3: живой счётчик онлайна — сколько игроков РЕАЛЬНО на сервере
  if (p === '/status') {
    const names = [];
    players.forEach((pl) => names.push(pl.name));
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      ok: true, players: players.size, max: 64, inGame: countInGame(),
      names: names, map: REALM === 'brixpvp' ? 'Полигон (СЕКТОР-9)' : 'Brixland',
      /* ✅ v0.4.64: КТО этот сервер — для вкладки «СЕРВЕРА» (список
         серверов с живыми счётчиками) и ПВП-режима клиента */
      realm: REALM, mode: SRV_MODE, name: SRV_NAME,
      /* ✅ v0.4.17: диагностика панели разработчика — открой в браузере
         http://<адрес>:8787/status и видно: версию сервера, ПАПКУ,
         откуда он запущен, и какие ID он считает админами */
      ver: SRV_VER, folder: ROOT, adminIds: Array.from(ADMIN_AIDS)
    }));
    return;
  }
  if (p === '/' || p === '') p = '/index.html';
  const file = path.normalize(path.join(ROOT, decodeURIComponent(p)));
  // не даём выйти за пределы папки игры
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found: ' + p); return; }
    const ext = path.extname(file).toLowerCase();
    /* ✅ v0.5.9: КЭШ АССЕТОВ. Тяжёлые неизменяемые файлы (.glb, .png,
       .mp3, .wav, папки /assets/, /models/, /icons/) — на ГОД с
       immutable: через туннель при повторном заходе берутся из кэша
       браузера, а не качаются заново (вечная загрузка на 53%/79%).
       Код игры (html/js/css/json) — по-прежнему no-cache, чтобы
       обновления применялись сразу. */
    const cacheable =
      ['.glb', '.gltf', '.bin', '.png', '.jpg', '.svg', '.ico',
       '.mp3', '.wav', '.ogg'].indexOf(ext) !== -1 ||
      /^(\/assets\/|\/models\/|\/icons\/)/.test(p);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': cacheable
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
}

/* ---------- 2. WebSocket (свой, без npm) ---------- */

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function wsAccept(key) {
  return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
}

/** закодировать ТЕКСТОВЫЙ фрейм сервер -> клиент (без маски) */
function wsEncodeText(str) {
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let head;
  if (len < 126) {
    head = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x81; head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x81; head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([head, payload]);
}

/** парсер потока клиентских фреймов (клиенты шлют МАСКИРОВАННЫЕ фреймы) */
function wsParser(onMessage, onClose) {
  let buf = Buffer.alloc(0);
  return function feed(chunk) {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2); off = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2)); off = 10;
      }
      const maskLen = masked ? 4 : 0;
      if (buf.length < off + maskLen + len) return;
      const payload = buf.slice(off + maskLen, off + maskLen + len);
      if (masked) {
        const mask = buf.slice(off, off + 4);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }
      buf = buf.slice(off + maskLen + len);
      if (opcode === 0x8) { onClose(); return; }         // close
      if (opcode === 0x9) continue;                      // ping
      if (opcode === 0xA) continue;                      // pong
      if ((opcode === 0x1 || opcode === 0x2) && fin) {
        onMessage(payload.toString('utf8'), opcode);
      }
    }
  };
}

/* ---------- 3. АВТОРИТЕТНОЕ СОСТОЯНИЕ ---------- */

const players = new Map();   // id -> {id, name, c, sock, send, state, last}
let nextNum = 1;
let world = null;            // {trees: [{w, g, fd}], ores: {iron: [], sulfur: [], stone: []}}

function broadcast(obj, excludeId) {
  const text = JSON.stringify(obj);
  players.forEach((p) => {
    if (p.id === excludeId) return;
    try { p.sock.write(wsEncodeText(text)); } catch (e) { /* умрёт само */ }
  });
}

/* ✅ v0.3.6: счётчик онлайна меняет ТОЛЬКО СЕРВЕР и пушит его КАЖДОМУ
   игроку сразу при входе/выходе — игроки на число не влияют */
// ✅ v0.4.1: два понятных счётчика: НА СЕРВЕРЕ (все подключения,
// включая тех, кто ещё в меню) и В ИГРЕ (уже заспавнились в мир)
function countInGame() {
  let n = 0;
  players.forEach((p) => { if (p.state) n++; });
  return n;
}

function pushCount() {
  broadcast({ t: 'cnt', n: players.size, g: countInGame() }, null);
}

function rosterFor() {
  const out = [];
  players.forEach((p) => {
    // ✅ v0.4.3: в ростере ещё и уровень (lvl) + BRIX-ID (aid) аккаунта
    // ✅ v0.4.5: и здоровье — у нового игрока полоски хп у всех сразу
    out.push({ id: p.id, n: p.name, c: p.c, lvl: p.lvl || 1, aid: p.aid || '',
      hp: p.dead ? 0 : (p.hp === undefined ? 100 : p.hp),
      s: p.state || null });
  });
  return out;
}

/* ✅ v0.3.7: МИР ОБЪЕКТОВ — ЧЕКБЛОКИ С ЛОМАЮЩИМИСЯ БОЧКАМИ.
   Одиночных бочек и ящиков на карте больше НЕТ: всё лутаемое живёт
   внутри чекблоков (как в репозитории oxide5554-create/-glm,
   scr/world/locations/checkblock.js):
   1 предмет-декорация (стиралка / холодильник / ЭЛТ-телевизор) +
   2-3 ЛОМАЮЩИЕСЯ бочки (одна лежит, с разливом) + ящик с лутом + мусор.
   HP бочек, разбитие, дропы и лут ящиков — АВТОРИТЕТНО у сервера. */
/* ✅ v0.4.64: раскладка чекблоков — СВОЙ сид у каждого реалма
   (BrixPvP — арена с лутом в своих точках, не как в BrixLand) */
const OBJ_SEED = REALM === 'brixpvp' ? 77702 : 20261114;

/* ============================================================
   ✅ v0.5.0 БОТЫ «ПОЛИГОНА» (только реалм brixpvp): авторитетный
   сим команд СТАЛЬ (синие) и ПЛАМЯ (красные) в brixpvp-bots.js.
   10 бойцов (5+5), каждый ИГРОК — синий: при его входе один синий
   бот уходит (состав сторон 5 на 5), при выходе возвращается.
   Боты патрулируют, ищут БЛИЖАЙШЕГО врага с прямой видимостью,
   стреляют очередями; счёт килов по командам, победа до 30.
   Тик 10 Гц ниже (рядом с таймаутами) — 'bots' всем игрокам.
   ============================================================ */
const Bots = REALM === 'brixpvp' ? require('./brixpvp-bots.js') : null;
if (Bots) {
  Bots.init({
    broadcast: broadcast,
    players: players,
    countInGame: countInGame
  });
}
function makeObjRng(seed) {
  let a = (seed === undefined ? OBJ_SEED : seed) | 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const CHECKBLOCK_COUNT = 40;   // ✅ v0.3.8: 40 кандидатов — клиент отсеет
                               // воду/склоны (детерминированно), останется ~15-20

/* ✅ v0.3.7: ОДНА формула раскладки чекблоков — и у сервера, и в режиме
   вкладок (gameworld.js __buildLocalObjects). ВАЖНО: последовательность
   вызовов rnd() в обеих копиях должна совпадать СИМВОЛ В СИМВОЛ */
function buildCheckblockLayout(seed) {
  const rnd = makeObjRng(seed);
  const ITEMS = ['washer', 'fridge', 'tv'];
  const cb = [];
  for (let i = 0; i < CHECKBLOCK_COUNT; i++) {
    let x, z;
    do { x = (rnd() - 0.5) * 680; z = (rnd() - 0.5) * 680; }
    while (Math.sqrt(x * x + z * z) < 40);
    const rec = {
      id: 'c' + i,
      x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10,
      rot: Math.round(rnd() * 628) / 100,
      item: ITEMS[Math.floor(rnd() * 3)],
      seed: 1 + Math.floor(rnd() * 1000000),
      /* ✅ v0.4.44 ТИП ЯЩИКА ВЫБИРАЕТ СЕРВЕР (просьба игрока «не ты поставь,
         а сервер выбирает на каждом чекблоке какой ящик поставить — деревянный
         или военный»): раньше военный был только у 5% чекблоков и навсегда.
         Теперь 30% военных, и при каждом респавне лута тип ПЕРЕБРАСЫВАЕТСЯ */
      mil: rnd() < 0.3 ? 1 : 0,
      taken: false,
      barrels: []
    };
    const nb = rnd() < 0.5 ? 2 : 3, a0 = rnd() * Math.PI * 2;
    for (let j = 0; j < nb; j++) {
      const a = a0 + j * (0.7 + rnd() * 0.4);
      const d = 1.2 + rnd() * 0.8 + j * 0.15;
      rec.barrels.push({
        id: rec.id + 'b' + j,
        lx: Math.round(Math.cos(a) * d * 100) / 100,
        lz: Math.round(Math.sin(a) * d * 100) / 100,
        wy: Math.round(rnd() * 628) / 100,
        lying: j === 0 ? 1 : 0,
        hp: 6, brk: false   /* ✅ v0.4.44: бочка 6 хп — камень 6 ударов,
                               железо 4 (1.5 за удар), булава 1 (6 за удар) */
      });
    }
    cb.push(rec);
  }
  return cb;
}

/* ✅ v0.3.8: ЛУТ ЯЩИКА — рецепт из репозитория (scr/world/crates.js rollLoot):
   скрап всегда, метал/пружина/труба с шансом, корпус берданки/АК — редко.
   Лут ХРАНИТСЯ НА СЕРВЕРЕ: взял один предмет — у всех осталось остальное.
   ✅ v0.4.44 НОВЫЙ ЛУТ ВОЕННОГО ЯЩИКА (просьба игрока): КАЛАШ, ТОМПСОН,
   ДРОБОВИК, БУЛАВА, РЕВОЛЬВЕР-КАРАБИН, С4, ПОРОХ и ПАТРОНЫ — оружие
   попадает ЦЕЛИКОМ (rifleAk/thompson/shotgun/rev3x/mace — нестандартные,
   штучные предметы). Военный ящик стал НАСТОЯЩЕЙ ДРОП-СТАНЦИЕЙ */
function rollLoot(mil) {
  const r = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  const loot = { scrap: r(4, 8), metal: 0, spring: 0, pipe: 0, rifleBody: 0,
    berdanaBody: 0, revolver: 0, ammo: 0 };
  if (Math.random() < 0.6) loot.metal = r(4, 16);
  if (Math.random() < 0.5) loot.spring = r(1, 3);
  if (Math.random() < 0.5) loot.pipe = r(1, 3);
  // ✅ v0.4.5: ПАТРОНЫ (4–15) только в ВОЕННОМ ящике; РЕВОЛЬВЕР
  // встречается и в военном (шанс выше), и в деревянном
  if (Math.random() < 0.7) loot.ammo = r(4, 15);
  if (mil) {
    loot.rifleBody = 1;                        // корпус АК — в военном ящике всегда
    if (Math.random() < 0.35) loot.revolver = 1;
    if (Math.random() < 0.25) loot.berdanaBody = 1;
    /* ✅ v0.4.44: НОВЫЙ ЛУТ — орудия и взрывчатка. Порох почти всегда,
       патроны уже сверху; ровно ОДНО оружие (шанс 65%), С4 — редко */
    if (Math.random() < 0.8) loot.gunpowder = r(15, 60);
    if (Math.random() < 0.65) {
      const guns = ['rifleAk', 'thompson', 'shotgun', 'rev3x', 'mace'];
      loot[guns[Math.floor(Math.random() * guns.length)]] = 1;
    }
    if (Math.random() < 0.22) loot.c4 = 1;
    /* ✅ v0.4.46: ШПРИЦ (+46 хп) — медицина в военном ящике, 1–2 шт */
    if (Math.random() < 0.3) loot.syringe = 1 + (Math.random() < 0.35 ? 1 : 0);
  } else {
    if (Math.random() < 0.12) loot.revolver = 1;
    if (Math.random() < 0.35) loot.berdanaBody = 1;
    /* и в деревянном изредка бывает порох */
    if (Math.random() < 0.2) loot.gunpowder = r(5, 20);
  }
  return loot;
}

/* ✅ v0.3.8: ПЕРСИСТЕНТНОСТЬ — состояние мира (лут ящиков, HP бочек, дропы)
   живёт в world-objs.json и ПЕРЕЖИВАЕТ перезапуск сервера.
   ✅ v0.4.7 ПОСТРОЙКИ: фундаменты/стены/потолки живут В ПАМЯТИ СЕРВЕРА
   (worldObjs.builds) независимо от игроков: когда на сервере 0 игроков,
   дом никуда не девается; новый игрок получает весь дом в welcome
   (objs.bd); файл пишется через 800 мс после изменения, КАЖДЫЕ 20 с
   для надёжности и при остановке сервера (Ctrl+C) — ничего не теряется.
   «Перезагрузил игру — ресурсы те же» работает, потому что состояние
   вообще не у клиента: клиент при входе получает снимок сервера */
/* ✅ v0.4.64: файлы реалма — в своей папке data/<realm>/ */
const OBJS_FILE = path.join(DATA_DIR, 'world-objs.json');
/* ✅ v0.4.14: поколение мира дублируем в отдельный файл world-epoch.json.
   Если world-objs.json потерялся/удалили вручную — эпоха выживает, и
   сервер НЕ примет старые бэкапы браузеров («воскресшие 32 постройки
   из бэка» после ручной чистки). Пишется при каждом сохранении мира,
   читается при старте (в т.ч. для свежего мира) */
const EPOCH_FILE = path.join(DATA_DIR, 'world-epoch.json');

function readEpochSidecar() {
  try {
    let raw = fs.readFileSync(EPOCH_FILE, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    return (JSON.parse(raw).ep) | 0;
  } catch (e) { return 0; }
}

function writeEpochSidecar(ep) {
  try { fs.writeFileSync(EPOCH_FILE, JSON.stringify({ ep: ep | 0 })); }
  catch (e) { /* не критично: эпоха остаётся и в world-objs.json */ }
}

/* ============================================================
   ✅ v0.4.15 АДМИН-ПАНЕЛЬ РАЗРАБОТЧИКА (клавиша 9, только у владельца
   сервера). Администратор определяется ПО BRIX-ID АККАУНТА (aid из
   hello) — ник подделать легко, а ID живёт в localStorage игрока.
   Сервер проверяет КАЖДУЮ команду (клиентский флаг — только для UI).

   Команды (t:'admin', op:…):
     wipebuilds — удалить ВСЕ постройки + поднять поколение (bwipe всем);
     tp {x,z}   — телепорт СЕБЯ на координаты;
     tpto {tid} — телепорт СЕБЯ к игроку;
     bring {tid}— телепорт ИГРОКА к себе;
     ban {tid}  — забанить аккаунт (bans.json, персистентно) и кикнуть;
     respawn    — мгновенный респавн ВСЕХ ящиков и бочек с новым лутом;
     cleardrops — убрать все выпавшие предметы (дропы) с сервера.

   Бесконечное ХП — сервер НЕ применяет урон к админу (case 'phit').
   Открытие любых замков — server обходит проверку кода (case 'btog').
   ============================================================ */
const ADMIN_AIDS = new Set([
  'BRIX-GH6ZGS'          // ← ID разработчика (владелец сервера)
]);

/* ✅ v0.4.16: СВОЙ список админов — файл admins.json рядом с server.js.
   Не надо больше править server.js! Формат файла:
       ["BRIX-A1B2C3", "BRIX-XXXXXX"]
   Как узнать свой BRIX-ID (любой из трёх способов):
     1) нажать 9 в игре — подсказка на экране покажет ТВОЙ ID;
     2) консоль сервера: при входе каждого игрока печатается его ID;
     3) мини-меню (M) → список игроков → своя строка, там ID.
   Файл создаётся автоматически, если его нет. Изменения — после
   ПЕРЕЗАПУСКА сервера. Панель (клавиша 9) откроется только у тех,
   чей ID есть в этом списке (или встроен выше) */
const ADMINS_FILE = path.join(ROOT, 'admins.json');
if (!fs.existsSync(ADMINS_FILE)) {
  try { fs.writeFileSync(ADMINS_FILE, JSON.stringify([], null, 2)); }
  catch (e) { console.log('[admin] не создал admins.json: ' + e.message); }
}
try {
  const rawA = fs.readFileSync(ADMINS_FILE, 'utf8');
  const jA = JSON.parse(rawA.charCodeAt(0) === 0xFEFF ? rawA.slice(1) : rawA);
  if (Array.isArray(jA)) jA.forEach((id) => {
    const s = String(id || '').trim();
    if (s) ADMIN_AIDS.add(s.slice(0, 16));
  });
  console.log('[admin] админы по ID: ' + Array.from(ADMIN_AIDS).join(', '));
  console.log('[start] BRIX сервер v' + SRV_VER + ' · папка сервера: ' + ROOT);
  console.log('[start] admins.json правится ИМЕННО в этой папке, потом перезапуск сервера');
} catch (e) {
  console.log('[admin] admins.json не прочитан (' + e.message +
    ') — работает только встроенный ID');
}
function isAdminP(p) {
  return !!(p && p.aid && ADMIN_AIDS.has(p.aid));
}

/* БАН-ЛИСТ: bans.json рядом с server.js — переживает перезапуск.
   Формат: [{ key, n, aid, by, at }] — key = BRIX-ID или 'n:Ник'
   (для игроков без аккаунта). Пишется при каждом бане */
const BANS_FILE = path.join(ROOT, 'bans.json');
let bans = [];
try {
  const rawB = fs.readFileSync(BANS_FILE, 'utf8');
  const jB = JSON.parse(rawB.charCodeAt(0) === 0xFEFF ? rawB.slice(1) : rawB);
  if (Array.isArray(jB)) bans = jB.filter((b) => b && b.key);
} catch (e) { bans = []; }

function saveBans() {
  try { fs.writeFileSync(BANS_FILE, JSON.stringify(bans)); }
  catch (e) { console.log('[admin] не сохранил bans.json: ' + e.message); }
}

function isBanned(aid, name) {
  const nk = 'n:' + String(name || '');
  return bans.some((b) =>
    (aid && b.key === aid) || (name && b.key === nk));
}

let saveTimer = null;
let worldDirty = false;          // ✅ v0.4.7: есть несохранённые изменения

function writeWorldNow() {
  try {
    const data = {
      /* ✅ v0.4.31: v5 — хп построек в НОВОЙ шкале (фундамент 350,
         остальные 300). v4 читается и мигрирует (см. loadWorldObjs)
         ✅ v0.4.43: v6 — + С4 и трупы
         ✅ v0.4.44: v7 — + ДЕРЕВЬЯ И РУДЫ (синхронизация и сохранение
         запасов как у бочек: срубленное/раскопанное не возвращается
         после рестарта сервера и одинаково для новичков) */
      v: 7,
      dropSeq: worldObjs.dropSeq,
      cb: worldObjs.cb.map((c) => ({
        id: c.id, x: c.x, z: c.z, rot: c.rot, item: c.item, seed: c.seed, mil: c.mil,
        taken: c.taken, gone: c.gone, loot: c.loot,
        barrels: c.barrels.map((b) => ({ id: b.id, lx: b.lx, lz: b.lz, wy: b.wy,
          lying: b.lying, hp: b.hp, brk: b.brk }))
      })),
      drops: Array.from(worldObjs.drops.values()),
      // ✅ v0.4.6/0.4.7: ПОСТРОЙКИ (фундаменты/стены/потолки) — переживают
      //    перезапуск сервера, как и весь остальной мир
      builds: worldObjs.builds,
      /* ✅ v0.4.62: надгробия сломанных (последние 600) — бэкап клиента
         их больше не доберёт */
      btomb: (worldObjs.btomb || []).slice(-600),
      // ✅ v0.4.43: живые С4 и трупы-лутбоксы — тоже переживают перезапуск
      c4: worldObjs.c4.map((c) => ({ id: c.id, x: c.x, y: c.y, z: c.z,
        n: c.n || [0, 1, 0], by: c.by, at: c.at })),
      corpses: worldObjs.corpses.map((c) => ({ id: c.id, x: c.x, y: c.y, z: c.z,
        n: c.n, c: c.c, inv: c.inv, mags: c.mags || {}, at: c.at, lt: c.lt ? 1 : 0 })),
      corpseSeq: worldObjs.corpseSeq | 0,
      /* ✅ v0.4.44: запасы деревьев (w/g/fd) и руд (iron/sulfur/stone) —
         ПЕРЕЖИВАЮТ РЕСТАРТ СЕРВЕРА, как бочки и постройки */
      world: world ? {
        trees: world.trees.map((tr) => ({ w: tr.w, g: tr.g, fd: tr.fd })),
        ores: {
          iron: world.ores.iron.slice(),
          sulfur: world.ores.sulfur.slice(),
          stone: world.ores.stone.slice()
        }
      } : null,
      epoch: worldObjs.epoch | 0   // ✅ v0.4.13: поколение мира
    };
    fs.writeFileSync(OBJS_FILE, JSON.stringify(data));
    writeEpochSidecar(worldObjs.epoch | 0);   // ✅ v0.4.14: дубль поколения
    worldDirty = false;
  } catch (e) { console.log('[objs] не сохранил мир: ' + e.message); }
}

function markDirty() {
  worldDirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writeWorldNow();
  }, 800);
}

/* ✅ v0.4.7: страховые сохранения — каждые 20 с, если что-то менялось,
   и гарантированная запись при остановке сервера (Ctrl+C / kill).
   Постройки не теряются, даже если сервер убили сразу после bplace */
setInterval(() => { if (worldDirty) writeWorldNow(); }, 20000);
function saveOnExit() {
  try { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } writeWorldNow(); } catch (e) {}
}
process.on('SIGINT', () => { saveOnExit(); process.exit(0); });
process.on('SIGTERM', () => { saveOnExit(); process.exit(0); });
process.on('exit', () => { try { saveOnExit(); } catch (e) {} });

/* ============================================================
   ✅ v0.4.46 СОХРАНЕНИЕ ИГРОКА («вышел — зашёл — всё на месте»):
   позиция (ноги) + поворот + ХП + ВЕСЬ инвентарь + выбранный слот
   хотбара. Ключ — BRIX-ID (aid, как у замков/админов). Клиент шлёт
   'psave' раз в 3 с и при выходе со страницы; сервер хранит в
   players.json (debounce 1.5 с + запись при остановке). welcome
   возвращает сохранение (psave) — клиент ставит игрока на место и
   выдаёт вещи. УМЕР → сохранение СТИРАЕТСЯ (pdeath): весь инвентарь
   уходит в труп-лутбокс, задвоение вещей невозможно
   ============================================================ */
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');   /* ✅ v0.4.64: свой на реалм */
const playerSaves = new Map();     // aid -> {x,y,z,yaw,hp,hot,inv:[{id,n,mag}],at}
let playersDirty = false;
let playersTimer = null;
function loadPlayerSaves() {
  try {
    if (fs.existsSync(PLAYERS_FILE)) {
      const j = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
      if (j && typeof j === 'object') {
        Object.keys(j).forEach((k) => playerSaves.set(String(k).slice(0, 16), j[k]));
      }
      console.log('[players] сохранения игроков: ' + playerSaves.size);
    }
  } catch (e) { console.log('[players] не прочитал players.json: ' + e.message); }
}
function writePlayersNow() {
  try {
    const o = {};
    playerSaves.forEach((v, k) => { o[k] = v; });
    fs.writeFileSync(PLAYERS_FILE, JSON.stringify(o));
    playersDirty = false;
  } catch (e) { console.log('[players] не сохранил players.json: ' + e.message); }
}
function markPlayersDirty() {
  playersDirty = true;
  if (playersTimer) return;
  playersTimer = setTimeout(() => { playersTimer = null; writePlayersNow(); }, 1500);
}
setInterval(() => { if (playersDirty) writePlayersNow(); }, 20000);
function savePlayersOnExit() {
  try { if (playersTimer) { clearTimeout(playersTimer); playersTimer = null; } writePlayersNow(); } catch (e) {}
}

/* ============================================================
   ✅ v0.4.62 РЕЕСТР ВСЕХ ИГРОКОВ (вкладка «ВСЕ ИГРОКИ» в друзьях):
   aid -> { name, ls — был в сети (мс), on — в сети сейчас 0/1 }.
   Пишется в social.json (переживает рестарт). Наполняется, когда
   игрок заходит/выходит/сохраняется. Клиент запрашивает op 'plist'.
   ============================================================ */
const SOCIAL_FILE = path.join(DATA_DIR, 'social.json');   /* ✅ v0.4.64: свой на реалм */
const socialReg = new Map();      // aid -> { name, ls, on }
let socialDirty = false;
let socialTimer = null;
function loadSocialReg() {
  try {
    if (fs.existsSync(SOCIAL_FILE)) {
      const j = JSON.parse(fs.readFileSync(SOCIAL_FILE, 'utf8'));
      if (j && typeof j === 'object') {
        Object.keys(j).forEach((k) => socialReg.set(String(k).slice(0, 16), j[k]));
      }
      socialReg.forEach((v) => { v.on = 0; });   // после рестарта все офлайн
      console.log('[social] реестр игроков: ' + socialReg.size);
    }
  } catch (e) { console.log('[social] не прочитал social.json: ' + e.message); }
}
function writeSocialNow() {
  try {
    const o = {};
    socialReg.forEach((v, k) => { o[k] = v; });
    fs.writeFileSync(SOCIAL_FILE, JSON.stringify(o));
    socialDirty = false;
  } catch (e) { console.log('[social] не сохранил social.json: ' + e.message); }
}
function markSocialDirty() {
  socialDirty = true;
  if (socialTimer) return;
  socialTimer = setTimeout(() => { socialTimer = null; writeSocialNow(); }, 1500);
}
/** игрок зашёл/вышел/сохраняется — обновляем запись реестра */
function touchSocial(p, online) {
  if (!p.aid) return;
  const rec = socialReg.get(p.aid) || { name: p.name, ls: 0, on: 0 };
  rec.name = String(p.name || rec.name || 'Игрок').slice(0, 16);
  rec.on = online ? 1 : 0;
  rec.ls = Date.now();
  socialReg.set(p.aid, rec);
  markSocialDirty();
}
/* ✅ v0.4.62: social.json пишется при остановке вместе с players.json
   (saveOnExit ниже вызывает writeSocialNow тоже) */
function savePlayersOnExit() {
  try { if (playersTimer) { clearTimeout(playersTimer); playersTimer = null; } writePlayersNow(); } catch (e) {}
  try { writeSocialNow(); } catch (e) {}
}
process.on('SIGINT', savePlayersOnExit);
process.on('SIGTERM', savePlayersOnExit);
process.on('exit', () => { try { savePlayersOnExit(); } catch (e) {} });

function freshWorldObjs() {
  /* ✅ v0.4.65 ПВП-АРЕНА: чекблоков/бочек/лута НЕТ — там локация
     «ПОЛИГОН» с ботами, F на арене не работает. BrixLand без изменений */
  if (REALM === 'brixpvp') {
    return { cb: [], drops: new Map(), dropSeq: 0, builds: [],
      c4: [], corpses: [], corpseSeq: 0, btomb: [],
      epoch: readEpochSidecar() };
  }
  const cb = buildCheckblockLayout(OBJ_SEED);
  cb.forEach((c) => { c.gone = false; c.loot = rollLoot(c.mil); });
  /* ✅ v0.4.13: epoch — поколение мира. CLEAR-BUILDS.bat повышает его
     в world-objs.json; если клиент приносит бэкап из СТАРОГО поколения
     (до очистки) — сервер НЕ принимает его назад, а клиент сам чистит
     свой localStorage. ✅ v0.4.14: свежий мир помнит поколение через
     world-epoch.json, поэтому потеря файла больше НЕ сбрасывает эпоху */
  return { cb, drops: new Map(), dropSeq: 0, builds: [],
    /* ✅ v0.4.43: живые С4 и трупы — в свежем мире пусто */
    c4: [], corpses: [], corpseSeq: 0,
    /* ✅ v0.4.62: надгробий сломанных в свежем мире нет */
    btomb: [],
    /* ✅ v0.4.14: свежий мир ВСЁ РАВНО помнит поколение (сайдкар) —
       старые бэкапы браузеров не примутся даже после потери файла */
    epoch: readEpochSidecar() };
}

function loadWorldObjs() {
  try {
    if (!fs.existsSync(OBJS_FILE)) return null;
    const j = JSON.parse(fs.readFileSync(OBJS_FILE, 'utf8'));
    // ✅ v0.4.6: v3 (старый файл без построек) читаем и апгрейдим
    // ✅ v0.4.31: v5 — новая шкала хп; v4 читаем и МИГРИРУЕМ хп
    // ✅ v0.4.43: v6 — + С4 и трупы (v3/v4/v5 читаются, недостающее = [])
    // ✅ v0.4.44: v7 — + деревья и руды (v3..v7 читаются)
    if (!j || (j.v !== 3 && j.v !== 4 && j.v !== 5 && j.v !== 6 && j.v !== 7) || !Array.isArray(j.cb)) return null;
    const drops = new Map();
    (j.drops || []).forEach((d) => { if (d && d.id) drops.set(d.id, d); });
    const builds = Array.isArray(j.builds) ? j.builds.filter((b) =>
      b && (
        /* сеточные постройки (фундамент/стена/потолок/окно/проём/дверь) */
        ((b.ty === 'f' || b.ty === 'w' || b.ty === 'c' ||
          b.ty === 'wi' || b.ty === 'dw' || b.ty === 'dr') &&
         Number.isFinite(b.gx) && Number.isFinite(b.gz) && Number.isFinite(b.top)) ||
        /* ✅ v0.4.44 ЛЕСТНИЦА — сеточная постройка (клетка фундамента) */
        (b.ty === 'ld' && Number.isFinite(b.gx) && Number.isFinite(b.gz) &&
         Number.isFinite(b.top)) ||
        /* ✅ v0.4.22 СУНДУК — свободная постройка (не на сетке),
           содержимое (cont) переживает перезапуск сервера */
        (b.ty === 'ch' && Number.isFinite(b.x) && Number.isFinite(b.z) &&
         Number.isFinite(b.y)) ||
        /* ✅ v0.4.44 ПЕЧКА — свободная постройка, cont/on тоже живут на диске */
        (b.ty === 'fu' && Number.isFinite(b.x) && Number.isFinite(b.z) &&
         Number.isFinite(b.y))
      )) : [];
    /* ✅ v0.4.31 МИГРАЦИЯ ХП: в файлах v4 хп хранилось в старой шкале
       (фундамент/стены/потолки — максимум 200, дверь — 150). Пересчитываем
       под новую (фундамент 350, остальные 300): полный запас становится
       новым максимумом, повреждённое — пропорционально (133/200 → 199.5/300).
       Миграция ОДНОКРАТНАЯ: сразу после неё файл сохраняется уже как v5 */
    /* ✅ v0.4.44: миграция хп — печка в той же шкале (300), лестница — 250 */
    if ((j.v | 0) < 5) {
      builds.forEach((b) => {
        if (b.hp === undefined) return;
        const oldMax = (b.ty === 'dr') ? 150 : (b.ty === 'ch' ? 25 : 200);
        const newMax = maxBuildHp(b.ty);
        b.hp = (b.hp >= oldMax - 0.001)
          ? newMax
          : Math.round(Math.min(newMax, b.hp / oldMax * newMax) * 100) / 100;
      });
      if (builds.length) {
        console.log('[objs] миграция хп построек: шкала 200/150 → 350/300 (v4 → v5)');
      }
    }
    const c4 = Array.isArray(j.c4) ? j.c4.filter((c) => c && c.id &&
      Number.isFinite(c.x) && Number.isFinite(c.z)).slice(0, 40) : [];
    const corpses = Array.isArray(j.corpses) ? j.corpses.filter((c) => c && c.id &&
      Number.isFinite(c.x) && Number.isFinite(c.z)).slice(0, CORPSE_MAX) : [];
    /* ✅ v0.4.44: запасы деревьев/руд из сохранения (v7). Формат тот же,
       что у welcome-world: trees [{w, g, fd}], ores {iron, sulfur, stone} */
    let world = null;
    if (j.world && Array.isArray(j.world.trees) && j.world.ores) {
      world = {
        trees: j.world.trees.map((tr) =>
          ({ w: Math.max(0, Number(tr.w) || 0), g: tr.g ? 1 : 0,
             fd: tr.fd === -1 ? -1 : 1 })),
        ores: {
          iron: (j.world.ores.iron || []).map((v) => Math.max(0, v | 0)),
          sulfur: (j.world.ores.sulfur || []).map((v) => Math.max(0, v | 0)),
          stone: (j.world.ores.stone || []).map((v) => Math.max(0, v | 0))
        }
      };
    }
    return { cb: j.cb, drops, dropSeq: j.dropSeq || 0, builds, c4, corpses, world,
      /* ✅ v0.4.62: надгробия сломанных — читаем, последние 600 */
      btomb: Array.isArray(j.btomb) ? j.btomb.map(String).slice(-600) : [],
      corpseSeq: corpses.reduce((m, c) => Math.max(m, Number(String(c.id).slice(1)) || 0), 0),
      /* ✅ v0.4.14: берём МАКСИМУМ из файла и сайдкара — откат файла
         в прошлое поколение невозможен */
      epoch: Math.max(j.epoch | 0, readEpochSidecar()) };   // ✅ v0.4.13: поколение мира
  } catch (e) { return null; }
}

const _loaded = loadWorldObjs();
loadPlayerSaves();   // ✅ v0.4.46: сохранения игроков (позиция/инвентарь/слот)
loadSocialReg();     // ✅ v0.4.62: реестр всех игроков (social.json)
const worldObjs = _loaded || freshWorldObjs();
if (_loaded) console.log('[objs] мир загружен из world-objs.json (лут/бочки как были)');

/* ============================================================
   ✅ v0.4.63 СТАРЫЕ ИГРОКИ ВО «ВСЕ ИГРОКИ» (просьба игрока:
   «покажет игроков, которые играли ещё до этой функции, хоть с
   1 релиза»). Имена игроков всё это время писались в МИР:
   builds[].by — кто поставил постройку, corpses[].n — кто погиб
   (труп-лутбокс), у обоих есть метка времени at. Собираем их в
   реестр (social.json) с id 'srv-<имя>' — профиль открывается,
   приглашение уходит по нику. Новые имена добираются раз в 60 с.
   ============================================================ */
function harvestHistoricalPlayers() {
  const found = {};
  const bump = (nm, at) => {
    const name = String(nm || '').trim().slice(0, 16);
    if (!name || name === 'Игрок' || /^Игрок-/.test(name)) return;
    const t = Number(at) || 0;
    if (!found[name] || found[name] < t) found[name] = t;
  };
  (worldObjs.builds || []).forEach((b) => bump(b.by, b.at));
  (worldObjs.corpses || []).forEach((c) => bump(c.n, c.at));
  const known = new Set();
  socialReg.forEach((v) => known.add(String(v.name || '').toLowerCase()));
  players.forEach((t2) => known.add(String(t2.name || '').toLowerCase()));
  let added = 0;
  Object.keys(found).forEach((nm) => {
    if (known.has(nm.toLowerCase())) return;
    socialReg.set('srv-' + nm, { name: nm, ls: found[nm] || Date.now(), on: 0 });
    added++;
  });
  if (added) {
    markSocialDirty();
    console.log('[social] из мира добавлено игроков, игравших раньше: ' + added +
      ' (всего в реестре: ' + socialReg.size + ')');
  }
}
harvestHistoricalPlayers();
setInterval(harvestHistoricalPlayers, 60000);
/* ✅ v0.4.44: запасы деревьев/руд ПЕРЕЖИВАЮТ РЕСТАРТ — если в файле они
   есть, initWorld() от первого клиента НЕ перезапишет их (мир детерминированный,
   позиции одинаковы, «воскресших» руд у новичков больше не будет) */
if (worldObjs.world) {
  world = worldObjs.world;
  console.log('[objs] запасы ресурсов восстановлены: деревьев ' + world.trees.length +
    ', жил iron/sulfur/stone: ' + world.ores.iron.length + '/' +
    world.ores.sulfur.length + '/' + world.ores.stone.length);
}
worldObjs.c4 = worldObjs.c4 || [];
worldObjs.corpses = worldObjs.corpses || [];
worldObjs.corpseSeq = worldObjs.corpseSeq | 0;
/* ✅ v0.4.44: бочки со старым файлом (hp 2) переводим на новую шкалу 6 хп —
   «камень 6 ударов / железо 4 / булава 1». Сломанные (brk) не трогаем */
worldObjs.cb.forEach((c) => (c.barrels || []).forEach((b) => {
  if (!b.brk && (b.hp === undefined || b.hp < 6)) b.hp = 6;
}));
/* ✅ v0.4.43: С4, загруженные с диска — таймер взрыва ПРОДОЛЖАЕТСЯ:
   остаток фьюза считается от времени постановки (at) */
worldObjs.c4.forEach(scheduleC4Boom);
if (worldObjs.c4.length) console.log('[c4] с диска загружено С4: ' + worldObjs.c4.length +
  ' — таймеры взрыва продолжены');

/* ============================================================
   ✅ v0.4.43: С4 — АВТОРИТЕТ СЕРВЕРА. Каждая поставленная С4 живёт в
   worldObjs.c4 {id, x, y, z, n, by, at}: таймер ВЗРЫВА держит СЕРВЕР
   (setTimeout на остаток фьюза), поэтому:
   • бросавший вышел из игры — бомба ВСЁ РАВНО взорвётся;
   • новый игрок, зашедший после постановки, получает блок в снапшоте
     (objsSnapshot.c4 с ОСТАТКОМ фьюза в мс) — видит его и слышит тыки
     с правильной фазы;
   • перезапуск сервера не теряет бомбы (world-objs.json v6).
   Клиентский 'c4boom' остаётся как failsafe и для СТАРЫХ клиентов:
   если от клиента пришёл взрыв, а у сервера есть этот блок (≤2.5 м) —
   сервер гасит свой таймер и взрывает ЕДИНОЖДЫ. Урон (постройки/игроки)
   всегда считает c4BoomDamage — ОДИН раз на взрыв.
   ============================================================ */
let c4Seq = (worldObjs.c4 || []).reduce((m, c) =>
  Math.max(m, Number(String(c.id).slice(1)) || 0), 0);

function scheduleC4Boom(c) {
  if (c.to) { clearTimeout(c.to); c.to = null; }
  const rest = Math.max(400, C4_FUSE_MS - (Date.now() - (c.at || Date.now())));
  c.to = setTimeout(() => c4SrvExplode(c), rest);
}

function c4SrvExplode(c) {
  const i = worldObjs.c4.indexOf(c);
  if (i >= 0) worldObjs.c4.splice(i, 1);
  c.to = null;
  markDirty();
  /* взрыв уходит ВСЕМ (включая бросавшего — он больше НЕ взрывает свой
     блок сам, а ждёт сервер): id позволяет клиенту найти именно этот блок */
  broadcast({ t: 'c4boom', id: c.id, x: c.x, y: c.y, z: c.z }, null);
  c4BoomDamage(c.x, c.y, c.z, c.by);
}

/** урон взрыва С4: постройки в 7 м −400 хп, игроки в 6.5 м −250.
    Вызывается ОДИН раз на взрыв (сервер — единственный источник правды) */
function c4BoomDamage(bx, by, bz, byId) {
  const hitList = [];
  for (const b of worldObjs.builds) {
    const wx = (b.ty === 'ch') ? b.x : b.gx * CELL;
    const wz = (b.ty === 'ch') ? b.z : b.gz * CELL;
    const wy = (b.ty === 'ch') ? (b.y || 0) : (b.top || 0);
    const dh = dist2(wx, wz, bx, bz);
    if (dh > 49) continue;                                  // дальше 7 м
    const dy = Math.abs(wy - by);
    if (dy > 4.5) continue;
    hitList.push(b);
  }
  const destroyed = [];
  for (const b of hitList) {
    b.hp = (b.hp === undefined ? maxBuildHp(b.ty) : b.hp) - 400;
    if (b.hp <= 0) {
      worldObjs.builds.splice(worldObjs.builds.indexOf(b), 1);
      removeBuildIndexes(b);
      tombstone(b.id);   // ✅ v0.4.62: сломанное С4 не воскреснет из бэкапа
      broadcast({ t: 'brem', id: b.id, by: byId }, null);
      /* ✅ v0.4.43: обломки — разрушенная деталь распадается на 5×5 кусков
         у ВСЕХ игроков (сд определяет одинаковый разлёт у всех) */
      destroyed.push({
        x: (b.ty === 'ch') ? b.x : b.gx * CELL,
        z: (b.ty === 'ch') ? b.z : b.gz * CELL,
        y: (b.ty === 'ch') ? (b.y || 0) : (b.top || 0),
        ty: b.ty, sd: Math.floor(Math.random() * 1000000)
      });
      console.log('[c4] взрыв снёс постройку ' + b.id + ' (' + b.ty + ')');
    } else {
      broadcast({ t: 'bhp', id: b.id, hp: b.hp, max: maxBuildHp(b.ty) }, null);
    }
  }
  if (hitList.length) {
    writeWorldNow();   // снос — сразу на диск
    console.log('[c4] взрыв (' + bx.toFixed(1) + ', ' + bz.toFixed(1) +
      '): построек задето ' + hitList.length + ', снесено ' + destroyed.length);
  }
  if (destroyed.length) {
    broadcast({ t: 'debris', list: destroyed.slice(0, 8) }, null);   // максимум 8 деталей на взрыв
  }
  /* ИГРОКИ в радиусе 6.5 м — 250 урона (насмерть). ХП — авторитет сервера;
     god, как всегда, неуязвим.
     ✅ v0.5.2 ПВП-АРЕНА: СВОИХ НЕ УБИВАЕМ — в реалме brixpvp взрыв С4
     вообще не трогает игроков (все одна команда СТАЛЬ; раньше С4 могла
     убить игрока своей команды) */
  if (Bots) return;
  players.forEach((t) => {
    if (t.dead || t.god || !t.state) return;
    const d2c4 = dist2(t.state.x, t.state.z, bx, bz);
    if (d2c4 > 6.5 * 6.5) return;
    const dy2 = Math.abs((t.state.y || 0) - by);
    if (dy2 > 5) return;
    t.hp = Math.max(0, (t.hp === undefined ? 100 : t.hp) - 250);
    broadcast({ t: 'phit', tid: t.id, hp: t.hp, by: byId,
      kind: 'shot', w: 'c4', hs: 0,
      dist: Math.round(Math.sqrt(d2c4)) }, null);
    if (t.hp <= 0) {
      t.dead = true;
      broadcast({ t: 'pdeath', tid: t.id, by: byId, w: 'c4', hs: 0,
        dist: Math.round(Math.sqrt(d2c4)) }, null);
      console.log('[c4] ' + t.name + ' убит взрывом С4');
    }
  });
}

/* ✅ v0.4.43: ТРУПЫ-ЛУТБОКСЫ. worldObjs.corpses {id 'rNN', x, y, z, n, c,
   inv {item: count}, at, lt}. Создаёт СЕРВЕР по сообщению 'corpse' от
   умирающего клиента (у сервера нет копии инвентаря — инвентарь живёт у
   клиента). Лут по 'corpseOpen'/'corpseTake' — как ящики чекблока.
   Опустел — убран; ✅ v0.4.50: не залутан 10 минут — убран, залутанный —
   20 минут страховки; переживает перезапуск сервера */
function sanitizeInv(inv) {
  const out = {};
  if (!inv || typeof inv !== 'object') return out;
  let n = 0;
  for (const k of Object.keys(inv)) {
    if (n >= 24) break;
    const v = Math.floor(Number(inv[k]) || 0);
    if (!/^[a-zA-Z0-9_]{1,16}$/.test(k) || v <= 0) continue;
    out[k] = Math.min(999999, v);
    n++;
  }
  return out;
}

/* ✅ v0.4.54 СИНХРОНИЗАЦИЯ ПАТРОНОВ: обоймы огнестрела в трупе.
   mags {id: [обойма, обойма, ...]} — по одной обойме на каждый ствол
   этого вида. Чистим: только id из инвентаря трупа, целые, не больше
   8 обойм на вид. Убит игрок с 20 патронами в калаше — из трупа
   лутается КАЛАШ С 20, а не с нулём (просьба игрока) */
function sanitizeMags(inv, mags) {
  const out = {};
  if (!mags || typeof mags !== 'object') return out;
  for (const k of Object.keys(inv)) {
    if (!((inv[k] | 0) > 0)) continue;
    let arr = mags[k];
    if (!Array.isArray(arr)) {
      // старый клиент мог прислать число — трактуем как одну обойму
      arr = Number.isFinite(Number(arr)) ? [Number(arr)] : [];
    }
    const vals = arr
      .map((v) => Math.floor(Number(v) || 0))
      .filter((v) => v > 0 && v < 100000)
      .slice(0, 8);
    if (vals.length) out[k] = vals;
  }
  return out;
}

/* трупы протухают: раз в минуту чистим. ✅ v0.4.50: НЕЗАЛУТАННЫЙ —
   10 минут (было 20 для всех), ЗАЛУТАННЫЙ (lt=1) — 20 минут страховки;
   опустевший убирается сразу в 'corpseTake' */
setInterval(() => {
  let removed = 0;
  for (let i = worldObjs.corpses.length - 1; i >= 0; i--) {
    const c = worldObjs.corpses[i];
    const ttl = c.lt ? CORPSE_TTL_LOOTED_MS : CORPSE_TTL_MS;
    if (Date.now() - (c.at || 0) <= ttl) continue;
    worldObjs.corpses.splice(i, 1);
    removed++;
    broadcast({ t: 'corpseGone', id: c.id }, null);
  }
  if (removed) { markDirty(); console.log('[corpse] TTL: убрано трупов ' + removed); }
}, 60000);

/* ============================================================
   ✅ v0.4.44 ТИК ПЕЧЕК (раз в секунду, пока никто не смотрит —
   сервер плавит сам): каждая ВКЛЮЧЁННАЯ печка расходует дерево
   (1 шт за 8 с), плавит СЕРУ (1 шт за 4 с → sulfurM) и ЖЕЛЕЗО
   (1 шт за 6 с → metal). Изменилось — рассылаем 'fust' всем и
   пишем на диск (debounce). Кончилось дерево — печка гаснет сама
   ============================================================ */
const FUEL_BURN_SEC = 8;      // секунд горения одного дерева
const SMELT_SEC = { sulfur: 4, iron: 6 };   // секунд на 1 предмет
const SMELT_OUT = { sulfur: 'sulfurM', iron: 'metal' };
setInterval(() => {
  const nowS = Date.now();
  worldObjs.builds.forEach((fu) => {
    if (fu.ty !== 'fu' || !fu.on) return;
    if (!fu.cont) fu.cont = {};
    if (fu.lastTick === undefined) fu.lastTick = nowS;
    /* догоняем пропущенное время, но не больше 10 с за тик (лаг/сон сервера) */
    let dtS = Math.min(10, Math.max(0, (nowS - fu.lastTick) / 1000));
    fu.lastTick = nowS;
    let changed = false;
    let guard = 0;
    while (dtS > 0.0001 && guard++ < 100) {
      const step = Math.min(dtS, 1);
      dtS -= step;
      if ((fu.cont.wood || 0) <= 0) { fu.on = 0; changed = true; break; }  // топливо кончилось
      fu.fuelAcc = (fu.fuelAcc || 0) + step;
      if (fu.fuelAcc >= FUEL_BURN_SEC) {
        fu.fuelAcc -= FUEL_BURN_SEC;
        fu.cont.wood = (fu.cont.wood || 0) - 1;
        if (fu.cont.wood <= 0) { delete fu.cont.wood; }
        changed = true;
      }
      /* плавка идёт, пока есть топливо: сера и железо ПАРАЛЛЕЛЬНО */
      ['sulfur', 'iron'].forEach((ore) => {
        if ((fu.cont[ore] || 0) <= 0) return;
        fu.progAcc = fu.progAcc || {};
        fu.progAcc[ore] = (fu.progAcc[ore] || 0) + step;
        if (fu.progAcc[ore] >= SMELT_SEC[ore]) {
          fu.progAcc[ore] -= SMELT_SEC[ore];
          fu.cont[ore] = (fu.cont[ore] || 0) - 1;
          if (fu.cont[ore] <= 0) delete fu.cont[ore];
          const outItem = SMELT_OUT[ore];
          fu.cont[outItem] = (fu.cont[outItem] || 0) + 1;
          changed = true;
        }
      });
    }
    if (changed) {
      broadcast({ t: 'fust', id: fu.id, cont: fu.cont, on: fu.on }, null);
      markDirty();
    }
  });
}, 1000);

/* после перезапуска сервера продолжаются таймеры респавна
   для всего, что было сломано/опустошено до него */
function scheduleBarrelRespawn(b, ms) {
  setTimeout(() => {
    if (!b.brk) return;
    b.brk = false;
    b.hp = 6;   /* ✅ v0.4.44: полные 6 хп (см. таблицу ударов в case 'bhit') */
    broadcast({ t: 'brespawn', id: b.id, hp: 6 }, null);
    markDirty();
    console.log('[objs] бочка ' + b.id + ' заспавнилась заново (таймер сервера)');
  }, ms);
}
function scheduleCrateRespawn(c, ms) {
  setTimeout(() => {
    if (!c.gone) return;
    c.gone = false;
    c.taken = false;
    /* ✅ v0.4.44: тип ящика ПЕРЕБРАСЫВАЕТСЯ при каждом респавне — сервер сам
       решает, деревянный или военный встанет на этот чекблок теперь */
    c.mil = Math.random() < 0.3 ? 1 : 0;
    c.loot = rollLoot(c.mil);
    broadcast({ t: 'cbrespawn', id: c.id, loot: c.loot, mil: c.mil }, null);
    markDirty();
    console.log('[objs] ящик чекблока ' + c.id + ' заспавнился (' +
      (c.mil ? 'ВОЕННЫЙ' : 'деревянный') + ') с новым лутом');
  }, ms);
}
worldObjs.cb.forEach((c) => {
  if (c.gone) scheduleCrateRespawn(c, CRATE_RESPAWN_MS[c.mil ? 'military' : 'wooden']);
  c.barrels.forEach((b) => { if (b.brk) scheduleBarrelRespawn(b, BARREL_RESPAWN_MS); });
});

/* плоский индекс бочек: id -> {cb, bar} — быстрый поиск при ударе */
const barrelIndex = new Map();
worldObjs.cb.forEach((c) => c.barrels.forEach((b) => barrelIndex.set(b.id, { cb: c, bar: b })));

/* ============================================================
   ✅ v0.4.44: ЭТАЖНОСТЬ. lv — уровень детали: 0 (земля/1 этаж,
   по умолчанию, старые записи без lv) или 1 (ВТОРОЙ ЭТАЖ).
   • стена 2 этажа (lv1) стоит на КРАЕ ПОТОЛКА 1 этажа (его верх —
     это пол 2 этажа); её база = потолок(верх) + толщина плиты
   • потолок 2 этажа (lv1) требует клетку с потолком lv0 И стеной lv1
   • ЛЕСТНИЦА (ty 'ld', 250 хп) ставится в клетку фундамента, где
     НЕТ потолка (проём на 2 этаж) — по ней ЗАЛЕЗАЮТ вверх (W)
   • ПЕЧКА (ty 'fu') — свободная постройка как сундук (fuplace),
     состояние (вкл/выкл, топливо/вход/выход) живёт на сервере
   Ключи индексов с уровнем: lv0 — 'gx,gz,e' (как раньше, старые
   миры совместимы), lv1 — 'gx,gz,e,1'. Клетка: {f, c (потолок lv0),
   c1 (потолок 2 этажа), ld (лестница)}
   ============================================================ */
const CELL = 3;               // размер клетки сетки, м
const WALL_H = 3;             // высота стены, м
const CEIL_T = 0.24;          // толщина плиты потолка (как в building.js)
function canonicalEdge(gx, gz, e) {
  if (e === 2) return { gx: gx, gz: gz + 1, e: 0 };   // южный край клетки → северный край клетки (gz+1)
  if (e === 1) return { gx: gx + 1, gz: gz, e: 3 };   // восточный край клетки → западный край клетки (gx+1)
  return { gx: gx, gz: gz, e: (e === 3 ? 3 : 0) };
}
/* ✅ v0.4.44: ключ края с уровнем (lv0 — старый формат, совместимость) */
function edgeKey(gx, gz, e, lv) {
  return (lv === 1) ? (gx + ',' + gz + ',' + e + ',1')
                    : (gx + ',' + gz + ',' + e);
}
/* индексы построек: клетка -> записи (фундамент/потолки/лестница), край -> стена */
const buildCell = new Map();   // 'gx,gz' -> {f, c, c1, ld}
const buildEdge = new Map();   // edgeKey(gx,gz,e,lv) -> rec краевой детали
worldObjs.builds.forEach((b) => {
  /* ✅ v0.4.28: у старых построек (мир до обновления) hp нет — присваиваем
     полный запас по типу, чтобы ломание работало сразу после апдейта.
     ✅ v0.4.31: и кламп — хп не может быть выше нового максимума */
  if (b.hp === undefined) b.hp = maxBuildHp(b.ty);
  else if (b.hp > maxBuildHp(b.ty)) b.hp = maxBuildHp(b.ty);
  /* ✅ v0.4.22: сундук; ✅ v0.4.44: печка — свободные постройки,
     в сеточные индексы не входят */
  if (b.ty === 'ch' || b.ty === 'fu') return;
  if (b.ty === 'w' || b.ty === 'wi' || b.ty === 'dw' || b.ty === 'dr') {
    const ce = canonicalEdge(b.gx, b.gz, b.e);
    b.gx = ce.gx; b.gz = ce.gz; b.e = ce.e;
    if (b.lv !== 1) b.lv = 0;
    buildEdge.set(edgeKey(b.gx, b.gz, b.e, b.lv), b);
  } else {
    const key = b.gx + ',' + b.gz;
    if (!buildCell.has(key)) buildCell.set(key, {});
    const cell = buildCell.get(key);
    if (b.ty === 'f') cell.f = b;
    else if (b.ty === 'c') { if (b.lv === 1) { b.lv = 0; } cell.c = b; }  // старый потолок — lv0
    else if (b.ty === 'ld') cell.ld = b;
  }
});
let buildSeq = worldObjs.builds.reduce((m, b) => Math.max(m, Number(String(b.id).slice(1)) || 0), 0);

/* ✅ v0.4.31 СНОС ЧИСТИТ ИНДЕКСЫ: раньше сломанная постройка уходила только
   из worldObjs.builds, а buildCell/buildEdge продолжали её «помнить» до
   перезапуска сервера: на сломанный фундамент можно было поставить стену,
   сломанный потолок занимал клетку. Теперь клетка/край освобождаются СРАЗУ */
/* ✅ v0.4.62 НАДГРОБИЯ СЛОМАННЫХ ПОСТРОЕК: id всего сломанного хранится
   в world-objs.json (btomb, последние 600). badopt (добор бэкапа клиента)
   надгробия ИГНОРИРУЕТ — сломанное игроком не воскресает после
   перезапуска сервера и перезахода игроков, при этом «спасение» дома,
   которого сервер не знает (потеря файла), работает как раньше */
function tombstone(id) {
  const s = String(id || '');
  if (!s) return;
  if (!Array.isArray(worldObjs.btomb)) worldObjs.btomb = [];
  if (worldObjs.btomb.indexOf(s) === -1) worldObjs.btomb.push(s);
  if (worldObjs.btomb.length > 600) worldObjs.btomb = worldObjs.btomb.slice(-600);
}
function removeBuildIndexes(b) {
  if (!b || b.ty === 'ch' || b.ty === 'fu') return;   /* ✅ v0.4.44: печка — свободная */
  if (b.ty === 'w' || b.ty === 'wi' || b.ty === 'dw' || b.ty === 'dr') {
    const ce = canonicalEdge(b.gx, b.gz, b.e);
    const k = edgeKey(ce.gx, ce.gz, ce.e, b.lv === 1 ? 1 : 0);
    if (buildEdge.get(k) === b) buildEdge.delete(k);
  } else {
    const cell = buildCell.get(b.gx + ',' + b.gz);
    if (cell) {
      if (b.ty === 'f' && cell.f === b) cell.f = null;
      if (b.ty === 'c' && (b.lv === 1 ? cell.c1 : cell.c) === b) {
        if (b.lv === 1) cell.c1 = null; else cell.c = null;
      }
      if (b.ty === 'ld' && cell.ld === b) cell.ld = null;   /* ✅ v0.4.44: лестница */
    }
  }
}

function hasWallOnCell(gx, gz) {
  return !!(buildEdge.get(gx + ',' + gz + ',0') || buildEdge.get(gx + ',' + gz + ',3') ||
            buildEdge.get(gx + ',' + (gz + 1) + ',0') || buildEdge.get((gx + 1) + ',' + gz + ',3'));
}

  /* ✅ v0.4.44: есть ли на клетке СТЕНА ВТОРОГО ЭТАЖА (lv1) — потолок 2 этажа
     опирается на стены 2 этажа или на соседний потолок 2 этажа */
function hasWallLv1(gx, gz) {
  return !!(buildEdge.get(edgeKey(gx, gz, 0, 1)) || buildEdge.get(edgeKey(gx, gz, 3, 1)) ||
            buildEdge.get(edgeKey(gx, gz + 1, 0, 1)) || buildEdge.get(edgeKey(gx + 1, gz, 3, 1)));
}

/* ✅ v0.4.10: публичная копия постройки — БЕЗ кода замка и списка
   разгадавших: код НИКОГДА не покидает сервер (в bnew/welcome едет
   только «есть код» hc и владелец own) */
/* ============================================================
   ✅ v0.4.31 ЛОМАНИЕ ПОСТРОЕК: ХП авторитет СЕРВЕРА.
     НОВЫЕ ХП (просьба игрока): фундамент — 350, ВСЕ остальные
     постройки (стена/окно/проём/дверь/потолок) — 300, сундук — 25.
   НОВЫЙ УРОН — «1 хп за N ударов», дробный:
     каменный топор  — 0.2 хп за удар (1 хп за 5 ударов)
     каменная кирка  — 0.25 хп за удар (1 хп за 4 удара)
     железная кирка  — 0.5 хп за удар  (1 хп за 2 удара)
     железный топор  — 1/3 хп за удар  (1 хп за 3 удара)
     После каждого удара хп округляется до 0.001 — копится точно.
   Клиент шлёт 'bhit' {id, tool}; сервер проверяет дистанцию (≤ 6 м),
   снимает хп, шлёт 'bhp' всем (остаток) или 'brem' (сломал).
   Сломанное уходит ИЗ ИНДЕКСОВ (removeBuildIndexes) — клетка/край
   свободны сразу. Повреждение пишется на диск через 0.8 с (debounce),
   СНОС — сразу. ХП переживает перезапуск сервера и 0 игроков.
   ============================================================ */
function maxBuildHp(ty) {
  if (ty === 'ch') return 25;
  /* ✅ v0.4.44: ЛЕСТНИЦА — 250 хп (просьба игрока), печка — как постройки */
  if (ty === 'ld') return 250;
  return (ty === 'f') ? 350 : 300;   // фундамент 350, остальные постройки 300
}
const BUILD_DMG = { axe: 0.2, pickaxe: 0.25, ironPickaxe: 0.5, ironAxe: 1 / 3,
  /* ✅ v0.4.44 булава ЛОМАЕТ ПОСТРОЙКИ (просьба игрока «почему булава не
     может ломать постройки и бочки»): 30 хп за удар — стена/потолок (300)
     с 10 ударов, сундук (25) с одного. Бочка — с одного удара (6 хп) */
  mace: 30 };

function publicBuild(b) {
  const out = { id: b.id, ty: b.ty, gx: b.gx, gz: b.gz, top: b.top,
    by: b.by, at: b.at };
  if (b.e !== undefined) out.e = b.e;
  /* ✅ v0.4.44: уровень детали (2 этаж) — едет только когда 1,
     старые записи/клиенты совместимы (нет lv = этаж 0) */
  if (b.lv === 1) out.lv = 1;
  /* ✅ v0.4.28 ХП ПОСТРОЙКИ: едет во всех снапшотах/bnew, чтобы новые
     игроки и перезашедшие знали остаток. Если записи ещё нет (мир старый) —
     присваиваем полный запас по типу — он же уйдёт в persistence */
  if (b.hp === undefined) b.hp = maxBuildHp(b.ty);
  out.hp = b.hp;
  out.max = maxBuildHp(b.ty);   /* ✅ v0.4.31: максимум едет рядом с хп */
  if (b.ty === 'dr') {
    out.open = b.open ? 1 : 0;
    out.hc = (b.code && String(b.code).length === 4) ? 1 : 0;
    out.own = b.own || '';
  }
  /* ✅ v0.4.22 СУНДУК: координаты/поворот + содержимое — оно общее,
     все игроки видят и могут достать (как лут ящиков) */
  if (b.ty === 'ch') {
    out.x = b.x; out.z = b.z; out.y = b.y;
    if (b.rot !== undefined) out.rot = b.rot;
    out.own = b.own || '';
    out.cont = b.cont || {};
  }
  /* ✅ v0.4.44 ПЕЧКА: координаты/поворот + состояние (вкл/выкл, топливо,
     вход сера/железо, выход плавленая сера/метал фрагменты) — общее,
     живёт на сервере, переживает рестарт */
  if (b.ty === 'fu') {
    out.x = b.x; out.z = b.z; out.y = b.y;
    if (b.rot !== undefined) out.rot = b.rot;
    out.own = b.own || '';
    out.cont = b.cont || {};
    out.on = b.on ? 1 : 0;
  }
  return out;
}

/** АВТОРИТЕТНАЯ установка постройки. Возвращает {b} или строку-причину отказа.
    ✅ v0.4.12 «НА СТАРЫЕ ФУНДАМЕНТЫ НЕЛЬЗЯ СТРОИТЬ»: клиент теперь шлёт
    ТОЧКУ ПРИЦЕЛА (px, pz — мировые координаты, куда смотрел луч). Сервер
    САМ находит клетку и край по точке, координаты клетки от клиента —
    только резерв. Любое расхождение координат «клиент/сервер» (старые
    фундаменты из прошлых версий, перенос папки, бэкап) больше не мешает:
    под лучом в радиусе клетки фундамент есть — стройка разрешена */
function applyPlace(p, msg) {
  const ty = String(msg.ty || '');
  let gx = Math.round(Number(msg.gx) | 0);
  let gz = Math.round(Number(msg.gz) | 0);
  if (!Number.isFinite(gx) || !Number.isFinite(gz)) return 'bad';
  /* точка прицела (клиент v0.4.12+). Резать по 5000 — защита от мусора */
  let px = Number(msg.px), pz = Number(msg.pz);
  const hasPt = Number.isFinite(px) && Number.isFinite(pz) &&
    Math.abs(px) <= 5000 && Math.abs(pz) <= 5000;
  const now = Date.now();
  if (p.lastPlace && now - p.lastPlace < 200) return 'spam';   // не чаще 5/с
  p.lastPlace = now;

  /* клетка под точкой прицела */
  const ptx = hasPt ? Math.round(px / CELL) : null;
  const ptz = hasPt ? Math.round(pz / CELL) : null;
  function cellHasF(cx, cz) {
    const c = buildCell.get(cx + ',' + cz);
    return !!(c && c.f);
  }
  /* выбрать якорную клетку. Порядок:
     1) клетка от КЛИЕНТА — она точная, когда луч попал в палубу или стену
        (клиент берёт её из userData меша, не «угадывает»);
     2) клетка под ТОЧКОЙ ПРИЦЕЛА — лечит «старые фундаменты»: даже если
        координаты клетки у клиента разъехались, фундамент под лучом
        найдётся;
     3) 4 соседа точки прицела (луч в самый край палубы). */
  function anchorFor() {
    if (cellHasF(gx, gz)) return { gx: gx, gz: gz };
    if (ptx !== null && cellHasF(ptx, ptz)) return { gx: ptx, gz: ptz };
    if (ptx !== null) {
      const nb = [[ptx + 1, ptz], [ptx - 1, ptz], [ptx, ptz + 1], [ptx, ptz - 1]];
      for (let i = 0; i < nb.length; i++) {
        if (cellHasF(nb[i][0], nb[i][1])) return { gx: nb[i][0], gz: nb[i][1] };
      }
    }
    return null;
  }

  if (ty === 'f') {
    const key = gx + ',' + gz;
    const cell = buildCell.get(key);
    if (cell && cell.f) return 'busy';
    // высоту палубы даёт клиент (рельеф детерминированный и одинаков у всех);
    // соседние фундаменты клиент уже сам «примагнитил» по высоте соседа
    const top = Math.max(-20, Math.min(300, Number(msg.top) || 0));
    const rec = { id: 'b' + (++buildSeq), ty: 'f', gx, gz, top,
      by: p.name, at: now };
    worldObjs.builds.push(rec);
    if (!buildCell.has(key)) buildCell.set(key, {});
    buildCell.get(key).f = rec;
    markDirty();
    console.log('[build] ' + p.name + ' поставил ФУНДАМЕНТ (' + gx + ',' + gz +
      ') высота ' + top.toFixed(1));
    return { b: publicBuild(rec) };
  }

  if (ty === 'w' || ty === 'wi' || ty === 'dw') {
    /* ============================================================
       ✅ v0.4.44 СТЕНА НА СТЕНУ (2 ЭТАЖ): lv:1 от клиента — стена
       второго этажа. Якорь — клетка с ПОТОЛКОМ 1 этажа (его верх —
       пол 2 этажа), база стены = верх потолка. Край занят — нельзя.
       ✅ v0.4.45 ОКНО НА 2 ЭТАЖ (просьба игрока «пусть окно можно
       ставить и на потолок»): окно 'wi' тоже ставится уровнем lv1 —
       на свободный край потолка и ВМЕТО стены 2 этажа (замена)
       ============================================================ */
    const lv1 = (msg.lv === 1) && (ty === 'w' || ty === 'wi');
    if (lv1) {
      function cellHasC0(cx, cz) {
        const c = buildCell.get(cx + ',' + cz);
        return !!(c && c.c);
      }
      let an1 = null;
      if (cellHasC0(gx, gz)) an1 = { gx: gx, gz: gz };
      else if (ptx !== null && cellHasC0(ptx, ptz)) an1 = { gx: ptx, gz: ptz };
      else if (ptx !== null) {
        const nb1 = [[ptx + 1, ptz], [ptx - 1, ptz], [ptx, ptz + 1], [ptx, ptz - 1]];
        for (let i = 0; i < nb1.length; i++) {
          if (cellHasC0(nb1[i][0], nb1[i][1])) { an1 = { gx: nb1[i][0], gz: nb1[i][1] }; break; }
        }
      }
      if (!an1) return 'noceil';                       // потолка 1 этажа нет нигде рядом
      gx = an1.gx; gz = an1.gz;
      const cell1 = buildCell.get(gx + ',' + gz);
      let e1;
      if (hasPt && (Math.abs(px - gx * CELL) >= 0.05 || Math.abs(pz - gz * CELL) >= 0.05)) {
        const dx1 = px - gx * CELL, dz1 = pz - gz * CELL;
        e1 = Math.abs(dx1) > Math.abs(dz1) ? (dx1 > 0 ? 1 : 3) : (dz1 > 0 ? 2 : 0);
      } else {
        e1 = Math.max(0, Math.min(3, Number(msg.e) | 0));
      }
      const ce1 = canonicalEdge(gx, gz, e1);
      const ekey1 = edgeKey(ce1.gx, ce1.gz, ce1.e, 1);
      /* ✅ v0.4.45: окно 2 этажа встаёт ВМЕТО стены 2 этажа (замена,
         как на 1 этаже); на крае с окном/дверью/проёмом — нельзя,
         стена на крае с чем-то — тоже нельзя */
      const exist1 = buildEdge.get(ekey1);
      if (exist1 && (ty === 'w' || exist1.ty !== 'w')) return 'busy';
      const rec1 = { id: 'b' + (++buildSeq), ty: ty,
        gx: ce1.gx, gz: ce1.gz, e: ce1.e, lv: 1,
        /* в клетке сервера потолок — СЫРАЯ запись (rec), а не entry */
        top: Math.round((cell1.c.top + CEIL_T) * 100) / 100,
        by: p.name, at: now };
      if (exist1) {
        const oi1 = worldObjs.builds.indexOf(exist1);
        if (oi1 >= 0) worldObjs.builds.splice(oi1, 1);   /* замена */
      }
      worldObjs.builds.push(rec1);
      buildEdge.set(ekey1, rec1);
      markDirty();
      console.log('[build] ' + p.name + ' поставил ' +
        (ty === 'wi' ? 'ОКНО' : 'СТЕНУ') + ' 2 ЭТАЖА (' + rec1.gx + ',' +
        rec1.gz + ', край ' + rec1.e + ') на потолок клетки (' + gx + ',' + gz + ')' +
        (exist1 ? ' — вместо ' + exist1.id : ''));
      return exist1 ? { b: publicBuild(rec1), old: exist1.id }
                    : { b: publicBuild(rec1) };
    }
    /* клетка-якорь: та, где стоит фундамент. v0.4.12: берём её ПО ТОЧКЕ
       ПРИЦЕЛА (сервер главнее), координаты клиента — только резерв */
    const an = anchorFor();
    if (!an) return 'nofound';                        // фундамента нет нигде рядом
    gx = an.gx; gz = an.gz;
    const key = gx + ',' + gz;
    const cell = buildCell.get(key);
    /* край: куда от центра клетки смещена точка прицела — та же формула,
       что у клиента (planOnEdge), поэтому призрак и сервер ВСЕГДА
       согласованы. Клиентский e используется только если луч попал
       точно в центр клетки (формула вырождается) */
    let e;
    if (hasPt) {
      const dx = px - gx * CELL, dz = pz - gz * CELL;
      if (Math.abs(dx) < 0.05 && Math.abs(dz) < 0.05) {
        e = Math.max(0, Math.min(3, Number(msg.e) | 0));
      } else {
        e = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 1 : 3) : (dz > 0 ? 2 : 0);
      }
    } else {
      e = Math.max(0, Math.min(3, Number(msg.e) | 0));
    }
    // Дедупликация — по ФИЗИЧЕСКОМУ краю: канонический ключ одинаков
    // для «юг клетки A» и «север клетки B», постройка не задвоится.
    // ✅ v0.4.44: ключ С УРОВНЕМ (этаж 0/1)
    const ce = canonicalEdge(gx, gz, e);
    const ekey = edgeKey(ce.gx, ce.gz, ce.e, 0);
    const exist = buildEdge.get(ekey);
    if (ty === 'w') {
      if (exist) return 'busy';                       // край занят
    } else {
      // окно/проём встают ВМЕТО обычной стены (замена); на крае с
      // окном/проёмом/дверью — нельзя
      if (exist && exist.ty !== 'w') return 'busy';
    }
    const rec = { id: 'b' + (++buildSeq), ty, gx: gx, gz: gz, e: e,
      top: cell.f.top,                // ВЫСОТА ИЗ ФУНДАМЕНТА СЕРВЕРА — у всех одинаково
      by: p.name, at: now };
    /* замена (окно/проём вместо стены): старая запись УХОДИТ ИЗ МИРА —
       иначе при рестарте stale-стена снова занимала бы край */
    if (exist) {
      const oi = worldObjs.builds.indexOf(exist);
      if (oi >= 0) worldObjs.builds.splice(oi, 1);
    }
    worldObjs.builds.push(rec);
    buildEdge.set(ekey, rec);
    markDirty();
    console.log('[build] ' + p.name + ' поставил ' +
      ({ w: 'СТЕНУ', wi: 'ОКНО', dw: 'ДВЕРНОЙ ПРОЁМ' }[ty] || ty) +
      ' (' + gx + ',' + gz + ', край ' + e + ') на фундамент ' + key +
      (exist ? ' — вместо ' + exist.id : ''));
    if (exist) return { b: publicBuild(rec), old: exist.id };   // замена стены
    return { b: publicBuild(rec) };
  }

  if (ty === 'dr') {
    /* дверь — в ДВЕРНОЙ ПРОЁМ. v0.4.12: проём ищем по точке прицела
       (ближайший dw-край), координаты клиента — резерв */
    let dwRec = null, dwKey = null;
    if (hasPt) {
      const half = CELL / 2;
      let bestD = 2.2;
      buildEdge.forEach((b2, k2) => {
        if (b2.ty !== 'dw') return;
        const cx = b2.gx * CELL + (b2.e === 1 ? half : b2.e === 3 ? -half : 0);
        const cz = b2.gz * CELL + (b2.e === 2 ? half : b2.e === 0 ? -half : 0);
        const d = Math.hypot(px - cx, pz - cz);
        if (d < bestD) { bestD = d; dwRec = b2; dwKey = k2; }
      });
    }
    if (!dwRec) {
      const e0 = Math.max(0, Math.min(3, Number(msg.e) | 0));
      const ce0 = canonicalEdge(gx, gz, e0);
      const k0 = ce0.gx + ',' + ce0.gz + ',' + ce0.e;
      const b0 = buildEdge.get(k0);
      if (b0 && b0.ty === 'dw') { dwRec = b0; dwKey = k0; }
    }
    if (!dwRec) return 'nodw';                        // дверного проёма нет
    const rec = { id: 'b' + (++buildSeq), ty: 'dr',
      gx: dwRec.gx, gz: dwRec.gz, e: dwRec.e, top: dwRec.top,
      by: p.name, at: now,
      own: p.aid || ('n:' + p.name),  // владелец — BRIX-ID (ник для гостей)
      open: 0, code: null, unl: {} };
    /* проём УХОДИТ ИЗ МИРА (замена dw → dr), иначе при рестарте рама
       вернулась бы на край и дверь «потерялась» */
    const dwIdx = worldObjs.builds.indexOf(dwRec);
    if (dwIdx >= 0) worldObjs.builds.splice(dwIdx, 1);
    worldObjs.builds.push(rec);
    buildEdge.set(dwRec.gx + ',' + dwRec.gz + ',' + dwRec.e, rec);
    markDirty();
    console.log('[build] ' + p.name + ' поставил ДВЕРЬ (' + dwRec.gx + ',' +
      dwRec.gz + ', край ' + dwRec.e + ') в проём — владелец ' + rec.own);
    return { b: publicBuild(rec), old: dwRec.id };
  }

  if (ty === 'c') {
    /* ============================================================
       ✅ v0.4.44 ПОТОЛОК НА ПОТОЛОК (2 этаж): lv:1 — потолок над клеткой,
       у которой ЕСТЬ потолок 1 этажа (пол 2 этажа) + стена 2 этажа.
       ============================================================ */
    const lv1 = msg.lv === 1;
    if (lv1) {
      function cellHasC0b(cx, cz) {
        const cc = buildCell.get(cx + ',' + cz);
        return !!(cc && cc.c);
      }
      let an2 = null;
      if (cellHasC0b(gx, gz)) an2 = { gx: gx, gz: gz };
      else if (ptx !== null && cellHasC0b(ptx, ptz)) an2 = { gx: ptx, gz: ptz };
      else if (ptx !== null) {
        const nb2 = [[ptx + 1, ptz], [ptx - 1, ptz], [ptx, ptz + 1], [ptx, ptz - 1]];
        for (let i = 0; i < nb2.length; i++) {
          if (cellHasC0b(nb2[i][0], nb2[i][1])) { an2 = { gx: nb2[i][0], gz: nb2[i][1] }; break; }
        }
      }
      if (!an2) return 'noceil';
      gx = an2.gx; gz = an2.gz;
      const cell2 = buildCell.get(gx + ',' + gz);
      if (cell2.c1) return 'busy';                    // потолок 2 этажа уже стоит
      if (!hasWallLv1(gx, gz)) return 'nowall';       // нужна стена 2 этажа
      const rec2 = { id: 'b' + (++buildSeq), ty: 'c', gx, gz, lv: 1,
        top: Math.round((cell2.c.top + CEIL_T + WALL_H) * 100) / 100,
        by: p.name, at: now };
      worldObjs.builds.push(rec2);
      cell2.c1 = rec2;
      markDirty();
      console.log('[build] ' + p.name + ' поставил ПОТОЛОК 2 ЭТАЖА (' + gx + ',' + gz +
        ') на высоте ' + rec2.top.toFixed(1));
      return { b: publicBuild(rec2) };
    }
    /* потолок 1 этажа — над клеткой с фундаментом И стеной.
       v0.4.12: клетку берём по точке прицела, клиентские координаты — резерв.
       ✅ v0.4.44 ПОТОЛОК НА ПОТОЛОК БЕЗ СТЕНЫ (просьба игрока: «потолок
       прилипает не только на стену или окно, но и на ближайший потолок,
       1 потолок может удержать 2 потолка без стены»): если на клетке НЕТ
       стены, но рядом есть потолок 1 этажа — ставим С ОТЪЕМКИМ ОГРАНИЧЕНИЕМ:
       один потолок-опора удерживает максимум ДВА соседних потолка без стен
       (третий уже «не выдержит» — надо ставить стену) */
    const an = anchorFor();
    if (!an) return 'nofound';
    gx = an.gx; gz = an.gz;
    const key = gx + ',' + gz;
    const cell = buildCell.get(key);
    if (cell.c) return 'busy';
    /* ✅ v0.4.45: в клетке ЛЕСТНИЦА — потолок нельзя (перекроет проход
       на 2 этаж; клиент показывает призраку ту же причину 'ld') */
    if (cell.ld) return 'ld';
    if (!hasWallOnCell(gx, gz)) {
      /* ищем соседний потолок-опору и считаем, сколько он уже держит */
      const nbC = [[gx + 1, gz], [gx - 1, gz], [gx, gz + 1], [gx, gz - 1]];
      let support = null;
      for (let i = 0; i < nbC.length; i++) {
        const nc = buildCell.get(nbC[i][0] + ',' + nbC[i][1]);
        if (nc && nc.c) { support = nc; break; }
      }
      if (!support) return 'nowall';                  // ни стены, ни соседнего потолка
      /* сколько у опоры уже висит потолков БЕЗ СТЕН (включая новые клетки) */
      let hanging = 0;
      const snb = [[Math.round(support.c.gx) + 1, support.c.gz],
                   [support.c.gx - 1, support.c.gz],
                   [support.c.gx, support.c.gz + 1],
                   [support.c.gx, support.c.gz - 1]];
      for (let j = 0; j < snb.length; j++) {
        const sc = buildCell.get(snb[j][0] + ',' + snb[j][1]);
        if (sc && sc.c && !hasWallOnCell(snb[j][0], snb[j][1])) hanging++;
      }
      /* hanging считает ПОТОЛКИ-соседи без стен. Новая клетка — ещё один;
         у самой опоры стены может не быть (она сама держится на стене —
         тогда она не считается). Лимит: 2 висящих потолка на опору */
      if (hanging >= 2) return 'ceilmax';             // опора уже держит 2 потолка
    }
    const rec = { id: 'b' + (++buildSeq), ty: 'c', gx, gz,
      top: Math.round((cell.f.top + WALL_H) * 100) / 100,   // низ потолка = верх фундамента + стена
      by: p.name, at: now };
    worldObjs.builds.push(rec);
    cell.c = rec;
    markDirty();
    console.log('[build] ' + p.name + ' поставил ПОТОЛОК (' + gx + ',' + gz +
      ') на высоте ' + rec.top.toFixed(1));
    return { b: publicBuild(rec) };
  }

  /* ============================================================
     ✅ v0.4.44 ЛЕСТНИЦА НА 2 ЭТАЖ (ty 'ld', 250 хп): клетка фундамента
     БЕЗ потолка (проём в перекрытии). По лестнице ЗАЛЕЗАЮТ вверх
     (W/Space в зоне лестницы — см. controls.js setLadder). Ставится
     где угодно в клетке, клиент показывает призрак по центру
     ============================================================ */
  if (ty === 'ld') {
    const anL = anchorFor();
    if (!anL) return 'nofound';                       // фундамента нет
    gx = anL.gx; gz = anL.gz;
    const keyL = gx + ',' + gz;
    const cellL = buildCell.get(keyL);
    if (cellL.ld) return 'busy';                      // лестница уже стоит
    if (cellL.c) return 'ceil';                       // в клетке потолок — лестнице некуда
    const recL = { id: 'b' + (++buildSeq), ty: 'ld', gx, gz,
      top: cellL.f.top,                               // низ лестницы — палуба фундамента
      by: p.name, at: now };
    worldObjs.builds.push(recL);
    cellL.ld = recL;
    markDirty();
    console.log('[build] ' + p.name + ' поставил ЛЕСТНИЦУ (' + gx + ',' + gz +
      ') на фундамент ' + keyL);
    return { b: publicBuild(recL) };
  }

  return 'bad';
}

/* мировые координаты бочки: локальные (lx, lz) внутри чекблока + поворот */
function barrelWorld(c, b) {
  const cos = Math.cos(c.rot), sin = Math.sin(c.rot);
  return {
    x: Math.round((c.x + b.lx * cos + b.lz * sin) * 10) / 10,
    z: Math.round((c.z - b.lx * sin + b.lz * cos) * 10) / 10
  };
}

function objsSnapshot(p) {
  return {
    cb: worldObjs.cb.map((c) => ({
      id: c.id, x: c.x, z: c.z, rot: c.rot, item: c.item, seed: c.seed, mil: c.mil,
      taken: c.taken, gone: c.gone, loot: c.loot,
      bar: c.barrels.map((b) => ({ id: b.id, lx: b.lx, lz: b.lz, wy: b.wy,
        lying: b.lying, hp: b.hp, brk: b.brk }))
    })),
    dr: Array.from(worldObjs.drops.values()).map((d) =>
      ({ id: d.id, kind: d.kind, x: d.x, z: d.z, amt: d.amt })),
/* ✅ v0.4.43: ЖИВЫЕ С4 — новый игрок видит бомбы, поставленные до его
   входа, и знает, когда они взорвутся (ms — остаток фьюза в мс,
   клиент выставляет фазу тыков по нему). Взрыв решает СЕРВЕР */
    c4: worldObjs.c4.map((c) => ({ id: c.id, x: c.x, y: c.y, z: c.z,
      n: c.n || [0, 1, 0], ms: Math.max(0, C4_FUSE_MS - (Date.now() - (c.at || Date.now()))) })),
/* ✅ v0.4.43: ТРУПЫ-ЛУТБОКСЫ — видны новым игрокам, переживают
   перезапуск сервера (inv: {item: count} — весь инвентарь погибшего).
   ✅ v0.4.50: age — возраст трупа в мс (для клиентского TTL), lt —
   «с трупа уже что-то лутали» (TTL 20 мин вместо 10) */
    corpses: worldObjs.corpses.map((c) => ({ id: c.id, x: c.x, y: c.y, z: c.z,
      n: c.n, c: c.c, inv: c.inv, mags: c.mags || {}, lt: c.lt ? 1 : 0,
      age: Math.max(0, Date.now() - (c.at || Date.now())) })),
/* ✅ v0.4.10: постройки в снапшоте — новый игрок сразу видит дом
   (даже если на сервере сейчас 0 игроков: builds живёт в памяти сервера).
   publicBuild: код замка не уходит клиенту; dunl — какие замки этот
   игрок УЖЕ РАЗГАДАЛ (после перезахода код заново не спрашивается).
   ✅ v0.4.13: ep — поколение мира; клиент хранит его в бэкапе и
   присылает обратно в badopt: устаревший бэкап (до ОЧИСТКИ) сервер
   отвергает и отправляет клиенту bwipe — дом убирается и у него */
    bd: worldObjs.builds.map(publicBuild),
    ep: worldObjs.epoch | 0,
    dunl: (p && worldObjs.builds.some((b) => b.ty === 'dr'))
      ? worldObjs.builds
          /* ✅ fix 0.4.11: «разгаданность» узнаётся в ОБОИХ формах ключа —
             BRIX-ID и старый «n:ник» — после перезахода код заново
             не спрашивается */
          .filter((b) => b.ty === 'dr' && b.code && b.unl &&
            ((p.aid && b.unl[p.aid]) || b.unl['n:' + p.name]))
          .map((b) => b.id)
      : []
  };
}

function spawnDropsForBarrel(c, b) {
  const w = barrelWorld(c, b);
  const out = [];
  const nScr = 1 + Math.floor(Math.random() * 2);   // 1-2 скрапа
  const nMet = Math.random() > 0.45 ? 1 : 0;        // 0-1 метал фрагмент
  const nPip = Math.random() < 0.4 ? 1 : 0;         // ✅ v0.3.8: труба тоже падает
  const plan = [];
  for (let i = 0; i < nScr; i++) plan.push('scrap');
  if (nMet) plan.push('metal');
  if (nPip) plan.push('pipe');
  plan.forEach((kind) => {
    const id = 'd' + (worldObjs.dropSeq++);
    const dx = (Math.random() - 0.5) * 2.2, dz = (Math.random() - 0.5) * 2.2;
    const drop = { id, kind,
      x: Math.round((w.x + dx) * 10) / 10,
      z: Math.round((w.z + dz) * 10) / 10,
      amt: kind === 'scrap' ? 2 + Math.floor(Math.random() * 5)
         : kind === 'metal' ? 1 + Math.floor(Math.random() * 3)
         : 1 + Math.floor(Math.random() * 2) };
    worldObjs.drops.set(id, drop);
    out.push(drop);
  });
  return out;
}

const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

function dropPlayer(p, reason) {
  if (!players.has(p.id)) return;
  /* ✅ v0.4.62: реестр игроков — вышел (ls = время выхода, on = 0) */
  touchSocial(p, false);
  players.delete(p.id);
  pushCount();   // ✅ v0.3.6: счётчик уменьшился — сразу всем
  try { p.sock.destroy(); } catch (e) {}
  console.log('[mp] ' + p.name + ' (' + p.id + ') ' + reason + ' (игроков: ' + players.size + ')');
  broadcast({ t: 'leave', id: p.id });
}

function dropSocket(p) {
  if (players.has(p.id)) dropPlayer(p, 'отключился');
}

/* ============================================================
   ✅ v0.4.15: обработка админ-команд. КАЖДАЯ проверяет isAdminP —
   подделать команду со стороны клиента бесполезно
   ============================================================ */
function adminOp(p, msg) {
  const op = String(msg.op || '');
  if (!isAdminP(p)) {
    /* ✅ v0.4.23: why:'notadmin' — клиент отличит «ты не админ» от
       «старый server.js не знает команду» (why:'unknown') и покажет
       точную подсказку вместо общего «сервер отклонил» */
    p.send({ t: 'adeny', op, why: 'notadmin' });
    console.log('[admin] ОТКАЗ (' + op + '): ' + p.name +
      ' не администратор (aid=' + (p.aid || 'нет') + ')');
    return;
  }
  switch (op) {
    /* удалить ВСЕ постройки: + поколение, bwipe всем (дома уберутся
       сами, бэкапы старого поколения сервер больше не примет) */
    case 'wipebuilds': {
      const n = worldObjs.builds.length;
      worldObjs.builds = [];
      buildCell.clear();
      buildEdge.clear();
      worldObjs.epoch = Math.max(worldObjs.epoch | 0, readEpochSidecar()) + 1;
      writeEpochSidecar(worldObjs.epoch);
      writeWorldNow();
      broadcast({ t: 'bwipe', ep: worldObjs.epoch | 0 }, null);
      p.send({ t: 'aok', op, info: 'Удалено построек: ' + n +
        ' · поколение мира: ' + worldObjs.epoch });
      console.log('[admin] ' + p.name + ' удалил все постройки (' + n +
        '), epoch=' + worldObjs.epoch);
      break;
    }
    /* телепорт СЕБЯ на координаты (кламп — не выйти за край мира) */
    case 'tp': {
      const x = Math.max(-800, Math.min(800, Number(msg.x) || 0));
      const z = Math.max(-800, Math.min(800, Number(msg.z) || 0));
      if (p.state) { p.state.x = x; p.state.z = z; p.state.a = 'idle'; }
      p.send({ t: 'atp', x, z });
      console.log('[admin] ' + p.name + ' телепортировался на ' + x + ' : ' + z);
      break;
    }
    /* телепорт СЕБЯ к игроку */
    case 'tpto': {
      const target = players.get(String(msg.tid || ''));
      if (!target || !target.state) { p.send({ t: 'aok', op, info: 'Игрок не найден или ещё в меню' }); break; }
      const x = Math.round(target.state.x * 10) / 10;
      const z = Math.round(target.state.z * 10) / 10;
      if (p.state) { p.state.x = x; p.state.z = z; p.state.a = 'idle'; }
      p.send({ t: 'atp', x, z });
      console.log('[admin] ' + p.name + ' телепортировался к ' + target.name + ' (' + x + ' : ' + z + ')');
      break;
    }
    /* телепорт ИГРОКА к себе */
    case 'bring': {
      const target = players.get(String(msg.tid || ''));
      if (!target || !target.state) { p.send({ t: 'aok', op, info: 'Игрок не найден или ещё в меню' }); break; }
      if (!p.state) { p.send({ t: 'aok', op, info: 'Сначала выйди в игру — тебя не видно серверу' }); break; }
      const x = Math.round(p.state.x * 10) / 10;
      const z = Math.round(p.state.z * 10) / 10;
      target.state.x = x; target.state.z = z; target.state.a = 'idle';
      target.send({ t: 'atp', x, z, by: p.name });
      p.send({ t: 'aok', op, info: 'Игрок ' + target.name + ' перемещён к тебе' });
      console.log('[admin] ' + p.name + ' переместил ' + target.name + ' к себе (' + x + ' : ' + z + ')');
      break;
    }
    /* забанить аккаунт (персистентно в bans.json) и кикнуть прямо сейчас */
    case 'ban': {
      const target = players.get(String(msg.tid || ''));
      if (!target) { p.send({ t: 'aok', op, info: 'Игрок не найден' }); break; }
      if (isAdminP(target)) { p.send({ t: 'aok', op, info: 'Администратора забанить нельзя' }); break; }
      const key = target.aid || ('n:' + target.name);
      if (!bans.some((b) => b.key === key)) {
        bans.push({ key, n: target.name, aid: target.aid || '',
          by: p.name, at: Date.now() });
        saveBans();
      }
      target.send({ t: 'banned', by: p.name });
      dropPlayer(target, 'забанен ' + p.name);
      p.send({ t: 'aok', op, info: 'Забанен: ' + target.name +
        (target.aid ? ' (' + target.aid + ')' : ' (без аккаунта, по нику)') });
      console.log('[admin] ' + p.name + ' забанил ' + target.name +
        ' (key=' + key + ', всего банов: ' + bans.length + ')');
      break;
    }
    /* мгновенный респавн ВСЕХ ящиков и бочек: лут перебрасывается заново,
       сломанные бочки встают — и у ВСЕХ игроков сразу */
    case 'respawn': {
      let nc = 0, nb = 0;
      worldObjs.cb.forEach((c) => {
        c.gone = false; c.taken = false;
        c.loot = rollLoot(c.mil);
        broadcast({ t: 'cbrespawn', id: c.id, loot: c.loot, mil: c.mil }, null);
        nc++;
        c.barrels.forEach((b) => {
          if (!b.brk) return;
          b.brk = false; b.hp = 6;   /* ✅ v0.4.44: 6 хп */
          broadcast({ t: 'brespawn', id: b.id, hp: 6 }, null);
          nb++;
        });
      });
      markDirty();
      writeWorldNow();
      p.send({ t: 'aok', op, info: 'Ящиков вернул: ' + nc + ' · бочек вернул: ' + nb });
      console.log('[admin] ' + p.name + ' заспавнил ящики/бочки (' + nc + '/' + nb + ')');
      break;
    }
    /* убрать все выпавшие предметы (дропы) с земли */
    case 'cleardrops': {
      const nd = worldObjs.drops.size;
      worldObjs.drops.clear();
      writeWorldNow();
      broadcast({ t: 'dclr' }, null);
      p.send({ t: 'aok', op, info: 'Убрано дропов: ' + nd });
      console.log('[admin] ' + p.name + ' убрал дропы (' + nd + ')');
      break;
    }
    /* ✅ v0.4.22 ФИКС «ИГРОКИ НЕ УМИРАЮТ»: бессмертие теперь включается
       ТУМБЛЕРОМ в админ-панели (клиент шлёт op:'god'). Урон не применяется
       только к тому соединению, где тумблер включён. Раньше сервер защищал
       ЛЮБОГО игрока с админским BRIX-ID — а при тесте в двух вкладках/
       браузерах BRIX-ID один и тот же, поэтому «второй игрок» был
       неуязвим всегда, даже с выключенным бессмертием */
    case 'god': {
      p.god = !!msg.v;
      console.log('[admin] ' + p.name + ' бессмертие: ' + (p.god ? 'ВКЛ' : 'ВЫКЛ'));
      break;
    }
    /* ============================================================
       ✅ v0.4.52 СИГНАЛЫ СЕРВЕРУ — ПОГОДА И ВРЕМЯ (админ-панель).
       Время суток и погода ведутся ТОЛЬКО здесь (envState) — админ
       просто «поворачивает ручку»: сервер меняет состояние, немедленно
       рассылает 'dnc' ВСЕМ игрокам (у них переход плавный — небо
       сглаживает), пишет world-env.json (переживает рестарт) и
       рассылает объявление 'atoast' всем в игре.
       ============================================================ */
    case 'wx': {
      const w = String(msg.v || '');
      const wRec = ENV_WX.find((x) => x.id === w);
      if (!wRec) { p.send({ t: 'aok', op, info: 'Нет такой погоды: ' + w }); break; }
      envState.wx = w;
      envState.wt = 0;                       // таймер периода — с начала
      writeEnvNow();
      broadcast(Object.assign({ t: 'dnc' }, envPublic()), null);
      const wName = w === 'gloomy' ? 'Хмуро (тучи, дождь)' : 'Ясно (солнце)';
      broadcast({ t: 'atoast', m: 'Админ сменил погоду: ' +
        (w === 'gloomy' ? 'Хмуро' : 'Ясно') }, null);
      p.send({ t: 'aok', op, info: 'Погода сменилась: ' + wName + ' — у всех игроков' });
      console.log('[env] ' + p.name + ' сменил погоду: ' + wName +
        ' · фаза суток: ' + envPhaseIdAt(envState.ct));
      break;
    }
    case 'phase': {
      const ph = String(msg.v || '');
      const pi = ENV_PHASES.findIndex((x) => x.id === ph);
      if (pi < 0) { p.send({ t: 'aok', op, info: 'Нет такой фазы суток: ' + ph }); break; }
      let acc = 0;
      for (let i2 = 0; i2 < pi; i2++) acc += ENV_PHASES[i2].dur;
      envState.ct = acc;                     // начало выбранной фазы
      writeEnvNow();
      broadcast(Object.assign({ t: 'dnc' }, envPublic()), null);
      const phName = { dawn: 'Рассвет', day: 'День', sunset: 'Закат',
        dusk: 'Сумерки', night: 'Ночь' }[ph] || ph;
      broadcast({ t: 'atoast', m: 'Админ сменил время суток: ' + phName }, null);
      p.send({ t: 'aok', op, info: 'Время суток: ' + phName + ' — у всех игроков' });
      console.log('[env] ' + p.name + ' сменил фазу суток: ' + ph +
        ' (ct=' + acc + ' с от рассвета)');
      break;
    }
    default:
      p.send({ t: 'adeny', op, why: 'unknown' });
  }
}

/** первый клиент задаёт мир (мир детерминированный — seed общий у всех).
    ✅ v0.4.44: НЕ перезаписывает восстановленные из world-objs.json запасы
    (см. loadWorldObjs): срубленное/раскопанное не воскресает после рестарта */
function initWorld(meta) {
  if (!meta || !meta.trees || !meta.ores) return false;
  if (world) return true;   // мир уже есть (с диска или от другого клиента)
  world = {
    trees: meta.trees.map(function (tr) {
      return { w: Math.max(0, tr.w | 0), g: 0, fd: 1 };
    }),
    ores: {
      iron: meta.ores.iron.map(function (v) { return Math.max(0, v | 0); }),
      sulfur: meta.ores.sulfur.map(function (v) { return Math.max(0, v | 0); }),
      stone: meta.ores.stone.map(function (v) { return Math.max(0, v | 0); })
    }
  };
  console.log('[mp] мир принят: деревьев ' + world.trees.length +
    ', жилы iron/sulfur/stone: ' + world.ores.iron.length + '/' +
    world.ores.sulfur.length + '/' + world.ores.stone.length);
  return true;
}

/** АВТОРИТЕТНОЕ применение удара по ресурсу */
function applyHit(p, msg) {
  if (!world) return null;
  if (msg.k === 'tree') {
    const idx = msg.i | 0;
    const rec = world.trees[idx];
    if (!rec || rec.g) return null;
    const y = Math.max(1, msg.y | 0);
    const l = Math.max(0, rec.w - y);
    rec.w = l;
    markDirty();   /* ✅ v0.4.44: запас дерева пишется на диск (debounce) */
    const out = { t: 'hit', k: 'tree', i: idx, l: l, by: p.id };
    if (l <= 0) {
      rec.g = 1;
      rec.fd = Math.random() > 0.5 ? 1 : -1;   // сторона падения — решает СЕРВЕР
      out.d = 1;
      out.fd = rec.fd;
    } else { out.d = 0; }
    return out;
  }
  // руда
  const arr = world.ores[msg.ty];
  if (!arr) return null;
  const idx2 = msg.i | 0;
  if (arr[idx2] === undefined || arr[idx2] <= 0) return null;
  const y2 = Math.max(1, msg.y | 0);
  const l2 = Math.max(0, arr[idx2] - y2);
  arr[idx2] = l2;
  markDirty();   /* ✅ v0.4.44: запас руды пишется на диск (debounce) */
  return { t: 'hit', k: 'ore', ty: msg.ty, i: idx2, l: l2, d: l2 <= 0 ? 1 : 0, by: p.id };
}

/* ---------- 4. HTTP-сервер + upgrade ---------- */

const server = http.createServer((req, res) => serveFile(req, res, req.url));

server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { sock.destroy(); return; }
  sock.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + wsAccept(key) + '\r\n\r\n'
  );
  sock.setNoDelay(true);

  const p = {
    id: null, name: '', c: '#e2572b',
    sock: sock,
    state: null,          // последнее состояние движения
    hp: 100,              // ✅ v0.4.5: здоровье (ПвП) — авторитет сервера
    cold: 0,              // ✅ v0.4.34: шкала холода 0..100 — авторитет сервера
    dead: false,
    last: Date.now(),
    send: null
  };

  const feed = wsParser(
    (text) => {
      p.last = Date.now();
      let msg;
      try { msg = JSON.parse(text); } catch (e) { return; }
      if (!msg || !msg.t) return;

      /* --- регистрация игрока (сервер назначает id) --- */
      if (msg.t === 'hello') {
        const aidCand = String(msg.aid || '').slice(0, 16);
        const nameCand = String(msg.n || '').slice(0, 16);
        /* ✅ v0.4.15: бан-лист ПЕРЕД регистрацией — забаненный не войдёт */
        if (isBanned(aidCand, nameCand)) {
          try {
            sock.write(wsEncodeText(JSON.stringify(
              { t: 'banned' })));
          } catch (e) {}
          try { sock.destroy(); } catch (e) {}
          console.log('[admin] отказано в входе (забанен): ' +
            nameCand + ' (aid=' + (aidCand || 'нет') + ')');
          return;
        }
        p.id = 'u' + (nextNum++);
        p.name = String(msg.n || ('Игрок-' + p.id.slice(1).padStart(2, '0'))).slice(0, 16);
        p.c = String(msg.c || '#e2572b').slice(0, 24);
        // ✅ v0.4.3: уровень профиля и BRIX-ID — для списка игроков
        // в мини-меню (M). Присылаются клиентом, сервер только хранит
        p.lvl = Math.max(1, Math.min(9999, Number(msg.lvl) || 1));
        p.aid = String(msg.aid || '').slice(0, 16);
        /* ✅ v0.4.62: реестр всех игроков — зашёл (on = 1, ls = сейчас) */
        touchSocial(p, true);
        p.send = (obj2) => { try { sock.write(wsEncodeText(JSON.stringify(obj2))); } catch (e) {} };
        players.set(p.id, p);
        /* ✅ v0.4.46: СОХРАНЕНИЕ ИГРОКА по BRIX-ID — позиция/хп/инвентарь/
           слот хотбара. Хп сервер восстанавливает СРАЗУ (он авторитет урона),
           остальное уезжает клиенту в welcome.psave */
        p.psaved = (p.aid && playerSaves.get(p.aid)) || null;
        if (p.psaved) {
          p.hp = Math.max(1, Math.min(100, Math.round(Number(p.psaved.hp) || 100)));
          console.log('[players] ' + p.name + ' — сохранение найдено (hp ' + p.hp +
            ', предметов ' + ((p.psaved.inv || []).length) + ')');
        }
        if (!world && msg.meta) initWorld(msg.meta);
        // АВТОРИТЕТНЫЙ welcome: свой id + ВСЕ игроки с позициями + мир
        p.send({
          t: 'welcome',
          ver: 50,               // ✅ v0.4.22: сундуки (chplace/chestopen/chestput/chesttake)
          /* ✅ v0.4.17: sv — версия СЕРВЕРА (клиент отличит новый сервер
             от старого), adm — подтвердил ли сервер ЭТОГО игрока админом
             (для диагностики; панель включается по adminon) */
          sv: SRV_VER,
          /* ✅ v0.4.64: realm/mode/имя сервера — клиент включает
             ПВП-режим (без хотбара/крафта, E = список оружия) */
          realm: REALM, mode: SRV_MODE, sname: SRV_NAME,
          /* ✅ v0.4.29: папка сервера в welcome — если версии не совпали,
             клиент покажет в баннере, из какой папки сервер работает,
             и игрок сразу увидит, что заменил server.js не там */
          folder: ROOT,
          adm: isAdminP(p) ? 1 : 0,
          id: p.id,
          players: rosterFor().filter(function (r) { return r.id !== p.id; }),
          world: world ? {
            trees: world.trees.map(function (tr) { return { w: tr.w, g: tr.g, fd: tr.fd }; }),
            ores: {
              iron: world.ores.iron.slice(),
              sulfur: world.ores.sulfur.slice(),
              stone: world.ores.stone.slice()
            }
          } : null,
      /* ✅ v0.4.10: постройки — публичные копии без кода замка,
         dunl — замки, которые ЭТОТ игрок уже разгадал */
          objs: objsSnapshot(p),  // ✅ v0.3.6: бочки/чекблоки/дропы (авторитет сервера)
          /* ✅ v0.4.51: сутки и погода ТИКАЮТ НА СЕРВЕРЕ — новичок сразу
             видит верное время/погоду, дальше — пуши 'dnc' раз в секунду */
          dnc: envPublic(),
          /* ✅ v0.4.46: СОХРАНЕНИЕ ЭТОГО ИГРОКА (позиция+инвентарь+слот
             хотбара) — client восстановит сразу после спавна */
          psave: p.psaved || undefined,
          /* ✅ v0.5.0 ПВП-АРЕНА: боты «ПОЛИГОНА» + счёт команд + своя
             команда (все игроки — СТАЛЬ, синие). Клиент строит бот-вью
             сразу, счётчик килов СТАЛЬ/ПЛАМЯ — сверху */
          pvp: Bots ? Bots.snapshot() : undefined
        });
        // ✅ v0.4.3: в join едет lvl/aid — у всех игроков список полный сразу
        broadcast({ t: 'join', id: p.id, n: p.name, c: p.c,
          lvl: p.lvl || 1, aid: p.aid || '' }, p.id);
        /* ✅ v0.4.16: BRIX-ID КАЖДОГО вошедшего — в консоли сервера.
           Так владелец узнаёт свой ID, чтобы вписать его в admins.json */
        console.log('[mp] ' + p.name + ' (' + p.id + ', BRIX-ID: ' +
          (p.aid || 'нет') + ') вошёл (игроков: ' + players.size + ')' +
          (isAdminP(p) ? ' — АДМИН' : ''));
        // ✅ v0.4.15: админу — отдельное подтверждение (клиент включает панель на 9)
        if (isAdminP(p)) p.send({ t: 'adminon' });
        // ✅ v0.3.6: мгновенный пуш нового счётчика всем
        pushCount();
        // ✅ v0.3.5: отложенные заявки в друзья — «дойдут, когда зайдёшь»
        deliverPending(p);
        return;
      }
      if (!p.id) return; // не представился — игнор

      switch (msg.t) {
        case 's':           // состояние игрока: запоминаем + ретранслируем другим
          // ✅ v0.4.1: первое состояние = игрок вышел в игру — пушим
          // счётчики (иначе «В ИГРЕ» у других остаётся 0 до следующего пуша)
          // ✅ v0.4.58: si — id скинутого предмета в руках (для обёртки у других)
          if (!p.state) pushCount();
          p.state = {
            x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw,
            a: msg.a, tool: msg.tool, si: String(msg.si || '').slice(0, 24), ph: msg.ph, n: p.name,
            c: msg.c ? 1 : 0   /* ✅ v0.4.28: присед — для чужих игроков */
          };
          broadcast({ t: 's', id: p.id, x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw,
            a: msg.a, tool: msg.tool, si: String(msg.si || '').slice(0, 24),
            ph: msg.ph, c: msg.c ? 1 : 0, n: p.name }, p.id);
          break;
        case 'hit': {       // ЗАПРОС удара: решает сервер
          const res = applyHit(p, msg);
          if (res) {
            console.log('[mp] ' + p.name + ' бьёт ' + res.k +
              (res.ty ? '/' + res.ty : '') + '#' + res.i + ' → остаток ' + res.l +
              (res.d ? ' (исчерпан)' : ''));
            broadcast(res, p.id);
          }
          break;
        }
        /* ✅ v0.4.15 АДМИН-ПАНЕЛЬ: все команды разработчика (см. adminOp) */
        case 'admin':
          adminOp(p, msg);
          break;
        case 'bye':
          dropPlayer(p, 'вышел');
          break;
        /* ✅ v0.3.7: удар по бочке (внутри чекблока) — СЕРВЕР считает HP.
           Игроки на состояние не влияют: шлют заявку, сервер решает */
        case 'ping':   // ✅ v0.4.0: клиент проверяет «жив ли сервер»
          p.send({ t: 'pong' });
          break;

        /* ✅ fix v0.4.30 «ПОСТРОЙКИ НЕ ЛОМАЮТСЯ»: в этом switch было ДВА
           case 'bhit' — для бочек и для построек. JavaScript выполняет
           только ПЕРВЫЙ совпавший case, поэтому ветка построек ниже была
           мёртвым кодом: сервер молча проглатывал удар по фундаменту/стене
           — хп не снималось, 'bhp'/'brem' не уходили, хп-панель не
           появлялась. Теперь оба обработчика живут в ОДНОМ case: id нашли
           в barrelIndex — бочка, иначе — постройка */
        case 'bhit': {
          /* ✅ v0.5.0 ПВП-АРЕНА: выстрел/удар игрока по БОТУ «ПОЛИГОНА».
             Сервер авторитетен: свои (синие) неуязвимы, дистанция ≤ 90 м,
             потолок урона 35; убийство — 'bdead' + счёт команды СТАЛЬ */
          if (Bots && msg && msg.i !== undefined && msg.dmg !== undefined) {
            const bres = Bots.handleBhit(p, msg);
            if (bres) p.send(bres);
            break;
          }
          const rec = barrelIndex.get(String(msg.id || ''));
          if (rec && !rec.bar.brk) {
            if (!p.lastBHit) p.lastBHit = {};
            // защита от спама: не чаще 4 ударов/с на бочку
            const now = Date.now();
            if (p.lastBHit[rec.bar.id] && now - p.lastBHit[rec.bar.id] < 250) break;
            p.lastBHit[rec.bar.id] = now;
            /* ✅ v0.4.44 НОВАЯ ТАБЛИЦА УДАРОВ ПО БОЧКЕ (hp 6):
               каменные топор/кирка — 1 за удар (6 ударов),
               железные топор/кирка — 1.5 за удар (4 удара),
               БУЛАВА — 6 за удар (1 удар, просьба игрока).
               Кулак — 1 (6 ударов, как камень) */
            const dmg = msg.tool === 'mace' ? 6
              : (msg.tool === 'ironAxe' || msg.tool === 'ironPickaxe') ? 1.5
              : 1;
            rec.bar.hp -= dmg;
            if (rec.bar.hp <= 0) {
              rec.bar.hp = 0;
              rec.bar.brk = true;
              const drops = spawnDropsForBarrel(rec.cb, rec.bar);
              // ✅ v0.3.8: бочка вернётся по ТАЙМЕРУ СЕРВЕРА — и у всех сразу
              scheduleBarrelRespawn(rec.bar, BARREL_RESPAWN_MS);
              broadcast({ t: 'brk', id: rec.bar.id, drops }, null);   // и бьющему тоже
              markDirty();
              console.log('[objs] бочка ' + rec.bar.id + ' (чекблок ' + rec.cb.id +
                ') разбита (' + p.name + '), дропов: ' + drops.length +
                ' — вернётся через ' + Math.round(BARREL_RESPAWN_MS / 60000) + ' мин');
            } else {
              broadcast({ t: 'bhp', id: rec.bar.id, hp: rec.bar.hp }, null);
              markDirty();
            }
            break;
          }
          /* ✅ v0.4.31 ЛОМАНИЕ ПОСТРОЕК: клиент бьёт ЛКМ по детали —
             сервер решает всё (дробный хп/снос). Урон только топорами/
             кирками (0.2/0.25/0.5/1/3 хп за удар), дистанция ≤ 6 м.
             Сломанное уходит из мира и ИЗ ИНДЕКСОВ ('brem' + чистка
             клетки/края), остаток хп виден всем ('bhp'), newcomers
             не получат сломанное в welcome. ХП переживает перезапуск
             сервера и работает при 0 игроков */
          const b = worldObjs.builds.find((x) => x.id === String(msg.id || ''));
          if (!b) break;
          if (!p.state) break;
          const wx = (b.ty === 'ch') ? b.x : b.gx * CELL;
          const wz = (b.ty === 'ch') ? b.z : b.gz * CELL;
          if (dist2(p.state.x, p.state.z, wx, wz) > 36) break;   // дальше 6 м
          const bdmg = BUILD_DMG[String(msg.tool || '')] || 0;
          if (!bdmg) break;                                      // не инструмент
          /* ✅ v0.4.31: урон ДРОБНЫЙ (0.2/0.25/0.5/1/3 за удар) — «1 хп
             за 5/4/2/3 удара». Округление до 0.001: копится точно */
          b.hp = Math.round(((b.hp === undefined ? maxBuildHp(b.ty) : b.hp) - bdmg) * 1000) / 1000;
          if (b.hp <= 0) {
            worldObjs.builds.splice(worldObjs.builds.indexOf(b), 1);
            /* ✅ v0.4.31: сломанное уходит И ИЗ ИНДЕКСОВ сервера — клетка/
               край свободны СРАЗУ, на сломанный фундамент стену не поставить */
            removeBuildIndexes(b);
            /* ✅ v0.4.62 НАДГРОБИЕ: id сломанного ПОМНИМ и после перезапуска —
               клиентский бэкап localStorage больше не «доберёт» сломанное
               обратно через badopt (сломанное навсегда удалено из мира) */
            tombstone(b.id);
            broadcast({ t: 'brem', id: b.id, by: p.id }, null);
            writeWorldNow();   // снос — на диск СРАЗУ (перезапуск ничего не вернёт)
            console.log('[objs] ' + p.name + ' сломал постройку ' + b.id +
              ' (' + b.ty + ') — brem ушёл ВСЕМ, клетка/край освобождены');
          } else {
            broadcast({ t: 'bhp', id: b.id, hp: b.hp, max: maxBuildHp(b.ty) }, null);
            /* ✅ v0.4.31: при «1 хп за 5 ударов» writeWorldNow на КАЖДЫЙ
               удар давал бы тысячу записей файла подряд — теперь хп
               пишется дебаунсом 0.8 с (markDirty) + страховка 20 с */
            markDirty();
          }
          break;
        }
        /* ✅ v0.3.6: подбор дропа — проверяем дистанцию по ПОСЛЕДНЕЙ
           ИЗВЕСТНОЙ позиции игрока (сервер не верит клиенту вслепую) */
        case 'btake': {
          const d = worldObjs.drops.get(String(msg.id || ''));
          if (!d) break;
          const pos = p.state || null;
          if (pos && dist2(pos.x, pos.z, d.x, d.z) > 36) break;  // >6 м — не верим
          worldObjs.drops.delete(d.id);
          broadcast({ t: 'btaken', id: d.id, pid: p.id, item: d.kind, amt: d.amt }, null);
          markDirty();
          console.log('[objs] ' + p.name + ' подобрал ' + d.kind + ' x' + d.amt);
          break;
        }
        /* ✅ v0.3.8: открыть ЛУТ-МЕНЮ ящика — сервер отвечает текущим лутом */
        case 'cbopen': {
          const c = worldObjs.cb.find((x) => x.id === String(msg.id || ''));
          if (!c || c.gone) break;
          const pos3 = p.state || null;
          if (pos3 && dist2(pos3.x, pos3.z, c.x, c.z) > 100) break;  // >10 м
          p.send({ t: 'cbopen', id: c.id, loot: c.loot, mil: c.mil });
          break;
        }
        /* ✅ v0.3.8: взять ОДИН ВИД предмета из ящика.
           Лут хранится на СЕРВЕРЕ: взял скрап — у всех остался
           пружина/металл; пустой ящик исчезает у всех и возвращается
           по таймеру сервера с новым лутом.
           ✅ v0.4.1: amt — взять ЧАСТЬ стека (перетащил в свой стек —
           заберётся столько, сколько влезает); без amt — весь стек */
        case 'cbtake': {
          const tid = String(msg.tid || '');
          const c = worldObjs.cb.find((x) => x.id === String(msg.id || ''));
          // ✅ v0.4.2: при отказе клиенту шлётся cbdeny — он ОТКАТИТ
          // оптимистично добавленный предмет (раньше отказ был «немым»
          // и предмет пропадал у игрока)
          if (!c || c.gone) {
            if (tid) p.send({ t: 'cbdeny', id: msg.id, item: msg.item, tid });
            break;
          }
          const pos2 = p.state || null;
          if (pos2 && dist2(pos2.x, pos2.z, c.x, c.z) > 100) {  // >10 м
            if (tid) p.send({ t: 'cbdeny', id: msg.id, item: msg.item, tid });
            break;
          }
          const item = String(msg.item || '');
          const avail = (c.loot && c.loot[item]) || 0;
          if (avail <= 0) {                          // такого предмета уже нет
            if (tid) p.send({ t: 'cbdeny', id: msg.id, item: msg.item, tid });
            break;
          }
          const amt = (msg.amt > 0) ? Math.min(Math.floor(msg.amt), avail) : avail;
          c.loot[item] = avail - amt;
          const empty = Object.keys(c.loot).every((k) => !c.loot[k]);
          if (empty) {
            c.gone = true;
            c.taken = true;
            scheduleCrateRespawn(c, CRATE_RESPAWN_MS[c.mil ? 'military' : 'wooden']);
            console.log('[objs] ящик ' + c.id + ' пуст — исчезнет у всех, вернётся через ' +
              Math.round(CRATE_RESPAWN_MS[c.mil ? 'military' : 'wooden'] / 60000) + ' мин');
          }
          broadcast({ t: 'cbloot', id: c.id, loot: c.loot, pid: p.id,
            item, amt, gone: empty, tid }, null);
          markDirty();
          console.log('[objs] ' + p.name + ' взял из ящика ' + c.id + ': ' + item + ' x' + amt);
          break;
        }
        /* ✅ v0.4.1: ПОЛОЖИТЬ свой предмет В ЯЩИК (drag&drop в обратную
           сторону). Содержимое инвентаря сервер не отслеживает —
           клиент сам вычел предмет у себя ДО отправки; лут ящика
           авторитетен и рассылается всем через cbloot */
        case 'cbput': {
          const c = worldObjs.cb.find((x) => x.id === String(msg.id || ''));
          if (!c || c.gone) break;
          const pos4 = p.state || null;
          if (pos4 && dist2(pos4.x, pos4.z, c.x, c.z) > 100) break;  // >10 м
          const item = String(msg.item || '');
          if (!item) break;
          const amt = Math.max(1, Math.min(999, Math.floor(msg.amt || 1)));
          c.loot[item] = (c.loot[item] || 0) + amt;
          broadcast({ t: 'cbloot', id: c.id, loot: c.loot, pid: p.id,
            item, amt, gone: false, put: true }, null);
          markDirty();
          console.log('[objs] ' + p.name + ' положил в ящик ' + c.id + ': ' + item + ' x' + amt);
          break;
        }
        /* ============================================================
           ✅ v0.4.22 СУНДУК-ХРАНИЛИЩЕ (ty:'ch') — новая постройка.
           Содержимое живёт НА СЕРВЕРЕ в записи постройки: уезжает в
           автосейв вместе с домами и приходит новичкам в welcome.
           Положить/взять может ЛЮБОЙ игрок (как лут ящиков).
           ============================================================ */
        case 'chplace': {
          if (!p.state) break;
          const chx = Number(msg.x), chz = Number(msg.z), chy = Number(msg.y);
          if (!Number.isFinite(chx) || !Number.isFinite(chz) || !Number.isFinite(chy) ||
              Math.abs(chx) > 5000 || Math.abs(chz) > 5000 || chy < -50 || chy > 500) break;
          if (dist2(p.state.x, p.state.z, chx, chz) > 36) break;   // дальше 6 м — не верим
          /* рядом (1.2 м) не должно стоять другого сундука */
          let clash = false;
          worldObjs.builds.forEach((b) => {
            if (b.ty !== 'ch') return;
            const dx = b.x - chx, dz = b.z - chz;
            if (dx * dx + dz * dz < 1.44) clash = true;
          });
          if (clash) { p.send({ t: 'bdeny', tid: msg.tid, why: 'clash' }); break; }
          let chy2 = chy;
          /* на фундаменте — высоту берём ИЗ серверного фундамента,
             на земле — верим клиенту (рельеф детерминированный, как у домов)
             ✅ v0.4.41 КРАШ «Cannot read properties of undefined (reading
             'top')»: чанк палубы мог прийти без поля rec (перезапись клетки
             старым снимком мира, гонка welcome/сохранения) — раньше падал
             ВЕСЬ ПРОЦЕСС после ~часа игры. Теперь проверяем rec И top; если
             записи нет — высоту не трогаем (сундук встанет по высоте луча) */
          const chCell = buildCell.get(Math.floor(chx / CELL) + ',' + Math.floor(chz / CELL));
          /* ✅ v0.4.44: в клетке сервера фундамент — СЫРАЯ запись (rec):
             раньше читали chCell.f.rec.top — его НЕ СУЩЕСТВУЕТ, поэтому
             сундук никогда не «примагничивался» к палубе (высоту не брал) */
          const chFTop = (chCell && chCell.f &&
            Number.isFinite(chCell.f.top)) ? chCell.f.top : null;
          if (chFTop !== null && Math.abs(chy - chFTop) < 1.0) {
            chy2 = chFTop;                                        // стоит НА палубе
          }
          const chRec = { id: 'b' + (++buildSeq), ty: 'ch',
            x: Math.round(chx * 100) / 100, z: Math.round(chz * 100) / 100,
            y: Math.round(chy2 * 100) / 100,
            rot: Math.round((Number(msg.rot) || 0) * 100) / 100,
            by: p.name, at: Date.now(), own: p.aid || ('n:' + p.name), cont: {} };
          worldObjs.builds.push(chRec);
          broadcast({ t: 'bnew', pid: p.id, b: publicBuild(chRec) }, null);
          markDirty();
          console.log('[objs] ' + p.name + ' поставил сундук ' + chRec.id +
            ' (' + chRec.x.toFixed(1) + ', ' + chRec.z.toFixed(1) + ')');
          break;
        }
        case 'chestopen': {
          const chest = worldObjs.builds.find((b) => b.ty === 'ch' && b.id === String(msg.id || ''));
          if (!chest) break;
          if (p.state && dist2(p.state.x, p.state.z, chest.x, chest.z) > 64) break;  // >8 м
          p.send({ t: 'chestst', id: chest.id, cont: chest.cont, own: chest.own || '' });
          break;
        }
        case 'chestput': {
          const chest = worldObjs.builds.find((b) => b.ty === 'ch' && b.id === String(msg.id || ''));
          if (!chest) break;
          if (p.state && dist2(p.state.x, p.state.z, chest.x, chest.z) > 64) break;
          const item = String(msg.item || '');
          if (!item) break;
          const amt = Math.max(1, Math.min(999, Math.floor(msg.amt || 1)));
          chest.cont[item] = (chest.cont[item] || 0) + amt;
          broadcast({ t: 'chestst', id: chest.id, cont: chest.cont, pid: p.id,
            item, amt, put: true }, null);
          markDirty();
          console.log('[objs] ' + p.name + ' положил в сундук ' + chest.id + ': ' + item + ' x' + amt);
          break;
        }
        case 'chesttake': {
          const tid = String(msg.tid || '');
          const chest = worldObjs.builds.find((b) => b.ty === 'ch' && b.id === String(msg.id || ''));
          if (!chest) {
            if (tid) p.send({ t: 'chestdeny', id: msg.id, item: msg.item, tid });
            break;
          }
          if (p.state && dist2(p.state.x, p.state.z, chest.x, chest.z) > 64) {
            if (tid) p.send({ t: 'chestdeny', id: msg.id, item: msg.item, tid });
            break;
          }
          const item = String(msg.item || '');
          const avail = (chest.cont && chest.cont[item]) || 0;
          if (avail <= 0) {                        // такого предмета в сундуке уже нет
            if (tid) p.send({ t: 'chestdeny', id: msg.id, item: msg.item, tid });
            break;
          }
          const amt = (msg.amt > 0) ? Math.min(Math.floor(msg.amt), avail) : avail;
          chest.cont[item] = avail - amt;
          if (chest.cont[item] <= 0) delete chest.cont[item];
          broadcast({ t: 'chestst', id: chest.id, cont: chest.cont, pid: p.id,
            item, amt, take: true, tid }, null);
          markDirty();
          console.log('[objs] ' + p.name + ' взял из сундука ' + chest.id + ': ' + item + ' x' + amt);
          break;
        }
        /* крышка сундука: анимация для остальных (без состояния) */
        case 'chestanim': {
          broadcast({ t: 'chestanim', id: String(msg.id || ''), open: msg.open ? 1 : 0 }, p.id);
          break;
        }
        /* ============================================================
           ✅ v0.4.44 ПЕЧКА (ty 'fu') — свободная постройка как сундук.
           Плавит СЕРУ (1 шт за 4 с → ПЛАВЛЕНАЯ СЕРА sulfurM) и ЖЕЛЕЗО
           (1 шт за 6 с → МЕТАЛ ФРАГМЕНТ metal) ЗА ДЕРЕВО (1 дерево за
           8 с горения). Состояние (on/cont) живёт на сервере:
           • fuplace — поставить (x, z, y, rot)
           • futog   — включить/выключить
           • fuput   — положить (wood / sulfur / iron)
           • futake  — взять (любой из cont)
           Все изменения рассылаются ВСЕМ как 'fust' {id, cont, on} —
           у всех игроков печка одинаковая, переживает рестарт сервера
           ============================================================ */
        case 'fuplace': {
          if (!p.state) break;
          const fux = Number(msg.x), fuz = Number(msg.z), fuy = Number(msg.y);
          if (!Number.isFinite(fux) || !Number.isFinite(fuz) || !Number.isFinite(fuy) ||
              Math.abs(fux) > 5000 || Math.abs(fuz) > 5000 || fuy < -50 || fuy > 500) break;
          if (dist2(p.state.x, p.state.z, fux, fuz) > 36) break;   // дальше 6 м — не верим
          let clashF = false;
          worldObjs.builds.forEach((b) => {
            if (b.ty !== 'fu') return;
            const dx = b.x - fux, dz = b.z - fuz;
            if (dx * dx + dz * dz < 1.44) clashF = true;
          });
          if (clashF) { p.send({ t: 'bdeny', tid: msg.tid, why: 'clash' }); break; }
          /* на фундаменте — высоту берём ИЗ серверного фундамента,
             на потолке/земле — верим клиенту (рельеф детерминированный) */
          let fuy2 = fuy;
          const fuCell = buildCell.get(Math.floor(fux / CELL) + ',' + Math.floor(fuz / CELL));
          const fuFTop = (fuCell && fuCell.f && Number.isFinite(fuCell.f.top)) ? fuCell.f.top : null;
          if (fuFTop !== null && Math.abs(fuy - fuFTop) < 1.0) fuy2 = fuFTop;
          const fuRec = { id: 'b' + (++buildSeq), ty: 'fu',
            x: Math.round(fux * 100) / 100, z: Math.round(fuz * 100) / 100,
            y: Math.round(fuy2 * 100) / 100,
            rot: Math.round((Number(msg.rot) || 0) * 100) / 100,
            by: p.name, at: Date.now(), own: p.aid || ('n:' + p.name),
            cont: {}, on: 0 };
          worldObjs.builds.push(fuRec);
          broadcast({ t: 'bnew', pid: p.id, b: publicBuild(fuRec) }, null);
          markDirty();
          console.log('[objs] ' + p.name + ' поставил печку ' + fuRec.id +
            ' (' + fuRec.x.toFixed(1) + ', ' + fuRec.z.toFixed(1) + ')');
          break;
        }
        case 'futog': {
          const fu = worldObjs.builds.find((b) => b.ty === 'fu' && b.id === String(msg.id || ''));
          if (!fu) break;
          if (p.state && dist2(p.state.x, p.state.z, fu.x, fu.z) > 64) break;  // >8 м
          fu.on = fu.on ? 0 : 1;
          fu.fuelAcc = 0;
          broadcast({ t: 'fust', id: fu.id, cont: fu.cont, on: fu.on }, null);
          markDirty();
          console.log('[furnace] ' + p.name + ' ' + (fu.on ? 'включил' : 'выключил') +
            ' печку ' + fu.id);
          break;
        }
        case 'fuput': {
          const fu = worldObjs.builds.find((b) => b.ty === 'fu' && b.id === String(msg.id || ''));
          if (!fu) break;
          if (p.state && dist2(p.state.x, p.state.z, fu.x, fu.z) > 64) break;
          const item = String(msg.item || '');
          /* в печку кладётся только ДЕРЕВО (топливо), СЕРА и ЖЕЛЕЗО (вход) */
          if (item !== 'wood' && item !== 'sulfur' && item !== 'iron') break;
          const amt = Math.max(1, Math.min(999, Math.floor(msg.amt || 1)));
          fu.cont[item] = (fu.cont[item] || 0) + amt;
          broadcast({ t: 'fust', id: fu.id, cont: fu.cont, on: fu.on,
            pid: p.id, item, amt, put: true }, null);
          markDirty();
          console.log('[furnace] ' + p.name + ' положил в печку ' + fu.id + ': ' + item + ' x' + amt);
          break;
        }
        case 'futake': {
          const tid = String(msg.tid || '');
          const fu = worldObjs.builds.find((b) => b.ty === 'fu' && b.id === String(msg.id || ''));
          if (!fu) { p.send({ t: 'fudenied', id: String(msg.id || ''), tid }); break; }
          if (p.state && dist2(p.state.x, p.state.z, fu.x, fu.z) > 64) {
            p.send({ t: 'fudenied', id: fu.id, tid }); break;
          }
          const item = String(msg.item || '');
          const avail = (fu.cont && fu.cont[item]) || 0;
          if (avail <= 0) { p.send({ t: 'fudenied', id: fu.id, item, tid }); break; }
          const amt = (msg.amt > 0) ? Math.min(Math.floor(msg.amt), avail) : avail;
          fu.cont[item] = avail - amt;
          if (fu.cont[item] <= 0) delete fu.cont[item];
          broadcast({ t: 'fust', id: fu.id, cont: fu.cont, on: fu.on,
            pid: p.id, item, amt, take: true, tid }, null);
          markDirty();
          console.log('[furnace] ' + p.name + ' взял из печки ' + fu.id + ': ' + item + ' x' + amt);
          break;
        }
        /* ✅ v0.3.3: соцсеть — пересылка заявок в друзья адресату по имени.
           Сервер только доставляет: {t:'fsend', to:'Ник', kind, data} →
           адресату {t:'fsoc', from, fromId, kind, data} */
        case 'fsend': {
          const to = String(msg.to || '').trim().toLowerCase();
          if (!to) break;
          let delivered = false;
          players.forEach((target) => {
            if (target === p) return;
            if (target.name.toLowerCase() === to) {
              target.send({ t: 'fsoc', from: p.name, fromId: msg.fromId || p.id,
                kind: String(msg.kind || ''), data: msg.data || null });
              delivered = true;
            }
          });
          if (!delivered && p.send) p.send({ t: 'fsoc-miss', to: msg.to, kind: msg.kind });
          break;
        }
        /* ✅ v0.4.5 БОЙ: звук выстрела/перезарядки — ретранслируем всем
           остальным (они сами гасят громкость по дистанции до источника) */
        case 'snd': {
          broadcast({ t: 'snd', by: p.id, k: String(msg.k || 'shot'),
            x: Number(msg.x) || 0, z: Number(msg.z) || 0 }, p.id);
          break;
        }
        /* ✅ v0.4.57 ТРАССЕР ВЫСТРЕЛА: o — «внешнее дуло» стрелка,
           e — точка попадания, k — вид оружия. Ретранслируем всем
           остальным — трассеры чужих выстрелов видят все игроки */
        case 'trc': {
          if (!Array.isArray(msg.o) || !Array.isArray(msg.e)) break;
          broadcast({ t: 'trc', by: p.id, k: String(msg.k || 'rev'),
            o: msg.o.map(function (v) { return +(+v || 0).toFixed(2); }),
            e: msg.e.map(function (v) { return +(+v || 0).toFixed(2); }) }, p.id);
          break;
        }
        /* ============================================================
           ✅ v0.4.43: С4 ТИКАЕТ В СЕРВЕРЕ (а не у игрока). Блок прилип →
           бросавший шлёт 'c4place' {x,y,z,n}; сервер СОЗДАЁТ СУЩНОСТЬ
           {id, x,y,z, n, by, at}, ставит таймер взрыва на остаток фьюза
           (11.24 с) и рассылает 'c4placed' {id, ..., ms} ВСЕМ — включая
           бросавшего (тот привязывает свой блок к id). Взрыв решает
           СЕРВЕР: case c4SrvExplode (сам рассылает 'c4boom' с id и сам
           наносит урон). Игрок вышел — бомба всё равно взорвётся; новый
           игрок получит бомбу в снапшоте с остатком фьюза; рестарт
           сервера бомбы не теряет (world-objs.json v6).
           ============================================================ */
        case 'c4place': {
          const cx = Number(msg.x), cy = Number(msg.y), cz = Number(msg.z);
          if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz)) break;
          if (Math.abs(cx) > 5000 || Math.abs(cz) > 5000) break;
          /* ✅ v0.4.44: допуск 30 м (было 10 м). Бросок С4 летит до 45 м,
             а p.state у сервера опаздывает на ~0.9 с (12 Гц) — при броске
             в дальнюю стену собственного дома сервер МОЛЧА ОТКЛОНЯЛ
             постановку: бомба у клиента оставалась без srvId, взрывался
             failsafe, а легаси-ветка 'c4boom' резала всё дальше 12 м →
             «С4 иногда не ломает маленькие дома». Теперь и постановка,
             и легаси-взрыв принимаются до 30 м */
          if (!p.state || dist2(p.state.x, p.state.z, cx, cz) > 900) break;  // >30 м
          /* не даём спамить: не чаще 1 постановки в 300 мс с одного соединения */
          const nowC4 = Date.now();
          if (p.lastC4 && nowC4 - p.lastC4 < 300) break;
          p.lastC4 = nowC4;
          const nArr = Array.isArray(msg.n) ? msg.n.map((v) => Number(v) || 0) : [0, 1, 0];
          const ent = {
            id: 'x' + (++c4Seq),
            x: Math.round(cx * 100) / 100, y: Math.round(cy * 100) / 100,
            z: Math.round(cz * 100) / 100, n: nArr, by: p.id, at: Date.now(), to: null
          };
          /* максимум 40 живых С4: переполнение — старейшая взрывается сразу */
          if (worldObjs.c4.length >= 40) {
            const old = worldObjs.c4.shift();
            if (old && old.to) clearTimeout(old.to);
            c4SrvExplode(old);
          }
          worldObjs.c4.push(ent);
          markDirty();   // бомба переживает рестарт (остаток фьюза — от at)
          scheduleC4Boom(ent);
          broadcast({ t: 'c4placed', id: ent.id, by: p.id,
            x: ent.x, y: ent.y, z: ent.z, n: nArr,
            ms: C4_FUSE_MS }, null);
          break;
        }
        case 'c4boom': {
          const bx = Number(msg.x), by = Number(msg.y), bz = Number(msg.z);
          if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) break;
          if (Math.abs(bx) > 5000 || Math.abs(bz) > 5000) break;
          /* ✅ v0.4.44: допуск легаси-ветки 30 м (было 12 м) — см. c4place:
             при броске дальше 12 м сервер молча игнорировал взрыв, и дом
             не ломался. Порядок поиска блоков не менялся: свой блок
             (≤2.5 м) взрывается ЕДИНОЖДЫ и позицию берёт ИЗ СЕРВЕРНОЙ
             сущности — урон всегда считается по ней */
          if (!p.state || dist2(p.state.x, p.state.z, bx, bz) > 900) break;  // >30 м
          /* ✅ v0.4.43: таймер теперь у СЕРВЕРА (см. case 'c4place'), поэтому
             клиентский 'c4boom' — только FAILSAFE и совместимость со старыми
             клиентами. Если у сервера есть этот блок (≤2.5 м) — гасим его
             серверный таймер и взрываем ЕДИНОЖДЫ (иначе было бы ДВОЙНОЕ
             повреждение: таймер сервера + заявка клиента). */
          let ent = null, bestD = 2.5 * 2.5;
          for (const c of worldObjs.c4) {
            const dd = dist2(c.x, c.z, bx, bz);
            if (dd < bestD && Math.abs((c.y || 0) - by) < 3) { bestD = dd; ent = c; }
          }
          if (ent) {
            const ei = worldObjs.c4.indexOf(ent);
            if (ei >= 0) worldObjs.c4.splice(ei, 1);
            if (ent.to) { clearTimeout(ent.to); ent.to = null; }
            markDirty();
            broadcast({ t: 'c4boom', id: ent.id, x: bx, y: by, z: bz }, null);
            c4BoomDamage(bx, by, bz, ent.by);
            console.log('[c4] взрыв (failsafe клиента) на серверном блоке ' + ent.id);
            break;
          }
          /* ЛЕГАСИ-путь (старый клиент 0.4.42 или блок до рестарта сервера):
             урон считает сервер, блок у БРОСАВШЕГО уже взорвался сам — ему
             повторный визуал не уходит. Новые клиенты 0.4.43 сюда не попадают */
          broadcast({ t: 'c4boom', x: bx, y: by, z: bz }, p.id);
          c4BoomDamage(bx, by, bz, p.id);
          break;
        }
        /* ============================================================
           ✅ v0.4.43 ТРУП-ЛУТБОКС. 'corpse' шлёт УМИРАЮЩИЙ клиент сразу
           после 'pdeath': свой инвентарь (у сервера его копии нет!) и
           координаты смерти. Сервер создаёт труп, рассылает ВСЕМ
           'corpseNew' (включая погибшего — после респауна он может
           вернуть свои вещи). Лут — 'corpseOpen' (ответ 'corpseLoot')
           и 'corpseTake' (всем 'corpseLoot' + автоскрытие пустого).
           Опустел → 'corpseGone'; ✅ v0.4.50: не залутан 10 минут →
           'corpseGone' (залутанный — 20 минут страховки); рестарт
           сервера труп переживает (world-objs.json v7).
           ============================================================ */
        case 'corpse': {
          if (!p.dead) break;                       // прислал живой — игнор
          const kx = Number(msg.x), kz = Number(msg.z);
          if (!Number.isFinite(kx) || !Number.isFinite(kz)) break;
          if (Math.abs(kx) > 5000 || Math.abs(kz) > 5000) break;
          /* защита от вранья с координатами: дальше 40 м от последнего
             состояния сервера — труп кладём там, где сервер видел игрока */
          let fx = kx, fz = kz;
          if (p.state && dist2(p.state.x, p.state.z, kx, kz) > 1600) {
            fx = p.state.x; fz = p.state.z;
          }
          const cinv = sanitizeInv(msg.inv);
          /* ✅ v0.4.54: обоймы огнестрела уходят в труп ВМЕСТЕ со стволами
             (убитый с заряженным калашом — в трупе калаш С ПАТРОНАМИ) */
          const cmags = sanitizeMags(cinv, msg.mags);
          /* ✅ v0.4.44 ПУСТОЙ ТРУП НЕ СОЗДАЁТСЯ (просьба игрока «трупы пустые
             сразу исчезают»): у погибшего не было вещей — тела в мире нет.
             Пустой труп бесполезен и только мусорит карту */
          const invAny = Object.keys(cinv).some((k) => (cinv[k] | 0) > 0);
          if (!invAny) break;
          worldObjs.corpseSeq = (worldObjs.corpseSeq | 0) + 1;
          const rec = {
            id: 'r' + worldObjs.corpseSeq,
            x: Math.round(fx * 10) / 10, z: Math.round(fz * 10) / 10,
            y: Math.round((Number(msg.y) || 0) * 10) / 10,
            n: p.name, c: p.c, inv: cinv, mags: cmags, at: Date.now()
          };
          worldObjs.corpses.push(rec);
          while (worldObjs.corpses.length > CORPSE_MAX) worldObjs.corpses.shift();
          markDirty();
          broadcast({ t: 'corpseNew', id: rec.id, x: rec.x, y: rec.y, z: rec.z,
            n: rec.n, c: rec.c, inv: rec.inv, mags: rec.mags, lt: 0,
            age: 0 }, null);
          console.log('[corpse] труп ' + rec.id + ' (' + rec.n + ') с ' +
            Object.keys(cinv).length + ' видами вещей (' + rec.x + ', ' + rec.z + ')');
          break;
        }
        /* F у трупа: сервер отвечает текущим содержимым */
        case 'corpseOpen': {
          const cc = worldObjs.corpses.find((x) => x.id === String(msg.id || ''));
          if (!cc) break;
          if (!p.state || dist2(p.state.x, p.state.z, cc.x, cc.z) > 36) break;  // >6 м
          /* ✅ v0.4.54: вместе с лутом — ОБоймы стволов (меню показывает) */
          p.send({ t: 'corpseLoot', id: cc.id, inv: cc.inv, mags: cc.mags || {} });
          break;
        }
        /* взять предмет из трупа (amt — сколько; без amt — весь стек) */
        case 'corpseTake': {
          const ct = worldObjs.corpses.find((x) => x.id === String(msg.id || ''));
          if (!ct) { p.send({ t: 'corpseDeny', id: String(msg.id || '') }); break; }
          if (!p.state || dist2(p.state.x, p.state.z, ct.x, ct.z) > 36) {
            p.send({ t: 'corpseDeny', id: ct.id });   // отошёл дальше 6 м
            break;
          }
          const it = String(msg.item || '');
          const have = ct.inv[it] || 0;
          if (!have) { p.send({ t: 'corpseDeny', id: ct.id }); break; }
          let amt = Math.max(1, Math.floor(Number(msg.amt) || have));
          amt = Math.min(amt, have);
          ct.inv[it] = have - amt;
          /* ✅ v0.4.54 СИНХРОНИЗАЦИЯ ПАТРОНОВ: из трупа уходит ОБойма
             ВМЕСТЕ со стволом (по одной на каждый взятый ствол вида) */
          if (ct.mags && Array.isArray(ct.mags[it]) && ct.mags[it].length) {
            const pop = Math.min(amt, ct.mags[it].length);
            ct.mags[it].splice(0, pop);
            if (!ct.mags[it].length) delete ct.mags[it];
          }
          ct.lt = 1;   // ✅ v0.4.50: с трупа УЖЕ лутали — TTL 20 мин вместо 10
          const cempty = !Object.keys(ct.inv).some((k) => (ct.inv[k] | 0) > 0);
          markDirty();
          if (cempty) {
            worldObjs.corpses.splice(worldObjs.corpses.indexOf(ct), 1);
            markDirty();
            broadcast({ t: 'corpseGone', id: ct.id }, null);
            console.log('[corpse] труп ' + ct.id + ' (' + ct.n + ') обыскан и убран');
          } else {
            broadcast({ t: 'corpseLoot', id: ct.id, inv: ct.inv, mags: ct.mags || {},
              pid: p.id, item: it, amt: amt, tid: String(msg.tid || '') }, null);
          }
          break;
        }
        /* ✅ v0.4.5 ПВП: заявка попадания. ХП — АВТОРИТЕТ СЕРВЕРА:
           пуля ≤20 по умолчанию (шутер в 130 м), удар инструментом ≤10 (в 6 м).
           ✅ v0.4.36: потолок урона ПО ОРУЖИЮ (msg.w): дробовик до 96 (8 дробин),
           револьвер-карабин 3× до 45 (снайпер), томпсон 12 — раньше всё резалось
           до 20, и дробовик не мог убить с одного выстрела. Убил → pdeath всем;
           труп ждёт prespawn от жертвы */
        case 'phit': {
          const target = players.get(String(msg.tid || ''));
          if (!target || !target.state || target.dead) break;
          /* ✅ v0.4.22 ФИКС «ИГРОКИ НЕ УМИРАЮТ»: урон не применяется только
             к соединению с ВКЛЮЧЁННЫМ тумблером бессмертия (op:'god').
             Раньше защищался любой игрок с админским BRIX-ID — при тесте
             в двух вкладках у обеих ОДИН аккаунт, и «второй игрок» был
             неуязвим всегда, даже с выключенным бессмертием */
          if (target.god) break;
          if (!p.state) break;
          /* ✅ v0.5.0 ПВП-АРЕНА: СВОИХ НЕ УБИВАЕМ — на «Полигоне» все
             игроки одна команда СТАЛЬ (синие), урон игрок-в-игрока
             полностью блокируется (боты свои тоже не трогают) */
          if (Bots) break;
          const kind = String(msg.kind || 'shot');
          const d2 = dist2(p.state.x, p.state.z, target.state.x, target.state.z);
          if (kind === 'shot' && d2 > 130 * 130) break;      // дальше 130 м
          if (kind !== 'shot' && d2 > 6 * 6) break;          // дальше 6 м
          /* ✅ v0.4.36: потолок урона ПО ОРУЖИЮ. Клиент честно шлёт оружие в
             phit (msg.w, v0.4.28) — сверяем с таблицей. Неизвестное оружие —
             консервативный потолок 20 (как было). 'shotgun' — суммарный урон
             дроби (до 96): раньше резался до 20 — дробовик в мультиплеере
             был втрое слабее.
             ✅ v0.4.40 НОВАЯ ТАБЛИЦА УРОНА (голова/тело = голова/2):
             потолки = ПОЛНЫЙ урон В ГОЛОВУ по таблице игрока — револьвер 18,
             карбиновый револьвер (револьвер-карабин 3×) 20, калаш 33,
             томпсон 23, дробовик 104 (8 дробин × 13 в упор).
             ✅ v0.4.40 и БЛИЖНИЙ БОЙ поднят с 10: у каждого инструмента свой
             потолок (каменный топор 13, каменная кирка 14, железные 24,
             БУЛАВА 97) — раньше булава не пробивала бы и 97/10 */
          const SHOT_CAP = { shotgun: 104, rev3x: 20, ak: 33, thompson: 23, revolver: 18,
            c4: 250 };   /* ✅ v0.4.41: С4 в режиме вкладок — взрыв убивает; в
            серверном режиме урон С4 считает сам сервер (case 'c4boom'),
            phit 'c4' туда не доходит */
          const MELEE_CAP = { axe: 13, pickaxe: 14, ironAxe: 24, ironPickaxe: 24, mace: 97,
            c4: 250 };   /* ✅ v0.4.41: и в ближнем бою на всякий случай */
          const cap = kind === 'shot'
            ? (SHOT_CAP[String(msg.w || '')] || 20)
            : (MELEE_CAP[String(msg.w || '')] || 10);
          const dmg = Math.max(0, Math.min(cap,
            Math.floor(Number(msg.dmg) || 0)));
          if (!dmg) break;
          target.hp = Math.max(0, (target.hp === undefined ? 100 : target.hp) - dmg);
          /* ✅ v0.4.28: в phit тоже едет оружие и дистанция — жертва в
             момент смерти сразу видит их в меню смерти.
             ✅ v0.4.40: + hs — «В ГОЛОВУ» в меню смерти жертвы */
          const w = String(msg.w || '');
          const hs = msg.hs ? 1 : 0;
          broadcast({ t: 'phit', tid: target.id, hp: target.hp,
            by: p.id, kind, w, hs, dist: Math.round(Math.sqrt(d2)) }, null);
          if (target.hp <= 0) {
            target.dead = true;
            broadcast({ t: 'pdeath', tid: target.id, by: p.id, w, hs,
              dist: Math.round(Math.sqrt(d2)) }, null);
            /* ✅ v0.5.3 АРЕНА: килл подтверждён — игрок может забрать
               награду (полное хп через 'kreward', патроны — у клиента) */
            if (Bots) p.lastRewardAt = Date.now();
            console.log('[mp] ' + p.name + ' убил ' + target.name +
              (kind === 'shot' ? ' (выстрел)' : ' (инструментом)'));
          }
          break;
        }
        /* ============================================================
           ✅ v0.4.46 ШПРИЦ (+46 хп): клиент укололся — ХП АВТОРИТЕТ
           СЕРВЕРА. Валидация: жив, не бог, не чаще раза в 4 с, не больше
           60 за раз. Остальным уходит 'phit' kind 'heal' — полоска хп
           над головой подрастает у всех
           ============================================================ */
        case 'heal': {
          if (p.dead || p.god) break;
          const n = Math.max(0, Math.min(60, Math.round(Number(msg.n) || 0)));
          if (!n) break;
          const nowHeal = Date.now();
          if (p.lastHeal && nowHeal - p.lastHeal < 4000) break;   // анти-спам
          p.lastHeal = nowHeal;
          const hpOld = Math.round(p.hp === undefined ? 100 : p.hp);
          p.hp = Math.min(100, hpOld + n);
          if (p.hp !== hpOld) {
            broadcast({ t: 'phit', tid: p.id, hp: Math.round(p.hp),
              kind: 'heal', by: '' }, p.id);
            console.log('[mp] ' + p.name + ' укололся шприцем: ' +
              hpOld + ' → ' + Math.round(p.hp));
          }
          break;
        }
        /* ============================================================
           ✅ v0.5.3 АРЕНА «ПОЛИГОН»: НАГРАДА ЗА КИЛЛ — полное хп.
           Клиент шлёт 'kreward' сразу после подтверждённого килла
           (бота — killBot ставит p.lastRewardAt, игрока — case 'phit').
           Сервер применяет ТОЛЬКО если килл был недавно (< 4 с) —
           анти-спам; в BrixLand (без ботов) кейс игнорируется.
           Патроны клиентские: обойма пополняется у клиента в
           arenaKillReward (gameworld.js)
           ============================================================ */
        case 'kreward': {
          if (!Bots || p.dead) break;
          if (!p.lastRewardAt || Date.now() - p.lastRewardAt > 4000) break;
          p.lastRewardAt = 0;
          p.hp = 100;
          broadcast({ t: 'phit', tid: p.id, hp: 100, kind: 'heal', by: '' }, p.id);
          console.log('[bots] ' + p.name + ' — награда за килл: полное хп');
          break;
        }
        /* ============================================================
           ✅ v0.4.46 СОХРАНЕНИЕ ИГРОКА: клиент присылает раз в 3 с и при
           выходе {x,y,z,yaw,hp,hot,inv:[{id,n,mag}]}. Сервер валидирует и
           кладёт в players.json под BRIX-ID. Мёртвый сохранение не пишет
           (и старое стёрто при pdeath — вещи ушли в труп)
           ============================================================ */
        case 'psave': {
          if (!p.aid || p.dead) break;
          const sx = Number(msg.x), sy = Number(msg.y), sz = Number(msg.z);
          if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(sz) ||
              Math.abs(sx) > 5000 || Math.abs(sz) > 5000) break;
          /* ✅ v0.4.60: sk — скин слота («костюм» с аккаунта) доезжает
             вместе с вещами; некупленный/неизвестный отбрасывается ниже,
             в клиенте (BrixWeaponSkins.isSkinned) */
          const inv = Array.isArray(msg.inv) ? msg.inv.slice(0, 26).map((it) => ({
            id: String((it && it.id) || '').slice(0, 24),
            n: Math.max(1, Math.min(9999, Math.floor(Number(it && it.n) || 1))),
            mag: Math.max(0, Math.min(999, Math.floor(Number(it && it.mag) || 0))),
            sk: (it && it.sk) ? String(it.sk).slice(0, 24) : undefined
          })).filter((it) => it.id) : [];
          playerSaves.set(p.aid, {
            x: Math.round(sx * 100) / 100, y: Math.round(Math.max(-50, Math.min(500, sy)) * 100) / 100,
            z: Math.round(sz * 100) / 100,
            yaw: Math.round((Number(msg.yaw) || 0) * 100) / 100,
            hp: Math.max(1, Math.min(100, Math.round(Number(msg.hp) || 100))),
            hot: Math.max(0, Math.min(5, Math.floor(Number(msg.hot) || 0))),
            inv: inv, at: Date.now()
          });
          touchSocial(p, true);   // ✅ v0.4.62: реестр — «был в сети только что»
          markPlayersDirty();
          break;
        }
        /* ✅ v0.4.62 СПИСОК ВСЕХ ИГРОКОВ (вкладка «ВСЕ ИГРОКИ» в друзьях):
           реестр social.json + кто в сети сейчас. Ответ 'plist':
           list [{ id, name, on, ls }] — ls = был в сети (мс) */
        case 'plist': {
          const seen = {};
          const list = [];
          players.forEach((t) => {
            if (t.aid) {
              seen[t.aid] = true;
              list.push({ id: t.aid, name: t.name, on: 1, ls: Date.now() });
            }
          });
          socialReg.forEach((v, k) => {
            if (seen[k]) return;
            list.push({ id: k, name: v.name || 'Игрок', on: 0,
              ls: Math.min(Date.now(), Number(v.ls) || 0) });
          });
          list.sort((a, b2) => b2.ls - a.ls);
          p.send({ t: 'plist', list: list.slice(0, 300) });
          break;
        }
        /* ✅ v0.4.5: жертва сама сообщает о своей смерти (надёжнее, чем
           выводить по hp=0 у стрелка) — рассылаем остальным.
           ✅ v0.4.46: при смерти СОХРАНЕНИЕ ИГРОКА СТИРАЕТСЯ — весь
           инвентарь ушёл в труп-лутбокс; при следующем входе игрок
           начнёт с чистого спавна и стартового набора */
        case 'pdeath': {
          /* ✅ v0.4.52 ФИКС БЕССМЕРТИЯ: god-соединение не может «умереть»
             и по своему же сообщению (клиент при god урон от падения
             не шлёт — gameworld.js; тут двойная защита от читов/лагов:
             pdeath от бога игнорируется, сохранение не стирается) */
          if (msg.tid === p.id && p.god) break;
          if (msg.tid === p.id) {
            p.dead = true;
            p.hp = 0;
            if (p.aid && playerSaves.has(p.aid)) {
              playerSaves.delete(p.aid);
              markPlayersDirty();
              console.log('[players] ' + p.name + ' умер — сохранение стёрто (вещи в трупе)');
            }
          }
          broadcast({ t: 'pdeath', tid: String(msg.tid || p.id),
            by: String(msg.by || '') }, p.id);
          break;
        }
        /* ✅ v0.4.5: возрождение — хп восстанавливает СЕРВЕР.
           ✅ v0.4.34: холод тоже сбрасывается — нового игрока ничего не морозит */
        case 'prespawn': {
          p.dead = false;
          p.hp = 100;
          p.cold = 0;
          broadcast({ t: 'prespawn', tid: p.id }, p.id);
          break;
        }
        /* ============================================================
           ✅ v0.4.44 УРОН ОТ ВЫСОТЫ: урон падения считает КЛИЕНТ (высоту
           падения сервер не видит), поэтому жертва честно шлёт 'fdmg'
           {dmg} — сервер применяет урон ТОЛЬКО К НЕМУ САМОМУ (максимум
           100, убить другого нельзя), остальным уходит 'phit' kind 'fall'
           (полоска хп над головой) и 'pdeath' при 0. Умер от падения —
           в меню смерти «Ты разбился насмерть»
           ============================================================ */
        case 'fdmg': {
          if (p.dead || p.god) break;
          const fdist = Math.round(Number(msg.dist) || 0);
          const fdmg = Math.max(0, Math.min(100, Math.round(Number(msg.dmg) || 0)));
          if (!fdmg) break;
          p.hp = Math.max(0, (p.hp === undefined ? 100 : p.hp) - fdmg);
          broadcast({ t: 'phit', tid: p.id, hp: Math.round(p.hp),
            by: '', kind: 'fall', w: 'fall', dist: fdist }, p.id);
          if (p.hp <= 0) {
            p.dead = true;
            broadcast({ t: 'pdeath', tid: p.id, by: '', w: 'fall', fall: 1 }, null);
            console.log('[fall] ' + p.name + ' разбился насмерть (падение ' + fdist + ' м)');
          } else {
            console.log('[fall] ' + p.name + ' упал с ' + fdist + ' м (-' + fdmg + ' хп)');
          }
          break;
        }
        /* ✅ fix v0.4.30: ветка 'bhit' для ПОСТРОЕК перенесена в общий
           case 'bhit' выше (рядом с бочками). Здесь был ВТОРОЙ case 'bhit'
           — JavaScript его НИКОГДА не выполнял (первый совпавший case
           выигрывает), поэтому постройки не ломались */
        /* ✅ v0.4.6 СТРОИТЕЛЬСТВО: заявка установки (фундамент/стена/потолок).
           Сервер проверяет правила (стена — только на край фундамента,
           потолок — только где есть стена) и рассылает результат ВСЕМ,
           включая поставившего (тот уже поставил у себя оптимистично —
           повтор не задвоится: ключ клетки/края тот же) */
        case 'bplace': {
          const res = applyPlace(p, msg);
          if (res && res.b) {
            // ✅ v0.4.10: замена (стена→окно/проём, проём→дверь) —
            // сначала всем снос старой детали, потом новая постройка
            if (res.old) broadcast({ t: 'brem', id: res.old }, null);
            broadcast({ t: 'bnew', pid: p.id, b: res.b }, null);
            // ✅ v0.4.9: постройка пишется на диск СРАЗУ (не через дебаунс
            // 800 мс) — даже kill -9 сразу после установки ничего не теряет
            writeWorldNow();
          } else {
            p.send({ t: 'bdeny', tid: msg.tid || '', why: res || 'bad' });
          }
          break;
        }
        /* ✅ v0.4.10 ДВЕРЬ (F): открыть/закрыть. Решает СЕРВЕР: чужой
           закрытый замок не откроет; владелец и разгадавшие — могут */
        case 'btog': {
          const d = worldObjs.builds.find((b) => b.id === String(msg.id || '') && b.ty === 'dr');
          if (!d) break;
          /* ✅ fix 0.4.11: владелец узнаётся в ОБОИХ формах ключа — новый
             BRIX-ID и старый «n:ник» (двери из прошлых сессий, когда
             клиент ещё не слал aid). Раньше после появления ID сервер
             отказывал СОБСТВЕННИКУ в открытии его двери */
          const ownT = (d.own === p.aid) || (d.own === ('n:' + p.name));
          const unlT = d.unl && ((p.aid && d.unl[p.aid]) || d.unl['n:' + p.name]);
          /* ✅ v0.4.15: админ открывает ЛЮБУЮ дверь, даже с чужим кодом */
          if (d.code && !ownT && !unlT && !isAdminP(p)) {
            p.send({ t: 'bdeny-d', id: d.id });   // чужой и не разгадал
            break;
          }
          d.open = d.open ? 0 : 1;
          broadcast({ t: 'bdoor', id: d.id, open: d.open }, null);
          markDirty();
          writeWorldNow();
          console.log('[build] ' + p.name + ' ' + (d.open ? 'открыл' : 'закрыл') + ' дверь ' + d.id);
          break;
        }
        /* ✅ v0.4.10: ВЛАДЕЛЕЦ задаёт/меняет код (4 цифры). Смена кода
           сбрасывает «разгаданность» у ВСЕХ — лампа горит красным */
        case 'bcode': {
          const d = worldObjs.builds.find((b) => b.id === String(msg.id || '') && b.ty === 'dr');
          if (!d) break;
          /* ✅ fix 0.4.11: код ставит владелец — в ОБОИХ формах ключа */
          if (!((d.own === p.aid) || (d.own === ('n:' + p.name)))) break;
          const code = String(msg.code || '').replace(/\D/g, '').slice(0, 4);
          if (code.length !== 4) break;
          d.code = code;
          d.unl = {};                            // все вводят заново
          broadcast({ t: 'block', id: d.id, hc: 1 }, null);
          markDirty();
          writeWorldNow();
          console.log('[build] ' + p.name + ' задал код замка ' + d.id);
          break;
        }
        /* ✅ v0.4.10: ЧУЖОЙ вводит код. Верный → игрок навсегда вписывается
           в «разгадавшие» (живёт на сервере по BRIX-ID), дверь открывается;
           неверный → bcodedeny */
        case 'btry': {
          const d = worldObjs.builds.find((b) => b.id === String(msg.id || '') && b.ty === 'dr');
          if (!d) break;
          /* ✅ fix 0.4.11: «разгаданность» пишем под СТАБИЛЬНЫМ ключом
             (BRIX-ID), но узнаём и по старому «n:ник» — после перезахода
             код заново НЕ спрашивается, даже если ключ поменялся */
          const code = String(msg.code || '').replace(/\D/g, '').slice(0, 4);
          if (!d.code || code !== d.code) {
            p.send({ t: 'bcodedeny', id: d.id });
            break;
          }
          if (!d.unl) d.unl = {};
          const unlKey = p.aid || ('n:' + p.name);
          d.unl[unlKey] = 1;
          if (p.aid) d.unl['n:' + p.name] = 1;   // совместимость со старыми ключами
          d.open = 1;
          broadcast({ t: 'bdoor', id: d.id, open: 1 }, null);
          p.send({ t: 'dunl', id: d.id });
          markDirty();
          writeWorldNow();
          console.log('[build] ' + p.name + ' разгадал код замка ' + d.id + ' — дверь открыта');
          break;
        }
        /* ✅ v0.4.11 ДОБОР ПОСТРОЕК: клиент при входе прислал записи с
           ЛОКАЛЬНЫМ id («L…») — сервер их НИКОГДА не подтверждал. Так
           бывает, когда сервер потерял world-objs.json (перенос папки,
           сбой): дом у игрока ВИДЕН из бэкапа, но сервер отказывает в
           каждой стене («нет фундамента»). Сервер добирает свободные
           клетки/края (сервер ГЛАВНЕЕ: занятые пропускаются), рассылает
           bnew всем и сразу пишет на диск */
        case 'badopt': {
          /* ✅ v0.4.13: ЗАЩИТА ОТ ВОСКРЕШЕНИЯ ОЧИЩЕННЫХ ПОСТРОЕК.
             Клиент хранит бэкап построек в localStorage и при входе
             предлагает его серверу (badopt). Если бэкап из СТАРОГО
             поколения мира (msg.ep меньше текущего epoch, повышаемого
             CLEAR-BUILDS.bat) — сервер отказывает и шлёт bwipe:
             клиент сам выкидывает устаревшие постройки из бэкапа.
             epoch=0 на сервере (свежий мир после сбоя) — добор работает
             как раньше, «спасение» дома при потере файла не тронуто */
          const clEp = Math.round(Number(msg.ep)) | 0;
          const svEp = worldObjs.epoch | 0;
          if (svEp > 0 && clEp < svEp) {
            p.send({ t: 'bwipe', ep: svEp });
            console.log('[build] отклонил устаревший бэкап ' + p.name +
              ' (бэкап epoch ' + clEp + ', мир epoch ' + svEp +
              ' — постройки были очищены)');
            break;
          }
          const list = Array.isArray(msg.list) ? msg.list.slice(0, 400) : [];
          if (!list.length) break;
          /* ✅ v0.4.62: надгробия — сломанное игроком из бэкапа НЕ добирается.
             Раньше: бэкап localStorage не чистился при brem, при перезаходе
             клиент предлагал сломанное назад — постройка воскресала у всех */
          const tombBefore = list.length;
          const aliveList = list.filter((r) =>
            !r || !Array.isArray(worldObjs.btomb) ||
            worldObjs.btomb.indexOf(String(r.id || '')) === -1);
          if (!aliveList.length) {
            console.log('[build] ' + p.name + ': бэкап целиком из надгробий (' +
              tombBefore + ' шт.) — сломанное не воскресает');
            break;
          }
          if (aliveList.length !== tombBefore) {
            console.log('[build] ' + p.name + ': отброшено сломанных из бэкапа: ' +
              (tombBefore - aliveList.length) + ' (надгробия)');
          }
          /* ✅ порядок добора: сначала фундаменты, потом краевые детали,
             потом потолки/лестницы — СТРОГО (нельзя order[ty] || 9: ноль «фундамент»
             фальсив и улетал в конец — дверь добиралась раньше фундамента
             и отбрасывалась как «без фундамента»).
             ✅ v0.4.44: + лестницы (ld, ранг 2), печки (fu, ранг 3 —
             свободные, в конце); lv1-детали добираются в общем порядке */
          const order = { f: 0, w: 1, wi: 1, dw: 1, dr: 1, c: 2, ld: 2, fu: 3 };
          const rank = (ty) => Object.prototype.hasOwnProperty.call(order, ty) ? order[ty] : 9;
          aliveList.sort((a, b2) => rank(a.ty) - rank(b2.ty));
          let adopted = 0;
          for (const raw of aliveList) {
            const ty2 = String(raw.ty || '');
            const gx2 = Math.round(Number(raw.gx) | 0);
            const gz2 = Math.round(Number(raw.gz) | 0);
            if (!Number.isFinite(gx2) || !Number.isFinite(gz2)) continue;
            const top2 = Math.max(-20, Math.min(300, Number(raw.top) || 0));
            const by2 = String(raw.by || p.name).slice(0, 16);
            const now2 = Date.now();
            if (ty2 === 'f') {
              const key2 = gx2 + ',' + gz2;
              const cell2 = buildCell.get(key2);
              if (cell2 && cell2.f) continue;           // сервер уже знает
              const rec2 = { id: 'b' + (++buildSeq), ty: 'f', gx: gx2, gz: gz2,
                top: top2, by: by2, at: now2 };
              worldObjs.builds.push(rec2);
              if (!buildCell.has(key2)) buildCell.set(key2, {});
              buildCell.get(key2).f = rec2;
              broadcast({ t: 'bnew', pid: p.id, b: publicBuild(rec2) }, null);
              adopted++;
            } else if (ty2 === 'w' || ty2 === 'wi' || ty2 === 'dw' || ty2 === 'dr') {
              const e2 = Math.max(0, Math.min(3, Number(raw.e) | 0));
              const lv2 = (raw.lv === 1 && ty2 === 'w') ? 1 : 0;   /* ✅ v0.4.44: 2 этаж — только сплошная стена */
              if (raw.lv === 1 && ty2 !== 'w') continue;          /* окна/двери 2 этажа не добираем */
              const ce2 = canonicalEdge(gx2, gz2, e2);
              const ekey2 = edgeKey(ce2.gx, ce2.gz, ce2.e, lv2);
              if (buildEdge.has(ekey2)) continue;       // край занят — сервер главнее
              let baseTop2;
              if (lv2 === 1) {
                /* стена 2 этажа: нужен ПОТОЛОК 1 этажа в клетке-якоре */
                const cellC2 = buildCell.get(gx2 + ',' + gz2);
                if (!cellC2 || !cellC2.c) continue;
                baseTop2 = Math.round((cellC2.c.rec.top + CEIL_T) * 100) / 100;
              } else {
                const cell3 = buildCell.get(gx2 + ',' + gz2);
                if (!cell3 || !cell3.f) continue;         // фундамента нет — не принимаем
                baseTop2 = cell3.f.top;
              }
              const rec3 = ty2 === 'dr'
                ? { id: 'b' + (++buildSeq), ty: 'dr', gx: gx2, gz: gz2, e: e2,
                    top: baseTop2, by: by2, at: now2,
                    own: String(raw.own || p.aid || ('n:' + p.name)).slice(0, 32),
                    open: raw.open ? 1 : 0, code: null, unl: {} }
                : { id: 'b' + (++buildSeq), ty: ty2, gx: ce2.gx, gz: ce2.gz, e: ce2.e,
                    lv: lv2, top: baseTop2, by: by2, at: now2 };
              worldObjs.builds.push(rec3);
              buildEdge.set(ekey2, rec3);
              broadcast({ t: 'bnew', pid: p.id, b: publicBuild(rec3) }, null);
              adopted++;
            } else if (ty2 === 'c') {
              const key3 = gx2 + ',' + gz2;
              const lv3 = (raw.lv === 1) ? 1 : 0;
              const cell4 = buildCell.get(key3);
              if (lv3 === 1) {
                /* потолок 2 этажа: нужен потолок 1 этажа + стена 2 этажа */
                if (!cell4 || !cell4.c) continue;
                if (cell4.c1) continue;
                if (!hasWallLv1(gx2, gz2)) continue;
                const rec5 = { id: 'b' + (++buildSeq), ty: 'c', gx: gx2, gz: gz2, lv: 1,
                  top: Math.round((cell4.c.rec.top + CEIL_T + WALL_H) * 100) / 100,
                  by: by2, at: now2 };
                worldObjs.builds.push(rec5);
                cell4.c1 = rec5;
                broadcast({ t: 'bnew', pid: p.id, b: publicBuild(rec5) }, null);
                adopted++;
              } else {
                if (!cell4 || !cell4.f) continue;
                if (cell4.c) continue;
                if (!hasWallOnCell(gx2, gz2)) continue;
                const rec4 = { id: 'b' + (++buildSeq), ty: 'c', gx: gx2, gz: gz2,
                  top: Math.round((cell4.f.top + WALL_H) * 100) / 100,
                  by: by2, at: now2 };
                worldObjs.builds.push(rec4);
                cell4.c = rec4;
                broadcast({ t: 'bnew', pid: p.id, b: publicBuild(rec4) }, null);
                adopted++;
              }
            } else if (ty2 === 'ld') {
              /* ✅ v0.4.44 лестница: клетка фундамента без потолка */
              const keyL2 = gx2 + ',' + gz2;
              const cellL2 = buildCell.get(keyL2);
              if (!cellL2 || !cellL2.f) continue;
              if (cellL2.ld || cellL2.c) continue;
              const recL2 = { id: 'b' + (++buildSeq), ty: 'ld', gx: gx2, gz: gz2,
                top: cellL2.f.top, by: by2, at: now2 };
              worldObjs.builds.push(recL2);
              cellL2.ld = recL2;
              broadcast({ t: 'bnew', pid: p.id, b: publicBuild(recL2) }, null);
              adopted++;
            } else if (ty2 === 'fu') {
              /* ✅ v0.4.44 печка: свободная позиция (cont/on из бэкапа) */
              const fx2 = Number(raw.x), fz2 = Number(raw.z), fy2 = Number(raw.y);
              if (!Number.isFinite(fx2) || !Number.isFinite(fz2) || !Number.isFinite(fy2)) continue;
              let clashF2 = false;
              worldObjs.builds.forEach((b3) => {
                if (b3.ty !== 'fu') return;
                const dx3 = b3.x - fx2, dz3 = b3.z - fz2;
                if (dx3 * dx3 + dz3 * dz3 < 1.44) clashF2 = true;
              });
              if (clashF2) continue;
              const recF2 = { id: 'b' + (++buildSeq), ty: 'fu',
                x: Math.round(fx2 * 100) / 100, z: Math.round(fz2 * 100) / 100,
                y: Math.round(fy2 * 100) / 100,
                rot: Math.round((Number(raw.rot) || 0) * 100) / 100,
                by: by2, at: now2,
                own: String(raw.own || p.aid || ('n:' + p.name)).slice(0, 32),
                cont: (raw.cont && typeof raw.cont === 'object') ? sanitizeInv(raw.cont) : {},
                on: raw.on ? 1 : 0 };
              worldObjs.builds.push(recF2);
              broadcast({ t: 'bnew', pid: p.id, b: publicBuild(recF2) }, null);
              adopted++;
            }
          }
          if (adopted > 0) {
            markDirty();
            writeWorldNow();
            console.log('[build] добрал ' + adopted + ' постр. из бэкапа ' + p.name +
              ' (прислано ' + list.length + ')');
          }
          break;
        }
      }
    },
    () => dropSocket(p)
  );

  sock.on('data', (buf) => {
    // ✅ v0.3.4: ЛЮБОЙ пакет (в т.ч. pong от фона) = игрок жив.
    // Раньше фоновая вкладка переставала слать состояния и её выбрасывало
    // по таймауту, хотя она была в игре — счётчик уменьшался зря.
    p.last = Date.now();
    feed(buf);
  });
  sock.on('error', () => dropSocket(p));
  sock.on('close', () => dropSocket(p));

  // ping каждые 25 с — чтобы браузеры не рвали соединение
  const pingTimer = setInterval(() => {
    try { sock.write(Buffer.from([0x89, 0x00])); } catch (e) { clearInterval(pingTimer); }
  }, 25000);
  sock.on('close', () => clearInterval(pingTimer));
  sock.on('error', () => clearInterval(pingTimer));
});

/* таймауты: молчунов выбрасываем из ростера (как в Rust) */
setInterval(() => {
  const now = Date.now();
  const dead = [];
  players.forEach((p) => { if (now - p.last > PLAYER_TIMEOUT) dead.push(p); });
  dead.forEach((p) => dropPlayer(p, 'таймаут'));
}, 5000);

/* ✅ v0.5.0 БОТЫ «ПОЛИГОНА»: шаг сима + рассылка 'bots' 10 Гц
   (только реалм brixpvp — в BrixLand ботов нет) */
if (Bots) setInterval(() => {
  try { Bots.tick(0.1); } catch (eBots) {
    console.log('[bots] ошибка шага сима (сервер работает дальше): ' + eBots.message);
  }
}, 100);

/* ============================================================
   ✅ v0.4.34 ХОЛОД (зимний апдейт, этап 1) — АВТОРИТЕТ СЕРВЕРА.
   Зима = высокие горы со снегом. Высоту рельефа сервер считает
   САМ по детерминированной формуле heightAt — она 1:1 скопирована
   из js/game/terrain.js (как и формула чекблоков, «одна формула
   у сервера и клиента»). Менять высоту можно ТОЛЬКО в обоих файлах
   сразу, иначе зима у сервера и клиента разъедется.
   Шкала холода 0..100:
     • в зиме растёт — чем выше/снежнее (zoneK 0..1), тем быстрее;
     • в тепле (ниже снеговой линии) тает по чуть-чуть сама;
     • с 30 холода ХП тает тем быстрее, чем больше шкала;
     • умер от холода → 'pdeath' с cold:1 (в меню смерти «Замёрз»);
     • 'phit' с kind:'cold' уходит ОСТАЛЬНЫМ — у них честно падает
       полоска хп жертвы (самой жертве хп едет в 'cold');
     • respawn сбрасывает холод; god (бессмертие) защищает от урона.
   ============================================================ */

/* --- детерминированный шум (копия js/game/noise.js, 1:1) --- */
function brixHash2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function brixValueNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const a = brixHash2(ix, iz, seed);
  const b = brixHash2(ix + 1, iz, seed);
  const c = brixHash2(ix, iz + 1, seed);
  const d = brixHash2(ix + 1, iz + 1, seed);
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function brixFbm(x, z, seed, octaves) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += brixValueNoise(x * freq, z * freq, seed + i * 101) * amp;
    norm += amp; amp *= 0.5; freq *= 2;
  }
  return sum / norm;
}
function brixRidged(x, z, seed, octaves) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    let v = 1 - Math.abs(2 * brixValueNoise(x * freq, z * freq, seed + i * 131) - 1);
    v *= v;
    sum += v * amp;
    norm += amp; amp *= 0.5; freq *= 2.03;
  }
  return sum / norm;
}
function brixGauss(x, z, cx, cz, sigma) {
  const dx = x - cx, dz = z - cz;
  return Math.exp(-(dx * dx + dz * dz) / (2 * sigma * sigma));
}
function brixSmoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function brixLerp(a, b, t) { return a + (b - a) * t; }

/* --- высота рельефа (копия heightAt из js/game/terrain.js, 1:1) --- */
const COLD_WORLD_HALF = 450;         // WORLD_SIZE 900 / 2
const S_HILLS = 1013, S_DETAIL = 2027, S_MOUNT_MASK = 3041,
  S_MOUNT = 4051;                    // сиды слоёв шума — как в terrain.js
function brixHeightAt(x, z) {
  const r = Math.sqrt(x * x + z * z) / COLD_WORLD_HALF;

  const spawnBlend = brixSmoothstep(0.14, 0.3, r);

  const hills = (brixFbm(x * 0.012, z * 0.012, S_HILLS, 4) - 0.45) * 30;
  const detail = (brixFbm(x * 0.05, z * 0.05, S_DETAIL, 3) - 0.5) * 3.5;

  const mountMask = brixSmoothstep(0.55, 0.82,
    r + (brixFbm(x * 0.005 + 7.3, z * 0.005 + 2.9, S_MOUNT_MASK, 3) - 0.5) * 0.55);
  const ridge = Math.pow(brixRidged(x * 0.006, z * 0.006, S_MOUNT, 4), 1.3) * 72;

  const peaks =
    56 * brixGauss(x, z, -230, -150, 95) +
    64 * brixGauss(x, z, 255, -230, 105) +
    42 * brixGauss(x, z, -130, 255, 85);

  const lakeG = brixGauss(x, z, 170, 150, 110);
  const lakeMask = brixSmoothstep(0.15, 0.7, lakeG);

  let h = 5 + spawnBlend * (hills + detail) * (1 - lakeMask * 0.85);
  h += ridge * mountMask;
  h += peaks * brixSmoothstep(0.25, 0.45, r);
  h -= 18 * lakeG;

  const edge = brixSmoothstep(0.88, 1.02, r);
  h = brixLerp(h, -7, edge);

  return h;
}

/* --- параметры холода --- */
const COLD_TICK_MS = 1000;      // пуш 'cold' раз в секунду
const COLD_RATE = 1.4;          // набег холода в секунду при полной зиме (0→100 ~ 71с)
const WARM_RATE = 1.25;         // оттаивание в секунду в тепле (100→0 ~ 80с, «по чуть-чуть»)
const COLD_DMG_FROM = 30;       // с этого холода начинается урон по ХП
const COLD_DPS_MAX = 1.2;       // ХП/сек при шкале 100 (при 30 — всего 0.36)
const COLD_ZONE_FROM = 44;      // снеговая линия — как snowK в terrain.js
const COLD_ZONE_TO = 58;        // выше — полная зима
const COLD_ZONE_MIN = 0.15;     // слабее — считается теплом (шкала тает)

setInterval(() => {
  players.forEach((p) => {
    if (!p.state || p.dead) return;
    const st = p.state;
    const zoneK = brixSmoothstep(COLD_ZONE_FROM, COLD_ZONE_TO,
      brixHeightAt(Number(st.x) || 0, Number(st.z) || 0));
    if (zoneK > COLD_ZONE_MIN) {
      /* ✅ v0.4.51: НОЧЬЮ В ЗИМЕ мороз усиливается ×2 — фаза суток
         тикает на сервере (envState), у всех игроков одинаково;
         днём/на рассвете — обычная скорость */
      p.cold = Math.min(100, (p.cold || 0) + COLD_RATE * zoneK * envNightFactor());
    } else {
      /* в тепле: шкала по чуть-чуть тает — в тепле исчезает полностью */
      p.cold = Math.max(0, (p.cold || 0) - WARM_RATE);
    }
    let hpMsg = null;
    if (p.cold >= COLD_DMG_FROM && !p.god) {
      /* урон растёт вместе со шкалой: 30 холода = 0.36 хп/с, 100 = 1.2 хп/с */
      p.hp = Math.max(0, (p.hp === undefined ? 100 : p.hp) -
        (p.cold / 100) * COLD_DPS_MAX);
      hpMsg = Math.round(p.hp);
      if (p.hp <= 0) {
        p.dead = true;
        /* ✅ холод убил — pdeath уходит ВСЕМ включая жертву (by пустой,
           cold:1 — в меню смерти «Ты замёрз насмерть», без килфида) */
        broadcast({ t: 'pdeath', tid: p.id, by: '', cold: 1 }, null);
        console.log('[cold] ' + p.name + ' замёрз насмерть (холод ' +
          Math.round(p.cold) + ')');
      } else {
        /* остальным — остаток хп жертвы (полоска над головой);
           самой жертве не шлём: у неё хп в 'cold' (без красной вспышки) */
        broadcast({ t: 'phit', tid: p.id, hp: hpMsg, kind: 'cold', by: '' }, p.id);
      }
    }
    p.send({ t: 'cold', v: Math.round(p.cold * 10) / 10,
      z: Math.round(zoneK * 100) / 100, hp: hpMsg });
  });
}, COLD_TICK_MS);

/* ============================================================
   ✅ v0.4.51 СУТКИ И ПОГОДА — АВТОРИТЕТ СЕРВЕРА.
   Время суток ТИКАЕТ ТОЛЬКО ЗДЕСЬ (на сервере), а не у игроков —
   все видят одну и ту же фазу, погоду и рассвет одновременно:
     • РАССВЕТ 2 мин → ДЕНЬ 12 мин → ЗАКАТ 3 мин → СУМЕРКИ 1.5 мин
       → НОЧЬ 10 мин (полный цикл 28.5 минут);
     • ПОГОДА: ясно 20 мин ↔ ХМУРО 15 мин (тучи закрывают солнце,
       густой туман, дождь; в зиме — снег, переход плавный);
     • раз в секунду всем уходит 'dnc' {ct, wx, wt} — клиент мягко
       догоняет серверное время, часы идут синхронно у всех;
     • состояние включено в welcome (новичок сразу видит верное время);
     • цикл ПЕРЕЖИВАЕТ РЕСТАРТ СЕРВЕРА: world-env.json (как мир).
   НОЧЬЮ В ЗИМЕ холод растёт ×2 (envNightFactor в тике холода выше).
   ============================================================ */

const ENV_FILE = path.join(ROOT, 'world-env.json');

/* фазы суток (секунды) — 1:1 с js/game/environment.js
   ✅ v0.4.62: сутки = 47 минут (просьба игрока), фазы пропорциональны
   старым: рассвет 198, день ~19.8 мин, закат 297, сумерки 148, ночь 990 */
const ENV_PHASES = [
  { id: 'dawn',   dur: 198 },   // рассвет — малая фаза
  { id: 'day',    dur: 1187 },  // день — ~19.8 минут
  { id: 'sunset', dur: 297 },   // закат — ~5 минут
  { id: 'dusk',   dur: 148 },   // сумерки — малая фаза
  { id: 'night',  dur: 990 }    // ночь — 16.5 минут
];
const ENV_CYCLE_LEN = ENV_PHASES.reduce((s, p) => s + p.dur, 0);   // 2820 с = 47 минут

/* погода (секунды) */
const ENV_WX = [
  { id: 'clear',  dur: 1200 },  // ясно — 20 минут
  { id: 'gloomy', dur: 900 }    // хмуро — 15 минут
];

let envState = { ct: 0, wx: 'clear', wt: 0 };
let envDirty = false;
let envTimer = null;

function envPhaseIdAt(t) {
  let acc = 0;
  for (let i = 0; i < ENV_PHASES.length; i++) {
    acc += ENV_PHASES[i].dur;
    if (t < acc) return ENV_PHASES[i].id;
  }
  return 'night';
}
/** ×2 к холоду, когда ночь (сумерки/ночь) — считает тик холода */
function envNightFactor() {
  const id = envPhaseIdAt(envState.ct);
  return (id === 'night' || id === 'dusk') ? 2 : 1;
}
function envPublic() {
  return {
    ct: Math.round(envState.ct * 10) / 10,
    wx: envState.wx,
    wt: Math.round(envState.wt * 10) / 10
  };
}

function loadEnvNow() {
  try {
    if (!fs.existsSync(ENV_FILE)) return;
    const j = JSON.parse(fs.readFileSync(ENV_FILE, 'utf8'));
    if (!j || typeof j !== 'object') return;
    envState.ct = Math.max(0, Math.min(ENV_CYCLE_LEN, Number(j.ct) || 0));
    envState.wt = Math.max(0, Number(j.wt) || 0);
    const wxOk = ENV_WX.some((w) => w.id === j.wx);
    envState.wx = wxOk ? j.wx : 'clear';
    if (envState.wt >= (ENV_WX.find((w) => w.id === envState.wx) || ENV_WX[0]).dur) envState.wt = 0;
    console.log('[env] сутки восстановлены: ' + envPhaseIdAt(envState.ct) +
      ' (' + Math.round(envState.ct) + ' с от рассвета), погода: ' + envState.wx);
  } catch (e) { console.log('[env] не прочитал world-env.json: ' + e.message); }
}

function writeEnvNow() {
  try {
    fs.writeFileSync(ENV_FILE, JSON.stringify(envPublic()));
    envDirty = false;
  } catch (e) { console.log('[env] не сохранил world-env.json: ' + e.message); }
}

function markEnvDirty() {
  envDirty = true;
  if (envTimer) return;
  envTimer = setTimeout(() => { envTimer = null; writeEnvNow(); }, 5000);
}

loadEnvNow();

/* такт суток и погоды: раз в секунду — тикание ТОЛЬКО на сервере */
setInterval(() => {
  envState.ct += 1;
  if (envState.ct >= ENV_CYCLE_LEN) envState.ct -= ENV_CYCLE_LEN;
  envState.wt += 1;
  const curWx = ENV_WX.find((w) => w.id === envState.wx) || ENV_WX[0];
  if (envState.wt >= curWx.dur) {
    /* смена погоды: ясно ↔ хмуро (порядок из ENV_WX) */
    const idx = ENV_WX.findIndex((w) => w.id === envState.wx);
    const next = ENV_WX[(idx + 1) % ENV_WX.length];
    envState.wx = next.id;
    envState.wt = 0;
    console.log('[env] погода сменилась: ' + next.id +
      ' на ' + Math.round(next.dur / 60) + ' мин · фаза суток: ' + envPhaseIdAt(envState.ct));
  }
  /* всем игрокам: время цикла + погода (клиент рисует плавно сам) */
  if (players.size > 0) broadcast(Object.assign({ t: 'dnc' }, envPublic()), null);
  markEnvDirty();   // debounce 5 с — запись только если 5 с никто не трогал
}, 1000);

/* страховка: раз в 30 с и при остановке сервера */
setInterval(() => { if (envDirty) writeEnvNow(); }, 30000);
function saveEnvOnExit() {
  try { if (envTimer) { clearTimeout(envTimer); envTimer = null; } writeEnvNow(); } catch (e) {}
}
process.on('SIGINT', saveEnvOnExit);
process.on('SIGTERM', saveEnvOnExit);
process.on('exit', () => { try { saveEnvOnExit(); } catch (e) {} });

/* ---------- 5. Старт ---------- */

/* ✅ v0.4.29: ПОРТ ЗАНЯТ — понятная инструкция вместо молчаливого падения.
   Симптом «я 5 раз поменял server.js, а сервер всё равно СТАРЫЙ» почти
   всегда означает: старый процесс node ЖИВ (окно закрыли крестом, а
   процесс остался висеть), поэтому новый сервер НЕ МОЖЕТ занять порт
   и игра ходит в СТАРЫЙ. Раньше node падал с красной EADDRINUSE,
   которую никто не читал в консоли */
server.on('error', (e) => {
  if (e && e.code === 'EADDRINUSE') {
    const t1 = '  ПОРТ ' + PORT + ' ЗАНЯТ — СТАРЫЙ СЕРВЕР ЕЩЁ РАБОТАЕТ';
    console.log('');
    console.log('  ╔' + '═'.repeat(61) + '╗');
    console.log('  ║' + t1.padEnd(61) + '║');
    console.log('  ╚' + '═'.repeat(61) + '╝');
    console.log('  Игра сейчас ходит в СТАРЫЙ сервер — вот и «СЕРВЕР СТАРЫЙ».');
    console.log('  Новый server.js не сможет запуститься, пока жив старый процесс.');
    console.log('');
    console.log('  КАК ПОЧИНИТЬ (30 секунд):');
    console.log('    1) Ctrl+Shift+Esc (Диспетчер задач) → «Подробности» →');
    console.log('       найди ВСЕ процессы node.exe → правый клик → «Снять задачу»');
    console.log('       (или: Win+R → cmd → Enter → набрать taskkill /F /IM node.exe)');
    console.log('    2) Запусти START-MULTIPLAYER.bat заново.');
    console.log('    3) В шапке чёрного окна должно быть «BRIX server v' + SRV_VER + '».');
    console.log('       Проверка в браузере: http://localhost:' + PORT + '/status —');
    console.log('       там видно ver и папку РЕАЛЬНО работающего сервера.');
    console.log('');
    console.log('  Этот файл server.js лежит в: ' + ROOT);
    console.log('');
    process.exit(1);
  }
  console.log('[server] ошибка: ' + ((e && e.message) || e));
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║   BRIX МУЛЬТИПЛЕЕР — АВТОРИТЕТНЫЙ СЕРВЕР     ║');
  console.log('  ║   Открой в браузере:                         ║');
  console.log('  ║   http://localhost:' + PORT + '                      ║');
  console.log('  ║   (каждое новое окно — новый игрок)          ║');
  console.log('  ║   Остановить: Ctrl+C                         ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  /* ✅ v0.4.23: ВЕРСИЯ + ПАПКА крупно. 99% «сундук не ставится /
     сервер отклонил / игроков нельзя убить» — это СТАРЫЙ сервер:
     либо не перезапущен после замены server.js, либо запущен из
     другой папки. Эта строка позволяет проверить за секунду */
  console.log('  ВЕРСИЯ СЕРВЕРА: v' + SRV_VER + ' · если в игре сундук/бессмертие не работают — сервер СТАРЫЙ, замени server.js и перезапусти');
  console.log('  ПАПКА СЕРВЕРА: ' + ROOT);
  /* ✅ v0.4.29: полный путь до запущенного ФАЙЛА — если тут не та папка,
     куда копировался новый server.js, игра ходит в старый сервер */
  console.log('  ЗАПУЩЕН ФАЙЛ: ' + __filename);
  console.log('  АДМИНЫ (admins.json): ' + (ADMIN_AIDS.size
    ? Array.from(ADMIN_AIDS).join(', ')
    : 'НЕТ — впиши свой BRIX-ID в admins.json и перезапусти сервер'));
  console.log('');
});

/* ============================================================
   ✅ v0.4.41 СЕРВЕР БОЛЬШЕ НЕ ПАДАЕТ ОТ ОДНОЙ ОШИБКИ.
   Было: «играю больше 60 минут — сервер вырубается» — любой брошенный
   exception в обработчике сокета (например, чанк мира без поля rec —
   «Cannot read properties of undefined (reading 'top')») убивал ВЕСЬ
   процесс Node, все игроки вылетали. Теперь ошибка пишется в лог с
   пометкой [guard] и сервер ПРОДОЛЖАЕТ работать; раз в 5 минут —
   сводка, сколько ошибок проглочено. Плюс защита от повторного краша
   внутри самого обработчика (не дублируем логи чаще 1/с)
   ============================================================ */
let guardCount = 0;
let guardLastLog = 0;
process.on('uncaughtException', (e) => {
  guardCount++;
  const now = Date.now();
  if (now - guardLastLog > 1000) {          // лог не чаще 1/с (шторм не зальёт консоль)
    guardLastLog = now;
    console.log('[guard] поймана ошибка (сервер работает дальше, #' + guardCount + '): ' +
      ((e && e.stack) ? String(e.stack).split('\n').slice(0, 4).join(' | ') : (e && e.message) || e));
  }
});
process.on('unhandledRejection', (e) => {
  guardCount++;
  const now = Date.now();
  if (now - guardLastLog > 1000) {
    guardLastLog = now;
    console.log('[guard] пойман rejected promise (сервер работает дальше, #' + guardCount + '): ' +
      ((e && (e.stack || e.message)) ? String(e.stack || e.message).split('\n').slice(0, 4).join(' | ') : e));
  }
});
setInterval(() => {
  if (guardCount > 0) {
    console.log('[guard] сводка: проглочено ошибок за всё время: ' + guardCount +
      ' · онлайн: ' + players.size);
  }
}, 5 * 60 * 1000);
