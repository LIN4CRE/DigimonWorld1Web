import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const ROM_ZIP_PATH = process.env.DIGIMON_ROM_ZIP || 'D:\\games\\Digimon World (Europe).zip';
const BIN_PATH = path.join(ROOT_DIR, 'rom', 'Digimon World (Europe).bin');
const SLES_PATH = path.join(ROOT_DIR, 'extracted', 'SLES_029.14');
const DISC_INDEX_PATH = path.join(ROOT_DIR, 'extracted', 'disc-index.json');
const DB_PATH = path.join(PUBLIC_DIR, 'data', 'reverse-engineered-db.json');

const slesBuf = fs.existsSync(SLES_PATH) ? fs.readFileSync(SLES_PATH) : null;
const discIndex = fs.existsSync(DISC_INDEX_PATH)
  ? JSON.parse(fs.readFileSync(DISC_INDEX_PATH, 'utf8').replace(/^\uFEFF/, ''))
  : { pvd: {}, tree: [], flatFiles: [] };
const fallbackDb = fs.existsSync(DB_PATH)
  ? JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))
  : null;

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
      case 0x0C: return `syscall`;
      case 0x20: return `add ${REG_NAMES[rd]}, ${REG_NAMES[rs]}, ${REG_NAMES[rt]}`;
      case 0x21: return rs === 0 ? `move ${REG_NAMES[rd]}, ${REG_NAMES[rt]}` : `addu ${REG_NAMES[rd]}, ${REG_NAMES[rs]}, ${REG_NAMES[rt]}`;
      case 0x23: return `subu ${REG_NAMES[rd]}, ${REG_NAMES[rs]}, ${REG_NAMES[rt]}`;
      case 0x24: return `and ${REG_NAMES[rd]}, ${REG_NAMES[rs]}, ${REG_NAMES[rt]}`;
      case 0x25: return rt === 0 ? `move ${REG_NAMES[rd]}, ${REG_NAMES[rs]}` : `or ${REG_NAMES[rd]}, ${REG_NAMES[rs]}, ${REG_NAMES[rt]}`;
      case 0x26: return `xor ${REG_NAMES[rd]}, ${REG_NAMES[rs]}, ${REG_NAMES[rt]}`;
      case 0x2A: return `slt ${REG_NAMES[rd]}, ${REG_NAMES[rs]}, ${REG_NAMES[rt]}`;
      case 0x2B: return `sltu ${REG_NAMES[rd]}, ${REG_NAMES[rs]}, ${REG_NAMES[rt]}`;
    }
  }
  switch (op) {
    case 0x02: return `j 0x${target.toString(16).toUpperCase().padStart(8, '0')}`;
    case 0x03: return `jal 0x${target.toString(16).toUpperCase().padStart(8, '0')}`;
    case 0x04: return `beq ${REG_NAMES[rs]}, ${REG_NAMES[rt]}, 0x${((vaddr + 4 + (simm << 2)) >>> 0).toString(16).toUpperCase()}`;
    case 0x05: return `bne ${REG_NAMES[rs]}, ${REG_NAMES[rt]}, 0x${((vaddr + 4 + (simm << 2)) >>> 0).toString(16).toUpperCase()}`;
    case 0x08: return `addi ${REG_NAMES[rt]}, ${REG_NAMES[rs]}, ${simm}`;
    case 0x09: return `addiu ${REG_NAMES[rt]}, ${REG_NAMES[rs]}, ${simm}`;
    case 0x0A: return `slti ${REG_NAMES[rt]}, ${REG_NAMES[rs]}, ${simm}`;
    case 0x0B: return `sltiu ${REG_NAMES[rt]}, ${REG_NAMES[rs]}, ${simm}`;
    case 0x0C: return `andi ${REG_NAMES[rt]}, ${REG_NAMES[rs]}, 0x${imm.toString(16).toUpperCase()}`;
    case 0x0D: return `ori ${REG_NAMES[rt]}, ${REG_NAMES[rs]}, 0x${imm.toString(16).toUpperCase()}`;
    case 0x0F: return `lui ${REG_NAMES[rt]}, 0x${imm.toString(16).toUpperCase()}`;
    case 0x20: return `lb ${REG_NAMES[rt]}, ${simm}(${REG_NAMES[rs]})`;
    case 0x21: return `lh ${REG_NAMES[rt]}, ${simm}(${REG_NAMES[rs]})`;
    case 0x23: return `lw ${REG_NAMES[rt]}, ${simm}(${REG_NAMES[rs]})`;
    case 0x24: return `lbu ${REG_NAMES[rt]}, ${simm}(${REG_NAMES[rs]})`;
    case 0x25: return `lhu ${REG_NAMES[rt]}, ${simm}(${REG_NAMES[rs]})`;
    case 0x28: return `sb ${REG_NAMES[rt]}, ${simm}(${REG_NAMES[rs]})`;
    case 0x29: return `sh ${REG_NAMES[rt]}, ${simm}(${REG_NAMES[rs]})`;
    case 0x2B: return `sw ${REG_NAMES[rt]}, ${simm}(${REG_NAMES[rs]})`;
  }
  return `.word 0x${word.toString(16).toUpperCase().padStart(8, '0')}`;
}

function serveFileWithRange(req, res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'File not found' }));
    return;
  }
  const stat = fs.statSync(filePath);
  const range = req.headers.range;
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunkSize = (end - start) + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Content-Length': chunkSize,
      'Content-Type': contentType
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': contentType
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.zip': 'application/zip',
  '.bin': 'application/octet-stream',
  '.cue': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    // 1. Stream ROM files for EmulatorJS
    if (pathname === '/rom/Digimon World (Europe).zip') {
      const localZip = path.join(ROOT_DIR, 'rom', 'Digimon World (Europe).zip');
      return serveFileWithRange(req, res, fs.existsSync(localZip) ? localZip : ROM_ZIP_PATH, 'application/zip');
    }
    if (pathname === '/rom/Digimon World (Europe).bin') {
      return serveFileWithRange(req, res, BIN_PATH, 'application/octet-stream');
    }
    if (pathname === '/rom/Digimon World (Europe).cue') {
      return serveFileWithRange(req, res, path.join(ROOT_DIR, 'rom', 'Digimon World (Europe).cue'), 'text/plain; charset=utf-8');
    }

    // 2. API: Disc file index
    if (pathname === '/api/disc-files') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(discIndex));
    }

    // 3. API: Read raw hex slice from any file on the PS1 disc by LBA
    if (pathname === '/api/disc-hex') {
      const lba = parseInt(parsedUrl.searchParams.get('lba') || '23', 10);
      const size = parseInt(parsedUrl.searchParams.get('size') || '256', 10);
      const byteOffset = parseInt(parsedUrl.searchParams.get('offset') || '0', 10);
      if (!fs.existsSync(BIN_PATH)) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          lba,
          byteOffset,
          length: 0,
          rows: [{ offset: '0x000000', hex: 'Place Digimon World (Europe).bin in ./rom/', ascii: 'ROM_NOT_MOUNTED' }]
        }));
      }
      const maxLen = Math.min(Math.max(16, size - byteOffset), 512);
      const startSector = lba + Math.floor(byteOffset / 2048);
      const sectorInOffset = byteOffset % 2048;

      const fd = fs.openSync(BIN_PATH, 'r');
      const out = Buffer.alloc(4096);
      fs.readSync(fd, out, 0, 2048, startSector * 2352 + 24);
      fs.readSync(fd, out, 2048, 2048, (startSector + 1) * 2352 + 24);
      fs.closeSync(fd);

      const slice = out.subarray(sectorInOffset, sectorInOffset + maxLen);
      const rows = [];
      for (let i = 0; i < slice.length; i += 16) {
        const chunk = slice.subarray(i, i + 16);
        const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        const ascii = Array.from(chunk).map(b => (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b) : '.').join('');
        rows.push({
          offset: '0x' + (byteOffset + i).toString(16).toUpperCase().padStart(6, '0'),
          hex,
          ascii
        });
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ lba, byteOffset, length: slice.length, rows }));
    }

    // 4. API: Live MIPS R3000A Disassembler on SLES_029.14
    if (pathname === '/api/mips-disasm') {
      if (!slesBuf) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          startVaddr: '0x800A4B40',
          instructions: fallbackDb?.executable?.entryDisasm || []
        }));
      }
      const vaddrStr = (parsedUrl.searchParams.get('vaddr') || '0x800A4B40').replace(/^0x/i, '');
      let vaddr = parseInt(vaddrStr, 16) >>> 0;
      if (isNaN(vaddr) || vaddr < 0x80090800 || vaddr >= 0x80090800 + slesBuf.length - 0x800) {
        vaddr = 0x800A4B40;
      }
      vaddr = (vaddr & ~3) >>> 0;
      const count = Math.min(128, Math.max(8, parseInt(parsedUrl.searchParams.get('count') || '40', 10)));
      const startOff = 0x800 + (vaddr - 0x80090800);

      const instructions = [];
      for (let i = 0; i < count; i++) {
        const off = startOff + i * 4;
        if (off + 4 > slesBuf.length) break;
        const curVaddr = (vaddr + i * 4) >>> 0;
        const word = slesBuf.readUInt32LE(off);
        instructions.push({
          vaddr: '0x' + curVaddr.toString(16).toUpperCase().padStart(8, '0'),
          fileOffset: '0x' + off.toString(16).toUpperCase().padStart(6, '0'),
          bytes: slesBuf.subarray(off, off + 4).toString('hex').toUpperCase().match(/../g).join(' '),
          asm: disasmMips(word, curVaddr)
        });
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ startVaddr: '0x' + vaddr.toString(16).toUpperCase(), instructions }));
    }

    // 5. Static files from public/
    let relPath = pathname === '/' ? '/index.html' : pathname;
    const safePath = path.normalize(path.join(PUBLIC_DIR, relPath));
    if (!safePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    const ext = path.extname(safePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    return serveFileWithRange(req, res, safePath, mime);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

const PORT = process.env.PORT || 3456;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Digimon World (Europe) Reverse-Engineered WebUI running at http://127.0.0.1:${PORT}`);
});
