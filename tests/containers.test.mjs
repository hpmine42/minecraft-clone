// containers.test.mjs — Persistent chest slots and defensive save normalization.
import { BLOCK } from '../src/world/blocks.js';
import { CHEST_SLOT_COUNT, createChestState, serializeChestState } from '../src/player/containers.js';

let passed = 0;
let failed = 0;
function ok(condition, message) {
  if (condition) passed++;
  else { failed++; console.error(`FAIL: ${message}`); }
}

const chest = createChestState();
ok(chest.slots.length === CHEST_SLOT_COUNT && chest.slots.every((slot) => slot === null), 'A new chest has 27 empty slots');

const restored = createChestState({ slots: [
  { id: BLOCK.BREAD, count: 8, dur: null },
  { id: BLOCK.IRON_PICKAXE, count: 4, dur: 90 },
  { id: 99999, count: 2 },
  { id: BLOCK.STONE, count: 0 },
  { id: BLOCK.DIRT, count: 100 },
] });
ok(restored.slots[0]?.id === BLOCK.BREAD && restored.slots[0].count === 8, 'Valid stacks are restored');
ok(restored.slots[1]?.id === BLOCK.IRON_PICKAXE && restored.slots[1].dur === 90, 'Tool durability is restored');
ok(restored.slots[2] === null && restored.slots[3] === null, 'Invalid and empty save entries are discarded');
ok(restored.slots[4]?.count === 64, 'Stack sizes are capped at the item limit');
ok(restored.slots.length === 27, 'Chest remains complete even with a short saved slot list');

const serialized = serializeChestState(restored);
const loadedAgain = createChestState(serialized);
ok(loadedAgain.slots[0]?.count === 8 && loadedAgain.slots[1]?.dur === 90, 'Chest contents survive serialization and loading');
ok(loadedAgain.slots !== restored.slots && loadedAgain.slots[0] !== restored.slots[0], 'Loaded chest is independent of the original state');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
