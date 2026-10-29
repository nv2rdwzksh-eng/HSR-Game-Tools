# 部署前文档整理报告

日期：2026-10-14，Asia/Shanghai。范围仅 HSR-Game-Tools Markdown 文档，开始 HEAD 为 `734842c519baf67e98f0a701a94526188870815d`，工作区干净。
参考 HSR-Database `develop` 的文档层级，固定参考 Commit 为 `0898487b3b048d9bd6af9d734208590deb38737a`；未照搬其三仓构建、pnpm、Playwright、CI 或部署流程。

## README 与目录

根 README 从 194 行精简至 65 行，保留项目、工具状态、技术栈、启动、文档、来源和免责声明。
正式名称为“行动序列模拟器 / Action Order Simulator”，抽卡与遗器工具仍为未迁移的规划项。

```text
HSR-Game-Tools/
├── README.md
├── AGENTS.md
├── docs/
│   ├── README.md
│   ├── development.md
│   ├── design-notes.md
│   ├── site-messages.md
│   ├── game-data.md
│   ├── architecture/action-order-simulator.md
│   ├── investigations/
│   │   ├── README.md
│   │   ├── pre-production-documentation-closeout.md
│   │   └── 原有 11 份报告（路径与内容不变）
│   └── third-party/README.md（既有许可文本保留）
└── src/tools/action-planner/templates/plans/README.md（维护入口）
```

## 内容去向与权威来源

| 原 README / 阶段性内容                       | 现行位置                                                                   |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| 环境、代理、npm 命令、验证与预览             | [development.md](../development.md)                                        |
| 双语消息、插值、命名、首页简介与数值格式     | [site-messages.md](../site-messages.md)                                    |
| 快照、来源锁定、图片、更新器与回滚           | [game-data.md](../game-data.md)                                            |
| 引擎、编辑状态、轮次、阿哈、Version 3 与存档 | [模拟器架构](../architecture/action-order-simulator.md)                    |
| 完整方案与人工审阅模板流程                   | [方案与模板维护](../architecture/action-order-simulator.md#方案与模板维护) |
| UI 主题、布局、卡片、Tag、图标与无障碍       | [design-notes.md](../design-notes.md)                                      |
| 阶段报告链接                                 | [历史索引](README.md)                                                      |
| 第三方 provenance 和待确认发布事项           | [第三方说明](../third-party/README.md)                                     |

AGENTS.md 保留根入口和关键操作约束，复杂规则引用现行指南；模板目录 README 同样改为维护入口，避免重复完整流程。
原有 11 份报告保留原始结论、测试数据、日期与 Commit SHA；新增索引说明其历史身份。

## 已解决的文档冲突

- 设计规范中的 Phase 2B / Version 2 状态不再作为现行文件规则；当前导出为 Version 3，严格兼容 Version 1/2。
- 模板目录旧说明漏列 Version 2；现按实际解析器说明支持范围，新模板统一导出 Version 3。
- 旧 README 将装备 128×128 容易理解为独立转换上限；现区分当前图片尺寸与更新器统一 maxSize 256、禁止放大的策略。
- “本轮未实现”“未来预计分发”等早期语境改为当前实现、实际构建输入和明确发布待办，来源 Commit 不随参考仓库更新。
- 数学、身份、存储和模板规则收敛到现行架构，UI 与消息指南分别持有展示和文案规则；历史 Version 1/2 记录不被重写。

## 内容与文档验证

现行规则通过只读核对 package.json、工具目录、引擎、编辑 / 存储 / 文件解析器、模板、主题、消息、更新器、Source Lock 和 Manifest 整理。
已确认快照为 4.6.0、98 个角色、3 个预设、101 张 WebP，作为该锁定版本的事实记录，不作永久数量契约。

首页已通过用户本地人工验收，此为用户提供的状态；本轮没有运行真实浏览器，也不将此前测试或验收结果写为本轮执行结果。
本轮实际验证结果：

- 12 份新增或编辑的 Markdown 通过定向 Prettier 检查；检查显式使用 .gitignore，不格式化未编辑的历史报告。
- 临时脚本检查标题层级、代码块、表格、122 个内部文件 / 目录链接及其中 8 个标题锚点，未发现错误。
- 原有 11 份报告全部进入索引，内容 SHA-256 与开始基线完全一致；全部 225 个受保护文件（非 Markdown 与原历史报告）未变。
- 6 个第三方来源链接经维护者现有系统代理只读检查，均返回 HTTP 200；不对历史报告中的全部外链作重新验收。
- git diff --check 通过；新增与修改仅为 Markdown，三个来源仓库的分支、HEAD 和工作区状态均与开始记录一致。

临时脚本和验证 JSON 留在系统临时目录，不新增仓库工具链；上述结果仅证明本轮文档检查，不代表执行了游戏数据校验、引擎测试或构建。

## 发布前待确认与后续工作

项目整体许可证、规范化数据及派生内容的许可义务、游戏图片再分发条件，以及公开应用的归属 / 通知提供方式仍需维护者确认，详见第三方说明。
文档整理不构成这些事项已解决的结论。

后续需由用户验收现行文档、确认许可与发布材料，再单独授权选择宿主、地址、SPA 回退和部署配置；届时按实际部署范围执行工程验证。
本轮没有部署地址承诺，不运行数据更新、Benchmark、单元测试、Production Build 或浏览器自动化，不提交、推送或部署。
