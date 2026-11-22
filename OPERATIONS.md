# Operations

Chain Preflight runs itself on GitHub: Pages hosts the website (in-browser checker, rule pages, docs),
Actions runs every recurring job. Nothing needs a person for it to keep working. There is no hosted service:
users' code never reaches this project.

**Live:** https://theguysaccount.github.io/bitcursor-crypto-coding-client/
**Repo:** https://github.com/theguysaccount/bitcursor-crypto-coding-client
**Install:** `/plugin marketplace add theguysaccount/bitcursor-crypto-coding-client`, then
`/plugin install chain-preflight@chain-preflight` (Claude Code); `npx -y github:theguysaccount/bitcursor-crypto-coding-client#v0.1.1 scan .` (CLI);
`uses: theguysaccount/bitcursor-crypto-coding-client@v0.1.1` (GitHub Actions)

## Automated jobs

| Job | Workflow | When | What it does | How it fails safe |
|---|---|---|---|---|
| Deploy | `pages.yml` | every push to `main`; by hand; after a compatibility update | Unit tests (every rule on the vulnerable and safe samples, deploy-command detection, analyzer adapters on real Slither and Solhint output, the scanner, the hook's stdin/stdout for Claude Code and Cursor); plugin manifest checks and a hook smoke test; builds; drives the checker in headless Chrome at desktop and phone widths; loads every page at both widths; deploys; waits for the live commit; repeats the browser tests live; pings IndexNow | A failure before `deploy` leaves the last good site live. |
| Analyzer compatibility | `compat.yml` | Wednesdays 06:37 and Saturdays 18:11 UTC; by hand | Installs the latest Slither (+ solc, Foundry), Solhint and cargo-audit; scans the vulnerable samples and the safe contract; checks Slither still finds reentrancy-eth, controlled-delegatecall and tx-origin, Solhint finds avoid-tx-origin, cargo-audit runs, and nobody flags the safe contract high; writes `site/data/compat.json` only when a version or result changed, commits, and dispatches a deploy | An analyzer that fails to install is a warning and keeps its last recorded result. One that stops finding known bugs (or flags the safe contract) fails the job and opens an `ops-alert` issue. Re-runs don't churn: unchanged results aren't committed. |
| Self-test | `selftest.yml` | Mondays 09:29 and Thursdays 21:53 UTC; by hand | Unit tests; plugin checks; Claude Code's own `claude plugin validate --strict` (CLI from npm; a failed install is a warning); the GitHub Action passes the safe sample and fails the vulnerable one; live health (every sitemap URL 200 with its own canonical, `checker.js` matches `version.json`, `rules.json` matches the repo's rules); **staleness** (live build not the current `main` after an hour → dispatches a deploy and fails; last successful scheduled self-test over 10 days → warning); the checker on the live site at two widths | Read-only apart from the redeploy dispatch. Failures open or comment on one `ops-alert` issue. |
| Keep-alive | `selftest.yml` and `compat.yml` → `scripts/keepalive.sh` | every run of either | Re-enables scheduled workflows (not ones disabled by hand); empty `[skip ci]` commit after 45 quiet days | GitHub disables schedules after 60 days without activity. |
| CI | `ci.yml` | pull requests, other branches | The deploy's tests plus the action test | |
| Triage | issue forms | new issues | Bug and false-result forms label issues (`bug`/`accuracy` + `triage`) | |

**Temporary line to remove:** `selftest.yml` has a third cron, `23,53 * 22-24 11 *`, added on
2026-11-22 to prove the schedule trigger. It can only fire on 22 to 24 November. Delete it once a
schedule-triggered run has passed (it would come back on the same dates next year).

## What to watch

- **Open `ops-alert` issues**, especially from `compat.yml`: an analyzer release changed its detector names
  or output format. Update `plugin/lib/analyzers.mjs` (the parsers have tests with real output in
  `tests/fixtures/`) and the expectations in `scripts/compat.mjs`.
- **Issues labelled `accuracy`**: false positives and missed bugs. Each fix is a rule change in
  `plugin/lib/rules.js` plus a test case.
- **Install-command changes and retirements** upstream. The `INSTALL` table in `plugin/lib/analyzers.mjs`
  feeds `doctor`, reports and the docs. Cyfrin retired **Aderyn** on 2026-11-13 and withdrew every install path
  (crates.io yanked, binaries, npm, Homebrew); it now sits in `RETIRED`, runs only where already installed and
  is never reported missing. Move any other analyzer there the same way if its maker withdraws it.

## Run anything by hand

```bash
node --test tests/unit/*.test.mjs
node scripts/check-plugin.mjs
node scripts/build.mjs && node tests/e2e/run.mjs
node plugin/bin/preflight.mjs scan samples/evm
node scripts/check-live.mjs https://theguysaccount.github.io/bitcursor-crypto-coding-client
~/.local/bin/gh workflow run compat.yml -R theguysaccount/bitcursor-crypto-coding-client
~/.local/bin/gh workflow run selftest.yml -R theguysaccount/bitcursor-crypto-coding-client
```

## Releasing a new version

Bump `version` in `package.json`, `plugin/.claude-plugin/plugin.json` and `plugin/.cursor-plugin/plugin.json`
(the checks require them to agree), commit, then `git tag vX.Y.Z && git push origin vX.Y.Z` and
`gh release create vX.Y.Z --generate-notes`. Claude Code users move with `/plugin marketplace update chain-preflight`.
The action and `npx github:…#vX.Y.Z` follow the tag.

## Keys Jack can turn later

Nothing below is needed for Chain Preflight to work.

### 1. Custom domain

`bitcursor.org` was mentioned in the notes but isn't in the 2026-08-30 portfolio audit (unconfirmed
ownership). A domain containing "cursor" also carries the trademark risk the prompt flags, which is why the
product is called Chain Preflight. The "domain rollout" session assigns domains; this repo changes no DNS.

The site's base URL is **one setting**, the repository variable `SITE_URL`:

1. DNS: `A @` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`;
   `AAAA @` → `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`;
   `CNAME www` → `theguysaccount.github.io` (or one `CNAME` for a subdomain).
2. `gh api -X PUT repos/theguysaccount/bitcursor-crypto-coding-client/pages -f cname=<domain>`, then
   `gh api -X PUT repos/theguysaccount/bitcursor-crypto-coding-client/pages -F https_enforced=true` once the certificate exists.
3. `gh variable set SITE_URL -R theguysaccount/bitcursor-crypto-coding-client -b https://<domain>`
4. `gh workflow run pages.yml -R theguysaccount/bitcursor-crypto-coding-client`.

Reports link to rule pages at the github.io address, which then redirects.

### 2. Money

- **GitHub Sponsors** (needs the owner's bank and tax details):
  `gh variable set SPONSOR_URL -R theguysaccount/bitcursor-crypto-coding-client -b https://github.com/sponsors/<account>`, then redeploy.
- **A chain-foundation grant** (Ethereum Foundation ESP, Solana Foundation, Arbitrum, Optimism RetroPGF):
  developer-security public goods are a common grant category. Each application needs a person and an
  organisation identity.

### 3. Analytics

Off by default. The site counts `event/check-findings` and `event/check-clean` (checker runs) when a
GoatCounter key is set: `gh variable set GOATCOUNTER_URL -R theguysaccount/bitcursor-crypto-coding-client -b https://<code>.goatcounter.com/count`.
The plugin, CLI and action never report anything. Other signals: stars, clones, and Actions usage of the
action (visible in GitHub's dependency graph for public repos).

### 4. Listings that need an account

- **Anthropic plugin directory** (https://claude.ai/directory/manage, paid claude.ai plan):
  `claude plugin validate --profile directory --strict ./plugin` passes, icon included.
- **Cursor Marketplace** (https://cursor.com/marketplace/publish, Cursor sign-in, manual review).
- **GitHub Marketplace** for the action (publishing a release to the Marketplace asks the account owner to
  accept the Marketplace terms).
- **npm** (`npx chain-preflight`): needs an npm account. `chain-preflight` was free on 2026-11-22.
- **Google Search Console**: verify and submit `/sitemap.xml`.

### 5. Optional Claude routine

A monthly routine could turn `accuracy` issues into rule fixes: "Read open issues labelled accuracy in
theguysaccount/bitcursor-crypto-coding-client, add each sample as a test in tests/unit/rules.test.mjs, fix
plugin/lib/rules.js until the tests pass without breaking the samples, open a draft PR, never merge."

## Safety rules the code keeps

- The hook never approves a command: it asks, blocks, or stays silent and lets the normal permission flow
  run. If a scan fails, the deploy isn't blocked, and the agent is told it wasn't checked.
- Nothing is sent anywhere; reports stay in the project's `.chain-preflight/` (which ignores itself in git).
- Private keys found in code are reported with the key masked.
- Every page and report says static analysis isn't an audit. No token, trading or financial advice anywhere.
