# Development Progress

## Done
- 128-slot evolution matrix (`0x8011B990`), 16 starter Rookies via Jijimon quiz (`0x8011C000`, spawner `0x80114B84`).
- Training tables located: Green Gym requirements `0x80134A30` (28 B/entry), base evolution stats `0x80135114` (14 B/entry).
- IndexedDB SHA-256 disc cache; memory-card export/import + versioned backups (10 most recent) in IndexedDB.

## Digimon World 3 asset research (nothing from DW3 is committed to this repo)
Source disc: standard ISO9660 Mode 2/2352, root has only SYSTEM.CNF, SLUS_014.36, DUMMY.; the real file tree is a second directory at LBA 473 (`DAT/`, `STR/`, `WSTAG*.PRO`...).
- Battle models live in `DAT/MODEL/Mnnn<name>.BIN` (249 files). Veemon = `M145VMON.BIN` (LBA 15721, 54,536 B); ExVeemon `M259EXVM.BIN`; Veedramon `M135DVDR.BIN` is not Veemon-line (DVDR = Dorugamon-line?) - verify.
- Container: 46-entry u32 offset table. Entry 0 = skeleton/pointer table (magic 0xF8), entries 1-21 = per-bone mesh parts (header 0x10, ...; 16-bit vertex data, **not standard TMD**), 22-42 = animation tracks (header 0x18), 43 = `RLEN` run-length compressed 256x256 16-bit TIM (decoder implemented and verified: 32,788 bytes, valid TIM header), 44-45 = bone/part tables.
- DW1 `.MMD`: u32 tmdOffset(8) / animTableOffset(@+4), standard TMD (16 objects for Agumon) + animation slot table (numSlots*4 bytes of offsets).

## Blockers for a real Veemon port
1. DW3 mesh parts use a custom vertex/primitive layout; a decoder + TMD writer is still needed.
2. DW3 skeleton/animation tracks must be re-encoded into DW1's MMD bone animation format.
3. Texture must be repacked into the DW1 TIM/ALLTIM VRAM layout; the new MMD must be added to the disc image (needs free sectors or file replacement) and a model-string slot added in `SLES_029.14`.
