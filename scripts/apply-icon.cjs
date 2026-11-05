// electron-builder afterPack 钩子：用本地 rcedit 把 icon.ico 与版本信息写入最终 exe
// 不能走 electron-builder 自带的 rcedit（signAndEditExecutable 需要联网下载 winCodeSign）
const path = require('path')
const { createRequire } = require('module')

const req = createRequire(__filename)
const { rcedit } = req('rcedit')

exports.default = async function afterPack(context) {
  const { appOutDir, packager } = context
  const baseName = packager?.appInfo?.productFilename || 'PicRand'
  const exeName = `${baseName}.exe`
  const exePath = path.join(appOutDir, exeName)
  const iconPath = path.join(process.cwd(), 'resources', 'icon.ico')
  if (!require('fs').existsSync(exePath)) {
    console.error(`[apply-icon] exe 不存在，跳过: ${exePath}`)
    return
  }
  const appVersion = packager?.appInfo?.version || require('../package.json').version
  await rcedit(exePath, {
    icon: iconPath,
    'file-version': appVersion,
    'product-version': appVersion,
    'version-string': {
      CompanyName: 'BulBulLab',
      FileDescription: 'Picrand',
      ProductName: baseName,
      LegalCopyright: `Copyright © BulBulLab`,
    },
  })
  console.log(`[apply-icon] 已将 ${iconPath} 与版本信息（公司=BulBulLab，说明=Picrand）写入 ${exePath}`)
}
