import { shell } from 'electron'

// Picrand 在 Steam 上的 AppID
const STEAM_APP_ID = 5013580
const STEAM_STORE_URL = 'https://store.steampowered.com/app/5013580/Picrand/'

export interface SteamStatus {
  checked: boolean
  genuine: boolean
  available: boolean
  owned: boolean
  familyShared: boolean
  freeWeekend: boolean
  steamId?: string
  persona?: string
  error?: string
}

const initialStatus: SteamStatus = {
  checked: false,
  genuine: false,
  available: false,
  owned: false,
  familyShared: false,
  freeWeekend: false,
}

let _status: SteamStatus = { ...initialStatus }
let _initPromise: Promise<SteamStatus> | null = null

export function getSteamStatus(): SteamStatus {
  return _status
}

// 查询当前账号是否拥有 Picrand 的 Steam 授权。
// 仅在主进程调用；steamworks.js 缺失、Steam 客户端未运行或初始化失败时
// 都按"非 Steam 授权环境"处理，由界面显示购买入口，不影响程序使用。
export function initSteamStatus(): Promise<SteamStatus> {
  if (_initPromise) return _initPromise
  _initPromise = (async () => {
    try {
      const steamworks = require('steamworks.js') as typeof import('steamworks.js')
      const client = steamworks.init(STEAM_APP_ID)

      const me = client.localplayer.getSteamId()
      const owned = !!client.apps.isSubscribedApp(STEAM_APP_ID)

      // 家庭共享：授权拥有者不是当前登录账号
      let familyShared = false
      try {
        const owner = client.apps.appOwner()
        familyShared = !!owner && owner.steamId64 !== me.steamId64
      } catch {}

      // 免费周末等临时授权不算"已购买"
      let freeWeekend = false
      try {
        freeWeekend = !!client.apps.isSubscribedFromFreeWeekend()
      } catch {}

      // 测试用：PICRAND_STEAM_FORCE_UNOWNED=1 可强制按未授权处理，便于预览购买按钮
      const forceUnowned = process.env.PICRAND_STEAM_FORCE_UNOWNED === '1'
      const genuine = !forceUnowned && owned && !familyShared && !freeWeekend

      let persona: string | undefined
      try { persona = client.localplayer.getName() } catch {}

      _status = {
        checked: true,
        genuine,
        available: true,
        owned,
        familyShared,
        freeWeekend,
        steamId: me?.steamId64?.toString(),
        persona,
      }
      console.log(`[steam] owned=${owned} genuine=${genuine} familyShared=${familyShared} freeWeekend=${freeWeekend}`)
    } catch (e: any) {
      const msg = e?.message || String(e)
      _status = { ...initialStatus, checked: true, error: msg }
      console.warn('[steam] authorization check failed:', msg)
    }
    return _status
  })()
  return _initPromise
}

export async function openSteamStore(): Promise<boolean> {
  try {
    await shell.openExternal(STEAM_STORE_URL)
    return true
  } catch (e) {
    console.warn('[steam] open store page failed:', e)
    return false
  }
}
