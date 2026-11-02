<div align="center">

<img src="public/assets/github-banner.svg" alt="Digimon World 1 — HD Web Edition & 127-Digimon ROM Patch Banner" width="100%" />

<br />

# 🦖 Digimon World 1 — Web Edition (`SLES-02914`)
### **Play the Real PlayStation 1 Game Directly in Your Browser**

[![Play Now Live](https://img.shields.io/badge/▶️_PLAY_LIVE_IN_BROWSER-digimon--world--1--web.vercel.app-22c55e?style=for-the-badge)](https://digimon-world-1-web.vercel.app/)
[![PlayStation 1](https://img.shields.io/badge/PlayStation_1-SLES--02914_(PAL)-f59e0b?style=for-the-badge&logo=playstation&logoColor=white)](https://digimon-world-1-web.vercel.app/)
[![Engine](https://img.shields.io/badge/Core-PCSX--ReARMed_WASM-a855f7?style=for-the-badge)](https://digimon-world-1-web.vercel.app/)
[![License: MIT](https://img.shields.io/badge/License-MIT-eab308?style=for-the-badge)](LICENSE)

<p align="center">
  <img src="public/favicon.svg" width="52" height="52" alt="V-Pet Icon" />
</p>

**Play the authentic 3D PlayStation 1 game (`Digimon World (Europe)`) directly in your browser at 2x High-Definition resolution — binary-patched to unlock all 66 Overworld, Boss, and Cut Digimon (`#62`–`#127`) alongside the original 61 partners!**

[🚀 **Quick Start**](#-quick-start) • [🔓 **127-Digimon ROM Patch**](#-how-the-127-digimon-binary-rom-patch-works) • [🖼️ **Extracted HD Assets**](#️-decoded-3d-file-island-maps--hd-3d-cards) • [🧬 **PS1 Memory Map**](#-reverse-engineered-ps1-ram--executable-map-sles_02914) • [🎮 **Controls**](#-controls)

</div>

---

## ✨ Key Features

- 🎮 **Direct Instant-Boot 3D PS1 Gameplay**: Boots straight into the real PlayStation 1 game in your browser via WebAssembly (`PCSX-ReARMed` + WebGL2) with HTTP `206 Partial Content` CD-ROM streaming.
- 🔓 **Expanded 127-species ROM patch (`patch-ps1-rom.mjs`)**:
  - Expands the resident evolution, requirement, training, and stat-gain tables to 128 slots; redirects every verified reference in the main executable and training/evolution overlays; and generates a stage-correct evolution graph from the reverse-engineered species database.
  - Installs full-width IDs without the old destructive `0x3F` masks, generates valid partner move records, repairs missing V-Pet animation slots, and recalculates Mode 2 Form 1 CD-ROM EDC sector checksums. Vanilla executable/overlay hashes and structural assertions prevent patching an incompatible or already modified dump.
- ⚡ **Live Browser-to-PS1 RAM Injection Bar**:
  - Pick **any of the 127 Digimon** from the top bar dropdown and click **`✨ Instant Digivolve Partner`** — injects the target species ID directly into PS1 RAM (`0x8013BFE0` & `0x8013BFE2` inside the live WebAssembly `HEAPU8` memory), triggering the real in-game **3D Digivolution Cutscene** on the very next frame!
  - One-click **`⚡ Max 999 Stats & Moves`** writes `999` Offense/Defense/Speed/Brains, `9999` HP/MP, `0` Virus gauge, and all 128 technique bitflags directly to `0x8016C830..0x8016C85F`.
- ✨ **2x Neon HD Shader Pipeline**: Real-time switchable display presets (**2x Neon HD**, **Ultra Crisp**, **CRT Arcade**, and **Native PS1**) with bilinear texture smoothing and high-resolution PSX GPU scaling.

---

## 🆕 Latest Changes

- 🧬 **Safe expanded evolution storage** — the 10,384-byte resident block is decompressed at startup to `0x801C8CD0..0x801CB560`; the heap then begins at `0x801CB560`. This replaces the old experimental writes that overlapped live interrupt state at `0x8011B990` and `0x8011C000`.
- 🥚 **Data-driven Fresh and starter paths** — a 16-entry starter roster resides at `0x801CB550`, and Fresh evolution (including DemiMeramon) uses the expanded forward-path rows. The starter selector uses the opening script result's low four bits; live quiz coverage of every roster entry still needs emulator verification.
- 🏋️ **All table consumers redirected** — verified references in `SLES_029.14`, `EVL_REL.BIN`, `TRN_REL.BIN`, and `TRN2_REL.BIN` now use the expanded raise, requirement, stat-gain, and path tables. Reverse paths are derived from forward edges and validated against the engine's five-predecessor/six-target limits.
- 💾 **IndexedDB disc cache** — the ~240 MB disc is downloaded **once**, verified with SHA-256, and stored in the browser's IndexedDB. Return visits boot from local storage with no re-download; changed chunks are re-fetched automatically and stale chunks removed. Persistent storage is requested and quota/write failures fall back to normal streaming. Run `node add-manifest-hashes.mjs` after re-splitting the ROM to refresh hashes.
- ⚡ **True Instant-Play & Automatic Session Resume** — Clicking your browser bookmark instantly returns you directly into your active game session where you left off. The engine continuously saves live state snapshots and memory-card data quietly in the background (every 25s, on tab switch / window minimize, on pagehide, and at in-game save points) with zero lag or frame drops.
- 🛡️ **Safe Atomic Backups & Multi-Tab Protection** — Prevents save corruption by rejecting incomplete snapshots and retaining rolling versioned backups (last 15). Multi-tab coordination via BroadcastChannel prevents conflicting writes.
- ⚡ **Progressive Parallel Loading & PWA Service Worker** — Cached disc chunks are read concurrently via IndexedDB for near-instant return visits, while the Service Worker caches the EmulatorJS runtime, WebAssembly core, and UI assets for offline readiness.
- 💾 **Dual Save Export / Import** — Top-right controls allow exporting standard PS1 Memory Card (.srm) saves (for DuckStation/RetroArch) or instant live state snapshots (.state), restoring versioned backups, or starting a clean new game with automatic backup safeguards.
- 🐉 **Veemon stand-in** — species slot 114 is named Veemon and reuses Agumon's unmodified `AGUM` model/texture (there is no blue recolor). Veemon evolves from Koromon into Greymon, Angemon, Kabuterimon, or Garurumon. A separate DW3 model-import effort is not part of this patch.

**Next up:** gamepad polish, progressive first-playable loading.

---
## 🖼️ Decoded 3D File Island Maps & HD 3D Cards

All pre-rendered 3D File Island room backgrounds (`MAP/*.TFS`), 3D Bandai Digimon Cards (`CARD/*.TIM`), and UI textures were reverse-engineered and decoded directly from the CD-ROM sectors into `public/`:

### 🗺️ Pre-Rendered 3D File Island Backgrounds (`MAP/*.TFS`)
| **File City (`VILL01.TFS`)** | **Native Forest (`MAYO01.TFS`)** | **Freezeland (`FREEZ01.TFS`)** | **Mt. Infinity (`MUGEN01.TFS`)** |
| :---: | :---: | :---: | :---: |
| <img src="public/maps/file_city.png" width="220" /> | <img src="public/maps/native_forest.png" width="220" /> | <img src="public/maps/freezeland.png" width="220" /> | <img src="public/maps/mt_infinity.png" width="220" /> |

### 🃏 2x EPX HD Bandai 3D Digimon Card Renders (`CARD/*.TIM`)
| **#03 Agumon** | **#05 Greymon** | **#12 MetalGreymon** | **#26 SkullGreymon** | **#54 Megadramon** | **#64 Machinedramon** |
| :---: | :---: | :---: | :---: | :---: | :---: |
| <img src="public/cards/card_00.png" width="120" /> | <img src="public/cards/card_02.png" width="120" /> | <img src="public/cards/card_09.png" width="120" /> | <img src="public/cards/card_23.png" width="120" /> | <img src="public/cards/card_51.png" width="120" /> | <img src="public/cards/card_61.png" width="120" /> |

---

## 🔓 How the 127-Digimon Binary ROM Patch Works

Running `node patch-ps1-rom.mjs` patches `rom/Digimon World (Europe).bin` in place. To preserve the clean dump, provide a separate output path:

```bash
node patch-ps1-rom.mjs --input /path/to/clean.bin --output /path/to/patched.bin
```

The patcher verifies the vanilla European `SLES_029.14` and `EVL_REL.BIN` SHA-1 hashes, builds and validates everything in memory, then writes the changed disc files and recalculates CD-ROM Mode 2 Form 1 EDC checksums.

| Area | Implementation |
| :--- | :--- |
| Expanded tables | 128 raise entries (28 bytes), 128 requirement entries (28 bytes), 128 stat-gain entries (14 bytes), 128 path rows (11 bytes), and a 16-byte starter roster are packed into a 10,384-byte resident block. |
| Startup decompression | Literal, fill, and back-reference streams occupy the old table storage. A leaf MIPS routine in two unreferenced EU library areas runs before `InitHeap3`, preserves its arguments, and decompresses the block before heap initialization. |
| Reference redirection | LUI/ADDIU and LUI/ORI references are redirected across all 17 executable/overlay text ranges. Expected reference counts and a zero-old-reference check reject incomplete or incompatible layouts. |
| Evolution logic | Forward paths enforce exact next-stage transitions. Reverse paths are derived automatically and capped at five entries. Fresh evolution uses the same expanded rows, so DemiMeramon has a defined path to Koromon. |
| Species and items | Database-derived IDs replace the old manual constants. Move/specialty/drop fields use verified 32-byte record offsets; Elec Ring targets Guardromon; vanilla item handlers and full-width target-ID loads are retained. |
| Models and animations | Slot 114 becomes Veemon with the `AGUM` fallback; Waregarurumon keeps `wEAG`. Empty animation slots are repaired using each runtime model's own `.MMD` file. |

`rom-expansion.mjs` contains the testable graph, compressor, MIPS builders, record patcher, and relocation logic. `npm test` executes the emitted routines in a MIPS test interpreter and does not require a ROM.

---

## 🦖 Species Coverage

Species IDs, levels, model codes, techniques, and item metadata come from `public/data/reverse-engineered-db.json`. The generated evolution graph checks that every non-NPC species is reachable through Fresh starts, starters, special/item evolution, or natural forward paths. Human NPC slots 116 and 118 are deliberately excluded from natural partner evolution.

---

## 🧬 Reverse-Engineered PS1 RAM & Executable Map (`SLES_029.14`)

Reverse-engineered using [`rea` (Reverse Engineering Assistant v6.7.0)](https://github.com/morluto/rea):

| PS1 Address / File Offset | Symbol / Structure | Description |
| :--- | :--- | :--- |
| `SLES_029.14 @ 0xA8B5C` | `g_DigimonSpeciesTable[128]` | `128 × 32-byte` records: radius/height/scale, type, level, three specialties, drop item/chance, and 16 technique bytes |
| `SLES_029.14 @ 0x9FCB8` | `g_TechniqueDataTable[121]` | `121 × 16-byte` battle technique records (power, MP cost, range, specialty, status, and accuracy data) |
| `SLES_029.14 @ 0xA0A58` | `g_ItemDataTable[128]` | `128 × 32-byte` item table (Price, Merit Value, Sort Category, Color Palette) |
| `SLES_029.14 @ 0xA10D8` | `g_EvolutionItemTargets[44]` | Maps item IDs 71–114 to their target Digivolution species IDs |
| `SLES_029.14 @ 0xA5114` | Vanilla `g_EvolutionStatGainTable[66]` | `66 × 14-byte` source entries; the patched runtime uses 128 entries at `0x801CA8D0` |
| `PS1 RAM @ 0x801C8CD0` | Expanded resident tables | Raise `0xE00`, requirements `0xE00`, stat gains `0x700`, paths `0x580`, then starters `0x10`; ends at `0x801CB560` |
| `PS1 RAM @ 0x8013BFE0` | `g_TargetEvolutionDigimonId` (`s16`) | Checked every frame at `0x800AA93C`. Setting to `1..127` + `[0x8013BFE2] = 1` triggers the 3D Evolution Cutscene |
| `PS1 RAM @ 0x8016C7F8` | `g_PartnerSpeciesId` (`u32`) | Active Partner Digimon Species ID (`1..127`) |
| `PS1 RAM @ 0x8016C830` | `g_PartnerStats` (`u16[4]`) | Partner Offense (`+0`), Defense (`+2`), Speed (`+4`), Brains (`+6`) (`max 999`) |
| `PS1 RAM @ 0x8016C840` | `g_PartnerHpMp` (`u16[4]`) | Max HP (`+0`), Max MP (`+2`), Current HP (`+4`), Current MP (`+6`) (`max 9999`) |
| `PS1 RAM @ 0x8016C850` | `g_LearnedTechniquesMask` (`u8[16]`) | 128-bit bitmask of all learned Digimon battle & finisher techniques |

---

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/LIN4CRE/DigimonWorld1Web.git
cd DigimonWorld1Web
```

### 2. Place Your European PS1 ROM (`SLES-02914`) & Apply the 127-Digimon Patch
Place your `Digimon World (Europe).bin` inside `rom/Digimon World (Europe).bin` (or set `DIGIMON_ROM_ZIP` to your `.zip` archive), then run the binary patcher:
```bash
# Expands evolution data, redirects executable/overlay references, repairs MMD animations,
# and recalculates CD-ROM EDC checksums. The clean dump is verified before patching.
node patch-ps1-rom.mjs
```

### 3. Start the Server & Play Instantly
```bash
npm start
```
Open **[`http://localhost:3456`](http://localhost:3456)** in any modern browser!

Run the boot/configuration regression checks with:

```bash
npm test
```

### If you previously saw `Firmware is missing: scph5502.bin`

That message comes from the Beetle/`mednafen_psx_hw` PlayStation core, which requires a region-matched, copyrighted Sony BIOS dump. This project does not distribute one. The browser build now:

- pins EmulatorJS `4.2.3` instead of the moving `stable` CDN path;
- boots `pcsx_rearmed` with `pcsx_rearmed_bios = "HLE"`;
- hides the alternate-core selector and removes stale `retroarch_core` / BIOS settings from `localStorage`;
- keeps memory-card saves and all other user settings intact.

A hard refresh after deploying the fix is enough; no BIOS upload is required. HLE compatibility is slightly lower than a user-supplied retail BIOS, but *Digimon World (Europe)* boots without one.

---

## 🎮 Controls

| PlayStation 1 Button | Default Keyboard Key | In-Game Action |
| :---: | :---: | :--- |
| **D-Pad** | `Arrow Keys` | Move Player / Navigate V-Pet Care Menus |
| **✕ (Cross)** | `Z` or `X` | Confirm / Talk / Feed / Praise / Command Partner |
| **○ (Circle)** | `X` or `Z` | Cancel / Run |
| **△ (Triangle)** | `A` or `S` | Open Inventory / Partner Status Menu |
| **□ (Square)** | `S` or `A` | Check Map / Sub-Action |
| **Start** | `Enter` | Pause / Skip FMV Intro / Confirm Name |
| **Select** | `Shift` | Toggle UI Overlay |

*(Full USB/Bluetooth Gamepad support is built in via the Web Gamepad API — press any button on your Xbox, DualSense, or DualShock controller to play!)*

---

## 📁 Repository Architecture

```text
DigimonWorld1Web/
├── public/
│   ├── index.html                  # Direct-boot 3D PS1 Web Edition + Live 127-Digimon RAM Unlocker Bar
│   ├── emulator.html               # Standalone/iframe full-screen emulator entry point
│   ├── emulator-boot.js            # Shared BIOS-free boot, ROM cache and save-control logic
│   ├── assets/                     # GitHub Hero Banner (SVG) & OpenGraph Social Card (PNG)
│   ├── cards/                      # 66 Decoded 2x EPX HD Bandai 3D Digimon Card Portraits (card_00..65.png)
│   ├── maps/                       # 9 Decoded Pre-Rendered 3D File Island .TFS Backgrounds (file_city.png, etc.)
│   ├── textures/                   # 14 Decoded 2x EPX HD PS1 .TIM UI & World Textures (TITLE256.png, etc.)
│   └── data/
│       └── reverse-engineered-db.json  # Complete extracted 127-Digimon, 121-Move, 128-Item & MIPS database
├── server.mjs                      # Zero-dependency Node.js HTTP 206 Range-Streaming Server & MIPS Disassembler API
├── add-manifest-hashes.mjs         # Adds SHA-256 hashes + version to the ROM chunk manifest (IndexedDB cache)
├── split-rom-for-pages.mjs         # Splits the patched disc zip into <50 MB streamable chunks
├── patch-ps1-rom.mjs               # Clean-disc driver, EDC writer, and read-back verification
├── rom-expansion.mjs               # Evolution graph, compressor, MIPS builders, records, and relocation logic
├── test-support/mips-interpreter.mjs # Delay-slot-aware MIPS interpreter used by ROM-independent tests
├── extract-ps1-data.mjs            # ISO-9660 Sector Extractor & SLES_029.14 Struct Parser
├── extract-ps1-textures.mjs        # PS1 4/8/16-BPP .TIM Texture & 3D Card Decoder
├── extract-tfs-maps.mjs            # Pre-Rendered 3D File Island .TFS Map Background Decoder
├── upscale-hd.mjs                  # Pure-JS 2x EPX / Scale2x + Bilateral HD Texture Upscaler
├── generate-github-assets.mjs      # Pure-JS Generator for GitHub Banner, OpenGraph Card, Favicons & WebManifest
└── test/                           # Emulator boot checks plus ROM graph/compression/MIPS/record regression tests
```

---

## ⚖️ Legal & Disclaimer

This repository provides reverse-engineering research tools, binary patch scripts, and a browser interface. **No proprietary Sony PlayStation BIOS files or raw `.bin`/`.iso` ROM dumps are hosted or distributed in this repository** (see [`.gitignore`](.gitignore)). The browser emulator uses the open, built-in HLE BIOS in PCSX-ReARMed rather than a Sony firmware image. *Digimon World* is a registered trademark of **Bandai Namco Entertainment Inc.**
