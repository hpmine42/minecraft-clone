// touch.js — Mobile controls: virtual joystick, look drag, buttons, and multi-touch.

export function isTouchDevice() {
  return (
    ('ontouchstart' in window) ||
    (navigator.maxTouchPoints > 0) ||
    window.matchMedia('(pointer: coarse)').matches
  );
}

// Prevent duplicate touch/emulated-mouse events
let lastTouchTime = -Infinity;
export function markTouchEvent() {
  lastTouchTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
}
export function wasRecentTouch() {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now()) - lastTouchTime < 700;
}

/** Convert a screen position into a world ray for touch interactions. */
export function screenRayDirection(player, point, width, height, fovDegrees = 75) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const ndcX = (point.x / safeWidth) * 2 - 1;
  const ndcY = 1 - (point.y / safeHeight) * 2;
  const halfHeight = Math.tan((fovDegrees * Math.PI / 180) / 2);
  const aspect = safeWidth / safeHeight;
  const forward = player.lookDir();
  const right = { x: Math.cos(player.yaw), y: 0, z: -Math.sin(player.yaw) };
  const up = {
    x: Math.sin(player.yaw) * Math.sin(player.pitch),
    y: Math.cos(player.pitch),
    z: Math.cos(player.yaw) * Math.sin(player.pitch),
  };
  const x = forward.x + right.x * ndcX * aspect * halfHeight + up.x * ndcY * halfHeight;
  const y = forward.y + right.y * ndcX * aspect * halfHeight + up.y * ndcY * halfHeight;
  const z = forward.z + right.z * ndcX * aspect * halfHeight + up.z * ndcY * halfHeight;
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

export class TouchControls {
  /**
   * @param {object} els DOM elements
   *   joystickZone, lookZone, btnJump, btnSneak, btnFly, btnAttack, btnPlace, btnInventory, btnMenu
   * @param {object} opts { sensitivity, onAction(name) }
   */
  constructor(els, opts = {}) {
    this.els = els;
    this.sensitivity = opts.sensitivity ?? 0.0042;
    this.onAction = opts.onAction || (() => {});

    // Joystick
    this.joyId = null;
    this.joyOrigin = { x: 0, y: 0 };
    this.joyValue = { x: 0, y: 0 }; // x=right, y=forward
    this.joyRadius = 58;

    // Look
    this.lookId = null;
    this.lookLast = { x: 0, y: 0 };
    this.lookDelta = { x: 0, y: 0 };
    this.mineId = null;
    this.mineStart = null;
    this.mineMoved = false;
    this.mineHoldDelay = opts.mineHoldDelay ?? 140;
    this.mineMoveThreshold = opts.mineMoveThreshold ?? 18;

    // Buttons
    this.jump = false;
    this.sneak = false;
    this.attack = false;
    this.attackPressed = false;
    this.usePressed = false;
    this.flyPressed = false;

    this._lastJumpTap = -Infinity;
    this.enabled = true;

    this._bindJoystick();
    this._bindLook();
    this._bindButtons();
  }

  _startMineHold(touch) {
    this.mineId = touch.identifier;
    this.mineStart = {
      x: touch.clientX,
      y: touch.clientY,
      startedAt: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    };
    this.mineMoved = false;
  }

  _moveMineHold(touch) {
    if (this.mineId !== touch.identifier || !this.mineStart) return;
    if (Math.hypot(touch.clientX - this.mineStart.x, touch.clientY - this.mineStart.y) > this.mineMoveThreshold) {
      // Swiping remains purely look/movement control.
      this.mineMoved = true;
    }
  }

  _endMineHold(touch) {
    if (this.mineId !== touch.identifier) return;
    this.mineId = null;
    this.mineStart = null;
    this.mineMoved = false;
  }

  _bindJoystick() {
    const el = this.els.joystickZone;
    if (!el) return;
    const knob = this.els.joystickKnob;

    const start = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      markTouchEvent();
      const t = e.changedTouches[0];
      this.joyId = t.identifier;
      this._startMineHold(t);
      const rect = el.getBoundingClientRect();
      this.joyOrigin = { x: t.clientX, y: t.clientY };
      this._joyRect = rect;
      if (knob) knob.style.opacity = '1';
      this._moveKnob(0, 0);
    };
    const move = (e) => {
      if (this.joyId == null) return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== this.joyId) continue;
        this._moveMineHold(t);
        let dx = t.clientX - this.joyOrigin.x;
        let dy = t.clientY - this.joyOrigin.y;
        const len = Math.hypot(dx, dy);
        if (len > this.joyRadius) {
          dx = (dx / len) * this.joyRadius;
          dy = (dy / len) * this.joyRadius;
        }
        this.joyValue.x = dx / this.joyRadius;
        this.joyValue.y = -dy / this.joyRadius;
        this._moveKnob(dx, dy);
      }
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joyId) {
          this._endMineHold(t);
          this.joyId = null;
          this.joyValue = { x: 0, y: 0 };
          this._moveKnob(0, 0);
          if (knob) knob.style.opacity = '0.55';
        }
      }
    };
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end, { passive: true });
    el.addEventListener('touchcancel', end, { passive: true });
  }

  _moveKnob(dx, dy) {
    const knob = this.els.joystickKnob;
    if (!knob) return;
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  _bindLook() {
    const el = this.els.lookZone;
    if (!el) return;

    const start = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      markTouchEvent();
      const t = e.changedTouches[0];
      this.lookId = t.identifier;
      this.lookLast = { x: t.clientX, y: t.clientY };
      this._startMineHold(t);
    };
    const move = (e) => {
      if (this.lookId == null) return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== this.lookId) continue;
        const dx = t.clientX - this.lookLast.x;
        const dy = t.clientY - this.lookLast.y;
        this.lookLast = { x: t.clientX, y: t.clientY };
        this.lookDelta.x += dx * this.sensitivity;
        this.lookDelta.y += dy * this.sensitivity;
        this._moveMineHold(t);
      }
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.lookId) {
          this.lookId = null;
          this._endMineHold(t);
        }
      }
    };
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end, { passive: true });
    el.addEventListener('touchcancel', end, { passive: true });
  }

  _bindButtons() {
    const bind = (el, down, up) => {
      if (!el) return;
      const onDown = (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        e.stopPropagation();
        markTouchEvent();
        el.classList.add('pressed');
        down();
      };
      const onUp = (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove('pressed');
        if (up) up();
      };
      el.addEventListener('touchstart', onDown, { passive: false });
      el.addEventListener('touchend', onUp, { passive: false });
      el.addEventListener('touchcancel', onUp, { passive: false });
      // Mouse support (for hybrid devices/tests), but not immediately after touch
      el.addEventListener('mousedown', (e) => {
        if (wasRecentTouch()) return;
        e.preventDefault();
        el.classList.add('pressed');
        down();
      });
      el.addEventListener('mouseup', (e) => {
        if (wasRecentTouch()) return;
        e.preventDefault();
        el.classList.remove('pressed');
        if (up) up();
      });
    };

    bind(this.els.btnJump, () => {
      this.jump = true;
      const now = performance.now();
      if (now - this._lastJumpTap < 320) {
        this.flyPressed = true;
        this.onAction('doubleJump');
      }
      this._lastJumpTap = now;
    }, () => { this.jump = false; });

    bind(this.els.btnSneak, () => {
      this.setSneak(!this.sneak); // Toggle; the state also remains visually indicated.
      this.onAction('sneak');
    }, null);

    bind(this.els.btnFly, () => {
      this.flyPressed = true;
      this.onAction('fly');
    }, null);

    bind(this.els.btnAttack, () => {
      this.attack = true;
      this.attackPressed = true;
      this.onAction('attack');
    }, () => { this.attack = false; });

    bind(this.els.btnPlace, () => {
      this.usePressed = true;
      this.onAction('place');
    }, null);

    bind(this.els.btnInventory, () => this.onAction('inventory'), null);
    bind(this.els.btnMenu, () => this.onAction('menu'), null);
    bind(this.els.btnCraft, () => this.onAction('craft'), null);
    bind(this.els.btnDebug, () => this.onAction('debug'), null);
    bind(this.els.btnChatless ?? null, () => this.onAction('cycleMode'), null);
  }

  /** Set the sneak toggle and synchronize its touch indicator. */
  setSneak(active) {
    this.sneak = !!active;
    this.els.btnSneak?.classList.toggle('toggled', this.sneak);
  }

  /**
   * Position of a stationary long press, equivalent to “hold to mine.”
   * Swiping does not mine; it rotates the camera as usual.
   */
  minePoint(now = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
    if (!this.enabled || this.mineId == null || !this.mineStart || this.mineMoved) return null;
    if (now - this.mineStart.startedAt < this.mineHoldDelay) return null;
    return { x: this.mineStart.x, y: this.mineStart.y };
  }

  /** Same shape as Input.movement(). */
  movement() {
    return {
      forward: this.joyValue.y,
      right: this.joyValue.x,
      jump: this.jump,
      sneak: this.sneak,
      sprint: Math.hypot(this.joyValue.x, this.joyValue.y) > 0.92,
    };
  }

  consumeLook() {
    const d = { ...this.lookDelta };
    this.lookDelta = { x: 0, y: 0 };
    return d;
  }

  consumePressed() {
    const a = this.attackPressed;
    const u = this.usePressed;
    const f = this.flyPressed;
    this.attackPressed = false;
    this.usePressed = false;
    this.flyPressed = false;
    return { attack: a, use: u, fly: f };
  }
}
