import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT) : fileURLToPath(new URL("../../", import.meta.url));
const webRoot = resolve(root, "prototype-2d");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const errors = [];
const server = createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname === "/favicon.ico") { response.writeHead(204).end(); return; }
  const file = resolve(webRoot, "." + decodeURIComponent(pathname === "/" ? "/index.html" : pathname));
  if (!file.startsWith(webRoot + sep)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader("Content-Type", { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" }[extname(file)] || "application/octet-stream");
    response.setHeader("Cache-Control", "no-store");
    response.end(readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}/?admin=1&tester=throwable-visual`;
let browser;
try {
  browser = await chromium.launch({ channel: process.env.COMBAT_BROWSER_CHANNEL || "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__LAST_NIGHT_DEBUG__?.visualAssets.ready, null, { timeout: 30000 });
  await page.locator("#startRun").click();
  assert.equal(await page.locator("#skillDock").count(), 0, "the bottom skill dock is absent");
  assert.equal(await page.locator("#grenadeButton").count(), 1, "grenade button is visible");
  assert.equal(await page.locator("#molotovButton").count(), 1, "molotov button is visible");
  for (const id of ["grenadeButton", "molotovButton"]) {
    const box = await page.locator("#" + id).boundingBox();
    assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 1280 && box.y + box.height <= 720, `${id} stays inside the viewport`);
  }
  const result = await page.evaluate(() => {
    const debug = window.__LAST_NIGHT_DEBUG__;
    debug.state.throwables = { grenade: 1, molotov: 1 };
    debug.state.player.throwAction = 0;
    debug.state.enemies = [{ ...debug.state.enemies[0], x: debug.state.player.x + 100, y: debug.state.player.y, speed: 0, baseSpeed: 0, hp: 10000, maxHp: 10000, contactTimer: Infinity }];
    return { phase: debug.state.phase, buttons: [document.getElementById("grenadeButton").disabled, document.getElementById("molotovButton").disabled] };
  });
  assert.equal(result.phase, "playing");
  await page.evaluate(() => { document.getElementById("grenadeButton").disabled = false; document.getElementById("molotovButton").disabled = false; });
  await page.locator("#grenadeButton").click();
  assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.throwables.grenade), 0, "grenade button consumes one charge");
  await page.waitForTimeout(450);
  await page.locator("#molotovButton").click();
  assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.throwables.molotov), 0, "molotov button consumes one charge");
  assert.deepEqual(errors, []);
  console.log("PASS browser layout and manual use of the separate grenade/molotov buttons");
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
