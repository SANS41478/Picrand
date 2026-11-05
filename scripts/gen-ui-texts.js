// 汇总所有 UI 文本三语对照表到 licenses/UI_TEXTS.txt
// 读取 zh/en/ja 三语 locale,按 key 分组输出。
const fs = require('fs')
const path = require('path')

const locDir = path.join(__dirname, '..', 'src', 'renderer', 'src', 'locales')
const out = path.join(__dirname, '..', 'licenses', 'UI_TEXTS.txt')

const zh = JSON.parse(fs.readFileSync(path.join(locDir, 'zh.json'), 'utf8'))
const en = JSON.parse(fs.readFileSync(path.join(locDir, 'en.json'), 'utf8'))
const ja = JSON.parse(fs.readFileSync(path.join(locDir, 'ja.json'), 'utf8'))

const keys = Object.keys(zh).sort()

// 按 namespace 分组(取 key 第一个点之前的部分)
const groups = {}
for (const k of keys) {
  const ns = k.split('.')[0]
  if (!groups[ns]) groups[ns] = []
  groups[ns].push(k)
}

const nsOrder = [
  'app', 'window', 'sort', 'search', 'context', 'gallery', 'seed',
  'folder', 'folderMgr', 'folderSel', 'pinboard', 'dashboard',
  'settings', 'tip', 'toast', 'dialog', 'delete', 'f1', 'gif',
  'common', 'color', 'time', 'about', 'error'
]
const seen = new Set()
const orderedNs = [...nsOrder]
for (const ns of Object.keys(groups)) if (!orderedNs.includes(ns)) orderedNs.push(ns)

const lines = []
lines.push('========================================================================')
lines.push('  PicRand — UI Texts (zh / en / ja)')
lines.push('  Auto-generated from src/renderer/src/locales/{zh,en,ja}.json')
lines.push('  Total keys: ' + keys.length)
lines.push('  Date: 2026-07-14')
lines.push('========================================================================')
lines.push('')
lines.push('NOTE:')
lines.push('  1. This file lists every user-facing string keyed by i18n key,')
lines.push('     with Chinese / English / Japanese side by side.')
lines.push('  2. The "About / Open Source Licenses" detail window is fixed to')
lines.push('     English (via tEn()); its strings live under the "about." namespace')
lines.push('     and always render the en.json value regardless of app language.')
lines.push('  3. Language self-names ("中文", "English", "日本語") in the language')
lines.push('     selector are intentionally NOT i18n\'d (UI convention).')
lines.push('  4. Some key values contain {placeholders} like {count}, {n}, {msg},')
lines.push('     {path}, {cur}/{total} — these are filled at runtime by t(key, params).')
lines.push('')

for (const ns of orderedNs) {
  if (!groups[ns]) continue
  lines.push('========================================================================')
  lines.push('  [' + ns + ']')
  lines.push('========================================================================')
  lines.push('')
  for (const k of groups[ns]) {
    const pad = (s, n) => s == null ? ' '.repeat(n) : (s + ' '.repeat(Math.max(0, n - s.length)))
    const z = zh[k] || ''
    const e = en[k] || ''
    const j = ja[k] || ''
    lines.push(k)
    lines.push('  zh: ' + z)
    lines.push('  en: ' + e)
    lines.push('  ja: ' + j)
    lines.push('')
  }
}

lines.push('========================================================================')
lines.push('  End of file')
lines.push('========================================================================')

fs.writeFileSync(out, lines.join('\n'), 'utf8')
console.log('Wrote ' + out + ' (' + keys.length + ' keys)')