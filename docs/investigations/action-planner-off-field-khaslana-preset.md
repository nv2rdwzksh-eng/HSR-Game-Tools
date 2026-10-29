# 行动序列模拟器：离场、事件变速与卡厄斯兰那预设

日期：2026-10-14。实施分支：develop。起始 HEAD：`cd4b1615c0c48fbc62fa18e873131b0786c6f64c`。
本报告记录本轮实施与执行证据；现行契约见[架构](../architecture/action-order-simulator.md)及[UI 规范](../design-notes.md)。

## 1. Executive Summary

完成两项纯 TypeScript 通用能力：参与者离场 / 回场，以及 Scheduled Event 自身速度 Modifier。工具层将其组合为卡厄斯兰那的八倒计时批量预设，一次生成十条普通操作并提交完整方案。
引擎不识别白厄、卡厄斯兰那、星魂、击杀或变身；预设成功后没有专用分组生命周期，用户可逐条修改和删除。只修改 HSR-Game-Tools，没有提交、推送、部署或浏览器自动化。

## 2. 离场与回场数据模型

共享 QueueState 增加 `departed: boolean`，Actor、Scheduled Event 与 Aha 的创建路径统一默认 false。离场单位留在 `SimulationState.participants`，不通过删除单位模拟离场。
标准操作 `depart` / `returnToField` 保留 ID、阶段及普通 Target。操作仅改变 departed，不修改回合、AG、Modifier、order、zeroBatch、zeroOrder 或 pendingActionChanges，也不创建 ActionChangeTrace。

## 3. AG 冻结与 AV 恢复

orderedParticipants 排除离场单位，advanceTime 跳过其 AG 消耗。其他参与者和 elapsedAV 正常推进，保持原有精度与离散排序。

```text
AG_return = AG_departure
AV_return = AG_return / SPD_current
```

冻结 AG 而非 AV。离场期间关联倒计时触发导致速度 Buff 到期，回场后按新速度计算 AV。零 AG 回场保留原插入批次与优先级，不调用 immediatelyAct。
自然行动者在 preAction / postAction 离场时，当前自然回合仍按既有流程完成 AG 重置、回合计数及旧 Buff 到期；这与离场操作本身不修改 AG 的契约兼容。

## 4. 三类 Participant 与系统节点

| 类型            | 离场 / 回场 | 结算行为                                    |
| --------------- | ----------- | ------------------------------------------- |
| Actor           | 支持        | 离场无自然行动，已开始的自然回合仍完成      |
| Scheduled Event | 支持        | 离场暂停 AG，回场继续倒计时，触发后正常移除 |
| Aha             | 支持        | 自身 AG 暂停，恢复后沿用自然回合规则        |

用户已确认：离场贡献者仍计入阿哈速度公式，departed 不改变贡献者身份。真正移除参与者才停止贡献。
全部我方离场时，敌方、在场事件与阿哈继续推进；全部可调度单位离场时，有效轮次边界仍可结算。无有效系统节点时以 empty 停止，不制造回场节点。

## 5. Targeting 改造

资格分为结构类型检查、真实状态筛选和事件持续方式检查。引擎、草稿校验、目标选择及命名复用这些规则。

- 普通效果和 depart 选择在场单位，returnToField 选择离场单位。
- Presence 显式多选支持三类参与者混选；任何缺失或状态不匹配导致整条操作跳过并诊断。
- allies / enemies 仅包含对应阵营及状态的 Actor，不包含中立阿哈和事件。
- 事件 advance / delay 仍为显式单选，immediatelyAct 仍不支持事件。
- 事件速度效果支持显式多选及与 Actor / Aha 混选；已进入触发的事件不可再作为目标。

回场 Grid 读取所选锚点、阶段与操作位置的真实预览，离场目标不会因 Navigator 隐藏而丢失。Presence 自动名称和 Metadata 不再通过可排序队列过滤目标。

## 6. Scheduled Event 新速度公式

定义保留 speed 作为初始实际速度，新增可选 baseSpeed 作为百分比修正基数。旧事件未指定基数时使用 speed，不改写旧定义。

```text
SPD_event = speed + (baseSpeed ?? speed) × Σpercent / 100 + Σflat
baseSpeed = 100，speed = 66
+1.5% → 67.5
再 +1.5% → 69
```

变速保留 AG、elapsedAV 与 Trace，可改变 AV 和排序。候选有效速度必须有限且为正；引擎拒绝非法候选，编辑器对事件速度草稿也在提交前检查。

## 7. Modifier 生命周期与深拷贝

Scheduled Event 自身 Modifier 只支持 `{ kind: 'turns', turns: null }` 无限持续，直到事件触发并移除；不为事件引入回合计数器。有限回合及倒计时持续在完整方案与运行时校验中明确拒绝。
普通自然参与者仍保留有限回合、无限回合和关联倒计时规则。离场本身不触发到期；关联倒计时在场时照常到期，自身也离场时暂停。
cloneState 与 queueSnapshot 使用统一 Modifier 深拷贝，包含 Lifetime；预览和展示不能污染正式状态。事件 Tag 使用实际入口状态，关联倒计时速度提示读取当前有效速度。

## 8. 八个事件生成逻辑

工具层 Builder 接收基础速度 B、继承百分比 r、八个已本地化名称、真实预览和现有 ID 分配器。

```text
baseSpeed = B
speed = B × r / 100
initialAG = i × 10000 / 7，i = 0…7
```

首事件 AG 为 0，最后事件为 10000，中间六个保留 Number 分数精度。八个 spawn 操作及其派生 Participant ID 各自独立，不添加隐藏拉条。
名称为卡厄斯兰那-1 至 -7 和卡厄斯兰那-最后一击；英文为 Khaslana-1 至 -7 与 Khaslana-Final Strike。名称创建后作为普通用户可编辑字段保存。

## 9. 预设 UI 与缩略图来源

入口沿用 OperationEditor 的 Preset Popover，缩略图来自项目快照角色 `1408`，assetKey 为 `character:1408`，既有路径为 `game-assets/character/1408.webp`。GameIcon 继续负责加载失败 Fallback，不修改快照或资源 Manifest。
紧凑参数表单默认基础速度读取快照值 94，继承比例为 60%，提供“0 魂填 60%，1 魂以上填 66%”双语 Hint 与初始速度预览。用户可自由输入正有限比例，不设置 84% 上限。
所有新增 UI、校验、自动操作名称和 Metadata 均使用 Site Messages。Presence 使用 LogOut / LogIn；事件变速沿用蓝 / 红速度 Tag，不生成拉条箭头。

## 10. 跨节点标准操作

预设开始节点所选阶段末尾按顺序追加八个 spawnParticipant 与一个 depart，目标为该执行时点全部在场我方 Actor 的实际 ID。无合法目标时拒绝创建。
自然节点保留 preAction / postAction，默认 postAction；开始、事件及轮次节点不保存 phase。
第八个事件通过 `{ kind: 'trigger', participantId: finalEventId }` 关联普通 PlanEvent，在该节点追加 returnToField，目标是开始时相同的明确 ID。
预算不足时回场事件仍保存并产生现有不可达诊断；扩大预算后重放恢复。不覆盖既有操作，也不因重命名动态重绑目标。

## 11. 原子提交与稳定 ID

先检查参数及上下文，再用现有 nextId 分配十个操作 ID，派生事件身份沿用 spawnedParticipantId。分配器同时保留已有身份、派生身份和孤立引用，导入、重复创建及取消后不会碰撞。
Builder 创建完整候选文档；统一文件边界检查结构、引用、身份和文件限制，然后 simulatePlan 重放。错误诊断或生成操作的目标失败警告阻止整批提交；仅预算造成的不可达警告不阻止提交。
所有检查完成后一次发布 document 与预先计算结果，浅提交 watcher 只保存一次完整文档。失败不发布部分事件、离场状态或回场操作；已分配但未提交的 ID 保留，不复用。
提交后不存储 Preset Group。删除最终事件会留下可诊断的回场孤立锚点，不自动级联删除或修复。

## 12. 持久化兼容

仍为 `hsr-game-tools/action-planner` Version 3，不新增格式版本。严格边界允许两种 Presence Operation 和事件可选 baseSpeed，继续拒绝未知字段、非法基数、冲突身份及超限文件。
departed、运行时 Modifier、结果和草稿不写入 JSON，导入或刷新后通过标准操作重放恢复。修改预设事件名称或速度保留 baseSpeed、initialAG 和稳定 ID。
旧 Version 1 / 2 迁移及旧 Version 3 文件继续支持；原 localStorage 的损坏保护、外部变更检测和明确覆盖逻辑未改动。正式模板目录保持为空，没有自动生成生产配队模板。

## 13. 新增与保留测试

新增两个确定性测试文件，共 35 项：

- `action-planner-presence-events.test.ts`：20 项，覆盖三类离场、冻结 AG、全局推进、零 AV 元数据、原子目标校验、自然回合结算、阿哈贡献、轮次、Buff 暂停 / 到期、变速、Lifetime、深拷贝、Tag 和触发目标资格。
- `planner-khaslana.test.ts`：15 项，覆盖参数、精确 AG、稳定身份、阶段、自动回场、不可达预算、一次保存、取消、文件限制、模拟失败、重复创建、编辑删除、手动速度效果及 JSON 边界。

两条既有资格断言更新为允许事件速度目标，其余限制和数学断言保留。完整套件为 23 文件 / 252 测试；既有 AG / AV、零 AV、Trace、Buff、MoC / AA、阿哈、队列、文档、持久化和 11 个历史迁移用例继续执行。

## 14. 完整工程检查

环境为 Node 24.21.0、npm 11.16.0；未升级依赖。

| 检查                               | 结果                                              |
| ---------------------------------- | ------------------------------------------------- |
| npm run type-check                 | 通过                                              |
| npm test                           | 通过：23 文件、252 测试                           |
| npm run lint                       | 通过                                              |
| npm run format:check               | 通过                                              |
| npm run validate:i18n              | 通过：双语结构、参数及语法                        |
| npm run validate:game-data         | 通过：98 角色、3 装备预设、101 资源，无缺失或诊断 |
| npm run validate:planner-templates | 通过：0 个正式审阅模板                            |
| npm run build                      | 通过：Vite 静态构建                               |
| git diff --check                   | 通过                                              |

首次受限沙箱测试因 Vitest 临时缓存的原子 rename 出现 EPERM，未执行用例。随后经自动审批在沙箱外运行，35 项新增测试与完整 252 项测试均实际通过，没有关闭缓存校验、删断言或跳过测试。
未执行 Computer Use、Playwright、Puppeteer、浏览器截图或线上验收；静态构建及单元测试不代表人工交互已经验收。

## 15. 技术债清理与仓库边界

统一三类参与者的 Modifier / Lifetime 深拷贝，移除事件与自然单位的重复复制分支和过时的速度目标限制。事件持续方式资格在 targeting 中统一供引擎、完整校验和草稿使用；保留自然回合专属逻辑。
没有全仓重构、CI/CD、Analytics、Vercel、DNS、分支流程或其他游戏工具变更。AGENTS.md 的现有约束足够，因此未追加重复契约。

起始只读来源状态如下，收尾再次核对：

| 仓库              | 分支    | HEAD                                       | 初始工作区 |
| ----------------- | ------- | ------------------------------------------ | ---------- |
| HSR-Database      | develop | `0898487b3b048d9bd6af9d734208590deb38737a` | 干净       |
| StarRailRes       | master  | `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487` | 干净       |
| TurnBasedGameData | main    | `312b4597691e0a29cf9828a15b592757dba86949` | 干净       |

收尾再次核对三者分支、HEAD 与工作区，均与起始一致且干净。HSR-Game-Tools 仍在 develop，HEAD 未改变；全部变更为本轮未提交的功能、测试和文档文件。另已检查四份编辑 Markdown 的本地链接目标，全部存在。

## 16. 已知限制

本轮只表达行动序列、离场、回场及手动事件变速，不模拟真实变身角色替换、伤害 / 真伤、能量、技能执行、击杀自动判定、星魂自动触发、额外回合技能或跨波次 AG 特殊重置。
一星魂加速需要用户手动对剩余事件添加普通无限持续 Modifier。角色与其 Buff 倒计时是否共同离场由用户显式操作决定；引擎不自动关联。用户独立删除操作后可能产生普通失效目标或不可达锚点，需要人工修复。

## 17. 人工验收清单

建议在 1440px、1024px、390px 下分别切换中文和 English；验收前使用用户自己的白厄队伍。

1. 进入模拟器，在开始或自然行动节点打开预设，核对缩略图、Hint、默认 60%、阶段选择、速度预览及取消不保存。
2. 输入 B=100、r=66%，确认一次生成八个事件及我方离场；检查第一事件 0 AV、最后事件完整 AG，我方等待队列隐藏。
3. 在第一事件节点多选剩余倒计时添加 +1.5% 无限速度效果，再在后续节点追加一次；核对剩余事件速度 67.5 / 69、AG 未重置、蓝色 Tag 无拉条箭头。
4. 到最后一击检查自动回场；核对恢复冻结 AG、当前速度和正常后续行动。再分别手动测试 Actor、事件及阿哈的离场 / 回场目标 Grid。
5. 调小节点 / AV 预算，确认回场配置留在不可达列表；扩大预算检查自然恢复。修改倒计时名称、速度及任一普通操作，检查稳定引用；删除最后事件检查孤立配置诊断。
6. 导出 JSON、刷新恢复、重新导入，核对完整十条操作、自定义名称及所有参数。再次创建预设，检查取消或非法输入不留下部分数据。
7. 用键盘访问预设和目标按钮、持续方式与输入错误；窄屏检查标题换行、浮层宽度及真实输入关联提示。人工验收尚待用户执行。
