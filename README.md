# Chain Preflight

**Smart-contract safety for AI coding agents: rules while they write, and a scan before every deploy.**

Chain Preflight is a free, open-source plugin for **Claude Code** and **Cursor**, a CLI and a GitHub Action.
It gives coding agents Solidity and Anchor security rules to follow, and a pre-deploy hook that scans your
contracts with built-in quick checks and the open-source analyzers you have installed (Slither, Solhint,
cargo-audit, and Aderyn where it's still installed) the moment a deploy command runs. Local deploys run untouched; testnet deploys with
high-severity findings ask you first; mainnet deploys always ask, and are blocked while high findings remain.

**Try the checker in your browser:** https://theguysaccount.github.io/bitcursor-crypto-coding-client/check/

> A safety tool for developers. No token, no trading, no financial advice. It never holds keys, signs or
> deploys, and sends nothing anywhere. Static analysis isn't an audit.

## Install

**Claude Code**

```
/plugin marketplace add theguysaccount/bitcursor-crypto-coding-client
/plugin install chain-preflight@chain-preflight
```

Adds the `solidity-security` and `anchor-security` skills, `/chain-preflight:audit`,
`/chain-preflight:predeploy`, and the pre-deploy hook. Needs Node.js 18+.

**Cursor:** import this repository as a plugin (it has `.cursor-plugin/marketplace.json`), or add the hook
and rules by hand: [Cursor setup](https://theguysaccount.github.io/bitcursor-crypto-coding-client/docs/cursor/).

**Command line** (nothing to install):

```bash
npx -y github:theguysaccount/bitcursor-crypto-coding-client#v0.1.1 scan .
npx -y github:theguysaccount/bitcursor-crypto-coding-client#v0.1.1 doctor
```

**GitHub Actions:**

```yaml
- uses: theguysaccount/bitcursor-crypto-coding-client@v0.1.1
  with:
    fail-on: high
```

## What the hook catches

It recognises `forge script --broadcast`, `forge create`, `cast send --create`, `hardhat run|deploy|ignition
deploy --network`, `truffle migrate`, `anchor deploy|upgrade|idl …`, `solana program deploy|upgrade|…`, and
npm scripts or make targets that run them; it reads the network from flags, `Anchor.toml` and the Solana CLI
config. Then it scans and decides:

| Network | No high findings | High findings |
|---|---|---|
| local | runs | runs |
| testnet / unknown | runs, the agent gets the summary | asks you |
| mainnet | asks you | blocked |

Per-project policy lives in `.chain-preflight.json`
([docs](https://theguysaccount.github.io/bitcursor-crypto-coding-client/docs/#per-project-policy)).
Every scan saves `.chain-preflight/latest.md` (git-ignored).

## Rules

23 built-in quick checks ([all rules, with examples and fixes](https://theguysaccount.github.io/bitcursor-crypto-coding-client/rules/)),
including reentrancy, `tx.origin` authorization, unchecked calls, caller-controlled `delegatecall`,
unprotected initializers, missing access control, block-based randomness, spot-price oracles, unchecked
Anchor accounts, missing signers, arbitrary CPIs, manual account closing, release builds without overflow
checks, and private keys committed to the repo. The analyzers add many more.

## Repository layout

| Path | What |
|---|---|
| `plugin/` | The Claude Code / Cursor plugin: `lib/` (rules, deploy detection, analyzer adapters, scanner, reports), `hooks/` (the pre-deploy hook), `bin/` (the CLI), `skills/`, `rules/` |
| `action.yml` | The GitHub Action |
| `samples/` | Deliberately vulnerable EVM and Anchor code, and a safe contract, for tests (never deploy them) |
| `site/` | The website: in-browser checker, rule pages, docs |
| `scripts/` | Site build, plugin checks, the weekly analyzer compatibility check, live checks |
| `tests/` | Unit tests (`node --test`, including real Slither and Solhint output) and browser tests |

## Develop

```bash
node --test tests/unit/*.test.mjs   # no dependencies
node scripts/check-plugin.mjs        # manifests, skills, hooks
node scripts/build.mjs && node tests/e2e/run.mjs
node plugin/bin/preflight.mjs scan samples/evm
```

Operations, schedules and keys: [OPERATIONS.md](OPERATIONS.md). Chain Preflight is MIT licensed; the
analyzers it runs keep their own licenses (Slither AGPL-3.0, Aderyn GPL-3.0, Solhint MIT, cargo-audit
Apache-2.0/MIT) and aren't bundled. Not affiliated with Anysphere or the Cursor editor.
