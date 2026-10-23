# 《尸潮：最后一夜》项目状态

**LAST NIGHT SURVIVOR**  
更新时间：2026-10-15（Asia/Shanghai）

## 2026-10-23 集成记录（xa1217/Zombie_Gunfight）

- 按《尸潮：最后一夜》计划书接棒：最新功能基线 `work/codex/reload-speed-20261014@41da623`（源在 honru09/JiangShi_Gun_Game）已集成到本仓库 main 线：按枪换弹（9 把枪各有 reloadTime）、手雷/燃烧瓶右侧双独立按钮（各上限 5、手动一次性消耗、满库存保留地面物）、底部旧道具栏移除、捕兽夹/灭火器不再掉落。
- 集成方式：cherry-pick 3cbbbce / a2e4b2b / 41da623 到 335274f 之上；冲突仅出现在测试文件，已按 41da623 线版本解决。335274f 自带的另一套测试变体与新行为不兼容（combat 变体期望 scatterModule 地面掉落、throwable 变体期望 throwableProjectiles 字段），实测不通过，未采用。
- 本轮实测：scripts/validate.mjs PASS；combat / loot / throwable-inventory / item-integration / spawn-schedule / landscape-controls / character-motion / door-combat / item-effects / character-anatomy / verify-loot --unit-only 均 PASS；换弹专项因无头画布桩逐步记录绘制调用会撑爆沙盒内存（纯 41da623 同样复现，非集成问题），已改为逐枪独立进程复跑，9 把枪的换弹时长/弹匣/锁定/解锁全部 PASS。
- 未在本环境执行：item-visual-smoke、house-art-smoke（需 playwright，沙盒未装，改由真实浏览器公网验收覆盖）；city-map-smoke 全量在沙盒内存上限中断（--unit-only 首项 PASS），与旧基线表现一致。
- 公网：GitHub Pages（main / 根目录）自动发布本集成版本，地址 https://xa1217.github.io/Zombie_Gunfight/prototype-2d/index.html 。

## 当前交付

- 当前项目：`F:\Project\Xiyou_EightyOne_Calamities`，横屏 2D 网页与原生微信小程序原型。
- 网页已集成“界面”“玩法”“角色样式”三个窗口的完成内容，并接入横屏摇杆、手动开火、枪械弹药和搜打撤物资箱。
- 最新界面交付 `work/codex/role-merge-20261011@e11ef8a` 已合入 `work/codex/interface-integration-20261014`；本轮包括房屋、23张道具图片、特效与角色动作。
- 网页单局 **300 秒**，生命归零失败，到时撤离成功；结算冻结战斗并支持重开。
- 微信小程序保留 **180 秒**战斗原型，本轮只合入已完成的角色帧与素材失败兜底修复，未扩展网页房屋与掉落玩法。

## 合并后的功能

| 模块 | 当前事实 |
| --- | --- |
| 统一美术 | 保留界面窗口的暖色手绘环境和角色图集；建筑、树木与人物按深度排序 |
| 素材加载 | 环境和角色素材正常加载后显示完整美术；失败/超时启用 Canvas/矢量兜底保持可玩；道具图片未就绪时保留符号，恢复后自动更新栏位 |
| 城市 | 1440×2560 世界、1280×720 横屏视口、六栋放大房屋、六地块、1纵2横道路；贴图按建筑类别对应 |
| 房屋 | 六种暖色室内布局，商店、住宅及高楼一层等；前后双门连续进出，同一世界与相机，当前房屋揭顶；家具、搜索点与状态持久化 |
| 寻路 | 房屋走廊与门洞加宽，室内外感染者可持续追击；家具和墙体阻挡移动与弹道 |
| 构筑 | 1格主武器、右侧手雷/燃烧瓶双按钮、2格增益；求生本能保留在构筑/暂停表；Space/右侧按钮手动开火 |
| 自动道具 | 手雷、燃烧瓶改为右侧独立按钮手动一次性投掷；每种最多5个，保留爆炸/燃烧特效；捕兽夹、灭火器不再掉落或触发 |
| 掉落 | 场景技能掉落严格只生成手雷和燃烧瓶，满5个时保留地面掉落；物资箱沿用当前搜打撤物资与枪械表；击杀只有经验与0.5%概率的一次性临时增益 |
| 搜打撤 | 背包默认 5 列×8 行（40 格）；真实占格、空格移动及交换校验；箱内全部未知物资格与总/剩余数量首开即显示，按品质逐项识别；进度持久化，显式领取/使用、拖出丢弃；完整原作规则尚未对齐 |
| 角色 | 命名两帧walk/run/crawl及跳跃阶段；左右瞄准肩掌连接、双臂层级、爬行者双臂双腿完整；重型腾空免接触伤害 |
| 僵尸生成 | 开局室外随机3–6只，每屋2–5只；15秒首波，此后每20秒从地图边缘可通行空地/街道涌入；波次人数4只起、每波+2、默认最多22只 |
| 数量上限 | 网页桌面160、触屏104；房内外共享全局上限，室内人数不阻止地图边缘增援；微信标准104、省电72 |

## 2026-10-15 双投掷道具按钮与掉落收敛

任务：将场景可拾取的一次性道具收敛为手雷、燃烧瓶，并在右侧提供两个独立使用按钮。

- 删除底部旧道具栏和长按选择面板；右侧分别显示手雷、燃烧瓶按钮及当前数量。
- 每种道具最多携带 5 个；达到上限时不消耗地面掉落，并将上限提示按秒节流，避免提示闪烁。
- 点击按钮只消耗对应种类并触发手动投掷、爆炸或燃烧效果；打开背包/搜索窗口、暂停、死亡和结算时按钮不穿透使用。
- 随机地面技能球和显式掉落入口过滤所有非手雷/燃烧瓶技能；保留主武器枪械兼容拾取路径。捕兽夹、灭火器不再生成或自动释放。
- 僵尸击杀掉落仍独立使用 0.5% 临时增益表，不会混入手雷/燃烧瓶库存。

改动文件：`prototype-2d/index.html`、`prototype-2d/loot-system.js`、`prototype-2d/README.md`、`scripts/verify-loot.mjs`、`prototype-2d/tests/` 下投掷物、战斗、物资和视觉回归脚本。

实际验收：`node scripts/validate.mjs`、`node prototype-2d/tests/throwable-inventory-smoke.mjs`、`node prototype-2d/tests/item-integration.mjs`、`node prototype-2d/tests/combat-smoke.mjs`、`node prototype-2d/tests/loot-smoke.mjs --unit-only`、`node scripts/verify-loot.mjs --unit-only`、`node prototype-2d/tests/spawn-schedule-smoke.mjs`、`node prototype-2d/tests/landscape-controls-smoke.mjs`、`node prototype-2d/tests/character-motion-smoke.mjs`、`node prototype-2d/tests/city-map-smoke.mjs --unit-only`、`NODE_OPTIONS=--max-old-space-size=8192 node prototype-2d/tests/reload-speed-smoke.mjs`、`git diff --check` 均通过。Edge 视觉验收 `item-visual-smoke.mjs` 通过：两个按钮在视口内、素材加载后可点击、数量各自扣减、无旧底部栏。

限制：未执行微信真机、真实触屏设备和真人五分钟试玩；公网发布需在本轮提交后创建新的本地服务与 Tunnelmole 地址，保留既有测试地址不覆盖。

## 2026-10-14 延迟波次与开局居民

任务：[Issue #5](https://github.com/honru09/JiangShi_Gun_Game/issues/5)，交付分支 `work/codex/zombie-waves-20261014`，基线为已推送的 `work/codex/search-slots-20261014@a0a767c`。

- 开局全地图室外随机3–6只慢速僵尸，六栋房屋内各随机2–5只，避开墙体、家具和其他僵尸。
- 室内居民开局已存在；进入该屋或伤害居民后唤醒，之后沿同一地图追击。首次进入、离开和重入均不补怪。
- 第15秒首次增援，此后每20秒一批；每波4只起、逐波+2至22只，管理员密度按批次缩放人数。
- 增援只在世界四周的可通行室外产生，独立于相机和玩家所在房屋；取消原连续生成与房内直接生成。
- HUD显示准备倒计时、实际波次和下一波倒计时；五分钟结算、后期类型/强度增长、160/104上限及0.5%临时增益掉落保持。

改动文件：`prototype-2d/index.html`、`prototype-2d/tests/spawn-schedule-smoke.mjs`、`prototype-2d/tests/combat-smoke.mjs`、`prototype-2d/tests/loot-smoke.mjs`、`prototype-2d/tests/city-map-smoke.mjs`、`scripts/verify-combat.mjs`、`STATUS.md`。测试任务独立分支提交 `e70701a` 已集成。

实际验收：`node scripts/validate.mjs`、`node prototype-2d/tests/spawn-schedule-smoke.mjs`、`node prototype-2d/tests/combat-smoke.mjs`、`node scripts/verify-loot.mjs --unit-only`、`node prototype-2d/tests/city-map-smoke.mjs --unit-only`、`node prototype-2d/tests/landscape-controls-smoke.mjs`、`node prototype-2d/tests/character-motion-smoke.mjs`、`node scripts/verify-combat.mjs --browser-only`、`git diff --check` 均 PASS。刷怪脚本包含8轮随机重开、15/35秒边界、每波人数至22只、每屋居民/唤醒、合法世界边缘、密度0/无限计时器、数量上限、暂停/死亡/结算。

Edge实际1280×720及844×390通过开局数量、15秒首波、35秒第二波、暂停、真实键盘穿门、进屋不增加人数、房内玩家时增援仍在世界边缘、素材加载和重开；桌面及触屏另通过299秒模拟战斗、160/104上限、手动射击和300秒结算，页面无脚本错误。浏览器截图/报告保存在忽略目录`work/runtime-current/zombie-waves-*`及本机`evidence/local/`。微信逻辑未修改；微信仅桩测试通过，微信真机与真人五分钟试玩未执行。

新临时公网：[进入本轮试玩](https://z2fepo-ip-66-90-98-34.tunnelmole.net/)。独立8082端口，公开`work/releases/zombie-waves-20261014/prototype-2d`的`4d6a863`静态快照；入口与环境/角色PNG均HTTP 200，禁用缓存，内容与快照一致。公网Edge实际1280×720及844×390通过开局、15/35秒边缘波次、穿门、暂停、重开及素材加载，无页面脚本错误。本机服务进程12668、隧道进程12604，运行信息及证据保存在忽略目录`work/runtime-current/zombie-waves-*`。

旧物资格测试快照与8081服务保留；本轮检查旧域名`vr5kij-ip-66-90-98-34.tunnelmole.net`已返回404、旧隧道进程已结束，不能把它标为仍在线。临时公网依赖本机及隧道进程持续运行。

## 2026-10-14 物资箱首开显示修复

任务：[Issue #3](https://github.com/honru09/JiangShi_Gun_Game/issues/3)，交付分支 `work/codex/search-slots-20261014`，以已上传的界面集成 `556c4f9` 为基线；代码提交 `de26fcf`。

- 开箱时立即显示全部未带走物资的中性未知格，按真实宽高占格；只有当前识别项有扫描动画。
- 同时显示原有总数及剩余数量，领取后扣减剩余；不泄露未识别物资的名称、图片、品质和等级。
- 搜索仍按品质顺序推进，未识别不可领取；锁箱显示未知格和总量但保持识别/领取锁门禁。
- 关闭/重开、暂停、已领取不回生与背包规则保持通过回归。

改动文件：`prototype-2d/index.html`、`prototype-2d/tests/loot-smoke.mjs`、`scripts/verify-loot.mjs`、`STATUS.md`。

实际验收：`node scripts/validate.mjs`、`node scripts/verify-loot.mjs --unit-only`、`node scripts/verify-loot.mjs --browser-only`、`git diff --check` 均 PASS。Edge 的1280×720、960×540、844×390均通过全部未知格/数量、锁箱、解锁、2×2与1×3物资揭示前后位置不变、领取和重开；无页面脚本错误。

新临时公网：[进入本轮测试](https://vr5kij-ip-66-90-98-34.tunnelmole.net/)。独立端口8081，公开 `work/releases/search-slots-20261014/prototype-2d` 的已验收快照，禁用缓存；入口和PNG均HTTP 200且与快照一致。公网Edge实际844×390验收 PASS：开局、全部未知格/总数、识别、领取及重开正常，角色/道具图片全部就绪，无页面脚本错误。

本机服务进程11888、隧道进程14792；运行记录及公网证据保存在忽略目录 `work/runtime-current/search-slots-*`，不提交。微信真机与真人五分钟试玩未执行；临时地址依赖本机与隧道持续运行。

## 2026-10-14 界面窗口合并

来源：界面窗口最后交付 `work/codex/role-merge-20261011@e11ef8a`。以已推送的 `work/codex/firearms-integration@95eac8c` 为基线，整合到 `work/codex/interface-integration-20261014`。任务为 GitHub Issue #1；仓库尚无 `main`，PR 目标为当前默认分支 `work/codex/firearms-integration`。

完成内容：六类暖色室内、双门和建筑立面/屋顶；23张透明道具图片及场景特效；主角双臂层级与掌心投掷；贴身和门洞射击修复。保留横屏手动开火、300秒、枪械弹匣/备弹、物资逐项识别、40格背包和0.5%临时增益掉落。修复图片失败空图标，恢复加载后自动刷新栏位；角色图集失败也保留投掷动作与手持灭火器；触屏道具栏避开摇杆/开火/背包按钮。

实际验收：仓库语法配置、搜索背包、横屏控制、战斗300秒/160及104上限、角色动作/骨架、道具图片/特效/掌心动作、城市/房屋连通、双门射击均 PASS。Edge 实际浏览器通过六屋进出、室内外画面、搜索/背包3种尺寸、道具释放和贴图延迟/失败兜底；页面无脚本错误。具体命令、文件与限制见 `docs/INTERFACE-MERGE-ACCEPTANCE.md`。

微信真机、真人五分钟试玩、本轮新公网发布：NOT RUN。GitHub 自动工作流尚未入库；本次记录的是本机实际验收结果。

## 2026-10-13 背包与搜索修复（历史记录）

用户要求完整复现《阿皮大冒险》的全部物资和背包。**该要求尚未完成**：目前只能核实新手箱四件物资的名称，缺少完整物资清单、背包容量/占格/堆叠/装备/局外仓库规则和数值。保留原型数据并明确标注，不把推测物资当作已复制的原作内容。

本轮完成：搜索箱内容与地面掉落分离；关闭/暂停不再绕过识别；识别进度可续接；已领取物资不可重复领取；搜索和背包并排；单件/批量领取；固定格位、保留空隙、尺寸和交换校验；独立使用与丢弃；部分弹药保留；杂物不可误消耗；拖拽取消/标题松手/暂停/结算保护。

### 本轮实际运行

- `node scripts/validate.mjs`：PASS。
- `node scripts/verify-loot.mjs --unit-only`：PASS，更新断言后直接运行实际网页脚本，调试拾取与正式拾取行为一致。
- `node prototype-2d/tests/landscape-controls-smoke.mjs`：PASS。
- `node prototype-2d/tests/combat-smoke.mjs`：PASS，包括 300 秒结算、160/104 上限和暂停。
- `node prototype-2d/tests/city-map-smoke.mjs --unit-only`：PASS，同世界进出与室内路径保持。
- 内置浏览器：PASS，844×390 视口下实际操作搜索/背包、单件与批量带入、两格移动/跨行拒绝、标题取消、显式使用、拖出丢弃、暂停恢复；截图 `evidence/local/scene-loot/inventory-phone-preview.jpg`。
- 新临时公网：PASS，HTTP 200，响应内容与当前 `prototype-2d/index.html` 完全一致，`Cache-Control: no-store`。
- `node scripts/verify-loot.mjs --browser-only`：**未完成**，Edge 启动权限请求未获批准。新增的 3 尺寸与触屏取消自动验收尚未完整执行，不能沿用上轮浏览器 PASS。
- 微信真机、真人五分钟试玩、原作逐项对照：**NOT RUN**。
- `git diff --check`：PASS。当前任务分支已推送到 `https://github.com/honru09/JiangShi_Gun_Game.git` 的 `work/codex/firearms-integration`；未更新 `main`。

改动文件：`prototype-2d/index.html`、`loot-system.js`、`README.md`、`tests/loot-smoke.mjs`、`tests/combat-smoke.mjs`、`tests/city-map-smoke.mjs`、`tests/inventory-preview.html`、`scripts/verify-loot.mjs`、`STATUS.md`。

## 上轮集成验证（历史结果）

| 验证 | 结果与范围 |
| --- | --- |
| `node scripts/validate.mjs` | PASS：网页/微信脚本、JSON、横屏配置、入口 |
| `node prototype-2d/tests/combat-smoke.mjs` | PASS：300秒结算、重开、7槽、射击、移动、暂停、死亡、160/104上限与四种运动协议 |
| `node prototype-2d/tests/city-map-smoke.mjs --unit-only` | PASS：六房屋、室内连通、半径24通行、地图绕行、同世界进出、横屏相机与手动弹道 |
| `node prototype-2d/tests/landscape-controls-smoke.mjs` | PASS：1280×720 横屏、左侧摇杆、右侧手动开火、Space、暂停/失焦释放 |
| `node prototype-2d/tests/loot-smoke.mjs --unit-only` | PASS：4类阿皮式物资箱、背包与弹药、绿色撤离、死亡清包、4/2容量、自动投掷物、临时增益、结算冻结 |
| `node scripts/verify-loot.mjs --unit-only` | PASS：真实网页脚本模拟回归 |
| `node scripts/verify-combat.mjs --mini-only` | PASS：真实PNG裁剪边界、微信桩战斗/动作、180秒结算及重开 |
| `node prototype-2d/tests/character-motion-smoke.mjs` | PASS：网页/微信7瞄准角肩掌、两帧走跑爬、跳跃阶段、双臂双腿与停止归位 |
| `node prototype-2d/tests/visual-integration-smoke.mjs` | PASS：Edge实际浏览器；延迟图集时禁止开局、失败重试恢复、第一帧即精细场景、全部六屋连续进出、390×844无横向溢出；无页面脚本错误 |
| 临时公网验收 | PASS：公网页面HTTP 200且内容与当前目录一致；Edge实际通过公网开局，300秒、六栋房屋、两类素材就绪、无脚本错误 |
| `git diff --check` | PASS |

上轮使用工作区内置 Playwright 与 Edge 运行 `scripts/verify-loot.mjs --browser-only`：PASS，1280×720 与 960×540 均完成搜箱、逐项识别、关闭窗口后拾取、背包打开、拖出丢弃、暂停、进出房屋和重开；页面无脚本错误。该验收仍不等同于微信真机试玩。

浏览器截图和报告在本机 `evidence/local/window-integration/`，不会提交。逻辑模拟不代表微信真机或五分钟真人试玩。

## 来源与协作

- 界面窗口美术提交已在基线 `3d28b31` 中；保留环境图集与主题。
- 最新玩法来自 `work/codex/house-scale` 的 `9563199`，前置 `dfb2928`。
- 地图整合提交 `6644c7b`，角色整合 `d47fb9d`，角色回归测试 `f4b2187`。
- 原项目未提交文件已保存到 `work/integration-backup-20261009/` 与名为`Preserve pre-integration root edits 2026-10-09`的Git stash；历史未跟踪设计、证据、个人文件保留。
- 最新交付分支为 `work/codex/zombie-waves-20261014`，在物资箱首开显示修复基础上调整开局僵尸与15秒后波次；GitHub 交付走任务分支及 PR。
- 所有窗口每次更新必须验收、提交、推送任务分支并创建/更新PR，见 `AGENTS.md` 和 `COLLABORATION.md`。
- GitHub：已配置 `origin` 为 `https://github.com/honru09/JiangShi_Gun_Game.git`，并成功推送 `work/codex/firearms-integration`。后续继续推进前先推送当前已验收版本；`main` 仍只通过 PR 更新。

## 上线与限制

- 当前保留测试地址：[进入试玩](https://j3bhee-ip-66-90-98-34.tunnelmole.net/)，本地入口`http://127.0.0.1:8080/`。旧地址曾出现 504，已清理旧客户端并用单一持续会话重建；后续开发另开新隧道，不覆盖此地址。
- 使用其他窗口采用的Tunnelmole；Cloudflare在本机出现边缘连接TLS握手失败，未采用其不可达地址。
- 服务直接使用当前项目的`prototype-2d/`，禁用静态缓存，网页进程7552；隧道保持在持续会话中；本地进程信息及日志在忽略目录`work/runtime-current/`。素材较慢时前端会启用 Canvas/矢量兜底，不会因 30 秒门限卡死。
- 仅公开`prototype-2d/`静态网页；密钥、Git与项目内部文件不通过服务目录公开。
- 微信开发者工具编译、真机预览、体验版上传：**NOT RUN**。仍为`touristappid`。
- 临时隧道依赖本机服务和隧道进程持续运行，不是永久托管。无多人联机或状态同步。
