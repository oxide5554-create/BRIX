// ============================================================
//  brix • js/data/news.js
//  Новости проекта. Даты соответствуют демо-сборке 13.11.2026.
//  Полный перенос из data/news.ts.
// ============================================================
window.BrixData = window.BrixData || {};

window.BrixData.NEWS = [
  {
    id: 'n-beta',
    date: '13.11.2026',
    tag: 'event',
    title: {
      ru: 'Бета-тест BRIX уже запущен — присоединяйтесь',
      en: 'The BRIX beta test is live — join now'
    },
    excerpt: {
      ru: 'Бета-тест начался: главное меню, тестовый сервер ADMIN и реальная загрузка мира уже реализованы и работают.',
      en: 'The beta has started: the main menu, the ADMIN test server and real world loading are already implemented and working.'
    },
    body: {
      ru: [
        'Здравствуйте, выжившие! Мы открыли бета-тест BRIX — вы можете играть прямо сейчас. Уже реализовано и работает: главное меню с живым 3D-фоном, панель серверов ADMIN с тестовым сервером среднего размера, реальная загрузка мира при подключении и полноценный 3D-ландшафт с горами, холмами и озером.',
        'Мир Brixland сгенерирован процедурно: снежные вершины, леса, кусты и камни расставляются при каждом подключении. Перемещение от первого лица уже в игре: WASD, бег и прыжок. Графика настроена на среднюю — чёткую и быструю.',
        'Помните: это бета-тест, поэтому в игре будут встречаться баги, вылеты и недоработки — это нормально. Все найденные проблемы сообщайте разработчику: каждая ошибка делает игру лучше. Сохранения меню хранятся локально и могут сбрасываться между версиями.'
      ],
      en: [
        'Hello, survivors! The BRIX beta test is open — you can play right now. Already implemented and working: the main menu with a live 3D background, the ADMIN server panel with a medium-size test server, real world loading on connect and a full 3D landscape with mountains, hills and a lake.',
        'The Brixland world is procedurally generated: snowy peaks, forests, bushes and rocks are placed on every connect. First-person movement is already in the game: WASD, sprint and jump. Graphics are set to medium — crisp and fast.',
        'Remember: this is a beta test, so the game will have bugs, crashes and unfinished parts — that is normal. Report every issue you find to the developer: each bug report makes the game better. Menu saves are stored locally and may reset between versions.'
      ]
    }
  },
  {
    id: 'n-wipe',
    date: '13.11.2026',
    tag: 'update',
    title: {
      ru: 'Патч 0.1.1 — главное меню нового поколения',
      en: 'Patch 0.1.1 — next-gen main menu'
    },
    excerpt: {
      ru: 'Полностью переработанное меню: живой 3D-фон, браузер серверов, список друзей и магазин скинов. Первый шаг на пути к игре.',
      en: 'A fully rebuilt menu: live 3D background, server browser, friends list and a skin store. The first step towards the game.'
    },
    body: {
      ru: [
        'Мы начали большой путь: сегодня выходит первый этап проекта — новое главное меню. Оно построено на живой 3D-сцене с туманом, мерцающим фонарём и пылью в воздухе, а навигация повторяет классику жанра: слева вертикальный список разделов, справа — панели экранов.',
        'В браузере серверов появились категории «Официальные», «Сообщество», «Модифицированные», «Друзья», «Избранное» и «История», фильтры полных и офлайн-серверов, поиск и подключение с пошаговым прогрессом.',
        'Списки друзей и магазин скинов работают в демо-режиме: статусы, покупки и настройки сохраняются локально. В следующем этапе мы начнём прототип игровой сцены — базовое строительство и перемещение от первого лица.'
      ],
      en: [
        'A big journey has begun: today we ship the first stage of the project — the new main menu. It is built on a live 3D scene with fog, a flickering lantern and dust in the air; navigation follows the genre classic: a vertical section list on the left and screen panels on the right.',
        'The server browser now features Official, Community, Modded, Friends, Favourited and History categories, filters for full and offline servers, search and step-by-step connection progress.',
        'The friends list and the skin store run in demo mode: statuses, purchases and settings are stored locally. In the next stage we will start prototyping the gameplay scene — basic building and first-person movement.'
      ]
    }
  },
  {
    id: 'n-event',
    date: '11.11.2026',
    tag: 'event',
    title: {
      ru: 'Ивент «Кровавая луна» — старт в пятницу',
      en: '“Blood Moon” event starts on Friday'
    },
    excerpt: {
      ru: 'На всех официальных серверах в выходные усилены ночные рейды NPC, а за участие дадут эксклюзивный скин фонаря.',
      en: 'All official servers get boosted NPC night raids this weekend; participants earn an exclusive lantern skin.'
    },
    body: {
      ru: [
        'В пятницу, субботу и воскресенье с 20:00 до 23:00 по московскому времени на официальных серверах будет действовать режим «Кровавая луна»: NPC-рейдеры становятся агрессивнее, а редкость лута ночью повышается на один уровень.',
        'Каждый выживший, который продержится хотя бы одну полную ночь под луной, получит скин «Медный фонарь» — он появится в разделе «Скины» автоматически.',
        'Участвовать можно соло или группой. Награда выдаётся один раз за аккаунт.'
      ],
      en: [
        'On Friday, Saturday and Sunday from 20:00 to 23:00 MSK, official servers run the “Blood Moon” mode: NPC raiders turn more aggressive and night loot rarity goes up one tier.',
        'Every survivor who lasts at least one full night under the moon receives the “Copper Lantern” skin — it will appear in the “Skins” section automatically.',
        'You can participate solo or in a group. The reward is granted once per account.'
      ]
    }
  },
  {
    id: 'n-devblog',
    date: '07.11.2026',
    tag: 'devblog',
    title: {
      ru: 'Девблог №4: система строительства',
      en: 'Devblog #4: the building system'
    },
    excerpt: {
      ru: 'Рассказываем, как будет работать фундамент, стабильность построек и апгрейд стен: дерево → камень → металл.',
      en: 'How foundations, building stability and wall upgrades will work: wood → stone → metal.'
    },
    body: {
      ru: [
        'Строительство начнётся с фундамента: любой дом обязан опираться на устойчивое основание. Мы тестируем модель, в которой перекрытия распределяют нагрузку по опорам, а обрушение происходит только при разрушении ключевых опор.',
        'Апгрейд стен — три ступени: дерево, камень, металл. Каждая ступень требует собственного инструмента и времени. Штормовые события будут проверять прочность крыш.',
        'В демо-версии меню уже можно видеть заготовку под эту систему: экран загрузки «ИГРАТЬ» показывает этапы генерации мира, которые в будущем будут создавать процедурные биомы.'
      ],
      en: [
        'Building will start with a foundation: every base must rest on stable ground. We are testing a model where ceilings distribute load across supports and collapse happens only when key supports are destroyed.',
        'Wall upgrades have three tiers: wood, stone, metal. Each tier requires its own tool and time. Storm events will test roof durability.',
        'The menu demo already shows a stub of this system: the “PLAY GAME” loading screen displays world generation stages that will later build procedural biomes.'
      ]
    }
  },
  {
    id: 'n-store',
    date: '05.11.2026',
    tag: 'store',
    title: {
      ru: 'В магазин скинов прибыли осенние наборы',
      en: 'Autumn bundles arrive at the skin store'
    },
    excerpt: {
      ru: '«Ржавый ветер» и «Костяная бронза» — 12 новых раскрасок для инструментов и брони. Скины не влияют на баланс.',
      en: '“Rusty Wind” and “Bone Bronze” — 12 new finishes for tools and armour. Skins do not affect balance.'
    },
    body: {
      ru: [
        'В раздел «Скины» добавлены две коллекции: «Ржавый ветер» — матовые цвета выцветшего металла, и «Костяная бронза» — тёплые оттенки с следами эксплуатации.',
        'Все скины декоративные: они меняют только внешний вид предметов. В демо-режиме покупки оплачиваются монетами, начисленными на аккаунт.',
        'Наборы доступны до конца месяца, потом попадут в ротацию обычного магазина.'
      ],
      en: [
        'Two collections join the “Skins” section: “Rusty Wind” — matte shades of faded metal, and “Bone Bronze” — warm tones with wear marks.',
        'All skins are decorative: they only change how items look. In demo mode purchases are paid with coins credited to your account.',
        'The bundles stay until the end of the month, then rotate into the regular store.'
      ]
    }
  },
  {
    id: 'n-server',
    date: '02.11.2026',
    tag: 'update',
    title: {
      ru: 'Официальные сервера: новый античит и вайпы',
      en: 'Official servers: new anti-cheat and wipes'
    },
    excerpt: {
      ru: 'Переход на античит нового поколения и единый график вайпов: первая пятница месяца, 14:00 МСК.',
      en: 'Moving to a new-generation anti-cheat and a single wipe schedule: first Friday of the month, 14:00 MSK.'
    },
    body: {
      ru: [
        'Мы завершаем тестирование античита нового поколения. Он работает на стороне сервера и не требует установки дополнительных драйверов. Первые недели — мягкий режим: подозрительные матчи только помечаются.',
        'С 1 декабря все официальные сервера переходят на единый график вайпов: первая пятница месяца в 14:00 МСК. Расписание появится в браузере серверов рядом с каждым сервером.',
        'Спасибо всем, кто присылал репорты — они помогают быстрее находить уязвимости.'
      ],
      en: [
        'We are finishing the testing of a new-generation anti-cheat. It runs server-side and requires no extra drivers. The first weeks are soft-mode: suspicious matches are only flagged.',
        'From December 1, all official servers move to a single wipe schedule: the first Friday of the month at 14:00 MSK. The schedule will appear next to each server in the browser.',
        'Thanks to everyone submitting reports — they help find vulnerabilities faster.'
      ]
    }
  }
];
