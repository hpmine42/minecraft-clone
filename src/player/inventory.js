// inventory.js — Inventory, stacks, durability, and crafting recipes.
import { BLOCKS, BLOCK, TOOL, isPlaceable } from '../world/blocks.js';

export const HOTBAR_SIZE = 9;
export const INV_SIZE = 36; // 0–8 hotbar, 9–35 inventory
export const EQUIPMENT_SLOTS = Object.freeze(['head', 'chest', 'legs', 'feet', 'offhand']);

function emptyEquipment() {
  return Object.fromEntries(EQUIPMENT_SLOTS.map((slot) => [slot, null]));
}

function cloneMeta(meta) {
  if (meta == null) return null;
  if (typeof meta !== 'object') return meta;
  try { return JSON.parse(JSON.stringify(meta)); } catch { return null; }
}

function metaKey(meta) {
  if (meta == null) return '';
  if (typeof meta !== 'object') return String(meta);
  if (Array.isArray(meta)) return `[${meta.map(metaKey).join(',')}]`;
  return `{${Object.keys(meta).sort().map((key) => `${key}:${metaKey(meta[key])}`).join(',')}}`;
}

/** A slot: null | { id, count, dur, meta }. Invalid items are discarded. */
export function makeStack(id, count = 1, dur = null, meta = null) {
  const def = BLOCKS[id];
  const amount = Math.floor(Number(count));
  if (!def || !Number.isFinite(amount) || amount < 1) return null;
  const maxStack = Math.max(1, Number(def.maxStack) || 64);
  const maxDur = Math.max(0, Number(def.durability) || 0);
  const durability = maxDur > 0
    ? Math.max(0, Math.min(maxDur, Math.floor(dur == null ? maxDur : Number(dur))))
    : null;
  return {
    id,
    count: Math.min(amount, maxStack),
    dur: Number.isFinite(durability) ? durability : null,
    ...(meta == null ? {} : { meta: cloneMeta(meta) }),
  };
}

export function stacksEqual(a, b) {
  if (!a || !b) return false;
  return a.id === b.id
    && (a.dur ?? null) === (b.dur ?? null)
    && metaKey(a.meta) === metaKey(b.meta);
}

/** Equipment is accepted only when an existing item definition declares the slot. */
export function canEquipItem(stack, slot) {
  if (!stack || !BLOCKS[stack.id] || !EQUIPMENT_SLOTS.includes(slot)) return false;
  const def = BLOCKS[stack.id];
  return def.equipmentSlot === slot || def.equipmentSlots?.includes?.(slot) === true;
}

export class Inventory {
  constructor(size = INV_SIZE) {
    this.slots = new Array(size).fill(null);
    this.selected = 0; // Hotbar index
    this.equipment = emptyEquipment();
  }

  /** Currently selected stack. */
  held() {
    return this.slots[this.selected] || null;
  }

  /** Add an item. Returns the remaining count (0 = everything was added). */
  add(id, count = 1, dur = null, meta = null) {
    const def = BLOCKS[id];
    let remaining = Math.floor(Number(count));
    if (!def || !Number.isFinite(remaining) || remaining <= 0) return Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
    const maxStack = Math.max(1, Number(def.maxStack) || 64);
    const stackMeta = cloneMeta(meta);

    // Fill compatible stacks first. Damaged tools remain individual items.
    if (maxStack > 1 && dur == null && !(def.durability > 0)) {
      for (let i = 0; i < this.slots.length && remaining > 0; i++) {
        const current = this.slots[i];
        if (current && current.id === id && current.dur == null
            && metaKey(current.meta) === metaKey(stackMeta) && current.count < maxStack) {
          const moved = Math.min(maxStack - current.count, remaining);
          current.count += moved;
          remaining -= moved;
        }
      }
    }

    // Then fill empty slots; every item stays within its stack limit.
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      if (this.slots[i] == null) {
        const moved = Math.min(maxStack, remaining);
        this.slots[i] = makeStack(id, moved, dur, stackMeta);
        remaining -= moved;
      }
    }
    return remaining;
  }

  /** Count an item in the inventory. */
  count(id) {
    return this.slots.reduce((total, stack) => total + (stack?.id === id ? stack.count : 0), 0);
  }

  /** Consume items. Returns true if enough were available. */
  consume(id, count = 1) {
    let remaining = Math.floor(Number(count));
    if (!Number.isFinite(remaining) || remaining < 0 || this.count(id) < remaining) return false;
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      const stack = this.slots[i];
      if (stack && stack.id === id) {
        const take = Math.min(stack.count, remaining);
        stack.count -= take;
        remaining -= take;
        if (stack.count <= 0) this.slots[i] = null;
      }
    }
    return true;
  }

  /** Set slot contents (for drag and drop). */
  setSlot(i, stack) {
    if (!Number.isInteger(i) || i < 0 || i >= this.slots.length) return false;
    if (stack == null) {
      this.slots[i] = null;
      return true;
    }
    const normalized = makeStack(stack.id, stack.count, stack.dur, stack.meta);
    if (!normalized || normalized.count !== Math.floor(Number(stack.count))) return false;
    this.slots[i] = normalized;
    return true;
  }

  getSlot(i) {
    return Number.isInteger(i) && i >= 0 && i < this.slots.length ? this.slots[i] : null;
  }

  getEquipment(slot) {
    return EQUIPMENT_SLOTS.includes(slot) ? this.equipment[slot] : null;
  }

  setEquipment(slot, stack) {
    if (!EQUIPMENT_SLOTS.includes(slot)) return false;
    if (stack == null) {
      this.equipment[slot] = null;
      return true;
    }
    if (!canEquipItem(stack, slot)) return false;
    const maxStack = Math.max(1, Number(BLOCKS[stack.id]?.maxStack) || 64);
    if (stack.count > maxStack || (slot !== 'offhand' && stack.count !== 1)) return false;
    this.equipment[slot] = makeStack(stack.id, stack.count, stack.dur, stack.meta);
    return !!this.equipment[slot];
  }

  /** Swap or merge two slots. */
  swapSlots(a, b) {
    if (!Number.isInteger(a) || !Number.isInteger(b)
        || a < 0 || b < 0 || a >= this.slots.length || b >= this.slots.length || a === b) return;
    const stackA = this.slots[a];
    const stackB = this.slots[b];
    if (stackA && stackB && stacksEqual(stackA, stackB)) {
      const maxStack = Math.max(1, Number(BLOCKS[stackA.id]?.maxStack) || 64);
      const moved = Math.min(Math.max(0, maxStack - stackB.count), stackA.count);
      stackB.count += moved;
      stackA.count -= moved;
      if (stackA.count <= 0) this.slots[a] = null;
    } else {
      this.slots[a] = stackB;
      this.slots[b] = stackA;
    }
  }

  /** Reduce the durability of the held tool. */
  damageHeld(amount = 1) {
    const stack = this.held();
    if (!stack) return null;
    const def = BLOCKS[stack.id];
    if (!def || !def.durability) return stack;
    if (stack.dur == null) stack.dur = def.durability;
    stack.dur -= Math.max(0, Number(amount) || 0);
    if (stack.dur <= 0) {
      this.slots[this.selected] = null;
      return null;
    }
    return stack;
  }

  /** Damage bonus of the held tool. */
  heldDamage() {
    const stack = this.held();
    if (!stack) return 1;
    const def = BLOCKS[stack.id];
    return def && def.damage > 0 ? def.damage : 1;
  }

  /** Serialization with a backward-compatible equipment field. */
  toJSON() {
    const serialize = (stack) => (stack ? {
      id: stack.id,
      count: stack.count,
      dur: stack.dur,
      ...(stack.meta == null ? {} : { meta: cloneMeta(stack.meta) }),
    } : null);
    return {
      selected: this.selected,
      slots: this.slots.map(serialize),
      equipment: Object.fromEntries(EQUIPMENT_SLOTS.map((slot) => [slot, serialize(this.equipment[slot])])),
    };
  }

  fromJSON(data) {
    if (!data) return;
    const selected = Number.isInteger(data.selected) ? data.selected : 0;
    this.selected = Math.max(0, Math.min(HOTBAR_SIZE - 1, selected));
    this.slots = new Array(this.slots.length).fill(null);
    this.equipment = emptyEquipment();
    if (Array.isArray(data.slots)) {
      const overflow = [];
      for (let i = 0; i < Math.min(this.slots.length, data.slots.length); i++) {
        const source = data.slots[i];
        if (!source) continue;
        const originalCount = Math.max(0, Math.floor(Number(source.count) || 0));
        const stack = makeStack(source.id, originalCount, source.dur, source.meta);
        if (!stack) continue;
        this.slots[i] = stack;
        if (originalCount > stack.count) overflow.push({ ...source, count: originalCount - stack.count });
      }
      for (const stack of overflow) this.add(stack.id, stack.count, stack.dur, stack.meta);
    }
    if (data.equipment && typeof data.equipment === 'object') {
      for (const slot of EQUIPMENT_SLOTS) {
        const stack = data.equipment[slot];
        if (!stack) continue;
        const normalized = makeStack(stack.id, stack.count, stack.dur, stack.meta);
        if (normalized && canEquipItem(normalized, slot)
            && (slot === 'offhand' || normalized.count === 1)) {
          this.equipment[slot] = normalized;
        } else {
          this.add(normalized?.id ?? stack.id, normalized?.count ?? stack.count, normalized?.dur ?? stack.dur, normalized?.meta ?? stack.meta);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Crafting recipes
// ---------------------------------------------------------------------------
/**
 * Recipe: shaped (character pattern) or shapeless (ingredient list).
 * pattern: array of strings, ' ' = empty, letter = item from key.
 * result: { id, count }
 */
function shaped(pattern, key, result, name) {
  return { type: 'shaped', pattern, key, result, name };
}
function shapeless(ingredients, result, name) {
  return { type: 'shapeless', ingredients, result, name };
}

const P = BLOCK.PLANKS;
const S = BLOCK.STICK;

export const RECIPES = [
  shapeless([BLOCK.LOG], { id: BLOCK.PLANKS, count: 4 }, 'Oak Planks'),
  shapeless([BLOCK.BIRCH_LOG], { id: BLOCK.PLANKS, count: 4 }, 'Birch Planks'),
  shapeless([BLOCK.SPRUCE_LOG], { id: BLOCK.PLANKS, count: 4 }, 'Spruce Planks'),
  shaped(['P', 'P'], { P }, { id: BLOCK.STICK, count: 4 }, 'Sticks'),
  shaped(['PP', 'PP'], { P }, { id: BLOCK.CRAFTING_TABLE, count: 1 }, 'Crafting Table'),
  shaped(['CCC', 'C C', 'CCC'], { C: BLOCK.COBBLESTONE }, { id: BLOCK.FURNACE, count: 1 }, 'Furnace'),
  shaped(['PPP', 'P P', 'PPP'], { P }, { id: BLOCK.CHEST, count: 1 }, 'Chest'),
  shaped(['C', 'S'], { C: BLOCK.COAL, S }, { id: BLOCK.TORCH, count: 4 }, 'Torches'),
  shaped(['C', 'S'], { C: BLOCK.CHARCOAL, S }, { id: BLOCK.TORCH, count: 4 }, 'Charcoal Torches'),
  shaped(['C', 'S'], { C: BLOCK.REDSTONE, S }, { id: BLOCK.TORCH, count: 1 }, 'Redstone Torch'),
  shaped(['SSS', ' S ', ' S '], { S }, { id: BLOCK.LADDER, count: 3 }, 'Ladder'),
  shaped(['SS', 'SS'], { S: BLOCK.SAND }, { id: BLOCK.SANDSTONE, count: 1 }, 'Sandstone'),
  shaped(['SS', 'SS'], { S: BLOCK.STONE }, { id: BLOCK.STONE_BRICKS, count: 4 }, 'Stone Bricks'),
  shaped(['SS', 'SS'], { S: BLOCK.CLAY }, { id: BLOCK.BRICKS, count: 4 }, 'Bricks'),
  shaped(['W'], { W: BLOCK.WHEAT_ITEM }, { id: BLOCK.BREAD, count: 1 }, 'Bread'),
  shaped(['W', 'W', 'W'], { W: BLOCK.WHEAT_ITEM }, { id: BLOCK.BREAD, count: 1 }, 'Bread'),
  shaped(['WWW'], { W: BLOCK.WHEAT_ITEM }, { id: BLOCK.BREAD, count: 1 }, 'Bread'),
  shapeless([BLOCK.BONE], { id: BLOCK.BONE_MEAL, count: 3 }, 'Bone Meal'),
  shapeless([BLOCK.SUGAR_CANE], { id: BLOCK.SUGAR_CANE, count: 1 }, 'Sugar Cane'),

  // Tools: pickaxes
  shaped(['MMM', ' S ', ' S '], { M: BLOCK.PLANKS, S }, { id: BLOCK.WOOD_PICKAXE, count: 1 }, 'Wooden Pickaxe'),
  shaped(['MMM', ' S ', ' S '], { M: BLOCK.COBBLESTONE, S }, { id: BLOCK.STONE_PICKAXE, count: 1 }, 'Stone Pickaxe'),
  shaped(['MMM', ' S ', ' S '], { M: BLOCK.IRON_INGOT, S }, { id: BLOCK.IRON_PICKAXE, count: 1 }, 'Iron Pickaxe'),
  shaped(['MMM', ' S ', ' S '], { M: BLOCK.DIAMOND, S }, { id: BLOCK.DIAMOND_PICKAXE, count: 1 }, 'Diamond Pickaxe'),
  // Axes
  shaped(['MM', 'MS', ' S'], { M: BLOCK.PLANKS, S }, { id: BLOCK.WOOD_AXE, count: 1 }, 'Wooden Axe'),
  shaped(['MM', 'MS', ' S'], { M: BLOCK.COBBLESTONE, S }, { id: BLOCK.STONE_AXE, count: 1 }, 'Stone Axe'),
  shaped(['MM', 'MS', ' S'], { M: BLOCK.IRON_INGOT, S }, { id: BLOCK.IRON_AXE, count: 1 }, 'Iron Axe'),
  shaped(['MM', 'MS', ' S'], { M: BLOCK.DIAMOND, S }, { id: BLOCK.DIAMOND_AXE, count: 1 }, 'Diamond Axe'),
  // Shovels
  shaped(['M', 'S', 'S'], { M: BLOCK.PLANKS, S }, { id: BLOCK.WOOD_SHOVEL, count: 1 }, 'Wooden Shovel'),
  shaped(['M', 'S', 'S'], { M: BLOCK.COBBLESTONE, S }, { id: BLOCK.STONE_SHOVEL, count: 1 }, 'Stone Shovel'),
  shaped(['M', 'S', 'S'], { M: BLOCK.IRON_INGOT, S }, { id: BLOCK.IRON_SHOVEL, count: 1 }, 'Iron Shovel'),
  shaped(['M', 'S', 'S'], { M: BLOCK.DIAMOND, S }, { id: BLOCK.DIAMOND_SHOVEL, count: 1 }, 'Diamond Shovel'),
  // Swords
  shaped(['M', 'M', 'S'], { M: BLOCK.PLANKS, S }, { id: BLOCK.WOOD_SWORD, count: 1 }, 'Wooden Sword'),
  shaped(['M', 'M', 'S'], { M: BLOCK.COBBLESTONE, S }, { id: BLOCK.STONE_SWORD, count: 1 }, 'Stone Sword'),
  shaped(['M', 'M', 'S'], { M: BLOCK.IRON_INGOT, S }, { id: BLOCK.IRON_SWORD, count: 1 }, 'Iron Sword'),
  shaped(['M', 'M', 'S'], { M: BLOCK.DIAMOND, S }, { id: BLOCK.DIAMOND_SWORD, count: 1 }, 'Diamond Sword'),
  // Hoes
  shaped(['MM', ' S', ' S'], { M: BLOCK.PLANKS, S }, { id: BLOCK.WOOD_HOE, count: 1 }, 'Wooden Hoe'),
  shaped(['MM', ' S', ' S'], { M: BLOCK.COBBLESTONE, S }, { id: BLOCK.STONE_HOE, count: 1 }, 'Stone Hoe'),
  shaped(['MM', ' S', ' S'], { M: BLOCK.IRON_INGOT, S }, { id: BLOCK.IRON_HOE, count: 1 }, 'Iron Hoe'),
  shaped(['MM', ' S', ' S'], { M: BLOCK.DIAMOND, S }, { id: BLOCK.DIAMOND_HOE, count: 1 }, 'Diamond Hoe'),
];

/**
 * Match a player (2×2) or crafting table (3×3) crafting grid.
 * @returns {{id:number,count:number}|null}
 */
export function matchRecipe(grid) {
  if (!Array.isArray(grid) || ![4, 9].includes(grid.length)) return null;
  const size = Math.sqrt(grid.length);
  const ids = grid.map((stack) => (stack ? stack.id : null));
  if (ids.every((id) => id == null)) return null;

  // Find the non-empty rectangle so recipes match at any grid position.
  let minR = size, maxR = -1, minC = size, maxC = -1;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (ids[r * size + c] != null) {
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
      }
    }
  }
  const width = maxC - minC + 1;
  const height = maxR - minR + 1;
  const cells = Array.from({ length: height }, (_, r) =>
    Array.from({ length: width }, (_, c) => ids[(minR + r) * size + minC + c] ?? null));
  const usedIds = ids.filter((id) => id != null);

  for (const recipe of RECIPES) {
    if (recipe.type === 'shapeless') {
      if (recipe.ingredients.length !== usedIds.length) continue;
      const remaining = [...usedIds];
      let matched = true;
      for (const ingredient of recipe.ingredients) {
        const index = remaining.indexOf(ingredient);
        if (index < 0) {
          matched = false;
          break;
        }
        remaining.splice(index, 1);
      }
      if (matched && remaining.length === 0) return { ...recipe.result };
      continue;
    }

    const pattern = recipe.pattern.map((row) => row.split(''));
    const patternHeight = pattern.length;
    const patternWidth = Math.max(...pattern.map((row) => row.length));
    if (patternHeight !== height || patternWidth !== width) continue;

    const matches = (mirror) => {
      for (let r = 0; r < patternHeight; r++) {
        for (let c = 0; c < patternWidth; c++) {
          const patternColumn = mirror ? patternWidth - 1 - c : c;
          const symbol = pattern[r][patternColumn] || ' ';
          const cell = cells[r][c];
          if (symbol === ' ') {
            if (cell != null) return false;
          } else if (cell !== recipe.key[symbol]) {
            return false;
          }
        }
      }
      return true;
    };
    if (matches(false) || matches(true)) return { ...recipe.result };
  }
  return null;
}

/** All recipes a player could craft with unlimited ingredients (for Help). */
export function listRecipes() {
  return RECIPES.map((r) => ({
    name: r.name,
    result: r.result,
    ingredients: r.type === 'shapeless'
      ? r.ingredients
      : r.pattern.flatMap((row) => row.split('')).filter((c) => c !== ' ').map((c) => r.key[c]),
  }));
}
