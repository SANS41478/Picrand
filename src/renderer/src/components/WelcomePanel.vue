<template>
  <Teleport to="body">
    <div v-if="visible" class="welcome-overlay" @click.self="onLater">
      <div class="welcome-box">
        <div class="welcome-title">{{ t('welcome.title') }}</div>
        <div class="welcome-subtitle">{{ t('welcome.subtitle') }}</div>

        <div class="welcome-lang-grid">
          <button
            v-for="l in languages"
            :key="l.code"
            class="welcome-lang-btn"
            :class="{ active: localeChoice === l.code }"
            @click="chooseLocale(l.code)"
          >{{ l.label }}</button>
        </div>

        <div class="welcome-actions">
          <button class="welcome-btn welcome-btn-secondary" @click="onLater">{{ t('welcome.later') }}</button>
          <button class="welcome-btn welcome-btn-primary" @click="onOpenFolder">{{ t('welcome.openFolder') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n, setLocale, getLocale } from '../i18n'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  (e: 'later'): void
  (e: 'open-folder'): void
}>()

const { t } = useI18n()
const localeChoice = ref(getLocale())

const languages = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '简体中文' },
  { code: 'zh-Hant', label: '繁體中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'ru', label: 'Русский' },
  { code: 'es-ES', label: 'Español (España)' },
  { code: 'es-419', label: 'Español (Latinoamérica)' },
  { code: 'pt-PT', label: 'Português (Portugal)' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'pl', label: 'Polski' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'th', label: 'ไทย' },
  { code: 'uk', label: 'Українська' },
  { code: 'it', label: 'Italiano' },
  { code: 'cs', label: 'Čeština' },
]

watch(() => props.visible, (v) => {
  if (v) localeChoice.value = getLocale()
})

function chooseLocale(code: string) {
  localeChoice.value = code
  setLocale(code)
}

function onLater() {
  emit('later')
}

function onOpenFolder() {
  emit('open-folder')
}
</script>

<style scoped>
.welcome-overlay {
  position: fixed; inset: 0; z-index: 10000;
  background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: center; justify-content: center;
}
.welcome-box {
  background: var(--modal-bg, #1e1e2e);
  border: 1px solid var(--border-color);
  border-radius: 0;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  width: 960px; max-width: 92vw;
  padding: 64px 56px 48px;
  display: flex; flex-direction: column; gap: 32px;
}
.welcome-title {
  font-size: 44px; font-weight: 700; letter-spacing: 1px;
  color: var(--text-primary); text-align: left;
}
.welcome-subtitle {
  font-size: 28px; color: var(--text-secondary); text-align: left;
  margin-top: -12px;
}
.welcome-lang-grid {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 12px; margin: 8px 0 16px;
}
.welcome-lang-btn {
  height: 40px;
  border: 1px solid var(--border-color);
  border-radius: 0;
  background: var(--bg-input-solid, #333);
  color: var(--text-primary);
  font-size: 14px; cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
}
.welcome-lang-btn:hover { filter: brightness(1.15); }
.welcome-lang-btn:active { transform: scale(0.97); }
.welcome-lang-btn.active {
  background: var(--accent-color, #5b8cff);
  color: #fff;
  border-color: var(--accent-color, #5b8cff);
}
.welcome-lang-btn:focus-visible { outline: 2px solid #0078d4; outline-offset: 1px; }
.welcome-actions {
  display: flex; gap: 14px; justify-content: flex-end;
  margin-top: 8px;
}
.welcome-btn {
  height: 36px; padding: 0 20px;
  border: 1px solid var(--border-color); border-radius: 0;
  font-size: 14px; cursor: pointer; min-width: 110px; text-align: center;
}
.welcome-btn-secondary {
  background: var(--bg-input-solid, #333); color: var(--text-primary);
}
.welcome-btn-secondary:hover { filter: brightness(1.15); }
.welcome-btn-primary {
  background: var(--accent-color, #5b8cff); color: #fff;
  border-color: var(--accent-color, #5b8cff);
}
.welcome-btn-primary:hover { filter: brightness(1.1); }
.welcome-btn:active { filter: brightness(0.9); }
.welcome-btn:focus-visible { outline: 2px solid #0078d4; outline-offset: 1px; }
</style>