<template>
  <Teleport to="body">
    <div v-if="visible" class="pset-overlay" @click.self="$emit('cancel')">
      <div class="pset-box">
        <div class="pset-header">
          <h2>{{ t('pinboard.settingsTitle') }}</h2>
          <button class="pset-new-btn" @click="startCreate">{{ t('pinboard.create') }}</button>
        </div>

        <!-- 新建图钉板：内联输入行（沿用列表行的视觉） -->
        <div v-if="creating" class="pset-row pset-create-row">
          <span class="pset-grip">＋</span>
          <input
            ref="createInputEl"
            v-model="newBoardName"
            class="pset-name-input"
            :placeholder="t('pinboard.namePlaceholder')"
            @keyup.enter="confirmCreate"
            @keyup.esc="cancelCreate"
            @blur="onCreateBlur"
          >
          <div class="pset-hotkey-slot"><div class="pset-hotkey-box unbound" style="visibility: hidden"></div></div>
          <div class="pset-clear-spacer"></div>
          <button class="pset-del" :title="t('pinboard.cancel')" @mousedown.prevent="cancelCreate" @click="cancelCreate">×</button>
        </div>

        <div v-if="!pinboard.boards.length && !creating" class="pset-empty">{{ t('pinboard.empty') }}</div>

        <div v-else class="pset-list">
          <div class="pset-headrow">
            <span class="pset-head-label">{{ t('pinboard.boardLabel') }}</span>
            <span class="pset-head-label pset-head-hotkey">{{ t('pinboard.hotkeyLabel') }}</span>
            <span class="pset-head-actions"></span>
          </div>
          <div
            v-for="b in pinboard.boards"
            :key="b.id"
            class="pset-row"
            :class="{ 'dragging': dragId === b.id, 'drag-over': dragOverId === b.id }"
            draggable="true"
            @dragstart="onDragStart($event, b)"
            @dragover.prevent="onDragOver($event, b)"
            @dragleave="onDragLeave(b)"
            @drop="onDrop($event, b)"
            @dragend="onDragEnd"
          >
            <span class="pset-grip" :title="t('pinboard.dragHint')">⠿</span>
            <!-- 改名（点击切换到 input） -->
            <input
              v-if="renamingId === b.id"
              v-model="renameValue"
              class="pset-name-input"
              :ref="(el) => setRenameRef(el)"
              @keyup.enter="commitRename(b.id)"
              @keyup.esc="cancelRename"
              @blur="commitRename(b.id)"
            >
            <span v-else class="pset-name" @click="startRename(b)">{{ b.name }}</span>

            <!-- 快捷键槽：两态 idle / waiting -->
            <div class="pset-hotkey-slot">
              <div
                v-if="hotkeyState[b.id] === 'waiting'"
                class="pset-hotkey-box waiting"
                tabindex="0"
                :ref="(el) => setWaitingRef(b.id, el)"
                @keydown="onHotkeyKeydown($event, b)"
                @blur="exitWaiting(b.id)"
              >{{ t('pinboard.hotkeyWaiting') }}</div>

              <div
                v-else-if="b.hotkey"
                class="pset-hotkey-box bound"
                :class="{ flash: flashId === b.id }"
                tabindex="0"
                @click="enterWaiting(b.id, $event)"
                @keydown="onHotkeyKeydown($event, b)"
              >{{ b.hotkey }}</div>

              <div
                v-else
                class="pset-hotkey-box unbound"
                :class="{ flash: flashId === b.id }"
                tabindex="0"
                @click="enterWaiting(b.id, $event)"
                @keydown="onHotkeyKeydown($event, b)"
              >{{ t('pinboard.hotkeyPlaceholder') }}</div>
            </div>

            <!-- 已绑定时的清除按钮 -->
            <button
              v-if="b.hotkey"
              class="pset-clear-btn"
              @click="clearHotkey(b)"
            >×</button>
            <div v-else class="pset-clear-spacer"></div>

            <button class="pset-del" @click="onDelete(b)">
              <svg class="pset-trash-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"
                  d="M3 4.5h10M6.5 4.5V3.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1M5 4.5l.6 8.2a1 1 0 0 0 1 .9h2.8a1 1 0 0 0 1-.9l.6-8.2" />
              </svg>
            </button>
          </div>
        </div>

        <div class="pset-actions">
          <button class="pset-btn pset-close" @click="$emit('cancel')">{{ t('pinboard.close') }}</button>
        </div>

        <!-- 删除确认（自定义非阻塞弹窗，替代原生 confirm——原生 confirm 阻塞会破坏渲染进程焦点，导致新建输入框无法聚焦） -->
        <div v-if="confirmDel.visible" class="pset-confirm-overlay" @click.self="cancelDel">
          <div class="pset-confirm-box">
            <p class="pset-confirm-msg">{{ confirmDel.message }}</p>
            <div class="pset-confirm-actions">
              <button class="pset-btn" @click="cancelDel">{{ t('pinboard.cancel') }}</button>
              <button class="pset-btn pset-danger" @click="runDel">{{ t('pinboard.confirm') }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick } from 'vue'
import { usePinboardStore } from '../stores/pinboard'
import { useI18n } from '../i18n'

defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'cancel'): void }>()

const pinboard = usePinboardStore()
const { t } = useI18n()

// ---- 新建图钉板 ----
const creating = ref(false)
const newBoardName = ref('')
const createInputEl = ref<HTMLInputElement | null>(null)
function startCreate() {
  creating.value = true
  newBoardName.value = ''
  nextTick(() => {
    const el = createInputEl.value
    if (!el) return
    el.focus()
    el.select()
  })
}
function cancelCreate() {
  creating.value = false
  newBoardName.value = ''
}
// blur 时若名称非空视为确认，空则静默取消（与改名行为一致）
function onCreateBlur() {
  if (newBoardName.value.trim()) confirmCreate()
  else cancelCreate()
}
async function confirmCreate() {
  const v = newBoardName.value.trim()
  if (!v) { pinboard.showToast(t('pinboard.nameEmpty'), 2000); return }
  try {
    await pinboard.create(v)
    creating.value = false
    newBoardName.value = ''
    // 与原底部面板创建行为一致：成功后展开底部面板并刷新 dashboard
    pinboard.isExpanded = true
    document.documentElement.style.setProperty('--pinboard-height', '178px')
    document.dispatchEvent(new CustomEvent('picrand-dashboard-refresh'))
  } catch (e: any) {
    pinboard.showToast(e?.message || t('pinboard.opFailed'), 2500)
  }
}

// ---- 改名 ----
const renamingId = ref<string | null>(null)
const renameValue = ref('')
const renameEl = ref<HTMLInputElement | null>(null)
function setRenameRef(el: Element | null) {
  renameEl.value = (el as HTMLInputElement) || null
}

function startRename(b: Pinboard) {
  renamingId.value = b.id
  renameValue.value = b.name
  nextTick(() => {
    const el = renameEl.value
    if (!el) return
    el.focus()
    el.select()
  })
}
async function commitRename(id: string) {
  if (renamingId.value !== id) return
  const v = renameValue.value.trim()
  renamingId.value = null
  if (!v) return
  if (v === pinboard.boards.find(b => b.id === id)?.name) return
  try { await pinboard.rename(id, v) }
  catch (e: any) { pinboard.showToast(e?.message || t('pinboard.opFailed'), 2500) }
}
function cancelRename() { renamingId.value = null }

// ---- 快捷键两态：'idle' / 'waiting' ----
const hotkeyState = reactive<Record<string, 'idle' | 'waiting'>>({})
// 等待按键元素的模板 ref，按 board id 索引
const waitingEl = ref<Record<string, HTMLElement | null>>({})
function setWaitingRef(id: string, el: Element | null) {
  waitingEl.value[id] = (el as HTMLElement) || null
}

// 成功落盘后的短暂高亮反馈
const flashId = ref<string | null>(null)
let flashTimer: number | null = null
function triggerFlash(id: string) {
  flashId.value = id
  if (flashTimer) window.clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => { flashId.value = null }, 600)
}

function enterWaiting(id: string, _ev: Event) {
  hotkeyState[id] = 'waiting'
  // 等新的 waiting 元素渲染出来后再 focus
  nextTick(() => {
    const el = waitingEl.value[id]
    if (el) el.focus()
  })
}
function exitWaiting(id: string) {
  if (hotkeyState[id] === 'waiting') hotkeyState[id] = 'idle'
}

// 允许：F1~F12、0~9（含小键盘数字 Numpad0~9）、A~Z 字母（排除字母 F）
// Esc=退出 waiting；Backspace/Delete=清除已绑键（直接写空）
function keyEventToHotkey(ev: KeyboardEvent): string | null {
  if (ev.key === 'Escape') return '__ESC__'
  if (ev.key === 'Backspace' || ev.key === 'Delete') return '__CLEAR__'
  if (/^F([1-9]|1[0-2])$/.test(ev.key)) return ev.key
  if (/^[a-zA-Z]$/.test(ev.key)) {
    if (ev.key.toUpperCase() === 'F') return null
    return ev.key.toUpperCase()
  }
  if (/^[0-9]$/.test(ev.key)) return ev.key
  if (/^Numpad([0-9])$/.test(ev.code)) return ev.code.replace('Numpad', '')
  return null
}

function onHotkeyKeydown(ev: KeyboardEvent, b: Pinboard) {
  ev.preventDefault()
  ev.stopPropagation()
  const k = keyEventToHotkey(ev)
  if (k === '__ESC__') { (ev.target as HTMLElement).blur(); return }
  if (k === null) return
  if (k === '__CLEAR__') {
    hotkeyState[b.id] = 'idle'
    void applyHotkey(b.id, '')
    return
  }
  // 直接落盘
  hotkeyState[b.id] = 'idle'
  void applyHotkey(b.id, k).then(() => triggerFlash(b.id))
}

async function applyHotkey(id: string, hotkey: string) {
  try {
    const r = await pinboard.setHotkey(id, hotkey)
    if (hotkey === '') {
      pinboard.showToast(t('pinboard.hotkeyCleared'), 1800)
    } else if (r?.displaced?.name) {
      pinboard.showToast(t('pinboard.hotkeyDisplaced', { key: hotkey, name: r.displaced.name }), 2800)
    }
  } catch (e: any) { pinboard.showToast(e?.message || t('pinboard.opFailed'), 2500) }
}

async function clearHotkey(b: Pinboard) {
  hotkeyState[b.id] = 'idle'
  await applyHotkey(b.id, '')
}

// ---- 删除 ----
const confirmDel = reactive<{ visible: boolean; id: string; message: string }>({ visible: false, id: '', message: '' })
function onDelete(b: Pinboard) {
  confirmDel.id = b.id
  confirmDel.message = t('pinboard.deleteMsg', { name: b.name })
  confirmDel.visible = true
}
function cancelDel() {
  confirmDel.visible = false
  confirmDel.id = ''
}
async function runDel() {
  const id = confirmDel.id
  cancelDel()
  if (!id) return
  try { await pinboard.deleteById(id) }
  catch { pinboard.showToast(t('pinboard.opFailed'), 2000) }
}

// ---- 拖拽重排 ----
const dragId = ref<string | null>(null)
const dragOverId = ref<string | null>(null)

function onDragStart(ev: DragEvent, b: Pinboard) {
  dragId.value = b.id
  // 用自定义 mime，便于 App.vue 区分图钉板重排 vs 文件夹导入
  ev.dataTransfer?.setData('x-picrand/reorder', b.id)
  ev.dataTransfer?.setData('text/plain', b.id)
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move'
}
function onDragOver(ev: DragEvent, b: Pinboard) {
  ev.preventDefault()
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
  if (dragId.value && dragId.value !== b.id) dragOverId.value = b.id
}
function onDragLeave(b: Pinboard) {
  if (dragOverId.value === b.id) dragOverId.value = null
}
async function onDrop(ev: DragEvent, b: Pinboard) {
  ev.preventDefault()
  const srcId = dragId.value
  dragOverId.value = null
  dragId.value = null
  if (!srcId || srcId === b.id) return
  const ids = pinboard.boards.map(x => x.id)
  const from = ids.indexOf(srcId)
  const to = ids.indexOf(b.id)
  if (from < 0 || to < 0) return
  ids.splice(from, 1)
  ids.splice(to, 0, srcId)
  try { await pinboard.reorder(ids) }
  catch { pinboard.showToast(t('pinboard.opFailed'), 2000) }
}
function onDragEnd() {
  dragId.value = null
  dragOverId.value = null
}
</script>

<style scoped>
.pset-overlay {
  position: fixed; inset: 0; z-index: 10000;
  background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: center; justify-content: center;
}
.pset-box {
  background: var(--modal-bg, #1e1e2e);
  border: 1px solid var(--border-color);
  border-radius: 0;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  width: 560px; max-width: 92vw; max-height: 80vh;
  padding: 24px;
  display: flex; flex-direction: column; gap: 16px;
}
.pset-header h2 {
  margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary);
}
.pset-header { display: flex; align-items: center; justify-content: space-between; }
.pset-new-btn {
  height: 26px; padding: 0 12px; border: 1px solid var(--border-color); border-radius: 4px;
  background: var(--btn-primary-bg, #5b8cff); color: #fff; font-size: 12px; cursor: pointer;
  transition: filter 0.12s;
}
.pset-new-btn:hover { filter: brightness(1.15); }
.pset-create-row { padding: 2px 4px; }
.pset-empty {
  color: var(--text-muted); font-size: 13px; padding: 24px 0; text-align: center;
}
.pset-list {
  display: flex; flex-direction: column; gap: 8px;
  overflow-y: auto; flex: 1; min-height: 0;
}
.pset-headrow {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 10px 2px;
  border-bottom: 1px solid var(--border-color);
}
.pset-head-label {
  font-size: 11px; font-weight: 600; color: var(--text-muted);
  letter-spacing: 0.4px;
  flex: 1; min-width: 0;
  text-transform: uppercase;
}
.pset-head-hotkey {
  flex: 0 0 92px; width: 92px; text-align: center;
}
.pset-head-actions {
  flex: 0 0 auto; width: 64px; /* clear + del 两按钮宽度对齐 */
}
.pset-row {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 4px;
  border-radius: 6px;
  transition: background 0.14s ease;
}
.pset-row:hover {
  background: var(--bg-input, rgba(255,255,255,0.06));
}
.pset-row.dragging { opacity: 0.4; }
.pset-row.drag-over { background: rgba(91, 140, 255, 0.14); box-shadow: inset 0 0 0 1px var(--accent-color, #5b8cff); }
.pset-grip {
  flex: 0 0 18px; width: 18px; text-align: center;
  color: var(--text-muted); cursor: grab; user-select: none;
  font-size: 14px; line-height: 1;
}
.pset-grip:active { cursor: grabbing; }
.pset-name {
  flex: 1; min-width: 0;
  font-size: 13px; color: var(--text-primary);
  cursor: text; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 0 8px;
}
.pset-name:hover { background: rgba(255,255,255,0.04); border-radius: 4px; }
.pset-name-input {
  flex: 1; min-width: 0;
  height: 30px; padding: 0 8px;
  background: var(--bg-input-solid, #333);
  border: 1px solid var(--accent-color, #5b8cff);
  border-radius: 4px;
  color: var(--text-primary); font-size: 13px; outline: none;
}

/* 快捷键槽 */
.pset-hotkey-slot {
  width: 92px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.pset-hotkey-box {
  width: 100%; height: 28px;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px;
  background: var(--bg-input-solid, #333);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  cursor: pointer; outline: none;
  user-select: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, color 0.18s ease, background 0.18s ease;
}
.pset-hotkey-box.unbound { color: var(--text-muted); border-style: dashed; }
.pset-hotkey-box.bound { font-weight: 600; letter-spacing: 0.5px; }
.pset-hotkey-box.waiting {
  color: var(--accent-color, #5b8cff);
  border-color: var(--accent-color, #5b8cff);
  box-shadow: 0 0 0 3px rgba(91, 140, 255, 0.18);
  animation: hotkey-pulse 1.1s ease-in-out infinite;
}
.pset-hotkey-box:focus { border-color: var(--accent-color, #5b8cff); }

/* 落盘成功的短暂高亮 */
.pset-hotkey-box.flash {
  border-color: #6ee0a3;
  box-shadow: 0 0 0 3px rgba(110, 224, 163, 0.22);
  color: #6ee0a3;
}
@keyframes hotkey-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

.pset-clear-btn {
  width: 26px; height: 26px; flex-shrink: 0;
  background: transparent; color: var(--text-muted);
  border: 1px solid var(--border-color); border-radius: 4px;
  font-size: 14px; cursor: pointer; line-height: 1;
  display: flex; align-items: center; justify-content: center;
}
.pset-clear-btn:hover { color: #e0a800; border-color: #e0a800; }
.pset-clear-spacer { width: 26px; flex-shrink: 0; }

.pset-del {
  width: 28px; height: 28px; flex-shrink: 0;
  background: transparent;
  color: #e81123;
  border: 1px solid rgba(232, 17, 35, 0.5); border-radius: 4px;
  cursor: pointer; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.14s ease, border-color 0.14s ease;
}
.pset-del:hover {
  color: #ff5a6a;
  background: rgba(232, 17, 35, 0.12);
  border-color: #e81123;
}
.pset-trash-icon { display: block; }
.pset-actions { display: flex; justify-content: flex-end; }
.pset-btn {
  height: 32px; padding: 0 18px;
  border: 1px solid var(--border-color); border-radius: 4px;
  font-size: 13px; cursor: pointer; background: var(--bg-input-solid, #333);
  color: var(--text-primary);
}
.pset-btn:hover { filter: brightness(1.15); }

.pset-confirm-overlay {
  position: fixed; inset: 0; z-index: 10001;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center;
}
.pset-confirm-box {
  background: var(--modal-bg, #1e1e2e);
  border: 1px solid var(--border-color);
  border-radius: 6px; padding: 18px 20px;
  width: 360px; max-width: 90vw;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}
.pset-confirm-msg { margin: 0 0 16px; font-size: 13px; color: var(--text-primary); line-height: 1.5; word-break: break-word; }
.pset-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
.pset-btn.pset-danger { background: #e81123; border-color: #e81123; color: #fff; }
.pset-btn.pset-danger:hover { filter: brightness(1.1); }
</style>