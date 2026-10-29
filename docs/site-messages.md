# Site Messages 维护

本指南是站点文案与国际化的现行维护入口。环境和常用命令见[开发指南](development.md)，数据名称来源见[游戏数据维护](game-data.md)。

## 消息目录与身份边界

中文消息维护在 [zh-CN.json](../src/locales/zh-CN.json)，英文维护在 [en.json](../src/locales/en.json)。
两份文件只包含嵌套命名空间与字符串消息；[SiteMessages 类型](../src/locales/types.ts)从中文结构推导，[i18n 入口](../src/locales/index.ts)通过类型约束加载相同结构。
使用 vue-i18n Composition API（`legacy: false`），只支持 `zh-CN` / `en`，无全局语言回退。

新增 Key 时在两份文件的相同语义路径添加消息。保留合理的 `ui.*`；新增业务文案使用 `planner.operationName`、`planner.metadata`、`planner.navigator` 等语义命名空间。
UI、Tooltip、ARIA 和校验提示都由 Site Messages 管理；不要在 Vue 组件或模型中硬编码中英文自然语言，也不使用 `locale === 'zh-CN' ? ... : ...` 维护句子。

工具 ID、路由、单位 ID 和操作 ID 是稳定身份。不能使用翻译后的字符串判断工具状态、目标资格或业务类型。
官方角色与装备名称来自规范化双语数据，用户自行填写的名称保持原文，不由消息目录翻译。

## 首页与正式产品名

首页卡片的名称和简介由用户在消息文件中维护：

| 工具 ID        | 消息路径                                        | 正式名称                                           |
| -------------- | ----------------------------------------------- | -------------------------------------------------- |
| `actionOrder`  | `home.tools.actionOrder.title` / `description`  | 行动序列模拟器 / Action Order Simulator            |
| `warp`         | `home.tools.warp.title` / `description`         | 抽卡模拟器 / Warp Simulator                        |
| `relic`        | `home.tools.relic.title` / `description`        | 遗器模拟器 / Relic Simulator                       |
| `currencyWars` | `home.tools.currencyWars.title` / `description` | 货币战争羁绊优化器 / Currency Wars Trait Optimizer |

两份消息文件同步修改同名 Key。`home.title`、`home.toolsHeading`、`home.github` 和 `home.disclaimer` 管理首页其他文案；`site.description` 用于页面 Meta Description。
行动序列模拟器名称还用于 `planner.title`，跃迁模拟器名称用于 `warp.title`，改名时与首页同步；“战斗配置 / Battle Setup”和“行动模拟 / Simulation”是工作阶段，不是产品名。跃迁页面、Dialog、Tooltip、ARIA、语义错误及展示元数据标签使用 `warp.*`；物品名称始终来自 Warp Snapshot，不把历史 UP 或引擎状态写进翻译文案。

[工具目录](../src/tools/catalog.ts)只保存 ID、图标和可选路由。无路由时展示静态卡片；工具实际实现并注册路由后再开放，不通过修改文案开启入口。
[App.vue](../src/App.vue)根据路由消息和语言更新 Document Title、Meta Description 与文档语言。
消息中的 `|` 会被编译器识别为复数分隔符；普通页面标题分隔符使用现有 `·`，不要直接写入未转义的 `|`。

## 插值与语义描述

货币战争网页使用 `currencyWars.*` 管理表单、结果状态、验证、图片替代说明和模型警告。官方角色、星徽与羁绊名沿用现有中文快照，不在消息目录维护第二份名称映射；语言切换不改变请求、任务选择或结果是否过期。Worker 返回结构化结果，错误摘要由消息目录本地化，原始技术错误不直接展示。搜索、优化目标、内容页签和目标／未激活 Badge 使用同一双语消息域。

动态句子在 JSON 中定义完整自然语言模板，使用命名参数。例如：

```json
{
  "zh-CN": "持续 {count} 回合",
  "en": "Lasts {count} turns"
}
```

上例仅展示两种语言的对应消息值，实际分别写入两份目录的相同 Key；调用方式为 `t('planner.metadata.duration', { count })`。
不要在 TypeScript 中拼接不同语言的词序、冠词或句子，也不要让两种语言使用不同的参数集合。

纯命名与 Metadata 模型返回 [MessageDescriptor](../src/locales/types.ts)：`{ key, params }`，可包含嵌套描述和显示数值。
[Presentation](../src/tools/action-planner/model/presentation.ts)用注入的翻译接口递归翻译描述，并按当前 Locale 格式化原始数字；Vue Setup 中使用 useI18n 连接接口。
引擎不导入翻译、不生成本地化句子，描述也不作为业务身份持久化。

## 自动名称、用户名称与数字

自动操作名称随语言和实际执行时点的目标变化，不写入计划。用户自定义操作名优先，按 operation ID 保存；留空或仅空白恢复自动命名。
自定义操作名独立于单位和倒计时名称；Inspector 的参数信息仍读取实际配置，不因自定义标题省略。

AV 固定两位小数；SPD 与百分比最多六位小数，按需要显示正负号。内部计算保留原始精度，显示字符串不回写计划。
语言切换只改变展示和数字格式，不改变计划、稳定 ID 或模拟结果；执行上下文按计划和锚点缓存，不因翻译重新预览引擎。

## 添加操作文案

1. 在对应模型中选择已有语义 Key，或新增返回 MessageDescriptor 的描述，不返回硬编码句子。
2. 在两份消息目录的同一路径加入完整模板，保持命名参数一致。
3. 在 Presentation 或 Vue 中翻译描述；目标数据使用操作执行时点的真实上下文，不使用未来最终目录补名单。
4. 运行校验，按变更增加少量语义 Key、参数、身份或真实插值测试，不逐字锁定整份可维护文案。

## 校验

```bash
npm run validate:i18n
```

[校验脚本](../scripts/validate-i18n.ts)检查严格 JSON、重复 Key、结构与类型、空翻译、插值参数集合和当前消息编译器语法。
失败时修复两份文件，不关闭告警或引入全局回退来掩盖缺失翻译。
