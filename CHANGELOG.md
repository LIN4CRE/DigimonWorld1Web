# Changelog

This project is continuously deployed from `main` to Vercel
(<https://digimon-world-webui.vercel.app/>) and mirrored on GitHub Pages. It does not
publish semver Git tags; the browser boot loader carries its own version
(`BOOT_VERSION` in `public/emulator-boot.js`, currently **2.2.10**), which is the
user-facing build identifier. `package.json` is aligned to that version.

## Maintenance & hardening — 2026-11-05

Server, tooling, CI and documentation improvements. **The verified emulator boot path,
ROM chunks, OpenBIOS, disc repair patch, service worker and save behavior are unchanged**
(client build remains `v2.2.10`).

### Fixed
- **P0 server crash:** `server.mjs` no longer dies on directory requests (e.g. `/maps/`),
  which previously raised an unhandled `EISDIR` stream error and killed the process.
  Only regular files are streamed; stream errors and client aborts are handled.
- **Path traversal:** separator-aware containment guard prevents escaping `public/`
  (raw `..`, percent-encoded `..`, and sibling-prefix paths).
- **HTTP ranges:** correct RFC 7233 parsing — `206` with `Content-Range`, suffix and
  open-ended ranges, `416` for unsatisfiable ranges, `200` fallback for malformed headers.
- **Broken npm scripts:** removed references to non-existent files
  (`extract-ps1-data.mjs`, `extract-ps1-textures.mjs`, `extract-tfs-maps.mjs`, `upscale-hd.mjs`);
  scripts now point at the real tooling.
- **Non-portable tooling:** replaced hardcoded `C:\Users\...` absolute paths in eight
  scripts with repo-relative resolution (`scripts/repo-paths.mjs`) plus env overrides.
- **Documentation drift:** corrected the README architecture tree, test count, backup
  count (15, not 10), superseded RAM addresses, and the overstated multi-tab claim.

### Added
- HTTP server integration tests (17) covering the crash regression, traversal, ranges,
  HEAD, security headers, client-abort resilience and the disc/hex/disassembler APIs.
- `HEAD` support, security headers, graceful `SIGTERM`/`SIGINT` shutdown and a
  `clientError` guard in `server.mjs`; `createAppServer()` export for testability.
- CI workflow (`.github/workflows/ci.yml`): syntax check + tests on Node 20/22,
  least-privilege `contents: read`, SHA-pinned actions.
- Dependabot config for GitHub Actions, `SECURITY.md`, `.env.example`,
  `scripts/check-syntax.mjs` (`npm run check`), this changelog and `docs/ARCHITECTURE.md`.

### Removed
- Orphaned legacy "V-Pet" prototype `public/app.js` and `public/styles.css` (hardcoded
  fake game state, referenced by no HTML, service worker or boot script).

## 2.2.10 — current browser build

The deployed client (unchanged by the maintenance work above). Highlights documented in
the README:
- Black-screen boot fix: redistributable OpenBIOS + `pcsx_rearmed_bios = "auto"`, pinned
  EmulatorJS 4.2.3 / PCSX-ReARMed, runtime disc repair, numeric control seeding with legacy
  key-name migration, versioned service-worker cache and `window.DW1_BOOT_DIAGNOSTICS`.
- Safe expanded evolution storage decompressed to `0x801C8CD0..0x801CB560`; data-driven
  Fresh/starter paths; all table consumers redirected.
- IndexedDB disc cache with SHA-256 verification; instant-play session resume; atomic
  rolling backups (15); memory-card / live-state export & import.
- Quiz-mask and evolution-chart limit patches applied directly in the PS1 heap at game start.
