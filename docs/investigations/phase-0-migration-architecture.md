# HSR-Game-Tools Phase 0：独立迁移架构调查

调查日期：2026-10-13（Asia/Shanghai）。本阶段只交付调查与仓库基础文件，没有迁移正式代码、创建 Vue 工程、安装新依赖、提交、推送或部署。

## 1. Executive Summary

**推荐迁移。现有 TypeScript 引擎可以通过复制及少量边界适配保留，Vue 3 + Vite 可以承载独立静态工具站。StarRailRes 的轻量索引能够满足当前角色与三项装备预设的元数据需求，但不能直接作为 UI 数据模型。**

关键结论：

- **代码阅读确认**：引擎的数学、队列、操作、目标与验证模块没有 SvelteKit、Paraglide、Node 文件系统或游戏数据依赖。不要为更换前端重写引擎。
- **实际运行验证**：使用旧站本地依赖，在系统临时目录运行 9 个现有测试文件，53 项全部通过；另生成 11 个小型行为基准，每个输入重放两次得到完全相同的结果。
- **实际运行验证**：StarRailRes 中英角色索引、旧站中英目录及合并普通／LD 表后的权威角色数据均对应 98 个 ID。全部 98 个基础速度与现有生成详情一致，中英 SPD 一致，当前晋阶阶段 SPD 恒定且增长项为零。
- **实际运行验证**：最低图片集合为 98 张角色图标、2 张遗器套装图标、1 张光锥图标；101 张原始 PNG 共 11,657,776 bytes。临时 128×128 WebP 探针共 1,148,716 bytes，全部输出含 alpha 通道。没有把这些图片迁入新仓库。
- **推荐设计**：单一 Vue SPA；工具内状态使用 Composable，先不引入 Pinia；采用 `vue-i18n` 的 Composition API 管理中英文 UI。引擎与 Vue、本地化、数据加载保持单向依赖。
- **推荐设计**：首次资源更新从本地固定 Commit 导出；后续及 CI 支持按固定 Commit 精确下载。规范化数据、必要图片和 Manifest 纳入新仓库，日常命令不触发更新、不读取并列仓库。

最大的待解决问题是名称／别名投影、静态资源发布许可，以及 Vue 状态迁移后的交互验收。**当前测试通过不等于新 Vue 应用已通过独立性或浏览器验收。**

## 2. 调查基准、路径与证据等级

实际共享目录是 `C:/Users/unkn0/Documents/Projects/HSR-Database-Project`，它本身不是 Git 仓库。以下路径以共享目录为根。

| 仓库                | 分支        | 调查 HEAD                                  | 开始／结束工作区       |
| ------------------- | ----------- | ------------------------------------------ | ---------------------- |
| `HSR-Database`      | `develop`   | `72c2d4d1b9ccc0fc0bb191d16ac29492750ea1b0` | 均干净                 |
| `StarRailRes`       | `master`    | `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487` | 均干净                 |
| `TurnBasedGameData` | `main`      | `312b4597691e0a29cf9828a15b592757dba86949` | 均干净                 |
| `HSR-Game-Tools`    | 新建 `main` | 无提交                                     | 本阶段交付文件均未暂存 |

`HSR-Database` 的 HEAD 与 `develop` 相同，调查无需切换分支。其 `upstream.lock.json` 的两个 Commit 与并列上游 HEAD 一致。旧站锁文件指向 `Mar-7th/StarRailRes`、`DimbreathBot/TurnBasedGameData`；本地上游 origin 则为 `Oereor` 镜像。新 Manifest 应记录实际来源及 Commit，不能根据文件夹名推断远程来源。

已通过代理读取 [StarRailRes 固定 Commit 的 info.json](https://raw.githubusercontent.com/Mar-7th/StarRailRes/dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487/info.json)，内容与本地一致：`version: 4.6.0`、`folder: index_min`、`timestamp: 1790691595`。更新时间不等于调查日期，也不应取代 Commit 锁定。

证据标记：

- **代码阅读确认**：源文件、配置、历史或现有索引可直接支持的结论。
- **实际运行验证**：本轮执行测试、数据比较、图片处理或官方网页读取的结果。
- **待 Phase 1 验证**：本报告提出的应用／更新器设计，尚未实现或验收。

旧 `HSR-Database/AGENTS.md` 约束原网站，不能把其中 Svelte、Paraglide、旧数据管线及“只能修改旧站”的默认规则搬进新项目。本次用户明确授权新仓库和 StarRailRes 数据调查，现有三个仓库仍保持只读。

## 3. 当前依赖审计

### 3.1 TypeScript 模块

下表路径前缀为 `HSR-Database/src/lib/action-planner/`。所有 12 个文件都是 TypeScript。除明确列出的例外，均无 `$lib`、Svelte／SvelteKit、Paraglide、其他旧站模块、Node 或浏览器 DOM 依赖。原生 `Map`、`Set`、数值与字符串 API 不构成框架依赖。

| 文件                       | 实际依赖与用途                                                                                  | 分类与最小改动                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `types.ts`                 | 无导入；计划、状态、诊断、Trace 与 `PlannerCharacterOption`                                     | **直接迁移**。核心类型保留；角色选择类型可在边界稳定后移到工具数据模型，首轮无需为此修改机制                                   |
| `queue.ts`                 | `types`；AG／SPD／AV、排序、克隆、稳定 ID、限制                                                 | **直接迁移**。保留全部排序与数值规则，不替换为 UI 四舍五入值                                                                   |
| `engine.ts`                | `effect-config`、`operations`、`queue`、`validation`、`types`                                   | **直接迁移**。保留初始化、双窗口、到期、重放、诊断及预算                                                                       |
| `operations.ts`            | `queue`、`targeting`、`validation`、`types`                                                     | **直接迁移**。保留逐操作提交、倒计时原子创建及 Trace 计算                                                                      |
| `targeting.ts`             | `types`                                                                                         | **直接迁移**。必须由执行器与目标选择器共享资格规则                                                                             |
| `validation.ts`            | `queue`、`targeting`、`types`                                                                   | **直接迁移**。保留真实运行时结构校验，不用 TypeScript 类型代替输入验证                                                         |
| `effect-config.ts`         | `types`，转导出 `targeting`                                                                     | **直接迁移**。`phaseOperations` 已是引擎依赖；保存与移动也是纯函数，首轮可保持同一文件                                         |
| `speed-duration-config.ts` | `types`；持续时间草稿与解析                                                                     | **直接迁移逻辑**。放入工具纯逻辑目录时只调整类型导入；保留空回合数代表无限的规则                                               |
| `participant-config.ts`    | `validation`、`types`；创建草稿与操作构建                                                       | **直接迁移逻辑**。仅调整路径；保留 ID、隐藏字段、种类限制和最终校验                                                            |
| `presets.ts`               | `types`；普通操作模板与翁瓦克节点限制                                                           | **直接迁移逻辑**。仅调整路径，不增加技能解析或引擎专用角色分支                                                                 |
| `presentation.ts`          | `types`、`effect-config`、`$lib/paraglide/messages.js`、Paraglide `Locale`；`Intl.NumberFormat` | **迁移后轻量适配**。复用卡片投影、操作排序、重名标签及 AV 格式；替换 `operationTitle` 与 Locale 依赖，国际化调用留在工具展示层 |
| `character-selection.ts`   | `types` 与 `../search/documents`、`normalization`、`ranking`                                    | **迁移后轻量适配**。保留槽位选择／Actor 构造；用小型角色专用搜索替换站点级类型和文本解析依赖                                   |

核心复用点：`engine.ts:47/93/160/215` 分别为初始化、步进、完整模拟、操作位置预览；`presentation.ts:16/73/85/100` 为格式化、未来记录、队列投影和稳定重名标签；`character-selection.ts:14/29/49` 为槽位选择、Actor 投影和搜索。

搜索的真实传递依赖是 `search/normalization.ts → domain/game-text.ts → domain/types.ts`（最后一项为类型），`documents.ts` 也引用站点 `EntityKind`。因此“角色搜索没使用全局服务”不等于“可以原封不动搬走而无旧站依赖”。不迁移 FlexSearch、全局索引分片、搜索路由或整个 GameText 解析器。

### 3.2 数据加载与路由

| 完整旧路径                                                          | 依赖                                                                                              | 分类与替代                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `HSR-Database/src/lib/server/action-planner.ts`                     | `./generated`、`$lib/domain`、`$lib/search`、Planner 类型；间接使用 `node:fs/promises` 与路径读取 | **重新实现**规范化快照加载。保留小型数据投影意图，不保留服务端逐角色读详情／装备目录的方法 |
| `HSR-Database/src/routes/game-tools/action-planner/+page.server.ts` | SvelteKit `locals.locale`、服务器加载器与 prerender                                               | **不再迁移**。用静态数据与 Router 懒加载替代                                               |
| `HSR-Database/src/routes/game-tools/action-planner/+page.svelte`    | Svelte、Paraglide、旧站 `formatDocumentTitle`                                                     | **重新实现**Vue 页面、标题和描述管理                                                       |

当前加载器 `loadPlannerData` 在 `src/lib/server/action-planner.ts:21`：角色取目录 ID／名称，再读取详情 `baseStats.fixed.speed`；速度无法读取时保留可选角色及手动填写入口。装备名称只取 `308`、`110`、`21018`。新项目需要的是这些有限字段，不需要所有详情、TextMap、技能树、评分或装备目录。

### 3.3 Svelte 组件逐文件边界

下表前缀为 `HSR-Database/src/lib/components/action-planner/`。这些文件均依赖 Svelte 编译／组件运行时，均含 `$lib` 导入；除 `TargetGrid`、`ParticipantIcon`，其余均直接依赖 Paraglide。没有组件直接读取 Node 文件系统，但 DOM、焦点和原生 Dialog 行为需要浏览器验证。**全部组件重新实现，不复制旧样式与组件文件。**

| 文件                       | 其他依赖及值得保留的行为                                                                                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ActionPlanner.svelte`     | Svelte `tick`、`SectionHeading`、旧语言路由、视觉 URL、引擎和投影。集中管理四槽、events、预算、视图、选中锚点、队列游标、诊断和重算；提取事件修改与游标解析纯函数，状态放入 Composable |
| `CharacterSelector.svelte` | `tick/onDestroy`、`AssetImage`、旧视觉 URL、角色搜索；重做原生 dialog 的 Esc、背景关闭、滚动锁定、搜索聚焦和焦点恢复                                                                   |
| `CharacterSlot.svelte`     | `AssetImage`、视觉 URL、槽位类型；保留基础／面板速度独立编辑、同角色选择不重置、替换生成新实例 ID                                                                                      |
| `ActionCard.svelte`        | 引擎锚点、Presentation、`ParticipantIcon`；保留未来／队列／开始节点的字段区别，配置操作与已发生 Trace 分开展示                                                                         |
| `Inspector.svelte`         | `tick`、纯保存函数、`SectionHeading`、两种表单；改成概览／编辑两种状态，统一保存、取消、删除与节点切换后的草稿清理                                                                     |
| `OperationList.svelte`     | `previewOperationState`、`moveOperation`、阶段分组、`operationTargets`、`SectionHeading`；按每条操作之前的真实状态展示目标，不从目录补出未来单位                                       |
| `EffectCard.svelte`        | Presentation、阶段／目标函数、动态 ID、`ParticipantIcon`；保留操作摘要、稳定目标标签、编辑入口及组内顺序边界                                                                           |
| `EffectForm.svelte`        | `tick`、预览、验证、预设、持续时间解析、目标规则、`PresetSection/TargetGrid`；提取普通效果草稿构建及字段错误码，保留单条群体提交与操作位置预览                                         |
| `ParticipantForm.svelte`   | `tick`、`participant-config`；复用纯草稿构建，Vue 仅负责字段输入、错误翻译与焦点                                                                                                       |
| `PresetSection.svelte`     | `CompactEntityCard`、`GameText`、旧光锥 preview／遗器 URL、纯预设及目标 Grid；新版本使用规范化名称与小图标，不迁移富文本／旧卡片系统                                                   |
| `TargetGrid.svelte`        | Planner 类型、`ParticipantLabels`、`ParticipantIcon`；保留 ID 多选、disabled 资格、键盘与可访问名称，不把名字当身份                                                                    |
| `ParticipantIcon.svelte`   | 旧 `AssetImage`；重做友方／敌方／事件的图标回退，使用本地静态映射                                                                                                                      |

现有组件内部值得提取的纯函数：`operationsAt`、更新／删除某锚点事件、由稳定锚点解析队列游标、查找不可达配置，以及 EffectForm 的草稿→操作转换。不要搬走 DOM `tick`、焦点引用、dialog 同步和滚动锁；这些属于 Vue／浏览器交互层。

参考读取了旧站的 phase1、character-selector、action-cards、dynamic-participants、inspector-participant-creation、countdown-duration、inspector-polish 和 preset-cards 调查报告。它们是历史记录：例如旧报告中的三位小数、移除速度操作、缺省 phase、叠影幅度等已与当前代码不同。**以本轮固定 develop 代码及实际测试为准，不建立旧 JSON 兼容层。**

## 4. 新引擎边界与必须保留的契约

### 4.1 分层与接口

推荐依赖方向：

```text
上游索引／图片 → 显式更新器 → 已提交规范化快照
                                      ↓
Vue 页面 → 工具 Composable／纯编辑函数 → 引擎
         → Presentation／i18n        → 引擎类型
         → 游戏数据适配器            → 快照
```

引擎输入继续是 `SimulationPlan`，输出继续是 `SimulationResult`。`ActorConfig` 中的 name／iconUrl 是调用者传入的元数据，不要求引擎认识游戏 ID、语言或图像来源。`participantCatalog` 是显示目录，不能作为运行时目标资格来源。前端预览继续调用同一引擎的 `previewOperationState`，不另外写一套 AV／目标推导。

最小接口草案（**待 Phase 1 实现**，不冻结内部实现）：

```ts
type ToolLocale = "zh-CN" | "en";
interface CharacterRecord {
  id: string; // Avatar ID；与模拟实例 ID 不同
  names: Record<ToolLocale, string>;
  baseSpeed?: number; // 缺失时手动填写，不猜 100
  iconPath?: string; // game-assets 下相对路径
  aliases: Record<
    ToolLocale,
    {
      official: string[];
      player: string[];
    }
  >;
}
// 沿用已有 SimulationPlan / SimulationResult / EventAnchor / EffectOperation。
// 游戏数据适配器产出本语言 PlannerCharacterOption；它不参与引擎求值。
// Presentation 接收数值与语言；operationTitle 接收翻译函数或由 UI 翻译类型。
```

首轮复制保持核心相对导入和功能不变。引擎模块不得导入 `vue`、`vue-router`、`vue-i18n`、数据快照或 `node:*`；由简单静态依赖检查保护这一边界，无需创建包／Workspace。

### 4.2 数学、顺序与生命周期

以下均由代码及本轮相关测试支持：

- `FULL_AG = 10000`，剩余 AV = 剩余 AG／有效 SPD。有效速度为面板速度＋固定加成＋基础速度×百分比加成／100，要求有限正数；修改 SPD 保留等待单位的剩余 AG。
- 提前／延后按完整 AG 的百分比减少／增加 AG；提前下限为零，延后可超过完整 AG。因此 100% 提前不等价于立即行动；立即行动直接归零。
- 自然队列按未舍入 AV 排序。零 AV 同值比较最新插队批次优先，同批次保留操作前队列相对顺序；再次非零提前可刷新零 AV 优先级，0% 不刷新。动态自然平局按创建顺序追加，事件没有额外优先权。
- `advanceTime` 只消除浮点减法的极小残差；不能加一个宽泛 epsilon 来合并 AV 相近但不同的自然行动。
- 普通行动：推进时间→记录已有速度状态→行动前→行动条重置／回合递增→动作后→已有有限状态递减／到期→有限次数离队。行动前当前行动者退出待行动队列，针对其行动条的效果跳过并警告；动作后可以作用到它的下一回合。
- 本回合任一窗口新加的速度状态不立即递减。有限持续为正安全整数，无限为 `null`，不是 `Infinity`、`NaN` 或大数字哨兵。到期移除状态，但不重置 AG 或插队优先级。
- 速度关联倒计时与同一操作的速度状态原子创建；多个 Actor 有独立 modifier 实例，共享一个倒计时。触发先移除关联状态并校验速度，再执行事件操作，不递减 Actor 回合持续时间。
- 独立 Scheduled Event 只触发一次；它只接受显式单目标提前／延后，不可与其他单位混选、不接受立即行动／速度效果、不进入友方／敌方群体集合；正在触发的事件退出目标选择范围。
- 动态实例通过操作 ID 派生：`spawn:`、`countdown:` 与编码后的 ID；自然锚点是 participantId＋turn，触发锚点是 participantId。编辑保留操作 ID，删除源操作不自动改绑其他引用。
- 缺失目标／不可达锚点保留诊断；非法输入、无效速度和失败到期不能发布半个节点。默认预算 `60 nodes / 600 AV`，硬上限 `500 nodes / 100000 AV`，保护零 AV 链。
- Trace 记录每次已提交提前／延后的实际 AG 前后值和该操作时点的 SPD；`deltaAV = (afterAG - beforeAG) / effectiveSpeed`。立即行动没有伪造提前 Trace；消费后下一回合不会重复携带历史。

当前无保存／加载／导入导出入口，方案只存在于组件内存。Phase 1 不承担旧浏览器状态迁移，也不新增持久化功能。当前普通行动操作必须明确 phase，start／trigger 操作省略 phase；不要根据历史报告放宽验证。

### 4.3 精度与性能

**内部保持 JavaScript number 完整精度。**例如自然第二单位累计 AV 是 `74.6268656716418`；UI 显示 `74.63`。当前 `formatAV` 使用 `Intl.NumberFormat` 固定两位，并消除舍入后负零；Locale 来自工具自己的中英文模块。

运行时建议 `computed` 生成计划、`shallowRef` 保存模拟结果，避免深度代理完整状态图；草稿输入不重算，已提交队伍／操作／预算变化才重算。先保留有上限的同步求值；只有 Phase 1 在典型及上限计划中测出交互阻塞，才考虑 Worker。**本轮未执行性能基准，不以 53 项单测的耗时推断浏览器性能。**

## 5. 游戏数据与资源方案

### 5.1 索引与角色身份核验

**实际运行验证**：选定的中英 `characters`、`character_promotions`、`relic_sets`、`light_cones` 共 8 个文件，`index_new` 与 `index_min` 按解析后的递归规范化内容相等。`index_min` 是紧凑 JSON，不是 gzip，也没有更少的业务字段。建议更新器读取它以降低输入体积。

普通 `AvatarConfig.json` 只有 94 条，不能据此宣布索引多了四个测试角色：

| ID     | 索引名称（中文／英文） | 权威来源                       |
| ------ | ---------------------- | ------------------------------ |
| `1014` | Saber／Saber           | `AvatarConfigLD`，Release=true |
| `1015` | Archer／Archer         | `AvatarConfigLD`，Release=true |
| `1508` | 远坂凛／Rin Tohsaka    | `AvatarConfigLD`，Release=true |
| `1509` | 吉尔伽美什／Gilgamesh  | `AvatarConfigLD`，Release=true |

旧站 `scripts/data/character-sources.ts:92` 已合并普通与 LD 角色及晋阶表。合并后 98 条全部与索引对应，没有多出的内部／未发布记录；旧站中英目录也都是 98 条。未来索引不提供可靠的 Release 字段，更新器仍需显示新增／删除 ID 差异并人工审阅，不能依赖“四位数字”“有图标”或名称来证明可选资格。Phase 1 首个快照保留本轮已核验的全部 98 ID，未知新增 ID 的首次更新需要明确审阅，不引入日常权威仓库依赖。

### 5.2 基础速度与名称投影

速度来源为 `character_promotions[id].values[*].spd.base`，不是 `characters[id].max_sp`。当前全部晋阶阶段的 SPD base 相同、step 为 0；中英一致。抽取时检查这些条件，再使用第一阶段 base。未来发现 step 非零或阶段差异时停止该记录的自动速度投影，给出诊断并允许手动输入，不能静默取第一项。

本轮比较：全部 98 个索引 SPD 与合并 `AvatarPromotionConfig`／`AvatarPromotionConfigLD` 的 `SpeedBase.Value` 一致，与旧站 98 个角色的中英生成详情 `baseStats.fixed.speed` 一致。原始晋阶与中英生成详情覆盖均完整；索引键与记录 ID 一致，中英角色图路径也一致。旧站相应读取位置为 `scripts/data/domain/character.ts:467`。原表当前没有速度增长字段时不应误读成 NaN；本轮探针已区分字段缺省与索引显式 step=0。没有发现需要特殊基础速度 override 的角色；面板速度与技能效果仍由用户配置。

| ID     | 原生中／英文名             | 旧站中文展示名 | 基础 SPD |
| ------ | -------------------------- | -------------- | -------- |
| `1001` | 三月七／March 7th          | 三月七·存护    | 101      |
| `1224` | 三月七／March 7th          | 三月七·巡猎    | 102      |
| `8001` | `{NICKNAME}`／`{NICKNAME}` | 开拓者·毁灭    | 100      |
| `8005` | `{NICKNAME}`／`{NICKNAME}` | 开拓者·同谐    | 105      |
| `8007` | `{NICKNAME}`／`{NICKNAME}` | 开拓者·记忆    | 103      |
| `1305` | 真理医生／Dr. Ratio        | 真理医生       | 103      |
| `1415` | 昔涟／Cyrene               | 昔涟           | 101      |

`8001`～`8010` 共 10 条使用占位符；五种命途的男女形态均有独立 ID，后两条路径为 Elation。必须保留不同形态 ID，不按名称合并，也不把名字作为搜索或模拟身份。建议用小型 ID 名称 override 表，首次从旧站已核验的中英角色投影提取开拓者／三月七等形态名并审阅；这不是迁移旧站命名生成管线。男女同命途可加本地化形态／性别辅助标签，防止选择器只显示两个无法区分的相同名称。

缺失策略：缺速度时保留角色，两项速度输入留空；缺图片时用本地通用图标；缺目标语言名称时显示中性 ID 标记并记录诊断，不伪造翻译或无提示跨语言混用。中英 ID 集合结构不对应时更新失败并保留上一个完整快照。索引的名字不作为 HTML 渲染；占位符必须在投影阶段处理。

### 5.3 搜索来源与轻量实现

StarRailRes 除名称外**确实还有** `index_min/{cn,en}/nickname.json`。中文包含常用昵称，例如瓦尔特对应“杨叔”，物理开拓者有“物主”；英文许多项只有本名，部分开拓者仍是占位符。它不是经过工具站审阅的“官方别名”集合，不能把全部 nickname 标为 official。

旧站额外维护 `data/search/character-player-aliases.json`（9,245 bytes），并从权威命名来源生成 `character-official-names.generated.json`（31,463 bytes）；角色 SearchDocument 还带有命名政策／归一化版本。它们不是 `characters.json` 的原生能力。

推荐先使用两个语言的本名、小型形态名称配置及经过审阅的本地别名表；从旧站仅提取角色相关、按 ID 组织的必要 official／player 别名，记录来源。`nickname.json` 可作为更新审阅参考，不默认合并全部俗称，也不迁移其装备昵称和全局搜索设施。

轻量搜索保留 NFKC、lowercase 及旧站空白／`·•・—_-/` 分隔符归一化；匹配依次为 exact、prefix、contains，每一级 canonical 优于 official 优于 player。可复用旧排名公式 `quality * 3 + authority`；同级按归一化本名及 ID 的 Unicode code point 顺序排列，避免环境 locale 排序差异。空查询沿用静态目录顺序。98 条记录直接预归一化＋线性搜索足够，Phase 1 验证后再考虑性能优化。

### 5.4 装备预设

| 项目   | ID      | 中／英文名                             | 原生小图路径                | 当前工具规则                  |
| ------ | ------- | -------------------------------------- | --------------------------- | ----------------------------- |
| 翁瓦克 | `308`   | 生命的翁瓦克／Sprightly Vonwacq        | `icon/relic/308.png`        | 40% 单目标提前，仅 start 节点 |
| 翔鹰   | `110`   | 晨昏交界的翔鹰／Eagle of Twilight Line | `icon/relic/110.png`        | 25% 单目标提前                |
| 舞舞舞 | `21018` | 舞！舞！舞！／Dance! Dance! Dance!     | `icon/light_cone/21018.png` | 24% 友方群体提前              |

前两项来自 `relic_sets.json`，不需要为了套装图读所有遗器部件；光锥来自 `light_cones.json`。现有旧 UI 使用光锥 preview，新 UI 可用小型 icon。**当前翁瓦克模板不检查 120 SPD，舞舞舞固定 24% 且没有叠影参数。**保留工具目前的简化模板规则，不误称自动实现全部游戏触发条件。预设先填草稿、确认才提交；群体可在提交时展开为真实实例 ID，仍是一条操作。

描述字段不进入引擎、不用于自动求值。未来流萤、知更鸟等模板仍按“索引提供名称／图标、工具提供操作组合及适用条件”的责任分离增加。

### 5.5 未来敌方数据

**当前 StarRailRes 不足以支持敌人目录、可靠敌方速度或 Endgame Occurrence 导入。**实际 `index_new/cn` 共有 24 类索引，未包含 Monster／Stage／Challenge／Schedule 关系数据；`simulated_events` 等模拟宇宙记录不能替代战斗排轴事件。

未来需要单独处理 MonsterConfig→MonsterTemplate 的身份／基础速度，配置与关卡难度的速度修正，Stage 敌群／波次，以及 Challenge 与 Schedule 的 occurrence 关联；名称还需对应语言 TextMap。旧站 `scripts/data/domain/enemy.ts` 已区分 template SpeedBase 和 config Speed 修正，不能拿任意敌人 ID 直接当速度。

建议将未来敌方导出器作为另一个显式离线更新输入，生成小型敌方目录／已解析 occurrence 快照及独立来源 Manifest；仅提取必要表与有限 TextMap 条目。浏览器消费规范化结果，不迁入整个 TurnBasedGameData 生成系统。本轮不实现，Phase 1 继续保留通用自定义敌方 Actor 能力，不创建游戏敌人选择器。

### 5.6 图片结构、体积与格式验证

**实际运行验证**：索引直接提供带目录的相对资源路径；角色为数字 ID `.png`，遗器套装为套装 ID `.png`，部件另有 `_0` 等后缀。必须使用索引路径，不根据名称猜文件名。

| 本地目录                | 文件数 | 原始 bytes  |
| ----------------------- | ------ | ----------- |
| `icon/character`        | 100    | 11,732,899  |
| `icon/light_cone`       | 170    | 5,224,743   |
| `icon/relic`            | 254    | 6,546,089   |
| `index_new`（全部语言） | 312    | 106,965,134 |
| `index_min`（全部语言） | 312    | 71,721,770  |

最小输入为中英四类紧凑索引共 883,632 bytes；未计可选 nickname、paths 或本地别名。仅含 ID、两种原生名称、速度、图路径的角色投影实验为 10,965 bytes，不含规范化名称／aliases／Manifest，因此不是最终完整快照大小。

最低图片集合 101 文件、11,657,776 bytes，缺失引用为 0；原图维度为 256×256／128×128。按目录拉取图片会多取 423 文件，即便 sparse checkout 也不会自动按索引只取三张装备图。

临时使用旧依赖 Sharp 0.35.3 对全部 101 张执行 `resize(128,128,{fit:'contain',background:透明,withoutEnlargement:true})`：PNG compressionLevel=9 共 4,396,447 bytes；WebP quality=85、alphaQuality=100 共 1,148,716 bytes，输出均为 128×128 且含 alpha。推荐 Phase 1 使用该 WebP 参数，输出按角色／遗器套装／光锥分目录及 ID 命名；transform 版本和 Sharp 版本进入 Manifest，避免跨版本处理结果被当作相同资源版本。

该探针只验证体积、格式、尺寸与 alpha，没有完成视觉对照；128 像素方案应在桌面／高 DPI／窄屏做头像清晰度验收后定稿。若新设计需要大型光锥卡片，再单独加入所需 preview，不默认获取所有 preview／portrait。

### 5.7 三种获取方案比较

| 维度       | A：Sparse Checkout + Partial Clone                              | B：按索引精确下载                                                    | C：本地固定版本导出                                   |
| ---------- | --------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------- |
| 初次成本   | Git 初始化与树／提交对象；检出目录触发对应内容下载              | 下载有限 JSON＋解析得到的具体图路径，HTTP 请求较多                   | 已有仓库时无图片网络传输，只做读取／转换              |
| 后续更新   | fetch＋检出目标版本；复用已缓存对象，但 Git 历史／对象会增长    | 按 Commit 缓存；未变化的路径和校验可复用，首轮先实现简单全量最小集合 | 用户先更新本地来源；导出器自身不 fetch 或切分支       |
| 网络与磁盘 | sparse 仅缩小工作树；partial 的实际节省依赖服务端支持及对象需求 | 只取选定文件，缓存没有整个 `.git` 历史                               | 来源仓库占用已存在，导出后站点不依赖它                |
| 可复现性   | 固定 Commit、无 tags／历史需求；不能仅固定分支名                | URL 中使用完整 Commit，并记录内容哈希                                | 要求 HEAD 等于锁定 Commit 且来源干净，记录来源 remote |
| CI         | Git 可用且服务端支持时适用，仍需独立更新任务                    | 适合更新任务；普通应用 CI 无需访问上游                               | 适合本地首次导出，不适合作为 CI 的必备前提            |
| 缺失处理   | Git 成功不代表索引引用闭包完整，需要另行校验                    | 404／限流可准确归属到某路径                                          | 本地缺失也必须记录与处理                              |
| 维护成本   | Git 操作、服务端能力、checkout 模式等复杂度较高                 | 有限下载器、代理、超时、并发及缓存，复杂度可控                       | 最简单，但必须避免将父目录默认路径藏进应用命令        |

依据 [Git clone 文档](https://git-scm.com/docs/git-clone)，`--filter=blob:none` 将内容对象延后到需要时获取；依据 [sparse-checkout 文档](https://git-scm.com/docs/git-sparse-checkout)，sparse 管理的是工作树路径。两者及 shallow clone 分别控制内容获取、工作树、历史深度，不能混为一个“必定不下载大仓库”的能力。本轮没有执行新 clone、测量远端 Git 传输量或验证指定服务器的 filter 协商，表中网络成本属于技术分析。

cone 模式适合目录，但 `icon/light_cone`、`icon/relic` 会带入整个目录；不能声称 cone 模式只取单个具体文件。官方当前提示 non-cone 模式的复杂性及弃用方向；本项目不依赖 non-cone 精确路径 sparse，而优先方案 B。

**推荐 C 完成首次导出，B 支持以后脱离本地仓库的更新；A 留作可选运维方案。**生成并提交快照后，应用开发机和普通 CI 都不需要上游源目录。当前 StarRailRes Git 对象包已约 2.64 GiB（`git count-objects -v` 的 size-pack=2,771,777 KiB），进一步说明不要把已有大仓库作为新项目安装条件。

### 5.8 可执行的更新器设计

以下命令是 **Phase 1 待实现接口**，本仓库当前没有 package.json：

```sh
npm run update:game-data -- --source local --root /absolute/path/StarRailRes
npm run update:game-data -- --source remote
```

固定版本读取工具自己的小型 source lock。更新版本显式传入 `--commit <full-sha>` 并更新 lock；不默认跟踪最新分支。local 模式要求来源 HEAD 与目标相同且干净，失败即退出，不自动 fetch、checkout 或修改来源；remote 使用固定 Commit 的 raw 文件 URL 和现有系统代理。

具体步骤：

1. 读取锁定来源、schema／transform 版本、两个语言及工具所需索引清单。验证代理后再联网；本地模式无需联网。
2. 在 `.game-data-staging/<run-id>` 获取四类索引并验证结构、中英 ID 集合、ID 键与记录 ID、名称及 SPD 的阶段／增长语义。名称／别名 overlay 为工具维护输入。
3. 对新增／删除 ID 生成差异摘要并要求这次数据更新审阅；已核验的 98 ID 构成首个审阅基准。required JSON 不可用或 schema 不支持时停止，不覆盖既有快照。
4. 生成 CharacterRecord 和三项 preset metadata，仅保留必要字段。名称占位符与形态标签在此阶段处理；未知速度用缺失状态，绝不设默认游戏数值。
5. 从规范化记录推导唯一图片路径。仅允许安全的相对 POSIX 路径，拒绝绝对路径、协议 URL、`..` 和目录逃逸；只复制／下载必要图。
6. 使用固定 transform 参数转成 WebP，生成尺寸、文件大小、SHA-256 与缺失列表。图片缺失记 warning，记录不输出坏 URL，UI 走本地回退；源 JSON 缺失属于失败。
7. 写出 JSON、Manifest 与资源映射，校验引用闭包、名字／数字、排序稳定和文件数量；检查完再替换仓库中的快照与资产。跨 JSON／图片目录替换用备份与回滚，Manifest 最后发布；失败恢复上一套，不宣称跨目录 rename 天然原子。
8. 输出版本与差异摘要供人工审阅；可清除本次暂存目录，不自动删除缓存或清理来源仓库。提交和发布是用户后续操作，不由更新器执行。

remote 模式仅在更新阶段处理网络，设有限并发（建议 4）、超时与最多两次针对瞬时网络／429 的退避重试；永久 404 不反复下载。任何重试仍走同一代理。下载结果按仓库＋Commit＋路径缓存，无稳定可信远端哈希时不跨 Commit 盲用内容。Phase 1 首轮允许重新获取约 11 MiB 原图，先不实现复杂的远端增量对象服务。

正常 `install`、`dev`、`test`、`build` 不调用上述步骤，不设触发更新的 `predev`／`prebuild`／`postinstall`。构建只检查已提交 snapshot schema 与资源清单；有意缺图是受控 fallback，不以“存在来源仓库”作构建条件。

Manifest 草案：

```json
{
  "schemaVersion": 1,
  "gameVersion": "4.6.0",
  "source": {
    "repository": "https://github.com/Mar-7th/StarRailRes.git",
    "commit": "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487",
    "indexFlavor": "index_min",
    "locales": ["cn", "en"]
  },
  "generatedAt": "<UTC ISO timestamp>",
  "overlayRevision": "<hash of naming, aliases and reviewed ID inputs>",
  "assets": {
    "transformVersion": 1,
    "toolVersion": "sharp@<pinned-version>",
    "format": "webp",
    "size": 128,
    "quality": 85,
    "revision": "<hash of sorted source and output checksums>",
    "missing": []
  },
  "files": { "<relative-output-path>": { "sha256": "<hash>", "bytes": 0 } }
}
```

这是字段设计，不是已生成的真实 Manifest。时间戳只作为审计元数据，不作为资源内容版本；数据和图片校验和定义版本。完整原始索引、TextMap、大图片与上游 Git 历史不进入应用 bundle。未来加入其他工具时新增该工具的有限元数据集合，不提前扩展为游戏全量数据库。

### 5.9 许可与归属

**代码阅读确认**：旧站 LICENSE 是 MIT，版权行 `Copyright (c) 2026 oereor`；复制其引擎代码时应保留相应通知。当前本地 StarRailRes LICENSE 是 GNU AGPL v3 文本，README 声明游戏资源与上游来源；不能将该索引按“没有要求的公共 JSON”处理。TurnBasedGameData 根目录没有发现 LICENSE 文件，README 请求在使用数据的站点／工具中给予来源致谢。

尚未确定：索引／转换产物的具体再分发许可义务、工具代码与 AGPL 来源数据的边界、游戏美术本身的授权及发布限制。**本报告不提供已获发行许可的保证，不把开源仓库许可证当作游戏图片许可。**Phase 1 本地验证可按已授权范围继续；首次对外分发前确认适用要求、保留来源／许可证／处理方式记录并设置归属说明。不要在本阶段自动给新仓库添加 MIT 或 AGPL LICENSE。

## 6. Vue 3 应用架构

### 6.1 技术栈、状态与本地化选择

固定采用 Vue 3、TypeScript strict、Vite、Vue Router、Tailwind CSS 4。Phase 1 建议 Node 24.x，npm 单一锁文件；不继承旧仓库 pnpm／SvelteKit 构建约束。具体依赖版本在建工程时选择兼容组合并锁定，不使用未核验的 `latest` 作为长期要求。

| 状态方案                   | 适用性                                                           | 建议                                                                              |
| -------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `ref/reactive`＋Composable | 当前只有一个排轴页面状态所有者，能显式管理提交、草稿与派生结果   | **Phase 1 采用**页面级 `useActionPlanner`，页面创建、子组件共享，不用模块全局单例 |
| Pinia                      | 提供 action、DevTools、HMR、测试工具，适合多页面共享或持久化场景 | 暂不引入；后续确有共享方案／账号／跨工具状态时再增加，引擎仍是普通函数            |

Vue 官方展示了基于响应式 API 的共享状态模式，并推荐在更大规模需要时使用 Pinia；本项目的 Composable 选择是根据当前单工具、内存状态范围作出的工程判断。参见 [Vue 状态管理](https://vuejs.org/guide/scaling-up/state-management.html)、[Pinia 官方介绍](https://pinia.vuejs.org/introduction.html)。

状态分配：队伍槽位、events 和预算是已提交输入；SimulationPlan、结果、labels 和不可达事件是派生值；选中 anchor、预测／队列模式及稳定 queueAnchor 是导航状态；Inspector 草稿是临时编辑状态。操作提交后更新唯一 events 列表，不另建一份已提交 operation store。切换其他节点直接丢弃草稿，不弹确认；同一节点重算保持 ID、锚点与可达性诊断。

本地化比较：简单 typed dictionary 依赖小，但要自行维护插值、数字、缺 key、语言切换与组件响应；`vue-i18n` 有成熟的作用域和运行时切换，当前文案覆盖操作、表单、诊断、无障碍标签，建议使用后者。只包含 zh-CN／en，使用 Composition API（`legacy:false`），全局 locale 切换同步 UI、数据名称及 document title，组件不硬编码业务文案。官方说明全局 locale 在 Composition API 中以 ref 更新，参见 [vue-i18n 作用域与语言切换](https://vue-i18n.intlify.dev/guide/essentials/scope.html)。

默认语言 zh-CN，可保存用户语言选择；不创建旧站 `/en/` 镜像路由。游戏名称使用 CharacterRecord 的目标语言值，UI 使用消息字典；用户输入的自定义名称不自动翻译。语言切换只改变标签，不生成新实例 ID、不改绑 events、不因选择同一角色覆盖速度。AV 使用现有格式函数的数学无关部分及工具 Locale，统一两位小数。

### 6.2 最小目录与组件职责

以下是 **Phase 1 目录设计**，本轮不建立空应用目录：

```text
src/
  engine/action-planner/     # types、queue、engine、operations、targeting、validation、effect-config
  tools/action-planner/
    model/                  # selection、presets、drafts、presentation、事件／游标纯函数
    composables/            # useActionPlanner
    components/             # 队伍配置、Navigator、Inspector 与表单
    ActionPlannerPage.vue
  components/ui/            # 仅真实复用的 Button、Dialog、AssetImage 等
  data/
    game/                   # 已提交 characters、preset metadata、Manifest
    adapters/               # typed snapshot 访问、本地资源 URL
  router/
  locales/                  # zh-CN、en UI 消息
  assets/                   # 站点 CSS、图标及自身静态资源
public/game-assets/          # 有限 WebP 图标，纳入 Git
scripts/                    # 单独更新／校验入口及本地 overlays、source lock
tests/                      # 引擎、少量数据／状态／浏览器交互测试
docs/investigations/
```

引擎边界通过禁用框架／数据层导入保护；UI 只经数据 adapter 访问工具 schema。`components/ui` 不包含模拟器业务，不提前创建抽卡／遗器空模块。后续工具各自放在 `tools/<tool>`，新增自己需要的规范化数据；只有实际复用时才提升共享计算模块，不引入通用“模拟器框架”、Monorepo 或微前端。

建议组件边界：

- `ActionPlannerPage` 创建状态，顶部切换战斗配置／行动规划。阶段切换只切视图，已提交计划保留。
- `BattleConfiguration` 管理四槽、选择器、独立速度、模拟预算；动态 Actor／事件仍由节点操作创建，不复制引擎配置为第二套隐含状态。
- `ActionNavigator` 显示开始节点、未来行动／当前队列、队列步进及不可达事件入口，只发出选择／步进事件。点击待行动条目选择其未来锚点，不自动推进游标。
- `ActionInspector` 管理概览／编辑状态；普通节点分 preAction／postAction，start／trigger 单窗口。Effect／Participant 表单使用已有纯解析函数和共享目标规则。
- `OperationOverview` 区分已配置操作与接收到的 Trace。`EffectEditor` 的草稿校验仅产出字段错误码，最终提交仍经过引擎验证；预设只填草稿。

桌面采用 Navigator＋较宽 Inspector 的两栏，`minmax(0,...)` 与 `min-width:0` 防止长英文名称／数字撑开；窄屏改为上下排列，保证选中节点与返回列表入口可见，不强制缩小双栏。金色用于关键选中／主操作，蓝色提前、红色延后；阵营另用友／敌图标和文字，不能只靠红绿颜色区分。使用语义明确的图标、原生按钮及可访问名称，减少多层 Card。具体尺寸与断点在 Phase 1 浏览器验证后确定，Phase 0 不做 UI 定稿。

### 6.3 路由、资源与静态部署

首轮只建立 `/` 工具入口与 `/action-planner`，工具页面以动态 import 拆包；其他工具路径只记录规划，不提供空页面。使用 `createWebHistory(import.meta.env.BASE_URL)`，正常根域部署 base 为 `/`，资源 URL 也通过 BASE_URL 拼接，避免写死仅支持根目录的 `/game-assets`。

Vite 默认静态产物为 `dist`，`preview` 用于本地检查而不是生产服务器，参见 [Vite 静态部署](https://vite.dev/guide/static-deploy.html)。Tailwind 4 使用 `@tailwindcss/vite` 插件与 CSS `@import "tailwindcss"`，不照搬旧站样式或不必要的旧配置，参见 [Tailwind Vite 安装](https://tailwindcss.com/docs/installation/using-vite)。

History 路由深链接需要宿主把非文件路径回退到 index.html；Router 同时增加客户端未知路由页面。参见 [Vue Router history 模式](https://router.vuejs.org/guide/essentials/history-mode.html)。若未来部署平台无法配置 fallback，再针对该平台选择 hash 模式，不为尚不存在的问题提前改变主方案。

Vercel 官方 Vite SPA 指南给出的深链接方式是项目根 `vercel.json` rewrite 到 `/index.html`；参见 [Vercel Vite 部署说明](https://vercel.com/docs/frameworks/frontend/vite)。Phase 1 可配置：

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

这是尚未创建的配置草案；本项目选择 SPA，不需要为此加入 SSR 或 Nitro。最终宿主必须验收真实 assets 文件不会被 fallback 误当 HTML，缺图能触发回退，深链接刷新能加载页面。候选域名 `tools.hsrarchive.cc` 仅记录，本轮没有配置项目、域名、远程环境或部署；线上行为仍待后续明确发布授权。

## 7. 本轮验证与可复现材料

### 7.1 实际检查范围

| 项目                                           | 本轮结果                                 | 不能由此推出的结论                                |
| ---------------------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| develop 文件／导入／组件／服务器／构建钩子审计 | 已完成                                   | Vue 组件已实现                                    |
| 临时独立 Vitest 配置                           | 9 个原有文件、53 项通过                  | 完整旧站测试或新应用独立性通过                    |
| 小型迁移基准                                   | 11 输入，各两次一致；生成器 1 项验证通过 | 游戏技能真实机制全面验证                          |
| 角色数据核验                                   | 98 ID、普通＋LD、SPD、中英、new/min 一致 | 未来更新永远保持同一 schema                       |
| 最小资源引用                                   | 101 张，无缺失                           | 其他资源索引所有引用均完整                        |
| 128 图标转换                                   | PNG／WebP 体积与格式、尺寸、alpha 已验证 | 视觉清晰度／高 DPI 已验收                         |
| 官方资料与固定版本 info                        | 均通过代理读取成功                       | Vercel 已实际部署／Git partial clone 服务端已验证 |
| 三个来源仓库                                   | 分支／HEAD／Git 状态保持原样             | 未来开发可依赖这些目录                            |

测试环境：Node `24.21.0`、现有 Vitest `4.1.11`、现有 Vite `8.3.1`。没有执行旧站 `pnpm test` 默认 Vite 配置，也未运行 `data:ensure`、`assets:ensure`、消息编译或全站 build。旧源码和相关 tests 只复制到系统临时目录；搜索验证附带少量 search／domain 源码，仅用于探针，不成为新仓库正式代码。

Trace 和 Presentation 的临时 alias 读取了旧站**已有** Paraglide 生成文件，未重新生成、未 mock 翻译输出。这一依赖仅为现有行为取证，Phase 1 必须删除。未运行 Svelte SSR 组件测试、服务器加载器测试、浏览器／CSS／UI 快照、全面 build 或远程部署。

受限执行环境初次写入临时目录被拒，未进入机制测试；使用已获执行权限后测试成功。单独 tsx 启动临时生成器退出失败，后改用成功的独立 Vitest 配置执行。生成器首次错误要求所有场景零诊断，行动前群体场景正确产生 `active-target` 警告；修正**探针预期**后通过，未改引擎或来源测试。这些失败不计为引擎行为回归。

### 7.2 复现现有定向测试

从共享目录运行以下 PowerShell；来源依赖需已存在。它只创建一个新系统临时目录，仅读取旧站：

```powershell
$ErrorActionPreference = 'Stop'
$sourceRepo = (Resolve-Path './HSR-Database').Path
$probeRoot = Join-Path ([IO.Path]::GetTempPath()) ('hsr-phase0-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path "$probeRoot/src/lib", "$probeRoot/tests/unit" | Out-Null
foreach ($part in @('action-planner', 'search', 'domain')) {
  Copy-Item -LiteralPath "$sourceRepo/src/lib/$part" -Destination "$probeRoot/src/lib" -Recurse
}
$testFiles = @(
  'action-planner.test.ts', 'action-planner-participants.test.ts',
  'action-planner-trace.test.ts', 'action-planner-effect-config.test.ts',
  'action-planner-participant-config.test.ts', 'action-planner-speed-duration-config.test.ts',
  'action-planner-presets.test.ts', 'action-planner-selection.test.ts',
  'action-planner-presentation.test.ts'
)
foreach ($file in $testFiles) {
  Copy-Item -LiteralPath "$sourceRepo/tests/unit/$file" -Destination "$probeRoot/tests/unit"
}
$sourceJsPath = $sourceRepo.Replace('\', '/')
$probeJsPath = $probeRoot.Replace('\', '/')
$config = @{
  cacheDir = "$probeJsPath/.vite"
  resolve = @{ alias = @{
    '$lib/paraglide' = "$sourceJsPath/src/lib/paraglide"
    vitest = "$sourceJsPath/node_modules/vitest/dist/index.js"
  } }
  test = @{ include = @('tests/unit/*.test.ts'); environment = 'node'; watch = $false }
}
$configJson = $config | ConvertTo-Json -Depth 6
$configText = "export default $configJson;"
Set-Content -LiteralPath "$probeRoot/vitest.config.mjs" -Value $configText -Encoding utf8
node "$sourceRepo/node_modules/vitest/vitest.mjs" run --root "$probeRoot" --config "$probeRoot/vitest.config.mjs" --reporter=verbose
```

配置使用已解析绝对路径及字面量 `$lib/paraglide`。不载入旧站 `vite.config.ts`，缓存／配置打包输出留在 probeRoot。Phase 1 正式工程有自己的 Vitest 依赖及配置，不需要这些旧站路径。

### 7.3 复现数据与图片探针

以下是本轮实际探针的精简复现版本。从共享目录运行 PowerShell，JSON／图片只读，转换结果只存内存，不写入三个来源仓库：

```powershell
@'
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const root = process.cwd();
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const canonical = v => Array.isArray(v) ? v.map(canonical)
  : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const cn = read('StarRailRes/index_min/cn/characters.json');
const en = read('StarRailRes/index_min/en/characters.json');
const promos = read('StarRailRes/index_min/cn/character_promotions.json');
const enPromos = read('StarRailRes/index_min/en/character_promotions.json');
const raw = ['AvatarConfig', 'AvatarConfigLD'].flatMap(n => read(`TurnBasedGameData/ExcelOutput/${n}.json`));
const rawPromos = ['AvatarPromotionConfig', 'AvatarPromotionConfigLD'].flatMap(n => read(`TurnBasedGameData/ExcelOutput/${n}.json`));
const ids = Object.keys(cn).sort();
assert.deepEqual(ids, Object.keys(en).sort());
assert.deepEqual(ids, raw.map(v => String(v.AvatarID)).sort());
assert(raw.every(v => v.Release === true));
for (const lang of ['cn', 'en']) {
  for (const file of ['characters', 'character_promotions', 'relic_sets', 'light_cones']) {
    assert.deepEqual(canonical(read(`StarRailRes/index_new/${lang}/${file}.json`)),
      canonical(read(`StarRailRes/index_min/${lang}/${file}.json`)));
  }
}
for (const id of ids) {
  const spd = promos[id].values[0].spd.base;
  assert.equal(cn[id].id, id); assert.equal(en[id].id, id);
  assert.equal(cn[id].icon, en[id].icon);
  assert(promos[id].values.every(v => v.spd.base === spd && v.spd.step === 0));
  assert.deepEqual(promos[id].values.map(v => v.spd), enPromos[id].values.map(v => v.spd));
  const rows = rawPromos.filter(v => String(v.AvatarID) === id);
  assert(rows.length > 0 && rows.every(v => v.SpeedBase.Value === spd));
  for (const lang of ['zh-CN', 'en']) {
    assert.equal(read(`HSR-Database/src/lib/generated/views/${lang}/details/characters/${id}.json`).baseStats.fixed.speed, spd);
  }
}
const assets = [...new Set([...ids.map(id => cn[id].icon),
  'icon/relic/110.png', 'icon/relic/308.png', 'icon/light_cone/21018.png'])];
const sharp = createRequire(path.join(root, 'HSR-Database/package.json'))('sharp');
sharp.cache(false);
let sourceBytes = 0, pngBytes = 0, webpBytes = 0;
for (const asset of assets) {
  const file = path.join(root, 'StarRailRes', asset);
  sourceBytes += fs.statSync(file).size;
  const options = { fit: 'contain', withoutEnlargement: true, background: { r: 0, g: 0, b: 0, alpha: 0 } };
  const png = await sharp(file).resize(128, 128, options).png({ compressionLevel: 9 }).toBuffer();
  const webp = await sharp(file).resize(128, 128, options).webp({ quality: 85, alphaQuality: 100 }).toBuffer();
  const metadata = await sharp(webp).metadata();
  assert.equal(metadata.width, 128); assert.equal(metadata.height, 128); assert(metadata.hasAlpha);
  pngBytes += png.length; webpBytes += webp.length;
}
console.log({ characters: ids.length, assets: assets.length, sourceBytes, pngBytes, webpBytes });
'@ | node --input-type=module -
```

预期输出：characters=98、assets=101、sourceBytes=11657776、pngBytes=4396447、webpBytes=1148716。压缩 bytes 是当前 Sharp 0.35.3 的证据，不是跨编码器版本的永久兼容契约；未来更换编码器需更新 transform 版本并重新记录结果。

### 7.4 小型行为基准输入与预期

基准是现有 mechanism／participants／trace 测试的有限组合，不是新增庞大测试集。以下均使用合成 Actor，不冒充真实角色技能。

通用定义：`A(id,spd,pos,limit?)` 为 ally Actor，baseSpeed=100、panelSpeed=spd、name=id；`T(...ids)` 为显式目标；`P(id,ids,pct)` 为 advance；所有计划 `maxNodes=4,maxAV=600`，start 先执行列出的操作。普通 action 的 anchor 为 participantId＋turn；动态 source 的 ID 按当前生成函数派生。

| 基准        | 完整关键输入                                                                                            | 本轮关键预期（不舍入）                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| natural     | A(a,160,0)、A(b,134,1)，无操作                                                                          | a1=62.5，b1=74.6268656716418，a2=125，b2=149.2537313432836                                                           |
| continuous  | 同上；start P(first,[a],100)、P(second,[b],100)                                                         | 初始队列 b,a；b1=0，a1=0，a2=62.5，b2=74.6268656716418                                                               |
| zeroRefresh | 同上，再追加 P(again,[a],25)                                                                            | 初始队列 a,b；a1=0，b1=0；刷新零 AV 顺序，不增加正提前量                                                             |
| group       | 再加 A(c,100,2)；start P(b-first,[b],100)、P(group,[c,a],100)、P(overlap,[c,b],100)                     | 初始队列 c,b,a；前三次累计 AV 全为0，a2=62.5；目标数组次序不取代队列相对次序                                         |
| pre         | 双人；a1 的 preAction：P(dance,[a,b],24)                                                                | a1=62.5，b1=62.5，a2=125；诊断为 active-target warning，operationId=dance、participantId=a、source anchor=a1         |
| post        | 同上改 postAction                                                                                       | a1=62.5，b1=62.5，a2=110，无诊断；a 下一次 AG=7600                                                                   |
| finite      | 仅 A(a,100,0,2)                                                                                         | a1=100，a2=200，stopReason=empty，最后队列空                                                                         |
| linked      | A(a,100,0)、A(b,100,1)；start id=timed、flat+50、T(a,b)、duration=countdown(name=Timer,speed=200)       | 初始 countdown:timed,a,b；事件=50，随后双方 remainingAG=2500、SPD=100；a1=b1=75，a2=175；事件不增加 completedActions |
| independent | 无初始 Actor；start 创建 id=event 的 scheduledEvent(name=Event,speed=90)                                | trigger spawn:event=111.11111111111111，只触发一次，stopReason=empty                                                 |
| dynamic     | 上述 event 触发时创建 id=child 的 Actor（name=Child，ally，base/panel=100，initialAG=0，actionLimit=1） | trigger spawn:event 和 action spawn:child:1 均为111.11111111111111；子单位 deltaAV=0；最后空队列                     |
| trace       | A(a,200,0)、A(b,100,1)；a1 pre：b 提前20%，b 无限flat+100；post：b 延后10%，b 提前100%                  | a1=b1=50，a2=b2=100；b1 Trace 下表，b2 无旧 Trace                                                                    |

除 pre 的明确 warning 外，11 个场景均无诊断；natural、continuous、zeroRefresh、group、pre、post、linked、trace 的 stopReason 为 nodes，其他为 empty。

trace 操作 ID 依次为 pull、speed、push、clamp，只有 gauge 三项进入 Trace：

| operationId | beforeAG | afterAG | SPD | deltaAV | phase      |
| ----------- | -------- | ------- | --- | ------- | ---------- |
| pull        | 5000     | 3000    | 100 | -20     | preAction  |
| push        | 3000     | 4000    | 200 | 5       | postAction |
| clamp       | 4000     | 0       | 200 | -20     | postAction |

三项 elapsedAV=50，sourceAnchor=a1，targetAnchor=b1，zeroAVInsertion=false。不可把“拉到零”与“原本已为零且前移”混为 zeroAVInsertion。已通过的现有测试另覆盖零 AV 刷新标记、失败操作不留 Trace、不可达锚点、立即行动／过满延后、速度变化保留 AG、无限持续与失败到期，迁移时直接复用，不扩充成 UI 快照。

补充确定性数值：双人160／134在a1行动前给b固定+66后，b保留AG=1625，SPD=200，remainingAV=8.125，b1累计=70.625；100 SPD 的a带1回合flat+50，在a1动作后提前24%，到期后AG=7600、SPD=100、remainingAV=76。两项由原有测试通过。

Phase 1 用相同输入对复制前后的输出比较 anchor／顺序、原始 AV／AG／SPD、modifier 生命周期、Trace、diagnostic code 和 stopReason。不要比较 name、iconUrl、文案、CSS、内部数组布局或对象引用身份；AV 断言沿用既有数学容差，不能先转成两位小数再比较。

## 8. 风险与 Phase 1 实施顺序

### 8.1 风险清单

| 风险                   | 证据／控制办法                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| 引擎回归               | 先复制核心并运行既有机制测试，任何数学／排序差异单独审查，不在 Vue 适配中顺手重写        |
| 字段或 ID 错误         | 已核验普通＋LD及98个速度；更新器校验中英、SPD阶段、ID差异，max_sp不参与速度              |
| 名称／别名失真         | 10个占位符、同名多形态、nickname来源有区别；用独立reviewed overlay，不把俗称当official   |
| 缺图／坏URL            | 已验证最小集合完整；Manifest记录missing，Vue AssetImage回退，不拿HTML fallback当正确图片 |
| 草稿与已提交状态混淆   | 页面级状态唯一，节点切换丢草稿，取消不改events，组内排序与真实预览共享纯函数             |
| 动态身份与事件锚点变化 | 保留ID生成和源operation ID；删除只产生孤立引用，不静默改绑                               |
| 运行时性能             | 同步有限引擎＋结果shallowRef；Phase 1测典型／最大计划，不预先引入Worker或Store求值       |
| 资源体积／清晰度       | 已测原始约11.12MiB、128WebP约1.10MiB；还需高DPI视觉验收，按需增加preview                 |
| 静态路由与基础路径     | history fallback、BASE_URL及客户端404；深链接／静态图片响应验收尚待实现                  |
| 上游版本／许可         | 固定Commit、transform版本、hash与归属；软件／索引与游戏美术权限分别确认                  |

### 8.2 Phase 1 顺序与退出条件

1. **建立最小工程与引擎边界**：Vue/Vite/TS、Node与单一锁文件；复制纯引擎及对应既有机制测试，先通过53项中适用的纯逻辑测试与小型基准。只做必须的导入适配；Presentation与search依赖先拆开，旧Svelte测试不迁移。
2. **接入静态数据与资源**：实现最小schema、naming／aliases overlay、显式updater及校验；首次固定Commit本地导出101张资源，提交快照并记录来源。验证无上游路径进入runtime、缺速度／缺图和版本失败回滚。
3. **实现工具纯编辑逻辑与状态**：提取事件修改、游标、草稿构建；接入Composable及双语模块；确保配置／草稿／选择状态分离。类型检查及少量状态测试保护节点切换、ID和提交，不固定文案。
4. **开始写Vue UI**：战斗配置→Navigator／Inspector→普通与动态操作编辑→预设／诊断／Trace／队列模式。做有针对性的键盘、取消／提交、切换丢草稿、缺图、中英及窄屏验收。
5. **独立性和静态交付验收**：从仅含新项目的临时复制／归档目录（不含旧站、上游、node_modules、缓存）按锁文件安装，执行类型检查、测试、build、dev及preview；确认角色、图片、引擎可用，深链接刷新及BASE_URL符合设计。安装依赖可以联网，但数据／图片不需要上游访问，应用运行没有外部游戏资源请求。

三个来源仓库在Phase 1仍只读；npm脚本不调用父目录，不通过软链接将旧工程变成隐含依赖。常规CI使用新项目已提交快照，不运行数据更新；需要更新时单独执行并审阅差异。

进入Phase 2的条件：核心机制对照通过、旧依赖全部断开、独立目录安装／开发／测试／构建成功、当前交互及中英／响应式验收完成、未解决风险有明确记录。Phase 2的功能范围由后续任务决定，不因本报告自动开始其他模拟器迁移、方案保存、敌方导入或部署。

### 8.3 开放问题与推荐决策

工程上已给出默认建议：Composable、vue-i18n、history路由、128WebP、C首次导出＋B后续更新、规范化快照纳入Git。无需为了这些常规工程判断再次阻断Phase 1；具体UI尺寸通过浏览器验收决定。

真正需要后续用户确认的是：**新项目正式许可证及数据／美术再分发的许可处理，和何时授权首次对外发布。**域名目前仅候选，发布目标未配置。若用户将来要求恢复翁瓦克速度条件、舞舞舞叠影或新增角色模板，那属于产品规则变更，应独立于迁移处理。

本轮完成后停止于Phase 0。报告、README和仓库规则描述的是调查结果与后续方案，不声称正式应用或更新器已存在。
