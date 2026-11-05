<template>
  <div
    class="gallery-canvas"
    ref="scrollContainer"
  >
    <div v-if="gallery.isScanning && gallery.images.length === 0" class="hint scanning">
      <span class="hint-icon">🔍</span>
      <span>{{ t('gallery.scanning') }}</span>
    </div>

    <div v-else-if="!gallery.isScanning && gallery.folderPath && gallery.sortedImages.length === 0" class="hint">
      <span class="hint-icon">📭</span>
      <span>{{ t('gallery.folderEmpty') }}</span>
    </div>

    <div v-else-if="!gallery.isScanning && gallery.sortedImages.length === 0 && dashboardReady" class="hint">
      <div class="dashboard">
        <div class="dash-grid">
          <div class="dash-item" @click="emit('open-folder-selector')" :title="t('dashboard.selectFolder')">
            <span class="dash-val">{{ dashStats.folders }}</span>
            <span class="dash-label">{{ t('dashboard.folders') }}</span>
          </div>
          <div class="dash-item">
            <span class="dash-val">{{ dashStats.images }}</span>
            <span class="dash-label">{{ t('dashboard.images') }}</span>
          </div>
          <div class="dash-item" :class="{ 'dash-disabled': dashStats.favorites === 0 }" @click="dashStats.favorites > 0 && emit('open-favorites')" :title="t('dashboard.openFavorites')">
            <span class="dash-val">{{ dashStats.favorites }}</span>
            <span class="dash-label">{{ t('dashboard.favorites') }}</span>
          </div>
          <div v-if="gallery.pinboardEnabled" class="dash-item" @click="emit('toggle-pinboard')" :title="t('pinboard.expand')">
            <span class="dash-val">{{ dashStats.pinboards }}</span>
            <span class="dash-label">{{ t('dashboard.pinboards') }}</span>
          </div>
        </div>
        <div v-if="lastOpenedText" class="dash-last">
          <span class="dash-label">{{ t('dashboard.lastScan') }}{{ lastOpenedText }}</span>
        </div>
      </div>

      <div v-if="recentFolders.length > 0" class="recent-folders">
        <span class="recent-title">{{ t('dashboard.recentFolders') }}</span>
        <div v-for="f in recentFolders" :key="f.id" class="recent-folder-item" @click="emit('open-folder', f.path)" :title="f.path">
          <span class="rf-icon">{{ f.is_favorite ? '⭐' : '📁' }}</span>
          <span class="rf-name">{{ f.display_name || f.path.split('\\').pop() }}</span>
          <span class="rf-count">{{ f.imageCount || 0 }}</span>
        </div>
      </div>
    </div>

    <div
      v-else
      class="masonry-container"
      :style="{ height: totalHeight + 'px' }"
    >
      <div
        v-for="item in visibleItems"
        :key="item.img.file_path"
        class="gallery-item" :class="{ 'gallery-item-selected': isSelected(item.img) }"
        :data-fp="item.img.file_path"
        :style="{
          position: 'absolute',
          top: item.top + 'px',
          left: item.left + 'px',
          width: item.width + 'px',
          height: item.height + 'px',
          borderRadius: radiusPx,
        }"
        @click="handleImageClick($event, item.img)"
        @dblclick="handleImageDblClick($event, item.img)"
        @contextmenu.prevent="openImageMenu($event, item.img)"
      >
        <img
          class="gallery-img"
          decoding="async"
          :alt="item.img.file_name"
          :src="shouldLoadThumb(item.img.file_path) ? thumbSrc(item.img) : ''"
          :data-fp="item.img.file_path"
          draggable="false"
          @dragstart.prevent
          @load="onImgLoad($event)"
          @error="onImgError($event)"
        >
        <div v-if="item.img.is_favorite" class="fav-badge">♥</div>
        <div v-if="selectionIndex(item.img) > 0" class="selection-badge">{{ selectionIndex(item.img) }}</div>
        <div v-if="isVideoExt(item.img.file_path)" class="video-play-badge" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="7 4 22 12 7 20"/></svg>
        </div>
        <div class="hover-overlay" :data-info="hoverLabel(item.img)"></div>
      </div>
      <div class="column-sentinel" :style="{ position: 'absolute', top: totalHeight + 'px', left: 0 }"></div>
    </div>

    <!-- 缩略图生成进度 -->
    <div v-if="gallery.isScanning && gallery.images.length > 0" class="progress-bar-wrap">
      <div class="progress-bar" :style="{ width: gallery.thumbProgress + '%' }"></div>
    </div>

    <!-- 右键菜单 -->
    <div v-if="imageMenu.visible" class="image-context-menu" :style="{ left: imageMenu.x + 'px', top: imageMenu.y + 'px' }">
      <div v-if="gallery.pinboardEnabled" class="image-context-item" @click="addSelectedToPinboard">{{ t('gallery.addToPinboard') }}</div>
      <div class="image-context-item" @click="toggleFavoriteFromMenu">{{ allSelectedFavorited ? t('gallery.removeFav') : t('gallery.addFav') }}</div>
      <div class="image-context-item" @click="openSelectedDefault">{{ t('gallery.openDefault') }}</div>
      <div class="image-context-item" @click="startDriftFromMenu">{{ t('gallery.enterDrift') }}</div>
      <div class="image-context-item" @click="openRefBoard">{{ t('gallery.openRefBoard') }}</div>
      <div v-if="gallery.imageSearchEnabled" class="image-context-item search-sub-trigger" @click="doSearch(gallery.searchEngine)">
        {{ t('gallery.imageSearch') }}
        <div class="search-sub-menu">
          <div class="search-sub-note">{{ t('gallery.imageSearchNote') }}</div>
          <div v-for="engine in searchEngines" :key="engine.key"
            class="search-sub-item" @click.stop="doSearch(engine.key)">
            <span class="search-sub-name">{{ engine.name }}</span>
            <span class="search-sub-desc">{{ t(engine.descKey) }}</span>
          </div>
        </div>
      </div>
    
      <div class="image-context-item" @click="saveAsFromMenu">{{ t('context.saveAs') }}</div>
      <div class="image-context-item" @click="saveAsToFolderFromMenu">{{ t('context.saveAsToFolder') }}</div>
      <div class="image-context-item danger" @click="deleteFromMenu">{{ t('context.delete') }}</div></div>

    <transition name="toast-fade">
      <div v-if="toast" class="gallery-toast">{{ toast }}</div>
    </transition>

    <Teleport to="body">
      <div v-if="showRefBoardConfirm" class="modal-overlay" @click.self="cancelRefBoardBatch">
        <div class="modal-box">
          <div class="modal-body">
            <div class="modal-icon">&#9888;</div>
            <div class="modal-text">
              <div class="modal-title">{{ t('dialog.refBoardConfirmTitle') }}</div>
              <div class="modal-desc">{{ t('dialog.refBoardConfirmMsg', { count: refBoardConfirmCount }) }}</div>
            </div>
          </div>
          <div class="modal-actions">
            <button class="modal-btn modal-cancel" @click="cancelRefBoardBatch">{{ t('dialog.cancel') }}</button>
            <button class="modal-btn modal-confirm" @click="confirmRefBoardBatch" autofocus>{{ t('dialog.refBoardConfirmBtn') }}</button>
          </div>
        </div>
      </div>
      <div v-if="showDeleteConfirm" class="modal-overlay" @click.self="cancelDeleteBatch">
        <div class="modal-box delete-modal">
          <div class="modal-icon">⚠️</div>
          <div class="modal-title">{{ t('delete.title') }}</div>
          <div class="modal-path"><code>{{ deleteConfirmPaths }}</code></div>
          <div class="modal-actions">
            <button class="modal-btn modal-cancel" @click="cancelDeleteBatch" autofocus>{{ t('delete.cancel') }}</button>
            <button class="modal-btn modal-confirm" @click="confirmDeleteBatch">{{ t('delete.confirm') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <FolderSelector :visible="showSaveToFolder" @select="onSaveToFolderSelected" @select-multi="onSaveToFoldersSelected" @cancel="showSaveToFolder = false" />
  </div>
</template>

<script setup lang="ts">
import { useGalleryStore } from '../stores/gallery'
import { usePinboardStore } from '../stores/pinboard'
import { useI18n, getLocale } from '../i18n'
import { ref, computed, watch, onMounted, onUnmounted, nextTick, reactive } from 'vue'
import { api as viewerApi } from 'v-viewer'
import { parseGIF, decompressFrames } from 'gifuct-js'
import { isVideoExt } from '../utils/video'
import { isExtEnabled } from '../utils/formats'
import FolderSelector from './FolderSelector.vue'

const gallery = useGalleryStore()
const pinboard = usePinboardStore()
const { t } = useI18n()
const scrollContainer = ref<HTMLElement | null>(null)

// Check whether all multi-selected images are already favorited
const allSelectedFavorited = computed(() => {
  if (!imageMenu.img) return false
  const targets = getMultiSelectTargets(imageMenu.img)
  return targets.length > 0 && targets.every(im => im.is_favorite)
})
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null
const imageMenu = reactive<{ visible: boolean; x: number; y: number; img: ImageItem | null }>({ visible: false, x: 0, y: 0, img: null })

const lastOpenedFolder = ref('')
const brandFontFamily = ref('')

const dashStats = reactive({ folders: 0, images: 0, favorites: 0, pinboards: 0 })
const dashboardReady = ref(false)
const lastOpenedTime = ref('')
const nowTick = ref(0)
const lastOpenedText = computed(() => {
  void nowTick.value
  return formatLastOpenedTime(lastOpenedTime.value)
})
let _lastOpenedTimer: ReturnType<typeof setInterval> | null = null

interface RecentFolder {
  id: number; path: string; display_name: string; is_favorite: number; imageCount: number
}
const recentFolders = ref<RecentFolder[]>([])

function formatLastOpenedTime(isoStr: string): string {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return t('time.justNow')
  if (diffMin < 60) return t('time.minutesAgo', { n: diffMin })
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return t('time.hoursAgo', { n: diffHour })
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return t('time.daysAgo', { n: diffDay })
  return d.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' })
}

async function loadDashboard() {
  const cfg = await window.picrand.readConfig?.()
  const folders = await window.picrand.getAllFolders?.() || []

  // 方案 4：先让 dashboard 用常量（0/bootstrap 占位）立即可见，再异步填数字。
  // 历史是串行 await getAllFolderStats（每文件夹 SUM(file_size) 全扫）+ loadFavorites
  // （SELECT * 把每条 clip_feat(2KB) features(640B) BLOB 全解进 JS），10万+ 库冻结主进程数秒。
  lastOpenedTime.value = cfg?.lastOpenedFolderTime || ''

  // 最近文件夹：纯配置 + folders 列表，无 BLOB，可先渲染
  const recentPaths: string[] = cfg?.recentFolderPaths?.length
    ? cfg.recentFolderPaths
    : (cfg?.lastOpenedFolder ? [cfg.lastOpenedFolder] : [])
  const top3 = recentPaths.slice(0, 3)
  const seen = new Set(top3)
  if (top3.length < 3) {
    for (const f of folders) {
      if (top3.length >= 3) break
      if (!seen.has(f.path)) {
        seen.add(f.path)
        top3.push(f.path)
      }
    }
  }
  // 先以 imageCount=0 渲染最近文件夹骨架（dashboardReady=true 触发上屏）
  const recents = top3
    .map((p: string) => {
      const matched = folders.find((f: any) => f.path === p)
      if (!matched) return null
      return {
        id: matched.id,
        path: matched.path,
        display_name: matched.display_name || '',
        is_favorite: matched.is_favorite || 0,
        imageCount: 0,
      }
    })
    .filter(Boolean) as RecentFolder[]

  // 先一次性写入骨架状态（folders 数 + 最近文件夹，数字暂为 0），dashboardReady=true 立刻上屏
  Object.assign(dashStats, {
    folders: folders.length,
    images: 0,
    favorites: 0,
    pinboards: 0,
  })
  recentFolders.value = recents
  lastOpenedFolder.value = cfg?.lastOpenedFolder || ''
  brandFontFamily.value = cfg?.brandFontFamily || ''
  dashboardReady.value = true

  // 第二阶段：异步填数字。getDashboardStats 只点查 folders 缓存列 + 收藏计数，
  // 不读 BLOB、不跑 SUM，主进程点查即出，不再阻塞。
  try {
    const dash = await window.picrand.getDashboardStats?.()
    if (dash) {
      let totalImages = 0
      const folderImageCounts: Map<number, number> = new Map()
      for (const [fid, s] of Object.entries(dash.folderStats || {})) {
        const cnt = (s as any).count || 0
        totalImages += cnt
        folderImageCounts.set(Number(fid), cnt)
      }
      dashStats.images = totalImages
      dashStats.favorites = dash.favoritesCount || 0
      // 回填最近文件夹的 imageCount
      recentFolders.value = recents.map((r) => ({ ...r, imageCount: folderImageCounts.get(r.id) || r.imageCount }))
    }
  } catch {}
  try { dashStats.pinboards = (await window.picrand.getPinboards?.())?.boards?.length || 0 } catch {}
}


function truncatePath(p: string): string {
  const max = 60
  if (p.length <= max) return p
  return p.slice(0, 24) + '...' + p.slice(p.length - 33)
}

// ====== 澶氶€?=====
const selectedPaths = ref<Set<string>>(new Set())
const lastClickedPath = ref<string | null>(null)
const selectedOrder = ref<string[]>([])

// refboard batch confirm
const showRefBoardConfirm = ref(false)
let _pendingRefBoardTargets: ImageItem[] = []
const refBoardConfirmCount = computed(() => _pendingRefBoardTargets.length)

function selectionIndex(img: ImageItem): number {
  if (selectedPaths.value.size <= 1) return 0
  const idx = selectedOrder.value.indexOf(img.file_path)
  return idx >= 0 ? idx + 1 : 0
}

function isSelected(img: ImageItem): boolean {
  const s = selectedPaths.value
  return s.size > 1 && s.has(img.file_path)
}

function clearSelection() {
  if (selectedPaths.value.size) { selectedPaths.value = new Set(); selectedOrder.value = [] }
}

// 切换文件夹/排序/视图模式时取消多选
watch(() => gallery.sortMode, () => clearSelection())
watch(() => gallery.folderPath, () => clearSelection())
watch(() => gallery.viewMode, () => clearSelection())


// ====== 布局参数 ======
const GAP_PADDING = 12 // gallery-canvas 的 padding
const gapPx = computed(() => gallery.picGap + 'px')
const radiusPx = computed(() => gallery.picRadius + 'px')

// ====== 容器宽度追踪 (ResizeObserver) ======
const containerWidth = ref(0)
let _resizeObserver: ResizeObserver | null = null

// ====== 列宽：JS 精确计算，不再依赖 CSS 1fr ======
const columnWidth = computed(() => {
  const cw = containerWidth.value
  if (cw <= 0) return 280 // 初始默认值
  const cols = Math.max(1, gallery.columns)
  const contentW = cw - GAP_PADDING * 2
  return Math.floor((contentW - (cols - 1) * gallery.picGap) / cols)
})

// ====== 图片像素高度（基于真实列宽 × 宽高比） ======
function itemHeight(img: ImageItem): number {
  if (img.width && img.height) {
    const h = columnWidth.value * (img.height / img.width)
    return Math.round(Math.max(60, Math.min(h, columnWidth.value * 6)))
  }
  return Math.round(columnWidth.value * 0.75)
}

// ====== 贪心选列（高度差最小化） ======
function pickColumn(heights: number[], imgH: number, gap: number): number {
  let best = 0, bestDiff = Infinity
  const cc = heights.length
  for (let i = 0; i < cc; i++) {
    const altered = heights[i] + imgH + gap
    let maxH = altered, minH = altered
    for (let j = 0; j < cc; j++) {
      if (j === i) continue
      if (heights[j] > maxH) maxH = heights[j]
      if (heights[j] < minH) minH = heights[j]
    }
    const diff = maxH - minH
    if (diff < bestDiff) { bestDiff = diff; best = i }
  }
  return best
}

// ====== 定位后的图片项 ======
interface PositionedItem {
  img: ImageItem
  col: number
  top: number
  left: number
  width: number
  height: number
}

// 全量布局数据（不随滚动变化）
const positionedItems = ref<PositionedItem[]>([])
const totalHeight = ref(0)

function rebuildLayout(items: ImageItem[]) {
  const cc = Math.max(1, gallery.columns)
  const gap = gallery.picGap
  const cw = columnWidth.value
  const cols: ImageItem[][] = Array.from({ length: cc }, () => [])
  const heights = Array(cc).fill(0)
  const result: PositionedItem[] = []

  for (const img of items) {
    const ih = itemHeight(img)
    const tc = pickColumn(heights, ih, gap)
    const top = heights[tc]
    const left = GAP_PADDING + tc * (cw + gap)
    result.push({ img, col: tc, top, left, width: cw, height: ih })
    cols[tc].push(img)
    heights[tc] += ih + gap
  }

  positionedItems.value = result
  totalHeight.value = Math.max(...heights, 0) + GAP_PADDING
}

// ====== 增量追加（不改动已有图片位置） ======
function addToLayout(newItems: ImageItem[]) {
  if (newItems.length === 0) return
  const cc = Math.max(1, gallery.columns)
  const gap = gallery.picGap
  const cw = columnWidth.value

  // 从现有数据推算每列当前高度
  const heights = Array(cc).fill(0)
  for (const pi of positionedItems.value) {
    const bottom = pi.top + pi.height + gap
    if (bottom > heights[pi.col]) heights[pi.col] = bottom
  }

  const newPositions: PositionedItem[] = []
  for (const img of newItems) {
    const ih = itemHeight(img)
    const tc = pickColumn(heights, ih, gap)
    const top = heights[tc]
    const left = GAP_PADDING + tc * (cw + gap)
    newPositions.push({ img, col: tc, top, left, width: cw, height: ih })
    heights[tc] += ih + gap
  }

  positionedItems.value = [...positionedItems.value, ...newPositions]
  totalHeight.value = Math.max(...heights, 0) + GAP_PADDING
}

// ====== 监听图片变化 ======
let _knownPaths = new Set<string>()
let _prevInputPaths: string[] = []

watch(() => gallery.sortedImages, (items, oldItems) => {
  const _t0Probe = (typeof performance !== 'undefined') ? performance.now() : Date.now()
  // 回到空态时重新加载仪表盘
  if (items.length === 0) loadDashboard()
  if (!oldItems || oldItems.length === 0) {
    _knownPaths = new Set(items.map(i => i.file_path))
    _prevInputPaths = items.map(i => i.file_path)
    rebuildLayout(items)
    try { window.picrand.perfProbe?.({ k: 'watch', branch: 'init', ms: ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - _t0Probe) | 0, n: items.length }) } catch {}
    return
  }
  // 内存回收：超过 5000 全量重建
  if (_knownPaths.size > 5000) {
    _knownPaths = new Set(items.map(i => i.file_path))
    _prevInputPaths = items.map(i => i.file_path)
    rebuildLayout(items)
    try { window.picrand.perfProbe?.({ k: 'watch', branch: 'gc5000', ms: ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - _t0Probe) | 0, n: items.length }) } catch {}
    return
  }
  const added = items.filter(i => !_knownPaths.has(i.file_path))
  const newPathSet = new Set(items.map(i => i.file_path))
  const removed = oldItems.filter(i => !newPathSet.has(i.file_path))
  if (removed.length > 0 || added.length > 200) {
    _knownPaths = newPathSet
    _prevInputPaths = items.map(i => i.file_path)
    rebuildLayout(items)
    try { window.picrand.perfProbe?.({ k: 'watch', branch: 'rebuild', ms: ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - _t0Probe) | 0, added: added.length, removed: removed.length, n: items.length }) } catch {}
  } else if (added.length === 0 && removed.length === 0) {
    // reorder detection: same set, different input order -> rebuild
    const newPaths = items.map(i => i.file_path)
    let orderChanged = false
    if (newPaths.length === _prevInputPaths.length) {
      for (let k = 0; k < newPaths.length; k++) {
        if (newPaths[k] !== _prevInputPaths[k]) { orderChanged = true; break }
      }
    } else { orderChanged = true }
    _prevInputPaths = newPaths
    if (orderChanged) {
      _knownPaths = newPathSet
      rebuildLayout(items)
    } else {
      // pure field update (thumbnail, favorite) -> in-place swap img ref, keep positions
      const byPath = new Map(items.map(i => [i.file_path, i] as const))
      positionedItems.value = positionedItems.value.map(p => {
        const fresh = byPath.get(p.img.file_path)
        return fresh ? { ...p, img: fresh } : p
      })
      try { window.picrand.perfProbe?.({ k: 'watch', branch: 'field', ms: ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - _t0Probe) | 0, n: items.length }) } catch {}
    }
  } else {
    for (const img of added) _knownPaths.add(img.file_path)
    _prevInputPaths = items.map(i => i.file_path)
    addToLayout(added)
    try { window.picrand.perfProbe?.({ k: 'watch', branch: 'add', ms: ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - _t0Probe) | 0, added: added.length, n: items.length }) } catch {}
  }
})

// 列数/间距/容器宽度变化 → 全量重建 + 锚定视口顶部图片保留阅读进度
let _anchorSeq = 0
watch([() => gallery.columns, () => gallery.picGap, columnWidth], () => {
  if (gallery.sortedImages.length > 0) {
    const seq = ++_anchorSeq
    // 捕获视口顶部第一张可见图片
    const el = scrollContainer.value
    let anchorPath: string | null = null
    if (el) {
      const items = el.querySelectorAll('.gallery-item')
      let bestDist = Infinity
      for (let i = 0; i < items.length; i++) {
        const rect = (items[i] as HTMLElement).getBoundingClientRect()
        const dist = Math.abs(rect.top - GAP_PADDING - 48)
        if (dist < bestDist) {
          bestDist = dist
          anchorPath = ((items[i] as HTMLElement).querySelector('img') as HTMLImageElement)?.getAttribute('data-fp') || null
        }
      }
    }
    rebuildLayout(gallery.sortedImages)
    if (anchorPath) {
      const pi = positionedItems.value.find(p => p.img.file_path === anchorPath)
      if (pi) {
        nextTick(() => {
          if (seq !== _anchorSeq) return
          if (scrollContainer.value) scrollContainer.value.scrollTop = pi.top - GAP_PADDING
        })
      }
    }
  }
})

// ====== 排序/洗牌/切换文件夹 → 归顶 ======
function scrollToTop() {
  // 快照恢复期间不归顶，避免 500ms 50ms×10 的 interval barrage 覆盖滚动恢复
  if (gallery._pendingScrollProgress >= 0) return
  const el = scrollContainer.value
  if (!el) return
  el.scrollTop = 0
  let count = 0
  const id = setInterval(() => {
    if (el) el.scrollTop = 0
    if (++count >= 10) clearInterval(id)
  }, 50)
}

watch([() => gallery.sortMode, () => gallery.shuffleCounter], scrollToTop, { flush: 'post' })
watch(() => gallery.folderPath, scrollToTop)
// 新搜索（文件名/AI）替换结果后滚到顶部，省得用户手动翻
watch(() => gallery.searchQuery, scrollToTop, { flush: 'post' })

// ====== 切回已访问文件夹：恢复滚动位置 ======
// flush: 'post' 确保在 Vue DOM 更新之后执行，DOM 就绪后直接设 scrollTop 无需 nextTick
watch([() => gallery._pendingScrollProgress, totalHeight, () => gallery.images.length], ([progress, th, imgCount]) => {
  if (progress >= 0 && th > 0 && imgCount > 0) {
    const el = scrollContainer.value
    if (el) {
      el.scrollTop = progress * th
    }
    gallery._pendingScrollProgress = -1
  }
}, { flush: 'post' })

// 切换文件夹时清空内部缓存，释放内存
watch(() => gallery.images, (val) => {
  if (!val || val.length === 0) {
    for (const [, el] of preloadCache) el.src = ''
    preloadCache.clear()
    _knownPaths = new Set()
    positionedItems.value = []
    totalHeight.value = 0
    inViewPaths.value = new Set()  // 清按需加载标记，避免新文件夹图片误判"已加载"
    _imgRetries.clear()  // 切库后重试计数作废
    // 关闭可能存在的灯箱和幻灯片
    _lbViewerRef?.hide?.()
    document.querySelector('.picrand-slideshow')?.remove()
  }
})

// 格式筛选等"原地重载"前调用：释放旧原图预加载，避免新旧两组原图共存导致内存峰值翻倍
function releasePreloads() {
  for (const [, el] of preloadCache) el.src = ''
  preloadCache.clear()
}

defineExpose({ scrollToTop, releasePreloads })

// ====== 虚拟滚动：基于像素位置的精确切片 ======
const scrollTop = ref(0)
const containerHeight = ref(0)

// 列数越多，格子越小，同一缓冲区里能塞进的图越多；按列数收窄缓冲区/懒加载边距，
// 避免高列数（尤其 8 列）时一次涌入过多缩略图造成滚动卡顿。
// 基准（列数 ≤4）保持原值：可见缓冲上 1000 / 下 5000，懒加载上 1000 / 下 3000；
// 5-6 列收窄到 0.6；7-8 列收窄到 0.4。
const _bufferScale = computed(() => {
  const c = gallery.columns
  if (c <= 4) return 1
  if (c <= 6) return 0.6
  return 0.4
})
const VISIBLE_BUFFER_ABOVE = computed(() => Math.round(1000 * _bufferScale.value))
const VISIBLE_BUFFER_BELOW = computed(() => Math.round(5000 * _bufferScale.value))
const LOAD_BUFFER_ABOVE = computed(() => Math.round(1000 * _bufferScale.value))
const LOAD_BUFFER_BELOW = computed(() => Math.round(3000 * _bufferScale.value))

// ====== 原图预加载：预热全分辨率图片加速灯箱打开，下方 2000px，上方 500px ======
const PRELOAD_BELOW = 500
const PRELOAD_ABOVE = 150
const PRELOAD_LIMIT = 50
const PRELOAD_MAX_SIZE = 20 * 1024 * 1024 // 20MB
const preloadCache = new Map<string, HTMLImageElement>()

const preloadItems = computed(() => {
  const all = positionedItems.value
  const st = scrollTop.value
  const ch = containerHeight.value
  if (ch === 0 || all.length === 0) return [] as PositionedItem[]
  const topBound = st - PRELOAD_ABOVE
  const bottomBound = st + ch + PRELOAD_BELOW
  return all.filter(item => {
    const itemBottom = item.top + item.height
    return itemBottom > topBound && item.top < bottomBound
  })
})

watch(
  () => preloadItems.value.map(i => i.img.file_path),
  (newPaths) => {
    if (!gallery.preloadEnabled) return
    const newSet = new Set(newPaths)
    for (const [path, el] of preloadCache) {
      if (!newSet.has(path)) { el.src = ''; preloadCache.delete(path) }
    }
    for (const path of newPaths) {
      if (preloadCache.size >= PRELOAD_LIMIT) break
      if (preloadCache.has(path)) continue
      const pi = positionedItems.value.find(p => p.img.file_path === path)
      if (!pi) continue
      const ext = pi.img.file_path.slice(pi.img.file_path.lastIndexOf('.')).toLowerCase()
      if (ext === '.psd' || isVideoExt(pi.img.file_path)) continue
      if (pi.img.file_size > 0 && pi.img.file_size > PRELOAD_MAX_SIZE) continue
      const el = new Image()
      el.src = 'picrand://get-image?path=' + encodeURIComponent(pi.img.file_path)
      preloadCache.set(path, el)
    }
  }
)

// 关闭预加载开关时，立即释放已预加载的原图（不依赖滚动/切文件夹）
watch(() => gallery.preloadEnabled, (enabled) => {
  if (enabled) return
  for (const [, el] of preloadCache) { el.src = '' }
  preloadCache.clear()
})

const visibleItems = computed(() => {
  const all = positionedItems.value
  const st = scrollTop.value
  const ch = containerHeight.value
  if (ch === 0 || all.length === 0) return all

  const topBound = st - VISIBLE_BUFFER_ABOVE.value
  const bottomBound = st + ch + VISIBLE_BUFFER_BELOW.value

  return all.filter(item => {
    const itemBottom = item.top + item.height
    return itemBottom > topBound && item.top < bottomBound
  })
})

// ====== 灯箱顺序：按视觉位置（上→下，左→右） ======
const lightboxOrder = computed(() => {
  const all = positionedItems.value
  if (all.length === 0) return []
  // 按 top 主序、left 次序稳定排序
  return [...all].sort((a, b) => {
    const d = a.top - b.top
    if (Math.abs(d) > 2) return d // top 差距 >2px → 按 top
    return a.left - b.left // 同一行按左→右
  }).map(p => p.img)
})

// ====== 缩略图 URL ======
function thumbSrc(img: ImageItem): string {
  // 视频即使无 thumbnail_path 也走协议层，由 orig 分支现场生成首帧海报（失败返回 404，<img> 自然空占位）
  const orig = encodeURIComponent(img.file_path)
  const thumb = img.thumbnail_path ? `&thumb=${encodeURIComponent(img.thumbnail_path)}` : ''
  return `picrand://get-image?orig=${orig}${thumb}`
}

// 缩略图加载后用真实宽高回填缺失的尺寸，避免瀑布流长期停留在 0.75 兜底比例。
// 多个缩略图同帧加载时合并为一次布局重算，避免逐张触发全量 rebuild。
let _layoutRebuildPending = false
function scheduleLayoutRebuild() {
  if (_layoutRebuildPending) return
  _layoutRebuildPending = true
  requestAnimationFrame(() => {
    _layoutRebuildPending = false
    if (gallery.sortedImages.length > 0) rebuildLayout(gallery.sortedImages)
  })
}

function onImgLoad(e: Event) {
  const el = e.target as HTMLImageElement
  el.classList.add('loaded')
  const fp = el.dataset?.fp
  if (fp) _imgRetries.delete(fp)
  // 数据库尚未记录宽高时，用缩略图真实尺寸回填并重算该项高度
  if (fp && el.naturalWidth > 0 && el.naturalHeight > 0) {
    const item = positionedItems.value.find(p => p.img.file_path === fp)
    if (item && (!item.img.width || !item.img.height)) {
      gallery.updateImageMeta(fp, { width: el.naturalWidth, height: el.naturalHeight })
      scheduleLayoutRebuild()
    }
  }
}

// ====== 缩略图加载失败重试 =====
// picrand:// 请求失败（CPU 闸门过载 404 / 请求挂起超时）后，<img> 空白且 :src 值
// 不变，Chromium 不会自动重发请求，只能靠滚出/滚回范围带才恢复。失败后延迟重设
// src（''->url 属性变化强制重新请求），带退避，最多连续 3 次；成功后清零计数。
const _imgRetries = new Map<string, number>()
const IMG_MAX_RETRY = 3
function onImgError(e: Event) {
  const img = e.target as HTMLImageElement
  const fp = img.dataset?.fp
  if (!fp) return
  const n = _imgRetries.get(fp) || 0
  if (n >= IMG_MAX_RETRY) return
  _imgRetries.set(fp, n + 1)
  setTimeout(() => {
    if (!img.isConnected || !inViewPaths.value.has(fp)) return
    const url = img.getAttribute('src') || ''
    if (!url) return
    img.src = ''
    img.src = url
  }, 400 * (n + 1))
}

function hoverLabel(img: ImageItem): string {
  if (img.width && img.height) return `${img.file_name} | ${img.width}x${img.height}`
  return img.file_name
}

// ====== Toast ======
function showToast(message: string, duration = 1600) {
  toast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, duration)
}

// ====== 右键菜单 ======
function openImageMenu(e: MouseEvent, img: ImageItem) {
  imageMenu.visible = true
  imageMenu.img = img
  document.addEventListener('wheel', closeImageMenu, { once: true, capture: true })
  const vw = window.innerWidth
  const vh = window.innerHeight
  const pad = 8
  imageMenu.x = Math.min(e.clientX, vw - pad)
  imageMenu.y = Math.min(e.clientY, vh - pad)
  nextTick(() => {
    const el = document.querySelector('.image-context-menu') as HTMLElement | null
    if (!el) return
    const rect = el.getBoundingClientRect()
    let nx = imageMenu.x
    let ny = imageMenu.y
    if (ny + rect.height + pad > vh) { ny = Math.max(pad, vh - rect.height - pad) }
    if (nx + rect.width + pad > vw) { nx = Math.max(pad, vw - rect.width - pad) }
    imageMenu.x = nx
    imageMenu.y = ny
  })
}

function closeImageMenu() { imageMenu.visible = false; document.removeEventListener('wheel', closeImageMenu, true) }

// ====== 多选联动：右键图片在多选名单内则返回全部选中项，否则只返回该图片 ======
function getMultiSelectTargets(img: ImageItem): ImageItem[] {
  const all = gallery.sortedImages
  if (selectedOrder.value.length > 1 && selectedPaths.value.has(img.file_path)) {
    const pathToImg = new Map(all.map(i => [i.file_path, i] as const))
    return selectedOrder.value.map(p => pathToImg.get(p)).filter(Boolean) as ImageItem[]
  }
  return [img]
}

const searchEngines = [
  { key: 'yandex',     name: 'Yandex',       descKey: 'gallery.searchDescYandex' },
  { key: 'saucenao',   name: 'SauceNAO',     descKey: 'gallery.searchDescSaucenao' },
  { key: 'googlelens', name: 'Google Lens',  descKey: 'gallery.searchDescGoogleLens' },
  { key: 'tracemoe',   name: 'trace.moe',    descKey: 'gallery.searchDescTracemoe' },
  { key: 'tineye',     name: 'TinEye',       descKey: 'gallery.searchDescTineye' },
]

function doSearch(key: string) {
  const img = imageMenu.img
  if (!img) return
  if (gallery.imageSearchEnabled) {
    const apiMap: Record<string, string> = { yandex: 'yandexSearch', saucenao: 'saucenaoSearch', tineye: 'tineyeSearch', tracemoe: 'tracemoeSearch', googlelens: 'googlelensSearch' }
    ;(window.picrand as any)?.[apiMap[key]]?.(img.file_path)?.catch(() => {})
    showToast(t('gallery.imageSearching'))
  } else {
    const urlMap: Record<string, string> = { yandex: 'https://yandex.com/images/', saucenao: 'https://saucenao.com/', tineye: 'https://tineye.com/', tracemoe: 'https://trace.moe/', googlelens: 'https://lens.google.com/' }
    window.open(urlMap[key], '_blank')
  }
  closeImageMenu()
}

async function addSelectedToPinboard() {
  const img = imageMenu.img
  closeImageMenu()
  if (!img) return
  const targets = getMultiSelectTargets(img)
  try {
    for (const im of targets) { await pinboard.addImage(im) }
  } catch (err: any) {
    showToast(err?.message || t('context.addFailed'))
  }
}

async function openSelectedDefault() {
  const img = imageMenu.img
  closeImageMenu()
  if (!img) return
  try {
    await window.picrand.openWithDefault(img.file_path)
  } catch (err) {
    console.error('打开失败:', err)
  }
}

async function toggleFavoriteFromMenu() {
  const img = imageMenu.img
  closeImageMenu()
  if (!img) return
  const targets = getMultiSelectTargets(img)
  try {
    const allFav = targets.every(im => im.is_favorite)
    const updates: Array<{ filePath: string; val: number }> = []
    if (allFav) {
      for (const im of targets) {
        await window.picrand.unfavoriteImage(im.file_path)
        updates.push({ filePath: im.file_path, val: 0 })
      }
      gallery.setFavoriteBatch(updates)
      showToast(t('context.unfavorited'))
    } else {
      for (const im of targets) {
        if (!im.is_favorite) {
          await window.picrand.favoriteImage(im.file_path)
          updates.push({ filePath: im.file_path, val: 1 })
        }
      }
      gallery.setFavoriteBatch(updates)
      showToast(t('context.favorited'))
    }
  } catch (err) { console.error(err) }
}

function startDriftFromMenu() {
  const img = imageMenu.img
  closeImageMenu()
  if (!img) return
  emit('start-drift', img.file_path)
}

async function openRefBoard() {
  const img = imageMenu.img
  closeImageMenu()
  if (!img) return
  const targets = getMultiSelectTargets(img)
  if (targets.length > 30) {
    _pendingRefBoardTargets = targets
    showRefBoardConfirm.value = true
    return
  }
  doOpenRefBoards(targets)
}

function doOpenRefBoards(targets: ImageItem[]) {
  for (const im of targets) {
    window.picrand.openRefBoard(im.file_path).then((result: any) => {
      if (result && !result.ok) console.error('[RefBoard] Failed:', result.error)
    }).catch((e: any) => console.error(e))
  }
}

function confirmRefBoardBatch() {
  showRefBoardConfirm.value = false
  const targets = _pendingRefBoardTargets
  _pendingRefBoardTargets = []
  if (targets.length) {
    ;(window.picrand as any).resetRefCascade?.()
    doOpenRefBoards(targets)
  }
}

// ====== 另存为 / 另存至文件夹 / 删除（兼容多选）======
async function saveAsFromMenu() {
  const img = imageMenu.img
  closeImageMenu()
  if (!img) return
  const targets = getMultiSelectTargets(img)
  try {
    const destFolder = await window.picrand.selectFolder()
    if (!destFolder) return
    const paths = targets.map(im => im.file_path)
    const result = await (window.picrand as any).saveAsBatch(paths, destFolder)
    showToast(t('toast.saved', { count: result.count, total: result.total }))
  } catch (e) { console.error(e); showToast(t('toast.saveFailed')) }
}

// 另存至文件夹：弹出文件夹选择器 → 逐个复制（同图钉板保存至文件夹）
async function saveAsToFolderFromMenu() {
  const img = imageMenu.img
  closeImageMenu()
  if (!img) return
  _pendingSaveTargets = getMultiSelectTargets(img)
  showSaveToFolder.value = true
}

// FolderSelector 回调
function onSaveToFolderSelected(path: string) {
  showSaveToFolder.value = false
  doSaveToFolders([path])
}
function onSaveToFoldersSelected(paths: string[]) {
  showSaveToFolder.value = false
  doSaveToFolders(paths)
}

let _pendingSaveTargets: ImageItem[] = []
async function doSaveToFolders(destFolders: string[]) {
  if (!_pendingSaveTargets.length) return
  const paths = _pendingSaveTargets.map(im => im.file_path)
  _pendingSaveTargets = []
  let total = 0
  for (const df of destFolders) {
    try {
      const result = await (window.picrand as any).saveAsBatch(paths, df)
      total += result.count
    } catch (e) { console.error('save-as-batch:', e) }
  }
  showToast(t('toast.saved', { count: total, total: paths.length * destFolders.length }))
}

const showSaveToFolder = ref(false)
const showDeleteConfirm = ref(false)
const deleteConfirmCount = ref(0)
const deleteConfirmPaths = ref('')
let _pendingDeleteTargets: ImageItem[] = []

function deleteFromMenu() {
  const img = imageMenu.img
  if (!img) return
  const targets = getMultiSelectTargets(img)
  _pendingDeleteTargets = targets
  deleteConfirmCount.value = targets.length
  deleteConfirmPaths.value = targets.length === 1 ? targets[0].file_path : t('dialog.fileCount', { count: targets.length })
  showDeleteConfirm.value = true
}

function cancelDeleteBatch() {
  showDeleteConfirm.value = false
  _pendingDeleteTargets = []
  closeImageMenu()
}

async function confirmDeleteBatch() {
  showDeleteConfirm.value = false
  closeImageMenu()
  const targets = _pendingDeleteTargets
  _pendingDeleteTargets = []
  for (const im of targets) {
    try { await window.picrand.deleteImage(im.file_path) } catch (e) { console.error(e) }
  }
  showToast(t('context.deleted'))
}

function cancelRefBoardBatch() {
  showRefBoardConfirm.value = false
  _pendingRefBoardTargets = []
}

// ====== 点击：单击选中；双击打开大图 ======
function ensureImageInfo(img: ImageItem) {
  if (!img.width || !img.height || !img.file_size || !img.modify_time) {
    window.picrand.getImageInfo(img.file_path).then(info => {
      Object.assign(img, info, { thumbnail_path: img.thumbnail_path || info.thumbnail_path })
      if (gallery.activeImage?.file_path === img.file_path) gallery.activeImage = img
    }).catch(() => {})
  }
}

function selectImage(img: ImageItem) {
  gallery.activeImage = img
  ensureImageInfo(img)
}

function handleImageClick(event: MouseEvent, img: ImageItem) {
  const list = gallery.sortedImages
  if (event.shiftKey && lastClickedPath.value && lastClickedPath.value !== img.file_path) {
    const startIdx = list.findIndex(i => i.file_path === lastClickedPath.value)
    const endIdx = list.findIndex(i => i.file_path === img.file_path)
    if (startIdx !== -1 && endIdx !== -1) {
      const from = Math.min(startIdx, endIdx)
      const to = Math.max(startIdx, endIdx)
      const ns = new Set(selectedPaths.value)
      const ord = [...selectedOrder.value]
      for (let i = from; i <= to; i++) {
        if (!ns.has(list[i].file_path)) { ns.add(list[i].file_path); ord.push(list[i].file_path) }
      }
      selectedPaths.value = ns
      selectedOrder.value = ord
    }
    gallery.activeImage = img
    ensureImageInfo(img)
    return
  }
  if (event.ctrlKey || event.metaKey) {
    const ns = new Set(selectedPaths.value)
    const ord = [...selectedOrder.value]
    if (ns.has(img.file_path)) { ns.delete(img.file_path); const oi = ord.indexOf(img.file_path); if (oi >= 0) ord.splice(oi, 1) }
    else { ns.add(img.file_path); ord.push(img.file_path) }
    selectedPaths.value = ns
    selectedOrder.value = ord
    lastClickedPath.value = img.file_path
    gallery.activeImage = img
    ensureImageInfo(img)
    return
  }
  // 鏅 Tweet: 娓娓呯┖澶澶娓呯┖澶澶氶€?璁句负 active
  selectedPaths.value = new Set([img.file_path])
  selectedOrder.value = [img.file_path]
  lastClickedPath.value = img.file_path
  selectImage(img)
}

function openSelectedImage(img: ImageItem) {
  gallery.activeImage = img
  ensureImageInfo(img)
  openLightbox(img)
}

function handleImageDblClick(event: MouseEvent, img: ImageItem) {
  if (event.shiftKey || event.ctrlKey || event.metaKey) return
  openSelectedImage(img)
}

// ====== v-viewer 灯箱辅助 ======
function attachViewerInputGuards(container: HTMLElement, getViewer: () => any, onSlideIndex?: (idx: number) => void) {
  let lastNavAt = 0
  let lastRepeatNav = 0
  let lastWheelAt = 0
  const navGap = 140
  const wheelGap = 180

  function updateSlideIndex() {
    if (!onSlideIndex) return
    const player = container.querySelector('.viewer-player') as HTMLElement | null
    const active = player?.querySelector('.viewer-in') as HTMLElement | null
    const all = player ? Array.from(player.querySelectorAll('img')) as HTMLElement[] : []
    const idx = active ? all.indexOf(active) : -1
    if (idx >= 0) onSlideIndex(idx)
  }

  const playKeyHandler = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    const player = container.querySelector('.viewer-player') as HTMLElement | null
    if (!player || !player.classList.contains('viewer-show')) return
    const now = Date.now()
    if (now - lastNavAt < navGap) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); return
    }
    lastNavAt = now
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.()
    const viewer = getViewer()
    if (!viewer?.playing) return
    if (event.key === 'ArrowLeft') viewer.playing.prev()
    else viewer.playing.next()
    updateSlideIndex()
  }

  const lightboxKeyHandler = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    const player = container.querySelector('.viewer-player') as HTMLElement | null
    if (player?.classList.contains('viewer-show')) return
    if (!event.repeat) return
    const now = Date.now()
    if (now - lastRepeatNav < navGap) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); return
    }
    lastRepeatNav = now
  }

  const wheelHandler = (event: WheelEvent) => {
    const player = container.querySelector('.viewer-player') as HTMLElement | null
    if (!player || !player.classList.contains('viewer-show')) return
    const now = Date.now()
    if (now - lastWheelAt < wheelGap) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); return
    }
    lastWheelAt = now
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.()
    const viewer = getViewer()
    if (!viewer?.playing) return
    if (event.deltaY < 0 || event.deltaX < 0) viewer.playing.prev()
    else if (event.deltaY > 0 || event.deltaX > 0) viewer.playing.next()
    updateSlideIndex()
  }

  document.addEventListener('keydown', playKeyHandler, true)
  document.addEventListener('keydown', lightboxKeyHandler, true)
  container.addEventListener('wheel', wheelHandler, { capture: true, passive: false })

  const cleanup = () => {
    document.removeEventListener('keydown', playKeyHandler, true)
    document.removeEventListener('keydown', lightboxKeyHandler, true)
    container.removeEventListener('wheel', wheelHandler, true)
    container.removeEventListener('hidden', cleanup as EventListener)
  }
  container.addEventListener('hidden', cleanup as EventListener)
}

function createViewerOptions(initialViewIndex: number, currentPath: string, getViewer: () => any) {
  let lastPlayedIndex = initialViewIndex
  return {
    initialViewIndex,
    navbar: false, title: false, keyboard: true, transition: false,
    fullscreen: false, tooltip: false, interval: 999999999, loop: false,
    zoomRatio: 0.2,
    toolbar: {
      zoomIn: true, zoomOut: true,
      oneToOne: {
        show: true, size: 'small',
        click: () => {
          const viewer = getViewer()
          if (!viewer) return
          const src = viewer.viewed ? viewer.image?.src : ''
          const m = src?.match(/path=([^&]+)/)
          const path = m ? decodeURIComponent(m[1]) : currentPath
          void window.picrand.openInFolder(path)
        }
      },
      reset: true, prev: true, play: true, next: true,
      rotateLeft: true, rotateRight: true,
      flipHorizontal: true, flipVertical: true,
    },
    shown() {
      const container = document.querySelector('.viewer-container') as HTMLElement | null
      if (!container) return
      attachViewerInputGuards(container, getViewer, (idx) => { lastPlayedIndex = idx })
      const canvas = container.querySelector('.viewer-canvas') as HTMLElement | null
      const rightClickReset = (event: MouseEvent) => {
        event.preventDefault()
        const resetBtn = container.querySelector('.viewer-reset') as HTMLElement | null
        resetBtn?.click()
      }
      canvas?.addEventListener('contextmenu', rightClickReset)
      const cleanupContext = () => {
        canvas?.removeEventListener('contextmenu', rightClickReset)
        container.removeEventListener('hidden', cleanupContext as EventListener)
      }
      container.addEventListener('hidden', cleanupContext as EventListener)
      const playerEl = container.querySelector('.viewer-player') as HTMLElement | null
      if (playerEl) {
        let wasPlaying = playerEl.classList.contains('viewer-show')
        const playObserver = new MutationObserver(() => {
          const isPlaying = playerEl.classList.contains('viewer-show')
          if (wasPlaying && !isPlaying && lastPlayedIndex !== initialViewIndex) {
            requestAnimationFrame(() => {
              const items = container.querySelectorAll('.viewer-list li') as NodeListOf<HTMLElement>
              const target = items[lastPlayedIndex]
              if (target) target.click()
            })
          }
          wasPlaying = isPlaying
        })
        playObserver.observe(playerEl, { attributes: true, attributeFilter: ['class'] })
        container.addEventListener('hidden', () => playObserver.disconnect(), { once: true })
      }
    },
  }
}

// ====== 灯箱：窗式 W=20 ======
let _lbKeyFn: ((ev: KeyboardEvent) => void) | null = null
let _lbLastNav = 0
let _lbPreloadEls: HTMLImageElement[] = []
let _lbViewerRef: any = null
let _gifLbCleanup: (() => void) | null = null
let _gifTogglePlay: (() => void) | null = null

function lbCleanup() {
  if (_gifLbCleanup) { _gifLbCleanup(); _gifLbCleanup = null }
  _gifTogglePlay = null
  for (const el of _lbPreloadEls) { el.src = '' }
  _lbPreloadEls.length = 0
  emit('f1-close')
  if (_lbViewerRef?.element) {
    _lbViewerRef.element.querySelectorAll('img').forEach((i: HTMLImageElement) => { i.src = ''; i.remove() })
  }
  if (_lbKeyFn) { document.removeEventListener('keydown', _lbKeyFn, true); _lbKeyFn = null }
  if (_lbViewerRef) { try { _lbViewerRef.destroy?.() } catch {}; _lbViewerRef = null }
}

function lbCleanupViewer() {
  if (_gifLbCleanup) { _gifLbCleanup(); _gifLbCleanup = null }
  // 释放上一轮预加载的 Image 对象
  for (const el of _lbPreloadEls) { el.src = '' }
  _lbPreloadEls.length = 0
  if (_lbViewerRef?.element) {
    _lbViewerRef.element.querySelectorAll('img').forEach((i: HTMLImageElement) => { i.src = ''; i.remove() })
  }
  try { _lbViewerRef?.destroy?.() } catch {}
}

// ====== 全屏幻灯片 ======
function startSlideshow(items: ImageItem[], startIdx: number, onClose: (lastIdx: number) => void) {
  let curIdx = startIdx
  let lastNav = 0
  const overlay = document.createElement('div')
  overlay.className = 'picrand-slideshow'
  const img = document.createElement('img')
  overlay.appendChild(img)
  let videoBadge: HTMLDivElement | null = null
  function showImage() {
    img.src = 'picrand://get-image?path=' + encodeURIComponent(items[curIdx].file_path)
    if (videoBadge) { videoBadge.remove(); videoBadge = null }
    if (isVideoExt(items[curIdx].file_path)) {
      videoBadge = document.createElement('div')
      videoBadge.className = 'slideshow-video-badge'
      videoBadge.style.cssText = 'position:absolute;bottom:16px;right:16px;width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:#fff;pointer-events:none;z-index:10'
      videoBadge.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="7 4 22 12 7 20"/></svg>'
      videoBadge.setAttribute('aria-hidden', 'true')
      overlay.appendChild(videoBadge)
    }
  }
  function close() { cleanup(); onClose(curIdx) }
  function cleanup() { document.removeEventListener('keydown', onKey, true); overlay.removeEventListener('wheel', onWheel); img.src = ''; img.remove(); overlay.remove() }
  function onKey(ev: KeyboardEvent) {
    if (ev.key === 'Escape') { close(); return }
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return
    ev.preventDefault(); ev.stopPropagation()
    if (ev.repeat) { const n = Date.now(); if (n - lastNav < 180) return; lastNav = n }
    if (ev.key === 'ArrowLeft' && curIdx > 0) { curIdx--; showImage() }
    else if (ev.key === 'ArrowRight' && curIdx < items.length - 1) { curIdx++; showImage() }
  }
  function onWheel(ev: WheelEvent) {
    ev.preventDefault()
    const n = Date.now(); if (n - lastNav < 50) return; lastNav = n
    if (ev.deltaY > 0 && curIdx < items.length - 1) { curIdx++; showImage() }
    else if (ev.deltaY < 0 && curIdx > 0) { curIdx--; showImage() }
  }
  overlay.addEventListener('click', () => { if (curIdx < items.length - 1) { curIdx++; showImage() } })
  overlay.addEventListener('contextmenu', (ev) => { ev.preventDefault(); close() })
  document.addEventListener('keydown', onKey, true)
  overlay.addEventListener('wheel', onWheel, { passive: false })
  showImage()
  document.body.appendChild(overlay)
}


// ====== GIF 动图灯箱帧控制 ======
function setupGifLightbox(container: HTMLElement, getViewer: () => any, filePath: string, tFn: (k: string) => string): () => void {
  let destroyed = false
  let raf: number | null = null
  let playing = true
  let curFrame = 0
  let nextFrameTime = 0
  let frames: any[] = []
  let compCanvas: HTMLCanvasElement | null = null
  let compCtx: CanvasRenderingContext2D | null = null
  let displayCanvas: HTMLCanvasElement | null = null
  let displayCtx: CanvasRenderingContext2D | null = null
  let frameCanvas: HTMLCanvasElement | null = null
  let controlBar: HTMLElement | null = null
  let progressFill: HTMLElement | null = null
  let frameCounter: HTMLElement | null = null
  let playBtn: HTMLButtonElement | null = null
  let prevSnapshot: ImageData | null = null
  let imgEl: HTMLImageElement | null = null
  let dragMoveHandler: ((e: MouseEvent) => void) | null = null
  let dragUpHandler: ((e: MouseEvent) => void) | null = null
  let wasPlayingBeforeDrag = false
  let f1UpdateTimer: ReturnType<typeof setTimeout> | null = null
  let lastTempPath: string | null = null

  function cleanup() {
    destroyed = true
    if (raf) cancelAnimationFrame(raf)
    raf = null
    if (f1UpdateTimer) clearTimeout(f1UpdateTimer)
    f1UpdateTimer = null
    if (displayCanvas?.parentNode) displayCanvas.parentNode.removeChild(displayCanvas)
    if (controlBar?.parentNode) controlBar.parentNode.removeChild(controlBar)
    if (imgEl) imgEl.style.opacity = ''
    if (dragMoveHandler) document.removeEventListener('mousemove', dragMoveHandler)
    if (dragUpHandler) document.removeEventListener('mouseup', dragUpHandler)
    dragMoveHandler = null; dragUpHandler = null
    _gifTogglePlay = null
    frames = []
  }

  const iconPlay = '<svg viewBox="0 0 16 16"><path d="M4 3l9 5-9 5z"/></svg>'
  const iconPause = '<svg viewBox="0 0 16 16"><rect x="4" y="3" width="3" height="10" rx="0.5"/><rect x="9" y="3" width="3" height="10" rx="0.5"/></svg>'
  const iconFirst = '<svg viewBox="0 0 16 16"><path d="M4.5 3v10" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M6 8l7-5v10z"/></svg>'
  const iconLast = '<svg viewBox="0 0 16 16"><path d="M11.5 3v10" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M10 8L3 3v10z"/></svg>'
  const iconPrev = '<svg viewBox="0 0 16 16"><path d="M10 3L5 8l5 5z"/></svg>'
  const iconNext = '<svg viewBox="0 0 16 16"><path d="M6 3l5 5-5 5z"/></svg>'

  function buildControls(footer: HTMLElement) {
    controlBar = document.createElement('div')
    controlBar.className = 'gif-control-bar gif-active'
    const mk = (icon: string, title: string, fn: () => void): HTMLButtonElement => {
      const b = document.createElement('button')
      b.className = 'gif-ctrl-btn'
      b.title = title
      b.innerHTML = icon
      b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); fn(); b.blur() })
      return b
    }
    const btnFirst = mk(iconFirst, tFn('gif.first'), () => seekTo(0))
    const btnPrev = mk(iconPrev, tFn('gif.prev'), () => seekTo(curFrame - 1))
    playBtn = mk(iconPause, tFn('gif.pause'), togglePlay)
    const btnNext = mk(iconNext, tFn('gif.next'), () => seekTo(curFrame + 1))
    const btnLast = mk(iconLast, tFn('gif.last'), () => seekTo(frames.length - 1))
    const track = document.createElement('div')
    track.className = 'gif-progress-track'
    progressFill = document.createElement('div')
    progressFill.className = 'gif-progress-fill'
    track.appendChild(progressFill)
    let dragging = false
    const seekFromEvent = (clientX: number) => {
      if (!frames.length) return
      const rect = track.getBoundingClientRect()
      if (rect.width <= 0) return
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      seekTo(Math.round(ratio * (frames.length - 1)))
    }
    track.addEventListener('mousedown', (e) => {
      e.stopPropagation(); dragging = true; wasPlayingBeforeDrag = playing
      if (playing) togglePlay()
      seekFromEvent(e.clientX)
    })
    dragMoveHandler = (e: MouseEvent) => { if (dragging) { e.stopPropagation(); seekFromEvent(e.clientX) } }
    dragUpHandler = () => { if (dragging) { if (wasPlayingBeforeDrag && !playing) togglePlay(); dragging = false } }
    document.addEventListener('mousemove', dragMoveHandler)
    document.addEventListener('mouseup', dragUpHandler)
    frameCounter = document.createElement('span')
    frameCounter.className = 'gif-frame-counter'
    frameCounter.textContent = '1/1'
    controlBar.appendChild(btnFirst)
    controlBar.appendChild(btnPrev)
    controlBar.appendChild(playBtn)
    controlBar.appendChild(btnNext)
    controlBar.appendChild(btnLast)
    controlBar.appendChild(track)
    controlBar.appendChild(frameCounter)
    footer.insertBefore(controlBar, footer.firstChild)
  }

  function togglePlay() {
    playing = !playing
    if (playBtn) {
      playBtn.innerHTML = playing ? iconPause : iconPlay
      playBtn.title = playing ? tFn('gif.pause') : tFn('gif.play')
    }
    if (playing) {
      nextFrameTime = performance.now() + (frames[curFrame]?.delay || 100)
    } else {
      updateF1Source()
    }
  }
  _gifTogglePlay = togglePlay

  function seekTo(idx: number) {
    if (!frames.length) return
    let n = idx
    if (n < 0) n = 0
    if (n >= frames.length) n = frames.length - 1
    renderFrame(n)
    if (playing) nextFrameTime = performance.now() + (frames[n]?.delay || 100)
    if (!playing) updateF1Source()
  }

  function renderFrame(idx: number) {
    if (!frames.length || !compCtx || !compCanvas) return
    curFrame = idx
    const f = frames[idx]
    if (idx > 0) {
      const prev = frames[idx - 1]
      if (prev.disposalType === 2) {
        compCtx.clearRect(prev.dims.left, prev.dims.top, prev.dims.width, prev.dims.height)
      } else if (prev.disposalType === 3 && prevSnapshot) {
        compCtx.putImageData(prevSnapshot, 0, 0)
      }
    }
    if (f.disposalType === 3) {
      prevSnapshot = compCtx.getImageData(0, 0, compCanvas.width, compCanvas.height)
    }
    if (frameCanvas) {
      frameCanvas.width = f.dims.width
      frameCanvas.height = f.dims.height
      const fctx = frameCanvas.getContext('2d')!
      const imgData = new ImageData(f.patch, f.dims.width, f.dims.height)
      fctx.putImageData(imgData, 0, 0)
      compCtx.drawImage(frameCanvas, f.dims.left, f.dims.top)
    }
  }

  function updateF1Source() {
    if (!compCanvas || destroyed) return
    if (f1UpdateTimer) clearTimeout(f1UpdateTimer)
    f1UpdateTimer = setTimeout(async () => {
      if (destroyed || !compCanvas) return
      try {
        const blob: Blob = await new Promise((resolve) => compCanvas!.toBlob((b) => resolve(b!), 'image/png'))
        const arr = new Uint8Array(await blob.arrayBuffer())
        const tmpPath = await (window as any).picrand.writeTempPng(arr)
        if (destroyed || !tmpPath || !imgEl) return
        lastTempPath = tmpPath
        imgEl.src = 'picrand://get-image?path=' + encodeURIComponent(tmpPath)
        document.dispatchEvent(new CustomEvent('picrand-gif-frame', { detail: { path: tmpPath } }))
      } catch (e) {
        console.error('[gif-lightbox] F1 source update failed', e)
      }
    }, 200)
  }

  function updateDisplay() {
    const v = getViewer()
    const d = v?.imageData
    if (!d || !displayCanvas || !compCanvas) return
    const dw = Math.max(1, Math.round(d.width))
    const dh = Math.max(1, Math.round(d.height))
    if (displayCanvas.width !== dw || displayCanvas.height !== dh) {
      displayCanvas.width = dw
      displayCanvas.height = dh
    }
    displayCanvas.style.left = d.x + 'px'
    displayCanvas.style.top = d.y + 'px'
    displayCanvas.style.width = d.width + 'px'
    displayCanvas.style.height = d.height + 'px'
    if (!displayCtx) displayCtx = displayCanvas.getContext('2d')
    if (displayCtx) {
      displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height)
      displayCtx.drawImage(compCanvas, 0, 0, displayCanvas.width, displayCanvas.height)
    }
  }

  function updateProgress() {
    if (progressFill && frames.length > 1) {
      const pct = (curFrame / (frames.length - 1)) * 100
      progressFill.style.width = pct + '%'
    } else if (progressFill) {
      progressFill.style.width = '0%'
    }
    if (frameCounter && frames.length) {
      frameCounter.textContent = (curFrame + 1) + '/' + frames.length
    }
  }

  function tick() {
    if (destroyed) return
    const now = performance.now()
    if (playing && now >= nextFrameTime && frames.length > 1) {
      let next = curFrame + 1
      if (next >= frames.length) next = 0
      renderFrame(next)
      nextFrameTime = now + (frames[next]?.delay || 100)
    }
    updateDisplay()
    updateProgress()
    raf = requestAnimationFrame(tick)
  }

  async function init() {
    try {
      const raw = await (window as any).picrand.readFileBuffer(filePath)
      if (!raw || destroyed) return
      const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
      if (destroyed) return
      const parsed = parseGIF(buf)
      const all = decompressFrames(parsed, true)
      if (!all || !all.length) { cleanup(); return }
      frames = all
      const w = parsed.lsd.width, h = parsed.lsd.height
      compCanvas = document.createElement('canvas')
      compCanvas.width = w; compCanvas.height = h
      compCtx = compCanvas.getContext('2d')
      frameCanvas = document.createElement('canvas')
      const footer = container.querySelector('.viewer-footer')
      if (footer) buildControls(footer as HTMLElement)
      const vc = container.querySelector('.viewer-canvas') as HTMLElement | null
      if (vc) {
        displayCanvas = document.createElement('canvas')
        displayCanvas.className = 'gif-display-canvas'
        displayCanvas.style.cssText = 'position:absolute;pointer-events:none'
        vc.appendChild(displayCanvas)
        imgEl = vc.querySelector('img')
        if (imgEl) imgEl.style.opacity = '0'
      }
      if (frames.length <= 1) {
        playing = false
        if (playBtn) { playBtn.innerHTML = iconPlay; playBtn.title = tFn('gif.play') }
      }
      renderFrame(0)
      nextFrameTime = performance.now() + (frames[0]?.delay || 100)
      if (!playing) updateF1Source()
      raf = requestAnimationFrame(tick)
    } catch (e) {
      console.error('[gif-lightbox] init failed', e)
      if (controlBar) controlBar.remove()
      cleanup()
    }
  }

  init()
  return cleanup
}
function openLightbox(img: ImageItem) {
  lbCleanup()
  const items = lightboxOrder.value
  const total = items.length
  let curIdx = Math.max(0, items.findIndex(i => i.file_path === img.file_path))

  function showOne(idx: number) {
    curIdx = idx
    const current = items[curIdx]
    const url = 'picrand://get-image?path=' + encodeURIComponent(current.file_path)

    if (_lbKeyFn) { document.removeEventListener('keydown', _lbKeyFn, true); _lbKeyFn = null }
    if (_lbViewerRef) { lbCleanupViewer(); _lbViewerRef = null }

    // 预加载相邻 3 张原图：下一次切换时浏览器从内存/磁盘缓存命中，无需等待 picrand:// 协议重新请求
    for (let delta = -3; delta <= 3; delta++) {
      if (delta === 0) continue
      const adj = curIdx + delta
      if (adj < 0 || adj >= total) continue
      const adjItem = items[adj]
      if (!adjItem) continue
      const ext = (adjItem.file_path || '').slice(((adjItem.file_path || '').lastIndexOf('.'))).toLowerCase()
      if (ext === '.psd' || isVideoExt(adjItem.file_path)) continue
      if (adjItem.file_size > 0 && adjItem.file_size > 16 * 1024 * 1024) continue // 不预加载超过 16MB 的图
      const adjUrl = 'picrand://get-image?path=' + encodeURIComponent(adjItem.file_path)
      const el = new Image()
      el.src = adjUrl
      _lbPreloadEls.push(el)
    }

    _lbKeyFn = (ev: KeyboardEvent) => {
      if (!_lbViewerRef) return
      if (ev.key === 'F1') { ev.preventDefault(); if (props.f1PanelVisible) emit('f1-close'); else emit('open-f1', items[curIdx]); return }
      if (ev.key === ' ' || ev.code === 'Space') { ev.preventDefault(); ev.stopPropagation(); if (_gifTogglePlay) _gifTogglePlay(); return }
      if (ev.key === 'Escape') { _lbViewerRef.hide(); return }
      if (ev.key === 'Enter') {
        const cur = items[curIdx]
        if (cur && isVideoExt(cur.file_path)) { ev.preventDefault(); ev.stopPropagation(); window.picrand.openWithDefault(cur.file_path); return }
      }
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return
      ev.stopPropagation(); ev.stopImmediatePropagation()
      if (ev.repeat) { const n = Date.now(); if (n - _lbLastNav < 140) return; _lbLastNav = n }
      if (ev.key === 'ArrowLeft' && curIdx > 0) showOne(curIdx - 1)
      else if (ev.key === 'ArrowRight' && curIdx < total - 1) showOne(curIdx + 1)
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') showToast(t('gallery.atEnd'))
    }
    document.addEventListener('keydown', _lbKeyFn, true)

    _lbViewerRef = viewerApi({
      options: {
        ...createViewerOptions(0, current.file_path, () => _lbViewerRef),
        keyboard: false,
        toolbar: { ...createViewerOptions(0, current.file_path, () => _lbViewerRef).toolbar, play: { show: true, click: () => {
          const cur = curIdx
          lbCleanup()
          startSlideshow(items, cur, (lastIdx) => { openLightbox(items[lastIdx]) })
        } } },
        shown() {
          const c = document.querySelector('.viewer-container')
          if (!c) return
          const canvas = c.querySelector('.viewer-canvas') as HTMLElement | null
          canvas?.addEventListener('mousedown', (ev) => { if (ev.button === 1) { ev.preventDefault(); const rb = c.querySelector('.viewer-reset') as HTMLElement | null; rb?.click() } })
          c.addEventListener('contextmenu', (ev) => { ev.preventDefault(); _lbViewerRef?.hide() })
          // ====== 像素网格叠加 ======
          const gridCanvas = document.createElement('canvas')
          gridCanvas.className = 'pixel-grid'
          gridCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5'
          c.appendChild(gridCanvas)
          const gridCtx = gridCanvas.getContext('2d')!
          let _tick: any = null
          const _startPoll = () => {
            if (_tick) return
            const poll = () => {
              const imgData = _lbViewerRef?.imageData
              const ratio = imgData?.ratio || 1
              const cw = c.clientWidth, ch = c.clientHeight
              if (gridCanvas.width !== cw || gridCanvas.height !== ch) { gridCanvas.width = cw; gridCanvas.height = ch }
              gridCtx.clearRect(0, 0, cw, ch)
              if (ratio >= 3) {
                const viewerImg = canvas?.querySelector('img') as HTMLImageElement | null
                if (viewerImg) viewerImg.style.setProperty('image-rendering', 'pixelated', 'important')
                const ox = ((imgData?.x || 0) % ratio + ratio) % ratio
                const oy = ((imgData?.y || 0) % ratio + ratio) % ratio
                gridCtx.strokeStyle = 'rgba(255,255,255,0.2)'; gridCtx.lineWidth = 0.5
                for (let x = ox; x < cw; x += ratio) { gridCtx.beginPath(); gridCtx.moveTo(x, 0); gridCtx.lineTo(x, ch); gridCtx.stroke() }
                for (let y = oy; y < ch; y += ratio) { gridCtx.beginPath(); gridCtx.moveTo(0, y); gridCtx.lineTo(cw, y); gridCtx.stroke() }
              } else {
                const viewerImg = canvas?.querySelector('img') as HTMLImageElement | null
                if (viewerImg) viewerImg.style.setProperty('image-rendering', '')
              }
              _tick = requestAnimationFrame(poll)
            }
            _tick = requestAnimationFrame(poll)
          }
          setTimeout(_startPoll, 300)
          c.addEventListener('hidden', () => { if (_tick) cancelAnimationFrame(_tick); gridCanvas.remove() }, { once: true })
          const hookBtn = (sel: string, dir: number) => {
            const btn = c.querySelector(sel) as HTMLElement | null
            if (!btn) return
            btn.addEventListener('click', (ev: Event) => {
              ev.stopPropagation(); ev.stopImmediatePropagation()
              const target = curIdx + dir
              if (target >= 0 && target < total) showOne(target)
              else showToast(t('gallery.atEnd'))
            }, { capture: true })
          }
          hookBtn('.viewer-prev', -1)
          hookBtn('.viewer-next', 1)
          // ====== 右下角 F1 按钮（镜像右上角关闭按钮，点击等同按 F1 打开/关闭审计面板） ======
          const f1Btn = document.createElement('button')
          f1Btn.className = 'viewer-f1-btn'
          f1Btn.setAttribute('aria-label', 'F1')
          f1Btn.title = 'F1'
          f1Btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="10" x2="12.9" y2="10"/><line x1="4" y1="14" x2="20" y2="14"/><line x1="4" y1="18" x2="12.9" y2="18"/></svg>'
          f1Btn.addEventListener('click', (ev: Event) => {
            ev.preventDefault(); ev.stopPropagation()
            if (props.f1PanelVisible) emit('f1-close'); else emit('open-f1', items[curIdx])
          })
          c.appendChild(f1Btn)
          c.addEventListener('hidden', () => f1Btn.remove(), { once: true })
          // GIF 动图帧控制
          console.log('[lightbox] shown callback, file:', current.file_path, 'isGif:', /\.gif$/i.test(current.file_path))
          if (/\.gif$/i.test(current.file_path)) {
            _gifLbCleanup = setupGifLightbox(c, () => _lbViewerRef, current.file_path, t)
          }
          // ====== 视频：跟随图片缩放的居中播放角标 + 右下角"shift：（图标）"提示 + Enter 外播 ======
          if (isVideoExt(current.file_path)) {
            const playOverlay = document.createElement('div')
            playOverlay.className = 'lb-video-play-overlay'
            playOverlay.style.cssText = 'position:absolute;left:0;top:0;width:84px;height:84px;border-radius:50%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:6;transform-origin:center center'
            playOverlay.innerHTML = '<svg width="44" height="44" viewBox="0 0 24 24" fill="white"><polygon points="7 4 22 12 7 20"/></svg>'
            c.appendChild(playOverlay)
            // 右下角文本提示：shift：（播放图标）+ 半透明黑底
            const tipBox = document.createElement('div')
            tipBox.className = 'lb-video-tip'
            tipBox.style.cssText = 'position:absolute;left:0;top:0;z-index:6;pointer-events:none;display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(0,0,0,0.55);color:#fff;font:12px/1 system-ui,sans-serif;white-space:nowrap'
            tipBox.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px"><span style="display:inline-block;padding:1px 6px;border:1px solid rgba(255,255,255,0.85);border-radius:3px;font-size:11px;line-height:1.4">Enter</span><span>:</span>${t('gallery.videoPlayHint')}</span>`
            c.appendChild(tipBox)
            // 轮询 imageData，让角标与文本跟随图片位置/缩放
            let vidTick: any = null
            const updatePos = () => {
              const d = _lbViewerRef?.imageData
              if (d) {
                const cx = (d.x || 0) + (d.width || 0) / 2
                const cy = (d.y || 0) + (d.height || 0) / 2
                playOverlay.style.transform = `translate(${cx - 42}px, ${cy - 42}px)`
                // 文本块贴图片右下角内侧（无边距）
                const tw = tipBox.offsetWidth || 90
                const th = tipBox.offsetHeight || 22
                const tx = (d.x || 0) + (d.width || 0) - tw
                const ty = (d.y || 0) + (d.height || 0) - th
                tipBox.style.transform = `translate(${tx}px, ${ty}px)`
              }
              vidTick = requestAnimationFrame(updatePos)
            }
            vidTick = requestAnimationFrame(updatePos)
            c.addEventListener('hidden', () => {
              if (vidTick) cancelAnimationFrame(vidTick)
              playOverlay.remove()
              tipBox.remove()
            }, { once: true })
          }
        },
      },
      images: [url],
    })

    _lbViewerRef.element?.addEventListener('hidden', () => { lbCleanup() }, { once: true })
  }

  showOne(curIdx)
}

// ====== chokidar 增量热更新 ======
// 视频海报后台逐张回写（thumb-update）频率高且每条都会触发 store 全量拷贝 + 布局 watch 全量重建。
// 此处攒批 + 200ms 节流，把 N 次全量重建合并为一次批量更新，打断"每张海报一次 O(N) 风暴"的链路。
let _pendingThumbUpdates = new Map<string, string>()
let _thumbFlushTimer: ReturnType<typeof setTimeout> | null = null
function _flushThumbUpdates() {
  _thumbFlushTimer = null
  if (!_pendingThumbUpdates.size) return
  const batch = Array.from(_pendingThumbUpdates, ([filePath, thumbnailPath]) => ({ filePath, thumbnailPath }))
  _pendingThumbUpdates = new Map()
  gallery.updateThumbnailsBatch(batch)
}

function handleDbSync(data: any) {
  if (data?.type === 'add' && data?.image) {
    if (!isExtEnabled(data.image.file_path, gallery.formatFilter)) return  // 格式筛选：禁用格式不入池
    gallery.insertImageInPlace(data.image)
  } else if (data?.type === 'unlink' && data?.path) {
    gallery.removeImageByPath(data.path)
    // 移除布局中的对应项
    positionedItems.value = positionedItems.value.filter(pi => pi.img.file_path !== data.path)
    _knownPaths.delete(data.path)
  } else if (data?.type === 'change' && data?.path) {
    window.picrand.generateThumbnail(data.path).then((result: any) => {
      const tp = result?.thumbnail_path || result
      gallery.updateImageMeta(data.path, {
        thumbnail_path: typeof tp === 'string' ? tp : '',
        ...(result?.width ? { width: result.width, height: result.height || 0 } : {}),
      })
    })
  } else if (data?.type === 'thumb-update' && data?.file_path) {
    // scan-folder 后台视频海报生成完毕 → 攒批节流刷新缩略图路径，避免逐张全量重建拖垮滚动
    if (data.thumbnail_path) {
      _pendingThumbUpdates.set(data.file_path, data.thumbnail_path)
      if (!_thumbFlushTimer) _thumbFlushTimer = setTimeout(_flushThumbUpdates, 200)
    }
  }
}

// ====== 哨兵触发分页 ======
const emit = defineEmits(['load-more', 'start-drift', 'open-f1', 'f1-close', 'open-folder', 'open-folder-selector', 'open-favorites', 'toggle-pinboard'])
const props = defineProps<{ f1PanelVisible?: boolean }>()
let sentinelObserver: IntersectionObserver | null = null

// 按需加载：只有进入窄视口（±150px）的图片才真正发起 picrand:// 请求。
// 历史上 visibleItems 含 1000/5000px 缓冲区，buffer 里的 <img> 也全部 setSrc，
// 翻阅一次涌入 200+ 请求把主进程 libuv 线程池灌满，getImagesPage IPC 排队秒级。
// 现在 buffer 区图片 src 留空，真正接近视口时由 observer 置入 set 触发加载。
const inViewPaths = ref<Set<string>>(new Set())
let imgObserver: IntersectionObserver | null = null
function shouldLoadThumb(fp: string): boolean { return inViewPaths.value.has(fp) }

function initSentinels() {
  sentinelObserver = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) emit('load-more')
  }, { root: scrollContainer.value, rootMargin: '0px 0px 5000px 0px' })
  observeNewSentinels()
}

function observeNewSentinels() {
  if (!sentinelObserver || !scrollContainer.value) return
  scrollContainer.value.querySelectorAll('.column-sentinel:not([data-so])').forEach(el => {
    el.setAttribute('data-so', '1')
    sentinelObserver!.observe(el)
  })
}

// 观察所有 .gallery-item 进入窄视口，按需触发缩略图加载。
// 同时清出已滚出 visibleItems 大缓冲区的 path，避免 inViewPaths 无限增长。
function observeGalleryItems() {
  if (!imgObserver || !scrollContainer.value) return
  scrollContainer.value.querySelectorAll('.gallery-item:not([data-io])').forEach(el => {
    el.setAttribute('data-io', '1')
    imgObserver!.observe(el)
  })
}

// 按当前列数重建缩略图懒加载观察器。IntersectionObserver.rootMargin 是只读属性，
// 列数变化导致缓冲区收窄/放宽时必须重建才能生效。重建后清掉旧 data-io 标记并重新观察全部 item，
// 让仍在视口内的路径被保留、已滚出窄边距的路径被移除。
function resetImgObserver() {
  if (!scrollContainer.value) return
  if (imgObserver) imgObserver.disconnect()
  const above = LOAD_BUFFER_ABOVE.value
  const below = LOAD_BUFFER_BELOW.value
  imgObserver = new IntersectionObserver((entries) => {
    let changed = false
    for (const e of entries) {
      // .gallery-item 上有 :data-fp 绑定（见模板），observer 直接读
      const fp = (e.target as HTMLElement).dataset?.fp
      if (!fp) continue
      if (e.isIntersecting && !inViewPaths.value.has(fp)) {
        if (!changed) { inViewPaths.value = new Set(inViewPaths.value); changed = true }
        inViewPaths.value.add(fp)
      } else if (!e.isIntersecting && inViewPaths.value.has(fp)) {
        if (!changed) { inViewPaths.value = new Set(inViewPaths.value); changed = true }
        inViewPaths.value.delete(fp)
      }
    }
  }, { root: scrollContainer.value, rootMargin: `${above}px 0px ${below}px 0px`, threshold: 0 })
  scrollContainer.value.querySelectorAll('.gallery-item[data-io]').forEach(el => el.removeAttribute('data-io'))
  observeGalleryItems()
}

// 列数变化 → 缓冲区缩放因子变化 → 懒加载边距随之收窄/放宽，需要重建观察器
watch([LOAD_BUFFER_ABOVE, LOAD_BUFFER_BELOW], () => resetImgObserver())

// ====== 滚动驱动虚拟切片（30ms 防抖，平衡流畅度和 CPU） ======
let _scrollTimer: ReturnType<typeof setTimeout> | null = null
let _lastScrollTop = 0
let _lastContainerHeight = 0

// scrollTop/containerHeight 每帧同步（visibleItems computed 依赖两者），
// 防抖仅用于 scrollProgress/_scrollRatio 等非响应式记账，避免频繁触发重算。
function _syncScrollReactive() {
  const el = scrollContainer.value
  if (!el) return
  scrollTop.value = el.scrollTop
  containerHeight.value = el.clientHeight
}

function updateVisibleRange() {
  const el = scrollContainer.value
  if (!el) return
  const st = el.scrollTop
  const ch = el.clientHeight
  if (st !== _lastScrollTop || ch !== _lastContainerHeight) {
    _lastScrollTop = st
    _lastContainerHeight = ch
    const all = positionedItems.value
    const total = gallery.totalImages
    if (all.length > 0 && total > 0) {
      const bottomEdge = st + ch
      let lastIdx = all.length - 1
      for (let i = all.length - 1; i >= 0; i--) {
        if (all[i].top < bottomEdge) { lastIdx = i; break }
      }
      gallery.scrollProgress = Math.round(((lastIdx + 1) / total) * 100)
      if (totalHeight.value > 0) gallery._scrollRatio = st / totalHeight.value
    }
  }
}

function onScroll() {
  _probeScrollTick()
  _syncScrollReactive() // 每帧同步，不防抖——保证自动滚动/鼠标滚轮高速翻页时 visibleItems 不滞后
  if (!_scrollTimer) updateVisibleRange()
  if (_scrollTimer) clearTimeout(_scrollTimer)
  _scrollTimer = setTimeout(() => {
    _scrollTimer = null
    updateVisibleRange()
  }, 30)
}

// === 性能探针 ===
// 记录滚动事件间隔分布和滚动期间关键状态，落盘到 perf-probe.log 诊断快速翻动卡顿
let _probeLastScrollTs = 0
let _probeScrollSamples = 0
let _probeScrollMaxGap = 0
const _probeScrollGaps: number[] = []
function _probeScrollTick() {
  const now = (typeof performance !== 'undefined') ? performance.now() : Date.now()
  if (_probeLastScrollTs > 0) {
    const gap = now - _probeLastScrollTs
    _probeScrollGaps.push(gap)
    if (gap > _probeScrollMaxGap) _probeScrollMaxGap = gap
    _probeScrollSamples++
  }
  _probeLastScrollTs = now
  // 每 30 个样本上报一次采样统计，避免日志爆炸
  if (_probeScrollSamples >= 30) {
    const gaps = _probeScrollGaps
    gaps.sort((a, b) => a - b)
    const p50 = gaps[Math.floor(gaps.length * 0.5)] | 0
    const p95 = gaps[Math.floor(gaps.length * 0.95)] | 0
    const p100 = _probeScrollMaxGap | 0
    try { window.picrand.perfProbe?.({ k: 'scroll', n: _probeScrollSamples, p50, p95, p100, imgs: gallery.images.length, pos: positionedItems.value.length, st: scrollTop.value, th: totalHeight.value }) } catch {}
    _probeScrollSamples = 0; _probeScrollGaps.length = 0; _probeScrollMaxGap = 0
  }
}

// ====== 生命周期 ======
let _mutObs: MutationObserver | null = null

let _scrollToHandler: ((e: Event) => void) | null = null
let _onKeydownCopy: ((e: KeyboardEvent) => void) | null = null
let _onKeydownPaste: ((e: KeyboardEvent) => void) | null = null
let _onKeydownSelectAll: ((e: KeyboardEvent) => void) | null = null
let _onKeydownDelete: ((e: KeyboardEvent) => void) | null = null
let _onKeydownArrowBlock: ((e: KeyboardEvent) => void) | null = null
let _onKeyupArrow: ((e: KeyboardEvent) => void) | null = null
let _arrowScrollDir = 0
let _arrowScrollRaf: number | null = null
onMounted(() => {
  loadDashboard()
  _lastOpenedTimer = setInterval(() => { nowTick.value++ }, 30000)
  window.picrand.onDbSync(handleDbSync)
  document.addEventListener('picrand-dashboard-refresh', loadDashboard)

  // 渲染帧心跳探针：rAF 间隔若长期 > 200ms 说明渲染线程/合成线程长任务卡顿
  let _rafId = 0
  {
    let _rafLast = (typeof performance !== 'undefined') ? performance.now() : Date.now()
    let _rafPending = 0  // 连续卡顿帧数
    const _rafTick = () => {
      const now = (typeof performance !== 'undefined') ? performance.now() : Date.now()
      const gap = now - _rafLast
      _rafLast = now
      if (gap > 200) {
        _rafPending++
        // 连续 5 帧卡顿（约 1 秒+）才上报，避免偶发抖动；上报时附连续卡顿帧数
        if (_rafPending >= 5) {
          try { window.picrand.perfProbe?.({ k: 'raf-stall', gap: gap | 0, frames: _rafPending }) } catch {}
        }
      } else if (_rafPending > 0) {
        try { window.picrand.perfProbe?.({ k: 'raf-recover', stalledFrames: _rafPending }) } catch {}
        _rafPending = 0
      }
      _rafId = requestAnimationFrame(_rafTick)
    }
    _rafId = requestAnimationFrame(_rafTick)
  }
  _scrollToHandler = (e: Event) => {
    const path = (e as CustomEvent).detail?.path
    if (!path) return
    nextTick(() => {
      const pi = positionedItems.value.find(p => p.img.file_path === path)
      if (pi && scrollContainer.value) scrollContainer.value.scrollTop = pi.top - GAP_PADDING
    })
  }
  document.addEventListener('picrand-scroll-to', _scrollToHandler)
  document.addEventListener('picrand-release-preloads', releasePreloads)
  document.addEventListener('click', closeImageMenu)

  // Ctrl+C 复制: 多选复制路径文本, 单选复制图片数据
  _onKeydownCopy = (ev: KeyboardEvent) => {
    if (ev.key === 'c' && (ev.ctrlKey || ev.metaKey) && !ev.repeat) {
      // 灯箱中不处理（灯箱有自己的键盘逻辑）
      if (document.querySelector('.viewer-container')) return
      // 输入框内不处理
      if ((ev.target as HTMLElement)?.tagName === 'INPUT' || (ev.target as HTMLElement)?.tagName === 'TEXTAREA') return
      // 用户有文本选中时不拦截（如 ContextPanel 的路径/元数据），交给浏览器原生 Ctrl+C
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed && sel.toString().trim()) return

      // Ctrl+C: 复制文件（CF_HDROP）
      const paths = selectedPaths.value.size > 1
        ? [...selectedOrder.value]
        : gallery.activeImage?.file_path ? [gallery.activeImage.file_path] : []
      if (paths.length) {
        window.picrand.copyFilesToClipboard?.(paths)
        showToast(t('gallery.filesCopied', { n: paths.length }))
      }
    }
  }
  document.addEventListener('keydown', _onKeydownCopy)

  // Ctrl+V 粘贴文件进当前文件夹
  _onKeydownPaste = (ev: KeyboardEvent) => {
    if (ev.key === 'v' && (ev.ctrlKey || ev.metaKey) && !ev.repeat) {
      if (document.querySelector('.viewer-container')) return
      if ((ev.target as HTMLElement)?.tagName === 'INPUT' || (ev.target as HTMLElement)?.tagName === 'TEXTAREA') return
      if (!gallery.folderPath) return

      const IMG = new Set(['jpg','jpeg','png','gif','bmp','webp','tiff','tif','avif','svg','psd','heic','heif'])
      const VID = new Set(['mp4','webm','mov','avi','mkv','wmv','flv','m4v'])
      const ALL = new Set([...IMG, ...VID])

      window.picrand.readClipboardFiles?.().then(files => {
        // PowerShell GetFileDropList 偶尔返回空数组（OLE 超时/线程模型冲突），
        // 不 toast '0 张' 让用户以为复制失效——静默忽略即可
        if (!files.length) return
        const ok = files.filter(f => ALL.has(f.split('.').pop()?.toLowerCase() || ''))
        if (!ok.length) { showToast(t('gallery.noPasteFiles')); return }
        window.picrand.importImagesToFolder?.(ok, gallery.folderPath).then(r => {
          if (r?.ok) showToast(t('toast.importedImages', { count: r.copied }))
        })
      }).catch(() => {})
    }
  }
  document.addEventListener('keydown', _onKeydownPaste)

  // Ctrl+A 全选：一次性选中瀑布流中所有已加载图片
  _onKeydownSelectAll = (ev: KeyboardEvent) => {
    if (ev.key === 'a' && (ev.ctrlKey || ev.metaKey) && !ev.repeat) {
      if (document.querySelector('.viewer-container, .picrand-slideshow')) return
      if ((ev.target as HTMLElement)?.tagName === 'INPUT' || (ev.target as HTMLElement)?.tagName === 'TEXTAREA') return
      const all = gallery.sortedImages
      if (!all.length) return
      selectedPaths.value = new Set(all.map(i => i.file_path))
      selectedOrder.value = all.map(i => i.file_path)
      showToast(t('gallery.filesCopied', { n: all.length }))
      ev.preventDefault()
    }
  }
  document.addEventListener('keydown', _onKeydownSelectAll)

  // Delete 键：删除选中的图片（单选或多选）
  _onKeydownDelete = (ev: KeyboardEvent) => {
    if (ev.key === 'Delete' && !ev.repeat) {
      if (document.querySelector('.viewer-container, .picrand-slideshow')) return
      if ((ev.target as HTMLElement)?.tagName === 'INPUT' || (ev.target as HTMLElement)?.tagName === 'TEXTAREA') return
      const targets = selectedPaths.value.size > 1
        ? selectedOrder.value
        : gallery.activeImage?.file_path ? [gallery.activeImage.file_path] : []
      if (!targets.length) return
      // 触发自定义事件，由 ContextPanel 的删除确认 Modal 统一处理
      document.dispatchEvent(new CustomEvent('picrand-delete-request', { detail: { paths: targets } }))
    }
  }
  document.addEventListener('keydown', _onKeydownDelete)

  // 上下方向键 RAF 滚动：单按/长按同一速度，匀速平滑
  const _ARROW_SPEED = 480 // px/s

  function _ensureArrowRaf() {
    if (_arrowScrollRaf !== null) return
    const el = scrollContainer.value
    if (!el) return
    let lastT = 0
    function tick(t: number) {
      if (!_arrowScrollDir) { _arrowScrollRaf = null; return }
      const dt = lastT ? (t - lastT) / 1000 : 0
      lastT = t
      if (dt > 0 && dt < 0.1) {
        el!.scrollTop += _arrowScrollDir * _ARROW_SPEED * Math.min(dt, 1 / 30)
      }
      _arrowScrollRaf = requestAnimationFrame(tick)
    }
    _arrowScrollRaf = requestAnimationFrame(tick)
  }

  _onKeydownArrowBlock = (ev: KeyboardEvent) => {
    if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return
    if (document.querySelector('.viewer-container, .picrand-slideshow')) return
    if ((ev.target as HTMLElement)?.tagName === 'INPUT' || (ev.target as HTMLElement)?.tagName === 'TEXTAREA') return
    ev.preventDefault()
    if (ev.repeat) return
    _arrowScrollDir = ev.key === 'ArrowUp' ? -1 : 1
    _ensureArrowRaf()
  }
  document.addEventListener('keydown', _onKeydownArrowBlock)

  const _onKeyupArrow = (ev: KeyboardEvent) => {
    if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return
    const dir = ev.key === 'ArrowUp' ? -1 : 1
    if (_arrowScrollDir !== dir) return
    _arrowScrollDir = 0
    if (_arrowScrollRaf !== null) { cancelAnimationFrame(_arrowScrollRaf); _arrowScrollRaf = null }
  }
  document.addEventListener('keyup', _onKeyupArrow)

  const _onWinStateChanged = (state: any) => {
    if (state === 'restored') {
      // 恢复时强制刷新可见范围
      updateVisibleRange()
    }
  }
  window.picrand.onWindowStateChanged(_onWinStateChanged)

  if (scrollContainer.value) {
    initSentinels()
    updateVisibleRange()
    scrollContainer.value.addEventListener('scroll', onScroll, { passive: true })

    // Shift+wheel -> horizontal scroll (blocked by overflow-x:hidden); Ctrl+wheel -> page zoom
    const _wheelFix = (ev: WheelEvent) => {
      if (ev.ctrlKey || ev.shiftKey) {
        ev.preventDefault()
        const el = scrollContainer.value
        if (el) el.scrollTop += ev.deltaY
      }
    }
    scrollContainer.value.addEventListener('wheel', _wheelFix, { passive: false })

    _resizeObserver = new ResizeObserver(() => {
      const el = scrollContainer.value
      if (el) containerWidth.value = el.clientWidth
      updateVisibleRange()
    })
    _resizeObserver.observe(scrollContainer.value)

    // 按需加载：观察 .gallery-item 是否进入按列数动态收窄的窄视口，进入则把 path 加入 inViewPaths 触发 <img> setSrc。
    // 离开时移除 path，让 Chromium 释放对应纹理缓存，避免翻阅越深内存越高。
    resetImgObserver()

    // MutationObserver: 监听 masonry-container 内 sentinel 与 gallery-item 的新增
    _mutObs = new MutationObserver(() => nextTick(() => { observeNewSentinels(); observeGalleryItems() }))
    _mutObs.observe(scrollContainer.value, { childList: true, subtree: true })

    nextTick(() => { observeNewSentinels(); observeGalleryItems() })
  }
})

onUnmounted(() => {
  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = 0 }
  if (_scrollToHandler) document.removeEventListener('picrand-scroll-to', _scrollToHandler)
  document.removeEventListener('picrand-release-preloads', releasePreloads)
  document.removeEventListener('picrand-dashboard-refresh', loadDashboard)
  document.removeEventListener('click', closeImageMenu)
  document.removeEventListener('keydown', _onKeydownCopy!)
  document.removeEventListener('keydown', _onKeydownPaste!)
  document.removeEventListener('keydown', _onKeydownSelectAll!)
  document.removeEventListener('keydown', _onKeydownDelete!)
  document.removeEventListener('keydown', _onKeydownArrowBlock!)
  document.removeEventListener('keyup', _onKeyupArrow!)
  if (_arrowScrollRaf !== null) { cancelAnimationFrame(_arrowScrollRaf); _arrowScrollRaf = null }
  sentinelObserver?.disconnect()
  imgObserver?.disconnect()
  _resizeObserver?.disconnect()
  _mutObs?.disconnect()
  if (_scrollTimer) { clearTimeout(_scrollTimer); _scrollTimer = null }
  if (_thumbFlushTimer) { clearTimeout(_thumbFlushTimer); _thumbFlushTimer = null; _pendingThumbUpdates = new Map() }
  if (_lastOpenedTimer) { clearInterval(_lastOpenedTimer); _lastOpenedTimer = null }
  scrollContainer.value?.removeEventListener('scroll', onScroll)
})
</script>

<style scoped>
.gallery-canvas {
  position: absolute;
  top: 48px; left: 0; right: 320px; bottom: var(--pinboard-height, 38px);
  overflow-y: auto; overflow-x: hidden;
  scrollbar-gutter: stable;
  padding: 12px;
}

.hint {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  height: 100%; gap: 12px;
  color: var(--text-hint); font-size: 15px;
  animation: dashFadeIn 0.2s ease-out;
}
.hint.scanning { animation: none; }
@keyframes dashFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.dashboard {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  margin-bottom: 24px;
  padding: 20px 28px;
  border: 2px solid color-mix(in srgb, var(--text-muted) 50%, transparent);
  width: 100%; max-width: 420px;
}
.dash-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 16px 40px;
}
.dash-item {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 8px 20px; border-radius: 10px; cursor: default;
  transition: background 0.15s; min-width: 80px;
}
.dash-item:hover { background: var(--bg-hover); }
.dash-disabled { cursor: default; opacity: 0.35; }
.dash-disabled:hover { background: transparent; }
.dash-val {
  font-size: 36px; font-weight: 600; color: var(--text-primary); letter-spacing: 1px;
}
.dash-label {
  font-size: 12px; color: var(--text-muted); letter-spacing: 0.5px;
}
.dash-last {
  margin-top: 4px; padding-top: 10px;
  border-top: 1px solid var(--border-light);
  width: 100%; text-align: center;
}
.dash-last .dash-label {
  font-size: 12px; color: var(--text-muted);
}
.recent-folders {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  max-width: 420px; width: 100%;
}
.recent-title {
  font-size: 13px; color: var(--text-muted); margin-bottom: 4px;
}
.recent-folder-item {
  display: flex; align-items: center; gap: 8px;
  width: 100%; padding: 6px 14px; border-radius: 8px;
  cursor: pointer; font-size: 13px; color: var(--text-secondary);
  background: var(--path-bg);
  transition: background 0.12s;
}
.recent-folder-item:hover { background: var(--path-bg-hover); color: var(--text-primary); }
.rf-icon { font-size: 16px; flex-shrink: 0; }
.rf-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rf-count { font-size: 12px; color: var(--text-muted); flex-shrink: 0; }

/* 瀑布流容器：position: relative 让绝对定位的 item 相对于它 */
.masonry-container {
  position: relative;
  width: 100%;
}

.gallery-item {
  overflow: hidden;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.03);
  box-shadow: var(--pic-shadow);
}

.gallery-item-selected {
  outline: 2px solid #4fc3f7;
  outline-offset: -2px;
  box-shadow: 0 0 18px 2px rgba(79, 195, 247, 0.8), 0 0 6px rgba(79, 195, 247, 0.9);
}

.selection-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 27px;
  height: 18px;
  background: rgba(0, 0, 0, 0.65);
  border-radius: 0;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
  pointer-events: none;
  z-index: 3;
}

.gallery-img {
  width: 100%;
  height: 100%;
  display: block;
  opacity: 0;
  transition: opacity 0.10s ease;
}
.gallery-img.loaded {
  opacity: 1;
}

.fav-badge {
  position: absolute;
  bottom: 4px; right: 4px;
  font-size: 22px; line-height: 1;
  color: #e74c3c;
  text-shadow: 0 0 3px rgba(0,0,0,0.6);
  pointer-events: none;
  z-index: 2;
}

.video-play-badge {
  position: absolute;
  bottom: 6px; left: 6px;
  width: 26px; height: 26px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  display: flex; align-items: center; justify-content: center;
  color: #fff;
  pointer-events: none;
  z-index: 2;
}
.video-play-badge svg { margin-left: 2px; }

.hover-overlay {
  position: absolute; bottom: 0; left: 0; right: 0;
  height: 40px;
  display: flex; align-items: flex-end; justify-content: flex-end;
  padding: 6px 8px; opacity: 0; transition: opacity 0.15s ease;
  pointer-events: none;
}
[data-theme="dark"] .hover-overlay, [data-theme="glass"] .hover-overlay {
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
}
[data-theme="light"] .hover-overlay {
  background: linear-gradient(transparent, rgba(255, 255, 255, 0.85));
}
[data-theme="light"] .hover-overlay::after { color: rgba(0, 0, 0, 0.75); }
/* 亮系玻璃：文字与背景同走浅色，避免深字压深色渐变看不清 */
[data-theme="glass"][data-glass-tone="light"] .hover-overlay {
  background: linear-gradient(transparent, rgba(255, 255, 255, 0.85));
}
[data-theme="glass"][data-glass-tone="light"] .hover-overlay::after { color: rgba(0, 0, 0, 0.75); }
.hover-overlay::after {
  content: attr(data-info);
  color: var(--text-primary); font-size: 11px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 100%;
}
.gallery-item:hover .hover-overlay { opacity: 1; }

.progress-bar-wrap {
  position: absolute; bottom: 0; left: 0; right: 0;
  height: 3px; background: var(--progress-track);
}
.progress-bar {
  height: 100%;
  background: var(--progress-fill);
  transition: width 0.3s ease;
}

.image-context-menu {
  position: fixed;
  z-index: 20000;
  min-width: 160px;
  background: var(--bg-panel-solid);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 4px 0;
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
}
.image-context-item {
  padding: 8px 12px;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
}
.image-context-item:hover { background: var(--bg-hover); }
.image-context-item.danger { color: #e81123; }
.image-context-item.danger:hover { background: rgba(232,17,35,0.12); }
.gallery-toast {
  position: fixed;
  bottom: calc(var(--pinboard-height, 38px) + 18px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-toast);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  z-index: 20000;
  pointer-events: none;
}
.column-sentinel { height: 1px; visibility: hidden; }

.toast-fade-enter-active, .toast-fade-leave-active { transition: opacity 0.25s ease; }
.toast-fade-enter-from, .toast-fade-leave-to { opacity: 0; }

/* ====== 以图搜图子菜单 ====== */
.search-sub-trigger { display: flex; justify-content: space-between; align-items: center; }
.search-sub-menu {
  display: none; position: absolute;
  left: 100%; bottom: -4px; padding: 0;
  min-width: 190px;
  background: var(--bg-panel-solid);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
}
.search-sub-trigger:hover .search-sub-menu { display: block; }
.search-sub-item {
  display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
  padding: 7px 12px; font-size: 13px; color: var(--text-secondary);
  cursor: pointer; white-space: nowrap;
}
.search-sub-item:last-child { padding-bottom: 8px; }
.search-sub-item:hover { background: var(--bg-hover); }
.search-sub-name { flex-shrink: 0; }
.search-sub-desc { font-size: 11px; color: var(--text-muted); text-align: right; }
.search-sub-note {
  padding: 4px 12px 1px; font-size: 10px;
  color: var(--text-muted); line-height: 1.2;
}

/* ====== Delete Modal ====== */
/* modal 经 Teleport 渲染到 body，scoped 样式无法命中；删除框样式统一在 App.vue .delete-modal 全局定义 */
</style>
