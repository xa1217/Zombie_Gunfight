import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const projectRoot = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT)
  : fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const TAU = Math.PI * 2;
const EPSILON = 1e-8;
const imageSources = new Map();

function packagedImage(name) {
  const path = join(projectRoot, "prototype-2d/assets", name);
  const png = readFileSync(path);
  assert.equal(png.toString("hex", 0, 8), "89504e470d0a1a0a", `packaged web atlas is PNG: ${name}`);
  const image = { source: path, width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  assert.ok(image.width > 0 && image.height > 0, "packaged web atlas has dimensions");
  imageSources.set(path, image);
  return image;
}

const runtime = vm.createContext({ window: {} });
for (const filename of ["character-atlas.js", "character-art.js"]) {
  vm.runInContext(readFileSync(join(projectRoot, "prototype-2d", filename), "utf8"), runtime, { filename });
}
const webApi = runtime.window.WASTELAND_CHARACTER_ART;
const webManifest = runtime.window.WASTELAND_CHARACTER_ATLAS;
const webImages = Object.fromEntries([...new Set([webManifest.image,
  ...Object.values(webManifest.characters).map(character => character.image).filter(Boolean)])]
  .map(name => [name, packagedImage(name)]));
const web = webApi.createRenderer({
  image: webImages[webManifest.image], images: webImages,
  manifest: webManifest
});
assert.ok(web?.ready, "real packaged web atlases create a ready renderer");
const miniManifest = require(join(projectRoot, "wechat-miniprogram/miniprogram/assets/cartoon-rig-manifest.js"));
const { createCharacterRenderer, heroWeaponPose, WORLD_PER_PIXEL } = require(join(projectRoot, "wechat-miniprogram/miniprogram/renderers/cartoon-characters.js"));
const mini = createCharacterRenderer(null, miniManifest, () => {});
const miniImages = {};
for (const name of new Set([miniManifest.image, ...Object.values(miniManifest.characters).map(character => character.image).filter(Boolean)])) {
  const source = join(projectRoot, "wechat-miniprogram/miniprogram/assets", name), png = readFileSync(source);
  assert.equal(png.toString("hex", 0, 8), "89504e470d0a1a0a", `packaged mini atlas is PNG: ${name}`);
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  const character = Object.values(miniManifest.characters).find(character => character.image === name);
  assert.equal(width, character?.imageWidth || miniManifest.width, `mini ${name}: authored atlas width`);
  assert.equal(height, character?.imageHeight || miniManifest.height, `mini ${name}: authored atlas height`);
  miniImages[name] = { source, width, height };
  imageSources.set(source, miniImages[name]);
  mini.resources[name] = { image: name, width, height, status: "ready", source };
}
mini.refreshRig();
assert.ok(mini.rig?.ready, "real packaged mini atlases create a ready adapter rig");

// Record the complete Canvas transform, so tests inspect the painted atlas
// anchors in world coordinates rather than matching renderer source text.
function recordingContext() {
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack = [], draws = [];
  let path = [], clips = [];
  const finite = (args, label) => assert.ok(args.every(Number.isFinite), `${label}: finite Canvas geometry`);
  function multiply(next) {
    finite(next, "transform");
    const [a, b, c, d, e, f] = matrix;
    matrix = [a * next[0] + c * next[1], b * next[0] + d * next[1],
      a * next[2] + c * next[3], b * next[2] + d * next[3],
      a * next[4] + c * next[5] + e, b * next[4] + d * next[5] + f];
  }
  const context = {
    draws,
    save() { stack.push({ matrix: [...matrix], clips: [...clips] }); },
    restore() {
      assert.ok(stack.length, "balanced Canvas restore");
      const previous = stack.pop(); matrix = previous.matrix; clips = previous.clips;
    },
    translate(x, y) { multiply([1, 0, 0, 1, x, y]); },
    rotate(angle) { multiply([Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0]); },
    scale(x, y) { multiply([x, 0, 0, y, 0, 0]); },
    drawImage(...args) {
      finite([...args.slice(1), ...matrix], "drawImage");
      const image = imageSources.get(args[0]);
      if (image) {
        const [, x, y, width, height, , , dw, dh] = args;
        assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0 && dw > 0 && dh > 0, "positive web atlas rectangles");
        assert.ok(x + width <= image.width + EPSILON && y + height <= image.height + EPSILON,
          "web crop stays inside its own packaged atlas");
      }
      draws.push({ kind: "image", args, matrix: [...matrix], clips: [...clips] });
    },
    beginPath() { path = []; },
    moveTo(x, y) { finite([x, y], "moveTo"); path.push({ kind: "move", x, y, matrix: [...matrix] }); },
    lineTo(x, y) { finite([x, y], "lineTo"); path.push({ kind: "line", x, y, matrix: [...matrix] }); },
    closePath() { path.push({ kind: "close" }); },
    ellipse(...args) { finite(args, "ellipse"); path.push({ kind: "ellipse", args, matrix: [...matrix] }); },
    arc(...args) { finite(args, "arc"); path.push({ kind: "arc", args, matrix: [...matrix] }); },
    clip() { clips.push([...path]); draws.push({ kind: "clip", path: [...path] }); },
    fill() { draws.push({ kind: "fill", path: [...path], color: this.fillStyle }); },
    stroke() { draws.push({ kind: "stroke", path: [...path], color: this.strokeStyle, width: this.lineWidth, clips: [...clips] }); },
    fillRect(...args) { finite(args, "fillRect"); draws.push({ kind: "rect", args, matrix: [...matrix], color: this.fillStyle }); },
    assertRestored() {
      assert.equal(stack.length, 0, "renderer balances Canvas save/restore");
      assert.deepEqual(matrix, [1, 0, 0, 1, 0, 0], "renderer restores the parent transform");
      assert.equal(clips.length, 0, "torso clip does not leak into later figures");
    }
  };
  return context;
}

function partDraws(context, crop) {
  return context.draws.filter(draw => draw.kind === "image" && draw.args[1] === crop.x
    && draw.args[2] === crop.y && draw.args[3] === crop.width && draw.args[4] === crop.height);
}

function paintedAnchor(draw, fraction) {
  const [a, b, c, d, e, f] = draw.matrix;
  const [, , , , , x, y, width, height] = draw.args;
  const localX = x + fraction.x * width, localY = y + fraction.y * height;
  return { x: a * localX + c * localY + e, y: b * localX + d * localY + f };
}

function near(actual, expected, label) {
  assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 1e-8,
    `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function transformed(point) {
  const [a, b, c, d, e, f] = point.matrix;
  return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
}

function strokesBetween(context, start, end) {
  return context.draws.filter(draw => draw.kind === "stroke" && draw.path.length === 2
    && draw.path[0].kind === "move" && draw.path[1].kind === "line"
    && Math.hypot(transformed(draw.path[0]).x - start.x, transformed(draw.path[0]).y - start.y) < 1e-8
    && Math.hypot(transformed(draw.path[1]).x - end.x, transformed(draw.path[1]).y - end.y) < 1e-8);
}

function paintedChain(context, limb, toWorld, label) {
  const root = toWorld(limb.root), joint = toWorld(limb.joint), end = toWorld(limb.end);
  const upper = strokesBetween(context, root, joint), lower = strokesBetween(context, joint, end);
  assert.ok(upper.length >= 2 && lower.length >= 2, `${label}: painted ink and colored bones connect root, joint and end`);
  for (const point of [limb.root, limb.joint, limb.end])
    assert.ok([point.x, point.y, point.z ?? 0].every(Number.isFinite), `${label}: finite projected joint and depth`);
  const length = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
  assert.ok(Math.abs(length(limb.root, limb.joint) - limb.upperLength) < EPSILON,
    `${label}: upper bone keeps its authored length in depth`);
  assert.ok(Math.abs(length(limb.end, limb.joint) - limb.lowerLength) < EPSILON,
    `${label}: lower bone keeps its authored length in depth`);
  return { upper, lower };
}

function insidePolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function assertWebAtlas(context, type) {
  const character = webManifest.characters[type];
  const images = context.draws.filter(draw => draw.kind === "image");
  assert.equal(images.length, 3, `web ${type}: torso and two independently placed shoes`);
  for (const draw of images) assert.equal(draw.args[0], webImages[character.image || webManifest.image].source,
    `web ${type}: correct packaged atlas`);
  const bodies = partDraws(context, character.body);
  assert.equal(bodies.length, 1, `web ${type}: exact torso crop`);
  const shoes = images.filter(draw => draw !== bodies[0]);
  for (const shoe of shoes) {
    const [, x, y, width, height] = shoe.args, leg = character.leg;
    assert.ok(x === leg.x && width === leg.width && y > leg.y && height < leg.height
      && Math.abs(y + height - leg.y - leg.height) < EPSILON, `web ${type}: shoe cropped from its own leg art`);
  }
  assert.notDeepEqual(shoes[0].matrix, shoes[1].matrix, `web ${type}: each shoe has a separate placement`);
  context.assertRestored();
}

function assertHeroLayers(context, rig, label) {
  const torso = partDraws(context, webManifest.characters.hero.body)[0];
  const bodyIndex = context.draws.indexOf(torso), weaponIndex = context.draws.findIndex(draw => draw.kind === "weapon");
  assert.equal(context.draws.filter(draw => draw.kind === "weapon").length, 1, `${label}: one weapon callback`);
  assert.equal(torso.clips.length, 1, `${label}: torso clips the original fixed sleeve ends`);
  const polygon = torso.clips[0].filter(point => point.kind === "move" || point.kind === "line").map(transformed);
  assert.ok(insidePolygon(paintedAnchor(torso, { x: .5, y: .3 }), polygon), `${label}: head and collar remain inside the crop`);
  for (const x of [.05, .95]) assert.ok(!insidePolygon(paintedAnchor(torso, { x, y: .7 }), polygon),
    `${label}: fixed sleeve ends are hidden`);
  for (const arm of rig.arms) {
    const rendered = paintedChain(context, arm, point => point, `${label} ${arm.support ? "support" : "trigger"} arm`);
    if (arm.near) assert.ok(rendered.upper.some(draw => context.draws.indexOf(draw) > bodyIndex && context.draws.indexOf(draw) < weaponIndex),
      `${label}: near upper arm stays in front of torso and behind weapon`);
    else assert.ok(rendered.upper.every(draw => context.draws.indexOf(draw) < bodyIndex),
      `${label}: far upper arm stays behind torso without a second shoulder`);
    assert.ok(rendered.lower.some(draw => context.draws.indexOf(draw) > bodyIndex && context.draws.indexOf(draw) < weaponIndex),
      `${label}: forearm crosses in front of torso to the grip`);
    assert.ok([...rendered.upper, ...rendered.lower].every(draw => draw.clips.length === 0),
      `${label}: torso clip does not cut off articulated arms`);
  }
  return weaponIndex;
}

const miniScales = { hero: 1, shambler: .94, runner: .86, brute: 1.36, bloater: 1.17, crawler: 1 };
function renderMini(type, actor) {
  const context = recordingContext(), hero = type === "hero";
  const success = hero ? mini.drawHero(context, actor, () => context.draws.push({ kind: "weapon" }))
    : mini.drawInfected(context, { ...actor, type });
  assert.equal(success, true, `mini ${type}: adapter renders the real packaged atlas`);
  const rigType = type === "shambler" ? "walker" : type;
  const unit = WORLD_PER_PIXEL * miniScales[type];
  const pixelActor = hero ? { ...actor, x: 0, y: 0, gait: actor.moveAmount || 0,
    walkCycle: actor.gaitPhase || 0, armAngle: actor.angle, movingSpeed: (actor.actualSpeed || 0) / WORLD_PER_PIXEL }
    : { ...actor, type: rigType, x: 0, y: 0, radius: type === "crawler" ? 18 : 17,
      gait: actor.moveAmount || 0, walkCycle: actor.gaitPhase || 0, hopHeight: (actor.hopHeight || 0) / unit };
  const rig = mini.rig.pose(rigType, pixelActor, hero ? { gun: heroWeaponPose(actor) } : { playerX: actor.facing || 1 });
  const toWorld = point => ({ x: point.x * unit * (rigType === "crawler" ? rig.facing : 1),
    y: (point.y - (hero ? 0 : rig.lift)) * unit });
  for (const group of ["arms", "legs"]) {
    assert.equal(rig[group].length, 2, `mini ${type}: exactly two connected ${group}`);
    for (const limb of rig[group]) paintedChain(context, limb, toWorld, `mini ${type} ${group}`);
  }
  const character = miniManifest.characters[rigType], images = context.draws.filter(draw => draw.kind === "image");
  assert.equal(images.length, 3, `mini ${type}: one torso and two independently anchored shoes`);
  for (const image of images) assert.equal(image.args[0], miniImages[character.image || miniManifest.image].source,
    `mini ${type}: correct packaged atlas`);
  const bodies = partDraws(context, character.body);
  assert.equal(bodies.length, 1, `mini ${type}: exact torso crop`);
  const shoes = images.filter(draw => draw !== bodies[0]);
  for (const shoe of shoes) {
    const [, x, y, width, height] = shoe.args, leg = character.leg;
    assert.ok(x === leg.x && width === leg.width && y > leg.y && height < leg.height
      && Math.abs(y + height - leg.y - leg.height) < EPSILON, `mini ${type}: footwear preserves its own leg art`);
  }
  const paintedLegs = [...rig.legs].sort((a, b) => Number(a.near) - Number(b.near));
  shoes.forEach((shoe, index) => near(paintedAnchor(shoe, { x: .4, y: .35 }), toWorld(paintedLegs[index].end),
    `mini ${type}: footwear remains attached to its articulated ankle`));
  assert.notDeepEqual(shoes[0].matrix, shoes[1].matrix, `mini ${type}: separate footwear placements`);
  context.assertRestored();
  return { context, rig, toWorld, frame: mini.animationFrame,
    signature: JSON.stringify(context.draws), bodyIndex: context.draws.indexOf(bodies[0]) };
}

function assertMiniHeroGrips(result, actor) {
  const { context, rig, toWorld } = result, gun = heroWeaponPose(actor);
  const weaponIndex = context.draws.findIndex(draw => draw.kind === "weapon");
  assert.equal(context.draws.filter(draw => draw.kind === "weapon").length, 1, "mini hero: one weapon callback");
  for (const arm of rig.arms) {
    const body = rig.body, localX = (arm.support ? -1 : 1) * body.width * .25 * body.scaleX;
    const localY = 3 - body.height * .29;
    near(arm.root, { x: body.x + Math.cos(body.angle) * localX - Math.sin(body.angle) * localY,
      y: body.y + 3 + Math.sin(body.angle) * localX + Math.cos(body.angle) * localY }, "mini hero shoulder stays connected to torso");
    const grip = arm.support ? gun.support : gun.grip;
    const along = (grip.x * gun.scaleX - gun.recoil) * gun.scale, across = grip.y * gun.flipY * gun.scale;
    near(arm.end, { x: gun.x + Math.cos(gun.angle) * along - Math.sin(gun.angle) * across,
      y: gun.y + Math.sin(gun.angle) * along + Math.cos(gun.angle) * across }, "mini hero palm follows exported weapon grip");
    const handFrom = toWorld({ x: arm.end.x - Math.cos(actor.angle) * 2, y: arm.end.y - Math.sin(actor.angle) * 2 });
    const handTo = toWorld({ x: arm.end.x + Math.cos(actor.angle) * 2, y: arm.end.y + Math.sin(actor.angle) * 2 });
    assert.ok(strokesBetween(context, handFrom, handTo).some(draw => context.draws.indexOf(draw) > weaponIndex),
      "mini hero palm paints over the weapon at the actual grip");
  }
}

const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2, 2.9, -2.9, 3 * Math.PI];
for (const angle of angles) {
  const player = { x: 0, y: 0, armAngle: angle, angle, recoil: .2, walkCycle: 0, gait: 0, moveAmount: 0, gaitPhase: 0 };
  const context = recordingContext();
  assert.equal(web.drawPlayer(context, player, { drawWeapon() { context.draws.push({ kind: "weapon" }); } }), true);
  const rig = web.pose("hero", player);
  assert.equal(rig.arms.length, 2, "web hero has both connected arms");
  assertWebAtlas(context, "hero");
  const weaponIndex = assertHeroLayers(context, rig, `web hero at ${angle}`);
  for (const arm of rig.arms) {
    const gun = rig.gun, grip = arm.support ? gun.support : gun.grip;
    const along = (grip.x * gun.scaleX - gun.recoil) * gun.scale, across = grip.y * gun.flipY * gun.scale;
    near(arm.end, { x: gun.x + Math.cos(gun.angle) * along - Math.sin(gun.angle) * across,
      y: gun.y + Math.sin(gun.angle) * along + Math.cos(gun.angle) * across }, `web palm follows real gun grip at ${angle}`);
    const handFrom = { x: arm.end.x - Math.cos(angle) * 2, y: arm.end.y - Math.sin(angle) * 2 };
    const handTo = { x: arm.end.x + Math.cos(angle) * 2, y: arm.end.y + Math.sin(angle) * 2 };
    assert.ok(strokesBetween(context, handFrom, handTo).some(draw => context.draws.indexOf(draw) > weaponIndex),
      "web palm is painted over the weapon at the grip");
  }

  assertMiniHeroGrips(renderMini("hero", player), player);
}
console.log("PASS web projected fixed-bone arms, torso clipping and gun grips across seven aim angles; mini adapter paints connected shoulder/palm chains at real weapon grips");

for (const [motion, type] of [["walk", "walker"], ["run", "runner"], ["crawl", "crawler"]]) {
  const poses = { web: [], mini: [] };
  for (const [cycle, index] of [[.1, 0], [Math.PI + .1, 1]]) {
    const context = recordingContext();
    web.drawEnemy(context, { x: 0, y: 0, type, motion, radius: 18, walkCycle: cycle, speed: 20, hp: 1, maxHp: 1 });
    assert.equal(webApi.animationFrame.name, `${motion}-${index * 4 + 1}`);
    const webActor = { x: 0, y: 0, type, motion, radius: 18, walkCycle: cycle, speed: 20, hp: 1, maxHp: 1 };
    const rig = web.pose(type, webActor), scale = webActor.radius / (type === "crawler" ? 18 : 17);
    const toWorld = point => ({ x: point.x * scale * (type === "crawler" ? rig.facing : 1), y: point.y * scale });
    for (const group of ["arms", "legs"]) {
      assert.equal(rig[group].length, 2, `web ${type} keeps both ${group}`);
      for (const limb of rig[group]) paintedChain(context, limb, toWorld, `web ${type} ${group} frame ${index}`);
    }
    poses.web.push(JSON.stringify(rig.legs.map(limb => ({ root: limb.root, joint: limb.joint, end: limb.end }))));
    const miniType = type === "walker" ? "shambler" : type;
    const miniResult = renderMini(miniType, { motion, gaitPhase: cycle, moveAmount: 1, facing: 1, hopHeight: 0 });
    assert.equal(miniResult.frame.name, `${motion}-${index * 4 + 1}`);
    poses.mini.push(JSON.stringify(miniResult.rig.legs));
    if (type === "crawler") {
      const webBodyIndex = context.draws.indexOf(partDraws(context, webManifest.characters.crawler.body)[0]);
      assert.ok(rig.legs.every(leg => strokesBetween(context, toWorld(leg.root), toWorld(leg.joint)).every(draw => context.draws.indexOf(draw) < webBodyIndex)),
        "web crawler leg bones sit behind torso");
      assert.ok(rig.arms.every(arm => strokesBetween(context, toWorld(arm.joint), toWorld(arm.end)).some(draw => context.draws.indexOf(draw) > webBodyIndex)),
        "web crawler painted forearms stay visible over torso");
      const { context: drawing, rig: miniRig, toWorld: miniWorld, bodyIndex } = miniResult;
      assert.ok(miniRig.legs.every(leg => strokesBetween(drawing, miniWorld(leg.root), miniWorld(leg.joint))
        .every(draw => drawing.draws.indexOf(draw) < bodyIndex)), "mini crawler leg bones sit behind torso");
      assert.ok(miniRig.arms.every(arm => strokesBetween(drawing, miniWorld(arm.joint), miniWorld(arm.end))
        .some(draw => drawing.draws.indexOf(draw) > bodyIndex)), "mini crawler forearms remain visible over torso");
    }
  }
  for (const platform of ["web", "mini"]) assert.notEqual(poses[platform][0], poses[platform][1], `${platform} ${motion} changes the drawn leg pose`);
}
console.log("PASS web and mini opposite walk/run/crawl phases paint connected limbs and preserve crawler limb layering");

function renderWeb(type, actor) {
  const context = recordingContext(), held = [];
  const success = type === "hero" ? web.drawPlayer(context, actor, {
    drawWeapon() { context.draws.push({ kind: "weapon" }); },
    drawHeldItem(hand, angle) {
      held.push({ hand: { ...hand }, angle });
      context.draws.push({ kind: "held-item", hand: { ...hand }, angle });
    }
  }) : web.drawEnemy(context, actor);
  assert.equal(success, true, `web ${type}: render succeeds`);
  assertWebAtlas(context, type);
  const rig = web.pose(type, actor);
  assert.equal(rig.arms.length, 2, `web ${type}: exactly two arms`);
  assert.equal(rig.legs.length, 2, `web ${type}: exactly two legs`);
  for (const limb of [...rig.arms, ...rig.legs]) for (const point of [limb.root, limb.joint, limb.end])
    assert.ok([point.x, point.y, point.z ?? 0].every(Number.isFinite), `web ${type}: finite joints and depth`);
  return { context, rig, held, frame: webApi.animationFrame, signature: JSON.stringify(context.draws) };
}

const baseActor = { x: 0, y: 0, radius: 18, recoil: .2, hp: 1, maxHp: 1,
  facing: 1, gait: 1, moveAmount: 1, gaitPhase: 0, walkCycle: 0, angle: 0, armAngle: 0 };
for (const [type, motion] of [["hero", "walk"], ["hero", "run"], ["walker", "walk"], ["runner", "run"],
  ["brute", "walk"], ["bloater", "walk"], ["crawler", "crawl"]]) {
  for (const facing of [-1, 1]) {
    const signatures = [];
    for (let index = 0; index < 8; index++) {
      const cycle = (index + .2) / 8 * TAU;
      const result = renderWeb(type, { ...baseActor, type, motion, facing,
        angle: facing === 1 ? 0 : Math.PI, armAngle: facing === 1 ? 0 : Math.PI,
        gaitPhase: cycle, walkCycle: cycle });
      assert.equal(result.frame.index, index, `web ${type}/${motion}: inspection frame index`);
      assert.equal(result.frame.name, `${motion}-${index + 1}`, `web ${type}/${motion}: eight inspectable poses`);
      signatures.push(result.signature);
    }
    assert.equal(new Set(signatures).size, 8, `web ${type}/${motion}: each phase changes actual Canvas geometry`);
  }
}
console.log("PASS web real torso/shoe crops and eight distinct drawn poses for all walking, running and crawling figures in both directions");

for (const [type, motion] of [["hero", "walk"], ["hero", "run"], ["shambler", "walk"], ["runner", "run"],
  ["brute", "walk"], ["bloater", "walk"], ["crawler", "crawl"]]) {
  for (const facing of [-1, 1]) {
    const signatures = [];
    for (let index = 0; index < 8; index++) {
      const actor = { x: 0, y: 0, type, motion, facing, angle: facing === 1 ? 0 : Math.PI, recoil: .2,
        moveAmount: 1, actualSpeed: motion === "run" ? 4 : 2, gaitPhase: (index + .2) / 8 * TAU, hopHeight: 0 };
      const result = renderMini(type, actor);
      assert.equal(result.frame.index, index, `mini ${type}/${motion}: inspection frame index`);
      assert.equal(result.frame.name, `${motion}-${index + 1}`, `mini ${type}/${motion}: eight inspectable poses`);
      if (type === "hero") assertMiniHeroGrips(result, actor);
      signatures.push(result.signature);
    }
    assert.equal(new Set(signatures).size, 8, `mini ${type}/${motion}: each phase changes painted Canvas geometry`);
  }
}
console.log("PASS mini adapter paints eight distinct poses with both limbs and ankle-attached footwear in both directions");

let depthPoses = 0;
for (const throwKind of ["grenade", "molotov"]) for (const angle of angles) {
  const duration = .38;
  const signatures = [];
  for (const fraction of [1, .55, .1, 0]) {
    const actor = { ...baseActor, gait: 0, moveAmount: 0, armAngle: angle, angle,
      throwKind, throwAction: duration * fraction };
    const { context, rig, held, signature } = renderWeb("hero", actor);
    const label = `web ${throwKind} at ${angle}/${fraction}`;
    const weaponIndex = assertHeroLayers(context, rig, label);
    assert.equal(held.length, fraction > 0 ? 1 : 0, `${label}: held item callback follows the action lifetime`);
    if (fraction > 0) {
      near(held[0].hand, rig.arms[0].end, `${label}: item is attached to the existing support palm`);
      const itemIndex = context.draws.findIndex(draw => draw.kind === "held-item");
      assert.ok(itemIndex > weaponIndex, `${label}: held item is drawn after the gun`);
      const handFrom = { x: rig.arms[0].end.x - Math.cos(angle) * 2, y: rig.arms[0].end.y - Math.sin(angle) * 2 };
      const handTo = { x: rig.arms[0].end.x + Math.cos(angle) * 2, y: rig.arms[0].end.y + Math.sin(angle) * 2 };
      assert.ok(strokesBetween(context, handFrom, handTo).some(draw => context.draws.indexOf(draw) > itemIndex),
        `${label}: palm overlays the held item`);
    }
    const gun = rig.gun, grip = gun.grip;
    const along = (grip.x * gun.scaleX - gun.recoil) * gun.scale, across = grip.y * gun.flipY * gun.scale;
    near(rig.arms[1].end, { x: gun.x + Math.cos(gun.angle) * along - Math.sin(gun.angle) * across,
      y: gun.y + Math.sin(gun.angle) * along + Math.cos(gun.angle) * across }, `${label}: other hand keeps holding the gun`);
    if (rig.arms.some(arm => Math.abs(arm.joint.z ?? 0) > 1)) depthPoses++;
    signatures.push(signature);
  }
  assert.equal(new Set(signatures).size, 4, `web ${throwKind} at ${angle}: release and return paint distinct support-arm poses`);
}
assert.ok(depthPoses > 0, "aim and item actions exercise foreshortened arms with real joint depth");
console.log("PASS web grenade and molotov actions use the existing support hand, preserve the gun grip and render projected arm depth without leaking the torso clip");

const miniHopSignatures = [];
for (const [phase, clock] of [["windup", .3], ["airborne", .8], ["recovery", 1.2]]) {
  web.drawEnemy(recordingContext(), {
    x: 0, y: 0, type: "brute", motion: "hop", radius: 24, hopPhase: phase,
    motionTime: clock, hopHeight: 15, walkCycle: 0, hp: 1, maxHp: 1
  });
  assert.equal(webApi.animationFrame.motion, `hop-${phase}`);
  const result = renderMini("brute", {
    type: "brute", motion: "hop", gaitPhase: 0, moveAmount: 1, facing: 1, hopPhase: clock, hopHeight: .3
  });
  assert.equal(result.frame.motion, `hop-${phase}`);
  assert.ok(Math.abs(result.rig.lift * WORLD_PER_PIXEL * miniScales.brute - .3) < EPSILON,
    "mini hop adapts lift from world units without scaling it twice");
  miniHopSignatures.push(result.signature);
}
assert.equal(new Set(miniHopSignatures).size, 3, "mini windup, airborne and recovery paint distinct connected poses");
console.log("PASS hop windup/airborne/recovery, including recovery while still above ground");

web.drawPlayer(recordingContext(), { x: 0, y: 0, armAngle: 0, recoil: 0, walkCycle: Math.PI + .1, gait: 0, movingSpeed: 0 });
assert.equal(webApi.animationFrame.motion, "idle");
assert.equal(renderMini("hero", { x: 0, y: 0, angle: 0, recoil: 0, gaitPhase: Math.PI + .1,
  moveAmount: 0, actualSpeed: 0 }).frame.motion, "idle");
console.log("PASS stationary heroes return to the idle pose");

for (const type of ["hero", "walker", "runner", "brute", "bloater", "crawler"]) {
  const signatures = [0, .7, 3.2].map(cycle => {
    const result = renderWeb(type, { ...baseActor, type, gait: 0, moveAmount: 0, actualSpeed: 0,
      gaitPhase: cycle, walkCycle: cycle });
    assert.equal(result.frame.motion, "idle", `web ${type}: stopping selects idle`);
    return result.signature;
  });
  assert.equal(new Set(signatures).size, 1, `web ${type}: idle geometry stays planted across stale gait phases`);
}
for (const type of ["hero", "shambler", "runner", "brute", "bloater", "crawler"]) {
  const signatures = [0, .7, 3.2].map(cycle => {
    const result = renderMini(type, { x: 0, y: 0, angle: 0, recoil: 0, facing: 1, hopHeight: 0,
      moveAmount: 0, actualSpeed: 0, gaitPhase: cycle });
    assert.equal(result.frame.motion, "idle", `mini ${type}: stopping selects idle`);
    return result.signature;
  });
  assert.equal(new Set(signatures).size, 1, `mini ${type}: idle geometry stays planted across stale gait phases`);
}
console.log("PASS web and mini idle poses remain planted for every character");
console.log("\nAll character motion Canvas checks passed (not a browser pixel or WeChat device test).");
