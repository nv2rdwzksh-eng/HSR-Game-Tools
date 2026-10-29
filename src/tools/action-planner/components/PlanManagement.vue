<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import { Download, Upload, FilePlus2, UsersRound } from '@lucide/vue'
import UnitPortrait from './UnitPortrait.vue'
import { gameData, assetUrl, characterName } from '../data/adapters/game-data'
import { DEFAULT_LIMITS } from '../engine/queue'
import { participantCatalog } from '../engine/validation'
import {
  emptyDocument,
  parsePlannerDocument,
  serializePlannerDocument,
  preparePlannerDocument,
  plannerFilename,
  FILE_LIMITS,
  PlannerFileError,
} from '../model/document-file'
import { plannerTemplates, type PlannerTemplate } from '../templates/catalog'
import { loadPlannerTemplate } from '../templates/loader'
import type { useActionPlanner } from '../composables/useActionPlanner'
import type { createPlannerPersistence, SaveStatus, StorageToken } from '../model/persistence'
import type { ToolLocale } from '../../../locales/types'

const props = defineProps<{
  planner: ReturnType<typeof useActionPlanner>
  persistence: ReturnType<typeof createPlannerPersistence>
  saveStatus: SaveStatus
  setupDirty: boolean
}>()
const { t, locale } = useI18n()
const nameDraft = ref(props.planner.document.value.name)
watch([() => props.planner.document.value.name, () => props.planner.setupRevision.value], () => {
  nameDraft.value = props.planner.document.value.name
})
const fileInput = ref<HTMLInputElement>()
const busy = ref(false)
const error = ref<string>()
const templatesVisible = ref(false)
const templateList = computed(() => [...plannerTemplates].sort((a, b) => a.order - b.order))
const pending = shallowRef<{
  kind: 'replace' | 'overwrite' | 'reload'
  prepared?: ReturnType<typeof preparePlannerDocument>
  token?: StorageToken
  guarded: boolean
}>()
const confirmVisible = computed({
  get: () => !!pending.value,
  set: (value) => {
    if (!value) pending.value = undefined
  },
})
const issueName = (id: string) =>
  participantCatalog(props.planner.plan.value).find((p) => p.id === id)?.name ?? id
const documentError = computed(() => props.planner.documentError.value)
const recoveryError = computed(() =>
  props.saveStatus === 'protected' ? props.persistence.failure : undefined,
)
const issues = computed(() => props.planner.resourceIssues.value)
function setError(cause: unknown) {
  error.value = cause instanceof PlannerFileError ? cause.code : 'read'
}
function rename() {
  props.planner.rename(nameDraft.value)
}
function download(source: string, filename: string) {
  const url = URL.createObjectURL(new Blob([source], { type: 'application/json;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
function exportFile() {
  try {
    download(
      serializePlannerDocument(props.planner.document.value),
      plannerFilename(props.planner.document.value.name),
    )
    error.value = undefined
  } catch (cause) {
    setError(cause)
  }
}
function backupRaw() {
  const token = props.persistence.capture()
  if (token?.raw !== null && token?.raw !== undefined)
    download(token.raw, 'action-planner-storage-backup.json')
}
function worthKeeping() {
  const doc = props.planner.document.value
  return !!(
    doc.name ||
    nameDraft.value !== doc.name ||
    doc.plan.actors.length ||
    doc.plan.events.some((e) => e.operations.length) ||
    Object.keys(doc.metadata.customNames).length ||
    doc.plan.maxNodes !== DEFAULT_LIMITS.maxNodes ||
    doc.plan.maxAV !== DEFAULT_LIMITS.maxAV ||
    doc.plan.cycleMode !== 'none' ||
    doc.plan.aha.baseSpeed !== 80 ||
    props.setupDirty ||
    props.planner.draft.value
  )
}
function requestReplacement(
  prepared: ReturnType<typeof preparePlannerDocument>,
  kind: 'replace' | 'reload' = 'replace',
) {
  const token = props.persistence.capture()
  pending.value = { kind, prepared, token, guarded: props.persistence.guarded }
  if (!worthKeeping() && !props.persistence.guarded) confirm()
}
function newDocument() {
  error.value = undefined
  requestReplacement(preparePlannerDocument(emptyDocument()))
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || busy.value) return
  busy.value = true
  error.value = undefined
  try {
    if (file.size > FILE_LIMITS.bytes) throw new PlannerFileError('limit')
    const parsed = parsePlannerDocument(await file.text())
    requestReplacement(preparePlannerDocument(parsed.document, parsed.issues, parsed.migration))
  } catch (cause) {
    setError(cause)
  } finally {
    busy.value = false
  }
}
function useTemplate(template: PlannerTemplate) {
  try {
    const parsed = loadPlannerTemplate(template)
    const prepared = preparePlannerDocument(parsed.document, parsed.issues, parsed.migration)
    templatesVisible.value = false
    error.value = undefined
    requestReplacement(prepared)
  } catch (cause) {
    setError(cause)
  }
}
function reload() {
  try {
    const token = props.persistence.capture()
    if (!token) return
    const parsed =
      token.raw === null
        ? { document: emptyDocument(), issues: [] }
        : parsePlannerDocument(token.raw)
    pending.value = {
      kind: 'reload',
      prepared: preparePlannerDocument(parsed.document, parsed.issues, parsed.migration),
      token,
      guarded: props.persistence.guarded,
    }
  } catch (cause) {
    setError(cause)
  }
}
function overwrite() {
  const token = props.persistence.capture()
  if (token) pending.value = { kind: 'overwrite', token, guarded: true }
}
function retry() {
  if (props.persistence.guarded) overwrite()
  else props.persistence.save(props.planner.document.value)
}
function confirm() {
  const action = pending.value
  if (!action) return
  const latest = props.persistence.capture()
  if (action.token && (!latest || latest.raw !== action.token.raw)) {
    error.value = 'changed'
    pending.value = undefined
    return
  }
  if (action.kind === 'overwrite') {
    if (action.token) props.persistence.overwrite(props.planner.document.value, action.token)
  } else if (action.kind === 'reload') {
    props.persistence.reload(
      () => (action.prepared ? props.planner.restorePrepared(action.prepared) : false),
      action.token,
    )
  } else if (action.prepared) {
    props.persistence.withoutSaving(() => props.planner.restorePrepared(action.prepared!))
    if (action.token) props.persistence.overwrite(props.planner.document.value, action.token)
    else props.persistence.save(props.planner.document.value)
  }
  pending.value = undefined
}
function templateCharacters(template: PlannerTemplate) {
  try {
    const doc = loadPlannerTemplate(template).document
    return doc.plan.actors
      .filter((a) => a.camp === 'ally')
      .sort((a, b) => a.position - b.position)
      .slice(0, 4)
      .map((actor) => ({
        actor,
        character: gameData.characters.find((c) => c.id === doc.metadata.characterIds[actor.id]),
      }))
  } catch {
    return []
  }
}
defineExpose({ newDocument })
</script>
<template>
  <section class="plan-management">
    <div class="section-title">
      <h2>{{ t('planner.files.title') }}</h2>
      <span class="fine-print" role="status">{{ t(`planner.files.status.${saveStatus}`) }}</span>
    </div>
    <div class="plan-management-row">
      <div class="field plan-name-field">
        <label for="plan-name">{{ t('planner.files.name') }}</label
        ><InputText
          id="plan-name"
          v-model="nameDraft"
          :maxlength="FILE_LIMITS.name"
          :placeholder="t('planner.files.unnamed')"
          fluid
          @blur="rename"
          @keydown.enter.prevent="rename"
        />
      </div>
      <div class="plan-actions">
        <input
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          class="sr-only"
          tabindex="-1"
          :aria-label="t('planner.files.import')"
          @change="importFile"
        />
        <Button text severity="secondary" :disabled="busy" @click="fileInput?.click()"
          ><Upload :size="16" /><span>{{ t('planner.files.import') }}</span></Button
        >
        <Button text severity="secondary" :disabled="busy" @click="exportFile"
          ><Download :size="16" /><span>{{ t('planner.files.export') }}</span></Button
        >
        <Button text severity="secondary" :disabled="busy" @click="newDocument"
          ><FilePlus2 :size="16" /><span>{{ t('planner.files.new') }}</span></Button
        >
        <Button text severity="secondary" :disabled="busy" @click="templatesVisible = true"
          ><UsersRound :size="16" /><span>{{ t('planner.files.templates') }}</span></Button
        >
      </div>
    </div>
    <div v-if="saveStatus === 'protected' || saveStatus === 'external'" class="storage-actions">
      <p class="fine-print">
        {{
          t(
            saveStatus === 'external'
              ? 'planner.files.externalHint'
              : 'planner.files.protectedHint',
          )
        }}
      </p>
      <Button text size="small" :label="t('planner.files.reload')" @click="reload" />
      <Button text size="small" :label="t('planner.files.backupRaw')" @click="backupRaw" />
      <Button text size="small" :label="t('planner.files.overwrite')" @click="overwrite" />
    </div>
    <div v-if="saveStatus === 'failed' || saveStatus === 'unavailable'" class="storage-actions">
      <Button text size="small" :label="t('planner.files.retry')" @click="retry" />
    </div>
    <p v-if="error || documentError || recoveryError" class="field-error" role="alert">
      {{ t(`planner.files.error.${error ?? documentError ?? recoveryError}`) }}
    </p>
    <p v-if="planner.migrationNotice.value" class="fine-print" role="status">
      {{
        t(
          planner.migrationNotice.value.ahaAdded
            ? 'planner.aha.migratedWithAha'
            : 'planner.aha.migrated',
          { version: planner.migrationNotice.value.fromVersion },
        )
      }}
    </p>
    <details v-if="issues.length" class="resource-diagnostics">
      <summary>{{ t('planner.files.resources', { count: issues.length }) }}</summary>
      <p v-for="(issue, index) in issues" :key="index" class="fine-print">
        {{ t(`planner.files.resource.${issue.kind}`, { name: issueName(issue.id) }) }}
      </p>
    </details>
    <Dialog
      v-model:visible="confirmVisible"
      modal
      :header="t('planner.files.confirmTitle')"
      :close-button-props="{ 'aria-label': t('ui.close') }"
      :style="{ width: '440px', maxWidth: 'calc(100vw - 32px)' }"
    >
      <p>
        {{
          t(
            pending?.kind === 'overwrite'
              ? 'planner.files.overwriteConfirm'
              : 'planner.files.replaceConfirm',
          )
        }}
      </p>
      <p v-if="pending?.guarded && pending.kind === 'replace'" class="fine-print">
        {{ t('planner.files.storageReplaceConfirm') }}
      </p>
      <template #footer
        ><Button
          text
          severity="secondary"
          :label="t('ui.cancel')"
          @click="pending = undefined" /><Button
          :label="t('planner.files.confirm')"
          @click="confirm"
      /></template>
    </Dialog>
    <Dialog
      v-model:visible="templatesVisible"
      modal
      :header="t('planner.files.templates')"
      :close-button-props="{ 'aria-label': t('ui.close') }"
      :style="{ width: '640px', maxWidth: 'calc(100vw - 32px)' }"
    >
      <p v-if="!templateList.length" class="fine-print">{{ t('planner.files.noTemplates') }}</p>
      <div v-for="template in templateList" :key="template.id" class="template-entry">
        <h3>{{ t(template.nameKey) }}</h3>
        <div class="template-portraits">
          <UnitPortrait
            v-for="entry in templateCharacters(template)"
            :key="entry.actor.id"
            :src="assetUrl(entry.character?.assetKey)"
            :name="
              entry.character
                ? characterName(entry.character, locale as ToolLocale)
                : entry.actor.name
            "
          />
        </div>
        <p class="fine-print">{{ t(template.descriptionKey) }}</p>
        <p v-if="template.conditionKey" class="fine-print">{{ t(template.conditionKey) }}</p>
        <p v-if="template.gameVersion" class="fine-print">
          {{ t('planner.files.templateVersion', { version: template.gameVersion }) }}
        </p>
        <Button
          size="small"
          :label="t('planner.files.useTemplate')"
          @click="useTemplate(template)"
        />
      </div>
    </Dialog>
  </section>
</template>
