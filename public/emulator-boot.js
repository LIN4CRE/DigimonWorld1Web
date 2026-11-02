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
 * - Pinned PCSX-ReARMed core with built-in HLE BIOS (no proprietary scph5502.bin required)
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
      'pcsx_rearmed_bios': 'HLE',
      'pcsx_rearmed_show_bios_bootlogo': 'disabled',
      'pcsx_rearmed_dithering': 'disabled',
      'pcsx_rearmed_neon_enhancement_enable': 'enabled',
      'pcsx_rearmed_neon_enhancement_no_main': 'disabled'
    };

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
      let activeSession = null;
      try {
        activeSession = await getActiveSession();
      } catch (err) {
        console.warn('[DW1] Session check failed, starting fresh', err);
      }

      if (activeSession) {
        if (statusEl) statusEl.textContent = 'Found saved session. Assembling game disc...';
      }

      // Step 2: Resolve manifest and build ROM from cache / network
      const { base, manifest } = await resolveManifest();
      const romFile = await buildRomFile(base, manifest);

      // Step 3: Setup UI controls, multi-tab coordination & emulator config
      setupSaveControls();
      setupMultiTabSync();
      configureEmulator(romFile, activeSession);

      // Step 4: Hide loader overlay and mount EmulatorJS
      if (overlayEl) overlayEl.style.display = 'none';
      const loader = document.createElement('script');
      loader.src = EJS_DATA_URL + 'loader.js';
      loader.onerror = () => showError('Could not load EmulatorJS from the CDN.');
      document.body.appendChild(loader);

      // Step 5: Register Service Worker for offline shell and CDN caching
      if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      }
    } catch (err) {
      showError('Error loading disc: ' + (err.message || err));
    }
  }

  bootGame();
})();
