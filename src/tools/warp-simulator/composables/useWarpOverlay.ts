import { computed, getCurrentScope, onScopeDispose, ref } from 'vue'

export type WarpPanel = 'controls' | 'history'
type WarpDialog = 'details' | 'selection' | 'reset' | 'dialog'
/** UI navigation only: no session, engine or RNG dependency. */
export function useWarpOverlay() {
  const panel = ref<WarpPanel>()
  const closing = ref<WarpPanel>()
  const dialog = ref<WarpDialog>()
  const locked = computed(() => !!closing.value || !!dialog.value)
  let pending: (() => void) | undefined
  let origin: WarpPanel | undefined
  let focusId: string | undefined
  let panelTrigger: string | undefined
  let disposed = false
  function openPanel(value: WarpPanel) {
    if (disposed || locked.value || panel.value === value) return false
    if (panel.value) {
      pending = () => {
        panel.value = value
      }
      closePanel()
    } else panel.value = value
    return true
  }
  function closePanel() {
    if (disposed || !panel.value || closing.value) return
    if (!pending) {
      panelTrigger = `warp-${panel.value}-trigger`
      focusId = undefined
    }
    closing.value = panel.value
    panel.value = undefined
  }
  function openDialog(action: () => void, triggerId: string, key: WarpDialog = 'dialog') {
    if (disposed || locked.value) return false
    origin = panel.value
    focusId = triggerId
    const activate = () => {
      dialog.value = key
      action()
    }
    if (panel.value) {
      pending = activate
      closePanel()
    } else activate()
    return true
  }
  function afterPanelHide(source: WarpPanel | undefined = closing.value) {
    if (disposed || !closing.value || source !== closing.value) return undefined
    closing.value = undefined
    const action = pending
    pending = undefined
    if (action) {
      action()
      return undefined
    }
    const trigger = panelTrigger
    panelTrigger = undefined
    return trigger
  }
  function afterDialogHide(source: WarpDialog = 'dialog') {
    if (disposed || dialog.value !== source) return undefined
    dialog.value = undefined
    panel.value = origin
    origin = undefined
    return panel.value ? undefined : takeFocus()
  }
  function takeFocus() {
    const id = focusId
    focusId = undefined
    return id
  }
  if (getCurrentScope())
    onScopeDispose(() => {
      disposed = true
      pending = undefined
      origin = undefined
      focusId = undefined
      panelTrigger = undefined
    })
  return {
    panel,
    locked,
    openPanel,
    closePanel,
    openDialog,
    afterPanelHide,
    afterDialogHide,
    takeFocus,
  }
}
