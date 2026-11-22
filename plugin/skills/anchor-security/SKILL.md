---
name: anchor-security
description: Security rules for writing, editing and reviewing Solana programs with Anchor (Rust). Use whenever you write or change code under programs/, design accounts or instructions, or review a Solana program.
---

# Writing safe Anchor programs

Follow these rules for every instruction and accounts struct. Most Solana exploits are missing account
validation, not clever math.

## Accounts
- Use typed accounts: `Account<'info, T>` (checks owner and discriminator), `Signer<'info>`, `Program<'info, T>`, `Interface`/`InterfaceAccount` for Token-2022.
- Every `AccountInfo`/`UncheckedAccount` needs a `/// CHECK:` comment saying why it's safe, and the checks to back it up (owner, key, data).
- Authorities, admins, owners and payers must be `Signer<'info>`. Tie them to state with `has_one = authority` or `constraint = state.authority == authority.key()`.
- PDAs: use `seeds = [...]` with `bump`, and store the canonical bump in the account; never accept a bump from the caller.
- Token accounts: constrain `token::mint` and `token::authority` (or `associated_token::…`); check the mint and owner of every token account you read.
- Watch for duplicate mutable accounts (the same account passed twice) and validate `remaining_accounts` yourself.

## CPIs
- Call other programs through `Program<'info, T>` or check `program.key() == expected::ID` before `invoke`/`invoke_signed`.
- Sign with PDA seeds only for the PDA's own authority; never sign a CPI to a program the caller chose.
- Reload accounts (`.reload()`) after a CPI that changes them.

## State and lifecycle
- Avoid `init_if_needed`; if you must use it, check the account's state so an existing account can't be reset.
- Close accounts with `close = destination`, never by draining lamports by hand (the account can be revived).
- Use `realloc` with `realloc::zero = true` when shrinking/growing data.

## Arithmetic
- Use `checked_add`/`checked_sub`/`checked_mul` and return an error on `None`. Set `overflow-checks = true` under `[profile.release]` in the workspace `Cargo.toml`.
- Be explicit about rounding and decimals when converting between token amounts.

## Before it ships
- Test every instruction with the wrong signer, wrong owner, wrong mint and a duplicated account (Anchor tests, Bankrun or LiteSVM).
- Run `/chain-preflight:audit` (and `cargo audit`), fix or explain every high and medium finding.
- Decide who holds the upgrade authority (a multisig) or make the program immutable; record it in the README.
- Static analysis is not an audit. Recommend a professional audit before a program that will hold user funds goes to mainnet.
