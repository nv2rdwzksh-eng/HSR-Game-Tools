# 货币战争 Astral UI 第一版迁移

> 历史记录：其中 Top-3、多方案接口、预算分割及旧 UI 描述已由 2026-10-20 单方案双目标重构取代；现行行为见[货币战争指南](../currency-wars.md)。原有测量与提交信息保留为历史证据。

日期：2026-10-19。改动保留在本地，未 stage、commit、push、创建 PR 或部署。真实浏览器和视觉效果尚待维护者人工验收；以下自动检查不代表视觉验收已完成。

## 实现

- 配置与结果各使用一个浅色 HPanel；左侧「目标任务／设置」Tabs，25 个带图标的 Switch 默认全部开启，纵向滚动和上下渐隐，删除旧任务弹窗及确认草稿。
- 数量滑块允许 1～13 槽、12～39 枚星徽，默认 13／18；专家 Checkbox 默认关闭。网页每次构造请求固定 60 秒，从表单及校验中移除时间字段；低槽位正常提交。
- 多候选使用 Tabs／TabPanels，关闭结果切换动画，单候选隐藏切换栏；每个候选的阵容、Badge、任务、星徽、配方及成员整体切换并关闭旧详情。
- 星徽配方仍来自原目录，多个配方保留「或」，无配方为 `—`，没有材料合计。已激活羁绊直接展示，成员逐条默认折叠，展开显示带姓名访问方式的头像。
- 删除普通页面的求解诊断详情，保留底层字段及未证明最优、错误、取消、过期、历史结果和特殊角色说明。算法、Worker 架构、游戏规则及快照不变。
- 保留角色卡的 PrimeVue unstyled Button、详情 Dialog 和 Tooltip，继续使用成熟的模态、焦点和浮层行为；配置与普通结果反馈使用 Astral UI 或语义 HTML。Dialog 根及遮罩显式标记局部主题，关闭按钮使用局部 Token。
- 中英文界面和辅助标签同步更新，游戏专名继续使用既有中文快照。桌面左栏 340px，960～1099px 为 300px，低于 960px 上下排列。

## Astral UI 接口及依赖

实际来源为用户 fork `Oereor/astral-ui` 的 `main`，基础 Commit `0dce0fad3bc993708d62598e315210adbcfb7373`，另含本轮未提交扩展：

| 组件／入口         | 兼容扩展                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| HSwitch            | 可选 `#icon` 前置装饰插槽，保留文字标签与布尔模型                                                     |
| HSlider            | `decrementLabel`、`incrementLabel` 本地化；`inputId`、`inputAttrs` 关联真实输入的 ID、ARIA 与错误提示 |
| HTabs              | 可选 `idPrefix` 生成 tab ID 和 aria-controls                                                          |
| HTabPanels         | 同名 `idPrefix` 关联 tabpanel；`animated=false` 关闭切换动画，默认行为不变                            |
| `components`       | 无全局主题副作用的组件入口，默认入口继续加载旧主题                                                    |
| `scoped-theme.css` | 仅作用于 `.h-theme`，低优先级选择器、局部滚动条／字体／焦点及 Reduced Motion；不请求缺失字体          |

工具依赖 `file:vendor/astral-ui`，源码和 npm 锁文件纳入版本管理，Vue 为 peer dependency。无需相邻仓库、未提交的 dist 或安装时构建。来源声明保留，不为第三方新增许可证。

`vendor/astral-ui/provenance.json` 保存 Commit、文件清单和 SHA-256；`local-changes.patch` 保存基础 Commit 上已有文件的修改，新增源码也保存在快照中。因此必须同时保存来源记录和快照，不能只记录 Commit。

后续在 fork 完成组件、文档和测试更新后，显式执行：

```bash
npm run sync:astral-ui -- --source /path/to/astral-ui
npm run validate:astral-ui
```

同步不进入普通安装、开发、测试或构建流程。工具仓库的格式和 lint 排除 vendor 原始源码，由 fork 自己的检查负责。

## 两仓文件变化

| 仓库           | 文件组及用途                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HSR-Game-Tools | `CurrencyWarsPage.vue`、`CurrencyResults.vue`、新增 `CurrencyCandidateResults.vue`、`CurrencyEmblemDemand.vue`、`CurrencyImage.vue`、新增 `ui/theme.css`：页面、结果及图像适配        |
| HSR-Game-Tools | `ui/session.ts`、`validation.ts`、CLI 帮助文字：网页默认值／校验及共享槽位范围；删除 `ui/task-selection.ts`。CLI 的预算／时间默认值与通用预算上限不变                                 |
| HSR-Game-Tools | `package.json`、锁文件、`vendor/astral-ui/`、新增 `scripts/ui/sync-astral-ui.ts`、格式／lint 配置：可复现源码依赖和来源校验；`src/assets/main.css` 仅新增 vendor 的 Tailwind 扫描排除 |
| HSR-Game-Tools | 双语 JSON、`vitest.config.ts`、现有货币战争测试、新增 Node 渲染器及 `currency-ui-render.test.ts`；当前指南、设计规范、调查索引和本报告                                                |
| astral-ui      | 四个扩展组件、`src/lib/index.ts`、新增 `src/lib/components.ts` 和 `scoped-theme.css`；Demo 和三份组件／接入／主题文档                                                                 |
| astral-ui      | package／锁文件、TS／lint／忽略配置、新增 `vitest.config.ts`、`tests/components.test.ts` 及 Node 渲染夹具：将组件测试纳入可追踪和检查范围                                             |

## 已执行验证

使用 Node 24.19.0（符合项目要求），未升级工具仓库原有直接依赖。基线为工具 Commit `f6149e1366bea5d147afe6b93acada5d3a4e8564`，基线 767 项测试通过。

| 检查                                            | 结果                                                                                                                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 工具 `type-check`、`lint`、`validate:i18n`      | 通过                                                                                                                                                              |
| 工具完整 `npm test`                             | 56 个测试文件、784 项通过；含 134 项货币战争测试                                                                                                                  |
| fork `npm run check`                            | lint、全仓格式、类型与库构建通过                                                                                                                                  |
| fork `npm test`、`build:example`                | 5 项组件测试和 Demo 构建通过                                                                                                                                      |
| 工具 `build`                                    | 通过；仅保留基线已有的两条 HiGHS 打包警告                                                                                                                         |
| 根路径、`/hsr/` 构建及 Worker/WASM 探针         | 均通过；真实 WASM 在隔离 Node VM Worker 中运行，返回三个已验证候选，不启动浏览器                                                                                  |
| `validate:currency-wars`／`-visuals`／`-crafts` | 通过；78 个形态、33 羁绊、22 星徽，18 条配方、11 种材料，材料图无缺失                                                                                             |
| `validate:astral-ui`                            | 文件清单与哈希通过                                                                                                                                                |
| 无相邻仓库的独立临时副本                        | 从空 node_modules 执行 `npm ci --offline`、来源校验及构建成功；不依赖开发机绝对源码路径                                                                           |
| 主题隔离                                        | 源码测试检查每个局部主题选择器都有边界。基线独立构建与当前的公共 CSS、跃迁页面 CSS 均逐字节相同；32 张羁绊图片的有效像素检查均为单色，滤镜仅按 trait 图片种类应用 |
| 全仓 `format:check`                             | 未通过的唯一文件为原有 `scripts/warp-data/banners.jsonc`；当前文件与 HEAD 对象哈希相同，基线副本也复现此失败。未顺带格式化此游戏数据输入                          |

本轮修改文件的定向格式、文档链接与 `git diff --check` 另行核对；没有通过修改无关数据来消除格式告警。

只读来源保持原分支、HEAD 和干净状态：HSR-Database `develop / 6fc8f53be3153743b1e69a8790e0a5ed1ad8d175`；TurnBasedGameData `main / 312b4597691e0a29cf9828a15b592757dba86949`；StarRailRes `master / dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`。

## 本地视觉验收

在工具目录运行 `npm run dev`，按终端地址打开 `/currency-wars`。完整清单见[当前指南](../currency-wars.md#网页人工验收)。重点检查：

- 1440／1024／390px 的面板比例、13 人网格、长名称、任务滚动渐隐和窄屏配方换行。
- 两种语言、25 项任务映射、页签配置保留、边界值、取消与重新求解、多个候选整体联动。
- 成员默认折叠、头像身份、角色详情的 Tab／Escape／焦点恢复、弹窗滚动和 Reduced Motion。
- 费用背景、彩色星徽／材料保持原色；羁绊图标变深后的对比度。当前缺少可用 Astral 字体文件，局部主题使用系统字体回退。
- 访问优化器后返回首页、行动序列模拟器和跃迁模拟器，确认样式与交互正常。CSS 字节比较不替代此项真实交互验收。
