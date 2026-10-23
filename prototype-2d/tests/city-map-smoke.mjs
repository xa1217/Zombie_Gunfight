import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve, extname } from "node:path";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import vm from "node:vm";

const projectRoot = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT)
  : fileURLToPath(new URL("../../", import.meta.url));
const publicRoot = join(projectRoot, "prototype-2d");
const evidence = join(projectRoot, "evidence/local/city-map");
const html = readFileSync(join(publicRoot, "index.html"), "utf8");
const results = [];
const plain = value => JSON.parse(JSON.stringify(value));
const pass = (label, details = {}) => {
  results.push({ label, ...details });
  console.log(`PASS ${label}`, JSON.stringify(details));
};

function boot() {
  const noop = () => {};
  const drawCalls = [];
  const drawing = new Proxy({}, { get(target, key) {
    if (key === "createLinearGradient" || key === "createRadialGradient") return () => ({ addColorStop: noop });
    if (key === "measureText") return text => ({ width: String(text).length * 8 });
    if (!target[key]) target[key] = (...args) => { drawCalls.push({ name: String(key), args }); };
    return target[key];
  }, set(target, key, value) { target[key] = value; return true; } });
  class Element {
    constructor(id) {
      this.id = id; this.value = "1"; this.hidden = false; this.style = {};
      this.width = id === "gameCanvas" ? 1280 : 0; this.height = id === "gameCanvas" ? 720 : 0;
      this.innerHTML = ""; this.textContent = ""; this.handlers = new Map();
      this.classList = { add: noop, remove: noop, toggle: noop };
    }
    addEventListener(name, callback) {
      if (!this.handlers.has(name)) this.handlers.set(name, []);
      this.handlers.get(name).push(callback);
    }
    emit(name, event = {}) {
      for (const callback of this.handlers.get(name) || []) callback({ preventDefault: noop, target: this, ...event });
    }
    getContext() { return drawing; }
    focus() {}
    getBoundingClientRect() { return { left: 0, top: 0, width: 94, height: 94 }; }
    setPointerCapture() {}
    hasPointerCapture() { return false; }
    releasePointerCapture() {}
  }
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], new Element(match[1])]));
  const events = new Element("window");
  let randomSeed = 81427;
  const randomMath = Object.create(Math);
  randomMath.random = () => { randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0; return randomSeed / 4294967296; };
  const sandbox = {
    console, URLSearchParams, Date, Math: randomMath, performance: { now: () => 0 },
    matchMedia: () => ({ matches: true }), location: { search: "?admin=1&tester=city" }, navigator: {},
    requestAnimationFrame: noop, addEventListener: events.addEventListener.bind(events),
    document: { hidden: false, getElementById: id => elements.get(id), createElement: () => new Element("terrain"), addEventListener: noop }
  };
  sandbox.window = sandbox;
  const runtime = vm.createContext(sandbox);
  for (const script of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const filename = /src="([^"]+)"/.exec(script[1])?.[1];
    const source = filename ? readFileSync(join(publicRoot, filename), "utf8") : script[2];
    if (source.trim()) vm.runInContext(source, runtime, { filename: filename || "index.html#inline" });
  }
  return { debug: sandbox.__LAST_NIGHT_DEBUG__, city: sandbox.WASTELAND_CITY, drawCalls,
    click(id) { elements.get(id).emit("click"); },
    key(code, down = true) { events.emit(down ? "keydown" : "keyup", { code, repeat: false }); } };
}

function wallFixture(map, radius = 20) {
  for (const building of map.buildings) {
    const y = building.y + building.height / 2;
    const left = { x: building.x - radius - 3, y, radius };
    const right = { x: building.x + building.width + radius + 3, y, radius };
    if (map.isFree(left.x, left.y, radius) && map.isFree(right.x, right.y, radius)) {
      return { building, left, right };
    }
  }
  throw new Error("No building has two accessible opposing sides for the collision test");
}

const DOOR_VECTORS = {
  south: { outward: { x: 0, y: 1 }, inward: { x: 0, y: -1 }, enter: "KeyW", leave: "KeyS" },
  north: { outward: { x: 0, y: -1 }, inward: { x: 0, y: 1 }, enter: "KeyS", leave: "KeyW" },
  east: { outward: { x: 1, y: 0 }, inward: { x: -1, y: 0 }, enter: "KeyA", leave: "KeyD" },
  west: { outward: { x: -1, y: 0 }, inward: { x: 1, y: 0 }, enter: "KeyD", leave: "KeyA" }
};
function walkDoor(game, house, direction = "enter") {
  const debug = game.debug;
  const vectors = DOOR_VECTORS[house?.door?.side] || DOOR_VECTORS.south;
  const radius = debug.state.player.radius || 19;
  let point;
  if (direction === "enter") {
    point = { x: house.door.x + vectors.outward.x * 72, y: house.door.y + vectors.outward.y * 72 };
  } else {
    const room = debug.state.room;
    assert(room, "a room is required to leave through its doorway");
    point = { x: room.exit.x - vectors.outward.x * 24, y: room.exit.y - vectors.outward.y * 24 };
    const offsets = [0, -32, 32, -64, 64, -96, 96];
    for (const offset of offsets) {
      const candidate = vectors.outward.x
        ? { x: point.x, y: point.y + offset }
        : { x: point.x + offset, y: point.y };
      if (debug.houses.isFree(room, candidate.x, candidate.y, radius)) { point = candidate; break; }
    }
    assert(debug.houses.isFree(room, point.x, point.y, radius), "room doorway point is walkable");
  }
  debug.state.player.x = point.x; debug.state.player.y = point.y;
  const entering = direction === "enter";
  const key = vectors[entering ? "enter" : "leave"];
  let maxStep = 0;
  let frames = 0;
  game.key(key);
  try {
    for (; frames < 36; frames += 1) {
      const before = { x: debug.state.player.x, y: debug.state.player.y };
      debug.step(1 / 60);
      maxStep = Math.max(maxStep, Math.hypot(debug.state.player.x - before.x, debug.state.player.y - before.y));
      if (entering ? debug.state.room?.houseId === house.id : !debug.state.room) break;
    }
  } finally {
    game.key(key, false);
  }
  if (entering) {
    assert.equal(debug.state.room?.houseId, house.id, "walking toward a door activates its floor plan");
  } else {
    assert.equal(debug.state.room, null, "walking away from a door leaves its floor plan");
  }
  assert(frames < 36, `doorway ${entering ? "entry" : "exit"} did not activate while moving`);
  assert(maxStep <= 24, `door crossing moved ${maxStep.toFixed(2)}px in one frame`);
  return { maxStep, frames };
}

function checkFloorConnectivity(houses, house) {
  const room = houses.createRoom(house), radius = 24, spacing = 8;
  const start = { ...room.entry, radius };
  assert(houses.isFree(room, start.x, start.y, radius), house.id + " entrance fits the largest infected");
  const queue = [{ ...start, gx: 0, gy: 0 }], visited = new Set(["0,0"]);
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
      const gx = current.gx + dx, gy = current.gy + dy, key = gx + "," + gy;
      if (visited.has(key)) continue;
      const x = start.x + gx * spacing, y = start.y + gy * spacing;
      if (!houses.isFree(room, x, y, radius)) continue;
      const actor = { x: current.x, y: current.y, radius };
      houses.move(room, actor, dx * spacing, dy * spacing);
      if (Math.hypot(actor.x - x, actor.y - y) > .05) continue;
      visited.add(key); queue.push({ x, y, gx, gy });
    }
  }
  // Count all standable nodes too, so an isolated pocket behind furniture
  // cannot pass merely because the four cache positions happen to be free.
  for (let gx = Math.ceil((room.bounds.minX - start.x) / spacing); gx <= Math.floor((room.bounds.maxX - start.x) / spacing); gx += 1)
    for (let gy = Math.ceil((room.bounds.minY - start.y) / spacing); gy <= Math.floor((room.bounds.maxY - start.y) / spacing); gy += 1) {
      const x = start.x + gx * spacing, y = start.y + gy * spacing;
      if (houses.isFree(room, x, y, radius)) assert(visited.has(gx + "," + gy), house.id + " has an unreachable furniture pocket at " + x + "," + y);
    }
  for (const cache of room.containers) {
    assert(houses.isFree(room, cache.x, cache.y, 19), cache.id + " is a standable search point");
    assert(queue.some(point => Math.hypot(point.x - cache.x, point.y - cache.y) <= 18 && houses.segmentHitFraction(room, point.x, point.y, cache.x, cache.y, 19) === null), cache.id + " is reachable within the actual search range");
  }
  for (const entry of room.invasionEntrances) {
    assert(houses.isFree(room, entry.x, entry.y, radius), house.id + " invasion landing fits the largest infected");
    assert(queue.some(point => Math.hypot(point.x - entry.x, point.y - entry.y) <= 12), house.id + " invasion landing joins the navigable floor");
  }
  for (const actorRadius of [17, 24]) for (const [from, target] of [[room.invasionEntrances[1], room.containers[3]], [room.containers[0], room.containers[2]], [room.containers[3], room.containers[0]]]) {
    const actor = { x: from.x, y: from.y, radius: actorRadius };
    let steps = 0;
    while (Math.hypot(actor.x - target.x, actor.y - target.y) > 18 && steps < 400) {
      const waypoint = houses.steer(room, actor.x, actor.y, target.x, target.y, actor.radius);
      const distance = Math.hypot(waypoint.x - actor.x, waypoint.y - actor.y);
      assert(distance > .05, house.id + " infected route must leave a furniture corner");
      const before = { ...actor }, stride = Math.min(3, distance);
      houses.move(room, actor, (waypoint.x - actor.x) / distance * stride, (waypoint.y - actor.y) / distance * stride);
      assert(Math.hypot(actor.x - before.x, actor.y - before.y) > .05, house.id + " infected must advance around partitions");
      steps += 1;
    }
    assert(steps < 400, house.id + " infected navigates between opposite rooms through the hall");
  }
  return queue.length;
}

function checkContinuousHouseWalk(houses) {
  const game = boot(); game.click("startRun");
  const debug = game.debug;
  Object.assign(debug.state, { godMode: true, density: 0, spawnBudget: 0, hordeTimer: Infinity, lootTimer: Infinity });
  for (const house of houses) {
    assert.equal(house.door.side, "south", house.id + " has clearance for its south doorway");
    const start = { x: house.door.x, y: house.door.y + 72 };
    assert(debug.map.isFree(start.x, start.y, 24), house.id + " has a clear outdoor approach");
    Object.assign(debug.state.player, start); debug.state.room = null;
    for (const [key, arrived] of [["KeyW", () => debug.state.player.y <= house.building.y + house.building.height - 66], ["KeyS", () => !debug.state.room && debug.state.player.y >= house.door.y + 66]]) {
      game.key(key); let frames = 0;
      try {
        while (!arrived() && frames < 100) {
          const before = { x: debug.state.player.x, y: debug.state.player.y };
          debug.state.enemies = []; debug.step(1 / 60); frames += 1;
          assert(Math.hypot(debug.state.player.x - before.x, debug.state.player.y - before.y) < 8, house.id + " crosses without a position jump");
        }
      } finally { game.key(key, false); }
      assert(arrived(), house.id + " walks from the street fully inside and back out");
      if (key === "KeyW") assert.equal(debug.state.room?.houseId, house.id);
    }
  }
}

function unitChecks() {
  const game = boot();
  game.click("startRun");
  const debug = game.debug;
  const map = debug.map;
  assert.equal(map.width, 1440);
  assert.equal(map.height, 2560);
  assert.equal(map.width * map.height / (1280 * 720), 4);
  assert.equal(debug.config.worldWidth, map.width);
  assert.equal(debug.config.worldHeight, map.height);
  assert.equal(map.buildings.length, 6, "enlarged houses replace the fifteen small buildings");
  assert.equal(debug.state.player.radius, 19, "the survivor keeps the existing world size");
  assert(map.buildings.every(building => building.width >= 456 && building.height >= 596), "buildings have human-scale footprints");
  assert.equal(debug.snapshot().map.areaScale, 4);
  assert.equal(debug.snapshot().map.buildingCount, map.buildings.length);
  assert(map.isFree(map.spawn.x, map.spawn.y, 24));
  const houses = debug.houses?.houses || [];
  assert.equal(houses.length, map.buildings.length, "every city building has one enterable house record");
  assert(new Set(map.buildings.map(building => building.houseType)).size >= 2, "city mixes house footprints");
  assert(map.buildings.some(building => building.floors > 1), "city includes a multi-floor building");
  assert(map.buildings.some(building => building.ruined), "city includes a ruined building");
  for (const house of houses) {
    assert(map.isFree(house.door.x, house.door.y, 20), `${house.id} has a walkable entrance`);
    const actor = { x: map.spawn.x, y: map.spawn.y, radius: 19 };
    let steps = 0;
    while (Math.hypot(actor.x - house.door.x, actor.y - house.door.y) > 65 && steps < 1600) {
      const waypoint = map.steer(actor.x, actor.y, house.door.x, house.door.y, actor.radius);
      const distance = Math.hypot(waypoint.x - actor.x, waypoint.y - actor.y);
      assert(distance > 0 && Number.isFinite(distance), `${house.id} has a navigation waypoint`);
      map.move(actor, (waypoint.x - actor.x) / distance * Math.min(4, distance),
        (waypoint.y - actor.y) / distance * Math.min(4, distance));
      assert(map.isFree(actor.x, actor.y, actor.radius), `${house.id} navigation avoids buildings`);
      steps += 1;
    }
    assert(Math.hypot(actor.x - house.door.x, actor.y - house.door.y) <= 65,
      `${house.id} remained unreachable after ${steps} navigation steps`);
  }
  assert.deepEqual(plain(map.buildings), plain(game.city.create(1440, 2560).buildings), "layout is reproducible");
  for (const building of map.buildings) {
    assert(building.width > 0 && building.height > 0);
    assert(building.x >= 0 && building.y >= 0);
    assert(building.x + building.width <= map.width && building.y + building.height <= map.height);
    assert.equal(map.isFree(building.x + building.width / 2, building.y + building.height / 2, 20), false);
  }
  assert.equal(map.roads.vertical.length, 1, "street density decreases with the larger houses");
  assert.equal(map.roads.horizontal.length, 2, "three city rows replace the old dense blocks");
  assert.equal(map.blocks.length, map.buildings.length, "each non-street plot contains exactly one house");
  assert(map.roads?.bendAmplitude?.x > 0 && map.roads?.bendAmplitude?.y > 0, "roads expose a non-zero visual bend");
  assert.equal(map.isFree(-1, map.spawn.y, 20), false);
  assert.equal(map.isFree(map.width + 1, map.spawn.y, 20), false);
  pass("city map exposes varied buildings with walkable entrances and deterministic layout", { buildings: map.buildings.length, houseTypes: [...new Set(map.buildings.map(building => building.houseType))] });
  const floorNodes = houses.map(house => checkFloorConnectivity(debug.houses, house));
  checkContinuousHouseWalk(houses);
  pass("all six full-size interiors, caches and invasion landings are connected and allow continuous street entry/exit", { floorNodes, actorRadius: 24 });

  const fixture = wallFixture(map);
  const actor = { ...fixture.left };
  for (let move = 0; move < 30; move += 1) {
    map.move(actor, 12, 0);
    assert(map.isFree(actor.x, actor.y, actor.radius));
    assert(actor.x <= fixture.building.x - actor.radius + .001);
  }
  const beforeSlide = actor.y;
  map.move(actor, 10, -10);
  assert(actor.y < beforeSlide, "movement along a wall remains available");
  assert(map.isFree(actor.x, actor.y, actor.radius));
  const enemy = { ...fixture.left };
  map.updateNavigation(fixture.right.x, fixture.right.y);
  const startDistance = Math.hypot(enemy.x - fixture.right.x, enemy.y - fixture.right.y);
  let steps = 0;
  while (Math.hypot(enemy.x - fixture.right.x, enemy.y - fixture.right.y) > 24 && steps < 1000) {
    const waypoint = map.steer(enemy.x, enemy.y, fixture.right.x, fixture.right.y, enemy.radius);
    assert(Number.isFinite(waypoint.x) && Number.isFinite(waypoint.y));
    const distance = Math.hypot(waypoint.x - enemy.x, waypoint.y - enemy.y);
    assert(distance > 0, "an unobstructed waypoint must be available");
    map.move(enemy, (waypoint.x - enemy.x) / distance * Math.min(3, distance),
      (waypoint.y - enemy.y) / distance * Math.min(3, distance));
    assert(map.isFree(enemy.x, enemy.y, enemy.radius));
    steps += 1;
  }
  assert(Math.hypot(enemy.x - fixture.right.x, enemy.y - fixture.right.y) <= 24,
    `navigation remained blocked after ${steps} steps`);
  pass("city collision blocks entry, permits sliding, and routes an infected around a building", { startDistance, routeSteps: steps });

  const nearWall = { ...fixture.left, radius: 17, x: fixture.building.x - 19 };
  assert(map.isFree(nearWall.x, nearWall.y, nearWall.radius));
  const recover = map.steer(nearWall.x, nearWall.y, fixture.right.x, fixture.right.y, nearWall.radius);
  assert(Math.hypot(recover.x - nearWall.x, recover.y - nearWall.y) > 0,
    "a small infected pushed within 24 pixels of a wall must regain a route");

  debug.state.godMode = true;
  debug.state.nextXp = 1e9;
  debug.state.player.fireTimer = Infinity;
  debug.state.player.x = fixture.building.x - debug.state.player.radius - 3;
  debug.state.player.y = fixture.left.y;
  game.key("KeyD"); debug.step(1); game.key("KeyD", false);
  assert(debug.state.player.x <= fixture.building.x - debug.state.player.radius + .001,
    "real player movement still respects an exterior wall away from a doorway");
  assert.equal(debug.state.player.movingSpeed, 0, "walking into a house settles into standing");
  const house = debug.houses.houses.find(candidate => candidate.building.x === fixture.building.x && candidate.building.y === fixture.building.y);
  assert(house, "the collision fixture has a matching enterable house");
  debug.state.density = 0; debug.state.spawnBudget = 0; debug.state.hordeTimer = Infinity;
  const entry = walkDoor(game, house, "enter");
  const indoorSnapshot = debug.snapshot();
  assert.equal(indoorSnapshot.worldLayer, "city", "interior stays on the city world layer");
  assert.equal(indoorSnapshot.room.layer, "city", "interior snapshot uses the shared city layer");
  assert.deepEqual(plain(indoorSnapshot.room.worldBounds), {
    minX: house.building.x, minY: house.building.y,
    maxX: house.building.x + house.building.width, maxY: house.building.y + house.building.height,
    width: house.building.width, height: house.building.height
  }, "interior occupies the same world footprint as its exterior building");
  game.drawCalls.length = 0;
  debug.step(1 / 60);
  assert(game.drawCalls.some(call => call.name === "drawImage"), "interior render keeps the city terrain visible");
  assert(game.drawCalls.some(call => call.name === "fillRect" && call.args.length >= 4 && Math.abs(call.args[0] - house.building.x) < .001 && Math.abs(call.args[1] - house.building.y) < .001 && Math.abs(call.args[2] - house.building.width) < .001 && Math.abs(call.args[3] - house.building.height) < .001), "interior render overlays the floor plan on the exterior footprint");
  const exit = walkDoor(game, house, "leave");
  assert.equal(debug.state.scene, "city", "walking back through the same door stays in the city scene");
  assert.equal(debug.state.activeHouseId, null, "leaving the doorway hides only the active interior overlay");
  debug.state.player.x = 710;
  debug.state.player.y = map.spawn.y;
  debug.step(1 / 60);
  const beforeCamera = plain(debug.snapshot().camera);
  game.key("KeyD"); debug.step(.3); game.key("KeyD", false);
  assert(debug.state.player.x > 720, "player crosses the original map's right boundary");
  assert(debug.snapshot().camera.x > beforeCamera.x, "camera follows horizontal movement");
  const margin = debug.config.worldMargin + debug.state.player.radius;
  for (const [x, y] of [[margin, margin], [map.width - margin, margin], [margin, map.height - margin], [map.width - margin, map.height - margin]]) {
    debug.state.player.x = x; debug.state.player.y = y; debug.step(1 / 60);
    const camera = debug.snapshot().camera;
    assert(camera.x >= 0 && camera.y >= -debug.config.cameraTopGutter);
    assert(camera.x <= map.width - 1280 && camera.y <= map.height - 720 + debug.config.cameraBottomGutter);
    assert.equal(camera.x, x < 1280 ? 0 : map.width - 1280);
    assert.equal(camera.y, y < 720 ? -debug.config.cameraTopGutter : map.height - 720 + debug.config.cameraBottomGutter);
    debug.state.enemies = [];
    game.click("adminHorde");
    assert(debug.state.enemies.length > 0);
    for (const spawned of debug.state.enemies) {
      assert.equal(spawned.spawnSource, "map-edge");
      assert(map.isFree(spawned.x, spawned.y, spawned.radius),
        "reinforcement stands on traversable perimeter ground or street");
      assert(Math.hypot(spawned.x - x, spawned.y - y) > spawned.radius + debug.state.player.radius);
      const edgeDistance = Math.min(spawned.x, spawned.y, map.width - spawned.x, map.height - spawned.y);
      assert(Math.abs(edgeDistance - (debug.config.worldMargin + spawned.radius + 4)) < 1e-6,
        "spawn pressure comes from the whole-map perimeter regardless of the current camera");
    }
  }
  pass("walking crosses a real doorway on one city layer, then follows the camera and clamps all four corners", { entry, exit });

  debug.state.player.x = fixture.right.x; debug.state.player.y = fixture.right.y;
  debug.state.spawnBudget = 0; debug.state.density = 0; debug.state.hordeTimer = Infinity;
  const original = debug.state.enemies[0];
  const pursuing = { ...original, x: fixture.building.x - 19, y: fixture.left.y, radius: 17,
    speed: 38, baseSpeed: 38, hp: 100000, maxHp: 100000, dead: false };
  debug.state.enemies = [pursuing];
  let minimum = Math.hypot(pursuing.x - debug.state.player.x, pursuing.y - debug.state.player.y);
  for (let tick = 0; tick < 150; tick += 1) {
    debug.step(.2);
    const indoorWalkable = debug.houses.houses.some(candidate => {
      const room = debug.houses.createRoom(candidate);
      return room.bounds.minX <= pursuing.x && pursuing.x <= room.bounds.maxX && room.bounds.minY <= pursuing.y && pursuing.y <= room.bounds.maxY
        && debug.houses.isFree(room, pursuing.x, pursuing.y, pursuing.radius);
    });
    assert(map.isFree(pursuing.x, pursuing.y, pursuing.radius) || indoorWalkable,
      "infected remains walkable while crossing the shared street/indoor layer");
    minimum = Math.min(minimum, Math.hypot(pursuing.x - debug.state.player.x, pursuing.y - debug.state.player.y));
  }
  // The shared first-floor overlay leaves a slightly wider collision margin
  // at the footprint edge; the real loop still recovers to the same block
  // and remains within one wall radius of the survivor.
  assert(minimum <= 100, `real enemy update remained ${minimum} pixels away behind the shared building`);
  pass("real game infected movement recovers a near-wall position and navigates around the shared building", { closestDistance: Math.round(minimum) });

  debug.state.player.x = fixture.left.x; debug.state.player.y = fixture.left.y;
  const hidden = { ...pursuing, x: fixture.right.x, y: fixture.right.y, baseSpeed: 0, hp: 100000, dead: false };
  debug.state.enemies = [hidden];
  game.key("Space");
  debug.state.player.fireTimer = 0;
  const hitsBefore = debug.state.stats.hits;
  debug.step(.1);
  assert.equal(debug.state.stats.hits, hitsBefore, "manual fire cannot hit a target behind a solid house");
  game.key("Space", false);
  debug.state.player.fireTimer = Infinity;
  debug.state.projectiles = [{ id: -1, x: fixture.left.x, y: fixture.left.y,
    vx: (fixture.right.x - fixture.left.x) * 60, vy: 0, life: 2, damage: 100,
    remaining: 1, hitIds: new Set(), burn: 0, arc: 0 }];
  const hiddenHp = hidden.hp;
  debug.step(1 / 60);
  assert.equal(hidden.hp, hiddenHp, "a fast projectile cannot tunnel through a house");
  assert.equal(debug.state.projectiles.length, 0);
  pass("manual fire cannot hit enemies behind houses and projectile sweeps stop at the wall");
}

async function browserChecks() {
  const require = createRequire(import.meta.url);
  const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH ? require(process.env.PLAYWRIGHT_MODULE_PATH) : require("playwright");
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (pathname === "/favicon.ico") { response.writeHead(204).end(); return; }
    const filename = resolve(publicRoot, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!filename.startsWith(publicRoot + "/") && !filename.startsWith(publicRoot + "\\")) { response.writeHead(403).end(); return; }
    try {
      response.setHeader("Content-Type", `${extname(filename) === ".js" ? "text/javascript" : "text/html"}; charset=utf-8`);
      response.end(readFileSync(filename));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch({ channel: process.env.COMBAT_BROWSER_CHANNEL || "msedge", headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html?admin=1&tester=city-map`);
    await page.locator("#startRun").click();
    await page.evaluate(() => { window.__LAST_NIGHT_DEBUG__.state.paused = true; });
    const initial = await page.evaluate(() => {
      const canvas = document.getElementById("gameCanvas");
      const hud = document.querySelector(".hud").getBoundingClientRect();
      return { width: canvas.width, height: canvas.height, hud: { x: hud.x, y: hud.y, width: hud.width, height: hud.height },
        camera: window.__LAST_NIGHT_DEBUG__.snapshot().camera };
    });
    assert.equal(initial.width, 1280);
    assert.equal(initial.height, 720);
    await page.screenshot({ path: join(evidence, "mobile-central-city.png") });
    let moved;
    for (const [index, corner] of [{ right: false, bottom: false }, { right: true, bottom: false },
      { right: false, bottom: true }, { right: true, bottom: true }].entries()) {
      moved = await page.evaluate(({ right, bottom }) => {
        const debug = window.__LAST_NIGHT_DEBUG__;
        const margin = debug.config.worldMargin + debug.state.player.radius;
        debug.state.godMode = true;
        debug.state.player.x = right ? debug.config.worldWidth - margin : margin;
        debug.state.player.y = bottom ? debug.config.worldHeight - margin : margin;
        debug.step(1 / 60);
        const camera = debug.snapshot().camera;
        const hud = document.querySelector(".hud").getBoundingClientRect();
        const fire = document.getElementById("shootButton").getBoundingClientRect();
        const canvas = document.getElementById("gameCanvas").getBoundingClientRect();
        const scale = canvas.height / 720;
        const playerScreenY = canvas.y + (debug.state.player.y - camera.y) * scale;
        const playerScreenX = canvas.x + (debug.state.player.x - camera.x) * scale;
        const controls = ["joystick", "pauseRun"].map(id => {
          const rect = document.getElementById(id).getBoundingClientRect();
          return { id, left: rect.x, top: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height };
        });
        return { hud: { x: hud.x, y: hud.y, width: hud.width, height: hud.height }, camera,
          head: playerScreenY - 42 * scale, feet: playerScreenY + 40 * scale,
          left: playerScreenX - 32 * scale, right: playerScreenX + 32 * scale,
          hudBottom: hud.y + hud.height, fireTop: fire.y, controls };
      }, corner);
      assert.deepEqual(moved.hud, initial.hud, "HUD remains fixed while the world camera moves");
      assert(moved.head >= moved.hudBottom - .1, "the entire head remains below the top HUD at world corners");
      assert(moved.feet <= moved.fireTop + .1, "the entire sprite remains above the right-side controls at world corners");
      for (const control of moved.controls) {
        assert(moved.right <= control.left || moved.left >= control.right || moved.feet <= control.top || moved.head >= control.bottom,
          `the corner sprite overlaps ${control.id}`);
      }
      await page.screenshot({ path: join(evidence, `mobile-city-corner-${index + 1}.png`) });
    }
    assert(moved.camera.x > initial.camera.x && moved.camera.y > initial.camera.y);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(evidence, "mobile-city-southeast.png") });
    const spawned = await page.evaluate(() => {
      const debug = window.__LAST_NIGHT_DEBUG__;
      debug.state.paused = false;
      const before = debug.loot.length;
      document.getElementById("adminLevel").click();
      return { added: debug.loot.length - before, phase: debug.state.phase,
        reachable: debug.loot.every(ball => debug.map.isFree(ball.x, ball.y, 19)) };
    });
    assert.equal(spawned.added, 1);
    assert.equal(spawned.phase, "playing");
    assert(spawned.reachable, "scene balls appear at walkable locations");
    assert.equal(await page.locator("[data-upgrade-id]").count(), 0);
    await page.screenshot({ path: join(evidence, "mobile-city-item-ball.png") });
    assert.deepEqual(errors, []);
    pass("mobile city camera keeps the full player clear of HUD at every corner and spawns reachable balls without a dialog", { viewport: "390×844" });
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

try {
  mkdirSync(evidence, { recursive: true });
  if (!process.argv.includes("--browser-only")) unitChecks();
  if (!process.argv.includes("--unit-only")) await browserChecks();
  writeFileSync(join(evidence, "results.json"), JSON.stringify({ date: "2026-10-02", results }, null, 2));
  console.log("All city map checks passed. Enemy movement and elapsed time are simulated.");
} catch (error) {
  console.error(error.stack);
  process.exitCode = 1;
}
