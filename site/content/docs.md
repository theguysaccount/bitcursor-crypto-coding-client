---
title: Chain Preflight docs: install, the pre-deploy hook, the CLI and the policy
description: How to install Chain Preflight in Claude Code, Cursor, your terminal or GitHub Actions, how the pre-deploy hook decides, and how to configure it per project.
path: /docs/
updated: 2026-11-22
og: docs
---

# Getting started

Chain Preflight has three parts that share one engine:

- **Rules for the agent**: skills (Claude Code) and rules (Cursor) with the Solidity and Anchor patterns that lose funds, so the code is safer as it's written.
- **The pre-deploy hook**: runs when the agent executes a deploy command, scans the project, and asks you (or blocks) before risky deploys.
- **The scanner**: {{ruleCount}} built-in [quick checks]({{base}}/rules/) plus the open-source analyzers you have installed, as a CLI and a GitHub Action.

## Install

**Claude Code** ([details]({{base}}/docs/claude-code/)):

```text
/plugin marketplace add {{repoSlug}}
/plugin install chain-preflight@chain-preflight
```

**Cursor**: see [Cursor setup]({{base}}/docs/cursor/).

**Terminal** (Node.js 18+, nothing to install):

```bash
npx -y github:{{repoSlug}}#v{{version}} scan .
npx -y github:{{repoSlug}}#v{{version}} doctor
```

**GitHub Actions**: see [the action]({{base}}/docs/github-action/).

## Install the analyzers you want

The quick checks need nothing. The scan gets much deeper with real analyzers; install any of them and they're picked up automatically:

| Analyzer | For | Install |
|---|---|---|
| [Slither](https://github.com/crytic/slither) | Solidity | `pip install slither-analyzer solc-select` (Foundry or Hardhat projects compile with `forge` / `hardhat`; loose files need `solc-select use 0.8.28`) |
| [Aderyn](https://github.com/Cyfrin/aderyn) | Solidity | Retired by Cyfrin on 2026-11-13; no longer installable. An installation you already have still runs. |
| [Solhint](https://github.com/protofire/solhint) | Solidity | `npm install -g solhint` |
| [cargo-audit](https://github.com/rustsec/rustsec) | Anchor / Rust | `cargo install cargo-audit` |

`chain-preflight doctor` shows which are installed. Versions verified each week are on the [analyzers page]({{base}}/docs/analyzers/).

## The pre-deploy hook

It recognises these commands (also behind `npx`, `pnpm`, `yarn`, `cd … &&`, environment prefixes, and npm scripts or make targets that run them):

| Tool | Deploy commands | Network from |
|---|---|---|
| Foundry | `forge script … --broadcast`, `forge create`, `cast send --create` | `--rpc-url` / `-f` |
| Hardhat | `hardhat run`, `hardhat deploy`, `hardhat ignition deploy` | `--network` (none = in-process, local) |
| Truffle | `truffle migrate`, `truffle deploy` | `--network` |
| Anchor | `anchor deploy`, `anchor upgrade`, `anchor idl init/upgrade/…` | `--provider.cluster`, else `Anchor.toml` |
| Solana CLI | `solana program deploy / write-buffer / upgrade / set-upgrade-authority / extend` | `-u` / `--url`, else the Solana CLI config |

Networks are classified as **local** (localhost, anvil, hardhat, localnet), **testnet** (sepolia, holesky, devnet, testnet, amoy, fuji…), **mainnet** (mainnet, ethereum, base, arbitrum, optimism, polygon, bsc, mainnet-beta…) or **unknown** (an environment variable or an RPC URL it can't place).

Then:

| Network | No high findings | High findings |
|---|---|---|
| local | runs, no scan | runs, no scan |
| testnet or unknown | runs; the agent gets the summary | **asks you** |
| mainnet | **asks you**, with an audit reminder | **blocked**: the agent explains the findings and proposes fixes |

Every scan writes `.chain-preflight/latest.md` and `latest.json` in the project (the folder ignores itself in git).

## Per-project policy

Create `.chain-preflight.json` at the project root:

```json
{
  "highOnMainnet": "deny",
  "mainnet": "ask",
  "highElsewhere": "ask",
  "analyzers": true,
  "analyzerTimeoutSeconds": 180
}
```

- `highOnMainnet`: `deny` (default) or `ask`.
- `mainnet`: `ask` (default) or `allow` (only note the findings).
- `highElsewhere`: `ask` (default) or `allow`, for testnets and unknown networks.
- `analyzers`: `false` runs only the quick checks (faster).

Set `CHAIN_PREFLIGHT=off` in the environment to disable the hook entirely.

## CLI reference

```text
chain-preflight scan [dir] [--report] [--json] [--no-analyzers] [--only slither,aderyn,solhint,cargo-audit] [--fail-on high|medium|low|none]
chain-preflight check "<command>" [--cwd dir]   # what the hook would do with a command
chain-preflight doctor                          # installed analyzers and install commands
chain-preflight rules                           # the quick-check rules
```

`scan` exits 1 when there are findings at or above `--fail-on` (default `high`).
