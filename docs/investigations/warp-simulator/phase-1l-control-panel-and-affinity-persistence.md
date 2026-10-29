# Phase 1L：跃迁控制面板与星缘持久化

日期：2026-10-18（Asia/Shanghai）。仓库 HSR-Game-Tools，分支 develop，起点 HEAD 为 `37d53b33bbf6744f978e3780c600fb99e0b61020`。以本地完整工作区为基线；起点已有维护者对 `scripts/warp-data/banners.jsonc` 和对应 Schema 的修改。本轮未 Commit、Push 或部署。

现行契约见[跃迁架构](../../architecture/warp-simulator.md#页面会话与交互)及 [UI 规范](../../design-notes.md#跃迁模拟器)。本报告记录 Node 测试、模板结构检查、编译、数据校验和构建；真实视觉、键盘、触屏和读屏交互尚待维护者人工验收，未执行浏览器自动化。

## 控制面板与展示

保留 25rem 左侧 PrimeVue Drawer，内部改为可横向滚动的 Tabs、当前类别 Banner Select、UP、保底、适用时的星缘及两种重置。Tab 顺序为角色活动、光锥活动、常驻、Fate 角色、Fate 光锥，名称使用既有中英文消息；只显示通过原 Resolver 预检的类别，不受 Manifest pending 影响。卡池数量、GachaID 和 UP 不硬编码。

`availableBanners` 新增只读 groups；composable 新增 bannerGroups、activeKind、kindBanners 和 selectKind。当前类别由当前 Banner 派生，各类上次所选 Banner 保存在本页 Map 中。切换类别优先恢复该类此前选择，否则选首个有效 Banner；Select 只显示该类别，名称由规范化 UP 名称或既有类别消息提供。切池沿用操作锁，不替换会话对象或 latestBatchId，不清空记录或重新触发演出。

五星 UP 保留 88px 图片、名称及简短五星标识；四星 UP 使用三个横向、52px 图片区域和紧凑名称，完整名称通过 Tooltip 与键盘可读标签提供。所有内容经过现有 Presentation Adapter 和 WarpItemVisual；角色优先头像，光锥保持原比例，缺图使用既有中性占位。Fate 不显示四星 UP；Ordinary 只显示常驻说明，没有空白或伪造的 UP 容器。没有修改或新增真实图片。

保底改为五星／四星两行，每行并列计数与 UP 保证。30px 等宽数字复用五星金、四星紫 Token；标签弱化，Tag＋Check 保留灰色普通／绿色保证及“不适用”。四星计数为 9 时仍显示 9+ 和待兑现说明，读屏保留完整语义，不将其解释为精确累计值。

星缘区域只保留标题、数量 Badge、已选小头像和操作按钮，错误仅在抽取不可用时提供。Dialog 使用标题旁 Badge、隐藏的搜索标签、搜索输入、Checkbox 网格及取消／确认。恰好七人的 Badge 为 success，否则 secondary；是否可确认仍由完整 Resolver 校验决定。保留上限、输入错误关联和 live region，不再重复播报“已就绪”。Tabs 使用真实 TabPanel，滚动按钮与 tablist 均有本地化名称；原 Drawer／Dialog 关闭及焦点恢复流程未改动。

## 共享选择与资格

角色 Event 和 Fate 角色使用同一份冻结的已确认数组，替代按 Banner ID 存储的映射。七名选择只影响后续抽取；历史事件及已解析池仍保持原只读身份。角色池继续调用 `resolvePool(snapshot, bannerId, { selectedAvatarIds })`，其他三类不传该参数。

草稿从已确认数组复制，取消不修改共享选择；确认须为七名不同且当前池合法的五星角色，允许合法 UP 重叠。不自动选前七名、补足、替换或从 Item Catalog 推断资格。catalog 原有的七人预检样本只用于验证配置，从未成为用户选择或实际抽取输入。

当前 Banner 不兼容时保留共享名单、提示调整并禁用抽取。Dialog 将不合资格的已选项单列为可移除项；用户主动移除后，只能从当前合法集合补选并确认，避免失效角色被七人上限锁住而无法修复。切回兼容卡池仍可使用原名单。共享星缘不共享保底：`pity:event-avatar` 与 `pity:fate-avatar` 的两种计数及保证完全独立，其他三组同样保持原定义。

候选限制：不同 sharedPool 的合法集合若交集不足七人，客观上不存在同时适配它们的统一七人名单。本轮保持当前池校验和明确反馈，允许手动调整；不扩大数据资格、不静默替换成员。当前正式 Runtime 仅有一个角色池，无法据此声称未来 Event／Fate 的真实资格集合一致；差异行为由合成夹具验证。

## localStorage 契约与降级

唯一访问 localStorage 的 Warp 模块为 [affinity-persistence](../../../src/tools/warp-simulator/model/affinity-persistence.ts)。独立键为 `hsr-game-tools:warp-affinity:v1`，严格 JSON 结构如下；其中数组只由用户确认产生，没有默认七人名单：

```text
{ "schemaVersion": 1, "selectedAvatarIds": [七个不同的 canonical 角色 ID] }
```

- 初始化读取一次，严格检查 JSON、对象的两个字段、版本、数组、数量、字符串格式和重复项；完整名单还须在至少一个有效角色池通过原 Resolver，不能取候选并集凑出合法性。
- 其他池合法而初始池不兼容时，正常恢复名单，由当前池提示调整；切换兼容池即可使用。
- 损坏或不兼容结构回退为空选择并提示重新确认；结构合法但资格失效的 ID 保留为待调整内容，无法绕过当前池解析。原存储字节保留至用户成功确认新名单时覆盖。
- 仅正式确认更新内存并写存储。草稿、取消、语言／卡池切换、抽取、卸载及两类重置均不写入或删除存储。
- 捕获 storage 获取、读取和写入异常；有效确认仍在内存生效，提示无法读取／保存，不回滚或阻断本次抽取。没有存储环境时可通过注入 adapter 使用内存状态。
- 刷新后只恢复选择。保底、记录、最新批次和类别记忆从新页面开始；没有 Pinia、数据库、云同步或跨标签同步。

当前组重置仅替换对应 pityGroup；全部重置清空五组和历史。两者都保留共享名单及浏览器字节，也不复用已有事件／批次身份。

## 数据与来源保护

起点记录了 668 个现有文件的 SHA-256。受保护集合包含 Warp 维护脚本／配置／Schema、Warp 数据与引擎、全站游戏图片，共 396 个文件；与起点比较均无变化。维护者的两个未提交文件没有格式化、改写、暂存或恢复。

当前 JSONC 已有新增卡池和候选，但正式 Runtime 仍只有 `gacha:2139` 及七名候选。开始前全量单元测试为 699 通过、1 失败；失败是原真实产物一致性测试。只读 Warp Data 校验同样报告 `Runtime snapshot or Manifest is stale/invalid`。本轮没有为了通过校验而生成 Snapshot／Manifest，没有使用 GitHub 数据、伪造 Banner、修改人工名单或调整验证器。

三个只读来源仓库的起点分支／HEAD 如下，收尾比对均保持一致，工作区仍干净：

| 来源              | 分支    | HEAD                                       |
| ----------------- | ------- | ------------------------------------------ |
| HSR-Database      | develop | `6fc8f53be3153743b1e69a8790e0a5ed1ad8d175` |
| TurnBasedGameData | main    | `312b4597691e0a29cf9828a15b592757dba86949` |
| StarRailRes       | master  | `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487` |

## 测试与构建证据

环境为现有 Node 24.21.0／npm 11.16.0，没有安装或更新依赖。新增两个 Node 测试文件、33 项测试，覆盖分类、类别选择记忆、切池不重播、共享选择与独立保证、资格不兼容和手动修复、UP 资源与缺图、存储往返和异常；已有同类切池测试改为共享语义，边界测试只允许独立星缘模块访问 localStorage，概率及数据校验断言保持原样。

| 检查                                    | 实际结果                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| Type Check                              | 通过                                                                                  |
| ESLint                                  | 全仓通过                                                                              |
| i18n                                    | 双语结构、键、参数、语法通过                                                          |
| Warp 单元测试（最终独立运行）           | 335 通过／336 项；仅起点已有的真实数据过期测试失败                                    |
| 全量单元测试（最终独立运行 `npm test`） | 732 通过／733 项；仅起点已有的真实数据过期测试失败，其他工具及公共测试 397 项全部通过 |
| 过程中的全量测试（串行文件）            | 731 通过／733 项；真实数据过期及视觉回滚用例失败，后续独立全量运行已无视觉回滚失败    |
| 视觉更新器单独复核                      | 25／25 通过，未修改测试或更新器                                                       |
| Warp Data                               | 失败，起点已有 Snapshot／Manifest 过期                                                |
| Warp Visuals                            | 通过：86 件、204 张自有图片、30 张复用图片、缺失 0                                    |
| 排轴数据／模板                          | 通过：98 个角色、101 张资源；正式模板仍为 0                                           |
| Currency Wars 三项数据校验              | 快照、展示、配方全部通过                                                              |
| Production Build                        | 通过；Warp JS 108,139 bytes、CSS 18,582 bytes                                         |

Windows 沙箱的默认临时目录最初导致 Vitest 转换缓存 rename 报 EPERM，未执行任何测试。复核命令仅为该进程将 TEMP／TMP 指向项目忽略目录 `.cache/warp-phase-1l`，没有改测试或生产配置。并行验证和一次串行全量验证中，未改动的视觉更新器回滚用例返回 `Warp visual rollback failed; preserve staging, backup and lock`；随后该文件单独运行 25 项通过，不能据此保证此类文件系统问题不再出现。所有模拟生成和回滚均位于测试临时夹具，正式数据未受影响。

构建保留原 HiGHS 的 node:module externalized 和静／动态导入提示；它们不属于本次 Warp 修改。测试和构建不代表真实浏览器验收。

最后补齐了缩略图语义名称及移除失效角色后的搜索焦点恢复；随后两个新增测试文件 33 项通过，Type Check、全仓 ESLint 和 Production Build 再次通过。18 个本轮新增／修改文件的 Prettier 检查、5 份文档的 83 个本地链接／锚点检查及 `git diff --check` 通过。起点 668 个文件中，本轮修改 14 个、另新增 4 个；396 个受保护文件零变化，分支、HEAD 和三个来源仓库状态未变。维护者起点的两项未提交数据修改仍原样保留，未暂存任何文件。

## 维护者人工验收与后续数据维护

运行 `npm run dev`，打开终端所示地址下的 `/warp-simulator`；分别在中文／英文和 1440px、1024px、390px 宽度验收：

1. 打开控制 Drawer，检查当前真实 Snapshot 仅显示已有角色类型，Select、88px 五星图、三个四星缩略图和两组保底没有挤压；窄屏只在 TabList 内横向滚动。
2. 选择恰好七名，检查 Badge、上限、搜索和键盘操作；确认后刷新，选择保留，历史及保底归零。修改草稿后取消，再刷新，原选择保持。
3. 打开／取消选择和重置 Dialog，确认 Drawer 恢复及触发项焦点；用 Escape、Tab、方向键、Enter 和触屏检查流程。
4. 单抽／十连后切换合法 Banner，检查历史仍保留、结果及演出不重播；重置当前组和全部会话后再次刷新，星缘仍保留。
5. 在浏览器开发者工具中暂改该独立存储键为坏 JSON、未知版本、重复 ID 或失效角色，刷新后应提示重新确认且不能抽取角色池；操作前自行保留原值。测试禁用浏览器存储时，确认有效选择仍可在本次会话抽取。
6. 检查完整名称 Tooltip、缺图中性占位、灰／绿 Check、四星 9+ 待兑现说明和读屏标签。真实视觉和图片请求失败需人工验证。

五类、多 Banner、独立保底及不兼容候选已由合成 Fixture 完成 Node 验证。真实页面的跨类型人工验收需维护者先审阅并显式发布本地新增配置。本轮没有代为运行以下生成命令：

```bash
# 仅在 JSONC 修改导致 Schema 过期时重新生成
npm run generate:warp-schema
# 核对本地名单、UP、GachaID、资格与来源后发布 Runtime
npm run build:warp-data
npm run validate:warp-data
# Runtime 变化后，按现有锁定来源更新展示；替换为本机来源仓库绝对路径
npm run update:warp-visuals -- --source local --root "/absolute/path/StarRailRes"
npm run validate:warp-visuals
```

生成后再人工检查类别记忆、同类保底继承、跨类隔离、Ordinary／Fate 的 UP 省略以及真实资格差异。不要为显示五个 Tab 补造未配置的 Fate Banner；pending 继续按维护者实际配置保留。未新增会话持久化、导入导出、统计、其他工具功能或下一阶段任务。
