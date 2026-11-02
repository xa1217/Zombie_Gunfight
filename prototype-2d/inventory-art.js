(() => {
  "use strict"
  // Original vector drawings; no streamer overlays or extracted game textures.
  const art = {
    basketball: '<circle cx="32" cy="32" r="25" fill="#b44d35"/><path d="M10 20Q42 22 47 50M8 38Q31 21 52 14M16 11Q31 37 21 56M6 29Q33 35 58 32" fill="none" stroke="#e3d4a4" stroke-width="5"/><path d="M10 20Q42 22 47 50M8 38Q31 21 52 14M16 11Q31 37 21 56" fill="none" stroke-width="2"/>',
    dryer: '<path d="M11 14Q7 25 18 31L42 30 47 17 31 10Z" fill="#a3668f"/><ellipse cx="18" cy="21" rx="9" ry="10" fill="#353039"/><path d="M31 30L28 53 38 55 43 30" fill="#777983"/><path d="M34 55Q52 65 52 44" fill="none"/>',
    vacuum: '<path d="M28 9H41V25H30Z" fill="#878fa0"/><path d="M29 20L24 29H41L45 16" fill="#776882"/><path d="M33 27L28 53" stroke="#b4bcc9" stroke-width="5"/><path d="M14 53L44 56 46 62 11 60Z" fill="#68699a"/>',
    cards: '<path d="M12 11L41 7 47 49 18 54Z" fill="#e2d8ba"/><path d="M25 8L54 20 36 57 9 44Z" fill="#f5e9c7"/><path d="M34 26L40 39 27 39Z" fill="#343039"/><text x="29" y="25" font-size="10" fill="#833e36" stroke="none">A</text>',
    cup: '<path d="M43 21Q64 16 58 36Q52 46 44 37" fill="none" stroke="#d4d6c5" stroke-width="5"/><path d="M10 18Q12 54 31 53Q46 49 47 18Z" fill="#dbdbc9"/><ellipse cx="28" cy="18" rx="19" ry="6" fill="#9daca0"/>',
    lighter: '<path d="M16 27L40 23 44 54 19 58Z" fill="#b5beb8"/><path d="M17 12L36 8 40 20 18 24Z" fill="#727f7b"/><path d="M28 24V15H36V24" fill="#a5aca5"/><path d="M31 15Q20 5 33 1Q43 9 31 15" fill="#e3b654"/>',
    camera: '<rect x="6" y="18" width="51" height="34" rx="5" fill="#829087"/><circle cx="40" cy="35" r="13" fill="#2b3941"/><circle cx="40" cy="35" r="7" fill="#596f85"/><rect x="11" y="23" width="12" height="10" fill="#a5b7af"/><path d="M20 52V58H46V52" fill="#42473e"/>',
    lens: '<path d="M19 6Q33 1 47 6L43 56Q32 62 22 56Z" fill="#dfddd2"/><ellipse cx="33" cy="7" rx="14" ry="5" fill="#37373b"/><path d="M20 16L46 16M21 31H45M22 43H44" stroke="#37373b" stroke-width="5"/>',
    wine: '<path d="M27 3H37V20Q48 28 47 35V58Q32 64 18 58V35Q18 25 27 20Z" fill="#343233"/><path d="M26 3H38V12H26Z" fill="#a25647"/><path d="M18 36H47V51H18Z" fill="#ded2a7"/><path d="M29 39L36 43 29 48Z" fill="#95764c"/>',
    necklace: '<path d="M9 7Q16 42 31 44Q50 30 54 7" fill="none" stroke="#c6ced1" stroke-width="4"/><path d="M32 38L20 50 31 61 43 50Z" fill="#94cdd5"/><path d="M20 50H43M25 44L31 60 37 44" fill="none" stroke="#e5f2e5" stroke-width="1"/>',
    clock: '<path d="M4 18H60V49H4Z" fill="#baaf7b"/><circle cx="18" cy="33" r="12" fill="#e1e0ca"/><circle cx="46" cy="33" r="12" fill="#e1e0ca"/><path d="M18 23V33L11 35M46 24V33L53 29M16 18V11H21M44 18V11H49" fill="none"/>',
    chess: '<path d="M6 10L54 7 60 33 9 39Z" fill="#53685e"/><path d="M9 39L59 33 58 57 6 60Z" fill="#a39165"/><path d="M16 44L15 53M27 42L27 52M39 40V51M51 39V50" stroke="#e6dbb2" stroke-width="5"/>',
    speaker: '<rect x="17" y="5" width="30" height="55" rx="10" fill="#719aa8"/><ellipse cx="32" cy="9" rx="14" ry="5" fill="#513b68"/><path d="M24 23H37M24 30H37M24 37H37M24 44H37" stroke="#8bbda7"/><circle cx="42" cy="30" r="2" fill="#e2d4a4"/>',
    flower: '<path d="M31 24V50M32 40Q9 24 13 43L31 45M32 34Q51 26 54 35L32 43" fill="#6a9b49"/><path d="M17 47H46L42 61H23Z" fill="#b67949"/><path d="M31 4L36 10 45 7 45 15 54 20 47 27 47 35 37 35 32 43 25 35 16 35 16 27 9 20 16 14 18 7 26 10Z" fill="#e3b549"/><circle cx="32" cy="22" r="9" fill="#654b35"/>',
    compass: '<circle cx="32" cy="35" r="23" fill="#c7ac6b"/><circle cx="32" cy="35" r="18" fill="#d9d0a4"/><path d="M24 44L37 21 34 38Z" fill="#595c4b"/><circle cx="32" cy="7" r="5" fill="none"/>',
    hammer: '<path d="M27 22L17 56 24 59 35 24" fill="#b46548"/><path d="M14 12L40 9 52 22 43 31 34 22 18 26Z" fill="#ba645b"/>',
    glasses: '<path d="M6 21L2 35M56 21L62 34M25 33Q32 25 39 33" fill="none" stroke-width="4"/><path d="M5 30Q20 24 27 30L24 43Q9 48 5 30M37 30Q48 24 59 30L55 43Q41 47 37 30" fill="#30404a"/>',
    wig: '<path d="M31 40V54H45L49 60H15L19 54H28V40" fill="#bec7c3"/><ellipse cx="31" cy="28" rx="16" ry="22" fill="#ded7bd"/><path d="M15 32Q1 8 29 3Q56 1 49 35L41 15 32 21 21 18Z" fill="#3a3637"/>',
    medkit: '<path d="M24 13V6H43V13" fill="none" stroke="#c1c29d" stroke-width="5"/><rect x="6" y="13" width="52" height="40" rx="7" fill="#787f52"/><path d="M27 23H38V42H27Z" fill="#e3dfb8" stroke="none"/><path d="M22 28H43V37H22Z" fill="#e3dfb8" stroke="none"/><path d="M12 20V45M51 20V45" stroke="#a3ac76"/>',
    syringe: '<path d="M14 52L46 15 53 21 23 59Z" fill="#c4c2d4"/><path d="M26 34L38 21 46 28 34 41Z" fill="#c778b3"/><path d="M17 56L9 63M47 17L54 9M48 5L59 14" fill="none" stroke="#ddd8cd" stroke-width="3"/>',
    ammo: '<path d="M9 26L53 15 58 49 16 59Z" fill="#6c7750"/><path d="M14 39L54 28M20 55L17 29" stroke="#d9b366" stroke-width="5"/><path d="M5 17L9 6 14 17V50H5Z" fill="#c3a15d"/><text x="25" y="42" fill="#e1dfba" font-size="12" stroke="none">AMMO</text>',
    rifle: '<path d="M3 30L15 25 15 31 38 25 47 28 60 26V31L46 34 41 39 24 38 21 51 15 49 17 36 5 39Z" fill="#b8a461"/><path d="M27 37L25 48 34 49 36 37" fill="#535e58"/><path d="M23 27V22H40V27" fill="#464d47"/>',
    shotgun: '<path d="M3 42L15 32 32 29 36 35 21 39 11 50Z" fill="#b19389"/><path d="M22 31L60 23V28L23 38Z" fill="#b797bb"/><path d="M36 27L54 26 55 34 36 35Z" fill="#66586a"/>',
    pistol: '<path d="M8 18H55V30L32 34 35 56 22 57 17 32 8 30Z" fill="#979bad"/><path d="M20 34L31 36 32 52 24 53Z" fill="#53505b"/><path d="M11 20H52V27H11Z" fill="#c8c4ba"/>',
    helmet: '<path d="M6 37Q3 10 29 6Q59 6 59 38L48 43 43 57H21L16 44Z" fill="#7a847d"/><path d="M12 31H52L48 41H16Z" fill="#29383d"/><path d="M27 8L35 8 38 21 24 21Z" fill="#a7b0a1"/>',
    armor: '<path d="M16 8L26 5 32 17 39 5 49 8 47 27 58 33 51 58H12L7 33 18 27Z" fill="#99967a"/><path d="M20 28H45V49H19Z" fill="#555e4b"/><path d="M23 29V48M33 29V48M43 29V48" stroke="#a9ad90"/>',
    rig: '<path d="M17 5H26L23 27H41L38 5H47L52 57H11Z" fill="#9e946c"/><path d="M14 31H28V52H14ZM35 31H49V52H35Z" fill="#617259"/>',
    boots: '<path d="M20 7H44L43 32 55 44 54 56H12L9 45 19 35Z" fill="#ac7e4d"/><path d="M23 13L37 16M22 22L37 25M21 30L37 33M11 52H54" fill="none" stroke="#393d35" stroke-width="4"/>',
    backpack: '<path d="M24 9V3H42V9" fill="none" stroke="#c3c1a4" stroke-width="4"/><rect x="9" y="9" width="46" height="50" rx="11" fill="#8e9b81"/><rect x="19" y="33" width="28" height="22" rx="4" fill="#5d6c59"/><path d="M21 10V28M42 10V28M11 26H53" fill="none" stroke="#c0c3a6" stroke-width="4"/>',
    milk: '<path d="M18 15L25 4H40L48 15 47 59H17Z" fill="#e1dec6"/><path d="M18 25H47V44H18Z" fill="#92ada4"/><path d="M18 15H48M25 4V15" fill="none"/>',
    matches: '<path d="M14 20L50 14 53 46 17 52Z" fill="#a85a3f"/><path d="M14 28L52 22 53 32 15 38Z" fill="#e0c98a"/><path d="M20 20L24 8 28 9 25 20M31 18L34 6 38 7 35 18M42 16L45 5 49 6 46 16" fill="#e8d9a0"/><circle cx="25" cy="7" r="3" fill="#6b4a2f"/><circle cx="35" cy="5" r="3" fill="#6b4a2f"/><circle cx="46" cy="4" r="3" fill="#6b4a2f"/>',
    massage: '<path d="M10 14Q8 30 22 33L44 30 48 16 30 8Z" fill="#8a7f6a"/><path d="M44 16Q58 14 57 27Q56 36 44 33" fill="#b67949"/><path d="M22 33L19 55 29 57 34 32" fill="#5d6c59"/><path d="M14 20Q20 24 28 21" fill="none" stroke="#e0c98a" stroke-width="2"/>',
    pizza: '<path d="M7 12Q34 3 57 14L29 58Z" fill="#dbb675"/><path d="M7 12Q34 3 57 14L51 23Q31 14 12 23Z" fill="#a97847"/><circle cx="26" cy="29" r="5" fill="#aa5141"/><circle cx="39" cy="24" r="4" fill="#aa5141"/><circle cx="28" cy="43" r="4" fill="#aa5141"/>',
    box: '<path d="M7 15L39 8 57 18 26 27Z" fill="#bca673"/><path d="M7 15L26 27 26 59 7 46Z" fill="#80674f"/><path d="M26 27L57 18 57 49 26 59Z" fill="#a28a60"/>'
  }
  window.WASTELAND_INVENTORY_ART = item => `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g stroke="#242c29" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">${art[item.art] || art.box}</g></svg>`
})()
