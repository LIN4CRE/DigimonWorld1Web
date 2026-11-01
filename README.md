# DigimonWorld1Web — Digimon World (Europe) `[SLES_029.14]` Reverse-Engineered WebUI

An interactive browser-based **Digimon World 1 (PlayStation 1, Europe `SLES_029.14`)** WebUI, reverse-engineering workbench, and playable File Island V-Pet / Battle Arena powered by **[morluto/rea](https://github.com/morluto/rea)** (`rea-agents`) and direct MIPS R3000A / ISO9660 binary analysis.

---

## ✨ Features

1. **🎮 Play File Island WebUI (Native Browser Edition)**
   * Interactive HTML5 Canvas File Island V-Pet, Green Gym & Wild Battle Arena backed directly by the 32-byte Digimon structs (`0xA8B5C`), 16-byte Technique structs (`0x9FCB8`), and 128 Item structs (`0xA0A58`) extracted from `SLES_029.14`.
   * Renders authentic PlayStation 1 `.TIM` textures (`TITLE256.TIM`, `ITEM.TIM`, `FI_INFO.TIM`, `BTLCOMND.TIM`) with per-item CLUT color palettes (`SLES_029.14 @ 0xA1058`).
   * Raise, feed, train, praise, clean, battle, and Digivolve across all **127 Digimon & Boss entities** and **37 Digivolution items**.

2. **💿 Full PS1 ROM Emulator (WebAssembly `pcsx_rearmed`)**
   * Streams your local `Digimon World (Europe).zip` (or `.bin`/`.cue`) with HTTP `206 Partial Content` range requests directly into EmulatorJS (`pcsx_rearmed`) in the browser.

3. **🔬 REA & MIPS R3000A Disassembler Workbench**
   * Displays the cryptographic `rea-agents` Artifact Graph (`rea inspect-artifact`), PS-X EXE Header (`PC0 = 0x800A4B40`, `t_addr = 0x80090800`), the `0x80010000–0x800907FF` (514 KB) Dynamic Overlay Arena (`*_REL.BIN`), and a live MIPS R3000A disassembler.

4. **📚 Extracted ROM Database**
   * Search and filter all **127 Digimon structs**, **121 Battle Techniques** (with exact Base Power, `MP × 3` cost, Range, Element, and Status Effect chance), **128 Items** (with authentic `ITEM.TIM` 16×16 sprites and RAM handler pointers), and **14 decoded `.TIM` textures**.

5. **🗂️ ISO 9660 Disc Explorer & Live Sector Hex Viewer**
   * Browse all **887 files and folders** on the PlayStation 1 Mode2/2352 CD-ROM and inspect raw sector hex/ASCII dumps live.

---

## 🚀 Quick Start

```bash
git clone https://github.com/LIN4CRE/DigimonWorld1Web.git
cd DigimonWorld1Web
npm start
```

Then open **http://127.0.0.1:3456** in your browser.

### Optional: Mounting Your Local PS1 ROM for Full Emulator & Raw Sector Hex Streaming
Place `Digimon World (Europe).zip` (or `Digimon World (Europe).bin` + `Digimon World (Europe).cue`) inside `./rom/` (or set `DIGIMON_ROM_ZIP="D:\games\Digimon World (Europe).zip"`).
To re-run the full extraction and `.TIM` texture decoding pipeline from scratch:

```bash
npm run analyze:disc
npm run analyze:sles
npm run build:db
```
