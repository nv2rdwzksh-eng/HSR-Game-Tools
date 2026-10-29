<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import CurrencyImage from './CurrencyImage.vue'
import type { EmblemDemand } from '../ui/crafting'

defineProps<{ demands: EmblemDemand[] }>()
const { t, n } = useI18n()
</script>

<template>
  <section class="currency-emblem-demand" :aria-label="t('currencyWars.crafting.title')">
    <p v-if="!demands.length" class="currency-demand-empty">
      {{ t('currencyWars.crafting.empty') }}
    </p>
    <template v-else>
      <ul class="currency-demand-list">
        <li v-for="demand in demands" :key="demand.emblemId" class="currency-demand-row">
          <span class="currency-demand-emblem">
            <span class="currency-demand-icon"
              ><CurrencyImage :source="demand.icon" :name="demand.name" kind="emblem"
            /></span>
            <span>{{ demand.name }}</span>
            <strong
              class="currency-demand-count"
              :aria-label="
                t('currencyWars.crafting.quantity', { name: demand.name, count: demand.count })
              "
              >×{{ n(demand.count) }}</strong
            >
          </span>
          <div
            class="currency-demand-recipes"
            role="group"
            :aria-label="t('currencyWars.crafting.recipes')"
          >
            <span v-if="!demand.recipes.length" class="currency-demand-none">—</span>
            <template v-for="(recipe, index) in demand.recipes" :key="recipe.craftIds.join(',')">
              <p v-if="index" class="currency-recipe-divider">
                {{ t('currencyWars.crafting.or') }}
              </p>
              <div class="currency-recipe">
                <template
                  v-for="(material, materialIndex) in recipe.materials"
                  :key="materialIndex"
                >
                  <span v-if="materialIndex" class="currency-recipe-plus" aria-hidden="true"
                    >+</span
                  >
                  <span class="currency-recipe-material">
                    <span class="currency-demand-icon"
                      ><CurrencyImage :source="material.icon" :name="material.name" kind="material"
                    /></span>
                    <span>{{ material.name }}</span>
                  </span>
                </template>
              </div>
            </template>
          </div>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.currency-emblem-demand {
  min-width: 0;
}
.currency-demand-empty {
  color: var(--color-muted);
  font-size: 12px;
  line-height: 1.6;
  margin: 12px 0;
}
.currency-demand-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.currency-demand-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.8fr);
  gap: 12px;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--color-line);
  font-size: 13px;
}
.currency-demand-row:last-child {
  border-bottom: 0;
}
.currency-demand-emblem,
.currency-recipe-material {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.currency-demand-emblem {
  font-weight: 600;
}
.currency-demand-icon {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
}
.currency-demand-count {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
.currency-demand-recipes {
  min-width: 0;
  max-width: 100%;
  justify-self: end;
  text-align: right;
}
.currency-recipe {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.currency-recipe-material {
  max-width: 100%;
}
.currency-recipe-divider {
  margin: 8px 0;
  color: var(--color-muted);
  font-size: 12px;
}
.currency-recipe-plus,
.currency-demand-none {
  color: var(--color-muted);
}
@media (max-width: 640px) {
  .currency-demand-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px 12px;
  }
  .currency-demand-recipes {
    grid-column: 1 / -1;
  }
}
</style>
