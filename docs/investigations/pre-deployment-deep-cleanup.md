# 部署前深度清理与 Vercel 准备

日期：2026-10-14（UTC+8）。本报告记录本轮实际审查、修改和验证，不替代用户的 UI 人工验收或首次部署后的线上验收。

## 1. Executive Summary

- 清理前：独立仓库 `HSR-Game-Tools`，分支 `main`，HEAD 为 `5ec6180a52c15cd7cb78d7c5980349e6266b6e17`，工作区干净。
- 环境：Node.js `24.21.0`、npm `11.16.0`，符合 `>=24.12.0 <25`；使用已有 node_modules 和 package-lock.json，没有安装、升级或添加依赖。
- 仓库整体健康，未发现两套有效业务状态、废弃组件文件或需要重构引擎的明显技术债。确认的问题是少量旧包装、重导出、孤立类型、重复默认初始化、旧队列返回值、无效样式及废弃消息。
- 清理后仍保留 21 个测试文件、217 个测试用例，包括全部 11 组历史迁移基准；没有删除测试文件或用例，没有 skip、弱化断言或改写历史基准。
- 根目录已新增最小化 vercel.json，开发指南已补充 Vercel 准备说明。现有 Vue Router History、路由、Base URL、构建输出和 Node 约束保持不变。
- 生产构建成功，产物为 3,635,422 字节（约 3.47 MiB）；101 张 WebP 和公开第三方通知完整复制。未实施部署、域名配置、Git 暂存、提交或推送。

## 2. Dead Code 审查

### 审查方法与范围

阅读 AGENTS.md、文档导航、现行架构、开发指南、UI 规范和 Site Messages 规范，并核对 package.json、构建及测试配置。
审查覆盖 src 下的 engine、tools、views、components、data、locales、theme、assets，以及 scripts 和 tests。
结合 TypeScript AST、Vue SFC 脚本与模板、文本引用、运行入口和测试调用建立引用证据；没有将单次搜索未命中作为删除依据。

src 中 59 个 `.ts`、`.vue`、`.css`、`.json` 文件有 58 个可从 main.ts 的静态或字面量动态 Import 图到达。
剩余 manifest.json 由数据校验器通过文件路径读取，是必要的来源与哈希契约，保留。
两个动态路由入口分别加载 ActionPlannerPage.vue 和 NotFoundPage.vue，均保留。
脚本入口由 package.json 注册，更新器和 Benchmark 也属于维护能力，不能因无应用导入者而删除。

### 已删除或合并的内容

| 项目                                             | 删除或合并依据                                                                                    | 调用者与影响                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 工具层 effectPhase 包装及其 EffectPhase 导入     | 全部源码、脚本、测试及当前文档均无调用；运行路径直接读取操作阶段                                  | 无调用者；不改变阶段或旧操作默认语义                                             |
| 工具层 phaseOperations 重导出                    | 引擎和 Inspector 均直接使用引擎 effect-config.ts；旧工具路径无消费者                              | 正式函数保留，执行顺序不变                                                       |
| 工具层 targetIds 重导出                          | 旧路径仅被 effect-config 测试使用                                                                 | 测试改为直接导入引擎 targeting.ts，原断言完整保留                                |
| useActionPlanner 中重复的 emptyPlan 工厂         | 内容与 emptyDocument().plan 等价；emptyPlan 无外部或测试导入者                                    | 默认初始化统一使用现有文档工厂，保留每次创建独立对象和相同引擎默认值             |
| useActionPlanner 的 snapshot computed 及返回字段 | 页面、Session、Presentation 和测试均不读取该返回值；现行队列使用 currentQueueView                 | 不删除 SimulationResult.snapshots；beforeEffects 当前队列投影与 queueCursor 不变 |
| PlannerFile 接口                                 | 无模块内使用、类型导入、注册或测试消费者；解析边界使用实际严格校验与返回类型                      | 仅删除孤立类型，不修改文件 format、Version 或任何字段校验                        |
| `.camp-ally` 样式                                | 当前 Navigator 使用动态 `camp-dot-${nodeCamp(card)}`，旧文字 Class 无模板、属性透传或动态构造引用 | 阵营圆点、Tooltip、ARIA、颜色 Token 和当前布局保留                               |

未删除任何源码文件或组件文件。引擎源码、数学与事件调度实现没有修改；document-file.ts 仅删除未使用接口，持久化 Schema、迁移和执行逻辑保持原状。

### 保留项与容易误判的内容

- ScheduledEventDefinition、CycleAnchor、PlanEvent、AssetRecord 等类型虽没有模块外引用，仍用于当前模块内部类型结构，保留。
- usePlannerPresentation.catalog 虽非页面消费字段，仍被有效的轮次身份测试读取，并支撑标签、头像等派生逻辑，保留。
- reset API 仍被文档、轮次和持久化测试有效使用；页面的新建方案入口也继续保留。删除旧 reset 文案不删除重置能力。
- current-queue、presentation、naming、metadata 和 speed-modifier-tags 各自处理不同的时点或语义，没有合并成新的状态层。已有数字格式化入口继续使用，不改精度。
- JSON Version 1/2 → 3、旧 Anchor、稳定 ID 和冲突保留、资源诊断、坏存档字节保护、多标签页基线与 token 检查全部保留。
- 正式空模板目录、模板注册及加载验证、游戏快照、Manifest、Source Lock、图片、来源通知、第三方许可证和首页 warp/relic 卡片全部保留。
- `.camp-dot-ally`、`.speed-modifier-increase/decrease` 和 `.metadata-effect/identity` 由动态 Class 生成，不能凭无完整字面量引用删除，均保留。未发现需要删除的组件 Props 或 Lucide 导入，没有变更组件模板或主题。

### Site Messages

两种语言各由 277 个字符串 Key 清理为 268 个。删除列表完全相同，对照 HEAD 校验所有保留消息的值均未改变。

| 删除的 Key                               | 现行替代或删除证据                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| site.home                                | 首页路由与标题使用 home.title；路由 Meta 和 App 的回退均不使用此 Key                             |
| ui.reset、ui.resetConfirm                | 现行新建方案与确认使用 planner.files.new、replaceConfirm 等消息；无旧按钮或确认调用              |
| ui.completed                             | 现行进度使用 planner.navigator.queueProgress                                                     |
| ui.selected                              | 当前选择通过 Class、aria-current 和既有卡片描述表达，无消息调用                                  |
| ui.unavailable                           | 缺失目标使用 planner.target.unavailableName/unresolved；不可推演上下文使用 ui.contextUnavailable |
| ui.turnDuration、ui.actionCount、ui.once | 当前 Metadata 使用 planner.metadata.duration、actionLimit、once 等描述                           |

逐项核对了 `ui.${value}` 的操作类型、阶段、模式、持续方式、阵营、单位类别及目标范围，也核对了 `ui.path.*`、home.tools、planner.navigator、anchor、target、operationName、metadata、speedTag、files.status/error/resource 和模板注册消息。
这些动态消息均未按静态搜索结果盲删。未改有效中文文案，未重写英文翻译或产品名称。

## 3. Stale Tests 审查

按每个文件的用例、参数化输入、公开接口、断言和失败边界核对现行架构。下表为清理后实际执行结果，所有文件均归为 A：有效测试。

| 测试文件（tests/unit 下）                    | 用例数 | 保留的现行契约                                                         |
| -------------------------------------------- | -----: | ---------------------------------------------------------------------- |
| action-planner.test.ts                       |     14 | AG/SPD/AV、零 AV 批次、群体顺序、窗口与 Buff、预算、原子失败、稳定锚点 |
| action-planner-trace.test.ts                 |     10 | 实际执行速度、受影响行动、零 AV 刷新、失败不提交与 Trace 生命周期      |
| action-planner-participants.test.ts          |      9 | 动态单位、退出、创建顺序、倒计时、目标资格与原子提交                   |
| action-planner-aha.test.ts                   |     24 | 实时贡献排名、Aha 自身变速、生命周期、同 AV 顺序、预览和非法速度       |
| action-planner-cycles.test.ts                |     16 | MoC/AA 全精度边界、最低同 AV 优先级、预算、空队列及系统操作            |
| action-planner-effect-config.test.ts         |      3 | 操作窗口重排、阶段迁移与群体执行顺序；迁移导入入口并更新旧描述         |
| action-planner-participant-config.test.ts    |      4 | 草稿解析、隐藏字段、稳定身份、创建与触发时点资格                       |
| action-planner-speed-duration-config.test.ts |      2 | 选定模式校验、倒计时身份及编辑／删除后的引用保留                       |
| action-planner-presets.test.ts               |      4 | 普通预设操作、开始锚点资格及已移除速度阈值的回归保护                   |
| foundation.test.ts                           |      5 | 引擎隔离、规范化搜索、显示舍入、页面独立状态                           |
| migration-baselines.test.ts                  |     11 | 历史数学、顺序、诊断和原有 Trace 等价基准                              |
| game-data.test.ts                            |      7 | 快照／来源／图片哈希、SPD 投影、缺资源、更新回滚与并发锁               |
| planner-editor.test.ts                       |     22 | 单文档、草稿、操作 ID、目标预览、修复、命名；补强默认方案独立对象断言  |
| planner-document-file.test.ts                |     10 | Version 3 严格解析、资源、字段上限、身份、原子替换与原型名称           |
| planner-persistence.test.ts                  |      7 | 恢复先于 watcher、提交自动保存、坏存档保护、外部冲突及覆盖 token       |
| planner-localization.test.ts                 |      6 | 消息结构／插值、当前产品名、语言切换不重放及语义 Metadata              |
| planner-current-queue.test.ts                |     13 | 开始后与行动前状态、当前行动、倒计时、Trace、ARIA 和独立游标           |
| planner-cycles.test.ts                       |     12 | 轮次投影、失效修复、模式切换、Version 1 迁移、存档与模板               |
| planner-aha.test.ts                          |     15 | Version 1/2 迁移、Version 3 身份事实、冲突、编队 Apply、存档与本地化   |
| planner-speed-modifier-tags.test.ts          |     14 | 实际生效速度 Tag、生命周期、倒计时先后、回放与 Aha 自身效果            |
| planner-templates-enemies.test.ts            |      9 | 空正式目录、独立加载、失败原子性、敌方槽位与动态创建边界               |

### 修改、过时与重复分类

- 修改两个测试文件：effect-config 测试直接引用 targeting.ts，并将“旧 camp target 展开”描述改为当前实际验证的目标解析与群体顺序；所有原有断言不变。planner-editor 的既有默认初始化用例增加 plan、actors、events、aha、contributorIds 不共享引用的断言，保护合并工厂后的页面独立性。
- B 类：发现一条过时的测试描述，已更新；没有确认只验证已废弃行为的用例，所以删除 0 个测试文件、0 个测试用例。
- C 类：有跨层交叉覆盖，但未发现可安全合并且不损失独立边界的用例。例如引擎 cycle/aha 测试验证调度和速度，planner cycle/aha 测试验证导入、身份、草稿、存档及展示，不能按相近文件名合并。
- foundation 的负零／舍入、localization 的真实插值及语言切换、current-queue 的事件入口、speed Tag 的生命周期各有不同失败保护，继续保留。
- current-queue 中读取 Navigator 源码的用例仍保护当前阵营 Tooltip、ARIA 和导航要求；它属于有限的结构保护，不能代替真实 UI 验收，本次没有新增同类测试或快照。
- 没有新增测试用例；只补强既有用例。没有跳过关键测试、放宽断言、大量 Mock 或将契约测试改为 Smoke Tests。

另以 AST 对照 HEAD 与清理后的全部测试，912 个原有 expect 调用及其断言表达式均保留，新增 5 个独立引用断言。

### 11 组历史迁移基准

`natural`、`continuous`、`zeroRefresh`、`group`、`pre`、`post`、`finite`、`linked`、`independent`、`dynamic`、`trace` 全部保留并通过。
action-planner-cases.ts、action-planner-expected.json、ordinary-node.ts 和 phase-2a-document.ts 均保持原样。
既有基准对后来新增的 immediatelyAct 解释性 Trace 的筛选也未修改；原有数学、顺序、诊断和普通 Trace 比较继续保留，新增立即行动 Trace 的独立测试仍通过。

## 4. Vercel 配置

根目录 [vercel.json](../../vercel.json) 内容为：

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

已用 JSON.parse 与严格对象比较确认合法 JSON、根目录位置以及字段和 Rewrite 内容与任务给出的规范完全一致。
不存在其他 vercel.json 配置冲突，没有新增 Framework、Build、Output、Install、环境变量、Redirect、Functions 或域名设置。
Vue Router 仍使用 createWebHistory(import.meta.env.BASE_URL)，保留 `/`、`/action-planner` 和客户端 NotFound 路由；Vite 未设置新的 Base 或输出目录。

此配置准备将未命中的客户端路径回退到 index.html，应用仍是静态 SPA，无需服务端框架。
部署时由维护者选择 Vite Preset 和 Node.js 24.x，核实实际构建环境满足 package.json 下限。
开发指南已同步这些准备事项，AGENTS.md 未重复添加部署手册。

本轮通过指定代理尝试读取 [Vercel 的 Vite 文档](https://vercel.com/docs/frameworks/frontend/vite)，但 `127.0.0.1:7890` 无法连接；没有绕过代理联网，因此当前官网／远端 Schema 的实时核验为 Skipped。
配置结构核验依据附件指定内容，不能声称已在线下载 Schema 校验或验证 Vercel 实际路由。

**本地 Vite Build 成功不能替代 Vercel 线上路由测试。**首次部署后的首页、深链接、刷新及静态资源请求仍需用户在 `*.vercel.app` 地址验收。

## 5. 工程验证

清理前 8 项命令已建立通过基线，清理后的结果如下。Passed 仅指表中实际检查范围，浏览器和线上行为另列为 Skipped。

| 检查                               | 状态    | 本轮结果或原因                                                                                     |
| ---------------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| npm run type-check                 | Passed  | vue-tsc 与工具／测试配置 TypeScript 检查均通过                                                     |
| npm test                           | Passed  | 21 文件、217 用例通过；0 Failed、0 Pending；使用 default/json reporter，结果保存在忽略的 .cache 中 |
| npm run lint                       | Passed  | 全仓 ESLint 通过，未关闭规则                                                                       |
| npm run format:check               | Passed  | 按既有忽略规则的全仓 Prettier 检查通过；第三方说明仅修复引用句，不重排其现有表格                   |
| npm run validate:i18n              | Passed  | 双语结构、Key、插值参数和编译器语法通过；保留文案另与 HEAD 对照无变化                              |
| npm run validate:game-data         | Passed  | 98 角色、3 预设、101 资源，2,892,495 字节；missing/diagnostics 均为 0                              |
| npm run validate:planner-templates | Passed  | 0 个已审阅正式模板，空目录合法；加载、原子性及合成测试仍通过                                       |
| npm run build                      | Passed  | Vite 8.3.4 生产构建成功，2187 modules transformed，无大包警告                                      |
| vercel.json 本地结构核验           | Passed  | 合法 JSON，完整对象与任务要求相等，根目录配置无冲突                                                |
| 构建产物核验                       | Passed  | 公开资源逐字节一致，入口资源齐全；未发现本地文件路径或上游运行时引用                               |
| git diff --check                   | Passed  | 全部修改的空白与 Diff 检查通过                                                                     |
| 官网与远端 Schema 实时核验         | Skipped | 指定系统代理不可连接，未绕过代理                                                                   |
| 本地真实浏览器与 Vercel 线上验收   | Skipped | 按任务要求由用户执行；未安装或调用浏览器自动化工具，未部署                                         |

规划阶段首次沙箱内 npm test 在加载测试前被临时缓存文件 rename 的 EPERM 阻断，21 个文件均未进入断言执行，不能视为业务失败。
随后沙箱外重跑基线通过；本轮清理后的完整测试也在沙箱外运行并通过。没有修改 Vitest 配置或通过删除测试规避问题。

Prettier 仅对本轮实际编辑的源码、消息、配置和文档定向写入，未执行 npm run format。
现有调查报告、第三方许可文本及历史基准没有批量重排。

## 6. Production Build

### 产物结构与体积

| 类型               | 文件数 |    字节数 |
| ------------------ | -----: | --------: |
| HTML               |      1 |       458 |
| JS                 |      3 |   770,131 |
| CSS                |      1 |    33,213 |
| WebP               |    101 | 2,829,326 |
| 公开许可证通知 TXT |      1 |     2,294 |
| 合计               |    107 | 3,635,422 |

dist/index.html 正常生成，引用的主 JS 与 CSS 文件均存在。
JS 包含主入口、行动序列页面和 NotFound 页面，延迟加载结构保持原样。
最大两个 JS 分别为 397,729 和 372,027 字节；最大图片为 40,680 字节，没有明显的单资源异常体积或本轮新增大资源。
相较清理前的 3,636,114 字节减少 692 字节，没有开展额外 Bundle 拆分或体积优化。

### 完整性与隔离

- public 下全部 102 个文件在 dist 对应位置存在且逐字节相同，包含 101 张 WebP 和 public/third-party/lucide-github-LICENSE.txt。
- 游戏数据校验核对快照、Manifest、Source Lock、Overlay 哈希、资源清单、文件 SHA-256、实际 WebP 格式和尺寸，未发现缺失或额外资源。
- 检查 index.html 与全部 JS/CSS 产物，未发现 `C:/Users/`、转义 Windows 用户路径、`file:///` 或相邻上游相对路径引用。
- 由应用入口、Import 图、Vite 配置及 npm scripts 审查确认：正常构建使用仓库内规范化快照和 public 资源；原始解析及上游 Git 读取仅属于未执行的显式数据更新器。
- dist 不包含完整 StarRailRes／TurnBasedGameData 仓库。未移动、隐藏或改写上游仓库做隔离实验；“无上游运行时依赖”的结论来自代码与产物审查及实际正常构建。
- 没有清理游戏资源、来源锁、Manifest 或第三方通知；项目 LICENSE 和所有许可证文本均未修改。第三方说明只修复缺失报告引用，不改变来源、条款或已有发布待办。

Vercel 上仍需确认已有静态文件请求、SPA 深链接回退和刷新；未将本地 Vite Preview 的行为当作平台验收。

## 7. 部署前剩余事项与最终 Diff

### Blocking

在已执行的类型、单元测试、lint、数据、模板与构建检查中，没有发现需要修改业务语义的代码发布阻断项。
现行第三方说明已列出的静态产物通知缺口仍需在公开发布前处理，其他权利范围事项仍由维护者确认。这是既有待办，不是本轮清理引入的问题；本轮资源保留检查不代表这些发布条件已解决。

### Recommended

- 首次由用户创建 Vercel 项目时选择目标仓库、Vite Preset、Node.js 24.x，使用 npm 锁文件及 dist 输出，核实当前平台实际 Node 小版本满足项目下限。
- 首次默认域名部署完成后执行下节人工验收，特别是 `/action-planner` 直接访问、刷新和 JS/CSS/图片/许可证资源请求。
- 指定代理恢复后可补充官网／远端 Schema 实时核验；当前配置已经与任务指定标准内容一致，未为此安装 Vercel CLI。
- 原索引与第三方说明引用的 pre-production-license-notices-closeout.md 在开始时的 HEAD 和本地工作区均不存在；已改为现存第三方说明及其待办章节。若需要历史调查证据，应由维护者恢复原报告，本轮不编造或补写历史结论。

### Informational

- 正式配队模板目录为 0 是有意状态，不表示功能损坏；抽卡与遗器卡片仍为静态产品入口。
- 本轮没有发现新增的许可发布问题，不重做已完成的 MIT 许可调查；既有来源与权利边界仍由第三方说明管理。
- 自定义域名 tools.hsrarchive.cc、Dynadot DNS 和远程部署设置未配置；待默认域名首次部署成功后单独处理。
- 没有暂存、提交、推送、创建 Release、Vercel 项目或进行任何 Preview／Production 部署。

### 修改清单与边界复核

修改 11 个已有文件：main.css、两份语言目录、useActionPlanner.ts、工具层 effect-config.ts、document-file.ts、两个测试文件、development.md、investigations/README.md 和 third-party/README.md。
新增两个文件：根 vercel.json 和本报告。没有删除文件。
调查索引添加本报告入口并修复已有缺失报告链接，第三方说明的两处报告引用改为现有章节；既有历史报告内容未修改，没有重排第三方表格或许可文本。package.json、package-lock.json、路由、Vite 配置、组件模板、主题和引擎源码均保持原样。
全部源码删除均有上文引用证据，测试原断言与 11 组基准保留，没有扩大到数学、模型或 Schema 重设计。

上游开始时记录如下，最终只读复核确认三者的分支、HEAD 和干净工作区均与开始时相同。本仓库也保持原分支和 HEAD，只有本报告列出的未暂存修改与新增文件。

| 上游仓库          | 分支    | HEAD                                     | 初始工作区 |
| ----------------- | ------- | ---------------------------------------- | ---------- |
| HSR-Database      | develop | 0898487b3b048d9bd6af9d734208590deb38737a | 干净       |
| StarRailRes       | master  | dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487 | 干净       |
| TurnBasedGameData | main    | 312b4597691e0a29cf9828a15b592757dba86949 | 干净       |

## 8. 人工验收清单

由用户在本地和首次 `*.vercel.app` 部署后执行：

- 打开首页，检查工具卡片、图片和 GitHub 入口。
- 进入行动序列模拟器；直接访问 `/action-planner` 并刷新。
- 切换中英文，检查标题、错误提示、Tooltip 和数字。
- 配置角色与阿哈，确认基础速度、派生速度及速度 Modifier。
- 检查当前队列、未来行动、推进游标与 Inspector。
- 检查 JSON 自动保存、导入、导出与必要的替换确认。
- 检查移动端基础布局；在线确认 JS、CSS、图片和公开许可证资源可以访问。

本轮停止于代码、配置、验证和报告交付；上述人工与线上检查尚未执行。
