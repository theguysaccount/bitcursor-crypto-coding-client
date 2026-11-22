// Render the Open Graph cards (1200x630) and the plugin icon (512x512) with headless Chrome.
//   node scripts/og.mjs
// Output is committed: site/static/assets/og/*.png.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = path.join(ROOT, "site", "static", "assets", "og");
const LOGO = `<svg width="60" height="60" viewBox="0 0 24 24" fill="none"><path d="M12 2.5l7.5 3v5.6c0 4.6-3.2 8.6-7.5 10.4-4.3-1.8-7.5-5.8-7.5-10.4V5.5z" stroke="#34d399" stroke-width="2" stroke-linejoin="round"/><path d="M8.5 12.2l2.4 2.4 4.8-5" stroke="#34d399" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const CARDS = {
  home: ["Your agent writes the contract.", "Preflight checks it first.", "Solidity and Anchor rules + a pre-deploy analyzer hook."],
  check: ["Check a contract", "in your browser.", "Solidity and Anchor quick checks. Nothing uploaded."],
  rules: ["Smart-contract", "security rules.", "Why each bug is dangerous, vulnerable code, the fix."],
  docs: ["Chain Preflight docs", "Claude Code, Cursor, CLI, CI.", "Scan before every deploy."],
  checklist: ["Pre-deploy", "security checklist.", "For you and your coding agent."],
};

function card([a, b, c]) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden}
body{background:#0b1f17;color:#ecfdf5;font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;display:flex;flex-direction:column;justify-content:space-between;padding:64px 76px;box-sizing:border-box;position:relative}
.top{display:flex;align-items:center;gap:16px;font-size:34px;font-weight:750}
h1{font-size:76px;line-height:1.04;letter-spacing:-.025em;margin:0}
h1 span{color:#34d399}
p{font-size:30px;color:#a7d7c5;margin:0}
.ring{position:absolute;right:70px;top:150px;width:290px;height:170px;border:6px solid #10b981;border-radius:50%;transform:rotate(-8deg);opacity:.9}
</style></head><body><div class="ring"></div><div class="top">${LOGO}Chain Preflight</div><div><h1>${esc(a)}<br><span>${esc(b)}</span></h1></div><p>${esc(c)}</p></body></html>`;
}

function shoot(html, out, w, h) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "pointbrief-og-"));
  const page = path.join(work, "card.html");
  fs.writeFileSync(page, html);
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", `--user-data-dir=${path.join(work, "profile")}`,
    `--window-size=${w},${h}`, "--virtual-time-budget=1500", `--screenshot=${out}`, `file://${page}`], { stdio: "ignore" });
  fs.rmSync(work, { recursive: true, force: true });
  console.log("wrote", path.relative(ROOT, out));
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, lines] of Object.entries(CARDS)) shoot(card(lines), path.join(OUT, `${name}.png`), 1200, 630);
