// hud.test.mjs — World status, target hints, screenshot mode, and clock formatting.
import { HUD, formatWorldClock } from '../src/ui/hud.js';
import { BLOCK } from '../src/world/blocks.js';
import { Inventory } from '../src/player/inventory.js';

function makeElement() {
  return {
    style: {},
    dataset: {},
    children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener() {},
    getContext() { return { clearRect() {}, drawImage() {} }; },
  };
}

globalThis.document = { createElement: () => makeElement() };

let passed = 0;
let failed = 0;
function ok(condition, message) {
  if (condition) passed++;
  else { failed++; console.error(`FAIL: ${message}`); }
}

ok(formatWorldClock(0) === '06:00'
  && formatWorldClock(0.25) === '12:00'
  && formatWorldClock(0.5) === '18:00'
  && formatWorldClock(0.75) === '00:00',
'World clock matches sunrise, noon, sunset, and midnight');
ok(formatWorldClock(Number.NaN) === '--:--', 'Invalid time values do not produce a broken display');

const root = makeElement();
const targetHint = makeElement();
const worldStatus = makeElement();
const inventory = new Inventory();
const hud = new HUD({
  root,
  targetHint,
  worldStatus,
  hotbar: makeElement(),
  hearts: makeElement(),
  hunger: makeElement(),
  air: makeElement(),
  itemName: makeElement(),
  breakProgress: makeElement(),
  fps: makeElement(),
  hurtOverlay: makeElement(),
  waterOverlay: makeElement(),
  modeLabel: makeElement(),
}, {}, inventory);

hud.setGameplayActive(true);
hud.setTargetHint({ id: BLOCK.CHEST }, { gamemode: 'survival', hunger: 10, maxHunger: 20 }, false);
ok(targetHint.textContent === 'Chest · Right-click to open' && targetHint.style.display === 'block',
  'Target hint shows direct chest controls');
hud.setTargetHint(null);
ok(targetHint.textContent === '' && targetHint.style.display === 'none',
  'Target hint disappears when no block is targeted');
hud.setTargetHint({ id: BLOCK.STONE }, { gamemode: 'survival', hunger: 10, maxHunger: 20 }, true);
ok(targetHint.textContent === 'Stone · ⛏ mine', 'Mobile target hints use touch action icons');

hud.setWorldStatus({ biome: 'Forest', timeOfDay: 0.25, weather: 'clear', y: 37.8 });
ok(worldStatus.textContent === 'Forest · 12:00 · ☀ Clear · Y 37'
  && worldStatus.style.display === 'block',
'World status compactly shows biome, world time, weather, and altitude');
hud.setWorldStatus();
ok(worldStatus.textContent === '' && worldStatus.style.display === 'none',
'World status can be safely hidden when leaving the world');
ok(hud.setHidden(true) === true && hud.hidden && root.style.display === 'none'
  && hud.setHidden(false) === false && root.style.display === '',
'Screenshot mode hides the HUD and fully restores it');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
