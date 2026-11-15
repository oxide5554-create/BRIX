// ============================================================
//  brix • js/game/controls.js
//  Управление от первого лица: pointer lock, мышь — обзор,
//  WASD/Shift/Space — движение, гравитация и ходьба по рельефу.
//  Полный перенос из lib/game/controls.ts (класс FpsController).
// ============================================================
window.BrixControls = (function () {
  'use strict';

  var EYE_HEIGHT = 1.7;
  var WALK_SPEED = 6;
  var SPRINT_SPEED = 10.5;
  var GRAVITY = 24;
  var JUMP_SPEED = 8.6;
  var PLAYER_RADIUS = 0.35; // «толщина» игрока для коллайдеров (v0.2.9)

  function FpsController(dom, getHeight) {
    this.position = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.enabled = false;
    this.onPointerLockLost = null;
    this._colliders = [];    // ✅ v0.2.9: цилиндры деревьев и камней

    this._dom = dom;
    this._keys = new Set();
    this._vy = 0;
    this._grounded = false;
    this._bobPhase = 0;
    this._getHeight = getHeight;

    var self = this;
    this._onKeyDown = function (e) {
      if (!self.enabled) return;
      self._keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    };
    this._onKeyUp = function (e) { self._keys.delete(e.code); };
    this._onMouseMove = function (e) {
      if (!self.enabled || document.pointerLockElement !== self._dom) return;
      self.yaw -= e.movementX * 0.0022;
      self.pitch = BrixNoise.clamp(self.pitch - e.movementY * 0.0022, -1.5, 1.5);
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
  };

  FpsController.prototype.requestLock = function () {
    var p = this._dom.requestPointerLock();
    if (p && p.catch) p.catch(function () {});
  };

  /** ✅ v0.2.9: список коллайдеров мира [{x, z, r, active}] (из BrixWorld.buildDecor) */
  FpsController.prototype.setColliders = function (list) {
    this._colliders = list || [];
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

  /** Состояние движения для анимации рук: { moving, sprint, onGround } */
  FpsController.prototype.getMoveState = function () {
    return {
      moving: this.enabled && this._keys.size > 0 &&
        (this._keys.has('KeyW') || this._keys.has('KeyA') ||
         this._keys.has('KeyS') || this._keys.has('KeyD')),
      sprint: this._keys.has('ShiftLeft') || this._keys.has('ShiftRight'),
      onGround: this._grounded
    };
  };

  /** Обновление физики и камеры */
  FpsController.prototype.update = function (camera, dt) {
    if (dt > 0.1) dt = 0.1;

    // движение относительно взгляда
    var fx = 0, fz = 0;
    if (this.enabled) {
      if (this._keys.has('KeyW')) fz -= 1;
      if (this._keys.has('KeyS')) fz += 1;
      if (this._keys.has('KeyA')) fx -= 1;
      if (this._keys.has('KeyD')) fx += 1;
    }
    var moving = fx !== 0 || fz !== 0;
    var sprint = this._keys.has('ShiftLeft') || this._keys.has('ShiftRight');
    var speed = sprint ? SPRINT_SPEED : WALK_SPEED;

    // по колено в воде — медленнее
    var floorH = this._getHeight(this.position.x, this.position.z);
    if (floorH < 2.9) speed *= 0.55;

    if (moving) {
      var len = Math.hypot(fx, fz);
      fx /= len; fz /= len;
      var sin = Math.sin(this.yaw);
      var cos = Math.cos(this.yaw);
      // поворот локального направления на yaw вокруг Y (вперёд = (-sin, -cos))
      var dx = fx * cos + fz * sin;
      var dz = -fx * sin + fz * cos;
      this.position.x += dx * speed * dt;
      this.position.z += dz * speed * dt;
    }

    // ✅ v0.2.9: стволы деревьев и камни — сквозь них не пройти
    // (и после прыжка тоже: разрешаем коллизии каждый кадр)
    this._resolveColliders();

    // вертикальная физика
    var ground = this._getHeight(this.position.x, this.position.z) + EYE_HEIGHT;
    if (this.enabled && this._grounded && this._keys.has('Space')) {
      this._vy = JUMP_SPEED;
      this._grounded = false;
    }
    if (!this._grounded) {
      this._vy -= GRAVITY * dt;
      this.position.y += this._vy * dt;
      if (this.position.y <= ground) {
        this.position.y = ground;
        this._vy = 0;
        this._grounded = true;
      }
    } else {
      this.position.y = ground;
    }

    // лёгкое покачивание при ходьбе
    var bob = 0;
    if (moving && this._grounded) {
      this._bobPhase += dt * speed * 1.15;
      bob = Math.sin(this._bobPhase) * 0.045;
    }

    camera.position.set(this.position.x, this.position.y + bob, this.position.z);
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
