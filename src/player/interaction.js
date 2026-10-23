// interaction.js — Mine/place blocks, combat, eating, and farming.
import { BLOCKS, BLOCK, TOOL, breakSpeed, getDrop, isPlaceable, RENDER } from '../world/blocks.js';
import { ItemEntity } from '../entities/mobs.js';

const MATERIAL_FOR_SOUND = {
  [BLOCK.GRASS]: 'grass', [BLOCK.DIRT]: 'dirt', [BLOCK.FARMLAND]: 'dirt',
  [BLOCK.STONE]: 'stone', [BLOCK.COBBLESTONE]: 'stone', [BLOCK.SANDSTONE]: 'stone',
  [BLOCK.BRICKS]: 'stone', [BLOCK.STONE_BRICKS]: 'stone', [BLOCK.OBSIDIAN]: 'stone',
  [BLOCK.MOSSY_COBBLE]: 'stone', [BLOCK.FURNACE]: 'stone',
  [BLOCK.SAND]: 'sand', [BLOCK.GRAVEL]: 'sand', [BLOCK.CLAY]: 'sand',
  [BLOCK.LOG]: 'wood', [BLOCK.PLANKS]: 'wood', [BLOCK.LEAVES]: 'grass',
  [BLOCK.BIRCH_LOG]: 'wood', [BLOCK.SPRUCE_LOG]: 'wood', [BLOCK.CRAFTING_TABLE]: 'wood',
  [BLOCK.CHEST]: 'wood', [BLOCK.BOOKSHELF]: 'wood', [BLOCK.LADDER]: 'wood',
  [BLOCK.GLASS]: 'glass', [BLOCK.ICE]: 'glass',
  [BLOCK.WOOL]: 'wool', [BLOCK.SNOW]: 'wool',
};

function soundMaterial(id) {
  return MATERIAL_FOR_SOUND[id] || 'dirt';
}

export class Interaction {
  constructor(world, player, inventory, mobs, particles, audio) {
    this.world = world;
    this.player = player;
    this.inventory = inventory;
    this.mobs = mobs;
    this.particles = particles;
    this.audio = audio;
    this.onBlockBreak = null;

    this.breakTarget = null;   // {x,y,z,id,progress,required}
    this.breakProgress = 0;
    this.placeCooldown = 0;
    this.eatTimer = 0;
    this.eatSlot = -1;
    this.swingTime = 0;
  }

  /**
   * Run every frame.
   * @param {number} dt
   * @param {object} actions { attack: bool (held), usePressed: bool, pickPressed: bool }
   * @param {object} camera THREE-compatible camera or {position, getWorldDirection}
   */
  update(dt, actions, camera) {
    this.placeCooldown = Math.max(0, this.placeCooldown - dt);
    this.swingTime = Math.max(0, this.swingTime - dt);

    const eye = this.player.eyePosition();
    // Mobile long presses can provide their own screen ray;
    // mouse/attack-button input continues to use the crosshair.
    const dir = actions.attackDirection || this.player.lookDir();

    // Target mobs first
    const mobHit = this.mobs.raycastMob(eye, dir, 4.2);
    const blockHit = this.world.raycast(eye, dir, 5.2);
    const mobCloser = mobHit && (!blockHit || mobHit.distance < blockHit.distance);

    // Continue eating
    if (this.eatTimer > 0) {
      this.eatTimer -= dt;
      if (this.eatTimer <= 0) this._finishEating();
    }

    // ---- Attack / mining -------------------------------------------------
    if (actions.attack) {
      this.swingTime = 0.22;
      if (mobCloser) {
        this.breakTarget = null;
        this.breakProgress = 0;
        if (this.player.attackCooldown <= 0) this._attackMob(mobHit.mob);
      } else if (blockHit) {
        this._breakBlock(dt, blockHit);
      } else {
        // No target in view: with attack held, restart on the next hit.
        this.breakTarget = null;
        this.breakProgress = 0;
      }
    } else {
      // Always reset progress when released.
      this.breakTarget = null;
      this.breakProgress = 0;
    }

    // ---- Use / place ---------------------------------------------
    if (actions.usePressed && this.placeCooldown <= 0) {
      this.swingTime = 0.22;
      this._useItem(blockHit);
    }

    // ---- Middle mouse button: pick block --------------------------------
    if (actions.pickPressed && blockHit && this.player.gamemode === 'creative') {
      this.inventory.slots[this.inventory.selected] = {
        id: blockHit.id, count: 1, dur: null,
      };
    }

    return { blockHit, mobHit: mobCloser ? mobHit : null };
  }

  /** Find the current target block along the look or mining ray. */
  currentTarget(direction = this.player.lookDir()) {
    return this.world.raycast(this.player.eyePosition(), direction, 5.2);
  }

  _attackMob(mob) {
    const player = this.player;
    if (player.attackCooldown > 0) return;
    player.attackCooldown = 0.45;
    const held = this.inventory.held();
    const def = held ? BLOCKS[held.id] : null;
    const damage = def && def.damage ? def.damage : 1;
    const fromPos = player.position;

    const wasAlive = this.mobs.hurtMob(mob, damage, fromPos);
    this.audio.mobHurt();
    this.particles.hit(
      mob.position.x,
      mob.position.y + mob.height * 0.6,
      mob.position.z
    );
    // Durability
    if (held && def && def.durability) {
      this.inventory.damageHeld(1);
    }
    player.exhaustion += 0.1;
  }

  _breakBlock(dt, hit) {
    const { x, y, z, id } = hit;
    const def = BLOCKS[id];
    if (!def || def.hardness < 0) return; // unbreakable (bedrock, water)

    // Target changed?
    if (!this.breakTarget || this.breakTarget.x !== x || this.breakTarget.y !== y || this.breakTarget.z !== z) {
      this.breakTarget = { x, y, z, id };
      this.breakProgress = 0;
    }

    const held = this.inventory.held();
    const creative = this.player.gamemode === 'creative';
    const speed = creative ? 1 : breakSpeed(id, held ? held.id : null);
    if (speed <= 0) return;

    const required = 1;
    if (creative) this.breakProgress = required;
    else this.breakProgress += dt * speed;

    // Mining particles
    if (Math.random() < dt * 18) {
      this.particles.blockBreak(x, y, z, id, 1);
    }

    if (this.breakProgress >= required) {
      // Mine the block; functional blocks can drop their contents first.
      this.onBlockBreak?.(x, y, z, id);
      this.world.setBlock(x, y, z, BLOCK.AIR);
      this.particles.blockBreak(x, y, z, id, 14);
      this.audio.dig(soundMaterial(id));
      this.player.exhaustion += 0.02;

      // Drop
      if (this.player.gamemode !== 'creative') {
        const drop = getDrop(id, held ? held.id : null);
        if (drop) {
          const item = new ItemEntity(this.world, x + 0.5, y + 0.3, z + 0.5, drop.id, drop.count);
          this.mobs.items.push(item);
          this.mobs.scene.add(item.group);
        }
        // Leaves: apples & saplings
        if (id === BLOCK.LEAVES || id === BLOCK.BIRCH_LEAVES || id === BLOCK.SPRUCE_LEAVES) {
          const r = Math.random();
          if (r < 0.07) {
            const item = new ItemEntity(this.world, x + 0.5, y + 0.3, z + 0.5, BLOCK.APPLE, 1);
            this.mobs.items.push(item);
            this.mobs.scene.add(item.group);
          } else if (r < 0.14) {
            const item = new ItemEntity(this.world, x + 0.5, y + 0.3, z + 0.5, BLOCK.SAPLING, 1);
            this.mobs.items.push(item);
            this.mobs.scene.add(item.group);
          }
        }
        // Wear out the tool
        if (held) {
          const hDef = BLOCKS[held.id];
          if (hDef && hDef.durability) this.inventory.damageHeld(1);
        }
      }

      // Gravity blocks above? (Drop sand/gravel—simplified to immediate movement)
      this._applyGravity(x, y + 1, z);

      this.breakTarget = null;
      this.breakProgress = 0;
    }
  }

  _applyGravity(x, y, z) {
    let id = this.world.getBlock(x, y, z);
    let ny = y;
    const def = BLOCKS[id];
    if (!def || !def.gravity) return;
    // Move downward until supported by a block
    while (ny > 0 && this.world.getBlock(x, ny - 1, z) === BLOCK.AIR) {
      ny--;
    }
    if (ny !== y) {
      this.world.setBlock(x, y, z, BLOCK.AIR);
      this.world.setBlock(x, ny, z, id);
    }
  }

  _useItem(blockHit) {
    const player = this.player;
    const held = this.inventory.held();
    if (!held) return;
    const def = BLOCKS[held.id];

    // ---- Eating ------------------------------------------------------------
    if (def && def.food > 0) {
      if (player.gamemode === 'survival' && player.hunger < player.maxHunger) {
        this.eatTimer = 1.1;
        this.audio.eat();
        // Apply the effect at the end via _finishEating
        this._pendingFood = def.food;
        this._pendingFoodId = held.id;
        this.placeCooldown = 1.15;
        return;
      }
      return;
    }

    // ---- Special tool functions --------------------------------------
    if (blockHit && def && def.tool === TOOL.HOE) {
      // Hoe: grass/dirt → farmland
      const below = blockHit;
      const aboveId = this.world.getBlock(below.x, below.y + 1, below.z);
      if ((below.id === BLOCK.GRASS || below.id === BLOCK.DIRT) && aboveId === BLOCK.AIR) {
        this.world.setBlock(below.x, below.y, below.z, BLOCK.FARMLAND);
        this.audio.dig('dirt');
        this.inventory.damageHeld(1);
        this.placeCooldown = 0.22;
        return;
      }
    }

    if (blockHit && held.id === BLOCK.SEEDS) {
      if (blockHit.id === BLOCK.FARMLAND && this.world.getBlock(blockHit.x, blockHit.y + 1, blockHit.z) === BLOCK.AIR) {
        this.world.setBlock(blockHit.x, blockHit.y + 1, blockHit.z, BLOCK.WHEAT, 0);
        this.audio.place('grass');
        if (player.gamemode !== 'creative') this.inventory.consume(BLOCK.SEEDS, 1);
        this.placeCooldown = 0.22;
        return;
      }
    }

    if (blockHit && held.id === BLOCK.BONE_MEAL) {
      // Bone meal: grow plants
      const target = this.world.getBlock(blockHit.x, blockHit.y + 1, blockHit.z) === BLOCK.WHEAT
        ? { x: blockHit.x, y: blockHit.y + 1, z: blockHit.z }
        : (blockHit.id === BLOCK.WHEAT ? blockHit : null);
      if (target) {
        const stage = this.world.getMeta(target.x, target.y, target.z);
        this.world.setBlock(target.x, target.y, target.z, BLOCK.WHEAT, Math.min(3, stage + 2));
        this.particles.hearts(target.x + 0.5, target.y + 0.5, target.z + 0.5, 4);
        this.audio.craft();
        if (player.gamemode !== 'creative') this.inventory.consume(BLOCK.BONE_MEAL, 1);
        this.placeCooldown = 0.25;
        return;
      }
    }

    if (blockHit && held.id === BLOCK.APPLE && false) {
      // (Apples are food—handled above)
    }

    // ---- Place block -------------------------------------------------
    if (isPlaceable(held.id)) {
      let px, py, pz;
      if (blockHit) {
        // Place on the targeted face
        px = blockHit.x + blockHit.nx;
        py = blockHit.y + blockHit.ny;
        pz = blockHit.z + blockHit.nz;
        // For plants, replace instead of placing alongside
        const targetId = this.world.getBlock(blockHit.x, blockHit.y, blockHit.z);
        const targetDef = BLOCKS[targetId];
        if (targetDef && !targetDef.solid && targetDef.render === RENDER.CROSS && isPlaceable(held.id)) {
          px = blockHit.x; py = blockHit.y; pz = blockHit.z;
        }
      } else {
        return;
      }

      if (py < 0 || py > 63) return;

      const existing = this.world.getBlock(px, py, pz);
      const exDef = BLOCKS[existing];
      if (existing !== BLOCK.AIR && (!exDef || exDef.solid)) return;

      // Check collision with the player (for solid blocks)
      const placeDef = BLOCKS[held.id];
      if (placeDef && placeDef.solid) {
        const w = 0.32;
        const pp = this.player.position;
        const overlap =
          px + 1 > pp.x - w && px < pp.x + w &&
          pz + 1 > pp.z - w && pz < pp.z + w &&
          py + 1 > pp.y && py < pp.y + 1.8;
        if (overlap) return;
      }

      // Place only when adjacent to a block
      const touches =
        this.world.getBlock(px + 1, py, pz) !== BLOCK.AIR ||
        this.world.getBlock(px - 1, py, pz) !== BLOCK.AIR ||
        this.world.getBlock(px, py + 1, pz) !== BLOCK.AIR ||
        this.world.getBlock(px, py - 1, pz) !== BLOCK.AIR ||
        this.world.getBlock(px, py, pz + 1) !== BLOCK.AIR ||
        this.world.getBlock(px, py, pz - 1) !== BLOCK.AIR;
      if (!touches) return;

      this.world.setBlock(px, py, pz, held.id, 0);
      this.audio.place(soundMaterial(held.id));
      this.placeCooldown = 0.2;
      if (this.player.gamemode !== 'creative') {
        this.inventory.consume(held.id, 1);
      }
    }
  }

  _finishEating() {
    if (this._pendingFood) {
      this.player.eat(this._pendingFood);
      this.particles.hearts(this.player.position.x, this.player.position.y + 1, this.player.position.z, 4);
      this._pendingFood = 0;
    }
    // Take food from the inventory
    if (this._pendingFoodId != null) {
      if (this.player.gamemode !== 'creative') {
        this.inventory.consume(this._pendingFoodId, 1);
      }
      this._pendingFoodId = null;
    }
  }

  /** Mining progress from 0 to 1 for the HUD/highlight. */
  get breakFraction() {
    return Math.min(1, this.breakProgress);
  }
}
