// The in-browser checker: the same quick checks as the CLI and the pre-deploy hook.
import { checkSource, guessLanguage, rule } from "../../plugin/lib/rules.js";

export const VERSION = "__VERSION__";
const BASE = "__BASE__";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function encode(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decode(s) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function run() {
  const code = $("#code").value;
  const chosen = $("#lang").value;
  const lang = chosen === "auto" ? guessLanguage(code) || "solidity" : chosen;
  const file = lang === "solidity" ? "Contract.sol" : lang === "cargo" ? "Cargo.toml" : "lib.rs";
  const findings = checkSource(code, file, lang);
  const counts = { high: 0, medium: 0, low: 0, info: 0 };
  findings.forEach((f) => counts[f.severity]++);
  $("#summary").textContent = code.trim()
    ? `${findings.length ? `${counts.high} high, ${counts.medium} medium, ${counts.low} low, ${counts.info} info` : "No findings from the quick checks"} (${lang === "anchor" ? "Anchor / Rust" : lang === "cargo" ? "Cargo.toml" : "Solidity"})`
    : "Paste a contract to check it.";
  $("#results").innerHTML = findings.map((f) => {
    const r = rule(f.rule);
    return `<article class="finding" data-rule="${esc(f.rule)}">
      <span class="sev ${f.severity}">${f.severity}</span> <span class="note">line ${f.line}</span>
      <h3><a href="${BASE}/rules/${esc(f.rule)}/">${esc(r ? r.title : f.title)}</a></h3>
      <p>${esc(f.message).replace(/`([^`]+)`/g, "<code>$1</code>")}</p>
      ${f.snippet ? `<code class="snip">${esc(f.snippet)}</code>` : ""}
    </article>`;
  }).join("");
  document.body.dataset.findings = String(findings.length);
  if (window.cpCount) window.cpCount(findings.length ? "check-findings" : "check-clean");
  return findings;
}

async function loadSample(name) {
  const r = await fetch(`${BASE}/samples/${name}`);
  $("#code").value = await r.text();
  $("#lang").value = "auto";
  run();
}

function share() {
  const code = $("#code").value;
  const url = `${location.origin}${location.pathname}#code=${encode(code)}`;
  if (url.length > 7000) {
    $("#share-status").textContent = "Too long to share in a link: download it or paste it instead.";
    return null;
  }
  history.replaceState(null, "", `#code=${encode(code)}`);
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(() => ($("#share-status").textContent = "Link copied. The code is in the link itself; nothing is uploaded."), () => {});
  return url;
}

export function init() {
  $("#check").addEventListener("click", run);
  $("#share").addEventListener("click", share);
  $("#sample-evm").addEventListener("click", () => loadSample("VulnerableVault.sol"));
  $("#sample-anchor").addEventListener("click", () => loadSample("vault-lib.rs"));
  $("#sample-clean").addEventListener("click", () => loadSample("SafeVault.sol"));
  $("#code").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
  });
  const m = location.hash.match(/code=([A-Za-z0-9_-]+)/);
  if (m) {
    try {
      $("#code").value = decode(m[1]);
    } catch { /* a broken link: keep the default */ }
  }
  run();
  window.ChainPreflight = { run, encode, decode, share, loadSample, version: VERSION };
  if (/[?&]selftest=1\b/.test(location.search)) {
    const s = document.createElement("script");
    s.src = `${BASE}/assets/check-selftest.js`;
    document.body.appendChild(s);
  }
}

init();
