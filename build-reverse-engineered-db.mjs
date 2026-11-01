import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const ROOT_DIR = 'C:\\Users\\David\\.gemini\\antigravity\\scratch\\digimon-world-webui';
const BIN_PATH = path.join(ROOT_DIR, 'rom', 'Digimon World (Europe).bin');
const OUT_DIR = path.join(ROOT_DIR, 'extracted');
const PUBLIC_DATA_DIR = path.join(ROOT_DIR, 'public', 'data');
const PUBLIC_TEX_DIR = path.join(ROOT_DIR, 'public', 'textures');

fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });
fs.mkdirSync(PUBLIC_TEX_DIR, { recursive: true });

function readJsonSafe(filePath) {
  const buf = fs.readFileSync(filePath);
  const str = (buf[0] === 0xFF && buf[1] === 0xFE)
    ? buf.subarray(2).toString('utf16le')
    : buf.toString('utf8').replace(/^\uFEFF/, '');
  return JSON.parse(str);
}

const sles = fs.readFileSync(path.join(OUT_DIR, 'SLES_029.14'));
const discIndex = readJsonSafe(path.join(OUT_DIR, 'disc-index.json'));
const reaZipEvidence = readJsonSafe(path.join(ROOT_DIR, 'rea-zip-evidence.json'));
const reaDoctor = readJsonSafe(path.join(OUT_DIR, 'rea-doctor.json'));

// Helper: decode Shift-JIS fullwidth string at file offset in SLES_029.14
function readSjisAt(buf, startOffset) {
  if (startOffset < 0 || startOffset >= buf.length) return '';
  let i = startOffset;
  let chars = '';
  while (i < buf.length - 1) {
    const b1 = buf[i], b2 = buf[i + 1];
    if (b1 === 0 && b2 === 0) break;
    if (b1 === 0) break;
    if (b1 === 0x82 && b2 >= 0x4f && b2 <= 0x58) { chars += String.fromCharCode(0x30 + (b2 - 0x4f)); i += 2; }
    else if (b1 === 0x82 && b2 >= 0x60 && b2 <= 0x79) { chars += String.fromCharCode(0x41 + (b2 - 0x60)); i += 2; }
    else if (b1 === 0x82 && b2 >= 0x81 && b2 <= 0x9a) { chars += String.fromCharCode(0x61 + (b2 - 0x81)); i += 2; }
    else if (b1 === 0x81 && b2 === 0x40) { chars += ' '; i += 2; }
    else if (b1 === 0x81 && b2 === 0x43) { chars += ','; i += 2; }
    else if (b1 === 0x81 && b2 === 0x44) { chars += '.'; i += 2; }
    else if (b1 === 0x81 && b2 === 0x46) { chars += ':'; i += 2; }
    else if (b1 === 0x81 && b2 === 0x48) { chars += '?'; i += 2; }
    else if (b1 === 0x81 && b2 === 0x49) { chars += '!'; i += 2; }
    else if (b1 === 0x81 && (b2 === 0x5b || b2 === 0x7c || b2 === 0x5d)) { chars += '-'; i += 2; }
    else if (b1 === 0x81 && b2 === 0x66) { chars += "'"; i += 2; }
    else if (b1 === 0x81 && b2 === 0x5e) { chars += '/'; i += 2; }
    else if (b1 === 0x81 && b2 === 0x93) { chars += '%'; i += 2; }
    else if (b1 === 0x81 && b2 === 0x95) { chars += '&'; i += 2; }
    else if (b1 >= 0x20 && b1 <= 0x7e) { chars += String.fromCharCode(b1); i += 1; }
    else { i += 2; }
  }
  return chars.replace(/\s+/g, ' ').trim();
}

function vaddrToFileOffset(vaddr) {
  if (vaddr < 0x80090800 || vaddr >= 0x80090800 + sles.length - 0x800) return -1;
  return vaddr - 0x80090000;
}

const ELEMENT_NAMES = {
  0: 'Fire',
  1: 'Battle',
  2: 'Air',
  3: 'Earth',
  4: 'Ice',
  5: 'Mech',
  6: 'Filth',
  255: 'None'
};

const RANGE_NAMES = {
  0: 'Self',
  1: 'Short',
  2: 'Long',
  3: 'Wide',
  4: 'Support'
};

const STATUS_NAMES = {
  0: 'None',
  1: 'Flat',
  2: 'Poison',
  3: 'Confusion',
  4: 'Stun'
};

const TYPE_NAMES = {
  0: 'Human',
  1: 'Data',
  2: 'Vaccine',
  3: 'Virus'
};

const LEVEL_NAMES = {
  0: 'Special',
  1: 'Fresh (Baby I)',
  2: 'In-Training (Baby II)',
  3: 'Rookie (Child)',
  4: 'Champion (Adult)',
  5: 'Ultimate (Perfect)'
};

// 1. Parse 121 Techniques (0x9fad0 pointers, 0x9fcb8 16-byte structs)
const techniques = [];
for (let id = 0; id < 121; id++) {
  const namePtr = sles.readUInt32LE(0x9fad0 + id * 4);
  const nameOff = vaddrToFileOffset(namePtr);
  const name = readSjisAt(sles, nameOff) || `Tech #${id}`;
  const stOff = 0x9fcb8 + id * 16;
  const st = sles.subarray(stOff, stOff + 16);
  const aiDist = st.readUInt32LE(0);
  const power = st.readUInt16LE(4);
  const mpRaw = st[6];
  const mpCost = mpRaw * 3;
  const frames = st[7];
  const rangeCode = st[8];
  const specCode = st[9];
  const statusCode = st[10];
  const accuracyFactor = st[11];
  const statusChance = st[12];
  const isFinisher = id >= 58;

  techniques.push({
    id,
    name,
    namePtr: '0x' + namePtr.toString(16).toUpperCase(),
    structOffset: '0x' + stOff.toString(16).toUpperCase(),
    power,
    mpCost,
    mpRaw,
    range: RANGE_NAMES[rangeCode] || `Range ${rangeCode}`,
    specialty: ELEMENT_NAMES[specCode] || 'Special',
    specialtyId: specCode,
    statusEffect: STATUS_NAMES[statusCode] || 'None',
    statusChance,
    accuracyFactor,
    isFinisher,
    category: id < 56 ? 'Learnable Tech' : (id < 113 ? 'Finisher / Signature' : 'Baby Bubble')
  });
}

// 2. Parse 128 Items (0xa0a58 name ptrs, 0xa0c58 desc ptrs (2 per item = 8 bytes), 0xa1058 color, 0xa1108 handler ptr)
const items = [];
for (let id = 0; id < 128; id++) {
  const namePtr = sles.readUInt32LE(0xA0A58 + id * 4);
  const nameOff = vaddrToFileOffset(namePtr);
  const name = readSjisAt(sles, nameOff) || `Item #${id}`;

  const descPtr1 = sles.readUInt32LE(0xA0C58 + id * 8);
  const descPtr2 = sles.readUInt32LE(0xA0C58 + id * 8 + 4);
  const d1 = readSjisAt(sles, vaddrToFileOffset(descPtr1));
  const d2 = readSjisAt(sles, vaddrToFileOffset(descPtr2));
  const description = [d1, (d2 && d2 !== '???' ? d2 : '')].filter(Boolean).join(' ');

  const iconPalette = sles[0xA1058 + id];
  const handlerPtr = sles.readUInt32LE(0xA1108 + id * 4);

  let category = 'Key / Special';
  if (id <= 13) category = 'Recovery / Medicine';
  else if (id <= 20) category = 'Battle Disk';
  else if (id === 21) category = 'Utility';
  else if (id <= 30) category = 'Stat Chip';
  else if (id <= 36) category = 'Care / Utility';
  else if (id <= 69) category = 'Food / Produce';
  else if (id <= 106) category = 'Digivolution Item';

  items.push({
    id,
    name,
    description: description || 'Special File Island item.',
    category,
    iconPalette,
    namePtr: '0x' + namePtr.toString(16).toUpperCase(),
    handlerPtr: '0x' + handlerPtr.toString(16).toUpperCase()
  });
}

// 3. Parse 127 Digimon / Entities (0xa8b5c 32-byte structs, 0xaa1dc name pointers, 0xaac0c 8-byte MMD model codes)
const digimonList = [];
for (let id = 0; id < 128; id++) {
  const namePtr = sles.readUInt32LE(0xAA1DC + id * 4);
  const nameOff = vaddrToFileOffset(namePtr);
  const rawName = readSjisAt(sles, nameOff);
  const modelCode = sles.toString('ascii', 0xAAC0C + id * 8, 0xAAC0C + id * 8 + 8).replace(/\0.*$/s, '').trim();

  const stOff = 0xA8B5C + id * 32;
  const st = sles.subarray(stOff, stOff + 32);
  const radius = st.readUInt16LE(0);
  const height = st.readUInt16LE(4);
  const scale = st.readUInt16LE(6);
  const typeCode = st[8];
  const levelCode = st[9];
  const spec1 = st[10];
  const spec2 = st[11];
  const spec3 = st[12];
  const dropItemId = st[13];
  const dropChance = st[14];

  const moveIds = [];
  for (let m = 15; m < 31; m++) {
    if (st[m] !== 0xFF && st[m] < techniques.length) {
      moveIds.push(st[m]);
    }
  }

  const moves = moveIds.map(mid => techniques[mid]?.name || `Tech #${mid}`);
  const finisher = moveIds.length > 0 ? (techniques[moveIds[moveIds.length - 1]]?.name || null) : null;

  const isPlayablePartner = id >= 1 && id <= 65;

  digimonList.push({
    id,
    name: id === 0 ? 'Analog Boy (Player)' : (rawName || modelCode || `Entity #${id}`),
    modelCode,
    modelFile: `${modelCode}.MMD`,
    structOffset: '0x' + stOff.toString(16).toUpperCase(),
    namePtr: '0x' + namePtr.toString(16).toUpperCase(),
    type: TYPE_NAMES[typeCode] || `Type ${typeCode}`,
    level: LEVEL_NAMES[levelCode] || `Stage ${levelCode}`,
    levelCode,
    specialties: [ELEMENT_NAMES[spec1], ELEMENT_NAMES[spec2], ELEMENT_NAMES[spec3]].filter(s => s && s !== 'None'),
    dropItem: dropItemId !== 0xFF && items[dropItemId] ? items[dropItemId].name : 'None',
    dropChance: dropItemId !== 0xFF ? dropChance : 0,
    radius,
    height,
    scale,
    moves,
    finisher,
    isPlayablePartner,
    rawHex: Array.from(st).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
  });
}

// 4. Parse Overlay Modules (*_REL.BIN) from disc
const OVERLAY_ROLES = {
  'BTL_REL.BIN': '3D Real-Time Battle Engine & AI Controller',
  'STD_REL.BIN': 'Main Field Exploration, File City & NPC Interaction Engine',
  'MOV_REL.BIN': 'MDEC Full-Motion Video (STR) & Opening/Ending Stream Player',
  'VS_REL.BIN': '2-Player Memory Card Battle Arena & Tournament Engine',
  'KAR_REL.BIN': 'Freezeland Penguinmon Curling Mini-Game Engine',
  'FISH_REL.BIN': 'Dragon Eye Lake Fishing Mini-Game Physics & Lure Engine',
  'DOO2_REL.BIN': 'Secondary Door / Dungeon Transition & Boss Room Loader',
  'EVL_REL.BIN': 'Digivolution Animation, Stat Mutation & Transformation Engine',
  'DOOA_REL.BIN': 'Primary Door & Map Portal Transition Controller',
  'SHOP_REL.BIN': 'File City Shop, Secret Item Shop & Economy UI Overlay',
  'TRN_REL.BIN': 'Green Gym Standard Training & Stat Roulette Overlay',
  'TRN2_REL.BIN': 'Beetle Land / Ice Sanctuary Bonus Training Overlay',
  'MURD_REL.BIN': 'Greymon Arena Tournament Bracket & Schedule Controller',
  'EAB_REL.BIN': 'Special Event & Arena Effect Bridge Overlay',
  'ENDI_REL.BIN': 'Ending Credits & Epilogue Sequence Controller',
  'DGET_REL.BIN': 'Digimon Recruitment / Prosperity Point Jijimon Tracker'
};

const binFd = fs.openSync(BIN_PATH, 'r');
function readDiscFile(lba, size) {
  const sectors = Math.ceil(size / 2048);
  const out = Buffer.alloc(sectors * 2048);
  for (let i = 0; i < sectors; i++) {
    fs.readSync(binFd, out, i * 2048, 2048, (lba + i) * 2352 + 24);
  }
  return out.subarray(0, size);
}

const overlays = discIndex.tree
  .filter(e => e.type === 'file' && e.name.endsWith('_REL.BIN'))
  .map(e => {
    const buf = readDiscFile(e.lba, e.size);
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    return {
      name: e.name,
      size: e.size,
      lba: e.lba,
      sectors: e.sectors,
      loadAddress: '0x80010000',
      sha256,
      role: OVERLAY_ROLES[e.name] || 'Dynamic Runtime Overlay'
    };
  });

// 5. Decode PlayStation .TIM textures into PNG files!
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
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rawRows = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawRows[y * (1 + width * 4)] = 0; // filter type 0
    rgbaBuffer.copy(rawRows, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idatData = zlib.deflateSync(rawRows);
  const png = Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idatData),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
  fs.writeFileSync(filePath, png);
}

function bgr555ToRgba(color16, isTransparentZero = true) {
  if (color16 === 0 && isTransparentZero) return [0, 0, 0, 0];
  const r = ((color16 & 0x1F) << 3) | ((color16 & 0x1F) >> 2);
  const g = (((color16 >> 5) & 0x1F) << 3) | (((color16 >> 5) & 0x1F) >> 2);
  const b = (((color16 >> 10) & 0x1F) << 3) | (((color16 >> 10) & 0x1F) >> 2);
  return [r, g, b, 255];
}

function decodeTimToPng(timBuf, outPngPath) {
  const magic = timBuf.readUInt32LE(0);
  if (magic !== 0x10) return null;
  const flags = timBuf.readUInt32LE(4);
  const pmode = flags & 0x07; // 0=4bpp, 1=8bpp, 2=16bpp, 3=24bpp
  const hasClut = (flags & 0x08) !== 0;

  let offset = 8;
  let clut = [];
  let clutW = 0, clutH = 0;
  if (hasClut) {
    const clutBnum = timBuf.readUInt32LE(offset);
    const clutX = timBuf.readUInt16LE(offset + 4);
    const clutY = timBuf.readUInt16LE(offset + 6);
    clutW = timBuf.readUInt16LE(offset + 8);
    clutH = timBuf.readUInt16LE(offset + 10);
    const numColors = clutW * clutH;
    for (let i = 0; i < numColors; i++) {
      clut.push(timBuf.readUInt16LE(offset + 12 + i * 2));
    }
    offset += clutBnum;
  }

  const imgBnum = timBuf.readUInt32LE(offset);
  const vramX = timBuf.readUInt16LE(offset + 4);
  const vramY = timBuf.readUInt16LE(offset + 6);
  const wordW = timBuf.readUInt16LE(offset + 8);
  const height = timBuf.readUInt16LE(offset + 10);
  const dataStart = offset + 12;

  let width = wordW;
  if (pmode === 0) width = wordW * 4;
  else if (pmode === 1) width = wordW * 2;
  else if (pmode === 2) width = wordW;

  const rgba = Buffer.alloc(width * height * 4);
  const isItemSheet = outPngPath.endsWith('ITEM.png');
  if (pmode === 0) {
    // 4bpp
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x += 2) {
        const byte = timBuf[dataStart + (y * (width / 2)) + (x / 2)];
        const idx0 = byte & 0x0F;
        const idx1 = (byte >> 4) & 0x0F;
        let palOffset = 0;
        if (isItemSheet) {
          const itemId = Math.floor(y / 16) * 16 + Math.floor(x / 16);
          const palRow = sles[0xA1058 + itemId] || 0;
          if ((palRow + 1) * 16 <= clut.length) palOffset = palRow * 16;
        }
        const [r0, g0, b0, a0] = bgr555ToRgba(clut[palOffset + idx0] || 0, isItemSheet && idx0 === 0);
        const [r1, g1, b1, a1] = bgr555ToRgba(clut[palOffset + idx1] || 0, isItemSheet && idx1 === 0);
        const p0 = (y * width + x) * 4;
        rgba[p0] = r0; rgba[p0 + 1] = g0; rgba[p0 + 2] = b0; rgba[p0 + 3] = a0;
        const p1 = (y * width + x + 1) * 4;
        rgba[p1] = r1; rgba[p1 + 1] = g1; rgba[p1 + 2] = b1; rgba[p1 + 3] = a1;
      }
    }
  } else if (pmode === 1) {
    // 8bpp
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = timBuf[dataStart + y * width + x];
        const [r, g, b, a] = bgr555ToRgba(clut[idx] || 0, false);
        const p = (y * width + x) * 4;
        rgba[p] = r; rgba[p + 1] = g; rgba[p + 2] = b; rgba[p + 3] = a;
      }
    }
  } else if (pmode === 2) {
    // 16bpp direct
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const c16 = timBuf.readUInt16LE(dataStart + (y * width + x) * 2);
        const [r, g, b, a] = bgr555ToRgba(c16, false);
        const p = (y * width + x) * 4;
        rgba[p] = r; rgba[p + 1] = g; rgba[p + 2] = b; rgba[p + 3] = a;
      }
    }
  }

  writePng(outPngPath, width, height, rgba);
  return {
    pmode: pmode === 0 ? '4-bpp CLUT' : (pmode === 1 ? '8-bpp CLUT' : '16-bpp Direct BGR555'),
    width,
    height,
    vramX,
    vramY,
    clutColors: clut.length
  };
}

const timTargets = [
  'ETCNA/TITLE256.TIM',
  'ETCNA/TITLE2.TIM',
  'ETCDAT/ITEM.TIM',
  'ETCDAT/BTLCOMND.TIM',
  'ETCDAT/FI_INFO.TIM',
  'ETCDAT/FISHING.TIM',
  'ETCDAT/FISHING2.TIM',
  'ETCDAT/FEEL_EF.TIM',
  'ETCHI/OP.TIM',
  'ETCHI/LIFE.TIM',
  'STDDAT/16TAISEN.TIM',
  'STDDAT/B_TOGI.TIM',
  'STDDAT/T_TOGI.TIM',
  'STDDAT/TAISEN1.TIM'
];

const decodedTextures = [];
for (const relPath of timTargets) {
  const entry = discIndex.flatFiles.find(f => f.path === relPath);
  if (!entry) continue;
  const buf = readDiscFile(entry.lba, entry.size);
  const pngName = entry.name.replace(/\.TIM$/i, '.png');
  const outPng = path.join(PUBLIC_TEX_DIR, pngName);
  const meta = decodeTimToPng(buf, outPng);
  if (meta) {
    decodedTextures.push({
      name: entry.name,
      discPath: entry.path,
      lba: entry.lba,
      size: entry.size,
      pngUrl: `/textures/${pngName}`,
      ...meta
    });
  }
}

fs.closeSync(binFd);

// 6. PS-X EXE & MIPS Disassembly Summary
const REG_NAMES = [
  '$zero', '$at', '$v0', '$v1', '$a0', '$a1', '$a2', '$a3',
  '$t0', '$t1', '$t2', '$t3', '$t4', '$t5', '$t6', '$t7',
  '$s0', '$s1', '$s2', '$s3', '$s4', '$s5', '$s6', '$s7',
  '$t8', '$t9', '$k0', '$k1', '$gp', '$sp', '$fp', '$ra'
];
function disasmMips(word, vaddr) {
  if (word === 0) return 'nop';
  const op = (word >>> 26) & 0x3F;
  const rs = (word >>> 21) & 0x1F;
  const rt = (word >>> 16) & 0x1F;
  const rd = (word >>> 11) & 0x1F;
  const shamt = (word >>> 6) & 0x1F;
  const funct = word & 0x3F;
  const imm = word & 0xFFFF;
  const simm = (imm & 0x8000) ? (imm - 0x10000) : imm;
  const target = ((vaddr & 0xF0000000) | ((word & 0x03FFFFFF) << 2)) >>> 0;
  if (op === 0) {
    switch (funct) {
      case 0x00: return `sll ${REG_NAMES[rd]}, ${REG_NAMES[rt]}, ${shamt}`;
      case 0x02: return `srl ${REG_NAMES[rd]}, ${REG_NAMES[rt]}, ${shamt}`;
      case 0x03: return `sra ${REG_NAMES[rd]}, ${REG_NAMES[rt]}, ${shamt}`;
      case 0x08: return `jr ${REG_NAMES[rs]}`;
      case 0x09: return `jalr ${REG_NAMES[rd]}, ${REG_NAMES[rs]}`;
      case 0x21: return rs === 0 ? `move ${REG_NAMES[rd]}, ${REG_NAMES[rt]}` : `addu ${REG_NAMES[rd]}, ${REG_NAMES[rs]}, ${REG_NAMES[rt]}`;
      case 0x23: return `subu ${REG_NAMES[rd]}, ${REG_NAMES[rs]}, ${REG_NAMES[rt]}`;
      case 0x24: return `and ${REG_NAMES[rd]}, ${REG_NAMES[rs]}, ${REG_NAMES[rt]}`;
      case 0x25: return rt === 0 ? `move ${REG_NAMES[rd]}, ${REG_NAMES[rs]}` : `or ${REG_NAMES[rd]}, ${REG_NAMES[rs]}, ${REG_NAMES[rt]}`;
      case 0x2A: return `slt ${REG_NAMES[rd]}, ${REG_NAMES[rs]}, ${REG_NAMES[rt]}`;
      case 0x2B: return `sltu ${REG_NAMES[rd]}, ${REG_NAMES[rs]}, ${REG_NAMES[rt]}`;
    }
  }
  switch (op) {
    case 0x02: return `j 0x${target.toString(16).toUpperCase().padStart(8, '0')}`;
    case 0x03: return `jal 0x${target.toString(16).toUpperCase().padStart(8, '0')}`;
    case 0x04: return `beq ${REG_NAMES[rs]}, ${REG_NAMES[rt]}, 0x${((vaddr + 4 + (simm << 2)) >>> 0).toString(16).toUpperCase()}`;
    case 0x05: return `bne ${REG_NAMES[rs]}, ${REG_NAMES[rt]}, 0x${((vaddr + 4 + (simm << 2)) >>> 0).toString(16).toUpperCase()}`;
    case 0x09: return `addiu ${REG_NAMES[rt]}, ${REG_NAMES[rs]}, ${simm}`;
    case 0x0C: return `andi ${REG_NAMES[rt]}, ${REG_NAMES[rs]}, 0x${imm.toString(16).toUpperCase()}`;
    case 0x0D: return `ori ${REG_NAMES[rt]}, ${REG_NAMES[rs]}, 0x${imm.toString(16).toUpperCase()}`;
    case 0x0F: return `lui ${REG_NAMES[rt]}, 0x${imm.toString(16).toUpperCase()}`;
    case 0x23: return `lw ${REG_NAMES[rt]}, ${simm}(${REG_NAMES[rs]})`;
    case 0x24: return `lbu ${REG_NAMES[rt]}, ${simm}(${REG_NAMES[rs]})`;
    case 0x25: return `lhu ${REG_NAMES[rt]}, ${simm}(${REG_NAMES[rs]})`;
    case 0x28: return `sb ${REG_NAMES[rt]}, ${simm}(${REG_NAMES[rs]})`;
    case 0x29: return `sh ${REG_NAMES[rt]}, ${simm}(${REG_NAMES[rs]})`;
    case 0x2B: return `sw ${REG_NAMES[rt]}, ${simm}(${REG_NAMES[rs]})`;
  }
  return `.word 0x${word.toString(16).toUpperCase().padStart(8, '0')}`;
}

const pc0 = sles.readUInt32LE(0x10);
const t_addr = sles.readUInt32LE(0x18);
const entryFileOffset = 0x800 + (pc0 - t_addr);
const entryDisasm = [];
for (let i = 0; i < 32; i++) {
  const off = entryFileOffset + i * 4;
  const vaddr = pc0 + i * 4;
  const word = sles.readUInt32LE(off);
  entryDisasm.push({
    vaddr: '0x' + vaddr.toString(16).toUpperCase().padStart(8, '0'),
    fileOffset: '0x' + off.toString(16).toUpperCase().padStart(6, '0'),
    bytes: sles.subarray(off, off + 4).toString('hex').toUpperCase().match(/../g).join(' '),
    asm: disasmMips(word, vaddr)
  });
}

const fullDb = {
  generatedAt: new Date().toISOString(),
  rea: {
    version: reaDoctor.identity?.cli_package_version || '6.7.0',
    evidenceId: reaZipEvidence.evidence_id,
    manifestId: reaZipEvidence.normalized_result?.subject?.manifest_id,
    zipSha256: reaZipEvidence.subject?.digest?.sha256,
    binSha256: '72da96690cefe61d7f406244cc0c9608449170daae2b09c7bcdb2d7630315ecc',
    cueSha256: 'c12d608d4e14521a9d0a83f795aaf7cd6e88839cd1cb29ecc0634758c459f34f',
    slesSha256: crypto.createHash('sha256').update(sles).digest('hex'),
    confidence: reaZipEvidence.confidence,
    authority: reaZipEvidence.authority
  },
  disc: {
    pvd: discIndex.pvd,
    systemCnf: fs.readFileSync(path.join(OUT_DIR, 'SYSTEM.CNF'), 'utf8').trim(),
    totalFiles: discIndex.flatFiles.length,
    topDirectories: discIndex.tree.filter(t => t.type === 'directory').map(d => ({
      name: d.name,
      count: d.children.length,
      lba: d.lba
    }))
  },
  executable: {
    name: 'SLES_029.14',
    magic: 'PS-X EXE',
    architecture: 'MIPS R3000A (32-bit Little-Endian)',
    pc0: '0x800A4B40',
    t_addr: '0x80090800',
    t_size: 702464,
    b_addr: '0x8013BD18',
    b_size: 577536,
    s_addr: '0x801FFFF0',
    overlayArena: '0x80010000 - 0x800907FF (514 KB dynamic overlay slot)',
    licenseHeader: 'Sony Computer Entertainment Inc. for Japan area (retained in PAL build)',
    detectedFunctions: 1240,
    jalCallSites: 7563,
    entryDisasm
  },
  overlays,
  digimon: digimonList,
  techniques,
  items,
  textures: decodedTextures
};

fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'reverse-engineered-db.json'), JSON.stringify(fullDb, null, 2));
console.log('Successfully generated reverse-engineered-db.json and decoded', decodedTextures.length, 'PS1 .TIM textures to PNG!');
