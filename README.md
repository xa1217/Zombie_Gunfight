# 《尸潮：最后一夜》

**LAST NIGHT SURVIVOR**

《尸潮：最后一夜》是横屏 2D 僵尸肉鸽生存原型。网页每局坚持五分钟后撤离，支持城市与房屋探索；微信小程序保留三分钟战斗原型。

> 已合并界面、玩法与角色样式窗口：六栋大房屋、同世界连续进出、自动被动道具、手绘美术与走跑跳爬动作。浏览器等待素材就绪后开局，避免运行中变换画风。验证和发布事实见 `STATUS.md`。

## 核心体验

- **横屏 2D 生存**：以横屏画面为首要布局，WASD/方向键移动、Space 按住射击、R 换弹、E 搜索、B 背包；手机横屏左摇杆、右开火，另有手雷/燃烧瓶两个独立投掷按钮。
- **网页 7 槽**：1格主武器 + 4格被动道具 + 2格增益；求生本能保留在暂停表。
- **探索构筑**：移动拾取道具球获得并升级技能，走门进入六栋放大房屋，搜索高品质道具与枪械。
- **自动道具**：手雷、燃烧瓶、捕兽夹、灭火器自动释放。
- **感染者潮**：通过持续刷怪、追击、接触伤害、击退和死亡反馈形成生存压力。
- **管理员调试**：提供暂停、单步、生成感染者、强制升级、无敌、判定层、状态快照和事件日志等测试入口。
- **双端原型**：网页已接入五分钟探索玩法；微信保留三分钟战斗，仅同步已完成的角色动作。

当前不包含多人房间、战斗状态同步或服务端权威逻辑。三位测试员可以并行测试同一版本，但每台设备仍是独立的一局。

## 目录说明

| 路径 | 用途 |
| --- | --- |
| `prototype-2d/` | 无构建依赖的网页横屏原型 |
| `wechat-miniprogram/` | 原生微信小程序工程 |
| `docs/ZOMBIE-SURVIVAL-DESIGN.md` | 感染者生存改造目标与玩法规则 |
| `docs/TESTING.md` | 双端测试清单、三测试员分工与证据要求 |
| `CONTRIBUTING.md` | 分支、PR 和共享工作区协作规则 |
| `STATUS.md` | 当前事实、阻塞项和下一步的唯一入口 |
| `evidence/` | 可保留的正式验证记录；临时输出不提交 |
| `work/` | 本地中间文件，不提交 Git |

## 本地运行网页版本

网页版本不需要 Unity 或 npm。推荐使用静态服务器，避免浏览器对本地文件的限制：

```powershell
Set-Location F:\Project\Xiyou_EightyOne_Calamities\prototype-2d
py -m http.server 8080
```

然后打开：

- 普通入口：`http://127.0.0.1:8080/index.html`
- 测试员 1：`http://127.0.0.1:8080/index.html?tester=1`
- 测试员 2：`http://127.0.0.1:8080/index.html?tester=2`
- 测试员 3：`http://127.0.0.1:8080/index.html?tester=3`
- 管理员入口：`http://127.0.0.1:8080/index.html?admin=1&tester=admin`

`tester` 参数只用于区分反馈来源，不会建立联机房间或共享战斗状态。若 `py` 不可用，可尝试 `python -m http.server 8080`，也可直接打开 `prototype-2d/index.html` 做最小检查。

## 本地运行微信小程序

在微信开发者工具中导入 `wechat-miniprogram/`。CLI 请替换为本机实际安装路径；以下示例假定工具位于 `D:\Tools\微信开发者工具`，本轮未验证该安装：

```powershell
& 'D:\Tools\微信开发者工具\cli.bat' open --project 'F:\Project\Xiyou_EightyOne_Calamities\wechat-miniprogram'
```

检查登录状态：

```powershell
& 'D:\Tools\微信开发者工具\cli.bat' islogin
```

如未登录，可运行下列命令并由有权限的成员扫码：

```powershell
& 'D:\Tools\微信开发者工具\cli.bat' login
```

当前 `wechat-miniprogram/project.config.json` 仍使用占位值 `touristappid`。生成微信体验版之前，必须具备真实 AppID、已登录帐号、项目开发者权限以及所需的合法域名配置。不要把 AppSecret、登录凭证、私钥或验证码写入仓库。

## 静态检查

在 `wechat-miniprogram/` 下执行：

```powershell
node --check miniprogram/app.js
node --check miniprogram/pages/index/index.js
Get-Content project.config.json -Raw | ConvertFrom-Json | Out-Null
Get-Content miniprogram/app.json -Raw | ConvertFrom-Json | Out-Null
```

静态检查不能替代微信开发者工具编译、真机预览或人工试玩。完整验证流程见 `docs/TESTING.md`。

## 协作方式

1. 开始工作前阅读 `STATUS.md`，确认当前阻塞和负责范围。
2. 按 `CONTRIBUTING.md` 创建短生命周期的分支；网页、小程序和文档尽量分开提交。
3. 同一共享工作区内不要覆盖他人的未提交改动，不要执行破坏性的重置或全仓库格式化。
4. PR 必须说明修改范围、双端影响、已执行测试、未执行测试和已知风险。
5. 合并后由集成人更新 `STATUS.md`；只有带证据的编译、预览、测试或上传才能标记为成功。

GitHub 仓库、远程地址和体验板上传是完备域，以 `STATUS.md` 为准，不以计划或口头描述代替结果。
