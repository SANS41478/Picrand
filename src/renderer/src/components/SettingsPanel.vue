<template>
  <div v-if="visible" class="settings-overlay" @click.self="close">
    <div class="settings-panel">
      <h2>{{ t('settings.title') }}</h2>

      <div class="settings-tabs">
        <button class="settings-tab" :class="{ active: activeTab === 'func' }" @click="activeTab = 'func'">{{ t('settings.tabFunc') }}</button>
        <button class="settings-tab" :class="{ active: activeTab === 'other' }" @click="activeTab = 'other'">{{ t('settings.tabOther') }}</button>
        <button class="settings-tab" :class="{ active: activeTab === 'folder' }" @click="activeTab = 'folder'">{{ t('settings.tabFolder') }}</button>
      </div>

      <!-- ===== 页一：功能 ===== -->
      <div v-show="activeTab === 'func'">
      <div class="section-header">{{ t('settings.masonry') }}</div>
      <div class="section-divider"></div>
      <div class="setting-row">
        <label>{{ t('settings.columns') }}<span v-if="columnPreview >= 6 || config.columns >= 6" class="warn-icon" @mouseenter="showTip($event, t('settings.columnsWarnTip'))" @mouseleave="hideTip"><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 14.7 13.4H1.3Z" fill="#e5484d"/><line x1="8" y1="5.4" x2="8" y2="9.6" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="11.7" r="1" fill="#fff"/></svg></span></label>
        <div class="slider-wrap">
          <input type="range" :value="config.columns" min="2" max="8" class="range-input" @input="e => columnPreview = Number((e.target as HTMLInputElement).value)" @change="setColumn" />
          <span class="slider-val">{{ t('settings.columnsUnit', { n: columnPreview }) }}</span>
        </div>
      </div>
      <div class="setting-row">
        <label>{{ t('settings.radius') }}</label>
        <div class="slider-wrap">
          <input type="range" v-model.number="config.picRadius" min="0" max="30" class="range-input" />
          <span class="slider-val">{{ t('settings.radiusUnit', { n: config.picRadius }) }}</span>
        </div>
      </div>
      <div class="setting-row">
        <label>{{ t('settings.gap') }}</label>
        <div class="slider-wrap">
          <input type="range" v-model.number="config.picGap" min="4" max="40" class="range-input" />
          <span class="slider-val">{{ t('settings.gapUnit', { n: config.picGap }) }}</span>
        </div>
      </div>
      <div class="setting-row">
        <label>{{ t('settings.shadow') }}</label>
        <select v-model="config.picShadow" class="tb-select">
          <option value="none">{{ t('settings.shadowNone') }}</option>
          <option value="light">{{ t('settings.shadowLight') }}</option>
          <option value="heavy">{{ t('settings.shadowHeavy') }}</option>
        </select>
      </div>

      <div class="section-header">{{ t('settings.drift') }}</div>
      <div class="section-divider"></div>
      <div class="setting-row">
        <label>{{ t('settings.driftToggle') }}<span class="help-icon" @mouseenter="showTip($event, t('tip.driftToggle'))" @mouseleave="hideTip">?</span></label>
        <div class="toggle-wrap">
          <span class="toggle-label">{{ config.driftEnabled ? t('settings.driftOn') : t('settings.driftOff') }}</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="config.driftEnabled" />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
      <template v-if="config.driftEnabled">
      <div class="setting-row">
        <label>{{ t('settings.driftBatch') }}<span class="help-icon" @mouseenter="showTip($event, t('tip.driftBatch'))" @mouseleave="hideTip">?</span></label>
        <div class="slider-wrap">
          <input type="range" min="50" max="1000" step="50" v-model.number="config.driftBatchSize" class="range-input" />
          <span class="slider-val">{{ config.driftBatchSize >= 1000 ? t('settings.unlimited') : config.driftBatchSize }}</span>
        </div>
      </div>
      <div class="setting-row">
        <label>{{ t('settings.driftTopN') }}<span class="help-icon" @mouseenter="showTip($event, t('tip.driftTopN'))" @mouseleave="hideTip">?</span></label>
        <div class="slider-wrap">
          <input type="range" min="5" max="50" step="5" v-model.number="config.driftTopN" class="range-input" />
          <span class="slider-val">{{ t('settings.driftTopNUnit', { n: config.driftTopN }) }}</span>
        </div>
      </div>
      <div class="setting-row">
        <label>{{ t('settings.driftSeedRank') }}<span class="help-icon" @mouseenter="showTip($event, t('tip.driftSeedRank'))" @mouseleave="hideTip">?</span></label>
        <div class="slider-wrap">
          <input type="range" min="1" :max="config.driftTopN" step="1" v-model.number="config.driftSeedRank" class="range-input" />
          <span class="slider-val">{{ t('settings.driftSeedRankUnit', { n: config.driftSeedRank }) }}</span>
        </div>
      </div>
      </template>
      <div class="setting-row">
        <label>{{ t('settings.driftWeightMode') }}<span class="help-icon" @mouseenter="showTip($event, t('tip.driftWeightMode'))" @mouseleave="hideTip">?</span></label>
        <div class="theme-btns">
          <button v-for="wm in driftWeightModes" :key="wm.value" class="theme-opt" :class="{ active: config.driftWeightMode === wm.value }" @click="config.driftWeightMode = wm.value">{{ t(wm.key) }}</button>
        </div>
      </div>

      <div class="section-header">{{ t('settings.feature') }}</div>
      <div class="section-divider"></div>
      <div class="setting-row">
        <label>{{ t('settings.imageSearch') }}<span class="help-icon" @mouseenter="showTip($event, t('settings.imageSearchTip'))" @mouseleave="hideTip">?</span></label>
        <div class="toggle-wrap">
          <span class="toggle-label">{{ config.imageSearchEnabled ? t('settings.driftOn') : t('settings.driftOff') }}</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="config.imageSearchEnabled" @change="onSearchToggle" />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
      <div class="setting-row">
        <label>{{ t('settings.preload') }}<span class="help-icon" @mouseenter="showTip($event, t('settings.preloadTip'))" @mouseleave="hideTip">?</span></label>
        <div class="toggle-wrap">
          <span class="toggle-label">{{ config.preloadEnabled ? t('settings.driftOn') : t('settings.driftOff') }}</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="config.preloadEnabled" />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
      </div>

      <!-- ===== 页二：其他 ===== -->
      <div v-show="activeTab === 'other'">
      <div class="section-header">{{ t('settings.appearance') }}</div>
      <div class="section-divider"></div>
      <div class="setting-row">
        <label>{{ t('settings.theme') }}</label>
        <div class="theme-btns">
          <button v-for="theme in themes" :key="theme.value" class="theme-opt" :class="{ active: config.themeColor === theme.value }" @click="selectTheme(theme.value)">{{ t(theme.key) }}</button>
        </div>
      </div>
      <template v-if="config.themeColor === 'glass'">
        <div class="setting-row">
          <label>{{ t('settings.bgImage') }}</label>
          <div class="path-row">
            <button class="btn-pick" @click="pickBgImage">{{ t('settings.bgPick') }}</button>
            <span class="path-text" :title="config.bgImagePath">{{ config.bgImagePath ? config.bgImagePath.split('\\').pop() : t('settings.bgNone') }}</span>
          </div>
        </div>
        <div class="setting-row">
          <label>{{ t('settings.bgBlur') }}</label>
          <div class="slider-wrap">
            <input type="range" min="0" max="30" step="1" v-model.number="config.bgBlurAmount" class="range-input" />
            <span class="slider-val">{{ t('settings.bgBlurUnit', { n: config.bgBlurAmount }) }}</span>
          </div>
        </div>
      </template>
      <div class="setting-row">
        <label>{{ t('settings.zoom') }}<span class="help-icon" @mouseenter="showTip($event, t('settings.zoomTip'))" @mouseleave="hideTip">?</span></label>
        <div class="slider-wrap">
          <input type="range" min="0.5" max="1.5" step="0.05" v-model.number="config.zoomFactor" class="range-input" />
          <span class="slider-val">{{ t('settings.zoomUnit', { n: Math.round(config.zoomFactor * 100) }) }}</span>
          <button v-if="config.zoomFactor !== 1" class="btn-pick zoom-reset" @click="config.zoomFactor = 1">100%</button>
        </div>
      </div>

      <div class="section-header">{{ t('settings.pref') }}</div>
      <div class="section-divider"></div>
      <div class="setting-row">
        <label>🌐 {{ t('settings.lang') }}</label>
        <select v-model="config.locale" class="tb-select">
          <option value="zh">简体中文</option>
          <option value="zh-Hant">繁體中文</option>
          <option value="en">English</option>
          <option value="ja">日本語</option>
          <option value="ko">한국어</option>
          <option value="ru">Русский</option>
          <option value="es-ES">Español (España)</option>
          <option value="es-419">Español (Latinoamérica)</option>
          <option value="pt-PT">Português (Portugal)</option>
          <option value="pt-BR">Português (Brasil)</option>
          <option value="de">Deutsch</option>
          <option value="fr">Français</option>
          <option value="pl">Polski</option>
          <option value="tr">Türkçe</option>
          <option value="th">ไทย</option>
          <option value="uk">Українська</option>
          <option value="it">Italiano</option>
          <option value="cs">Čeština</option>
        </select>
      </div>

      <div class="setting-row">
        <label>{{ t('settings.defaultSort') }}</label>
        <select v-model="config.defaultSortMode" class="tb-select">
          <option value="random">{{ t('sort.random') }}</option>
          <option value="name-asc">{{ t('sort.name') }}</option>
          <option value="time-desc">{{ t('sort.time') }}</option>
          <option value="dim-desc">{{ t('sort.dim') }}</option>
          <option value="size-desc">{{ t('sort.size') }}</option>
        </select>
      </div>

      <div class="setting-row">
        <label>{{ t('settings.searchEngine') }}</label>
        <select v-model="config.searchEngine" class="tb-select" style="width:160px">
          <option value="yandex">Yandex</option>
          <option value="saucenao">SauceNAO</option>
          <option value="googlelens">Google Lens</option>
          <option value="tracemoe">trace.moe</option>
          <option value="tineye">TinEye</option>
        </select>
      </div>

      <div class="setting-row">
        <label>{{ t('settings.folderMemory') }}<span class="help-icon" @mouseenter="showTip($event, t('settings.folderMemoryTip'))" @mouseleave="hideTip">?</span></label>
        <div class="toggle-wrap">
          <span class="toggle-label">{{ config.folderMemoryEnabled ? t('settings.driftOn') : t('settings.driftOff') }}</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="config.folderMemoryEnabled" />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="setting-row">
        <label>{{ t('settings.pinboard') }}<span class="help-icon" @mouseenter="showTip($event, t('settings.pinboardTip'))" @mouseleave="hideTip">?</span></label>
        <div class="toggle-wrap">
          <span class="toggle-label">{{ config.pinboardEnabled ? t('settings.driftOn') : t('settings.driftOff') }}</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="config.pinboardEnabled" />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div v-if="config.pinboardEnabled" class="setting-row">
        <label>{{ t('settings.pinboardMemory') }}<span class="help-icon" @mouseenter="showTip($event, t('settings.pinboardMemoryTip'))" @mouseleave="hideTip">?</span></label>
        <div class="toggle-wrap">
          <span class="toggle-label">{{ config.pinboardMemoryEnabled ? t('settings.driftOn') : t('settings.driftOff') }}</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="config.pinboardMemoryEnabled" />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="setting-row">
        <label>{{ t('settings.shellMenu') }}<span class="help-icon" @mouseenter="showTip($event, t('settings.shellMenuTip'))" @mouseleave="hideTip">?</span></label>
        <div class="shell-menu-wrap">
          <span class="shell-menu-status" :class="{ on: shellMenuInstalled }">{{ shellMenuInstalled ? t('settings.shellMenuInstalled') : t('settings.shellMenuNotInstalled') }}</span>
          <button v-if="!shellMenuInstalled" class="ai-build-btn" :disabled="shellMenuBusy" @click="onInstallShellMenu">{{ shellMenuBusy ? t('settings.shellMenuInstalling') : t('settings.shellMenuInstall') }}</button>
          <button v-else class="ai-build-btn" :disabled="shellMenuBusy" @click="onUninstallShellMenu">{{ shellMenuBusy ? t('settings.shellMenuInstalling') : t('settings.shellMenuUninstall') }}</button>
        </div>
        <transition name="toast-fade">
          <div v-if="shellToast" class="ai-toast">{{ shellToast }}</div>
        </transition>
      </div>

        <div class="setting-row">
          <label>{{ t('settings.colorRef') }}</label>
          <select v-model="config.colorRef" class="tb-select">
            <option value="all">{{ t('settings.colorRefAll') }}</option>
            <option value="traditional">{{ t('settings.colorRefTraditional') }}</option>
            <option value="pantone">{{ t('settings.colorRefPantone') }}</option>
          </select>
        </div>
      </div>

      <!-- ===== 页一·其他：关于入口（右下角浅色链接）+ 详情窗口 ===== -->
      <div v-show="activeTab === 'other'">
        <div class="about-link-row">
          <button class="about-link" @click="showAbout = true">{{ tEn('about.linkText') }}</button>
        </div>
      </div>

      <!-- 关于详情窗口 -->
      <Teleport to="body">
        <div v-if="showAbout" class="about-overlay" @click.self="showAbout = false">
          <div class="about-window">
            <button class="about-close" @click="showAbout = false">✕</button>
            <div class="about-block">
              <div class="about-title">PicRand</div>
            </div>

            <div class="about-block">
              <div class="about-subtitle">{{ tEn('about.componentsTitle') }}</div>
              <ul class="about-license-list">
                <li v-for="c in components" :key="c.name" class="about-item">
                  <span class="about-item-name">{{ c.name }}</span>
                  <span class="about-item-lic">{{ c.lic }}</span>
                </li>
              </ul>
            </div>

            <div class="about-block">
              <div class="about-subtitle">{{ tEn('about.ffmpegTitle') }}</div>
              <p class="about-note">{{ tEn('about.ffmpegNote') }}</p>
            </div>

            <div class="about-block">
              <div class="about-subtitle">{{ tEn('about.aiModelTitle') }}</div>
              <p class="about-note">{{ tEn('about.aiModelVision') }}</p>
              <p class="about-note">{{ tEn('about.aiModelText') }}</p>
            </div>

            <div class="about-block">
              <div class="about-subtitle">{{ tEn('about.searchTitle') }}</div>
              <p class="about-note">{{ tEn('about.searchNote') }}</p>
            </div>

            <div class="about-block">
              <div class="about-subtitle">{{ tEn('about.patentTitle') }}</div>
              <p class="about-note">{{ tEn('about.patentNote') }}</p>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- ===== 页三：当前文件夹 ===== -->
      <div v-show="activeTab === 'folder'">
        <div v-if="!hasFolderLoaded" class="folder-empty-hint">{{ t('settings.folderEmptyHint') }}</div>
        <template v-else>
        <div class="section-header">{{ t('settings.aiSearch') }}</div>
        <div class="section-divider"></div>
        <div class="setting-row">
          <label>{{ t('settings.aiSearch') }}<span class="help-icon" @mouseenter="showTip($event, t('settings.aiSearchTip'))" @mouseleave="hideTip">?</span></label>
          <div class="toggle-wrap">
            <span class="toggle-label">{{ config.aiSearchEnabled ? t('settings.driftOn') : t('settings.driftOff') }}</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="config.aiSearchEnabled" @change="onAiSearchToggle" />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        <div v-if="config.aiSearchEnabled" class="setting-row ai-index-row">
          <label>{{ t('settings.aiIndex') }}</label>
          <div class="ai-index-controls">
            <div class="ai-index-status">{{ aiIndexStatusText }}</div>
            <button class="ai-build-btn" :disabled="aiBuilding || !hasFolderLoaded" @click="onBuildIndex(false)">{{ aiBuilding ? t('settings.aiBuilding') : t('settings.aiBuildNow') }}</button>
            <button class="ai-build-btn" :disabled="aiBuilding || !hasFolderLoaded" :title="t('settings.aiRebuildTip')" @click="onBuildIndex(true)">{{ t('settings.aiRebuild') }}</button>
            <div v-if="aiBuilding" class="ai-progress-wrap">
              <div class="ai-progress-track"><div class="ai-progress-bar" :style="{ width: aiProgressPct + '%' }"></div></div>
              <span class="ai-progress-text">{{ aiProgressText }}</span>
            </div>
          </div>
          <transition name="toast-fade">
            <div v-if="aiToast" class="ai-toast">{{ aiToast }}</div>
          </transition>
        </div>

        <div v-if="config.aiSearchEnabled" class="setting-row">
          <label>{{ t('settings.aiTopN') }}<span class="help-icon" @mouseenter="showTip($event, t('settings.aiTopNTip'))" @mouseleave="hideTip">?</span></label>
          <div class="slider-wrap">
            <input type="range" min="10" max="2000" step="10" v-model.number="config.aiSearchTopN" class="range-input" @change="onAiTopNChange" />
            <span class="slider-val">{{ config.aiSearchTopN >= 2000 ? t('settings.unlimited') : config.aiSearchTopN }}</span>
          </div>
        </div>

        <!-- 色彩索引 -->
        <div class="section-header">{{ t('settings.colorIndex') }}</div>
        <div class="section-divider"></div>
        <div class="setting-row ai-index-row">
          <label>{{ t('settings.colorIndex') }}<span class="help-icon" @mouseenter="showTip($event, t('settings.colorIndexTip'))" @mouseleave="hideTip">?</span></label>
          <div class="ai-index-controls">
            <div class="ai-index-status">{{ colorIndexStatusText }}</div>
            <button class="ai-build-btn" :disabled="colorBuilding || !hasFolderLoaded" @click="onBuildColorIndex(false)">{{ colorBuilding ? t('settings.colorBuilding') : t('settings.colorBuildNow') }}</button>
            <button class="ai-build-btn" :disabled="colorBuilding || !hasFolderLoaded" :title="t('settings.colorRebuildTip')" @click="onBuildColorIndex(true)">{{ t('settings.colorRebuild') }}</button>
            <div v-if="colorBuilding" class="ai-progress-wrap">
              <div class="ai-progress-track"><div class="ai-progress-bar" :style="{ width: colorProgressPct + '%' }"></div></div>
              <span class="ai-progress-text">{{ colorProgressText }}</span>
            </div>
          </div>
          <transition name="toast-fade">
            <div v-if="colorToast" class="ai-toast">{{ colorToast }}</div>
          </transition>
        </div>

        <!-- 数据管理 -->
        <div class="section-header">{{ t('settings.dataMgmt') }}</div>
        <div class="section-divider"></div>
        <div class="setting-row">
          <label>{{ t('settings.clearRatings') }}</label>
          <div class="data-clear-wrap">
            <button class="ai-build-btn" :disabled="!hasFolderLoaded || clearingRatings" @click="askClearRatings">{{ clearingRatings ? t('settings.clearing') : t('settings.clearNow') }}</button>
          </div>
        </div>
        <div class="setting-row">
          <label>{{ t('settings.clearDescriptions') }}</label>
          <div class="data-clear-wrap">
            <button class="ai-build-btn" :disabled="!hasFolderLoaded || clearingDescs" @click="askClearDescs">{{ clearingDescs ? t('settings.clearing') : t('settings.clearNow') }}</button>
          </div>
        </div>
        <transition name="toast-fade">
          <div v-if="clearToast" class="ai-toast">{{ clearToast }}</div>
        </transition>
        </template>
      </div>

      <button class="close-btn" @click="close">{{ t('settings.done') }}</button>
    </div>

    <Teleport to="body">
      <transition name="tip-fade">
        <div v-if="tip.visible" class="help-tip" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">{{ tip.text }}</div>
      </transition>
    </Teleport>

    <!-- 以图搜图确认对话框 -->
    <Teleport to="body">
      <div v-if="showSearchConfirm" class="modal-overlay" @click.self="cancelSearchConfirm">
        <div class="modal-box">
          <div class="modal-body-search">
            <span class="modal-icon-search">&#9888;</span>
            <span class="modal-title-inline">{{ t('dialog.searchConfirmTitle') }}</span>
          </div>
          <div class="modal-desc" style="margin-bottom:20px;font-size:13px;color:var(--text-secondary);line-height:1.7;white-space:pre-line">{{ t('dialog.searchConfirmMsg') }}</div>
          <div class="modal-actions">
            <button class="modal-btn modal-cancel" @click="cancelSearchConfirm" autofocus>{{ t('dialog.cancel') }}</button>
            <button class="modal-btn modal-confirm" @click="confirmSearchEnable">{{ t('dialog.yes') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 清空评分/描述确认对话框 -->
    <Teleport to="body">
      <div v-if="clearConfirm" class="modal-overlay" @click.self="cancelClearConfirm">
        <div class="modal-box">
          <div class="modal-body-search">
            <span class="modal-icon-search">&#9888;</span>
            <span class="modal-title-inline">{{ clearConfirmTitle }}</span>
          </div>
          <div class="modal-desc" style="margin-bottom:20px;font-size:13px;color:var(--text-secondary);line-height:1.7;white-space:pre-line">{{ clearConfirmMsg }}</div>
          <div class="modal-actions">
            <button class="modal-btn modal-cancel" @click="cancelClearConfirm" autofocus>{{ t('dialog.cancel') }}</button>
            <button class="modal-btn modal-confirm" @click="confirmClear">{{ t('dialog.yes') }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch, onMounted, computed } from 'vue'
import { useGalleryStore } from '../stores/gallery'
import { setLocale, useI18n } from '../i18n'
import { t as translateTheme } from '../i18n'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ 'update:visible': [boolean] }>()

const { t, tEn } = useI18n()
const columnPreview = ref(4)
const aiToast = ref('')
const colorToast = ref('')
const activeTab = ref<'func' | 'other' | 'folder'>('func')

// 关于 / 开源许可
const showAbout = ref(false)
const components = [
  { name: 'Electron', lic: 'MIT' },
  { name: 'Vue.js / Pinia', lic: 'MIT' },
  { name: 'v-viewer / viewerjs', lic: 'MIT' },
  { name: 'better-sqlite3', lic: 'MIT' },
  { name: 'ag-psd', lic: 'MIT' },
  { name: 'koffi', lic: 'MIT' },
  { name: 'onnxruntime-node', lic: 'MIT' },
  { name: 'chokidar / trash / fs-extra', lic: 'MIT' },
  { name: 'sharp', lic: 'Apache-2.0' },
  { name: '@xenova/transformers', lic: 'Apache-2.0' },
  { name: 'FFmpeg (via @ffmpeg-installer)', lic: 'LGPL-2.1' },
  { name: 'node-canvas (Cairo/Pixman)', lic: 'MIT / LGPL-2.1' },
]

const gallery = useGalleryStore()

const config = reactive({
  columns: 4,
  picRadius: 8,
  picGap: 12,
  picShadow: 'heavy',
  themeColor: '#faf5ef',
  zoomFactor: 1,
  driftBatchSize: 1000,
  driftTopN: 10,
  driftSeedRank: 2,
  driftWeightMode: 'color',
  driftEnabled: true,
  colorRef: 'traditional',
  defaultSortMode: 'random',
  bgImagePath: '',
  bgBlurAmount: 12,
  bgBrightness: 'dark' as 'dark' | 'bright',
  locale: 'en',
  imageSearchEnabled: false,
  searchEngine: 'yandex',
  aiSearchEnabled: true,
  folderMemoryEnabled: true,
  aiSearchTopN: 500,
  preloadEnabled: true,
  pinboardEnabled: true,
  pinboardMemoryEnabled: false
})

const showSearchConfirm = ref(false)
let _searchTogglePending = false

const shellMenuInstalled = ref(false)
const shellMenuBusy = ref(false)
const shellToast = ref('')
let _shellToastTimer: ReturnType<typeof setTimeout> | null = null
function setShellToast(msg: string, ms = 3000) {
  shellToast.value = msg
  if (_shellToastTimer) clearTimeout(_shellToastTimer)
  _shellToastTimer = setTimeout(() => { shellToast.value = '' }, ms)
}
async function refreshShellMenuStatus() {
  try { shellMenuInstalled.value = (await window.picrand.shellMenuStatus?.())?.installed || false } catch { shellMenuInstalled.value = false }
}
async function onInstallShellMenu() {
  if (shellMenuBusy.value) return
  shellMenuBusy.value = true
  try {
    const r = await window.picrand.installShellMenu?.()
    if (r?.ok) { setShellToast(t('toast.shellMenuOk')); await refreshShellMenuStatus() }
    else setShellToast(t('toast.shellMenuFail', { msg: r?.error || '' }), 4000)
  } catch (e: any) { setShellToast(t('toast.shellMenuFail', { msg: e?.message || e }), 4000) }
  finally { shellMenuBusy.value = false }
}
async function onUninstallShellMenu() {
  if (shellMenuBusy.value) return
  shellMenuBusy.value = true
  try {
    const r = await window.picrand.uninstallShellMenu?.()
    if (r?.ok) { setShellToast(t('toast.shellMenuRemoved')); await refreshShellMenuStatus() }
    else setShellToast(t('toast.shellMenuFail', { msg: r?.error || '' }), 4000)
  } catch (e: any) { setShellToast(t('toast.shellMenuFail', { msg: e?.message || e }), 4000) }
  finally { shellMenuBusy.value = false }
}

const themes = [
  { key: 'settings.themeDark', label: '', value: '#1a1a2e' },
  { key: 'settings.themeLight', label: '', value: '#faf5ef' },
  { key: 'settings.themeGlass', label: '', value: 'glass' },
]

const driftWeightModes = [
  { key: 'settings.driftWeightColor', label: '', value: 'color' },
  { key: 'settings.driftWeightTexture', label: '', value: 'texture' },
  { key: 'settings.driftWeightMultimodal', label: '', value: 'multimodal' },
]

const tip = reactive({ visible: false, text: '', x: 0, y: 0 })
function showTip(e: MouseEvent, text: string) {
  tip.text = text
  tip.x = e.clientX + 14
  tip.y = e.clientY - 10
  tip.visible = true
}
function hideTip() { tip.visible = false }

function onSearchToggle() {
  // v-model 已经更新了 config.imageSearchEnabled
  // 如果从关→开，弹窗确认；如果从开→关，直接关闭
  if (config.imageSearchEnabled) {
    // 先恢复为 false，等用户确认后再改为 true
    config.imageSearchEnabled = false
    showSearchConfirm.value = true
  }
}

function confirmSearchEnable() {
  showSearchConfirm.value = false
  config.imageSearchEnabled = true
}

function cancelSearchConfirm() {
  showSearchConfirm.value = false
  // config.imageSearchEnabled 已经在 onSearchToggle 中恢复为 false
}

function selectTheme(value: string) {
  config.themeColor = value
}

async function pickBgImage() {
  const path = await window.picrand.selectImage?.()
  if (path) {
    config.bgImagePath = path
    // 主进程分析明暗：亮图 -> 浅色玻璃配色，暗图 -> 深色玻璃配色
    const tone = await window.picrand.analyzeBgBrightness?.(path)
    if (tone) config.bgBrightness = tone
  }
}

onMounted(async () => {
  try {
    const saved = await window.picrand.readConfig?.()
    if (saved) Object.assign(config, saved)
    columnPreview.value = config.columns
    applyAll()
  } catch { /* skip */ }
})

watch(config, () => {
  applyAll()
  window.picrand.saveConfig?.(JSON.parse(JSON.stringify(config)))
}, { deep: true })

watch(() => config.driftTopN, (newMax) => {
  if (config.driftSeedRank > newMax) config.driftSeedRank = newMax
})

// 切换到多模态模式时，检测当前文件夹 AI 索引是否已构建，未构建则提示
watch(() => config.driftWeightMode, async (mode) => {
  if (mode !== 'multimodal' || !gallery.folderPath) return
  try {
    const ids = await currentFolderIds()
    if (!ids.length) return
    const st = ids.length > 1
      ? await window.picrand.clipIndexStatusMulti?.(ids) || { total: 0, indexed: 0 }
      : await window.picrand.clipIndexStatus?.(ids[0]) || { total: 0, indexed: 0 }
    if (st.total > 0 && st.indexed < st.total) {
      aiToast.value = t('toast.driftMultimodalNeedIndex')
      setTimeout(() => aiToast.value = '', 4000)
    }
  } catch { /* ignore */ }
})

// 全局快捷键等外部途径改动列数时，反同步到设置面板的 config，使滑块跟着动
watch(() => gallery.columns, (n) => {
  if (typeof n === 'number' && n !== config.columns) {
    config.columns = n
    columnPreview.value = n
  }
})

function applyAll() {
  gallery.columns = config.columns
  // 页面缩放：0.5 ~ 1.5，非法值回退 100%
  const zf = Number(config.zoomFactor)
  window.picrand.setZoomFactor?.(Number.isFinite(zf) && zf >= 0.5 && zf <= 1.5 ? zf : 1)
  gallery.picRadius = config.picRadius
  gallery.picGap = config.picGap
  gallery.driftBatchSize = config.driftBatchSize
  gallery.driftTopN = config.driftTopN
  gallery.driftSeedRank = config.driftSeedRank
  gallery.driftWeightMode = config.driftWeightMode
  gallery.driftEnabled = config.driftEnabled
  gallery.colorRef = config.colorRef
  gallery.imageSearchEnabled = config.imageSearchEnabled
  gallery.searchEngine = config.searchEngine
  gallery.aiSearchEnabled = config.aiSearchEnabled
  gallery.folderMemoryEnabled = config.folderMemoryEnabled
  if (config.aiSearchTopN) gallery.aiSearchTopN = config.aiSearchTopN
  gallery.preloadEnabled = config.preloadEnabled
  gallery.pinboardEnabled = config.pinboardEnabled
  gallery.pinboardMemoryEnabled = config.pinboardMemoryEnabled
  gallery.defaultSortMode = config.defaultSortMode
  gallery.bgImagePath = config.bgImagePath
  gallery.bgBlurAmount = config.bgBlurAmount
  gallery.bgBrightness = config.bgBrightness === 'bright' ? 'bright' : 'dark'
  gallery.themeColor = config.themeColor
  setLocale(config.locale)
  const root = document.documentElement
  root.style.setProperty('--pic-radius', config.picRadius + 'px')
  root.style.setProperty('--pic-gap', config.picGap + 'px')
  root.style.setProperty('--global-bg', config.themeColor)
  const isLight = config.themeColor !== '#1a1a2e' && config.themeColor !== 'glass'
  const glassLight = config.themeColor === 'glass' && config.bgBrightness === 'bright'
  root.setAttribute('data-theme', isLight ? 'light' : config.themeColor === 'glass' ? 'glass' : 'dark')
  if (config.themeColor === 'glass') root.setAttribute('data-glass-tone', config.bgBrightness === 'bright' ? 'light' : 'dark')
  else root.removeAttribute('data-glass-tone')
  root.style.setProperty('color-scheme', (isLight || glassLight) ? 'light' : 'dark')
  window.picrand.setTitlebarTheme?.(isLight || glassLight)
  if (config.themeColor === 'glass') {
    if (glassLight) {
      // 亮系背景图：浅色玻璃（白底半透明 + 深色文字）
      root.style.setProperty('--bg-panel', 'rgba(255, 255, 255, 0.4)')
      root.style.setProperty('--bg-panel-solid', 'rgba(250, 250, 252, 0.82)')
      root.style.setProperty('--bg-input', 'rgba(0, 0, 0, 0.06)')
      root.style.setProperty('--bg-input-solid', 'rgba(255, 255, 255, 0.75)')
      root.style.setProperty('--bg-hover', 'rgba(0, 0, 0, 0.08)')
      root.style.setProperty('--bg-toast', 'rgba(250, 250, 252, 0.88)')
      root.style.setProperty('--text-primary', 'rgba(0, 0, 0, 0.82)')
      root.style.setProperty('--text-secondary', '#444')
      root.style.setProperty('--text-muted', 'rgba(0, 0, 0, 0.42)')
      root.style.setProperty('--text-hint', 'rgba(0, 0, 0, 0.22)')
      root.style.setProperty('--border-color', 'rgba(0, 0, 0, 0.1)')
      root.style.setProperty('--border-light', 'rgba(0, 0, 0, 0.06)')
      root.style.setProperty('--overlay-bg', 'rgba(0, 0, 0, 0.3)')
      root.style.setProperty('--modal-bg', 'rgba(255, 255, 255, 0.85)')
      root.style.setProperty('--btn-primary-bg', 'rgba(110, 110, 120, 0.4)')
      root.style.setProperty('--btn-primary-hover', 'rgba(130, 130, 140, 0.5)')
      root.style.setProperty('--topbar-bg', 'rgba(255, 255, 255, 0.55)')
      root.style.setProperty('--preview-bg', 'rgba(0, 0, 0, 0.06)')
      root.style.setProperty('--path-bg', 'rgba(0, 0, 0, 0.04)')
      root.style.setProperty('--path-bg-hover', 'rgba(0, 0, 0, 0.08)')
      root.style.setProperty('--scroll-thumb', 'rgba(0, 0, 0, 0.3)')
      root.style.setProperty('--scroll-thumb-hover', 'rgba(0, 0, 0, 0.5)')
    } else {
      root.style.setProperty('--bg-panel', 'rgba(12, 12, 15, 0.35)')
      root.style.setProperty('--bg-panel-solid', 'rgba(24, 24, 30, 0.78)')
      root.style.setProperty('--bg-input', 'rgba(255, 255, 255, 0.1)')
      root.style.setProperty('--bg-input-solid', 'rgba(44, 44, 48, 0.7)')
      root.style.setProperty('--bg-hover', 'rgba(255, 255, 255, 0.12)')
      root.style.setProperty('--bg-toast', 'rgba(24, 24, 30, 0.8)')
      root.style.setProperty('--text-primary', 'rgba(255, 255, 255, 0.9)')
      root.style.setProperty('--text-secondary', '#ccc')
      root.style.setProperty('--text-muted', 'rgba(255, 255, 255, 0.45)')
      root.style.setProperty('--text-hint', 'rgba(255, 255, 255, 0.25)')
      root.style.setProperty('--border-color', 'rgba(255, 255, 255, 0.1)')
      root.style.setProperty('--border-light', 'rgba(255, 255, 255, 0.06)')
      root.style.setProperty('--overlay-bg', 'rgba(0, 0, 0, 0.5)')
      root.style.setProperty('--modal-bg', 'rgba(26, 27, 32, 0.82)')
      root.style.setProperty('--btn-primary-bg', 'rgba(92, 92, 107, 0.7)')
      root.style.setProperty('--btn-primary-hover', 'rgba(114, 114, 132, 0.8)')
      root.style.setProperty('--topbar-bg', 'rgba(12, 12, 15, 0.55)')
      root.style.setProperty('--preview-bg', 'rgba(0, 0, 0, 0.2)')
      root.style.setProperty('--path-bg', 'rgba(255, 255, 255, 0.06)')
      root.style.setProperty('--path-bg-hover', 'rgba(255, 255, 255, 0.12)')
      root.style.setProperty('--scroll-thumb', 'rgba(255, 255, 255, 0.28)')
      root.style.setProperty('--scroll-thumb-hover', 'rgba(255, 255, 255, 0.5)')
    }
  } else if (isLight) {
    root.style.setProperty('--bg-panel', 'rgba(255, 252, 248, 0.85)')
    root.style.setProperty('--bg-panel-solid', '#faf7f2')
    root.style.setProperty('--bg-input', 'rgba(0, 0, 0, 0.04)')
    root.style.setProperty('--bg-input-solid', '#efe9e0')
    root.style.setProperty('--bg-hover', 'rgba(0, 0, 0, 0.05)')
    root.style.setProperty('--bg-toast', 'rgba(250, 247, 242, 0.95)')
    root.style.setProperty('--text-primary', 'rgba(0, 0, 0, 0.8)')
    root.style.setProperty('--text-secondary', '#555')
    root.style.setProperty('--text-muted', 'rgba(0, 0, 0, 0.35)')
    root.style.setProperty('--text-hint', 'rgba(0, 0, 0, 0.15)')
    root.style.setProperty('--border-color', 'rgba(0, 0, 0, 0.08)')
    root.style.setProperty('--border-light', 'rgba(0, 0, 0, 0.04)')
    root.style.setProperty('--overlay-bg', 'rgba(0, 0, 0, 0.3)')
    root.style.setProperty('--modal-bg', '#faf7f2')
    root.style.setProperty('--btn-primary-bg', '#d4c8b6')
    root.style.setProperty('--btn-primary-hover', '#c4b8a6')
    root.style.setProperty('--topbar-bg', 'rgba(250, 245, 239, 0.9)')
    root.style.setProperty('--preview-bg', 'rgba(0, 0, 0, 0.05)')
    root.style.setProperty('--path-bg', 'rgba(0, 0, 0, 0.03)')
    root.style.setProperty('--path-bg-hover', 'rgba(0, 0, 0, 0.06)')
  } else {
    root.style.setProperty('--bg-panel', 'rgba(10, 10, 20, 0.5)')
    root.style.setProperty('--bg-panel-solid', '#1e1e2e')
    root.style.setProperty('--bg-input', 'rgba(255, 255, 255, 0.06)')
    root.style.setProperty('--bg-input-solid', '#333')
    root.style.setProperty('--bg-hover', 'rgba(255, 255, 255, 0.08)')
    root.style.setProperty('--bg-toast', 'rgba(30, 30, 46, 0.95)')
    root.style.setProperty('--text-primary', 'rgba(255, 255, 255, 0.85)')
    root.style.setProperty('--text-secondary', '#bbb')
    root.style.setProperty('--text-muted', 'rgba(255, 255, 255, 0.35)')
    root.style.setProperty('--text-hint', 'rgba(255, 255, 255, 0.2)')
    root.style.setProperty('--border-color', 'rgba(255, 255, 255, 0.08)')
    root.style.setProperty('--border-light', 'rgba(255, 255, 255, 0.06)')
    root.style.setProperty('--overlay-bg', 'rgba(0, 0, 0, 0.6)')
    root.style.setProperty('--modal-bg', '#1e1e2e')
    root.style.setProperty('--btn-primary-bg', '#3a3a5c')
    root.style.setProperty('--btn-primary-hover', '#4a4a7c')
    root.style.setProperty('--topbar-bg', 'rgba(26, 26, 46, 0.85)')
    root.style.setProperty('--preview-bg', 'rgba(0, 0, 0, 0.3)')
    root.style.setProperty('--path-bg', 'rgba(255, 255, 255, 0.04)')
    root.style.setProperty('--path-bg-hover', 'rgba(255, 255, 255, 0.08)')
  }
  if (config.picShadow === 'none') root.style.setProperty('--pic-shadow', 'none')
  else if (config.picShadow === 'light') root.style.setProperty('--pic-shadow', '0 2px 8px rgba(0,0,0,0.3)')
  else root.style.setProperty('--pic-shadow', '0 4px 20px rgba(0,0,0,0.6)')
}

function setColumn(e: Event) { config.columns = Number((e.target as HTMLInputElement).value) }

function close() {
  emit('update:visible', false)
}

// ===== AI 语义搜索 =====
const aiBuilding = ref(false)
const aiProgressDone = ref(0)
const aiProgressTotal = ref(0)
const aiIndexStatus = ref<{ total: number; indexed: number } | null>(null)
const hasFolderLoaded = computed(() => !!gallery.folderPath)

// ===== 清空评分/描述 =====
const clearingRatings = ref(false)
const clearingDescs = ref(false)
const clearToast = ref('')
let _clearToastTimer: ReturnType<typeof setTimeout> | null = null
function setClearToast(msg: string, ms = 3000) {
  clearToast.value = msg
  if (_clearToastTimer) clearTimeout(_clearToastTimer)
  _clearToastTimer = setTimeout(() => { clearToast.value = '' }, ms)
}
const clearConfirm = ref<{ kind: 'ratings' | 'descs' } | null>(null)
const clearConfirmTitle = computed(() => clearConfirm.value?.kind === 'descs' ? t('dialog.clearDescTitle') : t('dialog.clearRatingTitle'))
const clearConfirmMsg = computed(() => {
  const name = gallery.folderPath ? gallery.folderPath.split('\\').pop() : ''
  const target = clearConfirm.value?.kind === 'descs' ? t('dialog.clearDescTarget') : t('dialog.clearRatingTarget')
  return t('dialog.clearDataMsg', { target, folder: name })
})
function cancelClearConfirm() { clearConfirm.value = null }
function askClearRatings() { clearConfirm.value = { kind: 'ratings' } }
function askClearDescs() { clearConfirm.value = { kind: 'descs' } }
async function confirmClear() {
  const kind = clearConfirm.value?.kind
  clearConfirm.value = null
  if (!gallery.folderPath) return
  if (kind === 'ratings') {
    clearingRatings.value = true
    try {
      const r = await window.picrand.clearRatingsInFolder?.(gallery.folderPath)
      setClearToast(r?.cleared ? t('toast.clearRatingDone', { n: r.cleared }) : t('toast.clearNone'))
    } catch (e: any) { setClearToast(t('toast.clearFail', { msg: e?.message || e }), 4000) }
    finally { clearingRatings.value = false }
  } else if (kind === 'descs') {
    clearingDescs.value = true
    try {
      const r = await window.picrand.clearDescriptionsInFolder?.(gallery.folderPath)
      setClearToast(r?.cleared ? t('toast.clearDescDone', { n: r.cleared }) : t('toast.clearNone'))
    } catch (e: any) { setClearToast(t('toast.clearFail', { msg: e?.message || e }), 4000) }
    finally { clearingDescs.value = false }
  }
}

const aiProgressPct = computed(() => {
  if (!aiProgressTotal.value) return 0
  return Math.min(100, Math.round((aiProgressDone.value / aiProgressTotal.value) * 100))
})
const aiProgressText = computed(() => `${aiProgressDone.value}/${aiProgressTotal.value}`)
const aiIndexStatusText = computed(() => {
  if (aiBuilding.value) return t('settings.aiBuilding')
  const s = aiIndexStatus.value
  if (!s || !s.total) return hasFolderLoaded.value ? t('settings.aiIndexNone') : t('settings.aiIndexNoFolder')
  return t('settings.aiIndexCount', { indexed: s.indexed, total: s.total })
})

function onAiSearchToggle() {
  gallery.aiSearchEnabled = config.aiSearchEnabled
}

function onAiTopNChange() {
  let n = Math.floor(Number(config.aiSearchTopN) || 0)
  if (!Number.isFinite(n) || n < 10) n = 10
  if (n > 2000) n = 2000
  config.aiSearchTopN = n
  gallery.aiSearchTopN = n
}

async function currentFolderIds(): Promise<number[]> {
  const all: any[] = await window.picrand.getAllFolders?.() || []
  const fp = gallery.folderPath
  if (!fp) return []
  // 多文件夹时 folderPath 以 '; ' 分隔（见 TopBar.loadMultipleFolders）
  const segs = fp.split(';').map((s: string) => s.trim()).filter(Boolean)
  const ids: number[] = []
  for (const seg of segs) {
    const f = all.find((x: any) => x.path === seg)
    if (f?.id) ids.push(f.id)
  }
  return ids
}

async function refreshAiStatus() {
  if (!hasFolderLoaded.value) { aiIndexStatus.value = null; return }
  try {
    const ids = await currentFolderIds()
    if (!ids.length) { aiIndexStatus.value = null; return }
    const s = ids.length > 1
      ? await window.picrand.clipIndexStatusMulti?.(ids) || { total: 0, indexed: 0 }
      : await window.picrand.clipIndexStatus?.(ids[0]) || { total: 0, indexed: 0 }
    aiIndexStatus.value = s
  } catch { aiIndexStatus.value = null }
}

async function onBuildIndex(force = false) {
  if (aiBuilding.value) return
  const ids = await currentFolderIds()
  if (!ids.length) { aiToast.value = t('toast.noFolderSelected'); setTimeout(() => aiToast.value = '', 3000); return }
  if (force) {
    if (!confirm(t('settings.aiRebuildConfirm'))) return
  }
  aiBuilding.value = true
  // 在开始前先用已知状态设置初始值，避免进度条在模型加载期间显示 "0/0"
  const status = ids.length > 1
    ? await window.picrand.clipIndexStatusMulti?.(ids) || { total: 0, indexed: 0 }
    : await window.picrand.clipIndexStatus?.(ids[0]) || { total: 0, indexed: 0 }
  // total=0 时设为 1 避免进度条处于无效状态（后续事件会更新为正确值）
  aiProgressDone.value = 0
  aiProgressTotal.value = status.total > 0 ? status.total : 1
  try {
    const result: any = ids.length > 1
      ? await window.picrand.buildClipIndexMulti?.(ids, force)
      : await window.picrand.buildClipIndex?.(ids[0], force)
    if (!result?.ok) {
      aiToast.value = t('toast.aiIndexFailed', { msg: result?.reason || result?.error || t('common.unknown') })
      setTimeout(() => aiToast.value = '', 4000)
    } else {
      const n = result?.total || 0
      if (n > 0) {
        aiToast.value = t('toast.aiIndexDone')
      } else {
        // total=0 有两种：全部已索引 或 文件夹无图
        const st = ids.length > 1
          ? await window.picrand.clipIndexStatusMulti?.(ids)
          : await window.picrand.clipIndexStatus?.(ids[0])
        const remain = (st as any)?.total || 0
        aiToast.value = remain > 0 ? t('toast.aiIndexAllDone') : t('toast.aiIndexEmpty')
      }
      setTimeout(() => aiToast.value = '', 3000)
    }
  } catch (err: any) {
    aiToast.value = t('toast.aiIndexError', { msg: err?.message || err })
    setTimeout(() => aiToast.value = '', 4000)
  } finally {
    aiBuilding.value = false
    await refreshAiStatus()
  }
}

// ===== 色彩索引 =====
const colorBuilding = ref(false)
const colorProgressDone = ref(0)
const colorProgressTotal = ref(0)
const colorIndexStatus = ref<{ total: number; indexed: number } | null>(null)

const colorProgressPct = computed(() => {
  if (!colorProgressTotal.value) return 0
  return Math.min(100, Math.round((colorProgressDone.value / colorProgressTotal.value) * 100))
})
const colorProgressText = computed(() => `${colorProgressDone.value}/${colorProgressTotal.value}`)
const colorIndexStatusText = computed(() => {
  if (colorBuilding.value) return t('settings.colorBuilding')
  const s = colorIndexStatus.value
  if (!s || !s.total) return hasFolderLoaded.value ? t('settings.colorIndexNone') : t('settings.colorIndexNoFolder')
  return t('settings.colorIndexCount', { indexed: s.indexed, total: s.total })
})

async function refreshColorStatus() {
  if (!hasFolderLoaded.value) { colorIndexStatus.value = null; return }
  try {
    const ids = await currentFolderIds()
    if (!ids.length) { colorIndexStatus.value = null; return }
    const s = ids.length > 1
      ? await window.picrand.colorIndexStatusMulti?.(ids) || { total: 0, indexed: 0 }
      : await window.picrand.colorIndexStatus?.(ids[0]) || { total: 0, indexed: 0 }
    colorIndexStatus.value = s
  } catch { colorIndexStatus.value = null }
}

async function onBuildColorIndex(force = false) {
  if (colorBuilding.value) return
  const ids = await currentFolderIds()
  if (!ids.length) { colorToast.value = t('toast.noFolderSelected'); setTimeout(() => colorToast.value = '', 3000); return }
  if (force) {
    if (!confirm(t('settings.colorRebuildConfirm'))) return
  }
  colorBuilding.value = true
  const status = ids.length > 1
    ? await window.picrand.colorIndexStatusMulti?.(ids) || { total: 0, indexed: 0 }
    : await window.picrand.colorIndexStatus?.(ids[0]) || { total: 0, indexed: 0 }
  colorProgressDone.value = 0
  colorProgressTotal.value = status.total > 0 ? status.total : 1
  try {
    const result: any = ids.length > 1
      ? await window.picrand.buildColorIndexMulti?.(ids)
      : await window.picrand.buildColorIndex?.(ids[0], force)
    if (!result?.ok) {
      colorToast.value = t('toast.colorIndexFailed', { msg: result?.error || t('common.unknown') })
      setTimeout(() => colorToast.value = '', 4000)
    } else {
      const n = result?.total || 0
      if (n > 0) {
        colorToast.value = t('toast.colorIndexDone')
      } else {
        const st = ids.length > 1
          ? await window.picrand.colorIndexStatusMulti?.(ids)
          : await window.picrand.colorIndexStatus?.(ids[0])
        const remain = (st as any)?.total || 0
        colorToast.value = remain > 0 ? t('toast.colorIndexAllDone') : t('toast.colorIndexEmpty')
      }
      setTimeout(() => colorToast.value = '', 3000)
    }
  } catch (err: any) {
    colorToast.value = t('toast.colorIndexError', { msg: err?.message || err })
    setTimeout(() => colorToast.value = '', 4000)
  } finally {
    colorBuilding.value = false
    await refreshColorStatus()
  }
}

// 进度订阅：面板每次可见时重新订阅 clip-index-progress，关闭时退订，
// 避免组件 setup 顶层只订阅一次 + close() 取消订阅后不再重订导致索引后台跑但进度条不更新。
let _unsubProgress: (() => void) | null = null
let _unsubColorProgress: (() => void) | null = null
function _subscribeProgress() {
  _unsubscribeProgress()
  try {
    if (window.picrand?.onClipIndexProgress) {
      _unsubProgress = window.picrand.onClipIndexProgress((p: { done: number; total: number }) => {
        aiProgressDone.value = p.done
        aiProgressTotal.value = p.total
      })
    }
    if (window.picrand?.onColorIndexProgress) {
      _unsubColorProgress = window.picrand.onColorIndexProgress((p: { done: number; total: number }) => {
        colorProgressDone.value = p.done
        colorProgressTotal.value = p.total
      })
    }
  } catch {}
}
function _unsubscribeProgress() {
  try { _unsubProgress?.() } catch {}
  _unsubProgress = null
  try { _unsubColorProgress?.() } catch {}
  _unsubColorProgress = null
}
watch(() => props.visible, (v) => {
  if (v) {
    // 面板打开时把滑块同步为当前实际缩放（用户可能用 Ctrl+滚轮 / Ctrl+- 改过）
    const cur = Number(window.picrand.getZoomFactor?.())
    if (Number.isFinite(cur) && cur >= 0.5 && cur <= 1.5) config.zoomFactor = Math.round(cur * 20) / 20
    _subscribeProgress(); refreshAiStatus(); refreshColorStatus(); refreshShellMenuStatus()
  }
  else { _unsubscribeProgress() }
}, { immediate: true })

watch(() => gallery.folderPath, () => { if (config.aiSearchEnabled) refreshAiStatus(); refreshColorStatus() })
</script>

<style scoped>
.settings-overlay {
  position: fixed; inset: 0; z-index: 500;
  background: var(--overlay-bg);
  display: flex; align-items: center; justify-content: center;
}
.settings-panel {
  background: var(--bg-panel-solid); border: 1px solid var(--border-color);
  border-radius: 0; padding: 24px; width: 480px; height: 640px;
  overflow-y: auto;
}
h2 { margin: 0 0 12px; font-size: 16px; color: var(--text-primary); }

.settings-tabs {
  display: flex; gap: 4px; margin-bottom: 14px;
  border-bottom: 1px solid var(--border-color);
}
.settings-tab {
  flex: 1; padding: 7px 4px; font-size: 12px;
  background: transparent; color: var(--text-muted);
  border: none; border-bottom: 2px solid transparent;
  cursor: pointer; transition: color .15s, border-color .15s;
}
.settings-tab:hover { color: var(--text-primary); }
.settings-tab.active {
  color: var(--accent-color, #5b8cff);
  border-bottom-color: var(--accent-color, #5b8cff);
}
.folder-empty-hint {
  text-align: center; color: var(--text-muted); font-size: 13px;
  padding: 40px 8px;
}

.section-header {
  margin-top: 12px;
  font-size: 12px; font-weight: 600; text-transform: uppercase;
  color: var(--text-muted); letter-spacing: 1px;
}
.section-divider {
  height: 1px; margin: 8px 0 14px;
  background: var(--border-color); opacity: 0.6;
}

.setting-row {
  display: flex; align-items: center; gap: 12px; margin-bottom: 14px;
}
.setting-row > label:first-child {
  flex: 0 0 80px; font-size: 13px; color: var(--text-muted);
  display: flex; align-items: center; gap: 4px;
}
.slider-wrap {
  flex: 1; display: flex; align-items: center; gap: 8px;
}
.range-input {
  flex: 1;
  -webkit-appearance: none; appearance: none;
  height: 6px; border-radius: 3px;
  background: #444; outline: none;
}
.range-input::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 18px; height: 18px; border-radius: 50%;
  background: #888; cursor: pointer; border: 2px solid #555;
}
.range-input::-webkit-slider-thumb:hover { background: #aaa; }
.slider-val { font-size: 12px; color: var(--text-muted); min-width: 36px; text-align: right; }

.tb-select {
  padding: 4px 10px; background: var(--bg-input-solid);
  border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-secondary); font-size: 13px;
}

.help-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 15px; height: 15px; border-radius: 50%;
  background: var(--bg-hover); color: var(--text-muted);
  font-size: 10px; font-weight: 700; line-height: 1;
  cursor: help; user-select: none; flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}
.help-icon:hover { background: var(--btn-primary-bg); color: var(--text-primary); }

.warn-icon {
  display: inline-flex; align-items: center; justify-content: center;
  margin-left: 5px; cursor: help; user-select: none; flex-shrink: 0;
  vertical-align: -2px; transition: transform 0.15s;
}
.warn-icon:hover { transform: scale(1.15); }

.help-tip {
  position: fixed; z-index: 10000; pointer-events: none;
  max-width: 260px; padding: 8px 12px;
  background: var(--bg-panel-solid); color: var(--text-secondary);
  border: 1px solid var(--border-color); border-radius: 6px;
  font-size: 12px; line-height: 1.6;
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
}
.tip-fade-enter-active { transition: opacity 0.15s ease; }
.tip-fade-leave-active { transition: opacity 0.1s ease; }
.tip-fade-enter-from, .tip-fade-leave-to { opacity: 0; }

.theme-btns { display: flex; gap: 8px; }
.theme-opt {
  height: 30px; padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px; background: var(--bg-input);
  color: var(--text-muted); font-size: 12px; cursor: pointer;
  transition: all 0.15s;
}
.theme-opt:hover { background: var(--bg-hover); color: var(--text-primary); }
.theme-opt.active { border-color: var(--btn-primary-bg); color: var(--text-primary); background: var(--bg-hover); }

.path-row { display: flex; align-items: center; gap: 8px; flex: 1; }
.btn-pick {
  height: 28px; padding: 0 12px;
  border: 1px solid var(--border-color); border-radius: 5px;
  background: var(--bg-input); color: var(--text-secondary);
  font-size: 12px; cursor: pointer; white-space: nowrap;
}
.btn-pick:hover { background: var(--bg-hover); color: var(--text-primary); }
.zoom-reset { height: 22px; padding: 0 8px; font-size: 11px; }
.path-text {
  font-size: 11px; color: var(--text-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.toggle-wrap { display: flex; align-items: center; gap: 10px; }
.toggle-label { font-size: 13px; color: var(--text-secondary); min-width: 24px; }
.toggle-switch { position: relative; display: inline-block; width: 40px; height: 22px; cursor: pointer; }
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.toggle-slider {
  position: absolute; inset: 0;
  background: #555; border-radius: 11px;
  transition: background 0.2s;
}
.toggle-slider::before {
  content: ''; position: absolute; left: 3px; top: 3px;
  width: 16px; height: 16px; border-radius: 50%;
  background: #ccc; transition: transform 0.2s;
}
.toggle-switch input:checked + .toggle-slider { background: #5a8fd4; }
.toggle-switch input:checked + .toggle-slider::before { transform: translateX(18px); background: #fff; }

.shell-menu-wrap { display: flex; align-items: center; gap: 10px; flex: 1; }
.shell-menu-status {
  font-size: 12px; color: var(--text-muted);
  padding: 2px 8px; border-radius: 4px; background: var(--bg-input);
}
.shell-menu-status.on { color: #6ee0a3; }

.close-btn {
  width: 100%; padding: 10px; margin-top: 8px; border: none; border-radius: 8px;
  background: var(--btn-primary-bg); color: var(--text-primary); cursor: pointer; font-size: 14px;
}
.close-btn:hover { background: #4a4a7c; }

.ai-index-row { flex-direction: column; gap: 8px; }
.ai-index-controls { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.ai-index-status { font-size: 12px; color: var(--text-secondary); }
.ai-build-btn {
  padding: 7px 12px; border: 1px solid var(--border-color); border-radius: 6px;
  background: var(--bg-input); color: var(--text-primary); cursor: pointer; font-size: 12px;
}
.ai-build-btn:disabled { opacity: 0.5; cursor: default; }
.ai-build-btn:hover:not(:disabled) { background: var(--bg-hover); }
.ai-progress-wrap { display: flex; align-items: center; gap: 8px; }
.ai-progress-track { flex: 1; height: 6px; background: var(--bg-input-solid); border-radius: 3px; overflow: hidden; }
.ai-progress-bar { height: 100%; background: #6b8cff; transition: width 0.2s; }
.ai-progress-text { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
.ai-toast {
  margin-top: 6px; padding: 6px 10px; border-radius: 6px;
  background: var(--bg-toast, rgba(24,24,30,0.85));
  color: var(--text-primary); font-size: 12px;
}
</style>

<style>
/* 以图搜图确认对话框（Teleported to body，需要全局样式） */
.modal-body-search {
  display: flex; align-items: center; gap: 8px; margin-bottom: 12px;
}
.modal-icon-search {
  font-size: 20px; line-height: 1; flex-shrink: 0; color: #e0a800;
}
.modal-title-inline {
  font-size: 14px; font-weight: 600; color: var(--text-primary);
}

/* ===== 关于入口链接（在"其他"tab 内，scoped 可命中，但与详情窗口统一放此处）===== */
.about-link-row {
  display: flex; justify-content: flex-end;
  margin-top: 24px; padding-top: 14px;
  border-top: 1px solid var(--border-color);
}
.about-link {
  background: transparent; border: none; cursor: pointer;
  font-size: 12px; color: var(--text-muted);
  text-decoration: none; padding: 2px 4px;
  transition: color 0.15s;
}
.about-link:hover { color: var(--text-primary); }

/* ===== 关于详情窗口（Teleported to body，必须非 scoped）===== */
.about-overlay {
  position: fixed; inset: 0; z-index: 700;
  background: var(--overlay-bg);
  display: flex; align-items: center; justify-content: center;
}
.about-window {
  position: relative;
  background: var(--bg-panel-solid); border: 1px solid var(--border-color);
  border-radius: 12px; padding: 24px; width: 480px;
  max-height: 82vh; overflow-y: auto;
}
.about-close {
  position: absolute; top: 10px; right: 12px;
  width: 26px; height: 26px; border-radius: 6px;
  background: transparent; border: none; cursor: pointer;
  color: var(--text-muted); font-size: 14px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.about-close:hover { background: var(--border-color); color: var(--text-primary); }

.about-block { margin-bottom: 18px; }
.about-block:first-of-type { padding-right: 28px; }
.about-title { font-size: 18px; font-weight: 700; color: var(--text-primary); }
.about-subtitle { font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; }
.about-license-list { list-style: none; margin: 0; padding: 0; }
.about-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 4px 0; font-size: 12px; color: var(--text-primary);
  border-bottom: 1px solid var(--border-color);
}
.about-item:last-child { border-bottom: none; }
.about-item-name { color: var(--text-primary); }
.about-item-lic {
  color: var(--text-muted); font-size: 11px;
  font-family: 'Consolas', 'SF Mono', monospace;
}
.about-note {
  margin: 4px 0 0; font-size: 11px; line-height: 1.6;
  color: var(--text-muted); word-break: break-word;
}
</style>