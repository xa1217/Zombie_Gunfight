import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import { fileURLToPath } from "node:url"
import { join, resolve } from "node:path"

// DOM/Canvas stand-ins exercise the page's real gameplay script, not browser rendering.
const root = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT, "prototype-2d")
  : fileURLToPath(new URL("../", import.meta.url))
const html = readFileSync(join(root, "index.html"), "utf8")

function boot(coarse = false, admin = true) {
  let now = 0
  let animationFrame = null
  const noop = () => {}
  const drawing = new Proxy({}, { get(target, key) {
    if (key === "createLinearGradient" || key === "createRadialGradient") return () => ({ addColorStop: noop })
    if (key === "measureText") return text => ({ width: String(text).length * 8 })
    return target[key] || noop
  }, set(target, key, value) { target[key] = value; return true } })
  class Element {
    constructor(id) { this.id = id; this.value = "1"; this.hidden = false; this.style = {}; this.innerHTML = ""; this.textContent = ""; this.handlers = new Map(); this.classList = { add: noop, remove: noop, toggle: noop }; this.capture = null }
    addEventListener(name, handler) { if (!this.handlers.has(name)) this.handlers.set(name, []); this.handlers.get(name).push(handler) }
    emit(name, event = {}) { for (const handler of this.handlers.get(name) || []) handler({ preventDefault: noop, target: this, ...event }) }
    getContext() { return drawing }
    focus() {}
    getBoundingClientRect() { return { left: 0, top: 0, width: 94, height: 94 } }
    setPointerCapture(id) { this.capture = id }
    hasPointerCapture(id) { return this.capture === id }
    releasePointerCapture() { this.capture = null }
  }
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], new Element(match[1])]))
  const documentEvents = new Element("document")
  const windowEvents = new Element("window")
  let randomSeed = 81427
  const randomMath = Object.create(Math)
  randomMath.random = () => { randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0; return randomSeed / 4294967296 }
  const sandbox = {
    console, URLSearchParams, Date, Math: randomMath, performance: { now: () => now },
    matchMedia: () => ({ matches: coarse }), location: { search: admin ? "?admin=1&tester=smoke" : "" },
    navigator: {}, requestAnimationFrame: callback => { animationFrame = callback },
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    document: { hidden: false, getElementById: id => elements.get(id), createElement: () => new Element("terrain"), addEventListener: documentEvents.addEventListener.bind(documentEvents) }
  }
  sandbox.window = sandbox
  const runtime = vm.createContext(sandbox)
  for (const script of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const filename = /src="([^"]+)"/.exec(script[1])?.[1]
    const source = filename ? readFileSync(join(root, filename), "utf8") : script[2]
    if (source.trim()) vm.runInContext(source, runtime, { filename: filename || "index.html#inline" })
  }
  return {
    debug: sandbox.__LAST_NIGHT_DEBUG__, elements,
    key(code, down = true) { windowEvents.emit(down ? "keydown" : "keyup", { code, repeat: false }) },
    blur() { windowEvents.emit("blur") },
    frame(seconds = 1 / 60) { now += seconds * 1000; animationFrame(now) },
    click(id) { elements.get(id).emit("click") },
    start() { elements.get("startRun").emit("click") }
  }
}

const page = boot()
page.start()
const debug = page.debug
assert.equal(debug.snapshot().phase, "playing")
function assertResidentPopulation(api) {
  const rooms = api.state.houseRooms.size
  assert.ok(api.state.enemies.length >= rooms * 2 + 3 && api.state.enemies.length <= rooms * 5 + 6,
    "startup includes 2–5 residents in every interior and 3–6 outdoor zombies")
}
assertResidentPopulation(debug)
assert.equal(debug.snapshot().build.slots.length, 2)
assert(!page.elements.has("skillDock"), "the bottom passive-item dock is removed")
assert(page.elements.has("grenadeButton") && page.elements.has("molotovButton"), "the two throwable buttons remain on the right")
assert.equal(debug.config.runSeconds, 300)
assert.equal(debug.snapshot().nextXp, 5)
assert.equal(debug.state.enemies.every(enemy => enemy.type === "walker" && enemy.speed === 38), true)
debug.state.godMode = true
debug.state.nextXp = 1e9
debug.step(.5)
assert.equal(debug.snapshot().stats.shots, 0, "the rifle waits for manual fire input")
// Shooting coverage needs a visible street target independent of the random
// startup distribution, whose residents can now be elsewhere on the map.
debug.state.enemies.push({ ...debug.state.enemies[0], id: 900000,
  x: debug.state.player.x + 110, y: debug.state.player.y,
  speed: 0, baseSpeed: 0, damage: 0, contactTimer: Infinity })
page.key("Space")
debug.step(5)
page.key("Space", false)
assert.ok(debug.snapshot().stats.shots > 0)
assert.ok(debug.snapshot().stats.hits > 0)
assert.ok(debug.snapshot().kills > 0)
console.log("PASS real page script starts with two skills, seven dock slots, random slow residents, manual rifle shots and hits")

const beforeMove = debug.snapshot().player
page.key("KeyD")
debug.step(.5)
assert.ok(debug.state.player.x > beforeMove.x)
assert.ok(debug.state.player.walkCycle > beforeMove.walkCycle)
assert.ok(debug.state.player.gait > 0)
assert.equal(debug.state.player.bodyAngle, 0)
page.key("KeyD", false)
debug.step(.25)
assert.equal(debug.state.player.movingSpeed, 0)
assert.equal(debug.state.player.gait, 0)
debug.state.player.x = debug.config.worldWidth - debug.config.worldMargin - debug.state.player.radius
debug.state.player.y = debug.map.spawn.y
page.key("KeyD")
debug.step(.5)
assert.equal(debug.state.player.movingSpeed, 0)
assert.equal(debug.state.player.gait, 0)
page.key("KeyD", false)
console.log("PASS movement animates legs; stopping or walking into a boundary settles into standing")

page.key("KeyA")
page.click("pauseRun")
const paused = debug.snapshot()
for (let count = 0; count < 10; count += 1) page.frame()
assert.equal(debug.snapshot().time, paused.time)
assert.equal(debug.snapshot().player.walkCycle, paused.player.walkCycle)
page.click("resumeRun")
const stoppedX = debug.state.player.x
debug.step(.1)
assert.equal(debug.state.player.x, stoppedX)
page.key("KeyA")
page.blur()
assert.equal(debug.state.paused, true)
page.click("resumeRun")
debug.step(.1)
assert.equal(debug.state.player.x, stoppedX)
console.log("PASS normal pause and focus loss freeze action and release held movement")

const lootBefore = debug.loot.length
page.click("adminLevel")
assert.equal(debug.state.phase, "playing")
assert.equal(debug.loot.length, lootBefore + 1)
debug.state.loot = []
const upgradeId = "grenade"
const ball = debug.spawnLoot(upgradeId, "common", debug.state.player.x, debug.state.player.y)
assert(ball && ball.kind === "skill", "administrator creates a throwable scene ball")
debug.state.player.x = ball.x; debug.state.player.y = ball.y
debug.step(1 / 60)
assert.equal(debug.state.throwables[upgradeId], 1)
assert.equal(debug.build.level(upgradeId), 0)
assert.equal(debug.snapshot().build.slots.length, 2)
assert.equal(page.elements.has("upgradeList"), false)
console.log("PASS administrator creates a grenade scene ball; touching it fills one-shot inventory without an upgrade dialog")

const closeEnemy = { ...debug.state.enemies[0], x: debug.state.player.x, y: debug.state.player.y, radius: 17, baseSpeed: 0, hp: 100, maxHp: 100, dead: false }
debug.state.enemies = [closeEnemy]
debug.state.player.fireTimer = 0
const previousHits = debug.state.stats.hits
page.key("Space")
debug.step(.1)
page.key("Space", false)
assert.ok(debug.state.stats.hits > previousHits)
assert.ok(closeEnemy.hp < 100)
console.log("PASS rifle's first collision sweep hits an enemy inside the muzzle reach")

const contactPage = boot()
contactPage.start()
const contact = contactPage.debug, contactState = contact.state
const contactTemplate = { ...contactState.enemies[0] }
Object.assign(contactState, { godMode: true, density: 0, hordeTimer: Infinity, lootTimer: Infinity, spawnBudget: 0, loot: [], combatDrops: [] })
contactPage.key("Space")
for (const weapon of ["assaultRifle", "submachineGun", "shotgun"]) {
  for (const radius of [8, 17, 24]) for (let direction = 0; direction < 8; direction++) {
    // Each aim/body-size fixture starts with a fresh magazine; ammunition
    // depletion is covered separately by the inventory/reload regression.
    contactState.weapon = { id: weapon, quality: "common" }
    const player = contactState.player, angle = direction * Math.PI / 4
    Object.assign(player, { armAngle: angle, aim: angle, fireTimer: 0, throwAction: 0 })
    const enemy = { ...contactTemplate, id: 100000 + direction, x: player.x, y: player.y,
      radius, hp: 10000, maxHp: 10000, baseSpeed: 0, speed: 0, burn: 0, dead: false, contactTimer: Infinity }
    contactState.enemies = [enemy]; contactState.projectiles = []
    const hits = contactState.stats.hits
    contact.step(1 / 60)
    assert.ok(contactState.stats.hits > hits && enemy.hp < 10000,
      `${weapon} must hit a touching radius-${radius} target while turning from direction ${direction}`)
  }
}
contactPage.key("Space", false)
console.log("PASS manual fire hits touching enemies with three guns, eight directions and three body sizes")

const fatalPage = boot()
fatalPage.start()
fatalPage.debug.state.player.hp = 1
fatalPage.debug.state.player.fireTimer = Infinity
fatalPage.debug.state.enemies = [{ ...fatalPage.debug.state.enemies[0], x: fatalPage.debug.state.player.x, y: fatalPage.debug.state.player.y, baseSpeed: 0, damage: 100 }]
fatalPage.debug.step(.1)
assert.equal(fatalPage.debug.state.phase, "gameover")
assert.equal(fatalPage.debug.snapshot().result, "defeat")
const dead = fatalPage.debug.snapshot()
fatalPage.debug.step(1)
assert.equal(fatalPage.debug.state.time, dead.time)
assert.equal(fatalPage.debug.state.stats.shots, dead.stats.shots)
assert.equal(fatalPage.debug.state.player.walkCycle, dead.player.walkCycle)
console.log("PASS death stops movement, firing, spawning and further upgrades")

const motionPage = boot()
motionPage.start()
const motion = motionPage.debug
const motionState = motion.state
const motionPlayer = motionState.player
motionPlayer.x = motion.map.width / 2
motionPlayer.y = motion.map.height / 2
motionPlayer.fireTimer = Infinity
motionState.godMode = true
const seedEnemy = motionState.enemies[0]
const motionTypes = [
  ["walker", "walk", 38, 220], ["runner", "run", 72, -220],
  ["crawler", "crawl", 22, 350], ["brute", "hop", 26, -350]
]
motionState.enemies = motionTypes.map(([type, mode, speed, offset], index) => ({
  ...seedEnemy, id: index + 900, type, motion: mode, baseSpeed: speed, speed,
  x: motionPlayer.x, y: motionPlayer.y + offset, hp: 10000, maxHp: 10000,
  walkCycle: 0, motionTime: 0, hopPhase: mode === "hop" ? "windup" : null,
  hopHeight: 0, hopDirX: 0, hopDirY: 0, damage: 0, dead: false
}))
const motionStarts = motionState.enemies.map(enemy => ({ x: enemy.x, y: enemy.y }))
assert(motionState.enemies.every(enemy => motion.map.isFree(enemy.x, enemy.y, enemy.radius)))
motion.step(.2)
const motionDistances = motionState.enemies.map((enemy, index) => Math.hypot(enemy.x - motionStarts[index].x, enemy.y - motionStarts[index].y))
assert(motionDistances[0] > 0 && motionDistances[1] > motionDistances[0] && motionDistances[2] > 0)
assert(motionState.enemies.slice(0, 3).every(enemy => enemy.walkCycle > 0))
const hop = motionState.enemies[3]
assert.equal(motionDistances[3], 0)
assert.equal(hop.hopPhase, "windup")
motion.step(.5)
assert.equal(hop.hopPhase, "airborne")
assert(hop.hopHeight > 6)
motionState.enemies = [hop]
hop.x = motionPlayer.x; hop.y = motionPlayer.y; hop.baseSpeed = 0
hop.damage = 20; hop.contactTimer = 0
motionState.godMode = false
motionPlayer.invulnerable = 0; motionPlayer.hp = motionPlayer.maxHp
motionPlayer.sinceHit = 0; motionPlayer.instinctReady = false
const airborneHp = motionPlayer.hp
motion.step(1 / 60)
assert.equal(motionPlayer.hp, airborneHp)
motion.step(.5)
assert.equal(hop.hopPhase, "recovery")
assert(motionPlayer.hp < airborneHp)
console.log("PASS walk/run/crawl move at distinct speeds; hopping winds up, lifts off, skips aerial contact and damages after landing")

function pressure(coarse) {
  const test = boot(coarse)
  test.start()
  const api = test.debug
  api.state.godMode = true
  api.state.nextXp = 1e9
  api.state.player.fireTimer = Infinity
  const residentCount = api.state.enemies.length
  // Disable tactical skills to isolate spawn pressure and preserve enemies.
  for (const skill of api.build.selectedSkills()) api.build.levels[skill.id] = 0
  // Move into the later roster, then let the real spawn loop build a capped horde.
  api.state.time = 65
  api.step(50)
  assert.ok(api.state.enemies.length > residentCount)
  assert.ok(api.state.enemies.length <= api.config.enemyCap)
  assert.equal(api.config.enemyCap, coarse ? 104 : 160)
  assert.ok(api.state.enemies.some(enemy => enemy.type === "runner"))
  assert.ok(api.state.enemies.some(enemy => enemy.type === "brute"))
  assert.ok(api.state.enemies.some(enemy => enemy.type === "bloater"))
  api.state.time = 299
  api.step(.5)
  assert.equal(api.state.phase, "playing")
  api.step(.5)
  assert.equal(api.state.phase, "victory")
  assert.equal(api.snapshot().result, "victory")
  assert.equal(api.snapshot().remainingSeconds, 0)
  assert.equal(api.state.time, 300)
  const finished = api.snapshot()
  api.step(1)
  assert.equal(api.snapshot().time, finished.time)
  assert.equal(api.snapshot().stats.shots, finished.stats.shots)
  assert.equal(api.snapshot().player.walkCycle, finished.player.walkCycle)
  test.click("restartRun")
  assert.equal(api.state.phase, "playing")
  assert.equal(api.snapshot().build.slots.length, 2)
  assert.equal(api.state.time, 0)
  assertResidentPopulation(api)
  console.log(`PASS ${coarse ? "touch" : "desktop"} pressure: peak ${finished.stats.peakEnemies}/${api.config.enemyCap}; 299s live, 300s victory, frozen result and restart`)
}
pressure(false)
pressure(true)
assert.equal(boot(false, false).debug, undefined)
console.log("PASS debug API is absent from ordinary pages")
