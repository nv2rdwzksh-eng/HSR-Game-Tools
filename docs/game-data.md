# 游戏数据与资源维护

本指南描述现行规范化快照与显式更新流程。来源与许可见[第三方说明](third-party/README.md)，运行命令总览见[开发指南](development.md)。

## 数据边界与来源

各工具从自己的数据目录读取 Schema、仓库内快照和 Adapter：[Action Planner 数据](../src/tools/action-planner/data/)与 [Warp 数据](../src/tools/warp-simulator/data/)独立维护。原始上游解析只属于显式更新器，运行时与纯模拟引擎不读取原始游戏 JSON。

[货币战争控制台原型](currency-wars.md#数据快照与显式提取)另用根目录 `data/currency-wars/` 的本地快照；仅显式提取器读取锁定的 TurnBasedGameData。该工具不复用或改写排轴、Warp 的更新流程。

其网页的费用与图片清单由独立 `visuals.json`／`visuals-manifest.json` 管理，不扩展算法快照。费用取锁定来源角色配置的 Rarity 并以商店一星购买价格核对，图片使用已存在的角色头像与用户准备的星徽文件；维护命令及哈希边界见[展示数据](currency-wars.md#独立展示数据)。普通运行不解析原始表、不下载或生成图片。

星徽配方与材料图另由 `crafts.json`／`crafts-manifest.json` 管理，沿用同一锁定来源与 Season 1，不参与求解。完整关联、显式提取及离线校验见[星徽合成目录与材料资源](currency-wars.md#星徽合成目录与材料资源)。

排轴资源 validator 不将货币战争的 `game-assets/emblem/`、`game-assets/currency-war-traits/`、`game-assets/currency-war-equipments/` 或 Warp 的 `game-assets/warp/` 当作自己的额外资源；各工具负责校验自有命名空间，其他清单／哈希／尺寸检查保持严格。排轴显式更新器仍按原有整目录发布流程工作；执行前必须备份这四个目录，完成后恢复并分别运行 Warp、货币战争视觉及合成目录校验。该限制适用于后续每次显式排轴数据维护，不能仅凭排轴校验通过判断其他工具的资源完整。

当前来源分工：

- StarRailRes：双语角色属性、装备条目及必要图片，来源版本由 Source Lock 固定。
- HSR-Database：有限的人工名称与已分类别名投影，provenance 记录于 overlays。
- TurnBasedGameData：Warp 轻量物品目录的显式本地更新来源，同时保留历史机制与字段调查用途；不参与排轴更新器或普通构建。
- 装备行动预设与适用条件是工具自身规则，不由技能文案自动推断或执行。

## 快照与来源锁定

| 文件或目录                                                           | 职责                                                      |
| -------------------------------------------------------------------- | --------------------------------------------------------- |
| [catalog.json](../src/tools/action-planner/data/game/catalog.json)   | 规范化双语条目、角色身份、基础速度、预设与资源映射        |
| [manifest.json](../src/tools/action-planner/data/game/manifest.json) | 游戏版本、来源 Commit、生成参数、文件哈希、缺失资源和诊断 |
| [public/game-assets/](../public/game-assets/)                        | 有限的本地 WebP 图片，不请求上游 CDN                      |
| [source-lock.json](../scripts/game-data/source-lock.json)            | 来源仓库、固定 Commit、人工审阅的 Character ID 和转换参数 |
| [overlays.json](../scripts/game-data/overlays.json)                  | 有限名称、别名与工具预设的维护输入及来源记录              |

当前锁定快照为游戏版本 4.6.0，包含 98 个角色、3 个预设和 101 张 WebP。数量是该快照的核对结果，不是永久 Schema 约束。
来源 Commit 为 `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`；快照文件及必要资源保持可跟踪，缓存、staging 和备份由 .gitignore 排除。

当前角色图片为 256×256，装备图片为 128×128。更新器统一按 Source Lock 的 `maxSize: 256` 等比缩放且不放大；128×128 是当前资源的实际尺寸，不是单独的装备尺寸上限。
转换版本、质量和 alphaQuality 由 Source Lock 管理，Manifest 记录实际 Sharp 版本和生成时间。

## 显式更新流程

只有明确授权的数据维护任务才能运行更新器；普通安装、dev、test 和 build 不生成数据或访问上游仓库。

1. 准备 StarRailRes 的独立本地 Git 仓库。指定路径必须是 Git 根目录，工作区干净，HEAD 与 Source Lock 一致。
2. 审阅需要的 Character ID、名称与预设输入；更新来源与转换参数属于单独的数据变更，不在文档任务中顺带修改。
3. 建议先停止本项目的 dev / preview，再显式更新：

```bash
npm run update:game-data -- --source local --root "/absolute/path/StarRailRes"
npm run validate:game-data
```

[更新器](../scripts/update-game-data.ts)只实现本地来源，不 fetch、不切上游分支、不修改上游，不自动提交；远程下载模式未实现。
完成后审阅 catalog、Manifest、图片集合、缺失诊断与来源差异，再启动或刷新应用。

## 校验、发布与回滚

生成内容先写入 `.game-data-staging/<runId>/`；`.game-data-staging/update.lock` 用独占创建阻止并发更新。
发布前的[文件校验](../scripts/game-data/files.ts)核对 Schema、游戏版本、来源锁定、审阅 ID 集合、转换参数、overlay 哈希、文件 inventory、bytes / SHA-256 和图片格式尺寸。

[发布函数](../scripts/game-data/publish.ts)将旧 `public/game-assets/` 与 `src/tools/action-planner/data/game/` 保存到 `.game-data-backup/<runId>/`，再安装新目录。
新数据目录包含已验证的 Manifest。移动失败时恢复旧目录；成功后清除备份，更新器在 finally 中清理本次 staging 和锁。
这不是对正在访问的浏览器提供全局原子的多目录替换，因此建议停止 dev / preview 后更新。

进程被强制终止可能留下锁、staging 或备份。确认没有更新进程、核对 runId 和备份内容后再人工恢复，不自动删除他人的锁或未知备份。
普通 validator 只检查仓库内结果，不重新生成或下载文件。

## 缺失资源与身份

缺图时省略对应 URL 并记录 missingAssets / diagnostics；UI 使用已有 fallback，不捏造资源路径。
缺速度时保留缺失值，由 UI 要求有效输入，不猜测游戏数值。新增角色身份必须经过审阅，不自动扩展已锁定的角色集合。

角色形态身份与欢愉识别使用规范化数据。已保存方案的身份与资源不一致时按[方案解析边界](architecture/action-order-simulator.md#方案格式与持久化)报告，不静默替换角色或改写旧存档。
软件或索引来源许可与游戏美术权利需分别确认；构建与校验通过不表示已经获得公开分发授权。

## Warp 数据基础设施

Warp 与上述排轴快照独立维护。数据管线提供目录、人工配置、Schema、校验和静态数据生成；[跃迁模拟器](architecture/warp-simulator.md)另外实现 v0.3 引擎及页面内会话，不扩展维护名单或自动下载资源。

运行时产物单独放在 `data/runtime/`，发布器只整体替换该目录，不替换包含 TypeScript 契约的 `data/`。当前已配置的成员及来源说明以人工 JSONC 为准；结构迁移不重新生成名单。

| 路径                                                                                | 职责                                                |
| ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| [scripts/warp-data/source-lock.json](../scripts/warp-data/source-lock.json)         | 固定 TurnBasedGameData Commit 和转换版本            |
| [scripts/warp-data/generated/](../scripts/warp-data/generated/)                     | 双语 Item Catalog、GachaID／类型索引及来源 Manifest |
| [scripts/warp-data/banners.jsonc](../scripts/warp-data/banners.jsonc)               | 人工共享候选池、Banner 和明确待办                   |
| [本地 JSON Schema](../scripts/warp-data/schema/banner-config.schema.json)           | 从目录和共享池声明生成的 VS Code 补全与结构约束     |
| [src/tools/warp-simulator/data/runtime/](../src/tools/warp-simulator/data/runtime/) | 裁剪后的运行时 snapshot 与 Manifest                 |
| [独立 TypeScript 契约](../src/tools/warp-simulator/data/schema.ts)                  | 物品、候选池和 Banner 类型；不扩展排轴 Schema       |

### 来源与身份

当前来源为 TurnBasedGameData Commit `312b4597691e0a29cf9828a15b592757dba86949`。仅提取 AvatarConfig、AvatarConfigLD、EquipmentConfig 的 ID、类型、星级和中英文名称；名称经原始 Hash 关联 CHS／EN TextMap。Node 24 reviver 的 `context.source` 保留整数 Hash 的原始十进制字符，禁止使用 Number 舍入后的值作关联键。

目录当前有 98 个角色和 170 个光锥。包含非跃迁形态、玩家名称占位符和其他未审阅抽取资格的条目；目录存在和原始 Release 字段均不能证明可抽取。只清除已核实的 `<unbreak>` 显示标签并规范空白，保留 `{NICKNAME}`。同名物品、不同形态和不同类型的相同数字 ID 均不合并，例如 `avatar:1001` 与 `avatar:1224`。

GachaBasicInfo 只投影 GachaID 和类型；索引包含 Newbie 的 `unsupported` 标记，但本轮禁止配置新手池。它不提供或推断完整成员、UP、日期或权重。没有可信游戏版本字段时以固定 Commit 标识版本，不借用排轴的游戏版本。维护 Manifest 保留六份输入文件的实际字节数／SHA-256、逐项来源表、记录键和名称 Hash。

感谢 Dimbreath 提供原始数据整理；固定来源的 [README](third-party/turnbasedgamedata-README.md) 随仓库保留。该 Commit 根目录无 LICENSE，不据此声称游戏内容获 MIT 授权。

### 显式更新和配置步骤

首次更新或切换已审阅来源版本时，先人工更新 Source Lock，再显式运行：

```bash
npm run update:warp-catalog -- --source local --root "/absolute/path/TurnBasedGameData"
npm run generate:warp-schema
```

更新器只支持本地来源；要求来源是干净的 Git 根目录，HEAD 与锁匹配。不会 fetch、切分支或修改来源；更新前后检查 Git 状态，并在发布前复核输入文件字节。Catalog 更新不发布运行时快照；来源切换后需同步 JSONC 的 `sourceCommit` 并重新审阅名单。

在 `banners.jsonc` 中维护：

- `sharedPools`：每项含唯一 `id`、`fiveStarType`（`avatar`／`light-cone`／`mixed`）、非空且不重复的 `threeStar`／`fourStar`／`fiveStar` ID 数组和非空 `evidence` 来源定位。三星只能是三星光锥，四星可混合角色与光锥，五星受声明类型约束；mixed 五星集合必须同时包含两类物品。
- `banners`：每项含唯一 `gachaId`、`kind`、`pityGroup`、`sharedPool` 引用和 `evidence`。普通角色／光锥 Event 须填写一个同类型五星 `up5` 和恰好三个同类型且不同的四星 `up4`；Fate 只填写五星 UP；Ordinary 不允许 UP 字段。
- `kind` 的五种值为 `event-avatar`、`event-light-cone`、`fate-avatar`、`fate-light-cone`、`ordinary`；`pityGroup` 分别固定为 `pity:<kind>`，作为[纯引擎](architecture/warp-simulator.md)的独立继承组键。数据管线只维护身份元数据，计数、保证与转移由引擎负责。Banner 的 `gacha:<GachaID>` 由生成器派生，不使用 UI GroupID 作继承组。
- `pending`：未核实类别与缺失原因。当前有一个维护者已配置的真珠 Banner（GachaID `2139`）和五个保留待办；待办不放宽任何有效 Banner 校验。清除待办是维护者对名单完备性的审阅，不是官方规则认证。

每个 Banner 只需引用已审阅共享池、填写 GachaID／UP 等少量字段及来源；不得复制物品名称或元数据建立身份。候选集合和 UP 是分开的维护输入，数据管线不自动加入、剔除或赋权。名单的历史资格、完整性和来源真实性仍需维护者审阅。`sharedPool.fiveStar` 是资格集合，不代表玩家已选七名角色；Phase 1D 角色 Resolver 要求调用方显式提供七名合法选择，并按 v0.3 组成八个回退槽位。光锥与 Ordinary 的具体解析约束见[引擎契约](architecture/warp-simulator.md#候选与-up)，不改变维护 Schema 或人工名单。

编辑候选池 ID／类型后重新生成 Schema，再填写 Banner 引用，最后生成并验证快照：

```bash
npm run generate:warp-schema
npm run build:warp-data
npm run validate:warp-data
```

JSONC 支持注释和尾逗号，重复键会被拒绝。Schema 过期、来源不符、未知字段／ID、类型／星级错误、重复成员、UP 数量错误、空集合及非法引用均阻止快照生成。诊断包含文件、行列及配置路径。只改注释也会改变输入文件哈希，需显式重新 build；validate 只读，不自动修复或生成。

### VS Code IntelliSense 与名称查询

JSONC 顶层 `$schema` 已用相对路径关联仓库内 Schema；打开整个 HSR-Game-Tools 文件夹，保留 VS Code 内置 JSON Language Features，并使用 JSON with Comments 模式即可，无需 `.vscode` 设置、扩展或远程 Schema。若补全缓存未刷新，可重新打开文件；在空的数组元素处用 Ctrl+Space 选择共享池／五类 Banner 模板。模板中的空 ID 和空来源需要维护者填写，通过前会保留诊断。

选择物品字段时，补全按类型和星级限制 ID，说明中显示中英文名称、类型和星级，实际插入始终是内部 ID。原生 `markdownEnumDescriptions` 是说明，不保证输入其中的中文／英文就能过滤 ID；本机 VS Code 1.141.2 的语言服务探针也观察到自定义 snippet 标签未改变 ID 过滤文本。用下列离线查询补充名称查找：

```bash
npm run find:warp-item -- 三月七
npm run find:warp-item -- "March 7th" --kind avatar --rarity 4
npm run find:warp-item -- light-cone:21000
```

查询按 NFKC、大小写归一后进行名称／ID 子串匹配，返回全部匹配身份；不会用名称自动选定或写入配置。编辑器完整交互仍由维护者人工验收：分别检查角色／光锥 UP、双语说明、非法 ID 红线、三个四星 UP、Fate／Ordinary 禁用字段和共享池引用刷新。

### 产物、失败恢复与普通构建

运行时只保存有效 Banner 可达的候选池和物品，以及来源、工具版本、输入／产物哈希和计数 Manifest。无有效卡池时输出空运行时列表，Manifest 明确为 `incomplete` 并给出待办数；此时 validate 可成功，因为数据结构有效，但不能解释为已交付可抽取的真实卡池。

三个生成命令共用 `.warp-data-staging/update.lock` 独占锁。目录先在 staging 中完整验证，再备份原目录并安装；任一安装失败恢复旧目录。单文件 Schema 采用同文件系统临时文件 rename。回滚自身失败时保留锁、staging 和 `.warp-data-backup/`，避免销毁恢复材料；进程强杀也可能留下这些目录。确认无维护进程、核对 runId 与 Manifest 后人工恢复，禁止盲删未知锁或备份。目录替换不提供进程强杀下的无间隙可用性，更新前建议停止 dev／preview。

生成产物可跟踪，只有 staging／backup／cache 被忽略；生成 JSON 使用固定序列化，不交给 Prettier 改写。普通 install、dev、test、build 无上游路径、网络数据请求或自动生成钩子；需要完全离线安装 npm 包时使用已有缓存及 `npm ci --offline`。Warp 纯引擎通过参数接收规范化 Snapshot，由 Resolver 产生抽取上下文；页面入口为懒加载的 `/warp-simulator`，不改变发布配置。

### Warp 展示资源

独立[展示目录](../src/tools/warp-simulator/data/visuals/)包含 `catalog.json` 和 `manifest.json`，替代 Phase 1E 的手工 `presentation.json`。其输入是当前 Warp Runtime Snapshot 的可达物品，不以完整来源目录作为抽取资格。展示只增补 canonical ID 对应的命途、角色属性、图片及双语图标信息，不改写业务 Snapshot、Banner 或引擎。

[Source Lock](../scripts/warp-visuals/source-lock.json)固定 StarRailRes Commit `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487` 及转换参数。显式更新读取该 Commit 的 Git 对象，不要求 HEAD 位于该 Commit，也不使用工作区修改／未跟踪内容；指定目录必须是 Git 根且锁定对象存在，不 fetch、不切分支、不写来源仓库。只解析 cn／en 的 characters、light_cones、paths、elements 八份索引，逐项核对 ID、星级与双语身份。

```bash
npm run update:warp-visuals -- --source local --root "/absolute/path/StarRailRes"
npm run validate:warp-visuals
```

命途关联使用 `Warrior`、`Knight`、`Priest` 等内部 ID，名称不是身份键。角色立绘和光锥封面只使用索引给出的已存在路径；必要头像从现有规范化共享资源登记中复用，更新时核对共享 Manifest 的来源 Commit、文件哈希及图片尺寸。运行时不导入排轴模块。

新增图片只写 `public/game-assets/warp/`，以内容及转换参数哈希命名并去重。Source Lock 转换版本为 5，来源 Commit 与 Sharp 0.35.3 不变。原轻量角色最长边 768、光锥 640、quality 82，图标／旧星级及独立演出参数保持原样。新增 `result-portrait` 用途固定读取角色索引对应的 image/character_portrait/<ID>.png，resultPortraitSize 为 source、quality 88、alphaQuality 100，不降采样、不裁透明边界、不放大。转换 inside 边界至少为原图最长边；原图已落在既有 2048 高清边界内时保留该转换键，以复用完全相同的输出。源图更大时采用原始最长边，输出尺寸必须逐轴等于源尺寸。Catalog 的角色专用 resultPortrait 保存 path／width／height，Manifest v3 同步记录用途和来源。

裁切星级 `card-stars` 使用 Sharp 零阈值透明检测，和原始 RGBA 非零 Alpha 边界交叉核对。只裁掉完全透明区域，验证每颗星的重复单元及三档源高度／内容一致，再等比缩至内容高 64px、四边各加 2px 透明安全边，quality 90、alphaQuality 100、不放大。输出为 196×68、260×68、324×68，统一内容缩放比例；裁切矩形之外不得存在有效 Alpha，空图、异常比例或重复单元不一致会阻止发布。原始仓库只读，不运行时裁图。Catalog 的可选 cardStars[3/4/5] 保存 path／width／height，供结果卡和最终 Artwork 信息面板选择；历史、详情继续使用原星级。缺少裁切图时中性占位，不回退到带长空白的旧星级。源图变更需重新审阅这些边界和重复单元，不盲用历史裁切值。

V3 五星 Identity 使用独立用途 `reveal-star-big`：固定读取同一锁定 Commit 的 `icon/deco/StarBig.png`，转换参数新增 revealStarBigSize 279、quality 90、alphaQuality 100，保留 279×279 完整透明画布，不裁切、不放大。Catalog 可选 revealStarBig 保存 path／width／height，Adapter 同名字段仅向五星提供 url／width／height，五个实例共用一个 URL。Manifest v3 校验源路径、用途、无裁切、转换键、尺寸、哈希及引用覆盖；旧 Star3／4／5、revealStars 和 cardStars 保留。缺失源图有明确诊断，运行时失败仅显示中性占位，不用长条星级替代。来源与新增资源记录见 [V3 动画报告](investigations/warp-simulator/phase-1m-five-star-reveal-animation.md)。

当前 138 件物品自有图片共 392 张、75,039,558 bytes，另复用 55 张共享头像；83 张光锥 preview 共 4,036,930 bytes。2026-10-21 新增 55 个 resultPortrait 映射，均为 2048×2048，复用既有高清 WebP，因此图片数量、字节数和文件哈希均未改变。运行时角色卡现在按需解码高清画布，单张 2048×2048 RGBA 约 16 MiB，实际浏览器内存由缓存及解码实现决定；不预加载整个图鉴。光锥 preview 仍为原生 348×408、最长边上限 408、quality 88、alphaQuality 100，保持完整透明画布；单件保持像素／DPR 限制，总览允许卡内裁切。校验器继续离线检查源／输出尺寸、用途、来源、哈希及引用覆盖；维护测量见[纠正性重构记录](investigations/warp-simulator/result-display-correction-2026-10-21.md)。

Manifest schemaVersion 3 记录源仓库及 Commit、八份索引和所用图片的来源文件／SHA-256／字节数／原始尺寸、每项转换用途及转换键、共享投影来源、业务快照哈希、生成时间、Sharp 与转换版本、输出路径／尺寸／哈希／字节数及缺失诊断。card-stars 另记实际裁切矩形，新键含源 SHA-256、配方标识、透明阈值、矩形、内容高度、安全边、quality 和 alphaQuality；其他用途保留旧键。validator 将每种用途与 Source Lock 参数对应，检查安全路径、裁切边界／比例／统一源高度、精确输出尺寸、不放大、映射尺寸、引用覆盖、来源及严格文件清单。普通 validator 不读源图，Alpha 完整性由显式生成及合成测试核对。命途和属性名称来自双语索引，物品名称仍来自 Warp Snapshot。属性保留原始六位颜色；对比度修正仅在展示 Adapter 中完成，光锥不生成属性。

显式更新可复用前一次 Manifest（含旧 v1）中来源仓库／Commit、Sharp 版本、源文件、转换键相同且输出字节数／哈希验证通过的文件，避免未变 lossy 图片重编码造成字节漂移；缺失或损坏缓存重新生成，staging 全量校验仍执行。内容与转换键相同的多项引用只输出一份文件，普通图与高清图不会因用途名不同而产生同参数重复内容。改变转换算法语义时需同步版本、转换键及校验，不能盲目信任旧缓存。

缺少图片或来源条目时省略对应映射并记录诊断；图片解码失败、双语身份冲突、共享图片校验失败或无效颜色会中止更新。现有快照继续可用。普通 validator 仅检查仓库内产物，不读相邻仓库、下载、重新编码或修复文件。

更新持有 `.warp-visuals-staging/update.lock`，先在本次 staging 完成完整校验，再备份并替换自有图片目录与展示目录；任何安装失败恢复两者，绝不搬移共享图片目录。回滚失败保留锁、staging 与 `.warp-visuals-backup/`；强制终止也可能留下恢复材料，须人工核对，不盲删。更新前建议停止 dev／preview，多目录替换不提供强杀期间无间隙可用性。

普通 install／dev／test／build 不调用此更新器，测试只使用临时来源夹具。修改 Warp 业务快照或共享资源来源后需显式重新更新展示资源；校验会报告哈希漂移。排轴整目录发布前的跨工具资源保护要求见[数据边界](#数据边界与来源)。来源与许可通知继续见[第三方说明](third-party/README.md)，转换记录不改变游戏美术的权利归属。
