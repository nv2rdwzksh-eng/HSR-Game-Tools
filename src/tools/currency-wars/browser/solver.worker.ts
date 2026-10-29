import { solveCurrencyWars } from '../solve'
import { browserSolver } from './solver'
import type { ResultMessage, SolveMessage } from './protocol'

// This entry is loaded only with new Worker(..., { type: 'module' }).
self.onmessage = async (event: MessageEvent<SolveMessage>) => {
  const { requestId, snapshot, request } = event.data
  const result = await solveCurrencyWars(snapshot, request, browserSolver)
  const message: ResultMessage = { requestId, result }
  self.postMessage(message)
}
