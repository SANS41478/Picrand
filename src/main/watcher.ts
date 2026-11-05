// 文件监听：worker_threads 轻量实现（替代 chokidar fork Electron 二进制的方式）。
// 旧方案每个 watcher fork 一个完整 Electron 进程（100-200MB），快速切文件夹时堆积易 OOM。
// worker_threads 方案：单个轻量 Worker 线程（~10MB），同进程内通信，零 IPC 开账。
import { BrowserWindow } from 'electron'
import { appendFileSync } from 'fs'
import { join, dirname } from 'path'
import { Worker } from 'worker_threads'

let activeChild: Worker | null = null
let watchedFolder: string | null = null
// generation 计数：每次 startWatching 自增。Worker 消息携带启动时的 gen，主进程只接受当前 gen 的消息，
// 过滤掉"快速切文件夹时旧 Worker 在 terminate 前仍推来的、属于上一个文件夹的事件"。
let _curGen = 0
// 主动 stop 标记：区分"主动 stopWatching"（不重启）与"Worker 线程异常 exit"（重启）
let _stopping = false
// onAdd 串行队列：避免批量 add 时多个 onAdd 并发跑 sharp 撞主进程
let _addQueue: string[] = []
let _addRunning = false
// onAdd 总超时（防止单个损坏文件导致队列永久卡死）
const ADD_TIMEOUT_MS = 30_000
// 崩溃重启上限 + 退避（兜底）
let _restartCount = 0
let _restartTimer: ReturnType<typeof setTimeout> | null = null
const MAX_RESTART = 3
const RESTART_BASE_MS = 2000

function _probeLog(msg: string) {
  try {
    const { app } = require('electron')
    const dataDir = app.isPackaged ? app.getPath('userData') : join(process.cwd(), '_internal_data')
    appendFileSync(join(dataDir, 'perf-probe.log'), `[watcher] ${new Date().toISOString()} ${msg}\n`)
  } catch {}
}

// 运行时写入 Worker 线程脚本（CJS），与主线程解耦。
// ★不用 chokidar★（2026-08-18 根因修复）：chokidar 在 Windows 上为每个目录单独 fs.watch，
// libuv 对每个目录句柄开一条专用线程（ReadDirectoryChangesW 阻塞循环）。监视整个盘根
// （如 D:\ 共 2.4 万目录）会创建 2.4 万条监视线程 + chokidar 内部 Map -> ~2GB native 内存驻留。
// Windows 的 ReadDirectoryChangesW 原生支持递归监视整棵子树，Node 的 fs.watch(dir,{recursive:true})
// 直接暴露该能力：一个句柄、一条线程，事件语义等价（rename 事件用 stat 区分新增/删除）。
function _ensureWatcherWorkerPath(): string {
  const workerPath = join(__dirname, 'watcher-worker.cjs')
  try {
    // 强制重写以覆盖旧版本（历史版本用过 chokidar / child_process.fork）
    const fs = require('fs')
    fs.writeFileSync(workerPath, [
      "const { parentPort } = require('worker_threads');",
      "const fs = require('fs');",
      "const path = require('path');",
      "const IMAGE_EXTS = new Set(['.jpg','.jpeg','.png','.gif','.bmp','.webp','.tiff','.tif','.avif','.svg','.psd','.heic','.heif','.mp4','.webm','.mov','.mkv','.avi','.flv','.f4v']);",
      "function extOf(p){ const i=p.lastIndexOf('.'); return i<0?'':p.slice(i).toLowerCase(); }",
      "function isImg(p){ return IMAGE_EXTS.has(extOf(p)); }",
      "// 等价旧 chokidar ignored:/(^|[\\\\/])\\\\./ —— 相对路径任一段以点开头则忽略",
      "function inDotEntry(rel){ return String(rel).split(/[\\\\/]+/).some(function(s){ return s.length > 0 && s.charAt(0) === '.'; }); }",
      "let watcher = null;",
      "let curGen = 0;",
      "parentPort.on('message', (msg) => {",
      "  if (msg && msg.cmd === 'start' && msg.dir) {",
      "    if (watcher) { try { watcher.close(); } catch(e){} watcher = null; }",
      "    curGen = msg.gen;",
      "    try {",
      "      watcher = fs.watch(msg.dir, { recursive: true }, (event, filename) => {",
      "        if (!filename) return;",
      "        if (inDotEntry(filename)) return;",
      "        const full = path.join(msg.dir, filename);",
      "        if (event === 'change') {",
      "          if (isImg(full)) parentPort.postMessage({ evt: 'change', path: full, gen: curGen });",
      "          return;",
      "        }",
      "        // 'rename' 在 fs.watch 语义里 = 创建/删除/改名，用 stat 区分；目录本身忽略（递归监听自动覆盖其内容）",
      "        fs.stat(full, (err, st) => {",
      "          if (err) { parentPort.postMessage({ evt: 'unlink', path: full, gen: curGen }); return; }",
      "          if (st.isFile() && isImg(full)) parentPort.postMessage({ evt: 'add', path: full, gen: curGen });",
      "        });",
      "      });",
      "      watcher.on('error', (e) => parentPort.postMessage({ evt: 'error', msg: String(e && e.message || e), gen: curGen }));",
      "      // 递归监听立即生效，无需像 chokidar 那样先全盘爬目录树",
      "      parentPort.postMessage({ evt: 'ready', ms: 0, gen: curGen });",
      "    } catch(e) {",
      "      parentPort.postMessage({ evt: 'fatal', msg: String(e && e.message || e), gen: curGen });",
      "    }",
      "  } else if (msg && msg.cmd === 'stop') {",
      "    if (watcher) { try { watcher.close(); } catch(e){} watcher = null; }",
      "    parentPort.postMessage({ evt: 'stopped' });",
      "  }",
      "});",
      ""
    ].join('\n'))
  } catch (e: any) {
    _probeLog(`worker script write error: ${e?.message || e}`)
  }
  return workerPath
}

let _onAddCb: ((filePath: string) => Promise<void>) | null = null
let _onDeleteCb: ((filePath: string) => void) | null = null
let _mainWindow: BrowserWindow | null = null

// 串行消费 add 队列：一次只跑一个 onAdd，避免并发 sharp
// 单条超时 30s：防止损坏文件导致 native 异常卡死队列
async function _drainAddQueue() {
  if (_addRunning) return
  _addRunning = true
  try {
    while (_addQueue.length > 0) {
      const fp = _addQueue.shift()!
      let timedOut = false
      try {
        if (_onAddCb) {
          await Promise.race([
            _onAddCb(fp),
            new Promise<void>(r => setTimeout(() => { timedOut = true; r() }, ADD_TIMEOUT_MS))
          ])
        }
        if (timedOut) _probeLog(`drain timeout: ${fp.slice(-60)}`)
      }
      catch (err) { console.error('watcher add error:', err) }
    }
  } finally { _addRunning = false }
}

function _restartWatcher() {
  if (!watchedFolder || !_mainWindow || !_onAddCb || !_onDeleteCb) return
  if (_stopping) return

  _restartCount++
  if (_restartCount > MAX_RESTART) {
    _probeLog(`crash restart limit reached (${MAX_RESTART}), giving up for ${watchedFolder!.slice(-50)}`)
    activeChild = null; watchedFolder = null
    return
  }
  const delay = RESTART_BASE_MS * Math.min(_restartCount, MAX_RESTART)
  _probeLog(`crash detected, restart #${_restartCount} in ${delay}ms for ${watchedFolder!.slice(-50)}`)
  activeChild = null
  _restartTimer = setTimeout(() => {
    if (!_stopping && watchedFolder) startWatching(watchedFolder, _mainWindow!, _onAddCb!, _onDeleteCb!)
  }, delay)
}

export function startWatching(
  folderPath: string,
  mainWindow: BrowserWindow,
  onAdd: (filePath: string) => Promise<void>,
  onDelete: (filePath: string) => void
): void {
  // 先终止旧 Worker，再用新 generation 启动
  stopWatching()

  watchedFolder = folderPath
  _curGen++
  _stopping = false
  _onAddCb = onAdd
  _onDeleteCb = onDelete
  _mainWindow = mainWindow
  _addQueue = []
  _addRunning = false
  _restartCount = 0

  _probeLog(`start: ${folderPath.slice(-60)} gen=${_curGen}`)

  const workerPath = _ensureWatcherWorkerPath()
  try {
    // 用 worker_threads 的 Worker 承载递归 fs.watch，文件事件通过 parentPort.postMessage 回传到主线程。
    activeChild = new Worker(workerPath)
    _probeLog(`worker started gen=${_curGen}`)
  } catch (e: any) {
    _probeLog(`worker create failed: ${e?.message || e}`)
    activeChild = null
    return
  }

  activeChild.on('message', (msg: any) => {
    if (!msg || !msg.evt) return
    // 过滤旧 generation 的消息（快速切文件夹时旧 Worker 残留推来的事件）
    if (msg.gen !== undefined && msg.gen !== _curGen) return
    switch (msg.evt) {
      case 'ready':
        _probeLog(`ready: ${msg.ms}ms`)
        break
      case 'add':
        _addQueue.push(msg.path)
        _drainAddQueue()
        break
      case 'unlink':
        if (_onDeleteCb) _onDeleteCb(msg.path)
        break
      case 'change':
        if (_mainWindow && !_mainWindow.isDestroyed()) _mainWindow.webContents.send('sync-db', { type: 'change', path: msg.path })
        break
      case 'error':
        console.error('watcher error:', msg.msg)
        break
      case 'fatal':
        _probeLog(`fatal: ${msg.msg}`)
        console.error('[watcher-worker fatal]', msg.msg)
        break
      case 'stopped':
        // Worker 线程已关闭监听，可安全终止
        break
    }
  })

  activeChild.on('error', (err: Error) => {
    _probeLog(`worker error: ${err.message}`)
  })

  // 记录本 Worker 启动时的 generation，供 exit 回调区分"旧 Worker 退出"与"当前 Worker 崩溃"
  const selfWorker = activeChild as Worker
  ;(selfWorker as any)._gen = _curGen

  selfWorker.on('exit', (code) => {
    _probeLog(`worker exit code=${code} gen=${_curGen} workerGen=${(selfWorker as any)?._gen}`)
    const workerGen = (selfWorker as any)?._gen
    const isCurrent = workerGen === _curGen
    if (isCurrent && !_stopping && watchedFolder && _mainWindow && _onAddCb && _onDeleteCb) {
      _restartWatcher()
    } else {
      if (activeChild === selfWorker) activeChild = null
    }
  })

  // 发送启动指令（带 generation）
  activeChild.postMessage({ cmd: 'start', dir: folderPath, gen: _curGen })
}

export function stopWatching(): void {
  _stopping = true
  if (_restartTimer) { clearTimeout(_restartTimer); _restartTimer = null }
  if (activeChild) {
    const worker = activeChild
    // 先通知 Worker 关闭监听，再 terminate 线程
    try { worker.postMessage({ cmd: 'stop' }) } catch {}
    // 立即 terminate：Worker 线程不阻塞事件循环，terminate 后在微任务中回收
    try { worker.terminate() } catch {}
    _probeLog(`stopWatching: worker terminated gen=${_curGen}`)
    activeChild = null
  }
  watchedFolder = null
  _addQueue = []
}

export function getWatchedFolder(): string | null {
  return watchedFolder
}

export function isWatching(): boolean {
  return !!activeChild
}
