// furnace.js — Recipes, fuel, and time-based smelting logic for furnace containers.
import { BLOCK, BLOCKS } from '../world/blocks.js';

export const FURNACE_SLOT = Object.freeze({ INPUT: 0, FUEL: 1, OUTPUT: 2 });
export const FURNACE_SLOT_COUNT = 3;

const RECIPES = new Map([
  [BLOCK.COBBLESTONE, { id: BLOCK.STONE, count: 1, seconds: 4 }],
  [BLOCK.IRON_ORE, { id: BLOCK.IRON_INGOT, count: 1, seconds: 8 }],
  [BLOCK.GOLD_ORE, { id: BLOCK.GOLD_INGOT, count: 1, seconds: 8 }],
  [BLOCK.SAND, { id: BLOCK.GLASS, count: 1, seconds: 5 }],
  [BLOCK.CLAY, { id: BLOCK.BRICKS, count: 1, seconds: 6 }],
  [BLOCK.LOG, { id: BLOCK.CHARCOAL, count: 1, seconds: 8 }],
  [BLOCK.BIRCH_LOG, { id: BLOCK.CHARCOAL, count: 1, seconds: 8 }],
  [BLOCK.SPRUCE_LOG, { id: BLOCK.CHARCOAL, count: 1, seconds: 8 }],
  [BLOCK.PORKCHOP, { id: BLOCK.COOKED_PORKCHOP, count: 1, seconds: 5 }],
  [BLOCK.BEEF, { id: BLOCK.COOKED_BEEF, count: 1, seconds: 5 }],
  [BLOCK.CHICKEN, { id: BLOCK.COOKED_CHICKEN, count: 1, seconds: 5 }],
]);

// Burn time per fuel item in seconds. Wooden tools can also be used.
const FUEL_SECONDS = new Map([
  [BLOCK.COAL, 80],
  [BLOCK.CHARCOAL, 80],
  [BLOCK.LOG, 15],
  [BLOCK.BIRCH_LOG, 15],
  [BLOCK.SPRUCE_LOG, 15],
  [BLOCK.PLANKS, 15],
  [BLOCK.STICK, 5],
  [BLOCK.SAPLING, 5],
  [BLOCK.TORCH, 10],
  [BLOCK.WOOD_PICKAXE, 10],
  [BLOCK.WOOD_AXE, 10],
  [BLOCK.WOOD_SHOVEL, 10],
  [BLOCK.WOOD_SWORD, 10],
  [BLOCK.WOOD_HOE, 10],
]);

export function getSmeltingRecipe(inputId) {
  const recipe = RECIPES.get(inputId);
  return recipe ? { ...recipe } : null;
}

export function getFuelDuration(itemId) {
  return FUEL_SECONDS.get(itemId) || 0;
}

export function isFuelItem(itemId) {
  return getFuelDuration(itemId) > 0;
}

export function canPlaceFurnaceItem(slot, itemId) {
  if (slot === FURNACE_SLOT.INPUT) return RECIPES.has(itemId);
  if (slot === FURNACE_SLOT.FUEL) return isFuelItem(itemId);
  return false;
}

/** Create or sanitize a furnace state from a saved object. */
export function createFurnaceState(saved = null) {
  const oldSlots = Array.isArray(saved?.slots) ? saved.slots : [];
  const slots = Array.from({ length: FURNACE_SLOT_COUNT }, (_, index) => {
    const stack = oldSlots[index];
    const id = Number(stack?.id);
    const count = Math.floor(Number(stack?.count));
    if (!Number.isInteger(id) || !BLOCKS[id] || !Number.isFinite(count) || count < 1) return null;
    const maxStack = BLOCKS[id].maxStack || 64;
    return {
      id,
      count: Math.min(maxStack, count),
      dur: stack.dur == null ? null : Math.max(0, Number(stack.dur) || 0),
    };
  });

  const burnRemaining = clampNonNegative(saved?.burnRemaining);
  const burnTotal = Math.max(burnRemaining, clampNonNegative(saved?.burnTotal));
  return {
    slots,
    progress: clampNonNegative(saved?.progress),
    burnRemaining,
    burnTotal,
  };
}

/**
 * Simulate furnace progress. Returns true if a slot changed (fuel was consumed
 * or a product was completed).
 */
export function tickFurnace(state, dt) {
  if (!state || !Array.isArray(state.slots) || state.slots.length < FURNACE_SLOT_COUNT) return false;
  const elapsed = Math.max(0, Number(dt) || 0);
  if (!elapsed) return false;

  state.progress = clampNonNegative(state.progress);
  state.burnRemaining = clampNonNegative(state.burnRemaining);
  state.burnTotal = Math.max(state.burnRemaining, clampNonNegative(state.burnTotal));
  const input = state.slots[FURNACE_SLOT.INPUT];
  const fuel = state.slots[FURNACE_SLOT.FUEL];
  const recipe = input ? RECIPES.get(input.id) : null;
  const output = state.slots[FURNACE_SLOT.OUTPUT];
  const outputMax = recipe ? (BLOCKS[recipe.id]?.maxStack || 64) : 0;
  const outputFits = !!recipe && (!output
    || (output.id === recipe.id && output.dur == null && output.count + recipe.count <= outputMax));
  const canSmelt = !!input && input.count > 0 && outputFits;
  let slotsChanged = false;
  let remainingTime = elapsed;
  let processingTime = 0;

  // Fuel that has already started burning is always consumed, even if there is
  // currently no matching ingredient or space in the result slot.
  if (state.burnRemaining > 0) {
    const burned = Math.min(state.burnRemaining, remainingTime);
    state.burnRemaining -= burned;
    remainingTime -= burned;
    if (canSmelt) processingTime += burned;
  }

  // Large simulation steps may correctly start multiple fuel items in sequence.
  // In the game itself, dt is capped at 0.05 seconds.
  while (canSmelt && remainingTime > 1e-9 && state.burnRemaining <= 1e-9
      && state.slots[FURNACE_SLOT.FUEL] && isFuelItem(state.slots[FURNACE_SLOT.FUEL].id)) {
    const fuelStack = state.slots[FURNACE_SLOT.FUEL];
    const duration = getFuelDuration(fuelStack.id);
    fuelStack.count -= 1;
    if (fuelStack.count <= 0) state.slots[FURNACE_SLOT.FUEL] = null;
    const burned = Math.min(duration, remainingTime);
    state.burnRemaining = duration - burned;
    state.burnTotal = duration;
    remainingTime -= burned;
    processingTime += burned;
    slotsChanged = true;
  }

  if (canSmelt && processingTime > 0) {
    state.progress += processingTime;
    // dt is small in-game; the loop still handles large test/loading steps correctly.
    while (state.progress >= recipe.seconds && state.slots[FURNACE_SLOT.INPUT]?.count > 0) {
      const currentInput = state.slots[FURNACE_SLOT.INPUT];
      const currentOutput = state.slots[FURNACE_SLOT.OUTPUT];
      const fitsNow = !currentOutput
        || (currentOutput.id === recipe.id
          && currentOutput.dur == null
          && currentOutput.count + recipe.count <= outputMax);
      if (!fitsNow) break;

      currentInput.count -= 1;
      if (currentInput.count <= 0) state.slots[FURNACE_SLOT.INPUT] = null;
      if (currentOutput) currentOutput.count += recipe.count;
      else state.slots[FURNACE_SLOT.OUTPUT] = { id: recipe.id, count: recipe.count, dur: null };
      state.progress -= recipe.seconds;
      slotsChanged = true;
    }
  }

  if (!recipe) state.progress = 0;
  if (state.burnRemaining <= 1e-9) {
    state.burnRemaining = 0;
    state.burnTotal = 0;
  }
  return slotsChanged;
}

export function serializeFurnaceState(state) {
  const normalized = createFurnaceState(state);
  return {
    slots: normalized.slots.map((stack) => stack ? { ...stack } : null),
    progress: normalized.progress,
    burnRemaining: normalized.burnRemaining,
    burnTotal: normalized.burnTotal,
  };
}

function clampNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}
