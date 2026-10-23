// particles.test.mjs — Particle quality limits visible effects without rebuilding GPU buffers.
import { ParticleSystem } from '../src/entities/particles.js';

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
const particles = new ParticleSystem(scene);
const spawnMany = (count) => {
  for (let i = 0; i < count; i++) particles.spawn(i, 0, 0, 1, 1, 1);
};

ok(scene.children.includes(particles.points) && particles.maxParticles === 800,
  'Particle system starts with a large desktop budget and a shared Points mesh');
spawnMany(800);
ok(particles.count === 800 && particles.geometry.drawRange.count === 800,
  'High particle budget uses the existing buffer up to capacity');
particles.setQuality('low');
ok(particles.maxParticles === 180 && particles.count === 180
  && particles.geometry.drawRange.count === 180,
  'Low quality immediately reduces active particles to the mobile budget');
spawnMany(500);
ok(particles.count === 180, 'New particles respect the lower quality limit');
particles.setQuality('high');
spawnMany(620);
ok(particles.count === 800, 'Returning to high quality expands the budget without changing buffers');
particles.setQuality('unknown');
ok(particles.quality === 'high', 'Invalid quality values safely fall back to high quality');
particles.clear();
ok(particles.count === 0 && particles.geometry.drawRange.count === 0,
  'Particles can be cleared without a residual draw range');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
