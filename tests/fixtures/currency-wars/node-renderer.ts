import { createRenderer } from 'vue'

// Vue mounts the actual SFCs in Node. This host records rendered attributes and
// events; it intentionally does not pretend to perform browser CSS layout.
export interface HostNode {
  value?: unknown
  type: string
  props: Record<string, unknown>
  children: HostNode[]
  parent: HostNode | null
  text: string
  // Inline display only: needed by the real TabPanel v-show directive; no CSS layout.
  style: Record<string, string>
  listeners: Record<string, ((event: unknown) => void)[]>
  addEventListener: (name: string, listener: (event: unknown) => void) => void
  removeEventListener: (name: string, listener: (event: unknown) => void) => void
  getRootNode: () => object
  getBoundingClientRect: () => { height: number }
  clientWidth: number
  clientHeight: number
  scrollWidth: number
  scrollHeight: number
  scrollTop: number
  scrollLeft: number
}
export function node(type: string, text = ''): HostNode {
  const listeners: HostNode['listeners'] = {}
  return {
    type,
    props: {},
    children: [],
    parent: null,
    text,
    style: {},
    listeners,
    addEventListener(name, listener) {
      ;(listeners[name] ??= []).push(listener)
    },
    removeEventListener(name, listener) {
      listeners[name] = listeners[name]?.filter((value) => value !== listener) ?? []
    },
    getRootNode: () => ({}),
    getBoundingClientRect: () => ({ height: 100 }),
    clientWidth: 300,
    clientHeight: 300,
    scrollWidth: 300,
    scrollHeight: 500,
    scrollTop: 0,
    scrollLeft: 0,
  }
}
function remove(child: HostNode) {
  if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
  child.parent = null
}
function insert(child: HostNode, parent: HostNode, anchor: HostNode | null = null) {
  remove(child)
  parent.children.splice(
    anchor ? parent.children.indexOf(anchor) : parent.children.length,
    0,
    child,
  )
  child.parent = parent
}
export const renderer = createRenderer<HostNode, HostNode>({
  // Teleport target lookup only; body can be a HostNode supplied by a lifecycle test.
  querySelector: (selector) =>
    selector === 'body' ? (document.body as unknown as HostNode) : null,
  createElement: (type) => node(type),
  createText: (text) => node('#text', text),
  createComment: (text) => node('#comment', text),
  setText: (target, text) => {
    target.text = text
  },
  setElementText: (target, text) => {
    target.children = []
    target.text = text
  },
  patchProp: (target, key, _previous, value) => {
    target.props[key] = value
    if (key === 'value') target.value = value
  },
  insert,
  remove,
  parentNode: (target) => target.parent,
  nextSibling: (target) =>
    target.parent?.children[target.parent.children.indexOf(target) + 1] ?? null,
  setScopeId: (target, id) => {
    target.props[id] = ''
  },
  insertStaticContent: (content, parent, anchor) => {
    const target = node('#static', content)
    insert(target, parent, anchor)
    return [target, target]
  },
})
export function descendants(root: HostNode): HostNode[] {
  return [root, ...root.children.flatMap(descendants)]
}
