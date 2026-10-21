# 附件完整性记录

三份附件被视为同一份 V1.1 规格的不同载体，原件保留在 `D:\下载`，副本归档在项目的 `docs` 目录。以下 SHA-256 来自原件，复制后应保持一致。

| 文件 | 大小 | SHA-256 |
| --- | ---: | --- |
| `Xiyou_Codex_Greenbook_V1.1.md` | 76,247 bytes | `3248D388151B521F74648A315F847B6BF5D1667CA55BA8432B5F8424494011EC` |
| `Xiyou_Codex_Greenbook_V1.1.docx` | 89,169 bytes | `B42391D943D8F45F32AF56B4CE9B17405BD13C3D9D5ABBEBFBB8EDA81DB9CDB6` |
| `Xiyou_Codex_Greenbook_V1.1.pdf` | 1,090,404 bytes | `79942E152B89596E60AC321559BC71B2DCD4C3692901BAB1598C196222F2D990` |

## 交叉核对

- Markdown 为 1,008 行，包含 01–28 章和 T00–T22 任务表。
- DOCX 解包后得到 517 个正文段落；标题、版本主线和末尾执行原则与 Markdown 对应。
- PDF 用本机 `pypdf` 只读提取：35 页；标题为“西游：八十一劫｜前期 Codex 开发绿皮书 V1.1”；第 27 章、第 28.4 节和末尾执行原则均可检索。
- 三种载体都明确写出“本文件不是已经完成的 Unity 游戏工程”，因此本轮不把附件当作现成源码或可运行项目。
