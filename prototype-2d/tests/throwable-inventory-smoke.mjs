import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT)
  : fileURLToPath(new URL("../../", import.meta.url));
const publicRoot = join(root, "prototype-2d");
const { bootPage } = await import(pathToFileURL(join(publicRoot, "tests/loot-smoke.mjs")));

const THROWABLES = Object.freeze(["grenade", "molotov"]);

function quietPage() {
  const page = bootPage();
  page.start();
  const debug = page.debug;
  const state = debug.state;
  Object.assign(state, {
    godMode: true,
    density: 0,
    lootTimer: Infinity,
    hordeTimer: Infinity,
    spawnBudget: 0,
    loot: [],
    combatDrops: []
  });
  state.player.fireTimer = Infinity;
  const template = state.enemies[0];
  state.enemies = [{ ...template, id: 900001, x: state.player.x + 105, y: state.player.y,
    speed: 0, baseSpeed: 0, damage: 0, hp: 1000000, maxHp: 1000000,
    contactTimer: Infinity, dead: false }];
  return page;
}

function pickup(page, itemId) {
  const { debug } = page;
  const drop = debug.spawnLoot(itemId);
  assert.ok(drop, `${itemId} creates a scene pickup`);
  debug.state.player.x = drop.x;
  debug.state.player.y = drop.y;
  debug.step(1 / 60);
  assert(!debug.loot.some(item => item.id === drop.id), `${itemId} pickup is removed after collection`);
  return drop;
}

const page = quietPage();
const { debug, elements } = page;
const state = debug.state;
assert.equal(debug.config.throwableMax, 5, "throwable inventory limit is five per type");
assert.deepEqual(Object.keys(state.throwables).sort(), [...THROWABLES].sort(),
  "the inventory contains only grenade and molotov");
assert.equal(state.activeThrowableId, null, "no throwable is selected before the first pickup");
assert(elements.has("grenadeButton"), "the grenade use button exists");
assert(elements.has("molotovButton"), "the molotov use button exists");
assert(!elements.has("throwableButton"), "the legacy single throwable button is gone");
assert(!elements.has("throwablePicker"), "the legacy long-press picker is gone");
assert(!elements.has("skillDock"), "the bottom skill dock is gone");

for (const [index, itemId] of THROWABLES.entries()) {
  pickup(page, itemId);
  assert.equal(state.throwables[itemId], 1, `${itemId} pickup increments its count`);
  if (index === 0) assert.equal(state.activeThrowableId, itemId, "the first pickup becomes the default");
}
assert.deepEqual({ ...state.throwables }, { grenade: 1, molotov: 1 }, "the two counts stay independent");

for (let count = 0; count < 4; count += 1) pickup(page, "grenade");
assert.equal(state.throwables.grenade, 5);
const rejected = debug.spawnLoot("grenade");
assert.ok(rejected, "a full inventory still leaves a scene pickup");
state.player.x = rejected.x;
state.player.y = rejected.y;
debug.step(1 / 60);
assert.equal(state.throwables.grenade, 5, "the fifth grenade is the hard inventory cap");
assert(debug.loot.some(item => item.id === rejected.id), "a sixth grenade stays on the ground");
for (const id of ["bearTrap", "extinguisher", "scatterModule", "trailBoots", "survivalInstinct"]) {
  assert.equal(debug.spawnLoot(id), null, `${id} is not a supported ground drop`);
}

state.loot = [];
state.throwables = { grenade: 1, molotov: 1 };
state.activeThrowableId = null;
state.player.throwAction = 0;
assert.equal(debug.useThrowable("grenade"), true, "the grenade use path launches manually");
assert.equal(state.throwables.grenade, 0, "grenade use consumes one charge");
assert.equal(state.player.throwKind, "grenade");
debug.step(.5);
assert.equal(debug.useThrowable("molotov"), true, "the molotov use path launches manually");
assert.equal(state.throwables.molotov, 0, "molotov use consumes one charge");
assert.equal(state.player.throwKind, "molotov");
debug.step(.5);
assert.equal(debug.useThrowable("grenade"), false, "an empty grenade button cannot use another type");
assert.equal(debug.useThrowable("bearTrap"), false, "legacy throwable IDs cannot be used");

state.throwables = { grenade: 1, molotov: 1 };
state.activeThrowableId = null;
state.player.throwAction = 0;
page.click("grenadeButton");
assert.equal(state.throwables.grenade, 0, "clicking grenade button uses grenade only");
debug.step(.5);
page.click("molotovButton");
assert.equal(state.throwables.molotov, 0, "clicking molotov button uses molotov only");

console.log("PASS two throwable counts, five-item cap, rejected legacy drops, manual button use and one-shot consumption");
