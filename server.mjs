import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const ROM_ZIP_PATH = process.env.DIGIMON_ROM_ZIP || path.join(ROOT_DIR, 'rom', 'Digimon World (Europe).zip');
const BIN_PATH = path.join(ROOT_DIR, 'rom', 'Digimon World (Europe).bin');
const SLES_PATH = path.join(ROOT_DIR, 'extracted', 'SLES_029.14');
const DISC_INDEX_PATH = path.join(ROOT_DIR, 'extracted', 'disc-index.json');
const DB_PATH = path.join(PUBLIC_DIR, 'data', 'reverse-engineered-db.json');
const PORT = process.env.PORT || 3456;

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
  '.cue': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.license': 'text/plain; charset=utf-8'
};

// Parse a single-range RFC 7233 "bytes=" header.
// Returns { start, end } for a satisfiable range, false for an unsatisfiable
// range (416), or null for a malformed/multi-range header (ignore -> full 200).
function parseRange(header, size) {
  if (typeof header !== 'string') return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const startStr = match[1];
  const endStr = match[2];
  if (startStr === '' && endStr === '') return null;
  if (size <= 0) return false;
  let start;
  let end;
  if (startStr === '') {
    const suffix = parseInt(endStr, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return false;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = parseInt(startStr, 10);
    end = endStr === '' ? size - 1 : parseInt(endStr, 10);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    if (end >= size) end = size - 1;
  }
  if (start < 0 || start >= size || start > end) return false;
  return { start, end };
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function serveFileWithRange(req, res, filePath, contentType) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    return sendJson(res, 404, { error: 'File not found' });
  }
  // Only regular files may be streamed. Directories previously produced an
  // unhandled EISDIR 'error' event that crashed the entire process.
  if (!stat.isFile()) {
    return sendJson(res, 404, { error: 'File not found' });
  }

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'HEAD') {
    res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': contentType });
    return res.end();
  }

  const rangeHeader = req.headers.range;
  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  if (rangeHeader) {
    const parsed = parseRange(rangeHeader, stat.size);
    if (parsed === false) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    if (parsed) {
      start = parsed.start;
      end = parsed.end;
      status = 206;
    }
  }

  const headers = {
    'Content-Length': end - start + 1,
    'Content-Type': contentType
  };
  if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
  res.writeHead(status, headers);

  const stream = fs.createReadStream(filePath, { start, end });
  stream.on('error', (err) => {
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Read failed' });
    } else {
      res.destroy(err);
    }
  });
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

function requestHandler(req, res) {
  setSecurityHeaders(res);
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname;
    try {
      pathname = decodeURIComponent(parsedUrl.pathname);
    } catch (err) {
      return sendJson(res, 400, { error: 'Malformed URL encoding' });
    }

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
      return sendJson(res, 200, discIndex);
    }

    // 3. API: Read raw hex slice from any file on the PS1 disc by LBA
    if (pathname === '/api/disc-hex') {
      const lba = parseInt(parsedUrl.searchParams.get('lba') || '23', 10);
      const size = parseInt(parsedUrl.searchParams.get('size') || '256', 10);
      const byteOffset = parseInt(parsedUrl.searchParams.get('offset') || '0', 10);
      if (!Number.isFinite(lba) || lba < 0 || !Number.isFinite(byteOffset) || byteOffset < 0) {
        return sendJson(res, 400, { error: 'Invalid lba/offset' });
      }
      if (!fs.existsSync(BIN_PATH)) {
        return sendJson(res, 200, {
          lba,
          byteOffset,
          length: 0,
          rows: [{ offset: '0x000000', hex: 'Place Digimon World (Europe).bin in ./rom/', ascii: 'ROM_NOT_MOUNTED' }]
        });
      }
      const maxLen = Math.min(Math.max(16, (Number.isFinite(size) ? size : 256) - byteOffset), 512);
      const startSector = lba + Math.floor(byteOffset / 2048);
      const sectorInOffset = byteOffset % 2048;

      const fd = fs.openSync(BIN_PATH, 'r');
      try {
        const out = Buffer.alloc(4096);
        fs.readSync(fd, out, 0, 2048, startSector * 2352 + 24);
        fs.readSync(fd, out, 2048, 2048, (startSector + 1) * 2352 + 24);

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
        return sendJson(res, 200, { lba, byteOffset, length: slice.length, rows });
      } finally {
        fs.closeSync(fd);
      }
    }

    // 4. API: Live MIPS R3000A Disassembler on SLES_029.14
    if (pathname === '/api/mips-disasm') {
      if (!slesBuf) {
        return sendJson(res, 200, {
          startVaddr: '0x800A4B40',
          instructions: fallbackDb?.executable?.entryDisasm || []
        });
      }
      const vaddrStr = (parsedUrl.searchParams.get('vaddr') || '0x800A4B40').replace(/^0x/i, '');
      let vaddr = parseInt(vaddrStr, 16) >>> 0;
      if (isNaN(vaddr) || vaddr < 0x80090800 || vaddr >= 0x80090800 + slesBuf.length - 0x800) {
        vaddr = 0x800A4B40;
      }
      vaddr = (vaddr & ~3) >>> 0;
      const count = Math.min(128, Math.max(8, parseInt(parsedUrl.searchParams.get('count') || '40', 10) || 40));
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
      return sendJson(res, 200, { startVaddr: '0x' + vaddr.toString(16).toUpperCase(), instructions });
    }

    // 5. Static files from public/ (separator-aware traversal guard)
    const relPath = pathname === '/' ? '/index.html' : pathname;
    const safePath = path.normalize(path.join(PUBLIC_DIR, relPath));
    if (safePath !== PUBLIC_DIR && !safePath.startsWith(PUBLIC_DIR + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Forbidden');
    }
    if (pathname === '/sw.js') res.setHeader('Service-Worker-Allowed', '/');
    const ext = path.extname(safePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    return serveFileWithRange(req, res, safePath, mime);
  } catch (err) {
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Internal server error' });
    } else {
      res.destroy(err);
    }
  }
}

export function createAppServer() {
  const server = http.createServer(requestHandler);
  // A malformed request line must never take the process down.
  server.on('clientError', (err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });
  return server;
}

export { parseRange, disasmMips, MIME_TYPES, PUBLIC_DIR, ROOT_DIR };

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const server = createAppServer();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Digimon World (Europe) Reverse-Engineered WebUI running at http://localhost:${PORT}`);
  });
  const shutdown = (signal) => {
    console.log(`\n${signal} received — closing server gracefully.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
