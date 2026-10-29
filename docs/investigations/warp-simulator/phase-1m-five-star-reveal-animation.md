# Phase 1M：五星跃迁 V3 Identity 动画

日期：2026-10-18（Asia/Shanghai）。HSR-Game-Tools 的 develop，起点 HEAD `12ef41c47ebea16561e17f56fa505ec15a43a6f1`，工作区干净；实施前记录了 725 个已跟踪文件的 SHA-256。当前实际基线为 112 件物品、15 个有效 Banner、3 个共享池，视觉目录原有 256 张自有图片及 42 张共享头像引用；旧文档的 104 件／240 张是此前阶段测量。本轮没有重新生成 Runtime 或变更 Banner。

本报告记录源码、Node 单元测试、资源校验及构建证据；未运行浏览器自动化或视觉截图，真实视觉和交互仍待维护者本地验收。未 Commit、Push、部署、升级依赖或联网获取来源。

## 动画集成

原型来自工作区 `Codex-Prompt/Warp-Simulator-01/hsr_warp_five_star_reveal_v3.html`，SHA-256 为 `45c1e7fce3365208f13c3eeba768fb2f3793118bb61f895352ab1b171e308afe`。原型默认 playbackRate 为 2，因此实施直接使用折算后的真实毫秒数，不移植演示脚本、播放按钮或额外计时器。

[WarpRevealIdentity](../../../src/tools/warp-simulator/components/WarpRevealIdentity.vue) 仅负责命途及五颗星的渲染和 CSS 动画，由现有 Overlay 的 Identity 分支挂载。画布固定为 807:594，宽度取可用容器宽、按比例换算的可用高及 1016px 上限的最小值；容器查询单位绑定舞台而非整个 Viewport。命途中心为 (50%, 52%)、宽 57%；星星纵向中心为 49.5%，横向中心依次为 17.5%、30.1%、50%、69.9%、82.5%，普通星宽 14.5%、中央星宽 34%。整个构图等比缩放，所有命途使用相同参数。

| 元素           |   开始 |             时长 |    完成 |
| -------------- | -----: | ---------------: | ------: |
| 命途淡入后变淡 |   25ms |          287.5ms | 312.5ms |
| 外侧第 1、5 星 |  260ms |            175ms |   435ms |
| 内侧第 2、4 星 |  375ms |            175ms |   550ms |
| 中央第 3 星    |  505ms |          237.5ms | 742.5ms |
| 进入 Artwork   | 1100ms | 沿用原淡入 400ms |  1500ms |

沿用原型的关键帧、缓动、短暂亮度／缩放和发光，命途最终透明度为 0.18。中央闪光完成后保留 357.5ms 最终构图，再由已有状态机切换 Artwork。背景保持纯黑，去掉原 Identity 的共同淡入／淡出，避免新动画再次受旧动画截断。

## 就绪门控与状态边界

[useWarpIdentityReady](../../../src/tools/warp-simulator/composables/useWarpIdentityReady.ts) 汇总命途及五个独立图片实例的就绪事件。每个实例继续使用 WarpRevealImage／useWarpRevealSource 的真实 load 或最终占位判断；命途按 revealPathIcon → pathIconUrl → 中性占位回退，StarBig 失败直接使用中性占位。全部六项就绪才发出一次带 batchId／entryId 的 identity-ready，交给原 useWarpReveal 开始完整 1100ms。

聚合器不创建计时器或队列，忽略重复、无效编号、旧批次／条目及销毁后的事件；条目变化清空就绪集合。CSS 启动条件使用状态机接受后的 identityReady，因此 Escape 离场中的晚到事件不能启动动画；已启动的构图在 leaving 期间保持挂载并随原舞台淡出。语言导致的等价资源对象不重新请求或重播。

WarpRevealImage 增加可选 limitToSourcePixels，默认 true。仅六个 Identity 装饰图传 false，让命途原生 256／512px 的差异或 DPR 不分别缩小图标、破坏共同布局；Artwork 继续按实际图片像素／DPR、可用视口及既有上限限制显示。星级组使用一次本地化稀有度描述，五个装饰实例从读屏树隐藏；按钮及命途沿用既有双语消息，没有新增自然语言常量。

useWarpReveal 源文件保持字节不变。单抽三／四星直接 Artwork、十连五星原顺序队列、前置点击跳到当前 Artwork、加载期间不推进、Escape 结束当前项、Reduced Motion、焦点／滚动锁、最终信息面板、卸载与计时器清理继续由原机制处理。引擎、RNG、保底、会话、历史和星缘存储没有改动。

## 资源来源与保护

显式运行现有 Warp Visual Pipeline，读取本地 StarRailRes 锁定 Git 对象，不依赖检出文件，也不写入来源仓库：

```bash
npm run update:warp-visuals -- --source local --root ../StarRailRes
npm run validate:warp-visuals
```

来源 Commit 为 `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`，原文件 `icon/deco/StarBig.png` 为 279×279、68,999 bytes，SHA-256 `5aec11dd2a292e740b4fb2bb4ffc3a88e320c9d6ee81555339167ad1f9829e52`。原型内嵌的五颗星均与此原文件字节一致；原型示例命途未被复制到生产映射。

新增转换用途 reveal-star-big，使用 279px、WebP quality 90、alphaQuality 100、inside／withoutEnlargement，不裁切透明画布。新增输出如下：

- 路径：`public/game-assets/warp/3a5329b94d8adabdf7679cfe44bc87f761c8bcac3b32f3b956c144fc476c1b44.webp`。
- 尺寸与大小：279×279，28,812 bytes。
- SHA-256：`05d8a2422d4a3b8126516e1cb8b0f9985bcce422213662647eb213993c366053`。

Catalog schemaVersion 1 增加可选 revealStarBig，保存 path／width／height；Adapter 同名字段仅向五星提供 url／width／height。命途仍按实际物品的元数据连接 revealPathIcon，无名称猜测或指定命途特判。Manifest schemaVersion 3 增加该用途、输入来源与输出尺寸／哈希；验证固定来源路径、无裁切、转换键和引用覆盖，并保留缺图诊断。Source Lock 仅增加转换参数 revealStarBigSize，来源 Commit、转换版本 3 和全部旧转换键保持不变。

当前视觉资源为 112 件、257 张自有图片、54,497,202 bytes，另复用 42 张共享头像，缺失为 0。与起点相比仅新增上述一张 WebP；422 张既有图片（包含 256 张 Warp 自有图及其他工具图片）全部哈希一致。原 Catalog 的物品、命途、属性、轻量图、高清图、旧星级和裁切星级映射保留，视觉 Manifest 仅增加对应记录及重新生成的 Catalog 哈希／时间。

## 验证结果

新增测试覆盖六图异步就绪、命途轻量回退、星图失败占位、最后中央星晚到后完整计时、重复／旧身份／销毁事件、742.5ms 与 1100ms 时间边界、对称布局、全部九种命途及双语 Adapter。模板 AST 检查确认真实 Adapter 绑定、五实例循环、装饰图尺寸限制选项、阶段分支和比例容器。资源 Fixture 新增透明画布 StarBig，验证不裁切、准确来源、缺图及来源／裁切／尺寸／映射／校验和损坏拒绝。原队列、跳过、Reduced Motion、RNG 与会话不变性测试继续执行。

| 检查             | 实际结果                                                            |
| ---------------- | ------------------------------------------------------------------- |
| Warp 定向测试    | 20 文件、349 项通过                                                 |
| 全量单元测试     | 53 文件、746 项通过                                                 |
| Type Check       | Vue、应用、脚本及测试通过                                           |
| ESLint           | 全仓通过                                                            |
| i18n             | 中英文结构、键、参数和语法通过                                      |
| Warp Data        | 112 件、15 个有效 Banner、3 个共享池，校验通过；原有 pending 5 保留 |
| Warp Visuals     | 257 张自有图、42 张共享头像、缺失 0，校验通过                       |
| Production Build | 通过；Warp JS 126.44kB、CSS 20.22kB（构建输出的十进制显示值）       |

使用 Node 24.21.0，没有安装或更新依赖。基线并发运行曾出现 Windows 目录 rename 的间歇性 EPERM，沙箱外重跑仍出现同类失败；另一次默认沙箱临时目录导致 Vitest 转换缓存 rename 被拒。正式验证只对命令进程设置 TEMP／TMP 为忽略目录 `.cache/warp-v3`，并使用 `--no-file-parallelism`，Warp 与全量测试均完整通过。没有跳过断言、屏蔽失败、加入重试或修改文件发布逻辑。

```powershell
$env:TEMP = (Resolve-Path .cache/warp-v3).Path
$env:TMP = $env:TEMP
npm test -- tests/unit/warp-simulator --no-file-parallelism
npm test -- --no-file-parallelism
npm run type-check
npm run lint
npm run validate:i18n
npm run validate:warp-data
npm run validate:warp-visuals
npm run build
```

构建继续保留既有 HiGHS 的 node:module externalized 与静／动态导入提示。收尾检查 18 个增量文本文件的格式、5 份文档的 113 个本地链接／锚点及 git diff --check；这些静态和 Node 检查不代表浏览器像素或交互验收。

三个只读来源仓库起点均干净：HSR-Database develop `6fc8f53be3153743b1e69a8790e0a5ed1ad8d175`，StarRailRes master `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`，TurnBasedGameData main `312b4597691e0a29cf9828a15b592757dba86949`。收尾对比分支、HEAD 和干净状态均未变化。本仓库仍在原 develop／HEAD，共修改 14 个已有文件、新增 5 个文件（含一张图片）；其余 711 个起点文件哈希全部一致，包含 Runtime、JSONC、Schema、引擎、会话、星缘存储及其他工具文件，没有遗留视觉发布锁。全部改动保持未暂存状态。

现行契约见 [UI 规范](../../design-notes.md#跃迁模拟器)、[全屏结果演出架构](../../architecture/warp-simulator.md#全屏结果演出)和[资源维护](../../game-data.md#warp-展示资源)。

## 维护者人工验收

运行 npm run dev，在中文／英文及 1440×900、1024px 宽、390×844 和移动横屏检查；可使用现有 `/tests/manual/warp-results/index.html` 演出夹具，无需修改正式 RNG 或卡池：

1. 五星先出现正确命途，外星一对、内星一对、中央大星依次闪亮；中央闪光完整结束后短暂停留再进入 Artwork。没有旧 Star5 长条或示例命途误用。
2. 比较不同命途、角色和光锥。命途占位大小一致；DPR 1／2／3 下五颗星比例、中心和尖芒连接保持稳定，窄屏、横屏不拉伸，背景为纯黑。
3. 放慢网络，确认六个 Identity 实例就绪后才开始整段动画；分别阻断高清命途、轻量命途和 StarBig，确认回退或中性占位可继续，不停在黑幕。
4. 在资源未就绪、外星／内星／中央闪光和停留期间点击，均只跳至当前 Artwork。十连多个五星顺序不变；Escape 每次结束当前项，长按按键不额外推进，关闭后恢复原抽取按钮焦点。
5. 初始及运行中启用 Reduced Motion，直接显示已就绪的 Artwork／最终占位；三／四星单抽和 Artwork 信息面板保持原行为。切换语言、关闭页面或重新进入后无残留计时器、意外重播或会话变化。

本轮完成后停止，等待维护者本地验收。
