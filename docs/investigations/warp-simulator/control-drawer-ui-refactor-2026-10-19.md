# 跃迁控制 Drawer UI 重构实施报告

日期：2026-10-19。基线：`develop` / `ff5e0bb70ed73428f0b14f8bd5507ef8a92e2dc5`；开始时工作区干净。

## 修改

- 移除具体卡池 Select、独立 UP 详情及对应死代码／样式；新增 `WarpBannerList`，展示当前类别所有有效卡池。普通活动池仅展示一个五星和三个四星头像，Fate 不生成四星占位，常驻入口不伪造 UP。
- 整行按钮具有选中背景、边框、左侧强调及 `aria-pressed`。头像 Hover Tooltip、整行 Focus Tooltip 和双语 ARIA 提供名称及稀有度；继续使用 Presentation Adapter、既有头像组件及金／紫 Token。
- Drawer 内容使用局部 Pass Through 关闭默认纵向滚动；Tabs 至 TabPanel 逐层允许收缩，卡池列表独立滚动。底部保底／星缘／重置位于 Tabs 外，最大高度 65%，不足时内部滚动。
- 原样复用 `WarpPityPanel`。星缘已选名单改为七列正方形头像按钮，空名单改为整宽 Plus 入口；保留数量 Badge 和必要状态提示，删除抽屉修改按钮及重置下方会话说明。
- 沿用原 Drawer→Dialog 队列和确认／取消逻辑；恢复原触发头像，触发项被替换／移除时回退首个可用头像。
- 同步设计规范、跃迁架构及中英文消息，删除八个废弃翻译键。共享现有 Node 自定义渲染器，旧 Identity 渲染测试继续运行，未新增依赖。

未修改概率、引擎、状态转移、数据配置、Schema、Snapshot、Manifest、Source Lock 或游戏资源；未运行数据生成、联网拉取、分支切换、Commit、Push 或部署。

## 首轮重构验证

- 基线定向测试：控制面板、页面会话、星缘持久化共 54 项通过。
- 新增 10 项 SFC 渲染与页面接线测试：双语完整列表和选中、类别记忆、Fate／常驻／空列表、空入口、全部七个头像、取消草稿、确认后焦点回退、两种重置确认／取消、当前保底组及实际显示计数。
- 既有机制测试继续覆盖无效卡池过滤、切池不消费 RNG／不重播演出、资格不兼容与手动修复、localStorage 恢复／失败、重置保留名单及待兑现状态。
- `npm run type-check`、`npm run lint`、`npm run validate:i18n`、`npm run build`：通过。
- 全仓 `npm test`：55 个文件、766 项全部通过。
- 七项只读校验全部通过：`validate:game-data`、`validate:planner-templates`、`validate:warp-data`、`validate:warp-visuals`、`validate:currency-wars`、`validate:currency-wars-visuals`、`validate:currency-wars-crafts`。Warp 数据为 23 个有效 Banner，资源校验缺失数为 0。
- 全仓 `format:check` 未通过，唯一报告为未修改的 `scripts/warp-data/banners.jsonc`。该文件与 HEAD 相同，属于既存格式问题；遵守本轮数据边界，未改写或重新生成。变更文件定向格式检查及 `git diff --check` 另行通过。
- 沙箱默认临时目录曾使 Vitest 缓存重命名报 `EPERM`；仅为测试进程将 `TEMP`／`TMP` 指向 `.cache/warp-control-test-temp` 后正常运行，无需改动测试或生产配置中的缓存路径。
- Production Build 有 HiGHS 的 `node:module` 浏览器外置化、静态／动态导入重叠及构建计时提示；构建退出码为 0，本轮未修改相关模块。

## 独立滚动缺陷修复（同日）

本地人工反馈发现条目较多时卡池列表溢出。只读渲染探针确认，PrimeVue 4.5.5 的 TabPanel 为 Fragment 根组件，实际面板节点没有继承页面的 scoped 属性，原 `.warp-control-panel` 规则编译后要求该属性，因而未命中；缺少 Flex／最小高度约束使面板随内容撑高。先前页面测试替换了 TabPanel，未能覆盖这一组件边界。

本次将面板选择器改为 `.warp-controls :deep(.warp-control-panel)`，由控制区祖先限制作用范围；保留列向 Flex、`min-height: 0` 和 `overflow: hidden`，增加 `flex: 1`，移除面板 `height: 100%`。列表仍由 `.warp-banner-scroll` 独立滚动，底部控制区及其矮屏溢出策略不变。

移除页面接线测试中的 TabPanel 替身，继续使用真实 PrimeVue Tabs／TabPanels／TabPanel。Node 宿主仅增加 v-show 所需的内联 display 记录，不模拟布局。新增回归案例核对真实节点与编译后局部选择器匹配，覆盖 20 个条目、末项选择、类别切换、v-show 隐藏／恢复、类别记忆及底部位于 Tabs 外；该测试不证明实际滚动条或像素布局通过。

本次修复验证：

- 定向三个测试文件：30 项通过。
- 全仓 `npm test`：55 个文件、767 项全部通过。
- Type Check、ESLint、Production Build：通过；构建仍有前述 HiGHS 提示。
- 本次四个修改文件的定向格式检查和 `git diff --check`：通过。
- 未修改引擎、选择／保底逻辑、数据或资源；开始修复时已有的配置、快照及图片修改均保持原字节。未 Commit、Push 或部署。

## 已知限制与维护者验收

本轮未启动真实浏览器或执行截图、触屏、读屏与键盘自动化。Node 渲染测试挂载实际业务 SFC，其中 Tabs／TabPanels／TabPanel 使用真实 PrimeVue 组件，Button、Tab／TabList、Drawer、Dialog 及演出等浏览器交互使用替身，Tooltip 指令不执行。焦点测试验证页面恢复目标和浮层事件接线，不能证明真实 CSS 布局、Tab 键滚动、焦点陷阱或动画时序已验收。

请在本地 `/warp-simulator` 使用中文及英文检查：

1. 1440px、1024px、390px 和 390×667：卡池列表可独立滚动，标题／Tabs 与底部稳定；矮屏或放大字体下底部可滚动到两个重置按钮，无整体双重滚动、遮挡或异常背景块。
2. 同类多个卡池全部可见，四个头像同排完整、主次明显、选中整行醒目；类别返回记住选择。Fate 无四星占位，常驻无伪造 UP，光锥封面完整。
3. TabList 横向导航、按钮 Enter／Space、Tooltip 与焦点轮廓正常。逐个头像及 Plus 均打开同一个选择 Dialog；取消不提交，确认后恢复原头像，移除触发角色／从空名单确认时回退首个头像。
4. 不兼容资格可以手动修复；存储失败提示仍可见。刷新恢复名单，两种重置均保留名单，当前组重置保留历史、全部重置清空历史。
5. Drawer／Dialog 的 Escape、遮罩、焦点陷阱及恢复正常；切池不清空历史、不重播演出，历史 Drawer 和结果演出保持原行为。

## 仓库边界复核

三个来源仓库保持原分支、HEAD 和干净状态：

| 仓库              | 分支    | HEAD                                       |
| ----------------- | ------- | ------------------------------------------ |
| HSR-Database      | develop | `6fc8f53be3153743b1e69a8790e0a5ed1ad8d175` |
| TurnBasedGameData | main    | `312b4597691e0a29cf9828a15b592757dba86949` |
| StarRailRes       | master  | `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487` |

交付保留本轮未提交修改，停止并等待维护者本地 UI 验收。
