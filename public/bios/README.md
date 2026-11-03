# OpenBIOS (PCSX-Redux)

`openbios.bin` is a 512 KiB, MIT-licensed, from-scratch PlayStation BIOS
replacement from the [PCSX-Redux OpenBIOS](https://github.com/pcsx-redux/pcsx-redux/tree/main/src/mips/openbios)
project. It lets PCSX-ReARMed boot the European `SLES-02914` disc without
Sony's proprietary `scph5502.bin` firmware and without the incompatible HLE
BIOS path that caused the black screen.

The redistributed binary was obtained from
[`mstan/psxrecomp` `bios/openbios.bin`](https://github.com/mstan/psxrecomp/blob/master/bios/openbios.bin),
which pins the upstream PCSX-Redux and uC-sdk commits and documents the build
in `bios/OpenBIOS.toml`.

- SHA-256: `fabe498fbf224e4721f12f31b6f5fe0659205e341dc4e5c5f91b9bd1a1011c57`
- License: MIT (see [`OpenBIOS.LICENSE`](./OpenBIOS.LICENSE))
- Upstream: <https://github.com/pcsx-redux/pcsx-redux>

This is free firmware, not a Sony BIOS dump. The game disc itself is still
copyrighted and is supplied by the project's existing chunk files.
