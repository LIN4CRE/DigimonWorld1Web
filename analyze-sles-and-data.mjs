import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const BIN_PATH = 'C:\\Users\\David\\.gemini\\antigravity\\scratch\\digimon-world-webui\\rom\\Digimon World (Europe).bin';
const OUT_DIR = 'C:\\Users\\David\\.gemini\\antigravity\\scratch\\digimon-world-webui\\extracted';
const slesBuf = fs.readFileSync(path.join(OUT_DIR, 'SLES_029.14'));

// 1. Parse PS-X EXE Header (0x800 bytes)
const magic = slesBuf.toString('ascii', 0, 8);
const pc0 = slesBuf.readUInt32LE(0x10);
const gp0 = slesBuf.readUInt32LE(0x14);
const t_addr = slesBuf.readUInt32LE(0x18);
const t_size = slesBuf.readUInt32LE(0x1C);
const d_addr = slesBuf.readUInt32LE(0x20);
const d_size = slesBuf.readUInt32LE(0x24);
const b_addr = slesBuf.readUInt32LE(0x28);
const b_size = slesBuf.readUInt32LE(0x2C);
const s_addr = slesBuf.readUInt32LE(0x30);
const s_size = slesBuf.readUInt32LE(0x34);
const licenseStr = slesBuf.toString('ascii', 0x4C, 0x4C + 64).replace(/\0.*$/s, '').trim();

const psxExeHeader = {
  magic,
  pc0: '0x' + pc0.toString(16).toUpperCase().padStart(8, '0'),
  gp0: '0x' + gp0.toString(16).toUpperCase().padStart(8, '0'),
  t_addr: '0x' + t_addr.toString(16).toUpperCase().padStart(8, '0'),
  t_size,
  t_size_hex: '0x' + t_size.toString(16).toUpperCase(),
  b_addr: '0x' + b_addr.toString(16).toUpperCase().padStart(8, '0'),
  b_size,
  s_addr: '0x' + s_addr.toString(16).toUpperCase().padStart(8, '0'),
  s_size,
  license: licenseStr,
  sha256: crypto.createHash('sha256').update(slesBuf).digest('hex'),
  fileSize: slesBuf.length
};

console.log('PS-X EXE Header:', psxExeHeader);

// 2. Mini MIPS R3000A Disassembler for entrypoint and key functions
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
      case 0x0D: return `break`;
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

const entryFileOffset = 0x800 + (pc0 - t_addr);
const entryDisasm = [];
for (let i = 0; i < 36; i++) {
  const off = entryFileOffset + i * 4;
  const vaddr = pc0 + i * 4;
  const word = slesBuf.readUInt32LE(off);
  entryDisasm.push({
    vaddr: '0x' + vaddr.toString(16).toUpperCase().padStart(8, '0'),
    fileOffset: '0x' + off.toString(16).toUpperCase().padStart(6, '0'),
    bytes: slesBuf.subarray(off, off + 4).toString('hex').toUpperCase().match(/../g).join(' '),
    asm: disasmMips(word, vaddr)
  });
}

// 3. Scan for MIPS function prologues (addiu $sp, $sp, -N where N > 0 and 4-byte aligned)
let functionCount = 0;
let jalCount = 0;
const topFunctions = [];
for (let off = 0x800; off < slesBuf.length - 4; off += 4) {
  const word = slesBuf.readUInt32LE(off);
  const op = (word >>> 26) & 0x3F;
  if (op === 0x03) jalCount++;
  // addiu $sp, $sp, -imm => 0x27BDxxxx where xxxx is negative (>= 0x8000)
  if ((word >>> 16) === 0x27BD) {
    const imm = word & 0xFFFF;
    if (imm >= 0x8000 && (imm & 3) === 0) {
      const frameSize = 0x10000 - imm;
      if (frameSize <= 4096) {
        functionCount++;
        if (topFunctions.length < 40) {
          const vaddr = t_addr + (off - 0x800);
          topFunctions.push({
            vaddr: '0x' + vaddr.toString(16).toUpperCase().padStart(8, '0'),
            fileOffset: '0x' + off.toString(16).toUpperCase().padStart(6, '0'),
            frameSize
          });
        }
      }
    }
  }
}

// 4. Extract printable strings from SLES_029.14
function extractStrings(buf, minLen = 4) {
  const results = [];
  let start = -1;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b >= 0x20 && b <= 0x7E) {
      if (start === -1) start = i;
    } else {
      if (start !== -1 && (i - start) >= minLen) {
        const str = buf.toString('ascii', start, i).trim();
        if (str.length >= minLen) {
          results.push({ offset: start, str });
        }
      }
      start = -1;
    }
  }
  return results;
}

const allStrings = extractStrings(slesBuf, 4);
console.log('MIPS Functions detected in SLES_029.14:', functionCount, 'JAL calls:', jalCount, 'Total strings:', allStrings.length);

// Print interesting strings from SLES_029.14
const interesting = allStrings.filter(s =>
  /mon|LIB|REL\.BIN|MAP|CARD|SOUND|CDROM|PS-X|Sony|Digimon|File|Meat|Chip|Floppy|Bit/i.test(s.str)
);
console.log('Sample interesting strings:', interesting.slice(0, 60).map(s => `[0x${s.offset.toString(16)}] ${s.str}`));
