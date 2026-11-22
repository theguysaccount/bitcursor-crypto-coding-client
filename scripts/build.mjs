// Build the website into _site/:
//   node scripts/build.mjs
// Settings (environment): SITE_URL (the site's base URL: the one setting a custom domain changes),
// SPONSOR_URL and GOATCOUNTER_URL (optional keys, off when unset), GITHUB_SHA (for version.json).
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bundle } from "./bundle.mjs";
import { render, frontMatter, escapeHtml } from "./md.mjs";
import { RULES } from "../plugin/lib/rules.js";
import { scan } from "../plugin/lib/scan.mjs";
import { decide } from "../plugin/lib/detect.mjs";
import { DOCS } from "../site/data/rule-docs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const REPO_URL = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
const REPO = REPO_URL.replace("https://github.com/", "");
const DEFAULT_SITE = pkg.homepage.replace(/\/$/, "");

export function siteConfig(env = process.env) {
  const siteUrl = (env.SITE_URL || DEFAULT_SITE).replace(/\/$/, "");
  return { siteUrl, base: new URL(siteUrl).pathname.replace(/\/$/, ""), sponsorUrl: env.SPONSOR_URL || "", goatcounter: env.GOATCOUNTER_URL || "" };
}

const NAV = [["Check code", "/check/"], ["Rules", "/rules/"], ["Docs", "/docs/"], ["Claude Code", "/docs/claude-code/"], ["Cursor", "/docs/cursor/"]];
const SEV_ORDER = { high: 0, medium: 1, low: 2, info: 3 };

function layout(cfg, page) {
  const url = `${cfg.siteUrl}${page.path}`;
  const og = `${cfg.siteUrl}/assets/og/${page.og || "home"}.png`;
  const title = page.path === "/" ? page.title : `${page.title} · Chain Preflight`;
  const nav = NAV.map(([label, href]) => `<a href="${cfg.base}${href}"${page.path === href ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  const analytics = cfg.goatcounter ? `<script data-goatcounter="${escapeHtml(cfg.goatcounter)}" async src="https://gc.zgo.at/count.js"></script>` : "";
  const sponsor = cfg.sponsorUrl ? `<a href="${escapeHtml(cfg.sponsorUrl)}" rel="noopener">Sponsor Chain Preflight</a>` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(page.description)}">
<link rel="canonical" href="${url}">
${page.noindex ? '<meta name="robots" content="noindex">' : ""}
<meta property="og:type" content="${page.path === "/" ? "website" : "article"}">
<meta property="og:site_name" content="Chain Preflight">
<meta property="og:title" content="${escapeHtml(page.title)}">
<meta property="og:description" content="${escapeHtml(page.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0b1f17">
<link rel="icon" href="${cfg.base}/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${cfg.base}/assets/site.css">
${(page.jsonld || []).map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("\n")}
${analytics}
</head>
<body class="${page.bodyClass || ""}">
<a class="skip" href="#main">Skip to content</a>
<header class="site-header"><div class="wrap">
  <a class="logo" href="${cfg.base}/"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2.5l7.5 3v5.6c0 4.6-3.2 8.6-7.5 10.4-4.3-1.8-7.5-5.8-7.5-10.4V5.5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8.5 12.2l2.4 2.4 4.8-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>Chain Preflight</a>
  <nav aria-label="Site">${nav}<a href="${REPO_URL}" rel="noopener">GitHub</a></nav>
</div></header>
<main id="main">
${page.body}
</main>
<footer class="site-footer"><div class="wrap">
  <p><strong>Chain Preflight</strong> is a free, open-source (MIT) safety tool for smart-contract developers. It runs on your machine, isn't an audit, and isn't financial advice. No token, no trading.</p>
  <p class="links"><a href="${cfg.base}/check/">Check code</a><a href="${cfg.base}/rules/">Rules</a><a href="${cfg.base}/docs/">Docs</a><a href="${cfg.base}/docs/limits/">Limits</a><a href="${REPO_URL}" rel="noopener">GitHub</a><a href="${REPO_URL}/issues" rel="noopener">Issues</a>${sponsor}</p>
</div></footer>
${page.scripts || ""}
<script src="${cfg.base}/assets/site.js" defer></script>
</body>
</html>
`;
}

const fill = (t, vars) => t.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));

function docPage(cfg, file, vars) {
  const { data, body } = frontMatter(fill(fs.readFileSync(file, "utf8"), vars));
  const { html, toc } = render(body);
  const tocHtml = toc.length > 2 ? `<nav class="toc" aria-label="On this page"><p>On this page</p><ul>${toc.map((t) => `<li><a href="#${t.id}">${t.text.replace(/`/g, "")}</a></li>`).join("")}</ul></nav>` : "";
  return {
    path: data.path, title: data.title, description: data.description, og: data.og || "docs",
    jsonld: [{ "@context": "https://schema.org", "@type": "TechArticle", headline: data.title, description: data.description, url: `${cfg.siteUrl}${data.path}`, ...(data.updated ? { dateModified: data.updated } : {}) }],
    body: `<div class="wrap doc"><article class="prose">${html}</article>${tocHtml}</div>`,
  };
}

function detectorsTable(r) {
  const names = { slither: "Slither", aderyn: "Aderyn", solhint: "Solhint", swc: "SWC registry", anchor: "Anchor", clippy: "Clippy", sealevel: "Sealevel attacks" };
  const rows = Object.entries(r.detectors || {}).filter(([, v]) => v).map(([k, v]) => `<tr><td>${names[k] || k}</td><td><code>${escapeHtml(v)}</code></td></tr>`).join("");
  return rows ? `<h2 id="other-tools">What other tools call it</h2><div class="table"><table><thead><tr><th>Tool</th><th>Detector or reference</th></tr></thead><tbody>${rows}</tbody></table></div>` : "";
}

function rulePage(cfg, r) {
  const d = DOCS[r.id] || {};
  const lang = r.lang === "anchor" ? "Anchor (Rust)" : r.lang === "solidity" ? "Solidity" : "Any language";
  const codeLang = r.lang === "anchor" ? (r.id.startsWith("rust-") ? "toml" : "rust") : r.lang === "solidity" ? "solidity" : "js";
  const inline = (s) => escapeHtml(s).replace(/`([^`]+)`/g, "<code>$1</code>");
  const related = RULES.filter((x) => x.lang === r.lang && x.id !== r.id).slice(0, 6).map((x) => `<li><a href="${cfg.base}/rules/${x.id}/">${escapeHtml(x.title)}</a></li>`).join("");
  return {
    path: `/rules/${r.id}/`, og: "rules", title: `${r.title} (${lang})`,
    description: `${r.summary.replace(/`/g, "")} What it is, why it's dangerous, a vulnerable example and the fix.`.slice(0, 300),
    jsonld: [{ "@context": "https://schema.org", "@type": "TechArticle", headline: r.title, description: r.summary.replace(/`/g, ""), url: `${cfg.siteUrl}/rules/${r.id}/`, about: lang }],
    body: `<div class="wrap doc"><article class="prose">
      <p><a href="${cfg.base}/rules/">Rules</a> › ${lang}</p>
      <h1>${inline(r.title)}</h1>
      <div class="rule-meta"><span class="sev ${r.severity}">${r.severity}</span><span>${lang}</span><span>Rule <code>${r.id}</code></span></div>
      <p><strong>${inline(r.summary)}</strong></p>
      ${d.why ? `<h2 id="why">Why it matters</h2><p>${inline(d.why)}</p>` : ""}
      ${d.bad ? `<h2 id="vulnerable">Vulnerable</h2><pre class="lang-${codeLang}"><code>${escapeHtml(d.bad)}</code></pre>` : ""}
      ${d.good ? `<h2 id="fixed">Fixed</h2><pre class="lang-${codeLang}"><code>${escapeHtml(d.good)}</code></pre>` : ""}
      ${detectorsTable(r)}
      <h2 id="check">Check your code</h2>
      <p>Paste a contract into the <a href="${cfg.base}/check/">in-browser checker</a>, or let the <a href="${cfg.base}/docs/claude-code/">Claude Code plugin</a> scan before every deploy. The quick check for this rule is a pattern match: treat a hit as "look here", and a miss as no guarantee.</p>
      ${related ? `<h2 id="related">Related rules</h2><ul>${related}</ul>` : ""}
      <div class="disclaimer">Static analysis finds known bug classes; it can't prove code is safe and isn't an audit. Get a professional audit before deploying code that will hold value.</div>
    </article></div>`,
  };
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const a = path.join(from, name), b = path.join(to, name);
    if (fs.statSync(a).isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

function gitSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

export function compatTable(cfg) {
  let data = null;
  try {
    data = JSON.parse(fs.readFileSync(path.join(ROOT, "site", "data", "compat.json"), "utf8"));
  } catch { /* not yet */ }
  if (!data || !data.analyzers || !Object.keys(data.analyzers).length) return "<p>The weekly compatibility check hasn't recorded results yet.</p>";
  const rows = Object.entries(data.analyzers).map(([tool, a]) => `<tr><td>${escapeHtml(tool)}</td><td>${escapeHtml(a.version || "–")}</td><td>${a.status === "ok" ? (a.pass ? "detects the sample bugs" : "ran, but missed expected bugs") : escapeHtml(a.status)}</td><td>${escapeHtml((a.found || []).slice(0, 8).join(", "))}</td></tr>`).join("");
  return `<div class="table"><table><thead><tr><th>Analyzer</th><th>Version</th><th>Result on the vulnerable samples</th><th>Detectors that fired</th></tr></thead><tbody>${rows}</tbody></table></div><p class="note">Recorded by the weekly job when versions or results change (last change: ${escapeHtml(String(data.changedOn || "").slice(0, 10))}).</p>`;
}

/** The hook's real answer for a mainnet deploy of the vulnerable sample (quick checks only). */
export async function heroExample() {
  const result = await scan(path.join(ROOT, "samples", "evm"), { analyzers: false });
  const command = "forge script script/Deploy.s.sol --rpc-url mainnet --broadcast";
  const verdict = decide({ deploy: true, chain: "evm", tool: "forge script", network: "mainnet", target: "mainnet" }, result.counts);
  const top = result.findings.filter((f) => f.severity === "high").slice(0, 4).map((f) => `- [high] ${f.title}\n    ${f.file}:${f.line}`).join("\n");
  return `$ ${command}\n\n${verdict.reason.replace(/\. Fix them/, ".\n\nFix them")}\n\n${top}\n…\nFull report: .chain-preflight/latest.md`;
}

export async function buildSite({ env = process.env, out = path.join(ROOT, "_site") } = {}) {
  const cfg = siteConfig(env);
  fs.rmSync(out, { recursive: true, force: true });
  copyDir(path.join(ROOT, "site", "static"), out);
  // The checker's code, and the samples it can load.
  fs.mkdirSync(path.join(out, "assets"), { recursive: true });
  fs.writeFileSync(path.join(out, "assets", "checker.js"), bundle(path.join(ROOT, "site", "checker", "main.js"), {
    banner: `/*! Chain Preflight checker v${pkg.version} · MIT · ${REPO_URL} */\n`, root: ROOT, define: { __VERSION__: pkg.version, __BASE__: cfg.base },
  }));
  fs.mkdirSync(path.join(out, "samples"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "samples", "evm", "src", "VulnerableVault.sol"), path.join(out, "samples", "VulnerableVault.sol"));
  fs.copyFileSync(path.join(ROOT, "samples", "evm-clean", "src", "SafeVault.sol"), path.join(out, "samples", "SafeVault.sol"));
  fs.copyFileSync(path.join(ROOT, "samples", "anchor", "programs", "vault", "src", "lib.rs"), path.join(out, "samples", "vault-lib.rs"));

  const sorted = RULES.slice().sort((a, b) => (a.lang === b.lang ? SEV_ORDER[a.severity] - SEV_ORDER[b.severity] : a.lang.localeCompare(b.lang)));
  const ruleItem = (r) => `<li><span class="sev ${r.severity}">${r.severity}</span> <a href="${cfg.base}/rules/${r.id}/">${escapeHtml(r.title)}</a><p>${escapeHtml(r.summary.replace(/`/g, ""))}</p></li>`;
  const vars = {
    base: cfg.base, site: cfg.siteUrl, repo: REPO_URL, repoSlug: REPO, version: pkg.version,
    ruleCount: String(RULES.length), compat: compatTable(cfg), hero: escapeHtml(await heroExample()),
    solRules: sorted.filter((r) => r.lang === "solidity").map(ruleItem).join(""),
    anchorRules: sorted.filter((r) => r.lang === "anchor").map(ruleItem).join(""),
    anyRules: sorted.filter((r) => r.lang === "any").map(ruleItem).join(""),
  };
  const tpl = (n) => fs.readFileSync(path.join(ROOT, "site", "templates", n), "utf8");
  const pages = [{
    path: "/", og: "home", title: "Chain Preflight: smart-contract safety checks your coding agent runs before every deploy",
    description: "Free, open-source Claude Code and Cursor plugin with Solidity and Anchor security rules and a pre-deploy hook that scans contracts with Slither, Solhint and cargo-audit. Plus a CLI, a GitHub Action and an in-browser checker.",
    body: fill(tpl("home.html"), vars),
    jsonld: [{ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Chain Preflight", applicationCategory: "DeveloperApplication", operatingSystem: "macOS, Linux, Windows (Node.js 18+)",
      url: `${cfg.siteUrl}/`, softwareVersion: pkg.version, license: "https://opensource.org/licenses/MIT", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description: "Pre-deploy smart-contract security checks and Solidity/Anchor coding rules for AI coding agents." }],
  }, {
    path: "/check/", og: "check", bodyClass: "check",
    title: "Check a Solidity or Anchor contract in your browser",
    description: "Paste a Solidity contract or an Anchor program and get instant security findings: reentrancy, tx.origin, unchecked calls, access control, missing signers, arbitrary CPI and more. Runs in your browser; nothing is uploaded.",
    body: fill(tpl("check.html"), vars),
    scripts: `<script src="${cfg.base}/assets/checker.js" defer></script>`,
  }, {
    path: "/rules/", og: "rules", title: `${RULES.length} smart-contract security rules for Solidity and Anchor`,
    description: "Every check Chain Preflight runs, with why it matters, a vulnerable example, the fix, and the matching Slither, Aderyn, Solhint and Sealevel references.",
    body: fill(tpl("rules.html"), vars),
  }];
  for (const r of RULES) pages.push(rulePage(cfg, r));
  const contentDir = path.join(ROOT, "site", "content");
  for (const n of fs.readdirSync(contentDir).filter((n) => n.endsWith(".md")).sort()) pages.push(docPage(cfg, path.join(contentDir, n), vars));

  for (const page of pages) {
    const dir = path.join(out, page.path);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), layout(cfg, page));
  }
  fs.writeFileSync(path.join(out, "404.html"), layout(cfg, { path: "/404.html", title: "Page not found", description: "This page doesn't exist.", noindex: true,
    body: `<div class="wrap doc"><article class="prose"><h1>Page not found</h1><p>Try the <a href="${cfg.base}/">home page</a>, the <a href="${cfg.base}/check/">checker</a> or the <a href="${cfg.base}/rules/">rules</a>.</p></article></div>` }));
  const urls = pages.map((p) => `${cfg.siteUrl}${p.path}`);
  fs.writeFileSync(path.join(out, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`);
  fs.writeFileSync(path.join(out, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${cfg.siteUrl}/sitemap.xml\n`);
  fs.writeFileSync(path.join(out, "urls.txt"), `${urls.join("\n")}\n`);
  const key = fs.readFileSync(path.join(ROOT, "site", "indexnow-key.txt"), "utf8").trim();
  fs.writeFileSync(path.join(out, `${key}.txt`), key);
  fs.writeFileSync(path.join(out, "rules.json"), `${JSON.stringify(RULES, null, 2)}\n`);
  fs.writeFileSync(path.join(out, "version.json"), `${JSON.stringify({ name: "chain-preflight", version: pkg.version, rules: RULES.length, commit: gitSha(), builtAt: new Date().toISOString(), siteUrl: cfg.siteUrl }, null, 2)}\n`);
  console.log(`site: ${pages.length} pages -> _site/ (${cfg.siteUrl})`);
  return { pages, urls, cfg };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildSite();
