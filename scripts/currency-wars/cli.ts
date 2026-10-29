import type { OptimizationRequest } from '../../src/tools/currency-wars/types'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { solveCurrencyWars } from '../../src/tools/currency-wars/solve'
import { formatResult, selectTasks } from '../../src/tools/currency-wars/presentation'
import { parseTasks, validateRequest } from '../../src/tools/currency-wars/validation'
import { dataDirectory, loadSnapshot } from './data'

async function main() {
  const { values } = parseArgs({
    options: {
      objective: { type: 'string' },
      slots: { type: 'string' },
      emblems: { type: 'string' },
      'include-experts': { type: 'boolean' },
      tasks: { type: 'string' },
      select: { type: 'string' },
      'time-limit': { type: 'string' },
      'non-interactive': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  if (values.help) {
    console.log(
      '货币战争羁绊优化器\n' +
        'npm run currency-wars -- [--objective min-roles|min-emblems] [--slots 1..13] [--emblems 12] [--include-experts]\n' +
        '  [--tasks <JSON文件>] [--select all|编号,任务ID] [--time-limit 30] [--non-interactive]\n' +
        '默认少人（min-roles）、13 槽、12 星徽、排除专家、30 秒；非交互模式默认选择全部任务。',
    )
    return
  }
  const snapshot = await loadSnapshot()
  const taskFile = values.tasks
    ? path.resolve(values.tasks)
    : path.join(dataDirectory, 'tasks.json')
  const tasks = parseTasks(JSON.parse(await readFile(taskFile, 'utf8')) as unknown, snapshot)
  const request: OptimizationRequest = {
    objective: (values.objective ?? 'min-roles') as OptimizationRequest['objective'],
    slots: Number(values.slots ?? 13),
    emblemBudget: Number(values.emblems ?? 12),
    includeExperts: values['include-experts'] ?? false,
    timeLimitSeconds: Number(values['time-limit'] ?? 30),
    tasks: values.select ? selectTasks(tasks, values.select) : tasks,
  }
  validateRequest(snapshot, request, true)
  if (!tasks.length) {
    console.log(`任务列表为空：${taskFile}\n尚未录入羁绊任务；请等待填写任务后再求解。`)
    return
  }
  if (process.stdin.isTTY && !values['non-interactive']) {
    const readline = createInterface({ input: process.stdin, output: process.stdout })
    try {
      if (values.objective === undefined)
        request.objective = ((
          await readline.question('优化目标 min-roles / min-emblems [min-roles]：')
        ).trim() || 'min-roles') as OptimizationRequest['objective']
      if (values.slots === undefined)
        request.slots = Number((await readline.question('上场槽位 1–13 [13]：')).trim() || '13')
      if (values.emblems === undefined)
        request.emblemBudget = Number(
          (await readline.question('星徽预算，至少 12 [12]：')).trim() || '12',
        )
      if (values['include-experts'] === undefined) {
        const answer = (await readline.question('包含专家角色？y/n [n]：')).trim().toLowerCase()
        if (!['', 'y', 'yes', '是', 'n', 'no', '否'].includes(answer))
          throw new Error('Invalid expert answer')
        request.includeExperts = ['y', 'yes', '是'].includes(answer)
      }
      if (values.select === undefined) {
        const traits = new Map(snapshot.traits.map((t) => [t.id, t.name]))
        console.log(
          tasks
            .map((t, i) => `${i + 1}. ${t.id}：${traits.get(t.traitId)} ≥ ${t.requiredCount}`)
            .join('\n'),
        )
        request.tasks = selectTasks(
          tasks,
          (await readline.question('任务编号或 ID，逗号分隔 [all]：')).trim() || 'all',
        )
      }
      if (values['time-limit'] === undefined)
        request.timeLimitSeconds = Number(
          (await readline.question('求解时限（秒）[30]：')).trim() || '30',
        )
    } finally {
      readline.close()
    }
  }
  validateRequest(snapshot, request, true)
  console.log(
    `开始求解：${request.tasks.length} 项任务，${request.slots} 槽，星徽预算 ${request.emblemBudget}，专家${request.includeExperts ? '包含' : '排除'}。`,
  )
  const result = await solveCurrencyWars(snapshot, request)
  console.log(formatResult(snapshot, request, result))
  process.exitCode =
    result.status === 'error' ? 2 : ['infeasible', 'no-result'].includes(result.status) ? 1 : 0
}

main().catch((error: unknown) => {
  console.error('输入或数据错误：' + (error instanceof Error ? error.message : String(error)))
  process.exitCode = 2
})
