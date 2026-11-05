# Repository Improvement Plan — DigimonWorld1Web

Baseline established: `npm test` = 24/24 PASS on Node v22.22.3. Working tree clean on
`arena/ff228815-digimonworld1web` (from `main` @ 701df28). Live production verified:
- Vercel `https://digimon-world-webui.vercel.app/` boots EmulatorJS to `ejsReady` (rendered UI confirmed).
- GitHub Pages `https://lin4cre.github.io/DigimonWorld1Web/` serves v2.2.10 boot script.

## Project type
Browser PS1 emulator (EmulatorJS 4.2.3 + PCSX-ReARMed WASM) playing Digimon World (Europe,
SLES-02914) with a 127-species binary ROM patch. Static frontend in `public/`, a
zero-dependency Node dev/preview server (`server.mjs`), and ROM reverse-engineering tooling.
Deployment: Vercel (GitHub-connected, production branch `main`) + GitHub Pages mirror.

## Findings & priorities

### P0 — Critical
1. **Remote server crash (DoS).** `server.mjs` `serveFileWithRange` streams any path that
   exists, including directories. `GET /maps/` (or `/rom/`, `/bios/`, `/cards/`…) raises an
   unhandled `EISDIR` 'error' event and kills the whole process. Reproduced. Any read-stream
   error or client abort can likewise crash it.
   - Fix: serve regular files only; handle stream `error`/client `close`; 404 for directories.
   - Verify: HTTP integration tests asserting the server survives directory/error/abort requests.
2. **Path-traversal prefix weakness.** `safePath.startsWith(PUBLIC_DIR)` (no trailing sep)
   would allow a sibling like `public-evil`. Harden with `path.resolve` + separator-aware check.
   - Verify: traversal tests (`/../`, encoded, sibling-prefix) return 403/404 and never leak.

### P1 — High
3. **Malformed/unsatisfiable Range handling.** `parseInt('abc')` → NaN → bad stream/206.
   No 416 for out-of-range, no suffix-range support. Implement RFC 7233 parsing + 416.
   - Verify: range unit tests (valid, suffix, open-ended, unsatisfiable → 416, malformed → 200).
4. **Broken npm scripts.** `extract:data`, `extract:textures`, `extract:maps`, `upscale:hd`
   point to files that do not exist. Repoint to real tooling / remove dead entries.
   - Verify: every `package.json` script target exists.
5. **Hardcoded `C:\Users\David\...` paths** in 8 tooling scripts make them non-reproducible
   on any other machine. Derive repo root from `import.meta.url`, allow env/CLI override.
   - Verify: `node --check` + scripts resolve repo-relative paths; asset generator runs from checkout.

### P2 — Medium
6. **No CI.** Add `.github/workflows/ci.yml` (test + syntax check on push/PR), least-privilege
   `permissions: contents: read`, pinned action SHAs.
7. **No Dependabot / security policy.** Add `.github/dependabot.yml` (github-actions), `SECURITY.md`,
   document manual GitHub settings (secret scanning, push protection, branch protection).
8. **Orphaned fake "V-Pet" prototype** `public/app.js` + `public/styles.css` (hardcoded stats,
   inventory, fake game state) referenced by no HTML/SW/boot. Remove dead mock functionality.
   - Verify: grep confirms zero references; tests still pass; live boot unaffected.
9. **Server hardening parity.** Add security headers, HEAD support, graceful SIGTERM/SIGINT
   shutdown, `clientError` guard, export `createAppServer` for tests.
10. **Documentation drift.** README file tree lists non-existent scripts; backup count mismatch
    (docs say 10, code keeps 15). Correct README, add `.env.example`, `CHANGELOG.md`, `docs/ARCHITECTURE.md`.
11. **`add-manifest-hashes.mjs`** fragile URL→path conversion; use `fileURLToPath`.

### P3 — Low
12. `package.json` version (2.0.0) vs deployed boot (2.2.10): align metadata; add `engines` (node >=20).
13. `.gitignore`: add `.env`, save artifacts (`*.srm`,`*.state`,`*.mcr`), coverage.

## Explicitly preserved (no changes)
- Emulator boot logic, ROM chunks, OpenBIOS, disc patch, service-worker cache strategy,
  RAM-injection / autosave / multi-tab behavior — all verified working in production.
- No framework/dependency migrations, no rewrite, no new paid services.

## Deployment route
Commit to working branch → push → PR → merge to `main` → Vercel production deploy
(GitHub-connected) + GitHub Pages. Verify via Vercel connector + `fetch_page` smoke tests.
Sandbox bash egress is limited to github/npm/pypi hosts, so live HTTP verification uses
`fetch_page`/Vercel connector; real-browser CDN E2E is blocked in-sandbox (documented).
