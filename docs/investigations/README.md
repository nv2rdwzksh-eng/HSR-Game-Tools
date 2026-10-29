# 历史调查与实施报告

本目录保存各阶段的调查、设计决策、实现结果和验证证据；现行入口见[文档导航](../README.md)。
报告中的“当前”“尚未实现”“推荐方案”、版本、数量、测试结果及浏览器记录只描述其原日期与阶段。
维护当前系统时以[现行架构](../architecture/action-order-simulator.md)、[UI 规范](../design-notes.md)和对应维护指南为准，不用阶段报告覆盖今天的契约。

## 迁移与独立工程

- [Phase 0 独立迁移架构调查](phase-0-migration-architecture.md)：旧工程取证、迁移边界、来源固定与早期方案。
- [Phase 1A 独立工程基础](phase-1a-independent-foundation.md)：引擎迁移、规范化数据与工程隔离验证。

## UI 组件库与编辑器

- [Phase 1B-0 组件库与设计系统](phase-1b-component-library-spike.md)：PrimeVue 原型和主题选型验证。
- [Phase 1B-1 真实编辑器](phase-1b-functional-action-planner-editor.md)：配置、操作编辑、响应式与原阶段验收。

## 持久化与初始编队

- [Phase 2A 方案、模板与敌方编队](action-planner-persistence-templates-enemy-setup.md)：Version 1 当时的文件边界、自动存档与初始敌人接入。

## 轮次系统

- [Phase 2B Endgame 轮次](action-planner-endgame-cycle-system.md)：MoC / AA 边界与当时 Version 2 的实现记录。

## 阿哈时刻

- [Phase 2C-0 架构调查](action-planner-aha-instant-architecture.md)：阿哈设计与 Version 3 的实施前方案，不代表尚未接入。
- [Phase 2C-1 功能实施](action-planner-aha-instant-implementation.md)：阿哈身份、派生速度、生命周期和 Version 3 接入验证。

## UI 与 Presentation 优化

- [UI Polish 与 Site Messages](action-planner-ui-polish-localization.md)：语义命名、Metadata、目标与交互收敛。
- [当前队列重构](action-planner-current-queue-view-reconstruction.md)：事件入口状态、独立队列游标与展示修复。
- [速度 Modifier Tag 展示](action-planner-speed-modifier-visualization.md)：实际生效效果、持续信息与无障碍呈现。

## 文档收尾

- [全仓技术债清理与稳定化](repository-stabilization-closeout.md)：近期迭代后的引用审查、跨平台路径修复、共享图片状态、失效消息清理及完整维护验收基线。

- [部署前文档整理](pre-production-documentation-closeout.md)：现行文档体系、迁移去向、准确性与文档验证结果。
- [第三方来源与发布通知现状](../third-party/README.md)：项目 MIT 与独立第三方条款、静态产物通知及发布前待确认事项。
- [部署前深度清理与 Vercel 准备](pre-deployment-deep-cleanup.md)：Dead Code、测试与动态消息审查、SPA Rewrite 和部署前工程验证。

以上原有 11 份报告保持原路径、结论、测试数据及来源 Commit，不批量搬迁、合并或格式化。
新增功能的当前规则进入现行规范；实施经过与实验结果继续按主题记录于此，并从索引提供入口。

## 上线后工程维护

- [CI/CD 基础接入](post-production-cicd-foundation.md)：Vue Web Analytics、轻量 Validation CI、手动 Preview、main 自动 Production 与控制台初始化步骤。

## 通用离场与批量预设

- [离场、事件变速与卡厄斯兰那预设](action-planner-off-field-khaslana-preset.md)：AG 冻结、事件独立速度基数、跨节点原子提交、Version 3 兼容与人工验收清单。

## Warp Simulator

- [结果展示纠正性重构](warp-simulator/result-display-correction-2026-10-21.md)：角色全幅高清卡片、JSON 头部校准器、单件 viewport 居中及验证记录。

- [Phase 1M Identity 尺寸修复](warp-simulator/phase-1m-identity-size-correction.md)：固定 160px 命途显示上限、星星整体缩放与 Node 真实组件挂载回归。

- [Phase 1M 五星 V3 动画](warp-simulator/phase-1m-five-star-reveal-animation.md)：实际命途映射、StarBig 资源管线、六图就绪门控、固定比例构图与演出回归验证。

- [Phase 1M 控制间距与资源同步](warp-simulator/phase-1m-control-panel-spacing-and-visual-refresh.md)：局部 Drawer 留白、透明 Tabs 背景、当前卡池全部视觉资源及数据驱动的集成校验。

- [Phase 1L 控制面板与星缘持久化](warp-simulator/phase-1l-control-panel-and-affinity-persistence.md)：五类卡池导航、UP 缩略图、保底分组、共享星缘资格校验及浏览器存储。

- [Phase 1K 全屏 Artwork 信息面板](warp-simulator/phase-1k-reveal-metadata-overlay.md)：三行本地化物品信息、舞台定位、同步淡入与无障碍描述及验收步骤。

- [Phase 1J Metadata 排版精修](warp-simulator/phase-1j-metadata-layout-refinement.md)：卡片专用透明裁切星级、统一单颗星尺度、两行居中信息簇及验收清单。

- [Phase 1I 演出与资源修复](warp-simulator/phase-1i-reveal-quality-fixes.md)：五星同步组合、独立高清资源与 DPR 限制、星级溢出修复及人工验收清单。

- [Phase 1F 视觉资源与 UI](warp-simulator/phase-1f-visual-refinement.md)：离线图片提取、横向结果卡、双侧抽屉、五列历史与验证证据。

- [Phase 1E 可交互 UI](warp-simulator/phase-1e-ui-implementation.md)：页面内会话、星缘选择、结果／历史、资源复用及人工验收清单。
- [Phase 1D 纯引擎开发](warp-simulator/phase-1d-engine-implementation.md)：v0.3 模型、严格卡池解析、原子状态转移与独立概率验证。
- [Phase 1C 多工具项目结构重构](warp-simulator/phase-1c-project-restructuring.md)：工具目录归属、已有本地卡池配置保护、数据完整性与迁移验收。
- [Phase 0 架构与概率模型调查](warp-simulator/phase-0-investigation.md)：旧实现取证、来源与规则证据边界。
- [Phase 1 数据基础设施](warp-simulator/phase-1-data-foundation.md)：独立轻量目录、人工 JSONC、IntelliSense、验证和静态快照。

## Currency Wars Optimizer

- [Astral UI 第一版迁移](currency-wars-astral-ui-migration.md)：局部主题、源码包接入、配置与结果改版、两仓接口及自动验证和人工验收边界。

- [Issue #7 星徽需求与合成配方](currency-wars-emblem-crafting-issue-7.md)：按选中候选汇总星徽，独立赛季配方目录与材料图片、全部替代配方、资源隔离及本地验收。

- [Issue #6 领航员继承 Hotfix](currency-wars-navigator-inheritance-hotfix.md)：只继承固有流派与开拓者明确授予的流派，保留星徽目标资格，并记录回归及验证结果。

- [Issue #4 特殊规则与多方案实施报告](currency-wars-issue-4-implementation.md)：开拓者继承、候选资格、完整配置排除、批次状态、真实快照 Benchmark 与人工验收。

- [控制台原型 V1 实现报告](currency-wars-v1-implementation.md)：锁定数据、MILP、特殊羁绊边界、性能与检查记录。
- [网页 UI MVP 实现报告](currency-wars-ui-mvp-implementation.md)：Worker/WASM 接入、纯展示元数据、资源映射与人工验收边界。

- [网页 UI 优化实施报告](currency-wars-ui-polish-implementation.md)：任务优先配置、阵容优先结果、真实羁绊图标、回归检查与本地人工验收清单。
