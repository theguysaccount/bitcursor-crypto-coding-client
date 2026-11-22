# Launch

Machine-driven: no posts, outreach, hackathon visits or ads.

## Live
- Site, checker, rules: https://theguysaccount.github.io/bitcursor-crypto-coding-client/
- Claude Code: `/plugin marketplace add theguysaccount/bitcursor-crypto-coding-client` → `/plugin install chain-preflight@chain-preflight`
- CLI: `npx -y github:theguysaccount/bitcursor-crypto-coding-client#v0.1.1 scan .`
- Action: `uses: theguysaccount/bitcursor-crypto-coding-client@v0.1.1`

## Production deploy and domain
OPERATIONS.md key 1 (one setting, `SITE_URL`, plus DNS). Nothing here changes DNS.

## Machine distribution (running)
- Search pages: 23 rule pages that answer "what is X vulnerability, example, fix" (reentrancy, tx.origin,
  unchecked call, delegatecall, initializer, missing signer, arbitrary CPI, init_if_needed, …), two
  checklists, docs for Claude Code, Cursor, the action and the analyzers. Each with title, description,
  canonical, Open Graph card and JSON-LD.
- Sitemap, project robots.txt (picked up by the account's host-root robots.txt), IndexNow on every deploy.
- Share loop: checker results have share links (the code travels in the link, nothing is uploaded); every
  report links to the rule pages.
- GitHub discovery: description, topics, README with install commands, the action usable from any workflow.

## Next channels (each needs an account: OPERATIONS.md, key 4)
Anthropic plugin directory, Cursor Marketplace, GitHub Marketplace (action), npm, Search Console.
