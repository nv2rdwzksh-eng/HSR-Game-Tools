# Phase 1M：跃迁控制间距与视觉资源同步

日期：2026-10-18（Asia/Shanghai）。仓库 HSR-Game-Tools，分支 develop，HEAD 为 `37d53b33bbf6744f978e3780c600fb99e0b61020`。本轮基于包含 Phase 1L 未提交实现、维护者 JSONC／Schema 和已更新 Runtime 的完整工作区；记录了起点 672 个文件的 SHA-256。未 Commit、Push、部署或联网获取数据。

本报告记录源码检查、Node 测试、资源校验和构建结果。间距问题来自维护者提供的截图，真实布局和交互仍待维护者验收；本轮没有执行 Computer Use、浏览器自动化或截图。

## 问题与修复

控制面板的 TabPanels 原本同时使用零 padding 和主题的较深 content 背景，而 Drawer 提供的是另一层 modal 背景。截图中因此出现贴边的深色内容区块；仅清掉内部 padding 没有明确建立标题、内容和底部操作的共同留白。重置操作区另有负水平 margin。

现在仅在控制 Drawer 根元素定义 `--warp-controls-inset: clamp(16px, 4vw, 20px)`，通过局部 PassThrough 设置 header 四侧、content 左右及底部 padding；content 顶部为零，避免重复计算 header 下方间距。390px 视口为 16px，宽屏上限为 20px。25rem 宽度及 100vw 上限不变。

Tabs 使用局部 Design Tokens 将 TabList／TabPanels 背景设为透明，Panel padding 保持零；导航按钮使用 Drawer 背景。删除重复的深层 Panel padding 覆盖，重置操作区水平 margin 改为零。Select、UP、保底、星缘、重置及说明由同一 Drawer 内容边界约束，标题采用同一留白。没有改变全站主题、历史 Drawer 或其他工具布局，也没有修改抽取、保底、存储、演出和焦点流程。

现行排版约定见 [UI 规范](../../design-notes.md#跃迁模拟器)。

## 资源刷新与全位置覆盖

起点 Runtime 已有 7 个有效 Banner、3 个共享池、104 件物品；Warp Data 校验通过，Manifest 仍有维护者保留的 5 项 pending。视觉目录却仍为旧的 86 件物品，校验报告 `Warp visual item inventory mismatch`。

缺失的 18 件为：新增星缘角色银狼、希儿、刃、符玄、云璃、银枝；新增 UP 角色绯英、千冶•刃；以及 10 张五星光锥。对应锁定索引及原图均存在，8 名角色的共享头像也已在本地规范化资源中登记。

本轮显式运行现有更新器，读取本地 StarRailRes 的锁定 Commit `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`，保持转换版本 3、Sharp 0.35.3 和既有参数。命令如下，路径以本机实际仓库位置替换：

```bash
npm run update:warp-visuals -- --source local --root "/absolute/path/StarRailRes"
npm run validate:warp-visuals
```

更新器同步 Warp 视觉 Catalog、Manifest 及自有图片，沿用原 staging、完整校验和目录发布流程。新增 18 张轻量图、18 张高清演出图，增加 8 项共享头像引用；既有命途、属性和星级资源复用。结果为：

| 项目           |   当前结果 |
| -------------- | ---------: |
| 可达物品       |        104 |
| Warp 自有图片  |        240 |
| 本轮新增图片   |         36 |
| 复用共享头像   |         38 |
| 自有图片字节数 | 49,132,712 |
| 缺失诊断       |          0 |

轻量资源为 123 张、9,984,084 bytes；演出为 114 张、39,119,260 bytes；裁切星级为 3 张、29,368 bytes。CLI 的 `newAssets: 240` 表示当前自有资源总数，本轮实际新增为 36 张。

控制面板、星缘选择 Dialog、结果、历史、详情和全屏演出继续共用现有 Presentation Adapter；新增角色拥有头像、轻量立绘、高清立绘及命途／属性信息，光锥拥有轻量／高清封面及命途信息。没有在各组件内复制映射、猜测路径或手工替换图片。视觉 Manifest 的 snapshotSha256 已与当前 Runtime 对齐。

资源维护约定与当前测量见[游戏数据指南](../../game-data.md#warp-展示资源)。

## 测试与工程结果

旧测试中存在将正式数据固定为 86 件物品、单 Banner、共享资格集合恰好七人的假设；13 名候选也被整体当作玩家七人选择提交。起点三个数据集成测试文件有 3 项失败。已将这些真实数据检查改为当前 Snapshot／Manifest 契约，并明确区分完整候选资格与测试专用的七人解析样本，不改变页面默认选择行为。

新增一项控制 Drawer 的局部间距／透明 Tabs 结构检查，确认历史 Drawer 不受同一设置影响；新增一项全部正式物品的双语 Adapter 覆盖及 Manifest 文件 SHA-256／字节数检查。已有真实 Resolver 检查现在遍历全部维护 Banner，核对原候选、UP、七人输入和 Snapshot 不变性。既有配置错误、来源、回滚、文件完整性和缺图校验继续保留。

| 检查             | 实际结果                                             |
| ---------------- | ---------------------------------------------------- |
| Warp 单元测试    | 19 文件、338 项全部通过                              |
| 全量单元测试     | 52 文件、735 项全部通过，含其他工具及公共测试 397 项 |
| Type Check       | Vue、TypeScript、脚本和测试通过                      |
| ESLint           | 全仓通过                                             |
| i18n             | 双语结构、键、参数、语法通过                         |
| Warp Data        | 104 件物品、7 个有效 Banner、3 个共享池，校验通过    |
| Warp Visuals     | 104 件、240 张自有图片、38 张共享头像，缺失 0        |
| 排轴资源校验     | 98 个角色、101 张资源，缺失及诊断为 0                |
| Currency Wars    | 快照、展示及配方校验全部通过                         |
| Production Build | 通过；Warp JS 120,130 bytes、CSS 18,524 bytes        |

Node 为 24.21.0，未安装或更新依赖。测试仅将该命令进程的 TEMP／TMP 指向忽略目录 `.cache/warp-phase-1m`，沿用此前解决 Windows 沙箱临时缓存访问问题的运行方式，没有修改生产或测试配置。构建保留原 HiGHS 的 node:module externalized 和静／动态导入提示。

## 数据保护与边界

原有 204 张 Warp 图片及其他共享图片合计 370 张，哈希全部与起点一致，没有删除或重新编码已有图片。新增的 36 张图片全部位于 `public/game-assets/warp/`，其他工具资源没有变化。

维护者 JSONC、Schema、Runtime Snapshot／Manifest、两个 Warp Source Lock、概率引擎、会话和星缘存储模块保持起点字节；没有重新生成 Runtime、调整卡池成员／UP／GachaID／资格／pending，也没有清除用户选择。此前 Phase 1L 的实现和报告按原工作区内容保留，本轮只增量修复控制面板。

三个只读来源仓库开始时均干净，分支／HEAD 为 HSR-Database develop `6fc8f53be3153743b1e69a8790e0a5ed1ad8d175`、TurnBasedGameData main `312b4597691e0a29cf9828a15b592757dba86949`、StarRailRes master `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`；收尾比对分支、HEAD 和干净状态均未变化。

最终相对本轮起点修改 14 个已有文件，新增 36 张图片和本报告；115 个配置／Runtime／引擎／其他工具等重点保护文件零变化，370 张原有图片零变化，本仓库分支及 HEAD 不变。13 个增量文本文件格式检查、5 份文档的 106 个本地链接／锚点检查、`git diff --check` 均通过；成功发布后没有遗留更新锁。所有改动保持未暂存状态，既有未提交内容没有恢复或覆盖。

## 人工验收

运行 `npm run dev`，打开终端实际地址下的 `/warp-simulator`，在中文／英文及 390px、1024px、1440px 宽度检查：

1. 标题、Tabs、Select、UP、保底、星缘和底部操作左右留白一致；内容区没有独立深色块，首个头像、分隔线及焦点环不贴边或被裁切。
2. 窄屏 TabList 可横向滚动，抽屉仍可纵向滚动；切换类别／卡池不清空保底或历史，不重播结果。关闭选择／重置 Dialog 后焦点按原流程恢复。
3. 星缘 Dialog 的 13 名当前候选均有真实头像；重点查看新增六名角色，确认、取消及刷新后选择保持原约定。
4. 三个角色活动池和三个光锥活动池的 UP 图片正确；常驻池没有 UP 容器。历史、详情和实际演出中的轻量／高清图片、命途及角色属性与同一物品匹配。
5. 模拟图片加载失败，确认中性占位和演出回退仍可用；这些真实请求、视觉及键盘／触屏效果不由 Node 测试代替。

当前只有三类实际配置，不为展示五个 Tab 添加 Fate Banner。没有发现缺失来源或剩余资源覆盖问题；真实视觉验收尚未完成。完成本轮后停止，等待维护者人工验收。
