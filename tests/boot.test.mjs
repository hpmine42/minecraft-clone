// boot.test.mjs — Boot main.js completely with DOM stubs (boot smoke test).
import { pathToFileURL } from 'node:url';
import { BLOCK } from '../src/world/blocks.js';
import { createFurnaceState } from '../src/player/furnace.js';
import { createChestState } from '../src/player/containers.js';

// ---- Browser stubs (like modules.test, but extended) --------------------
const ctxStub = () => new Proxy({}, {
  get(target, prop) {
    if (prop === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
    if (prop === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (prop === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    return () => {};
  },
});

// WebGL stub for THREE.WebGLRenderer
const GL_CONST_VALUES = {
  VERSION: 7938, RENDERER: 7937, VENDOR: 7936, SHADING_LANGUAGE_VERSION: 35724,
  MAX_TEXTURE_SIZE: 3379, MAX_VIEWPORT_DIMS: 3386,
  ALIASED_LINE_WIDTH_RANGE: 33902, ALIASED_POINT_SIZE_RANGE: 33901,
  MAX_VERTEX_ATTRIBS: 34921, MAX_TEXTURE_IMAGE_UNITS: 34930,
  MAX_COMBINED_TEXTURE_IMAGE_UNITS: 35661, MAX_SAMPLES: 36183,
  MAX_CUBE_MAP_TEXTURE_SIZE: 34076, MAX_RENDERBUFFER_SIZE: 34024,
  MAX_3D_TEXTURE_SIZE: 32883, MAX_ARRAY_TEXTURE_LAYERS: 35071,
  MAX_TEXTURE_MAX_ANISOTROPY: 34047,
  MAX_VERTEX_UNIFORM_VECTORS: 36347, MAX_FRAGMENT_UNIFORM_VECTORS: 36349,
  MAX_VARYING_VECTORS: 36348, MAX_VERTEX_TEXTURE_IMAGE_UNITS: 35660,
  SCISSOR_BOX: 3088, VIEWPORT: 2978,
  FRAMEBUFFER_COMPLETE: 36053, VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632,
  ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963, TEXTURE_2D: 3553,
  RGBA: 6408, UNSIGNED_BYTE: 5121, FLOAT: 5126, TRIANGLES: 4,
};
let glConstCounter = 900000;
const glConstMap = new Map(Object.entries(GL_CONST_VALUES).map(([k, v]) => [k, v]));

const glStub = (canvas) => new Proxy({}, {
  get(target, prop) {
    if (prop === Symbol.toPrimitive) return () => 0;
    if (prop === 'canvas') return canvas;
    if (prop === 'getParameter') return (p) => {
      if (p === 7938) return 'WebGL 2.0';
      if (p === 7937) return 'StubGPU';
      if (p === 7936) return 'StubVendor';
      if (p === 35724) return 'WebGL GLSL ES 3.00';
      if (p === 3379) return 8192;
      if (p === 3386) return new Int32Array([8192, 8192]);
      if (p === 33901) return new Float32Array([1, 256]);
      if (p === 33902) return new Float32Array([1, 1]);
      if (p === 3088 || p === 2978) return new Int32Array([0, 0, 1280, 720]);
      return 4096;
    };
    if (prop === 'getShaderPrecisionFormat') return () => ({ precision: 23, rangeMin: 127, rangeMax: 127 });
    if (prop === 'getExtension') return (name) => {
      if (name === 'WEBGL_debug_renderer_info') return { UNMASKED_RENDERER_WEBGL: 37446, UNMASKED_VENDOR_WEBGL: 37445 };
      return null;
    };
    if (prop === 'getSupportedExtensions') return () => ['WEBGL_debug_renderer_info'];
    if (prop === 'getProgramParameter') return () => true;
    if (prop === 'getShaderParameter') return () => true;
    if (prop === 'getProgramInfoLog' || prop === 'getShaderInfoLog') return () => '';
    if (prop === 'getError') return () => 0;
    if (prop === 'checkFramebufferStatus') return () => 36053;
    if (prop === 'getContextAttributes') return () => ({
      alpha: true, depth: true, stencil: true, antialias: true,
      premultipliedAlpha: true, preserveDrawingBuffer: false,
    });
    if (prop === 'getUniformLocation') return () => ({});
    if (prop === 'getAttribLocation') return () => 0;
    if (prop === 'getActiveUniform' || prop === 'getActiveAttrib') return () => ({ name: 'x', type: 5126, size: 1 });
    if (/^create/.test(String(prop))) return () => ({});
    if (typeof prop === 'string' && /^[A-Z0-9_]+$/.test(prop)) {
      if (!glConstMap.has(prop)) glConstMap.set(prop, glConstCounter++);
      return glConstMap.get(prop);
    }
    return () => {};
  },
});

const elementsById = new Map();
function makeElement(id) {
  const el = {
    id,
    style: new Proxy({}, {
      get(target, property) { return target[property] ?? ''; },
      set(target, property, value) { target[property] = value; return true; },
    }),
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
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { return c; },
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 240, right: 320, bottom: 240 }),
    getContext(type) {
      if (type === 'webgl2' || type === 'webgl') return glStub(el);
      return ctxStub();
    },
    setAttribute() {},
    querySelector: () => makeElement('q'),
    querySelectorAll: () => [],
    focus() {},
    requestPointerLock() {},
  };
  return el;
}

globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  addEventListener(type, fn) {
    if (type === 'DOMContentLoaded') this._domReady = fn;
  },
  removeEventListener() {},
  matchMedia: () => ({ matches: false, addListener() {} }),
  AudioContext: class {
    constructor() { this.currentTime = 0; this.sampleRate = 44100; this.state = 'running'; this.destination = {}; }
    createGain() { return { connect: () => ({ connect: () => {} }), gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} } }; }
    createBufferSource() { return { connect: () => ({ connect: () => ({ connect: () => {} }) }), start() {}, stop() {}, playbackRate: { value: 1 }, buffer: null, loop: false }; }
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
    createBiquadFilter() { return { connect: () => ({ connect: () => ({ connect: () => {} }) }), type: '', frequency: { value: 0 }, Q: { value: 0 } }; }
    createOscillator() { return { connect: () => ({ connect: () => ({ connect: () => {} }) }), start() {}, stop() {}, type: '', frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
    resume() {}
  },
  webkitAudioContext: undefined,
};
Object.defineProperty(globalThis, 'navigator', {
  value: { maxTouchPoints: 0, userAgent: 'test-node' },
  configurable: true,
});
globalThis.document = {
  readyState: 'loading', // so boot() runs only through DOMContentLoaded
  getElementById: (id) => {
    if (!elementsById.has(id)) elementsById.set(id, makeElement(id));
    return elementsById.get(id);
  },
  createElement: () => makeElement('dyn'),
  addEventListener() {},
  removeEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
  hidden: false,
  body: makeElement('body'),
  documentElement: makeElement('html'),
};
globalThis.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] ?? null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; },
};
globalThis.confirm = () => true;
let rafCount = 0;
globalThis.requestAnimationFrame = (fn) => {
  rafCount++;
  if (rafCount > 240) return 0; // Schleife begrenzen
  return setTimeout(() => fn(performance.now()), 4);
};
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

// ---- Load main.js --------------------------------------------------------
await import('../src/main.js');
const game = globalThis.window.__game;

// Trigger DOM ready
if (globalThis.window._domReady) globalThis.window._domReady();

// Let it run briefly
await new Promise((r) => setTimeout(r, 400));

let passed = 0;
let failed = 0;
const ok = (cond, msg) => {
  if (cond) { passed++; console.log(`✔ ${msg}`); }
  else { failed++; console.error(`✘ ${msg}`); }
};

ok(!!game, 'Game instance exists');
ok(game.state === 'menu', `State after boot: ${game.state} (expected menu)`);
ok(!!game.engine, 'Engine initialized');
game.engine.updateSky(0, 3, 0.016, 0);
ok(game.engine.dayFactor > 0.3 && game.engine.dayFactor < 0.4, 'Sky starts at sunrise');
game.engine.updateSky(0.25, 3, 0.016, 0);
ok(game.engine.dayFactor === 1 && game.engine.isDay(), 'Sun position is correct at noon');
game.engine.updateSky(0.75, 3, 0.016, 0);
ok(game.engine.dayFactor === 0 && !game.engine.isDay(), 'Night and mob daylight logic agree');
ok(!!game.engine.renderer, 'Renderer exists');
ok(!!game.atlasCanvas, 'Texture atlas created');
ok(!!game.world || game.state === 'menu', 'World not required yet in the menu');
ok(!!game.hud, 'HUD initialized');
ok(!!game.menus, 'Menus initialized');
ok(game.menus.activeScreen === 'main-menu', `Main menu visible (${game.menus.activeScreen})`);
ok(!!game.menuPreview?.root.visible && game.menuPreview.root.children.length >= 4, 'Textured voxel diorama visible in the main menu');
ok(typeof game.startNewWorld === 'function', 'startNewWorld exists');

// Start a new world (asynchronously via setTimeout)
document.getElementById('seed-input').value = '12345';
document.getElementById('world-type').value = 'normal';
document.getElementById('game-mode').value = 'survival';
document.getElementById('peaceful-mode').checked = true;
game.startNewWorld();
ok(!game.menuPreview.root.visible, 'Menu diorama is hidden when the world starts');
await new Promise((r) => setTimeout(r, 500));
ok(game.state === 'playing', `State after start: ${game.state}`);
ok(!!game.world && game.world.chunks.size > 0, `World generated (${game.world ? game.world.chunks.size : 0} chunks)`);
ok(game.hud.els.worldStatus.style.display === 'block'
  && game.hud.els.worldStatus.textContent.includes('Y '),
'Exploration HUD shows biome, world time, weather, and altitude');
game.hud.update(0, game.player, true);
ok(game.hud.els.heldItemView.style.display === 'block'
  && game.hud.els.heldItemIcon.style.visibility === 'visible',
'Currently selected item appears as a pixel item in the player hand');
ok(!!game.mobs, 'Mob manager exists');
const autosaveIntervalInput = elementsById.get('setting-autosave-interval');
ok(autosaveIntervalInput.value === 60
  && elementsById.get('setting-autosave-interval-value').textContent === '1 min',
'Autosave interval is displayed clearly and prefilled with the saved default');
game.autosaveTimer = 17;
game.applySetting('autosaveInterval', 120);
const autosaveIntervalApplied = game.settings.autosaveInterval === 120 && game.autosaveTimer === 0;
game.applySetting('autosaveInterval', 60);
ok(autosaveIntervalApplied, 'Changing the autosave interval restarts the countdown');
game.applySetting('particles', 'low');
const lowParticleBudget = game.particles.maxParticles === 180;
game.applySetting('particles', 'high');
ok(lowParticleBudget && game.particles.maxParticles === 800,
  'Particle quality setting changes and restores the active effect budget');
game.applySetting('reduceMotion', true);
const reducedMotionSaved = JSON.parse(localStorage.getItem('minecraft-klon-settings-v1'))?.reduceMotion === true;
game.applySetting('reduceMotion', false);
ok(reducedMotionSaved && game.settings.reduceMotion === false,
'Camera motion can be reduced and the setting is saved');
let f1Prevented = false;
game.input._onKeyDown({ code: 'F1', repeat: false, preventDefault() { f1Prevented = true; } });
game._onKey({ code: 'F1', repeat: false, preventDefault() {} });
const hudWasHidden = game.hud.hidden && game.hud.els.root.style.display === 'none';
game._onKey({ code: 'F1', repeat: false, preventDefault() {} });
game.input._onKeyUp({ code: 'F1' });
ok(f1Prevented && hudWasHidden && !game.hud.hidden,
'F1 toggles the HUD for screenshots without opening browser help');
ok(!!game.interaction, 'Interaction exists');
ok(game.player.position.y > 0, `Player positioned (y=${game.player.position.y.toFixed(1)})`);

// Run a few game-loop frames
await new Promise((r) => setTimeout(r, 400));
ok(game.player.health === 20, `Health intact (${game.player.health})`);
ok(game.world.stats().solidVerts > 0, `Terrain meshes built (${game.world.stats().solidVerts} vertices)`);

// Pause / Resume
game.pause();
ok(game.state === 'paused', 'Pause works');
game.resume();
ok(game.state === 'playing', 'Resume works');

// ---- Mine & place blocks (real interaction) -------------------------
{
  const p = game.player;
  // Look down and target the ground
  p.pitch = -Math.PI / 2 + 0.15;
  const targetBefore = game.world.raycast(p.eyePosition(), p.lookDir(), 5.2);   ok(targetBefore !== null, `Mining target found (block ${targetBefore?.id})`);
  const mobRaycast = game.mobs.raycastMob;
  game.mobs.raycastMob = () => null;
  game._updatePlaying(1 / 60);
  game.mobs.raycastMob = mobRaycast;
  const visibleTarget = game.world.raycast(p.eyePosition(), p.lookDir(), 5.2);
  ok(game.blockOutline.mesh.visible && visibleTarget
    && Math.abs(game.blockOutline.mesh.position.x - visibleTarget.x - 0.5) < 0.001
    && Math.abs(game.blockOutline.mesh.position.y - visibleTarget.y - 0.5) < 0.001
    && Math.abs(game.blockOutline.mesh.position.z - visibleTarget.z - 0.5) < 0.001,
  'Target outline appears without attacking on the actually targeted block');
  ok(game.hud.els.targetHint.style.display === 'block'
    && game.hud.els.targetHint.textContent.includes('mine'),
  'Targeted blocks receive a contextual control hint');

  // Creative: mine everything immediately in the test
  p.gamemode = 'creative';
  game.inventory.selected = 0;
  game.inventory.slots[0] = { id: BLOCK.COBBLESTONE, count: 64, dur: null };

  // Mining (hold attack across frames)
  for (let i = 0; i < 30; i++) {
    game.interaction.update(1 / 30, { attack: true, usePressed: false, pickPressed: false }, game.engine.camera);
    game.world.update(p.position.x, p.position.z, 2, 50);
  }
  const targetAfter = game.world.raycast(p.eyePosition(), p.lookDir(), 5.2);
  ok(targetAfter === null || targetAfter.y < targetBefore.y - 1 || targetAfter.id !== targetBefore.id,
    'Block was mined');

  // Placement: put cobblestone in the hole
  const place = game.interaction.update(1 / 30, { attack: false, usePressed: true, pickPressed: false }, game.engine.camera);
  game.world.update(p.position.x, p.position.z, 2, 50);
  ok(true, 'Placement completes without errors');
}

// Open/close the inventory and safely manage temporary cursor/crafting stacks.
game._onKey({ code: 'KeyE', repeat: false });
ok(game.state === 'inventory', 'E opens the player inventory');
ok(game.hud.els.heldItemView.style.display === 'none',
'Held item is hidden while the inventory is open');
const wheelBeforeInventory = game.input.wheelDelta;
let inventoryWheelPrevented = false;
game.input._onWheel({ deltaY: 1, preventDefault() { inventoryWheelPrevented = true; } });
ok(!inventoryWheelPrevented && game.input.wheelDelta === wheelBeforeInventory,
'Inventory mouse wheel remains available for scrolling the interface');
game.inventory.setEquipment('offhand', { id: BLOCK.TORCH, count: 3, dur: null });
game.menus.refreshInventory();
ok(game.menus._characterItemIcons?.has(BLOCK.TORCH),
'Character preview updates when defined items are equipped');
game.menus.craftGrid[0] = { id: BLOCK.LOG, count: 1, dur: null };
game.menus.heldStack = { id: BLOCK.SAND, count: 2, dur: null };
const openInventorySave = game.saveNow();
const openInventoryData = JSON.parse(localStorage.getItem('minecraft-klon-save-v1'));
ok(openInventorySave && openInventoryData.inventoryUI.craftGrid[0]?.id === BLOCK.LOG
  && openInventoryData.inventoryUI.heldStack?.count === 2,
'Autosave snapshot also preserves cursor and crafting stacks');
const sandBeforeClose = game.inventory.count(BLOCK.SAND);
const worldDropsBeforeClose = game.mobs.items.length;
game._onKey({ code: 'Escape', repeat: false });
const cursorDropOnClose = game.mobs.items.slice(worldDropsBeforeClose)
  .some((item) => item.itemId === BLOCK.SAND && item.count === 2);
ok(game.state === 'playing' && game.inventory.count(BLOCK.LOG) >= 1
  && game.inventory.count(BLOCK.SAND) === sandBeforeClose && cursorDropOnClose,
'Inventory closes, crafting ingredients return, and the cursor stack drops into the world');
game.inventory.selected = 8;
let gameplayWheelPrevented = false;
game.input._onWheel({ deltaY: 1, preventDefault() { gameplayWheelPrevented = true; } });
game._updatePlaying(0.001);
ok(gameplayWheelPrevented && game.inventory.selected === 0,
'Mouse wheel cycles through the hotbar in-game and wraps at the end');
const selectedHotbarSlots = [];
for (let digit = 1; digit <= 9; digit++) {
  game._onKey({ code: `Digit${digit}`, repeat: false });
  selectedHotbarSlots.push(game.inventory.selected);
}
ok(selectedHotbarSlots.join(',') === '0,1,2,3,4,5,6,7,8',
'Keys 1 through 9 select the nine shared hotbar slots');
game._onKey({ code: 'KeyE', repeat: false });
const eOpenedInventory = game.state === 'inventory';
game._onKey({ code: 'KeyE', repeat: false });
ok(eOpenedInventory && game.state === 'playing',
'Pressing E again closes the inventory');

// Save/load including positioned furnace and chest contents
game.world.furnaces.set('10,20,30', createFurnaceState({
  slots: [{ id: BLOCK.IRON_ORE, count: 2 }, { id: BLOCK.COAL, count: 1 }, null],
  progress: 3.5,
  burnRemaining: 40,
  burnTotal: 80,
}));
game.world.chests.set('11,20,30', createChestState({
  slots: [{ id: BLOCK.BREAD, count: 6 }, null],
}));
game._dropItems(BLOCK.SAND, 2);
const saved = game.saveNow();
ok(saved === true, 'Save game');
ok(localStorage.getItem('minecraft-klon-save-v1') !== null, 'Save exists in localStorage');
game.quitToMenu();
ok(game.state === 'menu', 'Back in the main menu');
game.continueGame();
await new Promise((r) => setTimeout(r, 500));
ok(game.state === 'playing', 'Game continued');
ok(game.world.chunks.size > 0, `World available after loading (${game.world.chunks.size} chunks)`);
ok(game.world.furnaces.get('10,20,30')?.slots[0]?.count === 2
  && game.world.furnaces.get('10,20,30')?.progress >= 3.5,
'Furnace contents and smelting progress are saved');
ok(game.world.chests.get('11,20,30')?.slots[0]?.count === 6,
'Chest contents are saved');
ok(game.inventory.getEquipment('offhand')?.id === BLOCK.TORCH
  && game.inventory.getEquipment('offhand')?.count === 3,
'Equipment off-hand is saved and loaded with the world');
ok(game.mobs.items.some((item) => item.itemId === BLOCK.SAND && item.count === 2),
'World drops persist through save and load');

// Keyboard: Ctrl sprints without sneaking; both Ctrl keys work.
game.input.keys.clear();
game.input.keys.add('ControlLeft');
let keyMove = game.input.movement();
ok(keyMove.sprint && !keyMove.sneak, 'Left Ctrl sprints without accidentally descending/sneaking');
game.input.keys.clear();
game.input.keys.add('ControlRight');
keyMove = game.input.movement();
ok(keyMove.sprint && !keyMove.sneak, 'Right Ctrl also sprints');
game.input.keys.clear();
game.input.keys.add('ShiftLeft');
keyMove = game.input.movement();
ok(keyMove.sneak && !keyMove.sprint, 'Shift remains the separate sneak/descend key');
game.input.keys.clear();

// Flight double tap: no startup error, and keyboard repeat does not toggle repeatedly.
game.player.gamemode = 'creative';
game._setFlying(false);
game.doubleJumpTimer = -Infinity;
game._onKey({ code: 'Space', repeat: false, preventDefault() {} });
ok(!game.player.flying, 'First Space press does not accidentally enable Creative flight');
const firstFlightTap = game.doubleJumpTimer;
game._onKey({ code: 'Space', repeat: true, preventDefault() {} });
ok(!game.player.flying && game.doubleJumpTimer === firstFlightTap, 'Holding the key does not count as a second flight tap');
game._onKey({ code: 'Space', repeat: false, preventDefault() {} });
ok(game.player.flying, 'Two genuine Space taps enable flight');
const secondFlightTap = game.doubleJumpTimer;
game._onKey({ code: 'Space', repeat: true, preventDefault() {} });
ok(game.player.flying && game.doubleJumpTimer === secondFlightTap, 'Key repeat does not disable flight again');
game._setFlying(false);

game.pause();
const goodSavedBytes = localStorage.getItem('minecraft-klon-save-v1');
const originalSetItem = localStorage.setItem;
const originalWarn = console.warn;
localStorage.setItem = function (key, value) {
  if (key === 'minecraft-klon-save-v1') throw new Error('quota');
  return originalSetItem.call(this, key, value);
};
console.warn = () => {};
game.menus.cb.onQuit();
console.warn = originalWarn;
localStorage.setItem = originalSetItem;
ok(game.state === 'paused'
  && localStorage.getItem('minecraft-klon-save-v1') === goodSavedBytes
  && elementsById.get('save-feedback')?.textContent.includes('Saving failed'),
'After a failed save, the world stays open, the error is visible, and the previous save is preserved');
game.menus.cb.onQuit();
ok(game.state === 'menu', 'Save & Return to Main Menu leaves the world after a successful save');
const invalidSavedBytes = JSON.stringify({ version: 1, seed: 42 });
localStorage.setItem('minecraft-klon-save-v1', invalidSavedBytes);
game.state = 'menu';
game.continueGame();
const saveWarning = elementsById.get('save-warning');
ok(game.state === 'menu' && localStorage.getItem('minecraft-klon-save-v1') === invalidSavedBytes
  && saveWarning?.hidden === false && saveWarning.textContent.includes('corrupted'),
'Corrupted saves are not silently replaced by a new world');
localStorage.setItem('minecraft-klon-save-v1', goodSavedBytes);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
