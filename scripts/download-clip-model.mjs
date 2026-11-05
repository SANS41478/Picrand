// 一次性 CLIP 模型下载脚本
// 走 hf-mirror.com 镜像

import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const cacheRoot = path.join(__dirname, '..', '_internal_data', 'models')
fs.mkdirSync(cacheRoot, { recursive: true })

// 必须在 import @xenova/transformers 之前设好
process.env.HF_ENDPOINT = 'https://hf-mirror.com'

const { pipeline, env } = await import('@xenova/transformers')
env.cacheDir = cacheRoot
env.allowRemoteModels = true
env.allowLocalModels = false
env.remoteHost = 'https://hf-mirror.com'

console.log('[clip-download] 模型缓存目录:', cacheRoot)
console.log('[clip-download] 开始下载 Xenova/clip-vit-base-patch32（~600MB），请等待...')

try {
  const pipe = await pipeline('feature-extraction', 'Xenova/clip-vit-base-patch32')
  console.log('[clip-download] ✅ 模型下载完成！路径:', path.join(cacheRoot, 'Xenova', 'clip-vit-base-patch32'))
  console.log('[clip-download] 现在起 clip-search.ts 将为纯本地模式（allowRemoteModels=false）。')
  process.exit(0)
} catch (err) {
  console.error('[clip-download] ❌ 下载失败:', err)
  process.exit(1)
}
