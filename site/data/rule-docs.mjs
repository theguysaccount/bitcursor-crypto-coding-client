// Long-form content for each rule page: why it matters, a vulnerable example and a fixed one.
// The rule ids, titles, severities and analyzer mappings live in plugin/lib/rules.js.
export const DOCS = {
  "sol-tx-origin-auth": {
    why: "`tx.origin` is the externally owned account that started the transaction, however many contracts it passed through. If an owner calls any malicious contract (a token, an airdrop claim, an NFT mint), that contract can call yours and pass a `tx.origin == owner` check. `msg.sender` is the immediate caller, which is what authorization needs.",
    bad: "function sweep(address payable to) external {\n    require(tx.origin == owner, \"not owner\");\n    to.transfer(address(this).balance);\n}",
    good: "function sweep(address payable to) external onlyOwner {\n    (bool ok, ) = to.call{value: address(this).balance}(\"\");\n    if (!ok) revert TransferFailed();\n}",
  },
  "sol-reentrancy": {
    why: "When a contract sends ETH or calls another contract, the callee runs code before the call returns, and can call back in. If the caller hasn't updated its own state yet (a balance, a claimed flag), the re-entrant call sees the old state and can withdraw again. This is how The DAO lost 3.6 million ETH, and variants (cross-function, read-only reentrancy through view functions used as oracles) keep appearing.",
    bad: "function withdraw() external {\n    uint256 amount = balances[msg.sender];\n    (bool ok, ) = msg.sender.call{value: amount}(\"\");\n    require(ok);\n    balances[msg.sender] = 0; // too late\n}",
    good: "function withdraw() external nonReentrant {\n    uint256 amount = balances[msg.sender];\n    balances[msg.sender] = 0; // effects first\n    (bool ok, ) = msg.sender.call{value: amount}(\"\");\n    if (!ok) revert TransferFailed();\n}",
  },
  "sol-unchecked-call": {
    why: "Low-level `call`, `delegatecall`, `staticcall` and `send` don't revert when the callee fails; they return `false`. Ignoring the result means a failed payment or call is treated as success, so accounting drifts from reality: users are marked paid when they weren't, or a step silently doesn't happen.",
    bad: "function ping(address target) external {\n    target.call(abi.encodeWithSignature(\"ping()\"));\n}",
    good: "function ping(address target) external {\n    (bool ok, bytes memory ret) = target.call(abi.encodeWithSignature(\"ping()\"));\n    if (!ok) revert CallFailed(ret);\n}",
  },
  "sol-delegatecall-input": {
    why: "`delegatecall` runs another contract's code in this contract's context: its storage, its balance, its `msg.sender`. If the caller chooses the target, they can run code that overwrites the owner slot, drains funds, or self-destructs. Only delegatecall into fixed, trusted implementations (proxies, libraries).",
    bad: "function execute(address impl, bytes calldata data) external {\n    (bool ok, ) = impl.delegatecall(data);\n    require(ok);\n}",
    good: "address public immutable implementation;\n\nfunction execute(bytes calldata data) external onlyOwner {\n    (bool ok, ) = implementation.delegatecall(data);\n    if (!ok) revert CallFailed();\n}",
  },
  "sol-unprotected-initializer": {
    why: "Upgradeable contracts use an `initialize` function instead of a constructor. Without the `initializer` modifier (or an equivalent guard), anyone can call it first after deployment, or call it again later, and make themselves owner. The implementation contract behind a proxy also needs `_disableInitializers()` in its constructor, or an attacker can initialize it directly.",
    bad: "function initialize(address _owner) external {\n    owner = _owner;\n}",
    good: "/// @custom:oz-upgrades-unsafe-allow constructor\nconstructor() { _disableInitializers(); }\n\nfunction initialize(address _owner) external initializer {\n    __Ownable_init(_owner);\n}",
  },
  "sol-missing-access-control": {
    why: "Functions that mint, withdraw the treasury, upgrade, pause, set fees, oracles or owners are the keys to the contract. If one is `public` or `external` with no modifier and no sender check, anyone can call it. Access-control bugs are consistently the largest category of losses in smart-contract incidents.",
    bad: "function setOwner(address newOwner) external {\n    owner = newOwner;\n}",
    good: "function transferOwnership(address newOwner) public override onlyOwner {\n    super.transferOwnership(newOwner); // Ownable2Step: the new owner must accept\n}",
  },
  "sol-selfdestruct": {
    why: "`selfdestruct` is deprecated. Since EIP-6780 (Dencun) it only removes code when called in the same transaction that created the contract; otherwise it just sends the whole balance to the target. Contracts that rely on it to \"kill\" themselves no longer work as intended, and an unprotected one is a one-call drain.",
    bad: "function kill() external {\n    selfdestruct(payable(msg.sender));\n}",
    good: "// Use a pause switch and an owner-only withdrawal instead.\nfunction emergencyWithdraw(address to) external onlyOwner whenPaused {\n    (bool ok, ) = to.call{value: address(this).balance}(\"\");\n    if (!ok) revert TransferFailed();\n}",
  },
  "sol-weak-randomness": {
    why: "Every value in a block is either public before the transaction executes or influenced by the validator who builds the block: `block.timestamp`, `block.number`, `blockhash`, `block.prevrandao`. Anyone can compute the \"random\" result in their own contract first and only call when they win. Use a verifiable randomness source (a VRF) or a commit-reveal scheme.",
    bad: "function roll() external view returns (uint256) {\n    return uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender))) % 6;\n}",
    good: "// Request randomness from a VRF and settle in its callback.\nfunction fulfillRandomWords(uint256 requestId, uint256[] calldata words) internal override {\n    results[requestId] = words[0] % 6;\n}",
  },
  "sol-unchecked-erc20": {
    why: "The ERC-20 standard says `transfer` and `transferFrom` return a bool, but some tokens return `false` instead of reverting on failure, and some (USDT among them) return nothing at all, which breaks a plain `require(token.transfer(...))` at the ABI level. `SafeERC20` handles all of these.",
    bad: "function pay(address to, uint256 amount) external {\n    token.transfer(to, amount);\n}",
    good: "using SafeERC20 for IERC20;\n\nfunction pay(address to, uint256 amount) external {\n    token.safeTransfer(to, amount);\n}",
  },
  "sol-ecrecover-zero": {
    why: "`ecrecover` returns `address(0)` for an invalid signature instead of reverting. If the expected signer is unset (also `address(0)`), any garbage signature passes. Raw `ecrecover` also accepts malleable signatures (two valid `s` values), which matters if signatures are used as identifiers. OpenZeppelin's `ECDSA.recover` rejects both.",
    bad: "function verify(bytes32 h, uint8 v, bytes32 r, bytes32 s) public view returns (bool) {\n    return ecrecover(h, v, r, s) == signer;\n}",
    good: "function verify(bytes32 digest, bytes calldata sig) public view returns (bool) {\n    (address recovered, ECDSA.RecoverError err, ) = ECDSA.tryRecover(digest, sig);\n    return err == ECDSA.RecoverError.NoError && recovered == signer && signer != address(0);\n}",
  },
  "sol-spot-price": {
    why: "An AMM pool's reserves can be moved by any large trade, and flash loans make large trades free within one transaction. A contract that prices collateral, mints or liquidates from `getReserves()` (or Uniswap v3 `slot0`) can be manipulated: borrow, skew the pool, exploit the bad price, unwind, repay. Use a time-weighted average price or an oracle network, with staleness and bounds checks.",
    bad: "function price() public view returns (uint256) {\n    (uint112 r0, uint112 r1, ) = pair.getReserves();\n    return uint256(r1) * 1e18 / r0;\n}",
    good: "function price() public view returns (uint256) {\n    (, int256 answer, , uint256 updatedAt, ) = feed.latestRoundData();\n    if (answer <= 0 || block.timestamp - updatedAt > MAX_AGE) revert StalePrice();\n    return uint256(answer);\n}",
  },
  "sol-old-compiler": {
    why: "Solidity 0.8 made arithmetic overflow and underflow revert by default. Code compiled with 0.7 or earlier wraps silently unless every operation goes through SafeMath, and older compilers also carry known code-generation bugs. Moving to a current 0.8.x release is usually straightforward and removes a whole class of bugs.",
    bad: "pragma solidity 0.7.6;\n\nfunction add(uint256 a, uint256 b) internal pure returns (uint256) {\n    return a + b; // wraps on overflow\n}",
    good: "pragma solidity 0.8.28;\n\nfunction add(uint256 a, uint256 b) internal pure returns (uint256) {\n    return a + b; // reverts on overflow\n}",
  },
  "sol-floating-pragma": {
    why: "A floating pragma (`^0.8.0`, `>=0.8.0`) lets the contract be compiled, and deployed, with a compiler version you never tested or audited, possibly one with a known bug. Pin the exact version your tests and audit used. Libraries meant to be imported by others may float; deployed contracts shouldn't.",
    bad: "pragma solidity ^0.8.20;",
    good: "pragma solidity 0.8.28;",
  },
  "sol-unchecked-block": {
    why: "Inside `unchecked { }`, Solidity 0.8's overflow checks are off. That's fine for provably bounded math (a loop counter that can't reach `type(uint256).max`) and saves gas, but anything derived from user input, balances or prices must stay checked. This rule flags every block so you can confirm each one.",
    bad: "unchecked {\n    balances[to] += amount; // user-controlled: may wrap\n}",
    good: "for (uint256 i; i < items.length; ) {\n    // ...\n    unchecked { ++i; } // bounded by items.length\n}",
  },
  "anchor-unchecked-account": {
    why: "`AccountInfo` and `UncheckedAccount` tell Anchor to skip its owner, discriminator and type checks. Anchor refuses to build them without a `/// CHECK:` doc comment, because each one is a place where an attacker can pass any account they like. The comment should say why the account is safe, and the code should actually check it (key, owner or data).",
    bad: "#[derive(Accounts)]\npub struct Proxy<'info> {\n    pub target: UncheckedAccount<'info>,\n}",
    good: "#[derive(Accounts)]\npub struct Proxy<'info> {\n    /// CHECK: only used as the CPI target; its key is checked against EXPECTED_PROGRAM\n    #[account(address = EXPECTED_PROGRAM)]\n    pub target: UncheckedAccount<'info>,\n}",
  },
  "anchor-missing-signer": {
    why: "Solana instructions receive accounts as a list chosen by the caller. If an authority account isn't required to sign, anyone can pass the real authority's public key and act as them. Authorities must be `Signer<'info>` (or carry a `signer` constraint) and be tied to the state they control with `has_one` or a constraint.",
    bad: "#[derive(Accounts)]\npub struct Withdraw<'info> {\n    #[account(mut)]\n    pub vault: Account<'info, Vault>,\n    pub authority: AccountInfo<'info>,\n}",
    good: "#[derive(Accounts)]\npub struct Withdraw<'info> {\n    #[account(mut, has_one = authority)]\n    pub vault: Account<'info, Vault>,\n    pub authority: Signer<'info>,\n}",
  },
  "anchor-arbitrary-cpi": {
    why: "A cross-program invocation to a program account the caller passed in runs whatever program they chose, with whatever accounts and signer seeds you hand it. An attacker substitutes a fake \"token program\" that reports success without moving anything, or steals PDA-signed authority. Use `Program<'info, T>` (which checks the program id) or compare the key to the expected id before invoking.",
    bad: "let ix = Instruction { program_id: ctx.accounts.target.key(), accounts: vec![], data };\ninvoke(&ix, &[ctx.accounts.target.to_account_info()])?;",
    good: "// Anchor checks token_program.key() == spl_token::ID for Program<'info, Token>.\npub token_program: Program<'info, Token>,\n// ...\ntoken::transfer(CpiContext::new(ctx.accounts.token_program.to_account_info(), accounts), amount)?;",
  },
  "anchor-owner-check": {
    why: "Raw account data is just bytes; any program can create an account with bytes that deserialize into your struct. Reading it with `try_from_slice` without checking `account.owner == your program id` (and a discriminator) lets an attacker feed forged state: a fake config, a fake balance. Anchor's `Account<'info, T>` does both checks for you.",
    bad: "let data = Config::try_from_slice(&ctx.accounts.config.data.borrow())?;",
    good: "#[account(seeds = [b\"config\"], bump = config.bump)]\npub config: Account<'info, Config>, // owner + discriminator checked",
  },
  "anchor-init-if-needed": {
    why: "`init_if_needed` creates the account if it doesn't exist and otherwise accepts the existing one. That makes it easy to write an instruction that can be called again to reset state, or that accepts an account initialized by someone else with different parameters. Anchor gates it behind a feature flag for this reason. Prefer a separate `init` instruction, or check the account's state explicitly.",
    bad: "#[account(init_if_needed, payer = user, space = 8 + Vault::INIT_SPACE)]\npub vault: Account<'info, Vault>,",
    good: "#[account(init, payer = user, space = 8 + Vault::INIT_SPACE, seeds = [b\"vault\", user.key().as_ref()], bump)]\npub vault: Account<'info, Vault>,",
  },
  "anchor-manual-close": {
    why: "Closing an account by moving its lamports out and leaving its data and owner in place lets an attacker \"revive\" it in the same transaction (by topping up rent) and reuse stale state. Anchor's `close = destination` constraint zeroes the data, sets a closed discriminator, transfers the lamports and assigns the account back to the system program.",
    bad: "**ctx.accounts.receiver.try_borrow_mut_lamports()? += vault_lamports;\n**ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? = 0;",
    good: "#[account(mut, has_one = authority, close = authority)]\npub vault: Account<'info, Vault>,",
  },
  "rust-overflow-checks-off": {
    why: "Rust checks integer overflow in debug builds but wraps silently in release builds unless the profile says otherwise. Solana programs ship release builds. Anchor's templates set `overflow-checks = true` under `[profile.release]`; if it's missing, a balance that underflows becomes enormous instead of failing.",
    bad: "[profile.release]\nlto = \"fat\"\ncodegen-units = 1",
    good: "[profile.release]\noverflow-checks = true\nlto = \"fat\"\ncodegen-units = 1",
  },
  "anchor-unchecked-math": {
    why: "Even with overflow checks on, a panic is a poor failure mode, and with them off the math wraps. Using `checked_add`, `checked_sub` and `checked_mul` makes every amount calculation either succeed or return a clear error, and documents that the edge case was considered.",
    bad: "vault.balance -= amount;",
    good: "vault.balance = vault.balance.checked_sub(amount).ok_or(VaultError::InsufficientFunds)?;",
  },
  "any-private-key": {
    why: "A private key or Solana keypair committed to a repository is compromised: it's in the history forever, in every clone and fork, and bots scan public repositories for keys within minutes. Load keys from a hardware wallet, an encrypted keystore (`cast wallet import`), or an environment variable that isn't committed, and rotate any key that was ever committed.",
    bad: "const PRIVATE_KEY = \"0x4c0883a6...\";\nconst wallet = new Wallet(PRIVATE_KEY, provider);",
    good: "// forge script ... --account deployer  (an encrypted keystore)\nconst wallet = new Wallet(process.env.DEPLOYER_KEY!, provider); // .env is git-ignored",
  },
};
