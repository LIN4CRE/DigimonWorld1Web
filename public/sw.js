/*
 * Digimon World 1 (Web Edition) — Service Worker
 * Provides instant startup, offline shell caching, and background asset prefetching.
 */

const CACHE_NAME = 'dw1-v2.2.5';

// Shell resources to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/emulator-boot.js',
  '/emulator-boot.js?v=2.2.5',
  '/bios/openbios.bin',
  '/bios/OpenBIOS.LICENSE',
  '/rom/disc-patch-v2.json',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png'
];

// EmulatorJS runtime CDN assets that can be cached for instant startup
const CDN_PRECACHE_ASSETS = [
  'https://cdn.emulatorjs.org/4.2.3/data/loader.js',
  'https://cdn.emulatorjs.org/4.2.3/data/emulator.min.js',
  'https://cdn.emulatorjs.org/4.2.3/data/emulator.min.css',
  'https://cdn.emulatorjs.org/4.2.3/data/cores/reports/pcsx_rearmed.json',
  'https://cdn.emulatorjs.org/4.2.3/data/cores/pcsx_rearmed-wasm.data'
];

// Critical boot inputs: always try the network first so a redeploy cannot be
// pinned to an old boot script, BIOS, manifest, or disc repair patch.
const CRITICAL_PATHS = [
  '/',
  '/index.html',
  '/emulator-boot.js',
  '/rom/manifest.json',
  '/rom/disc-patch-v2.json',
  '/bios/openbios.bin'
];

// Secondary background assets to prefetch when idle
const BACKGROUND_ASSETS = [
  '/data/reverse-engineered-db.json',
  '/textures/TITLE256.png',
  '/textures/ITEM.png',
  '/textures/BTLCOMND.png',
  '/textures/FI_INFO.png',
  '/textures/B_TOGI.png',
  '/maps/file_city.png',
  '/maps/native_forest.png',
  '/maps/green_gym.png'
];

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    // The Cache API only accepts GET requests. EmulatorJS issues HEAD probes for
    // the BIOS, and an unhandled cache.put() rejection here would fail that
    // probe and abort the boot with "reading 'content-length'".
    if (response.ok && request.method === 'GET') {
      try {
        await cache.put(request, response.clone());
      } catch (err) {
        // Caching is best-effort; never let it break the response.
      }
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request).catch(() => undefined);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Pre-cache local shell assets
      await cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[DW1-SW] Pre-caching local shell assets failed:', err);
      });
      // Best-effort pre-caching of CDN core assets
      for (const url of CDN_PRECACHE_ASSETS) {
        try {
          const req = new Request(url, { mode: 'cors' });
          const res = await fetch(req);
          if (res.ok) await cache.put(req, res);
        } catch (e) {
          // Non-blocking
        }
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();

      // Idle background pre-fetch
      setTimeout(async () => {
        try {
          const cache = await caches.open(CACHE_NAME);
          for (const url of BACKGROUND_ASSETS) {
            try {
              if (!(await cache.match(url))) {
                const res = await fetch(url);
                if (res.ok) await cache.put(url, res);
              }
            } catch (e) {}
          }
        } catch (e) {}
      }, 5000);
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass ROM parts: large 50MB disc chunks are handled exclusively by IndexedDB
  if (url.pathname.endsWith('.bin') && url.pathname.includes('part')) {
    return;
  }

  // Network-first for boot-critical assets, with offline cache fallback.
  if (CRITICAL_PATHS.includes(url.pathname)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Cache-first for EmulatorJS CDN assets & local static assets
  if (
    url.hostname === 'cdn.emulatorjs.org' ||
    url.origin === self.location.origin
  ) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        try {
          const response = await fetch(event.request);
          if (response.ok && event.request.method === 'GET') {
            const cache = await caches.open(CACHE_NAME);
            cache.put(event.request, response.clone());
          }
          return response;
        } catch (err) {
          // If offline and request is HTML, return cached index
          if (event.request.mode === 'navigate') {
            const indexCached = await caches.match('/index.html') || await caches.match('/');
            if (indexCached) return indexCached;
          }
          throw err;
        }
      })()
    );
  }
});
