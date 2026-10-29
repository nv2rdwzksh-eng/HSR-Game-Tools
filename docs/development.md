# 开发与维护指南

项目概览见[根 README](../README.md)，专题入口见[文档导航](README.md)。Agent 操作遵守 [AGENTS.md](../AGENTS.md)。

## 开发环境与启动

使用 Node.js 24.x（当前 [package.json](../package.json) 要求 `>=24.12.0 <25`）与 npm。
依赖版本由 package.json 和唯一的 [package-lock.json](../package-lock.json) 管理；使用锁文件安装，不顺带升级依赖。
`.nvmrc` 只记录版本，不会自动切换 Node。执行下列命令前，先在同一个终端检查 `node --version` 与 `npm --version`；不要只凭已安装 Node 24 就假定 `npm run dev` 会使用它。
若 Node 24 是未加入 PATH 的便携版，可在当前 PowerShell 会话中先将其所在目录置于 PATH 开头（将占位符替换为本机实际目录）：

```powershell
$node24Dir = '<Node 24 目录>'
$env:Path = "$node24Dir;$env:Path"
node --version
npm --version
```

```bash
npm ci
npm run dev
```

以终端显示的本地地址为准。开发与预览命令绑定 `127.0.0.1`；首页为 `/`，行动序列模拟器为 `/action-planner`，跃迁模拟器为 `/warp-simulator`。
默认语言为简体中文，运行时可切换 English；语言选择不持久化。

预览使用已生成的静态构建：

```bash
npm run build
npm run preview
```

`build` 输出 `dist/`。应用使用 Vue Router History；Vercel 的 SPA 深链接回退配置见下节。

## 分支、CI 与 Vercel 部署

项目已由维护者部署至 Vercel；以下说明仓库内的 CI/CD 配置，远程规则、Secrets 和线上行为需要维护者自行确认。
Vercel 继续使用已有项目和 Git Integration，Framework Preset 为 Vite，Node.js 为满足 `>=24.12.0 <25` 的 24.x，构建命令为 `npm run build`，Output Directory 为 `dist`。
本轮不改变域名、DNS、远程构建设置或现有部署保护。

### 日常开发与自动 CI

`develop` 用于日常开发与集成，允许正常 Push；`main` 是 Production，修改通过 develop → main PR 合入，禁止直接 Push。
Agent 不自行切换到 develop，不擅自 Commit、Push 或执行任何部署；具体权限见 AGENTS.md。

[CI Workflow](../.github/workflows/ci.yml) 在 develop Push 及目标为 develop/main 的 PR 上自动运行一个固定名称为 **Validation** 的 Job。
使用 Node 24.x、npm Cache 和 `npm ci`，依次执行 type-check、test、lint、validate:i18n、build；安装前确认 Node 满足项目版本范围。
Workflow 只有 contents 读取权限，普通 PR 不访问部署凭证，不运行上游数据更新、Benchmark、浏览器测试或部署。
format:check、游戏数据和模板校验继续用于本地维护及发布前检查，不自动加入每次 Push 的 CI。

### 手动 Preview

先确认所选 Commit 的 CI 已通过，再打开 GitHub **Actions → Vercel Preview Deployment → Run workflow**，选择 develop，或已审阅的非 main 功能分支。
[Preview Workflow](../.github/workflows/vercel-preview.yml) 仅接受手动触发，拒绝 main 和标签 Ref，按本次所选 Commit SHA Checkout。
同分支新运行可以取消旧运行，不同分支互不取消。

在仓库 **Settings → Secrets and variables → Actions → New repository secret** 配置：

| Repository Secret | 来源与用途                                                              |
| ----------------- | ----------------------------------------------------------------------- |
| VERCEL_TOKEN      | 维护者创建的 Vercel Token，授权访问已有项目所属团队，仅用于手动 Preview |
| VERCEL_ORG_ID     | 已有项目所属 Team/Org 的 ID，从 Vercel 团队设置确认                     |
| VERCEL_PROJECT_ID | HSR-Game-Tools 已有项目的 Project ID，从项目 Settings → General 确认    |

不要把值写进仓库、文档、日志或 Site Messages，也不要把 Token 发给 Agent。三个值必须指向同一个已有项目和团队。
Workflow 安装固定 Vercel CLI 59.16.0，凭证缺失或已有项目检查失败时停止；不创建项目，不执行关联命令。
CLI 使用环境变量读取 Token 和项目身份，显式部署 Preview，由已有 Vercel 项目执行远程构建；没有重复的本地 prebuilt 流程。
成功后在 Log 和 Step Summary 查看可点击的 Preview URL、Ref 和完整 Commit SHA。它不切换 Production 域名。

### 自动 Production 与 SPA 路由

[vercel.json](../vercel.json) 的 git.deploymentEnabled 关闭所有分支自动部署，仅允许 main；develop Push、功能分支及 PR 不自动创建 Preview。
维护者需确认 Vercel 项目的 **Production Branch 为 main**。main 合并更新后继续由 Git Integration 自动部署 Production，没有第二套 Actions Production Workflow。
这里的 Git 过滤不禁止用户显式手动 CLI Preview。

原有 catch-all Rewrite 保留，将未命中的客户端路径回退至 `/index.html`；Vue Router History、`/action-planner` 和静态构建输出不变。
本地构建和 JSON 校验不能证明远程 Git 过滤或线上路由有效；维护者需确认分支过滤、Production 自动更新以及 `/action-planner` 直接访问、刷新和静态资源请求。

### Web Analytics

App.vue 只挂载一次官方 Vue Analytics 组件，依赖精确固定为 @vercel/analytics 2.0.1。
SDK 内置 Vue Router 页面访问跟踪，使用默认环境检测，不额外手动上报 pageview、按钮点击、模拟器配置、JSON 方案或用户标识。
语言切换继续只改变现有展示，不添加业务追踪。

在 Vercel 现有项目的 **Analytics** 页面确认 Web Analytics 已启用；启用状态需要在下一次部署后验证。
版本上线后人工访问首页，客户端进入模拟器，再直接访问和刷新 `/action-planner`，到 Dashboard 确认收到 Page Views。
本地构建成功不代表服务器端统计已经启用或收到访问数据；不伪造本地 Production 模式或增加 Debug 配置。

### main 规则与首次启用

main 的保护由维护者在 GitHub **Settings → Rules → Rulesets** 配置，Agent 没有设置这些远程规则。
创建针对 main 的 Branch Ruleset，设为 **Active**，不添加常规 Bypass：

- **Require a pull request before merging**，Required Approvals 设为 0。
- **Require status checks to pass before merging**，选择 GitHub Actions 实际产生的 **Validation** 检查。
- 保持 **Require branches to be up to date before merging** 的严格检查。
- 启用 **Block force pushes** 和 **Restrict deletions**。

不要把同样严格的规则套到 develop。不要将参考仓库的 Development/Correctness 或 Vercel Preview 检查误设为 Required Check。
当前仓库为 public，默认分支为 main；若控制台不能提供所需 Ruleset，可在 **Settings → Branches** 使用传统 Branch Protection 设置等效 PR、Validation、分支更新、禁止 Force Push/删除及不允许绕过规则。
如果当前套餐或权限连传统强制保护也不支持，应由维护者处理套餐或权限限制；不能仅靠文档宣称 main 已受保护。

首次启用按以下顺序操作：

1. 确认已有 Vercel 项目的 Analytics、Production Branch、Node 版本，并配置上述三个 Repository Secrets。
2. 在 develop 提交本轮修改并 Push，等待 CI 首次运行。
3. 创建 develop → main PR，确认 Validation 名称和结果。
4. 设置上述 main Ruleset，再合并 PR。
5. 等待 Vercel Git Integration 自动更新 Production，并人工检查路由、核心功能及 Analytics。
6. Preview Workflow 进入默认分支 main 后，打开 Actions 手动选择 develop 创建 Preview。
7. 确认 develop Push／PR 不产生自动 Preview，手动 Preview 可用且不影响 Production。

workflow_dispatch 文件必须先存在于默认分支，首次 Bootstrap 合并前看不到或不能正式使用手动入口是预期情况。
规则、Secrets 和远程验收尚未完成时，本地配置准备不能视为完整 CI/CD 已在线生效。

## 常用命令

以下定义以 [package.json 的 scripts](../package.json) 为准，按变更选择检查，不作为每次任务的完整执行清单。

| 命令                                                                  | 用途                                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `npm ci`                                                              | 按锁文件安装依赖                                                    |
| `npm run dev` / `npm run preview`                                     | 本地开发 / 预览已有构建                                             |
| `npm run type-check`                                                  | Vue、应用与工具配置的 TypeScript 检查                               |
| `npm test`                                                            | Vitest 确定性单元测试                                               |
| `npm run lint`                                                        | ESLint，只检查、不自动修复                                          |
| `npm run format:check`                                                | 按现有忽略项检查 Prettier 格式                                      |
| `npm run format`                                                      | 全仓格式写入，仅在明确需要时执行                                    |
| `npm run validate:i18n`                                               | 校验双语消息结构、参数与语法                                        |
| `npm run validate:game-data`                                          | 校验快照、Manifest、来源锁定、文件哈希及图片                        |
| `npm run validate:planner-templates`                                  | 校验人工审阅的方案模板和双语介绍                                    |
| `npm run build`                                                       | 将现有应用和快照构建至 dist，不生成游戏数据                         |
| `npm run update:game-data`                                            | 显式数据更新；参数和前提见[游戏数据维护](game-data.md#显式更新流程) |
| `npm run update:warp-catalog`                                         | 显式读取锁定的本地 TurnBasedGameData，生成独立 Warp 目录            |
| `npm run generate:warp-schema`                                        | 从本仓库目录和人工 JSONC 生成本地补全 Schema                        |
| `npm run find:warp-item -- <名称或ID>`                                | 离线查询双语名称／内部 ID，可加 `--kind`、`--rarity`                |
| `npm run build:warp-data`                                             | 验证人工配置后显式发布裁剪的 Warp 快照                              |
| `npm run update:warp-visuals`                                         | 显式从锁定 StarRailRes Git 对象生成 Warp 展示资源                   |
| `npm run validate:warp-visuals`                                       | 只读核对 Warp 展示快照、来源、共享图片及自有资源完整性              |
| `npm run validate:warp-data`                                          | 只读核对 Warp 目录、配置、Schema、Manifest 和快照                   |
| `npm run extract:currency-wars-crafts -- --root ../TurnBasedGameData` | 显式提取锁定赛季星徽合成目录及本地材料资源映射                      |
| `npm run validate:currency-wars-crafts`                               | 离线核对配方目录、来源、覆盖、材料引用与图片哈希                    |
| `npm run bench:engine`                                                | 可选的引擎性能探针，不设机器相关硬阈值                              |

## 上游仓库与网络

货币战争网页入口为 `/currency-wars`，CLI 使用 `npm run currency-wars`。离线算法快照检查用 `npm run validate:currency-wars`，展示数据检查用 `npm run validate:currency-wars-visuals`，合成目录与材料图片检查用 `npm run validate:currency-wars-crafts`；显式提取和 Worker/WASM 构建探针见[货币战争指南](currency-wars.md)。这些命令不接入 dev、test 或 build 的数据生成钩子，普通测试不启动浏览器。

正常安装、开发、测试和构建不读取相邻的 HSR-Database、TurnBasedGameData 或 StarRailRes，也不触发下载、生成或旧站构建钩子。
排轴数据显式更新需要与 Source Lock 匹配的 StarRailRes；Warp Catalog 显式更新需要其独立 Source Lock 匹配的 TurnBasedGameData。Warp 展示更新使用独立 Source Lock 固定的 StarRailRes Git 对象；其他 Warp 命令仅消费仓库内文件，维护步骤见[Warp 数据基础设施](game-data.md#warp-数据基础设施)。HSR-Database 继续只用于只读调查与来源追溯。

维护者当前本地网络使用 `http://127.0.0.1:12334` 系统代理；使用前应检查当前代理配置和连通性，不要假定文档记录的端口始终有效。这不是所有使用者必须具备的环境。
需要该代理时，可仅对本次安装指定参数：

```bash
npm ci --proxy=http://127.0.0.1:12334 --https-proxy=http://127.0.0.1:12334
```

其他环境按实际网络配置安装。不要把私有路径、Token 或本地部署状态提交到仓库；Agent 联网与代理失败处理以 AGENTS.md 为准。

## 验证策略

引擎修改优先运行相关确定性单元测试；保留基础隔离测试与 11 个历史迁移用例。新功能选择少量高价值案例，不新增大量 UI 快照、CSS 断言或逐字绑定可变文案的测试。

定向测试使用已有 npm 入口，例如：

```bash
npm test -- tests/unit/action-planner/planner-document-file.test.ts tests/unit/action-planner/planner-persistence.test.ts
```

消息修改运行 i18n 校验；模板修改运行模板校验及方案文件相关测试；数据维护按游戏数据指南验证。
代码变更按范围选择类型检查、lint、格式检查与构建，不将历史报告中的一次通过结果当成本次验收。

### 稳定维护验收清单

全仓稳定化或发布前集中验收时，逐项记录命令的退出状态、失败原因与未验证范围：

1. `type-check`、`test`、`lint`、`format:check`、`validate:i18n`。
2. `validate:game-data`、`validate:planner-templates`、`validate:warp-data`、`validate:warp-visuals`、`validate:currency-wars`、`validate:currency-wars-visuals`、`validate:currency-wars-crafts`。
3. `build` 后运行 `verify:currency-wars-browser`；检查子路径时另构建到 `.cache/currency-wars-subpath`，使用 `--base /hsr/`，探针传入相同目录及 Base，完整命令见[货币战争指南](currency-wars.md#worker-与-wasm)。
4. 检查实际修改文件的格式、文档链接／锚点、`git diff --check` 和 Git 状态。

上述名称均为现有 npm scripts；不把更新器或数据生成命令作为校验前置步骤。Warp 配置的 `incomplete` 与正式空模板目录是明确保留的状态，不通过补造内容使报告变绿。人工 JSONC 的纯格式调整也会改变 Manifest 输入哈希，必须确认解析内容不变并同步相应来源元数据，不重建无变化的业务快照。保留原有 CI 范围，此清单用于集中维护验收。

Codex 默认不执行 Computer Use、Playwright、Puppeteer、真实浏览器截图或其他浏览器自动化；普通测试命令不触发浏览器测试。
只有用户明确要求某次浏览器自动化验收时才例外。UI 视觉与真实交互由用户在本地人工验收，建议覆盖 1440px、1024px、390px 和两种语言。

## 文档修改的检查

纯文档修改只需核对内容、Markdown 结构、内部链接、标题锚点与 `git diff --check`，不要求更新数据、Benchmark、单元测试、Production Build 或浏览器验收。

现有 [.prettierignore](../.prettierignore) 排除了部分历史及第三方文档。定向检查实际编辑的 Markdown 时，用现有 .gitignore 替代忽略文件：

```bash
npm exec -- prettier --ignore-path .gitignore --check README.md docs/README.md docs/development.md
```

需要格式修复时仅对实际变更文件使用 `--write`，不全仓重排历史报告，也不修改许可证文本。
临时链接检查脚本放系统临时目录，不为文档任务安装新工具链。
