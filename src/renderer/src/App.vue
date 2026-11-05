<template>
  <div
    class="app-root"
  >
    <div v-if="showDropOverlay" class="drop-overlay">
      <div class="drop-hint">{{ t('app.dropHint') }}</div>
    </div>
    <Transition name="drop-toast">
      <div v-if="dropToast" class="drop-toast">{{ dropToast }}</div>
    </Transition>
    <div v-if="isGlass && gallery.bgImagePath" class="glass-bg-layer" :style="{ backgroundImage: 'url(picrand://get-image?path=' + encodeURIComponent(gallery.bgImagePath) + ')', filter: 'blur(' + gallery.bgBlurAmount + 'px)' }"></div>
    <TopBar ref="topBarRef" @open-settings="showSettings = true" @open-folder-selector="showSelector = true" @open-seed-selector="showSeedSelector = true" @shuffle="galleryRef?.scrollToTop()" />
    <GalleryCanvas ref="galleryRef" :f1-panel-visible="showF1Panel" @load-more="topBarRef?.loadMoreImages()" @start-drift="onDriftFromMenu" @open-f1="onOpenF1" @f1-close="showF1Panel = false" @open-folder="onOpenFolder" @open-folder-selector="showSelector = true" @open-favorites="topBarRef?.viewFavorites()" @toggle-pinboard="togglePinboard" />
    <PinboardPanel v-if="gallery.pinboardEnabled" :f1-panel-visible="showF1Panel" @open-f1="onOpenF1" @f1-close="showF1Panel = false" />
    <ContextPanel @jump-page="topBarRef?.jumpToPage($event)" @do-search="onDoSearch" @do-rating-search="onRatingSearch" @do-ratio-search="onRatioSearch" @do-color-search="onColorSearch" @start-similar-drift="onSimilarDrift" @format-filter-changed="onFormatFilterChanged" />
    <SettingsPanel v-model:visible="showSettings" />
    <FolderSelector ref="folderSelectorRef" :visible="showSelector" show-favorites @select="onFolderSelected" @select-multi="onMultiFolderSelected" @select-favorites="onFavoritesSelected" @cancel="showSelector = false" />
    <SeedSelector :visible="showSeedSelector" @select="onSeedSelected" @cancel="showSeedSelector = false" @refresh="topBarRef?.refreshSeedCandidates()" />

    <!-- 关闭确认对话框 -->
    <Teleport to="body">
      <div v-if="showCloseConfirm" class="modal-overlay" @click.self="cancelClose">
        <div class="modal-box">
          <div class="modal-body">
            <div class="modal-icon">&#9888;</div>
            <div class="modal-text">
              <div class="modal-title">{{ t('dialog.closeTitle') }}</div>
              <div class="modal-desc">{{ t('dialog.closeMsg') }}</div>
            </div>
          </div>
          <div class="modal-actions">
            <button class="modal-btn modal-cancel" @click="cancelClose">{{ t('dialog.cancel') }}</button>
            <button class="modal-btn modal-confirm" @click="confirmClose" autofocus>{{ t('dialog.yes') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 杩囧ぇ鐩綍纭璇orgenizing -->
    <Teleport to="body">
      <div v-if="showOversizeConfirm" class="modal-overlay" @click.self="cancelOversize">
        <div class="modal-box">
          <div class="modal-body">
            <div class="modal-icon">&#9888;</div>
            <div class="modal-text">
              <div class="modal-title">{{ t('dialog.oversizeTitle') }}</div>
              <div class="modal-desc">{{ t('dialog.oversizeMsg') }}</div>
            </div>
          </div>
          <div class="modal-actions">
            <button class="modal-btn modal-cancel" @click="cancelOversize">{{ t('dialog.cancel') }}</button>
            <button class="modal-btn modal-confirm" @click="confirmOversize" autofocus>{{ t('dialog.oversizeAdd') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- F1 图形审计面板 -->
    <F1Panel v-if="showF1Panel" :image="f1PanelImage" :visible="showF1Panel" @close="showF1Panel = false" />

    <!-- 首次启动欢迎面板 -->
    <WelcomePanel :visible="showWelcome" @later="dismissWelcome" @open-folder="welcomeOpenFolder" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useGalleryStore } from './stores/gallery'
import { setLocale, useI18n } from './i18n'
import TopBar from './components/TopBar.vue'
import GalleryCanvas from './components/GalleryCanvas.vue'
import PinboardPanel from './components/PinboardPanel.vue'
import { usePinboardStore } from './stores/pinboard'
import ContextPanel from './components/ContextPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import FolderSelector from './components/FolderSelector.vue'
import SeedSelector from './components/SeedSelector.vue'
import F1Panel from './components/F1Panel.vue'
import WelcomePanel from './components/WelcomePanel.vue'

const gallery = useGalleryStore()
const pinboard = usePinboardStore()
const { t } = useI18n()
const isGlass = computed(() => gallery.themeColor === 'glass')

const showSettings = ref(false)
const showSelector = ref(false)
const showSeedSelector = ref(false)
const showCloseConfirm = ref(false)
const showOversizeConfirm = ref(false)
const showF1Panel = ref(false)
const showDropOverlay = ref(false)
const showWelcome = ref(false)
const f1PanelImage = ref<ImageItem | null>(null)
const topBarRef = ref<InstanceType<typeof TopBar> | null>(null)
const folderSelectorRef = ref<InstanceType<typeof FolderSelector> | null>(null)
const galleryRef = ref<InstanceType<typeof GalleryCanvas> | null>(null)

function onFolderSelected(path: string) {
  showSelector.value = false
  topBarRef.value?.loadFolderByPath(path)
}
function onFavoritesSelected() {
  showSelector.value = false
  topBarRef.value?.viewFavorites()
}
function onDoSearch(q: string) {
  topBarRef.value?.startSearch(q)
}
function onRatingSearch(ratings: number[]) {
  topBarRef.value?.startRatingSearch(ratings)
}
function onRatioSearch(ratioW: number, ratioH: number, tolerance: number) {
  topBarRef.value?.startRatioSearch(ratioW, ratioH, tolerance)
}
function onColorSearch(target: { h: number; s: number; v: number }, tolerance: number, useHue: boolean, useSat: boolean, useValue: boolean) {
  topBarRef.value?.startColorSearch(target, tolerance, useHue, useSat, useValue)
}
function onFormatFilterChanged() {
  topBarRef.value?.applyFormatFilter()
}
function onMultiFolderSelected(paths: string[]) {
  showSelector.value = false
  topBarRef.value?.loadMultipleFolders(paths)
}
function onSeedSelected(path: string) {
  showSeedSelector.value = false
  topBarRef.value?.startDrift(path)
}

function onDriftFromMenu(path: string) {
  topBarRef.value?.startDrift(path)
}

// 类似图片模式：以选定的本地图作种子进入风格漫游
function onSimilarDrift(path: string) {
  topBarRef.value?.startDrift(path)
}

function onOpenF1(img: ImageItem) {
  f1PanelImage.value = img
  showF1Panel.value = true
}

function onOpenFolder(path: string) {
  topBarRef.value?.loadFolderByPath(path)
}

function togglePinboard() {
  pinboard.isExpanded = !pinboard.isExpanded
}

// 图钉板开关切关时，收起面板并复位占位高度
watch(() => gallery.pinboardEnabled, (on) => {
  if (!on) {
    pinboard.isExpanded = false
    document.documentElement.style.setProperty('--pinboard-height', '38px')
  }
})

let _dragCount = 0
function onDragEnter(ev: DragEvent) {
  // 仅外部拖入文件/文件夹时显示遮罩；内部排序拖动不含 Files 类型，忽略
  if (!ev.dataTransfer || !Array.from(ev.dataTransfer.types).includes('Files')) return
  _dragCount++
  ev.dataTransfer.dropEffect = 'copy'
  showDropOverlay.value = true
}
function onDragLeave(ev: DragEvent) {
  _dragCount = Math.max(0, _dragCount - 1)
  if (_dragCount === 0) showDropOverlay.value = false
}
function onDropUI(ev: DragEvent) {
  // 图钉板设置中的拖拽重排：忽略，不进入文件夹导入流程
  if (ev?.dataTransfer?.types?.includes('x-picrand/reorder')) {
    ev.preventDefault()
    showDropOverlay.value = false
    _dragCount = 0
    return
  }
  showDropOverlay.value = false
  _dragCount = 0
  dropToast.value = t('toast.importing')
  dropToastTimer()
}

function onDropResult(_event: unknown, data: { folders: string[]; imgFiles?: string[] }) {
  const folders = data?.folders || []
  const imgFiles = data?.imgFiles || []
  const diag = (data as any)?.diag || ''
  const nonDir = (data as any)?.nonDirCount || 0

  // 仅拖入图片文件（无文件夹）：复制到当前已打开的文件夹目录
  if (!folders.length && imgFiles.length && gallery.folderPath) {
    void (async () => {
      try {
        const result = await window.picrand.importImagesToFolder?.(imgFiles, gallery.folderPath)
        if (result?.copied) {
          dropToast.value = t('toast.importedImages', { count: result.copied })
          dropToastTimer()
        }
      } catch {}
    })()
    return
  }

  if (!folders.length) {
    if (nonDir > 0) dropToast.value = t('toast.dragFolder')
    else dropToast.value = t('toast.noValidFolder')
    dropToastTimer(); return
  }
  void (async () => {
    let lastPath = ''
    for (const d of folders) {
      try { await window.picrand.scanFolder(d, gallery.sortMode) } catch {}
      lastPath = d
    }
    if (lastPath) {
      topBarRef.value?.loadFolderByPath(lastPath)
      dropToast.value = t('toast.importedFolders', { count: folders.length })
      // 若文件夹选择器已打开，立即刷新其列表
      if (showSelector.value) folderSelectorRef.value?.refreshFolders?.()
    } else {
      dropToast.value = t('toast.importFailed')
    }
    dropToastTimer()
  })()
}

const dropToast = ref('')
let _dropToastTimer: ReturnType<typeof setTimeout> | null = null
function dropToastTimer() {
  if (_dropToastTimer) clearTimeout(_dropToastTimer)
  _dropToastTimer = setTimeout(() => { dropToast.value = '' }, 2500)
}

function confirmClose() {
  showCloseConfirm.value = false
  window.picrand.respondCloseConfirm(true)
}

function cancelClose() {
  showCloseConfirm.value = false
  window.picrand.respondCloseConfirm(false)
}
function confirmOversize() {
  showOversizeConfirm.value = false
  window.picrand.respondOversizeConfirm?.(true)
}
function cancelOversize() {
  showOversizeConfirm.value = false
  window.picrand.respondOversizeConfirm?.(false)
}

// 写回 welcomeSeen=1，并把当前 locale 一并持久化（用户可能在面板里切过语言）
async function _persistWelcomeSeen() {
  try {
    const locale = (await import('./i18n')).getLocale()
    // 主进程 save-config 已改为 merge，传 partial 即可，不会丢其他字段
    await window.picrand.saveConfig?.({ welcomeSeen: 1, locale })
  } catch {}
}

async function dismissWelcome() {
  showWelcome.value = false
  await _persistWelcomeSeen()
}

async function welcomeOpenFolder() {
  showWelcome.value = false
  await _persistWelcomeSeen()
  showSelector.value = true
}

function applyThemeToDom() {
  const root = document.documentElement
  const theme = gallery.themeColor || '#1a1a2e'
  root.style.setProperty('--global-bg', theme)
  const isLight = theme !== '#1a1a2e' && theme !== 'glass'
  const glassLight = theme === 'glass' && gallery.bgBrightness === 'bright'
  root.setAttribute('data-theme', isLight ? 'light' : theme === 'glass' ? 'glass' : 'dark')
  if (theme === 'glass') root.setAttribute('data-glass-tone', gallery.bgBrightness === 'bright' ? 'light' : 'dark')
  else root.removeAttribute('data-glass-tone')
  root.style.setProperty('color-scheme', (isLight || glassLight) ? 'light' : 'dark')
  window.picrand.setTitlebarTheme?.(isLight || glassLight)
}

onMounted(async () => {
  try {
    const saved = await window.picrand.readConfig?.()
    if (saved) {
      gallery.themeColor = saved.themeColor || '#1a1a2e'
      gallery.bgImagePath = saved.bgImagePath || ''
      gallery.bgBlurAmount = saved.bgBlurAmount ?? 12
      gallery.bgBrightness = saved.bgBrightness === 'bright' ? 'bright' : 'dark'
      if (saved.locale) setLocale(saved.locale)
      // 风格漫游参数
      if (saved.driftBatchSize != null) gallery.driftBatchSize = saved.driftBatchSize
      if (saved.driftTopN != null) gallery.driftTopN = saved.driftTopN
      if (saved.driftSeedRank != null) gallery.driftSeedRank = saved.driftSeedRank
      if (saved.driftEnabled != null) gallery.driftEnabled = saved.driftEnabled
      if (saved.imageSearchEnabled != null) gallery.imageSearchEnabled = saved.imageSearchEnabled
      if (saved.aiSearchEnabled != null) gallery.aiSearchEnabled = saved.aiSearchEnabled
      if (saved.searchMode === 'ai' || saved.searchMode === 'filename' || saved.searchMode === 'description') gallery.searchMode = saved.searchMode
      if (saved.searchFilterMode) gallery.searchFilterMode = saved.searchFilterMode
      // 格式筛选不再从 config 恢复，每次启动全选（store 默认值就是全选）
      if (saved.aiSearchTopN != null) gallery.aiSearchTopN = saved.aiSearchTopN
      if (saved.colorRef != null) gallery.colorRef = saved.colorRef
      if (saved.dimensionUnit != null) gallery.dimensionUnit = saved.dimensionUnit
      if (saved.defaultSortMode != null) { gallery.defaultSortMode = saved.defaultSortMode; gallery.sortMode = saved.defaultSortMode }
      // 首次启动欢迎面板：welcomeSeen !== 1 时弹出
      if (saved.welcomeSeen !== 1) showWelcome.value = true
    } else {
      // 没有配置文件 = 全新用户，弹出欢迎面板
      showWelcome.value = true
    }
  } catch {}

  // 将主题应用到 DOM（data-theme + --global-bg + color-scheme），
  // 否则冷启动时 SettingsPanel 未打开过，主题变量不生效，界面停留在默认深蓝。
  applyThemeToDom()

  window.picrand.onConfirmClose(() => {
    showCloseConfirm.value = true
  })
  window.picrand.onDropResult?.((data) => onDropResult(null, data))
  window.picrand.onConfirmOversize?.(() => { showOversizeConfirm.value = true })
  window.picrand.onShowToast?.((data: { msg: string; ms?: number }) => {
    dropToast.value = data.msg
    if (_dropToastTimer) clearTimeout(_dropToastTimer)
    _dropToastTimer = setTimeout(() => { dropToast.value = '' }, data.ms ?? 3000)
  })

  // document 级拖放监听：确保模态框(Teleport to body)打开时也能显示拖放遮罩
  document.addEventListener('dragenter', onDragEnter, true)
  document.addEventListener('dragover', onDragOverDoc, true)
  document.addEventListener('dragleave', onDragLeave, true)
  document.addEventListener('drop', onDropUI, true)

  // 启动画面淡出：等首帧渲染完成后再隐藏，避免闪烁
  const splash = document.getElementById('splash')
  if (splash) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        splash.classList.add('hide')
        setTimeout(() => splash.remove(), 350)
      })
    })
  }
})

function onDragOverDoc(ev: DragEvent) { ev.preventDefault(); if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy' }

onUnmounted(() => {
  document.removeEventListener('dragenter', onDragEnter, true)
  document.removeEventListener('dragover', onDragOverDoc, true)
  document.removeEventListener('dragleave', onDragLeave, true)
  document.removeEventListener('drop', onDropUI, true)
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* ====== 主题色系统 ====== */
:root, [data-theme="dark"] {
  --bg-panel: rgba(10, 10, 20, 0.5);
  --bg-panel-solid: #1e1e2e;
  --bg-input: rgba(255, 255, 255, 0.06);
  --bg-input-solid: #333;
  --bg-hover: rgba(255, 255, 255, 0.08);
  --bg-toast: rgba(30, 30, 46, 0.95);
  --text-primary: rgba(255, 255, 255, 0.85);
  --text-secondary: #bbb;
  --text-muted: rgba(255, 255, 255, 0.35);
  --text-hint: rgba(255, 255, 255, 0.2);
  --border-color: rgba(255, 255, 255, 0.08);
  --border-light: rgba(255, 255, 255, 0.06);
  --overlay-bg: rgba(0, 0, 0, 0.6);
  --modal-bg: #1e1e2e;
  --btn-primary-bg: #3a3a5c;
  --btn-primary-hover: #4a4a7c;
  --topbar-bg: rgba(26, 26, 46, 0.85);
  --preview-bg: rgba(0, 0, 0, 0.3);
  --path-bg: rgba(255, 255, 255, 0.04);
  --path-bg-hover: rgba(255, 255, 255, 0.08);
  --scroll-thumb: rgba(255, 255, 255, 0.22);
  --scroll-thumb-hover: rgba(255, 255, 255, 0.4);
}

[data-theme="light"] {
  --bg-panel: rgba(255, 252, 248, 0.85);
  --bg-panel-solid: #faf7f2;
  --bg-input: rgba(0, 0, 0, 0.04);
  --bg-input-solid: #efe9e0;
  --bg-hover: rgba(0, 0, 0, 0.05);
  --bg-toast: rgba(250, 247, 242, 0.95);
  --text-primary: rgba(0, 0, 0, 0.8);
  --text-secondary: #555;
  --text-muted: rgba(0, 0, 0, 0.35);
  --text-hint: rgba(0, 0, 0, 0.15);
  --border-color: rgba(0, 0, 0, 0.08);
  --border-light: rgba(0, 0, 0, 0.04);
  --overlay-bg: rgba(0, 0, 0, 0.3);
  --modal-bg: #faf7f2;
  --btn-primary-bg: #d4c8b6;
  --btn-primary-hover: #c4b8a6;
  --topbar-bg: rgba(250, 245, 239, 0.9);
  --preview-bg: rgba(0, 0, 0, 0.05);
  --path-bg: rgba(0, 0, 0, 0.03);
  --path-bg-hover: rgba(0, 0, 0, 0.06);
  --scroll-thumb: rgba(0, 0, 0, 0.3);
  --scroll-thumb-hover: rgba(0, 0, 0, 0.5);
}

[data-theme="glass"] {
  --bg-panel: rgba(12, 12, 15, 0.35);
  --bg-panel-solid: rgba(24, 24, 30, 0.78);
  --bg-input: rgba(255, 255, 255, 0.1);
  --bg-input-solid: rgba(44, 44, 48, 0.7);
  --bg-hover: rgba(255, 255, 255, 0.12);
  --bg-toast: rgba(24, 24, 30, 0.8);
  --text-primary: rgba(255, 255, 255, 0.9);
  --text-secondary: #ccc;
  --text-muted: rgba(255, 255, 255, 0.45);
  --text-hint: rgba(255, 255, 255, 0.25);
  --border-color: rgba(255, 255, 255, 0.1);
  --border-light: rgba(255, 255, 255, 0.06);
  --overlay-bg: rgba(0, 0, 0, 0.5);
  --modal-bg: rgba(26, 27, 32, 0.82);
  --btn-primary-bg: rgba(92, 92, 107, 0.7);
  --btn-primary-hover: rgba(114, 114, 132, 0.8);
  --topbar-bg: rgba(12, 12, 15, 0.55);
  --preview-bg: rgba(0, 0, 0, 0.2);
  --path-bg: rgba(255, 255, 255, 0.06);
  --path-bg-hover: rgba(255, 255, 255, 0.12);
  --scroll-thumb: rgba(255, 255, 255, 0.28);
  --scroll-thumb-hover: rgba(255, 255, 255, 0.5);
}

/* 毛玻璃：亮系背景图 -> 浅色玻璃（白底半透明 + 深色文字），与上方暗系玻璃互为镜像 */
[data-theme="glass"][data-glass-tone="light"] {
  --bg-panel: rgba(255, 255, 255, 0.4);
  --bg-panel-solid: rgba(250, 250, 252, 0.82);
  --bg-input: rgba(0, 0, 0, 0.06);
  --bg-input-solid: rgba(255, 255, 255, 0.75);
  --bg-hover: rgba(0, 0, 0, 0.08);
  --bg-toast: rgba(250, 250, 252, 0.88);
  --text-primary: rgba(0, 0, 0, 0.82);
  --text-secondary: #444;
  --text-muted: rgba(0, 0, 0, 0.42);
  --text-hint: rgba(0, 0, 0, 0.22);
  --border-color: rgba(0, 0, 0, 0.1);
  --border-light: rgba(0, 0, 0, 0.06);
  --overlay-bg: rgba(0, 0, 0, 0.3);
  --modal-bg: rgba(255, 255, 255, 0.85);
  --btn-primary-bg: rgba(110, 110, 120, 0.4);
  --btn-primary-hover: rgba(130, 130, 140, 0.5);
  --topbar-bg: rgba(255, 255, 255, 0.55);
  --preview-bg: rgba(0, 0, 0, 0.06);
  --path-bg: rgba(0, 0, 0, 0.04);
  --path-bg-hover: rgba(0, 0, 0, 0.08);
  --scroll-thumb: rgba(0, 0, 0, 0.3);
  --scroll-thumb-hover: rgba(0, 0, 0, 0.5);
}
[data-theme="glass"][data-glass-tone="light"] .top-bar {
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
[data-theme="glass"][data-glass-tone="light"] .pinboard-panel {
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
[data-theme="glass"][data-glass-tone="light"] .modal-overlay,
[data-theme="glass"][data-glass-tone="light"] .settings-overlay,
[data-theme="glass"][data-glass-tone="light"] .create-modal-overlay {
  background: rgba(0, 0, 0, 0.4);
}
[data-theme="glass"][data-glass-tone="light"] .modal-box,
[data-theme="glass"][data-glass-tone="light"] .settings-panel,
[data-theme="glass"][data-glass-tone="light"] .create-modal {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.glass-bg-layer {
  position: fixed; inset: 0; z-index: -1;
  background-size: cover; background-position: center;
  transform: scale(1.15);
  animation: bgFadeIn 0.8s ease-out;
}
@keyframes bgFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 毛玻璃：顶栏和图钉板额外加深 */
[data-theme="glass"] .top-bar {
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
[data-theme="glass"] .pinboard-panel {
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

/* 毛玻璃：模态框统一风格 */
[data-theme="glass"] .modal-overlay,
[data-theme="glass"] .settings-overlay,
[data-theme="glass"] .create-modal-overlay {
  background: rgba(0, 0, 0, 0.5);
}
[data-theme="glass"] .modal-box,
[data-theme="glass"] .settings-panel,
[data-theme="glass"] .create-modal {
  background: rgba(26, 27, 32, 0.82);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

body {
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
  background: var(--global-bg, #1a1a2e);
  color: #eee;
  user-select: none;
}

/* 全局滚动条：滑块颜色跟随主题变量，暗色比旧版更亮、浅色用深灰保证可见 */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--scroll-thumb); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--scroll-thumb-hover); }
::-webkit-scrollbar-corner { background: transparent; }

.app-root {
  width: 100vw;
  height: 100vh;
  position: relative;
  overflow: hidden;
  background: var(--global-bg, #1a1a2e);
}

.drop-overlay {
  position: fixed; inset: 0; z-index: 99999;
  background: rgba(30,30,46,0.45);
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}
.drop-hint {
  font-size: 28px; font-weight: 600; color: rgba(255,255,255,0.8);
  border: 3px dashed rgba(255,255,255,0.3); border-radius: 16px;
  padding: 40px 60px;
  text-shadow: 0 2px 8px rgba(0,0,0,0.4);
}
.drop-toast {
  position: fixed; bottom: 72px; left: 50%; transform: translateX(-50%); z-index: 99999;
  background: rgba(20,20,30,0.9); color: #fff; padding: 10px 22px; border-radius: 8px;
  font-size: 13px; box-shadow: 0 4px 18px rgba(0,0,0,0.4); pointer-events: none;
}
.drop-toast-enter-active, .drop-toast-leave-active { transition: opacity .2s, transform .2s; }
.drop-toast-enter-from, .drop-toast-leave-to { opacity: 0; transform: translate(-50%, 8px); }

/* viewer 灯箱动画优化：关闭内部切图动画，仅在打开时做一次轻量放大 */
.viewer-open-pop .viewer-canvas {
  animation: viewerQuickOpen 140ms ease-out;
  transform-origin: center center;
}

@keyframes viewerQuickOpen {
  from {
    transform: scale(0.96);
    opacity: 0.82;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

/* viewer 工具栏：把 1:1 图标替换成统一风格的“打开位置”线性图标 */
.viewer-one-to-one::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='M7 4h9v9' fill='none' stroke='%23fff' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M16 4l-8 8' fill='none' stroke='%23fff' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M14 11v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4' fill='none' stroke='%23fff' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") !important;
  background-repeat: no-repeat !important;
  background-position: center !important;
  background-size: 16px 16px !important;
  content: '' !important;
  color: transparent !important;
  width: 20px !important;
  height: 20px !important;
}

/* viewer 工具栏：统一所有按钮尺寸 */
.viewer-toolbar > ul > li,
.viewer-toolbar > ul > .viewer-small,
.viewer-toolbar > ul > .viewer-large {
  width: 24px !important;
  height: 24px !important;
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  border-radius: 50% !important;
}
.viewer-toolbar > ul > li::before,
.viewer-toolbar > ul > .viewer-small::before,
.viewer-toolbar > ul > .viewer-large::before {
  margin: 2px !important;
}

/* 全屏幻灯片 */

/* GIF 动图灯箱帧控制条 */
.gif-control-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 6px 3px;
}
.gif-ctrl-btn {
  width: 24px; height: 24px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background-color 0.15s;
  padding: 0;
  outline: none;
  -webkit-appearance: none;
}
.gif-ctrl-btn:hover { background: rgba(0, 0, 0, 0.8); }
.gif-ctrl-btn:focus { outline: none; box-shadow: none; }
.gif-ctrl-btn svg { width: 14px; height: 14px; fill: #fff; display: block; }
.gif-progress-track {
  position: relative;
  width: 180px; height: 16px;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 0;
  cursor: pointer;
  margin: 0 6px;
}
.gif-progress-fill {
  position: absolute; left: 0; top: 0; height: 100%;
  background: rgba(255, 255, 255, 0.55);
  border-radius: 0;
  pointer-events: none;
  transition: width 0.05s linear;
}
.gif-frame-counter {
  color: rgba(255, 255, 255, 0.85);
  font-size: 11px;
  font-family: 'Consolas', 'Courier New', monospace;
  min-width: 48px;
  height: 16px;
  line-height: 16px;
  text-align: center;
  user-select: none;
  pointer-events: none;
  margin-left: 4px;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 2px;
  padding: 0 6px;
  box-sizing: border-box;
}
.gif-display-canvas { image-rendering: auto; }

.picrand-slideshow {
  position: fixed; inset: 0; z-index: 99999;
  background: #000; cursor: none;
  display: flex; align-items: center; justify-content: center;
}
.picrand-slideshow img {
  max-width: 100vw; max-height: 100vh; object-fit: contain;
}

/* 右上角关闭按钮改为矩形 */
.viewer-button {
  width: 56px !important;
  height: 40px !important;
  right: 0 !important;
  top: 0 !important;
  border-radius: 0 0 0 8px !important;
}
.viewer-button::before {
  left: 18px !important;
  bottom: 10px !important;
}

/* 右下角 F1 按钮（镜像右上角关闭按钮的矩形样式，点击等同 F1 打开/关闭审计面板） */
.viewer-f1-btn {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 56px;
  height: 40px;
  z-index: 9999;
  border: none;
  border-radius: 8px 0 0 0;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background-color 0.15s;
}
.viewer-f1-btn:hover { background: rgba(0, 0, 0, 0.8); }
.viewer-f1-btn svg { display: block; }

/* 关闭确认对话框 — Windows 原生风格 */
.modal-overlay {
  position: fixed; inset: 0; z-index: 10000;
  background: rgba(0, 0, 0, 0.3);
  display: flex; align-items: center; justify-content: center;
}
.modal-box {
  background: var(--modal-bg, #1e1e2e);
  border: 1px solid var(--border-color);
  border-radius: 0;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  width: 400px; max-width: 90vw;
  padding: 24px;
}
.modal-body {
  display: flex; align-items: flex-start; gap: 16px;
  margin-bottom: 24px;
}
.modal-icon {
  font-size: 32px; line-height: 1; flex-shrink: 0;
  color: #e0a800;
}
.modal-text { flex: 1; min-width: 0; }
.modal-title {
  font-size: 14px; font-weight: 600; color: var(--text-primary);
  margin-bottom: 6px;
}
.modal-desc {
  font-size: 13px; color: var(--text-secondary);
  line-height: 1.5;
}
.modal-actions {
  display: flex; gap: 8px; justify-content: flex-end;
}
.modal-btn {
  height: 32px; padding: 0 20px;
  border: 1px solid var(--border-color);
  border-radius: 0;
  font-size: 13px; cursor: pointer;
  background: var(--bg-input-solid, #333);
  color: var(--text-primary);
  min-width: 72px; text-align: center;
}
.modal-btn:hover { filter: brightness(1.15); }
.modal-btn:active { filter: brightness(0.9); }
.modal-btn:focus-visible { outline: 2px solid #0078d4; outline-offset: 1px; }
.modal-confirm {
  background: #0078d4; color: #fff; border-color: #0078d4;
}
.modal-confirm:hover { background: #106ebe; }
.modal-confirm:active { background: #005a9e; }

/* ====== 删除确认弹窗（红色风格，详情页 + 右键菜单共用）====== */
.delete-modal .modal-title { color: var(--text-primary); }
.delete-modal .modal-path {
  background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 6px; padding: 10px 14px; margin-bottom: 24px;
  text-align: left; width: 100%; max-width: 100%; min-width: 0;
  box-sizing: border-box; overflow-wrap: anywhere; word-break: break-all;
}
.delete-modal .modal-path code {
  font-size: 12px; color: rgba(255,255,255,0.6);
  font-family: 'Consolas', monospace;
  display: block; width: 100%; max-width: 100%; white-space: normal;
  overflow-wrap: anywhere; word-break: break-all;
}
.delete-modal .modal-confirm { background: #e81123; color: var(--text-primary); border-color: #e81123; }
.delete-modal .modal-confirm:hover { background: #d00312; }
.delete-modal .modal-confirm:active { background: #b00310; }

/* 主题：退出确认对话框跟随主题 */
[data-theme="glass"] .modal-cancel:hover { background: rgba(255,255,255,0.2); }
</style>
