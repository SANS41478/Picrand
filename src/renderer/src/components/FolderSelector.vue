<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" @click.self="$emit('cancel')">
      <div class="modal-box" :class="{ wide: viewMode === 'detail' }">
        <div class="fs-header">
          <h2>{{ multi ? t('folderSel.titleMulti') : t('folderSel.title') }}</h2>
          <div class="mode-toggle">
            <button class="mode-btn" :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'" :title="t('folderSel.listMode')">☰</button>
            <button class="mode-btn" :class="{ active: viewMode === 'detail' }" @click="viewMode = 'detail'" :title="t('folderSel.detailMode')">⊞</button>
          </div>
        </div>

        <!-- 工具栏 + 筛选 -->
        <div class="fs-toolbar-row">
          <div class="toolbar">
            <button class="btn-add" @click="handleAddFolder">{{ t('folderMgr.add') }}</button>
            <button v-if="!showNewInput" class="btn-add" @click="openNewInput">{{ t('folderMgr.newFolder') }}</button>
            <div v-else class="new-folder-inline">
              <input
                v-model="newFolderName"
                ref="setNewInput"
                class="new-name-input"
                :placeholder="t('folderMgr.newFolderPlaceholder')"
                @keyup.enter="confirmNewFolder"
                @keyup.esc="cancelNewFolder"
              >
            </div>
          </div>
          <div class="filter-row">
            <input v-model="searchQuery" class="search-input" :placeholder="t('folderSel.searchPlaceholder')" @keyup.esc="searchQuery = ''">
            <button class="fav-filter-btn" :class="{ active: favFilter }" @click="favFilter = !favFilter" :title="t('folderSel.favFilter')">♥ {{ t("folderSel.favFilter") }}</button>
            <button
              v-for="c in filterColorOptions"
              :key="c.value"
              class="filter-dot"
              :class="{ active: filterColor === c.value }"
              :style="c.value ? { background: c.value } : {}"
              :title="c.label"
              @click="filterColor = filterColor === c.value ? '' : c.value"
            ></button>
          </div>
        </div>

        <!-- 列表模式 -->
        <template v-if="viewMode === 'list'">
          <div class="fs-body">
            <div class="fs-left">
              <div class="list-wrap" @dragover.prevent="onContainerDragOver" @drop.prevent="onDrop">
                <div v-if="filteredFolders.length === 0 && !showFavEntry" class="empty">{{ t('folderSel.empty') }}</div>
                <div
                  v-if="showFavEntry"
                  class="folder-row fav-entry"
                  :class="{ selected: selectedId === FAV_ID }"
                  @click="handleFavClick"
                  @dblclick="handleFavDblClick"
                >
                  <div class="fname"><span class="fav-heart">♥</span> {{ t('folder.favorites') }}</div>
                  <div class="fpath">{{ favCount != null ? t('folderSel.count', { n: favCount }) : '' }}</div>
                </div>
                <div
                  v-for="f in filteredFolders"
                  :key="f.id"
                  class="folder-row"
                  :class="{ selected: (multi || localMulti) ? selectedIds.has(f.id) : selectedId === f.id, dragging: dragSrcId === f.id }"
                  draggable="true"
                  :data-folder-id="f.id"
                  @click="handleRowClick(f)"
                  @dragstart="onDragStart($event, f.id)"
                  @drop.prevent="onDrop"
                  @dragend="onDragEnd"
                >
                  <input v-if="multi" type="checkbox" :checked="selectedIds.has(f.id)" class="cb" @click.stop="toggleMulti(f.id)" />
                  <div class="fname" v-if="renameTarget !== f.id">{{ f.display_name || f.path.split('\\').pop() }}</div>
                  <input
                    v-else
                    ref="setRenameInput"
                    v-model="renameName"
                    class="rename-input"
                    @keyup.enter="confirmRename(f)"
                    @keyup.esc="cancelRename"
                    @blur="confirmRename(f)"
                    @click.stop
                  >
                  <div class="fpath" :title="f.path">{{ f.path }}</div>
                  <span v-if="f.color || f.is_favorite" class="color-dot" :class="{ heart: f.is_favorite }" :style="f.is_favorite ? (f.color ? { color: f.color, fontSize: '18px', lineHeight: '1' } : { color: '#fff', fontSize: '18px', lineHeight: '1' }) : { background: f.color }">{{ f.is_favorite ? '♥' : '' }}</span>
                  <div class="folder-actions" v-if="renameTarget !== f.id">
                    <button class="btn-sm" @click.stop="startRename(f)">{{ t('folderMgr.rename') }}</button>
                    <button class="btn-sm btn-del" @click.stop="handleDeleteFolder(f)">{{ t('folderMgr.delete') }}</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="fs-right">
              <div v-if="!detailFolder" class="detail-empty">{{ t('folderMgr.selectHint') }}</div>
              <div v-else class="detail-content" ref="detailScroll">
                 <div class="detail-name">
                    <span class="detail-name-text">{{ detailFolder.display_name || detailFolder.path.split('\\').pop() }}</span>
                    <span class="detail-fav" @click="toggleDetailFav" :title="detailFolder.is_favorite ? t('folderMgr.unfavoriteFolder') : t('folderMgr.favoriteFolder')" :style="{ fontSize:'30px', lineHeight:'1', cursor:'pointer', color: detailFolder.is_favorite ? (detailFolder.color || '#ff5066') : 'var(--text-muted)' }">{{ detailFolder.is_favorite ? '♥' : '♡' }}</span>
                  </div>
                  <div class="detail-cover" @click="openCoverImage" :title="t('folderMgr.changeCover')" style="cursor: pointer">
                    <img v-if="coverSrc" :src="coverSrc" class="cover-img" :alt="detailFolder.display_name" draggable="false" @dragstart.prevent>
                    <span v-else class="cover-placeholder">📁</span>
                  </div>
                  <div class="detail-info">
                    <div class="info-row">
                      <span class="info-label">{{ t('folderMgr.folderPath') }}</span>
                      <span class="info-value path-val clickable" :title="detailFolder.path" @click="openFolderPath(detailFolder.path)">{{ detailFolder.path }}</span>
                    </div>
                    <div class="info-row">
                      <span class="info-label">{{ t('folderMgr.imageCount') }}</span>
                      <span class="info-value">{{ stats ? stats.count : '...' }}</span>
                    </div>
                    <div class="info-row">
                      <span class="info-label">{{ t('folderMgr.folderSize') }}</span>
                      <span class="info-value">{{ stats ? formatSize(stats.totalSize) : '...' }}</span>
                    </div>
                    <div class="info-row info-row-desc">
                      <span class="info-label">{{ t('folderMgr.desc') }}</span>
                      <textarea
                        class="folder-desc-input"
                        v-model="detailFolder.description"
                        :placeholder="t('folderMgr.descPlaceholder')"
                        rows="2"
                        @blur="saveFolderDesc"
                      ></textarea>
                    </div>
                    <div class="info-row">
                      <div class="color-options">
                        <button
                          v-for="c in detailColorOptions"
                          :key="c.value"
                          class="color-dot-detail"
                          :class="{ active: detailColor === c.value }"
                          :style="c.value ? { background: c.value } : {}"
                          :title="c.label"
                          @click="setDetailColor(c.value)"
                        ></button>
                      </div>
                    </div>
              </div>
            </div>
          </div>
          </div>
        </template>

        <!-- 详细模式：网格卡片 -->
        <template v-else>
          <div class="grid-wrap" @dragover.prevent="onContainerDragOver" @drop.prevent="onDrop">
            <div v-if="filteredFolders.length === 0 && !showFavEntry" class="empty">{{ t('folderSel.empty') }}</div>
            <div
              v-if="showFavEntry"
              class="grid-item fav-card"
              :class="{ selected: selectedId === FAV_ID }"
              @click="handleFavClick"
              @dblclick="handleFavDblClick"
            >
              <div class="grid-top">
                <div class="grid-cover">
                  <img v-if="favCover" :src="favCover" class="grid-cover-img" draggable="false" @dragstart.prevent>
                  <span v-else class="grid-cover-placeholder fav-heart">♥</span>
                </div>
                <div class="grid-thumbs">
                  <div v-for="(tp, ti) in favThumbs" :key="'ft'+ti" class="grid-thumb">
                    <img :src="tp" class="grid-thumb-img" draggable="false" @dragstart.prevent>
                  </div>
                  <div v-for="i in (3 - favThumbs.length)" :key="'fe'+i" class="grid-thumb grid-thumb-empty-slot"></div>
                </div>
              </div>
              <div class="grid-info">
                <div class="grid-name">
                  <span class="grid-name-text">{{ t('folder.favorites') }}</span>
                  <span class="fav-heart">♥</span>
                </div>
                <div class="grid-meta">
                  <span>{{ favCount != null ? t('folderSel.count', { n: favCount }) : '...' }}</span>
                  <span>{{ favTotalSize ? formatSize(favTotalSize) : '' }}</span>
                </div>
              </div>
            </div>
            <div
              v-for="f in filteredFolders"
              :key="f.id"
              class="grid-item"
              :class="{ selected: (multi || localMulti) ? selectedIds.has(f.id) : selectedId === f.id, dragging: dragSrcId === f.id }"
              draggable="true"
              :data-folder-id="f.id"
              @click="handleGridClick(f)"
              @contextmenu.prevent="openGridContextMenu($event, f)"
              @dragstart="onDragStart($event, f.id)"
              @dragend="onDragEnd"
            >
              <div class="grid-top">
                <div class="grid-cover">
                  <img v-if="gridCovers.get(f.id)" :src="gridCovers.get(f.id)" class="grid-cover-img" :alt="f.display_name" draggable="false" @dragstart.prevent>
                  <span v-else class="grid-cover-placeholder">📁</span>
                </div>
                <div class="grid-thumbs">
                  <div v-for="(tp, ti) in (gridThumbs.get(f.id) || []).slice(0, 3)" :key="ti" class="grid-thumb">
                    <img v-if="tp" :src="tp" class="grid-thumb-img" draggable="false" @dragstart.prevent>
                    <span v-else class="grid-thumb-empty"></span>
                  </div>
                  <div v-for="i in (3 - (gridThumbs.get(f.id) || []).length)" :key="'e'+i" class="grid-thumb grid-thumb-empty-slot"></div>
                </div>
              </div>
              <div class="grid-info">
                <div class="grid-name" v-if="renameTarget !== f.id">
                  <span class="grid-name-text">{{ f.display_name || f.path.split('\\').pop() }}</span>
                  <span v-if="f.color || f.is_favorite" class="grid-color-dot" :class="{ heart: f.is_favorite }" :style="f.is_favorite ? (f.color ? { color: f.color, fontSize: '15px', lineHeight: '1' } : { color: '#fff', fontSize: '15px', lineHeight: '1' }) : { background: f.color }">{{ f.is_favorite ? '♥' : '' }}</span>
                </div>
                <input
                  v-else
                  v-model="renameName"
                  class="rename-input-grid"
                  @keyup.enter="confirmRename(f)"
                  @keyup.esc="cancelRename"
                  @blur="confirmRename(f)"
                  @click.stop
                >
                <div class="grid-path clickable" :title="f.path" @click.stop="openFolderPath(f.path)">{{ f.path }}</div>
                <div class="grid-meta">
                  <span>{{ gridStats.get(f.id)?.count != null ? t('folderSel.count', { n: gridStats.get(f.id)!.count }) : '...' }}</span>
                  <span>{{ gridStats.get(f.id) ? formatSize(gridStats.get(f.id)!.totalSize) : '...' }}</span>
                </div>
                <div class="grid-actions" v-if="renameTarget !== f.id">
                  <button class="btn-sm-grid" @click.stop="startRename(f)">{{ t('folderMgr.rename') }}</button>
                  <button class="btn-sm-grid btn-del" @click.stop="handleDeleteFolder(f)">{{ t('folderMgr.delete') }}</button>
                </div>
              </div>
            </div>
          </div>
        </template>

        <div class="actions">
          <label v-if="!multi" class="multi-toggle" :title="t('folderSel.multiMode')">
            <span class="multi-label">{{ t('folderSel.multiMode') }}</span>
            <span class="toggle-track" :class="{ on: localMulti }" @click="localMulti = !localMulti; onMultiToggle()">
              <span class="toggle-knob"></span>
            </span>
          </label>
          <div class="actions-right">
            <button class="btn-cancel" @click="$emit('cancel')">{{ t('folderSel.cancel') }}</button>
            <button class="btn-confirm" :disabled="(multi || localMulti) ? selectedIds.size === 0 : selectedId === null" @click="doEmit">
              {{ multi || localMulti ? t('folderSel.confirmMulti', { n: selectedIds.size }) : t('folderSel.confirm') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 卡片右键菜单 (Teleported to body) -->
    <div v-if="gridCtxMenu.visible" class="grid-ctx-menu" :style="{ left: gridCtxMenu.x + 'px', top: gridCtxMenu.y + 'px' }">
      <textarea
        class="grid-ctx-desc"
        v-model="gridCtxMenu.folder.description"
        :placeholder="t('folderMgr.descPlaceholder')"
        rows="2"
        @click.stop
        @blur="saveGridDescInline"
      ></textarea>
      <div class="grid-ctx-item" @click="selectGridCover">{{ t('folderMgr.changeCoverShort') }}</div>
      <div class="grid-ctx-color-row">
        <button
          v-for="c in detailColorOptions"
          :key="c.value"
          class="grid-ctx-color-dot"
          :style="c.value ? { background: c.value } : {}"
          :title="c.label"
          @click="setGridColor(c.value)"
        ></button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick, reactive, onMounted, onUnmounted } from 'vue'
import { useI18n } from '../i18n'

const props = defineProps<{ visible: boolean; multi?: boolean; showFavorites?: boolean }>()
const emit = defineEmits<{ select: [path: string]; 'selectMulti': [paths: string[]]; selectFavorites: []; cancel: [] }>()

const { t } = useI18n()

const folders = ref<any[]>([])
const selectedId = ref<number | null>(null)
// 收藏夹虚拟项：不是真实文件夹，用 -1 作为哨兵 id，不参与拖拽/多选/重命名/删除
const FAV_ID = -1
const selectedIds = ref<Set<number>>(new Set())
const hoverId = ref<number | null>(null)
const detailScroll = ref<HTMLElement | null>(null)
const searchQuery = ref('')
const filterColor = ref('')
const favFilter = ref(false)
const detailFolder = computed(() => folders.value.find(f => f.id === hoverId.value) || null)
// 切换 hover 的文件夹时，详情区滚动位置回到顶部
watch(hoverId, () => {
  nextTick(() => { if (detailScroll.value) detailScroll.value.scrollTop = 0 })
})
const detailColor = ref('')
const stats = ref<{ count: number; totalSize: number; latestPath: string | null; latestThumb: string | null; recentPaths: { file_path: string; thumbnail_path: string | null }[] } | null>(null)
const viewMode = ref<'list' | 'detail'>((localStorage.getItem('folderSelViewMode') as 'list' | 'detail') || 'list')
const localMulti = ref(false)  // 单个选择器内部的多选模式开关

// 网格模式缓存
const gridCovers = ref<Map<number, string>>(new Map())
const gridThumbs = ref<Map<number, string[]>>(new Map())
const gridStats = ref<Map<number, { count: number; totalSize: number }>>(new Map())

// 卡片右键菜单
const gridCtxMenu = reactive<{ visible: boolean; x: number; y: number; folder: any }>({ visible: false, x: 0, y: 0, folder: null })

// 文件夹管理：新建/重命名/删除
const showNewInput = ref(false)
const newFolderName = ref('')
let newInput: HTMLInputElement | null = null
const renameTarget = ref<number | null>(null)
const renameName = ref('')
let renameInput: HTMLInputElement | null = null

function openNewInput() {
  showNewInput.value = true
  nextTick(() => {
    // 尝试用 ref，回退 document.querySelector
    let el = (newInput as HTMLInputElement | null)
    if (!el) el = (document.querySelector('.new-name-input') as HTMLInputElement | null)
    if (el) { el.focus(); el.select() }
  })
}
function setNewInput(el: any) { if (el) { newInput = el as HTMLInputElement; el.focus(); el.select() } }
function setRenameInput(el: any) { if (el) { renameInput = el as HTMLInputElement; renameInput.focus(); renameInput.select() } }

const filterColorOptions = [
  { value: '#e74c3c', label: t('color.red') },
  { value: '#e67e22', label: t('color.orange') },
  { value: '#f1c40f', label: t('color.yellow') },
  { value: '#2ecc71', label: t('color.green') },
  { value: '#3498db', label: t('color.blue') },
]

const detailColorOptions = [
  { value: '', label: t('color.none') },
  ...filterColorOptions,
]

const filteredFolders = computed(() => {
  let list = folders.value
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(f => {
      const name = (f.display_name || f.path.split('\\').pop() || '').toLowerCase()
      return name.includes(q) || (f.path || '').toLowerCase().includes(q)
    })
  }
  if (filterColor.value) {
    list = list.filter(f => (f.color || '') === filterColor.value)
  }
  if (favFilter.value) {
    list = list.filter(f => f.is_favorite == 1)
  }
  return list
})

// ── 收藏夹虚拟项 ──
// 仅主视图切换场景显示（App.vue 传 showFavorites）；导出/另存为场景仍是纯路径操作，不显示
const favCount = ref<number | null>(null)
const favTotalSize = ref(0)
const favCover = ref('')
const favThumbs = ref<string[]>([])

const showFavEntry = computed(() => {
  if (!props.showFavorites) return false
  // 颜色/收藏筛选针对文件夹属性，收藏夹无这些属性 → 跟随隐藏
  if (filterColor.value || favFilter.value) return false
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    if (!t('folder.favorites').toLowerCase().includes(q)) return false
  }
  return true
})

async function loadFavoritesSummary() {
  favCount.value = null
  favTotalSize.value = 0
  favCover.value = ''
  favThumbs.value = []
  if (!props.showFavorites) return
  try {
    const imgs: any[] = await window.picrand.loadFavorites?.() || []
    favCount.value = imgs.length
    favTotalSize.value = imgs.reduce((s: number, im: any) => s + (im.file_size || 0), 0)
    const toUrl = (im: any) => `picrand://get-image?orig=${encodeURIComponent(im.file_path)}${im.thumbnail_path ? '&thumb=' + encodeURIComponent(im.thumbnail_path) : ''}`
    const picks = imgs.length <= 4 ? imgs : [...imgs].sort(() => Math.random() - 0.5).slice(0, 4)
    if (picks[0]) favCover.value = toUrl(picks[0])
    favThumbs.value = picks.slice(1, 4).map(toUrl)
  } catch {}
}

function handleFavClick() {
  if (props.multi || localMulti.value) return
  selectedId.value = FAV_ID
  hoverId.value = null
  stats.value = null
}

function handleFavDblClick() {
  if (props.multi || localMulti.value) return
  selectedId.value = FAV_ID
  emit('selectFavorites')
}

// 网格模式加载：一次 IPC 拿所有文件夹的统计+封面+缩略图 URL。
// 旧方案 loadAllGridStats() 每个文件夹 2 次 IPC（getFolderStats + getFolderRandomThumbs），
// 20 个文件夹 = 40 次往返 + picrand:// 协议即时解码争抢主进程。
// 新方案：主进程侧组装好 URL 一次性返回，fire-and-forget 渐进填充 Map，
// 卡片立即渲染占位符，数据到达后原地替换，不阻塞首屏。
let _gridLoadSeq = 0

async function loadGridDataFireAndForget() {
  const seq = ++_gridLoadSeq
  try {
    const data = await window.picrand.getAllFolderGridData?.()
    if (!data || seq !== _gridLoadSeq) return // 窗口已关闭或已重载
    // 渐进填充：每帧处理一批，避免大量 Map 更新卡 UI
    const entries = Object.entries(data)
    let idx = 0
    const BATCH = 4 // 每帧填充 4 个文件夹
    function fillBatch() {
      if (seq !== _gridLoadSeq) return
      const end = Math.min(idx + BATCH, entries.length)
      for (let i = idx; i < end; i++) {
        const [fidStr, d] = entries[i]
        const fid = Number(fidStr)
        gridStats.value.set(fid, { count: d.count, countCapped: d.countCapped, totalSize: d.totalSize })
        if (d.coverUrl) gridCovers.value.set(fid, d.coverUrl)
        if (d.thumbUrls && d.thumbUrls.length > 0) gridThumbs.value.set(fid, d.thumbUrls)
      }
      gridStats.value = new Map(gridStats.value)
      gridCovers.value = new Map(gridCovers.value)
      gridThumbs.value = new Map(gridThumbs.value)
      idx = end
      if (idx < entries.length) {
        requestAnimationFrame(fillBatch)
      }
    }
    requestAnimationFrame(fillBatch)
  } catch {}
}

watch(() => props.visible, async (v) => {
  if (v) {
    selectedId.value = null
    selectedIds.value = new Set()
    hoverId.value = null
    stats.value = null
    searchQuery.value = ''
    filterColor.value = ''
    favFilter.value = false
    localMulti.value = false
    showNewInput.value = false
    newFolderName.value = ''
    renameTarget.value = null
    gridCovers.value = new Map()
    gridThumbs.value = new Map()
    gridStats.value = new Map()
    refreshFolders()
    loadFavoritesSummary()
    if (viewMode.value === 'detail') {
      loadGridDataFireAndForget()
    }
  }
})

watch(viewMode, async (mode) => {
  if (mode === 'list' || mode === 'detail') localStorage.setItem('folderSelViewMode', mode)
  if (mode === 'detail') {
    loadGridDataFireAndForget()
  }
})

async function refreshFolders() {
  try { folders.value = await window.picrand.getAllFolders() } catch { folders.value = [] }
}

onMounted(() => { document.addEventListener('click', closeGridCtxMenu) })
onUnmounted(() => { document.removeEventListener('click', closeGridCtxMenu) })

async function handleAddFolder() {
  const result = await window.picrand.addFolder()
  if (result) { folders.value.unshift(result) }
}

async function confirmNewFolder() {
  const name = newFolderName.value.trim()
  if (!name) { cancelNewFolder(); return }
  try {
    const result = await window.picrand.addFolderNew?.(name)
    if (result) folders.value.unshift(result)
  } catch {}
  cancelNewFolder()
}

function cancelNewFolder() {
  showNewInput.value = false
  newFolderName.value = ''
}

function startRename(f: any) {
  renameTarget.value = f.id
  renameName.value = f.display_name || f.path.split('\\').pop() || ''
  nextTick(() => {
    renameInput?.focus()
    renameInput?.select()
  })
}

async function confirmRename(f: any) {
  if (renameTarget.value !== f.id) return
  renameTarget.value = null
  const name = renameName.value.trim()
  if (!name) return
  try {
    await window.picrand.updateFolderName(f.id, name)
    f.display_name = name
  } catch {}
}

function cancelRename() {
  renameTarget.value = null
}

async function handleDeleteFolder(f: any) {
  if (!confirm(t('folderMgr.confirm'))) return
  await window.picrand.deleteFolder(f.id, f.path)
  folders.value = folders.value.filter(x => x.id !== f.id)
  if (selectedId.value === f.id) { selectedId.value = null }
  if (hoverId.value === f.id) { hoverId.value = null; stats.value = null }
  document.dispatchEvent(new CustomEvent('picrand-dashboard-refresh'))
}

async function loadGridStats(f: any) {
  if (gridStats.value.has(f.id)) return
  try {
    const s = await window.picrand.getFolderStats?.(f.id)
    if (!s) return
    gridStats.value.set(f.id, { count: s.count, countCapped: s.countCapped, totalSize: s.totalSize })
    if (s.latestPath) {
      const orig = encodeURIComponent(s.latestPath)
      const thumb = s.latestThumb ? `&thumb=${encodeURIComponent(s.latestThumb)}` : ''
      gridCovers.value.set(f.id, `picrand://get-image?orig=${orig}${thumb}`)
    }
    let thumbs: string[] = []
    try {
      const rimgs: any[] = await window.picrand.getFolderRandomThumbs?.(f.id, 3) || []
      thumbs = rimgs.map(im => {
        const o = encodeURIComponent(im.file_path)
        const t = im.thumbnail_path ? `&thumb=${encodeURIComponent(im.thumbnail_path)}` : ''
        return `picrand://get-image?orig=${o}${t}`
      })
    } catch {}
    gridThumbs.value.set(f.id, thumbs)
  } catch {}
}

let _clickTimer: ReturnType<typeof setTimeout> | null = null
let _lastClickedId: number | null = null

function handleRowClick(f: any) {
  if (_clickTimer && _lastClickedId === f.id) {
    clearTimeout(_clickTimer); _clickTimer = null; _lastClickedId = null
    if (localMulti.value) return  // 多选模式禁用双击
    if (props.multi) { toggleMulti(f.id); doEmit() }
    else { selectedId.value = f.id; doEmit() }
    return
  }
  _lastClickedId = f.id
  if (props.multi || localMulti.value) { toggleMulti(f.id) }
  else { selectedId.value = f.id }
  hoverId.value = f.id
  loadStats(f)
  _clickTimer = setTimeout(() => { _clickTimer = null; _lastClickedId = null }, 320)
}

function handleGridClick(f: any) {
  if (_clickTimer && _lastClickedId === f.id) {
    clearTimeout(_clickTimer); _clickTimer = null; _lastClickedId = null
    if (localMulti.value) return  // 多选模式禁用双击
    if (props.multi) { toggleMulti(f.id); doEmit() }
    else { selectedId.value = f.id; doEmit() }
    return
  }
  _lastClickedId = f.id
  if (props.multi || localMulti.value) { toggleMulti(f.id) }
  else { selectedId.value = f.id }
  _clickTimer = setTimeout(() => { _clickTimer = null; _lastClickedId = null }, 320)
}

async function loadStats(f: any) {
  stats.value = null
  try { const s = await window.picrand.getFolderStats?.(f.id); if (s) stats.value = s } catch {}
}

async function openCoverImage() {
  if (!detailFolder.value) return
  const folderPath = detailFolder.value.path
  const newCover = await window.picrand.selectCoverImage?.(folderPath)
  if (newCover) {
    await window.picrand.updateFolderCover?.(detailFolder.value.id, newCover)
    // 立即刷新封面：列表模式右侧面板 + 卡片模式缓存都更新
    stats.value = null
    try { const s = await window.picrand.getFolderStats?.(detailFolder.value.id); if (s) stats.value = s } catch {}
    // 重建卡片模式下的封面 URL（含缓存破坏参数确保立即生效）
    await refreshGridCover(detailFolder.value.id)
  }
}

function toggleMulti(id: number) {
  const s = new Set(selectedIds.value)
  if (s.has(id)) s.delete(id); else s.add(id)
  selectedIds.value = s
}

function doEmit() {
  if (props.multi || localMulti.value) {
    const paths = folders.value.filter(f => selectedIds.value.has(f.id)).map(f => f.path)
    if (paths.length) emit('selectMulti', paths)
  } else {
    if (selectedId.value === FAV_ID) { emit('selectFavorites'); return }
    const f = folders.value.find(x => x.id === selectedId.value)
    if (f) emit('select', f.path)
  }
}

function onMultiToggle() {
  selectedId.value = null
  selectedIds.value = new Set()
}

function openGridContextMenu(e: MouseEvent, f: any) {
  gridCtxMenu.visible = true
  gridCtxMenu.x = e.clientX
  gridCtxMenu.y = e.clientY
  gridCtxMenu.folder = f
}

function closeGridCtxMenu() {
  gridCtxMenu.visible = false
}

async function setGridColor(color: string) {
  const f = gridCtxMenu.folder
  if (!f) return
  f.color = color
  await window.picrand.updateFolderColor?.(f.id, color)
  closeGridCtxMenu()
}

async function saveFolderDesc() {
  const f = detailFolder.value
  if (!f) return
  try { await window.picrand.updateFolderDescription?.(f.id, f.description || '') } catch {}
}

async function saveGridDescInline() {
  const f = gridCtxMenu.folder
  if (!f) return
  try { await window.picrand.updateFolderDescription?.(f.id, f.description || '') } catch {}
}

async function selectGridCover() {
  const f = gridCtxMenu.folder
  if (!f) return
  closeGridCtxMenu()
  const newCover = await window.picrand.selectCoverImage?.(f.path)
  if (newCover) {
    await window.picrand.updateFolderCover?.(f.id, newCover)
    await refreshGridCover(f.id)
    // 若正在列表中查看此文件夹的详情，也同时刷新右侧面板
    if (detailFolder.value?.id === f.id) {
      stats.value = null
      try { const s = await window.picrand.getFolderStats?.(f.id); if (s) stats.value = s } catch {}
    }
  }
}

// 刷新指定文件夹在卡片模式下的封面 URL
async function refreshGridCover(folderId: number) {
  try {
    const s = await window.picrand.getFolderStats?.(folderId)
    if (s?.latestPath) {
      const orig = encodeURIComponent(s.latestPath)
      const thumb = s.latestThumb ? `&thumb=${encodeURIComponent(s.latestThumb)}` : ''
      gridCovers.value.set(folderId, `picrand://get-image?orig=${orig}${thumb}`)
    } else {
      gridCovers.value.delete(folderId)
    }
    gridCovers.value = new Map(gridCovers.value)
  } catch {}
}

// ── 拖拽排序 ──
const dragSrcId = ref<number | null>(null)
let _dragClone: HTMLElement | null = null
let _dragSrcIdx = -1

function onDragStart(e: DragEvent, id: number) {
  dragSrcId.value = id
  _dragSrcIdx = folders.value.findIndex((f: any) => f.id === id)
  const el = e.currentTarget as HTMLElement
  const w = el.offsetWidth, h = el.offsetHeight
  _dragClone = el.cloneNode(true) as HTMLElement
  _dragClone.style.cssText = `position:fixed;z-index:99999;pointer-events:none;width:${w}px;height:${h}px;opacity:0.85;box-shadow:0 8px 28px rgba(0,0,0,0.5);left:${e.clientX - w/2}px;top:${e.clientY - h/2}px;border-radius:6px`
  document.body.appendChild(_dragClone)
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    const g = document.createElement('div'); g.style.cssText = 'width:1px;height:1px'
    document.body.appendChild(g); e.dataTransfer.setDragImage(g, 0, 0)
    setTimeout(() => document.body.removeChild(g), 0)
  }
  document.addEventListener('dragover', moveClone)
}

function moveClone(e: Event) {
  if (!_dragClone) return
  const de = e as DragEvent
  _dragClone.style.left = `${de.clientX - _dragClone.offsetWidth / 2}px`
  _dragClone.style.top = `${de.clientY - _dragClone.offsetHeight / 2}px`
}

// ── FLIP 动画 ──
let _flipRaf: number | null = null

function killFlip(sel: string) {
  if (_flipRaf != null) { cancelAnimationFrame(_flipRaf); _flipRaf = null }
  document.querySelectorAll(sel).forEach((el: Element) => {
    const e = el as HTMLElement
    if (e.style.transform) { e.style.transition = 'none'; e.style.transform = '' }
  })
}

function snapshot(sel: string, excludeId: number | null): Map<string, DOMRect> {
  const map = new Map<string, DOMRect>()
  document.querySelectorAll(sel).forEach((el: Element) => {
    const fid = (el as HTMLElement).getAttribute('data-folder-id')
    if (fid && Number(fid) !== excludeId) map.set(fid, el.getBoundingClientRect())
  })
  return map
}

function flipAnimate(prev: Map<string, DOMRect>, sel: string, excludeId: number | null) {
  _flipRaf = requestAnimationFrame(() => {
    _flipRaf = null
    document.querySelectorAll(sel).forEach((el: Element) => {
      const e = el as HTMLElement
      const fid = e.getAttribute('data-folder-id')
      if (!fid || Number(fid) === excludeId) return
      const old = prev.get(fid); if (!old) return
      const now = e.getBoundingClientRect()
      const dx = old.left - now.left; const dy = old.top - now.top
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
      e.style.transition = 'none'
      e.style.transform = `translate(${dx}px,${dy}px)`
      requestAnimationFrame(() => {
        e.style.transition = 'transform 0.2s ease-out'
        e.style.transform = ''
      })
    })
  })
}

// 列表模式：mouse 在哪个卡片的上半/下半决定插入前/后
function getListInsert(clientX: number, clientY: number): number {
  if (_dragClone) _dragClone.style.display = 'none'
  const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null
  if (_dragClone) _dragClone.style.display = ''
  const row = el?.closest('[data-folder-id]') as HTMLElement | null
  if (!row) return -1
  const id = Number(row.getAttribute('data-folder-id'))
  if (!id || id === dragSrcId.value) return -1
  const dstIdx = folders.value.findIndex((f: any) => f.id === id)
  if (dstIdx < 0) return -1
  const overTop = clientY < row.getBoundingClientRect().top + row.offsetHeight * 0.5
  return overTop ? dstIdx : dstIdx + 1
}

// 网格模式：流式扫描（左→右，上→下），找到第一个"在克隆体之后"的卡片
function getGridInsert(): number {
  if (!_dragClone) return -1
  const cx = _dragClone.offsetLeft + _dragClone.offsetWidth / 2
  const cy = _dragClone.offsetTop + _dragClone.offsetHeight / 2
  const cards: Array<{ idx: number; rect: DOMRect }> = []
  document.querySelectorAll('.grid-item').forEach((el: Element) => {
    const fid = (el as HTMLElement).getAttribute('data-folder-id')
    if (!fid) return
    if (Number(fid) === dragSrcId.value) return
    const idx = folders.value.findIndex((f: any) => f.id === Number(fid))
    if (idx >= 0) cards.push({ idx, rect: el.getBoundingClientRect() })
  })
  cards.sort((a, b) => a.idx - b.idx)
  if (!cards.length) return -1
  const gapY = 10
  for (const card of cards) {
    const top = card.rect.top
    const bot = card.rect.bottom
    const midX = card.rect.left + card.rect.width / 2
    // 克隆体在卡片上一行以上 → 插入到此卡片前
    if (cy + gapY < top) return card.idx
    // 克隆体在同一行且在卡片左侧 → 插入到此卡片前
    if (cy >= top && cy <= bot && cx < midX) return card.idx
  }
  // 克隆体在所有卡片之后 → 插入末尾
  return folders.value.length
}

function onContainerDragOver(e: DragEvent) {
  const insertBefore = viewMode.value === 'list'
    ? getListInsert(e.clientX, e.clientY)
    : getGridInsert()
  if (insertBefore < 0 || insertBefore === _dragSrcIdx) return

  const sel = viewMode.value === 'list' ? '.folder-row' : '.grid-item'
  killFlip(sel)
  const prev = snapshot(sel, dragSrcId.value)

  const arr = [...folders.value]
  const [moved] = arr.splice(_dragSrcIdx, 1)
  const pos = insertBefore > _dragSrcIdx ? insertBefore - 1 : insertBefore
  arr.splice(pos, 0, moved)
  folders.value = arr
  _dragSrcIdx = pos

  nextTick(() => flipAnimate(prev, sel, dragSrcId.value))
}

async function onDragEnd() {
  document.removeEventListener('dragover', moveClone)
  if (_dragClone) { _dragClone.remove(); _dragClone = null }
  killFlip(viewMode.value === 'list' ? '.folder-row' : '.grid-item')
  // dragend 必触发：在此保存当前顺序到 DB，避免 drop 未触发时丢失排序
  const id = dragSrcId.value
  const order = folders.value.map((f: any) => f.id)
  dragSrcId.value = null
  _dragSrcIdx = -1
  if (id != null) {
    try { await window.picrand.reorderFolders?.(order) } catch {}
  }
}

function onDrop() {
  document.removeEventListener('dragover', moveClone)
  if (_dragClone) { _dragClone.remove(); _dragClone = null }
  killFlip(viewMode.value === 'list' ? '.folder-row' : '.grid-item')
  // 顺序保存由 onDragEnd 统一处理（dragend 比 drop 更可靠触发）
}

const coverSrc = computed(() => {
  if (!stats.value?.latestPath) return ''
  const lp = stats.value.latestPath
  const orig = encodeURIComponent(lp)
  const thumb = stats.value.latestThumb ? `&thumb=${encodeURIComponent(stats.value.latestThumb)}` : ''
  return `picrand://get-image?orig=${orig}${thumb}`
})

function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

function openFolderPath(path: string) {
  window.picrand.openInFolder(path)
}

async function toggleDetailFav() {
  const f = detailFolder.value
  if (!f) return
  f.is_favorite = f.is_favorite ? 0 : 1
  await window.picrand.toggleFolderFavorite?.(f.id, f.is_favorite)
  const f2 = folders.value.find(x => x.id === f.id)
  if (f2) f2.is_favorite = f.is_favorite
}

async function setDetailColor(color: string) {
  const f = detailFolder.value
  if (!f) return
  detailColor.value = color
  f.color = color
  await window.picrand.updateFolderColor?.(f.id, color)
  const f2 = folders.value.find(x => x.id === f.id)
  if (f2) f2.color = color
}
defineExpose({ refreshFolders })
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: var(--overlay-bg);
  display: flex; align-items: center; justify-content: center;
}
.modal-box {
  background: var(--bg-panel-solid); border: 1px solid var(--border-color);
  border-radius: 0; padding: 24px; width: 820px; height: 580px;
  max-width: 92vw; max-height: 85vh; display: flex; flex-direction: column;
}
.modal-box.wide { width: 1020px; height: 740px; }

.fs-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; flex-shrink: 0; }
h2 { margin: 0; font-size: 16px; color: var(--text-primary); flex-shrink: 0; }

.fs-toolbar-row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; flex-shrink: 0; }
.filter-row { display: flex; align-items: center; gap: 4px; }
.search-input {
  height: 28px; width: 160px; padding: 0 10px; border: 1px solid var(--border-color); border-radius: 6px;
  background: var(--bg-input); color: var(--text-primary); font-size: 12px; outline: none;
}
.search-input:focus { border-color: rgba(142,180,255,0.5); }
.search-input::placeholder { color: var(--text-muted); }
.filter-dot {
  width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--border-color);
  cursor: pointer; transition: all 0.15s; flex-shrink: 0; padding: 0;
}
.filter-dot.active { border-color: var(--text-primary); transform: scale(1.15); }
.filter-dot:hover { border-color: var(--text-secondary); }
.fav-filter-btn {
  height: 22px; padding: 0 10px; border: 1px solid var(--border-color); border-radius: 11px;
  background: transparent; cursor: pointer; font-size: 11px; line-height: 1;
  color: var(--text-muted); flex-shrink: 0; transition: all 0.15s;
  display: flex; align-items: center; gap: 4px; white-space: nowrap;
}
.fav-filter-btn:hover { border-color: rgba(255,80,100,0.4); color: #ff5066; }
.fav-filter-btn.active { border-color: rgba(255,80,100,0.5); color: #ff5066; background: rgba(255,80,100,0.08); }

.mode-toggle { display: flex; gap: 4px; }
.mode-btn {
  width: 30px; height: 30px; border: 1px solid var(--border-color); border-radius: 6px;
  background: transparent; color: var(--text-muted); font-size: 16px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: all 0.15s;
}
.mode-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.mode-btn.active { background: var(--btn-primary-bg); color: var(--text-primary); border-color: var(--btn-primary-bg); }

/* 工具栏 */
.toolbar { display: flex; gap: 6px; flex-shrink: 0; align-items: center; }
.btn-add {
  height: 24px; padding: 0 11px; border: none; border-radius: 6px;
  background: var(--btn-primary-bg); color: var(--text-primary); font-size: 11px; cursor: pointer;
}
.btn-add:hover { background: var(--btn-primary-hover); }
.new-folder-inline { display: flex; align-items: center; }
.new-name-input {
  height: 24px; width: 160px; padding: 0 10px; border: 1px solid var(--border-color); border-radius: 6px;
  background: var(--bg-input-solid); color: var(--text-primary); font-size: 11px; outline: none;
}
.new-name-input:focus { border-color: rgba(142,180,255,0.5); }

/* 列表模式 */
.fs-body { display: flex; gap: 16px; flex: 1; min-height: 0; }
.fs-left { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.list-wrap { flex: 1; overflow-y: auto; min-height: 80px; }
.empty { text-align: center; color: var(--text-hint); font-size: 14px; padding: 24px 0; line-height: 1.8; }

/* 收藏夹固定项（复合选择器提高优先级，覆盖 .folder-row/.grid-item 的默认背景） */
.fav-heart { color: #ff5066; }
.folder-row.fav-entry { background: rgba(255, 80, 102, 0.1); }
.folder-row.fav-entry:hover { background: rgba(255, 80, 102, 0.16); }
.grid-item.fav-card { background: rgba(255, 80, 102, 0.1); }
.grid-item.fav-card:hover { background: rgba(255, 80, 102, 0.16); }
.fav-entry .fname { display: flex; align-items: center; gap: 4px; }

.folder-row {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 8px; border-radius: 6px; cursor: pointer;
  background: var(--bg-input); margin-bottom: 4px;
  border: 1px solid transparent; transition: background 0.15s;
}
.cb { width: 16px; height: 16px; cursor: pointer; accent-color: var(--btn-primary-bg); flex-shrink: 0; }
.folder-row:hover { background: var(--bg-hover); }
.folder-row.dragging { opacity: 0.35; }
.folder-row.selected { background: rgba(100,100,255,0.15); border-color: rgba(100,100,255,0.3); }
.fname { font-size: 13px; color: var(--text-primary); font-weight: 500; white-space: nowrap; min-width: 60px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
.rename-input {
  height: 26px; padding: 0 6px; font-size: 12px;
  background: var(--bg-input-solid); border: 1px solid var(--border-color);
  border-radius: 4px; color: var(--text-primary); outline: none;
  min-width: 60px; max-width: 140px;
}
.color-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; display: inline-block; }
.color-dot.heart { width: auto; height: auto; border-radius: 0; display: inline; }
.fpath { font-size: 11px; color: var(--text-secondary); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.folder-actions { display: flex; gap: 4px; flex-shrink: 0; }
.btn-sm {
  height: 24px; padding: 0 7px; border: 1px solid var(--border-color);
  border-radius: 4px; background: transparent; color: var(--text-secondary);
  font-size: 10px; cursor: pointer; white-space: nowrap; transition: background 0.15s;
}
.btn-sm:hover { background: var(--bg-hover); color: var(--text-primary); }
.btn-del { border-color: rgba(232,17,35,0.3); color: #e81123; }
.btn-del:hover { background: rgba(232,17,35,0.15); }

.fs-right {
  width: 230px; flex-shrink: 0;
  border-left: 1px solid var(--border-color);
  padding-left: 16px; display: flex; flex-direction: column;
  min-height: 0; overflow: hidden;
}
.detail-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-hint); font-size: 13px; text-align: center; }
.detail-content { display: flex; flex-direction: column; gap: 6px; flex: 1; min-height: 0; overflow-y: auto; padding-right: 8px; }
.detail-content > * { flex-shrink: 0; }
.detail-content::-webkit-scrollbar { width: 4px; }
.detail-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.22); border-radius: 2px; }
.detail-name { font-size: 16px; font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 4px; }
.detail-name-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
.detail-fav { flex-shrink: 0; }
.detail-fav:hover { color: #ff5066 !important; }
.detail-cover { width: 100%; aspect-ratio: 1; border-radius: 8px; overflow: hidden; background: var(--bg-input); display: flex; align-items: center; justify-content: center; }
.cover-img { width: 100%; height: 100%; object-fit: cover; }
.cover-placeholder { font-size: 48px; opacity: 0.3; }
.detail-info { display: flex; flex-direction: column; gap: 4px; }
.info-row { display: flex; flex-direction: column; gap: 2px; }
.info-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); }
.info-value { font-size: 12px; color: var(--text-primary); }
.path-val { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 11px; color: var(--text-secondary); }
.clickable { cursor: pointer; }
.clickable:hover { text-decoration: underline; color: var(--text-primary); }

.color-options { display: flex; gap: 5px; margin-top: 2px; }
.color-dot-detail {
  width: 20px; height: 20px; border-radius: 50%;
  border: 2px solid var(--border-color);
  background: transparent;
  cursor: pointer; transition: all 0.15s; flex-shrink: 0; padding: 0;
}
.color-dot-detail:first-child {
  border-style: dashed;
}
.color-dot-detail:first-child::after {
  content: '×'; font-size: 11px; color: var(--text-muted); line-height: 1;
}
.color-dot-detail.active { border-color: var(--text-primary); transform: scale(1.15); }
.color-dot-detail:hover { border-color: var(--text-secondary); }

/* 详细网格模式 */
.grid-wrap { flex: 1; overflow-y: auto; min-height: 0; display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; align-content: start; }
.grid-item { border: 1px solid var(--border-color); border-radius: 8px; padding: 8px; cursor: pointer; background: var(--bg-input); transition: background 0.15s, border-color 0.15s, opacity 0.15s; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.grid-item:hover { background: var(--bg-hover); }
.grid-item.dragging { opacity: 0.35; }
.grid-item.selected { background: rgba(100,100,255,0.15); border-color: rgba(100,100,255,0.5); }

.grid-top { display: flex; gap: 4px; }
.grid-cover { width: 68%; min-height: 0; border-radius: 6px; overflow: hidden; background: var(--bg-input-solid); flex-shrink: 0; display: flex; align-items: center; justify-content: center; aspect-ratio: 1 / 1; }
.grid-cover-img { width: 100%; height: 100%; object-fit: cover; }
.grid-cover-placeholder { font-size: 36px; opacity: 0.3; }
.grid-thumbs { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
.grid-thumb { flex: 1; border-radius: 4px; overflow: hidden; background: var(--bg-input-solid); aspect-ratio: 3 / 2; display: flex; align-items: center; justify-content: center; }
.grid-thumb-img { width: 100%; height: 100%; object-fit: cover; }
.grid-thumb-empty { width: 100%; height: 100%; }
.grid-thumb-empty-slot { background: var(--bg-input-solid); }

.grid-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.grid-name { font-size: 12px; font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 4px; min-width: 0; }
.grid-name-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
.grid-color-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; display: inline-block; }
.grid-color-dot.heart { width: auto; height: auto; border-radius: 0; display: inline; }
.rename-input-grid {
  height: 24px; padding: 0 6px; font-size: 11px;
  background: var(--bg-input-solid); border: 1px solid var(--border-color);
  border-radius: 4px; color: var(--text-primary); outline: none;
  width: 100%;
}
.grid-path { font-size: 10px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.grid-meta { display: flex; justify-content: space-between; font-size: 10px; color: var(--text-secondary); }
.grid-actions { display: flex; gap: 4px; margin-top: 2px; }
.btn-sm-grid {
  height: 22px; padding: 0 6px; border: 1px solid var(--border-color);
  border-radius: 4px; background: transparent; color: var(--text-secondary);
  font-size: 9px; cursor: pointer; white-space: nowrap; transition: background 0.15s;
}
.btn-sm-grid:hover { background: var(--bg-hover); color: var(--text-primary); }

.actions { display: flex; gap: 10px; align-items: center; margin-top: 12px; flex-shrink: 0; }
.actions-right { display: flex; gap: 10px; justify-content: flex-end; flex: 1; }
.multi-toggle {
  display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;
}
.multi-label { font-size: 12px; color: var(--text-muted); }
.toggle-track {
  width: 36px; height: 20px; border-radius: 10px; position: relative;
  background: var(--border-color); transition: background 0.2s;
  flex-shrink: 0;
}
.toggle-track.on { background: var(--btn-primary-bg); }
.toggle-knob {
  width: 16px; height: 16px; border-radius: 50%; background: #fff;
  position: absolute; top: 2px; left: 2px; transition: left 0.2s;
}
.toggle-track.on .toggle-knob { left: 18px; }
.btn-cancel, .btn-confirm { height: 36px; padding: 0 20px; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; }
.btn-cancel { background: var(--bg-hover); color: var(--text-secondary); }
.btn-cancel:hover { background: rgba(255,255,255,0.14); }
.btn-confirm { background: var(--btn-primary-bg); color: var(--text-primary); }
.btn-confirm:hover { background: #4a4a7c; }
.btn-confirm:disabled { opacity: 0.3; cursor: not-allowed; }

/* 卡片右键菜单 */
.grid-ctx-menu {
  position: fixed; z-index: 5000;
  background: var(--bg-panel-solid); border: 1px solid var(--border-color);
  border-radius: 8px; padding: 4px 0; min-width: 150px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.35);
}
.grid-ctx-item {
  padding: 8px 14px; font-size: 13px; color: var(--text-secondary); cursor: pointer;
  white-space: nowrap; transition: background 0.1s;
  display: flex; align-items: center; justify-content: space-between;
}
.grid-ctx-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.grid-ctx-color-row { display: flex; gap: 4px; padding: 4px 14px; flex-wrap: wrap; }
.grid-ctx-color-dot {
  width: 20px; height: 20px; border-radius: 50%;
  border: 2px solid var(--border-color);
  cursor: pointer; transition: all 0.15s; flex-shrink: 0; padding: 0;
}
.grid-ctx-color-dot:hover { border-color: var(--text-secondary); transform: scale(1.15); }

/* 文件夹描述 */
.folder-desc-input {
  width: 100%; margin-top: 2px; padding: 6px 8px;
  border: 1px solid var(--border-color); border-radius: 6px;
  background: var(--bg-input); color: var(--text-primary);
  font-size: 12px; line-height: 1.5; outline: none;
  font-family: inherit; box-sizing: border-box;
  resize: none; overflow: hidden; field-sizing: content;
}
.folder-desc-input:focus { border-color: rgba(142,180,255,0.5); }
.folder-desc-input::placeholder { color: var(--text-muted); }

.grid-ctx-desc {
  width: 220px; margin: 8px 14px 4px; padding: 6px 8px;
  border: 1px solid var(--border-color); border-radius: 6px;
  background: var(--bg-input-solid); color: var(--text-primary);
  font-size: 12px; line-height: 1.5; outline: none;
  font-family: inherit; box-sizing: border-box;
  resize: none; overflow: hidden; field-sizing: content;
}
.grid-ctx-desc:focus { border-color: rgba(142,180,255,0.5); }
.grid-ctx-desc::placeholder { color: var(--text-muted); }
</style>
