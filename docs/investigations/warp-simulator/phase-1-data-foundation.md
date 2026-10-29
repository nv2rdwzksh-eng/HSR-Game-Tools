# Warp Simulator Phase 1：数据基础设施

实施与验证日期：2026-10-15（Asia/Shanghai）。现行维护契约见[游戏数据指南](../../game-data.md#warp-数据基础设施)。本报告记录本阶段交付，不授权下一阶段开发。

## 结果与边界

已在 `HSR-Game-Tools/develop` 实施独立 Item Catalog、人工 Banner JSONC、本地 JSON Schema、名称查询、验证器及静态快照构建器。排轴的代码、数据 Schema、快照、图片、方案与存档均未修改；没有概率引擎、抽取逻辑、会话、页面、配置管理器或新路由。

当前维护目录有 **268 个条目：98 个角色、170 个光锥**，来源 GachaID／类型索引有 **292 条**，其中 Newbie 标记为 unsupported。没有将完整目录或 Release 标记当作抽取资格。初始人工配置明确保留五类 pending，**有效 Banner 为零**；运行时 Manifest 为 `incomplete`，运行时物品及候选池也为空。这是资料未齐的明确交付，不是假造有效卡池。

物品身份为 `avatar:<ID>`／`light-cone:<ID>`；Banner 身份由 `gacha:<GachaID>` 派生；继承组为独立的 `pity:<kind>` 元数据。继承组没有计数或状态转移实现，也不以 UI GroupID 或 Banner ID 替代。

## 最终目录、接口与命令

```text
scripts/warp-data/
  source-lock.json                 固定来源及转换版本
  banners.jsonc                    人工名单、来源说明与待办
  model.ts                         目录投影、JSONC、Schema、语义验证与裁剪
  files.ts                         文件哈希、独占锁、发布与回滚
  pipeline.ts                      显式 Catalog／Schema／Snapshot 流程
  cli.ts                           npm 命令入口
  generated/
    catalog.json
    gacha-index.json
    manifest.json
  schema/banner-config.schema.json
src/data/
  warp-schema.ts                   独立 TypeScript 数据类型
  warp/
    snapshot.json
    manifest.json
tests/unit/warp-data.test.ts        41 项确定性测试
docs/third-party/turnbasedgamedata-README.md
```

`WarpItem` 仅保留 canonical ID、类型、星级及双语名称；`WarpPool`、`WarpBanner`、`WarpSnapshot` 定义独立运行时形状，不扩展现有排轴契约。维护产物另外保留逐项来源，运行时不携带完整原始表、TextMap 或维护来源说明。

| 命令                                                               | 实际行为                                                                |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `npm run update:warp-catalog -- --source local --root <Git根目录>` | 检查干净来源与固定 HEAD，生成并发布维护目录；不发布运行时数据           |
| `npm run generate:warp-schema`                                     | 读取仓库内 Catalog 和共享池声明，更新本地 Schema                        |
| `npm run find:warp-item -- <名称或ID>`                             | 名称／ID 子串查询，可加 `--kind avatar\|light-cone`、`--rarity 3\|4\|5` |
| `npm run build:warp-data`                                          | 校验所有输入，生成可达数据，发布运行时目录                              |
| `npm run validate:warp-data`                                       | 只读复核目录、配置、Schema、新旧一致性、哈希和正式快照                  |

新增直接开发依赖精确固定为 `jsonc-parser@3.3.1`、`ajv@8.20.0`，只有一个 npm 锁文件，没有运行时新依赖或生成钩子。原有 ESLint 所需 Ajv 6 仍由锁文件保留在其依赖树中；未升级现有直接依赖。

Schema、Catalog、Snapshot 使用确定性序列化；这些生成 JSON 在 Prettier 中精确排除。staging／backup 被 Git、ESLint 和 Prettier 忽略，正式产物保持可跟踪。文档同时更新了游戏数据维护、开发命令、来源致谢和调查索引。

## 来源、精度与实际体积

| 来源／目标               | 分支    | 固定 HEAD                                  |
| ------------------------ | ------- | ------------------------------------------ |
| HSR-Game-Tools（实施前） | develop | `4988dd993796cd6def921a0d0fbb9801c2fc119c` |
| TurnBasedGameData        | main    | `312b4597691e0a29cf9828a15b592757dba86949` |
| StarRailRes              | master  | `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487` |
| HSR-Database             | develop | `0898487b3b048d9bd6af9d734208590deb38737a` |

显式更新仅消费 TurnBasedGameData 的 AvatarConfig、AvatarConfigLD、EquipmentConfig、GachaBasicInfo 和 CHS／EN 两份 TextMap，六份文件共 **112,036,681 bytes**。StarRailRes 和 HSR-Database 未成为 Warp 更新输入。没有可靠游戏版本元数据，因此记录 Commit，不借用现有排轴版本。

Hash 通过 Node 24 reviver 的 `context.source` 直接取得原始数字字符，始终以字符串查 TextMap。相邻大整数 `9007199254740992`／`9007199254740993` 及 `18446744073709551615` 已由合成测试覆盖；不会通过舍入后的 Number 回建键。

名称只去除已观察的 `<unbreak>` 标签并规范空白，保留 `{NICKNAME}`，未知标签或缺少双语名称会失败。名称不参与身份关联：真实查询“中文三月七”或英文 `March 7th` 均返回独立的 `avatar:1001`、`avatar:1224`。

Manifest 记录每个条目的来源表、记录键、完整名称 Hash，以及六份输入和两份目录产物的字节／SHA-256。Gacha 索引仅记录类型，不从展示路径猜 UP、成员、日期或权重。

| 生成文件                  | 实测 bytes |
| ------------------------- | ---------: |
| 维护 catalog.json         |     48,241 |
| 维护 gacha-index.json     |     20,175 |
| 维护 manifest.json        |     44,401 |
| banner-config.schema.json |     93,090 |
| 运行时 snapshot.json      |         78 |
| 运行时 manifest.json      |        943 |

运行时两文件当前合计 **1,021 bytes**，因真实卡池尚未填充，不能以此预测完整配置后的体积。维护数据三文件合计 112,817 bytes；Schema 93,090 bytes。没有新增图片或资源下载。

感谢 Dimbreath 整理原始数据，固定来源 README 已按原字节复制并保留致谢说明；该 Commit 根目录无 LICENSE，不重新许可来源或游戏内容。

## 配置校验与失败恢复

共享池以 ID 复用三星／四星／五星候选集合。三星限定光锥；共享四星可混合两类物品；五星按 avatar／light-cone／mixed 声明验证，mixed 必须包含两类。每个集合非空且 ID 不重复。物品目录本身不决定成员资格。

五类 Banner 分支分别约束来源 GachaID、继承组、兼容共享池及 UP：Event 要一个同类型五星和三个不同的同类型四星；Fate 禁止四星 UP；Ordinary 禁止全部 UP。每项有效配置要求来源说明，但工具不会将维护者填入的说明自动认证为完整真实名单。UP 和候选资格独立，既不自动追加也不自动排除交集。

JSONC 支持注释和尾逗号，拒绝重复键。Draft-07 与额外语义校验覆盖未知字段／ID、星级及类型不符、UP 数量、重复 GachaID／候选池 ID、非法引用、缺证空字段、来源锁和版本错误。诊断含文件、行列、JSON Pointer。Schema 在 Catalog 或共享池引用变化后过期会阻断 build。合法配置或注释变更后，旧运行时输入哈希不再匹配，必须显式重建。

三个生成流程共用独占锁；输入读取与 Schema 生成也处于维护锁内。目录在 staging 完整验证后备份原目录，再安装新目录；在备份后和安装后注入异常均恢复原字节。首次发布失败不留下正式半成品；不合法来源、配置、过期 Schema 或校验和不匹配也不会改写既有快照。

Schema 单文件通过同文件系统 rename 替换。目录发布并非进程强杀下始终可用的无间隙切换；回滚自身失败保留锁、stage 和备份，不自动破坏恢复证据。清理失败以明确警告报告，避免将已成功发布的有效快照误报为生成失败。人工恢复规则见维护指南。

## IntelliSense 实际验证

使用本机 **VS Code 1.141.2** 自带 JSON Language Server，经标准 stdio LSP 在内存中打开文档、请求 completion／diagnostic；没有安装 VS Code 扩展、没有启动浏览器或执行 UI 自动化。另一次探针启用仅 file 协议解析，通过真实 JSONC 相对 `$schema` 路径读取磁盘 Schema，而非仅验证内联关联。

| 探针                                | 实际结果                                                              |
| ----------------------------------- | --------------------------------------------------------------------- |
| 原始 banners.jsonc 相对 Schema 关联 | 成功；注释和尾逗号配置为 0 条诊断                                     |
| `event-avatar.up5`                  | 75 个 ID，全部为五星 avatar；包括目录中的非跃迁形态，资格仍由人工确认 |
| `event-light-cone.up4[]`            | 73 个 ID，全部为四星 light-cone                                       |
| `sharedPools[].threeStar[]`         | 25 个 ID，全部为三星 light-cone                                       |
| avatar 共享池的 `fiveStar[]`        | 75 个五星 avatar ID                                                   |
| 双语说明及插入文本                  | 例如 `姬子 · Himeko — 角色 / Avatar · 5★`，插入文本为 `"avatar:1003"` |
| Banner 数组空元素                   | 返回全部五类填写模板；无虚构实际 UP／名单                             |
| 错类型／星级候选                    | 返回对应值范围诊断及位置                                              |

探针发现 VS Code 默认可能警告尾逗号，最终 Schema 已加原生支持的 `allowComments`／`allowTrailingCommas` 扩展，和 CLI 接受范围一致。

`markdownEnumDescriptions` 提供说明，不能据此承诺按说明文字过滤。先前同机探针给 ID snippet 加“中文＋英文＋ID”标签，仍返回仅含 ID 的 `filterText`；源码也以实际值构造过滤文本。因此名称查找使用本地 CLI 补充，实际写入配置始终是内部 ID。未声称已完成人工键盘交互或中文输入法验收；维护指南提供 Ctrl+Space、双语说明、非法字段和引用刷新检查清单。

## 已执行验证与剩余维护

环境为 Node **24.21.0**、npm **11.16.0**。最终代码在系统临时目录建立仅含 HSR-Game-Tools 的副本，旁边没有 TurnBasedGameData、StarRailRes 或 HSR-Database；复制已有 npm 缓存后离线安装。首次开发依赖准备使用已验证的 `127.0.0.1:7890` 系统代理；离线验收没有下载依赖或游戏数据，二者不混同。

| 检查                                             | 结果                                                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `npm ci --offline`（缓存已准备）                 | 安装 248 个包成功；没有项目安装钩子，npm 的既有策略提示未批准 esbuild 安装脚本，未修改批准策略 |
| 独立副本 `npm test`                              | 25 个文件，318 项全部通过；Warp 41 项，含既有 foundation 与 11 个历史迁移用例                  |
| `npm run type-check`、`npm run lint`             | 通过                                                                                           |
| `npm run validate:warp-data`                     | 通过，明确输出 incomplete／readyBanners 0／pending 5                                           |
| `npm run validate:game-data`                     | 通过，排轴仍为 98 角色、3 预设、101 图片                                                       |
| 普通 `npm run build`                             | 通过，无上游目录；构建入口及现有 Bundle 名称保持一致                                           |
| 独立副本 Vite dev 启动                           | 本地随机端口 ready 后停止，未打开浏览器                                                        |
| 最终原生 JSON Language Server 探针               | 相对 Schema 加载、ID 补全及原始 JSONC 零诊断通过                                               |
| 定向 Prettier、文档本地链接及 `git diff --check` | 通过                                                                                           |

本机受限沙箱中的首轮 Vitest 在执行测试前遇到临时缓存 rename 的 EPERM；经授权在宿主本地重跑及独立副本验收通过，没有为绕开限制修改项目测试配置。Git 来源测试使用系统临时的合成仓库，关闭其用户 hooks／签名，不读取真实来源仓库；没有在目标或三个来源仓库执行 Commit。

仍须人工维护：每期 GachaID 对应的实际 UP、历史成员资格、完整共享候选集合及可核查来源；目录更新后的名单复审；编辑器真实交互验收。初始五类待办尚未补齐，因此本阶段没有可供抽取的真实卡池。

收尾检查确认三个只读来源的分支、HEAD 和干净状态与实施前一致，目标仍在 develop、HEAD 未变；改动限于 Warp 工具链、独立产物、开发依赖／忽略规则及相关文档。未修改旧模拟器、排轴功能、远程配置，未 Commit、Push、部署，也未继续概率或 UI 阶段。
