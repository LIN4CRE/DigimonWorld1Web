import fs from 'node:fs';
import path from 'node:path';

import { ZIP_PATH, PUBLIC_ROM_DIR } from './scripts/repo-paths.mjs';

const src = ZIP_PATH;
const outDir = PUBLIC_ROM_DIR;
if (!fs.existsSync(src)) {
  console.error(`Disc ZIP not found at ${src}. Set DIGIMON_ROM_ZIP or place the archive in rom/.`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const buf = fs.readFileSync(src);
const chunkSize = 48 * 1024 * 1024; // 48 MB per chunk (< 50 MB GitHub limit)
const manifest = { fileName: 'Digimon World (Europe).zip', totalSize: buf.length, chunks: [] };

for (let i = 0, idx = 0; i < buf.length; i += chunkSize, idx++) {
  const slice = buf.subarray(i, Math.min(i + chunkSize, buf.length));
  const name = `part${idx}.bin`;
  fs.writeFileSync(path.join(outDir, name), slice);
  manifest.chunks.push({ name, size: slice.length });
  console.log(`Wrote ${name} (${(slice.length / 1048576).toFixed(2)} MB)`);
}

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Run `node add-manifest-hashes.mjs` next to add SHA-256 hashes + cache version for IndexedDB caching.');
console.log('✓ Split complete! Total chunks:', manifest.chunks.length);
