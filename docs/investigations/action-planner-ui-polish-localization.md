# Action Planner：UI Polish Round 1 与 Site Messages 收敛

实施日期：2026-10-13。范围仅 HSR-Game-Tools；未提交、推送、部署或更新游戏数据。用户在实施中明确免去后续浏览器验收，最终视觉效果由用户确认。

## 1. 结论与 UI 视觉改动

沿用 PrimeVue Styled Mode、Aura 深色金色主题、Tailwind CSS 4 与 Lucide，不修改双栏比例、导航层级或战斗配置结构。

行动序列左侧编号替换为纵向居中的 9px 实心阵营圆点。未来行动先显示弱化的 +推进 AV，再突出累计 AV；数字右对齐、启用 tabular numbers，仍固定两位小数。当前队列保持剩余 AV 与有效 SPD 语义，不把剩余值当作累计值。战斗开始也有圆点和格式化的 0 AV。

移除行动卡右下角选中 Check，保留边框、背景、键盘原生按钮行为与 aria-pressed。目标选择器的勾选标记保持。右侧累计 AV 下方显示稍醒目的 20px 行动变化图标，不展示具体变化幅度或新增大型彩色容器。

Inspector 操作卡 Padding 调为 12px，类型图标、可换行标题和四个工具按钮位于顶部；按钮不再占底部整行。Metadata 约 13px，使用头像、图标和独立参数组，不使用嵌套 Card、空字段标签、占位短横线或机械点分隔。

## 2. 阵营与 Action Change Icon 语义

我方绿色、敌方红色、战斗事件黄色；系统节点和无法分类的节点使用黄色 fallback。事件黄定义在主题 `primitive.event.500`，业务 CSS 通过 `--p-event-500` 引用；已通过 PrimeUIX 样式生成接口确认该变量实际输出为 `#dfbc66`。所有圆点有 Site Messages 提供的 Tooltip／可访问名称，列表继续显示阵营文字。

蓝色上箭头、红色下箭头、蓝色闪电分别代表当前待行动受到 advance、delay、immediatelyAct 影响。按用户补充，**只要效果合法作用并提交，就显示对应标记，不要求 AG、AV 或队列位置发生变化**。零百分比提前／延后和零 AV 立即行动也可以显示。三种标记可共存，不合并为净方向。

`actionDirections` 只筛选与当前 targetAnchor 匹配的 Trace。源节点的中性配置图标表示本节点配置了操作，不代表源节点受到行动变化。缺失／非法目标、被排除的活跃目标和失败提交不会产生误标记。

## 3. 立即行动 Trace 的实现方式

`ActionChangeTrace.type` 扩展为 `advance | delay | immediatelyAct`。在 `applyOperations` 中，对现有排序逻辑选出的实际目标 group，记录 operation ID、sourceAnchor、phase、目标下一次待行动的 targetAnchor、elapsedAV、beforeAG、afterAG、effectiveSpeed、deltaAV 和 zeroAVInsertion。

立即行动保持独立操作类型，直接沿用原有归零及零 AV 批次逻辑，不转换为 100% 普通提前。deltaAV 按真实 AG 差与当时有效速度计算；zeroAVInsertion 仅在目标原本已为零且实际移到更前位置时为 true。即使二者均为零／false，合法记录仍保留。

Trace 写入现有候选状态，assertState 成功后才提交，继续使用原有深克隆、队列快照与待行动历史消费机制。记录属于运行时派生状态，不写入 SimulationPlan。动作前当前活跃单位不会成为待行动目标；动作后对自身的影响关联下一回合。消费后不会污染再下一回合。

历史迁移期望文件没有重新生成。历史比较仅过滤本轮新增 immediatelyAct Trace；原有普通 Trace、行动顺序、AG／AV、SPD、modifier、诊断和停止原因仍全部比较。新立即行动 Trace 在独立机制测试直接验证。

## 4. Inspector Metadata 的新信息结构

新增纯 `operationMetadata`，从结构化操作和操作执行前的真实上下文生成目标 ID、目标描述及参数组；不读取或推断标题。`operationContext` 按计划、所选锚点和操作位置缓存，不在切换语言时重复预览。

| 操作                 | 必须显示的配置                                                 |
| -------------------- | -------------------------------------------------------------- |
| 提前／延后           | 目标及百分比，包括 0%                                          |
| 立即行动             | 目标及操作语义，无百分比                                       |
| 速度效果             | 固定／基础百分比、有符号数值、有限／无限回合或倒计时名称及 SPD |
| 创建 Actor           | 实体名称、阵营、适用类别、基础及面板 SPD、有限／无限行动次数   |
| 创建 Scheduled Event | 事件名称、SPD、一次性触发生命周期                              |

单目标始终显示头像和名称。多目标预览最多四个头像，每个头像保留名称 Tooltip 和可访问图像名称；超过四个时通过 +N 的 PrimeVue Popover 查看全部目标。缺少可靠上下文时显示配置范围及不可解析状态，不编造人数。实际解析为空时明确显示没有可作用目标。

上移、下移、编辑、删除始终位于右上角，保留原有排序限制、上下文禁用、Tooltip、ARIA 和键盘按钮操作。标题为“测试 1”时仍显示 Archer 及提前 50%；倒计时名称为用户输入的“完全燃烧”时，独立保留速度模式、数值和 70 SPD。

## 5. 默认结算时机修改

统一 `operationDraft` 使全新普通草稿默认 postAction。带 ID 的旧操作继续保留显式 phase；旧操作未指定 phase 时，编辑草稿仍采用原有 preAction 语义。没有批量修改已有计划，原有引擎阶段解释不变。

战斗开始、事件触发的表单不出现阶段选项，构建操作时不写无效 phase。装备预设仍生成普通可编辑操作，保留明确 phase；没有明确阶段时沿用当前草稿阶段。空 ID 模板仍按新操作处理。

## 6. Site Messages 的最终目录与 Schema

```text
src/locales/
├── index.ts
├── types.ts
├── zh-CN.json
└── en.json
```

删除旧的两份 TypeScript 消息文件。保留 vue-i18n 11.4.14、legacy:false、默认 zh-CN，不新增国际化框架。关闭全局语言 fallback，遗漏由校验及现有缺失提示暴露。

`SiteMessages` 从 zh-CN JSON 推导；加载对象使用 `satisfies Record<ToolLocale, SiteMessages>` 约束结构。`MessageDescriptor` 是 key 加原始参数，参数支持字符串、数字、嵌套语义描述和带符号数值展示描述。它不是业务身份或计划字段，不追求动态 Key 的复杂类型体操。

保留合理的 site／home／ui／missing 消息，新增 planner.operationName、planner.metadata、planner.navigator、planner.target、planner.anchor、planner.accessibility 及少量 common 格式消息。创建类别和速度增减／修正方式使用完整独立模板，避免 TypeScript 重新拼接自然语言。

`npm run validate:i18n` 严格解析 JSON，借助现有 TypeScript JSON AST 检测重复 Key，验证嵌套结构、Key 集合、字符串类型、空翻译及插值参数集合。消息使用同版本 `@intlify/message-compiler` 实际编译，参数从编译 AST 提取，不把字面量当作插值。编译器此前为 vue-i18n 的传递依赖，本轮登记为精确版本开发依赖；没有增加生产端第二套翻译实现。校验失败退出非零，没有静默例外。

## 7. 已清理的硬编码双语逻辑

移除 naming.ts 的目标数量／范围、创建类型、操作及速度增减的中英文分支；移除 usePlannerPresentation 的已移除单位、战斗开始、回合及事件标题分支。

Inspector 的持续时间、倒计时及创建参数通过独立语义消息表达；共享语言按钮、品牌与页面标题、角色形态、槽位 ARIA、失效目标文案、队列进度和输入单位后缀也集中维护。数字格式统一使用 Intl.NumberFormat：AV 固定两位，SPD／百分比最多六位小数，内部值和计划不舍入。

最终搜索 Action Planner、views 与 App 中的 zh-CN／中文，只留下语言按钮的 Locale 身份判断和 BattleSetup 从官方中文快照写入稳定初始名称。这是数据归属，不是自行拼接双语 UI。诊断 Code、枚举、资源标识、用户输入及技术日志未作为 UI 文案迁移。

## 8. 自动命名如何与 vue-i18n 结合

`operationNameDescriptor` 和 `targetDescription` 决定语义 Key 与原始参数，使用现有执行时点目标解析。`renderMessage` 在 Presentation 层递归解析嵌套目标消息并格式化数字，再调用注入的轻量 t 接口。Vue Setup 从 useI18n 提供响应式 locale／t；纯模型不依赖组件实例。

自动名称随语言和官方角色名称变化重新生成，不写入计划。自定义名称 trim 后优先、空白恢复自动命名；用户实体和倒计时名称原样保留。官方角色名继续根据 character ID 从规范化双语快照读取。

语言切换测试同时确认 document、plan、result、draft 和操作执行上下文仍为原对象，确保展示切换不修改已提交操作或造成引擎／预览重算。

## 9. Stale tests 与新增验证

原命名单测中的多条中文／英文逐字断言替换为实际目标 ID／数量、语义 Key 与参数，保留创建类别、增减模式及单目标／动态目标覆盖。旧“零百分比无变化不显示”断言改为合法效果应显示。没有为每个 Message 添加逐文案测试，也没有大型 UI 快照或 CSS 断言。

新增 8 项测试：一项草稿默认／旧阶段兼容，两项立即行动 Trace 机制，五项消息、命名集成、响应式语言切换、结构化 Metadata 和标记语义。消息测试以一组故障样例覆盖重复、空值、缺失、结构／参数不一致及非法格式。

立即行动覆盖多目标、实际有效 SPD、零 AV 插队和原地无变化、下一回合关联、活跃目标排除、非法／缺失目标、失败回滚、克隆隔离、队列快照与消费。原有基础测试及 11 组迁移对照保留，总计 12 个文件、96 项测试。

## 10. 工程、构建和浏览器验证结果

| 检查                       | 实际结果                                             |
| -------------------------- | ---------------------------------------------------- |
| npm run type-check         | 通过                                                 |
| npm test                   | 96／96 通过，12 个文件，含 11 组迁移对照             |
| npm run lint               | 通过                                                 |
| npm run format:check       | 通过                                                 |
| npm run validate:i18n      | 两种语言的结构、Key、参数与格式通过                  |
| npm run validate:game-data | 98 角色、3 预设、101 图片；missing／diagnostics 为 0 |
| npm run build              | 通过，Vite 8.3.4                                     |
| git diff --check           | 通过                                                 |

环境 Node 24.21.0、npm 11.16.0。Vitest 在 Windows 沙箱临时缓存 rename 时遇到 EPERM，测试当时尚未执行；使用批准的沙箱外命令后全部通过，没有把环境错误计为功能失败。锁文件仍只有 package-lock.json，所有直接依赖保持精确版本。

最终构建主入口 JS 358.84 kB／gzip 97.61 kB，ActionPlannerPage 360.56 kB／gzip 86.53 kB，CSS 25.38 kB／gzip 5.95 kB。PrimeVue 的运行时主题样式不计入 Vite 静态 CSS 大小。

用户免去浏览器验收前，开发态 1440px 已通过真实表单配置 Archer／花火／流萤／知更鸟，面板 SPD 134／160／120／110；初始 AV 为 74.63／62.50／83.33／90.91。观察到推进／累计 AV 排序、新草稿动作后默认、自定义“测试 1”仍展示 Archer／提前 50%，以及花火施加提前、0% 延后和立即行动后，Archer 同一待行动显示三种标记，源节点只显示中性配置标记。

以上是中途开发态观察，**不宣称最终视觉或完整浏览器验收通过**。按用户要求停止后续浏览器操作；最终中英文外观、1024／390px、四按钮实际交互、头像 Tooltip／+N Popover 及生产静态 preview 的视觉验收由用户完成。没有将前一阶段的截图或浏览器记录当作本轮证据。

三个只读来源仓库的分支、HEAD 与空工作区状态均与开始时一致：

| 仓库              | 分支    | HEAD                                     |
| ----------------- | ------- | ---------------------------------------- |
| HSR-Database      | develop | 72c2d4d1b9ccc0fc0bb191d16ac29492750ea1b0 |
| TurnBasedGameData | main    | 312b4597691e0a29cf9828a15b592757dba86949 |
| StarRailRes       | master  | dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487 |

工具仓库维持 main／de44d1399a12134c3523ec0e9ff84c425ab18607，本轮改动仅留在工作区，未暂存或提交。

## 11. 已知问题与下一步

最终视觉验收留给用户，包括窄屏长标题与四按钮并排、多目标完整名单、各类创建／生命周期参数和中英文 Tooltip。相关配置和消息语义已有单测覆盖，但未将单测等同于视觉验收。

继续保留原有 Splitter 极短方向键可能不调整的已知限制。没有新增持久化、导入导出、角色技能自动化、多波次、伤害／能量或生产部署。后续如新增语言，应同时扩展 ToolLocale、消息目录及校验入口；修改措辞只需修改集中 JSON，不应要求重写业务测试。
