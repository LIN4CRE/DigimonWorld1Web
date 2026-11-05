# Security Policy

## Supported versions

This project is a continuously deployed static web application. Only the latest
commit on `main` (deployed to <https://digimon-world-webui.vercel.app/>) is
supported. Older deployments are not patched.

| Version | Supported |
| ------- | --------- |
| latest `main` | ✅ |
| older tags / deployments | ❌ |

## Reporting a vulnerability

Please report security issues **privately** rather than opening a public issue.

- Use GitHub's [private vulnerability reporting](https://github.com/LIN4CRE/DigimonWorld1Web/security/advisories/new)
  ("Report a vulnerability" under the repository's **Security** tab), or
- Open a minimal public issue asking for a private contact channel without
  disclosing details.

Please include:

- A description of the issue and its impact.
- Steps to reproduce or a proof of concept.
- Affected files / endpoints and any relevant configuration.

We aim to acknowledge reports within 7 days and to coordinate a fix and
disclosure timeline with you.

## Scope

In scope:

- The local preview / development server (`server.mjs`).
- The browser boot loader (`public/emulator-boot.js`), service worker
  (`public/sw.js`), and HTML entry points.
- The ROM patching and reverse-engineering tooling (`*.mjs`, `scripts/`).
- CI/CD workflow and deployment configuration.

Out of scope:

- Vulnerabilities in upstream [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS),
  [PCSX-ReARMed](https://github.com/libretro/pcsx_rearmed), or
  [PCSX-Redux OpenBIOS](https://github.com/pcsx-redux/pcsx-redux) — report those
  to the respective upstream projects.
- The copyrighted *Digimon World* game data itself.
- Issues that require a malicious local ROM dump supplied by the user.

## Handling of secrets and proprietary material

- No proprietary Sony PlayStation BIOS is distributed. The emulator uses the
  MIT-licensed PCSX-Redux OpenBIOS (`public/bios/openbios.bin`).
- Raw ROM dumps (`*.bin`, `*.iso`, `*.zip`) and extracted executables are
  gitignored and must never be committed.
- Never commit real credentials, tokens, or keys. Deployment uses the
  GitHub-connected Vercel integration; no long-lived secrets are stored in the
  repository.
