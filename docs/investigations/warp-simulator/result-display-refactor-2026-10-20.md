# 跃迁结果展示重构 — 2026-10-20

## 实施结果

本次只修改 HSR-Game-Tools 的结果展示和对应视觉管线，保留 develop 分支，未提交、推送或部署。十连按维护者最终澄清使用横向卡片、倾斜 3–4–3；关闭后继续保留普通页面结果。光锥按维护者选择优先原生像素清晰度。

新增 WarpResultBackground、WarpResultsWall、WarpResultArtwork、WarpItemDetailsContent，重构 WarpRevealOverlay、WarpRevealMetadata 和 WarpResultCard。背景 Token 集中在 preset，五星 Identity 的源码、时序、六张图片门控和黑底保持原样。单件 Artwork 使用左侧渐隐信息条、中央偏右完整主体。十连卡片逐张旋转并按斜向基线错位，纯几何模型计算旋转包围盒和缩放；窄屏使用可滚动双列／单列。

## 素材管线及保护证据

StarRailRes 来源 Commit 保持 `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`，从本地 Git 对象读取，不下载、不编辑源仓库。Source Lock 仅将转换版本提升到 4，新增 preview 尺寸参数；不升级游戏数据或修改候选池。

从锁定双语 light_cones.json 的 preview 字段映射全部 83 件可达光锥，新增仅光锥可用的 lightConePreview 描述（path／width／height），Adapter 对应 url／width／height。所有源图 348×408 且有 Alpha，自带倾斜叠层边框。Sharp WebP 使用最长边上限 408、quality 88、alphaQuality 100、inside／withoutEnlargement，完整保留画布。Manifest v3 增加 light-cone-preview 用途、严格源路径和引用覆盖；沿用哈希命名、已校验缓存复用、去重、staging 校验及发布回滚。

新增 83 张 WebP 共 4,036,930 bytes；当前 138 件物品自有 392 张图片共 75,039,558 bytes，另复用 55 张共享头像。对比 HEAD Manifest 的全部 364 张原有登记图片，路径、尺寸、字节数和 SHA-256 均保持不变。运行时只请求本地资源；预览失败回退原轻量 Artwork，再回退中性占位，最终占位提供 ready，不锁死流程。单件图片继续受实际像素／DPR 上限限制，因此当前低分辨率光锥预览明显小于游戏参考图，这是已确认的取舍。

## 头部锚点及校准工具

PortraitFocus = {x,y,scale}，以 canonical 角色 ID 索引。x／y 指向完整 character_portrait 源画布中的归一化头部中心；默认 (0.5,0.3,2)。轻量和高清图均保留完整画布，所以等比例缩小后可复用坐标；共享头像不参与此定位。

设卡内美术区 W×H、源图 Iw×Ih，k = max(W/Iw,H/Ih)×scale；显示宽高为 Iw×k、Ih×k，left = W/2−Iw×k×x，top = H/2−Ih×k×y。ResizeObserver 读取未变换的 clientWidth／clientHeight，内部图片定位与外层卡片旋转独立。校验拒绝非法值并对运行时无效参数使用默认值。

人工检查源画布后配置以下 10 名角色：

| ID          | 角色     | x      | y      | scale |
| ----------- | -------- | ------ | ------ | ----- |
| avatar:1001 | 三月七   | 0.49   | 0.33   | 2.2   |
| avatar:1003 | 姬子     | 0.52   | 0.49   | 3.3   |
| avatar:1013 | 黑塔     | 0.48   | 0.245  | 2.6   |
| avatar:1101 | 布洛妮娅 | 0.475  | 0.475  | 3.4   |
| avatar:1102 | 希儿     | 0.375  | 0.55   | 3.3   |
| avatar:1107 | 克拉拉   | 0.425  | 0.3125 | 2.9   |
| avatar:1201 | 青雀     | 0.485  | 0.325  | 2.7   |
| avatar:1312 | 米沙     | 0.5625 | 0.4075 | 3.1   |
| avatar:1415 | 昔涟     | 0.52   | 0.54   | 4.4   |
| avatar:1503 | 真珠     | 0.525  | 0.4    | 3.2   |

当前 55 名可达角色中，其余 45 名仍使用默认参数，尚未逐个完成卡片视觉校准。开发入口 `/tests/manual/warp-results/index.html` 新增折叠校准器：选择角色、点击原图定位、调整 x／y／scale、使用正式卡片实时预览、导出 JSON；仅 DEV 挂载，不注册正式路由或引入依赖。导出的配置仍需维护者审阅后加入展示配置，不自动写文件或业务数据。

## 状态与交互

useWarpReveal 新增 overview 阶段和 overviewEntries。单抽所有稀有度都揭示，五星仍先播放原 Identity；十连只逐个揭示五星，随后始终进入包含完整十项的 overview，无五星则直接进入。Escape 可结束当前单件，但不能绕过总览；总览只有明确关闭按钮或 Escape 能关闭，点击空白不退出。

单件、总览全程共用一个 Dialog，pending 持有操作锁至匹配批次的 afterHide；关闭后发布 displayedEntries 并恢复抽取按钮焦点。定时器、ready 和 hide 回调验证 revision／batchId／entryId，避免旧批次干扰。Reduced Motion 不退出总览，销毁时清理定时器及尺寸监听。

总览详情在当前模态内复用同一详情内容，卡片墙 inert，关闭／Escape 返回原卡片及滚动位置。详情唯一交互控件是关闭按钮，Tab／Shift+Tab 在该按钮循环，避免外层焦点陷阱尝试聚焦 inert 内容。普通页面和历史继续使用原详情 Dialog 包装，不改 Drawer 导航队列。

## 验证结果

- 相关单元及 Node 组件渲染测试、基础边界、文档和迁移测试：29 文件、429 项通过。
- type-check、lint、validate:i18n、validate:warp-visuals、build 通过。构建仍报告 HiGHS 的 node:module 浏览器外置和静态／动态导入混用提示，不影响构建产物。
- 完整 format:check 仅报告未修改的 scripts/warp-data/banners.jsonc；已核对文件与 HEAD 字节一致，且 HEAD 同样不通过 Prettier。本次未改卡池文件。所有本次修改和新增的文本文件另行通过 Prettier 检查。
- 浏览器检查覆盖 1920×1080、1366×768、2560×1080，十张旋转卡片全部位于视口内；390×844 为单列、1280×600 为双列滚动，无手机横向溢出，末张可以访问。
- 浏览器验证多五星依次揭示后进入完整总览、详情关闭返回原卡片、手机详情 Tab 循环、关闭结果恢复焦点和操作、五星 Identity 黑底保留、单件透明光锥原生 348×408 上限、英文长名称及图片全部失败后正常继续。
- 在正式 `/warp-simulator` 页面实际完成一次角色活动十连并关闭总览，主页面保留 10 项、page inert 已移除、抽取入口重新可用，焦点恢复到 warp-pull-ten。展示夹具不进入生产结果。

截图留在本地忽略目录 `.cache/warp-overview-1920.jpg`、`warp-overview-1366.jpg`、`warp-overview-ultrawide.jpg`、`warp-overview-mobile.jpg`、`warp-character-reveal.jpg`、`warp-light-cone-reveal.jpg` 和 `warp-light-cone-mobile-en.jpg`；截图中的合成身份仅是开发验收场景。

## 待维护者视觉验收

请人工比较整体倾斜方向／排间距、紫金发光强度、完整角色构图和光锥在原生像素限制下的大小；复查 10 名初校角色的头部裁切，并按需继续校准其余 45 名。已有浏览器检查属于实施验证，不代表维护者最终视觉验收。

来源保护基线：HSR-Game-Tools develop `cca800da660131e349ff1dac481af664ae161070`；HSR-Database develop `17257c58c4e3b4e9e9a801c617e3e3232764e51d`；StarRailRes master `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`；TurnBasedGameData main `74a7b96fba32f00cf495a5c00b0311bd02207aaf`。三个只读来源仓库的分支、HEAD 和工作区状态最终均保持原样。
