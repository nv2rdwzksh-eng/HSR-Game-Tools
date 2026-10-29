# Phase 1B-0：PrimeVue 组件库与设计系统验证

日期：2026-10-13，Asia/Shanghai。本轮完成独立 HSR-Game-Tools 的可交互 UI Prototype，停止于设计验证，没有进入完整 Phase 1B，也没有提交、推送或部署。

## 1. 结论与交付边界

**推荐正式采用 PrimeVue 4 Styled Mode + Aura 自定义深色金色主题 + Tailwind CSS 4 + Lucide 作为后续 UI 基础。**实际浏览器验证了双阶段工作区、Navigator／Inspector、速度编辑、浮层、双语与窄屏，基础控件不需要大规模内部 CSS 覆盖。

推荐有两项代价：比最小集成页增加约 399.34 kB JS（同口径 gzip 增加 84.97 kB），以及 Splitter 的短促键盘输入限制。正式 Phase 1B 应保留控件主题、复核键盘体验与移动端长表单，再接入真实计划提交。

| 层级         | 当前能力                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------- |
| 真实工程能力 | 固定版本组件库、自定义主题、双语 Router、规范化数据／图片、现有纯引擎、键盘和响应式布局   |
| 设计验证状态 | 战斗配置字段、有限角色 Dialog、节点选择、操作卡编辑／提交／删除、局部草稿                 |
| 尚未完成     | 操作写入 SimulationPlan、配置重算排轴、完整角色搜索、敌人、全量操作编辑、保存／导入／导出 |

入口 `/action-planner` 默认进入行动规划。页面明确标识 UI Prototype / Design Spike，固定引擎示例和原型操作都有独立提示。刷新重置局部状态。

## 2. 实际依赖与兼容性

所有远程核验、安装和审计通过系统代理 `127.0.0.1:7890`，没有修改全局代理配置。使用 Node 24.19.0、npm 11.17.0，满足现有 Node >=24.12、<25 要求；保留原有 `.nvmrc`。

| 新增直接依赖        | 精确版本 | 核验                                                        |
| ------------------- | -------- | ----------------------------------------------------------- |
| primevue            | 4.5.5    | npm `v4-stable`；不跟随 latest 5.0.2                        |
| @primeuix/themes    | 2.0.3    | Aura 与 definePreset 实际导出可用；依赖 styled ^0.7.4       |
| tailwindcss-primeui | 0.6.1    | Tailwind peer >=3.1.0；style 导出指向 v4/index.css          |
| @lucide/vue         | 1.55.0   | Vue peer >=3.0.1，sideEffects=false；使用的命名图标真实导出 |

Aura 导入为 `@primeuix/themes/aura`，主题工具从 `@primeuix/themes` 导入。主题包 latest 3.0.1 使用 styled ^1.0.0，本轮没有与 PrimeVue 4 混用。旧 `@primevue/themes 4.5.4` 被注册表标记弃用，未安装。依据：[PrimeVue 4 Styled Mode](https://v4.primevue.org/theming/styled/)、[Tailwind 集成](https://v4.primevue.org/tailwind/)、[PrimeVue 注册表](https://registry.npmjs.org/primevue)、[主题注册表](https://registry.npmjs.org/@primeuix/themes)、[Lucide 注册表](https://registry.npmjs.org/@lucide/vue/1.55.0)。

`npm ls` 证实主题、PrimeVue、core 与 styles 共用唯一的 `@primeuix/styled 0.7.4`。没有添加第二套组件库、PrimeIcons 字体、全局组件注册、全量 Lucide 图标对象或测试工具依赖。

安全审计对照原锁文件与新锁文件：两者均有 5 项 high 告警，来自既有 Sharp 和 ESLint 的 braces／micromatch／fast-glob 依赖链；新增 UI 包没有增加审计告警。`npm audit --omit=dev` 为 0。相关上游公告包括 [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)、[Sharp libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c)、[Sharp librsvg](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)。这不是“全项目没有安全问题”的声明；本轮按边界记录，未执行 audit fix 或擅自升级开发依赖。

npm 提示既有 esbuild／fsevents 安装脚本未被 allowScripts 覆盖；未批量放开脚本，实际构建、校验和测试均通过。

## 3. 主题、Tailwind 与图标

集中配置在 `src/theme/preset.ts`。Primitive 包含 gold／graphite 色阶，Semantic 负责 Primary、Surface、正文、边框、Focus、Highlight、输入与 Overlay；Component Tokens 仅调整 Button 圆角、Tabs 空间、ToggleButton 选中态及 Splitter 分隔柄。

最终页面色为 `#17191D`，次级 Surface 为 `#22252B`，小浮层为 `#2B2E34`，文字为 `#F1EEE7`／`#969AA3`，Primary 为 `#C9A86B`，边框为 `#3B4049`。提前／延后／友方为 `#5FA9E7`／`#E16B71`／`#67BD96`。Primary Hover／Active 使用 gold.300／200；选中背景为 10% 金色，Focus 为 2px、offset 3px，普通输入和按钮圆角 6px。Dialog 使用 graphite.900。

html 固定 `.app-dark`，PrimeVue 与 Tailwind 使用相同选择器；body Portal 实测继承暗色。CSS 引入 `tailwindcss` 和 `tailwindcss-primeui`，layer 为 `theme → base → primevue → components → utilities`；浏览器注入的 layer-order 与此一致。Preflight 不破坏控件，Utility 能调整 Tab 图标／文字布局，Selected、Focus、错误、Disabled 与浮层主题正常。

SelectButton 实际使用 ToggleButton，Aura 默认选中态是灰色；通过对应 dark Component Tokens 改为金色文字和透明金色背景，没有覆盖内部类名。InputNumber 的 aria-describedby 使用 Pass Through 传入真实 input，避免属性落在外层 span。

Lucide 常用 18px／线宽 1.75；紧凑标记 13–16px，事件图标 22–28px。ArrowUp／ArrowDown 表达行动变化，Gauge 表达速度，Timer 表达事件，Pencil／Trash2 表达编辑删除，ArrowLeft／Plus 表达返回添加。主要操作有文字，辅助按钮有 aria-label 与 Tooltip。详细约定见 [Design Notes](../design-notes.md)。

## 4. 组件、数据与交互

页面编排 Tabs 和响应式 Splitter；工具内仅拆分 BattleSetup、ActionNavigator、ActionInspector、OperationEditor 四个组件，复用现有 GameIcon。PrimeVue 负责基础交互，工具 CSS 负责空间、头像、行动和语义操作卡，没有新增共享 UI 包装库或层层 Card。

战斗配置默认使用现有快照的三月七·存护、布洛妮娅、符玄、花火；基础速度分别为 101／99／100／101，面板速度示例为 160／134／120／110。Dialog 提供 8 个真实快照角色。角色替换、速度、AV 范围和节点上限仅为局部 UI 状态；敌方区域保留合理空间和禁用入口。

固定 samplePlan 调用现有 simulatePlan，产生 14 个节点、0 诊断。包含开始时提前三月七 20%、延后符玄 15%、创建 90 SPD 一次性事件，以及三月七首轮行动后的布洛妮娅 +20 SPD／2 回合效果。这些是合成机制示例，不代表任何角色技能。前五个累计 AV 展示为 50.00、71.43、90.91、95.83、111.11，内部精度不变。

Navigator 使用稳定 NodeAnchor 键、真实头像和固定两位 AV；变化箭头读取 actionChanges Trace，只显示方向。选中节点有边框、勾选及 aria-pressed，友方有文字。长名称截断并保留 title，Inspector 标题允许换行。

原型操作单独使用 PrototypeOperation／PrototypeDraft；首个节点预置提前、速度、事件三类卡片，符玄节点包含延后卡片。**这些卡片不是 samplePlan 的可编辑副本，也不是引擎事件的提交结果。**展示层按类型组织数值、目标、阶段和生命周期，实体名称只出现一次。

Inspector 概览与编辑互斥。速度支持固定值／百分比、紧凑目标 Grid、回合或倒计时字段；提前／延后和一次性事件仅含最小示例字段。提交与删除只改变局部操作列表，不调用 replacePlan，不改变固定 AV。隐藏持续字段不进入已提交操作。

切换节点或工作阶段直接丢弃未提交草稿；取消编辑不修改已提交数据。输入有标签、校验提示与错误关联；编辑入口聚焦表单标题，退出编辑回到概览标题。用户自行输入的事件或倒计时名称不会被语言切换翻译。

## 5. Splitter、响应式与浏览器验收

桌面初始 35%／65%，最小尺寸根据工作区实际宽度换算，并包含 gutter 余量；Navigator 约 320px、Inspector 约 440px。分隔线低对比，拖动柄仅在中部可见。桌面两侧独立滚动；低于 960px 改为上下排列，列表最多 280px，Inspector 随页面自然展开。

没有回退到 CSS Grid：实际拖动、宽度约束、面板滚动和长英文名称均可用。PrimeVue 4.5.5 的 Splitter 键盘通过 40ms interval 响应，持续方向键实测改变宽度，极短的单击可能没有变化。这一限制在 README 明示；正式阶段需复核是否补充明确的键盘宽度入口或采用其他布局。

| 实际检查             | 结果与证据                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1440×1000 中文       | 双栏、三类操作卡、完整编辑视图正常；图片为本地 256px WebP                                                        |
| 1024×900 中英文      | 两栏可用；拖动改变宽度，最窄 Inspector 的类型按钮会换行，无内容横向溢出                                          |
| 390×844 中英文       | 上下布局、280px 列表、目标 Grid 和长英文表单可用；document.scrollWidth 等于 390                                  |
| 节点／草稿           | 修改数值和填写错误后切换节点，立即进入新概览；返回原节点仍为已提交值                                             |
| 取消／提交／删除     | 取消保留 +12%；倒计时、延后和新事件提交只更新卡片，首节点仍为 50.00；状态单测验证删除                            |
| 工作阶段／类型／目标 | Tabs 切换丢草稿；目标选中切换、速度／延后／事件字段真实更新                                                      |
| Tabs 键盘            | 左右键移动焦点，Enter 切换工作阶段；Tab 顺序可继续进入工作区                                                     |
| Dialog               | 居中、深灰背景；焦点进入关闭按钮，Shift+Tab 循环至末项；Escape 关闭并恢复打开入口；选择姬子更新头像和基础速度 96 |
| 输入／焦点／Disabled | 速度 0 触发 aria-invalid 与关联错误；Focus 清晰；敌方入口为真实 disabled                                         |
| 浮层／Layers         | Dialog 与全局 html 暗色一致；没有额外组件内部 CSS 覆盖；Tooltip 使用统一 Token                                   |
| 静态 preview         | `/action-planner` 深链接、图片、速度编辑和倒计时提交实际运行，固定 AV 不变                                       |
| 控制台               | dev 与 preview 检查均无应用 warn／error                                                                          |

截图保存在本地 `.cache/phase-1b/`，用于人工验收，不作为产品资源或像素测试基准：

- [1440px 中文概览](../../.cache/phase-1b/desktop-overview-zh.jpg)
- [1440px 中文编辑](../../.cache/phase-1b/desktop-editor-zh.jpg)
- [1024px 英文概览](../../.cache/phase-1b/desktop-1024-en.jpg)
- [1024px 战斗配置](../../.cache/phase-1b/setup-1024-en.jpg)
- [1024px Dialog](../../.cache/phase-1b/dialog-1024-en.jpg)
- [390px 中文概览](../../.cache/phase-1b/mobile-overview-zh.jpg)
- [390px 英文编辑](../../.cache/phase-1b/mobile-editor-en.jpg)
- [390px 战斗配置](../../.cache/phase-1b/mobile-setup-zh.jpg)
- [390px Dialog](../../.cache/phase-1b/mobile-dialog-zh.jpg)

验收采用 [verification 技能](/Users/wh3atl3y/.codex/plugins/cache/openai-curated-remote/vercel/0.54.1/skills/verification/SKILL.md)的完整流程思路：本地快照／头像 → 固定引擎 → Navigator → 局部操作状态 → Inspector。没有 API、数据库或外部游戏资源请求。

## 6. Bundle 与工程检查

先恢复原依赖并构建，再安装组件库；比较同机 Node 24 的 Vite 产物。下表按实际文件 bytes、十进制 kB 统计，gzip 使用 Python gzip level 9，前后口径一致；与 Vite 输出默认 gzip 参数可能略有差异。

| 构建项                  |  引入前 kB |  引入后 kB | 前 gzip kB | 后 gzip kB |
| ----------------------- | ---------: | ---------: | ---------: | ---------: |
| 入口 JS                 |     149.33 |     345.74 |      53.72 |      92.29 |
| ActionPlanner 懒加载 JS |      48.15 |     251.06 |      11.94 |      58.34 |
| NotFound JS             |       0.36 |       0.37 |       0.27 |       0.27 |
| **JS 总量**             | **197.84** | **597.18** |  **65.92** | **150.90** |
| **CSS 总量**            |   **8.50** |  **23.30** |   **2.65** |   **5.49** |

主入口增加主题 Preset 与 PrimeVue 配置／运行时，排轴 Chunk 增加基础控件、业务组件和少量图标。组件与图标使用命名导入，路由仍为懒加载；没有完整图标对象或重复 styled 运行时。Vite 处理 2127 个模块不等于把整个 Lucide 图标集合输出到 Bundle。

PrimeVue Styled Mode 动态生成样式：静态 preview 打开速度编辑时观察到 27 个带 data-primevue-style-id 的 style，共 86,721 字符，包括 Token 变量与控件样式。**这部分不计入 dist/*.css，而由 JS 中的主题／样式定义在浏览器生成；不能与 JS 体积再次相加作为独立网络下载。**上述 CSS 表是构建 CSS，不是完整运行时样式清单。未实测整套主题按路由拆分的收益，不宣称当前体积已经最优。

已执行并通过：

```text
npm run type-check
npm test                  # 11 文件，71 测试；原 67 项与 11 组迁移对照保留
npm run lint
npm run format:check
npm run validate:game-data # 98 角色、3 预设、101 图片；缺失和诊断为 0
npm run build
```

新增 4 项状态测试：切换节点丢草稿、取消不修改已提交数据及目标数组、仅解析当前持续方式、局部提交／删除不改变固定引擎计划或结果。没有组件快照、像素断言或逐文案测试。Node 工具 tsconfig 复用 env.d.ts，让新测试引用的 Vite 数据 adapter 获得 ImportMeta 类型；未修改引擎接口。

## 7. 已知问题、后续建议与边界核对

当前窄屏上下布局保留节点上下文，但编辑长表单时切换节点需要向上滚动；正式阶段可基于人工体验再讨论分视图导航。目标 Grid 的长英文名称可能截断，仍有完整可访问名称。桌面概览和编辑可能需要面板内滚动，属于预期行为。Splitter 短键问题与新增 JS 成本是本轮主要设计／工程代价。

建议正式 Phase 1B 继续使用统一 Preset、控件和语义卡片；先设计真正的计划提交／草稿适配边界，再扩展角色搜索、敌方配置和生命周期编辑。后续需重新验证完整业务流及相关开发依赖告警，不把本轮固定机制示例视为角色技能实现。

本轮开始／结束来源仓库保持以下分支、HEAD 与干净状态：

| 仓库              | 分支    | HEAD                                     |
| ----------------- | ------- | ---------------------------------------- |
| HSR-Database      | develop | 72c2d4d1b9ccc0fc0bb191d16ac29492750ea1b0 |
| TurnBasedGameData | main    | 312b4597691e0a29cf9828a15b592757dba86949 |
| StarRailRes       | master  | dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487 |

HSR-Game-Tools 保留 main 与 HEAD d3e93f66700d19593f854c4a57444643f7527af2；工作区仅保留本轮源码、文档和锁文件修改。引擎、规范化数据、资产、更新脚本及迁移期望没有改动。没有暂存、提交、推送、部署、域名配置或自动进入正式 Phase 1B。
