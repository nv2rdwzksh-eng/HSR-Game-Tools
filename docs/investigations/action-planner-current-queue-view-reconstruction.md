# 当前队列视图重构报告

日期：2026-10-13。实施范围仅为 HSR-Game-Tools 的展示层、队列导航状态、双语消息、测试与文档。

## 1. 根因与新的数据来源

旧界面将 `result.snapshots[queueIndex]` 作为当前队列。除了初始位置，这些 Snapshot 已完成节点全部操作、行动次数与生命周期结算，并将 Actor 的下一次自然行动入队，因此展示时点比「当前行动刚开始」晚一步。另外，「战斗开始」卡片位于循环外且无条件显示；普通队列会排除正在行动的单位，旧界面也没有单独补上当前行动者。

新增纯展示适配器 `src/tools/action-planner/model/current-queue.ts`：

- `buildCurrentQueueView(result, 0)` 返回 `start`，读取首个 Snapshot 的累计 AV 和等待队列，包含已提交的战斗开始效果；不使用未结算开始操作的 `startState`。
- 索引大于零时返回 `acting`，当前行动来自 `records[index - 1]`，累计 AV 来自该 Record；等待队列通过 `queueSnapshot(record.beforeEffects)` 生成。
- `beforeEffects` 已完成必要的 AV 推进，并带有 `activeParticipantId`。复用引擎队列函数即可排除当前行动者、保持真实排序和待行动 Anchor，无需在前端复制算法。
- 缺失结果、越界或非整数索引返回 `undefined`；当前队列显示现有空状态并禁用推进，诊断继续由原界面处理。
- `currentQueueCards()` 将当前 Record 和等待 QueueEntry 映射为统一卡片展示数据，保留各自的 Anchor 与 Trace 来源，不修改输入结果。

**没有修改核心引擎或类型定义。** `src/engine/action-planner/`、Snapshot 的结算后采样时机、数学逻辑、排序、结算窗口、速度生命周期和 Trace 来源均保持不变。展示适配器不运行第二套模拟。

## 2. 卡片、AV 与标记

未来行动继续显示战斗开始和全部已推演 Record，保留上方推进 AV、下方累计 AV 的结构。

当前队列初始位置显示战斗开始与初始等待队列。进入节点后，开始卡消失，当前行动卡排在等待队列之前；返回位置零恢复开始卡。当前卡使用原有模板、方形头像或事件图标、名称和阵营圆点，增加现有金色 Accent 轻背景及紧凑「当前行动」标识。没有新增大型 Card、选中对勾或第二层高亮边框。

当前行动者 AV 固定为 `0.00`；等待卡主数值为剩余 AV，并保留当前有效速度。控制栏显示 `节点 N / 总节点数 · 累计 AV`，分母来自实际 `records.length`，起点为 `0 / N`，终点为 `N / N`。英文同步更新，所有新文案由 Site Messages 管理。

同一 Actor 在当前等待队列中最多出现一次。当前 Actor 不在等待队列，下一次自然行动只有在进入后续节点时才可能出现。卡片名单不读取未来参与者目录来补充尚未入队的单位。

所有行动卡的可见 Metadata 已删除阵营文字；普通 Actor 仅保留回合编号、当前行动标识及独立配置图标。阵营语义数据、圆点颜色、Tooltip 和可访问名称保留，战斗开始与事件仍使用黄色圆点。

蓝色提前箭头、红色延后箭头和蓝色闪电继续通过 `actionDirections()` 按目标 Anchor 匹配已提交 Trace。当前卡读取 `NodeRecord.actionChanges`，等待卡读取 `QueueEntry.actionChanges`；`operationsAt()` 仅控制中性配置图标。合法零变化效果及多种类型共存的规则保持不变。

## 3. 导航、重算与草稿

`useActionPlanner` 新增 `currentQueueView` Computed，同时保留原 `snapshot` 的结算后含义。下一步／上一步只移动已有模拟结果的游标，范围为 `0..records.length`，不执行离散事件或新增连续时间步。

`queueCursor` 拥有推进位置；`selected` 拥有 Inspector 选择。有效推进会丢弃草稿并选中新进入的节点，即使 Inspector 已提前选中该节点也会丢弃草稿。点击等待卡仅改变 Inspector；当前卡通过 `aria-current="step"` 表达行动状态，选中态独立使用 `aria-pressed`。达到首尾边界时继续点击不会改变 Inspector 或丢弃草稿。

首次进入当前队列从战斗开始，之后模式切换保留原推进 Anchor。切换模式、阶段或另一个 Inspector 节点仍直接丢弃草稿，无确认框。

计划重算后，仍存在的 Anchor 会在新 Record 列表中重新定位，索引可以变化；不可达 Anchor 则明确将队列游标重置为战斗开始，后续恢复预算也不会自动跳回旧位置。Inspector 仍保留原选中 Anchor、操作及原有不可达配置修复入口，不将操作绑定到相同索引的新节点。

## 4. 边界处理

- **速度效果：** 当前节点尚未施加的速度修正不会提前出现；下一个 Record 的进入状态自然包含前一个节点已结算的效果。
- **连续零 AV：** 每次前进仍进入一个节点，累计 AV 可以不变；顺序完全沿用引擎的零 AV 插队规则，不按名称或阵营重排。
- **动态单位：** 节点操作创建的单位在该节点开始时不出现，之后按真实入队结果展示；战斗开始创建的单位则已包含在初始 Snapshot。
- **有限行动次数：** 最后一次行动仍以当前 Record 展示；结算离队后不出现在后续等待队列。
- **Scheduled Event：** 事件 Record 可作为当前卡，AV 为零；事件本身不在等待队列，配置的事件操作尚未体现在当前等待状态中。
- **倒计时到期窗口：** 引擎在保存事件 `beforeEffects` 前已调用 `expireCountdown()`，等待 Actor 的有效速度因此已移除到期修正，而 AG 保留该时刻的推进结果。此次直接沿用这一既有语义；没有把事件操作提前，也没有改变速度生命周期。
- **推演结束：** 节点预算、AV 预算和自然耗尽均以实际 Record 数量为终点，下一步禁用，不生成虚假节点。正常空结果可保留开始视图，原有 `no-participants` 信息不会升级成计算错误；失败结果继续使用原诊断展示。

## 5. 测试与实际执行结果

新增 `tests/unit/planner-current-queue.test.ts`，共 13 个用例（包含四种停止原因的参数化场景）。覆盖初始操作、当前零 AV、等待剩余 AV、下一自然回合、速度与动态单位时点、行动次数、零 AV 排序与 Trace、倒计时窗口、无效结果、阵营模板检查、Inspector 独立性、草稿与模式切换、重算定位及首尾边界。断言主要针对 View Model 和稳定 Anchor，没有大量翻译文案或视觉快照断言。

| 实际命令                                                                                                                             | 结果                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `npm run type-check`                                                                                                                 | 通过，Vue 与 TypeScript 类型检查                                         |
| `npm run test -- tests/unit/planner-current-queue.test.ts tests/unit/planner-editor.test.ts tests/unit/planner-localization.test.ts` | 3 个文件，40 个测试通过                                                  |
| `npm run test`                                                                                                                       | 13 个文件，109 个测试通过，包含现有引擎、Trace、基础及 11 个迁移基准用例 |
| `npm run lint`                                                                                                                       | 通过                                                                     |
| `npm run format:check`                                                                                                               | 全仓检查通过；仅本轮修改文件执行格式化                                   |
| `npm run validate:i18n`                                                                                                              | 中英文结构、Key、参数及消息语法通过                                      |
| `npm run validate:game-data`                                                                                                         | 98 个角色、3 个预设、101 个资源；缺失与诊断均为 0                        |
| `npm run build`                                                                                                                      | Vite 生产构建通过                                                        |

首次定向 Vitest 运行在 Windows 沙箱临时目录执行模块缓存重命名时遇到 `EPERM`，测试尚未执行。随后仅将测试进程的 `TEMP`／`TMP` 设置为已忽略的项目 `.cache/vitest-temp`，定向与全量测试均通过；未改动 Vitest 配置、依赖或 npm 脚本。复现本次测试环境可在 PowerShell 中执行：

```powershell
New-Item -ItemType Directory -Force -Path '.cache/vitest-temp' | Out-Null
$env:TEMP = (Resolve-Path -LiteralPath '.cache/vitest-temp').Path
$env:TMP = $env:TEMP
npm run test
```

`AGENTS.md` 已加入用户要求的默认政策，并替换旧的强制真实浏览器验收条款；设计说明同步更新。现有普通测试为 Node 环境 Vitest，不自动触发浏览器，不需要拆分脚本。此次没有执行 Computer Use、Playwright、Puppeteer、截图或真实浏览器交互，没有安装浏览器工具；视觉和真实交互仍待用户人工验收。

实施前源仓库均为干净工作区，记录如下；交付前复查其分支、HEAD、工作区状态，均保持不变。HSR-Game-Tools 保持 `main` 与原 HEAD `8b04022265d026f9d9206ae606b60a56bf8de558`，本轮改动仅留在工作区，未暂存、提交、推送或部署。

| 源仓库            | 分支    | HEAD                                       |
| ----------------- | ------- | ------------------------------------------ |
| HSR-Database      | develop | `72c2d4d1b9ccc0fc0bb191d16ac29492750ea1b0` |
| TurnBasedGameData | main    | `312b4597691e0a29cf9828a15b592757dba86949` |
| StarRailRes       | master  | `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487` |

## 6. 用户本地人工验收清单

1. 应用队伍配置并切换当前队列：确认 `0 / N`、战斗开始卡和开始效果结算后的初始剩余 AV。
2. 点击下一回合：确认开始卡消失，当前行动者在顶部且 AV 为 `0.00`；其他单位显示正确剩余 AV，当前 Actor 的下一回合没有提前出现。
3. 再前进一次，确认上一行动的速度效果或创建单位按实际结算出现；有限行动次数单位正确离队。点击等待卡，确认仅 Inspector 改变，队列位置保持。
4. 配置多个立即行动，逐次推进：确认同累计 AV 下更换当前行动者、零 AV 顺序和蓝色／红色影响标记正确；检查配置图标独立存在。
5. 配置速度倒计时并推进到触发：确认事件卡置顶为零 AV，等待卡按到期修正移除后的速度显示，下一步反映事件操作结算。
6. 返回上一步及战斗开始，再切换未来行动／当前队列：确认未来行动保留开始节点与双行 AV、当前队列恢复之前位置；各模式没有重复阵营文字，末尾下一步禁用。按需在桌面与窄屏检查样式。
