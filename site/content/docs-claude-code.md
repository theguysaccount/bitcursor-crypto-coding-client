---
title: Chain Preflight for Claude Code: Solidity and Anchor rules, and a pre-deploy hook
description: Install the Chain Preflight plugin in Claude Code. It adds Solidity and Anchor security skills, /chain-preflight:audit and /chain-preflight:predeploy, and a PreToolUse hook that scans before forge, hardhat, anchor and solana deploys.
path: /docs/claude-code/
updated: 2026-11-22
og: docs
---

# Claude Code

## Install

```text
/plugin marketplace add {{repoSlug}}
/plugin install chain-preflight@chain-preflight
```

or from a terminal:

```bash
claude plugin install chain-preflight --marketplace {{repoSlug}}
```

Restart Claude Code so the hook loads. It needs Node.js 18+ on your PATH.

## What you get

| Part | Name | What it does |
|---|---|---|
| Skill | `solidity-security` | Rules Claude follows when it writes or reviews `.sol` files |
| Skill | `anchor-security` | Rules for Anchor programs under `programs/` |
| Command | `/chain-preflight:audit [path]` | Scans, explains each high and medium finding, proposes fixes |
| Command | `/chain-preflight:predeploy` | Walks through a pre-deploy checklist |
| Hook | PreToolUse on Bash | Scans before deploy commands; asks or blocks per the [policy]({{base}}/docs/#per-project-policy) |
| bin | `preflight.mjs` | The CLI, for the skills and for you |

## What happens when Claude deploys

Say Claude runs `forge script script/Deploy.s.sol --rpc-url $MAINNET_RPC --broadcast`. Before the command runs, the hook:

1. sees a broadcast to an RPC URL it can't classify (an environment variable), so treats it as **unknown**;
2. scans the project: quick checks, then Slither, Aderyn and Solhint if they're installed;
3. saves `.chain-preflight/latest.md`;
4. if there are high-severity findings, **asks you** in Claude Code's permission prompt, with the reason; Claude also gets the summary and the report path.

For a mainnet RPC with high findings, the command is **blocked**; Claude sees why and proposes fixes. Local deploys (anvil, `hardhat` in-process, `localnet`) run without a scan.

The hook never approves anything on its own: when it has no concern, Claude Code's normal permission rules apply.

## Notes

- The first Slither run on a project can take a minute while it compiles. The hook's timeout is ten minutes; `analyzerTimeoutSeconds` limits each analyzer.
- If the scan fails (for example, the project doesn't compile), the deploy isn't blocked, and Claude is told the check couldn't run.
- Nothing leaves your machine. The plugin doesn't sign, deploy, hold keys or give financial advice.
