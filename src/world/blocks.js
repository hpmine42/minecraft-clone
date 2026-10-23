// blocks.js — Block registry: IDs, properties, texture tiles, drops, and tool classes.

export const BLOCK = {
  AIR: 0,
  STONE: 1,
  GRASS: 2,
  DIRT: 3,
  COBBLESTONE: 4,
  PLANKS: 5,
  SAPLING: 6,
  BEDROCK: 7,
  WATER: 8,
  LAVA: 9,
  SAND: 10,
  GRAVEL: 11,
  GOLD_ORE: 12,
  IRON_ORE: 13,
  COAL_ORE: 14,
  DIAMOND_ORE: 15,
  REDSTONE_ORE: 16,
  LOG: 17,
  LEAVES: 18,
  GLASS: 19,
  SANDSTONE: 20,
  WOOL: 21,
  FLOWER_RED: 22,
  FLOWER_YELLOW: 23,
  TALL_GRASS: 24,
  MUSHROOM_RED: 25,
  TORCH: 26,
  CRAFTING_TABLE: 27,
  FURNACE: 28,
  CHEST: 29,
  SNOW: 30,
  ICE: 31,
  CACTUS: 32,
  BRICKS: 33,
  STONE_BRICKS: 34,
  OBSIDIAN: 35,
  BOOKSHELF: 36,
  MOSSY_COBBLE: 37,
  CLAY: 38,
  FARMLAND: 39,
  WHEAT: 40,
  LADDER: 41,
  BIRCH_LOG: 42,
  BIRCH_LEAVES: 43,
  SPRUCE_LOG: 44,
  SPRUCE_LEAVES: 45,
  STICK: 200,      // Items (not blocks)
  COAL: 201,
  IRON_INGOT: 202,
  GOLD_INGOT: 203,
  DIAMOND: 204,
  REDSTONE: 205,
  WOOD_PICKAXE: 210,
  STONE_PICKAXE: 211,
  IRON_PICKAXE: 212,
  DIAMOND_PICKAXE: 213,
  WOOD_AXE: 214,
  STONE_AXE: 215,
  IRON_AXE: 216,
  DIAMOND_AXE: 217,
  WOOD_SHOVEL: 218,
  STONE_SHOVEL: 219,
  IRON_SHOVEL: 220,
  DIAMOND_SHOVEL: 221,
  WOOD_SWORD: 222,
  STONE_SWORD: 223,
  IRON_SWORD: 224,
  DIAMOND_SWORD: 225,
  WOOD_HOE: 226,
  STONE_HOE: 227,
  IRON_HOE: 228,
  DIAMOND_HOE: 229,
  APPLE: 230,
  BREAD: 231,
  PORKCHOP: 232,
  COOKED_PORKCHOP: 233,
  BEEF: 234,
  COOKED_BEEF: 235,
  CHICKEN: 236,
  COOKED_CHICKEN: 237,
  SEEDS: 240,
  WHEAT_ITEM: 241,
  LEATHER: 242,
  FEATHER: 243,
  BONE: 244,
  BONE_MEAL: 245,
  CHARCOAL: 246,
  SUGAR_CANE: 250,
};

// Render types
export const RENDER = {
  CUBE: 'cube',        // standard full block
  CROSS: 'cross',      // X-shaped plants
  TORCH: 'torch',      // torch (slim)
  WATER: 'water',      // transparent, animated
  LEAVES: 'leaves',    // dense foliage
  GLASS: 'glass',      // transparent, smooth
  CROP: 'crop',        // plants with growth stages
  LADDER: 'ladder',
};

// Tool classes
export const TOOL = {
  NONE: 'none',
  PICKAXE: 'pickaxe',
  AXE: 'axe',
  SHOVEL: 'shovel',
  SWORD: 'sword',
  HOE: 'hoe',
};

/**
 * Block definitions.
 * tiles: [top, side, bottom] — indices in the 16×16 texture atlas grid.
 * hardness: base mining time in seconds; toolSpeed: multiplier with the correct tool.
 */
function def(id, name, opts) {
  return {
    id,
    name,
    render: RENDER.CUBE,
    solid: true,
    transparent: false,
    light: 0,
    hardness: 1,
    tool: TOOL.NONE,
    toolLevel: 0,        // 0: hand, 1: wood, 2: stone, 3: iron, 4: diamond
    toolSpeed: 1,
    drops: null,         // null = itself
    dropCount: 1,
    gravity: false,
    flammable: false,
    climbable: false,
    food: 0,
    maxStack: 64,
    ...opts,
  };
}

export const BLOCKS = {};
function reg(block) {
  BLOCKS[block.id] = block;
  return block;
}

// ---- Nature & terrain -------------------------------------------------------
reg(def(BLOCK.AIR, 'Air', { solid: false, transparent: true, render: RENDER.CUBE, hardness: 0 }));
reg(def(BLOCK.STONE, 'Stone', {
  tiles: [2, 2, 2], hardness: 1.5, tool: TOOL.PICKAXE, toolLevel: 1,
  drops: BLOCK.COBBLESTONE,
}));
reg(def(BLOCK.GRASS, 'Grass Block', {
  tiles: [0, 1, 3], hardness: 0.6, tool: TOOL.SHOVEL, drops: BLOCK.DIRT,
}));
reg(def(BLOCK.DIRT, 'Dirt', {
  tiles: [3, 3, 3], hardness: 0.5, tool: TOOL.SHOVEL,
}));
reg(def(BLOCK.COBBLESTONE, 'Cobblestone', {
  tiles: [4, 4, 4], hardness: 2, tool: TOOL.PICKAXE, toolLevel: 1,
}));
reg(def(BLOCK.BEDROCK, 'Bedrock', {
  tiles: [5, 5, 5], hardness: -1, drops: null,
}));
reg(def(BLOCK.SAND, 'Sand', {
  tiles: [6, 6, 6], hardness: 0.5, tool: TOOL.SHOVEL, gravity: true,
}));
reg(def(BLOCK.GRAVEL, 'Gravel', {
  tiles: [7, 7, 7], hardness: 0.6, tool: TOOL.SHOVEL, gravity: true,
  drops: BLOCK.GRAVEL,
}));
reg(def(BLOCK.SANDSTONE, 'Sandstone', {
  tiles: [8, 9, 10], hardness: 0.8, tool: TOOL.PICKAXE, toolLevel: 1,
}));
reg(def(BLOCK.CLAY, 'Clay', {
  tiles: [11, 11, 11], hardness: 0.6, tool: TOOL.SHOVEL,
}));
reg(def(BLOCK.SNOW, 'Snow', {
  tiles: [12, 13, 3], hardness: 0.6, tool: TOOL.SHOVEL,
}));
reg(def(BLOCK.ICE, 'Ice', {
  tiles: [14, 14, 14], hardness: 0.5, tool: TOOL.PICKAXE, transparent: true, render: RENDER.GLASS,
}));
reg(def(BLOCK.OBSIDIAN, 'Obsidian', {
  tiles: [15, 15, 15], hardness: 9, tool: TOOL.PICKAXE, toolLevel: 4,
}));

// ---- Fluids --------------------------------------------------------
reg(def(BLOCK.WATER, 'Water', {
  tiles: [16, 16, 16], solid: false, transparent: true, render: RENDER.WATER,
  hardness: -1, drops: null,
}));
reg(def(BLOCK.LAVA, 'Lava', {
  tiles: [17, 17, 17], solid: false, transparent: true, render: RENDER.WATER,
  hardness: -1, drops: null, light: 15,
}));

// ---- Ores -----------------------------------------------------------------
reg(def(BLOCK.COAL_ORE, 'Coal Ore', {
  tiles: [18, 18, 18], hardness: 3, tool: TOOL.PICKAXE, toolLevel: 1, drops: BLOCK.COAL,
}));
reg(def(BLOCK.IRON_ORE, 'Iron Ore', {
  tiles: [19, 19, 19], hardness: 3, tool: TOOL.PICKAXE, toolLevel: 2,
}));
reg(def(BLOCK.GOLD_ORE, 'Gold Ore', {
  tiles: [20, 20, 20], hardness: 3, tool: TOOL.PICKAXE, toolLevel: 3,
}));
reg(def(BLOCK.DIAMOND_ORE, 'Diamond Ore', {
  tiles: [21, 21, 21], hardness: 3, tool: TOOL.PICKAXE, toolLevel: 3, drops: BLOCK.DIAMOND,
}));
reg(def(BLOCK.REDSTONE_ORE, 'Redstone Ore', {
  tiles: [22, 22, 22], hardness: 3, tool: TOOL.PICKAXE, toolLevel: 3,
  drops: BLOCK.REDSTONE, dropCount: 4,
}));

// ---- Wood -----------------------------------------------------------------
reg(def(BLOCK.LOG, 'Oak Log', {
  tiles: [24, 23, 24], hardness: 2, tool: TOOL.AXE, flammable: true,
}));
reg(def(BLOCK.LEAVES, 'Oak Leaves', {
  tiles: [25, 25, 25], hardness: 0.2, render: RENDER.LEAVES, transparent: false,
  flammable: true, drops: null,
}));
reg(def(BLOCK.BIRCH_LOG, 'Birch Log', {
  tiles: [27, 26, 27], hardness: 2, tool: TOOL.AXE, flammable: true,
}));
reg(def(BLOCK.BIRCH_LEAVES, 'Birch Leaves', {
  tiles: [28, 28, 28], hardness: 0.2, render: RENDER.LEAVES, transparent: false,
  flammable: true, drops: null,
}));
reg(def(BLOCK.SPRUCE_LOG, 'Spruce Log', {
  tiles: [30, 29, 30], hardness: 2, tool: TOOL.AXE, flammable: true,
}));
reg(def(BLOCK.SPRUCE_LEAVES, 'Spruce Leaves', {
  tiles: [31, 31, 31], hardness: 0.2, render: RENDER.LEAVES, transparent: false,
  flammable: true, drops: null,
}));
reg(def(BLOCK.PLANKS, 'Wooden Planks', {
  tiles: [32, 32, 32], hardness: 2, tool: TOOL.AXE, flammable: true,
}));
reg(def(BLOCK.SAPLING, 'Sapling', {
  tiles: [33, 33, 33], solid: false, transparent: true, render: RENDER.CROSS,
  hardness: 0, flammable: true,
}));
reg(def(BLOCK.BOOKSHELF, 'Bookshelf', {
  tiles: [32, 34, 32], hardness: 1.5, tool: TOOL.AXE, flammable: true,
}));

// ---- Plants -------------------------------------------------------------
reg(def(BLOCK.FLOWER_RED, 'Poppy', {
  tiles: [35, 35, 35], solid: false, transparent: true, render: RENDER.CROSS, hardness: 0,
}));
reg(def(BLOCK.FLOWER_YELLOW, 'Yellow Flower', {
  tiles: [36, 36, 36], solid: false, transparent: true, render: RENDER.CROSS, hardness: 0,
}));
reg(def(BLOCK.TALL_GRASS, 'Grass', {
  tiles: [37, 37, 37], solid: false, transparent: true, render: RENDER.CROSS,
  hardness: 0, drops: BLOCK.SEEDS,
}));
reg(def(BLOCK.MUSHROOM_RED, 'Red Mushroom', {
  tiles: [38, 38, 38], solid: false, transparent: true, render: RENDER.CROSS, hardness: 0,
}));
reg(def(BLOCK.WHEAT, 'Wheat', {
  tiles: [93, 93, 93], solid: false, transparent: true, render: RENDER.CROP,
  hardness: 0, drops: BLOCK.WHEAT_ITEM,
  cropTiles: [93, 94, 95, 96],
}));
reg(def(BLOCK.CACTUS, 'Cactus', {
  tiles: [41, 40, 41], hardness: 0.4, transparent: true,
}));
reg(def(BLOCK.SUGAR_CANE, 'Sugar Cane', {
  tiles: [42, 42, 42], solid: false, transparent: true, render: RENDER.CROSS, hardness: 0,
}));

// ---- Building blocks -----------------------------------------------------------
reg(def(BLOCK.GLASS, 'Glass', {
  tiles: [43, 43, 43], hardness: 0.3, transparent: true, render: RENDER.GLASS, drops: null,
}));
reg(def(BLOCK.WOOL, 'Wool', {
  tiles: [44, 44, 44], hardness: 0.8,
}));
reg(def(BLOCK.BRICKS, 'Bricks', {
  tiles: [45, 45, 45], hardness: 2, tool: TOOL.PICKAXE, toolLevel: 1,
}));
reg(def(BLOCK.STONE_BRICKS, 'Stone Bricks', {
  tiles: [46, 46, 46], hardness: 2, tool: TOOL.PICKAXE, toolLevel: 1,
}));
reg(def(BLOCK.MOSSY_COBBLE, 'Mossy Cobblestone', {
  tiles: [47, 47, 47], hardness: 2, tool: TOOL.PICKAXE, toolLevel: 1,
}));
reg(def(BLOCK.FARMLAND, 'Farmland', {
  tiles: [48, 49, 3], hardness: 0.6, tool: TOOL.SHOVEL, drops: BLOCK.DIRT,
}));
reg(def(BLOCK.LADDER, 'Ladder', {
  tiles: [50, 50, 50], solid: false, transparent: true, render: RENDER.LADDER,
  hardness: 0.4, tool: TOOL.AXE, climbable: true,
}));

// ---- Functional blocks -----------------------------------------------------
reg(def(BLOCK.TORCH, 'Torch', {
  tiles: [51, 51, 51], solid: false, transparent: true, render: RENDER.TORCH,
  hardness: 0, light: 14, equipmentSlot: 'offhand',
}));
reg(def(BLOCK.CRAFTING_TABLE, 'Crafting Table', {
  tiles: [32, 52, 32], hardness: 2.5, tool: TOOL.AXE, flammable: true,
}));
reg(def(BLOCK.FURNACE, 'Furnace', {
  tiles: [53, 54, 53], hardness: 3.5, tool: TOOL.PICKAXE, toolLevel: 1,
}));
reg(def(BLOCK.CHEST, 'Chest', {
  tiles: [55, 56, 55], hardness: 2.5, tool: TOOL.AXE, flammable: true,
}));

// ---- Items ----------------------------------------------------------------
function item(id, name, opts = {}) {
  return reg({
    id, name,
    render: 'item', solid: false, transparent: true,
    hardness: 0, tool: TOOL.NONE, toolLevel: 0, toolSpeed: 1,
    drops: null, dropCount: 1, maxStack: 64, food: 0, damage: 0, durability: 0,
    ...opts,
  });
}

item(BLOCK.STICK, 'Stick', { tiles: [57] });
item(BLOCK.COAL, 'Coal', { tiles: [58] });
item(BLOCK.CHARCOAL, 'Charcoal', { tiles: [101] });
item(BLOCK.IRON_INGOT, 'Iron Ingot', { tiles: [59] });
item(BLOCK.GOLD_INGOT, 'Gold Ingot', { tiles: [60] });
item(BLOCK.DIAMOND, 'Diamond', { tiles: [61] });
item(BLOCK.REDSTONE, 'Redstone', { tiles: [62] });
item(BLOCK.SEEDS, 'Seeds', { tiles: [63] });
item(BLOCK.WHEAT_ITEM, 'Wheat', { tiles: [64] });
item(BLOCK.LEATHER, 'Leather', { tiles: [65] });
item(BLOCK.FEATHER, 'Feather', { tiles: [66] });
item(BLOCK.BONE, 'Bone', { tiles: [67] });
item(BLOCK.BONE_MEAL, 'Bone Meal', { tiles: [68] });

item(BLOCK.APPLE, 'Apple', { tiles: [69], food: 4 });
item(BLOCK.BREAD, 'Bread', { tiles: [70], food: 5 });
item(BLOCK.PORKCHOP, 'Raw Porkchop', { tiles: [71], food: 3 });
item(BLOCK.COOKED_PORKCHOP, 'Cooked Porkchop', { tiles: [72], food: 8 });
item(BLOCK.BEEF, 'Raw Beef', { tiles: [73], food: 3 });
item(BLOCK.COOKED_BEEF, 'Steak', { tiles: [74], food: 8 });
item(BLOCK.CHICKEN, 'Raw Chicken', { tiles: [75], food: 2 });
item(BLOCK.COOKED_CHICKEN, 'Cooked Chicken', { tiles: [76], food: 6 });

function tool(id, name, toolType, level, speed, damage, durability, tile) {
  return item(id, name, {
    tiles: [tile], tool: toolType, toolLevel: level, toolSpeed: speed,
    damage, durability, maxStack: 1,
  });
}

tool(BLOCK.WOOD_PICKAXE, 'Wooden Pickaxe', TOOL.PICKAXE, 1, 2, 2, 60, 77);
tool(BLOCK.STONE_PICKAXE, 'Stone Pickaxe', TOOL.PICKAXE, 2, 4, 3, 132, 78);
tool(BLOCK.IRON_PICKAXE, 'Iron Pickaxe', TOOL.PICKAXE, 3, 6, 4, 251, 79);
tool(BLOCK.DIAMOND_PICKAXE, 'Diamond Pickaxe', TOOL.PICKAXE, 4, 8, 5, 1562, 80);
tool(BLOCK.WOOD_AXE, 'Wooden Axe', TOOL.AXE, 1, 2, 3, 60, 81);
tool(BLOCK.STONE_AXE, 'Stone Axe', TOOL.AXE, 2, 4, 4, 132, 82);
tool(BLOCK.IRON_AXE, 'Iron Axe', TOOL.AXE, 3, 6, 5, 251, 83);
tool(BLOCK.DIAMOND_AXE, 'Diamond Axe', TOOL.AXE, 4, 8, 6, 1562, 84);
tool(BLOCK.WOOD_SHOVEL, 'Wooden Shovel', TOOL.SHOVEL, 1, 2, 1, 60, 85);
tool(BLOCK.STONE_SHOVEL, 'Stone Shovel', TOOL.SHOVEL, 2, 4, 1, 132, 86);
tool(BLOCK.IRON_SHOVEL, 'Iron Shovel', TOOL.SHOVEL, 3, 6, 1, 251, 87);
tool(BLOCK.DIAMOND_SHOVEL, 'Diamond Shovel', TOOL.SHOVEL, 4, 8, 1, 1562, 88);
tool(BLOCK.WOOD_SWORD, 'Wooden Sword', TOOL.SWORD, 1, 1.5, 4, 60, 89);
tool(BLOCK.STONE_SWORD, 'Stone Sword', TOOL.SWORD, 2, 1.5, 5, 132, 90);
tool(BLOCK.IRON_SWORD, 'Iron Sword', TOOL.SWORD, 3, 1.5, 6, 251, 91);
tool(BLOCK.DIAMOND_SWORD, 'Diamond Sword', TOOL.SWORD, 4, 1.5, 7, 1562, 92);
tool(BLOCK.WOOD_HOE, 'Wooden Hoe', TOOL.HOE, 1, 1, 1, 60, 97);
tool(BLOCK.STONE_HOE, 'Stone Hoe', TOOL.HOE, 2, 1, 1, 132, 98);
tool(BLOCK.IRON_HOE, 'Iron Hoe', TOOL.HOE, 3, 1, 1, 251, 99);
tool(BLOCK.DIAMOND_HOE, 'Diamond Hoe', TOOL.HOE, 4, 1, 1, 1562, 100);

// Wheat growth stages (0..3)
export const CROP_STAGES = 3;

/** Is this a placeable block rather than an item-only entry? */
export function isPlaceable(id) {
  return id < 200;
}

/** Does the block collide with entities? */
export function isSolid(id) {
  const b = BLOCKS[id];
  return b ? b.solid : false;
}

/** Is the block transparent (for face culling / lighting)? */
export function isTransparent(id) {
  const b = BLOCKS[id];
  return b ? b.transparent : true;
}

/** Does the block obstruct light (opaque)? */
export function isOpaque(id) {
  const b = BLOCKS[id];
  return b ? !b.transparent && b.solid : false;
}

/** How quickly does the player mine this block (progress per second)? */
export function breakSpeed(id, heldTool) {
  const b = BLOCKS[id];
  if (!b || b.hardness < 0) return 0;
  if (b.hardness === 0) return 1000;
  let speed = 1;
  const toolDef = heldTool != null ? BLOCKS[heldTool] : null;
  if (toolDef && toolDef.tool === b.tool && b.tool !== TOOL.NONE) {
    speed = toolDef.toolSpeed;
    // Is the correct tool tier required?
    if (b.toolLevel > 0 && toolDef.toolLevel < b.toolLevel) {
      speed = 1; // Mining is possible, but slow and without a drop
    }
  }
  return speed / b.hardness;
}

/** Determine the dropped item ID and count (including the tool-tier check). */
export function getDrop(id, heldTool) {
  const b = BLOCKS[id];
  if (!b) return null;
  if (b.hardness < 0) return null; // Bedrock, water, etc.
  const toolDef = heldTool != null ? BLOCKS[heldTool] : null;
  // Ores require the appropriate pickaxe tier
  if (b.tool === TOOL.PICKAXE && b.toolLevel > 0) {
    const lvl = toolDef && toolDef.tool === TOOL.PICKAXE ? toolDef.toolLevel : 0;
    if (lvl < b.toolLevel) return null; // No drop without the correct tool
  }
  const dropId = b.drops != null ? b.drops : id;
  if (dropId === BLOCK.AIR) return null;
  return { id: dropId, count: b.dropCount || 1 };
}

/** English item and block names. */
export function getName(id) {
  return BLOCKS[id] ? BLOCKS[id].name : `Unknown (${id})`;
}
