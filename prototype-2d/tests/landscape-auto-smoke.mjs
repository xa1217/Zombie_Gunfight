import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bootPage } from "./loot-smoke.mjs";

// Auto-landscape: a portrait phone must play without the user rotating the
// device. The shell is rotated 90deg by CSS, and pointer math that reads
// getBoundingClientRect() (visual, rotated box) is mapped back to shell-local
// space. rotate(90deg) clockwise maps local (x, y) to visual (-y, x), so the
// inverse used by the joystick is local = (visualY, -visualX).
export function runLandscapeAutoChecks() {
  const source = readFileSync(
    fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");
  assert(source.includes("transform: rotate(90deg)"),
    "portrait CSS rotates the shell 90deg");
  assert(!source.includes("@media (orientation: portrait) and (pointer: coarse) { .orientation-hint { display: grid; } }"),
    "portrait phones no longer get the rotate-device blocker overlay");
  assert(source.includes(".force-portrait .game-shell"),
    "force-portrait test hook reproduces the rotated layout on desktop");

  const page = bootPage();
  page.start();
  const debug = page.debug;
  // Harness has no viewport size, so the shell is not rotated there and the
  // unrotated path must stay identity.
  assert.equal(debug.shellRotated(), false, "harness viewport is not portrait-rotated");
  assert.deepEqual(
    { ...debug.rotateInputVector(10, 20, false) }, { x: 10, y: 20 },
    "unrotated joystick vector is unchanged");
  assert.deepEqual(
    { ...debug.rotateInputVector(10, 20, true) }, { x: 20, y: -10 },
    "rotated joystick vector maps visual (10,20) back to local (20,-10)");
  // The lock attempt must be a silent no-op without a real screen API.
  assert.doesNotThrow(() => debug.requestLandscapeLock(), "lock attempt never throws");

  console.log("PASS auto-landscape: CSS rotation + hint removal + joystick vector mapping");
  return { simulated: true, landscapeAutoRegression: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runLandscapeAutoChecks();
