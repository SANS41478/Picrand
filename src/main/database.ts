import { createRequire } from 'module'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
// crypto.randomInt replaced with Math.random for reliability

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

let db: Database.Database | null = null

export function initDatabase(dataDir: string): Database.Database {
  const dbPath = join(dataDir, 'picrand.db')

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      display_name TEXT DEFAULT '',
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_id INTEGER,
      file_path TEXT UNIQUE NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER,
      modify_time INTEGER,
      width INTEGER,
      height INTEGER,
      thumbnail_path TEXT,
      is_favorite INTEGER DEFAULT 0,
      FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_images_folder ON images(folder_id);
    CREATE INDEX IF NOT EXISTS idx_images_modify ON images(modify_time);
    CREATE INDEX IF NOT EXISTS idx_images_name ON images(file_name);
  `)

  // 复合索引：`WHERE folder_id=? ORDER BY modify_time DESC [LIMIT n]` 是封面/最近图的高频路径。
  // 历史 idx_images_folder 只有单列，SQLite 要扫该文件夹全部行后 USE TEMP B-TREE 排序：
  // 11万图文件夹每次取封面都卡 1.1 秒。(folder_id, modify_time DESC) 让其直接走索引有序读取，
  // 取 LIMIT 1/3 时无需排序。dashboard/选择器/FolderManager 的封面与最近图全走这条。
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_images_folder_mtime ON images(folder_id, modify_time DESC)`) } catch {}

  // 迁移：补上 display_name 列
  try { db.exec(`ALTER TABLE folders ADD COLUMN display_name TEXT DEFAULT ''`) } catch {}
  // 迁移：补上 sort_order 列（可能在索引之前不存在）
  try { db.exec(`ALTER TABLE images ADD COLUMN sort_order REAL DEFAULT 0`) } catch {}
  // sort_order 索引必须在列添加之后创建
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_images_sort ON images(folder_id, sort_order)`) } catch {}
  // 迁移：风格漫游特征向量 BLOB（160 维 × 4 字节 = 640 字节）
  try { db.exec(`ALTER TABLE images ADD COLUMN features BLOB DEFAULT NULL`) } catch {}
  // 迁移：文件夹归类色
  try { db.exec(`ALTER TABLE folders ADD COLUMN color TEXT DEFAULT ''`) } catch {}
  // 迁移：文件夹封面图路径
  try { db.exec(`ALTER TABLE folders ADD COLUMN cover_path TEXT DEFAULT ''`) } catch {}
  // 迁移：文件夹收藏标记
  try { db.exec(`ALTER TABLE folders ADD COLUMN is_favorite INTEGER DEFAULT 0`) } catch {}
  // 迁移：文件夹手动排序
  try { db.exec(`ALTER TABLE folders ADD COLUMN sort_order REAL DEFAULT 0`) } catch {}
  try { db.exec(`ALTER TABLE folders ADD COLUMN random_seed TEXT DEFAULT NULL`) } catch {}
  try { db.exec(`ALTER TABLE images ADD COLUMN rating INTEGER DEFAULT 0`) } catch {}
  try { db.exec(`ALTER TABLE images ADD COLUMN description TEXT DEFAULT ''`) } catch {}
  // 迁移：AI 语义搜索 CLIP 向量（512 维 Float32 = 2048 字节）
  try { db.exec(`ALTER TABLE images ADD COLUMN clip_feat BLOB DEFAULT NULL`) } catch {}
  // 迁移：色彩信息（色相/饱和度/明度均值，JSON {h,s,v}）
  try { db.exec(`ALTER TABLE images ADD COLUMN color_info TEXT DEFAULT NULL`) } catch {}
  // 迁移：收藏时间戳（秒）
  try { db.exec(`ALTER TABLE images ADD COLUMN favorited_at INTEGER DEFAULT 0`) } catch {}
  // 性能：收藏查询走索引，避免在 10万+ 库里全表扫 is_favorite / favorited_at
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_images_favorite ON images(is_favorite, favorited_at DESC)`) } catch {}

  // 性能：开始界面 dashboard 需要每个文件夹的图片数与总大小，历史是开 dashboard 时
  // 对每个文件夹跑 SUM(file_size) 全扫该文件夹全部行，10万+ 库下累计阻塞主进程数秒。
  // 将这两个值缓存到 folders 表列，扫描入库/增删时增量维护，dashboard 点查即可。
  try { db.exec(`ALTER TABLE folders ADD COLUMN image_count INTEGER DEFAULT 0`) } catch {}
  try { db.exec(`ALTER TABLE folders ADD COLUMN total_size INTEGER DEFAULT 0`) } catch {}
  try { db.exec(`ALTER TABLE folders ADD COLUMN description TEXT DEFAULT ''`) } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_folders_stats ON folders(image_count)`) } catch {}

  // 一次性回填：把已有 folders 的 image_count/total_size 从 images 表汇总写入。
  // 此后只在 insert/delete 收藏时增量维护，不再每次 dashboard 计数都重复跑 SUM。
  try {
    const sentinel = join(dataDir, '.folders-stats-cached')
    if (!existsSync(sentinel)) {
      db.exec(`
        UPDATE folders SET
          image_count = (SELECT COUNT(*) FROM images WHERE images.folder_id = folders.id),
          total_size  = COALESCE((SELECT SUM(file_size) FROM images WHERE images.folder_id = folders.id), 0)
      `)
      writeFileSync(sentinel, '1', 'utf8')
    }
  } catch {}
  // 一次性清除旧格式色彩数据（曾含 avgR/avgG/avgB/hex/dominant，v2 仅需 h/s/v）
  try {
    const sentinel = join(dataDir, '.color-info-v2-migrated')
    if (!existsSync(sentinel)) {
      db.exec(`UPDATE images SET color_info = NULL`)
      writeFileSync(sentinel, '1', 'utf8')
    }
  } catch {}

  // folders.image_count/total_size 缓存列的自动维护触发器。
  // 必须在 ALTER TABLE 迁移之后创建（依赖已存在的 folders.image_count/total_size 列）。
  try { _ensureFolderStatsTriggers(db) } catch (e) { console.error('[db] folder stats triggers:', e) }

  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

// ===== Image CRUD =====

export function insertImage(
  folderId: number,
  filePath: string,
  fileName: string,
  fileSize: number,
  modifyTime: number,
  width: number,
  height: number,
  thumbnailPath: string
): void {
  const stmt = getDb().prepare(`
    INSERT OR IGNORE INTO images (folder_id, file_path, file_name, file_size, modify_time, width, height, thumbnail_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(folderId, filePath, fileName, fileSize, modifyTime, width, height, thumbnailPath)
  // folders.image_count/total_size 由 images 触发器自动维护，无需手动 bump
}

export function deleteImageByPath(filePath: string): void {
  getDb().prepare('DELETE FROM images WHERE file_path = ?').run(filePath)
}

export function getOrCreateFolder(folderPath: string): number {
  const insert = getDb().prepare('INSERT OR IGNORE INTO folders (path) VALUES (?)')
  const select = getDb().prepare('SELECT id FROM folders WHERE path = ?')
  insert.run(folderPath)
  return (select.get(folderPath) as { id: number }).id
}

export function getImagesByFolder(folderId: number): any[] {
  return getDb().prepare('SELECT * FROM images WHERE folder_id = ?').all(folderId)
}

// folders.image_count / total_size 由 images 表的触发器自动维护：
// 任何 INSERT OR IGNORE 命中即增量 +count/+size，任何 DELETE（含 ON DELETE CASCADE
// 删文件夹时连带删图）即 -count/-size。这样所有读写路径（scan-folder 的全删重插、
// watcher 单条增删、UI 删图）都无需各自维护缓存列，dashboard 点查 folders 即可。
// 用 MAX(0, ...) 兜底，防止计数漂到负数。
function _ensureFolderStatsTriggers(db: Database.Database): void {
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_images_ai_stats
    AFTER INSERT ON images
    BEGIN
      UPDATE folders SET
        image_count = MAX(0, image_count + 1),
        total_size  = MAX(0, total_size  + NEW.file_size)
      WHERE id = NEW.folder_id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_images_ad_stats
    AFTER DELETE ON images
    BEGIN
      UPDATE folders SET
        image_count = MAX(0, image_count - 1),
        total_size  = MAX(0, total_size  - OLD.file_size)
      WHERE id = OLD.folder_id;
    END;
    -- UPDATE 触发器：file_size 或 folder_id 变动时同步搬运缓存值
    CREATE TRIGGER IF NOT EXISTS trg_images_au_stats
    AFTER UPDATE OF file_size, folder_id ON images
    BEGIN
      UPDATE folders SET
        image_count = MAX(0, image_count - 1),
        total_size  = MAX(0, total_size  - OLD.file_size)
      WHERE id = OLD.folder_id;
      UPDATE folders SET
        image_count = image_count + 1,
        total_size  = total_size  + NEW.file_size
      WHERE id = NEW.folder_id;
    END;
  `)
}

// 批量插入（事务，避免逐条 INSERT 的性能瓶颈）
export function insertImagesBatch(folderId: number, images: Array<{
  file_path: string; file_name: string; file_size: number; modify_time: number; sort_order?: number
}>): void {
  const db = getDb()
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO images (folder_id, file_path, file_name, file_size, modify_time, width, height, thumbnail_path, sort_order)
    VALUES (?, ?, ?, ?, ?, 0, 0, '', ?)
  `)
  const tx = db.transaction(() => {
    for (const img of images) {
      stmt.run(folderId, img.file_path, img.file_name, img.file_size, img.modify_time, img.sort_order ?? 0)
    }
  })
  tx()
  // folders 缓存列由 trg_images_ai_stats 自动维护
}

// 分页查询（sortMode: 非 random 用 SQL ORDER BY 直接排序；random 用 sort_order 列）
export function getImagesPage(folderId: number, offset: number, limit: number, sortMode?: string): any[] {
  const orderClause = buildMultiOrderClause(sortMode || 'random')
  return getDb().prepare(
    `SELECT * FROM images WHERE folder_id = ?${fmtFilterClause()} ${orderClause} LIMIT ? OFFSET ?`
  ).all(folderId, limit, offset)
}

export function getImagesCount(folderId: number): number {
  const row = getDb().prepare(
    `SELECT COUNT(*) as cnt FROM images WHERE folder_id = ?${fmtFilterClause()}`
  ).get(folderId) as { cnt: number }
  return row?.cnt || 0
}

// 多文件夹分页查询
// random 模式：Fisher-Yates 全局洗牌（一次生成全量 ID shuffle，后续分页按序取）
// 其他模式：SQL ORDER BY 直接排序列，跨文件夹统一排序
const multiFolderShuffles = new Map<string, number[]>()

// ====== 格式筛选 ======
// 所有支持格式的规范列表（与扫描 worker 的 exts 集合保持同步）
export const SUPPORTED_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif', '.avif', '.svg', '.psd', '.heic', '.heif', '.mp4', '.webm', '.mov', '.mkv', '.avi', '.flv', '.f4v']

let _formatFilter: Set<string> | null = null  // null = 不过滤（全部格式可见）

// 设置格式筛选：exts 为带点扩展名列表；null/undefined/全量列表 = 不过滤
export function setFormatFilter(exts: string[] | null | undefined): void {
  if (!Array.isArray(exts)) { _formatFilter = null; multiFolderShuffles.clear(); return }
  const valid = exts.map(e => String(e).toLowerCase()).filter(e => SUPPORTED_EXTS.includes(e))
  _formatFilter = valid.length >= SUPPORTED_EXTS.length ? null : new Set(valid)
  multiFolderShuffles.clear()  // 多文件夹随机洗牌缓存作废，避免旧洗牌残留已禁用格式
}

export function isFormatAllowed(filePath: string): boolean {
  if (!_formatFilter) return true
  const dot = filePath.lastIndexOf('.')
  if (dot < 0) return false
  return _formatFilter.has(filePath.slice(dot).toLowerCase())
}

// 查询注入的 SQL 片段：无过滤返回空串；全部未勾选时 0=1（隐藏全部）
function fmtFilterClause(): string {
  if (!_formatFilter) return ''
  if (_formatFilter.size === 0) return ' AND 0=1'
  const likes = Array.from(_formatFilter).map(e => `lower(file_path) LIKE '%${e}'`).join(' OR ')
  return ` AND (${likes})`
}

function buildMultiOrderClause(sortMode?: string): string {
  switch (sortMode) {
    case 'name-asc':   return 'ORDER BY file_name ASC, file_path ASC'
    case 'name-desc':  return 'ORDER BY file_name DESC, file_path ASC'
    case 'time-asc':   return 'ORDER BY modify_time ASC, file_path ASC'
    case 'time-desc':  return 'ORDER BY modify_time DESC, file_path ASC'
    case 'dim-asc':    return 'ORDER BY (CASE WHEN width=0 OR height=0 THEN 99999999 ELSE width*height END) ASC, file_name ASC'
    case 'dim-desc':   return 'ORDER BY (CASE WHEN width=0 OR height=0 THEN -1 ELSE width*height END) DESC, file_name ASC'
    case 'size-asc':   return 'ORDER BY file_size ASC, file_name ASC'
    case 'size-desc':  return 'ORDER BY file_size DESC, file_name ASC'
    default:
    case 'random':     return 'ORDER BY sort_order'
  }
}

export function getImagesPageMulti(folderIds: number[], offset: number, limit: number, sortMode?: string): any[] {
  // random 模式：全局 Fisher-Yates 洗牌，确保跨文件夹真正随机混合
  if (!sortMode || sortMode === 'random') {
    const key = folderIds.sort((a, b) => a - b).join(',')
    if (offset === 0) {
      const placeholders = folderIds.map(() => '?').join(',')
      const ids = getDb().prepare(
        `SELECT id FROM images WHERE folder_id IN (${placeholders})${fmtFilterClause()}`
      ).all(...folderIds) as { id: number }[]
      const arr = ids.map(r => r.id)
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      multiFolderShuffles.set(key, arr)
    }
    const pool = multiFolderShuffles.get(key)
    if (!pool) return []
    const slice = pool.slice(offset, offset + limit)
    if (!slice.length) return []
    return getImagesByIds(slice)
  }

  // 色彩排序：跨文件夹读取 color_info 后按 H/S/V 排序，缓存 ID 池供分页复用。
  if (sortMode.startsWith('hue') || sortMode.startsWith('sat') || sortMode.startsWith('val')) {
    const ids = [...new Set(folderIds)].sort((a, b) => a - b)
    const key = `color:${ids.join(',')}:${sortMode}`
    let pool = multiFolderShuffles.get(key)
    if (!pool) {
      const placeholders = ids.map(() => '?').join(',')
      const rows = getDb().prepare(
        `SELECT id, color_info FROM images WHERE folder_id IN (${placeholders})${fmtFilterClause()}`
      ).all(...ids) as { id: number; color_info: string | null }[]
      const dir = sortMode.endsWith('-desc') ? -1 : 1
      const base = sortMode.replace('-asc', '').replace('-desc', '')
      const entries = rows.map(r => ({ id: r.id, hsv: _parseHsv(r.color_info) }))
      entries.sort((a, b) => {
        if (!a.hsv && !b.hsv) return 0
        if (!a.hsv) return 1
        if (!b.hsv) return -1
        if (base === 'hue') {
          const da = ((a.hsv.h % 360) + 360) % 360
          const db = ((b.hsv.h % 360) + 360) % 360
          return (da - db) * dir
        }
        if (base === 'sat') return (a.hsv.s - b.hsv.s) * dir
        return (a.hsv.v - b.hsv.v) * dir
      })
      pool = entries.map(e => e.id)
      multiFolderShuffles.set(key, pool)
    }
    const slice = pool.slice(offset, offset + limit)
    if (!slice.length) return []
    return getImagesByIds(slice)
  }

  // 非 random 模式：SQL ORDER BY 直接排序列
  const placeholders = folderIds.map(() => '?').join(',')
  const orderClause = buildMultiOrderClause(sortMode)
  return getDb().prepare(
    `SELECT * FROM images WHERE folder_id IN (${placeholders})${fmtFilterClause()} ${orderClause} LIMIT ? OFFSET ?`
  ).all(...folderIds, limit, offset)
}

export function getImagesCountMulti(folderIds: number[]): number {
  const placeholders = folderIds.map(() => '?').join(',')
  const row = getDb().prepare(
    `SELECT COUNT(*) as cnt FROM images WHERE folder_id IN (${placeholders})${fmtFilterClause()}`
  ).get(...folderIds) as { cnt: number }
  return row?.cnt || 0
}

// 搜索：文件名模糊匹配（使用 idx_images_name 索引）
export function searchImages(folderId: number, query: string, offset: number, limit: number): any[] {
  return getDb().prepare(
    `SELECT * FROM images WHERE folder_id = ? AND file_name LIKE ?${fmtFilterClause()} ORDER BY sort_order LIMIT ? OFFSET ?`
  ).all(folderId, `%${query}%`, limit, offset)
}

export function searchImagesCount(folderId: number, query: string): number {
  const row = getDb().prepare(
    `SELECT COUNT(*) as cnt FROM images WHERE folder_id = ? AND file_name LIKE ?${fmtFilterClause()}`
  ).get(folderId, `%${query}%`) as { cnt: number }
  return row?.cnt || 0
}

// 搜索：描述模糊匹配
export function searchByDescription(folderId: number, query: string, offset: number, limit: number): any[] {
  return getDb().prepare(
    `SELECT * FROM images WHERE folder_id = ? AND description LIKE ?${fmtFilterClause()} ORDER BY sort_order LIMIT ? OFFSET ?`
  ).all(folderId, `%${query}%`, limit, offset)
}

export function searchByDescriptionCount(folderId: number, query: string): number {
  const row = getDb().prepare(
    `SELECT COUNT(*) as cnt FROM images WHERE folder_id = ? AND description LIKE ?${fmtFilterClause()}`
  ).get(folderId, `%${query}%`) as { cnt: number }
  return row?.cnt || 0
}

// 搜索：按评分过滤（ratings 为已点亮的星级列表，空列表=搜索未打分图片）
export function searchByRating(folderId: number, ratings: number[], offset: number, limit: number): any[] {
  if (!ratings.length) {
    // 未选任何星级 → 搜索 rating = 0 的图片
    return getDb().prepare(
      `SELECT * FROM images WHERE folder_id = ? AND rating = 0${fmtFilterClause()} ORDER BY sort_order LIMIT ? OFFSET ?`
    ).all(folderId, limit, offset)
  }
  const ph = ratings.map(() => '?').join(',')
  return getDb().prepare(
    `SELECT * FROM images WHERE folder_id = ? AND rating IN (${ph})${fmtFilterClause()} ORDER BY rating DESC, sort_order LIMIT ? OFFSET ?`
  ).all(folderId, ...ratings, limit, offset)
}

export function searchByRatingCount(folderId: number, ratings: number[]): number {
  if (!ratings.length) {
    const row = getDb().prepare(
      `SELECT COUNT(*) as cnt FROM images WHERE folder_id = ? AND rating = 0${fmtFilterClause()}`
    ).get(folderId) as { cnt: number }
    return row?.cnt || 0
  }
  const ph = ratings.map(() => '?').join(',')
  const row = getDb().prepare(
    `SELECT COUNT(*) as cnt FROM images WHERE folder_id = ? AND rating IN (${ph})${fmtFilterClause()}`
  ).get(folderId, ...ratings) as { cnt: number }
  return row?.cnt || 0
}

// 搜索：按宽高比过滤（tolerance 为相对容差，如 0.05 = ±5%）
export function searchByAspectRatio(folderId: number, ratioW: number, ratioH: number, tolerance: number, offset: number, limit: number): any[] {
  const target = ratioW / ratioH
  const lo = target * (1 - tolerance)
  const hi = target * (1 + tolerance)
  return getDb().prepare(
    `SELECT * FROM images WHERE folder_id = ? AND width > 0 AND height > 0 AND (CAST(width AS REAL) / CAST(height AS REAL)) BETWEEN ? AND ?${fmtFilterClause()} ORDER BY sort_order LIMIT ? OFFSET ?`
  ).all(folderId, lo, hi, limit, offset)
}

export function searchByAspectRatioCount(folderId: number, ratioW: number, ratioH: number, tolerance: number): number {
  const target = ratioW / ratioH
  const lo = target * (1 - tolerance)
  const hi = target * (1 + tolerance)
  const row = getDb().prepare(
    `SELECT COUNT(*) as cnt FROM images WHERE folder_id = ? AND width > 0 AND height > 0 AND (CAST(width AS REAL) / CAST(height AS REAL)) BETWEEN ? AND ?${fmtFilterClause()}`
  ).get(folderId, lo, hi) as { cnt: number }
  return row?.cnt || 0
}

// ====== 多文件夹搜索：按条件过滤，保持当前排序顺序 ======
function searchMultiRows(
  folderIds: number[],
  condClause: string,
  condParams: any[],
  sortMode: string | undefined,
  offset: number,
  limit: number
): any[] {
  const ids = [...new Set(folderIds)].sort((a, b) => a - b)
  if (!ids.length) return []
  const placeholders = ids.map(() => '?').join(',')
  const base = `folder_id IN (${placeholders})${fmtFilterClause()} AND ${condClause}`

  if (!sortMode || sortMode === 'random') {
    const key = `${ids.join(',')}|${condClause}|${JSON.stringify(condParams)}`
    let pool = multiFolderShuffles.get(key)
    if (!pool) {
      const idRows = getDb().prepare(
        `SELECT id FROM images WHERE ${base}`
      ).all(...ids, ...condParams) as { id: number }[]
      pool = idRows.map(r => r.id)
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[pool[i], pool[j]] = [pool[j], pool[i]]
      }
      multiFolderShuffles.set(key, pool)
    }
    return getColorRowsByIdsOrdered(pool.slice(offset, offset + limit))
  }

  const orderClause = buildMultiOrderClause(sortMode)
  return getDb().prepare(
    `SELECT ${COLOR_SELECT_COLS} FROM images WHERE ${base} ${orderClause} LIMIT ? OFFSET ?`
  ).all(...ids, ...condParams, limit, offset)
}

function searchMultiCount(folderIds: number[], condClause: string, condParams: any[]): number {
  const ids = [...new Set(folderIds)].sort((a, b) => a - b)
  if (!ids.length) return 0
  const placeholders = ids.map(() => '?').join(',')
  const row = getDb().prepare(
    `SELECT COUNT(*) as cnt FROM images WHERE folder_id IN (${placeholders})${fmtFilterClause()} AND ${condClause}`
  ).get(...ids, ...condParams) as { cnt: number }
  return row?.cnt || 0
}

export function searchImagesMulti(folderIds: number[], query: string, offset: number, limit: number, sortMode?: string): any[] {
  return searchMultiRows(folderIds, 'file_name LIKE ?', [`%${query}%`], sortMode, offset, limit)
}
export function searchImagesCountMulti(folderIds: number[], query: string): number {
  return searchMultiCount(folderIds, 'file_name LIKE ?', [`%${query}%`])
}

export function searchByDescriptionMulti(folderIds: number[], query: string, offset: number, limit: number, sortMode?: string): any[] {
  return searchMultiRows(folderIds, 'description LIKE ?', [`%${query}%`], sortMode, offset, limit)
}
export function searchByDescriptionCountMulti(folderIds: number[], query: string): number {
  return searchMultiCount(folderIds, 'description LIKE ?', [`%${query}%`])
}

export function searchByRatingMulti(folderIds: number[], ratings: number[], offset: number, limit: number, sortMode?: string): any[] {
  if (!ratings.length) return searchMultiRows(folderIds, 'rating = 0', [], sortMode, offset, limit)
  const ph = ratings.map(() => '?').join(',')
  return searchMultiRows(folderIds, `rating IN (${ph})`, ratings, sortMode, offset, limit)
}
export function searchByRatingCountMulti(folderIds: number[], ratings: number[]): number {
  if (!ratings.length) return searchMultiCount(folderIds, 'rating = 0', [])
  const ph = ratings.map(() => '?').join(',')
  return searchMultiCount(folderIds, `rating IN (${ph})`, ratings)
}

export function searchByAspectRatioMulti(folderIds: number[], ratioW: number, ratioH: number, tolerance: number, offset: number, limit: number, sortMode?: string): any[] {
  const target = ratioW / ratioH
  const lo = target * (1 - tolerance)
  const hi = target * (1 + tolerance)
  return searchMultiRows(
    folderIds,
    'width > 0 AND height > 0 AND (CAST(width AS REAL) / CAST(height AS REAL)) BETWEEN ? AND ?',
    [lo, hi],
    sortMode,
    offset,
    limit
  )
}
export function searchByAspectRatioCountMulti(folderIds: number[], ratioW: number, ratioH: number, tolerance: number): number {
  const target = ratioW / ratioH
  const lo = target * (1 - tolerance)
  const hi = target * (1 + tolerance)
  return searchMultiCount(
    folderIds,
    'width > 0 AND height > 0 AND (CAST(width AS REAL) / CAST(height AS REAL)) BETWEEN ? AND ?',
    [lo, hi]
  )
}

// 按主键 ID 批量查图片（保持输入顺序，O(log N) 索引查找）
export function getImagesByIds(ids: number[]): any[] {
  if (!ids.length) return []
  const db = getDb()
  const placeholders = ids.map(() => '?').join(',')
  const rows = db.prepare(
    `SELECT id, folder_id, file_path, file_name, file_size, modify_time, width, height, thumbnail_path, is_favorite, sort_order FROM images WHERE id IN (${placeholders})`
  ).all(...ids) as any[]
  // SQLite IN 子句不保证返回顺序，按输入 IDs 顺序重建
  const map = new Map<number, any>()
  for (const r of rows) map.set(r.id, r)
  return ids.map(id => map.get(id)).filter(Boolean)
}

// 获取文件夹内全部图片 ID+路径（风格漫游用，只取两列，极快）
export function getAllImageIds(folderId: number): { id: number; file_path: string }[] {
  return getDb().prepare(`SELECT id, file_path FROM images WHERE folder_id = ?${fmtFilterClause()}`).all(folderId) as { id: number; file_path: string }[]
}

// 风格漫游：从数据库随机抽样（仅取 ID 后洗牌，用主键索引回查，极快）
export function getRandomSample(folderId: number, excludePath: string, count: number): any[] {
  const db = getDb()
  const ids = db.prepare(
    `SELECT id FROM images WHERE folder_id = ? AND file_path != ?${fmtFilterClause()}`
  ).all(folderId, excludePath) as { id: number }[]
  return pickAndFetch(ids, count, db)
}

// 风格漫游：多文件夹随机抽样
export function getRandomSampleMulti(folderIds: number[], excludePath: string, count: number): any[] {
  const db = getDb()
  const fPlaceholders = folderIds.map(() => '?').join(',')
  const ids = db.prepare(
    `SELECT id FROM images WHERE folder_id IN (${fPlaceholders}) AND file_path != ?${fmtFilterClause()}`
  ).all(...folderIds, excludePath) as { id: number }[]
  return pickAndFetch(ids, count, db)
}

function pickAndFetch(ids: { id: number }[], count: number, db: any): any[] {
  if (ids.length === 0) return []
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  const picked = ids.slice(0, Math.min(count, ids.length)).map(r => r.id)
  const placeholders = picked.map(() => '?').join(',')
  return db.prepare(
    `SELECT * FROM images WHERE id IN (${placeholders})`
  ).all(...picked)
}

// 按排序模式重新计算 folder 内全部图片的 sort_order
// 随机顺序备份：离开 random 时保存当前顺序，切回 random 时恢复而非重新洗牌
const _randomBackup = new Map<number, number[]>()
const _folderSortMode = new Map<number, string>()  // NOTE: index.ts re-compute stanza reads this via require() to update in skip-recompute path

export { _folderSortMode, _randomBackup }

// ====== Seeded PRNG ======
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return (h ^ (h >>> 16)) >>> 0
  }
}

function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 解析 color_info JSON，提取 h/s/v；无数据返回 null
function _parseHsv(colorInfo: string | null): { h: number; s: number; v: number } | null {
  if (!colorInfo) return null
  try {
    const o = JSON.parse(colorInfo)
    if (o.h != null && o.s != null && o.v != null) return { h: o.h, s: o.s, v: o.v }
    return null
  } catch { return null }
}

export function getFolderStoredSortMode(folderId: number): string | undefined {
  return _folderSortMode.get(folderId)
}

export function generateRandomSeed(): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz'
  let s = ''
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * 36)]
  return s
}

export function getFolderRandomSeed(folderId: number): string {
  const row = getDb().prepare('SELECT random_seed FROM folders WHERE id = ?').get(folderId) as any
  return row?.random_seed || ''
}

export function setFolderRandomSeed(folderId: number, seed: string): void {
  getDb().prepare('UPDATE folders SET random_seed = ? WHERE id = ?').run(seed, folderId)
}

export function recomputeSortOrder(folderId: number, sortMode: string, forceShuffle = false, hueOrigin = 0): void {
  const db = getDb()
  const needsColorInfo = sortMode.startsWith('hue') || sortMode.startsWith('sat') || sortMode.startsWith('val')
  const rows = db.prepare(
    needsColorInfo
      ? 'SELECT id, file_name, file_size, modify_time, width, height, color_info FROM images WHERE folder_id = ? ORDER BY id'
      : 'SELECT id, file_name, file_size, modify_time, width, height FROM images WHERE folder_id = ? ORDER BY id'
  ).all(folderId) as any[]
  if (rows.length === 0) {
    _folderSortMode.set(folderId, sortMode)
    return
  }

  function shuffleArr<T>(arr: T[], rng: () => number): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }

  const prevMode = _folderSortMode.get(folderId)


  const rowMap = new Map(rows.map(r => [r.id, r] as const))
  let sorted: typeof rows

  if (sortMode === 'random') {
    let seed = db.prepare('SELECT random_seed FROM folders WHERE id = ?').get(folderId)?.random_seed as string | null
    if (forceShuffle || !seed) {
      seed = generateRandomSeed()
      db.prepare('UPDATE folders SET random_seed = ? WHERE id = ?').run(seed, folderId)
    }
    const rng = mulberry32(xmur3(seed)())
    sorted = shuffleArr([...rows], rng)
  } else {
    switch (sortMode) {
      case 'name-asc':
        sorted = [...rows].sort((a, b) => a.file_name.localeCompare(b.file_name))
        break
      case 'name-desc':
        sorted = [...rows].sort((a, b) => b.file_name.localeCompare(a.file_name))
        break
      case 'time-asc':
        sorted = [...rows].sort((a, b) => a.modify_time - b.modify_time)
        break
      case 'time-desc':
        sorted = [...rows].sort((a, b) => b.modify_time - a.modify_time)
        break
      case 'dim-asc':
        sorted = [...rows].sort((a, b) => {
          const aa = (a.width || 0) * (a.height || 0), ba = (b.width || 0) * (b.height || 0)
          if (aa === 0 && ba === 0) return 0
          if (aa === 0) return 1
          if (ba === 0) return -1
          return aa - ba
        })
        break
      case 'dim-desc':
        sorted = [...rows].sort((a, b) => {
          const aa = (a.width || 0) * (a.height || 0), ba = (b.width || 0) * (b.height || 0)
          if (aa === 0 && ba === 0) return 0
          if (aa === 0) return 1
          if (ba === 0) return -1
          return ba - aa
        })
        break
      case 'size-asc':
        sorted = [...rows].sort((a, b) => a.file_size - b.file_size)
        break
      case 'size-desc':
        sorted = [...rows].sort((a, b) => b.file_size - a.file_size)
        break
      case 'hue-asc':
        sorted = [...rows].sort((a, b) => {
          const ca = _parseHsv(a.color_info), cb = _parseHsv(b.color_info)
          const ha = ca?.h ?? 361, hb = cb?.h ?? 361
          if (ha === 361 && hb === 361) return 0
          if (ha === 361) return 1
          if (hb === 361) return -1
          // 从 hueOrigin 开始的环形距离
          const da = ((ha - hueOrigin + 360) % 360 + 360) % 360
          const db = ((hb - hueOrigin + 360) % 360 + 360) % 360
          return da - db
        })
        break
      case 'hue-desc':
        sorted = [...rows].sort((a, b) => {
          const ca = _parseHsv(a.color_info), cb = _parseHsv(b.color_info)
          const ha = ca?.h ?? -1, hb = cb?.h ?? -1
          if (ha === -1 && hb === -1) return 0
          if (ha === -1) return 1
          if (hb === -1) return -1
          const da = ((ha - hueOrigin + 360) % 360 + 360) % 360
          const db = ((hb - hueOrigin + 360) % 360 + 360) % 360
          return db - da
        })
        break
      case 'sat-asc':
        sorted = [...rows].sort((a, b) => {
          const ca = _parseHsv(a.color_info), cb = _parseHsv(b.color_info)
          const sa = ca?.s ?? -1, sb = cb?.s ?? -1
          if (sa === -1 && sb === -1) return 0
          if (sa === -1) return 1
          if (sb === -1) return -1
          return sa - sb
        })
        break
      case 'sat-desc':
        sorted = [...rows].sort((a, b) => {
          const ca = _parseHsv(a.color_info), cb = _parseHsv(b.color_info)
          const sa = ca?.s ?? -1, sb = cb?.s ?? -1
          if (sa === -1 && sb === -1) return 0
          if (sa === -1) return 1
          if (sb === -1) return -1
          return sb - sa
        })
        break
      case 'val-asc':
        sorted = [...rows].sort((a, b) => {
          const ca = _parseHsv(a.color_info), cb = _parseHsv(b.color_info)
          const va = ca?.v ?? -1, vb = cb?.v ?? -1
          if (va === -1 && vb === -1) return 0
          if (va === -1) return 1
          if (vb === -1) return -1
          return va - vb
        })
        break
      case 'val-desc':
        sorted = [...rows].sort((a, b) => {
          const ca = _parseHsv(a.color_info), cb = _parseHsv(b.color_info)
          const va = ca?.v ?? -1, vb = cb?.v ?? -1
          if (va === -1 && vb === -1) return 0
          if (va === -1) return 1
          if (vb === -1) return -1
          return vb - va
        })
        break
      default:
        sorted = [...rows]
    }
  }

  const update = db.prepare('UPDATE images SET sort_order = ? WHERE id = ?')
  const tx = db.transaction(() => { sorted.forEach((img, i) => update.run(i, img.id)) })
  tx()
  _folderSortMode.set(folderId, sortMode)
}

export function updateFavorite(filePath: string, isFavorite: number): void {
  const ts = isFavorite ? Math.floor(Date.now() / 1000) : 0
  getDb().prepare('UPDATE images SET is_favorite = ?, favorited_at = ? WHERE file_path = ?').run(isFavorite, ts, filePath)
}

export function updateImageDimensions(filePath: string, width: number, height: number): void {
  getDb().prepare('UPDATE images SET width = ?, height = ? WHERE file_path = ?').run(width, height, filePath)
}

export function updateThumbnailPath(filePath: string, thumbnailPath: string): void {
  getDb().prepare('UPDATE images SET thumbnail_path = ? WHERE file_path = ?').run(thumbnailPath, filePath)
}

// 风格漫游特征向量
export function updateFeature(filePath: string, features: Float32Array): void {
  getDb().prepare('UPDATE images SET features = ? WHERE file_path = ?').run(Buffer.from(features.buffer), filePath)
}
// 批量写入特征：单事务提交，避免每张图一次 autocommit 的 WAL 落盘开销
export function updateFeaturesBatch(items: { filePath: string; features: Float32Array }[]): void {
  if (!items.length) return
  const stmt = getDb().prepare('UPDATE images SET features = ? WHERE file_path = ?')
  getDb().transaction(() => {
    for (const r of items) stmt.run(Buffer.from(r.features.buffer, r.features.byteOffset, r.features.byteLength), r.filePath)
  })()
}
// 按路径批量取缩略图路径（风格分析优先解码缩略图，省掉整张原图解码）
export function getThumbnailPaths(paths: string[]): Map<string, string> {
  const out = new Map<string, string>()
  if (!paths.length) return out
  const placeholders = paths.map(() => '?').join(',')
  const rows = getDb().prepare(
    `SELECT file_path, thumbnail_path FROM images WHERE file_path IN (${placeholders}) AND thumbnail_path IS NOT NULL AND thumbnail_path != ''`
  ).all(...paths) as { file_path: string; thumbnail_path: string }[]
  for (const r of rows) out.set(r.file_path, r.thumbnail_path)
  return out
}
export function getFeaturesByFolder(folderId: number): { file_path: string; features: Buffer | null }[] {
  return getDb().prepare('SELECT file_path, features FROM images WHERE folder_id = ?').all(folderId) as any[]
}
export function getAllFeatures(): { file_path: string; features: Buffer | null }[] {
  return getDb().prepare('SELECT file_path, features FROM images').all() as any[]
}

// AI 语义搜索 CLIP 向量（512 维 × 4 字节 = 2048 字节 BLOB）
export function updateClipFeature(filePath: string, vec: Float32Array): void {
  getDb().prepare('UPDATE images SET clip_feat = ? WHERE file_path = ?').run(Buffer.from(vec.buffer), filePath)
}
export function getClipFeaturesByFolder(folderId: number): { file_path: string; clip_feat: Buffer | null }[] {
  return getDb().prepare('SELECT file_path, clip_feat FROM images WHERE folder_id = ?').all(folderId) as any[]
}
export function getAllClipFeatures(): { file_path: string; clip_feat: Buffer | null }[] {
  return getDb().prepare('SELECT file_path, clip_feat FROM images').all() as any[]
}
export function getRootClipFeatures(folderIds: number[]): { file_path: string; clip_feat: Buffer | null }[] {
  if (!folderIds.length) return []
  const placeholders = folderIds.map(() => '?').join(',')
  return getDb().prepare(`SELECT file_path, clip_feat FROM images WHERE folder_id IN (${placeholders})`).all(...folderIds) as any[]
}
// 按路径数组批量取 CLIP 向量（风格漫游多模态模式用，避免依赖 getRandomSample 自带的 BLOB）
export function getClipFeaturesByPaths(paths: string[]): { file_path: string; clip_feat: Buffer | null }[] {
  if (!paths.length) return []
  const placeholders = paths.map(() => '?').join(',')
  return getDb().prepare(`SELECT file_path, clip_feat FROM images WHERE file_path IN (${placeholders})`).all(...paths) as any[]
}
export function countClipFeaturesByFolder(folderId: number): { total: number; indexed: number } {
  const row = getDb().prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN clip_feat IS NOT NULL THEN 1 ELSE 0 END) AS idx FROM images WHERE folder_id = ?').get(folderId) as any
  return { total: row?.total || 0, indexed: row?.idx || 0 }
}

export function countClipFeaturesByFolders(folderIds: number[]): { total: number; indexed: number } {
  if (!folderIds.length) return { total: 0, indexed: 0 }
  const placeholders = folderIds.map(() => '?').join(',')
  const row = getDb().prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN clip_feat IS NOT NULL THEN 1 ELSE 0 END) AS idx FROM images WHERE folder_id IN (${placeholders})`).get(...folderIds) as any
  return { total: row?.total || 0, indexed: row?.idx || 0 }
}

// ====== 色彩信息（色相/饱和度/明度 + 主色，JSON） ======
export function updateColorInfo(filePath: string, info: object): void {
  getDb().prepare('UPDATE images SET color_info = ? WHERE file_path = ?').run(JSON.stringify(info), filePath)
}
export function getColorInfoByFolder(folderId: number): { file_path: string; color_info: string | null }[] {
  return getDb().prepare('SELECT file_path, color_info FROM images WHERE folder_id = ?').all(folderId) as any[]
}
export function getColorInfoByPaths(paths: string[]): { file_path: string; color_info: string | null }[] {
  if (!paths.length) return []
  const placeholders = paths.map(() => '?').join(',')
  return getDb().prepare(`SELECT file_path, color_info FROM images WHERE file_path IN (${placeholders})`).all(...paths) as any[]
}
export function countColorInfoByFolder(folderId: number): { total: number; indexed: number } {
  const row = getDb().prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN color_info IS NOT NULL THEN 1 ELSE 0 END) AS idx FROM images WHERE folder_id = ?').get(folderId) as any
  return { total: row?.total || 0, indexed: row?.idx || 0 }
}
export function countColorInfoByFolders(folderIds: number[]): { total: number; indexed: number } {
  if (!folderIds.length) return { total: 0, indexed: 0 }
  const placeholders = folderIds.map(() => '?').join(',')
  const row = getDb().prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN color_info IS NOT NULL THEN 1 ELSE 0 END) AS idx FROM images WHERE folder_id IN (${placeholders})`).get(...folderIds) as any
  return { total: row?.total || 0, indexed: row?.idx || 0 }
}

// ====== 印象色搜索 ======
// 颜色距离：按启用的维度计算归一化欧氏距离，输出 0..1。
// H 使用环形色相差（0..180 归一化到 0..1），S/V 已是 0..1。
// 只对启用的维度求均值归一化，保证关闭某个维度后容差口径仍一致。
export function colorDistance(
  info: string | null,
  target: { h: number; s: number; v: number },
  useHue = true,
  useSat = true,
  useValue = true
): number | null {
  const hsv = _parseHsv(info)
  if (!hsv) return null
  let acc = 0
  let dims = 0
  if (useHue) {
    const hueDiff = Math.min(Math.abs(hsv.h - target.h), 360 - Math.abs(hsv.h - target.h)) / 180
    acc += hueDiff * hueDiff
    dims += 1
  }
  if (useSat) {
    const satDiff = Math.abs(hsv.s - target.s)
    acc += satDiff * satDiff
    dims += 1
  }
  if (useValue) {
    const valDiff = Math.abs(hsv.v - target.v)
    acc += valDiff * valDiff
    dims += 1
  }
  if (dims === 0) return 0
  return Math.sqrt(acc / dims)
}

// 只取展示所需列，刻意避开 clip_feat/features 两个大 BLOB，避免大文件夹全量扫描时冻结主进程。
const COLOR_SELECT_COLS = 'id, file_path, file_name, file_size, modify_time, width, height, thumbnail_path, is_favorite, rating, description, color_info'

function getColorRowsByIdsOrdered(ids: number[]): any[] {
  if (!ids.length) return []
  const placeholders = ids.map(() => '?').join(',')
  const rows = getDb().prepare(
    `SELECT ${COLOR_SELECT_COLS} FROM images WHERE id IN (${placeholders})`
  ).all(...ids) as any[]
  const map = new Map<number, any>()
  for (const row of rows) map.set(row.id, row)
  const ordered: any[] = []
  for (const id of ids) {
    const row = map.get(id)
    if (row) ordered.push(row)
  }
  return ordered
}

// 保持当前排序顺序，仅按颜色距离过滤。随机多文件夹复用 getImagesPageMulti 的全局洗牌缓存。
export function searchByColor(
  folderIds: number[],
  target: { h: number; s: number; v: number },
  tolerance: number,
  offset: number,
  limit: number,
  sortMode?: string,
  useHue = true,
  useSat = true,
  useValue = true
): { rows: any[]; total: number } {
  const ids = [...new Set(folderIds)].sort((a, b) => a - b)
  if (!ids.length) return { rows: [], total: 0 }

  let rows: any[] = []
  if (!sortMode || sortMode === 'random') {
    if (ids.length === 1) {
      rows = getDb().prepare(
        `SELECT ${COLOR_SELECT_COLS} FROM images WHERE folder_id = ?${fmtFilterClause()} ORDER BY sort_order, file_path`
      ).all(ids[0])
    } else {
      const key = ids.join(',')
      let pool = multiFolderShuffles.get(key)
      if (!pool) {
        const placeholders = ids.map(() => '?').join(',')
        const idRows = getDb().prepare(
          `SELECT id FROM images WHERE folder_id IN (${placeholders})${fmtFilterClause()}`
        ).all(...ids) as { id: number }[]
        pool = idRows.map(r => r.id)
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[pool[i], pool[j]] = [pool[j], pool[i]]
        }
        multiFolderShuffles.set(key, pool)
      }
      rows = getColorRowsByIdsOrdered(pool)
    }
  } else {
    const placeholders = ids.map(() => '?').join(',')
    const orderClause = buildMultiOrderClause(sortMode)
    rows = getDb().prepare(
      `SELECT ${COLOR_SELECT_COLS} FROM images WHERE folder_id IN (${placeholders})${fmtFilterClause()} ${orderClause}`
    ).all(...ids)
  }

  const matches = rows.filter(r => {
    const d = colorDistance(r.color_info, target, useHue, useSat, useValue)
    return d != null && d <= tolerance
  })
  return { rows: matches.slice(offset, offset + limit), total: matches.length }
}

export function updateRating(filePath: string, rating: number): void {
  getDb().prepare('UPDATE images SET rating = ? WHERE file_path = ?').run(rating, filePath)
}

export function updateDescription(filePath: string, desc: string): void {
  getDb().prepare('UPDATE images SET description = ? WHERE file_path = ?').run(desc, filePath)
}

export function clearRatingsInFolder(folderId: number): number {
  const info = getDb().prepare('UPDATE images SET rating = 0 WHERE folder_id = ? AND rating > 0').run(folderId)
  return info.changes || 0
}

export function clearDescriptionsInFolder(folderId: number): number {
  const info = getDb().prepare(`UPDATE images SET description = '' WHERE folder_id = ? AND description IS NOT NULL AND LENGTH(description) > 0`).run(folderId)
  return info.changes || 0
}

export function getFavoriteImages(): any[] {
  return getDb().prepare(`SELECT * FROM images WHERE is_favorite = 1${fmtFilterClause()} ORDER BY favorited_at DESC`).all()
}

// 仅返回收藏总数，不解 BLOB / 不取行。开始界面 dashboard 只需要数字，
// 历史 loadFavorites() 的 SELECT * 会把每条命中行的 clip_feat(2KB)+features(640B)
// 全解进 JS Buffer，在 10万+ 库下冻结主进程数秒。idx_images_favorite 让此查询点查即出。
export function getFavoritesCount(): number {
  const row = getDb().prepare('SELECT COUNT(*) as c FROM images WHERE is_favorite = 1').get() as { c: number } | undefined
  return row?.c || 0
}

// 点查 folders 缓存列，避免开 dashboard 时对每个文件夹跑 SUM(file_size) 全扫。
// 仅返回缓存数值；封面/最近图等仍由 buildFolderStats 的后续逻辑补。
export function getFolderCachedStats(folderId: number): { image_count: number; total_size: number } {
  const row = getDb().prepare('SELECT image_count, total_size FROM folders WHERE id = ?').get(folderId) as { image_count: number; total_size: number } | undefined
  return { image_count: row?.image_count || 0, total_size: row?.total_size || 0 }
}

// ===== Folder CRUD =====

export function getAllFolders(): any[] {
  return getDb().prepare('SELECT * FROM folders ORDER BY sort_order ASC, added_at DESC').all()
}

export function reorderFolders(orderedIds: number[]): void {
  const stmt = getDb().prepare('UPDATE folders SET sort_order = ? WHERE id = ?')
  const update = getDb().transaction((ids: number[]) => {
    for (let i = 0; i < ids.length; i++) {
      stmt.run(i, ids[i])
    }
  })
  update(orderedIds)
}

export function addFolder(folderPath: string, displayName: string): number {
  const name = displayName || folderPath.split('\\').pop() || folderPath
  const stmt = getDb().prepare('INSERT OR IGNORE INTO folders (path, display_name) VALUES (?, ?)')
  stmt.run(folderPath, name)
  const row = getDb().prepare('SELECT id FROM folders WHERE path = ?').get(folderPath) as { id: number }
  return row?.id || 0
}

export function updateFolderName(folderId: number, displayName: string): void {
  getDb().prepare('UPDATE folders SET display_name = ? WHERE id = ?').run(displayName, folderId)
}

export function updateFolderPath(folderId: number, newPath: string): void {
  getDb().prepare('UPDATE folders SET path = ? WHERE id = ?').run(newPath, folderId)
}

export function deleteFolderById(folderId: number): void {
  // 级联删除 images 表中关联记录
  getDb().prepare('DELETE FROM folders WHERE id = ?').run(folderId)
}

export function updateFolderColor(folderId: number, color: string): void {
  getDb().prepare('UPDATE folders SET color = ? WHERE id = ?').run(color, folderId)
}

export function updateFolderCover(folderId: number, coverPath: string): void {
  getDb().prepare('UPDATE folders SET cover_path = ? WHERE id = ?').run(coverPath, folderId)
}

export function updateFolderFavorite(folderId: number, val: number): void {
  getDb().prepare('UPDATE folders SET is_favorite = ? WHERE id = ?').run(val, folderId)
}

export function updateFolderDescription(folderId: number, desc: string): void {
  getDb().prepare('UPDATE folders SET description = ? WHERE id = ?').run(desc, folderId)
}

export function getFolderStoredCover(folderId: number): string {
  const row = getDb().prepare('SELECT cover_path FROM folders WHERE id = ?').get(folderId) as { cover_path: string } | undefined
  return row?.cover_path || ''
}

export function getFolderRandomThumbs(folderId: number, count: number): { file_path: string; thumbnail_path: string | null }[] {
  const db = getDb()
  // 历史 `ORDER BY RANDOM() LIMIT 3` 要给该文件夹全部行排序才能取前 3：
  // 11万图文件夹每次开选择器都在主进程同步全扫+排序，冻结数秒。
  // 改为只从 idx_images_folder 读 id 列（紧凑、只走索引），JS Fisher-Yates 洗牌取 N 个，
  // 再按主键 id IN(...) 精确回查 file_path/thumbnail_path 两列。洗牌 11 万 int 在 V8 里 < 2ms，
  // 避免了 SQLite 排序器拉整行进排序逻辑的代价。
  const ids = db.prepare('SELECT id FROM images WHERE folder_id = ?').all(folderId) as { id: number }[]
  if (ids.length === 0) return []
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  const picked = ids.slice(0, Math.min(count, ids.length)).map(r => r.id)
  if (!picked.length) return []
  const placeholders = picked.map(() => '?').join(',')
  return db.prepare(
    `SELECT file_path, thumbnail_path FROM images WHERE id IN (${placeholders})`
  ).all(...picked) as { file_path: string; thumbnail_path: string | null }[]
}

export function getFolderDisplayNameByPath(folderPath: string): string {
  const col = getDb().prepare('SELECT display_name FROM folders WHERE path = ?').get(folderPath) as { display_name: string } | undefined
  return col?.display_name || ''
}

export function getFolderStats(folderId: number): { count: number; totalSize: number; favCount: number; countCapped: boolean; latestPath: string | null; latestThumb: string | null; recentPaths: { file_path: string; thumbnail_path: string | null }[] } {
  const db = getDb()
  // count / totalSize 走 folders 缓存列点查（由 images 触发器维护），不再全扫该文件夹所有行。
  const cached = db.prepare('SELECT image_count, total_size FROM folders WHERE id = ?').get(folderId) as { image_count: number; total_size: number } | undefined
  const cnt = cached?.image_count || 0
  const countCapped = false
  const totalSize = cached?.total_size || 0
  // favCount：idx_images_favorite 让 (folder_id, is_favorite=1) 仍需走 folder_id 索引扫该文件夹，
  // 但 is_favorite=1 的行通常极少，命中后立刻累加，比无索引全表扫快得多。
  const favCnt = (db.prepare('SELECT COUNT(*) as c FROM images WHERE folder_id = ? AND is_favorite = 1').get(folderId) as any)?.c || 0
  // latest/recent 依赖 idx_images_modify，点查即可，不走 file_size 全扫。
  const latest = db.prepare('SELECT file_path, thumbnail_path FROM images WHERE folder_id = ? ORDER BY modify_time DESC LIMIT 1').get(folderId) as any
  const recent = db.prepare('SELECT file_path, thumbnail_path FROM images WHERE folder_id = ? AND file_path != ? ORDER BY modify_time DESC LIMIT 3').all(folderId, latest?.file_path || '') as { file_path: string; thumbnail_path: string | null }[]
  return {
    count: cnt,
    countCapped,
    totalSize,
    favCount: favCnt,
    latestPath: latest?.file_path || null,
    latestThumb: latest?.thumbnail_path || null,
    recentPaths: recent,
  }
}

export function closeDatabase(): void {
  _randomBackup.clear()
  multiFolderShuffles.clear()
  if (db) { db.close(); db = null }
}

// 内存探针用：暴露缓存大小
export function _getMfShufflesCount(): number { return multiFolderShuffles.size }
export function _getRandomBackupCount(): number { return _randomBackup.size }
