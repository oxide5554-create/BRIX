// ============================================================
//  brix • js/data/news.js
//  Новости проекта. Даты соответствуют демо-сборке 13.11.2026.
//  Полный перенос из data/news.ts.
// ============================================================
window.BrixData = window.BrixData || {};

window.BrixData.NEWS = [
  {
    id: 'n-arena-v66-fixes',
    date: '21.11.2026',
    tag: 'fix',
    title: {
      ru: 'Патч 0.4.66 — арена целиком из СЕКТОР-9 + Бот-Студия',
      en: 'Patch 0.4.66 — the full SECTOR-9 arena + Bot Studio'
    },
    excerpt: {
      ru: 'Локация «ПОЛИГОН» теперь 1-в-1 из референса: ВСЕ текстуры (бетон, кирпич, металлопанели, ящики «7.62×39», знамёна СТАЛЬ/ПЛАМЯ, эмблема СЕКТОР-9) и все детали (AC, трубы, пыль, колышущиеся знамёна). Исправлены: спавн вне арены, каменный топор в руках, невидимые боты, дробовик/револьвер-карабин не выбирались. На арене всегда ДЕНЬ, бот — один, трассеры как у игроков. Новая Бот-Студия: анимации, хваты, пальцы, наш кала́ш на боте.',
      en: 'The “POLYGON” location is now 1:1 from the reference: ALL textures (concrete, brick, metal panels, “7.62×39” crates, STAL/PLAMYA banners, SECTOR-9 emblem) and every detail (AC units, pipes, dust, waving banners). Fixed: spawning outside the arena, stone axe in hands, invisible bots, shotgun/revolver-3x not selectable. The arena is always at DAY, one bot, player-style tracers. New Bot Studio: animations, grips, fingers, our AK on the bot.'
    },
    body: {
      ru: [
        'ЛОКАЦИЯ БЕЗ УРЕЗАНИЙ: полный порт текстурной фабрики СЕКТОР-9 — бетонный пол с швами/пятнами/трещинами, стены с опалубкой и потёками, кирпич бункеров с перевязкой и сколами, металлопанели с болтами и трафаретами, сигнальные полосы со сколами краски, рифлёный металл, ящики «7.62×39 БОЕПРИПАСЫ» с трафаретами, ткань/разгрузка бота. Все декали на месте: эмблема «СЕКТОР-9» на платформе, зоны «БАЗА · СТАЛЬ/ПЛАМЯ», трафарет «09 ЗАКРЫТЫЙ ПЕРИМЕТР», знамёна отрядов (колышутся), кондиционеры, трубы, ящики-боеприпасы со светящейся кромкой, пыль в лучах прожекторов.',
        'ИСПРАВЛЕННЫЕ БАГИ: 1) спавн был не в локации — сохранение игрока (позиция/вещи BrixLand) на арену больше не применяется, ты появляешься ПРЯМО в зоне «БАЗА · СТАЛЬ»; 2) каменный топор в руках — стартовый набор из конструктора инвентаря тоже убран, руки пустые; 3) НЕВИДИМЫЕ БОТЫ — арена и боты оставались в старой сцене при повторном входе, теперь локация пересобирается в новый мир; сами боты ещё и стояли на 3.45 м под полом — исправлено; 4) дробовик и револьвер-карабин 3× не выбирались при полном инвентаре — оружие кладётся в текущий слот принудительно.',
        'ПРАВИЛА: на арене ВСЕГДА ДЕНЬ (погода остаётся своей), бот — ОДИН (ВИПЕР-1), трассеры бота — НАША система (как у игроков), вспышка — из текстур СЕКТОР-9.',
        'Бот-Studia (tools/bot-studio.html — открой http://адрес:8787/tools/bot-studio.html): твоя модель учёного (ScientistRigged.fbx) грузится автоматически, наш кала́ш (ak47.glb) крепится к правой руке с нормализацией размера, пресеты хвата (две руки/одна/опущен), слайдеры смещения и поворота, сжатие пальцев, ручное кручение ЛЮБОЙ кости, базовые анимации IDLE/WALK/AIM/SHOOT/DEATH (строятся по костям автоматически), скелет и сетка. Кнопка «Выгрузить bot-anim.json» сохраняет конфиг хвата/поз для игры.'
      ],
      en: [
        'LOCATION WITHOUT CUTS: full port of the SECTOR-9 texture factory — concrete floor with seams/stains/cracks, walls with formwork and streaks, bunker brick with bond and chips, metal panels with bolts and stencils, hazard stripes with chipped paint, treadplate, “7.62×39 AMMO” crates with stencils, bot fabric/vest. All decals: the “SECTOR-9” emblem on the platform, “BASE · STAL/PLAMYA” zones, the “09 CLOSED PERIMETER” stencil, team banners (waving), AC units, pipes, ammo boxes with glowing edges, dust in the floodlight beams.',
        'FIXED BUGS: 1) spawn outside the location — the player save (position/items from BrixLand) is no longer applied on the arena, you appear right in the “BASE · STAL” zone; 2) stone axe in hands — the starter kit baked into the inventory constructor is removed too, hands are empty; 3) INVISIBLE BOTS — the arena and bots stayed in the old scene on re-entry, the location now rebuilds into the new world; bots also stood 3.45 m under the floor — fixed; 4) shotgun and revolver-3x were not selectable with a full inventory — the weapon is force-placed into the current slot.',
        'RULES: the arena is ALWAYS AT DAY (weather stays its own), ONE bot (VIPER-1), bot tracers use OUR system (like players), muzzle flash from SECTOR-9 textures.',
        'Bot Studio (tools/bot-studio.html — open http://host:8787/tools/bot-studio.html): your scientist model (ScientistRigged.fbx) auto-loads, our AK (ak47.glb) attaches to the right hand with size normalization, grip presets (two hands/one/lowered), offset and rotation sliders, finger curl, manual rotation of ANY bone, base animations IDLE/WALK/AIM/SHOOT/DEATH (auto-built from bones), skeleton and grid helpers. “Export bot-anim.json” saves the grip/pose config for the game.'
      ]
    }
  },
  {
    id: 'n-arena-poligon-bots',
    date: '21.11.2026',
    tag: 'new',
    title: {
      ru: 'Патч 0.4.65 — Арена «ПОЛИГОН» с ботами: новая локация вместо рельефа',
      en: 'Patch 0.4.65 — The “POLYGON” arena with bots: a location instead of terrain'
    },
    excerpt: {
      ru: 'BrixPvP теперь — ЛОКАЦИЯ «ПОЛИГОН» из СЕКТОР-9: бетонная площадка 62×46 со стенами, бункерами, центральной платформой и ящиками. Шесть ботов красной команды ходят, ищут и стреляют по-настоящему. С4 и булава убраны, ящики/лут отключены, постройки BrixLand не приезжают, цифры 1–6 не работают, время отличается на 10 игровых часов, карта (M) показывает локацию и ботов.',
      en: 'BrixPvP is now the “POLYGON” location from SECTOR-9: a 62×46 concrete floor with walls, bunkers, a central platform and crates. Six red-team bots patrol, hunt and shoot for real. C4 and mace removed, loot crates disabled, BrixLand builds never arrive, keys 1–6 disabled, time differs by 10 in-game hours, the map (M) shows the location and bots.'
    },
    body: {
      ru: [
        'ЛОКАЦИЯ «ПОЛИГОН» (порт из СЕКТОР-9): больше НЕ рельеф — плоская бетонная локация 62×46: периметр-стены с пилонами и светящимися полосами, 4 кирпичных бункера с крышами, ЦЕНТРАЛЬНАЯ ПЛАТФОРМА 14×10 со ступенями, опорные столбы, кластеры ящиков, джерси-барьеры, топливные баки, паллеты, трубы, прожекторные вышки с объёмными конусами света, зоны спавна. По платформе, ступеням, крышам бункеров и ящикам можно ХОДИТЬ, пули останавливаются стенами.',
        'БОТЫ (6, красная команда): ВИПЕР, ПРИЗРАК, КОБРА, ШАКАЛ, ГРОМ, ЗУБР — с никами и полосками ХП. ИИ как в СЕКТОР-9: патруль по нав-графу, поиск по последнему месту, бой со стрейфом и удержанием дистанции, очереди с разбросом и реакцией, перезаход пути при застревании, падение при смерти и респавн через 5 с. Боты стреляют по-настоящему (трассеры, вспышки, звук по дистанции), урон — локальный. В голову — крит. Счётчик убийств — тостом.',
        'ПРАВИЛА АРЕНЫ ужесточены: С4 и БУЛАВА убраны из списка оружия (только огнестрелы), ящики/лут/подбор отключены (F молчит), постройки BrixLand НЕ ПРИЕЗЖАЮТ на арену (ни с сервера, ни из локального бэкапа браузера), клавиши 1–6 (хотбар) не работают — только E, стартового набора после смерти нет.',
        'ВРЕМЯ И ПОГОДА: арена живёт в СВОЁМ часовом поясе — время суток отличается от Brixland на 10 ИГРОВЫХ ЧАСОВ (когда на BrixLand день — на арене вечер/ночь).',
        'КАРТА (M) ПОКАЗЫВАЕТ ЛОКАЦИЮ: стены, бункеры, платформа, ящики и красные точки ботов рисуются поверх карты мира. Карта перестраивается при смене сервера.'
      ],
      en: [
        'THE “POLYGON” LOCATION (port of SECTOR-9): no more terrain — a flat concrete location 62×46: perimeter walls with pilasters and glowing strips, 4 brick bunkers with roofs, a CENTRAL PLATFORM 14×10 with steps, pillars, crate clusters, jersey barriers, fuel tanks, pallets, pipes, floodlight towers with volumetric cones, spawn zones. You can WALK on the platform, steps, bunker roofs and crates; bullets stop at the walls.',
        'BOTS (6, red team): VIPER, PRIZRAK, KOBRA, SHAKAL, GROM, ZUBR — with name tags and HP bars. SECTOR-9 AI: patrol on a nav-graph, seek last seen, combat with strafing and range keeping, bursts with spread and reaction, re-pathing when stuck, fall on death and respawn after 5 s. Bots shoot for real (tracers, muzzle flash, distance-based sound), damage is local. Headshots crit. Kill counter as toasts.',
        'ARENA RULES tightened: C4 and MACE removed from the weapon list (guns only), loot crates/pickups disabled (F is silent), BrixLand builds NEVER arrive at the arena (neither from the server nor the browser backup), keys 1–6 (hotbar) disabled — E only, no starter kit after death.',
        'TIME AND WEATHER: the arena lives in its OWN time zone — the time of day differs from BrixLand by 10 IN-GAME HOURS (when BrixLand has day, the arena has evening/night).',
        'MAP (M) SHOWS THE LOCATION: walls, bunkers, platform, crates and red bot dots are drawn over the world map. The map rebuilds when you switch servers.'
      ]
    }
  },
  {
    id: 'n-two-servers-pvp',
    date: '21.11.2026',
    tag: 'new',
    title: {
      ru: 'Патч 0.4.64 — ДВА СЕРВЕРА: BrixLand и ПВП-арена «Пепел»',
      en: 'Patch 0.4.64 — TWO SERVERS: BrixLand and the “Ashen” PVP arena'
    },
    excerpt: {
      ru: 'Вкладка «СЕРВЕРА» теперь — СПИСОК СЕРВЕРОВ с живыми счётчиками игроков у каждого: BRIX • BrixLand (выживание) и BRIX • BrixPvP (пвп-арена). У каждого свои мир, сохранения и игроки. На арене: только оружие (E — список всего оружия), без хотбара и крафта, патроны бесконечные (перезарядка на месте), свой рельеф и арена без леса. Магазин скинов — только для админов.',
      en: 'The SERVERS tab is now a SERVER LIST with a live player counter for each: BRIX • BrixLand (survival) and BRIX • BrixPvP (pvp arena). Each has its own world, saves and players. In the arena: guns only (E opens the full weapon list), no hotbar or crafting, infinite ammo (reload still matters), its own terrain and a treeless arena. The skin shop is admins-only.'
    },
    body: {
      ru: [
        'СПИСОК СЕРВЕРОВ: вкладка «СЕРВЕРА» переделана полностью. Два официальных сервера — BRIX • BrixLand (ВЫЖИВАНИЕ: крафт, постройки, лес и руда) и BRIX • BrixPvP (ПВП АРЕНА «ПЕПЕЛ») — карточками с живым счётчиком онлайна и составом игроков у КАЖДОГО (опрос каждые 4 с). Карточки «СЛУЖЕБНЫЙ СЕРВЕР» и «Последний сервер» убраны, надписей ADMIN больше нет.',
        'СВОИ СОХРАНЕНИЯ И ИГРОКИ У КАЖДОГО: сервер запускается в двух реалмах — data/brixland/ и data/brixpvp/ (мир, сохранения игроков, соцсеть и счётчик отдельно). Файлы BrixLand переехали в data/brixland/ автоматически — ничего не потерялось. admins.json и бан-лист общие: админ и бан действуют на обоих. Запуск: START-MULTIPLAYER.bat поднимает ОБА сервера (8787 и 8788).',
        'ПВП-АРЕНА «ПЕПЕЛ»: свой рельеф — у арены ДРУГОЙ сид ландшафта (другие горы, долины, биомы, озеро). Это не лес, а ЛОКАЦИЯ: ровная площадка ~78 м в центре без единого дерева, с двумя кольцами валунов-укрытий и каменными «стенами», лес вокруг прорежен вдвое. Спавн — в центре арены. Раскладка лута (чекблоки) у арены своя.',
        'ТОЛЬКО ОРУЖИЕ: на арене нет хотбара, крафт-меню (Q молчит) и инвентаря. Клавиша E открывает СПИСОК ВСЕГО ОРУЖИЯ: булава, револьвер, револьвер-карабин 3×, дробовик, калаш, томпсон, С4 — инструментов (кирка, топоры) нет. Клик по оружию — оно у тебя в руках. Патроны БЕСКОНЕЧНЫЕ: обойма заправляется при перезарядке, запас не тратится — но перезарядка занимает своё время, спринт-стрельба по-прежнему невозможна.',
        'МАГАЗИН СКИНОВ — ТОЛЬКО ДЛЯ АДМИНОВ: вкладка СКИНЫ скрыта у обычных игроков. Админ определяется по admins.json сервера (через /status) или по adminon в игре. Серверные надписи «ADMIN» в заголовке вкладки серверов тоже убраны.'
      ],
      en: [
        'SERVER LIST: the SERVERS tab is fully rebuilt. Two official servers — BRIX • BrixLand (SURVIVAL: crafting, building, forest and ore) and BRIX • BrixPvP (PVP ARENA “ASHEN”) — as cards with a live online counter and player roster for EACH (polled every 4 s). The “SERVICE SERVER” and “Last server” cards are gone; no more ADMIN labels.',
        'OWN SAVES AND PLAYERS PER SERVER: the server runs in two realms — data/brixland/ and data/brixpvp/ (world, player saves, social registry and counter are separate). BrixLand files moved into data/brixland/ automatically — nothing is lost. admins.json and the ban list are shared: admin and bans apply to both. START-MULTIPLAYER.bat now launches BOTH servers (8787 and 8788).',
        'THE “ASHEN” ARENA: its own terrain — a DIFFERENT landscape seed (different mountains, valleys, biomes, lake). Not a forest but a LOCATION: a flat ~78 m clearing in the middle with no trees at all, two rings of boulder cover and stone “walls”, the surrounding forest thinned by half. You spawn at the arena center. Loot crate layout is its own.',
        'GUNS ONLY: the arena has no hotbar, no crafting menu (Q is silent) and no inventory. Key E opens the FULL WEAPON LIST: mace, revolver, scoped revolver 3×, shotgun, AK, Thompson, C4 — no tools (picks, axes). Click a weapon — it is in your hands. Ammo is INFINITE: the magazine refills on reload, the reserve is never spent — but reloading still takes its time and you still cannot shoot while sprinting.',
        'SKIN SHOP — ADMINS ONLY: the SKINS tab is hidden from regular players. Admin status comes from the server admins.json (via /status) or the in-game adminon. The “ADMIN” labels in the servers tab header are gone too.'
      ]
    }
  },
  {
    id: 'n-admin-coins-old-players',
    date: '21.11.2026',
    tag: 'new',
    title: {
      ru: 'Патч 0.4.63 — Монеты админу, проверка ХП построек, фикс 3D-осмотра, все игроки с 1-го релиза',
      en: 'Patch 0.4.63 — Admin coins, build HP verified, 3D inspect fix, all players since day one'
    },
    excerpt: {
      ru: 'АДМИН-ПАНЕЛЬ (9): секция «МОНЕТЫ — НАЧИСЛИТЬ СЕБЕ» (ввёл число — нажал НАЧИСЛИТЬ). ХП ПОСТРОЕК: вся цепочка проверена настоящим тестом — урон синхронен всем, пишется на диск сразу, новички видят повреждённое с правильным хп. ФИКС 3D-ОСМОТРА: обёртка скина больше не «съедается» металлом — револьвер «Экскимо» и остальные смотрятся правильно. «ВСЕ ИГРОКИ» ТЕПЕРЬ ПОКАЗЫВАЕТ ИГРОКОВ С 1-го РЕЛИЗА: сервер собирает имена из мира (кто строил, кто погибал) с датами.',
      en: 'ADMIN PANEL (9): “COINS — ADD TO MYSELF” section (type amount, press ADD). BUILD HP: the whole chain is verified with a real protocol test — damage syncs to everyone, hits disk instantly, newcomers see damaged builds with correct HP. 3D INSPECT FIX: the wrap is no longer swallowed by metalness — “Eskimo” revolver and the rest now look right. “ALL PLAYERS” NOW SHOWS PLAYERS SINCE DAY ONE: the server harvests names from the world (who built, who died) with dates.'
    },
    body: {
      ru: [
        'МОНЕТЫ АДМИНУ: в панели разработчика (клавиша 9) появилась секция «МОНЕТЫ — НАЧИСЛИТЬ СЕБЕ»: вводишь количество (по умолчанию 1000), жмёшь НАЧИСЛИТЬ — баланс рядом и обновляется сразу, всё сохраняется на аккаунте. Топ-ап админа до 10000 монет при входе тоже остался.',
        'ХП ПОСТРОЕК — ПРОВЕРКА ВСЕЙ ЦЕПОЧКИ: прогнал настоящий сетевой тест (клиент по протоколу сервера): поставил фундамент → 3 удара булавой → «bhp» с остатком пришёл всем (350→260) → перезаход — постройка на месте с тем же хп → доломал до 0 → «brem» у всех, клетка освободилась, «надгробие» записано. Снапшот для новичков (welcome.objs.bd) несёт hp/max КАЖДОЙ детали — сохранение и синхронизация хп всех построек работают полностью; дыр не нашлось.',
        'ФИКС СКИНОВ (3D-осмотр + РУКИ + ЧУЖИЕ ИГРОКИ): нашёл причины «обёртка криво/не надевается». 1) В руках железный топор «Ледяные руны» и железная кирка «Ретро» ВООБЩЕ не надевали скин — у этих скинов не было держателей в списке рук («Ретро» по ошибке был приписан каменной кирке); теперь надеваются. 2) «Криво» у револьвера/томпсона/С4/кам. топора в руках: у большинства моделей metalness=1 (умолчание glTF) — металл «съедал» окрас обёртки (тёмное зеркало), а у «Экскимо» свои карты с шероховатостью ≈0.2 («жидкий» глянец). Теперь у всех скинов единый витринный материал (metalness 0.15, roughness 0.6) — и в 3D-осмотре, и в руках: окрас виден ровно как на арте, размер и разрешение обёртки ни при чём. 3) У ЧУЖИХ игроков скины не показывались вовсе (id скина искался в базовых предметах, где скинов нет) — исправлено. 4) Снятие скина возвращает материал полностью (без остаточного глянца). Револьвер «Экскимо» — шоколадно-кремовый, томпсон «Леденцовый» — в карамельных полосках, железный топор — с ледяными рунами.',
        'ВСЕ ИГРОКИ С 1-го РЕЛИЗА: имена игроков всё это время сохранялись в мире — кто поставил постройку (builds.by) и кто погиб (труп-лутбоксы, corpses.n), у обоих есть дата. Сервер теперь собирает эти имена в реестр при запуске и добирает новые раз в 60 с. Во вкладке «ВСЕ ИГРОКИ» появляются и давние игроки: «в сети сейчас» или «был(а) N мин/ч/дн назад» (по дате последней постройки/смерти в мире). Клик по любому — профиль с ПРИГЛАСИТЬ.',
        'ВАЖНО ПРО АРХИВЫ: полный архив v0.4.63 больше НЕ содержит файлы мира (world-objs.json, players.json, social.json, admins.json, world-env.json, world-epoch.json) — распаковка «поверх» сервера больше не затрёт твой мир, сохранения игроков и список админов. Файлы кода (server.js и js/) заменяй смело.'
      ],
      en: [
        'ADMIN COINS: the developer panel (key 9) has a new “COINS — ADD TO MYSELF” section: type an amount (1000 by default), press ADD — the balance sits right there and updates instantly, saved on the account. The admin top-up to 10000 coins on join is still there too.',
        'BUILD HP — FULL CHAIN VERIFIED: ran a real network test (a client speaking the server protocol): placed a foundation → 3 mace hits → the “bhp” remainder reached everyone (350→260) → rejoined — the build is there with the same HP → broke it to 0 → “brem” to everyone, the cell freed, a tombstone recorded. The newcomer snapshot (welcome.objs.bd) carries hp/max of EVERY piece — saving and syncing of all build HP works completely; no holes found.',
        'SKIN FIX (3D inspect + HANDS + OTHER PLAYERS): found the causes of “the wrap sits wrong / does not show”. 1) In hands the “Icy Runes” iron axe and the “Retro” iron pickaxe NEVER wore their skins — those skins had no holder in the hands list (“Retro” was wrongly attached to the stone pickaxe); now they do. 2) The “wrong look” of the revolver/Thompson/C4/stone axe in hands: most models default to metalness=1 (glTF default) — metal swallowed the wrap color (dark mirror), and “Eskimo” had its own maps with roughness ≈0.2 (“wet” gloss). Every skin now uses one showcase material (metalness 0.15, roughness 0.6) — in the 3D inspect and in hands alike: the paint shows exactly as drawn; wrap size/resolution was never the issue. 3) OTHER players never saw your skin at all (the skin id was looked up in the base-items registry, where skins do not exist) — fixed. 4) Removing a skin restores the material completely (no leftover gloss). The “Eskimo” revolver is chocolate-and-cream, the “Candy” Thompson shows caramel stripes, the iron axe glows with icy runes.',
        'ALL PLAYERS SINCE DAY ONE: player names have been saved inside the world all along — who placed a build (builds.by) and who died (corpse lootboxes, corpses.n), both with dates. The server now harvests those names into the registry on startup and picks up new ones every 60 s. Veteran players appear in the “ALL PLAYERS” tab: “online now” or “seen N min/h/d ago” (by the date of their last build/death in the world). Tap any of them — profile with INVITE.',
        'IMPORTANT ABOUT ARCHIVES: the v0.4.63 full archive no longer contains world files (world-objs.json, players.json, social.json, admins.json, world-env.json, world-epoch.json) — unpacking it “over” your server will no longer wipe your world, player saves, or the admin list. Code files (server.js and js/) are safe to replace.'
      ]
    }
  },
  {
    id: 'n-sync-shop3d-friends',
    date: '21.11.2026',
    tag: 'new',
    title: {
      ru: 'Патч 0.4.62 — Фикс построек, магазин 3D, пули летят, друзья и все игроки',
      en: 'Patch 0.4.62 — Build fix, 3D shop, flying bullets, friends & all players'
    },
    excerpt: {
      ru: 'ПОСТРОЙКИ: сломанное больше не воскресает — бэкап клиента чистится при сломании, сервер хранит «надгробия» и отвергает добор сломанного (server.js заменить + перезапустить). СКИН «Ретро» — теперь на ЖЕЛЕЗНОЙ кирке. СУТКИ = 47 МИНУТ. АДМИНАМ 10000 монет. «СКИНЫ» → «МАГАЗИН»: клик по скину — 3D-ОСМОТР без рук, крутится, кнопка КУПИТЬ. ПУЛИ ЛЕТЯТ — урон приходит с пулей, скорости чуть выше. ДРУЗЬЯ: вкладки «Друзья» и «Все игроки» (кто играл/играет, «был N ч назад»), профиль игрока, заявки в колокольчике — Принять/Игнорировать.',
      en: 'BUILDS: broken pieces no longer resurrect — client backup clears on break, the server keeps tombstones and rejects re-adopting broken builds (replace server.js + restart). The “Retro” skin now belongs to the IRON pickaxe. A FULL DAY = 47 MINUTES. ADMINS get 10000 coins. “SKINS” → “SHOP”: tap a skin for a 3D INSPECT view — the real model without hands, spin it, with a BUY button. BULLETS FLY — damage arrives with the bullet, speeds slightly up. FRIENDS: “Friends” and “All players” tabs (who played/is playing, “seen N h ago”), player profiles, invites in the bell — Accept/Ignore.'
    },
    body: {
      ru: [
        'СЛОМАННЫЕ ПОСТРОЙКИ — СИНХРОНИЗАЦИЯ И СОХРАНЕНИЕ: нашёл настоящую причину «сломанное воскресает». Бэкап построек в localStorage НЕ чистился при сломании — при перезаходе клиент «добирал» сломанное серверу (badopt), и руины возвращались у всех. Теперь: клиент чистит бэкап при каждом удалении, а сервер хранит «НАДГРОБИЯ» — последние 600 id сломанного в world-objs.json; badopt такие записи игнорирует. Сломанное удалено из мира НАВСЕГДА: brem всем игрокам, из индексов, и на диск сразу. ВАЖНО: заменить server.js и ПЕРЕЗАПУСТИТЬ сервер.',
        'СКИН «РЕТРО» — ЖЕЛЕЗНАЯ КИРКА: обёртка рисовалась по развёртке pickaxe.glb (проверил наложением UV-контура — совпадение точное), поэтому скин переехал с каменной кирки на железную: в магазине теперь «Железная кирка «Ретро»», и в руках железной кирки окрас садится правильно.',
        'СУТКИ = 47 МИНУТ: полный цикл (рассвет → день → закат → сумерки → ночь) длится 47 минут: рассвет 198 с, день ~19.8 мин, закат ~5 мин, сумерки 148 с, ночь 16.5 мин. Часы авторитетно ведёт сервер — у всех игроков время одинаковое.',
        'АДМИНАМ 10000 МОНЕТ: когда сервер подтверждает админа, его баланс добирается до 10000 (если было меньше; больше — не трогаем).',
        'МАГАЗИН С 3D-ОСМОТРОМ: вкладка «СКИНЫ» переименована в «МАГАЗИН». Нажми на КАРТИНКУ скина — откроется 3D-просмотр: настоящая модель предмета (iron_axe.glb, revolver.glb, c4.glb...) с надетой обёрткой скина, БЕЗ РУК. Тяни мышью или пальцем — крутится; отпустишь — медленно вращается сам. Внутри кнопки КУПИТЬ / КУПЛЕНО / ЗАКРЫТЬ — осмотрел и купил, не выходя из окна.',
        'ПУЛИ ЛЕТЯТ: раньше при попадании с 200 метров урон снимался мгновенно, хотя трассер ещё летел. Теперь урон и хит-маркер приходят РОВНО когда пуля долетела (время = дистанция / скорость). Пули стали чуть быстрее: револьвер 300, карабин и томпсон 370, калаш 480, дробь 210 м/с. За время полёта цель может отойти — пуля «догоняет».',
        'ДРУЗЬЯ И ВСЕ ИГРОКИ: вкладка «Друзья» переделана — две вкладки: «ДРУЗЬЯ» (все твои друзья, клик по другу → профиль) и «ВСЕ ИГРОКИ» (все, кто играл или играет сейчас: имя, «в сети сейчас» или «был(а) N ч/дн назад»). Клик по игроку открывает ПРОФИЛЬ: аватар, ник, ID аккаунта, статус и кнопки ПРИГЛАСИТЬ / УДАЛИТЬ ИЗ ДРУЗЕЙ. Нажал ПРИГЛАСИТЬ — игроку в КОЛОКОЛЬЧИК приходит сообщение «вам предложили дружить» с кнопками ПРИНЯТЬ / ИГНОРИРОВАТЬ. Сервер ведёт реестр всех игроков (social.json) и отдаёт список по запросу.'
      ],
      en: [
        'BROKEN BUILDS — SYNC & SAVE: found the real cause of “broken pieces resurrect”. The localStorage build backup was NOT cleared on break — on rejoin the client re-adopted broken pieces to the server (badopt) and the ruins came back for everyone. Now: the client clears its backup on every removal, and the server keeps “tombstones” — the last 600 broken ids in world-objs.json; badopt ignores those. A broken piece is removed from the world FOREVER: brem to everyone, out of the indexes, written to disk immediately. IMPORTANT: replace server.js and restart the server.',
        'THE “RETRO” SKIN — IRON PICKAXE: the wrap was painted against the pickaxe.glb UV layout (verified with a UV contour overlay — exact match), so the skin moved from the stone pickaxe to the iron one: the shop now shows “Iron Pickaxe “Retro””, and it sits correctly on the iron pickaxe in your hands.',
        'A FULL DAY = 47 MINUTES: the whole cycle (dawn → day → sunset → dusk → night) lasts 47 minutes: dawn 198 s, day ~19.8 min, sunset ~5 min, dusk 148 s, night 16.5 min. The server is the clock authority — every player sees the same time.',
        'ADMINS GET 10000 COINS: when the server confirms an admin, their balance is topped up to 10000 (only if it was lower; higher balances are untouched).',
        'SHOP WITH 3D INSPECT: the “SKINS” tab is now “SHOP”. Tap the skin PICTURE — a 3D view opens: the real item model (iron_axe.glb, revolver.glb, c4.glb...) wearing the skin wrap, WITHOUT hands. Drag with mouse or finger to spin; release it and it slowly rotates by itself. Inside: BUY / OWNED / CLOSE — inspect and buy without leaving the window.',
        'BULLETS FLY: before, a hit from 200 m applied damage instantly while the tracer was still flying. Now the damage and the hitmarker arrive exactly when the bullet lands (time = distance / speed). Bullets are slightly faster: revolver 300, carbine and Thompson 370, AK 480, pellets 210 m/s. The target can move during the flight — the bullet “catches up”.',
        'FRIENDS & ALL PLAYERS: the “Friends” tab is reworked — two tabs: “FRIENDS” (all your friends, tap a friend → profile) and “ALL PLAYERS” (everyone who played or is playing now: name, “online now” or “seen N h/d ago”). Tapping a player opens their PROFILE: avatar, nick, account ID, status and INVITE / REMOVE buttons. Press INVITE — the player gets a bell message “wants to be friends” with ACCEPT / IGNORE. The server keeps a registry of all players (social.json) and serves the list on request.'
      ]
    }
  },
  {
    id: 'n-ice-runes-ironaxe',
    date: '21.11.2026',
    tag: 'new',
    title: {
      ru: 'Патч 0.4.61 — Железный топор «Ледяные руны» + фикс обёрток',
      en: 'Patch 0.4.61 — Iron Axe “Ice Runes” + wrap orientation fix'
    },
    excerpt: {
      ru: 'НОВЫЙ СКИН (арт игрока): железный топор «Ледяные руны» — лёд со светящимися рунами. Магазин — 400 монет (редкий). В крафт-меню (Q) выбери чертёж железного топора и нажми на большую иконку предмета — откроется список скинов. ИКОНКА скина — настоящий 3D-рендер модели топора с обёрткой: форма точь-в-точь как у оригинала. ФИКС: обёртки больше не ложатся вверх ногами (flipY=false, конвенция glTF) — «Замороженое дерево» и остальные скины сели ровно.',
      en: 'NEW SKIN (player art): Iron Axe “Ice Runes” — ice with glowing runes. Shop — 400 coins (rare). In the craft menu (Q) pick the iron axe blueprint and press the big item icon — the skin list opens. The skin ICON is a true 3D render of the axe model with the wrap: the shape matches the original exactly. FIX: weapon wraps no longer apply upside down (flipY=false, glTF convention) — “Frozen Wood” and the other skins now sit straight.'
    },
    body: {
      ru: [
        'ЖЕЛЕЗНЫЙ ТОПОР «ЛЕДЯНЫЕ РУНЫ»: новый скин по арту игрока — ледяная развёртка со светящимися рунами-завихрениями на лезвии и древке. Покупается в МАГАЗИНЕ один раз (400 монет, редкость «редкий») и хранится на аккаунте, как остальные скины.',
        'НАДЕТЬ: крафт-меню (Q) → чертёж ЖЕЛЕЗНОГО ТОПОРА → нажми на БОЛЬШУЮ ИКОНКУ ПРЕДМЕТА в превью → список скинов этого предмета → «Ледяные руны» → СКАФТ. Топор создастся сразу со скином: обёртка в руках и ледяная иконка в хотбаре. Скин не тратится и не теряется.',
        'ИКОНКА СКИНА — 3D-РЕНДЕР: иконка сгенерирована с настоящей модели iron_axe.glb с надетой обёрткой, в позе базовой иконки (голова справа-сверху, рукоять влево-вниз) — форма точь-в-точь как у оригинала, только в ледяном окрасе.',
        'ФИКС ОРИЕНТАЦИИ ОБЁРТОК: TextureLoader по умолчанию переворачивает текстуру (flipY=true), а UV моделей — в конвенции glTF (flipY=false, как в glb.js). Из-за этого обёртки ложились вверх ногами. Теперь weaponskins.js ставит flipY=false — «Замороженое дерево», «Ретро», «Экскимо» и остальные скины сели на модели ровно; действует и на скины у удалённых игроков.',
        'СЕРВЕР НЕ МЕНЯЛСЯ: достаточно заменить файлы клиента (patch-zip поверх папки BRIX) и обновить страницу.'
      ],
      en: [
        'IRON AXE “ICE RUNES”: a new skin from the player’s art — an icy UV wrap with glowing rune swirls on the blade and the handle. Bought once in the SHOP (400 coins, rare) and kept on the account, like every other skin.',
        'HOW TO WEAR: craft menu (Q) → the IRON AXE blueprint → press the BIG ITEM ICON in the preview → the skin list for this item → “Ice Runes” → CRAFT. The axe is created with the skin right away: the wrap in your hands and the icy icon in the hotbar. The skin is never spent or lost.',
        'SKIN ICON — 3D RENDER: the icon was generated from the actual iron_axe.glb model wearing the wrap, in the pose of the base icon (head top-right, handle to the bottom-left) — the shape matches the original exactly, only in icy colors.',
        'WRAP ORIENTATION FIX: TextureLoader flips textures by default (flipY=true), while model UVs follow the glTF convention (flipY=false, as in glb.js). Because of that wraps applied upside down. weaponskins.js now sets flipY=false — “Frozen Wood”, “Retro”, “Eskimo” and the rest now sit straight on their models; the same applies to skins on remote players.',
        'SERVER UNCHANGED: just replace the client files (patch-zip over the BRIX folder) and refresh the page.'
      ]
    }
  },
  {
    id: 'n-syringe-psave-c4stack',
    date: '20.11.2026',
    tag: 'new',
    title: {
      ru: 'Патч 0.4.46 — Шприц (+46 хп), сохранение игрока и С4 ×10',
      en: 'Patch 0.4.46 — Syringe (+46 hp), player save and C4 ×10'
    },
    excerpt: {
      ru: 'ШПРИЦ: ЛКМ — укол с анимацией из модели шприца (руки наши): поднимает, ставит укол и на «продавливании» даёт +46 ХП; расходуется, стакается по 10, крафтится (20 металлолома + 10 фрагментов) и падает из военных ящиков. СОХРАНЕНИЕ: позиция, весь инвентарь и выбранный слот хотбара живут на сервере — вышел и зашёл: ты там же и с теми же вещами; при смерти сохранение стирается (вещи в трупе). ПОД ЛЕСТНИЦЕЙ — только в приседе: стоя голова упирается в площадку и марш. С4 теперь стакается по 10. ФИКС: два калаша в сундуке больше не слипаются — каждый в своём слоте.',
      en: 'SYRINGE: LMB injects with the animation from the syringe model (our own hands): raise, inject, and at the plunger press you get +46 HP; it is consumed, stacks ×10, crafts from 20 scrap + 10 metal fragments and drops from military crates. PLAYER SAVE: position, whole inventory and the selected hotbar slot live on the server — log out and back in, you are exactly where you left; death wipes the save (your stuff is in the corpse). UNDER THE STAIRS — crouch only: standing you hit your head on the landing and the upper flight. C4 now stacks ×10. FIX: two AKs no longer merge in a chest — each gets its own slot.'
    },
    body: {
      ru: [
        'ШПРИЦ (+46 ХП): ЛКМ со шприцем в руках — УКОЛ. Играется полная анимация из модели medical_syringe_healing_fps_animation.glb (5.73 с): шприц поднимается, держится наготове, на 3.45 с «продавливается» — В ЭТОТ МОМЕНТ приходит +46 ХП. Руки в анимации — НАШИ (чужие руки модели скрыты, наш риг повторяет жест), шприц — из модели.',
        'Шприц РАСХОДУЕТСЯ (снимается со слота сразу после ЛКМ), СТАКУЕТСЯ ПО 10 (как С4). КРАФТ: 20 металлолома + 10 метал фрагментов (вкладка ИНСТРУМЕНТЫ). Падает из ВОЕННЫХ ящиков с шансом 30% (1–2 шт). Если здоровье полное — укол не тратится.',
        'СОХРАНЕНИЕ ИГРОКА (server.js 0.4.46): позиция (ноги) + поворот + ХП + ВЕСЬ инвентарь + выбранный слот хотбара хранятся на СЕРВЕРЕ в players.json под BRIX-ID. Клиент шлёт сохранение раз в 3 с и при выходе; welcome возвращает его — игрок появляется ТОЧНО там, где вышел, со всеми вещами и обоймами (у оружия сохраняется остаток магазина).',
        'СМЕРТЬ = СТИРКА СОХРАНЕНИЯ: весь инвентарь уходит в труп-лутбокс, сохранение удаляется — задвоить вещи невозможно (нельзя выйти до смерти и вернуться с полным инвентарём). После респауна сохранение пишется заново (стартовый набор).',
        'ПОД ЛЕСТНИЦЕЙ — ТОЛЬКО В ПРИСЕДЕ: у площадки и верхнего марша низ на 1.5/1.62 м — стоя (голова 1.82 м) об них УДАРЯЕШЬСЯ: движение блокируется, как стеной. В приседе (C) голова 1.17 м — проход есть. Вставать ПОД лестницей нельзя — пока голова упирается, C не встаёт. Подъём по ступеням не изменился.',
        'С4 СТАКОМ 10: в одном слоте до 10 блоков (было 1). Бросок снимает 1 из стека.',
        'ФИКС «ДВА КАЛАША В СУНДУКЕ СТАКУТСЯ»: оружие и инструменты кладутся ПО 1 ШТУКЕ НА СЛОТ — в сундуке/трупе каждый калаш занимает СВОЙ слот, клик забирает ОДИН калаш, у каждого своя обойма. Стакуются только ресурсы.',
        'СЕРВЕР: замени server.js и ПЕРЕЗАПУСТИ его (v0.4.46 — новая логика heal/psave). Кэш поднят до ?v=085 — после перезахода страница обновится сама.'
      ],
      en: [
        'SYRINGE (+46 HP): LMB with the syringe in hand — INJECTION. The full animation from medical_syringe_healing_fps_animation.glb plays (5.73 s): the syringe rises, waits ready, and at 3.45 s the plunger is pressed — THAT is when you get +46 HP. The hands are OURS (the model’s arms are hidden, our rig repeats the gesture); the syringe itself comes from the model.',
        'The syringe is CONSUMED (removed right after LMB) and STACKS ×10 (like C4). CRAFT: 20 scrap + 10 metal fragments (TOOLS tab). Drops from MILITARY crates at 30% chance (1–2 pcs). If your health is full the syringe is not wasted.',
        'PLAYER SAVE (server.js 0.4.46): position (feet) + yaw + HP + the WHOLE inventory + the selected hotbar slot live ON THE SERVER in players.json keyed by BRIX-ID. The client sends the save every 3 s and on exit; welcome returns it — you spawn EXACTLY where you left, with all your items and weapon magazines intact.',
        'DEATH = SAVE WIPED: the whole inventory goes into the corpse lootbox and the save is deleted — duplicating items is impossible (you cannot log out before dying and come back with a full inventory). After respawn a fresh save is written (starter kit).',
        'UNDER THE STAIRS — CROUCH ONLY: the landing and the upper flight are 1.5/1.62 m high — standing (head 1.82 m) you bang your head and movement is blocked like a wall. Crouched (C) your head is 1.17 m — you pass. You cannot stand up under the stairs — C is ignored while your head hits. Climbing the steps is unchanged.',
        'C4 STACK OF 10: one slot holds up to 10 blocks (was 1). A throw takes 1 from the stack.',
        'FIX “TWO AKs MERGE IN A CHEST”: weapons and tools occupy ONE UNIT PER SLOT — in chests/corpses each AK takes its own slot, a click takes ONE rifle, each has its own magazine. Only resources stack.',
        'SERVER: replace server.js and RESTART it (v0.4.46 — new heal/psave logic). Cache bumped to ?v=085 — the page updates itself after reconnect.'
      ]
    }
  },
  {
    id: 'n-c4-server-corpses',
    date: '20.11.2026',
    tag: 'new',
    title: {
      ru: 'Патч 0.4.43 — С4 тикает на сервере, обломки взрывов и трупы-лутбоксы',
      en: 'Patch 0.4.43 — C4 ticks on the server, blast debris and corpse lootboxes'
    },
    excerpt: {
      ru: 'С4: таймер теперь В СЕРВЕРЕ — вышедший из игры не отменяет взрыв, а зашедший после постановки видит блок и слышит тыки с правильной фазы (главный фикс: события С4 раньше терялись в сети — чужие игроки вообще их не получали). Обломки: взорванное распадается на 5×5 кусков, падает на землю и растворяется. Трупы: смерть оставляет труп-лутбокс со всем инвентарём — подойди и жми F; труп синхронизируется и сохраняется сервером.',
      en: 'C4: the fuse now lives ON THE SERVER — leaving the game no longer cancels the blast, and anyone who joined after placement sees the bomb and hears the ticks at the right phase (main fix: C4 events used to be silently dropped by the network layer — other players never received them). Debris: blown-up pieces split into a 5×5 grid of chunks that fall to the ground and fade away. Corpses: death leaves a lootbox body with the whole inventory — walk up and press F; corpses are synced and saved by the server.'
    },
    body: {
      ru: [
        'С4 ТИКАЕТ В СЕРВЕРЕ (а не у игрока): когда блок прилип, сервер создаёт сущность (id, точка, нормаль, кто поставил, время) и сам взрывает её через 11.24 с — РОВНО ТАК ЖЕ, как раньше тикал клиент. Теперь: бросавший ВЫШЕЛ из игры — бомба всё равно взорвётся; сервер ПЕРЕЗАПУСТИЛИ до взрыва — бомбы сохраняются в world-objs.json и таймер продолжается после старта.',
        'ГЛАВНЫЙ ФИКС СИНХРОНИЗАЦИИ: раньше js/net/net.js молча ТЕРЯЛ события c4placed/c4boom (в его switch просто не было таких строк) — чужие игроки ВООБЩЕ не видели блок, не слышали тыков и взрыва, фьюз существовал только у бросавшего. Теперь неизвестные события доставляются обработчикам автоматически — все видят и слышат С4 одинаково.',
        'НОВЫЙ ИГРОК ВИДИТ БОМБУ: зашёл после постановки — живые С4 приезжают в снапшоте мира с ОСТАТКОМ фьюза, тыки играются с правильной фазы, и взрыв произойдёт в тот же момент, что у всех (решает сервер). Урон (постройки −400, игроки −250) сервер считает ОДИН раз на взрыв.',
        'ОБЛОМКИ ВЗРЫВОВ: то, что взрыв С4 сломал, больше не исчезает молча — сервер рассылает список разрушенных деталей, и у ВСЕХ игроков каждая распадается на решётку 5×5 кусков: куски разлетаются с физикой (гравитация, отскок), падают на землю, лежат ~5.5 с и за 1.5 с «растворяются». Разлёт детерминирован сидом — у всех выглядит одинаково. На игру куски не влияют, FPS не режут (лимит 280).',
        'ТРУПЫ-ЛУТБОКСЫ: при смерти игрока его ВЕСЬ инвентарь уходит в ТРУП на месте гибели — лежащая кукла в цвете игрока, красное пульсирующее кольцо и плашка «ТРУП · Ник». Подойди и нажми F — откроется лут-меню со всеми ресурсами погибшего (клик — забрать стек, перетаскивание — сколько влезет). Труп живёт НА СЕРВЕРЕ: видят все, синхронизируется мгновенно (кто-то забрал вещь — у остальных она исчезла), сохраняется в world-objs.json для НОВЫХ игроков и переживает рестарт. Опустел — труп убирается у всех; TTL — 20 минут.',
        'СВОИ ВЕЩИ МОЖНО ВЕРНУТЬ: после респауна инвентарь пуст (без двойных вещей) — вернись к своему трупу и забери всё обратно по F; на экране смерти остаётся красный череп-метка на карте.',
        'РЭГДОЛЛ-СМЕРТЬ: чужой игрок при смерти больше НЕ уходит под землю — «кости пропадают»: тело плавно падает на землю, сжимается и растворяется, а на месте остаётся труп-лутбокс. РЕЖИМЫ: всё работает и на сервере, и во вкладках, и в соло.',
        'СЕРВЕР: ЗАМЕНИ server.js и ОБЯЗАТЕЛЬНО ПЕРЕЗАПУСТИ (v0.4.43 — логика менялась). Кэш поднят до ?v=082 — страница обновится после Ctrl+Shift+R.'
      ],
      en: [
        'C4 TICKS ON THE SERVER (not the player): when the bomb sticks, the server creates an entity (id, point, normal, owner, time) and detonates it itself after 11.24 s — exactly like the client used to. Now: the thrower LEAVES — the bomb still explodes; the server RESTARTS before the blast — bombs are saved to world-objs.json and the timer resumes on boot.',
        'MAIN SYNC FIX: js/net/net.js used to silently DROP c4placed/c4boom events (the switch simply had no cases for them) — other players NEVER saw the bomb, heard no ticks and no explosion; the fuse existed only in the thrower’s head. Unknown events are now delivered to their handlers automatically — everyone sees and hears C4 the same way.',
        'NEW PLAYERS SEE THE BOMB: join after placement — live C4s arrive in the world snapshot with the REMAINING fuse; ticks play at the right phase and the blast happens at the same moment for everyone (the server decides). Damage (buildings −400, players −250) is applied by the server ONCE per blast.',
        'BLAST DEBRIS: what the C4 destroys no longer vanishes silently — the server broadcasts the destroyed pieces and EVERY player sees each piece split into a 5×5 grid of chunks: chunks fly out with physics (gravity, one bounce), land on the ground, rest for ~5.5 s and “dissolve” over 1.5 s. The scatter is seeded — identical for everyone. Chunks are purely visual and FPS-safe (280 cap).',
        'CORPSE LOOTBOXES: when a player dies, their WHOLE inventory goes into a BODY at the death spot — a lying doll in the player’s color, a pulsing red ring and a “BODY · Nick” plate. Walk up and press F — a loot menu opens with all their resources (click — take the stack, drag — as much as fits). The corpse lives ON THE SERVER: everyone sees it, sync is instant (someone took an item — it disappears for the rest), it is saved to world-objs.json for NEW players and survives restarts. Emptied — removed for everyone; TTL — 20 minutes.',
        'GET YOUR OWN STUFF BACK: after respawn your inventory is empty (no duplicates) — walk back to your body and loot it with F; the death screen keeps the red skull marker on the map.',
        'RAGDOLL DEATH: other players no longer sink into the ground — “the bones are gone”: the body falls smoothly to the ground, compresses and dissolves, leaving the lootbox corpse. MODES: works on the server, in tabs and in solo.',
        'SERVER: REPLACE server.js and RESTART (v0.4.43 — logic changed). Cache bumped to ?v=082 — the page picks it up after Ctrl+Shift+R.'
      ]
    }
  },
  {
    id: 'n-biomes-footprints',
    date: '20.11.2026',
    tag: 'new',
    title: {
      ru: 'Патч 0.4.42 — текстуры биомов, красивые переходы и следы на песке/снегу',
      en: 'Patch 0.4.42 — biome textures, smooth transitions and footprints on sand/snow'
    },
    excerpt: {
      ru: 'Земля больше не однотонная: 7 процедурных текстур (сочный луг, сухостой, земля, камень, снег, песок, дно) и РВАНЫЕ живые переходы между биомами — границы «гуляют» и рвутся пятнами, снег блестит. СЛЕДЫ: ходишь по песку или снегу — остаются следы ботинок (лево/право, по наклону); своих следов максимум 50 — первые исчезают первыми, чтобы не лагало. Чужие игроки тоже оставляют следы.',
      en: 'The ground is no longer flat-colored: 7 procedural textures (lush meadow, dry grass, dirt, rock, snow, sand, sea bottom) with RAGGED organic transitions — biome borders wander and break into patches, snow glitters. FOOTPRINTS: walk on sand or snow and bootprints stay behind (left/right, laid on slopes); your prints cap at 50 — the oldest vanish first so nothing lags. Other players leave prints too.'
    },
    body: {
      ru: [
        'ТЕКСТУРЫ БИОМОВ (новый файл js/game/terrainlook.js): раньше вся земля была ПЛОСКИМИ вершинными цветами — трава, песок и снег выглядели однотонной заливкой. Теперь terrain.js на вершинах считает ВЕСА слоёв (новые атрибуты brixSplat/brixSplat2), а в материал террейна внедряется шейдер, который смешивает 7 ПРОЦЕДУРНЫХ бесшовных текстур 256×256: сочный луг (с травинками), сухостой, земля с камешками, камень с трещинами, снег с позёмкой и блёстками, песок с рябью, тёмное дно. Ни одного внешнего файла — всё рисуется на canvas при загрузке мира.',
        'КРАСИВЫЕ ПЕРЕХОДЫ: граница каждого биома «ГУЛЯЕТ» крупным шумом (±4.5 м) — линия трава→земля→снег→песок живая, не ровная полоса; края рвутся ПЯТНАМИ (островки снега на кромке, лоскуты песка на пляже, проплешины земли на лугу), а ВБЛИЗИ граница дополнительно рвётся ПОПИКСЕЛЬНЫМ шумом — даже рядом с ногами биом не выглядит «линейкой». Текстуры берутся в МИРОВЫХ координатах — тайл не «плывёт» под ногами. Бонус: крупные пятна света/тени по всей земле и блёстки на снегу/мокром песке. Миникарта (M) теперь раскрашена ТЕМИ ЖЕ рваными границами — карта и мир совпадают.',
        'СЛЕДЫ НОГ (новый файл js/game/footprints.js): идёшь по ПЕСКУ или СНЕГУ — за тобой остаются следы ботинок: левый/правый по очереди, направлены ПО ХОДУ движения, лежат ПО НАКЛОНУ рельефа, мягко проявляются при рождении. На траве, земле, камне, в прыжке и на постройках следов НЕТ — только там, где реально песок или снег.',
        'ЛИМИТ 50: как только пошёл 51-й твой след — САМЫЙ ПЕРВЫЙ начинает таять (FIFO): следов всегда около 50, «мусор» не копится и FPS не падает. ЧУЖИЕ игроки тоже оставляют следы — у них общий лимит 24, чтобы на полном сервере не плодить сотни мешей. Всё исчезает вместе с миром при выходе.',
        'СЕРВЕР: логика не менялась, только версия (0.4.42) — замени server.js и ПЕРЕЗАПУСТИ сервер, чтобы не вылезал баннер «СЕРВЕР СТАРЫЙ». Кэш поднят до ?v=081 — страница обновится сама после Ctrl+Shift+R.'
      ],
      en: [
        'BIOME TEXTURES (new file js/game/terrainlook.js): the whole ground used to be FLAT vertex colors — grass, sand and snow looked like single-tone fills. Now terrain.js computes LAYER WEIGHTS per vertex (new brixSplat/brixSplat2 attributes) and a shader injected into the terrain material blends 7 PROCEDURAL seamless 256×256 textures: lush meadow (with grass blades), dry grass, pebbly dirt, cracked rock, snow with wind streaks and glints, rippled sand, dark sea bottom. No external files — everything is drawn on canvas while the world loads.',
        'BEAUTIFUL TRANSITIONS: each biome border WANDERS with large-scale noise (±4.5 m) — the grass→dirt→snow→sand line is alive, not a straight band; edges break into PATCHES (snow islands at the rim, sand laces on the beach, dirt freckles in the meadow), and UP CLOSE the border is additionally broken by PER-PIXEL noise — even near your feet a biome never looks ruler-straight. Textures sample in WORLD coordinates — the tile does not slide under your feet. Bonus: large light/shadow patches across the land and glints on snow/wet sand. The minimap (M) is now painted with THE SAME ragged borders — map and world match.',
        'FOOTPRINTS (new file js/game/footprints.js): walking on SAND or SNOW leaves bootprints behind you: left/right alternating, oriented along your movement, laid onto the slope, softly fading in. No prints on grass, dirt, rock, in mid-air or on buildings — only where it is really sand or snow.',
        'THE 50 CAP: once your 51st print appears, the VERY FIRST one starts to fade (FIFO): there are always about 50 prints, no clutter and no FPS drop. OTHER players leave prints too — with a shared cap of 24 so a full server does not grow hundreds of meshes. Everything disappears together with the world on exit.',
        'SERVER: no logic changes, version bump only (0.4.42) — replace server.js and RESTART the server so the “SERVER IS OLD” banner stays away. Cache bumped to ?v=081 — the page will pick it up after Ctrl+Shift+R.'
      ]
    }
  },
  {
    id: 'n-c4-mobile41',
    date: '20.11.2026',
    tag: 'new',
    title: {
      ru: 'Патч 0.4.41 — С4, мобильное управление, магнит потолка и чинёный сервер',
      en: 'Patch 0.4.41 — C4, mobile controls, ceiling magnetism and a server fix'
    },
    excerpt: {
      ru: 'С4: бросок с физикой, прилипает к стенам и потолку, 15 «тыков» (каждый тише и быстрее) — и взрыв: −400 хп постройкам в радиусе, игроки в радиусе погибают. МОБИЛЬНОЕ УПРАВЛЕНИЕ: джойстик, камера по пальцам и кнопка на каждую функцию под любой экран. СТРОИТЬ ПРОЩЕ: магнит потолка (в твою клетку, над головой, достройка в соседнюю). СЕРВЕР больше не вырубается после ~часа игры. Сундук не открывается сквозь стену. Прыжок через потолок починен.',
      en: 'C4: physics throw, sticks to walls and ceilings, 15 ticks (quieter and faster each) — then a blast: −400 HP to every building in radius, players in radius die. MOBILE: joystick, finger camera and a button for every action, fits any screen. BUILDING IS EASIER: ceiling magnetism (your cell, above your head, extend to the next cell). The SERVER no longer shuts down after about an hour. Chests no longer open through walls. Ceiling jump-through is fixed.'
    },
    body: {
      ru: [
        'С4 (взрывчатка, модель и звуки от игрока — C4.glb, c4_beep.ogg, C4 Explosion 1.ogg): в руках блок стоит ПО ЦЕНТРУ экрана, обе руки держат его ЗА БОКИ. ЛКМ — обычный быстрый бросок: блок летит по дуге С ФИЗИКОЙ и ПРИЛИПАЕТ туда, куда упал — к земле, к стене или даже к ПОТОЛКУ (лицевой гранью от поверхности). Дальше блок «тыкает» 15 РАЗ: каждый тык чуть ТУСКЛЕЙ, «ПИСКЛЯВЕЕ» и БЫСТРЕЕ предыдущего (интервал 1.0 с → 0.44 с, тон растёт 1.0 → 1.9, громкость падает 0.9 → 0.4), красный «глаз» на блоке мигает. После 15-го тыка — ВЗРЫВ: КАЖДАЯ постройка в радиусе 7 м получает −400 хп (стены, потолки, окна, двери и сундуки — до 300 хп — ломаются С ОДНОГО взрыва, фундамент 350 — с двух), а все игроки в радиусе 6.5 м получают 250 урона — НАСМЕРТЬ. Крафт: металлолом 20 + метал 40 + сера 15 (категория ОРУЖИЕ).',
        'МОБИЛЬНОЕ УПРАВЛЕНИЕ (новый файл js/game/touch.js) — включается САМО на тач-экранах (принудительно: напиши в консоли localStorage.brixTouch = \'1\' и обнови страницу): ДЖОЙСТИК ходьбы слева-снизу — аналоговый, чем сильнее ведёшь, тем быстрее; кнопка БЕГ — переключатель (горит, когда включён); КАМЕРА ЧУВСТВУЕТ ПАЛЬЦЫ — свайп по свободной части экрана крутит взгляд, второй палец одновременно может держать джойстик или кнопку. КНОПКА ПОД КАЖДУЮ ФУНКЦИЮ: УДАР/огонь (большая справа), ПРИЦЕЛ (удержание), ПРЫЖОК, БЕГ, F — взаимодействие (сундук/дверь/подбор), КРАФТ, СУМКА, СТРОЙКА, R — перезарядка, СИД — присед, II — меню. Размеры подгоняются под ЛЮБОЙ экран (от 44 до 78 px по vmin, вырезы «чёлки» учтены), работает и вертикально, и горизонтально. Pointer lock на телефоне не нужен: игра сама считается активной. Без лагов: слушатели постоянные, картинка двигается через transform.',
        'СТРОИТЬ ПРОЩЕ — МАГНИТ ПОТОЛКА (просьба игрока): целишься в СТЕНУ — потолок встанет в клетку, где ТЫ стоишь (внутреннюю), а не в «якорную» клетку края; целишься в НЕБО или мимо (внутри комнаты лучу не во что упереться) — потолок ищется НАД ИГРОКОМ и на клетку ВПЕРЁД по взгляду; целишься в УЖЕ ПОСТАВЛЕННЫЙ потолок — достройка продолжается СОСЕДНЕЙ клеткой по направлению взгляда. Прежнее правило (точка прицела) осталось резервом.',
        'ПРЫЖОК ЧЕРЕЗ ПОТОЛОК ПОЧИНЕН: раньше изнутри дома можно было выпрыгнуть сквозь потолок на крышу. Теперь макушка упирается в потолок — подъём гаснет, игрок падает обратно (проверка на пересечение низа бокса, работает даже при просадке FPS).',
        'СУНДУК БОЛЬШЕ НЕ ОТКРЫВАЕТСЯ СКВОЗЬ СТЕНУ: раньше луч F шёл ТОЛЬКО по сундукам, и сундук за стеной открывался на расстоянии вытянутой руки. Теперь в луче участвуют все постройки и рельеф — сундук откроется, только если он ПЕРВОЕ, во что упёрся взгляд.',
        'СЕРВЕР ВЫРУБАЛСЯ ПОСЛЕ ~60 МИНУТ ИГРЫ — ПОЧИНЕНО: падение было в установке сундука («Cannot read properties of undefined (reading \'top\')» — чанк палубы приходил без поля rec, и ВЕСЬ процесс Node умирал со всеми игроками). Это место защищено, и ВЕСЬ сервер теперь прикрыт страховками uncaughtException/unhandledRejection: ошибка пишется в лог с пометкой [guard], сервер ПРОДОЛЖАЕТ работать (в логе раз в 5 минут сводка). ОБЯЗАТЕЛЬНО замени server.js и перезапусти сервер — иначе С4 не будет наносить урон и сервер по-прежнему будет падать. Кэш поднят до ?v=080.'
      ],
      en: [
        'C4 (explosive, user model and sounds — C4.glb, c4_beep.ogg, C4 Explosion 1.ogg): held CENTERED in front of you, both hands gripping the SIDES. LMB makes a quick throw: the block flies in an arc WITH PHYSICS and STICKS where it lands — ground, wall, even CEILING (face out). Then it ticks 15 TIMES: each tick a bit dimmer, squeakier and FASTER (interval 1.0 s → 0.44 s, pitch 1.0 → 1.9, volume 0.9 → 0.4), a red lamp blinks. After the 15th tick — BOOM: EVERY building within 7 m takes −400 HP (walls, ceilings, windows, doors and chests — up to 300 HP — break in ONE blast, foundation 350 takes two), and every player within 6.5 m takes 250 damage — DEAD. Craft: scrap 20 + metal 40 + sulfur 15 (WEAPONS tab).',
        'MOBILE CONTROLS (new file js/game/touch.js) — turns ON automatically on touch screens (force it: type localStorage.brixTouch = \'1\' in the console and reload): a WALK JOYSTICK bottom-left — analog, the further you drag the faster you go; RUN is a toggle (lights up when active); the CAMERA FEELS YOUR FINGERS — swipe on any free area, a second finger can hold the joystick or a button at the same time. A BUTTON FOR EVERY ACTION: ATTACK/fire (big, right), AIM (hold), JUMP, RUN, F — interact (chest/door/pickup), CRAFT, BAG, BUILD, R — reload, CROUCH, II — menu. Sizes adapt to ANY screen (44–78 px from vmin, notch/safe-area respected), portrait and landscape. No pointer lock needed on phones. Lag-free: permanent listeners, transform-based movement.',
        'BUILDING IS EASIER — CEILING MAGNETISM (player request): aim at a WALL — the ceiling snaps into the cell where YOU stand (the inner one), not the edge anchor cell; aim at the SKY or past the house (inside a room the ray has nothing to hit) — the ceiling is looked for ABOVE THE PLAYER and one cell ahead along the view; aim at an EXISTING ceiling — building continues into the NEIGHBOR cell along the view. The old rule (aim point) remains as a fallback.',
        'CEILING JUMP-THROUGH FIXED: you used to be able to jump through your own ceiling from inside. Now your head hits it — upward movement stops and you fall back (crossing check against the box bottom, works even at low FPS).',
        'CHESTS NO LONGER OPEN THROUGH WALLS: the F ray used to test ONLY chests, so a chest behind a wall opened from arm\'s length. Now walls, doors, all buildings and terrain block the ray — a chest opens only if it is the FIRST thing you look at.',
        'THE SERVER SHUTTING DOWN AFTER ~60 MINUTES OF PLAY — FIXED: the crash was in chest placement («Cannot read properties of undefined (reading \'top\')» — a deck chunk arrived without its rec field and the whole Node process died, dropping every player). That spot is guarded now, and the WHOLE server is protected by uncaughtException/unhandledRejection guards: errors are logged with a [guard] tag and the server KEEPS RUNNING (a summary prints every 5 minutes). Be sure to replace server.js and restart — otherwise C4 will deal no damage and the server will still crash. Cache bumped to ?v=080.'
      ]
    }
  },
  {
    id: 'n-mace-hits-dmg-road40',
    date: '19.11.2026',
    tag: 'new',
    title: {
      ru: 'Патч 0.4.40 — булава, хит-маркеры, новый урон и дорога вокруг озера',
      en: 'Patch 0.4.40 — the mace, hit markers, new damage table and a lake road'
    },
    excerpt: {
      ru: 'БУЛАВА: долгий замах — огромный урон (в голову 97, в тело 49), постройки по 2 хп за удар. ХИТ-МАРКЕРЫ: белый крест — тело, красный — голова. НОВЫЙ УРОН: у всех оружий урон в голову, в тело — половина; дробовик в упор сразу убивает, на средней 35 в голову, далеко — не достаёт. ДОРОГА: другая — теперь ВОКРУГ БОЛЬШОГО ОЗЕРА через центр карты, шире и ярче.',
      en: 'MACE: long wind-up — huge damage (97 to the head, 49 to the body), 2 HP per hit on buildings. HIT MARKERS: white cross — body, red — head. NEW DAMAGE: headshot damage per weapon, body takes half; the shotgun kills instantly up close, ~35 to the head at medium range and falls short far away. ROAD: a different one — now it circles the BIG LAKE through the middle of the map, wider and brighter.'
    },
    body: {
      ru: [
        'БУЛАВА (новое оружие, модель пользователя rusted_mace_-_fantasy_weapon.glb): держится как топор (одна правая рука, размер 0.95 м), но БЬЁТ ПО-ДРУГОМУ — ДОЛГИЙ ЗАМАХ: рука уходит вверх-назад ~1.1 секунды, секунда «висит» в вершине, потом ЖЁСТКИЙ рубящий удар вниз; урон приходит ровно на контакт (1.2 с после замаха), полный цикл 1.85 с. Зато урон ОГРОМНЫЙ: в голову 97 — почти всегда насмерть с одного удара, в тело 49 (два удара). Чужие игроки видят ту же длинную анимацию замаха. По ПОСТРОЙКАМ булава бьёт по 2 хп за удар (фундамент 350 — за 175 ударов), БОЧКА ломается с одного удара. Крафт: дерево 30 + метал 25 + металлолом 10 (категория ОРУЖИЕ).',
        'ХИТ-МАРКЕРЫ (новый файл js/game/hitmarker.js): при попадании по чужому игроку в центре экрана появляется СТИЛИЗОВАННЫЙ КРЕСТ «Х» из четырёх засечек со свечением (не просто точка): БЕЛЫЙ — попал В ТЕЛО, КРАСНЫЙ — В ГОЛОВУ (крупнее + расходящееся красное кольцо). Маркер показывается при выстреле, при дроби дробовика (один на выстрел: красный, если ≥2 дробины в голову) и при ударе инструментом/булавой.',
        'ЛОГИКА ПОПАДАНИЯ В ГОЛОВУ/ТЕЛО (hitZone): зона считается ПО ВЫСОТЕ точки попадания на модели чужого игрока — голова это всё, что выше 1.48 м от его ног (в приседе порог опускается вместе с моделью). Урон: В ГОЛОВУ — полный, В ТЕЛО — половина (округление). Жертва, убитая выстрелом в голову, видит в меню смерти «ОРУЖИЕ: … · В ГОЛОВУ».',
        'НОВАЯ ТАБЛИЦА УРОНА (по просьбе игрока): каменный топор 13 (тело 7), каменная кирка 14 (7), железный топор 24 (12), железная кирка 24 (12), булава 97 (49), револьвер 18 (9), карбоновый револьвер — это револьвер-карабин 3× — 20 (10), калаш 33 (17), томпсон 23 (12). Раньше все инструменты резались сервером до 10 — теперь у каждого оружия СВОЙ потолок (MELEE_CAP/SHOT_CAP в server.js).',
        'ДРОБОВИК ПО ДИСТАНЦИИ: в упор (до 10 м) дробина бьёт по 13 и в голову, и в тело — весь заряд 104, СРАЗУ УБИВАЕТ; на средней дистанции (10–28 м) — 4.5 в голову / 2.25 в тело за дробину (весь заряд ≈ 35 в голову, как просили); далеко (28–45 м) — по 1.25 за дробину (всего ≈ 10); ДАЛЬШЕ 45 М ДРОБЬ НЕ ДОСТАЁТ — урона игрокам нет.',
        'ДОРОГА ДРУГАЯ (road.js): маршрут больше не жмётся к краям карты — теперь цепочка ~1500 м идёт ВОКРУГ БОЛЬШОГО ОЗЕРА через ЦЕНТР карты: от юго-западной низины вдоль южного берега озера, вверх по восточному берегу, через северный берег и вниз по северо-западу к западному побережью. ШИРЕ — 3.8 м (было 3.2), ТОНА ЯРЧЕ И КОНТРАСТНЕЕ (светлая пыль, тёмная мокрая земля, рыжая глина, серая крошка). Маршрут снова проверен скриптом по реальному рельефу (поверхность meshHeightAt): все 1500 точек — ни воды, ни снега; максимальный уклон 0.65 (горная грунтовка на восточном подъёме). На карте (M) — прежняя прорисованная линия, чуть жирнее.',
        'СЕРВЕР: ЛОГИКА МЕНЯЛАСЬ — обновлены потолки урона (SHOT_CAP/MELEE_CAP), булава ломает бочки/постройки, в phit добавлен флаг «в голову». ОБЯЗАТЕЛЬНО замени server.js и ПЕРЕЗАПУСТИ сервер, иначе булава будет резаться до 10 урона. Кэш поднят до ?v=079.'
      ],
      en: [
        'THE MACE (new weapon, user model rusted_mace_-_fantasy_weapon.glb): held like an axe (right hand only, 0.95 m) but STRIKES DIFFERENTLY — a LONG WIND-UP: the arm sweeps up and back for ~1.1 s, hangs at the top for a beat, then a HARD chopping blow lands; damage applies exactly on contact (1.2 s after the swing), full cycle 1.85 s. The damage is HUGE: 97 to the head — almost always a one-shot kill, 49 to the body (two hits). Other players see the same long swing animation. Against BUILDINGS it deals 2 HP per hit (a 350-HP foundation takes 175 hits), a BARREL breaks in one hit. Craft: wood 30 + metal 25 + scrap 10 (WEAPONS category).',
        'HIT MARKERS (new file js/game/hitmarker.js): when you hit another player a STYLIZED “X” cross of four glowing ticks appears at screen center (not a plain dot): WHITE — body hit, RED — head hit (bigger + an expanding red ring). Shown for bullets, for shotgun pellets (one per shot: red if ≥2 pellets hit the head) and for melee/tool strikes.',
        'HEAD/BODY HIT LOGIC (hitZone): the zone is decided BY HEIGHT of the impact point on the enemy model — the head is everything above 1.48 m from their feet (the threshold drops with crouch). Damage: head — full, body — half (rounded). A player killed by a headshot sees “WEAPON: … · HEADSHOT” on the death screen.',
        'NEW DAMAGE TABLE (as requested): stone axe 13 (body 7), stone pickaxe 14 (7), iron axe 24 (12), iron pickaxe 24 (12), mace 97 (49), revolver 18 (9), carbon revolver — the Scoped Revolver 3× — 20 (10), AK 33 (17), Thompson 23 (12). The server used to clamp every melee hit to 10 — now each weapon has its OWN cap (MELEE_CAP/SHOT_CAP in server.js).',
        'SHOTGUN BY DISTANCE: point blank (≤10 m) — 13 per pellet to BOTH zones, a full blast is 104 and KILLS INSTANTLY; medium range (10–28 m) — 4.5 to the head / 2.25 to the body per pellet (≈35 to the head per full blast, as requested); far (28–45 m) — 1.25 per pellet (≈10 total); BEYOND 45 m THE PELLETS DO NOT REACH — no damage to players.',
        'A DIFFERENT ROAD (road.js): the route no longer hugs the map edges — now a ~1500 m chain circles the BIG LAKE through the MIDDLE of the map: from the south-west lowlands along the lake’s southern shore, up the eastern shore, across the northern shore and down the north-west to the western coast. WIDER — 3.8 m (was 3.2), tones BRIGHTER and higher-contrast (light dust, dark wet dirt, red clay, grey grit). The route was re-checked against the real terrain (meshHeightAt surface): all 1500 points — no water, no snow; max grade 0.65 (a mountain dirt track on the eastern climb). On the map (M) — the same drawn line, slightly bolder.',
        'SERVER: LOGIC CHANGED — damage caps updated (SHOT_CAP/MELEE_CAP), the mace breaks barrels/buildings, phit carries a headshot flag. You MUST replace server.js and RESTART the server, otherwise the mace gets clamped to 10 damage. Cache bumped to ?v=079.'
      ]
    }
  },
  {
    id: 'n-grip39-road39',
    date: '19.11.2026',
    tag: 'fix',
    title: {
      ru: 'Патч 0.4.39 — хват по геометрии, карабин крупнее и точнее, дорога вокруг карты',
      en: 'Patch 0.4.39 — geometry-true grip, bigger and sharper carbine, road around the map'
    },
    excerpt: {
      ru: 'ТОМПСОН: точка рукояти взята по вершинам модели, левая рука встала на вертикальную переднюю рукоятку M1928 — обе руки держат оружие. КАРАБИН 3×: крупнее, отодвинут вправо от хотбара и ОЧЕНЬ точный в прицеле (разброс ×0.02). ДОРОГА: идёт ВОКРУГ КАРТЫ (1325 м) и стала МНОГОТОННОЙ — тёмная мокрая земля, светлая пыль, рыжая глина, след колёс, края в траву.',
      en: 'THOMPSON: the grip point is taken from the model vertices and the left hand now holds the M1928 vertical foregrip — both hands on the weapon. CARBINE 3×: bigger, moved right away from the hotbar and VERY accurate when scoped (spread ×0.02). ROAD: now goes AROUND the map (1325 m) and is MULTI-TONED — dark wet dirt, light dust, red clay, wheel tread, grassy edges.'
    },
    body: {
      ru: [
        'ХВАТ ТОМПСОНА — ПО ВЕРШИНАМ МОДЕЛИ: точка рукояти больше не «прикидка» — она взята из геометрии thompson.glb (пистолетная рукоять = бокс x −99..−45, y 77..110, центр ≈ (−72, 92, 106)); раньше ладонь висела на 18 единиц НИЖЕ рукояти. ЛЕВАЯ РУКА теперь на ВЕРТИКАЛЬНОЙ передней рукоятке M1928 (стойка raw x 40..55): хват «как палку» — ладонь сбоку, пальцы обхватывают стойку. Раньше рука тянулась под деревянное цевьё как у АК и НЕ ДОСТАВАЛА (shortfall) — висела раскрытой ладонью в воздухе.',
        'ПРИЦЕЛ ТОМПСОНА (ПКМ): целик/мушка пересчитаны под новую точку хвата, а дистанция приближена до 0.64 м (у калаша 0.85). Причина: у M1928 целик стоит ПОЗАДИ рукояти, и при прежних 0.85 кисть не дотягивалась — целик уходил на 8.8° ниже оси камеры (у калаша всего 1.6°). Теперь прицел встаёт по оси, как у калаша.',
        'РЕВОЛЬВЕР-КАРАБИН 3×: КРУПНЕЕ (0.62 м в руках, было 0.50), ОТОДВИНУТ ВПРАВО от хотбара (весь карабин с рукой сдвинут по оси торса; при прицеливании сдвиг плавно гаснет — оптика ровно по центру). ТОЧНОСТЬ: разброс в прицеле ×0.02 (было ×0.08) — стоя в оптике конус всего ≈2 см на 100 м, подброс от выстрела в прицеле ослаблен.',
        'ДОРОГА ВОКРУГ КАРТЫ: маршрут перестроен — открытая цепочка ~1325 м идёт ВОКРУГ карты: с северо-запада по западному краю, через южные луга и вдоль восточного берега к северу (разрыв в северо-восточном квадранте, у озера). НЕ круг (цепь открыта) и НЕ прямая (радиус волной 96..318 м, уклоны до 31°). Маршрут снова проверен скриптом по реальному рельефу: все 1500 точек — без воды и снега.',
        'ДОРОГА МНОГОТОННАЯ: раньше лента была одним тусклым цветом. Теперь цвет считается для КАЖДОЙ вершины: тёмная мокрая земля, светлая выбитая пыль, рыжеватая глина, выбеленный след колёс по центру, края темнее и уходят в траву, плюс полосы по длине пути. Дорога шире — 3.2 м (было 2.6). На карте (M) дорога по-прежнему ПРОСТАЯ ПРОРИСОВАННАЯ ЛИНИЯ теми же пикселями, что горы и земля.',
        'СЕРВЕР: логика не менялась, только версия (0.4.39) — замени server.js и ПЕРЕЗАПУСТИ сервер, чтобы не вылезал баннер «СЕРВЕР СТАРЫЙ». Кэш поднят до ?v=078 — после Ctrl+Shift+R страница обновится сама.'
      ],
      en: [
        'THOMPSON GRIP — FROM THE VERTICES: the grip point is no longer an estimate — it comes from the thompson.glb geometry (pistol grip box x −99..−45, y 77..110, center ≈ (−72, 92, 106)); the palm used to hang 18 model units BELOW the grip. The LEFT HAND now holds the M1928 VERTICAL FOREGRIP (post at raw x 40..55) like a stick — palm from the side, fingers wrapped. It used to reach under the wooden handguard AK-style and fell short (shortfall), floating with an open palm.',
        'THOMPSON AIM (RMB): sights recomputed for the new grip point and the eye distance tightened to 0.64 m (AK uses 0.85). Reason: on the M1928 the rear sight sits BEHIND the grip, so at 0.85 the wrist could not reach — the sights sat 8.8° below the camera axis (AK: 1.6°). Now the sights line up like the AK.',
        'SCOPED REVOLVER 3×: BIGGER (0.62 m in hand, was 0.50), MOVED RIGHT away from the hotbar (the whole gun+hand shifts along the torso axis; the shift fades out when aiming so the scope stays centered). ACCURACY: scoped spread ×0.02 (was ×0.08) — standing scoped the cone is ≈2 cm at 100 m; recoil bloom while scoped is reduced.',
        'ROAD AROUND THE MAP: the route is rebuilt — an open ~1325 m chain sweeps AROUND the map: from the north-west along the western edge, through the southern meadows and up the eastern shore (the gap is in the north-east quadrant by the lake). NOT a circle (the chain stays open) and NOT straight (radius wobbles 96..318 m, grades up to 31°). The route was re-checked against the real terrain: all 1500 path points — no water, no snow.',
        'MULTI-TONED ROAD: the ribbon used to be one dull color. Now the color is computed PER VERTEX: dark wet dirt, light worn dust, reddish clay, a bleached wheel tread down the middle, darker edges melting into the grass, plus tonal bands along the path. The road is wider — 3.2 m (was 2.6). On the map (M) it is still a SIMPLY DRAWN LINE in the same pixels as hills and land.',
        'SERVER: no logic changes, version bump only (0.4.39) — replace server.js and RESTART the server so the “SERVER IS OLD” banner stays away. Cache bumped to ?v=078 — the page picks it up after Ctrl+Shift+R.'
      ]
    }
  },
  {
    id: 'n-grip-road',
    date: '19.11.2026',
    tag: 'fix',
    title: {
      ru: 'Патч 0.4.38 — руки держат оружие + грунтовая дорога на карте',
      en: 'Patch 0.4.38 — weapons finally sit in the hands + a dirt road on the map'
    },
    excerpt: {
      ru: 'ХВАТ: в томпсоне был перепутан знак сдвига рукояти — модель уезжала на 21 см от ладони (руки «не держали»); в карабине ладонь стояла на проволочном прикладе, и он пронизывал кисть. Теперь томпсон держится как калаш, а карабин — как обычный револьвер: рукоять точно в ладони, обе руки на оружии. ДОРОГА: единственная грунтовая дорога-цепочка с севера мимо озера на юг — лента по рельефу в мире и прорисованная линия на карте (M), как горы и земля.',
      en: 'GRIP: the Thompson had a flipped grip-offset sign — the model drifted 21 cm off the palm (hands “not holding” it); the scoped carbine put the palm on the thin wire stock that pierced the hand. Now the Thompson holds like the AK and the carbine like the plain revolver: grip right in the palm, both hands on the weapon. ROAD: one winding dirt road chain from the north past the lake down to the south — a terrain-hugging ribbon in the world and a drawn line on the map (M), styled like the hills and land.'
    },
    body: {
      ru: [
        'ФИКС ХВАТА ТОМПСОНА: причина найдена точная — в нормализации модели знак сдвига рукояти по одной оси был перепутан (ставился +x вместо −x). Из-за этого весь томпсон уезжал на 120 единиц модели (≈21 см) назад по пальцам: правая рука держала воздух у магазина, а левая тянулась ПЕРЕД дулом — цели цевья считаются в том же пространстве и уезжали вместе с оружием. Теперь рукоять точно в ладони: держится КАК КАЛАШ, левая рука легла на цевьё — её координаты проверены ПО ВЕРШИНАМ модели (дерево цевья: x 82..118, высота 118..138).',
        'ФИКС ХВАТА КАРАБИНА 3×: авто-поиск fitGun ставил ладонь на ТОНКИЙ ПРОВОЛОЧНЫЙ ПРИКЛАД — он тянется назад по всей задней трети модели, и настоящая рукоять оказывалась на 30% длины ВПЕРЕДИ ладони; тонкий приклад пронизывал кисть («карабин сквозь руки»). Теперь два новых поля: RVX.gx сдвигает модель назад так, что рукоять точно в ладони, длина в руках 0.5 м (было 0.78), а левая рука подхватывает рукоять снизу — ЧИСЛА 1-в-1 КАК У ОБЫЧНОГО РЕВОЛЬВЕРА. Обе руки на оружии, приклад больше не колет кисть. Настройка вживую (F12): BrixFirstPerson.RVX.len / RVX.gx / RVX.pitch.',
        'ГРУНТОВАЯ ДОРОГА: по карте идёт ЕДИНСТВЕННАЯ дорога — открытая цепочка (не кольцо), извилистая (не прямая): от северной равнины, вдоль западного берега Большого озера, через юго-западные луга к южному берегу — около 870 м. Маршрут подобран ПО РЕАЛЬНОМУ РЕЛЬЕФУ: скрипт прошёл все 600 точек пути — нигде ни воды, ни снега.',
        'КАК СДЕЛАНА: в мире — лента утоптанной земли, повторяющая рельеф (поднята на 7 см над землёй, polygonOffset против мерцания), ширина 2.6 м. Трава и деревья дорогу НЕ перечеркивают — при расстановке world.js спрашивает BrixRoad.near(). НА КАРТЕ (M) дорога видна как ПРОСТО ПРОРИСОВАННАЯ ЛИНИЯ — теми же пикселями, что горы и земля, с тем же затенением рельефа.',
        'СЕРВЕР: логика не менялась, только версия (0.4.38) — замени server.js и ПЕРЕЗАПУСТИ сервер, чтобы не вылезал баннер «СЕРВЕР СТАРЫЙ». Кэш поднят до ?v=077 — страница обновится сама после Ctrl+Shift+R.'
      ],
      en: [
        'THOMPSON GRIP FIX: the root cause was exact — a flipped sign on the grip-offset axis in the model normalization (+x instead of −x). The whole Thompson drifted 120 model units (≈21 cm) backward along the palm: the right hand held air near the magazine, and the left hand reached PAST the muzzle (the forend targets are computed in the same space, so they drifted too). Now the grip sits exactly in the palm — held LIKE THE AK, and the left hand landed on the forend with coordinates verified against the model vertices (wood forend: x 82..118, height 118..138).',
        'CARBINE 3× GRIP FIX: the fitGun auto-search placed the palm on the THIN WIRE STOCK — it runs across the entire rear third of the model, so the real grip ended up 30% of the length AHEAD of the palm and the thin stock pierced the hand (“the carbine goes through the hands”). Two new fields fix it: RVX.gx shifts the model back so the grip sits right in the palm, hand length is 0.5 m (was 0.78), and the left hand cups the grip from below with numbers copied 1-to-1 FROM THE PLAIN REVOLVER. Both hands on the weapon, no more stock stabs. Live tuning (F12): BrixFirstPerson.RVX.len / RVX.gx / RVX.pitch.',
        'DIRT ROAD: one single road runs across the map — an open chain (not a loop), winding (not straight): from the northern plains, along the west shore of the Big Lake, through the south-western meadows down to the southern shore — about 870 m. The route was fitted TO THE REAL TERRAIN: a script walked all 600 path points — no water, no snow anywhere.',
        'HOW IT IS BUILT: in the world — a ribbon of packed dirt that follows the relief (raised 7 cm above ground, polygonOffset against shimmer), 2.6 m wide. Grass and trees do NOT cross the road — world.js asks BrixRoad.near() while scattering. ON THE MAP (M) the road shows as a SIMPLY DRAWN LINE — the same pixels that draw hills and land, with the same relief shading.',
        'SERVER: no logic changes, version bump only (0.4.38) — replace server.js and RESTART the server so the “SERVER IS OLD” banner stays away. Cache bumped to ?v=077 — the page will pick it up after Ctrl+Shift+R.'
      ]
    }
  },
  {
    id: 'n-glfix',
    date: '19.11.2026',
    tag: 'fix',
    title: {
      ru: 'Патч 0.4.37 — игра переживает сбой видеокарты (WebGL)',
      en: 'Patch 0.4.37 — the game now survives a GPU crash (WebGL)'
    },
    excerpt: {
      ru: 'Ошибка «CONTEXT_LOST_WEBGL / 0x887A0005 / Cannot read null (trim)» — это перезагрузка драйвера видеокарты на машине, а не баг игры. Раньше экран замирал намертво, теперь игра сама восстанавливается: рендер на паузе, плашка игроку, после восстановления — продолжаем без перезагрузки. После второго сбоя качество снижается автоматически. Фон меню больше не рендерится во время игры — видеокарте теперь легче.',
      en: 'The “CONTEXT_LOST_WEBGL / 0x887A0005 / Cannot read null (trim)” error is a GPU driver reset on your machine, not a game bug. The screen used to freeze for good; now the game recovers on its own: rendering pauses with a heads-up message, and after the driver comes back you keep playing — no page reload. After the second crash quality drops automatically. The menu background no longer renders during gameplay, taking load off the GPU.'
    },
    body: {
      ru: [
        'ЧТО ЭТО БЫЛО: строки «CONTEXT_LOST_WEBGL», «GL_INVALID_OPERATION … 0x887A0005 (removal reason 0x887A0020)», «Error allocating Texture2D» — Windows перезагрузил драйвер видеокарты: ей не хватило видеопамяти или драйвер «завис». Это сбой на МАШИНЕ, а не в коде игры. Ошибка «Cannot read properties of null (reading \u2018trim\u2019)» — уже следствие: игра продолжала рисовать в мёртвый контекст, рендер-цикл падал и экран замирал до перезагрузки страницы.',
        'КАК ТЕПЕРЬ: при потере WebGL рендер ставится на паузу (и обязательно preventDefault — без него браузер вообще не умеет восстанавливать контекст), в углу появляется плашка «Видеокарта сбоит — игра восстанавливается…». Как только драйвер вернулся — шейдеры всех материалов пересобираются и игра продолжается БЕЗ перезагрузки страницы: постройки, лут, мультиплеер — всё на месте.',
        'АВТОПОНИЖЕНИЕ: если за одну сессию драйвер упал второй раз — игра сама снижает нагрузку (рендер 1× вместо 1.5–2× и без теней), чтобы видеокарта не упала снова. Это на текущую сессию; в настройках качество остаётся твоим.',
        'ЛЕГЧЕ ВИДЕОКАРТЕ: фон главного меню раньше рендерился ВТОРЫМ WebGL-контекстом постоянно, даже во время игры, когда его всё равно не видно. Теперь во время игры он не рисуется совсем — минус лишний контекст и минус нагрузка. Заодно чуть вырастет FPS.',
        'ЧТО СДЕЛАТЬ НА ТВОЕЙ МАШИНЕ (если сбои повторяются): обнови драйвер видеокарты (NVIDIA/AMD/Intel — с официального сайта); закрой другие вкладки и программы с 3D-графикой; в настройках игры поставь качество «Низкое»; на ноутбуке включи питание от розетки и в Параметры Windows → Экран → Графика назначь браузеру дискретную видеокарту; проверь, не перегрета ли видеокарта (пыль/кулер).'
      ],
      en: [
        'WHAT IT WAS: the lines “CONTEXT_LOST_WEBGL”, “GL_INVALID_OPERATION … 0x887A0005 (removal reason 0x887A0020)”, “Error allocating Texture2D” mean Windows reset the GPU driver — the card ran out of video memory or the driver hung. It is a MACHINE-side failure, not a game bug. The “Cannot read properties of null (reading \u2018trim\u2019)” error was a consequence: the game kept drawing into a dead context, the render loop crashed, and the screen froze until a page reload.',
        'HOW IT WORKS NOW: on WebGL loss rendering pauses (with the mandatory preventDefault — without it the browser never restores the context) and a “GPU hiccup — recovering…” toast appears. Once the driver is back, all material shaders are rebuilt and the game continues WITHOUT a page reload: builds, loot, multiplayer — everything stays in place.',
        'AUTO-DEGRADE: if the driver falls twice in one session, the game reduces load by itself (1× render scale instead of 1.5–2×, shadows off) so the GPU does not trip again. Session-only; your quality setting stays untouched.',
        'EASIER ON THE GPU: the main-menu background used to render in a SECOND WebGL context all the time, even during gameplay when it is invisible. Now it is skipped while you play — one less context and less load. A small FPS bonus too.',
        'WHAT TO DO ON YOUR MACHINE (if crashes repeat): update your GPU driver (NVIDIA/AMD/Intel — from the official site); close other tabs and 3D apps; set quality to “Low” in game settings; on a laptop plug in the charger and assign the discrete GPU to the browser in Windows Settings → Display → Graphics; check the card for overheating (dust/cooler).'
      ]
    }
  },
  {
    id: 'n-rev3x',
    date: '19.11.2026',
    tag: 'update',
    title: {
      ru: 'Патч 0.4.36 — РЕВОЛЬВЕР-КАРАБИН 3×: снайпер с оптикой',
      en: 'Patch 0.4.36 — SCOPED REVOLVER 3×: the sniper sidearm'
    },
    excerpt: {
      ru: 'Новая модель от игрока — револьвер-карабин со встроенным оптическим прицелом: ПКМ открывает прицел 3× (честное трёхкратное приближение) с суперточностью. Урон 45 (3 выстрела = убийство), барабан 6, хват и звук — как у револьвера. Крафт на Q из револьвера.',
      en: 'A new player-made model — a revolver carbine with a built-in scope: RMB opens a true 3× zoom with pinpoint accuracy. 45 damage (3 shots to kill), 6-round cylinder, grip and sounds just like the revolver. Craft on Q from a revolver.'
    },
    body: {
      ru: [
        'СНАЙПЕРСКИЙ РЕВОЛЬВЕР: модель crafted_revolver_carabine.glb (от игрока) перенесена в игру целиком — самодельный карабин из револьвера: удлинённый ствол, оптика сверху, деревянное цевьё и складной проволочный приклад. Держится КАК РЕВОЛЬВЕР (та же машина хвата), левая рука подхватывает цевьё, при беге оружие прижимается к груди.',
        'ПРИЦЕЛ 3× (ПКМ): держи ПКМ — оружие плавно поднимается к глазам, камера наезжает на честные ТРИ крата (72° → 26°), а экран превращается в оптику: чёрная виньетка, круглое поле зрения, тонкое перекрестие с метками и подпись «3×». В оптике карабин СУПЕРТОЧНЫЙ (разброс в 8 раз меньше стоячего), наводка мыши замедляется — легко ловить головы на дистанции. Отпустил ПКМ — прицел плавно ушёл.',
        'ХАРАКТЕРИСТИКИ: урон 45 за пулю — три выстрела убивают (револьвер 20, калаш 20). Барабан 6 патронов, кулдаун 0.9 с — медленный, но бьёт больно. Патроны те же (ammo). Перезарядка по R — 2.2 с, как у револьвера. Не на бегу: на спринте стрелять нельзя, как у всего огнестрела.',
        'ХВАТ И ЗВУК КАК У РЕВОЛЬВЕРА: выстрел — тот же сэмпл revolver/shot.wav, но чуть тяжелее (удлинённый ствол «басит» — rate 0.9); перезарядка — revolver/reload.wav. Выстрел и перезарядку слышат другие игроки. Иконка — рисованная, от игрока (карабин с прицелом).',
        'ГДЕ ВЗЯТЬ: крафт на Q — 1 револьвер (база!) + 2 трубы + 1 пружина + 20 метал фрагментов; или в админ-панели (9 → ПРЕДМЕТЫ). Чужие игроки видят карабин в твоих руках — стволом вперёд.',
        'ФИКС ПОПУТНО: сервер резал ЛЮБОЙ выстрел до 20 урона — дробовик в мультиплеере не мог убить с одного выстрела (в упор до 96). Теперь потолок урона у СЕРВЕРА честный ПО ОРУЖИЮ: дробовик 96, револьвер-карабин 45, калаш/револьвер 20, томпсон 12.'
      ],
      en: [
        'SNIPER REVOLVER: the crafted_revolver_carabine.glb model (from a player) is ported in full — a handmade revolver carbine: elongated barrel, scope on top, wooden forend and a folding wire stock. Held LIKE THE REVOLVER (same grip machine), the left hand supports the forend, sprinting presses the gun to your chest.',
        '3× SCOPE (RMB): hold RMB — the weapon rises to your eye, the camera zooms to a TRUE 3× (72° → 26°), and the screen turns into optics: black vignette, round field of view, thin crosshair with mil marks and a “3×” label. While scoped the carbine is PINPOINT-ACCURATE (spread 8× smaller than standing) and mouse look slows down — easy headshots at range. Release RMB to lower it.',
        'STATS: 45 damage per bullet — three shots kill (revolver 20, AK 20). 6-round cylinder, 0.9 s cooldown — slow but heavy-hitting. Uses the same pistol ammo. R reload — 2.2 s, like the revolver. No shooting while sprinting, like all guns.',
        'GRIP AND SOUND LIKE THE REVOLVER: the shot uses the same revolver/shot.wav sample, pitched slightly heavier (rate 0.9 — the long barrel “booms”); reload — revolver/reload.wav. Other players hear both. The drawn icon is player-made (the carbine with a scope).',
        'HOW TO GET: craft on Q — 1 revolver (the base!) + 2 pipes + 1 spring + 20 metal fragments; or from the admin panel (9 → ITEMS). Other players see the carbine in your hands, barrel forward.',
        'BONUS FIX: the server capped EVERY shot at 20 damage — the shotgun could not one-shot in multiplayer (up to 96 point-blank). The server damage cap is now per-weapon: shotgun 96, scoped revolver 45, AK/revolver 20, Thompson 12.'
      ]
    }
  },
  {
    id: 'n-thompson',
    date: '18.11.2026',
    tag: 'update',
    title: {
      ru: 'Патч 0.4.35 — ТОМПСОН: скорострельный пистолет-пулемёт',
      en: 'Patch 0.4.35 — THOMPSON: the fast-firing submachine gun'
    },
    excerpt: {
      ru: 'Новая модель от игрока — Томпсон: держится как калаш (хват двух рук, прицел ПКМ, при беге к груди), но стреляет быстрее (800 в/мин) и слабее (12 за пулю). Три звука выстрела играют рандомно, отдельный звук перезарядки. Крафт на Q.',
      en: 'A new player-made model — the Thompson: held like the AK (two-hand grip, RMB sights, chest-press run), but fires faster (800 rpm) and weaker (12 per bullet). Three random shot sounds, a dedicated reload sound. Craft on Q.'
    },
    body: {
      ru: [
        'ТОМПСОН В РУКАХ КАК КАЛАШ: модель thompson_submachine_gun-_luis_novoa.glb (от игрока) перенесена в игру целиком. Хват тот же, что у калаша: правая рука на пистолетной рукояти, левая на цевье и не съезжает при беге и отдаче, ПКМ — прицел по линии целик→мушка (у томпсона свои целики — высоко над стволом, как у M1928), при беге оружие прижимается к груди, отдача — пружиной с зигзагом, перезарядка — ствол уходит вниз-влево.',
        'ХАРАКТЕРИСТИКИ: скорострельность БОЛЬШЕ, чем у калаша — 800 выстрелов в минуту (0.075 с между пулями), но урон МЕНЬШЕ — 12 за пулю (калаш 20). Обойма 30, патроны — те же винтовочные (rifleBullet), перезарядка по R — 3.7 секунды. Итого: томпсон молотит по площади, калаш бьёт точнее и сильнее — выбирай под свой стиль.',
        'ЗВУКИ: три звука выстрела от игрока (Thompson_Shot_LongTail 01/03/04) играют РАНДОМНО — очередь не звучит как метроном, каждый выстрел чуть другой. Перезарядка — отдельный сэмпл Thompson_Reload_01 (3.7 с). Выстрелы слышат другие игроки по дистанции.',
        'ГДЕ ВЗЯТЬ: крафт на Q — 1 труба, 30 металлолома, 25 метал фрагментов, 1 пружина (чуть дешевле калаша); или в админ-панели. Иконка — рисованная, от игрока. Чужие игроки видят томпсон в твоих руках. ФИКС ПОПУТНО: у чужого КАЛАША автомат больше не торчал стволом вверх — теперь и калаш, и томпсон у других игроков смотрят стволом вперёд.'
      ],
      en: [
        'THOMPSON HELD LIKE THE AK: the thompson_submachine_gun-_luis_novoa.glb model (from a player) is ported in full. The grip is the same as the AK: right hand on the pistol grip, left hand on the foregrip that never slides off while running or recoiling, RMB aims down the rear-sight→front-sight line (the Thompson has its own tall M1928 sights), sprinting presses the gun to your chest, recoil is a spring with a zig-zag pattern, and the reload dips the muzzle down-left.',
        'STATS: fire rate HIGHER than the AK — 800 rounds per minute (0.075 s between bullets) — but damage LOWER — 12 per bullet (AK 20). 30-round magazine, uses the same rifle bullets, R reload takes 3.7 seconds. Bottom line: the Thompson shreds up close, the AK hits harder — pick your style.',
        'SOUNDS: three player-provided shot sounds (Thompson_Shot_LongTail 01/03/04) play RANDOMLY — the burst does not sound like a metronome, every shot is a bit different. Reload uses the dedicated Thompson_Reload_01 sample (3.7 s). Other players hear your shots by distance.',
        'HOW TO GET: craft on Q — 1 pipe, 30 scrap, 25 metal fragments, 1 spring (a bit cheaper than the AK); or take it from the admin panel. The drawn icon is player-made too. Other players see the Thompson in your hands. BONUS FIX: a remote AK no longer points straight up — both the AK and the Thompson now look forward in other players\u2019 hands.'
      ]
    }
  },
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
