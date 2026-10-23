// menus.js — Main menu, pause, settings, inventory/crafting, death, and help.
import { BLOCKS, getName } from '../world/blocks.js';
import { drawTileIcon } from '../world/textures.js';
import { matchRecipe, listRecipes, makeStack, canEquipItem, stacksEqual, EQUIPMENT_SLOTS } from '../player/inventory.js';
import { canPlaceFurnaceItem, getSmeltingRecipe } from '../player/furnace.js';
import { markTouchEvent, wasRecentTouch } from '../core/touch.js';

export class Menus {
  constructor(elements, atlasCanvas, inventory, callbacks = {}) {
    this.els = elements;
    this.atlas = atlasCanvas;
    this.inventory = inventory;
    this.cb = callbacks; // { onPlay, onNewWorld, onResume, onSettingsChange, onSave, onQuit, onRespawn, onCraft, onFullscreen }
    this.craftGrid = new Array(4).fill(null);
    this.craftingMode = 'player';
    this.craftRemainder = null;
    this.heldStack = null;
    this.containerSession = null;
    this.containerSlotSignature = null;
    this.containerNotice = null;
    this._slotGesture = null;
    this._mouseGesture = null;
    this._desktopMouseBound = false;
    this._hoveredInventorySlot = null;
    this.inventoryTooltip = null;
    this.selectedSlot = -1;
    this.singleTransferMode = false;
    this.transferSourceIndex = -1;
    this.activeScreen = null;
    this.recipeList = listRecipes();

    this._bindButtons();
    this._buildInventoryUI();
  }

  // -------------------------------------------------------------------------
  // Screen management
  // -------------------------------------------------------------------------
  showScreen(name) {
    const leavingInventory = this.activeScreen === 'inventory-screen' && name !== 'inventory-screen';
    const screens = ['main-menu', 'pause-menu', 'settings-screen', 'inventory-screen', 'death-screen', 'help-screen', 'loading-screen', 'selftest-screen'];
    for (const s of screens) {
      const el = this._el(s);
      if (el) el.classList.toggle('visible', s === name);
    }
    this.activeScreen = name;
    // Keep the HUD fullscreen button visible only in-game; it would overlap controls on screen cards.
    const hudFullscreen = this.els['btn-fullscreen'];
    if (hudFullscreen) hudFullscreen.style.display = name ? 'none' : '';
    if (leavingInventory) this._setSingleTransferMode(false);
    if (name === 'inventory-screen') {
      this.refreshInventory();
    }
    if (name === 'settings-screen') {
      this._syncSettingsUI();
    }
  }

  hideAll() {
    this.showScreen(null);
  }

  /** Open the regular inventory with classic 2×2 player crafting. */
  openPlayerInventory() {
    this._prepareInventoryMode(null);
    this._setCraftingMode('player');
    this.showScreen('inventory-screen');
  }

  /** A crafting table uses the larger 3×3 crafting grid. */
  openWorkbenchInventory() {
    this._prepareInventoryMode(null);
    this._setCraftingMode('workbench');
    if (this.inventoryTitle) this.inventoryTitle.textContent = 'Crafting Table';
    this.showScreen('inventory-screen');
  }

  /** Furnace and chest views use the same desktop/touch slots. */
  openFurnace(state) {
    this._prepareInventoryMode({ type: 'furnace', state, slots: state.slots });
    this._setCraftingMode('player');
    this.showScreen('inventory-screen');
  }

  openChest(state) {
    this._prepareInventoryMode({ type: 'chest', state, slots: state.slots });
    this._setCraftingMode('player');
    this.showScreen('inventory-screen');
  }

  _prepareInventoryMode(session) {
    this._setSingleTransferMode(false);
    this._dropHeld();
    this._returnCraftGrid();
    this._returnCraftRemainder();
    this.containerSession = session;
    this.containerSlotSignature = null;
    this.containerNotice = null;

    const isFurnace = session?.type === 'furnace';
    const isChest = session?.type === 'chest';
    if (this.transferControls) this.transferControls.style.display = session ? 'none' : '';
    if (this.playerSidePanel) this.playerSidePanel.style.display = session ? 'none' : '';
    if (this.recipeBook) this.recipeBook.style.display = session ? 'none' : '';
    if (this.furnacePanel) this.furnacePanel.style.display = isFurnace ? '' : 'none';
    if (this.chestPanel) this.chestPanel.style.display = isChest ? '' : 'none';
    if (this.inventoryTitle) {
      this.inventoryTitle.textContent = isFurnace ? 'Furnace' : isChest ? 'Chest' : 'Inventory & Crafting';
    }
  }

  /** Also called when closing with Escape or the mobile back button. */
  closeActiveInventory() {
    this._setSingleTransferMode(false);
    this._returnCraftGrid();
    this._returnCraftRemainder();
    this._dropHeldToWorld();
    this.containerSession = null;
    this.containerSlotSignature = null;
    this._prepareInventoryMode(null);
    this._setCraftingMode('player');
    if (this.inventoryTooltip) this.inventoryTooltip.style.display = 'none';
  }

  _setCraftingMode(mode) {
    this.craftingMode = mode === 'workbench' ? 'workbench' : 'player';
    const size = this.craftingMode === 'workbench' ? 9 : 4;
    if (this.craftGrid.length !== size) this.craftGrid = new Array(size).fill(null);
    if (this.craftGridEl) {
      this.craftGridEl.classList.toggle('player-craft-grid', size === 4);
    }
    this.playerSidePanel?.classList.toggle('workbench-mode', size === 9);
    for (let i = 0; i < (this.craftSlotEls?.length || 0); i++) {
      this.craftSlotEls[i].el.style.display = i < size ? '' : 'none';
    }
    if (this.craftLabel) {
      this.craftLabel.textContent = size === 4 ? 'Player Crafting (2×2)' : 'Crafting Table (3×3)';
    }
    if (this.transferStatus) {
      this.transferStatus.textContent = `Place individual ingredients from the inventory into the ${size === 4 ? '2×2' : '3×3'} grid without dragging.`;
    }
    this.refreshInventory();
  }

  /** Temporary cursor and crafting stacks are saved with the game. */
  serializeInventoryState() {
    const serialize = (stack) => (stack ? { ...stack } : null);
    return {
      craftingMode: this.craftingMode,
      craftGrid: this.craftGrid.map(serialize),
      craftRemainder: serialize(this.craftRemainder),
      heldStack: serialize(this.heldStack),
    };
  }

  restoreInventoryState(data) {
    if (!data || typeof data !== 'object') {
      this.resetInventoryState();
      return;
    }
    this.craftingMode = data.craftingMode === 'workbench' ? 'workbench' : 'player';
    const size = this.craftingMode === 'workbench' ? 9 : 4;
    this.craftGrid = new Array(size).fill(null);
    if (Array.isArray(data.craftGrid)) {
      for (let i = 0; i < Math.min(size, data.craftGrid.length); i++) {
        const stack = data.craftGrid[i];
        if (stack) this.craftGrid[i] = makeStack(stack.id, stack.count, stack.dur, stack.meta);
      }
    }
    const remainder = data.craftRemainder;
    this.craftRemainder = remainder ? makeStack(remainder.id, remainder.count, remainder.dur, remainder.meta) : null;
    const held = data.heldStack;
    this.heldStack = held ? makeStack(held.id, held.count, held.dur, held.meta) : null;
    this._setCraftingMode(this.craftingMode);
    this.refreshInventory();
  }

  resetInventoryState() {
    this.craftGrid = new Array(4).fill(null);
    this.craftingMode = 'player';
    this.craftRemainder = null;
    this.heldStack = null;
    this.containerSession = null;
    this._setCraftingMode('player');
  }

  // -------------------------------------------------------------------------
  // Bind buttons
  // -------------------------------------------------------------------------
  _el(id) {
    return this.els[id] || (typeof document !== 'undefined' ? document.getElementById(id) : null);
  }

  _bindButtons() {
    const click = (id, fn) => {
      const el = this._el(id);
      if (!el) return;
      el.addEventListener('click', (e) => {
        e.preventDefault();
        if (wasRecentTouch()) return; // The touch handler has already responded
        fn();
      });
      el.addEventListener('touchend', (e) => {
        e.preventDefault();
        markTouchEvent();
        fn();
      });
    };

    click('btn-play', () => this.cb.onPlay && this.cb.onPlay());
    click('btn-new-world', () => this.cb.onNewWorld && this.cb.onNewWorld());
    click('btn-resume', () => this.cb.onResume && this.cb.onResume());
    click('btn-open-settings', () => this.showScreen('settings-screen'));
    click('btn-settings-back', () => this.showScreen(this._settingsFrom || 'main-menu'));
    click('btn-save', () => this.cb.onSave && this.cb.onSave());
    click('btn-export-save', () => this.cb.onExportSave && this.cb.onExportSave());
    click('btn-import-save', () => {
      const fileInput = this._el('save-import-file');
      if (fileInput) fileInput.click();
    });
    const saveFileInput = this._el('save-import-file');
    if (saveFileInput) {
      saveFileInput.addEventListener('change', () => {
        const file = saveFileInput.files?.[0];
        if (!file || !this.cb.onImportSave) {
          saveFileInput.value = '';
          return;
        }
        const playButton = this._el('btn-play');
        const newWorldButton = this._el('btn-new-world');
        const importButton = this._el('btn-import-save');
        const playWasDisabled = playButton?.disabled;
        const newWorldWasDisabled = newWorldButton?.disabled;
        if (playButton) playButton.disabled = true;
        if (newWorldButton) newWorldButton.disabled = true;
        if (importButton) importButton.disabled = true;
        Promise.resolve().then(() => this.cb.onImportSave(file)).then((imported) => {
          if (imported) this.setHasSave(true);
          else if (playButton) playButton.disabled = playWasDisabled;
        }).catch(() => {
          if (playButton) playButton.disabled = playWasDisabled;
        }).finally(() => {
          if (newWorldButton) newWorldButton.disabled = newWorldWasDisabled;
          if (importButton) importButton.disabled = false;
          saveFileInput.value = '';
        });
      });
    }
    click('btn-quit', () => this.cb.onQuit && this.cb.onQuit());
    click('btn-respawn', () => this.cb.onRespawn && this.cb.onRespawn());
    click('btn-help', () => this.showScreen('help-screen'));
    click('btn-help-back', () => this.showScreen('main-menu'));
    click('btn-settings-from-pause', () => {
      this._settingsFrom = 'pause-menu';
      this.showScreen('settings-screen');
    });
    click('btn-selftest', () => this.cb.onSelfTest && this.cb.onSelfTest());
    click('btn-fullscreen', () => this.cb.onFullscreen && this.cb.onFullscreen());
    click('btn-fullscreen-menu', () => this.cb.onFullscreen && this.cb.onFullscreen());

    // Settings
    const bindRange = (id, key, format) => {
      const el = this._el(id);
      if (!el) return;
      el.addEventListener('input', () => {
        const v = parseFloat(el.value);
        const label = this._el(`${id}-value`);
        if (label && format) label.textContent = format(v);
        this.cb.onSettingsChange && this.cb.onSettingsChange(key, v);
      });
    };
    bindRange('setting-render-distance', 'renderDistance', (v) => `${v} Chunks`);
    bindRange('setting-fov', 'fov', (v) => `${v}°`);
    bindRange('setting-sensitivity', 'sensitivity', (v) => v.toFixed(4));
    bindRange('setting-volume', 'volume', (v) => `${Math.round(v * 100)} %`);
    bindRange('setting-day-length', 'dayLength', (v) => {
      if (v <= 0) return 'Off';
      return `${Math.round(v)} s`;
    });
    bindRange('setting-autosave-interval', 'autosaveInterval', (v) => {
      const seconds = Math.round(v);
      if (seconds < 60) return `${seconds} s`;
      const minutes = Math.floor(seconds / 60);
      const remainder = seconds % 60;
      return remainder ? `${minutes} min ${remainder} s` : `${minutes} min`;
    });

    const bindSelect = (id, key) => {
      const el = this._el(id);
      if (!el) return;
      el.addEventListener('change', () => {
        this.cb.onSettingsChange && this.cb.onSettingsChange(key, el.value);
      });
    };
    bindSelect('setting-particles', 'particles');

    const bindCheck = (id, key) => {
      const el = this._el(id);
      if (!el) return;
      el.addEventListener('change', () => {
        this.cb.onSettingsChange && this.cb.onSettingsChange(key, el.checked);
      });
    };
    bindCheck('setting-invert-y', 'invertY');
    bindCheck('setting-reduced-motion', 'reduceMotion');
    bindCheck('setting-debug', 'showDebug');
    bindCheck('setting-autosave', 'autosave');

    click('btn-reset-world', () => {
      if (confirm('Reset the world? All buildings will be lost!')) {
        this.cb.onResetWorld && this.cb.onResetWorld();
      }
    });
    click('btn-delete-save', () => {
      if (confirm('Delete the saved world?')) {
        this.cb.onDeleteSave && this.cb.onDeleteSave();
      }
    });

    // Settings opened from the main menu
    const openSettingsFromMain = this.els['btn-open-settings'];
    if (openSettingsFromMain) {
      openSettingsFromMain.addEventListener('click', () => { this._settingsFrom = 'main-menu'; });
    }
  }

  setSettings(values) {
    this._settings = values;
    this._syncSettingsUI();
  }

  _syncSettingsUI() {
    const s = this._settings;
    if (!s) return;
    const setVal = (id, v) => {
      const el = this._el(id);
      if (el) el.value = v;
      const label = this._el(`${id}-value`);
      if (label) {
        if (id === 'setting-render-distance') label.textContent = `${v} Chunks`;
        if (id === 'setting-fov') label.textContent = `${v}°`;
        if (id === 'setting-sensitivity') label.textContent = Number(v).toFixed(4);
        if (id === 'setting-volume') label.textContent = `${Math.round(v * 100)} %`;
        if (id === 'setting-day-length') label.textContent = v <= 0 ? 'Off' : `${Math.round(v)} s`;
        if (id === 'setting-autosave-interval') {
          const seconds = Math.round(Number(v));
          const minutes = Math.floor(seconds / 60);
          const remainder = seconds % 60;
          label.textContent = seconds < 60 ? `${seconds} s`
            : remainder ? `${minutes} min ${remainder} s` : `${minutes} min`;
        }
      }
    };
    setVal('setting-render-distance', s.renderDistance);
    setVal('setting-fov', s.fov);
    setVal('setting-sensitivity', s.sensitivity);
    setVal('setting-volume', s.volume);
    setVal('setting-day-length', s.dayLength);
    setVal('setting-autosave-interval', s.autosaveInterval);
    const setSel = (id, v) => { const el = this._el(id); if (el) el.value = v; };
    setSel('setting-particles', s.particles);
    const setChk = (id, v) => { const el = this._el(id); if (el) el.checked = !!v; };
    setChk('setting-invert-y', s.invertY);
    setChk('setting-reduced-motion', s.reduceMotion);
    setChk('setting-debug', s.showDebug);
    setChk('setting-autosave', s.autosave !== false);
  }

  /** Enable save-game buttons in the main menu. */
  setHasSave(has) {
    const btn = this.els['btn-play'];
    const exportButton = this.els['btn-export-save'];
    if (exportButton) exportButton.disabled = !has;
    if (btn) {
      btn.disabled = !has;
      const label = btn.querySelector && btn.querySelector('.play-menu-label');
      if (label && label.parentElement) {
        label.textContent = has ? 'Continue Game' : 'No Saved Game Yet';
        btn.setAttribute('aria-label', has ? 'Continue Game' : 'No saved game available');
      } else {
        btn.textContent = has ? '▸ Continue Game' : '▸ Continue Game (no saved game)';
      }
    }
    const del = this.els['btn-delete-save'];
    if (del) del.style.display = has ? 'inline-block' : 'none';
  }

  // -------------------------------------------------------------------------
  // Inventory + crafting
  // -------------------------------------------------------------------------
  _buildInventoryUI() {
    const root = this.els['inventory-body'];
    if (!root) return;
    root.innerHTML = '';
    root.addEventListener('contextmenu', (e) => e.preventDefault());

    // Player crafting: four slots. The other five are shown only at a crafting table.
    const craftWrap = document.createElement('div');
    craftWrap.className = 'craft-wrap';
    const craftLabel = document.createElement('div');
    craftLabel.className = 'craft-label';
    craftLabel.textContent = 'Player Crafting (2×2)';
    craftWrap.appendChild(craftLabel);
    this.craftLabel = craftLabel;

    const transferControls = document.createElement('div');
    transferControls.className = 'craft-transfer-controls';
    const transferButton = document.createElement('button');
    transferButton.type = 'button';
    transferButton.className = 'craft-transfer-toggle';
    transferButton.textContent = 'Start Single-Item Mode';
    transferButton.setAttribute('aria-pressed', 'false');
    const transferStatus = document.createElement('div');
    transferStatus.className = 'craft-transfer-status';
    transferStatus.setAttribute('aria-live', 'polite');
    transferStatus.textContent = 'Place individual ingredients from the inventory into the 2×2 grid without dragging.';
    transferButton.addEventListener('click', (e) => {
      e.preventDefault();
      if (wasRecentTouch()) return;
      this._toggleSingleTransferMode();
    });
    transferButton.addEventListener('touchend', (e) => {
      e.preventDefault();
      markTouchEvent();
      this._toggleSingleTransferMode();
    });
    transferControls.appendChild(transferButton);
    transferControls.appendChild(transferStatus);
    this.craftWrap = craftWrap;
    this.transferControls = transferControls;
    this.singleTransferButton = transferButton;
    this.transferStatus = transferStatus;

    const craftArea = document.createElement('div');
    craftArea.className = 'craft-area';
    const grid = document.createElement('div');
    grid.className = 'craft-grid player-craft-grid';
    this.craftGridEl = grid;
    this.craftSlotEls = [];
    for (let i = 0; i < 9; i++) {
      const slot = this._makeSlot('craft', i);
      if (i >= 4) slot.el.style.display = 'none';
      grid.appendChild(slot.el);
      this.craftSlotEls.push(slot);
    }
    const arrow = document.createElement('div');
    arrow.className = 'craft-arrow';
    arrow.textContent = '→';
    const resultSlot = this._makeSlot('result', 0);
    resultSlot.el.classList.add('craft-result');
    this.resultSlotEl = resultSlot;
    craftArea.appendChild(grid);
    craftArea.appendChild(arrow);
    craftArea.appendChild(resultSlot.el);
    craftWrap.appendChild(craftArea);

    // Recipe book; collapsed on narrow screens so the inventory fits.
    const book = document.createElement('div');
    book.className = 'recipe-book';
    const bookToggle = document.createElement('button');
    bookToggle.type = 'button';
    bookToggle.className = 'recipe-book-toggle';
    bookToggle.textContent = 'Recipe Book';
    const bookList = document.createElement('div');
    bookList.id = 'inventory-recipe-list';
    bookList.className = 'recipe-list';
    bookToggle.setAttribute('aria-controls', bookList.id);
    let recipeBookExpanded = typeof window === 'undefined'
      || (window.innerWidth > 640 && window.innerHeight > 520);
    const renderRecipeBook = () => {
      book.classList.toggle('collapsed', !recipeBookExpanded);
      bookToggle.setAttribute('aria-expanded', String(recipeBookExpanded));
      bookList.style.display = recipeBookExpanded ? '' : 'none';
    };
    bookToggle.addEventListener('click', () => {
      recipeBookExpanded = !recipeBookExpanded;
      renderRecipeBook();
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => {
        recipeBookExpanded = window.innerWidth > 640 && window.innerHeight > 520;
        renderRecipeBook();
      });
    }
    renderRecipeBook();
    book.appendChild(bookToggle);
    for (const recipe of this.recipeList) {
      const row = document.createElement('div');
      row.className = 'recipe-row';
      const icon = document.createElement('canvas');
      icon.width = 28;
      icon.height = 28;
      icon.className = 'item-icon';
      const def = BLOCKS[recipe.result.id];
      if (def && def.tiles) drawTileIcon(icon, def.tiles[0], this.atlas);
      const text = document.createElement('div');
      text.className = 'recipe-text';
      const names = [...new Set(recipe.ingredients)].map((id) => getName(id));
      text.innerHTML = `<b>${recipe.name}</b><br><small>= ${recipe.result.count}× ${getName(recipe.result.id)}<br>requires: ${names.join(', ')}</small>`;
      row.appendChild(icon);
      row.appendChild(text);
      bookList.appendChild(row);
    }
    book.appendChild(bookList);
    this.recipeBook = book;
    this.recipeBookToggle = bookToggle;
    this.recipeListEl = bookList;

    // Furnace: input, fuel, and output slots plus animated status bars.
    const furnacePanel = document.createElement('section');
    furnacePanel.className = 'furnace-panel';
    furnacePanel.style.display = 'none';
    const furnaceLayout = document.createElement('div');
    furnaceLayout.className = 'furnace-layout';
    this.furnaceSlotEls = [];
    const addFurnaceSlot = (labelText, index, className) => {
      const group = document.createElement('div');
      group.className = `furnace-slot-group ${className}`;
      const label = document.createElement('span');
      label.className = 'furnace-slot-label';
      label.textContent = labelText;
      const slot = this._makeSlot('container', index);
      slot.el.setAttribute('aria-label', labelText);
      group.appendChild(label);
      group.appendChild(slot.el);
      this.furnaceSlotEls[index] = slot;
      return group;
    };
    const inputAndFuel = document.createElement('div');
    inputAndFuel.className = 'furnace-input-column';
    inputAndFuel.appendChild(addFurnaceSlot('Input', 0, 'furnace-input'));
    inputAndFuel.appendChild(addFurnaceSlot('Fuel', 1, 'furnace-fuel'));

    const meters = document.createElement('div');
    meters.className = 'furnace-meters';
    const burnLabel = document.createElement('span');
    burnLabel.className = 'furnace-slot-label';
    burnLabel.textContent = 'Fire';
    const burnTrack = document.createElement('div');
    burnTrack.className = 'furnace-meter furnace-burn-track';
    const burnFill = document.createElement('div');
    burnFill.className = 'furnace-meter-fill furnace-burn-fill';
    burnTrack.appendChild(burnFill);
    const furnaceArrow = document.createElement('div');
    furnaceArrow.className = 'furnace-cook-arrow';
    furnaceArrow.textContent = '➜';
    const progressLabel = document.createElement('span');
    progressLabel.className = 'furnace-slot-label';
    progressLabel.textContent = 'Smelting';
    const progressTrack = document.createElement('div');
    progressTrack.className = 'furnace-meter furnace-progress-track';
    const progressFill = document.createElement('div');
    progressFill.className = 'furnace-meter-fill furnace-progress-fill';
    progressTrack.appendChild(progressFill);
    meters.appendChild(burnLabel);
    meters.appendChild(burnTrack);
    meters.appendChild(furnaceArrow);
    meters.appendChild(progressLabel);
    meters.appendChild(progressTrack);
    this.furnaceBurnFill = burnFill;
    this.furnaceProgressFill = progressFill;

    furnaceLayout.appendChild(inputAndFuel);
    furnaceLayout.appendChild(meters);
    furnaceLayout.appendChild(addFurnaceSlot('Result', 2, 'furnace-output'));
    furnacePanel.appendChild(furnaceLayout);
    const furnaceStatus = document.createElement('div');
    furnaceStatus.className = 'furnace-status';
    furnaceStatus.setAttribute('aria-live', 'polite');
    furnacePanel.appendChild(furnaceStatus);
    const furnaceHint = document.createElement('div');
    furnaceHint.className = 'furnace-hint';
    furnaceHint.textContent = 'Smelt ores, sand, clay, wood, and raw food. Coal, charcoal, and wood can be used as fuel.';
    furnacePanel.appendChild(furnaceHint);
    this.furnacePanel = furnacePanel;
    this.furnaceStatus = furnaceStatus;

    // Chest: 27 persistent slots, arranged in three touch-friendly rows on mobile.
    const chestPanel = document.createElement('section');
    chestPanel.className = 'chest-panel';
    chestPanel.style.display = 'none';
    const chestLabel = document.createElement('div');
    chestLabel.className = 'craft-label';
    chestLabel.textContent = 'Chest Contents';
    chestPanel.appendChild(chestLabel);
    const chestGrid = document.createElement('div');
    chestGrid.className = 'inv-grid chest-grid';
    this.chestSlotEls = [];
    for (let i = 0; i < 27; i++) {
      const slot = this._makeSlot('container', i);
      chestGrid.appendChild(slot.el);
      this.chestSlotEls.push(slot);
    }
    chestPanel.appendChild(chestGrid);
    this.chestPanel = chestPanel;
    this.inventoryTitle = this.els['inventory-title'] || this._el('inventory-title');

    // Equipment area and simple pixel character preview. Armor slots accept
    // only items with a matching, actual item definition.
    const playerSidePanel = document.createElement('section');
    playerSidePanel.className = 'player-side-panel';
    const characterHeading = document.createElement('div');
    characterHeading.className = 'craft-label';
    characterHeading.textContent = 'Character & Equipment';
    playerSidePanel.appendChild(characterHeading);

    const equipmentStage = document.createElement('div');
    equipmentStage.className = 'equipment-stage';
    const armorColumn = document.createElement('div');
    armorColumn.className = 'equipment-column';
    this.equipmentSlotEls = {};
    const equipmentLabels = { head: 'Head', chest: 'Chest', legs: 'Legs', feet: 'Feet', offhand: 'Off-hand' };
    for (const slotName of EQUIPMENT_SLOTS.slice(0, 4)) {
      const group = document.createElement('div');
      group.className = 'equipment-slot-group';
      const label = document.createElement('span');
      label.className = 'equipment-slot-label';
      label.textContent = equipmentLabels[slotName];
      const slot = this._makeSlot('equipment', EQUIPMENT_SLOTS.indexOf(slotName));
      slot.el.setAttribute('aria-label', `${equipmentLabels[slotName]} equipment`);
      group.appendChild(label);
      group.appendChild(slot.el);
      this.equipmentSlotEls[slotName] = slot;
      armorColumn.appendChild(group);
    }
    const characterFigure = document.createElement('div');
    characterFigure.className = 'character-figure';
    const characterCanvas = document.createElement('canvas');
    characterCanvas.width = 96;
    characterCanvas.height = 128;
    characterCanvas.className = 'character-preview';
    characterCanvas.setAttribute('role', 'img');
    characterCanvas.setAttribute('aria-label', 'Pixel character preview');
    this.characterCanvas = characterCanvas;
    this._drawCharacterPreview();
    const characterCaption = document.createElement('span');
    characterCaption.className = 'character-caption';
    characterCaption.textContent = 'Player';
    characterFigure.appendChild(characterCanvas);
    characterFigure.appendChild(characterCaption);

    const offhandGroup = document.createElement('div');
    offhandGroup.className = 'equipment-slot-group offhand-slot-group';
    const offhandLabel = document.createElement('span');
    offhandLabel.className = 'equipment-slot-label';
    offhandLabel.textContent = equipmentLabels.offhand;
    const offhandSlot = this._makeSlot('equipment', EQUIPMENT_SLOTS.indexOf('offhand'));
    offhandSlot.el.setAttribute('aria-label', 'Off-hand');
    this.equipmentSlotEls.offhand = offhandSlot;
    offhandGroup.appendChild(offhandLabel);
    offhandGroup.appendChild(offhandSlot.el);

    equipmentStage.appendChild(armorColumn);
    equipmentStage.appendChild(characterFigure);
    equipmentStage.appendChild(offhandGroup);
    playerSidePanel.appendChild(equipmentStage);
    playerSidePanel.appendChild(craftWrap);
    this.playerSidePanel = playerSidePanel;

    // Inventory grid
    const invWrap = document.createElement('div');
    invWrap.className = 'inv-wrap';
    const invLabel = document.createElement('div');
    invLabel.className = 'craft-label';
    invLabel.textContent = 'Inventory';
    invWrap.appendChild(invLabel);

    this.invSlotEls = [];
    const invGrid = document.createElement('div');
    invGrid.className = 'inv-grid';
    for (let i = 9; i < 36; i++) {
      const slot = this._makeSlot('inv', i);
      invGrid.appendChild(slot.el);
      this.invSlotEls.push(slot);
    }
    invWrap.appendChild(invGrid);

    const hotLabel = document.createElement('div');
    hotLabel.className = 'craft-label';
    hotLabel.textContent = 'Hotbar';
    invWrap.appendChild(hotLabel);
    const hotGrid = document.createElement('div');
    hotGrid.className = 'inv-grid hotbar-inv';
    for (let i = 0; i < 9; i++) {
      const slot = this._makeSlot('inv', i);
      hotGrid.appendChild(slot.el);
      this.invSlotEls.push(slot);
    }
    invWrap.appendChild(hotGrid);

    // Floating stack display
    const floating = document.createElement('div');
    floating.id = 'floating-stack';
    floating.style.display = 'none';
    invWrap.appendChild(floating);
    this.floatingEl = floating;

    const inventoryLayout = document.createElement('div');
    inventoryLayout.className = 'player-inventory-layout';
    inventoryLayout.appendChild(playerSidePanel);
    inventoryLayout.appendChild(invWrap);
    this.inventoryLayout = inventoryLayout;

    // Keep the crafting toggle visible at the top even when the slot area scrolls.
    root.appendChild(transferControls);
    root.appendChild(furnacePanel);
    root.appendChild(chestPanel);
    root.appendChild(inventoryLayout);
    root.appendChild(book);

    const tooltip = document.createElement('div');
    tooltip.className = 'inventory-tooltip';
    tooltip.style.display = 'none';
    if (document.body?.appendChild) document.body.appendChild(tooltip);
    else root.appendChild(tooltip);
    this.inventoryTooltip = tooltip;

    this._bindInventoryTouchDrag();
    this._bindDesktopInventoryMouse();

    // Close inventory (X)
    const close = this.els['btn-close-inventory'];
    if (close) {
      const closeFn = () => {
        if (this.cb.onCloseInventory) this.cb.onCloseInventory();
        else {
          this.closeActiveInventory();
          this.hideAll();
        }
      };
      close.addEventListener('click', () => {
        if (wasRecentTouch()) return;
        closeFn();
      });
      close.addEventListener('touchend', (e) => {
        e.preventDefault();
        markTouchEvent();
        closeFn();
      });
    }
  }

  _drawCharacterPreview() {
    const context = this.characterCanvas?.getContext?.('2d');
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, 96, 128);
    context.fillStyle = 'rgba(5, 8, 12, 0.3)';
    context.fillRect(5, 4, 86, 120);
    // A neutral pixel model serves as the preview; the project currently defines
    // no armor or player-skin items.
    context.fillStyle = '#263238';
    context.fillRect(33, 86, 13, 31);
    context.fillRect(50, 86, 13, 31);
    context.fillStyle = '#293b56';
    context.fillRect(30, 112, 18, 8);
    context.fillRect(48, 112, 18, 8);
    context.fillStyle = '#315a9a';
    context.fillRect(27, 38, 42, 49);
    context.fillRect(18, 41, 10, 35);
    context.fillRect(68, 41, 10, 35);
    context.fillStyle = '#2b4d83';
    context.fillRect(18, 72, 10, 9);
    context.fillRect(68, 72, 10, 9);
    context.fillStyle = '#d8aa82';
    context.fillRect(39, 30, 18, 11);
    context.fillRect(34, 8, 28, 25);
    context.fillStyle = '#503a2d';
    context.fillRect(34, 7, 28, 8);
    context.fillRect(34, 13, 5, 10);
    context.fillStyle = '#263238';
    context.fillRect(40, 19, 4, 4);
    context.fillRect(53, 19, 4, 4);
    context.fillStyle = '#f0d2b7';
    context.fillRect(44, 28, 10, 2);
    context.fillStyle = '#7b5338';
    context.fillRect(27, 38, 42, 4);
    context.fillRect(31, 83, 34, 4);

    // Overlay pixel icons for existing, equipped item definitions on the matching
    // body areas. Without an armor definition, the neutral preview stays unchanged.
    const overlays = {
      head: [32, 5, 32, 30],
      chest: [27, 38, 42, 48],
      legs: [31, 85, 34, 31],
      feet: [30, 111, 19, 13],
      offhand: [8, 53, 20, 24],
    };
    this._characterItemIcons ||= new Map();
    for (const [slot, [x, y, width, height]] of Object.entries(overlays)) {
      const stack = this.inventory?.getEquipment?.(slot);
      const def = stack && BLOCKS[stack.id];
      if (!def?.tiles?.length) continue;
      let icon = this._characterItemIcons.get(stack.id);
      if (!icon) {
        icon = document.createElement('canvas');
        icon.width = 32;
        icon.height = 32;
        drawTileIcon(icon, def.tiles[0], this.atlas);
        this._characterItemIcons.set(stack.id, icon);
      }
      context.drawImage(icon, x, y, width, height);
      context.strokeStyle = 'rgba(12, 16, 22, 0.72)';
      context.lineWidth = 1;
      context.strokeRect(x, y, width, height);
    }
  }

  _makeSlot(kind, index) {
    const el = document.createElement('div');
    el.className = 'inv-slot';
    el.dataset.slotKind = kind;
    el.dataset.slotIndex = String(index);
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    canvas.className = 'item-icon';
    const count = document.createElement('span');
    count.className = 'item-count';
    const dur = document.createElement('div');
    dur.className = 'durability-bar';
    dur.innerHTML = '<div></div>';
    el.appendChild(canvas);
    el.appendChild(count);
    el.appendChild(dur);

    const slot = { el, canvas, count, dur, durFill: dur.firstChild, kind, index, stack: null };

    if (typeof window !== 'undefined' && typeof window.PointerEvent === 'function') {
      el.addEventListener('pointerdown', (e) => this._startInventoryPointer(e, kind, index), { passive: false });
    } else {
      el.addEventListener('touchstart', (e) => this._startInventoryTouch(e, kind, index), { passive: false });
    }
    el.addEventListener('mousedown', (e) => this._startDesktopInventoryMouse(e, kind, index));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    return slot;
  }

  _bindInventoryTouchDrag() {
    if (typeof document === 'undefined' || !document.addEventListener || this._inventoryDragBound) return;
    this._inventoryDragBound = true;
    if (typeof window !== 'undefined' && typeof window.PointerEvent === 'function') {
      document.addEventListener('pointermove', (e) => this._moveInventoryPointer(e), { passive: false });
      document.addEventListener('pointerup', (e) => this._endInventoryPointer(e), { passive: false });
      document.addEventListener('pointercancel', (e) => this._cancelInventoryPointer(e), { passive: false });
    } else {
      // Fallback for older touch browsers without Pointer Events.
      document.addEventListener('touchmove', (e) => this._moveInventoryTouch(e), { passive: false });
      document.addEventListener('touchend', (e) => this._endInventoryTouch(e), { passive: false });
      document.addEventListener('touchcancel', (e) => this._cancelInventoryTouch(e), { passive: false });
    }
  }

  _bindDesktopInventoryMouse() {
    if (typeof document === 'undefined' || !document.addEventListener || this._desktopMouseBound) return;
    this._desktopMouseBound = true;
    document.addEventListener('mousemove', (e) => this._moveDesktopInventoryMouse(e));
    document.addEventListener('mouseup', (e) => this._endDesktopInventoryMouse(e));
  }

  _sameSlot(a, b) {
    return !!a && !!b && a.kind === b.kind && a.index === b.index;
  }

  _startDesktopInventoryMouse(e, kind, index) {
    if (wasRecentTouch() || (e.button !== 0 && e.button !== 2)) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.shiftKey) {
      if (!this.singleTransferMode && e.button === 0) this._shiftClick(kind, index);
      return;
    }

    if (this.singleTransferMode) {
      if (e.button === 0) this._slotClick(kind, index, 0);
      return;
    }

    const pickedUpAtStart = !this.heldStack;
    if (pickedUpAtStart) {
      this._slotClick(kind, index, e.button);
      if (!this.heldStack) return;
    }
    const gesture = {
      button: e.button,
      startTarget: { kind, index },
      pickedUpAtStart,
      targets: [],
      hoverTarget: null,
    };
    this._mouseGesture = gesture;
    if (!pickedUpAtStart) this._recordMouseDropTarget(gesture, { kind, index });
    if (this.heldStack) this._positionFloatingStack(e);
  }

  _moveDesktopInventoryMouse(e) {
    if (this.heldStack) this._positionFloatingStack(e);
    const target = this._slotAtPoint(e.clientX, e.clientY);
    this._updateInventoryHover(target, e);

    const gesture = this._mouseGesture;
    if (!gesture) return;
    if (gesture.hoverTarget?.el && gesture.hoverTarget.el !== target?.el) {
      gesture.hoverTarget.el.classList.remove('drag-over');
    }
    if (target?.el) target.el.classList.add('drag-over');
    gesture.hoverTarget = target;

    if (target && !(gesture.pickedUpAtStart && this._sameSlot(target, gesture.startTarget))) {
      this._recordMouseDropTarget(gesture, target);
    }
  }

  _updateInventoryHover(target, point = null) {
    const previous = this._hoveredInventorySlot;
    if (previous?.el && previous.el !== target?.el) previous.el.classList.remove('hovered');
    if (target?.el) target.el.classList.add('hovered');
    this._hoveredInventorySlot = target || null;

    const tooltip = this.inventoryTooltip;
    const stack = target ? this._getSlotStack(target.kind, target.index) : null;
    if (!tooltip || !stack) {
      if (tooltip) tooltip.style.display = 'none';
      return;
    }

    const def = BLOCKS[stack.id];
    const durability = def?.durability > 0 && stack.dur != null
      ? ` · Durability ${stack.dur}/${def.durability}`
      : '';
    tooltip.textContent = `${getName(stack.id)}${stack.count > 1 ? ` ×${stack.count}` : ''}${durability}`;
    tooltip.style.display = 'block';
    if (point) {
      const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
      const width = tooltip.offsetWidth || 190;
      const height = tooltip.offsetHeight || 30;
      tooltip.style.left = `${Math.max(8, Math.min(point.clientX + 14, viewportWidth - width - 8))}px`;
      tooltip.style.top = `${Math.max(8, Math.min(point.clientY + 14, viewportHeight - height - 8))}px`;
    }
  }

  _endDesktopInventoryMouse(e) {
    const gesture = this._mouseGesture;
    if (!gesture || (e.button != null && e.button !== gesture.button)) return;
    const endTarget = this._slotAtPoint(e.clientX, e.clientY);
    const endedOnSameSlot = this._sameSlot(endTarget, gesture.startTarget);
    const endedOnDifferentSlot = !!endTarget && !endedOnSameSlot;

    if (gesture.pickedUpAtStart) {
      // When picking up by dragging, keep the stack on the cursor after a simple
      // click. Releasing over another slot places it.
      if (endedOnDifferentSlot) {
        this._recordMouseDropTarget(gesture, endTarget);
        this._distributeMouseStack(gesture.button, gesture.targets);
      }
    } else if (endedOnSameSlot) {
      // Not an actual drag: use normal Minecraft left/right-click rules,
      // including swapping different stacks.
      this._slotClick(gesture.startTarget.kind, gesture.startTarget.index, gesture.button);
    } else if (endedOnDifferentSlot) {
      this._recordMouseDropTarget(gesture, endTarget);
      this._distributeMouseStack(gesture.button, gesture.targets);
    }

    if (gesture.hoverTarget?.el) gesture.hoverTarget.el.classList.remove('drag-over');
    this._mouseGesture = null;
  }

  _canPlaceInSlot(kind, index, stack) {
    if (!stack || kind === 'result') return false;
    if (kind === 'inv') return true;
    if (kind === 'craft') return index >= 0 && index < this.craftGrid.length;
    if (kind === 'equipment') return canEquipItem(stack, EQUIPMENT_SLOTS[index]);
    if (kind === 'container') return this._canPlaceInContainer(index, stack);
    return false;
  }

  _mouseTargetCapacity(target) {
    if (!target || !this.heldStack || !this._canPlaceInSlot(target.kind, target.index, this.heldStack)) return 0;
    const current = this._getSlotStack(target.kind, target.index);
    const slotName = target.kind === 'equipment' ? EQUIPMENT_SLOTS[target.index] : null;
    const max = slotName && slotName !== 'offhand' ? 1 : (BLOCKS[this.heldStack.id]?.maxStack || 64);
    if (!current) return max;
    if (stacksEqual(current, this.heldStack)) return Math.max(0, max - current.count);
    return 0;
  }

  _recordMouseDropTarget(gesture, target) {
    if (!target || this._mouseTargetCapacity(target) < 1) return;
    if (gesture.targets.some((candidate) => this._sameSlot(candidate, target))) return;
    gesture.targets.push(target);
  }

  _setSlotStack(kind, index, stack) {
    if (kind === 'inv') this.inventory.setSlot(index, stack);
    else if (kind === 'craft' && index >= 0 && index < this.craftGrid.length) this.craftGrid[index] = stack;
    else if (kind === 'equipment') this.inventory.setEquipment(EQUIPMENT_SLOTS[index], stack);
    else if (kind === 'container' && this.containerSession) this.containerSession.slots[index] = stack;
  }

  _putHeldCountInSlot(target, count) {
    if (!this.heldStack || count < 1 || this._mouseTargetCapacity(target) < count) return 0;
    const current = this._getSlotStack(target.kind, target.index);
    if (current) current.count += count;
    else this._setSlotStack(target.kind, target.index, {
      id: this.heldStack.id,
      count,
      dur: this.heldStack.dur ?? null,
      meta: this.heldStack.meta,
    });
    return count;
  }

  _distributeMouseStack(button, targets) {
    if (!this.heldStack || !targets?.length) return;
    let changed = false;
    if (button === 2) {
      // Minecraft right-drag: exactly one item per eligible slot.
      for (const target of targets) {
        if (!this.heldStack) break;
        const placed = this._putHeldCountInSlot(target, 1);
        if (!placed) continue;
        this.heldStack.count -= placed;
        changed = true;
      }
    } else {
      // Minecraft left-drag: distribute the stack as evenly as possible.
      let remaining = this.heldStack.count;
      let openTargets = targets.filter((target) => this._mouseTargetCapacity(target) > 0).length;
      for (const target of targets) {
        if (remaining <= 0 || openTargets <= 0) break;
        const capacity = this._mouseTargetCapacity(target);
        if (capacity <= 0) continue;
        const share = Math.ceil(remaining / openTargets);
        const placed = this._putHeldCountInSlot(target, Math.min(share, capacity, remaining));
        remaining -= placed;
        openTargets -= 1;
        changed ||= placed > 0;
      }
      this.heldStack.count = remaining;
    }

    if (this.heldStack?.count <= 0) this.heldStack = null;
    if (!changed) return;
    this.refreshInventory();
    if (this.containerSession && this.cb.onContainerChange) {
      this.cb.onContainerChange(this.containerSession.state, this.containerSession.type, -1);
    }
  }

  _getSlotStack(kind, index) {
    if (kind === 'result') return this.craftRemainder || matchRecipe(this.craftGrid);
    if (kind === 'craft') return this.craftGrid[index] || null;
    if (kind === 'container') return this.containerSession?.slots[index] || null;
    if (kind === 'equipment') return this.inventory.getEquipment(EQUIPMENT_SLOTS[index]);
    if (kind === 'inv') return this.inventory.getSlot(index);
    return null;
  }

  _startInventoryPointer(e, kind, index) {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    if (e.isPrimary === false) return;
    e.preventDefault();
    e.stopPropagation();
    markTouchEvent();
    try { e.currentTarget?.setPointerCapture?.(e.pointerId); } catch { /* The document-level fallback is sufficient. */ }

    const sourceStack = this._getSlotStack(kind, index);
    this._slotGesture = {
      inputType: 'pointer',
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      canDrag: !this.singleTransferMode && !this.heldStack && !!sourceStack,
      dragging: false,
      lastTarget: null,
    };

    // Tapping remains available: press to pick up/place; dragging places
    // the selected item at its destination.
    this._slotClick(kind, index);
    if (this.heldStack) this._positionFloatingStack(e);
  }

  _moveInventoryPointer(e) {
    const gesture = this._slotGesture;
    if (!gesture || gesture.inputType !== 'pointer' || e.pointerId !== gesture.pointerId || !gesture.canDrag) return;
    this._updateInventoryDrag(e, e);
  }

  _endInventoryPointer(e) {
    const gesture = this._slotGesture;
    if (!gesture || gesture.inputType !== 'pointer' || e.pointerId !== gesture.pointerId) return;
    if (gesture.dragging) {
      e.preventDefault();
      const target = this._slotAtPoint(e.clientX, e.clientY) || gesture.lastTarget;
      if (target) this._slotClick(target.kind, target.index);
    }
    this._clearInventoryDragTarget();
    this._slotGesture = null;
  }

  _cancelInventoryPointer(e) {
    if (this._slotGesture?.inputType !== 'pointer' || e.pointerId !== this._slotGesture.pointerId) return;
    this._clearInventoryDragTarget();
    this._slotGesture = null;
  }

  _startInventoryTouch(e, kind, index) {
    e.preventDefault();
    e.stopPropagation();
    markTouchEvent();

    const touch = e.changedTouches?.[0] || e.touches?.[0] || null;
    const sourceStack = this._getSlotStack(kind, index);
    const canDrag = !this.singleTransferMode && !this.heldStack && !!sourceStack;
    this._slotGesture = {
      inputType: 'touch',
      touchId: touch?.identifier,
      startX: touch?.clientX ?? 0,
      startY: touch?.clientY ?? 0,
      canDrag,
      dragging: false,
      lastTarget: null,
    };

    // Tapping is unchanged: the item is immediately picked up or placed.
    this._slotClick(kind, index);
    if (this.heldStack && touch) this._positionFloatingStack(touch);
  }

  _touchForSlotGesture(e) {
    const gesture = this._slotGesture;
    if (!gesture || gesture.inputType !== 'touch') return null;
    const find = (list) => {
      if (!list) return null;
      const touches = Array.from(list);
      return touches.find((touch) => touch.identifier === gesture.touchId) || null;
    };
    return find(e.changedTouches) || find(e.touches);
  }

  _moveInventoryTouch(e) {
    const gesture = this._slotGesture;
    const touch = this._touchForSlotGesture(e);
    if (!gesture || gesture.inputType === 'pointer' || !touch || !gesture.canDrag) return;
    this._updateInventoryDrag(e, touch);
  }

  _updateInventoryDrag(event, point) {
    const gesture = this._slotGesture;
    if (!gesture || !point || !gesture.canDrag) return;
    if (!gesture.dragging && Math.hypot(point.clientX - gesture.startX, point.clientY - gesture.startY) >= 8) {
      gesture.dragging = true;
    }
    if (!gesture.dragging) return;

    event.preventDefault();
    markTouchEvent();
    this._positionFloatingStack(point);
    this._setInventoryDragTarget(this._slotAtPoint(point.clientX, point.clientY));
  }

  _endInventoryTouch(e) {
    const gesture = this._slotGesture;
    const touch = this._touchForSlotGesture(e);
    if (!gesture || !touch) return;

    if (gesture.dragging) {
      e.preventDefault();
      const target = this._slotAtPoint(touch.clientX, touch.clientY) || gesture.lastTarget;
      if (target) this._slotClick(target.kind, target.index);
    }
    this._clearInventoryDragTarget();
    this._slotGesture = null;
  }

  _cancelInventoryTouch(e) {
    if (!this._slotGesture || !this._touchForSlotGesture(e)) return;
    this._clearInventoryDragTarget();
    this._slotGesture = null;
  }

  _slotAtPoint(x, y) {
    if (typeof document === 'undefined' || !document.elementFromPoint) return null;
    const hit = document.elementFromPoint(x, y);
    const slotEl = hit?.closest?.('.inv-slot') || (hit?.dataset?.slotKind ? hit : null);
    const kind = slotEl?.dataset?.slotKind;
    const index = Number(slotEl?.dataset?.slotIndex);
    if (!slotEl || !['inv', 'craft', 'result', 'container', 'equipment'].includes(kind) || !Number.isInteger(index)) return null;
    return { el: slotEl, kind, index };
  }

  _setInventoryDragTarget(target) {
    const gesture = this._slotGesture;
    if (!gesture) return;
    if (gesture.lastTarget?.el && gesture.lastTarget.el !== target?.el) {
      gesture.lastTarget.el.classList.remove('drag-over');
    }
    if (target?.el) target.el.classList.add('drag-over');
    gesture.lastTarget = target;
  }

  _clearInventoryDragTarget() {
    const target = this._slotGesture?.lastTarget;
    if (target?.el) target.el.classList.remove('drag-over');
  }

  _positionFloatingStack(touch) {
    const floating = this.floatingEl;
    if (!floating || !touch) return;
    const viewportWidth = (typeof window !== 'undefined' ? window.innerWidth : 0) || document.documentElement?.clientWidth || 0;
    const viewportHeight = (typeof window !== 'undefined' ? window.innerHeight : 0) || document.documentElement?.clientHeight || 0;
    const width = floating.offsetWidth || 140;
    const height = floating.offsetHeight || 48;
    const left = Math.max(8, Math.min(touch.clientX + 14, viewportWidth - width - 8));
    const top = Math.max(8, Math.min(touch.clientY + 14, viewportHeight - height - 8));
    floating.style.left = `${left}px`;
    floating.style.top = `${top}px`;
  }

  _toggleSingleTransferMode() {
    this._setSingleTransferMode(!this.singleTransferMode);
  }

  _setSingleTransferMode(active) {
    active = !!active;
    if (active === this.singleTransferMode) return;
    this._clearInventoryDragTarget();
    this._slotGesture = null;
    if (active && this.heldStack) this._dropHeld();

    this.singleTransferMode = active;
    this.transferSourceIndex = -1;
    if (this.singleTransferButton) {
      this.singleTransferButton.textContent = active
        ? 'Stop Single-Item Mode'
        : 'Start Single-Item Mode';
      this.singleTransferButton.setAttribute('aria-pressed', String(active));
      this.singleTransferButton.classList.toggle('active', active);
    }
    this.refreshInventory();
  }

  _selectTransferSource(index) {
    const stack = this.inventory.getSlot(index);
    if (!stack || stack.count < 1) {
      this.transferSourceIndex = -1;
      this.refreshInventory();
      if (this.transferStatus) this.transferStatus.textContent = 'That inventory slot is empty. Select an occupied slot.';
      return;
    }
    this.transferSourceIndex = index;
    this.refreshInventory();
    this.craftWrap?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }

  _transferOneToCraft(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.craftGrid.length) return;
    const sourceIndex = this.transferSourceIndex;
    const source = sourceIndex >= 0 ? this.inventory.getSlot(sourceIndex) : null;
    if (!source || source.count < 1) {
      this.transferSourceIndex = -1;
      this.refreshInventory();
      return;
    }

    const target = this.craftGrid[index];
    if (target) {
      const maxStack = BLOCKS[source.id]?.maxStack || 64;
      const canStack = stacksEqual(target, source) && target.count < maxStack;
      if (!canStack) {
        if (this.transferStatus) {
          this.transferStatus.textContent = target.id !== source.id
            ? `This slot contains ${getName(target.id)}. Select an empty or matching slot.`
            : 'This stack is full. Select another crafting slot.';
        }
        return;
      }
      target.count += 1;
    } else {
      this.craftGrid[index] = makeStack(source.id, 1, source.dur, source.meta);
    }

    source.count -= 1;
    if (source.count <= 0) {
      this.inventory.setSlot(sourceIndex, null);
      this.transferSourceIndex = -1;
    }
    this.refreshInventory();
  }

  _canPlaceInContainer(index, stack) {
    const session = this.containerSession;
    if (!session || !stack) return false;
    if (session.type === 'chest') return index >= 0 && index < session.slots.length;
    if (session.type === 'furnace') return canPlaceFurnaceItem(index, stack.id);
    return false;
  }

  _showContainerNotice(text) {
    this.containerNotice = { text, expiresAt: Date.now() + 1800 };
    if (this.furnaceStatus) this.furnaceStatus.textContent = text;
  }

  _furnaceOutputClick(button = 0) {
    const session = this.containerSession;
    const output = session?.type === 'furnace' ? session.slots[2] : null;
    if (!output) return;

    if (!this.heldStack) {
      const count = button === 2 ? Math.ceil(output.count / 2) : output.count;
      this.heldStack = { ...output, count };
      output.count -= count;
      if (output.count <= 0) session.slots[2] = null;
    } else if (this.heldStack.id === output.id
        && this.heldStack.dur == null && output.dur == null) {
      const max = BLOCKS[output.id]?.maxStack || 64;
      const count = button === 2
        ? Math.min(1, output.count, max - this.heldStack.count)
        : Math.min(output.count, max - this.heldStack.count);
      if (count <= 0) return;
      this.heldStack.count += count;
      output.count -= count;
      if (output.count <= 0) session.slots[2] = null;
    } else {
      return;
    }

    this.cb.onContainerChange && this.cb.onContainerChange(session.state, session.type, 2);
    this.refreshInventory();
  }

  _containerSlotClick(index, button = 0) {
    const session = this.containerSession;
    if (!session || !Number.isInteger(index) || index < 0 || index >= session.slots.length) return;
    if (session.type === 'furnace' && index === 2) {
      this._furnaceOutputClick(button);
      return;
    }

    if (this.heldStack && !this._canPlaceInContainer(index, this.heldStack)) {
      if (session.type === 'furnace') {
        this._showContainerNotice(index === 1
          ? 'This item is not a fuel.'
          : 'This item cannot be smelted.');
      }
      return;
    }
    if (!this._handleStackSlotClick('container', index, button)) return;

    this.containerNotice = null;
    this.cb.onContainerChange && this.cb.onContainerChange(session.state, session.type, index);
    this.refreshInventory();
  }

  _handleStackSlotClick(kind, index, button = 0) {
    const current = this._getSlotStack(kind, index);
    const rightClick = button === 2;

    if (!this.heldStack) {
      if (!current) return false;
      if (rightClick) {
        const count = Math.ceil(current.count / 2);
        this.heldStack = { ...current, count };
        current.count -= count;
        if (current.count <= 0) this._setSlotStack(kind, index, null);
      } else {
        this.heldStack = current;
        this._setSlotStack(kind, index, null);
      }
      return true;
    }

    if (!this._canPlaceInSlot(kind, index, this.heldStack)) return false;
    if (!current) {
      const equipmentSlot = kind === 'equipment' ? EQUIPMENT_SLOTS[index] : null;
      const singleEquipmentItem = equipmentSlot && equipmentSlot !== 'offhand';
      if (rightClick || singleEquipmentItem) {
        this._setSlotStack(kind, index, {
          id: this.heldStack.id,
          count: 1,
          dur: this.heldStack.dur ?? null,
          meta: this.heldStack.meta,
        });
        this.heldStack.count -= 1;
        if (this.heldStack.count <= 0) this.heldStack = null;
      } else {
        this._setSlotStack(kind, index, this.heldStack);
        this.heldStack = null;
      }
      return true;
    }

    if (stacksEqual(current, this.heldStack)) {
      const equipmentSlot = kind === 'equipment' ? EQUIPMENT_SLOTS[index] : null;
      const max = equipmentSlot && equipmentSlot !== 'offhand'
        ? 1
        : (BLOCKS[current.id]?.maxStack || 64);
      const available = Math.max(0, max - current.count);
      const moved = rightClick
        ? Math.min(1, available, this.heldStack.count)
        : Math.min(available, this.heldStack.count);
      if (!moved) return false;
      current.count += moved;
      this.heldStack.count -= moved;
      if (this.heldStack.count <= 0) this.heldStack = null;
      return true;
    }

    if (!rightClick && this._canPlaceInSlot(kind, index, current)) {
      this._setSlotStack(kind, index, this.heldStack);
      this.heldStack = current;
      return true;
    }
    return false;
  }

  _inventoryTargets(indices = null) {
    const order = indices || Array.from({ length: 36 }, (_, index) => index);
    return order.map((index) => ({ kind: 'inv', index }));
  }

  _inventoryCapacity(stack) {
    if (!stack) return 0;
    const def = BLOCKS[stack.id];
    const max = Math.max(1, Number(def?.maxStack) || 64);
    let capacity = 0;
    for (const current of this.inventory.slots) {
      if (!current) capacity += max;
      else if (max > 1 && stacksEqual(current, stack)) capacity += Math.max(0, max - current.count);
    }
    return capacity;
  }

  _consumeCraftIngredients() {
    for (let i = 0; i < this.craftGrid.length; i++) {
      const stack = this.craftGrid[i];
      if (!stack) continue;
      stack.count -= 1;
      if (stack.count <= 0) this.craftGrid[i] = null;
    }
  }

  _craftResultIntoInventory() {
    if (this.heldStack) return false;
    let changed = false;
    for (let crafts = 0; crafts < 128; crafts++) {
      if (this.craftRemainder) {
        const remainder = this.craftRemainder;
        const amount = Math.min(remainder.count, this._inventoryCapacity(remainder));
        if (amount <= 0) break;
        const leftover = this.inventory.add(remainder.id, amount, remainder.dur, remainder.meta);
        const moved = amount - leftover;
        if (moved <= 0) break;
        remainder.count -= moved;
        if (remainder.count <= 0) this.craftRemainder = null;
        changed = true;
        if (leftover > 0) break;
        continue;
      }

      const result = matchRecipe(this.craftGrid);
      if (!result) break;
      const resultStack = makeStack(result.id, result.count);
      if (!resultStack || this._inventoryCapacity(resultStack) < result.count) break;
      const leftover = this.inventory.add(result.id, result.count, resultStack.dur, resultStack.meta);
      if (leftover > 0) break;
      this._consumeCraftIngredients();
      this.cb.onCraft && this.cb.onCraft(result);
      changed = true;
    }
    if (changed) this.refreshInventory();
    return changed;
  }

  _shiftClick(kind, index) {
    if (kind === 'result') {
      this._craftResultIntoInventory();
      return;
    }
    const sourceStack = this._getSlotStack(kind, index);
    if (!sourceStack) return;

    if (kind === 'inv') {
      if (this.containerSession?.type === 'chest') {
        this._transferStackBetweenSlots(kind, index,
          Array.from({ length: this.containerSession.slots.length }, (_, targetIndex) => ({ kind: 'container', index: targetIndex })));
        return;
      }
      if (this.containerSession?.type === 'furnace') {
        const targetIndex = canPlaceFurnaceItem(0, sourceStack.id) ? 0
          : canPlaceFurnaceItem(1, sourceStack.id) ? 1 : -1;
        if (targetIndex >= 0) this._transferStackBetweenSlots(kind, index, [{ kind: 'container', index: targetIndex }]);
        return;
      }

      const equipmentSlot = EQUIPMENT_SLOTS.find((slot) =>
        canEquipItem(sourceStack, slot) && !this.inventory.getEquipment(slot));
      if (equipmentSlot) {
        const moved = this._transferStackBetweenSlots(kind, index, [
          { kind: 'equipment', index: EQUIPMENT_SLOTS.indexOf(equipmentSlot) },
        ]);
        if (moved) return;
      }
      const targets = index < 9
        ? Array.from({ length: 27 }, (_, offset) => ({ kind: 'inv', index: offset + 9 }))
        : Array.from({ length: 9 }, (_, targetIndex) => ({ kind: 'inv', index: targetIndex }));
      this._transferStackBetweenSlots(kind, index, targets);
      return;
    }

    if (kind === 'container' && this.containerSession?.type === 'furnace' && index === 2) {
      this._transferStackBetweenSlots(kind, index, this._inventoryTargets());
      return;
    }
    if (kind === 'container' || kind === 'craft' || kind === 'equipment') {
      this._transferStackBetweenSlots(kind, index, this._inventoryTargets());
    }
  }

  _transferStackBetweenSlots(sourceKind, sourceIndex, targets) {
    const original = this._getSlotStack(sourceKind, sourceIndex);
    if (!original) return false;
    let remaining = original.count;
    const moving = { ...original };
    let changed = false;

    // Fill compatible stacks first, then use empty slots.
    for (let pass = 0; pass < 2 && remaining > 0; pass++) {
      for (const target of targets) {
        if (remaining <= 0 || (target.kind === sourceKind && target.index === sourceIndex)) continue;
        if (!this._canPlaceInSlot(target.kind, target.index, moving)) continue;
        const current = this._getSlotStack(target.kind, target.index);
        const mergeTarget = !!current && stacksEqual(current, moving);
        if (pass === 0 ? !mergeTarget : !!current) continue;

        const equipmentSlot = target.kind === 'equipment' ? EQUIPMENT_SLOTS[target.index] : null;
        const max = equipmentSlot && equipmentSlot !== 'offhand'
          ? 1
          : Math.max(1, Number(BLOCKS[moving.id]?.maxStack) || 64);
        const capacity = current ? Math.max(0, max - current.count) : max;
        const amount = Math.min(remaining, capacity);
        if (amount <= 0) continue;

        if (current) current.count += amount;
        else this._setSlotStack(target.kind, target.index, { ...moving, count: amount });
        remaining -= amount;
        changed = true;
      }
    }

    if (!changed) return false;
    this._setSlotStack(sourceKind, sourceIndex, remaining > 0 ? { ...original, count: remaining } : null);
    this.refreshInventory();
    if (this.containerSession && this.cb.onContainerChange) {
      this.cb.onContainerChange(this.containerSession.state, this.containerSession.type, -1);
    }
    return true;
  }

  _slotClick(kind, index, button = 0) {
    if (kind === 'result') {
      if (button === 0 || button === 2) this._takeCraftResult(button);
      return;
    }
    if (kind === 'container') {
      this._containerSlotClick(index, button);
      return;
    }
    if (this.singleTransferMode) {
      if (button === 0) {
        if (kind === 'inv') this._selectTransferSource(index);
        else if (kind === 'craft') this._transferOneToCraft(index);
      }
      return;
    }
    if (!this._handleStackSlotClick(kind, index, button)) return;
    this.refreshInventory();
    if (this.containerSession && kind === 'inv' && this.cb.onContainerChange) {
      this.cb.onContainerChange(this.containerSession.state, this.containerSession.type, index);
    }
  }

  _takeCraftResult(button = 0) {
    const result = this.craftRemainder || matchRecipe(this.craftGrid);
    if (!result) return false;
    const rightClick = button === 2;
    const outputCount = rightClick ? 1 : result.count;
    const maxStack = Math.max(1, Number(BLOCKS[result.id]?.maxStack) || 64);
    if (outputCount > maxStack) return false;
    const resultStack = makeStack(result.id, outputCount, result.dur, result.meta);
    if (!resultStack) return false;
    if (this.heldStack) {
      if (!stacksEqual(this.heldStack, resultStack)) return false;
      if (this.heldStack.count + outputCount > maxStack) return false;
    }

    if (!this.heldStack) this.heldStack = resultStack;
    else this.heldStack.count += outputCount;
    if (!this.heldStack) return false;

    if (this.craftRemainder) {
      this.craftRemainder.count -= outputCount;
      if (this.craftRemainder.count <= 0) this.craftRemainder = null;
    } else {
      this._consumeCraftIngredients();
      const uncollected = result.count - outputCount;
      if (uncollected > 0) this.craftRemainder = makeStack(result.id, uncollected, result.dur, result.meta);
      this.cb.onCraft && this.cb.onCraft(result);
    }
    this.refreshInventory();
    return true;
  }

  _returnStack(stack) {
    if (!stack) return 0;
    let leftover = this.inventory.add(stack.id, stack.count, stack.dur, stack.meta);
    if (leftover > 0 && this.cb.onDropStack) {
      const dropped = this.cb.onDropStack(stack.id, leftover, { ...stack, count: leftover });
      if (dropped !== false) leftover = 0;
    }
    return leftover;
  }

  _returnCraftGrid() {
    for (let i = 0; i < this.craftGrid.length; i++) {
      const stack = this.craftGrid[i];
      if (!stack) continue;
      const leftover = this._returnStack(stack);
      this.craftGrid[i] = leftover > 0 ? { ...stack, count: leftover } : null;
    }
    this.refreshInventory();
  }

  _returnCraftRemainder() {
    if (!this.craftRemainder) return;
    const stack = this.craftRemainder;
    const leftover = this._returnStack(stack);
    this.craftRemainder = leftover > 0 ? { ...stack, count: leftover } : null;
    this.refreshInventory();
  }

  _dropHeld() {
    if (!this.heldStack) return;
    const stack = this.heldStack;
    const leftover = this._returnStack(stack);
    this.heldStack = leftover > 0 ? { ...stack, count: leftover } : null;
    this.refreshInventory();
  }

  /** Closing deliberately drops the cursor stack into the world. */
  _dropHeldToWorld() {
    if (!this.heldStack) return;
    const stack = { ...this.heldStack };
    if (this.cb.onDropStack) {
      const dropped = this.cb.onDropStack(stack.id, stack.count, stack);
      if (dropped !== false) {
        this.heldStack = null;
        this.refreshInventory();
        return;
      }
    }

    // If no world-drop system is available, lose nothing: try the inventory first
    // and keep any remaining items on the cursor.
    const leftover = this.inventory.add(stack.id, stack.count, stack.dur, stack.meta);
    this.heldStack = leftover > 0 ? { ...stack, count: leftover } : null;
    this.refreshInventory();
  }

  _drawSlot(slot, stack) {
    if (!slot) return;
    slot.stack = stack;
    if (stack) {
      const def = BLOCKS[stack.id];
      const tile = def && def.tiles ? def.tiles[0] : 0;
      drawTileIcon(slot.canvas, tile, this.atlas);
      slot.canvas.style.visibility = 'visible';
      slot.count.textContent = stack.count > 1 ? String(stack.count) : '';
      if (def && def.durability && stack.dur != null) {
        const frac = stack.dur / def.durability;
        slot.dur.style.visibility = 'visible';
        slot.durFill.style.width = `${Math.max(0, frac * 100)}%`;
        slot.durFill.style.background = frac > 0.5 ? '#4caf50' : frac > 0.25 ? '#ffc107' : '#f44336';
      } else {
        slot.dur.style.visibility = 'hidden';
      }
    } else {
      slot.canvas.style.visibility = 'hidden';
      slot.count.textContent = '';
      slot.dur.style.visibility = 'hidden';
    }
  }

  _refreshContainerUI() {
    const session = this.containerSession;
    if (!session) return;
    const signature = `${session.type}:${session.slots.map((stack) => stack
      ? `${stack.id}:${stack.count}:${stack.dur ?? ''}`
      : '-').join('|')}`;
    if (signature !== this.containerSlotSignature) {
      const slots = session.type === 'furnace' ? this.furnaceSlotEls : this.chestSlotEls;
      for (let i = 0; i < slots.length; i++) this._drawSlot(slots[i], session.slots[i] || null);
      this.containerSlotSignature = signature;
    }
    if (session.type !== 'furnace') return;

    const state = session.state;
    const input = state.slots[0];
    const recipe = input ? getSmeltingRecipe(input.id) : null;
    const output = state.slots[2];
    const outputFits = !!recipe && (!output
      || (output.id === recipe.id && output.dur == null
        && output.count + recipe.count <= (BLOCKS[recipe.id]?.maxStack || 64)));
    const progress = recipe ? Math.min(1, Math.max(0, state.progress / recipe.seconds)) : 0;
    const burn = state.burnTotal > 0
      ? Math.min(1, Math.max(0, state.burnRemaining / state.burnTotal))
      : 0;
    if (this.furnaceProgressFill) this.furnaceProgressFill.style.width = `${progress * 100}%`;
    if (this.furnaceBurnFill) this.furnaceBurnFill.style.width = `${burn * 100}%`;

    let status;
    if (!input) status = 'Add a smeltable ingredient.';
    else if (!recipe) status = 'This item cannot be smelted here.';
    else if (!outputFits) status = 'The result slot is full—collect the product first.';
    else if (state.burnRemaining > 0) status = `Smelting ${getName(input.id)} … ${Math.floor(progress * 100)}%`;
    else if (!state.slots[1]) status = 'Fuel required. Add coal, charcoal, or wood.';
    else if (!canPlaceFurnaceItem(1, state.slots[1].id)) status = 'The item in the fuel slot does not burn.';
    else status = 'Ready—the furnace starts automatically.';
    if (this.containerNotice && Date.now() < this.containerNotice.expiresAt) status = this.containerNotice.text;
    else this.containerNotice = null;
    if (this.furnaceStatus) this.furnaceStatus.textContent = status;
  }

  refreshFurnaceUI(state = null) {
    if (this.containerSession?.type !== 'furnace') return;
    if (state && state !== this.containerSession.state) return;
    this._refreshContainerUI();
  }

  /** Refresh all slot images. */
  refreshInventory() {
    for (const slot of this.invSlotEls) {
      this._drawSlot(slot, this.inventory.getSlot(slot.index));
      slot.el.classList.toggle(
        'transfer-source-selected',
        this.singleTransferMode && slot.index === this.transferSourceIndex,
      );
    }
    for (let i = 0; i < this.craftSlotEls.length; i++) {
      this._drawSlot(this.craftSlotEls[i], i < this.craftGrid.length ? this.craftGrid[i] : null);
    }
    for (const slotName of EQUIPMENT_SLOTS) {
      this._drawSlot(this.equipmentSlotEls?.[slotName], this.inventory.getEquipment(slotName));
    }
    this._drawCharacterPreview();
    this._drawSlot(this.resultSlotEl, this._getSlotStack('result', 0));

    this._refreshContainerUI();

    if (this.transferStatus) {
      const selectedSource = this.transferSourceIndex >= 0
        ? this.inventory.getSlot(this.transferSourceIndex)
        : null;
      if (!this.singleTransferMode) {
        this.transferStatus.textContent = `One item per tap: start the mode, select an inventory slot, then tap a ${this.craftingMode === 'workbench' ? '3×3' : '2×2'} crafting slot.`;
      } else if (!selectedSource) {
        this.transferStatus.textContent = `Mode on: tap an occupied inventory slot, then a ${this.craftingMode === 'workbench' ? '3×3' : '2×2'} slot. Each tap moves 1 item.`;
      } else {
        this.transferStatus.textContent = `Selected: ${getName(selectedSource.id)} ×${selectedSource.count}. Tap a crafting slot; each tap moves 1 item.`;
      }
    }

    // Floating stack
    if (this.floatingEl) {
      if (this.heldStack) {
        this.floatingEl.style.display = 'block';
        this.floatingEl.innerHTML = '';
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const def = BLOCKS[this.heldStack.id];
        if (def && def.tiles) drawTileIcon(canvas, def.tiles[0], this.atlas);
        this.floatingEl.appendChild(canvas);
        const label = document.createElement('div');
        label.textContent = `${getName(this.heldStack.id)}${this.heldStack.count > 1 ? ' ×' + this.heldStack.count : ''}`;
        this.floatingEl.appendChild(label);
      } else {
        this.floatingEl.style.display = 'none';
      }
    }
  }

  // -------------------------------------------------------------------------
  // Help text
  // -------------------------------------------------------------------------
  populateHelp(isTouch) {
    const el = this.els['help-content'];
    if (!el) return;
    el.innerHTML = isTouch ? `
      <h3>Mobile Controls</h3>
      <ul>
        <li><b>Left thumb:</b> Use the virtual joystick to move</li>
        <li><b>Touch and hold a block:</b> Mine the block directly under your finger (like Pocket Edition)</li>
        <li><b>Swipe:</b> Look around; swiping does not mine blocks</li>
        <li><b>⬆ button:</b> Jump (double-tap to toggle flying)</li>
        <li><b>⬇ button:</b> Toggle sneaking; descend while flying (highlighted when active)</li>
        <li><b>⛏ button:</b> Mine a block / attack a mob (hold)</li>
        <li><b>▣ button:</b> Place a block / use an item</li>
        <li><b>Backpack:</b> 2×2 player crafting; crafting tables open the 3×3 grid. Tap or drag items.</li>
        <li><b>Equipment:</b> The off-hand is usable; armor slots accept only matching armor items defined in the game.</li>
        <li><b>Furnace/Chest:</b> Look at the block and tap ▣; use slots by tapping or dragging</li>
        <li><b>Single-item mode:</b> Press the toggle at the top of the inventory, select a slot, and tap a crafting slot; each tap places 1 item</li>
        <li>A stack held on the cursor drops in front of the player when the inventory closes.</li>
        <li><b>⛶ button:</b> Toggle fullscreen</li>
        <li><b>⚙ button:</b> Pause / Settings</li>
        <li><b>Hotbar:</b> Tap to switch items</li>
      </ul>
      <h3>Tips</h3>
      <ul>
        <li>The HUD shows the biome, world time, weather, and altitude; targeting a block shows contextual hints.</li>
        <li>Disable head bobbing and sprint zoom in Settings if needed.</li>
        <li>Render distance is lower by default on mobile and can be increased in Settings.</li>
        <li>In Creative mode, you can fly and place every block.</li>
        <li>Zombies appear at night—except in Peaceful mode!</li>
      </ul>
    ` : `
      <h3>Keyboard & Mouse</h3>
      <ul>
        <li><b>WASD / arrow keys:</b> Move</li>
        <li><b>Mouse:</b> Look around (click in the window to lock the pointer)</li>
        <li><b>Space:</b> Jump &nbsp;|&nbsp; <b>Double-tap Space:</b> Fly (Creative)</li>
        <li><b>Shift:</b> Sneak / fly down &nbsp;|&nbsp; <b>Ctrl:</b> Sprint</li>
        <li><b>Left mouse button:</b> Mine a block / attack</li>
        <li><b>Right mouse button:</b> Place a block / use an item; open furnaces and chests</li>
        <li><b>Middle mouse button:</b> Pick block (Creative)</li>
        <li><b>Mouse wheel / 1–9:</b> Hotbar</li>
        <li><b>E:</b> Inventory & Crafting &nbsp;|&nbsp; <b>Esc:</b> Pause</li>
        <li><b>In the inventory:</b> Left-click picks up/places stacks; right-click picks up half or places 1 item. Drag to distribute, and Shift-click to move stacks between the hotbar and inventory.</li>
        <li><b>Crafting:</b> The player grid is 2×2; crafting tables provide 3×3. Right-click takes one result; Shift-click crafts as many as possible.</li>
        <li><b>Tooltips & Equipment:</b> Hover over items; the off-hand and defined equipment are saved.</li>
        <li>A cursor stack drops in front of the player when the inventory closes.</li>
        <li><b>F1:</b> Hide/show the HUD for screenshots &nbsp;|&nbsp; <b>F:</b> Fly &nbsp;|&nbsp; <b>F3:</b> Debug info</li>
        <li>Reduce camera motion in Settings; target hints show block actions at the crosshair.</li>
        <li><b>M:</b> Switch game mode &nbsp;|&nbsp; <b>P:</b> Toggle Peaceful mode</li>
        <li><b>T:</b> Skip day/night &nbsp;|&nbsp; <b>O:</b> Toggle weather</li>
        <li><b>F5:</b> Save game</li>
      </ul>
      <h3>Survival</h3>
      <ul>
        <li>Gather wood → planks → sticks → crafting table → tools.</li>
        <li>Use a hoe to create farmland, then plant seeds on it.</li>
        <li>Smelt ores, sand, clay, wood, and meat; coal or wood keeps the furnace burning.</li>
        <li>Chests store 27 stacks, and their contents persist when the world is reloaded.</li>
        <li>Search caves for coal, iron, gold, and diamonds.</li>
        <li>Torches light up caves and keep zombies away.</li>
      </ul>
    `;
  }

  /** Show "Loading game..." with hint text. */
  setLoading(text) {
    const el = this.els['loading-text'];
    if (el) el.textContent = text || 'Generating World…';
    this.showScreen('loading-screen');
  }

  setDeathScreen(stats = {}) {
    const el = this.els['death-stats'];
    if (el) {
      el.textContent = stats.text || '';
    }
    this.showScreen('death-screen');
  }
}
