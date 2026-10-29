# 跃迁模拟器

本指南描述纯引擎、页面会话、结果展示、全屏演出及 Phase 1L 控制面板与星缘持久化当前实现。模型由维护者确定，标识为 `hsr-warp`，版本为 `v0.3`；它是**本项目的标准模型，不代表已经取得或验证游戏服务器源码**。历史调查不能覆盖本指南中的既定规则。

数据维护见[游戏数据指南](../game-data.md#warp-数据基础设施)，实施证据见 [Phase 1D 报告](../investigations/warp-simulator/phase-1d-engine-implementation.md)、[Phase 1E 报告](../investigations/warp-simulator/phase-1e-ui-implementation.md)和 [Phase 1F 报告](../investigations/warp-simulator/phase-1f-visual-refinement.md)。`/warp-simulator` 提供单抽、十连、星缘选择、页面内历史及按保底池的逐次出金统计，没有用户存档或导入导出。

## 模块与输入边界

[engine](../../src/tools/warp-simulator/engine/) 下的 `probability.ts`、`resolver.ts`、`state.ts`、`gacha.ts`、`types.ts` 分别负责概率、卡池解析、会话状态、抽样及类型；`validation.ts` 统一输入诊断。引擎只依赖自身模块及 [Warp 数据契约](../../src/tools/warp-simulator/data/schema.ts)的类型，不导入 JSON、Vue、DOM、翻译、文件系统、维护脚本或其他工具业务。

运行上下文来自规范化 `WarpSnapshot`。Item Catalog 的存在不代表抽取资格；解析只使用 Banner 引用的共享名单及显式 UP。维护文件、运行时快照和名单不会被引擎修改。

| 接口                                        | 返回及行为                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `resolvePool(snapshot, bannerId, options?)` | `WarpResult<ResolvedPool>`；Banner 使用 `gacha:<GachaID>`，角色池须传 `options.selectedAvatarIds` |
| `createSessionState()`                      | 五组计数为零、保证为 false 的独立只读会话，包含模型身份                                           |
| `pullOnce(pool, state, rng)`                | `WarpResult<{ event, nextState }>`                                                                |
| `pullTen(pool, state, rng)`                 | `WarpResult<{ events, nextState }>`；恰好连续执行十次相同单抽逻辑                                 |

`WarpResult<T>` 为 `{ ok: true, value: T }` 或 `{ ok: false, diagnostic: { code, path, params } }`。诊断不包含本地化文案；`path` 是输入上下文路径，不是维护 JSONC 的行列位置。错误码为 `invalid-snapshot`、`unknown-banner`、`unknown-pool`、`unknown-item`、`invalid-pool`、`invalid-selection`、`invalid-state`、`invalid-rng`、`rng-threw`。预期输入错误转为失败结果；内部程序错误继续抛出，不伪装成输入错误。

`ResolvedPool` 保存 Banner、GachaID、共享池 ID、kind、pityGroup、模型身份、三星／四星候选、五星抽样槽位及 UP。物品仅含 `id`、`kind`、`rarity`，名称不参与判断。Resolver 复制物品并冻结池、候选数组和成员；调用方后续修改 Snapshot 或选择数组不会影响已解析池。抽取入口也会校验结构化构造的 ResolvedPool，不允许通过省略候选绕过校验。

解析验证唯一身份、合法引用、类型与星级、非空候选、候选去重、UP 数量、组匹配和模型适用条件。Ordinary 的五星共享池须为 mixed 且同时包含两种物品类型。未配置的 Banner 或不足的名单返回诊断，不自动推断或补齐。一个其他 Banner 尚待配置不会阻止现有有效 Banner 的解析。

## 概率模型 v0.3

`n` 是从上次对应稀有度命中后计算的当前抽数，第一抽为 1。概率函数只接受正安全整数，否则抛出 `RangeError`。

| 类型                            | 五星条件概率 p5(n)                                  | 四星条件概率 p4(n)                                  |
| ------------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| 角色 Event、Fate 角色、Ordinary | n ≤ 73：0.006；否则 min(1, 0.006 + 0.06 × (n − 73)) | n ≤ 8：0.051；n = 9：0.52；n ≥ 10：1                |
| 光锥 Event、Fate 光锥           | n ≤ 65：0.008；否则 min(1, 0.008 + 0.07 × (n − 65)) | n ≤ 7：0.066；n = 8：0.397；n = 9：0.728；n ≥ 10：1 |

五星 Hard Pity 分别为第 90／80 抽，四星均为第 10 抽。每抽先用独立一次 RNG 判断五星；未命中才用下一次 RNG 判断四星，否则三星。比较条件严格为 `<`，随机数等于概率阈值时未命中。

```text
P(5★) = p5
P(4★) = (1 − p5) × p4
P(3★) = (1 − p5) × (1 − p4)
```

`rarityProbabilities(kind, n5, n4)` 返回上述无条件分布。四星曲线不是无条件概率，不为拟合官方显示值修改公式或顺序。

## 候选与 UP

角色 Event 和 Fate 角色要求显式选择七名不同的合法五星角色。合法集合是 `sharedPool.fiveStar`，不自动使用它的前七项或完整集合。非保证五星：50% 直接获得当前 UP，50% 从 `[UP, ...七名选择]` 八个槽位等权抽取。选择允许包含 UP，前提是 UP 也在该共享资格集合中；此时保留两个相同 ID 槽位。

光锥 Event 和 Fate 光锥的非保证五星：75% 直接获得 UP，25% 从 `[UP, ...七张固定光锥]` 八槽位等权抽取。固定光锥由人工共享名单提供，必须恰好七张且不同于 UP，不接受角色选择参数。引擎验证名单结构，不自行认证或更换其历史常驻资格。

| 五星非保证情形      |              最终 UP 概率 |
| ------------------- | ------------------------: |
| 角色七名选择不含 UP |    50% + 50% / 8 = 56.25% |
| 角色七名选择含 UP   | 50% + 50% × 2 / 8 = 62.5% |
| 光锥                |   75% + 25% / 8 = 78.125% |

普通角色 Event 和光锥 Event 分别有三个同类型、不同 ID 的四星 UP。非保证四星以 50%／75% 进入 UP 分支，在三项中等权抽取；其余概率从完整四星共享候选中按物品等权抽取，不先选择物品类型，不添加或排除 UP。因此最终任意四星 UP 概率为 `a + (1 − a) × k / m`，其中 a 为直接分支概率，m 为回退候选数，k 为其中 UP 数。

实际获得对应稀有度 UP 时清除该保证，无论来自直接或回退分支；实际获得非 UP 时激活保证。保证状态下，下一次实际五星必为当前 UP，下一次实际四星从三个 UP 等权抽取。身份比较始终使用 canonical ID，不能使用对象引用、名称或抽样分支。

Ordinary 没有 UP，五星及四星分别从完整对应候选统一等权抽取。Fate 的五星遵循对应 Event 机制，四星统一抽取且没有 UP。UP 与共享候选是独立输入，普通 Event 不要求四星 UP 必须出现在回退集合中，也不会自动将其合并进去。

## 保底状态、继承与原子性

Session 以以下五个固定键存储状态，键必须与 Banner kind 一致，不接受 GachaID 或 UI GroupID 替代：

- `pity:event-avatar`
- `pity:event-light-cone`
- `pity:fate-avatar`
- `pity:fate-light-cone`
- `pity:ordinary`

每组包含 `pullsSinceLast5`、`pullsSinceLast4`、`guaranteed5`、`guaranteed4`。五星未命中计数范围为角色／Ordinary 0…89、光锥 0…79。四星未命中计数范围为 0…9，9 是“待兑现第十抽四星保证”的饱和值，不表示可以跳过保证。

| 结果 | 五星计数 | 四星计数         | 保证变化           |
| ---- | -------- | ---------------- | ------------------ |
| 五星 | 归零     | min(9, 原值 + 1) | 仅更新五星 UP 保证 |
| 四星 | 加一     | 归零             | 仅更新四星 UP 保证 |
| 三星 | 加一     | min(9, 原值 + 1) | 均不改变           |

五星优先于四星 Hard Pity；一次或连续多次五星都不会清除尚未兑现的四星保证。同组切换 Banner 或星缘选择保持计数和保证，兑现时使用新 Banner 的 UP。所有组互相独立。Ordinary 的两种保证、Fate 的四星保证必须为 false；非法标志不会被静默修正。

抽取开始前校验完整 Session，包括未选中的组，以及所有必需候选；失败不消费 RNG。之后每个 RNG 返回值必须为有限数字且在 `[0,1)` 内，否则返回失败。RNG 抛错使用 `rng-threw`，非法返回值使用 `invalid-rng`。单抽和十连只返回完整成功状态，十连后段失败时不暴露成功前缀；输入状态始终不改写。外部 RNG 的进度不回滚。

返回状态复制并冻结五组数据，事件的 `pityBefore` 也独立复制，避免与调用方可变输入共享引用。事件保留模型、Banner、继承组、物品 ID、稀有度、抽前状态、`branch` 和 `isUp`。`branch` 为 `uniform`／`guaranteed`／`direct`／`fallback`，`isUp` 在该稀有度没有 UP 时为 null；二者不能互相代替。

RNG 只由调用方注入：`{ next(): number }`。固定种子不是生产存档契约。消费顺序如下：

1. 每抽判断五星，只有未命中才判断四星，包括概率为 1 的判断。
2. 无 UP 时抽一次候选；有保证时跳过分支 RNG。
3. 非保证时抽一次分支；确定的五星 UP 不再抽物品索引，四星 UP 分支仍抽一次索引。
4. 回退分支抽一次槽位索引；等权索引为 `floor(rng × 候选数)`。

## 调用与验证

```ts
const resolved = resolvePool(snapshot, 'gacha:2139', {
  selectedAvatarIds: reviewedPlayerSelection,
})
if (resolved.ok) {
  const result = pullTen(resolved.value, currentSession, { next: () => Math.random() })
  if (result.ok) {
    // 由调用方一次发布结果；失败时保留 currentSession。
    currentSession = result.value.nextState
  }
}
```

当前已维护的真珠 Banner `gacha:2139` 使用 `event-avatar-default`，显式选择现有七名候选后可解析为 25 个三星、53 个四星、8 个五星回退槽位，五星 UP 为 `avatar:1503`。缺少选择时返回 `invalid-selection`。引擎不保存玩家选择或修改维护名单，页面仅在内存中保存明确确认的选择，5 个 pending 仍保留。

确定性单元测试使用独立合成数据覆盖全部五类卡池，并只读核对真实 Banner。独立 Oracle 用五星生存函数与联合保底状态稳态交叉计算长期率，分支枚举验证实际抽样和 UP 权重。固定 Seed 实验使用真实单抽转移的十连接口，只保留当前十项，不生成大量展示历史。

```bash
npm test -- tests/unit/warp-simulator
node --import tsx tests/experiments/warp-simulator.ts
```

长期参考率：角色／Ordinary 五星约 1.605205%、四星约 12.955843%；光锥五星约 1.872272%、四星约 14.499985%。这些是项目模型计算值，不是官方概率认证。统计实验不是普通单元测试的一部分，也不是唯一验收标准。

## 页面会话与交互

[WarpSimulatorPage.vue](../../src/tools/warp-simulator/WarpSimulatorPage.vue)为懒加载路由入口，首页工具目录正式开放 Warp 卡片。Warp 专属 components、composables、model 与 data 均位于工具目录内，不运行时依赖排轴内部模块。UI 设计见[设计规范](../design-notes.md#跃迁模拟器)。

`useWarpSimulator({ snapshot?, rng?, storage? })` 创建页面实例拥有的会话，默认使用仓库内规范化 Snapshot 与真实 `Math.random` Adapter；测试可注入合成 Snapshot、RNG 及 storage 获取函数。Manifest 的 pending／incomplete 不作为全局禁用条件。Banner 列表用现有 Resolver 验证完整配置；角色预检临时使用七项合法候选作为可解析性验证样本，该样本不保存为玩家选择、不用于抽取。真正抽取只使用玩家已明确确认的选择。

控制面板按角色 Event、光锥 Event、Ordinary、Fate 角色、Fate 光锥排序，只显示至少有一个有效 Banner 的类别。初始选中首个有效类别的首个 Banner；每类上次选择仅在页面内存中保留。`bannerGroups`、`activeKind`、`kindBanners` 提供分类及当前类别完整卡池列表，`selectKind` 经 `selectBanner` 的原操作锁选择该类上次的合法 Banner 或首项。切换不修改已提交会话或 latestBatchId，因此不清空历史、不重播演出；五个保底组保持独立。

`WarpBannerList` 仅接收有效 Banner 列表、选中 ID、操作锁和既有 Presentation Adapter，发送 `select(id)` 交回 `selectBanner`，不拥有业务状态。卡池列表在 Drawer 中独立滚动；底部保底、星缘及重置不属于 TabPanel，始终绑定当前 Banner 的派生状态。矮屏底部控制区可以内部滚动，不改变保底投影或重置作用域。

角色 Event 和 Fate 角色共用一份已确认的七人选择，不以 Banner ID 为键。角色资格来自当前共享池的 `fiveStar`，不是 Item Catalog 或已解析的八个回退槽位。每个当前角色池均重新通过 `resolvePool`；不兼容时保留名单、提示调整并禁用抽取，不扩充资格或替换成员。搜索头像网格 Dialog 的草稿与已确认名单分离，恰好七名不同且对当前 Banner 合法的角色才可确认；合法的当期 UP 可以包含在七人中。取消不提交；修改只影响未来结果。失效或当前池不接受的已选项另列为可移除项，移除后仍只能从当前合法候选中手动补选。光锥和 Ordinary 不显示星缘入口，也不向 Resolver 传入选择参数。

单个已提交 `shallowRef<WarpPageSession>` 保存引擎状态、历史与最新批次身份。`draw(1 | 10)` 调用现有引擎，成功后一次替换整个会话；失败只设置语义诊断，保留原对象及全部历史。抽取期间设置防重入锁，在当前 Vue 更新完成后解除；切池、选择和重置操作也受锁及 Dialog 状态约束，不把动画当作业务等待条件。

保底以五星、四星两个分组直接展示当前组计数和 UP 保证，未适用的保证为“不适用”。四星饱和值 9 显示“9+ 抽未出四星”并附待兑现说明，不声称它是精确累计抽数。UI 不计算 Soft Pity、UP 命中或保证转移。

历史保存原始只读 PullEvent，并增加页面内递增条目 ID 和批次 ID。最多保留最近 1000 条，每页 25 条，最新优先；新抽取回到第一页。最新批次从同一历史派生并恢复原始抽取顺序，不为了稀有度排序。UP 标记仅使用事件的 `isUp`，来源按事件的 Banner ID 显示，模型及抽前状态仍保留于事件。五星条目的“当次五星保底抽数”为 `pityBefore.pullsSinceLast5 + 1`，不会因后续切池、重置或语言改变而重算。

`WarpHistoryDialog` 用局部浅色 HModal、无标题 HPanel 和 HTabs／HTabPanels 包装逐条记录与出金统计。HTabs 使用居中的 pill 变体；弹窗固定视口相关高度，内容填满剩余空间并独立滚动，切换 Tab 不改变高度。`WarpHistory` 只展示已有分页的名称、类别、星级与命途，统计组件从同一个 session.history 派生；首次进入统计页，后续保存页面内 Tab、页码及各 Tab 滚动位置，不持久化。纯函数 `fiveStarHistory` 按当前有效 Banner 的 pityGroup 及 rarity === 5 筛选保留事件，每次出货保留独立 ID 与历史 isUp，不按物品合并，不重新累加低星事件。上限复用引擎 isLightCone 分类，光锥为 80，其余为 90；柱宽用 pulls / max，色相用 120 × (1 − (pulls − 1) / (max − 1))，不显示顶部刻度。统计只涵盖最近保留的 1000 次跃迁，旧记录截断不改变保留下来的抽数。

重置须经 Dialog 确认，取消不提交：

- 当前组重置只替换该继承组的引擎计数与保证，保留其他组、历史、最新批次和所有星缘选择。
- 全部重置清空五组引擎状态、历史及最新批次，保留当前 Banner 和共享星缘选择。
- 页面内条目／批次身份不因重置复用。刷新或离开页面销毁引擎会话和类别记忆；重新进入仅恢复浏览器中的星缘选择，没有全局业务单例。

### 星缘浏览器存储

独立 [affinity-persistence](../../src/tools/warp-simulator/model/affinity-persistence.ts) 是 Warp 中唯一访问 localStorage 的模块，不依赖其他工具的存档实现。键为 `hsr-game-tools:warp-affinity:v1`，JSON 严格只含 `schemaVersion: 1` 和 `selectedAvatarIds` 数组。七个 ID 必须为不同的 canonical 角色 ID；恢复还需整份名单在至少一个有效角色 Banner 下通过现有 Resolver，不能用多个候选集合的并集替代资格检查。之后仍按当前 Banner 解析；其他池有效、当前池不兼容不算全局存储失效。

页面初始化读取一次；不存在存储时从空选择开始。损坏 JSON、错误结构、未知版本、ID 类型／格式错误、数量或重复错误回退为空内存选择并要求重新确认；结构合法但资格过期的名单保留为待调整内容，不能作为合法抽取上下文。原始存储字节不会因恢复失败或切池而被删除、重写。

仅用户成功确认选择后才同步替换内存名单并尝试写入；草稿、取消、抽取、两类重置、语言／类别切换和卸载均不写存储。存储获取／读取／写入异常只产生语义通知，确认后的内存名单仍可正常抽取；写入失败不回滚有效选择。不保存 Banner、引擎会话、历史、RNG 或草稿，不提供跨标签同步。接口 `AffinityStorage` 只需 `getItem`／`setItem`，测试通过 `storage: () => adapter` 或返回 undefined 模拟内存环境。

控制与存储实现、验证及人工步骤见 [Phase 1L 报告](../investigations/warp-simulator/phase-1l-control-panel-and-affinity-persistence.md)；头像列表与固定底部控制区见 [Drawer UI 重构报告](../investigations/warp-simulator/control-drawer-ui-refactor-2026-10-19.md)。

## 全屏结果演出

`useWarpSimulator` 仍在演出前一次提交结果、历史和保底；展示层不补抽、不调用 RNG。页面将单调递增 latestBatchId 和同批只读 HistoryEntry 交给 `useWarpReveal`。单抽队列包含唯一结果；十连只过滤五星、保留相对顺序，同时保留完整批次供总览读取。

阶段为 idle／identity／artwork／waiting／overview／leaving。五星沿用已验收的命途与 StarBig 前置动画及就绪门控，随后等待当前 Artwork 或最终占位就绪，完成 400ms 淡入后等待确认。普通单抽直接 Artwork；点击前置阶段只跳到当前 Artwork，加载／淡入期间点击不推进。Escape 结束当前单件而不跳过整个队列。Reduced Motion 跳过前置与非必要淡入，资源就绪后等待确认。

十连没有五星时直接 overview；有五星时最后一件离场后进入 overview。overviewEntries 始终为本批完整十项，不重新排序、不根据逐项确认删减。阶段切换保持同一个 Dialog 和操作锁；总览外侧空白、卡片间隙和展示带间空白可点击关闭，与关闭按钮及 Escape 共用离场流程。总览容器统一处理 click，排除卡片、标题栏和其他交互控件，忽略已阻止默认行为的事件、详情打开期间的背景点击及 leaving 阶段重复点击；不将触屏滚动或 pointerup 映射为关闭。单抽最后一项及总览离场完成后隐藏 Dialog，只有匹配 batchId 的 afterHide 才释放 pending 并恢复原抽取按钮焦点。主页始终展示当前卡池，最近一次结果由 session 的 latestBatchId／latestResults 提供，不在演出状态机中维护第二份已展示结果。

每次批次／阶段变化取消旧定时器并递增 revision，ready 事件携带 batchId／entryId，隐藏事件携带离场 batchId。状态机拒绝旧 ID、重复就绪、过期隐藏及销毁后的回调。全部重置清空展示状态且不复用业务批次号。启用 Reduced Motion 不退出 overview；正在 leaving 时立即完成当前离场。图片全失败时最终占位也提供 ready，Escape 在资源加载期间仍可用。

`WarpRevealOverlay` 负责结果阶段显示、当前物品预加载和详情导航；总览与历史共用 `WarpItemDetails` 包装，详情期间 Escape 只关闭详情，保持卡片墙滚动位置。控制 Drawer 与历史 HModal 的串行导航由 `useWarpOverlay` 管理，详情弹层契约见[物品详情弹层](#物品详情弹层)。

主页 WarpBannerStage 只接收当前 Banner、由 up5 解析的 ItemPresentation 及回看入口状态，不持有引擎或抽卡逻辑。当前卡池和语言驱动舞台信息；无单一 UP 时使用通用舞台。角色、光锥使用各自的主页构图，不复用 PortraitFocus 或 reveal-composition。

`useWarpReview` 仅管理只读回看导航，打开时冻结 latestResults 的数组副本，来源从记录的 event.bannerId 解析，不受当前卡池切换影响。WarpRevealOverlay 的 review 模式直接展示单卡或完整卡片墙，不进入 useWarpReveal，不播放 Identity、揭示或命途动画，不生成记录或消费 RNG。回看关闭后匹配 batchId 与每次打开的 revision 才释放导航锁并恢复入口焦点；重复打开、离场期间打开及过期隐藏回调被拒绝。演出和回看互斥，回看详情沿用原卡片焦点恢复和 Esc 分层关闭。全量重置后入口随 latestResults 清空而隐藏。

`WarpResultArtwork` 负责统一卡内图片回退和最终角色头部定位；正式卡片使用 resultPortraitFocus 合并基础配置及 overviewOverrides，开发校准器可显式传入 focus。`WarpResultsWall` 仅保留倾斜 3–4–3 布局，整排旋转 −12° 并保留排偏移；fitResultWall 按边界等比适配。默认 idPrefix 为 warp-overview-result，点击转发原 HistoryEntry，窄屏按原 DOM 顺序使用自然流网格。单抽回看尺寸由全屏容器控制。元素尺寸通过 ResizeObserver 获取，监听器随作用域清理。

单件 Artwork 另用 `reveal-composition` 描述等比 contain 缩放；所有构图中心均为完整 viewport 的 (0.5,0.5)，不读取结果卡 PortraitFocus。`WarpRevealImage` 根据当前源图尺寸和 ResizeObserver 结果计算等比几何，桌面、窄屏和矮屏均使用全屏容器；未提供 composition 时保持原像素限制与 Identity 渲染。单件角色统一使用完整画布的 contain 比例适配 viewport，保持居中和宽高比，不额外放大或溢出，单件光锥保留完整图片与实际像素／DPR 上限。左侧信息条作为独立覆盖层，保持类型、图标、名称、星级和角色命途信息，不参与主体区域尺寸计算。

实现验证及人工步骤见[结果展示重构报告](../investigations/warp-simulator/result-display-refactor-2026-10-20.md)。

## 展示资源与降级

[visuals](../../src/tools/warp-simulator/data/visuals/)为独立的规范化展示快照，来源锁定和显式离线维护见[游戏数据指南](../game-data.md#warp-展示资源)。它不表达抽取资格，不修改引擎输入，不在普通构建中生成。共享头像的复用仅发生于维护阶段；运行时无排轴业务导入或原始来源依赖。

`createPresentation(snapshot, visuals?, base?, definitions?)` 继续按 canonical ID 从 Warp Snapshot 取得名称、类别、稀有度，另外返回命途内部 ID／本地化名称／图标、角色属性内部 ID／名称／图标／展示色、头像、立绘／封面及星级图片 URL。物品路径只由登记的安全 `game-assets/*.webp` 相对路径与 BASE_URL 组合。主页和历史的属性文字统一使用 elementColor，从主题 warpVisualTokens.element 取得 HSR-Database 配色，不使用 StarRailRes 快照中的颜色或派生提亮色。配色来源为 HSR-Database 的 src/lib/domain/elements.ts（17257c58c4e3b4e9e9a801c617e3e3232764e51d），其中 Lightning 对应本工具的 Thunder；未知或缺失属性继承普通前景色。颜色属于本工具的展示策略，不改写资源快照及来源 Manifest，也不引入运行时跨仓库依赖。光锥无属性；缺失元数据和加载失败均使用中性占位，不猜测资源。

Catalog 的可选 `resultPortrait` 仅用于角色高清特写，保存原始完整画布的 path／width／height；Adapter 提供同名 url／width／height，不替代 artworkUrl 或 revealArtwork。当前 55 个角色均为 2048×2048，与既有 revealArtwork 共用已校验输出。角色卡按 resultPortrait → revealArtwork → artworkUrl → 中性占位降级，URL 去重，不预加载全图鉴。仅光锥可用的 lightConePreview 和既有演出字段 revealArtwork／revealPathIcon／revealStars／revealStarBig 保持职责；光锥卡片、单件及详情使用 preview，V3 Identity 继续独立 StarBig。资源 Manifest 校验用途、原始尺寸、哈希和引用覆盖，见[资源维护](../game-data.md#warp-展示资源)。

裁切星级 cardStars[3/4/5] 同样使用 path／width／height；Adapter 提供可选 cardStars 图片描述与 cardStarsReferenceAspectRatio，后者取裁切五星图宽高比，缺失时以 5 保守限制。卡片的两行 Metadata 信息簇、最终 Artwork 信息面板及详情选择 cardStars，资源缺失／失败使用中性占位；历史仍使用旧 starsUrl，V3 Identity 使用独立 StarBig。WarpVisualIcon 的 image／referenceAspectRatio 可选输入由结果卡、最终 Artwork 信息面板及详情启用，按共同参考比约束三档高度；旧 url／stars 调用保留原行为。Manifest v3 保留裁切追溯，维护规则见[资源维护](../game-data.md#warp-展示资源)。这些元数据派生不调用 RNG 或修改会话。

`useWarpOverlay` 只管理控制 Drawer、历史 HModal、Dialog 进入队列及恢复焦点 ID，不引用会话或 RNG。控制与历史默认关闭，结果区域和常驻抽取栏保持挂载；打开／关闭面板不会重建 `useWarpSimulator` 或结果批次。Dialog 先等待来源面板完成 after-hide／after-leave，关闭后恢复来源面板／触发项；转换期间拒绝重复导航，回调按来源面板或 Dialog 类型检查当前状态，作用域销毁时清理待执行动作。页面及结果容器负责离场后的导航焦点，HModal 负责模态内部焦点。历史包装在 HModal 的初始聚焦完成后恢复滚动位置，再通知页面以 preventScroll 恢复原行或缩略图焦点；触发项已消失时回退当前 Tab。星缘头像／空状态按钮沿用原队列；关闭后若原触发项已消失，页面将焦点回退到首个可用头像。星缘 Dialog 内手动移除失效角色后，在下一次 DOM 更新恢复搜索输入焦点，避免焦点留在已移除的按钮上。

结果卡按物品类型分支：角色是全幅原始尺寸立绘，属性和星级叠加在左下角，没有可见命途信息列；光锥保留左侧命途／星级和右侧透明预览。头部配置仅来自 data/portrait-focus.json，默认、角色覆盖和总览差异按顺序合并，完整卡片的未旋转尺寸交给 portraitGeometry。十连全屏保留倾斜 3–4–3 卡片墙；Tooltip、ARIA 和详情保留完整文字。历史表格及最新批次顺序、抽取、分页、重置和历史容量不变，星缘配置继续独立于会话重置。

双语 UI 文案集中于 `warp.*`，官方命途／属性名称来自展示快照。语言、动画与资源加载不改变身份、UP 或 RNG。结果卡稳定 key 与 reduced-motion 规则保持不变；浅色历史名称局部使用深蓝／深紫／深金色，不修改结果卡的全局稀有度 Token。历史正文桌面 14px、窄屏 12px，名称 Hover／Focus 保留稀有度颜色；星级素材与命途单色图标局部调暗，统计头像及光锥预览保持原色并复用失败占位。真实视觉、键盘／触屏、焦点及响应式由维护者人工验收。

会话持久化、导入导出及粒子／镜头等复杂演出仍未实现；真实 Banner 的后续维护需单独审阅，不自动进入下一阶段。

## 物品详情弹层

普通历史入口与全屏结果入口复用同一个 Astral UI HModal 详情组件。详情只读 HistoryEntry 与 ItemPresentation；来源使用记录的 bannerId，UP、保底和记录编号沿用抽取时事件，不读取当前所选卡池或会话最新保底。包装在 close 时通知外部清空选择，并保留离场内容到 after-leave；历史 HModal 在该事件后重新打开并恢复导航、滚动及触发项焦点，历史与详情不会同时持有焦点监听或滚动锁。

全屏详情包装位于 PrimeVue Dialog 同级，Teleport 后显式设置局部主题及高于实际全屏遮罩的层级。详情打开和退出期间父 Dialog 根节点保持 inert／aria-hidden，父滚动锁保持；HModal 负责子层焦点，after-leave 后解除父层 inert 并恢复有效卡片或关闭按钮焦点。父层隐藏、批次或回看版本替换时卸载旧详情，清除旧导航状态。视觉和人工验收要求见[设计规范](../design-notes.md#跃迁模拟器)。
