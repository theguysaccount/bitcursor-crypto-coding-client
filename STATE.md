# State (2026-11-22)

- **Before this build:** two one-line mentions in Apple Notes (Jul 2025 and Jun 2026): "Bitcursor.org / Open
  source crypto programming clients". No code, no design.
- **Works now:** 23 quick checks for Solidity and Anchor; deploy-command detection for Foundry, Hardhat,
  Truffle, Anchor and the Solana CLI with network classification; adapters for Slither, Aderyn, Solhint and
  cargo-audit; the scanner and reports; the pre-deploy hook for Claude Code (PreToolUse) and Cursor
  (beforeShellExecution); the CLI; the GitHub Action; skills and Cursor rules; the website with an in-browser
  checker, 23 rule pages, docs and two checklists.
- **Verified:** 24 unit tests (including real Slither 0.11 and Solhint 6 output on the samples), the hook's
  contract for both editors, the checker in headless Chrome at two widths, `claude plugin validate --strict`
  and `--profile directory --strict`, install from GitHub in an isolated Claude Code config, `npx github:…`.
- **Not verified here:** Aderyn and cargo-audit end to end (not installed on this machine; the weekly CI job
  installs and checks them), Slither in Foundry project mode (needs forge; CI installs it), and the Cursor
  plugin import (no Cursor here).
