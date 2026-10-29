# 货币战争优化器 UI MVP 实现报告

> 历史记录：其中 Top-3、多方案接口、预算分割及旧 UI 描述已由 2026-10-20 单方案双目标重构取代；现行行为见[货币战争指南](../currency-wars.md)。原有测量与提交信息保留为历史证据。

日期：2026-10-15（UTC+8）。现行规则及人工验收清单见[使用指南](../currency-wars.md)。

## 范围与结构

目标仓库为 HSR-Game-Tools/develop，基线 HEAD 为 `f35b783eeba97301f149362801ae9a951ff1bf94`，开始时工作区干净。本轮增加 `/currency-wars` 懒加载页面与首页入口，没有引入新依赖、后端、持久化、分享或导入导出，也未执行提交、推送或部署。

收尾核对三个只读来源的分支、HEAD 和干净状态均未改变：TurnBasedGameData/main 为 `312b4597691e0a29cf9828a15b592757dba86949`，HSR-Database/develop 为 `0898487b3b048d9bd6af9d734208590deb38737a`，StarRailRes/master 为 `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`。

主要改动分为四组：

- `CurrencyWarsPage.vue` 与 `components/`：PrimeVue 表单、类型分组任务、结构化结果、费用头像和三个星徽槽。
- `ui/`：浏览器数据适配、页面会话、请求与旧结果关系、资源 URL 和图片失败降级；全部中文／英文 UI 消息放在既有 locale 文件。
- `browser/`：单次 Worker 工厂、消息协议与 WASM 加载器；`solve.ts` 只新增加载器工厂，既有求解与验证流程保持原样。
- `visual-data.ts`、独立展示 JSON／Manifest、构建运行探针与单元测试，以及路由、工具目录、费用 Token 和相应文档。

## 原算法保持情况

按 Git 基线逐字比较，`model.ts`、`evaluate.ts`、`validation.ts`、`types.ts`、算法 snapshot／Manifest、正式 25 项任务文件和 CLI 均未改变。`solveCurrencyWars` 函数体也逐字保持；HiGHS 选项、状态判定、列解码部分与原版仅有工厂作用域及缩进差异。

新增的 `createHighsSolver(loader)` 默认仍按原方法加载 `highs`，供 CLI 使用。浏览器注入带 `locateFile` 的加载方法，继续复用同一函数中的模型选项、零 Gap、可行解判断和数据解码，随后交由原流程做独立验证，没有增加另一套求解或最优性判定。

## 页面、结果与异步状态

桌面为 340px 配置栏及结果栏，1040px 以下纵向排列。初始为 13 槽、12 星徽、排除专家、30 秒、全部 25 项任务。任务按阵营／流派分 Tab，滚动区域上限 320px，稳定任务 ID 决定选择身份；全选、清空和单项选择不重算。

页面会话分开持有当前输入、运行请求、最近一次尝试与最近一次有效结果。请求提交时复制为普通 JSON，避免 Vue Proxy 穿过 Worker 边界。结果条件始终取提交请求，而非正在编辑的输入；配置改变后保留方案并标记过期，新的无结果／错误／取消不会把旧方案误称为本次结果。

每次求解创建新 Worker，忙碌时拒绝重复开始；取消、完成、异常或页面卸载会清除监听并终止实例。递增请求 ID 和活动实例校验共同拒绝过期响应。Worker 创建、运行和消息读取错误都有本地化反馈，原始算法错误只在技术详情中展示。

阵容、人数、激活门槛、贡献者和任务完成情况均使用结构化 `OptimizationResult`，不解析终端文本，也不在 UI 重新计算特殊羁绊。`optimal` 明确限定本版模型，`feasible` 不宣称已证最优；保留布洛妮娅平局保守下界等规则警告。

## 费用与图片

未修改算法快照格式或 `RoleForm`。独立 `visuals.json` 记录每个形态的费用及按 avatarId／traitId 索引的已有图片路径，展示 Manifest 保存来源、算法快照、输出和图片哈希。显式生成器只读锁定的 TurnBasedGameData Commit `312b4597691e0a29cf9828a15b592757dba86949`，不生成图片，不覆盖任务或其他快照。

费用读取 `GridFightRoleBasicInfo.Rarity`，与 `GridFightShopPrice.BuyGoldStar1` 的 1–5 对应关系核对。景元 1204／12041／12042 的费用分别为 5／1／3，银狼 15061／15062／15063 为 3／4／5，证明不能按共用头像 ID 存费用。布洛妮娅工具平局状态使用基础角色配置费用。所有费用仅进入展示，不进入优化请求。

角色通过 `RoleForm.avatarId` 读取 character 图片；装备 ID 先查 `Emblem`，再用 `traitId` 读取 emblem 图片。URL 统一拼接 Vite BASE_URL 并限制为安全本地路径。当前所有映射图片均存在；失败时显示中性图标与名称，换到另一张图片时可正常重新加载。

头像宽 108px，星徽行用同宽三列 Grid 和 3px 间隙对齐。白、绿、蓝、紫、金五档费用来自主题入口的 `currencyCost` Token，运行时样式生成已确认五个 CSS 变量存在；费用文字和中性边框确保信息不只依赖颜色。

完整回归暴露了基线已有的资源清单冲突：排轴 validator 扫描整个 `public/game-assets`，而已提交的 22 张星徽图不在排轴 Manifest 中。仅在它的实际清单中过滤货币战争的 `emblem/` 命名空间；排轴角色／预设的清单、哈希、图片尺寸和软链接检查不变。没有修改排轴或跃迁的业务机制，也没有执行其资源更新器。

## Worker／WASM 构建与实际运行

Vite Worker 使用 ES module 格式，`highs/runtime?url` 生成本地哈希 WASM，交给浏览器 loader 的 `locateFile`。主页面只创建 Worker，不导入或执行求解器；WASM 初始化和同步 MILP 运行均发生在 Worker。

生产产物含约 112.82kB 的 Worker 与 3,531,385 字节的 WASM。`public/third-party/highs-LICENSE.txt` 与已安装 `highs@1.15.3` 的许可证逐字相同，随静态构建保留。

新增 `verify:currency-wars-browser` 在独立 Node 线程创建没有 Node 全局的 VM，实际执行生成的浏览器 Worker 模块。fetch 只从指定构建目录读取与 BASE_URL 匹配的 WASM；真实求解“仙舟 7 人”，验证结构化结果及独立计算器，并观察父线程计时器继续运行。

| 构建           | WASM 请求路径                     | 结果                       | 父线程心跳 |
| -------------- | --------------------------------- | -------------------------- | ---------- |
| 根路径 `/`     | `/assets/highs-B_nfHoE0.wasm`     | optimal，完成 1 项、0 星徽 | 17 次      |
| 子路径 `/hsr/` | `/hsr/assets/highs-B_nfHoE0.wasm` | optimal，完成 1 项、0 星徽 | 18 次      |

心跳次数是单次观测，不作为机器相关阈值。该探针验证浏览器分支、资源路径和独立线程执行，不等同于真实浏览器、真实网络缓存、布局或键盘交互验收。

构建保留 highs 包的 `node:module` 外置化及静态／动态导入提示：Node 分支在上述 VM 中未执行，没有引入 polyfill。VM 探针使用 Node 的实验性 VM Modules 标志，会显示对应提示；它不进入用户页面。

## 验证与人工待验收

已执行：

- 完整 Vitest 回归：38 个测试文件、553 项通过；货币战争相关共 62 项，包括本轮新增的会话与展示测试。
- TypeScript、ESLint、i18n 结构／参数／语法检查通过。
- 根路径与 `/hsr/` Production 构建通过，二者的实际 Worker/WASM 探针通过。
- 算法快照与展示 Manifest 校验通过；变更代码／文档格式、10 个 Markdown 的本地链接与锚点及 `git diff --check` 通过。
- 未改变数学模型、任务或 CLI；原算法和 CLI 测试均通过。

单元测试覆盖默认参数、稳定 ID 选择、请求复制、非法输入、重复开始、取消重启、过期消息、卸载、全部求解状态、旧有效结果保留，以及费用、多形态资源、三个星徽槽和图片失败恢复。使用测试脚本化结果覆盖异常路径，生产页面仅展示真实求解结果。

按仓库规则，未启动浏览器自动化、安装浏览器工具或截图，也未将探针视为页面视觉验收。仍需用户在开发环境及 Production Preview 中检查真实 Worker/WASM 请求、求解期间页面响应、取消和重试、过期提示、图片失败，以及双语下 1440px／1024px／390px 布局与键盘焦点；清单位于使用指南。

本轮止于 UI MVP，不进入界面精修或部署阶段。
