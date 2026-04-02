use anchor_lang::prelude::*;

declare_id!("E9mdkmcBVoTRtJp6s2cuo9LJQqqJV314M7GptWkouc8r");

const MAX_TITLE_LEN: usize = 64;
const MAX_JOIN_CODE_LEN: usize = 10;
const MAX_PROMPT_LEN: usize = 128;
const MAX_OPTION_LABEL_LEN: usize = 32;
const MAX_OPTIONS: usize = 6;

const SESSION_SPACE: usize = 8 + 32 + (4 + MAX_TITLE_LEN) + (4 + MAX_JOIN_CODE_LEN) + 1 + 1 + 2;
const ROUND_SPACE: usize = 8
    + 32
    + (4 + MAX_PROMPT_LEN)
    + (4 + MAX_OPTIONS * (4 + MAX_OPTION_LABEL_LEN))
    + (4 + MAX_OPTIONS * 8)
    + 8
    + 8
    + 1
    + 2;
const VOTE_RECORD_SPACE: usize = 8 + 32 + 32 + 1 + 1;

#[program]
pub mod solana_vote {
    use super::*;

    pub fn create_session(
        ctx: Context<CreateSession>,
        title: String,
        join_code: String,
    ) -> Result<()> {
        require!(title.len() <= MAX_TITLE_LEN, VoteError::TitleTooLong);
        require!(is_valid_join_code(&join_code), VoteError::InvalidJoinCode);

        let session = &mut ctx.accounts.session;
        session.authority = ctx.accounts.authority.key();
        session.title = title;
        session.join_code = join_code;
        session.session_state = SessionState::Active;
        session.bump = ctx.bumps.session;
        session.round_count = 0;

        Ok(())
    }

    pub fn create_round(
        ctx: Context<CreateRound>,
        prompt: String,
        option_labels: Vec<String>,
        duration_seconds: u64,
    ) -> Result<()> {
        require!(prompt.len() <= MAX_PROMPT_LEN, VoteError::PromptTooLong);
        require!(
            option_labels.len() >= 2 && option_labels.len() <= MAX_OPTIONS,
            VoteError::InvalidOptionCount
        );

        for option_label in &option_labels {
            require!(!option_label.trim().is_empty(), VoteError::LabelEmpty);
            require!(option_label.len() <= MAX_OPTION_LABEL_LEN, VoteError::LabelTooLong);
        }

        let session = &ctx.accounts.session;
        require!(
            session.authority == ctx.accounts.authority.key(),
            VoteError::Unauthorized
        );
        require!(
            session.session_state == SessionState::Active,
            VoteError::SessionNotActive
        );

        let clock = Clock::get()?;
        let round = &mut ctx.accounts.round;
        round.session = ctx.accounts.session.key();
        round.prompt = prompt;
        round.option_labels = option_labels;
        round.option_counts = vec![0; round.option_labels.len()];
        round.start_time = clock.unix_timestamp;
        round.duration_seconds = duration_seconds;
        round.bump = ctx.bumps.round;
        round.round_index = ctx.accounts.session.round_count;

        let session = &mut ctx.accounts.session;
        session.round_count = session.round_count.checked_add(1).unwrap();

        Ok(())
    }

    pub fn cast_vote(ctx: Context<CastVote>, choice: u8) -> Result<()> {
        let round = &ctx.accounts.round;
        let option_index = choice as usize;
        require!(
            option_index < round.option_counts.len(),
            VoteError::InvalidChoice
        );

        if round.duration_seconds > 0 {
            let clock = Clock::get()?;
            let deadline = round.start_time + round.duration_seconds as i64;
            require!(clock.unix_timestamp <= deadline, VoteError::RoundExpired);
        }

        let vote_record = &mut ctx.accounts.vote_record;
        vote_record.voter = ctx.accounts.voter.key();
        vote_record.round = ctx.accounts.round.key();
        vote_record.choice = choice;
        vote_record.bump = ctx.bumps.vote_record;

        let round = &mut ctx.accounts.round;
        round.option_counts[option_index] = round.option_counts[option_index]
            .checked_add(1)
            .unwrap();

        Ok(())
    }

    pub fn close_session(ctx: Context<CloseSession>) -> Result<()> {
        let session = &mut ctx.accounts.session;
        require!(
            session.authority == ctx.accounts.authority.key(),
            VoteError::Unauthorized
        );
        session.session_state = SessionState::Ended;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(_title: String, join_code: String)]
pub struct CreateSession<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = SESSION_SPACE,
        seeds = [b"session", join_code.as_bytes()],
        bump,
    )]
    pub session: Account<'info, Session>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateRound<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"session", session.join_code.as_bytes()],
        bump = session.bump,
    )]
    pub session: Account<'info, Session>,

    #[account(
        init,
        payer = authority,
        space = ROUND_SPACE,
        seeds = [b"round", session.key().as_ref(), &session.round_count.to_le_bytes()],
        bump,
    )]
    pub round: Account<'info, VotingRound>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,

    #[account(mut)]
    pub round: Account<'info, VotingRound>,

    #[account(
        init,
        payer = voter,
        space = VOTE_RECORD_SPACE,
        seeds = [b"vote", round.key().as_ref(), voter.key().as_ref()],
        bump,
    )]
    pub vote_record: Account<'info, VoteRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseSession<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"session", session.join_code.as_bytes()],
        bump = session.bump,
    )]
    pub session: Account<'info, Session>,
}

#[account]
pub struct Session {
    pub authority: Pubkey,
    pub title: String,
    pub join_code: String,
    pub session_state: SessionState,
    pub bump: u8,
    pub round_count: u16,
}

#[account]
pub struct VotingRound {
    pub session: Pubkey,
    pub prompt: String,
    pub option_labels: Vec<String>,
    pub option_counts: Vec<u64>,
    pub start_time: i64,
    pub duration_seconds: u64,
    pub bump: u8,
    pub round_index: u16,
}

#[account]
pub struct VoteRecord {
    pub voter: Pubkey,
    pub round: Pubkey,
    pub choice: u8,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum SessionState {
    Active,
    Paused,
    Ended,
}

#[error_code]
pub enum VoteError {
    #[msg("Invalid vote choice.")]
    InvalidChoice,
    #[msg("Voting round has ended.")]
    RoundExpired,
    #[msg("Session is not active.")]
    SessionNotActive,
    #[msg("Unauthorized. Only the session authority can perform this action.")]
    Unauthorized,
    #[msg("Title exceeds maximum length of 64 characters.")]
    TitleTooLong,
    #[msg("Prompt exceeds maximum length of 128 characters.")]
    PromptTooLong,
    #[msg("Label exceeds maximum length of 32 characters.")]
    LabelTooLong,
    #[msg("Voting rounds must have between 2 and 6 options.")]
    InvalidOptionCount,
    #[msg("Each voting option must include visible text.")]
    LabelEmpty,
    #[msg("Join code must be 4-10 uppercase letters or numbers.")]
    InvalidJoinCode,
}

fn is_valid_join_code(join_code: &str) -> bool {
    let len = join_code.len();
    (4..=MAX_JOIN_CODE_LEN).contains(&len)
        && join_code
            .chars()
            .all(|char| char.is_ascii_uppercase() || char.is_ascii_digit())
}
