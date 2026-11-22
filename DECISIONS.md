# Decisions

1. **Public name: Chain Preflight, not Bitcursor.** The prompt flags "Cursor" in the name as a trademark
   risk; risks are requirements here. The repo keeps its assigned slug; the docs state there's no
   affiliation with Anysphere. `chain-preflight` was free on npm and unused on GitHub (2026-11-22);
   "DeployGuard" and "Contract Preflight" were taken.
2. **A plugin, not an editor.** Per the evaluator: an extension for existing editors. Claude Code and Cursor
   both support plugins with skills, rules and hooks, so the same `plugin/` folder serves both.
3. **The pre-deploy gate is a hook on shell commands.** Agents deploy by running `forge`, `hardhat`, `anchor`
   or `solana` in a shell; a PreToolUse / beforeShellExecution hook sees every one, with no workflow change.
4. **Policy: local free, testnet asks on highs, mainnet always asks and blocks on highs.** A human checkpoint
   for anything that can lose real money, without slowing local iteration. Configurable per project. The hook
   never approves anything on its own.
5. **Quick checks plus real analyzers.** Pattern checks run everywhere instantly (including the browser);
   Slither, Solhint and cargo-audit (and Aderyn, retired upstream in November 2026, where it's still installed) run when installed, as separate programs (their AGPL/GPL licenses
   stay theirs; nothing is bundled).
6. **Fail open on scan errors, loudly.** A broken scan doesn't block a deploy (that would train users to
   disable the hook) but the agent is told the deploy wasn't checked.
7. **Weekly compatibility job against our own vulnerable samples.** Analyzer output formats and detector names
   change; the job catches that, and the site shows which versions were verified. Results are committed only
   when they change.
8. **Samples written for this repo (MIT)**, following SWC and Sealevel classes, rather than vendoring third-party
   vulnerable-contract collections with mixed licenses.
9. **Safety scope:** no token, trading, wallet or financial advice anywhere; every report and page says static
   analysis isn't an audit (the prompt's "AI-written contracts can lose user funds" risk).
10. **Defaults for the open questions.** `bitcursor.org` ownership is unconfirmed and the name carries the
    trademark risk, so it isn't used. Treated as a grant-friendly public good (MIT, free), with Sponsors and
    chain-foundation grants as the money keys.
