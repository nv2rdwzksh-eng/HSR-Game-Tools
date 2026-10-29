# SPD Modifier Tag 展示实施报告

日期：2026-10-14，Asia/Shanghai。基于 HSR-Game-Tools 本地 `main`、HEAD `c55c6bc70ea04448dff4ea30a45622eec524e158`。本轮完成 Presentation / UI 接入及静态验证，没有提交、推送、部署或执行真实浏览器自动化。

**未来行动、当前队列和 Inspector 已展示对应时点真正生效的速度 Modifier。每个实例独立显示原始固定值或百分比，蓝色加速、红色减速、零值中性；Tooltip 解释剩余回合、无限持续或关联倒计时。**真实浏览器视觉、Hover 和键盘交互仍待用户本地人工验收。

## 1. 共用 Presentation Model

新增 `src/tools/action-planner/model/speed-modifier-tags.ts`，纯函数读取已有引擎数据，不依赖 Vue，不触发 simulatePlan，不修改输入或写回计划。

`SpeedModifierTagView` 保留 id、operationId、mode、原始 amount、increase / decrease / neutral 方向和生命周期。lifetime 是独立副本；countdown 可附加解析得到的 name / speed。Tag 按原 modifiers 顺序映射，以 modifier.id 为稳定 Key，不按幅度合并，不显示净变化总和。

`speedModifierTags()` 解释实例；`actionSpeedModifierTags()` 从指定 action Anchor 的状态查自然参与者；`navigatorSpeedModifierTags()` 区分记录与 QueueEntry。`speedModifierMessages()` 返回语义 Message Descriptor；`renderSpeedModifierTag()` 统一生成 Tag、Tooltip 和可访问描述，复用现有 renderMessage / formatNumber。

固定值显示“速度 +60”等原幅度，百分比显示“速度 +20%”，不转换为实际 SPD 增量。数字遵守现有最多六位小数和有符号格式，不套用 AV 的两位小数规则；负零显示中性 0。Modifier 存在就展示，包括零幅度，空集合不生成 Tag。

## 2. 四种状态读取路径

| 展示位置                   | 数据来源                                              | 语义                                           |
| -------------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| Future Action Card         | record.beforeEffects 中同 Participant ID 的 modifiers | 该自然行动刚开始、尚未执行本节点操作           |
| Current Queue 顶部当前行动 | 同一 record.beforeEffects                             | 与该节点未来行动展示一致                       |
| Current Queue 等待项       | QueueEntry.modifiers                                  | 当前观察时点实际效果，不预测其未来回合         |
| Inspector 当前节点信息     | 已有 context 与 action Anchor                         | 选中行动开始时的真实效果，不读取 draft preview |

初始队列直接使用 snapshots[0].queue，因此显示已经执行的开始操作所添加的 Buff。后续队列继续使用原 current-queue 的 beforeEffects 投影，不改变后结算 Snapshot 或游标语义。

自然行动仅包括 Actor 与阿哈。start、Cycle Boundary、Scheduled Event 和缺少实际上下文的不可达节点不展示虚构效果。Tag 与已配置操作 Metadata 分开：当前 preAction / postAction 才添加的效果不进入本节点开始时的 Tag；之后节点按照真实状态显示。

## 3. 回合与倒计时生命周期

回合 Tooltip 直接读取 remainingTurns，例如“剩余 2 回合”；null 表示无限持续。Presentation 不扣减回合数、不根据 turn 编号推断到期。已有持续 1 回合效果在对应行动开始显示，结算后下一行动不再显示，完全遵守原 oldModifiers 规则。

倒计时解析优先级：

1. 在该节点对应的 SimulationState 中，按 lifetime.participantId 查实际 Scheduled Event，读取其名称与配置 speed。
2. 若没有完整状态或无法匹配，查来源 operationId 的标准 addSpeedModifier / countdown 配置；只有其生成的 countdownParticipantId 与 lifetime.participantId 一致才使用。
3. 无法可靠匹配时，显示“持续至关联倒计时触发”，不显示其他倒计时的名称或速度。

来源只读 Map 在 ActionPlannerPage 中随 plan 构建一次，并由 Navigator / Inspector 共用；不会每枚 Tag 遍历全部操作。当前状态中的事件信息始终优先，初始队列没有完整 post-start 状态时可用已匹配的操作配置解释 Tooltip。

“倒计时速度：70 SPD”表示配置速度，不是剩余 AV。Tag 是否存在只由 modifiers 列表决定，不由关联操作是否存在、elapsedAV 比较或 UI 预测决定。提前、延后、零 AV 或同 AV 排序影响由引擎状态体现；倒计时触发前后的实例移除不在 UI 重复计算。

## 4. 阿哈与行动变化语义

阿哈自身 +25 flat、+20% 等真实 Modifier 分别显示独立 Tag，自身回合或倒计时到期后按真实状态消失。欢愉角色的实时加权贡献不是 Modifier，不生成四个常驻 Tag；贡献者变速只改变阿哈有效速度，不给阿哈虚构实例。

提前、延后、立即行动仍只读取 actionDirections 对真实 ActionChangeTrace 的判断。新展示不生成或修改 Trace，速度提高不增加上箭头，速度降低不增加下箭头。原阵营点、中立 Gauge、配置标记、选中状态和 current 标记保留。

## 5. 布局、组件、Tooltip 与无障碍

新增 `SpeedModifierTags.vue`，使用 PrimeVue Styled Mode 的 Tag 和已注册 Tooltip 指令。没有新增依赖、通用 Buff 框架、Tag 图标或嵌套 Card。

行动卡保留左侧阵营点与头像，主体采用两列、按需三行：名称 / 未来模式推进 AV，回合元信息 / 累计或剩余 AV，速度 Tag / 行动变化图标。当前队列有效 SPD 保留在第二行元信息。第三行仅在有 Tag 或行动变化图标时渲染，原上箭头、下箭头和闪电继续位于右侧 AV 下方。

左列 min-width 为 0，右侧数值有独立最小宽度。Tag 用 Flex Wrap 自然换行，长文本允许断行，不覆盖右侧数值；没有效果时不额外撑高卡片。保持既有卡片最小高度，不强制所有有 Tag 卡片等高。

样式限于组件自己的 class：小尺寸、低强度 color-mix 背景，复用 --color-advance / --color-delay / --color-muted。保留现有主题层级，没有成片覆盖 PrimeVue 内部 .p-* 类。移除了变更后过时的 node-meta 上边距及重复 change-signals 高度 / 边距样式。

每枚 Tag Hover Tooltip 展示持续信息。行动卡仍是一个原生按钮，内部没有嵌套按钮或可聚焦 Tag；卡片 Focus Tooltip 汇总各效果的幅度与持续信息，aria-label 同步包含完整摘要。点击 Tag 仍可选择所属卡片，新增 Tooltip 未加入阻止点击或改写键盘操作的逻辑。

Inspector 使用同一组件，放在当前节点信息附近。非交互包装 span 可单独聚焦并显示 Focus Tooltip，内部 Tag 显示 Hover Tooltip；完整 aria-label 不只依赖颜色，正负号及明确速度文本始终可读。Tooltip 使用默认转义文本，换行解释倒计时，沿用 PrimeVue Escape / Blur 关闭行为。

## 6. Site Messages 与文档

新增 zh-CN / en 的 planner.speedTag 消息：flat、percent、remainingTurns、unlimited、countdown、countdownUnknown、description 和 nodeDescription。倒计时消息包含真实换行；幅度通过 DisplayNumber signed 格式化，持续时间和速度通过统一 renderMessage 解析。

Vue 中没有按 locale 拼接中英文句式。语言切换只更新展示，不重新模拟。实例 ID、operationId、生命周期、Tag View Model、来源 Map 和翻译均不持久化。README 与设计说明补充了状态时点、位置、生命周期解释和键盘语义。

## 7. 测试与实际工程检查

新增一个定向测试文件 `tests/unit/planner-speed-modifier-tags.test.ts`，参数展开后共 14 项。通过真实 simulatePlan 结果验证：

- 正负 flat / percent、零值、独立同幅度效果、空集合和输入不变。
- 回合开始已有效果、最终有效回合、pre / post 新加效果不提前展示、无限持续。
- countdown 显式提前 / 延后、同 AV 队列顺序、触发后的移除；状态优先、匹配来源和错误关联的通用回退。
- 未来行动、当前行动、等待项、Inspector 和开始队列的数据解释；早期效果重算后更新，历史节点不混入未来效果。
- 阿哈自身效果、仅派生贡献时无 Tag、到期消失及与 gauge Trace 的独立语义。
- 无上下文、start、轮次和 Scheduled Event 不生成 Tag。国际化断言使用消息 Key、参数和既有格式函数，不锁定大量具体翻译。

实际使用 Node 24.19.0 和现有依赖执行：

| 检查                            | 结果                                   |
| ------------------------------- | -------------------------------------- |
| Vitest 定向测试 + 11 个迁移基准 | 2 文件、25 项通过                      |
| npm test                        | 21 文件、216 项全部通过                |
| npm run type-check              | Vue、TypeScript、scripts 和 tests 通过 |
| npm run lint                    | 通过                                   |
| npm run format:check            | 通过                                   |
| npm run validate:i18n           | 双语结构、Key、参数与语法通过          |
| npm run build                   | Vite 构建通过                          |
| git diff --check                | 通过                                   |

没有组件快照、CSS 像素测试或浏览器自动化。本轮没有修改 src/engine、current-queue.ts、Version 3 文件边界、自动保存、历史期望、依赖、游戏快照或资源。现有 SimulationResult 已提供必要信息，不需要只读结果扩展。

三个来源仓库前后均保持原分支、HEAD 和干净工作区：

| 仓库              | 分支    | HEAD                                     |
| ----------------- | ------- | ---------------------------------------- |
| HSR-Database      | develop | 0898487b3b048d9bd6af9d734208590deb38737a |
| TurnBasedGameData | main    | 312b4597691e0a29cf9828a15b592757dba86949 |
| StarRailRes       | master  | dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487 |

HSR-Game-Tools 分支及 HEAD 保持原样，工作区仅包含本轮展示、文案、测试与文档变更。未联网、暂存、提交、推送或部署。

## 8. 限制与人工验收清单

Tooltip 只展示生命周期及倒计时配置速度，不展示预计剩余 AV、实际百分比 SPD 增量或额外来源技能说明。缺少可靠倒计时关联时只有通用描述。本轮没有改变阿哈额外回合或游戏技能执行范围。

浏览器交互和视觉尚未自动验证，请在本地检查：

1. 开始节点添加 +60、-25、+20%、-15% 和零幅度，确认独立 Tag、方向颜色和原幅度；相同幅度两个效果不能合并，无效果卡片不增加第三行。
2. 比较同节点未来行动、当前队列顶部与 Inspector；当前回合新配置的速度操作不能提前显示，等待项和初始队列应按当前状态显示。
3. 配置有限回合、无限和 countdown，并提前 / 延后倒计时；检查 Tooltip 的剩余次数、名称与配置 SPD，触发后 Tag 消失。
4. 阿哈自身 +25 / +20% 显示两枚 Tag，单独改变欢愉角色速度不虚构阿哈 Tag；原箭头、闪电与配置标记保持右侧位置及原语义。
5. Hover Tag、Tab 聚焦卡片及 Inspector Tag，确认描述一致、Escape / Blur 关闭正常；点击 Tag 不妨碍选择卡片，无嵌套按钮或额外卡片内 Tab 停靠点。
6. 中文 / English、长名称、多 Tag 和 1440 / 1024 / 390px 检查自然换行、右侧 AV、图标及滚动，不发生遮挡。

完成本轮展示功能后停止，不进入其他功能阶段。
