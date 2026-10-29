<script setup lang="ts">
import { ArrowUpRight, ExternalLink } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import GithubIcon from '../components/ui/GithubIcon.vue'
import { toolCatalog } from '../tools/catalog'

const { t } = useI18n()
</script>

<template>
  <div class="home-page">
    <div class="home-hero">
      <h1 class="home-title">{{ t('home.title') }}</h1>
      <a
        class="home-github"
        href="https://github.com/Oereor/HSR-Game-Tools"
        target="_blank"
        rel="noopener noreferrer"
      >
        <GithubIcon />
        <span>{{ t('home.github') }}</span>
        <ExternalLink :size="14" :stroke-width="1.75" aria-hidden="true" />
      </a>
    </div>

    <section class="home-tools" aria-labelledby="home-tools-heading">
      <div class="home-section-heading">
        <h2 id="home-tools-heading">{{ t('home.toolsHeading') }}</h2>
      </div>
      <div class="home-tool-grid">
        <component
          :is="tool.route ? RouterLink : 'article'"
          v-for="tool in toolCatalog"
          :key="tool.id"
          v-bind="tool.route ? { to: tool.route } : {}"
          class="home-tool"
          :class="{ 'home-tool-available': tool.route }"
          :aria-labelledby="`home-tool-${tool.id}-title`"
          :aria-describedby="`home-tool-${tool.id}-description`"
        >
          <div class="home-tool-icon" aria-hidden="true">
            <component :is="tool.icon" :size="24" :stroke-width="1.75" />
          </div>
          <h3 :id="`home-tool-${tool.id}-title`" class="home-tool-title">
            {{ t(`home.tools.${tool.id}.title`) }}
          </h3>
          <p :id="`home-tool-${tool.id}-description`" class="home-tool-description">
            {{ t(`home.tools.${tool.id}.description`) }}
          </p>
          <ArrowUpRight
            v-if="tool.route"
            class="home-tool-arrow"
            :size="18"
            :stroke-width="1.75"
            aria-hidden="true"
          />
        </component>
      </div>
    </section>

    <footer class="home-footer">
      <p>{{ t('home.disclaimer', { site: t('site.name') }) }}</p>
    </footer>
  </div>
</template>

<style scoped>
.home-page {
  padding-top: 20px;
}

.home-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 44px;
}

.home-title {
  min-width: 0;
  margin: 0;
  font-size: clamp(1.75rem, 3.5vw, 2.75rem);
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.home-github {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--color-line);
  border-radius: 6px;
  color: var(--color-muted);
  font-size: 13px;
  transition:
    color 150ms ease,
    border-color 150ms ease,
    background-color 150ms ease;
}

.home-github:hover,
.home-github:focus-visible {
  color: var(--color-ink);
  border-color: var(--color-muted);
  background: var(--color-surface);
  text-decoration: none;
}

.home-section-heading {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.home-section-heading::after {
  content: '';
  height: 1px;
  flex: 1;
  background: var(--color-line);
}

.home-tool-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}

.home-tool {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  min-height: 240px;
  padding: 24px;
  border: 1px solid color-mix(in srgb, var(--color-line) 75%, transparent);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-muted);
}

.home-tool-icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  margin-bottom: 24px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--color-muted) 8%, transparent);
}

.home-tool-title {
  margin: 0;
  color: var(--p-surface-200);
  font-size: 20px;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.home-tool-description {
  margin: 10px 0 0;
  color: var(--color-muted);
  font-size: 14px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.home-tool-available {
  border-color: color-mix(in srgb, var(--color-accent) 45%, var(--color-line));
  transition:
    border-color 150ms ease,
    background-color 150ms ease;
}

.home-tool-available .home-tool-icon {
  color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 10%, transparent);
}

.home-tool-available .home-tool-title {
  color: var(--color-ink);
}

.home-tool-available:hover,
.home-tool-available:focus-visible {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-surface) 94%, var(--color-ink));
  text-decoration: none;
}

.home-tool-arrow {
  align-self: flex-end;
  flex-shrink: 0;
  margin-top: auto;
  padding-top: 16px;
  box-sizing: content-box;
  color: var(--color-accent);
  transition: transform 150ms ease;
}

.home-tool-available:hover .home-tool-arrow,
.home-tool-available:focus-visible .home-tool-arrow {
  transform: translate(2px, -2px);
}

.home-footer {
  margin-top: 48px;
  padding-top: 20px;
  border-top: 1px solid var(--color-line);
  color: var(--color-muted);
  font-size: 12px;
}

.home-footer p {
  margin: 0;
}

@media (max-width: 1100px) {
  .home-tool-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .home-page {
    padding-top: 8px;
  }

  .home-hero {
    align-items: flex-start;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 32px;
  }

  .home-tool-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }

  .home-footer {
    margin-top: 32px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-github,
  .home-tool-available,
  .home-tool-arrow {
    transition: none;
  }

  .home-tool-available:hover .home-tool-arrow,
  .home-tool-available:focus-visible .home-tool-arrow {
    transform: none;
  }
}
</style>
