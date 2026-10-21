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
    godMode: true, density: 0, lootTimer: Infinity, hordeTimer: Infinity,
    spawnBudget: 0, loot: [], combatDrops: []
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
  return drop;
}

const page = quietPage();
const { debug, elements } = page;
const state = debug.state;
assert.equal(debug.config.throwableMax, 5, "throwable inventory limit is five per type");
assert.deepEqual(Object.keys(state.throwables).sort(), [...THROWABLES].sort(),
  "the inventory contains only grenade and molotov");
assert.equal(state.activeThrowableId, null, "no throwable is selected before the first pickup");
for (const id of ["grenadeButton", "molotovButton", "grenadeButtonCount", "molotovButtonCount"]) {
  assert(elements.has(id), `${id} is present in the right-side throwable controls`);
}
assert(!elements.has("throwablePicker"), "the obsolete multi-item picker is removed");

for (const [index, itemId] of THROWABLES.entries()) {
  pickup(page, itemId);
  assert.equal(state.throwables[itemId], 1, `${itemId} pickup increments its count`);
  if (index === 0) assert.equal(state.activeThrowableId, itemId, "first pickup is the default selection");
}

for (let count = 1; count < 5; count += 1) pickup(page, "grenade");
assert.equal(state.throwables.grenade, 5);
const rejected = debug.spawnLoot("grenade");
assert.ok(rejected, "a full grenade inventory still leaves a scene pickup");
state.player.x = rejected.x; state.player.y = rejected.y;
debug.step(1 / 60);
assert.equal(state.throwables.grenade, 5, "the sixth grenade is rejected at the cap");
assert(debug.loot.some(item => item.id === rejected.id), "a full inventory does not consume the pickup");
state.loot = [];

state.throwables = { grenade: 1, molotov: 1 };
state.activeThrowableId = "grenade";
assert.equal(debug.useThrowable("grenade"), true, "grenade button use launches a grenade");
assert.equal(state.throwables.grenade, 0, "grenade use consumes one charge");
debug.step(.5);
assert.equal(debug.useThrowable("molotov"), true, "molotov button use launches a molotov");
assert.equal(state.throwables.molotov, 0, "molotov use consumes one charge");
debug.step(.5);
assert.equal(debug.useThrowable("grenade"), false, "an empty grenade button cannot use");
assert.equal(debug.useThrowable("molotov"), false, "an empty molotov button cannot use");
assert.equal(state.throwableProjectiles.some(projectile => projectile.kind === "grenade" || projectile.kind === "molotov"), true,
  "button use reaches the real throwable launch path");

console.log("PASS grenade/molotov-only throwable buttons, five-item cap, rejected full pickup and one-shot use");
