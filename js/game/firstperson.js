// ============================================================
//  brix • js/game/firstperson.js
//  РУКИ ОТ 1-ГО ЛИЦА — порт scr/3d/firstPersonPlayer.js из
//  репозитория (vldSL05/rust-like → oxide5554-create/-glm).
//
//  Подход РЕПОЗИТОРА (как в шутерах):
//  - РУКИ БЕРУТСЯ ОТ 3D-МОДЕЛИ ИГРОКА (player_claude.glb):
//    полный риг Mixamo, IK рук, пальцы обхватывают рукоять.
//  - Руки + оружие рендерятся в ОТДЕЛЬНОЙ СЦЕНЕ поверх мира:
//    handsScene + статичная handsCamera (renderer.clearDepth).
//  - В 1-м лице видны только меши с материалом *arms*,
//    остальное тело скрыто (_applyVisibility).
//  - КАМЕННЫЙ ТОПОР (stone_axe.glb — та же модель, что в v0.2.3) и
//    КАМЕННАЯ КИРКА (stone_pickaxe.glb) держит ОДНА правая рука,
//    машут как раньше: atk1/atk2 (два чередующихся замаха).
//  - ✅ v0.2.10 ЖЕЛЕЗНАЯ КИРКА (pickaxe.glb) — теперь ТОЖЕ ОДНА правая рука
//    ТОЧНО КАК ТОПОР: тот же хват, тот же размер (0.58 м), ЛЕВАЯ РУКА СКРЫТА,
//    удар atk1; голова кирки повёрнута ВПЕРЁД (а не влево)
//  - ✅ v0.2.9 ЖЕЛЕЗНЫЙ ТОПОР (iron_axe.glb — модель пользователя
//    simple_axe.glb) — ОДНА правая рука, машет ОДНИМ ударом atk1
//    (без второго замаха), ЛЕВАЯ РУКА СКРЫТА: кости левой руки
//    схлопываются (scale→0), в 1-м лице видна только правая рука.
//  - Анимации: idle (дыхание) + atk1/atk2 (топор и каменная кирка) +
//    atkP — удар железной кирки ПО ПРЯМОЙ (с v0.2.10 не используется).
//
//  ✅ v0.4.6 РЕВОЛЬВЕР переделан: ствол вперёд (авто-ориентация), правая рука
//  держит рукоять сбоку, левая — с левой стороны, руки не закрывают ствол.
//  Настройка вживую: BrixFirstPerson.REV (см. блок REV ниже).
//
//  Публичный API (совместим со старым BrixFirstPerson):
//    new BrixFirstPerson(camera, renderer)
//    .loaded, .visible, .camera
//    .setWeapon('axe'|'pickaxe'|'ironPickaxe'|'ironAxe'|'plan'|null) — оружие из хотбара
//    .setVisible(bool)      — совместимость: топор вкл/выкл
//    .triggerSwing('atk1'|'atk2')
//    .update(dt, opts)
//    .renderOverlay()       — рендер рук поверх мира (после renderer.render)
//    .dispose()
// ============================================================
window.BrixFirstPerson = (function () {
  'use strict';

  var D = Math.PI / 180;

  // Хват топора (из preview-claude.html репозитория)
  var GRIP = { sS: 0.52, sC: 1.0, sT: 0.8, sG: 0.14, sX: 0.72, sP: 0.032, sR: 90 };
  var ARMS_SCALE = 1.4;
  /* ✅ v0.4.27 РАЗМЕР КАК У ЖЕЛЕЗНОГО ТОПОРА (тест 0.4.26 «имба»):
     все инструменты в руках теперь 0.78 м — почти как калаш (0.85).
     Рукоять в кулаке, выросла сама модель. Вернуть как было: 0.55. */
  var AXE_TARGET_LEN = 0.78; // длина каменного топора в руке, м (v0.4.27, было 0.55)
  var AXE_YAW = 0;           // доворот головы топора вокруг рукояти (град)

  // ✅ КАМЕННАЯ КИРКА — одна правая рука, машет как топор (как в v0.2.4)
  var GRIP_SPICK = Object.assign({}, GRIP);
  var SPICK_TARGET_LEN = 0.78; // длина каменной кирки в руке, м (v0.4.27, было 0.55)
  var SPICK_YAW = 0;           // доворот головы вокруг рукояти (град)

  // ✅ v0.2.8 ЖЕЛЕЗНАЯ КИРКА была ДВУРУКОЙ
  // ✅ v0.2.10 железная кирка — ТОЧНО КАК ТОПОР: одна правая рука,
  //    левая скрыта, тот же хват и тот же размер рукояти в руке
  var GRIP_PICKAXE = Object.assign({}, GRIP);
  var PICKAXE_TARGET_LEN = 0.78;   // длина железной кирки в руке, м (v0.4.27, было 0.58)
  var PICKAXE_PIVOT_Y = 0;         // сдвиг кирки по рукояти (в единицах модели)
  var PICKAXE_YAW = 0;             // ✅ v0.2.10: доворот головы кирки вокруг рукояти.
                                   // шипы кирки теперь ВПЕРЁД (по направлению удара),
                                   // а не влево-вправо (было 90 в v0.2.8/v0.2.9)

  // ✅ v0.2.9 ЖЕЛЕЗНЫЙ ТОПОР — одна правая рука, левая скрыта,
  // один удар atk1 (без бокового замаха atk2)
  var GRIP_IRONAXE = Object.assign({}, GRIP);
  /* ✅ v0.4.26 ТЕСТ РАЗМЕРА: железный топор почти как КАЛАШ.
     Калаш в руках = 0.85 м (см. _attachRifle). Было 0.58 — «мелкий, руки
     торчат». Ставим 0.78 — почти как калаш, рукоять по-прежнему в кисти
     (fitToolLikeAxe держит нижний конец рукояти в ладони, растёт голова).
     Если надо тоньше — крути число, больше 0.85 не поднимать (перекроет экран). */
  var IRON_AXE_TARGET_LEN = 0.78;  // длина железного топора в руке, м (ТЕСТ v0.4.26)
  var IRON_AXE_YAW = 180;          // ✅ v0.3.6: топор смотрит ВПЕРЁД (был развёрнут на игрока)
                                   // лезвие железного топора смотрит ВПЕРЁД-ВПРАВО
                                   // ТОЧНО КАК У КАМЕННОГО ТОПОРА (широкая грань
                                   // видна игроку, кромка по направлению удара);
                                   // в v0.2.9 было 90 — лезвие стояло «ребром» влево

  /* ✅ v0.4.40 БУЛАВА (модель пользователя rusted_mace_-_fantasy_weapon.glb
     → assets/models/mace.glb): тяжёлое оружие ближнего боя. ДЕРЖИТСЯ КАК
     ТОПОР (одна правая рука, хват placeLikeAxe), но БЬЁТ ДОЛГО: свой клип
     maceAtk — замах ~1.1 с (рука уходит ВВЕРХ-НАЗАД, нависает) и жёсткий
     рубящий удар вниз; урон приходит на 1.2 с (MACE_WINDUP_MS в gameworld.js),
     зато ОГРОМНЫЙ (в голову 97 — почти всегда насмерть). Модель больше
     топора: 0.95 м. Настраивается вживую из консоли (F12):
       BrixFirstPerson.MACE.len = 1.0;  BrixFirstPerson.MACE.yaw = 0; */
  var MACE_URL = 'assets/models/mace.glb';
  var GRIP_MACE = Object.assign({}, GRIP);
  var MACE_TARGET_LEN = 0.86;  // длина булавы в руке, м (тяжелее топора 0.78, но кисть видна)
  var MACE_YAW = 90;           // доворот головы булавы вокруг рукояти (град)
  var MACE = { len: MACE_TARGET_LEN, yaw: MACE_YAW };   // «вживая» настройка

  /* ✅ v0.4.41 С4 (модель пользователя C4.glb → assets/models/c4.glb):
     взрывчатка ДЕРЖИТСЯ ПО-ДРУГОМУ, чем всё остальное: блок ПО ЦЕНТРУ
     экрана перед грудью, ОБЕ руки держат его ЗА БОКИ (кисти вертикальны,
     пальцы обхватывают боковые грани — как в Rust). Бросок ЛКМ — обычный
     быстрый бросок вперёд (клип c4Throw), блок улетает с физикой.
     Модель нормализуется к единичному боксу → размер задаёт C4.len.
     Настраивается вживую из консоли (F12):
       BrixFirstPerson.C4.len = 0.4;  BrixFirstPerson.C4.oy = -0.05;
       BrixFirstPerson.C4.yaw = 180;  // если блок вдруг спиной к игроку */
  var C4_URL = 'assets/models/c4.glb';
  var C4 = {
    len: 0.30,       // ширина блока в руках, м (мир)
    ox: 0, oy: 0.02, oz: 0,   // тонкий сдвиг блока между кистями (в метрах)
    pitch: -22,      // наклон блока: чуть наклонён ВНИЗ от игрока — видно
                     // камуфляжную грань и таймер сверху
    yaw: 180,        // поворот вокруг вертикали (камуфляж/лента к игроку)
    roll: 0          // крен (град)
  };
  // ЛЕВАЯ кисть относительно ПРАВОЙ (как у револьвера lr/lu/lf, но блок
  // ШИРОКИЙ — кисти по разным сторонам блока): lr в длинах кисти
  var C4 = window.BrixFirstPersonC4Fix || C4;   // хук для «вживой» правки
  var C4G = {
    lr: -2.05,       // левая кисть от правой: вбок (− = влево) — через весь блок
    lu: 0.02,        //   чуть выше запястья правой
    lf: 0.06,        //   та же глубина
    lwrap: 0.85,     // пальцы сильно внутрь — обхватывают боковую грань
    lcurl: 0.85,     // сжатие пальцев
    lthumb: 0.40     // большой палец
  };
  var PLAYER_URL = 'assets/models/player_claude.glb';
  var AXE_URL = 'assets/models/stone_axe.glb';        // ✅ каменный топор — модель из v0.2.3
  var SPICK_URL = 'assets/models/stone_pickaxe.glb';  // каменная кирка
  var PICKAXE_URL = 'assets/models/pickaxe.glb';      // железная кирка (модель пользователя)
  var IRON_AXE_URL = 'assets/models/iron_axe.glb';    // ✅ v0.2.9 железный топор (simple_axe.glb)
  /* ✅ v0.4.6 РЕВОЛЬВЕР — ПЕРЕДЕЛАН.
     - ориентация модели определяется АВТОМАТИЧЕСКИ (fitGun): находит ствол и
       рукоять, ствол всегда смотрит ВПЕРЁД, рукоять — в правой ладони
     - правая рука держит рукоять сбоку, левая подхватывает её с ЛЕВОЙ стороны
       (раньше лежала сверху на правой)
     - револьвер крупнее, а кисти сдвинуты назад/вниз — ствол не закрыт руками
     Всё настраивается «вживую» из консоли браузера (F12), например:
       BrixFirstPerson.REV.len = 0.34;  BrixFirstPerson.REV.pitch = -6;
       BrixFirstPerson.REV.yaw = 180;   // если ствол вдруг смотрит назад
     (значения применяются сразу, без перезагрузки) */
  var REVOLVER_URL = 'assets/models/revolver.glb';
  var REV = {
    len: 0.30,       // длина револьвера в руках, м (мир)
    palm: 0.62,      // где в ладони рукоять: доля длины кисти от запястья
    palmN: 0.03,     // сдвиг рукояти от ладони (глубина хвата)
    ox: 0, oy: 0, oz: 0,   // тонкий сдвиг модели (в долях длины револьвера)
    pitch: -3,       // ствол вверх(+)/вниз(−), град (в прицеливании → 0)
    yaw: 0,          // ствол влево(+)/вправо(−), град
    roll: 0,         // крен вокруг ствола, град
    flip: false,     // true — если авто-поиск перепутал ствол и рукоять
    upDown: false,   // true — если револьвер вверх ногами
    left: true,      // левая рука держит рукоять
    lr: -0.65,       // левая кисть относительно правой: вбок (− = влево), в длинах кисти
    lu: -0.05,       //   вверх(+)/вниз(−)
    lf: 0.10,        //   вперёд(+)/назад(−)
    lwrap: 0.30,     // наклон пальцев левой руки внутрь (охват рукояти)
    lcurl: 0.80,     // сжатие пальцев левой руки
    lthumb: 0.25     // большой палец левой руки
  };
  // базовая позиция правой руки (в долях длины руки от плеча):
  // rx — вбок (+ вправо), ry — вверх/вниз, rz — вперёд
  var RV = { rx: 0.12, ry: 0.02, rz: 0.62 };

  /* ✅ v0.4.19 ДРОБОВИК — та же система, что у револьвера: fitGun сам
     находит ствол и рукоять (ствол → вперёд, рукоять → в ладонь),
     размер задаёт SGN.len. Модель из репозитория oxide5554-create/-glm
     (shotgun.fbx → shotgun.glb с текстурами).
     Настраивается вживую из консоли (F12), например:
       BrixFirstPerson.SGN.len = 0.56;  BrixFirstPerson.SGN.pitch = -5;
       BrixFirstPerson.SGN.flip = true;  // если ствол вдруг смотрит назад */
  var SHOTGUN_URL = 'assets/models/shotgun.glb';
  var SGN = {
    len: 0.62,       // длина дробовика в руках, м (в -glm модель шла 0.85)
    palm: 0.62,      // где в ладони рукоять: доля длины кисти от запястья
    palmN: 0.03,     // сдвиг рукояти от ладони (глубина хвата)
    ox: 0, oy: 0, oz: 0,   // тонкий сдвиг модели (в долях длины дробовика)
    pitch: -3,       // ствол вверх(+)/вниз(−), град (в прицеливании → 0)
    yaw: 0,          // ствол влево(+)/вправо(−), град
    roll: 0,         // крен вокруг ствола, град
    flip: false,     // true — если авто-поиск перепутал ствол и рукоять
    upDown: false,   // true — если дробовик вверх ногами
    // ✅ v0.4.20: левая рука У ДРОБОВИКА УБРАНА (просьба игрока) — дробовик
    // держит ТОЛЬКО правая рука, левая схлопывается и не рисуется.
    // Хочешь вернуть поддержку цевья — поставь true из консоли:
    //   BrixFirstPerson.SGN.left = true;
    left: false,     // левая рука на цевье (ВЫКЛ — только правая держит)
    lr: -0.12,       // левая кисть относительно правой: вбок (− = влево), в длинах кисти
    lu: 0.5,         //   вверх(+)/вниз(−) — на уровне цевья (ствол чуть выше рукояти)
    lf: 2.0,         //   вперёд(+)/назад(−) — на цевье, ~0.25 м от рукояти
    lwrap: 0.55,     // наклон пальцев левой руки внутрь (охват цевья)
    lcurl: 0.85,     // сжатие пальцев левой руки
    lthumb: 0.30     // большой палец левой руки
  };

  /* ✅ v0.4.21 КАЛАШ (АК) — порт 1-в-1 из референс-репозитория
     oxide5554-create/-glm (scr/3d/firstPersonPlayer.js, модель scr/3d/ak47.glb).
     Хват «как в репозитории»: правая рука на пистолетной рукояти (GRIP_AK),
     левая ПРИВЯЗАНА К САМОЙ МОДЕЛИ цевья (GRIP_AK_LEFT + rifleLeftTarget —
     не уезжает при беге/отдаче), ПКМ — прицел по линии целик→мушка (ADS_AK),
     при беге автомат прижимается К ГРУДИ по диагонали (F_RUN_AK — приклад
     у правого плеча, дуло вверх-влево), отдача — пружиной с зигзагом.
     Настраивается вживую из консоли (F12): BrixFirstPerson.AK.sS = 0.9 … */
  var RIFLE_URL = 'assets/models/ak47.glb';
  // хват ПРАВОЙ руки (числа из репозитория)
  var GRIP_AK = {
    sS: 0.840,     // размер АК в руке
    sX: 0.890,     // вдоль пальцев правой
    sP: 0.054,     // от ладони
    sR: 0.0        // поворот по Y в кисти (град)
  };
  // ✅ ЛЕВАЯ РУКА НА ЦЕВЬЕ (C-grip): ладонь снизу, большой палец слева вдоль
  // цевья, четыре пальца обхватывают справа. Координаты — в единицах ak47.glb
  var GRIP_AK_LEFT = {
    yPref: -1.85,    // где держим цевьё (ближе к дулу)
    yRear: -1.30,    // самая задняя точка (перед магазином), если рука не достаёт
    zCenter: 0.40,   // высота оси цевья
    fingerAng: 50,   // угол пальцев от ствола вправо: 0 = вдоль ствола, 90 = поперёк
    palmTilt: 0.30,  // наклон ладони вправо (к цевью)
    palmThick: 0.20, // зазор ладонь↔цевьё (доли длины ладони)
    palmFrac: 0.50,  // центр ладони от запястья (доля длины ладони)
    curl: 0.55,      // сжатие пальцев
    thumb: 0.25,     // большой палец
    twistShare: 0.5  // часть скручивания уходит предплечью (запястье не выкручивается)
  };
  // ✅ ПРИЦЕЛ (ПКМ): линия целик → мушка ставится на ось камеры
  var ADS_AK = {
    rear:  { y: -1.80, z: 1.10 },  // целик (координаты модели ak47.glb)
    front: { y: -4.40, z: 1.12 },  // мушка
    dist:  0.85,     // глаз далеко от калаша (не внутри модели)
    fov:   55,       // FOV камеры рук при прицеливании
    speed: 11        // скорость входа/выхода из прицела
  };
  var AK_HALFH = 0.40;       // полувысота цевья (ед. модели)
  var AK_HALFW = 0.19;       // полуширина цевья
  var AK_RELOAD_DUR = 3.4;   // перезарядка калаша = длительность звука (wav 3.33 c)

  /* ✅ v0.4.35 ТОМПСОН (пистолет-пулемёт, модель пользователя
     thompson_submachine_gun-_luis_novoa.glb) — ДЕРЖИТСЯ КАК КАЛАШ:
     тот же механизм хвата/прицела/отдачи, только своя модель и
     свои константы (они считаны по геометрии модели: ствол вдоль
     +X, дуло на x≈+223, приклад x≈−222, рукоять ≈ (−60, 74, 107.5),
     целик (−88, 157), мушка (215, 156), цевьё x 82..144).
     Модель нормализуется в прото-пространство КАЛАША: ствол вдоль
     +Z, рукоять в (0,0,0), вверх +Y — поэтому вся машина поз
     (placeRifle / rifleLeftTarget / ADS) работает без изменений */
  var TP_URL = 'assets/models/thompson.glb';
  var TP_LEN = 0.78;         // длина в руке (м) — томпсон чуть короче калаша
  /* ✅ v0.4.39 ТОЧКА РУКОЯТИ — по ВЕРШИНАМ модели (inspect_glb_points.js):
     пистолетная рукоять = бокс x −99..−45, y 76.7..110, z 97.8..114.5
     (центр ≈ (−72, 93, 106.2)). Было (−60, 74, 107.5): y на 18 ед. НИЖЕ
     низа рукояти, x — у ПЕРЕДНЕГО края — ладонь висела под рукоятью,
     и весь томик смотрелся «оружие в воздухе». Теперь ладонь точно на
     рукояти: правая держит, как у калаша */
  var TP_GRIP_PT = { x: -72, y: 92, z: 106.2 };
  // хват ПРАВОЙ руки — как у калаша (модель приведена к той же конвенции)
  var GRIP_TP = {
    sS: 0.88,     // размер в руке
    sX: 0.89,     // вдоль пальцев правой
    sP: 0.054,    // от ладони
    sR: 0.0       // поворот по Y в кисти (град)
  };
  /* ✅ v0.4.39 ЛЕВАЯ РУКА — на ВЕРТИКАЛЬНОЙ ПЕРЕДНЕЙ РУКОЯТКЕ (M1928!),
     а не под деревянным цевьём как у АК. По вершинам модели: вертикальная
     рукоятка = стойка raw x 40.6..55.5 (центр 48), z 98.7..114 (центр
     106.35), y 26.6..148. Прото-пространство при хвате (−72, 92, 106.2):
     x' = −z_raw + 106.2 (ось стойки ≈ 0 — на оси ствола), y' = y_raw − 92,
     z' = x_raw + 72 → стойка = прото-z 112.6..127.5, ось y' ≈ −4.
     Хват «как палку»: ладонь СБОКУ (нормаль почти вдоль gun-right,
     palmTilt 6 из 90), пальцы вперёд-вправо обхватывают стойку.
     Раньше (v0.4.38) рука тянулась к ДЕРЕВЯННОМУ цевью raw x 82..118
     (прото-z 142..178 — на 5 см дальше) и под ним СНИЗУ (как у АК) —
     не доставала (shortfall), висела раскрытой ладонью в воздухе */
  var GRIP_TP_LEFT = {
    yPref: -127,    // передний край стойки (raw x 55.5 → прото-z 127.5)
    yRear: -113,    // задний край стойки (raw x 40.6 → прото-z 112.6)
    zCenter: -4,    // высота ладони на стойке (raw y 88 − рукоять 92)
    fingerAng: 60,  // угол пальцев от ствола (обхват стойки)
    palmTilt: 6,    // ладонь СБОКУ стойки (нормаль к оси ствола)
    palmThick: 0.12,
    palmFrac: 0.50,
    curl: 0.62,
    thumb: 0.35,
    twistShare: 0.5
  };
  // ✅ ПРИЦЕЛ (ПКМ): целик/мушка в единицах модели (как ADS_AK:
  // {y: −дистанция вдоль ствола, z: высота} → ptAk → прото-пространство).
  // ✅ v0.4.39: пересчитано под новый хват (−72, 92, 106.2):
  // целик raw (−88, 157) → прото (y 65, z −16) → {y: 16, z: 65};
  // мушка raw (215, 156) → прото (y 64, z 287) → {y: −287, z: 64}
  var ADS_TP = {
    rear:  { y: 16, z: 65 },     // целик (чуть позади рукояти — как у M1928)
    front: { y: -287, z: 64 },   // мушка (у дульного среза)
    /* ✅ v0.4.39: dist 0.64 (у калаша 0.85). У M1928 целик стоит ПОЗАДИ
       рукояти (прото-z −16, у АК +1.80), поэтому при тех же 0.85 кисть
       не дотягивалась (shortfall 0.18 м, целик на 8.8° ниже оси камеры —
       у калаша всего 1.6°). 0.64 держит цель руки в доступности плеча:
       прицел встаёт по оси, как у калаша */
    dist:  0.64,
    fov:   55,
    speed: 11
  };
  /* ✅ v0.4.39 сечение ВЕРТИКАЛЬНОЙ рукоятки (для halfExt в цели левой
     руки): raw x 40.6..55.5 и z 98.7..114 → полуширины 7.5 и 7.7 ед. */
  var TP_HALFH = 7.5;        // полразмера стойки вдоль ствола (ед. модели)
  var TP_HALFW = 7.7;        // полразмера стойки поперёк (ед. модели)
  var TP_RELOAD_DUR = 3.7;   // перезарядка томпсона = длительность звука (wav 3.73 c)

  /* ✅ v0.4.39 ХВАТ КАК У ОБЫЧНОГО РЕВОЛЬВЕРА — правая на рукояти, левая
     подхватывает рукоять снизу-сбоку (числа lr/lu/lf/lwrap/lcurl/lthumb —
     1-в-1 из REV). История: авто-поиск fitGun ставил ладонь на ТОНКИЙ
     ПРОВОЛОЧНЫЙ ПРИКЛАД (он тянется назад к срезу x 10.2 на высоте
     ствола) — настоящая рукоять оказывалась на 0.30 длины впереди
     ладони, тонкий приклад пронизывал кисть («карабин сквозь руки»).
     Исправлено двумя полями: gx сдвигает модель назад так, что рукоять
     точно в ладони, а v0.4.39 вернул длину 0.62 (игрок просил КРУПНЕЕ;
     приклад больше не мешает — он выведен из кисти полем gx).
     ✅ v0.4.39: карабин ещё и ОТОДВИНУТ ВПРАВО от хотбара (см. pose,
     сдвиг цели правой руки по оси торса) и ОЧЕНЬ ТОЧНЫЙ в прицеле
     3× (RV3X_SPREAD_MUL в gameworld.js). Настраивается вживую (F12):
       BrixFirstPerson.RVX.len = 0.7;  BrixFirstPerson.RVX.gx = 0.3;
       BrixFirstPerson.RVX.pitch = -4; */
  var RV3X_URL = 'assets/models/revolver3x.glb';
  var RVX = {
    /* ✅ v0.4.39 КАРАБИН КРУПНЕЕ (просьба игрока): 0.62 м (было 0.5 в
       v0.4.38 — тот ужал с 0.78 из-за приклада; теперь приклад и так
       выведен из кисти полем gx, можно вернуть размер) */
    len: 0.62,       // длина карабина в руках, м
    gx: 0.30,        // сдвиг хвата: рукоять на 0.30 длины впереди авто-точки fitGun
    palm: 0.62,      // где в ладони рукоять: доля длины кисти от запястья
    palmN: 0.03,     // сдвиг рукояти от ладони (глубина хвата)
    ox: 0, oy: 0, oz: 0,   // тонкий сдвиг модели (в долях длины)
    pitch: -3,       // ствол вверх(+)/вниз(−), град (в прицеливании → 0)
    yaw: 0,          // ствол влево(+)/вправо(−), град
    roll: 0,         // крен вокруг ствола, град
    flip: false,     // true — если авто-поиск перепутал ствол и рукоять
    upDown: false,   // true — если карабин вверх ногами
    left: true,      // левая рука у рукояти (как у револьвера)
    lr: -0.65,       // левая кисть относительно правой: вбок (− = влево) — как у REV
    lu: -0.05,       //   вверх(+)/вниз(−) — на уровне рукояти
    lf: 0.10,        //   вперёд(+)/назад(−) — рукоять обхватывает с передней стороны
    lwrap: 0.30,     // наклон пальцев левой руки внутрь (охват рукояти)
    lcurl: 0.80,     // сжатие пальцев левой руки
    lthumb: 0.25     // большой палец левой руки
  };

  /* ✅ v0.4.35 РЕЕСТР «ружейных» конфигов: калаш (ak) и томпсон (tp)
     живут в ОДНОЙ машине поз — firstperson выбирает конфиг по kind */
  var RIFLE_CFGS = {
    ak: { grip: GRIP_AK, left: GRIP_AK_LEFT, ads: ADS_AK,
          halfH: AK_HALFH, halfW: AK_HALFW, reloadDur: AK_RELOAD_DUR, len: 0.85 },
    tp: { grip: GRIP_TP, left: GRIP_TP_LEFT, ads: ADS_TP,
          halfH: TP_HALFH, halfW: TP_HALFW, reloadDur: TP_RELOAD_DUR, len: TP_LEN }
  };

  // ✅ зигзаг-отдача по паттерну (как в репозитории): [вбок, вверх]
  var AK_RECOIL_PATTERN = [
    [0.0, 1.0], [0.8, 0.7], [0.3, 1.0], [-0.9, 0.6],
    [-0.4, 1.0], [1.0, 0.5], [0.5, 0.9], [-0.7, 0.8]
  ];

  // ✅ Поза idle с АК — по референсу PUBG: правая на пистолетной рукояти
  // (низко, справа, у спуска), левая на цевье (привязана к модели сама)
  var FIDLE_AK = {
    hy: 0, sx: 0, sy: 0, hx: 0,
    ltx: 0, ltk: 0, rtx: 0, rtk: 0,
    rx: 0.230, ry: 0.290, rz: 0.500,   // правая кисть — на рукояти
    rphi: 0.0, ryaw: 5, roll: 90,
    curl: 0.500, thumb: 0.280,         // правая сжимает рукоять
    lx: 0.450, ly: 0.300, lz: 0.950,   // (не используется — левая от модели)
    lcurl: 0.450,
    // доп. поля «ручного» хвата (как AK_EXTRA в репозитории):
    gw: 0, gyaw: 0, gpitch: 0, groll: 0,  // явная ориентация ствола (в idle выкл)
    ppitch: 0, pyaw: 0, proll: 0,         // добавочные повороты (отдача/дрожь)
    ox: 0, oy: 0, oz: 0,                  // смещения автомата в камере (м)
    ljx: 0, ljy: 0, ljz: 0,               // дрожь левой кисти
    ads: 0                                 // прицеливание 0..1
  };

  // ✅ БЕГ с АК: автомат ПРИЖАТ К ГРУДИ по диагонали — приклад у правого
  // плеча, дуло вверх и влево (то самое «сжимается к груди при беге» из
  // репозитория, F_RUN_AK). Левая рука держит цевьё сама
  var F_RUN_AK = Object.assign({}, FIDLE_AK, {
    rx: -0.12, ry: -0.04, rz: 0.38,
    gw: 1, gyaw: -22, gpitch: 38, groll: 0,
    curl: 0.85, thumb: 0.60,
    sx: 3, sy: -4
  });

  // Камера рук (должна совпадать с renderOverlay) — ЗНАЧЕНИЯ ИЗ РЕПОЗИТОРА:
  // позиция (0, 1.7, 0), прицел (0, 1.0, 5).
  var HANDS_CAM_POS = null;    // создаются после THREE
  var HANDS_CAM_TARGET = null;
  var CAM_TARGET_Y = 1.0;

  // ✅ Авто-подгонка ИНСТРУМЕНТА под хват (порт fitPickaxeLikeAxe из репозитория).
  // Модель может иметь любой pivot/ориентацию: находим длинную ось
  // (рукоять), конец с головой (там шире), ось головы — и приводим к виду
  // топора: рукоять вдоль +Y, голова вверху, НИЖНИЙ КОНЕЦ РУКОЯТИ в (0,0,0).
  function fitToolLikeAxe(proto, targetLen) {
    proto.updateMatrixWorld(true);
    var inv = proto.matrixWorld.clone().invert();
    var P = [], v = new THREE.Vector3();
    proto.traverse(function (o) {
      if (!(o.isMesh && o.geometry && o.geometry.attributes.position)) return;
      var a = o.geometry.attributes.position;
      var m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      for (var i = 0; i < a.count; i++) {
        v.fromBufferAttribute(a, i).applyMatrix4(m);
        P.push(v.x, v.y, v.z);
      }
    });
    var n = P.length / 3;
    if (n < 4) return;
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (var i2 = 0; i2 < n; i2++) {
      for (var k = 0; k < 3; k++) {
        var c = P[i2 * 3 + k];
        if (c < mn[k]) mn[k] = c;
        if (c > mx[k]) mx[k] = c;
      }
    }
    var size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
    var L = size.indexOf(Math.max(size[0], size[1], size[2]));   // длинная ось = рукоять
    if (size[L] < 1e-6) return;
    var o1 = (L + 1) % 3, o2 = (L + 2) % 3;
    // боковой размах у двух концов рукояти (первые/последние 25%)
    var span = function (lo, hi) {
      var a = [Infinity, Infinity], b = [-Infinity, -Infinity];
      for (var j = 0; j < n; j++) {
        var f = (P[j * 3 + L] - mn[L]) / size[L];
        if (f < lo || f > hi) continue;
        var x1 = P[j * 3 + o1], x2 = P[j * 3 + o2];
        if (x1 < a[0]) a[0] = x1;
        if (x1 > b[0]) b[0] = x1;
        if (x2 < a[1]) a[1] = x2;
        if (x2 > b[1]) b[1] = x2;
      }
      return [b[0] - a[0], b[1] - a[1]];
    };
    var lowS = span(0, 0.25), highS = span(0.75, 1);
    var headHigh = Math.max(highS[0], highS[1]) >= Math.max(lowS[0], lowS[1]);
    var headS = headHigh ? highS : lowS;
    var latAxis = headS[0] >= headS[1] ? o1 : o2;                // ось головы (самая широкая)
    var ex = new THREE.Vector3().setComponent(latAxis, 1);
    var ey = new THREE.Vector3().setComponent(L, headHigh ? 1 : -1);
    var ez = new THREE.Vector3().crossVectors(ex, ey);
    proto.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, ey, ez).transpose());
    var sc = targetLen / size[L];
    proto.scale.setScalar(sc);
    // нижний конец рукояти (центр сечения) → в начало координат
    var endV = headHigh ? mn[L] : mx[L];
    var end = new THREE.Vector3(), cnt = 0, s1 = 0, s2 = 0;
    for (var j2 = 0; j2 < n; j2++) {
      var f2 = (P[j2 * 3 + L] - mn[L]) / size[L];
      if ((headHigh && f2 <= 0.08) || (!headHigh && f2 >= 0.92)) {
        s1 += P[j2 * 3 + o1]; s2 += P[j2 * 3 + o2]; cnt++;
      }
    }
    end.setComponent(L, endV);
    end.setComponent(o1, cnt ? s1 / cnt : 0);
    end.setComponent(o2, cnt ? s2 / cnt : 0);
    proto.position.copy(end.multiplyScalar(sc).applyQuaternion(proto.quaternion).negate());
    proto.updateMatrixWorld(true);
    console.log('[BrixFirstPerson] инструмент: длинная ось=' + 'xyz'[L] +
      ', голова на ' + (headHigh ? '+' : '-') + ', ось головы=' + 'xyz'[latAxis]);
  }

  // ✅ v0.4.6 АВТО-ПОДГОНКА РЕВОЛЬВЕРА (как fitToolLikeAxe, но для пистолета).
  // Ищет длинную ось (ствол), конец с высокой рукоятью, определяет «вверх»,
  // затем поворачивает модель так: СТВОЛ → +X (вперёд), ВЕРХ → +Y,
  // масштаб — длина по стволу = 1, центр рукояти (нижняя часть) → (0,0,0)
  function collectPoints(proto) {
    proto.updateMatrixWorld(true);
    var inv = proto.matrixWorld.clone().invert();
    var P = [], v = new THREE.Vector3();
    proto.traverse(function (o) {
      if (!(o.isMesh && o.geometry && o.geometry.attributes.position)) return;
      var a = o.geometry.attributes.position;
      var m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      for (var i = 0; i < a.count; i++) {
        v.fromBufferAttribute(a, i).applyMatrix4(m);
        P.push(v.x, v.y, v.z);
      }
    });
    return P;
  }

  function fitGun(proto, flip, upDown) {
    var P = collectPoints(proto), n = P.length / 3;
    if (n < 4) return false;
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < n; i++) {
      for (var k = 0; k < 3; k++) {
        var c = P[i * 3 + k];
        if (c < mn[k]) mn[k] = c;
        if (c > mx[k]) mx[k] = c;
      }
    }
    var size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
    var ord = [0, 1, 2].sort(function (a, b) { return size[b] - size[a]; });
    var L = ord[0], H = ord[1];          // L — вдоль ствола, H — высота
    if (size[L] < 1e-6 || size[H] < 1e-6) return false;

    // статистика по высоте на двух концах длинной оси
    var endStat = function (lo, hi) {
      var hmin = Infinity, hmax = -Infinity, hs = 0, cnt = 0;
      for (var j = 0; j < n; j++) {
        var f = (P[j * 3 + L] - mn[L]) / size[L];
        if (f < lo || f > hi) continue;
        var h = P[j * 3 + H];
        if (h < hmin) hmin = h;
        if (h > hmax) hmax = h;
        hs += h; cnt++;
      }
      return { ext: cnt ? hmax - hmin : 0, mean: cnt ? hs / cnt : 0 };
    };
    var lowEnd = endStat(0, 0.28), highEnd = endStat(0.72, 1);
    // рукоять — тот конец, где модель «свисает» вниз сильнее (выше по высоте)
    var gripLow0 = lowEnd.ext >= highEnd.ext;
    var g0 = gripLow0 ? lowEnd : highEnd, m0 = gripLow0 ? highEnd : lowEnd;
    var sH = g0.mean < m0.mean ? 1 : -1;          // знак «вверх» по оси H
    if (upDown) sH = -sH;
    var gripLow = flip ? !gripLow0 : gripLow0;
    var sL = gripLow ? 1 : -1;                    // от рукояти к стволу

    // центр хвата: нижняя половина рукояти
    var gLo = gripLow ? 0 : 0.72, gHi = gripLow ? 0.28 : 1;
    var G = new THREE.Vector3(), gc = 0;
    for (var j2 = 0; j2 < n; j2++) {
      var f2 = (P[j2 * 3 + L] - mn[L]) / size[L];
      if (f2 < gLo || f2 > gHi) continue;
      var hh = P[j2 * 3 + H];
      var u = sH > 0 ? (hh - mn[H]) / size[H] : (mx[H] - hh) / size[H];
      if (u > 0.5) continue;
      G.x += P[j2 * 3]; G.y += P[j2 * 3 + 1]; G.z += P[j2 * 3 + 2]; gc++;
    }
    if (gc) G.multiplyScalar(1 / gc);
    else G.set((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2);

    var ex = new THREE.Vector3().setComponent(L, sL);
    var ey = new THREE.Vector3().setComponent(H, sH);
    var ez = new THREE.Vector3().crossVectors(ex, ey);
    proto.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, ey, ez).transpose());
    var sc = 1 / size[L];
    proto.scale.setScalar(sc);
    proto.position.copy(G.multiplyScalar(sc).applyQuaternion(proto.quaternion).negate());
    proto.updateMatrixWorld(true);
    console.log('[BrixFirstPerson] револьвер: ось ствола=' + 'xyz'[L] + (sL > 0 ? '+' : '-') +
      ', верх=' + 'xyz'[H] + (sH > 0 ? '+' : '-') + (flip ? ' (flip)' : '') + (upDown ? ' (upDown)' : ''));
    return true;
  }

  // Базовая поза (общая)
  var IDLE = {
    hy: 0, sx: 2, sy: 0, hx: 0,
    ltx: 4, ltk: 6, rtx: -3, rtk: 8,
    rx: 0.22, ry: -0.62, rz: 0.5, rphi: 28, ryaw: 6, roll: 90, curl: 0.9, thumb: 0.8,
    lx: -0.25, ly: -0.85, lz: 0.12, lcurl: 0.35
  };

  // Поза idle с ТОПОРОМ
  var FIDLE_AXE = Object.assign({}, IDLE, {
    sx: 0, hx: 0,
    rx: 0.12, ry: 0.08, rz: 0.8, rphi: 35, ryaw: 8, roll: 90, curl: 0.9,
    lx: -0.1, ly: -0.05, lz: 0.72, lcurl: 0.3
  });

  // ✅ v0.4.40 поза idle с БУЛАВОЙ: оружие тяжёлое и ДЛИННОЕ (0.95 м) —
  // держим ЧУТЬ БЛИЖЕ К ЦЕНТРУ и с меньшим наклоном (rz↓), чтобы рукоять
  // и кисть не уходили за нижнюю кромку экрана, как с топором
  var FIDLE_MACE = Object.assign({}, FIDLE_AXE, {
    rx: 0.16, ry: 0.10, rz: 0.66, rphi: 30
  });

  // ✅ v0.4.41 поза idle с С4: обе руки ПО ЦЕНТРУ, симметрично (rx ↔ lx),
  // ладони вертикальны (как у револьвера rphi 0 / roll 90) — блок между
  // ними. rz 0.62 (не ближе — иначе кисти уходят НИЖЕ кадра камеры рук),
  // ry 0.24 — блок по центру экрана. ВАЖНО: объявляется
  // ПОСЛЕ IDLE (Object.assign выполняется при загрузке модуля — раньше
  // стояло выше IDLE и теряло базовые поля: p.ltx был undefined → NaN
  // во всех костях → руки исчезали)
  var FIDLE_C4 = Object.assign({}, IDLE, {
    sx: 0, hx: 0,
    rx: 0.22, ry: 0.28, rz: 0.74, rphi: 0, ryaw: 0, roll: 90,
    curl: 0.85, thumb: 0.45,
    lx: -0.22, ly: 0.28, lz: 0.74, lcurl: 0.85
  });

  // ✅ Поза idle с ЖЕЛЕЗНОЙ КИРКОЙ (две руки на рукояти; левая ставится сама).
  // ✅ v0.2.8: кирка держится БЛИЖЕ к груди и ПО ЦЕНТРУ (rx↓, rz↓) — раньше
  // она висела в 0.5 м впереди справа, и левая рука (размах 0.55 м)
  // НЕ ДОТЯГИВАЛАСЬ до рукояти на 13 см — хват был кривой.
  // ОСИ: rx — вбок (Rt), ry — вверх/вниз (Ut), rz — вперёд (Ft)
  var FIDLE_PICK = Object.assign({}, FIDLE_AXE, {
    rx: 0.02, ry: 0.02, rz: 0.52,   // кирка перед грудью: не у самого лица,
                                    // но в досягаемости левой руки
    curl: 0.95                       // наклон как у топора (rphi 35, ryaw 8)
  });

  // ✅ v0.4.6 поза idle с РЕВОЛЬВЕРом: правая рука сбоку-спереди и НИЖЕ линии
  // взгляда (не закрывает центр экрана), ладонь вертикальна. Левая рука для
  // револьвера ставится от правой (см. pose) — lx/ly/lz здесь не используются
  var FIDLE_REV = Object.assign({}, IDLE, {
    sx: 0, hx: 0,
    rx: RV.rx, ry: RV.ry, rz: RV.rz, rphi: 0, ryaw: 0, roll: 90, curl: 0.95, thumb: 0.95,
    lx: 0, ly: 0, lz: 0, lcurl: 0.6
  });

  // ✅ v0.4.6 поза ПРИЦЕЛИВАНИЯ: рука выше и ближе к центру, ствол ровно вперёд
  // (камера рук при этом чуть поднимается — см. renderOverlay)
  var FPOSE_AIM = Object.assign({}, FIDLE_REV, {
    rx: -0.08, ry: RV.ry + 0.26, rz: RV.rz + 0.04, rphi: 0, ryaw: 0, curl: 1, thumb: 1,
    lcurl: 0.7
  });

  // ✅ v0.4.22 БЕГ с револьвером/дробовиком: оружие ПРИЖИМАЕТСЯ К ГРУДИ —
  // рука поднимается выше и ближе к телу (rz меньше — локоть согнут);
  // ствол вверх-влево по диагонали делает placeRevolver/placeShotgun
  // (плавный поворот по _runW) — та же идея, что F_RUN_AK у калаша
  var F_RUN_GUN = Object.assign({}, FIDLE_REV, {
    rx: -0.02, ry: 0.16, rz: 0.44, rphi: 0, ryaw: 0, curl: 1, thumb: 1,
    lcurl: 0.7
  });

  function lerpP(a, b, t) {
    var o = {};
    for (var k in a) o[k] = (typeof a[k] === 'number' && typeof b[k] === 'number') ? a[k] + (b[k] - a[k]) * t : a[k];
    return o;
  }

  var mk = function (base) {
    return function (t, p, e) { return { t: t, p: Object.assign({}, base, p), e: e }; };
  };
  var k1Axe = mk(FIDLE_AXE);
  var k1Mace = mk(FIDLE_MACE);   // ✅ v0.4.40: кейфреймы булавы
  var k1Pick = mk(FIDLE_PICK);
  var k1Rev = mk(FIDLE_REV);   // ✅ v0.4.5: кейфреймы револьвера
  var k1Sg = mk(FIDLE_REV);    // ✅ v0.4.19: кейфреймы дробовика (стойка та же)
  var k1C4 = mk(FIDLE_C4);     // ✅ v0.4.41: кейфреймы С4 (обе руки симметрично)

  var CL = {
    atk1: {
      dur: 1.2,
      keys: [
        k1Axe(0,    {}),
        k1Axe(0.10, { rx: 0.30, rphi: 10, curl: 1 }),
        k1Axe(0.35, { rx: 0.55, rphi: -10, curl: 1 }),
        k1Axe(0.38, { rx: 0.55, rphi: -10, curl: 1 }),
        k1Axe(0.55, { rx: -0.30, rphi: 80, curl: 1 }, 'in'),
        k1Axe(0.62, { rx: -0.25, rphi: 75, curl: 1 }),
        k1Axe(1.20, {})
      ]
    },
    atk2: {
      dur: 1.2,
      keys: [
        k1Axe(0,    {}),
        k1Axe(0.08, { rx: 0.10, ry: 0.15, rphi: 15, curl: 1 }),
        k1Axe(0.20, { rx: 0.35, ry: 0.40, rphi: -5, curl: 1 }),
        k1Axe(0.35, { rx: 0.50, ry: 0.55, rphi: -20, curl: 1 }),
        k1Axe(0.38, { rx: 0.50, ry: 0.55, rphi: -20, curl: 1 }),
        k1Axe(0.50, { rx: -0.10, ry: 0.10, lz: 0.85, rphi: 60, curl: 1 }, 'in'),
        k1Axe(0.56, { rx: -0.35, ry: -0.35, lz: 1.00, rphi: 85, curl: 1 }, 'in'),
        k1Axe(0.62, { rx: -0.30, ry: -0.30, lz: 0.95, rphi: 80, curl: 1 }),
        k1Axe(0.75, { rx: -0.15, ry: -0.15, lz: 0.85, rphi: 70, curl: 1 }),
        k1Axe(1.20, {})
      ]
    },
    // ✅ atkP — ОДИН удар киркой ПО ПРЯМОЙ: замах строго вверх (ry +),
    // удар строго вниз (ry −), без бокового заноса (rx ≈ 0).
    // Левая рука следует за рукоятью сама (IK каждый кадр).
    atkP: {
      dur: 0.9,
      keys: [
        k1Pick(0,    {}),
        k1Pick(0.16, { rx: -0.02, ry: 0.42, rz: 0.72, rphi: 8,  curl: 1, sx: 0 }),
        k1Pick(0.32, { rx: -0.02, ry: 0.55, rz: 0.75, rphi: -8, curl: 1, sx: 0 }),
        k1Pick(0.42, { rx: -0.04, ry: -0.10, rz: 0.62, rphi: 95,  curl: 1, sx: 0 }, 'in'),
        k1Pick(0.52, { rx: -0.04, ry: -0.16, rz: 0.58, rphi: 100, curl: 1, sx: 0 }),
        k1Pick(0.90, {})
      ]
    },
    // ✅ v0.4.40 БУЛАВА — ДОЛГИЙ ЗАМАХ (суть оружия): рука медленно уходит
    // ВВЕРХ-НАЗАД (~1.1 с — нависает над целью), секунда «висит» в вершине,
    // потом ЖЁСТКИЙ рубящий удар ВНИЗ (rphi 88 — кисть бьёт). Урон в игре
    // приходит на 1.2 с (MACE_WINDUP_MS в gameworld.js) — точно на удар.
    // Длительность всего клипа 1.7 с + кулдаун 1.85 с в gameworld.js.
    maceAtk: {
      dur: 1.7,
      keys: [
        k1Mace(0,    {}),
        k1Mace(0.35, { ry: 0.30, rz: 0.60, rx: 0.10, rphi: 10, curl: 1 }),
        k1Mace(0.90, { ry: 0.62, rz: 0.48, rx: -0.06, rphi: -16, curl: 1 }),   // подъём замаха (плавный)
        k1Mace(1.05, { ry: 0.62, rz: 0.48, rx: -0.06, rphi: -16, curl: 1 }),   // вершина — «висим»
        k1Mace(1.15, { ry: -0.34, rz: 0.84, rx: 0.20, rphi: 92, curl: 1 }, 'in'),  // рубящий удар
        k1Mace(1.26, { ry: -0.38, rz: 0.88, rx: 0.22, rphi: 98, curl: 1 }),   // контакт
        k1Mace(1.70, {})
      ]
    },
    /* ✅ v0.4.6 ОТДАЧА ВЫСТРЕЛА (0.35 с ≈ кулдаун 0.3 с): рука подаётся
       чуть ВВЕРХ-НАЗАД, кисть откидывается стволом вверх (rphi−), затем
       плавно возвращается. Обе руки двигаются вместе (левая от правой) */
    shoot: {
      dur: 0.35,
      keys: [
        k1Rev(0,    {}),
        k1Rev(0.09, { ry: RV.ry + 0.03, rz: RV.rz - 0.10, rphi: -12, sx: -1.4 }),
        k1Rev(0.17, { ry: RV.ry + 0.02, rz: RV.rz - 0.08, rphi: -8, sx: -1 }),
        k1Rev(0.35, {})
      ]
    },
    /* ✅ v0.4.6 ПЕРЕЗАРЯДКА (2.2 с = RELOAD_DUR в gameworld.js): револьвер
       опускается ВНИЗ (стволом вниз), держится внизу, в конце поднимается */
    reload: {
      dur: 2.2,
      keys: [
        k1Rev(0,    {}),
        k1Rev(0.42, { ry: RV.ry - 0.50, rz: RV.rz - 0.20, rx: RV.rx + 0.08, rphi: 26, curl: 1, sx: 5 }, 'in'),
        k1Rev(0.62, { ry: RV.ry - 0.56, rz: RV.rz - 0.24, rx: RV.rx + 0.10, rphi: 30, curl: 1, sx: 6 }),
        k1Rev(1.70, { ry: RV.ry - 0.56, rz: RV.rz - 0.24, rx: RV.rx + 0.10, rphi: 30, curl: 1, sx: 6 }),
        k1Rev(1.95, { ry: RV.ry - 0.15, rz: RV.rz - 0.10, rx: RV.rx + 0.02, rphi: 12, curl: 0.97, sx: 3 }),
        k1Rev(2.2,  {})
      ]
    },
    /* ✅ v0.4.19 ОТДАЧА ДРОБОВИКА (0.5 с ≈ кулдаун 0.9 с): сильный толчок
       ВВЕРХ-НАЗАД — дробовик бьёт в плечо заметно жёстче револьвера */
    shootSg: {
      dur: 0.5,
      keys: [
        k1Sg(0,    {}),
        k1Sg(0.08, { ry: RV.ry + 0.05, rz: RV.rz - 0.16, rx: RV.rx - 0.04, rphi: -20, sx: -1.8 }),
        k1Sg(0.18, { ry: RV.ry + 0.03, rz: RV.rz - 0.12, rx: RV.rx - 0.02, rphi: -12, sx: -1.2 }),
        k1Sg(0.50, {})
      ]
    },
    /* ✅ v0.4.19 ПЕРЕЗАРЯДКА ДРОБОВИКА (2.6 с = SG_RELOAD_DUR):
       опускает ствол вниз-вбок — два патрона в помпу */
    reloadSg: {
      dur: 2.6,
      keys: [
        k1Sg(0,    {}),
        k1Sg(0.45, { ry: RV.ry - 0.48, rz: RV.rz - 0.18, rx: RV.rx + 0.10, rphi: 30, curl: 1, sx: 5 }, 'in'),
        k1Sg(0.70, { ry: RV.ry - 0.54, rz: RV.rz - 0.22, rx: RV.rx + 0.12, rphi: 34, curl: 1, sx: 6 }),
        k1Sg(1.85, { ry: RV.ry - 0.54, rz: RV.rz - 0.22, rx: RV.rx + 0.12, rphi: 34, curl: 1, sx: 6 }),
        k1Sg(2.10, { ry: RV.ry - 0.14, rz: RV.rz - 0.10, rx: RV.rx + 0.02, rphi: 12, curl: 0.97, sx: 3 }),
        k1Sg(2.6,  {})
      ]
    },
    /* ✅ v0.4.41 БРОСОК С4 — обычный БЫСТРЫЙ бросок вперёд (0.5 с): лёгкий
       замах на себя (руки к груди) и толчок вперёд-вверх. Блок выпускается
       В МОМЕНТ ЛКМ (гамеворлд) — руки в клипе уже пустые, бросают жестом */
    c4Throw: {
      dur: 0.5,
      keys: [
        k1C4(0,    {}),
        k1C4(0.12, { rx: 0.27, ry: 0.10, rz: 0.40, curl: 1,
                     lx: -0.27, ly: 0.10, lz: 0.40, lcurl: 1 }),
        k1C4(0.30, { rx: 0.08, ry: 0.24, rz: 0.88, rphi: -8, curl: 0.5, thumb: 0.2,
                     lx: -0.08, ly: 0.24, lz: 0.88, lcurl: 0.5 }, 'in'),
        k1C4(0.50, {})
      ]
    }
  };

  function sm(u) { return u * u * (3 - 2 * u); }

  function sample(keys, tn) {
    var i = 0;
    while (i < keys.length - 2 && tn >= keys[i + 1].t) i++;
    var a = keys[i], b = keys[i + 1];
    var u = Math.min(1, Math.max(0, (tn - a.t) / (b.t - a.t)));
    u = b.e === 'in' ? u * u * u : sm(u);
    var o = {};
    for (var k in a.p) o[k] = a.p[k] + (b.p[k] - a.p[k]) * u;
    return o;
  }

  /* ============================================================ */

  function FirstPersonPlayer(camera, renderer) {
    this.camera = camera;
    this.renderer = renderer || null;

    HANDS_CAM_POS = new THREE.Vector3(0, 1.7, 0);
    HANDS_CAM_TARGET = new THREE.Vector3(0, CAM_TARGET_Y, 5);

    this.handsScene = new THREE.Scene();

    // Свет на руки (как в репозитории)
    this.handsScene.add(new THREE.HemisphereLight(0xcfe0ff, 0x3a2e24, 0.8));
    var sun = new THREE.DirectionalLight(0xfff0dc, 2.3);
    sun.position.set(3, 5, 3.5);
    this.handsScene.add(sun);
    var rim = new THREE.DirectionalLight(0x7fa8ff, 1.1);
    rim.position.set(-3, 2.5, -3);
    this.handsScene.add(rim);
    var fill = new THREE.DirectionalLight(0xffc9a0, 0.5);
    fill.position.set(-3, 1, 3);
    this.handsScene.add(fill);

    this.handsCamera = new THREE.PerspectiveCamera(74, 1, 0.02, 200);

    this.model = null;
    this.axe = null;          // {holder, wrap} — каменный топор
    this.stonePick = null;    // {holder, wrap} — каменная кирка
    this.ironPick = null;     // {holder, wrap} — железная кирка
    this.ironAxe = null;      // {holder, wrap} — железный топор (v0.2.9)
    this.mace = null;         // {holder, wrap} — булава (v0.4.40, грузится отдельно)
    this.c4 = null;           // ✅ v0.4.41 {holder, wrap, proto} — С4 (грузится отдельно)
    this.revolver = null;     // {holder, wrap} — револьвер (v0.4.5)
    this.shotgun = null;      // {holder, wrap} — дробовик (v0.4.19)
    this.rev3x = null;        // {holder, wrap} — револьвер-карабин 3× (v0.4.36)
    /* ✅ v0.4.35: rifle — и КАЛАШ, и ТОМПСОН (одна машина поз, своя
       модель и конфиг по kind: 'ak' | 'tp'; models — обе прото-группы) */
    this.rifle = null;        // {holder, proto, kind, models:{ak,tp}}
    this._ads = 0;            // 0..1 прицеливание калаша
    this._runW = 0;           // 0..1 бег (автомат к груди)
    this._rec = 0; this._recV = 0;  // пружина отдачи
    this._shake = 0;          // дрожь после выстрела
    this._recSide = 0; this._recVert = 1;  // зигзаг отдачи
    this._shotCount = 0;
    this._rifleReload = false; this._rifleReloadT = 0;
    this._isRunning = false;
    this.axeHolder = null;    // ссылки для совместимости
    this.pickaxeHolder = null;
    this.handBone = null;
    this.loaded = false;
    this.visible = false;
    this._firstPerson = true;
    this._swingType = null;
    this._animTime = 0;
    this._clock = 0;
    this.currentWeapon = 'none';
    this._aiming = false;     // ✅ v0.4.5: ПКМ — прицеливание
    this._aimBlend = 0;       // 0..1 — плавное подведение к глазам

    this._load();
  }

  /* ---------- загрузка моделей игрока и топора ---------- */
  FirstPersonPlayer.prototype._load = function () {
    var self = this;
    function loadModel(url) {
      return new Promise(function (ok, no) {
        BrixGLB.load(url, function (group) { ok(group); }, no);
      });
    }
    Promise.all([
      loadModel(PLAYER_URL),
      loadModel(AXE_URL),
      loadModel(SPICK_URL),
      loadModel(PICKAXE_URL),
      loadModel(IRON_AXE_URL)
    ]).then(function (r) {
      self._init(r[0], r[1], r[2], r[3], r[4]);
      // ✅ v0.4.5: револьвер грузится ОТДЕЛЬНО (на file:// его нет во
      // встроенных моделях — руки остаются работоспособными без него)
      loadModel(REVOLVER_URL).then(function (rvg) {
        if (self._attachRevolver) self._attachRevolver(rvg);
      }).catch(function () {
        console.warn('[BrixFirstPerson] револьвер не загрузился (запускай через сервер) — руки работают, револьвер будет без модели');
      });
      // ✅ v0.4.19: дробовик тоже грузится ОТДЕЛЬНО (на file:// его нет во
      // встроенных моделях — руки остаются работоспособными без него)
      loadModel(SHOTGUN_URL).then(function (sg) {
        if (self._attachShotgun) self._attachShotgun(sg);
      }).catch(function () {
        console.warn('[BrixFirstPerson] дробовик не загрузился (запускай через сервер) — руки работают, дробовик будет без модели');
      });
      // ✅ v0.4.21: КАЛАШ тоже грузится отдельно (как револьвер/дробовик)
      loadModel(RIFLE_URL).then(function (akg) {
        if (self._attachRifle) self._attachRifle(akg);
      }).catch(function () {
        console.warn('[BrixFirstPerson] калаш не загрузился (запускай через сервер) — руки работают, калаш будет без модели');
      });
      // ✅ v0.4.35: ТОМПСОН — грузится отдельно, держится КАК КАЛАШ
      loadModel(TP_URL).then(function (tpg) {
        if (self._attachThompson) self._attachThompson(tpg);
      }).catch(function () {
        console.warn('[BrixFirstPerson] томпсон не загрузился (запускай через сервер) — руки работают, томпсон будет без модели');
      });
      // ✅ v0.4.36: РЕВОЛЬВЕР-КАРАБИН 3× — грузится отдельно (та же машина
      // fitGun, что у револьвера/дробовика)
      loadModel(RV3X_URL).then(function (r3g) {
        if (self._attachRev3x) self._attachRev3x(r3g);
      }).catch(function () {
        console.warn('[BrixFirstPerson] револьвер-карабин не загрузился (запускай через сервер) — руки работают, оружие будет без модели');
      });
      // ✅ v0.4.40: БУЛАВА — грузится отдельно (на file:// её нет во встроенных
      // моделях — руки остаются работоспособными без неё)
      loadModel(MACE_URL).then(function (mg) {
        if (self._attachMace) self._attachMace(mg);
      }).catch(function () {
        console.warn('[BrixFirstPerson] булава не загрузилась (запускай через сервер) — руки работают, булава будет без модели');
      });
      // ✅ v0.4.41: С4 — грузится отдельно (та же схема, что у булавы)
      loadModel(C4_URL).then(function (cg) {
        if (self._attachC4) self._attachC4(cg);
      }).catch(function () {
        console.warn('[BrixFirstPerson] С4 не загрузился (запускай через сервер) — руки работают, С4 будет без модели');
      });
      console.log('[BrixFirstPerson] руки готовы: топоры, кирки (v0.4.5, револьвер догружается отдельно)');
    }).catch(function (err) {
      console.error('[BrixFirstPerson] ошибка загрузки:', err);
      if (window.BrixFatal) {
        window.BrixFatal('не загрузились модели рук (' + (err && err.message ? err.message : err) + ') — в папке игры нет assets/models/player_claude.glb, stone_axe.glb, stone_pickaxe.glb, pickaxe.glb или iron_axe.glb (запускай через START-GAME.bat)');
      }
    });
  };

  /* ---------- сборка: риг, кости, кадры кистей, топор, кирка ---------- */
  FirstPersonPlayer.prototype._init = function (pg, ag, spg, pkg, iag) {
    var model = pg;
    this.model = model;
    this.handsScene.add(model);

    model.updateMatrixWorld(true);
    // модель в сантиметрах? (Hips высоко) → ×0.01
    var hipsY = null;
    var findHips = function (o) {
      if (!o || hipsY !== null) return;
      if (o.isBone && /Hips/i.test(o.name || '')) {
        var p = new THREE.Vector3();
        o.getWorldPosition(p);
        hipsY = p.y; return;
      }
      if (o.children) for (var i = 0; i < o.children.length; i++) findHips(o.children[i]);
    };
    findHips(model);
    if (hipsY !== null && hipsY > 50) {
      model.scale.multiplyScalar(0.01);
      model.updateMatrixWorld(true);
      console.log('[BrixFirstPerson] масштаб модели: ×0.01');
    }

    // меши (скелетные — SkinnedMesh)
    var meshes = [];
    var walkShadows = function (o) {
      if (!o) return;
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        o.frustumCulled = false;
        meshes.push(o);
      }
      if (o.children) for (var i = 0; i < o.children.length; i++) walkShadows(o.children[i]);
    };
    walkShadows(model);
    model.updateMatrixWorld(true);
    this.meshes = meshes;

    // кости: имя без mixamorig: и суффикса _NN
    var B = {}, rest = {};
    var walkBones = function (o) {
      if (!o) return;
      if (o.isBone) {
        var k = (o.name || '').replace(/^mixamorig:?/, '').replace(/_\d+$/, '');
        B[k] = o;
      }
      if (o.children) for (var i = 0; i < o.children.length; i++) walkBones(o.children[i]);
    };
    walkBones(model);
    this.bones = B;
    for (var k in B) {
      var b = B[k];
      rest[k] = {
        q: b.quaternion.clone(),
        s: b.scale.clone(),
        wq: b.getWorldQuaternion(new THREE.Quaternion())
      };
    }
    this.rest = rest;

    var wp = function (bone) { return bone.getWorldPosition(new THREE.Vector3()); };
    var UP = new THREE.Vector3(0, 1, 0);
    var RT = wp(B.RightShoulder).clone().sub(wp(B.LeftShoulder)).setY(0).normalize();
    var FW = new THREE.Vector3().crossVectors(UP, RT);
    var LF = RT.clone().negate();
    this.UP = UP; this.RT = RT; this.FW = FW; this.LF = LF;
    this.REST_ANKLE = wp(B.LeftFoot).y;

    // кадры кистей: вперёд (f), вверх (a), нормаль (c/n), длина ладони
    var HF = {}, AXC = {}, AXF = {}, AXN = {}, SG = {};
    var loc = function (key, v) { return v.clone().applyQuaternion(rest[key].wq.clone().invert()); };
    ['Left', 'Right'].forEach(function (s) {
      var h = wp(B[s + 'Hand']);
      var m = wp(B[s + 'HandMiddle1']);
      var i2 = wp(B[s + 'HandIndex1']);
      var pk = wp(B[s + 'HandPinky1']);
      var f = m.clone().sub(h);
      var palmLen = f.length(); f.normalize();
      var a = i2.clone().sub(pk);
      a.addScaledVector(f, -a.dot(f)).normalize();
      var c = new THREE.Vector3().crossVectors(f, a);
      var n = c.clone();
      if (n.dot(new THREE.Vector3(-h.x, 0, 0)) < 0) n.negate();
      HF[s] = {
        f: f, a: a, c: c, n: n, palmLen: palmLen, h0: h.clone(),
        wq: rest[s + 'Hand'].wq.clone(),
        inv: B[s + 'Hand'].matrixWorld.clone().invert(),
        ws: new THREE.Vector3().setFromMatrixScale(B[s + 'Hand'].matrixWorld).x
      };
      SG[s] = {
        curl: Math.sign(new THREE.Vector3().crossVectors(a, f).dot(n)) || 1,
        tf:   Math.sign(c.dot(n)) || 1,
        tn:   Math.sign(new THREE.Vector3().crossVectors(n, a).dot(f)) || 1
      };
      ['Index', 'Middle', 'Ring', 'Pinky'].forEach(function (F) {
        [1, 2, 3].forEach(function (kn) {
          var key = s + 'Hand' + F + kn;
          AXC[key] = loc(key, a);
        });
      });
      [1, 2, 3].forEach(function (kn) {
        var key = s + 'HandThumb' + kn;
        AXF[key] = loc(key, f);
        AXN[key] = loc(key, n);
      });
    });
    this.HF = HF; this.AXC = AXC; this.AXF = AXF; this.AXN = AXN; this.SG = SG;

    /* ✅ сборка ИНСТРУМЕНТА: авто-подгонка (pivot модели не важен) →
       обёртка (wrap) хранит подгонку, а хват (placeLikeAxe) двигает
       ТОЛЬКО holder — подгонка не затирается */
    var self = this;
    var walkMat = function walkMat(o) {
      if (!o) return;
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        o.frustumCulled = false;
        var m = o.material;
        if (m) {
          m.side = THREE.DoubleSide;
          if (m.map) m.map.anisotropy = 8;
          m.metalness = 0;
          m.roughness = Math.max(m.roughness !== undefined ? m.roughness : 1, 0.75);
        }
      }
      if (o.children) for (var i = 0; i < o.children.length; i++) walkMat(o.children[i]);
    };
    var makeTool = function (proto, targetLen, yawDeg, pivotY) {
      fitToolLikeAxe(proto, targetLen);
      if (yawDeg) proto.rotateY(yawDeg * D); // доворот головы вокруг рукояти
      proto.position.y += pivotY;
      walkMat(proto);
      var wrap = new THREE.Group();
      wrap.add(proto);
      var holder = new THREE.Group();
      holder.add(wrap);
      B.RightHand.add(holder);
      holder.visible = false;
      return { holder: holder, wrap: wrap };
    };

    /* КАМЕННЫЙ ТОПОР — модель stone_axe.glb (как в v0.2.3) */
    this.axe = makeTool(ag, AXE_TARGET_LEN, AXE_YAW, 0);
    this.axeHolder = this.axe.holder;
    /* КАМЕННАЯ КИРКА — одна правая рука, машет как топор */
    this.stonePick = makeTool(spg, SPICK_TARGET_LEN, SPICK_YAW, 0);
    /* ЖЕЛЕЗНАЯ КИРКА — две руки, один удар по прямой */
    this.ironPick = makeTool(pkg, PICKAXE_TARGET_LEN, PICKAXE_YAW, PICKAXE_PIVOT_Y);
    this.pickaxeHolder = this.ironPick.holder;
    /* ✅ ЖЕЛЕЗНЫЙ ТОПОР (v0.2.9) — одна правая рука, левая скрыта */
    this.ironAxe = makeTool(iag, IRON_AXE_TARGET_LEN, IRON_AXE_YAW, 0);

    /* ✅ v0.4.40 БУЛАВА — своя сборка (модель грузится ОТДЕЛЬНО, см. _load):
       нормализация КАК У ИНСТРУМЕНТОВ (fitToolLikeAxe: рукоять вдоль +Y,
       нижний конец в нуле, длина MACE.len) + доворот головы MACE.yaw.
       Хват — placeLikeAxe (одна правая рука, как у топора) */
    this._attachMace = function (mg) {
      if (self.mace) return;
      fitToolLikeAxe(mg, MACE.len);
      if (MACE.yaw) mg.rotateY(MACE.yaw * D);
      walkMat(mg);
      var mwrap = new THREE.Group();
      mwrap.add(mg);
      var mholder = new THREE.Group();
      mholder.add(mwrap);
      B.RightHand.add(mholder);
      mholder.visible = self.currentWeapon === 'mace' && self.visible;
      self.mace = { holder: mholder, wrap: mwrap };
      console.log('[BrixFirstPerson] булава в руках готова (длина ' + MACE.len + ' м)');
    };

    /* ✅ v0.4.41 С4 — своя сборка: модель НОРМАЛИЗУЕТСЯ к единичному
       боксу (самая большая сторона = 1) и центрируется, размер задаёт
       C4.len. Держится НЕ как топор: блок ставится ПО ЦЕНТРУ между
       кистями (placeC4 считает середину между ладонями каждый кадр) */
    this._attachC4 = function (cg) {
      if (self.c4) return;
      walkMat(cg);
      var box = new THREE.Box3().setFromObject(cg);
      var size = box.getSize(new THREE.Vector3());
      var mx = Math.max(size.x, size.y, size.z) || 1;
      cg.scale.setScalar(1 / mx);            // единичный бокс — len задаёт holder
      var c = box.getCenter(new THREE.Vector3()).multiplyScalar(1 / mx);
      cg.position.set(-c.x, -c.y, -c.z);     // центр блока в нуле обёртки
      var cwrap = new THREE.Group();
      cwrap.add(cg);
      var cholder = new THREE.Group();
      cholder.add(cwrap);
      B.RightHand.add(cholder);
      cholder.visible = self.currentWeapon === 'c4' && self.visible;
      self.c4 = { holder: cholder, wrap: cwrap, proto: cg };
      console.log('[BrixFirstPerson] С4 в руках готов (ширина ' + C4.len + ' м)');
    };

    /* ✅ v0.4.6 ПЛАН СТРОИТЕЛЯ — процедурный синий ватман-свиток
       (как на референсе: голубой лист с белой сеткой-чертежом,
       края скручены в рулоны). Правая рука держит снизу, левая
       подхватывает край — лист читается как чертёж */
    (function () {
      var tex = self._makePlanTexture();
      var g = new THREE.Group();
      var sheet = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.008, 0.3),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0 }));
      sheet.rotation.x = -0.12;
      g.add(sheet);
      var rollGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.3, 10);
      var rollMat = new THREE.MeshStandardMaterial({ color: 0x8ba4b6, roughness: 0.92, metalness: 0 });
      var r1 = new THREE.Mesh(rollGeo, rollMat);
      r1.rotation.x = Math.PI / 2; r1.position.set(-0.21, 0.014, 0); g.add(r1);
      var r2 = new THREE.Mesh(rollGeo, rollMat);
      r2.rotation.x = Math.PI / 2; r2.position.set(0.21, 0.014, 0); g.add(r2);
      walkMat(g);
      var wrap = new THREE.Group();
      wrap.add(g);
      wrap.rotation.x = -0.55;          // лист наклонён к глазам — видна сетка
      var holder = new THREE.Group();
      holder.add(wrap);
      B.RightHand.add(holder);
      holder.visible = false;
      self.plan = { holder: holder, wrap: wrap };
    })();

    /* ✅ v0.4.6 РЕВОЛЬВЕР — своя сборка: fitGun сам находит ствол и рукоять
       (ствол → вперёд, рукоять → в ладонь), размер задаёт REV.len.
       Сборку вызывает конструктор после отдельной загрузки модели */
    this._attachRevolver = function (rvg) {
      if (self.revolver) return;
      walkMat(rvg);
      var wrap = new THREE.Group();
      wrap.add(rvg);
      var holder = new THREE.Group();
      holder.add(wrap);
      B.RightHand.add(holder);
      holder.visible = self.currentWeapon === 'revolver' && self.visible;
      self.revolver = { holder: holder, wrap: wrap, proto: rvg };
      self._refitRevolver();
      console.log('[BrixFirstPerson] револьвер в руках готов');
    };
    // пересборка подгонки (вызывается и «вживую», если меняли REV.flip / REV.upDown)
    this._refitRevolver = function () {
      if (!self.revolver) return;
      fitGun(self.revolver.proto, !!REV.flip, !!REV.upDown);
      self._revFlip = REV.flip;
      self._revUD = REV.upDown;
    };

    /* ✅ v0.4.19 ДРОБОВИК — сборка по образцу револьвера: fitGun сам находит
       ствол и рукоять, размер задаёт SGN.len. Модель тяжёлая метал-дерево —
       после walkMat возвращаем честный PBR (walkMat обнуляет metalness,
       а ствол и бандажи должны бликовать) */
    this._attachShotgun = function (sg) {
      if (self.shotgun) return;
      walkMat(sg);
      sg.traverse(function (o) {
        if (o.isMesh && o.material) {
          o.material.metalness = 1;
          o.material.roughness = 1;
        }
      });
      var wrap = new THREE.Group();
      wrap.add(sg);
      var holder = new THREE.Group();
      holder.add(wrap);
      B.RightHand.add(holder);
      holder.visible = self.currentWeapon === 'shotgun' && self.visible;
      self.shotgun = { holder: holder, wrap: wrap, proto: sg };
      self._refitShotgun();
      console.log('[BrixFirstPerson] дробовик в руках готов');
    };
    // пересборка подгонки (вызывается и «вживую», если меняли SGN.flip / SGN.upDown)
    this._refitShotgun = function () {
      if (!self.shotgun) return;
      fitGun(self.shotgun.proto, !!SGN.flip, !!SGN.upDown);
      self._sgFlip = SGN.flip;
      self._sgUD = SGN.upDown;
    };

    /* ✅ v0.4.36 РЕВОЛЬВЕР-КАРАБИН 3× — сборка по образцу револьвера/дробовика:
       fitGun сам находит ствол и рукоять (по геометрии модели: ствол вдоль X,
       рукоять/приклад внизу сзади), размер задаёт RVX.len. Материалы —
       честный PBR: металл серебристый, дерево светлое (walkMat обнуляет
       metalness — возвращаем стволу блик) */
    this._attachRev3x = function (r3g) {
      if (self.rev3x) return;
      walkMat(r3g);
      r3g.traverse(function (o) {
        if (o.isMesh && o.material) {
          o.material.metalness = 1;
          o.material.roughness = 0.75;
        }
      });
      var wrap = new THREE.Group();
      wrap.add(r3g);
      var holder = new THREE.Group();
      holder.add(wrap);
      B.RightHand.add(holder);
      holder.visible = self.currentWeapon === 'rev3x' && self.visible;
      self.rev3x = { holder: holder, wrap: wrap, proto: r3g };
      self._refitRev3x();
      console.log('[BrixFirstPerson] револьвер-карабин 3× в руках готов');
    };
    // пересборка подгонки (вызывается и «вживую», если меняли RVX.flip / RVX.upDown)
    this._refitRev3x = function () {
      if (!self.rev3x) return;
      fitGun(self.rev3x.proto, !!RVX.flip, !!RVX.upDown);
      /* ✅ v0.4.38 СДВИГ ХВАТА (RVX.gx): авто-точка fitGun попадает на
         проволочный приклад (задние 28% длины модели), а настоящая рукоять
         — на 0.30 длины впереди неё. Сдвигаем модель назад по стволу, чтобы
         рукоять точно встала в ладонь (gx в долях длины, как len) */
      if (RVX.gx) self.rev3x.proto.position.x -= RVX.gx;
      self._r3Flip = RVX.flip;
      self._r3UD = RVX.upDown;
    };

    /* ✅ v0.4.21 КАЛАШ — сборка 1-в-1 из репозитория -glm: длина 0.85,
       материалы как в репозитории (metalness НЕ трогаем — там честный
       металл/дерево), holder в правой кисти; ориентацию/размер каждый
       кадр ставит placeRifle по кадру ладони (GRIP_AK).
       ✅ v0.4.35: ТОМПСОН кладётся в ТОТ ЖЕ holder (см. _attachThompson) —
       держится тем же механизмом, что калаш */
    this._attachRifle = function (akg) {
      if (self.rifle && self.rifle.models && self.rifle.models.ak) return;
      var box = new THREE.Box3().setFromObject(akg);
      var size = box.getSize(new THREE.Vector3());
      var len = Math.max(size.x, size.y, size.z);
      if (len > 1) { akg.scale.multiplyScalar(RIFLE_CFGS.ak.len / len); akg.updateMatrixWorld(true); }
      var walkAK = function (o) {
        if (!o) return;
        if (o.isMesh) {
          o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false;
          var m = o.material;
          if (m) { m.side = THREE.DoubleSide; if (m.map) m.map.anisotropy = 8; }
        }
        if (o.children) for (var i = 0; i < o.children.length; i++) walkAK(o.children[i]);
      };
      walkAK(akg);
      akg.visible = false;
      if (!self.rifle) {
        var holder = new THREE.Group();
        holder.add(akg);
        B.RightHand.add(holder);
        holder.visible = false;
        self.rifle = { holder: holder, proto: akg, kind: 'ak', models: {} };
      } else {
        self.rifle.holder.add(akg);            // ✅ томпсон создал holder раньше
      }
      self.rifle.models.ak = akg;
      // если калаш выбран — показать (модель могла догрузиться позже setWeapon)
      self.rifle.holder.visible = self.visible &&
        (self.currentWeapon === 'rifle' || self.currentWeapon === 'smg');
      if (self.currentWeapon === 'rifle') self._setRifleModel('ak');
      console.log('[BrixFirstPerson] калаш в руках готов');
    };

    /* ✅ v0.4.35 ТОМПСОН — держится КАК КАЛАШ: модель нормализуется в
       прото-пространство калаша (ствол вдоль +Z, рукоять в (0,0,0),
       вверх +Y), после чего вся машина поз (placeRifle, ADS, левая
       рука на цевье) работает без изменений по конфигу RIFLE_CFGS.tp:
       tpProto — то, что крутит placeRifle (rotation.y = PI/2 как у АК);
       inner — постоянная нормализация: поворот ствола +X → +Z и сдвиг
       рукояти в ноль */
    this._attachThompson = function (tpg) {
      if (self.rifle && self.rifle.models && self.rifle.models.tp) return;
      var box = new THREE.Box3().setFromObject(tpg);
      var size = box.getSize(new THREE.Vector3());
      var len = Math.max(size.x, size.y, size.z);
      var k = TP_LEN / len;                        // масштаб модели (ед. → метры)
      var walkTP = function (o) {
        if (!o) return;
        if (o.isMesh) {
          o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false;
          var m = o.material;
          if (m) { m.side = THREE.DoubleSide; if (m.map) m.map.anisotropy = 8; }
        }
        if (o.children) for (var i = 0; i < o.children.length; i++) walkTP(o.children[i]);
      };
      walkTP(tpg);
      // нормализация: поворот ствола (+X) → +Z и рукоять в (0,0,0).
      // ✅ МАСШТАБ — НА САМОМ tpProto (как у ak47.glb: масштаб на akg),
      // тогда прото-пространство томпсона — те же «сырые» единицы модели,
      // что и у калаша: ADS_TP/GRIP_TP_LEFT (yPref, zCenter...) работают
      // без пересчёта, как родные константы АК
      var inner = new THREE.Group();
      inner.rotation.y = -Math.PI / 2;             // +X → +Z (дуло вперёд)
      /* ✅ v0.4.38 ФИКС ХВАТА ТОМПСОНА: после Ry(−90°) точка (x,y,z) → (−z, y, x),
         значит рукоять (−60, 74, 107.5) переезжает в (−107.5, 74, −60) и для
         сдвига в (0,0,0) нужен position (+107.5, −74, +60) = (z, −y, −x).
         Раньше по Z ставился TP_GRIP_PT.x (=−60, ЗНАК ПЕРЕПУТАН) — рукоять
         НЕ попадала в ладонь: весь томпсон уезжал на 120 ед. модели (≈21 см)
         назад по пальцам, правая рука держала воздух у магазина, а левая
         тянулась ПЕРЕД дулом (цели цевья считаются в том же прото-
         пространстве). Один знак — и руки снова держат томик, как калаш. */
      inner.position.set(TP_GRIP_PT.z, -TP_GRIP_PT.y, -TP_GRIP_PT.x);
      inner.add(tpg);
      var tpProto = new THREE.Group();             // крутится placeRifle
      tpProto.scale.setScalar(k);                  // ✅ масштаб здесь (как у АК)
      tpProto.add(inner);
      tpProto.visible = false;
      if (!self.rifle) {
        var holder = new THREE.Group();
        holder.add(tpProto);
        B.RightHand.add(holder);
        holder.visible = false;
        self.rifle = { holder: holder, proto: tpProto, kind: 'tp', models: {} };
      } else {
        self.rifle.holder.add(tpProto);            // ✅ калаш создал holder раньше
      }
      self.rifle.models.tp = tpProto;
      self.rifle.holder.visible = self.visible &&
        (self.currentWeapon === 'rifle' || self.currentWeapon === 'smg');
      if (self.currentWeapon === 'smg') self._setRifleModel('tp');
      console.log('[BrixFirstPerson] томпсон в руках готов');
    };

    /* ✅ v0.4.35: переключение модели в «ружейном» holder (ak ↔ tp).
       Показывает выбранную прото-группу и прячет вторую */
    this._setRifleModel = function (kind) {
      var rf = self.rifle;
      if (!rf || !rf.models) return;
      var proto = rf.models[kind];
      if (!proto) return;                          // модель ещё грузится
      rf.kind = kind;
      rf.proto = proto;
      if (rf.models.ak) rf.models.ak.visible = kind === 'ak';
      if (rf.models.tp) rf.models.tp.visible = kind === 'tp';
    };

    this.handBone = B.RightHand;

    this._poseHelpers();

    this.loaded = true;
    // ✅ v0.4.5: восстанавливаем ТО ЖЕ оружие, что выбрал хотбар
    // (раньше setVisible(this.visible) всегда ставил 'axe' и перетирал
    // револьвер сразу после загрузки моделей)
    this.setWeapon(this.currentWeapon === 'none' ? null : this.currentWeapon);
    // ✅ v0.4.25: если скин выбрали, пока модель ещё грузилась — применяем сейчас
    if (this._skinPending !== undefined) {
      var pend = this._skinPending;
      this._skinPending = undefined;
      if (this.currentWeapon === 'ironPickaxe') this.applySkin(pend || BrixWeaponSkinUrlSafe());
    }

    // для хотбара: топор считается выбранным, если setVisible(true)
  };

  /* ---------- помощники поз (setWQ / IK / кисти / пальцы) ---------- */
  FirstPersonPlayer.prototype._poseHelpers = function () {
    var self = this;
    var B = this.bones, rest = this.rest;
    var wp = function (b) { return b.getWorldPosition(new THREE.Vector3()); };

    this.setWQ = function (b, q) {
      var pq = b.parent.getWorldQuaternion(new THREE.Quaternion());
      b.quaternion.copy(pq.invert().multiply(q));
      b.updateMatrixWorld(true);
    };
    this.rotW = function (b, ax, ang) {
      self.setWQ(b, new THREE.Quaternion().setFromAxisAngle(ax, ang).multiply(b.getWorldQuaternion(new THREE.Quaternion())));
    };
    this.aimW = function (b, from, to) {
      self.setWQ(b, new THREE.Quaternion().setFromUnitVectors(from, to).multiply(b.getWorldQuaternion(new THREE.Quaternion())));
    };

    // двухкостный IK (плечо-предплечье-кисть) с полюсом локтя
    this.ik = function (arm, fore, hand, target, pole) {
      var S = wp(arm), E = wp(fore), W = wp(hand);
      var l1 = E.distanceTo(S), l2 = W.distanceTo(E);
      var d = target.clone().sub(S);
      var dist = Math.min(d.length(), l1 + l2 - 1e-4);
      dist = Math.max(dist, Math.abs(l1 - l2) + 1e-3);
      d.normalize();
      var x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
      var h = Math.sqrt(Math.max(l1 * l1 - x * x, 0));
      var p = pole.clone().addScaledVector(d, -pole.dot(d)).normalize();
      var En = S.clone().addScaledVector(d, x).addScaledVector(p, h);
      self.aimW(arm, E.clone().sub(S).normalize(), En.clone().sub(S).normalize());
      var E2 = wp(fore), W2 = wp(hand), T2 = S.clone().addScaledVector(d, dist);
      self.aimW(fore, W2.clone().sub(E2).normalize(), T2.clone().sub(E2).normalize());
    };

    this.orientHand = function (side, f2, a2) {
      var H = self.HF[side];
      var m0 = new THREE.Matrix4().makeBasis(H.f, H.a, H.c);
      var m1 = new THREE.Matrix4().makeBasis(f2, a2, new THREE.Vector3().crossVectors(f2, a2));
      var qm = new THREE.Quaternion().setFromRotationMatrix(m1.multiply(m0.clone().transpose()));
      self.setWQ(self.bones[side + 'Hand'], qm.multiply(H.wq));
    };

    var q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
    this.fingers = function (side, curl, thumb) {
      var g = self.SG[side];
      ['Index', 'Middle', 'Ring', 'Pinky'].forEach(function (F, fi) {
        [70, 80, 55].forEach(function (deg, n) {
          var k = side + 'Hand' + F + (n + 1);
          var mult = [1, 1.05, 1.1, 1.15][fi];
          self.bones[k].quaternion.copy(rest[k].q)
            .multiply(q1.setFromAxisAngle(self.AXC[k], g.curl * deg * D * curl * mult));
        });
      });
      [[35, 22], [30, 8], [30, 4]].forEach(function (pair, n) {
        var k = side + 'HandThumb' + (n + 1);
        self.bones[k].quaternion.copy(rest[k].q)
          .multiply(q1.setFromAxisAngle(self.AXF[k], g.tf * pair[0] * D * thumb))
          .multiply(q2.setFromAxisAngle(self.AXN[k], g.tn * pair[1] * D * thumb));
      });
    };

    this.reach = function (s) {
      var a = wp(self.bones[s + 'Arm']), e = wp(self.bones[s + 'ForeArm']);
      return a.distanceTo(e) + e.distanceTo(wp(self.bones[s + 'Hand']));
    };

    // хват топора: рукоять через ладонь (GRIP из репозитория)
    var placeLikeAxe = function (roll, holder, weapon, grip) {
      var H = self.HF.Right;
      var gx = grip.sX, gp = grip.sP, G = grip.sG, S = grip.sS;
      var pos = H.h0.clone()
        .addScaledVector(H.f, H.palmLen * gx)
        .addScaledVector(H.n, gp)
        .applyMatrix4(H.inv);
      holder.position.copy(pos);
      var fl = H.f.clone().applyQuaternion(H.wq.clone().invert());
      var al = H.a.clone().applyQuaternion(H.wq.clone().invert());
      var cl = new THREE.Vector3().crossVectors(fl, al);
      var qb = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fl, al, cl));
      holder.quaternion.copy(qb)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (roll + grip.sR) * D));
      holder.scale.setScalar(S / H.ws);
      weapon.position.set(0, -G, 0);
    };
    this.placeAxe = function (roll) { placeLikeAxe(roll, self.axe.holder, self.axe.wrap, GRIP); };
    // ✅ каменная кирка — тот же хват, одна правая рука
    this.placeStonePick = function (roll) { placeLikeAxe(roll, self.stonePick.holder, self.stonePick.wrap, GRIP_SPICK); };
    // ✅ железная кирка — тот же хват, левая рука подхватывается сама
    this.placeIronPick = function (roll) { placeLikeAxe(roll, self.ironPick.holder, self.ironPick.wrap, GRIP_PICKAXE); };
    // ✅ v0.2.9 железный топор — тот же хват, одна правая рука
    this.placeIronAxe = function (roll) { placeLikeAxe(roll, self.ironAxe.holder, self.ironAxe.wrap, GRIP_IRONAXE); };
    // ✅ v0.4.40 булава — тот же хват (одна правая рука), своя модель
    this.placeMace = function (roll) {
      if (!self.mace) return;
      placeLikeAxe(roll, self.mace.holder, self.mace.wrap, GRIP_MACE);
    };
    // ✅ v0.4.6 план строителя — тот же хват ладони, лист наклонён самим wrap
    this.placePlan = function (roll) {
      if (self.plan) placeLikeAxe(roll, self.plan.holder, self.plan.wrap, GRIP);
    };

    /* ✅ v0.4.41 хват С4: блок ПО ЦЕНТРУ между кистями. Позиция = середина
       между ладонями (мировые), ориентация — по рамке камеры рук (f/u/r)
       с доводкой C4.pitch/yaw/roll. Всё в локальном пространстве кости
       RightHand (holder — её ребёнок), как у остальных предметов */
    this.placeC4 = function () {
      var c4 = self.c4;
      if (!c4) return;
      var hb = self.bones.RightHand;
      var pr = self.bones.RightHand.getWorldPosition(new THREE.Vector3());
      var pl = self.bones.LeftHand.getWorldPosition(new THREE.Vector3());
      var mid = pr.clone().add(pl).multiplyScalar(0.5)
        .addScaledVector(self.camFrame.u, C4.oy || 0)
        .addScaledVector(self.camFrame.r, C4.ox || 0)
        .addScaledVector(self.camFrame.f, C4.oz || 0);
      var cf = self.camFrame.f, cu = self.camFrame.u, cr = self.camFrame.r;
      // рамка блока: перед — от игрока, вверх — вверх камеры
      var bf = cf.clone().multiplyScalar(Math.cos((C4.pitch || 0) * D))
        .addScaledVector(cu, Math.sin((C4.pitch || 0) * D)).normalize();
      var bu = cu.clone();
      if (C4.yaw || C4.roll) {
        var qe = new THREE.Quaternion().setFromEuler(
          new THREE.Euler((C4.pitch || 0) * D, (C4.yaw || 0) * D, (C4.roll || 0) * D, 'YXZ'));
        bf.applyQuaternion(qe); bu.applyQuaternion(qe);
      }
      var br = new THREE.Vector3().crossVectors(bf, bu).normalize();
      bu = new THREE.Vector3().crossVectors(br, bf).normalize();
      var qW = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(br, bu, bf.clone().negate()));
      var hs = new THREE.Vector3().setFromMatrixScale(hb.matrixWorld).x || 1;
      c4.holder.scale.setScalar(C4.len / hs);
      var inv = hb.getWorldQuaternion(new THREE.Quaternion()).invert();
      c4.holder.quaternion.copy(inv.multiply(qW));
      var invM = hb.matrixWorld.clone().invert();
      c4.holder.position.copy(mid.applyMatrix4(invM));
      c4.wrap.rotation.set(0, 0, 0);
      c4.wrap.position.set(0, 0, 0);
    };

    // ✅ v0.4.6 хват РЕВОЛЬВЕРА: рукоять в правой ладони (сбоку), ствол строго
    // ВПЕРЁД. Ориентация берётся не от предплечья, а от «вперёд» торса
    // (self._gunF/_gunA считаются в pose), поэтому ствол всегда смотрит прямо
    this.placeRevolver = function () {
      var rv = self.revolver;
      if (self._revFlip !== REV.flip || self._revUD !== REV.upDown) self._refitRevolver();
      var H = self.HF.Right, hb = self.bones.RightHand;
      var pos = H.h0.clone()
        .addScaledVector(H.f, H.palmLen * REV.palm)
        .addScaledVector(H.n, REV.palmN)
        .applyMatrix4(H.inv);
      rv.holder.position.copy(pos);
      var hs = new THREE.Vector3().setFromMatrixScale(hb.matrixWorld).x || 1;
      rv.holder.scale.setScalar(REV.len / hs);   // модель = 1 по длине → REV.len метров
      var gf = self._gunF || self.FW, ga = self._gunA || self.UP;
      var gcr = new THREE.Vector3().crossVectors(gf, ga);
      var qg = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(gf, ga, gcr));
      /* ✅ v0.4.22 БЕГ: ствол вверх-влево к груди, плавно по _runW (0..1);
         при ударе/перезарядке (_swingType) наклон не добавляем */
      var runW = self._swingType ? 0 : (self._runW || 0);
      var pitch = (REV.pitch + 40 * runW) * (1 - (self._aimBlend || 0));
      var yawR = REV.yaw - 22 * runW;
      qg.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(REV.roll * D, yawR * D, pitch * D, 'XYZ')));
      var hq = hb.getWorldQuaternion(new THREE.Quaternion()).invert();
      rv.holder.quaternion.copy(hq.multiply(qg));
      rv.wrap.rotation.set(0, 0, 0);
      rv.wrap.position.set(REV.ox, REV.oy, REV.oz);
    };

    // ✅ v0.4.19 хват ДРОБОВИКА — то же тело, что у револьвера, но со своими
    // SGN-настройками (длиннее, тяжелее; левая рука вынесена под цевьё)
    this.placeShotgun = function () {
      var sg = self.shotgun;
      if (self._sgFlip !== SGN.flip || self._sgUD !== SGN.upDown) self._refitShotgun();
      var H = self.HF.Right, hb = self.bones.RightHand;
      var pos = H.h0.clone()
        .addScaledVector(H.f, H.palmLen * SGN.palm)
        .addScaledVector(H.n, SGN.palmN)
        .applyMatrix4(H.inv);
      sg.holder.position.copy(pos);
      var hs = new THREE.Vector3().setFromMatrixScale(hb.matrixWorld).x || 1;
      sg.holder.scale.setScalar(SGN.len / hs);   // модель = 1 по длине → SGN.len метров
      var gf = self._gunF || self.FW, ga = self._gunA || self.UP;
      var gcr = new THREE.Vector3().crossVectors(gf, ga);
      var qg = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(gf, ga, gcr));
      /* ✅ v0.4.22 БЕГ: длинный ствол дробовика тоже вверх-влево к груди */
      var runW = self._swingType ? 0 : (self._runW || 0);
      var pitch = (SGN.pitch + 34 * runW) * (1 - (self._aimBlend || 0));
      var yawS = SGN.yaw - 18 * runW;
      qg.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(SGN.roll * D, yawS * D, pitch * D, 'XYZ')));
      var hq = hb.getWorldQuaternion(new THREE.Quaternion()).invert();
      sg.holder.quaternion.copy(hq.multiply(qg));
      sg.wrap.rotation.set(0, 0, 0);
      sg.wrap.position.set(SGN.ox, SGN.oy, SGN.oz);
    };

    // ✅ v0.4.36 хват РЕВОЛЬВЕРА-КАРАБИНА 3× — то же тело, что у дробовика
    // (длинный ствол чуть наклонён вниз, левая рука под цевьём), свои RVX
    this.placeRev3x = function () {
      var r3 = self.rev3x;
      if (self._r3Flip !== RVX.flip || self._r3UD !== RVX.upDown) self._refitRev3x();
      var H = self.HF.Right, hb = self.bones.RightHand;
      var pos = H.h0.clone()
        .addScaledVector(H.f, H.palmLen * RVX.palm)
        .addScaledVector(H.n, RVX.palmN)
        .applyMatrix4(H.inv);
      r3.holder.position.copy(pos);
      var hs = new THREE.Vector3().setFromMatrixScale(hb.matrixWorld).x || 1;
      r3.holder.scale.setScalar(RVX.len / hs);   // модель = 1 по длине → RVX.len метров
      var gf = self._gunF || self.FW, ga = self._gunA || self.UP;
      var gcr = new THREE.Vector3().crossVectors(gf, ga);
      var qg = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(gf, ga, gcr));
      /* ✅ бег: ствол вверх-влево к груди, при перезарядке наклона нет;
         в прицеле (ПКМ) ствол ровно по камере — плавно по _aimBlend */
      var runW = self._swingType ? 0 : (self._runW || 0);
      var pitch = (RVX.pitch + 34 * runW) * (1 - (self._aimBlend || 0));
      var yawS = RVX.yaw - 18 * runW;
      qg.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(RVX.roll * D, yawS * D, pitch * D, 'XYZ')));
      var hq = hb.getWorldQuaternion(new THREE.Quaternion()).invert();
      r3.holder.quaternion.copy(hq.multiply(qg));
      r3.wrap.rotation.set(0, 0, 0);
      r3.wrap.position.set(RVX.ox, RVX.oy, RVX.oz);
    };

    // ✅ v0.4.21 хват КАЛАША — порт placeAK из репозитория: автомат висит
    // на правой кисти (пистолетная рукоять в ладони), ствол вперёд.
    // ✅ v0.4.35: та же функция ставит и ТОМПСОН (конфиг по kind)
    this.placeRifle = function () {
      var rf = self.rifle;
      if (!rf) return;
      var G = RIFLE_CFGS[rf.kind || 'ak'].grip;
      var H = self.HF.Right;
      var pos = H.h0.clone()
        .addScaledVector(H.f, H.palmLen * G.sX)
        .addScaledVector(H.n, G.sP)
        .applyMatrix4(H.inv);
      rf.holder.position.copy(pos);
      var fl = H.f.clone().applyQuaternion(H.wq.clone().invert());
      var al = H.a.clone().applyQuaternion(H.wq.clone().invert());
      var cl = new THREE.Vector3().crossVectors(fl, al);
      var qb = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fl, al, cl));
      rf.holder.quaternion.copy(qb).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), G.sR * D));
      rf.holder.scale.setScalar(G.sS / (H.ws || 1));
      rf.proto.position.set(0, 0, 0);
      rf.proto.rotation.set(0, Math.PI / 2, 0);   // ствол из Y → вперёд по пальцам (как в репозитории)
    };

    // ✅ v0.4.21 явная ориентация ствола в камере (порт gunFrame):
    // yaw (+вправо), pitch (+дуло вверх), roll (+по часовой), градусы
    this.gunFrame = function (yaw, pitch, roll) {
      var c = self.camFrame;
      var q = new THREE.Quaternion().setFromAxisAngle(c.u, -yaw * D)
        .multiply(new THREE.Quaternion().setFromAxisAngle(c.r, pitch * D));
      var f = c.f.clone().applyQuaternion(q);
      var u = c.u.clone().applyQuaternion(q);
      u.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(f, roll * D));
      return { f: f, a: u };
    };

    // ✅ v0.4.21 цель ЛЕВОЙ руки (порт leftGunTarget): считается от РЕАЛЬНОГО
    // положения автомата в мире — рука привязана к цевью и не уезжает
    // при беге/отдаче/прицеливании. shortfall > 0 — на сколько не достаёт
    this.rifleLeftTarget = function (LL, SL) {
      var B = self.bones;
      var cfg = RIFLE_CFGS[self.rifle.kind || 'ak'];
      var G = cfg.left, HALF_H = cfg.halfH, HALF_W = cfg.halfW;
      var obj = self.rifle.proto, objW = obj.matrixWorld;
      var fwd = new THREE.Vector3(0, 0, 1).transformDirection(objW);   // куда смотрит дуло
      var up = new THREE.Vector3(0, 1, 0).transformDirection(objW);    // верх оружия
      var right = new THREE.Vector3().crossVectors(fwd, up).normalize();
      var unit = new THREE.Vector3().setFromMatrixScale(objW).x;       // метров на ед. модели
      var palmLenW = wp(B.LeftHand).distanceTo(wp(B.LeftHandMiddle1));
      // ладонь смотрит вверх и чуть вправо (к оружию), пальцы вперёд-вправо
      var pd = up.clone().addScaledVector(right, G.palmTilt).normalize();
      var fa = G.fingerAng * D;
      var f2 = fwd.clone().multiplyScalar(Math.cos(fa)).addScaledVector(right, Math.sin(fa));
      f2.addScaledVector(pd, -f2.dot(pd)).normalize();
      var c2 = pd.clone().multiplyScalar(-self.SG.Left.curl);
      var a2 = new THREE.Vector3().crossVectors(c2, f2).normalize();
      // от центра ладони до оси цевья
      var halfExt = (Math.abs(pd.dot(up)) * HALF_H + Math.abs(pd.dot(right)) * HALF_W) * unit;
      var dist = halfExt + G.palmThick * palmLenW;
      // ищем самую переднюю точку цевья, до которой рука достаёт
      var reachMax = LL * 0.985;
      var t0 = G.yPref, t1 = G.yRear, W = null, bestW = null, bestD = Infinity, N = 12;
      for (var i = 0; i < N; i++) {
        var t = t0 + (t1 - t0) * (i / (N - 1));
        var gc = obj.localToWorld(new THREE.Vector3(0, G.zCenter, -t));
        var w = gc.addScaledVector(pd, -dist).addScaledVector(f2, -G.palmFrac * palmLenW);
        var d = w.distanceTo(SL);
        if (d < bestD) { bestD = d; bestW = w; }
        if (d <= reachMax) { W = w; break; }
      }
      return { W: W || bestW, f2: f2, a2: a2, shortfall: W ? 0 : (bestD - reachMax) };
    };

    // ✅ v0.4.21 левая рука НА цевье калаша (порт poseLeftHandGun)
    this.poseLeftHandRifle = function (LL, SL, pole) {
      var G = GRIP_AK_LEFT, H = self.HF.Left;
      var T = self.rifleLeftTarget(LL, SL);
      self.ik(self.bones.LeftArm, self.bones.LeftForeArm, self.bones.LeftHand, T.W, pole);
      // часть разворота ладони отдаём предплечью (запястье не «выкручивается»)
      var e = wp(self.bones.LeftHand).sub(wp(self.bones.LeftForeArm)).normalize();
      var R = self.bones.LeftHand.getWorldQuaternion(new THREE.Quaternion()).multiply(H.wq.clone().invert());
      var aCur = H.a.clone().applyQuaternion(R);
      aCur.addScaledVector(e, -aCur.dot(e));
      var aTgt = T.a2.clone().addScaledVector(e, -T.a2.dot(e));
      if (aCur.lengthSq() > 1e-6 && aTgt.lengthSq() > 1e-6) {
        aCur.normalize(); aTgt.normalize();
        var ang = Math.atan2(e.dot(new THREE.Vector3().crossVectors(aCur, aTgt)), aCur.dot(aTgt));
        self.rotW(self.bones.LeftForeArm, e, ang * G.twistShare);
      }
      self.orientHand('Left', T.f2, T.a2);
      self.fingers('Left', G.curl, G.thumb);
    };

    // рамка камеры рук
    (function () {
      var cf = HANDS_CAM_TARGET.clone().sub(HANDS_CAM_POS).normalize();
      var cr = new THREE.Vector3().crossVectors(cf, new THREE.Vector3(0, 1, 0)).normalize();
      var cu = new THREE.Vector3().crossVectors(cr, cf).normalize();
      self.camFrame = { pos: HANDS_CAM_POS.clone(), f: cf, u: cu, r: cr };
    })();

    /* ---------- применение позы к ригу ---------- */
    this.pose = function (p, fp) {
      var B = self.bones, rest = self.rest;
      var UP = self.UP, RT = self.RT, FW = self.FW, LF = self.LF;
      var wpp = function (b) { return b.getWorldPosition(new THREE.Vector3()); };

      for (var k in B) {
        B[k].quaternion.copy(rest[k].q);
        B[k].scale.copy(rest[k].s);
      }
      if (fp) {
        B.LeftArm.scale.multiplyScalar(ARMS_SCALE);
        B.RightArm.scale.multiplyScalar(ARMS_SCALE);
        // ✅ v0.2.10: у железной кирки левая рука больше НЕ тянется к рукояти —
        // она скрыта (как у железного топора), обе руки держат всё одной правой
      }
      self.model.position.y = 0;
      self.model.updateMatrixWorld(true);

      self.rotW(B.Hips, UP, p.hy * D);
      ['Spine', 'Spine1', 'Spine2'].forEach(function (k) {
        self.rotW(B[k], UP, p.sy * D / 3);
        self.rotW(B[k], LF, p.sx * D / 3);
      });
      self.rotW(B.Head, LF, p.hx * D);
      [['Left', p.ltx, p.ltk], ['Right', p.rtx, p.rtk]].forEach(function (pair) {
        var s = pair[0], tx = pair[1], tk = pair[2];
        self.rotW(B[s + 'UpLeg'], LF, -tx * D);
        self.rotW(B[s + 'Leg'], LF, tk * D);
        self.rotW(B[s + 'Foot'], LF, (tx - tk) * D);
      });
      self.model.updateMatrixWorld(true);
      self.model.position.y = self.REST_ANKLE - Math.min(wpp(B.LeftFoot).y, wpp(B.RightFoot).y);
      self.model.updateMatrixWorld(true);

      var qT = B.Spine2.getWorldQuaternion(new THREE.Quaternion()).multiply(rest.Spine2.wq.clone().invert());
      var Ut = UP.clone().applyQuaternion(qT);
      var Ft = FW.clone().applyQuaternion(qT);
      var Rt = RT.clone().applyQuaternion(qT);
      var tgt = function (S, L, x, y, z) {
        return S.clone().addScaledVector(Rt, x * L).addScaledVector(Ut, y * L).addScaledVector(Ft, z * L);
      };

      var LR = self.reach('Right'), SR = wpp(B.RightArm);
      var LL = self.reach('Left'), SL = wpp(B.LeftArm);
      var rightPole = Ut.clone().multiplyScalar(-1).addScaledVector(Rt, 0.5).addScaledVector(Ft, -0.3);
      var leftPole  = Ut.clone().multiplyScalar(-1).addScaledVector(Rt, -0.5).addScaledVector(Ft, -0.3);

      /* ✅ ПРАВАЯ РУКА + оружие (топор ИЛИ кирка) */
      // ✅ v0.4.21: у КАЛАША отдача/дрожь — смещения в осях камеры (метры),
      // двигают ВЕСЬ автомат вместе с кистью (порт off из репозитория)
      var rkOff = null;
      if ((self.currentWeapon === 'rifle' || self.currentWeapon === 'smg') &&
          self.rifle && self.camFrame) {
        rkOff = new THREE.Vector3()
          .addScaledVector(self.camFrame.r, p.ox || 0)
          .addScaledVector(self.camFrame.u, p.oy || 0)
          .addScaledVector(self.camFrame.f, p.oz || 0);
      }
      var rTgt = tgt(SR, LR, p.rx, p.ry, p.rz);
      /* ✅ v0.4.39 РЕВОЛЬВЕР-КАРАБИН 3× ОТОДВИНУТ ВПРАВО ОТ ХОТБАРА:
        весь карабин (рука + модель) сдвигается по оси торса «вправо»
        на 13% длины руки. Сдвиг плавно гаснет при прицеливании
        (ПКМ — оптика должна остаться ровно по центру экрана) */
      if (self.currentWeapon === 'rev3x' && self.rev3x) {
        rTgt.addScaledVector(Rt, 0.13 * (1 - (self._aimBlend || 0)));
      }
      if (rkOff) rTgt.add(rkOff);
      self.ik(B.RightArm, B.RightForeArm, B.RightHand, rTgt, rightPole);
      var ph = p.rphi * D;
      var a2 = Ut.clone().multiplyScalar(Math.cos(ph)).addScaledVector(Ft, Math.sin(ph))
        .applyAxisAngle(Ut, p.ryaw * D).normalize();
      var fd = wpp(B.RightHand).clone().sub(wpp(B.RightForeArm)).normalize();
      var pr = fd.clone().addScaledVector(a2, -fd.dot(a2));
      var ln = pr.length(); pr.normalize();
      var gg = new THREE.Vector3().crossVectors(a2, Rt).normalize();
      if (gg.dot(pr) < 0) gg.negate();
      var w = Math.min(1, Math.max(0, (ln - 0.35) / 0.35));
      var f2 = pr.multiplyScalar(w).addScaledVector(gg, 1 - w).normalize();
      self.orientHand('Right', f2, a2);
      self._gunF = gg.clone();   // «вперёд» торса ⟂ ладони (куда смотрит ствол)
      self._gunA = a2.clone();   // «вверх» ладони
      self.fingers('Right', p.curl, p.thumb);

      /* ✅ v0.4.21 КАЛАШ: явная ориентация (gw — при беге ствол к груди) →
         прицел ПКМ (линия целик→мушка на ось камеры, как в репозитории) →
         добавочные повороты отдачи → автомат на кисти → левая рука
         ПРИВЯЗАНА К ЦЕВЬЮ (считается от реальной модели). Общая поза
         дальше не нужна — выходим */
      if (self.currentWeapon === 'rifle' || self.currentWeapon === 'smg') {
        if (self.rifle) {
        var cfgR = RIFLE_CFGS[self.rifle.kind || 'ak'];
        var fF = f2.clone(), aF = a2.clone();
        if ((p.gw || 0) > 0.001) {
          var ge = self.gunFrame(p.gyaw || 0, p.gpitch || 0, p.groll || 0);
          fF.lerp(ge.f, p.gw).normalize();
          aF.lerp(ge.a, p.gw); aF.addScaledVector(fF, -aF.dot(fF)).normalize();
        }
        var adsK = p.ads || 0;
        var ptAk = function (q) { return new THREE.Vector3(q.x || 0, q.z, -q.y); };
        var anchorAk = function () { return self.rifle.proto.localToWorld(ptAk(cfgR.ads.rear)); };
        var PnAk = null;
        if (adsK > 0.001) {
          // где целик был бы БЕЗ прицеливания — переход плавный
          self.orientHand('Right', fF, aF);
          self.model.updateMatrixWorld(true);
          self.placeRifle();
          self.model.updateMatrixWorld(true);
          PnAk = anchorAk().clone();
          var rearL = ptAk(cfgR.ads.rear), frontL = ptAk(cfgR.ads.front);
          var gam = Math.atan2(frontL.y - rearL.y, frontL.z - rearL.z);
          var cfA = self.camFrame;
          var fAim = cfA.f.clone().multiplyScalar(Math.cos(gam)).addScaledVector(cfA.u, -Math.sin(gam)).normalize();
          var aAim = cfA.u.clone().multiplyScalar(Math.cos(gam)).addScaledVector(cfA.f, Math.sin(gam)).normalize();
          fF.lerp(fAim, adsK).normalize();
          aF.lerp(aAim, adsK); aF.addScaledVector(fF, -aF.dot(fF)).normalize();
        }
        if (p.ppitch || p.pyaw || p.proll) {
          var cfD = self.camFrame;
          var qd = new THREE.Quaternion().setFromAxisAngle(cfD.u, -(p.pyaw || 0) * D)
            .multiply(new THREE.Quaternion().setFromAxisAngle(cfD.r, (p.ppitch || 0) * D))
            .multiply(new THREE.Quaternion().setFromAxisAngle(cfD.f, (p.proll || 0) * D));
          fF.applyQuaternion(qd); aF.applyQuaternion(qd);
        }
        self.orientHand('Right', fF, aF);
        if (adsK > 0.001 && PnAk) {
          // двигаем кисть так, чтобы целик лёг на ось камеры
          self.model.updateMatrixWorld(true);
          self.placeRifle();
          self.model.updateMatrixWorld(true);
          var Pa = self.camFrame.pos.clone().addScaledVector(self.camFrame.f, cfgR.ads.dist)
            .add(rkOff || new THREE.Vector3());
          var Pt = PnAk.clone().lerp(Pa, adsK);
          var Wr = wp(B.RightHand).clone().add(Pt.sub(anchorAk()));
          self.ik(B.RightArm, B.RightForeArm, B.RightHand, Wr, rightPole);
          self.orientHand('Right', fF, aF);
        }
        self.fingers('Right', p.curl, p.thumb);
        // автомат на правой руке → левая к цевью (привязана к модели)
        self.model.updateMatrixWorld(true);
        self.placeRifle();
        self.model.updateMatrixWorld(true);
        self.poseLeftHandRifle(LL, SL, leftPole);
        self.model.updateMatrixWorld(true);
        return;
        }
      }

      /* ЛЕВАЯ РУКА */
      var gunCfg = null;
      if (self.currentWeapon === 'revolver' && self.revolver && REV.left) gunCfg = REV;
      else if (self.currentWeapon === 'shotgun' && self.shotgun && SGN.left) gunCfg = SGN;
      else if (self.currentWeapon === 'rev3x' && self.rev3x && RVX.left) gunCfg = RVX;
      else if (self.currentWeapon === 'c4' && self.c4) gunCfg = C4G;   // ✅ v0.4.41: левая — у блока слева
      if (gunCfg) {
        // ✅ v0.4.6 РЕВОЛЬВЕР / ✅ v0.4.19 ДРОБОВИК: левая кисть ставится ОТ
        // ПРАВОЙ (у дробовика — под цевьём, см. SGN.lr/lu/lf), пальцы охватывают
        // ✅ v0.4.36 РЕВОЛЬВЕР-КАРАБИН 3× — та же схема (RVX.lr/lu/lf — цевье)
        var gF = self._gunF, gA = self._gunA;
        var gR = new THREE.Vector3().crossVectors(gF, gA);      // вправо
        var uu = self.HF.Right.palmLen * ARMS_SCALE;            // длина кисти в мире
        var wr = wpp(B.RightHand);
        var tL = wr.clone()
          .addScaledVector(gR, gunCfg.lr * uu)
          .addScaledVector(gA, gunCfg.lu * uu)
          .addScaledVector(gF, gunCfg.lf * uu);
        self.ik(B.LeftArm, B.LeftForeArm, B.LeftHand, tL, leftPole);
        var fL = gF.clone().addScaledVector(gR, gunCfg.lwrap).addScaledVector(gA, -0.1).normalize();
        var aL = gA.clone().addScaledVector(fL, -gA.dot(fL)).normalize();
        self.orientHand('Left', fL, aL);
        self.fingers('Left', gunCfg.lcurl, gunCfg.lthumb);
      } else if (self.currentWeapon === 'shotgun' ||
          (self.currentWeapon === 'ironAxe' && self.ironAxe) ||
          (self.currentWeapon === 'ironPickaxe' && self.ironPick)) {
        // ✅ v0.2.9 ЖЕЛЕЗНЫЙ ТОПОР / ✅ v0.2.10 ЖЕЛЕЗНАЯ КИРКА — левая рука
        // СКРЫТА: кости левой руки схлопываются (scale → ~0). Риг — SkinnedMesh:
        // вершины, привязанные к костям левой руки, стягиваются в точку плеча и
        // рука исчезает (в 1-м лице виден только материал *arms*, остальное тело
        // скрыто, так что деформаций больше нигде не видно). Правая рука с
        // инструментом уже заняла своё место, инструмент ставится ниже.
        // ✅ v0.4.20 ДРОБОВИК — то же самое: левая рука УБРАНА, дробовик
        // держит только ПРАВАЯ рука (по просьбе игрока), даже при перезарядке.
        B.LeftArm.scale.setScalar(0.001);
        B.LeftForeArm.scale.setScalar(0.001);
        B.LeftHand.scale.setScalar(0.001);
      } else {
        // (расслабленная, как в репозитории для топора)
        self.ik(B.LeftArm, B.LeftForeArm, B.LeftHand, tgt(SL, LL, p.lx, p.ly, p.lz), leftPole);
        var fl = wpp(B.LeftHand).clone().sub(wpp(B.LeftForeArm)).normalize();
        var al = Ut.clone().multiplyScalar(0.8).addScaledVector(Rt, 0.5);
        al.addScaledVector(fl, -al.dot(fl)).normalize();
        self.orientHand('Left', fl, al);
        self.fingers('Left', p.lcurl, 0.3);
      }

      self.model.updateMatrixWorld(true);
      // все инструменты — хват ОДНОЙ правой руки:
      // каменный топор, каменная кирка, железный топор и железная кирка
      // (левая рука расслаблена или схлопнута выше)
      if (self.currentWeapon === 'axe') self.placeAxe(p.roll !== undefined ? p.roll : 90);
      else if (self.currentWeapon === 'pickaxe') self.placeStonePick(p.roll !== undefined ? p.roll : 90);
      else if (self.currentWeapon === 'ironAxe') self.placeIronAxe(p.roll !== undefined ? p.roll : 90);
      else if (self.currentWeapon === 'ironPickaxe') self.placeIronPick(p.roll !== undefined ? p.roll : 90);
      else if (self.currentWeapon === 'mace' && self.mace) self.placeMace(p.roll !== undefined ? p.roll : 90);   // ✅ v0.4.40 булава
      else if (self.currentWeapon === 'plan' && self.plan) self.placePlan(p.roll !== undefined ? p.roll : 90);
      else if (self.currentWeapon === 'revolver' && self.revolver) self.placeRevolver();
      else if (self.currentWeapon === 'shotgun' && self.shotgun) self.placeShotgun();
      else if (self.currentWeapon === 'rev3x' && self.rev3x) self.placeRev3x();
      else if (self.currentWeapon === 'c4' && self.c4) self.placeC4();   // ✅ v0.4.41 С4 — по центру между кистями
    };
  };

  /* ---------- видимость: в 1-м лице только руки (материал *arms*) ---------- */
  FirstPersonPlayer.prototype._applyVisibility = function (showArms) {
    if (!this.model || !this.meshes) return;
    this.visible = showArms;
    for (var i = 0; i < this.meshes.length; i++) {
      var m = this.meshes[i];
      var mn = (m.material && m.material.name) || '';
      var isArm = /arms/i.test(mn);
      if (this._firstPerson) m.visible = showArms && isArm;
      else m.visible = showArms;
    }
  };

  /** ✅ Выбор оружия: 'axe' | 'pickaxe' (каменная) | 'ironPickaxe' (железная) |
   *  'ironAxe' (железный топор, v0.2.9) | 'revolver' (v0.4.5) | null */
  /* ✅ v0.4.6: текстура ватмана — голубая бумага, белая сетка-чертёж,
     эскиз домика (фундамент/стены/потолок) и штамп «BRIX» в углу */
  FirstPersonPlayer.prototype._makePlanTexture = function () {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 192;
    var x = c.getContext('2d');
    x.fillStyle = '#9db6c9';
    x.fillRect(0, 0, 256, 192);
    // лёгкие возрастные пятна
    for (var i = 0; i < 14; i++) {
      x.fillStyle = 'rgba(120,140,155,' + (0.05 + Math.random() * 0.08).toFixed(3) + ')';
      x.beginPath();
      x.arc(Math.random() * 256, Math.random() * 192, 6 + Math.random() * 22, 0, Math.PI * 2);
      x.fill();
    }
    // белая сетка чертежа
    x.strokeStyle = 'rgba(255,255,255,0.5)';
    x.lineWidth = 1;
    for (var gx = 0; gx <= 256; gx += 16) {
      x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, 192); x.stroke();
    }
    for (var gy = 0; gy <= 192; gy += 16) {
      x.beginPath(); x.moveTo(0, gy); x.lineTo(256, gy); x.stroke();
    }
    x.strokeStyle = 'rgba(255,255,255,0.8)';
    for (var g4 = 0; g4 <= 256; g4 += 64) {
      x.beginPath(); x.moveTo(g4, 0); x.lineTo(g4, 192); x.stroke();
      x.beginPath(); x.moveTo(0, g4); x.lineTo(256, g4); x.stroke();
    }
    // эскиз домика: фундамент (штриховка), стены, крыша-потолок
    x.strokeStyle = 'rgba(255,255,255,0.95)';
    x.lineWidth = 2;
    x.strokeRect(84, 92, 88, 44);                       // стены
    x.beginPath();                                      // крыша/потолок
    x.moveTo(84, 92); x.lineTo(128, 62); x.lineTo(172, 92); x.stroke();
    x.lineWidth = 1;
    for (var hx = 86; hx < 172; hx += 8) {              // штриховка фундамента
      x.beginPath(); x.moveTo(hx, 136); x.lineTo(hx + 6, 142); x.stroke();
    }
    x.strokeRect(84, 136, 88, 6);                       // фундамент
    x.strokeRect(118, 110, 18, 26);                     // дверь
    // штамп
    x.fillStyle = 'rgba(255,255,255,0.9)';
    x.font = 'bold 13px Consolas,monospace';
    x.fillText('BRIX', 14, 26);
    x.font = '9px Consolas,monospace';
    x.fillText('FOUNDATION / WALL / CEILING', 14, 40);
    var t = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace !== undefined) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };

  FirstPersonPlayer.prototype.setWeapon = function (type) {
    this.currentWeapon = type || 'none';
    var showArms = this.currentWeapon === 'axe' ||
                   this.currentWeapon === 'pickaxe' ||
                   this.currentWeapon === 'ironPickaxe' ||
                   this.currentWeapon === 'ironAxe' ||
                   this.currentWeapon === 'mace' ||   // ✅ v0.4.40 булава
                   this.currentWeapon === 'c4' ||     // ✅ v0.4.41 С4
                   this.currentWeapon === 'plan' ||
                   this.currentWeapon === 'revolver' ||
                   this.currentWeapon === 'shotgun' ||
                   this.currentWeapon === 'rifle' ||
                   this.currentWeapon === 'smg' ||   // ✅ v0.4.35 томпсон
                   this.currentWeapon === 'rev3x';   // ✅ v0.4.36 револьвер-карабин 3×
    // запоминаем состояние ВСЕГДА: если модели ещё грузятся,
    // оно применится в _init после загрузки
    this.visible = showArms;
    this._swingType = null;
    this._aiming = false;
    this._aimBlend = 0;
    if (!this.model || !this.meshes) return;
    this._applyVisibility(showArms);
    if (this.axe) this.axe.holder.visible = showArms && this.currentWeapon === 'axe';
    if (this.stonePick) this.stonePick.holder.visible = showArms && this.currentWeapon === 'pickaxe';
    if (this.ironPick) this.ironPick.holder.visible = showArms && this.currentWeapon === 'ironPickaxe';
    if (this.ironAxe) this.ironAxe.holder.visible = showArms && this.currentWeapon === 'ironAxe';
    if (this.mace) this.mace.holder.visible = showArms && this.currentWeapon === 'mace';   // ✅ v0.4.40
    if (this.c4) this.c4.holder.visible = showArms && this.currentWeapon === 'c4';   // ✅ v0.4.41
    if (this.plan) this.plan.holder.visible = showArms && this.currentWeapon === 'plan';
    if (this.revolver) this.revolver.holder.visible = showArms && this.currentWeapon === 'revolver';
    if (this.shotgun) this.shotgun.holder.visible = showArms && this.currentWeapon === 'shotgun';
    if (this.rev3x) this.rev3x.holder.visible = showArms && this.currentWeapon === 'rev3x';
    if (this.rifle) {
      // ✅ v0.4.35: в «ружейном» holder живут И калаш, И томпсон —
      // показываем holder для обоих, модель выбираем по текущему оружию
      var isGun = this.currentWeapon === 'rifle' || this.currentWeapon === 'smg';
      this.rifle.holder.visible = showArms && isGun;
      if (isGun) this._setRifleModel(this.currentWeapon === 'smg' ? 'tp' : 'ak');
    }
    /* ✅ v0.4.25 СКИН: при выборе железной кирки накладываем обёртку
       скина (если надет), при выборе другого оружия — обычная модель */
    if (window.BrixWeaponSkins) {
      var skinWrap = this.currentWeapon === 'ironPickaxe'
        ? BrixWeaponSkins.wrapFor('ironPickaxe') : null;
      this.applySkin(skinWrap);
    }
  };

  /* ✅ v0.4.25 СКИН ОРУЖИЯ: накладывает UV-обёртку (текстуру) на модель
   *  железной кирки в руках (или возвращает родную). url === null — снять.
   *  Текстура грузится один раз и кэшируется по адресу; повторный вызов
   *  с тем же url не перекрашивает модель заново */
  FirstPersonPlayer.prototype.applySkin = function (url) {
    var self = this;
    if (!this.ironPick) { this._skinPending = url || null; return; }
    if (this._skinUrl === (url || null)) return;   // ничего не изменилось
    this._skinUrl = url || null;
    var token = (this._skinToken = (this._skinToken || 0) + 1);
    var proto = this.ironPick.wrap && this.ironPick.wrap.children[0];
    if (!proto) return;
    // вернуть родные карты/цвета
    proto.traverse(function (o) {
      if (!o.isMesh || !o.material) return;
      var mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(function (m) {
        if (m.userData._origMap === undefined) {
          m.userData._origMap = m.map || null;
          m.userData._origColor = m.color ? m.color.getHex() : 0xffffff;
        }
        m.map = m.userData._origMap;
        if (m.color) m.color.setHex(m.userData._origColor);
        m.needsUpdate = true;
      });
    });
    if (!url) return;
    // грузим обёртку и накладываем
    var loader = new THREE.TextureLoader();
    loader.load(url, function (tex) {
      if (self._skinToken !== token) return;      // пока грузили — скин сменили
      if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      proto.traverse(function (o) {
        if (!o.isMesh || !o.material) return;
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(function (m) {
          m.map = tex;                             // обёртка на все части кирки
          if (m.color) m.color.setHex(0xffffff);   // белый цвет — текстура не темнит
          m.needsUpdate = true;
        });
      });
      console.log('[BrixFirstPerson] скин кирки надет: ' + url);
    }, undefined, function () {
      console.warn('[BrixFirstPerson] обёртка скина не загрузилась: ' + url);
    });
  };

  /** ✅ v0.4.5 ОТДАЧА: проиграть анимацию выстрела (короткий кик руки).
   *  ✅ v0.4.19: у дробовика своя, более тяжёлая отдача */
  FirstPersonPlayer.prototype.playShoot = function () {
    if (!this.loaded || !this.visible) return;
    if (this.currentWeapon === 'revolver' || this.currentWeapon === 'rev3x') {
      // ✅ v0.4.36: у револьвера-карабина та же отдача рук, что у револьвера
      this._swingType = 'shoot';
      this._animTime = 0;
    } else if (this.currentWeapon === 'shotgun') {
      this._swingType = 'shootSg';
      this._animTime = 0;
    } else if (this.currentWeapon === 'rifle' || this.currentWeapon === 'smg') {
      // ✅ v0.4.21 отдача КАЛАША — пружина + зигзаг по паттерну (как в репозитории):
      // ствол уводит вбок-вверх по очереди, чтобы автомат не «пилил» в одну точку
      // ✅ v0.4.35: томпсон — та же отдача, чуть мягче (пуля слабее)
      var kick = this.currentWeapon === 'smg' ? 0.42 : 0.55;
      this._shotCount = (this._shotCount || 0) + 1;
      var pk = AK_RECOIL_PATTERN[(this._shotCount - 1) % AK_RECOIL_PATTERN.length];
      this._recSide = pk[0]; this._recVert = pk[1];
      this._rec = Math.min(1.8, (this._rec || 0) + kick + Math.random() * 0.2);
      this._shake = Math.min((this._shake || 0) + 0.45, 1.2);
    }
  };

  /** ✅ v0.4.5 ПЕРЕЗАРЯДКА: опустить оружие вниз и вернуть (2.2 с револьвер,
   *  2.6 с дробовик — v0.4.19) */
  FirstPersonPlayer.prototype.playReload = function () {
    if (!this.loaded || !this.visible) return;
    if (this.currentWeapon === 'revolver' || this.currentWeapon === 'rev3x') {
      // ✅ v0.4.36: у револьвера-карабина та же перезарядка (барабан), что у револьвера
      this._swingType = 'reload';
      this._animTime = 0;
      this._aiming = false;
    } else if (this.currentWeapon === 'shotgun') {
      this._swingType = 'reloadSg';
      this._animTime = 0;
      this._aiming = false;
    } else if (this.currentWeapon === 'rifle' || this.currentWeapon === 'smg') {
      // ✅ v0.4.21 перезарядка калаша — автомат уходит вниз-влево (магазин)
      // ✅ v0.4.35: томпсон — та же анимация, своя длительность (звук 3.7 с)
      this._rifleReload = true;
      this._rifleReloadT = 0;
      this._aiming = false;
    }
  };

  /** ✅ v0.4.5 ПРИЦЕЛИВАНИЕ (ПКМ): on=true — плавно подводим к глазам */
  FirstPersonPlayer.prototype.setAim = function (on) {
    this._aiming = !!on;
  };

  /** прогресс прицеливания 0..1 — gameworld плавно жмёт FOV камеры */
  FirstPersonPlayer.prototype.aimProgress = function () {
    return this._aimBlend || 0;
  };

  /** v=true — топор в руке (выбран в хотбаре), false — руки скрыты (совместимость) */
  FirstPersonPlayer.prototype.setVisible = function (v) {
    this.setWeapon(v ? 'axe' : null);
  };

  /** triggerSwing('atk1'|'atk2') — как в репозитории */
  FirstPersonPlayer.prototype.triggerSwing = function (type) {
    if (!this.loaded || !this.visible) return;
    if (!CL[type]) return;
    this._swingType = type;
    this._animTime = 0;
  };

  /** ✅ v0.4.21 БЕГ: бег игрока — автомат прижимается к груди (setRunning из gameworld) */
  FirstPersonPlayer.prototype.setRunning = function (v) {
    this._isRunning = !!v;
  };

  /** ✅ v0.4.21 ПОЗА КАЛАША (порт _gunPose из репозитория -glm):
   *  idle ↔ БЕГ (автомат прижат к груди) ↔ прицел (ПКМ) + пружина отдачи,
   *  зигзаг по паттерну, дрожь кистей и перезарядка (дуло вниз-влево) */
  FirstPersonPlayer.prototype._riflePose = function (dt) {
    // ✅ v0.4.35: конфиг по оружию (калаш/томпсон) — ADS и перезарядка
    var A = RIFLE_CFGS[this.rifle && this.rifle.kind === 'tp' ? 'tp' : 'ak'].ads;
    var reloadDur = RIFLE_CFGS[this.rifle && this.rifle.kind === 'tp' ? 'tp' : 'ak'].reloadDur;
    var t = this._clock;
    var sm1 = function (cur, tgt, rate) {
      var n = cur + (tgt - cur) * (1 - Math.exp(-rate * dt));
      return Math.abs(n - tgt) < 0.002 ? tgt : n;
    };
    var wantAds = this._aiming && !this._isRunning && !this._rifleReload;
    this._ads = sm1(this._ads, wantAds ? 1 : 0, A.speed);
    this._runW = sm1(this._runW, this._isRunning ? 1 : 0, 9);

    // пружина отдачи: лёгкий «пинок» назад и мягкий возврат с отскоком
    var h = Math.min(dt, 1 / 30) / 2;
    for (var i = 0; i < 2; i++) {
      this._recV += (-420 * this._rec - 26 * this._recV) * h;
      this._rec += this._recV * h;
    }
    this._rec = Math.max(-0.4, Math.min(1.8, this._rec));
    this._shake *= Math.exp(-dt * 7);

    // перезарядка: фаза 0..1 — автомат уходит вниз-влево и возвращается
    var relDip = 0;
    if (this._rifleReload) {
      this._rifleReloadT += dt;
      var rp = Math.min(1, this._rifleReloadT / reloadDur);
      if (rp >= 1) this._rifleReload = false;
      else relDip = rp < 0.2 ? rp / 0.2 : rp > 0.85 ? Math.max(0, (1 - rp) / 0.15) : 1;
    }

    var idle = Object.assign({}, FIDLE_AK);
    idle.sx += Math.sin(t * 1.8) * 0.8;   // дыхание в покое
    idle.sy += Math.sin(t * 1.5) * 0.5;
    var run = Object.assign({}, F_RUN_AK);
    run.sx += Math.sin(t * 8) * 1.2;      // покачивание при беге
    run.gpitch += Math.sin(t * 8) * 1.2;
    run.gyaw += Math.cos(t * 4) * 1.0;
    var p = lerpP(idle, run, this._runW);

    var ads = this._ads;
    p.ads = ads;
    p.sx *= (1 - 0.8 * ads); p.sy *= (1 - 0.8 * ads);

    // дрожь: сумма двух синусов; отдача — по осям камеры + перезарядка
    var tr = function (f1, f2, ph) { return Math.sin(t * f1 + ph) + 0.6 * Math.sin(t * f2 + ph * 1.7); };
    var rec = this._rec, sh = this._shake, damp = 1 - 0.5 * ads;
    var recVert = this._recVert || 1.0, recSide = this._recSide || 0;
    p.oz = (-0.018 * rec + 0.0025 * sh * tr(23, 37, 2.1)) * damp - 0.08 * relDip;
    p.oy = (0.004 * rec + 0.0022 * sh * tr(29, 41, 0.8)) * damp + Math.sin(t * 1.6) * 0.0012 * ads;
    p.ox = (0.0022 * sh * tr(31, 43, 1.7)) * damp;
    p.ppitch = (0.55 * recVert * rec + 0.35 * sh * tr(27, 39, 0.3)) * damp + 4 * relDip;
    p.pyaw = (0.45 * recSide * rec + 0.30 * sh * tr(25, 35, 1.1)) * damp;
    p.proll = (0.40 * sh * tr(21, 33, 2.6) + 0.15 * recSide * rec) * damp + 8 * relDip;
    p.ljx = 0.0035 * sh * tr(33, 47, 0.9);
    p.ljy = 0.0030 * sh * tr(26, 45, 2.2);
    p.ljz = 0.0020 * sh * tr(30, 40, 1.4);
    // перезарядка: ствол явно вниз-влево (gw-рамка, как при беге)
    if (relDip > 0) {
      p.gw = 1;
      p.gyaw = p.gyaw + (-34 - p.gyaw) * relDip;
      p.gpitch = p.gpitch + (-26 - p.gpitch) * relDip;
    }
    return p;
  };

  /** обновление позы каждый кадр (без рендера) */
  FirstPersonPlayer.prototype.update = function (dt, opts) {
    if (!this.loaded) return;
    this._clock += dt;

    // ✅ v0.4.5: покой зависит от оружия — с револьвером своя стойка
    // ✅ v0.4.19: та же стойка с дробовиком
    // ✅ v0.4.36: и с револьвером-карабином 3× (хват как у револьвера)
    // ✅ v0.4.21: у КАЛАША своя машина поз (idle↔бег↔прицел+отдача)
    var idle;
    if (this.currentWeapon === 'revolver' || this.currentWeapon === 'shotgun' ||
        this.currentWeapon === 'rev3x') idle = FIDLE_REV;
    else if (this.currentWeapon === 'mace') idle = FIDLE_MACE;   // ✅ v0.4.40 булава
    else if (this.currentWeapon === 'c4') idle = FIDLE_C4;       // ✅ v0.4.41 С4
    else idle = FIDLE_AXE;

    // ✅ v0.4.5 ПРИЦЕЛИВАНИЕ: плавно 0..1 (не мгновенно). Прицел работает
    // с револьвером И дробовиком в руках и пока не играет выстрел/перезарядка
    // (у калаша свой ADS — см. _riflePose)
    // ✅ v0.4.22: НА БЕГУ прицела нет — оружие прижато к груди
    // ✅ v0.4.36: и с револьвером-карабином (в прицеле — оптика 3×)
    var wantAim = this._aiming &&
      (this.currentWeapon === 'revolver' || this.currentWeapon === 'shotgun' ||
       this.currentWeapon === 'rev3x') &&
      !this._swingType && !this._isRunning;
    this._aimBlend += ((wantAim ? 1 : 0) - this._aimBlend) * Math.min(1, dt * 9);
    if (this._aimBlend < 0.002) this._aimBlend = 0;

    var p;
    if (this.currentWeapon === 'rifle' || this.currentWeapon === 'smg') {
      p = this._riflePose(dt);
    } else if (this._swingType) {
      var c = CL[this._swingType];
      this._animTime += dt;
      if (this._animTime >= c.dur) {
        this._swingType = null;
        p = Object.assign({}, idle);
      } else {
        p = sample(c.keys, Math.max(0, this._animTime) / c.dur);
      }
    } else {
      /* ✅ v0.4.22: сглаживание бега для револьвера/дробовика/инструментов
         (у калаша своё — в _riflePose) */
      this._runW += ((this._isRunning ? 1 : 0) - this._runW) * Math.min(1, dt * 9);
      if (this._runW < 0.002) this._runW = 0;
      p = Object.assign({}, idle);
      p.sx += Math.sin(this._clock * 1.8) * 0.8; // дыхание в покое
      if ((this.currentWeapon === 'revolver' || this.currentWeapon === 'shotgun' ||
           this.currentWeapon === 'rev3x') &&
          this._runW > 0) {
        var runP = Object.assign({}, F_RUN_GUN);
        runP.sx += Math.sin(this._clock * 8) * 1.2;   // покачивание при беге
        p = lerpP(p, runP, this._runW);
      }
    }

    // прицеливание накладывается ПОВЕРХ (лёгкий лер): даже во время
    // отдачи револьвер остаётся у глаз
    if (this._aimBlend > 0) p = lerpP(p, FPOSE_AIM, this._aimBlend);

    this.pose(p, true);
  };

  /** рендер рук ПОВЕРХ мира (вызывать после renderer.render(scene, camera)) */
  FirstPersonPlayer.prototype.renderOverlay = function () {
    if (!this.loaded || !this.visible) return;
    if (!this.renderer) return;

    // ✅ v0.4.5: при прицеливании камера рук чуть поднимается (смотрим
    // поверх револьвера) — плавно, вместе с позой
    var aim = this._aimBlend || 0;
    HANDS_CAM_POS.set(0, 1.7 - 0.05 * aim, 0);
    HANDS_CAM_TARGET.set(0, CAM_TARGET_Y + 0.40 * aim, 5);
    this.handsCamera.position.copy(HANDS_CAM_POS);
    this.handsCamera.up.set(0, 1, 0);
    this.handsCamera.lookAt(HANDS_CAM_TARGET);
    // ✅ v0.4.21: рамка камеры обновляется КАЖДЫЙ кадр — прицел калаша
    // (линия целик→мушка) считается от живой камеры
    var cf = HANDS_CAM_TARGET.clone().sub(HANDS_CAM_POS).normalize();
    var cr = new THREE.Vector3().crossVectors(cf, new THREE.Vector3(0, 1, 0)).normalize();
    var cu = new THREE.Vector3().crossVectors(cr, cf).normalize();
    this.camFrame = { pos: HANDS_CAM_POS.clone(), f: cf, u: cu, r: cr };
    // ✅ v0.4.21: при прицеливании калаша камера рук сужает FOV (74 → 55,
    // как в репозитории) — мушка и целик крупнее (у томпсона — свой)
    this.handsCamera.fov = 74;
    if (this.currentWeapon === 'rifle' || this.currentWeapon === 'smg') {
      var adsFov = RIFLE_CFGS[this.rifle && this.rifle.kind === 'tp' ? 'tp' : 'ak'].ads.fov;
      this.handsCamera.fov = 74 + (adsFov - 74) * (this._ads || 0);
    }
    this.handsCamera.aspect = this.camera.aspect;
    this.handsCamera.near = 0.02;
    this.handsCamera.far = 200;
    this.handsCamera.updateProjectionMatrix();

    var prevAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.setRenderTarget(null);
    this.renderer.clearDepth();
    this.renderer.render(this.handsScene, this.handsCamera);
    this.renderer.autoClear = prevAutoClear;
  };

  FirstPersonPlayer.prototype.dispose = function () {
    var self = this;
    if (this.model && this.model.parent) this.model.parent.remove(this.model);
    if (this.handsScene) {
      this.handsScene.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          var mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(function (m) { m.dispose(); });
        }
      });
      while (this.handsScene.children.length) this.handsScene.remove(this.handsScene.children[0]);
    }
    this.model = null;
    this.axe = null;
    this.axeHolder = null;
    this.stonePick = null;
    this.ironPick = null;
    this.ironAxe = null;
    this.revolver = null;
    this.shotgun = null;
    this.rev3x = null;
    this.rifle = null;
    this.c4 = null;
    this.pickaxeHolder = null;
    this.bones = null;
    this.loaded = false;
    this.visible = false;
  };

  // ✅ v0.4.25 безопасный запрос обёртки скина (модуль может быть не загружен)
  function BrixWeaponSkinUrlSafe() {
    try {
      return window.BrixWeaponSkins ? BrixWeaponSkins.wrapFor('ironPickaxe') : null;
    } catch (e) { return null; }
  }

  FirstPersonPlayer.REV = REV;   // настройка револьвера из консоли: BrixFirstPerson.REV.len = 0.34
  FirstPersonPlayer.SGN = SGN;   // ✅ v0.4.19 настройка дробовика: BrixFirstPerson.SGN.len = 0.56
  // ✅ v0.4.36 настройка РЕВОЛЬВЕРА-КАРАБИНА 3× из консоли (F12):
  //   BrixFirstPerson.RVX.len = 0.8 · BrixFirstPerson.RVX.pitch = -4
  //   BrixFirstPerson.RVX.flip = true (если ствол вдруг смотрит назад)
  FirstPersonPlayer.RVX = RVX;
  // ✅ v0.4.21 настройка КАЛАША из консоли (F12): BrixFirstPerson.AK.sS = 0.9
  FirstPersonPlayer.AK = GRIP_AK;
  FirstPersonPlayer.AK_LEFT = GRIP_AK_LEFT;   // левая рука на цевье
  FirstPersonPlayer.AK_ADS = ADS_AK;          // прицел (целик/мушка/FOV)
  // ✅ v0.4.35 настройка ТОМПСОНА из консоли (F12):
  //   BrixFirstPerson.TP.sS = 0.9 · BrixFirstPerson.TP_LEFT.yPref = -190
  //   BrixFirstPerson.TP_ADS.dist = 0.9 · BrixFirstPerson.TP_LEN = 0.8
  FirstPersonPlayer.TP = GRIP_TP;
  FirstPersonPlayer.TP_LEFT = GRIP_TP_LEFT;   // левая рука на цевье
  FirstPersonPlayer.TP_ADS = ADS_TP;          // прицел (целик/мушка/FOV)
  FirstPersonPlayer.TP_LEN = TP_LEN;
  FirstPersonPlayer.TP_CFG = RIFLE_CFGS.tp;   // весь конфиг разом
  // ✅ v0.4.40 настройка БУЛАВЫ из консоли (F12):
  //   BrixFirstPerson.MACE.len = 0.86 (длина в руке, м)
  //   BrixFirstPerson.MACE.yaw = 0  (доворот головы булавы, град)
  FirstPersonPlayer.MACE = MACE;
  // ✅ v0.4.41 настройка С4 из консоли (F12):
  //   BrixFirstPerson.C4.len = 0.4 · BrixFirstPerson.C4.oy = -0.05
  //   BrixFirstPerson.C4.yaw = 180 (если блок повернулся спиной)
  FirstPersonPlayer.C4 = C4;
  FirstPersonPlayer.C4G = C4G;   // левая кисть относительно правой
  return FirstPersonPlayer;
})();