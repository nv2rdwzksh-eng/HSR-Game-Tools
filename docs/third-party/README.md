# 第三方来源与许可

本页记录当前仓库的来源、已保留通知和公开发布前待确认事项。维护者已确定：本项目自行编写且拥有许可权的代码与配套文档采用根目录 [MIT License](../../LICENSE)。第三方内容继续遵循原始许可与权利归属，不因此自动重新许可。
快照维护见[游戏数据指南](../game-data.md)，历史调查见[investigations](../investigations/README.md)。

## 来源与用途

| 类别                 | 来源与固定身份                                                                                                            | 当前用途与通知                                                                                                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 衍生代码             | [HSR-Database](https://github.com/Oereor/HSR-Database)，Commit `72c2d4d1b9ccc0fc0bb191d16ac29492750ea1b0`                 | 排轴引擎、部分纯草稿 / 预设 / AV 格式化逻辑与机制测试；保留 [MIT 原通知](hsr-database-MIT.txt)，Copyright (c) 2026 oereor                                                                                                                                               |
| 名称与别名投影       | 同一 HSR-Database 来源版本                                                                                                | 有限角色名称与已分类别名，provenance 见 [overlays.json](../../scripts/game-data/overlays.json)，无运行时旧站依赖                                                                                                                                                        |
| 规范化数据与必要图片 | [StarRailRes](https://github.com/Mar-7th/StarRailRes)，Commit `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`                  | 双语条目、角色和装备 WebP，以及 Warp 立绘、封面、命途／属性／星级图标（[独立 Manifest](../../src/tools/warp-simulator/data/visuals/manifest.json)）；保留 [AGPL v3 文本](starrailres-AGPL-3.0.txt)，来源及转换记录见 [Manifest](../../src/tools/action-planner/data/game/manifest.json)                                                                                                           |
| Warp 目录及机制参考  | [TurnBasedGameData](https://github.com/DimbreathBot/TurnBasedGameData)，Commit `312b4597691e0a29cf9828a15b592757dba86949` | Warp 显式本地更新器提取角色／光锥 ID、星级、双语名称及 GachaID／类型；感谢 Dimbreath 的数据整理，保留[固定 README](turnbasedgamedata-README.md)。README 希望致谢（appreciated），不将其写为强制许可条款；该 Commit 根目录没有 LICENSE。原始表／TextMap 不是普通构建输入 |
| UI 图标              | [Lucide](https://github.com/lucide-icons/lucide)，当前依赖版本见 [package.json](../../package.json)                       | @lucide/vue 1.55.0 安装包包含 ISC（2026 Lucide Icons and Contributors）及所列 Feather 图标的 MIT 通知；本地 GitHub SVG 旧通知不能替代此版本通知                                                                                                                         |
| 本地 GitHub SVG      | [Lucide 0.468.0 的 github.svg](https://github.com/lucide-icons/lucide/blob/0.468.0/icons/github.svg)                      | 本地 Vue 组件只调整显示尺寸和线宽；保留 [ISC / Feather MIT 通知](../../public/third-party/lucide-github-LICENSE.txt)，随 public 目录进入静态构建                                                                                                                        |
| 产品设计启发         | [HSR-Action-Planner](https://github.com/THyanNK/HSR-Action-Planner)                                                       | 行动序列模拟器的早期产品设计受到启发；本工具不是其官方版本，此条不主张复制其源码                                                                                                                                                                                        |

来源代码 Commit 与今天只读参考文档的 Commit 是不同身份，不因参考仓库更新而改写历史 provenance。
货币战争控制台原型也从上述固定 TurnBasedGameData Commit 提取人数计算所需的角色、羁绊、星徽和中文名称，感谢 Dimbreath 的数据整理；来源文件哈希与转换规则见其 [Manifest](../../data/currency-wars/manifest.json)。新增求解器依赖 [highs-js](https://github.com/lovasoa/highs-js) 精确锁定为 `highs@1.15.3`，安装包保留 MIT LICENSE（Copyright 2023 highs-js / 2026 HiGHS）；网页 Worker 现在也使用该求解器，原始通知逐字保留于 [highs-LICENSE.txt](../../public/third-party/highs-LICENSE.txt)，随静态构建分发；展示数据来源及图片哈希见 [展示 Manifest](../../data/currency-wars/visuals-manifest.json)。
HSR-Database 原 MIT 通知与固定来源 LICENSE 全文相同，StarRailRes 已保留文本也与锁定 Commit 的 LICENSE 完全一致。项目 MIT 决定不删除或替换这些通知；本页不替代许可原文。

## 游戏内容与构建产物

游戏名称、角色、装备、美术及其他游戏知识产权归各自权利人所有；开源代码或索引仓库的许可不能替代游戏美术再分发授权。
本项目与《崩坏：星穹铁道》及其相关方无官方关联，不暗示官方认可或合作。

当前静态应用消费仓库内规范化角色 / 预设 JSON 和必要 WebP，数量与固定版本见游戏数据指南。
常规构建不会打包上游 Git 历史、原始完整索引、TextMap 或旧站生成目录，但裁剪与转换本身不消除可能适用的来源义务。
构建和技术校验通过，不构成项目许可、数据派生许可或素材公开分发问题已解决的证明。

## 静态发布通知现状

本轮实际执行一次普通 Vite build，未触发数据更新：

- public 的 102 个文件逐字节复制到 dist，包含 101 张 WebP 和 `third-party/lucide-github-LICENSE.txt`。
- catalog.json 中的角色、预设与资源映射进入客户端 JavaScript Bundle；Manifest、Source Lock 和 overlays 的独立源文件不作为公开文件输出。
- 根 LICENSE、README、docs 及其中的 HSR-Database MIT / StarRailRes AGPL 文本不在 dist；Bundle 中也未发现它们的完整通知或当前 Lucide 包的完整通知。
- 唯一已输出的通知可由 `<站点 base>/third-party/lucide-github-LICENSE.txt` 直接访问，但当前 UI 没有通知导航入口；尚无部署，未验证线上可访问性。

因此仓库保留声明与静态产物携带声明是两项不同的检查。MIT 要求复制或实质部分包含版权和许可通知；ISC 同样要求副本保留相应通知。现用 Lucide 与衍生代码的产物通知缺口仍需在发布前处理。
本页记录的调查未修改 UI、public 或构建脚本；具体产物证据见本节，后续建议见[发布前待确认事项](#发布前待确认事项)。

## 发布前待确认事项

项目自身 MIT 选型和标准 LICENSE 已落地，不再列为待选择事项。剩余问题为：

1. **规范化数据与派生内容**：StarRailRes 固定版本有 AGPL-3.0 文本，但 README 未细分索引、数据事实和游戏素材的适用范围。需对实际 JSON 与素材确认分类及相关义务；不能仅据根许可推断整个工具必须 AGPL，也不能据转换格式推断许可问题消失。
2. **游戏图片与视觉资源**：确认实际分发的 101 张图片及其他游戏内容公开再分发的条件，不将上游开源声明当作游戏权利人的素材授权。
3. **发布通知与源码材料**：补足实际 Bundle 中适用的 MIT / ISC / Feather 通知；如确认 AGPL 适用，按对应分发形态明确许可、修改记录、Corresponding Source 与可能适用的网络交互要求。仅提供上游链接或许可全文不自动证明已履行全部义务。
4. **公开入口**：在下一轮授权后确定声明文件与入口，并按 base 路径检查静态产物；目前没有公开站点或发布地址。

以上区分已确认技术事实和待维护者判断的权利范围，发布前待办见本节。项目 MIT 已确定不代表第三方发布条件均已满足。
许可条款依据为 [MIT 原文](https://opensource.org/license/mit)、[GNU AGPL-3.0 原文](https://www.gnu.org/licenses/agpl-3.0.html)及各来源保留的通知；本轮不作第三方重新许可、不公开分发或部署。
