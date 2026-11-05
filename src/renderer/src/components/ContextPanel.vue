<template>
  <aside class="context-panel">
    <!-- 搜索栏：仅在已打开文件夹时显示 -->
    <div v-if="gallery.folderPath" class="search-bar">
      <!-- 关键词/AI/描述搜索模式 -->
      <template v-if="gallery.searchFilterMode === 'normal' || gallery.searchFilterMode === 'description' || gallery.searchFilterMode === 'ai'">
        <input
          v-model="searchInput"
          class="search-input"
          :placeholder="searchPlaceholder"
          @keyup.enter="doSearch"
          @keyup.esc="doClear"
          @focus="showHistory = history.length > 0"
          @blur="hideHistoryLater"
        >
        <button v-if="history.length > 0" class="history-btn" :class="{ active: showHistory }" :title="t('context.aiHistoryTip')" @mousedown.prevent="toggleHistory">▾</button>
        <span class="search-clear" @click="doClear" :title="t('search.clear')">×</span>
        <div v-if="showHistory && history.length" class="search-history">
          <div v-for="(h, i) in history" :key="i" class="history-item">
            <span class="history-text" @mousedown.prevent="useHistory(h)">{{ h }}</span>
            <span class="history-del" :title="t('context.aiHistoryDel')" @mousedown.prevent="removeHistory(h)">×</span>
          </div>
        </div>
      </template>

      <!-- 星级筛选模式 -->
      <template v-if="gallery.searchFilterMode === 'rating'">
        <div class="filter-row">
          <div class="rating-stars-filter">
            <button v-for="i in 5" :key="i" class="rfs-btn" :class="{ active: ratingFilter.has(i) }"
              @click="toggleRatingStar(i)">
              <span class="rfs-star">{{ ratingFilter.has(i) ? '★' : '☆' }}</span>
            </button>
          </div>
          <button class="filter-confirm-btn" @click="applyRatingFilter">{{ t('search.ratioSearch') }}</button>
          <button class="filter-cancel-btn" @click="clearRatingFilter">{{ t('search.cancel') }}</button>
        </div>
      </template>

      <!-- 比例筛选模式 -->
      <template v-if="gallery.searchFilterMode === 'ratio'">
        <div class="filter-row">
          <input class="ratio-input" type="number" v-model.number="ratioW" min="1" max="9999" @keyup.enter="applyRatioFilter" />
          <span class="ratio-colon">:</span>
          <input class="ratio-input" type="number" v-model.number="ratioH" min="1" max="9999" @keyup.enter="applyRatioFilter" />
          <span class="ratio-tol-label">{{ t('search.ratioTolerance') }}</span>
          <input class="ratio-tol-input" type="number" v-model.number="ratioTol" min="0" max="50" step="1" title="0-50%" />
          <span class="ratio-tol-unit">%</span>
          <button class="filter-confirm-btn" @click="applyRatioFilter">{{ t('search.ratioSearch') }}</button>
          <button class="filter-cancel-btn" @click="clearRatioFilter">{{ t('search.cancel') }}</button>
        </div>
      </template>

      <!-- 类似图片模式：选一张本地图作种子进入风格漫游 -->
      <template v-if="gallery.searchFilterMode === 'similar'">
        <div class="similar-wrap">
          <div class="similar-pick-row">
            <button class="similar-pick-btn" @click="pickSimilarImage">{{ t('search.similarPick') }}</button>
            <img v-if="similarSeedPath" class="similar-thumb" :src="similarThumbSrc" />
            <span v-if="similarSeedPath" class="similar-name" :title="similarSeedName">{{ similarSeedName }}</span>
            <span v-if="!similarSeedPath" class="similar-hint">{{ t('search.similarHint') }}</span>
          </div>
          <div class="similar-action-row">
            <button class="filter-confirm-btn similar-start-btn" :disabled="!similarSeedPath" @click="startSimilarDrift">{{ t('search.similarStart') }}</button>
            <button class="filter-cancel-btn" @click="clearSimilar">{{ t('search.clear') }}</button>
          </div>
        </div>
      </template>

      <!-- 印象色模式：HS 选色框 + V 明度柱 + 差值 -->
      <template v-if="gallery.searchFilterMode === 'color'">
        <div class="color-filter">
          <div class="color-picker-row">
            <canvas
              ref="hsCanvas"
              class="hs-canvas"
              width="172"
              height="112"
              @pointerdown="onHsDown"
              @pointermove="onHsMove"
            ></canvas>
            <canvas
              ref="vCanvas"
              class="v-canvas"
              width="16"
              height="112"
              @pointerdown="onVDown"
              @pointermove="onVMove"
            ></canvas>
            <div v-if="useHue && useSat && useValue" class="color-preview-col">
              <div class="color-preview" :style="{ background: previewColor }"></div>
              <span class="color-preview-hex">{{ previewHex }}</span>
            </div>
          </div>
          <div class="color-readout">
            <span class="color-readout-item">H {{ Math.round(colorH) }}</span>
            <span class="color-readout-item">S {{ Math.round(colorS * 100) }}%</span>
            <span class="color-readout-item">V {{ Math.round(colorV * 100) }}%</span>
          </div>
          <div class="color-component-row">
            <span class="color-component-title">{{ t('search.colorComponents') }}</span>
            <label class="color-component-toggle">
              <input type="checkbox" v-model="useHue" />
              <span>{{ t('search.colorHue') }}</span>
            </label>
            <label class="color-component-toggle">
              <input type="checkbox" v-model="useSat" />
              <span>{{ t('search.colorSat') }}</span>
            </label>
            <label class="color-component-toggle">
              <input type="checkbox" v-model="useValue" />
              <span>{{ t('search.colorValue') }}</span>
            </label>
          </div>
          <div class="color-tol-row">
            <span class="color-tol-label">{{ t('search.colorTolerance') }}</span>
            <input class="color-tol-range" type="range" min="0" max="100" step="1" v-model.number="colorTol" :style="{ '--tol-fill': colorTol + '%' }" />
            <span class="color-tol-value">{{ colorTol }}%</span>
          </div>
          <div class="color-actions">
            <button class="filter-confirm-btn" @click="applyColorFilter">{{ t('search.colorSearch') }}</button>
            <button class="filter-cancel-btn" @click="clearColorFilter">{{ t('search.cancel') }}</button>
          </div>
        </div>
      </template>

      <!-- 漏斗按钮：切换搜索模式 -->
      <button class="search-funnel-btn" :class="{ active: showFunnelMenu }" :title="t('search.switchMode')" @click="toggleFunnelMenu">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>
      </button>
      <div v-if="showFunnelMenu" class="funnel-menu">
        <div :class="['funnel-item', { active: gallery.searchFilterMode === 'normal' }]" @mousedown.prevent="setFilterMode('normal')">
          <span class="fm-label">{{ t('search.modeNormal') }}</span>
        </div>
        <div :class="['funnel-item', { active: gallery.searchFilterMode === 'description' }]" @mousedown.prevent="setFilterMode('description')">
          <span class="fm-label">{{ t('search.modeDescription') }}</span>
        </div>
        <div :class="['funnel-item', { active: gallery.searchFilterMode === 'ai', disabled: !gallery.aiSearchEnabled }]" @mousedown.prevent="setFilterMode('ai')">
          <span class="fm-label">{{ t('search.modeAi') }}</span>
        </div>
        <div :class="['funnel-item', { active: gallery.searchFilterMode === 'rating' }]" @mousedown.prevent="setFilterMode('rating')">
          <span class="fm-label">{{ t('search.modeRating') }}</span>
        </div>
        <div :class="['funnel-item', { active: gallery.searchFilterMode === 'ratio' }]" @mousedown.prevent="setFilterMode('ratio')">
          <span class="fm-label">{{ t('search.modeRatio') }}</span>
        </div>
        <div :class="['funnel-item', { active: gallery.searchFilterMode === 'similar' }]" @mousedown.prevent="setFilterMode('similar')">
          <span class="fm-label">{{ t('search.modeSimilar') }}</span>
        </div>
        <div :class="['funnel-item', { active: gallery.searchFilterMode === 'color' }]" @mousedown.prevent="setFilterMode('color')">
          <span class="fm-label">{{ t('search.modeColor') }}</span>
        </div>
        <!-- 格式筛选（独立功能：筛选瀑布池中出现的格式） -->
        <div class="fmt-section">
          <div class="fmt-header">
            <span class="fmt-title">{{ t('search.formatFilter') }}</span>
            <span class="fmt-actions">
              <span class="fmt-link" @mousedown.prevent="setAllFormats(true)">{{ t('search.formatAll') }}</span>
              <span class="fmt-link" @mousedown.prevent="setAllFormats(false)">{{ t('search.formatNone') }}</span>
            </span>
          </div>
          <div class="fmt-group">{{ t('search.formatImage') }}</div>
          <div class="fmt-grid">
            <button
              v-for="ext in IMAGE_EXTS" :key="ext"
              :class="['fmt-btn', { on: gallery.formatFilter.includes(ext) }]"
              @mousedown.prevent="toggleFormat(ext)"
            >{{ ext.slice(1).toUpperCase() }}</button>
          </div>
          <div class="fmt-group">{{ t('search.formatVideo') }}</div>
          <div class="fmt-grid">
            <button
              v-for="ext in VIDEO_EXTS" :key="ext"
              :class="['fmt-btn', { on: gallery.formatFilter.includes(ext) }]"
              @mousedown.prevent="toggleFormat(ext)"
            >{{ ext.slice(1).toUpperCase() }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!gallery.activeImage" class="panel-empty">
      <span>{{ t('context.empty') }}</span>
    </div>

    <!-- 激活图片 -->
    <div v-else class="panel-content">
      <div class="preview-box">
        <img
          :src="previewSrc"
          :alt="gallery.activeImage.file_name"
          class="preview-img"
          @dblclick="openWithDefault(gallery.activeImage!.file_path)"
        >
      </div>

      <div class="metadata-list">
        <div class="meta-item">
          <span class="meta-label">{{ t('context.filename') }}</span>
          <span class="meta-value">{{ gallery.activeImage.file_name }}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">{{ t('context.modified') }}</span>
          <span class="meta-value">{{ formatDate(gallery.activeImage.modify_time) }}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">{{ t('context.filesize') }}</span>
          <span class="meta-value">{{ formatSize(gallery.activeImage.file_size) }}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">{{ t('context.dimensions') }}</span>
          <span class="meta-value dims-row">
            <span>{{ dimsText }}</span>
            <button class="unit-toggle" @click="toggleUnit" :title="gallery.dimensionUnit === 'px' ? t('context.switchToMm') : t('context.switchToPx')">{{ gallery.dimensionUnit }}</button>
          </span>
        </div>
        <div class="meta-item">
          <span class="meta-label">{{ t('context.path') }}</span>
          <span class="meta-value path-value" @click="copyPath(gallery.activeImage!.file_path)" :title="gallery.activeImage.file_path">
            {{ gallery.activeImage.file_path }}
          </span>
        </div>
      </div>

      <!-- 评分与描述 -->
      <div class="rating-row">
        <div class="stars" :title="currentRating ? t('context.ratingClearHint') : ''">
          <button v-for="i in 5" :key="i" class="star-btn" :class="{ active: i <= currentRating }" @click="setRating(i)">
            <svg width="16" height="16" viewBox="0 0 24 24" :fill="i <= currentRating ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </button>
        </div>
      </div>
      <div class="desc-row">
        <textarea class="desc-input" v-model="currentDesc" :placeholder="t('context.description')" rows="1" @blur="saveDescription"></textarea>
      </div>

      <div class="action-grid">
        <button class="act-btn" @click="openLocation(gallery.activeImage!.file_path)">{{ t('context.openLocation') }}</button>
        <button class="act-btn" @click="handleSaveAs(gallery.activeImage!.file_path)">{{ t('context.saveAs') }}</button>
        <button class="act-btn" @click="openRefBoardForActive">{{ t('gallery.openRefBoard') }}</button>
        <button class="act-btn" @click="searchWithDefault">{{ t('gallery.imageSearch') }}</button>
        <button class="act-btn" @click="openWithDefault(gallery.activeImage!.file_path)">{{ openBtnLabel }}</button>
        <button v-if="gallery.pinboardEnabled" class="act-btn" @click="addToPinboard(gallery.activeImage!)">{{ t('context.addToPinboard') }}</button>
        <button class="act-btn" :class="{ favd: favActive }" @click="toggleFavorite(gallery.activeImage!.file_path)">
          {{ favActive ? '&#x2764;' : '&#x2661;' }} {{ favActive ? t('context.unfavorite') : t('context.favorite') }}
        </button>
        <button class="act-btn act-delete" @click="openDeleteModal">&#x1F5D1; {{ t('context.delete') }}</button>
      </div>
    </div>

    <div v-if="gallery.images.length > 0" class="panel-footer">
      <div class="scroll-progress-track" :class="{ 'track-jumpable': pagingEnabled }" @click="onTrackClick"><div class="scroll-progress-bar" :style="{ width: gallery.scrollProgress + '%' }"></div></div>
      <div class="stats-text">
        <template v-if="pagingEnabled">
          <span v-if="!jumpSpin">{{ t('gallery.pageOf', { page: currentPageNum, total: totalPagesNum }) }}</span>
          <span v-else>{{ t('gallery.loading') }}</span>
          <input v-if="!jumpSpin" class="stats-input" type="number" min="1" :max="totalPagesNum" v-model="jumpInput" @keyup.enter="doJump" @keyup.esc="jumpInput = currentPageNum">
          <span class="stats-sep">|</span>
        </template>
        {{ t('gallery.loaded', { loaded: gallery.images.length, total: gallery.totalImages }) }}
      </div>
    </div>

    <!-- Toast -->
    <transition name="toast-fade">
      <div v-if="toast" class="toast-msg">{{ toast }}</div>
    </transition>

    <!-- ====== 安全删除 Modal ====== -->
    <Teleport to="body">
      <div v-if="showDeleteModal" class="modal-overlay" @click.self="showDeleteModal = false">
        <div class="modal-box delete-modal">
          <div class="modal-icon">⚠️</div>
          <div class="modal-title">{{ t('delete.title') }}</div>
          <div class="modal-path">
            <template v-if="deleteTargets.length === 1">
              <code>{{ deleteTargets[0] }}</code>
            </template>
            <template v-else>
              <div class="delete-batch-list">
                <code v-for="(p, i) in deleteTargets.slice(0, 3)" :key="p">{{ p.split('\\').pop() || p }}</code>
                <div v-if="deleteTargets.length > 3" class="delete-more">...{{ t('folderSel.count', { n: deleteTargets.length - 3 }) }}</div>
              </div>
            </template>
          </div>
          <div class="modal-actions">
            <button class="modal-btn modal-cancel" @click="showDeleteModal = false" autofocus>{{ t('delete.cancel') }}</button>
            <button class="modal-btn modal-confirm" @click="executeDelete">{{ deleteTargets.length > 1 ? t('delete.confirmMsg', { count: deleteTargets.length }) : t('delete.confirm') }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </aside>
</template>

<script setup lang="ts">
import { useGalleryStore } from '../stores/gallery'
import { usePinboardStore } from '../stores/pinboard'
import { useI18n } from '../i18n'
import { ref, computed, watch, nextTick } from 'vue'
import { isVideoExt } from '../utils/video'
import { IMAGE_EXTS, VIDEO_EXTS, ALL_EXTS } from '../utils/formats'

const gallery = useGalleryStore()
const pinboard = usePinboardStore()
const { t } = useI18n()
const emit = defineEmits<{ 'jump-page': [n: number]; 'do-search': [q: string]; 'do-rating-search': [ratings: number[]]; 'do-ratio-search': [ratioW: number, ratioH: number, tolerance: number]; 'do-color-search': [target: { h: number; s: number; v: number }, tolerance: number, useHue: boolean, useSat: boolean, useValue: boolean]; 'start-similar-drift': [path: string]; 'format-filter-changed': [] }>()
const PAGE_SIZE = 100
const totalPagesNum = computed(() => Math.max(1, Math.ceil((gallery.totalImages || 0) / PAGE_SIZE)))
const pagingEnabled = computed(() => gallery.viewMode !== 'drift' && gallery.viewMode !== 'favorites' && !gallery.searchQuery && totalPagesNum.value > 1 && (gallery.totalImages || 0) > 100)
const currentPageNum = ref(1)
const jumpInput = ref<string | number>('')
const jumpSpin = ref(false)
watch(() => gallery.scrollProgress, () => {
  const idx = Math.round((gallery.scrollProgress / 100) * (gallery.totalImages || 1))
  currentPageNum.value = totalPagesNum.value > 0 ? Math.max(1, Math.min(totalPagesNum.value, Math.floor((idx - 1) / PAGE_SIZE) + 1)) : 1
})
function doJump() {
  const n = parseInt(String(jumpInput.value))
  if (isNaN(n) || n < 1 || n > totalPagesNum.value) return
  jumpSpin.value = true
  listenJumpDone()
  emit('jump-page', n)
}
let _jumpDoneHandler: (() => void) | null = null
function listenJumpDone() {
  if (_jumpDoneHandler) document.removeEventListener('picrand-jump-done', _jumpDoneHandler)
  _jumpDoneHandler = () => { jumpSpin.value = false; document.removeEventListener('picrand-jump-done', _jumpDoneHandler!); _jumpDoneHandler = null }
  document.addEventListener('picrand-jump-done', _jumpDoneHandler, { once: true })
  setTimeout(() => { if (_jumpDoneHandler) { jumpSpin.value = false; document.removeEventListener('picrand-jump-done', _jumpDoneHandler); _jumpDoneHandler = null } }, 30000)
}
function onTrackClick(e: MouseEvent) {
  if (!pagingEnabled.value) return
  const track = e.currentTarget as HTMLElement
  const rect = track.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const idx = Math.round(pct * (gallery.totalImages || 1))
  const page = Math.max(1, Math.min(totalPagesNum.value, Math.floor((idx - 1) / PAGE_SIZE) + 1))
  jumpSpin.value = true
  listenJumpDone()
  emit('jump-page', page)
}
const favActive = ref(false)
const openBtnLabel = computed(() => {
  const img = gallery.activeImage
  return (img && isVideoExt(img.file_path)) ? t('context.openExternalPlayer') : t('context.openImage')
})
const toast = ref('')
const showDeleteModal = ref(false)
const deleteTargets = ref<string[]>([])
const currentRating = ref(0)
const currentDesc = ref('')
const activeDpi = ref(72)

const previewSrc = computed(() => {
  const img = gallery.activeImage
  if (!img) return ''
  const orig = encodeURIComponent(img.file_path)
  const thumb = img.thumbnail_path ? `&thumb=${encodeURIComponent(img.thumbnail_path)}` : ''
  return `picrand://get-image?orig=${orig}${thumb}`
})

// 跟踪当前详情页对应的图（用于切图时回写旧图——不能读 gallery.activeImage，
// 因为 watch 触发时 activeImage 已指向新图，否则旧图描述会被错写到新图 file_path 上）
let _lastImg: ImageItem | null = null

// 切图前回写旧图描述（@blur 在切图瞬间丢失，需显式 flush）
async function _flushDescription() {
  const old = _lastImg
  if (!old?.file_path) return
  if (currentDesc.value === (old.description || '')) return
  try {
    await window.picrand.setImageDescription(old.file_path, currentDesc.value)
    const idx = gallery.images.findIndex(i => i.file_path === old.file_path)
    if (idx >= 0) {
      const arr = [...gallery.images]
      arr[idx] = { ...arr[idx], description: currentDesc.value }
      gallery.images = arr
    }
    // 不改 activeImage——此时它已指向新图；旧图引用上的 description 也无需更新
  } catch (err) { console.error('保存描述失败:', err) }
}

watch(() => gallery.activeImage, async (img) => {
  // currentDesc 是正在编辑的缓冲，会与 img.description 短暂偏离；评分/收藏等只替换 activeImage 引用
  // （file_path 不变），不能重置描述，否则会把用户刚输入的描述清空。只有真正切到另一张图才重置。
  const switched = !_lastImg || !img || img.file_path !== _lastImg.file_path
  await _flushDescription()
  _lastImg = img ? { ...img } : null
  favActive.value = !!img?.is_favorite
  currentRating.value = img?.rating || 0
  if (switched) currentDesc.value = img?.description || ''
}, { flush: 'pre' })

const searchInput = ref('')

// 搜索历史：按文件夹隔离，localStorage 持久化最近 10 条，去重，新条目置顶
// 存储格式：Map<folderPath, string[]>，序列化为 JSON 对象
function historyStorageKey(mode: string) {
  if (mode === 'ai') return 'picrand-ai-search-history-v2'
  if (mode === 'description') return 'picrand-desc-search-history-v2'
  return 'picrand-filename-search-history-v2'
}
function loadAllHistory(mode: string): Record<string, string[]> {
  try { const s = localStorage.getItem(historyStorageKey(mode)); return s ? JSON.parse(s) : {} } catch { return {} }
}
function saveAllHistory(mode: string, data: Record<string, string[]>) {
  try { localStorage.setItem(historyStorageKey(mode), JSON.stringify(data)) } catch {}
}
// 按当前文件夹过滤
function folderHistory(mode: string): string[] {
  const fp = gallery.folderPath
  if (!fp) return []
  return (loadAllHistory(mode)[fp] || []).slice(0, 10)
}

const aiHistory = ref<string[]>(folderHistory('ai'))
const filenameHistory = ref<string[]>(folderHistory('filename'))
const descHistory = ref<string[]>(folderHistory('description'))
const showHistory = ref(false)
const history = computed(() => {
  if (gallery.searchMode === 'ai') return aiHistory.value
  if (gallery.searchMode === 'description') return descHistory.value
  return filenameHistory.value
})

function pushHistory(q: string) {
  if (!gallery.folderPath) return
  const mode = gallery.searchMode
  const all = loadAllHistory(mode)
  const arr = (all[gallery.folderPath] || []).filter(x => x !== q)
  arr.unshift(q)
  all[gallery.folderPath] = arr.slice(0, 10)
  saveAllHistory(mode, all)
  // 更新当前显示
  const ref_ = mode === 'ai' ? aiHistory : mode === 'description' ? descHistory : filenameHistory
  ref_.value = arr.slice(0, 10)
}
function removeHistory(q: string) {
  if (!gallery.folderPath) return
  const mode = gallery.searchMode
  const all = loadAllHistory(mode)
  const arr = (all[gallery.folderPath] || []).filter(x => x !== q)
  all[gallery.folderPath] = arr
  saveAllHistory(mode, all)
  const ref_ = mode === 'ai' ? aiHistory : mode === 'description' ? descHistory : filenameHistory
  ref_.value = arr
  if (!arr.length) showHistory.value = false
}
function toggleHistory() {
  showHistory.value = !showHistory.value
}
// 切换文件夹时重新加载该文件夹的搜索历史
watch(() => gallery.folderPath, () => {
  aiHistory.value = folderHistory('ai')
  filenameHistory.value = folderHistory('filename')
  descHistory.value = folderHistory('description')
  showHistory.value = false
})
function useHistory(q: string) {
  searchInput.value = q
  showHistory.value = false
  gallery.searchQuery = q
  emit('do-search', q)
}
let _hideHistTimer: ReturnType<typeof setTimeout> | null = null
function hideHistoryLater() {
  if (_hideHistTimer) clearTimeout(_hideHistTimer)
  _hideHistTimer = setTimeout(() => { showHistory.value = false }, 150)
}

function doSearch() {
  const q = searchInput.value.trim()
  if (!q) { doClear(); return }
  pushHistory(q)
  gallery.searchQuery = q
  emit('do-search', q) // 直接 emit 给 App.vue 调用 topBarRef.startSearch，避免依赖 watch(searchQuery) 同值不触发
}

function doClear() {
  searchInput.value = ''
  gallery.searchQuery = '' // 触发 TopBar watch 调 clearSearch
}

// AI 语义搜索模式切换
const searchPlaceholder = computed(() => {
  if (gallery.searchMode === 'ai') return t('context.searchAiPlaceholder')
  if (gallery.searchMode === 'description') return t('context.searchDescriptionPlaceholder')
  return t('context.searchPlaceholder')
})

// 同步 store 的 searchQuery 到本地 input（含快照恢复时恢复搜索词）
watch(() => gallery.searchQuery, (q) => { searchInput.value = q }, { immediate: false })

// ━━━━ 漏斗菜单：切换搜索模式 ━━━━
const showFunnelMenu = ref(false)

function toggleFunnelMenu() {
  showFunnelMenu.value = !showFunnelMenu.value
}

function setFilterMode(mode: SearchFilterMode) {
  if (mode === 'ai' && !gallery.aiSearchEnabled) return
  showFunnelMenu.value = false
  // 切换离开 similar 模式时清空已选种子
  if (gallery.searchFilterMode === 'similar' && mode !== 'similar') similarSeedPath.value = ''
  // 退出当前筛选回到正常浏览
  if (gallery.searchQuery) {
    gallery.searchQuery = ''
    searchInput.value = ''
  }
  gallery.searchFilterMode = mode
  // 更新底层 searchMode
  if (mode === 'normal') {
    gallery.searchMode = 'filename'
  } else if (mode === 'description') {
    gallery.searchMode = 'description'
  } else if (mode === 'ai') {
    gallery.searchMode = 'ai'
  }
  // rating/ratio/similar 模式走独立的 emit 通道，不需要 searchMode
  if (mode === 'color') nextTick(drawColorPicker)
  // 持久化 filterMode
  try {
    const saved = window.picrand.readConfig?.()
    saved?.then((cfg: any) => window.picrand.saveConfig?.({ ...cfg, searchFilterMode: mode }))
  } catch {}
}

// ━━━━ 类似图片模式：选本地图作种子进入风格漫游 ━━━━
const similarSeedPath = ref('')
const similarThumbSrc = computed(() => {
  if (!similarSeedPath.value) return ''
  const orig = encodeURIComponent(similarSeedPath.value)
  return `picrand://get-image?orig=${orig}`
})
const similarSeedName = computed(() => {
  if (!similarSeedPath.value) return ''
  return similarSeedPath.value.split(/[\\/]/).pop() || similarSeedPath.value
})
async function pickSimilarImage() {
  const path = await window.picrand.selectImage?.()
  if (path) similarSeedPath.value = path
}
function startSimilarDrift() {
  if (!similarSeedPath.value) return
  emit('start-similar-drift', similarSeedPath.value)
}
function clearSimilar() {
  similarSeedPath.value = ''
  // 回到正常浏览模式
  setFilterMode('normal')
}

// ━━━━ 格式筛选（漏斗菜单内的独立功能） ━━━━
let _fmtEmitTimer: ReturnType<typeof setTimeout> | null = null

function persistFormatFilter() {
  try { window.picrand.setFormatFilter?.([...gallery.formatFilter]) } catch {}
  // 防抖通知 TopBar 重载当前视图（避免快速连续勾选触发多次重载）
  if (_fmtEmitTimer) clearTimeout(_fmtEmitTimer)
  _fmtEmitTimer = setTimeout(() => { _fmtEmitTimer = null; emit('format-filter-changed') }, 300)
}

function toggleFormat(ext: string) {
  const cur = gallery.formatFilter
  gallery.formatFilter = cur.includes(ext) ? cur.filter(e => e !== ext) : [...cur, ext]
  persistFormatFilter()
}

function setAllFormats(on: boolean) {
  gallery.formatFilter = on ? [...ALL_EXTS] : []
  persistFormatFilter()
}

// ━━━━ 星级筛选 ━━━━
const ratingFilter = ref(new Set<number>())

function toggleRatingStar(star: number) {
  const s = new Set(ratingFilter.value)
  if (s.has(star)) s.delete(star)
  else s.add(star)
  ratingFilter.value = s
}

function applyRatingFilter() {
  showFunnelMenu.value = false
  const ratings = Array.from(ratingFilter.value).sort()
  emit('do-rating-search', ratings)
}

function clearRatingFilter() {
  ratingFilter.value = new Set()
  gallery.searchQuery = ''
}

// ━━━━ 比例筛选 ━━━━
const ratioW = ref(16)
const ratioH = ref(9)
const ratioTol = ref(5)

function applyRatioFilter() {
  showFunnelMenu.value = false
  const w = Math.max(1, Math.min(9999, ratioW.value))
  const h = Math.max(1, Math.min(9999, ratioH.value))
  const tol = Math.max(0, Math.min(50, ratioTol.value))
  ratioW.value = w; ratioH.value = h; ratioTol.value = tol
  emit('do-ratio-search', w, h, tol / 100)
}

function clearRatioFilter() {
  gallery.searchQuery = ''
}

// ━━━━ 印象色筛选：HS 选色框 + V 明度柱 ━━━━
const colorH = ref(0)
const colorS = ref(1)
const colorV = ref(1)
const colorTol = ref(20)
const useHue = ref(true)
const useSat = ref(true)
const useValue = ref(true)
const hsCanvas = ref<HTMLCanvasElement | null>(null)
const vCanvas = ref<HTMLCanvasElement | null>(null)

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const hh = (((h % 360) + 360) % 360) / 60
  const c = v * s
  const x = c * (1 - Math.abs((hh % 2) - 1))
  const m = v - c
  let r = 0, g = 0, b = 0
  if (hh < 1) { r = c; g = x; b = 0 }
  else if (hh < 2) { r = x; g = c; b = 0 }
  else if (hh < 3) { r = 0; g = c; b = x }
  else if (hh < 4) { r = 0; g = x; b = c }
  else if (hh < 5) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) }
}

const previewColor = computed(() => {
  const { r, g, b } = effectiveColor()
  return `rgb(${r}, ${g}, ${b})`
})

const previewHex = computed(() => {
  const { r, g, b } = effectiveColor()
  return `#${[r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
})

function effectiveColor(): { r: number; g: number; b: number } {
  const hue = useHue.value ? colorH.value : 0
  const sat = useSat.value ? colorS.value : 1
  const v = useValue.value ? colorV.value : 1
  const rgb = hsvToRgb(hue, sat, v)
  if (!useHue.value) {
    const gray = Math.round(0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b)
    return { r: gray, g: gray, b: gray }
  }
  return rgb
}

function drawHsCanvas() {
  const canvas = hsCanvas.value
  if (!canvas) return
  // 让画布内部尺寸跟随 CSS 实际尺寸，避免 flex 横向拉伸把圆点压成椭圆。
  const cssW = canvas.clientWidth || 172
  const cssH = canvas.clientHeight || 112
  if (canvas.width !== cssW) canvas.width = cssW
  if (canvas.height !== cssH) canvas.height = cssH
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width, h = canvas.height
  const img = ctx.createImageData(w, h)
  for (let py = 0; py < h; py++) {
    const s = useSat.value ? 1 - py / (h - 1) : 1
    for (let px = 0; px < w; px++) {
      const hue = useHue.value ? (px / (w - 1)) * 360 : 0
      const v = useValue.value ? colorV.value : 1
      let r: number, g: number, b: number
      ;({ r, g, b } = hsvToRgb(hue, s, v))
      if (!useHue.value) {
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
        r = g = b = gray
      }
      const idx = (py * w + px) * 4
      img.data[idx] = r; img.data[idx + 1] = g; img.data[idx + 2] = b; img.data[idx + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const mx = (colorH.value / 360) * (w - 1)
  const my = (1 - colorS.value) * (h - 1)
  const tol = colorTol.value / 100
  const activeDims = (useHue.value ? 1 : 0) + (useSat.value ? 1 : 0) + (useValue.value ? 1 : 0)
  const radius = activeDims > 0 ? Math.sqrt(activeDims) * tol : 0
  const rx = useHue.value ? radius * (w - 1) / 2 : 0
  const ry = useSat.value ? radius * (h - 1) : 0
  ctx.save()
  ctx.lineWidth = 1
  const sampleInverse = (x: number, y: number) => {
    const px = Math.max(0, Math.min(w - 1, Math.round(x)))
    const py = Math.max(0, Math.min(h - 1, Math.round(y)))
    const idx = (py * w + px) * 4
    return `rgb(${255 - img.data[idx]}, ${255 - img.data[idx + 1]}, ${255 - img.data[idx + 2]})`
  }
  const barHalf = 7
  const stemLen = 9
  const barHalfX = rx > 0 ? Math.min(barHalf, rx) : barHalf
  const barHalfY = ry > 0 ? Math.min(barHalf, ry) : barHalf
  if (ry > 0) {
    const topY = Math.max(0, Math.min(h - 1, my - ry))
    const topStem = Math.min(stemLen, ry)
    ctx.strokeStyle = sampleInverse(mx, topY)
    ctx.beginPath()
    ctx.moveTo(mx - barHalfX, topY); ctx.lineTo(mx + barHalfX, topY)
    ctx.moveTo(mx, topY); ctx.lineTo(mx, topY + topStem)
    ctx.stroke()

    const botY = Math.max(0, Math.min(h - 1, my + ry))
    const botStem = Math.min(stemLen, ry)
    ctx.strokeStyle = sampleInverse(mx, botY)
    ctx.beginPath()
    ctx.moveTo(mx - barHalfX, botY); ctx.lineTo(mx + barHalfX, botY)
    ctx.moveTo(mx, botY); ctx.lineTo(mx, botY - botStem)
    ctx.stroke()
  }
  if (rx > 0) {
    const leftX = Math.max(0, Math.min(w - 1, mx - rx))
    const leftStem = Math.min(stemLen, rx)
    ctx.strokeStyle = sampleInverse(leftX, my)
    ctx.beginPath()
    ctx.moveTo(leftX, my - barHalfY); ctx.lineTo(leftX, my + barHalfY)
    ctx.moveTo(leftX, my); ctx.lineTo(leftX + leftStem, my)
    ctx.stroke()

    const rightX = Math.max(0, Math.min(w - 1, mx + rx))
    const rightStem = Math.min(stemLen, rx)
    ctx.strokeStyle = sampleInverse(rightX, my)
    ctx.beginPath()
    ctx.moveTo(rightX, my - barHalfY); ctx.lineTo(rightX, my + barHalfY)
    ctx.moveTo(rightX, my); ctx.lineTo(rightX - rightStem, my)
    ctx.stroke()
  }
  ctx.restore()
  ctx.beginPath()
  ctx.arc(mx, my, 3.5, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
  ctx.lineWidth = 1
  ctx.stroke()
}

function drawVCanvas() {
  const canvas = vCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width, h = canvas.height
  const img = ctx.createImageData(w, h)
  if (!useValue.value) {
    // 明度未参与筛选：整条明度柱置灰，表示禁用。
    for (let py = 0; py < h; py++) {
      const gray = 235 - Math.round((py / (h - 1)) * 25)
      for (let px = 0; px < w; px++) {
        const idx = (py * w + px) * 4
        img.data[idx] = gray; img.data[idx + 1] = gray; img.data[idx + 2] = gray; img.data[idx + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    return
  }

  for (let py = 0; py < h; py++) {
    const v = 1 - py / (h - 1)
    let r: number, g: number, b: number
    if (useHue.value) {
      const sat = useSat.value ? colorS.value : 1
      ;({ r, g, b } = hsvToRgb(colorH.value, sat, v))
    } else {
      const gray = Math.round(v * 255)
      r = g = b = gray
    }
    for (let px = 0; px < w; px++) {
      const idx = (py * w + px) * 4
      img.data[idx] = r; img.data[idx + 1] = g; img.data[idx + 2] = b; img.data[idx + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const my = (1 - colorV.value) * (h - 1)
  const tol = colorTol.value / 100
  const activeDims = (useHue.value ? 1 : 0) + (useSat.value ? 1 : 0) + (useValue.value ? 1 : 0)
  const halfH = (activeDims > 0 ? Math.sqrt(activeDims) * tol : 0) * (h - 1)
  const top = Math.max(0, my - halfH)
  const bottom = Math.min(h, my + halfH)
  const inverseAt = (py: number) => {
    const y = Math.max(0, Math.min(h - 1, Math.round(py)))
    const idx = y * w * 4
    return `rgb(${255 - img.data[idx]}, ${255 - img.data[idx + 1]}, ${255 - img.data[idx + 2]})`
  }
  const lineColor = inverseAt(my)
  ctx.lineWidth = 1
  ctx.strokeStyle = lineColor
  ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(w, top); ctx.stroke()
  ctx.strokeStyle = lineColor
  ctx.beginPath(); ctx.moveTo(0, bottom); ctx.lineTo(w, bottom); ctx.stroke()
  ctx.strokeStyle = lineColor
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(0, my); ctx.lineTo(w, my); ctx.stroke()
  // 上下容差线各向中间延伸半条线长，且不越过指示线。
  const extLen = w / 2
  ctx.strokeStyle = lineColor
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(w / 2, top)
  ctx.lineTo(w / 2, Math.min(my, top + extLen))
  ctx.moveTo(w / 2, bottom)
  ctx.lineTo(w / 2, Math.max(my, bottom - extLen))
  ctx.stroke()
}

function drawColorPicker() {
  drawHsCanvas()
  drawVCanvas()
}

watch([useHue, useSat, useValue, colorTol], () => {
  if (gallery.searchFilterMode === 'color') nextTick(drawColorPicker)
})

function canvasPoint(e: PointerEvent, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
  }
}

function onHsDown(e: PointerEvent) {
  ;(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId)
  onHsMove(e)
}
function onHsMove(e: PointerEvent) {
  if (!hsCanvas.value || !(e.buttons & 1)) return
  const { x, y } = canvasPoint(e, hsCanvas.value)
  colorH.value = Math.round(x * 360)
  colorS.value = Math.round((1 - y) * 100) / 100
  drawHsCanvas()
  drawVCanvas()
}
function onVDown(e: PointerEvent) {
  ;(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId)
  onVMove(e)
}
function onVMove(e: PointerEvent) {
  if (!vCanvas.value || !(e.buttons & 1)) return
  const { y } = canvasPoint(e, vCanvas.value)
  colorV.value = Math.round((1 - y) * 100) / 100
  drawHsCanvas()
  drawVCanvas()
}

function applyColorFilter() {
  showFunnelMenu.value = false
  const target = { h: colorH.value, s: colorS.value, v: colorV.value }
  const tol = Math.max(0, Math.min(1, colorTol.value / 100))
  emit('do-color-search', target, tol, useHue.value, useSat.value, useValue.value)
}

function clearColorFilter() {
  gallery.searchQuery = ''
}

// ━━━━ 外部点击关闭漏斗菜单 ━━━━
function onDocClick(e: MouseEvent) {
  const el = e.target as HTMLElement
  if (!el.closest('.search-bar')) showFunnelMenu.value = false
}
import { onMounted, onUnmounted } from 'vue'
onMounted(() => {
  document.addEventListener('click', onDocClick)
  // 监听 Delete 键触发的批量删除请求（来自 GalleryCanvas）
  document.addEventListener('picrand-delete-request', ((e: CustomEvent) => {
    deleteTargets.value = e.detail?.paths || []
    if (deleteTargets.value.length) showDeleteModal.value = true
  }) as EventListener)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('picrand-delete-request', (() => {}) as EventListener)
})

watch(() => gallery.activeImage, async (img) => {
  if (!img?.file_path) return
  try {
    const info = await window.picrand.getImageInfo(img.file_path)
    if (info && (info as any).dpi) activeDpi.value = (info as any).dpi
  } catch {}
})

const dimsText = computed(() => {
  const img = gallery.activeImage
  if (!img) return '? × ?'
  const w = img.width || 0, h = img.height || 0
  if (w === 0 && h === 0 && img && isVideoExt(img.file_path)) return t('context.videoFile')
  if (gallery.dimensionUnit === 'mm' && w && h && activeDpi.value) {
    const wmm = (w / activeDpi.value * 25.4).toFixed(1)
    const hmm = (h / activeDpi.value * 25.4).toFixed(1)
    return `${wmm} × ${hmm}`
  }
  return `${w || '?'} × ${h || '?'}`
})

async function toggleUnit() {
  gallery.dimensionUnit = gallery.dimensionUnit === 'px' ? 'mm' : 'px'
  try {
    const saved = await window.picrand.readConfig?.()
    await window.picrand.saveConfig?.({ ...saved, dimensionUnit: gallery.dimensionUnit })
  } catch {}
}

function formatSize(bytes: number): string {
  if (!bytes) return '?'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatDate(ts: number): string {
  if (!ts) return '?'
  return new Date(ts * 1000).toLocaleString('zh-CN')
}

function copyPath(filePath: string) {
  navigator.clipboard.writeText(filePath)
  toast.value = t('context.pathCopied'); setTimeout(() => toast.value = '', 1500)
}

async function openLocation(filePath: string) { await window.picrand.openInFolder(filePath) }
async function openWithDefault(filePath: string) { await window.picrand.openWithDefault(filePath) }
async function addToPinboard(img: ImageItem) {
  try {
    await pinboard.addImage(img)
  } catch (err: any) {
    toast.value = err?.message || t('context.addFailed')
    setTimeout(() => toast.value = '', 1600)
  }
}


async function setRating(rating: number) {
  const img = gallery.activeImage
  if (!img) return
  // 再次点击当前分数对应的星 → 清零
  const target = currentRating.value === rating ? 0 : rating
  const fp = img.file_path
  currentRating.value = target
  try {
    await window.picrand.setImageRating(fp, target)
  } catch (err) {
    console.error('评分失败:', err)
    toast.value = t('context.opFailed')
    setTimeout(() => toast.value = '', 1600)
    // 失败回滚：仅当仍在该图上才恢复 UI
    if (gallery.activeImage?.file_path === fp) currentRating.value = img.rating || 0
    return
  }
  // await 期间已切图则不再回写 store，避免污染新图
  if (gallery.activeImage?.file_path !== fp) return
  // Update in-memory image (must create new object — store images are frozen)
  const idx = gallery.images.findIndex(i => i.file_path === fp)
  if (idx >= 0) {
    const arr = [...gallery.images]
    arr[idx] = { ...arr[idx], rating: target }
    gallery.images = arr
  }
  if (gallery.activeImage?.file_path === fp) {
    gallery.activeImage = { ...gallery.activeImage, rating: target }
  }
}

async function saveDescription() { await _flushDescription() }

async function toggleFavorite(filePath: string) {
  try {
    if (favActive.value) {
      await window.picrand.unfavoriteImage(filePath)
      favActive.value = false
      gallery.setFavorite(filePath, 0)
      toast.value = t('context.unfavorited'); setTimeout(() => toast.value = '', 1500)
    } else {
      await window.picrand.favoriteImage(filePath)
      favActive.value = true
      gallery.setFavorite(filePath, 1)
      toast.value = t('context.favorited'); setTimeout(() => toast.value = '', 1500)
    }
  } catch (err: any) {
    console.error('收藏操作失败:', err)
    // 回滚 UI 状态
    favActive.value = !!gallery.activeImage?.is_favorite
    toast.value = t('context.opFailed')
    setTimeout(() => toast.value = '', 2000)
  }
}

async function handleSaveAs(filePath: string) { await window.picrand.saveAs(filePath) }

// ━━━━ 以图搜图 ━━━━
function doImageSearch(key: string) {
  const img = gallery.activeImage
  if (!img) return
  if (gallery.imageSearchEnabled) {
    const apiMap: Record<string, string> = { yandex: 'yandexSearch', saucenao: 'saucenaoSearch', tineye: 'tineyeSearch', tracemoe: 'tracemoeSearch', googlelens: 'googlelensSearch' }
    ;(window.picrand as any)?.[apiMap[key]]?.(img.file_path)?.catch(() => {})
    toast.value = t('gallery.imageSearching')
    setTimeout(() => { if (toast.value === t('gallery.imageSearching')) toast.value = '' }, 2000)
  } else {
    const urlMap: Record<string, string> = { yandex: 'https://yandex.com/images/', saucenao: 'https://saucenao.com/', tineye: 'https://tineye.com/', tracemoe: 'https://trace.moe/', googlelens: 'https://lens.google.com/' }
    window.open(urlMap[key], '_blank')
  }
}

function searchWithDefault() {
  doImageSearch(gallery.searchEngine)
}

// ━━━━ 新建参考板 ━━━━
async function openRefBoardForActive() {
  const img = gallery.activeImage
  if (!img) return
  try {
    const result = await window.picrand.openRefBoard(img.file_path)
    if (result && !result.ok) console.error('[RefBoard] Failed:', result.error)
  } catch (e) { console.error(e) }
}

function openDeleteModal() {
  deleteTargets.value = gallery.activeImage?.file_path ? [gallery.activeImage.file_path] : []
  showDeleteModal.value = true
}

async function executeDelete() {
  showDeleteModal.value = false
  const targets = [...deleteTargets.value]
  deleteTargets.value = []
  if (!targets.length) return
  try {
    for (const fp of targets) {
      await window.picrand.deleteImage(fp)
      gallery.removeImageByPath(fp)
    }
    gallery.activeImage = null
    toast.value = targets.length > 1 ? t('delete.confirmMsg', { count: targets.length }) : t('context.deleted')
    setTimeout(() => toast.value = '', 2000)
  } catch (err) { console.error('删除失败:', err) }
}
</script>

<style scoped>
.context-panel {
  position: absolute;
  top: 48px; right: 0; bottom: 0;
  width: 320px;
  border-left: 1px solid var(--border-color);
  overflow-y: auto;
  background: var(--bg-panel);
  padding: 16px;
  display: flex; flex-direction: column;
}

.panel-empty {
  display: flex; align-items: center; justify-content: center;
  flex: 1; color: var(--text-hint); font-size: 14px;
}

.panel-content { display: flex; flex-direction: column; gap: 16px; }

.preview-box {
  width: 100%; height: 200px; border-radius: 8px; overflow: hidden;
  background: var(--preview-bg);
  display: flex; align-items: center; justify-content: center;
}
.preview-img { width: 100%; height: 100%; object-fit: contain; }

.search-bar { position: relative; margin-bottom: 8px; padding-bottom: 0; flex-shrink: 0; }
.search-input {
  width: 100%; height: 28px; padding: 0 56px 0 10px; border: 1px solid var(--border-color);
  border-radius: 6px; background: var(--bg-input-solid); color: var(--text-primary); font-size: 12px; outline: none;
}
.search-input::placeholder { color: var(--text-muted); }
.search-input:focus { border-color: rgba(142,180,255,0.5); }
.search-clear {
  position: absolute; right: 32px; top: 1px;
  width: 24px; height: 24px; border: none; background: transparent;
  color: var(--text-muted); font-size: 14px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.search-clear:hover { color: var(--text-primary); }

/* 漏斗按钮 — 始终在搜索栏最右侧 */
.search-funnel-btn {
  position: absolute; right: 2px; top: 1px;
  width: 28px; height: 26px; border: none; background: transparent;
  color: var(--text-muted); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  border-radius: 4px; transition: all 0.12s;
  z-index: 2;
}
.search-funnel-btn:hover { color: var(--text-primary); background: var(--bg-hover); }
.search-funnel-btn.active { color: #6b8cff; }

.funnel-menu {
  position: absolute; right: 0; top: 30px;
  z-index: 50;
  background: var(--bg-panel-solid); border: 1px solid var(--border-color);
  border-radius: 8px; min-width: 200px;
  box-shadow: 0 6px 18px rgba(0,0,0,0.25);
  overflow: hidden;
}
.funnel-item {
  padding: 8px 12px; cursor: pointer; display: flex; flex-direction: column;
  border-bottom: 1px solid var(--border-color);
  transition: background 0.12s;
}
.funnel-item:last-child { border-bottom: none; }
.funnel-item:hover { background: var(--bg-hover); }
.funnel-item.active { background: rgba(107,140,255,0.12); }
.funnel-item.disabled { opacity: 0.4; cursor: not-allowed; }
.fm-label { font-size: 13px; color: var(--text-primary); font-weight: 500; }
.fm-desc { font-size: 11px; color: var(--text-muted); margin-top: 1px; }

/* ─── 格式筛选 ─── */
.fmt-section { border-top: 1px solid var(--border-color); }
.fmt-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 12px 4px;
}
.fmt-title { font-size: 12px; color: var(--text-muted); font-weight: 600; }
.fmt-actions { display: flex; gap: 8px; }
.fmt-link { font-size: 11px; color: #6b8cff; cursor: pointer; }
.fmt-link:hover { text-decoration: underline; }
.fmt-group { font-size: 10px; color: var(--text-muted); padding: 5px 12px 2px; }
.fmt-grid {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 4px; padding: 2px 12px;
}
.fmt-btn {
  height: 28px; padding: 0 4px;
  border: 1px solid var(--border-color); border-radius: 4px;
  background: var(--bg-input); color: var(--text-muted);
  font-size: 11px; font-family: inherit; font-weight: 400; cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.fmt-btn:hover { border-color: rgba(142,180,255,0.4); color: var(--text-secondary); }
.fmt-btn.on {
  border-color: rgba(0,0,0,0.25); background: #fff;
  color: #1a1a2e;
}

/* ─── 筛选行（星级 & 比例共用） ─── */
.filter-row {
  display: flex; align-items: center; gap: 2px; height: 28px;
  margin-right: 30px;
}

.filter-spacer { flex: 1; min-width: 0; }

/* ─── 星级筛选 ─── */
.rating-stars-filter {
  display: flex; gap: 1px;
}
.rfs-btn {
  background: none; border: none; cursor: pointer; padding: 0;
  font-size: 20px; line-height: 1; transition: transform 0.1s;
}
.rfs-btn:hover { transform: scale(1.12); }
.rfs-star { color: var(--text-muted); }
.rfs-btn.active .rfs-star { color: #f5a623; }

/* ─── 比例筛选 ─── */
.ratio-colon { font-size: 13px; color: var(--text-muted); font-weight: 600; margin: 0 0; flex-shrink: 0; }
.ratio-input {
  width: 34px; height: 26px; padding: 0 1px; border: 1px solid var(--border-color);
  border-radius: 4px; background: var(--bg-input-solid); color: var(--text-primary);
  font-size: 12px; text-align: center; outline: none; flex-shrink: 0;
}
.ratio-input:focus { border-color: rgba(142,180,255,0.5); }
.ratio-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.ratio-tol-label {
  font-size: 10px; color: var(--text-muted); flex-shrink: 0;
  margin-left: 2px;
}
.ratio-tol-input {
  width: 26px; height: 24px; padding: 0 1px; border: 1px solid var(--border-color);
  border-radius: 4px; background: var(--bg-input-solid); color: var(--text-primary);
  font-size: 11px; text-align: center; outline: none; flex-shrink: 0;
}
.ratio-tol-input:focus { border-color: rgba(142,180,255,0.5); }
.ratio-tol-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.ratio-tol-unit { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }

/* ─── 搜索 & 取消按钮（星级和比例共用） ─── */
.filter-confirm-btn {
  height: 24px; padding: 0 10px; border: none; border-radius: 4px;
  background: var(--btn-primary-bg); color: #fff; font-size: 11px; cursor: pointer;
  transition: background 0.12s; flex-shrink: 0; margin-left: auto;
}
.filter-confirm-btn:hover { background: #5a7de0; }
.filter-cancel-btn {
  height: 24px; padding: 0 8px; border: 1px solid var(--border-color); border-radius: 4px;
  background: transparent; color: var(--text-muted); font-size: 11px; cursor: pointer;
  transition: all 0.12s; flex-shrink: 0;
}
.filter-cancel-btn:hover { color: var(--text-primary); border-color: var(--text-muted); }

/* 类似图片模式：两行布局避免按钮重叠（320px 侧栏放不下单行所有元素） */
.similar-wrap { display: flex; flex-direction: column; gap: 6px; margin-right: 30px; }
.similar-pick-row {
  display: flex; align-items: center; gap: 6px; min-height: 28px;
  padding: 0 2px;
}
.similar-pick-btn {
  height: 24px; padding: 0 10px; border: 1px solid var(--border-color); border-radius: 4px;
  background: var(--bg-hover); color: var(--text-secondary); font-size: 11px; cursor: pointer;
  flex-shrink: 0; transition: all 0.12s;
}
.similar-pick-btn:hover { color: var(--text-primary); border-color: var(--text-muted); }
.similar-thumb { width: 24px; height: 24px; object-fit: cover; border-radius: 3px; flex-shrink: 0; }
.similar-name {
  font-size: 11px; color: var(--text-muted);
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.similar-hint { font-size: 11px; color: var(--text-hint); flex: 1; min-width: 0; }
.similar-action-row { display: flex; align-items: center; gap: 6px; }
.similar-start-btn { margin-left: 0; }  /* 覆盖 .filter-confirm-btn 的 margin-left:auto */

/* ─── 印象色筛选 ─── */
.color-filter {
  display: flex; flex-direction: column; gap: 8px; margin-right: 30px;
}
.color-picker-row {
  display: flex; align-items: stretch; gap: 7px;
}
.hs-canvas {
  flex: 1; min-width: 0; height: 112px; border: 1px solid var(--border-color);
  border-radius: 0; cursor: crosshair; touch-action: none; background: #fff;
}
.v-canvas {
  width: 16px; height: 112px; border: 1px solid var(--border-color);
  border-radius: 0; cursor: ns-resize; touch-action: none; flex-shrink: 0;
}
.color-preview-col {
  width: 34px; display: flex; flex-direction: column; align-items: center; gap: 5px;
  justify-content: center; flex-shrink: 0;
}
.color-preview {
  width: 32px; height: 32px; border-radius: 0; border: 1px solid var(--border-color);
}
.color-preview-hex {
  font-size: 9px; color: var(--text-muted); font-variant-numeric: tabular-nums;
  letter-spacing: 0.2px; line-height: 1;
}
.color-readout {
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
  padding: 0 2px;
}
.color-readout-item {
  font-size: 10px; color: var(--text-muted); font-variant-numeric: tabular-nums;
}
.color-component-row {
  display: flex; align-items: center; gap: 8px; padding: 0 2px;
}
.color-component-title {
  font-size: 10px; color: var(--text-muted); flex-shrink: 0;
}
.color-component-toggle {
  display: inline-flex; align-items: center; gap: 4px; cursor: pointer;
  font-size: 11px; color: var(--text-secondary); user-select: none;
}
.color-component-toggle input {
  width: 13px; height: 13px; margin: 0; accent-color: #6b8cff; cursor: pointer;
}
.color-tol-row {
  display: flex; align-items: center; gap: 8px;
}
.color-tol-label {
  font-size: 10px; color: var(--text-muted); flex-shrink: 0;
}
.color-tol-range {
  flex: 1; min-width: 0; height: 4px; -webkit-appearance: none; appearance: none;
  border-radius: 999px; outline: none; cursor: pointer;
  background: linear-gradient(90deg, #94a0b4 0%, #aeb8c8 var(--tol-fill, 20%), var(--border-color) var(--tol-fill, 20%), var(--border-color) 100%);
}
.color-tol-range::-webkit-slider-runnable-track {
  height: 4px; border-radius: 999px; background: transparent;
}
.color-tol-range::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: 15px; height: 15px; margin-top: -5px;
  border-radius: 50%; background: #fff; border: 2px solid #94a0b4;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.28); cursor: grab; transition: transform 0.1s;
}
.color-tol-range:active::-webkit-slider-thumb {
  cursor: grabbing; transform: scale(1.12);
}
.color-tol-value {
  font-size: 10px; color: var(--text-secondary); font-variant-numeric: tabular-nums;
  min-width: 32px; text-align: right; flex-shrink: 0;
}
.color-actions {
  display: flex; align-items: center; justify-content: flex-end; gap: 6px;
}
.color-actions .filter-confirm-btn { margin-left: 0; }
.filter-confirm-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.filter-confirm-btn:disabled:hover { background: var(--btn-primary-bg); }

.history-btn {
  position: absolute; right: 50px; top: 4px;
  width: 24px; height: 24px; border: none; background: transparent;
  color: var(--text-muted); font-size: 11px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: color 0.12s;
}
.history-btn:hover { color: var(--text-primary); }
.history-btn.active { color: #6b8cff; }

.search-history {
  position: absolute; left: 0; right: 0; top: 30px;
  z-index: 50;
  background: var(--bg-panel-solid); border: 1px solid var(--border-color);
  border-radius: 6px; max-height: 240px; overflow-y: auto;
  box-shadow: 0 6px 18px rgba(0,0,0,0.25);
}
.history-item {
  padding: 6px 8px 6px 12px; font-size: 12px; color: var(--text-secondary);
  display: flex; align-items: center; gap: 4px;
}
.history-text {
  flex: 1; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.history-text:hover { color: var(--text-primary); }
.history-del {
  flex-shrink: 0; width: 16px; height: 16px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; color: var(--text-muted); border-radius: 3px;
}
.history-del:hover { color: var(--text-primary); background: var(--bg-hover); }
.history-item:hover { background: var(--bg-hover); }

.panel-footer {
  flex-shrink: 0; margin-top: auto; padding-top: 10px; border-top: 1px solid var(--border-color);
}
.scroll-progress-track { height: 4px; border-radius: 2px; background: var(--bg-hover); overflow: hidden; margin-bottom: 6px; }
.track-jumpable { cursor: pointer; }
.scroll-progress-bar { height: 100%; border-radius: 2px; background: var(--btn-primary-bg); transition: width 0.15s; }
.stats-text { font-size: 12px; color: var(--text-muted); text-align: center; display: flex; align-items: center; justify-content: center; gap: 4px; white-space: nowrap; overflow: hidden; }
.stats-input { width: 40px; padding: 0 2px; font-size: 11px; color: var(--text-muted); border: 1px solid var(--text-muted); border-radius: 4px; background: transparent; text-align: center; margin: 0 2px; flex: 0 0 auto; }
.stats-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.stats-sep { margin: 0 4px; color: var(--text-muted); flex: 0 0 auto; }

.metadata-list { display: flex; flex-direction: column; gap: 10px; }
.meta-item { display: flex; flex-direction: column; gap: 2px; }
.meta-label {
  font-size: 11px; text-transform: uppercase;
  color: var(--text-muted); letter-spacing: 0.5px;
}
.meta-value { font-size: 13px; color: var(--text-primary); user-select: text; }

.dims-row { display: flex; align-items: center; gap: 6px; }
.unit-toggle {
  display: inline-flex; align-items: center; justify-content: center;
  height: 20px; min-width: 28px; padding: 0 5px;
  border: 1px solid var(--border-color); border-radius: 10px;
  background: var(--bg-input); color: var(--text-muted);
  font-size: 10px; font-weight: 600; letter-spacing: 0.3px;
  cursor: pointer; user-select: none;
  transition: all 0.15s;
}
.unit-toggle:hover {
  background: var(--bg-hover); color: var(--text-primary);
  border-color: var(--text-muted);
}

.path-value {
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  cursor: pointer; padding: 4px 6px; border-radius: 4px;
  background: var(--bg-input); font-size: 12px; color: var(--text-muted);
}
.path-value:hover { background: var(--bg-hover); color: var(--text-primary); }

.rating-row {
  display: flex; flex-direction: column; gap: 4px;
}
.stars {
  display: flex; gap: 2px;
}
.star-btn {
  background: none; border: none; cursor: pointer; padding: 2px;
  color: #f5a623; transition: transform 0.1s;
}
.star-btn:hover { transform: scale(1.15); }
.star-btn.active { color: #f5a623; }
.star-btn:not(.active) { color: var(--text-muted); }

.desc-row {
  display: flex; flex-direction: column; gap: 4px;
}
.desc-input {
  width: 100%; padding: 6px 8px; border: 1px solid var(--border-color);
  border-radius: 6px; background: var(--bg-input-solid); color: var(--text-primary);
  font-size: 12px; font-family: inherit; resize: none; overflow: hidden; outline: none;
  line-height: 1.5; box-sizing: border-box;
  field-sizing: content;
}
.desc-input::placeholder { color: var(--text-muted); }
.desc-input:focus { border-color: rgba(142,180,255,0.5); }

.action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.act-btn {
  height: 38px; border: none; border-radius: 6px; font-size: 13px; cursor: pointer;
  background: var(--bg-input); color: var(--text-secondary);
}
.act-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.act-delete { background: rgba(232, 17, 35, 0.15); color: #e81123; }
.act-delete:hover { background: #e81123; color: var(--text-primary); }
.favd { background: rgba(255, 80, 100, 0.15); color: #ff5066; }

.toast-msg {
  position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
  background: var(--bg-hover); backdrop-filter: blur(10px);
  color: var(--text-primary); padding: 6px 16px; border-radius: 20px;
  font-size: 12px; z-index: 10; pointer-events: none;
}
.toast-fade-enter-active, .toast-fade-leave-active { transition: opacity 0.25s ease; }
.toast-fade-enter-from, .toast-fade-leave-to { opacity: 0; }

/* Delete Modal */
.modal-overlay {
  position: fixed; inset: 0; z-index: 10000;
  background: var(--overlay-bg);
  display: flex; align-items: center; justify-content: center;
}
.modal-box {
  background: var(--bg-panel-solid); border: 1px solid var(--border-color);
  border-radius: 12px; padding: 28px; width: 420px; max-width: 90vw;
  text-align: center;
}
.modal-icon { font-size: 48px; margin-bottom: 12px; }
.modal-title { font-size: 16px; font-weight: 600; color: #e81123; margin-bottom: 8px; }
.modal-desc { font-size: 13px; color: var(--text-muted); margin-bottom: 16px; line-height: 1.5; }
.modal-path {
  background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 6px; padding: 10px 14px; margin-bottom: 24px;
  text-align: left; overflow-x: auto;
}
.modal-path code {
  font-size: 12px; color: rgba(255,255,255,0.6);
  word-break: break-all; font-family: 'Consolas', monospace;
}
.modal-actions { display: flex; gap: 12px; justify-content: center; }
.modal-btn {
  height: 40px; padding: 0 28px; border: none; border-radius: 8px;
  font-size: 14px; cursor: pointer; transition: background 0.15s;
}
.modal-cancel { background: rgba(255,255,255,0.1); color: var(--text-secondary); }
.modal-cancel:hover { background: rgba(255,255,255,0.18); }
.modal-confirm { background: #e81123; color: var(--text-primary); }
.modal-confirm:hover { background: #d00312; }
</style>
