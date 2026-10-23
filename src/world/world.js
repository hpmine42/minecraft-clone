// world.js — Chunk management, lighting, raycasts, and block access.
import * as THREE from '../../lib/three.module.js';
import { BLOCKS, BLOCK, RENDER, isOpaque, isTransparent } from './blocks.js';
import { Chunk, CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_VOLUME, blockIndex, buildChunkGeometry } from './chunk.js';
import { WorldGen, SEA_LEVEL } from './worldgen.js';

const CHUNK_OFFSET_CACHE = new Map();

function chunkOffsets(radius) {
  if (CHUNK_OFFSET_CACHE.has(radius)) return CHUNK_OFFSET_CACHE.get(radius);
  const offsets = [];
  const maxDistanceSquared = (radius + 0.5) ** 2;
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared <= maxDistanceSquared) offsets.push({ dx, dz, distanceSquared });
    }
  }
  offsets.sort((a, b) => a.distanceSquared - b.distanceSquared || a.dz - b.dz || a.dx - b.dx);
  const ordered = offsets.map(({ dx, dz }) => [dx, dz]);
  CHUNK_OFFSET_CACHE.set(radius, ordered);
  return ordered;
}

export class World {
  /**
   * @param {number} seed
   * @param {string} worldType 'normal' | 'flat'
   * @param {object} materials { solid: THREE.Material, transparent: THREE.Material }
   */
  constructor(seed = 1337, worldType = 'normal', materials = null) {
    this.seed = seed >>> 0;
    this.worldType = worldType;
    this.gen = new WorldGen(this.seed, worldType);
    this.chunks = new Map();
    this.modified = new Map();     // "x,y,z" -> {id, meta} — player changes
    this.modifiedByChunk = new Map();
    this._modifiedIndexReady = false;
    // Container contents are stored separately under "x,y,z".
    this.furnaces = new Map();
    this.chests = new Map();
    this.materials = materials || {};
    this._lightQueue = new Int32Array(CHUNK_VOLUME * 4);
    this.meshQueue = [];
    this.chunksDirty = new Set();
  }

  static chunkKey(cx, cz) {
    return `${cx},${cz}`;
  }

  getChunk(cx, cz) {
    return this.chunks.get(World.chunkKey(cx, cz));
  }

  getOrCreateChunk(cx, cz) {
    const key = World.chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  /** Lazily create a chunk index for persisted block changes. */
  _ensureModifiedIndex() {
    if (this._modifiedIndexReady) return;
    this.modifiedByChunk.clear();
    for (const [pos, value] of this.modified) this._indexModifiedEntry(pos, value);
    this._modifiedIndexReady = true;
  }

  _indexModifiedEntry(pos, value) {
    const coords = typeof pos === 'string' ? pos.split(',').map(Number) : [];
    if (coords.length !== 3 || !coords.every(Number.isInteger)) return;
    const [x, y, z] = coords;
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const key = World.chunkKey(cx, cz);
    let bucket = this.modifiedByChunk.get(key);
    if (!bucket) {
      bucket = new Map();
      this.modifiedByChunk.set(key, bucket);
    }
    bucket.set(blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE), value);
  }

  /** Generate a chunk (terrain + apply player changes). */
  generateChunk(cx, cz) {
    const chunk = this.getOrCreateChunk(cx, cz);
    if (chunk.generated) return chunk;
    this.gen.generate(chunk, this);
    // Apply changes only in this chunk instead of scanning the entire world map.
    this._ensureModifiedIndex();
    const changes = this.modifiedByChunk.get(World.chunkKey(cx, cz));
    if (changes) {
      for (const [index, val] of changes) {
        chunk.blocks[index] = val.id;
        chunk.meta[index] = val.meta || 0;
      }
    }
    this.recomputeLight(chunk);
    chunk.dirty = true;
    return chunk;
  }

  /** Get a block (world coordinates). Does NOT automatically load/generate chunks. */
  getBlock(x, y, z) {
    if (y < 0 || y >= CHUNK_HEIGHT) return BLOCK.AIR;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk || !chunk.generated) return BLOCK.AIR;
    return chunk.blocks[blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
  }

  /** Get a block without side effects (for generation). */
  getBlockQuiet(x, y, z) {
    return this.getBlock(x, y, z);
  }

  getMeta(x, y, z) {
    if (y < 0 || y >= CHUNK_HEIGHT) return 0;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk || !chunk.generated) return 0;
    return chunk.meta[blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
  }

  getSkyLight(x, y, z) {
    if (y < 0) return 0;
    if (y >= CHUNK_HEIGHT) return 15;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk || !chunk.generated) return 15;
    return chunk.skyLight[blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
  }

  getBlockLight(x, y, z) {
    if (y < 0 || y >= CHUNK_HEIGHT) return 0;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk || !chunk.generated) return 0;
    return chunk.blockLight[blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
  }

  /** Set a block and manage chunk flags/changes. */
  setBlock(x, y, z, id, meta = 0, record = true) {
    if (y < 0 || y >= CHUNK_HEIGHT) return false;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.getOrCreateChunk(cx, cz);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    const idx = blockIndex(lx, y, lz);
    chunk.blocks[idx] = id;
    chunk.meta[idx] = meta;
    chunk.dirty = true;
    chunk.lightDirty = true;

    if (record) {
      const pos = `${x},${y},${z}`;
      const value = { id, meta };
      this.modified.set(pos, value);
      if (this._modifiedIndexReady) this._indexModifiedEntry(pos, value);
    }

    // Recalculate lighting immediately (BFS across the chunk is inexpensive)
    this.recomputeLight(chunk);

    // Mark neighboring chunks at boundaries
    const touch = [];
    if (lx === 0) touch.push([cx - 1, cz]);
    if (lx === CHUNK_SIZE - 1) touch.push([cx + 1, cz]);
    if (lz === 0) touch.push([cx, cz - 1]);
    if (lz === CHUNK_SIZE - 1) touch.push([cx, cz + 1]);
    for (const [ncx, ncz] of touch) {
      const n = this.getChunk(ncx, ncz);
      if (n) { n.dirty = true; n.lightDirty = true; }
    }
    return true;
  }

  /** Recalculate a chunk's lighting (skylight + block light, BFS). */
  recomputeLight(chunk) {
    const { blocks, skyLight, blockLight } = chunk;
    skyLight.fill(0);
    blockLight.fill(0);

    // Skylight: let it pass downward through transparent blocks
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        let light = 15;
        for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
          const id = blocks[blockIndex(x, y, z)];
          const def = BLOCKS[id];
          if (id !== BLOCK.AIR && def && !def.transparent) {
            light = 0;
          }
          skyLight[blockIndex(x, y, z)] = light;
          if (light === 0) break;
        }
      }
    }

    // BFS skylight propagation
    this._spreadLight(chunk, skyLight, 15, true);

    // Block light from light sources
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const id = blocks[blockIndex(x, y, z)];
          const def = BLOCKS[id];
          if (def && def.light > 0) {
            blockLight[blockIndex(x, y, z)] = def.light;
          }
        }
      }
    }
    this._spreadLight(chunk, blockLight, 0, false);
    chunk.lightDirty = false;
  }

  _spreadLight(chunk, lightArray, _initial, isSky) {
    // Flat, reusable queue instead of thousands of temporary neighbor arrays.
    let queue = this._lightQueue;
    let head = 0;
    let tail = 0;
    const enqueue = (x, y, z, level) => {
      if (tail + 4 > queue.length) {
        const grown = new Int32Array(queue.length * 2);
        grown.set(queue);
        queue = grown;
      }
      queue[tail++] = x;
      queue[tail++] = y;
      queue[tail++] = z;
      queue[tail++] = level;
    };
    const blocks = chunk.blocks;
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const level = lightArray[blockIndex(x, y, z)];
          if (level > 0) enqueue(x, y, z, level);
        }
      }
    }

    const visit = (x, y, z, level) => {
      if (y < 0 || y >= CHUNK_HEIGHT || x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) return;
      const index = blockIndex(x, y, z);
      const id = blocks[index];
      const def = BLOCKS[id];
      if (id !== BLOCK.AIR && def && !def.transparent) return;
      if (lightArray[index] < level) {
        lightArray[index] = level;
        enqueue(x, y, z, level);
      }
    };

    while (head < tail) {
      const x = queue[head++], y = queue[head++], z = queue[head++], level = queue[head++];
      if (level <= 1) continue;
      const spread = level - 1;
      visit(x + 1, y, z, spread);
      visit(x - 1, y, z, spread);
      visit(x, y + 1, z, spread);
      visit(x, y - 1, z, isSky ? level : spread);
      visit(x, y, z + 1, spread);
      visit(x, y, z - 1, spread);
    }
    this._lightQueue = queue;

    // Copy light at chunk edges from neighbors (approximate).
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;
    const includeNeighbor = (worldX, worldZ, y, best) => {
      const ncx = Math.floor(worldX / CHUNK_SIZE);
      const ncz = Math.floor(worldZ / CHUNK_SIZE);
      const neighbor = this.getChunk(ncx, ncz);
      if (!neighbor || !neighbor.generated) return best;
      const nx = worldX - ncx * CHUNK_SIZE;
      const nz = worldZ - ncz * CHUNK_SIZE;
      const index = blockIndex(nx, y, nz);
      const id = neighbor.blocks[index];
      const def = BLOCKS[id];
      if (id !== BLOCK.AIR && def && !def.transparent) return best;
      const neighborLight = isSky ? neighbor.skyLight[index] : neighbor.blockLight[index];
      return Math.max(best, Math.max(0, neighborLight - 1));
    };
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          if (x > 0 && x < CHUNK_SIZE - 1 && z > 0 && z < CHUNK_SIZE - 1) continue;
          const index = blockIndex(x, y, z);
          const id = blocks[index];
          const def = BLOCKS[id];
          if (id !== BLOCK.AIR && def && !def.transparent) continue;
          const wx = baseX + x;
          const wz = baseZ + z;
          let best = lightArray[index];
          best = includeNeighbor(wx + 1, wz, y, best);
          best = includeNeighbor(wx - 1, wz, y, best);
          best = includeNeighbor(wx, wz + 1, y, best);
          best = includeNeighbor(wx, wz - 1, y, best);
          lightArray[index] = best;
        }
      }
    }
  }

  /**
   * Load/unload chunks around a position and prepare meshes.
   * @returns {number} number of newly built meshes
   */
  update(playerX, playerZ, renderDistance, maxBuildMs = 6, maxGenerate = 3) {
    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);
    const radius = Math.max(0, Math.min(32, Math.floor(Number(renderDistance) || 0)));

    // ALWAYS build the chunk below the player first (prevent falling through!)
    let generated = 0;
    const center = this.getChunk(pcx, pcz);
    if (!center || !center.generated) {
      this.generateChunk(pcx, pcz);
      generated++;
      for (const [ncx, ncz] of [[pcx + 1, pcz], [pcx - 1, pcz], [pcx, pcz + 1], [pcx, pcz - 1]]) {
        const n = this.getChunk(ncx, ncz);
        if (n && n.generated) n.dirty = true;
      }
    }

    // Generate other missing chunks from near to far so the visible play area
    // fills before distant edge chunks.
    for (const [dx, dz] of chunkOffsets(radius)) {
      if (generated >= maxGenerate) break;
      const cx = pcx + dx;
      const cz = pcz + dz;
      const chunk = this.getChunk(cx, cz);
      if (!chunk || !chunk.generated) {
        this.generateChunk(cx, cz);
        generated++;
        const c = this.getChunk(cx, cz);
        c.dirty = true;
        // Mark neighbors (edges)
        for (const [ncx, ncz] of [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]]) {
          const n = this.getChunk(ncx, ncz);
          if (n && n.generated) n.dirty = true;
        }
      }
    }

    // Unload distant chunks
    for (const [key, chunk] of this.chunks) {
      const dx = chunk.cx - pcx;
      const dz = chunk.cz - pcz;
      if (dx * dx + dz * dz > (radius + 2) * (radius + 2)) {
        this.disposeChunkMeshes(chunk);
        this.chunks.delete(key);
      }
    }

    // Build meshes within a time budget
    const startTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    let built = 0;
    for (const chunk of this.chunks.values()) {
      if (!chunk.dirty || !chunk.generated) continue;
      if (chunk.lightDirty) this.recomputeLight(chunk);
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (built > 0 && now - startTime > maxBuildMs) break;
      this.buildChunkMesh(chunk);
      built++;
    }
    return built;
  }

  /** Build a chunk mesh and add it to the scene. */
  buildChunkMesh(chunk) {
    const { solid, transparent, fluidWater, fluidLava } = buildChunkGeometry(this, chunk);
    this._clearChunkMeshes(chunk);

    const addMesh = (geom, mat, order) => {
      if (!geom) return null;
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.renderOrder = order;
      if (this.materials.scene) this.materials.scene.add(mesh);
      return mesh;
    };

    chunk.meshSolid = addMesh(solid, this.materials.solid, 0);
    chunk.meshTransparent = addMesh(transparent, this.materials.transparent, 1);
    chunk.meshFluidWater = addMesh(fluidWater, this.materials.fluidWater, 2);
    chunk.meshFluidLava = addMesh(fluidLava, this.materials.fluidLava, 3);

    chunk.dirty = false;
    chunk.lightDirty = false;
  }

  _clearChunkMeshes(chunk) {
    for (const key of ['meshSolid', 'meshTransparent', 'meshFluidWater', 'meshFluidLava']) {
      const mesh = chunk[key];
      if (mesh) {
        if (this.materials.scene) this.materials.scene.remove(mesh);
        mesh.geometry.dispose();
        chunk[key] = null;
      }
    }
  }

  disposeChunkMeshes(chunk) {
    this._clearChunkMeshes(chunk);
  }

  /**
   * Voxel-Raycast (Amanatides & Woo).
   * @returns {{x,y,z,nx,ny,nz,distance,id}|null}
   */
  raycast(origin, direction, maxDistance = 6) {
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = direction.x > 0 ? 1 : -1;
    const stepY = direction.y > 0 ? 1 : -1;
    const stepZ = direction.z > 0 ? 1 : -1;

    const tDeltaX = direction.x !== 0 ? Math.abs(1 / direction.x) : Infinity;
    const tDeltaY = direction.y !== 0 ? Math.abs(1 / direction.y) : Infinity;
    const tDeltaZ = direction.z !== 0 ? Math.abs(1 / direction.z) : Infinity;

    let tMaxX = direction.x !== 0
      ? ((stepX > 0 ? x + 1 - origin.x : origin.x - x) * tDeltaX)
      : Infinity;
    let tMaxY = direction.y !== 0
      ? ((stepY > 0 ? y + 1 - origin.y : origin.y - y) * tDeltaY)
      : Infinity;
    let tMaxZ = direction.z !== 0
      ? ((stepZ > 0 ? z + 1 - origin.z : origin.z - z) * tDeltaZ)
      : Infinity;

    let nx = 0, ny = 0, nz = 0;
    let distance = 0;

    while (distance <= maxDistance) {
      const id = this.getBlock(x, y, z);
      if (id !== BLOCK.AIR && id !== BLOCK.WATER && id !== BLOCK.LAVA) {
        const def = BLOCKS[id];
        if (def && (def.solid || def.render === RENDER.CROSS || def.render === RENDER.TORCH || def.render === RENDER.CROP || def.render === RENDER.LADDER)) {
          return { x, y, z, nx, ny, nz, distance, id };
        }
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX;
        distance = tMaxX;
        tMaxX += tDeltaX;
        nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY;
        distance = tMaxY;
        tMaxY += tDeltaY;
        nx = 0; ny = -stepY; nz = 0;
      } else {
        z += stepZ;
        distance = tMaxZ;
        tMaxZ += tDeltaZ;
        nx = 0; ny = 0; nz = -stepZ;
      }
    }
    return null;
  }

  /** Surface height (for spawning/mobs). */
  heightAt(x, z) {
    return this.gen.heightAt(Math.floor(x), Math.floor(z));
  }

  /** Is the position walkable for mobs (2 blocks of air)? */
  isSpaceFree(x, y, z) {
    return this.getBlock(x, y, z) === BLOCK.AIR && this.getBlock(x, y + 1, z) === BLOCK.AIR;
  }

  /** Aggregate chunk statistics (debug). */
  stats() {
    let generated = 0;
    let dirty = 0;
    let solidVerts = 0;
    for (const c of this.chunks.values()) {
      if (c.generated) generated++;
      if (c.dirty) dirty++;
      if (c.meshSolid) solidVerts += c.meshSolid.geometry.attributes.position.count;
    }
    return { chunks: this.chunks.size, generated, dirty, solidVerts, modified: this.modified.size };
  }

  /** Rebuild all meshes (after a settings change). */
  rebuildAll() {
    for (const chunk of this.chunks.values()) {
      if (chunk.generated) {
        chunk.dirty = true;
        this.buildChunkMesh(chunk);
      }
    }
  }
}

export { SEA_LEVEL };
