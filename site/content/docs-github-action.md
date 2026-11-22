---
title: Chain Preflight GitHub Action: scan contracts before your deploy job
description: Add Chain Preflight to a GitHub Actions workflow to scan Solidity and Anchor code with quick checks, Slither and other analyzers, and stop the deploy on high-severity findings.
path: /docs/github-action/
updated: 2026-11-22
og: docs
---

# GitHub Action

The repository is also a composite action. It runs the scanner on the runner, writes the report to the job summary, and fails the step when findings reach `fail-on`.

```yaml
jobs:
  preflight:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: foundry-rs/foundry-toolchain@v1     # so Slither can compile a Foundry project
      - run: pip install slither-analyzer          # optional: deeper analysis
      - uses: {{repoSlug}}@v{{version}}
        with:
          path: .
          fail-on: high        # high, medium, low or none

  deploy:
    needs: preflight
    # ...
```

| Input | Default | Meaning |
|---|---|---|
| `path` | `.` | The project folder |
| `fail-on` | `high` | Fail on findings at or above this severity (`none` never fails) |
| `analyzers` | `true` | Run analyzers installed in earlier steps |

| Output | Meaning |
|---|---|
| `report` | Path of the Markdown report |

The action needs only Node.js, which GitHub's runners have. It doesn't need any secret, and it doesn't deploy anything.
