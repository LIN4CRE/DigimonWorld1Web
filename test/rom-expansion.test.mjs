import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  DECOMPRESSOR_CAVES,
  LEVEL_OVERRIDES,
  MEMORY,
  MODEL_CODE_TABLE,
  SPECIES_RECORD_BASE,
  TABLES,
  buildDecompressor,
  buildEvolutionGraph,
  buildFreshEvolutionRoutine,
  buildStarterRoutine,
  compressExpansion,
  decompressExpansion,
  patchSpeciesRecords,
  relocateTableReferences,
  repairMmdAnimations,
  splitCompressedCommands,
} from '../rom-expansion.mjs';
import { runMips } from '../test-support/mips-interpreter.mjs';

const db = JSON.parse(fs.readFileSync(new URL('../public/data/reverse-engineered-db.json', import.meta.url), 'utf8'));
const graph = buildEvolutionGraph(db);

function makeExpandedFixture() {
  const data = Buffer.alloc(MEMORY.RESERVED_END - MEMORY.RAISE_DATA);
  const templates = Array.from({ length: 6 }, (_, template) => Buffer.from(Array.from({ length: 28 }, (_, index) => (template * 37 + index * 11) & 0xFF)));
  for (let id = 0; id < 128; id++) {
    const template = templates[id % templates.length];
    template.copy(data, id * 28, 0, 28);
    template.copy(data, 0xE00 + id * 28, 0, 28);
    template.copy(data, 0x1C00 + id * 14, 0, 14);
    data.writeUInt16LE(id, id * 28);
    data.writeUInt16LE(id, 0xE00 + id * 28);
    data.writeUInt16LE(id, 0x1C00 + id * 14 + 12);
  }
  graph.paths.copy(data, 0x2300);
  Buffer.from(graph.starters).copy(data, 0x2880);
  return data;
}

function commandTypes(commands) {
  return new Set(commands.map((command) => command[0] & 0xC0));
}

function makeReference(address) {
  const high = (address + 0x8000) >>> 16;
  const low = address & 0xFFFF;
  return [0x3C020000 | high, 0x24420000 | low];
}

function readReference(buffer, offset) {
  const first = buffer.readUInt32LE(offset);
  const second = buffer.readUInt32LE(offset + 4);
  return (((first & 0xFFFF) << 16) + ((second & 0x8000) ? (second & 0xFFFF) - 0x10000 : second & 0xFFFF)) >>> 0;
}

test('evolution graph is complete, stage-correct, reachable, and within engine limits', () => {
  assert.deepEqual(graph.starters, [3, 17, 4, 31, 45, 46, 57, 18, 32, 71, 111, 74, 127, 96, 125, 114]);
  assert.equal(graph.paths.length, 128 * 11);
  assert.ok(graph.paths.subarray(127 * 11).every((value) => value === 0xFF));
  assert.deepEqual(graph.forward[127], [2]);
  assert.deepEqual(graph.reverse[114], [2]);
  assert.ok(graph.forward[111].includes(67));
  for (let id = 1; id <= 127; id++) {
    assert.ok(graph.forward[id].length <= 6, `${db.digimon[id].name} forward capacity`);
    assert.ok(graph.reverse[id].length <= 5, `${db.digimon[id].name} reverse capacity`);
    for (const target of graph.forward[id]) {
      assert.equal(graph.levels[target], graph.levels[id] + 1, `${db.digimon[id].name} -> ${db.digimon[target].name}`);
      assert.ok(graph.reverse[target].includes(id));
    }
    if (id !== 116 && id !== 118) assert.ok(graph.reachable.has(id), `${db.digimon[id].name} is reachable`);
  }
  for (const [id, level] of Object.entries(LEVEL_OVERRIDES)) assert.equal(graph.levels[Number(id)], level);
});

test('compression preserves data and emits every command class', () => {
  const expanded = makeExpandedFixture();
  const commands = compressExpansion(expanded);
  const split = splitCompressedCommands(commands);
  assert.ok(split.totalLength < split.capacity);
  assert.deepEqual(commandTypes(commands), new Set([0, 0x40, 0x80, 0xC0]));
  assert.ok(decompressExpansion(split.first, split.second).equals(expanded));
});

test('emitted MIPS decompressor reconstructs all resident tables and preserves heap arguments', () => {
  const expanded = makeExpandedFixture();
  const split = splitCompressedCommands(compressExpansion(expanded));
  const code = buildDecompressor(split.firstEndAddress);
  assert.ok(code.main.bytes.length <= DECOMPRESSOR_CAVES.main.size);
  assert.ok(code.commands.bytes.length <= DECOMPRESSOR_CAVES.commands.size);
  const output = Buffer.alloc(expanded.length);
  const result = runMips({
    codeRegions: [code.main, code.commands],
    dataRegions: [
      { address: TABLES.raise.oldAddress, data: split.first },
      { address: TABLES.reqs.oldAddress, data: split.second },
      { address: MEMORY.RAISE_DATA, data: output },
    ],
    start: DECOMPRESSOR_CAVES.main.address,
    stop: 0x80091074,
    registers: { 4: 0x11223344, 5: 0x55667788, 31: 0x80114E30 },
  });
  assert.ok(output.equals(expanded));
  assert.equal(result.registers[4], 0x11223344);
  assert.equal(result.registers[5], 0x55667788);
  assert.equal(result.registers[31], 0x80114E30);
  assert.ok(result.steps < 2_000_000);
});

test('table relocation handles interior pointers and leaves unrelated instructions alone', () => {
  const buffer = Buffer.alloc(0x100);
  let offset = 0;
  for (const table of Object.values(TABLES)) {
    const words = makeReference(table.oldAddress + 12);
    buffer.writeUInt32LE(words[0], offset);
    buffer.writeUInt32LE(words[1], offset + 4);
    offset += 16;
  }
  buffer.writeUInt32LE(0xDEADBEEF, 0xC0);
  const counts = relocateTableReferences(buffer, { start: 0, end: 0x80 });
  assert.deepEqual(counts, { raise: 1, reqs: 1, stats: 1, paths: 1 });
  offset = 0;
  for (const table of Object.values(TABLES)) {
    assert.equal(readReference(buffer, offset), table.newAddress + 12);
    offset += 16;
  }
  assert.equal(buffer.readUInt32LE(0xC0), 0xDEADBEEF);
});

test('Fresh replacement uses expanded forward rows, including DemiMeramon', () => {
  const code = Buffer.alloc(29 * 4);
  buildFreshEvolutionRoutine().copy(code);
  const timer = Buffer.from([0x34, 0x12]);
  const result = runMips({
    codeRegions: [{ address: 0x800FC908, data: code }],
    dataRegions: [
      { address: MEMORY.EVOLUTION_PATHS, data: graph.paths },
      { address: 0x8013FA7E, data: timer },
    ],
    start: 0x800FC908,
    stop: 0x80123456,
    registers: { 4: 127, 31: 0x80123456 },
  });
  assert.equal(result.registers[2], 2);
  assert.deepEqual(timer, Buffer.from([0, 0]));
});

test('starter replacement indexes the resident sixteen-byte roster', () => {
  const result = runMips({
    codeRegions: [{ address: 0x80114B84, data: buildStarterRoutine() }],
    dataRegions: [{ address: MEMORY.STARTER_ROSTER, data: Buffer.from(graph.starters) }],
    start: 0x80114B84,
    stop: 0x80114B9C,
    registers: { 2: 0x1F },
  });
  assert.equal(result.registers[16], 114);
});

test('species records use verified offsets and valid stage-specific techniques', () => {
  const sles = Buffer.alloc(MODEL_CODE_TABLE + 128 * 8, 0);
  for (let id = 0; id < 128; id++) {
    const offset = SPECIES_RECORD_BASE + id * 32;
    sles[offset + 9] = db.digimon[id].levelCode;
    sles.fill(0xFF, offset + 10, offset + 13);
    sles.fill(0xFF, offset + 15, offset + 31);
    sles[offset + 14] = 10;
  }
  for (const id of [62, 114, 127]) sles.fill(0, SPECIES_RECORD_BASE + id * 32 + 15, SPECIES_RECORD_BASE + id * 32 + 31);
  sles.write('AGUM', MODEL_CODE_TABLE + 3 * 8, 'ascii');
  sles.write('wEAG', MODEL_CODE_TABLE + 62 * 8, 'ascii');
  sles.write('tAKA', MODEL_CODE_TABLE + 114 * 8, 'ascii');
  patchSpeciesRecords(sles, db);

  const veemon = SPECIES_RECORD_BASE + 114 * 32;
  assert.equal(sles[veemon + 8], 2);
  assert.equal(sles[veemon + 9], 3);
  assert.equal(sles.toString('ascii', MODEL_CODE_TABLE + 114 * 8, MODEL_CODE_TABLE + 114 * 8 + 4), 'AGUM');
  assert.equal(sles.toString('ascii', MODEL_CODE_TABLE + 62 * 8, MODEL_CODE_TABLE + 62 * 8 + 4), 'wEAG');
  assert.deepEqual([...sles.subarray(0xA89D0, 0xA89D0 + 12)], [0x82, 0x75, 0x82, 0x85, 0x82, 0x85, 0x82, 0x8D, 0x82, 0x8F, 0x82, 0x8E]);
  assert.equal(sles[0xA89D0 + 12], 0);

  const demi = SPECIES_RECORD_BASE + 127 * 32;
  assert.equal(sles[demi + 9], 1);
  assert.equal(sles[demi + 15], 120);
  assert.ok(sles.subarray(demi + 16, demi + 31).every((value) => value === 0xFF));

  for (let id = 62; id <= 127; id++) {
    if (id === 116 || id === 118 || id === 127) continue;
    const offset = SPECIES_RECORD_BASE + id * 32;
    const moves = [...sles.subarray(offset + 15, offset + 31)];
    assert.equal(moves.length, 16);
    assert.ok(moves.slice(0, 15).every((move) => move < 58));
    assert.ok(moves[15] >= 58 && moves[15] <= 112);
  }
  assert.equal(sles[0xA10D8 + 83 - 71], 92);
});

test('MMD repair fills only empty animation slots and handles short tables safely', () => {
  const mmd = Buffer.alloc(0x400);
  const animationOffset = 0x40;
  const slots = 48;
  mmd.writeUInt32LE(animationOffset, 4);
  mmd.writeUInt32LE(slots * 4, animationOffset);
  for (let index = 0; index < slots; index++) mmd.writeUInt32LE(index > 0 && index % 3 === 0 ? 0 : slots * 4 + index * 4, animationOffset + index * 4);
  const original = Buffer.from(mmd);
  const repaired = repairMmdAnimations(mmd);
  assert.ok(repaired.modified);
  assert.equal(repaired.slots, slots);
  assert.ok(mmd.equals(original));
  for (let index = 0; index < slots; index++) {
    const before = original.readUInt32LE(animationOffset + index * 4);
    const after = repaired.data.readUInt32LE(animationOffset + index * 4);
    assert.notEqual(after, 0);
    if (before !== 0) assert.equal(after, before);
  }
  assert.equal(repairMmdAnimations(Buffer.alloc(16)).modified, false);
});
