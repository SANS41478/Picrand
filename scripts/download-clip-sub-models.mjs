// 补充下载 CLIP 子模型 ONNX 文件
// CLIPVisionModelWithProjection / CLIPTextModelWithProjection 各需独立的 vision_model / text_model ONNX
// 首次下载脚本只拉了一份合并的 model_quantized.onnx，这里补拉缺失的

import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const modelsDir = path.join(__dirname, '..', '_internal_data', 'models', 'Xenova', 'clip-vit-base-patch32', 'onnx')
const BASE = 'https://hf-mirror.com/Xenova/clip-vit-base-patch32/resolve/main/onnx'

const FILES = [
  'vision_model_quantized.onnx',
  'text_model_quantized.onnx',
]

for (const name of FILES) {
  const dest = path.join(modelsDir, name)
  if (fs.existsSync(dest)) {
    console.log('[clip-download-sub] skip (exists):', name)
    continue
  }
  const url = `${BASE}/${name}?download=true`
  console.log('[clip-download-sub] fetching:', url)
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(dest, buf)
    console.log('[clip-download-sub] ✅ saved:', name, `(${(buf.length / 1024 / 1024).toFixed(1)} MB)`)
  } catch (err) {
    console.error('[clip-download-sub] ❌ failed:', name, err)
    process.exit(1)
  }
}

console.log('[clip-download-sub] ✅ all sub-model files ready.')
process.exit(0)
