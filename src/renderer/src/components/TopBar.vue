<template>
  <header class="top-bar">
    <div class="top-left">
      <span class="app-name" @click="resetToHome" :title="'PicRand'">
        <svg class="app-logo" width="30.6" height="30.6" viewBox="0 0 1024 1024" aria-hidden="true">
          <path d="M460.8 307.2v153.6H307.2V307.2h153.6zm-153.6 384h153.6V537.6H307.2v153.6zm230.4-230.4h153.6V307.2H537.6v153.6zm153.6 76.8H537.6v153.6h153.6V537.6z" fill="currentColor" fill-rule="evenodd"/>
        </svg>
      </span>
      <div class="sort-controls">
        <div class="sort-dropdown" ref="sortDropdown">
          <div class="sort-pill" @click="toggleSortMenu">
            <span class="sort-label">{{ currentSortLabel }}</span>
            <span class="sort-arrow">▾</span>
          </div>
          <div v-if="showSortMenu" class="sort-menu">
            <div v-for="m in sortOptions" :key="m.value"
              :class="['sort-menu-item', m.value.startsWith('sat') ? 'color-item' : '']"
              @click="selectSortMode(m.value)"
            ><span>{{ m.label }}</span>
              <template v-if="m.value === 'random'"><input class="seed-input" :value="randomSeed" maxlength="8" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" pattern="[a-zA-Z0-9]*" @click.stop="onSeedClick($event)" @focus="$event.target.select()" @input="onSeedInput($event)" @keydown.enter="applySeed" /><button class="seed-copy-btn" @click.stop="copySeed" title="Copy"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></template>
              <template v-if="m.value.startsWith('sat')">
                <span class="color-mode-inline">
                  <button v-for="c in (['h','s','v'] as const)" :key="c"
                    class="cm-inline-btn" :class="{ active: colorMode === c }"
                    @click.stop="setColorMode(c)">{{ colorLabels[c] }}</button>
                </span>
                <div v-if="showHuePicker" class="hue-bar-wrap" @click.stop>
                  <input type="range" min="0" max="360" :value="hueOrigin" @input="hueOrigin = +($event.target as HTMLInputElement).value" class="hue-range" />
                  <span class="hue-val">{{ hueOrigin }}°</span>
                  <button class="hue-ok" @click.stop="applyHueOrigin">{{ t('common.confirm') }}</button>
                </div>
              </template>
            </div>
            <div class="sort-menu-sep"></div>
            <div class="sort-menu-item" @click="startDriftFlow">{{ t('sort.drift') }}</div>
          </div>
        </div>
        <button class="shuffle-btn" :class="{ active: gallery.sortMode === 'random' || gallery.viewMode === 'drift' }"
          :title="actionBtnLabel" @click="handleActionBtn">
          <span v-if="gallery.sortMode === 'random' || gallery.viewMode === 'drift'" class="shuffle-icon" :class="{ spinning: shuffleSpin }">⟳</span>
          <span v-else class="dir-label">{{ sortDir === 'asc' ? t('sort.forward') : t('sort.reverse') }}</span>
        </button>
      </div>
      <div class="folder-dropdown">
        <button class="tb-btn" @click="selectSingleFolder">{{ folderBtnLabel }}</button>
      </div>
      <button class="tb-btn" @click="showSettings">&#x2699; {{ t('settings.title') }}</button>
    </div>
    <div class="top-right">
      <button v-if="steamStatus && !steamStatus.genuine" class="steam-btn" :title="t('steam.buyOnSteam')" @click="openSteamStore">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M11.979 0C5.678 0 .511 4.86 .022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z"/>
        </svg>
      </button>
      <button class="win-btn pin-btn" :class="{ active: isPinned }" @click="togglePin" :title="isPinned ? t('window.alwaysOnTopOff') : t('window.alwaysOnTop')">
        <svg width="21" height="21" viewBox="0 0 1024 1024" aria-hidden="true">
          <path d="M665.5 256l-76.8 76.8v122.9a153.6 153.6 0 0 1 76.8 133h-128v153.6l-25.6 25.6-25.6-25.6V588.7h-128a153.47 153.47 0 0 1 76.8-133V332.8L358.3 256" fill="none" stroke="currentColor" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button class="win-btn" @click="wMin" :title="t('window.minimize')">
        <svg width="12" height="12" viewBox="0 0 12 12"><line x1="0" y1="6" x2="12" y2="6" stroke="currentColor" stroke-width="1"/></svg>
      </button>
      <button class="win-btn" @click="wMax" :title="t('window.maximize')">
        <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1"/></svg>
      </button>
      <button class="win-btn win-close" @click="wClose" :title="t('window.close')">
        <svg width="12" height="12" viewBox="0 0 12 12"><line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" stroke-width="1"/><line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" stroke-width="1"/></svg>
      </button>
    </div>

    <Teleport to="body">
      <transition name="toast-fade">
        <div v-if="toast" class="topbar-toast">{{ toast }}</div>
      </transition>
    </Teleport>
  </header>
</template>

<script setup lang="ts">
import { useGalleryStore } from '../stores/gallery'
import { useI18n } from '../i18n'
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'

const emit = defineEmits(['open-settings', 'open-folder-selector', 'open-seed-selector', 'shuffle'])
const gallery = useGalleryStore()
const { t } = useI18n()
const toast = ref('')
const shuffleSpin = ref(false)
const isPinned = ref(false)
const steamStatus = ref<SteamLicenseStatus | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null

const showSortMenu = ref(false)
const randomSeed = ref('')
const sortDropdown = ref<HTMLElement | null>(null)
const sortDir = ref<'asc' | 'desc'>('asc')

// 各排序模式"正序"对应的实际 suffix
const positiveSuffix: Record<string, string> = {
  name: 'asc',   // 名称：a→z 为正序
  time: 'desc',  // 日期：新在上为正序
  dim: 'desc',   // 尺寸：大在上为正序
  size: 'desc',  // 大小：大在上为正序
  hue: 'asc',    // 色相：0→360 为正序（红橙黄绿蓝紫）
  sat: 'desc',   // 饱和度：高→低为正序
  val: 'desc',   // 明度：亮→暗为正序
}

function getSortSuffix(base: string, dir: 'asc' | 'desc'): string {
  const pos = positiveSuffix[base] || 'asc'
  return dir === 'asc' ? pos : (pos === 'asc' ? 'desc' : 'asc')
}

const sortOptions = computed(() => [
  { label: t('sort.random'), value: 'random' as SortMode },
  { label: t('sort.time'), value: 'time-asc' as SortMode },
  { label: t('sort.name'), value: 'name-asc' as SortMode },
  { label: t('sort.dim'), value: 'dim-asc' as SortMode },
  { label: t('sort.size'), value: 'size-asc' as SortMode },
  ...(colorIndexedCount.value > 0 ? [{ label: t('sort.color'), value: 'sat-desc' as SortMode }] : []),
  ...(gallery.viewMode === 'favorites' ? [{ label: t('sort.collection'), value: 'collection-asc' as SortMode }] : []),
])

// 色彩排序子模式：h=色相 s=饱和度 v=明度
const colorMode = ref<'h' | 's' | 'v'>('s')
const colorLabels: Record<string, string> = { h: 'H', s: 'S', v: 'L' }
const isColorSort = computed(() => {
  const m = gallery.sortMode
  return m.startsWith('hue') || m.startsWith('sat') || m.startsWith('val')
})
// 外部变更 sortMode 时（如快照恢复）同步 colorMode
watch(() => gallery.sortMode, (m) => {
  if (m.startsWith('hue')) colorMode.value = 'h'
  else if (m.startsWith('sat')) colorMode.value = 's'
  else if (m.startsWith('val')) colorMode.value = 'v'
})
const hueOrigin = ref(0)
const showHuePicker = ref(false)
const colorIndexedCount = ref(0) // 当前文件夹已建色彩索引的图片数

// 分页/加载状态：必须在下方 watch(() => _folderId) 之前声明，避免 TDZ
let _folderId = 0, _folderIds: number[] = [], _total = 0, _loaded = 0, _loadingPage = false, _hasMore = true

async function refreshColorIndexedCount() {
  try {
    if (_folderIds.length > 1) {
      const s = await window.picrand.colorIndexStatusMulti?.(_folderIds) || { indexed: 0 }
      colorIndexedCount.value = s.indexed || 0
    } else if (_folderId) {
      const s = await window.picrand.colorIndexStatus?.(_folderId) || { indexed: 0 }
      colorIndexedCount.value = s.indexed || 0
    } else {
      colorIndexedCount.value = 0
    }
  } catch { colorIndexedCount.value = 0 }
}
watch(() => _folderId, () => { refreshColorIndexedCount() })

function setColorMode(mode: 'h' | 's' | 'v') {
  // H 已在激活状态：弹出色盘选择起点
  if (mode === 'h' && colorMode.value === 'h') {
    showHuePicker.value = !showHuePicker.value
    return
  }
  colorMode.value = mode
  const base = mode === 'h' ? 'hue' : mode === 's' ? 'sat' : 'val'
  const suffix = getSortSuffix(base, sortDir.value)
  gallery.sortMode = (base + '-' + suffix) as SortMode
  reorderAndReload(gallery.sortMode)
}

function applyHueOrigin() {
  showHuePicker.value = false
  showSortMenu.value = false
  colorMode.value = 'h'
  const suffix = getSortSuffix('hue', sortDir.value)
  gallery.sortMode = ('hue-' + suffix) as SortMode
  reorderAndReload(gallery.sortMode)
}

const currentSortLabel = computed(() => {
  if (gallery.viewMode === 'drift') return t('sort.drift')
  if (isColorSort.value) return t('sort.color')
  const f = sortOptions.value.find(o => {
    if (gallery.sortMode === 'random') return o.value === 'random'
    return o.value.replace('-asc', '').replace('-desc', '') === gallery.sortMode.replace('-asc', '').replace('-desc', '')
  })
  return f?.label || sortOptions.value[0].label
})

const actionBtnLabel = computed(() => {
  if (gallery.viewMode === 'drift') return t('sort.reseed')
  return gallery.sortMode === 'random' ? t('sort.shuffle') : (sortDir.value === 'asc' ? t('sort.asc') : t('sort.desc'))
})

function selectSortMode(mode: SortMode) {
  showSortMenu.value = false
  if (gallery.viewMode === 'drift') { exitDrift() }
  if (mode === 'random') {
    gallery.sortMode = 'random'
    reorderAndReload('random')
    setTimeout(loadRandomSeed, 350)
    return
  }
  // 色彩排序：按用户当前选中的 H/S/L 子模式进入
  if (mode.startsWith('sat') || mode.startsWith('hue') || mode.startsWith('val')) {
    const base = colorMode.value === 'h' ? 'hue' : colorMode.value === 's' ? 'sat' : 'val'
    sortDir.value = 'asc'
    gallery.sortMode = (base + '-' + getSortSuffix(base, 'asc')) as SortMode
    reorderAndReload(gallery.sortMode)
    return
  }
  // 普通排序模式
  const base = mode.replace('-asc', '').replace('-desc', '')
  sortDir.value = 'asc'
  gallery.sortMode = (base + '-' + getSortSuffix(base, 'asc')) as SortMode
  reorderAndReload(gallery.sortMode)
}

function toggleSortMenu() {
  showSortMenu.value = !showSortMenu.value
  if (showSortMenu.value) {
    loadRandomSeed()
    refreshColorIndexedCount()
  }
}

async function loadRandomSeed() {
  if (_folderId) {
    try { randomSeed.value = await (window.picrand as any).getRandomSeed?.(_folderId) || '' }
    catch { randomSeed.value = '' }
  } else { randomSeed.value = '' }
}

watch(() => gallery.sortMode, (mode) => {
  if (mode === 'random') setTimeout(loadRandomSeed, 400)
})

function onSeedInput(e: Event) {
  const val = (e.target as HTMLInputElement).value.toLowerCase().replace(/[^0-9a-z]/g, '')
  randomSeed.value = val
}

function onSeedClick(e: Event) {
  (e.target as HTMLInputElement).select()
}

async function applySeed() {
  const seed = randomSeed.value.trim()
  if (!seed || seed.length < 1 || !_folderId) return
  await (window.picrand as any).setRandomSeed?.(_folderId, seed)
  gallery.sortMode = 'random'
  reorderAndReload('random')
}

function copySeed() {
  const s = randomSeed.value || ''
  if (!s) return
  navigator.clipboard.writeText(s).catch(() => {})
  showToast(t('toast.seedCopied'))
}

async function handleActionBtn() {
  if (gallery.viewMode === 'drift') {
    shuffleSpin.value = false
    requestAnimationFrame(() => {
      shuffleSpin.value = true
      setTimeout(() => { shuffleSpin.value = false }, 320)
    })
    _driftUsed = new Set()
    _driftNextSeed = null; _driftNextFeat = null; _driftAllPool = null
    emit('open-seed-selector')
    return
  }
  if (gallery.sortMode === 'random') {
    shuffleSpin.value = false
    requestAnimationFrame(() => {
      shuffleSpin.value = true
      setTimeout(() => { shuffleSpin.value = false }, 320)
    })
    gallery.shuffle()
    emit('shuffle')
    if (_folderId) { await window.picrand.recomputeSortOrder?.(_folderId, 'random', true) }
    reorderAndReload('random')
    setTimeout(loadRandomSeed, 350)
  } else {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    const base = gallery.sortMode.replace('-asc', '').replace('-desc', '')
    gallery.sortMode = (base + '-' + getSortSuffix(base, sortDir.value)) as SortMode
    reorderAndReload(gallery.sortMode)
  }
}

let _reorderSeq = 0
let _reorderTimer: ReturnType<typeof setTimeout> | null = null

async function inMemSort(mode: SortMode) {
  let arr = [...gallery.images]
  if (mode === 'random') {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]] }
  } else {
    const [base, dir] = [mode.replace('-asc','').replace('-desc',''), mode.endsWith('-desc') ? -1 : 1]
    if (base === 'hue' || base === 'sat' || base === 'val') {
      const paths = arr.map(i => i.file_path)
      const rows = await window.picrand.getColorInfoByPaths?.(paths) || []
      const map = new Map<string, { h: number; s: number; v: number } | null>()
      for (const r of rows) {
        try {
          const o = JSON.parse(r.color_info)
          map.set(r.file_path, o && o.h != null && o.s != null && o.v != null ? { h: o.h, s: o.s, v: o.v } : null)
        } catch { map.set(r.file_path, null) }
      }
      arr.sort((a, b) => {
        const ca = map.get(a.file_path) ?? null
        const cb = map.get(b.file_path) ?? null
        if (!ca && !cb) return 0
        if (!ca) return 1
        if (!cb) return -1
        if (base === 'hue') {
          const da = ((ca.h - hueOrigin.value + 360) % 360 + 360) % 360
          const db = ((cb.h - hueOrigin.value + 360) % 360 + 360) % 360
          return (da - db) * dir
        }
        return (base === 'sat' ? ca.s - cb.s : ca.v - cb.v) * dir
      })
      gallery.replaceImages(arr)
      return
    }
    // dim 排序前从 DB 批量补齐缺失的尺寸
    if (base === 'dim') {
      const missing = arr.filter(i => !i.width && !i.height).map(i => i.file_path)
      if (missing.length) {
        const dims = await window.picrand.getDimensionsBatch(missing)
        for (const d of dims) {
          const idx = arr.findIndex(i => i.file_path === d.file_path)
          if (idx >= 0) arr[idx] = { ...arr[idx], width: d.width, height: d.height }
        }
      }
    }
    const cmp = base === 'name' ? (a:any,b:any) => a.file_name.localeCompare(b.file_name) * dir
      : base === 'time' ? (a:any,b:any) => (a.modify_time - b.modify_time) * dir
      : base === 'dim' ? (a:any,b:any) => (((a.width||0)*(a.height||0)) - ((b.width||0)*(b.height||0))) * dir
      : base === 'collection' ? (a:any,b:any) => ((b.favorited_at || 0) - (a.favorited_at || 0)) * dir
      : (a:any,b:any) => (a.file_size - b.file_size) * dir
    arr.sort(cmp)
  }
  gallery.replaceImages(arr)
}

async function reorderAndReload(mode: SortMode) {
  if (gallery.viewMode === 'favorites') {
    await inMemSort(mode)
    return
  }
  if (_searchQuery) { await inMemSort(mode); return }
  if (_folderIds.length > 1) {
    _loaded = 0; _hasMore = true
    _loadingPage = false
    document.querySelectorAll('.gallery-img').forEach((img: any) => { img.src = '' })
    gallery.replaceImages([])
    window.picrand.clearImageCache?.()
    await loadMoreImages()
    return
  }
  if (!_folderId) return
  // dim-asc/dim-desc 单文件夹：分页直接走 SQL ORDER BY width*height，不读 sort_order，
  // 故无需 recomputeSortOrder（其内部还会 await 后台 pendingDimReads 补读全部尺寸，
  // 大文件夹耗时数秒到十几秒，期间画面停在旧顺序）。直接清空重载，立即按 SQL 排好。
  if (mode === 'dim-asc' || mode === 'dim-desc') {
    _reorderSeq++
    const seq = _reorderSeq
    if (_reorderTimer) clearTimeout(_reorderTimer)
    _reorderTimer = setTimeout(async () => {
      if (seq !== _reorderSeq) return
      gallery.sortMode = mode
      _loaded = 0; _hasMore = true
      _loadingPage = false
      document.querySelectorAll('.gallery-img').forEach((img: any) => { img.src = '' })
      gallery.replaceImages([])
      window.picrand.clearImageCache?.()
      await loadMoreImages()
    }, 200)
    return
  }
  _reorderSeq++
  const seq = _reorderSeq
  if (_reorderTimer) clearTimeout(_reorderTimer)
  _reorderTimer = setTimeout(async () => {
    if (seq !== _reorderSeq) return
    gallery.sortMode = mode
    await window.picrand.recomputeSortOrder(_folderId, mode, undefined, hueOrigin.value)
    if (seq !== _reorderSeq) return
    _loaded = 0; _hasMore = true
    _loadingPage = false
    document.querySelectorAll('.gallery-img').forEach((img: any) => { img.src = '' })
    gallery.replaceImages([])
    window.picrand.clearImageCache?.()
    await loadMoreImages()
  }, 200)
}

// 点击外部关闭排序下拉
function closeSortMenu(e: MouseEvent) {
  if (sortDropdown.value && !sortDropdown.value.contains(e.target as Node)) {
    showSortMenu.value = false
  }
}

function showToast(msg: string, duration = 3000) {
  toast.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, duration)
}
const _folderDisplayName = ref('')
const folderBtnLabel = computed(() => {
  if (gallery.viewMode === 'favorites') return '❤️ ' + t('folder.favoritesShort')
  if (gallery.folderPath) {
    const name = _folderDisplayName.value || gallery.folderPath.split('\\').pop() || ''
    return '📁 ' + name
  }
  return '📁 ' + t('folder.select')
})

onMounted(async () => {
  document.addEventListener('click', closeSortMenu)
  isPinned.value = await window.picrand.windowIsAlwaysOnTop?.() || false
  try { steamStatus.value = await window.picrand.getSteamStatus?.() || null } catch { steamStatus.value = null }
})
onUnmounted(() => {
  document.removeEventListener('click', closeSortMenu)
})

// 打开文件夹选择器（替代系统文件对话框）
function selectSingleFolder() {
  // 漫游中打开选择器不提前退出漫游：用户取消或选回同一文件夹时漫游继续；
  // 仅当实际切换到其他文件夹时，loadFolderByPath→releaseAllResources 会调用 exitDrift()
  emit('open-folder-selector')
}

async function loadMultipleFolders(paths: string[]) {
  _switchingFolder = true
  try {
  releaseAllResources()
  gallery.isScanning = true
  gallery.viewMode = 'single'
  gallery.searchQuery = ''
  _searchQuery = ''
  if (gallery.sortMode.startsWith('collection')) gallery.sortMode = gallery.defaultSortMode
  const seq = _loadSeq
  _folderIds = []; _multiPaths = [...paths]; let totalCount = 0

  for (const p of paths) {
    try {
      const raw: any = await window.picrand.scanFolder(p, gallery.sortMode)
      if (seq !== _loadSeq) { gallery.isScanning = false; return }
      if (!raw?.error && raw?.folderId) {
        _folderIds.push(raw.folderId)
        totalCount += raw.total || 0
      }
    } catch {}
  }

  if (!_folderIds.length) { showToast(t('toast.scanFailed'), 3000); gallery.isScanning = false; return }
  gallery.totalImages = totalCount
  _folderDisplayName.value = ''
  gallery.folderPath = paths.join('; ')

  // 多文件夹分页：sortMode 传给 getImagesPageMulti 决定 SQL ORDER BY
  const firstPage = await window.picrand.getImagesPageMulti?.(_folderIds, 0, 100, gallery.sortMode) || []
  if (!firstPage.length) { showToast(t('toast.noSupportedFormat'), 3000); gallery.isScanning = false; return }

  gallery.replaceImages(firstPage.map((r: any) => ({
    file_path: r.file_path, file_name: r.file_name,
    file_size: r.file_size || 0, modify_time: r.modify_time || 0,
    thumbnail_path: r.thumbnail_path || '', width: r.width || 0, height: r.height || 0, is_favorite: r.is_favorite || 0,
        rating: r.rating || 0,
        description: r.description || '',
  })))
  _loaded = firstPage.length; _hasMore = _loaded < totalCount
  // 多文件夹已由 getImagesPageMulti 全局洗牌，无需前端再排
  if (_folderIds.length <= 1) await inMemSort(gallery.sortMode)
  gallery.isScanning = false

  // 后台生成缩略图
  const fps = firstPage.map((r: any) => r.file_path)
  for (let i = 0; i < fps.length; i += 20) {
    if (seq !== _loadSeq) break  // 已切换文件夹，中止旧循环
    try {
      const batch = fps.slice(i, i + 20)
      const batchResult = await window.picrand.generateThumbnailsBatch(batch)
      if (seq !== _loadSeq) break
      const brs: any[] = (batchResult as any)?.results || batchResult || []
      const updates: Array<{ filePath: string; thumbnailPath: string }> = []
      for (const br of brs) {
        if (br?.thumbnail_path) updates.push({ filePath: br.file_path, thumbnailPath: br.thumbnail_path })
      }
      if (updates.length) gallery.updateThumbnailsBatch(updates)
    } catch {}
    if (seq !== _loadSeq) break
    gallery.setThumbProgress(((i + 20) / fps.length) * 100)
  }
  } finally { _switchingFolder = false }
}

// 切换文件夹时释放上一文件夹所有资源
// 切换文件夹时释放上一文件夹所有资源
function releaseAllResources() {
  _loadSeq++
  // 漫游离开：在清空 drift 状态前，先把当前漫游文件夹标记为"切回时按默认排序重扫"
  if (_driftActiveFolder) {
    _driftExitedFolders.add(_driftActiveFolder)
    if (gallery.folderMemoryEnabled) gallery.removeSnapshot?.(_driftActiveFolder)
  }
  document.querySelectorAll('.gallery-img').forEach((img: any) => { img.src = '' })
  if (gallery.viewMode === 'drift') exitDrift()
  gallery.replaceImages([])
  gallery.scrollProgress = 0
  _driftBuffer = []
  _loaded = 0; _hasMore = true; _loadingPage = false
  _searchQuery = ''
  // 切换节点：回收主进程 GPU 位图缓存/PSD worker/sharp 缓存（图片再加载走协议层秒回填）
  window.picrand.clearImageCache?.()
  // 立即停止旧文件夹 watcher（不再等新 watcher 启动才杀旧的，消除窗口期）
  window.picrand.stopWatcher?.()
}

async function persistLastOpenedFolder(folderPath: string) {
  const cfg = await window.picrand.readConfig?.()
  const prev: string[] = cfg?.recentFolderPaths || []
  const next = [folderPath, ...prev.filter((p: string) => p !== folderPath)].slice(0, 3)
  await window.picrand.saveConfig?.({ ...cfg, lastOpenedFolder: folderPath, lastOpenedFolderTime: new Date().toISOString(), recentFolderPaths: next })
}

function resetToHome() {
  if (!gallery.folderPath && gallery.viewMode === 'single') return
  // 回到首页前保存当前文件夹快照（漫游离开标记由 releaseAllResources 处理）
  if (gallery.folderMemoryEnabled && gallery.folderPath && gallery.images.length > 0 && gallery.viewMode !== 'drift') {
    gallery.saveSnapshot(gallery.folderPath, {
      images: [...gallery.images],
      scrollRatio: gallery._scrollRatio,
      loaded: _loaded,
      hasMore: _hasMore,
      folderId: _folderId,
      totalImages: gallery.totalImages,
      sortMode: gallery.sortMode,
      searchQuery: gallery.searchQuery || undefined,
      searchMode: gallery.searchMode,
      searchRating: _searchRating || undefined,
      searchRatio: _searchRatio || undefined,
      searchColor: _searchColor ? { h: _searchColor.target.h, s: _searchColor.target.s, v: _searchColor.target.v, tol: _searchColor.tol, useHue: _searchColor.useHue, useSat: _searchColor.useSat, useValue: _searchColor.useValue } : undefined,
      searchFilterMode: gallery.searchFilterMode,
    })
  }
  releaseAllResources()
  gallery.viewMode = 'single'
  gallery.folderPath = ''
  gallery.totalImages = 0
  gallery.isScanning = false
  _folderId = 0
  _folderIds = []
  _multiPaths = []
  window.picrand.stopWatcher?.()
  emit('shuffle')
}

// 由外部调用（FolderSelector 确认选择后）
// 文件夹切换防抖：快速连续点击多个文件夹时只执行最后一次
let _folderSwitchTimer: ReturnType<typeof setTimeout> | null = null
let _pendingFolderSwitch: (() => void) | null = null

async function loadFolderByPath(folderPath: string) {
  // 同一文件夹已打开则不重复扫描
  if (gallery.folderPath === folderPath && gallery.images.length > 0) return

  // 防抖：200ms 内多次调用只执行最后一次
  if (_folderSwitchTimer) {
    clearTimeout(_folderSwitchTimer)
    _pendingFolderSwitch = () => loadFolderByPathImmediate(folderPath)
    _folderSwitchTimer = setTimeout(() => {
      _folderSwitchTimer = null
      _pendingFolderSwitch?.()
      _pendingFolderSwitch = null
    }, 200)
    return
  }
  // 设置一个空的防抖窗口，拦截后续 200ms 内的调用
  _folderSwitchTimer = setTimeout(() => { _folderSwitchTimer = null }, 200)

  return loadFolderByPathImmediate(folderPath)
}

async function loadFolderByPathImmediate(folderPath: string) {
  // 保存当前文件夹的全状态快照（切回时瞬间还原）
  // 风格漫游模式不保存——状态复杂且不可复现（漫游离开标记由 releaseAllResources 处理）
  if (gallery.folderMemoryEnabled && gallery.folderPath && gallery.images.length > 0 && gallery.viewMode !== 'drift') {
    gallery.saveSnapshot(gallery.folderPath, {
      images: [...gallery.images],
      scrollRatio: gallery._scrollRatio,
      loaded: _loaded,
      hasMore: _hasMore,
      folderId: _folderId,
      totalImages: gallery.totalImages,
      sortMode: gallery.sortMode,
      searchQuery: gallery.searchQuery || undefined,
      searchMode: gallery.searchMode,
      searchRating: _searchRating || undefined,
      searchRatio: _searchRatio || undefined,
      searchColor: _searchColor ? { h: _searchColor.target.h, s: _searchColor.target.s, v: _searchColor.target.v, tol: _searchColor.tol, useHue: _searchColor.useHue, useSat: _searchColor.useSat, useValue: _searchColor.useValue } : undefined,
      searchFilterMode: gallery.searchFilterMode,
    })
  }

  // ===== 快照命中：瞬间还原，跳过磁盘扫描 =====
  // 漫游离开过的文件夹：跳过快照，走重扫并按默认排序装填
  const skipByDriftExit = _driftExitedFolders.has(folderPath)
  const snap = (gallery.folderMemoryEnabled && !skipByDriftExit) ? gallery.getSnapshot(folderPath) : undefined
  if (snap) {
    _switchingFolder = true
    try {
      releaseAllResources()
      // 抑制 scrollToTop watcher
      if (snap.scrollRatio > 0) gallery._pendingScrollProgress = 0

      // 恢复内部状态
      _folderId = snap.folderId; _folderIds = []
      _loaded = snap.loaded; _hasMore = snap.hasMore; _total = snap.totalImages
      gallery.totalImages = snap.totalImages
      gallery.viewMode = 'single'
      // 搜索状态：有则恢复，无则清空
      if (snap.searchQuery) {
        gallery.searchQuery = snap.searchQuery; _searchQuery = snap.searchQuery
      } else {
        gallery.searchQuery = ''; _searchQuery = ''
      }
      _searchRating = snap.searchRating || null
      _searchRatio = snap.searchRatio || null
      _searchColor = snap.searchColor ? { target: { h: snap.searchColor.h, s: snap.searchColor.s, v: snap.searchColor.v }, tol: snap.searchColor.tol, useHue: snap.searchColor.useHue, useSat: snap.searchColor.useSat, useValue: snap.searchColor.useValue } : null
      if (snap.searchFilterMode) gallery.searchFilterMode = snap.searchFilterMode
      if (snap.searchMode) gallery.searchMode = snap.searchMode
      if (gallery.sortMode.startsWith('collection')) gallery.sortMode = gallery.defaultSortMode
      if (snap.sortMode && !snap.sortMode.startsWith('collection')) {
        gallery.sortMode = snap.sortMode as SortMode
      }

      gallery.folderPath = folderPath
      persistLastOpenedFolder(folderPath)
      _folderDisplayName.value = ''
      try { const _dn = await window.picrand.getFolderNameByPath?.(folderPath); _folderDisplayName.value = _dn || '' } catch {}

      // 直接注入全部已加载图片 → Vue rebuildLayout 重建布局
      gallery.replaceImages(snap.images)
      gallery.isScanning = false

      // 触发滚动恢复（post-flush watcher 在布局就绪后执行）
      if (snap.scrollRatio > 0) {
        gallery._pendingScrollProgress = snap.scrollRatio
      }

      // 立即启动文件监控
      window.picrand.startWatcher?.(folderPath)

      // 轻量增量同步：仅 walk+diff+增量写入，跳过 _bgRestore/recomputeSortOrder/dim read/
      // 视频海报等重型链路。chokidar 处理后续增量变化。
      window.picrand.syncFolderSnapshot?.(folderPath)

      // 异步查询色彩索引状态（不等待结果，让下次打开排序菜单时立即可用）
      refreshColorIndexedCount()
    } catch (err: any) {
      showToast(t('toast.restoreFailed', { msg: (err.message || err) }), 3000)
      gallery.isScanning = false
    } finally { _switchingFolder = false }
    return
  }

  // ===== 未命中快照：正常磁盘扫描流程 =====
  _switchingFolder = true
  if (skipByDriftExit) { _driftExitedFolders.delete(folderPath); gallery.sortMode = gallery.defaultSortMode }
  try {
  releaseAllResources()
  gallery.isScanning = true
  gallery.viewMode = 'single'
  gallery.searchQuery = ''
  _searchQuery = ''
  // 搜索模式复位到默认
  gallery.searchFilterMode = 'normal'
  gallery.searchMode = 'filename'
  // 从收藏夹切出时复位（collection-asc 对常规文件夹无意义）
  if (gallery.sortMode.startsWith('collection')) gallery.sortMode = gallery.defaultSortMode
  // 色彩排序对无色彩索引的文件夹无意义，回退默认排序
  if (gallery.sortMode.startsWith('hue') || gallery.sortMode.startsWith('sat') || gallery.sortMode.startsWith('val')) {
    gallery.sortMode = gallery.defaultSortMode
  }
  const seq = _loadSeq
  try {
    const raw: any = await window.picrand.scanFolder(folderPath, gallery.sortMode, true)
    if (seq !== _loadSeq) { gallery.isScanning = false; return } // 已切换到其他文件夹
    if (raw?.error) { showToast(t('toast.scanFailed', { msg: raw.message }), 3000); gallery.isScanning = false; return }
    // 新格式：{ images: firstPage[], total: number, folderId: number }
    const { images: firstPage, total, folderId } = raw
    _folderId = folderId; _folderIds = []; _total = total; _loaded = firstPage.length; _hasMore = true
    gallery.totalImages = total

    gallery.folderPath = folderPath
    persistLastOpenedFolder(folderPath)
    _folderDisplayName.value = ''
    try { const _dn = await window.picrand.getFolderNameByPath?.(folderPath); _folderDisplayName.value = _dn || '' } catch {}
    if (!firstPage?.length) {
      showToast(t('toast.noSupportedFormat'), 3000)
      gallery.isScanning = false
      gallery.replaceImages([])
      await window.picrand.startWatcher?.(folderPath)
      return
    }

    gallery.replaceImages(firstPage.map((r: any) => ({
      file_path: r.file_path, file_name: r.file_name,
      file_size: r.file_size || 0, modify_time: r.modify_time || 0,
      thumbnail_path: r.thumbnail_path || '', width: r.width || 0, height: r.height || 0, is_favorite: r.is_favorite || 0,
        rating: r.rating || 0,
        description: r.description || '',
    })))
    gallery.isScanning = false

    // 后台批量生成缩略图（首批100张，含 PSD 时减批以更快刷新 UI）
    const fps = firstPage.map((r: any) => r.file_path)
    const hasPsd = fps.some(f => f.toLowerCase().endsWith('.psd'))
    const batchSize = hasPsd ? 5 : 20
    for (let i = 0; i < fps.length; i += batchSize) {
      if (seq !== _loadSeq) break  // 已切换文件夹，中止旧循环：避免主进程空转 sharp/PSD 解码堆积 native 内存
      const batch = fps.slice(i, i + batchSize)
      try {
        const batchResult = await window.picrand.generateThumbnailsBatch(batch)
        if (seq !== _loadSeq) break  // await 期间可能已切换
        const brs: any[] = (batchResult as any)?.results || batchResult || []
        const updates: Array<{ filePath: string; thumbnailPath: string }> = []
        for (const br of brs) {
          if (br?.thumbnail_path) updates.push({ filePath: br.file_path, thumbnailPath: br.thumbnail_path })
        }
        if (updates.length) gallery.updateThumbnailsBatch(updates)  // frozen 安全的批量替换
      } catch { /* skip */ }
      if (seq !== _loadSeq) break
      gallery.setThumbProgress(((i + batch.length) / fps.length) * 100)
    }
    if (seq !== _loadSeq) return  // 中途中止：不启动旧文件夹 watcher，避免覆盖新文件夹
    await window.picrand.startWatcher?.(folderPath)
    // 异步查询色彩索引状态
    refreshColorIndexedCount()
  } catch (err: any) {
    showToast(t('toast.scanFailed', { msg: (err.message || err) }), 3000)
    gallery.isScanning = false
  }
  } finally { _switchingFolder = false }
}

// Fix 1: GalleryCanvas 滚动到底时主动调用
let _loadSeq = 0 // 加载世代计数器，每次切换文件夹/排序时递增，异步流程中比对防竞态
let _searchQuery = ''
// 多文件夹模式的路径缓存（格式筛选变更后按原路径重载用）
let _multiPaths: string[] = []
// 切换文件夹守卫：文件夹切换流程主动清空 searchQuery 时，拦截 searchQuery watcher 触发的 clearSearch→reloadCurrentFolder，
// 否则 reloadCurrentFolder 会 ++_loadSeq 抢占切换流程的 await scanFolder，导致切换被取消、仅退出搜索
let _switchingFolder = false
// 漫游离开标记：从 drift 切走文件夹时置位，切回该文件夹时强制按默认排序重新扫描而非快照还原
let _driftExitedFolders = new Set<string>()
// 当前漫游激活的文件夹（drift 启动时记，跨文件夹切换时用于识别"从漫游切走"）
let _driftActiveFolder: string | null = null
// ====== 分页跳转：先串行加载前方未加载页+目标页，再滚到目标位置 ======
const PAGE_SIZE = 100
const _jumping = ref(false)

function totalPages(): number { const t = _total || gallery.totalImages || 0; return Math.max(1, Math.ceil(t / PAGE_SIZE)) }
function canPaging(): boolean { return gallery.viewMode !== 'drift' && gallery.viewMode !== 'favorites' && !_searchQuery && (_folderId || _folderIds.length > 1) }

async function jumpToPage(pageNum: number) {
  if (!canPaging() || _jumping.value) return
  const tp = totalPages(); if (tp <= 1) return
  const target = Math.max(1, Math.min(pageNum, tp))
  const targetStart = (target - 1) * PAGE_SIZE
  if (targetStart < gallery.images.length) {
    document.dispatchEvent(new CustomEvent('picrand-scroll-to', { detail: { path: gallery.images[targetStart]?.file_path } }))
    document.dispatchEvent(new CustomEvent('picrand-jump-done'))
    return
  }
  _jumping.value = true
  const seq = _loadSeq
  try {
    while (gallery.images.length < targetStart + PAGE_SIZE && gallery.images.length < (_total || gallery.totalImages) && _loadSeq === seq) {
      const offset = gallery.images.length
      const fids = [..._folderIds]
      const page: any[] = fids.length > 1
        ? await window.picrand.getImagesPageMulti?.(fids, offset, PAGE_SIZE, gallery.sortMode) || []
        : await window.picrand.getImagesPage?.(_folderId, offset, PAGE_SIZE, gallery.sortMode) || []
      if (_loadSeq !== seq) return
      if (!page.length) break
      const items = page.map((r: any) => ({
        file_path: r.file_path, file_name: r.file_name,
        file_size: r.file_size || 0, modify_time: r.modify_time || 0,
        thumbnail_path: r.thumbnail_path || '', width: r.width || 0, height: r.height || 0,
        is_favorite: r.is_favorite || 0,
        rating: r.rating || 0,
        description: r.description || '',
      }) as unknown as ImageItem)
      gallery.appendImages(items)
      _loaded = gallery.images.length
      genThumbnailsBg(items.filter(i => !i.thumbnail_path).map(i => i.file_path))
      await nextTick()
    }
    if (_loadSeq !== seq) return
    document.dispatchEvent(new CustomEvent('picrand-scroll-to', { detail: { path: gallery.images[targetStart]?.file_path } }))
  } catch (e) { console.error('[jumpToPage]', e) }
  finally { _jumping.value = false; document.dispatchEvent(new CustomEvent('picrand-jump-done')) }
}

async function loadMoreImages() {
  // 漂移模式：多轮 loadDriftBatch 攒够 100 张，走 addToLayout
  if (gallery.viewMode === 'drift') {
    if (_loadingPage || !_hasMore) return
    _loadingPage = true
    const seq = _loadSeq
    try {
      while (_driftBuffer.length < 100 && _driftNextSeed && _driftAllPool && gallery.viewMode === 'drift' && _loadSeq === seq) {
        const batch = await loadDriftBatch()
        if (!batch.length) break
        _driftBuffer.push(...batch)
      }
      if (gallery.viewMode !== 'drift' || _loadSeq !== seq) { _loadingPage = false; return }
      if (!_driftBuffer.length) { showToast(t('toast.driftEnd')); _hasMore = false; _loadingPage = false; return }
      const page = _driftBuffer.splice(0, 100)
      _loadingPage = false // 先释放锁，再触发 DOM 更新
      const items = page.map(r => Object.freeze({...r}))
      gallery.appendImages(items)
      gallery.driftBatchIdx++
      gallery.driftTotalBatches = Math.ceil(((_driftAllPool?.length || 0) - _driftUsed.size) / 100 + gallery.driftBatchIdx)
      genThumbnailsBg(items.filter(i => !i.thumbnail_path).map(i => i.file_path))
      _hasMore = _driftBuffer.length > 0 || !!(_driftAllPool?.some(i => !_driftUsed.has(i.file_path)))
      if (_hasMore) {
        nextTick(() => {
          const container = document.querySelector('.gallery-canvas')
          const sentinel = container?.querySelector('.column-sentinel')
          if (container && sentinel) {
            const cr = container.getBoundingClientRect()
            const sr = sentinel.getBoundingClientRect()
            if (sr.top < cr.bottom + 5000) loadMoreImages()
          }
        })
      }
    } catch (e) { console.error('[drift loadMore]', e); _loadingPage = false }
    return
  }
  if (_searchQuery) {
    if (_loadingPage || !_hasMore) return
    _loadingPage = true
    const q = _searchQuery; const seq = _loadSeq
    try {
      // 根据搜索类型选择不同的 IPC
      let page: any[] = []
      let colorTotal = 0
      const multiSearch = _folderIds.length > 1
      if (_searchColor) {
        const scopeIds = _folderIds.length > 1 ? _folderIds : (_folderId > 0 ? [_folderId] : [])
        const res = await window.picrand.searchByColor?.(scopeIds, _searchColor.target, _searchColor.tol, _loaded, 100, gallery.sortMode, _searchColor.useHue, _searchColor.useSat, _searchColor.useValue)
        page = res?.rows || []
        colorTotal = res?.total ?? 0
      } else if (_searchRating) {
        page = multiSearch
          ? await window.picrand.searchByRatingMulti?.(_folderIds, _searchRating, _loaded, 100, gallery.sortMode) || []
          : await window.picrand.searchByRating?.(_folderId, _searchRating, _loaded, 100) || []
      } else if (_searchRatio) {
        page = multiSearch
          ? await window.picrand.searchByAspectRatioMulti?.(_folderIds, _searchRatio.w, _searchRatio.h, _searchRatio.tol, _loaded, 100, gallery.sortMode) || []
          : await window.picrand.searchByAspectRatio?.(_folderId, _searchRatio.w, _searchRatio.h, _searchRatio.tol, _loaded, 100) || []
      } else if (gallery.searchMode === 'description') {
        page = multiSearch
          ? await window.picrand.searchByDescriptionMulti?.(_folderIds, q, _loaded, 100, gallery.sortMode) || []
          : await window.picrand.searchByDescription?.(_folderId, q, _loaded, 100) || []
      } else {
        page = multiSearch
          ? await window.picrand.searchImagesMulti?.(_folderIds, q, _loaded, 100, gallery.sortMode) || []
          : await window.picrand.searchImages?.(_folderId, q, _loaded, 100) || []
      }
      if (_loadSeq !== seq || _searchQuery !== q) { _loadingPage = false; return }
      if (!page?.length) { _hasMore = false; _loadingPage = false; return }
      if (_searchColor) _hasMore = _loaded + page.length < colorTotal
      else if (page.length < 100) _hasMore = false
      _loaded += page.length
      _loadingPage = false
      if (_searchColor) gallery.totalImages = colorTotal
      else gallery.totalImages = Math.max(gallery.totalImages, _loaded) // keep accurate as we load more
      const items = page.map((r: any) => ({
        file_path: r.file_path, file_name: r.file_name,
        file_size: r.file_size || 0, modify_time: r.modify_time || 0,
        thumbnail_path: r.thumbnail_path || '', width: r.width || 0, height: r.height || 0,
        is_favorite: r.is_favorite || 0,
        rating: r.rating || 0,
        description: r.description || '',
      }) as unknown as ImageItem)
      gallery.appendImages(items)
      genThumbnailsBg(items.filter(i => !i.thumbnail_path).map(i => i.file_path))
      if (_hasMore) {
        nextTick(() => {
          const container = document.querySelector('.gallery-canvas')
          const sentinel = container?.querySelector('.column-sentinel')
          if (container && sentinel) {
            const cr = container.getBoundingClientRect()
            const sr = sentinel.getBoundingClientRect()
            if (sr.top < cr.bottom + 5000) loadMoreImages()
          }
        })
      }
    } catch (e) { console.error('[search loadMore]', e); _loadingPage = false }
    return
  }
  if (_loadingPage || !_hasMore || (!_folderId && !_folderIds.length)) return
  _loadingPage = true
  const fid = _folderId; const fids = [..._folderIds]; const seq = _loadSeq
  try {
    const _ipcT0 = (typeof performance !== 'undefined') ? performance.now() : Date.now()
    const page: any[] = fids.length > 1
      ? await window.picrand.getImagesPageMulti?.(fids, _loaded, 100, gallery.sortMode)
      : await window.picrand.getImagesPage(fid, _loaded, 100, gallery.sortMode)
    try { window.picrand.perfProbe?.({ k: 'ipc', name: 'getImagesPage', ms: (((typeof performance !== 'undefined' ? performance.now() : Date.now()) - _ipcT0) | 0), offset: _loaded, ret: page.length }) } catch {}
    if (_loadSeq !== seq || (fids.length > 1 ? _folderIds.length <= 1 : _folderId !== fid)) { _loadingPage = false; return }
    if (!page?.length) { _hasMore = false; _loadingPage = false; return }
    if (page.length < 100) _hasMore = false

    _loaded += page.length
    _loadingPage = false // 先释放锁，再触发 DOM 更新，确保哨兵 Observer 能正常触发下一批
    const items = page.map((r: any) => ({
      file_path: r.file_path, file_name: r.file_name,
      file_size: r.file_size || 0, modify_time: r.modify_time || 0,
      thumbnail_path: r.thumbnail_path || '', width: r.width || 0, height: r.height || 0,
      is_favorite: r.is_favorite || 0,
        rating: r.rating || 0,
        description: r.description || '',
    }) as unknown as ImageItem)
    gallery.appendImages(items)
    // 多文件夹模式需前端重排；单文件夹 DB 分页已有序，直接追加即可
    if (fids.length > 1 && gallery.sortMode !== 'random') await inMemSort(gallery.sortMode)
    genThumbnailsBg(items.filter(i => !i.thumbnail_path).map(i => i.file_path))
    if (_hasMore) {
      nextTick(() => {
        const container = document.querySelector('.gallery-canvas')
        const sentinel = container?.querySelector('.column-sentinel')
        if (container && sentinel) {
          const cr = container.getBoundingClientRect()
          const sr = sentinel.getBoundingClientRect()
          if (sr.top < cr.bottom + 5000) loadMoreImages()
        }
      })
    }
  } catch (e) { console.error('[loadMore] error:', e); _loadingPage = false }
}

let _genBusy = false
async function genThumbnailsBg(paths: string[]) {
  if (_genBusy || paths.length === 0) return
  _genBusy = true
  const hasPsd = paths.some(p => p.toLowerCase().endsWith('.psd'))
  const batchSize = hasPsd ? 5 : 20
  const allUpdates: Array<{ filePath: string; thumbnailPath: string }> = []
  for (let i = 0; i < paths.length; i += batchSize) {
    try {
      const batch = paths.slice(i, i + batchSize)
      const batchResult = await window.picrand.generateThumbnailsBatch(batch)
      const brs: any[] = (batchResult as any)?.results || batchResult || []
      for (const br of brs) {
        if (br.thumbnail_path) allUpdates.push({ filePath: br.file_path, thumbnailPath: br.thumbnail_path })
      }
    } catch {}
  }
  if (allUpdates.length) {
    gallery.updateThumbnailsBatch(allUpdates)
    gallery.flushThumbnails()
  }
  _genBusy = false
}

// ── 搜索 ──
async function startSearch(query: string) {
  if (!query.trim()) return
  if (!_folderId && !_folderIds.length) return // 单/多文件夹都有 ID 才能搜
  const q = query.trim()
  _loadSeq++
  _searchQuery = q
  _loaded = 0
  _hasMore = true
  _loadingPage = false
  // 搜索结果将替换图片集，旧位图无用，提前回收主进程缓存
  document.dispatchEvent(new CustomEvent('picrand-release-preloads'))
  window.picrand.clearImageCache?.()
  const seq = _loadSeq
  const isAi = gallery.searchMode === 'ai' && gallery.aiSearchEnabled
  const isDesc = gallery.searchMode === 'description'
  if (isAi) showToast(t('toast.aiSearching'), 12000) // 首次触发模型加载 ~2-5s（多语言文本塔 + 视觉塔）
  try {
    if (isAi) {
      await startAiSearch(q, seq)
    } else if (isDesc) {
      await startDescriptionSearch(q, seq)
    } else {
      await startFilenameSearch(q, seq)
    }
  } catch (e) { console.error('[startSearch]', e) }
  finally {
    // 仅在仍是"搜索中"提示时清掉；若 startAiSearch 已替换成更具体的 toast（如"未建立索引"），保留它
    if (isAi && toast.value === t('toast.aiSearching')) { if (toastTimer) clearTimeout(toastTimer); toast.value = '' }
  }
}

async function startFilenameSearch(q: string, seq: number) {
  const multi = _folderIds.length > 1
  const page: any[] = multi
    ? await window.picrand.searchImagesMulti?.(_folderIds, q, 0, 100, gallery.sortMode) || []
    : await window.picrand.searchImages?.(_folderId, q, 0, 100) || []
  if (_loadSeq !== seq || _searchQuery !== q) return
  const items = page.map((r: any) => ({
    file_path: r.file_path, file_name: r.file_name,
    file_size: r.file_size || 0, modify_time: r.modify_time || 0,
    thumbnail_path: r.thumbnail_path || '', width: r.width || 0, height: r.height || 0,
    is_favorite: r.is_favorite || 0,
    rating: r.rating || 0,
    description: r.description || '',
  }) as unknown as ImageItem)
  gallery.replaceImages(items)
  _loaded = items.length
  if (items.length < 100) _hasMore = false
  const cnt = multi
    ? await window.picrand.searchImagesCountMulti?.(_folderIds, q) || items.length
    : await window.picrand.searchImagesCount?.(_folderId, q) || items.length
  gallery.totalImages = cnt
  genThumbnailsBg(items.filter(i => !i.thumbnail_path).map(i => i.file_path))
  if (_hasMore) { nextTick(() => loadMoreImages()) }
}

async function startDescriptionSearch(q: string, seq: number) {
  const multi = _folderIds.length > 1
  const page: any[] = multi
    ? await window.picrand.searchByDescriptionMulti?.(_folderIds, q, 0, 100, gallery.sortMode) || []
    : await window.picrand.searchByDescription?.(_folderId, q, 0, 100) || []
  if (_loadSeq !== seq || _searchQuery !== q) return
  const items = page.map((r: any) => ({
    file_path: r.file_path, file_name: r.file_name,
    file_size: r.file_size || 0, modify_time: r.modify_time || 0,
    thumbnail_path: r.thumbnail_path || '', width: r.width || 0, height: r.height || 0,
    is_favorite: r.is_favorite || 0,
    rating: r.rating || 0,
    description: r.description || '',
  }) as unknown as ImageItem)
  gallery.replaceImages(items)
  _loaded = items.length
  if (items.length < 100) _hasMore = false
  const cnt = multi
    ? await window.picrand.searchByDescriptionCountMulti?.(_folderIds, q) || items.length
    : await window.picrand.searchByDescriptionCount?.(_folderId, q) || items.length
  gallery.totalImages = cnt
  genThumbnailsBg(items.filter(i => !i.thumbnail_path).map(i => i.file_path))
  if (_hasMore) { nextTick(() => loadMoreImages()) }
}

async function startAiSearch(q: string, seq: number) {
  // AI 语义搜索：取范围内全量 image 元数据建 path→item 映射，
  // 再 searchByText 返回 Top-N 排序 paths，按 score 排序后映射回 ImageItem。
  // 单文件夹走 _folderId，多文件夹遍历 _folderIds 聚合 + 按 folderIds 范围搜索
  const scopeIds = _folderIds.length > 1 ? _folderIds : (_folderId > 0 ? [_folderId] : [])
  // 范围内未建立索引时直接提示，避免出现"搜什么都没结果"的困惑
  if (scopeIds.length) {
    try {
      const st = scopeIds.length > 1
        ? await window.picrand.clipIndexStatusMulti?.(scopeIds)
        : await window.picrand.clipIndexStatus?.(scopeIds[0])
      if (st && st.total > 0 && st.indexed === 0) {
        showToast(t('toast.aiNotIndexed'), 4000)
        gallery.replaceImages([])
        _loaded = 0; _hasMore = false; gallery.totalImages = 0
        return
      }
    } catch {}
  }
  const byPath = new Map<string, ImageItem>()
  if (scopeIds.length) {
    for (const fid of scopeIds) {
      const rows: any[] = await window.picrand.dbGetImagesByFolder?.(fid) || []
      if (_loadSeq !== seq || _searchQuery !== q) return
      for (const r of rows) {
        byPath.set(r.file_path, {
          file_path: r.file_path, file_name: r.file_name,
          file_size: r.file_size || 0, modify_time: r.modify_time || 0,
          thumbnail_path: r.thumbnail_path || '', width: r.width || 0, height: r.height || 0,
          is_favorite: r.is_favorite || 0, rating: r.rating || 0, description: r.description || '',
        } as unknown as ImageItem)
      }
    }
  }
  const topN = (gallery.aiSearchTopN && gallery.aiSearchTopN >= 2000) ? Number.MAX_SAFE_INTEGER : (gallery.aiSearchTopN || 500)
  const scope = scopeIds.length > 1 ? { folderIds: scopeIds } : (scopeIds.length === 1 ? { folderId: scopeIds[0] } : {})
  const scoredRaw: any = await window.picrand.searchByText?.(q, scope, topN)
  if (_loadSeq !== seq || _searchQuery !== q) return
  // IPC 异常时返回 { error } 而非空数组，避免"无匹配"与"模型加载失败"难以区分
  if (scoredRaw && typeof scoredRaw === 'object' && !Array.isArray(scoredRaw) && scoredRaw.error) {
    showToast(t('toast.aiError', { msg: scoredRaw.error }), 6000)
    gallery.replaceImages([])
    _loaded = 0; _hasMore = false; gallery.totalImages = 0
    return
  }
  const scored: Array<{ file_path: string; score: number }> = Array.isArray(scoredRaw) ? scoredRaw : []
  const items: ImageItem[] = []
  for (const s of scored) {
    const it = byPath.get(s.file_path)
    if (it) items.push(it)
  }
  // 一次性补齐 AI 搜索结果中缺尺寸的路径，避免瀑布流用 0.75 兜底比例显示 4:3
  const missingDims = items.filter(i => !i.width || !i.height)
  if (missingDims.length > 0) {
    try {
      const dims = await window.picrand.fillImageDims?.(missingDims.map(i => i.file_path))
      if (dims) {
        for (const it of items) {
          const d = dims[it.file_path]
          if (d && (!it.width || !it.height)) { it.width = d.width; it.height = d.height }
        }
      }
    } catch {}
  }
  gallery.replaceImages(items)
  _loaded = items.length
  _hasMore = false // AI 模式一次性返回 Top-N，不再分页续载
  gallery.totalImages = items.length
  genThumbnailsBg(items.filter(i => !i.thumbnail_path).map(i => i.file_path))
}

function clearSearch() {
  _searchQuery = ''
  _searchRating = null
  _searchRatio = null
  _searchColor = null
  gallery.searchQuery = ''
  if (_folderIds.length > 1) {
    releaseAllResources()
    reloadMultipleFolders()
  } else if (_folderId && gallery.folderPath) {
    releaseAllResources()
    reloadCurrentFolder()
  }
}

// ── 评分搜索 ──
let _searchRating: number[] | null = null
let _searchRatio: { w: number; h: number; tol: number } | null = null
let _searchColor: { target: { h: number; s: number; v: number }; tol: number; useHue: boolean; useSat: boolean; useValue: boolean } | null = null

async function startRatingSearch(ratings: number[]) {
  if (!_folderId && _folderIds.length < 2) return
  const multi = _folderIds.length > 1
  _loadSeq++
  _searchQuery = `rating:${ratings.join(',')}`
  _searchRating = ratings
  _searchRatio = null
  gallery.searchQuery = _searchQuery
  _loaded = 0
  _hasMore = true
  _loadingPage = false
  document.dispatchEvent(new CustomEvent('picrand-release-preloads'))
  window.picrand.clearImageCache?.()
  const seq = _loadSeq
  try {
    const page: any[] = multi
      ? await window.picrand.searchByRatingMulti?.(_folderIds, ratings, 0, 100, gallery.sortMode) || []
      : await window.picrand.searchByRating?.(_folderId, ratings, 0, 100) || []
    if (_loadSeq !== seq) return
    const items = page.map((r: any) => ({
      file_path: r.file_path, file_name: r.file_name,
      file_size: r.file_size || 0, modify_time: r.modify_time || 0,
      thumbnail_path: r.thumbnail_path || '', width: r.width || 0, height: r.height || 0,
      is_favorite: r.is_favorite || 0,
      rating: r.rating || 0,
      description: r.description || '',
    }) as unknown as ImageItem)
    gallery.replaceImages(items)
    _loaded = items.length
    if (items.length < 100) _hasMore = false
    const cnt = multi
      ? await window.picrand.searchByRatingCountMulti?.(_folderIds, ratings) || items.length
      : await window.picrand.searchByRatingCount?.(_folderId, ratings) || items.length
    gallery.totalImages = cnt
    genThumbnailsBg(items.filter(i => !i.thumbnail_path).map(i => i.file_path))
    if (_hasMore) { nextTick(() => loadMoreImages()) }
  } catch (e) { console.error('[startRatingSearch]', e) }
}

async function startRatioSearch(ratioW: number, ratioH: number, tolerance: number) {
  if (!_folderId && _folderIds.length < 2) return
  const multi = _folderIds.length > 1
  _loadSeq++
  _searchQuery = `ratio:${ratioW}:${ratioH}`
  _searchRatio = { w: ratioW, h: ratioH, tol: tolerance }
  _searchRating = null
  gallery.searchQuery = _searchQuery
  _loaded = 0
  _hasMore = true
  _loadingPage = false
  document.dispatchEvent(new CustomEvent('picrand-release-preloads'))
  window.picrand.clearImageCache?.()
  const seq = _loadSeq
  try {
    const page: any[] = multi
      ? await window.picrand.searchByAspectRatioMulti?.(_folderIds, ratioW, ratioH, tolerance, 0, 100, gallery.sortMode) || []
      : await window.picrand.searchByAspectRatio?.(_folderId, ratioW, ratioH, tolerance, 0, 100) || []
    if (_loadSeq !== seq) return
    const items = page.map((r: any) => ({
      file_path: r.file_path, file_name: r.file_name,
      file_size: r.file_size || 0, modify_time: r.modify_time || 0,
      thumbnail_path: r.thumbnail_path || '', width: r.width || 0, height: r.height || 0,
      is_favorite: r.is_favorite || 0,
      rating: r.rating || 0,
      description: r.description || '',
    }) as unknown as ImageItem)
    gallery.replaceImages(items)
    _loaded = items.length
    if (items.length < 100) _hasMore = false
    const cnt = multi
      ? await window.picrand.searchByAspectRatioCountMulti?.(_folderIds, ratioW, ratioH, tolerance) || items.length
      : await window.picrand.searchByAspectRatioCount?.(_folderId, ratioW, ratioH, tolerance) || items.length
    gallery.totalImages = cnt
    genThumbnailsBg(items.filter(i => !i.thumbnail_path).map(i => i.file_path))
    if (_hasMore) { nextTick(() => loadMoreImages()) }
  } catch (e) { console.error('[startRatioSearch]', e) }
}

async function startColorSearch(target: { h: number; s: number; v: number }, tolerance: number, useHue: boolean, useSat: boolean, useValue: boolean) {
  const scopeIds = _folderIds.length > 1 ? _folderIds : (_folderId > 0 ? [_folderId] : [])
  if (!scopeIds.length) return
  _loadSeq++
  _searchQuery = `color:${Math.round(target.h)}:${Math.round(target.s * 100)}:${Math.round(target.v * 100)}:${Math.round(tolerance * 100)}`
  _searchColor = { target, tol: tolerance, useHue, useSat, useValue }
  _searchRating = null
  _searchRatio = null
  gallery.searchQuery = _searchQuery
  _loaded = 0
  _hasMore = true
  _loadingPage = false
  document.dispatchEvent(new CustomEvent('picrand-release-preloads'))
  window.picrand.clearImageCache?.()
  const seq = _loadSeq
  try {
    const res = await window.picrand.searchByColor?.(scopeIds, target, tolerance, 0, 100, gallery.sortMode, useHue, useSat, useValue)
    if (_loadSeq !== seq) return
    const rows = res?.rows || []
    const total = res?.total ?? rows.length
    const items = rows.map((r: any) => ({
      file_path: r.file_path, file_name: r.file_name,
      file_size: r.file_size || 0, modify_time: r.modify_time || 0,
      thumbnail_path: r.thumbnail_path || '', width: r.width || 0, height: r.height || 0,
      is_favorite: r.is_favorite || 0,
      rating: r.rating || 0,
      description: r.description || '',
    }) as unknown as ImageItem)
    gallery.replaceImages(items)
    _loaded = items.length
    _hasMore = _loaded < total
    gallery.totalImages = total
    genThumbnailsBg(items.filter(i => !i.thumbnail_path).map(i => i.file_path))
    if (_hasMore) { nextTick(() => loadMoreImages()) }
  } catch (e) { console.error('[startColorSearch]', e) }
}

async function reloadCurrentFolder() {
  if (!_folderId) return
  gallery.isScanning = true
  gallery.viewMode = 'single'
  const seq = ++_loadSeq
  try {
    const firstPage: any[] = await window.picrand.getImagesPage?.(_folderId, 0, 100, gallery.sortMode) || []
    if (seq !== _loadSeq) { gallery.isScanning = false; return }
    _loaded = firstPage.length; _hasMore = firstPage.length >= 100
    gallery.totalImages = await window.picrand.getImagesCount?.(_folderId) || 0
    gallery.replaceImages(firstPage.map((r: any) => ({
      file_path: r.file_path, file_name: r.file_name,
      file_size: r.file_size || 0, modify_time: r.modify_time || 0,
      thumbnail_path: r.thumbnail_path || '', width: r.width || 0, height: r.height || 0,
      is_favorite: r.is_favorite || 0,
        rating: r.rating || 0,
        description: r.description || '',
    })))
    gallery.isScanning = false
    genThumbnailsBg(firstPage.filter((i: any) => !i.thumbnail_path).map((i: any) => i.file_path || ''))
  } catch (e) { gallery.isScanning = false }
}

// 多文件夹模式格式筛选重载：仅重新分页查询，不整库重扫（scanFolder 开销大且不必要）
async function reloadMultipleFolders() {
  if (_folderIds.length < 2) return
  gallery.isScanning = true
  gallery.viewMode = 'single'
  const seq = ++_loadSeq
  try {
    const totalCount = await window.picrand.getImagesCountMulti?.(_folderIds) || 0
    const firstPage: any[] = await window.picrand.getImagesPageMulti?.(_folderIds, 0, 100, gallery.sortMode) || []
    if (seq !== _loadSeq) { gallery.isScanning = false; return }
    _total = totalCount
    gallery.totalImages = totalCount
    gallery.replaceImages(firstPage.map((r: any) => ({
      file_path: r.file_path, file_name: r.file_name,
      file_size: r.file_size || 0, modify_time: r.modify_time || 0,
      thumbnail_path: r.thumbnail_path || '', width: r.width || 0, height: r.height || 0,
      is_favorite: r.is_favorite || 0,
      rating: r.rating || 0,
      description: r.description || '',
    })))
    _loaded = firstPage.length; _hasMore = _loaded < totalCount
    gallery.isScanning = false
    genThumbnailsBg(firstPage.filter((i: any) => !i.thumbnail_path).map((i: any) => i.file_path || ''))
  } catch (e) { gallery.isScanning = false }
}

// searchQuery 变化时仅处理 clear；触发搜索由 ContextPanel emit 'do-search' → App.vue → topBarRef.startSearch 直接调用，
// 避免 watch 同值不触发导致的"首次搜索无效果"问题
// 评分/比例搜索时 searchQuery 为合成值，clearSearch 会正确清理
watch(() => gallery.searchQuery, (q) => {
  if (_switchingFolder) return
  if (!q) clearSearch()
})


// ====== 格式筛选：勾选状态变更后重载当前视图 ======
async function applyFormatFilter() {
  gallery.clearSnapshots?.()  // 快照内含已禁用格式图片，统一作废
  if (gallery.viewMode === 'drift') return  // 当前批次保留，下一批取样自动应用筛选
  // 原地重载前先释放旧原图预加载（GalleryCanvas 监听），消除新旧两组原图共存的内存峰值
  document.dispatchEvent(new CustomEvent('picrand-release-preloads'))
  // 格式筛选变更：旧位图全废，回收主进程 GPU/PSD/sharp 缓存
  window.picrand.clearImageCache?.()
  if (gallery.viewMode === 'favorites') { viewFavorites(); return }
  // 有激活的搜索/筛选则按原参数重跑
  if (_searchColor) { startColorSearch(_searchColor.target, _searchColor.tol, _searchColor.useHue, _searchColor.useSat, _searchColor.useValue); return }
  if (_searchRating) { startRatingSearch(_searchRating); return }
  if (_searchRatio) { startRatioSearch(_searchRatio.w, _searchRatio.h, _searchRatio.tol); return }
  if (_searchQuery) { startSearch(_searchQuery); return }
  if (_folderIds.length > 1) { reloadMultipleFolders(); return }
  await reloadCurrentFolder()
}

defineExpose({ loadFolderByPath, loadMultipleFolders, loadMoreImages, jumpToPage, totalPages, canPaging, startDrift, refreshSeedCandidates, startSearch, startRatingSearch, startRatioSearch, startColorSearch, clearSearch, viewFavorites, applyFormatFilter, _jumping })

async function refreshSeedCandidates() {
  const sampleArg = _folderIds.length > 1 ? _folderIds : _folderId
  if (sampleArg) {
    const dbSample: any[] = await window.picrand.getRandomSample?.(sampleArg, '', 25) || []
    if (dbSample.length) {
      gallery.driftCandidates = dbSample.map((r: any) => ({
        file_path: r.file_path, file_name: r.file_name,
        file_size: r.file_size || 0, modify_time: r.modify_time || 0,
        thumbnail_path: r.thumbnail_path || '', width: r.width || 0, height: r.height || 0,
        is_favorite: r.is_favorite || 0,
        rating: r.rating || 0,
        description: r.description || '',
      }))
    }
  } else {
    const pool = gallery.images
    const n = Math.min(25, pool.length)
    const set = new Set<number>()
    while (set.size < n) set.add(Math.floor(Math.random() * pool.length))
    gallery.driftCandidates = Array.from(set, i => pool[i])
  }
}

function exitDrift() {
  gallery.viewMode = 'single'
  _driftNextSeed = null
  _driftNextFeat = null
  _driftAllPool = null
  _driftUsed = new Set()
  _poolPathSet = null
  _driftBuffer = []
  _loadingPage = false
}

async function startDriftFlow() {
  showSortMenu.value = false
  if (!gallery.images.length) { showToast(t('toast.noImagesYet'), 2000); return }

  // 从 DB 全量随机抽样 25 张作为种子候选
  const sampleArg = _folderIds.length > 1 ? _folderIds : _folderId
  if (sampleArg) {
    const dbSample: any[] = await window.picrand.getRandomSample?.(sampleArg, '', 25) || []
    if (dbSample.length) {
      gallery.driftCandidates = dbSample.map((r: any) => ({
        file_path: r.file_path, file_name: r.file_name,
        file_size: r.file_size || 0, modify_time: r.modify_time || 0,
        thumbnail_path: r.thumbnail_path || '', width: r.width || 0, height: r.height || 0,
        is_favorite: r.is_favorite || 0,
        rating: r.rating || 0,
        description: r.description || '',
      }))
    } else {
      gallery.driftCandidates = []
    }
  } else {
    // 收藏夹模式：从已加载的全量池中随机抽 25 张
    const pool = gallery.images
    const n = Math.min(25, pool.length)
    const set = new Set<number>()
    while (set.size < n) set.add(Math.floor(Math.random() * pool.length))
    gallery.driftCandidates = Array.from(set, i => pool[i])
  }

  emit('open-seed-selector')
}

// 风格漫游核心
async function startDrift(seedPath: string) {
  // 1. 找种子图片（优先从 DB 候选列表，因为可能不在已加载的 gallery 中）
  // 外部选择的自定义种子可能不在图库中，构造占位 ImageItem
  let seedImg = gallery.driftCandidates.find(i => i.file_path === seedPath)
    || gallery.images.find(i => i.file_path === seedPath)
  const isExternal = !seedImg
  if (isExternal) {
    const base = seedPath.split(/[\\/]/).pop() || seedPath
    seedImg = { file_path: seedPath, file_name: base, file_size: 0, modify_time: 0 } as ImageItem
  }

  // 刷新当前文件夹的候选池，确保后续换一批/重选种子使用正确的文件夹
  await refreshSeedCandidates()

  // 2. 计算种子特征（多模态模式走 CLIP 512 维，缺索引则中止）
  showToast(t('toast.driftAnalyzing'))
  let seedFeat: number[] | null = null
  if (gallery.driftWeightMode === 'multimodal') {
    const seedRows = await window.picrand.getClipFeaturesByPaths?.([seedPath]) || []
    seedFeat = seedRows[0]?.features || null
    // 外部种子不在 DB：现场算一张 CLIP 特征
    if (!seedFeat) {
      seedFeat = await window.picrand.computeClipFeature?.(seedPath) || null
    }
    if (!seedFeat) { showToast(t('toast.driftMultimodalNoIndex'), 3000); return }
  } else {
    seedFeat = await window.picrand.computeFeature?.(seedPath) || null
  }
  if (!seedFeat) { showToast(t('toast.driftFailAnalyze'), 2000); return }

  // 3. 从 DB 随机抽样 → 不依赖全池加载，秒出
  const batchSize = (gallery.driftBatchSize && gallery.driftBatchSize >= 1000) ? Number.MAX_SAFE_INTEGER : (gallery.driftBatchSize || 1000)
  const topN = gallery.driftTopN || 15
  showToast(t('toast.driftSampling'))
  const sampleArg = _folderIds.length > 1 ? _folderIds : _folderId
  const dbSample: any[] = sampleArg
    ? (await window.picrand.getRandomSample?.(sampleArg, seedPath, batchSize)) || []
    : []

  // 兼容：如果 DB 抽样不可用（多文件夹/收藏夹模式），回退到现有池
  let sampleItems: ImageItem[]
  if (dbSample.length) {
    sampleItems = dbSample.map((r: any) => ({
      file_path: r.file_path, file_name: r.file_name,
      file_size: r.file_size || 0, modify_time: r.modify_time || 0,
      thumbnail_path: r.thumbnail_path || '', width: r.width || 0, height: r.height || 0,
      is_favorite: r.is_favorite || 0,
        rating: r.rating || 0,
        description: r.description || '',
    }))
  } else {
    // 回退：从已加载的池中抽
    showToast(t('toast.driftLoadingPool'))
    const pool = [...gallery.images].filter(i => i.file_path !== seedPath)
    const shuffled = [...pool]
    for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]] }
    sampleItems = shuffled.slice(0, Math.min(batchSize, shuffled.length))
  }

  if (!sampleItems.length) { showToast(t('toast.driftNoOtherImages'), 2000); return }

  // 4. 批量计算特征 + 余弦排序（多模态走 CLIP，缺失图跳过不参与排序）
  showToast(t('toast.driftAnalyzingBatch', { cur: 0, total: sampleItems.length }))
  const featMap = new Map<string, number[]>()
  const featFn = gallery.driftWeightMode === 'multimodal'
    ? (paths: string[]) => window.picrand.getClipFeaturesByPaths?.(paths) || []
    : (paths: string[]) => window.picrand.computeFeaturesBatch?.(paths) || []
  for (let i = 0; i < sampleItems.length; i += 100) {
    const batch = sampleItems.slice(i, i + 100).map(s => s.file_path)
    const results = await featFn(batch)
    for (const r of results) { if (r.features) featMap.set(r.file_path, r.features) }
    showToast(t('toast.driftAnalyzingBatch', { cur: Math.min(i + 100, sampleItems.length), total: sampleItems.length }))
  }

  // 多模态模式下，缺特征的图直接排除出候选池（不参与排序、不展示）
  const candidates = gallery.driftWeightMode === 'multimodal'
    ? sampleItems.filter(img => featMap.has(img.file_path))
    : sampleItems

  const scored = candidates.map(img => ({
    img,
    sim: featMap.has(img.file_path) ? cosine(seedFeat, featMap.get(img.file_path)!) : -1
  }))
  scored.sort((a, b) => b.sim - a.sim)

  // 5. 将样本加入 gallery（扩充池），再从中初始化漂移全池
  gallery.appendImages(sampleItems)

  // DB 随机抽样已覆盖全量图片，同步分页偏移避免后续池扩展重复拉取


  // 展示第一批（数量为 topN 的两倍，默认 30 张，让首屏更充实；后续批次仍每代 topN 张）
  const firstCount = topN * 2
  const display = [seedImg, ...scored.slice(0, firstCount - 1).map(s => s.img)]

  gallery.viewMode = 'drift'
  gallery.driftSeedPath = seedPath
  _driftActiveFolder = gallery.folderPath
  gallery.driftBatchIdx = 1
  _driftUsed = new Set(display.map(i => i.file_path))

  // 初始全池 = 当前 gallery 中全部图片，后续 loadDriftBatch 按需懒加载
  _driftAllPool = [...gallery.images]
  _poolPathSet = new Set(_driftAllPool.map(i => i.file_path))


  // 下一批种子
  if (!gallery.driftEnabled) {
    _driftNextSeed = seedImg
    _driftNextFeat = [...seedFeat]
  } else {
    pickNextSeed(display, seedPath, seedFeat, featMap)
  }

  gallery.replaceImages(display)
  gallery.driftTotalBatches = Math.ceil((gallery.totalImages - 1) / 100)
  _hasMore = true
  emit('shuffle')
  _driftBuffer = []
  await loadMoreImages()
}

// 加权余弦相似度：按漫游偏好模式取权重
// color = 颜色70/纹理15/边缘15；texture = 颜色15/纹理60/边缘25
// multimodal = 纯 512 维 CLIP 余弦（无权重）
function cosine(a: number[], b: number[]): number {
  const mode = gallery.driftWeightMode
  let wColor = 70, wText = 15, wEdge = 15
  if (mode === 'texture') { wColor = 15; wText = 60; wEdge = 25 }
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    const w = mode === 'multimodal' ? 1 : (i < 64 ? wColor : i < 128 ? wText : wEdge)
    dot += a[i] * b[i] * w; na += a[i] * a[i] * w; nb += b[i] * b[i] * w
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

// 从 display 列表中找下一批种子，损坏图片特征为空时沿排名两侧回退
function pickNextSeed(display: ImageItem[], seedPath: string, seedFeat: number[], featMap: Map<string, number[]>) {
  const rank = Math.min(gallery.driftSeedRank || 12, display.length) - 1
  for (let d = 0; d < display.length; d++) {
    const idx = d === 0 ? rank : (d % 2 === 1 ? rank + Math.ceil(d / 2) : rank - d / 2)
    if (idx < 0 || idx >= display.length) continue
    const cand = display[idx]
    const feat = cand.file_path === seedPath ? seedFeat : featMap.get(cand.file_path)
    if (feat) {
      _driftNextSeed = cand
      _driftNextFeat = [...feat]
      return
    }
  }
}

// 漂移批次间池去重用，池不足时 loadDriftBatch 自动从 DB 分页扩展
let _poolPathSet: Set<string> | null = null

async function loadDriftBatch(): Promise<ImageItem[]> {
  if (!_driftNextSeed || !_driftNextFeat || !_driftAllPool) return []
  const seq = _loadSeq
  try {
    const topN = gallery.driftTopN || 15
    const batchSize = (gallery.driftBatchSize && gallery.driftBatchSize >= 1000) ? Number.MAX_SAFE_INTEGER : (gallery.driftBatchSize || 1000)
    const allPool = _driftAllPool
    const seedFeat = _driftNextFeat
    const seedPath = _driftNextSeed.file_path
    const used = _driftUsed
    let remaining = allPool.filter(i => !used.has(i.file_path))

    // 持续从 DB 扩展池，直到池≥候选池大小 或 DB 已全部加载
    while (remaining.length < batchSize && (_folderId || _folderIds.length) && gallery.viewMode === 'drift' && _loadSeq === seq) {
      try {
        const page = _folderIds.length > 1
          ? await window.picrand.getImagesPageMulti?.(_folderIds, _loaded, 200)
          : await window.picrand.getImagesPage(_folderId, _loaded, 200, gallery.sortMode)
        if (!page?.length) break  // DB 无更多图片
        _loaded += page.length
        const items = page.map((r: any) => ({
          file_path: r.file_path, file_name: r.file_name,
          file_size: r.file_size || 0, modify_time: r.modify_time || 0,
          thumbnail_path: r.thumbnail_path || '', width: r.width || 0, height: r.height || 0,
          is_favorite: r.is_favorite || 0,
        rating: r.rating || 0,
        description: r.description || '',
        }) as unknown as ImageItem)
        let added = 0
        for (const img of items) {
          if (_poolPathSet && !_poolPathSet.has(img.file_path)) {
            _poolPathSet.add(img.file_path)
            allPool.push(img)
            added++
          }
        }
        if (added === 0) { if (_loaded >= _total) break; continue }  // ????????????
        remaining = allPool.filter(i => !used.has(i.file_path))
      } catch { break }
    }

    if (!remaining.length) return []

    const shuffled = [...remaining]
    for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]] }
    const sample = shuffled.slice(0, Math.min(batchSize, remaining.length))

    const featMap = new Map<string, number[]>()
    const featFn = gallery.driftWeightMode === 'multimodal'
      ? (paths: string[]) => window.picrand.getClipFeaturesByPaths?.(paths) || []
      : (paths: string[]) => window.picrand.computeFeaturesBatch?.(paths) || []
    for (let i = 0; i < sample.length; i += 100) {
      const batch = sample.slice(i, i + 100).map(s => s.file_path)
      const results = await featFn(batch)
      for (const r of results) if (r.features) featMap.set(r.file_path, r.features)
    }

    // 多模态模式：缺特征的图排除出候选
    const candidates = gallery.driftWeightMode === 'multimodal'
      ? sample.filter(img => featMap.has(img.file_path))
      : sample

    const scored = candidates.map(img => ({
      img,
      sim: featMap.has(img.file_path) ? cosine(seedFeat, featMap.get(img.file_path)!) : -1
    }))
    scored.sort((a, b) => b.sim - a.sim)

    const display = scored.slice(0, topN).map(s => s.img)
    for (const img of display) used.add(img.file_path)

    if (gallery.driftEnabled) {
      pickNextSeed(display, seedPath, seedFeat, featMap)
    }

    return display
  } catch { return [] }
}

let _driftNextSeed: ImageItem | null = null
let _driftNextFeat: number[] | null = null
let _driftAllPool: ImageItem[] | null = null
let _driftUsed: Set<string> = new Set()
let _driftBuffer: ImageItem[] = []

async function viewFavorites() {
  releaseAllResources()
  gallery.isScanning = true
  gallery.viewMode = 'favorites'
  gallery.sortMode = 'collection-asc'
  const seq = _loadSeq
  // 重置分页状态，防止旧文件夹的 loadMoreImages 混入
  _folderId = 0; _folderIds = []; _loaded = 0; _total = 0; _hasMore = false; _loadingPage = false
  try {
    const favImages = await window.picrand.loadFavorites?.()
    if (seq !== _loadSeq) return // 已被其他操作打断
    gallery.totalImages = favImages?.length || 0
    gallery.replaceImages(favImages || [])
    await inMemSort('collection-asc')
    gallery.folderPath = ''
  } catch (err) {
    console.error('加载收藏失败:', err)
    if (seq !== _loadSeq) return
    gallery.replaceImages([])
  } finally {
    if (seq === _loadSeq) gallery.isScanning = false
  }
}

async function openSteamStore() {
  try { await window.picrand.openSteamStore?.() } catch {}
}

function wMin()  { window.picrand.windowMinimize() }
function wMax()  { window.picrand.windowMaximize() }
function wClose(){ window.picrand.windowClose() }
async function togglePin() {
  window.picrand.windowToggleAlwaysOnTop?.()
  isPinned.value = !isPinned.value
}

function showSettings() {
  emit('open-settings')
}
</script>

<style scoped>
.top-bar {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 48px;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: var(--topbar-bg);
  -webkit-app-region: drag;
  border-bottom: 1px solid var(--border-color);
}

.top-left, .top-right {
  display: flex;
  align-items: center;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.app-name {
  font-weight: 700; font-size: 14px; color: var(--text-primary);
  height: 30px; line-height: 30px; cursor: pointer;
  display: flex; align-items: center;
}
.app-name:hover { opacity: 0.7; }
.app-logo { display: block; }

.steam-btn {
  width: 30px; height: 30px;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  background: var(--bg-input);
  color: var(--text-secondary);
  cursor: pointer; padding: 0;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.steam-btn:hover {
  background: var(--bg-hover);
  color: #66c0f4;
  border-color: rgba(102, 192, 244, 0.45);
}

.sort-controls {
  display: flex; align-items: center; gap: 6px;
}

.sort-pill {
  height: 30px; padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 15px;
  background: var(--bg-input);
  color: var(--text-secondary); font-size: 12px;
  display: flex; align-items: center; gap: 6px;
  cursor: pointer; user-select: none;
  transition: all 0.15s;
}
.sort-pill:hover { background: var(--bg-hover); border-color: var(--border-color); }
.sort-label { line-height: 1; color: var(--text-secondary); }
.sort-arrow { font-size: 14px; opacity: 0.65; }

.shuffle-btn {
  width: 30px; height: 30px;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 50%;
  background: rgba(255,255,255,0.04);
  color: #999; font-size: 14px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
  padding: 0;
}
.shuffle-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
.shuffle-btn.active { color: #8eb4ff; border-color: rgba(142,180,255,0.3); background: rgba(142,180,255,0.1); }
.shuffle-btn.active:hover { background: rgba(142,180,255,0.2); }
.shuffle-icon { display: inline-block; transition: transform 0.3s ease; }
.shuffle-icon.spinning { transform: rotate(180deg); }

.dir-label { font-size: 11px; font-weight: 700; line-height: 1; }

.color-mode-toggles { display: none; } /* replaced by inline */

.sort-dropdown { position: relative; }
.sort-menu {
  position: absolute; top: 36px; left: 0;
  background: var(--bg-panel-solid); border: 1px solid var(--border-color);
  border-radius: 8px; padding: 4px 0;
  min-width: 160px; z-index: 200;
}
.sort-menu-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.sort-menu-sep { height: 1px; background: var(--border-color); margin: 4px 8px; }

.color-mode-inline {
  display: flex; gap: 2px; margin-left: auto;
}
.cm-inline-btn {
  width: 20px; height: 20px;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 3px;
  background: rgba(255,255,255,0.04);
  color: #999; font-size: 9px; font-weight: 700;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  padding: 0; line-height: 1;
}
.cm-inline-btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
.cm-inline-btn.active { color: #8eb4ff; border-color: rgba(142,180,255,0.3); background: rgba(142,180,255,0.15); }

/* 基础菜单项 */
.sort-menu-item {
  display: flex; align-items: center;
  padding: 8px 14px; font-size: 13px; color: var(--text-secondary); cursor: pointer;
  white-space: nowrap; transition: background 0.1s;
}
.sort-menu-item.color-item {
  flex-wrap: wrap; row-gap: 4px;
}
.hue-bar-wrap {
  width: 100%; display: flex; align-items: center; gap: 8px;
  padding: 4px 0 0 0;
}
.hue-range {
  flex: 1; height: 16px; -webkit-appearance: none; appearance: none;
  background: linear-gradient(to right,
    hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%),
    hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%));
  border-radius: 8px; outline: none; cursor: pointer;
}
.hue-range::-webkit-slider-thumb {
  -webkit-appearance: none; width: 14px; height: 14px;
  border-radius: 50%; background: #fff; border: 2px solid #555; cursor: pointer;
}
.hue-val { color: #ccc; font-size: 11px; min-width: 32px; text-align: right; }
.hue-ok {
  padding: 2px 10px; border: 1px solid rgba(142,180,255,0.3); border-radius: 4px;
  background: rgba(142,180,255,0.1); color: #8eb4ff; font-size: 11px; cursor: pointer;
}
.hue-ok:hover { background: rgba(142,180,255,0.25); }
.sort-menu-item.active { color: #8eb4ff; background: rgba(142,180,255,0.08); }
.seed-input {
  width: 64px; height: 22px; margin-left: 24px;
  background: rgba(0,0,0,0.3); border: 1px solid var(--border-color);
  border-radius: 4px; color: var(--text-secondary);
  font-size: 12px; font-family: 'Consolas', monospace;
  text-align: center; text-transform: lowercase; letter-spacing: 0.5px;
  outline: none; transition: border-color 0.15s;
}
.seed-input:focus { border-color: #8eb4ff; }
.seed-input { text-decoration: none; -webkit-text-decoration: none; }
.seed-input::placeholder { color: var(--text-muted); opacity: 0.5; }
.seed-copy-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; margin-left: 4px;
  background: transparent; border: 1px solid var(--border-color);
  border-radius: 4px; color: var(--text-muted);
  font-size: 13px; cursor: pointer; transition: all 0.15s;
  flex-shrink: 0;
}
.seed-copy-btn:hover { color: var(--text-primary); border-color: var(--text-secondary); }
.sort-menu-item span { flex-shrink: 0; }

.tb-btn {
  height: 30px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-input);
  color: var(--text-secondary); font-size: 12px; cursor: pointer; outline: none;
  display: flex; align-items: center; padding: 0 10px;
}
.tb-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

.folder-dropdown { position: relative; }
.dropdown-menu {
  position: absolute; top: 36px; left: 0;
  background: var(--bg-panel-solid); border: 1px solid var(--border-color);
  border-radius: 8px; padding: 4px 0;
  min-width: 180px; z-index: 200;
}
.menu-item {
  padding: 8px 14px; font-size: 13px; color: var(--text-secondary); cursor: pointer;
  white-space: nowrap;
}
.menu-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.menu-sep { height: 1px; background: var(--border-color); margin: 4px 0; }

.win-btn {
  width: 46px; height: 48px;
  border: none; border-radius: 0;
  background: transparent;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-secondary);
  transition: background 0.15s, color 0.15s;
}
.win-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.win-btn.active { color: #8eb4ff; background: rgba(142,180,255,0.1); }
.win-btn.active:hover { color: #a0c8ff; background: rgba(142,180,255,0.2); }
</style>

<style>
[data-theme="light"] .win-btn { color: #666 !important; }
.topbar-toast {
  position: fixed; bottom: 24px; right: 344px;
  background: var(--bg-toast);
  color: var(--text-secondary); padding: 10px 20px; border-radius: 8px;
  font-size: 13px; z-index: 10000; pointer-events: none;
  max-width: 420px; line-height: 1.5;
  border: 1px solid var(--border-color);
}
.toast-fade-enter-active, .toast-fade-leave-active { transition: opacity 0.35s ease; }
.toast-fade-enter-from, .toast-fade-leave-to { opacity: 0; }
</style>
