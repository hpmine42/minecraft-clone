// mobs.js — Animals, zombies, and item drops: behavior, physics, and spawning.
import * as THREE from '../../lib/three.module.js';
import { BLOCK, BLOCKS } from '../world/blocks.js';
import { PLAYER_WIDTH } from '../player/player.js';

// ---------------------------------------------------------------------------
// Shared entity base
// ---------------------------------------------------------------------------
export class Entity {
  constructor(world, x, y, z) {
    this.world = world;
    this.position = { x, y, z };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.yaw = Math.random() * Math.PI * 2;
    this.onGround = false;
    this.dead = false;
    this.width = 0.6;
    this.height = 1.8;
    this.health = 10;
    this.maxHealth = 10;
    this.hurtTime = 0;
    this.age = 0;
    this.group = null;
  }

  collides(px, py, pz) {
    const w = this.width / 2;
    const minX = Math.floor(px - w);
    const maxX = Math.floor(px + w);
    const minY = Math.floor(py);
    const maxY = Math.floor(py + this.height);
    const minZ = Math.floor(pz - w);
    const maxZ = Math.floor(pz + w);
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          const id = this.world.getBlock(x, y, z);
          const def = BLOCKS[id];
          if (def && def.solid) return true;
        }
      }
    }
    return false;
  }

  physicsStep(dt) {
    const pos = this.position;
    const vel = this.velocity;
    const feet = this.world.getBlock(Math.floor(pos.x), Math.floor(pos.y + 0.1), Math.floor(pos.z));
    const inWater = feet === BLOCK.WATER;

    if (inWater) {
      vel.y = Math.max(vel.y - 6 * dt, -3);
      if (this.wantJump) vel.y = 3;
    } else {
      vel.y = Math.max(vel.y - 30 * dt, -50);
    }

    // X
    pos.x += vel.x * dt;
    if (this.collides(pos.x, pos.y, pos.z)) {
      pos.x -= vel.x * dt;
      vel.x = 0;
      this.hitWall = true;
    }
    // Z
    pos.z += vel.z * dt;
    if (this.collides(pos.x, pos.y, pos.z)) {
      pos.z -= vel.z * dt;
      vel.z = 0;
      this.hitWall = true;
    }
    // Y
    pos.y += vel.y * dt;
    if (this.collides(pos.x, pos.y, pos.z)) {
      if (vel.y < 0) {
        this.onGround = true;
        pos.y = Math.floor(pos.y + 0.01) + 1e-4;
        while (this.collides(pos.x, pos.y, pos.z) && pos.y < pos.y + 2) pos.y += 0.02;
      }
      vel.y = 0;
    } else {
      this.onGround = false;
    }
    if (pos.y < -30) this.dead = true;
    return inWater;
  }

  takeDamage(amount, fromDir = null) {
    if (this.dead) return false;
    this.health -= amount;
    this.hurtTime = 0.35;
    if (fromDir) {
      this.velocity.x += fromDir.x * 7;
      this.velocity.z += fromDir.z * 7;
      this.velocity.y += 4.5;
    }
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
    return true;
  }

  dispose(scene) {
    if (this.group) {
      scene.remove(this.group);
      this.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
      this.group = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Mob models
// ---------------------------------------------------------------------------
function makeBox(w, h, d, color) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
}

export class Animal extends Entity {
  constructor(world, x, y, z, type) {
    super(world, x, y, z);
    this.type = type;
    this.passive = true;
    this.fleeTimer = 0;
    this.wanderTimer = 0;
    this.walkPhase = 0;
    this.legSwing = 0;

    const cfg = ANIMAL_CONFIG[type];
    this.width = cfg.width;
    this.height = cfg.height;
    this.health = cfg.health;
    this.maxHealth = cfg.health;
    this.speed = cfg.speed;
    this.group = cfg.build();
  }

  update(dt, player, hooks) {
    this.age += dt;
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    if (this.fleeTimer > 0) this.fleeTimer -= dt;

    // AI: flee from danger, otherwise wander
    const pos = this.position;
    const ppos = player.position;
    const distToPlayer = Math.hypot(pos.x - ppos.x, pos.z - ppos.z);

    let targetVX = 0;
    let targetVZ = 0;

    if (this.fleeTimer > 0 && this.fleeFrom) {
      const dx = pos.x - this.fleeFrom.x;
      const dz = pos.z - this.fleeFrom.z;
      const len = Math.hypot(dx, dz) || 1;
      targetVX = (dx / len) * this.speed * 1.4;
      targetVZ = (dz / len) * this.speed * 1.4;
      this.yaw = Math.atan2(dx, dz);
    } else {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 2 + Math.random() * 5;
        if (Math.random() < 0.55) {
          this.wanderDir = null;
        } else {
          const a = Math.random() * Math.PI * 2;
          this.wanderDir = { x: Math.sin(a), z: Math.cos(a) };
        }
      }
      if (this.wanderDir) {
        targetVX = this.wanderDir.x * this.speed * 0.55;
        targetVZ = this.wanderDir.z * this.speed * 0.55;
        this.yaw = Math.atan2(this.wanderDir.x, this.wanderDir.z);
      }
    }

    // Accelerate smoothly
    this.velocity.x += (targetVX - this.velocity.x) * Math.min(1, dt * 8);
    this.velocity.z += (targetVZ - this.velocity.z) * Math.min(1, dt * 8);

    this.hitWall = false;
    const inWater = this.physicsStep(dt);

    // Jump when blocked
    if (this.hitWall && this.onGround) {
      this.velocity.y = 7.2;
    }
    if (inWater && Math.random() < dt * 2) this.velocity.y = 3;

    // Animation
    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.walkPhase += dt * (2 + hSpeed * 2.2);
    this.legSwing = Math.sin(this.walkPhase) * Math.min(1, hSpeed / 2) * 0.65;

    if (this.group) {
      this.group.position.set(pos.x, pos.y, pos.z);
      this.group.rotation.y = this.yaw;
      // Animate legs
      if (this.legs) {
        this.legs[0].rotation.x = this.legSwing;
        this.legs[1].rotation.x = -this.legSwing;
        this.legs[2].rotation.x = -this.legSwing;
        this.legs[3].rotation.x = this.legSwing;
      }
      if (this.headPart && this.fleeTimer > 0) {
        this.headPart.rotation.x = -0.3;
      } else if (this.headPart) {
        this.headPart.rotation.x = Math.sin(this.walkPhase * 0.4) * 0.1;
      }
    }

    // Eat grass (animation only)
    if (Math.random() < dt * 0.02 && this.headPart) {
      this.headPart.rotation.x = 0.55;
      setTimeout(() => { if (this.headPart) this.headPart.rotation.x = 0; }, 700);
    }
    return distToPlayer;
  }

  onHurt(fromPos) {
    this.fleeTimer = 5;
    this.fleeFrom = { x: fromPos.x, z: fromPos.z };
  }

  getDrops() {
    const cfg = ANIMAL_CONFIG[this.type];
    return cfg && cfg.drops ? cfg.drops() : [];
  }
}

const ANIMAL_CONFIG = {
  pig: {
    width: 0.9, height: 0.9, health: 10, speed: 2.6, color: 0xf0a5a2,
    drops: () => [{ id: BLOCK.PORKCHOP, count: 1 + Math.floor(Math.random() * 2) }],
    sound: 'pig',
    build() {
      const g = new THREE.Group();
      const body = makeBox(0.9, 0.65, 1.25, 0xf0a5a2);
      body.position.y = 0.75;
      const head = makeBox(0.62, 0.55, 0.55, 0xe89b98);
      head.position.set(0, 0.85, 0.78);
      const snout = makeBox(0.3, 0.22, 0.12, 0xd97f7c);
      snout.position.set(0, 0.78, 1.1);
      const ear1 = makeBox(0.14, 0.22, 0.08, 0xe89b98);
      ear1.position.set(-0.22, 1.14, 0.82);
      const ear2 = ear1.clone();
      ear2.position.x = 0.22;
      const legs = [];
      for (const [lx, lz] of [[-0.28, 0.42], [0.28, 0.42], [-0.28, -0.42], [0.28, -0.42]]) {
        const leg = makeBox(0.22, 0.55, 0.22, 0xd88d8a);
        leg.position.set(lx, 0.275, lz);
        legs.push(leg);
        g.add(leg);
      }
      g.add(body, head, snout, ear1, ear2);
      return g;
    },
  },
  cow: {
    width: 0.95, height: 1.35, health: 12, speed: 2.3, color: 0x8a5a3a,
    drops: () => [
      { id: BLOCK.BEEF, count: 1 + Math.floor(Math.random() * 2) },
      { id: BLOCK.LEATHER, count: 0 + Math.floor(Math.random() * 2) },
    ],
    sound: 'cow',
    build() {
      const g = new THREE.Group();
      const body = makeBox(1.0, 1.0, 1.7, 0x8a5a3a);
      body.position.y = 1.15;
      const patch = makeBox(0.7, 0.55, 0.75, 0xf0f0f0);
      patch.position.set(0.18, 1.3, -0.3);
      const head = makeBox(0.62, 0.62, 0.62, 0x7c4f32);
      head.position.set(0, 1.45, 1.05);
      const horn1 = makeBox(0.1, 0.22, 0.1, 0xe8dcc0);
      horn1.position.set(-0.28, 1.82, 1.0);
      const horn2 = horn1.clone();
      horn2.position.x = 0.28;
      const legs = [];
      for (const [lx, lz] of [[-0.32, 0.55], [0.32, 0.55], [-0.32, -0.55], [0.32, -0.55]]) {
        const leg = makeBox(0.26, 0.85, 0.26, 0x6e4530);
        leg.position.set(lx, 0.425, lz);
        legs.push(leg);
        g.add(leg);
      }
      g.add(body, patch, head, horn1, horn2);
      return g;
    },
  },
  sheep: {
    width: 0.9, height: 1.3, health: 10, speed: 2.4, color: 0xe8e8e8,
    drops: () => [{ id: BLOCK.WOOL, count: 1 + Math.floor(Math.random() * 2) }],
    sound: 'sheep',
    build() {
      const g = new THREE.Group();
      const body = makeBox(1.05, 1.0, 1.55, 0xe8e8e8);
      body.position.y = 1.12;
      const head = makeBox(0.52, 0.55, 0.52, 0xd8c8b8);
      head.position.set(0, 1.35, 0.98);
      const ear1 = makeBox(0.16, 0.1, 0.08, 0xd8c8b8);
      ear1.position.set(-0.32, 1.5, 0.95);
      const ear2 = ear1.clone();
      ear2.position.x = 0.32;
      const legs = [];
      for (const [lx, lz] of [[-0.3, 0.5], [0.3, 0.5], [-0.3, -0.5], [0.3, -0.5]]) {
        const leg = makeBox(0.22, 0.75, 0.22, 0xcfcfcf);
        leg.position.set(lx, 0.375, lz);
        legs.push(leg);
        g.add(leg);
      }
      g.add(body, head, ear1, ear2);
      return g;
    },
  },
  chicken: {
    width: 0.5, height: 0.75, health: 6, speed: 2.8, color: 0xf2f2f2,
    drops: () => [
      { id: BLOCK.CHICKEN, count: 1 },
      { id: BLOCK.FEATHER, count: 0 + Math.floor(Math.random() * 2) },
    ],
    sound: 'chicken',
    build() {
      const g = new THREE.Group();
      const body = makeBox(0.5, 0.55, 0.65, 0xf2f2f2);
      body.position.y = 0.55;
      const head = makeBox(0.32, 0.35, 0.32, 0xf2f2f2);
      head.position.set(0, 0.98, 0.32);
      const beak = makeBox(0.14, 0.1, 0.18, 0xf0a028);
      beak.position.set(0, 0.95, 0.56);
      const wattle = makeBox(0.08, 0.12, 0.05, 0xd0342c);
      wattle.position.set(0, 0.82, 0.52);
      const wings = [];
      for (const sx of [-1, 1]) {
        const wing = makeBox(0.12, 0.35, 0.5, 0xe4e4e4);
        wing.position.set(sx * 0.31, 0.6, -0.02);
        wings.push(wing);
        g.add(wing);
      }
      const legs = [];
      for (const [lx, lz] of [[-0.12, 0.08], [0.12, 0.08]]) {
        const leg = makeBox(0.08, 0.3, 0.08, 0xf0a028);
        leg.position.set(lx, 0.15, lz);
        legs.push(leg);
        g.add(leg);
      }
      g.add(body, head, beak, wattle);
      return g;
    },
  },
};

export class Zombie extends Entity {
  constructor(world, x, y, z) {
    super(world, x, y, z);
    this.width = 0.62;
    this.height = 1.9;
    this.health = 20;
    this.maxHealth = 20;
    this.speed = 2.1;
    this.attackCooldown = 0;
    this.burning = false;
    this.walkPhase = 0;
    this.group = this.build();
  }

  build() {
    const g = new THREE.Group();
    const skin = 0x3c7a3c;
    const shirt = 0x2e6b8a;
    const pants = 0x4a3c7a;
    const torso = makeBox(0.62, 0.78, 0.34, shirt);
    torso.position.y = 1.12;
    const head = makeBox(0.55, 0.55, 0.55, skin);
    head.position.y = 1.78;
    const jaw = makeBox(0.35, 0.12, 0.12, 0x2c5c2c);
    jaw.position.set(0, 1.62, 0.28);
    const armL = makeBox(0.22, 0.72, 0.22, skin);
    armL.position.set(-0.43, 1.22, 0.18);
    armL.rotation.x = -Math.PI / 2.25;
    const armR = makeBox(0.22, 0.72, 0.22, skin);
    armR.position.set(0.43, 1.22, 0.18);
    armR.rotation.x = -Math.PI / 2.25;
    const legL = makeBox(0.24, 0.78, 0.24, pants);
    legL.position.set(-0.16, 0.39, 0);
    const legR = makeBox(0.24, 0.78, 0.24, pants);
    legR.position.set(0.16, 0.39, 0);
    g.add(torso, head, jaw, armL, armR, legL, legR);
    this.arms = [armL, armR];
    this.legs = [legL, legR];
    this.headPart = head;
    return g;
  }

  update(dt, player, hooks, worldTime) {
    this.age += dt;
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    const pos = this.position;
    const ppos = player.position;
    const dist = Math.hypot(pos.x - ppos.x, pos.y - ppos.y, pos.z - ppos.z);

    let targetVX = 0;
    let targetVZ = 0;

    // Chase the player (during the day only when Peaceful is off and nearby)
    const hunt = !player.peaceful && !player.dead && dist < 22 && dist > 0.8;
    if (hunt) {
      const dx = ppos.x - pos.x;
      const dz = ppos.z - pos.z;
      const len = Math.hypot(dx, dz) || 1;
      targetVX = (dx / len) * this.speed;
      targetVZ = (dz / len) * this.speed;
      this.yaw = Math.atan2(dx, dz);
    } else {
      this.wanderTimer = (this.wanderTimer || 0) - dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 2.5 + Math.random() * 5;
        this.wanderDir = Math.random() < 0.5
          ? null
          : { x: Math.sin(Math.random() * Math.PI * 2), z: Math.cos(Math.random() * Math.PI * 2) };
      }
      if (this.wanderDir) {
        targetVX = this.wanderDir.x * this.speed * 0.45;
        targetVZ = this.wanderDir.z * this.speed * 0.45;
        this.yaw = Math.atan2(this.wanderDir.x, this.wanderDir.z);
      }
    }

    this.velocity.x += (targetVX - this.velocity.x) * Math.min(1, dt * 7);
    this.velocity.z += (targetVZ - this.velocity.z) * Math.min(1, dt * 7);

    this.hitWall = false;
    const inWater = this.physicsStep(dt);
    if (this.hitWall && this.onGround) this.velocity.y = 7.6;
    if (inWater && Math.random() < dt * 2) this.velocity.y = 3;

    // Attack
    if (hunt && dist < 1.35 && this.attackCooldown <= 0 && !player.dead) {
      this.attackCooldown = 1.1;
      const dmg = 3;
      const hit = player.takeDamage(dmg, 'zombie');
      if (hit && hooks && hooks.onPlayerHurt) hooks.onPlayerHurt(dmg);
      // Knockback
      const dx = ppos.x - pos.x;
      const dz = ppos.z - pos.z;
      const len = Math.hypot(dx, dz) || 1;
      player.velocity.x += (dx / len) * 6;
      player.velocity.z += (dz / len) * 6;
      player.velocity.y += 3.2;
    }

    // Sunlight damage during the day
    const sky = this.world.getSkyLight(Math.floor(pos.x), Math.floor(pos.y + 1), Math.floor(pos.z));
    this.burning = sky >= 15 && worldTime > 0.05 && worldTime < 0.45;
    if (this.burning) {
      this._burnTimer = (this._burnTimer || 0) + dt;
      if (hooks && hooks.onMobBurn) hooks.onMobBurn(this);
      if (this._burnTimer > 1) {
        this._burnTimer = 0;
        this.takeDamage(1);
      }
    }

    // Animation
    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.walkPhase += dt * (2 + hSpeed * 2.4);
    const swing = Math.sin(this.walkPhase) * Math.min(1, hSpeed / 2) * 0.7;
    if (this.legs) {
      this.legs[0].rotation.x = swing;
      this.legs[1].rotation.x = -swing;
    }
    if (this.arms) {
      const armBase = -Math.PI / 2.25;
      this.arms[0].rotation.x = armBase + (hunt ? Math.sin(this.walkPhase * 2) * 0.12 : swing * 0.3);
      this.arms[1].rotation.x = armBase + (hunt ? Math.cos(this.walkPhase * 2) * 0.12 : -swing * 0.3);
    }

    if (this.group) {
      this.group.position.set(pos.x, pos.y, pos.z);
      this.group.rotation.y = this.yaw;
    }
    return dist;
  }

  onHurt(fromPos) {
    // Zombies remain persistent
    this.wanderDir = { x: fromPos.x - this.position.x, z: fromPos.z - this.position.z };
    const len = Math.hypot(this.wanderDir.x, this.wanderDir.z) || 1;
    this.wanderDir.x /= len;
    this.wanderDir.z /= len;
    this.wanderTimer = 3;
  }

  getDrops() {
    const drops = [];
    if (Math.random() < 0.6) drops.push({ id: BLOCK.BONE, count: 1 });
    if (Math.random() < 0.12) drops.push({ id: BLOCK.IRON_INGOT, count: 1 });
    return drops;
  }
}

// ---------------------------------------------------------------------------
// Item entity (dropped items)
// ---------------------------------------------------------------------------
const ITEM_COLORS = {
  [BLOCK.PORKCHOP]: 0xeb8c8c, [BLOCK.COOKED_PORKCHOP]: 0xc88258,
  [BLOCK.BEEF]: 0xc04c48, [BLOCK.COOKED_BEEF]: 0xa06840,
  [BLOCK.CHICKEN]: 0xebb08c, [BLOCK.COOKED_CHICKEN]: 0xc89868,
  [BLOCK.LEATHER]: 0xb4703c, [BLOCK.FEATHER]: 0xf0f0f0,
  [BLOCK.BONE]: 0xe8e4d8, [BLOCK.WOOL]: 0xf0f0f0,
  [BLOCK.APPLE]: 0xd02c2c, [BLOCK.BREAD]: 0xc4904c,
  [BLOCK.COAL]: 0x2a2a2a, [BLOCK.IRON_INGOT]: 0xd8d8dc, [BLOCK.GOLD_INGOT]: 0xf0c83c,
  [BLOCK.DIAMOND]: 0x54dcd4, [BLOCK.REDSTONE]: 0xd02828,
  [BLOCK.STICK]: 0x96603c, [BLOCK.SEEDS]: 0x78a840, [BLOCK.WHEAT_ITEM]: 0xd4b85c,
  [BLOCK.BONE_MEAL]: 0xecece4,
};

export class ItemEntity extends Entity {
  constructor(world, x, y, z, itemId, count = 1, itemData = {}) {
    super(world, x, y, z);
    this.width = 0.25;
    this.height = 0.25;
    this.itemId = itemId;
    this.count = count;
    this.dur = itemData.dur ?? null;
    this.meta = itemData.meta ?? null;
    this.life = 300; // 5 Min
    this.pickupDelay = 0.5;
    this.bobPhase = Math.random() * Math.PI * 2;

    const color = ITEM_COLORS[itemId] ?? 0x888888;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.28, 0.28),
      new THREE.MeshLambertMaterial({ color })
    );
    this.group = new THREE.Group();
    this.group.add(mesh);
    this.mesh = mesh;
  }

  update(dt, player, inventory, hooks) {
    this.age += dt;
    this.life -= dt;
    this.pickupDelay = Math.max(0, this.pickupDelay - dt);
    if (this.life <= 0) {
      this.dead = true;
      return;
    }
    this.velocity.y = Math.max(this.velocity.y - 24 * dt, -40);
    this.physicsStep(dt);

    // Attraction + pickup
    const pos = this.position;
    const ppos = player.position;
    const eyeY = ppos.y + 0.8;
    const dx = ppos.x - pos.x;
    const dy = eyeY - pos.y;
    const dz = ppos.z - pos.z;
    const dist = Math.hypot(dx, dy, dz);

    if (dist < 2.2 && this.pickupDelay <= 0 && !player.dead) {
      // Magnet
      const pull = dist < 1.2 ? 9 : 4.5;
      this.velocity.x += (dx / (dist || 1)) * pull * dt * 8;
      this.velocity.z += (dz / (dist || 1)) * pull * dt * 8;
      if (dy > 0) this.velocity.y += Math.min(6, dy * 3) * dt * 4;

      if (dist < 0.9) {
        const leftover = inventory.add(this.itemId, this.count, this.dur, this.meta);
        if (leftover < this.count) {
          if (hooks && hooks.onPickup) hooks.onPickup(this.itemId, this.count - leftover);
          this.count = leftover;
          if (this.count <= 0) this.dead = true;
        }
      }
    }

    if (this.group) {
      this.bobPhase += dt * 2.2;
      this.group.position.set(pos.x, pos.y + 0.15 + Math.sin(this.bobPhase) * 0.06, pos.z);
      this.mesh.rotation.y += dt * 0.8;
    }
  }
}

// ---------------------------------------------------------------------------
// Mob manager: spawning, updates, and drops
// ---------------------------------------------------------------------------
export class MobManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.mobs = [];
    this.items = [];
    this.spawnTimer = 0;
    this.maxAnimals = 14;
    this.maxMonsters = 8;
  }

  spawnDrops(x, y, z, drops) {
    for (const d of drops) {
      if (!d || !d.count) continue;
      const item = new ItemEntity(this.world, x + 0.5, y + 0.4, z + 0.5, d.id, d.count, d);
      item.velocity.x = (Math.random() - 0.5) * 2.5;
      item.velocity.z = (Math.random() - 0.5) * 2.5;
      item.velocity.y = 2.8;
      this.items.push(item);
      this.scene.add(item.group);
    }
  }

  killMob(mob, fromPos) {
    const drops = typeof mob.getDrops === 'function' ? mob.getDrops() : [];
    this.spawnDrops(mob.position.x, mob.position.y, mob.position.z, drops);
    mob.dead = true;
    mob.dispose(this.scene);
  }

  hurtMob(mob, damage, fromPos) {
    const dir = {
      x: mob.position.x - fromPos.x,
      z: mob.position.z - fromPos.z,
    };
    const len = Math.hypot(dir.x, dir.z) || 1;
    dir.x /= len;
    dir.z /= len;
    const wasAlive = !mob.dead;
    mob.takeDamage(damage, dir);
    if (mob.onHurt) mob.onHurt(fromPos);
    if (mob.dead && wasAlive) {
      this.killMob(mob, fromPos);
    }
    return wasAlive;
  }

  /** Random spawn position around the player. */
  findSpawnPos(playerPos, hostile) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = hostile ? 18 + Math.random() * 22 : 12 + Math.random() * 26;
      const x = Math.floor(playerPos.x + Math.cos(angle) * dist);
      const z = Math.floor(playerPos.z + Math.sin(angle) * dist);
      const h = this.world.heightAt(x, z);
      if (h <= 0) continue;
      // Is the surface clear?
      const ground = this.world.getBlock(x, h, z);
      const a1 = this.world.getBlock(x, h + 1, z);
      const a2 = this.world.getBlock(x, h + 2, z);
      const def = BLOCKS[ground];
      if (!def || !def.solid) continue;
      if (a1 !== BLOCK.AIR || a2 !== BLOCK.AIR) continue;
      if (ground === BLOCK.WATER || ground === BLOCK.LAVA) continue;
      if (hostile) {
        // Zombies spawn only in darkness (not on lit blocks)
        const light = Math.max(
          this.world.getSkyLight(x, h + 1, z),
          this.world.getBlockLight(x, h + 1, z)
        );
        if (light > 7) continue;
        return { x: x + 0.5, y: h + 1, z: z + 0.5 };
      }
      // Animals spawn only on grass/dirt/snow/sand
      if (![BLOCK.GRASS, BLOCK.DIRT, BLOCK.SNOW, BLOCK.SAND, BLOCK.STONE].includes(ground)) continue;
      if (ground === BLOCK.SAND && Math.random() < 0.7) continue;
      return { x: x + 0.5, y: h + 1, z: z + 0.5 };
    }
    return null;
  }

  spawnAnimal(type, pos) {
    const mob = new Animal(this.world, pos.x, pos.y, pos.z, type);
    this.mobs.push(mob);
    this.scene.add(mob.group);
    return mob;
  }

  spawnZombie(pos) {
    const mob = new Zombie(this.world, pos.x, pos.y, pos.z);
    this.mobs.push(mob);
    this.scene.add(mob.group);
    return mob;
  }

  /**
   * Update.
   * @param {number} worldTime time of day 0..1 (0.25 = noon)
   */
  update(dt, player, inventory, hooks, worldTime) {
    const isNight = worldTime > 0.5;

    // Spawning
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 3.5;
      const animals = this.mobs.filter((m) => m.passive).length;
      const monsters = this.mobs.filter((m) => !m.passive).length;

      if (animals < this.maxAnimals) {
        const pos = this.findSpawnPos(player.position, false);
        if (pos) {
          const types = ['pig', 'cow', 'sheep', 'chicken'];
          const weights = [0.3, 0.25, 0.25, 0.2];
          let r = Math.random();
          let type = types[0];
          for (let i = 0; i < types.length; i++) {
            r -= weights[i];
            if (r <= 0) { type = types[i]; break; }
          }
          this.spawnAnimal(type, pos);
        }
      }
      if (isNight && !player.peaceful && monsters < this.maxMonsters && !player.dead) {
        const pos = this.findSpawnPos(player.position, true);
        if (pos) this.spawnZombie(pos);
      }
    }

    // Update entities
    for (const mob of this.mobs) {
      if (mob.passive) {
        mob.update(dt, player, hooks);
      } else {
        mob.update(dt, player, hooks, worldTime);
      }
    }
    for (const item of this.items) {
      item.update(dt, player, inventory, hooks);
    }

    // Cleanup: remove distant/dead entities
    const pp = player.position;
    this.mobs = this.mobs.filter((mob) => {
      const dist = Math.hypot(mob.position.x - pp.x, mob.position.z - pp.z);
      if (mob.dead || dist > 110 || mob.position.y < -25) {
        if (!mob.dead) mob.dispose(this.scene);
        else if (mob.group) mob.dispose(this.scene);
        return false;
      }
      return true;
    });
    this.items = this.items.filter((item) => {
      const dist = Math.hypot(item.position.x - pp.x, item.position.z - pp.z);
      if (item.dead || dist > 110) {
        if (item.group) item.dispose(this.scene);
        return false;
      }
      return true;
    });
  }

  /** All mobs near a position (for click/attack interactions). */
  raycastMob(origin, dir, maxDist = 4) {
    let best = null;
    let bestDist = maxDist;
    for (const mob of this.mobs) {
      // Approximate point-to-AABB distance along the ray
      const w = mob.width / 2 + 0.25;
      const minX = mob.position.x - w, maxX = mob.position.x + w;
      const minY = mob.position.y, maxY = mob.position.y + mob.height + 0.2;
      const minZ = mob.position.z - w, maxZ = mob.position.z + w;

      // AABB/ray intersection (slab method)
      let tmin = -Infinity, tmax = Infinity;
      const o = [origin.x, origin.y, origin.z];
      const d = [dir.x, dir.y, dir.z];
      const mins = [minX, minY, minZ];
      const maxs = [maxX, maxY, maxZ];
      let hit = true;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-8) {
          if (o[i] < mins[i] || o[i] > maxs[i]) { hit = false; break; }
        } else {
          let t1 = (mins[i] - o[i]) / d[i];
          let t2 = (maxs[i] - o[i]) / d[i];
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) { hit = false; break; }
        }
      }
      if (hit && tmin >= 0 && tmin < bestDist) {
        bestDist = tmin;
        best = mob;
      }
    }
    return best ? { mob: best, distance: bestDist } : null;
  }

  clear() {
    for (const mob of this.mobs) mob.dispose(this.scene);
    for (const item of this.items) item.dispose(this.scene);
    this.mobs = [];
    this.items = [];
  }
}

export { ANIMAL_CONFIG };
