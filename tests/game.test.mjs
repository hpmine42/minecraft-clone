// game.test.mjs — Tests for inventory, crafting, player physics, and saving.
import { Inventory, matchRecipe, makeStack, listRecipes, HOTBAR_SIZE, canEquipItem, EQUIPMENT_SLOTS } from '../src/player/inventory.js';
import { BLOCKS, BLOCK, TOOL, breakSpeed, getDrop } from '../src/world/blocks.js';
import { Player, PHYS, PLAYER_HEIGHT } from '../src/player/player.js';
import { World } from '../src/world/world.js';
import { CHUNK_SIZE, blockIndex } from '../src/world/chunk.js';
import { Interaction } from '../src/player/interaction.js';
import { BlockOutline } from '../src/ui/block-outline.js';

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) passed++;
  else { failed++; console.error('FAIL:', msg); }
}

// ---- Inventory --------------------------------------------------------------
const inv = new Inventory();
ok(inv.slots.length === 36, 'Inventory has 36 slots');
ok(inv.add(BLOCK.DIRT, 10) === 0, '10 dirt added');
ok(inv.count(BLOCK.DIRT) === 10, 'Dirt counted');
ok(inv.add(BLOCK.DIRT, 70) === 0, '70 dirt: 54 in the first stack + 16 in a new slot');
ok(inv.count(BLOCK.DIRT) === 80, '80 dirt total');
ok(inv.consume(BLOCK.DIRT, 16) === true, '16 dirt consumed');
ok(inv.count(BLOCK.DIRT) === 64, '64 dirt remaining');
ok(inv.consume(BLOCK.DIRT, 100) === false, 'Consuming too much fails');

// Tools do not stack
const inv2 = new Inventory();
inv2.add(BLOCK.WOOD_PICKAXE, 1);
inv2.add(BLOCK.WOOD_PICKAXE, 1);
ok(inv2.count(BLOCK.WOOD_PICKAXE) === 2, 'Two pickaxes in the inventory');
ok(inv2.slots[0].id === BLOCK.WOOD_PICKAXE && inv2.slots[1].id === BLOCK.WOOD_PICKAXE, 'In separate slots');
ok(inv2.slots[0].dur === 60, 'Full durability');
const oldBoneStackLimit = BLOCKS[BLOCK.BONE].maxStack;
BLOCKS[BLOCK.BONE].maxStack = 16;
const stackLimitInventory = new Inventory(3);
const stackLimitRemainder = stackLimitInventory.add(BLOCK.BONE, 20);
ok(stackLimitRemainder === 0 && stackLimitInventory.getSlot(0)?.count === 16
  && stackLimitInventory.getSlot(1)?.count === 4,
'Configurable stacks of 16 are distributed without overflow or item loss');
const rejectedOversizedSlot = new Inventory(1);
ok(!rejectedOversizedSlot.setSlot(0, { id: BLOCK.BONE, count: 17 })
  && rejectedOversizedSlot.getSlot(0) === null,
'A single slot rejects stacks above its limit without truncation');
BLOCKS[BLOCK.BONE].maxStack = oldBoneStackLimit;

// Durability
inv2.selected = 0;
const broken = inv2.damageHeld(60);
ok(broken === null && inv2.slots[0] === null, 'Tool breaks at zero durability');

// Swap slots
const inv3 = new Inventory();
inv3.setSlot(5, makeStack(BLOCK.STONE, 10));
inv3.setSlot(6, makeStack(BLOCK.SAND, 5));
inv3.swapSlots(5, 6);
ok(inv3.getSlot(5).id === BLOCK.SAND && inv3.getSlot(6).id === BLOCK.STONE, 'Slot swap');

// Merge stacks
inv3.setSlot(7, makeStack(BLOCK.STONE, 50));
inv3.swapSlots(6, 7);
ok(inv3.getSlot(7).count === 60, `Stacks merged (60)—actual: ${inv3.getSlot(7)?.count}`);
ok(inv3.getSlot(6) === null, 'Source slot empty after merging');

// ---- Crafting --------------------------------------------------------------
const grid = (ids) => ids.map((id) => (id ? makeStack(id, 1) : null));
// 1 log → 4 planks (shapeless)
ok(matchRecipe(grid([BLOCK.LOG, null, null, null, null, null, null, null, null]))?.id === BLOCK.PLANKS, 'Log → planks');
// 2 vertically stacked planks → 4 sticks
ok(matchRecipe(grid([BLOCK.PLANKS, null, null, BLOCK.PLANKS, null, null, null, null, null]))?.count === 4, 'Planks → sticks');
// 2×2 planks → crafting table
ok(matchRecipe(grid([BLOCK.PLANKS, BLOCK.PLANKS, null, BLOCK.PLANKS, BLOCK.PLANKS, null, null, null, null]))?.id === BLOCK.CRAFTING_TABLE, 'Crafting table');
// Pickaxe
const pickGrid = grid([
  BLOCK.PLANKS, BLOCK.PLANKS, BLOCK.PLANKS,
  null, BLOCK.STICK, null,
  null, BLOCK.STICK, null,
]);
ok(matchRecipe(pickGrid)?.id === BLOCK.WOOD_PICKAXE, 'Wooden pickaxe');
// Iron sword
const swordGrid = grid([
  null, BLOCK.IRON_INGOT, null,
  null, BLOCK.IRON_INGOT, null,
  null, BLOCK.STICK, null,
]);
ok(matchRecipe(swordGrid)?.id === BLOCK.IRON_SWORD, 'Iron sword');
// Torches (coal above stick)
const torchGrid = grid([null, BLOCK.COAL, null, null, BLOCK.STICK, null, null, null, null]);
ok(matchRecipe(torchGrid)?.id === BLOCK.TORCH && matchRecipe(torchGrid)?.count === 4, 'Torches ×4');
const charcoalTorchGrid = grid([null, BLOCK.CHARCOAL, null, null, BLOCK.STICK, null, null, null, null]);
ok(matchRecipe(charcoalTorchGrid)?.id === BLOCK.TORCH && matchRecipe(charcoalTorchGrid)?.count === 4, 'Charcoal can craft torches');
// Bread
const breadGrid = grid([BLOCK.WHEAT_ITEM, BLOCK.WHEAT_ITEM, BLOCK.WHEAT_ITEM, null, null, null, null, null, null]);
ok(matchRecipe(breadGrid)?.id === BLOCK.BREAD, 'Bread from 3 wheat');
// Furnace
const furnaceGrid = grid([
  BLOCK.COBBLESTONE, BLOCK.COBBLESTONE, BLOCK.COBBLESTONE,
  BLOCK.COBBLESTONE, null, BLOCK.COBBLESTONE,
  BLOCK.COBBLESTONE, BLOCK.COBBLESTONE, BLOCK.COBBLESTONE,
]);
ok(matchRecipe(furnaceGrid)?.id === BLOCK.FURNACE, 'Furnace');
// Mirroring (axe)
const axeGrid = grid([
  BLOCK.PLANKS, BLOCK.PLANKS, null,
  BLOCK.PLANKS, BLOCK.STICK, null,
  null, BLOCK.STICK, null,
]);
ok(matchRecipe(axeGrid)?.id === BLOCK.WOOD_AXE, 'Axe (including mirrored)');
// No recipe
ok(matchRecipe(grid([BLOCK.STONE, null, null, null, null, null, null, null, null])) === null, 'No recipe for a single stone');
// Player crafting uses an actual 2×2 grid; crafting-table recipes remain 3×3.
const grid2 = (ids) => ids.map((id) => (id ? makeStack(id, 1) : null));
ok(matchRecipe(grid2([BLOCK.PLANKS, null, BLOCK.PLANKS, null]))?.id === BLOCK.STICK,
  '2×2 player crafting recognizes the vertical stick recipe');
ok(matchRecipe(grid2([BLOCK.PLANKS, BLOCK.PLANKS, BLOCK.PLANKS, BLOCK.PLANKS]))?.id === BLOCK.CRAFTING_TABLE,
  '2×2 player crafting recognizes the crafting table');
ok(matchRecipe(grid2([BLOCK.COBBLESTONE, BLOCK.COBBLESTONE, BLOCK.COBBLESTONE, null])) === null,
  'The 3×3 furnace recipe does not incorrectly fit the 2×2 player grid');
// Empty grid
ok(matchRecipe(grid([null, null, null, null, null, null, null, null, null])) === null, 'Empty grid');
// Complete recipe list
const recipes = listRecipes();
ok(recipes.length >= 30, `Recipe book has ${recipes.length} recipes (>= 30)`);

// ---- Player physics ---------------------------------------------------------
const world = new World(4242, 'flat', {});
// Flat world: grass at y=32
for (let i = 0; i < 3; i++) world.update(8, 8, 1, 100);

const player = new Player(world);
player.onGround = true;
player.inWater = true;
player.sneaking = true;
player.teleport(8.5, 38, 8.5);
ok(!player.onGround && !player.inWater && !player.sneaking,
  'Teleport resets stale ground, water, and sneak states');
const input = { forward: 0, right: 0, jump: false, sneak: false, sprint: false };

// Gravity: falls downward
for (let i = 0; i < 120; i++) player.update(1 / 60, input);
ok(player.onGround, `Player lands on the ground (y=${player.position.y.toFixed(2)})`);
ok(Math.abs(player.position.y - 33) < 0.1, `Height ≈ 33 (on grass at y=32): ${player.position.y.toFixed(2)}`);

// Jumping
input.jump = true;
player.update(1 / 60, input);
input.jump = false;
ok(player.velocity.y > 0 || player.position.y > 33.1, 'Jump lifts the player');
let maxY = player.position.y;
for (let i = 0; i < 120; i++) {
  player.update(1 / 60, input);
  maxY = Math.max(maxY, player.position.y);
}
ok(maxY > 33.8 && maxY < 35.5, `Plausible jump height: ${(maxY - 33).toFixed(2)} blocks`);

// Walking
input.forward = 1;
const startX = player.position.x;
for (let i = 0; i < 60; i++) player.update(1 / 60, input);
const moved = Math.hypot(player.position.x - startX, player.position.z - 8.5);
ok(moved > 2, `Walking forward moves (${moved.toFixed(2)} blocks in 1 s)`);

// Wall collision: stone pillar
const wallX = Math.floor(startX) + 3;
for (let y = 33; y <= 34; y++) {
  world.setBlock(wallX, y, 8, BLOCK.STONE);
}
player.teleport(wallX - 3 + 0.5, 33, 8.5);
input.forward = 1;
player.yaw = -Math.PI / 2; // Look direction +X
// lookDir at yaw=-PI/2: x = -sin(-PI/2)=1 → move toward +X with forward
for (let i = 0; i < 180; i++) player.update(1 / 60, input);
ok(player.position.x < wallX + 0.01, `Wall stops the player (x=${player.position.x.toFixed(2)} < ${wallX + 0.01})`);
input.forward = 0;

// Fall damage
player.teleport(8.5, 48, 8.5);
player.velocity = { x: 0, y: 0, z: 0 };
const hpBefore = player.health;
for (let i = 0; i < 300; i++) player.update(1 / 60, input);
ok(player.health < hpBefore || player.position.y <= 33.1, `Fall damage or landing (HP ${player.health}, y=${player.position.y.toFixed(2)})`);
ok(player.fallDistance === 0, 'Fall distance reset');

// Creative flight: ascending from the ground must work even with the sneak toggle active.
player.gamemode = 'creative';
player.flying = true;
player.teleport(8.5, 38, 8.5);
player.flying = true;
input.jump = false;
input.sneak = true;
for (let i = 0; i < 120; i++) player.update(1 / 60, input);
const flightLandingY = player.position.y;
ok(player.onGround && Math.abs(flightLandingY - 33) < 0.1, 'Creative-flight descent lands cleanly on the ground');
input.jump = true; // Touch sneak remains toggled until the next tap.
for (let i = 0; i < 20; i++) player.update(1 / 60, input);
ok(player.position.y > flightLandingY + 0.3, 'Jump can ascend after descent even while sneak is active');
player.gamemode = 'survival';
player.flying = false;
input.jump = false;
input.sneak = false;

// Swimming: pool of water
for (let x = 6; x <= 11; x++) {
  for (let z = 6; z <= 11; z++) {
    world.setBlock(x, 33, z, BLOCK.WATER);
    world.setBlock(x, 34, z, BLOCK.WATER);
    world.setBlock(x, 35, z, BLOCK.WATER);
  }
}
player.teleport(8.5, 35, 8.5);
player.velocity = { x: 0, y: 0, z: 0 };
player.update(1 / 60, input);
ok(player.inWater, 'Player is in water');
input.jump = true;
for (let i = 0; i < 60; i++) player.update(1 / 60, input);
ok(player.velocity.y > -4, `Swimming slows the fall (${player.velocity.y.toFixed(2)})`);
input.jump = false;

// Hunger system
player.gamemode = 'survival';
player.health = 20;
player.hunger = 20;
player.eat(5);
ok(player.hunger === 20, 'Eating beyond the maximum stays at 20');
player.hunger = 10;
player.eat(8);
ok(player.hunger === 18, 'Eating restores hunger');
player.health = 20;
player.invulnerableTime = 0;
player.takeDamage(3, 'test');
ok(player.health === 17, `Damage reduces health (${player.health})`);
player.invulnerableTime = 0;
player.takeDamage(3, 'test');
ok(player.health === 14, 'Further damage after invulnerability expires');

// Invulnerability
player.takeDamage(5, 'test');
ok(player.health === 14, 'Damage blocked during invulnerability');

// Death & respawn
player.health = 1;
player.invulnerableTime = 0;
player.takeDamage(10, 'test');
ok(player.dead, 'Player dies');
player.respawn({ x: 1, y: 40, z: 1 });
ok(!player.dead && player.health === 20, 'Respawn restores health');
player.gamemode = 'creative';
player.flying = true;
player.onGround = true;
player.respawn({ x: 2, y: 40, z: 2 });
ok(!player.flying && !player.onGround, 'Respawn disables flight and resets ground contact');

// Creative mode is invulnerable (except the void)
player.gamemode = 'creative';
player.health = 20;
ok(player.takeDamage(5, 'zombie') === false, 'Creative: no mob damage');

// ---- Serialization --------------------------------------------------------
const inv4 = new Inventory();
inv4.add(BLOCK.DIAMOND, 12);
inv4.add(BLOCK.IRON_PICKAXE, 1);
const json = JSON.parse(JSON.stringify(inv4.toJSON()));
const inv5 = new Inventory();
inv5.fromJSON(json);
ok(inv5.count(BLOCK.DIAMOND) === 12, 'Inventory serialization (items)');
ok(inv5.count(BLOCK.IRON_PICKAXE) === 1, 'Inventory serialization (tool)');
ok(EQUIPMENT_SLOTS.includes('offhand') && canEquipItem(makeStack(BLOCK.TORCH, 2), 'offhand')
  && !canEquipItem(makeStack(BLOCK.BREAD), 'offhand')
  && !canEquipItem(makeStack(BLOCK.IRON_PICKAXE), 'head'),
'Off-hand and armor accept only items allowed by an existing item definition');
ok(inv4.setEquipment('offhand', makeStack(BLOCK.TORCH, 3))
  && !inv4.setEquipment('head', makeStack(BLOCK.IRON_PICKAXE)),
'Off-hand is a usable persistent slot; armor slots remain definition-bound');
const equippedJSON = JSON.parse(JSON.stringify(inv4.toJSON()));
const equippedInventory = new Inventory();
equippedInventory.fromJSON(equippedJSON);
ok(equippedInventory.getEquipment('offhand')?.id === BLOCK.TORCH
  && equippedInventory.getEquipment('offhand')?.count === 3,
'Off-hand contents persist through save and load');

player.gamemode = 'survival';
player.yaw = 1.23;
const pjson = JSON.parse(JSON.stringify(player.toJSON()));
const player2 = new Player(world);
player2.fromJSON(pjson);
ok(Math.abs(player2.yaw - 1.23) < 0.001, 'Player serialization (yaw)');
ok(player2.gamemode === 'survival', 'Player serialization (mode)');
player2.fromJSON({ gamemode: 'survival', flying: true });
ok(!player2.flying, 'Older/invalid saves cannot enable flight in Survival');
player2.fromJSON({ gamemode: 'creative', flying: true });
ok(player2.flying, 'Creative flight persists when loading');

// ---- World: modified blocks ---------------------------------------------
const w2 = new World(777, 'normal', {});
w2.generateChunk(0, 0);
w2.setBlock(3, 50, 3, BLOCK.GLASS);
const modified = [...w2.modified.entries()];
ok(modified.length === 1, 'Modification saved');
const w3 = new World(777, 'normal', {});
for (const [pos, val] of w2.modified) {
  w3.modified.set(pos, val);
}
w3.generateChunk(0, 0);
ok(w3.getBlock(3, 50, 3) === BLOCK.GLASS, 'Modification restored after loading');

// Target outline: visible on the hit block, follows the next hit, and hides without a target.
const outlineScene = {
  children: [],
  add(object) { this.children.push(object); },
  remove(object) { this.children = this.children.filter((entry) => entry !== object); },
};
const outline = new BlockOutline(outlineScene);
ok(outlineScene.children.includes(outline.mesh) && !outline.mesh.visible
  && outline.mesh.isMesh && outline.material.color.getHex() === 0x050505,
  'A single black face outline is added to the scene initially hidden');
ok(outline.material.depthTest && !outline.material.depthWrite && outline.mesh.renderOrder === 10,
  'Block outline hides occluded edges through depth testing');
ok(Math.abs(outline.geometry.boundingBox.min.x + 0.5) < 1e-6
  && Math.abs(outline.geometry.boundingBox.max.x - 0.5) < 1e-6
  && outline.geometry.attributes.position.count === 96
  && outline.material.polygonOffset && outline.material.polygonOffsetFactor === -1,
  'All six sides are outlined exactly on the block face without floating');
outline.update({ x: 2, y: 5, z: -1 });
ok(outline.mesh.visible && outline.mesh.position.x === 2.5 && outline.mesh.position.y === 5.5 && outline.mesh.position.z === -0.5,
  'Block outline is centered around the targeted block');
outline.update({ x: 3, y: 4, z: -1 });
ok(outline.mesh.position.x === 3.5 && outline.mesh.position.y === 4.5,
  'Block outline moves directly to the next target when looking around');
outline.update(null);
ok(!outline.mesh.visible, 'Block outline hides without a block target');
outline.dispose();
ok(!outlineScene.children.includes(outline.mesh), 'Block outline releases scene objects on dispose');

// Held mining re-targets every frame: after the first block, the view can move
// downward and mine the next block without pressing again.
const firstMineHit = { x: 3, y: 3, z: 3, id: BLOCK.DIRT, distance: 1, nx: 0, ny: 0, nz: -1 };
const lowerMineHit = { x: 3, y: 2, z: 3, id: BLOCK.DIRT, distance: 1, nx: 0, ny: 1, nz: 0 };
const aliveMineTargets = new Set(['3,3,3', '3,2,3']);
const minedTargets = [];
const aim = { direction: { x: 0, y: 0, z: -1 } };
const miningWorld = {
  raycast(_origin, direction) {
    const hit = direction.y < -0.5 ? lowerMineHit : firstMineHit;
    return aliveMineTargets.has(`${hit.x},${hit.y},${hit.z}`) ? hit : null;
  },
  setBlock(x, y, z, id) {
    if (id === BLOCK.AIR) {
      aliveMineTargets.delete(`${x},${y},${z}`);
      minedTargets.push(`${x},${y},${z}`);
    }
  },
  getBlock: () => BLOCK.AIR,
};
const miningPlayer = {
  gamemode: 'creative',
  attackCooldown: 0,
  exhaustion: 0,
  eyePosition: () => ({ x: 3.5, y: 4.5, z: 3.5 }),
  lookDir: () => aim.direction,
};
const miningMobs = { raycastMob: () => null, items: [], scene: { add() {} } };
const miningParticleCalls = [];
const miningParticles = { blockBreak(...args) { miningParticleCalls.push(args); } };
const miningAudio = { dig() {} };
const miningInteraction = new Interaction(
  miningWorld, miningPlayer, { held: () => null }, miningMobs, miningParticles, miningAudio,
);
const savedRandom = Math.random;
Math.random = () => 0; // Even the rare intermediate particle path remains deterministic.
const firstMineResult = miningInteraction.update(0.001, { attack: true }, null);
Math.random = savedRandom;
ok(firstMineResult.blockHit?.y === 3 && minedTargets[0] === '3,3,3',
  'Creative mode mines a block in the first very short tick');
ok(miningMobs.items.length === 0,
  'Creative mining requires no tool and produces no block drops');
ok(miningParticleCalls.some((call) => call[4] === 1)
  && miningParticleCalls.some((call) => call[4] === 14),
  'Existing mining and debris particles remain alongside the cracks');
aim.direction = { x: 0, y: -1, z: 0 };
const nextMineResult = miningInteraction.update(0.5, { attack: true }, null);
ok(nextMineResult.blockHit?.y === 2 && minedTargets[1] === '3,2,3',
  'Looking downward mines the next block without releasing');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
