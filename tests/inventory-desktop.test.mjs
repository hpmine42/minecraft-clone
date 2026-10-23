// inventory-desktop.test.mjs — Minecraft-style mouse controls for inventory slots.
import { BLOCK } from '../src/world/blocks.js';
import { Inventory } from '../src/player/inventory.js';
import { Menus } from '../src/ui/menus.js';

let passed = 0;
let failed = 0;
function ok(condition, message) {
  if (condition) passed++;
  else { failed++; console.error(`FAIL: ${message}`); }
}

function makeMenus() {
  const menus = Object.create(Menus.prototype);
  menus.inventory = new Inventory();
  menus.craftGrid = Array(4).fill(null);
  menus.craftingMode = 'player';
  menus.craftRemainder = null;
  menus.heldStack = null;
  menus.containerSession = null;
  menus.containerNotice = null;
  menus.cb = {};
  menus.singleTransferMode = false;
  menus.transferSourceIndex = -1;
  menus._mouseGesture = null;
  menus.refreshCount = 0;
  menus.refreshInventory = () => { menus.refreshCount++; };
  menus._positionFloatingStack = (point) => { menus.lastCursorPoint = [point.clientX, point.clientY]; };
  menus.slotAt = new Map();
  menus._slotAtPoint = (x) => menus.slotAt.get(x) || null;
  return menus;
}

const menus = makeMenus();
menus.inventory.setSlot(0, { id: BLOCK.DIRT, count: 12, dur: null });
menus._slotClick('inv', 0, 0);
ok(menus.inventory.getSlot(0) === null && menus.heldStack?.count === 12,
  'Left-click picks up the entire stack');
menus._slotClick('inv', 1, 0);
ok(menus.inventory.getSlot(1)?.count === 12 && menus.heldStack === null,
  'A second left-click places the whole stack');

const fullStackMenus = makeMenus();
fullStackMenus.inventory.setSlot(0, { id: BLOCK.DIRT, count: 64, dur: null });
fullStackMenus._slotClick('inv', 0, 0);
ok(fullStackMenus.inventory.getSlot(0) === null && fullStackMenus.heldStack?.count === 64,
  'Left-click picks up a full stack of 64');
fullStackMenus._slotClick('inv', 1, 0);
ok(fullStackMenus.inventory.getSlot(1)?.count === 64 && fullStackMenus.heldStack === null,
  'A full stack of 64 is placed unchanged');
fullStackMenus.inventory.setSlot(2, { id: BLOCK.DIRT, count: 63, dur: null });
fullStackMenus._slotClick('inv', 2, 2);
ok(fullStackMenus.inventory.getSlot(2)?.count === 31 && fullStackMenus.heldStack?.count === 32,
  'Right-click splits 63 items, rounding up to 32 cursor items');

menus.inventory.setSlot(2, { id: BLOCK.DIRT, count: 9, dur: null });
menus._slotClick('inv', 2, 2);
ok(menus.inventory.getSlot(2)?.count === 4 && menus.heldStack?.count === 5,
  'Right-click picks up half of a stack, rounded up');
menus._slotClick('inv', 3, 2);
ok(menus.inventory.getSlot(3)?.count === 1 && menus.heldStack?.count === 4,
  'Right-click places exactly one item in an empty slot');

menus.inventory.setSlot(4, { id: BLOCK.DIRT, count: 63, dur: null });
menus.heldStack = { id: BLOCK.DIRT, count: 5, dur: null };
menus._slotClick('inv', 4, 2);
ok(menus.inventory.getSlot(4)?.count === 64 && menus.heldStack?.count === 4,
  'Right-click adds exactly one item to a matching stack');
menus._slotClick('inv', 4, 0);
ok(menus.inventory.getSlot(4)?.count === 64 && menus.heldStack?.count === 4,
  'A full stack accepts no additional items');

menus.inventory.setSlot(5, { id: BLOCK.DIRT, count: 62, dur: null });
menus.heldStack = { id: BLOCK.DIRT, count: 6, dur: null };
menus._slotClick('inv', 5, 0);
ok(menus.inventory.getSlot(5)?.count === 64 && menus.heldStack?.count === 4,
  'Left-click fills a matching stack as much as possible');
menus.inventory.setSlot(6, { id: BLOCK.STONE, count: 2, dur: null });
menus.heldStack = { id: BLOCK.SAND, count: 3, dur: null };
menus._slotClick('inv', 6, 0);
ok(menus.inventory.getSlot(6)?.id === BLOCK.SAND && menus.heldStack?.id === BLOCK.STONE,
  'Left-click swaps two different stacks');
menus.inventory.setSlot(7, { id: BLOCK.STONE, count: 2, dur: null });
menus.heldStack = { id: BLOCK.SAND, count: 3, dur: null };
menus._slotClick('inv', 7, 2);
ok(menus.inventory.getSlot(7)?.id === BLOCK.STONE && menus.heldStack?.id === BLOCK.SAND,
  'Right-click does not swap different stacks');

const rapidMenus = makeMenus();
rapidMenus.inventory.setSlot(0, { id: BLOCK.DIRT, count: 64, dur: null });
let rapidCountsAlwaysValid = true;
for (let click = 0; click < 250; click++) {
  rapidMenus._slotClick('inv', click % 2, click % 3 === 0 ? 2 : 0);
  const stacks = [rapidMenus.inventory.getSlot(0), rapidMenus.inventory.getSlot(1), rapidMenus.heldStack].filter(Boolean);
  rapidCountsAlwaysValid &&= stacks.every((stack) => Number.isInteger(stack.count) && stack.count > 0 && stack.count <= 64);
}
const rapidTotal = rapidMenus.inventory.count(BLOCK.DIRT) + (rapidMenus.heldStack?.count || 0);
ok(rapidCountsAlwaysValid && rapidTotal === 64,
'Rapid left/right clicks create no duplicates, negative counts, or oversized stacks');

// Actual desktop mouse sequence: pick up, track the cursor, and release over the target.
menus.heldStack = null;
menus.inventory.setSlot(14, { id: BLOCK.PLANKS, count: 8, dur: null });
menus.slotAt.set(10, { kind: 'inv', index: 14 });
menus.slotAt.set(20, { kind: 'inv', index: 15 });
const mouseEvent = (button, x, y = 0) => ({
  button, clientX: x, clientY: y,
  preventDefault() {}, stopPropagation() {},
});
menus._startDesktopInventoryMouse(mouseEvent(0, 10), 'inv', 14);
ok(menus.inventory.getSlot(14) === null && menus.heldStack?.count === 8,
  'Mouse pickup lifts the stack immediately');
menus._moveDesktopInventoryMouse(mouseEvent(0, 20));
ok(menus.lastCursorPoint?.[0] === 20, 'Floating stack follows mouse movement');
menus._endDesktopInventoryMouse(mouseEvent(0, 20));
ok(menus.inventory.getSlot(15)?.count === 8 && menus.heldStack === null,
  'Mouse drag places the whole stack in the release slot');

// Right-drag places one per slot; left-drag distributes the stack evenly.
menus.heldStack = { id: BLOCK.DIRT, count: 7, dur: null };
menus.slotAt.set(30, { kind: 'inv', index: 16 });
menus.slotAt.set(40, { kind: 'inv', index: 17 });
menus.slotAt.set(50, { kind: 'inv', index: 18 });
menus._startDesktopInventoryMouse(mouseEvent(2, 30), 'inv', 16);
menus._moveDesktopInventoryMouse(mouseEvent(2, 40));
menus._moveDesktopInventoryMouse(mouseEvent(2, 50));
menus._endDesktopInventoryMouse(mouseEvent(2, 50));
ok([16, 17, 18].every((index) => menus.inventory.getSlot(index)?.count === 1)
  && menus.heldStack?.count === 4,
'Right-drag places exactly one item in each slot crossed');

menus.heldStack = { id: BLOCK.SAND, count: 10, dur: null };
menus.slotAt.set(60, { kind: 'inv', index: 19 });
menus.slotAt.set(70, { kind: 'inv', index: 20 });
menus.slotAt.set(80, { kind: 'inv', index: 21 });
menus._startDesktopInventoryMouse(mouseEvent(0, 60), 'inv', 19);
menus._moveDesktopInventoryMouse(mouseEvent(0, 70));
menus._moveDesktopInventoryMouse(mouseEvent(0, 80));
menus._endDesktopInventoryMouse(mouseEvent(0, 80));
ok(menus.inventory.getSlot(19)?.count === 4
  && menus.inventory.getSlot(20)?.count === 3
  && menus.inventory.getSlot(21)?.count === 3
  && menus.heldStack === null,
'Left-drag distributes the stack as evenly as possible across all slots');

const capacityMenus = makeMenus();
capacityMenus.inventory.setSlot(0, { id: BLOCK.STONE, count: 1, dur: null });
capacityMenus.inventory.setSlot(1, { id: BLOCK.DIRT, count: 60, dur: null });
capacityMenus.inventory.setSlot(2, { id: BLOCK.DIRT, count: 64, dur: null });
capacityMenus.heldStack = { id: BLOCK.DIRT, count: 64, dur: null };
capacityMenus.slotAt.set(10, { kind: 'inv', index: 0 }); // Invalid starting slot: not counted.
capacityMenus.slotAt.set(20, { kind: 'inv', index: 1 });
capacityMenus.slotAt.set(30, { kind: 'inv', index: 2 });
capacityMenus._startDesktopInventoryMouse(mouseEvent(0, 10), 'inv', 0);
capacityMenus._moveDesktopInventoryMouse(mouseEvent(0, 20));
capacityMenus._endDesktopInventoryMouse(mouseEvent(0, 20));
ok(capacityMenus.inventory.getSlot(1)?.count === 64 && capacityMenus.heldStack?.count === 60
  && capacityMenus.inventory.getSlot(0)?.id === BLOCK.STONE,
'Dragging onto a stack of 60 adds only the four free spaces');
capacityMenus._startDesktopInventoryMouse(mouseEvent(0, 10), 'inv', 0);
capacityMenus._moveDesktopInventoryMouse(mouseEvent(0, 30));
capacityMenus._endDesktopInventoryMouse(mouseEvent(0, 30));
ok(capacityMenus.inventory.getSlot(2)?.count === 64 && capacityMenus.heldStack?.count === 60,
'Dragging onto a full stack leaves the cursor stack unchanged');
capacityMenus._startDesktopInventoryMouse(mouseEvent(0, 20), 'inv', 1);
capacityMenus._endDesktopInventoryMouse(mouseEvent(0, 200));
ok(capacityMenus.heldStack?.count === 60,
'Releasing outside the inventory does not lose the cursor stack');

const furnaceState = { slots: [null, null, { id: BLOCK.IRON_INGOT, count: 9, dur: null }] };
menus.containerSession = { type: 'furnace', state: furnaceState, slots: furnaceState.slots };
menus.heldStack = null;
menus._slotClick('container', 2, 2);
ok(furnaceState.slots[2]?.count === 4 && menus.heldStack?.count === 5,
'Right-click takes half of the furnace result, rounded up');
menus.heldStack = { id: BLOCK.IRON_ORE, count: 4, dur: null };
menus._slotClick('container', 0, 2);
ok(furnaceState.slots[0]?.count === 1 && menus.heldStack?.count === 3,
'Right-click places exactly one matching ingredient in the furnace');

// Shift-click moves complete stacks between the main inventory and hotbar.
const shiftMenus = makeMenus();
shiftMenus.inventory.setSlot(12, { id: BLOCK.DIRT, count: 17, dur: null });
shiftMenus._shiftClick('inv', 12);
ok(shiftMenus.inventory.getSlot(12) === null && shiftMenus.inventory.getSlot(0)?.count === 17,
  'Shift-click moves a stack from the main inventory to the hotbar');
shiftMenus._shiftClick('inv', 0);
ok(shiftMenus.inventory.getSlot(0) === null && shiftMenus.inventory.getSlot(9)?.count === 17,
  'Shift-click moves a hotbar stack back to the main inventory');

const priorityMenus = makeMenus();
priorityMenus.inventory.setSlot(12, { id: BLOCK.DIRT, count: 17, dur: null });
priorityMenus.inventory.setSlot(1, { id: BLOCK.DIRT, count: 60, dur: null });
priorityMenus._shiftClick('inv', 12);
ok(priorityMenus.inventory.getSlot(1)?.count === 64
  && priorityMenus.inventory.getSlot(0)?.count === 13
  && priorityMenus.inventory.getSlot(12) === null,
'Shift-click fills compatible stacks first, then uses empty slots');

const equipmentMenus = makeMenus();
equipmentMenus.inventory.setSlot(10, { id: BLOCK.TORCH, count: 4, dur: null });
equipmentMenus._shiftClick('inv', 10);
ok(equipmentMenus.inventory.getEquipment('offhand')?.id === BLOCK.TORCH
  && equipmentMenus.inventory.getEquipment('offhand')?.count === 4
  && equipmentMenus.inventory.getSlot(10) === null,
'Shift-click places an item allowed by its definition in the off-hand');
equipmentMenus.heldStack = { id: BLOCK.BREAD, count: 1, dur: null };
equipmentMenus._slotClick('equipment', 4, 0);
ok(equipmentMenus.inventory.getEquipment('offhand')?.id === BLOCK.TORCH
  && equipmentMenus.inventory.getEquipment('offhand')?.count === 4
  && equipmentMenus.heldStack?.id === BLOCK.BREAD,
'Undefined items cannot be placed in the occupied off-hand');

// Shift-clicking the result repeatedly crafts recipes while space is available.
shiftMenus.craftGrid = [
  { id: BLOCK.PLANKS, count: 2, dur: null }, null,
  { id: BLOCK.PLANKS, count: 2, dur: null }, null,
];
shiftMenus._shiftClick('result', 0);
ok(shiftMenus.inventory.count(BLOCK.STICK) === 8
  && shiftMenus.craftGrid.every((stack) => !stack),
'Shift-clicking the crafting result crafts every possible recipe and stores the items');

// Right-clicking a crafting output takes one and safely reserves the rest.
const rightCraft = makeMenus();
rightCraft.craftGrid = [{ id: BLOCK.LOG, count: 1, dur: null }, null, null, null];
rightCraft._takeCraftResult(2);
ok(rightCraft.heldStack?.id === BLOCK.PLANKS && rightCraft.heldStack.count === 1
  && rightCraft.craftRemainder?.count === 3 && rightCraft.craftGrid.every((stack) => !stack),
'Right-clicking a four-item recipe takes one and preserves the other three results');
rightCraft._takeCraftResult(0);
ok(rightCraft.heldStack?.count === 4 && rightCraft.craftRemainder === null,
'Remaining crafting results can be collected without consuming ingredients again');

// Closing returns cursor and crafting stacks; with a full inventory, exactly
// the unstashable remainder is passed on as a single item drop.
const closeMenus = makeMenus();
const cursorDrops = [];
closeMenus.cb.onDropStack = (id, count, stack) => {
  cursorDrops.push({ id, count, dur: stack?.dur ?? null });
  return true;
};
closeMenus.craftGrid = [{ id: BLOCK.SAND, count: 5, dur: null }, null, null, null];
closeMenus.heldStack = { id: BLOCK.DIRT, count: 3, dur: null };
closeMenus.closeActiveInventory();
ok(closeMenus.inventory.count(BLOCK.SAND) === 5 && closeMenus.inventory.count(BLOCK.DIRT) === 0
  && cursorDrops.length === 1 && cursorDrops[0].id === BLOCK.DIRT && cursorDrops[0].count === 3
  && closeMenus.craftGrid.every((stack) => !stack) && closeMenus.heldStack === null,
'Closing returns crafting ingredients and drops the cursor stack into the world');
const fullMenus = makeMenus();
const overflowDrops = [];
fullMenus.cb.onDropStack = (id, count) => { overflowDrops.push({ id, count }); return true; };
for (let index = 0; index < fullMenus.inventory.slots.length; index++) {
  fullMenus.inventory.setSlot(index, { id: BLOCK.DIRT, count: 64, dur: null });
}
fullMenus.heldStack = { id: BLOCK.SAND, count: 2, dur: null };
fullMenus.closeActiveInventory();
ok(overflowDrops.length === 1 && overflowDrops[0].id === BLOCK.SAND && overflowDrops[0].count === 2,
'A full inventory returns the cursor stack exactly once as a world drop');
const noDropSystem = makeMenus();
for (let index = 0; index < noDropSystem.inventory.slots.length; index++) {
  noDropSystem.inventory.setSlot(index, { id: BLOCK.DIRT, count: 64, dur: null });
}
noDropSystem.heldStack = { id: BLOCK.SAND, count: 2, dur: null };
noDropSystem.closeActiveInventory();
ok(noDropSystem.heldStack?.id === BLOCK.SAND && noDropSystem.heldStack?.count === 2,
'Without a world-drop system, an unstashable stack is preserved when the inventory is full');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
