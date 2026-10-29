import { computed, ref } from 'vue'
import {
  assertPortraitFocusConfig,
  resolvePortraitFocus,
  validPortraitFocus,
  type PortraitFocus,
  type PortraitFocusConfig,
} from '../../../src/tools/warp-simulator/model/portrait-focus'

/** Map the complete contain canvas, excluding letterbox. Dragging clamps at the image edges. */
export function portraitPoint(
  clientX: number,
  clientY: number,
  box: { left: number; top: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number,
  clamp = false,
) {
  if (![box.width, box.height, imageWidth, imageHeight].every((v) => Number.isFinite(v) && v > 0))
    return undefined
  const k = Math.min(box.width / imageWidth, box.height / imageHeight)
  const width = imageWidth * k,
    height = imageHeight * k
  const x = (clientX - box.left - (box.width - width) / 2) / width
  const y = (clientY - box.top - (box.height - height) / 2) / height
  if (![x, y].every(Number.isFinite) || (!clamp && (x < 0 || x > 1 || y < 0 || y > 1)))
    return undefined
  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }
}
function orderedFocus(focus: Partial<PortraitFocus>) {
  return Object.fromEntries(
    (['x', 'y', 'scale'] as const).flatMap((key) =>
      focus[key] === undefined ? [] : [[key, focus[key]]],
    ),
  )
}
export function serializePortraitConfig(config: PortraitFocusConfig) {
  assertPortraitFocusConfig(config)
  const ordered = (group: Readonly<Record<string, Partial<PortraitFocus>>>) =>
    Object.fromEntries(
      Object.keys(group)
        .sort()
        .map((id) => [id, orderedFocus(group[id]!)]),
    )
  return (
    JSON.stringify(
      {
        default: orderedFocus(config.default),
        overrides: ordered(config.overrides),
        overviewOverrides: ordered(config.overviewOverrides),
      },
      null,
      2,
    ) + '\n'
  )
}
/** Development-only draft. Selection never writes configuration or touches the simulator. */
export function createPortraitCalibration(initial: PortraitFocusConfig) {
  assertPortraitFocusConfig(initial)
  const draft = ref<{
    default: PortraitFocus
    overrides: Record<string, PortraitFocus>
    overviewOverrides: Record<string, Partial<PortraitFocus>>
  }>(JSON.parse(serializePortraitConfig(initial)))
  const selected = ref('avatar:1415')
  const profile = ref<'default' | 'overview'>('overview')
  const focus = computed(() =>
    resolvePortraitFocus(draft.value, selected.value, profile.value === 'overview'),
  )
  function setFocus(value: PortraitFocus) {
    if (!validPortraitFocus(value)) return false
    if (profile.value === 'default') draft.value.overrides[selected.value] = { ...value }
    else {
      const base = resolvePortraitFocus(draft.value, selected.value)
      const delta = Object.fromEntries(
        (['x', 'y', 'scale'] as const)
          .filter((key) => value[key] !== base[key])
          .map((key) => [key, value[key]]),
      )
      if (Object.keys(delta).length) draft.value.overviewOverrides[selected.value] = delta
      else delete draft.value.overviewOverrides[selected.value]
    }
    return true
  }
  const modified = computed(() => {
    const original = resolvePortraitFocus(initial, selected.value, profile.value === 'overview')
    return (['x', 'y', 'scale'] as const).some((key) => focus.value[key] !== original[key])
  })
  return {
    draft,
    selected,
    profile,
    focus,
    modified,
    setFocus,
    reset: () => setFocus(draft.value.default),
    restore: () =>
      setFocus(resolvePortraitFocus(initial, selected.value, profile.value === 'overview')),
    exportJson: () => serializePortraitConfig(draft.value),
  }
}
