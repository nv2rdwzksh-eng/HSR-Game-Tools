# Phase 1C：多工具项目结构重构

日期：2026-10-15。目标仓库：HSR-Game-Tools，分支：develop；实施前后 HEAD 均为 `783dc666fbb0b8b01db96c333bd49e8a62f64868`。本轮仅实施结构迁移，没有新增跃迁概率引擎、会话、抽取功能或页面。

## 基线与已有修改保护

开始时存在四个未提交文件：`scripts/warp-data/banners.jsonc`、`scripts/warp-data/schema/banner-config.schema.json`、原 `src/data/warp/snapshot.json` 和原 `src/data/warp/manifest.json`。本轮以工作区内容为基线，没有用 Git HEAD 中的空卡池覆盖维护者配置。

实施前将 264 个已跟踪文件的工作区内容、SHA-256 inventory、原始 binary diff 和四个仓库的 Git 状态备份到系统临时目录 `/private/tmp/hsr-phase1c-6typexqd/`。这是本机临时恢复材料，不是项目运行依赖或永久归档。

迁移前类型检查、ESLint、两套数据校验与 Production Build 通过。单元测试为 317/318 通过：唯一失败是历史真实产物测试仍假定零卡池。经维护者明确选择，仅将该测试的物品／共享池／Banner 数量更新为 86／1／1，保留 `incomplete` 和 5 个 pending；未放宽校验、改写数据或更改其他断言语义。

## 目录映射与模块边界

以下路径相对于 HSR-Game-Tools 根目录：

| 迁移前                                  | 迁移后                                             |
| --------------------------------------- | -------------------------------------------------- |
| `src/engine/action-planner/`            | `src/tools/action-planner/engine/`                 |
| `src/views/ActionPlannerPage.vue`       | `src/tools/action-planner/ActionPlannerPage.vue`   |
| `src/data/schema.ts`                    | `src/tools/action-planner/data/schema.ts`          |
| `src/data/adapters/`                    | `src/tools/action-planner/data/adapters/`          |
| `src/data/game/`                        | `src/tools/action-planner/data/game/`              |
| `src/components/ui/GameIcon.vue`        | `src/tools/action-planner/components/GameIcon.vue` |
| `src/data/warp-schema.ts`               | `src/tools/warp-simulator/data/schema.ts`          |
| `src/data/warp/`                        | `src/tools/warp-simulator/data/runtime/`           |
| 原 `tests/unit/` 中的排轴与排轴数据测试 | `tests/unit/action-planner/`，保留文件名           |
| `tests/unit/warp-data.test.ts`          | `tests/unit/warp-simulator/warp-data.test.ts`      |
| `tests/unit/vercel-preview.test.ts`     | `tests/unit/infrastructure/vercel-preview.test.ts` |
| `tests/fixtures/` 中的四个文件          | `tests/fixtures/action-planner/`，保留文件名       |

共迁移 46 个文件。排轴 model、composables、components、templates 的职责不变，engine 继续只依赖自身纯 TypeScript 模块。GameIcon 仅被排轴使用，且直接依赖其快照 Adapter，因此归入工具组件；共享 UI 不再反向引用工具业务模块。

全站 Router、i18n、主题、样式、工具 catalog、首页、404、GithubIcon 和 `public/game-assets/` 保持共享。两个工具不直接依赖对方内部实现，不新增共享抽象、re-export 包装、package 或依赖。

`/action-planner` 保持动态导入，仅更新入口文件位置。Warp 不注册路由，也不创建尚未实现的 engine、model 或 components 空目录。方案版本、localStorage 键、身份分配、回放、事件排序和 UI 模板不变。

维护脚本继续位于 `scripts/game-data/` 与 `scripts/warp-data/`，全部 npm 命令、参数保持原样。生成器、校验器、发布器、Benchmark、测试中的根目录定位与路径断言，以及忽略规则已同步。Vite、TypeScript、Vitest 和 ESLint 现有 alias／通配范围已覆盖新目录，无需修改配置或 package-lock。

Warp 发布器继续整体替换目标目录，但目标限定为 `data/runtime/`，不会替换包含 `schema.ts` 的 `data/`。原独占锁、staging、备份、失败回滚和输入变更检测机制不变。排轴发布器仍只替换其 `data/game/` 和共享图片目录。

## 数据完整性

以下文件在迁移前后逐字节、字节数及 SHA-256 一致；Warp 运行时路径变化不改变 Manifest 中相对文件名或输入哈希：

| 文件（迁移后路径）                                    |  bytes | SHA-256                                                            |
| ----------------------------------------------------- | -----: | ------------------------------------------------------------------ |
| `scripts/warp-data/banners.jsonc`                     |  3,910 | `dd64c0b249bc3e032bdb56f878c72a0654946236d12313a13a045218c630e225` |
| `scripts/warp-data/schema/banner-config.schema.json`  | 92,976 | `901956d13024e65d06458164a2470a479e7155dc5f83e5887da7b231cec76a2c` |
| `scripts/warp-data/generated/catalog.json`            | 48,241 | `63974b7f4e0d5a6ddd3a171768f64d123fe8f1cfa884ecfeaf55ef6df1104118` |
| `scripts/warp-data/generated/gacha-index.json`        | 20,175 | `ad0bd81343bb949683e3650bb046ececb1be95d6b275269f8fc736873e40d609` |
| `scripts/warp-data/generated/manifest.json`           | 44,401 | `c9bb782a9d085cf80125b7ef7625c5189bb3532a753c2c2ece2c1f9d2dcec5ab` |
| `src/tools/warp-simulator/data/runtime/snapshot.json` | 17,703 | `ae2c48bd0f9493b25665796b26ff0136651e56eba1fc31f1de352e27d83ab0c0` |
| `src/tools/warp-simulator/data/runtime/manifest.json` |    947 | `bb4059bebeb140731f93bc0215cd807f132efc6a6dc1031e0def9675e177ca7c` |
| `src/tools/action-planner/data/game/catalog.json`     | 63,169 | `921853d55ce60a03b928edaa85cd7f61ba9840cfbc83f226211550e1a226e828` |

排轴 Manifest 仅将 inventory 中的 `src/data/game/catalog.json` 键替换为迁移后的路径；其余字节、生成时间、来源、内容哈希及资源记录不变。101 张共享 WebP、8 个引擎文件和历史预期 JSON 同样逐字节一致。检查全部 99 个 TypeScript／Vue 源文件与测试，忽略导入／URL 路径、文件系统迁移字面量和已授权的三项数量预期后，内容一致；未修改业务实现或 Vue 模板。

维护者已配置的数据完整保留：

- `event-avatar-default`：25 个三星、53 个四星、7 个五星候选，成员顺序及来源说明“来自游戏内数据。”不变。
- GachaID `2139`：`event-avatar`，`pity:event-avatar`，共享池引用不变；五星 UP 为真珠 `avatar:1503`；四星 UP 依次为 `avatar:1201`、`avatar:1214`、`avatar:1312`，来源说明“4.6 版本角色活动跃迁”不变。
- 运行时仍为 86 个物品、1 个共享池、1 个 Banner；5 个 pending 原样保留，因此配置状态继续为 `incomplete`，未重新推断真实名单或清理待办。

在系统临时副本中使用现有配置运行 `generate:warp-schema`、`build:warp-data` 和 `validate:warp-data`。重新生成的 Schema、快照和 Manifest 与工作区字节完全相同，构建前后 TypeScript Schema 原字节保留。真实工作区没有运行生成命令，也没有运行任何上游数据更新器。

## 本地验证结果

环境：Node **24.19.0**、npm **11.17.0**。使用已安装依赖，无网络请求、依赖升级、浏览器自动化或远程工作流。

| 检查                                                | 结果                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `npm run type-check`                                | 通过，包含 Vue、应用、脚本和测试                                                                       |
| `npm run lint`                                      | 通过                                                                                                   |
| `npm test`                                          | 25 个文件、318 项全部通过，含排轴引擎、持久化、11 个历史迁移用例和 Warp 失败回滚                       |
| `npm run validate:game-data`                        | 通过：98 角色、3 预设、101 图片，missing／diagnostics 均为 0                                           |
| `npm run validate:warp-data`                        | 通过：86 items、1 sharedPool、1 readyBanner、5 pending、incomplete                                     |
| `npm run validate:planner-templates`                | 通过，生产模板目录仍为空                                                                               |
| `npm run validate:i18n`                             | 通过                                                                                                   |
| `npm run build`                                     | 通过，仍为 2188 modules；独立 `ActionPlannerPage-Dr17bFB1.js` 为 406.20 kB，与迁移前输出名称和大小一致 |
| 临时副本 Schema／Warp 显式构建                      | 通过，输出逐字节一致，不覆盖 Schema 源码                                                               |
| 数据、图片与历史预期文件完整性                      | 110 个受保护文件逐字节一致；排轴 Manifest 仅迁移一个路径键                                             |
| 模块边界与可跟踪性                                  | 无跨工具内部依赖、无共享 UI 到工具业务依赖；迁移文件均未被 Git 忽略                                    |
| 定向格式、文档链接、旧路径扫描与 `git diff --check` | 通过；历史正文中的旧路径作为历史证据保留                                                               |

使用本机 VS Code 内置 JSON Language Server，通过 stdio LSP 在内存中打开 JSONC，限定 Schema 解析协议为本地 `file`，没有修改配置文件或安装扩展：

| IntelliSense 检查                     | 结果                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------- |
| 原 JSONC 相对 `$schema`、注释与尾逗号 | 0 条诊断                                                                |
| 角色五星 UP                           | 75 个候选，均为五星 avatar                                              |
| 光锥四星 UP                           | 73 个候选，均为四星 light-cone                                          |
| 共享池三星                            | 25 个候选，均为三星 light-cone                                          |
| 当前共享池引用                        | 返回 `event-avatar-default`                                             |
| 物品说明                              | 中英文名称存在于补全说明，内部 ID 候选与 Catalog 类型／星级过滤结果一致 |
| 错类型／星级 ID                       | 返回带位置的诊断                                                        |

光锥补全使用内存合成文档及匹配类型的 GachaID，未将合成内容写入人工配置，未改动项目 Schema。

## 文档、Git 收尾与遗留事项

现行架构、游戏数据维护、开发指南和第三方 Manifest 链接已更新，调查索引新增本报告。历史报告仅修复一个失效的源码链接，没有改写历史内容或批量格式化。

收尾时目标仓库仍在 develop、HEAD 未变。Git 变更包含维护者原有四项修改及本轮源码／测试迁移、路径修正和文档；未 stage、commit、push、部署或修改远程配置。未修改旧抽卡模拟器或其他相邻仓库。三个只读来源的分支、HEAD 和干净状态与实施前一致：

| 仓库              | 分支    | HEAD                                       |
| ----------------- | ------- | ------------------------------------------ |
| HSR-Database      | develop | `0898487b3b048d9bd6af9d734208590deb38737a` |
| TurnBasedGameData | main    | `312b4597691e0a29cf9828a15b592757dba86949` |
| StarRailRes       | master  | `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487` |

真实浏览器与编辑器键盘交互仍由维护者人工验收，不能将上述静态检查和语言服务探针视为人工 UI 验收。建议检查：

1. 首页进入 `/action-planner`，直接访问并刷新该路由；确认 Warp 仍没有页面入口。
2. 两种语言及 1440px／1024px／390px 下，检查排轴布局、图片与操作编辑；修改速度、执行操作、切换节点，确认队列与 Inspector 展示正常。
3. 恢复已有本地存档，导入历史 Version 1／2 与当前 Version 3 文件，导出再导入，确认保存及受保护存档交互正常。
4. 在 VS Code 打开 `banners.jsonc`，确认 Ctrl+Space、双语说明、共享池引用和非法 ID 诊断；不要把测试输入保存为真实名单。

当前 5 个 pending 和尚未实现的概率引擎／UI 保持原状态。本轮完成后停止，等待维护者验收，不自动进入 Phase 1D。
