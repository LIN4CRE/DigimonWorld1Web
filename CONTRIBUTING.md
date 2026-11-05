# Contributing to DigimonWorld1Web 🦖

Thank you for your interest in contributing to **DigimonWorld1Web**! Whether you're researching additional `SLES_029.14` MIPS subroutines, improving `.MMD` 3D model animation mappings, or refining the WebGL2 HD shaders, contributions are welcome.

## 🛠️ Development Workflow

1. **Fork & Clone** the repository:
   ```bash
   git clone https://github.com/LIN4CRE/DigimonWorld1Web.git
   cd DigimonWorld1Web
   ```
2. **Place Your Clean Dump** of `Digimon World (Europe).bin` (`SLES-02914`) into `rom/Digimon World (Europe).bin`.
3. **Run the Binary ROM Patcher**:
   ```bash
   node patch-ps1-rom.mjs
   ```
4. **Start the Development Server**:
   ```bash
   npm start
   ```
5. **Verify Syntax, Regression Tests & Asset Generation**:
   ```bash
   npm run check          # cross-platform syntax check of every module + browser scripts
   npm test               # boot/ROM regression + HTTP server integration tests (no ROM required)
   npm run generate:assets  # deterministic banner / OpenGraph / favicon / manifest generation
   ```

   CI (`.github/workflows/ci.yml`) runs `npm run check` and `npm test` on Node 20 and 22 for
   every push and pull request to `main`. Please make sure both pass locally before opening a PR.

   The ROM tests do not need a game dump. To preserve your clean dump while checking a full patch build, use:
   ```bash
   node patch-ps1-rom.mjs --input /path/to/clean.bin --output /path/to/patched.bin
   ```

## ⚠️ Important Rules
- **Never commit raw ROM files (`*.bin`, `*.cue`, `*.iso`, `*.zip`) or extracted `SLES_029.14` executables.** These are excluded by `.gitignore`.
- Document any new `SLES_029.14` or `EVL_REL.BIN` offsets with both their file offset and PS1 RAM virtual address (`0x80090000 + offset`).
