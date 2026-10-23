// player.js — Player physics, collision, health, hunger, swimming, and flying.
import { BLOCK, BLOCKS } from '../world/blocks.js';

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;
export const EYE_HEIGHT_SNEAK = 1.42;

export const PHYS = {
  gravity: 32,
  jumpSpeed: 8.6,
  walkSpeed: 4.317,
  sprintSpeed: 5.6,
  sneakSpeed: 1.3,
  flySpeed: 11,
  flySprintSpeed: 22,
  swimSpeed: 2.8,
  waterGravity: 6,
  lavaGravity: 4,
  airControl: 0.25,
  groundFriction: 10,
  airFriction: 0.6,
  waterFriction: 4,
  maxFallSpeed: -60,
};

export class Player {
  constructor(world) {
    this.world = world;
    this.position = { x: 0.5, y: 50, z: 0.5 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.yaw = 0;       // Horizontal look direction (radians)
    this.pitch = 0;     // Vertical look direction (radians)
    this.onGround = false;
    this.flying = false;
    this.sneaking = false;
    this.sprinting = false;
    this.inWater = false;
    this.headInWater = false;
    this.inLava = false;
    this.onLadder = false;
    this.fallDistance = 0;
    this.health = 20;
    this.maxHealth = 20;
    this.hunger = 20;
    this.maxHunger = 20;
    this.exhaustion = 0;
    this.dead = false;
    this.gamemode = 'survival'; // 'survival' | 'creative'
    this.peaceful = true;
    this.invulnerableTime = 0;
    this.breath = 10;           // Air bubbles (0–10)
    this.breathMax = 10;
    this.attackCooldown = 0;
    this.walkTime = 0;          // for footstep sounds/bobbing
    this.hurtTime = 0;
    this.lastDamage = 0;
  }

  /** Look direction as a normalized vector. */
  lookDir() {
    const cp = Math.cos(this.pitch);
    return {
      x: -Math.sin(this.yaw) * cp,
      y: Math.sin(this.pitch),
      z: -Math.cos(this.yaw) * cp,
    };
  }

  /** Eye position. */
  eyePosition() {
    const eye = this.sneaking ? EYE_HEIGHT_SNEAK : EYE_HEIGHT;
    return { x: this.position.x, y: this.position.y + eye, z: this.position.z };
  }

  /** Player AABB. */
  aabb() {
    const w = PLAYER_WIDTH / 2;
    return {
      minX: this.position.x - w, maxX: this.position.x + w,
      minY: this.position.y, maxY: this.position.y + PLAYER_HEIGHT,
      minZ: this.position.z - w, maxZ: this.position.z + w,
    };
  }

  /** Does the block collide? */
  isSolidAt(x, y, z) {
    const id = this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    const def = BLOCKS[id];
    return def ? def.solid : false;
  }

  /** Check whether the AABB collides with solid blocks. */
  collides(px, py, pz) {
    const w = PLAYER_WIDTH / 2;
    const minX = Math.floor(px - w);
    const maxX = Math.floor(px + w);
    const minY = Math.floor(py);
    const maxY = Math.floor(py + PLAYER_HEIGHT);
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

  /**
   * Movement + physics for one time step.
   * @param {number} dt seconds
   * @param {{forward:number, right:number, jump:boolean, sneak:boolean, sprint:boolean}} input
   *   forward/right in [-1,1] (camera-relative)
   */
  update(dt, input) {
    if (this.dead) return;
    dt = Math.min(dt, 0.05); // Stability
    this.invulnerableTime = Math.max(0, this.invulnerableTime - dt);
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    const pos = this.position;
    const vel = this.velocity;

    // Check surroundings
    const feetId = this.world.getBlock(Math.floor(pos.x), Math.floor(pos.y + 0.2), Math.floor(pos.z));
    const midId = this.world.getBlock(Math.floor(pos.x), Math.floor(pos.y + 0.9), Math.floor(pos.z));
    const headId = this.world.getBlock(Math.floor(pos.x), Math.floor(pos.y + EYE_HEIGHT), Math.floor(pos.z));
    this.inWater = feetId === BLOCK.WATER || midId === BLOCK.WATER;
    this.headInWater = headId === BLOCK.WATER;
    this.inLava = feetId === BLOCK.LAVA || midId === BLOCK.LAVA;
    const ladderBlock = this.world.getBlock(Math.floor(pos.x), Math.floor(pos.y + 0.5), Math.floor(pos.z));
    this.onLadder = ladderBlock === BLOCK.LADDER || this.world.getBlock(Math.floor(pos.x), Math.floor(pos.y + EYE_HEIGHT), Math.floor(pos.z)) === BLOCK.LADDER;

    this.sneaking = input.sneak && !this.flying && this.gamemode !== 'creative';
    this.sprinting = input.sprint && input.forward > 0.5 && this.hunger > 6 && !this.sneaking;

    // Target velocity (camera-relative)
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const fwd = input.forward || 0;
    const right = input.right || 0;
    let moveX = -sin * fwd + cos * right;
    let moveZ = -cos * fwd - sin * right;
    const moveLen = Math.hypot(moveX, moveZ);
    if (moveLen > 1) { moveX /= moveLen; moveZ /= moveLen; }

    let speed;
    if (this.flying) {
      speed = this.sprinting ? PHYS.flySprintSpeed : PHYS.flySpeed;
    } else if (this.inWater) {
      speed = PHYS.swimSpeed;
    } else if (this.sneaking) {
      speed = PHYS.sneakSpeed;
    } else if (this.sprinting) {
      speed = PHYS.sprintSpeed;
    } else {
      speed = PHYS.walkSpeed;
    }

    // Horizontal acceleration
    const accel = this.onGround || this.flying ? 1 : PHYS.airControl;
    const control = Math.min(1, accel * dt * 14);
    vel.x += (moveX * speed - vel.x) * control;
    vel.z += (moveZ * speed - vel.z) * control;

    // Friction without input
    if (Math.abs(fwd) < 0.01 && Math.abs(right) < 0.01 && this.onGround && !this.flying) {
      const fr = Math.max(0, 1 - PHYS.groundFriction * dt);
      vel.x *= fr;
      vel.z *= fr;
    }

    // Vertical movement
    if (this.flying) {
      // Ascending takes priority over descending. Sneak remains a toggle on touch
      // devices; without this priority, Jump and Sneak would block flight controls.
      const vy = input.jump ? speed : input.sneak ? -speed : 0;
      vel.y += (vy - vel.y) * Math.min(1, dt * 12);
    } else if (this.onLadder) {
      vel.y = -1.5;
      if (input.jump) vel.y = 3.2;
      if (this.sneaking) vel.y = 0;
    } else if (this.inWater) {
      vel.y -= PHYS.waterGravity * dt;
      if (input.jump) vel.y = 3.6;
      vel.y = Math.max(vel.y, -4.5);
      this.fallDistance = 0;
    } else if (this.inLava) {
      vel.y -= PHYS.lavaGravity * dt;
      if (input.jump) vel.y = 2.2;
      vel.y = Math.max(vel.y, -3);
      this.fallDistance = 0;
    } else {
      vel.y -= PHYS.gravity * dt;
      vel.y = Math.max(vel.y, PHYS.maxFallSpeed);
      if (input.jump && this.onGround) {
        vel.y = PHYS.jumpSpeed;
        this.onGround = false;
        this.exhaustion += 0.15;
      }
    }

    // Collision: move one axis at a time
    const oldY = pos.y;
    this.moveAxis('x', vel.x * dt);
    this.moveAxis('z', vel.z * dt);
    const landed = this.moveAxis('y', vel.y * dt);

    // Track falling
    if (vel.y < 0 && !this.onGround && !this.inWater && !this.onLadder) {
      this.fallDistance += (oldY - pos.y);
    }
    if (landed && this.fallDistance > 0) {
      this.onLanding();
    }

    // Walk bobbing / exhaustion
    const hSpeed = Math.hypot(vel.x, vel.z);
    if (this.onGround && hSpeed > 0.5) {
      this.walkTime += dt * hSpeed;
      this.exhaustion += dt * (this.sprinting ? 0.02 : 0.005) * hSpeed;
    }

    // Hunger & health
    this.exhaustion = Math.max(0, this.exhaustion - dt * 0.4);
    if (this.exhaustion > 4) {
      this.exhaustion = 0;
      if (this.gamemode === 'survival') {
        if (this.hunger > 0) this.hunger = Math.max(0, this.hunger - 1);
      }
    }
    if (this.gamemode === 'survival') {
      if (this.hunger <= 0 && this.health > 0) {
        // Starvation
        this._starveTimer = (this._starveTimer || 0) + dt;
        if (this._starveTimer > 4) {
          this._starveTimer = 0;
          this.takeDamage(1, 'hunger');
        }
      } else if (this.hunger >= 18 && this.health < this.maxHealth) {
        this._regenTimer = (this._regenTimer || 0) + dt;
        if (this._regenTimer > 3.5) {
          this._regenTimer = 0;
          this.health = Math.min(this.maxHealth, this.health + 1);
          this.exhaustion += 0.6;
        }
      }
    }

    // Drowning / air
    if (this.headInWater && this.gamemode === 'survival') {
      this.breath -= dt;
      if (this.breath <= 0) {
        this.breath = 0;
        this._drownTimer = (this._drownTimer || 0) + dt;
        if (this._drownTimer > 1.5) {
          this._drownTimer = 0;
          this.takeDamage(2, 'drown');
        }
      }
    } else {
      this.breath = Math.min(this.breathMax, this.breath + dt * 2.5);
      this._drownTimer = 0;
    }

    // Lava damage
    if (this.inLava && this.gamemode === 'survival') {
      this._lavaTimer = (this._lavaTimer || 0) + dt;
      if (this._lavaTimer > 0.7) {
        this._lavaTimer = 0;
        this.takeDamage(3, 'lava');
      }
    }

    // World bounds (soft lower limit)
    if (pos.y < -20) {
      this.takeDamage(100, 'void');
    }
  }

  /** Move one axis with collision resolution. Returns true for ground contact after Y movement. */
  moveAxis(axis, delta) {
    if (delta === 0) return false;
    const pos = this.position;
    const step = 0.05;
    let remaining = delta;
    let landed = false;

    while (Math.abs(remaining) > 1e-9) {
      const move = Math.sign(remaining) * Math.min(Math.abs(remaining), step);
      const old = pos[axis];
      pos[axis] = old + move;
      if (this.collides(pos.x, pos.y, pos.z)) {
        pos[axis] = old;
        if (axis === 'y') {
          if (delta < 0) {
            this.onGround = true;
            landed = true;
          }
          this.velocity.y = 0;
        } else {
          this.velocity[axis] = 0;
        }
        return landed;
      }
      remaining -= move;
    }
    if (axis === 'y') {
      this.onGround = delta < 0 ? this.onGround : false;
      if (delta < 0) {
        // Check ground contact 0.05 below the player
        const w = PLAYER_WIDTH / 2;
        this.onGround = this.collides(pos.x, pos.y - 0.06, pos.z);
        if (this.onGround) landed = true;
      } else {
        this.onGround = false;
      }
    }
    return landed;
  }

  onLanding() {
    const fall = this.fallDistance;
    this.fallDistance = 0;
    if (fall > 3.2 && this.gamemode === 'survival' && !this.inWater && !this.onLadder && !this.flying) {
      const dmg = Math.floor(fall - 3.2);
      if (dmg > 0) this.takeDamage(dmg, 'fall');
    }
    if (fall > 1) this.exhaustion += 0.2;
    this.justLanded = fall;
  }

  /** Apply damage. */
  takeDamage(amount, source = 'generic') {
    if (this.gamemode === 'creative' && source !== 'void') return false;
    if (this.invulnerableTime > 0 && source !== 'hunger' && source !== 'drown') return false;
    if (this.dead) return false;
    this.health -= amount;
    this.invulnerableTime = 0.5;
    this.hurtTime = 0.35;
    this.lastDamage = source;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
    return true;
  }

  /** Eat. Returns true if something was consumed. */
  eat(foodPoints) {
    if (this.hunger >= this.maxHunger && this.health >= this.maxHealth) return false;
    this.hunger = Math.min(this.maxHunger, this.hunger + foodPoints);
    return true;
  }

  /** Respawn the player. */
  respawn(spawnPos) {
    this.health = this.maxHealth;
    this.hunger = this.maxHunger;
    this.breath = this.breathMax;
    this.dead = false;
    this.flying = false;
    this.onGround = false;
    this.sneaking = false;
    this.sprinting = false;
    this.velocity = { x: 0, y: 0, z: 0 };
    this.fallDistance = 0;
    this.justLanded = 0;
    if (spawnPos) {
      this.position = { ...spawnPos };
    }
    this.invulnerableTime = 1.5;
  }

  /** Teleport the player to a position (initialization). */
  teleport(x, y, z) {
    this.position = { x, y, z };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.onGround = false;
    this.sneaking = false;
    this.sprinting = false;
    this.inWater = false;
    this.headInWater = false;
    this.inLava = false;
    this.onLadder = false;
    this.fallDistance = 0;
    this.justLanded = 0;
  }

  toJSON() {
    return {
      position: { ...this.position },
      yaw: this.yaw,
      pitch: this.pitch,
      health: this.health,
      hunger: this.hunger,
      breath: this.breath,
      flying: this.flying,
      gamemode: this.gamemode,
      peaceful: this.peaceful,
    };
  }

  fromJSON(data) {
    if (!data) return;
    if (data.position) this.position = { ...data.position };
    this.yaw = data.yaw || 0;
    this.pitch = data.pitch || 0;
    this.health = data.health ?? 20;
    this.hunger = data.hunger ?? 20;
    this.breath = data.breath ?? 10;
    this.gamemode = data.gamemode || 'survival';
    this.flying = !!data.flying && this.gamemode === 'creative';
    this.peaceful = data.peaceful !== false;
  }
}
