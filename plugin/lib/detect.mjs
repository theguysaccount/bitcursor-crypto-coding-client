// Recognises shell commands that deploy contracts or programs, and which network they target.
//   Foundry:  forge script … --broadcast, forge create, cast send --create
//   Hardhat:  hardhat run|deploy|ignition deploy --network X (and npx/pnpm/yarn/bunx hardhat …)
//   Truffle:  truffle migrate|deploy --network X
//   Anchor:   anchor deploy|upgrade, anchor idl init|upgrade|…  (cluster from --provider.cluster or Anchor.toml)
//   Solana:   solana program deploy|write-buffer|upgrade|set-upgrade-authority|extend (cluster from -u/--url or the CLI config)
//   Scripts:  npm/pnpm/yarn/bun run X, make X  -> the script's own command is checked
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Cheap pre-filter: most shell commands contain none of these words. */
export const MAYBE_DEPLOY = /\b(forge|cast|hardhat|truffle|anchor|solana|deploy|migrate|broadcast|ignition|npm|pnpm|yarn|bun|make)\b/;

const LOCAL = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|hardhat|anvil|local|localnet|ganache|development|l)$|^(https?|wss?):\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|host\.docker\.internal)(:\d+)?(\/|$)/i;
const TESTNET = /sepolia|holesky|hoodi|goerli|ropsten|rinkeby|kovan|testnet|amoy|mumbai|fuji|chiado|alfajores|devnet|staging|^d$|^t$/i;
const MAINNET = /mainnet|ethereum|^eth$|^base$|base-?rpc|arbitrum|^arb(1|itrum)?$|optimism|^op$|polygon|^matic$|\bbsc\b|^bnb$|binance|avalanche|^avax$|gnosis|linea|scroll|zksync|blast|mantle|celo|fantom|^ftm$|moonbeam|^zora$|^m$/i;

export function classifyNetwork(value) {
  if (value === undefined || value === null || value === "") return "unknown";
  const v = String(value).trim().replace(/^["']|["']$/g, "");
  if (/^\$\{?\w+\}?$/.test(v)) return "unknown"; // an environment variable we can't see
  if (LOCAL.test(v)) return "local";
  if (TESTNET.test(v)) return "testnet";
  if (MAINNET.test(v)) return "mainnet";
  return "unknown";
}

/** Split a shell line into simple commands (on && || ; | and newlines), as word lists. */
export function splitCommands(line) {
  const parts = [];
  let cur = [], word = "", quote = "";
  const push = () => {
    if (word) cur.push(word);
    word = "";
  };
  const end = () => {
    push();
    if (cur.length) parts.push(cur);
    cur = [];
  };
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = "";
      else if (c === "\\" && quote === '"' && i + 1 < line.length) word += line[++i];
      else word += c;
      continue;
    }
    if (c === "'" || c === '"') quote = c;
    else if (c === "\\" && line[i + 1] === "\n") i++;
    else if (/\s/.test(c)) {
      if (c === "\n") end();
      else push();
    } else if (c === ";" || c === "|" || c === "&") {
      if ((c === "|" || c === "&") && line[i + 1] === c) i++;
      end();
    } else word += c;
  }
  end();
  return parts;
}

const RUNNERS = new Set(["npx", "bunx", "pnpx", "dlx"]);

/** Drop env assignments, sudo/time/env, and package-runner prefixes: ["npx", "hardhat", …] -> ["hardhat", …]. */
export function normalize(words) {
  let w = words.slice();
  while (w.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]) || ["sudo", "time", "env", "command", "exec", "nohup"].includes(w[0]))) w.shift();
  if (w.length && RUNNERS.has(w[0])) {
    w.shift();
    while (w.length && w[0].startsWith("-")) w.shift();
  }
  if (w.length >= 2 && ["pnpm", "npm", "yarn", "bun"].includes(w[0]) && ["exec", "x", "dlx"].includes(w[1])) {
    w = w.slice(2);
    while (w.length && w[0].startsWith("-")) w.shift();
  }
  if (w.length >= 2 && (w[0] === "yarn" || w[0] === "pnpm") && w[1] === "hardhat") w = w.slice(1);
  w[0] = w[0] ? path.basename(w[0]) : w[0];
  return w;
}

function flag(words, ...names) {
  for (let i = 0; i < words.length; i++) {
    for (const n of names) {
      if (words[i] === n && i + 1 < words.length) return words[i + 1];
      if (words[i].startsWith(`${n}=`)) return words[i].slice(n.length + 1);
    }
  }
  return undefined;
}
const has = (words, ...names) => words.some((w) => names.includes(w) || names.some((n) => w.startsWith(`${n}=`)));

function findUp(start, names, read) {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    for (const n of names) {
      const p = path.join(dir, n);
      if (read.exists(p)) return { dir, file: p };
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

const defaultReader = {
  exists: (p) => {
    try {
      fs.accessSync(p);
      return true;
    } catch {
      return false;
    }
  },
  read: (p) => {
    try {
      return fs.readFileSync(p, "utf8");
    } catch {
      return "";
    }
  },
  home: () => os.homedir(),
};

function anchorCluster(words, cwd, read) {
  const fromFlag = flag(words, "--provider.cluster");
  if (fromFlag) return { value: fromFlag, network: classifyNetwork(fromFlag) };
  const found = findUp(cwd, ["Anchor.toml"], read);
  if (found) {
    const m = read.read(found.file).match(/\[provider\][^[]*?cluster\s*=\s*["']([^"']+)["']/);
    if (m) return { value: m[1], network: classifyNetwork(m[1]) };
  }
  return { value: "", network: "unknown" };
}

function solanaCluster(words, read) {
  const v = flag(words, "-u", "--url");
  if (v) return { value: v, network: classifyNetwork(v) };
  const cfg = read.read(path.join(read.home(), ".config", "solana", "cli", "config.yml"));
  const m = cfg.match(/json_rpc_url:\s*["']?([^"'\s]+)/);
  if (m) return { value: m[1], network: classifyNetwork(m[1]) };
  return { value: "", network: "unknown" };
}

/** Is this one simple command a deploy? */
function detectOne(raw, cwd, read, depth) {
  const w = normalize(raw);
  const [cmd, sub, sub2] = w;
  if (!cmd) return null;
  const evm = (tool, networkValue, fallback = "unknown") => ({ deploy: true, chain: "evm", tool, network: networkValue === undefined ? fallback : classifyNetwork(networkValue), target: networkValue || "", command: w.join(" ") });

  if (cmd === "forge" && sub === "script" && has(w, "--broadcast", "--resume")) return evm("forge script", flag(w, "--rpc-url", "--fork-url", "-f"));
  if (cmd === "forge" && sub === "create" && !has(w, "--help", "-h")) return evm("forge create", flag(w, "--rpc-url", "-r"));
  if (cmd === "cast" && sub === "send" && has(w, "--create")) return evm("cast send --create", flag(w, "--rpc-url", "-r"));
  if (cmd === "hardhat") {
    const net = flag(w, "--network");
    if (sub === "run" || sub === "deploy" || (sub === "ignition" && sub2 === "deploy") || sub === "upgrade") {
      return evm(`hardhat ${sub === "ignition" ? "ignition deploy" : sub}`, net, "local"); // no --network: the in-process Hardhat network
    }
  }
  if (cmd === "truffle" && (sub === "migrate" || sub === "deploy")) {
    const net = flag(w, "--network");
    return evm(`truffle ${sub}`, net, "local");
  }
  if (cmd === "anchor" && (sub === "deploy" || sub === "upgrade" || (sub === "idl" && /^(init|upgrade|set-buffer|set-authority|erase-authority|close)$/.test(sub2 || "")))) {
    const c = anchorCluster(w, cwd, read);
    return { deploy: true, chain: "solana", tool: `anchor ${sub}${sub === "idl" ? ` ${sub2}` : ""}`, network: c.network, target: c.value, command: w.join(" ") };
  }
  if (cmd === "solana" && sub === "program" && /^(deploy|write-buffer|upgrade|set-upgrade-authority|extend)$/.test(sub2 || "")) {
    const c = solanaCluster(w, read);
    return { deploy: true, chain: "solana", tool: `solana program ${sub2}`, network: c.network, target: c.value, command: w.join(" ") };
  }
  // A package script or make target: check the command it runs.
  if (depth < 2) {
    let script = null;
    if (["npm", "pnpm", "yarn", "bun"].includes(cmd)) {
      const name = sub === "run" || sub === "run-script" ? sub2 : cmd !== "npm" && sub && !["install", "add", "i", "test", "build", "exec", "x", "dlx", "remove", "ci"].includes(sub) ? sub : null;
      if (name) {
        const pkg = findUp(cwd, ["package.json"], read);
        if (pkg) {
          try {
            script = (JSON.parse(read.read(pkg.file)).scripts || {})[name] || null;
          } catch { /* not JSON */ }
        }
      }
    } else if (cmd === "make" && sub) {
      const mk = findUp(cwd, ["Makefile", "makefile"], read);
      if (mk) {
        const m = read.read(mk.file).match(new RegExp(`^${sub.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:[^\\n]*\\n((?:\\t[^\\n]*\\n?)+)`, "m"));
        if (m) script = m[1].split("\n").map((l) => l.replace(/^\t@?/, "")).join("\n");
      }
    }
    if (script) {
      const inner = detectDeploy(script, { cwd, read, depth: depth + 1 });
      if (inner.deploy) return { ...inner, via: `${cmd} ${sub === "run" ? `run ${sub2}` : sub}` };
    }
  }
  return null;
}

/**
 * @returns {{deploy: false} | {deploy: true, chain: "evm"|"solana", tool: string, network: "local"|"testnet"|"mainnet"|"unknown", target: string, command: string, via?: string}}
 * When a line has several deploys, the riskiest network wins.
 */
export function detectDeploy(line, { cwd = process.cwd(), read = defaultReader, depth = 0 } = {}) {
  if (!line || !MAYBE_DEPLOY.test(line)) return { deploy: false };
  const rank = { local: 0, unknown: 1, testnet: 1, mainnet: 2 };
  let best = null;
  let dir = cwd;
  for (const words of splitCommands(line)) {
    if (words[0] === "cd" && words[1]) {
      dir = path.resolve(dir, words[1].replace(/^~(?=$|\/)/, read.home()));
      continue;
    }
    const hit = detectOne(words, dir, read, depth);
    if (hit && (!best || rank[hit.network] > rank[best.network])) best = { ...hit, cwd: dir };
  }
  return best || { deploy: false };
}

/** The project the deploy belongs to: { root, kind } where kind is foundry, hardhat, truffle, anchor or unknown. */
export function findProject(cwd, read = defaultReader) {
  const markers = [["foundry", ["foundry.toml"]], ["hardhat", ["hardhat.config.ts", "hardhat.config.js", "hardhat.config.cjs", "hardhat.config.mjs"]], ["truffle", ["truffle-config.js", "truffle.js"]], ["anchor", ["Anchor.toml"]]];
  let dir = cwd;
  for (let i = 0; i < 12; i++) {
    for (const [kind, names] of markers) if (names.some((n) => read.exists(path.join(dir, n)))) return { root: dir, kind };
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return { root: cwd, kind: "unknown" };
}

/**
 * Decide what the hook does with a deploy, given its findings.
 *   policy: { highOnMainnet: "deny"|"ask", mainnet: "ask"|"allow", highElsewhere: "ask"|"allow" }
 * Returns { decision: "allow"|"ask"|"deny"|"note", reason }. "note" means: let the normal permission flow
 * continue and tell the agent what was found.
 */
export function decide(detection, counts, policy = {}) {
  const p = { highOnMainnet: "deny", mainnet: "ask", highElsewhere: "ask", ...policy };
  if (!detection.deploy || detection.network === "local") return { decision: "allow", reason: "" };
  const high = counts.high || 0, medium = counts.medium || 0;
  const label = { mainnet: "mainnet", testnet: "a testnet", unknown: "a network Chain Preflight couldn't identify" }[detection.network];
  const where = detection.target && detection.target !== detection.network && detection.network !== "unknown" ? `${label} (${detection.target})` : detection.target && detection.network === "unknown" ? `${label} (${detection.target})` : label;
  const found = high || medium ? `${high} high and ${medium} medium-severity finding${high + medium === 1 ? "" : "s"}` : "no high or medium findings";
  if (detection.network === "mainnet") {
    if (high && p.highOnMainnet === "deny") return { decision: "deny", reason: `Chain Preflight blocked \`${detection.tool}\` to ${where}: ${found}. Fix them, or set "highOnMainnet": "ask" in .chain-preflight.json to decide yourself.` };
    if (p.mainnet === "ask" || high) return { decision: "ask", reason: `\`${detection.tool}\` to ${where}. Chain Preflight found ${found}. Static analysis isn't an audit: get one for any contract that will hold value.` };
    return { decision: "note", reason: `Chain Preflight: ${found} before this mainnet deploy.` };
  }
  if (high && p.highElsewhere === "ask") return { decision: "ask", reason: `\`${detection.tool}\` to ${where}. Chain Preflight found ${found}.` };
  return { decision: "note", reason: `Chain Preflight checked this deploy to ${where}: ${found}.` };
}
