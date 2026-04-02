# SolanaVote PRD

## Product Summary

SolanaVote is a wallet-owned, live voting platform on Solana devnet.

Any connected user can create a session, receive a short join code, and share a QR code or join link with participants. The creator can publish live prompts with 2 to 6 custom options. Participants join from their own wallets, vote once per round, and watch tallies update in real time across multiple clients.

The current product is a production-minded MVP with a strict devnet-only policy.

---

## Product Goals

1. Let any wallet holder create a live session without a hidden admin backend.
2. Make joining simple through a short code or QR link instead of a raw PDA.
3. Support multiple participant wallets while keeping Solana behavior explicit.
4. Keep vote integrity on-chain with one vote per wallet per round.
5. Keep the creator and participant experience fast enough for live demos and workshops.

---

## Non-Goals

The current product does not include:

- Mainnet support
- Creator payouts or protocol fees
- Quiz scoring, correct answers, or answer reveal logic
- Off-chain auth, usernames, or email accounts
- Session analytics beyond current round history and live counts
- Admin-controlled round shutdown after publish

---

## User Roles

### Creator

- Connects a Solana wallet
- Creates a session with a title and short join code
- Shares a QR code or join link
- Publishes live prompts with 2 to 6 options
- Watches live results update in real time

### Participant

- Opens a shared join link or enters a join code
- Connects a Solana wallet
- Loads the latest active round for the session
- Casts one vote for the current round
- Sees live results and personal vote state

---

## Core User Journeys

### Create Session

1. User opens `/creator`
2. User connects a wallet
3. User enters a session title and join code
4. App validates wallet balance, join code format, and devnet cluster
5. App creates the on-chain session PDA
6. Creator receives a shareable join URL and QR code

### Publish Round

1. Creator opens an existing session
2. Creator enters a prompt and 2 to 6 options
3. Creator chooses an optional round duration
4. App creates a `VotingRound` PDA on-chain
5. Connected clients update from account subscriptions

### Join and Vote

1. Participant opens `/join?code=...` or pastes a join code
2. App resolves the session PDA from the join code
3. App loads the latest round for the session
4. Participant connects a wallet
5. App simulates the vote transaction before signature
6. Participant signs once
7. Vote record PDA is created and tallies update

---

## Product Surface

### Routes

| Route | Purpose | Notes |
|-------|---------|-------|
| `/` | Landing page with create and join entry points | Includes devnet-only notice |
| `/creator` | Creator dashboard | Create or reopen session, publish rounds, copy join code, show QR |
| `/join` | Participant page | Join by code or link, load latest round, cast vote |
| `/presenter` | Legacy redirect | Redirects to `/creator` |
| `/availability` | No-content utility route | Returns `204` for probes and noisy external checks |

### Share Model

- Join URL format: `/join?code=ABCD12`
- QR code points to the join URL
- Legacy raw session address lookup is still accepted for backward compatibility

---

## Wallet and Cluster Policy

### Cluster

- The app is hard-locked to `https://api.devnet.solana.com`
- Transaction methods reject any non-devnet and non-localhost RPC endpoint
- Local validator support is allowed for development and smoke testing

### Wallet Support

- Phantom is explicitly supported
- Solflare is explicitly supported
- Wallet Standard discovery is enabled through `@solana/wallet-adapter-react`
- Compatible wallets such as Backpack should appear through Wallet Standard when installed

### Phantom-Specific Behavior

- After Phantom connects, the app requests a switch to devnet using Phantom Browser SDK
- The switch requires user approval
- Non-Phantom wallets must be placed on devnet manually by the user

---

## Technical Architecture

### Frontend

- Framework: Next.js 14 App Router
- Wallet stack: `@solana/wallet-adapter-react`, `@solana/wallet-adapter-react-ui`
- Phantom enhancement: `@phantom/browser-sdk`
- State model: client-side fetch plus `connection.onAccountChange()`
- Share UX: QR code via `qrcode.react`

### On-Chain

- Framework: Anchor
- Program ID: `E9mdkmcBVoTRtJp6s2cuo9LJQqqJV314M7GptWkouc8r`
- Cluster: devnet
- Local development: `solana-test-validator`

### Client / Program Contract

- The app consumes the generated IDL in `app/lib/idl.json`
- PDA derivation is duplicated in the client for lookup and optimistic resolution

---

## On-Chain Account Model

### Session

Fields:

- `authority: Pubkey`
- `title: String`
- `join_code: String`
- `session_state: SessionState`
- `bump: u8`
- `round_count: u16`

PDA seeds:

- `[b"session", join_code.as_bytes()]`

### VotingRound

Fields:

- `session: Pubkey`
- `prompt: String`
- `option_labels: Vec<String>`
- `option_counts: Vec<u64>`
- `start_time: i64`
- `duration_seconds: u64`
- `bump: u8`
- `round_index: u16`

PDA seeds:

- `[b"round", session.key().as_ref(), &session.round_count.to_le_bytes()]`

### VoteRecord

Fields:

- `voter: Pubkey`
- `round: Pubkey`
- `choice: u8`
- `bump: u8`

PDA seeds:

- `[b"vote", round.key().as_ref(), voter.key().as_ref()]`

---

## On-Chain Instructions

### `create_session(title, join_code)`

Behavior:

- Creates a session account
- Stores creator wallet as authority
- Initializes `session_state = Active`
- Initializes `round_count = 0`

Validation:

- `title.len() <= 64`
- join code must be 4 to 10 uppercase alphanumeric characters

Payer:

- Creator wallet

### `create_round(prompt, option_labels, duration_seconds)`

Behavior:

- Creates a round account for the next round index
- Stores prompt and variable-length options
- Initializes counts to zero
- Sets `start_time = Clock::get()?.unix_timestamp`
- Increments `session.round_count`

Validation:

- `prompt.len() <= 128`
- option count between 2 and 6
- each option must be non-empty after trim
- each option must be `<= 32` characters
- session authority must match signer
- session must be active

Payer:

- Creator wallet

### `cast_vote(choice)`

Behavior:

- Creates a vote-record PDA unique to `(round, voter)`
- Increments the chosen option counter

Validation:

- choice index must be within `option_counts`
- if duration is non-zero, current time must be before or at deadline
- duplicate votes fail because the vote-record PDA already exists

Payer:

- Participant wallet

### `close_session()`

Behavior:

- Sets `session_state = Ended`

Validation:

- signer must match `session.authority`

Payer:

- No new account is created

---

## Solana Constraints and Economics

### Deterministic Rules

- No floats in program state or logic
- All vote counts are `u64`
- PDA bumps are stored in account data
- Time logic uses `Clock::get()?.unix_timestamp`

### Who Pays What

- Session creation: creator pays account rent plus transaction fee
- Round creation: creator pays account rent plus transaction fee
- Vote casting: participant pays transaction fee plus rent for their `VoteRecord`

### Payment Policy

- No lamports are transferred to the creator during voting
- The product currently charges no protocol fee
- Voting is not a creator-monetization flow in the current release

---

## Frontend Behavior

### Creator Dashboard

Current capabilities:

- Create a new session with title and join code
- Reopen an existing session by join link, join code, or legacy PDA
- Display creator wallet, session address, join code, and QR
- Publish prompts with 2 to 6 options
- View current and previous rounds
- Copy join code and join URL

### Join Page

Current capabilities:

- Load session from join link or join code
- Resolve latest round automatically
- Subscribe to session and round updates
- Display current tallies and participant vote state
- Prevent repeat voting in the UI after vote-record detection

### Transaction Safety

- Create, publish, vote, and close-session calls simulate before requesting wallet signature
- Known Solana and Anchor errors are normalized into readable client errors
- Non-devnet endpoints are rejected before signing

---

## Verification Requirements

The current product is considered working when all of the following are true:

### Repo Verification

- `npm run build` passes
- `npm run lint` passes
- `NO_DNA=1 anchor test --skip-deploy` passes

### Backend Smoke

- Local smoke succeeds against `solana-test-validator`
- Devnet smoke succeeds against the deployed program

### Product Smoke

- Creator can create a session from the browser
- Creator can publish a round
- Participant can join with a join link or code
- Participant can vote successfully
- Live tallies update across clients

---

## Known Gaps

1. There is no `close_round` instruction yet.
2. There is no formal TypeScript Anchor integration suite in `tests/`.
3. `PRD.md`, `AGENTS.md`, and `STATUS.md` must stay aligned with the current join-code and dynamic-option model.
4. Phantom can be prompted to switch to devnet, but other wallets must be set to devnet manually.
5. The product is voting-only today. Quiz-specific scoring and answer reveal are future work.

---

## Next Priorities

1. Add a formal integration test suite for create session, create round, cast vote, duplicate vote, and expiry cases.
2. Add `close_round` if creator-controlled shutdown is required.
3. Deploy the frontend on Vercel for stable QR-based demos.
4. Expand wallet messaging so Backpack and other wallets show explicit devnet setup help.

---

## Source of Truth

If this document conflicts with the implementation, the current source of truth is:

1. `anchor/programs/solana-vote/src/lib.rs`
2. `app/lib/hooks/useSolanaVote.ts`
3. `app/creator/page.tsx`
4. `app/join/page.tsx`
5. `scripts/backend-smoke.cjs`

This PRD is intended to match that implementation as of `2026-04-02`.
