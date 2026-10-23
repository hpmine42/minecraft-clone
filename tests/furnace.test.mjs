// furnace.test.mjs — Smelting recipes, fuel, progress, and state.
import { BLOCK } from '../src/world/blocks.js';
import {
  canPlaceFurnaceItem,
  createFurnaceState,
  FURNACE_SLOT,
  getFuelDuration,
  getSmeltingRecipe,
  isFuelItem,
  serializeFurnaceState,
  tickFurnace,
} from '../src/player/furnace.js';

let passed = 0;
let failed = 0;
function ok(condition, message) {
  if (condition) passed++;
  else { failed++; console.error(`FAIL: ${message}`); }
}

const recipes = [
  [BLOCK.COBBLESTONE, BLOCK.STONE],
  [BLOCK.IRON_ORE, BLOCK.IRON_INGOT],
  [BLOCK.GOLD_ORE, BLOCK.GOLD_INGOT],
  [BLOCK.SAND, BLOCK.GLASS],
  [BLOCK.CLAY, BLOCK.BRICKS],
  [BLOCK.LOG, BLOCK.CHARCOAL],
  [BLOCK.BIRCH_LOG, BLOCK.CHARCOAL],
  [BLOCK.SPRUCE_LOG, BLOCK.CHARCOAL],
  [BLOCK.PORKCHOP, BLOCK.COOKED_PORKCHOP],
  [BLOCK.BEEF, BLOCK.COOKED_BEEF],
  [BLOCK.CHICKEN, BLOCK.COOKED_CHICKEN],
];
for (const [input, output] of recipes) {
  ok(getSmeltingRecipe(input)?.id === output, `Recipe ${input} → ${output}`);
}
ok(getSmeltingRecipe(BLOCK.DIAMOND_ORE) === null, 'Unsupported ores are not smelted');
ok(getSmeltingRecipe(BLOCK.LOG)?.seconds === 8, 'Wood is converted into charcoal');

ok(getFuelDuration(BLOCK.COAL) === 80, 'Coal burns for 80 seconds');
ok(getFuelDuration(BLOCK.CHARCOAL) === 80, 'Charcoal burns for 80 seconds');
ok(getFuelDuration(BLOCK.PLANKS) === 15, 'Planks are fuel');
ok(getFuelDuration(BLOCK.STICK) === 5, 'Sticks are fuel');
ok(getFuelDuration(BLOCK.IRON_INGOT) === 0, 'Metal ingots are not fuel');
ok(isFuelItem(BLOCK.CHARCOAL), 'Charcoal is recognized as fuel');
ok(canPlaceFurnaceItem(FURNACE_SLOT.INPUT, BLOCK.IRON_ORE), 'Ore fits in the input slot');
ok(!canPlaceFurnaceItem(FURNACE_SLOT.INPUT, BLOCK.COAL), 'Coal does not fit in the input slot');
ok(canPlaceFurnaceItem(FURNACE_SLOT.FUEL, BLOCK.COAL), 'Coal fits in the fuel slot');
ok(!canPlaceFurnaceItem(FURNACE_SLOT.OUTPUT, BLOCK.IRON_INGOT), 'The result slot cannot be filled directly');

const idle = createFurnaceState({ slots: [{ id: BLOCK.IRON_ORE, count: 1 }, null, null] });
ok(tickFurnace(idle, 2) === false, 'No product is created without fuel');
ok(idle.progress === 0 && idle.slots[0].count === 1, 'The ingredient remains unchanged without fuel');

const furnace = createFurnaceState({
  slots: [
    { id: BLOCK.IRON_ORE, count: 2, dur: null },
    { id: BLOCK.COAL, count: 1, dur: null },
    null,
  ],
});
ok(tickFurnace(furnace, 4) === true, 'One coal is consumed at startup');
ok(furnace.slots[FURNACE_SLOT.FUEL] === null, 'The last coal is removed from the fuel slot');
ok(furnace.progress === 4 && furnace.slots[FURNACE_SLOT.INPUT].count === 2, 'Smelting progress accumulates');
ok(tickFurnace(furnace, 4) === true, 'An ingot is produced after eight seconds');
ok(furnace.slots[FURNACE_SLOT.OUTPUT]?.id === BLOCK.IRON_INGOT, 'An iron ingot is placed in the result slot');
ok(furnace.slots[FURNACE_SLOT.INPUT]?.count === 1, 'One ore was consumed');
ok(tickFurnace(furnace, 8) === true, 'A second ore can be processed with the same burn cycle');
ok(furnace.slots[FURNACE_SLOT.OUTPUT]?.count === 2, 'Ingots stack in the result slot');
ok(furnace.slots[FURNACE_SLOT.INPUT] === null, 'All ores were consumed');

const charcoal = createFurnaceState({
  slots: [
    { id: BLOCK.BIRCH_LOG, count: 1 },
    { id: BLOCK.COAL, count: 1 },
    null,
  ],
});
tickFurnace(charcoal, 8);
ok(charcoal.slots[FURNACE_SLOT.OUTPUT]?.id === BLOCK.CHARCOAL, 'Wood produces charcoal');
ok(getFuelDuration(charcoal.slots[FURNACE_SLOT.OUTPUT].id) === 80, 'Produced charcoal can fuel the furnace');

const blocked = createFurnaceState({
  slots: [
    { id: BLOCK.IRON_ORE, count: 1 },
    { id: BLOCK.COAL, count: 1 },
    { id: BLOCK.IRON_INGOT, count: 64 },
  ],
});
ok(tickFurnace(blocked, 3) === false, 'A full output prevents smelting');
ok(blocked.slots[FURNACE_SLOT.FUEL].count === 1 && blocked.progress === 0, 'No new fuel is consumed while the output is full');

const burningWithoutInput = createFurnaceState({ burnRemaining: 5, burnTotal: 80 });
tickFurnace(burningWithoutInput, 2);
ok(burningWithoutInput.burnRemaining === 3, 'Already burning fuel continues to burn without input');
tickFurnace(burningWithoutInput, 4);
ok(burningWithoutInput.burnRemaining === 0 && burningWithoutInput.burnTotal === 0, 'Spent fuel is reset');

const saved = serializeFurnaceState(furnace);
const restored = createFurnaceState(saved);
ok(restored.slots[FURNACE_SLOT.OUTPUT]?.count === 2, 'The result persists when saved');
ok(restored.burnRemaining === furnace.burnRemaining, 'Burn time persists when saved');
ok(restored.slots !== furnace.slots && restored.slots[2] !== furnace.slots[2], 'Loaded furnace slots are independent objects');
const sanitized = createFurnaceState({
  slots: [{ id: BLOCK.IRON_ORE, count: 999 }, { id: 9999, count: 3 }],
  progress: -4,
  burnRemaining: 'not-a-number',
});
ok(sanitized.slots[0].count === 64 && sanitized.slots[1] === null, 'Invalid or oversized saved stacks are sanitized');
ok(sanitized.progress === 0 && sanitized.burnRemaining === 0, 'Invalid progress values are sanitized');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
