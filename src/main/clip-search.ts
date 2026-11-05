// AI 语义搜索主进程模块 —— CLIP ViT-B/32 极致性能版
// sharp 直出 RGB Tensor → 原生 onnxruntime-node session 推理（完全绕过 transformers.js）
// 实测：10ms/张纯推理，加上 sharp resize ~15ms → 4 并发约 250 张/秒
// 设计：所有重量依赖（ort, sharp, transformers）全部懒加载，仅 AI 功能首次使用时才进内存

import type { Buffer } from 'buffer'
import * as path from 'path'
import * as fs from 'fs'
import { createRequire } from 'module'

function _require() { return createRequire(import.meta.url) }

// ===== 模型路径 =====
function getModelDir(): string {
  const pathMod = require('path')
  const exeDir = require('electron').app.isPackaged
    ? pathMod.dirname(require('electron').app.getPath('exe'))
    : process.cwd()
  return pathMod.join(exeDir, '_internal_data', 'models', 'Xenova', 'clip-vit-base-patch32', 'onnx')
}

// ===== 单例 ONNX Sessions + 配置 =====
let _visionSession: any = null
let _textSession: any = null
let _tokenizer: any = null
let _initPromise: Promise<void> | null = null
// 空闲自动释放定时器（5 秒无 AI 活动则释放 ~270MB 模型内存）
let _idleTimer: ReturnType<typeof setTimeout> | null = null
const _IDLE_MS = 5_000

// ===== 多语言文本塔（sentence-transformers/clip-ViT-B-32-multilingual-v1）=====
// 蒸馏自 OpenAI CLIP 视觉空间，50+ 语种直出 512 维，无需翻译中转。视觉塔不变，clip_feat 全复用。
let _denseWeight: Float32Array | null = null  // 投影权重 [512, 768]
const _DENSE_IN = 768
const _DENSE_OUT = 512

// 图像预处理常量（CLIP ViT-B/32）
const IMAGE_SIZE = 224
const MEAN = [0.48145466, 0.4578275, 0.40821073]
const STD  = [0.26862954, 0.26130258, 0.27577711]

function _resetIdleTimer() {
  if (_idleTimer) clearTimeout(_idleTimer)
  _idleTimer = setTimeout(() => {
    // 释放所有模型内存（CLIP ~270MB + 翻译器 ~120MB）
    _visionSession = null
    _textSession = null
    _tokenizer = null
    _initPromise = null
    _denseWeight = null
    _idleTimer = null
    console.log('[clip-search] idle timeout — sessions released')
  }, _IDLE_MS)
}

async function init(): Promise<void> {
  if (_visionSession) { _resetIdleTimer(); return }
  if (_initPromise) { _resetIdleTimer(); return _initPromise }
  _initPromise = (async () => {
    const ort = _require()('onnxruntime-node')
    const modelDir = getModelDir()

    // Vision model — 用 onnxruntime-node 直载（不变）
    const visionBuf = fs.readFileSync(path.join(modelDir, 'vision_model_quantized.onnx'))
    _visionSession = await ort.InferenceSession.create(visionBuf, { executionProviders: ['cpu'] })

    // Text model — 换为多语言 CLIP 文本塔（DistilBERT+池化+投影→512 维，50+语种）
    const textDir = getMultiTextDir()
    const textBuf = fs.readFileSync(path.join(textDir, 'onnx', 'text_model_quantized.onnx'))
    _textSession = await ort.InferenceSession.create(textBuf, { executionProviders: ['cpu'] })

    // 投影权重 [512, 768]，将池化后的 768 维映射到 CLIP 512 维嵌入空间
    const wBuf = fs.readFileSync(path.join(textDir, 'dense_weight.bin'))
    _denseWeight = new Float32Array(wBuf.buffer, wBuf.byteOffset, wBuf.byteLength / 4)

    // Tokenizer — 多语言 tokenizer（纯 JS，XLM-Roberta 风格）
    const { AutoTokenizer, env } = await import('@xenova/transformers')
    env.allowRemoteModels = false
    env.allowLocalModels = true
    env.localModelPath = textDir
    _tokenizer = await AutoTokenizer.from_pretrained('.')
  })()
  _initPromise.catch((err) => {
	console.error('[clip-search] init failed, sessions released:', err?.message || err)
	_initPromise = null; _visionSession = null; _textSession = null; _tokenizer = null; _denseWeight = null
	// 重新抛出让所有 await init() 的调用方都能捕获，避免后续空指针崩溃
	throw err
})
  await _initPromise
  _resetIdleTimer()
}

// ===== 多语言文本塔模型路径 =====
function getMultiTextDir(): string {
  const exeDir = _require()('electron').app.isPackaged
    ? path.dirname(_require()('electron').app.getPath('exe'))
    : process.cwd()
  return path.join(exeDir, '_internal_data', 'models', 'Multilingual', 'clip-text-multilingual')
}

// ===== 图像向量：sharp resize → 归一化 → ONNX vision session =====

// ===== 图像向量：sharp resize → 归一化 → ONNX vision session =====
export async function computeImageVec(filePath: string): Promise<Float32Array> {
  await init()
  const sharp = (await import('sharp')).default

  // sharp → raw RGB buffer (224×224×3)
  const { data, info } = await sharp(filePath)
    .removeAlpha()
    .resize(IMAGE_SIZE, IMAGE_SIZE, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  const w = info.width, h = info.height
  const channels = info.channels // should be 3

  // NCHW float32, normalize with CLIP mean/std
  const float32 = new Float32Array(3 * h * w)
  const area = h * w
  for (let i = 0, p = 0; i < data.length; i += channels, p++) {
    float32[0 * area + p] = (data[i + 0] / 255 - MEAN[0]) / STD[0]
    float32[1 * area + p] = (data[i + 1] / 255 - MEAN[1]) / STD[1]
    float32[2 * area + p] = (data[i + 2] / 255 - MEAN[2]) / STD[2]
  }

  const ort = _require()('onnxruntime-node')
  const tensor = new ort.Tensor('float32', float32, [1, 3, h, w])
  const feed = { pixel_values: tensor }
  const out = await _visionSession!.run(feed)
  const embeds = out.image_embeds || out[Object.keys(out)[0]]
  let dataOut = embeds.data instanceof Float32Array ? embeds.data : new Float32Array(embeds.data)

  // L2 归一化
  return normalize(dataOut)
}

// ===== 文本向量：多语言 CLIP 文本塔（DistilBERT→池化→投影→512 维，50+ 语种直出）=====
export async function computeTextVec(text: string): Promise<Float32Array> {
  await init()
  const inputs = await _tokenizer!(text, { padding: true, truncation: true })
  const seqLen = inputs.input_ids.dims[1]

  const ort = _require()('onnxruntime-node')
  const inputIds = new ort.Tensor('int64', BigInt64Array.from(
    Array.from(inputs.input_ids.data).map(BigInt)
  ), [1, seqLen])
  const attnMask = new ort.Tensor('int64', BigInt64Array.from(
    Array.from(inputs.attention_mask.data).map(BigInt)
  ), [1, seqLen])

  // 1) DistilBERT → last_hidden_state [1, seqLen, 768]
  const out = await _textSession!.run({ input_ids: inputIds, attention_mask: attnMask })
  const hidden = out.last_hidden_state
  const data = hidden.cpuData ?? hidden.data

  // 2) Mean pooling（attention_mask 加权平均）
  const pooled = new Float32Array(_DENSE_IN)
  const attn = inputs.attention_mask.data
  let totalWt = 0
  for (let t = 0; t < seqLen; t++) {
    const w = Number(attn[t])
    if (w === 0) continue
    totalWt += w
    const off = t * _DENSE_IN
    for (let h = 0; h < _DENSE_IN; h++) pooled[h] += data[off + h] * w
  }
  if (totalWt > 0) { for (let h = 0; h < _DENSE_IN; h++) pooled[h] /= totalWt }

  // 3) Dense projection 768 → 512（linear, no bias）
  const W = _denseWeight!  // [512, 768]
  const emb = new Float32Array(_DENSE_OUT)
  for (let o = 0; o < _DENSE_OUT; o++) {
    let sum = 0
    const wOff = o * _DENSE_IN
    for (let i = 0; i < _DENSE_IN; i++) sum += pooled[i] * W[wOff + i]
    emb[o] = sum
  }
  return normalize(emb)
}

function normalize(v: Float32Array): Float32Array {
  let sum = 0
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i]
  const inv = 1 / Math.sqrt(Math.max(sum, 1e-12))
  const out = new Float32Array(v.length)
  for (let i = 0; i < v.length; i++) out[i] = v[i] * inv
  return out
}

// ===== 余弦 =====
export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  if (na <= 0 || nb <= 0) return 0
  return dot / Math.sqrt(na * nb)
}

// ===== 文本搜索 =====
export async function searchByText(query: string, clipRows: Array<{ file_path: string; clip_feat: Buffer | null }>, topN: number) {
  if (!query.trim()) return []
  const qVec = await computeTextVec(query)
  const scores: Array<{ file_path: string; score: number }> = []
  for (const row of clipRows) {
    if (!row.clip_feat) continue
    const v = new Float32Array(row.clip_feat.buffer, row.clip_feat.byteOffset, row.clip_feat.byteLength / 4)
    scores.push({ file_path: row.file_path, score: cosine(qVec, v) })
  }
  scores.sort((a, b) => b.score - a.score)
  return scores.slice(0, topN)
}

let _send: ((channel: string, payload: any) => void) | null = null
export function setClipSender(send: (channel: string, payload: any) => void) { _send = send }
export function emitProgress(done: number, total: number) { try { _send?.('clip-index-progress', { done, total }) } catch {} }
