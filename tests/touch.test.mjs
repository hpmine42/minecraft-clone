// touch.test.mjs — Test touch controls: joystick, look drag, buttons, and double jump.
import { TouchControls, isTouchDevice, markTouchEvent, wasRecentTouch, screenRayDirection } from '../src/core/touch.js';

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) passed++;
  else { failed++; console.error('FAIL:', msg); }
}

// DOM stubs with event capture
function makeEl() {
  const listeners = {};
  const classes = new Set();
  return {
    listeners,
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      toggle(name, force) {
        const next = force ?? !classes.has(name);
        if (next) classes.add(name);
        else classes.delete(name);
        return next;
      },
      contains(name) { return classes.has(name); },
    },
    style: {},
    addEventListener(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    dispatch(type, event) {
      for (const fn of listeners[type] || []) fn(event);
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400 }),
  };
}

const makeEvent = (touches) => ({
  preventDefault() {},
  stopPropagation() {},
  changedTouches: touches,
  touches,
});

Object.defineProperty(globalThis, 'navigator', {
  value: { maxTouchPoints: 5, userAgent: 'touch-test' },
  configurable: true,
});
globalThis.window = {
  addEventListener() {},
  matchMedia: () => ({ matches: true }),
  innerWidth: 390,
  innerHeight: 844,
};
globalThis.performance = globalThis.performance || { now: () => Date.now() };

const els = {
  joystickZone: makeEl(),
  joystickKnob: makeEl(),
  lookZone: makeEl(),
  btnJump: makeEl(),
  btnSneak: makeEl(),
  btnFly: makeEl(),
  btnAttack: makeEl(),
  btnPlace: makeEl(),
  btnInventory: makeEl(),
  btnMenu: makeEl(),
  btnCraft: makeEl(),
  btnDebug: makeEl(),
};

const actions = [];
const touch = new TouchControls(els, {
  sensitivity: 0.004,
  onAction: (name) => actions.push(name),
});
ok(touch._lastJumpTap === -Infinity, 'The first jump cannot count as a double tap');

// ---- Joystick --------------------------------------------------------------
els.joystickZone.dispatch('touchstart', makeEvent([{ identifier: 1, clientX: 100, clientY: 300 }]));
els.joystickZone.dispatch('touchmove', makeEvent([{ identifier: 1, clientX: 100 + 58, clientY: 300 }]));
let m = touch.movement();
ok(Math.abs(m.right - 1) < 0.01, `Joystick right = ${m.right.toFixed(2)} (≈1)`);
ok(Math.abs(m.forward) < 0.01, `Joystick forward = ${m.forward.toFixed(2)} (≈0)`);

els.joystickZone.dispatch('touchmove', makeEvent([{ identifier: 1, clientX: 100, clientY: 300 - 58 }]));
m = touch.movement();
ok(Math.abs(m.forward - 1) < 0.01, `Joystick forward = ${m.forward.toFixed(2)} (≈1)`);

// Clamp beyond the boundary
els.joystickZone.dispatch('touchmove', makeEvent([{ identifier: 1, clientX: 100 + 300, clientY: 300 - 300 }]));
m = touch.movement();
ok(Math.hypot(m.right, m.forward) <= 1.02, `Joystick begrenzt (len=${Math.hypot(m.right, m.forward).toFixed(2)})`);
ok(m.sprint === true, 'Joystick fully deflected → sprint');

els.joystickZone.dispatch('touchend', makeEvent([{ identifier: 1, clientX: 0, clientY: 0 }]));
m = touch.movement();
ok(m.right === 0 && m.forward === 0, 'Joystick resets after release');

els.joystickZone.dispatch('touchstart', makeEvent([{ identifier: 13, clientX: 80, clientY: 500 }]));
await new Promise((r) => setTimeout(r, 160));
const joystickMine = touch.minePoint();
ok(joystickMine?.x === 80 && joystickMine?.y === 500,
  'Stationary long press also works to the left of the joystick knob');
els.joystickZone.dispatch('touchend', makeEvent([{ identifier: 13, clientX: 80, clientY: 500 }]));

// ---- Look-Drag -------------------------------------------------------------
els.lookZone.dispatch('touchstart', makeEvent([{ identifier: 2, clientX: 300, clientY: 100 }]));
els.lookZone.dispatch('touchmove', makeEvent([{ identifier: 2, clientX: 340, clientY: 110 }]));
const look = touch.consumeLook();
ok(Math.abs(look.x - 40 * 0.004) < 0.001, `Look-Delta X (${look.x.toFixed(4)})`);
ok(Math.abs(look.y - 10 * 0.004) < 0.001, `Look-Delta Y (${look.y.toFixed(4)})`);
const look2 = touch.consumeLook();
ok(look2.x === 0 && look2.y === 0, 'Look delta is consumed');
els.lookZone.dispatch('touchend', makeEvent([{ identifier: 2, clientX: 340, clientY: 110 }]));
els.lookZone.dispatch('touchmove', makeEvent([{ identifier: 2, clientX: 400, clientY: 100 }]));
const look3 = touch.consumeLook();
ok(look3.x === 0, 'No look movement after touch ends');

// Screen ray: center matches look direction; edge points are offset.
const rayPlayer = {
  yaw: 0,
  pitch: 0,
  lookDir: () => ({ x: 0, y: 0, z: -1 }),
};
const centerRay = screenRayDirection(rayPlayer, { x: 195, y: 422 }, 390, 844, 75);
ok(Math.abs(centerRay.x) < 0.001 && Math.abs(centerRay.y) < 0.001 && centerRay.z < -0.999,
  'Screen center aims straight ahead');
const upperRightRay = screenRayDirection(rayPlayer, { x: 292.5, y: 211 }, 390, 844, 75);
ok(upperRightRay.x > 0 && upperRightRay.y > 0 && upperRightRay.z < 0,
  'Top-right touch position produces the correct world ray');
ok(Math.abs(Math.hypot(upperRightRay.x, upperRightRay.y, upperRightRay.z) - 1) < 0.001,
  'Touch ray is normalized');

// Long press to mine (after 140 ms); swiping remains purely look control.
els.lookZone.dispatch('touchstart', makeEvent([{ identifier: 12, clientX: 280, clientY: 250 }]));
await new Promise((r) => setTimeout(r, 160));
const minePoint = touch.minePoint();
ok(minePoint?.x === 280 && minePoint?.y === 250, 'Holding still activates mobile long press');
els.lookZone.dispatch('touchmove', makeEvent([{ identifier: 12, clientX: 300, clientY: 250 }]));
ok(touch.minePoint() === null, 'Swiping rotates the view without triggering mining');
els.lookZone.dispatch('touchend', makeEvent([{ identifier: 12, clientX: 300, clientY: 250 }]));
ok(touch.minePoint() === null, 'Releasing ends mobile long press');

// ---- Buttons ---------------------------------------------------------------
els.btnAttack.dispatch('touchstart', makeEvent([{ identifier: 3, clientX: 10, clientY: 10 }]));
ok(touch.attack === true, 'Attack held');
let pressed = touch.consumePressed();
ok(pressed.attack === true, 'attackPressed set');
els.btnAttack.dispatch('touchend', makeEvent([{ identifier: 3, clientX: 10, clientY: 10 }]));
ok(touch.attack === false, 'Attack released');

els.btnPlace.dispatch('touchstart', makeEvent([{ identifier: 4, clientX: 10, clientY: 10 }]));
els.btnPlace.dispatch('touchend', makeEvent([{ identifier: 4, clientX: 10, clientY: 10 }]));
pressed = touch.consumePressed();
ok(pressed.use === true, 'Place triggered');

// Jump + double jump (fly)
const doubleJumpsBefore = actions.filter((action) => action === 'doubleJump').length;
els.btnJump.dispatch('touchstart', makeEvent([{ identifier: 5, clientX: 10, clientY: 10 }]));
ok(touch.jump === true, 'Jump held');
ok(actions.filter((action) => action === 'doubleJump').length === doubleJumpsBefore,
  'The first jump after loading does not accidentally enable flight');
els.btnJump.dispatch('touchend', makeEvent([{ identifier: 5, clientX: 10, clientY: 10 }]));
ok(touch.jump === false, 'Jump released');
// Second tap within 320 ms
els.btnJump.dispatch('touchstart', makeEvent([{ identifier: 6, clientX: 10, clientY: 10 }]));
ok(actions.filter((action) => action === 'doubleJump').length === doubleJumpsBefore + 1,
  'Double jump detected');

// Sneak toggle
els.btnSneak.dispatch('touchstart', makeEvent([{ identifier: 7, clientX: 10, clientY: 10 }]));
ok(touch.sneak === true && els.btnSneak.classList.contains('toggled'), 'Sneaking enabled and visibly toggled');
els.btnSneak.dispatch('touchstart', makeEvent([{ identifier: 8, clientX: 10, clientY: 10 }]));
ok(touch.sneak === false && !els.btnSneak.classList.contains('toggled'), 'Sneaking disabled (toggle)');
touch.setSneak(true);
touch.setSneak(false);
ok(!touch.sneak && !els.btnSneak.classList.contains('toggled'), 'Flight mode reliably resets the sneak toggle');

// Fly button
els.btnFly.dispatch('touchstart', makeEvent([{ identifier: 9, clientX: 10, clientY: 10 }]));
ok(actions.includes('fly'), 'Fly button triggered');

// Inventory & menu
els.btnInventory.dispatch('touchstart', makeEvent([{ identifier: 10, clientX: 10, clientY: 10 }]));
els.btnMenu.dispatch('touchstart', makeEvent([{ identifier: 11, clientX: 10, clientY: 10 }]));
ok(actions.includes('inventory'), 'Inventory button');
ok(actions.includes('menu'), 'Menu button');

// ---- Touch/emulated mouse ---------------------------------------------------
markTouchEvent();
ok(wasRecentTouch() === true, 'wasRecentTouch after markTouchEvent');
await new Promise((r) => setTimeout(r, 750));
ok(wasRecentTouch() === false, 'wasRecentTouch expires');

ok(isTouchDevice() === true, 'isTouchDevice detects touch stubs');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
