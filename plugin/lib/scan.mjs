// Scan a project: collect its contracts and programs, run the quick checks and the installed
// analyzers, and merge everything into one list with counts per severity.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { checkSource, SEVERITIES } from "./rules.js";
import { runAnalyzers } from "./analyzers.mjs";
import { findProject } from "./detect.mjs";

const SKIP_DIRS = new Set(["node_modules", ".git", "lib", "out", "cache", "artifacts", "target", "coverage", "typechain", "typechain-types", ".chain-preflight", "broadcast", ".anchor", "dist", "build", ".next", ".turbo", "test-ledger"]);
const MAX_FILES = 400, MAX_BYTES = 600 * 1024;

export function collectFiles(root) {
  const sol = [], rust = [], cargo = [], scripts = [];
  const walk = (dir, depth) => {
    if (depth > 8 || sol.length + rust.length + scripts.length > MAX_FILES) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) walk(p, depth + 1);
        continue;
      }
      if (!e.isFile()) continue;
      let size = 0;
      try {
        size = fs.statSync(p).size;
      } catch {
        continue;
      }
      if (size > MAX_BYTES) continue;
      if (e.name.endsWith(".sol") && !/\.t\.sol$|\.s\.sol$/.test(e.name) && !/(^|\/)(test|tests|mocks?)(\/|$)/i.test(path.relative(root, p))) sol.push(p);
      else if (e.name.endsWith(".rs") && /(^|\/)programs\//.test(path.relative(root, p))) rust.push(p);
      else if (e.name === "Cargo.toml") cargo.push(p);
      else if (/\.(s\.sol|js|ts|mjs|cjs|json|toml|ya?ml|sh)$/.test(e.name) && /(^|\/)(script|scripts|deploy|deployments|migrations|ignition)(\/|$)|hardhat\.config|foundry\.toml|truffle-config|Anchor\.toml/.test(path.relative(root, p))) scripts.push(p);
    }
  };
  walk(root, 0);
  // A .env file only matters if git tracks it.
  const env = path.join(root, ".env");
  if (fs.existsSync(env)) {
    const r = spawnSync("git", ["ls-files", "--error-unmatch", ".env"], { cwd: root, encoding: "utf8" });
    if (r.status === 0) scripts.push(env);
  }
  return { sol, rust, cargo, scripts };
}

export function countBySeverity(findings) {
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  return counts;
}

/**
 * @param {string} dir  any folder in the project
 * @param {{analyzers?: boolean, only?: string[], timeoutMs?: number}} opts
 */
export async function scan(dir, { analyzers = true, only = null, timeoutMs = 180000, env = process.env } = {}) {
  const started = Date.now();
  const { root, kind } = findProject(path.resolve(dir));
  const files = collectFiles(root);
  const quick = [];
  for (const f of [...files.sol, ...files.rust, ...files.cargo, ...files.scripts]) {
    let src;
    try {
      src = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    quick.push(...checkSource(src, path.relative(root, f)));
  }
  const tools = analyzers ? await runAnalyzers(root, { kind, solFiles: files.sol, rustFiles: files.rust, only, timeoutMs, env }) : [];
  const findings = [...quick, ...tools.flatMap((t) => t.findings)];
  const order = { high: 0, medium: 1, low: 2, info: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || String(a.file).localeCompare(String(b.file)) || a.line - b.line);
  return {
    root, kind, scannedAt: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 100) / 10,
    files: { solidity: files.sol.length, rust: files.rust.length, config: files.cargo.length + files.scripts.length },
    analyzers: tools.map(({ findings: f, ...t }) => ({ ...t, findings: f.length })),
    counts: countBySeverity(findings),
    findings,
  };
}
