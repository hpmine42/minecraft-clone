// debug.js — F3 debug overlay.
import { BIOME_NAMES } from '../world/worldgen.js';
import { getName, BLOCKS } from '../world/blocks.js';
import { formatWorldClock } from './hud.js';

export class DebugOverlay {
  constructor(element) {
    this.el = element;
    this.visible = false;
    this.frame = 0;
    this._html = '';
  }

  toggle() {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? 'block' : 'none';
    return this.visible;
  }

  update(player, world, fps, mobs, extra = {}) {
    if (!this.visible) return;
    // Do not rewrite every frame (performance)
    this.frame++;
    if (this.frame % 10 !== 0) return;

    const pos = player.position;
    const chunkX = Math.floor(pos.x / 16);
    const chunkZ = Math.floor(pos.z / 16);
    const biome = world.gen.biomeAt(Math.floor(pos.x), Math.floor(pos.z));
    const stats = world.stats();
    const target = world.raycast(player.eyePosition(), player.lookDir(), 5.2);

    const lines = [
      `Minecraft Clone v1.0 (${fps} FPS)`,
      `XYZ: ${pos.x.toFixed(2)} / ${pos.y.toFixed(2)} / ${pos.z.toFixed(2)}`,
      `Chunk: ${chunkX}, ${chunkZ}   Look: ${(player.yaw * 180 / Math.PI).toFixed(0)}° / ${(player.pitch * 180 / Math.PI).toFixed(0)}°`,
      `Biome: ${BIOME_NAMES[biome] || '?'}`,
      `Mode: ${player.gamemode}${player.peaceful ? ' (peaceful)' : ''}${player.flying ? ' [FLYING]' : ''}`,
      `Health: ${player.health}/20   Hunger: ${player.hunger}/20   Air: ${Math.ceil(player.breath)}/10`,
      `Chunks: ${stats.chunks} loaded (${stats.dirty} dirty)  Vertices: ${stats.solidVerts}`,
      `Entities: ${mobs ? mobs.mobs.length : 0} Mobs, ${mobs ? mobs.items.length : 0} Items`,
      `Blocks modified: ${stats.modified}`,
    ];
    if (target) {
      lines.push(`Target: ${getName(target.id)} @ ${target.x},${target.y},${target.z}`);
    }
    if (extra.time !== undefined) {
      lines.push(`Time: ${formatWorldClock(extra.time)}  Weather: ${extra.weather === 'rain' ? 'Rain' : 'Clear'}`);
    }
    if (extra.device) {
      lines.push(extra.device);
    }
    this.el.textContent = lines.join('\n');
    this.el.style.display = 'block';
    this.visible = true;
  }
}
