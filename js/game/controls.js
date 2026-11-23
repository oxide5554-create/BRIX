// ============================================================
//  brix • js/game/controls.js
//  Управление от первого лица: pointer lock, мышь — обзор,
//  WASD/Shift/Space — движение, гравитация и ходьба по рельефу.
//  Полный перенос из lib/game/controls.ts (класс FpsController).
//  ✅ v0.4.52 NOCLIP (админ-панель, тумблер «ПРОХОД СКВОЗЬ СТЕНЫ»):
//  полёт НАСКВОЗЬ стен, дверей, окон и любых построек — коллизии
//  и гравитация выключены, W/A/S/D летят куда смотришь (с учётом
//  наклона камеры), Space — вверх, C — вниз. Включается из панели
//  через controls.setNoclip(true/false).
// ============================================================
window.BrixControls = (function () {
  'use strict';

  var EYE_HEIGHT = 1.7;
  /* ✅ v0.5.13 НОВАЯ ФИЗИКА ДВИЖЕНИЯ (по просьбе игрока):
     — игрок ЧУТЬ МЕДЛЕННЕЕ, бег — ЗАМЕТНО медленнее (10.5 → 7.8);
     — бег ТОЛЬКО вперёд (W без A/D/S): назад/вбок — только шаг;
     — В ПОЛЁТЕ (прыжок) WASD не рулит: летишь по инерции, набранной
       в момент прыжка (прыгнул вперёд — летишь вперёд, от WASD
       направление не меняется), управление возвращается при
       приземлении */
  var WALK_SPEED = 5.2;
  var SPRINT_SPEED = 7.8;
  var GRAVITY = 24;
  var JUMP_SPEED = 8.6;
  var PLAYER_RADIUS = 0.35; // «толщина» игрока для коллайдеров (v0.2.9)
  /* ✅ v0.4.28 ПРИСЕД НА C (как в Rust): C — переключатель. Глаза 1.7 → 1.05,
     скорость 3 м/с (бег недоступен, прыжок заблокирован). Флаг едет в
     состоянии (st.c) — чужие игроки видят присевшего (модель ниже и приземистей) */
  var CROUCH_EYE = 1.05;    // высота глаз в приседе, м
  var CROUCH_SPEED = 3;     // скорость в приседе, м/с
  /* ✅ v0.4.44 ПАДЕНИЕ С ВЫСОТЫ: раньше при сходе с фундамента/потолка игрок
     МГНОВЕННО телепортировался вниз (ветка «стоит на земле» прижимала y к
     новой высоте земли за один кадр). Теперь сход с края — это НАСТОЯЩЕЕ
     падение с ускорением, уроном от высоты и анимацией приземления.
     Параметры как в Rust: урон с 4.5 м, дальше — примерно 14 хп за метр,
     в воду (ниже уровня 3.0) урона нет. Скорость падения ограничена */
  var FALL_GRAB = 0.55;     // если под ногами упало больше этого — падаем (как STEP_UP)
  var FALL_DMG_FROM = 4.5;  // высота (м), с которой начинается урон
  var FALL_DMG_PER_M = 14;  // хп за метр после порога
  var FALL_DMG_MAX = 100;   // потолок урона от одного падения
  var FALL_V_MAX = 32;      // предел скорости падения (м/с) — терминальная
  var FALL_LAND_MIN = 1.2;  // падение с этой высоты — уже анимация приземления (без урона)
  var LADDER_SPEED = 2.8;   // ✅ v0.4.44: скорость подъёма/спуска по лестнице, м/с

  /* ✅ v0.4.46 ПОД ЛЕСТНИЦЕЙ — ТОЛЬКО В ПРИСЕДЕ: боксы построек с флагом
     headBlock (площадка и верхний марш лестницы, building.js) блокируют
     игрока, стоящего В ПОЛНЫЙ РОСТ: голова (глаза + 0.12) упирается в
     низ бокса — «ударился головой». В приседе глаза 1.05 — проход есть.
     Вставать ПОД лестницей нельзя (cannotStand не даёт отжать C) */
  var HEAD_MARGIN = 0.12;   // макушка над глазами, м

  /** высота головы над НОГАМИ с учётом текущего приседа (глаза + макушка) */
  FpsController.prototype._headH = function () {
    return this.eyeH + HEAD_MARGIN;
  };

  function FpsController(dom, getHeight) {
    this.position = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.enabled = false;
    this.onPointerLockLost = null;
    this._colliders = [];    // ✅ v0.2.9: цилиндры деревьев и камней
    this._boxes = [];        // ✅ v0.4.7: AABB стен/потолков/палуб построек

    this._dom = dom;
    this._keys = new Set();
    this._vy = 0;
    this._grounded = false;
    this._bobPhase = 0;
    this._crouched = false;   // ✅ v0.4.28 присед (C — переключатель)
    this.eyeH = EYE_HEIGHT;   // плавно меняется 1.7 ↔ 1.05
    this._getHeight = getHeight;
    this._touchVec = { x: 0, y: 0 };   // ✅ v0.4.41: аналоговый джойстик (моб.)
    /* ✅ v0.4.44 ПАДЕНИЕ: пик высоты текущего падения (для расчёта урона),
       коэффициент анимации приземления (0..1, камера «приседает») и
       зона лестницы {y0, y1} — ставится gameworld'ом (BrixBuilding.ladderAt) */
    this._fallPeak = 0;
    this._landK = 0;
    this._ladder = null;
    /* ✅ v0.5.13: инерция прыжка {dx, dz, sp} — фиксируется в момент
       прыжка, в полёте WASD не рулит, сбрасывается при приземлении */
    this._airDir = null;
    this.noclip = false;        // ✅ v0.4.52: полёт сквозь стены (админ-панель)
    this.onFallDamage = null;   // (info {dist, dmg}) — gameworld применяет урон

    var self = this;
    this._onKeyDown = function (e) {
      if (!self.enabled) return;
      self._keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
      /* ✅ v0.4.28: C — присесть/встать (переключатель).
         ✅ v0.4.46: встать ПОД ЛЕСТНИЦЕЙ нельзя — пока голова упирается
         в headBlock-бокс (площадка/верхний марш), C игнорируется.
         ✅ v0.4.52: в NOCLIP клавиша C — это «вниз» (полёт), не присед */
      if (e.code === 'KeyC' && !self.noclip) {
        if (self._crouched && self.cannotStand()) return;
        self._crouched = !self._crouched;
      }
    };
    this._onKeyUp = function (e) { self._keys.delete(e.code); };
    this._onMouseMove = function (e) {
      if (!self.enabled || document.pointerLockElement !== self._dom) return;
      // ✅ v0.4.5: при прицеливании (ПКМ) мышь медленнее — точная наводка
      var mul = self.aimMul || 1;
      self.yaw -= e.movementX * 0.0022 * mul;
      self.pitch = BrixNoise.clamp(self.pitch - e.movementY * 0.0022 * mul, -1.5, 1.5);
    };
    this._onLockChange = function () {
      if (document.pointerLockElement !== self._dom && self.enabled) {
        self._keys.clear();
        if (self.onPointerLockLost) self.onPointerLockLost();
      }
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  FpsController.prototype.spawnAt = function (x, z, yaw) {
    this.position.set(x, this._getHeight(x, z) + EYE_HEIGHT, z);
    this.yaw = yaw;
    this.pitch = 0;
    this._vy = 0;
    this._grounded = true;
    this._crouched = false;    // ✅ v0.4.28: респавн — всегда стоя
    this.eyeH = EYE_HEIGHT;
    this._fallPeak = 0;        // ✅ v0.4.44: падение не переносится в нового героя
    this._landK = 0;
    this._airDir = null;       // ✅ v0.5.13: инерция не переносится в респавн
  };

  /* ✅ v0.4.44: зона лестницы под ногами (null — вне лестницы).
      {y0, y1} — допустимый диапазон высоты НОГ (низ/верх лестницы) */
  FpsController.prototype.setLadder = function (zone) { this._ladder = zone || null; };

  /* ✅ v0.4.28: присед (для состояния сети и анимации рук) */
  FpsController.prototype.isCrouched = function () { return !!this._crouched; };

  /* ============================================================
     ✅ v0.4.52 NOCLIP — полёт сквозь стены/двери/окна (админ-панель).
     Включение: коллизии и гравитация игнорируются (см. update).
     Выключение: пик падения и вертикальная скорость сбрасываются —
     если выключил в воздухе, падение начинается С ТЕКУЩЕЙ ТОЧКИ,
     урон от высоты считается честно от неё (без накопленного пика).
     ============================================================ */
  FpsController.prototype.setNoclip = function (v) {
    v = !!v;
    if (this.noclip === v) return;
    this.noclip = v;
    this._keys.delete('KeyC');
    if (v) {
      this._crouched = false;
      this._grounded = false;
      this._vy = 0;
    } else {
      this._fallPeak = this.position.y;
      this._vy = 0;
    }
  };

  /* ✅ v0.4.46 НЕЛЬЗЯ ВСТАТЬ: голова стоя (глаза 1.7 + макушка) упирается
     в какой-нибудь headBlock-бокс (площадка/верхний марш лестницы)
     ПРЯМО НАД ИГРОКОМ? Проверка по СЛЕДУ бокса (точка внутри бокса,
     без радиуса): стоя РЯДОМ с лестницей встать можно, ПОД ней — нет.
     Ступенька сверху (feet + 0.55 ≥ maxY) — не мешает */
  FpsController.prototype.cannotStand = function () {
    var bs = this._boxes;
    if (!bs || !bs.length) return false;
    var feet = this.position.y - this.eyeH;
    var head = EYE_HEIGHT + HEAD_MARGIN;
    var x = this.position.x, z = this.position.z;
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      if (b.active === false || !b.headBlock) continue;
      if (feet + 0.55 >= b.maxY) continue;    // ступенька — сверху не мешает
      if (feet + head <= b.minY) continue;    // низ выше головы — проход
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return true;
    }
    return false;
  };

  /* ============================================================
     ✅ v0.4.41 МОБИЛЬНОЕ УПРАВЛЕНИЕ (touch.js):
     setTouchVector — аналоговый вектор джойстика (x вбок, y вперёд);
     touchLook — свайп камеры (dx/dy в пикселях); setTouchKey —
     программное нажатие клавиш (Shift для бега с кнопки)
     ============================================================ */
  FpsController.prototype.setTouchVector = function (x, y) {
    this._touchVec.x = x;
    this._touchVec.y = y;
  };
  FpsController.prototype.touchLook = function (dx, dy) {
    if (!this.enabled) return;
    var mul = this.aimMul || 1;
    this.yaw -= dx * 0.0042 * mul;
    this.pitch = BrixNoise.clamp(this.pitch - dy * 0.0042 * mul, -1.5, 1.5);
  };
  FpsController.prototype.setTouchKey = function (code, down) {
    if (down) this._keys.add(code);
    else this._keys.delete(code);
  };

  FpsController.prototype.requestLock = function () {
    var p = this._dom.requestPointerLock();
    if (p && p.catch) p.catch(function () {});
  };

  /** ✅ v0.2.9: список коллайдеров мира [{x, z, r, active}] (из BrixWorld.buildDecor) */
  FpsController.prototype.setColliders = function (list) {
    this._colliders = list || [];
  };

  /* ✅ v0.4.24: ДОБАВИТЬ статические коллайдеры (маяк): старый список
     не трогаем — decor мутирует свой массив на месте */
  FpsController.prototype.addColliders = function (list) {
    if (list && list.length) this._colliders = this._colliders.concat(list);
  };
  FpsController.prototype.addBoxColliders = function (list) {
    if (list && list.length) this._boxes = this._boxes.concat(list);
  };

  /**
   * ✅ v0.4.6/0.4.7: КОРОБЧАТЫЕ коллайдеры стен/потолков/палуб (AABB) —
   * [{minX, maxX, minY, maxY, minZ, maxZ, active}]. Список мутирует
   * building.js (rebuildAux) — ссылка всегда живая.
   * ✅ v0.4.7: движение СНАЧАЛА по X, отдельно по Z (см. update): игрок
   * СКОЛЬЗИТ вдоль стены вместо «дёргания» на углах и при переходе
   * между соседними фундаментами. _boxBlocked — тест «круг игрока
   * против AABB» с высотными правилами:
   *   - бокс ЦЕЛИКОМ ВЫШЕ колен (feet + 0.25 < minY) — не блокирует:
   *     под палубой/потолком проход есть;
   *   - верх бокса В ПРЕДЕЛАХ СТУПЕНЬКИ (feet + 0.55 >= maxY) — не
   *     блокирует: groundAt поднимет игрока, он ЗАЙДЁТ сверху (угол
   *     фундамента на склоне, палуба чуть выше земли) — как в Rust;
   *   - иначе круг игрока (радиус 0.35) не должен пересекать бокс.
   */
  FpsController.prototype.setBoxColliders = function (list) {
    this._boxes = list || [];
  };

  /** ✅ v0.4.7: перекрывает ли какой-то активный бокс точку (x, z)
      на высоте ног feet (круг игрока радиусом PLAYER_RADIUS) */
  FpsController.prototype._boxBlocked = function (x, z, feet) {
    var bs = this._boxes;
    if (!bs || !bs.length) return false;
    var r2 = PLAYER_RADIUS * PLAYER_RADIUS;
    var head = this._headH();
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      if (b.active === false) continue;
      if (feet + 0.55 >= b.maxY) continue;         // ступенька — зайдём сверху
      if (b.headBlock) {
        /* ✅ v0.4.46: под лестницей — только присед: стоя голова
           упирается в низ бокса (стена), в приседе низ выше головы —
           проход (вместо старого правила «ниже колен») */
        if (feet + head <= b.minY) continue;       // присел — голова проходит
      } else {
        if (feet + 0.25 < b.minY) continue;        // бокс выше колен — под ним проход
      }
      var cx = x < b.minX ? b.minX : (x > b.maxX ? b.maxX : x);   // ближайшая точка бокса
      var cz = z < b.minZ ? b.minZ : (z > b.maxZ ? b.maxZ : z);
      var dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < r2) return true;
    }
    return false;
  };

  FpsController.prototype._resolveBoxes = function () {
    var bs = this._boxes;
    if (!bs || !bs.length) return;
    var feet = this.position.y - this.eyeH;
    var head = this._headH();
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      if (b.active === false) continue;
      // ✅ верх бокса в пределах ступеньки (0.55) — не блокируем:
      // groundAt поднимет игрока, он ЗАЙДЁТ сверху (угол фундамента
      // на склоне, палуба чуть выше земли) — как Rust
      if (feet + 0.55 >= b.maxY) continue;
      // ✅ v0.4.46: headBlock (лестница) — присел: голова ниже низа бокса,
      // не выталкиваем; встал — выталкивает из-под лестницы
      if (b.headBlock) {
        if (feet + head <= b.minY) continue;
      } else {
        if (feet + 0.25 < b.minY) continue;        // бокс целиком ниже ног
      }
      var minX = b.minX - PLAYER_RADIUS, maxX = b.maxX + PLAYER_RADIUS;
      var minZ = b.minZ - PLAYER_RADIUS, maxZ = b.maxZ + PLAYER_RADIUS;
      if (this.position.x <= minX || this.position.x >= maxX ||
          this.position.z <= minZ || this.position.z >= maxZ) continue;
      // проникновения по каждой оси — выталкиваем по меньшей
      var pxL = this.position.x - minX, pxR = maxX - this.position.x;
      var pzL = this.position.z - minZ, pzR = maxZ - this.position.z;
      var m = Math.min(pxL, pxR, pzL, pzR);
      if (m === pxL) this.position.x = minX;
      else if (m === pxR) this.position.x = maxX;
      else if (m === pzL) this.position.z = minZ;
      else this.position.z = maxZ;
    }
  };

  /**
   * ✅ v0.2.9: выталкивание игрока из цилиндров деревьев и камней.
   * Коллайдер {x, z, r, active} — активные не пропускают; дерево,
   * начавшее падать, и выработанная жила деактивируются в world.js.
   */
  FpsController.prototype._resolveColliders = function () {
    var cs = this._colliders;
    if (!cs || !cs.length) return;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (c.active === false) continue;
      var dx = this.position.x - c.x;
      var dz = this.position.z - c.z;
      var rr = c.r + PLAYER_RADIUS;
      var d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        if (d2 < 1e-8) {
          // игрок ровно в центре — вытолкнуть на север
          this.position.z = c.z + rr;
          continue;
        }
        var d = Math.sqrt(d2);
        var push = rr - d;
        this.position.x += (dx / d) * push;
        this.position.z += (dz / d) * push;
      }
    }
  };

  /** Состояние движения для анимации рук: { moving, sprint, onGround, crouch }.
      ✅ v0.5.13: sprint = Shift + ЧИСТО вперёд (W без A/D/S; на джойстике —
      стик отклонён вперёд без вбок) — руки и разброс честно показывают бег */
  FpsController.prototype.getMoveState = function () {
    var tMoving = this.enabled && (this._touchVec.x !== 0 || this._touchVec.y !== 0);
    var sh = this._keys.has('ShiftLeft') || this._keys.has('ShiftRight');
    var fwdKeys = this._keys.has('KeyW') && !this._keys.has('KeyS') &&
      !this._keys.has('KeyA') && !this._keys.has('KeyD');
    var fwdTouch = tMoving && this._touchVec.y < -0.25 &&
      Math.abs(this._touchVec.x) < 0.25;
    return {
      moving: (this.enabled && this._keys.size > 0 &&
        (this._keys.has('KeyW') || this._keys.has('KeyA') ||
         this._keys.has('KeyS') || this._keys.has('KeyD'))) || tMoving,
      sprint: sh && (fwdKeys || fwdTouch),
      onGround: this._grounded,
      crouch: this._crouched
    };
  };

  /** Обновление физики и камеры */
  FpsController.prototype.update = function (camera, dt) {
    if (dt > 0.1) dt = 0.1;

    /* ✅ v0.4.28: плавный переход высоты глаз 1.7 ↔ 1.05 (присед) */
    var eyeTarget = this._crouched ? CROUCH_EYE : EYE_HEIGHT;
    this.eyeH += (eyeTarget - this.eyeH) * Math.min(1, dt * 10);

    // движение относительно взгляда
    var fx = 0, fz = 0;
    if (this.enabled) {
      if (this._keys.has('KeyW')) fz -= 1;
      if (this._keys.has('KeyS')) fz += 1;
      if (this._keys.has('KeyA')) fx -= 1;
      if (this._keys.has('KeyD')) fx += 1;
      /* ✅ v0.4.41: аналоговый джойстик (мобильные) — складывается с
         клавишами; АНАЛОГОВОСТЬ: скорость пропорциональна отклонению */
      if (this._touchVec.x || this._touchVec.y) {
        fx += this._touchVec.x;
        fz += this._touchVec.y;
      }
    }
    var moving = fx !== 0 || fz !== 0;
    /* ✅ v0.4.44 ЛЕСТНИЦА: если ноги уже в зоне лестницы и игрок жмёт ВПЕРЁД
       (W) — горизонтальный шаг гасим (лезем ВВЕРХ на месте, не «уплываем»
       в стену/проём). Назад (S) — обычный шаг, можно сойти с лестницы */
    var feetPre = this.position.y - this.eyeH;
    var onLadderZone = !!(this._ladder && this.enabled &&
      feetPre >= this._ladder.y0 - 0.4 && feetPre <= this._ladder.y1 + 0.55);
    var climbingNow = onLadderZone && moving && fz < -0.25;
    /* ✅ v0.5.13 БЕГ ТОЛЬКО ВПЕРЁД: Shift работает, если W зажат БЕЗ
       A/D/S (на джойстике — стик отклонён вперёд без вбока).
       Назад/влево/вправо — только шаг, каким бы быстрым ни был игрок */
    var shHeld = this._keys.has('ShiftLeft') || this._keys.has('ShiftRight');
    var fwdKeys = this._keys.has('KeyW') && !this._keys.has('KeyS') &&
      !this._keys.has('KeyA') && !this._keys.has('KeyD');
    var fwdTouch = (this._touchVec.x || this._touchVec.y) &&
      this._touchVec.y < -0.25 && Math.abs(this._touchVec.x) < 0.25;
    var sprint = shHeld && (fwdKeys || fwdTouch);
    // ✅ v0.4.5: slowFactor < 1 — перезарядка револьвера (медленно даже бегом)
    // ✅ v0.4.15: BrixAdmin.speedOn — СКОРОСТЬ ×2 из панели разработчика
    var adminMul = (window.BrixAdmin && BrixAdmin.speedOn) ? 2 : 1;
    var speed = (sprint ? SPRINT_SPEED : WALK_SPEED) * (this.slowFactor || 1) * adminMul;
    // ✅ v0.4.28: в приседе скорость капается (бег недоступен)
    if (this._crouched) speed = Math.min(speed, CROUCH_SPEED);
    // ✅ v0.4.41: аналоговое отклонение джойстика — доля полной скорости
    var mag = Math.hypot(fx, fz);
    if (mag > 1) { fx /= mag; fz /= mag; speed *= Math.min(1, mag); }

    /* ============================================================
       ✅ v0.4.52 NOCLIP — ПОЛЁТ НАСКВОЗЬ СТЕН/ДВЕРЕЙ/ОКОН (админ-панель):
       коллизии (боксы/цилиндры), гравитация, лестницы и вода не
       действуют. WASD летит КУДА СМОТРИШЬ (вертикальная составляющая
       — от наклона камеры), Space — вверх, C — вниз. Урона от высоты
       нет (пик падения постоянно сбрасывается).
       ============================================================ */
    if (this.noclip) {
      this._crouched = false;
      var flyY = 0;
      if (this.enabled && this._keys.has('Space')) flyY += 1;
      if (this.enabled && this._keys.has('KeyC')) flyY -= 1;
      var nSpeed = (sprint ? SPRINT_SPEED : WALK_SPEED) * adminMul * 1.35;
      var magN = Math.hypot(fx, fz) || 1;
      var sinN = Math.sin(this.yaw), cosN = Math.cos(this.yaw);
      var dxN = (fx / magN) * cosN + (fz / magN) * sinN;
      var dzN = -(fx / magN) * sinN + (fz / magN) * cosN;
      var fwdN = moving ? (-fz / magN) : 0;                 // W = 1, S = -1
      var pitchN = Math.max(-1.5, Math.min(1.5, this.pitch));
      this.position.x += dxN * nSpeed * dt;
      this.position.z += dzN * nSpeed * dt;
      this.position.y += (flyY * nSpeed * 0.9 +
        fwdN * Math.sin(pitchN) * nSpeed) * dt;
      this._vy = 0;
      this._grounded = false;
      this._fallPeak = this.position.y;   // урона от высоты в noclip нет
      this._landK = 0;
      camera.position.set(this.position.x, this.position.y, this.position.z);
      camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      return;
    }

    // по колено в воде — медленнее (✅ v0.4.6: feetY — по палубе фундамента
    // вода под домом не замедляет)
    var floorH = this._getHeight(this.position.x, this.position.z, this.position.y - this.eyeH);
    if (floorH < 2.9) speed *= 0.55;

    /* ✅ v0.5.13: горизонтальный шаг — ТОЛЬКО на земле. В полёте
       (прыжок/падение) WASD НЕ рулит: летишь по инерции, набранной
       в момент прыжка (см. ниже — _airDir), на лестнице — свой режим */
    var airNow = !this._grounded && !onLadderZone;
    if (this._grounded && moving && !climbingNow) {
      var len = Math.hypot(fx, fz);
      fx /= len; fz /= len;
      var sin = Math.sin(this.yaw);
      var cos = Math.cos(this.yaw);
      // поворот локального направления на yaw вокруг Y (вперёд = (-sin, -cos))
      var dx = fx * cos + fz * sin;
      var dz = -fx * sin + fz * cos;
      // ✅ v0.4.7 ПЛАВНОЕ ДВИЖЕНИЕ: шаг по X и шаг по Z проверяются
      // ОТДЕЛЬНО. Стена на пути блокирует ТОЛЬКО свою ось — игрок
      // скользит вдоль неё, не дёргается на углах и легко переходит
      // между соседними фундаментами (даже когда рядом стоят стены)
      var feetNow = this.position.y - this.eyeH;
      if (dx !== 0) {
        var oldX = this.position.x;
        this.position.x += dx * speed * dt;
        if (this._boxBlocked(this.position.x, this.position.z, feetNow)) {
          this.position.x = oldX;
        }
      }
      if (dz !== 0) {
        var oldZ = this.position.z;
        this.position.z += dz * speed * dt;
        if (this._boxBlocked(this.position.x, this.position.z, feetNow)) {
          this.position.z = oldZ;
        }
      }
    } else if (airNow && this._airDir) {
      /* ✅ v0.5.13 ПОЛЁТ ПО ИНЕРЦИИ: направление и скорость зафиксированы
         в момент прыжка; нажатия WASD в воздухе игнорируются — как
         просил игрок («прыгнул вперёд — игрок не двигается от WASD») */
      var feetAir = this.position.y - this.eyeH;
      var ox = this.position.x;
      this.position.x += this._airDir.dx * this._airDir.sp * dt;
      if (this._boxBlocked(this.position.x, this.position.z, feetAir)) {
        this.position.x = ox;
      }
      var oz = this.position.z;
      this.position.z += this._airDir.dz * this._airDir.sp * dt;
      if (this._boxBlocked(this.position.x, this.position.z, feetAir)) {
        this.position.z = oz;
      }
    }

    // ✅ v0.2.9: стволы деревьев и камни — сквозь них не пройти
    // (и после прыжка тоже: разрешаем коллизии каждый кадр)
    this._resolveColliders();
    // ✅ v0.4.6/0.4.7: страховка — если игрок всё же оказался ВНУТРИ
    // бокса (спавн в стене, постройка вокруг игрока) — выталкиваем.
    // При обычной ходьбе раздельные оси (выше) не дают внутрь попасть
    this._resolveBoxes();

    // вертикальная физика (✅ v0.4.6: feetY — ходьба по фундаментам/потолкам)
    var ground = this._getHeight(this.position.x, this.position.z,
      this.position.y - this.eyeH) + this.eyeH;
    // ✅ v0.4.28: из приседа не прыгаем (как в Rust)
    if (this.enabled && this._grounded && !this._crouched && this._keys.has('Space')) {
      this._vy = JUMP_SPEED;
      this._grounded = false;
      /* ✅ v0.5.13 ИНЕРЦИЯ ПРЫЖКА: фиксируем направление и скорость
         НА МОМЕНТ прыжка. В воздухе WASD не работает — летишь туда,
         куда прыгнул (вперёд — вперёд, с места — строго вверх) */
      if (moving && !climbingNow) {
        var jl = Math.hypot(fx, fz) || 1;
        var jfx = fx / jl, jfz = fz / jl;
        var jsin = Math.sin(this.yaw), jcos = Math.cos(this.yaw);
        this._airDir = {
          dx: jfx * jcos + jfz * jsin,
          dz: -jfx * jsin + jfz * jcos,
          sp: speed
        };
      } else {
        this._airDir = null;   // прыжок с места — полёт без смещения
      }
    }

    /* ============================================================
       ✅ v0.4.44 ЛЕСТНИЦА (залезть на 2 этаж): пока игрок внутри зоны
       лестницы (feet между y0 и y1) — гравитация выключена («взялсь за
       перекладины»): W/вперёд или Space — лезем вверх, S/назад — вниз.
       На вершине шагаем НАЗАЗД на потолок 2 этажа (floorAt соседней
       клетки держит игрока — см. floorAt в building.js)
       ============================================================ */
    var feetL = this.position.y - this.eyeH;
    var inLadder = !!(this._ladder && this.enabled &&
      feetL >= this._ladder.y0 - 0.4 && feetL <= this._ladder.y1 + 0.55);
    if (inLadder) this._airDir = null;   // ✅ v0.5.13: на лестнице инерции нет
    if (inLadder && climbingNow) {
      // лезем вверх (и с клавиатуры W, и с джойстика)
      this.position.y += LADDER_SPEED * dt;
      this._vy = 0;
      this._grounded = false;
      this._fallPeak = this.position.y;
    } else if (inLadder && moving && fz > 0.25) {
      // спускаемся
      this.position.y -= LADDER_SPEED * dt;
      this._vy = 0;
      this._grounded = false;
      this._fallPeak = this.position.y;
    } else if (inLadder && this.enabled && this._keys.has('Space')) {
      this.position.y += LADDER_SPEED * dt;
      this._vy = 0;
      this._grounded = false;
      this._fallPeak = this.position.y;
    } else if (inLadder && !this._grounded) {
      // держимся за лестницу: не падаем, медленно съезжаем вниз
      this._vy = 0;
      this._fallPeak = this.position.y;
      this.position.y -= 0.35 * dt;
      if (this.position.y - this.eyeH <= this._ladder.y0) {
        this.position.y = this._ladder.y0 + this.eyeH;
        this._grounded = true;
      }
    } else if (!this._grounded) {
      var prevY = this.position.y;         // высота глаз до шага кадра
      this._vy -= GRAVITY * dt;
      if (this._vy < -FALL_V_MAX) this._vy = -FALL_V_MAX;   // ✅ v0.4.44 терминальная скорость
      this.position.y += this._vy * dt;
      if (this.position.y > this._fallPeak) this._fallPeak = this.position.y;
      /* ✅ v0.4.41 ГОЛОВА ОБ ПОТОЛОК: раньше при прыжке под потолком
         игрок ПРОЛЕТАЛ сквозь него наверх (оказывался на крыше, не
         строя её). Теперь пока летим ВВЕРХ (_vy > 0) проверяем боксы
         построек НА ПЕРЕСЕЧЕНИЕ: если макушка (глаза + 0.12 м) за этот
         кадр пересекла низ бокса (была ниже — стала выше) — упёрся:
         ставим глаза чуть ниже потолка, подъём гаснет, игрок падает
         обратно. Пересечение (а не «голова внутри бокса») — чтобы при
         просадке FPS крупный шаг кадра не перепрыгивал потолок целиком */
      if (this._vy > 0 && this._boxes && this._boxes.length) {
        var prevHead = prevY + 0.12;
        var newHead = this.position.y + 0.12;
        for (var bi = 0; bi < this._boxes.length; bi++) {
          var bb = this._boxes[bi];
          if (bb.active === false) continue;
          if (prevHead > bb.minY || newHead < bb.minY) continue;  // не пересёк низ
          var hx = this.position.x;
          var hz = this.position.z;
          if (hx < bb.minX - PLAYER_RADIUS || hx > bb.maxX + PLAYER_RADIUS ||
              hz < bb.minZ - PLAYER_RADIUS || hz > bb.maxZ + PLAYER_RADIUS) continue;
          this.position.y = bb.minY - 0.12;
          this._vy = 0;
          break;
        }
      }
      if (this.position.y <= ground) {
        this.position.y = ground;
        /* ✅ v0.4.44 УРОН ОТ ВЫСОТЫ + АНИМАЦИЯ ПРИЗЕМЛЕНИЯ: высота падения —
           от пика (не от «вышел из-под потолка»). Вода (уровень < 3.0) гасит
           урон. Урон идёт через onFallDamage (gameworld шлёт fdmg серверу) */
        var fallDist = this._fallPeak - this.position.y;   // м, по глазам
        if (fallDist > FALL_LAND_MIN) this._landK = 1;   // присед камеры при посадке
        if (this.onFallDamage && fallDist > FALL_DMG_FROM && ground - this.eyeH >= 3.0) {
          var fd = Math.min(FALL_DMG_MAX,
            Math.round((fallDist - FALL_DMG_FROM) * FALL_DMG_PER_M));
          if (fd > 0) {
            try { this.onFallDamage({ dist: Math.round(fallDist * 10) / 10, dmg: fd }); }
            catch (eFall) {}
          }
        }
        this._fallPeak = this.position.y;
        this._vy = 0;
        this._grounded = true;
        this._airDir = null;   // ✅ v0.5.13: приземлился — WASD снова рулит
      }
    } else {
      /* ✅ v0.4.44 ФИКС «РЕЗКО ПАДАЕШЬ С ФУНДАМЕНТА»: раньше стоящего игрока
         ВСЕГДА прижимало к земле (position.y = ground) — сход с края палубы
         телепортировал вниз за 1 кадр. Теперь: земля просела меньше ступеньки
         (FALL_GRAB) — прижимаем (склон, спуск по лестнице высоты фундамента);
         земля провалилась СИЛЬНО — значит сошли с края: НАСТОЯЩЕЕ ПАДЕНИЕ
         с ускорением и уроном (обрывающаяся высота считается от текущей точки) */
      if (ground >= this.position.y - FALL_GRAB) {
        this.position.y = ground;
        this._fallPeak = this.position.y;
      } else {
        this._grounded = false;
        this._vy = 0;
        this._fallPeak = this.position.y;
      }
    }

    /* ✅ v0.4.44: анимация приземления — камера коротко «приседает» */
    if (this._landK > 0) {
      this._landK = Math.max(0, this._landK - dt * 2.6);
    }

    // лёгкое покачивание при ходьбе
    var bob = 0;
    if (moving && this._grounded) {
      this._bobPhase += dt * speed * 1.15;
      bob = Math.sin(this._bobPhase) * 0.045;
    }
    var landDip = Math.sin(this._landK * Math.PI) * 0.22;   // 0 → 0.22 → 0

    camera.position.set(this.position.x, this.position.y + bob - landDip, this.position.z);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  };

  FpsController.prototype.dispose = function () {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    if (document.pointerLockElement === this._dom) document.exitPointerLock();
  };

  return { FpsController: FpsController };
})();
