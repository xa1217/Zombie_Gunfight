# 2D 测试版线上入口

更新时间：2026-09-30 19:39 +09:00

本轮视觉更新：竖屏 9:16、简化选项卡、升级 `+1` 卡片、西游卡通悟空与四类小妖矢量初稿。以下链接仍指向同一份本地静态测试版。

## 三位测试员

三个链接指向同一份竖屏 2D 测试版。`tester` 参数只用于区分转发链接，不是账号鉴权，也不会同步三人的战斗状态。

- 测试员 1：https://greatly-confidence-belfast-rules.trycloudflare.com/prototype-2d/index.html?tester=1
- 测试员 2：https://greatly-confidence-belfast-rules.trycloudflare.com/prototype-2d/index.html?tester=2
- 测试员 3：https://greatly-confidence-belfast-rules.trycloudflare.com/prototype-2d/index.html?tester=3

## 管理员

- 管理员调试：https://greatly-confidence-belfast-rules.trycloudflare.com/prototype-2d/index.html?admin=1&tester=admin

管理员面板可以暂停/继续、单步 `+1 tick`、生成测试妖、重开、切换无敌、显示判定层、复制状态快照和查看事件日志。该入口是公开测试链接，不是正式权限系统，请只在测试群内转发。

## 测试步骤

1. 用手机竖屏打开对应链接。
2. 点击“开始练习”，先选 `3 个核心 + 2 个特效`，再点击“就选这些 · 开战”。
3. 拖动左下角摇杆接近妖怪，观察悟空的“前摇 → 有效段 → 收势”攻击动作。
4. 命中积累到升级节点后，从已选技能中选一项加点；管理员可用“强制触发升级”快速演示。
5. 反馈时附上手机型号/浏览器、是否能移动、构筑选择、加点手感、是否受伤，以及管理员面板的状态快照（如能获取）。

## 线上边界

- 这是 Cloudflare Quick Tunnel 临时地址；本机静态服务或隧道进程停止后链接立即失效，地址也可能变化。
- 当前是每个浏览器独立运行的单机测试，没有多人房间、共享战斗状态、账号鉴权或服务端事件记录。
- 该链接是网页 2D 测试版，不是已经上传到微信平台的体验版。

## 微信小程序

原生小程序工程在：

```text
D:\Projects\Xiyou_EightyOne_Calamities\wechat-miniprogram
```

导入微信开发者工具后，需要真实 AppID、登录账号成员权限和合法业务域名，才能生成可被三位成员扫码进入的微信体验版。当前 `touristappid` 只是占位值，不能冒充正式上传结果。
