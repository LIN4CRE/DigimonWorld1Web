/*
 * Digimon World 1 (Web Edition) — Instant-Play & Session Bootloader
 *
 * Core capabilities:
 * - Instant-Play Architecture: Silent autosave of full live state + PS1 memory card (.srm)
 * - Automatic Session Restoration: Clicking a bookmark returns you directly into active gameplay
 * - Invisible Background Saving: Periodic (25s), tab-hidden (visibilitychange), pagehide, and in-game save points
 * - High-speed parallel disc assembly: Concurrently reads cached chunks from IndexedDB (instant return visits)
 * - Multi-source fallback: Seamless failover from local host to GitHub-hosted ROM chunks
 * - Reliable rollback & data protection: Versioned atomic backups with corrupted save prevention
 * - Multi-tab conflict guard: BroadcastChannel session coordination preventing save clobbering
 * - Pinned PCSX-ReARMed core with redistributable OpenBIOS; no proprietary Sony firmware
 * - Runtime repair of the committed patched disc and stage-by-stage boot diagnostics
 */
(() => {
  'use strict';

  // Mark boot started so inline loaders know the script executed
  window.DW1_BOOT_STARTED = true;

  const EJS_VERSION = '4.2.3';
  const EJS_DATA_URL = `https://cdn.emulatorjs.org/${EJS_VERSION}/data/`;
  const GAME_NAME = 'Digimon World (Europe)';
  const FALLBACK_ROM_BASE =
    'https://raw.githubusercontent.com/LIN4CRE/DigimonWorld1Web/main/public/rom/';
  const DISC_CACHE_DB = 'dw1-disc-cache';
  const DISC_CACHE_STORE = 'chunks';
  const SAVE_DB = 'dw1-saves';
  const STORE_SESSION = 'session';
  const STORE_BACKUPS = 'backups';
  const STORE_SETTINGS = 'settings';
  const BOOT_VERSION = '2.2.5';
  const OPENBIOS_SHA256 = 'fabe498fbf224e4721f12f31b6f5fe0659205e341dc4e5c5f91b9bd1a1011c57';
  const CORE_SETTINGS_KEY = 'ejs-1-psx-Digimon World (Europe)-settings';
  // EmulatorJS 4.2.3 loads controlSettings from localStorage verbatim and does
  // NOT run setupKeys() on it, so values MUST already be numeric key codes.
  // Seeding the pre-setup human names ("enter", "up arrow") makes keyChange()
  // compare a string against event.keyCode, which never matches and silently
  // drops every key press (the intro cutscene then loops forever).
  const DEFAULT_PSX_CONTROLS = {
    0: {
      0: { value: 88, value2: 'BUTTON_2' }, // x
      1: { value: 83, value2: 'BUTTON_4' }, // s
      2: { value: 86, value2: 'SELECT' }, // v
      3: { value: 13, value2: 'START' }, // enter
      4: { value: 38, value2: 'DPAD_UP' }, // up arrow
      5: { value: 40, value2: 'DPAD_DOWN' }, // down arrow
      6: { value: 37, value2: 'DPAD_LEFT' }, // left arrow
      7: { value: 39, value2: 'DPAD_RIGHT' }, // right arrow
      8: { value: 90, value2: 'BUTTON_1' }, // z
      9: { value: 65, value2: 'BUTTON_3' }, // a
      10: { value: 81, value2: 'LEFT_TOP_SHOULDER' }, // q
      11: { value: 69, value2: 'RIGHT_TOP_SHOULDER' }, // e
      12: { value: 9, value2: 'LEFT_BOTTOM_SHOULDER' }, // tab
      13: { value: 82, value2: 'RIGHT_BOTTOM_SHOULDER' }, // r
      14: { value: 0, value2: 'LEFT_STICK' },
      15: { value: 0, value2: 'RIGHT_STICK' },
      16: { value: 72, value2: 'LEFT_STICK_X:+1' }, // h
      17: { value: 70, value2: 'LEFT_STICK_X:-1' }, // f
      18: { value: 71, value2: 'LEFT_STICK_Y:+1' }, // g
      19: { value: 84, value2: 'LEFT_STICK_Y:-1' }, // t
      20: { value: 76, value2: 'RIGHT_STICK_X:+1' }, // l
      21: { value: 74, value2: 'RIGHT_STICK_X:-1' }, // j
      22: { value: 75, value2: 'RIGHT_STICK_Y:+1' }, // k
      23: { value: 73, value2: 'RIGHT_STICK_Y:-1' }, // i
      24: { value: 49 }, // 1
      25: { value: 50 }, // 2
      26: { value: 51 }, // 3
      27: {},
      28: {},
      29: {}
    },
    1: {},
    2: {},
    3: {}
  };
  // Migration table for settings saved by earlier builds, which stored the
  // human-readable names above instead of key codes.
  const KEY_NAME_TO_CODE = {
    backspace: 8,
    tab: 9,
    enter: 13,
    shift: 16,
    ctrl: 17,
    alt: 18,
    'pause/break': 19,
    'caps lock': 20,
    escape: 27,
    space: 32,
    'page up': 33,
    'page down': 34,
    end: 35,
    home: 36,
    'left arrow': 37,
    'up arrow': 38,
    'right arrow': 39,
    'down arrow': 40,
    insert: 45,
    delete: 46,
    'left window key': 91,
    'right window key': 92,
    'select key': 93,
    multiply: 106,
    add: 107,
    subtract: 109,
    'decimal point': 110,
    divide: 111,
    'num lock': 144,
    'scroll lock': 145,
    'semi-colon': 186,
    'equal sign': 187,
    comma: 188,
    dash: 189,
    period: 190,
    'forward slash': 191,
    'grave accent': 192,
    'open bracket': 219,
    'back slash': 220,
    'close braket': 221,
    'single quote': 222
  };
  for (let code = 48; code <= 57; code++) KEY_NAME_TO_CODE[String(code - 48)] = code;
  for (let code = 65; code <= 90; code++) KEY_NAME_TO_CODE[String.fromCharCode(code).toLowerCase()] = code;
  for (let i = 0; i <= 9; i++) KEY_NAME_TO_CODE['numpad ' + i] = 96 + i;
  for (let i = 1; i <= 12; i++) KEY_NAME_TO_CODE['f' + i] = 111 + i;

  const normalizeKeyCode = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return value;
    const name = value.trim().toLowerCase();
    if (name === '') return 0;
    if (/^\d+$/.test(name)) return Number(name);
    if (Object.prototype.hasOwnProperty.call(KEY_NAME_TO_CODE, name)) return KEY_NAME_TO_CODE[name];
    return value;
  };
  const BIOS_URLS = [
    '/bios/openbios.bin',
    'bios/openbios.bin',
    '/public/bios/openbios.bin',
    'public/bios/openbios.bin'
  ];
  const DISC_PATCH_URLS = [
    '/rom/disc-patch-v2.json',
    'rom/disc-patch-v2.json',
    '/public/rom/disc-patch-v2.json',
    'public/rom/disc-patch-v2.json'
  ];
  const FIRST_FRAME_TIMEOUT_MS = 120000;

  const statusEl = document.getElementById('loader-status');
  const barEl = document.getElementById('progress-bar');
  const overlayEl = document.getElementById('loader-overlay');

  const bootDiagnostics = {
    version: BOOT_VERSION,
    startedAt: Date.now(),
    gameStarted: false,
    stages: {},
    errors: []
  };
  window.DW1_BOOT_DIAGNOSTICS = bootDiagnostics;

  const recordError = (source, error) => {
    const message = error && error.message ? error.message : String(error);
    // A denied Wake Lock (common on browsers without the permission or without a
    // user gesture) is expected and must not be reported as a boot failure.
    if (/Wake Lock permission request denied/i.test(message)) return;
    bootDiagnostics.errors.push({ source, message, at: Date.now() });
    console.error('[DW1] ' + source + ': ' + message);
  };

  const setStage = (name, status, detail = '') => {
    const previous = bootDiagnostics.stages[name];
    if (previous && previous.status === 'ok' && status !== 'ok') return;
    const entry = {
      status,
      detail,
      at: Date.now(),
      ms: Date.now() - bootDiagnostics.startedAt
    };
    bootDiagnostics.stages[name] = entry;
    if (status === 'error') {
      bootDiagnostics.errors.push({ source: name, message: detail, at: entry.at });
      showError(`${name}: ${detail}`);
    } else if (status === 'ok' && !bootDiagnostics.gameStarted && statusEl) {
      statusEl.style.color = '';
      statusEl.textContent = `Boot: ${name}${detail ? ' — ' + detail : ''}`;
    }
    console.log(`[DW1] ${name}: ${status}${detail ? ' — ' + detail : ''}`);
  };

  const stageTimeout = (name, ms, message) => {
    const timer = setTimeout(() => {
      const stage = bootDiagnostics.stages[name];
      if (!stage || (stage.status !== 'ok' && stage.status !== 'unsupported')) {
        setStage(name, 'error', message);
      }
    }, ms);
    if (timer && typeof timer.unref === 'function') timer.unref();
  };

  const showError = (message) => {
    if (overlayEl) overlayEl.style.display = 'flex';
    if (statusEl) {
      statusEl.style.color = '#ef4444';
      statusEl.textContent = message;
    }
    recordError('showError', message);
  };

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('error', (event) => {
      recordError('window.error', event.message || (event.error && event.error.message) || 'Unknown script error');
    });
    window.addEventListener('unhandledrejection', (event) => {
      recordError('unhandledrejection', event.reason && event.reason.message ? event.reason.message : event.reason);
    });
  }

  setStage('bootScript', 'ok', `v${BOOT_VERSION}`);

  const withTrailingSlash = (value) => (value.endsWith('/') ? value : value + '/');
  const toAbsoluteBase = (value) => withTrailingSlash(new URL(value, location.href).href);

  const params = new URLSearchParams(location.search);
  const customRomBase =
    params.get('romBase') ||
    document.documentElement.dataset.romBase ||
    window.DW1_ROM_BASE ||
    '';

  const romBases = [...new Set([
    ...(customRomBase ? [toAbsoluteBase(customRomBase)] : []),
    toAbsoluteBase('/rom/'),
    toAbsoluteBase('rom/'),
    toAbsoluteBase(FALLBACK_ROM_BASE)
  ])];

  // ==========================================
  // Storage Engines: Disc Cache & Save Storage
  // ==========================================

  const openDiscCache = () => new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('IndexedDB not supported'));
    const request = indexedDB.open(DISC_CACHE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DISC_CACHE_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const openSaveDb = () => new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('IndexedDB not supported'));
    const request = indexedDB.open(SAVE_DB, 2);
    request.onupgradeneeded = (ev) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_SESSION)) {
        db.createObjectStore(STORE_SESSION, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_BACKUPS)) {
        db.createObjectStore(STORE_BACKUPS, { keyPath: 'ts' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const idb = (db, store, mode, fn) => new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(store, mode);
      const request = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(request && request.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    } catch (err) {
      reject(err);
    }
  });

  const canDigest = !!(globalThis.crypto && globalThis.crypto.subtle);
  const sha256 = async (blob) => {
    const hash = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const hexToBytes = (hex) => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  };

  const fetchFirstSuccessful = async (urls, label) => {
    const failures = [];
    for (const relative of urls) {
      const url = new URL(relative, location.href).href;
      try {
        const response = await fetch(url, { cache: 'no-cache' });
        if (response.ok) return { url, response };
        failures.push(`${url} (HTTP ${response.status})`);
      } catch (err) {
        failures.push(`${url}: ${err.message || err}`);
      }
    }
    throw new Error(`${label} unavailable — ${failures.join('; ')}`);
  };

  const loadOpenBios = async () => {
    const { url, response } = await fetchFirstSuccessful(BIOS_URLS, 'OpenBIOS firmware');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== 512 * 1024) {
      throw new Error(`OpenBIOS must be 512 KiB, got ${bytes.length} bytes from ${url}`);
    }
    if (canDigest) {
      const digest = await sha256(new Blob([bytes]));
      if (digest !== OPENBIOS_SHA256) {
        throw new Error(`OpenBIOS checksum mismatch from ${url}: ${digest}`);
      }
    }
    // EmulatorJS 4.2.3's downloadGameFile() calls .split('/') on the BIOS value
    // (and on the other download URLs) before it ever normalises a File/Blob to a
    // name. Passing a File here therefore throws "t.split is not a function",
    // which rejects the boot promise and leaves the player on a black screen.
    // Hand the emulator the absolute, already-verified URL string instead.
    return {
      url: new URL(url, location.href).href,
      name: 'openbios.bin',
      size: bytes.length
    };
  };

  const loadDiscPatch = async () => {
    const { url, response } = await fetchFirstSuccessful(DISC_PATCH_URLS, 'Disc repair patch');
    const patch = await response.json();
    if (!patch || patch.version !== 2 || !Array.isArray(patch.ranges)) {
      throw new Error(`Invalid disc patch from ${url}`);
    }
    if (patch.sourceSize !== patch.targetSize || !Number.isFinite(patch.sourceSize)) {
      throw new Error(`Disc patch has invalid sizes in ${url}`);
    }
    let previousEnd = 0;
    for (const range of patch.ranges) {
      if (!Number.isInteger(range.offset) || !Number.isInteger(range.length) || range.length <= 0) {
        throw new Error(`Disc patch has an invalid range in ${url}`);
      }
      if (range.offset < previousEnd || range.offset < 0 || range.offset + range.length > patch.sourceSize) {
        throw new Error(`Disc patch ranges are not ordered and in-bounds in ${url}`);
      }
      if (range.before.length !== range.length * 2 || range.after.length !== range.length * 2) {
        throw new Error(`Disc patch has a truncated range in ${url}`);
      }
      previousEnd = range.offset + range.length;
    }
    return patch;
  };

  const applyDiscPatch = (ejs) => {
    setStage('discPatch', 'pending', 'Repairing stale decompressed disc in emulator FS');
    const patch = window.DW1_DISC_PATCH;
    if (!patch) throw new Error('Disc repair data was not loaded before the emulator mounted the disc');
    const FS = ejs && ejs.gameManager && ejs.gameManager.FS;
    if (!FS || typeof FS.stat !== 'function') {
      throw new Error('EmulatorJS filesystem is not ready for the disc repair');
    }
    const candidates = ['/Digimon World (Europe).bin', 'Digimon World (Europe).bin'];
    let discPath = null;
    for (const candidate of candidates) {
      try {
        const stat = FS.stat(candidate);
        if (stat && Number(stat.size) === patch.sourceSize) {
          discPath = candidate;
          break;
        }
      } catch (err) {}
    }
    if (!discPath) {
      throw new Error(`Decompressed disc not found at expected size ${patch.sourceSize}; clear cached site data and retry`);
    }

    const streamed = typeof FS.open === 'function' &&
      typeof FS.read === 'function' &&
      typeof FS.write === 'function' &&
      typeof FS.close === 'function';
    if (!streamed && (typeof FS.readFile !== 'function' || typeof FS.writeFile !== 'function')) {
      throw new Error('EmulatorJS FS has no compatible read/write API for the disc repair');
    }

    // Patch only the changed ranges in place. Reading/writing the whole 387 MB
    // image through readFile()/writeFile() doubles MEMFS memory and can kill the tab.
    const readAt = (stream, position, length) => {
      const buffer = new Uint8Array(length);
      let done = 0;
      while (done < length) {
        const count = FS.read(stream, buffer, done, length - done, position + done);
        if (!Number.isFinite(count) || count <= 0) {
          throw new Error(`EmulatorJS FS stopped reading at byte ${position + done}`);
        }
        done += count;
      }
      return buffer;
    };
    const writeAt = (stream, position, bytes) => {
      let done = 0;
      while (done < bytes.length) {
        const count = FS.write(stream, bytes, done, bytes.length - done, position + done);
        if (!Number.isFinite(count) || count <= 0) {
          throw new Error(`EmulatorJS FS stopped writing at byte ${position + done}`);
        }
        done += count;
      }
    };
    const patchRange = (stream, range) => {
      const before = hexToBytes(range.before);
      const after = hexToBytes(range.after);
      const current = readAt(stream, range.offset, range.length);
      for (let i = 0; i < before.length; i++) {
        if (current[i] !== before[i]) {
          throw new Error(`Disc revision mismatch at byte 0x${(range.offset + i).toString(16)}; clear cached site data and retry`);
        }
      }
      writeAt(stream, range.offset, after);
      const verified = readAt(stream, range.offset, range.length);
      for (let i = 0; i < after.length; i++) {
        if (verified[i] !== after[i]) {
          throw new Error(`Disc patch did not persist at byte 0x${(range.offset + i).toString(16)}; clear cached site data and retry`);
        }
      }
    };

    let patchedBytes = 0;
    if (streamed) {
      let stream;
      try {
        stream = FS.open(discPath, 'r+');
      } catch (err) {
        throw new Error(`Could not open ${discPath} for in-place patching: ${err.message || err}`);
      }
      try {
        for (const range of patch.ranges) {
          patchRange(stream, range);
          patchedBytes += range.length;
        }
      } finally {
        FS.close(stream);
      }
    } else {
      // Compatibility fallback for older EmulatorJS builds without stream APIs.
      const data = new Uint8Array(FS.readFile(discPath));
      if (data.length !== patch.sourceSize) {
        throw new Error(`Unexpected disc size ${data.length}; expected ${patch.sourceSize}`);
      }
      for (const range of patch.ranges) {
        const before = hexToBytes(range.before);
        const after = hexToBytes(range.after);
        for (let i = 0; i < before.length; i++) {
          if (data[range.offset + i] !== before[i]) {
            throw new Error(`Disc revision mismatch at byte 0x${(range.offset + i).toString(16)}; clear cached site data and retry`);
          }
        }
        data.set(after, range.offset);
        patchedBytes += range.length;
      }
      FS.writeFile(discPath, data);
    }
    return { ranges: patch.ranges.length, bytes: patchedBytes, path: discPath };
  };

  const wrapDownloadRom = (ejs) => {
    if (!ejs || typeof ejs.downloadRom !== 'function' || ejs.__dw1DiscPatchWrapped) return;
    ejs.__dw1DiscPatchWrapped = true;
    const original = ejs.downloadRom.bind(ejs);
    ejs.downloadRom = async () => {
      setStage('discMount', 'pending', 'Decompressing disc ZIP into EmulatorJS FS');
      try {
        await original();
      } catch (err) {
        setStage('discMount', 'error', err.message || String(err));
        throw err;
      }
      setStage('discMount', 'ok', 'Disc .bin and .cue mounted');
      try {
        const result = applyDiscPatch(ejs);
        setStage('discPatch', 'ok', `${result.ranges} ranges / ${result.bytes} bytes repaired`);
      } catch (err) {
        setStage('discPatch', 'error', err.message || String(err));
        throw err;
      }
    };
  };

  const waitForFirstFrame = async (ejs) => {
    if (
      !ejs || !ejs.gameManager || typeof ejs.gameManager.screenshot !== 'function' ||
      typeof globalThis.createImageBitmap !== 'function'
    ) {
      setStage('firstFrame', 'unsupported', 'Canvas pixel probe is unavailable in this environment');
      return;
    }
    setStage('firstFrame', 'pending', 'Waiting for a non-black PlayStation frame');
    const deadline = Date.now() + FIRST_FRAME_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const png = await ejs.gameManager.screenshot();
        const bitmap = await globalThis.createImageBitmap(new Blob([png], { type: 'image/png' }));
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 18;
        const ctx = canvas.getContext && canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let lit = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 24) lit++;
          }
          if (typeof bitmap.close === 'function') bitmap.close();
          if (lit > 16) {
            setStage('firstFrame', 'ok', `${lit}/${canvas.width * canvas.height} lit sample pixels`);
            return;
          }
        } else if (typeof bitmap.close === 'function') {
          bitmap.close();
        }
      } catch (err) {
        // Screenshot may not be available until the first RetroArch frame.
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    setStage('firstFrame', 'error', `No non-black frame within ${FIRST_FRAME_TIMEOUT_MS / 1000}s`);
  };

  const assignDetectedGamepads = () => {
    const ejs = window.EJS_emulator;
    if (!ejs) return;
    if (!Array.isArray(ejs.gamepadSelection)) ejs.gamepadSelection = ['', '', '', ''];
    while (ejs.gamepadSelection.length < 4) ejs.gamepadSelection.push('');
    const pads = [];
    const seen = new Set();
    if (ejs.gamepad && Array.isArray(ejs.gamepad.gamepads)) for (const p of ejs.gamepad.gamepads) if (p && p.id && !seen.has(p.id + '_' + p.index)) { seen.add(p.id + '_' + p.index); pads.push(p); }
    try {
      const nav = navigator.getGamepads ? navigator.getGamepads() : null;
      if (nav) for (let i = 0; i < nav.length; i++) if (nav[i] && nav[i].id) { const key = nav[i].id + '_' + nav[i].index; if (!seen.has(key)) { seen.add(key); pads.push(nav[i]); } }
    } catch (err) {}
    for (const pad of pads) {
      if (!pad || !pad.id) continue;
      const id = pad.id + '_' + pad.index;
      if (ejs.gamepadSelection.includes(id)) continue;
      const slot = ejs.gamepadSelection.indexOf('');
      if (slot === -1) break;
      ejs.gamepadSelection[slot] = id;
    }
    // Never let one pad occupy more than one slot.
    const claimed = new Set();
    for (let i = 0; i < ejs.gamepadSelection.length; i++) {
      const v = ejs.gamepadSelection[i];
      if (v === '') continue;
      if (claimed.has(v)) ejs.gamepadSelection[i] = '';
      else claimed.add(v);
    }
    try { if (typeof ejs.updateGamepadLabels === 'function') ejs.updateGamepadLabels(); } catch (err) {}
  };

  const installEmulatorHooks = () => {
    let emulatorRef = null;
    Object.defineProperty(window, 'EJS_emulator', {
      configurable: true,
      enumerable: true,
      get() { return emulatorRef; },
      set(value) {
        emulatorRef = value;
        wrapDownloadRom(value);
      }
    });

    window.EJS_ready = () => {
      setStage('ejsReady', 'ok', 'EmulatorJS instance created');
      wrapDownloadRom(window.EJS_emulator);
    };

    const originalOnGameStart = window.EJS_onGameStart;
    window.EJS_onGameStart = () => {
      originalOnGameStart();
      bootDiagnostics.gameStarted = true;
      setStage('gameStart', 'ok', 'EJS_onGameStart fired');
      // EmulatorJS listens for keydown on the #game parent. Focus it as soon as
      // the game starts so the first key press works without requiring a click.
      try {
        const parent = document.getElementById('game');
        if (parent && typeof parent.focus === 'function') parent.focus({ preventScroll: true });
      } catch (err) {}
      // Keep #game focused for keyboard input even if focus drifts to the page
      // background (or after the window regains focus), and rescue key presses
      // that land outside #game by re-dispatching them to it.
      try {
        const game = document.getElementById('game');
        if (game && !game.__dw1KeyTrap) {
          game.__dw1KeyTrap = true;
          const rescue = (ev) => {
            const ae = document.activeElement;
            if (ae === game || (ae && game.contains(ae))) return;
            if (ae && ae !== document.body && ae !== document.documentElement) return;
            try { game.focus({ preventScroll: true }); } catch (e) {}
            try {
              const clone = new KeyboardEvent(ev.type, {
                key: ev.key, code: ev.code, bubbles: true, cancelable: true,
                ctrlKey: ev.ctrlKey, shiftKey: ev.shiftKey, altKey: ev.altKey, metaKey: ev.metaKey
              });
              try { Object.defineProperty(clone, 'keyCode', { get: () => ev.keyCode }); } catch (e) {}
              try { Object.defineProperty(clone, 'which', { get: () => ev.which }); } catch (e) {}
              game.dispatchEvent(clone);
              ev.preventDefault();
            } catch (e) {}
          };
          window.addEventListener('keydown', rescue, true);
          window.addEventListener('keyup', rescue, true);
          window.addEventListener('focus', () => { try { game.focus({ preventScroll: true }); } catch (e) {} });
        }
      } catch (err) {}
      // EmulatorJS's GamepadHandler polls once in its constructor and can emit
      // "connected" before EmulatorJS subscribes, so a controller that was
      // already plugged in stays unassigned. Claim any detected pads now and
      // keep retrying, because Chrome only exposes gamepads after a user
      // gesture (so a Bluetooth pad connected before the first key press is
      // invisible until then).
      try { assignDetectedGamepads(); } catch (err) {}
      try {
        let retries = 0;
        const retryTimer = setInterval(() => {
          try { assignDetectedGamepads(); } catch (err) {}
          if (++retries >= 60) clearInterval(retryTimer);
        }, 2000);
      } catch (err) {}
      try {
        const onGesture = () => { try { assignDetectedGamepads(); } catch (err) {} };
        window.addEventListener('pointerdown', onGesture, true);
        window.addEventListener('keydown', onGesture, true);
        window.addEventListener('gamepadconnected', onGesture);
      } catch (err) {}
      setStage('controlsAudio', 'ok', 'EmulatorJS default controls, settings and audio left enabled; headless playback not verified');
      console.log('[DW1] Boot diagnostics', window.DW1_BOOT_DIAGNOSTICS);
      waitForFirstFrame(window.EJS_emulator);
    };

    window.EJS_onLoadState = () => setStage('loadState', 'ok', 'EmulatorJS loadState hook fired');
    window.EJS_onSaveState = () => setStage('saveState', 'ok', 'EmulatorJS saveState hook fired');
    window.EJS_onLoadSave = () => setStage('loadSave', 'ok', 'EmulatorJS loadSave hook fired');
    const originalOnSaveSave = window.EJS_onSaveSave;
    window.EJS_onSaveSave = () => {
      setStage('saveSave', 'ok', 'EmulatorJS saveSave hook fired');
      if (typeof originalOnSaveSave === 'function') originalOnSaveSave();
    };
  };

  // ==========================================
  // Manifest & ROM Assembly Pipeline
  // ==========================================

  async function resolveManifest() {
    if (statusEl) statusEl.textContent = 'Resolving disc manifest...';
    const failures = [];

    for (const base of romBases) {
      try {
        const response = await fetch(base + 'manifest.json', { cache: 'no-cache' });
        if (!response.ok) {
          failures.push(`${base}manifest.json (HTTP ${response.status})`);
          continue;
        }
        const manifest = await response.json();
        if (!manifest || !Array.isArray(manifest.chunks) || manifest.chunks.length === 0) {
          throw new Error('manifest.json contains no ROM chunks');
        }
        return { base, manifest };
      } catch (err) {
        failures.push(err.message || String(err));
      }
    }

    throw new Error('Could not load the disc manifest. ' + (failures[0] || 'No ROM sources available.'));
  }

  async function responseToBlob(response, onBytes) {
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const pieces = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        pieces.push(value);
        if (onBytes) onBytes(value.byteLength);
      }
      return new Blob(pieces);
    }
    const blob = await response.blob();
    if (onBytes) onBytes(blob.size);
    return blob;
  }

  async function fetchChunkWithFallback(chunk, primaryBase, onBytes) {
    const candidates = [primaryBase, ...romBases.filter((b) => b !== primaryBase)];
    let lastError = null;

    for (const base of candidates) {
      try {
        const response = await fetch(base + chunk.name);
        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status} from ${base}${chunk.name}`);
          continue;
        }
        const blob = await responseToBlob(response, onBytes);
        if (chunk.sha256 && canDigest && (await sha256(blob)) !== chunk.sha256) {
          lastError = new Error(`Integrity check failed for ${chunk.name}`);
          continue;
        }
        return blob;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error(`Failed to fetch chunk ${chunk.name}`);
  }

  async function buildRomFile(primaryBase, manifest) {
    const totalBytes = Number(manifest.totalSize) ||
      manifest.chunks.reduce((sum, chunk) => sum + Number(chunk.size || 0), 0);
    let loadedBytes = 0;
    let cachedCount = 0;

    const setProgress = (label) => {
      const pct = totalBytes ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : 0;
      if (barEl) barEl.style.width = pct + '%';
      if (statusEl) {
        statusEl.textContent =
          `${label} (${(loadedBytes / 1048576).toFixed(1)} / ${(totalBytes / 1048576).toFixed(1)} MB) - ${pct}%`;
      }
    };

    let db = null;
    try {
      db = await openDiscCache();
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
      }
    } catch (err) {
      console.warn('[DW1] IndexedDB disc cache unavailable, using network streaming', err);
    }

    // Step 1: Concurrently check local IndexedDB cache for all chunks
    const chunkBlobs = new Array(manifest.chunks.length);
    const missingIndices = [];

    if (db) {
      await Promise.all(
        manifest.chunks.map(async (chunk, idx) => {
          const key = chunk.sha256 ? `${chunk.name}:${chunk.sha256}` : null;
          if (key) {
            try {
              const hit = await idb(db, DISC_CACHE_STORE, 'readonly', (store) => store.get(key));
              if (hit && hit.size === chunk.size) {
                chunkBlobs[idx] = hit;
                cachedCount++;
                loadedBytes += chunk.size;
                return;
              }
            } catch (err) {}
          }
          missingIndices.push(idx);
        })
      );
    } else {
      manifest.chunks.forEach((_, idx) => missingIndices.push(idx));
    }

    if (cachedCount === manifest.chunks.length) {
      setProgress('Loaded instant disc from cache');
    } else if (cachedCount > 0) {
      setProgress('Resuming from cache');
    }

    // Step 2: Download any missing chunks with concurrent worker pool (2 concurrent downloads)
    if (missingIndices.length > 0) {
      const concurrency = 2;
      let currentIndex = 0;

      const worker = async () => {
        while (currentIndex < missingIndices.length) {
          const taskIdx = missingIndices[currentIndex++];
          const chunk = manifest.chunks[taskIdx];
          const blob = await fetchChunkWithFallback(chunk, primaryBase, (byteCount) => {
            loadedBytes += byteCount;
            setProgress('Downloading game disc');
          });
          chunkBlobs[taskIdx] = blob;

          // Cache chunk in IndexedDB for subsequent visits
          if (db && chunk.sha256) {
            const key = `${chunk.name}:${chunk.sha256}`;
            try {
              await idb(db, DISC_CACHE_STORE, 'readwrite', (store) => store.put(blob, key));
            } catch (err) {
              console.warn('[DW1] Disc cache write failed (quota limit?)', err);
            }
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(concurrency, missingIndices.length) }, worker)
      );
    }

    // Remove obsolete chunks from earlier disc revisions
    if (db) {
      try {
        const valid = new Set(
          manifest.chunks.filter((c) => c.sha256).map((c) => `${c.name}:${c.sha256}`)
        );
        const keys = await idb(db, DISC_CACHE_STORE, 'readonly', (store) => store.getAllKeys());
        for (const key of keys || []) {
          if (!valid.has(key)) {
            await idb(db, DISC_CACHE_STORE, 'readwrite', (store) => store.delete(key));
          }
        }
      } catch (err) {}
    }

    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((est) => {
        console.log(
          `[DW1] Disc ready: ${cachedCount}/${manifest.chunks.length} chunks from cache. ` +
          `Storage usage: ${(est.usage / 1048576).toFixed(0)} MB / ${(est.quota / 1048576).toFixed(0)} MB`
        );
      }).catch(() => {});
    }

    return new File(chunkBlobs, manifest.fileName || 'Digimon World (Europe).zip');
  }

  // ==========================================
  // Session Persistence & Instant-Resume Engine
  // ==========================================

  let saveDbInstance = null;
  const getSaveDb = async () => {
    if (!saveDbInstance) {
      saveDbInstance = await openSaveDb();
    }
    return saveDbInstance;
  };

  async function getActiveSession() {
    try {
      const db = await getSaveDb();
      const session = await idb(db, STORE_SESSION, 'readonly', (store) => store.get('active'));
      if (session && session.state && session.state.length >= 500000) {
        return session;
      }
    } catch (err) {
      console.warn('[DW1] Failed to read active session', err);
    }
    return null;
  }

  async function saveActiveSession(stateBytes, srmBytes, reason = 'auto') {
    if (!stateBytes || stateBytes.length < 500000) {
      console.warn('[DW1] Refusing to persist invalid or incomplete state snapshot');
      return false;
    }
    try {
      const db = await getSaveDb();
      const ts = Date.now();
      const sessionRecord = {
        id: 'active',
        version: 2,
        ts,
        reason,
        size: stateBytes.length,
        state: stateBytes,
        srm: srmBytes || null
      };

      // Atomic update of active session
      await idb(db, STORE_SESSION, 'readwrite', (store) => store.put(sessionRecord));

      // Versioned rolling backup (keep last 15)
      await idb(db, STORE_BACKUPS, 'readwrite', (store) => store.put({
        ts,
        reason,
        size: stateBytes.length,
        state: stateBytes,
        srm: srmBytes || null
      }));

      const allKeys = await idb(db, STORE_BACKUPS, 'readonly', (store) => store.getAllKeys());
      if (Array.isArray(allKeys) && allKeys.length > 15) {
        const toDelete = allKeys.slice(0, allKeys.length - 15);
        for (const k of toDelete) {
          await idb(db, STORE_BACKUPS, 'readwrite', (store) => store.delete(k));
        }
      }

      // Notify other tabs
      notifySessionSaved(ts, reason);
      return true;
    } catch (err) {
      console.warn('[DW1] Session save failed', err);
      return false;
    }
  }

  async function listBackups() {
    try {
      const db = await getSaveDb();
      const list = await idb(db, STORE_BACKUPS, 'readonly', (store) => store.getAll());
      return Array.isArray(list) ? list.sort((a, b) => b.ts - a.ts) : [];
    } catch (err) {
      console.warn('[DW1] Could not list backups', err);
      return [];
    }
  }

  async function clearActiveSession() {
    try {
      const db = await getSaveDb();
      const current = await getActiveSession();
      if (current) {
        await idb(db, STORE_BACKUPS, 'readwrite', (store) =>
          store.put({ ...current, ts: Date.now(), reason: 'before-new-game' })
        );
      }
      await idb(db, STORE_SESSION, 'readwrite', (store) => store.delete('active'));
    } catch (err) {}
  }

  // Multi-Tab Coordination via BroadcastChannel
  let broadcastChannel = null;
  const tabId = 'dw1_tab_' + Math.random().toString(36).slice(2, 9);

  function setupMultiTabSync(onTakeoverRequested) {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      broadcastChannel = new BroadcastChannel('dw1_session_coordinator');
      broadcastChannel.onmessage = (event) => {
        const { type, senderTabId, ts } = event.data || {};
        if (senderTabId === tabId) return;

        if (type === 'session_saved') {
          updateSaveIndicatorText(`Saved in other tab (${new Date(ts).toLocaleTimeString()})`);
        } else if (type === 'claim_focus') {
          if (onTakeoverRequested) onTakeoverRequested();
        }
      };
    } catch (err) {}
  }

  function notifySessionSaved(ts, reason) {
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage({ type: 'session_saved', senderTabId: tabId, ts, reason });
      } catch (err) {}
    }
  }

  // ==========================================
  // UI Controls & Toast Indicators
  // ==========================================

  const toast = (message) => {
    const toastEl = document.getElementById('save-toast');
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.style.display = 'block';
    clearTimeout(toast.t);
    toast.t = setTimeout(() => {
      toastEl.style.display = 'none';
    }, 3500);
    if (toast.t && typeof toast.t.unref === 'function') {
      toast.t.unref();
    }
  };

  function updateSaveIndicatorText(text) {
    const textEl = document.getElementById('save-indicator-text');
    if (textEl) textEl.textContent = text;
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  const gameManager = () => window.EJS_emulator && window.EJS_emulator.gameManager;

  const currentSrm = async () => {
    const manager = gameManager();
    if (!manager) return null;
    try { manager.saveSaveFiles(); } catch (err) {}
    await new Promise((resolve) => setTimeout(resolve, 200));
    return manager.getSaveFile(false);
  };

  const currentLiveState = () => {
    const manager = gameManager();
    if (!manager || typeof manager.getState !== 'function') return null;
    try {
      return manager.getState();
    } catch (err) {
      return null;
    }
  };

  const writeSrm = (bytes) => {
    const manager = gameManager();
    if (!manager || !bytes) return;
    const savePath = manager.getSaveFilePath();
    let currentPath = '';
    savePath.split('/').slice(0, -1).forEach((part) => {
      if (!part) return;
      currentPath += '/' + part;
      if (!manager.FS.analyzePath(currentPath).exists) manager.FS.mkdir(currentPath);
    });
    if (manager.FS.analyzePath(savePath).exists) manager.FS.unlink(savePath);
    manager.FS.writeFile(savePath, bytes);
    manager.loadSaveFiles();
  };

  function renderBackupModal(backups) {
    let modal = document.getElementById('backup-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'backup-modal';
      modal.style.cssText =
        'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;' +
        'align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px);';
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';

    const itemsHtml = backups.length === 0
      ? '<p style="color:#94a3b8;padding:16px 0;">No backups created yet.</p>'
      : backups.map((b) => {
        const timeStr = new Date(b.ts).toLocaleString();
        const sizeMb = (b.size / 1048576).toFixed(2);
        return (
          `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;` +
          `background:#131d36;border:1px solid #24355e;border-radius:6px;margin-bottom:8px;gap:12px;">` +
          `<div><div style="font-weight:600;color:#f8fafc;">${timeStr}</div>` +
          `<div style="font-size:11px;color:#94a3b8;">Trigger: ${b.reason || 'auto'} • ${sizeMb} MB</div></div>` +
          `<button data-ts="${b.ts}" class="btn-restore-item" style="background:#f59e0b;color:#000;border:none;` +
          `border-radius:4px;padding:6px 12px;font-weight:600;cursor:pointer;">Restore</button>` +
          `</div>`
        );
      }).join('');

    modal.innerHTML = `
      <div style="background:#0d1426;border:1px solid #f59e0b;border-radius:10px;padding:20px;max-width:540px;width:100%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 0 24px rgba(245,158,11,0.25);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid #24355e;padding-bottom:10px;">
          <h3 style="margin:0;font-size:16px;color:#f8fafc;">Saved Sessions & Backups</h3>
          <button id="btn-close-modal" style="background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;">✕</button>
        </div>
        <div style="overflow-y:auto;flex:1;margin-bottom:14px;">${itemsHtml}</div>
        <button id="btn-modal-cancel" style="background:#1e293b;color:#f8fafc;border:1px solid #475569;border-radius:6px;padding:8px 16px;cursor:pointer;align-self:flex-end;">Close</button>
      </div>
    `;

    const close = () => { modal.style.display = 'none'; };
    modal.querySelector('#btn-close-modal').onclick = close;
    modal.querySelector('#btn-modal-cancel').onclick = close;
    modal.querySelectorAll('.btn-restore-item').forEach((btn) => {
      btn.onclick = async () => {
        const ts = Number(btn.dataset.ts);
        const target = backups.find((b) => b.ts === ts);
        if (!target) return;
        close();
        try {
          const manager = gameManager();
          if (manager && target.state) {
            manager.loadState(target.state);
            if (target.srm) writeSrm(target.srm);
            toast('⚡ Session restored from ' + new Date(target.ts).toLocaleString());
            updateSaveIndicatorText('Restored session');
          }
        } catch (err) {
          toast('Restore failed: ' + err.message);
        }
      };
    });
  }

  function setupSaveControls() {
    const saveBar = document.getElementById('save-bar');
    if (!saveBar) return;

    const exportBtn = document.getElementById('btn-export');
    const exportStateBtn = document.getElementById('btn-export-state');
    const importBtn = document.getElementById('btn-import');
    const restoreBtn = document.getElementById('btn-restore');
    const restartBtn = document.getElementById('btn-restart');
    const fileInput = document.getElementById('save-file');

    if (exportBtn) {
      exportBtn.onclick = async () => {
        try {
          const save = await currentSrm();
          if (!save || !save.length) {
            return toast('No memory card data yet — save in-game first or continue playing.');
          }
          const link = document.createElement('a');
          link.href = URL.createObjectURL(new Blob([save]));
          link.download = GAME_NAME + ' ' + new Date().toISOString().slice(0, 10) + '.srm';
          link.click();
          toast('Memory card (.srm) exported (' + save.length + ' bytes).');
        } catch (err) {
          toast('Export failed: ' + err.message);
        }
      };
    }

    if (exportStateBtn) {
      exportStateBtn.onclick = async () => {
        try {
          const state = currentLiveState();
          if (!state || !state.length) {
            return toast('Could not capture state snapshot — emulator not ready.');
          }
          const link = document.createElement('a');
          link.href = URL.createObjectURL(new Blob([state], { type: 'application/octet-stream' }));
          link.download = GAME_NAME + ' Live Snapshot ' + new Date().toISOString().slice(0, 10) + '.state';
          link.click();
          toast('Live state snapshot (.state) exported (' + (state.length / 1048576).toFixed(1) + ' MB).');
        } catch (err) {
          toast('State export failed: ' + err.message);
        }
      };
    }

    if (importBtn && fileInput) importBtn.onclick = () => fileInput.click();

    if (fileInput) {
      fileInput.onchange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        event.target.value = '';
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const manager = gameManager();

          // Auto-detect: PS1 memory cards are 128 KB (131072 bytes)
          if (bytes.length === 131072) {
            const current = await currentSrm();
            if (current && current.length) {
              await saveActiveSession(currentLiveState() || new Uint8Array(500000), current, 'before-srm-import');
            }
            writeSrm(bytes);
            toast('Memory card (.srm) imported. Previous session was backed up.');
          } else if (bytes.length >= 500000 && manager && typeof manager.loadState === 'function') {
            // Live save state
            const current = currentLiveState();
            if (current && current.length) {
              await saveActiveSession(current, await currentSrm(), 'before-state-import');
            }
            manager.loadState(bytes);
            await saveActiveSession(bytes, await currentSrm(), 'imported-state');
            toast('Live state (.state) imported successfully.');
          } else {
            toast('Unrecognized save file format or invalid size (' + bytes.length + ' bytes).');
          }
        } catch (err) {
          toast('Import failed: ' + err.message);
        }
      };
    }

    if (restoreBtn) {
      restoreBtn.onclick = async () => {
        const backups = await listBackups();
        renderBackupModal(backups);
      };
    }

    if (restartBtn) {
      restartBtn.onclick = async () => {
        if (!confirm('Start a fresh game? Your current session will be saved as a backup.')) {
          return;
        }
        await clearActiveSession();
        location.reload();
      };
    }
  }

  // ==========================================
  // Invisible Background Saving System
  // ==========================================

  let autoSaveTimer = null;
  let isSavingInProgress = false;
  let lastSavedTimestamp = 0;

  async function performAutosave(reason = 'periodic') {
    if (isSavingInProgress) return;
    const manager = gameManager();
    if (!manager) return;

    // Minimum 4 seconds between saves unless explicit unload/hidden
    if (reason === 'periodic' && Date.now() - lastSavedTimestamp < 4000) return;

    isSavingInProgress = true;
    try {
      const stateBytes = currentLiveState();
      const srmBytes = await currentSrm();

      if (stateBytes && stateBytes.length >= 500000) {
        lastSavedTimestamp = Date.now();
        const ok = await saveActiveSession(stateBytes, srmBytes, reason);
        if (ok) {
          updateSaveIndicatorText(`Auto-Saved ${formatTime(lastSavedTimestamp)}`);
        }
      }
    } catch (err) {
      console.warn('[DW1] Autosave error', err);
    } finally {
      isSavingInProgress = false;
    }
  }

  function setupInvisibleAutosave() {
    // Periodic silent autosave every 25 seconds
    clearInterval(autoSaveTimer);
    autoSaveTimer = setInterval(() => performAutosave('periodic'), 25000);
    if (autoSaveTimer && typeof autoSaveTimer.unref === 'function') {
      autoSaveTimer.unref();
    }

    // Save when switching away, minimizing window, or locking phone
    if (typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) performAutosave('visibility_hidden');
      });
    }

    // Supplementary safeguards for tab close and page navigations
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('pagehide', () => performAutosave('pagehide'));
      window.addEventListener('beforeunload', () => performAutosave('beforeunload'));
    }
  }

  // ==========================================
  // Emulator Configuration & Settings Cleanup
  // ==========================================

  // Remove stale core selections from earlier deployments. The critical
  // PCSX-ReARMed/OpenBIOS options are re-primed immediately afterwards.
  function clearIncompatibleEmulatorSettings() {
    const staleKeys = [
      'retroarch_core',
      'pcsx_rearmed_bios',
      'beetle_psx_hw_override_bios'
    ];
    try {
      if (!window.localStorage) return;
      for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const storageKey = window.localStorage.key(i);
        if (!storageKey || !storageKey.startsWith('ejs-') || !storageKey.endsWith('-settings')) {
          continue;
        }
        let data;
        try {
          data = JSON.parse(window.localStorage.getItem(storageKey));
        } catch (err) {
          continue;
        }
        if (!data || !data.settings || typeof data.settings !== 'object') continue;
        let changed = false;
        for (const key of staleKeys) {
          if (key in data.settings) {
            delete data.settings[key];
            changed = true;
          }
        }
        if (changed) window.localStorage.setItem(storageKey, JSON.stringify(data));
      }
    } catch (err) {
      console.warn('[DW1] Could not clear stale emulator settings', err);
    }
  }

  function normalizeControlSettings(data) {
    const controls = data.controlSettings && typeof data.controlSettings === 'object' && !Array.isArray(data.controlSettings)
      ? data.controlSettings
      : {};
    for (let player = 0; player < 4; player++) {
      if (!controls[player] || typeof controls[player] !== 'object' || Array.isArray(controls[player])) {
        controls[player] = {};
      }
    }
    for (const [key, fallback] of Object.entries(DEFAULT_PSX_CONTROLS[0])) {
      const current = controls[0][key];
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        controls[0][key] = { ...fallback };
      } else {
        if (current.value === undefined && fallback.value !== undefined) current.value = fallback.value;
        if (current.value2 === undefined && fallback.value2 !== undefined) current.value2 = fallback.value2;
      }
    }
    // Migrate bindings saved by earlier builds as key names ("enter",
    // "up arrow") into the numeric key codes EmulatorJS compares at runtime.
    for (let player = 0; player < 4; player++) {
      for (const entry of Object.values(controls[player])) {
        if (entry && typeof entry === 'object' && !Array.isArray(entry) && 'value' in entry) {
          entry.value = normalizeKeyCode(entry.value);
        }
      }
    }
    data.controlSettings = controls;
  }

  function primeCoreSettings() {
    try {
      if (!window.localStorage) return;
      let data = {};
      try {
        data = JSON.parse(window.localStorage.getItem(CORE_SETTINGS_KEY)) || {};
      } catch (err) {
        data = {};
      }
      if (!data || typeof data !== 'object') data = {};
      if (!data.settings || typeof data.settings !== 'object') data.settings = {};
      if (!Array.isArray(data.cheats)) data.cheats = [];
      normalizeControlSettings(data);
      // These must exist in localStorage before the core reads its .opt file;
      // EmulatorJS 4.2.3 otherwise ignores EJS_defaultOptions until after boot.
      data.settings.retroarch_core = 'pcsx_rearmed';
      data.settings.pcsx_rearmed_bios = 'auto';
      data.settings.pcsx_rearmed_show_bios_bootlogo = 'disabled';
      window.localStorage.setItem(CORE_SETTINGS_KEY, JSON.stringify(data));
      setStage('coreSettings', 'ok', 'Pinned PCSX-ReARMed + Auto BIOS before core load');
    } catch (err) {
      setStage('coreSettings', 'error', err.message || String(err));
    }
  }

  function configureEmulator(romFile, activeSession) {
    clearIncompatibleEmulatorSettings();

    window.EJS_player = '#game';
    window.EJS_core = 'pcsx_rearmed';
    window.EJS_gameName = GAME_NAME;
    window.EJS_color = '#f59e0b';
    window.EJS_startOnLoaded = true;
    window.EJS_pathtodata = EJS_DATA_URL;
    window.EJS_gameUrl = romFile;
    window.EJS_biosUrl = '';
    window.EJS_language = 'en-US';
    window.EJS_disableAutoLang = true;

    // Hide alternate core selection menu to prevent selecting incompatible Beetle
    window.EJS_hideSettings = ['retroarch_core'];
    window.EJS_defaultOptions = {
      'retroarch_core': 'pcsx_rearmed',
      'pcsx_rearmed_bios': 'auto',
      'pcsx_rearmed_show_bios_bootlogo': 'disabled',
      'pcsx_rearmed_dithering': 'disabled',
      'pcsx_rearmed_neon_enhancement_enable': 'enabled',
      'pcsx_rearmed_neon_enhancement_no_main': 'disabled'
    };
    primeCoreSettings();
    setStage('emulatorConfig', 'ok', 'OpenBIOS + PCSX-ReARMed auto BIOS configured');

    // If an active session exists, hook automatic resume via loadState
    if (activeSession && activeSession.state) {
      try {
        const stateBlob = new Blob([activeSession.state], { type: 'application/octet-stream' });
        window.EJS_loadStateURL = URL.createObjectURL(stateBlob);
      } catch (err) {
        console.warn('[DW1] Could not create state blob URL', err);
      }
    }

    // Emulator Lifecycle Callbacks
    window.EJS_onGameStart = () => {
      const saveBar = document.getElementById('save-bar');
      if (saveBar) saveBar.style.display = 'flex';

      // Restore virtual PS1 memory card (.srm) if available in session
      if (activeSession && activeSession.srm) {
        try {
          writeSrm(activeSession.srm);
        } catch (err) {}
      }

      // If loadStateURL was used, show confirmation toast
      if (activeSession) {
        toast(`⚡ Resumed session from ${new Date(activeSession.ts).toLocaleTimeString()}`);
        updateSaveIndicatorText(`Session Resumed (${new Date(activeSession.ts).toLocaleTimeString()})`);
      } else {
        toast('🎮 New game started — progress saves automatically.');
        updateSaveIndicatorText('Auto-Save Active');
      }

      // Clean up object URL after core loads it
      if (window.EJS_loadStateURL) {
        const revokeTimer = setTimeout(() => {
          try { URL.revokeObjectURL(window.EJS_loadStateURL); } catch (e) {}
        }, 10000);
        if (revokeTimer && typeof revokeTimer.unref === 'function') {
          revokeTimer.unref();
        }
      }

      // Begin silent autosaving
      setupInvisibleAutosave();
    };

    // Listen to virtual memory card in-game writes
    window.EJS_onSaveSave = () => {
      performAutosave('ingame_memory_card');
    };
  }

  // ==========================================
  // Main Boot Sequence
  // ==========================================

  async function bootGame() {
    try {
      // Step 1: Check for existing saved session to resume
      setStage('session', 'pending', 'Checking saved session');
      let activeSession = null;
      try {
        activeSession = await getActiveSession();
        setStage('session', activeSession ? 'ok' : 'ok', activeSession ? 'Resumable session found' : 'Starting a fresh session');
      } catch (err) {
        setStage('session', 'ok', 'Session check failed; starting fresh');
        console.warn('[DW1] Session check failed, starting fresh', err);
      }

      // Step 2: Resolve manifest and build ROM from cache / network
      setStage('manifest', 'pending', 'Resolving disc manifest');
      const { base, manifest } = await resolveManifest();
      setStage('manifest', 'ok', `${manifest.chunks.length} chunks from ${base}`);
      setStage('chunks', 'pending', 'Assembling disc from cache / network');
      const romFile = await buildRomFile(base, manifest);
      setStage('chunks', 'ok', `${(romFile.size / 1048576).toFixed(1)} MB assembled`);
      setStage('disc', 'ok', romFile.name);

      // Step 3: Setup UI controls, multi-tab coordination & emulator config
      setupSaveControls();
      setupMultiTabSync();
      configureEmulator(romFile, activeSession);

      // Step 4: Load free firmware and the small runtime disc repair patch
      setStage('bios', 'pending', 'Loading redistributable OpenBIOS');
      const bios = await loadOpenBios();
      window.EJS_biosUrl = bios.url;
      setStage('bios', 'ok', `${bios.name} (${bios.size} bytes) from ${bios.url}`);
      setStage('patchData', 'pending', 'Loading disc repair patch');
      const discPatch = await loadDiscPatch();
      window.DW1_DISC_PATCH = discPatch;
      setStage('patchData', 'ok', `${discPatch.ranges.length} ranges / ${discPatch.targetSize} byte disc`);
      installEmulatorHooks();

      // Step 5: Hide loader overlay and mount EmulatorJS
      if (overlayEl) overlayEl.style.display = 'none';
      setStage('loader', 'pending', 'Loading EmulatorJS 4.2.3 from CDN');
      const loader = document.createElement('script');
      loader.src = EJS_DATA_URL + 'loader.js';
      loader.onload = () => setStage('loader', 'ok', 'CDN loader.js executed');
      loader.onerror = () => setStage('loader', 'error', 'Could not load EmulatorJS from the CDN');
      document.body.appendChild(loader);

      // Stage-specific deadlines turn another unexplained black screen into a
      // precise error in the overlay and in window.DW1_BOOT_DIAGNOSTICS.
      stageTimeout('loader', 30000, 'EmulatorJS loader.js did not load within 30s');
      stageTimeout('ejsReady', 60000, 'EmulatorJS did not become ready within 60s');
      stageTimeout('discMount', 180000, 'Disc was not decompressed into the emulator filesystem within 180s');
      stageTimeout('discPatch', 200000, 'Disc repair patch was not applied within 200s');
      stageTimeout('gameStart', 240000, 'EJS_onGameStart did not fire within 240s');
      stageTimeout('firstFrame', 300000, 'No PlayStation frame appeared within 300s');

      // Step 6: Register Service Worker for offline shell and CDN caching
      if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
        navigator.serviceWorker.register('/sw.js')
          .then(() => setStage('serviceWorker', 'ok', 'Registered'))
          .catch((err) => setStage('serviceWorker', 'warning', err.message || String(err)));
      } else {
        setStage('serviceWorker', 'unsupported', 'Service workers unavailable on this origin');
      }
    } catch (err) {
      const message = err.message || String(err);
      setStage('boot', 'error', message);
    }
  }

  bootGame();
})();
