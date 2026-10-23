import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join, resolve, extname } from "node:path";
import { runLootChecks } from "../prototype-2d/tests/loot-smoke.mjs";
import { runInventoryReferenceChecks } from "../prototype-2d/tests/inventory-reference-smoke.mjs";

const root = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT)
  : fileURLToPath(new URL("../", import.meta.url));
const evidence = join(root, "evidence/local/scene-loot");
const results = [];
const pass = (label, details = {}) => { results.push({ label, ...details }); console.log(`PASS ${label}`, JSON.stringify(details)); };

async function walkDoorInBrowser(page, houseId, direction = "enter") {
  const entering = direction === "enter";
  const setup = await page.evaluate(({ houseId, entering }) => {
    const d = window.__LAST_NIGHT_DEBUG__;
    const house = d.houses.houses.find(item => item.id === houseId);
    if (!house) throw new Error(`unknown house ${houseId}`);
    const vectors = {
      south: { outward: { x: 0, y: 1 }, enter: "KeyW", leave: "KeyS" },
      north: { outward: { x: 0, y: -1 }, enter: "KeyS", leave: "KeyW" },
      east: { outward: { x: 1, y: 0 }, enter: "KeyA", leave: "KeyD" },
      west: { outward: { x: -1, y: 0 }, enter: "KeyD", leave: "KeyA" }
    }[house.door.side] || { outward: { x: 0, y: 1 }, enter: "KeyW", leave: "KeyS" };
    const radius = d.state.player.radius || 19;
    let point;
    if (entering) {
      point = { x: house.door.x + vectors.outward.x * 72, y: house.door.y + vectors.outward.y * 72 };
    } else {
      const room = d.state.room;
      if (!room) throw new Error("cannot leave without an active room");
      point = { x: room.exit.x - vectors.outward.x * 24, y: room.exit.y - vectors.outward.y * 24 };
      for (const offset of [0, -32, 32, -64, 64, -96, 96]) {
        const candidate = vectors.outward.x
          ? { x: point.x, y: point.y + offset }
          : { x: point.x + offset, y: point.y };
        if (d.houses.isFree(room, candidate.x, candidate.y, radius)) { point = candidate; break; }
      }
      if (!d.houses.isFree(room, point.x, point.y, radius)) throw new Error("room doorway point is blocked");
    }
    d.state.player.x = point.x; d.state.player.y = point.y;
    return { key: vectors[entering ? "enter" : "leave"], point };
  }, { houseId, entering });
  await page.keyboard.down(setup.key);
  try {
    return await page.evaluate(({ houseId, entering }) => {
      const d = window.__LAST_NIGHT_DEBUG__;
      let maxStep = 0; let frames = 0;
      for (; frames < 36; frames += 1) {
        const before = { x: d.state.player.x, y: d.state.player.y };
        d.step(1 / 60);
        maxStep = Math.max(maxStep, Math.hypot(d.state.player.x - before.x, d.state.player.y - before.y));
        if (entering ? d.state.room?.houseId === houseId : !d.state.room) break;
      }
      return { roomId: d.state.room?.houseId || null, scene: d.state.scene, maxStep, frames, snapshot: d.snapshot() };
    }, { houseId, entering });
  } finally {
    await page.keyboard.up(setup.key);
  }
}

async function browserChecks() {
  const require = createRequire(import.meta.url);
  const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH
    ? require(process.env.PLAYWRIGHT_MODULE_PATH) : require("playwright");
  const contentTypes = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html" };
  const publicRoot = resolve(root, "prototype-2d");
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (pathname === "/favicon.ico") { response.writeHead(204).end(); return; }
    const filename = resolve(publicRoot, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!filename.startsWith(publicRoot + "/") && !filename.startsWith(publicRoot + "\\")) { response.writeHead(403).end(); return; }
    try { response.setHeader("Content-Type", `${contentTypes[extname(filename)] || "application/octet-stream"}; charset=utf-8`); response.end(readFileSync(filename)); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch({ channel: process.env.LOOT_BROWSER_CHANNEL || process.env.COMBAT_BROWSER_CHANNEL || "msedge", headless: true });
    const url = `http://127.0.0.1:${server.address().port}/index.html?admin=1&tester=loot`;
    for (const viewport of [{ width: 1280, height: 720 }, { width: 960, height: 540 }, { width: 844, height: 390 }]) {
      const page = await browser.newPage({ viewport, hasTouch: true, isMobile: true });
      const prefix = viewport.width === 1280 ? "landscape" : viewport.width === 960 ? "compact-landscape" : "phone-landscape";
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      await page.goto(url); await page.locator("#startRun").click();
      await page.evaluate(() => { const d = window.__LAST_NIGHT_DEBUG__; d.state.godMode = true; d.state.paused = false; });
      assert.equal(await page.locator("[data-upgrade-id], #levelOverlay, #upgradeList").count(), 0);
      assert.equal(await page.locator("#skillDock").count(), 0, "the legacy bottom skill dock is absent");
      assert.equal(await page.locator("#grenadeButton").count(), 1, "the grenade button is present");
      assert.equal(await page.locator("#molotovButton").count(), 1, "the molotov button is present");
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const contact = await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__, s = d.state;
        const x = s.player.x, y = s.player.y;
        const ball = d.spawnLoot("grenade", "common", x + 90, y);
        const before = s.throwables.grenade; d.step(1 / 60);
        const distant = s.throwables.grenade;
        s.player.x = ball.x; s.player.y = ball.y; d.step(1 / 60);
        const first = s.throwables.grenade;
        const secondBall = d.spawnLoot("grenade", "common", s.player.x, s.player.y); d.step(1 / 60);
        return { before, distant, first, second: s.throwables.grenade,
          secondBall: Boolean(secondBall), phase: s.phase, active: s.activeThrowableId };
      });
      assert.equal(contact.before, 0); assert.equal(contact.distant, 0, "a distant ball is not magnet collected");
      assert.equal(contact.first, 1); assert.equal(contact.second, 2); assert(contact.secondBall);
      assert.equal(contact.active, "grenade"); assert.equal(contact.phase, "playing");
      await page.screenshot({ path: join(evidence, `${prefix}-item-levels.png`) });
      pass(`${prefix} browser touch collection and duplicate throwable count`, { viewport, ...contact });

      await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__;
        d.searchSupplyBox({ id: "unknown-grid-fixture", lootType: "safe", contents: [
          { itemId: "basketball", quality: "legendary" }, "vacuum", "scar"
        ] });
      });
      assert.equal(await page.locator("#searchGrid .is-unidentified").count(), 3, "a locked box immediately shows all item footprints");
      assert.equal(await page.locator("#searchGrid .is-searching").count(), 0, "a locked box cannot start identifying");
      assert.equal(await page.locator("#searchGrid [data-item-id]").count(), 0, "unknown items cannot expose interactive identities");
      assert((await page.locator("#searchSubtitle").textContent()).includes("箱内共 3 件 · 剩余 3 件"));
      assert(!/篮球|吸尘器|SCAR/.test(await page.locator("#searchGrid").innerHTML()), "unknown cards hide names and art");
      assert(await page.locator("#searchTakeAll").isDisabled());
      await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__; d.step(.2);
        if (d.searchPanel.elapsed !== 0 || d.takeSearchItem(0)) throw new Error("locked box leaked identification or claim");
        for (let i = 0; i < 4; i++) { d.searchPanel.lock.elapsed = .7; d.confirmLock(); }
      });
      assert.equal(await page.locator("#searchGrid .is-unidentified").count(), 3);
      assert.equal(await page.locator("#searchGrid .is-searching").count(), 1);
      const unknownPositions = await page.locator("#searchGrid .is-unidentified").evaluateAll(cards => cards.map(card => {
        const r = card.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
      }));
      await page.screenshot({ path: join(evidence, `${prefix}-all-unknown-footprints.png`) });
      await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.step(20));
      const knownPositions = await page.locator("#searchGrid .ready").evaluateAll(cards => cards.map(card => {
        const r = card.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
      }));
      assert.deepEqual(knownPositions, unknownPositions, "multi-cell items retain the same footprint after identification");
      await page.locator("#bagClose").click();
      pass(`${prefix} all unknown supplies and totals appear immediately without identity leaks or footprint changes`, { count: 3 });

      // Walk through the real exterior doorway. The floor plan is rendered at
      // the same world coordinate; the interaction button remains for search.
      const houseInfo = await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__, h = d.houses.houses[0];
        return { id: h.id, building: h.building, door: h.door };
      });
      const houseId = houseInfo.id;
      const entered = await walkDoorInBrowser(page, houseId, "enter");
      assert.equal(entered.roomId, houseId);
      assert(entered.maxStep <= 24, `browser door crossing moved ${entered.maxStep.toFixed(2)}px in one frame`);
      assert.equal(entered.snapshot.worldLayer, "city");
      assert.equal(entered.snapshot.room.layer, "city");
      assert.deepEqual(entered.snapshot.room.worldBounds, {
        minX: houseInfo.building.x, minY: houseInfo.building.y,
        maxX: houseInfo.building.x + houseInfo.building.width, maxY: houseInfo.building.y + houseInfo.building.height,
        width: houseInfo.building.width, height: houseInfo.building.height
      });
      await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__, cache = d.state.room.containers[0];
        cache.contents = ["pizza", "milk", "ammo", "junk"]; cache.lootType = "travel";
        d.state.player.x = cache.x; d.state.player.y = cache.y; d.step(1 / 60);
      });
      assert(await page.locator("#interactRun").isVisible(), "the interaction button is reserved for searching, not entering a door");
      const buttonBox = await page.locator("#interactRun").boundingBox();
      assert(buttonBox.x >= 0 && buttonBox.y >= 0 && buttonBox.x + buttonBox.width <= viewport.width + 1 && buttonBox.y + buttonBox.height <= viewport.height + 1);
      await page.locator("#interactRun").click();
      assert(await page.locator("#searchWindow").isVisible());
      assert(await page.locator("#bagGrid").isVisible(), "search and backpack are visible together");
      const found = await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__;
        return { entries: d.searchPanel.entries, ground: d.loot.filter(item => item.boxId === d.searchPanel.id), bag: d.bag.length };
      });
      assert.equal(found.entries.length, 4);
      assert.equal(found.ground.length, 0);
      assert.equal(found.bag, 0);
      assert.equal(await page.locator("#searchGrid .is-searching").count(), 1);
      assert.equal(await page.locator("#searchGrid .is-unidentified").count(), 4);
      assert((await page.locator("#searchSubtitle").textContent()).includes("箱内共 4 件 · 剩余 4 件"));
      await page.screenshot({ path: join(evidence, `${prefix}-search-unidentified.png`) });
      await page.locator('#searchGrid [data-search-index="0"]').dblclick();
      assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.bag[0].itemId), "pizza");
      assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.player.hp), await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.player.maxHp), "carrying food doesn't use it");
      await page.locator("#bagClose").click();
      const elapsed = await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.room.containers[0].elapsed);
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.room.containers[0].elapsed), elapsed);
      assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.bag.length), 1);
      await page.locator("#interactRun").click();
      assert.equal(await page.locator('#searchGrid [data-search-index="0"]').count(), 0);
      assert((await page.locator("#searchSubtitle").textContent()).includes("箱内共 4 件 · 剩余 3 件"));
      assert.equal(await page.locator("#searchGrid .loot-card").count(), 3, "reopened box shows every remaining item footprint");
      const sheetBox = await page.locator("#inventorySheet").boundingBox();
      assert(sheetBox.x >= 0 && sheetBox.y >= 0 && sheetBox.x + sheetBox.width <= viewport.width + 1 && sheetBox.y + sheetBox.height <= viewport.height + 1, "inventory fits landscape viewport");

      const drag = async (locator, target) => {
        const box = await locator.boundingBox();
        await page.mouse.move(box.x + 14, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(target.x, target.y, { steps: 10 });
        await page.mouse.up();
      };
      const center = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
      const cell3 = await page.locator('#bagGrid .grid-cell[data-bag-cell="3"]').boundingBox();
      await drag(page.locator('#bagGrid [data-bag-index="0"]'), center(cell3));
      assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.bag[0].slot), 3, "drag preserves the requested empty cell");
      const cell2 = await page.locator('#bagGrid .grid-cell[data-bag-cell="4"]').boundingBox();
      await drag(page.locator('#bagGrid [data-bag-index="0"]'), center(cell2));
      assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.bag[0].slot), 3, "invalid edge placement leaves the item in place");
      const header = await page.locator(".backpack-head strong").boundingBox();
      await drag(page.locator('#bagGrid [data-bag-index="0"]'), center(header));
      assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.bag.length), 1, "releasing over the header is a cancel, not discard");

      // Exercise actual touch pointer capture, then cancellation outside the sheet.
      const cdp = await page.context().newCDPSession(page);
      const foodBox = await page.locator('#bagGrid [data-bag-index="0"]').boundingBox();
      const touch = { x: foodBox.x + 14, y: foodBox.y + foodBox.height / 2 };
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touch] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 5, y: 5 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.bag.length), 1, "touch cancellation never discards");
      assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.bagDrag), null);
      const cell0 = await page.locator('#bagGrid .grid-cell[data-bag-cell="0"]').boundingBox();
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touch] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [center(cell0)] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.bag[0].slot), 0, "touch drag changes the real cell");
      await cdp.detach();

      await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.step(4));
      await page.locator("#searchTakeAll").click();
      assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.bag.length), 4);
      assert.equal(await page.locator("#searchGrid [data-item-id]").count(), 0);
      const ammoBeforeUse = await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.weapon.ammoReserve);
      assert.equal(ammoBeforeUse, 90, "search transfer doesn't grant ammo immediately");
      assert.equal(await page.locator("#bagGrid [data-bag-index]").count(), 4, "two-cell items render one card");
      assert.equal(await page.evaluate(() => document.querySelector("#bagScroll").scrollHeight > document.querySelector("#bagScroll").clientHeight), true, "five-column inventory scrolls within its bounded panel");
      await page.screenshot({ path: join(evidence, `${prefix}-search-and-backpack.png`) });

      await page.evaluate(() => { window.__LAST_NIGHT_DEBUG__.state.player.hp = 1; });
      await page.locator('#bagGrid [data-bag-index="1"]').click();
      assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.player.hp), 1, "clicking selects rather than consumes food");
      await page.locator("#bagUse").click();
      assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.player.hp), 17);
      assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.bag.length), 3);
      await page.locator('#bagGrid [data-bag-index="2"]').click();
      assert(await page.locator("#bagUse").isDisabled(), "junk has no Use action");
      await drag(page.locator('#bagGrid [data-bag-index="1"]'), { x: 5, y: 5 });
      const droppedBag = await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__;
        return { count: d.bag.length, dropped: d.loot.find(item => item.droppedFromBag), reserve: d.state.weapon.ammoReserve };
      });
      assert.equal(droppedBag.count, 2);
      assert.equal(droppedBag.dropped.itemId, "ammo");
      assert.equal(droppedBag.reserve, ammoBeforeUse);
      assert.equal(droppedBag.dropped.kind, "supply");
      await page.locator("#bagClose").click();
      await page.locator("#bagButton").click();
      assert(await page.locator("#bagGrid").isVisible());
      assert(await page.locator("#searchWindow").isHidden());
      await page.screenshot({ path: join(evidence, `${prefix}-bag-only.png`) });
      await page.locator("#bagClose").click();
      pass(`${prefix} resumable search, shared backpack, mouse/touch moves, cancellation, explicit use and outside discard`, { viewport, droppedBag });

      await page.evaluate(() => { window.__LAST_NIGHT_DEBUG__.state.paused = false; });
      await page.locator("#pauseRun").click();
      assert(await page.locator("#pauseOverlay").isVisible());
      assert.equal(await page.locator("#pauseSkills .pause-skill").count(), 3);
      const beforePause = await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__;
        return JSON.stringify({ time: d.state.time, loot: d.loot, room: d.state.room, player: d.state.player });
      });
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__;
        return JSON.stringify({ time: d.state.time, loot: d.loot, room: d.state.room, player: d.state.player });
      }), beforePause);
      const sheet = page.locator("#pauseOverlay .sheet");
      await sheet.evaluate(element => { element.scrollTop = 0; });
      await page.screenshot({ path: join(evidence, `${prefix}-pause-top.png`) });
      await page.locator("#resumeRun").scrollIntoViewIfNeeded();
      const resume = await page.locator("#resumeRun").boundingBox();
      assert(resume.y >= 0 && resume.y + resume.height <= viewport.height + 1);
      await page.screenshot({ path: join(evidence, `${prefix}-pause-bottom.png`) });
      await page.locator("#resumeRun").click();
      const exited = await walkDoorInBrowser(page, houseId, "leave");
      assert.equal(exited.roomId, null);
      assert.equal(exited.scene, "city");
      assert(exited.maxStep <= 24, `browser door exit moved ${exited.maxStep.toFixed(2)}px in one frame`);
      const returned = await walkDoorInBrowser(page, houseId, "enter");
      assert.equal(returned.roomId, houseId);
      assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.room.containers[0].searched), true);
      await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__; d.state.paused = true; d.state.time = 299; d.step(1);
      });
      assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.phase), "victory");
      await page.locator("#restartRun").click();
      const reset = await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__; d.state.paused = true;
        return { scene: d.state.scene, slots: d.build.slots().length, weapon: d.state.weapon.id, time: d.state.time };
      });
      assert.equal(reset.scene, "city"); assert.equal(reset.slots, 2); assert.equal(reset.weapon, "assaultRifle"); assert(reset.time < .2);
      await page.screenshot({ path: join(evidence, `${prefix}-restart.png`) });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      pass(`${prefix} real pause freezes search state, physical doorway exit and return preserve caches, victory restart resets the run`, { viewport, entry: entered, exit: exited });
      await page.close();
    }
     const live = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    live.on("pageerror", error => errors.push(error.message)); await live.goto(url); await live.locator("#startRun").click();
    const start = await live.evaluate(() => { const d = window.__LAST_NIGHT_DEBUG__; d.state.godMode = true; return { x: d.state.player.x, shots: d.state.stats.shots, time: d.state.time }; });
     await live.keyboard.down("KeyD"); await live.keyboard.down("Space"); await live.waitForTimeout(3500); await live.keyboard.up("Space"); await live.keyboard.up("KeyD");
    const end = await live.evaluate(() => { const d = window.__LAST_NIGHT_DEBUG__; d.state.paused = true; return { x: d.state.player.x, shots: d.state.stats.shots, time: d.state.time, phase: d.state.phase, loot: d.loot.length }; });
    assert(end.x > start.x); assert(end.shots > start.shots); assert(end.time > start.time + 2); assert.equal(end.phase, "playing"); assert(end.loot > 0);
    await live.screenshot({ path: join(evidence, "desktop-live-drop.png") });
    pass("browser real loop continues moving and firing during natural scene drops", { seconds: end.time - start.time, shots: end.shots - start.shots, browser: browser.version() });
    await live.close(); assert.deepEqual(errors, []);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}

try {
  mkdirSync(evidence, { recursive: true });
  if (!process.argv.includes("--browser-only")) {
    pass("real page simulation regression", runLootChecks());
    pass("video inventory regression", runInventoryReferenceChecks());
  }
  if (!process.argv.includes("--unit-only")) await browserChecks();
  writeFileSync(join(evidence, "results.json"), JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
  console.log("All requested checks passed. See results.json for the checks actually run; simulation is not a phone playtest.");
} catch (error) { console.error(error.stack); process.exitCode = 1; }
