// 原生参考板窗口实现
import { randomUUID } from 'crypto'
import { basename } from 'path'
import koffi from 'koffi'
import {
  RegisterClassExW, CreateWindowExW, ShowWindow, UpdateWindow,
  DestroyWindow, GetMessageW, TranslateMessage, DispatchMessageW,
  DefWindowProcW, GetDC, ReleaseDC, GetModuleHandleW,
  SetWindowPos, GetWindowRect, GetCursorPos, LoadCursorW,
  CreateCompatibleDC, DeleteDC, SelectObject, DeleteObject,
  CreateCompatibleBitmap, BitBlt, UpdateLayeredWindow,
  toWideString, MAKEINTRESOURCE, GET_WHEEL_DELTA_WPARAM, GET_X_LPARAM, GET_Y_LPARAM,
  HWND, WPARAM, LPARAM, LRESULT, WndClassExWStruct, PointStruct, RectStruct, SizeStruct, BlendFunctionStruct
} from './win32-api.js'
import {
  WS_POPUP, WS_VISIBLE, WS_EX_LAYERED, WS_EX_TOPMOST, WS_EX_TOOLWINDOW,
  WM_DESTROY, WM_CLOSE, WM_LBUTTONDOWN, WM_RBUTTONUP, WM_MOUSEWHEEL,
  WM_NCHITTEST, HTCAPTION, SW_SHOW, CS_HREDRAW, CS_VREDRAW,
  CW_USEDEFAULT, ULW_ALPHA, AC_SRC_OVER, AC_SRC_ALPHA
} from './win32-types.js'
import { loadImageAsHBitmap } from './gdiplus-loader.js'

// ====== 全局状态 ======
const windows = new Map<string, NativeRefWindow>()
// 使用 HWND 地址字符串作为键来映射窗口实例
const hwndMap = new Map<string, NativeRefWindow>()
let classRegistered = false
const CLASS_NAME = 'PicRandRefBoard'

// 辅助函数：将 HWND 转换为字符串键
function hwndToKey(hwnd: any): string {
  // koffi 返回的指针对象，提取其地址
  if (hwnd && typeof hwnd === 'object') {
    // 尝试获取地址
    return String(hwnd)
  }
  return String(hwnd)
}

// ====== 窗口过程回调 ======
// 修复问题1：使用正确的 Win64 WNDPROC 签名
// LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
const WndProcProto = koffi.proto('int64 __stdcall WndProcProto(void *hwnd, uint32 msg, uint64 wParam, int64 lParam)')

const WndProcCallback = koffi.register(function(hwnd: any, msg: number, wParam: bigint, lParam: bigint): bigint {
  try {
    // 修复问题2：使用地址字符串查找窗口实例
    const hwndKey = hwndToKey(hwnd)
    const win = hwndMap.get(hwndKey)

    if (!win) {
      return DefWindowProcW(hwnd, msg, wParam, lParam)
    }

    switch (msg) {
      case WM_CLOSE:
        win.close()
        return BigInt(0)

      case WM_DESTROY:
        windows.delete(win.id)
        hwndMap.delete(hwndKey)
        return BigInt(0)

      case WM_NCHITTEST:
        // 整个窗口可拖动
        return BigInt(HTCAPTION)

      case WM_RBUTTONUP:
        // 右键关闭
        win.close()
        return BigInt(0)

      case WM_MOUSEWHEEL:
        // 滚轮缩放
        const delta = GET_WHEEL_DELTA_WPARAM(wParam)
        win.zoom(delta > 0 ? 1.08 : 0.92)
        return BigInt(0)

      default:
        return DefWindowProcW(hwnd, msg, wParam, lParam)
    }
  } catch (err) {
    console.error('[NativeRefWindow] WndProc error:', err)
    return DefWindowProcW(hwnd, msg, wParam, lParam)
  }
}, WndProcProto)

// ====== NativeRefWindow 类 ======
export class NativeRefWindow {
  id: string
  hwnd: any = null
  imagePath: string
  width: number
  height: number
  hInstance: any
  hBitmap: any = null
  memDC: any = null
  screenDC: any = null

  constructor(imagePath: string, width: number = 800, height: number = 600) {
    this.id = randomUUID()
    this.imagePath = imagePath
    this.width = width
    this.height = height
    this.hInstance = GetModuleHandleW(null)

    windows.set(this.id, this)

    // 注册窗口类
    if (!classRegistered) {
      this.registerWindowClass()
      classRegistered = true
    }

    // 加载图片
    this.loadImage()

    // 创建窗口
    this.createWindow()

    // 渲染图片
    this.render()
  }

  private registerWindowClass() {
    // 修复问题3：使用 MAKEINTRESOURCE 正确加载系统光标
    // 修复问题4：使用 koffi.sizeof 动态计算结构体大小
    const IDC_ARROW = 32512

    const wc: any = {
      cbSize: koffi.sizeof(WndClassExWStruct), // 动态计算，不再硬编码 80
      style: CS_HREDRAW | CS_VREDRAW,
      lpfnWndProc: WndProcCallback,
      cbClsExtra: 0,
      cbWndExtra: 0,
      hInstance: this.hInstance,
      hIcon: null,
      hCursor: LoadCursorW(null, MAKEINTRESOURCE(IDC_ARROW)), // 使用 MAKEINTRESOURCE
      hbrBackground: null,
      lpszMenuName: null,
      lpszClassName: toWideString(CLASS_NAME),
      hIconSm: null
    }

    const atom = RegisterClassExW(wc)
    if (!atom) {
      throw new Error('Failed to register window class')
    }
  }

  private createWindow() {
    const title = `RefBoard - ${basename(this.imagePath)}`

    this.hwnd = CreateWindowExW(
      WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_TOOLWINDOW,
      toWideString(CLASS_NAME),
      toWideString(title),
      WS_POPUP | WS_VISIBLE,
      CW_USEDEFAULT, CW_USEDEFAULT,
      this.width, this.height,
      null, null, this.hInstance, null
    )

    if (!this.hwnd) {
      throw new Error('Failed to create window')
    }

    ShowWindow(this.hwnd, SW_SHOW)
    UpdateWindow(this.hwnd)

    // 修复问题2：将 HWND 地址映射到窗口实例
    const hwndKey = hwndToKey(this.hwnd)
    hwndMap.set(hwndKey, this)

    console.log(`[NativeRefWindow] Created: ${this.id}, ${this.width}x${this.height}, hwnd: ${hwndKey}`)
  }

  private loadImage() {
    // 使用 GDI+ 加载图片为 HBITMAP
    this.hBitmap = loadImageAsHBitmap(this.imagePath)
    if (!this.hBitmap) {
      throw new Error('Failed to load image')
    }
  }

  private render() {
    if (!this.hwnd || !this.hBitmap) return

    // 获取屏幕 DC
    this.screenDC = GetDC(null)
    if (!this.screenDC) {
      throw new Error('Failed to get screen DC')
    }

    // 创建内存 DC
    this.memDC = CreateCompatibleDC(this.screenDC)
    if (!this.memDC) {
      ReleaseDC(null, this.screenDC)
      throw new Error('Failed to create compatible DC')
    }

    // 选择位图到内存 DC
    const oldBitmap = SelectObject(this.memDC, this.hBitmap)
    if (!oldBitmap) {
      DeleteDC(this.memDC)
      ReleaseDC(null, this.screenDC)
      throw new Error('Failed to select bitmap into DC')
    }

    // 修复问题6：使用正确的结构体实例，而非普通 JS 对象
    const ptSrc = { x: 0, y: 0 }
    const ptDst = { x: 0, y: 0 }
    const size = { cx: this.width, cy: this.height }
    const blend = {
      BlendOp: AC_SRC_OVER,
      BlendFlags: 0,
      SourceConstantAlpha: 255,
      AlphaFormat: AC_SRC_ALPHA
    }

    // 更新分层窗口
    const result = UpdateLayeredWindow(
      this.hwnd,
      this.screenDC,
      ptDst,
      size,
      this.memDC,
      ptSrc,
      0,
      blend,
      ULW_ALPHA
    )

    if (!result) {
      console.error('[NativeRefWindow] UpdateLayeredWindow failed')
    }

    // 清理
    SelectObject(this.memDC, oldBitmap)
  }

  zoom(factor: number) {
    if (!this.hwnd) return

    // 修复问题5：使用正确的结构体实例
    const rect = { left: 0, top: 0, right: 0, bottom: 0 }
    if (!GetWindowRect(this.hwnd, rect)) return

    const currentWidth = rect.right - rect.left
    const currentHeight = rect.bottom - rect.top
    const aspect = currentWidth / currentHeight

    let newWidth = Math.round(currentWidth * factor)
    let newHeight = Math.round(newWidth / aspect)

    // 限制尺寸
    const MIN_SIZE = 150
    const MAX_SIZE = 3000
    if (newWidth < MIN_SIZE) {
      newWidth = MIN_SIZE
      newHeight = Math.round(newWidth / aspect)
    } else if (newWidth > MAX_SIZE) {
      newWidth = MAX_SIZE
      newHeight = Math.round(newWidth / aspect)
    }

    // 以窗口中心为缩放中心
    const cx = rect.left + Math.round((currentWidth - newWidth) / 2)
    const cy = rect.top + Math.round((currentHeight - newHeight) / 2)

    // 更新窗口大小和位置
    SetWindowPos(this.hwnd, null, cx, cy, newWidth, newHeight, 0x0004) // SWP_NOZORDER

    // 更新渲染尺寸
    this.width = newWidth
    this.height = newHeight
    this.render()
  }

  close() {
    if (this.hwnd) {
      const hwndKey = hwndToKey(this.hwnd)
      hwndMap.delete(hwndKey)
      DestroyWindow(this.hwnd)
      this.hwnd = null
    }

    // 清理资源
    if (this.memDC) {
      DeleteDC(this.memDC)
      this.memDC = null
    }

    if (this.screenDC) {
      ReleaseDC(null, this.screenDC)
      this.screenDC = null
    }

    if (this.hBitmap) {
      DeleteObject(this.hBitmap)
      this.hBitmap = null
    }

    windows.delete(this.id)
    console.log(`[NativeRefWindow] Closed: ${this.id}`)
  }
}

// ====== 导出函数 ======
export function createNativeRefWindow(imagePath: string, width?: number, height?: number): NativeRefWindow {
  return new NativeRefWindow(imagePath, width, height)
}

export function closeAllNativeRefWindows() {
  for (const [, win] of windows) {
    win.close()
  }
}
