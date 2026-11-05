# Architecture Overview

DigimonWorld1Web plays the real PlayStation 1 game *Digimon World* (Europe, `SLES-02914`)
in the browser. It is a **static web application** (no backend in production) built around
the EmulatorJS runtime and a binary-patched disc image, plus offline Node tooling for ROM
reverse engineering and a zero-dependency local preview server.

## Components

```
Browser (production = static files only)
├── index.html / public/index.html / public/emulator.html   identical entry shells
├── public/emulator-boot.js   boot loader, disc assembly, save engine, diagnostics
├── public/sw.js              service worker (offline shell + CDN core caching)
├── public/bios/openbios.bin  MIT PCSX-Redux OpenBIOS (no Sony firmware)
├── public/rom/part0..4.bin   committed disc chunks (~229 MB) + manifest.json (SHA-256)
├── public/rom/disc-patch-v2.json  small runtime repair applied to the decompressed disc
└── EmulatorJS 4.2.3 + PCSX-ReARMed WASM (loaded from cdn.emulatorjs.org, cached by SW)

Local development / preview
└── server.mjs                zero-dependency HTTP server: static files, 206 range
                              streaming, and read-only disc/MIPS research APIs

Offline tooling (Node, requires a user-supplied disc image; ROM is gitignored)
├── analyze-ps1-disc.mjs / analyze-sles-and-data.mjs   disc + executable analysis
├── extract-game-data.mjs / extract-hd-assets.mjs       strings, maps, cards
├── build-reverse-engineered-db.mjs                     species/move/item database
├── rom-expansion.mjs + patch-ps1-rom.mjs               127-species binary ROM patch
├── scripts/generate-disc-patch.mjs                     auditable source→target disc patch
├── split-rom-for-pages.mjs + add-manifest-hashes.mjs   chunking + integrity manifest
├── generate-github-assets.mjs                          banner / OG / favicons / manifest
└── scripts/repo-paths.mjs                              portable path resolution
```

## Boot flow (`public/emulator-boot.js`)

1. **Session check** — read the active save snapshot from IndexedDB (`dw1-saves`).
2. **Manifest + disc assembly** — resolve `rom/manifest.json` (local → GitHub fallback),
   read cached chunks from IndexedDB (`dw1-disc-cache`) concurrently, download missing
   chunks with SHA-256 verification, and assemble a `File` blob.
3. **Configure emulator** — pin PCSX-ReARMed + OpenBIOS (`auto`), seed numeric control
   bindings (migrating legacy key names), and set `EJS_loadStateURL` for instant resume.
4. **Firmware + repair data** — fetch and checksum OpenBIOS; load and validate
   `disc-patch-v2.json`; install emulator hooks.
5. **Mount + repair** — wrap `downloadRom`; after the disc is decompressed into the
   EmulatorJS filesystem, apply the patch in place with streamed `FS.read`/`FS.write`
   (verifying every `before` range and reading back every `after` range).
6. **Game start** — restore the memory card, apply quiz/chart heap patches, focus `#game`,
   assign gamepads, start silent autosave, and probe for the first non-black frame.

Every stage reports to `window.DW1_BOOT_DIAGNOSTICS` with timeouts, so a failure surfaces
as a precise error instead of a silent black screen.

## Save system

- **Autosave:** every 25 s, on tab hide, `pagehide`/`beforeunload`, and in-game memory-card
  writes. Snapshots smaller than 500 KB are rejected as incomplete.
- **Backups:** rolling last 15 versioned snapshots in IndexedDB; restore via the Backups modal.
- **Export/import:** standard PS1 memory card (`.srm`, 128 KB) and live state (`.state`).
- **Multi-tab:** BroadcastChannel notifies other tabs of saves (last-write-wins).

## Local server endpoints (`server.mjs`)

| Route | Purpose |
| :--- | :--- |
| `GET /…` | Static files from `public/` with 206 range support, HEAD, security headers |
| `GET /rom/Digimon World (Europe).{zip,bin,cue}` | Stream a user-supplied disc image |
| `GET /api/disc-files` | ISO-9660 disc index (from `extracted/disc-index.json`) |
| `GET /api/disc-hex?lba=&size=&offset=` | Raw hex slice by LBA (honest `ROM_NOT_MOUNTED` state without a disc) |
| `GET /api/mips-disasm?vaddr=&count=` | R3000A disassembly of `SLES_029.14` (database fallback without it) |

The server serves regular files only, blocks traversal outside `public/`, validates range
and API inputs, and shuts down gracefully on `SIGTERM`/`SIGINT`.

## Deployment topology

- **Vercel** (`digimon-world-webui`, GitHub-connected, production branch `main`): serves
  `public/` at the site root with cache/security headers from `vercel.json`. Pushes to
  `main` deploy production; pull requests get preview deployments.
- **GitHub Pages** (legacy build from `main` root): mirrors the repo under
  `/DigimonWorld1Web/`, with the app reachable via `/public/`. The boot script's relative
  path fallbacks support this layout.

## Testing strategy

- `test/emulator-boot.test.mjs` — runs the boot script in a `vm` with mocked DOM/fetch/
  IndexedDB/localStorage; asserts configuration, disc repair, save safeguards, control
  migration, service-worker and Vercel config, and the live deployment URL.
- `test/rom-expansion.test.mjs` — evolution graph, compressor, and emitted MIPS routines
  executed in a delay-slot-aware interpreter (`test-support/mips-interpreter.mjs`); no ROM needed.
- `test/server.test.mjs` — real HTTP integration tests against `createAppServer()` on an
  ephemeral port: crash regression, traversal, ranges, HEAD, headers, aborts and APIs.

Run everything with `npm test`; syntax with `npm run check`. CI runs both on Node 20 and 22.
