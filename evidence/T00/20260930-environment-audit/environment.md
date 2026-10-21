# T00 环境审计证据

检查时间：2026-09-30 13:57 +09:00

## 运行位置与身份

- 当前 Codex 工作目录：`C:\Users\wangxr\Documents\Codex\2026-09-30\zai`
- 检查身份：`laptop-eg0cd1ke\tom''s computer`
- 目标项目目录：`D:\Projects\Xiyou_EightyOne_Calamities`
- 目标目录在本轮开始前不存在；创建后可写入目录和文档。

## 实际检查结果

| 检查 | 命令或方法 | 结果 |
| --- | --- | --- |
| 操作系统 | `Get-CimInstance Win32_OperatingSystem` | Windows 10 家庭中文版 10.0.19045，64 位 |
| 主机 | `Get-CimInstance Win32_ComputerSystem` | Lenovo 82AX，约 15.9 GB RAM |
| GPU | `Get-CimInstance Win32_VideoController` | NVIDIA GeForce RTX 2060；另有 OrayIddDriver Device |
| Git | `git --version` | 2.42.0.windows.2，路径 `D:\Program Files\Git\cmd\git.exe` |
| 目标 Git 仓库 | `git -C D:\Projects\Xiyou_EightyOne_Calamities status --short` | 目标目录尚未初始化为 Git 仓库，未创建提交或分支 |
| Node.js | `node --version` | v24.19.0 |
| npm | `npm --version` | 11.17.0 |
| Python | `python --version` | Python 3.14.4 |
| .NET SDK | `dotnet --version` | 未找到 SDK；仅有运行时提示 |
| Unity Editor | `Get-Command Unity`、常见目录、进程检查 | 未找到 |
| Unity Hub | `Get-Command UnityHub`、常见目录、进程检查 | 未找到 |
| Unity 环境变量 | `$env:UNITY_EDITOR` | 未设置 |
| 目标仓库 | 检查目标目录 | 新目录，无既有工程可迁移 |

## 未知或待确认

- Unity 是否将由负责人安装，以及具体补丁版本。
- 目标导出平台和输入设备。
- 真实设备、系统版本和验收方式。
- 是否有位于其他路径、需要保留的现有项目。

## 未运行项

Unity 编译、EditMode/PlayMode 测试、构建、设备测试和真人试玩均未运行。当前机器没有可调用的 Unity Editor，因此没有生成虚假的测试日志或构建结果。

## 阻断判断

T00 的审计记录已完成；T01 需要负责人补齐 Unity 和平台事实后再开始。
