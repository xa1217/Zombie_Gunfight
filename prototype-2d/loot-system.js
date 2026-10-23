(() => {
  "use strict"

  const qualities = Object.freeze({
    common: { name: "普通", color: "#c5cec1", multiplier: 1, revealDelay: .42 },
    fine: { name: "精良", color: "#86e0a6", multiplier: 1.2, revealDelay: .82 },
    rare: { name: "稀有", color: "#74bfff", multiplier: 1.5, revealDelay: 1.25 },
    epic: { name: "史诗", color: "#d39bff", multiplier: 1.9, revealDelay: 2 },
    legendary: { name: "传说", color: "#efa54c", multiplier: 2.1, revealDelay: 3.2 },
    relic: { name: "珍藏", color: "#ed786a", multiplier: 2.3, revealDelay: 4.5 }
  })
  const weapons = Object.freeze({
    // Reload balance follows the reference game's weapon-class rhythm:
    // compact SMGs/pistols are quickest, rifles are medium, and shell-fed
    // shotguns take longest. The public video does not expose exact frame
    // timings, so these are explicit playable seconds rather than claimed
    // source-game measurements.
    assaultRifle: { id: "assaultRifle", name: "突击步枪", icon: "步", damage: 20, interval: .24, reloadTime: 2.1, speed: 760, pellets: 1, spread: 0, life: 1.4, magazine: 30, reserve: 90, ammoType: "rifle" },
    submachineGun: { id: "submachineGun", name: "冲锋枪", icon: "冲", damage: 12, interval: .115, reloadTime: 1.6, speed: 850, pellets: 1, spread: 0, life: .95, magazine: 36, reserve: 108, ammoType: "smg" },
    shotgun: { id: "shotgun", name: "霰弹枪", icon: "霰", damage: 15, interval: .62, reloadTime: 2.6, speed: 650, pellets: 5, spread: .13, life: .62, magazine: 8, reserve: 32, ammoType: "shell" },
    scar: { id: "scar", name: "SCAR", icon: "SC", damage: 24, interval: .25, reloadTime: 2.2, speed: 790, pellets: 1, spread: 0, life: 1.4, magazine: 30, reserve: 0, ammoType: "rifle" },
    aug: { id: "aug", name: "AUG", icon: "AU", damage: 20, interval: .19, reloadTime: 2, speed: 810, pellets: 1, spread: 0, life: 1.35, magazine: 30, reserve: 0, ammoType: "rifle" },
    mp7: { id: "mp7", name: "MP7", icon: "MP", damage: 13, interval: .1, reloadTime: 1.4, speed: 840, pellets: 1, spread: .02, life: .95, magazine: 40, reserve: 0, ammoType: "smg" },
    ks23: { id: "ks23", name: "KS23", icon: "KS", damage: 21, interval: .85, reloadTime: 2.9, speed: 670, pellets: 6, spread: .12, life: .72, magazine: 4, reserve: 0, ammoType: "shell" },
    policePistol: { id: "policePistol", name: "警用手枪", icon: "枪", damage: 18, interval: .3, reloadTime: 1.3, speed: 800, pellets: 1, spread: 0, life: 1.05, magazine: 15, reserve: 0, ammoType: "smg" },
    thunder: { id: "thunder", name: "雷罚", icon: "雷", damage: 22, interval: .15, reloadTime: 2.4, speed: 880, pellets: 1, spread: 0, life: 1.3, magazine: 55, reserve: 0, ammoType: "rifle" }
  })
  const combatConsumables = Object.freeze({
    invulnerableBurst: { id: "invulnerableBurst", name: "2秒无敌", icon: "盾", color: "#d8f25a", effect: "invulnerable", duration: 2 },
    fireRateOverdrive: { id: "fireRateOverdrive", name: "5秒攻速翻倍", icon: "速", color: "#ffbd63", effect: "fireRate", duration: 5, multiplier: 2 },
    ammoOvercharge: { id: "ammoOvercharge", name: "5秒弹药效果 +2", icon: "弹", color: "#74bfff", effect: "ammo", duration: 5, levels: 2 }
  })
  // Only the two manually used throwables are lootable. Other tactical skills
  // remain defined by the skill system for backwards-compatible effect code,
  // but they never enter a ground drop or combat loot roll.
  const throwableSkills = Object.freeze(["grenade", "molotov"])
  const ranks = Object.keys(qualities)

  // Reference: BV1UtKv6aEWd, timestamped observations in REFERENCE-APIPI.md.
  // Names/shapes/colors observed in the recording are distinct from balance
  // tuning. Weights, gun damage, most prices and delays are local tuning.
  const revealDelays = Object.freeze({ common: .42, fine: .82, rare: 1.25, epic: 2, legendary: 3.2, relic: 4.5 })
  const itemData = {
    pizza: { name: "披萨", icon: "披", art: "pizza", category: "food", heal: 24, width: 2, weight: .4, quality: "rare", value: 1200 },
    milk: { name: "牛奶", icon: "奶", art: "milk", category: "food", heal: 16, weight: .25, quality: "fine", value: 600, stackMax: 3 },
    ammo: { name: "弹药", icon: "弹", art: "ammo", category: "ammo", amount: 24, weight: .012, quality: "fine", value: 10, stackMax: 300 },
    junk: { name: "杂物", icon: "杂", art: "box", category: "junk", value: 120, weight: .3, quality: "common" },
    basketball: { name: "一个篮球", icon: "球", art: "basketball", category: "valuable", width: 2, height: 2, quality: "fine", value: 2400, weight: .6 },
    hairdryer: { name: "吹风机", icon: "吹", art: "dryer", category: "valuable", height: 2, quality: "epic", value: 18500, weight: .8 },
    vacuum: { name: "吸尘器", icon: "吸", art: "vacuum", category: "valuable", height: 3, quality: "legendary", value: 72000, weight: 2.8 },
    cards: { name: "扑克牌", icon: "牌", art: "cards", category: "valuable", quality: "fine", value: 980, weight: .1 },
    cup: { name: "陶瓷杯", icon: "杯", art: "cup", category: "valuable", quality: "fine", value: 1350, weight: .3 },
    lighter: { name: "打火机", icon: "火", art: "lighter", category: "valuable", quality: "rare", value: 4200, weight: .08 },
    actionCamera: { name: "运动相机", icon: "相", art: "camera", category: "valuable", quality: "legendary", value: 86000, weight: .16 },
    lens: { name: "高级镜头", icon: "镜", art: "lens", category: "valuable", height: 2, quality: "epic", value: 28000, weight: .7 },
    wine: { name: "未开红酒", icon: "酒", art: "wine", category: "valuable", height: 2, quality: "legendary", value: 96000, weight: 1.2 },
    necklace: { name: "钻石项链", icon: "钻", art: "necklace", category: "valuable", quality: "legendary", value: 180000, weight: .06 },
    chessClock: { name: "棋钟", icon: "钟", art: "clock", category: "valuable", width: 2, quality: "epic", value: 24000, weight: .8 },
    chess: { name: "棋子", icon: "棋", art: "chess", category: "valuable", width: 2, height: 2, quality: "epic", value: 38000, weight: 1.2 },
    speaker: { name: "迷你音箱", icon: "音", art: "speaker", category: "valuable", height: 2, quality: "epic", value: 22000, weight: .6 },
    sunflower: { name: "向日葵", icon: "花", art: "flower", category: "valuable", height: 2, quality: "epic", value: 12600, weight: .9 },
    compass: { name: "指南针", icon: "针", art: "compass", category: "valuable", quality: "rare", value: 5256, weight: .12 },
    windowHammer: { name: "破窗锤", icon: "锤", art: "hammer", category: "material", quality: "rare", value: 5520, weight: .35 },
    sunglasses: { name: "墨镜", icon: "镜", art: "glasses", category: "valuable", quality: "rare", value: 4464, weight: .08 },
    massageGun: { name: "筋膜枪", icon: "筋", art: "dryer", category: "valuable", quality: "rare", value: 8628, weight: .5 },
    wig: { name: "假发套", icon: "发", art: "wig", category: "valuable", quality: "rare", value: 3400, weight: .2 },
    medkit: { name: "户外医疗包", icon: "医", art: "medkit", category: "medical", heal: 60, stackMax: 3, quality: "legendary", weight: .65, value: 12000 },
    hemostatic: { name: "止血针", icon: "针", art: "syringe", category: "medical", heal: 38, stackMax: 3, quality: "epic", weight: .08, value: 36000 },
    lightAmmo: { name: "50级轻型弹药", icon: "5.56", art: "ammo", category: "ammo", ammoType: "rifle", level: 50, amount: 60, stackMax: 300, quality: "legendary", weight: .012, value: 45 },
    smgAmmo: { name: "轻型冲锋枪弹药", icon: "9mm", art: "ammo", category: "ammo", ammoType: "smg", amount: 60, stackMax: 300, quality: "rare", weight: .008, value: 24 },
    shells: { name: "50级霰弹", icon: "12GA", art: "ammo", category: "ammo", ammoType: "shell", level: 50, amount: 12, stackMax: 50, quality: "legendary", weight: .035, value: 90 },
    scar: { name: "SCAR", icon: "SC", art: "rifle", category: "weapon", weaponId: "scar", level: 49, width: 2, quality: "epic", weight: 3.5, value: 65000 },
    aug: { name: "AUG", icon: "AU", art: "rifle", category: "weapon", weaponId: "aug", level: 49, width: 2, quality: "epic", weight: 3.3, value: 62000 },
    mp7: { name: "MP7", icon: "MP", art: "rifle", category: "weapon", weaponId: "mp7", level: 49, width: 2, quality: "epic", weight: 1.9, value: 45000 },
    ks23: { name: "KS23", icon: "KS", art: "shotgun", category: "weapon", weaponId: "ks23", level: 49, width: 2, quality: "epic", weight: 3.8, value: 55000 },
    policePistol: { name: "警用手枪", icon: "枪", art: "pistol", category: "weapon", weaponId: "policePistol", level: 49, width: 2, quality: "rare", weight: 1, value: 16000 },
    thunder: { name: "雷罚", icon: "雷", art: "pistol", category: "weapon", weaponId: "thunder", level: 47, width: 2, quality: "relic", weight: 2, value: 260000 },
    trainingHelmet: { name: "训练头盔", icon: "盔", art: "helmet", category: "equipment", equipmentSlot: "helmet", level: 49, protection: .06, quality: "epic", weight: 1.1, value: 18000 },
    samuraiVest: { name: "武士背心", icon: "甲", art: "armor", category: "equipment", equipmentSlot: "armor", level: 48, protection: .12, quality: "legendary", weight: 3.5, value: 68000 },
    fieldRig: { name: "野战胸挂", icon: "挂", art: "rig", category: "equipment", equipmentSlot: "rig", level: 42, carryBonus: 4, quality: "legendary", weight: 1.2, value: 23000 },
    assaultBoots: { name: "突击者战靴", icon: "靴", art: "boots", category: "equipment", equipmentSlot: "boots", level: 49, speedBonus: .07, quality: "epic", weight: 1, value: 25000 },
    tacticalPack: { name: "战术背包", icon: "包", art: "backpack", category: "equipment", equipmentSlot: "backpack", capacity: 40, carryBonus: 6, quality: "relic", weight: 1.4, value: 78000 },
    fieldPack: { name: "野战背包", icon: "包", art: "backpack", category: "equipment", equipmentSlot: "backpack", capacity: 30, carryBonus: 3, quality: "epic", weight: .9, value: 15000 }
  }
  // These three cards allow the existing starter weapons to be stowed without
  // losing loaded/reserve rounds when the player equips a searched firearm.
  for (const id of ["assaultRifle", "submachineGun", "shotgun"]) itemData[id] = { name: weapons[id].name, icon: weapons[id].icon, art: id === "shotgun" ? "shotgun" : "rifle", category: "weapon", weaponId: id, width: 2, quality: "common", weight: 2.8, value: 2000 }
  const supplyItems = Object.freeze(Object.fromEntries(Object.entries(itemData).map(([id, d]) => [id, Object.freeze({ id, width: 1, height: 1, stackMax: 1, ...d, color: qualities[d.quality].color, revealDelay: revealDelays[d.quality] })])))
  const containerTypes = Object.freeze({
    travel: { name: "旅行箱", columns: 5, rows: 2, min: 2, max: 4, pool: ["basketball", "cards", "cup", "milk", "hairdryer", "lens", "wine", "pizza"] },
    equipment: { name: "装备箱", columns: 5, rows: 2, min: 3, max: 5, pool: ["lightAmmo", "smgAmmo", "shells", "scar", "aug", "mp7", "ks23", "policePistol", "trainingHelmet", "samuraiVest", "fieldRig", "assaultBoots", "fieldPack"] },
    tool: { name: "工具柜", columns: 5, rows: 4, min: 3, max: 5, pool: ["compass", "windowHammer", "massageGun", "lighter", "vacuum", "medkit", "hemostatic", "sunglasses", "wig"] },
    safe: { name: "加密大保险", columns: 5, rows: 4, min: 3, max: 5, locked: true, pool: ["actionCamera", "necklace", "wine", "chessClock", "chess", "speaker", "sunflower", "vacuum", "thunder", "tacticalPack", "cup", "lighter"] }
  })
  const supplyPool = Object.freeze(Object.keys(supplyItems).filter(id => !["assaultRifle", "submachineGun", "shotgun"].includes(id)).map(id => [id, 1 / (Object.keys(supplyItems).length - 3)]))
  function randomSupplyLoot(random = Math.random) {
    let roll = Math.max(0, Math.min(.999999, Number(random()) || 0))
    for (const [id, weight] of supplyPool) {
      if (roll < weight) return supplyItems[id]
      roll -= weight
    }
    return supplyItems.junk
  }

  function rollSupplyContents(type = "travel", random = Math.random) {
    const config = containerTypes[type] || containerTypes.travel
    const count = config.min + Math.floor(random() * (config.max - config.min + 1))
    return Array.from({ length: count }, () => config.pool[Math.floor(random() * config.pool.length)])
  }

  // Outdoors: 80% common / 20% fine. Houses: 40% fine / 45% rare / 15% epic.
  function rollQuality(indoor, random = Math.random) {
    const roll = random()
    return indoor ? roll < .4 ? "fine" : roll < .85 ? "rare" : "epic" : roll < .8 ? "common" : "fine"
  }

  function randomItem(build, random = Math.random) {
    // Timed upgrade balls draw only from the two manually used throwables. Search
    // boxes use randomSupplyLoot instead and never call this helper.
    const Skills = window.WASTELAND_SKILLS
    const throwable = (Skills.throwable || []).filter(skill => throwableSkills.includes(skill.id))
    const owned = build.selectedSkills().filter(skill => throwableSkills.includes(skill.id) && build.level(skill.id) < skill.max)
    const available = throwable.filter(skill => build.canUpgrade(skill.id))
    const pool = owned.length && random() < .55 ? owned : available.length ? available : owned.length ? owned : throwable
    // Keep the fallback inside the same two-item contract even if a caller
    // supplies an unusual build or the configured throwable list is empty.
    const skill = pool[Math.floor(random() * pool.length)] || throwable[0] || Skills.byId("grenade")
    return { kind: "skill", itemId: skill?.id || "grenade" }
  }

  function randomCombatConsumable(random = Math.random) {
    const ids = Object.keys(combatConsumables)
    return combatConsumables[ids[Math.floor(random() * ids.length)]]
  }

  function supplyQuality(itemId) {
    return supplyItems[itemId]?.quality || "common"
  }

  function supplyRevealDelay(itemId, quality) {
    const base = supplyItems[itemId]
    const value = Number(qualities[quality]?.revealDelay ?? base?.revealDelay)
    return Number.isFinite(value) ? Math.max(.2, value) : .6
  }

  function describe(item) {
    if (item.kind === "consumable") {
      const data = combatConsumables[item.itemId]
      return { name: data?.name || "战斗消耗物", icon: data?.icon || "补", color: data?.color || "#d8f25a", consumable: data }
    }
    if (item.kind === "supply" || item.supply) {
      const data = supplyItems[item.itemId]
      return { name: data?.name || "物资", icon: data?.icon || "物", color: data?.color || "#d8f25a", quality: qualities[data?.quality] || qualities.common, supply: data }
    }
    const data = item.kind === "gun" ? weapons[item.itemId] : window.WASTELAND_SKILLS.byId(item.itemId)
    return { name: data?.name || "补给", icon: data?.icon || "补", quality: qualities[item.quality] || qualities.common }
  }

  function draw(context, item, time) {
    const details = describe(item)
    const bounce = Math.sin(time * 3 + item.id) * 3
    const color = details.color || details.quality?.color || "#d8f25a"
    context.save()
    context.translate(item.x, item.y + bounce)
    context.fillStyle = "#0008"
    context.beginPath(); context.ellipse(0, 22 - bounce, 19, 6, 0, 0, Math.PI * 2); context.fill()
    context.shadowColor = color
    context.shadowBlur = 16
    context.strokeStyle = color
    context.lineWidth = 3
    if (item.kind === "consumable" || item.kind === "supply" || item.supply) {
      context.strokeRect(-18, -18, 36, 36)
    } else {
      context.beginPath(); context.arc(0, 0, 18, 0, Math.PI * 2); context.stroke()
    }
    context.shadowBlur = 0
    const pictured = window.WASTELAND_ITEM_ART?.draw(context, item.itemId, 0, 0, 32)
    if (!pictured) {
      // Keep every pickup identifiable while pictures are loading or unavailable.
      context.fillStyle = color
      context.textAlign = "center"
      context.font = "bold 18px Microsoft YaHei, sans-serif"
      context.fillText(details.icon, 0, 6)
      context.font = "bold 13px Microsoft YaHei, sans-serif"
      context.fillStyle = "#111c17d9"; context.fillRect(-51, 27, 102, 22)
      context.fillStyle = color
      const label = item.kind === "consumable" || item.kind === "supply" || item.supply
        ? details.name
        : `${details.quality.name} · ${item.kind === "gun" ? "枪械" : "道具"}`
      context.fillText(label, 0, 43)
    }
    context.restore()
  }

  window.WASTELAND_LOOT = Object.freeze({ qualities, weapons, combatConsumables, throwableSkills, supplyItems, supplyPool, containerTypes, revealDelays, ranks, rollQuality, supplyQuality, supplyRevealDelay, randomItem, randomCombatConsumable, randomSupplyLoot, rollSupplyContents, describe, draw })
})()
