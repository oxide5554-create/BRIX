// ============================================================
//  brix • js/core/state.js
//  Состояние меню и игры + сохранение в localStorage.
//  Ключ сохранения тот же, что в старой версии: brix-save-v2.
//  Подписка: BrixState.on(function (data) { ... }) — вызывается
//  после каждого изменения (перерисовка интерфейса).
// ============================================================
window.BrixState = (function () {
  'use strict';

  var SAVE_KEY = 'brix-save-v2';

  var defaultSettings = {
    sound: true,
    musicVol: 0.5,
    sfxVol: 0.6,
    particles: true,
    parallax: true,
    quality: 'medium',
    nick: 'Выживший'
  };

  /** ID вида BRIX-A1B2C3 */
  function genProfileId() {
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var s = '';
    for (var i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return 'BRIX-' + s;
  }

  var data = {
    screen: 'home',
    lang: 'ru',
    settings: Object.assign({}, defaultSettings),
    coins: 2500,
    /* ✅ v0.4.59: магазин скинов УДАЛЁН — скины теперь выбираются прямо
       в крафт-меню (Q) при создании оружия; предметы-скины не нужны */
    ownedSkinIds: [],
    equippedSkinIds: [],
    removedFriendIds: [],
    extraFriends: [],
    newsSeenIds: [],
    profileId: '',
    nickSet: false,   // ✅ v0.3.4: первый вход — попросить указать ник
    social: { friends: [], incoming: [], outgoing: [], notifs: [] },  // ✅ v0.3.3 соцсеть
    /* ✅ v0.5.22: у ВСЕХ — 0 часов и 1 уровень (просьба игрока);
       уровень растёт от добычи ресурсов (xp), награды за уровни —
       монеты (кнопка-полка в правом нижнем углу, js/game/rewards.js) */
    level: 1,
    hoursPlayed: 0,
    xp: 0,                 // опыт к следующему уровню
    claimedLevels: [],     // уровни, за которые уже забрана награда
    lastServerId: null,
    quitOpen: false,
    quitDone: false
  };

  var listeners = [];

  /** раздел соцсети с миграцией старых сохранений */
  function social() {
    if (!data.social) data.social = { friends: [], incoming: [], outgoing: [], notifs: [] };
    if (!data.social.friends) data.social.friends = [];
    if (!data.social.incoming) data.social.incoming = [];
    if (!data.social.outgoing) data.social.outgoing = [];
    if (!data.social.notifs) data.social.notifs = [];
    return data.social;
  }

  function emit() {
    save();
    listeners.forEach(function (fn) { fn(data); });
  }

  function save() {
    try {
      var persist = {
        lang: data.lang,
        settings: data.settings,
        coins: data.coins,
        ownedSkinIds: data.ownedSkinIds,
        equippedSkinIds: data.equippedSkinIds,
        removedFriendIds: data.removedFriendIds,
        extraFriends: data.extraFriends,
        social: social(),
        nickSet: data.nickSet,
        newsSeenIds: data.newsSeenIds,
        profileId: data.profileId,
        level: data.level,
        hoursPlayed: data.hoursPlayed,
        xp: data.xp,
        claimedLevels: data.claimedLevels,
        lastServerId: data.lastServerId
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(persist));
    } catch (e) { /* сохранение недоступно — играем без него */ }
  }

  function hydrate() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        /* ✅ v0.5.22 СБРОС ПРОГРЕССА (просьба игрока: «пусть у всех
           будет по 0 часов и 1 уровень»): старые сохранения больше не
           подмешивают уровень/часы/опыт — все начинают с чистого листа.
           В мультиплеере настоящий уровень прислает СЕРВЕР (welcome.lvl) */
        delete saved.level;
        delete saved.hoursPlayed;
        delete saved.xp;
        delete saved.claimedLevels;
        Object.keys(saved).forEach(function (k) {
          if (k === 'settings') {
            data.settings = Object.assign({}, defaultSettings, saved.settings || {});
          } else if (data.hasOwnProperty(k)) {
            data[k] = saved[k];
          }
        });
      }
    } catch (e) { /* битое сохранение — начинаем заново */ }
  }

  return {
    data: data,
    on: function (fn) { listeners.push(fn); },
    off: function (fn) {
      listeners = listeners.filter(function (l) { return l !== fn; });
    },
    hydrate: hydrate,
    save: save,

    /* ================= УРОВНИ И ОПЫТ (v0.5.22) =================
       Уровень 1 → 2: 300 опыта, 2 → 3: 600, 3 → 4: 900… (каждый
       следующий уровень требует на 300 больше), максимум 250.
       Опыт дают ресурсы ПОСЛЕ ПОЛНОГО ломания (см. gameworld.js):
       дерево 25, камень 30, железо 15, сера 15. */
    MAX_LEVEL: 250,
    xpNeeded: function (lvl) {
      /* сколько опыта нужно, чтобы подняться С уровня lvl на lvl+1 */
      return 300 * Math.max(1, lvl | 0);
    },
    /** добавить опыт; вернёт {lvlUp: true/false, level} */
    addXp: function (n) {
      var up = false;
      data.xp += Math.max(0, n | 0);
      while (data.level < this.MAX_LEVEL &&
             data.xp >= this.xpNeeded(data.level)) {
        data.xp -= this.xpNeeded(data.level);
        data.level++;
        up = true;
      }
      if (data.level >= this.MAX_LEVEL) data.xp = 0;
      emit();
      return { lvlUp: up, level: data.level };
    },
    /**.setLevel — синхрон с сервера (сервер — авторитет в мультиплеере) */
    setLevelSync: function (lvl, xp) {
      data.level = Math.max(1, Math.min(this.MAX_LEVEL, lvl | 0 || 1));
      data.xp = Math.max(0, Math.floor(Number(xp) || 0));
      emit();
    },
    /** забрать награду за уровень (монеты); true — если успешно */
    claimLevelReward: function (lvl) {
      lvl = lvl | 0;
      if (lvl < 1 || lvl > data.level) return false;
      if (data.claimedLevels.indexOf(lvl) !== -1) return false;
      data.claimedLevels.push(lvl);
      data.coins += this.levelReward(lvl);
      emit();
      return true;
    },
    /** награда за уровень: монеты (пока только монеты) */
    levelReward: function (lvl) {
      return 50;
    },

    // ---- действия ----
    setScreen: function (s) { data.screen = s; data.quitOpen = false; emit(); },
    setLang: function (l) { data.lang = l; emit(); },
    updateSettings: function (patch) {
      Object.assign(data.settings, patch);
      emit();
    },
    /** ✅ v0.3.4: ник указан — больше не спрашиваем (один аккаунт на устройство) */
    setNickSet: function () { data.nickSet = true; emit(); },
    setQuitOpen: function (v) { data.quitOpen = v; emit(); },
    setQuitDone: function (v) { data.quitDone = v; emit(); },

    /* ✅ v0.4.60 СКИНЫ — КОСТЮМЫ НА АККАУНТЕ: покупка списывает монеты и
       помечает скин купленным (ownedSkinIds). В инвентарь НИЧЕГО не
       кладётся — скин применяется в крафт-меню (Q): клик по иконке
       предмета → список скинов → выбрал купленный → СКАФТ. Скин не
       тратится и не теряется */
    buySkin: function (skinId, price) {
      if (data.coins < price) return false;
      if (data.ownedSkinIds.indexOf(skinId) !== -1) return true;   // уже куплен
      data.coins -= price;
      data.ownedSkinIds.push(skinId);
      emit();
      return true;
    },

    removeFriend: function (id) {
      if (data.removedFriendIds.indexOf(id) === -1) data.removedFriendIds.push(id);
      data.extraFriends = data.extraFriends.filter(function (f) { return f.id !== id; });
      social().friends = social().friends.filter(function (f) { return f.id !== id; });
      emit();
    },

    addFriend: function (f) { data.extraFriends.push(f); emit(); },

    /* ================= СОТСЕТЬ (v0.3.3) =================
       friends — принятые друзья, incoming — входящие заявки,
       outgoing — мои приглашения, notifs — уведомления колокольчика. */
    socialInvite: function (id, name) {
      var so = social();
      if (so.friends.some(function (f) { return f.id === id; })) return 'dup';
      if (so.outgoing.some(function (f) { return f.id === id; })) return 'dup';
      so.outgoing.push({ id: id, name: name, at: Date.now() });
      emit(); return 'sent';
    },
    socialRequestIn: function (id, name) {
      var so = social();
      if (so.friends.some(function (f) { return f.id === id; })) return 'dup';
      // взаимная заявка — сразу друзья
      var mine = so.outgoing.filter(function (f) { return f.id === id; })[0];
      if (mine) {
        so.outgoing = so.outgoing.filter(function (f) { return f.id !== id; });
        so.friends.push({ id: id, name: name, at: Date.now() });
        emit(); return 'auto';
      }
      if (so.incoming.some(function (f) { return f.id === id; })) return 'dup';
      so.incoming.push({ id: id, name: name, at: Date.now() });
      emit(); return 'in';
    },
    socialAccept: function (id) {
      var so = social();
      var req = so.incoming.filter(function (f) { return f.id === id; })[0];
      if (!req) return null;
      so.incoming = so.incoming.filter(function (f) { return f.id !== id; });
      so.friends.push({ id: req.id, name: req.name, at: Date.now() });
      emit(); return req;
    },
    socialDecline: function (id) {
      var so = social();
      var req = so.incoming.filter(function (f) { return f.id === id; })[0];
      so.incoming = so.incoming.filter(function (f) { return f.id !== id; });
      emit(); return req || { id: id, name: '' };
    },
    socialCancelOut: function (id) {
      var so = social();
      so.outgoing = so.outgoing.filter(function (f) { return f.id !== id; });
      emit();
    },
    socialNotif: function (n) {
      var so = social();
      so.notifs.unshift({ id: 'n' + Date.now() + Math.floor(Math.random() * 1e4),
        kind: n.kind, date: n.date || Date.now(), text: n.text, name: n.name || '' });
      emit();
    },
    socialNotifResolve: function (id) {
      var so = social();
      so.notifs = so.notifs.filter(function (n) { return n.id !== id; });
      emit();
    },

    markNewsSeen: function (ids) {
      data.newsSeenIds = Array.from(new Set(data.newsSeenIds.concat(ids)));
      emit();
    },

    ensureProfileId: function () {
      if (data.profileId) return data.profileId;
      data.profileId = genProfileId();
      emit();
      return data.profileId;
    },

    addPlaySeconds: function (sec) {
      data.hoursPlayed += sec / 3600;
      emit();
    },

    /** ✅ v0.5.22: минуты в часах для профиля (0 ч до первой игры) */
    hoursText: function () {
      var h = Math.floor(data.hoursPlayed);
      return String(h);
    },

    setLastServer: function (id) { data.lastServerId = id; emit(); },

    /** перевод для текущего языка */
    t: function (key, params) {
      return BrixI18N.translate(data.lang, key, params);
    }
  };
})();

// ============================================================
//  Состояние подключения к серверу: загрузка → игра → отключение.
//  Прогресс и этапы наполняются реальной сборкой мира.
// ============================================================
window.BrixGame = (function () {
  'use strict';

  var g = {
    phase: 'idle',        // idle | loading | playing
    serverId: null,
    stage: null,
    progress: 0,
    listeners: []
  };

  function emit() { g.listeners.forEach(function (fn) { fn(g); }); }

  return {
    state: g,
    on: function (fn) { g.listeners.push(fn); },
    off: function (fn) { g.listeners = g.listeners.filter(function (l) { return l !== fn; }); },

    connect: function (serverId) {
      g.phase = 'loading';
      g.serverId = serverId;
      g.stage = 'load.step.connect';
      g.progress = 0;
      emit();
    },
    setStage: function (stage, progress) {
      g.stage = stage;
      g.progress = Math.round(progress);
      emit();
    },
    setProgress: function (progress) {
      g.progress = Math.round(progress);
      emit();
    },
    setPlaying: function () {
      g.phase = 'playing';
      g.stage = null;
      g.progress = 100;
      emit();
    },
    disconnect: function () {
      g.phase = 'idle';
      g.serverId = null;
      g.stage = null;
      g.progress = 0;
      emit();
    }
  };
})();
