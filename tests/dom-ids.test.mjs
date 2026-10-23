// dom-ids.test.mjs — Verify that every DOM ID used in main.js/menus.js exists in index.html.
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const mainSrc = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

// IDs in the HTML
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));

// $('id') calls in main.js
const usedIds = [...mainSrc.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]);

// Menu element mapping: 'key': $('id') OR 'key': $('id')
const mappedIds = [...mainSrc.matchAll(/'([a-z0-9-]+)':\s*\$\('([^']+)'\)/g)].map((m) => m[2]);

let failed = 0;
for (const id of [...new Set([...usedIds, ...mappedIds])]) {
  if (!htmlIds.has(id)) {
    console.error(`✘ Missing ID in HTML: #${id}`);
    failed++;
  }
}

// Conversely: all screen IDs expected by Menus
const expectedScreens = [
  'main-menu', 'pause-menu', 'settings-screen', 'inventory-screen',
  'death-screen', 'help-screen', 'loading-screen', 'selftest-screen',
  'inventory-body', 'inventory-title', 'btn-close-inventory', 'loading-text', 'death-stats',
  'help-content', 'selftest-results', 'btn-selftest-back',
];
for (const id of expectedScreens) {
  if (!htmlIds.has(id)) {
    console.error(`✘ Missing screen ID: #${id}`);
    failed++;
  }
}

// Touch-Buttons
const touchIds = [
  'mobile-controls', 'joystick-zone', 'joystick-knob', 'look-zone',
  'btn-jump', 'btn-sneak', 'btn-fly', 'btn-attack', 'btn-place',
  'btn-inventory', 'btn-craft', 'btn-menu', 'btn-debug',
];
for (const id of touchIds) {
  if (!htmlIds.has(id)) {
    console.error(`✘ Missing touch button: #${id}`);
    failed++;
  }
}

// HUD elements
const hudIds = [
  'game', 'hud', 'hotbar', 'hearts', 'hunger', 'air', 'item-name',
  'break-progress', 'target-hint', 'world-status', 'fps', 'btn-fullscreen', 'debug', 'hurt-overlay', 'water-overlay', 'mode-label',
];
for (const id of hudIds) {
  if (!htmlIds.has(id)) {
    console.error(`✘ Missing HUD element: #${id}`);
    failed++;
  }
}

// The fullscreen button must be accessible in the main menu outside the HUD overlay.
const mainMenuStart = html.indexOf('<div id="main-menu"');
const pauseScreenStart = html.indexOf('<!-- Pause -->', mainMenuStart);
const mainMenuMarkup = mainMenuStart >= 0 && pauseScreenStart > mainMenuStart
  ? html.slice(mainMenuStart, pauseScreenStart)
  : '';
if (!mainMenuMarkup.includes('id="btn-fullscreen-menu"')) {
  console.error('✘ Fullscreen button missing from the main menu');
  failed++;
}

// Settings
const settingIds = [
  'setting-render-distance', 'setting-fov', 'setting-sensitivity',
  'setting-volume', 'setting-day-length', 'setting-autosave-interval', 'setting-particles',
  'setting-invert-y', 'setting-reduced-motion', 'setting-debug', 'setting-autosave',
  'btn-reset-world', 'btn-delete-save', 'btn-settings-back',
  'btn-export-save', 'btn-import-save', 'save-import-file', 'save-backup-feedback',
];
for (const id of settingIds) {
  if (!htmlIds.has(id)) {
    console.error(`✘ Missing settings element: #${id}`);
    failed++;
  }
}

// Slider values must sit directly beside their labels, not as loose flex items below.
const settingsValueIds = [
  'setting-render-distance-value', 'setting-fov-value', 'setting-sensitivity-value',
  'setting-volume-value', 'setting-day-length-value', 'setting-autosave-interval-value',
];
for (const id of settingsValueIds) {
  const valuePosition = html.indexOf(`id="${id}"`);
  const labelStart = html.lastIndexOf('<label class="setting-control">', valuePosition);
  const labelEnd = html.indexOf('</label>', valuePosition);
  const controlMarkup = labelStart >= 0 && labelEnd > valuePosition
    ? html.slice(labelStart, labelEnd)
    : '';
  if (!controlMarkup.includes('class="setting-title-row"')) {
    console.error(`✘ Value #${id} is not grouped with its settings label`);
    failed++;
  }
}
const settingsMarkup = html.slice(html.indexOf('<div id="settings-screen"'), html.indexOf('<!-- Inventory -->'));
if ((settingsMarkup.match(/class="settings-group(?: settings-group-wide)?"/g) || []).length !== 3) {
  console.error('✘ Settings are not divided into three readable groups');
  failed++;
}

if (failed === 0) {
  console.log(`✔ All ${htmlIds.size} HTML IDs present; ${new Set([...usedIds, ...mappedIds]).size} used IDs covered`);
} else {
  console.error(`\n${failed} missing IDs`);
  process.exit(1);
}
