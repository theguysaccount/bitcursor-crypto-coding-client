# Chain Preflight plugin

Smart-contract safety for coding agents, for Claude Code and Cursor:

- **Pre-deploy hook.** Before a deploy command runs (`forge script --broadcast`, `forge create`,
  `hardhat run|deploy|ignition deploy --network …`, `truffle migrate`, `anchor deploy|upgrade`,
  `solana program deploy`, or an npm/make script that runs one), it scans the project with built-in quick
  checks and any installed open-source analyzers (Slither, Aderyn, Solhint, cargo-audit), saves a report in
  `.chain-preflight/`, and then:
  - local networks (anvil, hardhat, localnet): runs without scanning;
  - testnets: asks you first if there are high-severity findings, otherwise tells the agent what it found;
  - mainnet: always asks you first, and blocks if there are high-severity findings.

  Change the policy in `.chain-preflight.json` at the project root:
  `{ "highOnMainnet": "ask", "mainnet": "ask", "highElsewhere": "ask", "analyzers": true }`.
- **Skills:** `solidity-security` and `anchor-security` (rules the agent follows when writing contracts),
  `/chain-preflight:audit` (scan and explain findings), `/chain-preflight:predeploy` (a pre-deploy checklist).
- **Cursor rules** for `.sol` files and `programs/**/*.rs`.

## Install (Claude Code)

```
/plugin marketplace add theguysaccount/bitcursor-crypto-coding-client
/plugin install chain-preflight@chain-preflight
```

Needs Node.js 18+. Install the analyzers you want (`node bin/preflight.mjs doctor` lists the commands);
the quick checks work without any.

## What it is and isn't

A safety tool for developers. It doesn't deploy, sign, hold keys, trade, or give financial advice, and it
sends nothing anywhere: everything runs on your machine. Static analysis finds known bug classes; it can't
prove a contract is safe and isn't an audit.

MIT licensed. Docs: https://theguysaccount.github.io/bitcursor-crypto-coding-client/
