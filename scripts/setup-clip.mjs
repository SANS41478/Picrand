// CLIP 模型一键下载脚本
// 一条龙拉齐：基础 ONNX + vision/text 子模型 + preprocessor/config 文件
// 用法：node scripts/setup-clip.mjs
// 镜像：hf-mirror.com（HuggingFace 国内镜像）

import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const cacheRoot = path.join(__dirname, '..', '_internal_data', 'models')
const modelDir = path.join(cacheRoot, 'Xenova', 'clip-vit-base-patch32')
const onnxDir = path.join(modelDir, 'onnx')
fs.mkdirSync(cacheRoot, { recursive: true })

// ==== 步骤 1：下载合并版 ONNX（transformers.js 内部 pipeline 会触发下载）====
process.env.HF_ENDPOINT = 'https://hf-mirror.com'
const { pipeline, env } = await import('@xenova/transformers')
env.cacheDir = cacheRoot
env.allowRemoteModels = true
env.allowLocalModels = false
env.remoteHost = 'https://hf-mirror.com'

const MODEL_ID = 'Xenova/clip-vit-base-patch32'

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  CLIP 模型一键下载')
console.log('  缓存目录:', cacheRoot)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

// 步骤 1
const modelOnnx = path.join(onnxDir, 'model_quantized.onnx')
if (fs.existsSync(modelOnnx) && fs.statSync(modelOnnx).size > 10_000_000) {
  console.log('\n[1/4] 合并 ONNX 已有，跳过')
} else {
  console.log('\n[1/4] 下载合并 ONNX …')
  await pipeline('feature-extraction', MODEL_ID)
  console.log('[1/4] ✅ 完成')
}

// 步骤 2：补充 vision/text 子模型 ONNX
const BASE_ONNX = 'https://hf-mirror.com/Xenova/clip-vit-base-patch32/resolve/main/onnx'
const SUB_FILES = ['vision_model_quantized.onnx', 'text_model_quantized.onnx']

for (const name of SUB_FILES) {
  const dest = path.join(onnxDir, name)
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1_000_000) {
    console.log(`\n[2/4] ${name} 已有，跳过`)
    continue
  }
  console.log(`\n[2/4] 下载 ${name} …`)
  const res = await fetch(`${BASE_ONNX}/${name}?download=true`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  console.log(`[2/4] ✅ ${name} (${(fs.statSync(dest).size / 1024 / 1024).toFixed(1)} MB)`)
}

// 步骤 3：补充 tokenizer / config / preprocessor 文件
const BASE_CFG = 'https://hf-mirror.com/Xenova/clip-vit-base-patch32/resolve/main'
const CFG_FILES = ['tokenizer.json', 'tokenizer_config.json', 'preprocessor_config.json', 'config.json']

for (const name of CFG_FILES) {
  const dest = path.join(modelDir, name)
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    continue
  }
  console.log(`\n[3/4] 下载 ${name} …`)
  const res = await fetch(`${BASE_CFG}/${name}?download=true`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  console.log(`[3/4] ✅ ${name}`)
}

// 步骤 4：验证四组件可加载
console.log('\n[4/4] 验证模型加载 …')
env.allowRemoteModels = false
env.allowLocalModels = true
const { CLIPVisionModelWithProjection, CLIPTextModelWithProjection, AutoProcessor, AutoTokenizer } = await import('@xenova/transformers')
const results = []
const checks: Array<{ label: string; fn: () => Promise<any> }> = [
  { label: 'vision model', fn: () => CLIPVisionModelWithProjection.from_pretrained(MODEL_ID) },
  { label: 'text model',   fn: () => CLIPTextModelWithProjection.from_pretrained(MODEL_ID) },
  { label: 'processor',    fn: () => AutoProcessor.from_pretrained(MODEL_ID) },
  { label: 'tokenizer',    fn: () => AutoTokenizer.from_pretrained(MODEL_ID) },
]
for (const chk of checks) {
  try { await fn(); results.push(`✅ ${label}`) }
  catch (e: any) { results.push(`❌ ${label}: ${e.message}`) }
}
for (const r of results) console.log('  ' + r)
const okAll = results.every(r => r.startsWith('✅'))
console.log(okAll ? '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n  ✅ CLIP 模型全部就绪，AI 语义搜索可用\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' : '\n❌ 部分组件加载失败，请检查网络后重试')
process.exit(okAll ? 0 : 1)
