# STATUS.md — SolanaVote Feature Tracker

> **Purpose**: Single source of truth for development progress. Agents must read this file before starting work and update it after completing any task. This prevents file collisions when multiple agents work in parallel.
>
> **Rule**: Only one agent works on a given feature at a time. Check the `Owner` column. If a feature shows `[LOCKED]`, do not touch its files until the lock is released.

---

## Phase Overview

| Phase | Name | Status | Dependencies | Files Owned |
|-------|------|--------|-------------|-------------|
| 1 | Program Core | `NOT_STARTED` | None | `programs/solana-vote/src/lib.rs`, `Anchor.toml` |
| 2 | Program Hardening | `NOT_STARTED` | Phase 1 complete | `programs/solana-vote/src/lib.rs` (additive), `tests/solana-vote.ts` |
| 3 | Frontend — Wallet + Admin | `NOT_STARTED` | Phase 1 IDL generated | `app/src/**` (admin route, hooks, lib) |
| 4 | Frontend — Voting + Real-Time | `NOT_STARTED` | Phase 3 complete | `app/src/components/`, `app/src/hooks/` |
| 5 | Polish + Quiz Logic | `NOT_STARTED` | Phase 4 complete | `app/src/components/` (modifications only) |

**Valid statuses**: `NOT_STARTED` → `IN_PROGRESS` → `REVIEW` → `COMPLETE` → `BLOCKED`

---

## Feature Breakdown

### Phase 1: Program Core

| Feature ID | Feature | Status | Owner | Files | Confidence | Notes |
|-----------|---------|--------|-------|-------|------------|-------|
| P1-01 | Account structs (Session, VotingRound, VoteRecord) | `NOT_STARTED` | — | `lib.rs` | High | Byte sizes pre-calculated in PRD. Verify arithmetic. |
| P1-02 | Enums (SessionState, RoundType) | `NOT_STARTED` | — | `lib.rs` | High | 2 simple enums, 1 byte each. |
| P1-03 | Error codes (VoteError) | `NOT_STARTED` | — | `lib.rs` | High | 10 error variants. Straight from PRD. |
| P1-04 | Instruction: create_session | `NOT_STARTED` | — | `lib.rs` | High | Standard PDA init + signer check. |
| P1-05 | Instruction: create_round | `NOT_STARTED` | — | `lib.rs` | High | PDA init + authority check + Clock sysvar. |
| P1-06 | Instruction: cast_vote | `NOT_STARTED` | — | `lib.rs` | High | PDA init (duplicate prevention) + count increment + timer check. |
| P1-07 | Build + Deploy | `NOT_STARTED` | — | `Anchor.toml` | High | `anchor build && anchor deploy`. Record program ID. |

**Phase 1 exit gate**:
- [ ] `anchor build` — zero warnings
- [ ] `anchor deploy` — succeeds on devnet
- [ ] Program ID recorded in Anchor.toml, lib.rs declare_id!()
- [ ] Pre-flight checks 1–8 pass (see PRD)

---

### Phase 2: Program Hardening

| Feature ID | Feature | Status | Owner | Files | Confidence | Notes |
|-----------|---------|--------|-------|-------|------------|-------|
| P2-01 | Instruction: close_round | `NOT_STARTED` | — | `lib.rs` | High | Set is_active = false. Authority check. |
| P2-02 | Instruction: close_session | `NOT_STARTED` | — | `lib.rs` | High | Set session_state = Ended. Authority check. |
| P2-03 | Tests 1–6 (happy path + duplicate) | `NOT_STARTED` | — | `tests/solana-vote.ts` | High | Core flow: create → vote → duplicate fail. |
| P2-04 | Tests 7–12 (validation errors) | `NOT_STARTED` | — | `tests/solana-vote.ts` | High | Each error code gets a test. |
| P2-05 | Tests 13–15 (close + multi-voter) | `NOT_STARTED` | — | `tests/solana-vote.ts` | Medium | Timer test may need sleep(). |

**Phase 2 exit gate**:
- [ ] All 15 tests pass via `anchor test`
- [ ] Every error code exercised by ≥1 test
- [ ] No `.skip()` or commented-out tests
- [ ] Pre-flight checks 1–8 re-verified

---

### Phase 3: Frontend — Wallet + Admin

| Feature ID | Feature | Status | Owner | Files | Confidence | Notes |
|-----------|---------|--------|-------|-------|------------|-------|
| P3-01 | Scaffold with create-solana-dapp | `NOT_STARTED` | — | `app/` (entire dir) | High | One command. Accept defaults. |
| P3-02 | Copy IDL + configure constants | `NOT_STARTED` | — | `app/src/lib/constants.ts`, `app/src/lib/solana_vote.json` | High | Copy from target/idl/. Set program ID. |
| P3-03 | Anchor client hook (use-solana-vote) | `NOT_STARTED` | — | `app/src/hooks/use-solana-vote.ts` | High | Standard AnchorProvider + Program setup. |
| P3-04 | TypeScript types | `NOT_STARTED` | — | `app/src/lib/types.ts` | High | Mirror account structs for frontend. |
| P3-05 | SessionManager component | `NOT_STARTED` | — | `app/src/components/session-manager.tsx` | High | Create session form + display. |
| P3-06 | RoundCreator component | `NOT_STARTED` | — | `app/src/components/round-creator.tsx` | Medium-High | Vote/Quiz toggle, timer select, correct answer. |
| P3-07 | Admin page assembly | `NOT_STARTED` | — | `app/src/app/admin/page.tsx` | High | Wire SessionManager + RoundCreator. |

**Phase 3 exit gate**:
- [ ] Wallet connects to devnet via Phantom
- [ ] Session creation tx confirms on Explorer
- [ ] Round creation tx confirms on Explorer (both Vote and Quiz types)
- [ ] Admin page renders without console errors
- [ ] Pre-flight checks 10–12 pass

---

### Phase 4: Frontend — Voting + Real-Time

| Feature ID | Feature | Status | Owner | Files | Confidence | Notes |
|-----------|---------|--------|-------|-------|------------|-------|
| P4-01 | VotingCard component | `NOT_STARTED` | — | `app/src/components/voting-card.tsx` | High | Two buttons, disable after vote, show confirmation. |
| P4-02 | CountdownTimer component | `NOT_STARTED` | — | `app/src/components/countdown-timer.tsx` | Medium-High | Client-side countdown synced to on-chain start_time. |
| P4-03 | ResultsBar component | `NOT_STARTED` | — | `app/src/components/results-bar.tsx` | High | Animated horizontal bars with percentages. |
| P4-04 | Account subscription hook | `NOT_STARTED` | — | `app/src/hooks/use-round-subscription.ts` | Medium-High | onAccountChange + cleanup. May need polling fallback. |
| P4-05 | QRCodeDisplay component | `NOT_STARTED` | — | `app/src/components/qr-code-display.tsx` | High | Install qrcode.react. Generate URL with session PDA. |
| P4-06 | ExplorerLink component | `NOT_STARTED` | — | `app/src/components/explorer-link.tsx` | High | Format devnet Explorer URLs. |
| P4-07 | Participant page assembly | `NOT_STARTED` | — | `app/src/app/page.tsx` | High | Wire VotingCard + Timer + Results + LiveFeed. |

**Phase 4 exit gate**:
- [ ] Vote cast → tx confirms → buttons disabled → confirmation shown
- [ ] Results update < 2 seconds via WebSocket
- [ ] Timer counts down and disables voting at 0
- [ ] QR code scans to correct URL
- [ ] Explorer links resolve on devnet
- [ ] Mobile viewport (375px) renders correctly

---

### Phase 5: Polish + Quiz Logic

| Feature ID | Feature | Status | Owner | Files | Confidence | Notes |
|-----------|---------|--------|-------|-------|------------|-------|
| P5-01 | Quiz answer reveal UI | `NOT_STARTED` | — | `voting-card.tsx`, `results-bar.tsx` | Medium | Green/red highlight after timer. % correct. |
| P5-02 | Error state handling | `NOT_STARTED` | — | All components | Medium | Friendly messages for all error codes. |
| P5-03 | Loading states | `NOT_STARTED` | — | All components | High | Skeleton screens during tx confirmation. |
| P5-04 | Dark theme finalization | `NOT_STARTED` | — | Tailwind config, components | Medium | Consistent dark palette. High contrast A/B. |
| P5-05 | Mobile optimization pass | `NOT_STARTED` | — | All components | Medium | Test 375px, 390px, 414px viewports. |
| P5-06 | Full smoke test | `NOT_STARTED` | — | — | — | Run full manual checklist from PRD. |

**Phase 5 exit gate**:
- [ ] Full smoke test checklist passes (all items)
- [ ] No console errors in browser dev tools
- [ ] Quiz rounds show correct/incorrect feedback
- [ ] All error states have user-friendly messages
- [ ] Mobile viewports render correctly

---

## File Ownership Matrix

> **Critical rule**: If a file is listed under an active (IN_PROGRESS) feature, no other agent may modify it. This prevents merge conflicts and state corruption.

| File / Directory | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|-----------------|---------|---------|---------|---------|---------|
| `programs/solana-vote/src/lib.rs` | WRITE | WRITE (additive) | — | — | — |
| `Anchor.toml` | WRITE | READ | READ | READ | READ |
| `tests/solana-vote.ts` | — | WRITE | — | — | — |
| `target/idl/solana_vote.json` | OUTPUT | OUTPUT | READ | READ | READ |
| `app/src/lib/` | — | — | WRITE | READ | READ |
| `app/src/hooks/` | — | — | WRITE | WRITE | READ |
| `app/src/components/` | — | — | WRITE | WRITE | WRITE (modify) |
| `app/src/app/page.tsx` | — | — | — | WRITE | WRITE (modify) |
| `app/src/app/admin/page.tsx` | — | — | WRITE | READ | WRITE (modify) |

**Parallel execution opportunities**:
- Phase 1 + Phase 3 (P3-01 scaffold only) can run in parallel — Phase 3 can scaffold while Phase 1 writes the program. Phase 3 pauses at P3-02 until Phase 1 generates the IDL.
- Phase 2 and Phase 3 (P3-03 onward) can run in parallel — they touch different file trees entirely.
- Phase 4 must wait for Phase 3 to complete (it depends on wallet wiring and Anchor client hook).
- Phase 5 must wait for Phase 4 to complete (it modifies Phase 4 components).

---

## Agent Handoff Protocol

When completing a feature:

1. Update this STATUS.md:
   - Change feature status to `COMPLETE`
   - Remove your name from `Owner`
   - Add completion timestamp in Notes (e.g., "Done 2026-04-02T14:30Z")

2. If the phase exit gate is met:
   - Change the phase status in Phase Overview to `REVIEW`
   - Run the pre-flight checklist from the PRD
   - Note any checklist failures in this file

3. If blocked:
   - Change status to `BLOCKED`
   - Add blocking reason in Notes (e.g., "BLOCKED: IDL not yet generated, waiting on P1-07")
   - Do not start dependent features

4. Before starting any feature:
   - Read this STATUS.md first
   - Check file ownership matrix — do not touch files owned by an active agent
   - Set status to `IN_PROGRESS` and add your identifier to `Owner`

---

## Changelog

| Timestamp | Agent | Action |
|-----------|-------|--------|
| 2026-04-02 | — | STATUS.md created. All features NOT_STARTED. |

---

*Tracks PRD v2.0 — April 2026*
