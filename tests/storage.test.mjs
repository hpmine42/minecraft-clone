// storage.test.mjs — Safely reject malformed browser data without touching saved bytes.
import {
  defaultSettings, exportSaveData, importSaveData, loadGame, loadSettings, saveGame, saveSettings,
} from '../src/save/storage.js';

const SAVE_KEY = 'minecraft-klon-save-v1';
const SETTINGS_KEY = 'minecraft-klon-settings-v1';
const store = new Map();
globalThis.localStorage = {
  getItem(key) { return store.has(key) ? store.get(key) : null; },
  setItem(key, value) { store.set(key, String(value)); },
  removeItem(key) { store.delete(key); },
};

let passed = 0;
let failed = 0;
function ok(condition, message) {
  if (condition) passed++;
  else { failed++; console.error(`FAIL: ${message}`); }
}

const validSave = {
  version: 1,
  seed: 0,
  worldType: 'normal',
  player: { position: { x: 0.5, y: 34, z: 0.5 }, yaw: 0, pitch: 0 },
  inventory: { selected: 0, slots: [] },
};
store.set(SAVE_KEY, JSON.stringify(validSave));
ok(loadGame()?.seed === 0, 'Valid saves, including seed 0, are loaded');

const malformedSave = JSON.stringify({ version: 1, seed: 42 });
store.set(SAVE_KEY, malformedSave);
ok(loadGame() === null && store.get(SAVE_KEY) === malformedSave,
  'An incomplete save is rejected but not deleted or overwritten');
const invalidPositionSave = JSON.stringify({
  ...validSave,
  player: { position: { x: 1, y: null, z: 2 } },
});
store.set(SAVE_KEY, invalidPositionSave);
ok(loadGame() === null && store.get(SAVE_KEY) === invalidPositionSave,
  'Non-finite player positions are rejected and preserved for recovery');
const invalidOrientationSave = JSON.stringify({
  ...validSave,
  player: { ...validSave.player, yaw: 'not numeric' },
});
store.set(SAVE_KEY, invalidOrientationSave);
ok(loadGame() === null && store.get(SAVE_KEY) === invalidOrientationSave,
  'Invalid orientation data is rejected without changing the backup bytes');

const backup = JSON.stringify(validSave);
store.set(SAVE_KEY, '{"corrupted":true}');
ok(exportSaveData() === '{"corrupted":true}',
  'Export preserves even corrupted data for manual recovery');
ok(importSaveData(backup) && loadGame()?.seed === 0,
  'A valid JSON backup is imported in full');
const richBackup = JSON.stringify({
  ...validSave,
  modified: [{ pos: '1,2,3', id: 0, meta: 0 }],
  furnaces: [['1,10,1', { slots: [{ id: 3, count: 2 }], progress: 2, burnRemaining: 10, burnTotal: 15 }]],
  chests: [['2,10,2', { slots: [{ id: 3, count: 4 }] }]],
  inventoryUI: { craftingMode: 'player', craftGrid: [{ id: 3, count: 1 }], heldStack: { id: 10, count: 2 } },
  droppedItems: [{ id: 3, count: 1, position: { x: 1, y: 11, z: 1 }, velocity: { x: 0, y: 0, z: 0 }, life: 200, pickupDelay: 0.2 }],
});
ok(importSaveData(richBackup) && loadGame()?.chests?.[0]?.[1]?.slots?.[0]?.count === 4,
  'Valid backups preserve world changes, containers, cursor items, and drops');
const preservedBeforeInvalidImport = exportSaveData();
ok(!importSaveData(JSON.stringify({
  ...validSave,
  inventory: { ...validSave.inventory, slots: [{ id: 3, count: 65 }] },
})) && exportSaveData() === preservedBeforeInvalidImport,
  'Invalid inventory stacks are rejected without replacing the previous save');
ok(!importSaveData(JSON.stringify({
  ...validSave,
  chests: [['2,10,2', { slots: [{ id: 3, count: 65 }] }]],
})) && exportSaveData() === preservedBeforeInvalidImport,
  'Invalid container stacks are rejected instead of being truncated on load');

store.set(SETTINGS_KEY, JSON.stringify({
  renderDistance: 99,
  fov: 55,
  sensitivity: 'fast',
  volume: -4,
  dayLength: 450,
  autosaveInterval: 9999,
  particles: 'ultra',
  showDebug: true,
  invertY: 'false',
  reduceMotion: true,
  autosave: false,
}));
const settings = loadSettings();
ok(settings.renderDistance === 10 && settings.fov === 60 && settings.volume === 0
  && settings.dayLength === 450 && settings.autosaveInterval === 3600
  && settings.showDebug === true && settings.autosave === false && settings.reduceMotion === true
  && !('sensitivity' in settings) && !('particles' in settings) && !('invertY' in settings),
  'Loaded settings are normalized to known types and safe ranges');
ok({ ...defaultSettings(false), ...settings }.sensitivity === defaultSettings(false).sensitivity,
  'Invalid settings fall back to device-dependent defaults');
store.set(SETTINGS_KEY, JSON.stringify({ autosaveInterval: 125 }));
ok(loadSettings().autosaveInterval === 130,
  'The saved autosave interval is aligned to the slider step');
store.set(SETTINGS_KEY, JSON.stringify({ reduceMotion: 'yes' }));
ok(!('reduceMotion' in loadSettings()), 'Camera motion setting accepts only actual boolean values');

const originalSetItem = localStorage.setItem;
localStorage.setItem = (key, value) => {
  if (key === SAVE_KEY) throw new Error('quota');
  originalSetItem.call(localStorage, key, value);
};
store.set(SAVE_KEY, JSON.stringify(validSave));
const preservedSave = store.get(SAVE_KEY);
const originalWarn = console.warn;
console.warn = () => {};
const saveResult = saveGame(
  { seed: 1, worldType: 'normal', modified: new Map() },
  { toJSON: () => validSave.player },
  { toJSON: () => validSave.inventory },
);
const importResult = importSaveData(backup);
console.warn = originalWarn;
ok(saveResult === false && importResult === false && store.get(SAVE_KEY) === preservedSave,
  'Failed save and import operations leave the previous save intact');

saveSettings({ fov: 90 });
ok(loadSettings().fov === 90, 'Valid settings can be saved persistently');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
