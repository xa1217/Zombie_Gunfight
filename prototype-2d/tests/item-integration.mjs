import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT)
  : fileURLToPath(new URL("../../", import.meta.url));
const publicRoot = join(root, "prototype-2d");
const { bootPage } = await import(pathToFileURL(join(publicRoot, "tests/loot-smoke.mjs")));

function quietPage() {
  const page = bootPage();
  page.start();
  const state = page.debug.state;
  Object.assign(state, { godMode: true, density: 0, lootTimer: Infinity, hordeTimer: Infinity, spawnBudget: 0, loot: [], combatDrops: [] });
  state.player.fireTimer = Infinity;
  const template = state.enemies[0];
  state.enemies = [{ ...template, id: 810001, x: state.player.x + 105, y: state.player.y,
    speed: 0, baseSpeed: 0, damage: 0, hp: 10000, maxHp: 10000, contactTimer: Infinity, dead: false }];
  return page;
}

function collect(page, itemId) {
  const debug = page.debug;
  const drop = debug.spawnLoot(itemId, "rare", debug.state.player.x, debug.state.player.y);
  assert.ok(drop, `${itemId} can be spawned for the integration fixture`);
  debug.state.player.x = drop.x;
  debug.state.player.y = drop.y;
  debug.step(1 / 60);
  assert(!debug.loot.some(item => item.id === drop.id), `${itemId} is consumed on contact`);
}

for (const itemId of ["grenade", "molotov"]) {
  const page = quietPage();
  const { debug } = page;
  collect(page, itemId);
  assert.equal(debug.state.throwables[itemId], 1, `${itemId} goes into one-shot inventory`);
  assert.equal(debug.build.level(itemId), 0, `${itemId} does not enter the passive build`);
  assert.equal(debug.useThrowable(itemId), true, `${itemId} can be used by its button`);
  assert.equal(debug.state.throwables[itemId], 0, `${itemId} use consumes one charge`);
  assert.equal(debug.state.player.throwKind, itemId, `${itemId} keeps its throw animation`);
  debug.step(.5);
  if (itemId === "grenade") assert(debug.state.explosions.some(effect => effect.kind === "grenade"), "grenade creates an explosion");
  if (itemId === "molotov") assert(debug.state.fireZones.some(effect => effect.kind === "molotov"), "molotov creates a fire zone");
}

const page = quietPage();
const { debug, elements } = page;
assert(elements.has("grenadeButton") && elements.has("molotovButton"), "the two right-side buttons exist");
assert(!elements.has("skillDock"), "the bottom item dock is removed");
for (const id of ["bearTrap", "extinguisher", "scatterModule", "trailBoots", "survivalInstinct"]) {
  assert.equal(debug.spawnLoot(id), null, `${id} no longer spawns as a scene drop`);
}
debug.state.throwables = { grenade: 1, molotov: 1 };
debug.state.player.throwAction = 0;
page.click("grenadeButton");
assert.equal(debug.state.throwables.grenade, 0, "clicking grenade uses only grenade");
debug.step(.5);
page.click("molotovButton");
assert.equal(debug.state.throwables.molotov, 0, "clicking molotov uses only molotov");

console.log("PASS manual grenade/molotov effects, one-shot consumption, separate buttons and legacy drop rejection");
