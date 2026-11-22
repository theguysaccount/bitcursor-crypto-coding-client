---
title: Smart-contract analyzers Chain Preflight runs, and the versions verified each week
description: Slither, Solhint and cargo-audit (and Aderyn where it's still installed): what each finds, how Chain Preflight runs them, and which versions the weekly job verified against deliberately vulnerable sample contracts.
path: /docs/analyzers/
updated: 2026-11-22
og: docs
---

# Analyzers

Chain Preflight doesn't bundle analyzers: it runs the ones you've installed, as separate programs, and merges their findings with its own quick checks. Each keeps its own license.

| Analyzer | By | License | What it adds |
|---|---|---|---|
| [Slither](https://github.com/crytic/slither) | Trail of Bits | AGPL-3.0 | 90+ detectors on Solidity's compiled representation: reentrancy variants, arbitrary sends, uninitialized storage, shadowing, dangerous delegatecalls |
| [Aderyn](https://github.com/Cyfrin/aderyn) | Cyfrin | GPL-3.0 | A Rust analyzer over the Solidity AST. **Retired by Cyfrin on 2026-11-13**: every install path was withdrawn, so Chain Preflight runs it only where it's already installed and never reports it missing |
| [Solhint](https://github.com/protofire/solhint) | Protofire | MIT | A linter; Chain Preflight keeps only its security rules (tx.origin, unchecked calls, low-level calls, timestamps, visibility) |
| [cargo-audit](https://github.com/rustsec/rustsec) | RustSec | Apache-2.0 / MIT | Known vulnerabilities in the Rust crates an Anchor program depends on |

## How they're run

- **Slither** runs on the whole project when it's a Foundry, Hardhat or Truffle project (and needs that framework's compiler on the PATH), otherwise file by file with `solc`. Severities map from Slither's impact: High → high, Medium → medium, Low → low, Informational and Optimization → info.
- **Aderyn**, where it's still installed, runs on the project root and writes a JSON report. It gets no more updates, so newer bug patterns won't be in it.
- **Solhint** runs with your `.solhint.json`, or `solhint:recommended` if you have none.
- **cargo-audit** runs where `Cargo.lock` is (run `anchor build` once).

A missing analyzer is reported with its install command; a failing one is reported with its error. Neither stops a scan.

## Verified each week

A scheduled job installs the latest release of Slither, Solhint and cargo-audit, runs them on the project's deliberately vulnerable samples and a safe contract, and checks that the known bugs are still found and the safe contract stays clean. This table is updated when a version or a result changes:

{{compat}}
