# Phase 1A：独立工程基础与排轴引擎迁移

日期：2026-10-13，Asia/Shanghai。本轮完成独立 Vue 工程、固定版本引擎迁移、本地规范化数据／图片更新器，以及真实隔离目录的安装、检查和浏览器验收。没有进入 Phase 1B，没有暂存、提交、推送、部署或配置域名。

## 1. 结果与工程基础

**新项目已在不包含三个来源仓库、原有 node_modules 或上游缓存的独立目录中完成安装、测试、构建及运行。**纯引擎独立可调用，11 组旧版完整结果对照一致；规范化快照包含98个角色、3个预设、101张本地WebP。正式排轴工作区和线上部署仍不属于本阶段。

### 来源和版本

| 来源              | 分支    | 固定 Commit                                | 工作区                             |
| ----------------- | ------- | ------------------------------------------ | ---------------------------------- |
| HSR-Database      | develop | `72c2d4d1b9ccc0fc0bb191d16ac29492750ea1b0` | 开始／结束均干净                   |
| StarRailRes       | master  | `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487` | 开始／结束均干净                   |
| TurnBasedGameData | main    | `312b4597691e0a29cf9828a15b592757dba86949` | 开始／结束均干净，未用于本轮更新器 |

新仓库开始在main，已有用户建立的 `c7e8b50 Initial commit` 和origin，保留这些配置，没有自行建立提交。旧站HEAD与Phase 0一致，没有混用其他版本。

通过系统代理核验npm注册表HTTP 200，再运行官方create-vue 3.24.0，在.cache/phase1a-scaffold生成bare模板并合入工程，未覆盖Git或历史报告。没有引入示例组件、Oxlint、DevTools、jsdom或组件测试工具；本轮纯机制测试使用Node环境。

| 直接依赖／工具                               | 固定版本                      |
| -------------------------------------------- | ----------------------------- |
| Vue／Vue Router／vue-i18n                    | 3.5.43／4.6.4／11.4.14        |
| Vite／Vue Vite插件                           | 8.3.4／6.0.10                 |
| Tailwind／Tailwind Vite插件                  | 4.3.3／4.3.3                  |
| TypeScript／vue-tsc／Vitest                  | 5.9.3／3.3.13／4.1.11         |
| Sharp／tsx                                   | 0.35.3／4.23.15               |
| ESLint／eslint-plugin-vue／typescript-eslint | 10.12.0／10.11.1／8.71.2      |
| Vue ESLint TS／Prettier配置                  | 14.9.0／10.2.0                |
| Prettier／jiti／Vue tsconfig／Node类型       | 3.9.10／2.7.0／0.9.1／24.19.0 |

实际环境Node24.21.0、npm11.16.0；engines要求Node>=24.12、<25，.nvmrc为24.21.0。唯一package-lock锁定传递依赖；隔离npm ci安装233个包，没有Pinia、Svelte、Paraglide。当前 [typescript-eslint](https://registry.npmjs.org/typescript-eslint/8.71.2)声明TypeScript<6.1，因此保留5.9.3，没有在引擎迁移时升级到新主版本。

所有外部网络操作通过127.0.0.1:7890，未修改全局npm配置。npm提示esbuild postinstall未列入allowScripts；没有批量放开脚本，当前平台可用二进制已通过实际更新、测试、构建。没有执行日志中的npm升级建议。

### 目录与配置

```text
src/
  engine/action-planner/        # 核心类型、队列、执行、目标、验证、阶段筛选
  tools/action-planner/model/   # 编辑辅助、预设、搜索、AV格式
  tools/action-planner/composables/
  data/schema.ts               # 工具schema与验证
  data/game/                   # catalog.json、manifest.json
  data/adapters/               # typed快照与BASE_URL资源解析
  components/ui/               # GameIcon
  views/                       # 首页、集成页、未知路由
  router/
  locales/
  assets/main.css
public/game-assets/            # character、relic、light_cone
scripts/                       # 显式更新、校验、性能探针
tests/fixtures/                # 11个输入、旧版完整期望
tests/unit/
docs/third-party/
```

Router使用History与BASE_URL，只有首页、懒加载排轴页和未知路由。vue-i18n Composition API支持zh-CN／en，默认中文，更新UI、角色名称、lang和title；语言不参与引擎求值。语言不持久化，刷新恢复默认。

Tailwind采用官方Vite插件，仅定义基础暗色、克制金色及语义颜色；不继承旧全局CSS、SectionHeading或Inspector。参考 [create-vue](https://github.com/vuejs/create-vue/tree/v3.24.0)、[Tailwind Vite指南](https://tailwindcss.com/docs/installation/using-vite)、[Router History指南](https://router.vuejs.org/guide/essentials/history-mode.html)。

## 2. 引擎迁移与11组对照

### 文件与适配

直接迁入types、queue、engine、operations、targeting、validation六个核心文件。将转译后的JavaScript做AST对照，排除格式、尾随逗号和无影响的括号，六个文件均等价。types移出旧目录选择类型，不影响执行代码。

effect-config按职责拆分：引擎保留phaseOperations，model保留保存／移动／阶段helper。speed-duration-config、participant-config、presets迁入model，仅适配导入与格式。Presentation只复用纯AV格式，不保留Paraglide Locale、消息或ActionCardData。旧character-selection／全局搜索不复制，新搜索直接处理CharacterRecord的分类标签。

迁入七个旧测试文件共44项，Trace最后一项改为直接断言队列／记录，原数学和历史预期未变。未迁入Svelte SSR、旧服务器／页面或全站测试；没有消息、路由、详情schema或CSS兼容层。

### 独立期望与结果

通过Git show从固定Commit导出七个纯引擎文件到系统临时目录hsr-phase1a-oracle-5IiEyG，用旧simulatePlan对每个输入运行两次验证确定性，再写入tests/fixtures/action-planner-expected.json。**期望不是由新引擎生成。**

期望文件78,559 bytes，仅包含records／snapshots的锚点、原始AG／AV／SPD、modifier生命周期、Trace、诊断、计数及stopReason；不包含名字、图片、文案、对象身份或内部克隆布局。

| 场景        | 关键旧版预期                                             | 新版对照 |
| ----------- | -------------------------------------------------------- | -------- |
| natural     | 160／134：62.5、74.6268656716418、125、149.2537313432836 | 完整一致 |
| continuous  | 先提前a后提前b：初始b,a，均零AV                          | 一致     |
| zeroRefresh | 再提前已为零的a：刷新为a,b                               | 一致     |
| group       | 重叠群体操作后c,b,a                                      | 一致     |
| pre         | 行动前群体24%：a2=125，active-target warning             | 一致     |
| post        | 动作后同操作：a2=110，AG=7600                            | 一致     |
| finite      | 100SPD行动两次：100／200，最后空队列                     | 一致     |
| linked      | 共享倒计时在50先触发，移除+50后双方AG=2500、SPD=100      | 一致     |
| independent | 一次事件在111.11111111111111触发                         | 一致     |
| dynamic     | 零AG子单位同一AV行动一次，稳定ID                         | 一致     |
| trace       | 各操作当时SPD，deltaAV=-20、5、-20，下一回合无旧历史     | 一致     |

现有机制测试还保护速度变化保留AG、立即行动／过满延后的区别、有限／无限持续、倒计时延后、失败节点不发布、不可达锚点和预算。未修改数学、排序、双窗口或生命周期语义。

useActionPlanner采用页面级shallowRef／shallowReadonly，不深度代理结果、不建立全局Store；通过replacePlan提交计划。AV只在Intl展示时固定两位并消除负零，不回写引擎。正式导航、草稿和编辑流程留给Phase 1B。

## 3. 数据与资源

### 最终schema

schemaVersion=1的catalog包含gameVersion、characters、presets、assets。CharacterRecord含字符串ID、中英名称、可选baseSpeed／assetKey、分语言official／player别名、pathCode及必要gender。PresetRecord仅含ID、kind、名称、可选assetKey；AssetRecord含站点相对路径与尺寸。

原始characters／promotions／relic_sets／light_cones仅在更新器解析，Vue不读上游schema。SPD取晋阶spd.base，要求阶段恒定、step=0、中英一致；max_sp不参与。缺失／可变SPD产生诊断并留空。

source lock固定98个已审阅ID；普通＋LD的权威关系已在Phase 0核验，本轮不再调用旧生成器或权威仓库。12条名称覆盖处理10个开拓者及两种三月七，gender来自已核验tag，各ID独立。

一次性提取旧版finite character-search的98条分类别名配置，provenance记录旧Commit及来源。过滤未解决占位符／富文本，不自动导入整个nickname，更不把player别名标为official。后续更新只依赖新配置；轻量搜索保留NFKC、分隔符、exact／prefix／contains和确定性排名。

三项预设来自308、110、21018的名称／小图；模板保持翁瓦克40%且仅start、不检查120SPD，翔鹰25%，舞舞舞24%。没有描述求值、叠影选择或新角色技能逻辑。

### 图片与Manifest

| 产物               | 实际数量／大小                    |
| ------------------ | --------------------------------- |
| 角色／预设         | 98／3                             |
| WebP               | 101张、2,829,326 bytes，约2.70MiB |
| 尺寸               | 98张256×256，3张128×128           |
| catalog.json       | 63,169 bytes                      |
| manifest.json      | 16,815 bytes                      |
| 数据诊断／缺失图片 | 0／0                              |

根据用户选择保留原图尺寸，相对Phase 0的统一128建议升级transformVersion=2；maxSize=256、quality=85、alphaQuality=100、fit=inside、不放大、Sharp0.35.3。没有提取preview／portrait或下载上游大仓库。

Manifest记录来源URL与Commit、4.6.0、schema、UTC生成时间、转换版本／工具／参数、overlaySha256、102项输出文件SHA-256与bytes、缺失和诊断。时间仅审计用途，内容校验和用于一致性；Manifest不做自引用哈希。

validate:game-data检查schema、source lock及overlay摘要、身份／预设、引用闭包、实际校验和与bytes、无额外资产、WebP格式与尺寸。它不需要上游目录，读取Buffer元数据，不重编码图片。

### 更新与失败保护

```sh
npm run update:game-data -- --source local --root "/absolute/path/StarRailRes"
npm run validate:game-data
```

显式传local和root才更新，无隐藏父目录默认值；要求来源Git根目录、固定HEAD和干净状态，不fetch／checkout／修改来源。未知ID先审阅lock；图片路径必须安全，拒绝逃逸来源的链接。

独占锁阻止并发。staging先生成并校验，再备份旧图片／数据目录，安装图片，最后安装含Manifest的数据目录；异常恢复旧目录。测试注入图片安装后的失败，已验证旧Manifest和图片同时恢复；并发测试证明第二次不能替换owner锁。实际误传旧站目录时被拒，现有catalog／Manifest哈希不变。

缺图片记录诊断、清除assetKey，UI通用图标回退；必要索引损坏、中英不对应或非法路径失败。常规dev／test／build不下载或更新数据，没有prebuild／postinstall更新钩子。远程下载平台未实现，纯projection和显式source入口可供后续扩展。

多目录替换不是浏览器读取者的全局原子事务，README建议停止服务后更新。强制终止的自动恢复未实现，可能遗留锁／备份，需人工核验；异常路径回滚不等于防断电事务。

Windows首次更新发现Sharp文件路径元数据缓存保留句柄，阻止移动／清理；改用Buffer校验，并保证清理异常也释放锁，随后更新成功。没有改写来源或削弱校验。

## 4. 真实隔离验收

隔离目录：

```text
C:/Users/unkn0/AppData/Local/Temp/hsr-game-tools-isolation-wRWhDv/app
```

复制173个新项目文件，排除.git、node_modules、.cache、dist、.game-data-*、.upstream和链接。父目录仅有本次副本和新的npm缓存，没有三个来源仓库。没有复用旧node_modules、NODE_PATH、file:依赖或父目录alias。

实际命令：

```sh
npm ci --proxy=http://127.0.0.1:7890 --https-proxy=http://127.0.0.1:7890 --cache=../fresh-npm-cache --no-audit --no-fund
npm run type-check
npm test
npm run lint
npm run format:check
npm run validate:game-data
npm run build
npm run dev -- --port 5178 --strictPort
npm run preview -- --port 4178 --strictPort
npm run build -- --base /tools/ --outDir dist-subpath
npm run preview -- --base /tools/ --outDir dist-subpath --port 4179 --strictPort
```

全部检查通过，10文件／67测试。静态入口JS149.32kB（gzip54.61kB）、排轴懒加载48.14kB（gzip12.19kB）、CSS8.50kB（gzip2.63kB），不包含原始上游JSON或旧站管线。

HTTP实际验证：5178和4178首页／action-planner均200 HTML；图片返回image/webp和正确RIFF／WEBP签名，1001图为30,738bytes，不是fallback HTML。

Codex内置浏览器完成：

- 首页导航、排轴直接深链接及reload正常。
- 中文显示98个角色、三月七·存护、SPD101、本地256图和四条结果。
- English切换文案、名称、lang、title；anchors／原始AV不变，仍为62.5、74.6268656716418、125、149.2537313432836。
- 图片complete=true、naturalWidth／Height=256；显示AV两位，不丢内部精度。
- dev冷启动等待懒加载后正常；应用控制台无error／warn。
- /tools/action-planner直接访问／刷新正常，首页href=/tools/，图片src=/tools/game-assets/character/1001.webp且加载成功。

页面→规范化快照→纯引擎→Vue结果→本地图片流程已验证，没有API／数据库或外部游戏资源请求。使用 [verification 技能](C:/Users/unkn0/.codex/plugins/cache/openai-curated-remote/vercel/0.54.1/skills/verification/SKILL.md)的完整流程检查方法。截图保存在项目.cache/phase-1a-preview.png，不属于正式应用资源。

本地History fallback已实测，**不代表生产宿主已配置**。没有创建vercel.json、远程项目、域名或部署。

## 5. 测试与性能

67项：迁入机制44、完整迁移对照11、依赖／搜索／格式／浅状态5、schema／校验和／缺失／回滚／并发7。没有组件快照、CSS细节或逐文案Key测试。

类型检查包括Vue、scripts和tests；lint不修复。正式源码／配置没有旧绝对路径、旧alias、原始上游runtime JSON、软链接或Submodule；旧来源名字只出现在provenance／说明或禁止依赖表达式中。

受限环境曾阻止来源realpath及Vitest临时缓存重命名，未进入机制断言；获得执行权限后通过。没有改变网络配置或降低数学预期。

Node24.21.0、Intel Core i9-14900HX，每种预热5次、测30次：

| 输入                  | 实际节点               | 中位ms | P95 ms | 最大ms |
| --------------------- | ---------------------- | ------ | ------ | ------ |
| 普通四人              | 51（受1000AV范围限制） | 0.5085 | 0.8550 | 0.8782 |
| 动态Actor＋共享倒计时 | 58                     | 0.6873 | 0.9918 | 1.0210 |
| 高预算                | 500                    | 4.5519 | 6.0393 | 7.6510 |

当前支持继续同步求值，不立即引入Worker。结果不是其他CPU／浏览器／正式编辑器的性能承诺；Phase 1B需测实际交互和渲染。

## 6. Phase 1B准备、许可与限制

可直接使用：纯引擎、锚点／ID、目标资格和操作预览、纯编辑辅助／预设、工具schema／adapter、local更新／校验、双语、基础样式、页面级浅状态、机制及等价性测试。

Phase 1B仍需：战斗配置和选择器、Navigator／队列模式、工作阶段、Inspector概览／编辑、草稿、切换节点丢草稿、动态操作编辑、诊断／Trace展示及新交互浏览器验收。未复刻旧组件树，未提前实施正式布局。

没有阻止Phase 1B本地UI开发的工程障碍。未完成：真实敌人／Endgame选择、未来工具、新角色预设、持久化／导入导出、远程更新、跨平台及高DPI设备全面视觉验收、生产部署。

MIT通知与StarRailRes AGPL文本保留于docs/third-party，数据来源可追溯。未来静态应用预计含规范化JSON与有限WebP；整体许可证、索引派生产物义务和游戏美术再分发条件仍需确认。开源许可证不等于美术授权，本地验收不等于允许公开分发。

新数据和图片保持可追踪，但未暂存、提交、推送。三个来源仓库分支、HEAD与工作区保持原样，Phase 0报告不改写。停止于Phase 1A，不自行进入下一阶段或发布。
