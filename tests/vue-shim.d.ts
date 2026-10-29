// Node's tsc checks test imports; the render test project compiles SFCs with Vite.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent
  export default component
}
