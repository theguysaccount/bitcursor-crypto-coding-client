// Browser tests in headless Chrome over the DevTools protocol (no dependencies).
//   node tests/e2e/run.mjs                      build output in dist/, served locally
//   node tests/e2e/run.mjs https://host/path    the live site
//   node tests/e2e/run.mjs --screens            also save screenshots to docs/screens/
// Runs: the in-browser checker's self-test at desktop and phone widths, and a pass over every sitemap page at both widths (page errors, failed requests, horizontal
// scroll). Exits 1 on any failure.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const SCREENS = args.includes("--screens");
const target = args.find((a) => /^https?:\/\//.test(a));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const PHONE_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const SIZES = { desktop: { width: 1280, height: 900, mobile: false }, phone: { width: 390, height: 844, mobile: true } };

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const c of ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    if (c.startsWith("/")) {
      if (fs.existsSync(c)) return c;
    } else {
      try {
        return execSync(`command -v ${c}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
      } catch { /* try the next */ }
    }
  }
  throw new Error("Chrome not found: set CHROME");
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".txt": "text/plain", ".xml": "application/xml", ".md": "text/markdown" };

function serve(dir, basePath) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (!p.startsWith(basePath)) {
        res.writeHead(404);
        return res.end("not found");
      }
      p = p.slice(basePath.length) || "/";
      let file = path.join(dir, p);
      if (!file.startsWith(dir)) {
        res.writeHead(403);
        return res.end();
      }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
      if (!fs.existsSync(file)) {
        res.writeHead(404, { "Content-Type": "text/html" });
        return res.end(fs.readFileSync(path.join(dir, "404.html")));
      }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      res.end(fs.readFileSync(file));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "preflight-e2e-"));
  const chrome = spawn(findChrome(), [...(process.env.CI ? ["--no-sandbox"] : []), "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = "";
    chrome.stderr.on("data", (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) resolve(m[1]);
    });
    chrome.on("exit", () => reject(new Error(`Chrome exited: ${buf.slice(-400)}`)));
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let seq = 0;
  const waiting = new Map();
  const listeners = new Set();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) {
      const { resolve, reject } = waiting.get(m.id);
      waiting.delete(m.id);
      if (m.error) reject(new Error(m.error.message));
      else resolve(m.result);
    } else for (const l of listeners) l(m);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const close = async () => {
    ws.close();
    const exited = new Promise((r) => chrome.once("exit", r));
    chrome.kill();
    await exited;
    // Chrome's helper processes can still be writing for a moment after it exits (seen on Linux).
    for (let i = 0; i < 5; i++) {
      try {
        fs.rmSync(profile, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  };
  return { send, listeners, close };
}

async function openPage(browser, url, size, { waitFor = null, timeout = 150000, screenshot = null, before = null } = {}) {
  const { send, listeners } = browser;
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const problems = [];
  const onEvent = (m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === "Runtime.exceptionThrown") problems.push(`exception: ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") problems.push(`console.error: ${m.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") problems.push(`${m.params.entry.source}: ${m.params.entry.text} ${m.params.entry.url || ""}`.trim());
  };
  listeners.add(onEvent);
  try {
    await send("Page.enable", {}, sessionId);
    await send("Runtime.enable", {}, sessionId);
    await send("Log.enable", {}, sessionId);
    const s = SIZES[size];
    await send("Emulation.setDeviceMetricsOverride", { width: s.width, height: s.height, deviceScaleFactor: 1, mobile: s.mobile }, sessionId);
    if (s.mobile) await send("Emulation.setUserAgentOverride", { userAgent: PHONE_UA }, sessionId);
    const loaded = new Promise((resolve) => {
      const l = (m) => {
        if (m.sessionId === sessionId && m.method === "Page.loadEventFired") {
          listeners.delete(l);
          resolve();
        }
      };
      listeners.add(l);
    });
    await send("Page.navigate", { url }, sessionId);
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 30000))]);
    const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId)).result.value;
    if (before) await evaluate(before);
    let status = null, report = "";
    if (waitFor) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        try {
          status = await evaluate(waitFor);
        } catch {
          status = null; // the page is navigating
        }
        if (status) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      report = await evaluate("(document.getElementById('selftest') || {}).textContent || ''");
    } else {
      await new Promise((r) => setTimeout(r, 700));
    }
    const width = await evaluate("document.documentElement.scrollWidth");
    const title = await evaluate("document.title");
    if (screenshot) {
      const { data } = await send("Page.captureScreenshot", { format: "png" }, sessionId);
      fs.mkdirSync(path.dirname(screenshot), { recursive: true });
      fs.writeFileSync(screenshot, Buffer.from(data, "base64"));
    }
    return { status, report, width, title, problems, viewport: s.width };
  } finally {
    listeners.delete(onEvent);
    await send("Target.closeTarget", { targetId }).catch(() => {});
  }
}

async function main() {
  let base = target ? target.replace(/\/$/, "") : null;
  let server = null;
  if (!base) {
    const basePath = new URL(process.env.SITE_URL || pkg.homepage).pathname.replace(/\/$/, "");
    server = await serve(path.join(ROOT, "_site"), basePath);
    base = `http://127.0.0.1:${server.address().port}${basePath}`;
  }
  const browser = await launch();
  let failed = 0;
  const say = (ok, msg) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
    if (!ok) failed++;
  };
  const shots = path.join(ROOT, "docs", "screens");
  try {
    for (const size of ["desktop", "phone"]) {
      const r = await openPage(browser, `${base}/check/?selftest=1`, size, { waitFor: "document.body.getAttribute('data-selftest')", timeout: 60000 });
      say(r.status === "pass", `checker self-test (${size}): ${r.status || "no result"}`);
      if (r.status !== "pass" || process.env.VERBOSE) console.log(r.report.replace(/^/gm, "     "));
      say(!r.problems.length, `checker page errors (${size})${r.problems.length ? `: ${r.problems.join(" | ")}` : ""}`);
    }

    // Every page in the sitemap, relative to the site's home URL (the first entry).
    const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    say(locs.length >= 5, `sitemap lists ${locs.length} pages`);
    const home = locs.find((u) => u.endsWith("/") && !locs.some((o) => o !== u && u.startsWith(o))) || locs[0];
    const paths = locs.map((u) => (u.startsWith(home) ? `/${u.slice(home.length)}` : new URL(u).pathname));
    for (const p of paths) {
      for (const size of ["desktop", "phone"]) {
        const name = p === "/" ? "home" : p.replace(/^\/|\/$/g, "").replace(/\//g, "-");
        const shot = SCREENS && ["home", "check", "rules", "rules-sol-reentrancy", "docs-claude-code"].includes(name) ? path.join(shots, `${name}-${size}.png`) : null;
        const r = await openPage(browser, `${base}${p}`, size, { screenshot: shot });
        const okWidth = r.width <= r.viewport + 1;
        say(okWidth && !r.problems.length && r.title, `${p} (${size})${okWidth ? "" : `: ${r.width}px wide in a ${r.viewport}px viewport`}${r.problems.length ? `: ${r.problems.join(" | ")}` : ""}`);
      }
    }
  } finally {
    await browser.close();
    if (server) server.close();
  }
  console.log(failed ? `\n${failed} check(s) failed` : "\nall browser checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
