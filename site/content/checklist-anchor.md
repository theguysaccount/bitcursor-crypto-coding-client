---
title: Anchor (Solana) program security checklist
description: The account-validation, signer, PDA, CPI, closing and arithmetic checks to make in every Anchor program before deploying to devnet or mainnet-beta.
path: /checklists/anchor-security/
updated: 2026-11-22
og: checklist
---

# Anchor security checklist

Most Solana exploits come from accounts the program didn't validate. Check each instruction's accounts struct against this list.

## Accounts and signers

- [ ] Typed accounts (`Account<'info, T>`, `Signer<'info>`, `Program<'info, T>`, `InterfaceAccount`) wherever possible. ([rule]({{base}}/rules/anchor-unchecked-account/))
- [ ] Every `AccountInfo` / `UncheckedAccount` has a `/// CHECK:` reason and a real check (key, owner or data).
- [ ] Authorities are `Signer<'info>` and tied to state with `has_one` or a constraint. ([rule]({{base}}/rules/anchor-missing-signer/))
- [ ] Raw account data is only read after an owner check (or through `Account<'info, T>`). ([rule]({{base}}/rules/anchor-owner-check/))
- [ ] Token accounts constrained by mint and authority; duplicate mutable accounts considered; `remaining_accounts` validated.

## PDAs and CPIs

- [ ] PDAs derived with `seeds` and the canonical, stored `bump`; no caller-supplied bumps.
- [ ] CPIs go through `Program<'info, T>` or an explicit program-id check. ([rule]({{base}}/rules/anchor-arbitrary-cpi/))
- [ ] PDA signer seeds are only used for that PDA's own authority; accounts reloaded after CPIs that change them.

## Lifecycle and math

- [ ] No `init_if_needed`, or state checks that prevent re-initialization. ([rule]({{base}}/rules/anchor-init-if-needed/))
- [ ] Accounts closed with `close = destination`, not by draining lamports. ([rule]({{base}}/rules/anchor-manual-close/))
- [ ] `checked_*` arithmetic on amounts, and `overflow-checks = true` in `[profile.release]`. ([math]({{base}}/rules/anchor-unchecked-math/), [overflow]({{base}}/rules/rust-overflow-checks-off/))

## Before deploying

- [ ] `anchor test` covers wrong signer, wrong owner, wrong mint and duplicated accounts for every instruction.
- [ ] `chain-preflight scan . --report` (with `cargo audit`) clean or explained.
- [ ] No keypair JSON in the repository. ([rule]({{base}}/rules/any-private-key/))
- [ ] Upgrade authority decided: a multisig, or immutable on purpose. `anchor verify` planned.
- [ ] A professional audit for anything that will hold user funds.
