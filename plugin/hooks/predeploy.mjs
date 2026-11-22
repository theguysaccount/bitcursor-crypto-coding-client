#!/usr/bin/env node
// The pre-deploy hook for Claude Code (PreToolUse on Bash) and Cursor (beforeShellExecution).
// Reads the hook event from stdin. For commands that deploy to a non-local network it scans the
// project (quick checks + installed analyzers), saves a report, and asks, blocks or notes per the
// policy in .chain-preflight.json. Every other command passes straight through in a few milliseconds.
// If the scan itself fails, the command is not blocked: the agent is told the check couldn't run.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectDeploy, MAYBE_DEPLOY, decide, findProject } from "../lib/detect.mjs";

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function emit(format, decision, reason, context) {
  if (format === "cursor") {
    // Cursor treats invalid or missing JSON from a permission hook as a block, so always answer.
    const permission = decision === "deny" ? "deny" : decision === "ask" ? "ask" : "allow";
    process.stdout.write(JSON.stringify({ permission, ...(reason ? { user_message: reason } : {}), ...(context || reason ? { agent_message: context || reason } : {}) }));
    return;
  }
  if (decision === "allow" && !context) return; // nothing to say: the normal permission flow continues
  const out = { hookEventName: "PreToolUse" };
  if (decision === "deny" || decision === "ask") {
    out.permissionDecision = decision;
    out.permissionDecisionReason = reason;
  }
  if (context) out.additionalContext = context;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: out }));
}

function loadPolicy(root) {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(root, ".chain-preflight.json"), "utf8"));
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

async function main() {
  const raw = readStdin();
  let input = {};
  try {
    input = JSON.parse(raw || "{}");
  } catch {
    return;
  }
  const cursor = input.hook_event_name === "beforeShellExecution" || (typeof input.command === "string" && !input.tool_input);
  const format = cursor ? "cursor" : "claude";
  const command = cursor ? input.command : input.tool_input && input.tool_input.command;
  if (!cursor && input.tool_name && input.tool_name !== "Bash") return;
  if (typeof command !== "string" || !MAYBE_DEPLOY.test(command)) return emit(format, "allow");
  const cwd = input.cwd || (Array.isArray(input.workspace_roots) && input.workspace_roots[0]) || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const detection = detectDeploy(command, { cwd });
  if (!detection.deploy || detection.network === "local" || process.env.CHAIN_PREFLIGHT === "off") return emit(format, "allow");

  const { root } = findProject(detection.cwd || cwd);
  const policy = loadPolicy(root);
  try {
    const { scan } = await import("../lib/scan.mjs");
    const { saveReport, summaryLine, DISCLAIMER } = await import("../lib/report.mjs");
    const result = await scan(root, { analyzers: policy.analyzers !== false, timeoutMs: (policy.analyzerTimeoutSeconds || 180) * 1000 });
    const files = saveReport(result, { detection });
    const verdict = decide(detection, result.counts, policy);
    const top = result.findings.filter((f) => f.severity === "high" || f.severity === "medium").slice(0, 6)
      .map((f) => `- [${f.severity}] ${f.title} at ${f.file}${f.line ? `:${f.line}` : ""} (${f.tool})`).join("\n");
    const missing = result.analyzers.filter((a) => a.status === "missing").map((a) => a.tool);
    const context = [
      `Chain Preflight scanned ${root} before \`${detection.tool}\` to ${detection.network}${detection.target ? ` (${detection.target})` : ""}: ${summaryLine(result)}.`,
      top,
      `Full report: ${files.latest}`,
      missing.length ? `Not installed: ${missing.join(", ")} (run \`node "${path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../bin/preflight.mjs")}" doctor\` for install commands).` : "",
      verdict.decision === "deny" ? "Tell the user what was found and propose fixes; don't retry the deploy until they're fixed or the user changes the policy." : "",
      DISCLAIMER,
    ].filter(Boolean).join("\n");
    emit(format, verdict.decision === "note" ? "allow" : verdict.decision, verdict.reason, context);
  } catch (e) {
    emit(format, "allow", "", `Chain Preflight couldn't scan before this deploy (${e.message}). The deploy wasn't checked.`);
  }
}

main().catch(() => process.exit(0));
