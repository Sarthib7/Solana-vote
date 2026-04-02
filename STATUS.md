# STATUS.md

## Current Snapshot

Last updated: `2026-04-02`

Current release state:

- Browser creator flow: working
- Browser participant flow: working
- Local validator smoke: passing
- Devnet smoke: passing
- Repo build and lint: passing

The repo is no longer in the original scaffold state. Status below reflects the current implemented product, not the older plan.

---

## Phase Overview

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| 1 | On-chain Core | `COMPLETE` | Join-code sessions, dynamic rounds, vote records, close-session implemented |
| 2 | Frontend Product Flow | `COMPLETE` | Landing, creator, join, QR, live updates, multi-wallet modal implemented |
| 3 | Devnet Hardening | `COMPLETE` | Devnet-only RPC, transaction simulation, Phantom devnet prompt, availability route added |
| 4 | Verification | `COMPLETE` | Build, lint, Anchor test, local smoke, devnet smoke all passing |
| 5 | Follow-up Hardening | `IN_PROGRESS` | Formal integration tests and close-round support still open |

---

## Implemented Features

### Backend

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| B1 | `Session` account with join-code PDA | `COMPLETE` | Seeded by `[b"session", join_code]` |
| B2 | `VotingRound` with dynamic options | `COMPLETE` | Supports 2 to 6 options |
| B3 | `VoteRecord` duplicate-vote prevention | `COMPLETE` | One PDA per `(round, voter)` |
| B4 | Session creation | `COMPLETE` | Title and join-code validation enforced |
| B5 | Round creation | `COMPLETE` | Authority and active-session checks enforced |
| B6 | Vote casting | `COMPLETE` | Option bounds and timer checks enforced |
| B7 | Session close | `COMPLETE` | Authority can mark session ended |
| B8 | Local smoke script | `COMPLETE` | `scripts/backend-smoke.cjs` |
| B9 | Devnet deployment match | `COMPLETE` | Live devnet binary aligned with local build |

### Frontend

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| F1 | Landing page | `COMPLETE` | Create or join entry point |
| F2 | Creator dashboard | `COMPLETE` | Create session, publish round, QR/share, history |
| F3 | Join page | `COMPLETE` | Join by link or code, load latest round, vote |
| F4 | Real-time subscriptions | `COMPLETE` | Session and round account listeners |
| F5 | Join code utilities | `COMPLETE` | Join URL parsing and normalization |
| F6 | Devnet-only UI messaging | `COMPLETE` | Visible across key pages |
| F7 | Phantom auto switch to devnet | `COMPLETE` | Prompted after Phantom connect |
| F8 | Multi-wallet connect | `COMPLETE` | Phantom, Solflare, Wallet Standard discovery |
| F9 | Transaction simulation before signing | `COMPLETE` | Create, publish, vote, close-session paths |
| F10 | Probe-safe `/availability` route | `COMPLETE` | Returns `204` |

---

## Verification Matrix

| Check | Status | Notes |
|-------|--------|-------|
| `npm run lint` | `PASS` | Current frontend and docs changes do not break lint |
| `npm run build` | `PASS` | Next.js production build succeeds |
| `cd anchor && NO_DNA=1 anchor test --skip-deploy` | `PASS` | Rust/unit path passes; still emits existing Anchor cfg warnings |
| Local smoke | `PASS` | Create session, create round, cast vote on local validator |
| Devnet smoke | `PASS` | Create session, create round, cast vote against deployed devnet program |

---

## Known Warnings and Limitations

### Open Product Gaps

| ID | Item | Severity | Notes |
|----|------|----------|-------|
| G1 | No `close_round` instruction | `Medium` | Creator cannot stop a round early after publishing |
| G2 | No formal TS Anchor integration suite | `High` | Confidence comes from smoke scripts plus runtime verification |
| G3 | Non-Phantom wallets do not auto-switch cluster | `Medium` | Wallet must already be on devnet |
| G4 | Voting-only product | `Low` | Quiz scoring and answer reveal are future work |

### Non-Blocking Noise

| ID | Item | Severity | Notes |
|----|------|----------|-------|
| N1 | `punycode` deprecation warnings during Next build | `Low` | Comes from dependencies |
| N2 | Anchor `unexpected cfg` warnings | `Low` | Existing toolchain noise, not current blocker |

---

## Backlog

### Priority 1

- Add a real Anchor integration suite under `tests/`
- Cover duplicate vote, invalid option, expired round, unauthorized publish, and ended session cases
- Add `close_round` if creator-controlled shutdown is required

### Priority 2

- Improve wallet-specific devnet guidance for Backpack and other Wallet Standard wallets
- Deploy frontend on Vercel for stable QR demos
- Add richer session lifecycle messaging after `close_session`

### Priority 3

- Explore optional quiz-specific features if the product scope expands again
- Add creator analytics or richer round history if needed

---

## Changelog

| Timestamp | Change |
|-----------|--------|
| 2026-04-02 | Rebased status on the real codebase and live verification results |
| 2026-04-02 | Marked original scaffold-style plan obsolete |
