// 从 icon.png 生成多尺寸 ICO（16/32/48 用 32bpp BMP + AND 掩码，256 用 PNG 条目）
const sharp = require('sharp');
const fs = require('fs');

(async () => {
  const src = 'resources/icon.png';
  const sizes = [16, 32, 48];
  const entries = [];

  for (const s of sizes) {
    const { data } = await sharp(src).resize(s, s, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const andStride = Math.ceil(s / 32) * 4;
    const bmpSize = 40 + s * s * 4 + andStride * s;
    entries.push({ size: s, isPng: false, data, bmpSize });
  }
  const png256 = await sharp(src).resize(256, 256, { kernel: 'lanczos3' }).png().toBuffer();
  entries.push({ size: 256, isPng: true, data: png256, bmpSize: png256.length });

  const headerSize = 6 + entries.length * 16;
  let off = headerSize;

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const dirBufs = entries.map(e => {
    const b = Buffer.alloc(16);
    b[0] = e.size === 256 ? 0 : e.size;   // 宽
    b[1] = e.size === 256 ? 0 : e.size;   // 高
    b[2] = 0;                              // 调色板数
    b[3] = 0;                              // 保留
    b.writeUInt16LE(1, 4);                 // planes
    b.writeUInt16LE(32, 6);                // bpp
    b.writeUInt32LE(e.bmpSize, 8);         // 数据大小
    b.writeUInt32LE(off, 12);              // 数据偏移
    off += e.bmpSize;
    return b;
  });

  const parts = [header, ...dirBufs];
  for (const e of entries) {
    if (e.isPng) { parts.push(e.data); continue; }
    const s = e.size;
    const bmi = Buffer.alloc(40);
    bmi.writeUInt32LE(40, 0);              // BITMAPINFOHEADER
    bmi.writeInt32LE(s, 4);                // 宽
    bmi.writeInt32LE(s * 2, 8);            // 高 = XOR + AND 两倍
    bmi.writeUInt16LE(1, 12);              // planes
    bmi.writeUInt16LE(32, 14);             // bpp
    bmi.writeUInt32LE(0, 16);              // BI_RGB
    bmi.writeUInt32LE(s * s * 4 + Math.ceil(s / 32) * 4 * s, 20);
    parts.push(bmi);

    // RGBA -> BGRA，自底向上
    const px = Buffer.alloc(s * s * 4);
    for (let y = 0; y < s; y++) {
      const srcRow = (s - 1 - y) * s * 4;
      const dstRow = y * s * 4;
      for (let x = 0; x < s; x++) {
        px[dstRow + x * 4]     = e.data[srcRow + x * 4 + 2];
        px[dstRow + x * 4 + 1] = e.data[srcRow + x * 4 + 1];
        px[dstRow + x * 4 + 2] = e.data[srcRow + x * 4];
        px[dstRow + x * 4 + 3] = e.data[srcRow + x * 4 + 3];
      }
    }
    parts.push(px);

    // AND 掩码全 0（透明度交给 alpha 通道）
    parts.push(Buffer.alloc(Math.ceil(s / 32) * 4 * s));
  }

  fs.writeFileSync('resources/icon.ico', Buffer.concat(parts));
  console.log('icon.ico:', fs.statSync('resources/icon.ico').size, '字节');
})();
