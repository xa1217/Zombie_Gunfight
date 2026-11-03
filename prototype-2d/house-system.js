// Enterable buildings share the run state with the street and render as large
// top-down interiors. Gameplay owns loot and scene transitions; this module
// owns layout, indoor collision, search points and drawing.
(function (global) {
  "use strict"
  const DOOR_CLEARANCE = 28
  const DOOR_RADIUS = 24
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
  const distanceSquared = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2
  const validPoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y)
  const categoryNames = { shop: "物资商店", market: "街角市场", clinic: "社区诊所", warehouse: "仓储站", garage: "修理车库", apartment: "公寓住宅", residential: "家庭住宅" }
  const categoryTheme = {
    shop: { floor: "#777768", accent: "#c7a96e", sign: "STORE" }, market: { floor: "#796f63", accent: "#d0a15e", sign: "MARKET" },
    clinic: { floor: "#6d7d7c", accent: "#8fc6bb", sign: "CLINIC" }, warehouse: { floor: "#6d726b", accent: "#c09455", sign: "DEPOT" },
    garage: { floor: "#6d716d", accent: "#d08c55", sign: "GARAGE" }, apartment: { floor: "#777c78", accent: "#9cb39d", sign: "APARTMENT" }, residential: { floor: "#816f60", accent: "#bca278", sign: "HOME" }
  }

  function create(city, random = Math.random) {
    if (!city || !Array.isArray(city.buildings) || typeof city.isFree !== "function") throw new TypeError("House exploration requires a city map")
    const houses = city.buildings.map((building, index) => {
      const { x, y, width, height, kind = "residential", category = kind, houseType = "bungalow", floors = 1, ruined = false, roomScale = 1, footprint, exterior } = building
      const doors = [{ x: x + width / 2, y: y + height + DOOR_CLEARANCE, side: "south" }, { x: x + width / 2, y: y - DOOR_CLEARANCE, side: "north" }].map(Object.freeze)
      const door = doors[0]
      const label = categoryNames[kind] || categoryNames[category] || "可探索建筑"
      const serial = Number.isFinite(building.variant) ? building.variant : index
      return Object.freeze({ id: `house-${serial}`, kind, category, houseType, floors, ruined, roomScale, footprint: footprint || Object.freeze({ x, y, width, height }), exterior: exterior || Object.freeze({}), building: Object.freeze({ x, y, width, height }), name: `${label} ${String(serial + 1).padStart(2, "0")}`, door, doors: Object.freeze(doors) })
    })
    function getNearbyEntrance(player, range = 80) {
      if (!validPoint(player) || !Number.isFinite(range) || range < 0) return null
      let nearest = null; let best = range * range
      for (const house of houses) for (const door of house.doors) { const distance = distanceSquared(player, door); if (distance <= best) { nearest = house; best = distance } }
      return nearest
    }
    const rect = (x, y, width, height, type = "furniture", label = "") => ({ x, y, width, height, type, label })
    function makeRoomLayout(house, width, height, bounds) {
      const { minX, minY, maxX, maxY } = bounds
      const rooms = [], obstacles = [], doors = [], windows = [], walls = [], invasionPoints = [], containers = []
      const highRise = house.houseType === "floor" || house.kind === "apartment" || house.floors > 1
      const tone = categoryTheme[house.kind]?.floor || categoryTheme.residential.floor
      const area = (name, x, y, w, h) => rooms.push({ name, x, y, width: w, height: h, tone })
      const furniture = (type, x, y, w, h, label = "") => obstacles.push(rect(x, y, w, h, type, label))
      const horizontalWall = (x, y, w) => { if (w > 0) obstacles.push(rect(x, y, w, 10, "wall")) }
      const verticalWall = (x, y, h, openings = []) => {
        let cursor = y
        for (const opening of openings.sort((a, b) => a.y - b.y)) {
          const from = clamp(opening.y, y, y + h), to = clamp(opening.y + opening.height, y, y + h)
          if (from > cursor) obstacles.push(rect(x, cursor, 10, from - cursor, "wall"))
          if (to > from) doors.push({ x, y: from, width: 10, height: to - from, label: opening.label || "房门", side: "interior", exterior: false })
          cursor = Math.max(cursor, to)
        }
        if (cursor < y + h) obstacles.push(rect(x, cursor, 10, y + h - cursor, "wall"))
      }
      // Distinct real-world plans replace the old repeated six-cell template.
      // Each retains an unobstructed route between front and rear doors, with
      // side doors and furniture placed for the largest 48px infected.
      if (highRise) {
        area("一楼大厅", minX, minY, maxX - minX, maxY - minY)
        area("楼梯间", minX, minY, width * .34 - minX, height * .29)
        area("电梯厅", width * .64, minY, maxX - width * .64, height * .27)
        area("物业办公室", minX, height * .39, width * .36 - minX, height * .23)
        area("信报区", width * .69, height * .33, maxX - width * .69, height * .20)
        area("休息区", width * .66, height * .63, maxX - width * .66, height * .25)
        horizontalWall(minX, height * .39, width * .36 - minX)
        horizontalWall(minX, height * .62, width * .36 - minX)
        verticalWall(width * .36, height * .39, height * .23, [{ y: height * .43, height: 96, label: "物业门" }])
        furniture("stair", 28, 30, 62, Math.min(104, height * .20), "楼梯")
        furniture("elevator", width - 112, 33, 75, 70, "断电电梯")
        furniture("desk", 28, height * .43, 72, 68, "物业桌")
        furniture("mailbox", width - 80, height * .36, 44, 48, "信报箱")
        furniture("sofa", width - 94, height * .69, 57, 60, "破沙发")
        furniture("reception", 30, height - 101, 100, 66, "门卫台")
      } else if (house.kind === "residential") {
        area("客厅", minX, height * .36, maxX - minX, maxY - height * .36)
        area("厨房", minX, minY, width * .39 - minX, height * .35 - minY)
        area("卧室", width * .62, minY, maxX - width * .62, height * .52 - minY)
        area("卫生间", width * .68, height * .62, maxX - width * .68, maxY - height * .62)
        area(house.houseType === "courtyard" ? "小院" : "后门玄关", width * .41, minY, width * .20, height * .20)
        verticalWall(width * .39, minY, height * .35 - minY, [{ y: height * .15, height: 96, label: "厨房门" }])
        horizontalWall(minX, height * .35, width * .39 - minX)
        verticalWall(width * .62, minY, height * .52 - minY, [{ y: height * .25, height: 100, label: "卧室门" }])
        horizontalWall(width * .62, height * .52, maxX - width * .62)
        horizontalWall(width * .68, height * .62, maxX - width * .68)
        verticalWall(width * .68, height * .62, maxY - height * .62, [{ y: height * .69, height: 100, label: "卫生间门" }])
        furniture("counter", 27, 30, 68, 89, "灶台")
        furniture("appliance", 110, 31, 47, 78, "旧冰箱")
        furniture("bed", width - 99, 38, 66, 112, "破床")
        furniture("desk", width - 108, height * .38, 73, 57, "书桌")
        furniture("sofa", 31, height * .48, 91, 79, "破沙发")
        furniture("table", 56, height - 88, 66, 54, "茶几")
        furniture("bath", width - 118, height - 84, 85, 54, "浴缸")
      } else if (house.kind === "shop" || house.kind === "market") {
        const stockX = width * .40, officeX = width * .66, rearY = height * .27
        area(house.kind === "market" ? "市场售货区" : "营业厅", minX, rearY, maxX - minX, maxY - rearY)
        area("后仓库", minX, minY, stockX - minX, rearY - minY)
        area("员工办公室", officeX, minY, maxX - officeX, rearY - minY)
        verticalWall(stockX, minY, rearY - minY, [{ y: 36, height: 96, label: "后仓门" }])
        horizontalWall(minX, rearY, stockX - minX)
        verticalWall(officeX, minY, rearY - minY, [{ y: 34, height: 96, label: "办公室门" }])
        horizontalWall(officeX, rearY, maxX - officeX)
        furniture("crate", 29, 30, 69, Math.min(77, rearY - 45), "残留货箱")
        furniture("desk", width - 80, 29, 46, Math.min(75, rearY - 44), "员工桌")
        furniture("shelf", 49, height * .39, 81, Math.min(106, height * .17), "被洗劫货架")
        furniture("shelf", width - 137, height * .36, 96, 112, "食品架")
        furniture("shelf", 61, height * .68, 82, 79, "杂货架")
        furniture("counter", width - 146, height - 105, 108, 67, "收银台")
      } else if (house.kind === "clinic") {
        const leftWall = width * .39, rightWall = width * .62
        area("候诊大厅", minX, height * .68, maxX - minX, maxY - height * .68)
        area("药房", minX, minY, leftWall - minX, height * .29 - minY)
        area("诊疗室", minX, height * .29 + 10, leftWall - minX, height * .35)
        area("病房 A", rightWall, minY, maxX - rightWall, height * .44 - minY)
        area("病房 B", rightWall, height * .44 + 10, maxX - rightWall, height * .24 - 10)
        verticalWall(leftWall, minY, height * .64 - minY, [{ y: height * .12, height: 96, label: "药房门" }, { y: height * .43, height: 100, label: "诊疗室门" }])
        horizontalWall(minX, height * .29, leftWall - minX)
        horizontalWall(minX, height * .64, leftWall - minX)
        verticalWall(rightWall, minY, height * .68 - minY, [{ y: height * .19, height: 100, label: "病房门" }, { y: height * .49, height: 96, label: "病房门" }])
        horizontalWall(rightWall, height * .44, maxX - rightWall)
        horizontalWall(rightWall, height * .68, maxX - rightWall)
        furniture("shelf", 28, 32, 77, Math.min(96, height * .29 - 48), "被翻空药柜")
        furniture("desk", 29, height * .35, 80, 77, "诊疗台")
        furniture("bed", width - 99, 41, 66, 111, "病床")
        furniture("bed", width - 99, height * .46 + 10, 66, Math.min(93, height * .22 - 23), "病床")
        furniture("reception", 29, height - 100, 91, 65, "接待台")
        furniture("sofa", width - 117, height - 103, 82, 71, "候诊椅")
      } else {
        const officeX = width * .66, rearY = height * .28
        area(house.kind === "garage" ? "维修车间" : "装卸与库存区", minX, minY, maxX - minX, maxY - minY)
        area("值班办公室", officeX, minY, maxX - officeX, rearY - minY)
        verticalWall(officeX, minY, rearY - minY, [{ y: 39, height: 96, label: "办公室门" }])
        horizontalWall(officeX, rearY, maxX - officeX)
        furniture("desk", width - 80, 30, 46, Math.min(77, rearY - 45), "值班桌")
        furniture("workbench", 27, 79, 99, 64, "工具台")
        furniture("shelf", 28, height * .31, 70, 99, "旧货架")
        furniture("crate", width - 141, height * .38, 101, 91, "货堆")
        furniture("crate", 59, height * .66, 99, 70, "破木箱")
        furniture("shelf", width - 108, height * .74, 71, 89, "零件架")
      }
      // Perimeter segments are collision data too; expanding doorway bounds
      // cannot turn the whole north/south wall into a walkable opening.
      for (const [side, y] of [["south", height - 16], ["north", 0]]) {
        const mainDoor = { x: width / 2 - 44, y, width: 88, height: 16, label: side === "south" ? "前门" : "后门", side, exterior: true, invasion: true }
        doors.push(mainDoor)
        walls.push(rect(0, y, width / 2 - 44, 16, "perimeter"), rect(width / 2 + 44, y, width / 2 - 44, 16, "perimeter"))
        invasionPoints.push({ kind: "door", x: width / 2, y: side === "south" ? height + DOOR_CLEARANCE : -DOOR_CLEARANCE, width: 88, height: 16, side, exterior: true, label: mainDoor.label })
      }
      walls.push(rect(0, 16, 16, height - 32, "perimeter"), rect(width - 16, 16, 16, height - 32, "perimeter"))
      obstacles.push(...walls)
      for (const side of ["west", "east"]) for (const y of [56, height - 54]) {
        const window = { x: side === "west" ? 2 : width - 14, y: y - 20, width: 12, height: 40, side, label: "窗", invasion: true }
        windows.push(window)
        invasionPoints.push({ kind: "window", x: side === "west" ? minX + 26 : maxX - 26, y, width: 12, height: 40, side, exterior: true, label: "窗" })
      }
      return { rooms, obstacles, doors, windows, walls, invasionPoints, containers }
    }
    function createRoom(house) {
      const known = houses.find(candidate => candidate.id === house?.id)
      if (!known) throw new TypeError("Unknown house")
      const localWidth = known.building.width, localHeight = known.building.height
      const localBounds = { minX: 16, minY: 16, maxX: localWidth - 16, maxY: localHeight - 16 }
      const layout = makeRoomLayout(known, localWidth, localHeight, localBounds)
      const worldOrigin = { x: known.building.x, y: known.building.y }
      const mapPoint = point => ({ ...point, x: worldOrigin.x + point.x, y: worldOrigin.y + point.y })
      // Translation only: furniture, actors and streets have the same scale.
      const bounds = { minX: worldOrigin.x + localBounds.minX, minY: known.doors[1].y - 34, maxX: worldOrigin.x + localBounds.maxX, maxY: known.door.y + 34 }
      const worldBounds = { minX: known.building.x, minY: known.building.y, maxX: known.building.x + localWidth, maxY: known.building.y + localHeight, width: localWidth, height: localHeight }
      const mappedLayout = Object.fromEntries(["rooms", "obstacles", "walls", "doors", "windows", "invasionPoints"].map(key => [key, layout[key].map(mapPoint)]))
      const entry = { x: known.door.x, y: known.door.y, side: known.door.side }
      const exit = { ...entry }
      const exits = known.doors.map(door => ({ ...door }))
      const floorCount = Math.max(1, known.floors)
      const highRise = floorCount > 1 || known.houseType === "floor" || known.kind === "apartment"
      const invasionEntrances = mappedLayout.invasionPoints.filter(point => point.exterior)
      const room = { layer: "city", worldOrigin, worldBounds, worldScale: 1, localWidth, localHeight, houseId: known.id, name: known.name, kind: known.kind, category: known.category, houseType: known.houseType, floors: known.floors, ruined: known.ruined, exterior: known.exterior, roomScale: 1, width: localWidth, height: localHeight, entry, exit, exits, bounds, floor: 1, floorCount, floorMode: highRise ? "first-floor-birdseye" : "single-floor-birdseye", cameraMode: "birdseye-fixed-scale", indoorStyle: highRise ? "high-rise-ground-floor" : "house-ground-floor", floorLabel: highRise ? "一楼 · 公共区域" : "一层 · 前后门可入侵", ...mappedLayout, invasionEntrances, entryPoints: invasionEntrances, labels: mappedLayout.rooms.map(area => area.name).filter(Boolean), containers: [] }
      // Put window landings in the nearest unobstructed stretch of side wall;
      // a sill must not spawn an infected inside a bed or kitchen appliance.
      for (const [index, window] of room.windows.entries()) {
        const point = room.invasionPoints.filter(candidate => candidate.kind === "window")[index]
        const options = []
        for (let y = worldBounds.minY + 48; y <= worldBounds.maxY - 48; y += 8) if (isFree(room, point.x, y, 24)) options.push(y)
        options.sort((a, b) => Math.abs(a - point.y) - Math.abs(b - point.y))
        if (!options.length) throw new Error(`House ${room.houseId} has no safe ${window.side} window landing`)
        point.y = options[0]; window.y = point.y - window.height / 2
      }
      room.containers = randomContainers(room)
      return room
    }
    function obstacleHits(x, y, radius, obstacle) { const dx = x - clamp(x, obstacle.x, obstacle.x + obstacle.width); const dy = y - clamp(y, obstacle.y, obstacle.y + obstacle.height); return dx * dx + dy * dy < radius * radius - .000001 }
    function isFree(room, x, y, radius = 20) {
      if (!room?.bounds || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius < 0) return false
      const { minX, minY, maxX, maxY } = room.bounds
      if (x < minX + radius || x > maxX - radius || y < minY + radius || y > maxY - radius) return false
      if (room.worldBounds && (y < room.worldBounds.minY || y > room.worldBounds.maxY)) {
        const door = (room.exits || [room.entry]).find(candidate => candidate.side === (y < room.worldBounds.minY ? "north" : "south"))
        if (!door || Math.abs(x - door.x) > 44 - radius) return false
      }
      return !(room.obstacles || []).some(obstacle => obstacleHits(x, y, radius, obstacle))
    }
    function move(room, entity, dx, dy) { if (!room?.bounds || !validPoint(entity) || !Number.isFinite(dx) || !Number.isFinite(dy)) return; const radius = Number.isFinite(entity.radius) ? Math.max(0, entity.radius) : 20; const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / Math.max(8, radius / 2))); const stepX = dx / steps; const stepY = dy / steps; for (let step = 0; step < steps; step += 1) for (const axis of ["x", "y"]) { const amount = axis === "x" ? stepX : stepY; if (!amount) continue; const start = entity[axis]; const limit = axis === "x" ? [room.bounds.minX + radius, room.bounds.maxX - radius] : [room.bounds.minY + radius, room.bounds.maxY - radius]; const end = clamp(start + amount, limit[0], limit[1]); const free = value => isFree(room, axis === "x" ? value : entity.x, axis === "y" ? value : entity.y, radius); if (free(end)) entity[axis] = end; else { let low = 0; let high = 1; for (let i = 0; i < 9; i += 1) { const middle = (low + high) / 2; if (free(start + (end - start) * middle)) low = middle; else high = middle } entity[axis] = start + (end - start) * low } } }
    function segmentHitFraction(room, ax, ay, bx, by, padding = 0) { let closest = null; for (const obstacle of room?.obstacles || []) { let near = 0; let far = 1; for (const [origin, delta, min, max] of [[ax, bx - ax, obstacle.x - padding, obstacle.x + obstacle.width + padding], [ay, by - ay, obstacle.y - padding, obstacle.y + obstacle.height + padding]]) { if (Math.abs(delta) < .00001) { if (origin < min || origin > max) { near = 2; break } } else { const a = (min - origin) / delta; const b = (max - origin) / delta; near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b)) } } if (near <= far && near >= 0 && near <= 1 && (closest === null || near < closest)) closest = near } return closest }
    function clearPath(room, ax, ay, bx, by, radius) {
      if (!isFree(room, ax, ay, radius) || !isFree(room, bx, by, radius) || segmentHitFraction(room, ax, ay, bx, by, 0) !== null) return false
      // A moving actor is a capsule, not a larger rectangular AABB. Measuring
      // the actual distance from each furniture corner to the travel segment
      // admits safe rounded-corner approaches without drawing paths that the
      // circle collision solver will later block.
      const dx = bx - ax, dy = by - ay, lengthSquared = dx * dx + dy * dy
      const pointDistance = (x, y) => {
        const t = lengthSquared ? clamp(((x - ax) * dx + (y - ay) * dy) / lengthSquared, 0, 1) : 0
        return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2
      }
      const threshold = radius * radius - .000001
      return !(room.obstacles || []).some(obstacle => [obstacle.x, obstacle.x + obstacle.width].some(x => [obstacle.y, obstacle.y + obstacle.height].some(y => pointDistance(x, y) < threshold)))
    }
    const navigationCache = new WeakMap()
    function navigationGraph(room, radius) {
      let byRadius = navigationCache.get(room)
      if (!byRadius) { byRadius = new Map(); navigationCache.set(room, byRadius) }
      if (byRadius.has(radius)) return byRadius.get(radius)
      const nodes = [], keys = new Set(), margin = radius + 8
      const add = (x, y) => {
        const key = x.toFixed(2) + "," + y.toFixed(2)
        if (keys.has(key) || !isFree(room, x, y, radius)) return
        keys.add(key); nodes.push({ x, y })
      }
      for (const obstacle of room.obstacles || []) for (const x of [obstacle.x - margin, obstacle.x + obstacle.width + margin]) for (const y of [obstacle.y - margin, obstacle.y + obstacle.height + margin]) add(x, y)
      for (const door of room.doors || []) add(door.x + door.width / 2, door.y + door.height / 2)
      for (const point of [room.entry, ...(room.exits || []), ...room.containers, ...room.invasionEntrances]) add(point.x, point.y)
      const links = nodes.map(() => [])
      for (let a = 0; a < nodes.length; a += 1) for (let b = a + 1; b < nodes.length; b += 1) {
        if (!clearPath(room, nodes[a].x, nodes[a].y, nodes[b].x, nodes[b].y, radius)) continue
        const cost = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y)
        links[a].push({ index: b, cost }); links[b].push({ index: a, cost })
      }
      const graph = { nodes, links, targetKey: null, costs: [] }
      byRadius.set(radius, graph)
      return graph
    }
    function randomContainers(room) {
      const radius = 24, graph = navigationGraph(room, radius), connected = new Set()
      const pending = []
      graph.nodes.forEach((node, index) => { if (clearPath(room, room.entry.x, room.entry.y, node.x, node.y, radius)) { connected.add(index); pending.push(index) } })
      for (let cursor = 0; cursor < pending.length; cursor++) for (const link of graph.links[pending[cursor]]) if (!connected.has(link.index)) { connected.add(link.index); pending.push(link.index) }
      const reachable = point => clearPath(room, room.entry.x, room.entry.y, point.x, point.y, radius) || pending.some(index => clearPath(room, graph.nodes[index].x, graph.nodes[index].y, point.x, point.y, radius))
      const candidates = [], frame = room.worldBounds
      for (let y = frame.minY + 48; y <= frame.maxY - 48; y += 10) for (let x = frame.minX + 48; x <= frame.maxX - 48; x += 10) {
        const point = { x, y }
        const matching = room.rooms.filter(area => area.name && x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height).sort((a, b) => a.width * a.height - b.width * b.height)[0]
        if (!matching) continue
        const corners = [[matching.x, matching.y], [matching.x + matching.width, matching.y], [matching.x, matching.y + matching.height], [matching.x + matching.width, matching.y + matching.height]]
        const cornerDistance = Math.min(...corners.map(([cx, cy]) => Math.hypot(x - cx, y - cy)))
        if (cornerDistance <= 108 && isFree(room, x, y, radius) && reachable(point)) candidates.push({ ...point, roomName: matching.name })
      }
      const sample = () => { const value = typeof random === "function" ? random() : .5; return Number.isFinite(value) ? clamp(value, 0, .999999) : .5 }
      // Shuffle only once when the persistent room is created. Drawing never
      // consumes gameplay randomness and re-entry retains these exact caches.
      for (let index = candidates.length - 1; index > 0; index--) { const other = Math.floor(sample() * (index + 1)); [candidates[index], candidates[other]] = [candidates[other], candidates[index]] }
      const selected = []
      for (const separation of [86, 66, 48]) for (const point of candidates) {
        if (selected.length >= 4) break
        if (selected.some(other => Math.hypot(other.x - point.x, other.y - point.y) < separation)) continue
        selected.push(point)
      }
      if (selected.length < 4) throw new Error(`House ${room.houseId} has fewer than four reachable stash corners`)
      const houseIndex = Math.max(0, houses.findIndex(house => house.id === room.houseId))
      // Randomize position only. Preserve the gameplay branch's container
      // types; its persistent contents and identification state attach to
      // these same mutable objects when the survivor searches them.
      return selected.map((point, index) => ({ ...point, id: room.houseId + "-cache-" + (index + 1), lootType: ["travel", "equipment", "tool", "safe"][(houseIndex * 2 + index) % 4], searched: false, corner: true }))
    }
    function steer(room, x, y, targetX, targetY, radius = 18) {
      if (!room?.bounds || ![x, y, targetX, targetY, radius].every(Number.isFinite)) return { x, y }
      if (clearPath(room, x, y, targetX, targetY, radius)) return { x: targetX, y: targetY }
      const graph = navigationGraph(room, radius)
      const targetKey = Math.floor(targetX / 12) + "," + Math.floor(targetY / 12)
      if (graph.targetKey !== targetKey) {
        // Solve the whole connected floor, not just the closest visible
        // furniture corner. Share the result between same-sized pursuers.
        const costs = graph.nodes.map(point => clearPath(room, point.x, point.y, targetX, targetY, radius) ? Math.hypot(point.x - targetX, point.y - targetY) : Infinity)
        const settled = new Set()
        for (let count = 0; count < graph.nodes.length; count += 1) {
          let nearest = -1, best = Infinity
          for (let index = 0; index < costs.length; index += 1) if (!settled.has(index) && costs[index] < best) { nearest = index; best = costs[index] }
          if (nearest < 0) break
          settled.add(nearest)
          for (const link of graph.links[nearest]) if (best + link.cost < costs[link.index]) costs[link.index] = best + link.cost
        }
        graph.costs = costs; graph.targetKey = targetKey
      }
      let best = Infinity, waypoint = null
      for (let index = 0; index < graph.nodes.length; index += 1) {
        const point = graph.nodes[index], distance = Math.hypot(point.x - x, point.y - y)
        const cost = distance + graph.costs[index]
        if (distance < .5 || cost >= best || !clearPath(room, x, y, point.x, point.y, radius)) continue
        best = cost; waypoint = point
      }
      return waypoint ? { x: waypoint.x, y: waypoint.y } : { x, y }
    }
    function getNearbySearch(room, player, range = 90) { if (!room || !validPoint(player) || !Number.isFinite(range) || range < 0) return null; let nearest = null; let best = range * range; for (const container of room.containers || []) if (!container.searched) { const distance = distanceSquared(player, container); if (distance <= best) { nearest = container; best = distance } } return nearest }
    function nearExit(room, player, range = 90) { return Boolean(room && validPoint(player) && Number.isFinite(range) && range >= 0 && (room.exits || [room.exit, room.entry]).some(exit => distanceSquared(player, exit) <= range * range)) }
    function getInvasionEntrances(room) { return room && Array.isArray(room.invasionEntrances) ? room.invasionEntrances : [] }
    function getRandomInvasionEntry(room, random = Math.random) { const points = getInvasionEntrances(room); if (!points.length) return null; const sample = typeof random === "function" ? random() : 0; const roll = Number.isFinite(sample) ? clamp(sample, 0, .999999) : 0; return points[Math.floor(roll * points.length)] }
    function isInvasionEntry(room, x, y, range = 32) { if (!room || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(range) || range < 0) return false; return getInvasionEntrances(room).some(point => (point.x - x) ** 2 + (point.y - y) ** 2 <= range * range) }

    // Interior artwork uses the same warm plaster, old timber and brown ink
    // as the exterior atlas. All decorations are visual only: the original
    // world-space furniture, doors and movement measurements stay authoritative.
    const INK = "#423429", LIGHT = "#e9d7aa"
    const interiorCache = new WeakMap()
    function inkLine(ctx, points, color = INK, width = 1.4) {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath()
      points.forEach((point, index) => index ? ctx.lineTo(...point) : ctx.moveTo(...point)); ctx.stroke()
    }
    function box(ctx, x, y, w, h, fill, radius = 2, line = INK, lineWidth = 2) {
      if (w <= 0 || h <= 0) return
      const r = Math.min(radius, w / 2, h / 2)
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r)
      ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
      ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r)
      ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath()
      ctx.fillStyle = fill; ctx.fill(); if (lineWidth) { ctx.strokeStyle = line; ctx.lineWidth = lineWidth; ctx.stroke() }
    }
    function oval(ctx, x, y, rx, ry, fill, line = INK, lineWidth = 1.5) {
      ctx.beginPath(); ctx.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), 0, 0, Math.PI * 2)
      ctx.fillStyle = fill; ctx.fill(); if (lineWidth) { ctx.strokeStyle = line; ctx.lineWidth = lineWidth; ctx.stroke() }
    }
    function speckleRandom(seed) {
      let value = seed >>> 0
      return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296 }
    }
    function floorMaterial(room, area) {
      if (area.name === "小院") return "garden"
      if (/厨房|卫生间/.test(area.name)) return "wet-tile"
      if (room.kind === "residential" && !/入口/.test(area.name) && area.name) return "wood"
      if (room.kind === "clinic") return "clinic-tile"
      if (room.kind === "warehouse" || room.kind === "garage") return "concrete"
      if (room.kind === "shop" || room.kind === "market") return "shop-tile"
      return "hall-tile"
    }
    function drawFloor(ctx, room, area, index) {
      const { x, y, width: w, height: h } = area, material = floorMaterial(room, area)
      const random = speckleRandom(index * 983 + Math.round(room.width * 17 + room.height * 31))
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
      if (material === "wood") {
        const shades = ["#96764f", "#a18357", "#ae8c5f", "#896d48", "#a4895d"]
        for (let row = 0, py = y; py < y + h; row++, py += 23) {
          for (let px = x - (row % 2) * 38; px < x + w; px += 76) {
            ctx.fillStyle = shades[Math.floor(random() * shades.length)]; ctx.fillRect(px, py, 76, 23)
            inkLine(ctx, [[px, py + 22], [px + 76, py + 22]], "#785e4059", 1)
            inkLine(ctx, [[px + 1, py + 2], [px + 1, py + 21]], "#70543a68", 1)
            inkLine(ctx, [[px + 8, py + 5], [px + 38, py + 4], [px + 62, py + 6]], "#e1bd837d", .8)
            inkLine(ctx, [[px + 15, py + 14], [px + 37, py + 13], [px + 49, py + 15]], "#82644244", .8)
            if (random() > .7) oval(ctx, px + 51, py + 17, 4, 1.3, "#8c6b4866", "#7f604a66", .6)
          }
        }
      } else if (material === "garden") {
        ctx.fillStyle = "#73764a"; ctx.fillRect(x, y, w, h)
        for (let i = 0; i < 38; i++) {
          const px = x + random() * w, py = y + random() * h
          oval(ctx, px, py, 4 + random() * 7, 2 + random() * 4, i % 2 ? "#bec07a55" : "#616f4555", INK, 0)
          if (i % 3 === 0) inkLine(ctx, [[px - 3, py + 3], [px - 1, py - 2], [px + 1, py + 3], [px + 4, py - 3]], "#5b6845", 1.4)
        }
        for (let py = y + 18; py < y + h; py += 35) box(ctx, x + w - 45 + (Math.round(py) % 2) * 3, py, 28, 23, "#c0ba8d", 5, "#77754d", 1.2)
      } else {
        const palettes = {
          "wet-tile": ["#aaa58a", "#929e8b", "#b8ae8c"], "clinic-tile": ["#a4a68f", "#8e9d8a", "#b3ad94"],
          "shop-tile": ["#a08b66", "#96845f", "#b39c75"], "hall-tile": ["#b3a076", "#a3956c", "#bdad84"], "concrete": ["#8e8d74", "#a0977a", "#817e68"]
        }
        const colors = palettes[material], size = material === "concrete" ? 59 : material === "wet-tile" ? 24 : 29
        for (let py = y; py < y + h; py += size) for (let px = x; px < x + w; px += size) {
          ctx.fillStyle = colors[Math.floor(random() * colors.length)]; ctx.fillRect(px, py, size, size)
          ctx.strokeStyle = material === "concrete" ? "#665f4840" : "#897f6352"; ctx.lineWidth = 1; ctx.strokeRect(px + .5, py + .5, size - 1, size - 1)
          if (random() > .9) inkLine(ctx, [[px + size, py + 5], [px + size - 6, py + 11], [px + size - 3, py + 18]], "#74694d66", .9)
          if (material !== "concrete") { ctx.fillStyle = "#eee0b33b"; ctx.fillRect(px + 2, py + 2, size - 5, 1) }
        }
      }
      // The city has been abandoned for months: broad damp patches, broken
      // surfaces and discarded supplies are part of the floor, not a clean
      // room with a handful of decorative dust dots.
      for (let i = 0; i < 32; i++) {
        const px = x + random() * w, py = y + random() * h
        oval(ctx, px, py, 3 + random() * 8, 1 + random() * 3, i % 3 ? "#423b2924" : "#d8c39630", INK, 0)
      }
      for (let patch = 0; patch < (area.name ? 3 : 4); patch++) {
        const px = x + 14 + random() * Math.max(1, w - 28), py = y + 18 + random() * Math.max(1, h - 36)
        const rw = Math.min(w * .24, 19 + random() * 27), rh = 9 + random() * 20
        ctx.beginPath()
        for (let point = 0; point < 12; point++) {
          const angle = point * Math.PI / 6, radius = .65 + random() * .35
          const cx = px + Math.cos(angle) * rw * radius, cy = py + Math.sin(angle) * rh * radius
          if (point) ctx.lineTo(cx, cy); else ctx.moveTo(cx, cy)
        }
        ctx.closePath(); ctx.fillStyle = patch === 1 && room.kind === "clinic" ? "#674c363b" : patch % 2 ? "#41472d40" : "#64513932"; ctx.fill()
        for (let chip = 0; chip < 6; chip++) oval(ctx, px + (random() - .5) * rw * 1.8, py + (random() - .5) * rh * 1.8, 2 + random() * 4, 1 + random() * 2, "#3f43292e", INK, 0)
      }
      for (let crack = 0; crack < (material === "wood" ? 1 : 2); crack++) {
        const px = x + 18 + random() * Math.max(1, w - 60), py = y + 25 + random() * Math.max(1, h - 70)
        inkLine(ctx, [[px, py], [px + 12, py + 9], [px + 8, py + 17], [px + 24, py + 28], [px + 20, py + 40]], "#5d553b85", 1.2)
        inkLine(ctx, [[px + 8, py + 17], [px - 1, py + 20], [px - 5, py + 29]], "#62593e70", .9)
      }
      for (let patch = 0; patch < 4; patch++) {
        const py = y + 13 + random() * Math.max(1, h - 30), edgeX = patch % 2 ? x + w - 4 : x + 4
        oval(ctx, edgeX, py, 6 + random() * 8, 10 + random() * 10, "#49553547", INK, 0)
        for (let fleck = 0; fleck < 4; fleck++) oval(ctx, edgeX + (random() - .5) * 16, py + (random() - .5) * 21, 2, 2.5, "#39452755", INK, 0)
      }
      if (area.name && material !== "garden") {
        const px = x + w * (.22 + random() * .5), py = y + h * (.34 + random() * .42)
        // Dried infection traces and drag marks break the tidy showroom floor
        // while keeping the same muted hand-painted city palette.
        oval(ctx, px, py, 11 + random() * 13, 5 + random() * 5, "#703f2d77", INK, 0)
        oval(ctx, px + 8, py - 2, 8, 4, "#4e332967", INK, 0)
        for (let drop = 0; drop < 7; drop++) oval(ctx, px + 16 + drop * 5 + random() * 4, py + (random() - .5) * 17, 1 + random() * 2.6, .8 + random() * 1.8, "#693d2b99", INK, 0)
        inkLine(ctx, [[px - 9, py + 3], [px + 16, py + 7], [px + 29, py + 11]], "#65442f65", 2.4)
        inkLine(ctx, [[px - 7, py + 7], [px + 17, py + 12]], "#4c3b2d54", 1.6)
      }
      if (/客厅|卧室|休息/.test(area.name)) {
        const rx = x + w * .37, ry = y + h * .55, rw = Math.min(87, w * .56), rh = Math.min(61, h * .39)
        box(ctx, rx, ry, rw, rh, "#90705299", 3, "#72593d88", 1.5)
        ctx.strokeStyle = "#d5b487a0"; ctx.lineWidth = 1.2; ctx.strokeRect(rx + 5, ry + 5, rw - 10, rh - 10)
        inkLine(ctx, [[rx + rw / 2, ry + 12], [rx + rw - 13, ry + rh / 2], [rx + rw / 2, ry + rh - 12], [rx + 13, ry + rh / 2], [rx + rw / 2, ry + 12]], "#c3a06a88", 1)
        for (let i = 5; i < rw - 4; i += 6) { inkLine(ctx, [[rx + i, ry - 2], [rx + i, ry + 2]], "#c4ad81", .9); inkLine(ctx, [[rx + i, ry + rh - 2], [rx + i, ry + rh + 2]], "#c4ad81", .9) }
      }
      // A few discarded papers and fragments stay near room edges, leaving
      // the open spine and doorway floor easy to distinguish at phone scale.
      for (let i = 0; i < (area.name ? 8 : 5); i++) {
        const px = x + 14 + random() * Math.max(1, w - 29), py = y + 23 + random() * Math.max(1, h - 49)
        ctx.save(); ctx.translate(px, py); ctx.rotate((random() - .5) * .8)
        if (i % 3 === 0) {
          ctx.fillStyle = "#ada991"; ctx.strokeStyle = "#5c5a4166"; ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(-5, -4); ctx.lineTo(5, -2); ctx.lineTo(2, 4); ctx.lineTo(-4, 2); ctx.closePath(); ctx.fill(); ctx.stroke()
          inkLine(ctx, [[-3, -1], [2, 1]], "#d6cdaa", .7)
        } else {
          box(ctx, -4, -5, 8 + (i % 2) * 3, 10, "#c8b68b", .4, "#7b6f5166", .6)
          inkLine(ctx, [[-2, -2], [2, -2]], "#95866a", .6); inkLine(ctx, [[-2, 1], [1, 1]], "#95866a", .6)
          ctx.fillStyle = "#918462"; ctx.fillRect(4, -5, 2, 3)
        }
        ctx.restore()
      }
      ctx.restore()
    }
    function wallSegments(wall, room) {
      const horizontal = wall.width >= wall.height, start = horizontal ? wall.x : wall.y
      let spans = [[start, start + (horizontal ? wall.width : wall.height)]]
      for (const door of room.doors || []) {
        if (door.x + door.width <= wall.x || door.x >= wall.x + wall.width || door.y + door.height <= wall.y || door.y >= wall.y + wall.height) continue
        const low = horizontal ? door.x : door.y, high = low + (horizontal ? door.width : door.height)
        spans = spans.flatMap(([a, b]) => high <= a || low >= b ? [[a, b]] : [[a, Math.max(a, low)], [Math.min(b, high), b]].filter(([c, d]) => d - c > .1))
      }
      return spans.map(([a, b]) => horizontal ? { x: a, y: wall.y, width: b - a, height: wall.height } : { x: wall.x, y: a, width: wall.width, height: b - a })
    }
    function drawWall(ctx, wall, room) {
      for (const segment of wallSegments(wall, room)) {
        const { x, y, width: w, height: h } = segment
        box(ctx, x, y, w, h, room.ruined ? "#a18d66" : "#b3a07a", 1, INK, 2.8)
        // Keep the little front face inside the physical wall footprint.
        ctx.fillStyle = "#8c7554"; ctx.fillRect(x + 1.7, y + Math.max(3, h - 4), Math.max(.1, w - 3.4), Math.min(3, h - 2))
        inkLine(ctx, [[x + 2, y + 2], [x + w - 2, y + 2]], "#d8c296", 1.4)
        if (w > 25) for (let px = x + 19; px < x + w - 8; px += 41) inkLine(ctx, [[px, y + 2], [px - 2, y + Math.min(h - 2, 7)]], "#96826188", .9)
        if (h > 24) for (let py = y + 19; py < y + h - 8; py += 47) inkLine(ctx, [[x + 2, py], [x + Math.min(w - 2, 7), py + 2]], "#96826188", .9)
        const random = speckleRandom(Math.round(x * 5 + y * 11 + w + h))
        for (let mark = 0; mark < Math.ceil(Math.max(w, h) / 43); mark++) {
          const px = x + 2 + random() * Math.max(1, w - 4), py = y + 2 + random() * Math.max(1, h - 4)
          oval(ctx, px, py, Math.min(8, w / 3), Math.min(5, h / 3), "#4c55354a", INK, 0)
          inkLine(ctx, [[px - 2, py - 1], [px + 2, py + 2], [px + 1, py + 4]], "#786947", .7)
        }
      }
    }
    function drawBottle(ctx, x, y, w, h, color) {
      box(ctx, x + w * .3, y, w * .4, 3, "#695642", .6, INK, .8)
      box(ctx, x, y + 3, w, h - 3, color, 1.2, INK, .8)
      ctx.fillStyle = "#e7d9b6"; ctx.fillRect(x + 1, y + h * .53, Math.max(1, w - 2), Math.max(2, h * .21))
    }
    function drawFurniture(ctx, obstacle, room) {
      const { x, y, width: w, height: h, type } = obstacle
      const medical = room.kind === "clinic", market = room.kind === "market"
      ctx.save(); ctx.translate(x, y)
      box(ctx, 3, 4, w - 2, h - 1, "#55432c38", 4, INK, 0)
      if (type === "bed") {
        box(ctx, 2, 1, w - 4, h - 2, medical ? "#a5aaa0" : "#82633f", 3)
        box(ctx, 5, 8, w - 10, h - 17, "#e2d6b6", 5, "#756c55", 1.6)
        box(ctx, 8, 12, w - 16, 22, "#eee3c5", 5, "#a09578", 1.3)
        inkLine(ctx, [[10, 18], [w / 2 - 3, 16]], "#fff2d6", 1.2)
        box(ctx, 7, 38, w - 14, h - 49, medical ? "#97b4a7" : "#758b73", 3, "#5d6551", 1.5)
        ctx.fillStyle = medical ? "#bdd0bb" : "#a5b18b"; ctx.fillRect(8, 38, w - 16, 9)
        inkLine(ctx, [[17, 51], [15, h - 22], [20, h - 15]], "#ced1ac77", 1.6)
        inkLine(ctx, [[w - 16, 51], [w - 22, 68], [w - 17, h - 14]], "#54644e77", 1.2)
        box(ctx, 3, h - 9, w - 6, 7, medical ? "#c3c4af" : "#9e7a4c", 1, INK, 1.6)
      } else if (type === "sofa") {
        box(ctx, 3, 4, w - 6, h - 8, "#536b56", 8, INK, 2.8)
        box(ctx, 4, 3, w - 8, 19, "#859379", 6)
        box(ctx, 13, 26, (w - 30) / 2, h - 37, "#92a080", 5, "#485440", 1.5)
        box(ctx, w / 2 + 2, 26, (w - 30) / 2, h - 37, "#849677", 5, "#485440", 1.5)
        box(ctx, 3, 24, 10, h - 34, "#72876b", 4); box(ctx, w - 13, 24, 10, h - 34, "#72876b", 4)
        inkLine(ctx, [[20, h - 26], [25, h - 29], [31, h - 25]], "#594e36", 1.3)
        inkLine(ctx, [[w - 27, 35], [w - 24, 46], [w - 27, 54]], "#bbc29a88", 1.2)
      } else if (type === "bath") {
        box(ctx, 2, 2, w - 4, h - 4, "#d6cfae", 18, INK, 2.8)
        box(ctx, 8, 9, w - 16, h - 18, "#99b3a7", 13, "#817b60", 1.5)
        box(ctx, 13, 15, w - 26, h - 29, "#b8c7b0", 10, "#d3dcc0", 1)
        oval(ctx, w / 2, h - 23, 3, 2, "#575f51")
        inkLine(ctx, [[w / 2, 4], [w / 2, 17], [w / 2 + 8, 17]], "#e9e5cc", 4)
        inkLine(ctx, [[w / 2, 4], [w / 2, 17], [w / 2 + 8, 17]], "#777c6b", 1)
        inkLine(ctx, [[14, 28], [17, 36], [14, 45]], "#6d968875", 1.5)
      } else if (type === "shelf") {
        box(ctx, 2, 1, w - 4, h - 3, medical ? "#778c7c" : "#8d754f", 2, INK, 2.6)
        for (let row = 0, py = 10; py < h - 14; row++, py += 24) {
          ctx.fillStyle = "#554b3866"; ctx.fillRect(7, py + 4, w - 14, 17)
          for (let col = 0, px = 10; px < w - 12; col++, px += 14) {
            // Looters left mostly empty, dusty shelves and a few overlooked
            // cans or medicine boxes; uniform fully stocked rows are gone.
            if ((row * 7 + col * 3 + Math.round(x + y)) % 7 < 4) continue
            const color = ["#bb7051", "#bcb079", "#8ca18a", "#d6c09a"][(row + col) % 4]
            if (medical) {
              box(ctx, px, py + 2 + (col % 2) * 2, 10, 14 - (col % 2) * 2, col % 2 ? "#bfc8a8" : "#e6d9b9", 1, "#514b3b", 1)
              ctx.fillStyle = col % 2 ? "#687f6f" : "#b77b61"; ctx.fillRect(px + 2, py + 8, 6, 2); ctx.fillRect(px + 4, py + 6, 2, 6)
            } else if (market) {
              oval(ctx, px + 4, py + 11, 5, 4, color, "#6f533b", .8); oval(ctx, px + 9, py + 6, 4, 3, color, "#6f533b", .8)
              inkLine(ctx, [[px + 5, py + 5], [px + 7, py + 2]], "#617448", 1.2)
            } else if ((row + col) % 2) drawBottle(ctx, px, py + 1, 8, 15, color)
            else { box(ctx, px, py + 4, 10, 12, color, 1, INK, .9); ctx.fillStyle = "#e9d7aa"; ctx.fillRect(px + 2, py + 8, 6, 3) }
          }
          box(ctx, 5, py + 18, w - 10, 4, medical ? "#b4bca3" : "#c09d63", 1, "#51422f", 1.2)
        }
        inkLine(ctx, [[5, 4], [w - 5, 4]], LIGHT, 1.4)
      } else if (type === "crate") {
        box(ctx, 3, 4, w - 6, h - 8, "#a28352", 2, INK, 2.5)
        ctx.fillStyle = "#765839"; ctx.fillRect(5, h - 17, w - 10, 10)
        for (let py = 16; py < h - 17; py += 15) inkLine(ctx, [[6, py], [w - 6, py + 1]], "#705239", 1.3)
        box(ctx, 6, 7, 7, h - 20, "#d0b17a", .5, "#674d33", 1.2); box(ctx, w - 13, 7, 7, h - 20, "#d0b17a", .5, "#674d33", 1.2)
        inkLine(ctx, [[14, 10], [w - 14, h - 19]], "#5c4430", 8); inkLine(ctx, [[14, 10], [w - 14, h - 19]], "#c5a46a", 5)
        for (const px of [9, w - 9]) for (const py of [11, h - 19]) oval(ctx, px, py, 1, 1, "#423b2f", INK, 0)
        box(ctx, w * .36, h * .29, 19, 12, "#d5c69f", .5, "#927b51", .8)
        inkLine(ctx, [[w * .36 + 3, h * .29 + 4], [w * .36 + 14, h * .29 + 4]], "#a68c64", 1)
      } else if (type === "elevator") {
        box(ctx, 2, 1, w - 4, h - 2, "#8d988d", 2, INK, 2.8)
        box(ctx, 8, 13, w - 23, h - 22, "#b3b7a6", 1, "#536053", 1.7)
        ctx.fillStyle = "#839586"; ctx.fillRect(9, 14, (w - 24) / 2, h - 24)
        inkLine(ctx, [[(w - 7) / 2, 15], [(w - 7) / 2, h - 10]], "#495a4a", 2)
        inkLine(ctx, [[13, 20], [13, h - 16]], "#d7d9ba", 2)
        box(ctx, w / 2 - 12, 3, 17, 7, "#303a2e", 1, INK, 1)
        ctx.fillStyle = "#64644b"; ctx.fillRect(w / 2 - 6, 5, 3, 3)
        box(ctx, w - 12, 31, 6, 18, "#b2b59c", 1, INK, 1)
        oval(ctx, w - 9, 36, 1.5, 1.5, "#665747", INK, .5); oval(ctx, w - 9, 43, 1.5, 1.5, "#57604b", INK, .5)
      } else if (type === "mailbox") {
        box(ctx, 2, 2, w - 4, h - 4, "#706f57", 2, INK, 2.5)
        const cw = (w - 12) / 3, ch = (h - 12) / 3
        for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
          const px = 6 + col * cw, py = 6 + row * ch
          box(ctx, px, py, cw - 2, ch - 2, (col + row) % 2 ? "#aeaf8d" : "#939e83", 1, "#484d3b", 1)
          inkLine(ctx, [[px + 3, py + 7], [px + cw - 5, py + 7]], "#414938", 2)
          oval(ctx, px + cw - 5, py + ch - 8, 1, 1, "#e1ca93", INK, .4)
        }
        box(ctx, w * .36, h * .64, 12, 7, "#e3d5ad", .5, "#8e886a", .8)
      } else if (type === "stair") {
        box(ctx, 2, 2, w - 4, h - 4, "#8e8e75", 1, INK, 2.8)
        for (let step = 0; step < 7; step++) {
          const py = 7 + step * (h - 14) / 7, sh = (h - 14) / 7
          ctx.fillStyle = step % 2 ? "#d1c5a2" : "#c2b997"; ctx.fillRect(7, py, w - 14, sh - 1)
          inkLine(ctx, [[8, py + sh - 2], [w - 8, py + sh - 2]], "#77715a", 2)
          inkLine(ctx, [[9, py + 1], [w - 9, py + 1]], "#eadabb", 1)
        }
        inkLine(ctx, [[5, 5], [5, h - 5]], "#554d37", 3); inkLine(ctx, [[w - 5, 5], [w - 5, h - 5]], "#554d37", 3)
      } else if (type === "planter") {
        box(ctx, 3, 2, w - 6, h - 4, "#a0764d", 7, INK, 2.6)
        box(ctx, 8, 7, w - 16, h - 14, "#796640", 5, "#c49861", 3)
        const random = speckleRandom(841 + Math.round(x + y))
        for (let i = 0; i < 9; i++) {
          const px = 15 + random() * (w - 30), py = 16 + random() * (h - 32)
          oval(ctx, px, py, 9, 6, "#647943", "#465b32", 1.2)
          oval(ctx, px - 3, py - 2, 5, 4, "#9aab58", "#698144", .9)
          inkLine(ctx, [[px - 3, py - 3], [px + 2, py + 3]], "#b1b975", 1)
        }
      } else if (type === "appliance") {
        box(ctx, 2, 2, w - 4, h - 4, "#899385", 3, INK, 2.6)
        if (market) {
          box(ctx, 7, 9, w - 14, h - 20, "#6d827b", 2, "#d1cfb1", 3)
          inkLine(ctx, [[w / 2, 10], [w / 2, h - 12]], "#c5c6a9", 3)
          for (let i = 0; i < 4; i++) box(ctx, 12 + (i % 2) * (w / 2 - 8), 21 + Math.floor(i / 2) * 26, w / 2 - 18, 17, i % 2 ? "#afbcaa" : "#c4c6a6", 2, "#526257", 1)
          inkLine(ctx, [[10, 13], [w / 2 - 7, h - 17]], "#dae1cf55", 2)
        } else {
          box(ctx, 8, 8, w - 16, h - 16, "#6e7c68", 2, "#56634e", 1.5)
          box(ctx, 13, 15, w - 26, 18, "#555e49", 1, INK, 1)
          for (let i = 0; i < 3; i++) box(ctx, 14 + i * 13, 39, 8, 13, i === 1 ? "#b37451" : "#bbc7a0", 1, INK, 1)
          ctx.fillStyle = "#d1b564"; ctx.beginPath(); ctx.moveTo(w / 2 + 3, 58); ctx.lineTo(w / 2 - 4, 68); ctx.lineTo(w / 2 + 1, 68); ctx.lineTo(w / 2 - 3, 77); ctx.lineTo(w / 2 + 7, 64); ctx.lineTo(w / 2 + 1, 64); ctx.closePath(); ctx.fill()
        }
      } else if (type === "counter" && room.kind === "residential") {
        box(ctx, 2, 2, w - 4, h - 4, "#d0bd93", 3, INK, 2.5)
        box(ctx, 5, 6, w - 10, 39, "#a9ada0", 1, "#746b51", 1.3)
        for (const px of [14, 30]) for (const py of [16, 34]) { oval(ctx, px, py, 6, 6, "#514e3e", INK, 1); oval(ctx, px, py, 3.5, 3.5, "#8a8772", INK, .8) }
        box(ctx, w - 27, 11, 17, 28, "#6f887d", 4, "#d1d1b5", 2)
        inkLine(ctx, [[w - 17, 6], [w - 17, 18], [w - 13, 18]], "#5a6a5c", 2.5)
        box(ctx, 7, 51, w - 14, h - 60, "#9a845e", 2, INK, 1.5)
        inkLine(ctx, [[15, 58], [w - 15, 58]], "#534737", 2.3)
      } else {
        // Desks, tills and workbenches have an actual work surface, front
        // panel and equipment; their silhouettes no longer rely on text.
        const bench = type === "workbench", reception = type === "reception", till = type === "counter" && (room.kind === "shop" || market)
        box(ctx, 3, 6, w - 6, h - 9, medical ? "#a4ae9b" : "#8b6c45", 2, INK, 2.5)
        box(ctx, 1, 2, w - 2, h - 20, medical ? "#d8d1b2" : bench ? "#aaa084" : "#c3a06a", 3, INK, 2.3)
        inkLine(ctx, [[5, 6], [w - 5, 6]], "#f1dcb0", 1.3)
        box(ctx, 10, h - 17, w - 20, 7, medical ? "#bfc3aa" : "#aa8854", 1, "#67583f", 1)
        inkLine(ctx, [[w / 2 - 8, h - 13], [w / 2 + 8, h - 13]], "#524637", 1.5)
        if (till && !market) {
          box(ctx, 11, 23, w - 22, 22, "#7b816e", 2, INK, 1.4)
          box(ctx, 17, 10, w - 34, 15, "#535e4b", 2, INK, 1.7); box(ctx, 20, 13, w - 40, 7, "#333e32", 1, INK, .8)
          for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) box(ctx, 16 + col * 7, 29 + row * 6, 4, 3, "#d7c69d", .6, INK, .4)
          box(ctx, w - 19, 45, 11, 15, "#c49b63", 1, INK, 1)
        } else if (till && market) {
          for (let row = 0; row < 2; row++) {
            box(ctx, 7, 12 + row * 26, w - 14, 23, "#8f7147", 1, INK, 1.2)
            for (let i = 0; i < 4; i++) { oval(ctx, 14 + i * 11, 24 + row * 26, 5, 4, row ? "#aaba68" : "#be7854", "#6b593b", .8); inkLine(ctx, [[14 + i * 11, 20 + row * 26], [16 + i * 11, 17 + row * 26]], "#657b48", 1) }
          }
        } else if (bench) {
          box(ctx, 8, 10, 20, 13, "#696f63", 2, INK, 1); oval(ctx, 18, 16, 5, 4, "#a4ab92", INK, 1)
          inkLine(ctx, [[15, 32], [38, 45]], "#554d3c", 5); inkLine(ctx, [[15, 32], [38, 45]], "#acb29a", 2.8)
          inkLine(ctx, [[w - 18, 30], [w - 23, 49]], "#ad8150", 4); inkLine(ctx, [[w - 25, 30], [w - 10, 33]], "#586154", 5)
          box(ctx, 10, 54, 17, 7, "#a76249", 1, INK, 1)
        } else {
          box(ctx, 9, 13, 24, 28, "#e2d5af", 1, "#8e7957", 1)
          for (let i = 0; i < 4; i++) inkLine(ctx, [[13, 19 + i * 5], [27, 19 + i * 5]], "#9c9578", .7)
          if (medical) { oval(ctx, w - 18, 22, 9, 7, "#d1d4bc", "#828771", 1); inkLine(ctx, [[w - 24, 24], [w - 12, 24]], "#9ca792", 1.5); drawBottle(ctx, w - 23, 42, 10, 18, "#8ba494") }
          else {
            box(ctx, w - 30, 12, 23, 19, "#566754", 2, INK, 1.5); box(ctx, w - 27, 15, 17, 11, "#2f3a2f", 1, INK, .5)
            inkLine(ctx, [[w - 19, 31], [w - 19, 35], [w - 25, 35], [w - 13, 35]], "#5a604c", 2)
            box(ctx, w - 28, 41, 25, 10, "#958871", 1, INK, 1); inkLine(ctx, [[w - 25, 44], [w - 6, 44]], "#d2c6a2", 1)
          }
          if (reception) { box(ctx, 8, 49, 12, 9, "#748b64", 2, INK, 1); oval(ctx, 14, 46, 7, 5, "#9ba963", "#5b7345", 1) }
        }
      }
      weatherFurniture(ctx, obstacle, room)
      ctx.restore()
    }
    function weatherFurniture(ctx, obstacle, room) {
      const { width: w, height: h, type, x, y } = obstacle
      const random = speckleRandom(Math.round(x * 19 + y * 7 + w))
      ctx.save(); ctx.beginPath(); ctx.rect(2, 2, w - 4, h - 4); ctx.clip()
      for (let mark = 0; mark < 11; mark++) {
        const px = 5 + random() * Math.max(1, w - 10), py = 5 + random() * Math.max(1, h - 10)
        oval(ctx, px, py, 1 + random() * 3, .6 + random() * 2, mark % 2 ? "#443c2b30" : "#d0b68530", INK, 0)
      }
      inkLine(ctx, [[9, h - 13], [w * .40, h - 14], [w * .46, h - 10], [w - 8, h - 13]], "#604f3866", 1.1)
      if (type === "bed" || type === "sofa") {
        const px = w * .41, py = type === "bed" ? h * .64 : h * .55
        ctx.fillStyle = "#3f4631"; ctx.beginPath(); ctx.moveTo(px - 10, py); ctx.lineTo(px - 4, py - 6); ctx.lineTo(px + 2, py - 3); ctx.lineTo(px + 11, py - 7); ctx.lineTo(px + 8, py + 4); ctx.lineTo(px + 2, py + 1); ctx.lineTo(px - 8, py + 7); ctx.closePath(); ctx.fill()
        inkLine(ctx, [[px - 7, py + 3], [px - 3, py + 1], [px + 1, py + 4], [px + 5, py + 1]], "#bcad7e", 2)
        oval(ctx, w - 20, type === "bed" ? 26 : 14, 8, 4, "#6f603848", INK, 0)
        if (room.kind === "clinic") { oval(ctx, 18, 48, 8, 5, "#81543b6e", INK, 0); oval(ctx, 27, 54, 3, 2, "#68402d63", INK, 0) }
      } else if (type === "bath") {
        oval(ctx, w * .58, h * .56, w * .27, h * .20, "#6774508c", INK, 0)
        for (let chip = 0; chip < 4; chip++) oval(ctx, 17 + chip * 11, h - 12, 3, 2, "#4f5e3d99", INK, 0)
        inkLine(ctx, [[w - 15, 8], [w - 22, 15], [w - 19, 22]], "#6c7254", 1.3)
      } else if (type === "shelf") {
        box(ctx, 6, 14, Math.max(6, w - 15), 7, "#4f442d66", 1, INK, 0)
        inkLine(ctx, [[w - 11, 28], [w - 8, 38], [w - 13, 47]], "#423e29", 2)
        inkLine(ctx, [[w - 12, 29], [w - 10, 37]], "#c3a06d", .8)
        box(ctx, 13, h - 21, 13, 9, "#b9ac7c", 1, "#5d5038", .9)
        inkLine(ctx, [[15, h - 17], [24, h - 14]], "#6a6850", 1)
      } else if (type === "crate") {
        ctx.fillStyle = "#443d2a"; ctx.beginPath(); ctx.moveTo(14, 29); ctx.lineTo(w - 15, 24); ctx.lineTo(w - 17, 37); ctx.lineTo(w * .55, 34); ctx.lineTo(w * .50, 39); ctx.lineTo(16, 37); ctx.closePath(); ctx.fill()
        inkLine(ctx, [[18, 25], [w - 20, 28]], "#c3a471", 1.5)
        inkLine(ctx, [[w * .5, 18], [w * .56, 30], [w * .53, 38]], "#51432d", 1.5)
      } else if (type === "elevator") {
        inkLine(ctx, [[14, 35], [w - 25, h - 20]], "#493a27", 9); inkLine(ctx, [[14, 35], [w - 25, h - 20]], "#ae8552", 6)
        inkLine(ctx, [[w - 23, 39], [15, h - 19]], "#3e392a", 7); inkLine(ctx, [[w - 23, 39], [15, h - 19]], "#baa367", 4)
        for (let stripe = 0; stripe < 5; stripe++) inkLine(ctx, [[17 + stripe * 9, 47 + stripe * 3], [20 + stripe * 9, 52 + stripe * 3]], "#514534", 2)
        inkLine(ctx, [[w / 2, 15], [w / 2 + 5, 25], [w / 2 + 1, 34]], "#393e2e", 2)
      } else if (type === "mailbox") {
        box(ctx, 9, 10, Math.max(11, w * .25), 12, "#414931", 1, INK, .8)
        inkLine(ctx, [[10, 21], [w * .31, 24], [w * .28, 31]], "#b8b28a", 3)
        box(ctx, w * .53, h * .53, 14, 10, "#d0bd91", .5, "#877b59", .6)
      } else if (type === "stair") {
        inkLine(ctx, [[w * .37, h * .46], [w * .43, h * .53], [w * .39, h * .62], [w * .51, h * .71]], "#6a624b", 1.4)
        box(ctx, 11, h - 23, 12, 5, "#918970", 1, "#5c553d", 1)
        box(ctx, 24, h - 20, 8, 4, "#b5a17b", 1, "#5c553d", .8)
      } else if (type === "planter") {
        for (let weed = 0; weed < 4; weed++) inkLine(ctx, [[17 + weed * 10, h - 15], [14 + weed * 10, h - 30], [18 + weed * 10, h - 42]], "#947b44", 1.6)
        inkLine(ctx, [[w - 11, 13], [w - 19, 24], [w - 15, 37]], "#63472d", 1.3)
      } else {
        // Broken screens and peeled warning labels communicate the power
        // outage even at mobile scale, without adding a UI status banner.
        if (["desk", "reception", "counter", "appliance"].includes(type)) {
          const px = type === "appliance" ? w / 2 : w - 23
          inkLine(ctx, [[px - 5, 15], [px - 1, 20], [px - 4, 23], [px + 4, 28]], "#939d806f", 1)
        }
        if (type === "appliance") {
          box(ctx, 7, h - 21, 18, 12, "#b1a266", 1, "#5b4d33", .8)
          ctx.fillStyle = "#56492d"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center"; ctx.fillText("!", 16, h - 12)
          inkLine(ctx, [[w - 10, h - 28], [w - 17, h - 19], [w - 12, h - 10]], "#3b4534", 2)
          oval(ctx, 12, 13, 5, 4, "#8e674354", INK, 0)
        }
        inkLine(ctx, [[11, 47], [16, 52], [13, 58]], "#624f35", 1)
      }
      ctx.restore()
    }
    function drawStaticInterior(ctx, room, frame) {
      const fx = frame.minX ?? frame.x, fy = frame.minY ?? frame.y
      ctx.fillStyle = "#bdad83"; ctx.fillRect(fx, fy, frame.width, frame.height)
      drawFloor(ctx, room, { x: fx + 16, y: fy + 16, width: frame.width - 32, height: frame.height - 32, name: "" }, 47)
      for (const [index, area] of (room.rooms || []).entries()) drawFloor(ctx, room, area, index)
      // Door thresholds are floor strips, with jambs only at their ends.
      // In particular the south perimeter is genuinely interrupted by its
      // 88px entrance instead of painting a shut wall under a glowing panel.
      for (const door of room.doors || []) {
        ctx.fillStyle = "#b49d75"; ctx.fillRect(door.x, door.y, door.width, door.height)
        if (door.side === "interior") {
          inkLine(ctx, [[door.x + 1, door.y + 4], [door.x + door.width - 1, door.y + 4]], "#806442", 3)
          inkLine(ctx, [[door.x + 1, door.y + door.height - 4], [door.x + door.width - 1, door.y + door.height - 4]], "#806442", 3)
        } else {
          inkLine(ctx, [[door.x + 2, door.y + 3], [door.x + 2, door.y + door.height - 3]], "#785f41", 3)
          inkLine(ctx, [[door.x + door.width - 2, door.y + 3], [door.x + door.width - 2, door.y + door.height - 3]], "#785f41", 3)
        }
      }
      for (const wall of room.walls || []) drawWall(ctx, wall, room)
      for (const obstacle of room.obstacles || []) if (obstacle.type === "wall" || obstacle.type === "fence") drawWall(ctx, obstacle, room)
      for (const [index, window] of (room.windows || []).entries()) {
        const { x, y, width: w, height: h } = window
        box(ctx, x, y, w, h, "#394436", 1, "#584633", 2.3)
        ctx.fillStyle = "#a5b59c"; ctx.beginPath(); ctx.moveTo(x + 2, y + 3); ctx.lineTo(x + w - 3, y + 3); ctx.lineTo(x + w - 4, y + 12); ctx.lineTo(x + 5, y + 9); ctx.lineTo(x + 3, y + 17); ctx.closePath(); ctx.fill()
        ctx.beginPath(); ctx.moveTo(x + 3, y + h - 3); ctx.lineTo(x + w - 3, y + h - 3); ctx.lineTo(x + w - 3, y + h - 13); ctx.lineTo(x + 5, y + h - 8); ctx.lineTo(x + 2, y + h - 16); ctx.closePath(); ctx.fill()
        inkLine(ctx, [[x + 2, y + h / 2], [x + w - 2, y + h / 2]], "#635943", 2)
        inkLine(ctx, [[x + 5, y + 5], [x + w - 4, y + 12]], "#e4e1bf", 1.2)
        if (index % 2) { inkLine(ctx, [[x + 2, y + 12], [x + w - 2, y + 25]], "#4e3e2a", 6); inkLine(ctx, [[x + 2, y + 12], [x + w - 2, y + 25]], "#a17c4c", 3.5) }
        for (let shard = 0; shard < 3; shard++) {
          const direction = window.side === "west" ? 1 : -1, sx = x + w / 2 + direction * (11 + shard * 5), sy = y + 14 + shard * 9
          ctx.fillStyle = "#acba9a99"; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 5, sy + 3); ctx.lineTo(sx + 1, sy + 7); ctx.closePath(); ctx.fill()
        }
      }
      const hazard = room.kind === "clinic" || room.kind === "apartment"
      if (hazard) {
        const noticeX = fx + frame.width - 113, noticeY = fy + frame.height - 13
        box(ctx, noticeX, noticeY, 81, 10, "#b5a66f", 0, "#564a2e", .8)
        ctx.save(); ctx.beginPath(); ctx.rect(noticeX, noticeY, 81, 10); ctx.clip()
        for (let stripe = 0; stripe < 8; stripe++) inkLine(ctx, [[noticeX + stripe * 14, noticeY + 10], [noticeX + stripe * 14 + 10, noticeY]], "#494331", 5)
        ctx.restore()
      }
      for (const obstacle of room.obstacles || []) if (!["wall", "fence", "perimeter"].includes(obstacle.type)) drawFurniture(ctx, obstacle, room)
      // Small worn room plates replace the previous floor-sized UI labels.
      ctx.font = "9px Microsoft YaHei, sans-serif"; ctx.textAlign = "left"
      for (const area of room.rooms || []) if (area.name && !/大厅|入口/.test(area.name)) {
        const labelWidth = Math.min(area.width - 20, Math.max(33, ctx.measureText(area.name).width + 12))
        box(ctx, area.x + 11, area.y + 8, labelWidth, 14, "#e0d0aabf", 1.5, "#95835b80", .8)
        ctx.fillStyle = "#6b6045"; ctx.fillText(area.name, area.x + 17, area.y + 18)
      }
      const plaqueWidth = Math.min(150, frame.width - 48)
      box(ctx, fx + 22, fy + 2, plaqueWidth, 12, "#b9a171", 1.5, "#776143", 1)
      ctx.fillStyle = "#645136"; ctx.font = "bold 8px Microsoft YaHei, sans-serif"; ctx.textAlign = "center"; ctx.fillText(room.name, fx + 22 + plaqueWidth / 2, fy + 11)
      if (room.ruined) {
        for (let index = 0; index < 3; index++) {
          const px = fx + 28 + index * (frame.width - 70) / 3, py = fy + 27 + index * 9
          inkLine(ctx, [[px, py], [px + 7, py + 10], [px + 3, py + 16], [px + 13, py + 24]], "#817354", 1.3)
          box(ctx, px + 12, py + 26, 8, 4, "#ab9770", 1, "#746748", .7)
        }
      }
    }
    function drawSearchContainer(ctx, container) {
      const x = container.x - 24, y = container.y - 18, searched = container.searched
      ctx.save(); ctx.translate(x, y)
      oval(ctx, 27, 33, 25, 6, "#5e4b3030", INK, 0)
      box(ctx, 0, 5, 48, 31, searched ? "#897852" : "#b1955d", 3, INK, 2.3)
      box(ctx, 4, 8, 40, 20, searched ? "#655d43" : "#c5ab75", 1, "#6b5537", 1.3)
      if (searched) {
        // An open lid and empty dark compartment visibly persist after search.
        box(ctx, 0, -7, 48, 16, "#a38b5a", 2, INK, 2)
        inkLine(ctx, [[4, -2], [43, -2]], "#cdb57e", 1.2)
        box(ctx, 15, 14, 10, 8, "#b8b092", 1, "#7e7961", .7)
        inkLine(ctx, [[29, 19], [33, 23], [41, 14]], "#c1c9a0", 2)
      } else {
        for (const px of [8, 34]) { box(ctx, px, 3, 6, 30, "#6b7957", 1, INK, 1.3); inkLine(ctx, [[px + 2, 5], [px + 2, 30]], "#a8b083", 1) }
        box(ctx, 20, 14, 8, 10, "#d1bd83", 1, INK, 1)
        box(ctx, 39, 5, 6, 8, "#b9754f", 1, INK, .9)
        inkLine(ctx, [[-4, -1], [-4, -7]], "#f4d684", 1.6); inkLine(ctx, [[-7, -4], [-1, -4]], "#f4d684", 1.6)
      }
      inkLine(ctx, [[4, 32], [44, 32]], "#6c5237", 1.1); ctx.restore()
    }
    function drawRoom(ctx, room) {
      const { minX, minY, maxX, maxY } = room.bounds
      const frame = room.worldBounds || { minX: minX - 34, minY: minY - 34, width: maxX - minX + 68, height: maxY - minY + 68 }
      const fx = frame.minX ?? frame.x, fy = frame.minY ?? frame.y
      // The floor plan sits as a raised block on the street, not a flat decal.
      ctx.fillStyle = "rgba(24,20,12,0.30)"; ctx.fillRect(fx + 12, fy + 16, frame.width, frame.height)
      ctx.save(); ctx.beginPath(); ctx.rect(fx, fy, frame.width, frame.height); ctx.clip()
      ctx.fillStyle = "#bdad83"; ctx.fillRect(fx, fy, frame.width, frame.height)
      let cache = interiorCache.get(room)
      if (!cache && global.document?.createElement) {
        const canvas = global.document.createElement("canvas")
        canvas.width = Math.ceil(frame.width); canvas.height = Math.ceil(frame.height)
        const drawing = canvas.getContext?.("2d")
        if (drawing) {
          drawing.save(); drawing.translate(-fx, -fy); drawStaticInterior(drawing, room, frame); drawing.restore()
          cache = { canvas, width: frame.width, height: frame.height }; interiorCache.set(room, cache)
        }
      }
      if (cache) ctx.drawImage(cache.canvas, fx, fy, cache.width, cache.height)
      else drawStaticInterior(ctx, room, frame)
      // Search state changes during a run, so it is never baked into the cache.
      for (const container of room.containers || []) drawSearchContainer(ctx, container)
      ctx.restore()
    }
    return Object.freeze({ houses: Object.freeze(houses), getNearbyEntrance, createRoom, move, isFree, segmentHitFraction, steer, getNearbySearch, nearExit, getInvasionEntrances, getRandomInvasionEntry, isInvasionEntry, drawRoom })
  }
  global.WASTELAND_HOUSES = Object.freeze({ create })
})(window)
