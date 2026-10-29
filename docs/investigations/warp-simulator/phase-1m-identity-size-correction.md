# Phase 1M：Identity 显示尺寸修复

日期：2026-10-19（Asia/Shanghai）。HSR-Game-Tools，develop，起点 HEAD `a40369dcab23ac6420b19ee8cf06bf5a0151eb1f`，工作区干净；实施前记录了 730 个已跟踪文件的 SHA-256。本报告补充 [V3 动画报告](phase-1m-five-star-reveal-animation.md)，保留原报告作为历史证据。

## 原因与修复

上一轮把“原始大小”理解成了原图分辨率，用 revealPathIcon.width 除以 57% 约束画布。当前九种命途高清图均为 512×512，因此画布上限仍约 898.25px；390px 宽视口扣除原有左右留白后只有 342px，画布已经受可用宽度约束，修改这个上限不会使其缩小。此前只检查公式是否写入源码的断言没有验证显示尺寸，无法捕获这个问题。

维护者本轮确认目标为 V3 之前的 **160px CSS 显示上限**。现在 [WarpRevealIdentity](../../../src/tools/warp-simulator/components/WarpRevealIdentity.vue) 只使用固定的 IDENTITY_PATH_MAX_SIZE 160 和 IDENTITY_PATH_FRACTION 0.57，将实际渲染的 `--identity-canvas-max-width` 设为约 280.701754px。画布宽度取可用容器宽、容器高按 807:594 换算的宽度和该上限的最小值。原图分辨率、DPR、元数据缺失或资源回退都不再扩大画布。

命途仍占画布宽度的 57%，普通星占 14.5%、中央星占 34%，全部位置保持 V3 百分比。空间充足时的布局基准尺寸如下；原有短暂动画缩放关键帧保持不变：

| 元素       | CSS 布局尺寸上限 |
| ---------- | ---------------: |
| 整组画布宽 |         280.70px |
| 命途图标宽 |            160px |
| 普通星宽   |          40.70px |
| 中央星宽   |          95.44px |

极窄或低高度容器仍可让整组进一步缩小。没有分别限制星图尺寸，也没有按命途种类改变绝对大小。图片组件、六图就绪聚合逻辑、1100ms 状态机、关键帧、队列、跳过、Reduced Motion、最终 Artwork 和信息面板均保持原行为；没有修改或生成图片、Catalog、Manifest、Runtime、Banner、星缘存储或引擎数据。

## 实际组件回归测试

新增 [reveal-identity-render.test.ts](../../../tests/unit/warp-simulator/reveal-identity-render.test.ts)，通过 Vue createRenderer 在 Node 中挂载真实 WarpRevealIdentity 和 WarpRevealImage，记录实际输出的 class、style、图片 URL 与事件。测试不把生产组件替换为 Stub，也不加载网络图片或启动浏览器。

Vitest 配置保留全部原 Node 测试，并为该挂载测试增加独立 identity-render 项目：使用已有 Vue 插件编译普通客户端 render 函数，再交给 Node 自定义 Host。测试专用 Environment 不提供 DOM 或浏览器进程；测试类型声明仅用于 Node 的 tsc 识别 SFC 导入。没有增加依赖、应用 SSR、生产入口或运行时尺寸测量监听器。

新增 10 项测试覆盖：

- 全部九种命途 × 512／256px／缺失高清元数据 × DPR 1／2／3，共 81 组挂载，逐项断言实际画布参数为约 280.70px，并检查 Adapter 图片 URL 和没有独立图片像素尺寸限制。
- 390×844、1024×768、1440×900 三种场景，以及 248×844 极窄、844×188 低高度场景。根据实际渲染的上限、正式 CSS 约束及既有 Overlay 留白计算尺寸，验证前面三档命途为 160px，后两档约为 114px／77.44px。
- 五颗星的实际渲染数量、百分比宽度及中心位置，以及普通星／中央星相对命途的比例。
- 真实组件图片 error／load 回调：高清命途→轻量→占位、四颗星加载后等待最后一颗、最后一颗失败后完成六图就绪，以及开始动画和等价元数据更新前后画布上限不变。
- 正式 CSS 的 min() 约束与命途 57% 宽度仍连接到实际渲染参数，且不再读取 revealPathIcon.width 决定布局。

这些测试验证组件输出和尺寸约束的数值结果，没有执行浏览器 CSS 排版或像素截图。实际视觉和触屏效果仍须人工验收，不以 Node Host 代替浏览器。

## 工程验证

使用 Node 24.21.0。新组件挂载测试 10 项及原 Identity 测试 5 项已通过；完整 Warp 首轮出现 6 项临时图片目录发布的 Windows rename EPERM，其余 353 项通过。沙箱内全量运行也出现 4 项相同类别的目录重命名／恢复失败。未跳过或降低任何断言，也未修改发布逻辑。沙箱内曾把进程 TEMP／TMP 指向忽略目录以避免默认转换缓存问题；最终在沙箱外使用正常系统临时目录，完整 54 文件、756 项全部通过，未增加测试重试。复现命令如下；若在沙箱内运行，需注意临时目录权限差异：

```powershell
npm test -- tests/unit/warp-simulator --no-file-parallelism
npm test -- --no-file-parallelism
npm run type-check
npm run lint
npm run validate:i18n
npm run validate:warp-data
npm run validate:warp-visuals
npm run build
```

| 检查                 | 本轮实际结果                                                          |
| -------------------- | --------------------------------------------------------------------- |
| 新 Node 组件挂载测试 | 10 项通过                                                             |
| Warp 定向测试        | 21 文件、359 项全部通过                                               |
| 全量单元测试         | 54 文件、756 项全部通过                                               |
| Type Check           | 通过                                                                  |
| ESLint               | 全仓通过                                                              |
| i18n                 | 双语结构、键、参数和语法通过                                          |
| Warp Data            | 112 件物品、15 个有效 Banner、3 个共享池，校验通过；原 pending 5 保留 |
| Warp Visuals         | 257 张自有图片、42 张共享头像、缺失 0，校验通过                       |
| Production Build     | 通过；Warp JS 126.51kB、CSS 20.26kB（构建日志显示值）                 |

构建保留既有 HiGHS node:module externalized／静动态导入提示；本机此次还输出插件耗时提示，没有构建失败。文档更新以当前 [UI 规范](../../design-notes.md#跃迁模拟器)、[演出架构](../../architecture/warp-simulator.md#全屏结果演出)和[资源指南](../../game-data.md#warp-展示资源)为准。

收尾格式检查覆盖 12 个增量文本文件，5 份文档的 116 个本地链接／锚点及 git diff --check 均通过。共修改 8 个已有文件、新增 4 个文件，其余 722 个起点文件哈希全部一致，包含全部 423 张图片、Runtime、配置、Schema、视觉 Catalog／Manifest、引擎、会话和其他工具。来源基线为 HSR-Database develop `6fc8f53be3153743b1e69a8790e0a5ed1ad8d175`、StarRailRes master `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`、TurnBasedGameData main `312b4597691e0a29cf9828a15b592757dba86949`；收尾对比分支、HEAD 与干净状态均未变化。本仓库分支／HEAD 不变，改动保持未暂存。未 Commit、Push、部署或运行浏览器自动化。

## 人工验收

运行 npm run dev，在真实页面或现有 `/tests/manual/warp-results/index.html` 检查：

1. 中文／英文，390／1024／1440px 宽度以及移动横屏；命途布局基准宽度上限为 160px，整个构图相较上一版明显缩小，五颗星同步缩小、尖芒连接不变。
2. 不同命途及 DPR 1／2／3；命途上限一致，不能因为原图为 512px 或高清图失败而恢复大构图。空间不足时整体缩小，不裁切或拉伸。
3. 正常及慢网络、缺图、单抽和十连多个五星；动画完整、顺序不变，点击跳到当前 Artwork，Escape 和 Reduced Motion 沿用原行为。
4. 最终 Artwork 和信息面板尺寸保持原样；关闭后恢复焦点，其他跃迁 UI、保底、历史和星缘选择不受影响。

完成本轮后停止，等待维护者本地验收。
