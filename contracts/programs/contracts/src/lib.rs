use anchor_lang::prelude::*;

declare_id!("5LcEFtx3EobismTJFxooSFYQeWp4AbdUgAixM9it9gBn");

#[program]
pub mod contracts {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
