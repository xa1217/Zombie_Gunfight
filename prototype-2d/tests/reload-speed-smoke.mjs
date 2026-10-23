import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT)
  : fileURLToPath(new URL("../../", import.meta.url));
const publicRoot = join(root, "prototype-2d");
const { bootPage } = await import(pathToFileURL(join(publicRoot, "tests/loot-smoke.mjs")));

// These values are the playable tuning for the weapon families observed in the
// Apipi recording.  They are deliberately asserted at runtime through the
// page's real reload path so a new weapon cannot silently fall back to .35s.
const RELOAD_SECONDS = Object.freeze({
  assaultRifle: 2.1,
  submachineGun: 1.6,
  shotgun: 2.6,
  scar: 2.2,
  aug: 2.0,
  mp7: 1.4,
  ks23: 2.9,
  policePistol: 1.3,
  thunder: 2.4
});
const MAGAZINES = Object.freeze({
  assaultRifle: 30, submachineGun: 36, shotgun: 8, scar: 30,
  aug: 30, mp7: 40, ks23: 4, policePistol: 15, thunder: 55
});
const FIXED_STEP = 1 / 60;

function quietPage(weaponId) {
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
    combatDrops: [],
    enemies: []
  });
  state.weapon = {
    id: weaponId,
    quality: "common",
    ammoInMag: 0,
    ammoReserve: 200
  };
  state.player.fireTimer = 0;
  return page;
}

for (const [weaponId, expectedSeconds] of Object.entries(RELOAD_SECONDS)) {
  const page = quietPage(weaponId);
  const debug = page.debug;
  const state = debug.state;
  const loaded = MAGAZINES[weaponId];

  assert.equal(debug.reloadWeapon(), true, `${weaponId} starts a reload with reserve ammo`);
  assert.equal(state.player.reloadTimer, expectedSeconds,
    `${weaponId} uses its Apipi reload duration`);
  assert.equal(state.weapon.ammoInMag, loaded,
    `${weaponId} immediately preserves the existing refill semantics`);
  assert.equal(state.weapon.ammoReserve, 200 - loaded,
    `${weaponId} consumes only the loaded rounds`);

  // Reloading cannot be restarted while the timer is active, and held fire
  // cannot consume a round before the timer reaches zero.
  const timerAtStart = state.player.reloadTimer;
  assert.equal(debug.reloadWeapon(), false, `${weaponId} rejects duplicate reload input during reload`);
  assert.equal(state.player.reloadTimer, timerAtStart, `${weaponId} keeps the active timer`);
  const shotsBefore = state.stats.shots;
  const ammoBefore = state.weapon.ammoInMag;
  page.key("Space");
  debug.step(FIXED_STEP);
  page.key("Space", false);
  assert.equal(state.stats.shots, shotsBefore, `${weaponId} cannot fire during reload`);
  assert.equal(state.weapon.ammoInMag, ammoBefore, `${weaponId} keeps its magazine during reload`);

  // Leave two fixed ticks so the timer must still be positive, then cross the
  // boundary and prove that firing is unlocked on the next simulation tick.
  const ticks = Math.round(expectedSeconds / FIXED_STEP);
  for (let tick = 1; tick < ticks - 2; tick += 1) debug.step(FIXED_STEP);
  assert.ok(state.player.reloadTimer > 0, `${weaponId} remains reloading before its duration elapses`);
  debug.step(FIXED_STEP * 3);
  assert.equal(state.player.reloadTimer, 0, `${weaponId} reload timer completes at its duration`);
  const unlockedShots = state.stats.shots;
  page.key("Space");
  debug.step(FIXED_STEP);
  page.key("Space", false);
  assert.equal(state.stats.shots, unlockedShots + 1, `${weaponId} can fire after reload completes`);
}

const uniqueDurations = new Set(Object.values(RELOAD_SECONDS));
assert.equal(uniqueDurations.size, Object.keys(RELOAD_SECONDS).length,
  "every weapon has a distinct reload tuning value");
console.log("PASS Apipi weapon reload durations, reload lockout, timing boundary and post-reload firing");
