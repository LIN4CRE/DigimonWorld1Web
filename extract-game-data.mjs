import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = 'C:\\Users\\David\\.gemini\\antigravity\\scratch\\digimon-world-webui\\extracted';
const sles = fs.readFileSync(path.join(OUT_DIR, 'SLES_029.14'));

function extractSjisStrings(buf) {
  const results = [];
  let i = 0;
  while (i < buf.length - 1) {
    let chars = '';
    let start = i;
    while (i < buf.length - 1) {
      const b1 = buf[i], b2 = buf[i + 1];
      if (b1 === 0x82 && b2 >= 0x4f && b2 <= 0x58) { chars += String.fromCharCode(0x30 + (b2 - 0x4f)); i += 2; }
      else if (b1 === 0x82 && b2 >= 0x60 && b2 <= 0x79) { chars += String.fromCharCode(0x41 + (b2 - 0x60)); i += 2; }
      else if (b1 === 0x82 && b2 >= 0x81 && b2 <= 0x9a) { chars += String.fromCharCode(0x61 + (b2 - 0x81)); i += 2; }
      else if (b1 === 0x81 && b2 === 0x40) { chars += ' '; i += 2; }
      else if (b1 === 0x81 && b2 === 0x44) { chars += '.'; i += 2; }
      else if (b1 === 0x81 && b2 === 0x46) { chars += ':'; i += 2; }
      else if (b1 === 0x81 && b2 === 0x48) { chars += '?'; i += 2; }
      else if (b1 === 0x81 && b2 === 0x49) { chars += '!'; i += 2; }
      else if (b1 === 0x81 && (b2 === 0x5b || b2 === 0x7c || b2 === 0x5d)) { chars += '-'; i += 2; }
      else if (b1 === 0x81 && b2 === 0x66) { chars += "'"; i += 2; }
      else if (b1 === 0x81 && b2 === 0x5e) { chars += '/'; i += 2; }
      else if (b1 === 0x81 && b2 === 0x93) { chars += '%'; i += 2; }
      else if (b1 === 0x81 && b2 === 0x95) { chars += '&'; i += 2; }
      else break;
    }
    if (chars.trim().length >= 3) {
      results.push({ off: '0x' + start.toString(16), offsetNum: start, str: chars.trim() });
    }
    if (i === start) i++;
  }
  return results;
}

const sjis = extractSjisStrings(sles);
console.log('Total Shift-JIS full-width English strings in SLES_029.14:', sjis.length);
console.log(sjis.slice(200).map(x => `${x.off}: ${x.str}`).join('\n'));
