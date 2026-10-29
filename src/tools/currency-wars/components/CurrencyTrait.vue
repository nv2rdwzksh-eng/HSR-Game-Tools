<script setup lang="ts">
import CurrencyImage from './CurrencyImage.vue'
defineProps<{ source?: string; name: string }>()
</script>

<template>
  <span class="currency-trait">
    <span class="currency-trait-icon" aria-hidden="true">
      <CurrencyImage :source="source" :name="name" kind="trait" />
    </span>
    <span class="currency-trait-name">{{ name }}</span>
  </span>
</template>

<style scoped>
.currency-trait {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.currency-trait-icon {
  width: var(--trait-icon-size, 38px);
  height: var(--trait-icon-size, 38px);
  flex: 0 0 var(--trait-icon-size, 38px);
  color: var(--color-muted);
}
.currency-trait-name {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
