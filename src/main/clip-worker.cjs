// CLIP vision worker — CJS module loaded via worker_threads
// Exposes: new CLIPVisionWorker({ modelPath }).init() → .execute(filePath) : Promise<Float32Array>
const { parentPort, workerData } = require('worker_threads')

let ready = false
let visionModel = null
let processor = null
let RawImage = null

// Init from workerData at launch
const modelPath = workerData?.modelPath
if (!modelPath) {
  parentPort.postMessage({ type: 'fatal', error: 'missing modelPath in workerData' })
  process.exit(1)
}

async function init() {
  try {
    const mod = await import('@xenova/transformers')
    RawImage = mod.RawImage
    visionModel = await mod.CLIPVisionModelWithProjection.from_pretrained(modelPath)
    processor = await mod.AutoProcessor.from_pretrained(modelPath)
    ready = true
    parentPort.postMessage({ type: 'ready' })
  } catch (e) {
    parentPort.postMessage({ type: 'fatal', error: String(e?.message || e) })
    process.exit(1)
  }
}

init()

parentPort.on('message', async (msg) => {
  if (!ready) return
  const { id, filePath } = msg
  try {
    const raw = await RawImage.read(filePath)
    const inputs = await processor(raw)
    const { image_embeds } = await visionModel(inputs)
    let data = image_embeds.data instanceof Float32Array ? image_embeds.data : new Float32Array(image_embeds.data)
    // normalize inline
    let sum = 0
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
    const inv = 1 / Math.sqrt(Math.max(sum, 1e-12))
    for (let i = 0; i < data.length; i++) data[i] *= inv
    parentPort.postMessage({ type: 'ok', id, vec: Buffer.from(data.buffer) })
  } catch (e) {
    parentPort.postMessage({ type: 'err', id, error: String(e?.message || e) })
  }
})
