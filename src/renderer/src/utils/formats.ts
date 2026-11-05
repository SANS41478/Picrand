// 瀑布池支持的格式列表（与主进程扫描 exts、database.ts SUPPORTED_EXTS 保持同步）
export const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif', '.avif', '.svg', '.psd', '.heic', '.heif']
export const VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.mkv', '.avi', '.flv', '.f4v']
export const ALL_EXTS = [...IMAGE_EXTS, ...VIDEO_EXTS]

export function extOf(filePath: string): string {
  const dot = filePath.lastIndexOf('.')
  return dot < 0 ? '' : filePath.slice(dot).toLowerCase()
}

// 判断文件是否属于已启用格式
export function isExtEnabled(filePath: string, enabled: string[]): boolean {
  return enabled.includes(extOf(filePath))
}
