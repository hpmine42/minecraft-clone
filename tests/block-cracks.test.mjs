// block-cracks.test.mjs — Minecraft-style pixel crack stages follow mining progress.
const context = {
  fillStyle: '',
  pixels: [],
  clearRect() { this.pixels = []; },
  fillRect(x, y, width, height) {
    this.pixels.push({ x, y, width, height, color: this.fillStyle });
  },
};
let canvas;
globalThis.document = {
  createElement(name) {
    if (name !== 'canvas') throw new Error(`Unexpected DOM element: ${name}`);
    canvas = {
      width: 0,
      height: 0,
      getContext(type) { return type === '2d' ? context : null; },
    };
    return canvas;
  },
};

const { BlockCracks } = await import('../src/ui/block-cracks.js');
let passed = 0;
let failed = 0;
function ok(condition, message) {
  if (condition) passed++;
  else { failed++; console.error(`FAIL: ${message}`); }
}

const scene = {
  children: [],
  add(object) { this.children.push(object); },
  remove(object) { this.children = this.children.filter((entry) => entry !== object); },
};
const cracks = new BlockCracks(scene);
ok(scene.children.includes(cracks.mesh) && !cracks.mesh.visible && cracks.faces.length === 6,
  'Crack overlay starts hidden and covers all six block faces');
ok(canvas.width === 16 && canvas.height === 16
  && cracks.geometry.parameters.width === 1 && cracks.geometry.parameters.height === 1,
  'Crack texture is pixelated and covers an entire block face');
ok(cracks.material.transparent && cracks.material.depthTest && !cracks.material.depthWrite
  && cracks.material.polygonOffset && cracks.texture.magFilter === cracks.texture.minFilter,
  'Pixel cracks are flush with the face, transparent, and depth-tested');

cracks.update({ x: 4, y: 5, z: -2 }, 0.01);
ok(cracks.mesh.visible && cracks.stage === 0 && context.pixels.length > 0,
  'The first pixelated Minecraft crack stage appears when mining starts');
ok(context.pixels.every((pixel) => pixel.width === 1 && pixel.height === 1)
  && context.pixels.some((pixel) => pixel.color.includes('28,28,28'))
  && context.pixels.some((pixel) => pixel.color.includes('112,112,112')),
  'Cracks consist of sharply separated dark and gray pixels');
ok(cracks.mesh.position.x === 4.5 && cracks.mesh.position.y === 5.5 && cracks.mesh.position.z === -1.5,
  'Cracks appear on the block currently being mined');

const stageZeroCore = new Set(context.pixels
  .filter((pixel) => pixel.color.includes('28,28,28'))
  .map((pixel) => `${pixel.x},${pixel.y}`));
const initialCoordinates = [...stageZeroCore].map((pixel) => pixel.split(',').map(Number));
ok(stageZeroCore.size === 3
  && initialCoordinates.every(([x, y]) => x >= 7 && x <= 9 && y >= 7 && y <= 8),
  'Mining starts with exactly three pixels in the center, not in a corner');
cracks.update({ x: 4, y: 5, z: -2 }, 0.68);
const stageSixCore = new Set(context.pixels
  .filter((pixel) => pixel.color.includes('28,28,28'))
  .map((pixel) => `${pixel.x},${pixel.y}`));
ok(cracks.stage === 6 && stageSixCore.size > stageZeroCore.size && stageSixCore.size <= 16
  && [...stageZeroCore].every((pixel) => stageSixCore.has(pixel)),
  'Fixed crack stages add only a few connected pixels without jumps or clutter');
cracks.update({ x: 4, y: 5, z: -2 }, 1);
const finalCorePixels = new Set(context.pixels
  .filter((pixel) => pixel.color.includes('28,28,28'))
  .map((pixel) => `${pixel.x},${pixel.y}`));
const finalCoreCount = finalCorePixels.size;
const finalCoordinates = [...finalCorePixels].map((pixel) => pixel.split(',').map(Number));
const directionalSpread = [
  finalCoordinates.some(([x, y]) => x > 8 && y < 8),
  finalCoordinates.some(([x, y]) => x < 8 && y < 8),
  finalCoordinates.some(([x, y]) => x < 8 && y > 8),
  finalCoordinates.some(([x, y]) => x > 8 && y > 8),
  finalCoordinates.some(([x, y]) => x === 8 && y < 8),
  finalCoordinates.some(([x, y]) => x === 8 && y > 8),
];
ok(cracks.stage === 9 && finalCoreCount <= 24 && directionalSpread.every(Boolean),
  'Cracks branch in several directions while remaining easy to read');
const finalPattern = JSON.stringify(context.pixels);
cracks._drawStage(9);
ok(JSON.stringify(context.pixels) === finalPattern,
  'The same mining stage draws exactly the same pixel pattern on every block');

cracks.update(null, 0.68);
ok(!cracks.mesh.visible, 'Cracks disappear when no block is being mined');
cracks.update({ x: 4, y: 5, z: -2 }, 0);
ok(!cracks.mesh.visible, 'Zero mining progress shows no cracks');

cracks.dispose();
ok(scene.children.length === 0, 'Crack overlay is removed from the scene during cleanup');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
