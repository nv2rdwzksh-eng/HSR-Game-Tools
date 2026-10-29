<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import CurrencyImage from './CurrencyImage.vue'
import type { VisualMember } from '../ui/visuals'
defineProps<{ member: VisualMember }>()
const emit = defineEmits<{ inspect: [member: VisualMember] }>()
const { t } = useI18n()
</script>

<template>
  <li class="currency-role">
    <div class="currency-role-visual">
      <Button
        type="button"
        unstyled
        class="currency-role-portrait"
        :style="{ background: `var(--p-currency-cost-${member.cost})` }"
        :aria-label="t('currencyWars.visual.openDetails', { name: member.role.name })"
        aria-haspopup="dialog"
        @click="emit('inspect', member)"
      >
        <CurrencyImage :source="member.portraitUrl" :name="member.role.name" kind="role" />
        <span class="currency-role-cost">{{
          t('currencyWars.visual.cost', { cost: member.cost })
        }}</span>
        <span v-if="member.role.expert" class="currency-role-expert">{{
          t('currencyWars.visual.expert')
        }}</span>
      </Button>
      <div
        class="currency-emblem-row"
        :aria-label="t('currencyWars.visual.emblems', { name: member.role.name })"
      >
        <span
          v-for="(emblem, index) in member.slots"
          :key="index"
          class="currency-emblem-slot"
          :class="{ 'currency-emblem-empty': !emblem }"
          :title="
            emblem
              ? t('currencyWars.visual.emblemTrait', { name: emblem.name, trait: emblem.traitName })
              : t('currencyWars.visual.emptySlot')
          "
          v-tooltip.focus.top="
            emblem
              ? t('currencyWars.visual.emblemTrait', { name: emblem.name, trait: emblem.traitName })
              : undefined
          "
          :tabindex="emblem ? 0 : undefined"
          role="img"
          :aria-label="
            emblem
              ? t('currencyWars.visual.emblemTrait', { name: emblem.name, trait: emblem.traitName })
              : t('currencyWars.visual.emptySlot')
          "
        >
          <CurrencyImage v-if="emblem" :source="emblem.url" :name="emblem.name" kind="emblem" />
        </span>
      </div>
    </div>
    <h3 :title="member.role.name">{{ member.role.name }}</h3>
    <p v-if="member.role.identityId === 8007">
      {{ t(`currencyWars.visual.${member.role.position}`) }}
    </p>
    <p v-else-if="member.role.mechanic === 'navigator'">
      {{
        member.target
          ? t('currencyWars.visual.cardTarget', { name: member.target.name })
          : t('currencyWars.visual.cardNoTarget')
      }}
    </p>
    <p v-else-if="member.role.mechanic === 'bronya'">
      {{ member.bronyaTrait?.name ?? t('currencyWars.visual.cardUnassigned') }}
    </p>
  </li>
</template>

<style scoped>
.currency-role {
  min-width: 0;
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 5px;
  text-align: center;
}
.currency-role-visual {
  --emblem-gap: 3px;
  width: 100%;
  max-width: 100%;
  flex-shrink: 0;
}
.currency-role-portrait {
  display: block;
  padding: 0;
  border: 0;
  width: 100%;
  aspect-ratio: 1;
  position: relative;
  border-radius: 6px 6px 0 0;
  overflow: hidden;
  color: var(--p-surface-950);
}
.currency-role-portrait:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 3px;
}
.currency-role-cost {
  position: absolute;
  left: 3px;
  top: 4px;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--p-surface-950);
  color: var(--p-surface-50);
  font-size: 11px;
}
.currency-role-expert {
  position: absolute;
  right: 3px;
  bottom: 3px;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 10px;
  background: var(--p-surface-950);
  color: var(--p-surface-50);
}
.currency-emblem-slot:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}
.currency-emblem-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--emblem-gap);
  width: 100%;
  margin-top: var(--emblem-gap);
}
.currency-emblem-slot {
  aspect-ratio: 1;
  min-width: 0;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-line);
  border-radius: 3px;
  overflow: hidden;
  color: var(--color-muted);
}
.currency-emblem-empty {
  border-color: transparent;
  background: color-mix(in srgb, var(--color-line) 25%, transparent);
}
h3 {
  margin: 3px 0 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  max-width: 100%;
  overflow-wrap: anywhere;
}
p {
  margin: 0;
  font-size: 11px;
  color: var(--color-muted);
  overflow-wrap: anywhere;
}
</style>
