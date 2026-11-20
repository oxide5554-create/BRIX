// ============================================================
//  brix • js/game/gameworld.js
//  Игровой мир BRIX: настоящий рендер Three.js на весь экран.
//  При подключении мир реально собирается (ландшафт →
//  растительность → вода/небо → шейдеры → спавн), прогресс
//  отдаётся в экран загрузки, затем игрок появляется на
//  острове Brixland. HUD и пауза — здесь же.
//
//  + Хотбар и инвентарь (собственный стиль BRIX)
//  + Руки от 1-го лица ИЗ 3D-МОДЕЛИ ИГРОКА (риг) + 3 инстру:
//    КАМЕННЫЙ ТОПОР (stone_axe.glb) и КАМЕННАЯ КИРКА (stone_pickaxe.glb) —
//    одна правая рука, машут как в v0.2.3/v0.2.4 (atk1/atk2);
//    ЖЕЛЕЗНАЯ КИРКА (pickaxe.glb) — ДВЕ РУКИ на рукояти, ОДИН удар по
//    прямой atkP, добывает ТОЛЬКО камень/серу/железо
//  + ✅ v0.3.0 МУЛЬТИПЛЕЕР: другие игроки (процедурные гладкие персонажи
//    из капсул/сфер/тел вращения — без кубов), синхронизация позиции
//    X/Y/Z, поворота, анимаций (покой/бег/прыжок/удар) и предмета
//    в руках; общий запас деревьев и руд для всех игроков (события
//    ударов + снимок мира новому игроку). Трава не синхронизируется.
//  + Рубка деревьев (pine_tree.glb): ЛКМ — замах, древесина в инвентарь,
//    тряска и падение деревьев, звуки из репозитория.
//  + ✅ ДОБЫЧА КИРКОЙ: рудные жилы железа (silver ore), серы (gold ore)
//    и камня (stone.glb) — модели пользователя, железо/сера/камень в инвентарь.
//  + ✅ v0.2.10 ЭКОНОМИКА: дерево содержит 56–80 древесины (каменный топор
//    +2 за удар, железный +4); жила серы = 20, железа = 40, камня = 60
//    (каменная кирка +2 за удар, железная +4). Железная кирка теперь
//    держится ОДНОЙ рукой точно как топор и машет одним ударом atk1;
//    голова железной кирки и железного топора повёрнута ВПЕРЁД.
// ============================================================

/* ✅ v0.4.0 BrixHud — всплывающие подсказки (toast) поверх игры.
   Показывается при срабатывании страховок: если старый сервер
   не отвечает на удары/открытие ящика, игра делает это локально
   и ОБЯЗАТЕЛЬНО говорит об этом игроку. */
window.BrixHud = (function () {
  var el = null, timer = null;
  function ensure() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'brixToast';
    el.className = 'brix-toast';
    document.body.appendChild(el);
    return el;
  }
  function toast(msg, sec) {
    var e = ensure();
    e.textContent = msg;
    e.classList.add('show');
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { e.classList.remove('show'); }, (sec || 4) * 1000);
  }
  return { toast: toast };
})();

window.BrixGameWorld = (function () {
  'use strict';

  var T = window.BrixTerrain;

  var nextFrame = function () {
    return new Promise(function (r) { requestAnimationFrame(function () { r(); }); });
  };
  var sleep = function (ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  };

  var session = null; // текущий запуск мира

  /* ---------- рубка: тайминги из репозитория ---------- */
  var TOOL_ANIM_DURATION = 0.55; // полная длительность анимации удара (сек)
  var TOOL_HIT_FRAME = 0.18;     // момент hit-frame в анимации (сек)
  var TOOL_RANGE = 3.6;          // дальность удара (м)
  // ✅ v0.2.10 — новая экономика добычи (по просьбе игрока):
  // дерево содержит 56–80 древесины; каменный топор снимает по 2,
  // железный топор по 4 за удар; жила серы = 20 серы, железа = 40,
  // камня = 60; каменная кирка снимает по 2, железная кирка по 4 за удар
  var STONE_AXE_WOOD = 2;   // древесины за удар каменным топором
  var IRON_AXE_WOOD = 4;    // древесины за удар железным топором
  var STONE_PICK_YIELD = 2; // единиц за удар каменной киркой (камень/сера/железо)
  var IRON_PICK_YIELD = 4;  // единиц за удар железной киркой
  var lastSwingKind = 'atk1'; // ✅ v0.3.0: последняя анимация удара (для сети)

  /* ✅ v0.4.5 РЕВОЛЬВЕР — стрельба, обойма, ПвП:
     0.3 с между выстрелами; обойма 6; урон 20 (5 попаданий = убийство);
     перезарядка R — 2.2 с: оружие опускается вниз, звук, бег медленный,
     стрелять нельзя; ПКМ — прицеливание (точка, прозрачный крестик);
     урон инструментами: железные 10, каменные 5 за удар; ХП игрока 100 */
  var SHOOT_CD = 0.3;        // задержка между выстрелами
  var SHOOT_ANIM = 0.35;     // длительность отдачи (рукам)
  /* ✅ v0.4.40 НОВАЯ ТАБЛИЦА УРОНА (по просьбе игрока): у каждого оружия
     урон В ГОЛОВУ; В ТЕЛО = голова / 2 (округление Math.round).
     Пуля/удар в голову — полный урон, в тело — половина.
     Зона попадания: hitZone() по высоте точки удара на модели чужого игрока
     (голова — верх модели: выше 1.48 м от ног, с учётом приседа). */
  var REV_DMG = 18;          // урон пули револьвера В ГОЛОВУ (тело 9)
  var MAG_SIZE = 6;          // обойма револьвера
  var RELOAD_DUR = 2.2;      // длительность перезарядки (= anim в firstperson.js)
  var RELOAD_SLOW = 0.45;    // множитель скорости во время перезарядки
  /* урон В ГОЛОВУ инструментами за удар: каменный топор 13, каменная кирка 14,
     железные топор/кирка 24, БУЛАВА 97 (в тело — половина: 7/7/12/12/49) */
  var MELEE_HEAD = { axe: 13, pickaxe: 14, ironAxe: 24, ironPickaxe: 24, mace: 97 };
  var PLAYER_MAX_HP = 100;
  var SHOOT_RANGE = 200;     // дальность пули
  var SND_RADIUS = 130;      // радиус слышимости выстрела/перезарядки
  var HEAD_ZONE_Y = 1.48;    // порог «выше — голова» на модели чужого игрока (м от ног)

  /* ✅ v0.4.40 урон по зоне: голова — полный, тело — голова/2 (Math.round) */
  function dmgByZone(headDmg, zone) {
    return zone === 'head' ? headDmg : Math.round(headDmg / 2);
  }
  /* ✅ v0.4.40 зона попадания по точке удара: голова — верх модели чужого
     игрока (стоя голова 1.52–1.82, порог 1.48; в приседе модель сжата —
     порог умножается на scale.y). rp — объект из remotes (может быть null) */
  function hitZone(point, rp) {
    if (!rp || !rp.group) return 'body';
    var dy = point.y - rp.group.position.y;
    return dy >= HEAD_ZONE_Y * (rp.group.scale.y || 1) ? 'head' : 'body';
  }

  /* ✅ v0.4.19 ДРОБОВИК — стрельба ДРОБЬЮ (по образцу репозитория -glm):
     обойма 2 (SHOTGUN_MAG_SIZE оттуда), кулдаун 0.9 с, перезарядка 2.6 с;
     8 дробин конусом. ✅ v0.4.40 урон ПО ДИСТАНЦИИ (по просьбе игрока:
     «в близи сразу убивает, в средней 35 в голову, далеко либо не достоёт
     или по 10 хп»):
     • до 10 м — 13 за дробину И в голову, И в тело: 8×13 = 104 —
       мгновенное убийство в упор;
     • 10–28 м — 4.5 в голову / 2.25 в тело за дробину: весь заряд
       ≈ 36 в голову / 18 в тело (просили 35/17-18);
     • 28–45 м — 1.25 за дробину (весь заряд ≈ 10);
     • дальше 45 м — дробь НЕ ДОСТАЁТ: урона игрокам нет.
     Патроны — отдельный предмет shotgunShell (иконка от пользователя) */
  var SG_MAG_SIZE = 2;       // обойма дробовика
  var SG_SHOOT_CD = 0.9;     // задержка между выстрелами
  var SG_RELOAD_DUR = 2.6;   // длительность перезарядки (= anim reloadSg)
  var SG_PELLETS = 8;        // сколько дробин за выстрел
  var SG_PELLET_CLOSE = 13;    // урон дробины в упор (≤10 м) — в обе зоны
  var SG_PELLET_MID_HEAD = 4.5;  // дробина в голову на средней (10–28 м)
  var SG_PELLET_FAR = 1.25;    // дробина далеко (28–45 м) — в обе зоны
  var SG_CLOSE_END = 10;     // граница «в упор», м
  var SG_MID_END = 28;       // граница «средняя дистанция», м
  var SG_FAR_END = 45;       // дальше дробь не достаёт, м
  var SG_SPREAD = 0.062;     // конус дроби (рад, ≈3.5°) — полная ширина
  var SG_SHOOT_ANIM = 0.5;   // длительность отдачи (рукам)

  /* урон ОДНОЙ дробины по дистанции и зоне (v0.4.40) */
  function sgPelletDmg(d, zone) {
    if (d > SG_FAR_END) return 0;                       // не достаёт
    if (d <= SG_CLOSE_END) return SG_PELLET_CLOSE;      // в упор: в обе зоны
    if (d <= SG_MID_END) return zone === 'head' ? SG_PELLET_MID_HEAD : SG_PELLET_MID_HEAD / 2;
    return SG_PELLET_FAR;                               // 28–45 м: по 1.25
  }

  /* ✅ v0.4.21 КАЛАШ (АК) — автоогонь при зажатой ЛКМ (порт из репозитория
     -glm: AK_FIRE_INTERVAL 0.10 с = 600 в/мин), обойма 30, перезарядка
     3.4 с (звук перезарядки — файл от пользователя); ✅ v0.4.40 урон
     В ГОЛОВУ 33 (в тело 17); патроны — отдельный предмет rifleBullet */
  var AK_MAG_SIZE = 30;      // обойма калаша
  var AK_FIRE_CD = 0.10;     // задержка между выстрелами (автоогонь)
  var AK_RELOAD_DUR = 3.4;   // длительность перезарядки (= звук ak_reload.wav)
  var AK_DMG = 33;           // урон пули калаша В ГОЛОВУ (тело 17)

  /* ✅ v0.4.35 ТОМПСОН (пистолет-пулемёт) — держится как калаш, но
     СКОРОСТРЕЛЬНОСТЬ БОЛЬШЕ (0.075 с = 800 в/мин против 600);
     обойма 30, перезарядка 3.7 с (= звук Thompson_Reload_01.wav); выстрел —
     ТРИ звука (Thompson_Shot_LongTail_01/03/04.wav) играют РАНДОМНО;
     патроны — те же винтовочные (rifleBullet); ✅ v0.4.40 урон В ГОЛОВУ 23
     (в тело 12 — просили «12-13») */
  var TP_MAG_SIZE = 30;      // обойма томпсона
  var TP_FIRE_CD = 0.075;    // задержка между выстрелами (800 в/мин)
  var TP_RELOAD_DUR = 3.7;   // длительность перезарядки (= звук reload.wav)
  var TP_DMG = 23;           // урон пули томпсона В ГОЛОВУ (тело 12)

  /* ✅ v0.4.36 РЕВОЛЬВЕР-КАРАБИН 3× (снайперский, модель игрока
     crafted_revolver_carabine.glb -> assets/models/revolver3x.glb):
     тот же барабан на 6 патронов, что у револьвера, но со встроенным
     оптическим прицелом. ПКМ — ПРИЦЕЛ 3× (камера 72° → 26°, честный
     зум в 3 раза) + оверлей оптики (чёрная виньетка, круг, сетка)
     и ОЧЕНЬ высокая точность (разброс ×0.08 от стоячего).
     Хват/звук — КАК У РЕВОЛЬВЕРА (shot.wav/reload.wav, звук чуть
     тяжелее — rate 0.9); ✅ v0.4.40 урон В ГОЛОВУ 20 (в тело 10 —
     «карбоновый револьвер» в новой таблице игрока — это он), кулдаун
     0.9 с — медленный бьёт больно. Патроны те же (ammo). */
  var RV3X_MAG_SIZE = 6;       // барабан — как у револьвера
  var RV3X_SHOOT_CD = 0.9;     // между выстрелами (медленный снайпер)
  var RV3X_RELOAD_DUR = 2.2;   // = звук revolver/reload.wav (как у револьвера)
  var RV3X_DMG = 20;           // урон пули В ГОЛОВУ (тело 10)
  var RV3X_AIM_FOV = 26;       // FOV камеры в прицеле: 72/26 ≈ 3× зум
  var RV3X_AIM_MUL = 0.28;     // чувствительность мыши в прицеле
  var RV3X_SPREAD_MUL = 0.02;  /* ✅ v0.4.39 ОЧЕНЬ ТОЧНЫЙ в прицеле 3× (просьба
     игрока): разброс ×0.02 (было ×0.08) — стоя в прицеле конус всего
     0.0002 рад (≈2 см на 100 м); у обычного оружия ×0.25 */

  /* ✅ v0.4.40 БУЛАВА — ДОЛГИЙ ЗАМАХ, БОЛЬШОЙ УРОН: клип maceAtk в
     firstperson.js — рука уходит вверх-назад ~1.1 с, потом жёсткий
     рубящий удар вниз; урон приходит на MACE_WINDUP_MS (1.2 с) — точно
     на контакт. Кулдаун 1.85 с. По постройкам — 2 хп за удар
     (BUILD_DMG.mace в building.js и server.js). По игрокам — из
     MELEE_HEAD.mace (в голову 97 / в тело 49). */
  var MACE_WINDUP_MS = 1200;   // задержка удара булавой после замаха
  var MACE_COOLDOWN = 1.85;    // полный цикл удара булавой (сек)

  function start(mount) {
    var cancelled = false;

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa8b8c6);
    scene.fog = new THREE.FogExp2(0xc0c4b4, 0.00092);

    var camera = new THREE.PerspectiveCamera(72, mount.clientWidth / mount.clientHeight, 0.05, 2000);
    // камера в графе сцены — иначе дети (рука с топором) не рендерятся
    scene.add(camera);

    var quality = BrixState.data.settings.quality;
    var renderer = new THREE.WebGLRenderer({
      antialias: true, // не мыльная картинка
      powerPreference: 'high-performance'
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'low' ? 1 : quality === 'high' ? 2 : 1.5));
    renderer.shadowMap.enabled = quality !== 'low';
    renderer.shadowMap.type = THREE.PCFShadowMap;
    mount.appendChild(renderer.domElement);

    /* ✅ v0.4.37 ЗАЩИТА ОТ ПАДЕНИЯ ВИДЕОДРАЙВЕРА (WebGL Context Lost).
       Windows сам перезагружает драйвер видеокарты, когда ей не хватило
       памяти или драйвер «завис» (в консоли: CONTEXT_LOST_WEBGL,
       GL_INVALID_OPERATION 0x887A0005 / 0x887A0020, «Error allocating
       Texture2D» — это НЕ баг игры, это сбой драйвера на машине).
       Раньше игра продолжала рисовать в мёртвый контекст и падала с
       TypeError «Cannot read properties of null (reading 'trim')» —
       рендер-цикл умирал, экран замирал, спасала только перезагрузка
       страницы. Теперь:
       - webglcontextlost → preventDefault (БЕЗ него браузер НИКОГДА
         не восстанавливает контекст!), рендер на паузе, плашка игроку;
       - webglcontextrestored → принудительная пересборка шейдеров
         всех материалов — игра продолжается БЕЗ перезагрузки;
       - после 2-го сбоя за сессию качество снижается автоматически
         (рендер 1× и без теней), чтобы драйвер не упал снова. */
    var glLost = false;      // контекст мёртв — кадры рендера пропускаем
    var glLostCount = 0;     // сколько раз драйвер падал за сессию
    var glErrShown = false;  // чтобы не заспамить консоль
    renderer.domElement.addEventListener('webglcontextlost', function (e) {
      e.preventDefault(); // ИНАЧЕ контекст не восстановится никогда
      glLost = true;
      glLostCount++;
      console.warn('[BrixWorld] WebGL потерян (сбой видеодрайвера) — рендер на паузе, ждём восстановления…');
      if (window.BrixHud) BrixHud.toast('Видеокарта сбоит — игра восстанавливается…', 6);
    });
    renderer.domElement.addEventListener('webglcontextrestored', function () {
      glLost = false;
      glErrShown = false;
      // 2-й и дальше сбой за сессию: щадим видеокарту
      if (glLostCount >= 2) {
        renderer.setPixelRatio(1);
        renderer.shadowMap.enabled = false;
        console.warn('[BrixWorld] сбой видеодрайвера №' + glLostCount + ' — качество понижено: рендер 1×, тени выключены');
        if (window.BrixHud) BrixHud.toast('Видеокарте тяжело — качество снижено (1×, без теней)', 6);
      } else if (window.BrixHud) {
        BrixHud.toast('Графика восстановлена — можно играть', 4);
      }
      // GPU-ресурсы пересозданы с нуля — пересобираем шейдеры материалов
      scene.traverse(function (o) {
        if (!o.material) return;
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        for (var i = 0; i < mats.length; i++) mats[i].needsUpdate = true;
      });
    });

    /* контроллер создаём сразу, спавн — после генерации.
       ✅ v0.3.9: groundAt — высота земли С УЧЁТОМ ровных площадок
       чекблоков: по насыпи можно подняться и ХОДИТЬ по плоской
       вершине (коллайдер ходьбы, как просил игрок) */
    var groundAt = function (x, z, feetY) {
      var h = T.heightAt(x, z);
      if (window.BrixProps) {
        var pad = BrixProps.padAt(x, z);
        if (pad) {
          if (pad.d <= 4.4) {
            if (pad.top > h) h = pad.top;                 // плоская вершина
          } else {
            var t = (pad.d - 4.4) / 1.0;                  // 4.4..5.4 — склон
            var target = pad.top + (h - pad.top) * t;     // плавный подъём
            if (target > h) h = target;
          }
        }
      }
      // ✅ v0.4.6 СТРОИТЕЛЬСТВО: по палубе фундамента и по потолку
      // можно ХОДИТЬ (если верх в пределах ступеньки от ног игрока)
      if (window.BrixBuilding) {
        var bf = BrixBuilding.floorAt(x, z, feetY);
        if (bf !== null && bf > h) h = bf;
      }
      // ✅ v0.4.24 МАЯК: камень острова, ступени, выступы, палуба и
      // парапет (если модель загрузилась — иначе null)
      if (window.BrixLighthouse && BrixLighthouse.isReady()) {
        var lf = BrixLighthouse.floorAt(x, z, feetY);
        if (lf !== null && lf > h) h = lf;
      }
      return h;
    };
    var controls = new BrixControls.FpsController(renderer.domElement, groundAt);
    controls.onPointerLockLost = function () { setLocked(false); };
    window.__brixControls = controls;   // ✅ v0.4.41: доступ touch.js (джойстик/камера/состояние)

    /* ✅ v0.4.44 УРОН ОТ ВЫСОТЫ (controls.js считает высоту и скорость падения):
       свой урон применяем сразу (без красной вспышки — она тут нужна),
       серверу шлём 'fdmg' — он вычтет хп у себя и разошлёт phit kind 'fall'
       остальным (полоска над головой). Умер — меню смерти «Ты разбился» */
    controls.onFallDamage = function (info) {
      if (!info || dead || BrixGame.state.phase !== 'playing') return;
      var nhp = Math.max(0, myHp - info.dmg);
      setMyHp(nhp);
      flashDamage();
      if (nhp <= 0) {
        die('', { fall: 1, w: 'fall', dist: info.dist });
      }
      if (BrixNet.mode === 'server') {
        BrixNet.send({ t: 'fdmg', dmg: info.dmg, dist: info.dist });
      } else if (BrixNet.mode === 'tabs') {
        BrixNet.send({ t: 'phit', tid: BrixNet.id, hp: nhp,
          by: '', kind: 'fall', w: 'fall', dist: info.dist });
      }
    };

    var onLockChange = function () {
      setLocked(document.pointerLockElement === renderer.domElement);
    };
    document.addEventListener('pointerlockchange', onLockChange);

    var onCanvasClick = function () {
      if (BrixGame.state.phase === 'playing' && !lockedRef &&
          !isInvOpen() && !isLootOpen()) {
        menuAudio.click();
        /* ✅ v0.4.41 МОБИЛЬНЫЕ: pointer lock на телефоне не нужен и часто
           недоступен — тач-управление само считает игру «залоченной»,
           пока controls.enabled (см. цикл ниже). Гибридные устройства с
           мышью продолжают работать через обычный requestLock */
        if (window.BrixTouch && BrixTouch.isTouchDevice() && !document.pointerLockElement) {
          setLocked(true);
          return;
        }
        controls.requestLock();
      }
    };
    renderer.domElement.addEventListener('click', onCanvasClick);

    var worldRefs = [];
    var raf = 0;
    var playTimer = null;
    var disposables = [];
    var lockedRef = false;
    var hud = { fpsFrames: 0, fpsLast: performance.now(), posLast: 0 };

    function isInvOpen() {
      var inv = window.BrixInventory && BrixInventory.get();
      return !!(inv && inv.isOpen);
    }

    /* ✅ v0.3.8: лут-меню ящика открыт — курсор свободен, пауза не нужна */
    function isLootOpen() {
      return !!(window.BrixLootMenu && BrixLootMenu.isOpen());
    }

    /* ✅ v0.4.3: МИНИ-МЕНЮ (M) или КАРТА открыты — управление стоит,
       но рендер и сеть живут: игрок остаётся на сервере и виден
       ✅ v0.4.15: панель разработчика (9) — то же самое
       ✅ v0.4.25: крафт-панель (Q) — то же самое */
    function isMiniOpen() {
      return !!(window.BrixMiniMenu && BrixMiniMenu.isAnyOpen()) ||
        !!(window.BrixAdmin && BrixAdmin.isOpen()) ||
        !!(window.BrixCraft && BrixCraft.isOpen());
    }

    /* ✅ fix 0.4.5a: захват мыши с АВТО-ПОВТОРОМ. После выхода из pointer
       lock по Esc браузер ~1.25 с отвечает SecurityError «Pointer lock
       cannot be acquired immediately after the user has exited the lock».
       Раньше одиночная попытка молча/с ошибкой умирала — игрок застревал
       на паузе. Теперь просто пробуем снова, пока не разрешит. */
    function lockPointerSoon(el, tries) {
      if (!el || document.pointerLockElement === el) return;
      tries = tries || 0;
      try {
        var p = el.requestPointerLock();
        if (p && p.catch) p.catch(function () {
          if (tries < 6) setTimeout(function () { lockPointerSoon(el, tries + 1); }, 300);
        });
      } catch (e) {
        if (tries < 6) setTimeout(function () { lockPointerSoon(el, tries + 1); }, 300);
      }
    }

    function setLocked(v) {
      lockedRef = v;
      updateHudLock(v);
    }

    /* ---------- HUD ---------- */
    var hudEl = document.getElementById('gameHud');
    var fpsEl = document.getElementById('hudFps');
    var posEl = document.getElementById('hudPos');

    function updateHudLock(v) {
      if (BrixGame.state.phase !== 'playing') return;
      var hud = document.getElementById('gameHud');
      var pause = document.getElementById('pauseOverlay');
      hud.classList.toggle('dimmed', !v && !isInvOpen() && !isLootOpen() && !isMiniOpen());
      // инвентарь/лут-меню/мини-меню открыты — паузу не показываем (своя панель поверх игры)
      // ✅ fix 0.4.11: клавиатура кодового замка / перелаз — паузу ТОЖЕ не
      // показываем. Раньше F по замку выходил из pointer lock и игра
      // накрывала клавиатуру СТАРЫМ МЕНЮ ПАУЗЫ («Кликните по экрану…»)
      var bUi = !!(window.BrixBuilding && BrixBuilding.isUiBlocked && BrixBuilding.isUiBlocked());
      pause.classList.toggle('hidden', v || isInvOpen() || isLootOpen() || isMiniOpen() || bUi);
    }

    /* ---------- инвентарь, рука с топором, звуки ---------- */
    // защита от неполной установки: если новых скриптов нет —
    // бросаем понятную ошибку (она покажется красной плашкой на экране)
    if (!window.BrixInventory || !window.BrixFirstPerson || !window.BrixSfx || !window.BrixGLB) {
      throw new Error(
        'в папке игры не хватает новых скриптов: js/game/glb.js, js/game/sfx.js, ' +
        'js/game/firstperson.js, js/game/inventory.js — полностью замени папку игры ' +
        'папкой brix/ из архива и обнови страницу через Ctrl+Shift+R'
      );
    }
    var inventory = BrixInventory.init();
    // руки от 1-го лица — порт FirstPersonPlayer из репозитория:
    // риг игрока (player_claude.glb) + топор (axe_claude.glb) в отдельной сцене
    var hands = new BrixFirstPerson(camera, renderer);
    window.BrixHands = hands;   /* ✅ v0.4.47: хук для живой настройки/отладки
       рук из консоли (F12): BrixHands.syringe.root, .currentWeapon,
       .setWeapon('syringe'), .playSyringe() и т.д. */
    var decor = null;   // деревья/кусты/камни (из buildDecor)
    var terrain = null; // для отсечения ударов через рельеф
    var toolCooldown = 0;

    /* ✅ v0.4.5 боевое состояние: обойма берётся из СЛОТА револьвера
       (slot.mag — едет вместе с револьвером при переносе в инвентаре) */
    var shootCd = 0;          // кулдаун выстрела (0.3 с)
    var reloading = false;    // идёт перезарядка
    var reloadT = 0;          // 0..RELOAD_DUR
    var aiming = false;       // ПКМ прицеливание
    var crossKick = 0;        // всплеск разброса после выстрела (спадает)
    var recoilPitch = 0;      // подброс камеры, плавно возвращается
    var myHp = PLAYER_MAX_HP;
    var dead = false;
    var deathKiller = '';
    var spawnPoint = null;    // {x, z, yaw} — для возрождения

    /* ✅ v0.4.34 ХОЛОД (зимний апдейт): шкала холода 0..100.
       На сервере — авторитет (server.js считает по высоте рельефа и пушит
       'cold' раз в секунду). В соло/вкладках — та же симуляция локально
       по BrixTerrain.heightAt. Шкала растёт в зиме (горы со снегом), тем
       сильнее бьёт по ХП чем больше; в тепле тает по чуть-чуть, экран
       постепенно «размораживается» */
    var coldVal = 0;      // текущая шкала холода (сервер или симуляция)
    var coldDisp = 0;     // сглаженное значение для UI (иней тает плавно)
    var coldSrv = null;   // последнее значение от сервера (null — не приходило)
    var COLD_DMG_FROM = 30;   // с этого холода начинается урон (как на сервере)

    var revSlot = function () {
      var s = inventory.slots[inventory.activeSlot];
      return (s && s.item && s.item.tool === 'revolver') ? s : null;
    };
    /* ✅ v0.4.19: слот ДРОБОВИКА + общий «слот огнестрела» */
    var sgSlot = function () {
      var s = inventory.slots[inventory.activeSlot];
      return (s && s.item && s.item.tool === 'shotgun') ? s : null;
    };
    /* ✅ v0.4.21: слот КАЛАША */
    var rifleSlot = function () {
      var s = inventory.slots[inventory.activeSlot];
      return (s && s.item && s.item.tool === 'rifle') ? s : null;
    };
    /* ✅ v0.4.35: слот ТОМПСОНА */
    var tpSlot = function () {
      var s = inventory.slots[inventory.activeSlot];
      return (s && s.item && s.item.tool === 'smg') ? s : null;
    };
    /* ✅ v0.4.36: слот РЕВОЛЬВЕРА-КАРАБИНА 3× */
    var rv3xSlot = function () {
      var s = inventory.slots[inventory.activeSlot];
      return (s && s.item && s.item.tool === 'rev3x') ? s : null;
    };
    var gunSlot = function () {
      return revSlot() || sgSlot() || rifleSlot() || tpSlot() || rv3xSlot();
    };
    /** id предмета-патрона для текущего огнестрела */
    var gunAmmoId = function () {
      return sgSlot() ? 'shotgunShell'
        : (rifleSlot() || tpSlot()) ? 'rifleBullet'   // ✅ v0.4.35: томпсон ест те же винтовочные
        : 'ammo';
    };
    var gunMagSize = function () {
      return sgSlot() ? SG_MAG_SIZE
        : rifleSlot() ? AK_MAG_SIZE
        : tpSlot() ? TP_MAG_SIZE
        : rv3xSlot() ? RV3X_MAG_SIZE
        : MAG_SIZE;
    };

    // выбор в хотбаре → показать/спрятать руки с нужным инструментом
    inventory.onSelect = function (item) {
      var tool = (item && item.tool) || null;
      // ✅ v0.4.6: 'plan' — план строителя (синий ватман в руках)
      // ✅ v0.4.19: 'shotgun' — дробовик в руках
      // ✅ v0.4.21: 'rifle' — калаш в руках
      // ✅ v0.4.35: 'smg' — томпсон в руках (держится как калаш)
      // ✅ v0.4.36: 'rev3x' — револьвер-карабин 3× (держится как револьвер)
      // ✅ v0.4.40: 'mace' — булава в руках (держится как топор)
      hands.setWeapon(tool === 'axe' || tool === 'pickaxe' || tool === 'ironPickaxe' ||
        tool === 'ironAxe' || tool === 'revolver' || tool === 'shotgun' ||
        tool === 'rifle' || tool === 'smg' || tool === 'rev3x' ||
        tool === 'mace' || tool === 'c4' || tool === 'plan' ||
        /* ✅ v0.4.46: шприц — руки держат его наготове (модель шприца) */
        tool === 'syringe' ? tool : null);
      // смена оружия сбрасывает прицеливание (у огнестрелов — оставляем выбор игроку:
      // с револьвера на дробовик/калаш можно перескакивать с прицелом)
      if (tool !== 'revolver' && tool !== 'shotgun' && tool !== 'rifle' &&
          tool !== 'smg' && tool !== 'rev3x' && aiming) stopAim();
      updateCrosshair();
    };

    // звуки рубки (сэмплы из репозитория) — с пробивкой кэша браузера
    function sfxUrl(u) { return window.BrixAsset ? window.BrixAsset(u) : u; }
    BrixSfx.load('chop1', sfxUrl('assets/sfx/wood/chop_1.wav'));
    BrixSfx.load('chop2', sfxUrl('assets/sfx/wood/chop_2.wav'));
    BrixSfx.load('treeFall', sfxUrl('assets/sfx/wood/tree_falling.ogg'));
    // ✅ звуки ЛОМАНИЯ КАМНЕЙ — взяты из референс-репозитория (папка sounds):
    //    «Stone Hit 01–03.wav» — удары кирки по камню,
    //    «StoneBreak_01.ogg» — жила рассыпается
    // ✅ v0.3.6: звуки бочек из репозитория (oxide5554-create/-glm)
    BrixSfx.load('barrelBreak', sfxUrl('assets/sfx/boch/barrel_break.ogg'));
    BrixSfx.load('metalHit', sfxUrl('assets/sfx/boch/metal_hit.wav'));
    BrixSfx.load('stoneHit1', sfxUrl('assets/sfx/stone/stone_hit_1.wav'));
    BrixSfx.load('stoneHit2', sfxUrl('assets/sfx/stone/stone_hit_2.wav'));
    BrixSfx.load('stoneHit3', sfxUrl('assets/sfx/stone/stone_hit_3.wav'));
    BrixSfx.load('stoneBreak', sfxUrl('assets/sfx/stone/stone_break.ogg'));
    var stoneHits = ['stoneHit1', 'stoneHit2', 'stoneHit3'];
    // ✅ v0.4.5: звуки револьвера (выстрел с хвостом + перезарядка)
    BrixSfx.load('revShot', sfxUrl('assets/sfx/revolver/shot.wav'));
    BrixSfx.load('revReload', sfxUrl('assets/sfx/revolver/reload.wav'));
    // ✅ v0.4.19: звук дробовика (выстрел — сэмпл из репозитория -glm,
    // sounds/shotgun/shotgun.wav); перезарядка дробовика — те же щелчки
    BrixSfx.load('sgShot', sfxUrl('assets/sfx/shotgun/shotgun.wav'));
    // ✅ v0.4.21: звук КАЛАША (выстрел — сэмпл из репозитория -glm,
    // AssaultRifle_Shot_Tail_01.wav); перезарядка — файл от пользователя
    BrixSfx.load('akShot', sfxUrl('assets/sfx/rifle/ak_shot.wav'));
    BrixSfx.load('akReload', sfxUrl('assets/sfx/rifle/ak_reload.wav'));
    // ✅ v0.4.35: звуки ТОМПСОНА — ТРИ выстрела от пользователя играют
    // РАНДОМНО (Thompson_Shot_LongTail_01/03/04.wav) + перезарядка
    BrixSfx.load('tpShot1', sfxUrl('assets/sfx/thompson/shot_1.wav'));
    BrixSfx.load('tpShot3', sfxUrl('assets/sfx/thompson/shot_3.wav'));
    BrixSfx.load('tpShot4', sfxUrl('assets/sfx/thompson/shot_4.wav'));
    BrixSfx.load('tpReload', sfxUrl('assets/sfx/thompson/reload.wav'));
    var tpShots = ['tpShot1', 'tpShot3', 'tpShot4'];
    // ✅ v0.4.41: звуки С4 — «тык» таймера (1 с, играется 15 раз: каждый
    // тык тише/писклявее/быстрее — см. c4BeepSound) и ВЗРЫВ (от игрока)
    BrixSfx.load('c4Beep', sfxUrl('assets/sfx/c4/beep.ogg'));
    BrixSfx.load('c4Explosion', sfxUrl('assets/sfx/c4/explosion.ogg'));
    /* ✅ v0.4.50 ЗВУК ШПРИЦА (файл игрока syringe_squirt_liquid_001):
       «шприц воткнулся в руку» — играется в момент входа иглы
       (SYR_NEEDLE_T ≈ 2.5 с клипа, см. useSyringe) */
    BrixSfx.load('syrSquirt', sfxUrl('assets/sfx/syringe/inject.mp3'));

    // стартовое состояние: слот 0 — каменный топор
    var startSel = inventory.slots[0];
    hands.setWeapon(startSel && startSel.item.tool ? startSel.item.tool : 'axe');

    // ✅ v0.3.0: чужие игроки и строка статуса сети (уровень start(),
    // чтобы их видели и отладочный хук, и stop() при выходе)
    var remotes = {};
    var mpEl = null;
    var remoteRoot = null;

    // отладочный доступ для автотестов
    window.__brixDebug = {
      controls: controls,
      inventory: inventory,
      hands: hands,
      camera: camera,
      getDecor: function () { return decor; },
      hitWithTool: hitWithTool,
      remotes: remotes,           // ✅ v0.3.0: чужие игроки (для автотестов)
      scene: scene,
      // ✅ v0.4.6: система строительства (для автотестов)
      getBuilding: function () { return window.BrixBuilding; },
      /* ✅ v0.4.41: С4 (для автотестов): throwC4 — бросок из рук;
         c4SpawnAt(x,y,z) — блок сразу ПРИЛИПШИЙ в точке (armed);
         c4s() — список живых блоков; c4ExplodeNow() — взорвать всё СРАЗУ */
      throwC4: throwC4,
      c4SpawnAt: function (x, y, z) {
        var e = spawnC4(new THREE.Vector3(x, y, z), new THREE.Vector3(), true);
        e.st = 'armed';
        orientC4FromNormal(e, new THREE.Vector3(0, 1, 0));
        return true;
      },
      c4s: function () { return c4s.map(function (e) {
        return { st: e.st, own: e.own, beepI: e.beepI,
          p: [e.grp.position.x, e.grp.position.y, e.grp.position.z] }; }); },
      c4ExplodeNow: function () {
        while (c4s.length) explodeC4(c4s[0]);
        return true;
      },
      c4Fuse: c4Fuse,
      touch: function () { return window.BrixTouch; }
    };

    /* ---------- ЛКМ — удар топором ---------- */
    var screenCenter = new THREE.Vector2(0, 0);
    var raycaster = new THREE.Raycaster();
    var swingCounter = 0;

    // ✅ v0.3.6: предзагрузка GLB бочки и скрапа (из репозитория)
    if (window.BrixProps) BrixProps.preload();

    /* ====== v0.3.7: ЧЕКБЛОКИ С ЛОМАЮЩИМИСЯ БОЧКАМИ + ДРОПЫ ======
       Одиночных бочек/ящиков больше нет — всё лутаемое в чекблоках.
       Всё авторитетно у СЕРВЕРА: клиент шлёт заявку (bhit/btake),
       сервер считает HP/дропы и пушит результат всем */
    var hintEl = null;
    function buildObjects(objs) {
      if (!window.BrixProps) return;
      window.__objsBuilt = true;   // сервер прислал свои объекты
      BrixProps.build(objs, {
        scene: scene,
        groundY: window.BrixTerrain ? BrixTerrain.heightAt : function () { return 0; }
      });
      /* ✅ v0.4.43: ТРУПЫ из снапшота — новый игрок сразу видит трупы
         погибших (они живут на сервере в world-objs.json) */
      if (window.BrixCorpses && Array.isArray(objs.corpses)) {
        BrixCorpses.setScene(scene);
        BrixCorpses.build(objs.corpses);
      }
      /* ✅ v0.4.43: ЖИВЫЕ С4 из снапшота — зашёл ПОСЛЕ постановки бомбы:
         видишь блок и слышишь тыки с ПРАВИЛЬНОЙ фазы (ms — остаток
         фьюза), взрыв решает сервер */
      if (Array.isArray(objs.c4)) {
        objs.c4.forEach(function (c) {
          if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.z)) return;
          var dup = false;
          for (var i = 0; i < c4s.length; i++) if (c4s[i].srvId === c.id) { dup = true; break; }
          if (dup) return;
          var nA = c.n || [0, 1, 0];
          var e = spawnC4(new THREE.Vector3(c.x, c.y, c.z), new THREE.Vector3(), false);
          e.st = 'armed';
          orientC4FromNormal(e, new THREE.Vector3(nA[0], nA[1], nA[2]).normalize());
          e.srvId = c.id;
          c4ApplyPhase(e, c.ms);
        });
      }
    }

    function hitProp(prop, tool) {
      if (!prop || prop.dead) return;
      BrixSfx.play('metalHit', { volume: 0.8, jitter: 0.08 });
      if (prop.kind === 'barrel') {
        if (BrixNet.mode === 'server') {
          BrixNet.sendBhit(prop.id, tool);   // сервер решает: HP/разбит/дропы
          // ✅ v0.4.0 СТРАХОВКА: если сервер МОЛЧИТ 1.2 с (работает старая
          //    версия server.js без 'bhit' или лагает сеть) — применяем
          //    удар локально. Бочки ломаются при ЛЮБОЙ версии сервера
          scheduleLocalHit(prop.id, tool);
        } else {
          // режим вкладок/соло: считаем локально и рассылаем результат
          objLocalDamage(prop.id, tool);
        }
      }
    }

    /* ✅ v0.4.0: отложенный локальный урон, пока сервер не ответил */
    var pendingHits = {};
    function scheduleLocalHit(id, tool) {
      if (pendingHits[id]) clearTimeout(pendingHits[id]);
      pendingHits[id] = setTimeout(function () {
        delete pendingHits[id];
        if (cancelled || BrixGame.state.phase !== 'playing') return;
        objLocalDamage(id, tool);
        BrixHud.toast(BrixState.t('diag.hitFallback'), 6);
      }, 1200);
    }
    function clearPendingHit(id) {
      if (pendingHits[id]) { clearTimeout(pendingHits[id]); delete pendingHits[id]; }
    }

    function objLocalDamage(id, tool) {
      // ✅ v0.3.8 ИСПРАВЛЕНО: раньше здесь вызывался BrixNet.send, которого
      // НЕ БЫЛО в net.js → «Uncaught TypeError: BrixNet.send is not a
      // function» → урон не применялся и БОЧКИ НЕ ЛОМАЛИСЬ (режим вкладок).
      // Теперь: считаем урон локально, применяем СРАЗУ у себя и
      // рассылаем другим вкладкам (в соло send() просто молчит)
      if (!window.__objLocal) window.__objLocal = { hp: {}, _barrelPos: {}, loot: {} };
      var L = window.__objLocal;
      var bp = window.BrixProps ? BrixProps.barrelPos(id) : null;
      if (bp) { L._barrelPos[id] = { x: bp.x, z: bp.z }; }
      L.hp[id] = (L.hp[id] === undefined ? 6 : L.hp[id]) -
        /* ✅ v0.4.44: бочка 6 хп — камень/кулак 1 (6 ударов), железо 1.5 (4),
           булава 6 (1 удар) — ТА ЖЕ ТАБЛИЦА, что у сервера (case 'bhit') */
        (tool === 'mace' ? 6
          : (tool === 'ironAxe' || tool === 'ironPickaxe') ? 1.5
          : 1);
      var hpMsg = { t: 'bhp', id: id, hp: Math.max(L.hp[id], 0) };
      var brkMsg = null;
      if (L.hp[id] <= 0) {
        var drops = [];
        for (var i = 0; i < 1 + Math.floor(Math.random() * 2); i++) {
          drops.push({ id: 'dl' + Math.random().toString(36).slice(2, 8),
            kind: 'scrap', x: 0, z: 0, amt: 2 + Math.floor(Math.random() * 5) });
        }
        if (Math.random() > 0.5) drops.push({ id: 'dl' + Math.random().toString(36).slice(2, 8),
          kind: 'metal', x: 0, z: 0, amt: 1 + Math.floor(Math.random() * 3) });
        if (Math.random() < 0.4) drops.push({ id: 'dl' + Math.random().toString(36).slice(2, 8),
          kind: 'pipe', x: 0, z: 0, amt: 1 + Math.floor(Math.random() * 2) });
        // позиции вокруг бочки подставит приёмная сторона по своим бочкам
        brkMsg = { t: 'brk', id: id, drops: drops };
      }
      BrixNet.send(hpMsg);
      if (brkMsg) BrixNet.send(brkMsg);
      // ✅ у себя применяем сразу — BroadcastChannel не эхоит своё сообщение,
      // а без этого бьющий не видел ни урона, ни разбития
      BrixProps.applyHp(id, hpMsg.hp);
      if (brkMsg) objApplyBrk(brkMsg);
    }

    function objApplyBrk(msg) {
      if (!window.BrixProps) return;
      BrixProps.breakBarrel(msg.id);
      BrixSfx.play('barrelBreak', { volume: 1 });
      (msg.drops || []).forEach(function (d) {
        // ✅ v0.3.7: сервер присылает АБСОЛЮТНЫЕ координаты дропа;
        // в режиме вкладок координат нет — раскладываем вокруг бочки
        if ((!d.x || !d.z) && window.__objLocal) {
          var src = window.__objLocal._barrelPos && window.__objLocal._barrelPos[msg.id];
          if (src) {
            d.x = +(src.x + (Math.random() - 0.5) * 2.4).toFixed(1);
            d.z = +(src.z + (Math.random() - 0.5) * 2.4).toFixed(1);
          }
        }
        BrixProps.spawnDrop(d);
      });
    }

    /* ✅ v0.3.8: применение подбора дропа (общее для сервера и вкладок) */
    function applyTaken(msg) {
      BrixProps.removeDrop(msg.id);
      if (msg.pid === BrixNet.id) {
        inventory.addItem(msg.item, msg.amt);
        inventory.showPickup(msg.item, msg.amt);
      }
    }

    /* ---------- ✅ v0.3.8: ЛУТ-МЕНЮ ЯЩИКА ---------- */

    function rollLootLocal(mil) {
      // рецепт из репозитория (тот же, что у сервера) — для режима вкладок.
      // ✅ v0.4.5: ПАТРОНЫ (4–15) только в ВОЕННОМ ящике; РЕВОЛЬВЕР —
      // и в военном (шанс выше), и в деревянном
      var r = function (min, max) { return min + Math.floor(Math.random() * (max - min + 1)); };
      var loot = { scrap: r(4, 8), metal: 0, spring: 0, pipe: 0, rifleBody: 0, berdanaBody: 0, revolver: 0, ammo: 0 };
      if (Math.random() < 0.6) loot.metal = r(4, 16);
      if (Math.random() < 0.5) loot.spring = r(1, 3);
      if (Math.random() < 0.5) loot.pipe = r(1, 3);
      if (Math.random() < 0.7) loot.ammo = r(4, 15);        // только военный
      if (mil) {
        loot.rifleBody = 1;
        if (Math.random() < 0.35) loot.revolver = 1;
        if (Math.random() < 0.25) loot.berdanaBody = 1;
        /* ✅ v0.4.46: ШПРИЦ — медицина в военном ящике (1–2 шт) */
        if (Math.random() < 0.3) loot.syringe = 1 + (Math.random() < 0.35 ? 1 : 0);
      } else {
        if (Math.random() < 0.12) loot.revolver = 1;
        if (Math.random() < 0.35) loot.berdanaBody = 1;
      }
      return loot;
    }

    function openCrateLocal(id) {
      // вкладки/соло: лут живёт в __objLocal.loot, кидаем локально
      var L = window.__objLocal || (window.__objLocal = { hp: {}, _barrelPos: {}, loot: {} });
      if (!L.loot[id]) {
        // если лут пришёл со снимком (BrixProps) — берём его, иначе кидаем
        L.loot[id] = BrixProps.crateLoot(id) || rollLootLocal(0);
      }
      BrixLootMenu.open(id, L.loot[id], 0);
    }

    function takeCrateLocal(id, item, amt) {
      var L = window.__objLocal || (window.__objLocal = { hp: {}, _barrelPos: {}, loot: {} });
      var loot = L.loot[id];
      if (!loot || !loot[item]) return;
      var have = loot[item];
      var take = (amt > 0) ? Math.min(amt, have) : have;   // ✅ v0.4.1: часть стека
      // ✅ v0.4.2: не берём больше, чем влезает в инвентарь
      var fits = inventory.freeSpaceFor(item);
      if (fits <= 0) { if (window.BrixHud) BrixHud.toast('Инвентарь полон'); return; }
      if (take > fits) take = fits;
      loot[item] = have - take;
      var empty = Object.keys(loot).every(function (k) { return !loot[k]; });
      var msg = { t: 'cbloot', id: id, loot: loot, pid: BrixNet.id, item: item, amt: take, gone: empty };
      BrixNet.send(msg);                      // другим вкладкам
      applyCrateLoot(msg);                    // ✅ себе сразу
    }

    /* ✅ v0.4.2: ОПТИМИСТИЧНОЕ ВЗЯТИЕ — предмет появляется в инвентаре
       МГНОВЕННО при клике/драге, а не когда дойдёт ответ сервера.
       Троттлинг фоновой вкладки (таймеры раз в ~2 с) раньше растягивал
       этот путь на секунды — у игрока предмет «исчезал», потом
       «возвращался». Сервер подтверждает через cbloot с tid (ничего не
       задваивается), при отказе шлёт cbdeny — откатываем предмет */
    var pendingTake = {};

    function takeCrateOptimistic(id, item, amt) {
      amt = Math.max(0, amt | 0);
      var fits = inventory.freeSpaceFor(item);
      if (fits <= 0) { if (window.BrixHud) BrixHud.toast('Инвентарь полон'); return; }
      if (amt > fits) amt = fits;
      if (amt <= 0) return;
      var tid = 'T' + Math.random().toString(36).slice(2, 9);
      pendingTake[tid] = { id: id, item: item, amt: amt, ts: performance.now() };
      // мгновенно у себя: лут ящика и инвентарь
      var srv = window.__objLocalSrv = window.__objLocalSrv || {};
      var loot = srv[id] = Object.assign({}, BrixProps.crateLoot(id) || {});
      loot[item] = Math.max(0, (loot[item] || 0) - amt);
      BrixProps.setCrateLoot(id, loot);
      // ✅ v0.4.4 ПОРЯДОК ВАЖЕН: предмет добавляем в инвентарь ДО
      //    перерисовки лут-меню — update() рисует и лут ящика, И СЕТКУ
      //    ИНВЕНТАРЯ. Раньше update шёл первым: предмет попадал в
      //    инвентарь ПОСЛЕ отрисовки и «появлялся» только со СЛЕДУЮЩЕЙ
      //    взятой вещью (металл → взял скраб → только тут увидел металл)
      inventory.addItem(item, amt);
      inventory.showPickup(item, amt);
      if (BrixLootMenu.openId() === id) BrixLootMenu.update(id, loot);
      BrixNet.sendCbTake(id, item, amt, tid);
    }

    function denyCrateTake(msg) {
      var p = pendingTake[msg.tid];
      if (!p) return;
      delete pendingTake[msg.tid];
      inventory.removeCountByItem(p.item, p.amt);
      // вернуть предмет в лут ящика у себя (сервер его не списал)
      var srv = window.__objLocalSrv = window.__objLocalSrv || {};
      var loot = srv[p.id] = Object.assign({}, BrixProps.crateLoot(p.id) || {});
      loot[p.item] = (loot[p.item] || 0) + p.amt;
      BrixProps.setCrateLoot(p.id, loot);
      if (BrixLootMenu.openId() === p.id) BrixLootMenu.update(p.id, loot);
      if (window.BrixHud) BrixHud.toast('Сервер не дал взять: подойди ближе / предмет уже взят');
    }

    /* ============================================================
       ✅ v0.4.22 СУНДУК-ХРАНИЛИЩЕ: F у сундука — меню «наоборот»:
       КЛИК по своему предмету кладёт его В сундук (перетаскивание
       тоже работает), клик по предмету сундука — забирает.
       Содержимое живёт НА СЕРВЕРЕ (rec.cont постройки): переживает
       перезаход, выход владельца и рестарт сервера (автосейв)
       ============================================================ */
    var pendingChestTake = {};
    var chestAwait = null;   // ✅ v0.4.22: id сундука, открытого по F — ждём chestst
    function isChestId(id) {
      return !!(window.BrixBuilding && BrixBuilding.chestCont &&
        BrixBuilding.chestCont(id) !== null);
    }
    function chestContLocal(id) {
      return (window.BrixBuilding && BrixBuilding.chestCont(id)) || {};
    }
    /** F у сундука: открыть крышку (себе + другим) и меню с его содержимым */
    function openChest(id) {
      if (window.BrixBuilding) BrixBuilding.chestLid(id, 1);
      if (window.BrixSfx) {
        try { BrixSfx.play('doorMove', { volume: 0.42, jitter: 0.05 }); } catch (e) {}
      }
      if (BrixNet.sendChestAnim) BrixNet.sendChestAnim(id, 1);
      if (BrixNet.mode === 'server' && BrixNet.serverVer >= 50) {
        // сервер пришлёт chestst — меню откроется с ЕГО содержимым
        chestAwait = id;
        BrixNet.sendChestOpen(id);
        (function (cid) {
          setTimeout(function () {
            if (cancelled || BrixGame.state.phase !== 'playing') return;
            if (chestAwait === cid) chestAwait = null;
            if (!BrixLootMenu.isOpen() && BrixLootMenu.openId() !== cid) {
              BrixLootMenu.open(cid, chestContLocal(cid), 0, 'chest');
            }
          }, 1200);
        })(id);
      } else {
        // вкладки/соло (или старый сервер): содержимое локальной записи
        BrixLootMenu.open(id, chestContLocal(id), 0, 'chest');
      }
    }
    /** взять предмет из сундука: оптимистично у себя, сервер — авторитет */
    function takeChestOptimistic(id, item, amt) {
      amt = Math.max(0, amt | 0);
      var fits = inventory.freeSpaceFor(item);
      if (fits <= 0) { if (window.BrixHud) BrixHud.toast('Инвентарь полон'); return; }
      if (amt > fits) amt = fits;
      if (amt <= 0) return;
      var cont = chestContLocal(id);
      var avail = cont[item] || 0;
      if (avail <= 0) return;
      if (amt > avail) amt = avail;
      var tid = 'T' + Math.random().toString(36).slice(2, 9);
      pendingChestTake[tid] = { id: id, item: item, amt: amt };
      /* локально: сундук и инвентарь (ПОРЯДОК как в ящиках: сперва
         инвентарь, потом перерисовка меню) */
      var ncont = Object.assign({}, cont);
      ncont[item] = avail - amt;
      if (ncont[item] <= 0) delete ncont[item];
      inventory.addItem(item, amt);
      inventory.showPickup(item, amt);
      if (window.BrixBuilding) BrixBuilding.setChestCont(id, ncont);
      if (BrixLootMenu.openId() === id) BrixLootMenu.update(id, ncont);
      if (BrixNet.mode === 'server' && BrixNet.serverVer >= 50) {
        BrixNet.sendChestTake(id, item, amt, tid);
      } else {
        BrixNet.send({ t: 'chestst', id: id, cont: ncont, pid: BrixNet.id });
      }
    }
    function denyChestTake(msg) {
      var p = pendingChestTake[msg.tid];
      if (!p) return;
      delete pendingChestTake[msg.tid];
      inventory.removeCountByItem(p.item, p.amt);
      if (window.BrixHud) BrixHud.toast('Сервер не дал взять: подойди ближе / предмет уже взят');
      // переспрашиваем содержимое — сервер вернёт актуальное
      if (BrixNet.mode === 'server' && BrixNet.serverVer >= 50 && BrixNet.sendChestOpen) {
        BrixNet.sendChestOpen(p.id);
      }
    }
    /** положить свой предмет В сундук: вычет у себя сразу, сервер рассылает chestst */
    function putChestLocal(id, item, amt, fromIndex) {
      amt = Math.max(1, amt || 1);
      var cont = chestContLocal(id);
      var ncont = Object.assign({}, cont);
      if (inventory.removeCount(fromIndex, amt) <= 0) return;   // слот уже пуст
      ncont[item] = (ncont[item] || 0) + amt;
      if (window.BrixBuilding) BrixBuilding.setChestCont(id, ncont);
      if (window.BrixInventory) inventory.renderAll();
      if (BrixLootMenu.openId() === id) BrixLootMenu.update(id, ncont);
      if (BrixNet.mode === 'server' && BrixNet.serverVer >= 50) {
        BrixNet.sendChestPut(id, item, amt);
      } else {
        BrixNet.send({ t: 'chestst', id: id, cont: ncont, pid: BrixNet.id });
      }
    }

    /* ✅ v0.4.1: положить свой предмет В ЯЩИК (drag&drop).
       Применяем у себя СРАЗУ (лут ящика + вычет из инвентаря),
       затем сообщаем: сервер рассылает cbloot всем, в режиме
       вкладок — BroadcastChannel, в соло просто молчит */
    function putCrateLocal(id, item, amt, fromIndex) {
      amt = Math.max(1, amt || 1);
      var L = window.__objLocal || (window.__objLocal = { hp: {}, _barrelPos: {}, loot: {} });
      var loot = L.loot[id];
      if (!loot) { loot = L.loot[id] = {}; }
      // снимок BrixProps актуален и в серверном режиме (открыт из cbopen)
      var snap = BrixProps.crateLoot(id);
      if (BrixNet.mode === 'server') {
        // серверный режим: ведём локальную копию поверх снимка
        var srv = window.__objLocalSrv = window.__objLocalSrv || {};
        if (!srv[id]) srv[id] = Object.assign({}, snap || {});
        loot = L.loot[id] = srv[id];
      }
      loot[item] = (loot[item] || 0) + amt;
      if (inventory.removeCount(fromIndex, amt) <= 0) return;   // слот уже пуст
      var msg = { t: 'cbloot', id: id, loot: loot, pid: BrixNet.id,
        item: item, amt: amt, gone: false, put: true };
      if (BrixNet.mode === 'server') BrixNet.sendCbPut(id, item, amt);
      else BrixNet.send(msg);
      applyCrateLoot(msg);                    // себе: меню + площадка ящика
    }

    function applyCrateLoot(msg) {
      if (!window.BrixProps) return;
      BrixProps.setCrateLoot(msg.id, msg.loot);
      // ✅ v0.4.4: свой предмет добавляем ДО перерисовки лут-меню
      //    (update() рисует и сетку инвентаря — иначе предмет
      //    появлялся только со следующей взятой вещью)
      if (msg.pid === BrixNet.id) {
        // ✅ v0.4.1: put:true — я САМ положил предмет в ящик и уже вычел
        //    его из инвентаря ДО отправки; назад добавлять нельзя.
        // ✅ v0.4.2: msg.tid — подтверждение МОЕГО оптимистичного взятия
        //    (предмет добавлен мгновенно при клике, тут только сверяем)
        if (!msg.put && !msg.tid) {
          inventory.addItem(msg.item, msg.amt);
          inventory.showPickup(msg.item, msg.amt);
        }
        if (msg.tid) delete pendingTake[msg.tid];
      }
      if (msg.gone) {
        BrixProps.removeCrate(msg.id);
        if (BrixLootMenu.openId() === msg.id) BrixLootMenu.close();
      } else if (BrixLootMenu.openId() === msg.id) {
        BrixLootMenu.update(msg.id, msg.loot);
      }
    }

    function tryPickup() {
      if (BrixGame.state.phase !== 'playing' || !window.BrixProps) return;
      // F закрывает меню — но НЕ тем же нажатием, которым открыл
      // (защита 300 мс как в репозитории scr/ui/crateUI.js)
      if (isLootOpen()) {
        if (performance.now() - BrixLootMenu.lastOpenTs() >= 300) BrixLootMenu.close();
        return;
      }
      // ✅ v0.4.2: направление взгляда — F работает ТОЛЬКО когда
      // прицел наведён на ящик/дроп (конус ~10°)
      var fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      var pick = BrixProps.nearestPickup(controls.position, 3, fwd);
      if (!pick) return;
      if (pick.kind === 'drop') {
        if (BrixNet.mode === 'server') {
          BrixNet.sendBtake(pick.id);
        } else {
          // ✅ v0.3.8: раньше здесь падало «BrixNet.send is not a function»
          var msg = { t: 'btaken', id: pick.id, pid: BrixNet.id,
            item: pick.item, amt: pick.amount };
          applyTaken(msg);      // себе сразу
          BrixNet.send(msg);    // и другим вкладкам
        }
      } else {
        if (BrixNet.mode === 'server') {
          // сервер пришлёт cbopen с ТЕКУЩИМ лутом (он хранится у него).
          // ✅ v0.3.9: controls.enabled НЕ трогаем здесь! Раньше
          //    отключали ДО ответа сервера — если ответ не пришёл
          //    (старый сервер, лаг), игрок ЗАМИРАЛ: ни идти, ни бить.
          //    Теперь enabled выставляет сам открытый лут-меню, а
          //    каждый кадр анимации самовосстанавливает его (см. tick)
          BrixNet.sendCbOpen(pick.id);
          // ✅ v0.4.0 СТРАХОВКА: если сервер молчит 1.5 с (старая версия
          //    server.js не знает 'cbopen') — открываем ящик локально из
          //    снимка мира. Ящик работает при ЛЮБОЙ версии сервера
          (function (cbId) {
            setTimeout(function () {
              if (cancelled || BrixGame.state.phase !== 'playing') return;
              if (!BrixLootMenu.isOpen() && BrixLootMenu.openId() !== cbId) {
                openCrateLocal(cbId);
                BrixHud.toast(BrixState.t('diag.openFallback'), 6);
              }
            }, 1500);
          })(pick.id);
        } else {
          openCrateLocal(pick.id);
        }
      }
    }

    document.addEventListener('keydown', function (e) {
      // ✅ v0.4.3: мини-меню/карта открыты — F не подбирает лут
      if (isMiniOpen()) return;
      /* ✅ v0.4.10: F — сначала ДВЕРЬ/ЗАМОК (BrixBuilding.interact вернёт
         true, если навели на дверь — открыли/закрыли/ввели код);
         иначе — обычный подбор лута */
      if (e.code === 'KeyF') {
        if (window.BrixBuilding && BrixBuilding.interact && BrixBuilding.interact()) {
          /* ✅ fix 0.4.12: F обработан дверью/замком — не даём событию
             дойти до клавиатуры замка (padKeyDown), иначе ТО ЖЕ нажатие
             мгновенно закрывало панель кода: игрок видел только звук */
          e.preventDefault();
          e.stopImmediatePropagation();
        } else {
          /* ✅ v0.4.22: F у СУНДУКА — открыть хранилище (меню «наоборот»);
             ✅ v0.4.43: F у ТРУПА — обыскать труп-лутбокс;
             ✅ v0.4.44: F у ПЕЧКИ — меню плавки; труп теперь ПО НАВЕДЕНИЮ
             прицела (не «по близости»), и ЛУТ ЧЕРЕЗ СТЕНУ ЗАПРЕЩЁН */
          var chId = (window.BrixBuilding && BrixBuilding.chestAim)
            ? BrixBuilding.chestAim() : null;
          var fuId = (window.BrixBuilding && BrixBuilding.furnaceAim && window.BrixFurnace)
            ? BrixBuilding.furnaceAim() : null;
          if (fuId) {
            e.preventDefault();
            window.BrixFurnace.open(fuId);
          } else if (chId) {
            e.preventDefault();
            openChest(chId);
          } else if (window.BrixCorpses && window.BrixCorpses.aimed) {
            var aimDir = new THREE.Vector3();
            camera.getWorldDirection(aimDir);
            var corpId = BrixCorpses.aimed(camera.position, aimDir, 3.4, camera);
            if (corpId) {
              e.preventDefault();
              openCorpse(corpId);
            } else {
              tryPickup();
            }
          } else if (window.BrixCorpses) {
            var corpId2 = BrixCorpses.nearest(controls.position, 3.2);
            if (corpId2) {
              e.preventDefault();
              openCorpse(corpId2);
            } else {
              tryPickup();
            }
          } else {
            tryPickup();
          }
        }
      }
      // ✅ v0.4.5: R — перезарядка револьвера (собирает 6 патронов из запаса)
      if (e.code === 'KeyR') tryReload();
      /* ✅ v0.4.6 СТРОИТЕЛЬСТВО: Z — открыть/закрыть меню выбора детали.
         Работает ТОЛЬКО если план строителя в руках (проверка внутри
         BrixBuilding.toggleMenu) и не открыты другие меню */
      if (e.code === 'KeyZ' && !isInvOpen() && !isLootOpen() && window.BrixBuilding) {
        BrixBuilding.toggleMenu();
      }
    });

    /* ✅ v0.3.8: лут-меню — клик по предмету = заявка серверу */
    if (window.BrixLootMenu) {
      BrixLootMenu.init({
        take: function (cbId, item, amt) {
          /* ✅ v0.4.43: ТРУП — своя ветка (оптимистично + corpseTake) */
          if (window.BrixCorpses && BrixCorpses.has(cbId)) {
            BrixCorpses.take(cbId, item, amt || 0);
            return;
          }
          /* ✅ v0.4.22: сундук — своя ветка (оптимистично + chesttake) */
          if (isChestId(cbId)) { takeChestOptimistic(cbId, item, amt || 0); return; }
          // ✅ v0.4.2: сервер 42+ понимает tid — берём ОПТИМИСТИЧНО
          // (мгновенно); старый сервер — как раньше, по cbloot
          if (BrixNet.mode === 'server' && BrixNet.serverVer >= 42) takeCrateOptimistic(cbId, item, amt || 0);
          else if (BrixNet.mode === 'server') BrixNet.sendCbTake(cbId, item, amt);
          else takeCrateLocal(cbId, item, amt);
        },
        /* ✅ v0.4.1: перетащил свой предмет В ЯЩИК — положить на хранение.
           ✅ v0.4.22: в сундук — то же, плюс КЛИК по своему предмету кладёт.
           ✅ v0.4.43: В ТРУП класть нельзя — только забирать */
        put: function (cbId, item, amt, fromIndex) {
          if (window.BrixCorpses && BrixCorpses.has(cbId)) return;
          if (isChestId(cbId)) { putChestLocal(cbId, item, amt, fromIndex); return; }
          putCrateLocal(cbId, item, amt, fromIndex);
        },
        close: function (closingId) {
          /* ✅ v0.4.22: крышка сундука закрывается — и у других игроков тоже */
          if (closingId && isChestId(closingId)) {
            if (window.BrixBuilding) BrixBuilding.chestLid(closingId, 0);
            if (BrixNet.sendChestAnim) BrixNet.sendChestAnim(closingId, 0);
          }
          // ✅ v0.3.9: controls.enabled вернёт сам tick (самовосстановление).
          //    Мышь возвращаем в игру через lockPointerSoon (авто-повтор,
          //    см. fix 0.4.5a): после Esc браузер не даёт захват сразу
          var canvas = document.querySelector('#gameMount canvas');
          if (canvas && BrixGame.state.phase === 'playing' && !isInvOpen()) {
            lockPointerSoon(canvas);
          }
        }
      });
    }

    if (window.BrixNet) {
      /* ✅ v0.4.0: ответ сервера снимает отложенный локальный урон */
      BrixNet.on('bhp', function (msg) { clearPendingHit(msg.id); BrixProps.applyHp(msg.id, msg.hp); });
      BrixNet.on('brk', function (msg) { clearPendingHit(msg.id); objApplyBrk(msg); });
      BrixNet.on('btaken', applyTaken);
      /* ✅ v0.3.8: лут ящика изменился (кто-то взял предмет) — у всех */
      BrixNet.on('cbloot', applyCrateLoot);
      /* ✅ v0.4.2: сервер отказал в оптимистичном взятии — откат */
      BrixNet.on('cbdeny', denyCrateTake);
      /* ✅ v0.3.8: сервер ответил на открытие ящика текущим лутом */
      BrixNet.on('cbopen', function (msg) {
        BrixLootMenu.open(msg.id, msg.loot, msg.mil ? 1 : 0);
      });
      /* ✅ v0.4.22 СУНДУК: сервер/другая вкладка прислала содержимое —
         обновляем запись сундука; если ЖДЁМ открытие (F) — открываем меню */
      BrixNet.on('chestst', function (msg) {
        if (window.BrixBuilding) BrixBuilding.setChestCont(msg.id, msg.cont);
        if (chestAwait && msg.id === chestAwait) {
          chestAwait = null;
          if (!BrixLootMenu.isOpen() && BrixLootMenu.openId() !== msg.id) {
            BrixLootMenu.open(msg.id, msg.cont || {}, 0, 'chest');
          } else {
            BrixLootMenu.update(msg.id, msg.cont || {});
          }
          return;
        }
        if (BrixLootMenu.openId() === msg.id) BrixLootMenu.update(msg.id, msg.cont || {});
      });
      /* ✅ v0.4.22: сервер отказал в взятии из сундука — откат */
      BrixNet.on('chestdeny', function (msg) { denyChestTake(msg); });
      /* ✅ v0.4.22: крышка сундука открылась/закрылась у ДРУГОГО игрока */
      BrixNet.on('chestanim', function (msg) {
        if (window.BrixBuilding) BrixBuilding.chestLid(msg.id, !!msg.open);
      });
      /* ✅ v0.4.44 ПЕЧКА: сервер/вкладки прислали состояние — обновляем
         модель (огонь) и меню, если оно открыто; отказ — откат предмета */
      if (window.BrixFurnace) {
        BrixNet.on('fust', window.BrixFurnace.onFust);
        BrixNet.on('fudenied', window.BrixFurnace.deny);
      }
      /* ✅ v0.3.8: пустой ящик вернулся с новым лутом — сразу у всех.
         ✅ v0.4.44: сервер сам выбирает ТИП ящика (модель меняется,
         если деревянный стал военным или наоборот) */
      BrixNet.on('cbrespawn', function (msg) {
        BrixProps.respawnCrate(msg.id, msg.loot, msg.mil);
      });
      /* ✅ v0.3.8: бочка вернулась по таймеру сервера */
      BrixNet.on('brespawn', function (msg) {
        BrixProps.respawnBarrel(msg.id);
      });
      // режим вкладок: заявка удара от другой вкладки
      BrixNet.on('bhitReq', function (msg) {
        if (BrixNet.mode !== 'tabs') return;
        objLocalDamage(msg.id, msg.tool || '');
      });
      // ✅ v0.3.6: счётчик пушит СЕРВЕР — мгновенно для каждого игрока.
      // ✅ v0.4.1: g — сколько из подключённых В ИГРЕ (остальные в меню)
      BrixNet.on('cnt', function (n, g) {
        window.__brixServerCount = n;
        window.__brixServerInGame = (typeof g === 'number') ? g : undefined;
      });
      /* ✅ v0.4.5 БОЙ: звук выстрела/перезарядки других игроков (по
         дистанции), попадания (ХП), смерти и возрождения */
      BrixNet.on('snd', function (msg) {
        if (!msg || msg.by === BrixNet.id) return;
        var d = 0;
        if (msg.x !== undefined) {
          var dx = controls.position.x - msg.x;
          var dz = controls.position.z - msg.z;
          d = Math.sqrt(dx * dx + dz * dz);
        }
        var vol = Math.max(0, 1 - d / SND_RADIUS);
        vol *= vol;                                  // квадрат затухания
        if (vol < 0.02) return;
        // ✅ v0.4.19: звуки дробовика идут своими kind'ами (sgshot/sgreload)
        // ✅ v0.4.21: звуки калаша — akshot/akreload
        // ✅ v0.4.35: звуки томпсона — tpshot (РАНДОМНЫЙ из трёх)/tpreload
        var sndMap = {
          reload: 'revReload', sgreload: 'revReload', sgshot: 'sgShot',
          akshot: 'akShot', akreload: 'akReload', tpreload: 'tpReload'
        };
        var sndName = sndMap[msg.k] || 'revShot';
        if (msg.k === 'tpshot') sndName = tpShots[Math.floor(Math.random() * tpShots.length)];
        BrixSfx.play(sndName,
          { volume: 0.9 * vol, jitter: 0.04 });
      });
      BrixNet.on('phit', onPlayerHit);
      /* ✅ v0.4.28: остаток хп детали дома (после удара) — звук/плашка «133 / 200» */
      BrixNet.on('bhp', onBuildHp);
      BrixNet.on('pdeath', onPlayerDeath);
      BrixNet.on('prespawn', function (msg) {
        if (msg.tid === BrixNet.id) { doRespawn(); return; }
        var rp = remotes[msg.tid];
        if (rp) rp.respawn();
      });
      /* ✅ v0.4.34 ХОЛОД: сервер пушит шкалу холода раз в секунду */
      BrixNet.on('cold', onColdMsg);
      /* ============================================================
         ✅ v0.4.43 С4 ПОД ПОЛНЫМ КОНТРОЛЕМ СЕРВЕРА. Сервер рассылает
         'c4placed' {id, x,y,z, n, ms} ВСЕМ — включая бросавшего:
         • чужой блок → спавним «чужой» armed-блок (взрыв — сервер);
         • СВОЙ эхо-блок → привязываем optimistic-блок к серверному id
           (позицию снапим к серверной) — взрыв придёт с id;
         • ms — остаток фьюза: зашёл позже — слышишь тыки с правильной
           фазы (c4ApplyPhase). ВАЖНО: до 0.4.43 net.js ТЕРЯЛ эти события
           (не было case в switch) — чужие игроки вообще не видели С4.
         ============================================================ */
      BrixNet.on('c4placed', function (msg) {
        if (!msg) return;
        var x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
        var mine = msg.by === BrixNet.id;
        if (mine && BrixNet.mode !== 'server') return;   // вкладки: свой блок уже есть
        var nA = msg.n || [0, 1, 0];
        var e = null;
        if (mine) {
          // сервер подтвердил МОЮ бомбу: ищем свой optimistic-блок рядом
          var best = 9, bi = -1;
          for (var i = 0; i < c4s.length; i++) {
            var c = c4s[i];
            if (!c.own || c.srvId || c.st !== 'armed') continue;
            var d2 = c.grp.position.distanceToSquared(new THREE.Vector3(x, y, z));
            if (d2 < best) { best = d2; bi = i; }
          }
          if (bi >= 0) {
            e = c4s[bi];
            e.grp.position.set(x, y, z);        // снап к серверной точке
            e.srvId = String(msg.id || '');
          } else {
            e = spawnC4(new THREE.Vector3(x, y, z), new THREE.Vector3(), true);
            e.st = 'armed';
            orientC4FromNormal(e, new THREE.Vector3(nA[0], nA[1], nA[2]).normalize());
            e.srvId = String(msg.id || '');
          }
        } else {
          for (var j = 0; j < c4s.length; j++) {
            if (c4s[j].srvId && c4s[j].srvId === msg.id) return;   // уже есть (снапшот)
          }
          e = spawnC4(new THREE.Vector3(x, y, z), new THREE.Vector3(), false);
          e.st = 'armed';
          orientC4FromNormal(e, new THREE.Vector3(nA[0], nA[1], nA[2]).normalize());
          e.srvId = String(msg.id || '');
        }
        if (e && msg.ms !== undefined) c4ApplyPhase(e, msg.ms);
      });
      /* ✅ v0.4.43 С4: ВЗРЫВАЕТ СЕРВЕР ('c4boom' с id — всем, включая
         бросавшего). Блок ищем по id, запасной путь — по позиции.
         Визал+звук у КАЖДОГО; в серверном режиме урон уже нанёс сервер */
      BrixNet.on('c4boom', function (msg) {
        if (!msg) return;
        var P = null;
        if (msg.id) {
          for (var i = c4s.length - 1; i >= 0; i--) {
            if (c4s[i].srvId === msg.id) {
              P = c4s[i].grp.position.clone();
              scene.remove(c4s[i].grp);
              c4s.splice(i, 1);
              break;
            }
          }
        }
        if (!P) {
          var x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
          if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
          P = new THREE.Vector3(x, y, z);
          for (var k = c4s.length - 1; k >= 0; k--) {
            var e = c4s[k];
            if (e.grp.position.distanceTo(P) < 2.0) {
              var own = e.own;
              c4s.splice(k, 1);
              scene.remove(e.grp);
              if (own && BrixNet.mode !== 'server') c4LocalDamage(P.clone());
            }
          }
        }
        c4BoomFx(P);   // визуал+звук взрыва (сервер уже нанёс урон)
      });
      /* ✅ v0.4.43 ОБЛОМКИ: взрыв снёс постройки — у всех игроков детали
         распадаются на 5×5 кусков, падают на землю и растворяются */
      BrixNet.on('debris', function (msg) {
        spawnDebris((msg && msg.list) || []);
      });
      /* ✅ v0.4.43 ТРУПЫ-ЛУТБОКСЫ: появление/лут/скрытие — всё через
         BrixCorpses (он сам различает сервер/вкладки/соло) */
      if (window.BrixCorpses) {
        BrixNet.on('corpseNew', BrixCorpses.onNet);
        BrixNet.on('corpseLoot', BrixCorpses.onNet);
        BrixNet.on('corpseGone', BrixCorpses.onNet);
        BrixNet.on('corpseDeny', BrixCorpses.onNet);
      }
    }

    function findTreeByHit(hitObj, instanceId) {
      if (!decor) return null;
      if (decor.treeMeshes && decor.treeMeshes.indexOf(hitObj) >= 0) {
        return decor.trees[instanceId] || null;
      }
      return null;
    }

    /** ✅ v0.2.9: этот меш дерева — СТВОЛ? (материал «Trank»).
        Рубить можно только ствол: удар по листве не даёт древесины. */
    function isTrunkMesh(hitObj) {
      return !!(decor && decor.trunkMeshes && decor.trunkMeshes.indexOf(hitObj) >= 0);
    }

    function findOreByHit(hitObj, instanceId) {
      if (!decor || !decor.oreTargets) return null;
      for (var i = 0; i < decor.oreTargets.length; i++) {
        if (decor.oreTargets[i].mesh === hitObj) {
          return decor.oreTargets[i].mesh.userData.records[instanceId] || null;
        }
      }
      return null;
    }

    /* ✅ удар топором по дереву. Дерево содержит 56–80 древесины
       (world.js), топор снимает свою норму за удар (каменный 2,
       железный 4); когда дерево «пустое» — оно падает */
    function hitTree(rec, tool) {
      if (!rec || rec.state === 'falling' || rec.state === 'fallen' || rec.state === 'gone') return;
      rec.shakeT = 0.35;
      if (rec.state === 'alive') rec.state = 'shake';
      BrixSfx.play('chop1', { volume: 0.9 });
      var wood = tool === 'ironAxe' ? IRON_AXE_WOOD : STONE_AXE_WOOD;
      // не снять больше, чем в дереве осталось
      if (rec.woodLeft !== undefined && rec.woodLeft < wood) wood = Math.max(rec.woodLeft, 0);
      inventory.addItem('wood', wood);
      inventory.showPickup('wood', wood);
      if (rec.woodLeft !== undefined) rec.woodLeft -= wood;
      var fell = 0;
      if (rec.woodLeft <= 0) {
        rec.state = 'falling';
        rec.fallT = 0;
        rec.fallDir = Math.random() > 0.5 ? 1 : -1;
        fell = 1;
        BrixSfx.play('treeFall', { volume: 1 });
      }
      // ✅ v0.3.2: шлём и ЗАПРОС (сервер решает сам), и ГОТОВЫЙ РЕЗУЛЬТАТ
      // (остаток/«упало»/сторона) — чтобы вкладки без сервера тоже сходились
      BrixNet.sendHit('tree', null, rec.i, wood, rec.woodLeft, fell,
        rec.fallDir || 1);
    }

    /* ✅ удар киркой по рудной жиле: железо / сера / камень.
       В жиле фиксированный запас (сера 20, железо 40, камень 60),
       кирка снимает свою норму за удар (каменная 2, железная 4).
       Звуки — сэмплы «Stone Hit / Stone Break» из референс-репозитория */
    function hitOre(rec, tool) {
      if (!rec || rec.state !== 'alive') return;
      rec.shakeT = 0.3;
      rec.state = 'shake';
      BrixSfx.play(stoneHits[Math.floor(Math.random() * stoneHits.length)],
        { volume: 0.85, jitter: 0.08 });
      var itemId = rec.type === 'iron' ? 'iron'
                 : rec.type === 'sulfur' ? 'sulfur' : 'stone';
      var amount = tool === 'ironPickaxe' ? IRON_PICK_YIELD : STONE_PICK_YIELD;
      // не снять больше, чем осталось в жиле
      if (rec.left !== undefined && rec.left < amount) amount = Math.max(rec.left, 0);
      inventory.addItem(itemId, amount);
      inventory.showPickup(itemId, amount);
      if (rec.left !== undefined) rec.left -= amount;
      var broke = 0;
      if (rec.left <= 0) {
        decor.hideOre(rec);
        broke = 1;
        BrixSfx.play('stoneBreak', { volume: 0.95 });   // жила рассыпалась
      }
      // ✅ v0.3.2: и ЗАПРОС серверу, и готовый результат для вкладок
      BrixNet.sendHit('ore', rec.type, rec.i, amount, rec.left, broke, 1);
    }

    function hitWithTool() {
      if (toolCooldown > 0) return;
      var sel0 = inventory.getSelectedItem();
      var tool0 = sel0 && sel0.tool;
      // ✅ v0.4.40 БУЛАВА: ДОЛГИЙ ЗАМАХ — свой кулдаун (1.85 с) и свой клип
      //    maceAtk (рука уходит вверх-назад ~1.1 с и жёсткий удар вниз);
      //    урон приходит ПОЗЖЕ (MACE_WINDUP_MS) — точно на контакт.
      // ✅ v0.2.10 железная кирка — теперь ТОЖЕ держится одной рукой и машет
      //    одним ударом вперёд (atk1), точно как железный топор;
      //    железный топор — один удар atk1;
      //    каменный топор и каменная кирка — два чередующихся замаха (как раньше)
      var isMace = tool0 === 'mace';
      toolCooldown = isMace ? MACE_COOLDOWN : TOOL_ANIM_DURATION;
      var kind;
      if (isMace) kind = 'maceAtk';
      else if (tool0 === 'ironPickaxe' || tool0 === 'ironAxe') kind = 'atk1';
      else kind = (swingCounter++ % 2 === 0) ? 'atk1' : 'atk2';
      /* ✅ v0.4.40: чужим игрокам уходит maceAtk (у remoteplayer.js есть
         своя длинная анимация замаха булавой — ANIM_DUR.maceAtk 1.7 с) */
      lastSwingKind = isMace ? 'maceAtk' : kind;
      hands.triggerSwing(kind);
      BrixSfx.play('chop2', { volume: isMace ? 0.5 : 0.35, rate: isMace ? 0.8 : 1 });

      // hit detection ОТЛОЖЕН до hit-frame анимации (как в репозитории);
      // ✅ v0.4.40 у булавы — на конец замаха (1.2 с), у остальных сразу
      setTimeout(function () {
        if (cancelled || BrixGame.state.phase !== 'playing') return;
        var sel = inventory.getSelectedItem();
        var tool = sel && sel.tool;
        raycaster.setFromCamera(screenCenter, camera);
        raycaster.far = TOOL_RANGE;
        var targets = [];
        // ✅ v0.2.9 топоры (каменный и железный) рубят ТОЛЬКО СТВОЛ:
        // в цели идут стволовые меши дерева (материал «Trank») и земля.
        // Листва в луче не участвует — удар по листве не даёт древесины
        // (луч проходит сквозь неё мимо ствола → нечего рубить).
        // ✅ v0.4.40 булава деревья/руды НЕ добывает — она оружие:
        // в цели только земля (проверка ствола ниже всё равно отсечёт).
        if (decor) {
          if ((tool === 'axe' || tool === 'ironAxe') && decor.trunkMeshes && decor.trunkMeshes.length) {
            decor.trunkMeshes.forEach(function (m) { targets.push(m); });
          }
          if ((tool === 'pickaxe' || tool === 'ironPickaxe') && decor.oreTargets) {
            decor.oreTargets.forEach(function (o) { targets.push(o.mesh); });
          }
        }
        if (terrain) targets.push(terrain);
        if (!targets.length) return;
        // ✅ v0.3.6: сначала ПРОПСЫ (бочки/ящики чекблоков) — они ближе.
        // ✅ v0.4.0: бочки ломаются и КУЛАКОМ (без инструмента) — раньше
        //    пустая рука вообще не била по бочкам и игрок думал, что
        //    «бочки не ломаются»
        // ✅ v0.4.40 булава тоже ломает бочки (как железные инструменты)
        if (window.BrixProps && (tool === 'axe' || tool === 'ironAxe' ||
            tool === 'pickaxe' || tool === 'ironPickaxe' || tool === 'mace' || !tool)) {
          var propTargets = BrixProps.barrelTargets().concat(BrixProps.crateTargets());
          if (propTargets.length) {
            var propHits = raycaster.intersectObjects(propTargets, true);
            if (propHits.length) {
              // ✅ v0.3.9: НЕВИДИМЫЙ ХИТБОКС ЯЩИКА НЕ ПРЕГРАЖДАЕТ УДАР.
              //    Раньше бралось ПЕРВОЕ попадание: если перед бочкой стоял
              //    хитбокс ящика (1.8 м vs 2.1 м), удар «съедался» об него —
              //    бочки за ящиком казались неломаемыми (жалоба игрока).
              //    Как в репозитории: ящик реагирует только на F, а ЛКМ
              //    ищет первую БОЧКУ вдоль луча
              var barrelProp = null;
              for (var hi = 0; hi < propHits.length; hi++) {
                var pp = BrixProps.findProp(propHits[hi].object);
                if (pp && pp.kind === 'barrel') { barrelProp = pp; break; }
              }
              if (barrelProp) { hitProp(barrelProp, tool); return; }
            }
          }
        }
        /* ✅ v0.4.31 ЛОМАНИЕ ПОСТРОЕК: ЛКМ по детали дома — топоры/кирки
           снимают ХП (фундамент 350, остальные постройки 300, сундук 25;
           урон дробный: 1 хп за 5/4/2/3 удара). ХП — АВТОРИТЕТ СЕРВЕРА
           (bhit → bhp/brem); в соло/вкладках — локальный урон. Проверка
           ДО ПВП: стена честно заслоняет игрока за ней от удара */
        /* ✅ fix v0.4.30: было window.BrixBuildings (ОПЕЧАТКА, множественное
           число) — глобал от building.js называется window.BrixBuilding
           (единственное число, см. building.js:49). Из-за опечатки ветка
           удара по постройкам НИКОГДА не выполнялась: в соло урон не
           считался, в мультиплеере не уходил bhit — «постройки не
           ломаются, хп-панели нет» */
        if (window.BrixBuilding && (tool === 'axe' || tool === 'ironAxe' ||
            tool === 'pickaxe' || tool === 'ironPickaxe' || tool === 'mace')) {
          // ✅ v0.4.40 булава ломает постройки по 2 хп за удар (BUILD_DMG.mace)
          var bgs = BrixBuilding.hitTargets();
          if (bgs.length) {
            var bhits = raycaster.intersectObjects(bgs, true);
            if (bhits.length && bhits[0].distance <= TOOL_RANGE) {
              var piece = BrixBuilding.findPiece(bhits[0].object);
              if (piece) {
                BrixSfx.play('chop1', { volume: 0.6, jitter: 0.08 });
                if (BrixNet.mode === 'server') {
                  BrixNet.send({ t: 'bhit', id: piece.id, tool: tool });
                } else {
                  var lh = BrixBuilding.localHit(piece.id, tool);
                  if (lh && lh.dead) BrixSfx.play('chop2', { volume: 0.9 });
                  else if (lh) onBuildHp(lh);
                }
                return;
              }
            }
          }
        }
        // ✅ v0.4.5 ПВП ИНСТРУМЕНТАМИ: попал лучом в ЧУЖОГО ИГРОКА —
        //    ✅ v0.4.40 НОВАЯ ТАБЛИЦА + ЗОНЫ: каменный топор 13 (тело 7),
        //    каменная кирка 14 (7), железные топор/кирка 24 (12),
        //    БУЛАВА 97 (49) — в голову полный урон, в тело половина.
        //    Белый хит-маркер — тело, КРАСНЫЙ — голова.
        //    Револьвер сюда не доходит — у него своя ветка tryShoot()
        var pidGroups = [];
        for (var pk in remotes) {
          if (!remotes[pk].dead) pidGroups.push(remotes[pk].group);
        }
        if (pidGroups.length) {
          raycaster.camera = camera;   // ✅ v0.4.5: спрайты (ник/хп) требуют camera
          var uHits = raycaster.intersectObjects(pidGroups, true);
          if (uHits.length && uHits[0].distance <= TOOL_RANGE) {
            var victim = findPid(uHits[0].object);
            if (victim) {
              // ✅ v0.4.40: ЗОНА попадания (голова/тело) по высоте точки удара
              var mzone = hitZone(uHits[0].point, remotes[victim]);
              var mdmg = dmgByZone(MELEE_HEAD[tool] || 10, mzone);
              // ✅ v0.4.28: + tool — в меню смерти жертвы (как в Rust)
              // ✅ v0.4.40: + hs — «В ГОЛОВУ» в меню смерти жертвы
              BrixNet.sendPhit(victim, mdmg, 'melee', tool, mzone === 'head' ? 1 : 0);
              if (window.BrixHitmarker) BrixHitmarker.show(mzone, { big: mzone === 'head' });
              BrixSfx.play('metalHit', { volume: 0.5, jitter: 0.1 });
              return;
            }
          }
        }
        var hits = raycaster.intersectObjects(targets, false);
        if (hits.length === 0) return;
        var first = hits[0];
        if (tool === 'pickaxe' || tool === 'ironPickaxe') {
          var ore = findOreByHit(first.object, first.instanceId);
          if (ore) hitOre(ore, tool);
        } else {
          // ✅ v0.2.9: рубим ТОЛЬКО если луч попал в СТВОЛ. Попал в листву
          //    (или в землю перед деревом) — дерево не трясётся, древесины нет.
          if (!isTrunkMesh(first.object)) return;
          var rec = findTreeByHit(first.object, first.instanceId);
          if (rec) hitTree(rec, tool);
        }
      }, TOOL_HIT_FRAME * 1000);
    }

    /* ================= ✅ v0.4.5: БОЙ — РЕВОЛЬВЕР И ПВП =================
       Крестик из 4 палок показывает РЕАЛЬНЫЙ разброс пули (стоит/идёшь/
       бежишь/в прыжке — палки разъезжаются; при прицеливании остаются
       точка и прозрачный крестик). ХП игроков 100: пуля 20, железные
       инструменты 10, каменные 5. Смерть → окно с возрождением. */

    var combatHud = null;
    function buildCombatHud() {
      if (combatHud) return combatHud;
      combatHud = {};

      // крестик: точка + 4 палки (разброс двигает палки от центра).
      // ✅ fix 0.4.5a: стили прицела дублируем инлайн — если у игрока старый
      // css/game.css (без правил .xh-dot/.xh-stick), точка всё равно видна
      var cw = document.querySelector('#gameHud .cross-wrap');
      if (cw) {
        cw.style.cssText =
          'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);' +
          'width:0;height:0;z-index:5;pointer-events:none;';
        cw.innerHTML =
          '<div class="xh-dot"></div>' +
          '<div class="xh-stick xh-t"></div><div class="xh-stick xh-b"></div>' +
          '<div class="xh-stick xh-l"></div><div class="xh-stick xh-r"></div>';
        combatHud.cross = cw;
        combatHud.sticks = {
          t: cw.querySelector('.xh-t'), b: cw.querySelector('.xh-b'),
          l: cw.querySelector('.xh-l'), r: cw.querySelector('.xh-r')
        };
        combatHud.dot = cw.querySelector('.xh-dot');
        if (combatHud.dot) combatHud.dot.style.cssText =
          'position:absolute;left:50%;top:50%;width:4px;height:4px;' +
          'transform:translate(-50%,-50%);border-radius:50%;' +
          'background:#f0ead8;box-shadow:0 0 4px rgba(0,0,0,.9);';
        var XH_STICK = 'position:absolute;left:50%;top:50%;' +
          'background:#f0ead8;box-shadow:0 0 3px rgba(0,0,0,.9);' +
          'transition:opacity .12s ease;transform:translate(-50%,-50%);opacity:0.9;';
        for (var sk in combatHud.sticks) {
          var se = combatHud.sticks[sk];
          if (se) se.style.cssText = XH_STICK +
            (sk === 't' || sk === 'b' ? 'width:2px;height:9px;' : 'width:9px;height:2px;');
        }
      }

      // счётчик обоймы/запаса у прицела (6 | 50) — стили инлайн (fix 0.4.5a)
      var mag = document.createElement('div');
      mag.id = 'brixMagHud';
      mag.style.cssText = 'position:absolute;left:50%;top:53%;transform:translateX(-50%);' +
        'z-index:6;display:none;font:700 15px Oswald,sans-serif;letter-spacing:.12em;' +
        'color:#f2ead6;text-shadow:0 1px 3px rgba(0,0,0,.9);pointer-events:none;';
      (hudEl || document.body).appendChild(mag);
      combatHud.mag = mag;

      // полоска здоровья — стили инлайн (fix 0.4.5a)
      var hp = document.createElement('div');
      hp.id = 'brixHpWrap';
      hp.style.cssText = 'position:absolute;left:14px;bottom:76px;width:210px;height:20px;' +
        'z-index:6;background:rgba(8,9,8,0.72);border:1px solid rgba(255,255,255,0.14);' +
        'pointer-events:none;';
      hp.innerHTML = '<div class="fill"></div><span class="txt">100</span>';
      (hudEl || document.body).appendChild(hp);
      combatHud.hp = hp;
      combatHud.hpFill = hp.querySelector('.fill');
      combatHud.hpTxt = hp.querySelector('.txt');
      combatHud.hpFill.style.cssText = 'height:100%;width:100%;background:#c9e6b8;' +
        'transition:width .18s ease,background .18s ease;';
      combatHud.hpTxt.style.cssText = 'position:absolute;left:50%;top:50%;' +
        'transform:translate(-50%,-50%);font:700 12px Oswald,sans-serif;' +
        'letter-spacing:.1em;color:#f4efe4;text-shadow:0 1px 2px rgba(0,0,0,.9);';

      // красная вспышка при получении урона — стили инлайн (fix 0.4.5a)
      var dmg = document.createElement('div');
      dmg.id = 'brixDmgFlash';
      dmg.style.cssText = 'position:absolute;inset:0;z-index:7;' +
        'background:radial-gradient(ellipse at center,rgba(180,30,20,0) 42%,' +
        'rgba(180,30,20,0.55) 100%);opacity:0;pointer-events:none;';
      (hudEl || document.body).appendChild(dmg);
      combatHud.flash = dmg;

      /* ============================================================
         ✅ v0.4.34 ХОЛОД: ИНЕЙ ПО УГЛАМ ЭКРАНА.
         4 угловых «ледяных» пятна + полосы по верх/низ. Прозрачность
         = шкала холода: появился в зиме → постепенно нарастает →
         вышел в тепло → экран ПОСТЕПЕННО РАЗМОРАЖИВАЕТСЯ (transition).
         Стили инлайн (как в fix 0.4.5a) — не зависят от css */
      var frost = document.createElement('div');
      frost.id = 'brixColdFrost';
      frost.style.cssText = 'position:absolute;inset:0;z-index:4;pointer-events:none;' +
        'opacity:0;transition:opacity .9s ease;';
      var ICE_T = 'rgba(228,243,255,';   // иней — полупрозрачный ледяной бело-голубой
      frost.innerHTML =
        '<div class="cf cf-tl"></div><div class="cf cf-tr"></div>' +
        '<div class="cf cf-bl"></div><div class="cf cf-br"></div>' +
        '<div class="cf cf-top"></div><div class="cf cf-bot"></div>';
      (hudEl || document.body).appendChild(frost);
      combatHud.frost = frost;
      var cfCss = {
        'cf-tl': 'left:0;top:0;width:46%;height:46%;background:' +
          'radial-gradient(circle at 0% 0%,' + ICE_T + '0.95) 0%,' + ICE_T + '0.55) 30%,' +
          ICE_T + '0.22) 55%,' + ICE_T + '0.08) 70%,transparent 80%),' +
          'linear-gradient(135deg,transparent 30%,' + ICE_T + '0.45) 39%,' +
          'transparent 49%,' + ICE_T + '0.3) 58%,transparent 67%);',
        'cf-tr': 'right:0;top:0;width:46%;height:46%;background:' +
          'radial-gradient(circle at 100% 0%,' + ICE_T + '0.95) 0%,' + ICE_T + '0.55) 30%,' +
          ICE_T + '0.22) 55%,' + ICE_T + '0.08) 70%,transparent 80%),' +
          'linear-gradient(225deg,transparent 30%,' + ICE_T + '0.45) 39%,' +
          'transparent 49%,' + ICE_T + '0.3) 58%,transparent 67%);',
        'cf-bl': 'left:0;bottom:0;width:46%;height:46%;background:' +
          'radial-gradient(circle at 0% 100%,' + ICE_T + '0.95) 0%,' + ICE_T + '0.55) 30%,' +
          ICE_T + '0.22) 55%,' + ICE_T + '0.08) 70%,transparent 80%),' +
          'linear-gradient(45deg,transparent 30%,' + ICE_T + '0.45) 39%,' +
          'transparent 49%,' + ICE_T + '0.3) 58%,transparent 67%);',
        'cf-br': 'right:0;bottom:0;width:46%;height:46%;background:' +
          'radial-gradient(circle at 100% 100%,' + ICE_T + '0.95) 0%,' + ICE_T + '0.55) 30%,' +
          ICE_T + '0.22) 55%,' + ICE_T + '0.08) 70%,transparent 80%),' +
          'linear-gradient(315deg,transparent 30%,' + ICE_T + '0.45) 39%,' +
          'transparent 49%,' + ICE_T + '0.3) 58%,transparent 67%);',
        'cf-top': 'left:0;right:0;top:0;height:16%;background:' +
          'linear-gradient(180deg,' + ICE_T + '0.65) 0%,' + ICE_T + '0.28) 45%,transparent 90%);',
        'cf-bot': 'left:0;right:0;bottom:0;height:16%;background:' +
          'linear-gradient(0deg,' + ICE_T + '0.65) 0%,' + ICE_T + '0.28) 45%,transparent 90%);'
      };
      for (var cfk in cfCss) {
        var cfEl = frost.querySelector('.' + cfk);
        if (cfEl) cfEl.style.cssText = 'position:absolute;pointer-events:none;' + cfCss[cfk];
      }

      /* ============================================================
         ✅ v0.4.36 РЕВОЛЬВЕР-КАРАБИН 3×: ОВЕРЛЕЙ ОПТИКИ.
         В прицеле (ПКМ) камера наезжает зумом до 26° (честные 3×),
         а оверлей рисует чёрную виньетку с КРУГЛЫМ полем зрения +
         прицельную сетку (тонкое перекрестие, метки, точка) и
         подпись «3×». Прозрачность плавно следует за прогрессом
         прицеливания: на полном прицеле виден ТОЛЬКО круг оптики.
         Стили инлайн (как в fix 0.4.5a) — не зависят от css */
      var scope = document.createElement('div');
      scope.id = 'brixScope';
      scope.style.cssText = 'position:absolute;inset:0;z-index:4;pointer-events:none;display:none;opacity:0;';
      scope.innerHTML =
        '<div class="sc-vig"></div>' +
        '<div class="sc-glass"></div>' +
        '<div class="sc-ring"></div>' +
        '<div class="sc-cross"></div>' +
        '<div class="sc-tick sc-t1"></div><div class="sc-tick sc-t2"></div>' +
        '<div class="sc-tick sc-t3"></div><div class="sc-tick sc-t4"></div>' +
        '<div class="sc-dot"></div>' +
        '<div class="sc-zoom font-h">3×</div>';
      (hudEl || document.body).appendChild(scope);
      combatHud.scope = scope;
      var scVig = scope.querySelector('.sc-vig');
      if (scVig) scVig.style.cssText = 'position:absolute;inset:0;pointer-events:none;' +
        'background:radial-gradient(circle at 50% 50%,' +
        'transparent 0 24vmin,rgba(4,5,6,0.72) 32vmin,rgba(2,3,4,0.97) 40vmin,#010203 44vmin);';
      var scGlass = scope.querySelector('.sc-glass');
      if (scGlass) scGlass.style.cssText = 'position:absolute;left:50%;top:50%;width:57vmin;height:57vmin;' +
        'transform:translate(-50%,-50%);border-radius:50%;pointer-events:none;' +
        'background:radial-gradient(circle at 42% 38%,rgba(190,220,235,0.09) 0%,' +
        'transparent 34%,rgba(70,110,130,0.10) 62%,rgba(20,40,52,0.42) 88%,rgba(8,16,22,0.65) 100%);' +
        'box-shadow:inset 0 0 3vmin rgba(0,0,0,0.55);';
      var scRing = scope.querySelector('.sc-ring');
      if (scRing) scRing.style.cssText = 'position:absolute;left:50%;top:50%;width:58vmin;height:58vmin;' +
        'transform:translate(-50%,-50%);border-radius:50%;pointer-events:none;' +
        'border:3px solid #0a0c0e;box-shadow:0 0 14px rgba(0,0,0,0.8),inset 0 0 2vmin rgba(0,0,0,0.85);';
      var scCross = scope.querySelector('.sc-cross');
      if (scCross) scCross.style.cssText = 'position:absolute;left:50%;top:50%;width:56vmin;height:56vmin;' +
        'transform:translate(-50%,-50%);pointer-events:none;' +
        'background:linear-gradient(rgba(8,14,10,0.9),rgba(8,14,10,0.9)) center/100% 1.5px no-repeat,' +
        'linear-gradient(rgba(8,14,10,0.9),rgba(8,14,10,0.9)) center/1.5px 100% no-repeat;';
      // метки-милидоты (влево/вправо/вверх/вниз на 8vmin)
      var scTickCss = {
        'sc-t1': 'left:calc(50% - 9vmin);top:50%;width:2vmin;height:2.5px;',
        'sc-t2': 'left:calc(50% + 7vmin);top:50%;width:2vmin;height:2.5px;',
        'sc-t3': 'left:50%;top:calc(50% - 9vmin);width:2.5px;height:2vmin;',
        'sc-t4': 'left:50%;top:calc(50% + 7vmin);width:2.5px;height:2vmin;'
      };
      for (var sck in scTickCss) {
        var scT = scope.querySelector('.' + sck);
        if (scT) scT.style.cssText = 'position:absolute;transform:translate(-50%,-50%);' +
          'background:rgba(8,14,10,0.88);pointer-events:none;' + scTickCss[sck];
      }
      var scDot = scope.querySelector('.sc-dot');
      if (scDot) scDot.style.cssText = 'position:absolute;left:50%;top:50%;width:4px;height:4px;' +
        'transform:translate(-50%,-50%);border-radius:50%;pointer-events:none;' +
        'background:#0a100c;box-shadow:0 0 0 1px rgba(230,240,235,0.35);';
      var scZoom = scope.querySelector('.sc-zoom');
      if (scZoom) scZoom.style.cssText = 'position:absolute;left:50%;top:calc(50% + 14.5vmin);' +
        'transform:translateX(-50%);pointer-events:none;' +
        'font:700 13px Oswald,sans-serif;letter-spacing:.2em;color:rgba(214,228,224,0.78);' +
        'text-shadow:0 1px 2px rgba(0,0,0,.8);';

      /* ============================================================
         ✅ v0.4.34 ХОЛОД: БАННЕР ТЕМПЕРАТУРЫ КАК НА ФОТО.
         Красная плашка вверху по центру: термометр + «ХОЛОДНО /
         СЛИШКОМ ХОЛОДНО» + значение «-11°» + ШКАЛА холода (полоска).
         С 30 холода плашка пульсирует (класс danger — css/game.css)
         ============================================================ */
      var coldBan = document.createElement('div');
      coldBan.id = 'brixColdBanner';
      coldBan.style.cssText = 'position:absolute;left:50%;top:14px;transform:translateX(-50%);' +
        'z-index:6;display:flex;align-items:center;gap:12px;padding:8px 16px 8px 12px;' +
        'background:linear-gradient(180deg,rgba(178,26,14,0.94),rgba(118,14,6,0.94));' +
        'border:1px solid rgba(255,140,100,0.5);box-shadow:0 6px 24px rgba(0,0,0,.5);' +
        'opacity:0;transition:opacity .4s ease;pointer-events:none;';
      coldBan.innerHTML =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" ' +
        'stroke="#ffd9c9" stroke-width="2" stroke-linecap="round" ' +
        'stroke-linejoin="round">' +
        '<path d="M12 4a2 2 0 0 1 2 2v8.3a4.2 4.2 0 1 1-4 0V6a2 2 0 0 1 2-2z"/>' +
        '<line x1="12" y1="9.5" x2="12" y2="14"/></svg>' +
        '<div class="ctxt">' +
          '<span class="clabel font-h"></span>' +
          '<div class="cbar"><div class="cfill"></div></div>' +
        '</div>' +
        '<div class="ctemp font-h"></div>';
      (hudEl || document.body).appendChild(coldBan);
      combatHud.cold = coldBan;
      var coldLbl = coldBan.querySelector('.clabel');
      if (coldLbl) coldLbl.style.cssText =
        'font:700 13px Oswald,sans-serif;letter-spacing:.16em;color:#ffe4d4;' +
        'text-shadow:0 1px 2px rgba(0,0,0,.7);white-space:nowrap;';
      var coldBar = coldBan.querySelector('.cbar');
      if (coldBar) coldBar.style.cssText =
        'width:170px;height:4px;background:rgba(0,0,0,0.55);margin-top:4px;';
      var coldFill = coldBan.querySelector('.cfill');
      if (coldFill) coldFill.style.cssText =
        'height:100%;width:0%;background:#ffb066;transition:width .5s ease;';
      var coldTemp = coldBan.querySelector('.ctemp');
      if (coldTemp) coldTemp.style.cssText =
        'font:700 16px Oswald,sans-serif;color:#fff;min-width:46px;text-align:right;' +
        'text-shadow:0 1px 3px rgba(0,0,0,.8);';

      // окно смерти с возрождением — стили инлайн (fix 0.4.5a)
      var ds = document.createElement('div');
      ds.id = 'brixDeath';
      ds.className = 'hidden';
      ds.style.cssText = 'position:fixed;inset:0;z-index:220;display:grid;' +
        'place-items:center;background:rgba(13,10,8,0.93);';
      /* ✅ v0.4.44 МЕНЮ СМЕРТИ ПО РЕФЕРЕНСУ (H1Z1 «YOU DIED», фото игрока):
         ОДНО окно СВЕРХУ со ВСЕМИ подробностями в строчку — ПРОЖИЛ /
         УБИЛ (ник) / ОРУЖИЕ / ДИСТАНЦИЯ (сколько метров), ниже —
         КАРТА МИРА ГЛАДКАЯ (та же, что в мини-меню M — не пиксельная!),
         с зелёными точками игроков и красным черепом на месте смерти,
         внизу — кнопки возрождения (оранжевая ВОЗРОДИТЬСЯ + тёмная
         СЛУЧАЙНОЕ МЕСТО) */
      ds.innerHTML =
        '<div class="brix-death-top">' +
          '<div class="brix-death-title font-h">' + BrixState.t('death.title') + '</div>' +
          '<div class="brix-death-rows">' +
            '<span class="drow font-h" id="brixDthAlive"></span>' +
            '<span class="drow font-h" id="brixDeathKiller"></span>' +
            '<span class="drow font-h" id="brixDthWep"></span>' +
            '<span class="drow font-h" id="brixDthDist"></span>' +
          '</div>' +
        '</div>' +
        '<canvas id="brixDthMap" width="900" height="560"></canvas>' +
        '<div class="brix-death-btns">' +
          '<button class="respawn font-h" id="brixRespawnBtn">' + BrixState.t('death.btn') + '</button>' +
          '<button class="rnd font-h" id="brixRespawnRnd">' + BrixState.t('death.random') + '</button>' +
        '</div>';
      document.body.appendChild(ds);
      /* одно окно сверху: тёмная плашка во всю ширину сверху */
      var dtop = ds.querySelector('.brix-death-top');
      if (dtop) dtop.style.cssText = 'position:absolute;top:0;left:0;right:0;' +
        'padding:14px 40px 12px;background:rgba(24,14,10,0.92);' +
        'border-bottom:1px solid rgba(255,130,90,0.4);box-shadow:0 14px 50px rgba(0,0,0,.6);' +
        'display:flex;align-items:center;gap:26px;flex-wrap:wrap;';
      var dtitle = ds.querySelector('.brix-death-title');
      if (dtitle) dtitle.style.cssText = 'font-size:24px;font-weight:700;letter-spacing:.2em;' +
        'text-transform:uppercase;color:#ff6a4e;white-space:nowrap;' +
        'text-shadow:0 2px 6px rgba(0,0,0,.55);';
      var drows = ds.querySelector('.brix-death-rows');
      if (drows) drows.style.cssText = 'display:flex;gap:22px;flex-wrap:wrap;align-items:center;flex:1;';
      var drowCss = 'font:700 15px/1.4 Consolas,monospace;letter-spacing:.06em;color:#ffd9c9;white-space:nowrap;';
      ds.querySelectorAll('.drow').forEach(function (el) { el.style.cssText = drowCss; });
      var dkiller = ds.querySelector('#brixDeathKiller');
      if (dkiller) dkiller.style.cssText = drowCss + 'color:#fff;';
      var dmap = ds.querySelector('#brixDthMap');
      if (dmap) dmap.style.cssText = 'position:absolute;left:50%;top:54%;transform:translate(-50%,-50%);' +
        'width:min(880px,78vw);height:auto;background:#0d1812;border:2px solid #6b5a44;' +
        'border-radius:4px;box-shadow:0 20px 70px rgba(0,0,0,.7), inset 0 0 90px rgba(0,0,0,.35);';
      var dbtn = ds.querySelector('.respawn');
      if (dbtn) dbtn.style.cssText = 'min-width:250px;padding:14px 30px;' +
        'font-size:15px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;' +
        'background:linear-gradient(180deg,#d86a1e,#a8430e);border:1px solid #ffb066;' +
        'color:#fff;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.5);';
      var drnd = ds.querySelector('.rnd');
      if (drnd) drnd.style.cssText = 'min-width:250px;padding:14px 30px;' +
        'font-size:15px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;' +
        'background:rgba(28,24,20,0.95);border:1px solid #6b5a44;color:#e8ddc4;cursor:pointer;' +
        'box-shadow:0 8px 24px rgba(0,0,0,.5);';
      var dbtns = ds.querySelector('.brix-death-btns');
      if (dbtns) dbtns.style.cssText = 'position:absolute;left:50%;bottom:5.5%;' +
        'transform:translateX(-50%);display:flex;gap:16px;';
      combatHud.death = ds;
      combatHud.killerEl = ds.querySelector('#brixDeathKiller');
      combatHud.aliveEl = ds.querySelector('#brixDthAlive');
      combatHud.wepEl = ds.querySelector('#brixDthWep');
      combatHud.distEl = ds.querySelector('#brixDthDist');
      ds.querySelector('#brixRespawnBtn').onclick = function () {
        if (window.menuAudio) menuAudio.click();
        if (BrixNet.mode === 'server') {
          BrixNet.sendRespawn();   // сервер оживит меня ДЛЯ ОСТАЛЬНЫХ
          doRespawn();             // ✅ себя оживляем сразу: сервер не шлёт
        }                          // prespawn обратно отправителю
        else doRespawn();          // вкладки/соло — сами себя оживляем
      };
      /* ✅ v0.4.28: СЛУЧАЙНОЕ МЕСТО — как RANDOM RESPAWN на фото */
      ds.querySelector('#brixRespawnRnd').onclick = function () {
        if (window.menuAudio) menuAudio.click();
        var pt = randomSpawnPt();
        if (BrixNet.mode === 'server') BrixNet.sendRespawn();
        doRespawn(pt || undefined);
      };
      return combatHud;
    }

    function setMyHp(hp) {
      myHp = Math.max(0, Math.min(PLAYER_MAX_HP, hp));
      if (!combatHud) return;
      combatHud.hpFill.style.width = (myHp * 100 / PLAYER_MAX_HP) + '%';
      combatHud.hpTxt.textContent = String(Math.round(myHp));
      combatHud.hpFill.style.background =
        myHp > 55 ? '#c9e6b8' : myHp > 25 ? '#e8c96a' : '#e0685c';
    }

    function flashDamage() {
      if (!combatHud) return;
      var f = combatHud.flash;
      f.style.transition = 'none';
      f.style.opacity = '0.5';
      requestAnimationFrame(function () {
        f.style.transition = 'opacity 0.45s ease-out';
        f.style.opacity = '0';
      });
    }

    /* ✅ v0.4.28: время выживания — от первого входа в мир и от каждого респавна */
    var aliveSince = Date.now();

    /** «2д 3ч 15м» для строки «ВЫЖИЛ» меню смерти */
    function fmtAlive(ms) {
      var s = Math.max(0, Math.floor(ms / 1000));
      var d = Math.floor(s / 86400); s -= d * 86400;
      var h = Math.floor(s / 3600); s -= h * 3600;
      var m = Math.floor(s / 60); s -= m * 60;
      var en = (window.BrixState && BrixState.data && BrixState.data.lang === 'en');
      if (d > 0) return en ? d + 'd ' + h + 'h' : d + 'д ' + h + 'ч';
      if (h > 0) return en ? h + 'h ' + m + 'm' : h + 'ч ' + m + 'м';
      return en ? m + 'm ' + s + 's' : m + 'м ' + s + 'с';
    }

    /** ✅ v0.4.28: случайная точка на суше (кнопка «СЛУЧАЙНОЕ МЕСТО»).
        Не в воде (высота суши > 3 м) и не на краю карты */
    function randomSpawnPt() {
      for (var i = 0; i < 40; i++) {
        var x = (Math.random() * 2 - 1) * 1300;
        var z = (Math.random() * 2 - 1) * 1300;
        var h = controls._getHeight(x, z, 0);
        if (h > 3.0) return { x: x, z: z, yaw: Math.random() * Math.PI * 2 };
      }
      return null;
    }

    /* ============================================================
       ✅ v0.4.29 КАРТА МИРА НА ЭКРАНЕ СМЕРТИ (как на фото).
       ✅ v0.4.44: КАРТА НЕ ПИКСЕЛЬНАЯ, А КАК В МИНИ-МЕНЮ (просьба
       игрока): берём готовый гладкий рендер BrixMiniMenu.mapImage()
       (та же карта, что по клавише M — с биомами, hillshade и дорогой);
       если мини-меню ещё не построило её — рисуем старым способом.
       Поверх — красный череп (место смерти) и зелёные точки (живые
       игроки). Кэш — рисование дорогое, делаем один раз */
    var deathPos = null;        // {x, z} — где я умер (для черепа)
    var dthMapCache = null;     // canvas с рельефом
    var MAP_EXT = 450;          // ✅ v0.4.44: половина стороны мира = WORLD_HALF (карта как в мини-меню)

    function hColor(h) {
      if (h < 2.0) return '#2c5f9e';                       // глубина
      if (h < 3.2) return '#3d78b8';                       // мелководье
      if (h < 4.6) return '#d9c489';                       // пляж
      if (h < 30) {                                        // трава (градиент)
        var t1 = (h - 4.6) / (30 - 4.6);
        var g1 = Math.round(148 - t1 * 22);
        var g2 = Math.round(122 - t1 * 20);
        return 'rgb(' + Math.round(106 - t1 * 16) + ',' + g1 + ',' + Math.round(79 - t1 * 12) + ')';
      }
      if (h < 50) return '#8d887c';                        // камень
      return '#e8e8e4';                                    // снег
    }

    function drawDeathTerrain(w, h) {
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#1a2430';
      ctx.fillRect(0, 0, w, h);
      var cols = 190, rows = 110;
      var cw = w / cols, ch = h / rows;
      for (var cy = 0; cy < rows; cy++) {
        for (var cx = 0; cx < cols; cx++) {
          var x = -MAP_EXT + (cx + 0.5) / cols * 2 * MAP_EXT;
          var z = -MAP_EXT + (cy + 0.5) / rows * 2 * MAP_EXT;
          var hh = 0;
          try { hh = controls._getHeight(x, z, 0); } catch (e0) {}
          ctx.fillStyle = hColor(hh);
          ctx.fillRect(Math.floor(cx * cw), Math.floor(cy * ch),
            Math.ceil(cw), Math.ceil(ch));
        }
      }
      /* лёгкая сетка-виньетка по краю — как бумажная карта */
      var grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.45, w / 2, h / 2, h * 0.95);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      return c;
    }

    function drawDeathMap() {
      var c = document.getElementById('brixDthMap');
      if (!c || !c.getContext) return;
      var ctx = c.getContext('2d');
      /* ✅ v0.4.44: ГЛАДКАЯ КАРТА из мини-меню (биомы/hillshade/дорога);
         приводим её к размеру канвы смерти */
      var mmImg = null;
      try { mmImg = (window.BrixMiniMenu && BrixMiniMenu.mapImage) ? BrixMiniMenu.mapImage() : null; } catch (eMM) {}
      /* карта мини-меню КВАДРАТНАЯ — рисуем в центр без искажений,
         маркеры мапим по тому же прямоугольнику */
      var offX = 0, side = Math.min(c.width, c.height);
      if (mmImg) {
        dthMapCache = null;   // гладкая карта главнее старого кэша
        ctx.clearRect(0, 0, c.width, c.height);
        offX = (c.width - side) / 2;
        ctx.drawImage(mmImg, offX, 0, side, side);
      } else {
        if (!dthMapCache) dthMapCache = drawDeathTerrain(c.width, c.height);
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(dthMapCache, 0, 0);
      }
      var w = c.width, h = c.height;
      function mx(x) { return offX + (x + MAP_EXT) / (2 * MAP_EXT) * side; }
      function mz(z) { return (z + MAP_EXT) / (2 * MAP_EXT) * side; }
      /* живые игроки — зелёные точки (как на фото) */
      try {
        for (var rk in remotes) {
          var r = remotes[rk];
          if (!r || r.dead || !r.group) continue;
          ctx.fillStyle = '#63d16a';
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(mx(r.group.position.x), mz(r.group.position.z), 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      } catch (e1) {}
      /* место смерти — красная метка с черепом */
      if (deathPos) {
        var x = mx(deathPos.x), y = mz(deathPos.z);
        ctx.fillStyle = '#c31f10';
        ctx.strokeStyle = '#ffd9c9';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x, y - 1.5, 6.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(x - 4, y + 2.5, 8, 4);
        ctx.fillStyle = '#c31f10';
        ctx.beginPath(); ctx.arc(x - 2.6, y - 1.5, 1.7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 2.6, y - 1.5, 1.7, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(x - 2.5, y + 3.2, 1.4, 2.6);
        ctx.fillRect(x + 1.1, y + 3.2, 1.4, 2.6);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 14;
      ctx.strokeRect(0, 0, w, h);
    }

    /* ============================================================
       ✅ v0.4.43 ТРУП-ЛУТБОКС: при смерти ВЕСЬ инвентарь уходит в труп.
       СЕРВЕРНЫЙ РЕЖИМ: шлём 'corpse' {x,y,z, inv} — сервер создаёт
       труп, рассылает всем 'corpseNew', сохраняет в world-objs.json
       (новые игроки его видят). ВКЛАДКИ: 'corpseNew' в BroadcastChannel.
       СОЛО: локальный труп. После респауна можно вернуться и забрать
       свои вещи (F). Инвентарь очищается — двойных вещей нет
       ============================================================ */
    function collectInvMap() {
      var m = {};
      for (var i = 0; i < inventory.slots.length; i++) {
        var s = inventory.slots[i];
        if (s && s.item && s.count > 0) m[s.item.id] = (m[s.item.id] || 0) + s.count;
      }
      return m;
    }

    function dropCorpseOnDeath() {
      var invMap = collectInvMap();
      var px = camera.position.x, pz = camera.position.z;
      var py = camera.position.y - 1.7;              // примерный уровень земли
      var rec = null;
      /* ✅ v0.4.44 ПУСТОЙ ТРУП НЕ ПОЯВЛЯЕТСЯ (просьба игрока «трупы пустые
         сразу исчезают… пустой труп не падает»): если с собой ничего не было —
         тело просто исчезает, никаких пустых трупов в мире */
      var hasLoot = Object.keys(invMap).some(function (k) { return (invMap[k] | 0) > 0; });
      if (!hasLoot) {
        for (var i0 = 0; i0 < inventory.slots.length; i0++) inventory.slots[i0] = null;
        inventory.renderAll();
        if (inventory._notifySelect) inventory._notifySelect();
        return;
      }
      if (BrixNet.mode === 'server') {
        BrixNet.send({ t: 'corpse', x: Math.round(px * 10) / 10,
          y: Math.round(py * 10) / 10, z: Math.round(pz * 10) / 10, inv: invMap });
      } else if (BrixNet.mode === 'tabs') {
        rec = { t: 'corpseNew', id: 'r' + Math.random().toString(36).slice(2, 8),
          x: Math.round(px * 10) / 10, y: Math.round(py * 10) / 10,
          z: Math.round(pz * 10) / 10, n: BrixNet.NAME, c: BrixNet.COLOR,
          inv: invMap, pid: BrixNet.id };
        BrixNet.send(rec);                           // другим вкладкам
        if (window.BrixCorpses) BrixCorpses.onNet(rec);   // себе сразу
      } else if (window.BrixCorpses) {
        rec = { t: 'corpseNew', id: 'r' + Math.random().toString(36).slice(2, 8),
          x: Math.round(px * 10) / 10, y: Math.round(py * 10) / 10,
          z: Math.round(pz * 10) / 10, n: BrixState.t('corpse.self'),
          c: '#b0722f', inv: invMap };
        BrixCorpses.onNet(rec);
      }
      // опустошаем инвентарь: всё осталось в трупе (предмет добавится при луте)
      for (var i = 0; i < inventory.slots.length; i++) inventory.slots[i] = null;
      inventory.renderAll();
      if (inventory._notifySelect) inventory._notifySelect();
    }

    /** F у трупа: открыть лут-меню (локально сразу, сервер уточнит) */
    function openCorpse(id) {
      if (!window.BrixCorpses) return;
      BrixCorpses.loot(id);                          // меню мгновенно
      if (BrixNet.mode === 'server') {
        BrixNet.send({ t: 'corpseOpen', id: id });   // сервер пришлёт актуальный лут
      }
    }

    function die(killerId, info) {
      if (dead) return;
      dead = true;
      stopAim();
      reloading = false;
      /* ✅ v0.4.28: кнопки меню смерти должны быть кликабельны — снимаем
         захват мыши и отключаем управление (мертвый не ходит) */
      try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) {}
      controls.enabled = false;
      deathKiller = killerId || '';
      /* ✅ v0.4.29: запоминаем где умер — красный череп на карте */
      deathPos = { x: camera.position.x, z: camera.position.z };
      if (combatHud) {
        var nm = '';
        var ros = BrixNet.getRoster();
        for (var i = 0; i < ros.length; i++) if (ros[i].id === deathKiller) nm = ros[i].n || '';
        /* ✅ v0.4.28: статистика как в Rust — выжил / убил / оружие / дистанция */
        if (combatHud.aliveEl) combatHud.aliveEl.textContent =
          BrixState.t('death.alive', { t: fmtAlive(Date.now() - aliveSince) });
        /* ✅ v0.4.34: замёрз насмерть — убитого нет, показываем «Ты замёрз»
           ✅ v0.4.44: разбился насмерть (падение с высоты) — своя строка */
        if (combatHud.killerEl) combatHud.killerEl.textContent = nm
          ? BrixState.t('death.killer', { n: nm })
          : (info && info.cold ? BrixState.t('death.frozen')
            : (info && info.fall ? BrixState.t('death.fall') : ''));
        var w = info && info.w ? String(info.w) : '';
        if (w && nm) {
          /* ✅ v0.4.40: «В ГОЛОВУ» в меню смерти — сервер присылает hs в phit
             (стрелял попал в голову) */
          var hsSuffix = info && info.hs ? BrixState.t('death.hs') : '';
          if (combatHud.wepEl) combatHud.wepEl.textContent =
            BrixState.t('death.weapon', { w: BrixState.t('wep.' + w) + hsSuffix });
          if (combatHud.distEl) combatHud.distEl.textContent =
            BrixState.t('death.dist', { d: (info && info.dist) || 0 });
        } else {
          if (combatHud.wepEl) combatHud.wepEl.textContent = '';
          if (combatHud.distEl) combatHud.distEl.textContent = '';
        }
        combatHud.death.classList.remove('hidden');
        /* ✅ v0.4.29: рисуем карту (рельеф уже кэширован после 1-го раза) */
        try { drawDeathMap(); } catch (eDm) {}
      }
      // другие видят мою смерть (вкладки/серо-режим: сообщаем сами)
      BrixNet.send({ t: 'pdeath', tid: BrixNet.id, by: deathKiller });
      /* ✅ v0.4.43: ВЕСЬ инвентарь уходит в ТРУП-ЛУТБОКС (синхрон +
         сохранение на сервере), свой инвентарь опустошаем */
      try { dropCorpseOnDeath(); } catch (eCorpse) {
        console.warn('[corpse] не создал труп:', eCorpse && eCorpse.message);
      }
      setMyHp(0);
    }

    function doRespawn(custom) {
      dead = false;
      setMyHp(PLAYER_MAX_HP);
      /* ✅ v0.4.34: возрождение — мороз сброшен, экран разморожен */
      coldVal = 0; coldDisp = 0; coldSrv = null;
      if (combatHud) {
        if (combatHud.frost) combatHud.frost.style.opacity = '0';
        if (combatHud.cold) {
          combatHud.cold.style.opacity = '0';
          combatHud.cold.classList.remove('danger');
        }
        combatHud.death.classList.add('hidden');
      }
      /* ✅ v0.4.28: кастомная точка (СЛУЧАЙНОЕ МЕСТО) или обычный спавн */
      if (custom && custom.x !== undefined) {
        controls.spawnAt(custom.x, custom.z, custom.yaw || 0);
        controls.enabled = true;
      } else if (spawnPoint) {
        controls.spawnAt(spawnPoint.x, spawnPoint.z, spawnPoint.yaw);
        controls.enabled = true;
      }
      aliveSince = Date.now();   // время выживания — заново
      /* ✅ v0.4.44: после смерти выдаём СТАРТОВЫЙ НАБОР — каменный топор и
         каменная кирка (просьба игрока). Весь инвентарь остался в трупе */
      try {
        inventory.slots[0] = { item: BrixItems.stoneAxe, count: 1 };
        inventory.slots[1] = { item: BrixItems.stonePickaxe, count: 1 };
        inventory.renderAll();
        if (inventory._notifySelect) inventory._notifySelect();
      } catch (eKit) {}
      /* ✅ v0.4.43: подсказка — вещи остались в трупе, можно вернуть */
      try { if (window.BrixHud) BrixHud.toast(BrixState.t('death.loot'), 6); } catch (eT2) {}
      if (window.menuAudio) menuAudio.click();
    }

    /* ============================================================
       ✅ v0.4.34 ХОЛОД (зимний апдейт, этап 1)
       СЕРВЕРНЫЙ РЕЖИМ: server.js — авторитет. Раз в секунду шлёт
       'cold' {v: 0..100, z: «зимность» 0..1, hp: остаток хп при уроне}.
       Урон растёт вместе со шкалой; в тепле шкала тает сама.
       СОЛО/ВКЛАДКИ (сервера нет): та же математика локально по
       BrixTerrain.heightAt (снег на горах = зима).
       UI: баннер температуры (как на фото: «TOO COLD -11°») + ИНЕЙ
       по углам экрана. Вышел в тепло — шкала по чуть-чуть падает,
       иней постепенно тает («экран размораживается»).
       ============================================================ */
    function onColdMsg(msg) {
      if (!msg) return;
      coldSrv = Math.max(0, Math.min(100, Number(msg.v) || 0));
      if (msg.hp !== undefined && msg.hp !== null && !dead) {
        setMyHp(Number(msg.hp));
      }
    }

    /** «зимность» места 0..1: та же снеговая линия, что в цвете рельефа */
    function coldZoneAt(x, z) {
      try {
        if (!window.BrixTerrain || !BrixTerrain.heightAt) return 0;
        var h = BrixTerrain.heightAt(x, z);
        var t = Math.min(1, Math.max(0, (h - 44) / (58 - 44)));   // как server.js
        return t * t * (3 - 2 * t);
      } catch (e) { return 0; }
    }

    function coldTick(dt) {
      if (!combatHud || BrixGame.state.phase !== 'playing') return;
      if (BrixNet.mode === 'server') {
        /* сервер — авторитет: сглаживаем только визуал (данные 1 Гц,
           мороз «ползёт», а не прыгает); если сообщений нет — таем */
        if (coldSrv !== null) {
          coldVal = coldSrv;
          coldDisp += (coldVal - coldDisp) * Math.min(1, dt * 2.5);
          if (coldVal === 0 && coldDisp < 0.3) coldDisp = 0;
        } else {
          coldVal = Math.max(0, coldVal - 1.25 * dt);
          coldDisp += (coldVal - coldDisp) * Math.min(1, dt * 2.5);
        }
      } else if (!dead) {
        /* соло/вкладки: локальная симуляция — та же, что в server.js */
        var zk = coldZoneAt(controls.position.x, controls.position.z);
        if (zk > 0.15) coldVal = Math.min(100, coldVal + 1.4 * zk * dt);
        else coldVal = Math.max(0, coldVal - 1.25 * dt);
        if (coldVal >= COLD_DMG_FROM &&
            !(window.BrixAdmin && BrixAdmin.god)) {
          /* урон растёт вместе со шкалой: 30 холода = 0.36 хп/с, 100 = 1.2 */
          setMyHp(myHp - (coldVal / 100) * 1.2 * dt);
          if (myHp <= 0) die('', { cold: 1 });
        }
        coldDisp += (coldVal - coldDisp) * Math.min(1, dt * 2.5);
      }
      updateColdHud();
    }

    function updateColdHud() {
      if (!combatHud || !combatHud.frost || !combatHud.cold) return;
      /* ✅ мёртв — иней и баннер гаснут (экран смерти поверх всех) */
      if (dead) {
        combatHud.frost.style.opacity = '0';
        combatHud.cold.style.opacity = '0';
        combatHud.cold.classList.remove('danger');
        return;
      }
      var c = Math.max(0, Math.min(100, coldDisp));
      /* ИНЕЙ: появляется с 15 холода, в полный — плотный по углам.
         Тает плавно (transition в стиле) — «экран размораживается» */
      var frostK = Math.max(0, Math.min(1, (c - 15) / 85));
      combatHud.frost.style.opacity = frostK.toFixed(3);
      /* БАННЕР как на фото: скрыт в тепле, с 3 холода — «ХОЛОДНО»,
         с 30 (урон) — «СЛИШКОМ ХОЛОДНО» + пульс + красная шкала */
      var ban = combatHud.cold;
      if (c < 3) {
        ban.style.opacity = '0';
        ban.classList.remove('danger');
        return;
      }
      ban.style.opacity = c >= 60 ? '1' : '0.94';
      var danger = c >= COLD_DMG_FROM;
      if (danger) ban.classList.add('danger');
      else ban.classList.remove('danger');
      var lbl = ban.querySelector('.clabel');
      if (lbl) lbl.textContent = BrixState.t(danger ? 'cold.danger' : 'cold.warn');
      var temp = ban.querySelector('.ctemp');
      if (temp) temp.textContent = '-' + Math.max(1, Math.round(c * 0.3)) + '\u00B0';
      var fill = ban.querySelector('.cfill');
      if (fill) {
        fill.style.width = c.toFixed(1) + '%';
        fill.style.background = danger ? '#e0685c' : '#ffb066';
      }
    }

    /* ============================================================
       ✅ v0.4.31 ЛОМАНИЕ ПОСТРОЕК — фидбек: сервер прислал 'bhp'
       (остаток хп детали, идёт ВСЕМ игрокам). Постройка больше НЕ
       шевелится (пульсация масштаба удалена — постройки при ломании
       стоят как вкопанные) и цифры не всплывают: остаток хп виден в
       ХП-БАРЕ ПРИЦЕЛА (BrixBuilding.hpBarTick) — бар появляется под
       прицелом только на той постройке, в которую смотришь. В соло/
       вкладках onBuildHp вызывается локально из hitWithTool
       ============================================================ */
    function onBuildHp(msg) {
      if (!msg || !msg.id) return;
      /* ✅ fix v0.4.30: было BrixBuildings (опечатка) — правильный глобал
         window.BrixBuilding. ✅ v0.4.31: скармливаем остаток хп ХП-бару */
      if (window.BrixBuilding && BrixBuilding.setPieceHp) {
        BrixBuilding.setPieceHp(msg.id, msg.hp, msg.max);
      }
    }

    /** текущий разброс пули (рад): стой/иди/беги/прыгай — крестик честный */
    function currentSpread() {
      var mv = controls.getMoveState();
      var s = 0.010;                                   // стоя
      if (mv.moving) s += mv.sprint ? 0.030 : 0.014;   // шаг/бег
      if (!mv.onGround) s += 0.050;                    // прыжок — сильнее всего
      // ✅ v0.4.36 → v0.4.39: у револьвера-карабина оптика — в прицеле
      // ОЧЕНЬ ТОЧНО (×0.02 и подброс от выстрела ослаблен ×0.25),
      // у остального оружия как было (×0.25)
      var r3sc = aiming && rv3xSlot();
      if (aiming) s *= r3sc ? RV3X_SPREAD_MUL : 0.25;
      return s + crossKick * (r3sc ? 0.25 : 1);     // всплеск от выстрела
    }

    /** случайное направление в конусе разброса вокруг dir */
    function sampleSpreadDir(dir, spread) {
      var a = Math.random() * Math.PI * 2;
      var r = spread * Math.sqrt(Math.random());
      var up = new THREE.Vector3(0, 1, 0);
      var right = new THREE.Vector3().crossVectors(dir, up).normalize();
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      var u2 = new THREE.Vector3().crossVectors(right, dir).normalize();
      return dir.clone()
        .addScaledVector(right, Math.cos(a) * r)
        .addScaledVector(u2, Math.sin(a) * r)
        .normalize();
    }

    /** «дуло» револьвера для трассера (чуть правее и ниже камеры) */
    var _muzzleFwd = new THREE.Vector3(), _muzzleRight = new THREE.Vector3();
    function muzzleWorldPos(out) {
      camera.getWorldDirection(_muzzleFwd);
      _muzzleRight.crossVectors(_muzzleFwd, camera.up).normalize();
      out.copy(camera.position)
        .addScaledVector(_muzzleFwd, 0.5)
        .addScaledVector(_muzzleRight, 0.13);
      out.y -= 0.09;
      return out;
    }

    var tracers = [];
    function addTracer(from, to) {
      var geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
      var mat = new THREE.LineBasicMaterial({
        color: 0xffd9a0, transparent: true, opacity: 0.9, depthWrite: false
      });
      var line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      scene.add(line);
      tracers.push({ line: line, geo: geo, mat: mat, t: 0.09 });
    }
    function tickTracers(dt) {
      for (var i = tracers.length - 1; i >= 0; i--) {
        var tr = tracers[i];
        tr.t -= dt;
        if (tr.t <= 0) {
          scene.remove(tr.line);
          tr.geo.dispose(); tr.mat.dispose();
          tracers.splice(i, 1);
        } else {
          tr.mat.opacity = 0.9 * tr.t / 0.09;
        }
      }
    }

    /** id чужого игрока по мешу, в который попал луч */
    function findPid(obj) {
      var o = obj;
      while (o) {
        if (o.userData && o.userData.pid) return o.userData.pid;
        o = o.parent;
      }
      return null;
    }

    /* ---------- ЛКМ с огнестрелом: ВЫСТРЕЛ (револьвер — пуля,
       дробовик — 8 дробин конусом, калаш — автоогонь, v0.4.21) ---------- */
    var _dirV = new THREE.Vector3();
    var mouseDown = false;   // ✅ v0.4.21: ЛКМ зажата — автоогонь калаша
    /* ✅ v0.4.22: последнее состояние движения — НА БЕГУ СТРЕЛЯТЬ НЕЛЬЗЯ
       (пока оружие прижато к груди; прыжок в спринте тоже блокирует:
       блокируем по moving+sprint, как hands.setRunning, но и в воздухе) */
    var lastMove = { moving: false, sprint: false, onGround: true };
    function tryShoot() {
      if (dead || reloading || BrixGame.state.phase !== 'playing') return;
      if (lastMove.moving && lastMove.sprint) return;
      var rs = revSlot(), sgs = sgSlot(), rfs = rifleSlot(), tps = tpSlot(),
          r3s = rv3xSlot();
      var s = rs || sgs || rfs || tps || r3s;
      if (!s) { hitWithTool(); return; }          // не огнестрел — обычный удар
      if (shootCd > 0) return;
      if (!s.mag) {
        if (!tryShoot._hint || performance.now() - tryShoot._hint > 1500) {
          tryShoot._hint = performance.now();
          BrixHud.toast(BrixState.t('hint.emptyMag'));
        }
        return;
      }
      var isSg = !!sgs, isAk = !!rfs, isTp = !!tps, isR3 = !!r3s;
      shootCd = isSg ? SG_SHOOT_CD : isAk ? AK_FIRE_CD
        : isTp ? TP_FIRE_CD : isR3 ? RV3X_SHOOT_CD : SHOOT_CD;
      s.mag--;
      inventory.renderAll();                      // бейдж обоймы на иконке
      hands.playShoot();
      if (isTp) {
        // ✅ v0.4.35 ТОМПСОН: РАНДОМНЫЙ звук из трёх + лёгкий подброс
        // (пуля слабая, но очередь плотная — 800 в/мин)
        BrixSfx.play(tpShots[Math.floor(Math.random() * tpShots.length)],
          { volume: 1.0, jitter: 0.02 });
        recoilPitch += 0.011;
        crossKick = Math.min(crossKick + 0.008, 0.05);
      } else if (isAk) {
        BrixSfx.play('akShot', { volume: 1.0, jitter: 0.02 });
        // подброс камеры + всплеск разброса (меньше дробовика, но серия)
        recoilPitch += 0.016;
        crossKick = Math.min(crossKick + 0.010, 0.06);
      } else if (isSg) {
        BrixSfx.play('sgShot', { volume: 1.0, jitter: 0.02 });
        // дробовик бьёт заметно сильнее: подброс камеры + разброс
        recoilPitch += 0.032;
        crossKick = Math.min(crossKick + 0.045, 0.09);
      } else if (isR3) {
        // ✅ v0.4.36 РЕВОЛЬВЕР-КАРАБИН 3×: звук КАК У РЕВОЛЬВЕРА, но
        // тяжелее (rate 0.9 — удлинённый ствол «басит»); отдача сильная
        BrixSfx.play('revShot', { volume: 1.0, rate: 0.9, jitter: 0.04 });
        recoilPitch += 0.030;
        crossKick = Math.min(crossKick + 0.018, 0.06);
      } else {
        BrixSfx.play('revShot', { volume: 0.9, jitter: 0.04 });
        // подброс камеры + всплеск разброса
        recoilPitch += 0.011;
        crossKick = Math.min(crossKick + 0.012, 0.05);
      }
      // звук выстрела слышат другие (по дистанции)
      BrixNet.sendSnd(isSg ? 'sgshot' : isAk ? 'akshot' : isTp ? 'tpshot' : 'shot',
        controls.position);

      // луч с разбросом: чужие игроки → земля/прочее
      raycaster.camera = camera;
      var pids = [];
      for (var rk in remotes) {
        if (!remotes[rk].dead) pids.push(remotes[rk].group);
      }
      var fwd = camera.getWorldDirection(_dirV);

      if (!isSg) {
        /* — ПУЛЯ револьвера/калаша/томпсона (одиночная, как в v0.4.5) — */
        raycaster.set(camera.position, sampleSpreadDir(fwd, currentSpread()));
        raycaster.far = SHOOT_RANGE;
        var end = null, victimId = null, endD = Infinity;
        if (pids.length) {
          var ph = raycaster.intersectObjects(pids, true);
          if (ph.length) {
            victimId = findPid(ph[0].object);
            end = ph[0].point;
            endD = camera.position.distanceTo(end);
          }
        }
        /* ✅ v0.4.10: ПОСТРОЙКИ встречают пулю — через стену/потолок/дверь
           она не летит, а через проём ОКНА и открытый проход двери летит
           (в проёме просто нет меша). Если постройка ближе жертвы —
           пуля втыкается в неё, трассер до неё же */
        var blk = (window.BrixBuilding && BrixBuilding.bulletBlock)
          ? BrixBuilding.bulletBlock(camera.position, raycaster.ray.direction, SHOOT_RANGE)
          : null;
        if (blk && blk.d < endD) {
          victimId = null;
          end = blk.p;
          endD = blk.d;
        }
        if (!end && terrain) {
          var th = raycaster.intersectObject(terrain, false);
          if (th.length) {
            var td = camera.position.distanceTo(th[0].point);
            end = (blk && blk.d < td) ? blk.p : th[0].point;
          }
        }
        if (!end) {
          end = blk ? blk.p
            : camera.position.clone()
                .addScaledVector(raycaster.ray.direction, SHOOT_RANGE);
        }
        var mz = muzzleWorldPos(new THREE.Vector3());
        addTracer(mz, end);
        if (victimId) {
          // ✅ v0.4.21: у калаша свой урон AK_DMG (у револьвера REV_DMG)
          // ✅ v0.4.35: у томпсона свой TP_DMG
          // ✅ v0.4.36: у револьвера-карабина свой RV3X_DMG
          // ✅ v0.4.28: + id оружия — в меню смерти жертвы (как в Rust)
          // ✅ v0.4.40 НОВАЯ ТАБЛИЦА + ЗОНЫ: урон В ГОЛОВУ полный, В ТЕЛО —
          //    половина (таблица игрока: револьвер 18/9, карбиновый
          //    револьвер (револьвер-карабин 3×) 20/10, калаш 33/17,
          //    томпсон 23/12). ХИТ-МАРКЕР: белый — тело, КРАСНЫЙ — голова
          var rpShot = remotes[victimId];
          var shotZone = hitZone(ph[0].point, rpShot);
          var shotBase = isTp ? TP_DMG : isAk ? AK_DMG : isR3 ? RV3X_DMG : REV_DMG;
          var shotDmg = dmgByZone(shotBase, shotZone);
          var shotWpn = isTp ? 'thompson' : isAk ? 'ak' : isR3 ? 'rev3x' : 'revolver';
          BrixNet.sendPhit(victimId, shotDmg, 'shot', shotWpn,   // сервер решает ХП
            shotZone === 'head' ? 1 : 0);
          if (window.BrixHitmarker) BrixHitmarker.show(shotZone, { big: shotZone === 'head' });
        }
      } else {
        /* — ДРОБЬ дробовика (v0.4.19): 8 дробин конусом SG_SPREAD.
           Дорогое (терраин/постройки) считаем ОДИН раз по центру —
           он задаёт дальность дроби; каждая дробина дешево ищет
           ЖЕРТВУ (меши чужих игроков). Урон копится по жертве и
           уходит ОДНИМ сообщением — сервер не спамится.
           ✅ v0.4.40 УРОН ПО ДИСТАНЦИИ И ЗОНЕ (sgPelletDmg): в упор (≤10 м)
           13 за дробину в обе зоны — 8×13 = 104, мгновенное убийство;
           10–28 м — 4.5 в голову / 2.25 в тело за дробину (весь заряд
           ≈ 35 в голову, как просил игрок); 28–45 м — по 1.25 (≈10);
           дальше 45 м дробь НЕ ДОСТАЁТ — урона нет. ХИТ-МАРКЕР один на
           выстрел: красный, если ≥2 дробины в голову, белый — тело */
        var blkS = (window.BrixBuilding && BrixBuilding.bulletBlock)
          ? BrixBuilding.bulletBlock(camera.position, fwd, SHOOT_RANGE)
          : null;
        var capD = blkS ? blkS.d : SHOOT_RANGE;
        if (terrain) {
          raycaster.set(camera.position, fwd);
          raycaster.far = SHOOT_RANGE;
          var thS = raycaster.intersectObject(terrain, false);
          if (thS.length) {
            var tdS = camera.position.distanceTo(thS[0].point);
            if (tdS < capD) capD = tdS;
          }
        }
        var hits = {};      // vpid -> { hd, bd, hp, bp } — урон/дробины по зонам
        var mzS = muzzleWorldPos(new THREE.Vector3());
        var pelletSpread = SG_SPREAD + currentSpread() * 0.35;
        for (var pi = 0; pi < SG_PELLETS; pi++) {
          var pdir = sampleSpreadDir(fwd, pelletSpread);
          raycaster.set(camera.position, pdir);
          raycaster.far = capD;
          var vp = null, vpid = null;
          if (pids.length) {
            var phS = raycaster.intersectObjects(pids, true);
            if (phS.length) {
              vpid = findPid(phS[0].object);
              vp = phS[0].point;
              if (vpid) {
                // ✅ v0.4.40: урон дробины ПО ДИСТАНЦИИ и ЗОНЕ (голова/тело)
                var pzone = hitZone(vp, remotes[vpid]);
                var pdmg = sgPelletDmg(camera.position.distanceTo(vp), pzone);
                if (pdmg > 0) {
                  if (!hits[vpid]) hits[vpid] = { hd: 0, bd: 0, hp: 0, bp: 0 };
                  if (pzone === 'head') { hits[vpid].hd += pdmg; hits[vpid].hp++; }
                  else { hits[vpid].bd += pdmg; hits[vpid].bp++; }
                }
              }
            }
          }
          var ep = vp || camera.position.clone().addScaledVector(pdir, capD);
          if (pi < 4) addTracer(mzS, ep);   // трассеры только у половины дробин — читаемо и не дорого
        }
        for (var hv in hits) {
          var vH = hits[hv];
          var vTotal = vH.hd + vH.bd;
          if (vTotal <= 0) continue;
          // ✅ v0.4.28: + 'shotgun' — в меню смерти жертвы (как в Rust)
          // ✅ v0.4.40: + hs — «В ГОЛОВУ» в меню смерти (≥2 дробины в голову)
          var sgHs = vH.hp >= 2 ? 1 : 0;
          BrixNet.sendPhit(hv, Math.round(vTotal * 10) / 10, 'shot', 'shotgun', sgHs);
          if (window.BrixHitmarker) {
            BrixHitmarker.show(sgHs ? 'head' : 'body', { big: sgHs === 1 && vH.hp >= 3 });
          }
        }
      }
    }

    /* ---------- ПКМ: прицеливание ---------- */
    function startAim() {
      if (dead || reloading || BrixGame.state.phase !== 'playing') return;
      if (!gunSlot() || !lockedRef) return;
      aiming = true;
      hands.setAim(true);
    }
    function stopAim() {
      aiming = false;
      hands.setAim(false);
    }

    /* ---------- R: перезарядка (револьвер — патроны, дробовик —
       патроны дробовика, v0.4.19; калаш — винтовочные, v0.4.21) ---------- */
    function tryReload() {
      if (dead || reloading || BrixGame.state.phase !== 'playing') return;
      if (isInvOpen() || isLootOpen() || isMiniOpen()) return;
      var s = gunSlot();
      if (!s || s.mag >= gunMagSize()) return;
      /* ✅ fix v0.4.20: дробовик, взятый из админ-панели/ящика до этого фикса,
         приходил в слот БЕЗ поля mag (undefined) — перезарядка считала
         «обойма − undefined = NaN» и патроны НЕ заряжались, хотя запас
         был полный. Нормализуем mag на месте — старые дробовики чинятся
         сразу, без перезайма предмета */
      if (typeof s.mag !== 'number' || isNaN(s.mag)) s.mag = 0;
      if (s.mag >= gunMagSize()) return;
      var ammoId = gunAmmoId();
      if (!inventory.countItem(ammoId)) {
        BrixHud.toast(BrixState.t('hint.noAmmo'));
        return;
      }
      reloading = true;
      reloadT = 0;
      stopAim();
      hands.playReload();                       // оружие опускается вниз
      // ✅ v0.4.21: у КАЛАША свой звук перезарядки (файл от пользователя)
      // ✅ v0.4.35: у ТОМПСОНА свой (Thompson_Reload_01.wav)
      // ✅ v0.4.36: у револьвера-карабина — звук револьвера (как просил игрок)
      var rlSnd = tpSlot() ? 'tpReload' : rifleSlot() ? 'akReload' : 'revReload';
      BrixSfx.play(rlSnd, { volume: 0.85, jitter: 0.02 });
      BrixNet.sendSnd(tpSlot() ? 'tpreload'
        : rifleSlot() ? 'akreload' : sgSlot() ? 'sgreload' : 'reload',
        controls.position);                     // звук слышат другие
    }

    /* ---------- ПвП: ХП, попадания, смерть, возрождение ---------- */
    function onPlayerHit(msg) {
      if (msg.tid === BrixNet.id) {
        /* ✅ v0.4.23: локальный god учитываем ТОЛЬКО во «вкладках» (без
           сервера). В серверном режиме ХП — АВТОРИТЕТ СЕРВЕРА: сервер сам
           не уронит игрока с включённым тумблером бессмертия (op:'god').
           Раньше клиент с ОТКЛОНЁННЫМ сервером бессмертием (старый
           server.js / нет админа) игнорировал урон — полоска ХП висела
           полной, и казалось, что «игроков нельзя убить» */
        if (BrixNet.mode !== 'server' && window.BrixAdmin && BrixAdmin.god) {
          setMyHp(PLAYER_MAX_HP);
          return;
        }
        // попали в МЕНЯ: у сервера — точное хп, во вкладках — вычитаем сами
        var hp = (msg.hp !== undefined && msg.hp !== null)
          ? msg.hp : Math.max(0, myHp - (msg.dmg || 0));
        setMyHp(hp);
        flashDamage();
        /* ✅ v0.4.28: в phit теперь и оружие, и дистанция — для меню смерти */
        if (hp <= 0) die(msg.by, msg);
        return;
      }
      // попали в ЧУЖОГО — полоска хп над его головой
      var rp = remotes[msg.tid];
      if (rp) rp.setHp(msg.hp !== undefined && msg.hp !== null ? msg.hp : Math.max(0, rp.hp - (msg.dmg || 0)));
    }
    function onPlayerDeath(msg) {
      if (msg.tid === BrixNet.id) { if (!dead) die(msg.by, msg); return; }
      var rp = remotes[msg.tid];
      if (rp) rp.die();
      // небольшой килфид
      var ros = BrixNet.getRoster();
      var kn = '', vn = '';
      for (var i = 0; i < ros.length; i++) {
        if (ros[i].id === msg.by) kn = ros[i].n || '';
        if (ros[i].id === msg.tid) vn = ros[i].n || '';
      }
      if (kn && vn) BrixHud.toast(kn + ' → ' + vn, 5);
    }

    /* ---------- крестик: обновление КАЖДЫЙ кадр ---------- */
    function updateCrosshair() {
      if (!combatHud) return;
      var s = gunSlot();
      var selItem = inventory.getSelectedItem();
      var holding = s || (selItem && selItem.tool);
      if (!holding || dead || BrixGame.state.phase !== 'playing' ||
          isInvOpen() || isLootOpen() || isMiniOpen()) {
        combatHud.cross.style.display = 'none';
        combatHud.mag.style.display = 'none';
        return;
      }
      combatHud.cross.style.display = 'block';
      if (s) {
        // револьвер: палки разъезжаются по РЕАЛЬНОМУ разбросу;
        // при прицеливании остаётся точка и прозрачный крестик
        var spread = currentSpread();
        var gap = Math.tan(spread) * (renderer.domElement.clientHeight / 2) /
          Math.tan(camera.fov * Math.PI / 360);
        gap = Math.max(7, Math.min(90, gap));
        var arm = 9, th = 2;
        var st = combatHud.sticks;
        st.t.style.transform = 'translate(-50%,-50%) translateY(-' + (gap + arm) + 'px)';
        st.b.style.transform = 'translate(-50%,-50%) translateY(' + (gap + arm) + 'px)';
        st.l.style.transform = 'translate(-50%,-50%) translateX(-' + (gap + arm) + 'px)';
        st.r.style.transform = 'translate(-50%,-50%) translateX(' + (gap + arm) + 'px)';
        var aimOp = aiming ? 0 : 0.9;
        // ✅ v0.4.36: в оптике револьвера-карабина крестик прячем —
        // сетка есть в самом прицеле (sc-cross/sc-dot)
        var scoped = aiming && !!rv3xSlot() &&
          (hands.aimProgress ? hands.aimProgress() : 0) > 0.6;
        if (scoped) aimOp = 0;
        ['t', 'b', 'l', 'r'].forEach(function (k) {
          st[k].style.opacity = aimOp;
        });
        combatHud.dot.style.opacity = scoped ? 0 : aiming ? 0.45 : 0.95;
        combatHud.cross.style.opacity = scoped ? 0 : aiming ? 0.6 : 1;
        // счёт: обойма | запас (у дробовика — свои патроны, v0.4.19)
        combatHud.mag.style.display = 'block';
        combatHud.mag.textContent = (s.mag || 0) + ' | ' + inventory.countItem(gunAmmoId());
        combatHud.mag.classList.toggle('empty', !s.mag);
        combatHud.mag.style.color = s.mag ? '#f2ead6' : '#e0685c';  // fix 0.4.5a (стиль и без css)
      } else {
        // инструмент: маленький спокойный крест
        var st2 = combatHud.sticks, g2 = 12, a2 = 8;
        st2.t.style.transform = 'translate(-50%,-50%) translateY(-' + (g2 + a2) + 'px)';
        st2.b.style.transform = 'translate(-50%,-50%) translateY(' + (g2 + a2) + 'px)';
        st2.l.style.transform = 'translate(-50%,-50%) translateX(-' + (g2 + a2) + 'px)';
        st2.r.style.transform = 'translate(-50%,-50%) translateX(' + (g2 + a2) + 'px)';
        ['t', 'b', 'l', 'r'].forEach(function (k) { st2[k].style.opacity = 0.55; });
        combatHud.dot.style.opacity = 0.7;
        combatHud.cross.style.opacity = 0.8;
        combatHud.mag.style.display = 'none';
      }
    }

    /* ============ ✅ v0.4.41: С4 — ВЗРЫВЧАТКА (модель и звуки игрока) ============
       В руках: блок ПО ЦЕНТРУ, обе руки держат ЗА БОКИ (firstperson.js).
       ЛКМ — быстрый бросок: блок летит по дуге с физикой, ПРИЛИПАЕТ к
       земле/стенам/потолку, «тыкает» 15 раз — каждый тык ТИШЕ, «писклявее»
       и БЫСТРЕЕ (1.0 с → 0.44 с, pitch 1.0 → 1.9, громкость 0.9 → 0.4),
       после 15-го — ВЗРЫВ: постройки в радиусе 7 м −400 хп каждая,
       игроки в радиусе 6.5 м — насмерть (250 урона). Полёт и таймер —
       у бросавшего; в мультиплеере урон по постройкам/игрокам считает
       СЕРВЕР (case 'c4boom' в server.js), остальным блок прилетает
       сообщением 'c4placed' (тыки синхронно у всех) */
    /* ✅ v0.4.44 ФЬЮЗ 8 СЕКУНД (просьба игрока: «взрывается за 3 с, надо 8 с»):
       раньше тыков было 15 (сумма 11.24 с), но ГЛАВНЫЙ БАГ был в failsafe:
       свой блок в сервер-режиме взрывался локально через
       c4Interval(последний) + 3.0 = 3.44 с — таймер отсчитывался не от
       конца тыков, а от прилипа. Теперь тыков 12 и полный цикл РОВНО 8 с,
       а failsafe срабатывает на 3 с ПОСЛЕ конца полного фьюза.
       Формула общая с server.js (C4_FUSE_MS = 8015): сумма 12 интервалов
       12×0.735 − 0.02×(0+…+11) = 7.5 с + последний 0.515 = 8.015 с */
    var C4_BEEPS = 12;
    var C4_BUILD_DMG = 400;
    var C4_PLAYER_DMG = 250;
    var C4_BUILD_R = 7;        // радиус урона постройкам, м (горизонталь)
    var C4_PLAYER_R = 6.5;     // радиус убийства игроков, м
    var C4_THROW_SPEED = 9.5;  // начальная скорость броска, м/с
    var C4_GRAVITY = 22;
    var C4_RANGE_MAX = 45;     // дальше — блок «исчез» (страховка)
    var c4Cooldown = 0;
    var c4s = [];              // живые С4 {grp, lamp, vel, st, own, t, beepI, beepT}
    var c4Proto = null;        // прототип модели (c4.glb, грузится один раз)
    var c4Ray = new THREE.Raycaster();
    var c4TargetsCache = null, c4TargetsT = 0;
    var c4fxList = [];         // визуальные эффекты взрывов {t, dur, tick, done}

    /** интервал между тыками: 0.735 с → 0.515 с (быстрее с каждым тыком);
        ✅ v0.4.44: 12 тыков, полный цикл РОВНО 8 с (см. C4_BEEPS выше) */
    function c4Interval(i) { return 0.735 - 0.02 * i; }
    /** полный фьюз = сумма 12 интервалов = 7.5 с (детерминирован —
        такой же порядок у всех клиентов и у failsafe чужих блоков) */
    function c4Fuse() {
      var s = 0;
      for (var i = 0; i < C4_BEEPS; i++) s += c4Interval(i);
      return s;
    }
    /** ✅ v0.4.44: ПОЛНОЕ время от прилипа до взрыва = фьюз + последний
        интервал = 8.015 с. РОВНО ТАКЖЕ считает сервер (C4_FUSE_MS) */
    function c4TotalFuse() { return c4Fuse() + c4Interval(C4_BEEPS - 1); }
    /** ✅ v0.4.43: выставить фазу тыков по ОСТАТКУ фьюза (мс) от сервера:
        зашёл после постановки / привязал свою бомбу к серверному id —
        слышишь тыки с правильного места, а взрыв всё равно решает сервер */
    function c4ApplyPhase(e, msLeft) {
      if (!e) return;
      var total = c4TotalFuse();
      var el = Math.max(0, total - Math.max(0, Number(msLeft) || 0) / 1000);
      var acc = 0, bi = 0;
      while (bi < C4_BEEPS && acc + c4Interval(bi) <= el) { acc += c4Interval(bi); bi++; }
      e.beepI = bi;
      e.beepT = Math.max(0, el - acc);
      e.fuseT = Math.max(0, el - c4Fuse());
    }
    /** звук тыка №i (1..15): тише и «писклявее» с каждым */
    function c4BeepSound(i) {
      var k = (i - 1) / (C4_BEEPS - 1);
      BrixSfx.play('c4Beep', {
        volume: 0.9 - 0.5 * k,     // тусклей (0.9 → 0.4)
        rate: 1.0 + 0.9 * k,       // писклявее (1.0 → 1.9)
        jitter: 0                  // честный таймер без рандома
      });
    }

    // прототип модели С4 (модель пользователя C4.glb) — нормализуем к 0.30 м
    if (window.BrixGLB) {
      BrixGLB.load('assets/models/c4.glb', function (g, size) {
        var m = 0.30 / (Math.max(size.x, size.y, size.z) || 1);
        g.scale.setScalar(m);
        c4Proto = g;
        console.log('[BrixWorld] модель С4 готова (0.30 м)');
      }, function () {
        console.warn('[BrixWorld] модель С4 не загрузилась — в руках будет процедурный блок');
      });
    }

    /** мишени для луча полёта: рельеф + постройки (кэш 1 с) */
    function c4Targets() {
      var now = performance.now();
      if (c4TargetsCache && now - c4TargetsT < 1000) return c4TargetsCache;
      var t = [];
      if (terrain) t.push(terrain);
      if (window.BrixBuilding) {
        var bt = BrixBuilding.hitTargets();
        if (bt && bt.length) t = t.concat(bt);
      }
      c4TargetsCache = t;
      c4TargetsT = now;
      return t;
    }

    /** поставить блок в мир (полёт/прилип). own=true — мой, взрыв у меня */
    function spawnC4(pos, vel, own) {
      var grp = new THREE.Group();
      if (c4Proto) {
        grp.add(c4Proto.clone());
      } else {
        var box = new THREE.Mesh(
          new THREE.BoxGeometry(0.26, 0.30, 0.10),
          new THREE.MeshStandardMaterial({ color: 0x4a4f3a, roughness: 0.9, metalness: 0.1 }));
        grp.add(box);
      }
      // красный «глаз»-лампочка: мигает на каждом тыке
      var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xff2a20 }));
      lamp.position.set(0, 0.17, 0);
      lamp.visible = false;
      grp.add(lamp);
      grp.position.copy(pos);
      scene.add(grp);
      /* ✅ v0.4.50: home — точка БРОСКА/постановки. Страховка «блок далеко»
         раньше мерилась от ЦЕНТРА КАРТЫ (cur.length() > 135 м), а карта
         900 м и горы начинаются ~250 м от центра — в горах/на холмах блок
         удалялся в первый же кадр полёта («С4 пропадает»). Теперь меряем
         от e.home (см. tickC4) */
      c4s.push({ grp: grp, lamp: lamp, vel: vel, st: 'fly', own: !!own,
        t: 0, beepI: 0, beepT: 0, fuseT: 0, home: pos.clone(),
        srvId: null, srvMs: 0 });   // ✅ v0.4.43: серверный id/остаток фьюза
      return c4s[c4s.length - 1];
    }

    /** сориентировать прилипший блок: лицевая грань ОТ поверхности */
    function orientC4FromNormal(e, n) {
      e.grp.position.addScaledVector(n, 0.055);
      var upSeed = (Math.abs(n.y) > 0.85) ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
      var y = upSeed.clone().addScaledVector(n, -upSeed.dot(n)).normalize();
      var x = new THREE.Vector3().crossVectors(y, n).normalize();
      var q = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(x, y, n.clone().normalize()));
      e.grp.quaternion.copy(q);
    }

    /* ============================================================
       ✅ v0.4.46 ШПРИЦ (просьба игрока: «добавь шприц, он восстанавливает
       46 хп...»; крафтится и падает с военных ящиков).
       ✅ v0.4.49 ЛКМ — УКОЛ: СВОЯ процедурная анимация на нашем риге
       (CL.syringe в firstperson.js — правая вдавливает иглу в подставленное
       предплечье левой, поршень продавливается, шприц жёстко в кисти),
       на конец продавливания (SYR_HEAL_T 3.45 с) +46 ХП и шприц
       РАСХОДУЕТСЯ (снят со слота сразу). В серверном режиме хп
       подтверждает сервер ('heal' → p.hp + 46, cap 100) — полоски у
       других игроков тоже обновятся (phit kind 'heal')
       ============================================================ */
    var SYR_HEAL = 46;
    var SYR_CD = 6.2;       // кулдаун чуть длиннее клипа
    var syrCd = 0;
    function useSyringe() {
      if (syrCd > 0) return;
      var s = inventory.slots[inventory.activeSlot];
      if (!s || !s.item || s.item.tool !== 'syringe') return;
      if (myHp >= PLAYER_MAX_HP - 0.5) {
        try { if (window.BrixHud) BrixHud.toast(BrixState.data.lang === 'en'
          ? 'Health is already full' : 'Здоровье уже полное', 3); } catch (eT) {}
        return;
      }
      syrCd = SYR_CD;
      inventory.removeCount(inventory.activeSlot, 1);   // шприц потрачен
      hands.triggerSwing('syringe');                    // наши руки: клип укола
      if (hands.playSyringe) hands.playSyringe();       // модель: записанный клип
      BrixSfx.play('chop2', { volume: 0.2, rate: 1.7 });
      /* ✅ v0.4.50 ЗВУК «ШПРИЦ ВОНТИЛСЯ В РУКУ»: на момент входа иглы в
         предплечье (0.44 клипа ≈ 2.5 с — SYR_NEEDLE_T) играет звук жидкости
         (assets/sfx/syringe/inject.mp3). +46 ХП по-прежнему на продавливании
         поршня (SYR_HEAL_T 3.45 с, setTimeout ниже) */
      setTimeout(function () {
        if (cancelled || BrixGame.state.phase !== 'playing') return;
        if (dead) return;
        BrixSfx.play('syrSquirt', { volume: 0.8, jitter: 0.05 });
      }, Math.round((window.BrixFirstPerson && BrixFirstPerson.SYR_NEEDLE_T ||
        2.5) * 1000));
      /* укол — точно на «продавливание» в клипе модели */
      setTimeout(function () {
        if (cancelled || BrixGame.state.phase !== 'playing') return;
        if (dead) return;
        setMyHp(Math.min(PLAYER_MAX_HP, myHp + SYR_HEAL));
        BrixSfx.play('chop1', { volume: 0.22, rate: 1.9 });
        try { if (window.BrixHud) BrixHud.toast(
          BrixState.data.lang === 'en' ? '+46 HP' : '+46 ХП', 2.5); } catch (eT2) {}
        if (BrixNet.mode === 'server') {
          BrixNet.send({ t: 'heal', n: SYR_HEAL });   // сервер подтвердит и разошлёт
        } else if (BrixNet.mode === 'tabs') {
          BrixNet.send({ t: 'phit', tid: BrixNet.id, hp: Math.round(myHp),
            kind: 'heal', by: '' });
        }
      }, Math.round((window.BrixFirstPerson && BrixFirstPerson.SYR_HEAL_T || 3.45) * 1000));
    }

    /** бросок С4 (ЛКМ с блоком в руках): убрать предмет, жест, физика */
    function throwC4() {
      if (c4Cooldown > 0) return;
      var s = inventory.slots[inventory.activeSlot];
      if (!s || !s.item || s.item.tool !== 'c4') return;
      c4Cooldown = 0.8;
      inventory.removeCount(inventory.activeSlot, 1);   // блок уходит из слота
      hands.triggerSwing('c4Throw');                    // быстрый бросок руками
      var fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      var pos = camera.position.clone().addScaledVector(fwd, 0.55);
      var vel = fwd.clone().multiplyScalar(C4_THROW_SPEED);
      vel.y += 3.0;                                     // лёгкая дуга вверх
      spawnC4(pos, vel, true);
      BrixSfx.play('chop2', { volume: 0.3, rate: 1.4 }); // лёгкий звук броска
    }

    /** локальный урон взрыва (соло/вкладки): постройки −400, игроки −250 */
    function c4LocalDamage(P) {
      if (window.BrixBuilding && BrixBuilding.piecesInRadius) {
        var pieces = BrixBuilding.piecesInRadius(P.x, P.y, P.z, C4_BUILD_R);
        pieces.forEach(function (pp) {
          var lh = BrixBuilding.localHit(pp.id, 'c4');   // BUILD_DMG.c4 = 400
          if (!lh) return;
          if (window.BrixNet && BrixNet.mode === 'tabs') {
            if (lh.dead) BrixNet.send({ t: 'brem', id: pp.id });
            else BrixNet.send({ t: 'bhp', id: pp.id, hp: lh.hp, max: lh.max });
          }
        });
      }
      Object.keys(remotes).forEach(function (pid) {
        var rp = remotes[pid];
        if (rp.dead || !rp.group) return;
        var pp = rp.group.position;
        var dx = pp.x - P.x, dz = pp.z - P.z, dy = (pp.y || 0) - P.y;
        if (dx * dx + dz * dz > C4_PLAYER_R * C4_PLAYER_R || Math.abs(dy) > 5) return;
        if (window.BrixNet) BrixNet.sendPhit(pid, C4_PLAYER_DMG, 'shot', 'c4', 0);
      });
    }

    /** визуал+звук взрыва: вспышка-сфера, свет, дым, звук по дистанции */
    function c4BoomFx(P) {
      var d = P.distanceTo(controls.position);
      var vol = Math.max(0, 1 - d / 80);
      vol *= vol;
      if (vol > 0.02) BrixSfx.play('c4Explosion', { volume: Math.max(0.12, vol), jitter: 0.02 });
      var flash = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.95,
          depthWrite: false }));
      flash.position.copy(P);
      scene.add(flash);
      var light = new THREE.PointLight(0xffc070, 8, 30, 2);
      light.position.copy(P).add(new THREE.Vector3(0, 0.6, 0));
      scene.add(light);
      var smokeTex = (function () {
        var c = document.createElement('canvas');
        c.width = c.height = 64;
        var g2 = c.getContext('2d');
        var gr = g2.createRadialGradient(32, 32, 4, 32, 32, 32);
        gr.addColorStop(0, 'rgba(70,66,60,0.9)');
        gr.addColorStop(1, 'rgba(70,66,60,0)');
        g2.fillStyle = gr;
        g2.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(c);
      })();
      var smokes = [];
      for (var i = 0; i < 6; i++) {
        var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex,
          color: 0x55504a, transparent: true, opacity: 0.8, depthWrite: false }));
        sp.position.copy(P).add(new THREE.Vector3(
          (Math.random() - 0.5) * 1.4, Math.random() * 0.9, (Math.random() - 0.5) * 1.4));
        sp.scale.setScalar(1.6 + Math.random());
        scene.add(sp);
        smokes.push(sp);
      }
      c4fxList.push({
        t: 0, dur: 0.5,
        tick: function (k) {
          flash.scale.setScalar(1 + k * 7);
          flash.material.opacity = 0.95 * (1 - k);
          light.intensity = 8 * (1 - k);
        },
        done: function () {
          scene.remove(flash); scene.remove(light);
          flash.geometry.dispose(); flash.material.dispose();
        }
      });
      c4fxList.push({
        t: 0, dur: 1.5,
        tick: function (k) {
          smokes.forEach(function (sp) {
            sp.position.y += 0.012;
            sp.material.opacity = 0.8 * (1 - k);
            sp.scale.multiplyScalar(1 + 0.004);
          });
        },
        done: function () {
          smokes.forEach(function (sp) { scene.remove(sp); sp.material.dispose(); });
          smokeTex.dispose();
        }
      });
    }

    /** взрыв конкретного блока: убрать, эффекты, урон (если мой) */
    function explodeC4(e) {
      var i = c4s.indexOf(e);
      if (i >= 0) c4s.splice(i, 1);
      var P = e.grp.position.clone();
      scene.remove(e.grp);
      c4BoomFx(P);
      if (e.own) {
        if (BrixNet.mode === 'server') {
          // урон считает СЕРВЕР (постройки + игроки), остальным — визуал
          BrixNet.send({ t: 'c4boom', x: P.x, y: P.y, z: P.z });
        } else {
          c4LocalDamage(P);
          // вкладки: другим — только визуал+звук
          if (window.BrixNet) BrixNet.send({ t: 'c4boom', x: P.x, y: P.y, z: P.z });
        }
      }
    }

    /** тик С4: полёт с физикой, тыки, взрыв */
    function tickC4(dt) {
      if (c4Cooldown > 0) c4Cooldown = Math.max(0, c4Cooldown - dt);
      // эффекты взрывов
      for (var f = c4fxList.length - 1; f >= 0; f--) {
        var fx = c4fxList[f];
        fx.t += dt;
        var k = fx.t / fx.dur;
        if (k >= 1) { fx.done(); c4fxList.splice(f, 1); }
        else fx.tick(k);
      }
      for (var i = c4s.length - 1; i >= 0; i--) {
        var e = c4s[i];
        e.t += dt;
        if (e.st === 'fly') {
          e.vel.y -= C4_GRAVITY * dt;
          var cur = e.grp.position;
          var np = cur.clone().addScaledVector(e.vel, dt);
          var seg = np.clone().sub(cur);
          var segLen = seg.length();
          c4Ray.set(cur, seg.clone().normalize());
          c4Ray.far = segLen + 0.12;
          var hits = c4Ray.intersectObjects(c4Targets(), true);
          if (hits.length) {
            // ПРИЛИП: земля/стена/потолок — лицевой гранью от поверхности
            var hit = hits[0];
            var n = hit.face ? hit.face.normal.clone()
              .transformDirection(hit.object.matrixWorld).normalize()
              : new THREE.Vector3(0, 1, 0);
            e.grp.position.copy(hit.point);
            orientC4FromNormal(e, n);
            e.st = 'armed';
            e.t = 0; e.beepI = 0; e.beepT = 0; e.fuseT = 0;
            if (e.own) {
              if (BrixNet.mode === 'server') {
                BrixNet.send({ t: 'c4place', x: e.grp.position.x,
                  y: e.grp.position.y, z: e.grp.position.z,
                  n: [n.x, n.y, n.z] });
              } else if (window.BrixNet) {
                // вкладки: другие вкладки тоже видят блок (у них он чужой)
                BrixNet.send({ t: 'c4placed', by: (BrixNet.id || 'tab'),
                  x: e.grp.position.x, y: e.grp.position.y, z: e.grp.position.z,
                  n: [n.x, n.y, n.z] });
              }
            }
          } else {
            cur.copy(np);
            /* ✅ v0.4.50 ФИКС «С4 ПРОПАДАЕТ В ГОРАХ/ХОЛМАХ»: страховка была
               cur.length() > C4_RANGE_MAX*3 — дистанция от ЦЕНТРА КАРТЫ,
               а не от бросавшего. Карта 900 м: за спавн-плато (~135 м от
               центра, там как раз холмы и горы) блок удалялся в первый же
               кадр, пока летит по дуге вверх. Теперь радиус — от ТОЧКИ
               БРОСКА (e.home), падение в море — ниже e.home.y − 60 */
            if (cur.y < e.home.y - 60 ||
                cur.distanceTo(e.home) > C4_RANGE_MAX * 3) {
              c4s.splice(i, 1);
              scene.remove(e.grp);
            }
          }
        } else if (e.st === 'armed') {
          e.beepT += dt;
          if (e.beepI < C4_BEEPS && e.beepT >= c4Interval(e.beepI)) {
            e.beepI++;
            e.beepT = 0;
            c4BeepSound(e.beepI);
            e.lamp.visible = true;             // мигание «глаза»
            (function (lamp) {
              setTimeout(function () { lamp.visible = false; }, 90);
            })(e.lamp);
          }
          if (e.own) {
            if (BrixNet.mode === 'server' && e.srvId) {
              /* ✅ v0.4.43: С4 ТИКАЕТ В СЕРВЕРЕ — свой блок НЕ взрываем сами,
                 ждём 'c4boom' с серверным id. Failsafe: сервер молчит
                 дольше 3 с ПОСЛЕ КОНЦА ПОЛНОГО ФЬЮЗА — взрываем сами и шлём
                 'c4boom' (совместимость со старым сервером).
                 ✅ v0.4.44 ФИКС «ВЗРЫВ ЗА 3 СЕКУНДЫ»: раньше сравнение было
                 fuseT >= c4Interval(последний) + 3.0 = 3.44 с — fuseT идёт
                 от ПРИЛИПА, а не от конца тыков, поэтому свой блок
                 взрывался в 3.44 с, задолго до сервера. Теперь
                 c4TotalFuse() + 3.0 = 11 с (failsafe, не ранний подрыв) */
              e.fuseT += dt;
              if (e.fuseT >= c4TotalFuse() + 3.0) explodeC4(e);
            } else if (e.beepI >= C4_BEEPS) {
              // соло/вкладки (или сервер ещё не подтвердил): как было
              e.fuseT += dt;
              if (e.fuseT >= c4Interval(C4_BEEPS - 1)) explodeC4(e);
            }
          } else if (BrixNet.mode === 'server' && e.srvId) {
            /* ✅ v0.4.43: чужой блок — взрыв пришлёт СЕРВЕР ('c4boom' с id);
               страховка-визуал только если сервер молчит очень долго */
            if (e.t > c4TotalFuse() + 4.0) explodeC4(e);
          } else if (e.t > c4TotalFuse() + 1.5) {
            // чужой блок: бросавший не прислал взрыв (вышел) — failsafe
            explodeC4(e);
          }
        }
      }
    }

    /* ============================================================
       ✅ v0.4.43 ОБЛОМКИ: что взрыв С4 снёс — НЕ исчезает молча.
       Сервер рассылает 'debris' {list:[{x,y,z,ty,sd}]} и у ВСЕХ игроков
       разрушенная деталь распадается на решётку 5×5 кусков: куски
       разлетаются с физикой (гравитация, отскок), падают на землю,
       лежат ~5.5 с и за 1.5 с «растворяются». Разлёт детерминирован
       сидом sd — у всех игроков выглядит одинаково. Куски чисто
       визуальные: на игру не влияют, сервер их не считает */
    var DEBRIS_G = 18;             // гравитация кусков, м/с²
    var DEBRIS_LIFE = 7.0;         // полное время жизни куска, с
    var DEBRIS_MAX = 280;          // жёсткий лимит кусков на экране
    var debris = [];               // {m, vx, vy, vz, rv, t, landed, bounced}
    var debrisGeo = null, debrisMats = null;

    /** детерминированный ГПСЧ (одинаковый разлёт у всех клиентов) */
    function debrisRng(seed) {
      var a = (seed | 0) || 1;
      return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        var t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }

    function spawnDebris(list) {
      if (!scene || !Array.isArray(list) || !list.length) return;
      if (!debrisGeo) {
        debrisGeo = new THREE.BoxGeometry(0.34, 0.20, 0.30);
        debrisMats = [
          new THREE.MeshStandardMaterial({ color: 0x8a6b4a, roughness: 0.95 }),   // дерево
          new THREE.MeshStandardMaterial({ color: 0x555a5e, roughness: 0.7, metalness: 0.5 }) // металл (сундук/дверь)
        ];
      }
      var total = 0;
      debris.forEach(function (d) { total++; });
      list.forEach(function (p) {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
        var rng = debrisRng(p.sd);
        var metal = (p.ty === 'ch' || p.ty === 'dr') ? 1 : 0;
        var N = 5, span = 2.6;                       // решётка 5×5 в площади детали
        for (var i = 0; i < N; i++) {
          for (var j = 0; j < N; j++) {
            if (total >= DEBRIS_MAX) return;
            var m = new THREE.Mesh(debrisGeo, debrisMats[metal]);
            m.position.set(
              p.x + (i / (N - 1) - 0.5) * span + (rng() - 0.5) * 0.12,
              (Number.isFinite(p.y) ? p.y : 0) + rng() * 0.5,
              p.z + (j / (N - 1) - 0.5) * span + (rng() - 0.5) * 0.12);
            m.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
            scene.add(m);
            debris.push({ m: m,
              vx: (rng() - 0.5) * 5.2, vy: 2.5 + rng() * 4.5, vz: (rng() - 0.5) * 5.2,
              rv: (rng() - 0.5) * 7, t: 0, landed: false, bounced: false });
            total++;
          }
        }
      });
    }

    function tickDebris(dt) {
      for (var i = debris.length - 1; i >= 0; i--) {
        var d = debris[i];
        var m = d.m;
        d.t += dt;
        if (!d.landed) {
          d.vy -= DEBRIS_G * dt;
          m.position.x += d.vx * dt;
          m.position.y += d.vy * dt;
          m.position.z += d.vz * dt;
          m.rotation.x += d.rv * dt;
          m.rotation.z += d.rv * 0.7 * dt;
          var gy = m.position.y - 1;
          try {
            if (window.BrixTerrain && BrixTerrain.heightAt) {
              gy = BrixTerrain.heightAt(m.position.x, m.position.z);
            }
          } catch (eGy) { gy = m.position.y - 1; }
          if (m.position.y <= gy + 0.10) {
            if (!d.bounced && d.vy < -3.2) {
              // одиночный мягкий отскок
              d.vy = -d.vy * 0.22; d.vx *= 0.5; d.vz *= 0.5; d.bounced = true;
            } else {
              d.landed = true;
              m.position.y = gy + 0.10;
              m.rotation.x = 0; m.rotation.z = 0;
            }
          }
        }
        if (d.t > DEBRIS_LIFE - 1.5) {
          var k = Math.max(0, (DEBRIS_LIFE - d.t) / 1.5);
          m.scale.setScalar(Math.max(0.001, k));
          if (d.t >= DEBRIS_LIFE) {
            scene.remove(m);
            debris.splice(i, 1);
          }
        }
      }
    }

    function tickCombat(dt) {
      // ✅ v0.4.21 АВТООГОНЬ КАЛАША: ЛКМ зажата + калаш в руках → стреляем
      // каждый тик, кулдаун AK_FIRE_CD (0.10 с) не даёт спамить
      // ✅ v0.4.35: томпсон — тоже автоогонь (кулдаун 0.075 с)
      if (mouseDown && (rifleSlot() || tpSlot())) tryShoot();
      if (shootCd > 0) shootCd = Math.max(0, shootCd - dt);
      if (crossKick > 0) crossKick = Math.max(0, crossKick - dt * 0.05);
      // подброс камеры плавно возвращается
      if (recoilPitch > 0) {
        var d = Math.min(recoilPitch, dt * 0.055);
        controls.pitch -= d;
        recoilPitch -= d;
      }
      // перезарядка: таймер → заправляем обойму из запаса
      if (reloading) {
        reloadT += dt;
        // ✅ v0.4.19: у дробовика перезарядка дольше (SG_RELOAD_DUR)
        // ✅ v0.4.21: у калаша ещё дольше (AK_RELOAD_DUR = звук 3.4 с)
        // ✅ v0.4.35: у томпсона своя (TP_RELOAD_DUR = звук 3.7 с)
        var relDurLoc = sgSlot() ? SG_RELOAD_DUR
          : rifleSlot() ? AK_RELOAD_DUR
          : tpSlot() ? TP_RELOAD_DUR
          : rv3xSlot() ? RV3X_RELOAD_DUR : RELOAD_DUR;
        if (reloadT >= relDurLoc) {
          reloading = false;
          var s = gunSlot();
          // ✅ fix v0.4.20: страховка от mag = undefined/NaN (старые слоты огнестрела)
          if (s && (typeof s.mag !== 'number' || isNaN(s.mag))) s.mag = 0;
          if (s && s.mag < gunMagSize()) {
            var have = inventory.countItem(gunAmmoId());
            var need = Math.min(gunMagSize() - s.mag, have);
            if (need > 0) {
              inventory.removeCountByItem(gunAmmoId(), need);
              s.mag += need;
              inventory.renderAll();
            }
          }
        }
      }
      if (syrCd > 0) syrCd -= dt;   // ✅ v0.4.46: кулдаун шприца
      tickTracers(dt);
      tickC4(dt);          // ✅ v0.4.41: полёт/тыки/взрывы С4
      tickDebris(dt);      // ✅ v0.4.43: обломки разрушенных построек
      if (window.BrixCorpses) BrixCorpses.tick(dt);   // ✅ v0.4.43: пульс колец трупов
      updateCrosshair();
    }

    var onMouseDown = function (e) {
      if (BrixGame.state.phase !== 'playing') return;
      /* ✅ v0.4.41: на телефоне pointer lock нет — играем без него,
         пока тач-слой активен (меню открыты — isActive() ложный) */
      if (!lockedRef && !(window.BrixTouch && BrixTouch.isActive())) return;
      if (isInvOpen()) return;
      if (e.button === 0) {
        /* ✅ v0.4.6 СТРОИТЕЛЬСТВО: меню открыто — ЛКМ выбирает деталь;
           план строителя в руках — ЛКМ ставит выбранную деталь
           (обычный замах/выстрел при плане не происходит) */
        if (window.BrixBuilding && BrixBuilding.isMenuOpen()) {
          BrixBuilding.menuClick();
          return;
        }
        if (window.BrixBuilding && BrixBuilding.holdingPlan()) {
          BrixBuilding.tryPlace();
          return;
        }
        // ✅ v0.4.5: револьвер в руках — стреляем, иначе машем инструментом
        // ✅ v0.4.19: дробовик тоже стреляет; ✅ v0.4.21: калаш — автоогонь:
        // первый выстрел сразу, дальше стреляет тик при зажатой ЛКМ
        // ✅ v0.4.36: револьвер-карабин 3× — одиночный (без автоогня)
        // ✅ v0.4.41: С4 в руках — БРОСОК (физика, прилип, 15 тыков, взрыв)
        mouseDown = true;
        var c4Sel = inventory.slots[inventory.activeSlot];
        /* ✅ v0.4.46: ШПРИЦ в руках — УКОЛ (+46 хп, клип из GLB) */
        if (c4Sel && c4Sel.item && c4Sel.item.tool === 'syringe') { useSyringe(); return; }
        if (c4Sel && c4Sel.item && c4Sel.item.tool === 'c4') { throwC4(); return; }
        if (revSlot() || sgSlot() || rifleSlot() || tpSlot() || rv3xSlot()) tryShoot();
        else hitWithTool();
      } else if (e.button === 2) {
        startAim();      // ПКМ — прицеливание
      }
    };
    // ПКМ отпустили (может быть и вне canvas) — прицел плавно опускаем;
    // ЛКМ отпустили — автоогонь калаша прекращается
    var onMouseUp = function (e) {
      if (e.button === 0) mouseDown = false;
      if (e.button === 2) stopAim();
    };
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('contextmenu', function (e) {
      e.preventDefault();   // ПКМ — прицел, а не меню браузера
    });

    /* ---------- создание мира и реальная загрузка ---------- */
    var run = async function () {
      var setStage = function (k, p) {
        if (!cancelled) BrixGame.setStage(k, Math.round(p));
      };
      var yieldStage = function (k, base, span) {
        return function (frac) {
          setStage(k, base + frac * span);
          return nextFrame();
        };
      };

      try {
        /* 1 — подключение (короткая сетевая пауза) */
        setStage('load.step.connect', 3);
        await sleep(500);
        if (cancelled) return;
        setStage('load.step.auth', 8);
        await sleep(400);
        if (cancelled) return;

        /* 2 — ландшафт: настоящая генерация высот и цветов */
        var terrainGeo = await T.buildTerrainGeometry(yieldStage('load.step.terrain', 10, 42));
        if (cancelled) return;

        var terrainMat = new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 1,
          metalness: 0
        });
        terrain = new THREE.Mesh(terrainGeo, terrainMat);
        terrain.receiveShadow = quality !== 'low';
        scene.add(terrain);
        disposables.push(terrainGeo, terrainMat);
        /* ✅ v0.4.44: меш рельефа доступен corpse-лучу (лут трупа через
           рельеф запрещён — corpses.js aimed()) */
        window.__brixTerrainMesh = terrain;

        /* ✅ v0.4.42 ТЕКСТУРЫ БИОМОВ + КРАСИВЫЕ ПЕРЕХОДЫ: в материал
           террейна внедряется сплат-шейдер (terrainlook.js) — по вершинным
           весам brixSplat смешиваются 7 процедурных бесшовных текстур
           (сочный луг / сухостой / земля / камень / снег / песок / дно).
           Границы биомов дополнительно рвутся попиксельным шумом —
           трава, песок и снег больше НЕ однотонная заливка.
           Если шейдер не соберётся — материал остаётся вершинным (fallback). */
        if (window.BrixTerrainLook) {
          try {
            var lookTexs = BrixTerrainLook.apply(terrainMat);
            for (var lt = 0; lt < lookTexs.length; lt++) disposables.push(lookTexs[lt]);
            console.log('[BrixWorld] текстуры биомов применены (7 слоёв)');
          } catch (eLook) {
            console.warn('[BrixWorld] текстуры биомов не применились, обычные цвета:',
              eLook && eLook.message);
          }
        }

        /* ✅ v0.4.42 СЛЕДЫ НОГ на песке и снегу: своих — максимум 50,
           самые первые исчезают первыми (FIFO); чужие — общий лимит 24.
           Направление по ходу, лежат по наклону, тают мягко. */
        if (window.BrixFootprints) {
          try {
            BrixFootprints.init(scene);
            disposables.push({ dispose: function () { BrixFootprints.dispose(); } });
          } catch (eFoot) {
            console.warn('[BrixWorld] следы не заработали (не критично):',
              eFoot && eFoot.message);
          }
        }

        /* 3 — растительность и камни */
        setStage('load.step.flora', 53);
        decor = await BrixWorld.buildDecor(scene, yieldStage('load.step.flora', 53, 30));

        /* ✅ v0.4.38 ЕДИНСТВЕННАЯ ГРУНТОВАЯ ДОРОГА — лента по рельефу
           (маршрут проверен по heightAt: без воды и снега; см. road.js).
           Деревья/трава её уже обошли (world.js спрашивает BrixRoad.near) */
        if (window.BrixRoad) {
          try {
            var road = BrixRoad.build(scene, T);
            /* ✅ v0.4.44 ФИКС: раньше пушлась САМА функция road.dispose —
               stop() звал d.dispose() у функции и падал «d.dispose is not
               a function» при каждом выходе в меню (обрывая уборку мира) */
            disposables.push({ dispose: road.dispose });
            console.log('[BrixWorld] грунтовая дорога построена: точек ' + BrixRoad.points().length);
          } catch (eRoad) {
            console.warn('[BrixWorld] дорога не построилась (не критично):', eRoad && eRoad.message);
          }
        }

        /* ================= МУЛЬТИПЛЕЕР (v0.3.1) =================
           АВТОРИТЕТНЫЙ СЕРВЕР (как в Rust/Oxide):
           - сервер держит ростер игроков и общий мир (запасы);
           - новый игрок получает welcome: СПИСОК ВСЕХ ИГРОКОВ с их
             позициями (видит старых!) + состояние мира;
           - удар по ресурсу: клиент шлёт ЗАПРОС, сервер считает
             остаток и решает «упало/рассыпалось», рассылает всем;
           - игроки: X/Y/Z, высота, поворот, анимация, инструмент
             в руках — 12 раз в секунду;
           - трава НЕ синхронизируется (декорация). */
        remoteRoot = new THREE.Group();      // все чужие игроки
        scene.add(remoteRoot);
        var mpSendT = 0;

        function ensureRemote(id, name) {
          if (!remotes[id]) {
            remotes[id] = new BrixRemotePlayer(name || 'Игрок', null);
            // ✅ v0.4.5: id в userData — по нему луч пули находит жертву
            remotes[id].group.userData.pid = id;
            remoteRoot.add(remotes[id].group);
          }
          return remotes[id];
        }

        /** удар ДРУГОГО игрока по ресурсу — применяем у себя
            (предметы не начисляем: они падают в инвентарь бьющего) */
        function applyRemoteHit(msg) {
          if (!decor) return;
          if (msg.k === 'tree') {
            var rec = decor.trees[msg.i];
            if (!rec || rec.state === 'falling' || rec.state === 'fallen' || rec.state === 'gone') return;
            // ✅ v0.3.2: остаток — от сервера/отправителя; если его нет,
            // вычитаем сами (синхронизация количества дерева между вкладками)
            if (msg.l !== undefined && msg.l !== null) rec.woodLeft = msg.l;
            else if (msg.y !== undefined) rec.woodLeft = Math.max(0, (rec.woodLeft || 0) - msg.y);
            var fell = msg.d !== undefined ? msg.d : (rec.woodLeft <= 0 ? 1 : 0);
            if (fell) {
              rec.state = 'falling';
              rec.fallT = 0;
              rec.fallDir = msg.fd || (Math.random() > 0.5 ? 1 : -1);
              if (rec.collider) rec.collider.active = false;
              BrixSfx.play('treeFall', { volume: 0.7 });
            } else {
              rec.shakeT = 0.35;
              if (rec.state === 'alive') rec.state = 'shake';
            }
          } else {
            var arr = decor.ores[msg.ty];
            if (!arr) return;
            var rec2 = arr[msg.i];
            /* ✅ v0.4.45 ФИКС «хп руды синхронизируется, а ЛОМАНИЕ нет»:
               раньше стоял жёсткий guard «state !== 'alive'» — событие удара,
               пришедшее, пока жила трясётся (state 'shake', 0.3 с), молча
               отбрасывалось. Финальный удар (d=1, «жила рассыпалась»),
               пришедший в этот момент (лаг-бёрст, микрофриз кадра — shakeT
               замирает, событие не применяется), ТЕРЯЛСЯ НАВСЕГДА: у других
               игроков жила оставалась стоять, хотя хп/запас сходились.
               Теперь блокируем только уже убранную жилу ('gone'), удар
               применяется и в 'shake' — как у деревьев выше */
            if (!rec2 || rec2.state === 'gone') return;
            if (msg.l !== undefined && msg.l !== null) rec2.left = msg.l;
            else if (msg.y !== undefined) rec2.left = Math.max(0, (rec2.left || 0) - msg.y);
            var broke = msg.d !== undefined ? msg.d : (rec2.left <= 0 ? 1 : 0);
            if (broke) {
              // рассыпание всегда побеждает: убираем меш, гасим коллайдер
              decor.hideOre(rec2);
              BrixSfx.play('stoneBreak', { volume: 0.7 });
            } else {
              rec2.shakeT = 0.3;
              if (rec2.state === 'alive') rec2.state = 'shake';
            }
          }
        }

        /** мета для сервера (первый вошедший задаёт мир): запасы деревьев и руд */
        function buildWorldMeta() {
          return {
            trees: decor.trees.map(function (r) {
              return { w: (r.state === 'alive' || r.state === 'shake') ? r.woodLeft : 0 };
            }),
            ores: {
              iron: decor.ores.iron.map(function (r) { return r.state === 'alive' ? r.left : 0; }),
              sulfur: decor.ores.sulfur.map(function (r) { return r.state === 'alive' ? r.left : 0; }),
              stone: decor.ores.stone.map(function (r) { return r.state === 'alive' ? r.left : 0; })
            }
          };
        }

        /** применить авторитетный снимок мира (welcome сервера) */
        function applyWorldState(worldMsg) {
          if (!decor || !worldMsg || !worldMsg.trees) return;
          decor.trees.forEach(function (rec, idx) {
            var s = worldMsg.trees[idx];
            if (!s) return;
            rec.woodLeft = s.w;
            if (s.g && (rec.state === 'alive' || rec.state === 'shake')) {
              // дерево уже срублено у других: доигрываем падение локально
              rec.state = 'falling';
              rec.fallT = 1.8;
              rec.fallDir = s.fd || 1;
              if (rec.collider) rec.collider.active = false;
            }
          });
          ['iron', 'sulfur', 'stone'].forEach(function (type) {
            var arr2 = worldMsg.ores && worldMsg.ores[type];
            if (!arr2) return;
            decor.ores[type].forEach(function (rec3, idx3) {
              var v = arr2[idx3];
              if (v === undefined) return;
              rec3.left = v;
              /* ✅ v0.4.45: прятать выработанную жилу в ЛЮБОМ состоянии
                 (кроме уже убранной) — раньше условие «state === 'alive'»
                 могло пропустить жилу в 'shake' и она висела навсегда */
              if (v <= 0 && rec3.state !== 'gone') decor.hideOre(rec3);
            });
          });
        }

        /** снимок мира в формате режима вкладок (без сервера) */
        function buildTabsSnapshot() {
          return {
            tr: decor.trees.map(function (r) {
              return { w: r.woodLeft, f: (r.state !== 'alive' && r.state !== 'shake') ? 1 : 0,
                       g: r.state === 'gone' ? 1 : 0, fd: r.fallDir || 1 };
            }),
            or: {
              iron: decor.ores.iron.map(function (r) { return r.state === 'alive' ? r.left : 0; }),
              sulfur: decor.ores.sulfur.map(function (r) { return r.state === 'alive' ? r.left : 0; }),
              stone: decor.ores.stone.map(function (r) { return r.state === 'alive' ? r.left : 0; })
            }
          };
        }

        /* режим вкладок (без сервера): снимок мира от другой вкладки */
        function applyTabsSnapshot(msg) {
          if (!decor || !msg.tr) return;
          applyWorldState({ trees: msg.tr.map(function (s) { return { w: s.w, g: s.g, fd: s.fd }; }),
            ores: msg.or });
        }

        /* ============================================================
           ✅ v0.4.46 СОХРАНЕНИЕ ИГРОКА («вышел — зашёл — всё на месте»).
           Сервер (server.js 0.4.46) хранит по BRIX-ID: позицию (ноги),
           поворот, ХП, ВЕСЬ инвентарь и выбранный слот хотбара. Клиент:
           • шлёт 'psave' раз в 3 с и при выходе со страницы;
           • welcome.psave — восстанавливает всё сразу после спавна
             (телепорт на сохранённое место, вещи в слоты, свой слот).
           При СМЕРТИ сервер стирает сохранение (pdeath): весь инвентарь
           уходит в труп-лутбокс — задвоение вещей невозможно
           ============================================================ */
        var savedP = null;        // psave из welcome (ждёт спавна)
        var saveRestored = false; // восстановили один раз
        function stashPlayerSave(sv) {
          if (!sv || saveRestored) return;
          savedP = sv;
          try { applyPlayerSave(); } catch (e) {}   // мир уже готов — применить сразу
        }
        function applyPlayerSave() {
          if (!savedP || saveRestored || !spawnPoint) return;
          var sv = savedP;
          savedP = null;
          saveRestored = true;
          try {
            /* --- позиция и поворот (только серверный режим) --- */
            if (BrixNet.mode === 'server' &&
                typeof sv.x === 'number' && typeof sv.z === 'number' &&
                isFinite(sv.x) && isFinite(sv.z)) {
              controls.spawnAt(sv.x, sv.z, sv.yaw || controls.yaw);
              controls.enabled = true;
              /* дом мог стоять НАД рельефом (или игрок был на 2 этаже):
                 если сохранённые ноги ВЫШЕ земли — ставим на сохранённую
                 высоту (пол не сохранился — игрок честно упадёт) */
              if (typeof sv.y === 'number' && isFinite(sv.y)) {
                var feetNow = controls.position.y - controls.eyeH;
                if (sv.y > feetNow + 0.4) {
                  controls.position.y = sv.y + controls.eyeH;
                  controls._fallPeak = controls.position.y;
                }
              }
            }
            /* --- инвентарь + выбранный слот хотбара --- */
            if (Array.isArray(sv.inv) && window.BrixItems) {
              var I = inventory;
              I.slots = new Array(I.slots.length).fill(null);
              for (var i = 0; i < Math.min(sv.inv.length, I.slots.length); i++) {
                var e = sv.inv[i];
                var def = e && BrixItems[e.id];
                if (!def) continue;
                var slot = { item: def, count: def.stackable
                  ? Math.max(1, Math.min(def.stack || 999, Math.floor(Number(e.n) || 1)))
                  : 1 };
                /* обойма возвращается вместе с оружием (1–30/6/2 по типу) */
                var magMax = { revolver: 6, shotgun: 2, rifle: 30, smg: 30, rev3x: 6 }[def.tool];
                if (magMax) slot.mag = Math.max(0, Math.min(magMax, Math.floor(Number(e.mag) || 0)));
                I.slots[i] = slot;
              }
              I.renderAll();
              I.select(Math.max(0, Math.min(5, Math.floor(Number(sv.hot) || 0))));
              if (I._notifySelect) I._notifySelect();
            }
            /* --- здоровье (сервер уже восстановил своё p.hp) --- */
            if (typeof sv.hp === 'number' && isFinite(sv.hp) && sv.hp > 0) {
              setMyHp(Math.min(PLAYER_MAX_HP, sv.hp));
            }
            try { if (window.BrixHud) BrixHud.toast(
              'Место и вещи сохранены — ты вернулся туда, где вышел', 5); } catch (eT) {}
            console.log('[psave] сохранение игрока применено (x=' + sv.x + ' z=' + sv.z +
              ' предметов ' + (sv.inv ? sv.inv.length : 0) + ')');
          } catch (eApply) { console.warn('[psave] не применил сохранение:', eApply); }
        }
        function sendPlayerSave() {
          if (BrixGame.state.phase !== 'playing' || BrixNet.mode !== 'server') return;
          if (dead || !controls || !inventory) return;
          try {
            var inv = [];
            for (var i = 0; i < inventory.slots.length; i++) {
              var s2 = inventory.slots[i];
              if (s2 && s2.item) inv.push({ id: s2.item.id, n: s2.count, mag: s2.mag || 0 });
            }
            BrixNet.send({ t: 'psave',
              x: Math.round(controls.position.x * 100) / 100,
              y: Math.round((controls.position.y - controls.eyeH) * 100) / 100,
              z: Math.round(controls.position.z * 100) / 100,
              yaw: Math.round(controls.yaw * 100) / 100,
              hp: Math.round(myHp), hot: inventory.activeSlot, inv: inv });
          } catch (eS) {}
        }
        /* раз в 3 с и при закрытии/скрытии страницы — позиция и вещи доедут */
        setInterval(sendPlayerSave, 3000);
        window.addEventListener('pagehide', function () { try { sendPlayerSave(); } catch (e) {} });
        window.addEventListener('beforeunload', function () { try { sendPlayerSave(); } catch (e) {} });

        BrixNet.on('welcome', function (msg) {
          /* ✅ v0.4.46: СОХРАНЕНИЕ ИГРОКА из welcome — применить сразу
             (если мир уже построен) или после спавна */
          if (msg.psave) stashPlayerSave(msg.psave);
          // РОСТЕР: создаём ВСЕХ игроков, которые уже были в мире
          (msg.players || []).forEach(function (p) {
            var rp = ensureRemote(p.id, p.n);
            if (p.s) rp.update(0, { x: p.s.x, y: p.s.y, z: p.s.z, yaw: p.s.yaw, a: p.s.a, tool: p.s.tool, ph: p.s.ph || 0, c: p.s.c || 0 });
            // ✅ v0.4.5: здоровье игрока (полоска над головой)
            if (p.hp !== undefined && p.hp !== null) rp.setHp(p.hp);
          });
          if (msg.world) applyWorldState(msg.world);
          // ✅ v0.3.6: бочки/чекблоки/дропы (позиции и состояние сервера)
          if (msg.objs) buildObjects(msg.objs);
          // ✅ v0.4.6: ПОСТРОЙКИ (фундаменты/стены/потолки) — новый игрок
          //    сразу видит дом; хранятся у сервера в world-objs.json
          // ✅ v0.4.13: ep — поколение мира (для защиты от «воскрешения»
          //    постройки, очищенной CLEAR-BUILDS.bat)
          if (msg.objs && msg.objs.bd && window.BrixBuilding) {
            BrixBuilding.applySnapshot(msg.objs.bd, msg.objs.ep);
          }
          // ✅ v0.4.10: какие замки я уже разгадал (сервер помнит по BRIX-ID,
          // после перезахода верный код заново не спрашивается)
          if (msg.objs && msg.objs.dunl && window.BrixBuilding) {
            BrixBuilding.applyUnl(msg.objs.dunl);
          }
        });
        if (!window.__brixObjLocalInit) {
          window.__brixObjLocalInit = true;
          // режим вкладок: мир объектов строим ПО ТОЙ ЖЕ ФОРМУЛЕ, что у
          // сервера (server.js buildCheckblockLayout, seed 20261114).
          // ✅ v0.3.7: одиночных бочек/ящиков нет — только чекблоки с
          //    ломающимися бочками. ПОРЯДОК ВЫЗОВОВ rnd() = СИМВОЛ В СИМВОЛ
          //    с серверной копией, иначе раскладка у вкладок разойдётся!
          window.__buildLocalObjects = function () {
            if (!window.BrixProps || window.__objsBuilt) return;   // сервер уже прислал
            var a = 20261114;
            function rnd() {
              a |= 0; a = a + 0x6D2B79F5 | 0;
              var t = Math.imul(a ^ a >>> 15, 1 | a);
              t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
              return ((t ^ t >>> 14) >>> 0) / 4294967296;
            }
            var ITEMS = ['washer', 'fridge', 'tv'];
            var cb = [];
            for (var i = 0; i < 40; i++) {
              var x, z;
              do { x = (rnd() - 0.5) * 680; z = (rnd() - 0.5) * 680; } while (Math.sqrt(x * x + z * z) < 40);
              var rec = { id: 'c' + i,
                x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10,
                rot: Math.round(rnd() * 628) / 100,
                item: ITEMS[Math.floor(rnd() * 3)],
                seed: 1 + Math.floor(rnd() * 1000000),
                mil: rnd() < 0.05 ? 1 : 0,
                taken: false, bar: [] };
              var nb = rnd() < 0.5 ? 2 : 3, a0 = rnd() * Math.PI * 2;
              for (var j = 0; j < nb; j++) {
                var ang = a0 + j * (0.7 + rnd() * 0.4);
                var d = 1.2 + rnd() * 0.8 + j * 0.15;
                rec.bar.push({ id: rec.id + 'b' + j,
                  lx: Math.round(Math.cos(ang) * d * 100) / 100,
                  lz: Math.round(Math.sin(ang) * d * 100) / 100,
                  wy: Math.round(rnd() * 628) / 100,
                  lying: j === 0 ? 1 : 0, hp: 2, brk: false });
              }
              // ✅ v0.3.8: лут ящика для вкладок (на сервере — свой rollLoot)
              rec.gone = false;
              rec.loot = rollLootLocal(rec.mil);
              cb.push(rec);
            }
            buildObjects({ cb: cb, dr: [] });
          };
          // сервер отвечает welcome'ом ~1 с; нет — значит режим вкладок
          setTimeout(function () { window.__buildLocalObjects(); }, 3000);
        }
        BrixNet.on('join', function (id, name) { ensureRemote(id, name); });
        BrixNet.on('leave', function (id) {
          if (remotes[id]) {
            remoteRoot.remove(remotes[id].group);
            delete remotes[id];
          }
        });
        BrixNet.on('state', function (msg) {
          var rp = ensureRemote(msg.id, msg.n);
          // ✅ v0.4.5: возрождение — игрок снова шлёт состояние после смерти
          if (rp.dead) rp.respawn();
          rp.update(0, { x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, a: msg.a, tool: msg.tool, ph: msg.ph || 0, c: msg.c || 0 });
        });
        BrixNet.on('hit', applyRemoteHit);
        BrixNet.on('worldReq', function (toId) {
          BrixNet.sendWorldTo(toId, buildTabsSnapshot());
        });
        BrixNet.on('world', applyTabsSnapshot);

        // строка статуса сети на HUD
        mpEl = document.createElement('div');
        mpEl.style.cssText = 'position:absolute;left:12px;bottom:34px;z-index:6;' +
          'color:#b9c4d0;font:11px/1.5 Consolas,monospace;text-shadow:0 1px 2px rgba(0,0,0,.8);' +
          'pointer-events:none;white-space:pre';
        (hudEl || mount).appendChild(mpEl);
        BrixNet.setStatusEl(mpEl);

        // ✅ v0.4.0 ДИАГНОСТИКА ВЕРХНЕЙ СТРОКОЙ HUD: версия клиента +
        //    режим сети + «отвечает ли сервер» (ping/pong каждые 12 с).
        //    По одному взгляду на этот угол видно: играет ли браузер
        //    свежими файлами и жив ли server.js — так пользователь
        //    сразу заметит старый кэш или незапущенный/старый сервер
        var diagEl = document.createElement('div');
        diagEl.style.cssText = 'position:absolute;left:12px;top:12px;z-index:6;' +
          'color:#9fb3c8;font:11px/1.5 Consolas,monospace;text-shadow:0 1px 2px rgba(0,0,0,.8);' +
          'pointer-events:none;white-space:pre';
        (hudEl || mount).appendChild(diagEl);
        var serverAlive = null;   // null = ещё не проверяли, true/false = pong
        function renderDiag() {
          /* ✅ v0.4.17: версия из index.html (BRIX_VER) — раньше была
             зашита «v0.4.12» и врала. Плюс версия СЕРВЕРА: новый server.js
             присылает её в welcome.sv; пусто = сервер старый (панели в
             нём нет); «вкладки» = игра вообще без server.js */
          var ver = 'BRIX v' + (window.BRIX_VER || '0.4.17');
          var net = BrixNet.mode === 'server'
            ? ('СЕТЬ: сервер' + (BrixNet.serverSv ? ' (v' + BrixNet.serverSv + ')'
                : ' (СТАРЫЙ server.js — без панели!)'))
            : 'СЕТЬ: вкладки (БЕЗ сервера!)';
          var hp;
          if (BrixNet.mode !== 'server') hp = '· сервер не нужен';
          else if (serverAlive === null) hp = '· сервер: проверяю…';
          else if (serverAlive) hp = '· сервер отвечает ✓';
          else hp = '· СЕРВЕР НЕ ОТВЕЧАЕТ ✗ (старая версия? перезапусти из новой папки)';
          // ✅ v0.4.1: два ПОНЯТНЫХ счётчика вместо трёх разных:
          // НА СЕРВЕРЕ — все подключения (включая тех, кто в меню) —
          // с сервера (cnt), В ИГРЕ — считаем локально (мы + кого видим),
          // чтобы число было актуальным сразу, а не после пуша
          var srv = window.__brixServerCount;
          var cnt;
          var ingameLocal = Object.keys(remotes).length + 1;
          if (BrixNet.mode === 'server' && srv !== undefined) {
            cnt = ' · НА СЕРВЕРЕ: ' + srv + ' · В ИГРЕ: ' + ingameLocal;
          } else {
            cnt = ' · В ИГРЕ: ' + ingameLocal;
          }
          diagEl.textContent = ver + ' · ' + net + cnt + (hp ? ' ' + hp : '');
          diagEl.style.color = serverAlive === false ? '#e08a6d' : '#9fb3c8';
        }
        renderDiag();
        setInterval(renderDiag, 2000);
        // ping/pong: сервер отвечает мгновенно; «НЕ ОТВЕЧАЕТ» — только
        // если ответа нет 4 с (не мигает между пингами)
        var awaitingPong = false;
        BrixNet.on('pong', function () {
          awaitingPong = false;
          serverAlive = true;
          renderDiag();
        });
        var pingCycle = function () {
          if (cancelled || BrixNet.mode !== 'server') return;
          awaitingPong = true;
          BrixNet.send({ t: 'ping' });
          setTimeout(function () {
            if (!awaitingPong || cancelled) return;
            awaitingPong = false;
            serverAlive = false;
            renderDiag();
          }, 4000);
        };
        // первый пинг почти сразу, дальше — каждые 12 с
        setTimeout(function () { pingCycle(); }, 1500);
        var pingTimer = setInterval(pingCycle, 12000);

        /* ✅ v0.4.1: ЕДИНЫЙ счётчик — теперь верхняя строка-диагностика
           показывает ВСЁ сразу: «BRIX v0.4.1 · сервер отвечает ✓ ·
           НА СЕРВЕРЕ: 2 · В ИГРЕ: 1». Отдельной жёлтой строки внизу
           больше нет — раньше рядом были «игроков: 1» и «НА СЕРВЕРЕ
           СЕЙЧАС: 2» и было непонятно, что как считать */
        window.__brixCountEl = null;   // бывший элемент нижней строки

        // ✅ v0.3.6: подсказка подбора у прицела
        hintEl = document.createElement('div');
        hintEl.style.cssText = 'position:absolute;left:50%;top:56%;transform:translateX(-50%);' +
          'z-index:6;color:#ffd98a;font:13px/1.4 Consolas,monospace;text-shadow:0 1px 3px rgba(0,0,0,.9);' +
          'pointer-events:none;display:none';
        (hudEl || mount).appendChild(hintEl);
        var hintTimer = setInterval(function () {
          if (cancelled) { clearInterval(hintTimer); return; }
          if (!window.BrixProps) { return; }
          if (BrixGame.state.phase !== 'playing' ||
              (window.BrixLootMenu && BrixLootMenu.isOpen())) {
            hintEl.style.display = 'none'; return;
          }
          var fwdH = new THREE.Vector3();
          camera.getWorldDirection(fwdH);
          /* ✅ v0.4.22: подсказка у сундука — приоритет над ящиками */
          var chAim = (window.BrixBuilding && BrixBuilding.chestAim)
            ? BrixBuilding.chestAim() : null;
          if (chAim) {
            hintEl.style.display = 'block';
            hintEl.textContent = '[F] — ' + BrixState.t('hint.openChest');
          } else {
            /* ✅ v0.4.43: подсказка у трупа — приоритет над ящиками */
            var corpNear = (window.BrixCorpses)
              ? BrixCorpses.nearest(controls.position, 3.2) : null;
            if (corpNear) {
              var ce = BrixCorpses.get(corpNear);
              hintEl.style.display = 'block';
              hintEl.textContent = '[F] — ' + BrixState.t('hint.corpse', { n: ce ? ce.n : '' });
            } else {
              var pick = BrixProps.nearestPickup(controls.position, 3, fwdH);
              if (pick) {
                hintEl.style.display = 'block';
                hintEl.textContent = pick.kind === 'cb'
                  ? '[F] — ' + BrixState.t('hint.openCrate')
                  : '[F] — ' + BrixState.t('hint.pickup', { item: BrixState.t('item.' + pick.item) });
              } else {
                hintEl.style.display = 'none';
              }
            }
          }
        }, 250);

        BrixNet.connect(buildWorldMeta());
        /* ================= /МУЛЬТИПЛЕЕР ================= */
        if (cancelled) return;
        // ✅ v0.2.9: коллайдеры деревьев и рудных жил (стволы и камни
        // больше не проходимы насквозь)
        if (controls.setColliders && decor.colliders) controls.setColliders(decor.colliders);
        /* ✅ v0.4.24 маяк: AABB (ступени/выступы/стены) — отдельным списком,
           цилиндр башни уже в decor.colliders */
        if (controls.addBoxColliders && decor.lighthouseBoxes) {
          controls.addBoxColliders(decor.lighthouseBoxes);
        }

        /* ✅ v0.4.6 СТРОИТЕЛЬСТВО: система дома (фундамент/стена/потолок).
           Инициализация ПОСЛЕ террейна и декора; коллайдеры стен и палуб
           отдаются контроллеру, снимок построек приходит в welcome
           (objs.bd от server.js v0.4.6), вкладки — BroadcastChannel+localStorage */
        if (window.BrixBuilding) {
          BrixBuilding.init({
            scene: scene,
            camera: camera,
            terrainMesh: terrain,
            groundY: T.heightAt,
            controls: controls,
            quality: quality,
            getPos: function () { return controls.position; },
            /* ✅ fix 0.4.11: клавиатура кодового замка живёт БЕЗ выхода из
               pointer lock. openPad: гасим паузу (если была); closePad:
               возвращаем мышь сами (авто-повтор, как в fix 0.4.5a) —
               игрок после ввода кода сразу продолжает игру */
            onPad: function (padOpen) {
              var pause = document.getElementById('pauseOverlay');
              if (padOpen) {
                if (pause) pause.classList.add('hidden');
                return;
              }
              var canvas = document.querySelector('#gameMount canvas');
              if (canvas && BrixGame.state.phase === 'playing' &&
                  !isInvOpen() && !isLootOpen() && !isMiniOpen()) {
                lockPointerSoon(canvas);
              }
              /* страховка: если захват мыши так и не удался (кулдаун
                 браузера после Esc) — через 2.5 с возвращаем стандартный
                 экран «Кликните по экрану, чтобы вернуться в игру»,
                 чтобы игрок не остался без курсора и без подсказки */
              setTimeout(function () {
                if (BrixGame.state.phase !== 'playing') return;
                if (document.pointerLockElement) return;
                if (window.BrixBuilding && BrixBuilding.isUiBlocked &&
                    BrixBuilding.isUiBlocked()) return;
                if (isInvOpen() || isLootOpen() || isMiniOpen()) return;
                if (pause) pause.classList.remove('hidden');
              }, 2500);
            }
          });
          if (controls.setBoxColliders) controls.setBoxColliders(BrixBuilding.wallBoxes());
        }

        /* 4 — вода, небо, свет */
        setStage('load.step.sky', 84);
        await nextFrame();
        var water = BrixWorld.createWater(scene);
        var sky = BrixWorld.createSky(scene);
        var lights = BrixWorld.createLights(scene, quality);
        disposables.push(water, sky, { dispose: function () { scene.remove(lights.sun); scene.remove(lights.sun.target); } });

        /* 5 — компиляция шейдеров (реальная) */
        setStage('load.step.shaders', 91);
        await nextFrame();
        if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
        else renderer.compile(scene, camera);
        if (cancelled) return;

        /* 6 — точка спавна
           ✅ v0.4.44: ЛАГЕРЬ НА СПАВНЕ УБРАН (просьба игрока: «убери на острове
           какой-то костер и кубики») — на спавне больше ничего не строится */
        setStage('load.step.spawn', 96);
        var spawn = await BrixWorld.findSpawn();
        if (cancelled) return;
        setStage('load.step.spawn', 100);
        await nextFrame();
        if (cancelled) return;

        /* спавн игрока: смотрим в сторону дальних гор */
        var look = new THREE.Vector3(-230, 0, -150);
        var dir = look.clone().sub(spawn);
        var yaw = Math.atan2(-dir.x, -dir.z);
        controls.spawnAt(spawn.x, spawn.z, yaw);
        controls.enabled = true;
        // ✅ v0.4.5: боевая HUD (крестик/ХП/вспышка/окно смерти) + точка возрождения
        spawnPoint = { x: spawn.x, z: spawn.z, yaw: yaw };
        buildCombatHud();
        setMyHp(PLAYER_MAX_HP);
        /* ✅ v0.4.46: если сохранение игрока пришло РАНЬШЕ спавна —
           применяем сейчас (телепорт на место, вещи, слот хотбара) */
        try { applyPlayerSave(); } catch (ePs) {}

        /* ✅ v0.4.3: МИНИ-МЕНЮ (клавиша M). Игра при открытом меню
           НЕ выключается на сервере: рендер и сеть живут, управление
           стоит. getPos — для маркера на карте, onExit — выход
           в главное меню (отключение от сервера) */
        if (window.BrixMiniMenu) {
          BrixMiniMenu.init({
            getPos: function () {
              return { x: controls.position.x, z: controls.position.z, yaw: controls.yaw };
            },
            onExit: function () { BrixGame.disconnect(); }
          });
        }

        /* ✅ v0.4.15: ПАНЕЛЬ РАЗРАБОТЧИКА (клавиша 9, только для ID
           владельца — подтверждает сервер). getPos — подставить свои
           координаты в телепорт; tp — применить телепорт от сервера */
        if (window.BrixAdmin) {
          BrixAdmin.init({
            getPos: function () {
              return { x: controls.position.x, z: controls.position.z };
            },
            tp: function (x, z) {
              controls.spawnAt(x, z, controls.yaw);
            }
          });
        }

        /* ✅ v0.4.25 СКИНЫ: смена скина — перерисовать иконки в инвентаре
           и наложить/снять обёртку на модель в руках (если кирка выбрана) */
        if (window.BrixWeaponSkins) {
          BrixWeaponSkins.on(function () {
            try { inventory.renderForSkin(); } catch (e) {}
            if (hands && hands.applySkin) {
              hands.applySkin(hands.currentWeapon === 'ironPickaxe'
                ? BrixWeaponSkins.wrapFor('ironPickaxe') : null);
            }
          });
        }

        /* цикл рендера */
        var clock = new THREE.Clock();
        var loop = function () {
          raf = requestAnimationFrame(loop);
          var dt = clock.getDelta();
          var tt = clock.getElapsedTime();

          // ✅ v0.4.3 САМОВОССТАНОВЛЕНИЕ управления: enabled ВЫВОДИТСЯ
          //    из состояния (лут-меню/инвентарь/мини-меню открыты?),
          //    а не хранится. Раньше enabled=false ставился один раз и если меню не
          //    открывалось (старый сервер не отвечал на cbopen), игрок
          //    ЗАМИРАЛ НАВСЕГДА: «экран замерзает», бочки «не ломаются»,
          //    ящики «не открываются» — один и тот же залипший флаг.
          //    ✅ v0.4.3: мини-меню (M) и карта — управление тоже стоит,
          //    но рендер и сеть продолжаются (игрок виден на сервере)
          //    ✅ v0.4.5: мёртв — управления нет (окно возрождения)
          //    ✅ v0.4.10: клавиатура кодового замка / перелаз через окно —
          //    управление тоже стоит (BrixBuilding.isUiBlocked)
          controls.enabled = !dead && !isInvOpen() && !isLootOpen() && !isMiniOpen() &&
            !(window.BrixBuilding && BrixBuilding.isUiBlocked && BrixBuilding.isUiBlocked());
          /* ✅ v0.4.41 МОБИЛЬНОЕ УПРАВЛЕНИЕ: тач-слой (джойстик + кнопки
             на любом экране), аналоговый вектор в контроллер, на телефоне
             игра считается «залоченной» без pointer lock */
          if (window.BrixTouch) {
            BrixTouch.sync();
            if (BrixTouch.isActive()) {
              var tv = BrixTouch.moveVec();
              controls.setTouchVector(tv.x, tv.y);
              if (!lockedRef) setLocked(true);
            } else {
              controls.setTouchVector(0, 0);
            }
          }
          // ✅ v0.4.5: во время перезарядки игрок идёт МЕДЛЕННО даже бегом
          controls.slowFactor = reloading ? RELOAD_SLOW : 1;
          // прицеливание замедляет поворот мыши (наводка точнее)
          // ✅ v0.4.36: у револьвера-карабина в оптике ещё медленнее —
          // на 3× зуме иначе наводка «дёргается»
          controls.aimMul = aiming ? (rv3xSlot() ? RV3X_AIM_MUL : 0.55) : 1;
          // ✅ v0.4.45 ЛЕСТНИЦА-СТУПЕНИ: прежняя «зона лестницы» (W — лезть
          // на месте, гравитация off) УДАЛЕНА — ступени теперь настоящие:
          // floorAt держит игрока на каждой ступеньке, коллайдеры боксов
          // не пускают сквозь марш. Просто иди по лестнице как по земле
          controls.update(camera, dt);
          if (toolCooldown > 0) toolCooldown = Math.max(0, toolCooldown - dt);
          tickCombat(dt);
          /* ✅ v0.4.34 ХОЛОД: шкала/урон/иней/баннер — каждый кадр */
          coldTick(dt);

          // рука от 1-го лица: ходьба/бег/дыхание/удар/выстрел/перезарядка
          var mv = controls.getMoveState();
          lastMove = mv;   // ✅ v0.4.22: для запрета стрельбы на бегу
          // ✅ v0.4.21: БЕГ — автомат прижимается к груди (setRunning)
          hands.setRunning(!!(mv.moving && mv.sprint && mv.onGround));
          hands.update(dt, { speed: mv.moving ? (mv.sprint ? 10.5 : 6) : 0, onGround: mv.onGround, sprint: mv.sprint });
          /* ✅ v0.4.42 СЛЕДЫ: идёшь по песку/снегу — остаются следы
             (максимум 50, старые тают первыми); чужие игроки — тоже */
          if (window.BrixFootprints) {
            BrixFootprints.trackLocal(controls, mv, dt);
            BrixFootprints.tick(dt);
          }

          // ✅ v0.4.5: прицеливание плавно приближает камеру (72° → 56°)
          // ✅ v0.4.21: у калаша прицел слабее по миру (камера рук тоже сужает FOV)
          // ✅ v0.4.35: у томпсона — как у калаша
          // ✅ v0.4.36: у револьвера-карабина — ПРИЦЕЛ 3× (72° → 26°)
          var aimP = hands.aimProgress ? hands.aimProgress() : 0;
          var gunAim = !!((rifleSlot() || tpSlot()) && hands.aimProgress);
          if (gunAim) aimP = Math.max(aimP, (hands._ads || 0));
          var isR3Hold = !!rv3xSlot();
          var fovTarget = 72 - (isR3Hold ? (72 - RV3X_AIM_FOV)
            : (rifleSlot() || tpSlot()) ? 13 : 16) * aimP;
          if (Math.abs(camera.fov - fovTarget) > 0.05) {
            camera.fov = fovTarget;
            camera.updateProjectionMatrix();
          }

          /* ✅ v0.4.36: ОВЕРЛЕЙ ОПТИКИ — плавно следует за прицеливанием;
             на полном прицеле (прогресс > 0.8) руки/оружие прячем —
             игрок смотрит ЧЕРЕЗ прицел, как через настоящую оптику */
          if (combatHud.scope) {
            var scOn = isR3Hold && aiming && !dead;
            var scOp = scOn ? Math.max(0, Math.min(1, (aimP - 0.55) / 0.35)) : 0;
            combatHud.scope.style.display = scOp > 0 ? 'block' : 'none';
            combatHud.scope.style.opacity = scOp.toFixed(2);
            if (hands.handsScene) {
              hands.handsScene.visible = !(scOn && scOp > 0.8);
            }
          }

          // деревья: тряска и падение
          if (decor) decor.tick(dt);

          // ✅ v0.4.6: призрак постройки, кулдаун установки, подсказка плана
          if (window.BrixBuilding) BrixBuilding.tick(dt);

          /* МУЛЬТИПЛЕЕР: чужие игроки + отправка своего состояния 12 Гц */
          BrixNet.tick(dt, null);
          mpSendT -= dt;
          if (mpSendT <= 0) {
            mpSendT = 1 / 12;
            var mv2 = controls.getMoveState();
            var sel2 = inventory.getSelectedItem();
            // ✅ v0.4.9: план строителя в руках = выбран слот хотбара с
            // планом — tool 'plan' уходит другим автоматически через
            // getSelectedItem (механика planEquipped удалена)
            var tool2 = sel2 ? (sel2.tool || (sel2.item && sel2.item.tool) || '') : '';
            // анимация для других: перезарядка/выстрел/удар/прыжок/бег/покой
            var anim2 = 'idle';
            var ph2 = 0;
            // ✅ v0.4.19: у дробовика свои кулдауны (фаза чужой анимации честная)
            // ✅ v0.4.21: у калаша — свои (автоогонь 0.10 с, перезарядка 3.4 с)
            // ✅ v0.4.35: у томпсона — свои (0.075 с / 3.7 с)
            var isSgSel = !!(sel2 && (sel2.tool === 'shotgun' ||
              (sel2.item && sel2.item.tool === 'shotgun')));
            var isAkSel = !!(sel2 && (sel2.tool === 'rifle' ||
              (sel2.item && sel2.item.tool === 'rifle')));
            var isTpSel = !!(sel2 && (sel2.tool === 'smg' ||
              (sel2.item && sel2.item.tool === 'smg')));
            var isR3Sel = !!(sel2 && (sel2.tool === 'rev3x' ||
              (sel2.item && sel2.item.tool === 'rev3x')));
            var relDur = isSgSel ? SG_RELOAD_DUR
              : isAkSel ? AK_RELOAD_DUR
              : isTpSel ? TP_RELOAD_DUR
              : isR3Sel ? RV3X_RELOAD_DUR : RELOAD_DUR;
            var shotCd = isSgSel ? SG_SHOOT_CD
              : isAkSel ? AK_FIRE_CD
              : isTpSel ? TP_FIRE_CD
              : isR3Sel ? RV3X_SHOOT_CD : SHOOT_CD;
            if (reloading) { anim2 = 'reload'; ph2 = reloadT / relDur; }
            else if (shootCd > 0) { anim2 = 'shoot'; ph2 = 1 - shootCd / shotCd; }
            else if (toolCooldown > 0) { anim2 = lastSwingKind; ph2 = 1 - toolCooldown / TOOL_ANIM_DURATION; }
            else if (!mv2.onGround) anim2 = 'jump';
            else if (mv2.moving) anim2 = 'run';
            // фаза удара 0..1 — чтобы чужой игрок махал синхронно
            if (!dead) BrixNet.sendState({
              x: +controls.position.x.toFixed(2),
              y: +controls.position.y.toFixed(2),
              z: +controls.position.z.toFixed(2),
              yaw: +controls.yaw.toFixed(2),
              a: anim2,
              tool: tool2,
              ph: +ph2.toFixed(2),
              /* ✅ v0.4.28: присед едет в состоянии — чужие видят присевшего */
              c: controls.isCrouched ? (controls.isCrouched() ? 1 : 0) : 0,
              n: BrixNet.NAME
            });
          }
          if (window.BrixProps) BrixProps.tick(dt);
        for (var rk in remotes) remotes[rk].update(dt, null);
        /* ✅ v0.4.42: чужие игроки тоже оставляют следы на песке/снегу */
        if (window.BrixFootprints) {
          for (var fk in remotes) BrixFootprints.trackRemote(fk, remotes[fk]);
        }

          lights.tick(controls.position);
          sky.tick(camera);
          water.tick(tt);
          /* ✅ v0.4.44: лагерь на спавне убран (костер/кубики) — camp.tick больше нет */

          /* ✅ v0.4.37: рендерим только при живом WebGL-контексте.
             Пока драйвер перезагружается (context lost) — кадр просто
             пропускается, игровая логика и сеть продолжают работать.
             Первая отрисовка после восстановления идёт в try/catch:
             если какой-то материал ещё не пересобрался, кадр
             повторится на следующем тике — а игра больше НЕ падает
             с TypeError «'trim' of null» (как было раньше). */
          if (!glLost) {
            try {
              renderer.render(scene, camera);

              // руки от 1-го лица — поверх мира (отдельная сцена, как в репозитории)
              hands.renderOverlay();
            } catch (eGl) {
              if (!glErrShown) {
                glErrShown = true;
                console.warn('[BrixWorld] кадр пропущен — WebGL ещё восстанавливается: ' +
                  (eGl && eGl.message ? eGl.message : eGl));
              }
            }
          }

          /* FPS и координаты */
          hud.fpsFrames++;
          var now = performance.now();
          if (now - hud.fpsLast >= 500) {
            if (fpsEl) fpsEl.textContent = Math.round((hud.fpsFrames * 1000) / (now - hud.fpsLast));
            hud.fpsFrames = 0;
            hud.fpsLast = now;
            if (posEl) {
              posEl.textContent = controls.position.x.toFixed(0) + ' · ' +
                controls.position.y.toFixed(0) + ' · ' + controls.position.z.toFixed(0);
            }
          }
        };
        loop();

        /* учёт времени в игре для профиля */
        playTimer = setInterval(function () {
          if (lockedRef) BrixState.addPlaySeconds(1);
        }, 1000);

        worldRefs.push({ dispose: function () { cancelAnimationFrame(raf); } });
        BrixGame.setPlaying();
      } catch (err) {
        console.error('world build failed', err);
        if (window.BrixFatal) {
          BrixFatal('Ошибка загрузки мира: ' + (err && err.message ? err.message : err));
        }
        stop();
        BrixGame.disconnect();
      }
    };

    var onResize = function () {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    session = {
      stop: stop
    };

    function stop() {
      cancelled = true;
      // ✅ v0.4.3: мини-меню/карта закрываются вместе с миром
      if (window.BrixMiniMenu) BrixMiniMenu.shutdown();
      // ✅ v0.4.15: панель разработчика закрывается вместе с миром
      // (сервер заново подтвердит админа при следующем входе)
      if (window.BrixAdmin) BrixAdmin.shutdown();
      // ✅ v0.4.25: крафт-панель (Q) закрывается вместе с миром
      if (window.BrixCraft) BrixCraft.shutdown();
      // ✅ v0.4.44: меню печки закрывается вместе с миром
      if (window.BrixFurnace) BrixFurnace.shutdown();
      // ✅ v0.4.6: система строительства выключается вместе с миром
      if (window.BrixBuilding) BrixBuilding.shutdown();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('pointerlockchange', onLockChange);
      renderer.domElement.removeEventListener('click', onCanvasClick);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      // ✅ v0.4.5: боевая HUD убирается вместе с миром
      if (combatHud) {
        if (combatHud.mag && combatHud.mag.parentElement) combatHud.mag.parentElement.removeChild(combatHud.mag);
        if (combatHud.hp && combatHud.hp.parentElement) combatHud.hp.parentElement.removeChild(combatHud.hp);
        if (combatHud.flash && combatHud.flash.parentElement) combatHud.flash.parentElement.removeChild(combatHud.flash);
        if (combatHud.death && combatHud.death.parentElement) combatHud.death.parentElement.removeChild(combatHud.death);
        combatHud = null;
      }
      if (raf) cancelAnimationFrame(raf);
      if (playTimer) clearInterval(playTimer);
      worldRefs.forEach(function (d) { d.dispose(); });
      disposables.forEach(function (d) { d.dispose(); });
      hands.dispose();
      if (window.__brixDebug) delete window.__brixDebug;
      // ✅ v0.3.0: выходим из сети и убираем чужих игроков
      BrixNet.disconnect();
      for (var rk in remotes) delete remotes[rk];
      if (mpEl && mpEl.parentElement) mpEl.parentElement.removeChild(mpEl);
      if (hintEl && hintEl.parentElement) hintEl.parentElement.removeChild(hintEl);
      window.__brixCountEl = null;
      window.__brixServerCount = undefined;
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      session = null;
    }

    void run();

    return session;
  }

  function stop() {
    if (session) session.stop();
  }

  return { start: start, stop: stop };
})();
