# State (2026-11-22)

- **Before this build:** two one-line mentions in Apple Notes (Jul 2025 and Jun 2026): "Bitcursor.org / Open
  source crypto programming clients". No code, no design.
- **Works now:** 23 quick checks for Solidity and Anchor; deploy-command detection for Foundry, Hardhat,
  Truffle, Anchor and the Solana CLI with network classification; adapters for Slither, Solhint, cargo-audit
  and Aderyn (retired upstream on 2026-11-13; runs only where already installed); the scanner and reports;
  the pre-deploy hook for Claude Code (PreToolUse) and Cursor (beforeShellExecution); the CLI; the GitHub Action; skills and Cursor rules; the website with an in-browser
  checker, 23 rule pages, docs and two checklists.
- **Verified:** 25 unit tests (including real Slither 0.11 and Solhint 6 output on the samples), the hook's
  contract for both editors, the checker in headless Chrome at two widths, `claude plugin validate --strict`
  and `--profile directory --strict`, install from GitHub in an isolated Claude Code config, `npx github:…`.
- **Verified in CI (2026-11-22):** Slither 0.11.6 in Foundry project mode, Solhint 6.2.5 and cargo-audit 0.23.0
  on the samples. Aderyn can't be installed any more (retired upstream), so its adapter is covered by unit
  tests only.
- **Not verified here:** the Cursor plugin import (no Cursor here).
