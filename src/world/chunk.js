// chunk.js — Chunk data (blocks, metadata, lighting) and mesh generation with AO.
import * as THREE from '../../lib/three.module.js';
import { BLOCKS, RENDER, BLOCK, isOpaque, isTransparent } from './blocks.js';
import { TILE_SIZE, ATLAS_COLS } from './textures.js';

export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 64;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE;

/** Index in the chunk array. */
export function blockIndex(x, y, z) {
  return x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
}

/** Atlas UV rectangle for a tile. */
export function tileUV(tileIndex) {
  const col = tileIndex % ATLAS_COLS;
  const row = Math.floor(tileIndex / ATLAS_COLS);
  const s = 1 / ATLAS_COLS;
  // Small inset to prevent texture bleeding
  const e = 0.0005;
  return { u0: col * s + e, v0: 1 - (row + 1) * s + e, u1: (col + 1) * s - e, v1: 1 - row * s - e };
}

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_VOLUME);
    this.meta = new Uint8Array(CHUNK_VOLUME);   // e.g. growth stage
    this.skyLight = new Uint8Array(CHUNK_VOLUME);
    this.blockLight = new Uint8Array(CHUNK_VOLUME);
    this.dirty = true;           // Rebuild mesh?
    this.lightDirty = true;
    this.generated = false;
    this.meshSolid = null;
    this.meshTransparent = null;
    this.queued = false;
  }

  get(x, y, z) {
    if (y < 0 || y >= CHUNK_HEIGHT) return BLOCK.AIR;
    return this.blocks[blockIndex(x, y, z)];
  }

  set(x, y, z, id, meta = 0) {
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    const i = blockIndex(x, y, z);
    this.blocks[i] = id;
    this.meta[i] = meta;
    this.dirty = true;
    this.lightDirty = true;
  }

  getMeta(x, y, z) {
    if (y < 0 || y >= CHUNK_HEIGHT) return 0;
    return this.meta[blockIndex(x, y, z)];
  }

  setMeta(x, y, z, meta) {
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    this.meta[blockIndex(x, y, z)] = meta;
    this.dirty = true;
  }
}

// Face definitions: corners (CCW from outside), AO neighbors, and shading
const FACES = [
  { // +X (right)
    dir: [1, 0, 0],
    corners: [
      { pos: [1, 0, 1], uv: [0, 0], ao: [[1, -1, 0], [1, 0, 1], [1, -1, 1]] },
      { pos: [1, 1, 1], uv: [0, 1], ao: [[1, 1, 0], [1, 0, 1], [1, 1, 1]] },
      { pos: [1, 1, 0], uv: [1, 1], ao: [[1, 1, 0], [1, 0, -1], [1, 1, -1]] },
      { pos: [1, 0, 0], uv: [1, 0], ao: [[1, -1, 0], [1, 0, -1], [1, -1, -1]] },
    ],
    shade: 0.72,
  },
  { // -X (left)
    dir: [-1, 0, 0],
    corners: [
      { pos: [0, 0, 0], uv: [0, 0], ao: [[-1, -1, 0], [-1, 0, -1], [-1, -1, -1]] },
      { pos: [0, 1, 0], uv: [0, 1], ao: [[-1, 1, 0], [-1, 0, -1], [-1, 1, -1]] },
      { pos: [0, 1, 1], uv: [1, 1], ao: [[-1, 1, 0], [-1, 0, 1], [-1, 1, 1]] },
      { pos: [0, 0, 1], uv: [1, 0], ao: [[-1, -1, 0], [-1, 0, 1], [-1, -1, 1]] },
    ],
    shade: 0.72,
  },
  { // +Y (top)
    dir: [0, 1, 0],
    corners: [
      { pos: [0, 1, 1], uv: [1, 1], ao: [[-1, 1, 0], [0, 1, 1], [-1, 1, 1]] },
      { pos: [1, 1, 1], uv: [0, 1], ao: [[1, 1, 0], [0, 1, 1], [1, 1, 1]] },
      { pos: [1, 1, 0], uv: [0, 0], ao: [[1, 1, 0], [0, 1, -1], [1, 1, -1]] },
      { pos: [0, 1, 0], uv: [1, 0], ao: [[-1, 1, 0], [0, 1, -1], [-1, 1, -1]] },
    ],
    shade: 1.0,
  },
  { // -Y (bottom)
    dir: [0, -1, 0],
    corners: [
      { pos: [0, 0, 0], uv: [1, 1], ao: [[-1, -1, 0], [0, -1, -1], [-1, -1, -1]] },
      { pos: [1, 0, 0], uv: [0, 1], ao: [[1, -1, 0], [0, -1, -1], [1, -1, -1]] },
      { pos: [1, 0, 1], uv: [0, 0], ao: [[1, -1, 0], [0, -1, 1], [1, -1, 1]] },
      { pos: [0, 0, 1], uv: [1, 0], ao: [[-1, -1, 0], [0, -1, 1], [-1, -1, 1]] },
    ],
    shade: 0.55,
  },
  { // +Z (front)
    dir: [0, 0, 1],
    corners: [
      { pos: [0, 0, 1], uv: [0, 0], ao: [[-1, -1, 1], [0, -1, 1], [-1, 0, 1]] },
      { pos: [0, 1, 1], uv: [0, 1], ao: [[-1, 1, 1], [0, 1, 1], [-1, 0, 1]] },
      { pos: [1, 1, 1], uv: [1, 1], ao: [[1, 1, 1], [0, 1, 1], [1, 0, 1]] },
      { pos: [1, 0, 1], uv: [1, 0], ao: [[1, -1, 1], [0, -1, 1], [1, 0, 1]] },
    ],
    shade: 0.85,
  },
  { // -Z (back)
    dir: [0, 0, -1],
    corners: [
      { pos: [1, 0, 0], uv: [0, 0], ao: [[1, -1, -1], [0, -1, -1], [1, 0, -1]] },
      { pos: [1, 1, 0], uv: [0, 1], ao: [[1, 1, -1], [0, 1, -1], [1, 0, -1]] },
      { pos: [0, 1, 0], uv: [1, 1], ao: [[-1, 1, -1], [0, 1, -1], [-1, 0, -1]] },
      { pos: [0, 0, 0], uv: [1, 0], ao: [[-1, -1, -1], [0, -1, -1], [-1, 0, -1]] },
    ],
    shade: 0.85,
  },
];

/**
 * Calculate the AO value (0–3) for a corner.
 */
function vertexAO(side1, side2, corner, lightFn) {
  const s1 = lightFn(...side1);
  const s2 = lightFn(...side2);
  const c = lightFn(...corner);
  if (s1 && s2) return 0;
  return 3 - (s1 + s2 + c);
}

/**
 * Build a chunk's geometry.
 * @param {object} world world with getBlock/getMeta/getSkyLight/getBlockLight (world coordinates)
 * @param {Chunk} chunk
 * @param {object} opts { textures: {water: THREE.Texture} }
 * @returns {{solid: THREE.BufferGeometry|null, transparent: THREE.BufferGeometry|null}}
 */
export function buildChunkGeometry(world, chunk) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  const tPositions = [];
  const tNormals = [];
  const tUvs = [];
  const tColors = [];
  const tIndices = [];

  const wPositions = [];
  const wNormals = [];
  const wUvs = [];
  const wColors = [];
  const wIndices = [];

  const lPositions = [];
  const lNormals = [];
  const lUvs = [];
  const lColors = [];
  const lIndices = [];

  const baseX = chunk.cx * CHUNK_SIZE;
  const baseZ = chunk.cz * CHUNK_SIZE;

  const getBlock = (x, y, z) => {
    if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE && y >= 0 && y < CHUNK_HEIGHT) {
      return chunk.blocks[blockIndex(x, y, z)];
    }
    return world.getBlock(baseX + x, y, baseZ + z);
  };
  const getSky = (x, y, z) => {
    if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE && y >= 0 && y < CHUNK_HEIGHT) {
      return chunk.skyLight[blockIndex(x, y, z)];
    }
    return world.getSkyLight(baseX + x, y, baseZ + z);
  };
  const getBL = (x, y, z) => {
    if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE && y >= 0 && y < CHUNK_HEIGHT) {
      return chunk.blockLight[blockIndex(x, y, z)];
    }
    return world.getBlockLight(baseX + x, y, baseZ + z);
  };
  /** Does the block obstruct light/vision? */
  const isOcc = (x, y, z) => isOpaque(getBlock(x, y, z));

  const lightAt = (x, y, z) => {
    const sky = getSky(x, y, z);
    const bl = getBL(x, y, z);
    return Math.max(sky / 15, bl / 15);
  };

  const pushQuad = (target, idxBase, flip, reverseWinding = false) => {
    if (reverseWinding) {
      if (flip) {
        target.i.push(idxBase + 1, idxBase + 3, idxBase + 2);
        target.i.push(idxBase + 1, idxBase + 0, idxBase + 3);
      } else {
        target.i.push(idxBase + 0, idxBase + 2, idxBase + 1);
        target.i.push(idxBase + 0, idxBase + 3, idxBase + 2);
      }
    } else if (flip) {
      target.i.push(idxBase + 1, idxBase + 2, idxBase + 3);
      target.i.push(idxBase + 1, idxBase + 3, idxBase + 0);
    } else {
      target.i.push(idxBase + 0, idxBase + 1, idxBase + 2);
      target.i.push(idxBase + 0, idxBase + 2, idxBase + 3);
    }
  };

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const id = chunk.blocks[blockIndex(x, y, z)];
        if (id === BLOCK.AIR) continue;
        const def = BLOCKS[id];
        if (!def) continue;
        const meta = chunk.meta[blockIndex(x, y, z)];

        if (def.render === RENDER.CROSS || def.render === RENDER.CROP) {
          // X-shaped plants
          const tile = def.render === RENDER.CROP
            ? (def.cropTiles ? def.cropTiles[Math.min(meta, def.cropTiles.length - 1)] : def.tiles[0])
            : def.tiles[0];
          const uvRect = tileUV(tile);
          // Letting plants without a lighting model fall completely to black would
          // make them invisible after even minor lighting-data errors. Material
          // tinting still handles the day/night transition.
          const light = Math.max(0.45, lightAt(x, y, z));
          const r = light, g = light, b = light;
          const planes = [
            [[x + 0.1, y, z + 0.1], [x + 0.9, y, z + 0.9]],
            [[x + 0.9, y, z + 0.1], [x + 0.1, y, z + 0.9]],
          ];
          for (const [a, c] of planes) {
            const base = tPositions.length / 3;
            const pts = [
              [a[0], y, a[2]],
              [a[0], y + 1, a[2]],
              [c[0], y + 1, c[2]],
              [c[0], y, c[2]],
            ];
            // One quad per plane—the DoubleSide material renders both sides
            // without overlapping twin quads (z-fighting checkerboard).
            for (const p of pts) tPositions.push(p[0], p[1], p[2]);
            tNormals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
            tUvs.push(
              uvRect.u0, uvRect.v0,
              uvRect.u0, uvRect.v1,
              uvRect.u1, uvRect.v1,
              uvRect.u1, uvRect.v0
            );
            for (let k = 0; k < 4; k++) tColors.push(r, g, b);
            tIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
          continue;
        }

        if (def.render === RENDER.TORCH) {
          // Slim torch
          const uvRect = tileUV(def.tiles[0]);
          const light = 1.0; // Torches emit light
          const x0 = x + 0.42, x1 = x + 0.58, z0 = z + 0.42, z1 = z + 0.58, y0 = y, y1 = y + 0.65;
          const quads = [
            { n: [1, 0, 0], v: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], u: [uvRect.u1, uvRect.u0] },
            { n: [-1, 0, 0], v: [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]], u: [uvRect.u1, uvRect.u0] },
            { n: [0, 0, 1], v: [[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]], u: [uvRect.u1, uvRect.u0] },
            { n: [0, 0, -1], v: [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], u: [uvRect.u1, uvRect.u0] },
            { n: [0, 1, 0], v: [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], u: [uvRect.u1, uvRect.u0] },
          ];
          for (const q of quads) {
            const base = tPositions.length / 3;
            for (const p of q.v) tPositions.push(p[0], p[1], p[2]);
            for (let k = 0; k < 4; k++) tNormals.push(q.n[0], q.n[1], q.n[2]);
            tUvs.push(
              uvRect.u0, uvRect.v0, uvRect.u0, uvRect.v1,
              uvRect.u1, uvRect.v1, uvRect.u1, uvRect.v0
            );
            for (let k = 0; k < 4; k++) tColors.push(light, light * 0.95, light * 0.85);
            tIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
          continue;
        }

        if (def.render === RENDER.LADDER) {
          const uvRect = tileUV(def.tiles[0]);
          const light = lightAt(x, y, z);
          // Draw only where a solid block is adjacent
          const sides = [
            { off: [1, 0, 0], dir: [1, 0, 0], quad: [[x + 1, y, z + 0.05], [x + 1, y + 1, z + 0.05], [x + 1, y + 1, z + 0.95], [x + 1, y, z + 0.95]] },
            { off: [-1, 0, 0], dir: [-1, 0, 0], quad: [[x, y, z + 0.95], [x, y + 1, z + 0.95], [x, y + 1, z + 0.05], [x, y, z + 0.05]] },
            { off: [0, 0, 1], dir: [0, 0, 1], quad: [[x + 0.95, y, z + 1], [x + 0.95, y + 1, z + 1], [x + 0.05, y + 1, z + 1], [x + 0.05, y, z + 1]] },
            { off: [0, 0, -1], dir: [0, 0, -1], quad: [[x + 0.05, y, z], [x + 0.05, y + 1, z], [x + 0.95, y + 1, z], [x + 0.95, y, z]] },
          ];
          for (const s of sides) {
            if (!isOcc(x + s.off[0], y, z + s.off[2])) continue;
            const base = tPositions.length / 3;
            for (const p of s.quad) tPositions.push(p[0], p[1], p[2]);
            for (let k = 0; k < 4; k++) tNormals.push(s.dir[0], s.dir[1], s.dir[2]);
            tUvs.push(
              uvRect.u0, uvRect.v0, uvRect.u0, uvRect.v1,
              uvRect.u1, uvRect.v1, uvRect.u1, uvRect.v0
            );
            for (let k = 0; k < 4; k++) tColors.push(light, light, light);
            tIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
          continue;
        }

        // ---- Standard cuboid (CUBE / WATER / LAVA / LEAVES / GLASS) ----
        const isWater = def.render === RENDER.WATER;
        const isLava = id === BLOCK.LAVA;
        const isFluid = isWater || isLava;
        const isTrans = def.transparent;
        const target = isFluid
          ? (isWater
            ? { p: wPositions, n: wNormals, u: wUvs, c: wColors, i: wIndices }
            : { p: lPositions, n: lNormals, u: lUvs, c: lColors, i: lIndices })
          : (isTrans
            ? { p: tPositions, n: tNormals, u: tUvs, c: tColors, i: tIndices }
            : { p: positions, n: normals, u: uvs, c: colors, i: indices });

        const tiles = def.tiles || [0, 0, 0];
        for (const face of FACES) {
          const nx = x + face.dir[0];
          const ny = y + face.dir[1];
          const nz = z + face.dir[2];
          const neighbor = getBlock(nx, ny, nz);
          const nDef = BLOCKS[neighbor];

          if (isFluid) {
            // Show a fluid face only when the neighbor differs and is not opaque
            if (neighbor === id || isOpaque(neighbor)) continue;
          } else if (isTrans) {
            // Transparent blocks: show a face when the neighbor is non-opaque and of another type (glass/water)
            if (isOpaque(neighbor)) continue;
            if (neighbor === id && def.render === RENDER.GLASS) continue;
          } else {
            // Opaque blocks: show a face only toward a transparent neighbor
            if (isOpaque(neighbor)) continue;
          }

          // Select tile
          let tile;
          if (face.dir[1] === 1) tile = tiles[0];
          else if (face.dir[1] === -1) tile = tiles[2] != null ? tiles[2] : tiles[1];
          else tile = tiles[1] != null ? tiles[1] : tiles[0];
          const uvRect = tileUV(tile);

          const base = target.p.length / 3;

          // Lower the water surface slightly
          const topY = isWater && face.dir[1] === 1 && getBlock(x, y + 1, z) !== BLOCK.WATER ? 0.875 : 1;

          const aoValues = [];
          const lightValues = [];
          for (const corner of face.corners) {
            const cx = x + corner.pos[0];
            const cy = y + corner.pos[1] * topY;
            const cz = z + corner.pos[2];
            const ao = isTrans
              ? 3
              : vertexAO(
                  [x + corner.ao[0][0], y + corner.ao[0][1], z + corner.ao[0][2]],
                  [x + corner.ao[1][0], y + corner.ao[1][1], z + corner.ao[1][2]],
                  [x + corner.ao[2][0], y + corner.ao[2][1], z + corner.ao[2][2]],
                  (bx, by, bz) => (isOcc(bx, by, bz) ? 1 : 0)
                );
            aoValues.push(ao);
            // Light at the face's neighboring block
            const nl = Math.max(
              getSky(nx, ny, nz) / 15,
              getBL(nx, ny, nz) / 15
            );
            lightValues.push(nl);
          }

          for (let ci = 0; ci < 4; ci++) {
            const corner = face.corners[ci];
            const px = x + corner.pos[0];
            const py = y + corner.pos[1] * topY;
            const pz = z + corner.pos[2];
            target.p.push(px, py, pz);
            target.n.push(face.dir[0], face.dir[1], face.dir[2]);
            if (isFluid) {
              // Fluids use the full texture (animated frame strip)
              target.u.push(corner.uv[0], corner.uv[1]);
            } else {
              target.u.push(
                corner.uv[0] ? uvRect.u0 : uvRect.u1,
                corner.uv[1] ? uvRect.v1 : uvRect.v0
              );
            }
            // Slightly stronger but still bounded corner darkening gives pixel blocks more depth.
            const aoLight = isTrans || isFluid ? 1 : 1 - (aoValues[ci] * 0.16);
            const l = Math.max(0.06, lightValues[ci]) * face.shade * aoLight;
            target.c.push(l, l, l);
          }

          // Triangulation (flip the AO edge for a better gradient)
          const flip = aoValues[0] + aoValues[2] > aoValues[1] + aoValues[3];
          // The side FACES are wound inward in vertex order. Reverse the indices here
          // so FrontSide materials actually draw the outside (Three.js culls backfaces).
          const reverseWinding = face.dir[1] === 0;
          pushQuad(target, base, flip, reverseWinding);
        }
      }
    }
  }

  const makeGeom = (p, n, u, c, i) => {
    if (p.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    g.setIndex(i);
    g.computeBoundingSphere();
    return g;
  };

  return {
    solid: makeGeom(positions, normals, uvs, colors, indices),
    transparent: makeGeom(tPositions, tNormals, tUvs, tColors, tIndices),
    fluidWater: makeGeom(wPositions, wNormals, wUvs, wColors, wIndices),
    fluidLava: makeGeom(lPositions, lNormals, lUvs, lColors, lIndices),
  };
}

/** Check whether a block needs a neighbor for a face (test helper). */
export function shouldDrawFace(id, neighborId) {
  if (id === BLOCK.AIR) return false;
  const def = BLOCKS[id];
  if (!def) return false;
  if (def.render === RENDER.WATER) {
    return neighborId !== BLOCK.WATER && !isOpaque(neighborId);
  }
  return !isOpaque(neighborId);
}
