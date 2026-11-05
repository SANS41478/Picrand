const VIDEO_RE = /\.(mp4|webm|mov|mkv|avi|flv|f4v)$/i
export function isVideoExt(path: string): boolean {
  return VIDEO_RE.test(path)
}