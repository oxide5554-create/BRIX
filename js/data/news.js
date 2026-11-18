// ============================================================
//  brix • js/data/news.js
//  Новости проекта. Даты соответствуют демо-сборке 13.11.2026.
//  Полный перенос из data/news.ts.
// ============================================================
window.BrixData = window.BrixData || {};

window.BrixData.NEWS = [
  {
    id: 'n-craft',
    date: '18.11.2026',
    tag: 'update',
    title: {
      ru: 'Патч 0.4.25 — КРАФТ НА Q (как в Rust) и первый СКИН кирки',
      en: 'Patch 0.4.25 — CRAFT on Q (Rust-style) and the first pickaxe SKIN'
    },
    excerpt: {
      ru: 'Нажми Q в игре — откроется крафт-панель как в Rust: слева превью с таблицей ресурсов, справа чертежи с вкладками. 10 рецептов: каменные и железные топор/кирка, план строителя, калаш, дробовик, револьвер, трубы и пружины. Плюс система скинов: скин «Ретро» на железную кирку — пока только тест через панель разработчика (9).',
      en: 'Press Q in game — a Rust-style crafting panel opens: item preview with a resource table on the left, blueprint list with tabs on the right. 10 recipes: stone/iron axes and pickaxes, building plan, AK, shotgun, revolver, pipes and springs. Plus a skin system: the “Retro” pickaxe skin — test-only via the developer panel (9).'
    },
    body: {
      ru: [
        'КРАФТ НА Q: панель в стиле крафта Rust legacy — серые панели, оранжевые строки ресурсов, зелёная подсветка выбранного чертежа и кнопки СКАФТ. Слева: превью предмета, таблица «КОЛ-ВО / РЕСУРС / НУЖНО / ЕСТЬ» (красным — чего не хватает), поле количества с кнопками −/+ и полка ИНВЕНТАРЬ. Справа: список чертежей с вкладками ВСЕ / ИНСТРУМЕНТЫ / ОРУЖИЕ / КОМПОНЕНТЫ и счётчиком «сколько раз можно скрафтить». Пока панель открыта — управление стоит, рендер и сеть живут (как у мини-меню на M). Q или ESC закрывают.',
        'РЕЦЕПТЫ: Каменный топор — 10 дерева; Каменная кирка — 15 камня и 10 дерева; Железный топор — 20 дерева и 5 метал фрагментов; Железная кирка — 20 дерева и 5 метал фрагментов; План строителя — 5 дерева; Калаш — 1 труба, 1 корпус АК, 40 металлолома и 2 пружины; Дробовик — 2 трубы, 40 метал фрагментов и 1 пружина; Револьвер — 15 металлолома и 30 метал фрагментов; Труба — 12 метал фрагментов и 24 металлолома; Пружина — 13 метал фрагментов и 26 металлолома. Крафт мгновенный: ресурсы списываются, предмет падает в инвентарь.',
        'СИСТЕМА СКИНОВ: первый скин — кирка «Ретро» для ЖЕЛЕЗНОЙ КИРКИ (обёртка-развертка на 3D-модель в руках + иконка-рендер в хотбаре/инвентаре/лут-меню). ПОКА СКИН ВЫДАЁТСЯ ТОЛЬКО ЧЕРЕЗ ПАНЕЛЬ РАЗРАБОТЧИКА (клавиша 9, раздел «СКИНЫ (ТЕСТ)») — кнопки НАДЕТЬ/СНЯТЬ. В МАГАЗИН СКИНОВ скин НЕ добавлен — это тест, магазином займёмся потом. Выбор скина запоминается даже после перезахода.',
        'МЕЛОЧИ: цифры в поле количества крафта не дёргают слоты хотбара; при открытом крафте не работают E/M/F/9 (чтобы не открывалось поверх); server.js обновлён до v0.4.25 — замени его и ПЕРЕЗАПУСТИ сервер, иначе игра покажет «СЕРВЕР СТАРЫЙ».'
      ],
      en: [
        'CRAFT ON Q: the panel follows the legacy Rust crafting look — grey panels, orange resource lines, green highlight for the selected blueprint and the CRAFT button. Left: item preview, the “AMOUNT / ITEM TYPE / TOTAL / HAVE” table (red for missing resources), a quantity field with −/+ and an inventory shelf. Right: blueprint list with ALL / TOOLS / WEAPONS / COMPONENTS tabs and a “how many you can craft” counter. While the panel is open movement stops but rendering and networking keep running (like the M menu). Q or ESC closes it.',
        'RECIPES: Stone Axe — 10 wood; Stone Pickaxe — 15 stone and 10 wood; Iron Axe — 20 wood and 5 metal fragments; Iron Pickaxe — 20 wood and 5 metal fragments; Building Plan — 5 wood; AK — 1 pipe, 1 rifle body, 40 scrap and 2 springs; Shotgun — 2 pipes, 40 metal fragments and 1 spring; Revolver — 15 scrap and 30 metal fragments; Pipe — 12 metal fragments and 24 scrap; Spring — 13 metal fragments and 26 scrap. Crafting is instant: resources are removed and the item lands in your inventory.',
        'SKIN SYSTEM: the first skin is the “Retro” IRON PICKAXE skin (a UV wrap on the in-hands 3D model + a render icon in the hotbar/inventory/loot menu). FOR NOW THE SKIN IS ONLY AVAILABLE THROUGH THE DEVELOPER PANEL (key 9, the “SKINS (TEST)” section) — equip/remove buttons. It is NOT added to the skin shop — that comes later. The choice persists across re-logins.',
        'SMALL STUFF: digits typed into the craft quantity field no longer switch hotbar slots; E/M/F/9 do not open over the craft panel; server.js is updated to v0.4.25 — replace it and RESTART the server, otherwise the game shows “SERVER OUTDATED”.'
      ]
    }
  },
  {
    id: 'n-lighthouse',
    date: '17.11.2026',
    tag: 'update',
    title: {
      ru: 'Патч 0.4.24 — ЛОКАЦИЯ «МАЯК» на Большом озере (61, 50)',
      en: 'Patch 0.4.24 — the LIGHTHOUSE location on the Big Lake (61, 50)'
    },
    excerpt: {
      ru: 'На Большом озере у координат (61, 50) вырос остров с настоящим маяком ~70 м: кирпичная база, красно-белая башня, стеклянный фонарь с горящей лампой. Поднимись по каменной лестнице от дна озера (без прыжков), а на галерею — прыжками по каменным выступам. Наверху — палуба вокруг башни и вид на всё озеро.',
      en: 'A new island with a real ~70 m lighthouse has grown on the Big Lake at (61, 50): brick base, red-white tower, glowing lantern room. Climb the stone staircase from the lake bottom (no jumps needed), then parkour-jump the stone brackets to the gallery and walk the deck around the tower.'
    },
    body: {
      ru: [
        'МАЯК НА БОЛЬШОМ ОЗЕРЕ — новая локация у координат (61, 50): остров с маяком высотой ~70 м. Модель с полной детализацией: каменный остров с пляжем и мхом, кирпичная база с красным поясом и окнами, красно-белая башня с облупленной краской, галерея с перилами, стеклянный фонарь и ГОРЯЩАЯ лампа под красным куполом. Маяк видно с другой стороны карты — отличный ориентир.',
        'КАК ЗАБРАТЬСЯ: со стороны озера найди каменную ЛЕСТНИЦУ — 34 ступени ведут от дна озера прямо к двери базы; подниматься можно ШАГОМ, прыгать не нужно. На площадке у двери начинается ПАРКУР: 5 каменных выступов по спирали на стене — запрыгивай с одного на другой (выше — только прыжком, бегом удобнее) до самого парапета.',
        'НАВЕРХУ: по парапету шагай на ПАЛУБУ — широкое кольцо вокруг башни с видом на всё озеро и леса. Внутрь башни не пустят (как и в настоящие маяки), но круговой обзор того стоит. С палубы можно спрыгнуть в озеро — как в Rust с крыш.',
        'ФИЗИКА КАК У ПОСТРОЕК: по камню острова, ступеням, выступам, палубе и парапету можно ходить; стены и башня не пропускают. Маяк одинаковый у всех игроков (часть мира), сохранять и ставить его не нужно.'
      ],
      en: [
        'LIGHTHOUSE ON THE BIG LAKE — a new location at (61, 50): an island with a ~70 m lighthouse. Fully detailed model: rocky island with a beach and moss, brick base with a red belt and windows, red-white tower with peeling paint, a gallery with railings, a glass lantern room and a GLOWING lamp under the red dome. You can see it from across the map — a perfect landmark.',
        'HOW TO CLIMB: from the lake, find the stone STAIRCASE — 34 steps lead from the lake bottom right to the base door; you can WALK up, no jumping. At the door platform the PARKOUR starts: 5 stone brackets spiral up the wall — hop from one to the next (jumping required, sprint helps) all the way to the parapet.',
        'ON TOP: walk the parapet onto the DECK — a wide ring around the tower with a view of the whole lake and forests. The tower interior is off limits (like real lighthouses), but the 360-degree view is worth it. You can dive off the deck into the lake, Rust-style.',
        'PHYSICS LIKE BUILDINGS: you can walk the island rock, the steps, brackets, deck and parapet; the walls and the tower block movement. The lighthouse is identical for all players (part of the world) — no placing or saving needed.'
      ]
    }
  },
  {
    id: 'n-diag',
    date: '17.11.2026',
    tag: 'fix',
    title: {
      ru: 'Патч 0.4.23 — игра сама говорит, если сервер СТАРЫЙ и его надо ПЕРЕЗАПУСТИТЬ',
      en: 'Patch 0.4.23 — the game now tells you when the running server.js is outdated'
    },
    excerpt: {
      ru: 'Если «сундук не ставится», «сервер отклонил бессмертие» или «игроков нельзя убить» — почти всегда работает СТАРЫЙ server.js (заменили файл, но не перезапустили сервер). Теперь игра при подключении сравнивает версии и прямо говорит: сервер старый, перезапусти. В шапке сервера — версия, папка и админы.',
      en: 'If the chest cannot be placed, the immortality toggle is "denied" or players cannot be killed — an OLD server.js is almost always still running (file replaced, server not restarted). The client now compares versions on connect and says so directly; the server prints its version, folder and admins at startup.'
    },
    body: {
      ru: [
        'ГЛАВНОЕ ОТКРЫТИЕ: почти все «не работает» после 0.4.22 — это СТАРЫЙ server.js, который всё ещё ЗАПУЩЕН. Node.js читает server.js один раз при старте: если заменить файл и НЕ перезапустить сервер — работает старый код. Симптомы: сундук не ставится («обновите server.js» при уже заменённом файле), тумблер бессмертия пишет «сервер отклонил», игроков нельзя убить (старый сервер защищал админский BRIX-ID всегда).',
        'ЧТО ДОБАВЛЕНО: при подключении клиент сравнивает свою версию с версией сервера — если сервер старее, сразу показывает предупреждение на 15 секунд: «СЕРВЕР СТАРЫЙ: работает v0.4.17, клиент v0.4.23... перезапусти». Тумблер бессмертия при отказе объясняет ТОЧНУЮ причину: старый server.js или твой BRIX-ID не в admins.json. Сообщение про сундук тоже показывает реальную версию сервера.',
        'ШАПКА СЕРВЕРА: при старте сервер печатает ВЕРСИЮ, ПАПКУ запуска и список админов из admins.json. Проверь строку «ВЕРСИЯ СЕРВЕРА» — там должно быть v0.4.23. Если после замены файла там старая версия — ты заменил server.js НЕ в той папке (папка напечатана рядом).',
        'ЗАПОМНИ ОДНО ПРАВИЛО: заменил server.js → ОСТАНОВИ сервер (Ctrl+C в чёрном окне) → ЗАПУСТИ заново (START-MULTIPLAYER.bat). Без перезапуска ничего не меняется. /status в браузере (http://адрес:8787/status) тоже показывает версию, папку и админов.'
      ],
      en: [
        'KEY FINDING: nearly every "it does not work" after 0.4.22 is an OLD server.js still RUNNING. Node.js reads server.js once at startup: replace the file without restarting and the old code keeps running. Symptoms: chest cannot be placed ("update server.js" even though you did), the immortality toggle says "server denied", players cannot be killed (the old server always protected the admin BRIX-ID).',
        'WHAT IS NEW: on connect the client compares its version with the server version — if the server is older you immediately get a 15-second warning. The immortality toggle now explains the EXACT reason for a denial: old server.js or your BRIX-ID missing from admins.json. The chest message also shows the real server version.',
        'SERVER BANNER: at startup the server prints its VERSION, the FOLDER it runs from and the admin list from admins.json. Check the "SERVER VERSION" line — it must say v0.4.23. If it still shows an old version after replacing the file, you replaced server.js in the WRONG folder (the folder is printed next to it).',
        'ONE RULE TO REMEMBER: replaced server.js → STOP the server (Ctrl+C in the black window) → START it again (START-MULTIPLAYER.bat). Without a restart nothing changes. /status in the browser (http://address:8787/status) also shows version, folder and admins.'
      ]
    }
  },
  {
    id: 'n-chest',
    date: '17.11.2026',
    tag: 'update',
    title: {
      ru: 'Патч 0.4.22 — СУНДУК-ХРАНИЛИЩЕ, фикс бессмертия и стрельбы на бегу',
      en: 'Patch 0.4.22 — storage chest, immortality fix and no shooting while sprinting'
    },
    excerpt: {
      ru: 'Новая постройка — деревянный сундук с анимацией крышки: положи ресурсы, и они сохранятся на сервере даже после твоего выхода. Бессмертие теперь работает только при включённом тумблере, на бегу стрелять нельзя, у дробовика и револьвера — анимация бега с оружием у груди.',
      en: 'A new build — a wooden chest with a lid animation: store resources and the server keeps them even after you leave. Immortality now applies only when toggled, sprinting blocks shooting, and the shotgun/revolver got a chest-press run animation.'
    },
    body: {
      ru: [
        'СУНДУК-ХРАНИЛИЩЕ — новая деталь в плане строителя (Z). Маленький деревянный сундук с детализацией: доски, железные полосы, петли и латунная щеколда. Ставится на землю и на фундамент. Меню работает «наоборот»: один КЛИК по своему предмету — и он лежит в сундуке, клик по предмету сундука — забрать обратно.',
        'Содержимое сундука живёт НА СЕРВЕРЕ: сохраняется при перезаходе, рестарте сервера и после ВАШЕГО выхода — для всех игроков. Да, чужой игрок может украсть твои ресурсы, если найдёт сундук — как в Rust. Крышка открывается/закрывается с анимацией, и её видят все вокруг.',
        'ФИКС БЕССМЕРТИЯ: раньше сервер защищал любого игрока с админским BRIX-ID — поэтому при тесте в двух вкладках «второй игрок» не умирал никогда. Теперь бессмертие включается только тумблером «БЕСКОНЕЧНОЕ ХП» в админ-панели — обычные игроки умирают как надо.',
        'НА БЕГУ СТРЕЛЯТЬ БОЛЬШЕ НЕЛЬЗЯ: пока бежишь, оружие прижато к груди (у калаша — как было, у дробовика и револьвера добавили ту же анимацию бега — и от первого лица, и у чужих игроков). Отпусти Shift — и можно стрелять.'
      ],
      en: [
        'STORAGE CHEST — a new piece in the builder plan (Z). A small detailed wooden chest: planks, iron bands, hinges and a brass latch. Place it on the ground or on a foundation. The menu works in reverse: one CLICK on your item puts the whole stack into the chest; click a chest item to take it back.',
        'Chest contents live ON THE SERVER: they survive reconnects, server restarts and your leaving — for every player. Yes, another player can steal your resources if they find the chest, Rust-style. The lid opens/closes with an animation that everyone around can see.',
        'IMMORTALITY FIX: the server used to protect any player with the admin BRIX-ID — so in a two-tab test the "second player" was literally unkillable. Immortality now applies only while the INFINITE HP toggle is on in the admin panel — regular players die as intended.',
        'NO SHOOTING WHILE SPRINTING: while you run, the weapon presses against your chest (the AK as before; the shotgun and revolver got the same run animation — first person and for other players too). Release Shift and you can shoot again.'
      ]
    }
  },
  {
    id: 'n-ak',
    date: '17.11.2026',
    tag: 'update',
    title: {
      ru: 'Патч 0.4.21 — КАЛАШ из репозитория: хват двух рук, прицел, автоогонь',
      en: 'Patch 0.4.21 — AK rifle from the reference repo: two-hand grip, sights, full auto'
    },
    excerpt: {
      ru: 'Калаш перенесён из репозитория вместе с хватом: правая рука на рукояти, левая на цевье, ПКМ — прицел по целику и мушке, ЛКМ — автоогонь 600 в/мин, обойма 30. При беге автомат прижимается к груди.',
      en: 'The AK is ported from the reference repo with its grip: right hand on the pistol grip, left on the handguard, RMB aims down the sight line, LMB full auto at 600 rpm, 30-round mag. When sprinting, the rifle presses to your chest.'
    },
    body: {
      ru: [
        'КАЛАШ перенесён из референс-репозитория целиком: модель, хват «как в репозитории» (правая рука на пистолетной рукояти, левая привязана к цевью и не съезжает при беге и отдаче), прицеливание по линии целик→мушка (ПКМ) и отдача пружиной с зигзагом.',
        'Стрельба как у автомата: зажми ЛКМ — автоогонь 600 выстр/мин, обойма 30, урон 20 за пулю. Перезарядка по R (3.4 с) — со звуком перезарядки, который прислал игрок. Звук выстрела — оригинальный сэмпл из репозитория.',
        'При БЕГЕ автомат прижимается К ГРУДИ по диагонали — приклад у правого плеча, дуло вверх-влево (та самая анимация из репозитория). Патроны калаша — отдельный предмет; калаш и патроны можно взять в админ-панели. Другие игроки видят калаш в твоих руках.'
      ],
      en: [
        'The AK rifle is ported from the reference repo in full: the model, the exact two-hand grip (right hand on the pistol grip, left hand bound to the handguard so it never slides off while running or recoiling), RMB aiming down the rear-sight→front-sight line, and spring recoil with a zig-zag pattern.',
        'It fires like an assault rifle: hold LMB for full auto at 600 rpm, 30-round magazine, 20 damage per bullet. Reload on R (3.4 s) uses the reload sound provided by the player; the shot sound is the original sample from the repo.',
        'When SPRINTING the rifle presses diagonally against your chest — stock at the right shoulder, muzzle up-left (that exact run animation from the repo). Rifle bullets are a separate item; the AK and its ammo can be taken from the admin panel. Other players see the rifle in your hands.'
      ]
    }
  },
  {
    id: 'n-sg-fix',
    date: '17.11.2026',
    tag: 'update',
    title: {
      ru: 'Патч 0.4.20 — дробовик в одной руке + фикс перезарядки',
      en: 'Patch 0.4.20 — one-hand shotgun + reload fix'
    },
    excerpt: {
      ru: 'Дробовик теперь держит только ПРАВАЯ рука (левая убрана), и починена перезарядка по R — обойма больше не застревает на нуле при полном запасе патронов.',
      en: 'The shotgun is now held by the RIGHT hand only (the left one is gone), and the R reload is fixed — the mag no longer sticks at zero with a full ammo pool.'
    },
    body: {
      ru: [
        'Дробовик от первого лица теперь держит ТОЛЬКО правая рука — левая убрана полностью, как у железного топора. Это касается и чужих игроков: они тоже держат дробовик одной правой рукой.',
        'Починена перезарядка дробовика по клавише R. Раньше дробовик, взятый через админ-панель или из ящика, приходил в инвентарь без поля обоймы — таймер перезарядки проходил, а патроны в ствол не заряжались («2 − пусто = ошибка»). Теперь обойма создаётся сразу и заполняется как надо: 2 патрона за 2.6 секунды.',
        'Старые дробовики, уже лежащие в инвентаре, чинятся автоматически — заново брать предмет не нужно. Просто нажмите R с дробовиком в руках и запасом патронов дробовика.'
      ],
      en: [
        'The first-person shotgun is now held by the RIGHT hand only — the left hand is fully hidden, same as the iron axe. This also applies to other players: they hold the shotgun with one right hand too.',
        'The shotgun reload on R is fixed. Previously a shotgun taken from the admin panel or a crate arrived in the inventory without a mag field — the reload timer ran, but no shells ever chambered ("2 − empty = NaN"). The mag is now created right away and fills as intended: 2 shells per 2.6 seconds.',
        'Old shotguns already sitting in your inventory repair themselves — no need to re-take the item. Just press R with the shotgun in hand and shotgun shells in stock.'
      ]
    }
  },
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
