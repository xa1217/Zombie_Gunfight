import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { bootPage } from "./loot-smoke.mjs";

// Cross-run stash (Apipi-style warehouse) + new project-style item art wiring.
// The harness has no localStorage, so the page falls back to an in-memory
// store for the current page; the browser path uses localStorage instead.
const projectRoot = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT)
  : fileURLToPath(new URL("../../", import.meta.url));
const publicRoot = join(projectRoot, "prototype-2d");
const inventoryArtSource = readFileSync(join(publicRoot, "inventory-art.js"), "utf8");

function startQuiet(page) {
  page.start();
  const debug = page.debug;
  debug.state.godMode = true;
  debug.state.density = 0;
  debug.state.lootTimer = Infinity;
  debug.state.hordeTimer = Infinity;
  debug.state.spawnBudget = 0;
  return debug;
}

export function runStashChecks() {
  // New items exist in the loot catalog with project-style art keys, and the
  // tool cabinet pool can actually roll the new matches item.
  const page = bootPage();
  const debug = startQuiet(page);
  const items = debug.supplyItems;
  assert.equal(items.matches.name, "火柴", "matches item exists");
  assert.equal(items.matches.art, "matches", "matches uses its own art key");
  assert.equal(items.massageGun.art, "massage", "massage gun no longer reuses the dryer art");
  assert(inventoryArtSource.includes("matches:"), "matches has a vector drawing");
  assert(inventoryArtSource.includes("massage:"), "massage gun has a vector drawing");
  // Container pools are not exposed through the debug object, so the pool
  // wiring is checked against the loot module source contract.
  const lootSource = readFileSync(join(publicRoot, "loot-system.js"), "utf8");
  assert(lootSource.includes('"matches"') && lootSource.includes("tool:"), "matches is wired into the tool cabinet pool");

  // Deposit merges stackables, keeps non-stackables separate, and caps at 60.
  assert.equal(debug.depositToStash([{ itemId: "matches", quality: "common" }]), 1, "one matches deposits");
  assert.equal(debug.depositToStash([{ itemId: "milk", count: 2, quality: "fine" }]), 1, "milk stack deposits");
  assert.equal(debug.depositToStash([{ itemId: "milk", count: 1, quality: "fine" }]), 1, "milk merges into the existing stack");
  let stash = debug.stashList();
  assert.equal(stash.length, 2, "stack merge keeps one milk entry");
  assert.equal(stash.find(entry => entry.itemId === "milk").count, 3, "milk stack reaches its 3 cap");
  assert.equal(debug.depositToStash([{ itemId: "necklace", quality: "legendary" }]), 1, "valuable deposits");
  stash = debug.stashList();
  assert.equal(stash.length, 3, "three stash entries after deposits");

  // Bring one entry into the live bag: stash shrinks, bag grows.
  const necklace = stash.find(entry => entry.itemId === "necklace");
  assert.equal(debug.bringFromStash(necklace.id), true, "necklace moves from stash to bag");
  assert(!debug.stashList().some(entry => entry.id === necklace.id), "brought entry leaves the stash");
  assert(debug.state.bag.some(entry => entry.itemId === "necklace"), "necklace lands in the bag");

  // Defeat deposits only the safe box, and the result panel names the loot.
  const defeatPage = bootPage();
  const defeatDebug = startQuiet(defeatPage);
  defeatDebug.state.safe = [{ id: 700001, itemId: "cup", quality: "fine", slot: 0 }];
  defeatDebug.state.bag = [{ id: 700002, itemId: "basketball", quality: "fine", slot: 0 }];
  defeatDebug.state.player.hp = 1;
  defeatDebug.state.godMode = false;
  defeatDebug.takeDamage(9999);
  assert.equal(defeatDebug.state.phase, "gameover", "lethal damage ends the run");
  assert(defeatDebug.stashList().some(entry => entry.itemId === "cup"), "safe-box cup survives defeat into the stash");
  assert(!defeatDebug.stashList().some(entry => entry.itemId === "basketball"), "bag is lost on defeat, not stashed");
  assert(defeatPage.elements.get("resultLoot").innerHTML.includes("陶瓷杯"), "result panel lists the retained loot");

  // Pending bring: mark on the game-over screen, restart, and the item is in
  // the new run's bag.
  const cup = defeatDebug.stashList().find(entry => entry.itemId === "cup");
  defeatDebug.togglePendingBring(cup.id);
  assert.equal(defeatDebug.pendingBring.length, 1, "pending bring is recorded");
  assert.equal(defeatDebug.pendingBring[0], cup.id, "pending bring holds the cup entry");
  defeatPage.click("restartRun");
  assert(defeatDebug.state.bag.some(entry => entry.itemId === "cup"), "pending stash item enters the next run's bag");
  assert(!defeatDebug.stashList().some(entry => entry.id === cup.id), "brought item leaves the stash on restart");

  // Capacity: a fresh page accepts at most 60 stash entries.
  const capPage = bootPage();
  const capDebug = startQuiet(capPage);
  const many = Array.from({ length: 65 }, (_, i) => ({ itemId: "junk", quality: "common", id: 800000 + i }));
  capDebug.depositToStash(many);
  assert.equal(capDebug.stashList().length, 60, "stash caps at 60 entries");

  console.log("PASS stash deposits/merges/caps, defeat keeps only the safe box, pending bring enters the next run, matches + massage art wired");
  return { simulated: true, stashRegression: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runStashChecks();
