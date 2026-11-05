<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" @click.self="$emit('cancel')" @keydown.escape="$emit('cancel')">
      <div class="modal-box seed-modal">
        <h2>{{ t('seed.title') }}</h2>
        <div class="seed-grid">
          <div v-for="(img, i) in candidates" :key="i" class="seed-item"
            :class="{ selected: selectedIdx === i }"
            @click="selectedIdx = i" @dblclick="confirm">
            <img :src="thumbSrc(img)" :alt="i" class="seed-thumb" />
          </div>
        </div>
        <div class="seed-footer">
          <button class="btn" @click="refresh">{{ t('seed.refresh') }}</button>
          <button class="btn" @click="pickFile">{{ t('seed.pickFile') }}</button>
          <span style="flex:1"></span>
          <button class="btn" @click="$emit('cancel')">{{ t('seed.cancel') }}</button>
          <button class="btn primary" :disabled="selectedIdx < 0" @click="confirm">{{ t('seed.start') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useGalleryStore } from '../stores/gallery'
import { useI18n } from '../i18n'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ select: [path: string]; cancel: []; refresh: [] }>()

const gallery = useGalleryStore()
const { t } = useI18n()
const candidates = ref<ImageItem[]>([])
const selectedIdx = ref(-1)

function pickRandom() {
  candidates.value = gallery.driftCandidates.length
    ? gallery.driftCandidates
    : gallery.images.slice(0, Math.min(25, gallery.images.length))
  selectedIdx.value = -1
}

function refresh() { emit('refresh') }

async function pickFile() {
  const path = await window.picrand.selectImage?.()
  if (path) emit('select', path)
}

function confirm() {
  const s = candidates.value[selectedIdx.value]
  if (s) emit('select', s.file_path)
}

function thumbSrc(img: ImageItem) {
  const orig = encodeURIComponent(img.file_path)
  const thumb = img.thumbnail_path ? `&thumb=${encodeURIComponent(img.thumbnail_path)}` : ''
  return `picrand://get-image?orig=${orig}${thumb}`
}

watch(() => props.visible, v => { if (v) pickRandom() })
watch(() => gallery.driftCandidates, v => { if (props.visible && v?.length) pickRandom() })
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; z-index: 2000;
  background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center;
}
.modal-box { background: var(--bg-panel-solid); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; }
.seed-modal { width: 640px; max-width: 95vw; }
h2 { margin: 0 0 12px; font-size: 15px; color: var(--text-primary); }
.seed-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
.seed-item { aspect-ratio: 1; overflow: hidden; border-radius: 6px; cursor: pointer; border: 2px solid transparent; background: rgba(255,255,255,0.05); }
.seed-item.selected { border-color: #4fc3f7; }
.seed-thumb { width: 100%; height: 100%; object-fit: cover; }
.seed-footer { display: flex; gap: 8px; margin-top: 12px; align-items: center; }
.btn { height: 32px; padding: 0 14px; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; background: var(--bg-hover); color: var(--text-secondary); }
.btn.primary { background: var(--btn-primary-bg); color: var(--text-primary); }
.btn:disabled { opacity: 0.3; cursor: not-allowed; }
</style>
