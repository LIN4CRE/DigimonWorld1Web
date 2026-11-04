import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DECOMPRESSOR_CAVES,
  MEMORY,
  MODEL_CODE_TABLE,
  OVERLAY_TEXT,
  SLES_TEXT,
  SLES_VRAM_BASE,
  TABLES,
  VANILLA_SHA1,
  assertExpectedReferences,
  buildDecompressor,
  buildExpandedTables,
  buildEvolutionGraph,
  buildFreshEvolutionRoutine,
  buildStarterRoutine,
  compressExpansion,
  decompressExpansion,
  patchSpeciesRecords,
  relocateTableReferences,
  repairMmdAnimations,
  sha1,
  splitCompressedCommands,
} from './rom-expansion.mjs';

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));

function parseArguments(args) {
  const options = { input: null, output: null, help: false };
  const positional = [];
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--input' || argument === '-i') options.input = args[++index];
    else if (argument === '--output' || argument === '-o') options.output = args[++index];
    else if (argument.startsWith('-')) throw new Error(`Unknown option: ${argument}`);
    else positional.push(argument);
  }
  if (!options.input && positional.length) options.input = positional.shift();
  if (!options.output && positional.length) options.output = positional.shift();
  if (positional.length) throw new Error('Too many positional arguments');
  options.input = path.resolve(options.input ?? path.join(ROOT_DIR, 'rom', 'Digimon World (Europe).bin'));
  options.output = path.resolve(options.output ?? options.input);
  return options;
}

function readDiscFile(fd, entry) {
  const output = Buffer.alloc(entry.size);
  const sector = Buffer.alloc(2352);
  for (let index = 0; index < Math.ceil(entry.size / 2048); index++) {
    fs.readSync(fd, sector, 0, 2352, (entry.lba + index) * 2352);
    sector.copy(output, index * 2048, 24, Math.min(24 + 2048, 24 + entry.size - index * 2048));
  }
  return output;
}

const EDC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index++) {
  let edc = index;
  for (let bit = 0; bit < 8; bit++) edc = (edc >>> 1) ^ ((edc & 1) ? 0xD8018001 : 0);
  EDC_TABLE[index] = edc >>> 0;
}

function computeEdc(buffer, start, length) {
  let edc = 0;
  for (let index = start; index < start + length; index++) edc = (edc >>> 8) ^ EDC_TABLE[(edc ^ buffer[index]) & 0xFF];
  return edc >>> 0;
}

function writeDiscFile(fd, entry, data) {
  if (data.length !== entry.size) throw new Error(`${entry.name}: patched size ${data.length} differs from disc size ${entry.size}`);
  const sector = Buffer.alloc(2352);
  for (let index = 0; index < Math.ceil(data.length / 2048); index++) {
    const position = (entry.lba + index) * 2352;
    fs.readSync(fd, sector, 0, 2352, position);
    const start = index * 2048;
    data.copy(sector, 24, start, Math.min(data.length, start + 2048));
    if ((sector[18] & 0x20) === 0) sector.writeUInt32LE(computeEdc(sector, 16, 2048 + 8), 2072);
    fs.writeSync(fd, sector, 0, 2352, position);
  }
}

function vaToFile(address) {
  const offset = address - SLES_VRAM_BASE;
  if (offset < 0) throw new Error(`Invalid SLES address 0x${address.toString(16)}`);
  return offset;
}

function jumpInstruction(opcode, address) {
  return (opcode | ((address >>> 2) & 0x03FFFFFF)) >>> 0;
}

function totalReferences(counts) {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node patch-ps1-rom.mjs [--input clean.bin] [--output patched.bin]');
    console.log('With no arguments, patches rom/Digimon World (Europe).bin in place.');
    return;
  }
  if (!fs.existsSync(options.input)) throw new Error(`ROM not found: ${options.input}`);

  const discIndex = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'extracted', 'disc-index.json'), 'utf8'));
  const db = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'public', 'data', 'reverse-engineered-db.json'), 'utf8'));
  const entries = new Map(discIndex.flatFiles.map((entry) => [entry.name, entry]));
  const requireEntry = (name) => {
    const entry = entries.get(name);
    if (!entry) throw new Error(`Disc index is missing ${name}`);
    return entry;
  };

  const input = fs.openSync(options.input, 'r');
  const originalSles = readDiscFile(input, requireEntry('SLES_029.14'));
  const sles = Buffer.from(originalSles);
  if (sha1(sles) !== VANILLA_SHA1['SLES_029.14']) {
    fs.closeSync(input);
    throw new Error('SLES_029.14 is not the verified vanilla European executable; start with a clean dump');
  }

  const graph = buildEvolutionGraph(db);
  const expanded = buildExpandedTables(originalSles, db, graph);
  const commands = compressExpansion(expanded.expanded);
  const compressed = splitCompressedCommands(commands);
  if (!decompressExpansion(compressed.first, compressed.second).equals(expanded.expanded)) throw new Error('Expanded-table compression round-trip failed');
  const decompressor = buildDecompressor(compressed.firstEndAddress);

  const overlayData = new Map();
  const referenceCounts = {};
  for (const [name, textRange] of Object.entries(OVERLAY_TEXT)) {
    const data = name === 'SLES_029.14' ? sles : readDiscFile(input, requireEntry(name));
    if (name === 'EVL_REL.BIN' && sha1(data) !== VANILLA_SHA1['EVL_REL.BIN']) {
      fs.closeSync(input);
      throw new Error('EVL_REL.BIN is not the verified vanilla European overlay; start with a clean dump');
    }
    const counts = relocateTableReferences(data, textRange);
    assertExpectedReferences(name, counts);
    referenceCounts[name] = counts;
    overlayData.set(name, data);
  }

  // No old references may remain before their storage becomes compressed data.
  for (const [name, data] of overlayData) {
    const remaining = relocateTableReferences(data, OVERLAY_TEXT[name]);
    if (totalReferences(remaining) !== 0) throw new Error(`${name}: old expanded-table references remain after relocation`);
  }

  const { generatedMovesets } = patchSpeciesRecords(sles, db);

  // Keep the verified any-stage item behavior, but do not touch item handlers.
  sles.writeUInt32LE(0, 0x03B538); // 0x800CB538: NOP the item stage check.

  compressed.first.copy(sles, vaToFile(TABLES.raise.oldAddress));
  compressed.second.copy(sles, vaToFile(TABLES.reqs.oldAddress));
  for (const cave of Object.values(decompressor)) cave.bytes.copy(sles, vaToFile(cave.address));
  sles.writeUInt32LE(jumpInstruction(0x0C000000, DECOMPRESSOR_CAVES.main.address), vaToFile(0x80114E2C));

  const endSymbolOffset = vaToFile(0x80119EDC);
  if (originalSles.readUInt32LE(endSymbolOffset) !== 0x801C8CC0) throw new Error('Unexpected vanilla _end symbol');
  sles.writeUInt32LE(MEMORY.NEW_END_SYMBOL, endSymbolOffset);

  const freshOffset = vaToFile(0x800FC908);
  sles.fill(0, freshOffset, freshOffset + 29 * 4);
  buildFreshEvolutionRoutine().copy(sles, freshOffset);
  buildStarterRoutine().copy(sles, vaToFile(0x80114B84));

  // The naming script expects the original binary quiz result even though the
  // starter spawner uses the low four bits as a table index.
  sles.writeUInt32LE(0x3044000F, vaToFile(0x800EDA7C));
  sles.writeUInt32LE(0x3044000F, vaToFile(0x800EDAA8));

  // Regression assertions for every class of corruption found in the old patch.
  if (!sles.subarray(0xA1104, 0xA1104 + 128 * 4).equals(originalSles.subarray(0xA1104, 0xA1104 + 128 * 4))) {
    throw new Error('Vanilla item handler table was modified');
  }
  for (const offset of [0x730D0, 0x6DD98]) {
    if (!sles.subarray(offset, offset + 4).equals(originalSles.subarray(offset, offset + 4))) throw new Error(`Obsolete main workaround remains at 0x${offset.toString(16)}`);
  }
  for (const [address, length] of [[0x8011B990, 0x580], [0x8011C000, 0x10]]) {
    const offset = vaToFile(address);
    if (!sles.subarray(offset, offset + length).equals(originalSles.subarray(offset, offset + length))) throw new Error(`Live interrupt state was overwritten at 0x${address.toString(16)}`);
  }
  const evl = overlayData.get('EVL_REL.BIN');
  const originalEvl = readDiscFile(input, requireEntry('EVL_REL.BIN'));
  for (const offset of [0x4468, 0x4484, 0x4564]) {
    if (!evl.subarray(offset, offset + 4).equals(originalEvl.subarray(offset, offset + 4))) throw new Error(`Obsolete EVL mask remains at 0x${offset.toString(16)}`);
  }
  if (sles.toString('ascii', MODEL_CODE_TABLE + 62 * 8, MODEL_CODE_TABLE + 62 * 8 + 4) !== 'wEAG') throw new Error('Waregarurumon model fallback regressed');
  if (sles.toString('ascii', MODEL_CODE_TABLE + 114 * 8, MODEL_CODE_TABLE + 114 * 8 + 4) !== 'AGUM') throw new Error('Veemon model fallback is missing');

  // Repair animation slots using the model code that the patched game will
  // actually load (including Veemon's AGUM fallback).
  const mmdEntries = new Map();
  for (const entry of discIndex.flatFiles) {
    if (entry.name.toUpperCase().endsWith('.MMD') && !mmdEntries.has(entry.name.toLowerCase())) mmdEntries.set(entry.name.toLowerCase(), entry);
  }
  const changedFiles = new Map();
  const seenModels = new Set();
  let patchedMmdCount = 0;
  let skippedMmdCount = 0;
  for (let id = 62; id <= 127; id++) {
    const modelOffset = MODEL_CODE_TABLE + id * 8;
    const code = sles.toString('ascii', modelOffset, modelOffset + 8).replaceAll('\0', '').trim();
    if (!code) continue;
    const entry = mmdEntries.get(`${code}.mmd`.toLowerCase());
    if (!entry || seenModels.has(entry.name)) continue;
    seenModels.add(entry.name);
    const repaired = repairMmdAnimations(readDiscFile(input, entry));
    if (!repaired.modified) {
      skippedMmdCount++;
      continue;
    }
    changedFiles.set(entry.name, { entry, data: repaired.data });
    patchedMmdCount++;
  }

  for (const [name, data] of overlayData) {
    if (name !== 'SLES_029.14' && totalReferences(referenceCounts[name]) > 0) changedFiles.set(name, { entry: requireEntry(name), data });
  }
  changedFiles.set('SLES_029.14', { entry: requireEntry('SLES_029.14'), data: sles });
  fs.closeSync(input);

  if (options.output !== options.input) {
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.copyFileSync(options.input, options.output);
  }
  const output = fs.openSync(options.output, 'r+');
  for (const { entry, data } of changedFiles.values()) writeDiscFile(output, entry, data);
  const verifiedSles = readDiscFile(output, requireEntry('SLES_029.14'));
  fs.closeSync(output);
  if (!verifiedSles.equals(sles)) throw new Error('Written SLES_029.14 failed read-back verification');
  fs.writeFileSync(path.join(ROOT_DIR, 'extracted', 'SLES_029.14'), sles);

  console.log(`Patched ROM: ${options.output}`);
  console.log(`Expanded tables: ${expanded.expanded.length} bytes resident at 0x${MEMORY.RAISE_DATA.toString(16)}; heap starts at 0x${MEMORY.RESERVED_END.toString(16)}`);
  console.log(`Compressed streams: ${compressed.first.length} + ${compressed.second.length} = ${compressed.totalLength} bytes (${compressed.capacity - compressed.totalLength} spare)`);
  console.log(`Decompressor caves: ${decompressor.main.bytes.length}/${DECOMPRESSOR_CAVES.main.size} and ${decompressor.commands.bytes.length}/${DECOMPRESSOR_CAVES.commands.size} bytes`);
  console.log(`Redirected references: ${Object.entries(referenceCounts).map(([name, counts]) => `${name}=${totalReferences(counts)}`).filter((entry) => !entry.endsWith('=0')).join(', ')}`);
  console.log(`Evolution graph: 128 rows, ${graph.starters.length} starters, all non-NPC species reachable`);
  console.log(`Species records: ${generatedMovesets} move sets; Veemon name/model installed; Waregarurumon retains wEAG`);
  console.log(`MMD animations: ${patchedMmdCount} repaired, ${skippedMmdCount} already complete or unsupported`);
  console.log(`Changed disc files: ${changedFiles.size}`);
}

try {
  main();
} catch (error) {
  console.error(`ROM patch failed: ${error.message}`);
  process.exitCode = 1;
}
