import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { BIN_PATH, OUT_DIR, assertRomPresent } from './scripts/repo-paths.mjs';

assertRomPresent(fs);
fs.mkdirSync(OUT_DIR, { recursive: true });

const fd = fs.openSync(BIN_PATH, 'r');
const stat = fs.statSync(BIN_PATH);
const SECTOR_SIZE = 2352;
const DATA_OFFSET = 24; // Mode 2 Form 1 user data starts at byte 24
const DATA_SIZE = 2048;

function readSectorData(lba) {
  const buf = Buffer.alloc(DATA_SIZE);
  fs.readSync(fd, buf, 0, DATA_SIZE, lba * SECTOR_SIZE + DATA_OFFSET);
  return buf;
}

function readLogicalBytes(lba, byteLength) {
  const sectorsNeeded = Math.ceil(byteLength / DATA_SIZE);
  const out = Buffer.alloc(sectorsNeeded * DATA_SIZE);
  for (let i = 0; i < sectorsNeeded; i++) {
    const s = readSectorData(lba + i);
    s.copy(out, i * DATA_SIZE);
  }
  return out.subarray(0, byteLength);
}

// Read Primary Volume Descriptor at Sector 16
const pvd = readSectorData(16);
const pvdType = pvd[0];
const stdId = pvd.toString('ascii', 1, 6);
const systemId = pvd.toString('ascii', 8, 40).trim();
const volumeId = pvd.toString('ascii', 40, 72).trim();
const volumeSpaceSize = pvd.readUInt32LE(80);
const volumeSetId = pvd.toString('ascii', 190, 318).trim();
const publisherId = pvd.toString('ascii', 318, 446).trim();
const dataPreparerId = pvd.toString('ascii', 446, 574).trim();
const applicationId = pvd.toString('ascii', 574, 702).trim();
const creationDate = pvd.toString('ascii', 813, 830).trim();

// Root directory record is at offset 156 (34 bytes)
const rootRecord = pvd.subarray(156, 190);
const rootLba = rootRecord.readUInt32LE(2);
const rootSize = rootRecord.readUInt32LE(10);

function parseDirectory(dirLba, dirSize, parentPath = '') {
  const buf = readLogicalBytes(dirLba, dirSize);
  const entries = [];
  let offset = 0;
  while (offset < buf.length) {
    const len = buf[offset];
    if (len === 0) {
      // Advance to next 2048-byte sector boundary
      const nextSector = (Math.floor(offset / DATA_SIZE) + 1) * DATA_SIZE;
      if (nextSector >= buf.length) break;
      offset = nextSector;
      continue;
    }
    const record = buf.subarray(offset, offset + len);
    const extentLba = record.readUInt32LE(2);
    const dataLen = record.readUInt32LE(10);
    const year = 1900 + record[18];
    const month = record[19];
    const day = record[20];
    const hour = record[21];
    const minute = record[22];
    const second = record[23];
    const flags = record[25];
    const isDir = (flags & 0x02) !== 0;
    const nameLen = record[32];
    let rawName = record.toString('ascii', 33, 33 + nameLen);
    if (nameLen === 1 && (record[33] === 0 || record[33] === 1)) {
      offset += len;
      continue;
    }
    const cleanName = rawName.replace(/;1$/, '');
    const fullPath = parentPath ? `${parentPath}/${cleanName}` : cleanName;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;

    const item = {
      name: cleanName,
      rawName,
      path: fullPath,
      type: isDir ? 'directory' : 'file',
      lba: extentLba,
      size: dataLen,
      sectors: Math.ceil(dataLen / DATA_SIZE),
      date: dateStr,
    };

    if (isDir) {
      item.children = parseDirectory(extentLba, dataLen, fullPath);
    }
    entries.push(item);
    offset += len;
  }
  return entries;
}

const tree = parseDirectory(rootLba, rootSize);

function flattenTree(nodes, list = []) {
  for (const n of nodes) {
    list.push({
      name: n.name,
      path: n.path,
      type: n.type,
      lba: n.lba,
      size: n.size,
      sectors: n.sectors,
      date: n.date,
    });
    if (n.children) flattenTree(n.children, list);
  }
  return list;
}

const flatFiles = flattenTree(tree);
console.log('PVD:', { stdId, systemId, volumeId, volumeSpaceSize, publisherId, dataPreparerId, applicationId, creationDate });
console.log('Total entries on disc:', flatFiles.length);
console.log('Top-level entries:', tree.map(t => `${t.name} (${t.type}, ${t.size} bytes, LBA ${t.lba})`));

// Extract SYSTEM.CNF and main executable
for (const entry of tree) {
  if (entry.type === 'file' && (entry.name === 'SYSTEM.CNF' || entry.name.startsWith('SLES_') || entry.name.startsWith('SLUS_') || entry.name.startsWith('SCES_'))) {
    const data = readLogicalBytes(entry.lba, entry.size);
    const outPath = path.join(OUT_DIR, entry.name);
    fs.writeFileSync(outPath, data);
    console.log(`Extracted ${entry.name} (${data.length} bytes) -> ${outPath}`);
  }
}

fs.writeFileSync(
  path.join(OUT_DIR, 'disc-index.json'),
  JSON.stringify({
    pvd: { stdId, systemId, volumeId, volumeSpaceSize, volumeSetId, publisherId, dataPreparerId, applicationId, creationDate, totalBytes: stat.size, totalSectors: stat.size / SECTOR_SIZE },
    tree,
    flatFiles
  }, null, 2)
);

fs.closeSync(fd);
