import test from "node:test";
import assert from "node:assert/strict";
import { detectDeploy, classifyNetwork, splitCommands, normalize, findProject, decide } from "../../plugin/lib/detect.mjs";

// A fake filesystem for package.json, Makefile, Anchor.toml and the Solana CLI config.
function reader(files = {}, home = "/home/dev") {
  return { exists: (p) => p in files, read: (p) => files[p] || "", home: () => home };
}
const d = (cmd, files, cwd = "/repo") => detectDeploy(cmd, { cwd, read: reader(files) });

test("Foundry deploys and their networks", () => {
  assert.deepEqual(d("forge build").deploy, false);
  assert.deepEqual(d("forge test -vvv").deploy, false);
  assert.equal(d("forge script script/Deploy.s.sol").deploy, false, "a dry run without --broadcast");
  let r = d("forge script script/Deploy.s.sol --rpc-url https://eth-mainnet.g.alchemy.com/v2/$KEY --broadcast --verify");
  assert.equal(r.deploy, true);
  assert.equal(r.tool, "forge script");
  assert.equal(r.network, "mainnet");
  assert.equal(d("forge script s.s.sol --broadcast --rpc-url http://127.0.0.1:8545").network, "local");
  assert.equal(d("forge script s.s.sol --broadcast --rpc-url sepolia").network, "testnet");
  assert.equal(d("forge script s.s.sol --broadcast --rpc-url $RPC_URL").network, "unknown");
  assert.equal(d("forge script s.s.sol --broadcast").network, "unknown");
  assert.equal(d("forge create src/Token.sol:Token --rpc-url https://base-sepolia.g.alchemy.com --broadcast").network, "testnet");
  assert.equal(d("cast send --create 0x6080 --rpc-url https://arb1.arbitrum.io/rpc").network, "mainnet");
  assert.equal(d("cast send 0xabc 'f()' --rpc-url mainnet").deploy, false, "a plain transaction isn't a deploy");
});

test("Hardhat and Truffle, through npx, pnpm and yarn", () => {
  assert.equal(d("npx hardhat compile").deploy, false);
  assert.equal(d("npx hardhat test").deploy, false);
  assert.equal(d("npx hardhat run scripts/deploy.ts").network, "local", "no --network: the in-process network");
  assert.equal(d("npx hardhat run scripts/deploy.ts --network mainnet").network, "mainnet");
  assert.equal(d("pnpm hardhat ignition deploy ignition/modules/Lock.ts --network sepolia").tool, "hardhat ignition deploy");
  assert.equal(d("yarn hardhat deploy --network=polygon").network, "mainnet");
  assert.equal(d("npx hardhat run scripts/deploy.js --network localhost").network, "local");
  assert.equal(d("truffle migrate --network development").network, "local");
  assert.equal(d("npx truffle migrate --network goerli --reset").network, "testnet");
});

test("Anchor and the Solana CLI, with clusters from flags and config files", () => {
  const anchorToml = '[provider]\ncluster = "mainnet"\nwallet = "~/.config/solana/id.json"\n';
  let r = d("anchor deploy", { "/repo/Anchor.toml": anchorToml });
  assert.equal(r.chain, "solana");
  assert.equal(r.network, "mainnet");
  assert.equal(d("anchor deploy --provider.cluster devnet", { "/repo/Anchor.toml": anchorToml }).network, "testnet");
  assert.equal(d("anchor deploy", { "/repo/Anchor.toml": '[provider]\ncluster = "localnet"\n' }).network, "local");
  assert.equal(d("anchor build").deploy, false);
  assert.equal(d("anchor test").deploy, false);
  assert.equal(d("anchor idl upgrade -f target/idl/x.json PROGRAM", { "/repo/Anchor.toml": anchorToml }).tool, "anchor idl upgrade");
  assert.equal(d("solana program deploy target/deploy/x.so -u m").network, "mainnet");
  assert.equal(d("solana program deploy target/deploy/x.so --url devnet").network, "testnet");
  assert.equal(d("solana program deploy x.so -ul").network, "unknown", "-ul isn't a flag we parse; unknown is the safe answer");
  assert.equal(d("solana program deploy x.so", { "/home/dev/.config/solana/cli/config.yml": "json_rpc_url: \"https://api.mainnet-beta.solana.com\"\n" }).network, "mainnet");
  assert.equal(d("solana balance").deploy, false);
});

test("compound lines, cd, env prefixes and package scripts", () => {
  const r = d("cd contracts && FOUNDRY_PROFILE=prod forge script s.s.sol --broadcast --rpc-url mainnet 2>&1 | tee log");
  assert.equal(r.network, "mainnet");
  assert.equal(r.cwd, "/repo/contracts");
  const pkg = { "/repo/package.json": JSON.stringify({ scripts: { "deploy:mainnet": "hardhat run scripts/deploy.ts --network mainnet", build: "hardhat compile" } }) };
  const s = d("npm run deploy:mainnet", pkg);
  assert.equal(s.deploy, true);
  assert.equal(s.network, "mainnet");
  assert.equal(s.via, "npm run deploy:mainnet");
  assert.equal(d("pnpm deploy:mainnet", pkg).network, "mainnet");
  assert.equal(d("npm run build", pkg).deploy, false);
  const mk = { "/repo/Makefile": "deploy:\n\t@forge script script/D.s.sol --broadcast --rpc-url $(RPC)\n\ntest:\n\tforge test\n" };
  assert.equal(d("make deploy", mk).deploy, true);
  assert.equal(d("make test", mk).deploy, false);
  assert.equal(d("ls -la && git status").deploy, false);
  assert.equal(d("echo 'forge script x --broadcast'").deploy, false, "a quoted string isn't a command");
  // The riskiest of several deploys wins.
  assert.equal(d("forge script a --broadcast --rpc-url localhost; forge script b --broadcast --rpc-url mainnet").network, "mainnet");
});

test("helpers", () => {
  assert.deepEqual(splitCommands("a b && c 'd e' | f"), [["a", "b"], ["c", "d e"], ["f"]]);
  assert.deepEqual(normalize(["FOO=1", "npx", "--yes", "hardhat", "run", "x"]), ["hardhat", "run", "x"]);
  assert.deepEqual(normalize(["./node_modules/.bin/hardhat", "run"]), ["hardhat", "run"]);
  for (const [v, want] of [["http://localhost:8545", "local"], ["ws://127.0.0.1:8546", "local"], ["https://sepolia.infura.io/v3/x", "testnet"], ["https://api.devnet.solana.com", "testnet"],
    ["https://api.mainnet-beta.solana.com", "mainnet"], ["https://mainnet.base.org", "mainnet"], ["https://polygon-rpc.com", "mainnet"], ["https://rpc.example.org", "unknown"], ["${RPC}", "unknown"], ["", "unknown"]]) {
    assert.equal(classifyNetwork(v), want, v);
  }
  const fs = reader({ "/w/app/foundry.toml": "" });
  assert.deepEqual(findProject("/w/app/script", fs), { root: "/w/app", kind: "foundry" });
  assert.deepEqual(findProject("/x", reader({})), { root: "/x", kind: "unknown" });
});

test("the policy: local is free, mainnet always asks, high findings block mainnet", () => {
  const det = (network) => ({ deploy: true, chain: "evm", tool: "forge script", network, target: network });
  assert.equal(decide(det("local"), { high: 3 }).decision, "allow");
  assert.equal(decide({ deploy: false }, { high: 3 }).decision, "allow");
  assert.equal(decide(det("mainnet"), { high: 1, medium: 0 }).decision, "deny");
  assert.match(decide(det("mainnet"), { high: 1 }).reason, /highOnMainnet/);
  assert.equal(decide(det("mainnet"), { high: 1 }, { highOnMainnet: "ask" }).decision, "ask");
  assert.equal(decide(det("mainnet"), { high: 0, medium: 2 }).decision, "ask");
  assert.match(decide(det("mainnet"), { high: 0, medium: 0 }).reason, /isn't an audit/);
  assert.equal(decide(det("mainnet"), {}, { mainnet: "allow" }).decision, "note");
  assert.equal(decide(det("testnet"), { high: 2 }).decision, "ask");
  assert.equal(decide(det("testnet"), { high: 0, medium: 4 }).decision, "note");
  assert.equal(decide(det("unknown"), { high: 1 }).decision, "ask");
  assert.equal(decide(det("testnet"), { high: 2 }, { highElsewhere: "allow" }).decision, "note");
});
