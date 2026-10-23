// particles.js — Particle system (debris, splashes, smoke, sparks) based on THREE.Points.
import * as THREE from '../../lib/three.module.js';

const MAX_PARTICLES = 800;
const PARTICLE_LIMITS = { high: MAX_PARTICLES, low: 180 };

// Approximate per-block colors for debris particles
export const PARTICLE_COLORS = {
  1: [0.5, 0.5, 0.5],       // Stone
  2: [0.38, 0.63, 0.26],    // Grass
  3: [0.53, 0.38, 0.26],    // Dirt
  4: [0.41, 0.41, 0.41],    // Cobblestone
  5: [0.7, 0.56, 0.35],     // Planks
  7: [0.27, 0.27, 0.27],    // Bedrock
  8: [0.2, 0.42, 0.79],     // Water
  9: [0.81, 0.36, 0.08],    // Lava
  10: [0.86, 0.8, 0.62],    // Sand
  11: [0.5, 0.47, 0.45],    // Gravel
  12: [0.5, 0.5, 0.5],      // Gold ore (stone)
  13: [0.55, 0.5, 0.47],
  14: [0.45, 0.45, 0.45],
  15: [0.48, 0.55, 0.55],
  17: [0.41, 0.32, 0.2],    // Log
  18: [0.24, 0.5, 0.19],    // Leaves
  19: [0.82, 0.9, 0.94],    // Glass
  21: [0.91, 0.91, 0.91],   // Wool
  30: [0.95, 0.96, 0.98],   // Snow
  33: [0.7, 0.56, 0.35],
  35: [0.82, 0.19, 0.16],   // Poppy
};

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.velocities = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.gravity = new Float32Array(MAX_PARTICLES);
    this.count = 0;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geom.setDrawRange(0, 0);
    const mat = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geom, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geometry = geom;
    this.quality = 'high';
    this.maxParticles = MAX_PARTICLES;
  }

  /** Set the particle budget without reallocating the fixed GPU buffer. */
  setQuality(quality) {
    this.quality = quality === 'low' ? 'low' : 'high';
    this.maxParticles = PARTICLE_LIMITS[this.quality];
    if (this.count > this.maxParticles) this.count = this.maxParticles;
    this.geometry.setDrawRange(0, this.count);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    return this.quality;
  }

  /** Spawn a particle. */
  spawn(x, y, z, r, g, b, opts = {}) {
    if (this.count >= this.maxParticles) return;
    const i = this.count++;
    const vel = opts.velocity || {
      x: (Math.random() - 0.5) * (opts.spread ?? 2.5),
      y: Math.random() * (opts.up ?? 2.2),
      z: (Math.random() - 0.5) * (opts.spread ?? 2.5),
    };
    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z;
    this.colors[i * 3] = r;
    this.colors[i * 3 + 1] = g;
    this.colors[i * 3 + 2] = b;
    this.velocities[i * 3] = vel.x;
    this.velocities[i * 3 + 1] = vel.y;
    this.velocities[i * 3 + 2] = vel.z;
    this.life[i] = opts.life ?? (0.5 + Math.random() * 0.6);
    this.maxLife[i] = this.life[i];
    this.gravity[i] = opts.gravity ?? 14;
    this.geometry.setDrawRange(0, this.count);
  }

  /** Block debris particles. */
  blockBreak(x, y, z, blockId, count = 12) {
    const c = PARTICLE_COLORS[blockId] || [0.5, 0.5, 0.5];
    for (let i = 0; i < count; i++) {
      const v = 0.85 + Math.random() * 0.3;
      this.spawn(x + 0.5, y + 0.5, z + 0.5, c[0] * v, c[1] * v, c[2] * v, {
        spread: 3, up: 3, life: 0.5 + Math.random() * 0.5,
      });
    }
  }

  /** Water splashes. */
  splash(x, y, z, count = 8) {
    for (let i = 0; i < count; i++) {
      this.spawn(x, y, z, 0.35, 0.55, 0.9, {
        spread: 2.2, up: 3, life: 0.4 + Math.random() * 0.3, gravity: 12,
      });
    }
  }

  /** Smoke (e.g. torches, burning). */
  smoke(x, y, z, count = 2) {
    for (let i = 0; i < count; i++) {
      this.spawn(
        x + (Math.random() - 0.5) * 0.2, y, z + (Math.random() - 0.5) * 0.2,
        0.35, 0.35, 0.35,
        {
          velocity: { x: (Math.random() - 0.5) * 0.3, y: 0.9 + Math.random() * 0.5, z: (Math.random() - 0.5) * 0.3 },
          life: 0.9 + Math.random() * 0.6, gravity: -1.2,
        }
      );
    }
  }

  /** Flame particles. */
  flame(x, y, z, count = 2) {
    for (let i = 0; i < count; i++) {
      this.spawn(
        x + (Math.random() - 0.5) * 0.25, y, z + (Math.random() - 0.5) * 0.25,
        1, 0.55 + Math.random() * 0.2, 0.1,
        {
          velocity: { x: (Math.random() - 0.5) * 0.4, y: 1.2 + Math.random() * 0.8, z: (Math.random() - 0.5) * 0.4 },
          life: 0.35 + Math.random() * 0.35, gravity: -2,
        }
      );
    }
  }

  /** Hearts (eating/healing). */
  hearts(x, y, z, count = 5) {
    for (let i = 0; i < count; i++) {
      this.spawn(
        x + (Math.random() - 0.5) * 0.6, y + Math.random() * 0.5, z + (Math.random() - 0.5) * 0.6,
        1, 0.25, 0.35,
        {
          velocity: { x: (Math.random() - 0.5) * 0.4, y: 1 + Math.random(), z: (Math.random() - 0.5) * 0.4 },
          life: 0.8, gravity: -3,
        }
      );
    }
  }

  /** Flash on impact. */
  hit(x, y, z, count = 6) {
    for (let i = 0; i < count; i++) {
      this.spawn(x, y, z, 1, 1, 1, {
        spread: 3.2, up: 2.5, life: 0.22, gravity: 2,
      });
    }
  }

  /** Update: physics + aging. */
  update(dt) {
    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // Swap with the last particle
        const last = this.count - 1;
        if (i !== last) {
          for (let k = 0; k < 3; k++) {
            this.positions[i * 3 + k] = this.positions[last * 3 + k];
            this.colors[i * 3 + k] = this.colors[last * 3 + k];
            this.velocities[i * 3 + k] = this.velocities[last * 3 + k];
          }
          this.life[i] = this.life[last];
          this.maxLife[i] = this.maxLife[last];
          this.gravity[i] = this.gravity[last];
        }
        this.count--;
        i--;
        continue;
      }
      this.velocities[i * 3 + 1] -= this.gravity[i] * dt;
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      // (no cumulative fade—particles are short-lived anyway)
    }
    this.geometry.setDrawRange(0, this.count);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  clear() {
    this.count = 0;
    this.geometry.setDrawRange(0, 0);
  }
}
