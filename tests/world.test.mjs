// Quick test of the world modules (without a browser).
import { PerlinNoise, mulberry32, hashSeed, coordHash } from '../src/world/noise.js';
import { BLOCKS, BLOCK, breakSpeed, getDrop, TOOL, isSolid } from '../src/world/blocks.js';
import { generateAtlasData, ATLAS_SIZE, TILE_SIZE, ATLAS_COLS } from '../src/world/textures.js';
import { World } from '../src/world/world.js';
import { CHUNK_SIZE, CHUNK_HEIGHT, blockIndex, Chunk, buildChunkGeometry } from '../src/world/chunk.js';
import { BIOME_NAMES } from '../src/world/worldgen.js';

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', msg); }
}

// Noise
const n = new PerlinNoise(42);
const v = n.noise2D(1.5, 2.5);
ok(Number.isFinite(v) && v >= -1.2 && v <= 1.2, `noise2D range: ${v}`);
const v3 = n.noise3D(1.5, 2.5, 3.5);
ok(Number.isFinite(v3), 'noise3D finite');
ok(Math.abs(n.fbm2D(0.1, 0.2, 4)) <= 1.2, 'fbm2D range');
ok(mulberry32(5)() !== mulberry32(6)(), 'RNG is seed-sensitive');
ok(hashSeed('abc') === hashSeed('abc'), 'hashSeed is stable');
ok(coordHash(1, 2, 3, 9) === coordHash(1, 2, 3, 9), 'coordHash is stable');

// Blocks
ok(BLOCKS[BLOCK.STONE].name === 'Stone', 'Block name');
ok(isSolid(BLOCK.STONE) === true, 'Stone is solid');
ok(isSolid(BLOCK.WATER) === false, 'Water is not solid');
ok(breakSpeed(BLOCK.STONE, null) > 0, 'breakSpeed for stone');
ok(breakSpeed(BLOCK.STONE, BLOCK.DIAMOND_PICKAXE) > breakSpeed(BLOCK.STONE, BLOCK.WOOD_PICKAXE), 'Diamond is faster than wood');
ok(breakSpeed(BLOCK.STONE, BLOCK.WOOD_SWORD) <= breakSpeed(BLOCK.STONE, null) * 1.01, 'Sword is not faster');
ok(breakSpeed(BLOCK.BEDROCK, BLOCK.DIAMOND_PICKAXE) === 0, 'Bedrock is unbreakable');
const drop = getDrop(BLOCK.STONE, BLOCK.WOOD_PICKAXE);
ok(drop && drop.id === BLOCK.COBBLESTONE, 'Stone drops cobblestone');
ok(getDrop(BLOCK.DIAMOND_ORE, null) === null, 'Diamond ore without a pickaxe has no drop');
ok(getDrop(BLOCK.DIAMOND_ORE, BLOCK.IRON_PICKAXE) !== null, 'Diamond ore with an iron pickaxe has a drop');
ok(getDrop(BLOCK.DIAMOND_ORE, BLOCK.WOOD_PICKAXE) === null, 'Diamond ore with a wooden pickaxe has no drop');
ok(getDrop(BLOCK.GRASS, BLOCK.DIAMOND_PICKAXE)?.id === BLOCK.DIRT, 'Grass drops dirt');

// Every block has valid tiles
for (const b of Object.values(BLOCKS)) {
  if (b.render === 'item') {
    ok(Array.isArray(b.tiles) && b.tiles.length === 1 && b.tiles[0] >= 0, `Item-Tiles ${b.name}`);
  } else if (b.id !== BLOCK.AIR) {
    ok(Array.isArray(b.tiles) && b.tiles.length === 3 && b.tiles.every((t) => t >= 0 && t < 256), `Block-Tiles ${b.name}`);
  }
}

// Atlas
const atlas = generateAtlasData(1337);
ok(atlas.size === ATLAS_SIZE, 'Atlas size');
ok(atlas.pixels.length === ATLAS_SIZE * ATLAS_SIZE * 4, 'Atlas-Pixel');
ok(atlas.pixels.some((x) => x > 0), 'Atlas has content');
const repeatedAtlas = generateAtlasData(1337);
const alternateAtlas = generateAtlasData(1338);
ok(atlas.pixels.every((value, index) => value === repeatedAtlas.pixels[index]),
  'Pixel-art atlas remains reproducible for the same seed');
ok(atlas.pixels.some((value, index) => value !== alternateAtlas.pixels[index]),
  'Texture details vary deterministically with the atlas seed');
const atlasPixel = (tile, x, y) => {
  const ax = (tile % ATLAS_COLS) * TILE_SIZE + x;
  const ay = Math.floor(tile / ATLAS_COLS) * TILE_SIZE + y;
  return (ay * ATLAS_SIZE + ax) * 4;
};
const sameTilePixels = (a, b) => {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const ai = atlasPixel(a, x, y);
      const bi = atlasPixel(b, x, y);
      for (let channel = 0; channel < 4; channel++) {
        if (atlas.pixels[ai + channel] !== atlas.pixels[bi + channel]) return false;
      }
    }
  }
  return true;
};
ok(!sameTilePixels(4, 47), 'Mossy cobblestone pattern is visibly distinct from regular cobblestone');
ok(atlas.pixels[atlasPixel(35, 0, 0) + 3] === 0, 'Flower texture has a transparent background');
ok(atlas.pixels[atlasPixel(35, 7, 10) + 3] === 255, 'Flower stem is visible/opaque');
ok(atlas.pixels[atlasPixel(37, 0, 0) + 3] === 0, 'Grass texture has a transparent background');
ok(atlas.pixels[atlasPixel(25, 0, 0) + 3] === 255, 'Leaf texture fills the entire tile');
ok(atlas.pixels[atlasPixel(43, 2, 2) + 3] === 0, 'Glass texture has a transparent background');
ok(atlas.pixels[atlasPixel(43, 0, 8) + 3] === 255, 'Glass frame remains visible');
const opaqueBlockTiles = new Set(Object.values(BLOCKS)
  .filter((b) => b.id !== BLOCK.AIR && !b.transparent && b.render !== 'item' && b.tiles)
  .flatMap((b) => b.tiles));
ok([...opaqueBlockTiles].every((tile) => {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      if (atlas.pixels[atlasPixel(tile, x, y) + 3] !== 255) return false;
    }
  }
  return true;
}), 'All opaque block side textures are fully opaque');
const hasColoredPixel = (tile) => {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const i = atlasPixel(tile, x, y);
      if (atlas.pixels[i + 3] > 0 && atlas.pixels[i] + atlas.pixels[i + 1] + atlas.pixels[i + 2] > 0) return true;
    }
  }
  return false;
};
ok(hasColoredPixel(35) && hasColoredPixel(36) && hasColoredPixel(37),
  'Flower and grass textures contain visible colors');
ok(BLOCKS[BLOCK.LEAVES].transparent === false, 'Leaves block vision (no black sky through holes)');

// World
const world = new World(12345, 'normal', {});
world.generateChunk(0, 0);
const chunk = world.getChunk(0, 0);
ok(chunk && chunk.generated, 'Chunk generated');
ok(chunk.blocks.some((b) => b !== 0), 'Chunk contains blocks');

// Bedrock at y=0
ok(chunk.blocks[blockIndex(0, 0, 0)] === BLOCK.BEDROCK, 'Bedrock at the bottom');

// Plausible height: air or water above, mostly stone/dirt below
let solidFound = 0;
for (let y = 1; y < CHUNK_HEIGHT; y++) {
  const b = chunk.blocks[blockIndex(8, y, 8)];
  if (b === BLOCK.STONE || b === BLOCK.DIRT || b === BLOCK.GRASS || b === BLOCK.SAND) solidFound++;
}
ok(solidFound > 3, `Terrain fill (${solidFound})`);

// Lighting calculated
ok(chunk.skyLight[blockIndex(8, CHUNK_HEIGHT - 1, 8)] === 15, 'Skylight at the top');
ok(chunk.skyLight[blockIndex(0, 0, 0)] === 0, 'No light in bedrock');

// setBlock / modified
world.setBlock(5, 40, 5, BLOCK.TORCH);
ok(world.getBlock(5, 40, 5) === BLOCK.TORCH, 'setBlock/getBlock');
ok(world.modified.has('5,40,5'), 'Change saved');
ok(world.modifiedByChunk.get('0,0')?.size === 1,
  'Player changes are assigned to a chunk index');
ok(world.getBlockLight(5, 40, 5) === 14, `Torch light (${world.getBlockLight(5, 40, 5)})`);
world.recomputeLight(chunk);
const reusedLightQueue = world._lightQueue;
world.recomputeLight(chunk);
ok(world._lightQueue === reusedLightQueue,
  'Repeated lighting BFS passes reuse the same preallocated work buffer');

const negativeModifiedWorld = new World(777, 'normal', {});
negativeModifiedWorld.modified.set('-1,40,-17', { id: BLOCK.GLASS, meta: 0 });
negativeModifiedWorld.generateChunk(-1, -2);
ok(negativeModifiedWorld.getBlock(-1, 40, -17) === BLOCK.GLASS,
  'Chunk index correctly replays changes at negative world coordinates');

const priorityWorld = new World(991, 'flat', {});
priorityWorld.update(8, 8, 3, 0, 2);
const priorityChunks = [...priorityWorld.chunks.values()].filter((candidate) => candidate.generated);
const priorityHasCenter = priorityWorld.getChunk(0, 0)?.generated;
const nearestChunk = priorityChunks.find((candidate) => candidate.cx !== 0 || candidate.cz !== 0);
ok(priorityChunks.length === 2 && priorityHasCenter && nearestChunk
  && nearestChunk.cx * nearestChunk.cx + nearestChunk.cz * nearestChunk.cz === 1,
  'Chunk streaming generates a directly adjacent chunk immediately after the player chunk');

// Raycast
const ray = world.raycast({ x: 8.5, y: 60, z: 8.5 }, { x: 0, y: -1, z: 0 }, 40);
ok(ray !== null, 'Raycast hits the ground');
ok(ray && ray.ny === 1, `Raycast normal points upward (${ray && ray.ny})`);
ok(ray && ray.distance > 0 && ray.distance < 40, `Raycast Distanz (${ray && ray.distance})`);

// Generate a wide world (find different biomes)
const biomesFound = new Set();
for (let i = 0; i < 40; i++) {
  const x = i * 37 - 200;
  const z = (i * 53) % 300 - 150;
  const b = world.gen.biomeAt(x, z);
  biomesFound.add(b);
}
ok(biomesFound.size >= 3, `Multiple biomes found: ${[...biomesFound].map((b) => BIOME_NAMES[b]).join(', ')}`);
const biomeCacheParity = [[-183, 117], [-37, -91], [0, 0], [46, 210], [301, -17]]
  .every(([x, z]) => world.gen.biomeAt(x, z)
    === world.gen.biomeAtHeight(x, z, world.gen.heightAt(x, z)));
ok(biomeCacheParity, 'Precomputed column height returns the same biomes as the public query');

// Flat world
const flat = new World(999, 'flat', {});
flat.generateChunk(0, 0);
const fc = flat.getChunk(0, 0);
ok(fc.blocks[blockIndex(8, 32, 8)] === BLOCK.GRASS, 'Flat: grass at y=32');
ok(fc.blocks[blockIndex(8, 33, 8)] === BLOCK.AIR, 'Flat: air above');

// Consistent chunk boundaries
world.generateChunk(1, 0);
ok(world.getBlock(15, 10, 8) !== undefined, 'Block at chunk boundary');
ok(world.getBlock(16, 10, 8) !== undefined, 'Block in neighboring chunk');

// Mesh build (uses three.js in Node)
const built = world.update(8, 8, 1, 200);
ok(built > 0, `Meshes built (${built})`);
const mesh = world.getChunk(0, 0).meshSolid;
ok(mesh !== null || world.getChunk(0, 0).meshTransparent !== null, 'Mesh exists');
if (mesh) {
  ok(mesh.geometry.attributes.position.count > 0, 'Mesh has vertices');
  ok(mesh.geometry.attributes.color.count === mesh.geometry.attributes.position.count, 'Color attributes match');
  ok(mesh.geometry.index.count % 3 === 0, 'Indices are divisible by 3');
}

// Block exteriors, dense leaves, and plants without z-fighting
const probeChunk = new Chunk(0, 0);
const probeWorld = { getBlock: () => BLOCK.AIR, getSkyLight: () => 15, getBlockLight: () => 0 };
probeChunk.set(8, 30, 8, BLOCK.STONE);
let probeGeometry = buildChunkGeometry(probeWorld, probeChunk);
ok(probeGeometry.solid?.attributes.position.count === 24, 'A single block renders all six exterior faces');
const positions = probeGeometry.solid.attributes.position.array;
const normals = probeGeometry.solid.attributes.normal.array;
const indices = probeGeometry.solid.index.array;
let facesWindOutward = true;
for (let i = 0; i < indices.length; i += 3) {
  const ia = indices[i], ib = indices[i + 1], ic = indices[i + 2];
  const ax = positions[ia * 3], ay = positions[ia * 3 + 1], az = positions[ia * 3 + 2];
  const abx = positions[ib * 3] - ax, aby = positions[ib * 3 + 1] - ay, abz = positions[ib * 3 + 2] - az;
  const acx = positions[ic * 3] - ax, acy = positions[ic * 3 + 1] - ay, acz = positions[ic * 3 + 2] - az;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const dot = nx * normals[ia * 3] + ny * normals[ia * 3 + 1] + nz * normals[ia * 3 + 2];
  if (dot <= 0) facesWindOutward = false;
}
ok(facesWindOutward, 'All block faces wind outward and are visible from outside');
probeChunk.set(8, 30, 8, BLOCK.LEAVES);
probeGeometry = buildChunkGeometry(probeWorld, probeChunk);
ok(probeGeometry.solid?.attributes.position.count === 24 && probeGeometry.transparent === null,
  'Leaves are closed and render in the opaque pass');
probeChunk.set(8, 30, 8, BLOCK.FLOWER_RED);
probeGeometry = buildChunkGeometry(probeWorld, probeChunk);
ok(probeGeometry.transparent?.attributes.position.count === 8,
  'Cross plant has exactly two faces without duplicate z-fighting quads');
const darkPlantChunk = new Chunk(0, 0);
darkPlantChunk.set(8, 30, 8, BLOCK.FLOWER_RED);
const darkPlantGeometry = buildChunkGeometry({
  getBlock: () => BLOCK.AIR, getSkyLight: () => 0, getBlockLight: () => 0,
}, darkPlantChunk).transparent;
ok(Math.min(...darkPlantGeometry.attributes.color.array) >= 0.45 - 1e-6,
  'Cross plants retain minimum brightness instead of turning black');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
