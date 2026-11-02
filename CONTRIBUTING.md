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
5. **Verify Syntax & Asset Generation**:
   ```bash
   node --check server.mjs
   node --check patch-ps1-rom.mjs
   node generate-github-assets.mjs
   ```

## ⚠️ Important Rules
- **Never commit raw ROM files (`*.bin`, `*.cue`, `*.iso`, `*.zip`) or extracted `SLES_029.14` executables.** These are excluded by `.gitignore`.
- Document any new `SLES_029.14` or `EVL_REL.BIN` offsets with both their file offset and PS1 RAM virtual address (`0x80090000 + offset`).
