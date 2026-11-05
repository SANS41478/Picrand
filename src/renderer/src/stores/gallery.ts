import { defineStore } from 'pinia'
import { shallowRef, ref, computed } from 'vue'
import { ALL_EXTS } from '../utils/formats'

export const useGalleryStore = defineStore('gallery', () => {
  const images = shallowRef<ImageItem[]>([])
  const sortMode = ref<SortMode>('random')
  const activeImage = ref<ImageItem | null>(null)
  const isScanning = ref(false)
  const columns = ref(4)
  const picRadius = ref(8)
  const picGap = ref(12)
  const folderPath = ref('')
  const shuffleCounter = ref(0)
  const viewMode = ref<'single' | 'favorites' | 'drift'>('single')
  const driftBatchSize = ref(1000)
  const driftTopN = ref(10)
  const driftSeedRank = ref(2)
  const driftWeightMode = ref<'color' | 'texture' | 'multimodal'>('color')
  const driftEnabled = ref(true)
  const imageSearchEnabled = ref(false)
  const searchEngine = ref('yandex')  // 默认搜图引擎
  const aiSearchEnabled = ref(true)
  const folderMemoryEnabled = ref(true)
  const searchMode = ref<'filename' | 'description' | 'ai'>('filename')
  const searchFilterMode = ref<SearchFilterMode>('normal')
  const aiSearchTopN = ref(500)
  const preloadEnabled = ref(true)
  const pinboardEnabled = ref(true)        // 图钉板开关（默认开）
  const pinboardMemoryEnabled = ref(false)  // 图钉板记忆（默认关，关闭则退出时清空数据）
  const bgImagePath = ref('')
  const bgBlurAmount = ref(12)
  const bgBrightness = ref<'dark' | 'bright'>('dark')  // 玻璃主题背景图明暗（亮图切浅色玻璃配色）
  const themeColor = ref('#faf5ef')
  const colorRef = ref('traditional')  // 'all' | 'traditional' | 'pantone'
  const dimensionUnit = ref<'px' | 'mm'>('px')
  const defaultSortMode = ref<SortMode>('random')
  const formatFilter = ref<string[]>([...ALL_EXTS])  // 启用的格式列表（格式筛选）
  const driftSeedPath = ref<string | null>(null)
  const driftCandidates = ref<ImageItem[]>([])
  const driftBatchIdx = ref(0)
  const driftTotalBatches = ref(0)

  const thumbProgress = ref(0)
  const totalImages = ref(0)
  const scrollProgress = ref(0)            // 0-100 图片数量百分比，ContextPanel 进度条用
  const _scrollRatio = ref(0)             // 0-1 像素滚动比例，切文件夹时保存/恢复用
  const _pendingScrollProgress = ref(-1)  // >=0 时 GalleryCanvas 按像素比例恢复滚动，-1 无待恢复
  const searchQuery = ref('')

  // ====== 全状态快照：切换文件夹时保存，切回时瞬间还原 ======
  const MAX_SNAPSHOTS = 5
  const _snapshots = new Map<string, FolderSnapshot>()

  function saveSnapshot(folderPath: string, snap: FolderSnapshot) {
    // 不存空文件夹
    if (!snap.images.length) return
    // 限制条目数：超过上限删最早一条
    if (_snapshots.size >= MAX_SNAPSHOTS) {
      const firstKey = _snapshots.keys().next().value
      if (firstKey) _snapshots.delete(firstKey)
    }
    // 浅拷贝 images 数组（元素已 Object.freeze，共享引用即可）
    _snapshots.set(folderPath, { ...snap, images: [...snap.images] })
  }

  function getSnapshot(folderPath: string): FolderSnapshot | undefined {
    return _snapshots.get(folderPath)
  }

  function removeSnapshot(folderPath: string): void {
    _snapshots.delete(folderPath)
  }

  // 格式筛选变更后调用：快照内含旧格式图片，统一作废
  function clearSnapshots(): void {
    _snapshots.clear()
  }

  function shuffle(): void {
    shuffleCounter.value++
  }

  // 排序由数据库 ORDER BY sort_order 控制，前端仅按接收顺序展示
  const sortedImages = computed(() => {
    void shuffleCounter.value
    return images.value
  })

  // ====== chokidar 增量更新 ======
  function insertImageInPlace(newImage: ImageItem) {
    // 去重:主进程主动推送(拖入/粘贴导入)与 watcher 推送可能对同一文件产生两次 sync-db，
    // DB 层 UNIQUE 约束保证不重复存储，但渲染层数组需自行兜底，否则瀑布池出现两张同源图
    if (images.value.some(i => i.file_path === newImage.file_path)) return
    const idx = Math.floor(Math.random() * (images.value.length + 1))
    const arr = [...images.value]
    arr.splice(idx, 0, newImage)
    images.value = arr
  }

  function removeImageByPath(filePath: string) {
    const idx = images.value.findIndex(i => i.file_path === filePath)
    if (idx !== -1) {
      const next = [...images.value]; next.splice(idx, 1); images.value = next
    }
    if (activeImage.value?.file_path === filePath) activeImage.value = null
  }

  function updateThumbnailPath(filePath: string, thumbnailPath: string) {
    const idx = images.value.findIndex(i => i.file_path === filePath)
    if (idx >= 0) {
      const arr = [...images.value]
      arr[idx] = { ...arr[idx], thumbnail_path: thumbnailPath }
      images.value = arr
    }
  }

  // 不可变更新单张图片的任意字段（width/height/thumbnail_path 等）。
  // images 元素被 Object.freeze，直接赋值会抛 TypeError，必须整体替换。
  function updateImageMeta(filePath: string, meta: Partial<ImageItem>) {
    const idx = images.value.findIndex(i => i.file_path === filePath)
    if (idx >= 0) {
      const arr = [...images.value]
      arr[idx] = { ...arr[idx], ...meta }
      images.value = arr
    }
  }

  // 批量刷新缩略图路径：一次数组拷贝处理多条，避免逐条 updateThumbnailPath 触发 N 次全量重建。
  // 用于扫描后台视频海报高频回写（thumb-update）等场景，把 N 次 shallowRef 变更合并为 1 次。
  function updateThumbnailsBatch(updates: Array<{ filePath: string; thumbnailPath: string }>) {
    if (!updates.length) return
    const map = new Map(updates.map(u => [u.filePath, u.thumbnailPath]))
    let touched = false
    const arr = images.value.map(i => {
      if (map.has(i.file_path)) { touched = true; return { ...i, thumbnail_path: map.get(i.file_path) } }
      return i
    })
    if (touched) images.value = arr
  }

  function appendImages(newImages: ImageItem[]) {
    const existing = new Set(images.value.map(i => i.file_path))
    const unique = newImages.filter(i => !existing.has(i.file_path))
    if (!unique.length) return
    images.value = [...images.value, ...unique.map(img => Object.freeze(img))]
  }

  function flushThumbnails() { images.value = [...images.value] }
  function setThumbProgress(p: number) { thumbProgress.value = Math.min(100, Math.max(0, p)) }

  function replaceImages(arr: ImageItem[]) {
    images.value = arr.map(img => Object.freeze(img))
  }

  function setFavorite(filePath: string, val: number) {
    const idx = images.value.findIndex(i => i.file_path === filePath)
    if (idx >= 0) {
      const arr = [...images.value]
      arr[idx] = { ...arr[idx], is_favorite: val }
      images.value = arr
    }
    if (activeImage.value?.file_path === filePath) activeImage.value = { ...activeImage.value, is_favorite: val }
    shuffleCounter.value++
  }

  // 批量收藏：仅一次数组拷贝 + 一次响应式触发（避免逐张 setFavorite 的 N 次重渲染）
  function setFavoriteBatch(updates: Array<{ filePath: string; val: number }>) {
    if (!updates.length) return
    const map = new Map(updates.map(u => [u.filePath, u.val]))
    let touched = false
    const arr = images.value.map(i => {
      if (map.has(i.file_path)) { touched = true; return { ...i, is_favorite: map.get(i.file_path) } }
      return i
    })
    if (touched) images.value = arr
    const active = activeImage.value
    if (active && map.has(active.file_path)) {
      activeImage.value = { ...active, is_favorite: map.get(active.file_path) }
    }
    shuffleCounter.value++
  }

  return {
    images, sortMode, activeImage, isScanning,
    columns, picRadius, picGap, folderPath, viewMode, thumbProgress, totalImages, scrollProgress, _scrollRatio, _pendingScrollProgress, searchQuery,
    sortedImages, shuffle, driftBatchSize, driftSeedPath, driftBatchIdx, driftTotalBatches, driftTopN, driftSeedRank, driftWeightMode, driftEnabled, driftCandidates, bgImagePath, bgBlurAmount, bgBrightness, themeColor, colorRef, dimensionUnit, defaultSortMode, imageSearchEnabled, searchEngine, aiSearchEnabled, searchMode, searchFilterMode, aiSearchTopN, preloadEnabled, folderMemoryEnabled, pinboardEnabled, pinboardMemoryEnabled,
    insertImageInPlace, removeImageByPath, updateThumbnailPath, updateImageMeta, updateThumbnailsBatch,
    appendImages, flushThumbnails, replaceImages, setFavorite, setFavoriteBatch, setThumbProgress,
    saveSnapshot, getSnapshot, removeSnapshot, clearSnapshots, formatFilter,
  }
})
