// containers.js — Validation and serialization of world-bound chest contents.
import { BLOCKS } from '../world/blocks.js';

export const CHEST_SLOT_COUNT = 27;

export function createChestState(saved = null) {
  const oldSlots = Array.isArray(saved) ? saved : (Array.isArray(saved?.slots) ? saved.slots : []);
  const slots = Array.from({ length: CHEST_SLOT_COUNT }, (_, index) => {
    const stack = oldSlots[index];
    const id = Number(stack?.id);
    const count = Math.floor(Number(stack?.count));
    if (!Number.isInteger(id) || !BLOCKS[id] || !Number.isFinite(count) || count < 1) return null;
    return {
      id,
      count: Math.min(BLOCKS[id].maxStack || 64, count),
      dur: stack.dur == null ? null : Math.max(0, Number(stack.dur) || 0),
    };
  });
  return { slots };
}

export function serializeChestState(state) {
  const normalized = createChestState(state);
  return { slots: normalized.slots.map((stack) => stack ? { ...stack } : null) };
}
