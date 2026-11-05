import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { t } from '../i18n'

export const usePinboardStore = defineStore('pinboard', () => {
  const boards = ref<Pinboard[]>([])
  const currentId = ref<string | null>(null)
  const isExpanded = ref(false)
  const toast = ref('')
  let toastTimer: ReturnType<typeof setTimeout> | null = null

  const currentBoard = computed(() => boards.value.find(b => b.id === currentId.value) || null)
  const nonEmptyCount = computed(() => boards.value.filter(b => b.images.length > 0).length)

  function applyState(state: PinboardsState) {
    boards.value = state.boards || []
    currentId.value = state.currentId || null
  }

  function showToast(message: string, duration = 1800) {
    toast.value = message
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toast.value = '' }, duration)
  }

  async function load() {
    applyState(await window.picrand.getPinboards())
  }

  async function create(name: string) {
    const result = await window.picrand.createPinboard(name)
    if ((result as any)?.error) throw new Error((result as any).message)
    applyState(result as PinboardsState)
  }

  async function setCurrent(id: string) {
    applyState(await window.picrand.setCurrentPinboard(id))
  }

  async function deleteCurrent() {
    if (!currentBoard.value) return
    applyState(await window.picrand.deletePinboard(currentBoard.value.id))
  }

  async function rename(id: string, name: string) {
    const result = await window.picrand.renamePinboard(id, name)
    if ((result as any)?.error) throw new Error((result as any).message)
    applyState(result as PinboardsState)
  }

  async function setHotkey(id: string, hotkey: string): Promise<{ displaced: { name: string } | null }> {
    const result = await window.picrand.setPinboardHotkey(id, hotkey)
    if ((result as any)?.error) throw new Error((result as any).message)
    const r: any = result
    applyState(r.state)
    return { displaced: r.displaced || null }
  }

  async function deleteById(id: string) {
    applyState(await window.picrand.deletePinboard(id))
  }

  async function reorder(orderedIds: string[]) {
    applyState(await window.picrand.reorderPinboards(orderedIds))
  }

  async function clearCurrent() {
    if (!currentBoard.value) return
    applyState(await window.picrand.clearPinboard(currentBoard.value.id))
  }

  async function addImage(img: ImageItem) {
    if (!currentBoard.value) throw new Error(t('error.createBoardFirst'))
    applyState(await window.picrand.addImageToPinboard(currentBoard.value.id, img.file_path))
    showToast(t('toast.addedToPinboard'))
  }

  async function removeImage(path: string) {
    if (!currentBoard.value) return
    applyState(await window.picrand.removeImageFromPinboard(currentBoard.value.id, path))
  }

  async function exportCurrent() {
    if (!currentBoard.value) return null
    const result = await window.picrand.exportPinboard(currentBoard.value.id)
    if (!result.canceled) showToast(t('pinboard.exportResult', { count: result.count, path: result.folderPath }), 3000)
    return result
  }

  async function exportToFolder(folderPath: string) {
    if (!currentBoard.value) return null
    const result = await window.picrand.exportPinboardToFolder?.(currentBoard.value.id, folderPath)
    if (result) showToast(t('pinboard.exportResult', { count: result.count, path: result.folderPath }), 3000)
    return result
  }

  return {
    boards,
    currentId,
    isExpanded,
    toast,
    currentBoard,
    nonEmptyCount,
    load,
    create,
    setCurrent,
    deleteCurrent,
    deleteById,
    reorder,
    rename,
    setHotkey,
    clearCurrent,
    addImage,
    removeImage,
    exportCurrent,
    exportToFolder,
    showToast
  }
})
