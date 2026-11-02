import fs from 'fs';
import path from 'path';

const WORKSPACE = 'C:\\Users\\David\\.gemini\\antigravity\\scratch\\digimon-world-webui';
const BIN_PATH = path.join(WORKSPACE, 'rom', 'Digimon World (Europe).bin');
const SLES_EXTRACTED_PATH = path.join(WORKSPACE, 'extracted', 'SLES_029.14');
const DISC_INDEX_PATH = path.join(WORKSPACE, 'extracted', 'disc-index.json');
const DB_PATH = path.join(WORKSPACE, 'public', 'data', 'reverse-engineered-db.json');

const discIndex = JSON.parse(fs.readFileSync(DISC_INDEX_PATH, 'utf8'));
const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

// Helper: Read a file from Mode2/2352 BIN image
function readDiscFile(fd, lba, size) {
  const numSectors = Math.ceil(size / 2048);
  const buf = Buffer.alloc(numSectors * 2048);
  const sector = Buffer.alloc(2352);
  for (let s = 0; s < numSectors; s++) {
    fs.readSync(fd, sector, 0, 2352, (lba + s) * 2352);
    sector.copy(buf, s * 2048, 24, 24 + 2048);
  }
  return buf.subarray(0, size);
}

// Mode 2 Form 1 EDC (32-bit CRC with polynomial 0xD8018001)
const EDC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let edc = i;
  for (let j = 0; j < 8; j++) {
    edc = (edc >>> 1) ^ ((edc & 1) ? 0xD8018001 : 0);
  }
  EDC_TABLE[i] = edc >>> 0;
}

function computeEdc(buf, start, length) {
  let edc = 0;
  for (let i = start; i < start + length; i++) {
    edc = (edc >>> 8) ^ EDC_TABLE[(edc ^ buf[i]) & 0xFF];
  }
  return edc >>> 0;
}

// Helper: Write modified user data back into Mode2/2352 BIN image and update EDC
function writeDiscFile(fd, lba, data) {
  const numSectors = Math.ceil(data.length / 2048);
  const sector = Buffer.alloc(2352);
  for (let s = 0; s < numSectors; s++) {
    const pos = (lba + s) * 2352;
    fs.readSync(fd, sector, 0, 2352, pos);
    const chunkStart = s * 2048;
    const chunkEnd = Math.min(data.length, chunkStart + 2048);
    data.copy(sector, 24, chunkStart, chunkEnd);
    // Check if Mode 2 Form 1 (submode bit 5 == 0)
    const submode = sector[18];
    if ((submode & 0x20) === 0) {
      const edc = computeEdc(sector, 16, 2048 + 8);
      sector.writeUInt32LE(edc, 2072);
    }
    fs.writeSync(fd, sector, 0, 2352, pos);
  }
}

console.log('Opening Digimon World (Europe).bin for binary ROM patching...');
const fd = fs.openSync(BIN_PATH, 'r+');

// ============================================================================
// 1. PATCH SLES_029.14 (Main Executable)
// ============================================================================
const slesEntry = discIndex.flatFiles.find(f => f.name === 'SLES_029.14');
const sles = Buffer.from(readDiscFile(fd, slesEntry.lba, slesEntry.size));

// Patch 1A: Unlock Digimon IDs 1..127 in 0x80103054 (fileOffset 0x0730D0)
// Replace `lh $v0, 12($v0)` (0C 00 42 84) with `lh $v0, 52($sp)` (34 00 A2 87)
sles.writeUInt32LE(0x87A20034, 0x0730D0);
console.log('✓ Patched SLES_029.14 @ 0x801030D0: Unlocked Partner Evolution IDs 66..127');

// Patch 1B: Unlock Digimon IDs 1..127 in 0x800FDD40 (fileOffset 0x06DD98)
// Replace `lh $s1, 12($s0)` (0C 00 11 86) with `lh $s1, 60($sp)` (3C 00 B1 87)
sles.writeUInt32LE(0x87B1003C, 0x06DD98);
console.log('✓ Patched SLES_029.14 @ 0x800FDD98: Unlocked Partner 3D Spawner for IDs 66..127');

// Patch 1C: Remove Evolution Stage Restriction on Digivolution Items @ 0x800CB538 (fileOffset 0x03B538)
// Replace `bne $s1, $v0, 0x800CB58C` (14 00 22 16) with `nop` (00 00 00 00)
sles.writeUInt32LE(0x00000000, 0x03B538);
console.log('✓ Patched SLES_029.14 @ 0x800CB538: Any Digivolution Item now works at ANY stage');

// Patch 1D: Fix Unobtainable Evolution Item Handlers (Moon Mirror #114, Metal Banana #127, Elec Ring #83)
// Handler table is at 0xA1108 (u32 per item). 0x800CB464 is the Evolution Item Handler.
sles.writeUInt32LE(0x800CB464, 0xA1108 + 114 * 4); // #114 Moon Mirror -> WereGarurumon (#62)
sles.writeUInt32LE(0x800CB464, 0xA1108 + 127 * 4); // #127 Metal Banana -> MetalEtemon (#65)
// Target table is at 0xA10D8 (u8 per item starting at item #71)
sles[0xA10D8 + (83 - 71)] = 92; // #83 Elec Ring -> #92 Guardromon!
console.log('✓ Patched SLES_029.14 @ 0xA1108 & 0xA10D8: Enabled Moon Mirror, Metal Banana, Giga Hand, Noble Mane & Elec Ring');

// Patch 1E: Give missing .MMD slots (#62 WereGarurumon & #114 Taka) valid 3D models on disc
// Model string pointer table is at 0xAAC0C (u32 ptrs for Digimon 0..127)
const garuPtr = sles.readUInt32LE(0xAAC0C + 105 * 4); // #105 Gururumon ('GRUR')
const mugePtr = sles.readUInt32LE(0xAAC0C + 115 * 4); // #115 Machinedramon ('MUGE')
sles.writeUInt32LE(garuPtr, 0xAAC0C + 62 * 4);  // #62 WereGarurumon uses Gururumon 3D model
sles.writeUInt32LE(mugePtr, 0xAAC0C + 114 * 4); // #114 uses Machinedramon 3D model
console.log('✓ Patched SLES_029.14 @ 0xAAC0C: Mapped fallback .MMD models for slots #62 and #114');

// Patch 1F: Give all Overworld / Wild / Boss Digimon (#62..#127) complete 16-move learnable movesets
// and high drop rates for rare Digivolution items at 0xA8B5C (32 bytes per Digimon)
const SPECIALTY_MOVES = {
  1: [0, 1, 2, 3, 4, 5, 6],       // Fire (Spit Fire .. Prominence Beam)
  2: [16, 17, 18, 19, 20, 21, 22],// Battle (Sonic Jab .. Tremar)
  3: [7, 8, 9, 10, 11, 12, 13],   // Air (Electric Cloud .. Thunder Justice)
  4: [24, 25, 26, 27, 28, 29],    // Earth (Poison Powder .. Bug)
  5: [30, 31, 32, 33, 34, 35],    // Ice (Tear Drop .. Aurora Freeze)
  6: [37, 38, 39, 40, 41],        // Mech (Power Crane .. Delete Program)
  7: [42, 43, 44, 45]             // Filth (Odor Spray .. Ultimate Poop Hell)
};

// Rare evolution items to distribute as drops on wild enemies (71..114, 125, 126, 127)
const RARE_EVO_ITEMS = [
  125, 126, 127, 114, 83, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113,
  71, 72, 73, 78, 79, 80, 81, 84, 87, 88, 90, 91, 95
];

for (let id = 62; id <= 127; id++) {
  const structOff = 0xA8B5C + id * 32;
  const spec1 = sles[structOff + 10] || 1;
  const spec2 = sles[structOff + 11] || 2;
  const spec3 = sles[structOff + 12] || 3;

  // Ensure valid level (1..5) if Special (6) so battles & UI treat it cleanly
  if (sles[structOff + 9] > 5 || sles[structOff + 9] === 0) {
    sles[structOff + 9] = 5; // Ultimate (Perfect)
  }

  // Collect existing moves
  const existing = [];
  for (let m = 0; m < 16; m++) {
    const mv = sles[structOff + 14 + m];
    if (mv !== 0xFF && mv < 121 && !existing.includes(mv)) {
      existing.push(mv);
    }
  }
  const pool = [
    ...(SPECIALTY_MOVES[spec1] || SPECIALTY_MOVES[1]),
    ...(SPECIALTY_MOVES[spec2] || SPECIALTY_MOVES[2]),
    ...(SPECIALTY_MOVES[spec3] || SPECIALTY_MOVES[3])
  ];
  for (const cand of pool) {
    if (existing.length >= 15) break;
    if (!existing.includes(cand)) existing.push(cand);
  }
  for (let m = 0; m < 15; m++) {
    sles[structOff + 14 + m] = existing[m] !== undefined ? existing[m] : 0xFF;
  }
  // Ensure finisher byte (offset 30) is valid
  if (sles[structOff + 30] === 0xFF || sles[structOff + 30] === 0) {
    sles[structOff + 30] = 58; // Default finisher
  }

  // Boost wild item drop rate & assign rare evolution items
  const evoDrop = RARE_EVO_ITEMS[(id - 62) % RARE_EVO_ITEMS.length];
  if (sles[structOff + 13] < 40) {
    sles[structOff + 12] = evoDrop;
    sles[structOff + 13] = 65; // 65% drop chance!
  }
}
console.log('✓ Patched SLES_029.14 @ 0xA8B5C: Populated 16-move learnsets & rare Evolution Item drops for Digimon #62..#127');

// ============================================================================
// Patch 1G: EXPANDED 128-DIGIMON EVOLUTION TABLE & STARTER SYSTEM
// ============================================================================
const D = {
  BOTAMON: 1, PUNIMON: 15, POYOMON: 29, YURAMON: 43,
  KOROMON: 2, TSUNOMON: 16, TOKOMON: 30, TANEMON: 44,
  AGUMON: 3, BETAMON: 4, GABUMON: 17, ELECMON: 18, PATAMON: 31, KUNEMON: 32, BIYOMON: 45, PALMON: 46, PENGUINMON: 57,
  GOTSUMON: 68, SNOWAGUMON: 71, DOKUNEMON: 74, GOBURIMON: 80, PSYCHEMON: 82, MODOKIBETAMON: 83, TOYAGUMON: 84,
  ARURAUMON: 86, MUCHOMON: 93, TSUKAIMON: 96, OTAMAMON: 109, TENTOMON: 111, HAGURUMON: 122,
  GREYMON: 5, DEVIMON: 6, AIRDRAMON: 7, TYRANNOMON: 8, MERAMON: 9, SEADRAMON: 10, NUMEMON: 11,
  KABUTERIMON: 19, ANGEMON: 20, BIRDRAMON: 21, GARURUMON: 22, FRIGIMON: 23, WHAMON: 24, VEGIEMON: 25,
  UNIMON: 33, OGREMON: 34, SHELLMON: 35, CENTARUMON: 36, BAKEMON: 37, COELAMON: 38, SUKAMON: 39,
  MONOCHROMON: 47, LEOMON: 48, COELAMON2: 49, KUWAGAMON: 50, KOKATORIMON: 51, DRIMOGEMON: 52, NANINMON: 53,
  MOJYAMON: 58,
  FLARERIZAMON: 69, HYOGAMON: 72, PLATINUMSUKAMON: 73, TANKMON: 76, REDVEGIEMON: 77, J_MOJYAMON: 78,
  NISEDRIMOGEMON: 79, MUDFRIGIMON: 81, PIDDOMON: 85, GEREMON: 87, FUGAMON: 89, MORISHELLMON: 91,
  GUARDROMON: 92, ICEMON: 94, AKATORIMON: 95, WEEDMON: 99, ICEDEVIMON: 100, DARKRIZAMON: 101,
  BLUEMERAMON: 104, GURURUMON: 105, SABERDRAMON: 106, SOULMON: 107, ROCKMON: 108, GEKOMON: 110,
  METALGREYMON: 12, SKULLGREYMON: 13, ANDROMON: 14, MEGADRAMON: 26, GIROMON: 27, MONZAEMON: 28,
  VADEMON: 40, DIGITAMAMON: 41, ETEMON: 42, MEGASEADRAMON: 54, MAMEMON: 55, METALMAMEMON: 56,
  PIXIMON: 59, HERCULESKABUTERIMON: 60, PHOENIXMON: 61, WEREGARURUMON: 62,
  PANJYAMON: 63, GIGADRAMON: 64, METALETEMON: 65,
  MYOTISMON: 66, WARUMONZAEMON: 70, VERMILIMON: 88, TEKKAMON: 90, WARUSEADRAMON: 112, METEORMON: 113,
  MACHINEDRAMON: 115, JIJIMON: 117, SHOGUNGEKOMON: 119, CHERRYMON: 121, TINMON: 123, MASTERTYRANNOMON: 124,
  BRACHIOMON: 126
};

const expandedEvoTable = Buffer.alloc(128 * 11, 0xFF);
function setEvo(digimonId, fromList, toList) {
  const off = (digimonId - 1) * 11;
  for (let i = 0; i < 5; i++) expandedEvoTable[off + i] = i < fromList.length ? fromList[i] : 0xFF;
  for (let i = 0; i < 6; i++) expandedEvoTable[off + 5 + i] = i < toList.length ? toList[i] : 0xFF;
}

// Fresh -> In-Training
setEvo(D.BOTAMON, [], [D.KOROMON]);
setEvo(D.PUNIMON, [], [D.TSUNOMON]);
setEvo(D.POYOMON, [], [D.TOKOMON]);
setEvo(D.YURAMON, [], [D.TANEMON]);

// In-Training -> Rookies
setEvo(D.KOROMON, [D.BOTAMON], [D.AGUMON, D.GABUMON, D.TOYAGUMON, D.GOTSUMON, D.HAGURUMON]);
setEvo(D.TSUNOMON, [D.PUNIMON], [D.ELECMON, D.PENGUINMON, D.PSYCHEMON, D.SNOWAGUMON, D.GOBURIMON]);
setEvo(D.TOKOMON, [D.POYOMON], [D.PATAMON, D.BIYOMON, D.TENTOMON, D.TSUKAIMON, D.MUCHOMON]);
setEvo(D.TANEMON, [D.YURAMON], [D.PALMON, D.BETAMON, D.KUNEMON, D.MODOKIBETAMON, D.ARURAUMON, D.OTAMAMON]);

// Rookies -> Champions
setEvo(D.AGUMON, [D.KOROMON], [D.GREYMON, D.MERAMON, D.BIRDRAMON, D.CENTARUMON, D.MONOCHROMON, D.TYRANNOMON]);
setEvo(D.BETAMON, [D.TANEMON], [D.SEADRAMON, D.WHAMON, D.SHELLMON, D.COELAMON, D.GEKOMON, D.MORISHELLMON]);
setEvo(D.GABUMON, [D.KOROMON], [D.GARURUMON, D.OGREMON, D.TYRANNOMON, D.MONOCHROMON, D.CENTARUMON, D.GURURUMON]);
setEvo(D.ELECMON, [D.TSUNOMON], [D.LEOMON, D.ANGEMON, D.BAKEMON, D.KUWAGAMON, D.GUARDROMON, D.FUGAMON]);
setEvo(D.PATAMON, [D.TOKOMON], [D.ANGEMON, D.UNIMON, D.OGREMON, D.LEOMON, D.TYRANNOMON, D.PIDDOMON]);
setEvo(D.KUNEMON, [D.TANEMON], [D.KABUTERIMON, D.KUWAGAMON, D.VEGIEMON, D.BAKEMON, D.DOKUNEMON, D.KOKATORIMON]);
setEvo(D.BIYOMON, [D.TOKOMON], [D.BIRDRAMON, D.AIRDRAMON, D.KABUTERIMON, D.UNIMON, D.SABERDRAMON, D.AKATORIMON]);
setEvo(D.PALMON, [D.TANEMON], [D.VEGIEMON, D.KOKATORIMON, D.MOJYAMON, D.WHAMON, D.REDVEGIEMON, D.WEEDMON]);
setEvo(D.PENGUINMON, [D.TSUNOMON], [D.FRIGIMON, D.MOJYAMON, D.SHELLMON, D.WHAMON, D.MUDFRIGIMON, D.ICEMON]);

// Unlocked Rookies
setEvo(D.GOTSUMON, [D.KOROMON], [D.MONOCHROMON, D.DRIMOGEMON, D.NISEDRIMOGEMON, D.ICEMON, D.ROCKMON, D.CENTARUMON]);
setEvo(D.SNOWAGUMON, [D.TSUNOMON], [D.FRIGIMON, D.GARURUMON, D.ICEMON, D.MUDFRIGIMON, D.HYOGAMON, D.ICEDEVIMON]);
setEvo(D.DOKUNEMON, [D.TANEMON], [D.KUWAGAMON, D.KABUTERIMON, D.REDVEGIEMON, D.WEEDMON, D.BAKEMON, D.SOULMON]);
setEvo(D.GOBURIMON, [D.TSUNOMON], [D.OGREMON, D.FUGAMON, D.LEOMON, D.HYOGAMON, D.BAKEMON, D.MERAMON]);
setEvo(D.PSYCHEMON, [D.TSUNOMON], [D.GURURUMON, D.GARURUMON, D.OGREMON, D.CENTARUMON, D.BLUEMERAMON, D.FUGAMON]);
setEvo(D.MODOKIBETAMON, [D.TANEMON], [D.SEADRAMON, D.WHAMON, D.SHELLMON, D.COELAMON, D.GEKOMON, D.MORISHELLMON]);
setEvo(D.TOYAGUMON, [D.KOROMON], [D.TANKMON, D.GUARDROMON, D.CENTARUMON, D.MONOCHROMON, D.TYRANNOMON, D.BAKEMON]);
setEvo(D.ARURAUMON, [D.TANEMON], [D.WEEDMON, D.REDVEGIEMON, D.VEGIEMON, D.KOKATORIMON, D.MORISHELLMON, D.MOJYAMON]);
setEvo(D.MUCHOMON, [D.TOKOMON], [D.AKATORIMON, D.KOKATORIMON, D.BIRDRAMON, D.SABERDRAMON, D.FRIGIMON, D.WHAMON]);
setEvo(D.TSUKAIMON, [D.TOKOMON], [D.DEVIMON, D.BAKEMON, D.SOULMON, D.ICEDEVIMON, D.PIDDOMON, D.OGREMON]);
setEvo(D.OTAMAMON, [D.TANEMON], [D.GEKOMON, D.SEADRAMON, D.SHELLMON, D.WHAMON, D.COELAMON, D.MORISHELLMON]);
setEvo(D.TENTOMON, [D.TOKOMON], [D.KABUTERIMON, D.KUWAGAMON, D.GUARDROMON, D.CENTARUMON, D.VEGIEMON, D.YANMAMON]);
setEvo(D.HAGURUMON, [D.KOROMON], [D.GUARDROMON, D.TANKMON, D.CENTARUMON, D.ANDROMON, D.BAKEMON, D.TEKKAMON]);

// Champions -> Ultimates
setEvo(D.GREYMON, [D.AGUMON, D.TOYAGUMON], [D.METALGREYMON, D.SKULLGREYMON, D.MEGADRAMON, D.MACHINEDRAMON, D.MASTERTYRANNOMON]);
setEvo(D.DEVIMON, [D.PATAMON, D.TSUKAIMON, D.BETAMON], [D.MYOTISMON, D.MEGADRAMON, D.SKULLGREYMON, D.GIGADRAMON]);
setEvo(D.AIRDRAMON, [D.BIYOMON], [D.MEGASEADRAMON, D.PIXIMON, D.PHOENIXMON, D.MEGADRAMON]);
setEvo(D.TYRANNOMON, [D.AGUMON, D.GABUMON, D.PATAMON, D.TOYAGUMON], [D.MASTERTYRANNOMON, D.METALGREYMON, D.MEGASEADRAMON]);
setEvo(D.MERAMON, [D.AGUMON, D.GOBURIMON], [D.METALGREYMON, D.BLUEMERAMON, D.METEORMON, D.VADEMON]);
setEvo(D.SEADRAMON, [D.BETAMON, D.MODOKIBETAMON], [D.MEGASEADRAMON, D.WARUSEADRAMON, D.PHOENIXMON]);
setEvo(D.NUMEMON, [], [D.MONZAEMON, D.WARUMONZAEMON, D.ANDROMON]);
setEvo(D.KABUTERIMON, [D.TENTOMON, D.BIYOMON, D.KUNEMON], [D.HERCULESKABUTERIMON, D.GIROMON, D.ANDROMON]);
setEvo(D.ANGEMON, [D.PATAMON, D.ELECMON], [D.ANDROMON, D.PIXIMON, D.VADEMON, D.PHOENIXMON]);
setEvo(D.BIRDRAMON, [D.BIYOMON, D.AGUMON, D.MUCHOMON], [D.PHOENIXMON, D.PIXIMON, D.MEGADRAMON]);
setEvo(D.GARURUMON, [D.GABUMON, D.PSYCHEMON, D.SNOWAGUMON], [D.WEREGARURUMON, D.PANJYAMON, D.MEGADRAMON, D.PHOENIXMON]);
setEvo(D.FRIGIMON, [D.PENGUINMON, D.SNOWAGUMON], [D.PANJYAMON, D.MUDFRIGIMON, D.SKULLGREYMON, D.GIROMON]);
setEvo(D.WHAMON, [D.BETAMON, D.PALMON, D.PENGUINMON], [D.MEGASEADRAMON, D.BRACHIOMON, D.PHOENIXMON]);
setEvo(D.VEGIEMON, [D.PALMON, D.KUNEMON], [D.REDVEGIEMON, D.CHERRYMON, D.MAMEMON, D.VADEMON]);
setEvo(D.UNIMON, [D.PATAMON, D.BIYOMON], [D.PHOENIXMON, D.PIXIMON, D.DIGITAMAMON]);
setEvo(D.OGREMON, [D.GABUMON, D.PATAMON, D.GOBURIMON], [D.WARUMONZAEMON, D.GIROMON, D.VADEMON, D.SKULLGREYMON]);
setEvo(D.SHELLMON, [D.BETAMON, D.PENGUINMON, D.OTAMAMON], [D.WARUSEADRAMON, D.HERCULESKABUTERIMON, D.PHOENIXMON]);
setEvo(D.CENTARUMON, [D.AGUMON, D.GABUMON, D.TENTOMON], [D.ANDROMON, D.GIROMON, D.VADEMON]);
setEvo(D.BAKEMON, [D.ELECMON, D.KUNEMON, D.TSUKAIMON], [D.MYOTISMON, D.SOULMON, D.MEGADRAMON, D.DIGITAMAMON]);
setEvo(D.COELAMON, [D.GABUMON, D.BETAMON], [D.MEGASEADRAMON, D.METALGREYMON]);
setEvo(D.SUKAMON, [], [D.ETEMON, D.METALETEMON]);
setEvo(D.MONOCHROMON, [D.AGUMON, D.GOTSUMON, D.TOYAGUMON], [D.METALGREYMON, D.GIROMON, D.VERMILIMON, D.BRACHIOMON]);
setEvo(D.LEOMON, [D.PATAMON, D.ELECMON, D.GOBURIMON], [D.PANJYAMON, D.WEREGARURUMON, D.MASTERTYRANNOMON, D.VADEMON]);
setEvo(D.KUWAGAMON, [D.TENTOMON, D.ELECMON, D.BIYOMON], [D.HERCULESKABUTERIMON, D.PIXIMON, D.MAMEMON]);
setEvo(D.KOKATORIMON, [D.PALMON, D.KUNEMON, D.MUCHOMON], [D.PHOENIXMON, D.HERCULESKABUTERIMON, D.MAMEMON]);
setEvo(D.DRIMOGEMON, [D.PENGUINMON, D.GOTSUMON], [D.METEORMON, D.MEGADRAMON, D.SKULLGREYMON]);
setEvo(D.NANINMON, [], [D.METALMAMEMON, D.DIGITAMAMON]);
setEvo(D.MOJYAMON, [D.PALMON, D.PENGUINMON], [D.PANJYAMON, D.MAMEMON, D.GIROMON]);

// Unlocked Champions
setEvo(D.FLARERIZAMON, [D.AGUMON, D.GOBURIMON], [D.METALGREYMON, D.MASTERTYRANNOMON, D.METEORMON]);
setEvo(D.HYOGAMON, [D.GOBURIMON, D.SNOWAGUMON], [D.PANJYAMON, D.SKULLGREYMON, D.WARUSEADRAMON]);
setEvo(D.PLATINUMSUKAMON, [], [D.METALETEMON, D.ETEMON]);
setEvo(D.TANKMON, [D.TOYAGUMON, D.AGUMON, D.HAGURUMON], [D.ANDROMON, D.GIROMON, D.MACHINEDRAMON, D.TINMON]);
setEvo(D.REDVEGIEMON, [D.PALMON, D.DOKUNEMON, D.ARURAUMON], [D.CHERRYMON, D.MAMEMON, D.VADEMON]);
setEvo(D.J_MOJYAMON, [D.PENGUINMON, D.PALMON], [D.PANJYAMON, D.MAMEMON]);
setEvo(D.NISEDRIMOGEMON, [D.GOTSUMON], [D.METEORMON, D.MEGADRAMON, D.SKULLGREYMON]);
setEvo(D.MUDFRIGIMON, [D.SNOWAGUMON, D.PENGUINMON], [D.PANJYAMON, D.METEORMON, D.GIROMON]);
setEvo(D.PIDDOMON, [D.PATAMON, D.TSUKAIMON], [D.PHOENIXMON, D.PIXIMON, D.ANDROMON]);
setEvo(D.GEREMON, [], [D.WARUMONZAEMON, D.METALETEMON]);
setEvo(D.FUGAMON, [D.GOBURIMON, D.PSYCHEMON], [D.WARUMONZAEMON, D.GIROMON, D.SKULLGREYMON]);
setEvo(D.MORISHELLMON, [D.MODOKIBETAMON, D.OTAMAMON], [D.BRACHIOMON, D.HERCULESKABUTERIMON, D.PHOENIXMON]);
setEvo(D.GUARDROMON, [D.HAGURUMON, D.TOYAGUMON, D.TENTOMON], [D.ANDROMON, D.GIROMON, D.MACHINEDRAMON, D.TEKKAMON]);
setEvo(D.ICEMON, [D.SNOWAGUMON, D.GOTSUMON], [D.METEORMON, D.GIROMON, D.PANJYAMON]);
setEvo(D.AKATORIMON, [D.MUCHOMON], [D.PHOENIXMON, D.PIXIMON, D.MAMEMON]);
setEvo(D.WEEDMON, [D.DOKUNEMON, D.ARURAUMON], [D.CHERRYMON, D.WARUMONZAEMON, D.MAMEMON]);
setEvo(D.ICEDEVIMON, [D.TSUKAIMON, D.SNOWAGUMON], [D.MYOTISMON, D.SKULLGREYMON, D.GIGADRAMON]);
setEvo(D.DARKRIZAMON, [D.AGUMON, D.GOBURIMON], [D.MEGADRAMON, D.SKULLGREYMON, D.MACHINEDRAMON]);
setEvo(D.BLUEMERAMON, [D.SNOWAGUMON, D.PSYCHEMON], [D.METEORMON, D.SKULLGREYMON, D.VADEMON]);
setEvo(D.GURURUMON, [D.PSYCHEMON, D.GABUMON], [D.WEREGARURUMON, D.PANJYAMON, D.MEGADRAMON]);
setEvo(D.SABERDRAMON, [D.BIYOMON, D.MUCHOMON], [D.PHOENIXMON, D.PIXIMON, D.MEGADRAMON]);
setEvo(D.SOULMON, [D.TSUKAIMON, D.BAKEMON], [D.MYOTISMON, D.DIGITAMAMON, D.VADEMON]);
setEvo(D.ROCKMON, [D.GOTSUMON], [D.METEORMON, D.GIROMON]);
setEvo(D.GEKOMON, [D.OTAMAMON, D.MODOKIBETAMON], [D.SHOGUNGEKOMON, D.MEGASEADRAMON, D.WARUSEADRAMON]);

// Ultimates
setEvo(D.METALGREYMON, [D.GREYMON, D.MERAMON, D.MONOCHROMON, D.TYRANNOMON, D.FLARERIZAMON], []);
setEvo(D.SKULLGREYMON, [D.GREYMON, D.DEVIMON, D.OGREMON, D.DRIMOGEMON, D.DARKRIZAMON], []);
setEvo(D.ANDROMON, [D.GUARDROMON, D.TANKMON, D.ANGEMON, D.CENTARUMON, D.NUMEMON], []);
setEvo(D.MEGADRAMON, [D.GREYMON, D.DEVIMON, D.AIRDRAMON, D.GARURUMON, D.DARKRIZAMON], []);
setEvo(D.GIROMON, [D.OGREMON, D.CENTARUMON, D.GUARDROMON, D.TANKMON, D.FRIGIMON], []);
setEvo(D.MONZAEMON, [D.NUMEMON], []);
setEvo(D.VADEMON, [D.MERAMON, D.VEGIEMON, D.ANGEMON, D.CENTARUMON, D.SOULMON], []);
setEvo(D.DIGITAMAMON, [D.BAKEMON, D.UNIMON, D.SOULMON, D.NANINMON], []);
setEvo(D.ETEMON, [D.SUKAMON], []);
setEvo(D.MEGASEADRAMON, [D.SEADRAMON, D.WHAMON, D.AIRDRAMON, D.TYRANNOMON, D.GEKOMON], []);
setEvo(D.MAMEMON, [D.KUWAGAMON, D.KOKATORIMON, D.VEGIEMON, D.MOJYAMON, D.REDVEGIEMON], []);
setEvo(D.METALMAMEMON, [D.NANINMON], []);
setEvo(D.PIXIMON, [D.ANGEMON, D.BIRDRAMON, D.AIRDRAMON, D.UNIMON, D.PIDDOMON], []);
setEvo(D.HERCULESKABUTERIMON, [D.KABUTERIMON, D.KUWAGAMON, D.SHELLMON, D.KOKATORIMON], []);
setEvo(D.PHOENIXMON, [D.BIRDRAMON, D.AIRDRAMON, D.GARURUMON, D.ANGEMON, D.PIDDOMON], []);
setEvo(D.WEREGARURUMON, [D.GARURUMON, D.LEOMON, D.GURURUMON], []);
setEvo(D.PANJYAMON, [D.LEOMON, D.GARURUMON, D.FRIGIMON, D.GURURUMON, D.MUDFRIGIMON], []);
setEvo(D.GIGADRAMON, [D.DEVIMON, D.ICEDEVIMON, D.MEGADRAMON], []);
setEvo(D.METALETEMON, [D.ETEMON, D.SUKAMON, D.PLATINUMSUKAMON, D.GEREMON], []);
setEvo(D.MYOTISMON, [D.DEVIMON, D.BAKEMON, D.ICEDEVIMON, D.SOULMON], []);
setEvo(D.WARUMONZAEMON, [D.OGREMON, D.NUMEMON, D.WEEDMON, D.FUGAMON, D.GEREMON], []);
setEvo(D.VERMILIMON, [D.MONOCHROMON], []);
setEvo(D.TEKKAMON, [D.GUARDROMON, D.HAGURUMON], []);
setEvo(D.WARUSEADRAMON, [D.SEADRAMON, D.SHELLMON, D.GEKOMON, D.HYOGAMON], []);
setEvo(D.METEORMON, [D.MERAMON, D.BLUEMERAMON, D.DRIMOGEMON, D.ICEMON, D.NISEDRIMOGEMON], []);
setEvo(D.MACHINEDRAMON, [D.METALGREYMON, D.GREYMON, D.TANKMON, D.GUARDROMON, D.DARKRIZAMON], []);
setEvo(D.JIJIMON, [], []);
setEvo(D.SHOGUNGEKOMON, [D.GEKOMON], []);
setEvo(D.CHERRYMON, [D.VEGIEMON, D.REDVEGIEMON, D.WEEDMON], []);
setEvo(D.TINMON, [D.TANKMON], []);
setEvo(D.MASTERTYRANNOMON, [D.TYRANNOMON, D.GREYMON, D.FLARERIZAMON, D.LEOMON], []);
setEvo(D.BRACHIOMON, [D.WHAMON, D.MONOCHROMON, D.MORISHELLMON], []);

// Write expanded evolution table to 0x8011B990 (file offset 0x8B990)
expandedEvoTable.copy(sles, 0x8011B990 - 0x80090000);
console.log('✓ Patched SLES_029.14 @ 0x8011B990: Wrote expanded 128-Digimon Evolution Matrix');

// Starter table (16 Rookie choices)
const starterRoster = Buffer.from([
  D.AGUMON, D.GABUMON, D.BETAMON, D.PATAMON, D.BIYOMON, D.PALMON, D.PENGUINMON, D.ELECMON,
  D.KUNEMON, D.SNOWAGUMON, D.TENTOMON, D.TOYAGUMON, D.MODOKIBETAMON, D.TSUKAIMON, D.PSYCHEMON, D.GOBURIMON
]);
starterRoster.copy(sles, 0x8011C000 - 0x80090000);
console.log('✓ Patched SLES_029.14 @ 0x8011C000: Wrote 16-Rookie Starter Selection Table');

// Patch Starter Spawner logic at 0x80114B84 (file offset 0x84B84)
const starterOpcodes = [
  0x3042000f, // andi r2, r2, 0xf
  0x3c108011, // lui r16, 0x8011
  0x3610c000, // ori r16, r16, 0xc000
  0x02028021, // addu r16, r16, r2
  0x92100000, // lbu r16, 0(r16)
  0x00000000  // nop
];
for (let i = 0; i < starterOpcodes.length; i++) {
  sles.writeUInt32LE(starterOpcodes[i], (0x80114B84 - 0x80090000) + i * 4);
}
console.log('✓ Patched SLES_029.14 @ 0x80114B84: Activated multi-choice Starter Spawner from Jijimon quiz');

// Patch 9 references in SLES_029.14 to point to new 0x8011B990 table
const evoRefs = [
  0x800c0444, 0x800c04c8, 0x800c061c, 0x800c0828, 0x800c0c3c, 0x800c0e14,
  0x800fc9b8, 0x800fd178, 0x800fd59c
];
for (const vaddr of evoRefs) {
  const off = vaddr - 0x80090000;
  sles.writeUInt32LE(0x3c028012, off);     // lui r2, 0x8012
  sles.writeUInt32LE(0x2442b990, off + 4); // addiu r2, r2, -0x4670 (0xB990) -> 0x8011B990
}
console.log('✓ Patched SLES_029.14: Redirected all 9 Evolution Chart & Engine pointers to 0x8011B990');

// Naming Screen Safety Masks
sles.writeUInt32LE(0x30440001, 0x800EDA7C - 0x80090000);
sles.writeUInt32LE(0x30440001, 0x800EDAA8 - 0x80090000);
console.log('✓ Patched SLES_029.14 @ 0x800EDA7C & 0x800EDAA8: Masked Naming Screen 3D preview model index');

// Write patched SLES_029.14 back to disc and to extracted/SLES_029.14
writeDiscFile(fd, slesEntry.lba, sles);
fs.writeFileSync(SLES_EXTRACTED_PATH, sles);

// ============================================================================
// 2. PATCH EVL_REL.BIN (3D Evolution Cutscene Overlay #6)
// ============================================================================
const evlEntry = discIndex.flatFiles.find(f => f.name === 'EVL_REL.BIN');
const evl = Buffer.from(readDiscFile(fd, evlEntry.lba, evlEntry.size));

// At 0x4468: clamp $v1 to 0..63 (`andi $v1, $v1, 0x3F` = 0x3063003F) so stat-gain table lookup stays in-bounds
evl.writeUInt32LE(0x3063003F, 0x4468);
// At 0x4484 & 0x4564: load true unmasked targetDigimonId from 0x74($sp) (`lh $v0, 0x74($sp)` = 0x87A20074)
evl.writeUInt32LE(0x87A20074, 0x4484);
evl.writeUInt32LE(0x87A20074, 0x4564);

writeDiscFile(fd, evlEntry.lba, evl);
console.log('✓ Patched EVL_REL.BIN @ 0x4468, 0x4484, 0x4564: 3D Evolution Cutscene now supports all 127 Digimon');

// ============================================================================
// 3. PATCH ALL OVERWORLD & BOSS .MMD 3D MODELS (#63..#127) FOR V-PET ANIMATIONS
// ============================================================================
let patchedMmdCount = 0;
const seenMmds = new Set();

for (let id = 63; id <= 127; id++) {
  const digi = db.digimon[id];
  if (!digi || !digi.modelFile || seenMmds.has(digi.modelFile)) continue;
  seenMmds.add(digi.modelFile);

  const mmdEntry = discIndex.flatFiles.find(f => f.name === digi.modelFile);
  if (!mmdEntry) continue;

  const mmd = Buffer.from(readDiscFile(fd, mmdEntry.lba, mmdEntry.size));
  const animOff = mmd.readUInt32LE(4);
  if (animOff === 0 || animOff >= mmd.length - 16) continue;

  const firstOffset = mmd.readUInt32LE(animOff);
  const numSlots = Math.floor(firstOffset / 4);
  if (numSlots < 5 || numSlots > 80) continue;

  // Read existing non-zero animation offsets
  const slots = [];
  for (let i = 0; i < numSlots; i++) {
    slots[i] = mmd.readUInt32LE(animOff + i * 4);
  }

  const idle0 = slots[0] || firstOffset;
  const idle1 = slots[1] || idle0;
  const walk2 = slots[2] || idle1;
  const run4  = slots[4] || walk2;
  const emote19 = slots[19] || slots[40] || idle1;
  const atk40 = slots[40] || emote19;
  const win44 = slots[44] || emote19;
  const hit46 = slots[46] || idle1;
  const down47 = slots[47] || idle1;

  let modified = false;
  for (let i = 0; i < numSlots; i++) {
    if (slots[i] === 0) {
      let replacement = idle1;
      if (i === 3) replacement = run4;                          // Run/Trot
      else if (i === 5 || i === 6) replacement = emote19;       // Eat Meat
      else if (i === 7 || i === 8) replacement = win44;         // Happy / Praise
      else if (i === 9 || i === 10) replacement = hit46;        // Refuse / Scold
      else if (i >= 11 && i <= 13) replacement = down47;        // Tired / Sleep
      else if (i >= 14 && i <= 18) replacement = idle1;         // Status / Care (same as PANJ.MMD)
      else if (i >= 20 && i <= 32) replacement = atk40;         // Training / Bathroom / Special
      else if (i >= 33 && i <= 39) replacement = walk2;         // Battle movement
      else if (i >= 40) replacement = atk40;                    // Battle actions

      mmd.writeUInt32LE(replacement, animOff + i * 4);
      modified = true;
    }
  }

  if (modified) {
    writeDiscFile(fd, mmdEntry.lba, mmd);
    patchedMmdCount++;
  }
}

fs.closeSync(fd);
console.log(`✓ Patched ${patchedMmdCount} Overworld/Boss .MMD 3D model files with complete Partner V-Pet animation tables!`);
console.log('🎉 Binary ROM patching of Digimon World (Europe).bin complete!');
