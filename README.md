# Minecraft Clone 🌍⛏️

A feature-rich Minecraft clone for **desktop and mobile** that runs entirely in the
browser, with no installation required. It includes procedural worlds, a day/night
cycle, mobs, crafting, animal breeding, caves, ores, and much more.

![Platform](https://img.shields.io/badge/Platform-PC%20%2B%20Mobile-brightgreen)
![Technology](https://img.shields.io/badge/Technology-Three.js%20%2B%20WebGL-blue)

## 🚀 Getting Started

```bash
npm start          # starts the web server on port 8080
# → open in your browser: http://localhost:8080
```

You can also use any other static web server if you do not have Node.js, for example:

```bash
python3 -m http.server 8080
```

**On mobile:** Open the URL in your mobile browser while connected to the same network
as the computer, for example `http://192.168.x.x:8080`. Touch controls appear
automatically. With Arena Preview, the game runs directly at the provided URL.

## ✨ Features

### World
- 🏔️ **Procedural world** with infinite terrain (chunk system, 16×16×64)
- 🌲 **8 biomes**: plains, forest, desert, mountains, snowy plains, swamp, beach, ocean
- 🕳️ **Caves & caverns** generated with 3D noise, extending deep underground
- ⛏️ **Ores**: coal, iron, gold, diamond, and redstone, distributed by depth
- 🌳 **Trees**: oak, birch, and spruce, plus cacti, sugar cane, flowers, and tall grass
- 🌊 **Water & lava** with animation, swimming, drowning, and lava damage
- 🧊 Snow, ice, gravity-affected sand, clay, gravel, obsidian, and 40+ additional blocks
- 🌾 **Farming**: hoe → farmland → plant seeds → grow wheat → bake bread
- 🕯️ **Lighting engine**: skylight + torchlight with smooth BFS propagation
- 🌅 **Day/night cycle** with sun, moon, stars, clouds, and dynamic fog
- 🌧️ **Weather**: periodic rain with darkness, particles, and sound

### Gameplay
- ⛏️ Mine blocks with tool-dependent speed, progress, particles, and drops
- 🧱 Place blocks, watch sand and gravel fall, and wear out tools through durability
- 🗡️ **Combat**: swords, knockback, attack cooldowns, and mob health
- 🐷 **Animals**: pigs, cows, sheep, and chickens that wander, flee, and drop meat, leather, and wool
- 🧟 **Zombies at night** that chase and attack players, then burn in sunlight
- 🍖 **Hunger & health**: eating, starvation, regeneration, fall damage, and drowning
- 🎒 **Player inventory** with 27 main slots, a shared nine-slot hotbar, 2×2 crafting, equipment/off-hand slots, and a character preview; includes tooltips, left/right click, drag distribution, Shift-click, and touch controls
- 🪚 **Crafting table** with the classic 3×3 grid; ingredients and uncollected results are returned safely when closed
- 🔥 **Functional furnace** with input, fuel, and output slots, smelting progress bars, saved progress, and recipes for ores, sand, clay, wood, and meat
- 📦 **Chests** with 27 world-bound slots whose contents persist across saves and loads
- 🪵 **Charcoal** made from wood, usable as long-burning fuel and for crafting torches
- 🔨 **Crafting**: 35+ recipes (tools, torches, crafting table, furnace, bread, ladder, and more) with a recipe book
- 🏗️ **Creative mode**: flying, unrestricted building, and starting equipment
- 🌙 **Peaceful mode** without monsters (enabled by default)
- 💾 **Saved games** in localStorage: manual and configurable autosaving, plus JSON import/export for backups
- 🎲 **Seeds**: the same seed generates the same world, including text-based seeds
- 🏗️ **World types**: Normal (mountains/caves) and Flat (building world)

### Technology & Controls
- 📱 **Full touch controls**: virtual joystick, swipe-to-look,
  Pocket Edition-style long press (mine the block directly under your finger), and buttons
  for jumping, sneaking, flying, mining, placing, inventory, and the menu
- 🖥️ **Desktop controls**: WASD, pointer-lock mouse controls, and keyboard shortcuts (see Help)
- 🔊 **Procedural sounds** through WebAudio, with no audio files required: mining, footsteps,
  jumping, animals, zombies, rain, eating, crafting, and more
- 🎨 **Detailed pixel-art textures**: procedural, seedable stone, ore, wood, sand, and water patterns with no asset pack required
- 🧊 Ambient occlusion and shading for visual depth
- ⚡ Performance: time-budgeted chunk meshing, device-dependent render distance,
  pixel-ratio limits, and frustum culling
- 🧭 **Exploration HUD**: current biome, world time, weather, and altitude, with contextual control hints for the targeted block
- 🧘 **Reduced camera motion**: disables head bobbing and the sprint FOV kick
- 🔍 **Debug screen** (F3): FPS, position, biome, and chunk statistics
- 🩺 **Self-diagnostics** in the main menu: checks WebGL, storage, input, world logic,
  and performance—ideal for testing **on mobile devices**
- ♿ Responsive UI for portrait and landscape orientations, with notch/safe-area support

## 🎮 Controls

### Desktop
| Input | Action |
|---|---|
| WASD / arrow keys | Move |
| Mouse | Look around (click in the window to lock the pointer) |
| Space | Jump · **double-tap to fly** (Creative) |
| Ctrl / R | Sprint |
| Shift | Sneak / fly down |
| Left mouse button | Mine / attack (hold) |
| Right mouse button | Place / use / eat; open a furnace or chest |
| Middle mouse button | Pick block (Creative) |
| Mouse wheel, 1–9 | Select hotbar slot |
| E | Inventory & crafting (player 2×2, crafting table 3×3) |
| Left-click in inventory | Pick up/place a stack; drag to distribute evenly |
| Right-click in inventory | Pick up half, place one item; drag to place one per slot |
| Shift-click in inventory | Move a stack between the hotbar and main inventory |
| Esc | Close inventory (the cursor stack drops into the world) or pause |
| F | Toggle flying |
| F1 | Hide/show the HUD for screenshots |
| F3 | Debug information |
| M / P | Toggle game mode / Peaceful mode |
| T / O | Skip time / toggle weather |
| F5 | Save immediately |

### Mobile
| Control | Action |
|---|---|
| Left thumb (joystick) | Move (push fully to sprint) |
| Touch and hold a block | Mine the block directly under your finger (like Pocket Edition) |
| Swipe | Look around; swiping does not mine blocks |
| ⬆ | Jump · **double-tap to fly** |
| ⬇ | Sneak (toggle) |
| 🕊 | Toggle flying |
| ⛏ (hold) | Mine a block / attack a mob |
| ▣ | Place / use a block; open a furnace or chest |
| 🎒 | Inventory & crafting |
| ⚙ | Pause / menu |
| Tap the hotbar | Select an item |

## 🧪 Tests

```bash
npm test
```

Included are more than 400 automated checks that run entirely without a browser:
- **World tests**: noise, blocks, drops, atlas, terrain, lighting, raycasts, biomes, and meshes
- **Game tests**: inventory, crafting recipes, physics (walking, jumping, collisions,
  fall damage, swimming), hunger, combat, serialization, and saved games
- **Module test**: all 21 modules can be imported (syntax and paths)
- **Desktop boot smoke test**: complete game startup with a stub DOM—world generation,
  rendering pipeline, block mining/placement, pause/inventory/save/load
- **Mobile boot smoke test**: game startup in touch mode—joystick movement,
  swipe-to-look, stationary long-press mining of the directly touched block,
  jump/double-jump/place buttons, inventory & menu, and mobile render distance & pixel ratio
- **Touch test**: joystick math, look dragging, screen rays, long press,
  buttons, double jump, and duplicate touch/mouse events
- **DOM test**: all HTML IDs match the IDs used by the code

## 📱 Mobile Tips

1. Play in **landscape orientation** for the best control layout.
2. If the frame rate is low, reduce **Render Distance** in Settings
   (the mobile default is 3 chunks) or set Particles to **Low**.
3. Open **Self-Diagnostics** in the main menu to see device information, the WebGL renderer,
   FPS, and a system check. Run it once on each device.
4. Saved games are stored in the device's browser (localStorage).

## 🗂️ Project Structure

```
index.html          Interface (HUD, menus, touch buttons)
styles.css          Desktop and mobile design
server.js           Static web server (npm start)
lib/                Three.js
src/
  main.js           Game wiring and main loop
  core/             Engine (sky/day-night), input, touch, and audio
  world/            Noise, blocks, textures, chunks/meshing, and world generation
  player/           Physics, inventory, crafting, and interaction
  entities/         Animals, zombies, items, and particles
  ui/               HUD, menus, debug, and self-diagnostics
  save/             Saved games and settings
tests/              Node tests (npm test)
```

## 🧾 Technical Details

- **Rendering**: Three.js (WebGL), MeshBasicMaterial with baked lighting
  (vertex colors: AO + face shading + light levels) for maximum performance
- **Textures**: 256×256 atlas generated procedurally with Canvas (pixel art);
  water and lava use animated frame strips
- **World generator**: Perlin-noise fBm for continents, hills, and mountains; 3D noise for
  caves; biomes based on temperature and humidity; deterministic tree placement
- **Lighting**: skylight (columns + BFS) and block light (torches, lava) per chunk
- **Save format**: seed + player changes (delta), keeping saves small and fast

---

Have fun building, exploring, and surviving! 🏰💎
