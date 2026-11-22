#!/usr/bin/env node
// Chain Preflight CLI.
//   chain-preflight scan [dir] [--json] [--report] [--no-analyzers] [--only slither,solhint] [--fail-on high|medium|low|none]
//   chain-preflight check "<shell command>" [--cwd dir]   what the pre-deploy hook would do with a command
//   chain-preflight doctor                                which analyzers are installed, and how to install the rest
//   chain-preflight rules                                 the quick-check rules
//   chain-preflight hook                                  the Claude Code / Cursor hook (reads the event on stdin)
// Run without installing: npx -y github:theguysaccount/bitcursor-crypto-coding-client scan .
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const cmd = args[0] || "help";
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (i < 0) return fallback;
  return args[i].includes("=") ? args[i].split("=").slice(1).join("=") : args[i + 1];
};
const positional = args.slice(1).filter((a, i, all) => !a.startsWith("--") && !(i > 0 && /^--(only|fail-on|cwd)$/.test(all[i - 1])));

async function main() {
  if (cmd === "scan") {
    const { scan } = await import("../lib/scan.mjs");
    const { toMarkdown, saveReport } = await import("../lib/report.mjs");
    const only = opt("--only") ? opt("--only").split(",").map((s) => s.trim()) : null;
    const result = await scan(positional[0] || ".", { analyzers: !flag("--no-analyzers"), only });
    if (flag("--report")) {
      const files = saveReport(result);
      if (!flag("--json")) console.error(`report: ${files.latest}`);
    }
    if (flag("--json")) console.log(JSON.stringify(result, null, 2));
    else console.log(toMarkdown(result));
    const failOn = opt("--fail-on", "high");
    const order = ["high", "medium", "low"];
    const limit = order.indexOf(failOn);
    const failing = limit < 0 ? 0 : order.slice(0, limit + 1).reduce((n, s) => n + result.counts[s], 0);
    process.exitCode = failing ? 1 : 0;
    return;
  }
  if (cmd === "check") {
    const { detectDeploy, decide, findProject } = await import("../lib/detect.mjs");
    const line = positional.join(" ");
    const cwd = path.resolve(opt("--cwd", "."));
    const d = detectDeploy(line, { cwd });
    if (!d.deploy) return console.log("Not a deploy command: the hook lets it run.");
    console.log(`Deploy: ${d.tool} -> ${d.network}${d.target ? ` (${d.target})` : ""}${d.via ? ` via ${d.via}` : ""}`);
    if (d.network === "local") return console.log("Local network: the hook lets it run without scanning.");
    const { scan } = await import("../lib/scan.mjs");
    const result = await scan(findProject(d.cwd || cwd).root, { analyzers: !flag("--no-analyzers") });
    const v = decide(d, result.counts);
    console.log(`Findings: ${result.counts.high} high, ${result.counts.medium} medium, ${result.counts.low} low`);
    console.log(`Hook decision: ${v.decision === "note" ? "allow (and tell the agent what was found)" : v.decision}${v.reason ? `\n${v.reason}` : ""}`);
    return;
  }
  if (cmd === "doctor") {
    const { doctor } = await import("../lib/analyzers.mjs");
    console.log("Chain Preflight's quick checks are built in. Analyzers it runs when installed:\n");
    for (const t of doctor()) {
      if (t.retired) console.log(`${t.installed ? "✓" : "–"} ${t.tool}${t.version ? ` ${t.version}` : ""}\n    ${t.retired}`);
      else console.log(`${t.installed ? "✓" : "✗"} ${t.tool}${t.version ? ` ${t.version}` : ""}${t.installed ? "" : `\n    install: ${t.install}`}`);
    }
    return;
  }
  if (cmd === "rules") {
    const { RULES } = await import("../lib/rules.js");
    for (const r of RULES) console.log(`${r.severity.padEnd(6)} ${r.id.padEnd(30)} ${r.title}`);
    return;
  }
  if (cmd === "hook") {
    await import(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "hooks", "predeploy.mjs"));
    return;
  }
  console.log(`Chain Preflight: smart-contract safety checks before you deploy.

  chain-preflight scan [dir] [--report] [--json] [--no-analyzers] [--only slither,aderyn,solhint,cargo-audit] [--fail-on high|medium|low|none]
  chain-preflight check "<command>" [--cwd dir]
  chain-preflight doctor
  chain-preflight rules

Docs: https://theguysaccount.github.io/bitcursor-crypto-coding-client/docs/`);
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exitCode = 2;
});
