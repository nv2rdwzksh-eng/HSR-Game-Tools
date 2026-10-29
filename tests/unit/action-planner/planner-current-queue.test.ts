import { ordinaryNode } from '../../fixtures/action-planner/ordinary-node'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { simulatePlan } from '../../../src/tools/action-planner/engine/engine'
import {
  anchorKey,
  countdownParticipantId,
  spawnedParticipantId,
} from '../../../src/tools/action-planner/engine/queue'
import type {
  EffectOperation,
  NodeAnchor,
  SimulationPlan,
} from '../../../src/tools/action-planner/engine/types'
import {
  buildCurrentQueueView,
  currentQueueCards,
} from '../../../src/tools/action-planner/model/current-queue'
import { actionDirections } from '../../../src/tools/action-planner/model/naming'
import { useActionPlanner } from '../../../src/tools/action-planner/composables/useActionPlanner'

const action = (participantId: string, turn = 1): NodeAnchor => ({
  kind: 'action',
  participantId,
  turn,
})
const target = (...participantIds: string[]) => ({ kind: 'participants' as const, participantIds })
const plan = (): SimulationPlan => ({
  cycleMode: 'none',
  aha: { id: 'aha-instant', baseSpeed: 80, contributorIds: [] },
  actors: ['a', 'b', 'c'].map((id, position) => ({
    id,
    name: id,
    kind: 'actor',
    camp: position === 1 ? 'enemy' : 'ally',
    position,
    baseSpeed: 100,
    panelSpeed: 100,
    initialAG: [4000, 6000, 9000][position],
  })),
  events: [],
  maxNodes: 6,
  maxAV: 600,
})
const waitingValues = (result: ReturnType<typeof simulatePlan>, index: number) =>
  buildCurrentQueueView(result, index)?.waiting.map((entry) => [
    ordinaryNode(entry).id,
    entry.remainingAV,
  ])

describe('current queue presentation', () => {
  it('uses the post-start snapshot and preserves committed start effects without mutation', () => {
    const input = plan()
    input.events = [
      {
        anchor: { kind: 'start' },
        operations: [{ id: 'start-pull', type: 'advance', target: target('b'), percent: 25 }],
      },
    ]
    const result = simulatePlan(input)
    const original = structuredClone(result)
    const view = buildCurrentQueueView(result, 0)!
    expect(view.kind).toBe('start')
    expect(view.elapsedAV).toBe(0)
    expect(view.waiting).toBe(result.snapshots[0]!.queue)
    expect(waitingValues(result, 0)).toEqual([
      ['b', 35],
      ['a', 40],
      ['c', 90],
    ])
    expect(view.waiting[0]!.actionChanges[0]!.operationId).toBe('start-pull')
    for (let i = 0; i <= result.records.length; i++)
      currentQueueCards(buildCurrentQueueView(result, i))
    expect(result).toEqual(original)
  })

  it('places the active actor at zero AV and excludes its next natural turn until the next node', () => {
    const result = simulatePlan(plan())
    const first = buildCurrentQueueView(result, 1)!
    expect(first).toMatchObject({ kind: 'acting', elapsedAV: 40, current: { anchor: action('a') } })
    const cards = currentQueueCards(first)
    expect(cards.map((card) => [ordinaryNode(card).id, card.total, card.isCurrent])).toEqual([
      ['a', 0, true],
      ['b', 20, false],
      ['c', 50, false],
    ])
    expect(first.waiting.some((entry) => ordinaryNode(entry).id === 'a')).toBe(false)
    expect(new Set(cards.map((card) => ordinaryNode(card).id)).size).toBe(cards.length)
    expect(result.snapshots[1]!.queue.find((entry) => entry.id === 'a')!.anchor).toEqual(
      action('a', 2),
    )
    expect(buildCurrentQueueView(result, 2)).toMatchObject({
      elapsedAV: 60,
      current: { anchor: action('b') },
    })
    expect(waitingValues(result, 2)).toEqual([
      ['c', 30],
      ['a', 80],
    ])
  })

  it('does not anticipate speed effects or spawned actors and keeps a final limited action visible', () => {
    const input = plan()
    input.actors[0]!.actionLimit = 1
    input.events = [
      {
        anchor: action('a'),
        operations: [
          {
            id: 'speed',
            type: 'addSpeedModifier',
            target: target('b'),
            mode: 'flat',
            amount: 100,
            duration: { kind: 'turns', turns: null },
            phase: 'postAction',
          },
          {
            id: 'summon',
            type: 'spawnParticipant',
            phase: 'postAction',
            participant: {
              kind: 'actor',
              camp: 'ally',
              category: 'summon',
              name: 'Summon',
              baseSpeed: 100,
              panelSpeed: 100,
              initialAG: 0,
              actionLimit: 1,
            },
          },
        ],
      },
    ]
    const result = simulatePlan(input)
    const first = buildCurrentQueueView(result, 1)!
    expect(currentQueueCards(first)[0]).toMatchObject({ id: 'a', total: 0, isCurrent: true })
    expect(first.waiting.find((entry) => ordinaryNode(entry).id === 'b')).toMatchObject({
      effectiveSpeed: 100,
      remainingAV: 20,
    })
    expect(
      first.waiting.some((entry) => ordinaryNode(entry).id === spawnedParticipantId('summon')),
    ).toBe(false)
    const second = buildCurrentQueueView(result, 2)!
    expect(second).toMatchObject({ elapsedAV: 40, current: { id: spawnedParticipantId('summon') } })
    expect(second.waiting.find((entry) => ordinaryNode(entry).id === 'b')).toMatchObject({
      effectiveSpeed: 200,
      remainingAV: 10,
    })
    expect(second.waiting.some((entry) => ordinaryNode(entry).id === 'a')).toBe(false)
    expect(
      buildCurrentQueueView(result, 3)!.waiting.some(
        (entry) => ordinaryNode(entry).id === spawnedParticipantId('summon'),
      ),
    ).toBe(false)
  })

  it('preserves zero-AV insertion order and each trace lifetime independently of configured operations', () => {
    const input = plan()
    input.events = [
      {
        anchor: { kind: 'start' },
        operations: [
          { id: 'all-now', type: 'immediatelyAct', target: { kind: 'allies' } },
          { id: 'b-now', type: 'immediatelyAct', target: target('b') },
          { id: 'b-pull', type: 'advance', target: target('b'), percent: 0 },
          { id: 'b-push', type: 'delay', target: target('b'), percent: 0 },
        ],
      },
      {
        anchor: action('b'),
        operations: [
          {
            id: 'configured-delay',
            type: 'delay',
            target: target('a'),
            percent: 0,
            phase: 'postAction',
          },
        ],
      },
    ]
    const result = simulatePlan(input)
    expect(
      result.records.slice(0, 3).map((record) => [ordinaryNode(record).id, record.elapsedAV]),
    ).toEqual([
      ['b', 0],
      ['a', 0],
      ['c', 0],
    ])
    const first = buildCurrentQueueView(result, 1)!
    const cards = currentQueueCards(first)
    expect(cards.map((card) => [ordinaryNode(card).id, card.total])).toEqual([
      ['b', 0],
      ['a', 0],
      ['c', 0],
    ])
    expect(cards[0]!.actionChanges).toBe(result.records[0]!.actionChanges)
    expect(actionDirections(cards[0]!.anchor, cards[0]!.actionChanges)).toEqual({
      advance: true,
      delay: true,
      immediatelyAct: true,
    })
    expect(actionDirections(cards[1]!.anchor, cards[1]!.actionChanges)).toEqual({
      advance: false,
      delay: false,
      immediatelyAct: true,
    })
    const second = currentQueueCards(buildCurrentQueueView(result, 2))
    expect(actionDirections(second[0]!.anchor, second[0]!.actionChanges)).toEqual({
      advance: false,
      delay: true,
      immediatelyAct: true,
    })
    expect(second.find((card) => ordinaryNode(card).id === 'b')!.actionChanges).toEqual([])
    expect(buildCurrentQueueView(result, 3)!.elapsedAV).toBe(0)
  })

  it('presents countdown triggers after expiry but before their configured effects', () => {
    const input = plan()
    input.actors = input.actors.slice(0, 2).map((actor) => ({ ...actor, initialAG: 10000 }))
    const timer = countdownParticipantId('timed-speed')
    input.events = [
      {
        anchor: { kind: 'start' },
        operations: [
          {
            id: 'timed-speed',
            type: 'addSpeedModifier',
            target: target('a', 'b'),
            mode: 'flat',
            amount: 100,
            duration: { kind: 'countdown', name: 'Clock', speed: 250 },
          },
        ],
      },
      {
        anchor: { kind: 'trigger', participantId: timer },
        operations: [{ id: 'trigger-pull', type: 'advance', target: target('b'), percent: 20 }],
      },
    ]
    const result = simulatePlan(input)
    const trigger = buildCurrentQueueView(result, 1)!
    expect(trigger).toMatchObject({
      kind: 'acting',
      elapsedAV: 40,
      current: { kind: 'scheduledEvent', anchor: { kind: 'trigger', participantId: timer } },
    })
    expect(currentQueueCards(trigger)[0]).toMatchObject({ total: 0, isCurrent: true })
    expect(
      trigger.waiting.map((entry) => [
        ordinaryNode(entry).id,
        entry.remainingAV,
        ordinaryNode(entry).effectiveSpeed,
      ]),
    ).toEqual([
      ['a', 20, 100],
      ['b', 20, 100],
    ])
    const next = buildCurrentQueueView(result, 2)!
    expect(next).toMatchObject({ elapsedAV: 40, current: { id: 'b' } })
    expect(next.waiting.some((entry) => ordinaryNode(entry).id === timer)).toBe(false)
  })

  it('returns unavailable for missing or invalid positions and leaves normal empty results valid', () => {
    const empty = simulatePlan({ ...plan(), actors: [] })
    expect(buildCurrentQueueView(empty, 0)).toEqual({ kind: 'start', elapsedAV: 0, waiting: [] })
    expect(empty.stopReason).toBe('empty')
    const failed = simulatePlan({ ...plan(), maxNodes: -1 })
    expect(buildCurrentQueueView(failed, 0)).toBeUndefined()
    const result = simulatePlan(plan())
    for (const index of [-1, 0.5, Number.NaN, result.records.length + 1])
      expect(buildCurrentQueueView(result, index)).toBeUndefined()
    expect(currentQueueCards()).toEqual([])
  })

  it('removes visible camp metadata while retaining dot tooltips and accessible camp labels', () => {
    const source = readFileSync(
      new URL('../../../src/tools/action-planner/components/ActionNavigator.vue', import.meta.url),
      'utf8',
    )
    const template = source.split('<template>')[1]!
    expect(template).not.toMatch(/\{\{\s*campLabel\(/)
    expect(template).toContain('v-tooltip="campLabel(card)"')
    expect(template).toContain(':aria-label="campLabel(card)"')
    expect(template).toContain('v-if="showStart"')
    expect(template).toContain(':aria-current="card.isCurrent')
  })
})

describe('queue cursor and Inspector ownership', () => {
  it('steps existing records, discards drafts, selects the entered node and preserves mode position', () => {
    const p = useActionPlanner(plan())
    const result = p.result.value
    p.view.value = 'queue'
    expect(p.queueIndex.value).toBe(0)
    expect(p.currentQueueView.value?.kind).toBe('start')
    p.stepQueue(1)
    expect(p.selected.value).toEqual(action('a'))
    const waiting = p.currentQueueView.value!.waiting[0]!.anchor
    p.select(waiting)
    p.edit()
    expect(p.queueIndex.value).toBe(1)
    p.stepQueue(1)
    expect(p.draft.value).toBeUndefined()
    expect(p.selected.value).toEqual(action('b'))
    expect(p.queueIndex.value).toBe(2)
    p.select(action('c'))
    p.edit()
    p.view.value = 'future'
    expect(p.draft.value).toBeUndefined()
    p.view.value = 'queue'
    expect(p.queueIndex.value).toBe(2)
    expect(p.selected.value).toEqual(action('c'))
    p.stepQueue(-1)
    expect(p.selected.value).toEqual(action('a'))
    p.stepQueue(-1)
    expect(p.currentQueueView.value?.kind).toBe('start')
    expect(p.selected.value).toEqual({ kind: 'start' })
    expect(p.result.value).toBe(result)
  })

  it('retains a cursor by anchor after reordering and resets an unreachable cursor without rebinding operations', () => {
    const input = plan()
    const operation: EffectOperation = {
      id: 'a-op',
      type: 'advance',
      target: target('c'),
      percent: 10,
      phase: 'postAction',
    }
    input.events = [{ anchor: action('a'), operations: [operation] }]
    const p = useActionPlanner(input)
    p.stepQueue(1)
    const reordered: SimulationPlan = {
      ...input,
      events: [
        ...input.events,
        {
          anchor: { kind: 'start' },
          operations: [{ id: 'b-first', type: 'immediatelyAct', target: target('b') }],
        },
      ],
    }
    p.replacePlan(reordered)
    expect(p.queueIndex.value).toBe(2)
    expect(p.currentQueueView.value).toMatchObject({ current: { anchor: action('a') } })
    expect(p.selected.value).toEqual(action('a'))
    p.replacePlan({ ...reordered, maxNodes: 1 })
    expect(p.queueIndex.value).toBe(0)
    expect(p.currentQueueView.value?.kind).toBe('start')
    expect(p.selected.value).toEqual(action('a'))
    expect(p.operations.value).toEqual([operation])
    expect(p.unreached.value.map((event) => anchorKey(event.anchor))).toContain(
      anchorKey(action('a')),
    )
    p.replacePlan(reordered)
    expect(p.queueIndex.value).toBe(0)
    expect(p.operations.value[0]!.id).toBe('a-op')
  })

  it.each(['nodes', 'av', 'empty', 'error'] as const)(
    'stops at the last actual node for %s results',
    (reason) => {
      const input = plan()
      if (reason === 'nodes') input.maxNodes = 1
      if (reason === 'av') input.maxAV = 50
      if (reason === 'empty')
        input.actors.forEach((actor) => {
          actor.actionLimit = 1
        })
      if (reason === 'error') input.maxNodes = -1
      const p = useActionPlanner(input)
      expect(p.result.value.stopReason).toBe(reason)
      const total = p.result.value.records.length
      for (let i = 0; i < total + 2; i++) p.stepQueue(1)
      expect(p.queueIndex.value).toBe(total)
      if (reason !== 'error') {
        p.select({ kind: 'start' })
        p.edit()
        p.stepQueue(1)
        expect(p.selected.value).toEqual({ kind: 'start' })
        expect(p.draft.value).toBeDefined()
        for (let i = 0; i < total + 2; i++) p.stepQueue(-1)
        expect(p.queueIndex.value).toBe(0)
        expect(p.currentQueueView.value?.kind).toBe('start')
      } else expect(p.currentQueueView.value).toBeUndefined()
    },
  )
})
