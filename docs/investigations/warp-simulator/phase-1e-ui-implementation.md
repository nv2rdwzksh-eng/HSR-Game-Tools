# Phase 1E：跃迁模拟器 UI 实施

日期：2026-10-15（Asia/Shanghai）。仓库 HSR-Game-Tools，分支 develop，实施基线 HEAD 为 `2e63a96edd3e51b32d276fb97255795b06bcc4b8`，开始时工作区干净。现行契约见[跃迁架构](../../architecture/warp-simulator.md)，视觉规则见[UI 设计说明](../../design-notes.md#跃迁模拟器)。本报告记录代码、测试及构建证据，不代表维护者已完成真实浏览器验收。

## 页面结构与主要交互

新增懒加载 `/warp-simulator`，首页 Warp 卡片正式开放，页面标题与首页名称一致。现有排轴路由和源码保持不变。

Warp 专属文件均位于 `src/tools/warp-simulator/`：

- `WarpSimulatorPage.vue`：Banner 与抽取控制、左右布局、最新批次、状态提示及重置确认。
- `components/`：`WarpPityPanel`、`WarpSelectionDialog`、`WarpResultCard`、`WarpHistory` 和共用的 `WarpItemVisual`。
- `composables/`：`useWarpSimulator` 管理页面业务动作，`useWarpPortrait` 管理图片加载失败。
- `model/`：可解析 Banner 预检及纯展示 Adapter；`data/adapters/warp-data.ts` 加载本工具数据，`data/presentation.json` 保存薄展示映射。

桌面 ≥1040px 使用约 40%／60% 双栏，左侧至少 320px；更窄时上下排列。左侧为 Banner、当前 UP、四行保底、星缘相邀和单抽／十连操作，右侧为最新结果与历史。没有新增 UI 框架、全局业务 Store、宽泛 PrimeVue 覆盖或新的主题颜色。

Banner 来自 Snapshot，只有能通过现有 Resolver 的配置才显示。角色预检使用一次性合法验证样本检查完整配置；该样本不保存为选择、不用于抽取，页面初始七名选择为空。Manifest 仍为 incomplete 不会禁用已经配置的真珠 Banner。

星缘采用已确认的可搜索头像网格 Dialog，支持中文、英文、ID、七名上限和计数提示。候选来自对应共享五星资格集合，只有七名不同且合法的 ID 才能确认；已选项始终允许取消选择。Dialog 草稿取消不提交，确认后只影响之后的抽取。只有合法集合含有 UP 时才能将其选入；没有把真珠加入当前人工七名名单。

四行保底直接映射当前组的引擎状态。小保底使用 secondary Tag 与灰色勾，大保底使用 success Tag 与绿色勾；Ordinary／Fate 不适用的标志显示“不适用”。四星计数 9 显示 9+ 和待兑现说明，避免将五星挤占后的饱和值称为精确累计抽数。

## 单一会话、抽取、历史与重置

`useWarpSimulator({ snapshot?, rng? })` 默认使用实际 `Math.random` Adapter，测试可注入 Snapshot 和确定性 RNG。每个页面实例各自初始化，未使用 localStorage、sessionStorage、IndexedDB、文件、网络或模块级业务单例。

一个已提交 `shallowRef<WarpPageSession>` 保存引擎 Session、历史和最新批次身份。按钮调用 Phase 1D 的 `pullOnce`／`pullTen`，成功后一次替换整个会话；失败只发布语义诊断，已提交对象、保底、最新结果和历史保持原样。防重入锁持续到当前 Vue 更新完成，期间切池、选择及重置同样受保护。锁不依赖动画完成。

历史条目只增加递增 ID 与批次 ID，原始 PullEvent 保持只读。历史最新优先、最多 1000 条、每页 25 条；新抽取回到第一页，裁剪不重新计算保底。最新批次由同一历史派生为原始顺序，单抽一张、十连十张，不按稀有度排序。

UP 使用事件的 `isUp`，Banner 来源使用事件保存的 ID，模型与 `pityBefore` 保留于事件。五星记录显示“当次五星保底抽数”，来自抽前计数加一，不将重置前后的历史强行串成一个连续周期。语言、切池、选择、搜索、分页和动画都不会重新抽样或重新判定以前的 UP。

重置规则按维护者确认实施：

- 当前保底组：只清零当前 `pityGroup` 的计数与保证，影响同组 Banner；保留其他组、全部历史、最新结果及选择。
- 全部会话：清空五组保底、历史和最新结果，保留当前 Banner 与各 Banner 已确认的选择。
- 两者均先展示确认 Dialog，取消不提交；条目和批次 ID 在页面内不复用。
- 刷新或离开页面后实例销毁，所有会话与选择清空，界面有明确说明。

## 结果、资源与可访问性

单抽显示较大卡片；十连用八列 Grid 的双列跨度构成 3–4–3，≤640px 两列。每张显示序号、名称、星级文字、命途、角色专属属性及事件 UP。五星金色、四星亮中性色、三星弱化；稀有度同时通过文字表达。

只在新批次的稳定 key 挂载结果卡时执行 180ms 淡入／上移 7px，逐张间隔 50ms。reduced-motion 关闭动画；语言、切池及历史分页不更换结果 key，不参与业务转移。

当前 30 个角色的命途及已有 256×256 头像从本仓库规范化资料一次性投影。来源为：

| 项目                    | 固定身份                                                           |
| ----------------------- | ------------------------------------------------------------------ |
| 本仓库 Commit           | `2e63a96edd3e51b32d276fb97255795b06bcc4b8`                         |
| 来源文件                | `src/tools/action-planner/data/game/catalog.json`                  |
| 来源 SHA-256            | `921853d55ce60a03b928edaa85cd7f61ba9840cfbc83f226211550e1a226e828` |
| StarRailRes 来源 Commit | `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`                         |

映射仅含 path 与已登记 portraitPath，记录于独立 presentation.json，不改写 Warp Snapshot、维护 Catalog 或共享候选。图片以 BASE_URL 和安全相对路径组合，运行时不导入排轴内部模块、不猜测 URL、不读取上游仓库。没有新下载、复制或生成任何游戏图片。

角色属性以及光锥命途／图片仍缺少可靠展示来源，使用“—”和统一 UserRound／BookOpen 占位；光锥不显示属性。实际图片加载失败复用同一占位，换成其他已登记图片时可以重新加载。头像不冒充完整角色立绘，未引入完整数据库。现有第三方资源通知与权利边界不变。

所有新增文案在 `warp.*` 中提供中英文；首页简介不再承诺未实现的统计。使用 PrimeVue Dialog 焦点管理、搜索 InputText、带 label 的 Checkbox，说明通过 `pt.input` 关联实际 Checkbox input；辅助分页按钮有 Tooltip 和 aria-label，图片与星级有可访问名称。仅播报简短的结果完成或选择数量，历史列表不放进 live region。焦点、键盘与实际窄屏表现仍需人工验收。

## 本地验证与数据保护

环境为已有 Node 24.19.0、npm 11.17.0 与已安装依赖。新增 3 个测试文件、39 项针对性 Node 测试，没有引入浏览器或新的测试框架。

| 检查                         | 实际结果                                                                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新增 UI 状态／展示测试       | 39 项全部通过：真实 2139、incomplete、空／错误 Banner、选择与取消、UP 重叠、单抽／十连、顺序、重入、五组隔离、同组继承、9+、历史身份、语言与 RNG、两种重置、失败原子性、容量／分页和图片降级 |
| `npm run type-check`         | 通过，包含应用和测试；保留原 TypeScript 配置                                                                                                                                                 |
| `npm run lint`               | 通过                                                                                                                                                                                         |
| `npm run validate:i18n`      | 通过，结构、键、插值参数及编译语法一致                                                                                                                                                       |
| `npm test`                   | 33 个文件、491 项全部通过，包含原有 452 项与新增 39 项                                                                                                                                       |
| `npm run validate:warp-data` | 通过，86 items／1 sharedPool／1 readyBanner／5 pending，仍为 incomplete                                                                                                                      |
| `npm run validate:game-data` | 通过，98 角色／3 预设／101 图片，missing／diagnostics 均为零                                                                                                                                 |
| Production Build             | 通过，2223 modules；额外使用 `--manifest` 检查产物依赖关系                                                                                                                                   |
| 代码分割                     | Warp 与排轴均为独立 dynamic entry；首页静态图不含 Warp 引擎／快照，Warp 不静态导入排轴页面                                                                                                   |
| 资源完整性                   | 实施前记录的 179 个受保护文件哈希一致；102 个 public 文件逐字节复制到构建输出                                                                                                                |

最终构建 Warp JS 为 `WarpSimulatorPage-DAZ7g3v2.js`，55,565 bytes（gzip 约 16.67 kB），独立 CSS 约 9.92 kB。新增页面与排轴共享既有 PrimeVue 组件后，构建器抽出公共组件 chunk；排轴产物名称／大小变化不代表排轴源码被修改。首页静态依赖图仅包含入口及共享框架 chunk，不包含两个工具页面；Manifest 只存在于忽略的 dist 中，没有更改构建配置。

真珠仍为 `gacha:2139`、`avatar:1503`、`event-avatar-default`，现有七名角色须明确选择后才能抽取。已审阅名单、概率引擎、维护脚本、排轴源码／数据／图片、依赖及锁文件均保持原字节，没有执行真实数据生成器或更新器。全量测试中的维护管线仅操作临时夹具。

三个只读来源在开始和收尾核对分支、HEAD 及干净状态：

| 仓库              | 分支    | HEAD                                       |
| ----------------- | ------- | ------------------------------------------ |
| HSR-Database      | develop | `0898487b3b048d9bd6af9d734208590deb38737a` |
| TurnBasedGameData | main    | `312b4597691e0a29cf9828a15b592757dba86949` |
| StarRailRes       | master  | `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487` |

收尾时 HSR-Database 与 TurnBasedGameData 仍干净；StarRailRes 相对开始时新增未跟踪的 `.DS_Store` 与 `image/.DS_Store`，HEAD 与分支未变。本轮没有写入来源仓库，已保留这两个系统文件，没有清理或重置它们。

现行架构、UI、数据、Site Messages、开发入口及 README 已同步；历史 Phase 1D 报告未改写。定向格式检查、9 份文档的 116 个本地链接／锚点、16 个新增文件及 `git diff --check` 均通过。没有联网、浏览器自动化、Stage、Commit、Push、部署或触发 GitHub Actions。

## 建议人工验收

1. 启动本地开发环境，从首页进入 `/warp-simulator`，直接访问并刷新路由；排轴入口保持可用。
2. 在 1440／1024／390px 和两种语言检查分栏、长名称、弹窗及横向溢出；当前卡池为真珠，初始抽取按钮禁用。
3. 仅用键盘打开星缘 Dialog，测试中英文搜索、七项选择、取消／确认、Escape 和返回焦点；确认不会自动选择角色。
4. 单抽与十连，核对结果数量、十连 3–4–3／两列顺序、UP、命途、属性占位及头像／光锥占位。连续操作不等待动画，切换语言不重复抽样。
5. 观察四行保底、绿色／灰色保证标记和 9+ 状态；十连各项保留实际顺序，历史为相反的最新优先。
6. 分别取消并确认两种重置，核对当前组保留记录、全部清空记录、两者保留选择；再抽取后记录身份继续递增。
7. 累积多页历史，检查分页与最近 1000 条限制；模拟图片加载失败、开启 reduced-motion，检查安全占位和无入场动画。
8. 离开页面再返回，确认本页会话清空；回到排轴检查现有配置、存档和主要操作未受影响。当前真实数据只有一个 Banner，多池继承与 Fate／Ordinary 行为已有合成数据单元测试，不能据此宣称完成真实多池人工验收。

## Phase 1F 待办与停止点

等待维护者本地视觉、焦点、键盘和响应式验收。未来阶段再决定存档／文件格式、导入导出、统计图表、完整资源及复杂演出；更多真实 Banner 仍需单独人工维护。未自动进入 Phase 1F，修改保留在 develop 未提交工作区。
