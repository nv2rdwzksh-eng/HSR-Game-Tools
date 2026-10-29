# 文档导航

项目介绍与快速启动见[根 README](../README.md)，Agent 操作约束见 [AGENTS.md](../AGENTS.md)。
本页列出的现行指南描述当前实现；历史阶段报告不能覆盖现行规范。

## 当前规范

| 主题                                   | 权威文档                                                     |
| -------------------------------------- | ------------------------------------------------------------ |
| 行动序列引擎、编辑状态、方案格式与模板 | [行动序列模拟器架构](architecture/action-order-simulator.md) |
| 跃迁模型、页面会话、选择、结果与历史   | [跃迁模拟器](architecture/warp-simulator.md)                 |
| 主题 Token、布局、卡片、图标与可访问性 | [UI 设计规范](design-notes.md)                               |
| 中英文消息、语义描述与文案维护         | [Site Messages](site-messages.md)                            |
| 数据快照、来源锁定、资源与显式更新     | [游戏数据维护](game-data.md)                                 |

## 开发与维护

- [开发指南](development.md)：Node / npm、运行与验证命令、代理及测试政策。
- [货币战争羁绊优化器](currency-wars.md)：网页与 CLI、Worker/WASM、任务格式、特殊规则与快照维护。
- [UI 设计规范](design-notes.md)：首页与模拟器的现行展示约定。
- [Site Messages](site-messages.md)：首页简介、操作名称、插值及翻译验证。
- [游戏数据维护](game-data.md)：快照审阅、来源前提、更新与回滚。
- [方案与模板维护](architecture/action-order-simulator.md#方案与模板维护)：完整方案格式、模板审阅与目录登记。
- [项目 MIT License](../LICENSE)：自行编写且拥有许可权的代码与文档的项目级许可。
- [第三方来源与许可](third-party/README.md)：代码、数据、素材、图标和发布前待确认事项。

## 历史资料

[investigations 索引](investigations/README.md)整理迁移、架构调查、功能实施与验证记录。
历史资料中的“当前”“尚未实现”“推荐方案”、版本、数量和测试结果均属于原报告的日期与阶段，不代表今日状态。
已有报告保留原路径；最新全仓维护基线与未解决事项见[稳定化收尾报告](investigations/repository-stabilization-closeout.md)，文档体系整理经过见[部署前文档整理报告](investigations/pre-production-documentation-closeout.md)。

## 文档维护约定

- README 面向仓库访问者，只保留项目介绍和入口，不追加阶段实施经过。
- 新功能的现行规则写入对应规范；实施经过、实验和测量结果写入 investigations。
- 修改现有行为时同步更新对应指南；同一主题只维护一份完整权威规范，其他位置使用链接。
- 历史报告保留原结论、日期、来源 Commit 和测试数据，不通过改写历史掩盖规则变化。
- 优先使用仓库内相对链接；检查文件路径和标题锚点，迁移路径时修复引用。
- 按变更范围验证文档，只格式化实际编辑的文件；纯文档任务不触发数据生成、构建、浏览器验收或部署。
