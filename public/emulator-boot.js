/*
 * Shared boot loader for all three Digimon World browser entry points.
 *
 * IMPORTANT: this project deliberately does not ship a Sony PlayStation BIOS.
 * The Beetle/mednafen_psx_hw core requires scph5502.bin for this PAL disc and
 * refuses to boot without it. PCSX-ReARMed has a built-in high-level-emulation
 * (HLE) BIOS, so we pin that core and force `pcsx_rearmed_bios = "HLE"`.
 *
 * EmulatorJS is also pinned to a known version: the "stable" CDN path can
 * change core defaults and break a previously working deployment.
 */
(() => {
  'use strict';

  // The inline loader in each HTML page checks this flag before trying its
  // next candidate path.
  window.DW1_BOOT_STARTED = true;

  const EJS_VERSION = '4.2.3';
  const EJS_DATA_URL = `https://cdn.emulatorjs.org/${EJS_VERSION}/data/`;
  const GAME_NAME = 'Digimon World (Europe)';
  const FALLBACK_ROM_BASE =
    'https://raw.githubusercontent.com/LIN4CRE/DigimonWorld1Web/main/public/rom/';
  const DISC_CACHE_DB = 'dw1-disc-cache';
  const DISC_CACHE_STORE = 'chunks';
  const SAVE_DB = 'dw1-saves';

  const statusEl = document.getElementById('loader-status');
  const barEl = document.getElementById('progress-bar');
  const overlayEl = document.getElementById('loader-overlay');

  const showError = (message) => {
    if (overlayEl) overlayEl.style.display = 'flex';
    if (statusEl) {
      statusEl.style.color = '#ef4444';
      statusEl.textContent = message;
    }
    console.error('[DW1] ' + message);
  };

  const withTrailingSlash = (value) => (value.endsWith('/') ? value : value + '/');
  const toAbsoluteBase = (value) => withTrailingSlash(new URL(value, location.href).href);

  const params = new URLSearchParams(location.search);
  const customRomBase =
    params.get('romBase') ||
    document.documentElement.dataset.romBase ||
    window.DW1_ROM_BASE ||
    '';

  // Support both deployment layouts: `public/` as the site root and the
  // repository root as the site root. The GitHub fallback is needed on hosts
  // that exclude public/rom from the deployment bundle.
  const romBases = [...new Set([
    ...(customRomBase ? [toAbsoluteBase(customRomBase)] : []),
    toAbsoluteBase('/rom/'),
    toAbsoluteBase('rom/'),
    toAbsoluteBase(FALLBACK_ROM_BASE)
  ])];

  const openDiscCache = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DISC_CACHE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DISC_CACHE_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const idb = (db, mode, fn) => new Promise((resolve, reject) => {
    const tx = db.transaction(DISC_CACHE_STORE, mode);
    const request = fn(tx.objectStore(DISC_CACHE_STORE));
    tx.oncomplete = () => resolve(request && request.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });

  const canDigest = !!(globalThis.crypto && globalThis.crypto.subtle);
  const sha256 = async (blob) => {
    const hash = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  async function resolveManifest() {
    if (statusEl) statusEl.textContent = 'Loading disc manifest...';
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
        onBytes(value.byteLength);
      }
      return new Blob(pieces);
    }
    const blob = await response.blob();
    onBytes(blob.size);
    return blob;
  }

  async function buildRomFile(base, manifest) {
    const totalBytes = Number(manifest.totalSize) ||
      manifest.chunks.reduce((sum, chunk) => sum + Number(chunk.size || 0), 0);
    let loadedBytes = 0;
    let cachedCount = 0;
    const parts = [];

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
      console.warn('[DW1] IndexedDB unavailable, disc caching disabled', err);
    }

    for (const chunk of manifest.chunks) {
      const key = chunk.sha256 ? `${chunk.name}:${chunk.sha256}` : null;
      let blob = null;

      if (db && key) {
        try {
          const hit = await idb(db, 'readonly', (store) => store.get(key));
          if (hit && hit.size === chunk.size) {
            blob = hit;
            cachedCount++;
            loadedBytes += chunk.size;
            setProgress('Loading from local cache');
          }
        } catch (err) {
          console.warn('[DW1] Disc cache read failed', err);
        }
      }

      if (!blob) {
        const response = await fetch(base + chunk.name);
        if (!response.ok) {
          throw new Error(`Failed to fetch ${chunk.name} (HTTP ${response.status})`);
        }
        blob = await responseToBlob(response, (byteLength) => {
          loadedBytes += byteLength;
          setProgress('Downloading game disc');
        });
        if (chunk.sha256 && canDigest && (await sha256(blob)) !== chunk.sha256) {
          throw new Error(`Integrity check failed for ${chunk.name}`);
        }
        if (db && key) {
          try {
            await idb(db, 'readwrite', (store) => store.put(blob, key));
          } catch (err) {
            console.warn('[DW1] Disc cache write failed (quota?)', err);
          }
        }
      }
      parts.push(blob);
    }

    // Remove chunks left over from earlier disc versions.
    if (db) {
      try {
        const valid = new Set(manifest.chunks
          .filter((chunk) => chunk.sha256)
          .map((chunk) => `${chunk.name}:${chunk.sha256}`));
        const keys = await idb(db, 'readonly', (store) => store.getAllKeys());
        for (const key of keys) {
          if (!valid.has(key)) await idb(db, 'readwrite', (store) => store.delete(key));
        }
      } catch (err) {
        console.warn('[DW1] Disc cache cleanup failed', err);
      }
    }

    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((estimate) => {
        console.log(
          `[DW1] ${cachedCount}/${manifest.chunks.length} chunks from cache. ` +
          `Storage used: ${(estimate.usage / 1048576).toFixed(0)} MB of ` +
          `${(estimate.quota / 1048576).toFixed(0)} MB`
        );
      }).catch(() => {});
    }

    return new File(parts, manifest.fileName || 'Digimon World (Europe).zip');
  }

  /*
   * EmulatorJS persists the selected core and core options in localStorage.
   * A previously saved `retroarch_core = mednafen_psx_hw` is exactly what
   * produces the "Firmware is missing: scph5502.bin" screen. Remove only the
   * incompatible settings; controls, cheats and saves are left alone.
   */
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

  function setupSaveControls() {
    const saveBar = document.getElementById('save-bar');
    if (!saveBar) return;

    const toastEl = document.getElementById('save-toast');
    const exportBtn = document.getElementById('btn-export');
    const importBtn = document.getElementById('btn-import');
    const restoreBtn = document.getElementById('btn-restore');
    const fileInput = document.getElementById('save-file');

    const toast = (message) => {
      if (!toastEl) return;
      toastEl.textContent = message;
      toastEl.style.display = 'block';
      clearTimeout(toast.t);
      toast.t = setTimeout(() => { toastEl.style.display = 'none'; }, 3500);
    };

    const saveDb = () => new Promise((resolve, reject) => {
      const request = indexedDB.open(SAVE_DB, 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore('backups', { keyPath: 'ts' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const backupSave = async (data, reason) => {
      try {
        const db = await saveDb();
        await new Promise((resolve, reject) => {
          const tx = db.transaction('backups', 'readwrite');
          tx.objectStore('backups').put({ ts: Date.now(), reason, data });
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
        const all = await new Promise((resolve) => {
          const query = db.transaction('backups').objectStore('backups').getAllKeys();
          query.onsuccess = () => resolve(query.result);
        });
        for (const key of all.slice(0, Math.max(0, all.length - 10))) {
          db.transaction('backups', 'readwrite').objectStore('backups').delete(key);
        }
      } catch (err) {
        console.warn('[DW1] Save backup failed', err);
      }
    };

    const latestBackup = async () => {
      const db = await saveDb();
      return new Promise((resolve) => {
        const query = db.transaction('backups').objectStore('backups').getAll();
        query.onsuccess = () => resolve(query.result.pop() || null);
      });
    };

    const gameManager = () => window.EJS_emulator && window.EJS_emulator.gameManager;
    const writeSave = (bytes) => {
      const manager = gameManager();
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
    const currentSave = async () => {
      const manager = gameManager();
      try { manager.saveSaveFiles(); } catch (err) {}
      await new Promise((resolve) => setTimeout(resolve, 300));
      return manager.getSaveFile(false);
    };

    window.EJS_onGameStart = () => {
      saveBar.style.display = 'flex';
      setInterval(async () => {
        try {
          const save = await currentSave();
          if (save && save.length) backupSave(save, 'auto');
        } catch (err) {}
      }, 120000);
    };

    if (exportBtn) exportBtn.onclick = async () => {
      try {
        const save = await currentSave();
        if (!save || !save.length) {
          return toast('No memory card data yet - save in-game first (at a Save point).');
        }
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([save]));
        link.download = GAME_NAME + ' ' + new Date().toISOString().slice(0, 10) + '.srm';
        link.click();
        toast('Save exported (' + save.length + ' bytes).');
      } catch (err) {
        toast('Export failed: ' + err.message);
      }
    };

    if (importBtn && fileInput) importBtn.onclick = () => fileInput.click();
    if (fileInput) fileInput.onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      event.target.value = '';
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.length !== 131072 &&
            !confirm('This file is ' + bytes.length + ' bytes; a PS1 memory card is normally 131072. Import anyway?')) {
          return;
        }
        const current = await currentSave();
        if (current && current.length) await backupSave(current, 'before-import');
        writeSave(bytes);
        toast('Save imported. Your previous save was backed up automatically.');
      } catch (err) {
        toast('Import failed: ' + err.message);
      }
    };

    if (restoreBtn) restoreBtn.onclick = async () => {
      try {
        const backup = await latestBackup();
        if (!backup) return toast('No backup yet.');
        writeSave(backup.data);
        toast('Restored backup from ' + new Date(backup.ts).toLocaleString());
      } catch (err) {
        toast('Restore failed: ' + err.message);
      }
    };
  }

  function configureEmulator(romFile) {
    clearIncompatibleEmulatorSettings();

    window.EJS_player = '#game';
    // Do not use the generic "psx" alias: a saved setting can silently resolve
    // it to mednafen_psx_hw, which requires the proprietary scph5502.bin BIOS.
    window.EJS_core = 'pcsx_rearmed';
    window.EJS_gameName = GAME_NAME;
    window.EJS_color = '#f59e0b';
    window.EJS_startOnLoaded = true;
    window.EJS_pathtodata = EJS_DATA_URL;
    window.EJS_gameUrl = romFile;
    window.EJS_biosUrl = '';
    window.EJS_language = 'en-US';
    window.EJS_disableAutoLang = true;

    // Hide the alternate-core menu so Beetle cannot be reselected by accident.
    window.EJS_hideSettings = ['retroarch_core'];
    window.EJS_defaultOptions = {
      'retroarch_core': 'pcsx_rearmed',
      'pcsx_rearmed_bios': 'HLE',
      'pcsx_rearmed_show_bios_bootlogo': 'disabled',
      'pcsx_rearmed_dithering': 'disabled',
      'pcsx_rearmed_neon_enhancement_enable': 'enabled',
      'pcsx_rearmed_neon_enhancement_no_main': 'disabled'
    };
  }

  async function bootGame() {
    try {
      const { base, manifest } = await resolveManifest();
      const romFile = await buildRomFile(base, manifest);
      setupSaveControls();
      configureEmulator(romFile);

      if (overlayEl) overlayEl.style.display = 'none';
      const loader = document.createElement('script');
      loader.src = EJS_DATA_URL + 'loader.js';
      loader.onerror = () => showError('Could not load EmulatorJS from the CDN.');
      document.body.appendChild(loader);
    } catch (err) {
      showError('Error loading disc: ' + (err.message || err));
    }
  }

  bootGame();
})();
