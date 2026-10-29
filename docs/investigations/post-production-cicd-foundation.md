# 上线后 CI/CD 基础接入报告

日期：2026-10-14（UTC+8）。本报告区分仓库内实现、本地执行的验证、用户报告的上线状态和待用户完成的远程配置。

## 1. Executive Summary

- 开始时位于 develop，HEAD 为 `020c1c352fde21714a0fcde4f0d25ea7cf0af890`，工作区干净。未切换分支、暂存、提交或推送。
- 用户报告项目已正式上线至 Vercel；本轮没有访问受保护项目、核查真实项目凭证或执行任何部署，不将该背景当作本轮线上验收结果。
- 新增 Vue Web Analytics、单一 Validation CI 和仅手动触发的 Preview Workflow；main 自动 Production 继续交给已有 Vercel Git Integration。
- 根 vercel.json 保留原 SPA Rewrite，增加仅允许 main 的 Git 自动部署规则。没有新增服务端、Production Workflow、上游同步、浏览器验证或定时任务。
- 更新开发指南、两条 AGENTS.md 约束和调查索引；根 README、引擎、持久化格式、游戏快照、路由、主题和模拟器组件未修改。
- 使用 Node 24.21.0、npm 11.16.0。只新增 @vercel/analytics 2.0.1，所有原有锁文件包记录和依赖版本保持不变。
- 本地完整单元测试为 21 个文件、217 个用例通过，包含全部 11 组历史迁移基准。

只读参考 HSR-Database/main 的 Commit `fdb992307d149597590865dc36e1e5417036974a` 中 ci.yml、vercel-preview.yml、vercel.json 和 development.md。
通过 Git 对象读取，没有切换参考仓库当前 develop 分支，没有复制其 pnpm、上游环境变量、动态 Job 名称、E2E 或 Production 部署逻辑。

## 2. Analytics

### 版本与挂载

通过用户代理安装官方 `@vercel/analytics@2.0.1`，直接版本精确固定，并同步 package-lock.json。
已对照安装前的锁文件：新增包仅为 node_modules/@vercel/analytics，没有升级、降级或改写任何既有包记录，也没有引入 React、Next.js 或其他框架。

App.vue 新增一个官方 `@vercel/analytics/vue` 导入和一个 `<Analytics />`，挂载在现有 app-shell 内、RouterView 之后。
临时检查移除这两行后，App.vue 与 HEAD 内容完全相等；Header、语言切换、Document Title、Meta Description 和原有状态逻辑均保留。
Analytics 组件自身 render 返回 null，不增加可见 UI，页面内没有其他重复挂载。

### 客户端路由与采集范围

官方包的 peer 范围为 Vue ^3、vue-router ^4，与本项目 Vue 3.5.43、Router 4.6.4 兼容。
本轮已只读检查发布包的 Vue 适配源码：通过 useRoute 获取路由，有 Router 时关闭脚本自身重复自动跟踪，首次调用 pageview 并 watch 路由变化，以 route.path 和路由参数派生页面描述。
因此采用官方组件内置的路由适配，没有另写 afterEach、路由 watcher 或手动 pageview。[官方 Vue 接入说明](https://vercel.com/docs/analytics/quickstart)

只接入默认 Page Views，不添加按钮事件、漏斗、用户标识、战斗配置、JSON 方案、自定义属性或业务数据上报。
使用 SDK 默认 mode/environment 检测，没有伪造本地 Production 环境、强制启用 Debug、修改 SDK 端点或读取真实部署环境变量。
上述为源码与构建核验；浏览器实际请求、统计去重和 Dashboard 是否收到 Page Views 尚未人工验收。

维护者需在已有 Vercel 项目的 Analytics 页面确认 Web Analytics 已启用，并在下一次版本部署后检查首页、客户端进入模拟器、深链接及刷新产生的 Page Views。

## 3. CI

[CI Workflow](../../.github/workflows/ci.yml) 的行为：

| 项目              | 配置                                                 |
| ----------------- | ---------------------------------------------------- |
| Workflow 名称     | CI                                                   |
| 触发              | develop Push；目标为 develop 或 main 的 pull_request |
| Job ID / 显示名称 | validation / Validation，名称固定不随分支变化        |
| Runner / 超时     | ubuntu-latest / 20 分钟                              |
| 权限              | contents: read，无部署 Secret                        |
| 并发              | `ci-${{ github.event.pull_request.number             |     | github.ref }}`，取消同组旧运行 |
| Node              | 24.x；安装前检查 `>=24.12.0 <25`                     |
| npm               | package-lock.json Cache，npm ci 安装                 |

依次执行现有 npm scripts：type-check、test、lint、validate:i18n、build。
不设置 paths 过滤，避免必需检查因路径过滤没有运行；不新增 main Push CI、矩阵、更新器、Benchmark、浏览器测试、定时任务或写权限。
format:check、validate:game-data、validate:planner-templates 保持本地维护与发布前用途，本轮没有增加 CI 执行范围。

两个 Workflow 的官方 Actions 均按本轮已核实的 v7 Commit 固定：

- actions/checkout：`3d3c42e5aac5ba805825da76410c181273ba90b1`，persist-credentials: false。
- actions/setup-node：`949feb2413d6458794dcd2491c4babbbce0c15c1`。

普通 PR CI 不引用 Vercel Token、项目部署密钥或其他 Secrets，也不自动修改或提交文件。
远程 GitHub Runner 的 npm ci 与 CI 执行尚未触发，首次 Push 后由用户确认实际结果和稳定检查名称。

## 4. 手动 Preview

[Preview Workflow](../../.github/workflows/vercel-preview.yml) 名称为 Vercel Preview Deployment，只声明 workflow_dispatch，没有 push、pull_request 或 schedule。
Job 为 Deploy Preview，使用 ubuntu-latest、20 分钟超时和 contents: read。
并发按 `vercel-preview-${{ github.ref }}` 分组，同分支的新手动运行可取消旧运行，不同分支互不取消。

### 来源与凭证保护

第一步拒绝 main 和非分支 Ref；develop 为主要来源，已审阅的其他功能分支也允许。
Checkout 指定 `${{ github.sha }}`，部署的是此次选择的不可变 Commit，不固定为 main，也不在运行时再拉取 develop 最新分支头。
主分支误选在 Checkout、安装 CLI 和访问部署凭证之前失败，提示用户选择 develop 或功能分支。

维护者在 Repository Secrets 配置 VERCEL_TOKEN、VERCEL_ORG_ID 和 VERCEL_PROJECT_ID。
这些引用只出现在部署步骤的 env 中，不设置为 Job 全局环境；安装 CLI、普通 CI 和来源 Guard 均没有 Token。
部署步骤逐项检查是否为空，错误只输出 Secret 名称，不输出值。
本轮没有获取真实值或使用真实 Secret 执行验证；Guard 测试使用虚拟 fixture 值和独立环境。

### CLI 方法与已有项目定位

Workflow 安装固定 `vercel@59.16.0`，与参考仓库采用的正式版本一致；CLI 不进入应用 package.json 或锁文件。
已核实此发布包的源码支持 VERCEL_TOKEN 环境变量、VERCEL_ORG_ID / VERCEL_PROJECT_ID 定位和 --non-interactive。
未来手动运行时，先以 `vercel project inspect --non-interactive` 检查已有项目，失败就退出，不运行 project create、link 或其他自动关联命令。
项目身份来自用户配置的两个 ID；用户必须确保它们属于已有 HSR-Game-Tools 项目和正确团队。

部署命令为 `vercel deploy --yes --target=preview --non-interactive`，没有 --prod、Production 域名操作或 Token 命令行参数。
Token 通过环境变量传入。直接由已有 Vercel 项目执行远程构建，不新增 pull/build/prebuilt 流程，也不下载远程环境变量或改变项目设置。

### URL 与执行状态

CLI stderr 保留进度，部署 URL 仅取 stdout。
输出须是单一 HTTPS `.vercel.app` Origin，拒绝 HTTP、其他 Host、带路径或其他 CLI 文本，然后才写入 Log、Step Output 和可点击的 Step Summary。
Summary 同时包含 Ref 和完整 Commit SHA；没有把 URL 写入仓库、文案或长期配置。

本轮没有安装并运行真实 Vercel CLI，没有项目 inspect 远程调用，没有 Preview 部署或 Workflow Dispatch。
已有项目权限、云端构建、Deployment Protection 和 URL 实际可用性仍待用户首次手动运行验收。

## 5. Production 与 Vercel Git 过滤

根 vercel.json 在原 Rewrite 后增加：

```json
"git": {
  "deploymentEnabled": {
    "**": false,
    "main": true
  }
}
```

原 `$schema` 与 `/(.*)` → `/index.html` Rewrite 完整保留，没有修改 Vue Router History、Base、路由名称或输出目录。
官方规则规定：若分支命中多条规则，任一匹配值为 true 就允许部署，因此 main 保持自动部署，develop 和其他合法功能分支不自动部署。[官方 Git 配置](https://vercel.com/docs/project-configuration/git-configuration)
临时检查按相同 minimatch / any-true 语义验证 main、develop、feature/cicd、release/test 四个分支。

Production 继续使用已有 Git Integration；维护者需确认 Vercel Production Branch 是 main。
没有 Actions Production Workflow，没有将 deploymentEnabled 设置为全局 false，也没有改变远程项目、构建设置或域名。
显式手动 CLI Preview 不属于 Git 自动部署触发；正常 npm run build 无法证明远程过滤已生效。

用户需在这次配置进入各对应分支后确认：develop Push / PR 不产生自动 Preview，main PR 合并后创建 Production，手动 Preview 可用且不影响 Production。

## 6. GitHub Ruleset：用户手动配置

**本轮没有设置 main 分支保护，也不声称 main 已受 Ruleset 保护。**
仓库公开信息在规划阶段显示 public、默认分支 main；本轮没有读取账户套餐、修改可见性或操作远程规则。

在 Settings → Rules → Rulesets 创建仅针对 main 的 Branch Ruleset，Enforcement 设为 Active，无常规 Bypass：

| 规则                                             | 用户应选择的值                                           |
| ------------------------------------------------ | -------------------------------------------------------- |
| Require a pull request before merging            | 开启                                                     |
| Required Approvals                               | 0                                                        |
| Require status checks to pass before merging     | 开启，选择实际 GitHub Actions 的 Validation              |
| Require branches to be up to date before merging | 保持严格检查；后续 PR 若落后 main，先在开发分支同步 main |
| Block force pushes                               | 开启                                                     |
| Restrict deletions                               | 开启                                                     |

不要要求参考仓库的 Development/Correctness 检查，不将手动 Preview 或 Vercel 自动部署检查加入必需门禁，也不对 develop 套同样严格的保护。
准确选项依据 [GitHub Ruleset 规则](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)。

如果当前控制台套餐或权限限制 Ruleset，可在 Settings → Branches 使用传统 Branch Protection 设置相同 PR、Validation、分支更新、禁止 Force Push/删除及不允许绕过的规则。
如果传统保护也不可用，维护者需处理权限或套餐限制；本地 AGENTS.md 和流程约定不能替代实际远程强制保护。

## 7. 首次启用顺序

1. 在已有 Vercel 项目确认 Web Analytics、Production Branch=main、Node 24.x 满足版本范围；在 GitHub 配置三个 Repository Secrets，不向 Agent 提供值。
2. 用户在 develop 提交本轮修改并 Push，让 CI 首次运行。
3. 创建 develop → main PR，确认固定 Validation 检查出现且通过。
4. 用户设置 main Ruleset，再合并 PR。
5. 等待现有 Vercel Git Integration 自动更新 Production，人工核对深链接、主要模拟器功能和 Analytics Page Views。
6. Workflow 文件进入默认分支 main 后，在 Actions → Vercel Preview Deployment → Run workflow 选择 develop，或已审阅的非 main 功能分支。
7. 查看 Log / Step Summary 中的 Preview URL、Ref、SHA，确认 Preview 可用且没有改变 Production；再次确认 develop Push / PR 不自动创建 Preview。

workflow_dispatch 文件必须先位于默认分支，Bootstrap 合并前缺少手动入口是预期情况。[GitHub 手动运行要求](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
本轮不代替维护者完成以上 Commit、Push、PR、规则设置、合并或部署动作。

## 8. 验证结果

| 检查                                            | 状态    | 实际结果                                                                                                                                                  |
| ----------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm run type-check                              | Passed  | Vue 和工具／测试 TypeScript 检查通过                                                                                                                      |
| npm test                                        | Passed  | 21 文件、217 用例通过，11 组历史迁移基准保留；使用沙箱外执行避免既有临时缓存 EPERM                                                                        |
| npm run lint                                    | Passed  | ESLint 全仓检查通过                                                                                                                                       |
| npm run format:check                            | Passed  | 全仓 Prettier 检查通过，仅定向格式化实际修改文件                                                                                                          |
| npm run validate:i18n                           | Passed  | 双语结构、Key、插值参数和语法通过；Site Messages 未修改                                                                                                   |
| npm run build                                   | Passed  | Vite 8.3.4 生产构建通过，2188 modules transformed                                                                                                         |
| Workflow YAML / 结构                            | Passed  | 复用 Prettier 自带 YAML 解析器，检查 Trigger、固定 Job、权限、步骤、SHA Checkout 和并发                                                                   |
| Workflow Bash 语法                              | Passed  | Git Bash 只执行 bash -n，不运行安装或部署命令                                                                                                             |
| Preview 来源 Guard                              | Passed  | main / 标签拒绝，develop / feature/cicd / main-preview 允许，共 5 个案例                                                                                  |
| 缺失凭证 Guard                                  | Passed  | 分别缺失 3 个 Secret 时停止；虚拟值不打印，完整虚拟值通过                                                                                                 |
| Node Guard                                      | Passed  | 每个 Workflow 验证 24.12、24.21 通过，24.11、25、22 拒绝                                                                                                  |
| Preview URL Guard                               | Passed  | 合法虚拟 Vercel HTTPS Origin 通过，5 个错误 URL／输出案例拒绝                                                                                             |
| Vercel JSON / 已用 Schema 字段                  | Passed  | 合法 JSON；原 Rewrite 不变；按官网原始字段和 definitions 校验本项目使用的 $schema、rewrites、git                                                          |
| 完整官方 Schema 元校验                          | Failed  | 官网声明 Draft-04，但无关 experimentalTriggers.retryAfterSeconds 使用数值 exclusiveMinimum；本地已有 Ajv 的 Draft-04 元校验拒绝该混用，不是本项目配置失败 |
| 分支匹配                                        | Passed  | main、develop、feature/cicd、release/test 四个案例符合 any-true 规则                                                                                      |
| Analytics / 锁文件 / 原 App 逻辑                | Passed  | 只有一个新包、原锁文件包记录不变、根挂载一次、原 App 内容完整保留，SDK 进入客户端 Bundle                                                                  |
| git diff --check                                | Passed  | 全部跟踪修改通过；新增文件另核对空白和最终换行，编辑文档的本地链接与锚点均有效                                                                            |
| 远程 CI / Ruleset / 部署过滤                    | Skipped | 未 Push、Dispatch、部署、读取真实凭证或修改控制台；用户首次启用后验收                                                                                     |
| 浏览器 Page Views / Preview / Production / 路由 | Skipped | 按既有约定由用户人工验收，没有运行浏览器自动化                                                                                                            |

### 验证方法与限制

临时校验脚本位于系统临时目录，复用已有 Prettier YAML、Ajv 和 minimatch，不新增工具依赖或跟踪测试脚本。
Bash 在沙箱内受 MSYS 命名对象权限阻断，因此只读语法和虚拟 Guard 检查在沙箱外重跑通过。
语法检查不会执行 npm install 或 vercel 命令；只单独执行了来源 Guard、凭证 Guard 和 URL / Node 判断，没有使用真实 Token，也没有模拟整套部署来冒充线上成功。

从官方站点下载的完整 Vercel Schema 在与本项目无关的实验字段存在 Draft 声明和关键词版本混用，故全量元校验如实记录 Failed。
实际配置仅含三个字段，临时检查按官方对应字段定义及原有 definitions 构造适用范围的 Schema，保持元校验开启、拒绝额外字段，没有关闭项目校验或改写官方字段规则来获得通过。
这证明本项目所用字段合法，不能代表平台实际 Git 过滤、部署身份或线上 Rewrite 已验证。

### 构建结果

dist 共 107 个文件、3,638,236 字节（约 3.47 MiB）。主入口 JS 为 374,841 字节，行动序列 JS 为 397,729 字节，NotFound JS 为 375 字节。
主 Bundle 包含 @vercel/analytics 和默认 Insights 脚本路径；101 张 WebP 与第三方公开通知等 102 个 public 文件逐字节一致。
没有变更 CSS、模拟器引擎或持久化代码，也没有新增上游构建依赖。

### 安装时的既有告警

npm audit 报告 5 个 high 包级告警：@vue/eslint-config-typescript、fast-glob、micromatch、braces 和 sharp；Analytics 不在该清单。
对照 HEAD 确认这些包的版本、完整锁记录均未变化，不能将它们写成本轮 SDK 引入的告警；本轮也不能宣称依赖安全审计全绿。
原始诊断保存于忽略的 .cache 中，相关公告为 [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)、[sharp/libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c)、[sharp/librsvg](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)。
没有执行 npm audit fix、force 更新或调整原有依赖；维护者可另行评估，不能以本轮 CI 配置变更替代依赖修复。
npm 安装还提示既有 esbuild 安装脚本尚未列入 allow-scripts；未修改该策略，当前本地构建已实际通过，首次 GitHub npm ci 仍需验收。

## 9. 剩余事项与最终边界

用户需要完成的操作为：配置三个 Repository Secrets、确认 Analytics / Production Branch / Node、Push develop、PR、设置 main 保护、合并、确认自动 Production、手动 Preview 及人工页面访问验收。
另外保留上述既有依赖告警和官方完整 Schema 元校验限制，不扩展为新的大规模维护 Roadmap。

修改 7 个已有文件：package.json、package-lock.json、App.vue、vercel.json、AGENTS.md、development.md 和 investigations/README.md。
新增两个 Workflow 和本报告。根 README、引擎、现有测试、文案、持久化 Schema、资源、许可证和历史报告均保持原样。
没有修改 GitHub Ruleset、Repository Secrets、Vercel 项目或域名，没有调用真实 Vercel CLI、Workflow Dispatch、Git Commit / Push 或任何 Preview / Production 部署。

三个只读参考仓库的开始状态如下；最终只读复核确认分支、HEAD 和干净工作区均与开始一致。本仓库保持 develop 和原 HEAD，只有本报告列出的未暂存修改及新增文件：

| 仓库              | 分支    | HEAD                                     | 开始工作区 |
| ----------------- | ------- | ---------------------------------------- | ---------- |
| HSR-Database      | develop | 0898487b3b048d9bd6af9d734208590deb38737a | 干净       |
| StarRailRes       | master  | dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487 | 干净       |
| TurnBasedGameData | main    | 312b4597691e0a29cf9828a15b592757dba86949 | 干净       |

本轮停止于仓库内容、静态验证和报告交付，远程 CI/CD 生效状态尚待用户配置与首次运行确认。
