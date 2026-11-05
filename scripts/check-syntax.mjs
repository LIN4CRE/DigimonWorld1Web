// Cross-platform syntax check for every ES module in the repository.
// Used by `npm run check` and CI. Replaces the old shell-only `node --check`
// loops so it works identically on Windows, macOS and Linux.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from './repo-paths.mjs';

const SKIP_DIRS = new Set(['node_modules', '.git', 'extracted', 'rom', 'public']);
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
    } else if (entry.isFile() && entry.name.endsWith('.mjs')) {
      files.push(path.join(dir, entry.name));
    }
  }
}
walk(ROOT_DIR);

let failed = 0;
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  const rel = path.relative(ROOT_DIR, file);
  if (result.status !== 0) {
    failed++;
    console.error(`FAIL ${rel}\n${result.stderr}`);
  } else {
    console.log(`ok   ${rel}`);
  }
}

// The browser scripts are classic scripts, not modules; check them too.
for (const rel of ['public/emulator-boot.js', 'public/sw.js']) {
  const file = path.join(ROOT_DIR, rel);
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed++;
    console.error(`FAIL ${rel}\n${result.stderr}`);
  } else {
    console.log(`ok   ${rel}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} file(s) failed syntax check.`);
  process.exit(1);
}
console.log(`\nAll ${files.length + 2} files passed syntax check.`);
