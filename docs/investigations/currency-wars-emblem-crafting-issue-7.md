# Issue #7：星徽数量统计与合成配方展示

> 历史记录：其中 Top-3、多方案接口、预算分割及旧 UI 描述已由 2026-10-20 单方案双目标重构取代；现行行为见[货币战争指南](../currency-wars.md)。原有测量与提交信息保留为历史证据。

日期：2026-10-17。基于 `develop` / `6b5c9598b7b7419f268c97234efcbf40f9eeba96`。本轮开始时仅有用户提供的材料图片目录未跟踪；保留这些原始文件，没有重新编码或下载图片。

## 来源、目录与覆盖

复用 Currency Wars Source Lock：TurnBasedGameData Commit `312b4597691e0a29cf9828a15b592757dba86949`，4.6.0、Season 1。显式提取器读取 `GridFightCraftConfig`、`GridFightSeasonCraft`、`GridFightEquipment`、`GridFightItems` 与中文 TextMap。`CraftID` 关联赛季，`CraftEquipID` 关联星徽装备 ID；材料名称通过既有 `parseSource` 保留的精确 Hash 字符串解析，不经 Number 转换。

[Craft Catalog](../../data/currency-wars/crafts.json)与 [Craft Manifest](../../data/currency-wars/crafts-manifest.json)独立于求解快照和原有 Visual Catalog。目录为 schemaVersion 1，包含 seasonId、材料 ID／名称／可选图标及全部星徽的配方数组。缺少星徽键属于数据错误，空数组则明确表示权威来源没有当前赛季配方。

实际核对：22 种星徽，17 种具有配方，18 条不同配方，11 种材料。没有按这些数字硬编码生成规则。

欢愉星徽 `35052012` 保留两条替代配方：

| CraftID | 材料 ID             | 名称          |
| ------- | ------------------- | ------------- |
| 57      | `350602` + `352101` | 蓝钻 + 垃圾袋 |
| 58      | `350601` + `352101` | 红钻 + 垃圾袋 |

只有“产物＋材料多重集合”相同的配方才合并，`craftIds` 保留全部来源 ID；材料顺序不影响去重，同一种材料出现两次仍保留两份。输出按稳定 ID 和 CraftID 顺序生成。

当前无 Season 1 配方的星徽：

| 星徽 ID  | 名称         |
| -------- | ------------ |
| 35051001 | 列车同行星徽 |
| 35051013 | 命运圣杯星徽 |
| 35052005 | 治疗星徽     |
| 35052009 | 量子同频星徽 |
| 35052010 | 护盾星徽     |

Manifest 记录来源 Commit、赛季、转换版本、五份输入 SHA-256、算法快照 SHA-256、目录 SHA-256、图片 SHA-256、配方覆盖与缺图 ID。显式提取要求来源是干净 Git 根目录且 HEAD 等于 Source Lock；常规安装、开发、测试、构建和校验不访问上游。

```bash
npm run extract:currency-wars-crafts -- --root ../TurnBasedGameData
npm run validate:currency-wars-crafts
```

重复提取已经实际验证字节一致：

- `crafts.json` SHA-256：`a5a5e3ed4adee87606e022ed5dcf9fcd36b03ae2bc088c3457149c6916b6c1fb`。
- `crafts-manifest.json` SHA-256：`b6f0e73044fc49b161195abfa7d6c19f2dcb916b54392903157d0f86d7b18abb`。

## 图片与资源隔离

使用用户已提供的 `public/game-assets/currency-war-equipments/{id}.webp`，11 张均为 128×128 WebP：

- `350201`–`350208`：轮滑鞋、折叠小刀、和平手枪、幸运星、生命之花、量产型装甲、以太钻头、光能电池。
- `350601`、`350602`：红钻、蓝钻。
- `352101`：垃圾袋，来源装备类别为 Trash，未错误限制为 Basic 装备或钻石。

缺失材料名称 ID：无。缺失材料图片 ID：无。图片映射与哈希由新 Craft Manifest 校验，不改动原有角色、星徽或羁绊映射。缺图时提取保留配方和名称并记录 ID，UI 显示中性占位；已映射资源意外丢失或改变时离线校验明确失败。

资源检查实际发现排轴 validator 会把新目录当作未知资源，`validate:game-data` 因 inventory 不匹配失败。因此在原有工具命名空间排除列表中只新增 `currency-war-equipments/`；材料资源交给 Craft Manifest 验证。回归同时验证该目录不污染排轴清单、其他未知资源仍然报错，排轴的校验和、图片格式及尺寸检查没有放宽。显式排轴整目录更新前需备份的工具资源目录同步补入维护指南。

## 展示与状态

[纯展示适配](../../src/tools/currency-wars/ui/crafting.ts)提供目录校验、`summarizeEmblemDemand` 和 `createEmblemDemand`。数量仅从当前候选的 `lineup.members[].emblemIds` 按星徽 ID 计数，数量降序、ID 升序排列，测试核对总数等于 `evaluation.emblemCount`。配方和图片元数据在展示层关联，不增加求解类型字段。

[星徽需求组件](../../src/tools/currency-wars/components/CurrencyEmblemDemand.vue)位于目标任务列表之后，按用户选择默认展开，可手动折叠。每行显示图标、名称、数量和全部配方；替代配方使用 PrimeVue Divider 与“或”，无配方仅显示 `—`，零星徽有独立空状态。每条配方只表示合成一个星徽，不汇总材料总量、库存或成本。

结果组件从原有 `solution` 属性以 computed 派生需求，不维护第二份索引或缓存。方案切换不触发 Worker；过期、历史、失败、无结果、取消均继续使用 Last Valid 中的选中方案。材料图复用 CurrencyImage／useImageSource 与 contain，根路径和子路径使用同一 BASE_URL 规则；640px 及以下配方另起一行，可换行。中英文标题、数量说明、配方提示、空状态与 ARIA 均进入 Site Messages，材料名称沿用可信中文来源。

未修改 MILP、优化目标、No-good Cut、领航员规则、其他角色特殊规则、HiGHS 版本、Worker 协议或批次时限与排序。算法快照、任务文件、原 Visual Catalog 和 Source Lock 均无改动。

## 实际验证

环境：Node 24.21.0、npm 11.16.0。最终检查结果：

| 检查                                                                  | 结果                                                                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 定向 Vitest                                                           | 13 个文件、151 项通过：Currency Wars、共享图片失败恢复、基础隔离、11 个历史迁移用例，以及排轴／Warp 资源边界 |
| `npm run type-check`                                                  | 通过                                                                                                         |
| `npm run lint`                                                        | 通过，未自动修复                                                                                             |
| 修改文件 Prettier 检查                                                | 通过；生成目录使用固定 JSON 序列化，未交给格式化器改写                                                       |
| `npm run validate:i18n`                                               | 通过                                                                                                         |
| `npm run validate:currency-wars`                                      | 通过，算法快照保持 78 个形态、33 种羁绊、22 种星徽                                                           |
| `npm run validate:currency-wars-visuals`                              | 通过，现有展示资源无变化                                                                                     |
| `npm run validate:currency-wars-crafts`                               | 通过，覆盖 22／17／18，11 种材料，无缺图                                                                     |
| `npm run validate:game-data`                                          | 目录隔离修复后通过，101 个排轴资源、missing 0、diagnostics 0                                                 |
| `npm run build`                                                       | 通过                                                                                                         |
| `npm run build -- --base /hsr/ --outDir .cache/currency-wars-subpath` | 通过                                                                                                         |
| 两种 Base 的 `verify:currency-wars-browser`                           | 均通过，真实 WASM 各返回三个独立验证候选，完成数均为 1，主线程心跳正常                                       |
| 构建资产检查                                                          | 两份产物共 22 次材料图片复制逐字节一致，展示适配生成正确根路径／子路径 URL，客户端 Bundle 包含材料路径       |
| Markdown 本地链接／标题锚点、`git diff --check`                       | 通过                                                                                                         |

数据测试涵盖赛季过滤、稳定 ID 关联、无配方、多配方、材料顺序去重、重复材料、大整数 Hash、来源／引用／名称错误、目录损坏、缺图降级、确定性及真实规范化产物。需求与 Session 测试涵盖跨角色累加、未用项省略、总量一致、候选隔离、三个方案切换不增加 Worker 请求、零星徽以及 Last Valid 保留。

构建保留原有 HiGHS 的 Node 外置化与静态／动态导入提示；VM 探针保留 Node 实验性模块提示，均未阻止验证。不运行真实浏览器自动化，不将构建／VM 探针描述为 UI 人工验收。

## 本地人工验收

1. 1440px、1024px、390px，简中／英文：区域默认展开，可通过键盘折叠，图标、名称、数量对齐，长材料名可换行，无横向溢出。
2. 切换所有实际返回候选：各星徽数量和配方分别正确，总数与摘要一致，无再次求解；无星徽候选显示空状态。
3. 含欢愉星徽时看见两条完整配方和“或”，没有把两组材料显示成同时消耗；无配方星徽继续显示图标、名称、数量和 `—`。
4. 修改配置后保留原候选需求并显示过期；失败、取消、无新结果继续使用上次有效方案，角色星徽分配不被展示操作修改。
5. 根路径与 `/hsr/` 的本地 Preview 下检查图标；临时阻止材料图片加载时，材料名和中性占位保留，其他图标正常。

现行规则与命令见[货币战争指南](../currency-wars.md#星徽需求)。未发现尚未解决的代码问题；UI 视觉与真实浏览器交互等待用户本地验收，未执行无关全仓测试。

结束时 HSR-Database（develop / `6fc8f53be3153743b1e69a8790e0a5ed1ad8d175`）、TurnBasedGameData（main / `312b4597691e0a29cf9828a15b592757dba86949`）、StarRailRes（master / `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`）的分支、HEAD 与干净状态均保持不变。本轮未 Stage、Commit、Push、创建 PR、关闭 Issue 或部署，历史实施报告未改写。
