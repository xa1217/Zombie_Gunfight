import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";
import vm from "node:vm";

const root = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT)
  : fileURLToPath(new URL("../../", import.meta.url));
const publicRoot = join(root, "prototype-2d");
const require = createRequire(import.meta.url);
const { bootPage } = await import(pathToFileURL(join(publicRoot, "tests/loot-smoke.mjs")));
const core = require(join(publicRoot, "character-art.js"));
const itemArt = require(join(publicRoot, "item-art.js"));
const failures = [];
const dt = 1 / 60;
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-7, `${label}: ${a} expected ${b}`);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const boneDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
const samePoint = (a, b, label) => near(distance(a, b), 0, label);
function test(name, callback) {
  try { callback(); console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.message}`); }
}

function quietPage() {
  const page = bootPage(); page.start();
  const state = page.debug.state;
  assert.equal(state.phase, "playing", "the real page starts in the logic harness");
  page.enemyTemplate = { ...state.enemies[0] };
  Object.assign(state, { godMode: true, density: 0, lootTimer: Infinity, hordeTimer: Infinity,
    spawnBudget: 0, loot: [], combatDrops: [], enemies: [] });
  state.player.fireTimer = Infinity;
  return page;
}
function collect(page, id, consumable = false) {
  const debug = page.debug, player = debug.state.player;
  const item = consumable ? debug.spawnCombatDrop(id, player.x, player.y)
    : debug.spawnLoot(id, "common", player.x, player.y);
  assert.ok(item, `${id}: the real spawn method creates a pickup`);
  player.x = item.x; player.y = item.y;
  assert.equal(debug.tryCollectLoot(item.id), true, `${id}: contact collection succeeds`);
  assert.ok(![...debug.loot, ...debug.combatDrops].some(entry => entry.id === item.id), `${id}: pickup is consumed once`);
  return item;
}
test("manual grenade and molotov button uses create their real effects", () => {
  for (const id of ["grenade", "molotov"]) {
    const page = quietPage(), state = page.debug.state;
    collect(page, id);
    assert.equal(state.throwables[id], 1, `${id} pickup goes into one-shot inventory`);
    assert.equal(page.debug.useThrowable(id), true, `${id} button use succeeds`);
    assert.equal(state.throwables[id], 0, `${id} button use consumes exactly one charge`);
    assert.equal(state.player.throwKind, id, `${id} keeps its throw animation kind`);
    assert.ok(state.player.throwAction > 0, `${id} starts the throw action`);
    page.debug.step(.5);
    if (id === "grenade") assert.ok(state.explosions.some(effect => effect.kind === "grenade"), "grenade creates an explosion");
    if (id === "molotov") assert.ok(state.fireZones.length > 0, "molotov creates a fire zone");
  }
});

function recordingCanvas() {
  const calls = [];
  const context = new Proxy({ globalAlpha: 1 }, { get(target, key) {
    if (key in target) return target[key];
    return (...args) => calls.push({ name: String(key), args });
  }, set(target, key, value) { target[key] = value; return true; } });
  return { context, calls };
}
const statusImages = [];
const effectsScope = { WASTELAND_ITEM_ART: { draw(context, id) { statusImages.push(id); return true; } } };
vm.runInNewContext(readFileSync(join(publicRoot, "item-effects.js"), "utf8"), { window: effectsScope });
function statusIcons(player, time) {
  statusImages.length = 0;
  effectsScope.WASTELAND_ITEM_EFFECTS.drawStatus(recordingCanvas().context, player, time, {});
  return [...statusImages];
}

test("invulnerability pickup has its own two-second visible timer without shortening another protection source", () => {
  const page = quietPage(), player = page.debug.state.player;
  player.invulnerable = 5;
  assert.ok(!statusIcons(player, 0).includes("invulnerableBurst"), "ordinary protection alone does not impersonate the pickup buff");
  collect(page, "invulnerableBurst", true);
  near(player.invulnerable, 5, "longer protection survives pickup");
  near(player.invulnerableBurstTime, 2, "pickup display starts at two seconds");
  assert.ok(statusIcons(player, 0).includes("invulnerableBurst"));
  page.debug.step(1);
  near(player.invulnerableBurstTime, 1, "visible pickup timer counts down");
  near(player.invulnerable, 4, "gameplay protection counts down independently");
  page.debug.step(1.1);
  assert.equal(player.invulnerableBurstTime, 0);
  assert.ok(player.invulnerable > 2.8);
  assert.ok(!statusIcons(player, 2.1).includes("invulnerableBurst"), "two-second pickup icon disappears while other protection remains");
});

test("healing pickups set a short visual flash which expires with the real player update", () => {
  const page = quietPage(), player = page.debug.state.player;
  player.hp = player.maxHp - 30;
  const before = player.hp;
  collect(page, "assaultRifle");
  assert.ok(player.hp > before, "duplicate firearm is converted to medical supplies");
  assert.ok(Number.isFinite(player.healFlash) && player.healFlash > 0, "healing creates visual feedback");
  const duration = player.healFlash;
  page.debug.step(duration + .1);
  assert.equal(player.healFlash, 0, "healing feedback expires instead of sticking permanently");
});

test("item actions move the existing support arm, preserve all bone lengths and expose a held-item anchor at that hand", () => {
  const manifest = JSON.parse(readFileSync(join(publicRoot, "assets/cartoon-rig-manifest.json"), "utf8"));
  const images = Object.fromEntries(Object.values(manifest.characters).filter(character => character.image)
    .map(character => [character.image, { width: character.imageWidth, height: character.imageHeight }]));
  const renderer = core.createRenderer({ image: { width: manifest.width, height: manifest.height }, images, manifest });
  for (const kind of ["grenade", "molotov"]) for (let i = 0; i <= 32; i++) {
    const angle = -Math.PI + i / 32 * Math.PI * 2;
    const duration = .38;
    for (const progress of [.15, .5, 1]) {
      const actor = { x: 120, y: 240, armAngle: angle, gait: .7, gaitPhase: .9,
        recoil: .25, throwKind: kind, throwAction: duration * progress };
      const pose = core.pose("hero", actor), ordinary = core.pose("hero", { ...actor, throwAction: 0 });
      assert.equal(pose.arms.length, 2, "an item action must not add a third arm");
      assert.equal(pose.legs.length, 2);
      assert.equal(pose.arms[0].support, true, "the original support arm performs the action");
      assert.ok(distance(pose.arms[0].end, ordinary.arms[0].end) > .001, "the existing hand changes to a use pose");
      for (const group of ["arms", "legs"]) for (let part = 0; part < 2; part++) {
        const limb = pose[group][part], baseline = ordinary[group][part];
        near(limb.upperLength, baseline.upperLength, `${kind} upper length`);
        near(limb.lowerLength, baseline.lowerLength, `${kind} lower length`);
        near(boneDistance(limb.root, limb.joint), baseline.upperLength, `${kind} actual upper bone`);
        near(boneDistance(limb.joint, limb.end), baseline.lowerLength, `${kind} actual lower bone`);
        samePoint(limb.root, baseline.root, `${kind} shoulder/hip stays attached`);
        if (group === "legs" || part === 1) for (const joint of ["joint", "end"])
          samePoint(limb[joint], baseline[joint], `${kind} leaves other limbs in their normal pose`);
      }
      const held = [];
      renderer.drawPlayer(recordingCanvas().context, actor, { drawHeldItem(hand, direction) { held.push({ hand, direction }); } });
      assert.equal(held.length, 1, "one held-item callback exposes the existing action hand");
      samePoint(held[0].hand, pose.arms[0].end, `${kind} held item position`);
      near(held[0].direction, angle, `${kind} held item direction`);
    }
  }
});

test("manual grenade and molotov releases stay connected to the support hand", () => {
  const directions = [0, Math.PI, -Math.PI / 2, Math.PI / 2].map(angle => ({ angle }));
  for (const id of ["grenade", "molotov"]) for (const direction of directions) {
    const { page, state } = quietPage(), player = state.player;
    collect(page, id);
    player.armAngle = direction.angle;
    assert.equal(page.debug.useThrowable(id), true, `${id}: button use succeeds`);
    const hand = core.pose("hero", player).arms[0].end;
    const release = state.throwableProjectiles[0];
    assert.ok(release, `${id}: real gameplay creates a thrown object`);
    samePoint(release, { x: player.x + hand.x, y: player.y + hand.y }, `${id} release matches hand anchor`);
  }
});

const imageSources = html => [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]);
test("grenade/molotov controls replace the old dock while firearm pickups remain usable", () => {
  const page = quietPage();
  assert(page.elements.has("grenadeButton"), "grenade button is present");
  assert(page.elements.has("molotovButton"), "molotov button is present");
  assert(!page.elements.has("skillDock") || page.elements.get("skillDock").hidden || page.elements.get("skillDock").style.display === "none",
    "the bottom item dock is removed or hidden");
  for (const id of ["shotgun", "submachineGun", "assaultRifle"]) {
    collect(page, id);
    assert.equal(page.debug.state.weapon.id, id, `${id}: pickup equips the firearm`);
  }
  assert.ok(page.elements.get("pauseSkills").innerHTML.includes(page.skills.byId("survivalInstinct").icon), "fixed survival instinct remains identifiable in the build list");
});

function pngAlphaRange(png, id) {
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20), colorType = png[25];
  assert.equal(png[24], 8, `${id}: 8-bit icon channels`);
  assert.ok(colorType === 4 || colorType === 6, `${id}: a PNG alpha channel is required`);
  assert.equal(png[28], 0, `${id}: packaged icons use non-interlaced PNG rows`);
  const data = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset), type = png.toString("ascii", offset + 4, offset + 8);
    assert.ok(offset + length + 12 <= png.length, `${id}: complete ${type} chunk`);
    if (type === "IDAT") data.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const channels = colorType === 6 ? 4 : 2, stride = width * channels;
  const rows = inflateSync(Buffer.concat(data));
  assert.equal(rows.length, height * (stride + 1), `${id}: all image rows decode`);
  let previous = Buffer.alloc(stride), minimum = 255, maximum = 0;
  for (let y = 0; y < height; y++) {
    const filter = rows[y * (stride + 1)], row = Buffer.alloc(stride);
    assert.ok(filter <= 4, `${id}: supported PNG row filter`);
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? row[x - channels] : 0, up = previous[x];
      const upperLeft = x >= channels ? previous[x - channels] : 0;
      const predicted = left + up - upperLeft;
      const leftError = Math.abs(predicted - left), upError = Math.abs(predicted - up), diagonalError = Math.abs(predicted - upperLeft);
      const paeth = leftError <= upError && leftError <= diagonalError ? left : upError <= diagonalError ? up : upperLeft;
      const correction = [0, left, up, Math.floor((left + up) / 2), paeth][filter];
      row[x] = (rows[y * (stride + 1) + 1 + x] + correction) & 255;
      if (x % channels === channels - 1) {
        minimum = Math.min(minimum, row[x]); maximum = Math.max(maximum, row[x]);
      }
    }
    previous = row;
  }
  return { minimum, maximum };
}

test("all 23 packaged icons are 256x256 PNG cutouts with visible pixels and actual transparency", () => {
  const invalid = [];
  for (const id of itemArt.ids) {
    try {
      const png = readFileSync(join(publicRoot, "assets/items", `${id}.png`));
      assert.equal(png.toString("hex", 0, 8), "89504e470d0a1a0a", `${id}: valid packaged PNG`);
      assert.equal(png.readUInt32BE(16), 256, `${id}: icon width`);
      assert.equal(png.readUInt32BE(20), 256, `${id}: icon height`);
      const alpha = pngAlphaRange(png, id);
      assert.equal(alpha.minimum, 0, `${id}: transparent background pixels`);
      assert.ok(alpha.maximum >= 128, `${id}: the icon has visible artwork`);
    } catch (error) { invalid.push(error.message); }
  }
  assert.equal(invalid.length, 0, invalid.join("\n"));
});

if (failures.length) {
  console.error(`\n${failures.length} item integration check(s) failed.`);
  process.exitCode = 1;
} else console.log("\nAll item integration checks passed (logic/Canvas commands, not browser pixels or device verification).");
