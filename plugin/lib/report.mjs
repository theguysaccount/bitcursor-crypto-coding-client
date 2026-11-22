// Reports: Markdown for people and agents, JSON for tools, saved under .chain-preflight/ in the project.
import fs from "node:fs";
import path from "node:path";
import { rule } from "./rules.js";

export const DISCLAIMER = "Chain Preflight runs pattern checks and open-source static analyzers. It finds known bug classes; it can't prove a contract is safe and isn't an audit. Get a professional audit before deploying code that will hold value.";
const SITE = "https://theguysaccount.github.io/bitcursor-crypto-coding-client";

export function summaryLine(result) {
  const c = result.counts;
  const ran = result.analyzers.filter((a) => a.status === "ok").map((a) => a.tool);
  return `${c.high} high, ${c.medium} medium, ${c.low} low${c.info ? `, ${c.info} info` : ""} (quick checks${ran.length ? ` + ${ran.join(", ")}` : ""}, ${result.files.solidity + result.files.rust} source files)`;
}

export function toMarkdown(result, { detection = null, limit = 60 } = {}) {
  const lines = ["# Chain Preflight report", ""];
  if (detection && detection.deploy) lines.push(`Before: \`${detection.command}\` (${detection.network}${detection.target ? `: ${detection.target}` : ""})`, "");
  lines.push(`Project: ${result.kind} at \`${result.root}\` · ${result.scannedAt} · ${result.seconds}s`, "");
  lines.push(`**${summaryLine(result)}**`, "");
  const shown = result.findings.filter((f) => f.severity !== "info").slice(0, limit);
  if (!shown.length) lines.push("No high, medium or low findings.", "");
  for (const sev of ["high", "medium", "low"]) {
    const group = shown.filter((f) => f.severity === sev);
    if (!group.length) continue;
    lines.push(`## ${sev[0].toUpperCase()}${sev.slice(1)}`, "");
    for (const f of group) {
      const r = rule(f.rule);
      const link = r ? `${SITE}/rules/${r.id}/` : f.url || "";
      lines.push(`- **${f.title}** (${f.tool}${f.tool !== "quick-checks" ? `: ${f.rule}` : ""}) at \`${f.file}${f.line ? `:${f.line}` : ""}\``);
      if (f.message) lines.push(`  ${f.message}`);
      if (f.snippet) lines.push(`  \`${f.snippet.replace(/`/g, "'")}\``);
      if (link) lines.push(`  ${link}`);
    }
    lines.push("");
  }
  const more = result.findings.filter((f) => f.severity !== "info").length - shown.length;
  if (more > 0) lines.push(`…and ${more} more in the JSON report.`, "");
  lines.push("## Analyzers", "");
  lines.push("- quick checks: ran (built in)");
  for (const a of result.analyzers) {
    if (a.status === "ok") lines.push(`- ${a.tool} ${a.version || ""}: ran, ${a.findings} finding${a.findings === 1 ? "" : "s"}`);
    else if (a.status === "missing") lines.push(`- ${a.tool}: not installed. ${a.install}`);
    else lines.push(`- ${a.tool}${a.version ? ` ${a.version}` : ""}: ${a.status}${a.note ? `: ${a.note.split("\n")[0]}` : ""}`);
  }
  lines.push("", `_${DISCLAIMER}_`, "");
  return lines.join("\n");
}

/** Save report-<time>.md/.json and latest.md/.json under <root>/.chain-preflight/. Returns the paths. */
export function saveReport(result, { detection = null } = {}) {
  const dir = path.join(result.root, ".chain-preflight");
  fs.mkdirSync(dir, { recursive: true });
  const gitignore = path.join(dir, ".gitignore");
  if (!fs.existsSync(gitignore)) fs.writeFileSync(gitignore, "*\n");
  const stamp = result.scannedAt.replace(/[:.]/g, "-");
  const md = toMarkdown(result, { detection });
  const json = JSON.stringify({ ...result, detection }, null, 2);
  const files = { md: path.join(dir, `report-${stamp}.md`), json: path.join(dir, `report-${stamp}.json`), latest: path.join(dir, "latest.md") };
  fs.writeFileSync(files.md, md);
  fs.writeFileSync(files.json, json);
  fs.writeFileSync(files.latest, md);
  fs.writeFileSync(path.join(dir, "latest.json"), json);
  // Keep the newest 20 reports.
  const old = fs.readdirSync(dir).filter((n) => /^report-.*\.(md|json)$/.test(n)).sort().reverse().slice(40);
  for (const n of old) fs.rmSync(path.join(dir, n), { force: true });
  return files;
}
