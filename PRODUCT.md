# Chain Preflight

**User.** Smart-contract and Solana developers, and the growing number of people shipping contracts with AI
coding agents (Claude Code, Cursor), especially at hackathons and small teams without an auditor on call.

**Painful job.** Making sure the contract an agent just wrote doesn't ship a known, fund-losing bug. Today:
remember to run Slither (if installed), read 40 findings, and hope nobody deploys to mainnet first.

**Promise.** Your agent follows smart-contract security rules while it writes, and nothing it deploys reaches
a public network without a scan and, for mainnet, a human decision.

**Wedge.** Free, open-source, agent-native: one `/plugin install` in Claude Code (and a Cursor plugin), a
pre-deploy hook that needs no workflow change, and an in-browser checker as the first touch. Reuses the
existing open-source analyzers instead of competing with them.

**Why now.** AI agents now write and deploy contracts end to end; deploy commands run from agent shells.
Claude Code and Cursor hooks (2025-2026) make a pre-deploy gate possible without a custom editor.

**Activation metric.** A scan that runs in a user's project: the hook firing before a deploy, or
`/chain-preflight:audit`. On the site: a checker run with findings (`event/check-findings`), instrumented,
off until the GoatCounter key is set.

**First revenue event.** A GitHub Sponsors sponsorship or a chain-foundation grant (keys in OPERATIONS.md).

**v1 deliberately won't:** deploy, sign or hold keys; have a token or any trading feature; give financial
advice; claim to replace an audit; build an editor (the prompt cuts that); bundle analyzers with
incompatible licenses.
