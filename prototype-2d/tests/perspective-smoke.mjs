import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bootPage } from "./loot-smoke.mjs";

// Alien-Shooter-style high-angle view: buildings read as solid blocks with a
// southeast cast shadow, a south wall band and a thin east face; trees cast a
// southeast shadow; the camera leans toward the aim direction while playing.
// Collision is untouched: only the drawing changes, so this test drives the
// real drawScenery with a recording canvas stand-in.
function recordingContext() {
  const calls = [];
  const ctx = { calls };
  for (const name of ["save", "restore", "beginPath", "moveTo", "lineTo", "closePath", "fill", "stroke", "fillRect", "strokeRect", "ellipse", "arc", "drawImage", "clip", "translate", "rotate", "setLineDash"]) {
    ctx[name] = (...args) => { calls.push({ name, args }); };
  }
  return ctx;
}

export function runPerspectiveChecks() {
  const page = bootPage();
  page.start();
  const debug = page.debug;
  const city = debug.map;

  const building = city.scenery.find(item => item.type === "building");
  assert(building, "city has a building scenery item");
  const b = building.building;
  const ctx = recordingContext();
  city.drawScenery(ctx, building);
  const fillRects = ctx.calls.filter(call => call.name === "fillRect");
  assert(fillRects.some(call => call.args[0] === b.x + 16 && call.args[1] === b.y + 20 && call.args[2] === b.width && call.args[3] === b.height + 20),
    "building draws a southeast cast shadow");
  assert(fillRects.some(call => call.args[0] === b.x && call.args[1] === b.y + b.height && call.args[2] === b.width && call.args[3] === 20),
    "building draws a south wall band below its facade");
  assert(ctx.calls.some(call => call.name === "moveTo" && call.args[0] === b.x + b.width && call.args[1] === b.y + 6),
    "building draws a thin east face for thickness");

  const tree = city.scenery.find(item => item.type === "tree");
  assert(tree, "city has a tree scenery item");
  const treeCtx = recordingContext();
  city.drawScenery(treeCtx, tree);
  assert(treeCtx.calls.some(call => call.name === "ellipse" && Math.abs(call.args[0] - (tree.x + tree.width / 2 + 14)) < 0.01),
    "tree draws a southeast cast shadow");

  // Camera aim lookahead: aim east from spawn (720, spawn y) shifts the camera
  // 56px east, i.e. camera.x = 720 + 56 - 640 = 136.
  debug.state.enemies = [];
  debug.state.player.aim = 0;
  debug.state.player.x = 720;
  page.frame();
  const camera = debug.snapshot().camera;
  assert(camera, "snapshot exposes the camera");
  assert.equal(camera.x, 136, "camera leans 56px toward the aim direction");

  console.log("PASS perspective: building shadow + wall band + east face, tree shadow, aim lookahead camera");
  return { simulated: true, perspectiveRegression: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runPerspectiveChecks();
