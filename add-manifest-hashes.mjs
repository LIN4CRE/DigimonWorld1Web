// Adds SHA-256 content hashes + a disc version id to public/rom/manifest.json
// so the browser can cache chunks in IndexedDB and invalidate only changed ones.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const dir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), 'public', 'rom');
const mPath = path.join(dir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(mPath, 'utf8'));
const all = crypto.createHash('sha256');
for (const c of manifest.chunks) {
  const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, c.name))).digest('hex');
  c.sha256 = h;
  all.update(h);
}
manifest.version = all.digest('hex').slice(0, 16);
fs.writeFileSync(mPath, JSON.stringify(manifest, null, 2));
console.log('manifest version', manifest.version);
