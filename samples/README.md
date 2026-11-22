# Samples

Deliberately vulnerable code for Chain Preflight's tests and the weekly analyzer check. **Never deploy any of it.**

- `evm/`: a Foundry-layout project whose `VulnerableVault` has reentrancy, tx.origin authorization, an
  unprotected initializer, a missing access check, an unchecked low-level call, a caller-controlled
  delegatecall and block-based randomness.
- `evm-clean/`: the same vault written safely; analyzers should report nothing high or medium.
- `anchor/`: an Anchor workspace whose `vault` program has an unchecked authority, a caller-chosen CPI,
  `init_if_needed`, a manual close, unchecked arithmetic, and release builds without overflow checks.

Written for this project (MIT). The vulnerability classes follow the SWC registry and the Sealevel attacks catalogue.
