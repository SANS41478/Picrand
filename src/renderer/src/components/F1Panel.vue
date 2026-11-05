<template>
  <Teleport to="body">
    <div class="f1-overlay">
      <div class="f1-panel">
        <div class="f1-close-btn" @click="emit('close')" :title="t('f1.close')">×</div>

        <!-- 文件名 -->
        <div class="f1-filename" v-if="image" :title="image.file_name">{{ image.file_name }}</div>

        <!-- 平均色 -->
        <div class="f1-avg-row" v-if="colorAnalysis" @click="sampleAvgColor()" :title="t('f1.clickToCopy')">
          <div class="f1-avg-swatch" :style="{background:colorAnalysis.avgHex}"></div>
          <span class="f1-avg-hex" :style="{color:colorAnalysis.avgHex}">{{ colorAnalysis.avgHex }}</span>
          <span v-if="avgColorMatch" class="f1-match-name">({{ colorName(avgColorMatch.entry) }} <span :style="{color:deColor(avgColorMatch.de)}">ΔE₀₀={{ avgColorMatch.de }}</span>)</span>
          <span class="f1-avg-label">avg</span>
        </div>

        <!-- 主色环 -->
        <div class="f1-color-ring-wrap" v-if="colorAnalysis">
          <canvas ref="colorRingCanvas" style="width:230px;height:136px"
            @mousemove="onRingMove" @mouseleave="onRingLeave" @click="onRingClick"></canvas>
        </div>

        <!-- HSV 分布三柱 -->
        <div class="f1-hsv-bars" v-if="colorAnalysis">
          <div class="f1-hsv-row">
            <span class="f1-hsv-label">H</span>
            <span class="f1-hsv-val">{{ colorAnalysis.hueAvg.toFixed(0) }}°</span>
          </div>
          <div class="f1-hsv-track">
            <canvas ref="hueBarCanvas" width="260" height="10"></canvas>
            <div class="f1-hsv-dot" :style="{left:huePct+'%',background:hueDotColor}"></div>
          </div>
          <div class="f1-hsv-row">
            <span class="f1-hsv-label">S</span>
            <span class="f1-hsv-val">{{ (colorAnalysis.satAvg*100).toFixed(0) }}%</span>
          </div>
          <div class="f1-hsv-track">
            <canvas ref="satBarCanvas" width="260" height="10"></canvas>
            <div class="f1-hsv-dot" :style="{left:satPct+'%',background:satDotColor}"></div>
          </div>
          <div class="f1-hsv-row">
            <span class="f1-hsv-label">V</span>
            <span class="f1-hsv-val">{{ (colorAnalysis.valAvg*100).toFixed(0) }}%</span>
          </div>
          <div class="f1-hsv-track">
            <canvas ref="valBarCanvas" width="260" height="10"></canvas>
            <div class="f1-hsv-dot" :style="{left:valPct+'%',background:'#fff'}"></div>
          </div>
        </div>

        <!-- 直方图 -->
        <div class="f1-hist-row">
          <div class="f1-hist-left">
            <canvas ref="previewCanvas" width="100" height="100"></canvas>
          </div>
          <div class="f1-hist-right">
            <canvas ref="histCanvas" width="184" height="72"></canvas>
            <div class="f1-hist-btns">
              <button v-for="ch in histBtns" :key="ch.k" :class="{on:active===ch.k}" @click="active=ch.k;drawHist()">{{ch.l}}</button>
            </div>
          </div>
        </div>
        <!-- H-S 色盘 + V 明度柱 -->
        <div class="f1-row">
          <div class="f1-hs-wrap">
            <canvas ref="hsCanvas" width="240" height="120"></canvas>
            <div class="hs-dot" v-if="sample" :style="{ left: sample.h/360*100+'%', top: (1-sample.s)*100+'%' }"></div>
          </div>
          <div class="f1-v-wrap">
            <canvas ref="vCanvas" width="32" height="120"></canvas>
            <div class="v-dot" v-if="sample" :style="{ top: (1-sample.v)*100+'%' }"></div>
          </div>
        </div>
        <!-- 色卡 -->
        <div class="f1-swatches">
          <div v-if="swatches.length" :style="{background:swatches[0].hex}" class="sw-main"
            @click.left="syncSwatch(swatches[0])" @click.right.prevent="removeSwatch(0)"></div>
          <div v-else class="sw-main empty"></div>
          <div class="sw-grid">
            <div v-for="i in 10" :key="i" class="sw-cell">
              <div v-if="swatches[i]" :style="{background:swatches[i].hex}" class="sw"
                @click.left="syncSwatch(swatches[i])" @click.right.prevent="removeSwatch(i)"></div>
              <div v-else class="sw empty"></div>
            </div>
          </div>
          <div class="f1-swatch-actions">
            <button class="f1-swatch-btn" @click="copySwatches" :title="t('f1.copySwatches')" :disabled="!swatches.length">&#x2398;</button>
            <button class="f1-swatch-btn" @click="pasteSwatches" :title="t('f1.pasteSwatches')" :disabled="!_swatchClipboard">&#x21B4;</button>
            <button class="f1-swatch-btn del" @click="clearSwatches" :title="t('f1.clearSwatches')" :disabled="!swatches.length">&#x2715;</button>
          </div>
        </div>
        <!-- 颜色信息（每行可点击复制，HSV 由 RGB 计算保证一致性） -->
        <div class="f1-info" v-if="sample">
          <div class="f1-info-row" @click="copyWithFeedback('hex', sample.hex)" :title="t('f1.clickToCopy')">HEX <span :style="{color:sample.hex}">{{ sample.hex }}</span><span class="f1-copied" :style="{opacity:copiedKey==='hex'?1:0}">✓</span></div>
          <div class="f1-info-row" @click="copyWithFeedback('hsv', 'hsv('+hsvFromRgb(sample.r,sample.g,sample.b).h.toFixed(1)+', '+(hsvFromRgb(sample.r,sample.g,sample.b).s*100).toFixed(1)+'%, '+(hsvFromRgb(sample.r,sample.g,sample.b).v*100).toFixed(1)+'%)')" :title="t('f1.clickToCopy')">HSV <span>hsv({{ hsvFromRgb(sample.r,sample.g,sample.b).h.toFixed(1) }}, {{ (hsvFromRgb(sample.r,sample.g,sample.b).s*100).toFixed(1) }}%, {{ (hsvFromRgb(sample.r,sample.g,sample.b).v*100).toFixed(1) }}%)</span><span class="f1-copied" :style="{opacity:copiedKey==='hsv'?1:0}">✓</span></div>
          <div class="f1-info-row" @click="copyWithFeedback('rgb', 'rgb('+sample.r+', '+sample.g+', '+sample.b+')')" :title="t('f1.clickToCopy')">RGB <span>rgb({{ sample.r }}, {{ sample.g }}, {{ sample.b }})</span><span class="f1-copied" :style="{opacity:copiedKey==='rgb'?1:0}">✓</span></div>
          <div class="f1-info-row" @click="copyWithFeedback('rgbf', 'vec3('+(sample.r/255).toFixed(3)+', '+(sample.g/255).toFixed(3)+', '+(sample.b/255).toFixed(3)+')')" :title="t('f1.clickToCopy')">RGBf <span>vec3({{ (sample.r/255).toFixed(3) }}, {{ (sample.g/255).toFixed(3) }}, {{ (sample.b/255).toFixed(3) }})</span><span class="f1-copied" :style="{opacity:copiedKey==='rgbf'?1:0}">✓</span></div>
          <div class="f1-info-row f1-match" v-if="sampleColorMatch">→ {{ colorName(sampleColorMatch.entry) }} <span class="f1-match-sim" :style="{color:deColor(sampleColorMatch.de)}">ΔE₀₀={{ sampleColorMatch.de }}</span><span class="f1-match-src">{{ sampleColorMatch.entry.source }}</span></div>
        </div>
        <!-- 灯箱通道过滤 -->
        <div class="f1-chan-row">
          <span class="f1-chan-label">Ch</span>
          <label class="f1-chan" v-for="ch in imgChannels" :key="ch.k" :class="{off:!ch.on.value}" :style="{borderColor:ch.color,color:ch.on.value?ch.color:'rgba(255,255,255,0.25)'}">
            <input type="checkbox" v-model="ch.on.value" @change="updateImgFilter()">
            <span>{{ ch.l }}</span>
          </label>
          <label class="f1-chan" :class="{off:!alphaOn}" :style="{borderColor:'#fff',color:alphaOn?'#fff':'rgba(255,255,255,0.25)'}">
            <input type="checkbox" v-model="alphaOn" @change="updateImgFilter()">
            <span>A</span>
          </label>
        </div>
        <!-- 元数据 -->
        <div class="f1-meta" v-if="meta">
          <span>{{ meta.width }}x{{ meta.height }}</span>
          <span :class="meta.isPotWidth&&meta.isPotHeight?'pot-ok':'pot-no'">{{ meta.isPotWidth&&meta.isPotHeight?'POT':'NPOT' }}</span>
          <span>{{ formatSize(meta.fileSize) }}</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useGalleryStore } from '../stores/gallery'
import { useI18n } from '../i18n'
import colorDB from '../color-db.json'

const props = defineProps<{ image: ImageItem | null; visible: boolean }>()
const emit = defineEmits(['close'])
const gallery = useGalleryStore()
const { t, locale } = useI18n()

type ColorEntry = { hex: string; name: string; source: string; en: string; "zh-Hant"?: string }
function colorName(c: ColorEntry): string {
  if (locale.value === 'zh' || locale.value === 'ja') return c.name
  if (locale.value === 'zh-Hant') return c['zh-Hant'] || c.name
  return c.en || c.name
}
const _colorDB = colorDB as ColorEntry[]

// CIEDE2000 RGB→Lab + 色差计算
function rgb2lab(R: number, G: number, B: number): [number, number, number] {
  let r = R / 255, g = G / 255, b = B / 255
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750
  const z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883
  const fx = x > 0.008856 ? Math.cbrt(x) : 7.787 * x + 16 / 116
  const fy = y > 0.008856 ? Math.cbrt(y) : 7.787 * y + 16 / 116
  const fz = z > 0.008856 ? Math.cbrt(z) : 7.787 * z + 16 / 116
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}
function ciede2000(L1: number, a1: number, b1: number, L2: number, a2: number, b2: number): number {
  const kL = 1, kC = 1, kH = 1
  const C1 = Math.sqrt(a1 * a1 + b1 * b1), C2 = Math.sqrt(a2 * a2 + b2 * b2)
  const Cb = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))))
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G)
  const C1p = Math.sqrt(a1p * a1p + b1 * b1), C2p = Math.sqrt(a2p * a2p + b2 * b2)
  let h1p = (Math.atan2(b1, a1p) * 180 / Math.PI + 360) % 360
  let h2p = (Math.atan2(b2, a2p) * 180 / Math.PI + 360) % 360
  const dLp = L2 - L1, dCp = C2p - C1p
  let dhp = h2p - h1p
  if (C1p * C2p === 0) dhp = 0
  else { if (dhp > 180) dhp -= 360; if (dhp < -180) dhp += 360 }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * Math.PI / 360)
  const Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2
  let hb = (h1p + h2p) / 2
  if (C1p * C2p === 0) hb = h1p + h2p
  else if (Math.abs(h1p - h2p) > 180) hb = hb < 180 ? hb + 180 : hb - 180
  const T = 1 - 0.17 * Math.cos((hb - 30) * Math.PI / 180) + 0.24 * Math.cos(2 * hb * Math.PI / 180) + 0.32 * Math.cos((3 * hb + 6) * Math.PI / 180) - 0.2 * Math.cos((4 * hb - 63) * Math.PI / 180)
  const SL = 1 + (0.015 * Math.pow(Lb - 50, 2)) / Math.sqrt(20 + Math.pow(Lb - 50, 2))
  const SC = 1 + 0.045 * Cbp
  const SH = 1 + 0.015 * Cbp * T
  const RT = (-2) * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7))) * Math.sin(60 * Math.exp((-1) * Math.pow((hb - 275) / 25, 2)) * Math.PI / 180)
  return Math.sqrt(Math.pow(dLp / (kL * SL), 2) + Math.pow(dCp / (kC * SC), 2) + Math.pow(dHp / (kH * SH), 2) + RT * (dCp / (kC * SC)) * (dHp / (kH * SH)))
}

function findClosestColor(hex: string): { entry: ColorEntry; de: number } | null {
  const mode = gallery.colorRef
  let pool: ColorEntry[]
  if (mode === 'traditional') pool = _colorDB.filter(c => c.source === '中' || c.source === '日')
  else if (mode === 'pantone') pool = _colorDB.filter(c => c.source === '商')
  else pool = _colorDB
  if (!pool.length) return null
  const r1 = parseInt(hex.slice(1, 3), 16)
  const g1 = parseInt(hex.slice(3, 5), 16)
  const b1 = parseInt(hex.slice(5, 7), 16)
  const lab1 = rgb2lab(r1, g1, b1)
  let best: ColorEntry = pool[0]
  let bestDE = Infinity
  for (const c of pool) {
    const r2 = parseInt(c.hex.slice(1, 3), 16)
    const g2 = parseInt(c.hex.slice(3, 5), 16)
    const b2 = parseInt(c.hex.slice(5, 7), 16)
    const lab2 = rgb2lab(r2, g2, b2)
    const de = ciede2000(lab1[0], lab1[1], lab1[2], lab2[0], lab2[1], lab2[2])
    if (de < bestDE) { bestDE = de; best = c }
  }
  return { entry: best, de: Math.round(bestDE * 100) / 100 }
}

function deColor(de: number): string {
  if (de <= 2.5) return '#22c55e'
  if (de >= 5) return '#ef4444'
  return 'inherit'
}

// 颜色参照变更时重绘
watch(() => gallery.colorRef, () => { drawColorRing() })

const hsCanvas = ref<HTMLCanvasElement | null>(null)
const vCanvas = ref<HTMLCanvasElement | null>(null)
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const histCanvas = ref<HTMLCanvasElement | null>(null)
const colorRingCanvas = ref<HTMLCanvasElement | null>(null)
let _hoveredRingIdx = -1
const hueBarCanvas = ref<HTMLCanvasElement | null>(null)
const satBarCanvas = ref<HTMLCanvasElement | null>(null)
const valBarCanvas = ref<HTMLCanvasElement | null>(null)

const sample = ref<{ h:number;s:number;v:number;hex:string;r:number;g:number;b:number } | null>(null)
const swatches = ref<Array<{hex:string;r:number;g:number;b:number;h:number;s:number;v:number}>>([])
const _swatchClipboard = ref<Array<{hex:string;r:number;g:number;b:number;h:number;s:number;v:number}> | null>(null)
const hist = ref<HistogramData | null>(null)
const meta = ref<ImageMetadata | null>(null)
const colorAnalysis = ref<ColorAnalysis | null>(null)
const currentPath = ref('')
const active = ref(0)
const histBtns = [
  {k:0,l:'L'},{k:1,l:'R'},{k:2,l:'G'},{k:3,l:'B'},{k:4,l:'A'},
]

const huePct = computed(() => colorAnalysis.value ? (colorAnalysis.value.hueAvg / 360) * 100 : 0)
const satPct = computed(() => colorAnalysis.value ? colorAnalysis.value.satAvg * 100 : 0)
const valPct = computed(() => colorAnalysis.value ? colorAnalysis.value.valAvg * 100 : 0)
const hueDotColor = computed(() => {
  const h = colorAnalysis.value?.hueAvg ?? 0
  const [r, g, b] = hsvToRgb(h, 1, 1)
  return `rgb(${r},${g},${b})`
})
const satDotColor = computed(() => {
  if (!colorAnalysis.value) return '#888'
  const [r, g, b] = hsvToRgb(colorAnalysis.value.hueAvg, colorAnalysis.value.satAvg, 1)
  return `rgb(${r},${g},${b})`
})

// 最近色名匹配（取样色 / 平均色）
const sampleColorMatch = computed(() => {
  void gallery.colorRef  // 依赖 colorRef 变更时重算
  return sample.value ? findClosestColor(sample.value.hex) : null
})
const avgColorMatch = computed(() => {
  void gallery.colorRef
  return colorAnalysis.value ? findClosestColor(colorAnalysis.value.avgHex) : null
})

const imgChannels = [
  {k:'r', l:'R', color:'#ef4444', on:ref(true)},
  {k:'g', l:'G', color:'#22c55e', on:ref(true)},
  {k:'b', l:'B', color:'#3b82f6', on:ref(true)},
]
const alphaOn = ref(false)
let _svgFilter: SVGElement | null = null
let _svgEl: SVGElement | null = null
let _lastMode: 'rgb' | 'alpha' | '' = ''
let _styledImg: HTMLImageElement | null = null
let _filterId = ''

function applyFilterStyle(img: HTMLImageElement) {
  if (_styledImg === img && img.style.filter) return
  // 灯箱切图会销毁重建 img 元素：把残留样式从旧 img 摘掉，挂到当前 img 上
  if (_styledImg && _styledImg !== img) { try { _styledImg.style.filter = '' } catch {} }
  img.style.filter = `url(#${_filterId})`
  _styledImg = img
}

// Chromium 已知问题：合成层元素（viewerjs 缩放/拖拽/旋转会给 img 持续设置 transform）通过
// filter:url(#...) 引用的 SVG 滤镜，其内部矩阵被修改时可能不触发重绘，显示结果冻结在
// 上一次绘制状态。同步摘掉样式并强制 reflow 后挂回，保证滤镜被重新计算（同帧完成，无闪烁）。
function forceFilterRepaint(img: HTMLElement) {
  if (!img.style.filter) return
  const f = img.style.filter
  img.style.filter = ''
  void img.offsetWidth
  img.style.filter = f
}

function updateImgFilter() {
  const img = document.querySelector('.viewer-canvas img') as HTMLImageElement | null
  if (!img) return
  if (!_svgEl) {
    // 清掉历史实例可能残留的滤镜 svg：id 冲突时 url(#id) 解析到文档中第一个同 id 元素，
    // 旧滤镜会遮蔽新滤镜，表现为图片锁死在旧通道状态且按钮无效
    document.querySelectorAll('svg[data-f1-channel-filter]').forEach(el => el.remove())
    _filterId = 'f1-channel-filter-' + Math.random().toString(36).slice(2, 8)
    _svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    _svgEl.setAttribute('style', 'position:fixed;width:0;height:0;pointer-events:none')
    _svgEl.setAttribute('data-f1-channel-filter', '1')
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter')
    filter.setAttribute('id', _filterId)
    filter.setAttribute('color-interpolation-filters', 'sRGB')
    // 严格限制滤镜效果区域到元素边界，不向外溢出
    filter.setAttribute('x', '0%')
    filter.setAttribute('y', '0%')
    filter.setAttribute('width', '100%')
    filter.setAttribute('height', '100%')
    _svgEl.appendChild(filter)
    document.body.appendChild(_svgEl)
    _svgFilter = filter
  }
  applyFilterStyle(img)

  const mode = alphaOn.value ? 'alpha' : 'rgb'
  if (mode === _lastMode && mode === 'rgb') {
    // 仅更新 RGB 矩阵值
    const cm = _svgFilter!.querySelector('feColorMatrix') as SVGElement | null
    if (cm) {
      const r = imgChannels[0].on.value ? 1 : 0
      const g = imgChannels[1].on.value ? 1 : 0
      const b = imgChannels[2].on.value ? 1 : 0
      cm.setAttribute('values', `${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`)
      forceFilterRepaint(img)
    }
    return
  }
  if (mode === _lastMode) return // alpha→alpha 无需重建
  _lastMode = mode

  // 清空 filter 子元素重建
  while (_svgFilter!.firstChild) _svgFilter!.removeChild(_svgFilter!.firstChild)

  if (mode === 'alpha') {
    // Alpha 通道模式：映射 Alpha→灰度（保持透明度），feFlood 黑底合成
    const cm = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix')
    cm.setAttribute('type', 'matrix')
    cm.setAttribute('values', '0 0 0 1 0  0 0 0 1 0  0 0 0 1 0  0 0 0 1 0')
    cm.setAttribute('result', 'alphaGray')
    _svgFilter!.appendChild(cm)

    const flood = document.createElementNS('http://www.w3.org/2000/svg', 'feFlood')
    flood.setAttribute('flood-color', '#000')
    flood.setAttribute('flood-opacity', '1')
    flood.setAttribute('result', 'blackBg')
    _svgFilter!.appendChild(flood)

    const merge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge')
    const mn1 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode')
    mn1.setAttribute('in', 'blackBg')
    const mn2 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode')
    mn2.setAttribute('in', 'alphaGray')
    merge.appendChild(mn1)
    merge.appendChild(mn2)
    _svgFilter!.appendChild(merge)
  } else {
    const cm = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix')
    cm.setAttribute('type', 'matrix')
    const r = imgChannels[0].on.value ? 1 : 0
    const g = imgChannels[1].on.value ? 1 : 0
    const b = imgChannels[2].on.value ? 1 : 0
    cm.setAttribute('values', `${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`)
    _svgFilter!.appendChild(cm)
  }
  forceFilterRepaint(img)
}

function removeImgFilter() {
  const img = document.querySelector('.viewer-canvas img') as HTMLElement | null
  if (img) img.style.filter = ''
  // querySelector 拿到的可能是别的 img（切图竞态），把真正挂过样式的元素也清一遍
  if (_styledImg) { try { _styledImg.style.filter = '' } catch {} }
  _styledImg = null
  if (_svgEl) {
    _svgEl.remove()
    _svgEl = null
    _svgFilter = null
    _lastMode = ''
  }
  // 防御：扫掉任何残留的同源滤镜 svg，避免 id 遮蔽
  document.querySelectorAll('svg[data-f1-channel-filter]').forEach(el => el.remove())
}

function onF1Escape(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    ev.preventDefault()
    ev.stopPropagation()
    ev.stopImmediatePropagation()
    emit('close')
  }
}

let sampleTimer: any = null
let cleanup: (()=>void) | null = null

function onGifFrameUpdate(e: Event) {
  const detail = (e as CustomEvent).detail
  if (!detail?.path) return
  currentPath.value = detail.path
  loadMeta(); loadHist(); loadColorAnalysis()
  nextTick(() => { drawVBar(); updateImgFilter() })
}

function setViewerCursor(c: string) {
  const img = document.querySelector('.viewer-canvas img') as HTMLElement | null
  if (img) img.style.cursor = c
}

let _cachedImg: HTMLImageElement | null = null
function getViewerImg(): HTMLImageElement | null {
  if (!_cachedImg || !document.contains(_cachedImg)) {
    _cachedImg = document.querySelector('.viewer-canvas img') as HTMLImageElement | null
  }
  return _cachedImg
}

function drawPreview(cx: number, cy: number) {
  const pc = previewCanvas.value; if (!pc) return
  const img = getViewerImg()
  if (!img || !img.complete || img.naturalWidth === 0) return
  const ctx = pc.getContext('2d')!; const pw = pc.width, ph = pc.height
  ctx.clearRect(0, 0, pw, ph)
  const r = img.getBoundingClientRect()
  const iw = img.naturalWidth, ih = img.naturalHeight
  if (!iw || !ih) return
  const px = Math.round((cx - r.left) / r.width * iw)
  const py = Math.round((cy - r.top) / r.height * ih)
  const half = 12
  const sx = Math.max(0, Math.min(iw - half * 2, px - half))
  const sy = Math.max(0, Math.min(ih - half * 2, py - half))
  ctx.drawImage(img, sx, sy, half * 2, half * 2, 0, 0, pw, ph)
  // crosshair
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(pw / 2, 0); ctx.lineTo(pw / 2, ph); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(0, ph / 2); ctx.lineTo(pw, ph / 2); ctx.stroke()
}

function attachViewerListeners() {
  let isDown = false, drag = false, lx = 0, ly = 0
  let _lastSrc = ''
  let _altDrag = false
  let _selOverlay: HTMLElement | null = null
  setViewerCursor('crosshair')

  function getOrCreateSelOverlay(): HTMLElement {
    if (!_selOverlay) {
      _selOverlay = document.createElement('div')
      _selOverlay.style.cssText = 'position:fixed;border:1px solid rgba(0,255,255,0.7);pointer-events:none;z-index:99999;display:none'
      document.body.appendChild(_selOverlay)
    }
    return _selOverlay
  }

  function removeSelOverlay() {
    if (_selOverlay) { _selOverlay.remove(); _selOverlay = null }
  }

  // MutationObserver：切换图片后自动刷新颜色数据，不依赖鼠标移动
  let _navDebounce: ReturnType<typeof setTimeout> | null = null
  let _navObserver: MutationObserver | null = null

  function refreshF1Data() {
    const img = document.querySelector('.viewer-canvas img') as HTMLImageElement | null
    if (!img) return
    img.draggable = false
    const src = img.getAttribute('src')
    if (!src || src === _lastSrc) return
    _lastSrc = src; _cachedImg = img
    const m = src.match(/[?&](?:path|orig)=([^&]+)/)
    if (m) { try { currentPath.value = decodeURIComponent(m[1]) } catch {} }
    loadMeta(); loadHist(); loadColorAnalysis()
    nextTick(() => { drawVBar(); updateImgFilter() })
  }

  function onNavDetected() {
    if (_navDebounce) clearTimeout(_navDebounce)
    _navDebounce = setTimeout(() => {
      refreshF1Data()
      // 重新挂载 observer 到新的 .viewer-canvas（导航时会重建 DOM）
      observeViewerCanvas()
    }, 100)
  }

  function observeViewerCanvas() {
    if (_navObserver) _navObserver.disconnect()
    _navObserver = new MutationObserver(() => onNavDetected())
    const target = document.querySelector('.viewer-canvas')
    if (target) {
      _navObserver.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] })
    }
  }
  observeViewerCanvas()

  const onDown = (ev: PointerEvent) => {
    const target = ev.target as HTMLElement | null
    if (!target?.closest('.viewer-canvas')) return
    isDown = true; drag = false; lx = ev.clientX; ly = ev.clientY
    _altDrag = ev.altKey
    if (_altDrag) { ev.stopImmediatePropagation(); setViewerCursor('crosshair') }
  }
  const onMove = (ev: PointerEvent) => {
    if (ev.target && (ev.target as HTMLElement).closest('.viewer-canvas')) {
      drawPreview(ev.clientX, ev.clientY)
    }
    if (!isDown) return
    if (_altDrag) {
      ev.stopImmediatePropagation()
      const dx = Math.abs(ev.clientX - lx), dy = Math.abs(ev.clientY - ly)
      if (dx > 3 || dy > 3) {
        drag = true
        const overlay = getOrCreateSelOverlay()
        overlay.style.display = 'block'
        overlay.style.left = Math.min(lx, ev.clientX) + 'px'
        overlay.style.top = Math.min(ly, ev.clientY) + 'px'
        overlay.style.width = dx + 'px'
        overlay.style.height = dy + 'px'
      }
      return
    }
    if (drag) return
    const dx = Math.abs(ev.clientX-lx), dy = Math.abs(ev.clientY-ly)
    if (dx > 5 || dy > 5) { drag = true; setViewerCursor('grabbing') }
  }
  const onUp = (ev: PointerEvent) => {
    isDown = false
    setViewerCursor('crosshair')
    if (_selOverlay) _selOverlay.style.display = 'none'
    if (_altDrag) {
      ev.stopImmediatePropagation()
      if (!drag) { _altDrag = false; return }
      _altDrag = false; drag = false
      const dx = Math.abs(ev.clientX-lx), dy = Math.abs(ev.clientY-ly)
      if (dx < 6 || dy < 6) return
      const target = ev.target as HTMLElement | null
      if (!target?.closest('.viewer-canvas')) return
      const canvas = document.querySelector('.viewer-canvas') as HTMLElement | null
      const img = canvas?.querySelector('img') as HTMLImageElement | null
      if (!img || !props.image) return
      const r = img.getBoundingClientRect()
      const iw = img.naturalWidth || props.image.width || 0
      const ih = img.naturalHeight || props.image.height || 0
      if (!iw || !ih) return
      const sx = Math.round((Math.min(lx, ev.clientX) - r.left) / r.width * iw)
      const sy = Math.round((Math.min(ly, ev.clientY) - r.top) / r.height * ih)
      const sw = Math.max(1, Math.round(dx / r.width * iw))
      const sh = Math.max(1, Math.round(dy / r.height * ih))
      doSampleRect(sx, sy, sw, sh)
      return
    }
    _altDrag = false
    if (drag) return
    const dx = Math.abs(ev.clientX-lx), dy = Math.abs(ev.clientY-ly)
    if (dx >= 6 || dy >= 6) return
    const target = ev.target as HTMLElement | null
    if (!target?.closest('.viewer-canvas')) return
    const canvas = document.querySelector('.viewer-canvas') as HTMLElement | null
    const img = canvas?.querySelector('img') as HTMLImageElement | null
    if (!img || !props.image) return
    const r = img.getBoundingClientRect()
    const iw = img.naturalWidth || props.image.width || 0
    const ih = img.naturalHeight || props.image.height || 0
    if (!iw || !ih) return
    const x = Math.round((ev.clientX-r.left)/r.width * iw)
    const y = Math.round((ev.clientY-r.top)/r.height * ih)
    doSample(x, y)
  }
  document.addEventListener('pointerdown', onDown, true)
  document.addEventListener('pointermove', onMove, true)
  document.addEventListener('pointerup', onUp, true)
  cleanup = () => {
    setViewerCursor('')
    removeSelOverlay()
    if (_navObserver) _navObserver.disconnect()
    if (_navDebounce) clearTimeout(_navDebounce)
    document.removeEventListener('pointerdown', onDown, true)
    document.removeEventListener('pointermove', onMove, true)
    document.removeEventListener('pointerup', onUp, true)
  }
}

async function doSample(x: number, y: number) {
  const fp = currentPath.value || props.image?.file_path
  if (!fp) return
  if (sampleTimer) clearTimeout(sampleTimer)
  sampleTimer = setTimeout(async () => {
    const p = await window.picrand.samplePixel?.(fp, x, y)
    if (!p) return
    sample.value = { h: p.h, s: p.s, v: p.v, hex: p.hex, r: p.r, g: p.g, b: p.b }
    swatches.value = [{ hex: p.hex, r: p.r, g: p.g, b: p.b, h: p.h, s: p.s, v: p.v }, ...swatches.value].slice(0, 11)
    nextTick(() => drawVBar())
  }, 30)
}

async function doSampleRect(x: number, y: number, w: number, h: number) {
  const fp = currentPath.value || props.image?.file_path
  if (!fp) return
  if (sampleTimer) clearTimeout(sampleTimer)
  sampleTimer = setTimeout(async () => {
    const p = await window.picrand.sampleRect?.(fp, x, y, w, h)
    if (!p) return
    sample.value = { h: p.h, s: p.s, v: p.v, hex: p.hex, r: p.r, g: p.g, b: p.b }
    swatches.value = [{ hex: p.hex, r: p.r, g: p.g, b: p.b, h: p.h, s: p.s, v: p.v }, ...swatches.value].slice(0, 11)
    nextTick(() => drawVBar())
  }, 30)
}

async function loadMeta() {
  const fp = currentPath.value || props.image?.file_path
  if (!fp) return
  meta.value = await window.picrand.getImageMetadata?.(fp)
}
async function loadHist() {
  const fp = currentPath.value || props.image?.file_path
  if (!fp) return
  hist.value = await window.picrand.computeHistogram?.(fp, 4)
  nextTick(() => drawHist())
}
function drawHist() {
  const c = histCanvas.value; if (!c || !hist.value) return
  const ctx = c.getContext('2d')!; const w = c.width, h = c.height
  ctx.clearRect(0, 0, w, h)
  const bw = w / 256
  const keys = ['luma','red','green','blue']
  const cols = ['#aaa','#ef4444','#22c55e','#3b82f6']
  if (active.value === 4) {
    // All: overlay R+G+B
    let globalMax = 1
    for (let k = 1; k <= 3; k++) {
      const arr = hist.value[keys[k] as keyof HistogramData] as number[]
      if (arr) globalMax = Math.max(globalMax, ...arr)
    }
    for (let k = 1; k <= 3; k++) {
      const data = hist.value[keys[k] as keyof HistogramData] as number[]
      if (!data?.length) continue
      for (let i = 0; i < 256; i++) {
        const bh = (data[i] / globalMax) * h
        ctx.fillStyle = cols[k] + '66'; ctx.fillRect(i*bw, h-bh, bw-0.5, bh)
        ctx.fillStyle = cols[k]; ctx.fillRect(i*bw, h-bh, bw-0.5, 1)
      }
    }
  } else {
    const data = hist.value[keys[active.value] as keyof HistogramData] as number[]
    if (!data?.length) return
    const max = Math.max(1, ...data)
    for (let i = 0; i < 256; i++) {
      const bh = (data[i] / max) * h
      ctx.fillStyle = cols[active.value] + '66'; ctx.fillRect(i*bw, h-bh, bw-0.5, bh)
      ctx.fillStyle = cols[active.value]; ctx.fillRect(i*bw, h-bh, bw-0.5, 1)
    }
  }
}

function drawHSMap() {
  const c = hsCanvas.value; if (!c) return
  const ctx = c.getContext('2d')!; const w = c.width, h = c.height
  const img = ctx.createImageData(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const hue = (x / w) * 360; const sat = 1 - y / h; const vv = 1
      const cc = vv * sat; const xx = cc * (1 - Math.abs(((hue/60)%2)-1)); const m = vv - cc
      let r=0,g=0,b=0
      if (hue<60){r=cc;g=xx} else if (hue<120){r=xx;g=cc} else if (hue<180){g=cc;b=xx} else if (hue<240){g=xx;b=cc} else if (hue<300){r=xx;b=cc} else {r=cc;b=xx}
      const idx = (y*w+x)*4
      img.data[idx]=Math.round((r+m)*255); img.data[idx+1]=Math.round((g+m)*255); img.data[idx+2]=Math.round((b+m)*255); img.data[idx+3]=255
    }
  }
  ctx.putImageData(img, 0, 0)
}

function hsvToRgb(h: number, s: number, v: number) {
  const c = v * s; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = v - c
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c } else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c } else if (h < 300) { r = x; b = c } else { r = c; b = x }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

// 从 RGB 计算 HSV，保证前端显示值互转一致
function hsvFromRgb(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const fr = r / 255, fg = g / 255, fb = b / 255
  const cmax = Math.max(fr, fg, fb), cmin = Math.min(fr, fg, fb), delta = cmax - cmin
  let h = 0, s = 0
  if (delta > 0.0001) {
    if (cmax === fr) h = ((fg - fb) / delta) % 6
    else if (cmax === fg) h = (fb - fr) / delta + 2
    else h = (fr - fg) / delta + 4
    h = (h < 0 ? h + 6 : h) * 60
    s = delta / cmax
  }
  return { h, s, v: cmax }
}

function drawVBar() {
  const c = vCanvas.value; if (!c) return
  const ctx = c.getContext('2d')!; const w = c.width, h = c.height
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  let vColor: number[] | null = null
  if (sample.value) {
    const top = hsvToRgb(sample.value.h, sample.value.s, 1)
    const bot = hsvToRgb(sample.value.h, sample.value.s, 0)
    grad.addColorStop(0, `rgb(${top[0]},${top[1]},${top[2]})`)
    grad.addColorStop(1, `rgb(${bot[0]},${bot[1]},${bot[2]})`)
    vColor = hsvToRgb(sample.value.h, sample.value.s, sample.value.v)
  } else {
    grad.addColorStop(0, '#fff')
    grad.addColorStop(1, '#000')
  }
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h)
  if (sample.value && vColor) {
    const vy = (1 - sample.value.v) * h
    const inv = [255 - vColor[0], 255 - vColor[1], 255 - vColor[2]]
    ctx.strokeStyle = `rgb(${inv[0]},${inv[1]},${inv[2]})`
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(0, vy); ctx.lineTo(w, vy); ctx.stroke()
    // triangle on right
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.moveTo(w + 3, vy); ctx.lineTo(w + 7, vy - 3); ctx.lineTo(w + 7, vy + 3); ctx.closePath(); ctx.fill()
  }
}

function copySwatch(s: {r:number;g:number;b:number}) { navigator.clipboard.writeText(`vec3(${(s.r/255).toFixed(3)}, ${(s.g/255).toFixed(3)}, ${(s.b/255).toFixed(3)})`) }
const copiedKey = ref('')
let _copyTimer: ReturnType<typeof setTimeout> | null = null
function copyWithFeedback(key: string, text: string) {
  navigator.clipboard.writeText(text)
  copiedKey.value = key
  if (_copyTimer) clearTimeout(_copyTimer)
  _copyTimer = setTimeout(() => { copiedKey.value = '' }, 800)
}
function syncSwatch(s: {h:number;s:number;v:number;hex:string;r:number;g:number;b:number}) {
  sample.value = { h: s.h, s: s.s, v: s.v, hex: s.hex, r: s.r, g: s.g, b: s.b }
  nextTick(() => drawVBar())
}
function removeSwatch(idx: number) {
  swatches.value = swatches.value.filter((_, i) => i !== idx)
}
function copySwatches() {
  if (!swatches.value.length) return
  _swatchClipboard.value = swatches.value.map(s => ({ ...s }))
}
function pasteSwatches() {
  if (!_swatchClipboard.value) return
  swatches.value = _swatchClipboard.value.map(s => ({ ...s }))
  sample.value = null
  nextTick(() => drawVBar())
}
function clearSwatches() {
  swatches.value = []
}
function formatSize(b: number) { return b<1048576 ? (b/1024).toFixed(0)+'KB' : (b/1048576).toFixed(1)+'MB' }

async function loadColorAnalysis() {
  const fp = currentPath.value || props.image?.file_path
  if (!fp) return
  colorAnalysis.value = null
  const ca = await window.picrand.computeColorAnalysis?.(fp)
  colorAnalysis.value = ca || null
  await nextTick()
  drawHueBar(); drawSatBar(); drawValBar(); drawColorRing()
}

function drawHueBar() {
  const c = hueBarCanvas.value; if (!c) return
  const ctx = c.getContext('2d')!; const w = c.width, h = c.height
  const img = ctx.createImageData(w, 1)
  for (let x = 0; x < w; x++) {
    const hue = (x / w) * 360
    const [r, g, b] = hsvToRgb(hue, 1, 1)
    img.data[x * 4] = r; img.data[x * 4 + 1] = g; img.data[x * 4 + 2] = b; img.data[x * 4 + 3] = 255
  }
  // 纵向拉伸到 h
  const stretched = ctx.createImageData(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = x * 4, di = (y * w + x) * 4
      stretched.data[di] = img.data[si]; stretched.data[di + 1] = img.data[si + 1]
      stretched.data[di + 2] = img.data[si + 2]; stretched.data[di + 3] = 255
    }
  }
  ctx.putImageData(stretched, 0, 0)
}

function drawSatBar() {
  const c = satBarCanvas.value; if (!c || !colorAnalysis.value) return
  const ctx = c.getContext('2d')!; const w = c.width, h = c.height
  const hue = colorAnalysis.value.hueAvg
  const img = ctx.createImageData(w, 1)
  for (let x = 0; x < w; x++) {
    const s = x / w
    const [r, g, b] = hsvToRgb(hue, s, 1)
    img.data[x * 4] = r; img.data[x * 4 + 1] = g; img.data[x * 4 + 2] = b; img.data[x * 4 + 3] = 255
  }
  const stretched = ctx.createImageData(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = x * 4, di = (y * w + x) * 4
      stretched.data[di] = img.data[si]; stretched.data[di + 1] = img.data[si + 1]
      stretched.data[di + 2] = img.data[si + 2]; stretched.data[di + 3] = 255
    }
  }
  ctx.putImageData(stretched, 0, 0)
}

function drawValBar() {
  const c = valBarCanvas.value; if (!c) return
  const ctx = c.getContext('2d')!; const w = c.width, h = c.height
  // 纯黑到白横向渐变
  const img = ctx.createImageData(w, 1)
  for (let x = 0; x < w; x++) {
    const v = Math.round((x / w) * 255)
    img.data[x * 4] = v; img.data[x * 4 + 1] = v; img.data[x * 4 + 2] = v; img.data[x * 4 + 3] = 255
  }
  const stretched = ctx.createImageData(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = x * 4, di = (y * w + x) * 4
      stretched.data[di] = img.data[si]; stretched.data[di + 1] = img.data[si + 1]
      stretched.data[di + 2] = img.data[si + 2]; stretched.data[di + 3] = 255
    }
  }
  ctx.putImageData(stretched, 0, 0)
}

function drawColorRing() {
  const c = colorRingCanvas.value; if (!c || !colorAnalysis.value) return
  const dpr = window.devicePixelRatio || 1
  const cssW = 230, cssH = 136
  const pw = Math.round(cssW * dpr), ph = Math.round(cssH * dpr)
  if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph }
  const ctx = c.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const cx = 103, cy = 56, outerR = 50, innerR = 24
  const colors = colorAnalysis.value.dominantColors
  let startAngle = -Math.PI / 2
  ctx.clearRect(0, 0, cssW, cssH)

  const segs: { start: number; end: number; mid: number }[] = []

  for (let i = 0; i < colors.length; i++) {
    const dc = colors[i]
    const slice = (dc.percent / 100) * Math.PI * 2
    const hovered = i === _hoveredRingIdx
    const or = hovered ? outerR + 6 : outerR
    ctx.beginPath()
    ctx.arc(cx, cy, or, startAngle, startAngle + slice)
    ctx.arc(cx, cy, innerR, startAngle + slice, startAngle, true)
    ctx.closePath()
    ctx.fillStyle = dc.hex; ctx.fill()
    segs.push({ start: startAngle, end: startAngle + slice, mid: startAngle + slice / 2 })
    startAngle += slice
  }

  // 空心
  ctx.beginPath(); ctx.arc(cx, cy, innerR, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill()

  // hover 高亮 + 连接点 + 右下信息
  if (_hoveredRingIdx >= 0 && _hoveredRingIdx < colors.length) {
    const seg = segs[_hoveredRingIdx]
    const dc = colors[_hoveredRingIdx]
    const hoverOr = outerR + 6
    const conX = cx + Math.cos(seg.mid) * hoverOr
    const conY = cy + Math.sin(seg.mid) * hoverOr

    // 连接点
    ctx.beginPath(); ctx.arc(conX, conY, 3.5, 0, Math.PI * 2); ctx.fillStyle = dc.hex; ctx.fill()
    ctx.beginPath(); ctx.arc(conX, conY, 3.5, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke()

    // 信息固定在右下
    const ix = cssW, iy = cssH - 14, bw = 120
    const mc = findClosestColor(dc.hex)
    const boxH = mc ? 52 : 36
    ctx.font = 'bold 11px Consolas,monospace'; ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(ix - bw, iy - boxH + 10, bw, boxH)
    ctx.fillStyle = '#fff'; ctx.fillText(dc.hex, ix - bw / 2, iy - 18)
    ctx.font = '9px Consolas,monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillText(dc.percent.toFixed(1) + '%', ix - bw / 2, iy - 8)
    if (mc) {
      ctx.textAlign = 'left'
      const startX = ix - bw + 8
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText(colorName(mc.entry), startX, iy + 2)
      const deStr = ' ΔE₀₀=' + mc.de.toFixed(2)
      ctx.fillStyle = deColor(mc.de); ctx.fillText(deStr, startX + ctx.measureText(colorName(mc.entry)).width, iy + 2)
      ctx.textAlign = 'center'
    }
  }

  ;(c as any)._ringSegs = segs
}

function onRingMove(e: MouseEvent) {
  const c = colorRingCanvas.value; if (!c) return
  const segs = (c as any)._ringSegs as { start: number; end: number; mid: number }[] | undefined
  if (!segs?.length) return
  const rect = c.getBoundingClientRect()
  const mx = (e.clientX - rect.left) * (230 / rect.width)
  const my = (e.clientY - rect.top) * (136 / rect.height)
  const dx = mx - 103, dy = my - 56
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < 20 || dist > 58) { if (_hoveredRingIdx !== -1) { _hoveredRingIdx = -1; drawColorRing() } return }
  let angle = Math.atan2(dy, dx)
  if (angle < 0) angle += Math.PI * 2
  let idx = -1
  for (let i = 0; i < segs.length; i++) {
    let s = segs[i].start, e = segs[i].end
    // 归一化到 [0, 2*PI)
    while (s < 0) { s += Math.PI * 2; e += Math.PI * 2 }
    if (e - s >= Math.PI * 2 - 0.001) { idx = i; break }  // 占满全环直接匹配
    // 处理跨 0/2PI 边界
    if (s < Math.PI * 2 && e <= Math.PI * 2) {
      if (angle >= s && angle <= e) { idx = i; break }
    } else {
      // 段跨过 2PI 边界
      if (angle >= s || angle <= e - Math.PI * 2) { idx = i; break }
    }
  }
  if (idx !== _hoveredRingIdx) { _hoveredRingIdx = idx; drawColorRing() }
}

function onRingLeave() {
  _hoveredRingIdx = -1; drawColorRing()
}

function onRingClick(e: MouseEvent) {
  const c = colorRingCanvas.value; if (!c || !colorAnalysis.value) return
  const segs = (c as any)._ringSegs as { start: number; end: number; mid: number }[] | undefined
  if (!segs?.length) return
  const rect = c.getBoundingClientRect()
  const mx = (e.clientX - rect.left) * (230 / rect.width)
  const my = (e.clientY - rect.top) * (136 / rect.height)
  const dx = mx - 103, dy = my - 56
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < 20 || dist > 58) return
  let angle = Math.atan2(dy, dx)
  if (angle < 0) angle += Math.PI * 2
  for (let i = 0; i < segs.length; i++) {
    let s = segs[i].start, e = segs[i].end
    while (s < 0) { s += Math.PI * 2; e += Math.PI * 2 }
    const inRange = e <= Math.PI * 2 ? (angle >= s && angle <= e) : (angle >= s || angle <= e - Math.PI * 2)
    if (inRange) {
      const dc = colorAnalysis.value!.dominantColors[i]
      // 设为当前采样色并加入色板
      const fr = dc.r / 255, fg = dc.g / 255, fb = dc.b / 255
      const cmax = Math.max(fr, fg, fb), cmin = Math.min(fr, fg, fb), delta = cmax - cmin
      let h = 0, sv = 0
      if (delta > 0.0001) {
        if (cmax === fr) h = ((fg - fb) / delta) % 6
        else if (cmax === fg) h = (fb - fr) / delta + 2
        else h = (fr - fg) / delta + 4
        h = (h < 0 ? h + 6 : h) * 60; sv = delta / cmax
      }
      sample.value = { h, s: sv, v: cmax, hex: dc.hex, r: dc.r, g: dc.g, b: dc.b }
      swatches.value = [{ hex: dc.hex, r: dc.r, g: dc.g, b: dc.b, h, s: sv, v: cmax }, ...swatches.value].slice(0, 11)
      nextTick(() => drawVBar())
      break
    }
  }
}

function sampleAvgColor() {
  if (!colorAnalysis.value) return
  const { avgR: r, avgG: g, avgB: b, avgHex: hex } = colorAnalysis.value
  const fr = r / 255, fg = g / 255, fb = b / 255
  const cmax = Math.max(fr, fg, fb), cmin = Math.min(fr, fg, fb), delta = cmax - cmin
  let h = 0, s = 0
  if (delta > 0.0001) {
    if (cmax === fr) h = ((fg - fb) / delta) % 6
    else if (cmax === fg) h = (fb - fr) / delta + 2
    else h = (fr - fg) / delta + 4
    h = (h < 0 ? h + 6 : h) * 60; s = delta / cmax
  }
  sample.value = { h, s, v: cmax, hex, r, g, b }
  swatches.value = [{ hex, r, g, b, h, s, v: cmax }, ...swatches.value].slice(0, 11)
  nextTick(() => drawVBar())
}

watch(() => props.visible, async (v) => {
  if (v) {
    await nextTick()
    currentPath.value = props.image?.file_path || ''
    drawHSMap(); drawVBar(); loadMeta(); loadHist(); loadColorAnalysis()
    attachViewerListeners()
    document.addEventListener('picrand-gif-frame', onGifFrameUpdate)
    const vi = document.querySelector('.viewer-canvas img') as HTMLImageElement | null
    if (vi) vi.draggable = false
    updateImgFilter()
    document.addEventListener('keydown', onF1Escape, true)
  } else {
    removeImgFilter()
    document.removeEventListener('keydown', onF1Escape, true)
    document.removeEventListener('picrand-gif-frame', onGifFrameUpdate)
    cleanup?.(); cleanup = null
    sample.value = null; swatches.value = []; colorAnalysis.value = null
  }
}, { immediate: true })

onMounted(async () => {
  await nextTick()
  drawHSMap(); drawVBar(); loadMeta(); loadHist()
})

onUnmounted(() => { removeImgFilter(); document.removeEventListener('keydown', onF1Escape, true); cleanup?.() })
</script>

<style scoped>
.f1-overlay { position:fixed; inset:0; z-index:9999; pointer-events:none; }
.f1-panel { position:absolute; right:0; bottom:0; width: 300px; background:rgba(30,30,38,0.5); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.1); border-radius:0; padding:8px; font:12px 'Consolas','Courier New',monospace; pointer-events:auto; display:flex; flex-direction:column; gap:6px; }
.f1-close-btn { position:absolute; top:4px; right:6px; width:20px; height:20px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:14px; color:rgba(255,255,255,0.4); border-radius:3px; transition:all .15s; user-select:none; z-index:1; }
.f1-close-btn:hover { color:rgba(255,255,255,0.85); background:rgba(255,255,255,0.1); }
.f1-row { display:flex; gap:4px; align-items:stretch; height:122px; }
.f1-hs-wrap { position:relative; flex:1; border:1px solid rgba(255,255,255,0.1); border-radius:0; overflow:visible; }
.f1-hs-wrap canvas { display:block; width:100%; height:100%; }
.hs-dot { position:absolute; width:6px; height:6px; background:#fff; border:1px solid #000; border-radius:50%; transform:translate(-50%,-50%); pointer-events:none; }
.f1-v-wrap { position:relative; border:1px solid rgba(255,255,255,0.1); border-radius:0; overflow:visible; flex-shrink:0; }
.f1-v-wrap canvas { display:block; width:100%; height:100%; }
.v-dot { position:absolute; left:0; right:0; height:2px; background:#0ff; transform:translateY(-50%); pointer-events:none; }

.f1-swatches { display:flex; gap:2px; align-items:flex-start; }
.sw-main { width:52px; height:52px; border-radius:2px; border:1px solid rgba(255,255,255,0.15); cursor:pointer; transition:transform .1s; flex-shrink:0; }
.sw-main:hover { transform:scale(1.05); z-index:2; }
.sw-main.empty { background:rgba(255,255,255,0.03); cursor:default; }
.sw-grid { display:grid; grid-template-columns:repeat(5, 24px); grid-template-rows:repeat(2, 24px); gap:2px; }
.sw-cell { display:flex; }
.sw-cell .sw { flex:1; }
.sw { border-radius:2px; border:1px solid rgba(255,255,255,0.15); cursor:pointer; transition:transform .1s; }
.sw:hover { transform:scale(1.1); z-index:2; }
.sw.empty { background:rgba(255,255,255,0.03); cursor:default; }
.f1-swatch-actions { display:flex; flex-direction:column; gap:2px; flex-shrink:0; }
.f1-swatch-btn { width:16px; height:16px; padding:0; border:1px solid rgba(255,255,255,0.1); border-radius:2px; background:rgba(255,255,255,0.03); color:rgba(255,255,255,0.4); font-size:9px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .15s; }
.f1-swatch-btn:hover:not(:disabled) { background:rgba(255,255,255,0.1); color:rgba(255,255,255,0.8); }
.f1-swatch-btn.del:hover:not(:disabled) { background:rgba(255,60,60,0.2); border-color:rgba(255,60,60,0.3); color:#f66; }
.f1-swatch-btn:disabled { opacity:0.2; cursor:default; }

.f1-hist-row { display:flex; gap:4px; }
.f1-hist-left { width:100px; height:100px; border:1px solid rgba(255,255,255,0.08); border-radius:2px; flex-shrink:0; background:rgba(255,255,255,0.02); }
.f1-hist-right { flex:1; min-width:0; border:1px solid rgba(255,255,255,0.1); border-radius:2px; overflow:hidden; display:flex; flex-direction:column; }
.f1-hist-right canvas { display:block; width:100%; }
.f1-hist-btns { display:flex; gap:2px; padding:2px 4px; background:rgba(0,0,0,0.2); }
.f1-hist-btns button { height:18px; padding:0 6px; border:1px solid rgba(255,255,255,0.1); border-radius:2px; background:none; color:rgba(255,255,255,0.35); font:10px inherit; cursor:pointer; }
.f1-hist-btns button.on { background:rgba(255,255,255,0.12); color:rgba(255,255,255,0.85); }

.f1-chan-row { display:flex; gap:3px; align-items:center; padding:2px 4px; background:rgba(0,0,0,0.15); border:1px solid rgba(255,255,255,0.06); border-radius:2px; }
.f1-chan-label { font-size:10px; color:rgba(255,255,255,0.3); margin-right:2px; }
.f1-chan { display:inline-flex; align-items:center; justify-content:center; width:22px; height:17px; border-radius:2px; cursor:pointer; font-size:10px; font-weight:600; border:1px solid; user-select:none; transition:all .1s; }
.f1-chan input { display:none; }
.f1-chan.off { opacity:0.3; }
.f1-meta { display:flex; gap:8px; align-items:center; font-size:10px; color:rgba(255,255,255,0.5); }
.f1-info { display:flex; flex-direction:column; gap:1px; }
.f1-info-row { display:flex; gap:6px; align-items:center; font-size:10px; padding:2px 4px; border-radius:2px; cursor:pointer; user-select:text; transition:background .1s; position:relative; }
.f1-info-row:hover { background:rgba(255,255,255,0.06); }
.f1-info-row span { color:rgba(255,255,255,0.65); }
.f1-info-row span:last-child { font-weight:500; }
.f1-info-row.f1-match { color:rgba(255,255,255,0.4); font-size:9px; cursor:default; }
.f1-info-row.f1-match:hover { background:transparent; }
.f1-match-sim { font-size:8px; margin-left:2px; }
.f1-match-src { color:rgba(255,255,255,0.2) !important; font-size:7px; margin-left:4px; }
.f1-match-name { font-size:9px; color:rgba(255,255,255,0.4); }
.f1-copied { position:absolute; right:6px; color:#22c55e !important; font-size:10px; transition:opacity .3s; }
.f1-info-hex { font-weight:600; }
.pot-ok { color:#22c55e; font-weight:600; }
.pot-no { color:#fbbf24; font-weight:600; }

/* 文件名 */
.f1-filename { font-size:11px; color:rgba(255,255,255,0.55); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* 平均色 */
.f1-avg-row { display:flex; gap:6px; align-items:center; cursor:pointer; padding:1px 4px; border-radius:2px; transition:background .1s; }
.f1-avg-row:hover { background:rgba(255,255,255,0.06); }
.f1-avg-swatch { width:18px; height:18px; border-radius:3px; border:1px solid rgba(255,255,255,0.15); flex-shrink:0; }
.f1-avg-hex { font-size:11px; font-weight:600; }
.f1-avg-label { font-size:9px; color:rgba(255,255,255,0.3); text-transform:uppercase; }

/* 主色环 */
.f1-color-ring-wrap { display:flex; justify-content:center; }
.f1-color-ring-wrap canvas { display:block; }

/* HSV 分布柱 */
.f1-hsv-bars { display:flex; flex-direction:column; gap:1px; }
.f1-hsv-row { display:flex; gap:3px; align-items:center; padding:1px 0; }
.f1-hsv-label { width:12px; font-size:9px; color:rgba(255,255,255,0.35); text-align:right; flex-shrink:0; }
.f1-hsv-val { font-size:9px; color:rgba(255,255,255,0.5); flex-shrink:0; }
.f1-hsv-track { position:relative; height:10px; border-radius:2px; overflow:visible; }
.f1-hsv-track canvas { display:block; width:100%; height:100%; border-radius:2px; }
.f1-hsv-dot { position:absolute; top:-3px; bottom:-3px; width:2px; border-radius:1px; pointer-events:none; transform:translateX(-50%); box-shadow:0 0 3px rgba(255,255,255,0.8),0 0 3px rgba(0,0,0,0.8); border:1px solid rgba(0,0,0,0.35); }
</style>
