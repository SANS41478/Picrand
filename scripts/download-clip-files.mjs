// 补充下载 CLIP 所需的所有非 ONNX 文件（tokenizer / config / preprocessor）
// 源：hf-mirror.com（HuggingFace 镜像）
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = 'https://hf-mirror.com/Xenova/clip-vit-base-patch32/resolve/main'
const OUT = path.join(__dirname, '..', '_internal_data', 'models', 'Xenova', 'clip-vit-base-patch32')

const FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'preprocessor_config.json',
]

for (const name of FILES) {
  const dest = path.join(OUT, name)
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log('[dl-clip-files] skip (exists):', name)
    continue
  }
  const url = `${BASE}/${name}?download=true`
  console.log('[dl-clip-files] fetching:', url)
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(dest, buf)
    console.log('[dl-clip-files] ✅ saved:', name, `(${buf.length} bytes)`)
  } catch (err) {
    console.error('[dl-clip-files] ❌ failed:', name, err)
    process.exit(1)
  }
}

console.log('[dl-clip-files] ✅ all done.')
process.exit(0)
