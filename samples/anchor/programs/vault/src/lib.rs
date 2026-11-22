// Deliberately vulnerable sample for Chain Preflight's tests. Never deploy it.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::program::invoke;

declare_id!("Vau1t11111111111111111111111111111111111111");

#[program]
pub mod vault {
    use super::*;

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.balance -= amount;
        **ctx.accounts.vault_info.try_borrow_mut_lamports()? -= amount;
        Ok(())
    }

    pub fn proxy(ctx: Context<Proxy>, data: Vec<u8>) -> Result<()> {
        let ix = Instruction { program_id: ctx.accounts.target.key(), accounts: vec![], data };
        invoke(&ix, &[ctx.accounts.target.to_account_info()])?;
        Ok(())
    }

    pub fn close(ctx: Context<Close>) -> Result<()> {
        let lamports = ctx.accounts.vault.to_account_info().lamports();
        **ctx.accounts.receiver.try_borrow_mut_lamports()? += lamports;
        **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? = 0;
        Ok(())
    }

    pub fn init(_ctx: Context<Init>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    /// CHECK: the vault's own lamports
    #[account(mut)]
    pub vault_info: AccountInfo<'info>,
    pub authority: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Proxy<'info> {
    pub target: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Close<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    /// CHECK: only receives lamports
    #[account(mut)]
    pub receiver: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Init<'info> {
    #[account(init_if_needed, payer = payer, space = 8 + 8)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Vault {
    pub balance: u64,
}
