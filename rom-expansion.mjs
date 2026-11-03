import { createHash } from 'node:crypto';

export const VANILLA_SHA1 = Object.freeze({
  'SLES_029.14': 'a805aad8bb6b2a12b145bd2172697aff7a28d25e',
  'EVL_REL.BIN': '667e4667ca1b469beb8aed7e4364827619eb5e46',
});

export const SLES_VRAM_BASE = 0x80090000;
export const SLES_TEXT = Object.freeze({ start: 0x800, end: 0x89E88 });

export const OVERLAY_TEXT = Object.freeze({
  'SLES_029.14': SLES_TEXT,
  'BTL_REL.BIN': { start: 0x41C8, end: 0x2888C },
  'DGET_REL.BIN': { start: 0x40, end: 0x1984 },
  'DOO2_REL.BIN': { start: 0x40, end: 0x2788 },
  'DOOA_REL.BIN': { start: 0x40, end: 0x61B0 },
  'EAB_REL.BIN': { start: 0x40, end: 0x1D7C },
  'ENDI_REL.BIN': { start: 0x40, end: 0x12BC },
  'EVL_REL.BIN': { start: 0x40, end: 0x5450 },
  'FISH_REL.BIN': { start: 0x40, end: 0xE0A0 },
  'KAR_REL.BIN': { start: 0x40, end: 0x9818 },
  'MOV_REL.BIN': { start: 0x40, end: 0xB64 },
  'MURD_REL.BIN': { start: 0x40, end: 0x2130 },
  'SHOP_REL.BIN': { start: 0x40, end: 0x7860 },
  'STD_REL.BIN': { start: 0x41C8, end: 0x30CA4 },
  'TRN2_REL.BIN': { start: 0x40, end: 0x5ED4 },
  'TRN_REL.BIN': { start: 0x40, end: 0x78D4 },
  'VS_REL.BIN': { start: 0x41C8, end: 0x30188 },
});

const OLD_HEAP_START = 0x801C8CD0;
export const MEMORY = Object.freeze({
  RAISE_DATA: OLD_HEAP_START,
  EVOLUTION_REQS: 0x801C9AD0,
  EVOLUTION_STATS_GAINS: 0x801CA8D0,
  EVOLUTION_PATHS: 0x801CAFD0,
  STARTER_ROSTER: 0x801CB550,
  RESERVED_END: 0x801CB560,
  NEW_END_SYMBOL: 0x801CB550,
});

export const TABLES = Object.freeze({
  raise: { oldAddress: 0x80129A2C, oldSize: 0x738, oldCount: 66, stride: 28, newAddress: MEMORY.RAISE_DATA, newCount: 128 },
  reqs: { oldAddress: 0x80134A30, oldSize: 0x6E4, oldCount: 63, stride: 28, newAddress: MEMORY.EVOLUTION_REQS, newCount: 128 },
  stats: { oldAddress: 0x80135114, oldSize: 0x39C, oldCount: 66, stride: 14, newAddress: MEMORY.EVOLUTION_STATS_GAINS, newCount: 128 },
  paths: { oldAddress: 0x801354B0, oldSize: 0x2AA, oldCount: 62, stride: 11, newAddress: MEMORY.EVOLUTION_PATHS, newCount: 128 },
});

export const EXPECTED_REFERENCES = Object.freeze({
  'SLES_029.14': { raise: 65, reqs: 19, stats: 4, paths: 9 },
  'EVL_REL.BIN': { raise: 1, reqs: 0, stats: 1, paths: 0 },
  'TRN_REL.BIN': { raise: 3, reqs: 0, stats: 0, paths: 0 },
  'TRN2_REL.BIN': { raise: 3, reqs: 0, stats: 0, paths: 0 },
});

export const DECOMPRESSOR_CAVES = Object.freeze({
  main: { address: 0x800B6BD8, size: 0xD0, name: 'cb_data (unreferenced EU CD callback)' },
  commands: { address: 0x8011077C, size: 0xB4, name: '_card_stop (unreferenced EU memory-card routine)' },
});

export const LEVEL_OVERRIDES = Object.freeze({
  62: 5, // Waregarurumon
  63: 5, // Panjyamon
  67: 4, // Yanmamon
  69: 4, // Flarerizamon
  88: 5, // Vermilimon
  94: 4, // Icemon
  101: 4, // Darkrizamon
  102: 4, // SandYanmamon
  113: 5, // Meteormon
  114: 3, // Veemon stand-in
  117: 5, // Jijimon
  119: 5, // ShogunGekomon
  120: 5, // King of Sukamon
  121: 5, // Cherrymon
  122: 3, // Hagurumon
  123: 5, // Tinmon
  124: 5, // Master Tyrannomon
  126: 5, // Brachiomon
});

export const STARTER_NAMES = Object.freeze([
  'Agumon', 'Gabumon', 'Betamon', 'Patamon',
  'Biyomon', 'Palmon', 'Penguinmon', 'Elecmon',
  'Kunemon', 'SnowAgumon', 'Tentomon', 'Dokunemon',
  'DemiMeramon', 'Tsukaimon', 'Goburimon variant', 'Veemon',
]);

const ITEM_TARGET_SPECIES = Object.freeze([
  5, 9, 21, 36, 47, 38, 8, 6, 34, 48, 20, 37, 92, 7, 50, 33,
  19, 51, 25, 58, 10, 24, 35, 49, 22, 23, 52, 53, 12, 26, 40, 54,
  13, 27, 41, 55, 14, 28, 42, 56, 59, 60, 61, 62, 64, 63, 65,
]);

const KEY_ALIASES = Object.freeze({
  NANINMON: 'nanimon',
  WEREGARURUMON: 'waregarurumon',
  VEEMON: 'digimon',
  Veemon: 'digimon',
  'Goburimon variant': 'goburimon#125',
  KINGSUKAMON: 'kingofsukamon',
  GOBURIMON_VARIANT: 'goburimon#125',
  COELAMON2: 'coelamon',
});

function speciesKey(value) {
  return value.toLowerCase().replace(/[^a-z0-9#]/g, '');
}

export function createSpeciesResolver(db) {
  const byKey = new Map();
  for (const digimon of db.digimon) {
    const key = speciesKey(digimon.name);
    if (!byKey.has(key)) byKey.set(key, digimon.id);
  }
  byKey.set('goburimon#125', 125);

  const resolve = (nameOrKey) => {
    const aliased = KEY_ALIASES[nameOrKey] ?? nameOrKey;
    const key = speciesKey(aliased);
    if (!byKey.has(key)) throw new Error(`Unknown Digimon species key: ${nameOrKey}`);
    return byKey.get(key);
  };

  const D = new Proxy(Object.create(null), {
    get(_target, property) {
      if (typeof property !== 'string') return undefined;
      return resolve(property);
    },
  });

  return { D, resolve, byKey };
}

export function getSpeciesLevels(db) {
  const levels = new Uint8Array(128);
  for (const digimon of db.digimon) levels[digimon.id] = LEVEL_OVERRIDES[digimon.id] ?? digimon.levelCode;
  return levels;
}

export function buildEvolutionGraph(db) {
  const { D, resolve } = createSpeciesResolver(db);
  const levels = getSpeciesLevels(db);
  const definitions = new Map();

  function setEvo(digimonId, fromList, toList) {
    if (definitions.has(digimonId)) throw new Error(`Duplicate evolution row for ${db.digimon[digimonId].name}`);
    definitions.set(digimonId, { from: [...fromList], to: [...toList] });
  }

  function addTarget(source, target) {
    const row = definitions.get(source);
    if (!row.to.includes(target)) row.to.push(target);
  }

  function replaceTarget(source, oldTarget, newTarget) {
    const row = definitions.get(source);
    const index = row.to.indexOf(oldTarget);
    if (index < 0) throw new Error(`Cannot replace missing edge ${source} -> ${oldTarget}`);
    row.to[index] = newTarget;
  }

  // Forward candidates are declared below. Reverse paths are derived later.
setEvo(D.BOTAMON, [], [D.KOROMON]);
setEvo(D.PUNIMON, [], [D.TSUNOMON]);
setEvo(D.POYOMON, [], [D.TOKOMON]);
setEvo(D.YURAMON, [], [D.TANEMON]);
setEvo(D.KOROMON, [D.BOTAMON], [D.AGUMON, D.GABUMON, D.TOYAGUMON, D.GOTSUMON, D.HAGURUMON]);
setEvo(D.TSUNOMON, [D.PUNIMON], [D.ELECMON, D.PENGUINMON, D.PSYCHEMON, D.SNOWAGUMON, D.GOBURIMON]);
setEvo(D.TOKOMON, [D.POYOMON], [D.PATAMON, D.BIYOMON, D.TENTOMON, D.TSUKAIMON, D.MUCHOMON]);
setEvo(D.TANEMON, [D.YURAMON], [D.PALMON, D.BETAMON, D.KUNEMON, D.MODOKIBETAMON, D.ARURAUMON, D.OTAMAMON]);
setEvo(D.AGUMON, [D.KOROMON], [D.GREYMON, D.MERAMON, D.BIRDRAMON, D.CENTARUMON, D.MONOCHROMON, D.TYRANNOMON]);
setEvo(D.BETAMON, [D.TANEMON], [D.SEADRAMON, D.WHAMON, D.SHELLMON, D.COELAMON, D.GEKOMON, D.MORISHELLMON]);
setEvo(D.GABUMON, [D.KOROMON], [D.GARURUMON, D.OGREMON, D.TYRANNOMON, D.MONOCHROMON, D.CENTARUMON, D.GURURUMON]);
setEvo(D.ELECMON, [D.TSUNOMON], [D.LEOMON, D.ANGEMON, D.BAKEMON, D.KUWAGAMON, D.GUARDROMON, D.FUGAMON]);
setEvo(D.PATAMON, [D.TOKOMON], [D.ANGEMON, D.UNIMON, D.OGREMON, D.LEOMON, D.TYRANNOMON, D.PIDDOMON]);
setEvo(D.KUNEMON, [D.TANEMON], [D.KABUTERIMON, D.KUWAGAMON, D.VEGIEMON, D.BAKEMON, D.DOKUNEMON, D.KOKATORIMON]);
setEvo(D.BIYOMON, [D.TOKOMON], [D.BIRDRAMON, D.AIRDRAMON, D.KABUTERIMON, D.UNIMON, D.SABERDRAMON, D.AKATORIMON]);
setEvo(D.PALMON, [D.TANEMON], [D.VEGIEMON, D.KOKATORIMON, D.MOJYAMON, D.WHAMON, D.REDVEGIEMON, D.WEEDMON]);
setEvo(D.PENGUINMON, [D.TSUNOMON], [D.FRIGIMON, D.MOJYAMON, D.SHELLMON, D.WHAMON, D.MUDFRIGIMON, D.ICEMON]);
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

  // Species missing from the old hand-written chart.
  setEvo(D.YANMAMON, [D.TENTOMON], [D.HERCULESKABUTERIMON, D.PIXIMON, D.GIROMON, D.MEGADRAMON]);
  setEvo(D.SHIMAUNIMON, [D.ELECMON], [D.PHOENIXMON, D.PIXIMON, D.ANDROMON]);
  setEvo(D.SHARMAMON, [D.TANEMON], [D.OGREMON, D.DEVIMON, D.FUGAMON, D.LEOMON]);
  setEvo(D.CLEARAGUMON, [D.TSUNOMON], [D.GREYMON, D.MONOCHROMON, D.TANKMON, D.CENTARUMON]);
  setEvo(D.SANDYANMAMON, [D.KUNEMON], [D.HERCULESKABUTERIMON, D.PIXIMON, D.GIROMON, D.MEGADRAMON]);
  setEvo(D.SNOWGOBURIMON, [D.TOKOMON], [D.FRIGIMON, D.MOJYAMON, D.HYOGAMON, D.OGREMON]);
  setEvo(D.VEEMON, [D.KOROMON], [D.GREYMON, D.ANGEMON, D.KABUTERIMON, D.GARURUMON, D.CENTARUMON, D.MONOCHROMON]);
  setEvo(D.KINGSUKAMON, [D.SUKAMON], []);
  setEvo(D.GOBURIMON_VARIANT, [], [D.OGREMON, D.FUGAMON, D.DEVIMON, D.LEOMON]);
  setEvo(D.DEMIMERAMON, [], [D.KOROMON]);

  // Make every added species reachable while retaining full six-target rows.
  replaceTarget(D.AGUMON, D.BIRDRAMON, D.FLARERIZAMON);
  replaceTarget(D.ELECMON, D.GUARDROMON, D.SHIMAUNIMON);
  replaceTarget(D.TANEMON, D.BETAMON, D.SHARMAMON);
  replaceTarget(D.GOBURIMON, D.MERAMON, D.DARKRIZAMON);
  replaceTarget(D.KUNEMON, D.KOKATORIMON, D.SANDYANMAMON);
  replaceTarget(D.PENGUINMON, D.MOJYAMON, D.J_MOJYAMON);
  addTarget(D.KOROMON, D.VEEMON);
  addTarget(D.TSUNOMON, D.CLEARAGUMON);
  addTarget(D.TOKOMON, D.SNOWGOBURIMON);
  addTarget(D.SUKAMON, D.KINGSUKAMON);
  addTarget(D.ANGEMON, D.JIJIMON);
  definitions.get(D.JIJIMON).from = [D.ANGEMON];

  // Only allow Fresh -> In-Training -> Rookie -> Champion -> Ultimate.
  for (const [source, row] of definitions) {
    row.to = [...new Set(row.to)].filter((target) => {
      if (target < 1 || target > 127) throw new Error(`Invalid evolution target ${source} -> ${target}`);
      return levels[target] === levels[source] + 1;
    });
  }

  // Keep reverse lists within the engine's five-entry limit. The declared
  // predecessor order is used as the priority when a choice is necessary.
  const incoming = new Map();
  for (const [source, row] of definitions) {
    for (const target of row.to) {
      if (!incoming.has(target)) incoming.set(target, []);
      incoming.get(target).push(source);
    }
  }
  for (const [target, sources] of incoming) {
    if (sources.length <= 5) continue;
    const preferred = definitions.get(target)?.from ?? [];
    const rank = (source) => {
      const index = preferred.indexOf(source);
      return index < 0 ? preferred.length + sources.indexOf(source) : index;
    };
    const keep = [...sources].sort((a, b) => rank(a) - rank(b)).slice(0, 5);
    for (const source of sources) {
      if (!keep.includes(source)) {
        const row = definitions.get(source);
        row.to = row.to.filter((candidate) => candidate !== target);
      }
    }
  }

  const forward = Array.from({ length: 128 }, () => []);
  const reverse = Array.from({ length: 128 }, () => []);
  for (const [source, row] of definitions) {
    forward[source] = [...row.to];
    for (const target of row.to) reverse[target].push(source);
  }

  const paths = Buffer.alloc(128 * 11, 0xFF);
  for (let id = 1; id <= 127; id++) {
    const offset = (id - 1) * 11;
    for (let i = 0; i < reverse[id].length; i++) paths[offset + i] = reverse[id][i];
    for (let i = 0; i < forward[id].length; i++) paths[offset + 5 + i] = forward[id][i];
  }

  const starters = STARTER_NAMES.map((name) => resolve(name));
  const reachable = new Set([1, 15, 29, 43, 11, 39, 53, 73, 87, ...starters, ...ITEM_TARGET_SPECIES]);
  const queue = [...reachable];
  while (queue.length) {
    const source = queue.shift();
    for (const target of forward[source]) {
      if (!reachable.has(target)) {
        reachable.add(target);
        queue.push(target);
      }
    }
  }
  const unreachable = [];
  for (let id = 1; id <= 127; id++) {
    if (id === 116 || id === 118) continue; // Human NPC models, not natural Digimon.
    if (!reachable.has(id)) unreachable.push(`${id} ${db.digimon[id].name}`);
  }
  if (unreachable.length) throw new Error(`Unreachable natural Digimon: ${unreachable.join(', ')}`);

  for (let id = 1; id <= 127; id++) {
    if (forward[id].length > 6 || reverse[id].length > 5) throw new Error(`Path capacity exceeded for ${db.digimon[id].name}`);
    for (const target of forward[id]) {
      if (levels[target] !== levels[id] + 1) throw new Error(`Invalid stage edge ${id} -> ${target}`);
    }
  }

  return { paths, forward, reverse, starters, levels, reachable };
}

function copyEntry(target, targetId, sourceId, stride) {
  target.copy(target, targetId * stride, sourceId * stride, (sourceId + 1) * stride);
}

export function buildExpandedTables(sles, db, graph = buildEvolutionGraph(db)) {
  const raise = Buffer.alloc(TABLES.raise.newCount * TABLES.raise.stride);
  const reqs = Buffer.alloc(TABLES.reqs.newCount * TABLES.reqs.stride);
  const stats = Buffer.alloc(TABLES.stats.newCount * TABLES.stats.stride);

  sles.copy(raise, 0, TABLES.raise.oldAddress - SLES_VRAM_BASE, TABLES.raise.oldAddress - SLES_VRAM_BASE + TABLES.raise.oldSize);
  sles.copy(reqs, 0, TABLES.reqs.oldAddress - SLES_VRAM_BASE, TABLES.reqs.oldAddress - SLES_VRAM_BASE + TABLES.reqs.oldSize);
  sles.copy(stats, 0, TABLES.stats.oldAddress - SLES_VRAM_BASE, TABLES.stats.oldAddress - SLES_VRAM_BASE + TABLES.stats.oldSize);

  const templateForLevel = [3, 1, 2, 3, 5, 12];
  for (let id = 66; id <= 127; id++) {
    const level = graph.levels[id] || 4;
    copyEntry(raise, id, templateForLevel[level], TABLES.raise.stride);
  }
  for (let id = 63; id <= 127; id++) {
    const level = graph.levels[id] || 4;
    copyEntry(reqs, id, templateForLevel[level], TABLES.reqs.stride);
    reqs.writeInt16LE(-1, id * TABLES.reqs.stride); // No forced predecessor bonus.
  }
  for (let id = 66; id <= 127; id++) {
    const level = graph.levels[id] || 4;
    copyEntry(stats, id, templateForLevel[level], TABLES.stats.stride);
    stats.writeInt16LE(id, id * TABLES.stats.stride + 12);
  }

  const starter = Buffer.from(graph.starters);
  const expanded = Buffer.concat([raise, reqs, stats, graph.paths, starter]);
  if (expanded.length !== MEMORY.RESERVED_END - MEMORY.RAISE_DATA) {
    throw new Error(`Expanded table size ${expanded.length} does not match reserved block ${MEMORY.RESERVED_END - MEMORY.RAISE_DATA}`);
  }
  return { expanded, raise, reqs, stats, paths: graph.paths, starter };
}

export function compressExpansion(data) {
  const commands = [];
  const positions = new Map();
  let literalStart = 0;

  const flushLiteral = (end) => {
    let position = literalStart;
    while (position < end) {
      const length = Math.min(64, end - position);
      commands.push(Buffer.concat([Buffer.from([length - 1]), data.subarray(position, position + length)]));
      position += length;
    }
  };

  let position = 0;
  while (position < data.length) {
    let runLength = 1;
    while (position + runLength < data.length && data[position + runLength] === data[position] && runLength < 66) runLength++;

    let bestLength = 0;
    let bestOffset = 0;
    if (position + 3 <= data.length) {
      const key = data.subarray(position, position + 3).toString('hex');
      const candidates = positions.get(key) ?? [];
      for (let i = candidates.length - 1; i >= 0 && i >= candidates.length - 48; i--) {
        const candidate = candidates[i];
        const offset = position - candidate;
        if (offset > 0xFFFF) break;
        let length = 0;
        while (length < 66 && position + length < data.length && data[candidate + length] === data[position + length]) length++;
        if (length > bestLength) {
          bestLength = length;
          bestOffset = offset;
          if (length === 66) break;
        }
      }
    }

    if (runLength >= 3 && runLength >= bestLength) {
      flushLiteral(position);
      commands.push(Buffer.from([0x40 | (runLength - 3), data[position]]));
      for (let i = 0; i < runLength; i++) {
        const at = position + i;
        if (at + 3 <= data.length) {
          const key = data.subarray(at, at + 3).toString('hex');
          if (!positions.has(key)) positions.set(key, []);
          positions.get(key).push(at);
        }
      }
      position += runLength;
      literalStart = position;
      continue;
    }

    if (bestLength >= 3) {
      flushLiteral(position);
      if (bestOffset <= 0xFF) {
        commands.push(Buffer.from([0x80 | (bestLength - 3), bestOffset]));
      } else {
        const command = Buffer.from([0xC0 | (bestLength - 3), bestOffset & 0xFF, bestOffset >>> 8]);
        commands.push(command);
      }
      for (let i = 0; i < bestLength; i++) {
        const at = position + i;
        if (at + 3 <= data.length) {
          const key = data.subarray(at, at + 3).toString('hex');
          if (!positions.has(key)) positions.set(key, []);
          positions.get(key).push(at);
        }
      }
      position += bestLength;
      literalStart = position;
      continue;
    }

    if (position + 3 <= data.length) {
      const key = data.subarray(position, position + 3).toString('hex');
      if (!positions.has(key)) positions.set(key, []);
      positions.get(key).push(position);
    }
    position++;
  }
  flushLiteral(data.length);
  return commands;
}

export function splitCompressedCommands(commands) {
  const first = [];
  const second = [];
  let firstLength = 0;
  let secondLength = 0;
  for (const command of commands) {
    if (second.length === 0 && firstLength + command.length <= TABLES.raise.oldSize) {
      first.push(command);
      firstLength += command.length;
    } else {
      second.push(command);
      secondLength += command.length;
    }
  }
  const secondCapacity = TABLES.reqs.oldSize + TABLES.stats.oldSize + TABLES.paths.oldSize;
  if (secondLength > secondCapacity) {
    throw new Error(`Compressed expansion needs ${secondLength} bytes in the evolution source area; only ${secondCapacity} are available`);
  }
  return {
    first: Buffer.concat(first),
    second: Buffer.concat(second),
    firstEndAddress: TABLES.raise.oldAddress + firstLength,
    totalLength: firstLength + secondLength,
    capacity: TABLES.raise.oldSize + secondCapacity,
  };
}

export function decompressExpansion(first, second, outputLength = MEMORY.RESERVED_END - MEMORY.RAISE_DATA) {
  const output = Buffer.alloc(outputLength);
  let source = first;
  let sourceOffset = 0;
  let destination = 0;

  while (destination < outputLength) {
    if (source === first && sourceOffset === source.length) {
      source = second;
      sourceOffset = 0;
    }
    if (sourceOffset >= source.length) throw new Error('Compressed expansion ended prematurely');
    const command = source[sourceOffset++];
    const type = command & 0xC0;
    if (type === 0) {
      const length = (command & 0x3F) + 1;
      if (sourceOffset + length > source.length || destination + length > outputLength) throw new Error('Invalid literal command');
      source.copy(output, destination, sourceOffset, sourceOffset + length);
      sourceOffset += length;
      destination += length;
    } else if (type === 0x40) {
      const length = (command & 0x3F) + 3;
      const value = source[sourceOffset++];
      if (destination + length > outputLength) throw new Error('Invalid fill command');
      output.fill(value, destination, destination + length);
      destination += length;
    } else {
      const length = (command & 0x3F) + 3;
      let offset = source[sourceOffset++];
      if (type === 0xC0) offset |= source[sourceOffset++] << 8;
      if (offset === 0 || offset > destination || destination + length > outputLength) throw new Error('Invalid back-reference command');
      for (let i = 0; i < length; i++) output[destination + i] = output[destination - offset + i];
      destination += length;
    }
  }
  return output;
}

function signed16(value) {
  return value & 0x8000 ? value - 0x10000 : value;
}

function addressParts(address, signed) {
  const high = ((signed ? address + 0x8000 : address) >>> 16) & 0xFFFF;
  return { high, low: address & 0xFFFF };
}

class MipsAssembly {
  constructor(regions) {
    this.regions = regions;
    this.labels = new Map();
    this.fixups = [];
    for (const [name, region] of Object.entries(regions)) {
      this[name] = { ...region, words: [], name };
    }
  }

  label(region, name) {
    if (this.labels.has(name)) throw new Error(`Duplicate MIPS label ${name}`);
    this.labels.set(name, { region, index: this[region].words.length });
  }

  addressOf(name) {
    const label = this.labels.get(name);
    if (!label) throw new Error(`Unknown MIPS label ${name}`);
    return this.regions[label.region].address + label.index * 4;
  }

  emit(region, word) {
    this[region].words.push(word >>> 0);
  }

  lui(region, rt, immediate) { this.emit(region, 0x3C000000 | (rt << 16) | (immediate & 0xFFFF)); }
  addiu(region, rt, rs, immediate) { this.emit(region, 0x24000000 | (rs << 21) | (rt << 16) | (immediate & 0xFFFF)); }
  andi(region, rt, rs, immediate) { this.emit(region, 0x30000000 | (rs << 21) | (rt << 16) | (immediate & 0xFFFF)); }
  addu(region, rd, rs, rt) { this.emit(region, 0x21 | (rs << 21) | (rt << 16) | (rd << 11)); }
  subu(region, rd, rs, rt) { this.emit(region, 0x23 | (rs << 21) | (rt << 16) | (rd << 11)); }
  or(region, rd, rs, rt) { this.emit(region, 0x25 | (rs << 21) | (rt << 16) | (rd << 11)); }
  sll(region, rd, rt, shift) { this.emit(region, (rt << 16) | (rd << 11) | (shift << 6)); }
  lbu(region, rt, rs, immediate = 0) { this.emit(region, 0x90000000 | (rs << 21) | (rt << 16) | (immediate & 0xFFFF)); }
  lb(region, rt, rs, immediate = 0) { this.emit(region, 0x80000000 | (rs << 21) | (rt << 16) | (immediate & 0xFFFF)); }
  sb(region, rt, rs, immediate = 0) { this.emit(region, 0xA0000000 | (rs << 21) | (rt << 16) | (immediate & 0xFFFF)); }
  sh(region, rt, rs, immediate = 0) { this.emit(region, 0xA4000000 | (rs << 21) | (rt << 16) | (immediate & 0xFFFF)); }
  jr(region, rs) { this.emit(region, (rs << 21) | 0x08); }
  move(region, rd, rs) { this.addu(region, rd, rs, 0); }
  nop(region) { this.emit(region, 0); }

  branch(region, opcode, rs, rt, label) {
    this.fixups.push({ kind: 'branch', region, index: this[region].words.length, opcode, rs, rt, label });
    this.emit(region, 0);
  }
  beq(region, rs, rt, label) { this.branch(region, 0x10000000, rs, rt, label); }
  bne(region, rs, rt, label) { this.branch(region, 0x14000000, rs, rt, label); }
  b(region, label) { this.beq(region, 0, 0, label); }

  jump(region, opcode, labelOrAddress) {
    this.fixups.push({ kind: 'jump', region, index: this[region].words.length, opcode, labelOrAddress });
    this.emit(region, 0);
  }
  j(region, labelOrAddress) { this.jump(region, 0x08000000, labelOrAddress); }

  liAddress(region, register, address) {
    const { high, low } = addressParts(address, true);
    this.lui(region, register, high);
    this.addiu(region, register, register, signed16(low));
  }

  finish() {
    for (const fixup of this.fixups) {
      if (fixup.kind === 'branch') {
        const target = this.addressOf(fixup.label);
        const source = this.regions[fixup.region].address + fixup.index * 4;
        if (this.labels.get(fixup.label).region !== fixup.region) throw new Error(`Conditional branch crosses code caves: ${fixup.label}`);
        const displacement = (target - (source + 4)) / 4;
        if (!Number.isInteger(displacement) || displacement < -0x8000 || displacement > 0x7FFF) throw new Error(`Branch out of range: ${fixup.label}`);
        this[fixup.region].words[fixup.index] = (fixup.opcode | (fixup.rs << 21) | (fixup.rt << 16) | (displacement & 0xFFFF)) >>> 0;
      } else {
        const address = typeof fixup.labelOrAddress === 'number' ? fixup.labelOrAddress : this.addressOf(fixup.labelOrAddress);
        this[fixup.region].words[fixup.index] = (fixup.opcode | ((address >>> 2) & 0x03FFFFFF)) >>> 0;
      }
    }

    const output = {};
    for (const [name, region] of Object.entries(this.regions)) {
      const words = this[name].words;
      if (words.length * 4 > region.size) throw new Error(`${name} decompressor cave overflow: ${words.length * 4} > ${region.size}`);
      const bytes = Buffer.alloc(words.length * 4);
      words.forEach((word, index) => bytes.writeUInt32LE(word, index * 4));
      output[name] = { ...region, bytes, words };
    }
    return output;
  }
}

export function buildDecompressor(firstEndAddress) {
  const assembly = new MipsAssembly(DECOMPRESSOR_CAVES);
  const r = { at: 1, v0: 2, v1: 3, a2: 6, t0: 8, t1: 9, t2: 10, t3: 11, t4: 12, t5: 13, t6: 14, t7: 15 };

  assembly.liAddress('main', r.t0, TABLES.raise.oldAddress);
  assembly.liAddress('main', r.t1, firstEndAddress);
  assembly.liAddress('main', r.t2, TABLES.reqs.oldAddress);
  assembly.liAddress('main', r.t3, MEMORY.RAISE_DATA);
  assembly.liAddress('main', r.t4, MEMORY.RESERVED_END);

  assembly.label('main', 'mainLoop');
  assembly.beq('main', r.t3, r.t4, 'done');
  assembly.nop('main');
  assembly.beq('main', r.t0, r.t1, 'switchSource');
  assembly.nop('main');
  assembly.j('main', 'command');
  assembly.nop('main');

  assembly.label('main', 'switchSource');
  assembly.move('main', r.t0, r.t2);
  assembly.b('main', 'mainLoop');
  assembly.nop('main');

  assembly.label('main', 'done');
  assembly.j('main', 0x80091074); // Tail-call InitHeap3 with a0/a1/ra intact.
  assembly.nop('main');

  assembly.label('main', 'literal');
  assembly.lbu('main', r.v1, r.t0);
  assembly.addiu('main', r.t0, r.t0, 1);
  assembly.sb('main', r.v1, r.t3);
  assembly.addiu('main', r.t3, r.t3, 1);
  assembly.addiu('main', r.t5, r.t5, -1);
  assembly.bne('main', r.t5, 0, 'literal');
  assembly.nop('main');
  assembly.b('main', 'mainLoop');
  assembly.nop('main');

  assembly.label('main', 'fill');
  assembly.lbu('main', r.v1, r.t0);
  assembly.addiu('main', r.t0, r.t0, 1);
  assembly.label('main', 'fillLoop');
  assembly.sb('main', r.v1, r.t3);
  assembly.addiu('main', r.t3, r.t3, 1);
  assembly.addiu('main', r.t5, r.t5, -1);
  assembly.bne('main', r.t5, 0, 'fillLoop');
  assembly.nop('main');
  assembly.b('main', 'mainLoop');
  assembly.nop('main');

  assembly.label('commands', 'command');
  assembly.lbu('commands', r.v0, r.t0);
  assembly.addiu('commands', r.t0, r.t0, 1);
  assembly.andi('commands', r.t5, r.v0, 0x3F);
  assembly.addiu('commands', r.t5, r.t5, 1);
  assembly.andi('commands', r.a2, r.v0, 0xC0);
  assembly.bne('commands', r.a2, 0, 'nonLiteral');
  assembly.nop('commands');
  assembly.j('commands', 'literal');
  assembly.nop('commands');

  assembly.label('commands', 'nonLiteral');
  assembly.addiu('commands', r.t5, r.t5, 2);
  assembly.addiu('commands', r.at, 0, 0x40);
  assembly.bne('commands', r.a2, r.at, 'notFill');
  assembly.nop('commands');
  assembly.j('commands', 'fill');
  assembly.nop('commands');

  assembly.label('commands', 'notFill');
  assembly.addiu('commands', r.at, 0, 0x80);
  assembly.bne('commands', r.a2, r.at, 'back16');
  assembly.nop('commands');
  assembly.lbu('commands', r.t7, r.t0);
  assembly.addiu('commands', r.t0, r.t0, 1);
  assembly.b('commands', 'backSetup');
  assembly.nop('commands');

  assembly.label('commands', 'back16');
  assembly.lbu('commands', r.t7, r.t0);
  assembly.lbu('commands', r.at, r.t0, 1);
  assembly.sll('commands', r.at, r.at, 8);
  assembly.or('commands', r.t7, r.t7, r.at);
  assembly.addiu('commands', r.t0, r.t0, 2);

  assembly.label('commands', 'backSetup');
  assembly.subu('commands', r.t6, r.t3, r.t7);
  assembly.label('commands', 'backLoop');
  assembly.lbu('commands', r.v1, r.t6);
  assembly.addiu('commands', r.t6, r.t6, 1);
  assembly.sb('commands', r.v1, r.t3);
  assembly.addiu('commands', r.t3, r.t3, 1);
  assembly.addiu('commands', r.t5, r.t5, -1);
  assembly.bne('commands', r.t5, 0, 'backLoop');
  assembly.nop('commands');
  assembly.j('commands', 'mainLoop');
  assembly.nop('commands');

  return assembly.finish();
}

export function relocateTableReferences(buffer, textRange) {
  const counts = { raise: 0, reqs: 0, stats: 0, paths: 0 };
  for (let offset = textRange.start; offset + 8 <= textRange.end; offset += 4) {
    const first = buffer.readUInt32LE(offset);
    const second = buffer.readUInt32LE(offset + 4);
    if (first >>> 26 !== 0x0F) continue;
    const register = (first >>> 16) & 31;
    const secondOpcode = second >>> 26;
    if (![0x09, 0x0D].includes(secondOpcode) || ((second >>> 21) & 31) !== register) continue;
    const signed = secondOpcode === 0x09;
    const low = second & 0xFFFF;
    const address = (((first & 0xFFFF) << 16) + (signed ? signed16(low) : low)) >>> 0;
    for (const [name, table] of Object.entries(TABLES)) {
      if (address < table.oldAddress || address >= table.oldAddress + table.oldSize) continue;
      const relocated = table.newAddress + (address - table.oldAddress);
      const parts = addressParts(relocated, signed);
      buffer.writeUInt32LE((first & 0xFFFF0000) | parts.high, offset);
      buffer.writeUInt32LE((second & 0xFFFF0000) | parts.low, offset + 4);
      counts[name]++;
      break;
    }
  }
  return counts;
}

export function assertExpectedReferences(fileName, counts) {
  const expected = EXPECTED_REFERENCES[fileName] ?? { raise: 0, reqs: 0, stats: 0, paths: 0 };
  for (const name of Object.keys(TABLES)) {
    if (counts[name] !== expected[name]) {
      throw new Error(`${fileName} ${name}: redirected ${counts[name]} references, expected ${expected[name]}`);
    }
  }
}

export function buildFreshEvolutionRoutine() {
  const assembly = new MipsAssembly({ fresh: { address: 0x800FC908, size: 29 * 4 } });
  const r = { at: 1, v0: 2, a0: 4, t0: 8, t1: 9, ra: 31 };
  assembly.addiu('fresh', r.t0, r.a0, -1);
  assembly.sll('fresh', r.t1, r.t0, 1);
  assembly.addu('fresh', r.t1, r.t1, r.t0);
  assembly.sll('fresh', r.t0, r.t0, 3);
  assembly.addu('fresh', r.t0, r.t0, r.t1); // 11 * (speciesId - 1)
  assembly.liAddress('fresh', r.t1, MEMORY.EVOLUTION_PATHS);
  assembly.addu('fresh', r.t0, r.t0, r.t1);
  assembly.lb('fresh', r.v0, r.t0, 5); // First forward target; -1 when absent.
  assembly.lui('fresh', r.at, 0x8014);
  assembly.sh('fresh', 0, r.at, -0x582); // evoTimer = 0 at 0x8013FA7E.
  assembly.jr('fresh', r.ra);
  assembly.nop('fresh');
  return assembly.finish().fresh.bytes;
}

export function buildStarterRoutine() {
  const assembly = new MipsAssembly({ starter: { address: 0x80114B84, size: 6 * 4 } });
  const r = { v0: 2, s0: 16 };
  assembly.andi('starter', r.v0, r.v0, 0x0F);
  assembly.liAddress('starter', r.s0, MEMORY.STARTER_ROSTER);
  assembly.addu('starter', r.s0, r.s0, r.v0);
  assembly.lbu('starter', r.s0, r.s0);
  assembly.nop('starter');
  return assembly.finish().starter.bytes;
}

export const SPECIES_RECORD_BASE = 0xA8B5C;
export const MODEL_CODE_TABLE = 0xAAC0C;

const SPECIALTY_MOVES = Object.freeze({
  0: [0, 1, 2, 3, 4, 5, 6],
  1: [16, 17, 18, 19, 20, 21, 22],
  2: [7, 8, 9, 10, 11, 12, 13],
  3: [24, 25, 26, 27, 28, 29],
  4: [30, 31, 32, 33, 34, 35],
  5: [37, 38, 39, 40, 41],
  6: [42, 43, 44, 45],
});

const SPECIALTY_FALLBACKS = Object.freeze({
  62: [1, 4], // Waregarurumon
  114: [1, 0], // Veemon stand-in
  117: [1, 2],
  119: [4, 2],
  121: [3, 1],
  122: [5, 2],
  123: [5, 1],
  124: [0, 1],
  126: [3, 4],
  127: [0],
});

const RARE_EVO_ITEMS = Object.freeze([
  125, 126, 127, 114, 83, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113,
  71, 72, 73, 78, 79, 80, 81, 84, 87, 88, 90, 91, 95,
]);

function encodeFullWidthName(name) {
  const bytes = [];
  for (const character of name) {
    let value;
    if (character >= 'A' && character <= 'Z') value = 0x60 + character.charCodeAt(0) - 65;
    else if (character >= 'a' && character <= 'z') value = 0x81 + character.charCodeAt(0) - 97;
    else throw new Error(`Unsupported full-width name character: ${character}`);
    bytes.push(0x82, value);
  }
  return Buffer.from(bytes);
}

export function patchSpeciesRecords(sles, db) {
  for (const [idText, level] of Object.entries(LEVEL_OVERRIDES)) {
    const id = Number(idText);
    sles[SPECIES_RECORD_BASE + id * 32 + 9] = level;
  }
  sles[SPECIES_RECORD_BASE + 114 * 32 + 8] = 2; // Veemon: Vaccine.
  sles[SPECIES_RECORD_BASE + 115 * 32 + 8] = 3; // Machinedramon: Virus.

  let generatedMovesets = 0;
  for (let id = 62; id <= 127; id++) {
    if (id === 116 || id === 118) continue; // Human NPCs are not partner species.
    const offset = SPECIES_RECORD_BASE + id * 32;
    const level = sles[offset + 9];
    const originalMoves = Array.from(sles.subarray(offset + 15, offset + 31));
    let moves;

    if (level <= 2) {
      // Fresh/In-Training species use baby techniques 113..120, not normal finishers.
      const baby = originalMoves.find((move) => move >= 113 && move <= 120) ?? 120;
      moves = [baby, ...Array(15).fill(0xFF)];
    } else {
      const uninitialized = originalMoves.every((move) => move === 0);
      const valid = uninitialized ? [] : originalMoves.filter((move) => move !== 0xFF && move <= 120);
      const regular = [...new Set(valid.filter((move) => move < 58))];
      let specialties = [sles[offset + 10], sles[offset + 11], sles[offset + 12]].filter((specialty) => specialty <= 6);
      if (specialties.length === 0) {
        specialties = SPECIALTY_FALLBACKS[id] ?? [0, 1, 2];
        sles[offset + 10] = specialties[0];
        sles[offset + 11] = specialties[1] ?? 0xFF;
        sles[offset + 12] = specialties[2] ?? 0xFF;
      }
      const pool = [...specialties.flatMap((specialty) => SPECIALTY_MOVES[specialty]), ...SPECIALTY_MOVES[0], ...SPECIALTY_MOVES[1], ...SPECIALTY_MOVES[2]];
      for (const move of pool) {
        if (regular.length >= 15) break;
        if (!regular.includes(move)) regular.push(move);
      }
      const existingFinisher = valid.find((move) => move >= 58 && move <= 112);
      const finisher = existingFinisher ?? db.techniques.find((technique) => technique.id >= 58 && technique.id <= 112 && technique.specialtyId === specialties[0])?.id ?? 58;
      moves = [...regular.slice(0, 15)];
      while (moves.length < 15) moves.push(0xFF);
      moves.push(finisher);
    }

    if (moves.length !== 16 || moves.some((move) => move !== 0xFF && move > 120)) throw new Error(`Invalid generated moveset for ${db.digimon[id].name}`);
    sles.set(moves, offset + 15);
    generatedMovesets++;

    if (sles[offset + 14] < 40) {
      sles[offset + 13] = RARE_EVO_ITEMS[(id - 62) % RARE_EVO_ITEMS.length];
      sles[offset + 14] = 65;
    }
  }

  // Item target bytes cover items 71..114. The vanilla item handlers are
  // already correct; only Elec Ring 83 lacks its Guardromon target.
  sles[0xA10D8 + (83 - 71)] = 92;

  // Slot 114 is an unused "Digimon" entry. Reuse its 16-byte name field and
  // Agumon's eight-byte model code for the Veemon stand-in.
  const nameOffset = Number(db.digimon[114].namePtr) - SLES_VRAM_BASE;
  const nextNameOffset = Number(db.digimon[115].namePtr) - SLES_VRAM_BASE;
  const encodedName = encodeFullWidthName('Veemon');
  if (nameOffset !== 0xA89D0 || nextNameOffset - nameOffset < encodedName.length + 1) throw new Error('Unexpected slot 114 name layout');
  sles.fill(0, nameOffset, nextNameOffset);
  encodedName.copy(sles, nameOffset);
  sles[nameOffset + encodedName.length] = 0;

  const agumonModel = MODEL_CODE_TABLE + 3 * 8;
  const veemonModel = MODEL_CODE_TABLE + 114 * 8;
  if (sles.toString('ascii', agumonModel, agumonModel + 4) !== 'AGUM') throw new Error('Unexpected Agumon model code');
  sles.copy(sles, veemonModel, agumonModel, agumonModel + 8);
  if (sles.toString('ascii', MODEL_CODE_TABLE + 62 * 8, MODEL_CODE_TABLE + 62 * 8 + 4) !== 'wEAG') {
    throw new Error('Waregarurumon must retain its wEAG model code');
  }

  return { generatedMovesets };
}

export function repairMmdAnimations(input) {
  const mmd = Buffer.from(input);
  if (mmd.length < 8) return { data: mmd, modified: false, slots: 0 };
  const animationOffset = mmd.readUInt32LE(4);
  if (animationOffset === 0 || animationOffset + 4 > mmd.length) return { data: mmd, modified: false, slots: 0 };
  const firstOffset = mmd.readUInt32LE(animationOffset);
  const slots = Math.floor(firstOffset / 4);
  if (slots < 5 || slots > 80 || animationOffset + firstOffset > mmd.length) return { data: mmd, modified: false, slots: 0 };
  const values = Array.from({ length: slots }, (_, index) => mmd.readUInt32LE(animationOffset + index * 4));
  const slot = (index) => index < slots ? values[index] : 0;
  const idle0 = slot(0) || firstOffset;
  const idle1 = slot(1) || idle0;
  const walk2 = slot(2) || idle1;
  const run4 = slot(4) || walk2;
  const emote19 = slot(19) || slot(40) || idle1;
  const attack40 = slot(40) || emote19;
  const win44 = slot(44) || emote19;
  const hit46 = slot(46) || idle1;
  const down47 = slot(47) || idle1;
  let modified = false;

  for (let index = 0; index < slots; index++) {
    if (values[index] !== 0) continue;
    let replacement = idle1;
    if (index === 3) replacement = run4;
    else if (index === 5 || index === 6) replacement = emote19;
    else if (index === 7 || index === 8) replacement = win44;
    else if (index === 9 || index === 10) replacement = hit46;
    else if (index >= 11 && index <= 13) replacement = down47;
    else if (index >= 14 && index <= 18) replacement = idle1;
    else if (index >= 20 && index <= 32) replacement = attack40;
    else if (index >= 33 && index <= 39) replacement = walk2;
    else if (index >= 40) replacement = attack40;
    mmd.writeUInt32LE(replacement, animationOffset + index * 4);
    modified = true;
  }
  return { data: mmd, modified, slots };
}

export function sha1(buffer) {
  return createHash('sha1').update(buffer).digest('hex');
}
