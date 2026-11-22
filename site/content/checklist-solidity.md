---
title: Solidity pre-deploy security checklist (for you and your coding agent)
description: A practical checklist to run before deploying a Solidity contract to a testnet or mainnet: tests, static analysis, access control, initialization, keys, ownership, verification and monitoring.
path: /checklists/solidity-pre-deploy/
updated: 2026-11-22
og: checklist
---

# Solidity pre-deploy checklist

Run through this before every deploy that isn't to a local node. Chain Preflight's [`/chain-preflight:predeploy`]({{base}}/docs/claude-code/) walks an agent through the same list.

## Code

- [ ] Compiler pinned to the version you tested (`pragma solidity 0.8.x;`), 0.8 or newer. ([rule]({{base}}/rules/sol-floating-pragma/))
- [ ] Every privileged function checks its caller; no `tx.origin`. ([access control]({{base}}/rules/sol-missing-access-control/), [tx.origin]({{base}}/rules/sol-tx-origin-auth/))
- [ ] State updated before external calls; reentrancy guards on functions that call out. ([rule]({{base}}/rules/sol-reentrancy/))
- [ ] Every low-level call checked; tokens moved with SafeERC20. ([calls]({{base}}/rules/sol-unchecked-call/), [ERC-20]({{base}}/rules/sol-unchecked-erc20/))
- [ ] No `delegatecall` to caller-chosen addresses; no `selfdestruct`. ([rule]({{base}}/rules/sol-delegatecall-input/))
- [ ] Prices from a TWAP or oracle with staleness checks, not AMM reserves; randomness from a VRF. ([prices]({{base}}/rules/sol-spot-price/), [randomness]({{base}}/rules/sol-weak-randomness/))
- [ ] Signatures: EIP-712 with nonce, deadline and chain id; zero-address check. ([rule]({{base}}/rules/sol-ecrecover-zero/))
- [ ] Upgradeable: `initializer` on `initialize`, `_disableInitializers()` in the implementation's constructor, protected `_authorizeUpgrade`. ([rule]({{base}}/rules/sol-unprotected-initializer/))

## Process

- [ ] Tests pass, including fuzz and invariant tests (`forge test`).
- [ ] Scan clean or every finding explained: `chain-preflight scan . --report` with Slither installed.
- [ ] Dry run: `forge script` without `--broadcast`, or against a fork or testnet.
- [ ] Keys: hardware wallet or encrypted keystore; no key in the repo or `.env` committed. ([rule]({{base}}/rules/any-private-key/))
- [ ] Constructor and initializer arguments double-checked.
- [ ] Owner, roles and proxy admin go to a multisig (or are renounced on purpose), with a timelock where appropriate.
- [ ] Plan to verify the source (`forge verify-contract`), record addresses and the commit hash, and monitor.
- [ ] Anything that will hold value has had a professional audit.
