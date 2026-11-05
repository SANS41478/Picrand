import { ref } from 'vue'
import zh from './locales/zh.json'
import en from './locales/en.json'
import ja from './locales/ja.json'
import zhHant from './locales/zh-Hant.json'
import ko from './locales/ko.json'
import ru from './locales/ru.json'
import es from './locales/es-419.json'
import esES from './locales/es-ES.json'
import pt from './locales/pt-BR.json'
import ptPT from './locales/pt-PT.json'
import de from './locales/de.json'
import fr from './locales/fr.json'
import pl from './locales/pl.json'
import tr from './locales/tr.json'
import th from './locales/th.json'
import uk from './locales/uk.json'
import it from './locales/it.json'
import cs from './locales/cs.json'

const messages: Record<string, Record<string, string>> = { zh, en, ja, 'zh-Hant': zhHant, ko, ru, 'es-419': es, 'es-ES': esES, 'pt-BR': pt, 'pt-PT': ptPT, 'es': es, 'pt': pt, de, fr, pl, tr, th, uk, it, cs }
const currentLocale = ref('en')

export function setLocale(locale: string) {
  currentLocale.value = locale
  document.documentElement.setAttribute('lang', locale)
}

export function getLocale(): string {
  return currentLocale.value
}

export function t(key: string, params?: Record<string, string | number>): string {
  const msg = messages[currentLocale.value]?.[key]
  if (!msg) return key
  if (!params) return msg
  return msg.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`))
}

// 强制英文查表,不受当前语言影响(用于"关于/开源许可"等固定英文区块)
export function tEn(key: string, params?: Record<string, string | number>): string {
  const msg = messages['en']?.[key]
  if (!msg) return key
  if (!params) return msg
  return msg.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`))
}

export function useI18n() {
  return { t, tEn, locale: currentLocale }
}

export function getLocalizedError(code: string): string {
  const key = `error.${code}`
  return t(key) || code
}
