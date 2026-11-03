export function runMips({ codeRegions, dataRegions, start, stop, registers = {}, maxSteps = 2_000_000 }) {
  const code = new Map();
  for (const region of codeRegions) {
    const data = region.data ?? region.bytes;
    for (let offset = 0; offset + 4 <= data.length; offset += 4) code.set((region.address + offset) >>> 0, data.readUInt32LE(offset));
  }
  const regs = new Uint32Array(32);
  for (const [index, value] of Object.entries(registers)) regs[Number(index)] = value >>> 0;
  const readByte = (address) => {
    address >>>= 0;
    for (const region of dataRegions) {
      const startAddress = region.address >>> 0;
      if (address >= startAddress && address < startAddress + region.data.length) return region.data[address - startAddress];
    }
    throw new Error(`Unmapped byte read at 0x${address.toString(16)}`);
  };
  const writeByte = (address, value) => {
    address >>>= 0;
    for (const region of dataRegions) {
      const startAddress = region.address >>> 0;
      if (address >= startAddress && address < startAddress + region.data.length) {
        region.data[address - startAddress] = value;
        return;
      }
    }
    throw new Error(`Unmapped byte write at 0x${address.toString(16)}`);
  };
  const writeHalf = (address, value) => { writeByte(address, value); writeByte(address + 1, value >>> 8); };
  const signed = (value) => value & 0x8000 ? value - 0x10000 : value;
  let pc = start >>> 0;
  let nextPc = (pc + 4) >>> 0;
  let steps = 0;
  while (pc !== (stop >>> 0)) {
    if (++steps > maxSteps) throw new Error(`MIPS step limit exceeded at 0x${pc.toString(16)}`);
    const instruction = code.get(pc);
    if (instruction === undefined) throw new Error(`No instruction at 0x${pc.toString(16)}`);
    const sequential = nextPc;
    nextPc = (nextPc + 4) >>> 0;
    const op = instruction >>> 26;
    const rs = (instruction >>> 21) & 31;
    const rt = (instruction >>> 16) & 31;
    const rd = (instruction >>> 11) & 31;
    const shift = (instruction >>> 6) & 31;
    const immediate = instruction & 0xFFFF;
    const branch = (target) => { nextPc = target >>> 0; };
    if (op === 0) {
      const funct = instruction & 63;
      if (funct === 0) regs[rd] = (regs[rt] << shift) >>> 0;
      else if (funct === 0x21) regs[rd] = (regs[rs] + regs[rt]) >>> 0;
      else if (funct === 0x23) regs[rd] = (regs[rs] - regs[rt]) >>> 0;
      else if (funct === 0x25) regs[rd] = (regs[rs] | regs[rt]) >>> 0;
      else if (funct === 0x08) branch(regs[rs]);
      else throw new Error(`Unsupported SPECIAL funct 0x${funct.toString(16)} at 0x${pc.toString(16)}`);
    } else if (op === 0x0F) regs[rt] = immediate << 16 >>> 0;
    else if (op === 0x09) regs[rt] = (regs[rs] + signed(immediate)) >>> 0;
    else if (op === 0x0C) regs[rt] = regs[rs] & immediate;
    else if (op === 0x20) regs[rt] = ((readByte(regs[rs] + signed(immediate)) << 24) >> 24) >>> 0;
    else if (op === 0x24) regs[rt] = readByte(regs[rs] + signed(immediate));
    else if (op === 0x28) writeByte(regs[rs] + signed(immediate), regs[rt] & 0xFF);
    else if (op === 0x29) writeHalf(regs[rs] + signed(immediate), regs[rt] & 0xFFFF);
    else if (op === 0x04) { if (regs[rs] === regs[rt]) branch((pc + 4 + (signed(immediate) << 2)) >>> 0); }
    else if (op === 0x05) { if (regs[rs] !== regs[rt]) branch((pc + 4 + (signed(immediate) << 2)) >>> 0); }
    else if (op === 0x02) branch((((pc + 4) & 0xF0000000) | ((instruction & 0x03FFFFFF) << 2)) >>> 0);
    else throw new Error(`Unsupported opcode 0x${op.toString(16)} at 0x${pc.toString(16)}`);
    regs[0] = 0;
    pc = sequential;
  }
  return { registers: regs, steps, pc };
}
