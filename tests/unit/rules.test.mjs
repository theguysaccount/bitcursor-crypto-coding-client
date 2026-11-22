import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkSolidity, checkAnchor, checkCargoToml, checkSecrets, checkSource, guessLanguage, stripComments, stateVariables, solidityFunctions, RULES, rule, SEVERITIES } from "../../plugin/lib/rules.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const ids = (findings) => [...new Set(findings.map((f) => f.rule))].sort();
const lineOf = (src, needle) => src.split("\n").findIndex((l) => l.includes(needle)) + 1;

test("the vulnerable vault trips every Solidity check it was written for, on the right lines", () => {
  const src = read("samples/evm/src/VulnerableVault.sol");
  const f = checkSolidity(src, "src/VulnerableVault.sol");
  for (const id of ["sol-reentrancy", "sol-tx-origin-auth", "sol-unprotected-initializer", "sol-missing-access-control", "sol-unchecked-call", "sol-delegatecall-input", "sol-weak-randomness", "sol-floating-pragma"]) {
    assert.ok(ids(f).includes(id), `missing ${id}; got ${ids(f).join(", ")}`);
  }
  const at = (id) => f.filter((x) => x.rule === id).map((x) => x.line);
  assert.ok(at("sol-reentrancy").includes(lineOf(src, "balances[msg.sender] = 0;")));
  assert.ok(at("sol-tx-origin-auth").includes(lineOf(src, "tx.origin == owner")));
  assert.ok(at("sol-unchecked-call").includes(lineOf(src, "target.call(")));
  assert.ok(at("sol-delegatecall-input").includes(lineOf(src, "impl.delegatecall")));
  assert.ok(at("sol-unprotected-initializer").includes(lineOf(src, "function initialize")));
  assert.ok(at("sol-missing-access-control").includes(lineOf(src, "function setOwner")));
  assert.ok(!f.some((x) => x.rule === "sol-missing-access-control" && x.line === lineOf(src, "function withdraw")), "withdrawing your own balance isn't privileged");
  assert.ok(!f.some((x) => x.rule === "sol-unchecked-call" && x.line === lineOf(src, "msg.sender.call{value")), "a captured result is checked");
  for (const x of f) {
    assert.ok(SEVERITIES.includes(x.severity));
    assert.equal(x.file, "src/VulnerableVault.sol");
    assert.ok(x.snippet.length > 0 && x.message.length > 10);
  }
});

test("the safe vault is clean", () => {
  const f = checkSolidity(read("samples/evm-clean/src/SafeVault.sol"), "SafeVault.sol");
  assert.deepEqual(f.filter((x) => x.severity === "high" || x.severity === "medium"), []);
  assert.deepEqual(ids(f), []);
});

test("comments and strings never trigger checks", () => {
  const src = `pragma solidity 0.8.28;
contract C {
  // require(tx.origin == owner) was removed
  /* selfdestruct(payable(msg.sender)); */
  string constant NOTE = "use tx.origin == x and selfdestruct(";
  function f() external pure returns (uint) { return 1; }
}`;
  assert.deepEqual(checkSolidity(src), []);
});

test("Solidity checks: access control, ERC-20, ecrecover, spot price, old compiler, randomness, unchecked", () => {
  const src = `pragma solidity 0.7.6;
contract T {
  address owner;
  IERC20 token;
  function mint(address to, uint a) external { _mint(to, a); }
  function setFee(uint f) external onlyOwner { fee = f; }
  function pause() external { require(msg.sender == owner); paused = true; }
  function pay(address to) external { token.transfer(to, 1); }
  function pay2(address to) external { require(token.transfer(to, 1)); }
  function who(bytes32 h, uint8 v, bytes32 r, bytes32 s) external pure returns (address) { return ecrecover(h, v, r, s); }
  function price() external view returns (uint) { (uint a, uint b,) = pair.getReserves(); return a / b; }
  function roll() external view returns (uint) { return block.prevrandao % 6; }
  function sum(uint a, uint b) external pure returns (uint) { unchecked { return a + b; } }
  function bye() external { selfdestruct(payable(owner)); }
}`;
  const f = checkSolidity(src);
  const got = ids(f);
  for (const id of ["sol-old-compiler", "sol-missing-access-control", "sol-unchecked-erc20", "sol-ecrecover-zero", "sol-spot-price", "sol-weak-randomness", "sol-unchecked-block", "sol-selfdestruct"]) assert.ok(got.includes(id), `missing ${id}`);
  const access = f.filter((x) => x.rule === "sol-missing-access-control").map((x) => x.line);
  assert.deepEqual(access, [lineOf(src, "function mint")], "only mint lacks a check");
  assert.equal(f.filter((x) => x.rule === "sol-unchecked-erc20").length, 1, "the required transfer is fine");
  assert.ok(!got.includes("sol-floating-pragma"), "an exact version isn't floating");
});

test("helpers: functions, state variables, comment stripping keeps positions", () => {
  const src = "contract A {\n  uint256 public total; // c\n  mapping(address => uint) bal;\n  uint constant X = 1;\n  function f(uint a) public { total = a; }\n}";
  assert.deepEqual([...stateVariables(stripComments(src))].sort(), ["bal", "total"]);
  const fns = solidityFunctions(src);
  assert.equal(fns.length, 1);
  assert.equal(fns[0].name, "f");
  assert.equal(stripComments("a // x\nb").length, "a // x\nb".length);
  assert.equal(stripComments('x = "//y"; // z'), 'x = "//y";     ');
});

test("the vulnerable Anchor program trips every Anchor check it was written for", () => {
  const src = read("samples/anchor/programs/vault/src/lib.rs");
  const f = checkAnchor(src, "programs/vault/src/lib.rs");
  for (const id of ["anchor-unchecked-account", "anchor-missing-signer", "anchor-arbitrary-cpi", "anchor-init-if-needed", "anchor-manual-close", "anchor-unchecked-math"]) {
    assert.ok(ids(f).includes(id), `missing ${id}; got ${ids(f).join(", ")}`);
  }
  const unchecked = f.filter((x) => x.rule === "anchor-unchecked-account").map((x) => x.snippet);
  assert.ok(unchecked.some((s) => s.includes("authority")) && unchecked.some((s) => s.includes("target")));
  assert.ok(!unchecked.some((s) => s.includes("vault_info") || s.includes("receiver")), "fields with /// CHECK: are fine");
  assert.equal(f.find((x) => x.rule === "anchor-manual-close").line, lineOf(src, "try_borrow_mut_lamports()? = 0"));
});

test("a safe Anchor accounts struct is clean", () => {
  const src = `use anchor_lang::prelude::*;
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut, has_one = authority, close = authority)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}
pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    let v = &mut ctx.accounts.vault;
    v.balance = v.balance.checked_sub(amount).ok_or(ErrorCode::Overflow)?;
    Ok(())
}`;
  assert.deepEqual(checkAnchor(src), []);
});

test("Cargo.toml: overflow checks in release builds", () => {
  assert.equal(checkCargoToml(read("samples/anchor/Cargo.toml"))[0].rule, "rust-overflow-checks-off");
  assert.deepEqual(checkCargoToml("[workspace]\nmembers=[]\n[profile.release]\noverflow-checks = true\n"), []);
  assert.deepEqual(checkCargoToml("[package]\nname='x'\n[dependencies]\nserde='1'\n"), [], "not a Solana project");
});

test("private keys and keypairs are caught, placeholders are not", () => {
  const key = "4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318";
  const f = checkSecrets(`const PRIVATE_KEY = "0x${key}";`, "deploy.js");
  assert.equal(f.length, 1);
  assert.ok(!f[0].snippet.includes(key), "the key itself never appears in a report");
  assert.deepEqual(checkSecrets(`PRIVATE_KEY=0x${"0".repeat(64)}`), []);
  assert.deepEqual(checkSecrets(`// anvil test key: PRIVATE_KEY=0x${key}`), []);
  const pair = `[${Array.from({ length: 64 }, (_, i) => (i * 7) % 256).join(",")}]`;
  assert.equal(checkSecrets(`const kp = ${pair};`)[0].rule, "any-private-key");
});

test("language guessing, dispatch and the catalog", () => {
  assert.equal(guessLanguage("pragma solidity 0.8.0; contract A {}"), "solidity");
  assert.equal(guessLanguage("use anchor_lang::prelude::*;\n#[program]\nmod p {}"), "anchor");
  assert.equal(guessLanguage("[workspace]\nmembers=[]"), "cargo");
  assert.equal(guessLanguage("hello"), "");
  assert.ok(checkSource("contract A { function f() external { selfdestruct(payable(msg.sender)); } }", "A.sol").length > 0);
  const seen = new Set();
  for (const r of RULES) {
    assert.ok(!seen.has(r.id), `duplicate ${r.id}`);
    seen.add(r.id);
    assert.ok(SEVERITIES.includes(r.severity) && r.title && r.summary.length > 30, r.id);
    assert.equal(rule(r.id), r);
  }
});
