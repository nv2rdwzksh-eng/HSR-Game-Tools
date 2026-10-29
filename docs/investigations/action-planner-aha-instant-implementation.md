# Phase 2C-1：阿哈时刻功能实施报告

日期：2026-10-14，Asia/Shanghai。实施基于本地 HSR-Game-Tools `main`，开始与完成时 HEAD 均为 `237dce544b19b65ddc7383bb6f63d011caa6561d`，没有提交、推送或部署。

**阿哈时刻已接入纯引擎、战斗配置、未来行动、当前队列、Inspector、速度目标选择以及 Version 3 持久化。阿哈自身速度 Buff 已实现，包含固定值、基于自身基础速度的百分比、有限／无限回合和标准倒计时。**代码及静态工程验证完成；真实浏览器交互和视觉仍由用户人工验收，本轮没有执行浏览器自动化。

## 1. 最终模型与调查草案差异

`SimulationPlan.aha` 为必填配置，始终保留，即使当前不生成运行时阿哈：

```ts
interface AhaConfig {
  id: string
  baseSpeed: number
  contributorIds: string[]
}
```

`AhaState` 为独立 `kind: 'aha'`，包含中立阵营、name、可选 iconUrl、baseSpeed、contributorIds、turns、modifiers 及共用 QueueState 字段。没有 panelSpeed、position、category、actionLimit 或静态角色 ID。可选 iconUrl 仅用于兼容共享记录身份，本轮不加载阿哈图片。

`NaturalParticipantState = ActorState | AhaState`；ParticipantState 再联合 ScheduledEventState。新增 `isNaturalParticipant()`，共享行为使用明确类型守卫，普通 Actor 的 camp 仍限定 ally / enemy。ParticipantInfo 的 kind 来自运行时类型，camp 可以表示 neutral。

与 [Phase 2C-0 调查报告](action-planner-aha-instant-architecture.md) 的主要差异：

- 调查建议不允许直接速度修正；本轮依据实施文档和用户授权开放 `addSpeedModifier`，因此 AhaState 具有自己的 modifiers，QueueSnapshot 也复制这些效果。
- 回合速度效果及 countdown 到期从 Actor 扩展为所有自然参与者；actionLimit 离队仍专属于普通 Actor。
- 中立目标在标准速度表单中可选，支持与 Actor 显式混选；不修改 allies / enemies 的范围含义。

调查报告作为历史证据保留，本报告和 Phase 2C-1 规则代表最终已实施行为。通用 `ParticipantDefinition` 和 spawn 表单仍只允许 Actor / Scheduled Event，不能创建第二个阿哈。

## 2. 统一速度、独立 Modifier 与 AG/AV

统一公开业务入口为 `effectiveSpeed(participant, state)`，全部引擎调用、Inspector 和测试已适配必填状态参数。

- 普通 Actor 使用原 panelSpeed + Modifier reduce 公式，百分比基于该 Actor baseSpeed，保持原数值运算顺序。
- Scheduled Event 使用固定 speed。
- 阿哈从完整 state.participants 中查找 contributorIds 对应的普通 Actor，读取其有效速度并重新降序排列；正在行动的 Actor 仍贡献，离队 Actor 不再贡献。
- 阿哈速度为 `baseSpeed + elationContribution + modifierSpeed`，自身百分比每项为 `baseSpeed × amount / 100`。欢愉贡献不创建 Modifier，也不保存为 panelSpeed。

私有 actorSpeed、modifierSpeed、checkedSpeed 复用普通数学及校验；elationContribution 是模拟与草稿预览共享的纯加权公式，不是第二套运行时速度解析入口。没有递归属性图、全局速度缓存、Vue 依赖或引擎内游戏数据读取。

数学测试实际验证：

| 状态                           | 阿哈 SPD |
| ------------------------------ | -------: |
| A=180、B=136，阿哈基础速度 80  |    129.6 |
| 添加自身 +25 flat              |    154.6 |
| 再添加自身 +20%                |    170.6 |
| B 加到 200，两个自身效果仍存在 |      179 |

+20% 使用基础速度 80，增加 16 SPD，未对欢愉贡献或 +25 flat 再次加成。更改基础速度也有定向断言；一人、四人、同速和排名恢复均覆盖。

`advanceTime()` 先计算区间起点的全部速度，再统一扣减 AG。129.6 SPD 推进 20 AV 后剩余 AG 为 7408，变速到 138 时仍为 7408，剩余 AV 改为 `7408 / 138`，elapsedAV 保持 20。没有重置当前回合或回算过去的区间。

每个操作继续在克隆候选状态上执行并调用 assertState；效果和关联倒计时一起提交。非正或非有限有效速度不能提交，也不能被同节点后续恢复操作掩盖。到期及贡献者离队后的最终状态再次校验，非法结果不发布部分节点。测试覆盖了失去最后贡献后减速使阿哈无效的离队失败场景。

## 3. 自动创建、自然行动与效果到期

初始 Actor 按既有阵营 / position / ID 规则创建后，初始 contributorIds 非空才自动创建阿哈，再执行战斗开始操作。阿哈初始 AG=10000、turns=0；order 位于初始 Actor 后、开始操作创建的参与者前。隐藏的阿哈 ID 仍预留，避免其他创建占用该身份。

阿哈使用原 action / turn Anchor，自然行动可重复。`finishNaturalTurn()` 为正式执行和 postAction 预览共用：增加 turns、AG 重置为 10000、清除零 AV 优先级、解除 active。`settleNaturalParticipant()` 复用回合 Modifier 到期处理，只有 Actor 检查 actionLimit。completedActions 与 completedNodes 各按真实自然节点计数一次。

保留现有 oldModifiers 语义：节点开始记录已有 Modifier ID，整个 postAction 窗口结束后只递减这些已有回合效果。当前 preAction 或 postAction 才添加的持续 1 回合效果不会立即扣除。Snapshot 与下一次队列排序发生在结算、到期和校验完成之后。阿哈行动不递减贡献者 Buff，也不改写它们的速度状态。

倒计时速度效果复用标准 Scheduled Event / countdown ID；同一速度操作可为 Actor 和阿哈共享倒计时。触发时先移除关联效果、检查状态，再执行事件操作。剩余 AG 不因到期重置。

贡献者达到 actionLimit 离队后停止贡献；已经生成的阿哈仍保留，以基础速度和自己的效果继续行动。初始没有贡献者时不会因后来 spawn 普通单位而出现阿哈。

同 AV 仍按既有 order / zeroBatch / zeroOrder 规则，不设置阿哈专用优先级。阿哈与 Scheduled Event 沿用参与者规则；MoC / AA 边界同 AV 最后执行。现有预览、contextAt 失败重放和预算路径共同使用同一引擎。

## 4. 目标资格、操作元数据与 Trace

| 目标操作                | 阿哈资格                 |
| ----------------------- | ------------------------ |
| 固定值速度效果          | 允许                     |
| 百分比速度效果          | 允许，基于阿哈 baseSpeed |
| 提前 / 延后 / 立即行动  | 禁止                     |
| 我方 / 敌方全体隐式选择 | 不包含阿哈               |

显式速度集合支持普通 Actor、阿哈及混合目标；Scheduled Event 不能进入速度集合。targetIds、validTargetSelection、selectableTargets、operationTargets、applyOperations 和静态 validatePlan 规则一致，伪造 Version 3 的三类阿哈行动操作在文件边界也被拒绝。

阿哈处于 active 状态时仍可接受速度效果，这与普通 Actor 的速度效果窗口一致。它作为来源的 action 节点支持已有标准操作、双窗口、顺序与自定义名称。

无运行时阿哈时，已配置速度操作保持原 ID 与目标引用，通过 missing-target 或 unreached-anchor 诊断，不删除或改绑。重新加入欢愉角色后沿用同一阿哈 ID。

速度效果沿用现有 Metadata 显示 flat / percent、数值、回合数、无限持续和倒计时。加速只改变 SPD / AV，不生成 advance / delay / immediatelyAct Trace，也不添加拉条箭头。

## 5. BattleSetup 与三处展示

工具层 `resolveElationContributors()` 根据 Metadata 中的 Character ID 查本地规范化快照，并检查 form.pathCode === Elation；未通过名称或角色 ID 白名单判断。只考虑初始我方 Actor，引擎仅校验最多四个唯一、合法初始我方引用。

BattleSetup 草稿有贡献者时显示中立黄色点、Gauge、基础速度 InputNumber 和只读初始速度。基础速度默认 80，可编辑；预览只读取草稿面板速度，并明确不包含开始操作 Buff。无效速度显示反馈，不计算虚构数值。

阿哈随编队、预算、轮次和角色 Metadata 一次 Apply、一轮模拟。移除最后贡献者隐藏区域但不清空 ID、基础速度、节点操作或自定义名称。若隐藏基础速度非法，Apply 使输入重新可见供修复。替换角色创建新 Actor ID，速度编辑保留 ID。操作编辑重建 Metadata 引用不会触发 BattleSetup 草稿重载；原有未应用配置语义保留。

Version 3 已保存的贡献者是模拟事实：资源缺失时保留，已知身份不匹配时提示；明确 Apply 根据已知角色重建，未变且无法识别的 Actor 保留旧资格，删除 / 替换则自然失去旧引用。

- Navigator：阿哈为普通自然行动卡，显示回合号、累计 / 推进 AV、配置标记、黄色 neutral 语义和 Gauge。
- 当前队列：继续投影 initial Snapshot / record.beforeEffects；active 阿哈置顶为 0 AV，等待项不提前出现下一回合。队列游标与 Inspector 选择仍独立。
- Inspector：读取带 context 的统一速度入口，复用双窗口编辑、四个按钮、顺序和名称；不可达阿哈节点也使用稳定配置身份显示 Gauge。
- TargetGrid / OperationTargets：增加中立分组和统一头像，速度表单可明确选择阿哈或混选；行动操作禁选，已选条目可解除。

新增文案全部位于 zh-CN / en Site Messages，名称与中立身份在语言切换时更新，不重算引擎，不保存自动标题或翻译用户名称。颜色使用现有黄色 Token；未新增游戏图片、主题系统或技能配置器。

## 6. Version 3、迁移、存档与模板

format 仍为 hsr-game-tools/action-planner，localStorage key 仍为 hsr-game-tools/action-planner/current。Version 3 的 plan.aha 始终存在；actors 仍只保存普通初始单位，不让阿哈占用九个槽位限制。

Version 1 / 2 按自己的字段白名单严格解析；旧版本不得携带 aha，Version 1 不接受 cycleMode，Version 3 必须有两者。Version 1 补 cycleMode: none，两种旧版本都根据可靠 Metadata 检测贡献者，补基础速度 80 和不会碰撞的 ID，再通过新计划校验。

分配 ID 从 aha-instant 开始，必要时递增 :2、:3 等后缀。扫描初始身份、操作、派生 spawn / countdown ID、显式目标和孤儿 Anchor，避免旧失效引用被新阿哈误绑定。旧角色、操作、Anchor、阶段、名称与轮次 ordinal 保留。

可识别的旧欢愉方案自动生成阿哈，不增加永久兼容模式。新增节点可能改变顺序和节点预算内可达性；迁移提示说明这一点，原不可达操作继续保留。身份无法识别时不猜测，返回资源提示。Version 3 只校验和提示身份差异，不依据当前快照重写保存的 contributorIds。

迁移通知为独立运行时结果，贯穿 parse、prepare、导入、模板、本地恢复和方案管理显示，不写入文档。prepare 重新校验 Version 3 时仍传递原迁移通知，防止丢失升级提示。

初始化先恢复再注册浅提交 watcher。迁移不立即回写旧存储，首次真实提交保存 Version 3；导入失败、坏存档、未知版本、外部修改及写入失败保护均保留，覆盖仍检查最新 storage token。导出和退出不写存储。自定义隐藏基础速度纳入方案替换保护。

只保存配置与标准 PlanEvent 操作；运行时 SPD、AG、AV、Modifier 实例、Snapshot、Trace、Result、草稿和通知均不持久化。模板共用同一严格迁移边界，当前生产目录仍为 0 份，未新增配队。

## 7. 实际验证与技术债清理

验证环境为本地 Node 24.19.0、项目现有 npm 依赖，未安装新依赖，未联网运行更新器。

| 检查                               | 结果                                      |
| ---------------------------------- | ----------------------------------------- |
| npm run type-check                 | 通过，覆盖 Vue、引擎、scripts 和 tests    |
| 阿哈定向测试及 npm test            | 20 个文件、202 项全部通过                 |
| 11 组历史迁移基准                  | 全部通过，原期望 JSON 未重生成或修改      |
| npm run lint                       | 通过                                      |
| npm run format:check               | 通过                                      |
| npm run validate:i18n              | 双语结构、Key、参数与语法通过             |
| npm run validate:planner-templates | 0 份正式模板通过                          |
| npm run validate:game-data         | 98 角色、3 预设、101 资产；缺失和诊断为 0 |
| npm run build                      | Vite 构建通过                             |
| git diff --check                   | 通过                                      |

新增两个阿哈测试文件，共 40 个参数展开后的测试，覆盖公式、独立修正、AG、完整状态、两种到期、刚添加效果、重复行动、失败原子性、贡献者离队、混合目标、两种轮次并列、当前队列、预览、失败重放、Version 1 / 2 / 3、碰撞、资源差异、Apply、存储及名称。已有机制测试仅适配必要配置、状态参数和文件版本变化；保留普通 Actor 的数学与生命周期期望。

本轮清理了 Actor-only 自然行动分支、重复的正式 / 预览回合推进、Actor-only countdown 清除、单参数速度调用及过时的文件版本测试。普通创建定义保持明确边界，没有保留两套阿哈速度入口。AGENTS.md、README、设计说明和模板维护说明已同步。

package.json、package-lock.json、游戏快照、图片、历史数学期望和调查报告未改写。只修改 HSR-Game-Tools。三个来源仓库前后分支、HEAD 和工作区均不变：

| 仓库              | 分支    | HEAD                                     |
| ----------------- | ------- | ---------------------------------------- |
| HSR-Database      | develop | 0898487b3b048d9bd6af9d734208590deb38737a |
| TurnBasedGameData | main    | 312b4597691e0a29cf9828a15b592757dba86949 |
| StarRailRes       | master  | dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487 |

## 8. 已知限制与用户人工验收

“持续到阿哈时刻结束”暂按一个阿哈自然回合处理，遵守 oldModifiers 规则；这是明确模拟简化。没有实现额外阿哈时刻、爻光终结技、欢愉技、笑点、伤害 / 能量、砂金·戏浪自动触发或专用 Buff 清除事件。阿哈仍不能被直接提前 / 延后 / 立即行动。动态命途、跨波次、真实敌人目录和新配队模板未增加。

本轮自动验证不等于真实 UI 验收。建议在本地浏览器完成：

1. 选择欢愉角色并设置面板速度，检查自动阿哈区域、基础速度编辑和只读预览；未 Apply 不改变排轴。移除再加入后检查隐藏配置及原阿哈操作恢复。
2. 配置 A=180、B=136、阿哈基础 80；在开始节点依次添加阿哈 +25 flat、+20%，检查速度 170.6。再使 B +64，检查 179；确认百分比不是对总速度计算。
3. 阿哈分别设置持续 1 回合、无限和 countdown；检查已有 Buff 在自身自然回合结束到期，新加 Buff 不立即扣减，普通角色 Buff 不因阿哈行动扣减。
4. 两种行动视图检查阿哈重复回合、当前置顶、不提前出现下一回合、黄色中立点与 Gauge；加速不出现拉条箭头。Inspector 的增删改、顺序、窗口和自定义名称正常。
5. 速度选择器检查阿哈及混选，行动操作不能选阿哈，全体我方 / 敌方不包含它。开启 MoC / AA 后检查同 AV 边界最后执行。
6. 导入实际旧 Version 1 / 2 欢愉方案，检查升级提示、原操作身份和不可达诊断；导出 Version 3、刷新恢复，检查基础速度、贡献者与自身速度操作。无效导入不替换现有方案。
7. 中文 / English 以及 1440 / 1024 / 390px 检查布局、目标头像、工具按钮、键盘与错误输入关联。隐藏基础速度非法时 Apply 应提供可修复输入。

完成于 Phase 2C-1，不自行进入下一阶段或发布。
