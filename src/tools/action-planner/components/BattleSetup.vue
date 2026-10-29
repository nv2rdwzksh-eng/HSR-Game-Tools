<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import SelectButton from 'primevue/selectbutton'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import { validSkillPoints } from '../engine/skill-points'
import { elationContribution } from '../engine/queue'
import { resolveElationContributors } from '../model/aha-config'
import { CYCLE_RULES } from '../engine/cycle'
import { Plus, Trash2 } from '@lucide/vue'
import GameIcon from './GameIcon.vue'
import { gameData, characterName } from '../data/adapters/game-data'
import { buildBattleSetup, setupDraft, type AllySlot, type EnemyDraft } from '../model/battle-setup'
import EnemySetup from './EnemySetup.vue'
import UnitPortrait from './UnitPortrait.vue'
import type {
  ActorConfig,
  SimulationPlan,
  CycleMode,
  AhaConfig,
  SkillPointsConfig,
} from '../engine/types'
import type { ToolLocale } from '../../../locales/types'
import type { CharacterRecord } from '../data/schema'
import { createCharacterSearch } from '../model/character-search'
import { formatNumber } from '../model/presentation'
const props = defineProps<{
  plan: SimulationPlan
  characterIds: Record<string, string>
  nextId: () => string
}>()
const emit = defineEmits<{
  apply: [
    actors: ActorConfig[],
    maxNodes: number,
    maxAV: number,
    characters: Record<string, string>,
    cycleMode: CycleMode,
    aha: AhaConfig,
    skillPoints: SkillPointsConfig,
  ]
}>()
const { t, locale } = useI18n()
type Slot = AllySlot
const slots = ref<Slot[]>([])
const enemies = ref<EnemyDraft[]>([])
const maxNodes = ref<number | undefined>()
const maxAV = ref<number | undefined>()
const cycleMode = ref<CycleMode>('none')
const spOnInsufficient = ref<'stop' | 'mark'>('stop')
const spPolicies = computed(() =>
  ['stop', 'mark'].map((value) => ({ value, label: t(`planner.sp.${value}`) })),
)
const spEnabled = ref(false)
const spInitial = ref<number | undefined>(3)
const spMax = ref<number | undefined>(5)
const spStoredMax = ref<number | undefined>(10)
const spModifiers = ref<{ amount: number | undefined; sourceParticipantId: string }[]>([])
const modifierConfig = () =>
  spModifiers.value.map((m) => ({
    amount: m.amount,
    ...(m.sourceParticipantId ? { sourceParticipantId: m.sourceParticipantId } : {}),
  }))
const ahaBaseSpeed = ref<number | undefined>()
const cycleModes = computed(() =>
  (['none', 'moc', 'aa'] as const).map((value) => ({ value, label: t(`planner.cycle.${value}`) })),
)
const cycleRule = computed(() =>
  cycleMode.value === 'none' ? undefined : CYCLE_RULES[cycleMode.value],
)
const errors = ref<string[]>([])
const dirty = defineModel<boolean>('dirty', { default: false })
function load() {
  const setup = setupDraft(props.plan, { characterIds: props.characterIds, customNames: {} })
  slots.value = setup.allies
  enemies.value = setup.enemies
  maxNodes.value = props.plan.maxNodes
  maxAV.value = props.plan.maxAV
  cycleMode.value = props.plan.cycleMode
  ahaBaseSpeed.value = props.plan.aha.baseSpeed
  spOnInsufficient.value = props.plan.skillPoints?.onInsufficient ?? 'stop'
  spEnabled.value = props.plan.skillPoints?.enabled ?? false
  spInitial.value = props.plan.skillPoints?.initial ?? 3
  spMax.value = props.plan.skillPoints?.max ?? 5
  spStoredMax.value = props.plan.skillPoints?.storedMax ?? 10
  spModifiers.value = (props.plan.skillPoints?.maxModifiers ?? []).map((m) => ({
    amount: m.amount,
    sourceParticipantId: m.sourceParticipantId ?? '',
  }))
  errors.value = []
  dirty.value = false
}
watch(
  [
    () => props.plan.actors,
    () => props.plan.maxNodes,
    () => props.plan.maxAV,
    () => props.plan.cycleMode,
    () => props.plan.aha,
    () => props.plan.skillPoints,
  ],
  load,
  {
    immediate: true,
  },
)
const visible = ref(false)
const choosing = ref(0)
const query = ref('')
const search = computed(() =>
  createCharacterSearch(gameData.characters, locale.value as ToolLocale),
)
const choices = computed(() => {
  const q = query.value.trim()
  const byName = search.value(q)
  if (!q) return byName
  const matched = gameData.characters.filter((c) =>
    t(`ui.path.${c.form.pathCode}`).toLowerCase().includes(q.toLowerCase()),
  )
  return [...byName, ...matched.filter((c) => !byName.some((x) => x.id === c.id))]
})
const current = (slot: Slot) => gameData.characters.find((c) => c.id === slot.characterId)
const slotLabel = (slot: Slot) => {
  const c = current(slot)
  return c
    ? characterName(c, locale.value as ToolLocale)
    : (slot.original?.name ?? t('ui.emptySlot'))
}
const choiceName = (c: CharacterRecord) =>
  c.form.gender
    ? t('planner.characterForm', {
        name: characterName(c, locale.value as ToolLocale),
        gender: t(c.form.gender === 'male' ? 'planner.genderMale' : 'planner.genderFemale'),
      })
    : characterName(c, locale.value as ToolLocale)
const spSources = computed(() => {
  const known = slots.value
    .filter((s) => s.id && s.original)
    .map((s) => ({ value: s.id, label: slotLabel(s) }))
  const missing = spModifiers.value
    .map((m) => m.sourceParticipantId)
    .filter((id) => id && !known.some((p) => p.value === id))
  return [
    { value: '', label: t('planner.sp.always') },
    ...known,
    ...[...new Set(missing)].map((id) => ({
      value: id,
      label: t('planner.sp.missingSource', { id }),
    })),
  ]
})
const spEffectivePreview = computed(() => {
  const sum = spModifiers.value.reduce((n, m) => n + (m.amount ?? NaN), 0)
  const max = (spMax.value ?? NaN) + sum
  const valid =
    Number.isSafeInteger(max) &&
    max >= 0 &&
    spModifiers.value.every(
      (m) =>
        Number.isSafeInteger(m.amount) &&
        m.amount !== 0 &&
        (!m.sourceParticipantId || slots.value.some((s) => s.id === m.sourceParticipantId)),
    )
  return valid
    ? t('planner.sp.maxFormula', {
        base: spMax.value,
        modifier: sum >= 0 ? `+${sum}` : String(sum),
        max,
      })
    : t('planner.sp.unknownValue')
})
const occupied = (id: string) =>
  slots.value.some((s, i) => i !== choosing.value && s.characterId === id)
function choose(index: number) {
  choosing.value = index
  query.value = ''
  visible.value = true
}
function replace(c: CharacterRecord) {
  if (occupied(c.id)) return
  const old = slots.value[choosing.value]!
  if (old.characterId !== c.id)
    slots.value[choosing.value] = {
      id: props.nextId(),
      characterId: c.id,
      baseSpeed: c.baseSpeed,
      panelSpeed: c.baseSpeed,
      original: {
        id: '',
        name: c.names['zh-CN'],
        kind: 'actor',
        camp: 'ally',
        category: 'character',
        position: choosing.value,
        baseSpeed: c.baseSpeed ?? 0,
        panelSpeed: c.baseSpeed ?? 0,
      },
    }
  dirty.value = true
  visible.value = false
}
function clear(index: number) {
  slots.value[index] = { id: '', characterId: '', baseSpeed: undefined, panelSpeed: undefined }
  dirty.value = true
}
const ahaContributors = computed(() => {
  const actors = slots.value.flatMap((slot, position) =>
    slot.id && slot.original
      ? [{ ...slot.original, id: slot.id, position, camp: 'ally' as const }]
      : [],
  )
  const characters = Object.fromEntries(
    slots.value.filter((s) => s.id && s.characterId).map((s) => [s.id, s.characterId]),
  )
  return resolveElationContributors(actors, characters, props.plan.aha.contributorIds)
    .contributorIds
})
const ahaInitialSpeed = computed(() => {
  const speeds = slots.value
    .filter((s) => ahaContributors.value.includes(s.id))
    .map((s) => s.panelSpeed)
  if (
    ahaBaseSpeed.value === undefined ||
    !Number.isFinite(ahaBaseSpeed.value) ||
    ahaBaseSpeed.value <= 0 ||
    speeds.some((s) => s === undefined || !Number.isFinite(s) || s <= 0)
  )
    return undefined
  const speed = ahaBaseSpeed.value + elationContribution(speeds as number[])
  return Number.isFinite(speed) ? speed : undefined
})
function apply() {
  const setup = buildBattleSetup(slots.value, enemies.value, maxNodes.value, maxAV.value)
  errors.value = [...setup.invalid]
  if (
    ahaBaseSpeed.value === undefined ||
    !Number.isFinite(ahaBaseSpeed.value) ||
    ahaBaseSpeed.value <= 0
  )
    errors.value.push('aha-base')
  if (
    spInitial.value == null ||
    spMax.value == null ||
    spStoredMax.value == null ||
    !validSkillPoints({
      initial: spInitial.value,
      max: spMax.value,
      storedMax: spStoredMax.value,
      maxModifiers: modifierConfig(),
    })
  )
    errors.value.push('sp')
  spModifiers.value.forEach((m, i) => {
    if (!Number.isSafeInteger(m.amount) || m.amount === 0) errors.value.push(`sp-mod-${i}`)
    if (
      m.sourceParticipantId &&
      !setup.actors.some((a) => a.id === m.sourceParticipantId && a.camp === 'ally')
    )
      errors.value.push(`sp-source-${i}`)
  })
  if (errors.value.length) return
  emit(
    'apply',
    setup.actors,
    maxNodes.value!,
    maxAV.value!,
    setup.characters,
    cycleMode.value,
    {
      ...props.plan.aha,
      baseSpeed: ahaBaseSpeed.value!,
      contributorIds: [...ahaContributors.value],
    },
    {
      enabled: spEnabled.value,
      initial: spInitial.value,
      max: spMax.value,
      storedMax: spStoredMax.value,
      maxModifiers: modifierConfig() as NonNullable<SkillPointsConfig['maxModifiers']>,
      onInsufficient: spOnInsufficient.value,
    },
  )
}
</script>
<template>
  <section class="setup-view">
    <div class="section-title">
      <h2>{{ t('ui.team') }}</h2>
      <span v-if="dirty" class="quiet-tag">{{ t('ui.unapplied') }}</span>
    </div>
    <div class="team-grid">
      <section v-for="(slot, index) in slots" :key="index" class="team-slot">
        <div class="slot-top">
          <span class="slot-number">0{{ index + 1 }}</span
          ><Button
            v-if="slot.id"
            v-tooltip="t('ui.clear')"
            text
            rounded
            severity="secondary"
            :aria-label="
              t('planner.accessibility.clearSlot', {
                slot: formatNumber(index + 1, locale as ToolLocale),
              })
            "
            @click="clear(index)"
            ><Trash2 :size="16" :stroke-width="1.75"
          /></Button>
        </div>
        <button
          class="portrait-button"
          :aria-label="
            t('planner.accessibility.chooseSlot', {
              slot: formatNumber(index + 1, locale as ToolLocale),
            })
          "
          @click="choose(index)"
        >
          <GameIcon
            v-if="current(slot)"
            :asset-key="current(slot)?.assetKey"
            :name="characterName(current(slot)!, locale as ToolLocale)"
            :fallback="t('planner.imageMissing')"
          /><UnitPortrait v-else-if="slot.id" :name="slotLabel(slot)" /><span
            v-else
            class="empty-portrait"
            ><Plus :size="28" :stroke-width="1.75"
          /></span>
        </button>
        <h3 class="character-name" :title="slotLabel(slot)">
          {{ slotLabel(slot) }}
        </h3>
        <div v-if="slot.id" class="slot-speeds">
          <div class="field">
            <label :for="`base-${index}`">{{ t('ui.baseSpeed') }}</label
            ><InputNumber
              v-model="slot.baseSpeed"
              :input-id="`base-${index}`"
              :locale="locale"
              :use-grouping="false"
              :max-fraction-digits="20"
              :invalid="errors.includes(`base-${index}`)"
              :pt="{
                pcInputText: {
                  root: {
                    'aria-describedby': errors.includes(`base-${index}`)
                      ? `base-error-${index}`
                      : undefined,
                  },
                },
              }"
              fluid
              @update:model-value="dirty = true"
            /><small
              v-if="errors.includes(`base-${index}`)"
              :id="`base-error-${index}`"
              class="field-error"
              >{{ t('ui.positive') }}</small
            >
          </div>
          <div class="field">
            <label :for="`panel-${index}`">{{ t('ui.panelSpeed') }}</label
            ><InputNumber
              v-model="slot.panelSpeed"
              :input-id="`panel-${index}`"
              :locale="locale"
              :use-grouping="false"
              :max-fraction-digits="20"
              :invalid="errors.includes(`panel-${index}`)"
              :pt="{
                pcInputText: {
                  root: {
                    'aria-describedby': errors.includes(`panel-${index}`)
                      ? `panel-error-${index}`
                      : undefined,
                  },
                },
              }"
              fluid
              @update:model-value="dirty = true"
            /><small
              v-if="errors.includes(`panel-${index}`)"
              :id="`panel-error-${index}`"
              class="field-error"
              >{{ t('ui.positive') }}</small
            >
          </div>
        </div>
      </section>
    </div>
    <section v-if="ahaContributors.length || errors.includes('aha-base')" class="aha-setup">
      <div class="section-title">
        <h2 class="aha-setup-heading">
          <UnitPortrait :name="t('planner.aha.name')" aha compact aria-hidden="true" />
          {{ t('planner.aha.name') }}
          <span
            class="camp-dot camp-dot-neutral"
            role="img"
            :aria-label="t('planner.navigator.neutral')"
            v-tooltip="t('planner.navigator.neutral')"
          ></span>
        </h2>
      </div>
      <div class="form-grid">
        <div class="field">
          <label for="aha-base-speed">{{ t('ui.baseSpeed') }}</label>
          <InputNumber
            v-model="ahaBaseSpeed"
            input-id="aha-base-speed"
            :locale="locale"
            :use-grouping="false"
            :max-fraction-digits="20"
            :invalid="errors.includes('aha-base')"
            size="small"
            :pt="{
              pcInputText: {
                root: {
                  'aria-describedby': errors.includes('aha-base') ? 'aha-base-error' : undefined,
                },
              },
            }"
            fluid
            @update:model-value="dirty = true"
          />
          <small v-if="errors.includes('aha-base')" id="aha-base-error" class="field-error">{{
            t('ui.positive')
          }}</small>
        </div>
        <div class="field">
          <label for="aha-panel-speed">{{ t('ui.panelSpeed') }}</label>
          <InputText
            id="aha-panel-speed"
            :model-value="
              ahaInitialSpeed === undefined
                ? t('planner.aha.invalidPreview')
                : t('planner.metadata.speed', {
                    speed: formatNumber(ahaInitialSpeed, locale as ToolLocale),
                  })
            "
            size="small"
            fluid
            readonly
          />
        </div>
      </div>
    </section>
    <EnemySetup v-model="enemies" :next-id="nextId" :errors="errors" @dirty="dirty = true" />
    <section class="range-section">
      <h2 id="cycle-mode-label">{{ t('planner.cycle.mode') }}</h2>
      <SelectButton
        v-model="cycleMode"
        :options="cycleModes"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        aria-labelledby="cycle-mode-label"
        class="cycle-mode-control"
        @update:model-value="dirty = true"
      />
      <p v-if="cycleRule" class="fine-print">
        {{
          t('planner.cycle.duration', {
            first: cycleRule.firstCycleAV,
            subsequent: cycleRule.subsequentCycleAV,
          })
        }}
      </p>
    </section>
    <section class="range-section">
      <h2>{{ t('ui.range') }}</h2>
      <div class="form-grid">
        <div class="field">
          <label for="max-nodes">{{ t('ui.maxNodes') }}</label
          ><InputNumber
            v-model="maxNodes"
            input-id="max-nodes"
            :use-grouping="false"
            :max-fraction-digits="20"
            :invalid="errors.includes('maxNodes')"
            :pt="{
              pcInputText: {
                root: {
                  'aria-describedby': errors.includes('maxNodes') ? 'nodes-error' : undefined,
                },
              },
            }"
            fluid
            @update:model-value="dirty = true"
          /><small v-if="errors.includes('maxNodes')" id="nodes-error" class="field-error">{{
            t('ui.nodeBudget')
          }}</small>
        </div>
        <div class="field">
          <label for="max-av">{{ t('ui.maxAV') }}</label
          ><InputNumber
            v-model="maxAV"
            input-id="max-av"
            :use-grouping="false"
            :max-fraction-digits="20"
            :invalid="errors.includes('maxAV')"
            :pt="{
              pcInputText: {
                root: { 'aria-describedby': errors.includes('maxAV') ? 'av-error' : undefined },
              },
            }"
            fluid
            @update:model-value="dirty = true"
          /><small v-if="errors.includes('maxAV')" id="av-error" class="field-error">{{
            t('ui.avBudget')
          }}</small>
        </div>
      </div>
    </section>
    <section class="range-section">
      <h2>
        <label for="sp-enabled">{{ t('planner.sp.enabled') }}</label>
      </h2>
      <ToggleSwitch v-model="spEnabled" input-id="sp-enabled" @update:model-value="dirty = true" />
      <div class="field">
        <span id="sp-policy-label" class="field-label">{{ t('planner.sp.onInsufficient') }}</span>
        <SelectButton
          v-model="spOnInsufficient"
          :options="spPolicies"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          aria-labelledby="sp-policy-label"
          @update:model-value="dirty = true"
        />
      </div>
      <div class="form-grid">
        <div class="field">
          <label for="sp-initial">{{ t('planner.sp.initial') }}</label>
          <InputNumber
            v-model="spInitial"
            input-id="sp-initial"
            :use-grouping="false"
            :invalid="errors.includes('sp')"
            :pt="{
              pcInputText: {
                root: { 'aria-describedby': errors.includes('sp') ? 'sp-config-error' : undefined },
              },
            }"
            @update:model-value="dirty = true"
          />
        </div>
        <div class="field">
          <label for="sp-max">{{ t('planner.sp.max') }}</label>
          <InputNumber
            v-model="spMax"
            input-id="sp-max"
            :use-grouping="false"
            :invalid="errors.includes('sp')"
            :pt="{
              pcInputText: {
                root: { 'aria-describedby': errors.includes('sp') ? 'sp-config-error' : undefined },
              },
            }"
            @update:model-value="dirty = true"
          />
        </div>
      </div>
      <div class="field">
        <label for="sp-stored-max">{{ t('planner.sp.storedMax') }}</label>
        <InputNumber
          v-model="spStoredMax"
          input-id="sp-stored-max"
          :use-grouping="false"
          :max-fraction-digits="20"
          :invalid="errors.includes('sp')"
          :pt="{
            pcInputText: {
              root: { 'aria-describedby': errors.includes('sp') ? 'sp-config-error' : undefined },
            },
          }"
          @update:model-value="dirty = true"
        />
      </div>
      <div class="section-title">
        <h3>{{ t('planner.sp.maxModifiers') }}</h3>
        <Button
          size="small"
          :label="t('planner.sp.addModifier')"
          @click="
            spModifiers.push({ amount: 2, sourceParticipantId: '' })
            dirty = true
          "
        />
      </div>
      <p class="fine-print">{{ spEffectivePreview }}</p>
      <div v-for="(modifier, index) in spModifiers" :key="index" class="form-grid">
        <div class="field">
          <label :for="`sp-mod-${index}`">{{ t('planner.sp.modifierAmount') }}</label>
          <InputNumber
            v-model="modifier.amount"
            :input-id="`sp-mod-${index}`"
            :use-grouping="false"
            :max-fraction-digits="20"
            :invalid="errors.includes(`sp-mod-${index}`)"
            :pt="{
              pcInputText: {
                root: {
                  'aria-describedby': errors.includes(`sp-mod-${index}`)
                    ? `sp-mod-error-${index}`
                    : undefined,
                },
              },
            }"
            @update:model-value="dirty = true"
          />
          <small
            v-if="errors.includes(`sp-mod-${index}`)"
            :id="`sp-mod-error-${index}`"
            class="field-error"
            >{{ t('planner.sp.modifierInvalid') }}</small
          >
        </div>
        <div class="field">
          <label :for="`sp-source-${index}`">{{ t('planner.sp.onlyPresent') }}</label>
          <Select
            v-model="modifier.sourceParticipantId"
            :input-id="`sp-source-${index}`"
            :options="spSources"
            option-label="label"
            option-value="value"
            :invalid="errors.includes(`sp-source-${index}`)"
            :aria-describedby="
              errors.includes(`sp-source-${index}`) ? `sp-source-error-${index}` : undefined
            "
            @update:model-value="dirty = true"
          />
          <small
            v-if="errors.includes(`sp-source-${index}`)"
            :id="`sp-source-error-${index}`"
            class="field-error"
            >{{ t('planner.sp.sourceInvalid') }}</small
          >
          <Button
            text
            size="small"
            :label="t('planner.sp.removeModifier')"
            @click="
              spModifiers.splice(index, 1)
              dirty = true
            "
          />
        </div>
      </div>
      <small v-if="errors.includes('sp')" id="sp-config-error" class="field-error">{{
        t('planner.sp.invalid')
      }}</small>
    </section>
    <div class="setup-footer"><Button :label="t('ui.applySetup')" @click="apply" /></div>
    <Dialog
      v-model:visible="visible"
      modal
      :header="t('ui.choose')"
      :close-button-props="{ 'aria-label': t('ui.close') }"
      :style="{ width: '720px', maxWidth: 'calc(100vw - 32px)' }"
      ><label class="sr-only" for="character-search">{{ t('ui.search') }}</label
      ><InputText
        id="character-search"
        v-model="query"
        :placeholder="t('ui.search')"
        fluid
        autofocus
      />
      <p class="fine-print search-count">
        {{ t('ui.characters', { count: formatNumber(choices.length, locale as ToolLocale) }) }}
      </p>
      <div class="chooser-grid character-choices">
        <button
          v-for="c in choices"
          :key="c.id"
          class="target-button"
          :disabled="occupied(c.id)"
          :aria-pressed="slots[choosing]?.characterId === c.id"
          :title="choiceName(c)"
          :aria-label="choiceName(c)"
          @click="replace(c)"
        >
          <GameIcon
            :asset-key="c.assetKey"
            :name="characterName(c, locale as ToolLocale)"
            :fallback="t('planner.imageMissing')"
          /><span>{{ choiceName(c) }}</span>
        </button>
      </div>
      <p v-if="!choices.length" class="muted">{{ t('ui.noMatches') }}</p></Dialog
    >
  </section>
</template>
