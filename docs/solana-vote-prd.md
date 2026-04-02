# PRD: SolanaVote — Interactive On-Chain Voting & Quiz Platform

> **Purpose**: Live workshop demo app for "Building on Solana with AI Agents." Built with Anchor + Next.js, deployed to devnet. Audience members connect Phantom wallets and participate in real-time voting and quizzes.

---

## 1. Product Overview

### What this is
A gamified on-chain voting and quiz platform where a presenter creates voting rounds and quiz questions, and audience members vote/answer using their devnet wallets. Results update in real-time. Each interaction is an on-chain transaction, demonstrating core Solana concepts while being fun and interactive.

### Who uses it
- **Presenter**: Creates sessions, adds voting rounds and quiz questions, controls timers, displays results
- **Audience**: Connects Phantom wallet (devnet), votes, answers quizzes, sees live results

### Key constraints
- Must be buildable via vibe-coding in 30–45 minutes during a live session
- Must work on Solana devnet with Phantom wallet
- Frontend and Anchor program are **separate projects** (security best practice)
- The Anchor program repo is the source of truth for on-chain logic; the frontend consumes the generated IDL

---

## 2. Architecture

### Repository structure

```
solana-vote/
├── programs/                    # Anchor workspace (separate deploy)
│   └── solana-vote/
│       └── src/
│           └── lib.rs           # All program logic
├── app/                         # Next.js frontend (scaffolded from create-solana-dapp)
│   ├── src/
│   │   ├── app/                 # Next.js app router pages
│   │   ├── components/          # React components
│   │   │   ├── VotingRound.tsx
│   │   │   ├── QuizRound.tsx
│   │   │   ├── Timer.tsx
│   │   │   ├── ResultsDisplay.tsx
│   │   │   ├── PresenterDashboard.tsx
│   │   │   └── AudienceView.tsx
│   │   └── hooks/
│   │       └── useSolanaVote.ts # Anchor client hook
│   └── public/
├── tests/                       # Anchor integration tests
│   └── solana-vote.ts
├── Anchor.toml
└── README.md
```

### Tech stack

| Layer | Technology | Version / Notes |
|-------|-----------|----------------|
| On-chain program | Rust + Anchor | Anchor 0.32.x |
| Client SDK | @solana/web3.js v1 | Legacy API — simpler for demo, Anchor TS client uses it |
| Frontend | Next.js 14 + React 18 | App router |
| Wallet connection | @solana/wallet-adapter-react | With Phantom adapter |
| Styling | Tailwind CSS | Included in create-solana-dapp template |
| Deployment | Devnet | `solana config set --url devnet` |

---

## 3. On-Chain Program Specification (Anchor/Rust)

### CRITICAL: Solana-Specific Rules (NOT Ethereum)

> **These rules MUST be followed. Violating them produces code that compiles but fails at runtime.**

1. **Solana programs are stateless.** All state lives in separate accounts passed to instructions. There is no `msg.sender` or contract storage.
2. **Use `u64` for all numeric values.** Never use `f64` or `f32` — floating point is non-deterministic on Solana's BPF runtime.
3. **Use `Pubkey` for all addresses.** Not `address`, not `string`, not `bytes20`.
4. **PDAs (Program Derived Addresses)** are derived with `seeds` + `bump` in Anchor's `#[account]` constraints. Always store the `bump` in the account struct for reuse.
5. **Accounts must be sized at init time.** Use `space = 8 + ...` where 8 is the Anchor discriminator. Calculate exact byte sizes.
6. **Rent exemption is automatic** with Anchor's `init` constraint — don't manually calculate rent.
7. **Signer validation is mandatory.** Every instruction that modifies state must validate the signer. Anchor's `Signer<'info>` type handles this.
8. **No global state.** Each "session" is its own PDA account. No singleton patterns.
9. **CPI (Cross-Program Invocation)** is not needed for this app — we only use SOL transfers via `SystemProgram` if at all.
10. **Transaction size limit is 1,232 bytes.** Keep instruction data small. String fields should have bounded lengths.

### Account Structures

```rust
// 8 (discriminator) + 32 (authority) + 4+64 (title string) + 1 (session_state) + 1 (bump) + 2 (round_count) = 112 bytes
#[account]
pub struct Session {
    pub authority: Pubkey,           // 32 bytes — presenter's wallet
    pub title: String,               // 4 + max 64 bytes — session title
    pub session_state: SessionState, // 1 byte — enum: Active, Paused, Ended
    pub bump: u8,                    // 1 byte — PDA bump
    pub round_count: u16,            // 2 bytes — total rounds created
}

// 8 + 32 + 4+128 + 1 + 4+32 + 4+32 + 8 + 8 + 8 + 8 + 1 + 1 + 2 = ~276 bytes
#[account]
pub struct VotingRound {
    pub session: Pubkey,             // 32 bytes — parent session PDA
    pub prompt: String,              // 4 + max 128 bytes — "Cats vs Dogs?"
    pub round_type: RoundType,       // 1 byte — enum: Vote, Quiz
    pub option_a_label: String,      // 4 + max 32 bytes — "Cats"
    pub option_b_label: String,      // 4 + max 32 bytes — "Dogs"
    pub option_a_count: u64,         // 8 bytes
    pub option_b_count: u64,         // 8 bytes
    pub start_time: i64,             // 8 bytes — Unix timestamp
    pub duration_seconds: u64,       // 8 bytes — 0 means no timer
    pub correct_answer: u8,          // 1 byte — 0=none (vote), 1=A, 2=B (quiz)
    pub bump: u8,                    // 1 byte
    pub round_index: u16,            // 2 bytes — which round number
}

// 8 + 32 + 32 + 1 + 1 = 74 bytes
#[account]
pub struct VoteRecord {
    pub voter: Pubkey,               // 32 bytes — voter's wallet
    pub round: Pubkey,               // 32 bytes — which round PDA
    pub choice: u8,                  // 1 byte — 1=A, 2=B
    pub bump: u8,                    // 1 byte
}
```

### Enums

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum SessionState {
    Active,   // 0
    Paused,   // 1
    Ended,    // 2
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum RoundType {
    Vote,     // 0 — fun opinion poll, no correct answer
    Quiz,     // 1 — knowledge check, has a correct answer
}
```

### Instructions

#### `create_session`
- **Signer**: Presenter wallet
- **Creates**: `Session` PDA with seeds `[b"session", authority.key().as_ref(), title.as_bytes()]`
- **Args**: `title: String`
- **Validation**: Title max 64 bytes, authority == signer

#### `create_round`
- **Signer**: Presenter wallet (must match `session.authority`)
- **Creates**: `VotingRound` PDA with seeds `[b"round", session.key().as_ref(), &session.round_count.to_le_bytes()]`
- **Args**: `prompt: String`, `option_a_label: String`, `option_b_label: String`, `round_type: RoundType`, `duration_seconds: u64`, `correct_answer: u8`
- **Validation**: Prompt max 128 bytes, labels max 32 bytes each, correct_answer must be 0 for Vote type, 1 or 2 for Quiz type
- **Side effect**: Increment `session.round_count`

#### `cast_vote`
- **Signer**: Voter wallet (audience member)
- **Creates**: `VoteRecord` PDA with seeds `[b"vote", round.key().as_ref(), voter.key().as_ref()]`
- **Mutates**: `VotingRound` (increment option_a_count or option_b_count)
- **Args**: `choice: u8` (1 = Option A, 2 = Option B)
- **Validation**:
  - Choice must be 1 or 2
  - `VoteRecord` PDA creation ensures one vote per wallet per round (duplicate vote = transaction fails because account already exists)
  - If `round.duration_seconds > 0`, check `Clock::get()?.unix_timestamp <= round.start_time + round.duration_seconds as i64`

#### `close_session` (optional, nice-to-have)
- **Signer**: Presenter wallet
- **Mutates**: `Session` → sets `session_state = Ended`

### Error Codes

```rust
#[error_code]
pub enum VoteError {
    #[msg("Invalid vote choice. Must be 1 (Option A) or 2 (Option B).")]
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
    #[msg("Quiz rounds must specify a correct answer (1 or 2).")]
    QuizNeedsAnswer,
}
```

---

## 4. Frontend Specification

### Scaffolding

Start with:
```bash
npx create-solana-dapp@latest
# Choose: Next.js + Tailwind + Anchor
# App name: solana-vote
```

This generates a working project with wallet connection, cluster switching, and Anchor client setup already wired.

### Pages / Routes

#### `/` — Landing / Audience Join Page
- Large session title display
- "Connect Wallet" button (Phantom)
- After connecting: show current active round
- If no active round: "Waiting for presenter to start a round..."

#### `/presenter` — Presenter Dashboard (protected by wallet check)
- Create Session form (title input)
- Create Round form:
  - Prompt text input
  - Option A label, Option B label
  - Round type toggle: Vote / Quiz
  - If Quiz: select correct answer (A or B)
  - Timer duration dropdown: None, 15s, 30s, 60s
- Active round display with live vote counts
- Round history list
- QR code generator (show URL for audience to scan)

### Components

#### `<VotingRound />`
- Shows prompt text prominently
- Two large, tappable vote buttons (Option A / Option B)
- After voting: buttons disable, show "Vote recorded!" with choice highlighted
- Live count display (poll results bar chart or progress bars)
- If Quiz type: after timer ends or presenter reveals, show correct answer with green/red highlight

#### `<Timer />`
- Countdown timer (circular or bar)
- When timer hits 0: disable voting buttons, show "Time's up!"
- Uses `round.start_time + round.duration_seconds` vs current time
- Client-side countdown synced to on-chain `start_time`

#### `<ResultsDisplay />`
- Animated bar chart or progress bars showing Option A vs Option B
- Percentage and raw count
- For Quiz rounds: show "Correct answer: X" with percentage who got it right
- Auto-refreshes by polling the round account every 2–3 seconds (or use websocket subscription)

#### `<QRCode />`
- Generate QR code pointing to the app URL with session PDA as query param
- Use `qrcode.react` or similar library
- Display prominently for audience to scan

### Real-Time Updates

Use `connection.onAccountChange()` to subscribe to the `VotingRound` account:

```typescript
connection.onAccountChange(roundPDA, (accountInfo) => {
  const decoded = program.coder.accounts.decode('VotingRound', accountInfo.data);
  setRound(decoded);
});
```

This gives near-instant updates as votes come in — no polling needed. Listeners should be cleaned up when the component unmounts.

### Wallet Handling

- Use `@solana/wallet-adapter-react` with `WalletMultiButton`
- Auto-detect if wallet is on devnet; if not, show a banner: "Please switch to Devnet in Phantom settings"
- Handle wallet disconnection gracefully
- The `useAnchorWallet()` hook provides the wallet for Anchor program calls

### UI/UX Guidelines

- **Mobile-first**: Audience will be on phones scanning the QR code
- Large touch targets for vote buttons (min 48px)
- High contrast colors for Option A vs Option B
- Animated transitions when votes come in
- Celebration animation when vote is confirmed on-chain (confetti or pulse)
- Dark theme preferred (matches Solana branding)
- Show Solana Explorer links for each transaction so audience can inspect on-chain

---

## 5. Workshop Rounds — Pre-Planned Content

These are the rounds the presenter will create live. Have them ready to copy-paste:

### Round 1: Icebreaker Vote
- **Type**: Vote
- **Prompt**: "Tabs or Spaces?"
- **Option A**: "Tabs"
- **Option B**: "Spaces"
- **Timer**: 30 seconds
- **Purpose**: Get everyone connected and voting. Low stakes, fun.

### Round 2: Opinion Poll
- **Type**: Vote
- **Prompt**: "Which blockchain will have the most developers in 2027?"
- **Option A**: "Solana"
- **Option B**: "Ethereum"
- **Timer**: 30 seconds
- **Purpose**: Engagement, gets audience thinking about ecosystem.

### Round 3: Knowledge Quiz
- **Type**: Quiz
- **Prompt**: "On Solana, where does a program store its data?"
- **Option A**: "In separate accounts"
- **Option B**: "Inside the program itself"
- **Correct**: A (Option A)
- **Timer**: 15 seconds
- **Purpose**: Test understanding of the accounts model you just explained.

### Round 4: Knowledge Quiz
- **Type**: Quiz
- **Prompt**: "What is a PDA?"
- **Option A**: "An address with no private key, derived from seeds"
- **Option B**: "A wallet owned by the program deployer"
- **Correct**: A (Option A)
- **Timer**: 15 seconds
- **Purpose**: Reinforce PDA concept from the live coding.

### Round 5: Final Fun Vote
- **Type**: Vote
- **Prompt**: "Would you vibe-code a production app?"
- **Option A**: "Yes, ship it!"
- **Option B**: "No way, review everything"
- **Timer**: 30 seconds
- **Purpose**: Closing engagement, sparks discussion.

---

## 6. Development Workflow

### Phase 1: Scaffold (5 min)
```bash
npx create-solana-dapp@latest
cd solana-vote
```

### Phase 2: Write the Anchor program (15–20 min)
1. Define account structs in `programs/solana-vote/src/lib.rs`
2. Implement `create_session` instruction
3. Implement `create_round` instruction
4. Implement `cast_vote` instruction with PDA-based duplicate prevention
5. Add error codes
6. `anchor build` — fix any compile errors
7. `anchor deploy` — deploy to devnet
8. Copy the IDL from `target/idl/solana_vote.json` to the frontend

### Phase 3: Build the frontend (15–20 min)
1. Wire up the Anchor client using the generated IDL
2. Build the `<VotingRound />` component
3. Build the `<Timer />` component
4. Build the `<ResultsDisplay />` with account subscription
5. Build the presenter dashboard
6. Add QR code generation
7. Test locally against devnet

### Phase 4: Live audience interaction (10 min)
1. Display QR code
2. Audience connects and votes
3. Show Solana Explorer for transactions
4. Run through all 5 rounds

---

## 7. Testing Strategy

### Anchor integration tests (`tests/solana-vote.ts`)

Test the following scenarios:

1. **Create session**: Verify session PDA is created with correct authority and title
2. **Create voting round**: Verify round PDA with correct prompt, labels, and initial counts of 0
3. **Create quiz round**: Verify correct_answer is stored
4. **Cast vote**: Verify option count increments and VoteRecord PDA is created
5. **Duplicate vote prevention**: Attempt to vote twice from same wallet — should fail with "already in use" error
6. **Timer expiry**: Create round with 1-second duration, wait 2 seconds, attempt vote — should fail with RoundExpired
7. **Invalid choice**: Pass choice=3 — should fail with InvalidChoice
8. **Unauthorized round creation**: Non-authority wallet tries to create round — should fail

Run with:
```bash
anchor test
```

---

## 8. Common Mistakes to Explicitly Avoid

> **These are patterns AI coding agents frequently get wrong when generating Solana code. Review generated code for these.**

| Mistake | What happens | Fix |
|---------|-------------|-----|
| Using `f64` for amounts | Non-deterministic on BPF, tx will fail | Use `u64` everywhere |
| Missing signer validation | Anyone can call privileged instructions | Use `Signer<'info>` + `has_one = authority` |
| Hardcoded account sizes | Account init fails or wastes SOL | Calculate exact: `8 + field_sizes` |
| Using `String` without max length | Account size unknown at init | Use `#[max_len(64)]` or calculate `4 + max_bytes` |
| Assuming sequential execution | Race conditions in vote counts | Solana handles this — each tx locks accounts |
| Using `msg!()` excessively | Eats compute units | Use sparingly, only for debugging |
| Not storing PDA bump | Recomputing bump wastes CU | Store in account struct, use `bump = account.bump` |
| Ethereum-style `msg.sender` | Doesn't exist on Solana | Use `ctx.accounts.signer.key()` |
| Contract-owned storage pattern | Not how Solana works | State lives in separate accounts, not in the program |
| Using `clock.slot` for time | Slots aren't wall-clock time | Use `Clock::get()?.unix_timestamp` |

---

## 9. Prompt for the AI Coding Agent

> **Copy this entire section and give it to Claude Code / Cursor / Sonnet 4.5 as the initial prompt.**

---

### PROMPT START

You are building a Solana on-chain voting and quiz app called "SolanaVote" for a live workshop demo. This app runs on Solana devnet. The audience connects Phantom wallets and votes/answers in real-time.

**CRITICAL CONTEXT — READ FIRST:**
- This is a SOLANA application, NOT Ethereum. Solana's programming model is fundamentally different.
- Programs are stateless. All data lives in separate accounts.
- There is no `msg.sender`, no contract storage, no `mapping`.
- Use `u64` for ALL numeric values. NEVER use `f64` or `f32`.
- Every account needs exact size calculation at init: `space = 8 (discriminator) + field_sizes`.
- PDAs are derived from seeds + program ID. Always store the bump.
- One vote per wallet per round is enforced by PDA uniqueness (seeds include voter pubkey).

**Tech stack:**
- Anchor 0.32.x for the on-chain program (Rust)
- Next.js 14 with App Router for frontend
- @solana/wallet-adapter-react for wallet connection
- @solana/web3.js v1 (used by Anchor TS client)
- Tailwind CSS for styling
- TypeScript throughout the frontend

**What to build:**

1. **Anchor Program** (`programs/solana-vote/src/lib.rs`):

   Account structs:
   - `Session`: authority (Pubkey), title (String max 64), session_state (enum: Active/Paused/Ended), bump (u8), round_count (u16). PDA seeds: `[b"session", authority.key().as_ref(), title.as_bytes()]`
   - `VotingRound`: session (Pubkey), prompt (String max 128), round_type (enum: Vote/Quiz), option_a_label (String max 32), option_b_label (String max 32), option_a_count (u64), option_b_count (u64), start_time (i64), duration_seconds (u64), correct_answer (u8), bump (u8), round_index (u16). PDA seeds: `[b"round", session.key().as_ref(), &session.round_count.to_le_bytes()]`
   - `VoteRecord`: voter (Pubkey), round (Pubkey), choice (u8), bump (u8). PDA seeds: `[b"vote", round.key().as_ref(), voter.key().as_ref()]`

   Instructions:
   - `create_session(title: String)` — creates Session PDA, authority = signer
   - `create_round(prompt, option_a_label, option_b_label, round_type, duration_seconds, correct_answer)` — creates VotingRound PDA, validates authority, increments round_count, sets start_time from Clock
   - `cast_vote(choice: u8)` — creates VoteRecord PDA (enforces one vote per wallet), increments the chosen option's count, validates choice is 1 or 2, checks timer if duration > 0

   Error codes: InvalidChoice, RoundExpired, SessionNotActive, Unauthorized, TitleTooLong, PromptTooLong, LabelTooLong, QuizNeedsAnswer

2. **Frontend** (in `app/` directory):

   Pages:
   - `/` — Audience view: connect wallet, see current round, vote, see results
   - `/presenter` — Create sessions, create rounds (vote/quiz), set timers, view live results, generate QR code

   Components:
   - VotingRound: prompt display, two large vote buttons, disables after voting, shows confirmation
   - Timer: countdown from duration_seconds, disables voting at 0
   - ResultsDisplay: animated bars showing vote counts, updates via `connection.onAccountChange()`
   - QR code for audience to join (use `qrcode.react` package)

   Requirements:
   - Mobile-first responsive design (audience is on phones)
   - Dark theme
   - Large touch targets (min 48px)
   - Show Solana Explorer links for transactions
   - For Quiz rounds: reveal correct answer after timer ends, highlight in green

3. **Tests** (`tests/solana-vote.ts`):
   - Create session, create round, cast vote, verify counts
   - Test duplicate vote prevention (same wallet votes twice → tx should fail)
   - Test timer expiry
   - Test invalid choice rejection
   - Test unauthorized round creation rejection

**Start by scaffolding with `npx create-solana-dapp@latest`, then implement the Anchor program first, then the frontend.**

**Do NOT:**
- Use floating point types (f64, f32) anywhere in the program
- Assume Ethereum-style contract storage
- Use `String` without calculating max length in space
- Forget signer validation on create_session and create_round
- Use `clock.slot` for time checks — use `Clock::get()?.unix_timestamp`
- Install unnecessary dependencies

### PROMPT END

---

## 10. Acceptance Criteria

- [ ] Presenter can create a session with a title
- [ ] Presenter can create Vote rounds with two options and optional timer
- [ ] Presenter can create Quiz rounds with a correct answer and timer
- [ ] Audience can connect Phantom wallet on devnet
- [ ] Audience can cast one vote per round (duplicate prevented by PDA)
- [ ] Vote counts update in real-time via account subscription
- [ ] Timer counts down and disables voting when expired
- [ ] Quiz rounds reveal the correct answer after timer ends
- [ ] QR code is generated for audience to join
- [ ] Transaction links to Solana Explorer are shown
- [ ] Mobile-responsive design works on phones
- [ ] All Anchor tests pass
- [ ] Deployed and functional on devnet

---

*PRD Version 1.0 — April 2026*
