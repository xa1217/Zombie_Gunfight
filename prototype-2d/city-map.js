// Ground textures are baked once. Tall scenery shares the actors' depth order.
(function (global) {
  "use strict"

  const GRID = 40
  const MARGIN = 24
  const NAV_RADIUS = 24
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

  function create(width = 1440, height = 2560, art = null) {
    width = Math.max(720, Number.isFinite(width) ? width : 1440)
    height = Math.max(1280, Number.isFinite(height) ? height : 2560)
    const sx = width / 1440
    const sy = height / 2560
    const vertical = [720].map(value => value * sx)
    const horizontal = [836, 1668].map(value => value * sy)
    const roadX = 120 * sx
    const roadY = 112 * sy
    const sidewalkX = 22 * sx
    const sidewalkY = 22 * sy
    const buildings = []
    const blocks = []
    // Houses grow within six plots; the world and actors retain their scale.
    // Leave a full actor-width verge above the first row so the new north
    // entrances have a real street landing even for radius-24 infected.
    const rows = [[104, 760], [936, 1570], [1776, 2416]]
    const columns = [[80, 628], [812, 1360]]
    const district = [
      { kind: "residential", houseType: "courtyard", width: 480, height: 656 },
      { kind: "shop", houseType: "bungalow", width: 500, height: 624 },
      { kind: "apartment", houseType: "floor", width: 488, height: 596, floors: 4 },
      { kind: "market", houseType: "bungalow", width: 500, height: 608 },
      { kind: "clinic", houseType: "bungalow", width: 456, height: 624, ruined: true },
      { kind: "warehouse", houseType: "bungalow", width: 500, height: 632 }
    ]
    let serial = 0

    function addBuilding(x, y, w, h, kind, houseType = "bungalow", floors = 1, ruined = false, plot = null) {
      const variant = serial++
      const roomScale = ({ warehouse: 1.18, market: 1.12, shop: 1.08, clinic: 1.1, garage: 1.08, apartment: 1.12, residential: 1.04 }[kind] || 1) * (houseType === "floor" ? 1.08 : houseType === "courtyard" ? 1.05 : 1)
      const roofShape = houseType === "courtyard" ? "courtyard" : houseType === "floor" || ["warehouse", "clinic", "garage"].includes(kind) ? "flat" : variant % 3 === 0 ? "gable" : "hip"
      const exterior = Object.freeze({ roofShape, wallInset: houseType === "courtyard" ? 12 : 8, facadeWindows: Math.max(2, Math.floor(w / 72)), doorWidth: 88, yard: houseType === "courtyard", ruined })
      const footprint = Object.freeze({ x: x * sx, y: y * sy, width: w * sx, height: h * sy })
      buildings.push(Object.freeze({ ...footprint, footprint, kind, category: kind, variant, houseType, floors, ruined, roomScale, exterior, plotId: plot?.id, plot }))
    }

    rows.forEach(([top, bottom], row) => {
      columns.forEach(([left, right], col) => {
        const plot = Object.freeze({ id: `block-${row}-${col}`, x: left * sx, y: top * sy, width: (right - left) * sx, height: (bottom - top) * sy, row, column: col })
        blocks.push(plot)
        const plan = district[row * columns.length + col]
        const x = (left + right - plan.width) / 2
        const y = (top + bottom - plan.height) / 2
        addBuilding(x, y, plan.width, plan.height, plan.kind, plan.houseType, plan.floors || 1, Boolean(plan.ruined), plot)
      })
    })

    function circleHitsRect(x, y, radius, rect) {
      const dx = x - clamp(x, rect.x, rect.x + rect.width)
      const dy = y - clamp(y, rect.y, rect.y + rect.height)
      return dx * dx + dy * dy < radius * radius - 0.000001
    }

    function isFree(x, y, radius = 20) {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius < 0) return false
      if (x < MARGIN + radius || y < MARGIN + radius || x > width - MARGIN - radius || y > height - MARGIN - radius) return false
      for (const building of buildings) {
        if (x + radius < building.x || x - radius > building.x + building.width || y + radius < building.y || y - radius > building.y + building.height) continue
        if (circleHitsRect(x, y, radius, building)) return false
        if (radius === 0 && x > building.x && x < building.x + building.width && y > building.y && y < building.y + building.height) return false
      }
      return true
    }

    function move(entity, dx, dy) {
      const radius = Number.isFinite(entity.radius) ? Math.max(0, entity.radius) : 20
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / Math.max(8, radius / 2)))
      const stepX = dx / steps
      const stepY = dy / steps
      for (let step = 0; step < steps; step += 1) {
        for (const axis of ["x", "y"]) {
          const amount = axis === "x" ? stepX : stepY
          if (!amount) continue
          const start = entity[axis]
          const maximum = (axis === "x" ? width : height) - MARGIN - radius
          const end = clamp(start + amount, MARGIN + radius, maximum)
          const free = value => isFree(axis === "x" ? value : entity.x, axis === "y" ? value : entity.y, radius)
          if (free(end)) entity[axis] = end
          else {
            // Find the wall contact within this small step, then slide on the other axis.
            let low = 0
            let high = 1
            for (let iteration = 0; iteration < 9; iteration += 1) {
              const middle = (low + high) / 2
              if (free(start + (end - start) * middle)) low = middle
              else high = middle
            }
            entity[axis] = start + (end - start) * low
          }
        }
      }
    }

    function pointToSegmentSquared(px, py, ax, ay, bx, by) {
      const dx = bx - ax
      const dy = by - ay
      const length = dx * dx + dy * dy
      const progress = length ? clamp(((px - ax) * dx + (py - ay) * dy) / length, 0, 1) : 0
      const x = px - ax - progress * dx
      const y = py - ay - progress * dy
      return x * x + y * y
    }

    function segmentIntersectsRect(ax, ay, bx, by, rect) {
      let first = 0
      let last = 1
      for (const [start, delta, min, max] of [[ax, bx - ax, rect.x, rect.x + rect.width], [ay, by - ay, rect.y, rect.y + rect.height]]) {
        if (Math.abs(delta) < 0.000001) {
          if (start < min || start > max) return false
        } else {
          const a = (min - start) / delta
          const b = (max - start) / delta
          first = Math.max(first, Math.min(a, b))
          last = Math.min(last, Math.max(a, b))
          if (first > last) return false
        }
      }
      return true
    }

    function lineIsFree(ax, ay, bx, by, radius = NAV_RADIUS) {
      if (!isFree(ax, ay, radius) || !isFree(bx, by, radius)) return false
      const left = Math.min(ax, bx) - radius
      const right = Math.max(ax, bx) + radius
      const top = Math.min(ay, by) - radius
      const bottom = Math.max(ay, by) + radius
      const radiusSquared = radius * radius - 0.000001
      for (const building of buildings) {
        if (right < building.x || left > building.x + building.width || bottom < building.y || top > building.y + building.height) continue
        if (segmentIntersectsRect(ax, ay, bx, by, building)) return false
        for (const x of [building.x, building.x + building.width]) {
          for (const y of [building.y, building.y + building.height]) {
            if (pointToSegmentSquared(x, y, ax, ay, bx, by) < radiusSquared) return false
          }
        }
      }
      return true
    }

    // Grid nodes sit on multiples of 40 so the 64-pixel block alleys have a node
    // down their centre. Each edge is checked once against the actual buildings.
    const gridWidth = Math.floor(width / GRID) + 1
    const gridHeight = Math.floor(height / GRID) + 1
    const gridSize = gridWidth * gridHeight
    const walkable = new Uint8Array(gridSize)
    const links = Array.from({ length: gridSize }, () => [])
    const flow = new Int32Array(gridSize)
    const queue = new Int32Array(gridSize)
    const point = index => ({ x: index % gridWidth * GRID, y: Math.floor(index / gridWidth) * GRID })
    const cell = (x, y) => clamp(Math.round(y / GRID), 0, gridHeight - 1) * gridWidth + clamp(Math.round(x / GRID), 0, gridWidth - 1)
    for (let index = 0; index < gridSize; index += 1) {
      const p = point(index)
      walkable[index] = isFree(p.x, p.y, NAV_RADIUS) ? 1 : 0
    }
    for (let index = 0; index < gridSize; index += 1) {
      if (!walkable[index]) continue
      const p = point(index)
      for (const next of [index + 1, index + gridWidth]) {
        if (next >= gridSize || !walkable[next] || next === index + 1 && Math.floor(next / gridWidth) !== Math.floor(index / gridWidth)) continue
        const n = point(next)
        if (lineIsFree(p.x, p.y, n.x, n.y)) {
          links[index].push(next)
          links[next].push(index)
        }
      }
    }
    let navigationCell = -1
    flow.fill(-1)

    function updateNavigation(targetX, targetY) {
      const targetCell = cell(targetX, targetY)
      if (targetCell === navigationCell) return
      navigationCell = targetCell
      let origin = targetCell
      if (!walkable[origin]) {
        let best = Infinity
        for (let index = 0; index < gridSize; index += 1) {
          if (!walkable[index]) continue
          const p = point(index)
          const distance = (p.x - targetX) ** 2 + (p.y - targetY) ** 2
          if (distance < best) { best = distance; origin = index }
        }
      }
      flow.fill(-1)
      if (!walkable[origin]) return
      let head = 0
      let tail = 1
      queue[0] = origin
      flow[origin] = 0
      while (head < tail) {
        const index = queue[head++]
        for (const next of links[index]) {
          if (flow[next] !== -1) continue
          flow[next] = flow[index] + 1
          queue[tail++] = next
        }
      }
    }

    function steer(x, y, targetX, targetY, radius = NAV_RADIUS) {
      radius = Number.isFinite(radius) ? Math.max(0, radius) : NAV_RADIUS
      if (lineIsFree(x, y, targetX, targetY, radius)) return { x: targetX, y: targetY }
      if (!isFree(targetX, targetY, radius)) {
        // A larger infected can reach contact range even when the survivor is
        // standing closer to a wall than that infected's own collision radius.
        const length = Math.hypot(x - targetX, y - targetY)
        const stop = Math.min(length, radius * 1.5)
        if (length > 0) {
          const approach = { x: targetX + (x - targetX) / length * stop, y: targetY + (y - targetY) / length * stop }
          if (lineIsFree(x, y, approach.x, approach.y, radius)) return approach
        }
      }
      updateNavigation(targetX, targetY)
      const center = cell(x, y)
      const centerCol = center % gridWidth
      const centerRow = Math.floor(center / gridWidth)
      let bestPoint = null
      let bestScore = Infinity
      // Local flow samples also recover when the nearest node sits inside a wall.
      for (let range = 1; range <= 2 && !bestPoint; range += 1) {
        for (let row = Math.max(0, centerRow - range); row <= Math.min(gridHeight - 1, centerRow + range); row += 1) {
          for (let col = Math.max(0, centerCol - range); col <= Math.min(gridWidth - 1, centerCol + range); col += 1) {
            const index = row * gridWidth + col
            if (flow[index] < 0) continue
            const p = point(index)
            const distance = Math.hypot(p.x - x, p.y - y)
            const score = flow[index] * GRID + distance * .7
            if (score >= bestScore || !lineIsFree(x, y, p.x, p.y, radius)) continue
            bestScore = score
            bestPoint = p
          }
        }
      }
      return bestPoint || { x, y }
    }

    const terrain = document.createElement("canvas")
    terrain.width = width
    terrain.height = height
    const ctx = terrain.getContext("2d")
    const scenery = []
    const scale = Math.min(sx, sy)
    let seed = 81427
    const random = () => {
      seed = Math.imul(seed, 1664525) + 1013904223 | 0
      return (seed >>> 0) / 4294967296
    }
    const ink = "#483c28"

    function polygon(context, points, fill, stroke = null, thickness = 2) {
      context.beginPath()
      points.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y))
      context.closePath()
      if (fill) { context.fillStyle = fill; context.fill() }
      if (stroke) { context.strokeStyle = stroke; context.lineWidth = thickness; context.stroke() }
    }

    function line(context, ax, ay, bx, by, color, thickness = 2) {
      context.strokeStyle = color
      context.lineWidth = thickness
      context.lineCap = "round"
      context.beginPath(); context.moveTo(ax, ay); context.lineTo(bx, by); context.stroke()
    }

    function oval(context, x, y, rx, ry, fill, stroke = null, thickness = 2) {
      context.beginPath(); context.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
      if (fill) { context.fillStyle = fill; context.fill() }
      if (stroke) { context.strokeStyle = stroke; context.lineWidth = thickness; context.stroke() }
    }

    function rect(context, x, y, w, h, fill, stroke = null, thickness = 2) {
      context.fillStyle = fill; context.fillRect(x, y, w, h)
      if (stroke) { context.strokeStyle = stroke; context.lineWidth = thickness; context.strokeRect(x, y, w, h) }
    }

    function grass(x, y, size = 5, dark = false) {
      const green = dark ? "#667735" : "#829536"
      polygon(ctx, [[x - size, y + 3], [x - size * .7, y - size], [x - 1, y], [x + 1, y - size * 1.2], [x + 3, y], [x + size, y - size * .4], [x + size, y + 3]], green)
      line(ctx, x - size, y + 4, x + size, y + 3, "#637233", 1)
    }

    // Warm dirt covers most of the old streets. Tarmac survives in irregular
    // islands, like worn paint, rather than a flat grey city grid.
    rect(ctx, 0, 0, width, height, "#c2b16c")
    for (let i = 0; i < 2100; i += 1) {
      const x = random() * width
      const y = random() * height
      oval(ctx, x, y, 4 + random() * 13, 2 + random() * 8, i % 3 ? "#e0cd8d35" : "#9e8a4b25")
    }

    const allGreen = [...blocks]
    rows.forEach(([top, bottom]) => {
      allGreen.push({ x: 28 * sx, y: top * sy, width: 42 * sx, height: (bottom - top) * sy })
      allGreen.push({ x: 1370 * sx, y: top * sy, width: 42 * sx, height: (bottom - top) * sy })
    })
    for (const block of allGreen) {
      const points = []
      const jitter = 5 * scale
      for (let x = block.x; x < block.x + block.width; x += 12 * sx) points.push([x, block.y + (random() - .5) * jitter])
      for (let y = block.y; y < block.y + block.height; y += 12 * sy) points.push([block.x + block.width + (random() - .5) * jitter, y])
      for (let x = block.x + block.width; x > block.x; x -= 12 * sx) points.push([x, block.y + block.height + (random() - .5) * jitter])
      for (let y = block.y + block.height; y > block.y; y -= 12 * sy) points.push([block.x + (random() - .5) * jitter, y])
      polygon(ctx, points, "#98a748", "#687632", 3 * scale)
      // Broad, faint brush strokes; there is no rectangular tile grid.
      for (let i = 0; i < 15; i += 1) {
        oval(ctx, block.x + 8 + random() * Math.max(1, block.width - 16), block.y + 8 + random() * Math.max(1, block.height - 16), 9 + random() * 17, 4 + random() * 8, "#b9bd563d")
      }
      for (let x = block.x + 4; x < block.x + block.width; x += 15 * sx) {
        grass(x + (random() - .5) * 4, block.y - 1, 3 * scale)
        grass(x, block.y + block.height + 1, 3 * scale)
      }
      for (let y = block.y + 7; y < block.y + block.height; y += 16 * sy) {
        grass(block.x, y, 3 * scale)
        grass(block.x + block.width, y, 3 * scale)
      }
    }

    // Wide cracked sandstone pavements join continuously at each intersection.
    for (const x of vertical) rect(ctx, x - roadX / 2 - sidewalkX, 0, roadX + sidewalkX * 2, height, "#dac780")
    for (const y of horizontal) rect(ctx, 0, y - roadY / 2 - sidewalkY, width, roadY + sidewalkY * 2, "#dac780")
    for (const x of vertical) rect(ctx, x - roadX / 2 - 3 * sx, 0, roadX + 6 * sx, height, "#a28e55")
    for (const y of horizontal) rect(ctx, 0, y - roadY / 2 - 3 * sy, width, roadY + 6 * sy, "#a28e55")
    for (const x of vertical) rect(ctx, x - roadX / 2, 0, roadX, height, "#c7b777")
    for (const y of horizontal) rect(ctx, 0, y - roadY / 2, width, roadY, "#c7b777")
    function wornRoadPatch(x, y, rx, ry, fill) {
      const points = []
      for (let edge = 0; edge < 14; edge += 1) {
        const angle = edge / 14 * Math.PI * 2
        const roughness = .74 + random() * .28
        points.push([x + Math.cos(angle) * rx * roughness, y + Math.sin(angle) * ry * roughness])
      }
      polygon(ctx, points, fill)
    }
    for (const x of vertical) {
      for (let y = 42; y < height; y += 116 * sy) {
        const patchX = x + (random() - .5) * 65 * sx
        wornRoadPatch(patchX, y, (12 + random() * 18) * sx, (18 + random() * 25) * sy, "#8c816353")
        wornRoadPatch(x + (random() - .5) * 85 * sx, y + 55 * sy, (17 + random() * 15) * sx, (7 + random() * 8) * sy, "#e2ce903d")
      }
    }
    for (const y of horizontal) {
      for (let x = 55; x < width; x += 143 * sx) {
        wornRoadPatch(x, y + (random() - .5) * 60 * sy, (21 + random() * 20) * sx, (10 + random() * 13) * sy, "#8c81634b")
        wornRoadPatch(x + 71 * sx, y + (random() - .5) * 90 * sy, (15 + random() * 15) * sx, (8 + random() * 7) * sy, "#e9d39436")
      }
    }
    // Weathered shoulders erase the perfectly straight road edge in little chips.
    for (const x of vertical) {
      for (let y = 8; y < height; y += 22 * sy) {
        for (const side of [-1, 1]) {
          if (horizontal.some(cross => Math.abs(cross - y) < roadY / 2 + sidewalkY)) continue
          const edge = x + side * roadX / 2
          polygon(ctx, [[edge - side * (3 + random() * 6) * sx, y], [edge + side * 2 * sx, y - 4 * sy], [edge + side * 6 * sx, y + 8 * sy], [edge - side * 3 * sx, y + 14 * sy]], "#dbc77e")
          line(ctx, edge + side * 11 * sx, y + 3 * sy, edge + side * 15 * sx, y + 8 * sy, "#aa945c", 1.4 * scale)
        }
      }
    }
    for (const y of horizontal) {
      for (let x = 8; x < width; x += 24 * sx) {
        for (const side of [-1, 1]) {
          if (vertical.some(cross => Math.abs(cross - x) < roadX / 2 + sidewalkX)) continue
          const edge = y + side * roadY / 2
          polygon(ctx, [[x, edge - side * 4 * sy], [x - 4 * sx, edge + side * 2 * sy], [x + 11 * sx, edge + side * 5 * sy], [x + 18 * sx, edge - side * 3 * sy]], "#dbc77e")
        }
      }
    }
    for (const x of vertical) {
      for (let y = 26; y < height - 26; y += 53 * sy) {
        if (horizontal.some(cross => Math.abs(cross - y) < roadY / 2 + 44 * sy)) continue
        rect(ctx, x - 3 * sx, y, 4 * sx, 26 * sy, "#e2ca823d")
        if (Math.round(y / sy) % 3) rect(ctx, x + 34 * sx, y + 5 * sy, 2 * sx, 20 * sy, "#c7be955e")
      }
    }
    for (const y of horizontal) {
      for (let x = 26; x < width - 26; x += 53 * sx) {
        if (vertical.some(cross => Math.abs(cross - x) < roadX / 2 + 44 * sx)) continue
        rect(ctx, x, y - 2 * sy, 26 * sx, 4 * sy, "#e2ca823d")
      }
    }
    for (const x of vertical) for (const y of horizontal) {
      for (const side of [-1, 1]) for (let stripe = 0; stripe < 4; stripe += 1) {
        rect(ctx, x - roadX / 2 + 18 * sx, y + side * (roadY / 2 + 8 * sy + stripe * 7 * sy), roadX - 36 * sx, 3 * sy, "#e9dba983")
        rect(ctx, x + side * (roadX / 2 + 8 * sx + stripe * 7 * sx), y - roadY / 2 + 18 * sy, 3 * sx, roadY - 36 * sy, "#e9dba983")
      }
      // Dirt washed out over the crossing rather than clean grey paving.
      oval(ctx, x - 30 * sx, y + 32 * sy, 31 * sx, 17 * sy, "#c4ab6333")
      oval(ctx, x + 35 * sx, y - 29 * sy, 20 * sx, 12 * sy, "#756d5530")
    }
    for (let i = 0; i < 2000; i += 1) {
      const x = random() * width
      const y = random() * height
      const onRoad = vertical.some(road => Math.abs(road - x) < roadX / 2) || horizontal.some(road => Math.abs(road - y) < roadY / 2)
      oval(ctx, x, y, 1 + random() * 2, .7 + random() * 1.3, onRoad ? "#7d6e4242" : "#e1cd8830")
      if (i % 9 === 0 && !onRoad) {
        oval(ctx, x, y, 2.8 * scale, 1.8 * scale, "#b4ac7e", "#767346", .8)
        if (i % 18 === 0) grass(x + 6 * sx, y, 3.5 * scale)
      }
      if (i % 23 === 0 && onRoad) {
        line(ctx, x, y, x + 12 * sx, y + 6 * sy, "#8d7a4c", 1.4 * scale)
        line(ctx, x + 12 * sx, y + 6 * sy, x + 8 * sx, y + 14 * sy, "#8d7a4c", 1.4 * scale)
        line(ctx, x + 12 * sx, y + 6 * sy, x + 21 * sx, y + 4 * sy, "#8d7a4c", 1 * scale)
        if (i % 46 === 0) grass(x + 9 * sx, y + 12 * sy, 3 * scale, true)
      }
    }

    const houseAssets = Object.freeze({ residential: 0, shop: 2, market: 2, clinic: 1, garage: 3, apartment: 4, warehouse: 7 })
    for (const building of buildings) {
      const roofLift = 30 * sy
      const pad = 6 * sx
      // The atlas base stays on the footprint's south edge, where the house
      // system places its entrance. Only the roof extends above the footprint.
      const facadeCropTop = ({ residential: .56, shop: .48, market: .48, clinic: .55, apartment: .45, warehouse: .4 }[building.kind] ?? .5)
      const item = { id: `building-${building.variant}`, type: "building", index: houseAssets[building.kind] ?? 0, building, exteriorStyle: "roof-and-facade", facadeCropTop, x: building.x - pad, y: building.y - roofLift, width: building.width + pad * 2, height: building.height + roofLift, sortY: building.y + building.height }
      scenery.push(Object.freeze(item))
      // Ground contact shadows are baked; the roof itself belongs to depth order.
      oval(ctx, building.x + building.width / 2 + 7 * sx, building.y + building.height - 2 * sy, building.width * .58, 12 * sy, "#594d3245")
      for (let i = 0; i < 4; i += 1) grass(building.x + 10 * sx + i * building.width / 4, building.y + building.height + 4 * sy, 4 * scale, true)
    }

    function prop(index, x, baseY, w, h) {
      const item = { id: `prop-${scenery.length}`, type: index === 8 || index === 9 ? "tree" : "prop", index, x: (x - w / 2) * sx, y: (baseY - h) * sy, width: w * sx, height: h * sy, sortY: baseY * sy }
      scenery.push(Object.freeze(item))
      oval(ctx, x * sx + 5 * sx, (baseY - 3) * sy, w * sx * .43, 6 * sy, "#4f52282d")
    }
    // Rounded, layered treelines frame the city without cluttering its alleys.
    for (let y = 58; y < 2525; y += 64) {
      const row = rows.find(([top, bottom]) => y >= top && y <= bottom)
      if (!row) continue
      for (const x of [35, 1407]) {
        const base = y + (random() - .5) * 12
        prop(random() < .09 ? 9 : 8, x + (random() - .5) * 10, base, 58 + random() * 14, 68 + random() * 17)
        if (Math.floor(y / 64) % 3 === 0) prop(8, x + (x < 100 ? 29 : -29), base - 22, 52, 64)
      }
    }
    // Trees and small props frame each plot without occupying its doorway.
    rows.forEach(([top, bottom], row) => {
      for (const [left, right] of columns) {
        prop(8, left + 1, top + 24, 60, 73)
        prop(8, right - 1, top + 21, 54, 68)
        prop(8, left + 1, bottom - 11, 63, 77)
        prop(row % 4 === 0 ? 9 : 8, right - 1, bottom - 8, 57, 72)
        // Oil drums and crates stay on the plot corners, clear of the doorway.
        prop(12, left + 24, bottom - 22, 30, 29)
        if (row % 2) prop(14, right - 35, top + 39, 33, 25)
      }
      const middle = (top + bottom) / 2
      if (row % 3 === 1) {
        for (const x of [88, 1357]) {
          prop(8, x - 6, middle - 42, 62, 75)
          prop(8, x + 10, middle + 67, 53, 69)
          prop(row === 1 ? 11 : 10, x + 5, middle + 15, 47, 44)
          prop(12, x - 14, middle + 91, 32, 31)
        }
      } else {
        prop(row % 2 ? 13 : 14, 109, bottom - 15, 33, 28)
        prop(12, 1320, top + 25, 29, 27)
      }
    })
    for (let i = 0; i < horizontal.length; i += 1) {
      const cross = horizontal[i] / sy
      prop(i % 2 ? 10 : 11, 672, cross + 118, 49, 42)
      prop(i % 2 ? 14 : 15, 770, cross - 104, 48, 34)
    }
    // A low, broken perimeter wall is scenery only; the original bounds remain.
    for (let x = 65; x < 1390; x += 68) {
      if (vertical.some(road => Math.abs(road / sx - x) < 100)) continue
      prop(8, x, 56, 64, 76)
      prop(8, x + 14, 2548, 68, 80)
    }
    ctx.strokeStyle = "#756a3b"; ctx.lineWidth = 3 * scale
    ctx.strokeRect(MARGIN, MARGIN, width - MARGIN * 2, height - MARGIN * 2)

    function drawFallbackBuilding(context, item) {
      const { x, y, width: w, height: h, kind, variant } = item.building
      const u = sx
      const v = sy
      const top = y - 28 * v
      const ledge = y + h - 35 * v
      const roof = ["#857963", "#967954", "#808775", "#9e8b61"][variant % 4]
      const wall = ["#b99d6d", "#aaab88", "#bfaa7e", "#9c9476"][variant % 4]
      // A visible front facade and softly bevelled roof, never an isometric cube.
      polygon(context, [[x - 3 * u, y + 6 * v], [x + 3 * u, top + 7 * v], [x + w - 3 * u, top], [x + w + 3 * u, y + 6 * v], [x + w + 3 * u, ledge], [x - 3 * u, ledge]], roof, ink, 2.5 * scale)
      rect(context, x, ledge, w, h - (ledge - y), wall, ink, 2.5 * scale)
      rect(context, x + 4 * u, ledge + 3 * v, w - 8 * u, 5 * v, "#d5bd83")
      // Shingled/brick detail uses a fixed rhythm and unequal weathered strokes.
      for (let roofY = top + 16 * v; roofY < ledge - 4 * v; roofY += 13 * v) {
        line(context, x + 4 * u, roofY, x + w - 4 * u, roofY, "#584d3768", 1 * scale)
        for (let roofX = x + 13 * u + (Math.round(roofY / v) % 2 ? 7 * u : 0); roofX < x + w - 6 * u; roofX += 20 * u) line(context, roofX, roofY - 9 * v, roofX, roofY, "#d2b37c40", 1 * scale)
      }
      line(context, x + 2 * u, top + 9 * v, x + w - 4 * u, top + 4 * v, "#c8bb91", 2 * scale)
      line(context, x + w - 3 * u, top + 7 * v, x + w - 3 * u, ledge - 2 * v, "#544934", 2 * scale)
      if (kind === "residential") {
        line(context, x + w / 2, top + 6 * v, x + w / 2, ledge - 3 * v, "#d0b783", 2 * scale)
        rect(context, x + 13 * u, top + 18 * v, 13 * u, 16 * v, "#796a53", ink, 2 * scale)
        rect(context, x + 11 * u, top + 16 * v, 17 * u, 5 * v, "#b3a782", ink, 1.5 * scale)
      } else {
        rect(context, x + 13 * u, top + 17 * v, 29 * u, 19 * v, "#c0b38b", ink, 1.5 * scale)
        for (let vent = 0; vent < 4; vent += 1) line(context, x + 18 * u, top + (21 + vent * 3) * v, x + 36 * u, top + (21 + vent * 3) * v, "#747663", 1.5 * scale)
      }
      // Broken glass, nailed boards and spalling masonry make the theme visible.
      for (const windowX of [x + 8 * u, x + w - 25 * u]) {
        rect(context, windowX, ledge + 12 * v, 17 * u, 15 * v, "#525d50", ink, 1.8 * scale)
        polygon(context, [[windowX + 2 * u, ledge + 13 * v], [windowX + 14 * u, ledge + 13 * v], [windowX + 11 * u, ledge + 19 * v], [windowX + 3 * u, ledge + 23 * v]], "#9cae93")
        line(context, windowX, ledge + 15 * v, windowX + 18 * u, ledge + 23 * v, "#89704c", 3 * scale)
      }
      rect(context, x + w / 2 - 9 * u, ledge + 11 * v, 18 * u, 24 * v, "#59553d", ink, 2 * scale)
      line(context, x + w / 2 - 8 * u, ledge + 21 * v, x + w / 2 + 8 * u, ledge + 17 * v, "#a38856", 3 * scale)
      oval(context, x + w / 2 + 4 * u, ledge + 28 * v, 1.3 * u, 1.3 * v, "#d1bc79")
      rect(context, x + w / 2 - 13 * u, y + h, 26 * u, 3 * v, "#c4b17e", ink, 1 * scale)
      if (["shop", "market", "clinic", "warehouse", "garage"].includes(kind)) {
        rect(context, x + 5 * u, ledge - 12 * v, w - 10 * u, 13 * v, variant % 3 ? "#6d8170" : "#937049", ink, 2 * scale)
        context.fillStyle = "#e8dbac"; context.font = `bold ${8 * scale}px sans-serif`; context.textAlign = "center"
        context.fillText(({ shop: "MART", market: "MARKET", clinic: "CLINIC", warehouse: "DEPOT", garage: "GARAGE" }[kind] || "STORE"), x + w / 2, ledge - 3 * v)
        for (let stripe = 0; stripe < Math.floor((w - 10 * u) / (8 * u)); stripe += 1) rect(context, x + 5 * u + stripe * 8 * u, ledge + 2 * v, 8 * u, 5 * v, stripe % 2 ? "#c3b488" : "#738168")
      }
      line(context, x + w - 8 * u, ledge + 7 * v, x + w - 11 * u, ledge + 15 * v, "#695938", 1 * scale)
      line(context, x + w - 11 * u, ledge + 15 * v, x + w - 8 * u, ledge + 19 * v, "#695938", 1 * scale)
    }

    function drawFallbackTree(context, item) {
      const { x, y, width: w, height: h } = item
      const trunkX = x + w * .48
      const base = y + h
      rect(context, trunkX - w * .065, base - h * .36, w * .13, h * .33, "#8d7146", ink, 2 * scale)
      line(context, trunkX, base - h * .08, trunkX - w * .12, base, "#8d7146", 4 * scale)
      if (item.index === 9) {
        line(context, trunkX, base - h * .28, x + w * .2, y + h * .2, "#826b48", 5 * scale)
        line(context, trunkX + 2 * sx, base - h * .27, x + w * .82, y + h * .08, "#826b48", 4 * scale)
        line(context, x + w * .29, y + h * .37, x + w * .09, y + h * .33, ink, 2 * scale)
        return
      }
      // Each crown has several outlined lobes, like the round forest in the image.
      oval(context, x + w * .48, y + h * .38, w * .46, h * .35, "#5e812c", ink, 2.5 * scale)
      const lobes = [[.28, .25, .22, .16], [.61, .2, .25, .18], [.79, .35, .19, .17], [.41, .44, .26, .21], [.18, .43, .18, .18], [.65, .52, .23, .17]]
      lobes.forEach(([cx, cy, rx, ry], index) => {
        oval(context, x + w * cx, y + h * cy, w * rx, h * ry, ["#80a436", "#91ae3c", "#6d932e"][index % 3], "#4d6b2a", 1.8 * scale)
        oval(context, x + w * (cx - .025), y + h * (cy - .045), w * rx * .58, h * ry * .35, "#b0c55744")
      })
    }

    function drawFallbackProp(context, item) {
      const { x, y, width: w, height: h, index } = item
      if (index === 10 || index === 11) {
        rect(context, x + w * .07, y + h * .38, w * .88, h * .4, "#4f4b39", ink, 2 * scale)
        const body = index === 11 ? "#b8b495" : "#967647"
        polygon(context, [[x + w * .08, y + h * .33], [x + w * .3, y + h * .12], [x + w * .7, y + h * .12], [x + w * .88, y + h * .36], [x + w * .94, y + h * .69], [x + w * .04, y + h * .69]], body, ink, 2 * scale)
        polygon(context, [[x + w * .34, y + h * .17], [x + w * .65, y + h * .17], [x + w * .76, y + h * .36], [x + w * .23, y + h * .36]], "#748779", ink, 1 * scale)
        oval(context, x + w * .23, y + h * .77, w * .105, h * .14, "#555243", ink, 2 * scale)
        oval(context, x + w * .77, y + h * .77, w * .105, h * .14, "#555243", ink, 2 * scale)
        line(context, x + w * .34, y + h * .5, x + w * .5, y + h * .57, "#765c37", 3 * scale)
        if (index === 11) { rect(context, x + w * .4, y + h * .04, w * .11, h * .09, "#916f49", ink, 1); rect(context, x + w * .51, y + h * .04, w * .1, h * .09, "#557577", ink, 1) }
      } else if (index === 12) {
        rect(context, x + w * .53, y + h * .43, w * .43, h * .48, "#a88d55", ink, 2 * scale)
        line(context, x + w * .57, y + h * .49, x + w * .91, y + h * .86, "#79623d", 2 * scale)
        rect(context, x + w * .1, y + h * .24, w * .43, h * .58, "#8d7449", ink, 2 * scale)
        oval(context, x + w * .315, y + h * .23, w * .215, h * .11, "#b29962", ink, 1.5 * scale)
        line(context, x + w * .1, y + h * .45, x + w * .53, y + h * .45, "#605f48", 2 * scale)
        line(context, x + w * .1, y + h * .68, x + w * .53, y + h * .68, "#605f48", 2 * scale)
      } else if (index === 13) {
        for (const offset of [.25, .55, .75]) oval(context, x + w * offset, y + h * .75, w * .19, h * .14, "#555242", ink, 2 * scale)
        polygon(context, [[x + w * .38, y + h * .7], [x + w * .33, y + h * .38], [x + w * .48, y + h * .51], [x + w * .6, y + h * .1], [x + w * .71, y + h * .6], [x + w * .6, y + h * .72]], "#b08038", ink, 1.5 * scale)
        polygon(context, [[x + w * .48, y + h * .67], [x + w * .59, y + h * .38], [x + w * .64, y + h * .68]], "#dbc069")
      } else if (index === 14) {
        polygon(context, [[x + w * .02, y + h * .95], [x + w * .11, y + h * .4], [x + w * .31, y + h * .38], [x + w * .36, y + h * .11], [x + w * .59, y + h * .18], [x + w * .63, y + h * .59], [x + w * .91, y + h * .66], [x + w * .97, y + h * .94]], "#a39165", ink, 2 * scale)
        for (let r = 0; r < 2; r += 1) line(context, x + w * .17, y + h * (.59 + r * .16), x + w * .7, y + h * (.59 + r * .16), "#796948", 1.5 * scale)
      } else {
        for (let row = 0; row < 2; row += 1) for (let bag = 0; bag < 3; bag += 1) oval(context, x + w * (.18 + bag * .3 + row * .06), y + h * (.8 - row * .3), w * .17, h * .2, row ? "#b4a575" : "#9f9467", ink, 1.5 * scale)
        line(context, x + w * .3, y + h * .1, x + w * .52, y + h * .49, "#9d8150", 4 * scale)
      }
    }

    const roofCache = new WeakMap()
    function drawExtendedRoof(context, item, facadeHeight) {
      const roofHeight = item.height - facadeHeight + 16 * sy
      let cached = roofCache.get(item)
      if (!cached || cached.facadeHeight !== facadeHeight) {
        const canvas = document.createElement("canvas")
        canvas.width = Math.ceil(item.width + 12 * sx)
        canvas.height = Math.ceil(roofHeight + 12 * sy)
        const target = canvas.getContext("2d")
        target.translate(6 * sx, 5 * sy)
        const w = item.width, h = roofHeight, kind = item.building.kind
        const flat = ["clinic", "apartment"].includes(kind)
        const metal = kind === "warehouse"
        const colors = flat ? ["#a29b78", "#89866c", "#c8bb8c"] : metal ? ["#8c8f80", "#737a71", "#b4b09a"] : ["#b1784c", "#965f3e", "#d2a16b"]
        rect(target, 4 * sx, 5 * sy, w - 8 * sx, h, "#57422e", ink, 3)
        polygon(target, [[3 * sx, 12 * sy], [14 * sx, 1], [w - 14 * sx, 1], [w - 3 * sx, 12 * sy], [w, h - 7 * sy], [0, h - 7 * sy]], colors[0], ink, 3)
        target.save(); target.beginPath(); target.rect(10 * sx, 12 * sy, w - 20 * sx, h - 18 * sy); target.clip()
        if (!flat) {
          rect(target, w / 2, 6 * sy, w / 2 - 5 * sx, h, colors[1])
          const pitch = metal ? 36 : 25
          for (let row = 0, y = 10 * sy; y < h; y += pitch * sy, row++) {
            line(target, 8 * sx, y, w - 8 * sx, y, "#63492ea0", 2)
            line(target, 9 * sx, y + 3 * sy, w - 9 * sx, y + 3 * sy, colors[2], 1.4)
            if (!metal) for (let x = (row % 2 ? 24 : 5) * sx; x < w; x += 44 * sx) {
              line(target, x, y + 3 * sy, x - 5 * sx, y + pitch * sy, "#714b35", 1.6)
              if ((row + Math.round(x / (44 * sx))) % 8 === 0) rect(target, x + 7 * sx, y + 7 * sy, 16 * sx, 4 * sy, "#d8ad7638")
            }
            else for (let x = 24 * sx; x < w; x += 34 * sx) oval(target, x, y + 8 * sy, 1.5, 1.5, "#4b5048")
          }
          line(target, w / 2 - 5 * sx, 4 * sy, w / 2 - 5 * sx, h, "#deaa71", 4 * sx)
          line(target, w / 2 + 4 * sx, 4 * sy, w / 2 + 4 * sx, h, "#57412e", 3 * sx)
        } else {
          for (let y = 15 * sy; y < h; y += 52 * sy) {
            line(target, 14 * sx, y, w - 14 * sx, y, "#716b5455", 1)
            for (let x = 35 * sx; x < w; x += 67 * sx) line(target, x, y, x + 5 * sx, y + 52 * sy, "#78705440", 1)
          }
        }
        // Fixed weathering varies by building, so the roof is stable while moving.
        let weather = 81427 + item.building.variant * 177
        const sample = () => { weather = Math.imul(weather, 1664525) + 1013904223 | 0; return (weather >>> 0) / 4294967296 }
        for (let i = 0; i < 55; i++) {
          const x = 18 * sx + sample() * (w - 36 * sx), y = 20 * sy + sample() * Math.max(1, h - 45 * sy)
          oval(target, x, y, (3 + sample() * 10) * sx, (1.5 + sample() * 4) * sy, i % 3 ? "#57452b15" : "#e5c59126")
        }
        target.restore()
        if (flat) {
          for (const x of [2 * sx, w - 12 * sx]) {
            rect(target, x, 2 * sy, 10 * sx, h - 7 * sy, "#c8ba8d", ink, 2.5)
            line(target, x + 3 * sx, 4 * sy, x + 3 * sx, h - 8 * sy, "#efe0b3", 2)
          }
          rect(target, 10 * sx, 0, w - 20 * sx, 10 * sy, "#c8ba8d", ink, 2.5)
          // Squat air conditioning units sit on roof supports, never stretched.
          for (const [ux, uy] of [[w * .18, h * .2], [w * .64, h * .58]]) {
            rect(target, ux + 5 * sx, uy + 6 * sy, 59 * sx, 44 * sy, "#584d3b44")
            rect(target, ux, uy, 58 * sx, 39 * sy, "#b5b19c", ink, 2.5)
            rect(target, ux + 4 * sx, uy + 4 * sy, 50 * sx, 31 * sy, "#7b8377", ink, 1.5)
            oval(target, ux + 29 * sx, uy + 19 * sy, 12 * sx, 12 * sy, "#515e57", ink, 1.3)
            for (let n = 0; n < 4; n++) line(target, ux + (15 + n * 9) * sx, uy + 8 * sy, ux + (15 + n * 9) * sx, uy + 30 * sy, "#c5c1a2", 1)
          }
        } else if (!metal) {
          const chimneyX = w * .76, chimneyY = h * .16
          rect(target, chimneyX + 7 * sx, chimneyY + 6 * sy, 47 * sx, 70 * sy, "#57412f55")
          rect(target, chimneyX, chimneyY, 40 * sx, 55 * sy, "#a47950", ink, 3)
          for (let y = chimneyY + 9 * sy; y < chimneyY + 55 * sy; y += 12 * sy) line(target, chimneyX + 2 * sx, y, chimneyX + 38 * sx, y, "#66462f", 1.7)
          rect(target, chimneyX - 5 * sx, chimneyY - 5 * sy, 50 * sx, 15 * sy, "#c5a471", ink, 2.5)
          rect(target, chimneyX + 5 * sx, chimneyY - 1 * sy, 30 * sx, 5 * sy, "#443629")
        }
        // Moss clings to the parapet and old gutters rather than floating in the street.
        for (let n = 0; n < 8; n++) {
          const x = n % 2 ? 12 * sx : w - 14 * sx, y = (32 + n * 45) * sy
          if (y < h - 20 * sy) { oval(target, x, y, 9 * sx, 6 * sy, "#768a39", "#58672c", 1.3); oval(target, x + 5 * sx, y - 3 * sy, 5 * sx, 4 * sy, "#9fab4d") }
        }
        line(target, 4 * sx, h - 9 * sy, w - 4 * sx, h - 9 * sy, "#4e3c2b", 5)
        cached = { canvas, facadeHeight }
        roofCache.set(item, cached)
      }
      context.drawImage(cached.canvas, item.x - 6 * sx, item.y - 5 * sy)
    }

    function drawBuilding(context, item) {
      const size = art?.environmentSize?.(item.index, { cropTop: item.facadeCropTop })
      if (!size) { drawFallbackBuilding(context, item); return }
      const facadeHeight = size.height * item.width / size.width
      drawExtendedRoof(context, item, facadeHeight)
      art.drawEnvironment(context, item.index, item.x, item.y, item.width, item.height, { cropTop: item.facadeCropTop, fit: "width", anchorY: 1 })
    }

    function drawScenery(context, item) {
      context.save()
      context.lineJoin = "round"
      // Alien-Shooter-style high-angle view: every tall block reads as a solid,
      // not a flat poster. A southeast cast shadow grounds it, a darker south
      // wall band gives it height below the facade, and a thin east face gives
      // it thickness. Collision still uses the flat footprint; this is visual
      // depth only, and Y-sort keeps actors in front when they pass south.
      if (item.type === "building") {
        const b = item.building, wallH = 20 * sy, depth = 10 * sx
        context.fillStyle = "rgba(24,20,12,0.30)"
        context.fillRect(b.x + 16 * sx, b.y + 20 * sy, b.width, b.height + wallH)
        drawBuilding(context, item)
        rect(context, b.x, b.y + b.height, b.width, wallH, "#7a6448", ink, 2 * scale)
        line(context, b.x + 2 * sx, b.y + b.height + 2 * sy, b.x + b.width - 2 * sx, b.y + b.height + 2 * sy, "#c8b489", 1.5 * scale)
        polygon(context, [[b.x + b.width, b.y + 6 * sy], [b.x + b.width + depth, b.y - 2 * sy], [b.x + b.width + depth, b.y + b.height + wallH - 2 * sy], [b.x + b.width, b.y + b.height + wallH]], "#5d4f38", ink, 2 * scale)
        context.restore(); return
      }
      if (item.type === "tree") {
        context.fillStyle = "rgba(24,20,12,0.28)"
        context.beginPath(); context.ellipse(item.x + item.width / 2 + 14 * sx, item.y + item.height - 4 * sy, item.width * .34, 7 * sy, 0, 0, Math.PI * 2); context.fill()
      }
      const drawn = art && art.drawEnvironment(context, item.index, item.x, item.y, item.width, item.height)
      if (!drawn) {
        if (item.type === "building") drawFallbackBuilding(context, item)
        else if (item.type === "tree") drawFallbackTree(context, item)
        else drawFallbackProp(context, item)
      }
      context.restore()
    }

    const spawn = Object.freeze({ x: width / 2, y: horizontal[0] })
    updateNavigation(spawn.x, spawn.y)
    return Object.freeze({ width, height, terrain, buildings: Object.freeze(buildings), blocks: Object.freeze(blocks), scenery: Object.freeze(scenery), drawScenery, spawn, roads: { vertical: [...vertical], horizontal: [...horizontal], bendAmplitude: { x: 18 * sx, y: 14 * sy } }, isFree, move, steer, updateNavigation })
  }

  global.WASTELAND_CITY = Object.freeze({ create })
})(window)
