// Weekly analyzer compatibility check. Runs every installed analyzer on the deliberately vulnerable
// samples and the safe contract, checks the known bugs are still found and the safe contract stays
// clean, and records versions and results in site/data/compat.json, but only rewrites the file when a
// version or a result changed (so re-runs don't churn). Exits 1 when an installed analyzer regressed.
//   node scripts/compat.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scan } from "../plugin/lib/scan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "site", "data", "compat.json");

// What each analyzer must find in samples/evm (by its own rule ids); "any-high" means at least one high finding.
const EXPECT = {
  slither: ["reentrancy-eth", "controlled-delegatecall", "tx-origin"],
  aderyn: "any-high",
  solhint: ["avoid-tx-origin"],
  "cargo-audit": null, // its findings depend on today's advisories; it only has to run
};

const sample = (n) => path.join(ROOT, "samples", n);
const vuln = await scan(sample("evm"), { timeoutMs: 600000 });
const clean = await scan(sample("evm-clean"), { timeoutMs: 600000 });
const anchor = await scan(sample("anchor"), { timeoutMs: 600000 });

const analyzers = {};
const problems = [];
for (const res of [vuln, anchor]) {
  for (const a of res.analyzers) {
    const found = [...new Set(res.findings.filter((f) => f.tool === a.tool).map((f) => f.rule))].sort();
    const expect = EXPECT[a.tool];
    let pass = a.status === "ok";
    if (pass && Array.isArray(expect)) pass = expect.every((id) => found.includes(id));
    if (pass && expect === "any-high") pass = res.findings.some((f) => f.tool === a.tool && f.severity === "high");
    analyzers[a.tool] = { version: a.version || "", status: a.status, pass, found: found.slice(0, 25), ...(a.status !== "ok" && a.note ? { note: String(a.note).split("\n")[0].slice(0, 200) } : {}) };
    if (a.status === "ok" && !pass) problems.push(`${a.tool} ${a.version} ran but no longer finds ${JSON.stringify(expect)} in samples/evm (found: ${found.join(", ")})`);
    if (a.status === "error") console.log(`::warning::${a.tool} couldn't run: ${a.note}`);
    if (a.status === "missing") console.log(`::warning::${a.tool} isn't installed on this runner`);
  }
}
for (const a of clean.analyzers) {
  const highs = clean.findings.filter((f) => f.tool === a.tool && f.severity === "high");
  if (a.status === "ok" && highs.length) problems.push(`${a.tool} reports high findings on the safe contract: ${highs.map((f) => f.rule).join(", ")}`);
  if (analyzers[a.tool]) analyzers[a.tool].cleanHigh = highs.length;
}
const quickHigh = clean.findings.filter((f) => f.tool === "quick-checks" && (f.severity === "high" || f.severity === "medium"));
if (quickHigh.length) problems.push(`quick checks flag the safe contract: ${quickHigh.map((f) => f.rule).join(", ")}`);

let previous = {};
try {
  previous = JSON.parse(fs.readFileSync(OUT, "utf8"));
} catch { /* first run */ }
const same = JSON.stringify(previous.analyzers || {}) === JSON.stringify(analyzers);
if (!same) {
  fs.writeFileSync(OUT, `${JSON.stringify({ changedOn: new Date().toISOString(), analyzers }, null, 2)}\n`);
  console.log("compat.json updated");
} else console.log("no change in analyzer versions or results");

console.log(JSON.stringify(analyzers, null, 2));
const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary) {
  fs.appendFileSync(summary, `## Analyzer compatibility\n\n| Analyzer | Version | Status | Finds the sample bugs |\n|---|---|---|---|\n${Object.entries(analyzers).map(([t, a]) => `| ${t} | ${a.version || "–"} | ${a.status} | ${a.pass ? "yes" : "no"} |`).join("\n")}\n\n${problems.map((p) => `- ${p}`).join("\n")}\n`);
}
for (const p of problems) console.log(`::error::${p}`);
process.exit(problems.length ? 1 : 0);
