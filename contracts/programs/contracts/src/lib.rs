use anchor_lang::prelude::*;

declare_id!("5LcEFtx3EobismTJFxooSFYQeWp4AbdUgAixM9it9gBn");

#[program]
pub mod contracts {
    use super::*;

    /// Регистрация пользователя: сохраняет публичные ключи в блокчейн.
    /// Приватные ключи НИКОГДА не покидают устройство пользователя.
    pub fn register_user(
        ctx: Context<RegisterUser>,
        identity_pubkey: [u8; 32],
        signed_pre_key: [u8; 32],
    ) -> Result<()> {
        let user = &mut ctx.accounts.user_account;
        user.owner = ctx.accounts.authority.key();
        user.identity_pubkey = identity_pubkey;
        user.signed_pre_key = signed_pre_key;
        user.registered_at = Clock::get()?.unix_timestamp;
        user.message_count = 0;

        emit!(UserRegistered {
            owner: user.owner,
            registered_at: user.registered_at,
        });

        msg!(
            "User registered: {:?} at {}",
            user.owner,
            user.registered_at
        );
        Ok(())
    }

    /// Отправка сообщения: на блокчейн пишется только CID из IPFS.
    /// Само зашифрованное сообщение хранится в IPFS, не в блокчейне.
    pub fn send_message(
        ctx: Context<SendMessage>,
        ipfs_cid: String,
        ttl_seconds: i64,
    ) -> Result<()> {
        require!(ipfs_cid.len() <= 64, MessengerError::CidTooLong);
        require!(ttl_seconds > 0, MessengerError::InvalidTtl);
        require!(ttl_seconds <= 604800, MessengerError::TtlTooLong); // max 7 дней

        let clock = Clock::get()?;
        let msg_account = &mut ctx.accounts.message_account;
        msg_account.sender = ctx.accounts.sender.key();
        msg_account.recipient = ctx.accounts.recipient_account.owner;
        msg_account.ipfs_cid = ipfs_cid.clone();
        msg_account.sent_at = clock.unix_timestamp;
        msg_account.expires_at = clock.unix_timestamp + ttl_seconds;
        msg_account.delivered = false;
        msg_account.delivered_at = 0;

        let sender_account = &mut ctx.accounts.sender_account;
        sender_account.message_count = sender_account.message_count.saturating_add(1);

        emit!(MessageSent {
            sender: msg_account.sender,
            recipient: msg_account.recipient,
            ipfs_cid,
            sent_at: msg_account.sent_at,
            expires_at: msg_account.expires_at,
        });

        msg!(
            "Message sent from {:?} to {:?}, CID stored, expires at {}",
            msg_account.sender,
            msg_account.recipient,
            msg_account.expires_at
        );
        Ok(())
    }

    /// Подтверждение доставки: получатель сигнализирует что скачал и расшифровал.
    pub fn mark_delivered(ctx: Context<MarkDelivered>) -> Result<()> {
        let msg_account = &mut ctx.accounts.message_account;
        require!(!msg_account.delivered, MessengerError::AlreadyDelivered);

        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp < msg_account.expires_at,
            MessengerError::MessageExpired
        );

        msg_account.delivered = true;
        msg_account.delivered_at = clock.unix_timestamp;

        emit!(MessageDelivered {
            sender: msg_account.sender,
            recipient: msg_account.recipient,
            delivered_at: msg_account.delivered_at,
        });

        msg!(
            "Message delivered to {:?} at {}",
            msg_account.recipient,
            msg_account.delivered_at
        );
        Ok(())
    }
}

// ── Аккаунты ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct RegisterUser<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + UserAccount::SIZE,
        seeds = [b"user", authority.key().as_ref()],
        bump,
    )]
    pub user_account: Account<'info, UserAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SendMessage<'info> {
    #[account(
        init,
        payer = sender,
        space = 8 + MessageAccount::SIZE,
    )]
    pub message_account: Account<'info, MessageAccount>,

    #[account(
        mut,
        seeds = [b"user", sender.key().as_ref()],
        bump,
        has_one = owner @ MessengerError::Unauthorized,
    )]
    pub sender_account: Account<'info, UserAccount>,

    /// Аккаунт получателя нужен только для получения его адреса
    pub recipient_account: Account<'info, UserAccount>,

    #[account(mut)]
    pub sender: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MarkDelivered<'info> {
    #[account(
        mut,
        constraint = message_account.recipient == recipient.key() @ MessengerError::Unauthorized,
    )]
    pub message_account: Account<'info, MessageAccount>,

    pub recipient: Signer<'info>,
}

// ── Структуры данных ──────────────────────────────────────────────────────────

#[account]
pub struct UserAccount {
    /// Solana-кошелёк владельца
    pub owner: Pubkey,
    /// X25519 публичный ключ для ECDH (обмен ключами)
    pub identity_pubkey: [u8; 32],
    /// Signed Pre Key — ротируется раз в неделю
    pub signed_pre_key: [u8; 32],
    pub registered_at: i64,
    pub message_count: u64,
}

impl UserAccount {
    /// 32 (owner) + 32 (identity_pubkey) + 32 (signed_pre_key) + 8 + 8
    pub const SIZE: usize = 32 + 32 + 32 + 8 + 8;
}

#[account]
pub struct MessageAccount {
    /// Кошелёк отправителя
    pub sender: Pubkey,
    /// Кошелёк получателя
    pub recipient: Pubkey,
    /// IPFS CID зашифрованного сообщения (в блокчейне — только ссылка!)
    pub ipfs_cid: String,
    pub sent_at: i64,
    pub expires_at: i64,
    pub delivered: bool,
    pub delivered_at: i64,
}

impl MessageAccount {
    /// 32 + 32 + (4+64) + 8 + 8 + 1 + 8
    pub const SIZE: usize = 32 + 32 + (4 + 64) + 8 + 8 + 1 + 8;
}

// ── События (Events) ──────────────────────────────────────────────────────────

#[event]
pub struct UserRegistered {
    pub owner: Pubkey,
    pub registered_at: i64,
}

#[event]
pub struct MessageSent {
    pub sender: Pubkey,
    pub recipient: Pubkey,
    pub ipfs_cid: String,
    pub sent_at: i64,
    pub expires_at: i64,
}

#[event]
pub struct MessageDelivered {
    pub sender: Pubkey,
    pub recipient: Pubkey,
    pub delivered_at: i64,
}

// ── Ошибки ────────────────────────────────────────────────────────────────────

#[error_code]
pub enum MessengerError {
    #[msg("IPFS CID слишком длинный (максимум 64 символа)")]
    CidTooLong,
    #[msg("TTL должен быть положительным числом")]
    InvalidTtl,
    #[msg("TTL не может превышать 7 дней")]
    TtlTooLong,
    #[msg("Сообщение уже доставлено")]
    AlreadyDelivered,
    #[msg("Срок действия сообщения истёк")]
    MessageExpired,
    #[msg("Нет прав на выполнение операции")]
    Unauthorized,
}
