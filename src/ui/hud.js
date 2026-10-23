// hud.js — HUD: hotbar, hearts, hunger, air bubbles, target progress, and FPS.
import { BLOCKS, BLOCK, getName, isPlaceable } from '../world/blocks.js';
import { drawTileIcon } from '../world/textures.js';
import { markTouchEvent, wasRecentTouch } from '../core/touch.js';

/** World time: 00:00 at sunrise and 12:00 at noon. */
export function formatWorldClock(timeOfDay) {
  if (!Number.isFinite(timeOfDay)) return '--:--';
  const dayFraction = ((timeOfDay + 0.25) % 1 + 1) % 1;
  const totalMinutes = Math.floor(dayFraction * 24 * 60);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export class HUD {
  constructor(elements, atlasCanvas, inventory) {
    this.els = elements;
    this.atlas = atlasCanvas;
    this.inventory = inventory;
    this.lastSelected = -1;
    this.lastCounts = [];
    this.nameToastTimer = 0;
    this.gameplayActive = false;
    this.hidden = false;
    this.heldItemSignature = null;
    this.targetHintSignature = null;
    this.worldStatusSignature = null;
    this.fpsHistory = [];
    this.fps = 0;

    this._buildHotbar();
    this._buildStats();
  }

  _buildHotbar() {
    const bar = this.els.hotbar;
    bar.innerHTML = '';
    this.slotEls = [];
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';
      slot.dataset.index = String(i);
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      canvas.className = 'item-icon';
      const count = document.createElement('span');
      count.className = 'item-count';
      const dur = document.createElement('div');
      dur.className = 'durability-bar';
      dur.innerHTML = '<div></div>';
      slot.appendChild(canvas);
      slot.appendChild(count);
      slot.appendChild(dur);
      bar.appendChild(slot);
      this.slotEls.push({ slot, canvas, count, dur, durFill: dur.firstChild });

      // Click/touch → select hotbar slot (only while the HUD is active)
      const handler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        markTouchEvent();
        this.inventory.selected = i;
        this.onSelect && this.onSelect(i);
        this.update(true);
      };
      slot.addEventListener('touchstart', handler, { passive: false });
      slot.addEventListener('mousedown', (e) => {
        if (wasRecentTouch()) return;
        handler(e);
      });
    }
  }

  _buildStats() {
    const hearts = this.els.hearts;
    const hunger = this.els.hunger;
    const air = this.els.air;
    hearts.innerHTML = '';
    hunger.innerHTML = '';
    air.innerHTML = '';
    this.heartEls = [];
    this.hungerEls = [];
    this.airEls = [];
    for (let i = 0; i < 10; i++) {
      const h = document.createElement('span');
      h.className = 'heart';
      h.textContent = '❤';
      hearts.appendChild(h);
      this.heartEls.push(h);
    }
    for (let i = 0; i < 10; i++) {
      const f = document.createElement('span');
      f.className = 'hunger-icon';
      f.textContent = '🍖';
      hunger.appendChild(f);
      this.hungerEls.push(f);
    }
    for (let i = 0; i < 10; i++) {
      const b = document.createElement('span');
      b.className = 'bubble';
      b.textContent = '○';
      air.appendChild(b);
      this.airEls.push(b);
    }
  }

  /** Show an item name briefly. */
  showItemName(name) {
    const el = this.els.itemName;
    el.textContent = name;
    el.classList.add('visible');
    this.nameToastTimer = 2.2;
  }

  setGameplayActive(active) {
    this.gameplayActive = !!active;
    if (!this.gameplayActive) this.setTargetHint(null);
    this._refreshHeldItem();
  }

  /** Screenshot/reading mode: hide the entire HUD without changing game state. */
  setHidden(hidden) {
    this.hidden = !!hidden;
    const root = this.els.root;
    if (root) root.style.display = this.hidden ? 'none' : '';
    return this.hidden;
  }

  /** Context hint at the crosshair; visible only for an actually targeted block. */
  setTargetHint(target, player, touch = false) {
    const el = this.els.targetHint;
    if (!el) return;
    if (!this.gameplayActive || !target || !BLOCKS[target.id] || !player) {
      if (this.targetHintSignature !== '') {
        this.targetHintSignature = '';
        el.textContent = '';
        el.style.display = 'none';
      }
      return;
    }

    const held = this.inventory.held();
    const heldDef = held ? BLOCKS[held.id] : null;
    const opensContainer = [BLOCK.CRAFTING_TABLE, BLOCK.FURNACE, BLOCK.CHEST].includes(target.id);
    let action;
    if (opensContainer) action = touch ? '▣ open' : 'Right-click to open';
    else if (heldDef?.food > 0 && player.gamemode === 'survival' && player.hunger < player.maxHunger) {
      action = touch ? '▣ eat' : 'Right-click to eat';
    } else if (held && isPlaceable(held.id)) action = touch ? '▣ place' : 'Right-click to place';
    else action = touch ? '⛏ mine' : 'Left-click to mine';

    const label = `${getName(target.id)} · ${action}`;
    if (label === this.targetHintSignature) return;
    this.targetHintSignature = label;
    el.textContent = label;
    el.style.display = 'block';
  }

  /** Compact orientation aid for region, time, weather, and altitude. */
  setWorldStatus({ biome, timeOfDay, weather, y } = {}) {
    const el = this.els.worldStatus;
    if (!el) return;
    if (!biome) {
      this.worldStatusSignature = '';
      el.textContent = '';
      el.style.display = 'none';
      return;
    }
    const hour = Number(formatWorldClock(timeOfDay).slice(0, 2));
    const sky = weather === 'rain' ? '🌧 Rain' : (hour >= 6 && hour < 18 ? '☀ Clear' : '☾ Clear');
    const label = `${biome} · ${formatWorldClock(timeOfDay)} · ${sky} · Y ${Math.floor(y)}`;
    if (label === this.worldStatusSignature) return;
    this.worldStatusSignature = label;
    el.textContent = label;
    el.style.display = 'block';
  }

  _refreshHeldItem() {
    const view = this.els.heldItemView;
    const canvas = this.els.heldItemIcon;
    if (!view || !canvas) return;
    const stack = this.inventory.held();
    const visible = this.gameplayActive && !!stack;
    view.style.display = visible ? 'block' : 'none';
    if (!visible) return;

    const signature = `${stack.id}:${stack.count}:${stack.dur ?? ''}`;
    if (signature === this.heldItemSignature) return;
    this.heldItemSignature = signature;
    const def = BLOCKS[stack.id];
    if (def?.tiles?.length) {
      drawTileIcon(canvas, def.tiles[0], this.atlas);
      canvas.style.visibility = 'visible';
    } else {
      const context = canvas.getContext('2d');
      context?.clearRect(0, 0, canvas.width, canvas.height);
      canvas.style.visibility = 'hidden';
    }
  }

  update(dt, player, gameplayActive = this.gameplayActive) {
    this.gameplayActive = !!gameplayActive;
    this._refreshHeldItem();
    // Hide the name toast
    if (this.nameToastTimer > 0) {
      this.nameToastTimer -= dt;
      if (this.nameToastTimer <= 0) this.els.itemName.classList.remove('visible');
    }

    // Redraw the hotbar (only when changed)
    const sel = this.inventory.selected;
    const sig = this.inventory.slots.map((s) => (s ? `${s.id}:${s.count}:${s.dur ?? -1}` : '')).join('|');
    if (sig !== this._lastSig || sel !== this.lastSelected) {
      this._lastSig = sig;
      this.lastSelected = sel;
      for (let i = 0; i < 9; i++) {
        const { slot, canvas, count, dur, durFill } = this.slotEls[i];
        const s = this.inventory.slots[i];
        slot.classList.toggle('selected', i === sel);
        if (s) {
          const def = BLOCKS[s.id];
          const tile = def && def.tiles ? def.tiles[0] : 0;
          drawTileIcon(canvas, tile, this.atlas);
          canvas.style.visibility = 'visible';
          count.textContent = s.count > 1 ? String(s.count) : '';
          if (def && def.durability && s.dur != null) {
            const frac = s.dur / def.durability;
            dur.style.visibility = 'visible';
            durFill.style.width = `${Math.max(0, frac * 100)}%`;
            durFill.style.background = frac > 0.5 ? '#4caf50' : frac > 0.25 ? '#ffc107' : '#f44336';
          } else {
            dur.style.visibility = 'hidden';
          }
        } else {
          canvas.style.visibility = 'hidden';
          count.textContent = '';
          dur.style.visibility = 'hidden';
        }
      }
    }

    if (!player) return;

    // Hearts
    for (let i = 0; i < 10; i++) {
      const h = this.heartEls[i];
      const val = player.health - i * 2;
      h.classList.toggle('empty', val <= 0);
      h.classList.toggle('half', val === 1);
      h.classList.toggle('absorbing', false);
    }
    // Hunger
    for (let i = 0; i < 10; i++) {
      const f = this.hungerEls[9 - i];
      const val = player.hunger - i * 2;
      f.classList.toggle('empty', val <= 0);
    }
    // Air
    const showAir = player.headInWater || player.breath < player.breathMax;
    this.els.air.style.display = showAir ? 'flex' : 'none';
    if (showAir) {
      for (let i = 0; i < 10; i++) {
        const b = this.airEls[i];
        b.classList.toggle('empty', i * 2 >= player.breath);
      }
    }

    // Hide health and hunger bars in Creative mode
    const survival = player.gamemode === 'survival';
    this.els.hearts.style.visibility = survival ? 'visible' : 'hidden';
    this.els.hunger.style.visibility = survival ? 'visible' : 'hidden';
  }

  /** Calculate and display FPS. */
  updateFPS(dt) {
    const fps = 1 / Math.max(dt, 0.0001);
    this.fpsHistory.push(fps);
    if (this.fpsHistory.length > 30) this.fpsHistory.shift();
    this.fps = Math.round(this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length);
    if (this.els.fps) this.els.fps.textContent = `${this.fps} FPS`;
    return this.fps;
  }

  /** Mining progress at the crosshair. */
  setBreakProgress(fraction) {
    const el = this.els.breakProgress;
    if (fraction > 0) {
      el.style.display = 'block';
      el.style.setProperty('--p', `${Math.round(fraction * 100)}%`);
      el.innerHTML = `<div class="break-fill" style="width:${Math.round(fraction * 100)}%"></div>`;
    } else {
      el.style.display = 'none';
    }
  }

  /** Damage overlay (red flash). */
  flashHurt() {
    this.els.hurtOverlay.classList.remove('active');
    // Force a reflow
    void this.els.hurtOverlay.offsetWidth;
    this.els.hurtOverlay.classList.add('active');
  }

  setUnderwater(active) {
    this.els.waterOverlay.classList.toggle('active', active);
  }

  setGamemodeLabel(mode, peaceful) {
    if (this.els.modeLabel) {
      const labels = {
        survival: peaceful ? 'Survival (Peaceful)' : 'Survival',
        creative: 'Creative',
      };
      this.els.modeLabel.textContent = labels[mode] || mode;
    }
  }
}
