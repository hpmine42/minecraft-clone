// storage.js — Save, load, and back up games in localStorage.
import { BLOCKS } from '../world/blocks.js';

// Keep the legacy key names so existing browser saves remain compatible.
const SAVE_KEY = 'minecraft-klon-save-v1';
const SETTINGS_KEY = 'minecraft-klon-settings-v1';
export const MAX_SAVE_SIZE = 8 * 1024 * 1024;

const EQUIPMENT_SLOTS = ['head', 'chest', 'legs', 'feet', 'offhand'];
const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

function validMeta(value, depth = 0, budget = { nodes: 0 }) {
  budget.nodes++;
  if (budget.nodes > 2048 || depth > 16) return false;
  if (value == null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 4096;
  if (Array.isArray(value)) {
    return value.length <= 128 && value.every((item) => validMeta(item, depth + 1, budget));
  }
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length <= 128 && keys.every((key) => validMeta(value[key], depth + 1, budget));
}

function validStack(stack) {
  if (!isRecord(stack) || !Number.isInteger(stack.id) || !BLOCKS[stack.id]) return false;
  const def = BLOCKS[stack.id];
  const maxStack = Math.max(1, Number(def.maxStack) || 64);
  if (!Number.isInteger(stack.count) || stack.count < 1 || stack.count > maxStack) return false;
  if (stack.dur != null) {
    const maxDurability = Math.max(0, Number(def.durability) || 0);
    if (!maxDurability || !Number.isInteger(stack.dur) || stack.dur < 0 || stack.dur > maxDurability) return false;
  }
  return stack.meta == null || validMeta(stack.meta);
}

function validPlayer(player) {
  if (player == null) return true;
  if (!isRecord(player)) return false;
  if (player.position != null) {
    if (!isRecord(player.position)
        || ![player.position.x, player.position.y, player.position.z].every(Number.isFinite)) return false;
  }
  if (player.yaw != null && !Number.isFinite(player.yaw)) return false;
  if (player.pitch != null && (!Number.isFinite(player.pitch)
      || player.pitch < -Math.PI / 2 || player.pitch > Math.PI / 2)) return false;
  for (const [key, max] of [['health', 20], ['hunger', 20], ['breath', 10]]) {
    if (player[key] != null && (!Number.isFinite(player[key]) || player[key] < 0 || player[key] > max)) return false;
  }
  if (player.gamemode != null && !['survival', 'creative'].includes(player.gamemode)) return false;
  if (player.flying != null && typeof player.flying !== 'boolean') return false;
  if (player.peaceful != null && typeof player.peaceful !== 'boolean') return false;
  return true;
}

function validInventory(inventory) {
  if (!isRecord(inventory) || !Array.isArray(inventory.slots) || inventory.slots.length > 36) return false;
  if (inventory.selected != null && (!Number.isInteger(inventory.selected)
      || inventory.selected < 0 || inventory.selected > 8)) return false;
  if (!inventory.slots.every((stack) => stack == null || validStack(stack))) return false;
  if (inventory.equipment == null) return true;
  if (!isRecord(inventory.equipment)) return false;
  for (const [slot, stack] of Object.entries(inventory.equipment)) {
    if (!EQUIPMENT_SLOTS.includes(slot)) {
      if (stack != null) return false;
      continue;
    }
    if (stack == null) continue;
    if (!validStack(stack)) return false;
    const def = BLOCKS[stack.id];
    const supportsSlot = def.equipmentSlot === slot || def.equipmentSlots?.includes?.(slot) === true;
    if (!supportsSlot || (slot !== 'offhand' && stack.count !== 1)) return false;
  }
  return true;
}

function validPosition(position) {
  return isRecord(position)
    && [position.x, position.y, position.z].every(Number.isFinite);
}

function validPositionKey(key) {
  if (typeof key !== 'string' || !/^-?\d+,\d+,-?\d+$/.test(key)) return false;
  const coords = key.split(',').map(Number);
  return coords.every(Number.isSafeInteger) && coords[1] >= 0 && coords[1] < 64;
}

function validSlots(slots, maxSlots) {
  return Array.isArray(slots) && slots.length <= maxSlots
    && slots.every((stack) => stack == null || validStack(stack));
}

function validWorldChanges(changes) {
  if (changes == null) return true;
  if (!Array.isArray(changes)) return false;
  const seen = new Set();
  for (const entry of changes) {
    if (!isRecord(entry) || !validPositionKey(entry.pos)
        || !Number.isInteger(entry.id) || !BLOCKS[entry.id]
        || (entry.meta != null && (!Number.isInteger(entry.meta) || entry.meta < 0 || entry.meta > 255))
        || seen.has(entry.pos)) return false;
    seen.add(entry.pos);
  }
  return true;
}

function validContainers(entries, slotCount, allowArrayState = false) {
  if (entries == null) return true;
  if (!Array.isArray(entries)) return false;
  const seen = new Set();
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2 || !validPositionKey(entry[0]) || seen.has(entry[0])) return false;
    const state = entry[1];
    const slots = allowArrayState && Array.isArray(state) ? state : state?.slots;
    if (!validSlots(slots, slotCount)) return false;
    if (!allowArrayState) {
      if (!isRecord(state)) return false;
      for (const key of ['progress', 'burnRemaining', 'burnTotal']) {
        if (state[key] != null && (!Number.isFinite(state[key]) || state[key] < 0 || state[key] > 3600)) return false;
      }
    }
    seen.add(entry[0]);
  }
  return true;
}

function validInventoryUI(state) {
  if (state == null) return true;
  if (!isRecord(state) || (state.craftingMode != null && !['player', 'workbench'].includes(state.craftingMode))) return false;
  const gridLimit = state.craftingMode === 'workbench' ? 9 : 4;
  if (state.craftGrid != null && !validSlots(state.craftGrid, gridLimit)) return false;
  return ['craftRemainder', 'heldStack'].every((key) => state[key] == null || validStack(state[key]));
}

function validDroppedItems(items) {
  if (items == null) return true;
  if (!Array.isArray(items)) return false;
  return items.every((item) => {
    if (!isRecord(item) || !validPosition(item.position)
        || !validStack({ id: item.id, count: item.count, dur: item.dur, meta: item.meta })) return false;
    if (item.velocity != null && !validPosition(item.velocity)) return false;
    if (item.life != null && (!Number.isFinite(item.life) || item.life < 0 || item.life > 300)) return false;
    if (item.pickupDelay != null && (!Number.isFinite(item.pickupDelay) || item.pickupDelay < 0)) return false;
    return true;
  });
}

function validSave(data) {
  if (!isRecord(data) || data.version !== 1
      || !Number.isInteger(data.seed) || data.seed < 0 || data.seed > 0xffffffff
      || (data.worldType != null && !['normal', 'flat'].includes(data.worldType))
      || !validInventory(data.inventory) || !validPlayer(data.player)
      || !validWorldChanges(data.modified)
      || !validContainers(data.furnaces, 3)
      || !validContainers(data.chests, 27, true)
      || !validInventoryUI(data.inventoryUI)
      || !validDroppedItems(data.droppedItems)) return false;
  if (data.timeOfDay != null && (!Number.isFinite(data.timeOfDay) || data.timeOfDay < 0 || data.timeOfDay > 1)) return false;
  if (data.weather != null && !['clear', 'rain'].includes(data.weather)) return false;
  if (data.weatherTimer != null && (!Number.isFinite(data.weatherTimer) || data.weatherTimer < 0)) return false;
  if (data.stats != null) {
    const statKeys = ['blocksPlaced', 'blocksMined', 'mobsKilled', 'itemsPicked', 'distance'];
    if (!isRecord(data.stats) || Object.entries(data.stats).some(([key, value]) => (
      !statKeys.includes(key) || !Number.isFinite(value) || value < 0
    ))) return false;
  }
  return true;
}

function sanitizeSettings(data) {
  if (!isRecord(data)) return null;
  const clean = {};
  const numeric = {
    renderDistance: [2, 10, true],
    fov: [60, 110, true],
    sensitivity: [0.0008, 0.009, false],
    volume: [0, 1, false],
    dayLength: [0, 1800, false],
    autosaveInterval: [10, 3600, true],
  };
  for (const [key, [min, max, integer]] of Object.entries(numeric)) {
    if (!Number.isFinite(data[key])) continue;
    const bounded = Math.max(min, Math.min(max, data[key]));
    const value = key === 'autosaveInterval' ? Math.round(bounded / 10) * 10 : bounded;
    clean[key] = integer ? Math.round(value) : value;
  }
  for (const key of ['showDebug', 'invertY', 'autosave', 'reduceMotion']) {
    if (typeof data[key] === 'boolean') clean[key] = data[key];
  }
  if (data.particles === 'high' || data.particles === 'low') clean.particles = data.particles;
  return clean;
}

export function saveGame(world, player, inventory, extra = {}) {
  try {
    const data = {
      version: 1,
      savedAt: new Date().toISOString(),
      seed: world.seed,
      worldType: world.worldType,
      modified: [...world.modified.entries()].map(([pos, val]) => ({ pos, ...val })),
      player: player.toJSON(),
      inventory: inventory.toJSON(),
      timeOfDay: extra.timeOfDay ?? 0.25,
      weather: extra.weather ?? 'clear',
      weatherTimer: extra.weatherTimer ?? 60,
      stats: extra.stats ?? {},
      furnaces: Array.isArray(extra.furnaces) ? extra.furnaces : [],
      chests: Array.isArray(extra.chests) ? extra.chests : [],
      inventoryUI: extra.inventoryUI || null,
      droppedItems: Array.isArray(extra.droppedItems) ? extra.droppedItems : [],
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('Saving failed:', e);
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!validSave(data)) return null;
    return data;
  } catch (e) {
    console.warn('Loading failed:', e);
    return null;
  }
}

/** Read even a corrupted save unchanged so it can be backed up. */
export function exportSaveData() {
  try {
    return localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

/** Import only complete, size-limited saves. Errors leave the old save intact. */
export function importSaveData(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_SAVE_SIZE) return false;
  try {
    if (!validSave(JSON.parse(raw))) return false;
    localStorage.setItem(SAVE_KEY, raw);
    return true;
  } catch (e) {
    console.warn('Import failed:', e);
    return false;
  }
}

export function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch (e) {
    return false;
  }
}

export function deleteSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    return true;
  } catch (e) {
    return false;
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    return sanitizeSettings(JSON.parse(raw));
  } catch (e) {
    return null;
  }
}

/** Default settings (device-dependent). */
export function defaultSettings(isMobile) {
  return {
    renderDistance: isMobile ? 3 : 6,
    fov: isMobile ? 70 : 75,
    sensitivity: isMobile ? 0.0042 : 0.0022,
    volume: 0.7,
    dayLength: 480,           // Seconds per day
    showDebug: false,
    invertY: false,
    reduceMotion: false,
    autosaveInterval: 60,
    particles: isMobile ? 'low' : 'high',
  };
}
