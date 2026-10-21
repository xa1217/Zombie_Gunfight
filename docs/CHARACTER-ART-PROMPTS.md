# 角色图集生成记录

本轮使用内置 ImageGen 制作透明 PNG；代码在运行时裁切并驱动躯干、手臂与双腿。最终资源保存于 `prototype-2d/assets/cartoon-rig-v1.png` 和 `wechat-miniprogram/miniprogram/assets/cartoon-rig-v1.png`。不依赖本机生成目录。

用户提供的两张《王国保卫战》游戏内图片用于画风参考：大头矮壮比例、粗描边、简洁色块。最终主角按用户追加要求改为无帽平民：日常上衣、牛仔裤、普通鞋，没有战术背心或军装。

## 统一画风提示词

```text
Use case: style-transfer.
Asset type: production-ready modular 2D mobile game character rig atlas, one transparent PNG.
Input image 1 is the EDIT TARGET: the existing 5-column / 3-row detached character-part atlas. Input images 2 and 3 are STYLE REFERENCES supplied by the user (Kingdom Rush gameplay). Restyle the entire atlas to match the small in-game cartoon troops of those references.
Change the rendering style to bold, clean, playful hand-drawn chibi sprites: very large simple expressive heads, short squat bodies, chunky rounded hands and boots, strong dark brown/near-black outlines, clear saturated flat color masses with only 2–3 broad cel-shading bands, modest painterly highlights. Make the survivor distinctly chibi, bright warm skin, brown hair, olive military cap, ochre tactical vest and rust shirt; zombies retain green/gray skin and readable brown/burgundy/slate/ochre outfit distinctions. Match the compact mobile tower-defense troop feel of reference images 2 and 3, not an illustrated portrait. Slight three-quarter front/side view, upright.
Remove the target image's mottled realistic texture, excessive scratches, tiny rivets, detailed pores and gritty rendering. Keep the artwork crisp and easily readable when assembled at approximately 40–65 px high. Heads should occupy approximately 55% of each head+torso piece. Simplify equipment into thick distinct shapes. No gore.
CRITICAL INVARIANTS: preserve atlas composition and character order, exactly 15 isolated objects in exactly the same 5 columns and 3 rows. Left to right: survivor, ordinary zombie, fast zombie, heavy zombie, bloated zombie. Row 1 contains only combined HEAD+TORSO, no arms, no hands, no legs, no feet, no weapons. Row 2 only one detached horizontal ARM+HAND per character, shoulder LEFT hand RIGHT. Row 3 only one detached upright LEG+BOOT per character, thigh TOP boot BOTTOM. Same orientation as target so code can animate arms and legs separately. The heavy and bloated types may be wider. No complete characters, no extra items. Use approximately the same object placement and generous transparent gaps so each can be independently cropped. Preserve genuine transparent alpha and canvas aspect ratio. No scenery, shadows on floor, text, logos, labels, grid or watermark. This is a texture asset, not a UI or full gameplay screenshot.
```

## 平民主角最终编辑提示词

```text
Use case: precise-object-edit.
Asset type: existing transparent 5-column × 3-row modular 2D game character atlas.
Edit target: the supplied atlas. Change ONLY the FIRST COLUMN (human survivor body, detached arm, detached leg). Keep the four zombie columns, their exact positions, shapes and colors unchanged. Keep transparent background, same canvas and 15 isolated components, same rows and approximate crop positions.
User request: remove the survivor's hat and make him an ordinary CIVILIAN, no professional army uniform or equipment.
First column row 1: cute chibi ordinary young man with uncovered tousled brown hair and a big expressive head, warm skin, alert determined eyes. Remove cap entirely. Replace tactical vest, straps, ammo pouches, body armor and scarf with a simple everyday rust-red casual rolled-sleeve shirt over a cream T-shirt, ordinary blue jeans visible only at hip/belt bottom. Ordinary small brown belt if needed, no utility pockets or military gear.
First column row 2: matching single horizontal detached arm, rust-red casual rolled sleeve on LEFT and ungloved bare human hand on RIGHT. NO tactical glove, cuff armor, watch, weapon, other arm or body.
First column row 3: matching single detached upright leg in simple blue denim jeans and a chunky casual cream/white canvas sneaker, thigh TOP shoe BOTTOM, same mildly bent shape. NO combat boot, knee pad, armor, cargo pouch.
Keep the clean Kingdom Rush-like small in-game troop cartoon style: strong dark outlines, simple saturated color areas, broad cel shading, oversized head and squat proportions. Keep body upright and no attached limbs in row 1, no weapon in any piece. No military costume, cap, helmet, tactical webbing, text, grid, backdrop, floor shadow, watermark or extra objects.
```
