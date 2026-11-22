---
title: What Chain Preflight can and can't do (limits, false positives, scope)
description: Chain Preflight is a pattern checker and analyzer runner, not an audit. Its limits, how to treat false positives and negatives, and what it deliberately doesn't do.
path: /docs/limits/
updated: 2026-11-22
og: docs
---

# Limits

## It's not an audit

Static analysis finds known bug classes in the code it can see. It can't tell whether your economic design is sound, whether an oracle can be manipulated in practice, whether an upgrade path is safe, or whether the contract does what your documentation says. **Get a professional audit before deploying code that will hold value**, and treat a clean Chain Preflight report as the absence of known patterns, not as safety.

## Quick checks are pattern matches

The built-in checks read source text, not compiled code. They're fast and run anywhere, including the browser, but:

- **False positives**: a privileged function protected in a way the checks don't recognise (a custom modifier name without `only`, a check in an internal function) will be flagged. Read the code, and say why it's fine.
- **False negatives**: a vulnerable pattern written differently (through an internal call, an assembly block, an inherited contract the scan didn't see) can be missed. The real analyzers (Slither above all) catch much more; install them.

## Network detection is best-effort

The hook reads the network from command flags, `Anchor.toml` and the Solana CLI config. When it can't tell (an RPC URL in an environment variable), it says "unknown" and treats it like a testnet. Name your RPC variables and networks clearly (`MAINNET_RPC_URL`, `--network mainnet`), or set a stricter [policy]({{base}}/docs/#per-project-policy).

## What it deliberately doesn't do

- It doesn't deploy, sign, hold or read keys, or send transactions.
- It doesn't send your code anywhere: everything runs on your machine (or in your CI).
- It has no token, no trading features, and gives no financial or investment advice. It's a code-safety tool for developers.

## About the name

The repository's name (`bitcursor`) comes from the project's working title. The tool is called Chain Preflight and is not affiliated with Anysphere or the Cursor editor; it simply supports Cursor alongside Claude Code.
