// worldgen.js — Procedural world generation: terrain, biomes, caves, ores, trees, and plants.
import { PerlinNoise, coordHash, mapRange, mulberry32 } from './noise.js';
import { BLOCK } from './blocks.js';
import { CHUNK_SIZE, CHUNK_HEIGHT, blockIndex } from './chunk.js';

export const SEA_LEVEL = 30;

export const BIOME = {
  OCEAN: 0,
  BEACH: 1,
  PLAINS: 2,
  FOREST: 3,
  DESERT: 4,
  MOUNTAINS: 5,
  SNOWY: 6,
  SWAMP: 7,
};

export const BIOME_NAMES = {
  [BIOME.OCEAN]: 'Ocean',
  [BIOME.BEACH]: 'Beach',
  [BIOME.PLAINS]: 'Plains',
  [BIOME.FOREST]: 'Forest',
  [BIOME.DESERT]: 'Desert',
  [BIOME.MOUNTAINS]: 'Mountains',
  [BIOME.SNOWY]: 'Snowy Plains',
  [BIOME.SWAMP]: 'Swamp',
};

export class WorldGen {
  constructor(seed = 1337, worldType = 'normal') {
    this.seed = seed >>> 0;
    this.worldType = worldType;
    this.continentNoise = new PerlinNoise(seed ^ 0x1234);
    this.heightNoise = new PerlinNoise(seed ^ 0x5678);
    this.detailNoise = new PerlinNoise(seed ^ 0x9abc);
    this.tempNoise = new PerlinNoise(seed ^ 0xdef0);
    this.humidNoise = new PerlinNoise(seed ^ 0x1357);
    this.caveNoise = new PerlinNoise(seed ^ 0x2468);
    this.caveNoise2 = new PerlinNoise(seed ^ 0x8642);
    this.oreNoise = new PerlinNoise(seed ^ 0x9753);
    this.treeNoise = new PerlinNoise(seed ^ 0x8642);
  }

  /** Determine the biome at a column. */
  biomeAt(wx, wz) {
    return this.biomeAtHeight(wx, wz, this.heightAt(wx, wz));
  }

  /** Determine the biome when the terrain height has already been calculated. */
  biomeAtHeight(wx, wz, height) {
    if (this.worldType === 'flat') return BIOME.PLAINS;
    const temp = this.tempNoise.fbm2D(wx * 0.0035, wz * 0.0035, 3);
    const humid = this.humidNoise.fbm2D(wx * 0.0035 + 100, wz * 0.0035 - 100, 3);
    if (height < SEA_LEVEL - 2) return BIOME.OCEAN;
    if (height < SEA_LEVEL + 1) return BIOME.BEACH;
    if (height > SEA_LEVEL + 14) return BIOME.MOUNTAINS;
    if (temp < -0.32) return BIOME.SNOWY;
    if (temp > 0.32 && humid < 0.08) return BIOME.DESERT;
    if (humid > 0.22 && height <= SEA_LEVEL + 2) return BIOME.SWAMP;
    if (humid > 0.12) return BIOME.FOREST;
    return BIOME.PLAINS;
  }

  /** Terrain height (y of the top surface) at a column. */
  heightAt(wx, wz) {
    if (this.worldType === 'flat') return 32;
    const cont = this.continentNoise.fbm2D(wx * 0.0016, wz * 0.0016, 4); // Land/ocean
    const hills = this.heightNoise.fbm2D(wx * 0.008, wz * 0.008, 4);
    const detail = this.detailNoise.fbm2D(wx * 0.03, wz * 0.03, 2);
    const mountainMask = Math.max(0, this.heightNoise.noise2D(wx * 0.0022 + 40, wz * 0.0022 - 40));
    const mountain = Math.pow(mountainMask, 1.6) * this.detailNoise.billow2D(wx * 0.006, wz * 0.006, 4);

    let h = SEA_LEVEL + cont * 14 + hills * 6 + detail * 2 + mountain * 26;
    // Deepen ocean basins
    if (cont < -0.25) h -= mapRange(cont, -0.25, -0.8, 0, 12);
    return Math.max(3, Math.min(CHUNK_HEIGHT - 8, Math.floor(h)));
  }

  /** Cave? (two 3D noise fields form tunnels plus sponge-like erosion) */
  isCave(wx, wy, wz) {
    if (this.worldType === 'flat') return false;
    if (wy < 2 || wy > 52) return false;
    const n1 = this.caveNoise.noise3D(wx * 0.042, wy * 0.055, wz * 0.042);
    const n2 = this.caveNoise2.noise3D(wx * 0.042 + 50, wy * 0.055 + 50, wz * 0.042 + 50);
    // Tunnels (two noise values near zero)
    if (Math.abs(n1) < 0.075 && Math.abs(n2) < 0.075) return true;
    // Larger caverns deep underground
    if (wy < 20) {
      const n3 = this.caveNoise.noise3D(wx * 0.02, wy * 0.03, wz * 0.02);
      if (n3 > 0.62) return true;
    }
    return false;
  }

  /** Ore at a position (depth-dependent probabilities). */
  oreAt(wx, wy, wz) {
    const r = coordHash(wx, wy, wz, this.seed ^ 0xabcd);
    const veinNoise = this.oreNoise.noise3D(wx * 0.11, wy * 0.11, wz * 0.11);
    const inVein = veinNoise > 0.55;
    if (wy < 14 && r < 0.012 && inVein) return BLOCK.DIAMOND_ORE;
    if (wy < 18 && r >= 0.012 && r < 0.03) return BLOCK.REDSTONE_ORE;
    if (wy < 22 && r >= 0.03 && r < 0.05) return BLOCK.GOLD_ORE;
    if (wy < 40 && r >= 0.05 && r < 0.115) return BLOCK.IRON_ORE;
    if (wy < 52 && r >= 0.115 && r < 0.21) return BLOCK.COAL_ORE;
    return BLOCK.AIR;
  }

  /** Tree at a column? Returns a tree type or null. Existing column values avoid duplicate noise lookups. */
  treeAt(wx, wz, biome = null, height = null) {
    const r = coordHash(wx, 7, wz, this.seed ^ 0x77aa);
    biome ??= this.biomeAt(wx, wz);
    switch (biome) {
      case BIOME.FOREST:
        if (r < 0.028) return r < 0.014 ? 'oak' : 'birch';
        return null;
      case BIOME.PLAINS:
        return r < 0.004 ? 'oak' : null;
      case BIOME.SWAMP:
        return r < 0.012 ? 'oak' : null;
      case BIOME.SNOWY:
        return r < 0.016 ? 'spruce' : null;
      case BIOME.MOUNTAINS:
        return r < 0.007 && (height ?? this.heightAt(wx, wz)) < SEA_LEVEL + 18 ? 'spruce' : null;
      default:
        return null;
    }
  }

  /**
   * Fill a chunk with blocks.
   */
  generate(chunk, world) {
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;
    const blocks = chunk.blocks;
    const meta = chunk.meta;

    // ---- Base terrain -----------------------------------------------------
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = baseX + x;
        const wz = baseZ + z;
        const h = this.heightAt(wx, wz);
        const biome = this.biomeAtHeight(wx, wz, h);

        for (let y = 0; y <= Math.max(h, SEA_LEVEL); y++) {
          if (y > h && y <= SEA_LEVEL) {
            // Water
            blocks[blockIndex(x, y, z)] = (biome === BIOME.SNOWY && y === SEA_LEVEL) ? BLOCK.ICE : BLOCK.WATER;
            continue;
          }
          if (y > h) continue;

          let id;
          if (y === 0) id = BLOCK.BEDROCK;
          else if (y < 4 && coordHash(wx, y, wz, this.seed ^ 0x11) < 0.5) id = BLOCK.BEDROCK;
          else if (y === h) {
            // Surface block
            switch (biome) {
              case BIOME.DESERT: id = BLOCK.SAND; break;
              case BIOME.BEACH: id = BLOCK.SAND; break;
              case BIOME.OCEAN: id = (coordHash(wx, 3, wz, this.seed) < 0.25) ? BLOCK.GRAVEL : (coordHash(wx, 4, wz, this.seed) < 0.35 ? BLOCK.CLAY : BLOCK.SAND); break;
              case BIOME.SNOWY: id = BLOCK.SNOW; break;
              case BIOME.MOUNTAINS:
                id = h > SEA_LEVEL + 24 ? BLOCK.SNOW : (h > SEA_LEVEL + 16 ? BLOCK.STONE : BLOCK.GRASS);
                break;
              case BIOME.SWAMP: id = BLOCK.GRASS; break;
              default: id = BLOCK.GRASS;
            }
            if (h < SEA_LEVEL && (biome === BIOME.PLAINS || biome === BIOME.FOREST)) id = BLOCK.SAND;
          } else if (y > h - 4) {
            switch (biome) {
              case BIOME.DESERT: id = y > h - 3 ? BLOCK.SAND : BLOCK.SANDSTONE; break;
              case BIOME.BEACH: id = BLOCK.SAND; break;
              case BIOME.OCEAN: id = BLOCK.SAND; break;
              default: id = BLOCK.DIRT;
            }
          } else {
            id = BLOCK.STONE;
          }

          // Caves
          if (id !== BLOCK.BEDROCK && this.isCave(wx, y, wz)) {
            blocks[blockIndex(x, y, z)] = BLOCK.AIR;
            continue;
          }

          // Ores (stone only)
          if (id === BLOCK.STONE) {
            const ore = this.oreAt(wx, y, wz);
            if (ore !== BLOCK.AIR) id = ore;
          }

          blocks[blockIndex(x, y, z)] = id;
        }
      }
    }

    // ---- Decoration: trees (including edge overlap) -----------------------
    for (let z = -3; z < CHUNK_SIZE + 3; z++) {
      for (let x = -3; x < CHUNK_SIZE + 3; x++) {
        const wx = baseX + x;
        const wz = baseZ + z;
        const h = this.heightAt(wx, wz);
        const biome = this.biomeAtHeight(wx, wz, h);
        const treeType = this.treeAt(wx, wz, biome, h);
        if (!treeType || h <= SEA_LEVEL) continue;
        // No trees on stone/sand layers (grass surfaces only)
        if (biome === BIOME.DESERT || biome === BIOME.BEACH || biome === BIOME.OCEAN) continue;
        this.placeTree(chunk, x, h, z, treeType, wx, wz);
      }
    }

    // ---- Plants, cacti, and sugar cane ------------------------------------
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = baseX + x;
        const wz = baseZ + z;
        const h = this.heightAt(wx, wz);
        if (h < SEA_LEVEL) continue;
        const biome = this.biomeAtHeight(wx, wz, h);
        const ground = blocks[blockIndex(x, h, z)];
        const above = blockIndex(x, h + 1, z);
        if (blocks[above] !== BLOCK.AIR) continue;

        const r = coordHash(wx, h + 40, wz, this.seed ^ 0x5150);
        const r2 = coordHash(wx, h + 41, wz, this.seed ^ 0x6262);

        if (biome === BIOME.DESERT && ground === BLOCK.SAND) {
          if (r < 0.008) {
            // Cactus
            const ch = 1 + Math.floor(r2 * 3);
            for (let i = 0; i < ch; i++) {
              const idx = blockIndex(x, h + 1 + i, z);
              if (h + 1 + i < CHUNK_HEIGHT) blocks[idx] = BLOCK.CACTUS;
            }
          } else if (r >= 0.008 && r < 0.012) {
            blocks[above] = BLOCK.TALL_GRASS;
          }
          continue;
        }

        if (ground === BLOCK.GRASS || ground === BLOCK.SNOW) {
          if (r < 0.02) blocks[above] = BLOCK.TALL_GRASS;
          else if (r < 0.028) blocks[above] = BLOCK.FLOWER_RED;
          else if (r < 0.036) blocks[above] = BLOCK.FLOWER_YELLOW;
          else if (r < 0.039 && biome === BIOME.SWAMP) blocks[above] = BLOCK.MUSHROOM_RED;
        }

        // Sugar cane near water
        if ((biome === BIOME.PLAINS || biome === BIOME.SWAMP || biome === BIOME.DESERT || biome === BIOME.FOREST) && r < 0.01) {
          const nearWater =
            (world.getBlockQuiet && (
              world.getBlockQuiet(wx + 1, h, wz) === BLOCK.WATER ||
              world.getBlockQuiet(wx - 1, h, wz) === BLOCK.WATER ||
              world.getBlockQuiet(wx, h, wz + 1) === BLOCK.WATER ||
              world.getBlockQuiet(wx, h, wz - 1) === BLOCK.WATER
            ));
          if (nearWater && ground !== BLOCK.AIR) {
            const sh = 1 + Math.floor(r2 * 3);
            for (let i = 0; i < sh; i++) {
              if (h + 1 + i < CHUNK_HEIGHT) blocks[blockIndex(x, h + 1 + i, z)] = BLOCK.SUGAR_CANE;
            }
          }
        }
      }
    }

    chunk.generated = true;
    chunk.dirty = true;
    chunk.lightDirty = true;
  }

  /** Place a tree (local chunk coordinates; may extend beyond the edge). */
  placeTree(chunk, x, baseY, z, type, wx, wz) {
    const rand = mulberry32((wx * 341873128 + wz * 132897987) ^ this.seed);
    const set = (lx, ly, lz, id, meta = 0) => {
      if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE && ly >= 0 && ly < CHUNK_HEIGHT) {
        const idx = blockIndex(lx, ly, lz);
        // Place only in air (or overwrite leaves)
        const cur = chunk.blocks[idx];
        if (cur === BLOCK.AIR || cur === BLOCK.LEAVES || cur === BLOCK.BIRCH_LEAVES || cur === BLOCK.SPRUCE_LEAVES || cur === BLOCK.SNOW || cur === BLOCK.TALL_GRASS) {
          chunk.blocks[idx] = id;
          chunk.meta[idx] = meta;
        }
      }
    };

    if (type === 'oak' || type === 'birch') {
      const trunkH = 4 + Math.floor(rand() * 3);
      const logId = type === 'oak' ? BLOCK.LOG : BLOCK.BIRCH_LOG;
      const leafId = type === 'oak' ? BLOCK.LEAVES : BLOCK.BIRCH_LEAVES;
      for (let i = 1; i <= trunkH; i++) set(x, baseY + i, z, logId);
      for (let dy = trunkH - 2; dy <= trunkH + 1; dy++) {
        const radius = dy >= trunkH ? 1 : 2;
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dz = -radius; dz <= radius; dz++) {
            if (dx === 0 && dz === 0 && dy <= trunkH) continue;
            if (Math.abs(dx) === radius && Math.abs(dz) === radius && rand() < 0.5) continue;
            set(x + dx, baseY + dy, z + dz, leafId);
          }
        }
      }
    } else if (type === 'spruce') {
      const trunkH = 6 + Math.floor(rand() * 3);
      for (let i = 1; i <= trunkH; i++) set(x, baseY + i, z, BLOCK.SPRUCE_LOG);
      // Conical crown
      let radius = 0;
      for (let dy = 2; dy <= trunkH; dy++) {
        radius = dy > trunkH - 2 ? 1 : (dy % 2 === 0 ? 2 : 1);
        if (dy > trunkH - 3) radius = Math.max(1, radius - 1);
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dz = -radius; dz <= radius; dz++) {
            if (dx === 0 && dz === 0) continue;
            if (Math.abs(dx) + Math.abs(dz) > radius + 1) continue;
            set(x + dx, baseY + dy, z + dz, BLOCK.SPRUCE_LEAVES);
          }
        }
      }
      set(x, baseY + trunkH + 1, z, BLOCK.SPRUCE_LEAVES);
    }
  }

  /** Find a spawn position (on land, not in water). */
  findSpawn() {
    for (let r = 0; r < 200; r += 4) {
      for (let a = 0; a < 16; a++) {
        const x = Math.floor(Math.cos((a / 16) * Math.PI * 2) * r);
        const z = Math.floor(Math.sin((a / 16) * Math.PI * 2) * r);
        const h = this.heightAt(x, z);
        if (h > SEA_LEVEL + 1) {
          return { x: x + 0.5, y: h + 2.2, z: z + 0.5 };
        }
      }
    }
    return { x: 0.5, y: 45, z: 0.5 };
  }
}
