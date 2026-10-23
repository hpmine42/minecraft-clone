// input.js — Keyboard + mouse (desktop) with pointer lock.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
    this.attack = false;       // Mouse button held
    this.attackPressed = false; // only in this frame
    this.usePressed = false;    // right mouse button in this frame
    this.use = false;
    this.locked = false;
    this.enabled = true;
    this.sensitivity = 0.0022;
    this.onPause = null;
    this.onKey = null;
    this.shouldCaptureWheel = null;

    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (this.onKey) this.onKey(e.code, true, e);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F1', 'F3', 'KeyE'].includes(e.code)) {
        if (e.code === 'Tab' || e.code === 'F1' || e.code === 'F3' || e.code === 'Space') e.preventDefault();
      }
    };
    this._onKeyUp = (e) => {
      this.keys.delete(e.code);
      if (this.onKey) this.onKey(e.code, false, e);
    };
    this._onMouseMove = (e) => {
      if (!this.enabled) return;
      // Always with pointer lock; without lock only while holding the mouse button (drag-look fallback,
      // e.g. when pointer lock is blocked in iframes)
      if (!this.locked && !this.attack && !this.use && !this.dragLook) return;
      this.mouseDX += e.movementX || (e.mozMovementX || 0);
      this.mouseDY += e.movementY || (e.mozMovementY || 0);
    };
    this._onMouseDown = (e) => {
      if (!this.enabled) return;
      // Without pointer lock, buttons still work (drag-look),
      // but only while in the game (canvas focus)
      if (!this.locked && e.target !== this.canvas) return;
      if (e.button === 0) { this.attack = true; this.attackPressed = true; }
      if (e.button === 2) { this.use = true; this.usePressed = true; }
      if (e.button === 1) { e.preventDefault(); this.pickPressed = true; }
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.attack = false;
      if (e.button === 2) this.use = false;
    };
    this._onWheel = (e) => {
      if (!this.enabled || (this.shouldCaptureWheel && !this.shouldCaptureWheel())) return;
      this.wheelDelta += Math.sign(e.deltaY);
      e.preventDefault();
    };
    this._onContext = (e) => e.preventDefault();
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked && this.onPause) this.onPause();
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('wheel', this._onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this._onContext);
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  /** Request pointer lock. */
  lock() {
    if (this.canvas.requestPointerLock) {
      this.canvas.requestPointerLock();
    }
  }

  unlock() {
    if (document.exitPointerLock) document.exitPointerLock();
  }

  isDown(code) {
    return this.keys.has(code);
  }

  /** Movement input from the keyboard. */
  movement() {
    let forward = 0;
    let right = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) forward += 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) forward -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) right += 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) right -= 1;
    return {
      forward,
      right,
      jump: this.isDown('Space'),
      sneak: this.isDown('ShiftLeft') || this.isDown('ShiftRight'),
      sprint: this.isDown('ControlLeft') || this.isDown('ControlRight') || this.isDown('KeyR') || this.sprintToggle,
    };
  }

  /** Consume and reset the mouse delta. */
  consumeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx: dx * this.sensitivity, dy: dy * this.sensitivity };
  }

  consumeWheel() {
    const w = this.wheelDelta;
    this.wheelDelta = 0;
    return w;
  }

  consumePressed() {
    const a = this.attackPressed;
    const u = this.usePressed;
    const p = this.pickPressed;
    this.attackPressed = false;
    this.usePressed = false;
    this.pickPressed = false;
    return { attack: a, use: u, pick: p };
  }
}
