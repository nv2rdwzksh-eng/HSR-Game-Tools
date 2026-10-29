<script setup lang="ts">
import { watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { Analytics } from '@vercel/analytics/vue'
const { t, locale } = useI18n()
const route = useRoute()
watchEffect(() => {
  document.documentElement.lang = locale.value
  document.title = t('site.pageTitle', {
    page: t(String(route.meta.title ?? 'site.name')),
    site: t('site.name'),
  })
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('site.description'))
})
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <RouterLink to="/" class="brand">{{ t('site.name') }}</RouterLink>
      <div class="language-control" :aria-label="t('site.language')">
        <button type="button" :aria-pressed="locale === 'zh-CN'" @click="locale = 'zh-CN'">
          {{ t('site.languageChinese') }}
        </button>
        <button type="button" :aria-pressed="locale === 'en'" @click="locale = 'en'">
          {{ t('site.languageEnglish') }}
        </button>
      </div>
    </header>
    <main><RouterView /></main>
    <Analytics />
  </div>
</template>
