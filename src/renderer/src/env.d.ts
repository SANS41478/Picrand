/// <reference types="vite/client" />

declare module 'gifuct-js' {
  export function parseGIF(arrayBuffer: ArrayBuffer): any
  export function decompressFrames(parsedGif: any, buildImagePatches: boolean): any[]
  export function decompressFrame(frame: any, gct: any, buildImagePatch: boolean): any
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface ThumbnailResult {
  thumbnail_path: string
  width?: number
  height?: number
}

interface BatchThumbnailResult {
  file_path: string
  thumbnail_path: string
  width?: number
  height?: number
}

interface DbSyncPayload {
  type: 'add' | 'unlink' | 'change'
  path?: string
  image?: ImageItem
}

interface PinboardImage {
  path: string
  addedAt: string
}

interface Pinboard {
  id: string
  name: string
  createdAt: string
  images: PinboardImage[]
  hotkey?: string
}

interface PinboardsState {
  currentId: string | null
  boards: Pinboard[]
}

// 全状态快照：切换文件夹时保存，切回时瞬间还原
interface FolderSnapshot {
  images: ImageItem[]       // 已加载的全部图片（已 Object.freeze）
  scrollRatio: number        // 0-1 像素滚动比例
  loaded: number             // _loaded
  hasMore: boolean           // _hasMore
  folderId: number           // _folderId
  totalImages: number        // gallery.totalImages
  sortMode: string           // gallery.sortMode
  searchQuery?: string       // 搜索词（搜索模式下保存）
  searchMode?: string        // 'filename' | 'description' | 'ai'
  searchRating?: number[]   // 评分搜索参数
  searchRatio?: { w: number; h: number; tol: number }  // 比例搜索参数
  searchColor?: { h: number; s: number; v: number; tol: number; useHue: boolean; useSat: boolean; useValue: boolean }  // 印象色搜索参数
  searchFilterMode?: string // 'normal' | 'description' | 'ai' | 'rating' | 'ratio' | 'similar'
}

interface PicrandAPI {
  getPaths: () => Promise<{ dataDir: string; cacheDir: string; configPath: string }>
  setNewFoldersDir?: () => Promise<string | null>
  scanFolder: (folderPath: string, sortMode?: string, forceShuffle?: boolean) => Promise<ScanResult[]>
  generateThumbnail: (sourcePath: string) => Promise<ThumbnailResult>
  generateThumbnailsBatch: (filePaths: string[]) => Promise<{ results: BatchThumbnailResult[]; errors: string[] } | BatchThumbnailResult[]>
  getPinboards: () => Promise<PinboardsState>
  createPinboard: (name: string) => Promise<PinboardsState | { error: true; message: string }>
  setCurrentPinboard: (id: string) => Promise<PinboardsState>
  deletePinboard: (id: string) => Promise<PinboardsState>
  renamePinboard: (id: string, name: string) => Promise<PinboardsState | { error: true; message: string }>
  setPinboardHotkey: (id: string, hotkey: string) => Promise<{ state: PinboardsState; displaced: { name: string } | null } | { error: true; message: string }>
  reorderPinboards: (orderedIds: string[]) => Promise<PinboardsState>
  clearPinboard: (id: string) => Promise<PinboardsState>
  addImageToPinboard: (id: string, imagePath: string) => Promise<PinboardsState>
  removeImageFromPinboard: (id: string, imagePath: string) => Promise<PinboardsState>
  exportPinboard: (id: string) => Promise<{ canceled: boolean; count: number; folderPath: string }>
  exportPinboardToFolder?: (id: string, folderPath: string) => Promise<{ count: number; folderPath: string }>
  hasNonemptyPinboards: () => Promise<number>
  clearAllPinboards: () => Promise<boolean>
  getAllFolders: () => Promise<any[]>
  reorderFolders?: (orderedIds: number[]) => Promise<boolean>
  addFolder: () => Promise<any>
  addFolderByPath: (folderPath: string) => Promise<any>
  addFolderNew?: (name: string) => Promise<any>
  updateFolderName: (id: number, name: string) => Promise<boolean>
  updateFolderDescription?: (id: number, desc: string) => Promise<boolean>
  updateFolderPath: (id: number) => Promise<any>
  updateFolderCover?: (id: number, coverPath: string) => Promise<boolean>
  deleteFolder: (id: number, folderPath?: string) => Promise<boolean>
  updateFolderColor?: (folderId: number, color: string) => Promise<boolean>
  getFolderStats?: (folderId: number) => Promise<{ count: number; totalSize: number; latestPath: string | null; latestThumb: string | null }>
  getAllFolderStats?: () => Promise<Record<number, { count: number; totalSize: number; latestPath: string | null; latestThumb: string | null; recentPaths: { file_path: string; thumbnail_path: string | null }[] }>>
  getAllFolderGridData?: () => Promise<Record<number, { count: number; countCapped: boolean; totalSize: number; coverUrl: string; thumbUrls: string[] }>>
  preloadFolderStats?: () => Promise<boolean>
  getDashboardStats?: () => Promise<{ folderStats: Record<number, { count: number; totalSize: number }>; favoritesCount: number }>
  getFavoritesCount?: () => Promise<number>
  favoriteImage: (sourcePath: string) => Promise<string>
  unfavoriteImage: (sourcePath: string) => Promise<boolean>
  setImageRating: (filePath: string, rating: number) => Promise<boolean>
  setImageDescription: (filePath: string, desc: string) => Promise<boolean>
  clearRatingsInFolder: (folderPath: string) => Promise<{ cleared: number }>
  clearDescriptionsInFolder: (folderPath: string) => Promise<{ cleared: number }>
  saveAs: (sourcePath: string) => Promise<boolean>
  deleteImage: (filePath: string) => Promise<{ success: boolean; note?: string }>
  openInFolder: (filePath: string) => Promise<void>
  openWithDefault: (filePath: string) => Promise<string>
  selectFolder: () => Promise<string | null>
  selectFolders?: () => Promise<string[]>
  selectImage?: () => Promise<string | null>
  analyzeBgBrightness?: (path: string) => Promise<'dark' | 'bright' | null>
  selectCoverImage?: (folderPath: string) => Promise<string | null>
  getRandomSample?: (folderId: number, excludePath: string, count: number) => Promise<any[]>
  getAllImageIds?: (folderId: number) => Promise<{ id: number; file_path: string }[]>
  getImagesByIds?: (ids: number[]) => Promise<any[]>
  searchImages?: (folderId: number, query: string, offset: number, limit: number) => Promise<any[]>
  searchImagesCount?: (folderId: number, query: string) => Promise<number>
  // 描述搜索
  searchByDescription?: (folderId: number, query: string, offset: number, limit: number) => Promise<any[]>
  searchByDescriptionCount?: (folderId: number, query: string) => Promise<number>
  // 评分搜索
  searchByRating?: (folderId: number, ratings: number[], offset: number, limit: number) => Promise<any[]>
  searchByRatingCount?: (folderId: number, ratings: number[]) => Promise<number>
  // 宽高比搜索
  searchByAspectRatio?: (folderId: number, ratioW: number, ratioH: number, tolerance: number, offset: number, limit: number) => Promise<any[]>
  searchByAspectRatioCount?: (folderId: number, ratioW: number, ratioH: number, tolerance: number) => Promise<number>
  // 多文件夹搜索
  searchImagesMulti?: (folderIds: number[], query: string, offset: number, limit: number, sortMode?: string) => Promise<any[]>
  searchImagesCountMulti?: (folderIds: number[], query: string) => Promise<number>
  searchByDescriptionMulti?: (folderIds: number[], query: string, offset: number, limit: number, sortMode?: string) => Promise<any[]>
  searchByDescriptionCountMulti?: (folderIds: number[], query: string) => Promise<number>
  searchByRatingMulti?: (folderIds: number[], ratings: number[], offset: number, limit: number, sortMode?: string) => Promise<any[]>
  searchByRatingCountMulti?: (folderIds: number[], ratings: number[]) => Promise<number>
  searchByAspectRatioMulti?: (folderIds: number[], ratioW: number, ratioH: number, tolerance: number, offset: number, limit: number, sortMode?: string) => Promise<any[]>
  searchByAspectRatioCountMulti?: (folderIds: number[], ratioW: number, ratioH: number, tolerance: number) => Promise<number>
  // 印象色搜索
  searchByColor?: (folderIds: number[], target: { h: number; s: number; v: number }, tolerance: number, offset: number, limit: number, sortMode?: string, useHue?: boolean, useSat?: boolean, useValue?: boolean) => Promise<{ rows: any[]; total: number }>
  // AI 语义搜索（CLIP）
  computeClipBatch?: (paths: string[]) => Promise<{ ok: boolean; missing?: number; cached?: number; error?: string }>
  computeClipFeature?: (filePath: string) => Promise<number[] | null>
  buildClipIndex?: (folderId: number, force?: boolean) => Promise<{ ok: boolean; total?: number; done?: number; reason?: string; error?: string }>
  buildClipIndexMulti?: (folderIds: number[], force?: boolean) => Promise<{ ok: boolean; total?: number; done?: number; reason?: string; error?: string }>
  buildColorIndex?: (folderId: number, force?: boolean) => Promise<{ ok: boolean; total?: number; done?: number; error?: string }>
  buildColorIndexMulti?: (folderIds: number[]) => Promise<{ ok: boolean; total?: number; done?: number; error?: string }>
  colorIndexStatus?: (folderId: number) => Promise<{ total: number; indexed: number }>
  colorIndexStatusMulti?: (folderIds: number[]) => Promise<{ total: number; indexed: number }>
  searchByText?: (query: string, scope?: { folderId?: number; folderIds?: number[] }, topN?: number) => Promise<Array<{ file_path: string; score: number }>>
  clipIndexStatus?: (folderId: number) => Promise<{ total: number; indexed: number }>
  clipIndexStatusMulti?: (folderIds: number[]) => Promise<{ total: number; indexed: number }>
  getClipFeaturesByPaths?: (paths: string[]) => Promise<Array<{ file_path: string; features: number[] | null }>>
  getColorInfoByPaths?: (paths: string[]) => Promise<Array<{ file_path: string; color_info: string | null }>>
  onClipIndexProgress?: (cb: (p: { done: number; total: number }) => void) => (() => void)
  onColorIndexProgress?: (cb: (p: { done: number; total: number }) => void) => (() => void)
  startWatcher: (folderPath: string) => Promise<void>
  stopWatcher: () => Promise<void>
  dbInitFolder: (folderPath: string) => Promise<number>
  dbInsertImage: (image: any) => Promise<void>
  dbDeleteImage: (filePath: string) => Promise<void>
  dbGetImagesByFolder: (folderId: number) => Promise<any[]>
  fillImageDims?: (paths: string[]) => Promise<Record<string, { width: number; height: number }>>
  updateImageDimensions: (filePath: string, width: number, height: number) => Promise<void>
  updateImageThumbnail: (filePath: string, thumbnailPath: string) => Promise<void>
  getImageInfo: (filePath: string) => Promise<ImageItem>
  loadFavorites: () => Promise<ImageItem[]>
  saveConfig: (config: any) => Promise<boolean>
  readConfig: () => Promise<any>
  setZoomFactor: (factor: number) => void
  getZoomFactor: () => number
  setFormatFilter?: (exts: string[]) => Promise<boolean>
  clearImageCache?: () => Promise<boolean>
  windowMinimize: () => void
  windowMaximize: () => void
  getFilePath: (file: File) => string
  resolveDropPaths: (paths: string[]) => Promise<string[]>
  onDropResult: (callback: (data: { folders: string[] }) => void) => void
  windowClose: () => void
  windowIsMaximized: () => Promise<boolean>
  windowIsAlwaysOnTop: () => Promise<boolean>
  windowToggleAlwaysOnTop: () => void
  onWindowStateChanged: (callback: (isMaximized: boolean) => void) => void
  onDbSync: (callback: (data: DbSyncPayload) => void) => void
  onConfirmClose: (callback: () => void) => void
  respondCloseConfirm: (confirmed: boolean) => void
  // F1 图形审计
  getImageMetadata: (filePath: string) => Promise<ImageMetadata | null>
  samplePixel: (filePath: string, x: number, y: number) => Promise<PixelSample | null>
  sampleRect: (filePath: string, x: number, y: number, w: number, h: number) => Promise<RectSample | null>
  computeHistogram: (filePath: string, sampleStep?: number) => Promise<HistogramData | null>
  computeColorAnalysis?: (filePath: string) => Promise<ColorAnalysis | null>
  readFileBuffer: (filePath: string) => Promise<Uint8Array | null>
    writeTempPng: (data: Uint8Array) => Promise<string | null>
    openRefBoard: (filePath: string) => Promise<{ ok?: boolean; error?: boolean }>
  installShellMenu: () => Promise<{ ok: boolean; error?: string }>
  uninstallShellMenu: () => Promise<{ ok: boolean; error?: string }>
  shellMenuStatus: () => Promise<{ installed: boolean }>
  yandexSearch: (filePath: string) => Promise<boolean>
  saucenaoSearch: (filePath: string) => Promise<boolean>
  tineyeSearch: (filePath: string) => Promise<boolean>
  tracemoeSearch: (filePath: string) => Promise<boolean>
  googlelensSearch: (filePath: string) => Promise<boolean>
  importImagesToFolder?: (imgPaths: string[], destFolder: string) => Promise<{ ok: boolean; copied: number; firstFile: string | null }>
  copyImageToClipboard: (filePath: string) => Promise<boolean>
  copyFilesToClipboard?: (filePaths: string[]) => Promise<boolean>
  readClipboardFiles?: () => Promise<string[]>
  syncFolderSnapshot?: (folderPath: string) => Promise<{ ok: boolean; added?: number; removed?: number }>
}

interface ImageMetadata {
  width: number; height: number; space: string; channels: number
  hasAlpha: boolean; format: string; fileSize: number
  isPotWidth: boolean; isPotHeight: boolean
}
interface PixelSample { r: number; g: number; b: number; a: number; hex: string; floatR: number; floatG: number; floatB: number; h: number; s: number; v: number }
interface RectSample { r: number; g: number; b: number; hex: string; h: number; s: number; v: number }
interface HistogramData { luma: number[]; red: number[]; green: number[]; blue: number[]; totalPixels: number }

interface DominantColor { r: number; g: number; b: number; hex: string; percent: number }

interface ColorAnalysis {
  avgR: number; avgG: number; avgB: number
  avgHex: string
  hueHist: number[]; satHist: number[]; valHist: number[]
  hueAvg: number; satAvg: number; valAvg: number
  dominantColors: DominantColor[]
  totalPixels: number
}

interface ScanResult {
  file_path: string
  file_name: string
  file_size: number
  modify_time: number
}

interface ImageItem {
  id?: number
  folder_id?: number
  file_path: string
  file_name: string
  file_size: number
  modify_time: number
  width?: number
  height?: number
  thumbnail_path?: string
  is_favorite?: number
  favorited_at?: number
  rating?: number
  description?: string
}

type SortMode = 'random' | 'name-asc' | 'name-desc' | 'time-asc' | 'time-desc' | 'dim-asc' | 'dim-desc' | 'size-asc' | 'size-desc' | 'hue-asc' | 'hue-desc' | 'sat-asc' | 'sat-desc' | 'val-asc' | 'val-desc' | 'collection-asc' | 'collection-desc'

type SearchFilterMode = 'normal' | 'description' | 'ai' | 'rating' | 'ratio' | 'similar' | 'color'

declare global {
  interface Window {
    picrand: PicrandAPI
  }
}
