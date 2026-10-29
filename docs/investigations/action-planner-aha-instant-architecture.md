# Phase 2C-0：阿哈时刻架构调查

日期：2026-10-14，Asia/Shanghai。

本轮只读审查代码、验证现有基线并交付架构报告。文中的接口、Version 3、UI 和测试新增项均为下一轮设计，尚未实现。本轮没有修改引擎、组件、游戏快照或 Version 2 Schema，没有执行浏览器自动化，没有提交、推送或部署。

调查依据：任务文档 `Codex-Prompt/Action-Simulator-02/Aha-Instant-Integration-Investigation.md`、本仓库 `AGENTS.md`、[设计说明](../design-notes.md)、[Phase 1A 迁移报告](phase-1a-independent-foundation.md)、[Phase 2B 轮次报告](action-planner-endgame-cycle-system.md)，以及本报告列出的现行源码。游戏公式与出现条件采用用户已确认的机制，不重新推断技能描述。

## 1. Executive Summary

**阿哈时刻可以可靠加入现有引擎。推荐新增独立的 `kind: 'aha'`，共享自然行动生命周期，并将 `effectiveSpeed()` 改为显式接收 SimulationState。无需重写 AG/AV 调度，也无需建立通用属性依赖图。**

阿哈拥有独立剩余 AG 和回合计数，是能够重复行动的中立 Participant；它不占初始编队槽位，不属于固定累计 AV 的轮次边界，也不属于一次性 Scheduled Event。其速度由初始欢愉角色在当前模拟状态中的有效速度实时派生。

主要工程变化是参与者联合类型、自然行动分支、速度上下文和严格文件迁移。普通 Actor 的速度公式、回合 Buff 结算、立即行动、Trace、稳定锚点和轮次优先级保持原语义。`settleActor()` 包含 Actor 专属逻辑，不能原样用于阿哈；只抽出自然回合推进部分，不把整个生命周期泛化。

首版支持阿哈节点配置标准操作，禁止直接对阿哈应用提前、延后、立即行动和速度修正。直接目标机制尚未确认，但这不阻止上述范围实施。

用户在调查阶段确认了两项决策：

- Version 1 / 2 方案识别出欢愉角色后，升级时自动加入阿哈并重算，不保留长期旧排轴模式。
- 达到 actionLimit 并从模拟状态移除的欢愉角色停止速度贡献；阿哈继续存在，贡献全部消失后只剩基础速度。

## 2. 当前代码依赖审计

### 2.1 引擎审计

当前 `ParticipantDefinition` / `ParticipantState` 只有 Actor 和 Scheduled Event；`Camp` 只有 ally / enemy。`nextAnchor()` 和 `stepSimulation()` 把非 Actor 走向 trigger / 一次性结算路径，因此新增类型必须逐一处理，不能只扩展联合类型。

| 文件 / 函数                                      | 当前职责                                                        | 下一轮调整                                                            | 接口影响                                        |
| ------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| `src/engine/action-planner/types.ts`             | 定义计划、运行时状态、目录、记录和锚点                          | 增加 AhaConfig、AhaState 和自然行动类型；扩展参与者身份及中立展示阵营 | SimulationPlan 必填 aha；运行时联合类型增加 aha |
| `queue.ts: effectiveSpeed()`                     | 自身 speed，或 panelSpeed 加 flat / 基于 baseSpeed 的百分比修正 | 统一读取传入状态，增加阿哈派生分支                                    | 增加必填 state 参数                             |
| `queue.ts: orderedParticipants()`                | 排除 active，按完整精度 AV、零 AV 优先级和 order 排序           | 向速度入口传入同一状态                                                | 外部签名不变                                    |
| `queue.ts: queueSnapshot()` / `assertState()`    | 生成队列速度、AV、modifier 副本并检查数值                       | 支持阿哈；modifiers 对阿哈为空；统一速度上下文                        | 外部签名不变                                    |
| `queue.ts: advanceTime()`                        | 对全部参与者扣除 deltaAV × SPD                                  | 先计算全体区间起点速度，再统一扣减；保留现有减法残差归零              | 外部签名不变                                    |
| `queue.ts: cloneState()` / `nextAnchor()`        | 独立复制状态，Actor 下一回合或事件 trigger                      | 复制阿哈贡献者数组；阿哈返回 action / turn 锚点                       | 锚点格式不变                                    |
| `engine.ts: createInitialState()`                | 校验并按我方、敌方、position、ID 创建初始 Actor                 | 初始 Actor 创建后、start 操作前自动创建阿哈                           | 外部签名不变                                    |
| `engine.ts: nextSimulationEvent()`               | 比较首个 Participant 和下一轮次边界，普通事件同 AV 优先         | 使用带状态速度；其余决策复用                                          | 外部签名不变                                    |
| `engine.ts: stepSimulation()`                    | 时间推进、记录 beforeEffects、双窗口行动或单次触发              | Actor / 阿哈共享自然回合流程；Scheduled Event 保持独立触发分支        | 返回类型增加阿哈记录                            |
| `engine.ts: settleActor()` / `expireCountdown()` | 回合 Buff 递减、次数限制离队；倒计时到期移除效果                | Actor 专属规则不变；结算后派生速度自动读取新状态                      | 不向阿哈应用 modifier 生命周期                  |
| `engine.ts: previewOperationState()`             | 用同一执行器预览节点内前序操作；postAction 重建下一回合         | 共享 Actor / 阿哈自然回合推进，防止预览与执行分叉                     | 外部签名不变                                    |
| `operations.ts: applyOperations()`               | 每个操作独立候选状态，合法后提交；速度效果和倒计时一起提交      | Trace 传入状态速度；拒绝阿哈直接目标；逐操作 assertState              | 外部签名不变                                    |
| `operations.ts: spawnParticipant()`              | 普通动态单位及速度倒计时的统一创建入口                          | 提取小型队列字段构造器供自动阿哈创建复用                              | 保留现有创建操作定义，不开放 spawn aha          |
| `targeting.ts`                                   | 范围展开、组合资格、可选目标和执行时点目标                      | 显式拒绝 aha；allies / enemies 保持 camp 筛选                         | 四个函数外部签名不变                            |
| `validation.ts`                                  | 计划、操作、目录、ID 和锚点资格校验                             | 校验 aha 配置及 ID；识别自然行动源；静态拒绝阿哈直接目标              | 校验最新计划含 aha                              |
| `cycle.ts`                                       | MoC / AA 固定累计 AV 与下一边界                                 | 不需修改轮次公式或生命周期                                            | 保持原接口                                      |

`simulatePlan()` 的事件映射、预算循环、成功节点发布及不可达诊断可以直接复用；新增阿哈仍计入现有预算。普通行动同 AV 优先于 Cycle Boundary 的 `<=` 比较继续适用。

### 2.2 工具层与 UI 审计

| 子系统     | 现有入口                                                                | 下一轮最小调整                                                          |
| ---------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 战斗配置   | `model/battle-setup.ts`、`components/BattleSetup.vue`                   | 按角色 ID 解析欢愉身份，保留阿哈草稿，Apply 一次提交全部配置            |
| 文档提交   | `composables/useActionPlanner.ts` 的 emptyPlan、applySetup、replacePlan | 新计划补充 aha；Apply 接收 AhaConfig；继续唯一 PlannerDocument 所有权   |
| 文件边界   | `model/document-file.ts`                                                | 严格支持 Version 1 / 2 / 3，迁移身份及阿哈 ID，返回升级提示             |
| 自动保存   | `model/persistence.ts`、`composables/usePlannerSession.ts`              | 沿用 baseline、token、恢复后注册 watcher；传递迁移提示，不在启动回写    |
| 节点上下文 | `model/editor.ts` 的 contextAt、previewDraft                            | 继续通过引擎重放；不增加单独的阿哈速度或时间推进逻辑                    |
| 当前队列   | `model/current-queue.ts`                                                | 继续读取 initial Snapshot 或 record.beforeEffects；仅适配扩展的身份类型 |
| 行动展示   | `ActionNavigator.vue`、`model/naming.ts` 的 nodeCamp                    | 增加中立语义、黄色圆点及统一图标，复用 action 回合号和配置标记          |
| 节点详情   | `ActionInspector.vue` 的 currentSpeed                                   | effectiveSpeed 同时接收已有 context；放宽当前硬编码的参与者类型声明     |
| 名称与图像 | `usePlannerPresentation.ts`、`UnitPortrait.vue`                         | 阿哈名称由 Site Messages 生成，缺少真实资产时使用 Gauge                 |
| 目标编辑   | `TargetGrid.vue`、OperationEditor 及目标类型声明                        | 不开放可选阿哈目标；遗留不合法引用仍可移除，错误关联保持原流程          |
| 模板       | `templates/loader.ts` / catalog                                         | 共用文件迁移；生产目录继续为空，不自行生成配队                          |

不修改游戏快照、更新器、预设效果规则、Cycle Boundary 计算、AV 展示精度、存储 key 或浏览器验收政策。不新增第二份模拟配置、第二套上下文重放、阿哈技能执行器或额外回合系统。

## 3. 派生速度模型与欢愉身份

### 3.1 接口草案

以下是设计草案，不是本轮源码变更：

```ts
interface AhaConfig {
  id: string
  baseSpeed: number
  contributorIds: string[]
}

// SimulationPlan 增加必填 aha: AhaConfig。
// 即使没有贡献者，也保留 ID 和基础速度。

interface AhaState extends QueueState {
  kind: 'aha'
  name: string
  camp: 'neutral'
  baseSpeed: number
  contributorIds: string[]
  turns: number
}

type NaturalParticipantState = ActorState | AhaState
type ParticipantState = NaturalParticipantState | ScheduledEventState

function effectiveSpeed(participant: ParticipantState, state: SimulationState): number
```

保留 `ParticipantDefinition = ActorDefinition | ScheduledEventDefinition`，使 spawn 操作无法声明阿哈。`ParticipantInfo.kind` 改为运行时参与者种类；其可选 camp 能表达 neutral，但 `ActorDefinition.camp` 仍只允许 ally / enemy。阿哈不具有 panelSpeed、modifiers、actionLimit 或编队 position。QueueEntry 为阿哈提供空 modifiers 数组，以保持现有展示合同。

`effectiveSpeed()` 的 state 必填，包括普通 Actor 调用；不提供单参数阿哈回退。更新 engine 的 re-export、全部调用点和相应测试。可以在 `queue.ts` 内提取普通 Actor 速度与加权求和私有 helper，避免第二个公开业务速度入口，也避免新模块反向导入 queue 导致循环依赖。

BattleSetup 的公式预览可使用同一小型纯加权求和 helper，输入草稿 panelSpeed，不模拟 start 操作。该 helper 只做数学；模拟期间的权威入口始终是 `effectiveSpeed(participant, state)`。

### 3.2 身份来源与存储方案比较

实际链路为 `metadata.characterIds[actor.id] → CharacterRecord.id → form.pathCode === 'Elation' → actor.id → plan.aha.contributorIds`。角色查找与转换属于工具模型边界，引擎不读取 catalog、角色名称或 StarRailRes adapter。

本地 CharacterRecord 的 pathCode 类型为 string；快照中确实存在 Elation。观察到的 ID 为 1501、1502、1503、1505、1506、1513、8009、8010，其中 8009 / 8010 为欢愉开拓者的男女形态。这里记录的是本地快照事实，不代表联网核验过的当前版本角色名单。Manifest 标记 gameVersion 4.6.0，来源 StarRailRes commit `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`。

| 身份方案                                   | 重复与一致性                                         | 校验 / 迁移成本                                      | 判断                       |
| ------------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------- | -------------------------- |
| ActorConfig 保存 pathCode / isElation      | 与角色 metadata 重复；命途字段还会扩散到动态创建定义 | 增加普通 Actor Schema，仍需单独保存阿哈基础速度和 ID | 不选；引擎不需要完整命途   |
| SimulationPlan 单独保存欢愉 ID 集合        | 引擎保持纯净，但若又有阿哈对象，容易形成两份引用来源 | 同样需要引用和持久化校验                             | 可行，但不如收敛在阿哈对象 |
| aha 配置包含 baseSpeed、id、contributorIds | 只有一份引擎身份输入，Metadata 继续用于角色资源映射  | 新对象边界集中，能够保留隐藏配置                     | **推荐**                   |

新配置校验：id 合法且不与其他参与者或操作 ID 冲突；baseSpeed 有限且大于零；贡献者最多四个、唯一、全部引用初始我方 Actor。引擎只验证这些结构性事实，不验证游戏命途。初始自定义 Actor 没有静态身份时工具层不自动纳入；动态 Actor 始终不纳入。

### 3.3 公式与完整状态

有效速度为 `baseSpeed + Σ sortedSpeed[i] / [5, 10, 20, 40][i]`。从当前 state 的普通 Actor 中匹配 contributorIds，调用普通 Actor 有效速度公式，重新降序排序后计算。不可按初始 position 或 contributorIds 顺序固定权重。同速时内部身份顺序不改变数值，不需额外游戏排序机制。

贡献者使用完整 `state.participants`，不使用等待队列：当前 active Actor 仍贡献；已经达到 actionLimit 并被移除的 Actor 不再贡献。初始贡献者非空时创建的阿哈不会因模拟中贡献者归零而消失。初始贡献者为空则不创建阿哈，即使 start 后生成了自定义 Actor。

阿哈只依赖普通 Actor 自身的速度，不依赖其他派生参与者；禁止阿哈自身、Scheduled Event 或 spawn ID 成为初始贡献者。无需递归速度、依赖图或跨操作缓存。按需查找当前状态并排序最多四个贡献者，排序规模固定；实际成本包括参与者查找，不能把所有状态规模都称为常数。首版无需为此引入 Worker。

### 3.4 时间推进与 Buff 一致性

保持 `remainingAV = remainingAG / effectiveSpeed`，所有数学采用完整精度。`advanceTime()` 在修改 elapsedAV / remainingAG 前获取全部参与者速度，随后对同一区间统一扣减 AG。当前公式不读取 elapsedAV 或 remainingAG，因此现有循环本身不会因扣减 AG 改变公式；先读取再写入能明确保证区间速度的一致性。

自然节点顺序仍为：以推进前状态确定下一事件及 deltaAV → 用区间起点速度推进全体 → 标记 active → 保存 beforeEffects → preAction 操作 → 自然回合计数加一、AG 重置为 10000、解除 active → postAction 操作 → Actor 专属结算。到期与操作都作用于下一时间区间，不回算过去。

速度效果添加后仅改变 modifier 列表；每项操作在独立候选状态上校验，包括阿哈派生速度，成功才提交。回合 Buff 到期仍在 Actor postAction 后；倒计时到期仍在 Scheduled Event 操作前。两种到期均不重置阿哈 AG。阿哈自己的回合不递减贡献者 Buff。

原有 `assertState()` 在 Actor 离队前执行；共享结算后应补足对最终状态的检查，以覆盖贡献者移除后的派生速度。基础速度始终为正，离队贡献按零处理，不维护离队速度快照。

现有引擎没有独立速度 Buff 刷新 / 覆盖操作，按计划添加 modifier。本次不新增刷新规则。将来若增加刷新，只需修改普通 Actor modifier 状态，阿哈仍从统一速度入口读取最新状态。同节点多个操作保持逐项结算；不能将先产生非法速度、后恢复速度的操作合并为合法。

数学探针结果：

| baseSpeed | 贡献者有效速度     | 阿哈 SPD                                 |
| --------- | ------------------ | ---------------------------------------- |
| 80        | 无                 | 80（数学结果；无初始贡献者时不生成实体） |
| 80        | 180                | 116                                      |
| 80        | 180、136           | 129.6                                    |
| 80        | 200、180           | 138                                      |
| 80        | 180、180           | 134                                      |
| 80        | 200、180、160、140 | 149.5                                    |

129.6 SPD 推进 20 AV 后，阿哈 AG 为 `10000 - 20 × 129.6 = 7408`。随后变为 138 SPD，AG 仍为 7408；剩余 AV 从约 57.160493827160494 变为 53.68115942028985。错误地使用新速度重算过去区间会得到 7240 AG，必须通过测试排除。

## 4. Participant 模型比较

| 维度         | A：特殊普通 Actor                                      | B：独立 Aha Participant                                    | C：通用派生速度                          |
| ------------ | ------------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------- |
| 改动量       | 自然回合分支少，但需中立 Actor、特殊速度标记及多处例外 | types、queue、engine、targeting、validation 有明确类型适配 | 除相同功能接入，还新增速度来源协议及校验 |
| 生命周期复用 | 最大，但也继承不适用的 Buff / actionLimit 模型         | 共享自然回合推进，Actor 专属结算保持独立                   | 不自动解决自然回合与目标资格差异         |
| 类型安全     | 需区分 Actor 内部子类，容易生成不合法字段组合          | aha 没有 panelSpeed / modifiers，分支遗漏可被 TS 暴露      | 取决于联合类型设计，组合数量更多         |
| Targeting    | 现有 every actor 默认合法，必须加特殊排除              | 现有普通 Actor 白名单自然拒绝 aha，再补静态校验            | 仍需额外身份或能力约束                   |
| 运行时速度   | 同样需状态上下文和四项排序                             | 同样需状态上下文和四项排序                                 | 当前场景无性能收益；依赖解析更复杂       |
| 回归风险     | Actor 默认语义受到特殊身份影响                         | 主要风险是遗漏非 Actor 的一次性分支，可集中审计            | 改动横跨所有速度来源，影响面最大         |
| 测试维护     | 需测试普通 Actor 例外是否漏网                          | 明确测试自然行动、阿哈目标拒绝及实时速度                   | 还需通用来源组合、验证及序列化测试       |
| 持久化       | Actor 新字段加阿哈配置，影响初始与 spawn 定义          | 单个 aha 配置对象；运行时类型不进入 actors                 | 新增来源 Schema，迁移涉及更多字段        |
| 未来维护     | 特殊例外增多；若做严格子类，改动接近 B                 | 当前需求边界清楚，后续确认能力可单独开放                   | 只有多个已确认派生机制出现时才值得评估   |

**选择 B。**A 并非不可实现，但在保持类型安全和目标边界后，实际成本不再显著低于 B；C 也不能省去阿哈自然生命周期的处理，当前缺乏足够收益。B 只抽出已经被 Actor 与阿哈共同使用的回合推进，不建立通用响应式战斗系统。

## 5. 目标资格与生命周期

### 5.1 自然行动复用边界

提取小型 `isNaturalParticipant()` 类型守卫以及自然回合推进 helper，供 step 和 postAction preview 共用：turns 加一、remainingAG = 10000、清空 zeroBatch / zeroOrder、解除 active。不在 helper 中处理 Buff、离队或 completedNodes。

`settleActor()` 保留 modifier 到期和 actionLimit 逻辑。自然行动完成计数放到共享结算路径，确保 Actor 和阿哈各增加一次，避免 Actor 双计数。Scheduled Event 不增加 completedActions；Cycle Boundary 不执行自然回合结算。阿哈重复行动的回合由引擎维护，不在 UI 预生成无限节点。

`nextAnchor()` 对 Actor / 阿哈返回 action 锚点，Scheduled Event 返回 trigger；`validatePlan()` 的源类型匹配同步采用自然行动判断。现有 anchorKey 编码、事件查找和 turn 稳定性无需新增阿哈锚点格式。

阿哈初始 AG = 10000，没有自定义 initialAG、actionLimit 或独立加速优先级。它在全部初始 Actor 后分配 order，先于 start 操作创建的事件。普通零 AV 的 zeroBatch / zeroOrder 规则保持原样。与 Scheduled Event 无额外优先级；与轮次边界同 AV 时继续由普通事件先结算。

### 5.2 操作来源与目标

| 能力                                     | 首版支持 | 规则                                                 |
| ---------------------------------------- | -------- | ---------------------------------------------------- |
| 阿哈 action 节点标准操作                 | 是       | preAction / postAction，复用编辑、排序、名称与执行器 |
| 阿哈节点创建普通 Actor / Scheduled Event | 是       | 现有 spawn 能力；不使新 Actor 成为贡献者             |
| 欢愉角色速度效果间接影响阿哈             | 是       | 实时排序、AG 保留、无额外 Trace 伪造                 |
| 对阿哈提前 / 延后 / 立即行动             | 否       | 缺少已确认机制，明确拒绝                             |
| 对阿哈 flat / percent 速度修正           | 否       | 不提供 modifiers 或目标资格                          |
| 额外回合、终结技、欢愉技、笑点           | 否       | 本阶段范围外                                         |

`targetIds()` 的 allies / enemies 继续只包含普通对应阵营 Actor。`validTargetSelection()` 允许普通 Actor 组合及现有 gauge-only 单个 Scheduled Event，明确拒绝任何包含 aha 的集合；`selectableTargets()` 共用这一规则。

`operationTargets()` 输出实际执行状态中的可操作候选，排除阿哈，保留现有 active Actor 能接受速度效果等语义。`applyOperations()` 仍必须用 validTargetSelection 再检查真实目标，防止伪造 JSON 绕过选择器。`validatePlan()` 当前只对 Scheduled Event 特例做静态目标校验，应新增阿哈已知目标检查，不能仅依赖运行时警告。

参与者目录是定义及失效引用展示用途，并非当前队列。建议目录保留 aha 配置身份，即使当前没有贡献者，以便保留阿哈孤儿节点名称和拒绝已知非法目标；createInitialState 是否生成实体则只由初始 contributorIds 是否为空决定。目录里有阿哈定义不等于运行时存在阿哈。

## 6. UI 集成与配置边界

### 6.1 BattleSetup

保持四个我方槽位和最多五个初始敌人。在我方编队附近，草稿存在欢愉贡献者时显示紧凑阿哈区域：名称、黄色中立点、基础速度 InputNumber、只读初始派生速度。默认基础速度 80，要求有限且大于零，错误关联实际 input。开始操作的 Buff 尚未参与该数字，准确称为草稿编队的初始计算速度。

隐藏区域不清空草稿。基础速度和 ID 位于始终存在的 aha 配置中，无欢愉角色时 Apply 仍保存它们，仅提交空 contributorIds。重新加入欢愉角色沿用阿哈 ID 和基础速度。新建 / 文档替换重置为对应文档配置，不从另一个方案继承草稿。

基础速度草稿为空或非法时即使区域隐藏，也不能隐式丢弃配置后提交；Apply 校验失败时将相关输入区域显示出来供修复。角色速度无效时不显示虚构的计算结果。草稿编辑不重算已提交方案、不触发自动保存；Apply 原子提交双方编队、预算、轮次模式及 aha。

使用已有 PrimeVue InputNumber 和深色金色主题，黄点来自 event.500 Token。Gauge 作为统一图标，无需新的图片或大段解释。若展示贡献，只展示至多四个排序后的速度项，首版不要求额外复杂贡献面板。

### 6.2 身份变更与资源缺失

| 场景                               | Apply / 导入行为                                            |
| ---------------------------------- | ----------------------------------------------------------- |
| 欢愉换普通 / 普通换欢愉            | 新 Actor ID，重建贡献集合；自动出现 / 消失阿哈              |
| 编辑基础 / 面板速度                | 保留 Actor ID 和阿哈 ID；重算速度及排轴                     |
| 切换开拓者形态                     | 使用对应 Character ID 和新 Actor ID，按该形态 pathCode 识别 |
| Version 3 缺失角色资源或 metadata  | 保留已存 contributorIds；提示无法校验资源身份，不猜测命途   |
| Version 3 角色资源与已存身份不一致 | 导入保留引擎配置并提示；明确 Apply 时按已知角色重建         |
| Version 3 未变的角色仍无法识别     | Apply 保留其已存贡献资格；删除 / 替换时移除引用             |
| Version 1 / 2 无角色身份可识别     | 迁移不补造贡献者；提示无法确认阿哈身份                      |
| 动态自定义 Actor                   | 不纳入贡献，不扩展动态命途切换系统                          |

Version 3 的 contributorIds 是模拟输入快照，不能在每次解析、导出或游戏数据升级时悄悄重建。Metadata 名称 / 资源编辑仍不单独触发模拟；必要的身份更新通过显式战斗配置 Apply 同步提交 plan 与 metadata。

### 6.3 行动视图与 Inspector

未来行动沿用 NodeRecord：本地化名称、turn、elapsedAV、deltaAV、黄色中立点、配置标记。`nodeCamp()` 显式返回 neutral，增加对应消息和颜色映射，不能把中立身份落入 unknown 或 system。Inspector 和 Navigator 采用同一阿哈名称描述。

当前队列继续读取 start 结算后 Snapshot 或 record.beforeEffects。阿哈当前回合位于顶部；activeParticipantId 排除自身等待项，下一自然回合只在真实结算后的状态出现。不要为视觉展示改变引擎 Snapshot 的后结算语义。queueCursor 与 Inspector selection 保持独立；重算后队列锚点不可达则回 start，Inspector 保留修复入口。

Inspector 的 currentSpeed 使用 `effectiveSpeed(participant, context)`；缺 context 时不猜测速度。操作列表、双窗口、新建默认 postAction、编辑保留 ID、自定义名称及四个按钮直接复用。无需阿哈专用技能配置器。直接目标不会产生 action-change 图标，合法来源操作的 Trace 仍按真实目标锚点显示。

所有新增名称、升级提示、阵营 tooltip 和错误文案放入 zh-CN / en Site Messages。用户自定义名称不翻译，不持久化自动阿哈标题。人工验收检查中文 / 英文、1440 / 1024 / 390px、键盘、错误提示和图标即可，不新增浏览器自动化或 UI 快照。

## 7. 持久化、迁移与稳定身份

### 7.1 Version 3 草案

文件 format 仍为 `hsr-game-tools/action-planner`；document 的 name、plan、metadata 结构保留。仅 plan 增加必填 aha 对象，导出 version 为 3。例如：

```json
{
  "aha": {
    "id": "aha-instant",
    "baseSpeed": 80,
    "contributorIds": ["ally-a", "ally-b"]
  }
}
```

此示例是 plan 新字段片段，不是可单独导入的完整文件。actors 仍只存初始普通 Actor；不把阿哈添加为第十个初始单位。旧 actors 数量 / camp-local position 限制保持原样。

只保存 id、baseSpeed 和 contributorIds。不保存当前有效速度、remainingAG、回合状态、派生 AV、QueueSnapshot、SimulationResult、ActionChangeTrace 或迁移提示。草稿、导航、资源诊断也不进入持久化 Schema。

### 7.2 严格迁移流程

推荐升级 Version 3，因为新字段不仅展示数据，还改变模拟行为。继续使用 document-file.ts 统一边界，禁止放宽旧版本字段白名单来兼容新字段。

1. 按输入版本验证字段、深度、大小、列表、字符串、身份和 Metadata 结构。Version 1 不接受 cycleMode / aha；Version 2 必须有 cycleMode、不得接受 aha；Version 3 必须有两者。
2. 原 Version 1 补 cycleMode: none。原 Version 1 / 2 仅在工具层用当前本地角色快照识别初始我方贡献者，补充 baseSpeed 80 和新阿哈 ID。
3. 将转换后的独立文档树交给最新 validatePlan、资源清理及文件体积检查。不得用新 validatePlan 直接拒绝尚未补齐 aha 的合法旧树，也不得在验证旧格式前移除未知字段。
4. 返回最新文档、资源问题和独立迁移通知。prepare / import / template / local restore 路径都需传递该通知，重新验证 Version 3 时不能丢失原迁移提示。
5. 校验和准备完整成功后才替换当前文档。运行时 missing-target / unreached-anchor 仍作为既有可修复诊断保留，不把它们混为文件结构损坏。

用户已选择自动加入阿哈。旧方案的角色 ID、操作 ID、名称、action / turn 锚点与 cycle ordinal 都保留。阿哈新增节点会改变行动顺序，并消耗 maxNodes，部分原操作可能变为不可达；不可达配置不删除、不重绑，不自动增加预算。提示说明方案已经按新机制重算，并提示检查不可达操作。

另一种保留旧排轴策略需兼容开关或手动迁移状态，带来持续双模式维护，并与自动出现机制冲突，因此不采用。没有欢愉贡献者的旧方案数值行为保持基线；无法识别身份时发出资源提示，而非推测名称或硬编码名单。

### 7.3 阿哈 ID 与隐藏配置

新空文档可使用 `aha-instant`。迁移时按 `aha-instant`、`aha-instant:2`、`aha-instant:3` 依次选择未占用 ID；占用集合包含普通参与者、operation ID、spawn / countdown 派生 ID、原锚点和显式目标引用。这样不会把旧的失效引用误绑定到新阿哈。无需修改原来的角色 ID 来腾出名称。

分配后始终保存 ID，编辑基础速度或替换队伍不重新分配。contributorIds 为空时保留阿哈事件及自定义操作名，沿用现有 unreached-anchor 修复方式；本次不增加独立停用模拟模式。再次加入欢愉角色后恢复同一阿哈 action / turn 身份，按新时间轴判断可达性。

referencedIds 与 editor nextId 预留逻辑纳入隐藏 aha ID；validatePlan / 文件边界检查它与其他声明的身份冲突。即使暂不生成运行时实体，也不能允许动态创建定义占用这个身份。

### 7.4 自动保存与模板

localStorage key 继续为 `hsr-game-tools/action-planner/current`。恢复前不注册提交 watcher，迁移读取不马上覆盖原存档；首次真实文档提交保存 Version 3。baseline 继续比较原始存储文本，外部修改、坏存档、未知版本、配额失败和显式 overwrite token 规则不变。

导入文件在候选文档完成严格校验与准备前不替换当前文档，不触发保存。导出及 teardown 不回写存储。当前非空 / 未应用草稿替换保护继续适用，阿哈隐藏基础速度的自定义值也应纳入非默认配置判断。

旧模板共用 Version 1 / 2 迁移入口；新模板采用 Version 3 普通导出文件，生产 catalog 仍保持空目录，等待审阅内容。不得增加模板专用身份推断或自动造配队。

## 8. 测试策略与证据等级

### 8.1 本轮实际运行

调查阶段在未修改的 HEAD `237dce544b19b65ddc7383bb6f63d011caa6561d` 上，使用 Node 24.19.0 执行：

```sh
npm test -- tests/unit/migration-baselines.test.ts tests/unit/action-planner.test.ts tests/unit/action-planner-cycles.test.ts tests/unit/action-planner-participants.test.ts tests/unit/planner-document-file.test.ts tests/unit/planner-persistence.test.ts
```

结果为 **6 个测试文件、67 项全部通过**，包含 11 组历史迁移基准。另以 Node 内存计算运行第 3 节公式及 AG 探针，没有将探针加入正式功能源码。

这些结果证明现有基线和数学示例，不证明尚未实现的阿哈生命周期、UI 或 Version 3 迁移。本轮没有新增功能测试，也没有重新执行完整应用构建或浏览器验收。

### 8.2 下一轮高价值确定性测试

| 测试组       | 场景与关键断言                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| 公式参数化   | 零 / 一 / 二 / 四名、同速、未舍入小数；零名不生成实体，其余正确加权                                      |
| 实时变化     | B 从 136 加到 200 超过 A=180，129.6 → 138；回合和 countdown 到期后恢复排名                               |
| 时间推进     | 全体使用同一旧速度区间；变速保持阿哈 AG=7408，只改变 AV；不额外增加 elapsedAV                            |
| 完整状态     | 正在行动的欢愉 Actor 仍贡献；actionLimit 离队后停止；阿哈最终可按基础速度继续                            |
| 操作原子性   | 同节点逐项变速和倒计时创建；非法中间速度不能被后一效果掩盖；输入状态和失败节点不泄漏变更                 |
| 自然生命周期 | 阿哈重复 action / turn，AG 正常重置；不作为 trigger 离队；completedActions / completedNodes 各正确增加   |
| 节点操作     | 阿哈 pre / post 标准操作、同节点前序创建、post preview 与实际执行一致，失败节点 contextAt 通过原引擎恢复 |
| 排序与预算   | 同 AV 的 Actor、阿哈、Scheduled Event 按既有 order；Cycle Boundary 最后；maxAV / maxNodes 正确停止       |
| 目标边界     | 四种直接操作、混合目标、伪造 JSON 均不能作用阿哈；allies / enemies 不包含阿哈；动态 Actor 不贡献         |
| 配置         | 替换角色、速度编辑、开拓者形态切换、隐藏再显示保留基础速度 / ID；未 Apply 不改提交文档                   |
| 文件         | Version 1 / 2 含欢愉自动迁移；Version 3 自定义基础速度往返；身份缺失 / 不匹配不静默重建                  |
| 身份与存档   | 旧锚点 / target ID 碰撞避免误绑定；原 Actor / operation ID 保留；坏导入与外部存储冲突不覆盖              |
| 当前队列     | 阿哈 active 置顶而下一回合不提前出现；按 beforeEffects 显示其他单位；游标不可达回 start                  |
| 历史基线     | 11 组原数值、顺序、Trace 与诊断期望不变；测试输入仅补空贡献者配置                                        |

使用现有 Vitest Node 环境，合并相关断言，不建立大量 UI 快照、CSS 断言或逐文案测试。保留 foundation 的纯引擎依赖隔离验证，继续单独验证立即行动 Trace 的加法兼容语义。

下一轮源码实施后运行 type-check、相关测试及完整 npm test、lint、format:check、validate:i18n、validate:planner-templates 和 build。浏览器由用户本地人工验收：配置 Apply、排序变化、阿哈重复行动、目标不可选、旧方案升级提示、刷新恢复及中英文 / 窄屏布局。

## 9. 下一轮实施步骤与风险

1. **类型与速度。**增加 aha 配置、AhaState 和自然行动类型；保留普通创建定义；统一 effectiveSpeed 状态参数与全区间速度读取。先完成公式、AG 保持和现有 11 基准验证。
2. **调度与目标。**接入初始化、action 锚点、自然回合共享 helper、clone、目录、assert、静态和运行时目标资格；更新 preview 与失败重放。验证重复行动、到期、active 贡献、同 AV 与预算。
3. **文件与身份。**工具层增加角色到贡献者转换；Version 3 严格迁移和碰撞安全 ID；补齐隐藏配置、迁移通知、资源不匹配及存储 / 模板链路。先验证旧 JSON 和不覆盖保护。
4. **UI。**Apply 加入 aha 配置，条件区域、基础速度和只读初始速度；扩展中立展示、名称、图标和 Inspector 类型。保留原操作编辑与当前队列投影。
5. **验收与停止。**完成静态工程检查，记录自动验证与用户待验项；交付简洁人工清单，不进入额外回合、技能、跨波次或部署。

主要风险及控制：

- 漏掉非 Actor 被视为一次性事件的分支：通过自然类型守卫、nextAnchor、step、preview 和源锚点校验共同覆盖。
- 阿哈读取等待队列导致 active 角色贡献消失：公式只读取完整 state，增加 active 场景测试。
- 将新速度用于已经过去的时间：advanceTime 全体起点速度快照，明确到期在时间推进之后。
- 新身份被所有 Actor 默认目标资格放行：独立 kind、静态校验、运行时校验与 UI 共用资格四层覆盖。
- Version 3 解析时重建身份造成不可重放：新文件贡献配置作为权威输入，只有显式 Apply 重建已知角色。
- 新阿哈 ID 恰好占用旧孤儿引用：迁移扫描引用闭包，不修改旧身份，也不按数组位置重绑。

## 10. 开放问题与最终状态

**首版支持范围不存在需要再次决策的阻塞问题。**旧方案自动升级、actionLimit 离队贡献处理和实时排序均已有用户确认。

后续开放直接目标支持时，需要新的机制证据：阿哈能否受到普通提前、延后或立即行动；是否可接受 flat / percent 速度效果；百分比使用阿哈基础速度还是派生速度，以及持续时间如何结算。本轮没有联网或检索技能描述，不能将这些未知规则当作已确认机制。额外回合不影响自然 AG / AV 的前提已确认，但其执行系统仍明确不在首版范围。

### 仓库审计

| 仓库              | 分支    | 调查开始 / 报告交付时 HEAD                 | 工作区变化                 |
| ----------------- | ------- | ------------------------------------------ | -------------------------- |
| HSR-Game-Tools    | main    | `237dce544b19b65ddc7383bb6f63d011caa6561d` | 本报告为唯一新增文件       |
| HSR-Database      | develop | `0898487b3b048d9bd6af9d734208590deb38737a` | 无变化，未使用旧站运行管线 |
| TurnBasedGameData | main    | `312b4597691e0a29cf9828a15b592757dba86949` | 无变化                     |
| StarRailRes       | master  | `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487` | 无变化                     |

现行工具源码和本地快照为本轮直接证据；Phase 1A 的历史旧引擎 oracle commit 为 `72c2d4d1b9ccc0fc0bb191d16ac29492750ea1b0`，不能与当前 HSR-Database HEAD 混为一谈。源仓库没有被格式化、切换、清理、暂存或更新。

本报告完成 Phase 2C-0 调查交付。上述功能设计尚未实施；下一轮需在明确功能开发范围后执行第 9 节步骤。
