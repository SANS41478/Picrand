<template>
  <section class="pinboard-panel" :class="{ expanded: pinboard.isExpanded, 'flash-dim': flashBoard }">
    <button class="toggle-btn" :title="pinboard.isExpanded ? t('pinboard.collapse') : t('pinboard.expand')" @click="toggle">
      {{ pinboard.isExpanded ? '∨' : '∧' }}
    </button>

    <div v-if="!pinboard.isExpanded" class="collapsed-bar">
      <span class="current-label">{{ t('pinboard.current') }}{{ pinboard.boards.length ? '' : t('pinboard.none') }}</span>
      <select v-if="pinboard.boards.length" :value="pinboard.currentId || ''" @change="changeBoard">
        <option v-for="b in pinboard.boards" :key="b.id" :value="b.id">{{ b.name }}</option>
      </select>
      <button v-if="pinboard.boards.length" class="pb-settings-btn" :title="t('pinboard.settings')" @click.stop="showPinboardSettings = true">⚙</button>
    </div>

    <div v-else class="expanded-content">
      <div class="thumb-row" @wheel.prevent="handleThumbWheel">
        <div v-if="pinboard.currentBoard && pinboard.currentBoard.images.length === 0" class="empty-text">{{ t('pinboard.noImages') }}</div>
        <div
          v-for="item in pinboard.currentBoard?.images || []"
          :key="item.path"
          class="pin-thumb"
          :title="item.path"
          @click="selectPinned(item.path)"
          @dblclick="openPinnedLightbox(item.path)"
          @contextmenu.prevent="openMenu($event, item.path)"
        >
          <img :src="imageSrc(item.path)" :alt="fileName(item.path)">
        </div>
      </div>

      <div class="bottom-row">
        <div class="switcher">
          <span class="current-label">{{ t('pinboard.current') }}{{ pinboard.boards.length ? '' : t('pinboard.none') }}</span>
          <select v-if="pinboard.boards.length" :value="pinboard.currentId || ''" @change="changeBoard">
            <option v-for="b in pinboard.boards" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
          <!-- 新建已迁入设置窗口；零图钉板时也需能打开设置，故设置按钮常显 -->
          <button class="pb-settings-btn" :title="t('pinboard.settings')" @click.stop="showPinboardSettings = true">⚙</button>
        </div>
        <div class="actions">
          <button :disabled="!pinboard.currentBoard" @click.stop="clearBoard">{{ t('pinboard.clear') }}</button>
          <button :disabled="!pinboard.currentBoard || pinboard.currentBoard.images.length === 0" @click.stop="exportBoard">{{ t('pinboard.export') }}</button>
          <button :disabled="!pinboard.currentBoard || pinboard.currentBoard.images.length === 0" @click.stop="exportToPath">{{ t('pinboard.exportToPath') }}</button>
          <button class="fav-all-btn" :disabled="!pinboard.currentBoard || pinboard.currentBoard.images.length === 0" @click.stop="favAllInBoard" :title="t('pinboard.favAll')">♥</button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="menu.visible" class="pin-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
        <div class="pin-menu-item" @click="removeSelected">{{ t('pinboard.remove') }}</div>
        <div class="pin-menu-item" @click="openPinnedDefault">{{ t('pinboard.openDefault') }}</div>
        <div v-if="gallery.imageSearchEnabled" class="pin-menu-item" @click="searchSelected">{{ t('gallery.imageSearch') }}</div>
        <div class="pin-menu-item" @click="openRefBoardForSelected">{{ t('gallery.openRefBoard') }}</div>
      </div>
    </Teleport>

    <transition name="toast-fade">
      <div v-if="pinboard.toast" class="pin-toast">{{ pinboard.toast }}</div>
    </transition>

    <Teleport to="body">
      <div v-if="confirmState.visible" class="create-modal-overlay" @click.self="cancelConfirm" @mousedown.stop>
        <div class="create-modal confirm-modal" @mousedown.stop @click.stop>
          <h3>{{ confirmState.title }}</h3>
          <p class="confirm-message">{{ confirmState.message }}</p>
          <div class="create-modal-actions">
            <button class="modal-cancel" @click="cancelConfirm">{{ t('pinboard.cancel') }}</button>
            <button class="modal-confirm danger-confirm" @click="runConfirm">{{ t('pinboard.confirm') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <FolderSelector :visible="showExportSelector" @select="onExportFolderSelected" @select-multi="onExportMultiFoldersSelected" @cancel="showExportSelector = false" />

    <PinboardSettingsModal :visible="showPinboardSettings" @cancel="showPinboardSettings = false" />
  </section>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { api as viewerApi } from 'v-viewer'
import { useGalleryStore } from '../stores/gallery'
import { usePinboardStore } from '../stores/pinboard'
import { useI18n } from '../i18n'
import { isVideoExt } from '../utils/video'
import FolderSelector from './FolderSelector.vue'
import PinboardSettingsModal from './PinboardSettingsModal.vue'

const gallery = useGalleryStore()
const pinboard = usePinboardStore()
const { t } = useI18n()
const emit = defineEmits(['open-f1', 'f1-close'])
const props = defineProps<{ f1PanelVisible?: boolean }>()
const showExportSelector = ref(false)
const showPinboardSettings = ref(false)
const flashBoard = ref(false)

// 折叠/切换图钉板时清除缩略图 src，释放 Chromium 位图
function clearThumbSrc() {
  document.querySelectorAll('.pin-thumb img').forEach((img: any) => {
    img.src = ''
    img.removeAttribute('src')
  })
}
watch(() => pinboard.isExpanded, (expanded) => { if (!expanded) clearThumbSrc() })
watch(() => pinboard.currentBoard?.id, () => clearThumbSrc())

const menu = reactive({ visible: false, x: 0, y: 0, path: '' })
const confirmState = reactive<{ visible: boolean; title: string; message: string; action: 'clear' | '' }>({
  visible: false,
  title: '',
  message: '',
  action: ''
})

onMounted(() => {
  pinboard.load()
  document.addEventListener('click', closeMenu)
  document.addEventListener('keydown', pinboardHotkeyHandler, true)
})

onUnmounted(() => {
  document.removeEventListener('click', closeMenu)
  document.removeEventListener('keydown', pinboardHotkeyHandler, true)
})

// 全局快捷键：按下绑定的单键 → 切换到对应图钉板 + 闪烁提醒
// 灯箱/幻灯片打开时照常生效
function eventHotkey(ev: KeyboardEvent): string | null {
  if (/^F([1-9]|1[0-2])$/.test(ev.key)) return ev.key
  if (/^[a-zA-Z]$/.test(ev.key)) {
    if (ev.key.toUpperCase() === 'F') return null
    return ev.key.toUpperCase()
  }
  if (/^[0-9]$/.test(ev.key)) return ev.key
  if (/^Numpad([0-9])$/.test(ev.code)) return ev.code.replace('Numpad', '')
  return null
}

let _flashTimer: ReturnType<typeof setTimeout> | null = null
function triggerFlash() {
  // 强制重启动画：先移除类，等浏览器实际重算样式（双 rAF），再加回类
  // 单靠 nextTick 不够：Vue 批处理会让“移除→加回”在同一帧合并，DOM 没真正移除过类，CSS animation 不重置
  if (_flashTimer) { clearTimeout(_flashTimer); _flashTimer = null }
  flashBoard.value = false
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      flashBoard.value = true
      _flashTimer = setTimeout(() => { flashBoard.value = false }, 220)
    })
  })
}

function pinboardHotkeyHandler(ev: KeyboardEvent) {
  const target = ev.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
  // ── Ctrl+方向键：列数 / 图钉板 切换（灯箱/幻灯片打开时不响应） ──
  if (ev.ctrlKey && !ev.metaKey && !ev.altKey && !ev.shiftKey) {
    if (document.querySelector('.viewer-container, .picrand-slideshow')) return
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      const next = gallery.columns + (ev.key === 'ArrowLeft' ? -1 : 1)
      // 与设置面板列数滑块同范围（2~6），到边界停住
      if (next < 2 || next > 8) { ev.preventDefault(); return }
      gallery.columns = next
      try { window.picrand.saveConfig?.({ columns: next }) } catch {}
      ev.preventDefault(); ev.stopPropagation()
      return
    }
    if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
      const boards = pinboard.boards
      if (!boards.length) { ev.preventDefault(); return }
      const idx = boards.findIndex(b => b.id === pinboard.currentId)
      const dir = ev.key === 'ArrowUp' ? -1 : 1
      const nextIdx = (idx + dir + boards.length) % boards.length
      void pinboard.setCurrent(boards[nextIdx].id).then(triggerFlash)
      ev.preventDefault(); ev.stopPropagation()
      return
    }
    return
  }
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return
  const key = eventHotkey(ev)
  if (!key) return
  const boards = pinboard.boards
  if (!boards.length) return
  const matched = boards.find(b => b.hotkey && b.hotkey !== 'F' && b.hotkey === key)
  if (!matched) return
  if (matched.id === pinboard.currentId) { triggerFlash(); return }
  void pinboard.setCurrent(matched.id).then(triggerFlash)
  ev.preventDefault()
  ev.stopPropagation()
}

function toggle() {
  pinboard.isExpanded = !pinboard.isExpanded
  document.documentElement.style.setProperty('--pinboard-height', pinboard.isExpanded ? '178px' : '38px')
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

function imageSrc(path: string): string {
  const orig = encodeURIComponent(path)
  const img = gallery.images.find(i => i.file_path === path)
  const thumb = img?.thumbnail_path ? `&thumb=${encodeURIComponent(img.thumbnail_path)}` : ''
  return `picrand://get-image?orig=${orig}${thumb}`
}

function handleThumbWheel(e: WheelEvent) {
  const el = e.currentTarget as HTMLElement
  el.scrollLeft += e.deltaY || e.deltaX
}

async function selectPinned(path: string) {
  try {
    gallery.activeImage = await window.picrand.getImageInfo(path)
    // 视频文件：getImageInfo 返回 thumbnail_path=原文件，需重新生成缩略图
    if (isVideoExt(path) && gallery.activeImage) {
      try {
        const result = await window.picrand.generateThumbnail(path)
        if (result?.thumbnail_path) {
          gallery.activeImage = { ...gallery.activeImage, thumbnail_path: result.thumbnail_path }
        }
      } catch {}
    }
  } catch {
    gallery.activeImage = {
      file_path: path,
      file_name: fileName(path),
      file_size: 0,
      modify_time: 0,
      thumbnail_path: path,
      width: 0,
      height: 0,
      is_favorite: 0
    }
    // 视频缩略图：异步生成后更新
    if (isVideoExt(path)) {
      window.picrand.generateThumbnail(path).then(result => {
        if (result?.thumbnail_path && gallery.activeImage?.file_path === path) {
          gallery.activeImage = { ...gallery.activeImage, thumbnail_path: result.thumbnail_path }
        }
      }).catch(() => {})
    }
  }
  // 从图库中查找原图信息（评分、描述、收藏状态等），合并到 activeImage
  const galleryImg = gallery.images.find(i => i.file_path === path)
  if (galleryImg && gallery.activeImage) {
    gallery.activeImage = {
      ...gallery.activeImage,
      rating: galleryImg.rating ?? 0,
      description: galleryImg.description ?? '',
      is_favorite: galleryImg.is_favorite ?? 0,
    }
  }
}

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
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation?.()
      return
    }
    lastNavAt = now

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation?.()

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
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation?.()
      return
    }
    lastRepeatNav = now
  }

  const wheelHandler = (event: WheelEvent) => {
    const player = container.querySelector('.viewer-player') as HTMLElement | null
    if (!player || !player.classList.contains('viewer-show')) return

    const now = Date.now()
    if (now - lastWheelAt < wheelGap) {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation?.()
      return
    }
    lastWheelAt = now

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation?.()

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
    navbar: false,
    title: false,
    keyboard: true,
    transition: false,
    fullscreen: false,
    tooltip: false,
    interval: 999999999,
    zoomRatio: 0.2,
    toolbar: {
      zoomIn: true,
      zoomOut: true,
      oneToOne: {
        show: true,
        size: 'small',
        click: () => {
          const viewer = getViewer()
          if (!viewer) return
          const src = viewer.viewed ? viewer.image?.src : ''
          const m = src?.match(/path=([^&]+)/)
          const path = m ? decodeURIComponent(m[1]) : currentPath
          void window.picrand.openInFolder(path)
        }
      },
      reset: true,
      prev: true,
      play: true,
      next: true,
      rotateLeft: true,
      rotateRight: true,
      flipHorizontal: true,
      flipVertical: true,
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
      container.classList.add('viewer-open-pop')
      setTimeout(() => container.classList.remove('viewer-open-pop'), 140)

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

function showOverlayToast(msg: string) {
  const el = document.createElement('div')
  el.textContent = msg
  Object.assign(el.style, {
    position: 'fixed', bottom: 'calc(var(--pinboard-height, 38px) + 18px)', left: '50%', transform: 'translateX(-50%)',
    zIndex: '20000', pointerEvents: 'none',
    background: 'var(--bg-toast)', color: 'var(--text-secondary)',
    border: '1px solid var(--border-color)', borderRadius: '8px',
    padding: '8px 14px', fontSize: '13px', transition: 'opacity 0.25s'
  })
  document.body.appendChild(el)
  setTimeout(() => { el.style.opacity = '0' }, 1200)
  setTimeout(() => el.remove(), 1500)
}

function openPinnedLightbox(path: string) {
  const items = pinboard.currentBoard?.images || []
  let curIdx = items.findIndex(item => item.path === path)
  if (curIdx < 0) curIdx = 0
  const total = items.length

  let _pbKeyFn: ((ev: KeyboardEvent) => void) | null = null
  let _pbViewerRef: any = null
  let _pbLastNav = 0
  let _pbFirstOpen = true

  let _isNavigating = false
  function destroyViewer() {
    if (!_isNavigating) emit('f1-close')
    if (_pbKeyFn) { document.removeEventListener('keydown', _pbKeyFn, true); _pbKeyFn = null }
    if (_pbViewerRef) {
      // 先清空 viewer 内所有 img src（释放 Chromium 位图）
      try { _pbViewerRef.element?.querySelectorAll('img').forEach((i: HTMLImageElement) => { i.src = '' }) } catch {}
      // 再销毁 viewer
      try { _pbViewerRef.destroy?.() } catch {}
      _pbViewerRef = null
    }
    // 强制移除可能残留的 viewer DOM（兜底）
    document.querySelectorAll('.viewer-container').forEach(el => {
      el.querySelectorAll('img').forEach((i: HTMLImageElement) => { i.src = '' })
      el.remove()
    })
  }

  function showOne(idx: number) {
    curIdx = idx
    const url = `picrand://get-image?path=${encodeURIComponent(items[curIdx].path)}`
    const isFirst = _pbFirstOpen
    _pbFirstOpen = false

    _isNavigating = true
    destroyViewer()
    _isNavigating = false

    _pbKeyFn = (ev: KeyboardEvent) => {
      if (!_pbViewerRef) return
      if (ev.key === 'F1') {
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation()
        if (props.f1PanelVisible) { emit('f1-close'); return }
        const p = items[curIdx]
        const c = _pbViewerRef.element?.querySelector('.viewer-canvas') as HTMLElement | null
        const vimg = c?.querySelector('img') as HTMLImageElement | null
        emit('open-f1', {
          file_path: p.path,
          file_name: p.path.split(/[/\\]/).pop() || '',
          width: vimg?.naturalWidth || 0,
          height: vimg?.naturalHeight || 0,
          file_size: 0, modify_time: 0,
          thumbnail_path: '', is_favorite: 0,
        } as ImageItem)
        return
      }
      if (ev.key === 'Enter') {
        const cur = items[curIdx]
        if (cur && isVideoExt(cur.path)) { ev.preventDefault(); ev.stopPropagation(); window.picrand.openWithDefault(cur.path); return }
      }
      if (ev.key === 'Escape') { emit('f1-close'); _pbViewerRef.hide(); return }
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return
      ev.stopPropagation(); ev.stopImmediatePropagation()
      if (ev.repeat) { const n = Date.now(); if (n - _pbLastNav < 140) return; _pbLastNav = n }
      if (ev.key === 'ArrowLeft' && curIdx > 0) showOne(curIdx - 1)
      else if (ev.key === 'ArrowRight' && curIdx < total - 1) showOne(curIdx + 1)
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') showOverlayToast(t('pinboard.atEnd'))
    }
    document.addEventListener('keydown', _pbKeyFn, true)

    _pbViewerRef = viewerApi({
      options: {
        initialViewIndex: 0,
        navbar: false, title: false, keyboard: false, transition: false,
        fullscreen: false, tooltip: false, loop: false,
        zoomRatio: 0.2,
        toolbar: {
          zoomIn: true, zoomOut: true,
          oneToOne: {
            show: true, size: 'small',
            click: () => { void window.picrand.openInFolder(items[curIdx].path) }
          },
          reset: true, prev: true, play: true, next: true,
          rotateLeft: true, rotateRight: true,
          flipHorizontal: true, flipVertical: true,
        },
        shown() {
          const c = document.querySelector('.viewer-container')
          if (!c) return
          c.addEventListener('contextmenu', (ev) => { ev.preventDefault(); emit('f1-close'); _pbViewerRef?.hide() })
          const canvas = c.querySelector('.viewer-canvas') as HTMLElement | null
          canvas?.addEventListener('mousedown', (ev) => { if (ev.button === 1) { ev.preventDefault(); const rb = c.querySelector('.viewer-reset') as HTMLElement | null; rb?.click() } })
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
              const imgData = _pbViewerRef?.imageData
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
        // ====== end ======
          // ====== 视频：跟随图片缩放的居中播放角标 + Enter 提示 ======
          if (isVideoExt(items[curIdx].path)) {
            const playOverlay = document.createElement('div')
            playOverlay.className = 'lb-video-play-overlay'
            playOverlay.style.cssText = 'position:absolute;left:0;top:0;width:84px;height:84px;border-radius:50%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:6;transform-origin:center center'
            playOverlay.innerHTML = '<svg width="44" height="44" viewBox="0 0 24 24" fill="white"><polygon points="7 4 22 12 7 20"/></svg>'
            c.appendChild(playOverlay)
            const tipBox = document.createElement('div')
            tipBox.className = 'lb-video-tip'
            tipBox.style.cssText = 'position:absolute;left:0;top:0;z-index:6;pointer-events:none;display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(0,0,0,0.55);color:#fff;font:12px/1 system-ui,sans-serif;white-space:nowrap'
            tipBox.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px"><span style="display:inline-block;padding:1px 6px;border:1px solid rgba(255,255,255,0.85);border-radius:3px;font-size:11px;line-height:1.4">Enter</span><span>:</span>${t('gallery.videoPlayHint')}</span>`
            c.appendChild(tipBox)
            let vidTick: any = null
            const updatePos = () => {
              const d = _pbViewerRef?.imageData
              if (d) {
                const cx = (d.x || 0) + (d.width || 0) / 2
                const cy = (d.y || 0) + (d.height || 0) / 2
                playOverlay.style.transform = `translate(${cx - 42}px, ${cy - 42}px)`
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
        // ====== end ======
          const hookBtn = (sel: string, dir: number) => {
            const btn = c.querySelector(sel) as HTMLElement | null
            if (!btn) return
            btn.addEventListener('click', (ev: Event) => {
              ev.stopPropagation(); ev.stopImmediatePropagation()
              const target = curIdx + dir
              if (target >= 0 && target < total) showOne(target)
              else showOverlayToast(t('pinboard.atEnd'))
            }, { capture: true })
          }
          hookBtn('.viewer-prev', -1)
          hookBtn('.viewer-next', 1)
          if (isFirst) {
            c.classList.add('viewer-open-pop')
            setTimeout(() => c.classList.remove('viewer-open-pop'), 140)
          }
        },
      },
      images: [url],
    })

    _pbViewerRef.element?.addEventListener('hidden', () => destroyViewer(), { once: true })
  }

  showOne(curIdx)
}

function openMenu(e: MouseEvent, path: string) {
  const MENU_W = 150
  const MENU_H = 4 * 32 // 4 项 × ~32px 行高（含 padding）
  const margin = 4
  let x = e.clientX
  let y = e.clientY
  if (x + MENU_W + margin > window.innerWidth) x = window.innerWidth - MENU_W - margin
  if (y + MENU_H + margin > window.innerHeight) y = window.innerHeight - MENU_H - margin
  if (x < margin) x = margin
  if (y < margin) y = margin
  menu.visible = true
  menu.x = x
  menu.y = y
  menu.path = path
}

function closeMenu() { menu.visible = false }

async function removeSelected() {
  const path = menu.path
  closeMenu()
  await pinboard.removeImage(path)
}

async function openPinnedDefault() {
  const path = menu.path
  closeMenu()
  if (!path) return
  try {
    await window.picrand.openWithDefault(path)
  } catch (err) {
    console.error('打开失败:', err)
  }
}

// 以图搜图：默认引擎（仅在 imageSearchEnabled 打开时显示）
function searchSelected() {
  const path = menu.path
  closeMenu()
  if (!path) return
  const key = gallery.searchEngine || 'yandex'
  const apiMap: Record<string, string> = { yandex: 'yandexSearch', saucenao: 'saucenaoSearch', tineye: 'tineyeSearch', tracemoe: 'tracemoeSearch', googlelens: 'googlelensSearch' }
  ;(window.picrand as any)?.[apiMap[key]]?.(path)?.catch(() => {})
  pinboard.showToast(t('gallery.imageSearching'), 2000)
}

// 新建参考板：用独立进程打开
async function openRefBoardForSelected() {
  const path = menu.path
  closeMenu()
  if (!path) return
  try {
    const result = await window.picrand.openRefBoard(path)
    if (result && !result.ok) console.error('[RefBoard] Failed:', result.error)
  } catch (e) { console.error(e) }
}

function clearBoard() {
  if (!pinboard.currentBoard) return
  confirmState.visible = true
  confirmState.title = t('pinboard.clearTitle')
  confirmState.message = t('pinboard.clearMsg')
  confirmState.action = 'clear'
}

function cancelConfirm() {
  confirmState.visible = false
  confirmState.action = ''
}

async function runConfirm() {
  const action = confirmState.action
  cancelConfirm()
  if (action === 'clear') { await pinboard.clearCurrent(); document.dispatchEvent(new CustomEvent('picrand-dashboard-refresh')) }
}

function exportBoard() {
  showExportSelector.value = true
}

async function exportToPath() {
  await pinboard.exportCurrent()
}

async function onExportFolderSelected(path: string) {
  showExportSelector.value = false
  await pinboard.exportToFolder(path)
}

async function onExportMultiFoldersSelected(paths: string[]) {
  showExportSelector.value = false
  for (const p of paths) {
    await pinboard.exportToFolder(p)
  }
}

async function favAllInBoard() {
  if (!pinboard.currentBoard) return
  const allPaths = pinboard.currentBoard.images.map(i => i.path)
  let count = 0
  for (const p of allPaths) {
    try {
      await window.picrand.favoriteImage(p)
      count++
    } catch {}
  }
  pinboard.showToast(t('toast.favoritedCount', { count }), 2000)
}

function changeBoard(e: Event) {
  const id = (e.target as HTMLSelectElement).value
  if (id) pinboard.setCurrent(id)
}
</script>

<style scoped>
.pinboard-panel {
  position: absolute;
  left: 0;
  right: 320px;
  bottom: 0;
  height: 38px;
  z-index: 120;
  background: var(--bg-panel-solid);
  border-top: 1px solid var(--border-color);
  color: var(--text-secondary);
  transition: height 0.18s ease;
}
.pinboard-panel.expanded { height: 178px; }

/* 快捷键切换时仅背景层变暗闪一下，不影响内容 */
@keyframes pinboard-flash {
  0%   { opacity: 0; }
  25%  { opacity: 0.07; }
  60%  { opacity: 0; }
  100% { opacity: 0; }
}
.pinboard-panel.flash-dim::before {
  content: "";
  position: absolute; inset: 0;
  pointer-events: none;
  background: #000;
  opacity: 0;
  animation: pinboard-flash 0.2s ease;
  z-index: 5;
}

/* 图钉板设置（齿轮）按钮 */
.pb-settings-btn {
  width: 26px; height: 26px; flex-shrink: 0;
  background: transparent; color: var(--text-muted);
  border: 1px solid var(--border-color); border-radius: 4px;
  font-size: 14px; line-height: 1; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.pb-settings-btn:hover { color: var(--text-primary); filter: brightness(1.15); }
.toggle-btn {
  position: absolute;
  right: 12px;
  top: -18px;
  width: 34px;
  height: 34px;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  background: var(--bg-panel-solid);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.toggle-btn:hover {
  filter: brightness(1.2);
  color: var(--text-primary);
}
.collapsed-bar {
  height: 38px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  font-size: 13px;
  color: var(--text-muted);
}
.expanded-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 10px 56px 10px 12px;
  gap: 8px;
}
.thumb-row {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  min-height: 92px;
}
.empty-text {
  width: 100%;
  text-align: center;
  color: var(--text-hint);
  font-size: 13px;
}
.pin-thumb {
  width: 84px;
  height: 84px;
  flex: 0 0 84px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  cursor: pointer;
}
.pin-thumb:hover { border-color: rgba(142,180,255,0.45); }
.pin-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.bottom-row {
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.switcher { display: flex; align-items: center; gap: 8px; min-width: 280px; }
.current-label { font-size: 12px; color: var(--text-secondary); }
.no-board-text { font-size: 12px; color: var(--text-muted); }
select {
  max-width: 180px;
  height: 28px;
  background: var(--bg-panel-solid);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
}
.actions { display: flex; gap: 8px; flex-wrap: nowrap; }
.actions button {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-input);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}
.actions button:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
.actions button:disabled { opacity: 0.35; cursor: not-allowed; }
.actions .danger { color: #ff6d7a; border-color: rgba(232,17,35,0.3); }
.actions .fav-all-btn {
  width: 28px; height: 28px; border-radius: 50%; padding: 0; border: 1px solid var(--border-color);
  background: transparent; color: var(--text-muted); font-size: 14px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: all 0.15s; flex-shrink: 0;
}
.actions .fav-all-btn:hover:not(:disabled) { background: rgba(255,80,100,0.15); color: #ff5066; border-color: rgba(255,80,100,0.3); }
.actions .fav-all-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.create-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 30000;
  background: var(--overlay-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}
.create-modal {
  width: 360px;
  padding: 22px;
  border-radius: 12px;
  background: var(--bg-panel-solid);
  border: 1px solid var(--border-color);
  box-shadow: 0 20px 60px rgba(0,0,0,0.45);
}
.create-modal h3 {
  margin: 0 0 14px;
  color: var(--text-primary);
  font-size: 16px;
}
.confirm-modal .confirm-message {
  margin: 0 0 18px;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.5;
}
.create-modal input {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  background: var(--bg-panel-solid);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  border-radius: 7px;
  outline: none;
  font-size: 14px;
}
.create-modal input:focus { border-color: rgba(142,180,255,0.65); }
.create-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}
.create-modal-actions button {
  height: 34px;
  padding: 0 18px;
  border: none;
  border-radius: 7px;
  cursor: pointer;
  color: var(--text-primary);
}
.modal-cancel { background: var(--bg-hover); }
.modal-cancel:hover { background: var(--bg-hover); }
.modal-confirm { background: var(--btn-primary-bg); }
.modal-confirm:hover { background: #4a4a7c; }
.pin-menu {
  position: fixed;
  z-index: 20000;
  min-width: 150px;
  background: var(--bg-panel-solid);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 4px 0;
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
}
.pin-menu-item {
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}
.pin-menu-item:hover { background: var(--bg-hover); }
.pin-toast {
  position: absolute;
  right: 16px;
  top: -46px;
  background: var(--bg-toast);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px 14px;
  color: var(--text-secondary);
  font-size: 13px;
  pointer-events: none;
}
.toast-fade-enter-active, .toast-fade-leave-active { transition: opacity 0.25s ease; }
.toast-fade-enter-from, .toast-fade-leave-to { opacity: 0; }
</style>
