// Shared, portable path resolution for the ROM reverse-engineering tooling.
// Replaces the old hardcoded `C:\Users\David\...` absolute paths so every script
// runs from a clean checkout on any OS. Override locations with environment
// variables when your disc image lives outside the repository.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const resolveFromRoot = (value) => (path.isAbsolute(value) ? value : path.join(ROOT_DIR, value));

export const PUBLIC_DIR = process.env.DIGIMON_PUBLIC_DIR
  ? resolveFromRoot(process.env.DIGIMON_PUBLIC_DIR)
  : path.join(ROOT_DIR, 'public');

export const OUT_DIR = process.env.DIGIMON_EXTRACTED_DIR
  ? resolveFromRoot(process.env.DIGIMON_EXTRACTED_DIR)
  : path.join(ROOT_DIR, 'extracted');

export const ROM_DIR = path.join(ROOT_DIR, 'rom');

export const BIN_PATH = process.env.DIGIMON_ROM_BIN
  ? resolveFromRoot(process.env.DIGIMON_ROM_BIN)
  : path.join(ROM_DIR, 'Digimon World (Europe).bin');

export const ZIP_PATH = process.env.DIGIMON_ROM_ZIP
  ? resolveFromRoot(process.env.DIGIMON_ROM_ZIP)
  : path.join(ROM_DIR, 'Digimon World (Europe).zip');

export const DISC_INDEX_PATH = path.join(OUT_DIR, 'disc-index.json');
export const SLES_PATH = path.join(OUT_DIR, 'SLES_029.14');

export const PUBLIC_DATA_DIR = path.join(PUBLIC_DIR, 'data');
export const PUBLIC_TEX_DIR = path.join(PUBLIC_DIR, 'textures');
export const PUBLIC_MAPS_DIR = path.join(PUBLIC_DIR, 'maps');
export const PUBLIC_CARDS_DIR = path.join(PUBLIC_DIR, 'cards');
export const PUBLIC_ROM_DIR = path.join(PUBLIC_DIR, 'rom');
export const PUBLIC_ASSETS_DIR = path.join(PUBLIC_DIR, 'assets');

// Fail with an actionable message instead of a raw ENOENT when the (gitignored)
// disc image is required but absent.
export function assertRomPresent(fs) {
  if (!fs.existsSync(BIN_PATH)) {
    console.error(
      `Disc image not found at ${BIN_PATH}.\n` +
      'Place your European SLES-02914 dump there, or set DIGIMON_ROM_BIN to its location.\n' +
      'The ROM is gitignored and is never committed to this repository.'
    );
    process.exit(1);
  }
}
