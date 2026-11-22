// Adapters for the open-source analyzers Chain Preflight runs when they're installed:
//   Slither (EVM, Trail of Bits, AGPL-3.0)   pip install slither-analyzer  (+ solc-select, or forge/hardhat)
//   Aderyn  (EVM, Cyfrin, GPL-3.0)           cargo install aderyn  /  cyfrinup
//   Solhint (EVM, Protofire, MIT)            npm install -g solhint
//   cargo-audit (Rust/Anchor, RustSec)       cargo install cargo-audit
// None are bundled: they run as separate programs, and a missing one is reported, never fatal.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

export const INSTALL = {
  slither: "pip install slither-analyzer solc-select  (then: solc-select install 0.8.28 && solc-select use 0.8.28)",
  aderyn: "cargo install aderyn   (or: curl -L https://raw.githubusercontent.com/Cyfrin/up/main/install | bash && cyfrinup)",
  solhint: "npm install -g solhint",
  "cargo-audit": "cargo install cargo-audit",
};

export function which(cmd, env = process.env) {
  const dirs = (env.PATH || "").split(path.delimiter).filter(Boolean);
  const exts = process.platform === "win32" ? (env.PATHEXT || ".EXE;.CMD;.BAT").split(";") : [""];
  for (const d of dirs) {
    for (const e of exts) {
      const p = path.join(d, cmd + e);
      try {
        fs.accessSync(p, fs.constants.X_OK);
        if (fs.statSync(p).isFile()) return p;
      } catch { /* keep looking */ }
    }
  }
  return null;
}

function run(cmd, args, { cwd, timeoutMs = 180000, env = process.env } = {}) {
  return new Promise((resolve) => {
    let out = "", err = "", done = false;
    const child = spawn(cmd, args, { cwd, env: { ...env, PYTHONWARNINGS: "ignore", NO_COLOR: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      if (!done) {
        child.kill("SIGKILL");
        resolve({ code: null, out, err: `${err}\ntimed out after ${Math.round(timeoutMs / 1000)}s`, timedOut: true });
        done = true;
      }
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ code: null, out, err: e.message });
    });
    child.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ code, out, err });
    });
  });
}

function version(cmd, args = ["--version"]) {
  try {
    const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 20000, env: { ...process.env, PYTHONWARNINGS: "ignore" } });
    const text = `${r.stdout || ""}\n${r.stderr || ""}`;
    const m = text.match(/(\d+\.\d+\.\d+(?:[-.][\w.]+)?)/);
    return m ? m[1] : "";
  } catch {
    return "";
  }
}

const tail = (s, n = 400) => String(s || "").trim().split("\n").filter((l) => !/NotOpenSSLWarning|warnings\.warn/.test(l)).join("\n").slice(-n);

// ---------------------------------------------------------------- parsers (pure: tested with real outputs)

const SLITHER_SEVERITY = { High: "high", Medium: "medium", Low: "low", Informational: "info", Optimization: "info" };

export function parseSlither(json, root = "") {
  const d = typeof json === "string" ? JSON.parse(json) : json;
  if (!d || d.success === false) throw new Error((d && d.error) || "Slither reported a failure");
  return ((d.results && d.results.detectors) || []).map((x) => {
    const el = (x.elements || []).find((e) => e.source_mapping && e.source_mapping.filename_relative) || {};
    const sm = el.source_mapping || {};
    const file = sm.filename_relative || "";
    return {
      tool: "slither", rule: x.check, severity: SLITHER_SEVERITY[x.impact] || "info", confidence: (x.confidence || "").toLowerCase(),
      title: x.check, file: root && path.isAbsolute(file) ? path.relative(root, file) : file, line: (sm.lines && sm.lines[0]) || 0,
      message: String(x.description || "").split("\n")[0].replace(/\s+\(.*?#\d+-\d+\)/g, "").trim().slice(0, 300),
      url: `https://github.com/crytic/slither/wiki/Detector-Documentation#${x.check}`,
    };
  });
}

export function parseAderyn(json, root = "") {
  const d = typeof json === "string" ? JSON.parse(json) : json;
  const out = [];
  for (const [key, severity] of [["critical_issues", "high"], ["high_issues", "high"], ["medium_issues", "medium"], ["low_issues", "low"]]) {
    const group = d[key];
    if (!group || !Array.isArray(group.issues)) continue;
    for (const issue of group.issues) {
      for (const inst of (issue.instances || []).slice(0, 20)) {
        const file = inst.contract_path || "";
        out.push({ tool: "aderyn", rule: issue.detector_name || issue.title, severity, title: issue.title, file: root && path.isAbsolute(file) ? path.relative(root, file) : file, line: inst.line_no || 0, message: String(issue.description || issue.title || "").split("\n")[0].slice(0, 300) });
      }
    }
  }
  return out;
}

const SOLHINT_SECURITY = {
  "avoid-tx-origin": "medium", "no-unchecked-calls": "medium", "check-send-result": "medium", reentrancy: "medium", "multiple-sends": "medium", "avoid-call-value": "medium",
  "avoid-low-level-calls": "low", "not-rely-on-time": "low", "avoid-suicide": "low", "compiler-version": "low", "state-visibility": "low", "func-visibility": "low",
  "no-complex-fallback": "low", "payable-fallback": "low", "avoid-sha3": "low", "avoid-throw": "low", "no-inline-assembly": "info",
};

export function parseSolhint(json, root = "") {
  const d = typeof json === "string" ? JSON.parse(json) : json;
  const flat = [];
  for (const entry of Array.isArray(d) ? d : []) {
    if (entry && Array.isArray(entry.messages)) for (const m of entry.messages) flat.push({ ...m, filePath: entry.filePath });
    else if (entry && entry.ruleId) flat.push(entry);
  }
  return flat.filter((m) => SOLHINT_SECURITY[m.ruleId]).map((m) => ({
    tool: "solhint", rule: m.ruleId, severity: SOLHINT_SECURITY[m.ruleId], title: m.ruleId,
    file: root && path.isAbsolute(m.filePath || "") ? path.relative(root, m.filePath) : m.filePath || "", line: m.line || 0, message: String(m.message || "").slice(0, 300),
  }));
}

export function parseCargoAudit(json) {
  const d = typeof json === "string" ? JSON.parse(json) : json;
  const list = (d.vulnerabilities && d.vulnerabilities.list) || [];
  const out = list.map((v) => ({
    tool: "cargo-audit", rule: (v.advisory && v.advisory.id) || "RUSTSEC", severity: "high",
    title: `${(v.package && v.package.name) || ""} ${(v.package && v.package.version) || ""}: ${(v.advisory && v.advisory.title) || "vulnerable dependency"}`.trim(),
    file: "Cargo.lock", line: 0, message: (v.advisory && v.advisory.title) || "", url: (v.advisory && v.advisory.url) || (v.advisory && v.advisory.id ? `https://rustsec.org/advisories/${v.advisory.id}` : ""),
  }));
  for (const [kind, items] of Object.entries((d.warnings) || {})) {
    for (const w of items || []) {
      out.push({ tool: "cargo-audit", rule: (w.advisory && w.advisory.id) || kind, severity: "low", title: `${(w.package && w.package.name) || ""}: ${kind}`, file: "Cargo.lock", line: 0, message: (w.advisory && w.advisory.title) || kind });
    }
  }
  return out;
}

// ---------------------------------------------------------------- runners

async function runSlither(root, kind, files, opts) {
  const bin = which("slither", opts.env);
  if (!bin) return { tool: "slither", status: "missing", install: INSTALL.slither, findings: [] };
  const v = version(bin);
  const base = ["--json", "-", "--disable-color", "--exclude-dependencies", "--fail-none"];
  let r;
  if (kind === "foundry" || kind === "hardhat" || kind === "truffle") {
    const fw = kind === "foundry" ? "forge" : kind === "hardhat" ? "npx" : "truffle";
    if (!which(fw, opts.env)) return { tool: "slither", version: v, status: "error", note: `Slither compiles ${kind} projects with \`${fw}\`, which isn't on the PATH.`, findings: [] };
    r = await run(bin, [".", ...base], { cwd: root, timeoutMs: opts.timeoutMs });
  } else {
    const all = [];
    for (const f of files.slice(0, 15)) {
      const one = await run(bin, [f, ...base], { cwd: root, timeoutMs: opts.timeoutMs });
      if (!one.out.trim()) return { tool: "slither", version: v, status: "error", note: tail(one.err) || "no output", findings: [] };
      try {
        all.push(...parseSlither(one.out, root));
      } catch (e) {
        return { tool: "slither", version: v, status: "error", note: e.message, findings: [] };
      }
    }
    return { tool: "slither", version: v, status: "ok", findings: all };
  }
  if (!r.out.trim()) return { tool: "slither", version: v, status: "error", note: tail(r.err) || "no output", findings: [] };
  try {
    return { tool: "slither", version: v, status: "ok", findings: parseSlither(r.out, root) };
  } catch (e) {
    return { tool: "slither", version: v, status: "error", note: `${e.message} ${tail(r.err, 200)}`.trim(), findings: [] };
  }
}

async function runAderyn(root, kind, files, opts) {
  const bin = which("aderyn", opts.env);
  if (!bin) return { tool: "aderyn", status: "missing", install: INSTALL.aderyn, findings: [] };
  const v = version(bin);
  const outFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "preflight-aderyn-")), "report.json");
  const r = await run(bin, [root, "--output", outFile], { cwd: root, timeoutMs: opts.timeoutMs });
  try {
    const findings = parseAderyn(fs.readFileSync(outFile, "utf8"), root);
    return { tool: "aderyn", version: v, status: "ok", findings };
  } catch {
    return { tool: "aderyn", version: v, status: "error", note: tail(r.err || r.out) || "no report", findings: [] };
  } finally {
    fs.rmSync(path.dirname(outFile), { recursive: true, force: true });
  }
}

async function runSolhint(root, kind, files, opts) {
  const bin = which("solhint", opts.env);
  if (!bin) return { tool: "solhint", status: "missing", install: INSTALL.solhint, findings: [] };
  const v = version(bin);
  const hasConfig = [".solhint.json", ".solhintrc", ".solhintrc.json"].some((n) => fs.existsSync(path.join(root, n)));
  let cfgDir = null;
  const args = ["--formatter", "json"];
  if (!hasConfig) {
    cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), "preflight-solhint-"));
    fs.writeFileSync(path.join(cfgDir, ".solhint.json"), JSON.stringify({ extends: "solhint:recommended" }));
    args.push("--config", path.join(cfgDir, ".solhint.json"));
  }
  const rel = files.slice(0, 200).map((f) => path.relative(root, f));
  const r = await run(bin, [...args, ...rel], { cwd: root, timeoutMs: opts.timeoutMs });
  if (cfgDir) fs.rmSync(cfgDir, { recursive: true, force: true });
  try {
    return { tool: "solhint", version: v, status: "ok", findings: parseSolhint(r.out, root) };
  } catch {
    return { tool: "solhint", version: v, status: "error", note: tail(r.err || r.out) || "no output", findings: [] };
  }
}

async function runCargoAudit(root, kind, files, opts) {
  const cargo = which("cargo", opts.env);
  if (!cargo || spawnSync(cargo, ["audit", "--version"], { encoding: "utf8", timeout: 20000 }).status !== 0) {
    return { tool: "cargo-audit", status: "missing", install: INSTALL["cargo-audit"], findings: [] };
  }
  const v = version(cargo, ["audit", "--version"]);
  if (!fs.existsSync(path.join(root, "Cargo.lock"))) return { tool: "cargo-audit", version: v, status: "skipped", note: "no Cargo.lock (run anchor build once)", findings: [] };
  const r = await run(cargo, ["audit", "--json"], { cwd: root, timeoutMs: opts.timeoutMs });
  try {
    return { tool: "cargo-audit", version: v, status: "ok", findings: parseCargoAudit(r.out) };
  } catch {
    return { tool: "cargo-audit", version: v, status: "error", note: tail(r.err) || "no output", findings: [] };
  }
}

const RUNNERS = { slither: runSlither, aderyn: runAderyn, solhint: runSolhint, "cargo-audit": runCargoAudit };

/** Run the analyzers that fit the project. `only` limits which; missing tools are reported, not fatal. */
export async function runAnalyzers(root, { kind = "unknown", solFiles = [], rustFiles = [], only = null, timeoutMs = 180000, env = process.env } = {}) {
  const names = [];
  if (solFiles.length) names.push("slither", "aderyn", "solhint");
  if (rustFiles.length || kind === "anchor") names.push("cargo-audit");
  const results = [];
  for (const name of names) {
    if (only && !only.includes(name)) continue;
    try {
      results.push(await RUNNERS[name](root, kind, name === "cargo-audit" ? rustFiles : solFiles, { timeoutMs, env }));
    } catch (e) {
      results.push({ tool: name, status: "error", note: e.message, findings: [] });
    }
  }
  return results;
}

export function doctor(env = process.env) {
  return Object.keys(INSTALL).map((tool) => {
    const bin = tool === "cargo-audit" ? which("cargo", env) : which(tool, env);
    let installed = !!bin;
    let v = "";
    if (tool === "cargo-audit" && bin) {
      installed = spawnSync(bin, ["audit", "--version"], { encoding: "utf8", timeout: 20000 }).status === 0;
      if (installed) v = version(bin, ["audit", "--version"]);
    } else if (bin) v = version(bin);
    return { tool, installed, version: v, install: INSTALL[tool] };
  });
}
