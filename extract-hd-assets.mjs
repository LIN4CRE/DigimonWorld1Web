import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { ROOT_DIR, BIN_PATH, DISC_INDEX_PATH, PUBLIC_MAPS_DIR, PUBLIC_CARDS_DIR, assertRomPresent } from './scripts/repo-paths.mjs';

assertRomPresent(fs);

fs.mkdirSync(PUBLIC_MAPS_DIR, { recursive: true });
fs.mkdirSync(PUBLIC_CARDS_DIR, { recursive: true });

const discIndex = JSON.parse(fs.readFileSync(DISC_INDEX_PATH, 'utf8').replace(/^\uFEFF/, ''));
const binFd = fs.openSync(BIN_PATH, 'r');

function readDiscFile(lba, size) {
  const sectors = Math.ceil(size / 2048);
  const out = Buffer.alloc(sectors * 2048);
  for (let i = 0; i < sectors; i++) {
    fs.readSync(binFd, out, i * 2048, 2048, (lba + i) * 2352 + 24);
  }
  return out.subarray(0, size);
}

function writePng(filePath, width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  }
  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.concat([t, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcBuf), 0);
    return Buffer.concat([len, t, data, crc]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const rawRows = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawRows[y * (1 + width * 4)] = 0;
    rgbaBuffer.copy(rawRows, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idatData = zlib.deflateSync(rawRows, { level: 6 });
  const png = Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idatData),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
  fs.writeFileSync(filePath, png);
}

function bgr555ToRgba(c16) {
  const r = ((c16 & 0x1F) << 3) | ((c16 & 0x1F) >> 2);
  const g = (((c16 >> 5) & 0x1F) << 3) | (((c16 >> 5) & 0x1F) >> 2);
  const b = (((c16 >> 10) & 0x1F) << 3) | (((c16 >> 10) & 0x1F) >> 2);
  return [r, g, b, 255];
}

// EPX / Scale2x HD Edge-Preserving Upscaler (doubles width & height with smooth diagonal edges!)
function upscaleEpx2x(srcRgba, w, h) {
  const dstW = w * 2;
  const dstH = h * 2;
  const dst = Buffer.alloc(dstW * dstH * 4);

  function getPix(x, y) {
    const cx = Math.max(0, Math.min(w - 1, x));
    const cy = Math.max(0, Math.min(h - 1, y));
    return srcRgba.readUInt32LE((cy * w + cx) * 4);
  }
  function setPix(x, y, val) {
    dst.writeUInt32LE(val, (y * dstW + x) * 4);
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const P = getPix(x, y);
      const A = getPix(x, y - 1);
      const B = getPix(x + 1, y);
      const C = getPix(x - 1, y);
      const D = getPix(x, y + 1);

      let p1 = P, p2 = P, p3 = P, p4 = P;
      if (C === A && C !== D && A !== B) p1 = A;
      if (A === B && A !== C && B !== D) p2 = B;
      if (D === C && D !== B && C !== A) p3 = C;
      if (B === D && B !== A && D !== C) p4 = D;

      setPix(x * 2, y * 2, p1);
      setPix(x * 2 + 1, y * 2, p2);
      setPix(x * 2, y * 2 + 1, p3);
      setPix(x * 2 + 1, y * 2 + 1, p4);
    }
  }
  return { width: dstW, height: dstH, rgba: dst };
}

// 1. Decode Pre-Rendered File Island .TFS Backgrounds
function decodeTfsMap(tfsBuf, outPngPath, paletteIdx = 0) {
  const tilesW = tfsBuf.readUInt16LE(0);
  const tilesH = tfsBuf.readUInt16LE(2);
  const numPals = tfsBuf.readUInt16LE(4);
  if (tilesW === 0 || tilesW > 16 || tilesH === 0 || tilesH > 16) return null;

  const palUse = Math.min(paletteIdx, Math.max(0, numPals - 1));
  const clut = [];
  const palStart = 8 + palUse * 512;
  for (let i = 0; i < 256; i++) {
    clut.push(tfsBuf.readUInt16LE(palStart + i * 2));
  }

  const width = tilesW * 128;
  const height = tilesH * 128;
  const rgba = Buffer.alloc(width * height * 4);

  const tilesStart = 8 + numPals * 512;
  const numTiles = Math.floor((tfsBuf.length - tilesStart) / 16388);

  for (let t = 0; t < numTiles; t++) {
    const off = tilesStart + t * 16388;
    if (off + 16388 > tfsBuf.length) break;
    const vx = tfsBuf.readUInt16LE(off) * 2;
    const vy = tfsBuf.readUInt16LE(off + 2);
    const pixStart = off + 4;

    if (vx >= width || vy >= height) continue;

    for (let ty = 0; ty < 128; ty++) {
      const dstY = vy + ty;
      if (dstY >= height) continue;
      for (let tx = 0; tx < 128; tx++) {
        const dstX = vx + tx;
        if (dstX >= width) continue;
        const idx = tfsBuf[pixStart + ty * 128 + tx];
        if (idx === 0 && t >= tilesW * tilesH) continue; // Foreground overlay tile transparency
        const [r, g, b, a] = bgr555ToRgba(clut[idx] || 0);
        const p = (dstY * width + dstX) * 4;
        rgba[p] = r; rgba[p + 1] = g; rgba[p + 2] = b; rgba[p + 3] = a;
      }
    }
  }

  writePng(outPngPath, width, height, rgba);
  return { width, height, tilesW, tilesH, numPals };
}

const mapTargets = [
  { key: 'file_city', file: 'TWNA02.TFS', label: 'File City (Top)' },
  { key: 'jijimon_house', file: 'ROOM10.TFS', label: 'Jijimon\'s House' },
  { key: 'green_gym', file: 'TWNA08.TFS', label: 'Green Gym' },
  { key: 'native_forest', file: 'MAYO01.TFS', label: 'Native Forest' },
  { key: 'dragon_eye_lake', file: 'MIHA01.TFS', label: 'Dragon Eye Lake' },
  { key: 'tropical_jungle', file: 'TROP00.TFS', label: 'Tropical Jungle' },
  { key: 'freezeland', file: 'FRZL16.TFS', label: 'Freezeland' },
  { key: 'ogre_fortress', file: 'OGRE10.TFS', label: 'Ogre Fortress' },
  { key: 'mt_infinity', file: 'MGEN01.TFS', label: 'Mt. Infinity' }
];

for (const m of mapTargets) {
  const entry = discIndex.flatFiles.find(f => f.name === m.file);
  if (!entry) {
    console.log('Missing map:', m.file);
    continue;
  }
  const buf = readDiscFile(entry.lba, entry.size);
  const outPng = path.join(PUBLIC_MAPS_DIR, `${m.key}.png`);
  const res = decodeTfsMap(buf, outPng, 0);
  console.log(`Decoded ${m.file} -> ${m.key}.png`, res);
}

// 2. Extract and Upscale (2x EPX HD) all 66 Official Digimon Artwork Cards from CARD/CARD.ALL
const cardEntry = discIndex.flatFiles.find(f => f.name === 'CARD.ALL');
if (cardEntry) {
  const cardBuf = readDiscFile(cardEntry.lba, cardEntry.size);
  const CARD_STRIDE = 28672;
  const totalCards = Math.floor(cardBuf.length / CARD_STRIDE);

  for (let c = 0; c < totalCards; c++) {
    const base = c * CARD_STRIDE;
    const magic = cardBuf.readUInt32LE(base);
    if (magic !== 0x10) continue;

    const clut = [];
    for (let i = 0; i < 256; i++) {
      clut.push(cardBuf.readUInt16LE(base + 20 + i * 2));
    }
    const imgOff = base + 8 + 524;
    const wordW = cardBuf.readUInt16LE(imgOff + 8);
    const width = wordW * 2; // 150
    const height = cardBuf.readUInt16LE(imgOff + 10); // 180
    const pixStart = imgOff + 12;

    const rgba = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = cardBuf[pixStart + y * width + x];
        const [r, g, b, a] = bgr555ToRgba(clut[idx] || 0);
        const p = (y * width + x) * 4;
        rgba[p] = r; rgba[p + 1] = g; rgba[p + 2] = b; rgba[p + 3] = a;
      }
    }

    // Apply 2x EPX HD Edge-Preserving Upscale (150x180 -> 300x360 HD)
    const hd = upscaleEpx2x(rgba, width, height);
    const outCardPath = path.join(PUBLIC_CARDS_DIR, `card_${String(c).padStart(2, '0')}.png`);
    writePng(outCardPath, hd.width, hd.height, hd.rgba);
  }
  console.log(`Extracted and 2x HD-upscaled ${totalCards} Digimon portraits from CARD.ALL!`);
}

fs.closeSync(binFd);
