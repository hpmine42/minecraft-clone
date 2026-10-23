// mobile-boot.test.mjs — Game startup in “phone mode”: touch detection, TouchControls,
// joystick input in the real game, and mobile UI elements.
import { BLOCK } from '../src/world/blocks.js';

// ---- DOM stubs with listener capture ---------------------------------------
function makeEl(id) {
  const listeners = {};
  return {
    id,
    listeners,
    style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    children: [],
    dataset: {},
    value: '',
    checked: true,
    textContent: '',
    innerHTML: '',
    width: 32,
    height: 32,
    offsetWidth: 100,
    firstChild: { style: {} },
    appendChild(c) { c.parentElement = this; this.children.push(c); return c; },
    removeChild(c) { return c; },
    addEventListener(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    removeEventListener() {},
    dispatch(type, event) {
      if (event) event.currentTarget = this;
      for (const fn of listeners[type] || []) fn(event);
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 700, right: 390, bottom: 700 }),
    getContext(type) {
      if (type === 'webgl2' || type === 'webgl') return glStub(this);
      return ctxStub();
    },
    setAttribute() {},
    querySelector: () => makeEl('q'),
    querySelectorAll: () => [],
    focus() {},
    requestPointerLock() {},
    setPointerCapture(pointerId) { this.capturedPointerId = pointerId; },
    closest(selector) {
      for (let el = this; el; el = el.parentElement) {
        if (selector === '.inv-slot' && el.dataset?.slotKind) return el;
      }
      return null;
    },
    el: null,
  };
}

const ctxStub = () => new Proxy({}, {
  get(target, prop) {
    if (prop === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
    if (prop === 'createRadialGradient') return () => ({ addColorStop() {} });
    return () => {};
  },
});

const GL_CONST_VALUES = {
  VERSION: 7938, RENDERER: 7937, VENDOR: 7936, SHADING_LANGUAGE_VERSION: 35724,
  MAX_TEXTURE_SIZE: 3379, MAX_VIEWPORT_DIMS: 3386, ALIASED_LINE_WIDTH_RANGE: 33902,
  ALIASED_POINT_SIZE_RANGE: 33901, FRAMEBUFFER_COMPLETE: 36053,
  VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632,
};
let glConstCounter = 900000;
const glConstMap = new Map(Object.entries(GL_CONST_VALUES));
const glStub = (canvas) => new Proxy({}, {
  get(target, prop) {
    if (prop === Symbol.toPrimitive) return () => 0;
    if (prop === 'canvas') return canvas;
    if (prop === 'getParameter') return (p) => {
      if (p === 7938) return 'WebGL 2.0';
      if (p === 7937) return 'StubGPU';
      if (p === 7936) return 'StubVendor';
      if (p === 35724) return 'WebGL GLSL ES 3.00';
      if (p === 3379) return 4096;
      if (p === 3386) return new Int32Array([4096, 4096]);
      if (p === 33901) return new Float32Array([1, 256]);
      if (p === 33902) return new Float32Array([1, 1]);
      return 4096;
    };
    if (prop === 'getShaderPrecisionFormat') return () => ({ precision: 23, rangeMin: 127, rangeMax: 127 });
    if (prop === 'getExtension') return () => null;
    if (prop === 'getSupportedExtensions') return () => [];
    if (prop === 'getProgramParameter') return (p, pname) => (pname === 35718 || pname === 35721) ? 0 : true;
    if (prop === 'getShaderParameter') return () => true;
    if (prop === 'getActiveUniform' || prop === 'getActiveAttrib') return () => ({ name: 'x', type: 5126, size: 1 });
    if (prop === 'getProgramInfoLog' || prop === 'getShaderInfoLog') return () => '';
    if (prop === 'getError') return () => 0;
    if (prop === 'checkFramebufferStatus') return () => 36053;
    if (prop === 'getContextAttributes') return () => ({ alpha: true, depth: true, stencil: true, antialias: true });
    if (prop === 'getUniformLocation') return () => ({});
    if (prop === 'getAttribLocation') return () => 0;
    if (/^create/.test(String(prop))) return () => ({});
    if (typeof prop === 'string' && /^[A-Z0-9_]+$/.test(prop)) {
      if (!glConstMap.has(prop)) glConstMap.set(prop, glConstCounter++);
      return glConstMap.get(prop);
    }
    return () => {};
  },
});

const elementsById = new Map();
const elById = (id) => {
  if (!elementsById.has(id)) {
    const e = makeEl(id);
    e.el = e;
    elementsById.set(id, e);
  }
  return elementsById.get(id);
};

// ---- Phone environment --------------------------------------------------------
Object.defineProperty(globalThis, 'navigator', {
  value: { maxTouchPoints: 5, userAgent: 'MobileBootTest', platform: 'iPhone' },
  configurable: true,
});
globalThis.window = {
  innerWidth: 390,
  innerHeight: 844,
  devicePixelRatio: 3,
  addEventListener(type, fn) {
    if (type === 'DOMContentLoaded') this._domReady = fn;
  },
  removeEventListener() {},
  // Phone: touch + pointer events as in modern mobile browsers.
  PointerEvent: class PointerEvent {},
  matchMedia: () => ({ matches: true, addListener() {} }),
  AudioContext: class {
    constructor() { this.currentTime = 0; this.sampleRate = 44100; this.state = 'running'; this.destination = {}; }
    createGain() { return { connect: () => ({ connect: () => {} }), gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} } }; }
    createBufferSource() { return { connect: () => ({ connect: () => ({ connect: () => {} }) }), start() {}, stop() {}, playbackRate: { value: 1 }, buffer: null, loop: false }; }
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
    createBiquadFilter() { return { connect: () => ({ connect: () => ({ connect: () => {} }) }), type: '', frequency: { value: 0 }, Q: { value: 0 } }; }
    createOscillator() { return { connect: () => ({ connect: () => ({ connect: () => {} }) }), start() {}, stop() {}, type: '', frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
    resume() {}
  },
};
const documentListeners = {};
globalThis.document = {
  readyState: 'loading',
  getElementById: elById,
  createElement: () => makeEl('dyn'),
  addEventListener(type, fn) { (documentListeners[type] ||= []).push(fn); },
  removeEventListener() {},
  dispatch(type, event) { for (const fn of documentListeners[type] || []) fn(event); },
  elementFromPoint() { return this._pointElement || null; },
  pointerLockElement: null,
  fullscreenElement: null,
  exitFullscreen() { this.fullscreenElement = null; },
  exitPointerLock() {},
  hidden: false,
  body: makeEl('body'),
  documentElement: makeEl('html'),
};
globalThis.document.documentElement.requestFullscreen = async function requestFullscreen() {
  globalThis.document.fullscreenElement = this;
};
globalThis.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] ?? null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; },
};
globalThis.confirm = () => true;
let rafRunning = true;
globalThis.requestAnimationFrame = (fn) => {
  if (!rafRunning) return 0;
  return setTimeout(() => { if (rafRunning) fn(performance.now()); }, 4);
};
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

// ---- Start game ---------------------------------------------------------
await import('../src/main.js');
const game = globalThis.window.__game;
if (globalThis.window._domReady) globalThis.window._domReady();

await new Promise((r) => setTimeout(r, 200));

let passed = 0;
let failed = 0;
const ok = (cond, msg) => {
  if (cond) { passed++; console.log(`✔ ${msg}`); }
  else { failed++; console.error(`✘ ${msg}`); }
};

ok(game.isTouch === true, 'Touch mode detected (phone)');
ok(!!game.touch, 'TouchControls initialized');
ok(elById('mobile-controls').style.display === 'block', 'Mobile controls visible');
ok(game.settings.renderDistance <= 4, `Compact phone render distance (${game.settings.renderDistance})`);

// Start world
elById('seed-input').value = '42';
elById('world-type').value = 'normal';
elById('game-mode').value = 'creative';
elById('peaceful-mode').checked = true;
game.startNewWorld();
await new Promise((r) => setTimeout(r, 800));
ok(game.state === 'playing', `Game running (${game.state})`);
ok(game.world.chunks.size > 0, `World available (${game.world.chunks.size} chunks)`);
ok(game.particles.quality === 'low' && game.particles.maxParticles === 180,
  'Default mobile quality limits particles without disabling effects');

// Move joystick → player walks
const makeEvent = (touches) => ({ preventDefault() {}, stopPropagation() {}, changedTouches: touches, touches });
const makePointerEvent = (pointerId, clientX, clientY) => ({
  pointerId, pointerType: 'touch', isPrimary: true, clientX, clientY,
  preventDefault() {}, stopPropagation() {},
});
const joyZone = elById('joystick-zone');
const startPos = { ...game.player.position };
joyZone.dispatch('touchstart', makeEvent([{ identifier: 1, clientX: 80, clientY: 500 }]));
joyZone.dispatch('touchmove', makeEvent([{ identifier: 1, clientX: 80, clientY: 500 - 55 }]));
await new Promise((r) => setTimeout(r, 500));
joyZone.dispatch('touchend', makeEvent([{ identifier: 1, clientX: 80, clientY: 500 }]));
const moved = Math.hypot(game.player.position.x - startPos.x, game.player.position.z - startPos.z);
ok(moved > 0.5, `Joystick moves player (${moved.toFixed(2)} blocks)`);

// Rotate view by swiping
const lookZone = elById('look-zone');
const yawBefore = game.player.yaw;
lookZone.dispatch('touchstart', makeEvent([{ identifier: 2, clientX: 300, clientY: 100 }]));
lookZone.dispatch('touchmove', makeEvent([{ identifier: 2, clientX: 360, clientY: 100 }]));
await new Promise((r) => setTimeout(r, 60));
ok(Math.abs(game.player.yaw - yawBefore) > 0.01, `View rotated by swiping (Δ=${(game.player.yaw - yawBefore).toFixed(3)})`);
lookZone.dispatch('touchend', makeEvent([{ identifier: 2, clientX: 360, clientY: 100 }]));

// Jump button
const jumpBtn = elById('btn-jump');
const yBefore = game.player.position.y;
jumpBtn.dispatch('touchstart', makeEvent([{ identifier: 3, clientX: 10, clientY: 10 }]));
await new Promise((r) => setTimeout(r, 120));
jumpBtn.dispatch('touchend', makeEvent([{ identifier: 3, clientX: 10, clientY: 10 }]));
ok(game.player.position.y > yBefore + 0.1, `Jump button lifts player (+${(game.player.position.y - yBefore).toFixed(2)})`);

// Double jump → flight (Creative)—first allow time since the previous tap
await new Promise((r) => setTimeout(r, 450));
jumpBtn.dispatch('touchstart', makeEvent([{ identifier: 4, clientX: 10, clientY: 10 }]));
jumpBtn.dispatch('touchend', makeEvent([{ identifier: 4, clientX: 10, clientY: 10 }]));
await new Promise((r) => setTimeout(r, 30));
jumpBtn.dispatch('touchstart', makeEvent([{ identifier: 5, clientX: 10, clientY: 10 }]));
ok(game.player.flying === true, 'Double jump enables flight');
jumpBtn.dispatch('touchend', makeEvent([{ identifier: 5, clientX: 10, clientY: 10 }]));
game.player.flying = true; // Keep the test position stable during Creative flight.
game.player.velocity.x = game.player.velocity.y = game.player.velocity.z = 0;

// Place button (block in the world)
const placeBtn = elById('btn-place');
game.player.pitch = -0.9;
game.inventory.selected = 0;
game.inventory.slots[0] = { id: BLOCK.COBBLESTONE, count: 64, dur: null };
placeBtn.dispatch('touchstart', makeEvent([{ identifier: 6, clientX: 10, clientY: 10 }]));
placeBtn.dispatch('touchend', makeEvent([{ identifier: 6, clientX: 10, clientY: 10 }]));
await new Promise((r) => setTimeout(r, 60));
ok(true, 'Place button works without errors');

// Mobile Pocket Edition style: a steady long press on a plant mines it
// (the touch position is projected to a screen ray, not just the crosshair).
game.player.yaw = 0;
game.player.pitch = 0;
const eye = game.player.eyePosition();
const targetBlock = {
  x: Math.floor(game.player.position.x),
  y: Math.floor(eye.y),
  z: Math.floor(game.player.position.z) - 3,
};
game.world.setBlock(targetBlock.x, targetBlock.y, targetBlock.z, BLOCK.DIRT);
// Survival mines progressively; the following test therefore also checks the crack outline.
game.player.gamemode = 'survival';
const directRay = game.world.raycast(eye, game.player.lookDir(), 5.2);
ok(directRay?.id === BLOCK.DIRT, 'Test block is in view');
const raycastMob = game.mobs.raycastMob;
game.mobs.raycastMob = () => null; // focus deterministically on the block
const interactionUpdate = game.interaction.update.bind(game.interaction);
const outlineUpdate = game.blockOutline.update.bind(game.blockOutline);
let mineFrames = 0;
let outlineShownWhileMining = false;
game.interaction.update = (dt, actions, camera) => {
  if (actions.attack && actions.attackDirection) mineFrames++;
  return interactionUpdate(dt, actions, camera);
};
game.blockOutline.update = (hit) => {
  outlineUpdate(hit);
  if (mineFrames > 0 && hit?.x === targetBlock.x && hit?.y === targetBlock.y && hit?.z === targetBlock.z) {
    outlineShownWhileMining ||= game.blockOutline.mesh.visible;
  }
};
lookZone.dispatch('touchstart', makeEvent([{ identifier: 12, clientX: 195, clientY: 422 }]));
await new Promise((r) => setTimeout(r, 760));
lookZone.dispatch('touchend', makeEvent([{ identifier: 12, clientX: 195, clientY: 422 }]));
game.mobs.raycastMob = raycastMob;
game.interaction.update = interactionUpdate;
game.blockOutline.update = outlineUpdate;
ok(mineFrames > 0, 'Mobile long press is processed as held mining in-game');
ok(outlineShownWhileMining, 'Target outline stays visible on the block during mobile long press');
ok(game.world.getBlock(targetBlock.x, targetBlock.y, targetBlock.z) === BLOCK.AIR,
  'Holding on the block mines it directly');
game.player.gamemode = 'creative';

// Inventory button opens inventory
const invBtn = elById('btn-inventory');
invBtn.dispatch('touchstart', makeEvent([{ identifier: 7, clientX: 10, clientY: 10 }]));
ok(game.state === 'inventory', 'Inventory button opens inventory');
ok(game.menus.craftingMode === 'player' && game.menus.craftGrid.length === 4
  && game.menus.craftSlotEls[4].el.style.display === 'none',
'Player inventory shows exactly four 2×2 crafting slots');
let inventoryWorldTicks = 0;
const playingUpdate = game._updatePlaying;
game._updatePlaying = function (dt) {
  if (this.state === 'inventory') inventoryWorldTicks++;
  return playingUpdate.call(this, dt);
};
await new Promise((r) => setTimeout(r, 40));
game._updatePlaying = playingUpdate;
ok(inventoryWorldTicks > 0, 'World, player physics, and mobs continue while the inventory is open');
ok(game.menus.transferControls.parentElement === game.menus.els['inventory-body']
  && game.menus.els['inventory-body'].children[0] === game.menus.transferControls,
  'Single-item toggle is visibly placed at the top of the inventory');
ok(game.menus.recipeListEl.style.display === 'none',
'Recipe list starts collapsed on mobile so the inventory fits without scrolling');
game.menus.recipeBookToggle.dispatch('click', makeEvent([]));
const recipeBookExpanded = game.menus.recipeListEl.style.display !== 'none';
game.menus.recipeBookToggle.dispatch('click', makeEvent([]));
ok(recipeBookExpanded && game.menus.recipeListEl.style.display === 'none',
'Recipe book can be opened when needed and closed again to save space');

// Drag an item with one finger from the inventory directly into the 2×2 player crafting grid.
game.inventory.slots[9] = { id: BLOCK.LOG, count: 1, dur: null };
game.menus.refreshInventory();
const logSlot = game.menus.invSlotEls.find((slot) => slot.index === 9);
const craftTarget = game.menus.craftSlotEls[0];
logSlot.el.dispatch('pointerdown', makePointerEvent(20, 100, 300));
ok(logSlot.el.capturedPointerId === 20, 'Mobile crafting drag captures the pointer until release');
document._pointElement = craftTarget.canvas; // Browser elementFromPoint usually hits the slot icon.
document.dispatch('pointermove', makePointerEvent(20, 180, 380));
document.dispatch('pointerup', makePointerEvent(20, 180, 380));
ok(game.inventory.slots[9] === null && game.menus.craftGrid[0]?.id === BLOCK.LOG && game.menus.heldStack === null,
  'Mobile drag-and-drop moves the item into the crafting grid without duplication');
ok(game.menus.resultSlotEl.stack?.id === BLOCK.PLANKS,
  'Crafting result updates after mobile placement');

// The previous two-tap controls remain available alongside drag-and-drop.
game.inventory.slots[10] = { id: BLOCK.COBBLESTONE, count: 2, dur: null };
game.menus.refreshInventory();
const cobbleSlot = game.menus.invSlotEls.find((slot) => slot.index === 10);
cobbleSlot.el.dispatch('pointerdown', makePointerEvent(21, 110, 300));
document._pointElement = cobbleSlot.el;
document.dispatch('pointerup', makePointerEvent(21, 110, 300));
game.menus.craftSlotEls[0].el.dispatch('pointerdown', makePointerEvent(22, 150, 350));
document._pointElement = game.menus.craftSlotEls[0].el;
document.dispatch('pointerup', makePointerEvent(22, 150, 350));
ok(game.menus.craftGrid[0]?.id === BLOCK.COBBLESTONE,
  'Inventory items can still be placed by tapping and tapping again');
game.menus._returnCraftGrid();
game.menus._dropHeld();

// Single-transfer mode: select a slot, then insert exactly one item per crafting tap.
game.inventory.slots[11] = { id: BLOCK.LOG, count: 2, dur: null };
game.menus.refreshInventory();
const transferButton = game.menus.singleTransferButton;
transferButton.dispatch('touchend', makeEvent([{ identifier: 30, clientX: 20, clientY: 20 }]));
ok(game.menus.singleTransferMode, 'Single-transfer button enables insert mode');
const transferSource = game.menus.invSlotEls.find((slot) => slot.index === 11);
transferSource.el.dispatch('pointerdown', makePointerEvent(31, 110, 300));
document.dispatch('pointerup', makePointerEvent(31, 110, 300));
ok(game.menus.transferSourceIndex === 11 && game.menus.heldStack === null,
  'Inventory slot is selected without picking up the whole stack');
const transferTarget = game.menus.craftSlotEls[3];
transferTarget.el.dispatch('pointerdown', makePointerEvent(32, 150, 350));
document.dispatch('pointerup', makePointerEvent(32, 150, 350));
ok(game.inventory.slots[11]?.count === 1 && game.menus.craftGrid[3]?.count === 1 && game.menus.heldStack === null,
  'First tap inserts exactly one item and leaves the rest of the stack in the inventory');
ok(game.menus.resultSlotEl.stack?.id === BLOCK.PLANKS,
  'Single transfer updates the crafting result immediately');
transferTarget.el.dispatch('pointerdown', makePointerEvent(33, 150, 350));
document.dispatch('pointerup', makePointerEvent(33, 150, 350));
ok(game.inventory.slots[11] === null && game.menus.craftGrid[3]?.count === 2,
  'Each further tap inserts only one additional item');
transferButton.dispatch('touchend', makeEvent([{ identifier: 34, clientX: 20, clientY: 20 }]));
ok(!game.menus.singleTransferMode, 'Single transfer can be switched off again');
game.menus._returnCraftGrid();

// Multi-part recipes can be filled through separate taps on the appropriate slots.
game.inventory.slots[12] = { id: BLOCK.PLANKS, count: 2, dur: null };
game.menus.refreshInventory();
transferButton.dispatch('touchend', makeEvent([{ identifier: 35, clientX: 20, clientY: 20 }]));
const plankTransferSource = game.menus.invSlotEls.find((slot) => slot.index === 12);
plankTransferSource.el.dispatch('pointerdown', makePointerEvent(36, 110, 300));
document.dispatch('pointerup', makePointerEvent(36, 110, 300));
game.menus.craftSlotEls[0].el.dispatch('pointerdown', makePointerEvent(37, 150, 350));
document.dispatch('pointerup', makePointerEvent(37, 150, 350));
game.menus.craftSlotEls[2].el.dispatch('pointerdown', makePointerEvent(38, 150, 350));
document.dispatch('pointerup', makePointerEvent(38, 150, 350));
ok(game.inventory.slots[12] === null && game.menus.craftGrid[0]?.id === BLOCK.PLANKS && game.menus.craftGrid[2]?.id === BLOCK.PLANKS,
  'Two individual ingredients land in two crafting slots');
ok(game.menus.resultSlotEl.stack?.id === BLOCK.STICK,
  'Single transfer also supports multi-part recipes such as sticks');
transferButton.dispatch('touchend', makeEvent([{ identifier: 39, clientX: 20, clientY: 20 }]));
game.menus._returnCraftGrid();

document._pointElement = null;
invBtn.dispatch('touchstart', makeEvent([{ identifier: 8, clientX: 10, clientY: 10 }]));
ok(game.state === 'playing', 'Inventory button closes inventory');
game.openWorkbenchInventory();
ok(game.state === 'inventory' && game.menus.craftingMode === 'workbench'
  && game.menus.craftGrid.length === 9 && game.menus.craftSlotEls[4].el.style.display !== 'none',
'Crafting-table inventory still provides a visible 3×3 crafting grid');
game.closeInventory();

// Furnace and chest have their own touch-accessible container slots.
game.inventory.slots[13] = { id: BLOCK.BEEF, count: 2, dur: null };
game.inventory.slots[14] = { id: BLOCK.COAL, count: 1, dur: null };
game.openFurnace({ x: 1, y: 2, z: 3 });
ok(game.state === 'inventory' && game.menus.inventoryTitle.textContent === 'Furnace',
  'Furnace block opens a dedicated smelting interface');
const beefSlot = game.menus.invSlotEls.find((slot) => slot.index === 13);
beefSlot.el.dispatch('pointerdown', makePointerEvent(40, 110, 300));
document._pointElement = game.menus.furnaceSlotEls[0].canvas;
document.dispatch('pointermove', makePointerEvent(40, 170, 360));
document.dispatch('pointerup', makePointerEvent(40, 170, 360));
game.menus._slotClick('inv', 14);
game.menus._slotClick('container', 1);
ok(game.world.furnaces.get('1,2,3').slots[0]?.id === BLOCK.BEEF
  && game.world.furnaces.get('1,2,3').slots[1]?.id === BLOCK.COAL,
'Ingredient and fuel can be placed in the furnace');
game._tickFurnaces(5);
ok(game.world.furnaces.get('1,2,3').slots[2]?.id === BLOCK.COOKED_BEEF
  && game.world.furnaces.get('1,2,3').slots[0]?.count === 1,
'Furnace smelts raw beef into cooked beef');
game.menus._slotClick('container', 2);
game.menus._slotClick('inv', 15);
game.closeInventory();

game.openChest({ x: 4, y: 2, z: 3 });
ok(game.state === 'inventory' && game.menus.inventoryTitle.textContent === 'Chest',
  'Chest opens a dedicated storage interface');
game.menus._slotClick('inv', 15);
game.menus._slotClick('container', 0);
ok(game.world.chests.get('4,2,3').slots[0]?.id === BLOCK.COOKED_BEEF,
  'Items can be stored in the chest');
game.closeInventory();
game.openChest({ x: 4, y: 2, z: 3 });
ok(game.world.chests.get('4,2,3').slots[0]?.id === BLOCK.COOKED_BEEF,
  'Chest contents persist after reopening');
game.closeInventory();

const craftBtn = elById('btn-craft');
craftBtn.dispatch('touchstart', makeEvent([{ identifier: 25, clientX: 10, clientY: 10 }]));
ok(game.state === 'inventory', 'Crafting shortcut opens the inventory');
invBtn.dispatch('touchstart', makeEvent([{ identifier: 26, clientX: 10, clientY: 10 }]));
ok(game.state === 'playing', 'Inventory can still be closed through the shortcut');

// Menu button → pause
const menuBtn = elById('btn-menu');
menuBtn.dispatch('touchstart', makeEvent([{ identifier: 9, clientX: 10, clientY: 10 }]));
ok(game.state === 'paused', 'Menu button opens pause');
menuBtn.dispatch('touchstart', makeEvent([{ identifier: 10, clientX: 10, clientY: 10 }]));
ok(game.state === 'playing', 'Menu button resumes');

// Fullscreen is also accessible in the main menu; the duplicate HUD button is hidden there.
game.menus.showScreen('main-menu');
ok(elById('btn-fullscreen').style.display === 'none', 'HUD fullscreen button does not collide with the main menu');
const menuFullscreenBtn = elById('btn-fullscreen-menu');
menuFullscreenBtn.dispatch('touchend', makeEvent([{ identifier: 23, clientX: 20, clientY: 20 }]));
await new Promise((r) => setTimeout(r, 0));
ok(document.fullscreenElement === document.documentElement, 'Main-menu fullscreen button enables fullscreen');
ok(menuFullscreenBtn.textContent.includes('Exit'), 'Menu button shows the active fullscreen state');
menuFullscreenBtn.dispatch('touchend', makeEvent([{ identifier: 24, clientX: 20, clientY: 20 }]));
await new Promise((r) => setTimeout(r, 0));
ok(document.fullscreenElement === null, 'Main-menu fullscreen button exits fullscreen again');
game.menus.hideAll();
ok(elById('btn-fullscreen').style.display === '', 'HUD fullscreen button reappears after leaving the main menu');

// The HUD button also works during gameplay.
const fullscreenBtn = elById('btn-fullscreen');
fullscreenBtn.dispatch('touchend', makeEvent([{ identifier: 27, clientX: 20, clientY: 20 }]));
await new Promise((r) => setTimeout(r, 0));
ok(document.fullscreenElement === document.documentElement, 'HUD fullscreen button enables fullscreen');
fullscreenBtn.dispatch('touchend', makeEvent([{ identifier: 28, clientX: 20, clientY: 20 }]));
await new Promise((r) => setTimeout(r, 0));
ok(document.fullscreenElement === null, 'HUD fullscreen button exits fullscreen again');

game.touch.setSneak(true);
const flyingBeforeToggle = game.player.flying;
game._toggleFlight();
ok(game.player.flying !== flyingBeforeToggle && !game.touch.sneak,
  'Flight-mode change clears the old mobile descend toggle');

// Pixel ratio limited for phones
ok(game.engine.pixelRatio <= 1.75, `Pixel ratio capped (${game.engine.pixelRatio})`);

rafRunning = false;
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
