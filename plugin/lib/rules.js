// Chain Preflight quick checks: fast, dependency-free pattern checks for Solidity and Anchor (Rust)
// that run anywhere (the pre-deploy hook, the CLI, the browser checker). They flag code to review;
// they are not a proof of safety. The real analyzers (Slither, Solhint, cargo-audit; Aderyn where installed) run on
// top of these when they're installed.

export const SEVERITIES = ["high", "medium", "low", "info"];

/** The rule catalog: metadata for reports and the website. `detectors` maps to analyzer rule ids. */
export const RULES = [
  { id: "sol-tx-origin-auth", lang: "solidity", severity: "high", title: "tx.origin used for authorization",
    summary: "Checking `tx.origin` lets any contract the owner interacts with act as the owner.",
    detectors: { slither: "tx-origin", solhint: "avoid-tx-origin", aderyn: "", swc: "SWC-115" } },
  { id: "sol-reentrancy", lang: "solidity", severity: "high", title: "State written after an external call (reentrancy)",
    summary: "A function sends ETH or calls another contract before updating its own state, so the callee can re-enter and act on stale state.",
    detectors: { slither: "reentrancy-eth, reentrancy-no-eth", solhint: "reentrancy", aderyn: "state-change-after-external-call", swc: "SWC-107" } },
  { id: "sol-unchecked-call", lang: "solidity", severity: "high", title: "Return value of a low-level call is ignored",
    summary: "`call`, `send` and `delegatecall` return false instead of reverting; ignoring it loses failures silently.",
    detectors: { slither: "unchecked-lowlevel, unchecked-send", solhint: "check-send-result", aderyn: "unchecked-low-level-call", swc: "SWC-104" } },
  { id: "sol-delegatecall-input", lang: "solidity", severity: "high", title: "delegatecall to an address the caller controls",
    summary: "`delegatecall` runs foreign code with this contract's storage and balance; a caller-chosen target can take it over.",
    detectors: { slither: "controlled-delegatecall", solhint: "avoid-low-level-calls", aderyn: "delegate-call-in-loop", swc: "SWC-112" } },
  { id: "sol-unprotected-initializer", lang: "solidity", severity: "high", title: "Initializer anyone can call",
    summary: "An `initialize` function without the `initializer` modifier or an access check can be called again, or first, by an attacker.",
    detectors: { slither: "unprotected-upgrade, uninitialized-state", solhint: "", aderyn: "unprotected-initializer", swc: "SWC-118" } },
  { id: "sol-missing-access-control", lang: "solidity", severity: "high", title: "Privileged function without access control",
    summary: "A function that mints, withdraws, upgrades, pauses or changes ownership is public with no modifier or sender check.",
    detectors: { slither: "arbitrary-send-eth, suicidal, unprotected-upgrade", solhint: "", aderyn: "centralization-risk", swc: "SWC-105, SWC-106" } },
  { id: "sol-selfdestruct", lang: "solidity", severity: "medium", title: "selfdestruct in contract code",
    summary: "`selfdestruct` is deprecated and, since EIP-6780, no longer deletes code except in the deploying transaction; if reachable by the wrong caller it still sends away all ETH.",
    detectors: { slither: "suicidal", solhint: "avoid-suicide", aderyn: "", swc: "SWC-106" } },
  { id: "sol-weak-randomness", lang: "solidity", severity: "medium", title: "Randomness from block values",
    summary: "`block.timestamp`, `blockhash` and `block.prevrandao` are known or influenced by validators; they can't decide winners.",
    detectors: { slither: "weak-prng", solhint: "not-rely-on-time", aderyn: "weak-randomness", swc: "SWC-120" } },
  { id: "sol-unchecked-erc20", lang: "solidity", severity: "medium", title: "ERC-20 transfer result ignored",
    summary: "Some tokens return false instead of reverting; use SafeERC20 or check the returned bool.",
    detectors: { slither: "unchecked-transfer", solhint: "", aderyn: "unsafe-erc20-functions", swc: "SWC-104" } },
  { id: "sol-ecrecover-zero", lang: "solidity", severity: "medium", title: "ecrecover result not checked for address(0)",
    summary: "`ecrecover` returns the zero address for invalid signatures; comparing it to an unset signer accepts garbage.",
    detectors: { slither: "", solhint: "", aderyn: "ecrecover", swc: "SWC-117, SWC-122" } },
  { id: "sol-spot-price", lang: "solidity", severity: "medium", title: "Price read from AMM reserves",
    summary: "`getReserves()` spot prices can be moved inside one transaction with a flash loan; use a TWAP or an oracle.",
    detectors: { slither: "", solhint: "", aderyn: "", swc: "" } },
  { id: "sol-old-compiler", lang: "solidity", severity: "medium", title: "Compiler older than 0.8 (no overflow checks)",
    summary: "Before Solidity 0.8, arithmetic wraps silently unless every operation uses SafeMath.",
    detectors: { slither: "solc-version", solhint: "compiler-version", aderyn: "", swc: "SWC-101, SWC-102" } },
  { id: "sol-floating-pragma", lang: "solidity", severity: "low", title: "Floating pragma",
    summary: "`pragma solidity ^0.8.0` lets a deployment use a compiler you didn't test with; pin the version you audited.",
    detectors: { slither: "pragma", solhint: "compiler-version", aderyn: "unspecific-solidity-pragma", swc: "SWC-103" } },
  { id: "sol-unchecked-block", lang: "solidity", severity: "info", title: "unchecked { } arithmetic",
    summary: "Overflow checks are off inside `unchecked`; make sure every operation there is provably bounded.",
    detectors: { slither: "", solhint: "", aderyn: "", swc: "SWC-101" } },
  { id: "anchor-unchecked-account", lang: "anchor", severity: "high", title: "Unchecked account without a /// CHECK: note",
    summary: "`AccountInfo` and `UncheckedAccount` skip Anchor's owner and type checks; each needs an explicit reason and manual checks.",
    detectors: { anchor: "anchor build error: unsafe field", clippy: "", sealevel: "2-owner-checks, 3-type-cosplay" } },
  { id: "anchor-missing-signer", lang: "anchor", severity: "high", title: "Authority account that isn't a Signer",
    summary: "An authority, admin or owner account that isn't `Signer<'info>` (or `signer` constrained) lets anyone pass someone else's key.",
    detectors: { anchor: "", clippy: "", sealevel: "0-signer-authorization" } },
  { id: "anchor-arbitrary-cpi", lang: "anchor", severity: "high", title: "CPI to a program the caller chooses",
    summary: "`invoke`/`invoke_signed` with a program account that isn't `Program<'info, T>` or checked against a known id runs whatever program the caller passes.",
    detectors: { anchor: "", clippy: "", sealevel: "5-arbitrary-cpi" } },
  { id: "anchor-owner-check", lang: "anchor", severity: "high", title: "Account data deserialized without an owner check",
    summary: "`try_from_slice` on raw account data trusts bytes that any program could have written.",
    detectors: { anchor: "", clippy: "", sealevel: "2-owner-checks, 3-type-cosplay" } },
  { id: "anchor-init-if-needed", lang: "anchor", severity: "medium", title: "init_if_needed (reinitialization risk)",
    summary: "`init_if_needed` accepts accounts that already exist; without checks an attacker can reset or reuse state.",
    detectors: { anchor: "requires the init-if-needed feature", clippy: "", sealevel: "4-initialization" } },
  { id: "anchor-manual-close", lang: "anchor", severity: "medium", title: "Account closed by draining lamports by hand",
    summary: "Zeroing lamports without clearing data and owner lets the account be revived in the same transaction; use `close = target`.",
    detectors: { anchor: "", clippy: "", sealevel: "9-closing-accounts" } },
  { id: "rust-overflow-checks-off", lang: "anchor", severity: "medium", title: "overflow-checks not enabled for release builds",
    summary: "Release builds wrap on overflow unless `overflow-checks = true` is set in `[profile.release]`.",
    detectors: { anchor: "", clippy: "arithmetic_side_effects", sealevel: "" } },
  { id: "anchor-unchecked-math", lang: "anchor", severity: "low", title: "Unchecked arithmetic on amounts",
    summary: "`+`, `-` and `*` on balances or amounts can overflow; prefer `checked_add`/`checked_sub` and return an error.",
    detectors: { anchor: "", clippy: "arithmetic_side_effects", sealevel: "" } },
  { id: "any-private-key", lang: "any", severity: "high", title: "Private key or keypair in the source",
    summary: "A hex private key or a Solana keypair array is committed in the code; anyone with the repo controls that account.",
    detectors: { slither: "", solhint: "", aderyn: "", sealevel: "" } },
];

const BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r]));
export const rule = (id) => BY_ID[id];

/** Replace comments (and string contents, optionally) with spaces, keeping line numbers and columns. */
export function stripComments(src, { strings = false, keepDocComments = false } = {}) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") {
      const isDoc = src[i + 2] === "/" && keepDocComments;
      while (i < n && src[i] !== "\n") {
        out += isDoc ? src[i] : " ";
        i++;
      }
    } else if (c === "/" && d === "*") {
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (i < n) {
        out += "  ";
        i += 2;
      }
    } else if (c === '"' || c === "'") {
      const q = c;
      out += c;
      i++;
      while (i < n && src[i] !== q && src[i] !== "\n") {
        if (src[i] === "\\") {
          out += strings ? "  " : src[i] + (src[i + 1] || "");
          i += 2;
          continue;
        }
        out += strings ? " " : src[i];
        i++;
      }
      if (i < n && src[i] === q) {
        out += q;
        i++;
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

export function lineAt(src, index) {
  let line = 1;
  for (let i = 0; i < index && i < src.length; i++) if (src[i] === "\n") line++;
  return line;
}

function lineText(src, line) {
  return (src.split("\n")[line - 1] || "").trim().slice(0, 160);
}

/** Matching closing brace for the "{" at `open`. */
function blockEnd(code, open) {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return code.length;
}

/** Solidity functions: { name, header, body, start (index of "{"), end, params, modifiers }. */
export function solidityFunctions(code) {
  const out = [];
  const re = /\bfunction\s+([A-Za-z_$][\w$]*)?\s*\(([^)]*)\)([^{;]*)\{/g;
  for (let m = re.exec(code); m; m = re.exec(code)) {
    const open = m.index + m[0].length - 1;
    const end = blockEnd(code, open);
    out.push({ name: m[1] || "", params: m[2], header: m[3], body: code.slice(open + 1, end), start: open, end, at: m.index });
    re.lastIndex = open + 1;
  }
  return out;
}

/** State variable names declared at contract level (outside functions, modifiers and structs). */
export function stateVariables(code) {
  const names = new Set();
  const contractRe = /\b(contract|abstract\s+contract|library)\s+\w+[^{]*\{/g;
  for (let m = contractRe.exec(code); m; m = contractRe.exec(code)) {
    const open = m.index + m[0].length - 1;
    const end = blockEnd(code, open);
    let depth = 0;
    let stmt = "";
    for (let i = open + 1; i < end; i++) {
      const ch = code[i];
      if (ch === "{") {
        depth++;
        stmt = "";
        continue;
      }
      if (ch === "}") {
        depth--;
        stmt = "";
        continue;
      }
      if (depth > 0) continue;
      if (ch === ";") {
        const s = stmt.replace(/\s+/g, " ").trim();
        if (!/^(using|event|error|import|pragma|function|modifier|constructor)\b/.test(s)) {
          const decl = s.match(/^(?:mapping\s*\(.*\)|[A-Za-z_][\w.]*(?:\[\d*\])*)\s+(?:(?:public|private|internal|immutable|constant|override|transient)\s+)*([A-Za-z_]\w*)\s*(?:=|$)/);
          if (decl && !/\bconstant\b|\bimmutable\b/.test(s)) names.add(decl[1]);
        }
        stmt = "";
      } else stmt += ch;
    }
    contractRe.lastIndex = open + 1;
  }
  return names;
}

const PRIVILEGED = /^(mint|burn|withdraw\w*|sweep\w*|rescue\w*|set(Owner|Admin|Fee|Fees|Price|Oracle|Treasury|Minter|Operator|Implementation|BaseURI|Signer)\w*|transferOwnership|renounceOwnership|upgradeTo\w*|pause|unpause|kill|destroy|emergency\w*|grantRole|revokeRole|changeOwner|addAdmin|setApproval\w*)$/i;

function hasAccessCheck(fn) {
  if (/\bonly[A-Z]\w*|\bauth\b|\brequiresAuth\b|\bonlyRole\s*\(|\bwhenNotPaused\b.*\bonly/.test(fn.header)) return true;
  if (/\binitializer\b|\breinitializer\b/.test(fn.header)) return true;
  return /require\s*\(\s*(msg\.sender|_msgSender\(\))\s*==|require\s*\([^;]*==\s*(msg\.sender|_msgSender\(\))|if\s*\(\s*(msg\.sender|_msgSender\(\))\s*!=|_checkOwner\s*\(|_checkRole\s*\(|hasRole\s*\(|onlyOwner|isOwner\s*\(|_authorizeUpgrade|revert\s+\w*Unauthorized|_onlyOwner\(|auth\(|LibDiamond\.enforceIsContractOwner|enforceIsContractOwner\s*\(/.test(fn.body);
}

function isExternallyCallable(fn) {
  return /\b(public|external)\b/.test(fn.header) && !/\b(view|pure)\b/.test(fn.header);
}

/** Check one Solidity source. Returns findings { rule, severity, title, line, snippet, message }. */
export function checkSolidity(source, file = "") {
  const findings = [];
  const code = stripComments(source);
  const codeNoStrings = stripComments(source, { strings: true });
  const add = (id, index, message) => {
    const r = BY_ID[id];
    const line = lineAt(source, index);
    if (findings.some((f) => f.rule === id && f.line === line)) return;
    findings.push({ tool: "quick-checks", rule: id, severity: r.severity, title: r.title, file, line, snippet: lineText(source, line), message: message || r.summary });
  };

  // Pragmas.
  for (const m of codeNoStrings.matchAll(/pragma\s+solidity\s+([^;]+);/g)) {
    const spec = m[1].trim();
    const ver = spec.match(/(\d+)\.(\d+)\.(\d+)/);
    if (ver && (Number(ver[1]) === 0 && Number(ver[2]) < 8)) add("sol-old-compiler", m.index, `Compiler ${spec}: arithmetic wraps silently before 0.8.`);
    if (/[\^>~]|\s<|\|\|/.test(spec)) add("sol-floating-pragma", m.index, `\`pragma solidity ${spec}\` floats; pin the exact version you tested.`);
  }

  for (const m of codeNoStrings.matchAll(/\btx\.origin\b/g)) {
    const around = codeNoStrings.slice(Math.max(0, m.index - 60), m.index + 60);
    if (/==|!=|require\s*\(|if\s*\(|onlyOwner|auth/.test(around)) add("sol-tx-origin-auth", m.index);
  }

  const state = stateVariables(codeNoStrings);
  for (const fn of solidityFunctions(codeNoStrings)) {
    const bodyStart = fn.start + 1;
    const body = fn.body;
    // Reentrancy: an external value call followed by a write to a state variable.
    const call = body.match(/\.call\s*\{[^}]*value\s*:|\.call\.value\s*\(|\.(send|transfer)\s*\(/);
    if (call) {
      const after = body.slice(call.index);
      for (const v of state) {
        const w = after.match(new RegExp(`\\b${v}\\b(\\s*\\[[^\\]]*\\])*\\s*(=(?!=)|\\+=|-=|\\*=|\\/=|\\+\\+|--)|delete\\s+${v}\\b`));
        if (w) {
          add("sol-reentrancy", bodyStart + call.index + after.indexOf(w[0]), `\`${fn.name || "function"}\` writes \`${v}\` after an external call. Update state first (checks-effects-interactions) or use a reentrancy guard.`);
          break;
        }
      }
    }
    // delegatecall to a parameter.
    const params = (fn.params.match(/\baddress(?:\s+payable)?\s+(?:memory\s+|calldata\s+)?([A-Za-z_]\w*)/g) || []).map((p) => p.split(/\s+/).pop());
    for (const dm of body.matchAll(/([A-Za-z_][\w.]*)\s*\.\s*delegatecall\s*\(/g)) {
      if (params.includes(dm[1].split(".")[0])) add("sol-delegatecall-input", bodyStart + dm.index, `\`${fn.name}\` delegatecalls \`${dm[1]}\`, which the caller passes in.`);
    }
    // Unprotected initializer.
    if (/^initiali[sz]e/i.test(fn.name) && /\b(public|external)\b/.test(fn.header) && !hasAccessCheck(fn) && !/\binitialized\b|\b_initialized\b|\brequire\s*\(\s*!\s*\w*[Ii]nitiali[sz]ed/.test(body)) {
      add("sol-unprotected-initializer", fn.at, `\`${fn.name}\` can be called by anyone (no \`initializer\` modifier, guard or sender check).`);
    }
    // Privileged function without access control.
    if (fn.name && PRIVILEGED.test(fn.name) && isExternallyCallable(fn) && !hasAccessCheck(fn) && !/^initiali/i.test(fn.name)) {
      const withdrawsOwn = /^withdraw/i.test(fn.name) && /\bmsg\.sender\b/.test(body) && /\[\s*msg\.sender\s*\]/.test(body);
      if (!withdrawsOwn) add("sol-missing-access-control", fn.at, `\`${fn.name}\` is ${/\bexternal\b/.test(fn.header) ? "external" : "public"} with no modifier or sender check.`);
    }
  }

  // Low-level calls whose result is dropped.
  for (const m of codeNoStrings.matchAll(/(^|[;{}\n])\s*((?:payable\s*\()?[A-Za-z_][\w.()[\]]*\)?)\s*\.\s*(call|delegatecall|staticcall|send)\s*(\{[^}]*\})?\s*\(/g)) {
    const stmtStart = m.index + m[1].length;
    const before = codeNoStrings.slice(Math.max(0, stmtStart - 40), stmtStart);
    if (/(=|return|require\s*\(|assert\s*\(|if\s*\(|\()\s*$/.test(before)) continue;
    add("sol-unchecked-call", m.index + m[0].indexOf(m[2]), `The result of \`.${m[3]}\` is ignored.`);
  }
  for (const m of codeNoStrings.matchAll(/(^|[;{}\n])\s*(IERC20\w*\s*\([^)]*\)|\w*(?:Token|token|ERC20|erc20|asset|Asset|usdc|USDC|weth|WETH|dai|DAI))\s*\.\s*(transfer|transferFrom)\s*\(/g)) {
    add("sol-unchecked-erc20", m.index + m[0].indexOf(m[2]), `\`${m[2].trim()}.${m[3]}\` ignores the returned bool; use SafeERC20.`);
  }

  // Randomness from block values.
  for (const m of codeNoStrings.matchAll(/keccak256\s*\(\s*abi\.encode(?:Packed)?\s*\(([^;]*?)\)\s*\)/g)) {
    if (/block\.(timestamp|number|prevrandao|difficulty|coinbase)|blockhash\s*\(|\bnow\b/.test(m[1])) add("sol-weak-randomness", m.index);
  }
  for (const m of codeNoStrings.matchAll(/(block\.(timestamp|prevrandao|difficulty)|blockhash\s*\([^)]*\))\s*%/g)) add("sol-weak-randomness", m.index);

  for (const m of codeNoStrings.matchAll(/\b(selfdestruct|suicide)\s*\(/g)) add("sol-selfdestruct", m.index);

  // ecrecover without a zero-address check.
  for (const m of codeNoStrings.matchAll(/\becrecover\s*\(/g)) {
    const tail = codeNoStrings.slice(m.index, m.index + 400);
    if (!/!=\s*address\s*\(\s*0\s*\)|address\s*\(\s*0\s*\)\s*!=|==\s*address\s*\(\s*0\s*\)|ECDSA\./.test(tail)) add("sol-ecrecover-zero", m.index);
  }
  for (const m of codeNoStrings.matchAll(/\.getReserves\s*\(/g)) add("sol-spot-price", m.index);
  for (const m of codeNoStrings.matchAll(/\bunchecked\s*\{/g)) add("sol-unchecked-block", m.index);
  findings.push(...checkSecrets(source, file));
  return dedupe(findings);
}

/** Private keys and keypairs in any text file. */
export function checkSecrets(source, file = "") {
  const out = [];
  const lines = source.split("\n");
  lines.forEach((text, i) => {
    const hex = text.match(/(private[_ -]?key|priv[_-]?key|secret|mnemonic|deployer[_-]?key|PK)\W{0,12}["'`=:\s]+\s*(0x)?([0-9a-fA-F]{64})\b/i);
    if (hex && !/^0+$/.test(hex[3]) && !/(example|placeholder|dummy|test|anvil)/i.test(text)) {
      out.push({ tool: "quick-checks", rule: "any-private-key", severity: "high", title: BY_ID["any-private-key"].title, file, line: i + 1, snippet: text.trim().replace(/[0-9a-fA-F]{64}/, (h) => `${h.slice(0, 6)}…${h.slice(-4)}`).slice(0, 160), message: "A private key is in the source. Move it to an environment variable or a hardware wallet, and treat this key as leaked." });
    }
  });
  const kp = source.match(/\[\s*(\d{1,3}\s*,\s*){63}\d{1,3}\s*\]/);
  if (kp && kp[0].split(",").every((n) => Number(n.replace(/\D/g, "")) <= 255)) {
    out.push({ tool: "quick-checks", rule: "any-private-key", severity: "high", title: BY_ID["any-private-key"].title, file, line: lineAt(source, kp.index), snippet: "[64-byte keypair array]", message: "A Solana keypair (64 bytes) is in the source. Load it from a file outside the repo, and treat it as leaked." });
  }
  return out;
}

/** Check one Anchor / Solana Rust source. */
export function checkAnchor(source, file = "") {
  const findings = [];
  const code = stripComments(source, { keepDocComments: true });
  const add = (id, index, message) => {
    const r = BY_ID[id];
    const line = lineAt(source, index);
    if (findings.some((f) => f.rule === id && f.line === line)) return;
    findings.push({ tool: "quick-checks", rule: id, severity: r.severity, title: r.title, file, line, snippet: lineText(source, line), message: message || r.summary });
  };
  // Account structs: fields of AccountInfo / UncheckedAccount.
  for (const st of code.matchAll(/#\[derive\([^)]*Accounts[^)]*\)\][\s\S]*?struct\s+(\w+)[^{]*\{/g)) {
    const open = st.index + st[0].length - 1;
    const end = blockEnd(code, open);
    const body = code.slice(open + 1, end);
    const fieldRe = /((?:\s*(?:\/\/\/[^\n]*|#\[[^\]]*(?:\][^\]]*)*\]))*)\s*pub\s+(\w+)\s*:\s*([^,\n]+),?/g;
    for (const f of body.matchAll(fieldRe)) {
      const attrs = f[1] || "", name = f[2], type = f[3];
      const at = open + 1 + f.index + f[0].indexOf(`pub ${name}`);
      const unchecked = /\b(AccountInfo|UncheckedAccount)\s*</.test(type);
      if (unchecked && !/\/\/\/\s*CHECK\s*:/.test(attrs)) add("anchor-unchecked-account", at, `\`${name}: ${type.trim()}\` has no \`/// CHECK:\` explaining why it's safe.`);
      if (/^(authority|admin|owner|payer|signer|user|creator|manager|governance|upgrade_authority)$/.test(name) && unchecked && !/\bsigner\b/.test(attrs)) {
        add("anchor-missing-signer", at, `\`${name}\` is \`${type.trim()}\`, not \`Signer<'info>\`: anyone can pass this account without its key.`);
      }
      if (/\binit_if_needed\b/.test(attrs)) add("anchor-init-if-needed", at, `\`${name}\` uses \`init_if_needed\`; check that an existing account can't be reset or reused.`);
    }
  }
  // CPI with a caller-provided program.
  for (const m of code.matchAll(/\b(invoke|invoke_signed)\s*\(/g)) {
    const window = code.slice(Math.max(0, m.index - 600), m.index + 400);
    const checked = /Program\s*<\s*'info\s*,|program_id\s*==|\.key\s*\(\s*\)\s*==\s*&?\w*(::)?ID|require_keys_eq!|token::ID|system_program::ID|spl_token::id\(\)|::id\(\)\s*==|address\s*=\s*\w+::ID/.test(window);
    if (!checked) add("anchor-arbitrary-cpi", m.index, `\`${m[1]}\` without a check that the target program is the one you expect.`);
  }
  for (const m of code.matchAll(/\btry_from_slice\s*\(/g)) {
    const window = code.slice(Math.max(0, m.index - 500), m.index + 200);
    if (!/\.owner\s*(==|!=)|owner\s*=\s*|Account\s*<\s*'info|require_keys_eq!\s*\([^)]*owner/.test(window)) add("anchor-owner-check", m.index);
  }
  for (const m of code.matchAll(/\*\*\s*[\w.()&]+?\.(?:try_borrow_mut_lamports|lamports\.borrow_mut)\s*\(\s*\)\s*\??\s*=\s*0\b/g)) add("anchor-manual-close", m.index);
  for (const m of code.matchAll(/\b(amount|balance|total|supply|lamports|deposit|shares|reward)\w*\s*(\+=|-=|\*=)/g)) add("anchor-unchecked-math", m.index, `\`${m[0].trim()}\`: use \`checked_${m[2] === "+=" ? "add" : m[2] === "-=" ? "sub" : "mul"}\` and return an error on overflow.`);
  findings.push(...checkSecrets(source, file));
  return dedupe(findings);
}

/** Cargo.toml: overflow checks in release builds. */
export function checkCargoToml(source, file = "Cargo.toml") {
  const isWorkspaceOrProgram = /\[workspace\]|anchor-lang|solana-program/.test(source);
  if (!isWorkspaceOrProgram) return [];
  const release = source.match(/\[profile\.release\]([\s\S]*?)(\n\[|$)/);
  if (release && /overflow-checks\s*=\s*true/.test(release[1])) return [];
  if (!/\[workspace\]/.test(source) && /anchor-lang|solana-program/.test(source) && !release) return []; // member crate: the workspace sets it
  const r = BY_ID["rust-overflow-checks-off"];
  const index = release ? release.index : 0;
  return [{ tool: "quick-checks", rule: r.id, severity: r.severity, title: r.title, file, line: lineAt(source, index), snippet: release ? "[profile.release]" : "", message: "Add `overflow-checks = true` under `[profile.release]` so arithmetic overflow panics instead of wrapping." }];
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((f) => {
    const k = `${f.rule}:${f.file}:${f.line}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => a.line - b.line);
}

/** Pick the checker by file name or language. */
export function checkSource(source, file = "", lang = "") {
  const l = lang || (/\.sol$/i.test(file) ? "solidity" : /Cargo\.toml$/i.test(file) ? "cargo" : /\.rs$/i.test(file) ? "anchor" : "");
  if (l === "solidity") return checkSolidity(source, file);
  if (l === "anchor") return checkAnchor(source, file);
  if (l === "cargo") return checkCargoToml(source, file);
  return checkSecrets(source, file);
}

export function guessLanguage(source) {
  if (/\bpragma\s+solidity\b|\bcontract\s+\w+|\bfunction\s+\w+\s*\([^)]*\)\s*(public|external)/.test(source)) return "solidity";
  if (/\buse\s+anchor_lang|#\[program\]|#\[derive\([^)]*Accounts|\bfn\s+\w+\s*\(\s*ctx\s*:\s*Context/.test(source)) return "anchor";
  if (/\[package\]|\[workspace\]|\[profile\./.test(source)) return "cargo";
  return "";
}
