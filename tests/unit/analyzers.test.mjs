// Analyzer adapters (parsing real outputs), the scanner, reports, and the hook's stdin/stdout contract.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseSlither, parseSolhint, parseAderyn, parseCargoAudit, which, doctor, INSTALL } from "../../plugin/lib/analyzers.mjs";
import { scan, collectFiles, countBySeverity } from "../../plugin/lib/scan.mjs";
import { toMarkdown, saveReport, summaryLine } from "../../plugin/lib/report.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixture = (n) => fs.readFileSync(path.join(ROOT, "tests", "fixtures", n), "utf8");
const HOOK = path.join(ROOT, "plugin", "hooks", "predeploy.mjs");

function copySample(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "preflight-test-"));
  fs.cpSync(path.join(ROOT, "samples", name), dir, { recursive: true });
  return dir;
}
// The hook and scans must not depend on analyzers installed on this machine: give them an empty PATH
// plus node itself.
const bareEnv = { ...process.env, PATH: path.dirname(process.execPath) };

test("Slither: real JSON from the vulnerable sample maps to findings", () => {
  const f = parseSlither(fixture("slither-vulnerable.json"));
  const by = Object.fromEntries(f.map((x) => [x.rule, x]));
  for (const id of ["reentrancy-eth", "arbitrary-send-eth", "controlled-delegatecall", "weak-prng"]) assert.equal(by[id].severity, "high", id);
  assert.equal(by["tx-origin"].severity, "medium");
  assert.equal(by["unchecked-lowlevel"].severity, "medium");
  assert.equal(by["solc-version"].severity, "info");
  assert.equal(by["reentrancy-eth"].file, "src/VulnerableVault.sol");
  assert.ok(by["reentrancy-eth"].line > 0);
  assert.match(by["reentrancy-eth"].url, /Detector-Documentation#reentrancy-eth/);
  assert.throws(() => parseSlither({ success: false, error: "compilation failed" }), /compilation failed/);
});

test("Solhint: only security rules are kept, with our severities", () => {
  const f = parseSolhint(fixture("solhint-vulnerable.json"));
  const rules = [...new Set(f.map((x) => x.rule))].sort();
  assert.ok(rules.includes("avoid-tx-origin") && rules.includes("avoid-low-level-calls"));
  assert.ok(!rules.includes("gas-custom-errors") && !rules.includes("use-natspec"), "style and gas rules are dropped");
  assert.equal(f.find((x) => x.rule === "avoid-tx-origin").severity, "medium");
  // ESLint-style nested output is understood too.
  const nested = parseSolhint([{ filePath: "a.sol", messages: [{ ruleId: "check-send-result", line: 4, message: "x" }, { ruleId: "quotes", line: 5 }] }]);
  assert.deepEqual(nested.map((x) => [x.rule, x.file, x.line]), [["check-send-result", "a.sol", 4]]);
});

test("Aderyn and cargo-audit report shapes", () => {
  const a = parseAderyn({
    high_issues: { issues: [{ title: "Unprotected initializer", description: "Anyone can call it", detector_name: "unprotected-initializer", instances: [{ contract_path: "src/V.sol", line_no: 11 }, { contract_path: "src/V.sol", line_no: 40 }] }] },
    low_issues: { issues: [{ title: "Floating pragma", detector_name: "unspecific-solidity-pragma", instances: [{ contract_path: "src/V.sol", line_no: 3 }] }] },
  });
  assert.deepEqual(a.map((x) => [x.severity, x.rule, x.line]), [["high", "unprotected-initializer", 11], ["high", "unprotected-initializer", 40], ["low", "unspecific-solidity-pragma", 3]]);
  const c = parseCargoAudit({
    vulnerabilities: { found: true, count: 1, list: [{ advisory: { id: "RUSTSEC-2024-0001", title: "Bad thing", url: "https://rustsec.org/advisories/RUSTSEC-2024-0001" }, package: { name: "curve25519-dalek", version: "3.2.0" } }] },
    warnings: { unmaintained: [{ advisory: { id: "RUSTSEC-2020-0016", title: "net2 unmaintained" }, package: { name: "net2" } }] },
  });
  assert.equal(c[0].severity, "high");
  assert.match(c[0].title, /curve25519-dalek 3\.2\.0: Bad thing/);
  assert.equal(c[1].severity, "low");
  assert.deepEqual(parseCargoAudit({ vulnerabilities: { found: false, list: [] } }), []);
});

test("which() finds executables on PATH only", () => {
  assert.equal(which("node", { PATH: path.dirname(process.execPath) }), process.execPath);
  assert.equal(which("definitely-not-a-tool-xyz", process.env), null);
});

test("scanning a project with no analyzers installed: quick checks, missing tools reported", async () => {
  const dir = copySample("evm");
  try {
    const files = collectFiles(dir);
    assert.equal(files.sol.length, 1);
    const r = await scan(dir, { env: bareEnv });
    assert.equal(r.kind, "foundry");
    assert.ok(r.counts.high >= 5, JSON.stringify(r.counts));
    const status = Object.fromEntries(r.analyzers.map((a) => [a.tool, a.status]));
    assert.deepEqual(status, { slither: "missing", solhint: "missing" }, "a retired analyzer is never reported as missing");
    assert.deepEqual(countBySeverity(r.findings), r.counts);
    const md = toMarkdown(r);
    assert.match(md, /# Chain Preflight report/);
    assert.match(md, /slither: not installed\. pip install slither-analyzer/);
    assert.match(md, /isn't an audit/);
    assert.match(summaryLine(r), /^\d+ high, \d+ medium, \d+ low/);
    const saved = saveReport(r);
    assert.ok(fs.existsSync(saved.latest) && fs.existsSync(saved.json));
    assert.equal(fs.readFileSync(path.join(dir, ".chain-preflight", ".gitignore"), "utf8"), "*\n");
    const clean = copySample("evm-clean");
    const rc = await scan(clean, { env: bareEnv });
    assert.equal(rc.counts.high + rc.counts.medium, 0, JSON.stringify(rc.findings));
    fs.rmSync(clean, { recursive: true, force: true });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a retired analyzer runs only where installed, and is never offered for install", async () => {
  const report = doctor(bareEnv);
  assert.deepEqual(report.filter((t) => !t.retired).map((t) => t.tool), Object.keys(INSTALL));
  const aderyn = report.find((t) => t.tool === "aderyn");
  assert.equal(aderyn.installed, false);
  assert.match(aderyn.retired, /Retired by Cyfrin on 2026-11-13/);
  assert.ok(!Object.keys(INSTALL).includes("aderyn"));
  for (const cmd of Object.values(INSTALL)) assert.doesNotMatch(cmd, /aderyn|cyfrinup/i);
  const dir = copySample("evm");
  try {
    const asked = await scan(dir, { env: bareEnv, only: ["aderyn"] });
    assert.deepEqual(asked.analyzers.map((a) => [a.tool, a.status]), [["aderyn", "missing"]]);
    assert.match(toMarkdown(asked), /aderyn: not installed\. Retired by Cyfrin/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scanning an Anchor workspace", async () => {
  const dir = copySample("anchor");
  try {
    const r = await scan(dir, { env: bareEnv });
    assert.equal(r.kind, "anchor");
    const ids = new Set(r.findings.map((f) => f.rule));
    for (const id of ["anchor-missing-signer", "anchor-arbitrary-cpi", "rust-overflow-checks-off"]) assert.ok(ids.has(id), id);
    assert.deepEqual(r.analyzers.map((a) => [a.tool, a.status]), [["cargo-audit", "missing"]]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function hook(event) {
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(event), encoding: "utf8", env: bareEnv, timeout: 60000 });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr };
}

test("hook, Claude Code: silent for ordinary and local commands; deny, ask or note for real deploys", () => {
  const dir = copySample("evm");
  const clean = copySample("evm-clean");
  try {
    let r = hook({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "forge test -vvv" }, cwd: dir });
    assert.deepEqual([r.code, r.out], [0, ""]);
    r = hook({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "forge script s --broadcast --rpc-url http://localhost:8545" }, cwd: dir });
    assert.deepEqual([r.code, r.out], [0, ""]);
    r = hook({ hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "x" }, cwd: dir });
    assert.deepEqual([r.code, r.out], [0, ""]);
    r = hook({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "forge script s --broadcast --rpc-url mainnet" }, cwd: dir });
    const deny = JSON.parse(r.out).hookSpecificOutput;
    assert.equal(deny.hookEventName, "PreToolUse");
    assert.equal(deny.permissionDecision, "deny");
    assert.match(deny.permissionDecisionReason, /high/);
    assert.match(deny.additionalContext, /Full report: .*latest\.md/);
    fs.writeFileSync(path.join(dir, ".chain-preflight.json"), JSON.stringify({ highOnMainnet: "ask" }));
    r = hook({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "forge script s --broadcast --rpc-url mainnet" }, cwd: dir });
    assert.equal(JSON.parse(r.out).hookSpecificOutput.permissionDecision, "ask", "the project's policy is honoured");
    r = hook({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "forge script s --broadcast --rpc-url sepolia" }, cwd: clean });
    const note = JSON.parse(r.out).hookSpecificOutput;
    assert.equal(note.permissionDecision, undefined, "a clean testnet deploy isn't approved or blocked, only noted");
    assert.match(note.additionalContext, /0 high, 0 medium/);
    r = hook({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "forge script s --broadcast --rpc-url mainnet" }, cwd: clean });
    assert.equal(JSON.parse(r.out).hookSpecificOutput.permissionDecision, "ask", "mainnet always gets a human checkpoint");
    r = spawnSync(process.execPath, [HOOK], { input: "not json", encoding: "utf8", env: bareEnv });
    assert.deepEqual([r.status, r.stdout], [0, ""], "garbage in: no output, no block");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(clean, { recursive: true, force: true });
  }
});

test("hook, Cursor: always answers with a permission", () => {
  const dir = copySample("anchor");
  try {
    let r = hook({ hook_event_name: "beforeShellExecution", command: "ls -la", cwd: dir, workspace_roots: [dir] });
    assert.deepEqual(JSON.parse(r.out), { permission: "allow" });
    r = hook({ hook_event_name: "beforeShellExecution", command: "anchor deploy --provider.cluster devnet", cwd: dir, workspace_roots: [dir] });
    const j = JSON.parse(r.out);
    assert.equal(j.permission, "ask");
    assert.match(j.user_message, /testnet \(devnet\)/);
    assert.match(j.agent_message, /Chain Preflight scanned/);
    r = hook({ hook_event_name: "beforeShellExecution", command: "anchor deploy", cwd: dir, workspace_roots: [dir] });
    assert.deepEqual(JSON.parse(r.out), { permission: "allow" }, "Anchor.toml says localnet");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
