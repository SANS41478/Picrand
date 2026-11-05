// Windows API 函数绑定
import koffi from 'koffi'

// ====== 基础类型 ======
const HWND = koffi.pointer('HWND', koffi.opaque())
const HDC = koffi.pointer('HDC', koffi.opaque())
const HBITMAP = koffi.pointer('HBITMAP', koffi.opaque())
const HINSTANCE = koffi.pointer('HINSTANCE', koffi.opaque())
const HMENU = koffi.pointer('HMENU', koffi.opaque())
const HBRUSH = koffi.pointer('HBRUSH', koffi.opaque())
const HICON = koffi.pointer('HICON', koffi.opaque())
const HCURSOR = koffi.pointer('HCURSOR', koffi.opaque())
const LPVOID = koffi.pointer('LPVOID', koffi.opaque())

// Win64 下 WPARAM 和 LPARAM 的正确类型
// WPARAM = UINT_PTR (x64 下是 uint64)
// LPARAM = LONG_PTR (x64 下是 int64)
const WPARAM = 'uint64'
const LPARAM = 'int64'
const LRESULT = 'int64'

// ====== 结构体 ======
const PointStruct = koffi.struct('PointStruct', {
  x: 'long',
  y: 'long'
})

const RectStruct = koffi.struct('RectStruct', {
  left: 'long',
  top: 'long',
  right: 'long',
  bottom: 'long'
})

const MsgStruct = koffi.struct('MsgStruct', {
  hwnd: HWND,
  message: 'uint',
  wParam: WPARAM,
  lParam: LPARAM,
  time: 'uint',
  pt: PointStruct
})

const WndClassExWStruct = koffi.struct('WndClassExWStruct', {
  cbSize: 'uint',
  style: 'uint',
  lpfnWndProc: koffi.pointer(koffi.opaque()),
  cbClsExtra: 'int',
  cbWndExtra: 'int',
  hInstance: HINSTANCE,
  hIcon: HICON,
  hCursor: HCURSOR,
  hbrBackground: HBRUSH,
  lpszMenuName: koffi.pointer('uint16'),
  lpszClassName: koffi.pointer('uint16'),
  hIconSm: HICON
})

const BlendFunctionStruct = koffi.struct('BlendFunctionStruct', {
  BlendOp: 'uint8',
  BlendFlags: 'uint8',
  SourceConstantAlpha: 'uint8',
  AlphaFormat: 'uint8'
})

const SizeStruct = koffi.struct('SizeStruct', {
  cx: 'long',
  cy: 'long'
})

// ====== 加载 DLL ======
const user32 = koffi.load('user32.dll')
const gdi32 = koffi.load('gdi32.dll')
const kernel32 = koffi.load('kernel32.dll')

// ====== User32 函数 ======
export const RegisterClassExW = user32.func('RegisterClassExW', 'uint16', [koffi.pointer(WndClassExWStruct)])
export const CreateWindowExW = user32.func('CreateWindowExW', HWND, [
  'uint32', koffi.pointer('uint16'), koffi.pointer('uint16'), 'uint32',
  'int', 'int', 'int', 'int',
  HWND, HMENU, HINSTANCE, LPVOID
])
export const ShowWindow = user32.func('ShowWindow', 'int32', [HWND, 'int'])
export const UpdateWindow = user32.func('UpdateWindow', 'int32', [HWND])
export const DestroyWindow = user32.func('DestroyWindow', 'int32', [HWND])
export const GetMessageW = user32.func('GetMessageW', 'int32', [koffi.out(koffi.pointer(MsgStruct)), HWND, 'uint', 'uint'])
export const TranslateMessage = user32.func('TranslateMessage', 'int32', [koffi.pointer(MsgStruct)])
export const DispatchMessageW = user32.func('DispatchMessageW', LRESULT, [koffi.pointer(MsgStruct)])
export const PostQuitMessage = user32.func('PostQuitMessage', 'void', ['int'])
export const DefWindowProcW = user32.func('DefWindowProcW', LRESULT, [HWND, 'uint', WPARAM, LPARAM])
export const GetDC = user32.func('GetDC', HDC, [HWND])
export const ReleaseDC = user32.func('ReleaseDC', 'int', [HWND, HDC])
export const UpdateLayeredWindow = user32.func('UpdateLayeredWindow', 'int32', [
  HWND, HDC, koffi.pointer(PointStruct), koffi.pointer(SizeStruct),
  HDC, koffi.pointer(PointStruct), 'uint32',
  koffi.pointer(BlendFunctionStruct), 'uint32'
])
export const SetWindowPos = user32.func('SetWindowPos', 'int32', [
  HWND, HWND, 'int', 'int', 'int', 'int', 'uint'
])
export const GetWindowRect = user32.func('GetWindowRect', 'int32', [HWND, koffi.out(koffi.pointer(RectStruct))])
export const GetCursorPos = user32.func('GetCursorPos', 'int32', [koffi.out(koffi.pointer(PointStruct))])
export const SetLayeredWindowAttributes = user32.func('SetLayeredWindowAttributes', 'int32', [
  HWND, 'uint32', 'uint8', 'uint32'
])
export const LoadCursorW = user32.func('LoadCursorW', HCURSOR, [HINSTANCE, koffi.pointer('uint16')])
export const LoadIconW = user32.func('LoadIconW', HICON, [HINSTANCE, koffi.pointer('uint16')])

// ====== GDI32 函数 ======
export const CreateCompatibleDC = gdi32.func('CreateCompatibleDC', HDC, [HDC])
export const DeleteDC = gdi32.func('DeleteDC', 'int32', [HDC])
export const SelectObject = gdi32.func('SelectObject', LPVOID, [HDC, LPVOID])
export const DeleteObject = gdi32.func('DeleteObject', 'int32', [LPVOID])
export const CreateCompatibleBitmap = gdi32.func('CreateCompatibleBitmap', HBITMAP, [HDC, 'int', 'int'])
export const BitBlt = gdi32.func('BitBlt', 'int32', [
  HDC, 'int', 'int', 'int', 'int',
  HDC, 'int', 'int', 'uint32'
])
export const GetStockObject = gdi32.func('GetStockObject', LPVOID, ['int'])

// ====== Kernel32 函数 ======
export const GetModuleHandleW = kernel32.func('GetModuleHandleW', HINSTANCE, [koffi.pointer('uint16')])

// ====== 辅助函数 ======
// 将 JavaScript 字符串转换为 UTF-16 Buffer
export function toWideString(str: string): Buffer {
  const buf = Buffer.from(str + '\0', 'utf16le')
  return buf
}

// MAKEINTRESOURCE - 将整数资源 ID 转换为指针
export function MAKEINTRESOURCE(id: number): Buffer {
  // 资源 ID 直接作为指针值，低 16 位有效
  const buf = Buffer.alloc(8) // 64 位指针
  buf.writeBigUInt64LE(BigInt(id & 0xFFFF), 0)
  return buf
}

// 从 LPARAM 提取坐标
export function GET_X_LPARAM(lParam: bigint): number {
  return Number(lParam & 0xFFFFn) | ((Number(lParam) & 0x8000) ? 0xFFFF0000 : 0)
}

export function GET_Y_LPARAM(lParam: bigint): number {
  return Number((lParam >> 16n) & 0xFFFFn) | ((Number(lParam >> 16n) & 0x8000) ? 0xFFFF0000 : 0)
}

// 从 WPARAM 提取滚轮增量
export function GET_WHEEL_DELTA_WPARAM(wParam: bigint): number {
  const delta = Number((wParam >> 16n) & 0xFFFFn)
  return delta > 0x7FFF ? delta - 0x10000 : delta
}

// MAKELPARAM
export function MAKELPARAM(low: number, high: number): bigint {
  return BigInt((low & 0xFFFF) | ((high & 0xFFFF) << 16))
}

// HIWORD / LOWORD
export function HIWORD(val: bigint): number {
  return Number((val >> 16n) & 0xFFFFn)
}

export function LOWORD(val: bigint): number {
  return Number(val & 0xFFFFn)
}

// ====== 导出类型供外部使用 ======
export { HWND, HDC, HBITMAP, HINSTANCE, WPARAM, LPARAM, LRESULT }
export { PointStruct, RectStruct, SizeStruct, BlendFunctionStruct, WndClassExWStruct }
