---
title: Chain Preflight in Cursor: a pre-deploy hook and Solidity/Anchor rules
description: Use Chain Preflight in Cursor: import the repository as a plugin, or add its beforeShellExecution hook and rules to your project by hand.
path: /docs/cursor/
updated: 2026-11-22
og: docs
---

# Cursor

The repository carries a Cursor marketplace manifest (`.cursor-plugin/marketplace.json`) next to the Claude Code one. The plugin in `plugin/` contains the same hook script, the skills, and two Cursor rules (`solidity.mdc` for `**/*.sol`, `anchor.mdc` for `programs/**/*.rs`).

## Option 1: import the plugin

In Cursor, import `https://github.com/{{repoSlug}}` from **Customize → From GitHub Repository**. Cursor's GitHub plugin imports are new, and the Chain Preflight maintainers haven't been able to test this path in Cursor itself; option 2 does the same thing by hand.

## Option 2: add the hook and rules by hand

Clone the repository somewhere permanent:

```bash
git clone https://github.com/{{repoSlug}}.git ~/.chain-preflight
```

Add the hook to `.cursor/hooks.json` in your project (or `~/.cursor/hooks.json` for all projects):

```json
{
  "version": 1,
  "hooks": {
    "beforeShellExecution": [
      {
        "command": "node ~/.chain-preflight/plugin/hooks/predeploy.mjs",
        "timeout": 600,
        "matcher": "forge|cast|hardhat|truffle|anchor|solana|deploy|migrate|ignition|npm|pnpm|yarn|bun|make"
      }
    ]
  }
}
```

The hook reads Cursor's `beforeShellExecution` event and answers with `{ "permission": "allow" | "ask" | "deny", "user_message", "agent_message" }`, using the same [policy]({{base}}/docs/#per-project-policy) as in Claude Code.

Copy the rules into your project so the agent follows them while writing code:

```bash
mkdir -p .cursor/rules && cp ~/.chain-preflight/plugin/rules/*.mdc .cursor/rules/
```

And run scans from the terminal or ask the agent to: `node ~/.chain-preflight/plugin/bin/preflight.mjs scan . --report`.
