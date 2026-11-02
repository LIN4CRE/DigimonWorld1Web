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
- 🔓 **All 127 Digimon Playable as Partners (`patch-ps1-rom.mjs`)**:
  - In vanilla *Digimon World 1*, only **61 Digimon** (`#1 Botamon` – `#61 MasterTyrannomon`) can be raised; **66 additional Digimon** (`#62 Goburimon` – `#126 Jijimon` + `#127 Market Manager`) exist on the disc with 3D `.MMD` models, textures, stats, and moves, but are hard-locked by a `0x3F` (`63`) bitmask in the evolution overlay (`EVL_REL.BIN`) and partner spawner (`SLES_029.14`).
  - Our binary patch removes the `0x3F` bitmask across `SLES_029.14` and `EVL_REL.BIN`, heals all `NULL` V-Pet care animation pointers in 64 overworld/boss `.MMD` 3D model files so they never freeze when eating/sleeping/training, and recomputes Mode 2 Form 1 CD-ROM EDC sector checksums.
- ⚡ **Live Browser-to-PS1 RAM Injection Bar**:
  - Pick **any of the 127 Digimon** from the top bar dropdown and click **`✨ Instant Digivolve Partner`** — injects the target species ID directly into PS1 RAM (`0x8013BFE0` & `0x8013BFE2` inside the live WebAssembly `HEAPU8` memory), triggering the real in-game **3D Digivolution Cutscene** on the very next frame!
  - One-click **`⚡ Max 999 Stats & Moves`** writes `999` Offense/Defense/Speed/Brains, `9999` HP/MP, `0` Virus gauge, and all 128 technique bitflags directly to `0x8016C830..0x8016C85F`.
- ✨ **2x Neon HD Shader Pipeline**: Real-time switchable display presets (**2x Neon HD**, **Ultra Crisp**, **CRT Arcade**, and **Native PS1**) with bilinear texture smoothing and high-resolution PSX GPU scaling.

---

## 🆕 Latest Changes

- 🧬 **Expanded 128-slot evolution matrix** — relocated to `0x8011B990` in `SLES_029.14`; all 9 evolution-table pointers repointed, so the extra species can be trained into and evolved from.
- 🥚 **16 starter Rookies via Jijimon's opening quiz** — new starter table at `0x8011C000`; the quiz spawner at `0x80114B84` was patched so you are no longer limited to Agumon/Gabumon. The naming screen in Map 218 is protected from the change.
- 🏋️ **Located training data** — Green Gym stat-requirement table (`0x80134A30`, 28 bytes/entry) and base evolution stats (`0x80135114`, 14 bytes/entry) are documented for adding new species.
- 💾 **IndexedDB disc cache** — the ~240 MB disc is downloaded **once**, verified with SHA-256, and stored in the browser's IndexedDB. Return visits boot from local storage with no re-download; changed chunks are re-fetched automatically and stale chunks removed. Persistent storage is requested and quota/write failures fall back to normal streaming. Run `node add-manifest-hashes.mjs` after re-splitting the ROM to refresh hashes.
- 💾 **Memory-card save export / import** — top-right buttons (appear once the game starts): **Export save** downloads your memory card as a .srm file (compatible with other PS1 emulators), **Import save** loads one, **Restore backup** rolls back. Automatic versioned backups (last 10) are written to IndexedDB every 2 minutes and before every import, so nothing is overwritten silently.
- 🔬 **In progress: Veemon from *Digimon World 3*** — research so far located `M145VMON.BIN` in DW3's disc and decoded its `RLEN`-compressed texture. Veemon is **not yet in the game**; converting the model into DW1's `.MMD` format is still to do. (DW3 assets are never committed to this repo.)
- 🐉 **Veemon patch update** – added Veemon as a blue stand‑in using Agumon's model and texture (ID 114). Replaces Goburimon in starter pool; evolves from Koromon into six Champions.

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

Running `node patch-ps1-rom.mjs` applies five surgical binary patches to `rom/Digimon World (Europe).bin` and recalculates CD-ROM Mode 2 Form 1 EDC checksums:

| # | Target Binary | Offset / VAddr | Original MIPS Instruction | Patched MIPS Instruction | Purpose |
| :-: | :--- | :--- | :--- | :--- | :--- |
| **1** | `SLES_029.14` | `0x0730D0` (`0x801030D0`) | `lb $v0, 0x34($sp)` (`0x83A20034`) | `lhu $v0, 0x34($sp)` (`0x87A20034`) | Prevents `EVL_REL.BIN`’s `0x40` overlay flag from sign-extending into negative model offsets during evolution |
| **2** | `SLES_029.14` | `0x06DD98` (`0x800FDD98`) | `lh $s1, 0x3C($sp)` (`0x87B1003C`) | `lhu $s1, 0x3C($sp)` (`0x87B1003C`) | Allows Partner 3D Spawner (`0x800FDD40`) to load Digimon IDs `#62`–`#127` on every map |
| **3** | `EVL_REL.BIN` | `0x4468`, `0x4484`, `0x4564` | `andi $v1, $v1, 0x3F` (`0x3063003F`) | `andi $v1, $v1, 0xFF` (`0x306300FF`) + `lhu` | Removes the `0x3F` (`63`) partner ID cap inside the 3D Evolution Cutscene renderer |
| **4** | `SLES_029.14` | `0x03B538` (`0x800CB538`) | `bne $v0, $v1, 0x800CB568` | `nop` (`0x00000000`) | Removes Rookie/Champion stage lock on all Digivolution Items & activates `#114 Moon Mirror`, `#125 Giga Hand`, `#126 Noble Mane`, `#127 Metal Banana`, and `#83 Elec Ring` |
| **5** | `ALL/*.MMD` | 64 Overworld `.MMD` files | `0x00000000` (NULL anim slots) | Fallback Idle/Happy/Walk anim pointer | Populates missing V-Pet care animation slots (`eat`, `sleep`, `praise`, `scold`, `train`) so Overworld & Boss Digimon never crash |

---

## 🦖 All 66 Newly Unlocked Overworld / Boss / Cut Digimon (`#62`–`#127`)

In addition to the 61 standard Partner Digimon (`#1 Botamon` – `#61 MasterTyrannomon`), the ROM patch and top-bar selector unlock:

| ID Range | Unlocked Digimon Species |
| :--- | :--- |
| **`#62` – `#75`** | `#62 Goburimon` • `#63 Ogremon` • `#64 Hyogamon` • `#65 Fugamon` • `#66 Gazimon` • `#67 Pagumon` • `#68 ModokiBetamon` • `#69 ToyAgumon` • `#70 ClearAgumon` • `#71 RedVegiemon` • `#72 WaruMonzaemon` • `#73 Tankmon` • `#74 Hagurumon` • `#75 WaruSeadramon` |
| **`#76` – `#90`** | `#76 Psychemon` • `#77 Tsukaimon` • `#78 Gururumon` • `#79 Saberdramon` • `#80 SnowAgumon` • `#81 IceDevimon` • `#82 Snimon` • `#83 Yanmamon` • `#84 SandYanmamon` • `#85 Darkrizamon` • `#86 FlareRizamon` • `#87 MoriShellmon` • `#88 Pidmon` • `#89 Aruraumon` • `#90 Geremon` |
| **`#91` – `#105`** | `#91 Vermilimon` • `#92 Guardromon` • `#93 Muchomon` • `#94 Icemon` • `#95 Akatorimon` • `#96 Gotsumon` • `#97 MudFrigimon` • `#98 Tekkamon` • `#99 ShimaUnimon` • `#100 PlatinumSukamon` • `#101 Weedmon` • `#102 Rockmon` • `#103 BlueMeramon` • `#104J-Mojyamon` • `#105 NiseDrimogemon` |
| **`#106` – `#127`** | `#106 Brachiomon` • `#107 Demidevimon` • `#108 Dokugumon` • `#109 Soulmon` • `#110 Gigadramon` • **`#111 Machinedramon (Final Boss)`** • `#112 Tinmon` • `#113Cherrymon` • `#114 MetalEtemon` • `#115 Otamamon` • `#116 Gekomon` • `#117 ShogunGekomon` • `#118 MasterVademon` • `#119 Tentomon` • `#120 Kabuterimon` • `#121 MegaKabuterimon` • **`#122 WereGarurumon (Cut)`** • **`#123 Panjyamon (Cut)`** • **`#124 Warumonzaemon 2`** • **`#125 Kimeramon (Cut)`** • **`#126 Jijimon`** • **`#127 Market Manager`** |

---

## 🧬 Reverse-Engineered PS1 RAM & Executable Map (`SLES_029.14`)

Reverse-engineered using [`rea` (Reverse Engineering Assistant v6.7.0)](https://github.com/morluto/rea):

| PS1 Address / File Offset | Symbol / Structure | Description |
| :--- | :--- | :--- |
| `SLES_029.14 @ 0xA8B5C` | `g_DigimonSpeciesTable[127]` | `127 × 52-byte` struct array (20-byte ASCII name, 3D radius, Type, Level, Default Techs, Drop Item) |
| `SLES_029.14 @ 0x9FCB8` | `g_TechniqueDataTable[121]` | `121 × 28-byte` battle technique table (Power, MP/3, Range, Element, Status Effect, Jamming Chance) |
| `SLES_029.14 @ 0xA0A58` | `g_ItemDataTable[128]` | `128 × 32-byte` item table (Price, Merit Value, Sort Category, Color Palette) |
| `SLES_029.14 @ 0xA10D8` | `g_EvolutionItemTargets[45]` | Maps Item IDs (`#82`–`#127`) to their target Digivolution Species ID |
| `SLES_029.14 @ 0xA5114` | `g_EvolutionStatGainTable[127]` | `127 × 14-byte` stat-gain table (`HP/10, MP/10, Off, Def, Spd, Brn, Lifespan` gains on evolution) |
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
# Unlocks all 127 Digimon in SLES_029.14 + EVL_REL.BIN + 64 MMD 3D models & recalculates CD-ROM EDC checksums
node patch-ps1-rom.mjs
```

### 3. Start the Server & Play Instantly
```bash
npm start
```
Open **[`http://127.0.0.1:3456`](http://127.0.0.1:3456)** in any modern browser!

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
│   ├── assets/                     # GitHub Hero Banner (SVG) & OpenGraph Social Card (PNG)
│   ├── cards/                      # 66 Decoded 2x EPX HD Bandai 3D Digimon Card Portraits (card_00..65.png)
│   ├── maps/                       # 9 Decoded Pre-Rendered 3D File Island .TFS Backgrounds (file_city.png, etc.)
│   ├── textures/                   # 14 Decoded 2x EPX HD PS1 .TIM UI & World Textures (TITLE256.png, etc.)
│   └── data/
│       └── reverse-engineered-db.json  # Complete extracted 127-Digimon, 121-Move, 128-Item & MIPS database
├── server.mjs                      # Zero-dependency Node.js HTTP 206 Range-Streaming Server & MIPS Disassembler API
├── add-manifest-hashes.mjs         # Adds SHA-256 hashes + version to the ROM chunk manifest (IndexedDB cache)
├── split-rom-for-pages.mjs         # Splits the patched disc zip into <50 MB streamable chunks
├── patch-ps1-rom.mjs               # Binary ROM Patcher unlocking all 127 Digimon in SLES_029.14, EVL_REL.BIN & *.MMD
├── extract-ps1-data.mjs            # ISO-9660 Sector Extractor & SLES_029.14 Struct Parser
├── extract-ps1-textures.mjs        # PS1 4/8/16-BPP .TIM Texture & 3D Card Decoder
├── extract-tfs-maps.mjs            # Pre-Rendered 3D File Island .TFS Map Background Decoder
├── upscale-hd.mjs                  # Pure-JS 2x EPX / Scale2x + Bilateral HD Texture Upscaler
└── generate-github-assets.mjs      # Pure-JS Generator for GitHub Banner, OpenGraph Card, Favicons & WebManifest
```

---

## ⚖️ Legal & Disclaimer

This repository provides reverse-engineering research tools, binary patch scripts, and a browser interface. **No proprietary Sony PlayStation BIOS files or raw `.bin`/`.iso` ROM dumps are hosted or distributed in this repository** (see [`.gitignore`](.gitignore)). *Digimon World* is a registered trademark of **Bandai Namco Entertainment Inc.**
