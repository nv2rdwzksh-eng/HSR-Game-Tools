# 接入

```sh
npm ci
npm run build
```

将 `dist/` 复制到项目中：

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { HButton, HInput } from './dist/astral-ui.js'
import './dist/astral-ui.css'

const name = ref('')
</script>

<template>
    <HInput v-model="name" label="昵称" />
    <HButton icon="check">保存</HButton>
</template>
```

引用源码时，从 `src/lib` 导入。

## 开发

| 命令                    | 功能                 |
| ----------------------- | -------------------- |
| `npm run dev`           | 启动示例页           |
| `npm run build`         | 构建组件库至 `dist/` |
| `npm run build:example` | 构建示例页至 `dist/` |
| `npm run preview`       | 预览构建结果         |
| `npm run check`         | 检查代码、格式与构建 |

## 局部接入已有应用

从 `astral-ui/components` 导入组件，不会加载全局主题。另行导入
`astral-ui/scoped-theme.css`，并为面板根元素添加 `h-theme`：

```vue
<script setup lang="ts">
import { HPanel, HButton } from 'astral-ui/components'
import 'astral-ui/scoped-theme.css'
</script>
<template>
    <HPanel class="h-theme" title="Workspace"><HButton>Continue</HButton></HPanel>
</template>
```

局部主题不会修改 body、页面根变量或其他工具。Teleport 的浮层根元素也需
显式添加 `h-theme`。未提供字体文件时使用系统字体，不请求缺失的 font.ttf。
原有默认入口仍加载全局主题。`npm test` 执行无浏览器的组件交互测试。
