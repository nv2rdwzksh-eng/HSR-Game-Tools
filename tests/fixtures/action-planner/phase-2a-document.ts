import type { PlannerDocument } from '../../../src/tools/action-planner/model/editor'

/** Entirely synthetic, test-only input. Never register as a reviewed team. */
export function syntheticDocument(): PlannerDocument {
  return {
    name: 'Synthetic fixture',
    plan: {
      cycleMode: 'none',
      aha: { id: 'aha-instant', baseSpeed: 80, contributorIds: [] },
      actors: [
        {
          id: 'editor-1',
          kind: 'actor',
          camp: 'ally',
          category: 'character',
          name: 'Synthetic ally',
          position: 0,
          baseSpeed: 100,
          panelSpeed: 134.56789123456789,
        },
        {
          id: 'enemy-1',
          kind: 'actor',
          camp: 'enemy',
          category: 'enemy',
          name: 'Synthetic enemy',
          position: 0,
          baseSpeed: 87.25,
          panelSpeed: 87.25,
          initialAG: 5000,
          actionLimit: null,
        },
      ],
      events: [
        {
          anchor: { kind: 'start' },
          operations: [
            {
              id: 'editor-2',
              type: 'advance',
              target: { kind: 'enemies' },
              percent: 7.12345678912345,
            },
            {
              id: 'timer',
              type: 'addSpeedModifier',
              target: { kind: 'allies' },
              mode: 'flat',
              amount: 10,
              duration: { kind: 'countdown', name: 'Synthetic clock', speed: 70 },
            },
            {
              id: 'spawn',
              type: 'spawnParticipant',
              participant: {
                kind: 'actor',
                name: 'Synthetic summon',
                camp: 'ally',
                category: 'summon',
                baseSpeed: 100,
                panelSpeed: 99.25,
                actionLimit: 2,
                initialAG: 4000,
              },
            },
          ],
        },
        {
          anchor: { kind: 'action', participantId: 'editor-1', turn: 1 },
          operations: [
            {
              id: 'now',
              type: 'immediatelyAct',
              target: { kind: 'participants', participantIds: ['enemy-1'] },
              phase: 'postAction',
            },
          ],
        },
      ],
      maxNodes: 8,
      maxAV: 600,
    },
    metadata: { customNames: { now: 'Custom operation' }, characterIds: { 'editor-1': '1001' } },
  }
}
