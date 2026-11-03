import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOT_FILE = path.join(ROOT, 'public', 'emulator-boot.js');
const SW_FILE = path.join(ROOT, 'public', 'sw.js');
const SERVER_FILE = path.join(ROOT, 'server.mjs');
const BIOS_FILE = path.join(ROOT, 'public', 'bios', 'openbios.bin');
const DISC_PATCH_FILE = path.join(ROOT, 'public', 'rom', 'disc-patch-v2.json');
const VERCEL_JSON = path.join(ROOT, 'vercel.json');
const VERCEL_IGNORE = path.join(ROOT, '.vercelignore');
const OPENBIOS_BYTES = fs.readFileSync(BIOS_FILE);
const DISC_PATCH_JSON = fs.readFileSync(DISC_PATCH_FILE, 'utf8');
const FALLBACK_ROM_BASE =
  'https://raw.githubusercontent.com/LIN4CRE/DigimonWorld1Web/main/public/rom/';

class ElementStub {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.parentNode = null;
    this.textContent = '';
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }
  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }
  setAttribute() {}
  click() {}
}

function createDocument({ withSaveBar = false } = {}) {
  const ids = new Set(['loader-status', 'progress-bar', 'loader-overlay']);
  if (withSaveBar) {
    ids.add('save-bar');
    ids.add('save-toast');
    ids.add('save-indicator');
    ids.add('save-indicator-text');
    ids.add('btn-export');
    ids.add('btn-export-state');
    ids.add('btn-import');
    ids.add('btn-restore');
    ids.add('btn-restart');
    ids.add('save-file');
  }
  const elements = new Map([...ids].map((id) => [id, new ElementStub()]));
  const document = {
    documentElement: new ElementStub('html'),
    body: new ElementStub('body'),
    head: new ElementStub('head'),
    getElementById(id) {
      return elements.get(id) || null;
    },
    createElement(tagName) {
      return new ElementStub(tagName);
    },
    addEventListener() {},
    removeEventListener() {},
    elements
  };
  return document;
}

function createLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get length() {
      return store.size;
    },
    key(index) {
      return [...store.keys()][index] ?? null;
    },
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };
}

function createMockIndexedDB(initialDatabases = {}) {
  const dbs = new Map();
  for (const [dbName, stores] of Object.entries(initialDatabases)) {
    const storeMap = new Map();
    for (const [storeName, data] of Object.entries(stores)) {
      const records = new Map(
        data instanceof Map
          ? data
          : Array.isArray(data)
          ? data.map((item) => [item.id || item.ts || item.name, item])
          : Object.entries(data)
      );
      storeMap.set(storeName, records);
    }
    dbs.set(dbName, storeMap);
  }

  return {
    open(name) {
      if (!dbs.has(name)) dbs.set(name, new Map());
      const storeMap = dbs.get(name);
      const req = {
        result: {
          objectStoreNames: {
            contains(s) {
              return storeMap.has(s);
            }
          },
          createObjectStore(s) {
            if (!storeMap.has(s)) storeMap.set(s, new Map());
          },
          transaction(stores) {
            const sName = Array.isArray(stores) ? stores[0] : stores;
            if (!storeMap.has(sName)) storeMap.set(sName, new Map());
            const data = storeMap.get(sName);
            const tx = {
              objectStore() {
                return {
                  get(key) {
                    const r = { result: data.get(key) };
                    setTimeout(() => { if (r.onsuccess) r.onsuccess(); }, 0);
                    return r;
                  },
                  put(val, key) {
                    const actualKey = key !== undefined ? key : (val && (val.id || val.ts || val.name));
                    data.set(actualKey, val);
                    const r = { result: actualKey };
                    setTimeout(() => { if (r.onsuccess) r.onsuccess(); }, 0);
                    return r;
                  },
                  delete(key) {
                    data.delete(key);
                    const r = {};
                    setTimeout(() => { if (r.onsuccess) r.onsuccess(); }, 0);
                    return r;
                  },
                  getAll() {
                    const r = { result: [...data.values()] };
                    setTimeout(() => { if (r.onsuccess) r.onsuccess(); }, 0);
                    return r;
                  },
                  getAllKeys() {
                    const r = { result: [...data.keys()] };
                    setTimeout(() => { if (r.onsuccess) r.onsuccess(); }, 0);
                    return r;
                  }
                };
              },
              oncomplete: null,
              onerror: null,
              onabort: null
            };
            setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
            return tx;
          }
        },
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null
      };
      setTimeout(() => {
        if (req.onupgradeneeded) req.onupgradeneeded({ target: req });
        if (req.onsuccess) req.onsuccess();
      }, 0);
      return req;
    }
  };
}

function makeResponse(data, { ok = true, status = 200, json } = {}) {
  const bytes = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : new Uint8Array(data);
  return {
    ok,
    status,
    async json() {
      return json !== undefined ? json : JSON.parse(new TextDecoder().decode(bytes));
    },
    async blob() {
      return new Blob([bytes]);
    },
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
    body: {
      getReader() {
        let sent = false;
        return {
          async read() {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: bytes };
          }
        };
      }
    }
  };
}

async function waitFor(predicate, timeoutMs = 1500) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for boot');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function runBoot(options = {}) {
  const chunkBytes = new Uint8Array([0x44, 0x57, 0x31]);
  const manifest = {
    fileName: 'Digimon World (Europe).zip',
    totalSize: chunkBytes.byteLength,
    chunks: [{
      name: 'part0.bin',
      size: chunkBytes.byteLength,
      sha256: createHash('sha256').update(chunkBytes).digest('hex')
    }],
    version: 'test'
  };

  const document = createDocument({ withSaveBar: options.withSaveBar });
  const localStorage = createLocalStorage(options.localStorage);
  const fetchCalls = [];
  const location = new URL(options.pageUrl || 'https://example.test/');
  const manifestBase = options.manifestBase || '';

  const fetch = async (url) => {
    const href = String(url);
    fetchCalls.push(href);
    const fromExpectedBase = !manifestBase || href.startsWith(manifestBase);
    if (href.includes('/bios/openbios.bin')) {
      return makeResponse(options.openBiosBytes || OPENBIOS_BYTES);
    }
    if (href.includes('/disc-patch-v2.json')) {
      return makeResponse(options.patchJson === undefined ? DISC_PATCH_JSON : options.patchJson);
    }
    if (href.endsWith('/manifest.json') && fromExpectedBase) {
      return makeResponse('', { json: manifest });
    }
    if (href.endsWith('/part0.bin') && fromExpectedBase) {
      return makeResponse(chunkBytes);
    }
    return makeResponse('', { ok: false, status: 404 });
  };

  const context = {
    document,
    location,
    fetch,
    localStorage,
    navigator: {},
    indexedDB: options.indexedDB || {
      open() {
        throw new Error('IndexedDB disabled in tests');
      }
    },
    crypto: webcrypto,
    Blob,
    File,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    setInterval: (fn, ms) => {
      const t = setInterval(fn, ms);
      if (t && typeof t.unref === 'function') t.unref();
      return t;
    },
    clearInterval,
    confirm: () => true,
    addEventListener() {},
    removeEventListener() {},
    console: {
      log() {},
      warn() {},
      error() {},
      debug() {}
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(BOOT_FILE, 'utf8'), context, { filename: 'emulator-boot.js' });
  await waitFor(() =>
    (context.EJS_biosUrl instanceof File && context.DW1_DISC_PATCH) ||
    context.document.getElementById('loader-status').textContent.startsWith('Error') ||
    (context.DW1_BOOT_DIAGNOSTICS && context.DW1_BOOT_DIAGNOSTICS.stages.boot && context.DW1_BOOT_DIAGNOSTICS.stages.boot.status === 'error')
  );

  return { context, document, localStorage, fetchCalls };
}

test('shared boot script is valid and forces the OpenBIOS-backed PCSX-ReARMed configuration', async () => {
  const staleKey = 'ejs-1-psx-Digimon World (Europe)-settings';
  const staleSettings = {
    settings: {
      retroarch_core: 'mednafen_psx_hw',
      pcsx_rearmed_bios: 'HLE',
      beetle_psx_hw_override_bios: 'enabled',
      volume: 'high'
    },
    controlSettings: {
      0: { 0: { value: 'custom' } },
      favorite: true
    },
    cheats: []
  };

  const { context, document, localStorage, fetchCalls } = await runBoot({
    withSaveBar: true,
    localStorage: {
      [staleKey]: JSON.stringify(staleSettings),
      'ejs-settings': JSON.stringify({ volume: 0.5, muted: false })
    }
  });

  const status = document.getElementById('loader-status');
  assert.doesNotMatch(status.textContent, /^Error/);
  assert.equal(document.getElementById('loader-overlay').style.display, 'none');

  assert.equal(context.DW1_BOOT_STARTED, true);
  assert.equal(context.EJS_core, 'pcsx_rearmed');
  assert.equal(context.EJS_biosUrl.name, 'openbios.bin');
  assert.equal(context.EJS_biosUrl.size, 512 * 1024);
  assert.equal(context.EJS_pathtodata, 'https://cdn.emulatorjs.org/4.2.3/data/');
  assert.equal(context.EJS_gameName, 'Digimon World (Europe)');
  assert.equal(context.EJS_gameUrl.name, 'Digimon World (Europe).zip');
  assert.deepEqual(Array.from(context.EJS_hideSettings), ['retroarch_core']);
  assert.equal(context.EJS_defaultOptions.retroarch_core, 'pcsx_rearmed');
  assert.equal(context.EJS_defaultOptions.pcsx_rearmed_bios, 'auto');
  assert.equal(typeof context.EJS_ready, 'function');
  assert.equal(typeof context.EJS_onGameStart, 'function');
  assert.equal(typeof context.EJS_onLoadState, 'function');
  assert.equal(typeof context.EJS_onSaveState, 'function');
  assert.equal(typeof context.EJS_onLoadSave, 'function');
  assert.equal(typeof context.EJS_onSaveSave, 'function');
  assert.ok(context.DW1_DISC_PATCH);
  assert.equal(context.DW1_DISC_PATCH.version, 2);
  assert.ok(Array.isArray(context.DW1_DISC_PATCH.ranges));
  assert.ok(context.DW1_BOOT_DIAGNOSTICS);
  assert.equal(context.DW1_BOOT_DIAGNOSTICS.version, '2.2.2');
  for (const stage of ['bootScript', 'manifest', 'chunks', 'disc', 'bios', 'patchData', 'coreSettings', 'emulatorConfig']) {
    assert.equal(context.DW1_BOOT_DIAGNOSTICS.stages[stage].status, 'ok', `${stage} must succeed`);
  }

  const loader = document.body.children.at(-1);
  assert.equal(loader.src, 'https://cdn.emulatorjs.org/4.2.3/data/loader.js');

  assert.ok(fetchCalls.some((url) => url.endsWith('/rom/manifest.json')));
  assert.ok(fetchCalls.some((url) => url.endsWith('/rom/part0.bin')));
  assert.ok(fetchCalls.some((url) => url.includes('/bios/openbios.bin')));
  assert.ok(fetchCalls.some((url) => url.includes('/disc-patch-v2.json')));

  const primed = JSON.parse(localStorage.getItem(staleKey));
  assert.equal(primed.settings.volume, 'high');
  assert.equal(primed.settings.retroarch_core, 'pcsx_rearmed');
  assert.equal(primed.settings.pcsx_rearmed_bios, 'auto');
  assert.equal(primed.settings.pcsx_rearmed_show_bios_bootlogo, 'disabled');
  assert.equal('beetle_psx_hw_override_bios' in primed.settings, false);
  assert.equal(primed.controlSettings.favorite, true);
  assert.equal(primed.controlSettings[0][0].value, 'custom', 'User-customised controls must be preserved');
  assert.equal(primed.controlSettings[0][3].value, 'enter', 'Default Start binding must be seeded');
  assert.equal(primed.controlSettings[0][3].value2, 'START');
  assert.equal(primed.controlSettings[0][8].value, 'z', 'Default Square binding must be seeded');
  assert.ok(primed.controlSettings[1] && typeof primed.controlSettings[1] === 'object', 'Player 2 controls must exist');
  assert.ok(primed.controlSettings[2] && typeof primed.controlSettings[2] === 'object', 'Player 3 controls must exist');
  assert.ok(primed.controlSettings[3] && typeof primed.controlSettings[3] === 'object', 'Player 4 controls must exist');
  assert.deepEqual(primed.cheats, []);
  assert.equal(localStorage.getItem('ejs-settings'), JSON.stringify({ volume: 0.5, muted: false }));
});

test('boot falls back to the GitHub-hosted ROM manifest when local chunks are unavailable', async () => {
  const { context, document, fetchCalls } = await runBoot({ manifestBase: FALLBACK_ROM_BASE });
  assert.doesNotMatch(document.getElementById('loader-status').textContent, /^Error/);
  assert.equal(context.EJS_gameUrl.name, 'Digimon World (Europe).zip');
  assert.ok(fetchCalls.some((url) => url.startsWith(FALLBACK_ROM_BASE) && url.endsWith('manifest.json')));
  assert.ok(fetchCalls.some((url) => url.startsWith(FALLBACK_ROM_BASE) && url.endsWith('part0.bin')));
});

test('all HTML entry points load the shared boot script and contain no stale emulator config', () => {
  const htmlFiles = ['index.html', 'public/index.html', 'public/emulator.html'];
  for (const relative of htmlFiles) {
    const html = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    assert.match(html, /emulator-boot\.js\?v=2\.2\.2/, `${relative} must load the versioned shared boot script`);
    assert.doesNotMatch(html, /EJS_core\s*=\s*['"]psx['"]/, `${relative} must not select the generic PSX core`);
    assert.doesNotMatch(html, /cdn\.emulatorjs\.org\/stable/, `${relative} must not use the unpinned CDN path`);
    assert.doesNotMatch(html, /scph5502\.bin/, `${relative} must not request a proprietary BIOS`);

    const inline = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(inline, `${relative} has an inline loader`);
    assert.doesNotThrow(() => new vm.Script(inline[1], { filename: relative }), `${relative} inline loader parses`);
  }
  assert.equal(
    fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8'),
    'root and public index entry points must stay in sync'
  );
});

test('boot script parses, uses OpenBIOS/diagnostics, and the ROM manifest matches committed chunks', () => {
  const bootSource = fs.readFileSync(BOOT_FILE, 'utf8');
  assert.doesNotThrow(() => new vm.Script(bootSource, { filename: 'emulator-boot.js' }));
  assert.match(bootSource, /pcsx_rearmed_bios['"]\s*:\s*['"]auto['"]/);
  assert.match(bootSource, /EJS_VERSION\s*=\s*['"]4\.2\.3['"]/);
  assert.match(bootSource, /OPENBIOS_SHA256\s*=\s*['"]fabe498fbf224e4721f12f31b6f5fe0659205e341dc4e5c5f91b9bd1a1011c57['"]/);
  assert.match(bootSource, /disc-patch-v2\.json/);
  assert.match(bootSource, /DW1_BOOT_DIAGNOSTICS/);
  assert.match(bootSource, /EJS_ready/);
  assert.match(bootSource, /firstFrame/);

  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'public/rom/manifest.json'), 'utf8')
  );
  const total = manifest.chunks.reduce((sum, chunk) => sum + chunk.size, 0);
  assert.equal(manifest.totalSize, total);
  for (const chunk of manifest.chunks) {
    assert.equal(fs.statSync(path.join(ROOT, 'public/rom', chunk.name)).size, chunk.size);
  }
  assert.equal(fs.existsSync(path.join(ROOT, 'public/scph5502.bin')), false);

  const bios = fs.readFileSync(BIOS_FILE);
  assert.equal(bios.length, 512 * 1024);
  assert.equal(
    createHash('sha256').update(bios).digest('hex'),
    'fabe498fbf224e4721f12f31b6f5fe0659205e341dc4e5c5f91b9bd1a1011c57'
  );
  assert.equal(fs.existsSync(path.join(ROOT, 'public/bios/OpenBIOS.LICENSE')), true);
  assert.equal(fs.existsSync(path.join(ROOT, 'public/bios/README.md')), true);

  const patch = JSON.parse(fs.readFileSync(DISC_PATCH_FILE, 'utf8'));
  assert.equal(patch.version, 2);
  assert.equal(patch.sourceSize, patch.targetSize);
  assert.ok(patch.sourceSha256 && patch.targetSha256);
  assert.ok(patch.ranges.length > 0);
  let previousEnd = 0;
  for (const range of patch.ranges) {
    assert.ok(range.offset >= previousEnd);
    assert.equal(range.before.length, range.length * 2);
    assert.equal(range.after.length, range.length * 2);
    previousEnd = range.offset + range.length;
  }
});

test('local server binds to all interfaces for previews', () => {
  const source = fs.readFileSync(path.join(ROOT, 'server.mjs'), 'utf8');
  assert.match(source, /server\.listen\(PORT,\s*['"]0\.0\.0\.0['"]/);
});

test('automatic session restoration sets EJS_loadStateURL and restores SRM from saved session', async () => {
  const mockStateBytes = new Uint8Array(650000);
  mockStateBytes.fill(0x7A);
  const mockSrmBytes = new Uint8Array(131072);
  mockSrmBytes.fill(0x55);

  const mockDb = createMockIndexedDB({
    'dw1-saves': {
      session: {
        active: {
          id: 'active',
          version: 2,
          ts: Date.now() - 30000,
          reason: 'auto',
          size: mockStateBytes.length,
          state: mockStateBytes,
          srm: mockSrmBytes
        }
      },
      backups: {}
    }
  });

  const { context } = await runBoot({
    withSaveBar: true,
    indexedDB: mockDb
  });

  assert.ok(context.EJS_loadStateURL, 'EJS_loadStateURL must be populated for auto-resume');
  assert.match(context.EJS_loadStateURL, /^blob:/, 'EJS_loadStateURL must be a valid blob URL');

  // Verify EJS_onGameStart executes cleanly and restores SRM
  let srmWritten = false;
  context.window.EJS_emulator = {
    gameManager: {
      getSaveFilePath() { return '/saves/game.srm'; },
      FS: {
        analyzePath() { return { exists: false }; },
        mkdir() {},
        unlink() {},
        writeFile(p, bytes) {
          if (bytes === mockSrmBytes) srmWritten = true;
        }
      },
      loadSaveFiles() {}
    }
  };

  context.window.EJS_onGameStart();
  assert.equal(srmWritten, true, 'Virtual PS1 memory card must be restored on game start');
});

test('disc chunks are read concurrently from IndexedDB without network fetch on return visits', async () => {
  const chunkBytes = new Uint8Array([0x44, 0x57, 0x31]);
  const sha = createHash('sha256').update(chunkBytes).digest('hex');
  const cacheKey = `part0.bin:${sha}`;

  const mockDb = createMockIndexedDB({
    'dw1-disc-cache': {
      chunks: {
        [cacheKey]: new Blob([chunkBytes])
      }
    }
  });

  const { fetchCalls } = await runBoot({
    indexedDB: mockDb
  });

  // part0.bin should have been loaded from cache, not fetched from network
  const chunkFetches = fetchCalls.filter((url) => url.endsWith('/part0.bin'));
  assert.equal(chunkFetches.length, 0, 'Cached disc chunk must not trigger network fetch');
});

test('Service Worker file exists, parses without syntax errors, and registers install and fetch listeners', () => {
  assert.equal(fs.existsSync(SW_FILE), true, 'public/sw.js must exist');
  const swCode = fs.readFileSync(SW_FILE, 'utf8');
  assert.doesNotThrow(() => new vm.Script(swCode, { filename: 'sw.js' }), 'sw.js must parse cleanly');
  assert.match(swCode, /addEventListener\(['"]install['"]/);
  assert.match(swCode, /addEventListener\(['"]activate['"]/);
  assert.match(swCode, /addEventListener\(['"]fetch['"]/);
  assert.match(swCode, /pcsx_rearmed-wasm\.data/);
  assert.match(swCode, /dw1-v2\.2\.2/);
  assert.match(swCode, /\/bios\/openbios\.bin/);
  assert.match(swCode, /\/rom\/disc-patch-v2\.json/);
  assert.match(swCode, /networkFirst/);
});

test('Vercel configuration includes security headers and anchors root ignore paths', () => {
  assert.equal(fs.existsSync(VERCEL_JSON), true, 'vercel.json must exist');
  const vercelConfig = JSON.parse(fs.readFileSync(VERCEL_JSON, 'utf8'));
  assert.ok(Array.isArray(vercelConfig.headers), 'vercel.json headers must be an array');
  assert.ok(vercelConfig.headers.some((h) => h.headers.some((pair) => pair.key === 'X-Content-Type-Options')));
  assert.ok(vercelConfig.headers.some((h) => h.source === '/emulator-boot.js' && h.headers.some((p) => p.value.includes('must-revalidate'))));
  assert.ok(vercelConfig.headers.some((h) => h.source === '/bios/openbios.bin' && h.headers.some((p) => p.value.includes('immutable'))));
  assert.ok(vercelConfig.headers.some((h) => h.source === '/rom/disc-patch-v2.json' && h.headers.some((p) => p.value.includes('immutable'))));

  const vercelIgnore = fs.readFileSync(VERCEL_IGNORE, 'utf8');
  assert.match(vercelIgnore, /^\/rom/m, '.vercelignore must anchor root /rom so public/ is preserved');
  assert.match(vercelIgnore, /^\/extracted/m, '.vercelignore must anchor root /extracted');
});

test('autosave safeguards protect against incomplete saves and preserve valid sessions', async () => {
  const existingGoodState = new Uint8Array(650000);
  existingGoodState.fill(0xAA);
  const existingSrm = new Uint8Array(131072);
  existingSrm.fill(0x11);

  const mockDb = createMockIndexedDB({
    'dw1-saves': {
      session: {
        active: {
          id: 'active',
          version: 2,
          ts: 1000,
          reason: 'initial',
          size: existingGoodState.length,
          state: existingGoodState,
          srm: existingSrm
        }
      },
      backups: {}
    }
  });

  const { context } = await runBoot({
    withSaveBar: true,
    indexedDB: mockDb
  });

  // Verify bad/empty state is rejected by autosave
  context.window.EJS_emulator = {
    gameManager: {
      getState() { return new Uint8Array(100); }, // Bad/corrupt/tiny state
      saveSaveFiles() {},
      getSaveFile() { return null; }
    }
  };

  context.window.EJS_onGameStart();
  // Trigger visibilitychange to test save
  context.document.hidden = true;

  // Verify the active session in IndexedDB was NOT overwritten with the bad 100-byte state
  const sessionReq = mockDb.open('dw1-saves').result.transaction('session').objectStore('session').get('active');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(sessionReq.result.size, 650000, 'Autosave must reject invalid truncated state snapshots');
  assert.equal(sessionReq.result.state, existingGoodState, 'Original good save must remain untouched');
});


test('runtime disc patch is applied after downloadRom and every boot stage is reported', async () => {
  const sourceDisc = new Uint8Array([0, 0, 0, 0, 9, 9, 9, 9]);
  const patch = {
    version: 2,
    description: 'test patch',
    sourceSize: sourceDisc.length,
    targetSize: sourceDisc.length,
    sourceSha256: 'source',
    targetSha256: 'target',
    ranges: [{ offset: 0, length: 4, before: '00000000', after: '01020304' }]
  };

  const { context, document } = await runBoot({ patchJson: JSON.stringify(patch) });
  const contents = new Uint8Array(sourceDisc);
  let openMode = null;
  let closed = false;
  let writeCalls = 0;
  const mockEmulator = {
    async downloadRom() {},
    gameManager: {
      FS: {
        stat(path) {
          if (!path.includes('Digimon World (Europe).bin')) throw new Error('missing');
          return { size: contents.length };
        },
        open(path, mode) {
          openMode = mode;
          return { path, contents };
        },
        read(stream, buffer, offset, length, position) {
          buffer.set(stream.contents.subarray(position, position + length), offset);
          return length;
        },
        write(stream, buffer, offset, length, position) {
          stream.contents.set(buffer.subarray(offset, offset + length), position);
          writeCalls++;
          return length;
        },
        close() {
          closed = true;
        }
      }
    }
  };

  context.EJS_emulator = mockEmulator;
  assert.equal(context.EJS_emulator, mockEmulator, 'EJS_emulator accessor must preserve the instance');
  assert.equal(typeof context.EJS_emulator.downloadRom, 'function');
  context.EJS_ready();
  await context.EJS_emulator.downloadRom();

  assert.equal(context.DW1_BOOT_DIAGNOSTICS.stages.ejsReady.status, 'ok');
  assert.equal(context.DW1_BOOT_DIAGNOSTICS.stages.discMount.status, 'ok');
  assert.equal(context.DW1_BOOT_DIAGNOSTICS.stages.discPatch.status, 'ok');
  assert.match(context.DW1_BOOT_DIAGNOSTICS.stages.discPatch.detail, /1 ranges \/ 4 bytes/);
  assert.equal(openMode, 'r+', 'Disc must be opened for in-place streaming repair');
  assert.equal(writeCalls, 1, 'Only the changed range should be written');
  assert.equal(closed, true, 'Disc stream must be closed');
  assert.deepEqual(Array.from(contents), [1, 2, 3, 4, 9, 9, 9, 9]);
  assert.doesNotMatch(document.getElementById('loader-status').textContent, /^Error/);
});

test('EJS_onGameStart records game start, controls/audio, and first-frame diagnostics', async () => {
  const { context } = await runBoot();
  context.EJS_onGameStart();
  const stages = context.DW1_BOOT_DIAGNOSTICS.stages;
  assert.equal(context.DW1_BOOT_DIAGNOSTICS.gameStarted, true);
  assert.equal(stages.gameStart.status, 'ok');
  assert.equal(stages.controlsAudio.status, 'ok');
  assert.equal(stages.firstFrame.status, 'unsupported');
});

test('boot source captures global errors and installs stage timeouts', () => {
  const bootSource = fs.readFileSync(BOOT_FILE, 'utf8');
  assert.match(bootSource, /window\.addEventListener\(['"]error['"]/);
  assert.match(bootSource, /window\.addEventListener\(['"]unhandledrejection['"]/);
  assert.match(bootSource, /stageTimeout\(['"]loader['"]/);
  assert.match(bootSource, /stageTimeout\(['"]ejsReady['"]/);
  assert.match(bootSource, /stageTimeout\(['"]discMount['"]/);
  assert.match(bootSource, /stageTimeout\(['"]gameStart['"]/);
  assert.match(bootSource, /stageTimeout\(['"]firstFrame['"]/);
  assert.match(bootSource, /DW1_BOOT_DIAGNOSTICS/);
  assert.match(bootSource, /FS\.open\(discPath, 'r\+'\)/);
  assert.match(bootSource, /FS\.read\(stream, buffer, done/);
  assert.match(bootSource, /FS\.write\(stream, bytes, done/);
  assert.match(bootSource, /DEFAULT_PSX_CONTROLS/);
  assert.match(bootSource, /normalizeControlSettings\(data\)/);
  assert.match(bootSource, /value: 'enter', value2: 'START'/);
});

test('service worker precache and server MIME map cover the new boot assets', () => {
  const swCode = fs.readFileSync(SW_FILE, 'utf8');
  const serverCode = fs.readFileSync(SERVER_FILE, 'utf8');
  assert.match(serverCode, /'\.md': 'text\/markdown; charset=utf-8'/);
  assert.match(serverCode, /'\.license': 'text\/plain; charset=utf-8'/);

  const assets = [
    '/bios/openbios.bin',
    '/bios/OpenBIOS.LICENSE',
    '/bios/README.md',
    '/rom/disc-patch-v2.json',
    '/rom/manifest.json',
    '/manifest.webmanifest',
    '/favicon.svg',
    '/favicon.ico',
    '/apple-touch-icon.png',
    '/icon-192.png',
    '/icon-512.png'
  ];
  for (const asset of assets) {
    const filePath = path.join(ROOT, 'public', asset.replace(/^\/+/, ''));
    assert.equal(fs.existsSync(filePath), true, `${asset} must exist for the service worker`);
  }
  for (const asset of ['/bios/openbios.bin', '/bios/OpenBIOS.LICENSE', '/rom/disc-patch-v2.json']) {
    assert.ok(swCode.includes(asset), `${asset} must be in the service worker precache list`);
  }
  assert.ok(swCode.includes('/rom/manifest.json'), 'ROM manifest must be network-first');
});
