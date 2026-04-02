# AGENTS.md

## Purpose

This file defines how agents should work in this repository.

The repository already contains a functioning SolanaVote MVP. Agents should treat the current codebase as the baseline and avoid re-introducing stale assumptions from older docs.

Primary source of truth, in order:

1. `anchor/programs/solana-vote/src/lib.rs`
2. `app/lib/hooks/useSolanaVote.ts`
3. `app/creator/page.tsx`
4. `app/join/page.tsx`
5. `PRD.md`
6. `STATUS.md`

---

## Product Context

SolanaVote is currently:

- a devnet-only Solana voting app
- creator-owned through wallet authority
- join-code based, not title-plus-authority seeded
- multi-option voting only, with 2 to 6 options
- shareable by QR code and join link

It is not currently:

- a mainnet app
- a creator-payout app
- a quiz-scoring app
- a two-option-only app

---

## Agent Roles

### Architect

Responsibilities:

- read `PRD.md` and `STATUS.md` before assigning work
- keep `PRD.md`, `STATUS.md`, and `AGENTS.md` aligned with the implementation
- decompose work into backend, frontend, verification, and docs tasks
- avoid coding unless a task is documentation-only

Write scope:

- `PRD.md`
- `STATUS.md`
- `AGENTS.md`
- lightweight report files in project root

### Backend Engineer

Responsibilities:

- own the Anchor program and account model
- keep PDA derivation, validation, and rent semantics correct
- keep the generated IDL in sync with the deployed program
- maintain local and devnet smoke verification

Write scope:

- `anchor/programs/solana-vote/src/lib.rs`
- `anchor/Anchor.toml`
- `anchor/target/idl/solana_vote.json`
- `app/lib/idl.json`
- `scripts/backend-smoke.cjs`

Read scope:

- `PRD.md`
- `STATUS.md`
- `AGENTS.md`
- all frontend files when contract changes are required

### Frontend Engineer

Responsibilities:

- own the Next.js app under `app/`
- keep creator and participant flows functional
- keep the app devnet-only at the client level
- keep wallet connection flexible while preserving devnet constraints
- keep transaction simulation and error messages usable

Write scope:

- everything under `app/`
- frontend-related config files

Read scope:

- `PRD.md`
- `STATUS.md`
- `AGENTS.md`
- `anchor/programs/solana-vote/src/lib.rs`
- `app/lib/idl.json`

### QA / Verification Engineer

Responsibilities:

- run repo verification commands
- run smoke tests on localnet and devnet when relevant
- validate that creator and participant paths still work after changes
- file concrete bugs with file references

Write scope:

- `STATUS.md`
- test files and scripts when explicitly requested

Preferred verification commands:

```bash
npm run lint
npm run build
cd anchor && NO_DNA=1 anchor test --skip-deploy
node scripts/backend-smoke.cjs
SOLANA_RPC_URL=https://api.devnet.solana.com node scripts/backend-smoke.cjs
```

---

## File Ownership

### Backend-owned

- `anchor/programs/solana-vote/src/lib.rs`
- `anchor/Anchor.toml`
- `anchor/target/idl/solana_vote.json`
- `app/lib/idl.json`
- `scripts/backend-smoke.cjs`

### Frontend-owned

- `app/page.tsx`
- `app/creator/page.tsx`
- `app/join/page.tsx`
- `app/presenter/page.tsx`
- `app/components/**`
- `app/lib/hooks/useSolanaVote.ts`
- `app/lib/session-links.ts`
- `app/lib/session-state.ts`

### Docs-owned

- `PRD.md`
- `STATUS.md`
- `AGENTS.md`
- workshop or reference docs in project root

---

## Coordination Rules

1. Read `STATUS.md` before editing.
2. If a file is actively being changed for a task, do not make unrelated edits in that same file.
3. When backend account layouts or instruction signatures change, update both:
   - `anchor/target/idl/solana_vote.json`
   - `app/lib/idl.json`
4. When product behavior changes, update `PRD.md` and `STATUS.md` in the same workstream.
5. Do not describe speculative features as implemented.

---

## Current Verification Standard

No change is complete until the relevant checks pass.

Minimum expectation for normal code changes:

- `npm run lint`
- `npm run build`

Required for backend-affecting changes:

- `cd anchor && NO_DNA=1 anchor test --skip-deploy`
- local smoke or devnet smoke, depending on the change

Required for product-flow changes:

- creator flow sanity check
- join flow sanity check
- live voting sanity check

---

## Current Known Risks

Agents should preserve awareness of these open gaps:

1. There is no full TypeScript Anchor integration suite in `tests/`.
2. There is no `close_round` instruction.
3. Phantom has automatic devnet prompting, but other wallets still depend on user-side devnet selection.
4. The product is devnet-only and should stay that way unless the user explicitly requests a mainnet migration.

---

## Do Not Reintroduce

Do not reintroduce these stale assumptions:

- session PDA seeded by authority plus title
- fixed A/B vote rounds only
- quiz scoring or correct-answer fields as implemented behavior
- `/admin` as the primary creator route
- `app/src/**` as the real frontend layout
- creator payouts during vote transactions

---

## Last Verified

This file was aligned with the implementation on `2026-04-02`.
