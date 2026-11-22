// Self-test for the in-browser checker (?selftest=1): loads each sample and checks the findings shown.
(async function () {
  "use strict";
  var errors = [];
  window.addEventListener("error", function (e) { errors.push(String(e.message || e)); });
  var lines = [], failed = 0;
  function check(ok, what) { lines.push((ok ? "ok   " : "FAIL ") + what); if (!ok) failed++; }
  function shown() { return Array.prototype.map.call(document.querySelectorAll("#results .finding"), function (el) { return el.getAttribute("data-rule"); }); }
  var CP = window.ChainPreflight;
  try {
    await CP.loadSample("VulnerableVault.sol");
    var a = shown();
    ["sol-reentrancy", "sol-tx-origin-auth", "sol-unprotected-initializer", "sol-missing-access-control", "sol-unchecked-call", "sol-delegatecall-input", "sol-weak-randomness"].forEach(function (id) {
      check(a.indexOf(id) >= 0, "vulnerable Solidity sample shows " + id);
    });
    check(/^\d+ high/.test(document.getElementById("summary").textContent), "summary counts findings (" + document.getElementById("summary").textContent + ")");
    var link = document.querySelector('#results .finding a');
    check(!!link && /\/rules\/[a-z0-9-]+\/$/.test(link.getAttribute("href")), "findings link to their rule pages");
    await CP.loadSample("vault-lib.rs");
    var b = shown();
    ["anchor-missing-signer", "anchor-arbitrary-cpi", "anchor-unchecked-account", "anchor-manual-close"].forEach(function (id) {
      check(b.indexOf(id) >= 0, "vulnerable Anchor sample shows " + id);
    });
    check(/Anchor/.test(document.getElementById("summary").textContent), "the language is detected as Anchor");
    await CP.loadSample("SafeVault.sol");
    check(shown().length === 0 && /No findings/.test(document.getElementById("summary").textContent), "the safe vault has no findings");
    var text = "pragma solidity 0.8.28; // ünïcødé ✓\ncontract A {}";
    check(CP.decode(CP.encode(text)) === text, "share links round-trip the code");
    document.getElementById("code").value = "contract X { function kill() external { selfdestruct(payable(msg.sender)); } }";
    CP.run();
    check(shown().indexOf("sol-selfdestruct") >= 0, "pasted code is checked on demand");
  } catch (e) {
    check(false, "threw: " + (e && e.stack || e));
  }
  check(document.documentElement.scrollWidth <= window.innerWidth + 1, "no horizontal scroll at " + window.innerWidth + "px");
  check(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  var pre = document.createElement("pre");
  pre.id = "selftest";
  pre.textContent = lines.join("\n");
  document.body.appendChild(pre);
  document.body.setAttribute("data-selftest", failed ? "fail" : "pass");
})();
