---
name: audit
description: Scan the current smart-contract project (Solidity or Anchor) with Chain Preflight's quick checks and the installed open-source analyzers (Slither, Solhint, cargo-audit; Aderyn where still installed), explain every finding and propose fixes. Use when the user asks to audit, scan or security-check contracts, or before a deploy.
argument-hint: "[path]"
---

# Scan the project

1. Run the scan and save a report:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/preflight.mjs" scan $ARGUMENTS --report
   ```

   (With no path it scans the current project.) It prints a Markdown report (also saved as `.chain-preflight/latest.md` in the project, which is git-ignored).
   Exit code 1 means there are high-severity findings; that's expected, not an error.
2. If analyzers are listed as "not installed", say which, and show the install commands from
   `node "${CLAUDE_PLUGIN_ROOT}/bin/preflight.mjs" doctor`. Don't install anything without the user's go-ahead.
3. For each high and medium finding, open the code at the reported line and explain in plain words what
   could go wrong and how likely it is in this codebase. Mark likely false positives as such, with the reason.
4. Propose a concrete fix for each real issue (a minimal diff), following the `solidity-security` or
   `anchor-security` skill. Apply fixes only when the user asks.
5. After fixes, run the scan again and the project's tests (`forge test`, `npx hardhat test` or `anchor test`).
6. End with the disclaimer: static analysis finds known bug classes; it is not an audit, and code that will
   hold value needs a professional one. This is a code-safety review, not financial advice.
