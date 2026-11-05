import { app, BrowserWindow, ipcMain, protocol, dialog, shell, screen, globalShortcut, Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import { join, basename, extname, dirname } from 'path'
import fs from 'fs'
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, createReadStream, unlinkSync, statSync, renameSync, appendFileSync } from 'fs'
import crypto from 'crypto'
import { createHash, randomUUID } from 'crypto'
import os from 'os'
import { initSteamStatus, getSteamStatus, openSteamStore } from './steam'

// 全局崩溃守护：捕获 JS 层未处理异常/rejection 写入 crash-guard.log。
// native segfault 捕获不到（进程直接被 OS 终止），但能排除 JS 层错误、留下崩溃前最后线索。
// 放在所有模块加载前注册，确保任意时机异常都能被记录。
process.on('uncaughtException', (err) => {
  try {
    const { app: _a } = require('electron')
    const _dir = _a?.isPackaged ? _a.getPath('userData') : join(process.cwd(), '_internal_data')
    appendFileSync(join(_dir, 'crash-guard.log'),
      `[${new Date().toISOString()}] uncaughtException: ${err?.stack || String(err)}\n`)
  } catch {}
  console.error('[crash-guard] uncaughtException:', err)
})
process.on('unhandledRejection', (reason) => {
  try {
    const { app: _a } = require('electron')
    const _dir = _a?.isPackaged ? _a.getPath('userData') : join(process.cwd(), '_internal_data')
    appendFileSync(join(_dir, 'crash-guard.log'),
      `[${new Date().toISOString()}] unhandledRejection: ${String(reason && (reason as any).stack || reason)}\n`)
  } catch {}
  console.error('[crash-guard] unhandledRejection:', reason)
})

// sharp 异步编码跑在 libuv 线程池（默认 4）。翻阅时大量未缓存缩略图涌入，
// 4 线程被占满会让 getImagesPage 等 IPC 抢不到线程而排队秒级。
// 扩到 16 让 sharp 与 IPC 各有可用线程。必须在 Electron 初始化前设。
try { if (!process.env.UV_THREADPOOL_SIZE) process.env.UV_THREADPOOL_SIZE = '12' } catch {}

// 暴露 V8 GC：PSD/视频解码后主动回收大 Buffer，避免等 GC 自动周期
// --expose-gc 在下面 app.commandLine.appendSwitch('js-flags', '--expose-gc') 中（对主+渲染进程生效）
function _gc() { try { if (typeof (global as any).gc === 'function') (global as any).gc() } catch {} }
function _scheduleGC() { setTimeout(_gc, 0) }

app.setName('PicRand')
app.commandLine.appendSwitch('force_high_performance_gpu')
app.commandLine.appendSwitch('js-flags', '--expose-gc')

// 主进程导入新增函数
import { initDatabase, getDb, insertImage, deleteImageByPath, getOrCreateFolder, updateFavorite, getFavoriteImages, getFavoritesCount, getFolderCachedStats, closeDatabase, updateThumbnailPath, updateImageDimensions, getAllFolders, addFolder, updateFolderName, updateFolderPath, deleteFolderById, getImagesByFolder, getImagesPage, getImagesCount, insertImagesBatch, recomputeSortOrder, getFolderStoredSortMode, getImagesPageMulti, getImagesCountMulti, getRandomSample, getRandomSampleMulti, getImagesByIds, getAllImageIds, getFeaturesByFolder, getAllFeatures, updateFolderColor, getFolderStats, updateFolderCover, getFolderStoredCover, updateFolderFavorite, updateFolderDescription, reorderFolders, searchImages, searchImagesCount, searchByDescription, searchByDescriptionCount, searchByRating, searchByRatingCount, searchByAspectRatio, searchByAspectRatioCount, searchImagesMulti, searchImagesCountMulti, searchByDescriptionMulti, searchByDescriptionCountMulti, searchByRatingMulti, searchByRatingCountMulti, searchByAspectRatioMulti, searchByAspectRatioCountMulti, searchByColor, getFolderDisplayNameByPath, getFolderRandomThumbs, getFolderRandomSeed, setFolderRandomSeed, generateRandomSeed, updateRating, updateDescription, clearRatingsInFolder, clearDescriptionsInFolder, updateClipFeature, getClipFeaturesByFolder, getAllClipFeatures, getRootClipFeatures, getClipFeaturesByPaths, countClipFeaturesByFolder, countClipFeaturesByFolders, updateColorInfo, getColorInfoByFolder, getColorInfoByPaths, countColorInfoByFolder, countColorInfoByFolders, setFormatFilter, isFormatAllowed, updateFeaturesBatch, getThumbnailPaths } from './database'
import { startWatching, stopWatching, getWatchedFolder, isWatching } from './watcher'

let mainWindow: BrowserWindow | null = null
let allowClose = false
// 定时器引用：退出时清理以释放事件循环
let _gcInterval: ReturnType<typeof setInterval> | null = null
let _hbInterval: ReturnType<typeof setInterval> | null = null
let tray: Tray | null = null
// 扫描中断机制：每次新扫描递增世代数，旧扫描检测到世代变化后立即中止
let _scanGen = 0
let _activeScanWorker: any = null
const pendingDimReads = new Map<number, Promise<void>>() // folderId → 后台补读尺寸 Promise
// scan-folder 阶段 M 后台视频海报队列当前在跑的 ffmpeg 子进程句柄。
// 切文件夹时 _killScanVpFfmpegs() kill 掉在途抽帧，避免切换后 ffmpeg 仍烧 CPU + tmp PNG 短残留。
const _scanVpFfmpegs: Set<any> = new Set()
function _killScanVpFfmpegs() {
  for (const p of _scanVpFfmpegs) { try { (p as any)._picrandKilled ? (p as any)._picrandKilled() : p.kill() } catch {} }
  _scanVpFfmpegs.clear()
}
const _refBoardPids = new Set<number>() // 追踪所有参考板进程 PID，用于托盘批量控制
// 诊断探针：记录业务子进程计数 + 枚举所有 PicRand.exe 子进程的 --type= 参数。
// Chromium 自身按需扩出的 utility/renderer（storage/audio/spare 等）不是我们 spawn 的，
// 靠 wmic 枚举真实进程命令行才能看清切文件夹后多出来的是哪种 Chromium 进程。
function _logChildProbes(tag: string) {
  try {
    let procLine = ''
    try {
      const { execSync } = require('child_process')
      const out = execSync('wmic process where "name=\'PicRand.exe\'" get ProcessId,CommandLine /format:list', { windowsHide: true, timeout: 3000 }).toString()
      // 提取每个进程的 --type= 参数，统计各类型计数
      const types = new Map<string, number>()
      const lines = out.split('\n')
      let curCli = ''
      for (const ln of lines) {
        const t = ln.trim()
        if (t.startsWith('CommandLine=')) curCli = t.slice('CommandLine='.length)
        else if (t.startsWith('ProcessId=')) {
          const m = curCli.match(/--type=(\S+)/)
          const ty = m ? m[1] : 'main'
          types.set(ty, (types.get(ty) || 0) + 1)
          curCli = ''
        }
      }
      const parts: string[] = []
      for (const [ty, n] of types) parts.push(`${ty}=${n}`)
      procLine = ` procs=[${parts.join(',')}] total=${[...types.values()].reduce((a, b) => a + b, 0)}`
    } catch {}
    appendFileSync(join(dataDir, 'perf-probe.log'),
      `[childprobe] ${new Date().toISOString()} tag=${tag} watcher=${isWatching() ? 1 : 0} scanVpFfmpeg=${_scanVpFfmpegs.size} refBoard=${_refBoardPids.size}${procLine}\n`)
  } catch {}
}
let currentLocale = 'zh'

type PinboardImage = { path: string; addedAt: string }
type Pinboard = { id: string; name: string; createdAt: string; images: PinboardImage[]; hotkey?: string }
type PinboardsState = { currentId: string | null; boards: Pinboard[] }

const isDev = !app.isPackaged
const exeDir = isDev ? process.cwd() : dirname(app.getPath('exe'))
const dataDir = isDev ? join(process.cwd(), '_internal_data') : join(app.getPath('userData'))
const cacheDir = join(dataDir, 'cache')
const localDataDir = join(exeDir, '_internal_data')
// 新建文件夹默认位置（dataDir），可在设置中改为自定义路径
let newFoldersDir = join(localDataDir, '_new_folders')
const configPath = join(dataDir, 'config.json')

// 解析 DB 中存储的路径：优先解析绝对路径，再尝试 exeDir 和 dataDir
function resolveStoredPath(storedPath: string): string {
  if (existsSync(storedPath)) return storedPath
  const resolved = join(exeDir, storedPath)
  if (existsSync(resolved)) return resolved
  const resolved2 = join(dataDir, storedPath)
  if (existsSync(resolved2)) return resolved2
  return storedPath
}
const pinboardsPath = join(dataDir, 'pinboards.json')
const logPath = join(dataDir, 'thumbnail-errors.log')

function logError(msg: string) {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] ${msg}\n`
  try {
    const fs = require('fs')
    fs.appendFileSync(logPath, line, 'utf8')
  } catch {}
}

// 托盘参考板控制诊断日志
const _trayLogPath = join(dataDir, 'refboard-tray.log')
function _logTray(msg: string) {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] ${msg}\n`
  try {
    const fs = require('fs')
    fs.appendFileSync(_trayLogPath, line, 'utf8')
    console.log('[refboard-tray]', msg) // dev 模式下控制台也可见
  } catch {}
}

// ====== PSD 格式支持：3 长期 Worker + FIFO 队列 + 闲置回收内存 ======

let _psdPoolInit = false
let _psdPoolIdleTimer: ReturnType<typeof setTimeout> | null = null
const _PSD_IDLE_MS = 5_000  // 5 秒无任务则销毁 Worker 释放 native 内存
const _PSD_WORKERS = 3
const _psdWorkers: any[] = []
const _psdPending: Array<{
  psdPath: string
  resolve: (v: { width: number; height: number; pixels: Buffer }) => void
  reject: (e: Error) => void
}> = []

function _resetPsdIdleTimer() {
  if (_psdPoolIdleTimer) clearTimeout(_psdPoolIdleTimer)
  _psdPoolIdleTimer = setTimeout(() => {
    console.log('[psd-pool] idle, terminating workers to free memory')
    for (const w of _psdWorkers) { try { w.terminate() } catch {} }
    _psdWorkers.length = 0
    _psdPoolInit = false
  }, _PSD_IDLE_MS)
}

// 立即销毁 PSD worker 池：用于切文件夹/切筛选等切换节点，不等 5 秒 idle。
// 与 _resetPsdIdleTimer 的区别：立即 terminate + 清空挂起队列（reject 上层 Promise 避免悬挂）。
function _terminatePsdPoolNow() {
  if (_psdPoolIdleTimer) { clearTimeout(_psdPoolIdleTimer); _psdPoolIdleTimer = null }
  for (const w of _psdWorkers) { try { w.terminate() } catch {} }
  _psdWorkers.length = 0
  const pending = _psdPending.splice(0)
  for (const j of pending) { try { j.reject(new Error('psd pool terminated')) } catch {} }
  _psdPoolInit = false
}

// 重置 sharp（libvips）LRU 解码缓存：重新应用 cache 配置会 evict 已缓存的解码结果。
// 不用 cache(false) + cache(true) 切换--并发解码中调 cache(false) 可能导致 native 状态不一致。
// 重新设置相同的限制即触发 LRU eviction，且对正在进行的解码无影响。
async function _clearSharpCache() {
  try {
    const sharp = (await import('sharp')).default
    sharp.cache({ memory: 10, files: 0, items: 5 })
  } catch {}
}

function _dispatchJob(w: any, job: any) {
  const cleanup = () => {
    w._busy = false
    w.off('message', handler)
    w.off('error', onErr)
    w.off('exit', onExit)
  }
  const onErr = (err: Error) => {
    logError(`[psd-worker] error on ${basename(job.psdPath)}: ${err.message}`)
    cleanup()
    job.reject(new Error(`psd worker error: ${err.message}`))
    // 从活跃池中移除崩溃的 Worker
    const idx = _psdWorkers.indexOf(w)
    if (idx >= 0) _psdWorkers.splice(idx, 1)
    // 投递队列中下一个任务（若有）
    if (_psdPending.length > 0) {
      // 先确保池中有可用 Worker（可能需要在后台补一个）
      _ensurePsdPool().then(() => {
        const nextW = _psdWorkers.find(x => !x._busy)
        if (nextW) _dispatchJob(nextW, _psdPending.shift()!)
      })
    } else {
      _resetPsdIdleTimer()
    }
  }
  const onExit = (code: number) => {
    logError(`[psd-worker] exited with code ${code} while processing ${basename(job.psdPath)}`)
    cleanup()
    job.reject(new Error(`psd worker exited with code ${code}`))
    const idx = _psdWorkers.indexOf(w)
    if (idx >= 0) _psdWorkers.splice(idx, 1)
    // 同上：处理队列中下一个任务
    if (_psdPending.length > 0) {
      _ensurePsdPool().then(() => {
        const nextW = _psdWorkers.find(x => !x._busy)
        if (nextW) _dispatchJob(nextW, _psdPending.shift()!)
      })
    } else {
      _resetPsdIdleTimer()
    }
  }
  const handler = (msg: any) => {
    if (msg.psdPath !== job.psdPath) return
    cleanup()
    if (msg.ok) job.resolve({ width: msg.width, height: msg.height, pixels: msg.pixels })
    else job.reject(new Error(msg.error || 'psd decode failed'))
    if (_psdPending.length > 0) {
      _dispatchJob(w, _psdPending.shift()!)
    } else {
      _resetPsdIdleTimer()
    }
  }
  w._busy = true
  if (_psdPoolIdleTimer) clearTimeout(_psdPoolIdleTimer)
  w.on('message', handler)
  w.on('error', onErr)
  w.on('exit', onExit)
  w.postMessage({ psdPath: job.psdPath })
}

async function _ensurePsdPool() {
  if (_psdPoolInit) return
  _psdPoolInit = true

  const path = await import('path')
  const fs = await import('fs')
  const { Worker } = await import('worker_threads')

  const workerPath = path.join(__dirname, 'psd-worker.cjs')
  // 运行时写入 Worker 文件（确保 electron-vite 的 out/main/ 中一定存在）
  if (!fs.existsSync(workerPath)) {
    fs.writeFileSync(workerPath, `\
const { parentPort } = require('worker_threads');
const { readFileSync } = require('fs');
require('ag-psd/initialize-canvas');
const { readPsd } = require('ag-psd');
parentPort.on('message', ({ psdPath }) => {
  try {
    const buf = readFileSync(psdPath);
    const psd = readPsd(buf, { skipLayerImageData: true, skipThumbnail: true, useImageData: true });
    const { data, width, height } = psd.imageData;
    parentPort.postMessage({ ok: true, psdPath, width, height, pixels: Buffer.from(data.buffer, data.byteOffset, data.byteLength) }, [data.buffer]);
  } catch(e) {
    parentPort.postMessage({ ok: false, psdPath, error: e.message || String(e) });
  }
});
parentPort.postMessage({ ready: true });
`)
  }

  for (let i = 0; i < _PSD_WORKERS; i++) {
    const w = new Worker(workerPath)
    w._busy = false
    _psdWorkers.push(w)
    // 等待当前 Worker ready 后再创建下一个（顺序初始化）
    await new Promise<void>((resolve) => {
      const onMsg = (msg: any) => { if (msg.ready) { w.off('message', onMsg); resolve() } }
      w.on('message', onMsg)
      w.on('error', (err: Error) => { logError(`[psd-worker] ${err.message}`); resolve() })
    })
  }
}

async function ensurePsdPng(psdPath: string): Promise<string> {
  const pngPath = join(cacheDir, 'psd-' + createHash('md5').update(psdPath).digest('hex') + '.png')
  if (existsSync(pngPath)) {
    // Verify cached PNG is valid
    try {
      const sharp = (await import('sharp')).default
      await sharp(pngPath).metadata()
      return pngPath
    } catch {
      // Corrupt cache, delete and re-convert
      try { const fsp = await import('fs'); fsp.unlinkSync(pngPath) } catch {}
    }
  }

  console.log('[psd] converting:', basename(psdPath))
  try {
    await _ensurePsdPool()
    console.log('[psd] pool ready, dispatching decode job')
    const job = await new Promise<{ width: number; height: number; pixels: Buffer }>((resolve, reject) => {
      const timeout = setTimeout(() => { reject(new Error('psd decode timeout')) }, 120000);
      const safeResolve = (v: any) => { clearTimeout(timeout); resolve(v) };
      const safeReject = (e: any) => { clearTimeout(timeout); reject(e) };
      const free = _psdWorkers.find(w => !w._busy)
      if (free) _dispatchJob(free, { psdPath, resolve: safeResolve, reject: safeReject })
      else _psdPending.push({ psdPath, resolve: safeResolve, reject: safeReject })
    })
    // 主进程用 sharp 直接从 RGBA Buffer 编码 PNG（跳过 Cairo canvas.toBuffer）
    const sharp = (await import('sharp')).default
    let { width, height, pixels } = job
    console.log('[psd] decoded:', width, 'x', height, 'buf:', pixels?.length)
    // Validate buffer size
    const expectedSize = width * height * 4
    if (!pixels || pixels.length < expectedSize) {
      console.error('[psd] buffer size mismatch:', pixels?.length, 'expected:', expectedSize)
      if (pixels && pixels.length > 0 && pixels.length >= width * height * 3) {
        // Probably RGB, pad to RGBA
        const rgba = Buffer.alloc(expectedSize)
        for (let i = 0; i < width * height; i++) {
          rgba[i * 4] = pixels[i * 3]
          rgba[i * 4 + 1] = pixels[i * 3 + 1]
          rgba[i * 4 + 2] = pixels[i * 3 + 2]
          rgba[i * 4 + 3] = 255
        }
        pixels = rgba
      } else {
        return psdPath
      }
    }
    await sharp(pixels, {
      raw: { width, height, channels: 4 },
    }).png().toFile(pngPath)
    updateImageDimensions(psdPath, width, height)
    _scheduleGC()  // 回收 PSD RGBA Buffer（大尺寸可达 100MB+）
    console.log('[psd] done:', basename(psdPath))
    return pngPath
  } catch (e) {
    console.error('[psd] FAILED:', basename(psdPath), (e as any)?.message || e)
    logError(`[psd-convert] ${basename(psdPath)} - ${(e as any)?.message || e}`)
    return psdPath
  }
}

// ====== 视频：首帧海报 ======
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi', '.flv', '.f4v'])
function isVideoExt(ext: string): boolean {
  return VIDEO_EXTS.has(ext.toLowerCase())
}

function getPosterPath(filePath: string): string {
  return join(cacheDir, createHash('md5').update(filePath).digest('hex') + '.webp')
}

// ffmpeg 抽首帧到 tmp PNG；seekSec 传入则显式定位（失败重试用 0）。返回 tmpPng 路径或 null。
// onSpawn(可选)：把 ffmpeg 子进程句柄传出，供调用方在切文件夹等场景 kill 在途抽帧避免残留。
async function extractVideoFrame(filePath: string, seekSec?: number, onSpawn?: (p: any) => void): Promise<string | null> {
  const os = await import('os')
  const tmpPng = join(os.tmpdir(), 'picrand-frame-' + createHash('md5').update(filePath).digest('hex') + '-' + Math.floor(Math.random() * 1e6) + '.png')
  try {
    const ffmpegPath = (await import('@ffmpeg-installer/ffmpeg' as any)).path as string
    const { spawn } = await import('child_process')
    const args = ['-y']
    if (seekSec !== undefined) args.push('-ss', String(seekSec))
    // 抽帧时直接缩放到 400px 宽，避免产出 4K 临时 PNG（~33MB）再进 sharp 二次解码
    args.push('-i', filePath, '-vframes', '1', '-vf', 'scale=400:-1', '-an', tmpPng)
    const killed = { v: false }
    await new Promise<void>((resolve, reject) => {
      const p = spawn(ffmpegPath, args, { stdio: 'ignore', windowsHide: true })
      if (onSpawn) onSpawn(p)
      // 被外部 kill 时 exit code 非 0，识别出"取消"与"失败"两种语义都走 reject，由调用方 catch 兜底清理 tmpPng
      p.on('exit', (code) => { if (killed.v) resolve(); else (code === 0 ? resolve() : reject(new Error('ffmpeg exit ' + code))) })
      p.on('error', reject)
      ;(p as any)._picrandKilled = () => { killed.v = true; try { p.kill() } catch {} }
    })
    if (!existsSync(tmpPng)) return null
    return tmpPng
  } catch (e: any) {
    logError(`[video-frame] ${basename(filePath)} - ${e?.message || e}`)
    try { if (existsSync(tmpPng)) unlinkSync(tmpPng) } catch {}
    return null
  }
}

// 返回海报 webp 缓存路径；失败返回 ''。
// onSpawn(可选)：透传给 extractVideoFrame，调用方可借此 kill 在途抽帧。
// 【临时测试开关】关闭视频海报计算（逻辑保留，恢复时改回 false 或删掉此变量与下面那行 if）
let _posterCalcDisabled = false
async function getOrGeneratePoster(filePath: string, onSpawn?: (p: any) => void): Promise<string> {
  const posterPath = getPosterPath(filePath)
  if (existsSync(posterPath)) return posterPath
  if (_posterCalcDisabled) return ''
  let tmpPng = await extractVideoFrame(filePath, undefined, onSpawn)
  if (!tmpPng) tmpPng = await extractVideoFrame(filePath, 0, onSpawn)
  if (!tmpPng) {
    logError(`[video-poster] ${basename(filePath)} - frame extraction failed`)
    return ''
  }
  // 顺便持久化无损 PNG（供灯箱/参考板/搜图复用，避免二次抽帧）
  const pngPath = getPosterPngPath(filePath)
  if (!existsSync(pngPath)) {
    try { const fse = await import('fs-extra'); await fse.copy(tmpPng, pngPath) } catch {}
  }
  try {
    const sharp = (await import('sharp')).default
    await sharp(tmpPng).resize({ width: 400, withoutEnlargement: true }).webp({ quality: 75 }).toFile(posterPath)
    return posterPath
  } catch (e: any) {
    logError(`[video-poster] ${basename(filePath)} - encode failed: ${e?.message || e}`)
    try { if (existsSync(posterPath)) unlinkSync(posterPath) } catch {}
    return ''
  } finally {
    try { if (existsSync(tmpPng)) unlinkSync(tmpPng) } catch {}
    _scheduleGC()  // 视频帧 sharp 解码后可能留下 >30MB native 缓冲
  }
}

// 原分辨率无损 PNG（灯箱/参考板/搜图用）。命中缓存或从 tmp PNG 生成。
function getPosterPngPath(filePath: string): string {
  return join(cacheDir, createHash('md5').update(filePath).digest('hex') + '.png')
}

// 读视频尺寸：解析 ffmpeg -i stderr 里 "Video: ... WxH" 准确流分辨率（抽帧 PNG 尺寸可能与流不一致）
async function readVideoDimensions(filePath: string): Promise<{ width: number; height: number } | null> {
  try {
    const ffmpegPath = (await import('@ffmpeg-installer/ffmpeg' as any)).path as string
    const { spawn } = await import('child_process')
    const buf: string[] = []
    await new Promise<void>((resolve) => {
      const p = spawn(ffmpegPath, ['-i', filePath], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
      p.stderr.on('data', (d: Buffer) => buf.push(d.toString()))
      p.stdout.on('data', () => {})
      const done = () => resolve()
      p.on('exit', done); p.on('error', done)
    })
    const text = buf.join('')
    // 取最后一个 Video 流行的 WxH（避免 Annex B 多流情形），格式如 "540x404 [SAR 1:1 DAR ...]"
    const m = text.match(/Video:[^\n]*?(\d{2,5})x(\d{2,5})/)
    if (m) return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) }
    return null
  } catch { return null }
}

async function resolveForSharp(filePath: string): Promise<string> {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.psd') return await ensurePsdPng(filePath)
  if (isVideoExt(ext)) return await getOrGeneratePoster(filePath)
  return filePath
}

// 仅读取 PSD 尺寸（跳过像素渲染，<100ms vs 5-15s）
async function readPsdDimensions(psdPath: string): Promise<{ width: number; height: number } | null> {
  try {
    await import('ag-psd')
    try { require('ag-psd/initialize-canvas') } catch {}
    const { readPsd } = await import('ag-psd')
    const fsp = await import('fs')
    const buf = await fsp.promises.readFile(psdPath)
    await new Promise(r => setImmediate(r))
    const psd = readPsd(buf, {
      skipLayerImageData: true,
      skipCompositeImageData: true,
      skipThumbnail: true,
    })
    return { width: psd.width, height: psd.height }
  } catch { return null }
}

// 统一入口：读取任意图片的宽高（PSD 走快速路径，其他走 sharp）
async function readImageDimensions(filePath: string, sharpRef?: any): Promise<{ width: number; height: number } | null> {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.psd') return await readPsdDimensions(filePath)
  if (isVideoExt(ext)) return await readVideoDimensions(filePath)
  // 走独立轻量 metadata 通道（8 路、独立队列），不与大图缩略图争抢 CPU 闸门，
  // 避免大图占满闸门时尺寸补读超时失败导致渲染层拿到 0 尺寸走 0.75 兜底比例
  try {
    await _metaAcquire()
    try {
      const sharp = sharpRef || (await import('sharp')).default
      const m = await sharp(filePath).metadata()
      if (m.width && m.height) return { width: m.width, height: m.height }
    } finally { _metaRelease() }
  } catch {}
  return null
}

// 8 路并发补齐一组行对象里缺失的尺寸（轻量 metadata 通道），并回写 DB。
// 用于评分搜索等会返回 width/height 为 0 图片的路径，避免瀑布流用 0.75 兜底比例显示 4:3。
async function _fillRowsDims(rows: any[]): Promise<void> {
  const need = rows.filter((r: any) => !r.width || !r.height)
  if (!need.length) return
  let cursor = 0
  const runOne = async () => {
    while (true) {
      const i = cursor++
      if (i >= need.length) break
      const r = need[i]
      try {
        const d = await readImageDimensions(r.file_path)
        if (d && d.width > 0 && d.height > 0) {
          r.width = d.width; r.height = d.height
          updateImageDimensions(r.file_path, d.width, d.height)
        }
      } catch {}
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, need.length) }, () => runOne()))
}

function ensureDataDirs() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  if (!existsSync(localDataDir)) mkdirSync(localDataDir, { recursive: true })
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true })
  // migrate: old userData/_new_folders -> exe localDataDir/_new_folders
  const oldNewFolders = join(dataDir, '_new_folders')
  if (existsSync(oldNewFolders)) {
    try {
      if (!existsSync(newFoldersDir)) mkdirSync(newFoldersDir, { recursive: true })
      const fsp = require('fs')
      const copyDirRecursive = (src: string, dst: string) => {
        const entries = fsp.readdirSync(src, { withFileTypes: true })
        for (const e of entries) {
          const sP = join(src, e.name); const dP = join(dst, e.name)
          if (e.isDirectory()) { if (!existsSync(dP)) fsp.mkdirSync(dP, { recursive: true }); copyDirRecursive(sP, dP) }
          else if (!existsSync(dP)) { try { fsp.copyFileSync(sP, dP) } catch {} }
        }
      }
      copyDirRecursive(oldNewFolders, newFoldersDir)
      try { fsp.rmSync(oldNewFolders, { recursive: true, force: true }) } catch {}
    } catch {}
  }
  if (!existsSync(newFoldersDir)) mkdirSync(newFoldersDir, { recursive: true })
  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify({ columns: 4, picRadius: 8, picGap: 12, picShadow: 'heavy', themeColor: '#faf5ef', sortMode: 'random', defaultSortMode: 'random', bgImagePath: '', bgBlurAmount: 12, locale: 'en' }, null, 2))
    currentLocale = 'en'
  } else {
    try {
      const cfg = JSON.parse(readFileSync(configPath, 'utf-8'))
      if (cfg.locale) currentLocale = cfg.locale
      // 从 config 读取自定义新建文件夹路径
      if (cfg.newFoldersPath && existsSync(cfg.newFoldersPath)) {
        newFoldersDir = cfg.newFoldersPath
      }
      // 格式筛选：每次启动默认全选，不从 config 恢复
      try { setFormatFilter(null) } catch {}
    } catch {}
  }
  if (!existsSync(pinboardsPath)) writeFileSync(pinboardsPath, JSON.stringify({ currentId: null, boards: [] }, null, 2))
}

function readPinboards(): PinboardsState {
  try {
    if (!existsSync(pinboardsPath)) return { currentId: null, boards: [] }
    const data = JSON.parse(readFileSync(pinboardsPath, 'utf-8'))
    if (!Array.isArray(data?.boards)) return { currentId: null, boards: [] }
    return { currentId: data.currentId || null, boards: data.boards }
  } catch {
    return { currentId: null, boards: [] }
  }
}

function writePinboards(data: PinboardsState): PinboardsState {
  const tmp = pinboardsPath + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(tmp, pinboardsPath)
  return data
}

function createPinboardId(): string {
  try { return randomUUID() } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}` }
}

function getPinboardOrThrow(data: PinboardsState, id: string): Pinboard {
  const board = data.boards.find(b => b.id === id)
  if (!board) throw new Error('图钉板不存在')
  return board
}

async function copyFileUnique(sourcePath: string, targetDir: string): Promise<string> {
  const fs = await import('fs-extra')
  const path = await import('path')
  const ext = path.extname(sourcePath)
  const base = path.basename(sourcePath, ext)
  let dest = path.join(targetDir, path.basename(sourcePath))
  let i = 1
  while (await fs.pathExists(dest)) {
    dest = path.join(targetDir, `${base}(${i})${ext}`)
    i++
  }
  await fs.copy(sourcePath, dest)
  return dest
}

// 检查缓存文件是否存在并将路径回写到 DB（缓存文件存在但 DB 不知道的情况）
function discoverThumbnailPath(filePath: string): string {
  // 先查 DB
  const row = getDb().prepare('SELECT thumbnail_path FROM images WHERE file_path = ?').get(filePath) as { thumbnail_path: string } | undefined
  if (row?.thumbnail_path && existsSync(row.thumbnail_path)) return row.thumbnail_path

  const ext = extname(filePath).toLowerCase()

  // 方式1：MD5 hex
  const md5Name = createHash('md5').update(filePath).digest('hex') + ext
  const md5Gif = join(cacheDir, md5Name)
  const md5Webp = join(cacheDir, md5Name.replace(ext, '.webp'))
  const md5Jpg = join(cacheDir, md5Name.replace(ext, '.jpg'))
  if (ext === '.gif' && existsSync(md5Gif)) { updateThumbnailPath(filePath, md5Gif); return md5Gif }
  if (existsSync(md5Webp)) { updateThumbnailPath(filePath, md5Webp); return md5Webp }
  if (existsSync(md5Jpg)) { updateThumbnailPath(filePath, md5Jpg); return md5Jpg }

  // 方式2：base64url
  const b64Name = Buffer.from(filePath).toString('base64url') + ext
  const b64Gif = join(cacheDir, b64Name)
  const b64Webp = join(cacheDir, b64Name.replace(ext, '.webp'))
  const b64Jpg = join(cacheDir, b64Name.replace(ext, '.jpg'))
  if (ext === '.gif' && existsSync(b64Gif)) { updateThumbnailPath(filePath, b64Gif); return b64Gif }
  if (existsSync(b64Webp)) { updateThumbnailPath(filePath, b64Webp); return b64Webp }
  if (existsSync(b64Jpg)) { updateThumbnailPath(filePath, b64Jpg); return b64Jpg }

  if (row?.thumbnail_path) updateThumbnailPath(filePath, '')
  return ''
}

function registerPicRandProtocol() {
  // 协议请求探针：渲染层每请求一张图就累计，每 50 张落盘一次。
  // 不依赖渲染层主动调 IPC，是瀑布流加载图片的必经之路，能看到图就一定有计数。
  let _protoCount = 0
  let _protoVideoCount = 0
  let _protoLastFlush = 0
  protocol.handle('picrand', async (request) => {
    _protoCount++
    const _origExt0 = extname(decodeURIComponent(new URL(request.url).searchParams.get('orig') || '')).toLowerCase()
    if (isVideoExt(_origExt0)) _protoVideoCount++
    const _now = Date.now()
    if (_protoCount - _protoLastFlush >= 50 || (_protoLastFlush === 0 && _protoCount >= 1)) {
      _protoLastFlush = _protoCount
      try { appendFileSync(join(dataDir, 'perf-probe.log'), `[proto] ${new Date().toISOString()} total=${_protoCount} video=${_protoVideoCount}\n`) } catch {}
    }
    const url = new URL(request.url)
    const origPath = decodeURIComponent(url.searchParams.get('orig') || '')
    const thumbPath = decodeURIComponent(url.searchParams.get('thumb') || '')
    const legacyPath = decodeURIComponent(url.searchParams.get('path') || '')

    let servePath = ''

    // 优先级：缓存命中 > 即时生成 > 原图 > 旧格式
    if (thumbPath && existsSync(thumbPath)) {
      servePath = thumbPath
    } else if (origPath && existsSync(origPath)) {
      const _origExt = extname(origPath).toLowerCase()
      if (isVideoExt(_origExt)) {
        // 视频：走 MD5 命名的首帧海报缓存（与 legacyPath 分支一致），不走 base64url 命名
        // 优先 webp 海报（轻量，瀑布池/卡片用），缺失则触发生成并回写 DB
        let poster = getPosterPath(origPath)
        if (!existsSync(poster)) {
          // 套用视频并发闸门，避免翻阅视频密集区时 ffmpeg 子进程风暴拖垮主进程
          await _videoAcquire()
          try { const p = await getOrGeneratePoster(origPath); if (p) poster = p } catch {}
          finally { _videoRelease() }
        }
        if (poster && existsSync(poster)) {
          servePath = poster
          try { updateThumbnailPath(origPath, poster) } catch {}
        } else {
          return new Response(null, { status: 404, statusText: 'Not Found' })
        }
      } else if (thumbPath) {
        // 缓存缺失：用 nativeImage 即时生成轻量缩略图
        try {
          servePath = await ensureQuickThumb(origPath, thumbPath)
        } catch {
          servePath = origPath
        }
      } else {
          const ext = extname(origPath).toLowerCase()
          const b64Name = Buffer.from(origPath).toString('base64url') + ext
          const expectedWebp = join(cacheDir, b64Name.replace(ext, '.webp'))
          const expectedJpg = join(cacheDir, b64Name.replace(ext, '.jpg'))
          if (existsSync(expectedWebp)) {
            servePath = expectedWebp
            updateThumbnailPath(origPath, expectedWebp)
          } else if (existsSync(expectedJpg)) {
            servePath = expectedJpg
            updateThumbnailPath(origPath, expectedJpg)
          } else {
            // GIF 直接返回原图保留动画，不生成静态缩略图
            if (ext === '.gif') {
              servePath = origPath
            } else {
              try {
                servePath = await ensureQuickThumb(origPath, expectedJpg)
              } catch {
                servePath = origPath
              }
            }
          }
        }
      } else if (legacyPath && existsSync(legacyPath)) {
      const lgExt = extname(legacyPath).toLowerCase()
      if (isVideoExt(lgExt)) {
        // 灯箱/幻灯片走 path= 视频本体：服务原分辨率无损首帧 PNG（更清晰），不能直接喂 .mp4
        let png = getPosterPngPath(legacyPath)
        if (!existsSync(png)) {
          // PNG 尚未生成：触发 getOrGeneratePoster（顺带产出 webp 和 PNG），再取 PNG
          // 与 orig= 分支一致经视频闸门，避免并发抽帧引发 ffmpeg 进程风暴
          await _videoAcquire()
          let p = ''
          try { p = await getOrGeneratePoster(legacyPath) } catch {}
          finally { _videoRelease() }
          png = p ? getPosterPngPath(legacyPath) : ''
        }
        servePath = (png && existsSync(png)) ? png : getPosterPath(legacyPath)
      } else {
        servePath = legacyPath
      }
    }

    if (!servePath) {
      return new Response(null, { status: 404, statusText: 'Not Found' })
    }

    // Chromium 不支持 TIFF，在服务前转为 JPEG（缓存到缩略图目录）
    const svcExt = extname(servePath).toLowerCase()
    if (svcExt === '.tiff' || svcExt === '.tif') {
      const sharp = (await import('sharp')).default
      const jpgName = createHash('md5').update(servePath).digest('hex') + '.jpg'
      const jpgPath = join(cacheDir, 'display-' + jpgName)
      if (!existsSync(jpgPath)) {
        await _cpuAcquire()
        try { await sharp(servePath).jpeg({ quality: 92 }).toFile(jpgPath) } catch {}
        finally { _cpuRelease() }
      }
      if (existsSync(jpgPath)) servePath = jpgPath
    }

    // Chromium 不支持 HEIC，在服务前转为 JPEG
    if (svcExt === '.heic' || svcExt === '.heif') {
      const sharp = (await import('sharp')).default
      const jpgName = createHash('md5').update(servePath).digest('hex') + '.jpg'
      const jpgPath = join(cacheDir, 'display-' + jpgName)
      if (!existsSync(jpgPath)) {
        await _cpuAcquire()
        try { await sharp(servePath).jpeg({ quality: 92 }).toFile(jpgPath) } catch {}
        finally { _cpuRelease() }
      }
      if (existsSync(jpgPath)) servePath = jpgPath
    }

    // Chromium 不支持 PSD，在服务前转为 PNG 缓存
    if (svcExt === '.psd') {
      // 与缩略图一致的超大 PSD 门槛：拒绝解码超大文件，避免 OOM（返回 404 占位）
      const PSD_MAX_PIXELS_SERVE = 64 * 1024 * 1024
      let skipPsd = false
      try {
        const dim = await readPsdDimensions(servePath)
        if (dim && dim.width > 0 && dim.height > 0 && dim.width * dim.height > PSD_MAX_PIXELS_SERVE) {
          logError(`[psd-serve] skip oversize ${basename(servePath)} ${dim.width}x${dim.height}`)
          skipPsd = true
        }
      } catch { skipPsd = true }
      if (!skipPsd) {
        const pngPath = await ensurePsdPng(servePath)
        if (existsSync(pngPath)) servePath = pngPath
      }
    }

    try {
      const ext = extname(servePath).toLowerCase()
      const mime = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : ext === '.bmp' ? 'image/bmp' : ext === '.tiff' || ext === '.tif' ? 'image/tiff' : ext === '.avif' ? 'image/avif' : ext === '.svg' ? 'image/svg+xml' : 'application/octet-stream'
      const fileSize = statSync(servePath).size
      // 统一流式返回：避免 readFileSync 将整个文件拉入 V8 external Buffer
      // 小文件也走 ReadStream，省去 N×完整文件副本的 external 内存累积
      const { Readable } = await import('stream')
      const nodeStream = createReadStream(servePath, { highWaterMark: 256 * 1024 })
      const webStream = Readable.toWeb(nodeStream) as ReadableStream
      return new Response(webStream, { status: 200, headers: { 'Content-Type': mime, 'Content-Length': String(fileSize), 'Cache-Control': 'max-age=15' } })
    } catch (e) {
      console.warn('[picrand] 404:', servePath.slice(0, 100), (e as any)?.message || '')
      return new Response(null, { status: 404, statusText: 'Not Found' })
    }
  })
}

// 即时生成缩略图（nativeImage 同步操作，快；sharp 后续后台替换为高质量版）
// 历史配比：图片 _thumbConcurrency=4、视频 _videoConcurrency=2。现统一纳入 _cpuConcurrency=2 全局闸门，
// 以下两个常量仅作类型配比备注保留（不再独立生效），实际并发由 _cpuConcurrency 决定。
const _thumbConcurrency = 4
const _videoConcurrency = 2

// === 主进程 CPU 全局闸门 ===
// sharp 缩略图与 ffmpeg 视频海报共享此闸门。历史值 3 偏保守（16核机器上大图会独占通道
// 导致后续请求超时）。提到 6：配合 UV_THREADPOOL_SIZE=12，能真跑 6 路解码、留 6 槽给
// metadata 通道与其他 IO。再高则纯排队无收益，且大图并发峰值内存（每路可达 100MB+）
// 在 16GB 机器上接近之前查的崩溃阈值。
const _cpuConcurrency = 6
let _cpuRunning = 0
const _cpuQueue: (() => void)[] = []

// === 用户活跃信号（翻阅暂停后台视频海报生成用）===
// 任意分页/搜索 IPC 进来时刷新此时间戳。scan-folder 后台视频海报 worker 在每张任务前
// 检查"距上次活跃是否 < 1500ms"：是则让出、等待，避免后台 ffmpeg/sharp 在用户快速翻阅时
// 抢占主进程 CPU 导致 getImagesPage IPC 排队、滚动卡死。
// 不仅依赖新增 IPC（脆弱），而是复用主进程本就高频被调的分页 IPC 自感知活跃。
let _lastActiveMs = 0
function _markActive() { _lastActiveMs = Date.now() }
function _isUserActive(cooldownMs = 1500) { return Date.now() - _lastActiveMs < cooldownMs }
function _cpuAcquire(): Promise<void> {
  if (_cpuRunning < _cpuConcurrency) { _cpuRunning++; return Promise.resolve() }
  // 30s 超时防止死锁：若消费者异常未释放闸门，排队者不会永久悬挂
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = _cpuQueue.indexOf(fn)
      if (idx >= 0) { _cpuQueue.splice(idx, 1); reject(new Error('cpu gate timeout')) }
    }, 30_000)
    const fn = () => { clearTimeout(timer); _cpuRunning++; resolve() }
    _cpuQueue.push(fn)
  })
}
function _cpuRelease() {
  _cpuRunning--
  if (_cpuQueue.length > 0) { _cpuQueue.shift()!() }
}

// === 轻量 metadata 通道（尺寸补读专用）===
// sharp().metadata() 只读文件头部几 KB，远快于整图解码，不应与大图缩略图争抢 CPU 闸门。
// 历史上尺寸补读串行 + 与缩略图共享 3 路闸门：大图缩略图占满闸门时，排在后面的尺寸补读
// 超时失败 → 渲染层拿 width=0 返回 → 瀑布池用 0.75 兜底比例（GalleryCanvas itemHeight）。
// 此通道独立 8 路并发、独立队列、独立超时，确保尺寸补读总能快速拿到、不被慢缩略图阻塞。
const _metaConcurrency = 8
let _metaRunning = 0
const _metaQueue: (() => void)[] = []
function _metaAcquire(): Promise<void> {
  if (_metaRunning < _metaConcurrency) { _metaRunning++; return Promise.resolve() }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = _metaQueue.indexOf(fn)
      if (idx >= 0) { _metaQueue.splice(idx, 1); reject(new Error('meta gate timeout')) }
    }, 15_000)
    const fn = () => { clearTimeout(timer); _metaRunning++; resolve() }
    _metaQueue.push(fn)
  })
}
function _metaRelease() {
  _metaRunning--
  if (_metaQueue.length > 0) { _metaQueue.shift()!() }
}

// sharp/ffmpeg 均通过 _cpuAcquire/_cpuRelease 进入主进程 CPU 全局闸门。
// 视频海报单独串行化（_videoAcquire/_videoRelease 改走独立 1 路闸门），
// 避免 4 路并发 sharp 同时解码 4K 帧，每帧 33MB+ native，峰值破 130MB。
let _videoRunning = 0
const _videoQueue: (() => void)[] = []
async function _videoAcquire(): Promise<void> {
  if (_videoRunning < 1) { _videoRunning++; return }
  return new Promise(resolve => _videoQueue.push(() => { _videoRunning++; resolve() }))
}
function _videoRelease() {
  _videoRunning--
  if (_videoQueue.length > 0) { _videoQueue.shift()!() }
}
async function _thumbAcquire(): Promise<void> { return _cpuAcquire() }
function _thumbRelease() { _cpuRelease() }

async function _ensureQuickThumbImpl(origPath: string, thumbPath: string): Promise<string> {
  // 确保目标目录存在
  const destDir = dirname(thumbPath)
  if (!existsSync(destDir)) {
    const fsp = await import('fs')
    fsp.mkdirSync(destDir, { recursive: true })
  }

  const ext = extname(thumbPath).toLowerCase()
  const origExt = extname(origPath).toLowerCase()
  if (ext === '.gif') {
    const fse = await import('fs-extra')
    await fse.copy(origPath, thumbPath)
  } else if (origExt === '.psd') {
    // PSD → 先转 PNG 缓存 → 再用 sharp 生成缩略图
    // 尺寸门槛：大 PSD 解码会产出 width*height*4 字节 RGBA，3 个 worker 并发时
    // 峰值内存极高（如 8000×8000 ≈ 256MB/张）。超过阈值时拒绝即时解码，
    // 让协议层回退到占位图，避免卡片模式批量加载时 OOM 崩溃。
    const PSD_MAX_PIXELS = 64 * 1024 * 1024  // 6400万像素上限（≈ 256MB RGBA/张）
    try {
      const dim = await readPsdDimensions(origPath)
      if (dim && dim.width > 0 && dim.height > 0 && dim.width * dim.height > PSD_MAX_PIXELS) {
        logError(`[psd-thumb] skip oversize ${basename(origPath)} ${dim.width}x${dim.height}`)
        return origPath  // 协议层将返回 404，前端显示占位
      }
      const pngPath = await ensurePsdPng(origPath)
      const sharp = (await import('sharp')).default
      await sharp(pngPath).resize({ width: 400, withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(thumbPath)
    } catch {
      return origPath
    }
  } else if (isVideoExt(origExt)) {
    // 视频 → 首帧海报 webp → sharp 转 jpeg 缩略图
    try {
      const poster = await getOrGeneratePoster(origPath)
      if (!poster) return origPath
      const sharp = (await import('sharp')).default
      await sharp(poster).resize({ width: 400, withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(thumbPath)
    } catch {
      return origPath
    }
  } else {
    // 用 sharp（异步，线程池）替代 nativeImage（同步阻塞）
    try {
      const sharp = (await import('sharp')).default
      await sharp(origPath).toColourspace('srgb').resize({ width: 400, withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(thumbPath)
    } catch {
      // sharp 失败 → 回退 nativeImage
      const { nativeImage } = await import('electron')
      const img = nativeImage.createFromPath(origPath)
      if (img.isEmpty()) return origPath
      const resized = img.resize({ width: 400 })
      const buf = resized.toJPEG(75)
      const fsp = await import('fs')
      fsp.writeFileSync(thumbPath, buf)
    }
  }

  try { updateThumbnailPath(origPath, thumbPath) } catch {}
  return thumbPath
}
async function ensureQuickThumb(origPath: string, thumbPath: string): Promise<string> {
  // 闸门超时重试：大图缩略图占满 3 路 CPU 闸门时，后续请求会 30s 超时。
  // 原先超时直接 reject → 协议层返回 404 → <img> 显示 broken-image（"加载失败"）。
  // 改为超时后退避重试，最多 3 轮，大图终究会解码完释放闸门让后续请求通过。
  for (let attempt = 0; attempt < 3; attempt++) {
    let acquired = false
    try {
      await _thumbAcquire()
      acquired = true
      return await _ensureQuickThumbImpl(origPath, thumbPath)
    } catch (e: any) {
      // 只有闸门超时才重试；其他错误（解码失败等）直接返回原图
      if (e?.message === 'cpu gate timeout' && attempt < 2) {
        await new Promise(r => setTimeout(r, 500))
        continue
      }
      return origPath
    } finally {
      if (acquired) _thumbRelease()
    }
  }
  return origPath
}

function showWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
  }
}

// ===== 参考板窗口批量控制 =====
// 策略：FindWindowExW 按窗口类名 "PicRandRefBoard4" 遍历所有 RefBoard 窗口
// + ShowWindowAsync 跨进程最小化/恢复。完全避开 koffi 回调（EnumWindows）。
// close 动作仍用 process.kill(pid)（可靠）。
let _refWinMod: any = null
const REFBOARD_CLASS = 'PicRandRefBoard4' // 与 refboard-d2d/src/main.cpp 中一致

async function _getRefWinMod() {
  if (_refWinMod) return _refWinMod
  const koffiMod = await import('koffi')
  const k: any = (koffiMod as any).default || koffiMod
  const user32 = k.load('user32.dll')

  // FindWindowExW(HWND parent, HWND after, LPCWSTR class, LPCWSTR title) → HWND
  const findWindowEx = user32.func('FindWindowExW', 'void *', ['void *', 'void *', 'str16', 'str16'])
  // ShowWindowAsync(HWND, int) → BOOL  —  跨进程安全的窗口显示控制
  const showWinAsync = user32.func('ShowWindowAsync', 'int32', ['void *', 'int32'])

  _refWinMod = { k, findWindowEx, showWinAsync }
  return _refWinMod
}

async function _refBoardWindows(action: 'hide' | 'show' | 'close') {
  _logTray('>>> _refBoardWindows called: action=' + action + ' trackedPids=' + _refBoardPids.size)

  // ---- close: 杀进程（纯 Node.js，已验证可靠） ----
  if (action === 'close') {
    for (const pid of _refBoardPids) { try { process.kill(pid, 0) } catch { _refBoardPids.delete(pid) } }
    const pids = [..._refBoardPids]
    if (pids.length === 0) { _logTray('no tracked PIDs to close'); return }
    for (const pid of pids) { try { process.kill(pid) } catch {}; _refBoardPids.delete(pid) }
    _logTray('closed ' + pids.length + ' refboard(s)')
    return
  }

  // ---- hide/show: 按窗口类名遍历所有 RefBoard 窗口 ----
  // SW_MINIMIZE=6  SW_RESTORE=9
  const nCmd = action === 'hide' ? 6 : 9
  _logTray(action + ' all RefBoard windows by class, nCmd=' + nCmd)

  try {
    const mod = await _getRefWinMod()
    const { k, findWindowEx, showWinAsync } = mod
    let hwnd: any = null
    let count = 0

    // 遍历所有类名为 PicRandRefBoard4 的顶层窗口
    while (true) {
      hwnd = findWindowEx(null, hwnd, REFBOARD_CLASS, null)
      if (!hwnd) break
      showWinAsync(hwnd, nCmd)
      count++
    }

    _logTray('FindWindowEx loop done, found ' + count + ' RefBoard windows, nCmd=' + nCmd)
  } catch (e: any) {
    _logTray('koffi ' + action + ' FAILED: ' + (e?.message || e))
  }
}

function createTray() {
  if (tray) return
  const iconPath = isDev
    ? join(process.cwd(), '_internal_data', 'icon.png')
    : join(__dirname, '../../../../_internal_data', 'icon.png')
  try {
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    tray = new Tray(icon)
  } catch {
    tray = new Tray(nativeImage.createEmpty())
  }
  tray.setToolTip('PicRand')
  const ctx = Menu.buildFromTemplate([
    { label: '显示 PicRand', click: () => showWindow() },
    { type: 'separator' },
    { label: '新建参考板', click: async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: '图片', extensions: ['jpg','jpeg','png','gif','bmp','webp','tiff','tif','ico','heic','heif','avif','svg','psd','mp4','webm','mov','mkv','avi','flv','f4v'] }]
      })
      if (result.canceled || !result.filePaths[0]) return
      const [cx, cy] = computeCascadePos()
      createRefWin(randomUUID(), result.filePaths[0], cx, cy).catch(() => {})
    } },
    { type: 'separator' },
    { label: '隐藏所有参考板', click: () => _refBoardWindows('hide') },
    { label: '显示所有参考板', click: () => _refBoardWindows('show') },
    { label: '关闭所有参考板', click: () => _refBoardWindows('close') },
    { type: 'separator' },
    { label: '退出', click: () => { allowClose = true; app.quit() } },
  ])
  tray.setContextMenu(ctx)
  tray.on('double-click', () => showWindow())
}

function createWindow() {
  if (mainWindow) return  // 防重入
  const preloadPath = isDev ? join(__dirname, '../preload/index.js') : join(__dirname, '../preload/index.js')
  // 读用户主题色作为窗口底色，避免冷启动先闪默认深蓝
  let bgColor = '#1a1a2e'
  try {
    if (existsSync(configPath)) {
      const cfg = JSON.parse(readFileSync(configPath, 'utf-8'))
      if (cfg.themeColor && cfg.themeColor !== 'glass') bgColor = cfg.themeColor
    }
  } catch {}
  mainWindow = new BrowserWindow({
    width: 1400, height: 900,
    frame: false,
    show: false,
    backgroundColor: bgColor,
    title: 'PicRand',
    icon: isDev ? join(process.cwd(), '_internal_data', 'icon.png') : join(__dirname, '../../../../_internal_data', 'icon.png'),
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, webSecurity: false }
  })
  mainWindow.once('ready-to-show', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show() })
  mainWindow.on('close', async (event) => {
    if (allowClose) return
    event.preventDefault()
    mainWindow?.webContents.send('confirm-close')
  })
  if (isDev) mainWindow.loadURL('http://localhost:5173')
  else mainWindow.loadFile(join(__dirname, '../../dist/index.html'))
  import('./clip-search').then(({ setClipSender }) => {
    setClipSender((channel: string, payload: any) => {
      try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload) } catch {}
    })
  })
}

ipcMain.handle('get-paths', () => ({ dataDir, cacheDir, configPath, newFoldersDir }))

ipcMain.handle('steam-status', async () => {
  await initSteamStatus()
  return getSteamStatus()
})
ipcMain.handle('open-steam-store', () => openSteamStore())

ipcMain.handle('set-new-folders-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory', 'createDirectory'] })
  if (result.canceled || !result.filePaths[0]) return null
  const newPath = result.filePaths[0]
  // 迁移已有文件夹到新位置
  if (existsSync(newFoldersDir) && newFoldersDir !== newPath) {
    try {
      const fse = await import('fs-extra')
      const items = readdirSync(newFoldersDir)
      for (const item of items) {
        const src = join(newFoldersDir, item)
        const dst = join(newPath, item)
        try { const s = statSync(src); if (s.isDirectory()) { await fse.copy(src, dst) } } catch {}
      }
    } catch {}
  }
  newFoldersDir = newPath
  if (!existsSync(newFoldersDir)) mkdirSync(newFoldersDir, { recursive: true })
  // 持久化到 config
  const cfg = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf-8')) : {}
  cfg.newFoldersPath = newPath
  writeFileSync(configPath, JSON.stringify(cfg, null, 2))
  return newPath
})

ipcMain.handle('read-config', () => {
  try { if (existsSync(configPath)) return JSON.parse(readFileSync(configPath, 'utf-8')) } catch {}
  return { columns: 4, picRadius: 8, picGap: 12, picShadow: 'light', themeColor: '#1a1a2e', sortMode: 'random', defaultSortMode: 'random' }
})

// === 性能探针日志（用于诊断快速翻动卡顿）===
// 渲染层把关键时序指标通过此 IPC 落盘到 perf-probe.log，便于离线分析
ipcMain.handle('perf-probe', (_event, payload: any) => {
  try {
    const line = `[${new Date().toISOString()}] ${JSON.stringify(payload)}\n`
    appendFileSync(join(dataDir, 'perf-probe.log'), line)
  } catch {}
  return true
})

ipcMain.handle('save-config', (_event, config: any) => {
  // merge 而非整份覆写，避免渲染层多个并发 saveConfig 互相丢字段（如 welcomeSeen 被后续 lastOpenedFolder 写入覆盖）
  const merged = (() => {
    try {
      if (!existsSync(configPath)) return { ...config }
      const cur = JSON.parse(readFileSync(configPath, 'utf-8'))
      return { ...cur, ...config }
    } catch { return { ...config } }
  })()
  writeFileSync(configPath, JSON.stringify(merged, null, 2))
  if (config.locale) currentLocale = config.locale
  return true
})

// 格式筛选：渲染层更新勾选列表 → 立即生效并持久化到 config
ipcMain.handle('set-format-filter', (_event, exts: unknown) => {
  const list = Array.isArray(exts) ? exts.filter((e): e is string => typeof e === 'string') : null
  setFormatFilter(list)
  try {
    const cur = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf-8')) : {}
    cur.formatFilter = list
    writeFileSync(configPath, JSON.stringify(cur, null, 2))
  } catch {}
  return true
})

// 切文件夹/切筛选/切排序等切换节点：终止 PSD worker + 清 sharp 缓存 + 主动 GC。
// 渲染层已清 <img src> 和 preloadCache，GPU 纹理由 Chromium 在引用释放后异步回收。
// 注意：不调用 session.clearStorageData/clearCache--它们清的是 Service Worker CacheStorage
// 和 HTTP 缓存，非 GPU 纹理；且在 picrand:// 流式加载中调用会中断请求导致崩溃。
// 此处只回收主进程 native 内存（PSD worker、sharp LRU、external Buffer）。
ipcMain.handle('clear-image-cache', async () => {
  _terminatePsdPoolNow()
  await _clearSharpCache()
  _scheduleGC()
  return true
})
async function prefetchDimensions(sharp: any, paths: string[]) {
  const BATCH = 50
  let done = 0
  console.log('[prefetch] starting %d images in background', paths.length)
  for (let i = 0; i < paths.length; i += BATCH) {
    await new Promise(resolve => setImmediate(resolve))
    const batch = paths.slice(i, i + BATCH)
    for (const p of batch) {
      try {
        const m = await sharp(p).metadata()
        updateImageDimensions(p, m.width || 0, m.height || 0)
        done++
      } catch {}
    }
    if (i % 500 === 0 && i > 0) console.log('[prefetch] progress %d/%d', done, paths.length)
  }
  console.log('[prefetch] done, %d dimensions cached', done)
}

// 后台异步全量生成缩略图
async function prefetchThumbnails(paths: string[], dataDir: string) {
  const sharp = (await import('sharp')).default
  const fse = await import('fs-extra')
  const fsp = await import('fs')
  const crypt = await import('crypto')
  const { nativeImage } = await import('electron')
  const cacheDir = join(dataDir, 'cache')
  fsp.mkdirSync(cacheDir, { recursive: true })

  let done = 0
  console.log('[prefetch] thumbnails starting %d images', paths.length)
  for (let i = 0; i < paths.length; i++) {
    await new Promise(resolve => setImmediate(resolve))
    const p = paths[i]
    try {
      const ext = extname(p).toLowerCase()
      const hashName = crypt.createHash('md5').update(p).digest('hex') + ext
      const outputPath = join(cacheDir, hashName)
      if (await fse.pathExists(outputPath)) { done++; continue }

      if (ext === '.gif') {
        const gifPath = outputPath.replace(/\.gif$/i, '.gif')
        if (!(await fse.pathExists(gifPath))) {
          try { await sharp(p, { animated: true }).resize({ width: 400, withoutEnlargement: true }).gif({ colours: 48, dither: 1.0 }).toFile(gifPath); updateThumbnailPath(p, gifPath) } catch {}
        }
      } else {
        const webpPath = outputPath.replace(ext, '.webp')
        if (!(await fse.pathExists(webpPath))) {
          try {
            await sharp(p).toColourspace('srgb').resize({ width: 400, withoutEnlargement: true }).webp({ quality: 75 }).toFile(webpPath)
            updateThumbnailPath(p, webpPath)
          } catch {
            try {
              const img = nativeImage.createFromPath(p)
              if (!img.isEmpty()) { const resized = img.resize({ width: 400 }); fsp.writeFileSync(webpPath, resized.toPNG()); updateThumbnailPath(p, webpPath) }
            } catch {}
          }
        }
      }
      done++
    } catch {}
    if (i > 0 && i % 200 === 0) console.log('[prefetch] thumbnails %d/%d', done, paths.length)
  }
  console.log('[prefetch] thumbnails done, %d cached', done)
}

// ====== 风格漫游：特征提取（HSV 64 + LBP 64 + 边缘 32 = 160 维） ======
function extractFeatures(rgba: Uint8Array, w: number, h: number): Float32Array {
  const feat = new Float32Array(160)
  const hBins = 32, sBins = 16, vBins = 16, totalHsv = hBins + sBins + vBins
  let i = 0
  // HSV histogram: 32+16+16 = 64 bins
  for (let y = 0; y < h; y += 4) {
    for (let x = 0; x < w; x += 4) {
      const idx = (y * w + x) * 3
      const r = rgba[idx] / 255, g = rgba[idx + 1] / 255, b = rgba[idx + 2] / 255
      const cmax = Math.max(r, g, b), cmin = Math.min(r, g, b), delta = cmax - cmin
      let hh = 0, s = 0
      if (delta > 0.001) {
        if (cmax === r) hh = ((g - b) / delta) % 6
        else if (cmax === g) hh = (b - r) / delta + 2
        else hh = (r - g) / delta + 4
        hh = (hh < 0 ? hh + 6 : hh) / 6
        s = delta / cmax
      }
      feat[Math.floor(hh * hBins)]++
      feat[hBins + Math.floor(s * sBins)]++
      feat[hBins + sBins + Math.floor(cmax * vBins)]++
      i++
    }
  }
  // LBP 64 bins
  const neighbors = [[-1,-1],[-1,0],[-1,1],[0,1],[1,1],[1,0],[1,-1],[0,-1]]
  for (let y = 1; y < h - 1; y += 3) {
    for (let x = 1; x < w - 1; x += 3) {
      const ci = (y * w + x) * 3, cv = rgba[ci] + rgba[ci + 1] + rgba[ci + 2]
      let pat = 0
      for (let n = 0; n < 8; n++) {
        const nx = x + neighbors[n][0], ny = y + neighbors[n][1]
        const ni = (ny * w + nx) * 3, nv = rgba[ni] + rgba[ni + 1] + rgba[ni + 2]
        if (nv > cv) pat |= (1 << n)
      }
      feat[totalHsv + (pat % 64)]++
    }
  }
  // Edge direction: 32 bins (Sobel)
  const edgeOff = totalHsv + 64
  for (let y = 1; y < h - 1; y += 3) {
    for (let x = 1; x < w - 1; x += 3) {
      const gx = rgba[((y * w + x + 1) * 3 + 1)] - rgba[((y * w + x - 1) * 3 + 1)]
      const gy = rgba[(((y + 1) * w + x) * 3 + 1)] - rgba[(((y - 1) * w + x) * 3 + 1)]
      const angle = (Math.atan2(gy, gx) + Math.PI) / (Math.PI * 2)
      feat[edgeOff + Math.floor(angle * 32)]++
    }
  }
  // Normalize all bins
  for (let j = 0; j < 160; j++) {
    const sum = feat[j]
    feat[j] = sum > 0 ? sum / (i || 1) : 0
  }
  return feat
}

// 风格分析用的源图：优先用已缓存的 400px 缩略图，免去整张原图解码（实测快约 14 倍）。
// GIF 缩略图是 48 色压缩版，色彩直方图会明显失真，仍回退原图。
function analysisSource(filePath: string, thumbnailPath?: string | null): string {
  if (!thumbnailPath) return filePath
  if (extname(filePath).toLowerCase() === '.gif') return filePath
  const p = resolveStoredPath(thumbnailPath)
  return existsSync(p) ? p : filePath
}

// 解码到 128×128 原始像素。优先走缩略图；缩略图损坏时回退原图，保证与旧行为一致。
async function readAnalysisPixels(sharp: any, filePath: string, thumbnailPath?: string | null) {
  const src = analysisSource(filePath, thumbnailPath)
  try {
    const { data, info } = await sharp(src).resize(128, 128, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    return { data, width: info.width, height: info.height }
  } catch (err) {
    if (src === filePath) throw err
    const resolved = await resolveForSharp(filePath)
    const { data, info } = await sharp(resolved).resize(128, 128, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    return { data, width: info.width, height: info.height }
  }
}

async function prefetchFeatures(sharp: any, paths: string[], thumbs?: Map<string, string>) {
  const BATCH = 20
  let done = 0
  console.log('[prefetch] features starting %d images', paths.length)
  for (let i = 0; i < paths.length; i += BATCH) {
    await new Promise(resolve => setImmediate(resolve))
    const pending: { filePath: string; features: Float32Array }[] = []
    for (const p of paths.slice(i, i + BATCH)) {
      try {
        const { data, width, height } = await readAnalysisPixels(sharp, p, thumbs?.get(p))
        pending.push({ filePath: p, features: extractFeatures(data, width, height) })
        done++
      } catch {}
    }
    if (pending.length) updateFeaturesBatch(pending)
    if (i % 500 === 0 && i > 0) console.log('[prefetch] features %d/%d', done, paths.length)
  }
  console.log('[prefetch] features done, %d cached', done)
}

ipcMain.handle('compute-feature', async (_event, filePath: string) => {
  try {
    const sharp = (await import('sharp')).default
    const { data, width, height } = await readAnalysisPixels(sharp, filePath, getThumbnailPaths([filePath]).get(filePath))
    return Array.from(extractFeatures(data, width, height))
  } catch { return null }
})

// 批量计算特征（优先查 DB 缓存，仅对缺失的调用 sharp）
ipcMain.handle('compute-features-batch', async (_event, paths: string[]) => {
  try {
    const results: { file_path: string; features: number[] | null }[] = []

    // 1. 批量查 DB 已有缓存
    const placeholders = paths.map(() => '?').join(',')
    const cachedRows = getDb().prepare(
      `SELECT file_path, features FROM images WHERE file_path IN (${placeholders}) AND features IS NOT NULL`
    ).all(...paths) as { file_path: string; features: Buffer }[]
    const cached = new Map<string, number[]>()
    for (const row of cachedRows) {
      const arr = new Float32Array(row.features.buffer, row.features.byteOffset, row.features.byteLength / 4)
      cached.set(row.file_path, Array.from(arr))
    }

    // 已缓存的直接返回
    for (const p of paths) {
      if (cached.has(p)) results.push({ file_path: p, features: cached.get(p)! })
    }

    // 2. 仅对缺失的调用 sharp 计算（优先解码缩略图，24 路并发）
    const missing = paths.filter(p => !cached.has(p))
    if (missing.length > 0) {
      const sharp = (await import('sharp')).default
      const thumbs = getThumbnailPaths(missing)
      const lim = 24 // concurrency limit：线程池 12 线程，排 24 个任务可隐藏解码抖动
      const pending: { filePath: string; features: Float32Array }[] = []
      for (let i = 0; i < missing.length; i += lim) {
        const batch = missing.slice(i, i + lim)
        const feats = await Promise.all(batch.map(async (p) => {
          try {
            const { data, width, height } = await readAnalysisPixels(sharp, p, thumbs.get(p))
            const feat = extractFeatures(data, width, height)
            pending.push({ filePath: p, features: feat })
            return { file_path: p, features: Array.from(feat) }
          } catch { return { file_path: p, features: null } }
        }))
        results.push(...feats)
      }
      // 单事务写回 DB 缓存
      if (pending.length) updateFeaturesBatch(pending)
    }

    return results
  } catch { return [] }
})

// 按路径批量取 CLIP 512 维向量（风格漫游多模态模式用）。
// 与 compute-features-batch 形态对称：{file_path, features: number[]|null}[]
ipcMain.handle('get-clip-features-by-paths', async (_event, paths: string[]) => {
  try {
    if (!paths.length) return []
    const rows = getClipFeaturesByPaths(paths)
    return rows.map(r => ({
      file_path: r.file_path,
      features: r.clip_feat ? Array.from(new Float32Array(r.clip_feat.buffer, r.clip_feat.byteOffset, r.clip_feat.byteLength / 4)) : null
    }))
  } catch { return [] }
})

ipcMain.handle('prefetch-features', async (_event, folderId: number) => {
  const paths = getFeaturesByFolder(folderId).filter(r => !r.features).map(r => r.file_path)
  if (!paths.length) return
  try {
    const sharp = (await import('sharp')).default
    await prefetchFeatures(sharp, paths, getThumbnailPaths(paths))
  } catch {}
})

// 风格漫游：获取全部图片的特征向量
ipcMain.handle('get-all-features', () => {
  return getAllFeatures().map(r => ({
    file_path: r.file_path,
    features: r.features ? Array.from(new Float32Array(r.features.buffer, r.features.byteOffset, r.features.byteLength / 4)) : null
  }))
})

// ===== AI 语义搜索（CLIP）=====
// 单张直接算 CLIP 512 维向量并返回，不写 DB（外部种子图不在 images 表，写不进去）。
ipcMain.handle('compute-clip-feature', async (_event, filePath: string) => {
  try {
    const { computeImageVec } = await import('./clip-search')
    const resolved = await resolveForSharp(filePath)
    const vec = await computeImageVec(resolved)
    return Array.from(vec)
  } catch { return null }
})

ipcMain.handle('compute-clip-batch', async (_event, paths: string[]) => {
  try {
    const { computeImageVec } = await import('./clip-search')
    const placeholder = paths.map(() => '?').join(',')
    const cachedRows = getDb().prepare(
      `SELECT file_path, clip_feat FROM images WHERE file_path IN (${placeholder}) AND clip_feat IS NOT NULL`
    ).all(...paths) as { file_path: string; clip_feat: Buffer }[]
    const cached = new Set(cachedRows.map(r => r.file_path))
    const missing = paths.filter(p => !cached.has(p))
    if (missing.length > 0) {
      const lim = 4 // CLIP 推理较重，降到 4 并发
      for (let i = 0; i < missing.length; i += lim) {
        const batch = missing.slice(i, i + lim)
        await Promise.all(batch.map(async (p) => {
          try {
            const resolved = await resolveForSharp(p)
            const vec = await computeImageVec(resolved)
            updateClipFeature(p, vec)
          } catch { /* 单图失败不阻断批 */ }
        }))
      }
    }
    return { ok: true, missing: missing.length, cached: cached.size }
  } catch (err) { console.error('[clip-batch] error:', err); return { ok: false, error: String(err) } }
})

ipcMain.handle('build-clip-index', async (_event, folderId: number, force?: boolean) => {
  let firstError = ''
  try {
    if (force) { try { getDb().prepare(`UPDATE images SET clip_feat = NULL WHERE folder_id = ?`).run(folderId) } catch {} }
    const rows = getClipFeaturesByFolder(folderId)
    const missing = rows.filter(r => !r.clip_feat).map(r => r.file_path)
    const total = missing.length
    const sendP = (d: number, t: number) => { try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('clip-index-progress', { done: d, total: t }) } catch {} }
    if (total === 0) { sendP(0, 0); return { ok: true, total: 0, done: 0 } }
    // 先发初始进度：total 已知，done=0，让 UI 立即显示 "0/N" 而非 "0/0"
    sendP(0, total)
    // 立即 await 微任务确保 IPC 到达渲染层
    await new Promise(r => setImmediate(r))
    // 再动态 import clip-search（首次会触发 init() 加载 ONNX + tokenizer，2-5s）
    const { computeImageVec } = await import('./clip-search')
    let done = 0
    const CONCUR = Math.max(4, Math.min(8, (await import('os')).cpus().length * 2))
    for (let i = 0; i < missing.length; i += CONCUR) {
      const batch = missing.slice(i, i + CONCUR)
      const results = await Promise.all(batch.map(async (p) => {
        try {
          const resolved = await resolveForSharp(p)
          const vec = await computeImageVec(resolved)
          return { filePath: p, vec }
        } catch (e: any) {
          return { filePath: p, vec: null, error: String(e?.message || e) }
        }
      }))
      let batchErr = false
      for (const r of results) {
        done++
        if (r.vec) { updateClipFeature(r.filePath, r.vec) }
        else { if (!firstError) { firstError = r.error || 'unknown'; batchErr = true } }
      }
      sendP(done, total)
      if (!batchErr) await new Promise(r => setImmediate(r))
    }
    sendP(total, total)
    const allOk = (done === total && !firstError)
    return allOk ? { ok: true, total, done } : { ok: false, total, done, error: firstError }
  } catch (err: any) {
    const msg = String(err?.message || err)
    console.error('[build-clip-index]', msg)
    return { ok: false, total: 0, done: 0, error: msg }
  }
})

ipcMain.handle('search-by-text', async (_event, query: string, scope?: { folderId?: number; folderIds?: number[] }, topN?: number) => {
  try {
    const { searchByText } = await import('./clip-search')
    let rows: Array<{ file_path: string; clip_feat: Buffer | null }> = []
    if (scope?.folderIds && scope.folderIds.length > 0) rows = getRootClipFeatures(scope.folderIds)
    else if (scope?.folderId) rows = getClipFeaturesByFolder(scope.folderId)
    else rows = getAllClipFeatures()
    rows = rows.filter(r => isFormatAllowed(r.file_path))  // 格式筛选：搜索前排除已禁用格式
    const results = await searchByText(query, rows, topN ?? 500)
    return results
  } catch (err) {
    console.error('[search-by-text] error:', err)
    return { error: String((err as any)?.message || err) }
  }
})

ipcMain.handle('clip-index-status', async (_event, folderId: number) => {
  try { return countClipFeaturesByFolder(folderId) } catch { return { total: 0, indexed: 0 } }
})

ipcMain.handle('build-clip-index-multi', async (_event, folderIds: number[], force?: boolean) => {
  let firstError = ''
  try {
    const ids = Array.isArray(folderIds) ? folderIds.filter((x: number) => x > 0) : []
    if (!ids.length) return { ok: false, total: 0, done: 0, error: 'no folders' }
    if (force) {
      try {
        const placeholders = ids.map(() => '?').join(',')
        getDb().prepare(`UPDATE images SET clip_feat = NULL WHERE folder_id IN (${placeholders})`).run(...ids)
      } catch {}
    }
    const rows = getRootClipFeatures(ids)
    const missing = rows.filter(r => !r.clip_feat).map(r => r.file_path)
    const total = missing.length
    const sendP = (d: number, t: number) => { try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('clip-index-progress', { done: d, total: t }) } catch {} }
    if (total === 0) { sendP(0, 0); return { ok: true, total: 0, done: 0 } }
    sendP(0, total)
    await new Promise(r => setImmediate(r))
    const { computeImageVec } = await import('./clip-search')
    let done = 0
    const CONCUR = Math.max(4, Math.min(8, (await import('os')).cpus().length * 2))
    for (let i = 0; i < missing.length; i += CONCUR) {
      const batch = missing.slice(i, i + CONCUR)
      const results = await Promise.all(batch.map(async (p) => {
        try { const resolved = await resolveForSharp(p); return { filePath: p, vec: await computeImageVec(resolved) } }
        catch (e: any) { return { filePath: p, vec: null, error: String(e?.message || e) } }
      }))
      let batchErr = false
      for (const r of results) {
        done++
        if (r.vec) updateClipFeature(r.filePath, r.vec)
        else if (!firstError) { firstError = r.error || 'unknown'; batchErr = true }
      }
      sendP(done, total)
      if (!batchErr) await new Promise(r => setImmediate(r))
    }
    sendP(total, total)
    const allOk = (done === total && !firstError)
    return allOk ? { ok: true, total, done } : { ok: false, total, done, error: firstError }
  } catch (err: any) {
    const msg = String(err?.message || err)
    console.error('[build-clip-index-multi]', msg)
    return { ok: false, total: 0, done: 0, error: msg }
  }
})

ipcMain.handle('clip-index-status-multi', async (_event, folderIds: number[]) => {
  try { return countClipFeaturesByFolders(Array.isArray(folderIds) ? folderIds : []) }
  catch { return { total: 0, indexed: 0 } }
})

// ====== 色彩索引（色相/饱和度/明度均值，批量计算并持久化） ======
async function _computeColorInfo(filePath: string): Promise<object | null> {
  try {
    const sharp = (await import('sharp')).default
    const resolved = await resolveForSharp(filePath)
    // 强制降到 8-bit sRGB 3 通道，避免 16-bit 图 .raw() 输出每通道 2 字节导致 v 计算 >1 / 错位
    const { data, info } = await sharp(resolved)
      .removeAlpha()
      .resize(128, 128, { fit: 'inside' })
      .toColorspace('srgb')
      .raw({ depth: 'uchar' } as any)
      .toBuffer({ resolveWithObject: true })
    const { width, height } = info
    const count = width * height
    if (!count) return null

    let hueSum = 0, satSum = 0, valSum = 0
    for (let i = 0; i < data.length; i += 3) {
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const max = Math.max(r, g, b), min = Math.min(r, g, b)
      const val = max / 255
      const sat = max === 0 ? 0 : (max - min) / max
      let hue = 0
      if (max !== min) {
        if (max === r) hue = ((g - b) / (max - min) + 6) % 6
        else if (max === g) hue = (b - r) / (max - min) + 2
        else hue = (r - g) / (max - min) + 4
        hue *= 60
      }
      hueSum += hue; satSum += sat; valSum += val
    }

    return {
      h: Math.round(hueSum / count * 10) / 10,
      s: Math.round(satSum / count * 100) / 100,
      v: Math.round(valSum / count * 100) / 100,
    }
  } catch { return null }
}

ipcMain.handle('build-color-index', async (_event, folderId: number, force?: boolean) => {
  let firstError = ''
  try {
    const rows = getColorInfoByFolder(folderId)
    const missing = (force ? rows : rows.filter(r => !r.color_info)).map(r => r.file_path)
    if (force) { try { getDb().prepare(`UPDATE images SET color_info = NULL WHERE folder_id = ?`).run(folderId) } catch {} }
    const total = missing.length
    const sendP = (d: number, t: number) => { try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('color-index-progress', { done: d, total: t }) } catch {} }
    if (total === 0) { sendP(0, 0); return { ok: true, total: 0, done: 0 } }
    sendP(0, total)
    let done = 0
    for (const fp of missing) {
      const info = await _computeColorInfo(fp)
      done++
      if (info) { updateColorInfo(fp, info) }
      else { if (!firstError) firstError = `failed: ${fp.slice(-40)}` }
      if (done % 10 === 0) sendP(done, total)
    }
    sendP(total, total)
    const allOk = (done === total && !firstError)
    return allOk ? { ok: true, total, done } : { ok: false, total, done, error: firstError }
  } catch (err: any) {
    console.error('[build-color-index]', err)
    return { ok: false, total: 0, done: 0, error: String(err?.message || err) }
  }
})

ipcMain.handle('build-color-index-multi', async (_event, folderIds: number[]) => {
  let firstError = ''
  try {
    const ids = Array.isArray(folderIds) ? folderIds.filter((x: number) => x > 0) : []
    if (!ids.length) return { ok: false, total: 0, done: 0, error: 'no folders' }
    const allRows: { file_path: string; color_info: string | null }[] = []
    for (const id of ids) allRows.push(...getColorInfoByFolder(id))
    const missing = allRows.filter(r => !r.color_info).map(r => r.file_path)
    const total = missing.length
    const sendP = (d: number, t: number) => { try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('color-index-progress', { done: d, total: t }) } catch {} }
    if (total === 0) { sendP(0, 0); return { ok: true, total: 0, done: 0 } }
    sendP(0, total)
    let done = 0
    for (const fp of missing) {
      const info = await _computeColorInfo(fp)
      done++
      if (info) { updateColorInfo(fp, info) }
      else { if (!firstError) firstError = `failed: ${fp.slice(-40)}` }
      if (done % 10 === 0) sendP(done, total)
    }
    sendP(total, total)
    const allOk = (done === total && !firstError)
    return allOk ? { ok: true, total, done } : { ok: false, total, done, error: firstError }
  } catch (err: any) {
    return { ok: false, total: 0, done: 0, error: String(err?.message || err) }
  }
})

ipcMain.handle('color-index-status', async (_event, folderId: number) => {
  try { return countColorInfoByFolder(folderId) } catch { return { total: 0, indexed: 0 } }
})

ipcMain.handle('color-index-status-multi', async (_event, folderIds: number[]) => {
  try { return countColorInfoByFolders(Array.isArray(folderIds) ? folderIds : []) } catch { return { total: 0, indexed: 0 } }
})

ipcMain.handle('get-color-info-by-paths', async (_event, paths: string[]) => {
  try { return getColorInfoByPaths(Array.isArray(paths) ? paths : []) } catch { return [] }
})

const OVERSIZE_LIMIT = 50000
const OVERSIZE_TIMEOUT_MS = 8000
let _ovWorkerPath = ''
async function _ensureOversizeWorkerPath(): Promise<string> {
  if (_ovWorkerPath) try { if (require('fs').existsSync(_ovWorkerPath)) return _ovWorkerPath } catch {}
  const pth = await import('path'); const os = await import('os')
  const content = `const { parentPort, workerData } = require('worker_threads')\n` +
    `const fs = require('fs')\n` +
    `const path = require('path')\n` +
    `const exts = new Set(['.jpg','.jpeg','.png','.gif','.bmp','.webp','.tiff','.tif','.avif','.svg','.psd','.heic','.heif','.mp4','.webm','.mov','.mkv','.avi','.flv','.f4v'])\n` +
    `let count = 0\n` +
    `const stack = [workerData.dir]\n` +
    `while (stack.length) {\n` +
    `  const cur = stack.pop()\n` +
    `  let entries\n` +
    `  try { entries = fs.readdirSync(cur, { withFileTypes: true }) } catch { continue }\n` +
    `  for (const entry of entries) {\n` +
    `    if (entry.isDirectory()) { stack.push(path.join(cur, entry.name)); continue }\n` +
    `    if (entry.isFile() && exts.has(path.extname(entry.name).toLowerCase())) { count++; if (count >= workerData.limit) { parentPort.postMessage(true); return } }\n` +
    `  }\n` +
    `}\n` +
    `parentPort.postMessage(false)\n`
  const candidates = [
    pth.join(__dirname, 'oversize-worker.cjs'),
    pth.join(os.tmpdir(), 'picrand-oversize-worker.cjs')
  ]
  for (const c of candidates) {
    try { const _fsw = require('fs'); _fsw.writeFileSync(c, content); _ovWorkerPath = c; return c } catch {}
  }
  return _ovWorkerPath
}

async function checkFolderOversize(dir: string): Promise<boolean> {
  const { Worker } = await import('worker_threads')
  let workerPath = await _ensureOversizeWorkerPath()
  if (!workerPath || !require('fs').existsSync(workerPath)) { try { workerPath = await _ensureOversizeWorkerPath() } catch {} }
  if (!workerPath || !require('fs').existsSync(workerPath)) { return false }
  return new Promise<boolean>((resolve) => {
    let done = false
    const finish = (v: boolean, tag: string) => { if (done) return; done = true; try { worker.terminate() } catch {}; clearTimeout(timer); resolve(v) }
    const worker = new Worker(workerPath, { workerData: { dir, limit: OVERSIZE_LIMIT } })
    const timer = setTimeout(() => finish(true, 'timeout'), OVERSIZE_TIMEOUT_MS)
    worker.once('message', (limited: boolean) => finish(!!limited, 'message'))
    worker.once('error', (e: Error) => { finish(true, 'error') })
  })
}
// Returns true = join, false = cancel
let _oversizeResolver: ((v: boolean) => void) | null = null
async function confirmOversizeDialog(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    _oversizeResolver = resolve
    try { mainWindow?.webContents.send('confirm-oversize') } catch { resolve(false) }
  })
}
ipcMain.on('confirm-oversize-response', (_event, confirmed: boolean) => {
  if (_oversizeResolver) { _oversizeResolver(confirmed); _oversizeResolver = null }
})

let _scanWorkerPath = ''
async function _ensureScanWorkerPath(): Promise<string> {
  if (_scanWorkerPath && require('fs').existsSync(_scanWorkerPath)) return _scanWorkerPath
  const pth = await import('path'); const os = await import('os')
  const content = `const fs = require('fs')\nconst path = require('path')\nconst { parentPort, workerData } = require('worker_threads')\nconst exts = new Set(['.jpg','.jpeg','.png','.gif','.bmp','.webp','.tiff','.tif','.avif','.svg','.psd','.heic','.heif','.mp4','.webm','.mov','.mkv','.avi','.flv','.f4v'])\nconst result = []\nfunction walk(dir) {\n  let items\n  try { items = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }\n  for (const entry of items) {\n    if (entry.isDirectory()) { walk(path.join(dir, entry.name)); continue }\n    if (entry.isFile() && exts.has(path.extname(entry.name).toLowerCase())) {\n      let s\n      try { s = fs.statSync(path.join(dir, entry.name)) } catch { continue }\n      result.push({ path: path.join(dir, entry.name), size: s.size, mtimeMs: s.mtimeMs })\n    }\n  }\n}\nwalk(workerData.dir)\nparentPort.postMessage(result)\n`
  const candidates = [pth.join(__dirname, 'scan-worker.cjs'), pth.join(os.tmpdir(), 'picrand-scan-worker.cjs')]
  for (const c of candidates) { try { const _fsw = require('fs'); _fsw.writeFileSync(c, content); _scanWorkerPath = c; return c } catch {} }
  return _scanWorkerPath
}
async function _scanFolderWorker(dir: string, opts?: { onWorker?: (w: any) => void }): Promise<{ path: string; size: number; mtimeMs: number }[] | null> {
  try {
    const { Worker } = await import('worker_threads')
    const wp = await _ensureScanWorkerPath()
    if (!wp || !require('fs').existsSync(wp)) return null
    return new Promise((resolve) => {
      let done = false
      const finish = (v: any) => { if (done) return; done = true; try { worker.terminate() } catch {}; clearTimeout(timer); resolve(v) }
      const worker = new Worker(wp, { workerData: { dir } })
      if (opts?.onWorker) opts.onWorker(worker)
      const timer = setTimeout(() => finish(null), 120000)
      worker.once('message', (r: any) => finish(r))
      worker.once('error', () => finish(null))
      worker.once('exit', () => finish(null))  // 外部 terminate() 杀 worker 时不触发 message/error，靠 exit 兜底
    })
  } catch { return null }
}

ipcMain.handle('scan-folder', async (_event, folderPath: string, sortMode?: string, forceShuffle?: boolean, hueOrigin?: number) => {
  // 中断上一个扫描：递增世代 → 终止旧 Worker → kill 旧 scan 视频海报在途 ffmpeg → 后续每步检查世代
  _scanGen++
  const myGen = _scanGen
  _killScanVpFfmpegs()  // 切文件夹时杀掉上一个 scan 队列正在跑的抽帧，避免残留烧 CPU + tmp PNG 堆积
  _logChildProbes(`scan-enter folder=${folderPath.slice(-40)}`)
  if (_activeScanWorker) {
    try { _activeScanWorker.terminate() } catch {}
    _activeScanWorker = null
  }
  const _stale = (): boolean => _scanGen !== myGen
  let _sharp: any

  try {
    	const _tTotal = Date.now()
	const scanResult = (await _scanFolderWorker(folderPath, { onWorker: (w: any) => { _activeScanWorker = w } })) || []
    _activeScanWorker = null
    if (_stale()) { console.log('[scan] aborted after walk:', folderPath.slice(0, 80)); return { error: true, message: 'Scan superseded' } }
    const entries: { path: string; stats: any }[] = scanResult
    console.log('[scan] found %d images in %s', entries.length, folderPath)
    const folderId = getOrCreateFolder(folderPath)

    // 全量数据组装
    const allImages = entries.map((e: any, i: number) => ({
      file_path: e.path,
      file_name: basename(e.path),
      file_size: e.size || 0,
      modify_time: e.mtimeMs ? Math.floor(e.mtimeMs / 1000) : 0,
      sort_order: i,
    }))

    console.log('[scan] found %d images in %s, folderId=%d', allImages.length, folderPath, folderId)
    if (_stale()) { console.log('[scan] aborted before db ops:', folderPath.slice(0, 80)); return { error: true, message: 'Scan superseded' } }

		const _tSaveAll = Date.now()
	// 增量同步：不再全删全插。查 DB 现有 file_path -> diff 出 added/removed ->
	// 只 INSERT 新文件、DELETE 已消失文件，kept 行（交集）零操作，clip_feat/color_info/features
	// 等 BLOB 物理保留在原行，彻底消除"DELETE 同步 + 异步恢复可中断"导致的索引丢失。
	// 同时省掉抢救查询、crossdel 全表扫（1.3s 固定税）、_bgRestore 整段。
	const scannedPaths = new Set(allImages.map((img: any) => img.file_path))
	const dbRows = getDb().prepare("SELECT file_path FROM images WHERE folder_id = ?").all(folderId) as { file_path: string }[]
	const dbPathSet = new Set(dbRows.map((r: any) => r.file_path))

	// added：扫描到但 DB 没有（新文件）。其中可能含从其他文件夹移动/复制来的路径（file_path 全表 UNIQUE），
	// 需先删旧 folder_id 的关联，否则 INSERT OR IGNORE 会被 UNIQUE 冲突忽略，行仍属旧 folder_id。
	const added: any[] = []
	const movedFromOther: string[] = []
	for (const img of allImages) {
		if (!dbPathSet.has(img.file_path)) {
			added.push(img)
			const existRow = getDb().prepare("SELECT folder_id FROM images WHERE file_path = ?").get(img.file_path) as any
			if (existRow && existRow.folder_id !== folderId) movedFromOther.push(img.file_path)
		}
	}
	// removed：DB 有但扫描没找到（文件已删除/移走）
	const removed: string[] = []
	for (const dp of dbPathSet) {
		if (!scannedPaths.has(dp)) removed.push(dp)
	}

	if (_stale()) { console.log("[scan] aborted during diff:", folderPath.slice(0, 80)); return { error: true, message: "Scan superseded" } }

	// cross-folder 归属迁移：同一路径出现在另一个文件夹时只改 folder_id。
	// 不能 DELETE 后重插——那会连带清掉 is_favorite/favorited_at/评分/描述/features/clip_feat/thumbnail_path。
	if (movedFromOther.length > 0) {
		const moveStmt = getDb().prepare("UPDATE images SET folder_id = ? WHERE file_path = ?")
		getDb().transaction(() => {
			for (const fp of movedFromOther) { try { moveStmt.run(folderId, fp) } catch {} }
		})()
	}
	// 批量写入新增文件（INSERT OR IGNORE，新行 BLOB 列 NULL，新文件本就无索引）
	if (added.length > 0) {
		try { insertImagesBatch(folderId, added); console.log("[scan] insertImagesBatch done, added=%d", added.length) } catch (e) { console.error("[scan] insertImagesBatch failed:", e) }
	}
	// 删除已消失文件（连索引一起删，合理：文件不存在了）
	if (removed.length > 0) {
		const delStmt = getDb().prepare("DELETE FROM images WHERE file_path = ?")
		const COOP_YIELD = 200
		let _delIdx = 0
		while (_delIdx < removed.length) {
			const end = Math.min(_delIdx + COOP_YIELD, removed.length)
			for (let i = _delIdx; i < end; i++) { try { delStmt.run(removed[i]) } catch {} }
			_delIdx = end
			if (_stale()) { console.log("[scan] aborted during removed cleanup:", folderPath.slice(0, 80)); return { error: true, message: "Scan superseded" } }
			await new Promise<void>(r => setImmediate(r))
		}
	}
	// kept 行（交集）零操作：is_favorite/favorited_at/width/height/rating/description/
	// features/clip_feat/color_info 全部保留在原行，无需恢复。
	const _tSaveAllMs = Date.now() - _tSaveAll
	const _tSyncRestoreMs = 0

    
    // 快速读取前300张尺寸（首屏足够），剩余后台异步补读
    // 每 20 张检查一次世代，切换文件夹后快速中止
    if (_stale()) { console.log('[scan] aborted before dim read:', folderPath.slice(0, 80)); return { error: true, message: 'Scan superseded' } }
    const DIM_FIRST_BATCH = 300
    try {
      const firstBatch = allImages.slice(0, DIM_FIRST_BATCH)
      // 增量模式下 kept 行尺寸已在 DB，只对 added（新文件，DB 里 width=0）读尺寸
      const addedPathSet = new Set(added.map((a: any) => a.file_path))
      // #1 并发池读尺寸（8 并发），保留每 20 张的世代检查
      _sharp = (await import('sharp')).default
      let _dimCheck = 0
      let cursor = 0
      const _runOne = async (img: any) => {
        if (_stale()) return
        try { const d = await readImageDimensions(img.file_path, _sharp); if (d) updateImageDimensions(img.file_path, d.width, d.height) } catch {}
      }
      const CONCURRENCY = 3
      const workers: Promise<void>[] = []
      for (let w = 0; w < CONCURRENCY; w++) {
        workers.push((async () => {
          while (true) {
            const myIdx = cursor++
            if (myIdx >= firstBatch.length) break
            if (++_dimCheck % 20 === 0 && _stale()) { console.log('[scan] aborted during dim read:', folderPath.slice(0, 80)); return }
            if (!addedPathSet.has(firstBatch[myIdx].file_path)) continue  // kept 行尺寸已在 DB，跳过
            await _runOne(firstBatch[myIdx])
          }
        })())
      }
      await Promise.all(workers)
      if (_stale()) { console.log('[scan] aborted during dim read:', folderPath.slice(0, 80)); return { error: true, message: 'Scan superseded' } }
      const remaining = allImages.slice(DIM_FIRST_BATCH)
      // 后台异步补读剩余尺寸（也检查世代，切换后提前退出）
      // addedPathSet 过滤与首屏 300 张一致：kept 行尺寸已在 DB，只读本次新增（width=0）的行，
      // 否则每次打开文件夹都全量重读几万张文件头 + 重写几万次 DB（纯空转，白占 CPU/磁盘/内存）
      if (remaining.length > 0) {
        const bgGen = myGen
        const bgPromise = (async () => {
          let _bgCheck = 0
          for (const img of remaining) {
            if (++_bgCheck % 10 === 0 && _scanGen !== bgGen) return
            if (!addedPathSet.has(img.file_path)) continue
            try { const d = await readImageDimensions(img.file_path); if (d) updateImageDimensions(img.file_path, d.width, d.height) } catch {}
          }
        })()
        pendingDimReads.set(folderId, bgPromise)
        bgPromise.then(() => pendingDimReads.delete(folderId))
      }
    } catch {}

    // 尺寸排序模式：分页直接走 SQL ORDER BY width*height，不读 sort_order，
    // 首屏 300 张尺寸已在前面同步读好，无需等后台补读完整文件夹全部尺寸。
    // 跳过 await Promise.all + recomputeSortOrder，否则大文件夹要等数秒~十几秒才返回。
    const finalSortMode = sortMode || 'random'
    const _isDimSort = finalSortMode === 'dim-asc' || finalSortMode === 'dim-desc'

		// scan-folder 删旧记录重新插入，旧 _randomBackup 中的 id 已失效；revisit 时不强制洗牌
		// 增量同步：kept 行保留原有 sort_order，added 行初始 sort_order 为索引号（与 allImages 遍历顺序一致）。
		// 只有排序模式变更或强制洗牌时，才全量重排（同步事务逐行 UPDATE，大文件夹耗时 2-5s 阻塞主线程）。
		if (_stale()) { console.log('[scan] aborted before recompute sort:', folderPath.slice(0, 80)); return { error: true, message: 'Scan superseded' } }
		if (!_isDimSort) {
			const prevSort = getFolderStoredSortMode(folderId)
			const needsFullRecompute = forceShuffle || prevSort !== finalSortMode || (prevSort === 'random' && finalSortMode === 'random' && added.length > 0)
			if (needsFullRecompute) {
				recomputeSortOrder(folderId, finalSortMode, forceShuffle ?? true, hueOrigin ?? 0)
			} else if (added.length > 0) {
				// 保留行 sort_order 不变，仅给新行分配递增的 sort_order（追加到已有最高 sort_order 之后）
				const maxSo = (getDb().prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM images WHERE folder_id = ?').get(folderId) as any)?.m ?? -1
				const upd = getDb().prepare('UPDATE images SET sort_order = ? WHERE file_path = ?')
				for (let ai = 0; ai < added.length; ai++) { upd.run(maxSo + 1 + ai, added[ai].file_path) }
				const storage = require('./database') as any
				if (storage._folderSortMode) storage._folderSortMode.set(folderId, finalSortMode)
				console.log('[scan] assign sort_order to %d new images (skip full recompute)', added.length)
			}
		}
		invalidateStatsCache(folderId)

		// 增量模式下 kept 行的 is_favorite 已在 DB 行里，firstPage 查询直接带出，无需 favSet 覆盖
		const firstPage = getImagesPage(folderId, 0, 100, finalSortMode)

		// 补读首屏尺寸 + 发现已有缩略图（每 20 张检查世代）
		let _fpCheck = 0
		for (const img of firstPage) {
			if (!img.thumbnail_path) img.thumbnail_path = discoverThumbnailPath(img.file_path)
		}
		// 首屏缺尺寸的图片并发补读（8 并发）-- kept 行尺寸已在 DB，只有 added 行 width=0 需补读
		const _needDim = firstPage.filter((img: any) => !img.width || !img.height)
		let _fpCursor = 0
		const _fpRun = async (ent: any) => {
			if (_stale()) return
			try { const d = await readImageDimensions(ent.file_path, _sharp); if (d) { ent.width = d.width; ent.height = d.height } } catch {}
		}
		const _fpWorkers: Promise<void>[] = []
		for (let w = 0; w < 8 && w < _needDim.length; w++) {
			_fpWorkers.push((async () => {
				while (true) {
					if (_stale()) { console.log('[scan] aborted during first-page dim:', folderPath.slice(0, 80)); return }
					const myIdx = _fpCursor++
					if (myIdx >= _needDim.length) break
					if (++_fpCheck % 20 === 0 && _stale()) { console.log('[scan] aborted during first-page dim:', folderPath.slice(0, 80)); return }
					await _fpRun(_needDim[myIdx])
				}
			})())
		}
		await Promise.all(_fpWorkers)
		if (_stale()) { console.log('[scan] aborted during first-page dim:', folderPath.slice(0, 80)); return { error: true, message: 'Scan superseded' } }

    // 视频海报：扫描完成后后台静默补齐本文件夹全部视频，不阻塞 scan-folder 返回。
		// 历史上这里同步 await 4 路并发 ffmpeg 抽帧，首屏若有多个视频会卡住主进程数秒，
		// 渲染层一直停在"扫描中"不可交互。改为：扫描立即返回首屏（视频项暂无海报，
		// <img> 走 picrand:// 按需即时生成兜底），后台补生成并回写 DB + 推 sync-db 刷新。
		// 范围：本文件夹全部视频（非仅首屏），1 路串行 + 全局 CPU 闸门限流。
		// 不再因"用户活跃"完全让出--闸门已保证翻阅优先（协议层 sharp 占满闸门时海报任务排队），
		// 翻阅间歇闸门空闲时海报自然推进，翻阅到深处时视频已有海报，不走即时生成峰值。
		if (_stale()) { console.log('[scan] aborted before video poster bg:', folderPath.slice(0, 80)); return { error: true, message: 'Scan superseded' } }
		const _vidAll = allImages.filter(img => isVideoExt(extname(img.file_path).toLowerCase()) && !img.thumbnail_path)
		if (_vidAll.length) {
		  const _vpGen = myGen
		  ;(async () => {
		    let _vpCursor = 0
		    const _vpRun = async (ent: any) => {
		      if (_scanGen !== _vpGen) return
		      // 经全局 CPU 闸门，与协议层 sharp/ffmpeg 共享 _cpuConcurrency 总并发上限。
		      // 翻阅时协议层 sharp 占满闸门，此处自然排队等待，不抢占主进程 CPU。
		      await _cpuAcquire()
		      try {
		        if (_scanGen !== _vpGen) return   // 扫描被取代：finally 统一释放闸门
		        // onSpawn 把 ffmpeg 句柄存进 _scanVpFfmpegs，切文件夹时 _killScanVpFfmpegs 可中断在途抽帧；
		        // ffmpeg 自然退出时从集合移除，避免句柄堆积。
		        const poster = await getOrGeneratePoster(ent.file_path, (p) => {
		          if (_scanGen === _vpGen) { _scanVpFfmpegs.add(p); p.on('exit', () => _scanVpFfmpegs.delete(p)) }
		          else { try { p.kill() } catch {} }  // 已被取代则立即杀掉刚 spawn 的
		        })
		        if (poster && existsSync(poster)) {
		          ent.thumbnail_path = poster
		          try { updateThumbnailPath(ent.file_path, poster) } catch {}
		          if (_scanGen === _vpGen && mainWindow && !mainWindow.isDestroyed()) {
		            try { mainWindow.webContents.send('sync-db', { type: 'thumb-update', file_path: ent.file_path, thumbnail_path: poster }) } catch {}
		          }
		        }
		      } catch {} finally { _cpuRelease() }
		    }
		    // 1 路串行：内存恒定（一次一张 ffmpeg+sharp），不与大文件夹并发叠加峰值
		    while (_scanGen === _vpGen) {
		      const myIdx = _vpCursor++
		      if (myIdx >= _vidAll.length) break
		      await _vpRun(_vidAll[myIdx])
		    }
		  })()
		}
    // 若文件夹尚无封面，锁定第一张图片为封面
    if (!getFolderStoredCover(folderId) && allImages.length > 0) {
      updateFolderCover(folderId, allImages[0].file_path)
    }

    // timing logged to scan-timing.log
    const _tTotalMs = Date.now() - _tTotal
    try { const fs = require('fs'); const path = require('path'); const os = require('os'); fs.appendFileSync(path.join(dataDir, 'scan-timing.log'), '[' + new Date().toISOString() + '] folder=' + folderPath + ' save=' + _tSaveAllMs + 'ms restore_sync=' + _tSyncRestoreMs + 'ms total=' + _tTotalMs + 'ms' + os.EOL) } catch {}
    console.log('[scan] returning firstPage=%d total=%d (bg prefetch queued for %d)', firstPage.length, allImages.length, Math.max(0, allImages.length - 100))
    _logChildProbes(`scan-return folder=${folderPath.slice(-40)}`)
    return { images: firstPage, total: allImages.length, folderId }
  } catch (err: any) {
    if (_stale()) { console.log('[scan] aborted (superseded):', folderPath.slice(0, 80)); return { error: true, message: 'Scan superseded' } }
    console.error('scan-folder:', err)
    return { error: true, message: err?.message || '路径无法访问或权限不足' }
  }
})

// 快照增量同步：轻量 walk+diff 代替完整 scan-folder，用于文件夹记忆切回时后台校验。
// 不做 _bgRestore / recomputeSortOrder / readImageDimensions / 视频海报 —— 仅 diff 增减并推 sync-db。
// 
// 世代安全：与 scan-folder 共享 _scanGen 和 _activeScanWorker，新 scan-folder/sync-folder-snapshot
// 会终止前一个 worker 并递增世代，旧 walk 完成后检测到世代变化则跳过 DB 写入。
ipcMain.handle('sync-folder-snapshot', async (_event, folderPath: string) => {
  try {
    // 递增世代 + 终止上一个 worker（与 scan-folder 共享取消机制）
    _scanGen++
    const myGen = _scanGen
    const _stale = (): boolean => _scanGen !== myGen
    if (_activeScanWorker) {
      try { _activeScanWorker.terminate() } catch {}
      _activeScanWorker = null
    }

    const walkResult = await _scanFolderWorker(folderPath, { onWorker: (w: any) => { _activeScanWorker = w } })
    _activeScanWorker = null
    if (_stale() || !walkResult) return { ok: false }

    const currentPaths = new Set(walkResult.map((e: any) => e.path))
    const folderId = getOrCreateFolder(folderPath)
    // 只 SELECT file_path 列，不拉 BLOB（features/clip_feat/color_info），
    // 大文件夹五万张图下避免一次性装入 150MB+ BLOB 导致 OOM。
    const dbRows = getDb().prepare('SELECT file_path FROM images WHERE folder_id = ?').all(folderId) as { file_path: string }[]
    const dbPathSet = new Set(dbRows.map((r: any) => r.file_path))

    // 新增：文件中存在但 DB 中没有
    const added: string[] = []
    for (const cp of currentPaths) {
      if (!dbPathSet.has(cp)) {
        added.push(cp)
      }
    }
    // 删除：DB 中存在但文件中不存在
    const removed: string[] = []
    for (const dp of dbPathSet) {
      if (!currentPaths.has(dp)) {
        removed.push(dp)
      }
    }

    if (_stale()) return { ok: false }

    // 批量增量写入新增文件
    if (added.length > 0) {
      const addedWithInfo: any[] = []
      for (const ap of added) {
        try {
          const s = statSync(ap)
          addedWithInfo.push({
            file_path: ap,
            file_name: basename(ap),
            file_size: s.size,
            modify_time: Math.floor(s.mtimeMs / 1000),
            sort_order: 0,
          })
        } catch {}
      }
      if (addedWithInfo.length > 0 && !_stale()) {
        insertImagesBatch(folderId, addedWithInfo)
        for (const ai of addedWithInfo) {
          if (isFormatAllowed(ai.file_path) && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('sync-db', { type: 'add', image: { file_path: ai.file_path, file_name: ai.file_name, file_size: ai.file_size, modify_time: ai.modify_time, thumbnail_path: '', width: 0, height: 0, is_favorite: 0 } })
          }
        }
      }
    }

    // 批量删除已不存在的文件
    if (removed.length > 0 && !_stale()) {
      const delStmt = getDb().prepare('DELETE FROM images WHERE file_path = ?')
      for (const rp of removed) {
        try { delStmt.run(rp) } catch {}
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('sync-db', { type: 'unlink', path: rp })
        }
      }
    }

    return { ok: true, added: added.length, removed: removed.length }
  } catch (e: any) {
    console.error('[sync-folder-snapshot] error:', e?.message || e)
    return { ok: false }
  }
})

ipcMain.handle('get-images-page', async (_event, folderId: number, offset: number, limit: number, sortMode?: string) => {
  _markActive()
  console.log('[db] get-images-page folderId=%d offset=%d limit=%d', folderId, offset, limit)
  const page = getImagesPage(folderId, offset, limit, sortMode)
  console.log('[db] get-images-page returned %d rows', page?.length || 0)
  // 校验缩略图和原始文件（不受 sharp 加载失败影响）
  const valid: typeof page = []
  for (const img of page) {
    // 缩略图不存在 → 尝试从缓存目录发现已有文件
    if (img.thumbnail_path && !existsSync(img.thumbnail_path)) {
      img.thumbnail_path = ''
    }
    if (!img.thumbnail_path) {
      img.thumbnail_path = discoverThumbnailPath(img.file_path)
    }
    // 原始文件也不存在 → 从 DB 删除，永不返回
    if (!existsSync(img.file_path)) {
      deleteImageByPath(img.file_path)
      continue // 跳过这条记录
    }
    valid.push(img)
  }
  // 再补读尺寸（失败不影响返回）：8 路并发 + 独立轻量 metadata 通道，
  // 不再串行等大图 metadata，避免排在后面的图拿不到尺寸走 0.75 兜底比例
  try {
    const needDim = valid.filter(img => !img.width || !img.height)
    let cursor = 0
    const runOne = async () => {
      while (true) {
        const i = cursor++
        if (i >= needDim.length) break
        const img = needDim[i]
        try {
          const d = await readImageDimensions(img.file_path)
          if (d) { img.width = d.width; img.height = d.height; updateImageDimensions(img.file_path, d.width, d.height) }
        } catch {}
      }
    }
    await Promise.all(Array.from({ length: Math.min(8, needDim.length) }, () => runOne()))
  } catch {}
  return valid
})

ipcMain.handle('get-images-count', (_event, folderId: number) => {
  return getImagesCount(folderId)
})

ipcMain.handle('search-images', async (_event, folderId: number, query: string, offset: number, limit: number) => {
  if (!query.trim()) return []
  const rows = searchImages(folderId, query.trim(), offset, limit)
  const fse = await import('fs-extra')
  const valid = []
  for (const img of rows) {
    const exists = await fse.pathExists(img.file_path).catch(() => false)
    if (!exists) continue
    if (!img.thumbnail_path) {
      img.thumbnail_path = discoverThumbnailPath(img.file_path)
    }
    valid.push(img)
  }
  // 补读尺寸：8 路并发 + 独立轻量 metadata 通道（与翻页一致）
  try {
    const needDim = valid.filter((img: any) => !img.width || !img.height)
    let cursor = 0
    const runOne = async () => {
      while (true) {
        const i = cursor++
        if (i >= needDim.length) break
        const img = needDim[i]
        try {
          const d = await readImageDimensions(img.file_path)
          if (d) { img.width = d.width; img.height = d.height; updateImageDimensions(img.file_path, d.width, d.height) }
        } catch {}
      }
    }
    await Promise.all(Array.from({ length: Math.min(8, needDim.length) }, () => runOne()))
  } catch {}
  return valid
})

ipcMain.handle('search-images-count', (_event, folderId: number, query: string) => {
  return searchImagesCount(folderId, query.trim())
})

// 描述搜索
ipcMain.handle('search-by-description', async (_event, folderId: number, query: string, offset: number, limit: number) => {
  if (!query.trim()) return []
  const rows = searchByDescription(folderId, query.trim(), offset, limit)
  const fse = await import('fs-extra')
  const valid = []
  for (const img of rows) {
    const exists = await fse.pathExists(img.file_path).catch(() => false)
    if (!exists) continue
    if (!img.thumbnail_path) {
      img.thumbnail_path = discoverThumbnailPath(img.file_path)
    }
    valid.push(img)
  }
  try {
    for (const img of valid) {
      if (!img.width || !img.height) {
        try {
          const d = await readImageDimensions(img.file_path)
          if (d) { img.width = d.width; img.height = d.height; updateImageDimensions(img.file_path, d.width, d.height) }
        } catch {}
      }
    }
  } catch {}
  return valid
})

ipcMain.handle('search-by-description-count', (_event, folderId: number, query: string) => {
  return searchByDescriptionCount(folderId, query.trim())
})

// 评分搜索
ipcMain.handle('search-by-rating', async (_event, folderId: number, ratings: number[], offset: number, limit: number) => {
  const rows = searchByRating(folderId, ratings, offset, limit)
  const fse = await import('fs-extra')
  const valid = []
  for (const img of rows) {
    const exists = await fse.pathExists(img.file_path).catch(() => false)
    if (!exists) continue
    if (!img.thumbnail_path) {
      img.thumbnail_path = discoverThumbnailPath(img.file_path)
    }
    valid.push(img)
  }
  // 补读尺寸：评分搜索可能返回 width/height=0 的图，补齐避免瀑布流显示 4:3
  try { await _fillRowsDims(valid) } catch {}
  return valid
})

ipcMain.handle('search-by-rating-count', (_event, folderId: number, ratings: number[]) => {
  return searchByRatingCount(folderId, ratings)
})

// 宽高比搜索
ipcMain.handle('search-by-aspect-ratio', async (_event, folderId: number, ratioW: number, ratioH: number, tolerance: number, offset: number, limit: number) => {
  const rows = searchByAspectRatio(folderId, ratioW, ratioH, tolerance, offset, limit)
  const fse = await import('fs-extra')
  const valid = []
  for (const img of rows) {
    const exists = await fse.pathExists(img.file_path).catch(() => false)
    if (!exists) continue
    if (!img.thumbnail_path) {
      img.thumbnail_path = discoverThumbnailPath(img.file_path)
    }
    valid.push(img)
  }
  return valid
})

ipcMain.handle('search-by-aspect-ratio-count', (_event, folderId: number, ratioW: number, ratioH: number, tolerance: number) => {
  return searchByAspectRatioCount(folderId, ratioW, ratioH, tolerance)
})

// 多文件夹搜索统一后处理：过滤已消失文件、补缩略图路径、按需补尺寸。
async function _prepareMultiSearchRows(rows: any[], fillDims = true): Promise<any[]> {
  const fse = await import('fs-extra')
  const valid = []
  for (const img of rows) {
    const exists = await fse.pathExists(img.file_path).catch(() => false)
    if (!exists) continue
    if (!img.thumbnail_path) img.thumbnail_path = discoverThumbnailPath(img.file_path)
    valid.push(img)
  }
  if (fillDims) { try { await _fillRowsDims(valid) } catch {} }
  return valid
}

ipcMain.handle('search-images-multi', async (_event, folderIds: number[], query: string, offset: number, limit: number, sortMode?: string) => {
  if (!query.trim()) return []
  return _prepareMultiSearchRows(searchImagesMulti(folderIds, query.trim(), offset, limit, sortMode), true)
})
ipcMain.handle('search-images-count-multi', (_event, folderIds: number[], query: string) => {
  return searchImagesCountMulti(folderIds, query.trim())
})

ipcMain.handle('search-by-description-multi', async (_event, folderIds: number[], query: string, offset: number, limit: number, sortMode?: string) => {
  if (!query.trim()) return []
  return _prepareMultiSearchRows(searchByDescriptionMulti(folderIds, query.trim(), offset, limit, sortMode), true)
})
ipcMain.handle('search-by-description-count-multi', (_event, folderIds: number[], query: string) => {
  return searchByDescriptionCountMulti(folderIds, query.trim())
})

ipcMain.handle('search-by-rating-multi', async (_event, folderIds: number[], ratings: number[], offset: number, limit: number, sortMode?: string) => {
  return _prepareMultiSearchRows(searchByRatingMulti(folderIds, ratings, offset, limit, sortMode), true)
})
ipcMain.handle('search-by-rating-count-multi', (_event, folderIds: number[], ratings: number[]) => {
  return searchByRatingCountMulti(folderIds, ratings)
})

ipcMain.handle('search-by-aspect-ratio-multi', async (_event, folderIds: number[], ratioW: number, ratioH: number, tolerance: number, offset: number, limit: number, sortMode?: string) => {
  return _prepareMultiSearchRows(searchByAspectRatioMulti(folderIds, ratioW, ratioH, tolerance, offset, limit, sortMode), false)
})
ipcMain.handle('search-by-aspect-ratio-count-multi', (_event, folderIds: number[], ratioW: number, ratioH: number, tolerance: number) => {
  return searchByAspectRatioCountMulti(folderIds, ratioW, ratioH, tolerance)
})

// 印象色搜索：按图片平均色 HSV 距离过滤，保持当前排序顺序。
// tolerance 为归一化色差阈值（0..1），由渲染层把用户输入的差值换算后传入。
ipcMain.handle('search-by-color', async (_event, folderIds: number[], target: { h: number; s: number; v: number }, tolerance: number, offset: number, limit: number, sortMode?: string, useHue = true, useSat = true, useValue = true) => {
  const ids = Array.isArray(folderIds) ? folderIds.filter((x: number) => x > 0) : []
  const t = target && typeof target === 'object'
    ? { h: Number(target.h) || 0, s: Number(target.s) || 0, v: Number(target.v) || 0 }
    : { h: 0, s: 0, v: 0 }
  const tol = Math.max(0, Math.min(1, Number(tolerance) || 0))
  const off = Math.max(0, Number(offset) || 0)
  const lim = Math.max(1, Math.min(1000, Number(limit) || 100))
  const { rows, total } = searchByColor(ids, t, tol, off, lim, sortMode, useHue, useSat, useValue)
  for (const img of rows) {
    img.is_favorite = img.is_favorite || 0
    if (!img.thumbnail_path) img.thumbnail_path = discoverThumbnailPath(img.file_path)
  }
  return { rows, total }
})

// 多文件夹分页
ipcMain.handle('get-images-page-multi', async (_event, folderIds: number[], offset: number, limit: number, sortMode?: string) => {
  _markActive()
  const page = getImagesPageMulti(folderIds, offset, limit, sortMode)
  const result = page.map((r: any) => {
    const img = { ...r, is_favorite: r.is_favorite || 0 }
    // 发现缓存中已有的缩略图
    if (!img.thumbnail_path) {
      img.thumbnail_path = discoverThumbnailPath(img.file_path)
    } else if (!existsSync(img.thumbnail_path)) {
      img.thumbnail_path = ''
      img.thumbnail_path = discoverThumbnailPath(img.file_path)
    }
    // 原始文件不存在 → 从 DB 删除
    if (!existsSync(img.file_path)) {
      deleteImageByPath(img.file_path)
      return null
    }
    return img
  }).filter(Boolean) as any[]
  // 补读尺寸
  try {
    for (const img of result) {
      if (!img.width || !img.height) {
        try {
          const d = await readImageDimensions(img.file_path)
          if (d) { img.width = d.width; img.height = d.height; updateImageDimensions(img.file_path, d.width, d.height) }
        } catch {}
      }
    }
  } catch {}
  return result
})
ipcMain.handle('get-images-count-multi', (_event, folderIds: number[]) => {
  return getImagesCountMulti(folderIds)
})

// 风格漫游：获取文件夹内全部图片 ID+路径（一次 IPC，渲染进程自己洗牌）
ipcMain.handle('get-all-image-ids', (_event, folderId: number) => {
  return getAllImageIds(folderId)
})

// 风格漫游：按主键 ID 批量查图片行
ipcMain.handle('get-images-by-ids', (_event, ids: number[]) => {
  return getImagesByIds(ids)
})

// 风格漫游：从 DB 随机抽样（第一批秒出用，自动补全缺失的尺寸）
ipcMain.handle('get-random-sample', async (_event, folderId: number | number[], excludePath: string, count: number) => {
  const rows = Array.isArray(folderId)
    ? getRandomSampleMulti(folderId, excludePath, count)
    : getRandomSample(folderId, excludePath, count)
  // 补全 width/height（DB 中可能为 0，导致画廊渲染为方形）
  const needDim = rows.filter((r: any) => !r.width || !r.height)
  if (needDim.length > 0) {
    try {
      const sharp = (await import('sharp')).default
      const lim = 16
      for (let i = 0; i < needDim.length; i += lim) {
        await Promise.all(needDim.slice(i, i + lim).map(async (r: any) => {
          try {
            const m = await sharp(r.file_path).metadata()
            r.width = m.width || 0; r.height = m.height || 0
            updateImageDimensions(r.file_path, r.width, r.height)
          } catch {}
        }))
      }
    } catch {}
  }
  return rows
})

ipcMain.handle('set-titlebar-theme', (_event, isLight: boolean) => {
  if (!mainWindow) return
  try {
    mainWindow.setTitleBarOverlay({
      color: isLight ? '#faf5ef' : '#1a1a2e',
      symbolColor: isLight ? '#555555' : '#aaaaaa',
      height: 48
    })
    console.log('[titlebar] theme set to', isLight ? 'light' : 'dark')
  } catch (e) {
    console.error('[titlebar] setTitleBarOverlay failed:', e)
  }
})

ipcMain.handle('generate-thumbnail', async (_event, sourcePath: string) => {
  const sharp = (await import('sharp')).default
  const fse = await import('fs-extra')
  const { nativeImage } = await import('electron')
  const ext = extname(sourcePath).toLowerCase()
  const hashName = createHash('md5').update(sourcePath).digest('hex') + ext
  const outputPath = join(cacheDir, hashName)

  async function fallback(dest: string): Promise<{ w: number; h: number } | null> {
    try {
      const img = nativeImage.createFromPath(sourcePath)
      if (img.isEmpty()) return null
      const size = img.getSize()
      const resized = img.resize({ width: 400 })
      const buf = resized.toJPEG(75)
      await fse.writeFile(dest, buf as any)
      return { w: size.width, h: size.height }
    } catch { return null }
  }

  if (ext === '.gif') {
    if (await fse.pathExists(outputPath)) {
      let origW = 0, origH = 0
      try { const m = await sharp(sourcePath).metadata(); origW = m.width || 0; origH = m.height || 0 } catch {}
      return { thumbnail_path: outputPath, width: origW, height: origH }
    }
    try {
      let origW = 0, origH = 0
      try { const m = await sharp(sourcePath).metadata(); origW = m.width || 0; origH = m.height || 0 } catch {}
      await sharp(sourcePath, { animated: true }).resize({ width: 400, withoutEnlargement: true }).gif({ colours: 48, dither: 1.0 }).toFile(outputPath)
      return { thumbnail_path: outputPath, width: origW, height: origH }
    } catch (e: any) {
      console.error('[thumbnail:single] sharp gif failed, trying fallback:', basename(sourcePath), e?.message || e)
      logError(`[single-gif] ${basename(sourcePath)} - sharp failed: ${e?.message || e}`)
      const fb = await fallback(outputPath)
      if (fb) return { thumbnail_path: outputPath, width: fb.w, height: fb.h }
      logError(`[single-gif] ${basename(sourcePath)} - fallback also failed`)
      throw e
    }
  }
  if (ext === '.psd') {
    const pngPath = await ensurePsdPng(sourcePath)
    const webpPath = outputPath.replace(ext, '.webp')
    if (await fse.pathExists(webpPath)) {
      try { const m = await sharp(pngPath).metadata(); return { thumbnail_path: webpPath, width: m.width || 0, height: m.height || 0 } } catch { return { thumbnail_path: webpPath } }
    }
    try {
      let origW = 0, origH = 0
      try { const m = await sharp(pngPath).metadata(); origW = m.width || 0; origH = m.height || 0 } catch {}
      await sharp(pngPath).resize({ width: 400, withoutEnlargement: true }).webp({ quality: 75 }).toFile(webpPath)
      return { thumbnail_path: webpPath, width: origW, height: origH }
    } catch (e: any) {
      logError(`[single-psd] ${basename(sourcePath)} - convert failed: ${e?.message || e}`)
      const fb = await fallback(webpPath)
      if (fb) return { thumbnail_path: webpPath, width: fb.w, height: fb.h }
      throw e
    }
  }
  if (isVideoExt(ext)) {
    const webpPath = outputPath.replace(ext, '.webp')
    if (await fse.pathExists(webpPath)) {
      try { const m = await sharp(webpPath).metadata(); return { thumbnail_path: webpPath, width: m.width || 0, height: m.height || 0 } } catch { return { thumbnail_path: webpPath } }
    }
    const poster = await getOrGeneratePoster(sourcePath)
    if (!poster) return { thumbnail_path: '' }
    try {
      const m = await sharp(poster).metadata()
      // ensureQuickThumb 期望 webp 命中 outputPath；getOrGeneratePoster 产物路径同此命名，直接复用
      return { thumbnail_path: webpPath, width: m.width || 0, height: m.height || 0 }
    } catch { return { thumbnail_path: webpPath } }
  }
  const webpPath = outputPath.replace(ext, '.webp')
  if (await fse.pathExists(webpPath)) {
    try { const m = await sharp(sourcePath).metadata(); return { thumbnail_path: webpPath, width: m.width || 0, height: m.height || 0 } } catch { return { thumbnail_path: webpPath } }
  }
  try {
    let origW = 0, origH = 0
    try { const m = await sharp(sourcePath).metadata(); origW = m.width || 0; origH = m.height || 0 } catch {}
    await sharp(sourcePath).toColourspace('srgb').resize({ width: 400, withoutEnlargement: true }).webp({ quality: 75 }).toFile(webpPath)
    return { thumbnail_path: webpPath, width: origW, height: origH }
  } catch (e: any) {
    console.error('[thumbnail:single] sharp failed, trying fallback:', basename(sourcePath), e?.message || e)
    logError(`[single-webp] ${basename(sourcePath)} - sharp failed: ${e?.message || e}`)
    const jpgPath = webpPath.replace(/\.webp$/, '.jpg')
    const fb = await fallback(jpgPath)
    if (fb) return { thumbnail_path: jpgPath, width: fb.w, height: fb.h }
    logError(`[single-webp] ${basename(sourcePath)} - fallback also failed`)
    throw e
  }
})

// ==== 独立子进程批量缩略图（native 内存用完即还） ====
// 主进程内联 sharp 解码普通静态图会留下 libvips native 缓冲驻留 RSS（不归还 OS）。
// 改为 spawn 独立 Node 子进程（Electron 二进制 + ELECTRON_RUN_AS_NODE）批量解码，
// 子进程 exit(0) 时 OS 强制回收其全部物理内存。失败返回 null，调用方回退主进程内联解码。
let _thumbWorkerPath: string | null = null
async function _ensureThumbWorkerPath(): Promise<string> {
  if (_thumbWorkerPath && existsSync(_thumbWorkerPath)) return _thumbWorkerPath
  // v2：支持 format/quality/noResize。改名而非覆写，避免运行目录里旧版脚本残留导致
  // format 参数被旧脚本忽略（WebP 字节写进 .jpg 文件）。
  const wp = join(__dirname, 'thumb-worker-v2.cjs')
  if (!existsSync(wp)) {
    writeFileSync(wp, `\
const fs = require('fs');
const sharp = require('sharp');
const taskFile = process.argv[2];
const tasks = JSON.parse(fs.readFileSync(taskFile, 'utf8'));
(async () => {
  const out = [];
  for (const t of tasks) {
    try {
      if (fs.existsSync(t.output)) { out.push({ ok: true, file_path: t.file_path, thumbnail_path: t.output, skipped: true }); continue; }
      const m = await sharp(t.input).metadata();
      let p = sharp(t.input).toColourspace('srgb');
      if (!t.noResize) p = p.resize({ width: 400, withoutEnlargement: true });
      const fmt = t.format === 'jpg' ? 'jpeg' : 'webp';
      await p[fmt]({ quality: t.quality || 75 }).toFile(t.output);
      out.push({ ok: true, file_path: t.file_path, thumbnail_path: t.output, width: m.width || 0, height: m.height || 0 });
    } catch (e) {
      out.push({ ok: false, file_path: t.file_path, error: (e && e.message) || String(e) });
    }
  }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
})().catch((e) => { process.stderr.write(String(e)); process.exit(1); });
`)
  }
  _thumbWorkerPath = wp
  return wp
}

// 批量静态图解码交独立子进程：主进程内联 sharp 会留下 libvips native 驻留 RSS（不归还 OS）。
// spawn 独立 Node 子进程（ELECTRON_RUN_AS_NODE）批量解码，exit(0) 时 OS 强制回收全部物理内存。
// 失败返回 null，调用方回退主进程内联解码。worker 脚本一次性输出 JSON 数组。
async function _generateThumbsInChild(tasks: { file_path: string; input: string; output: string; format?: 'webp' | 'jpg'; quality?: number; noResize?: boolean }[]): Promise<{ ok: boolean; file_path: string; thumbnail_path?: string; width?: number; height?: number; error?: string }[] | null> {
  try {
    const workerPath = await _ensureThumbWorkerPath()
    const { spawn } = await import('child_process')
    const os = await import('os')
    const taskFile = join(os.tmpdir(), 'picrand-thumbs-' + randomUUID() + '.json')
    writeFileSync(taskFile, JSON.stringify(tasks))
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [workerPath, taskFile], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
      let out = '', err = ''
      child.stdout.on('data', (d: any) => { out += d })
      child.stderr.on('data', (d: any) => { err += d })
      child.on('error', (e: any) => reject(e))
      child.on('exit', (code: number) => { code === 0 ? resolve(out) : reject(new Error('thumb-worker exit ' + code + (err ? ' | ' + err.slice(0, 500) : ''))) })
    })
    try { unlinkSync(taskFile) } catch {}
    const parsed = JSON.parse(stdout)
    return Array.isArray(parsed) ? parsed : null
  } catch (e: any) {
    console.error('[thumb-worker] batch failed:', e?.message || e)
    return null
  }
}

// 批量生成缩略图（返回原图尺寸）
ipcMain.handle('generate-thumbnails-batch', async (_event, filePaths: string[]) => {
  const sharp = (await import('sharp')).default
  const fse = await import('fs-extra')
  const { nativeImage } = await import('electron')
  const results: { file_path: string; thumbnail_path: string; width?: number; height?: number }[] = []
  const errors: string[] = []

  // 兜底：用 Electron nativeImage 生成缩略图（处理 sharp 不支持的格式如 CMYK JPEG）
  async function fallbackThumb(fp: string, dest: string): Promise<{ w: number; h: number } | null> {
    try {
      const img = nativeImage.createFromPath(fp)
      if (img.isEmpty()) return null
      const size = img.getSize()
      const resized = img.resize({ width: 400 })
      const buf = resized.toJPEG(75)
      await fse.writeFile(dest, buf as any)
      return { w: size.width, h: size.height }
    } catch { return null }
  }

  // 静态图（jpg/png/bmp/webp/tiff/heic/avif 等）：收集后一次性交独立子进程解码，用完即还 native 内存
  const childTasks: { file_path: string; input: string; output: string }[] = []

  for (const fp of filePaths) {
    await _thumbAcquire()
    try {
      const ext = extname(fp).toLowerCase()
      const hashName = createHash('md5').update(fp).digest('hex') + ext
      const tp = join(cacheDir, hashName)
      let origW = 0, origH = 0
      if (ext === '.gif') {
        if (!(await fse.pathExists(tp))) {
          try { await sharp(fp, { animated: true }).resize({ width: 400, withoutEnlargement: true }).gif({ colours: 48, dither: 1.0 }).toFile(tp); results.push({ file_path: fp, thumbnail_path: tp, width: origW, height: origH }) }
          catch (e: any) {
            // GIF fallback
            logError(`[batch-gif] ${basename(fp)} - sharp failed: ${e?.message || e}`)
            const fb = await fallbackThumb(fp, tp)
            if (fb) { origW = fb.w; origH = fb.h; results.push({ file_path: fp, thumbnail_path: tp, width: origW, height: origH }) }
            else {
              logError(`[batch-gif] ${basename(fp)} - fallback also failed`)
              console.error('[thumbnail] gif+fallback failed:', basename(fp), e?.message || e);
              errors.push(basename(fp));
              results.push({ file_path: fp, thumbnail_path: '' })
            }
          }
        } else { results.push({ file_path: fp, thumbnail_path: tp, width: origW, height: origH }) }
        continue
      }
      if (ext === '.psd') {
        const wp = tp.replace(ext, '.webp')
        if (await fse.pathExists(wp)) {
          results.push({ file_path: fp, thumbnail_path: wp, width: origW, height: origH })
          continue
        }
        try {
          const pngPath = await ensurePsdPng(fp)
          const m = await sharp(pngPath).metadata()
          origW = m.width || 0; origH = m.height || 0
          await sharp(pngPath).resize({ width: 400, withoutEnlargement: true }).webp({ quality: 75 }).toFile(wp)
          results.push({ file_path: fp, thumbnail_path: wp, width: origW, height: origH })
          updateImageDimensions(fp, origW, origH)
        } catch (e: any) {
          logError(`[batch-psd] ${basename(fp)} - convert failed: ${e?.message || e}`)
          const fb = await fallbackThumb(fp, wp)
          if (fb) { origW = fb.w; origH = fb.h; results.push({ file_path: fp, thumbnail_path: wp, width: origW, height: origH }) }
          else {
            errors.push(basename(fp))
            results.push({ file_path: fp, thumbnail_path: '' })
          }
        }
        continue
      }
      if (isVideoExt(ext)) {
        const wp = tp.replace(ext, '.webp')
        if (await fse.pathExists(wp)) {
          try { const m = await sharp(wp).metadata(); origW = m.width || 0; origH = m.height || 0 } catch {}
          results.push({ file_path: fp, thumbnail_path: wp, width: origW, height: origH })
          continue
        }
        const poster = await getOrGeneratePoster(fp)
        if (!poster) { errors.push(basename(fp)); results.push({ file_path: fp, thumbnail_path: '' }); continue }
        try {
          const m = await sharp(poster).metadata()
          origW = m.width || 0; origH = m.height || 0
          updateImageDimensions(fp, origW, origH)
        } catch {}
        results.push({ file_path: fp, thumbnail_path: wp, width: origW, height: origH })
        continue
      }
      // 静态图：收集进子进程批次
      const wp = tp.replace(ext, '.webp')
      if (!(await fse.pathExists(wp))) {
        childTasks.push({ file_path: fp, input: fp, output: wp })
      } else {
        results.push({ file_path: fp, thumbnail_path: wp, width: origW, height: origH })
      }
    } finally { _thumbRelease() }
  }

  // 静态图一次性交子进程批解码（native 内存用完即还）
  if (childTasks.length > 0) {
    const childRes = await _generateThumbsInChild(childTasks)
    if (childRes) {
      for (const cr of childRes) {
        if (cr.ok && cr.thumbnail_path) {
          results.push({ file_path: cr.file_path, thumbnail_path: cr.thumbnail_path, width: cr.width || 0, height: cr.height || 0 })
        } else {
          // 子进程失败 → 回退主进程内联 + nativeImage 兜底
          const fp = cr.file_path
          const ext = extname(fp).toLowerCase()
          const wp = join(cacheDir, createHash('md5').update(fp).digest('hex') + ext).replace(ext, '.webp')
          try {
            const m = await sharp(fp).metadata()
            await sharp(fp).toColourspace('srgb').resize({ width: 400, withoutEnlargement: true }).webp({ quality: 75 }).toFile(wp)
            results.push({ file_path: fp, thumbnail_path: wp, width: m.width || 0, height: m.height || 0 })
          } catch (e: any) {
            logError(`[batch-webp] ${basename(fp)} - sharp failed: ${e?.message || e}`)
            const jpgPath = wp.replace(/\.webp$/, '.jpg')
            const fb = await fallbackThumb(fp, jpgPath)
            if (fb) { results.push({ file_path: fp, thumbnail_path: jpgPath, width: fb.w, height: fb.h }) }
            else {
              logError(`[batch-webp] ${basename(fp)} - fallback also failed`)
              errors.push(basename(fp));
              results.push({ file_path: fp, thumbnail_path: '' })
            }
          }
        }
      }
    } else {
      // 整个子进程调用失败（异常/超时）：全部回退主进程内联
      for (const t of childTasks) {
        const fp = t.file_path
        try {
          const m = await sharp(fp).metadata()
          await sharp(fp).toColourspace('srgb').resize({ width: 400, withoutEnlargement: true }).webp({ quality: 75 }).toFile(t.output)
          results.push({ file_path: fp, thumbnail_path: t.output, width: m.width || 0, height: m.height || 0 })
        } catch (e: any) {
          const jpgPath = t.output.replace(/\.webp$/, '.jpg')
          const fb = await fallbackThumb(fp, jpgPath)
          if (fb) { results.push({ file_path: fp, thumbnail_path: jpgPath, width: fb.w, height: fb.h }) }
          else { errors.push(basename(fp)); results.push({ file_path: fp, thumbnail_path: '' }) }
        }
      }
    }
  }
  return { results, errors }
})

ipcMain.handle('db-init-folder', (_event, folderPath: string) => getOrCreateFolder(folderPath))
ipcMain.handle('db-insert-image', (_event, image: any) => { insertImage(image.folderId, image.filePath, image.fileName, image.fileSize, image.modifyTime, image.width, image.height, image.thumbnailPath) })
ipcMain.handle('db-delete-image', (_event, filePath: string) => { deleteImageByPath(filePath) })

ipcMain.handle('db-get-images-by-folder', (_event, folderId: number) => getImagesByFolder(folderId))
ipcMain.handle('update-image-dimensions', (_event, filePath: string, width: number, height: number) => { updateImageDimensions(filePath, width, height) })
ipcMain.handle('update-image-thumbnail', (_event, filePath: string, thumbnailPath: string) => { updateThumbnailPath(filePath, thumbnailPath) })

// 批量读取 DB 中已补全的尺寸数据（dim 排序前补坑用）
ipcMain.handle('get-dimensions-batch', (_event, paths: string[]) => {
  if (!paths.length) return []
  const placeholders = paths.map(() => '?').join(',')
  const rows = getDb().prepare(
    `SELECT file_path, width, height FROM images WHERE file_path IN (${placeholders})`
  ).all(...paths) as { file_path: string; width: number; height: number }[]
  return rows
})

// 批量补读尺寸：AI 语义搜索等一次性返回大量路径时，对 DB 中 width/height 缺失的路径
// 用轻量 metadata 通道探测并回写，避免瀑布流长期停留在 0.75 兜底比例（显示为 4:3）。
ipcMain.handle('fill-image-dims', async (_event, paths: string[]) => {
  if (!Array.isArray(paths) || paths.length === 0) return {}
  const placeholders = paths.map(() => '?').join(',')
  const rows = getDb().prepare(
    `SELECT file_path, width, height FROM images WHERE file_path IN (${placeholders})`
  ).all(...paths) as { file_path: string; width: number; height: number }[]
  const need = rows.filter(r => !r.width || !r.height).map(r => r.file_path)
  const out: Record<string, { width: number; height: number }> = {}
  let cursor = 0
  const runOne = async () => {
    while (true) {
      const i = cursor++
      if (i >= need.length) break
      const p = need[i]
      try {
        const d = await readImageDimensions(p)
        if (d && d.width > 0 && d.height > 0) {
          out[p] = { width: d.width, height: d.height }
          updateImageDimensions(p, d.width, d.height)
        }
      } catch {}
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, need.length) }, () => runOne()))
  return out
})

ipcMain.handle('write-temp-png', (_event, data: Uint8Array) => {
  try {
    const os = require('os')
    const tmpDir = join(os.tmpdir(), 'picrand-frames')
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })
    const tmpPath = join(tmpDir, 'frame-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.png')
    writeFileSync(tmpPath, Buffer.from(data))
    return tmpPath
  } catch (e) {
    console.error('[write-temp-png] failed:', e)
    return null
  }
})

ipcMain.handle('read-file-buffer', (_event, filePath: string) => {
  try {
    const buf = readFileSync(filePath)
    return new Uint8Array(buf)
  } catch (e) {
    console.error('[read-file-buffer] failed:', e)
    return null
  }
})

ipcMain.handle('get-image-info', async (_event, filePath: string) => {
  const stat = statSync(filePath)
  let width = 0, height = 0, dpi = 72
  try {
    const sharp = (await import('sharp')).default
    const resolved = await resolveForSharp(filePath)
    const meta = await sharp(resolved).metadata()
    width = meta.width || 0
    height = meta.height || 0
    if (meta.density && meta.density > 0) dpi = meta.density
  } catch {
    try {
      const { nativeImage } = await import('electron')
      const img = nativeImage.createFromPath(filePath)
      if (!img.isEmpty()) {
        const size = img.getSize()
        width = size.width
        height = size.height
      }
    } catch {}
  }
  return {
    file_path: filePath,
    file_name: basename(filePath),
    file_size: stat.size,
    modify_time: Math.floor(stat.mtimeMs / 1000),
    width,
    height,
    dpi,
    thumbnail_path: filePath,
    is_favorite: 0
  }
})

// ====== F1 图形审计：图片元数据 ======
ipcMain.handle('get-image-metadata', async (_event, filePath: string) => {
  try {
    const sharp = (await import('sharp')).default
    const resolved = await resolveForSharp(filePath)
    const meta = await sharp(resolved).metadata()
    const stat = statSync(filePath)
    const w = meta.width || 0, h = meta.height || 0
    return {
      width: w, height: h,
      space: meta.space || 'srgb',
      channels: meta.channels || 3,
      hasAlpha: meta.hasAlpha ?? false,
      format: meta.format || '',
      fileSize: stat.size,
      isPotWidth: (w & (w - 1)) === 0 && w > 0,
      isPotHeight: (h & (h - 1)) === 0 && h > 0,
    }
  } catch { return null }
})

// ====== F1 图形审计：像素采样 ======
ipcMain.handle('sample-pixel', async (_event, filePath: string, x: number, y: number) => {
  try {
    const sharp = (await import('sharp')).default
    const resolved = await resolveForSharp(filePath)
    const { data } = await sharp(resolved)
      .extract({ left: Math.max(0, Math.round(x)), top: Math.max(0, Math.round(y)), width: 1, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true })
    const r = data[0], g = data[1] ?? r, b = data[2] ?? r, a = data[3] ?? 255
    const hex = '#' + [r,g,b].map(c => c.toString(16).padStart(2,'0')).join('').toUpperCase()
    const fr = r / 255, fg = g / 255, fb = b / 255
    const cmax = Math.max(fr, fg, fb), cmin = Math.min(fr, fg, fb), delta = cmax - cmin
    let h = 0, s = 0
    if (delta > 0.001) {
      if (cmax === fr) h = ((fg - fb) / delta) % 6
      else if (cmax === fg) h = (fb - fr) / delta + 2
      else h = (fr - fg) / delta + 4
      h = (h < 0 ? h + 6 : h) * 60
      s = delta / cmax
    }
    return { r, g, b, a, hex, floatR: fr, floatG: fg, floatB: fb, h: Math.round(h), s: +s.toFixed(4), v: +cmax.toFixed(4) }
  } catch { return null }
})

// ====== F1 图形审计：区域取色平均色 ======
ipcMain.handle('sample-rect', async (_event, filePath: string, x: number, y: number, w: number, h: number) => {
  try {
    const rw = Math.max(1, Math.round(w)), rh = Math.max(1, Math.round(h))
    const rx = Math.max(0, Math.round(x)), ry = Math.max(0, Math.round(y))
    const sharp = (await import('sharp')).default
    const resolved = await resolveForSharp(filePath)
    const { data, info } = await sharp(resolved)
      .extract({ left: rx, top: ry, width: rw, height: rh })
      .raw()
      .toBuffer({ resolveWithObject: true })
    const channels = info.channels || 3
    let sumR = 0, sumG = 0, sumB = 0, count = 0
    for (let i = 0; i < data.length; i += channels) {
      sumR += data[i]; sumG += data[i + 1] ?? data[i]; sumB += data[i + 2] ?? data[i]
      count++
    }
    if (count === 0) return null
    const r = Math.round(sumR / count), g = Math.round(sumG / count), b = Math.round(sumB / count)
    const hex = '#' + [r,g,b].map(c => c.toString(16).padStart(2,'0')).join('').toUpperCase()
    const fr = r / 255, fg = g / 255, fb = b / 255
    const cmax = Math.max(fr, fg, fb), cmin = Math.min(fr, fg, fb), delta = cmax - cmin
    let hh = 0, s = 0
    if (delta > 0.001) {
      if (cmax === fr) hh = ((fg - fb) / delta) % 6
      else if (cmax === fg) hh = (fb - fr) / delta + 2
      else hh = (fr - fg) / delta + 4
      hh = (hh < 0 ? hh + 6 : hh) * 60
      s = delta / cmax
    }
    return { r, g, b, hex, h: Math.round(hh), s: +s.toFixed(4), v: +cmax.toFixed(4) }
  } catch { return null }
})

// ====== F1 图形审计：多通道直方图 ======
ipcMain.handle('compute-histogram', async (_event, filePath: string, sampleStep: number = 4) => {
  try {
    const sharp = (await import('sharp')).default
    const resolved = await resolveForSharp(filePath)
    const { data, info } = await sharp(resolved).raw().toBuffer({ resolveWithObject: true })
    const channels = info.channels || 3
    const lumas = new Array(256).fill(0), reds = new Array(256).fill(0)
    const greens = new Array(256).fill(0), blues = new Array(256).fill(0)
    let step = sampleStep
    // 大图自动加大采样步长
    const totalPixels = info.width * info.height
    if (totalPixels > 16_000_000) step = Math.max(step, 8)
    let count = 0
    for (let i = 0; i < data.length; i += step * channels) {
      const r = data[i], g = data[i + 1] ?? r, b_ = data[i + 2] ?? r
      const luma = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b_)
      lumas[luma]++; reds[r]++; greens[g]++; blues[b_]++
      count++
    }
    return { luma: lumas, red: reds, green: greens, blue: blues, totalPixels: count }
  } catch { return null }
})

// ====== F1 图形审计：颜色分析（平均色 + HSV 分布 + 主色环） ======
ipcMain.handle('compute-color-analysis', async (_event, filePath: string) => {
  try {
    const sharp = (await import('sharp')).default
    const resolved = await resolveForSharp(filePath)
    const { data, info } = await sharp(resolved).raw().toBuffer({ resolveWithObject: true })
    const channels = info.channels || 3
    const totalPixels = info.width * info.height
    let step = 4
    if (totalPixels > 16_000_000) step = Math.max(step, 8)

    let sumR = 0, sumG = 0, sumB = 0, count = 0
    const hueHist = new Array(360).fill(0)
    const satHist = new Array(100).fill(0)
    const valHist = new Array(100).fill(0)

    // 颜色量化桶：R/G/B 各分 8 级 = 512 桶，桶内累加真实 RGB 均值
    const buckets = new Map<number, { r: number; g: number; b: number; n: number }>()

    for (let i = 0; i < data.length; i += step * channels) {
      const r = data[i], g = data[i + 1] ?? r, b = data[i + 2] ?? r
      sumR += r; sumG += g; sumB += b; count++

      // RGB → HSV
      const fr = r / 255, fg = g / 255, fb = b / 255
      const cmax = Math.max(fr, fg, fb), cmin = Math.min(fr, fg, fb), delta = cmax - cmin
      let h = 0, s = 0
      if (delta > 0.0001) {
        if (cmax === fr) h = ((fg - fb) / delta) % 6
        else if (cmax === fg) h = (fb - fr) / delta + 2
        else h = (fr - fg) / delta + 4
        h = (h < 0 ? h + 6 : h) * 60
        s = delta / cmax
      }
      hueHist[Math.min(359, Math.floor(h))]++
      satHist[Math.min(99, Math.floor(s * 100))]++
      valHist[Math.min(99, Math.floor(cmax * 100))]++

      // 量化到 512 桶，累加真实 RGB
      const bk = (Math.floor(r / 32) << 6) | (Math.floor(g / 32) << 3) | Math.floor(b / 32)
      const bv = buckets.get(bk)
      if (bv) { bv.r += r; bv.g += g; bv.b += b; bv.n++ }
      else buckets.set(bk, { r, g, b, n: 1 })
    }

    const avgR = Math.round(sumR / count), avgG = Math.round(sumG / count), avgB = Math.round(sumB / count)
    const avgHex = '#' + [avgR, avgG, avgB].map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase()

    // 加权平均 HSV（基于累加的 bins）
    let sinSum = 0, cosSum = 0
    const rad = Math.PI / 180
    for (let i = 0; i < 360; i++) { sinSum += Math.sin(i * rad) * hueHist[i]; cosSum += Math.cos(i * rad) * hueHist[i] }
    let hueAvg = 0
    if (Math.abs(sinSum) > 1e-9 || Math.abs(cosSum) > 1e-9) { hueAvg = Math.atan2(sinSum, cosSum) / rad; if (hueAvg < 0) hueAvg += 360 }
    let satSum = 0, satWt = 0
    for (let i = 0; i < 100; i++) { satSum += i * satHist[i]; satWt += satHist[i] }
    const satAvg = satWt > 0 ? satSum / satWt / 100 : 0
    let valSum = 0, valWt = 0
    for (let i = 0; i < 100; i++) { valSum += i * valHist[i]; valWt += valHist[i] }
    const valAvg = valWt > 0 ? valSum / valWt / 100 : 0

    // 主色提取：取 top 20 桶（按像素数）→ 桶内真实平均色 → 合并相近色 → 前 8 名
    const topBuckets = Array.from(buckets.entries())
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 20)
      .map(([bk, bv]) => {
        const r = Math.round(bv.r / bv.n), g = Math.round(bv.g / bv.n), b = Math.round(bv.b / bv.n)
        return { r, g, b, hex: '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase(), count: bv.n }
      })

    // 合并相近色
    const merged: typeof topBuckets = []
    for (const c of topBuckets) {
      let found = false
      for (const m of merged) {
        const dr = c.r - m.r, dg = c.g - m.g, db = c.b - m.b
        if (Math.sqrt(dr * dr + dg * dg + db * db) < 48) {
          const total = m.count + c.count
          m.r = Math.round((m.r * m.count + c.r * c.count) / total)
          m.g = Math.round((m.g * m.count + c.g * c.count) / total)
          m.b = Math.round((m.b * m.count + c.b * c.count) / total)
          m.hex = '#' + [m.r, m.g, m.b].map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase()
          m.count = total
          found = true; break
        }
      }
      if (!found) merged.push({ ...c })
    }

    const dominantColors = merged
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map(c => ({ r: c.r, g: c.g, b: c.b, hex: c.hex, percent: Math.round(c.count / count * 1000) / 10 }))

    return { avgR, avgG, avgB, avgHex, hueHist, satHist, valHist, hueAvg, satAvg, valAvg, dominantColors, totalPixels: count }
  } catch { return null }
})

// 文件夹管理
ipcMain.handle('get-all-folders', () => {
  const folders = getAllFolders()
  return folders.map((f: any) => ({ ...f, path: resolveStoredPath(f.path) }))
})

// 手动拖拽排序文件夹
ipcMain.handle('reorder-folders', (_event, orderedIds: number[]) => {
  reorderFolders(orderedIds); return true
})

function _toastChecking() { try { mainWindow?.webContents.send('show-toast', { msg: (currentLocale === 'en') ? 'Adding…' : (currentLocale === 'ja') ? '追加中…' : '正在添加…', ms: 60000 }) } catch {} }
function _toastClear() { try { mainWindow?.webContents.send('show-toast', { msg: '', ms: 100 }) } catch {} }

ipcMain.handle('add-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] })
  if (result.canceled || !result.filePaths[0]) return null
  const p = result.filePaths[0]; const name = p.split('\\').pop() || p
  _toastChecking()
  const _ovResult2 = await checkFolderOversize(p)
  if (_ovResult2) {
    if (!(await confirmOversizeDialog())) { _toastClear(); return null }
    _toastClear()
  } else { _toastClear() }
  const id = addFolder(p, name); invalidateStatsCache(); return { id, path: p, display_name: name }
})
// 拖放导入：将拖入的路径解析为有效的文件夹路径列表（文件取父目录，去重）
ipcMain.handle('resolve-drop-paths', (_event, paths: string[]) => {
  if (!Array.isArray(paths)) return []
  const dirs = new Set<string>()
  for (const p of paths) {
    if (!p || typeof p !== 'string') continue
    try {
      if (!existsSync(p)) continue
      if (statSync(p).isDirectory()) dirs.add(p)
    } catch {}
  }
  return Array.from(dirs)
})
// 拖放导入：preload 在隔离世界解析路径后发送，主进程扫描并通知渲染层加载
ipcMain.on('drop-folders', async (_event, paths: string[]) => {
  const payload = paths as { paths?: string[]; diag?: string } | string[]
  const rawPaths = Array.isArray(payload) ? payload : (payload?.paths || [])
  const diag = Array.isArray(payload) ? '' : (payload?.diag || '')
  const dirs: string[] = []
  const imgFiles: string[] = []
  const IMG_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif', '.avif', '.svg', '.psd', '.heic', '.heif', '.mp4', '.webm', '.mov', '.mkv', '.avi', '.flv', '.f4v'])
  let nonDirCount = 0
  let notExistCount = 0
  for (const p of rawPaths) {
    if (!p || typeof p !== 'string') continue
    try {
      if (!existsSync(p)) { notExistCount++; continue }
      if (statSync(p).isDirectory()) { dirs.push(p) }
      else if (IMG_EXTS.has(extname(p).toLowerCase())) { imgFiles.push(p) }
      else { nonDirCount++ }
    } catch {}
  }
  mainWindow?.webContents.send('drop-result', { folders: dirs, imgFiles, diag, nonDirCount, notExistCount })
})
ipcMain.handle('add-folder-by-path', async (_event, folderPath: string) => {
  if (!existsSync(folderPath)) return null
  if (!statSync(folderPath).isDirectory()) return null
  const name = folderPath.split('\\').pop() || folderPath
  _toastChecking()
  const _ovResult3 = await checkFolderOversize(folderPath)
  if (_ovResult3) {
    if (!(await confirmOversizeDialog())) { _toastClear(); return null }
    _toastClear()
  } else { _toastClear() }
  const id = addFolder(folderPath, name); invalidateStatsCache(); return { id, path: folderPath, display_name: name }
})

ipcMain.handle('get-folder-name-by-path', (_event, folderPath: string) => {
  return getFolderDisplayNameByPath(folderPath)
})

ipcMain.handle('get-folder-random-thumbs', async (_event, folderId: number, count: number) => {
  const dbResult = getFolderRandomThumbs(folderId, count)
  if (dbResult.length > 0) return dbResult
  // DB has no images for this folder, fallback: walk the folder path to find images
  try {
    const row = getDb().prepare('SELECT path FROM folders WHERE id = ?').get(folderId) as { path: string } | undefined
    const resolved = row?.path ? resolveStoredPath(row.path) : ''
    if (resolved && existsSync(resolved)) {
      const wresult = await _walkFolderWorker(resolved)
      if (wresult && wresult.recentPaths && wresult.recentPaths.length > 0) {
        const paths = wresult.recentPaths.slice(0, count)
        return paths.map(p => ({ file_path: p, thumbnail_path: discoverThumbnailPath(p) || null }))
      }
      if (wresult && wresult.latestPath) {
        return [{ file_path: wresult.latestPath, thumbnail_path: discoverThumbnailPath(wresult.latestPath) || null }]
      }
    }
  } catch {}
  return []
})
ipcMain.handle('create-new-folder', async (_event, name: string) => {
  const safeName = name.trim()
  if (!safeName) return null
  const fs = await import('fs-extra')
  const folderPath = join(newFoldersDir, safeName)
  // 同名时加序号
  let finalPath = folderPath, finalName = safeName
  let i = 1
  while (await fs.pathExists(finalPath)) {
    finalName = `${safeName}(${i})`
    finalPath = join(newFoldersDir, finalName)
    i++
  }
  await fs.ensureDir(finalPath)
  const id = addFolder(finalPath, finalName)
  return { id, path: finalPath, display_name: finalName }
})
ipcMain.handle('update-folder-name', (_event, id: number, name: string) => { updateFolderName(id, name); return true })
ipcMain.handle('update-folder-description', (_event, id: number, desc: string) => { updateFolderDescription(id, desc); return true })
ipcMain.handle('update-folder-path', async (_event, id: number) => {
  const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] })
  if (result.canceled || !result.filePaths[0]) return null
  const p = result.filePaths[0]; updateFolderPath(id, p)
  return { path: p, display_name: p.split('\\').pop() || p }
})
ipcMain.handle('delete-folder', (_event, id: number, folderPath?: string) => {
  if (folderPath && getWatchedFolder() === folderPath) stopWatching()
  deleteFolderById(id); invalidateStatsCache(id); return true
})

// 收藏图片
ipcMain.handle('favorite-image', async (_event, sourcePath: string) => {
  updateFavorite(sourcePath, 1); return sourcePath
})

// 文件夹归类色
ipcMain.handle('update-folder-color', (_event, folderId: number, color: string) => {
  updateFolderColor(folderId, color); return true
})

// 更新文件夹封面图
ipcMain.handle('update-folder-cover', (_event, folderId: number, coverPath: string) => {
  updateFolderCover(folderId, coverPath); invalidateStatsCache(folderId); return true
})

// 切换文件夹收藏
ipcMain.handle('toggle-folder-favorite', (_event, folderId: number, val: number) => {
  updateFolderFavorite(folderId, val); return true
})

// 文件夹统计（图片数、总大小、封面图）
let _statsWorkerPath = ''
async function _ensureStatsWorkerPath(): Promise<string> {
  if (_statsWorkerPath && require('fs').existsSync(_statsWorkerPath)) return _statsWorkerPath
  const pth = await import('path'); const os = await import('os')
  const content = `const fs = require('fs')\nconst path = require('path')\nconst { parentPort, workerData } = require('worker_threads')\nconst exts = new Set(['.jpg','.jpeg','.png','.gif','.bmp','.webp','.tiff','.tif','.avif','.svg','.psd','.heic','.heif','.mp4','.webm','.mov','.mkv','.avi','.flv','.f4v'])\nconst deadline = Date.now() + 8000\nlet aborted = false\nconst allFiles = []\nlet realCount = 0, totalSize = 0\n// BFS: queue instead of recursion - shallow multi-dir scan first\nconst queue = [workerData.dir]\nwhile (queue.length > 0) {\n  if (Date.now() > deadline) { aborted = true; break }\n  const dir = queue.shift()\n  let items\n  try { items = fs.readdirSync(dir, { withFileTypes: true }) } catch { continue }\n  for (const entry of items) {\n    if (Date.now() > deadline) { aborted = true; break }\n    if (entry.isDirectory()) { queue.push(path.join(dir, entry.name)); continue }\n    if (entry.isFile() && exts.has(path.extname(entry.name).toLowerCase())) {\n      let st\n      try { st = fs.statSync(path.join(dir, entry.name)) } catch { continue }\n      realCount++; totalSize += st.size\n      if (realCount <= 5000) { allFiles.push({ path: path.join(dir, entry.name), time: st.mtimeMs, size: st.size }) }\n      if (realCount >= 5000) { aborted = true; break }\n    }\n  }\n}\n// 超时或达到上限时，用已扫到的图片作为结果\nallFiles.sort((a, b) => b.time - a.time)\nconst latest = allFiles.length > 0 ? allFiles[0] : null\nconst recent = allFiles.filter(f => !latest || f.path !== latest.path).slice(0, 3)\n// 即使 aborted 且 allFiles 为空，也发回已有数据\nif (aborted && allFiles.length === 0) {\n  // 没扫到任何图，尝试用一个非空 fallback\n  parentPort.postMessage({ aborted, realCount: realCount || 0, totalSize, latestPath: null, recentPaths: [], countCapped: true })\n} else {\n  parentPort.postMessage({ aborted, realCount, totalSize, latestPath: latest ? latest.path : null, recentPaths: recent.map(f => f.path), countCapped: aborted })\n}\n`
  const candidates = [pth.join(__dirname, 'stats-worker.cjs'), pth.join(os.tmpdir(), 'picrand-stats-worker.cjs')]
  for (const c of candidates) { try { const _fsw = require('fs'); _fsw.writeFileSync(c, content); _statsWorkerPath = c; return c } catch {} }
  return _statsWorkerPath
}
async function _walkFolderWorker(dir: string): Promise<{ realCount: number; totalSize: number; latestPath: string | null; recentPaths: string[]; countCapped: boolean } | null> {
  try {
    const { Worker } = await import('worker_threads')
    const wp = await _ensureStatsWorkerPath()
    if (!wp || !require('fs').existsSync(wp)) return null
    return new Promise((resolve) => {
      let done = false
      const finish = (v: any) => { if (done) return; done = true; try { worker.terminate() } catch {}; clearTimeout(timer); resolve(v) }
      const worker = new Worker(wp, { workerData: { dir } })
      const timer = setTimeout(() => finish(null), 9000)
      worker.once('message', (r: any) => finish(r))
      worker.once('error', () => finish(null))
    })
  } catch { return null }
}

const _statsCache = new Map<number, any>()
function invalidateStatsCache(folderId?: number) { if (folderId != null) _statsCache.delete(folderId); else _statsCache.clear() }

async function _buildFolderStatsImpl(folderId: number) {
  const stats = getFolderStats(folderId)
  const stored = getFolderStoredCover(folderId)
  const resolvedStored = stored ? resolveStoredPath(stored) : ''
  if (resolvedStored && existsSync(resolvedStored)) {
    stats.latestPath = resolvedStored
    stats.latestThumb = discoverThumbnailPath(resolvedStored) || ''
  }

  if (stats.count === 0 || stats.recentPaths.length === 0 || !stats.latestPath) {
    const row = getDb().prepare('SELECT path FROM folders WHERE id = ?').get(folderId) as { path: string } | undefined
    const resolvedPath = row?.path ? resolveStoredPath(row.path) : ''
    if (resolvedPath && existsSync(resolvedPath)) {
      try {
        const wresult = await _walkFolderWorker(resolvedPath)
        if (wresult) {
          if (wresult.realCount > 0) {
            stats.count = wresult.realCount; stats.totalSize = wresult.totalSize
            (stats as any).countCapped = !!(wresult as any).countCapped
          }
          // 即使超时只扫到少量图片，也用作封面
          const coverCandidate = wresult.latestPath || (wresult.recentPaths && wresult.recentPaths.length > 0 ? wresult.recentPaths[0] : null)
          if (coverCandidate && (!stats.latestPath || !existsSync(stats.latestPath))) {
            stats.latestPath = coverCandidate
            stats.latestThumb = discoverThumbnailPath(coverCandidate) || ''
            updateFolderCover(folderId, coverCandidate)
          }
          if (wresult.recentPaths && wresult.recentPaths.length > 0) {
            stats.recentPaths = wresult.recentPaths.map((p: string) => ({
              file_path: p, thumbnail_path: discoverThumbnailPath(p) || null,
            }))
          }
        }
      } catch (e) { console.error('[get-folder-stats] walk failed:', e) }
    }
  }

  for (const rp of stats.recentPaths) {
    if (!rp.thumbnail_path) rp.thumbnail_path = discoverThumbnailPath(rp.file_path) || null
  }
  return stats
}

ipcMain.handle('get-folder-stats', async (_event, folderId: number) => {
  return buildFolderStats(folderId)
})

async function buildFolderStats(folderId: number) {
  const cached = _statsCache.get(folderId)
  if (cached) return cached
  const result = await _buildFolderStatsImpl(folderId)
  if (result && result.count > 0) _statsCache.set(folderId, result)
  return result
}

ipcMain.handle('get-all-folder-stats', async () => {
  const folders = getAllFolders()
  const result: Record<number, any> = {}
  await Promise.all(folders.map(async (f) => {
    try { result[f.id] = await buildFolderStats(f.id) } catch {}
  }))
  return result
})

// 开始界面 dashboard 的轻量统计：只点查 folders 缓存列 + 全局收藏计数，
// 不读任何 BLOB、不跑 SUM 全扫。10万+ 库下从"冻结数秒"降到点查即出。
// 仅返回数字；封面/最近图等由 get-all-folder-stats 按需补。
ipcMain.handle('get-dashboard-stats', async () => {
  const folders = getAllFolders()
  const result: Record<number, { count: number; totalSize: number }> = {}
  for (const f of folders) {
    const s = getFolderCachedStats(f.id)
    result[f.id] = { count: s.image_count, totalSize: s.total_size }
  }
  return { folderStats: result, favoritesCount: getFavoritesCount() }
})

// FolderSelector 网格模式：一次 IPC 拿所有文件夹的统计+封面+随机缩略图。
// 旧方案每个文件夹 2 次 IPC（getFolderStats + getFolderRandomThumbs），20 个 = 40 次往返，
// 且 picrand:// 协议对每张封面/缩略图触发 ensureQuickThumb 即时解码，主进程 I/O 与 UI 互斥。
// 新方案：主进程侧一次性组装好 picrand:// URL 返回，不走 image protocol 即时解码；优先
// 走 DB 缓存列 + 索引查 latest/recent（毫秒级），仅 0 数据空文件夹降级到 _walkFolderWorker。
ipcMain.handle('get-all-folder-grid-data', async () => {
  const folders = getAllFolders()
  const result: Record<number, {
    count: number; countCapped: boolean; totalSize: number
    coverUrl: string; thumbUrls: string[]
  }> = {}
  for (const f of folders) {
    try {
      const fid = f.id
      const stats = getFolderStats(fid) // DB 点查 + 索引查 latest/recent，毫秒级
      if (stats.count === 0 || !stats.latestPath) {
        // 真的空文件夹：一次 _walkFolderWorker 补齐数据（会更新 DB 缓存列和封面）
        try {
          const row = getDb().prepare('SELECT path FROM folders WHERE id = ?').get(fid) as { path: string } | undefined
          const resolvedPath = row?.path ? resolveStoredPath(row.path) : ''
          if (resolvedPath && existsSync(resolvedPath)) {
            const wres = await _walkFolderWorker(resolvedPath)
            if (wres && wres.latestPath) {
              stats.latestPath = wres.latestPath
              stats.recentPaths = (wres.recentPaths || []).slice(0, 3).map((p: string) => ({ file_path: p, thumbnail_path: null }))
              if (wres.realCount > 0) { stats.count = wres.realCount; stats.totalSize = wres.totalSize }
              updateFolderCover(fid, wres.latestPath) // 持久化封面
              _statsCache.set(fid, stats) // 写缓存
            }
          }
        } catch {}
      }
      // 优先使用用户手动设置的封面（cover_path），与 buildFolderStats 保持一致；
      // 否则卡片模式总是按 modify_time 取最新图，手动换封面后关窗重开会显示旧封面。
      const storedCover = getFolderStoredCover(fid)
      const resolvedStoredCover = storedCover ? resolveStoredPath(storedCover) : ''
      if (resolvedStoredCover && existsSync(resolvedStoredCover)) {
        stats.latestPath = resolvedStoredCover
        stats.latestThumb = discoverThumbnailPath(resolvedStoredCover) || ''
      }
      // 组装 URL：主进程直接拼 picrand://，不依赖渲染层小并发逐条请求协议解码
      const toUrl = (p: string, thumb: string | null) => {
        const orig = encodeURIComponent(p)
        const t = thumb ? `&thumb=${encodeURIComponent(thumb)}` : ''
        return `picrand://get-image?orig=${orig}${t}`
      }
      const coverUrl = stats.latestPath ? toUrl(stats.latestPath, stats.latestThumb || discoverThumbnailPath(stats.latestPath) || null) : ''
      const thumbUrls: string[] = []
      for (const rp of (stats.recentPaths || []).slice(0, 3)) {
        const tp = rp.thumbnail_path || discoverThumbnailPath(rp.file_path) || null
        thumbUrls.push(toUrl(rp.file_path, tp))
      }
      result[fid] = {
        count: stats.count, countCapped: !!(stats as any).countCapped, totalSize: stats.totalSize,
        coverUrl, thumbUrls,
      }
    } catch {}
  }
  return result
})

ipcMain.handle('preload-folder-stats', async () => {
  const folders = getAllFolders()
  await Promise.all(folders.map(async (f) => {
    try { await buildFolderStats(f.id) } catch {}
  }))
  return true
})

ipcMain.handle('select-cover-image', async (_event, folderPath: string) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['jpg','jpeg','png','bmp','webp','gif','tiff','tif','avif','svg','mp4','webm','mov','mkv','avi','flv','f4v'] }],
    defaultPath: existsSync(folderPath) ? folderPath : undefined,
  })
  if (result.canceled || !result.filePaths[0]) return null
  return result.filePaths[0]
})

// 取消收藏
ipcMain.handle('unfavorite-image', async (_event, sourcePath: string) => {
  updateFavorite(sourcePath, 0); return true
})

ipcMain.handle('set-image-rating', async (_event, filePath: string, rating: number) => {
  updateRating(filePath, rating); return true
})

ipcMain.handle('set-image-description', async (_event, filePath: string, desc: string) => {
  updateDescription(filePath, desc); return true
})

ipcMain.handle('clear-ratings-in-folder', async (_event, folderPath: string) => {
  const folderId = getOrCreateFolder(folderPath)
  return { cleared: clearRatingsInFolder(folderId) }
})

ipcMain.handle('clear-descriptions-in-folder', async (_event, folderPath: string) => {
  const folderId = getOrCreateFolder(folderPath)
  return { cleared: clearDescriptionsInFolder(folderId) }
})

ipcMain.handle('load-favorites', async () => {
  const favs = getFavoriteImages().map((img: any) => ({ ...img, is_favorite: 1 }))
  // 补读尺寸，防止收藏夹中显示为正方形
  try {
    for (const img of favs) {
      if (!img.width || !img.height) {
        try { const d = await readImageDimensions(img.file_path); if (d) { img.width = d.width; img.height = d.height; updateImageDimensions(img.file_path, d.width, d.height) } } catch {}
      }
    }
  } catch {}
  return favs
})

// 仅返回收藏总数，不解 BLOB。dashboard 只需要数字，idx_images_favorite 让点查即出。
ipcMain.handle('get-favorites-count', async () => {
  return getFavoritesCount()
})

ipcMain.handle('save-as', async (_event, sourcePath: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, { defaultPath: basename(sourcePath) })
  if (!result.canceled && result.filePath) { const fs = await import('fs-extra'); await fs.copy(sourcePath, result.filePath) }
  return !result.canceled
})

  ipcMain.handle('save-as-batch', async (_event, sourcePaths: string[], destFolder: string) => {
    const fse = await import('fs-extra');
    let copied = 0;
    for (const sp of sourcePaths) {
      try {
        const dest = join(destFolder, basename(sp));
        await fse.copy(sp, dest);
        copied++;
      } catch (e) { console.error('[save-as-batch] copy failed:', sp, e); }
    }
    return { success: true, count: copied, total: sourcePaths.length };
  })

ipcMain.handle('delete-image', async (_event, filePath: string) => {
  // 文件可能已被外部删除（trash 失败 + unlinkSync ENOENT 之前会让 handler 抛错，导致 DB row 残留）。
  // 先尝试移回收站；失败再尝试永久删除；文件不存在不阻断 DB 清理。
  // 注意：trash 默认走 globby 处理路径，含特殊字符或某些打包环境下 globby 可能静默返回空 → 啥都没删。
  // 传 { glob: false } 绕开 globby，直接 lstat + SHFileOperation，最可靠。
  let fileRemoved = false
  try { const trash = await import('trash'); await trash.default([filePath], { glob: false }); fileRemoved = true }
  catch {
    try { unlinkSync(filePath); fileRemoved = true } catch {}
  }
  deleteImageByPath(filePath) // 无条件删 DB 记录（即使文件已不存在）
  // 推送 sync-db unlink 让渲染层主动从瀑布池移除（前端右键删除路径不主动 removeImageByPath）
  try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('sync-db', { type: 'unlink', path: filePath }) } catch {}
  return { success: true, fileRemoved }
})

ipcMain.handle('open-in-folder', (_event, filePath: string) => { shell.showItemInFolder(filePath) })

ipcMain.handle('open-with-default', (_event, filePath: string) => {
  return shell.openPath(filePath)
})

// 搜图公共逻辑：图片写入剪贴板 → 打开浏览器 → 用户 Ctrl+V
async function _clipboardSearch(filePath: string, url: string): Promise<boolean> {
  try {
    let clipPath = filePath
    const ext = extname(filePath).toLowerCase()
    if (ext === '.psd') clipPath = await ensurePsdPng(filePath)
    else if (isVideoExt(ext)) {
      // 取原分辨率无损首帧 PNG（搜图站点会再压缩，PNG 进 sharp 转换链质量更稳）
      const png = getPosterPngPath(filePath)
      if (existsSync(png)) clipPath = png
      else { const p = await getOrGeneratePoster(filePath); clipPath = (p && existsSync(getPosterPngPath(filePath))) ? getPosterPngPath(filePath) : p }
      if (!clipPath) return false
    }
    if (!new Set(['.jpg','.jpeg','.png','.bmp']).has(ext)) {
      const sharp = (await import('sharp')).default
      const jpgPath = join(cacheDir, 'search-' + createHash('md5').update(filePath).digest('hex') + '.jpg')
      if (!existsSync(jpgPath)) await sharp(clipPath).resize({ width: 1920, withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(jpgPath)
      clipPath = jpgPath
    }
    const { nativeImage, clipboard } = await import('electron')
    const img = nativeImage.createFromPath(clipPath)
    if (!img.isEmpty()) clipboard.writeImage(img)
    shell.openExternal(url)
    return true
  } catch { return false }
}

ipcMain.handle('yandex-search',     (_e, fp: string) => _clipboardSearch(fp, 'https://yandex.com/images/'))
ipcMain.handle('saucenao-search',   (_e, fp: string) => _clipboardSearch(fp, 'https://saucenao.com/'))
ipcMain.handle('tineye-search',     (_e, fp: string) => _clipboardSearch(fp, 'https://tineye.com/'))
ipcMain.handle('tracemoe-search',   (_e, fp: string) => _clipboardSearch(fp, 'https://trace.moe/'))
ipcMain.handle('googlelens-search', (_e, fp: string) => _clipboardSearch(fp, 'https://lens.google.com/'))

// 拖入/粘贴图片文件 → 写入 DB + 推送画廊，不依赖 chokidar 异步检测
	ipcMain.handle('import-images-to-folder', async (_event, imgPaths: string[], destFolder: string) => {
	  const fse = await import('fs-extra')
	  const sharp = (await import('sharp')).default
	  let copied = 0
	  let firstDest = ''
	  for (const src of imgPaths) {
	    try {
	      const ext = extname(src)
	      const baseName = basename(src, ext)
	      const name = basename(src)
	      let dest = join(destFolder, name)
	      let i = 1
	      while (await fse.pathExists(dest)) {
	        dest = join(destFolder, `${baseName}(${i})${ext}`)
	        i++
	      }
	      await fse.copy(src, dest)
	      copied++
	      if (!firstDest) firstDest = dest

	      // 立即写入 DB 并推送 sync-db，不等待 chokidar
	      try {
	        const folderId = getOrCreateFolder(destFolder)
	        const stat = statSync(dest)
	        let imgWidth = 0, imgHeight = 0
	        try {
	          const d = await readImageDimensions(dest, sharp)
	          if (d) { imgWidth = d.width; imgHeight = d.height }
	          if (!imgWidth || !imgHeight) {
	            const { nativeImage: ni } = await import('electron')
	            const img = ni.createFromPath(dest)
	            if (!img.isEmpty()) { const s = img.getSize(); imgWidth = s.width; imgHeight = s.height }
	          }
	        } catch {}

	        // 立即生成缩略图（同步执行，保证粘贴后立即可见）
	        let thumbPath = ''
	        try {
	          const hashName = createHash('md5').update(dest).digest('hex') + ext
	          const outPath = join(cacheDir, hashName)
	          const destExt = ext.toLowerCase()
	          if (destExt === '.gif') {
	            if (!existsSync(outPath)) {
	              await sharp(dest, { animated: true }).resize({ width: 400, withoutEnlargement: true }).gif({ colours: 48, dither: 1 }).toFile(outPath)
	            }
	            thumbPath = outPath
	          } else {
	            const webpPath = outPath.replace(ext, '.webp')
	            if (!existsSync(webpPath)) {
	              await sharp(dest).resize({ width: 400, withoutEnlargement: true }).webp({ quality: 75 }).toFile(webpPath)
	            }
	            thumbPath = webpPath
	          }
	        } catch {}

	        insertImage(folderId, dest, basename(dest), stat.size, Math.floor(stat.mtimeMs / 1000), imgWidth, imgHeight, thumbPath)
	        if (isFormatAllowed(dest) && mainWindow && !mainWindow.isDestroyed()) {
	          mainWindow.webContents.send('sync-db', { type: 'add', image: { file_path: dest, file_name: basename(dest), file_size: stat.size, modify_time: Math.floor(stat.mtimeMs / 1000), thumbnail_path: thumbPath, width: imgWidth, height: imgHeight, is_favorite: 0 } })
	        }
	      } catch (e: any) {
	        console.error('[import-images] db insert failed:', basename(dest), e?.message || e)
	      }
	    } catch (e: any) {
	      console.error('[import-images] copy failed:', basename(src), e?.message || e)
	    }
	  }
	  return { ok: true, copied, firstFile: firstDest || null }
	})

ipcMain.handle('copy-image-to-clipboard', async (_event, filePath: string) => {
  try {
    let cp = filePath
    const ext = extname(filePath).toLowerCase()
    if (ext === '.psd') cp = await ensurePsdPng(filePath)
    else if (isVideoExt(ext)) {
      // 原分辨率无损首帧 PNG（剪贴板粘贴质量更佳）
      let png = getPosterPngPath(filePath)
      if (!existsSync(png)) { const p = await getOrGeneratePoster(filePath); png = (p && existsSync(getPosterPngPath(filePath))) ? getPosterPngPath(filePath) : p }
      cp = png
    }
    const { nativeImage, clipboard } = await import('electron')
    const img = nativeImage.createFromPath(cp)
    if (!img.isEmpty()) { clipboard.writeImage(img); return true }
    return false
  } catch { return false }
})

// 多选复制: CF_HDROP 写文件进剪贴板（资源管理器可粘贴）
ipcMain.handle('copy-files-to-clipboard', async (_event, filePaths: string[]) => {
  try {
    const valid = filePaths.filter(p => existsSync(p))
    if (!valid.length) return false
    const { execFileSync } = await import('child_process')
    // 用 PowerShell 直接调用 Windows.Forms 的 SetFileDropList（底层写 CF_HDROP）
    const lines = ['Add-Type -AssemblyName System.Windows.Forms',
      '$c=New-Object System.Collections.Specialized.StringCollection']
    for (const p of valid) lines.push(`$c.Add([System.IO.Path]::GetFullPath('${p.replace(/'/g, "''")}'))`)
    lines.push('[System.Windows.Forms.Clipboard]::SetFileDropList($c)')
    execFileSync('powershell', ['-STA', '-NoProfile', '-NonInteractive', '-Command', lines.join(';')], { timeout: 10000, windowsHide: true })
    return true
  } catch (e) { console.error('copy-files-to-clipboard:', e); return false }
})

// Ctrl+V 粘贴: 读 CF_HDROP 中的文件路径
	// PowerShell 输出用 Base64 回传：绕过 Windows Console 默认 GB2312 编码与 Node.js utf-8 解码不匹配
	// 导致中文路径变乱码 -> fs-extra.copy 找不到文件 -> copied=0 -> "已导入 0 张图片"
	ipcMain.handle('read-clipboard-files', async () => {
	  try {
	    const { execFileSync } = await import('child_process')
	    const script = `Add-Type -AssemblyName System.Windows.Forms
	$paths = try { [System.Windows.Forms.Clipboard]::GetFileDropList() } catch { $null }
	if ($paths -and $paths.Count -gt 0) { [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes(($paths -join "|"))) } else { '' }`
	    const out = execFileSync('powershell', ['-STA', '-NoProfile', '-NonInteractive', '-Command', script], { timeout: 5000, windowsHide: true, encoding: 'utf-8' })
	    const b64 = (out || '').trim()
	    if (!b64) return []
	    const text = Buffer.from(b64, 'base64').toString('utf-8')
	    return text.split('|')
	  } catch { return [] }
})

ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle("select-folders", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory", "multiSelections"] });
  return result.canceled ? [] : result.filePaths;
});
ipcMain.handle("select-image", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "图片", extensions: ["jpg", "jpeg", "png", "bmp", "webp", "tiff", "tif", "avif", "svg"] }]
  });
  return result.canceled ? null : result.filePaths[0];
});
// 背景图明暗分析：玻璃主题下据此切换深/浅两套玻璃配色
// 返回 'dark' | 'bright' | null（解码失败），阈值取感知亮度 128
ipcMain.handle("analyze-bg-brightness", async (_event, filePath: string) => {
  try {
    if (!filePath || !existsSync(filePath)) return null;
    const sharpMod = (await import("sharp"));
    const sharp = (sharpMod as any).default || sharpMod;
    const resolved = await resolveForSharp(filePath);
    const stats = await sharp(resolved).stats();
    const [r, g, b] = stats.channels.map((c: any) => c.mean as number);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luma >= 128 ? "bright" : "dark";
  } catch { return null }
});
ipcMain.handle("pinboards-read", () => readPinboards());
ipcMain.handle("pinboards-create", (_event, name) => {
  const trimmed = (name || "").trim();
  if (!trimmed) return { error: true, message: "名称不能为空" };
  const data = readPinboards();
  if (data.boards.some((b) => b.name === trimmed)) return { error: true, message: "名称已存在" };
  const board = { id: createPinboardId(), name: trimmed, createdAt: (/* @__PURE__ */ new Date()).toISOString(), images: [], hotkey: "" };
  data.boards.push(board);
  data.currentId = board.id;
  return writePinboards(data);
});
ipcMain.handle("pinboards-set-current", (_event, id) => {
  const data = readPinboards();
  if (id && data.boards.some((b) => b.id === id)) data.currentId = id;
  return writePinboards(data);
});
ipcMain.handle("pinboards-rename", (_event, id, name) => {
  const trimmed = (name || "").trim();
  if (!trimmed) return { error: true, message: "名称不能为空" };
  const data = readPinboards();
  const board = data.boards.find((b) => b.id === id);
  if (!board) return { error: true, message: "图钉板不存在" };
  if (data.boards.some((b) => b.id !== id && b.name === trimmed)) return { error: true, message: "名称已存在" };
  board.name = trimmed;
  return writePinboards(data);
});
ipcMain.handle("pinboards-set-hotkey", (_event, id, hotkey) => {
  const data = readPinboards();
  const board = data.boards.find((b) => b.id === id);
  if (!board) return { error: true, message: "图钉板不存在" };
  const key = (hotkey || "").trim();
  let displaced = null;
  if (key) {
    for (const b of data.boards) {
      if (b.id !== id && b.hotkey === key) {
        displaced = { name: b.name };
        b.hotkey = "";
      }
    }
  }
  board.hotkey = key;
  return { state: writePinboards(data), displaced };
});
ipcMain.handle("pinboards-delete", (_event, id) => {
  const data = readPinboards();
  data.boards = data.boards.filter((b) => b.id !== id);
  if (data.currentId === id) data.currentId = data.boards[0]?.id || null;
  return writePinboards(data);
});
ipcMain.handle("pinboards-clear", (_event, id) => {
  const data = readPinboards();
  const board = getPinboardOrThrow(data, id);
  board.images = [];
  return writePinboards(data);
});
ipcMain.handle("pinboards-add-image", (_event, id, imagePath) => {
  const data = readPinboards();
  const board = getPinboardOrThrow(data, id);
  if (!board.images.some((i) => i.path === imagePath)) {
    board.images.push({ path: imagePath, addedAt: (/* @__PURE__ */ new Date()).toISOString() });
  }
  return writePinboards(data);
});
ipcMain.handle("pinboards-reorder", (_event, orderedIds) => {
  const data = readPinboards();
  const idSet = new Map(data.boards.map((b) => [b.id, b]));
  const next = [];
  for (const id of orderedIds || []) {
    const b = idSet.get(id);
    if (b) {
      next.push(b);
      idSet.delete(b.id);
    }
  }
  for (const b of idSet.values()) next.push(b);
  data.boards = next;
  return writePinboards(data);
});
ipcMain.handle("pinboards-remove-image", (_event, id, imagePath) => {
  const data = readPinboards();
  const board = getPinboardOrThrow(data, id);
  board.images = board.images.filter((i) => i.path !== imagePath);
  return writePinboards(data);
});
ipcMain.handle("pinboards-export", async (_event, id) => {
  const data = readPinboards();
  const board = getPinboardOrThrow(data, id);
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory", "createDirectory"] });
  if (result.canceled || !result.filePaths[0]) return { canceled: true, count: 0, folderPath: "" };
  const folderPath = result.filePaths[0];
  let count = 0;
  for (const item of board.images) {
    try {
      await copyFileUnique(item.path, folderPath);
      count++;
    } catch (err) {
      logError(`[pinboard-export] ${item.path} - ${err}`);
    }
  }
  return { canceled: false, count, folderPath };
});
ipcMain.handle("pinboards-export-to-folder", async (_event, id, folderPath) => {
  const data = readPinboards();
  const board = getPinboardOrThrow(data, id);
  let count = 0;
  for (const item of board.images) {
    try {
      await copyFileUnique(item.path, folderPath);
      count++;
    } catch (err) {
      logError(`[pinboard-export] ${item.path} - ${err}`);
    }
  }
  return { count, folderPath };
});
ipcMain.handle("pinboards-has-nonempty", () => {
  const state = readPinboards();
  return state.boards.some((b) => b.images && b.images.length > 0);
});
ipcMain.handle("pinboards-clear-all", () => {
  try {
    writePinboards({ currentId: null, boards: [] });
    return true;
  } catch {
    return false;
  }
});
ipcMain.handle("start-watcher", async (_event, folderPath) => {
  if (!mainWindow) return;
  startWatching(
    folderPath,
    mainWindow,
    async (filePath) => {
      const fsMod = await import("fs");
      const stat = fsMod.statSync(filePath);
      const folderId = getOrCreateFolder(folderPath);
      let thumbPath = "", imgWidth = 0, imgHeight = 0;
      try {
        const sharp = (await import("sharp")).default;
        const ext = path.extname(filePath).toLowerCase();
        const hashName = crypto.createHash("md5").update(filePath).digest("hex") + ext;
        const outputPath = path.join(cacheDir, hashName);
        const fse = await import("fs-extra");
        try {
          const d = await readImageDimensions(filePath, sharp);
          if (d) {
            imgWidth = d.width;
            imgHeight = d.height;
          }
          if (!imgWidth || !imgHeight) {
            const { nativeImage: nativeImage2 } = await import("electron");
            const ni = nativeImage2.createFromPath(filePath);
            if (!ni.isEmpty()) {
              const s = ni.getSize();
              imgWidth = s.width;
              imgHeight = s.height;
            }
          }
        } catch {
        }
        if (await fse.pathExists(outputPath)) {
          thumbPath = outputPath;
        } else if (ext === ".gif") {
          try {
            await sharp(filePath, { animated: true }).resize({ width: 400, withoutEnlargement: true }).gif({ colours: 48, dither: 1 }).toFile(outputPath);
            thumbPath = outputPath;
          } catch (e) {
            console.error("[watcher] sharp gif failed, trying fallback:", path.basename(filePath), e?.message || e);
            logError(`[watcher-gif] ${path.basename(filePath)} - sharp failed: ${e?.message || e}`);
            const { nativeImage: nativeImage2 } = await import("electron");
            const img = nativeImage2.createFromPath(filePath);
            if (!img.isEmpty()) {
              if (!imgWidth) {
                const size = img.getSize();
                imgWidth = size.width;
                imgHeight = size.height;
              }
              const buf = img.resize({ width: 400 }).toJPEG(75);
              await fse.writeFile(outputPath, buf);
              thumbPath = outputPath;
            } else {
              logError(`[watcher-gif] ${path.basename(filePath)} - fallback also failed (isEmpty)`);
            }
          }
        } else if (ext === ".psd") {
          const webpPath = outputPath.replace(ext, ".webp");
          if (await fse.pathExists(webpPath)) {
            thumbPath = webpPath;
          } else {
            try {
              const pngPath = await ensurePsdPng(filePath);
              await sharp(pngPath).resize({ width: 400, withoutEnlargement: true }).webp({ quality: 75 }).toFile(webpPath);
              thumbPath = webpPath;
            } catch (e) {
              logError(`[watcher-psd] ${path.basename(filePath)} - convert failed: ${e?.message || e}`);
            }
          }
        } else if (isVideoExt(ext)) {
          const webpPath = outputPath.replace(ext, ".webp");
          if (await fse.pathExists(webpPath)) {
            thumbPath = webpPath;
          } else {
            try {
              const poster = await getOrGeneratePoster(filePath);
              if (poster) thumbPath = poster;
            } catch (e) {
              logError(`[watcher-video] ${path.basename(filePath)} - ${e?.message || e}`);
            }
          }
          if (!imgWidth || !imgHeight) {
            try {
              const d = await readVideoDimensions(filePath);
              if (d) {
                imgWidth = d.width;
                imgHeight = d.height;
              }
            } catch {
            }
          }
        } else {
          const webpPath = outputPath.replace(ext, ".webp");
          if (await fse.pathExists(webpPath)) {
            thumbPath = webpPath;
          } else {
            try {
              await sharp(filePath).resize({ width: 400, withoutEnlargement: true }).webp({ quality: 75 }).toFile(webpPath);
              thumbPath = webpPath;
            } catch (e) {
              console.error("[watcher] sharp failed, trying fallback:", path.basename(filePath), e?.message || e);
              logError(`[watcher-webp] ${path.basename(filePath)} - sharp failed: ${e?.message || e}`);
              const { nativeImage: nativeImage2 } = await import("electron");
              const img = nativeImage2.createFromPath(filePath);
              if (!img.isEmpty()) {
                if (!imgWidth) {
                  const size = img.getSize();
                  imgWidth = size.width;
                  imgHeight = size.height;
                }
                const jpgPath = webpPath.replace(/\.webp$/, ".jpg");
                const buf = img.resize({ width: 400 }).toJPEG(75);
                await fse.writeFile(jpgPath, buf);
                thumbPath = jpgPath;
              } else {
                logError(`[watcher-webp] ${path.basename(filePath)} - fallback also failed (isEmpty)`);
              }
            }
          }
        }
      } catch {
      }
      insertImage(folderId, filePath, path.basename(filePath), stat.size, Math.floor(stat.mtimeMs / 1e3), imgWidth, imgHeight, thumbPath);
      if (isFormatAllowed(filePath) && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("sync-db", { type: "add", image: { file_path: filePath, file_name: path.basename(filePath), file_size: stat.size, modify_time: Math.floor(stat.mtimeMs / 1e3), thumbnail_path: thumbPath, width: imgWidth, height: imgHeight, is_favorite: 0 } });
    },
    (filePath) => {
      deleteImageByPath(filePath);
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("sync-db", { type: "unlink", path: filePath });
    }
  );
});
ipcMain.handle("stop-watcher", () => {
  stopWatching();
});
ipcMain.handle("recompute-sort-order", async (_event, folderId, sortMode, forceShuffle, hueOrigin) => {
  if ((sortMode === "dim-asc" || sortMode === "dim-desc") && pendingDimReads.has(folderId)) {
    await pendingDimReads.get(folderId);
  }
  recomputeSortOrder(folderId, sortMode, forceShuffle, hueOrigin ?? 0);
});
ipcMain.handle("get-random-seed", (_event, folderId) => {
  return getFolderRandomSeed(folderId);
});
ipcMain.handle("set-random-seed", (_event, folderId, seed) => {
  setFolderRandomSeed(folderId, seed);
});
ipcMain.on("confirm-close-response", (_event, confirmed) => {
  if (confirmed) {
    allowClose = true;
    mainWindow?.close();
  }
});
ipcMain.on("window-minimize", () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});
ipcMain.on("window-maximize", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on("window-close", () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});
ipcMain.handle("window-is-maximized", () => mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false);
ipcMain.handle("window-is-always-on-top", () => mainWindow && !mainWindow.isDestroyed() ? mainWindow.isAlwaysOnTop() : false);
ipcMain.on("window-toggle-always-on-top", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const next = !mainWindow.isAlwaysOnTop();
  if (next) {
    // 使用最高可用层级，尽量排到其它 topmost 窗口之前
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  } else {
    mainWindow.setAlwaysOnTop(false);
  }
});
async function splitGifFrames(gifPath, id) {
  try {
    ;
    const tmpRoot = path.join(os.tmpdir(), "picrand-frames", id);
    if (fs.existsSync(tmpRoot)) {
      try {
        const rm = (await import("fs-extra")).remove;
        await rm(tmpRoot);
      } catch {
      }
    }
    fs.mkdirSync(tmpRoot, { recursive: true });
    const buf = fs.readFileSync(gifPath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const { parseGIF, decompressFrames } = require("gifuct-js");
    const parsed = parseGIF(ab);
    const all = decompressFrames(parsed, true);
    if (!all || all.length === 0) return null;
    const W = parsed.lsd.width, H = parsed.lsd.height;
    const sharpMod = (await import("sharp")).default;
    const delays = [];
    let comp = new Uint8Array(W * H * 4);
    let snap = null;
    const clearRect = (b, w, d) => {
      for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) {
        const di = ((d.top + y) * w + (d.left + x)) * 4;
        b[di] = b[di + 1] = b[di + 2] = b[di + 3] = 0;
      }
    };
    const putPatch = (b, w, patch, d) => {
      for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) {
        const si = (y * d.width + x) * 4, di = ((d.top + y) * w + (d.left + x)) * 4;
        const a = patch[si + 3];
        if (a > 0) {
          b[di] = patch[si];
          b[di + 1] = patch[si + 1];
          b[di + 2] = patch[si + 2];
          b[di + 3] = a;
        }
      }
    };
    const framePaths = [];
    for (let k = 0; k < all.length; k++) {
      const f = all[k];
      if (k > 0) {
        const pv = all[k - 1];
        if (pv.disposalType === 2) clearRect(comp, W, pv.dims);
        else if (pv.disposalType === 3 && snap) comp.set(snap);
      }
      if (f.disposalType === 3) snap = new Uint8Array(comp);
      putPatch(comp, W, f.patch, f.dims);
      const pngPath = path.join(tmpRoot, k + ".png");
      await sharpMod(Buffer.from(comp.buffer, comp.byteOffset, comp.byteLength), { raw: { width: W, height: H, channels: 4 } }).png().toFile(pngPath);
      framePaths.push(pngPath);
      delays.push(Math.max(20, f.delay || 100));
    }
    const enc = new TextEncoder();
    const pathBufs = framePaths.map((p) => enc.encode(p));
    let bodyLen = 4 + 4 + delays.length * 4;
    for (const b of pathBufs) bodyLen += 4 + b.length;
    const out = Buffer.alloc(bodyLen);
    let o = 0;
    out.write("GIF1", o, 4, "latin1");
    o += 4;
    out.writeInt32LE(framePaths.length, o);
    o += 4;
    for (const d of delays) {
      out.writeInt32LE(d, o);
      o += 4;
    }
    for (const b of pathBufs) {
      out.writeInt32LE(b.length, o);
      o += 4;
      bopy(Buffer.from(b.buffer, b.byteOffset, b.byteLength), out, o);
      o += b.length;
    }
    const manifestPath = path.join(tmpRoot, "manifest.bin");
    fs.writeFileSync(manifestPath, out);
    return { manifestPath };
  } catch (e) {
    console.error("[RefBoard] splitGifFrames failed:", e);
    return null;
  }
}
function bopy(src, dst, offset) {
  for (let i = 0; i < src.length; i++) dst[offset + i] = src[i];
}
let _refCascadeIdx = 0;
function computeCascadePos() {
  try {
    const wa = screen.getPrimaryDisplay().workArea;
    const step = 32, tileW = 300, tileH = 220;
    const centerX = wa.x + Math.round((wa.width - tileW) / 2);
    const centerY = wa.y + Math.round((wa.height - tileH) / 2);
    const x = centerX + _refCascadeIdx * step;
    const y = centerY + _refCascadeIdx * step;
    if (x + tileW > wa.x + wa.width || y + tileH > wa.y + wa.height) {
      _refCascadeIdx = 1;
      return [centerX, centerY];
    }
    _refCascadeIdx++;
    return [x, y];
  } catch {
    return [-1, -1];
  }
}
async function createRefWin(_id, filePath, posX = -1, posY = -1) {
  const posArgs = posX >= 0 && posY >= 0 ? ["--x", String(posX), "--y", String(posY)] : [];
  try {
    const fse = await import("fs-extra");
    if (!await fse.pathExists(filePath)) {
      _logTray("createRefWin: FILE NOT FOUND: " + filePath);
      throw new Error("File not found: " + filePath);
    }
    _logTray("createRefWin: file exists, ext=" + path.extname(filePath).toLowerCase());
    if (path.extname(filePath).toLowerCase() === ".gif") {
      const res = await splitGifFrames(filePath, _id);
      if (res) {
        const appPath2 = app.getAppPath();
        const candidates2 = [
          path.join(appPath2, "refboard", "RefBoardHost.exe"),
          path.join(appPath2, "resources", "refboard", "RefBoardHost.exe"),
          path.join(exeDir, "refboard", "RefBoardHost.exe"),
          path.join(exeDir, "resources", "refboard", "RefBoardHost.exe"),
          path.join(exeDir, "resources", "app", "refboard", "RefBoardHost.exe")
        ];
        const hostPath2 = candidates2.find((p) => fs.existsSync(p));
        if (!hostPath2) throw new Error("Reference board host is not bundled yet");
        const { spawn: spawn2 } = await import("child_process");
        const child2 = spawn2(hostPath2, ["--manifest", res.manifestPath, "--locale", currentLocale, ...posArgs], {
          detached: true,
          stdio: "ignore",
          windowsHide: true
        });
        if (child2.pid) {
          _refBoardPids.add(child2.pid);
          child2.on("exit", () => {
            _refBoardPids.delete(child2.pid);
            _logTray("pid " + child2.pid + " exited (manifest)");
          });
          _logTray("tracked pid " + child2.pid + " (GIF manifest) total=" + _refBoardPids.size);
        }
        child2.unref();
        return;
      }
    }
    let refPath = filePath;
    if (isVideoExt(path.extname(refPath).toLowerCase())) {
      let png = getPosterPngPath(refPath);
      if (!fs.existsSync(png)) {
        const p = await getOrGeneratePoster(refPath);
        png = p ? getPosterPngPath(refPath) : "";
      }
      refPath = png && fs.existsSync(png) ? png : getPosterPath(refPath);
    } else if (path.extname(refPath).toLowerCase() === ".psd") {
      refPath = await resolveForSharp(refPath);
    }
    const WIC_UNSUPPORTED = /* @__PURE__ */ new Set([".webp", ".avif", ".svg", ".heic", ".heif"]);
    const srcExt = path.extname(refPath).toLowerCase();
    if (WIC_UNSUPPORTED.has(srcExt)) {
      try {
        const cacheName = "refboard-" + crypto.createHash("md5").update(refPath).digest("hex") + ".png";
        const pngPath = path.join(cacheDir, cacheName);
        if (!fs.existsSync(pngPath)) {
          const sharpMod = (await import("sharp")).default;
          if (srcExt === ".svg") {
            await sharpMod(refPath, { density: 144 }).resize({ width: 2e3, withoutEnlargement: true }).png().toFile(pngPath);
          } else {
            await sharpMod(refPath).png().toFile(pngPath);
          }
        }
        refPath = pngPath;
      } catch (e) {
        console.error("[RefBoard] WIC-unsupported format conversion failed:", e);
      }
    }
    const refExt = path.extname(refPath).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(refExt)) {
      try {
        const refStat = fs.statSync(refPath);
        let needScale = refStat.size > 2 * 1024 * 1024;
        if (!needScale) {
          try {
            const refMeta = await (await import("sharp")).default(refPath).metadata();
            needScale = (refMeta.width || 0) > 2e3 || (refMeta.height || 0) > 2e3 || (refMeta.width || 0) * (refMeta.height || 0) > 4e6;
          } catch {
          }
        }
        if (needScale) {
          const tmpDir = path.join(dataDir, "tmp_refboard");
          if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
          const tmpPath = path.join(tmpDir, _id + ".jpg");
          const sharpMod = (await import("sharp")).default;
          await sharpMod(refPath).resize({ width: 1500, withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(tmpPath);
          refPath = tmpPath;
        }
      } catch (e) {
        console.error("[RefBoard] Pre-scale failed:", e);
      }
    }
    const appPath = app.getAppPath();
    const candidates = [
      path.join(appPath, "refboard", "RefBoardHost.exe"),
      path.join(appPath, "resources", "refboard", "RefBoardHost.exe"),
      path.join(exeDir, "refboard", "RefBoardHost.exe"),
      path.join(exeDir, "resources", "refboard", "RefBoardHost.exe"),
      path.join(exeDir, "resources", "app", "refboard", "RefBoardHost.exe")
    ];
    const hostPath = candidates.find((p) => fs.existsSync(p));
    if (!hostPath) {
      _logTray("createRefWin: RefBoardHost.exe NOT FOUND in any candidate. appPath=" + appPath + " exeDir=" + exeDir);
      throw new Error("Reference board host is not bundled yet");
    }
    _logTray("createRefWin: hostPath=" + hostPath);
    const { spawn } = await import("child_process");
    const child = spawn(hostPath, ["--image", refPath, "--locale", currentLocale, ...posArgs], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    _logTray("createRefWin: spawned pid=" + child.pid + " args: --image " + refPath);
    child.on("error", (e) => { _logTray("createRefWin: spawn ERROR: " + (e?.message || String(e))); });
    if (child.pid) {
      _refBoardPids.add(child.pid);
      child.on("exit", (code) => {
        _refBoardPids.delete(child.pid);
        _logTray("pid " + child.pid + " exited code=" + code);
      });
      _logTray("tracked pid " + child.pid + " (image) total=" + _refBoardPids.size);
    }
    child.unref();
  } catch (error) {
    console.error("[RefBoard] Failed to create reference host:", error);
    throw error;
  }
}
ipcMain.handle("open-ref-board", async (_event, filePath) => {
  try {
    _logTray(">>> open-ref-board filePath=" + filePath);
    const [cx, cy] = computeCascadePos();
    await createRefWin(crypto.randomUUID(), filePath, cx, cy);
    _logTray("<<< open-ref-board OK");
    return { ok: true };
  } catch (error) {
    _logTray("!!! open-ref-board FAILED: " + (error?.message || String(error)));
    console.error("[IPC] open-ref-board failed:", error);
    return { ok: false, error: error.message || String(error) };
  }
});
ipcMain.handle("reset-ref-cascade", () => {
  _refCascadeIdx = 0;
});
const SHELL_MENU_KEY = "PicRandRefBoard";
const SHELL_MENU_EXTS = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "tiff", "tif", "ico", "heic", "heif", "avif", "svg"];
const SHELL_MENU_ROOT_FULL = `HKEY_CURRENT_USER\\Software\\Classes\\SystemFileAssociations`;
const SHELL_MENU_ROOT_SHORT = `HKCU\\Software\\Classes\\SystemFileAssociations`;
function resolveRefBoardHostPath() {
  const appPath = app.getAppPath();
  const candidates = [
    path.join(appPath, "refboard", "RefBoardHost.exe"),
    path.join(appPath, "resources", "refboard", "RefBoardHost.exe"),
    path.join(exeDir, "refboard", "RefBoardHost.exe"),
    path.join(exeDir, "resources", "refboard", "RefBoardHost.exe"),
    path.join(exeDir, "resources", "app", "refboard", "RefBoardHost.exe")
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}
function runReg(args) {
  return new Promise((resolve) => {
    import("child_process").then(({ spawn }) => {
      const p = spawn("reg", args, { windowsHide: true });
      let stderr = "";
      p.stderr.on("data", (d) => {
        stderr += d.toString("utf8");
      });
      p.on("error", () => resolve({ code: 1, stderr: "failed to spawn reg.exe" }));
      p.on("close", (code) => resolve({ code: code ?? 1, stderr }));
    }).catch(() => resolve({ code: 1, stderr: "child_process unavailable" }));
  });
}
function buildRegContent(lines) {
  return "\uFEFF" + [
    "Windows Registry Editor Version 5.00",
    "",
    ...lines,
    ""
  ].join("\r\n");
}
async function regImport(lines) {
  const os = await import("os");
  const tmpPath = path.join(os.tmpdir(), `picrand-shell-${Date.now()}-${Math.floor(Math.random() * 1e6)}.reg`);
  try {
    fs.writeFileSync(tmpPath, buildRegContent(lines), "utf16le");
    const r = await runReg(["import", tmpPath]);
    if (r.code !== 0) return { ok: false, error: r.stderr || `reg import exit ${r.code}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
    }
  }
}
ipcMain.handle("install-shell-menu", async () => {
  try {
    const hostPath = resolveRefBoardHostPath();
    if (!hostPath) return { ok: false, error: "RefBoardHost.exe not found" };
    const label = "新建参考板";
    const regEsc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const iconVal = regEsc(hostPath);
    const cmdVal = regEsc(`"${hostPath}" --image "%1"`);
    const lines = [];
    for (const ext of SHELL_MENU_EXTS) {
      const base = `${SHELL_MENU_ROOT_FULL}\\.${ext}\\shell\\${SHELL_MENU_KEY}`;
      lines.push(`[${base}]`, `@="${regEsc(label)}"`, `"Icon"="${iconVal}"`, `[${base}\\command]`, `@="${cmdVal}"`, "");
    }
    return await regImport(lines);
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});
ipcMain.handle("uninstall-shell-menu", async () => {
  try {
    let anyFail = null;
    for (const ext of SHELL_MENU_EXTS) {
      const basePath = `${SHELL_MENU_ROOT_SHORT}\\.${ext}\\shell\\${SHELL_MENU_KEY}`;
      const r = await runReg(["delete", basePath, "/f"]);
      if (r.code !== 0 && !/找不到|cannot find/i.test(r.stderr)) anyFail = r.stderr;
    }
    return anyFail ? { ok: false, error: anyFail } : { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});
ipcMain.handle("shell-menu-status", async () => {
  try {
    const basePath = `${SHELL_MENU_ROOT_SHORT}\\.jpg\\shell\\${SHELL_MENU_KEY}`;
    const { code } = await runReg(["query", basePath]);
    return { installed: code === 0 };
  } catch {
    return { installed: false };
  }
});
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  try {
    require("fs").appendFileSync(require("path").join(require("os").tmpdir(), "picrand-oversize-debug.log"), `[${(/* @__PURE__ */ new Date()).toISOString()}] second instance detected, exiting (old process is still running)
`);
  } catch {
  }
  app.exit(0);
}
app.on("second-instance", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showWindow();
  } else {
    createWindow()
  }
});
try {
  const { crashReporter } = require("electron");
  crashReporter.start({ productName: "PicRand", companyName: "PicRand", submitURL: "", uploadToServer: false });
} catch {
}
app.whenReady().then(async () => {
  ensureDataDirs();
  initDatabase(dataDir);
  registerPicRandProtocol();
  createWindow();
  createTray();
  // 启动时异步查询 Steam 授权状态；失败不阻塞窗口，界面据此决定是否显示购买入口
  void initSteamStatus();
  try {
    (await import("sharp")).default.cache({ memory: 10, files: 0, items: 5 });
  } catch {
  }
  console.log("[boot] sharp cache set: memory=10MB files=0 items=5");
  try {
    fs.appendFileSync(path.join(dataDir, "perf-probe.log"), `[boot] ${(/* @__PURE__ */ new Date()).toISOString()} exe=${app.getPath("exe")}
`);
  } catch {
  }
  {
    let _hbLast = Date.now();
    _hbInterval = setInterval(() => {
      const now = Date.now();
      const gap = now - _hbLast;
      _hbLast = now;
      if (gap > 800) {
        try {
          fs.appendFileSync(path.join(dataDir, "perf-probe.log"), `[heartbeat] gap=${gap}ms
`);
        } catch {
        }
      }
    }, 500);
  }
  _gcInterval = setInterval(() => {
    try {
      global.gc?.();
    } catch {
    }
  }, 3e4);
  // 内存探针：每 3s 采样主进程内存构成 + 各子进程 workingSetSize，落盘 memory-probe.log
  // 拆解：rss=总驻留 heap=V8堆 ext=external(Buffer) native=rss-heap-ext(近似libvips等native malloc)
  try {
    setInterval(() => {
      try {
        const mu = process.memoryUsage();
        const rss = Math.round(mu.rss / 1024 / 1024);
        const heap = Math.round(mu.heapUsed / 1024 / 1024);
        const heapTotal = Math.round(mu.heapTotal / 1024 / 1024);
        const ext = Math.round(mu.external / 1024 / 1024);
        const ab = Math.round(mu.arrayBuffers / 1024 / 1024);
        const native = rss - heapTotal - ext;
        const metrics = app.getAppMetrics();
        const parts: string[] = [
          `main=${rss}MB`, `heap=${heap}MB`, `heapTotal=${heapTotal}MB`,
          `ext=${ext}MB`, `ab=${ab}MB`, `native=${native}MB`,
          `cpuRun=${_cpuRunning}`, `vidRun=${_videoRunning}`,
        ];
        for (const m of metrics) {
          const mb = Math.round((m.memory?.workingSetSize || 0) / 1024);
          if (m.type !== 'Browser') parts.push(`${m.type || m.name || 'proc'}=${mb}MB`);
        }
        fs.appendFileSync(path.join(dataDir, "memory-probe.log"), `[${new Date().toISOString()}] ${parts.join(" ")}
`);
      } catch {
      }
    }, 3000);
  } catch {
  }
  globalShortcut.register("F12", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools();
      }
    }
  });
  globalShortcut.register("CommandOrControl+Shift+I", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools();
      }
    }
  });
  mainWindow?.on("maximize", () => mainWindow?.webContents.send("window-state-changed", true));
  mainWindow?.on("unmaximize", () => mainWindow?.webContents.send("window-state-changed", false));
  mainWindow?.on("minimize", () => mainWindow?.webContents.send("window-state-changed", "minimized"));
  mainWindow?.on("restore", () => {
    mainWindow?.webContents.send("window-state-changed", "restored");
  });
  mainWindow?.on("show", () => {
  });
});
function cleanupOnExit() {
  try {
    const rmSync = require("fs").rmSync;
    if (fs.existsSync(cacheDir)) {
      try {
        const keepSet = /* @__PURE__ */ new Set();
        const folders = getAllFolders();
        for (const f of folders) {
          const cover = getFolderStoredCover(f.id);
          if (cover) {
            const tp = discoverThumbnailPath(resolveStoredPath(cover) || cover);
            if (tp) keepSet.add(tp);
          }
          const rows = getDb().prepare("SELECT thumbnail_path FROM images WHERE folder_id = ? AND thumbnail_path IS NOT NULL AND thumbnail_path != ? ORDER BY modify_time DESC LIMIT 10").all(f.id, "");
          for (const r of rows) {
            if (r.thumbnail_path && fs.existsSync(r.thumbnail_path)) keepSet.add(r.thumbnail_path);
          }
        }
        const cacheFiles = require("fs").readdirSync(cacheDir);
        for (const cf of cacheFiles) {
          if (cf.startsWith("psd-")) {
            keepSet.add(path.join(cacheDir, cf));
          }
        }
        for (const cf of cacheFiles) {
          const fullP = path.join(cacheDir, cf);
          if (!keepSet.has(fullP)) {
            try {
              require("fs").unlinkSync(fullP);
            } catch {
            }
          }
        }
      } catch (e) {
        try {
          rmSync(cacheDir, { recursive: true, force: true });
        } catch {
        }
      }
    }
    const framesDir = require("path").join(require("os").tmpdir(), "picrand-frames");
    if (fs.existsSync(framesDir)) {
      try {
        rmSync(framesDir, { recursive: true, force: true });
      } catch {
      }
    }
    try {
      const tmp = require("os").tmpdir();
      for (const f of require("fs").readdirSync(tmp)) {
        if (f.startsWith("picrand-") && (f.endsWith(".cjs") || f.endsWith(".log"))) {
          try {
            require("fs").unlinkSync(require("path").join(tmp, f));
          } catch {
          }
        }
      }
    } catch {
    }
    const refTmp = require("path").join(dataDir, "tmp_refboard");
    if (fs.existsSync(refTmp)) {
      try {
        rmSync(refTmp, { recursive: true, force: true });
      } catch {
      }
    }
    const logF = require("path").join(dataDir, "thumbnail-errors.log");
    if (fs.existsSync(logF)) {
      try {
        require("fs").unlinkSync(logF);
      } catch {
      }
    }
    if (_refBoardPids.size > 0) {
      for (const pid of _refBoardPids) {
        try {
          process.kill(pid);
        } catch {
        }
      }
      _refBoardPids.clear();
    }
  } catch {
  }
}
app.on("before-quit", () => {
  // 清理定时器，释放事件循环引用，防止进程残留
  if (_hbInterval) { clearInterval(_hbInterval); _hbInterval = null }
  if (_gcInterval) { clearInterval(_gcInterval); _gcInterval = null }
  // 销毁 PSD Worker 池（worker_threads 不销毁会阻塞事件循环）
  _terminatePsdPoolNow()
  // 注销全局快捷键
  try {
    globalShortcut.unregisterAll()
  } catch {}
  // 显式置空 mainWindow，防止退出序列中其他回调在已销毁窗口上操作
  mainWindow = null
  if (tray) {
    try {
      tray.destroy();
    } catch {
    }
    tray = null;
  }
  try {
    stopWatching();
  } catch {
  }
  try {
    const cfg = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf-8")) : {};
    if (cfg.pinboardEnabled !== false && cfg.pinboardMemoryEnabled === false) {
      writePinboards({ currentId: null, boards: [] });
    }
  } catch {
  }
});
app.on("window-all-closed", () => {
  cleanupOnExit();
  closeDatabase();
  // app.quit() 只是"请求"退出，若事件循环仍有活跃句柄（native addon 线程、
  // chokidar 子进程 exit 监听器等）则进程不终止。用 app.exit(0) 强制退出，
  // 绕过事件循环阻塞。Crashpad/GPU/Utility 子进程由 Chromium 自动回收。
  // 销毁托盘图标，避免 app.exit(0) 跳过 before-quit 时留下幽灵托盘图标
  // (Windows 只在鼠标划过/定时刷新时探测死进程图标并清除)。
  if (tray) {
    try { tray.destroy(); } catch {}
    tray = null;
  }
  if (process.platform !== "darwin") app.exit(0)
});
