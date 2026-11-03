/*
 * Generate a small, auditable binary patch between two raw Mode2/2352 disc
 * images. The browser applies this patch to the decompressed .bin before
 * PCSX-ReARMed mounts it, so the already-committed ROM chunks stay unchanged.
 *
 * Usage:
 *   node scripts/generate-disc-patch.mjs <source.bin> <target.bin> [output.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const CHUNK_SIZE = 1024 * 1024;
const MERGE_GAP = 32;
const DEFAULT_OUTPUT = path.resolve('public/rom/disc-patch-v2.json');

function parseArgs(argv) {
  if (argv.length < 2 || argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: node scripts/generate-disc-patch.mjs <source.bin> <target.bin> [output.json]');
    process.exit(argv.length < 2 ? 1 : 0);
  }
  return {
    source: path.resolve(argv[0]),
    target: path.resolve(argv[1]),
    output: argv[2] ? path.resolve(argv[2]) : DEFAULT_OUTPUT
  };
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function readAt(fd, offset, length) {
  const buffer = Buffer.alloc(length);
  let read = 0;
  while (read < length) {
    const n = fs.readSync(fd, buffer, read, length - read, offset + read);
    if (n <= 0) throw new Error(`Unexpected end of file at offset ${offset + read}`);
    read += n;
  }
  return buffer;
}

function findChangedRanges(sourceFd, targetFd, sourceSize) {
  const sourceBuffer = Buffer.alloc(CHUNK_SIZE);
  const targetBuffer = Buffer.alloc(CHUNK_SIZE);
  const ranges = [];
  let offset = 0;
  let pendingStart = -1;
  let pendingEnd = -1;

  const flush = () => {
    if (pendingStart !== -1) ranges.push([pendingStart, pendingEnd]);
    pendingStart = -1;
    pendingEnd = -1;
  };

  while (offset < sourceSize) {
    const length = Math.min(CHUNK_SIZE, sourceSize - offset);
    fs.readSync(sourceFd, sourceBuffer, 0, length, offset);
    fs.readSync(targetFd, targetBuffer, 0, length, offset);
    for (let i = 0; i < length; i++) {
      if (sourceBuffer[i] === targetBuffer[i]) continue;
      const position = offset + i;
      if (pendingStart === -1) {
        pendingStart = position;
        pendingEnd = position + 1;
      } else if (position - pendingEnd <= MERGE_GAP) {
        pendingEnd = position + 1;
      } else {
        flush();
        pendingStart = position;
        pendingEnd = position + 1;
      }
    }
    offset += length;
  }
  flush();
  return ranges;
}

async function main() {
  const { source, target, output } = parseArgs(process.argv.slice(2));
  const sourceSize = fs.statSync(source).size;
  const targetSize = fs.statSync(target).size;
  if (sourceSize !== targetSize) {
    throw new Error(`Disc images differ in size: ${sourceSize} vs ${targetSize}`);
  }

  const [sourceSha256, targetSha256] = await Promise.all([
    sha256File(source),
    sha256File(target)
  ]);

  const sourceFd = fs.openSync(source, 'r');
  const targetFd = fs.openSync(target, 'r');
  let ranges;
  try {
    ranges = findChangedRanges(sourceFd, targetFd, sourceSize).map(([start, end]) => {
      const length = end - start;
      return {
        offset: start,
        length,
        before: readAt(sourceFd, start, length).toString('hex'),
        after: readAt(targetFd, start, length).toString('hex')
      };
    });
  } finally {
    fs.closeSync(sourceFd);
    fs.closeSync(targetFd);
  }

  const patch = {
    version: 2,
    description: 'Upgrade the committed patched SLES-02914 disc to the repaired 127-species ROM expansion.',
    sourceSize,
    targetSize,
    sourceSha256,
    targetSha256,
    mergeGap: MERGE_GAP,
    ranges
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(patch, null, 2) + '\n');
  const bytes = ranges.reduce((sum, range) => sum + range.length, 0);
  console.log(`Wrote ${output}`);
  console.log(`Source SHA-256: ${sourceSha256}`);
  console.log(`Target SHA-256: ${targetSha256}`);
  console.log(`Changed ranges: ${ranges.length}; patched bytes: ${bytes}`);
}

main().catch((error) => {
  console.error(`Disc patch generation failed: ${error.message}`);
  process.exitCode = 1;
});
