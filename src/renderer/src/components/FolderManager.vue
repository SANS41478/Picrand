<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-box">
        <div class="fm-header">
          <h2>{{ t('folderMgr.title') }}</h2>
          <button class="btn-x" @click="$emit('close')" :title="t('folderMgr.close')">&times;</button>
        </div>

        <div class="fm-body">
          <!-- 左侧：文件夹列表 -->
          <div class="fm-left">
            <div class="toolbar">
              <button class="btn-add" @click="handleAdd">{{ t('folderMgr.add') }}</button>
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
              <button class="btn-add" @click="setNewFoldersLocation" :title="newFoldersDirHint">{{ t('folderMgr.setNewFolderLocation') }}</button>
            </div>
            <div class="list-wrap">
              <!-- 收藏夹固定项：不是真实文件夹，只读展示，不可选中/重命名/删除 -->
              <div class="folder-row fav-pinned">
                <div class="folder-name"><span class="fav-heart">♥</span> {{ t('folder.favorites') }}</div>
                <div class="folder-path">{{ favCount != null ? t('folderSel.count', { n: favCount }) : '' }}</div>
              </div>
              <div v-if="folders.length === 0" class="empty">{{ t('folderMgr.empty') }}</div>
              <div
                v-for="f in folders"
                :key="f.id"
                class="folder-row"
                :class="{ active: selectedId === f.id }"
                @click="selectFolder(f)"
                @dblclick="openFolder(f)"
              >
                <div class="folder-name" v-if="renameTarget?.id !== f.id">{{ f.display_name || f.path.split('\\').pop() }}</div>
                <input
                  v-else
                  :ref="setRenameInput"
                  v-model="renameName"
                  class="rename-input"
                  @keyup.enter="confirmRename"
                  @keyup.esc="cancelRename"
                  @blur="confirmRename"
                  @click.stop
                >
                <div class="folder-path" :title="f.path">{{ f.path }}</div>
                <span v-if="f.color || f.is_favorite" class="row-dot" :class="{ heart: f.is_favorite }" :style="f.is_favorite ? (f.color ? { color: f.color, fontSize: '20px', lineHeight: '1' } : { color: '#fff', fontSize: '20px', lineHeight: '1' }) : { background: f.color }">{{ f.is_favorite ? '♥' : '' }}</span>
                <div class="folder-actions" v-if="renameTarget?.id !== f.id">
                  <button class="btn-sm" @click.stop="startRename(f)">{{ t('folderMgr.rename') }}</button>
                  <button class="btn-sm btn-del" @click.stop="handleDelete(f)">{{ t('folderMgr.delete') }}</button>
                </div>
              </div>
            </div>
          </div>

          <!-- 右侧：详情面板 -->
          <div class="fm-right">
            <div v-if="!selectedFolder" class="detail-empty">{{ t('folderMgr.selectHint') }}</div>
            <div v-else class="detail-content">
              <div class="detail-name">
                <span class="detail-name-text">{{ selectedFolder.display_name || selectedFolder.path.split('\\').pop() }}</span>
                <span class="detail-fav" @click="toggleFolderFav" :title="selectedFolder.is_favorite ? t('folderMgr.unfavoriteFolder') : t('folderMgr.favoriteFolder')" :style="{ fontSize:'30px', lineHeight:'1', cursor:'pointer', color: selectedFolder.is_favorite ? (selectedFolder.color || '#ff5066') : 'var(--text-muted)' }">{{ selectedFolder.is_favorite ? '♥' : '♡' }}</span>
              </div>
              <!-- 封面图 -->
              <div class="detail-cover" @click="openCoverImage" :title="t('folderMgr.changeCover')">
                <img v-if="coverSrc" :src="coverSrc" class="cover-img" :alt="selectedFolder.display_name">
                <span v-else class="cover-placeholder">📁</span>
              </div>

              <div class="detail-thumbs" v-if="randomThumbs.length">
                <img v-for="(tp, ti) in randomThumbs" :key="ti" :src="tp" class="detail-thumb-img" draggable="false" @dragstart.prevent>
              </div>              <!-- 信息行 -->
              <div class="detail-info">
                <div class="info-row">
                  <span class="info-label">{{ t('folderMgr.folderPath') }}</span>
                  <span class="info-value path-val clickable" :title="selectedFolder.path" @click="openFolderPath(selectedFolder.path)">{{ selectedFolder.path }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">{{ t('folderMgr.imageCount') }}</span>
                  <span class="info-value">{{ stats ? (stats.countCapped ? '5000+' : stats.count) : '...' }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">{{ t('folderMgr.folderSize') }}</span>
                  <span class="info-value">{{ stats ? formatSize(stats.totalSize) : '...' }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">{{ t('folderMgr.categoryColor') }}</span>
                  <div class="color-options">
                    <button
                      v-for="c in colorOptions"
                      :key="c.value"
                      class="color-dot"
                      :class="{ active: selectedColor === c.value }"
                      :style="c.value ? { background: c.value } : {}"
                      :title="c.label"
                      @click="setColor(c.value)"
                    ></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, watch, computed } from 'vue'
import { useI18n } from '../i18n'

const props = defineProps<{ visible: boolean }>()
defineEmits<{ close: [] }>()

const { t } = useI18n()

const folders = ref<any[]>([])
const renameTarget = ref<any | null>(null)
const renameName = ref('')
let renameInput: HTMLInputElement | null = null
const selectedId = ref<number | null>(null)
const selectedFolder = computed(() => folders.value.find(f => f.id === selectedId.value) || null)
const selectedColor = ref('')
const stats = ref<{ count: number; countCapped: boolean; totalSize: number; latestPath: string | null; latestThumb: string | null } | null>(null)

const showNewInput = ref(false)
const newFolderName = ref('')
const newFoldersDirHint = ref('')
let newInput: HTMLInputElement | null = null

function openNewInput() {
  showNewInput.value = true
  nextTick(() => {
    let el = (newInput as HTMLInputElement | null)
    if (!el) el = (document.querySelector('.new-name-input') as HTMLInputElement | null)
    if (el) { el.focus(); el.select() }
  })
}
function setRenameInput(el: any) { renameInput = el as HTMLInputElement | null }
function setNewInput(el: any) { if (el) { newInput = el as HTMLInputElement; el.focus(); el.select() } }

const colorOptions = [
  { value: '', label: t('color.none') },
  { value: '#e74c3c', label: t('color.red') },
  { value: '#e67e22', label: t('color.orange') },
  { value: '#f1c40f', label: t('color.yellow') },
  { value: '#2ecc71', label: t('color.green') },
  { value: '#3498db', label: t('color.blue') },
]

onMounted(refresh)
onMounted(async () => {
  try { const p = await window.picrand.getPaths?.(); if (p?.newFoldersDir) newFoldersDirHint.value = p.newFoldersDir } catch {}
})

watch(() => props.visible, (v) => {
  if (v) {
    renameTarget.value = null; selectedId.value = null; selectedColor.value = ''; stats.value = null; showNewInput.value = false; newFolderName.value = ''
    refresh().then(() => { if (folders.value.length) selectFolder(folders.value[0]) })
  }
})

async function refresh() {
  try { folders.value = await window.picrand.getAllFolders() } catch {}
  loadFavCount()
}

// 收藏夹固定项的数量（只读展示）
const favCount = ref<number | null>(null)
async function loadFavCount() {
  favCount.value = null
  try {
    const imgs: any[] = await window.picrand.loadFavorites?.() || []
    favCount.value = imgs.length
  } catch {}
}

async function handleAdd() {
  const result = await window.picrand.addFolder()
  if (result) folders.value.unshift(result)
}

async function setNewFoldersLocation() {
  const newPath = await window.picrand.setNewFoldersDir?.()
  if (newPath) {
    newFoldersDirHint.value = newPath
  }
}

async function handleNewFolder() {
  const name = newFolderName.value.trim()
  if (!name) { cancelNewFolder(); return }
  try {
    const result = await window.picrand.addFolderNew?.(name)
    if (result) folders.value.unshift(result)
  } catch {}
  cancelNewFolder()
}

async function confirmNewFolder() {
  await handleNewFolder()
}

function cancelNewFolder() {
  showNewInput.value = false
  newFolderName.value = ''
}

function openNewInput() {
  showNewInput.value = true
  nextTick(() => {
    let el = (newInput as HTMLInputElement | null)
    if (!el) el = (document.querySelector('.new-name-input') as HTMLInputElement | null)
    if (el) { el.focus(); el.select() }
  })
}

function startRename(f: any) {
  renameTarget.value = f
  renameName.value = f.display_name || f.path.split('\\').pop() || ''
  nextTick(() => {
    renameInput?.focus()
    renameInput?.select()
  })
}

async function confirmRename() {
  const f = renameTarget.value
  if (!f) return
  renameTarget.value = null
  const name = renameName.value.trim()
  if (!name) return
  try {
    await window.picrand.updateFolderName(f.id, name)
    f.display_name = name
  } catch (err) {
    console.error('重命名失败:', err)
  }
}

function cancelRename() {
  renameTarget.value = null
}

async function handleDelete(f: any) {
  if (!confirm(t('folderMgr.confirm'))) return
  await window.picrand.deleteFolder(f.id, f.path)
  folders.value = folders.value.filter(x => x.id !== f.id)
  if (selectedId.value === f.id) { selectedId.value = null; stats.value = null }
}

async function selectFolder(f: any) {
  selectedId.value = f.id
  selectedColor.value = f.color || ''
  stats.value = null
  fetchRandomThumbs(f.id)
  try {
    const s = await window.picrand.getFolderStats?.(f.id)
    if (s) stats.value = s
  } catch {}
}

async function toggleFolderFav() {
  const f = selectedFolder.value
  if (!f) return
  f.is_favorite = f.is_favorite ? 0 : 1
  await window.picrand.toggleFolderFavorite?.(f.id, f.is_favorite)
  // sync to folders list
  const f2 = folders.value.find(x => x.id === f.id)
  if (f2) f2.is_favorite = f.is_favorite
}

function openFolder(f: any) {
  window.picrand.scanFolder?.(f.path)
  emit('close')
}

const coverSrc = computed(() => {
  if (!stats.value?.latestPath) {
    // stats 未加载或没有图片，用文件夹第一张缩略图
    if (stats.value?.latestThumb) return ''
    return ''
  }
  const lp = stats.value.latestPath
  const orig = encodeURIComponent(lp)
  const thumb = stats.value.latestThumb ? `&thumb=${encodeURIComponent(stats.value.latestThumb)}` : ''
  return `picrand://get-image?orig=${orig}${thumb}`
})
const randomThumbs = ref<string[]>([])
async function fetchRandomThumbs(id: number | null) {
  randomThumbs.value = []
  if (!id) return
  try {
    const imgs: any[] = await window.picrand.getFolderRandomThumbs?.(id, 3) || []
    randomThumbs.value = imgs.map(im => {
      const orig = encodeURIComponent(im.file_path)
      const thumb = im.thumbnail_path ? `&thumb=${encodeURIComponent(im.thumbnail_path)}` : ''
      return `picrand://get-image?orig=${orig}${thumb}`
    })
  } catch {}
}

async function openCoverImage() {
  if (!selectedFolder.value) return
  const folderPath = selectedFolder.value.path
  const newCover = await window.picrand.selectCoverImage?.(folderPath)
  if (newCover) {
    await window.picrand.updateFolderCover?.(selectedFolder.value.id, newCover)
    stats.value = { ...stats.value!, latestPath: newCover, latestThumb: '' }
  }
}

function openFolderPath(path: string) {
  window.picrand.openInFolder(path)
}

async function setColor(color: string) {
  if (!selectedFolder.value) return
  selectedColor.value = color
  try {
    await window.picrand.updateFolderColor?.(selectedFolder.value.id, color)
    selectedFolder.value.color = color
    // 同步更新 folders 列表中的 color
    const f = folders.value.find(x => x.id === selectedFolder.value!.id)
    if (f) f.color = color
  } catch {}
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: var(--overlay-bg);
  display: flex; align-items: center; justify-content: center;
}
.modal-box {
  background: var(--bg-panel-solid); border: 1px solid var(--border-color);
  border-radius: 12px; padding: 24px; width: 780px; height: 560px;
  max-width: 92vw; max-height: 85vh; display: flex; flex-direction: column;
}
h2 { margin: 0; font-size: 16px; color: var(--text-primary); flex-shrink: 0; }

.fm-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-shrink: 0; }
.btn-x {
  width: 32px; height: 32px; border: none; border-radius: 6px;
  background: transparent; color: var(--text-secondary); font-size: 20px; line-height: 1;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.btn-x:hover { background: var(--bg-hover); color: var(--text-primary); }

.fm-body { display: flex; gap: 16px; flex: 1; min-height: 0; }

/* 左侧 */
.fm-left { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; flex-shrink: 0; }
.btn-add {
  height: 24px; padding: 0 11px; border: none; border-radius: 6px;
  background: var(--btn-primary-bg); color: var(--text-primary); font-size: 11px; cursor: pointer;
}
.btn-add:hover { background: var(--btn-primary-hover); }
.new-folder-inline { display: flex; align-items: center; }
.new-name-input {
  height: 24px; width: 180px; padding: 0 10px;
  border: 1px solid var(--border-color); border-radius: 6px;
  background: var(--bg-input-solid); color: var(--text-primary);
  font-size: 11px; outline: none;
}
.new-name-input:focus { border-color: rgba(142,180,255,0.5); }

.list-wrap { flex: 1; overflow-y: auto; min-height: 100px; }
.empty { text-align: center; color: var(--text-hint); font-size: 14px; padding: 24px 0; line-height: 1.8; }

.folder-row {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 10px; border-radius: 6px; cursor: pointer;
  background: var(--bg-input); margin-bottom: 4px;
  border: 1px solid transparent; transition: all 0.15s;
  min-height: 42px;
}
.folder-row:hover { background: var(--bg-hover); }
.folder-row.active { border-color: rgba(142,180,255,0.5); background: var(--bg-hover); }

/* 收藏夹固定项 */
.folder-row.fav-pinned { cursor: default; background: rgba(255, 80, 102, 0.07); }
.fav-pinned:hover { background: rgba(255, 80, 102, 0.12); }
.fav-heart { color: #ff5066; }
.fav-pinned .folder-name { display: flex; align-items: center; gap: 4px; }
.folder-name {
  font-size: 13px; color: var(--text-primary); font-weight: 500;
  white-space: nowrap; min-width: 80px; max-width: 140px; overflow: hidden; text-overflow: ellipsis;
}
.rename-input {
  height: 28px; padding: 0 8px; font-size: 13px; flex: 1;
  background: var(--bg-input-solid); border: 1px solid var(--border-color);
  border-radius: 4px; color: var(--text-primary); outline: none;
  min-width: 80px; max-width: 160px;
}
.folder-path {
  font-size: 11px; color: var(--text-secondary);
  flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.row-dot {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; display: inline-block;
}
.row-dot.heart {
  width: auto; height: auto; border-radius: 0; display: inline; background: transparent;
}
.folder-actions { display: flex; gap: 4px; flex-shrink: 0; }
.btn-sm {
  height: 26px; padding: 0 8px; border: 1px solid var(--border-color);
  border-radius: 4px; background: transparent; color: var(--text-secondary);
  font-size: 11px; cursor: pointer; white-space: nowrap; transition: background 0.15s;
}
.btn-sm:hover { background: var(--bg-hover); color: var(--text-primary); }
.btn-del { border-color: rgba(232,17,35,0.3); color: #e81123; }
.btn-del:hover { background: rgba(232,17,35,0.15); }

/* 右侧详情 */
.fm-right {
  width: 240px; flex-shrink: 0;
  border-left: 1px solid var(--border-color);
  padding-left: 16px;
  display: flex; flex-direction: column;
}
.detail-empty {
  flex: 1; display: flex; align-items: center; justify-content: center;
  color: var(--text-hint); font-size: 13px; text-align: center;
}
.detail-content { display: flex; flex-direction: column; gap: 12px; }
.detail-name {
  font-size: 17px; font-weight: 600; color: var(--text-primary);
  display: flex; align-items: center; gap: 4px;
}
.detail-name-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
.detail-fav { flex-shrink: 0; }
.detail-fav:hover { color: #ff5066 !important; }
.detail-cover {
  width: 100%; aspect-ratio: 1; border-radius: 8px; overflow: hidden;
  background: var(--bg-input); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.cover-img { width: 100%; height: 100%; object-fit: cover; }
.cover-placeholder { font-size: 48px; opacity: 0.3; }

.detail-info { display: flex; flex-direction: column; gap: 4px; }
.info-row { display: flex; flex-direction: column; gap: 2px; }
.info-label {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--text-muted);
}
.info-value { font-size: 12px; color: var(--text-primary); }
.path-val {
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-size: 11px; color: var(--text-secondary);
}
.clickable { cursor: pointer; }
.clickable:hover { text-decoration: underline; color: var(--text-primary); }

.color-options { display: flex; gap: 6px; margin-top: 2px; }
.color-dot {
  width: 22px; height: 22px; border-radius: 50%;
  border: 2px solid var(--border-color);
  background: transparent;
  cursor: pointer; transition: all 0.15s;
  flex-shrink: 0;
}
.color-dot:first-child {
  border-style: dashed;
}
.color-dot:first-child::after {
  content: '×'; font-size: 12px; color: var(--text-muted);
  line-height: 18px;
}
.color-dot.active { border-color: var(--text-primary); transform: scale(1.15); }
.color-dot:hover { border-color: var(--text-secondary); }
.detail-thumbs { display: flex; gap: 6px; margin: 10px 0; }
.detail-thumb-img { width: 64px; height: 48px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border-color); }
</style>
