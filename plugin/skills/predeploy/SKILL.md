---
name: predeploy
description: Walk through a pre-deploy checklist for smart contracts or Solana programs (tests, scan, configuration, keys, ownership, verification) before deploying to a testnet or mainnet. Use when the user is about to deploy or asks what to check before deploying.
---

# Before you deploy

Go through each item with the user and report pass / fail / not applicable. Stop at the first failure
that matters and fix it before moving on.

1. **Tests pass**: `forge test` / `npx hardhat test` / `anchor test`, including fuzz and invariant tests if the project has them.
2. **Scan is clean or explained**: run `/chain-preflight:audit`. No unexplained high or medium findings.
3. **Target network is right**: read the exact RPC URL or cluster the deploy command will use. Dry-run first
   (`forge script` without `--broadcast`, a fork, or a testnet).
4. **Keys are safe**: no private key or keypair in the repository or shell history; use a hardware wallet,
   `cast wallet` keystores, or an environment variable that isn't committed. Check `git ls-files .env`.
5. **Initialization**: constructor and `initialize` arguments are final; upgradeable implementations call
   `_disableInitializers()`; Anchor programs initialize state in the same transaction or behind a signer.
6. **Ownership and authority**: owners, roles, upgrade authority (EVM proxies, Solana program upgrade authority)
   go to a multisig, or are renounced on purpose. Write down who holds what.
7. **Limits and pauses**: caps, timelocks and pause switches are set as intended.
8. **Verification**: plan to verify the source on the block explorer (`forge verify-contract`, `hardhat verify`, `anchor verify`).
9. **After deploy**: record addresses and the commit hash; set up monitoring or alerts.

Chain Preflight's pre-deploy hook scans automatically when a deploy command runs, and asks (or blocks, for
mainnet with high findings) before it proceeds. It is not an audit and not financial advice.
