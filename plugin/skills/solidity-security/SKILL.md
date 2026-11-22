---
name: solidity-security
description: Security rules for writing, editing and reviewing Solidity smart contracts (EVM). Use whenever you write or change a .sol file, review a contract, or plan a contract's design, in Foundry, Hardhat or plain Solidity.
---

# Writing safe Solidity

Follow these rules for every contract you write or change. They target the bug classes that lose funds
most often. Explain any rule you deliberately break, in a comment.

## Compiler and dependencies
- Pin the compiler (`pragma solidity 0.8.28;`, not `^0.8.0`) to the version the tests ran on. Never below 0.8 (no overflow checks).
- Use audited libraries (OpenZeppelin, Solady) instead of hand-written ERC-20/721, ownership, signatures or math. Pin their versions.

## Access control
- Every function that moves funds, mints, burns, pauses, upgrades, sets fees/oracles/owners must check the caller: `onlyOwner`, `onlyRole(…)` or an explicit `if (msg.sender != …) revert`.
- Never authorize with `tx.origin`. Use `msg.sender`.
- Prefer `Ownable2Step` (two-step transfers). Use a multisig as the owner of anything that holds value.
- Upgradeable contracts: `initialize` must use the `initializer` modifier, and the implementation's constructor must call `_disableInitializers()`. Protect `_authorizeUpgrade`.

## External calls and reentrancy
- Checks, effects, interactions: update state *before* sending ETH or calling another contract.
- Add `nonReentrant` (OpenZeppelin `ReentrancyGuard` or transient-storage guard) to functions that call out, including view-dependent ones (read-only reentrancy).
- Check every low-level call: `(bool ok, ) = to.call{value: v}(""); if (!ok) revert …;`. Don't use `transfer`/`send` (2300 gas).
- Use `SafeERC20` (`safeTransfer`, `safeTransferFrom`, `forceApprove`) for tokens: some return false, some return nothing.
- Never `delegatecall` an address a caller supplies.
- Prefer pull payments (users withdraw) over pushing ETH in loops.

## Values you can't trust
- `block.timestamp`, `blockhash`, `block.prevrandao` are not randomness. Use a VRF (e.g. Chainlink VRF) or commit-reveal.
- AMM spot prices (`getReserves`, `slot0`) can be moved with a flash loan inside one transaction. Use a TWAP or an oracle, and check oracle staleness (`updatedAt`) and bounds.
- Signatures: use EIP-712 typed data with a nonce, a deadline and `block.chainid`; reject `ecrecover` returning `address(0)`; prefer OpenZeppelin `ECDSA`/`SignatureChecker`.
- Validate inputs: zero addresses, array length mismatches, amounts of zero, slippage bounds (`minOut`) on swaps.

## Arithmetic, loops and storage
- Keep `unchecked { }` to provably bounded math (loop counters) and say why in a comment.
- Round in the protocol's favour; multiply before dividing; watch precision when mixing decimals.
- No unbounded loops over user-growable arrays in state-changing functions (gas DoS).
- Don't use `selfdestruct`. Avoid storage collisions in proxies (use ERC-7201 namespaced storage).

## Before it ships
- Write Foundry tests for every external function, including revert paths, fuzz tests and invariants for balances and supply.
- Run `/chain-preflight:audit` and fix or explain every high and medium finding.
- Static analysis is not an audit. Recommend a professional audit before code that will hold user funds goes to mainnet.
