import type { OptimizationRequest, OptimizationResult, Snapshot, Task } from './types'

export function selectTasks(tasks: Task[], selector: string): Task[] {
  if (selector.trim() === 'all') return [...tasks]
  const selected = new Set<string>()
  const tokens = selector.split(',').map((s) => s.trim())
  if (!tokens.length || tokens.some((s) => !s)) throw new Error('Empty task selection')
  for (const token of tokens) {
    const task =
      tasks.find((t) => t.id === token) ??
      (/^[1-9][0-9]*$/.test(token) ? tasks[Number(token) - 1] : undefined)
    if (!task) throw new Error('Unknown task selection: ' + token)
    selected.add(task.id)
  }
  return tasks.filter((t) => selected.has(t.id))
}

export function formatResult(
  snapshot: Snapshot,
  request: OptimizationRequest,
  result: OptimizationResult,
): string {
  const labels = {
    optimal: '已证明最优（本版保守模型）',
    feasible: '找到可行方案，尚未证明最优',
    'no-result': '未找到可行结果',
    infeasible: '求解器报告不可行',
    error: '模型、数据或验证错误',
    empty: '尚未录入或选择任务',
  }
  const lines = [
    `优化目标：${request.objective === 'min-roles' ? '少人' : '少星徽'} [${request.objective}]`,
    `求解状态：${labels[result.status]}${result.solverStatus ? ` [${result.solverStatus}]` : ''}`,
    `耗时：${result.elapsedSeconds.toFixed(3)} 秒；请求时间预算：${request.timeLimitSeconds} 秒`,
    `规则范围：布洛妮娅平局两侧不计人数；初版禁止其作为领航员目标。`,
  ]
  if (result.message) lines.push(result.message)
  if (!result.lineup || !result.evaluation) return lines.join('\n')
  const { lineup, evaluation } = result
  const traits = new Map(snapshot.traits.map((t) => [t.id, t]))
  const roles = new Map(snapshot.roles.map((r) => [r.id, r]))
  const emblems = new Map(snapshot.emblems.map((e) => [e.id, e]))
  const typeNames = { camp: '阵营', class: '流派', unique: '独立' }
  const traitName = (id: number) =>
    `${traits.get(id)!.name}(${id}，${typeNames[traits.get(id)!.type]})`
  const list = (ids: number[]) => ids.map(traitName).join('、') || '无'
  const roleName = (id: string) => `${roles.get(id)!.name}[形态 ${id}]`
  lines.push(
    `完成任务：${evaluation.completedCount} / ${request.tasks.length}`,
    `上场角色：${lineup.members.length} / ${request.slots}`,
    `使用星徽：${evaluation.emblemCount} / ${request.emblemBudget}（自然上限 ${request.slots * 3}）`,
  )
  if (Number.isFinite(result.objectiveBound))
    lines.push(`加权目标上界：${result.objectiveBound}；Gap：${result.gap}`)
  for (const warning of evaluation.warnings) {
    if (warning === 'bronya-tie-conservative-lower-bound')
      lines.push(
        '注意：布洛妮娅两侧人数平局，游戏归属规则未确认；本方案两侧均不计她的人数，完成数为保守下界。',
      )
  }
  lines.push('', '上场阵容')
  for (const member of lineup.members) {
    const role = roles.get(member.formId)!
    const calculated = evaluation.members.find((m) => m.formId === member.formId)!
    lines.push(
      `- ${roleName(role.id)}，角色 ID ${role.roleId}，身份 ${role.identityId}${role.expert ? '，专家' : ''}`,
      `  固有羁绊：${list(calculated.innateTraits)}`,
      `  星徽：${member.emblemIds.map((id) => `${emblems.get(id)!.name}(${id})`).join('、') || '无'}`,
      `  特殊新增：${list(calculated.extraTraits)}`,
    )
    if (role.position) lines.push(`  位置：${role.position === 'front' ? '前台' : '后台'}`)
    if (role.mechanic === 'navigator')
      lines.push(
        `  领航员目标：${member.navigatorTarget ? roleName(member.navigatorTarget) : '未选择'}`,
      )
    if (role.mechanic === 'bronya')
      lines.push(
        `  大守护者归属：${role.bronyaSide === 'tie' ? '平局，两侧不计人数' : traitName(role.bronyaSide!)}`,
      )
  }
  lines.push('', '已激活羁绊')
  for (const trait of evaluation.traits.filter((t) => t.activeThreshold !== null)) {
    const definition = traits.get(trait.traitId)!
    lines.push(
      `- ${traitName(trait.traitId)}：${trait.count} 人，当前门槛 ${trait.activeThreshold}，全部门槛 ${definition.thresholds.join('/')}`,
      `  提供者：${trait.contributors.map(roleName).join('、')}`,
    )
  }
  lines.push('', '任务统计')
  for (const task of evaluation.tasks)
    lines.push(
      `- ${task.id}：${traitName(task.traitId)} ≥ ${task.requiredCount}；实际 ${task.actualCount}；${task.completed ? '完成' : '未完成'}`,
    )
  return lines.join('\n')
}
