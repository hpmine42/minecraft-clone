// modules.test.mjs — Import all browser modules (with DOM stubs) to find syntax and import errors.

// Minimaler DOM-/Browser-Stub
const ctxStub = () => new Proxy({}, {
  get(target, prop) {
    if (prop === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
    if (prop === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (prop === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (prop === 'measureText') return () => ({ width: 10 });
    return () => {};
  },
});

const elementStub = () => {
  const el = {
    style: new Proxy({}, { get: () => '', set: () => true }),
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    children: [],
    dataset: {},
    value: '',
    checked: true,
    textContent: '',
    innerHTML: '',
    width: 32,
    height: 32,
    offsetWidth: 100,
    firstChild: { style: {} },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { return c; },
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
    getContext: () => ctxStub(),
    setAttribute() {},
    querySelector: () => elementStub(),
    querySelectorAll: () => [],
    focus() {},
  };
  return el;
};

globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false, addListener() {} }),
  AudioContext: class { createGain() { return { connect: () => ({ connect: () => {} }), gain: { value: 1 } }; } },
  webkitAudioContext: undefined,
};
Object.defineProperty(globalThis, 'navigator', {
  value: { maxTouchPoints: 0, userAgent: 'test-node' },
  configurable: true,
});
globalThis.document = {
  readyState: 'complete',
  getElementById: () => elementStub(),
  createElement: () => elementStub(),
  addEventListener() {},
  removeEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
  hidden: false,
  body: elementStub(),
  documentElement: elementStub(),
};
globalThis.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] ?? null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; },
};
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

let passed = 0;
let failed = 0;

const modules = [
  '../src/world/noise.js',
  '../src/world/blocks.js',
  '../src/world/textures.js',
  '../src/world/chunk.js',
  '../src/world/worldgen.js',
  '../src/world/world.js',
  '../src/entities/particles.js',
  '../src/entities/mobs.js',
  '../src/player/inventory.js',
  '../src/player/furnace.js',
  '../src/player/containers.js',
  '../src/player/player.js',
  '../src/player/interaction.js',
  '../src/core/audio.js',
  '../src/core/input.js',
  '../src/core/touch.js',
  '../src/core/engine.js',
  '../src/ui/hud.js',
  '../src/ui/block-outline.js',
  '../src/ui/menu-preview.js',
  '../src/ui/menus.js',
  '../src/ui/debug.js',
  '../src/ui/selftest.js',
  '../src/save/storage.js',
];

for (const m of modules) {
  try {
    await import(m);
    passed++;
    console.log(`✔ ${m}`);
  } catch (e) {
    failed++;
    console.error(`✘ ${m}: ${e.message}`);
    if (e.stack) console.error(e.stack.split('\n').slice(0, 4).join('\n'));
  }
}

// Check main.js separately (starts the game loop) for syntax/imports only
try {
  const src = await import('node:fs').then((fs) => fs.promises.readFile(new URL('../src/main.js', import.meta.url), 'utf8'));
  // Extract imports and verify that every path exists
  const importPaths = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
  const fs2 = await import('node:fs');
  const path = await import('node:path');
  const baseDir = path.dirname(new URL('../src/main.js', import.meta.url).pathname);
  for (const p of importPaths) {
    const full = path.resolve(baseDir, p);
    if (!fs2.existsSync(full)) {
      failed++;
      console.error(`✘ main.js: import not found: ${p}`);
    }
  }
  passed++;
  console.log('✔ src/main.js (imports)');
} catch (e) {
  failed++;
  console.error(`✘ src/main.js: ${e.message}`);
}

console.log(`\n${passed} modules passed, ${failed} failed`);
if (failed > 0) process.exit(1);
