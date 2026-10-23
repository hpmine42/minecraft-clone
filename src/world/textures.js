// textures.js — Procedural pixel-art texture atlas generated with Canvas.
// Creates all block and item textures without external images.
// Atlas: 16×16 tiles at 16×16 px each = 256×256 px.

import { mulberry32 } from './noise.js';

export const TILE_SIZE = 16;
export const ATLAS_COLS = 16;
export const ATLAS_SIZE = TILE_SIZE * ATLAS_COLS;

/** Draw a pixel with optional per-tile noise. */
function makeTilePainter(tileIndex, seed) {
  const rand = mulberry32(seed + tileIndex * 7919);
  const data = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
  return {
    /** Set the base color plus noise variation. */
    fill(r, g, b, variance = 8) {
      for (let i = 0; i < TILE_SIZE * TILE_SIZE; i++) {
        const v = (rand() - 0.5) * 2 * variance;
        data[i * 4] = clamp255(r + v);
        data[i * 4 + 1] = clamp255(g + v);
        data[i * 4 + 2] = clamp255(b + v);
        data[i * 4 + 3] = 255;
      }
      return this;
    },
    /** Make the tile fully transparent (for plants, glass, and items). */
    clear() {
      data.fill(0);
      return this;
    },
    set(x, y, r, g, b, a = 255) {
      if (x < 0 || y < 0 || x >= TILE_SIZE || y >= TILE_SIZE) return;
      const i = (y * TILE_SIZE + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
      return this;
    },
    rect(x, y, w, h, r, g, b, a = 255) {
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) this.set(x + dx, y + dy, r, g, b, a);
      }
      return this;
    },
    /** Scatter pseudo-random dots. */
    speckle(count, r, g, b, alpha = 255) {
      for (let i = 0; i < count; i++) {
        this.set(Math.floor(rand() * TILE_SIZE), Math.floor(rand() * TILE_SIZE), r, g, b, alpha);
      }
      return this;
    },
    rand,
    data,
  };
}

function clamp255(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** Small repeatable stone segments with a light edge and dark seam. */
function drawCobblePattern(p, base = [112, 114, 113], mossy = false) {
  p.fill(55, 58, 57, 3);
  const stones = [
    [0, 0, 7, 5], [8, 0, 8, 5],
    [0, 6, 4, 4], [5, 6, 6, 4], [12, 6, 4, 4],
    [0, 11, 7, 5], [8, 11, 8, 5],
  ];
  for (const [x, y, w, h] of stones) {
    const variation = Math.round((p.rand() - 0.5) * 18);
    const color = base.map((channel) => clamp255(channel + variation));
    p.rect(x, y, w, h, ...color);
    p.rect(x, y, w, 1, ...color.map((channel) => clamp255(channel + 16)));
    p.rect(x, y, 1, h, ...color.map((channel) => clamp255(channel + 9)));
    p.rect(x, y + h - 1, w, 1, ...color.map((channel) => clamp255(channel - 19)));
    p.rect(x + w - 1, y, 1, h, ...color.map((channel) => clamp255(channel - 12)));
    if (w > 5 && p.rand() > 0.38) {
      p.set(x + 2 + Math.floor(p.rand() * (w - 3)), y + 2, ...color.map((channel) => clamp255(channel + 8)));
    }
  }
  if (mossy) {
    const patches = [[2, 2], [11, 1], [6, 7], [13, 8], [2, 13], [10, 13]];
    for (const [x, y] of patches) {
      const green = Math.floor(p.rand() * 18);
      p.rect(x, y, 2, 2, 55 + green, 104 + green, 58 + green);
      p.set(x + 1, y + 2, 72 + green, 126 + green, 70 + green);
    }
  }
}

/**
 * Build the complete atlas and return { canvas, textureData }.
 * Used both in the browser (Canvas) and in tests (ImageData array).
 */
export function generateAtlasData(seed = 1337) {
  const pixels = new Uint8ClampedArray(ATLAS_SIZE * ATLAS_SIZE * 4);

  const drawTile = (index, painter) => {
    const tx = (index % ATLAS_COLS) * TILE_SIZE;
    const ty = Math.floor(index / ATLAS_COLS) * TILE_SIZE;
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const src = (y * TILE_SIZE + x) * 4;
        const dst = ((ty + y) * ATLAS_SIZE + (tx + x)) * 4;
        pixels[dst] = painter.data[src];
        pixels[dst + 1] = painter.data[src + 1];
        pixels[dst + 2] = painter.data[src + 2];
        pixels[dst + 3] = painter.data[src + 3];
      }
    }
  };

  const tile = (index) => {
    const p = makeTilePainter(index, seed);
    return p;
  };

  // ---- Nature ---------------------------------------------------------------
  // 0 Grass top: connected grass tufts instead of uniform color noise.
  {
    const p = tile(0);
    p.fill(82, 145, 54, 11);
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(p.rand() * 14);
      const y = Math.floor(p.rand() * 14);
      const c = p.rand() > 0.45 ? [113, 170, 67] : [63, 121, 46];
      p.rect(x, y, 2 + Math.floor(p.rand() * 2), 1 + Math.floor(p.rand() * 2), ...c);
      p.set(x + 1, y + 1, 137, 184, 78);
    }
    p.speckle(12, 64, 91, 44);
    p.speckle(8, 150, 187, 87);
    drawTile(0, p);
  }
  // 1 Grass side: irregular grass edge with a dark dirt/root boundary.
  {
    const p = tile(1);
    p.fill(126, 82, 54, 8);
    p.speckle(12, 94, 57, 38);
    p.speckle(8, 157, 112, 70);
    for (let x = 0; x < 16; x++) {
      const h = 3 + Math.floor(p.rand() * 3);
      for (let y = 0; y < h; y++) {
        const variation = (p.rand() - 0.5) * 16;
        p.set(x, y, 78 + variation, 143 + variation, 48 + variation);
      }
      p.set(x, h, 72, 105, 42);
      if (p.rand() > 0.72) p.set(x, h + 1, 96, 62, 40);
    }
    drawTile(1, p);
  }
  // 2 Stone: cool, grainy surface with fine cracks and light flecks.
  {
    const p = tile(2);
    p.fill(117, 123, 126, 6);
    p.speckle(16, 94, 101, 105);
    p.speckle(10, 151, 155, 153);
    const cracks = [[2, 4], [10, 2], [6, 11], [13, 9]];
    for (const [x, y] of cracks) {
      p.set(x, y, 82, 89, 92);
      p.set(x + 1, y + 1, 89, 96, 99);
      p.set(x + 2, y + 1, 147, 151, 150);
    }
    drawTile(2, p);
  }
  // 3 Dirt: dark crumbs, warm clay patches, and occasional bright grains.
  {
    const p = tile(3);
    p.fill(126, 83, 55, 7);
    p.speckle(20, 92, 57, 39);
    p.speckle(12, 158, 111, 67);
    for (let i = 0; i < 5; i++) {
      const x = 1 + Math.floor(p.rand() * 13);
      const y = 1 + Math.floor(p.rand() * 13);
      p.set(x, y, 103, 65, 43);
      p.set(x + 1, y, 145, 96, 60);
    }
    drawTile(3, p);
  }
  // 4 Cobblestone: distinct beveled stones with dark seams.
  {
    const p = tile(4);
    drawCobblePattern(p, [112, 115, 114]);
    drawTile(4, p);
  }
  // 5 Bedrock
  {
    const p = tile(5);
    p.fill(70, 70, 70, 18);
    p.speckle(24, 40, 40, 40);
    p.speckle(14, 105, 105, 105);
    drawTile(5, p);
  }
  // 6 Sand: fine, warm grain with occasional darker mineral particles.
  {
    const p = tile(6);
    p.fill(221, 204, 151, 6);
    p.speckle(18, 194, 174, 119);
    p.speckle(14, 239, 225, 180);
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(p.rand() * 15);
      const y = Math.floor(p.rand() * 15);
      p.set(x, y, 177, 153, 103);
      p.set(x + 1, y, 233, 216, 165);
    }
    drawTile(6, p);
  }
  // 7 Gravel: rounded pebbles of varying brightness instead of random squares.
  {
    const p = tile(7);
    p.fill(105, 103, 99, 6);
    for (let i = 0; i < 13; i++) {
      const x = Math.floor(p.rand() * 13);
      const y = Math.floor(p.rand() * 13);
      const c = 99 + Math.floor(p.rand() * 47);
      p.set(x + 1, y, c + 8, c + 6, c + 3);
      p.rect(x, y + 1, 2 + Math.floor(p.rand() * 2), 2, c, c - 3, c - 7);
      p.set(x + 1, y + 2, c - 14, c - 15, c - 16);
    }
    drawTile(7, p);
  }
  // 8 Sandstone top: calm slab with bright sediment layers and fossil pixels.
  {
    const p = tile(8);
    p.fill(216, 194, 139, 6);
    for (let i = 0; i < 3; i++) {
      const x = 1 + Math.floor(p.rand() * 12);
      const y = 2 + Math.floor(p.rand() * 11);
      p.rect(x, y, 2 + Math.floor(p.rand() * 3), 1, 189, 166, 113);
      p.set(x + 1, y + 1, 235, 218, 169);
    }
    drawTile(8, p);
  }
  // 9 Sandstone side: staggered, clearly defined sediment blocks.
  {
    const p = tile(9);
    p.fill(218, 196, 141, 5);
    for (let y = 0; y < 16; y += 5) {
      p.rect(0, y, 16, 1, 177, 155, 112);
      const offset = (y / 5) % 2 === 0 ? 3 : 11;
      p.rect(offset, y, 1, 5, 184, 160, 114);
      p.rect(offset + 8 > 15 ? offset - 8 : offset + 8, y, 1, 5, 184, 160, 114);
      p.rect(1, y + 1, 3, 1, 237, 218, 164);
    }
    drawTile(9, p);
  }
  // 10 Sandstone bottom
  {
    const p = tile(10);
    p.fill(206, 192, 145, 8);
    drawTile(10, p);
  }
  // 11 Clay
  {
    const p = tile(11);
    p.fill(160, 160, 170, 8);
    p.speckle(16, 145, 145, 155);
    drawTile(11, p);
  }
  // 12 Snow top
  {
    const p = tile(12);
    p.fill(242, 246, 252, 6);
    p.speckle(10, 228, 234, 244);
    drawTile(12, p);
  }
  // 13 Snow side
  {
    const p = tile(13);
    p.fill(134, 96, 67, 10);
    for (let x = 0; x < 16; x++) {
      const h = 3 + Math.floor(p.rand() * 2);
      for (let y = 0; y < h; y++) p.set(x, y, 240, 244, 250);
    }
    drawTile(13, p);
  }
  // 14 Ice
  {
    const p = tile(14);
    p.fill(160, 196, 236, 8);
    p.speckle(14, 180, 212, 246);
    p.rect(4, 2, 1, 12, 190, 215, 245);
    p.rect(10, 4, 1, 10, 190, 215, 245);
    drawTile(14, p);
  }
  // 15 Obsidian
  {
    const p = tile(15);
    p.fill(28, 20, 40, 10);
    p.speckle(20, 50, 35, 80);
    p.speckle(10, 15, 10, 28);
    drawTile(15, p);
  }
  // 16 Water (also animated as a standalone texture)
  {
    const p = tile(16);
    p.fill(52, 108, 202, 10);
    p.speckle(20, 70, 130, 220);
    p.rect(2, 3, 6, 1, 90, 150, 225);
    p.rect(8, 9, 5, 1, 90, 150, 225);
    drawTile(16, p);
  }
  // 17 Lava
  {
    const p = tile(17);
    p.fill(206, 92, 20, 16);
    p.speckle(22, 240, 160, 40);
    p.speckle(16, 150, 40, 10);
    p.rect(3, 5, 8, 2, 250, 190, 60);
    drawTile(17, p);
  }
  // ---- Ores: dark veins, outlined deposits, and small highlights. ----
  const oreTile = (index, r, g, b) => {
    const p = tile(index);
    p.fill(111, 117, 119, 7);
    p.speckle(18, 91, 98, 101);
    p.speckle(8, 147, 151, 150);
    for (let i = 0; i < 5; i++) {
      const x = 1 + Math.floor(p.rand() * 12);
      const y = 1 + Math.floor(p.rand() * 12);
      const w = 2 + Math.floor(p.rand() * 2);
      const h = 2 + Math.floor(p.rand() * 2);
      p.rect(x - 1, y, w + 1, h, clamp255(r * 0.48), clamp255(g * 0.48), clamp255(b * 0.48));
      p.rect(x, y, w, h - 1, r, g, b);
      p.set(x + 1, y, clamp255(r * 1.18), clamp255(g * 1.18), clamp255(b * 1.18));
      p.set(x + w - 1, y + h - 1, clamp255(r * 0.78), clamp255(g * 0.78), clamp255(b * 0.78));
    }
    drawTile(index, p);
  };
  oreTile(18, 28, 28, 30);      // Coal
  oreTile(19, 216, 175, 147);   // Iron
  oreTile(20, 250, 220, 80);    // Gold
  oreTile(21, 95, 220, 215);    // Diamond
  oreTile(22, 220, 40, 40);     // Redstone

  // ---- Wood ---------------------------------------------------------------
  // 23 Log side (oak)
  {
    const p = tile(23);
    p.fill(104, 82, 50, 8);
    for (let x = 0; x < 16; x += 3) {
      const c = 88 + p.rand() * 24;
      p.rect(x, 0, 1, 16, c, c * 0.78, c * 0.5);
    }
    drawTile(23, p);
  }
  // 24 Log top (growth rings)
  {
    const p = tile(24);
    p.fill(160, 130, 82, 8);
    for (let r = 6; r > 0; r -= 2) {
      for (let a = 0; a < 64; a++) {
        const x = Math.round(8 + Math.cos((a / 64) * Math.PI * 2) * r);
        const y = Math.round(8 + Math.sin((a / 64) * Math.PI * 2) * r);
        p.set(x, y, 130, 104, 62);
      }
    }
    drawTile(24, p);
  }
  // 25 Oak leaves (opaque like Minecraft "fast graphics")
  {
    const p = tile(25);
    p.fill(56, 122, 46, 16);
    p.speckle(30, 40, 96, 34);
    p.speckle(18, 84, 152, 62);
    drawTile(25, p);
  }
  // 26 Birch log side
  {
    const p = tile(26);
    p.fill(222, 222, 216, 8);
    for (let y = 1; y < 16; y += 3) {
      const w = 3 + Math.floor(p.rand() * 5);
      p.rect(Math.floor(p.rand() * 12), y, w, 1, 40, 36, 32);
    }
    drawTile(26, p);
  }
  // 27 Birch log top
  {
    const p = tile(27);
    p.fill(206, 194, 160, 8);
    drawTile(27, p);
  }
  // 28 Birch leaves
  {
    const p = tile(28);
    p.fill(84, 142, 58, 16);
    p.speckle(26, 62, 116, 44);
    p.speckle(16, 106, 166, 76);
    drawTile(28, p);
  }
  // 29 Spruce log side
  {
    const p = tile(29);
    p.fill(74, 52, 32, 8);
    for (let x = 0; x < 16; x += 3) p.rect(x, 0, 1, 16, 58, 40, 24);
    drawTile(29, p);
  }
  // 30 Spruce log top
  {
    const p = tile(30);
    p.fill(120, 92, 56, 8);
    drawTile(30, p);
  }
  // 31 Spruce leaves
  {
    const p = tile(31);
    p.fill(40, 88, 50, 16);
    p.speckle(28, 28, 66, 38);
    p.speckle(14, 60, 114, 64);
    drawTile(31, p);
  }
  // 32 Planks: warmly grained boards with varied wood patterns and knots.
  {
    const p = tile(32);
    p.fill(176, 136, 78, 6);
    for (let y = 0; y < 16; y += 4) {
      p.rect(0, y, 16, 1, 129, 95, 54);
      const knotX = 2 + Math.floor(p.rand() * 11);
      p.set(knotX, y + 2, 123, 82, 43);
      p.set(knotX + 1, y + 2, 204, 164, 103);
      p.rect(1, y + 1, 2 + Math.floor(p.rand() * 3), 1, 194, 157, 94);
      p.rect(10 + Math.floor(p.rand() * 3), y + 3, 3, 1, 151, 111, 59);
    }
    drawTile(32, p);
  }
  // 33 Sapling
  {
    const p = tile(33);
    p.clear();
    p.rect(7, 8, 2, 7, 110, 82, 48);
    p.rect(4, 5, 3, 2, 62, 130, 52);
    p.rect(9, 4, 3, 2, 72, 148, 62);
    p.rect(5, 8, 2, 2, 58, 120, 48);
    p.rect(9, 7, 2, 2, 80, 158, 70);
    drawTile(33, p);
  }
  // 34 Bookshelf side
  {
    const p = tile(34);
    p.fill(178, 143, 88, 6);
    const colors = [[180, 60, 50], [70, 110, 170], [200, 180, 70], [90, 150, 80], [150, 80, 150]];
    for (let row = 0; row < 2; row++) {
      for (let x = 1; x < 15; x += 3) {
        const c = colors[Math.floor(p.rand() * colors.length)];
        p.rect(x, 2 + row * 7, 2, 5, c[0], c[1], c[2]);
      }
      p.rect(0, 7 + row * 7 - 1, 16, 1, 148, 116, 68);
    }
    drawTile(34, p);
  }
  // 35 Poppy
  {
    const p = tile(35);
    p.clear();
    p.rect(7, 8, 2, 7, 52, 120, 44);
    p.rect(5, 3, 6, 5, 210, 48, 42);
    p.set(7, 5, 240, 90, 80); p.set(8, 4, 240, 90, 80);
    p.rect(6, 2, 4, 1, 220, 60, 52);
    drawTile(35, p);
  }
  // 36 Yellow flower
  {
    const p = tile(36);
    p.clear();
    p.rect(7, 8, 2, 7, 52, 120, 44);
    p.rect(5, 3, 6, 5, 230, 210, 60);
    p.set(7, 5, 200, 160, 40);
    drawTile(36, p);
  }
  // 37 Tall grass
  {
    const p = tile(37);
    p.clear();
    for (let x = 2; x < 15; x += 2) {
      const h = 6 + Math.floor(p.rand() * 8);
      const c = 60 + p.rand() * 40;
      for (let y = 16 - h; y < 16; y++) p.set(x + (y % 3 === 0 ? 1 : 0), y, c * 0.85, c * 1.7, c * 0.55);
    }
    drawTile(37, p);
  }
  // 38 Red mushroom
  {
    const p = tile(38);
    p.clear();
    p.rect(7, 8, 2, 6, 230, 226, 210);
    p.rect(4, 5, 8, 4, 200, 52, 46);
    p.set(6, 6, 240, 240, 236); p.set(10, 6, 240, 240, 236);
    drawTile(38, p);
  }
  // 39 (placeholder—old wheat stage)
  {
    const p = tile(39);
    p.clear();
    drawTile(39, p);
  }
  // 40/41 Cactus
  {
    const p = tile(40);
    p.fill(58, 128, 52, 10);
    for (let y = 0; y < 16; y += 3) {
      p.set(2 + (y % 6 === 0 ? 1 : 0), y, 30, 90, 36);
      p.set(12, y + 1, 30, 90, 36);
    }
    p.rect(0, 0, 1, 16, 40, 96, 40);
    p.rect(15, 0, 1, 16, 40, 96, 40);
    drawTile(40, p);
    const q = tile(41);
    q.fill(72, 142, 62, 10);
    q.rect(3, 3, 10, 10, 60, 126, 52);
    drawTile(41, q);
  }
  // 42 Sugar cane
  {
    const p = tile(42);
    p.clear();
    for (let x = 5; x < 11; x++) {
      for (let y = 0; y < 16; y++) {
        const v = y % 5 === 0 ? 20 : 0;
        p.set(x, y, 128 + v, 190 + v, 92 + v);
      }
    }
    drawTile(42, p);
  }
  // 43 Glass
  {
    const p = tile(43);
    p.clear();
    for (let i = 0; i < 16; i++) {
      p.set(i, 0, 235, 245, 250); p.set(i, 15, 235, 245, 250);
      p.set(0, i, 235, 245, 250); p.set(15, i, 235, 245, 250);
    }
    p.rect(3, 3, 4, 1, 255, 255, 255, 180);
    p.rect(3, 4, 1, 3, 255, 255, 255, 180);
    drawTile(43, p);
  }
  // 44 Wool
  {
    const p = tile(44);
    p.fill(232, 232, 232, 8);
    p.speckle(16, 214, 214, 214);
    drawTile(44, p);
  }
  // 45 Bricks: warm, staggered bricks with dark mortar and light edges.
  {
    const p = tile(45);
    p.fill(155, 75, 59, 5);
    for (let y = 0; y < 16; y += 4) {
      p.rect(0, y, 16, 1, 89, 55, 47);
      const offset = (y / 4) % 2 === 0 ? 3 : 11;
      for (const x of [offset, offset + 8 > 15 ? offset - 8 : offset + 8]) {
        p.rect(x, y + 1, 1, 3, 104, 60, 48);
        p.rect(x + 1, y + 1, 2, 1, 183, 102, 78);
      }
      p.rect(1, y + 1, 4, 1, 183, 102, 78);
    }
    drawTile(45, p);
  }
  // 46 Stone bricks: hewn blocks with fine bright top edges.
  {
    const p = tile(46);
    p.fill(111, 116, 116, 5);
    p.rect(0, 7, 16, 1, 65, 70, 71);
    p.rect(7, 0, 1, 7, 76, 81, 81);
    p.rect(3, 8, 1, 8, 76, 81, 81);
    p.rect(11, 8, 1, 8, 76, 81, 81);
    p.rect(1, 1, 5, 1, 145, 149, 146);
    p.rect(9, 9, 2, 1, 140, 145, 142);
    drawTile(46, p);
  }
  // 47 Mossy cobblestone: the same masonry interspersed with irregular moss patches.
  {
    const p = tile(47);
    drawCobblePattern(p, [105, 111, 102], true);
    p.speckle(9, 73, 133, 71);
    drawTile(47, p);
  }
  // 48 Farmland top (moist)
  {
    const p = tile(48);
    p.fill(92, 62, 40, 8);
    for (let y = 1; y < 16; y += 3) p.rect(0, y, 16, 1, 70, 46, 28);
    drawTile(48, p);
  }
  // 49 Farmland side
  {
    const p = tile(49);
    p.fill(134, 96, 67, 10);
    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 2; y++) {
        const v = (p.rand() - 0.5) * 16;
        p.set(x, y, 92 + v, 158 + v, 64 + v);
      }
    }
    p.rect(0, 2, 16, 2, 100, 70, 46);
    drawTile(49, p);
  }
  // 50 Ladder
  {
    const p = tile(50);
    p.clear();
    p.rect(2, 0, 2, 16, 150, 118, 70);
    p.rect(12, 0, 2, 16, 150, 118, 70);
    for (let y = 2; y < 16; y += 4) p.rect(2, y, 12, 1, 170, 138, 84);
    drawTile(50, p);
  }
  // 51 Torch
  {
    const p = tile(51);
    p.clear();
    p.rect(7, 6, 2, 10, 150, 112, 62);
    p.rect(6, 3, 4, 4, 250, 190, 60);
    p.set(7, 2, 255, 240, 140); p.set(8, 2, 255, 240, 140);
    p.set(7, 4, 255, 120, 30); p.set(8, 5, 255, 120, 30);
    drawTile(51, p);
  }
  // 52 Crafting table side
  {
    const p = tile(52);
    p.fill(178, 143, 88, 8);
    p.rect(0, 0, 16, 4, 150, 116, 68);
    p.rect(1, 1, 6, 2, 110, 82, 48);
    p.rect(9, 1, 6, 2, 110, 82, 48);
    p.rect(1, 5, 14, 1, 120, 90, 54);
    drawTile(52, p);
  }
  // 53 Furnace top/side
  {
    const p = tile(53);
    p.fill(110, 110, 110, 10);
    p.speckle(18, 95, 95, 95);
    drawTile(53, p);
  }
  // 54 Furnace front
  {
    const p = tile(54);
    p.fill(110, 110, 110, 10);
    p.rect(3, 6, 10, 8, 40, 40, 40);
    p.rect(5, 9, 6, 4, 220, 120, 40);
    p.set(6, 10, 250, 180, 70); p.set(8, 11, 250, 180, 70);
    drawTile(54, p);
  }
  // 55/56 Chest
  {
    const p = tile(55);
    p.fill(160, 116, 62, 8);
    p.rect(0, 0, 16, 2, 120, 86, 42);
    drawTile(55, p);
    const q = tile(56);
    q.fill(160, 116, 62, 8);
    q.rect(0, 6, 16, 1, 90, 64, 32);
    q.rect(7, 5, 2, 4, 210, 200, 170);
    drawTile(56, q);
  }
  // ---- Items (16x16 Icons) -------------------------------------------------
  const itemIcon = (index, fn) => {
    const p = tile(index);
    p.clear();
    fn(p);
    drawTile(index, p);
  };
  itemIcon(57, (p) => { // Stick
    for (let i = 0; i < 9; i++) {
      p.set(4 + i, 11 - i, 150, 112, 62);
      p.set(5 + i, 11 - i, 120, 88, 48);
    }
  });
  itemIcon(58, (p) => { // Coal
    p.rect(5, 5, 6, 6, 30, 30, 32);
    p.rect(6, 4, 4, 1, 30, 30, 32);
    p.set(7, 6, 70, 70, 74); p.set(9, 8, 70, 70, 74);
    p.rect(4, 7, 1, 2, 30, 30, 32); p.rect(11, 6, 1, 3, 30, 30, 32);
  });
  itemIcon(101, (p) => { // Charcoal
    p.rect(5, 4, 6, 8, 48, 34, 25);
    p.rect(6, 5, 4, 6, 88, 56, 34);
    p.set(7, 6, 150, 90, 48); p.set(9, 9, 128, 72, 38);
    p.set(5, 7, 38, 30, 26); p.set(11, 8, 38, 30, 26);
  });
  itemIcon(59, (p) => { // Iron ingot
    p.rect(3, 8, 10, 4, 216, 216, 220);
    p.rect(4, 6, 8, 2, 235, 235, 238);
    p.rect(5, 7, 3, 1, 255, 255, 255);
  });
  itemIcon(60, (p) => { // Gold ingot
    p.rect(3, 8, 10, 4, 240, 200, 60);
    p.rect(4, 6, 8, 2, 250, 220, 90);
    p.rect(5, 7, 3, 1, 255, 245, 160);
  });
  itemIcon(61, (p) => { // Diamond
    p.rect(5, 4, 6, 2, 100, 230, 225);
    p.rect(4, 6, 8, 3, 80, 210, 210);
    p.rect(5, 9, 6, 2, 60, 180, 190);
    p.rect(6, 11, 4, 1, 40, 150, 165);
    p.set(6, 5, 220, 255, 255); p.set(7, 7, 220, 255, 255);
  });
  itemIcon(62, (p) => { // Redstone
    p.rect(6, 5, 3, 3, 200, 30, 30);
    p.rect(4, 8, 3, 3, 170, 20, 20);
    p.rect(8, 9, 3, 2, 230, 50, 50);
    p.set(7, 6, 255, 120, 120);
  });
  itemIcon(63, (p) => { // Seeds
    p.set(5, 6, 90, 150, 60); p.set(6, 7, 90, 150, 60);
    p.set(9, 5, 110, 170, 70); p.set(10, 6, 110, 170, 70);
    p.set(6, 10, 80, 130, 50); p.set(9, 10, 80, 130, 50);
  });
  itemIcon(64, (p) => { // Wheat item
    for (let i = 0; i < 8; i++) {
      p.set(7, 13 - i, 200, 180, 80);
      p.set(6, 12 - i, 220, 200, 100);
      p.set(8, 12 - i, 220, 200, 100);
    }
  });
  itemIcon(65, (p) => { // Leather
    p.rect(4, 5, 8, 6, 180, 110, 60);
    p.rect(5, 4, 6, 1, 180, 110, 60);
    p.rect(5, 11, 6, 1, 150, 90, 50);
    p.set(6, 7, 150, 90, 50); p.set(9, 8, 150, 90, 50);
  });
  itemIcon(66, (p) => { // Feather
    for (let i = 0; i < 10; i++) {
      p.set(5 + i, 12 - i, 240, 240, 245);
      p.set(6 + i, 12 - i, 220, 220, 228);
      if (i < 6) p.set(5 + i, 11 - i, 225, 225, 232);
    }
    p.set(4, 13, 120, 120, 130);
  });
  itemIcon(67, (p) => { // Bone
    p.rect(4, 7, 8, 2, 235, 232, 220);
    p.rect(3, 6, 2, 2, 235, 232, 220); p.rect(3, 9, 2, 2, 235, 232, 220);
    p.rect(11, 6, 2, 2, 235, 232, 220); p.rect(11, 9, 2, 2, 235, 232, 220);
  });
  itemIcon(68, (p) => { // Bone meal
    p.rect(5, 5, 6, 8, 235, 235, 230);
    p.rect(6, 4, 4, 1, 235, 235, 230);
    p.speckle(10, 200, 200, 195);
  });
  itemIcon(69, (p) => { // Apple
    p.rect(5, 6, 6, 6, 210, 40, 40);
    p.rect(4, 7, 1, 4, 210, 40, 40); p.rect(11, 7, 1, 4, 210, 40, 40);
    p.rect(7, 4, 1, 2, 100, 70, 40);
    p.set(6, 7, 240, 90, 90); p.set(7, 7, 240, 90, 90);
  });
  itemIcon(70, (p) => { // Bread
    p.rect(3, 6, 10, 5, 190, 130, 70);
    p.rect(4, 5, 8, 1, 210, 150, 85);
    p.rect(5, 7, 2, 1, 150, 100, 55); p.rect(9, 8, 2, 1, 150, 100, 55);
  });
  const meatIcon = (index, r, g, b, cooked) => {
    itemIcon(index, (p) => {
      p.rect(4, 5, 8, 7, r, g, b);
      p.rect(5, 4, 6, 1, r, g, b);
      p.rect(3, 7, 1, 3, r, g, b);
      if (cooked) {
        p.rect(6, 7, 4, 1, clamp255(r * 0.75), clamp255(g * 0.7), clamp255(b * 0.7));
        p.rect(7, 9, 3, 1, clamp255(r * 0.75), clamp255(g * 0.7), clamp255(b * 0.7));
      } else {
        p.set(6, 6, clamp255(r * 1.2), clamp255(g * 1.15), clamp255(b * 1.1));
        p.rect(6, 8, 3, 2, clamp255(r * 1.12), clamp255(g * 1.1), clamp255(b * 1.05));
      }
    });
  };
  meatIcon(71, 235, 140, 145, false);  // Raw pork
  meatIcon(72, 200, 130, 95, true);    // Cooked pork
  meatIcon(73, 220, 90, 85, false);    // Raw beef
  meatIcon(74, 160, 85, 60, true);     // Steak
  meatIcon(75, 235, 175, 150, false);  // Raw chicken
  meatIcon(76, 200, 150, 110, true);   // Cooked chicken

  // Tool icons
  const toolIcon = (index, headR, headG, headB, stickDark) => {
    itemIcon(index, (p) => {
      for (let i = 0; i < 8; i++) {
        p.set(4 + i, 12 - i, stickDark ? 110 : 150, stickDark ? 82 : 112, 48);
        p.set(5 + i, 12 - i, stickDark ? 90 : 120, stickDark ? 64 : 88, 40);
      }
      return p;
    });
  };
  const pickIcon = (index, r, g, b, dk) => {
    itemIcon(index, (p) => {
      for (let i = 0; i < 8; i++) {
        p.set(5 + i, 12 - i, dk ? 110 : 150, dk ? 82 : 112, 48);
      }
      p.rect(3, 3, 2, 2, r, g, b); p.rect(5, 2, 6, 2, r, g, b); p.rect(11, 3, 2, 2, r, g, b);
      p.set(6, 3, clamp255(r * 1.2), clamp255(g * 1.2), clamp255(b * 1.2));
    });
  };
  const axeIcon = (index, r, g, b, dk) => {
    itemIcon(index, (p) => {
      for (let i = 0; i < 9; i++) {
        p.set(4 + i, 13 - i, dk ? 110 : 150, dk ? 82 : 112, 48);
      }
      p.rect(6, 2, 5, 5, r, g, b);
      p.rect(5, 3, 1, 3, r, g, b);
      p.set(7, 3, clamp255(r * 1.2), clamp255(g * 1.2), clamp255(b * 1.2));
    });
  };
  const shovelIcon = (index, r, g, b, dk) => {
    itemIcon(index, (p) => {
      for (let i = 0; i < 9; i++) {
        p.set(4 + i, 13 - i, dk ? 110 : 150, dk ? 82 : 112, 48);
      }
      p.rect(10, 2, 3, 4, r, g, b);
      p.set(11, 3, clamp255(r * 1.2), clamp255(g * 1.2), clamp255(b * 1.2));
    });
  };
  const swordIcon = (index, r, g, b, dk) => {
    itemIcon(index, (p) => {
      for (let i = 0; i < 6; i++) {
        p.set(4 + i, 12 - i, dk ? 110 : 150, dk ? 82 : 112, 48);
      }
      p.rect(3, 10, 3, 2, dk ? 110 : 150, dk ? 82 : 112, 48);
      for (let i = 0; i < 8; i++) {
        p.set(6 + i, 9 - i, r, g, b);
        p.set(7 + i, 9 - i, clamp255(r * 1.15), clamp255(g * 1.15), clamp255(b * 1.15));
      }
    });
  };
  const matColors = {
    wood: [170, 130, 75], stone: [130, 130, 130], iron: [216, 216, 220], diamond: [90, 220, 215],
  };
  pickIcon(77, ...matColors.wood, false); pickIcon(78, ...matColors.stone, true);
  pickIcon(79, ...matColors.iron, true); pickIcon(80, ...matColors.diamond, true);
  axeIcon(81, ...matColors.wood, false); axeIcon(82, ...matColors.stone, true);
  axeIcon(83, ...matColors.iron, true); axeIcon(84, ...matColors.diamond, true);
  shovelIcon(85, ...matColors.wood, false); shovelIcon(86, ...matColors.stone, true);
  shovelIcon(87, ...matColors.iron, true); shovelIcon(88, ...matColors.diamond, true);
  swordIcon(89, ...matColors.wood, false); swordIcon(90, ...matColors.stone, true);
  swordIcon(91, ...matColors.iron, true); swordIcon(92, ...matColors.diamond, true);
  // Hoes (97–100)
  const hoeIcon = (index, r, g, b, dk) => {
    itemIcon(index, (p) => {
      for (let i = 0; i < 9; i++) {
        p.set(4 + i, 13 - i, dk ? 110 : 150, dk ? 82 : 112, 48);
      }
      p.rect(8, 2, 6, 2, r, g, b);
      p.rect(7, 3, 1, 2, r, g, b);
      p.set(10, 3, clamp255(r * 1.2), clamp255(g * 1.2), clamp255(b * 1.2));
    });
  };
  hoeIcon(97, ...matColors.wood, false); hoeIcon(98, ...matColors.stone, true);
  hoeIcon(99, ...matColors.iron, true); hoeIcon(100, ...matColors.diamond, true);

  // 93–96 Wheat growth stages
  {
    const stages = [
      { h: 4, c: [120, 170, 70] },
      { h: 7, c: [150, 180, 70] },
      { h: 11, c: [190, 190, 80] },
      { h: 15, c: [215, 195, 95] },
    ];
    stages.forEach((st, si) => {
      const p = tile(93 + si);
      p.clear();
      for (let x = 2; x < 15; x += 3) {
        for (let y = 16 - st.h; y < 16; y++) {
          const t = (y / 16) * 0.3;
          p.set(x, y, st.c[0] * (1 - t), st.c[1] * (1 - t), st.c[2] * (1 - t));
          if (si === 3 && y % 4 === 0) p.set(x + 1, y, 230, 210, 110);
        }
      }
      drawTile(93 + si, p);
    });
  }

  return { pixels, size: ATLAS_SIZE };
}

/** Create the atlas canvas (browser only). */
export function createAtlasCanvas(seed = 1337) {
  const { pixels, size } = generateAtlasData(seed);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  img.data.set(pixels);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Draw an item/block icon into a target canvas (for HUD/inventory). */
export function drawTileIcon(targetCanvas, tileIndex, atlasCanvas) {
  const ctx = targetCanvas.getContext('2d');
  ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  ctx.imageSmoothingEnabled = false;
  const sx = (tileIndex % ATLAS_COLS) * TILE_SIZE;
  const sy = Math.floor(tileIndex / ATLAS_COLS) * TILE_SIZE;
  ctx.drawImage(atlasCanvas, sx, sy, TILE_SIZE, TILE_SIZE, 0, 0, targetCanvas.width, targetCanvas.height);
}

/** Standalone water texture (animatable four-frame strip). */
export function createWaterTexture() {
  const frames = 4;
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE * frames;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d');
  for (let f = 0; f < frames; f++) {
    const p = makeTilePainter(200 + f, 4242);
    p.fill(37, 99, 184, 6);
    p.speckle(9, 31, 83, 160);
    // Broken horizontal light waves shift from frame to frame.
    for (let x = 0; x < TILE_SIZE; x += 2) {
      const waveY = (Math.floor(5 + Math.sin((x + f * 3) * 0.52) * 3) + TILE_SIZE) % TILE_SIZE;
      p.rect(x, waveY, 2, 1, 111, 177, 234);
      p.set(x + 1, waveY + 1, 71, 139, 211);
    }
    for (let i = 0; i < 3; i++) {
      const x = Math.floor(p.rand() * 14);
      const y = Math.floor(p.rand() * 13);
      p.rect(x, y, 2 + Math.floor(p.rand() * 3), 1, 73, 142, 211);
    }
    const img = ctx.createImageData(TILE_SIZE, TILE_SIZE);
    img.data.set(p.data);
    ctx.putImageData(img, f * TILE_SIZE, 0);
  }
  return canvas;
}

export function createLavaTexture() {
  const frames = 4;
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE * frames;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d');
  for (let f = 0; f < frames; f++) {
    const p = makeTilePainter(210 + f, 999);
    p.fill(170, 58, 15, 9);
    p.speckle(20, 115, 34, 9);
    // Bright magma currents drift subtly without making the whole surface flicker.
    for (let x = 0; x < TILE_SIZE; x += 4) {
      const y = (Math.floor(4 + Math.sin((x - f * 2) * 0.56) * 3) + TILE_SIZE) % TILE_SIZE;
      p.rect(x, y, 3, 2, 237, 108, 23);
      p.rect(x + 1, y, 2, 1, 255, 190, 67);
      p.set(x + 2, y + 2, 205, 68, 12);
    }
    p.speckle(8, 255, 184, 50);
    const img = ctx.createImageData(TILE_SIZE, TILE_SIZE);
    img.data.set(p.data);
    ctx.putImageData(img, f * TILE_SIZE, 0);
  }
  return canvas;
}
