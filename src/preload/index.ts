import { contextBridge, ipcRenderer, webUtils, webFrame } from 'electron'

const api = {
  getPaths: () => ipcRenderer.invoke('get-paths'),
  getFilePath: (file: File) => { try { return webUtils.getPathForFile(file) } catch { return '' } },
  resolveDropPaths: (paths: string[]) => ipcRenderer.invoke('resolve-drop-paths', paths),
  setNewFoldersDir: () => ipcRenderer.invoke('set-new-folders-dir'),
  scanFolder: (folderPath: string, sortMode?: string, forceShuffle?: boolean, hueOrigin?: number) => ipcRenderer.invoke('scan-folder', folderPath, sortMode, forceShuffle, hueOrigin),
  getImagesPage: (folderId: number, offset: number, limit: number, sortMode?: string) => ipcRenderer.invoke('get-images-page', folderId, offset, limit, sortMode),
  getImagesCount: (folderId: number) => ipcRenderer.invoke('get-images-count', folderId),
  getImagesPageMulti: (folderIds: number[], offset: number, limit: number, sortMode?: string) => ipcRenderer.invoke('get-images-page-multi', folderIds, offset, limit, sortMode),
  getImagesCountMulti: (folderIds: number[]) => ipcRenderer.invoke('get-images-count-multi', folderIds),
  searchImages: (folderId: number, query: string, offset: number, limit: number) => ipcRenderer.invoke('search-images', folderId, query, offset, limit),
  searchImagesCount: (folderId: number, query: string) => ipcRenderer.invoke('search-images-count', folderId, query),
  // 描述搜索
  searchByDescription: (folderId: number, query: string, offset: number, limit: number) => ipcRenderer.invoke('search-by-description', folderId, query, offset, limit),
  searchByDescriptionCount: (folderId: number, query: string) => ipcRenderer.invoke('search-by-description-count', folderId, query),
  // 评分搜索
  searchByRating: (folderId: number, ratings: number[], offset: number, limit: number) => ipcRenderer.invoke('search-by-rating', folderId, ratings, offset, limit),
  searchByRatingCount: (folderId: number, ratings: number[]) => ipcRenderer.invoke('search-by-rating-count', folderId, ratings),
  // 宽高比搜索
  searchByAspectRatio: (folderId: number, ratioW: number, ratioH: number, tolerance: number, offset: number, limit: number) => ipcRenderer.invoke('search-by-aspect-ratio', folderId, ratioW, ratioH, tolerance, offset, limit),
  searchByAspectRatioCount: (folderId: number, ratioW: number, ratioH: number, tolerance: number) => ipcRenderer.invoke('search-by-aspect-ratio-count', folderId, ratioW, ratioH, tolerance),
  // 多文件夹搜索
  searchImagesMulti: (folderIds: number[], query: string, offset: number, limit: number, sortMode?: string) => ipcRenderer.invoke('search-images-multi', folderIds, query, offset, limit, sortMode),
  searchImagesCountMulti: (folderIds: number[], query: string) => ipcRenderer.invoke('search-images-count-multi', folderIds, query),
  searchByDescriptionMulti: (folderIds: number[], query: string, offset: number, limit: number, sortMode?: string) => ipcRenderer.invoke('search-by-description-multi', folderIds, query, offset, limit, sortMode),
  searchByDescriptionCountMulti: (folderIds: number[], query: string) => ipcRenderer.invoke('search-by-description-count-multi', folderIds, query),
  searchByRatingMulti: (folderIds: number[], ratings: number[], offset: number, limit: number, sortMode?: string) => ipcRenderer.invoke('search-by-rating-multi', folderIds, ratings, offset, limit, sortMode),
  searchByRatingCountMulti: (folderIds: number[], ratings: number[]) => ipcRenderer.invoke('search-by-rating-count-multi', folderIds, ratings),
  searchByAspectRatioMulti: (folderIds: number[], ratioW: number, ratioH: number, tolerance: number, offset: number, limit: number, sortMode?: string) => ipcRenderer.invoke('search-by-aspect-ratio-multi', folderIds, ratioW, ratioH, tolerance, offset, limit, sortMode),
  searchByAspectRatioCountMulti: (folderIds: number[], ratioW: number, ratioH: number, tolerance: number) => ipcRenderer.invoke('search-by-aspect-ratio-count-multi', folderIds, ratioW, ratioH, tolerance),
  // 印象色搜索
  searchByColor: (folderIds: number[], target: { h: number; s: number; v: number }, tolerance: number, offset: number, limit: number, sortMode?: string, useHue?: boolean, useSat?: boolean, useValue?: boolean) => ipcRenderer.invoke('search-by-color', folderIds, target, tolerance, offset, limit, sortMode, useHue, useSat, useValue),
  // AI 语义搜索（CLIP）
  computeClipBatch: (paths: string[]) => ipcRenderer.invoke('compute-clip-batch', paths),
  computeClipFeature: (filePath: string) => ipcRenderer.invoke('compute-clip-feature', filePath),
  buildClipIndex: (folderId: number, force?: boolean) => ipcRenderer.invoke('build-clip-index', folderId, force),
  buildClipIndexMulti: (folderIds: number[], force?: boolean) => ipcRenderer.invoke('build-clip-index-multi', folderIds, force),
  searchByText: (query: string, scope?: { folderId?: number; folderIds?: number[] }, topN?: number) => ipcRenderer.invoke('search-by-text', query, scope, topN),
  clipIndexStatus: (folderId: number) => ipcRenderer.invoke('clip-index-status', folderId),
  clipIndexStatusMulti: (folderIds: number[]) => ipcRenderer.invoke('clip-index-status-multi', folderIds),
  buildColorIndex: (folderId: number, force?: boolean) => ipcRenderer.invoke('build-color-index', folderId, force),
  buildColorIndexMulti: (folderIds: number[]) => ipcRenderer.invoke('build-color-index-multi', folderIds),
  colorIndexStatus: (folderId: number) => ipcRenderer.invoke('color-index-status', folderId),
  colorIndexStatusMulti: (folderIds: number[]) => ipcRenderer.invoke('color-index-status-multi', folderIds),
  onClipIndexProgress: (cb: (p: { done: number; total: number }) => void) => {
    const handler = (_e: any, p: { done: number; total: number }) => { try { cb(p) } catch {} }
    ipcRenderer.on('clip-index-progress', handler)
    return () => { try { ipcRenderer.removeListener('clip-index-progress', handler) } catch {} }
  },
  onColorIndexProgress: (cb: (p: { done: number; total: number }) => void) => {
    const handler = (_e: any, p: { done: number; total: number }) => { try { cb(p) } catch {} }
    ipcRenderer.on('color-index-progress', handler)
    return () => { try { ipcRenderer.removeListener('color-index-progress', handler) } catch {} }
  },
  // 直接返回 IPC 返回 Promise<void>，方便调用方 await 获取结果，不通过 onClipIndexProgress 等事件
  rawBuildClipIndex: (folderId: number) => ipcRenderer.invoke('build-clip-index', folderId),
  getRandomSample: (folderId: number, excludePath: string, count: number) => ipcRenderer.invoke('get-random-sample', folderId, excludePath, count),
  getAllImageIds: (folderId: number) => ipcRenderer.invoke('get-all-image-ids', folderId),
  getImagesByIds: (ids: number[]) => ipcRenderer.invoke('get-images-by-ids', ids),
  generateThumbnail: (sourcePath: string) => ipcRenderer.invoke('generate-thumbnail', sourcePath),
  favoriteImage: (sourcePath: string) => ipcRenderer.invoke('favorite-image', sourcePath),
  unfavoriteImage: (sourcePath: string) => ipcRenderer.invoke('unfavorite-image', sourcePath),
  setImageRating: (filePath: string, rating: number) => ipcRenderer.invoke('set-image-rating', filePath, rating),
  setImageDescription: (filePath: string, desc: string) => ipcRenderer.invoke('set-image-description', filePath, desc),
  clearRatingsInFolder: (folderPath: string) => ipcRenderer.invoke('clear-ratings-in-folder', folderPath),
  clearDescriptionsInFolder: (folderPath: string) => ipcRenderer.invoke('clear-descriptions-in-folder', folderPath),
  saveAs: (sourcePath: string) => ipcRenderer.invoke('save-as', sourcePath),
  saveAsBatch: (sourcePaths: string[], destFolder: string) => ipcRenderer.invoke('save-as-batch', sourcePaths, destFolder),
  deleteImage: (filePath: string) => ipcRenderer.invoke('delete-image', filePath),
  openInFolder: (filePath: string) => ipcRenderer.invoke('open-in-folder', filePath),
  openWithDefault: (filePath: string) => ipcRenderer.invoke('open-with-default', filePath),
  yandexSearch: (filePath: string) => ipcRenderer.invoke('yandex-search', filePath),
  saucenaoSearch: (filePath: string) => ipcRenderer.invoke('saucenao-search', filePath),
  tineyeSearch: (filePath: string) => ipcRenderer.invoke('tineye-search', filePath),
  tracemoeSearch: (filePath: string) => ipcRenderer.invoke('tracemoe-search', filePath),
  googlelensSearch: (filePath: string) => ipcRenderer.invoke('googlelens-search', filePath),
  importImagesToFolder: (imgPaths: string[], destFolder: string) => ipcRenderer.invoke('import-images-to-folder', imgPaths, destFolder),
  copyImageToClipboard: (filePath: string) => ipcRenderer.invoke('copy-image-to-clipboard', filePath),
  copyFilesToClipboard: (filePaths: string[]) => ipcRenderer.invoke('copy-files-to-clipboard', filePaths),
  readClipboardFiles: () => ipcRenderer.invoke('read-clipboard-files'),
  syncFolderSnapshot: (folderPath: string) => ipcRenderer.invoke('sync-folder-snapshot', folderPath),
  startWatcher: (folderPath: string) => ipcRenderer.invoke('start-watcher', folderPath),
  stopWatcher: () => ipcRenderer.invoke('stop-watcher'),
  recomputeSortOrder: (folderId: number, sortMode: string, forceShuffle?: boolean, hueOrigin?: number) => ipcRenderer.invoke('recompute-sort-order', folderId, sortMode, forceShuffle, hueOrigin),
  getRandomSeed: (folderId: number) => ipcRenderer.invoke('get-random-seed', folderId),
  setRandomSeed: (folderId: number, seed: string) => ipcRenderer.invoke('set-random-seed', folderId, seed),
  computeFeature: (filePath: string) => ipcRenderer.invoke('compute-feature', filePath),
  computeFeaturesBatch: (paths: string[]) => ipcRenderer.invoke('compute-features-batch', paths),
  getClipFeaturesByPaths: (paths: string[]) => ipcRenderer.invoke('get-clip-features-by-paths', paths),
  getColorInfoByPaths: (paths: string[]) => ipcRenderer.invoke('get-color-info-by-paths', paths),
  prefetchFeatures: (folderId: number) => ipcRenderer.invoke('prefetch-features', folderId),
  getAllFeatures: () => ipcRenderer.invoke('get-all-features'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectFolders: () => ipcRenderer.invoke('select-folders'),
  selectImage: () => ipcRenderer.invoke('select-image'),
  analyzeBgBrightness: (path: string) => ipcRenderer.invoke('analyze-bg-brightness', path),
  selectCoverImage: (folderPath: string) => ipcRenderer.invoke('select-cover-image', folderPath),
  dbInitFolder: (folderPath: string) => ipcRenderer.invoke('db-init-folder', folderPath),
  dbInsertImage: (image: any) => ipcRenderer.invoke('db-insert-image', image),
  dbDeleteImage: (filePath: string) => ipcRenderer.invoke('db-delete-image', filePath),
  dbGetImagesByFolder: (folderId: number) => ipcRenderer.invoke('db-get-images-by-folder', folderId),
  updateImageDimensions: (filePath: string, width: number, height: number) => ipcRenderer.invoke('update-image-dimensions', filePath, width, height),
  updateImageThumbnail: (filePath: string, thumbnailPath: string) => ipcRenderer.invoke('update-image-thumbnail', filePath, thumbnailPath),
  getDimensionsBatch: (paths: string[]) => ipcRenderer.invoke('get-dimensions-batch', paths),
  fillImageDims: (paths: string[]) => ipcRenderer.invoke('fill-image-dims', paths),
  getImageInfo: (filePath: string) => ipcRenderer.invoke('get-image-info', filePath),
  saveConfig: (config: any) => ipcRenderer.invoke('save-config', config),
  setZoomFactor: (factor: number) => { try { webFrame.setZoomFactor(factor) } catch {} },
  getZoomFactor: () => { try { return webFrame.getZoomFactor() } catch { return 1 } },
  setFormatFilter: (exts: string[]) => ipcRenderer.invoke('set-format-filter', exts),
  clearImageCache: () => ipcRenderer.invoke('clear-image-cache'),
  readConfig: () => ipcRenderer.invoke('read-config'),
  loadFavorites: () => ipcRenderer.invoke('load-favorites'),
  generateThumbnailsBatch: (filePaths: string[]) => ipcRenderer.invoke('generate-thumbnails-batch', filePaths),

  // F1 图形审计
  getImageMetadata: (filePath: string) => ipcRenderer.invoke('get-image-metadata', filePath),
  samplePixel: (filePath: string, x: number, y: number) => ipcRenderer.invoke('sample-pixel', filePath, x, y),
  sampleRect: (filePath: string, x: number, y: number, w: number, h: number) => ipcRenderer.invoke('sample-rect', filePath, x, y, w, h),
  computeHistogram: (filePath: string, sampleStep?: number) => ipcRenderer.invoke('compute-histogram', filePath, sampleStep),
  computeColorAnalysis: (filePath: string) => ipcRenderer.invoke('compute-color-analysis', filePath),


  // pinboards
  getPinboards: () => ipcRenderer.invoke('pinboards-read'),
  createPinboard: (name: string) => ipcRenderer.invoke('pinboards-create', name),
  setCurrentPinboard: (id: string) => ipcRenderer.invoke('pinboards-set-current', id),
  deletePinboard: (id: string) => ipcRenderer.invoke('pinboards-delete', id),
  renamePinboard: (id: string, name: string) => ipcRenderer.invoke('pinboards-rename', id, name),
  setPinboardHotkey: (id: string, hotkey: string) => ipcRenderer.invoke('pinboards-set-hotkey', id, hotkey),
  reorderPinboards: (orderedIds: string[]) => ipcRenderer.invoke('pinboards-reorder', orderedIds),
  clearPinboard: (id: string) => ipcRenderer.invoke('pinboards-clear', id),
  addImageToPinboard: (id: string, imagePath: string) => ipcRenderer.invoke('pinboards-add-image', id, imagePath),
  removeImageFromPinboard: (id: string, imagePath: string) => ipcRenderer.invoke('pinboards-remove-image', id, imagePath),
  exportPinboard: (id: string) => ipcRenderer.invoke('pinboards-export', id),
  exportPinboardToFolder: (id: string, folderPath: string) => ipcRenderer.invoke('pinboards-export-to-folder', id, folderPath),
  hasNonemptyPinboards: () => ipcRenderer.invoke('pinboards-has-nonempty'),
  clearAllPinboards: () => ipcRenderer.invoke('pinboards-clear-all'),

  // folder management
  getAllFolders: () => ipcRenderer.invoke('get-all-folders'),
  reorderFolders: (orderedIds: number[]) => ipcRenderer.invoke('reorder-folders', orderedIds),
  addFolder: () => ipcRenderer.invoke('add-folder'),
  addFolderByPath: (folderPath: string) => ipcRenderer.invoke('add-folder-by-path', folderPath),
  getFolderNameByPath: (folderPath: string) => ipcRenderer.invoke('get-folder-name-by-path', folderPath),
  getFolderRandomThumbs: (folderId: number, count: number) => ipcRenderer.invoke('get-folder-random-thumbs', folderId, count),
  addFolderNew: (name: string) => ipcRenderer.invoke('create-new-folder', name),
  updateFolderName: (id: number, name: string) => ipcRenderer.invoke('update-folder-name', id, name),
  updateFolderDescription: (id: number, desc: string) => ipcRenderer.invoke('update-folder-description', id, desc),
  updateFolderPath: (id: number) => ipcRenderer.invoke('update-folder-path', id),
  updateFolderCover: (id: number, coverPath: string) => ipcRenderer.invoke('update-folder-cover', id, coverPath),
  toggleFolderFavorite: (id: number, val: number) => ipcRenderer.invoke('toggle-folder-favorite', id, val),
  deleteFolder: (id: number, folderPath?: string) => ipcRenderer.invoke('delete-folder', id, folderPath),
  updateFolderColor: (folderId: number, color: string) => ipcRenderer.invoke('update-folder-color', folderId, color),
  getFolderStats: (folderId: number) => ipcRenderer.invoke('get-folder-stats', folderId),
  getAllFolderStats: () => ipcRenderer.invoke('get-all-folder-stats'),
  getAllFolderGridData: () => ipcRenderer.invoke('get-all-folder-grid-data'),
  preloadFolderStats: () => ipcRenderer.invoke('preload-folder-stats'),
  getDashboardStats: () => ipcRenderer.invoke('get-dashboard-stats'),
  getFavoritesCount: () => ipcRenderer.invoke('get-favorites-count'),

  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  windowIsAlwaysOnTop: () => ipcRenderer.invoke('window-is-always-on-top'),
  windowToggleAlwaysOnTop: () => ipcRenderer.send('window-toggle-always-on-top'),
  setTitlebarTheme: (isLight: boolean) => ipcRenderer.invoke('set-titlebar-theme', isLight),
  onWindowStateChanged: (callback: (isMaximized: boolean) => void) => {
    ipcRenderer.on('window-state-changed', (_event, isMaximized) => callback(isMaximized))
  },
  onDbSync: (callback: (data: any) => void) => {
    ipcRenderer.on('sync-db', (_event, data) => callback(data))
  },
  onConfirmClose: (callback: () => void) => {
    ipcRenderer.on('confirm-close', () => callback())
  },
  onConfirmOversize: (callback: () => void) => {
    ipcRenderer.on('confirm-oversize', () => callback())
  },
  respondOversizeConfirm: (confirmed: boolean) => {
    ipcRenderer.send('confirm-oversize-response', confirmed)
  },
  onDropResult: (callback: (data: { folders: string[] }) => void) => {
    ipcRenderer.on('drop-result', (_event, data) => callback(data))
  },
  onShowToast: (callback: (data: { msg: string; ms?: number }) => void) => {
    ipcRenderer.on('show-toast', (_event, data) => callback(data))
  },
  respondCloseConfirm: (confirmed: boolean) => {
    ipcRenderer.send('confirm-close-response', confirmed)
  },
  readFileBuffer: (filePath: string) => ipcRenderer.invoke('read-file-buffer', filePath),
  perfProbe: (payload: any) => ipcRenderer.invoke('perf-probe', payload),
  writeTempPng: (data: Uint8Array) => ipcRenderer.invoke('write-temp-png', data),
  openRefBoard: (filePath: string) => ipcRenderer.invoke('open-ref-board', filePath),
  resetRefCascade: () => ipcRenderer.invoke('reset-ref-cascade'),
  installShellMenu: () => ipcRenderer.invoke('install-shell-menu'),
  uninstallShellMenu: () => ipcRenderer.invoke('uninstall-shell-menu'),
  shellMenuStatus: () => ipcRenderer.invoke('shell-menu-status'),
}

contextBridge.exposeInMainWorld('picrand', api)

// 拖放导入：在隔离世界直接监听 drop，用 webUtils 取磁盘路径
// 避免 contextBridge 序列化 File 对象时丢失 Electron 内部路径元数据
if (typeof document !== 'undefined') {
  document.addEventListener('dragover', (e) => { e.preventDefault() }, true)
  document.addEventListener('drop', (e) => {
    e.preventDefault()
    const dt = e.dataTransfer
    // 图钉板设置中的拖拽重排：跳过文件夹导入流程，避免误报“未识别到有效文件夹”
    if (dt && Array.from(dt.types || []).includes('x-picrand/reorder')) { return }
    if (!dt) { ipcRenderer.send('drop-folders', { paths: [], diag: 'no dataTransfer' }); return }
    const paths: string[] = []
    const errs: string[] = []
    const files = dt.files
    const fLen = files ? files.length : 0
    const items = dt.items
    const iLen = items ? items.length : 0

    // 1) 直接用 webUtils.getPathForFile 取路径（对拖入的文件项有效）
    if (files && fLen) {
      for (let i = 0; i < fLen; i++) {
        const f = files[i] as any
        let p = ''
        try { p = webUtils.getPathForFile(f) || '' } catch (er: any) { errs.push('f'+i+':gpf:'+(er?.message||'err')) }
        if (!p) try { p = f.path || '' } catch {}
        if (p) paths.push(p)
      }
    }

    // 2) 对仍无路径的项，用 webkitGetAsEntry 进入目录，取第一个内部文件的磁盘路径，dirname 得到文件夹
    const send = () => ipcRenderer.send('drop-folders', { paths, diag: `files=${fLen} items=${iLen} ${errs.join(';')}` })
    if (!paths.length && items && iLen) {
      const pending: Promise<void>[] = []
      for (let i = 0; i < iLen; i++) {
        let entry: any = null
        try { entry = (items[i] as any).webkitGetAsEntry?.() } catch (er: any) { errs.push('i'+i+':entry:'+(er?.message||'err')); continue }
        if (!entry) { errs.push('i'+i+':noEntry'); continue }
        if (entry.isDirectory) {
          pending.push((async () => {
            try {
              const firstFile = await readFirstFileInDirEntry(entry)
              if (firstFile) {
                let p = ''
                try { p = webUtils.getPathForFile(firstFile) || '' } catch {}
                if (p) { const dir = p.includes('\\') ? p.split('\\').slice(0, -1).join('\\') : p.split('/').slice(0, -1).join('/'); if (dir) paths.push(dir) }
                else errs.push('i'+i+':dirNoPath')
              } else { errs.push('i'+i+':dirEmpty') }
            } catch (er: any) { errs.push('i'+i+':dirRead:'+(er?.message||'err')) }
          })())
        } else if (entry.isFile) {
          errs.push('i'+i+':isFile')
        } else { errs.push('i'+i+':unknownEntry') }
      }
      if (pending.length) { Promise.all(pending).then(send); return }
    }
    send()
  }, true)
}

// 递归读取目录 entry，返回找到的第一个真实文件的 File 对象（用于取磁盘绝对路径）
function readFirstFileInDirEntry(dirEntry: any, depth = 0): Promise<File | null> {
  return new Promise((resolve) => {
    if (depth > 8) { resolve(null); return }
    const reader = dirEntry.createReader()
    const readBatch = () => {
      reader.readEntries((entries: any[]) => {
        if (!entries.length) { resolve(null); return }
        ;(async () => {
          for (const ent of entries) {
            if (ent.isFile) {
              try { const f = await new Promise<File | null>((res) => ent.file((file: File) => res(file), () => res(null))); if (f) { resolve(f); return } } catch {}
            } else if (ent.isDirectory) {
              const f = await readFirstFileInDirEntry(ent, depth + 1); if (f) { resolve(f); return }
            }
          }
          readBatch()
        })()
      }, () => resolve(null))
    }
    readBatch()
  })
}
