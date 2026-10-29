import { ordinaryNode } from './ordinary-node'
import type {
  ActorConfig,
  EffectOperation,
  EventAnchor,
  SimulationPlan,
  SimulationResult,
} from '../../../src/tools/action-planner/engine/types'
const actor = (id: string, speed: number, position = 0, actionLimit?: number): ActorConfig => ({
  id,
  name: id,
  kind: 'actor',
  camp: 'ally',
  position,
  baseSpeed: 100,
  panelSpeed: speed,
  ...(actionLimit ? { actionLimit } : {}),
})
const target = (...participantIds: string[]) => ({ kind: 'participants' as const, participantIds })
const action = (participantId: string): EventAnchor => ({ kind: 'action', participantId, turn: 1 })
const pull = (id: string, ids: string[], percent = 100): EffectOperation => ({
  id,
  type: 'advance',
  target: target(...ids),
  percent,
})
const make = (
  actors: ActorConfig[],
  operations: EffectOperation[] = [],
  events: SimulationPlan['events'] = [],
): SimulationPlan => ({
  cycleMode: 'none',
  aha: { id: 'aha-instant', baseSpeed: 80, contributorIds: [] },
  actors,
  events: [{ anchor: { kind: 'start' }, operations }, ...events],
  maxNodes: 4,
  maxAV: 600,
})
const pair = () => [actor('a', 160), actor('b', 134, 1)]
export const cases: Record<string, SimulationPlan> = {
  natural: make(pair()),
  continuous: make(pair(), [pull('first', ['a']), pull('second', ['b'])]),
  zeroRefresh: make(pair(), [
    pull('first', ['a']),
    pull('second', ['b']),
    pull('again', ['a'], 25),
  ]),
  group: make(
    [...pair(), actor('c', 100, 2)],
    [pull('b-first', ['b']), pull('group', ['c', 'a']), pull('overlap', ['c', 'b'])],
  ),
  pre: make(
    pair(),
    [],
    [
      {
        anchor: action('a'),
        operations: [{ ...pull('dance', ['a', 'b'], 24), phase: 'preAction' }],
      },
    ],
  ),
  post: make(
    pair(),
    [],
    [
      {
        anchor: action('a'),
        operations: [{ ...pull('dance', ['a', 'b'], 24), phase: 'postAction' }],
      },
    ],
  ),
  finite: make([actor('a', 100, 0, 2)]),
  linked: make(
    [actor('a', 100), actor('b', 100, 1)],
    [
      {
        id: 'timed',
        type: 'addSpeedModifier',
        target: target('a', 'b'),
        mode: 'flat',
        amount: 50,
        duration: { kind: 'countdown', name: 'Timer', speed: 200 },
      },
    ],
  ),
  independent: make(
    [],
    [
      {
        id: 'event',
        type: 'spawnParticipant',
        participant: { kind: 'scheduledEvent', name: 'Event', speed: 90 },
      },
    ],
  ),
  dynamic: make(
    [],
    [
      {
        id: 'event',
        type: 'spawnParticipant',
        participant: { kind: 'scheduledEvent', name: 'Event', speed: 90 },
      },
    ],
    [
      {
        anchor: { kind: 'trigger', participantId: 'spawn:event' },
        operations: [
          {
            id: 'child',
            type: 'spawnParticipant',
            participant: {
              kind: 'actor',
              name: 'Child',
              camp: 'ally',
              baseSpeed: 100,
              panelSpeed: 100,
              initialAG: 0,
              actionLimit: 1,
            },
          },
        ],
      },
    ],
  ),
  trace: make(
    [actor('a', 200), actor('b', 100, 1)],
    [],
    [
      {
        anchor: action('a'),
        operations: [
          { ...pull('pull', ['b'], 20), phase: 'preAction' },
          {
            id: 'speed',
            type: 'addSpeedModifier',
            target: target('b'),
            mode: 'flat',
            amount: 100,
            duration: { kind: 'turns', turns: null },
            phase: 'preAction',
          },
          { id: 'push', type: 'delay', target: target('b'), percent: 10, phase: 'postAction' },
          { ...pull('clamp', ['b']), phase: 'postAction' },
        ],
      },
    ],
  ),
}
/** Contract fields only; no names, icons, object identities or internal clone layout. */
export function projectResult(result: SimulationResult) {
  return {
    records: result.records.map((r) => ({
      anchor: r.anchor,
      elapsedAV: r.elapsedAV,
      deltaAV: r.deltaAV,
      effectiveSpeed: ordinaryNode(r).effectiveSpeed,
      actionChanges: r.actionChanges,
    })),
    snapshots: result.snapshots.map((s) => ({
      elapsedAV: s.elapsedAV,
      completedNodes: s.completedNodes,
      completedActions: s.completedActions,
      queue: s.queue.map((q) => ({
        id: q.id,
        anchor: q.anchor,
        remainingAG: q.remainingAG,
        remainingAV: q.remainingAV,
        effectiveSpeed: q.effectiveSpeed,
        modifiers: q.modifiers,
        actionChanges: q.actionChanges,
      })),
    })),
    diagnostics: result.diagnostics,
    stopReason: result.stopReason,
  }
}
