// GDI+ 图片加载和渲染
import koffi from 'koffi'
import { existsSync } from 'fs'

// ====== 加载 GDI+ ======
const gdiplus = koffi.load('gdiplus.dll')

// ====== GDI+ 类型 ======
const GpGraphics = koffi.pointer(koffi.opaque())
const GpImage = koffi.pointer(koffi.opaque())
const GpBitmap = koffi.pointer(koffi.opaque())
const GdiplusStartupInput = koffi.struct('GdiplusStartupInput', {
  GdiplusVersion: 'uint32',
  DebugEventCallback: koffi.pointer(koffi.opaque()),
  SuppressBackgroundThread: 'int32',
  SuppressExternalCodecs: 'int32'
})

// ====== GDI+ 函数 ======
const GdiplusStartup = gdiplus.func('GdiplusStartup', 'int', [
  koffi.out(koffi.pointer('uintptr')),
  koffi.pointer(GdiplusStartupInput),
  koffi.pointer(koffi.opaque())
])
const GdiplusShutdown = gdiplus.func('GdiplusShutdown', 'void', ['uintptr'])
const GdipLoadImageFromFile = gdiplus.func('GdipLoadImageFromFile', 'int', [
  koffi.pointer('uint16'),
  koffi.out(koffi.pointer(GpImage))
])
const GdipGetImageWidth = gdiplus.func('GdipGetImageWidth', 'int', [
  GpImage,
  koffi.out(koffi.pointer('uint'))
])
const GdipGetImageHeight = gdiplus.func('GdipGetImageHeight', 'int', [
  GpImage,
  koffi.out(koffi.pointer('uint'))
])
const GdipCreateBitmapFromFile = gdiplus.func('GdipCreateBitmapFromFile', 'int', [
  koffi.pointer('uint16'),
  koffi.out(koffi.pointer(GpBitmap))
])
const GdipDisposeImage = gdiplus.func('GdipDisposeImage', 'int', [GpImage])
const GdipCreateHBITMAPFromBitmap = gdiplus.func('GdipCreateHBITMAPFromBitmap', 'int', [
  GpBitmap,
  koffi.out(koffi.pointer(koffi.pointer(koffi.opaque()))),
  'uint32'
])

// ====== GDI+ 状态 ======
let gdiplusToken: any = null
let gdiplusInitialized = false

// ====== 初始化 GDI+ ======
export function initGdiPlus(): boolean {
  if (gdiplusInitialized) return true

  const input = {
    GdiplusVersion: 1,
    DebugEventCallback: null,
    SuppressBackgroundThread: 0,
    SuppressExternalCodecs: 0
  }

  const token = { value: 0n }
  const status = GdiplusStartup(token, input, null)

  if (status === 0) {
    gdiplusToken = token.value
    gdiplusInitialized = true
    console.log('[GDI+] Initialized successfully')
    return true
  } else {
    console.error('[GDI+] Initialization failed, status:', status)
    return false
  }
}

// ====== 关闭 GDI+ ======
export function shutdownGdiPlus() {
  if (gdiplusInitialized && gdiplusToken !== null) {
    GdiplusShutdown(gdiplusToken)
    gdiplusInitialized = false
    gdiplusToken = null
    console.log('[GDI+] Shutdown')
  }
}

// ====== 加载图片并获取尺寸 ======
export function loadImageDimensions(imagePath: string): { width: number; height: number } | null {
  if (!existsSync(imagePath)) {
    console.error('[GDI+] Image file not found:', imagePath)
    return null
  }

  if (!gdiplusInitialized) {
    if (!initGdiPlus()) return null
  }

  const wpath = Buffer.from(imagePath + '\0', 'utf16le')
  const image = { value: null }

  let status = GdipLoadImageFromFile(wpath, image)
  if (status !== 0) {
    console.error('[GDI+] Failed to load image:', imagePath, 'status:', status)
    return null
  }

  const width = { value: 0 }
  const height = { value: 0 }

  status = GdipGetImageWidth(image.value, width)
  if (status !== 0) {
    GdipDisposeImage(image.value)
    return null
  }

  status = GdipGetImageHeight(image.value, height)
  if (status !== 0) {
    GdipDisposeImage(image.value)
    return null
  }

  GdipDisposeImage(image.value)

  return {
    width: width.value,
    height: height.value
  }
}

// ====== 加载图片为 HBITMAP ======
export function loadImageAsHBitmap(imagePath: string): any {
  if (!existsSync(imagePath)) {
    console.error('[GDI+] Image file not found:', imagePath)
    return null
  }

  if (!gdiplusInitialized) {
    if (!initGdiPlus()) return null
  }

  const wpath = Buffer.from(imagePath + '\0', 'utf16le')
  const bitmap = { value: null }

  let status = GdipCreateBitmapFromFile(wpath, bitmap)
  if (status !== 0) {
    console.error('[GDI+] Failed to create bitmap:', imagePath, 'status:', status)
    return null
  }

  const hbitmap = { value: null }
  status = GdipCreateHBITMAPFromBitmap(bitmap.value, hbitmap, 0x00FFFFFF) // Background: white

  GdipDisposeImage(bitmap.value)

  if (status !== 0) {
    console.error('[GDI+] Failed to create HBITMAP, status:', status)
    return null
  }

  return hbitmap.value
}
