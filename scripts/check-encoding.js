// Encoding health check for PicRand source files
// Run: node scripts/check-encoding.js
// Detects: BOM, bare closing tags (encoding damage), stray < before special chars

const fs = require('fs');
const path = require('path');

const SCAN_DIRS = ['src/renderer/src', 'src/main', 'src/preload'];
const EXTENSIONS = ['.vue', '.ts', '.json', '.js'];

let totalFiles = 0;
let badFiles = [];

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory() && item.name !== 'node_modules' && item.name !== '_tmp') {
      scanDir(full);
    } else if (item.isFile() && EXTENSIONS.includes(path.extname(item.name))) {
      totalFiles++;
      const buf = fs.readFileSync(full);
      const issues = [];

      // Check 1: UTF-8 BOM at file start
      if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
        issues.push('BOM detected (should be plain UTF-8 without BOM)');
      }

      // Check 2: Bare closing tags (lost opening < due to encoding damage)
      const src = buf.toString('utf8');
      const bareTags = src.match(/(?<![<\w])(\/div>|\/span>|\/transition>|\/template>)/g);
      if (bareTags) {
        issues.push('Bare closing tag(s) without "<": ' + bareTags.join(', '));
      }

      // Check 3: Stray < before special Unicode chars (encoding damage pattern)
      if (src.includes('<\u25BC')) {
        issues.push('Stray "<" before \u25BC character (should be plain \u25BC)');
      }

      // Check 4: Null bytes (corrupted encoding)
      for (let i = 0; i < buf.length; i++) {
        if (buf[i] === 0x00) {
          issues.push('Null byte at offset ' + i);
          break;
        }
      }

      if (issues.length > 0) {
        badFiles.push({ file: full, issues });
      }
    }
  }
}

console.log('\n=== PicRand Encoding Health Check ===\n');

for (const dir of SCAN_DIRS) scanDir(dir);

console.log('Scanned: ' + totalFiles + ' source files\n');

if (badFiles.length === 0) {
  console.log('Result: ALL CLEAN \u2714');
  console.log('No BOM, no bare tags, no encoding damage detected.\n');
  process.exit(0);
} else {
  console.log('Result: ' + badFiles.length + ' FILE(S) WITH ISSUES \u2716\n');
  for (const f of badFiles) {
    console.log('  ' + f.file);
    for (const issue of f.issues) {
      console.log('    \u2192 ' + issue);
    }
    console.log();
  }
  console.log('Fix: Open affected files in VS Code, ensure encoding is UTF-8 (no BOM),');
  console.log('     then check for garbled characters and missing "<" in closing tags.\n');
  process.exit(1);
}
