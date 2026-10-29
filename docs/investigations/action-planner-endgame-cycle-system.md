# Phase 2B：Endgame 轮次系统实现报告

日期：2026-10-13。实施范围仅 HSR-Game-Tools。已完成代码接入、确定性单元测试和静态工程验证；浏览器视觉与真实交互未执行，等待用户本地人工验收。没有提交、推送、部署、联网、修改域名或启动后续功能。

## 1. 最终数据模型与职责

`SimulationPlan.cycleMode` 为必填的 `'none' | 'moc' | 'aa'`，新建方案默认关闭。模式属于模拟输入，不属于 Metadata 或独立 Store；已提交文档仍由 `useActionPlanner` 唯一持有。

Anchor 分为普通 `ParticipantAnchor`（action / trigger）和 `CycleAnchor`（cycleBoundary / ordinal），二者合成 `NodeAnchor`，再与 start 合成 `EventAnchor`。第一个边界的 ordinal 为 1，稳定键为 `cycleBoundary:1`，不依赖数组下标、Participant ID、绝对 AV 或展示名称。MoC 切换为 AA 后同一 ordinal 的操作保持原身份。

`NodeRecord` 是以 kind 区分的联合类型：

- `ParticipantNodeRecord` 保留原 Actor / Scheduled Event 的身份、名称、阵营、速度、Anchor、AV、前置状态及 Trace 字段语义。
- `CycleNodeRecord` 只有 kind、CycleAnchor、elapsedAV、deltaAV、beforeEffects 和空 actionChanges；没有 ID、名称、SPD、AG 或阵营。系统标题在 Presentation 中通过 Site Messages 生成。

轮次不加入 `ParticipantDefinition`、`ParticipantState`、参与者目录或普通队列。Actor 仍通过自然行动与回合生命周期结算；Scheduled Event 仍通过速度／AG 触发并单次离队；轮次通过固定累计 AV 触发和序号递增，不执行普通参与者的结算逻辑。

启用时 `SimulationState.cycle` 保存 mode、nextOrdinal、maxAV，并由 `cloneState()` 独立复制；关闭时不创建此字段。`QueueSnapshot.queue` 仍只保存普通参与者，额外的可选 `nextCycleBoundary` 提供一个系统倒计时描述，不预生成大量未来对象。

`ActionChangeTrace.sourceAnchor` 支持轮次；targetAnchor 和普通 QueueEntry.anchor 继续限定为 ParticipantAnchor。轮次不会拥有受影响目标 Trace，其配置标记与普通节点一样独立显示。

## 2. 边界、调度与停止条件

规则集中于纯 TypeScript `cycle.ts`，引擎不引入 Vue、翻译或原始游戏数据：

| 模式 | 第 0 轮长度 | 后续轮长 | 前三个边界       |
| ---- | ----------- | -------- | ---------------- |
| none | —           | —        | 不生成           |
| moc  | 150 AV      | 100 AV   | 150、250、350 AV |
| aa   | 300 AV      | 100 AV   | 300、400、500 AV |

第 n 个边界为 `firstCycleAV + subsequentCycleAV * (n - 1)`。只计算下一序号，maxAV 外的边界不生成。

新增 `nextSimulationEvent()`，供模拟、step 和失败节点重放共同使用。它取得现有 orderedParticipants 的首项，将其完整精度剩余 AV 与下一边界剩余 AV 比较；普通事件在 `<=` 时优先。每个成功节点后重新检查，不对最初同 AV 名单做一次性排序，也不改变 Actor 与 Scheduled Event 之间原有优先级。

因此 A 在 150 AV 行动并立即拉 B，B 再提前 C 时，A、B、C 及其他仍在 150 AV 待行动的参与者全部先结算，最后才进入第 1 轮边界。若边界自己的操作拉 A，则边界完成后 A 才行动；来源 Trace 保留 cycleBoundary Anchor。

轮次 step 克隆输入，调用原 `advanceTime()`，采集 beforeEffects，调用普通 `applyOperations()` 按配置顺序执行，再递增 nextOrdinal 和 completedNodes。它不设置 activeParticipantId，不调用 settleActor 或 expireCountdown，不重置 AG，不递减回合 Buff，也不增加 completedActions。失败不会发布该节点的 Record 或部分结算后的 Snapshot，诊断保留轮次 Anchor 和 operation ID。

排序不用 UI 两位小数，不新增 epsilon；继续沿用原 AG 扣减与机器精度残差归零规则。速度操作保留目标当前 AG；动态 Actor、Scheduled Event 和共享速度倒计时走原创建入口及初始行动公式。

轮次计入 maxNodes，边界恰好等于 maxAV 可以执行，超出则不执行。普通队列耗尽后只允许处理已经到期的边界；该边界若创建新单位则继续，否则停止，不推进到未来空边界。若最后一个单位在边界时刻离队但 maxNodes 已耗尽，未执行的到期边界仍使停止原因为 nodes；关闭模式保留原来的 empty 语义。连续零 AV 行动可能消耗全部预算而使边界未执行，这符合有限节点推演约束。

## 3. 操作、目标与上下文

`validAnchor()` 验证 ordinal 是正安全整数；`anchorKey()`、validatePlan、引用 ID 保留及名称展示不再把所有非 start Anchor 当作含 participantId 的节点。

轮次与战斗开始／事件触发一样只有一个窗口。validateOperations 拒绝轮次操作携带 phase；新增、编辑、排序、预览和创建操作复用既有单窗口路径，不新增操作类型。支持提前、延后、立即行动、速度效果、创建 Actor、创建 Scheduled Event 和现有合法装备预设；翁瓦克仍只适用于战斗开始。

系统类型没有参与者身份，不能成为任何目标。operationTargets、我方／敌方集合与单体选择仍只读取参与者；validTargetSelection 明确要求非 Actor 的单目标提前／延后对象必须是 scheduledEvent，不能让未知种类混入。伪造不存在的参与者 ID 仍沿用 missing-target 诊断，不转化为轮次目标。

contextAt 优先读取 Record.beforeEffects；失败节点则通过统一 step 重放成功前缀，使用 nextSimulationEvent 定位下一节点，再取得空操作 step 的前置状态。没有在 UI 写第二套时间推进或用最终目录替代执行上下文。previewOperationState 已有非 action 单窗口逻辑直接兼容轮次，能够看到同节点前序创建的单位，并保留现有操作原子性。

## 4. BattleSetup、Navigator 与 Inspector

BattleSetup 在推演范围附近新增紧凑 PrimeVue SelectButton，关闭／MoC／AA 三选一，allowEmpty=false。静态检查当前安装的 PrimeVue 4.5.5 源码确认已选项不会再次点击后变为空值；控件使用已有主题、标签及键盘可操作按钮，窄屏允许换行。简短时长说明读取同一份规则常量。

模式修改只写本地草稿并标记未应用。Apply 将双方编队、预算与 cycleMode 一起校验提交，随后重算、自动保存并进入规划。阶段切换保留配置草稿，刷新只恢复已提交文档。新建恢复 none；文档替换保护也考虑非默认轮次模式，只有轮次设置的方案同样受到保护。

未来行动直接展示同一 SimulationResult.records：黄色系统圆点、Flag、“第 N 轮开始”、累计 AV、推进 AV及中性配置图标。系统卡没有普通回合编号或速度字段。标题中文／英文通过 `planner.anchor.cycleBoundary` 插值，用户操作自定义名称继续从 Metadata 读取。

当前队列由 `buildCurrentQueueView()` 投影初始 post-start Snapshot 或 Record.beforeEffects，将至多一个待发生边界与普通项按未舍入剩余 AV 合并；稳定排序保留普通队列的原排序，系统项在同 AV 时最后。轮次触发时当前卡置顶为 0.00 AV，从等待项排除自身，其余参与者显示操作尚未结算时的状态，不提前加入新单位或提前施加效果。无轮次边界时直接保留原 Snapshot 队列引用。

队列游标与 Inspector 选择继续独立。模式重算按稳定 Anchor 重定位；不可达时队列回到 start，Inspector 保留原锚点与修复入口，不按索引重新绑定。Inspector 系统身份显示 Flag 和实际上下文累计 AV，没有速度；操作编辑器、Metadata、四个工具按钮、排序和命名完全复用，不显示前后阶段切换。

按用户确认，none 下保留所有轮次事件，单独显示“停用配置／轮次已关闭”，不产生普通 unreached-anchor 警告。停用时可查看和删除，缺少执行上下文时不能新增／编辑；重新启用恢复。启用但因预算、队列耗尽而未到达的轮次继续列为普通不可达配置。

## 5. Version 2、旧存档与模板

`document-file.ts` 定义 PLANNER_VERSION=2，内部提交、准备、导出和资源检查统一使用当前版本。Version 2 要求 plan.cycleMode，允许 cycleBoundary / ordinal；格式标识不变。

输入先进行现有树安全、字段白名单、数量、身份及 Metadata 检查。Version 1 仅允许原字段和 Anchor，随后集中补入 cycleMode: none；Version 2 严格验证新字段。Version 1 携带新字段、Version 2 缺少模式、未知模式、未知字段和未来版本仍拒绝。不通过放宽校验实现兼容。

Actor／Operation ID、旧 Anchor、顺序、阶段、参数精度和名称映射保持不变；已有资源清理与初始敌人 SPD 规范化规则继续使用。导出统一 Version 2；none 模式仍完整导出轮次事件和自定义名称。

localStorage 保持 `hsr-game-tools/action-planner/current`，恢复旧字节时只在内存迁移，不立即重写存储；下次正常提交保存 Version 2。原有损坏存档保护、外部变更暂停、比较基线及明确覆盖流程保持不变。没有第二套持久化系统。

模板解析器和校验器直接复用双版本入口，支持旧 Version 1 文件和新 Version 2 文件。模板说明已更新；正式目录仍为 0 个，没有新增配队内容。

## 6. 测试与实际工程结果

新增两个文件、28 项高价值确定性测试：引擎调度 16 项，编辑／展示／持久化集成 12 项。覆盖固定边界、关闭模式、149.999／150／150.001、同 AV 多 Actor、连续插队、Scheduled Event／倒计时同时到期、边界自身产生立即行动、Buff 和 AG、动态创建、节点与 AV 预算、空队列及到期边界复活、目标资格、前置队列、失败恢复、操作排序和名称、模式切换、语言语义、V1 迁移、V2 往返、存储和模板。

旧 Fixture 仅增加默认 none，并使用测试辅助 ordinaryNode 对普通字段做类型收窄；辅助在误混入系统节点时抛错，没有用类型断言伪装系统字段或改历史数值预期。原有 11 组迁移基准的排序、数学、生命周期、普通 Trace 和诊断保持通过；历史预期 JSON 未修改。

| 实际执行                           | 最终结果                                             |
| ---------------------------------- | ---------------------------------------------------- |
| npm run type-check                 | Vue 和 TypeScript 通过                               |
| 定向轮次测试                       | 2 文件，28 项通过                                    |
| npm run test                       | 18 文件，163／163 通过，包含 11 组迁移基准           |
| npm run lint                       | 通过                                                 |
| npm run format:check               | 全仓通过，仅格式化本轮文件                           |
| npm run validate:i18n              | 双语结构、Key、参数及语法通过                        |
| npm run validate:planner-templates | 0 个正式模板，校验通过                               |
| npm run validate:game-data         | 98 角色、3 预设、101 资源，missing／diagnostics 为 0 |
| npm run build                      | Vite 生产构建通过，2175 个模块                       |

环境为 Node 24.21.0、npm 11.16.0。测试进程沿用此前 Windows 沙箱兼容方式，将 TEMP／TMP 指向已忽略的 `.cache/vitest-temp`，没有修改 Vitest 配置或安装工具。开发中首轮发现无轮次队列引用变化，已恢复原行为；之后清理了一个未使用测试类型并修正格式，表格只记录最终通过结果。

最终构建：主入口 JS 364.19 kB（gzip 99.89 kB），ActionPlannerPage 387.69 kB（gzip 93.90 kB），CSS 28.02 kB（gzip 6.52 kB）。构建只证明静态产物可生成，不代表浏览器视觉和真实交互验收。

## 7. 仓库范围与已知限制

HSR-Game-Tools 开始为干净 main，HEAD `8821cf85e978d66345898a428e0e65921f86c311`；实施期间分支和 HEAD 不变，改动留在工作区，没有暂存或提交。依赖、锁文件、游戏数据、正式模板和历史迁移预期未修改。

三个来源仓库开始时均为干净工作区，结束时复查分支、HEAD 和状态保持原样：

| 仓库              | 分支    | HEAD                                       |
| ----------------- | ------- | ------------------------------------------ |
| HSR-Database      | develop | `0898487b3b048d9bd6af9d734208590deb38737a` |
| TurnBasedGameData | main    | `312b4597691e0a29cf9828a15b592757dba86949` |
| StarRailRes       | master  | `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487` |

尚未支持跨波次、MoC 重置／AA 保留、自定义轮长、Endgame Occurrence 导入、角色自动技能、伤害／能量／生命值、新配队模板、云同步或生产部署。不可达与停用操作保留配置但没有可靠上下文时不能编辑；无限零 AV 链由现有节点预算终止，边界可能因此尚未触发。存储的真实浏览器限制仍以此前保护机制为准，没有协作或跨标签页合并。

本轮没有执行 Computer Use、Playwright、Puppeteer、截图、dev／preview 浏览器验收或系统文件选择／下载验收。视觉、键盘交互和真实 localStorage 刷新流程等待用户人工检查。

## 8. 用户本地人工验收建议

1. 配置一支队伍，选择 MoC 后先不应用，切换阶段确认旧结果保持；应用后检查 150／250／350 AV。切换 AA 检查 300／400／500 AV，再关闭确认没有系统节点。
2. 选择“第 1 轮开始”，新增提前、延后、立即行动、速度效果和动态单位；确认无阶段切换，操作支持改名、排序、编辑和删除。所有目标选择器均没有轮次节点。
3. 用 100 SPD、默认初始 AG 的 Actor 设置战斗开始延后 50%，使其首次行动在 150 AV；确认 Actor 先于 MoC 边界。再配置同 AV 的立即行动链，逐节点确认所有普通行动先结算；边界配置的立即行动则在边界之后。
4. 切换当前队列，检查下一边界倒计时、同 AV 最低优先级和当前轮次置顶；确认系统卡没有 SPD／AG，操作效果与新单位在后续步骤才显示。点击等待卡只改变 Inspector，前后推进和模式切换保留合理位置。
5. 在轮次配置操作后关闭模式，检查停用列表可查看／删除且不显示普通不可达警告；重新启用或切换 MoC／AA，确认 ordinal 对应操作和自定义名称保留。
6. 导出 Version 2，导入并刷新，确认模式、稳定身份及操作完整恢复；导入实际旧 Version 1 文件，确认默认关闭且旧排轴不变。只改未应用草稿后刷新应恢复已提交配置。
7. 检查中文／English、1440／1024／390px 的控件换行、黄色系统点、Flag、标题、工具按钮和键盘操作；已有多标签页冲突／坏存档保护仍按 Phase 2A 清单验收。
