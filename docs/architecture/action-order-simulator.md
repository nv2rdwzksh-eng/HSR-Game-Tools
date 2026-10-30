# 行动序列模拟器架构

本文描述当前已实现的行动序列模拟器 / Action Order Simulator。内部目录、类型和 `/action-planner` 路由保留 Action Planner 标识，不随产品名称迁移。
UI 展示见[设计规范](../design-notes.md)，文案见[Site Messages](../site-messages.md)，实施演进见[历史索引](../investigations/README.md)。

## 职责与数据流

工具业务集中在 `src/tools/action-planner/`：engine、model、composables、components、data、templates 与页面入口各自保持原职责。仅排轴使用的 GameIcon 随工具组件维护；全站 Router、i18n、主题、通用 UI 和 `public/game-assets/` 保持共享。工具之间不直接引用对方业务内部实现，数据维护脚本仍在 `scripts/`，不进入运行时引擎。

[纯 TypeScript 引擎](../../src/tools/action-planner/engine/)进行有限预算的离散事件推演，不依赖 Vue、Router、DOM、Node 文件系统、翻译或原始游戏 JSON。
它执行用户显式配置的操作，不解析技能描述或自动执行完整角色技能。

数据流为：配置或操作草稿 → 显式提交 PlannerDocument → simulatePlan 重放 → SimulationResult → Navigator / Inspector / Presentation。
[useActionPlanner](../../src/tools/action-planner/composables/useActionPlanner.ts)持有页面唯一已提交文档，结果为独立的浅引用派生值；仅方案名或自定义操作名变更不重新推演。
运行时结果、诊断、Trace、队列和执行预览不是另一份业务配置。

## 时间、速度与队列

数学与排序来源为 [queue.ts](../../src/tools/action-planner/engine/queue.ts)、[engine.ts](../../src/tools/action-planner/engine/engine.ts) 和 [operations.ts](../../src/tools/action-planner/engine/operations.ts)。

- 完整行动距离 `FULL_AG = 10000`，剩余行动值 `remainingAV = remainingAG / effectiveSpeed`；速度必须为有限正数。
- Actor 的有效速度为面板速度，加自身固定速度修正和基于 baseSpeed 的百分比修正。速度变化保留当前 AG，不按新速度重置距离。
- Scheduled Event 的有效速度为 `speed + (baseSpeed ?? speed) × 百分比修正合计 / 100 + 固定修正合计`。speed 是初始实际速度，baseSpeed 是独立百分比基数，百分比效果相加而非复利。
- 推进一段时间前冻结所有单位的区间速度，按 `deltaAV × speed` 扣减 AG；只归零减法舍入残差，不使用 AV epsilon 改变事件排序。
- 按剩余 AV 排序；相等时，零 AG 单位先比较零 AV 插入批次（新批次优先），同批次按操作前队列顺序，最后按稳定入队 order 排序。
- 默认预算为 60 节点 / 600 AV，硬上限为 500 节点 / 100000 AV。自然行动、单次事件和轮次边界均计入节点预算；开始操作不作为一个事件节点。

所有内部计算保留原始精度；展示取舍见 Site Messages 的数值格式规则。

共享运行状态 `departed` 默认 false。离场单位仍存在于完整 participants 中，但不参与队列排序或 AG 消耗；保留 ID、AG、零 AV 优先级、待展示 Trace、回合和 Modifier。回场仅恢复调度，`AG_return = AG_departure`，剩余 AV 按当前有效速度重新计算；不调用立即行动、不生成 Trace、不增加回合数。
正在自然行动的单位在 preAction / postAction 离场，当前回合仍完整结算，其 AG 重置、Buff 到期和行动次数限制沿用自然回合流程；离场操作本身不改变这些数据。

## 行动单位与系统事件

类型定义见 [types.ts](../../src/tools/action-planner/engine/types.ts)。

| 类型                        | 当前行为                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| Actor                       | 我方或敌方自然行动单位，有 baseSpeed / panelSpeed、回合数和自身 Modifier；可设置自然行动次数上限   |
| Scheduled Event             | 有初始速度、可选百分比基数和自身 Modifier 的单次倒计时，触发后移除；也用于效果到期计时，无自然回合 |
| Aha Participant             | 中立自然行动单位，有独立 AG、回合和自身 Modifier，速度由配置与存活贡献者派生，不占初始编队槽位     |
| Cycle Boundary System Event | 轮次边界，独立于 Participant，不具有 SPD、AG 或目标资格，不进行自然回合结算                        |

初始配置允许 0–4 名我方和 0–5 名敌方，双方位置分别编号；此限制不用于动态生成的单位。
通用创建操作只支持 Actor / Scheduled Event，不能手动创建 Aha 或轮次系统事件。

## 操作与目标资格

| 操作               | 当前效果                                                                       |
| ------------------ | ------------------------------------------------------------------------------ |
| advance            | 扣减 `FULL_AG × percent / 100`，剩余 AG 不低于 0；正比例拉至零时参与零 AV 插入 |
| delay              | 增加同尺度 AG，可使距离超过 FULL_AG                                            |
| immediatelyAct     | 将目标 AG 置为 0，并按操作前队列顺序形成新的零 AV 批次                         |
| depart             | 将在场参与者设为离场，冻结其 AG，保留身份、排序元数据与效果                    |
| returnToField      | 将离场参与者重新入场，以当前速度计算剩余 AV                                    |
| addSpeedModifier   | 添加固定值或基础速度百分比修正，使用有限 / 无限回合或共享倒计时生命周期        |
| conditionalRestore | 我方战技行动的 postAction 条件返还，按用户选择结果与来源自身回合冷却结算       |
| restoreSkillPoints | 队伍级正向战技点恢复，无目标；只允许战斗开始及我方 Actor action                |
| spawnParticipant   | 以操作 ID 派生稳定 ID，创建 Actor 或单次 Scheduled Event                       |

资格统一由 [targeting.ts](../../src/tools/action-planner/engine/targeting.ts)判定。Actor 可接受上述目标操作；Aha 接受速度与离场 / 回场。普通效果及 depart 选择在场单位，returnToField 选择离场单位；operationTargets 读取真实 SimulationState 并按操作类型筛选，不能使用最终定义目录判断在场状态。
我方 / 敌方群体仅选对应阵营且状态匹配的 Actor，不包含 Aha 或事件。显式 Presence 多选可混合三类参与者；其中任一目标缺失或状态不匹配时整条操作跳过并诊断，不部分提交。
Scheduled Event 可作为单个显式目标接受 advance / delay，不能接受立即行动；速度效果支持显式单选、多选及与 Actor / Aha 混选，但包含事件的操作只接受 `{ kind: 'turns', turns: null }` 无限持续。有限回合或倒计时持续在校验及运行时均拒绝，不静默转换。
正在触发的 Scheduled Event 保留在状态中用于结算和诊断，但不再可选；离场事件没有触发，因此仍可被 returnToField 选中。

当前正在行动的自然单位不进入拉条操作的可排序队列；对当前行动者的此类配置产生 active-target 提示，不改变其当前行动。速度效果仍以当前状态资格处理。
缺失或不合格目标产生诊断并跳过该操作；速度候选状态必须保持合法，速度 Modifier 与其倒计时创建一起提交。

自然行动采用 preAction 资源事件 → 技能检查与支付 → 其余 preAction → 回合推进及 AG 重置 → 技能恢复 → postAction → 符合条件的回合结束存储补充 → 回合到期与退出的顺序。未启用战技点时资源与技能阶段为空，原有时间轴行为保持不变。
普通新建草稿默认 postAction；编辑保留原阶段，旧操作未显式指定 phase 时使用 preAction。开始、单次事件与轮次边界只有一个不带 phase 的操作窗口。
立即行动仍执行普通自然行动流程，不自动代表游戏中的额外回合规则。

## 生命周期与轮次

自然行动开始时记录已有 Modifier ID；在完整 postAction 结束后，仅这些原有效果的有限回合数递减。
该回合中新添加的效果不会立即扣一回合；无限回合不递减。只有 Actor 达到 actionLimit 后退出，Aha 没有该退出限制。
离场期间没有该单位的自然回合，因此回合 Buff 不随其他单位行动扣减。关联倒计时仍在场时正常触发并移除离场目标上的到期 Buff；倒计时自身离场则冻结 AG，回场后继续。事件自身的速度 Modifier 无限持续到事件移除，事件不增加回合计数器。

Scheduled Event 触发时，先移除与它关联的到期 Modifier，再记录 beforeEffects 并执行事件操作，最后移除事件自身。
到期后出现非法速度会停止该节点，不允许后续操作掩盖失败。回合或倒计时到期均不自行重置 AG 与零 AV 插入优先级。

[轮次规则](../../src/tools/action-planner/engine/cycle.ts)支持 none / moc / aa：第 0 轮长度分别为 150 / 300 AV，此后每轮 100 AV；第 n 个边界（n ≥ 1）为首轮 AV + 100 × (n−1)。
同一 AV 下先处理 Actor、Aha、Scheduled Event 及它们新产生的零 AV 行动，每次结算后重新检查队列，最后处理轮次边界。
边界自身产生的零 AV 行动在该边界结算之后执行。轮次不重置 AG、不递减自然回合 Buff；没有参与者时不继续推进到未来边界，但已经到时的边界仍可结算。
所有我方 Actor 离场不阻止其他单位或倒计时继续调度。全体参与者离场时，已启用且预算内的轮次系统节点仍可推进；无可调度参与者且无有效系统节点时按空调度停止，不虚构回场节点。

轮次操作绑定 `{ kind: 'cycleBoundary', ordinal }`。关闭模式保留为停用配置，不算普通不可达警告；重新启用或切换 MoC / AA 继续按 ordinal 关联。
尚无跨波次重置、保留规则或自定义轮长。

## 阿哈时刻

[身份解析](../../src/tools/action-planner/model/aha-config.ts)依据规范化角色形态的 Elation 身份识别初始我方贡献者；引擎只读取 `aha: { id, baseSpeed, contributorIds }`，不访问游戏数据。
有初始贡献者时创建 Aha；配置始终保留，即使 UI 暂时隐藏。

默认基础速度为 80，可在战斗配置中修改。有效速度为：自身 baseSpeed + 存活贡献者有效速度降序前四名分别按 1/5、1/10、1/20、1/40 加权 + 自身 Modifier。
百分比 Modifier 只基于 Aha baseSpeed，不基于派生面板速度。贡献不生成 Modifier；行动中的贡献者仍计算，移除参与者后停止贡献，Aha 不因贡献者全部移除而消失。
离场保留贡献者身份，离场贡献者的当前速度仍计入阿哈；仅真正移除参与者（如达到 actionLimit）停止贡献。

Aha 与 Actor 共用自然回合、回合 Buff 与倒计时到期规则。它不能被提前、延后或立即行动；自身变速不生成拉条 Trace。
配置面板的只读速度使用草稿编队，尚未计入开始操作；Apply 将编队、预算、轮次与阿哈一并提交，并保留 Aha ID。

Version 3 的贡献者 ID 是已保存的身份事实，不在导入时随新快照静默重算。明确 Apply 编队时重新识别已知身份；未知且未改变的身份保留已有事实，并报告资源问题。
额外阿哈时刻、欢愉技、笑点和技能自动触发未实现；“持续到阿哈时刻结束”当前按一个自然回合近似处理，不宣称完整复现游戏机制。

## 编辑状态与展示时点

[PlannerDocument](../../src/tools/action-planner/model/editor.ts)包含 `name`、`plan: SimulationPlan` 和 `metadata: { customNames, characterIds }`。计划编辑重放引擎，显示名称编辑不改变数学结果。
战斗配置为独立 Apply 草稿；切换工作阶段不会把未应用配置当作已提交计划。操作草稿在节点、阶段或导航模式切换时丢弃，取消不改已提交内容。

保留操作编辑 ID 和速度编辑时的 Actor ID；角色替换产生新 ID，保留旧操作与失效引用，不按索引重新绑定。
锚点分别为 start、participantId + turn、trigger participantId、cycleBoundary ordinal。动态与倒计时身份由操作 ID 派生，不能按数组位置重建。

目标预览使用 `previewOperationState` 在选中锚点、阶段及操作位置恢复执行上下文，资格与引擎共用；不可用上下文不能用最终参与者目录代替。
不可达事件保留原锚点，允许查看、删除与配置修复，不虚构目标。

## 跨节点批量预设

[presets.ts](../../src/tools/action-planner/model/presets.ts)中的工具层 Builder 先生成候选 PlannerDocument；useActionPlanner 通过统一文件校验和 simulatePlan 重放后一次提交。生成操作出现目标失败警告或候选存在错误时不发布文档、结果或部分存档；预算导致的不可达 Anchor 警告允许保留。ID 由现有分配器预留，失败后不复用已经分配的身份。

卡厄斯兰那预设在所选阶段末尾追加八个 spawnParticipant 与一个显式 depart，另以最后事件的稳定 trigger Anchor 保存 returnToField。离场及回场目标是开始时实际在场的全部我方 Actor ID；没有合法目标时拒绝创建。既有操作与自定义名称保留。
参数为用户输入的基础速度 B 和继承百分比 r，八个事件设置 `baseSpeed = B`、`speed = B × r / 100`、`initialAG = i × 10000 / 7`（i = 0…7），不舍入。默认基础速度读取白厄快照，继承比例默认 60%；不识别星魂或击杀，不限制比例到 84%。
事件名称在创建时从 Site Messages 取得并保存为普通可编辑名称。提交后十条操作各自独立，没有预设组状态、隐藏效果或删除联动；编辑事件保留其 ID、独立 baseSpeed 和 initialAG。一星魂加速由用户多选剩余事件，添加普通无限持续百分比 Modifier。

知更鸟终结技预设通过 metadata.characterIds 的角色 ID `1309` 识别我方 Actor，并在所选锚点、阶段及插入位置的真实预览中检查存在与在场状态；不依赖显示名称、固定槽位或最终参与者目录。身份缺失、歧义、已离场、已移除或上下文不可用时拒绝应用。

预设在所选阶段末尾依次追加显式知更鸟 depart、动态 allies immediatelyAct、创建「协奏」Scheduled Event（speed = 90、initialAG = 10000）。知更鸟已先离场，因此不参与群体立即行动；其他已离场队友也不参与。没有其他在场我方 Actor 时省略群体操作。协奏的稳定 trigger Anchor 下依次追加知更鸟 returnToField、immediatelyAct；回场本身保留 AG，立即行动独立清零。倒计时独立于知更鸟 SPD，首次触发间隔默认 10000 / 90 AV，可继续通过普通操作提前、延后或变速，不保存绝对触发时间。

其他在场队友的 preAction 中，群体立即行动会命中 active-target，因此预设明确拒绝并提示改用 postAction；当前行动者已离场时按真实目标集合判断。知更鸟自身的 preAction / postAction 沿用当前自然回合完整结算及 AG 重置规则，不模拟中断回合。知更鸟与卡厄斯兰那共用内部批量校验与提交函数；生成操作目标失败或完整候选重放错误时均不部分发布。既有 Anchor 操作按原序保留，新操作随后追加。提交后的四或五条操作均可独立编辑、删除；删除协奏创建操作保留孤立回场 Anchor 并诊断，不级联清理。预算外 Anchor 及既有持久化保护规则不变，不增加角色专属引擎行为。

[当前队列投影](../../src/tools/action-planner/model/current-queue.ts)在开始位置读取开始操作结算后的初始 Snapshot，其余位置读取 NodeRecord.beforeEffects；引擎 snapshots 保留原本的结算后语义。
queueCursor 与 Inspector 选择独立，模式切换保留推进锚点；重放后锚点不可达则游标回开始，Inspector 保留原选择用于修复。
Trace、Tag、目标头像与数值展示约定见 UI 设计规范，不改变执行状态或持久化文档。

## 方案格式与持久化

[document-file.ts](../../src/tools/action-planner/model/document-file.ts)是 JSON 导入 / 导出、存档和模板的统一严格边界：

```text
format: "hsr-game-tools/action-planner"
version: 9
document: { name, plan, metadata }
```

这是字段概览，实际方案使用工具完整导出的 JSON。未知字段、无效结构、重复或不安全身份不会通过放宽校验来兼容。
上限为 2 MiB、1000 个事件、2000 个操作；其他字符串、目标与嵌套边界以源码 FILE_LIMITS 为准。
文档保存计划、用户名称、角色映射与 Aha 配置，不保存运行结果、Trace、队列、导航、草稿或迁移通知。
Version 4 保留 Version 3 的身份事实与原操作格式，支持 Presence Operation 和 Scheduled Event 可选 baseSpeed；departed 与运行时 Modifier 不持久化，由普通操作重放恢复。旧事件省略 baseSpeed 时以 speed 为基数，不补写字段；旧参与者默认在场。Version 1 / 2 迁移、身份保护、未知字段拒绝及存档保护机制继续沿用。

Version 1 严格迁移时补 `cycleMode: none`；Version 1/2 均补冲突安全的 Aha ID 与可确认的初始贡献者，保留原单位 / 操作 ID、锚点和孤立引用。
新增 Aha 可能改变排序和预算内可达节点，UI 提供升级提示；不支持未来版本，导出统一为 Version 9。
导入中的未知 Character ID 保留，非法图片路径移除并报告；图片仅允许资源目录已登记的相对路径。初始敌人以 baseSpeed 统一两项 SPD，保留其他合法字段。

[usePlannerSession](../../src/tools/action-planner/composables/usePlannerSession.ts)先恢复存档，再注册浅提交 watcher；[持久化模块](../../src/tools/action-planner/model/persistence.ts)使用 localStorage 键 `hsr-game-tools/action-planner/current`。
启动迁移不立即回写；导出和页面 teardown 不补写存档。只有提交后的完整文档参与自动保存。

坏存档 / 未支持版本保留原字节并保护写入；外部修改或清空暂停保存，不自动替换内存文档。每次写入比较已知存储基线；明确覆盖需要用户选择与当前 token，并在写入前再次比较。
读取或写入失败时仍可编辑、导出和恢复；只有成功写入才显示已保存。没有跨标签页合并或实时协作。

## 方案与模板维护

普通导入、模板和存档均使用上述解析边界，先校验并准备推演，再确认完整替换；失败或取消不替换当前文档。
非空方案或未提交输入被替换前确认；新建空方案也会更新当前存档，受保护存档仍需明确覆盖。

**正式配队模板必须由用户审阅，不得根据截图或角色技能描述自动生成。**当前[正式目录](../../src/tools/action-planner/templates/catalog.ts)为空；测试方案不进入生产目录。

1. 在工具中配置完整方案，导出 Version 9 JSON 并人工审阅。
2. 将文件放入 [templates/plans/](../../src/tools/action-planner/templates/plans/)。既有 Version 1/2/3/4/5/6/7/8 模板由统一解析器兼容，不手工省略当前字段。
3. 在 catalog.ts 显式导入 JSON，登记唯一 id、order、nameKey、descriptionKey、file，以及可选 conditionKey / gameVersion。
4. 在两份 Site Messages 添加同路径的名称、简介和可选条件介绍；头像读取方案角色映射，不另外构造队伍身份。
5. 按[开发指南](../development.md#验证策略)运行模板与 i18n 校验，以及方案文件相关测试。

加载获得独立、可编辑的当前文档，不与源 JSON 持续同步；目录或模板更新不自动覆盖用户正在编辑的方案。

## 当前功能边界

尚未实现完整技能执行、伤害与能量系统、多波次、角色特殊行为自动推演、额外阿哈时刻、真实敌人数据目录、云同步、账号或多方案库。
装备预设只创建可编辑的普通操作，不自动判断装备条件。[抽卡模拟器](warp-simulator.md)与[货币战争优化器](../currency-wars.md)已作为独立工具实现，不与排轴引擎共享业务状态；遗器模拟器仍在施工中。
这些边界描述当前工具实现；机制不确定处保留上述近似和限制，不将静态验证等同于完整游戏验收。

## 战技点最小校验

Version 4 增加可选的 `plan.skillPoints: { enabled?, initial?, max? }`，缺省关闭；启用时初始值默认 3、上限默认 5。初始值和上限必须是非负安全整数，且初始值不超过初始有效上限。基础 max 固定，有效上限按下文在场修正派生。
自然行动的 PlanEvent 可保存 `skill`：`{ kind: 'basic' }`（恢复 1）、`{ kind: 'skill' }`（消耗 1）或 `{ kind: 'custom', cost, recovery }`（两项均为非负安全整数）。标注与原行动 Anchor 绑定，独立于 operations；删除最后一条操作仍保留技能标注。参与战技点的单位未标注代表未知。

自动参与规则统一由 `usesSkillPoints(actor)` 定义：kind=actor、camp=ally，且 category 不是 summon / memosprite；undefined / custom 类别保持参与。执行支付、操作预览支付、回合结束补充共用该谓词。召唤物／忆灵既不因缺少标注污染余额，也不支付、自动恢复或触发 refill；旧文件中的合法 skill 保留但忽略，不拒绝导入。Inspector 隐藏其技能标注并提示“不参与战技点”，单节点及批量标注均不能修改它们。显式 restoreSkillPoints / conditionalRestore 仍可手动配置在其 action 上，不自动推断技能、目标、消失效果或角色专属触发条件。

共享余额仅由我方 Actor 的 action 节点结算，包括按普通 action 调度的召唤物和忆灵；不自动推断它们的资源规则，需要用户显式标注。敌方、Aha、Scheduled Event 和轮次边界不影响队伍余额。动态我方 Actor 使用相同规则。

状态机：关闭时完全沿用原推演；启用时从已知余额开始。进入我方行动后，先按原相对顺序执行 preAction 资源事件，再检查完整消耗并支付，执行其余 preAction 和回合推进，然后恢复 `min(计划恢复, 上限 − 当前余额)`，再执行全部 postAction 操作、符合条件的存储补充、到期及退出。记录保存支付前后余额、消耗、实际恢复与溢出；溢出另发诊断。支付不能借用该行动之后的恢复。

默认 stop 模式下余额不足时整次行动不提交：不提交该行动的操作、效果或回合推进；preAction 资源候选记录保留为支付检查依据。结果以 error 停止，blockedAction 保存失败行动的时点、执行前状态和不足记录，但不进入已完成 records / snapshots / 节点计数；导航提供失败行动的修复入口。缺少标注时余额转为 null（未知），本次及后续我方行动记录均未知，停止所有后续支付和恢复校验，原时间轴与操作继续执行；补齐标注会完整重放。

Version 1/2/3 经严格旧字段校验后迁移；不添加启用配置，战技点默认关闭，Version 3 的身份事实及既有时间轴保持不变。Version 4 同样拒绝未知字段、非法金额及在非 action Anchor 上放置技能。运行时余额、战技点记录与 blockedAction 不写入方案文件。存档、模板和文件共用版本边界，旧存档恢复不立即回写。

本轮不自动执行技能的拉条或变速，不实现角色特例、随机返还、能量、额外回合、多技能、任意时点上限事件或任意时点的独立资源事件。反事实推演仅由下文 mark 策略启用。

本轮本地人工验收建议：

1. 配置一名我方角色，启用校验并应用默认 3/5；选中自然行动，依次标注战技和普攻，核对卡片及详情中的余额。
2. 将初始值改为 0，给首个行动标注消耗 1、恢复 1 的自定义技能；确认在该行动前停止，选中不足行动改成普攻后恢复推演。
3. 在上限余额使用普攻，核对实际恢复 0 与溢出 1；清除一个早期行动的技能标注，确认后续余额未知而 AV 轴继续。
4. 导出、重新导入 Version 4；载入旧方案确认默认关闭。切换中英文并检查窄屏的表单、输入错误和失败行动选择入口。

## 正向战技点操作（Version 5）

`restoreSkillPoints` 复用现有 operation ID、排序、Anchor 和阶段。格式为 `{ id, type: 'restoreSkillPoints', amount, source, phase? }`，没有 target。amount 必须为正安全整数（不接受 0、负数、小数及非有限数），source 必须为非空白字符串，最长 256 字符。来源只是用户标签，不识别角色或自动检查终结技、条件返还的触发条件。

只接受 start（无 phase）与我方 Actor 的 action（明确 preAction / postAction）。敌方、Aha、trigger、cycleBoundary 及无法解析来源单位的 action 均在方案校验时报错；运行时再次检查来源资格。动态创建的我方 Actor 可使用相同操作。

start 内按配置顺序执行。action 的 preAction 中先筛出所有资源操作，保留它们之间的顺序，并在技能支付之前执行；其余 preAction 保留原相对顺序，在支付后执行。技能自身恢复先于 postAction，postAction 的普通操作和资源操作沿原配置顺序执行。因此 preAction 回点可支付本回合，postAction 回点不能救 stop 模式的支付失败；多个回点逐条封顶，不合并净值。

每个事件恢复 `min(amount, max − current)`。事件记录包含 operationId、source、计划 amount、before、after、实际 restored、overflow；溢出另发关联 operationId 的诊断。未知余额保留 null，实际恢复和溢出也标为 null，不靠后续回点恢复已知状态。关闭校验时事件被忽略，不产生资源运行记录，不改变既有时间轴。

NodeRecord.skillPointEvents 与 SimulationResult.startSkillPointEvents 分别保存行动和开场事件结果；技能记录仍单独描述技能支付及自身恢复。操作详情展示实际恢复与溢出，节点与操作卡使用相同的“+数量 战技点 · 来源”消息描述配置。结果不持久化。

Version 5 的文件、存档与模板共用严格边界；Version 1–4 均可迁移，但旧版本文件不能夹带新操作。旧方案未配置校验时继续关闭；Version 4 已显式保存的战技点设置和技能标注原样保留，不覆盖用户已启用的配置。恢复旧存档仍不立即回写。

预览与执行共用支付、恢复和 operation 执行函数，并采用同一阶段顺序。编辑 preAction 资源时，预览停在该资源之前，不提前支付；这保证余额不足的行动仍能添加回点修复。普通 preAction 和 postAction 的目标预览在 stop 模式支付失败时不可用；mark 模式沿用反事实支付状态继续预览。

手工验收：在开场新增 +2；在初始 0 点的战技行动新增 preAction +1，确认可行动；切到 postAction 确认仍不足。在 5/5 的开场增加 +2，检查实际 0 / 溢出 2。核对中英文、来源长文本、无目标表单、修改／排序／删除、文件重载与窄屏布局。

本轮仅实现手动正向事件，不实现随机判定、其他冷却机制、角色特例、能量、任意上限事件或事件负向消耗；不自动执行终结技，也不自动判断条件是否成立。

## 不足策略与失败摘要（Version 6）

战技点配置增加可选 `onInsufficient: 'stop' | 'mark'`，缺省为 stop。该字段只改变余额不足时的执行策略，不改变消耗、恢复、上限截断或事件顺序。

- stop：保留严格执行行为。支付不足时不提交该行动，blockedAction 保留修复入口，实际支付、技能恢复与溢出均为 0。该行动的 preAction 回点候选记录增加 `committed: false`；详情明确标“未提交”，尚未执行的 postAction 回点也标“未提交”。候选数字不计入已提交统计。
- mark：首个不足行动标为 insufficient，实际支付完整消耗，余额允许为负，然后继续原有操作、技能恢复、postAction 与退出结算。不生成 blockedAction，不改变时间轴调度。此后状态锁定为 unverified，即使回点已使余额恢复到正数或上限，也不重新宣称已验证。后续技能记录使用 unverified，shortfall 保留该行动的缺口；自然行动、单次事件、敌方和轮次边界均携带下游未验证标记。
- 未知优先：任何我方行动缺少技能标注时，余额成为 null；该节点及后续节点使用 unknown，停止数值支付和恢复推断。若未知先于不足，不虚构不足节点；若先不足后未知，保留首个不足位置，后续显示未知。

技能记录区分计划 cost、实际 paid、计划 plannedRecovery、实际 recovery 和 overflow，before / after 描述该技能支付及自身恢复的前后余额；资源事件保留独立记录。mark 中仍使用 `min(计划恢复, max − current)`，例如 0 点支付 1 后为 −1，再恢复 2 后为 1；不把负数钳到 0；技能自身的溢出仍不存储，只有显式恢复操作可以选择存储。

派生的 `skillPointsSummary` 保存首个不足 Anchor、已提交的总消耗、总实际恢复、当前推演终点余额及验证状态。总恢复同时包含开场、行动资源事件和技能自身恢复，排除上限溢出及未提交候选。遇到未知后，完整总消耗／总恢复和期末余额显示未知，不将已知前缀冒充完整统计。stop 摘要截至最后已提交状态；mark 摘要可包含负值，并明确标示首个不足起为反事实结果。摘要和节点标记不写入方案文件。

Version 6 统一用于导出、存档和模板；Version 1–5 严格按各自字段迁移，旧文件不接受夹带 onInsufficient。旧方案缺省 stop，已有 enabled、初始值、上限、技能和资源事件保持原值。迁移不立即回写存档；非法策略值和未知字段拒绝导入。

UI 在战斗配置中使用“不足时：停止／标记并继续”，通过 Apply 提交并完整重放。推演顶部显示首个不足入口、总量、终点余额和统计范围，未来节点的 badge 区分不足、未验证和未知；不把未来结果标记投射成当前队列已经发生的事实。技能详情仍显示余额和实际数量。

人工验收：将初始值设为 0、首行动标战技，先确认 stop 产生可编辑不足节点；切到 mark 并应用，确认 −1、后续未验证、时间轴继续。添加回点检查余额恢复但验证状态不恢复；清除技能标注检查未知传播。给 stop 的失败行动添加不足以支付的 preAction 回点，确认详情“未提交”且摘要不计入。核对文件往返、中英文和窄屏。

仍未实现随机判定、其他冷却机制、角色特例、能量、任意时点上限事件或负向资源事件。未勾选存储的恢复操作仍为“上限截断、溢出浪费”；可选存储与补充规则见下文 Version 7。

## 溢出存储与回合结束补充（Version 7）

`plan.skillPoints.storedMax?` 是固定存储上限，默认 10，允许非负安全整数，0 表示不存储。`restoreSkillPoints.storeOverflow?` 是可选布尔值，默认 false。运行时队伍状态增加 `stored`（初始 0）和解析后的 storedMax；方案只保存配置和操作，不保存运行时缓冲。旧 Version 1–6 严格迁移，既有操作不自动勾选存储，因此旧方案的恢复和浪费行为不变；Version 6 不接受夹带上述新字段。

恢复顺序固定为：先恢复 `min(amount, max − current)` 到当前余额；overflow 为未能直接恢复的数量。勾选存储时，存入 `min(overflow, storedMax − stored)`；其余为 wasted。不勾选时存入 0，overflow 全部浪费。事件记录的 stored 是本次存入量，storedAfter 是存储余额；overflow 不等于 wasted。技能自身的普攻或自定义恢复不自动存储溢出。

我方角色 Actor 完成 postAction 后、回合 Modifier 到期与 actionLimit 退出之前，当前余额已知且低于上限、缓冲已知且大于 0 时，自动补充 `min(stored, max − current)`。分类为 summon 或 memosprite 的 Actor、敌人、Aha、Scheduled Event 和轮次边界不触发；普通 character、自定义或省略 category 的我方 Actor 触发。动态创建单位沿用相同分类规则，不读取任何角色 ID 或名称。离场操作不取消该单位已经进行中的完整自然回合，因此当前行动者即使 postAction 离场，仍按上述顺序结算。

`NodeRecord.refill` 保存 amount、before、after、storedBefore、storedAfter；`skillPointStorage` 汇总该节点的 overflow、stored、wasted 和最终 storedAfter，资源事件记录也保存这四项。补充不是可编辑的额外 operation，不建立新 Anchor，不增加节点／行动次数，也不再产生溢出。当前队列仍投影 beforeEffects；未来节点和详情展示已提交的存入及回合结束补充。

stop 不足节点在补充前停止，不能预借缓冲支付，也不提交候选存入；详情继续标“未提交”，节点汇总和摘要保留最后已提交存储余额。mark 的反事实行动照常补充，包括先填负余额，但 insufficient / unverified 状态不会因此解除。

未知当前余额不触发补充。不勾选存储的未知事件保留原缓冲，不推测浪费数量；勾选存储且容量非零时，因溢出量无法确认，缓冲也转为未知，事件 stored / wasted / storedAfter 为 null。容量 0 的缓冲仍为 0。未知不会由后续回点恢复为已知。

摘要增加 storedBalance；总恢复只计算直接进入当前余额的恢复和实际 refill，不把存入缓冲算一次、取出再算一次。存储余额可独立于当前余额显示已知或未知。UI 提供存储上限及“溢出可存储”Checkbox，未来节点显示“+6（存储 1）”与“回合结束 +1”，操作详情显示实际恢复、总溢出、存入、浪费和存储余额。

本轮机制依据工作区 `data/nanoka/1306.json` 的 enhanced['1'].skills['1130603']：终结技描述给出溢出记录与我方角色回合结束补充，等级参数第 2 项为 6、第 5 项为 10。数据只用于人工核对，不成为引擎依赖。要表达该资源机制，用户填写基础 SP 上限及所需的在场修正、存储上限 10，并在合适的 Anchor 手动加入 amount 6、storeOverflow true 的恢复操作；来源仅是展示标签。该配置不自动判断终结技能量、角色存在、天赋／星魂、释放条件或其他技能效果。

本轮不做存储过期、跨波次、任意时点上限事件、负向事件、随机判定、其他冷却机制或角色专属逻辑。

人工验收：先配置 0/5，在开始处恢复 6 并勾选存储，核对存储 1；再让我方角色使用战技，核对回合结束 +1。初始 5/5 连续恢复两次 6，核对存储 10、浪费 2。取消勾选、设置容量 0、切换 stop／mark、清除技能标注，检查失败、未验证和未知状态。核对 Version 7 文件往返、中英文和窄屏表单。

## 基础上限与在场修正（Version 8）

可选 `plan.skillPoints.maxModifiers` 保存 `{ amount, sourceParticipantId? }[]`。amount 为非零安全整数，允许正负；sourceParticipantId 必须引用当前方案初始队伍中的我方 Actor，不接受敌方、动态生成单位、Aha 或缺失身份。省略 source 时始终生效；有 source 时仅在该 ID 的单位仍存在且未离场时生效。修改来源角色身份不会按槽位自动重绑；配置中出现旧来源时要求用户修复或移除。

`state.skillPoints.baseMax` 保存基础 max，运行时 max 为基础值加所有生效修正之和。初始队伍在开始操作前全部在场，校验初始值不超过初始有效上限，而非基础 max。有效上限必须为非负安全整数；初始非法配置拒绝，运行中因离场／退出变成非法上限时以 invalid-sp-max 诊断停止，不允许后续操作掩盖错误。

重算时机是全部初始单位创建完成、每条 depart / returnToField 整体提交候选状态后，以及参与者因 actionLimit 退出后。群体 Presence 操作同时变更多个目标再重算，保留原子的目标语义。创建动态单位不能激活修正来源。执行和预览均调用相同 Presence 实现，因此支付、技能恢复、资源事件和 refill 总是使用其发生时的有效 max。既有 preAction 资源优先于技能支付、其余 preAction 的顺序不改变；配置中的回场不会跨阶段提前执行。

上限升高只修改 max，不增加 current 或 stored。上限降低时，已知 current 超过新上限才截断到新上限；记录 beforeMax、afterMax、before、after、loss、触发原因及可选 operationId／participantId。损失不进入 stored，不算资源恢复的 overflow / wasted。未知 current 不截断，仍记录上限变化且 loss 为 0。stored 始终不受上限变化影响。回场本身不补点，但其后正常回合结束 refill 可按新的上限执行。

Presence 操作的记录保存在 applyOperations.maxChanges，随后归入 NodeRecord.maxChanges 或 SimulationResult.startMaxChanges。actionLimit 的移除发生在 postAction、refill、效果到期之后，其降限及截断归入当前节点。该节点若因非法上限失败，保留最后完整提交状态，不提交部分回点、离场或损失。

摘要增加 baseMax、effectiveMax 和累计 capLoss。总消耗仅计技能支付，累计截断损失单列；初始值 + 总恢复 − 总消耗 − capLoss 对应已知的当前余额，缓冲存入仍只影响存储余额。未来节点、开始节点和 Inspector 显示上限变化及具体截断；不从未来记录补写当前队列状态。

战斗配置提供上限修正列表、非零整数输入和“仅当此角色在场”选择，始终生效使用独立选项。角色候选来自初始队伍草稿，错误来源保留可见的缺失 ID；Apply 一次提交编队与修正。初始预览显示例如“基础 5 +2 = 7”，运行摘要显示当前实际生效值。所有新增文案进入中英文消息。

Version 8 文件严格接受 maxModifiers；Version 1–7 迁移不添加修正、保留原基础上限与默认行为，旧文件不能夹带新字段。运行时有效 max、baseMax、损失记录及摘要均不持久化；只导出基础 max 和用户配置的修正。

通用表达方式：基础 max 5，添加 amount +2 并选择对应的初始我方 Actor。该单位在场时有效 max 7；离场或退出后回到 5；回场后恢复 7。引擎不识别角色 ID、名称、天赋文字或角色资源快照。

本轮不新增动作中途的任意上限操作、持续时间、跨波次、能量、随机判定、其他冷却机制或其他角色逻辑。存储过期仍未实现。

人工验收：设置基础 5、初始 7、来源在场 +2 并 Apply；在开始或行动节点添加离场，确认上限降到 5、截断损失 2、存储不变。添加回场确认上限 7 且回场瞬间不回点。核对始终生效、负修正、来源替换／移除错误、actionLimit 退出、恢复／补充使用新上限，以及文件重载、中英文和窄屏。

## 条件返还与来源自身回合冷却（Version 9）

`conditionalRestore` 是队伍级无目标操作，字段为 amount（正安全整数）、chance（0–1 有限数）、cooldownTurns（非负安全整数）、outcome（proc / no-proc）、sourceParticipantId、source，以及普通 id / phase。chance 只用于展示与记录；不抽随机数、不计算期望值，也不据此覆盖用户所选 outcome。

仅接受我方 Actor 的 action.postAction，sourceParticipantId 必须等于该 Anchor 的 participantId。参与战技点的 Actor 要求该 PlanEvent 的 skill.kind 为 skill；召唤物／忆灵不使用技能标注判断，允许用户按实际效果手动配置。开始、preAction、事件／轮次、敌方，以及参与战技点 Actor 的普攻、自定义和未标注行动均拒绝。动态创建的我方 Actor 沿用相同规则。为维持单一条件返还范围，同一行动最多一条，不能用多个操作叠加触发。

冷却运行状态为 `skillPoints.conditionalCooldowns: Map<sourceParticipantId, availableFromTurn>`，初始为空，状态克隆独立复制；不按 operationId 分开计时。行动先完成技能支付、技能恢复，再依 postAction 列表顺序执行条件返还和其他操作，最后执行回合结束补充、到期与退出。进入 postAction 时，source.turns 已递增为当前自身回合数。

判定顺序为：当前自身回合小于 availableFromTurn → cooldown，跳过且不重置；否则 outcome 为 no-proc → 不返还、不新建冷却；否则 proc → 设置 availableFromTurn = source.turns + cooldownTurns + 1，再处理余额。余额已知时恢复 min(amount, max-current)，记录 overflow / wasted；余额未知时仍记 proc 并进入冷却，before / after / restored / overflow / stored / wasted 均为 null，current 仍未知，存储余额保持原值。即使实际恢复为 0、全部溢出，成功触发也进入冷却。条件返还不支持溢出存储字段。

1 回合冷却的明确口径：第 1 次自身行动触发，availableFromTurn=3；第 2 次自身行动不可触发，第 3 次恢复。cooldownTurns=0 时下一个自身行动即可再次触发。队友、敌方、单次事件和轮次不会推进该计数，离场不产生自身回合，也不重置冷却。来源已经在当前自然行动中离场不取消其已执行战技的 postAction 结算。

stop 支付失败时不执行条件返还，也不进入冷却。mark 按反事实负余额继续结算，返还与冷却照常记录，但 insufficient / unverified 标记不解除。余额未知不覆盖 cooldown / no-proc / proc 状态，也不会因后续 proc 恢复为已知。blockedAction 的 Anchor 记为已到达，仅其后的真正未到达事件产生 unreached-anchor；不足仍由 sp-insufficient 与可编辑的 blockedAction 表达。

`NodeRecord.conditionalRestores` 保存来源 ID、标签、amount、chance、cooldownTurns、用户结果、实际 status、before / after、restored、overflow、stored、wasted 及可选 availableFromTurn。cooldown / no-proc 明确未返还，数值为 0，即使余额未知也保持该状态；未知 proc 的返还数值为 null，不冒充 0。节点存储汇总与摘要总恢复包含条件返还的实际量；不会重复计数，也不会把溢出算作恢复。运行时冷却、记录及摘要不写入方案文件。

编辑器提供数量、展示概率、冷却、自选本次结果和来源标签；来源行动单位只读，自动采用当前 Anchor 身份。详情显示触发并注明再次可用的自身回合、未触发、冷却中或未知。余额不足的 stop 节点中该操作标为未提交。普通目标预览继续使用相同执行函数并接收当前技能上下文，避免预览重置或绕过冷却。

Version 9 文件／存档／模板接受新操作；Version 1–8 迁移不添加条件操作，冷却从运行时空状态重放。旧版本文件不能夹带新类型，当前文件严格拒绝非法字段、目标、阶段或技能上下文。

数据核对来源是工作区 data/nanoka/1101.json 的 ranks.1：描述为施放战技后 50% 固定概率恢复 1 点，1 回合冷却。本轮按用户明确的自身回合口径实现通用字段，不按角色 ID／名称分支，也不在运行时读取该数据文件。

本轮不实现随机种子、随机数、期望值、多触发叠加、其他角色机制、能量或跨波次；chance 与 outcome 不做概率一致性约束，outcome 是用户显式选择的本次结果。

人工验收：启用 SP，为同一单位三个自身战技行动各添加 amount=1、chance=0.5、cooldownTurns=1、outcome=proc；确认第 1 回合触发、第 2 回合冷却、第 3 回合恢复。改成 no-proc / cooldown=0，核对冷却记录；切换 stop／mark、清除更早行动的技能标注，核对未提交、反事实和未知。检查文件重载、中英文、表单错误与窄屏。

## 账本与批量标注

每轮战技点账本由 model/skill-point-ledger.ts 只读派生，不调用引擎重放、不向结果或方案添加字段。第 0 轮起始余额取开始操作前状态，开场的已提交恢复／上限变化计入第 0 轮。按 records 的实际顺序遇到 cycleBoundary 时，使用其 beforeEffects 结束上一轮；边界自己的操作计入新轮。同 AV 下已经先结算的自然行动仍属于上一轮。关闭轮次时仅有“全程”一行，不按 AV 猜测轮次，也不虚构预算外或尚未到达的行。末行可为部分轮次。

账本分别统计实际技能支付、技能自身恢复、外部恢复（普通资源操作和条件返还）及回合结束 refill。只计已提交实际恢复，存入缓冲不提前计收入，stop 候选记录不计入；首个不足位置仍可跳转至 blockedAction。期末余额、存储余额与有效上限取下一个边界的 beforeEffects 或现有最终摘要，不重新计算技能／存储数值。上限变化保留逐条记录，截断损失单列。每轮首个不足取该轮最早的 insufficient 或已记录 shortfall>0 行动，mark 下仍明确属于反事实结果。

未知轮次的完整消耗、技能恢复、外部恢复、refill 和截断损失总量显示未知；此前完整已知的轮次保留数值。未知和未验证可同时标注，后续 mark 轮次不会因余额恢复而自动变成已验证。存储余额沿用独立已知／未知状态。账本位于现有摘要下方，原生 details 折叠；宽表在窄屏横向滚动，键盘可聚焦滚动区。

“批量设置技能”只筛选当前 result.records 和已显示 blockedAction 中 usesSkillPoints(actor) 为真、anchor.kind=action 的节点，包括动态我方角色；排除召唤物、忆灵、敌方、Aha、事件和轮次。不扩展 maxNodes / maxAV，不生成尚未显示的未来节点。“当前之后”以 Inspector 选中的 Anchor 为界且不包含它，按真实记录顺序筛选，非累计 AV；开始位置等同全部，孤立的不可达选择无匹配节点。“指定角色”使用稳定 Participant ID，不按槽位或数组下标重绑。

批量对话框先预览范围内节点数、实际改变数、覆盖已有标注数和目标技能，再要求用户点击确认。相同技能不算修改。预览快照固定 Anchor 清单、技能值及来源文档／结果引用；确认令牌必须仍匹配当前文档和结果，过期则重新预览。取消、返回、关闭／Escape 均不提交、不触发存档。

确认通过现有 replacePlan / 文件校验 / 重放 / 提交 watcher 路径一次发布。只替换目标事件的 skill；既有 Anchor 与 operation 数组保留，缺失事件追加 skill-only action 配置，其他事件、metadata、预算与范围保持原值。重放后部分节点即使不可达，标注仍保留在原 Anchor，不继续向新出现的行动补写。已有 conditionalRestore 的行动若请求普攻或自定义，预览明确报不兼容，整批不提交；用户需调整范围或先处理原操作，不自动删除 operations。

本轮不修改任何引擎数值规则，方案版本保持 Version 9。账本、批量预览、确认令牌和对话框状态均不持久化；只保存确认后已有格式的 skill。

人工验收：展开多轮账本，核对边界操作、普攻回点、条件返还、存储补充和上限截断；切到无轮次确认仅全程一行。标记模式检查未验证，删除早期技能标注检查未知行。批量选择全部／当前之后／指定角色，核对覆盖数量，取消后重新打开确认未落盘；确认一次后核对操作卡、不可达标注和预算未改变。检查中英文、窄屏横向滚动、键盘与 Dialog 的关闭／返回。
