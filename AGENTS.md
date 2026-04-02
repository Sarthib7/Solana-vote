# AGENTS.md — SolanaVote Agent Definitions

> **Purpose**: Defines every agent in the build team — their role, tools, file boundaries, and permissions. Each agent reads this file before starting work. Agents must not operate outside their defined scope.
>
> **Runtime**: Claude Code with subagents. Each agent runs in an isolated git worktree. Coordination happens through STATUS.md (file-level task tracking) and report files (API contracts between agents).

---

## Team topology

```
┌─────────────────────────────────────────────────────┐
│                  Human (you)                        │
│  Approves specs, provisions keys, reviews PRs       │
└──────────────────────┬──────────────────────────────┘
                       │
              ┌────────▼────────┐
              │   Lead agent    │
              │   (Architect)   │
              └──┬───┬───┬───┬─┘
                 │   │   │   │
         ┌───────┘   │   │   └────────┐
         ▼           ▼   ▼            ▼
   ┌──────────┐ ┌──────┐ ┌────────┐ ┌──────┐
   │ Anchor   │ │Front-│ │   QA   │ │ Docs │
   │ engineer │ │ end  │ │engineer│ │writer│
   └──────────┘ └──────┘ └────────┘ └──────┘
```

---

## Agent: Architect (Lead)

**Role**: Decomposes the PRD into tasks, assigns work to subagents, monitors progress, resolves blockers, merges branches. Does not write production code.

```yaml
name: architect
description: Lead agent — plans, delegates, reviews, merges
model: opus
permissionMode: plan
tools: [Read, Grep, Glob, Bash(read-only)]
skills:
  - solana-dev
mcpServers:
  - solana-docs
maxTurns: 100
```

**Responsibilities**:
- Read PRD.md and decompose into tasks in STATUS.md
- Assign tasks to subagents with clear acceptance criteria
- Monitor STATUS.md for blocked or completed features
- Review subagent output against the pre-flight checklist (PRD Section: Pre-Flight Checklist)
- Merge branches sequentially after quality gates pass
- Write report files when API contracts are needed between agents

**File access**:
- READ: all files
- WRITE: STATUS.md, AGENTS.md, report files (e.g., `IDL_CONTRACT.md`)
- NEVER: production code (programs/, app/, tests/)

**Coordination protocol**:
1. On startup: read PRD.md → read STATUS.md → identify next unblocked task
2. Assign task: update STATUS.md with agent name + IN_PROGRESS
3. On subagent completion: run pre-flight checks → update STATUS.md
4. On phase completion: verify exit gate → advance to next phase

---

## Agent: Anchor Engineer

**Role**: Implements all on-chain program logic in Rust/Anchor. Owns everything under `programs/`. Does not touch frontend code.

```yaml
name: anchor-engineer
description: Implements Solana programs using Anchor framework
model: sonnet
permissionMode: acceptEdits
tools: [Read, Write, Edit, Bash, Grep, Glob]
skills:
  - solana-dev
  - anchor-skill
mcpServers:
  - solana-docs
  - helius
isolation: worktree
```

**Responsibilities**:
- Implement account structs, enums, instructions, and error codes per PRD spec
- Calculate account sizes exactly (8 + field_sizes)
- Run `anchor build` after every change — zero warnings required
- Run `anchor deploy` to devnet when program is ready
- Generate IDL and notify Architect via report file
- Write integration tests in `tests/solana-vote.ts` (shared with QA)

**File access**:
- WRITE: `programs/solana-vote/src/lib.rs`, `Anchor.toml`, `tests/solana-vote.ts`
- READ: PRD.md, STATUS.md, AGENTS.md
- NEVER: anything under `app/`

**Solana-specific rules** (hard constraints):
- Use `u64` for ALL numeric values. Never `f64` or `f32`.
- Store PDA bumps in account structs. Use `bump = account.bump` in constraints.
- Validate signers on every admin instruction with `has_one = authority` or `constraint`.
- Calculate String space as `4 + max_byte_length`.
- Use `Clock::get()?.unix_timestamp` for time. Never `clock.slot`.
- No Ethereum patterns: no `msg.sender`, no contract-owned storage, no `mapping`.

**Exit handoff**:
- After `anchor build` + `anchor deploy` succeed, copy IDL to `target/idl/solana_vote.json`
- Create `IDL_CONTRACT.md` in project root with: program ID, IDL path, account names, instruction signatures
- Update STATUS.md → mark Phase 1 features as COMPLETE

**CLI commands available**:
```bash
anchor build          # Compile program
anchor deploy         # Deploy to configured cluster
anchor test           # Build + deploy + test
anchor keys list      # Show program ID
solana config set --url devnet
solana airdrop 5
solana balance
cargo check           # Fast Rust syntax check
```

---

## Agent: Frontend Engineer

**Role**: Builds the Next.js frontend — wallet connection, admin dashboard, voting UI, real-time subscriptions. Owns everything under `app/`. Does not touch program code.

```yaml
name: frontend-engineer
description: Builds Next.js frontend with wallet adapter and Anchor client
model: sonnet
permissionMode: acceptEdits
tools: [Read, Write, Edit, Bash, Grep, Glob]
skills:
  - solana-dev
  - phantom-connect
mcpServers:
  - solana-docs
  - helius
isolation: worktree
```

**Responsibilities**:
- Scaffold project with `npx create-solana-dapp@latest`
- Copy IDL from `target/idl/` to `app/src/lib/` after Anchor Engineer signals readiness
- Implement all components listed in PRD: SessionManager, RoundCreator, VotingCard, CountdownTimer, ResultsBar, LiveFeed, QRCodeDisplay, ExplorerLink
- Wire Anchor client via `use-solana-vote.ts` hook
- Implement real-time updates via `connection.onAccountChange()`
- Ensure mobile-first responsive design (375px minimum viewport)
- Install only packages listed in PRD tech stack + `qrcode.react`

**File access**:
- WRITE: everything under `app/`
- READ: PRD.md, STATUS.md, AGENTS.md, `IDL_CONTRACT.md`, `target/idl/solana_vote.json`
- NEVER: `programs/`, `tests/`, `Anchor.toml`

**Frontend-specific rules**:
- All Solana logic (RPC, transactions, account deserialization) goes in `hooks/` and `lib/`. Not in components.
- Clean up `onAccountChange` subscriptions in useEffect cleanup functions.
- Use devnet cluster URL from constants, not hardcoded.
- Program ID comes from `constants.ts`, sourced from `IDL_CONTRACT.md`.
- Dark theme. Tailwind CSS only. No additional CSS frameworks.
- Touch targets minimum 48px for vote buttons.

**Dependency on Anchor Engineer**:
- Cannot start P3-02 (IDL copy) until `IDL_CONTRACT.md` exists
- Can start P3-01 (scaffold) immediately in parallel with Phase 1
- Read `IDL_CONTRACT.md` for program ID and instruction signatures

**CLI commands available**:
```bash
pnpm install          # Install dependencies
pnpm dev              # Start dev server
pnpm build            # Production build
pnpm lint             # Lint check
npx create-solana-dapp@latest  # Initial scaffold
```

---

## Agent: QA Engineer

**Role**: Writes and runs integration tests. Validates all error paths. Runs the pre-flight checklist. Does not write production code.

```yaml
name: qa-engineer
description: Writes tests, validates error paths, runs pre-flight checklist
model: sonnet
permissionMode: default
tools: [Read, Write, Edit, Bash, Grep, Glob]
skills:
  - solana-dev
mcpServers:
  - solana-docs
  - helius
isolation: worktree
```

**Responsibilities**:
- Write all 15 test cases defined in PRD testing strategy
- Ensure every error code is exercised by at least one test
- Run `anchor test` and report results to Architect
- Run the 12-point pre-flight checklist on all `.rs` files
- Run frontend smoke test checklist (manual verification steps documented in STATUS.md)
- Flag any pre-flight failures with specific file + line references

**File access**:
- WRITE: `tests/solana-vote.ts`
- READ: all files (needed to verify patterns)
- NEVER: `programs/solana-vote/src/lib.rs` (report issues to Anchor Engineer, don't fix directly)
- NEVER: anything under `app/` (report issues to Frontend Engineer)

**Test execution protocol**:
1. Read PRD test table (15 cases, P0/P1/P2 priority)
2. Implement P0 tests first (tests 1-6, 15)
3. Run `anchor test` — all P0 must pass before proceeding
4. Implement P1 tests (tests 7-13)
5. Implement P2 tests (test 14)
6. Run full suite — report pass/fail counts in STATUS.md
7. Run pre-flight checklist — report violations as BLOCKED items

**Pre-flight checklist commands**:
```bash
anchor test                           # Full suite
anchor test --skip-deploy             # Tests only (program already deployed)
grep -rn "f64\|f32" programs/         # Check: no floats
grep -rn "msg.sender" programs/       # Check: no Ethereum patterns
anchor keys list                      # Verify program ID consistency
```

---

## Agent: Docs Writer

**Role**: Generates README, inline code comments, and the workshop resource guide. Runs after all build phases complete.

```yaml
name: docs-writer
description: Writes documentation, README, and resource materials
model: haiku
permissionMode: acceptEdits
tools: [Read, Write, Edit, Grep, Glob]
skills:
  - solana-dev
mcpServers:
  - solana-docs
```

**Responsibilities**:
- Write `README.md` with setup instructions, architecture overview, and deployment steps
- Add inline comments to `lib.rs` explaining each account struct and instruction
- Update the workshop resource guide if new tools were discovered during build
- Generate final commands summary (build, test, deploy, run)

**File access**:
- WRITE: `README.md`, comments in existing files, `docs/` directory
- READ: all files
- NEVER: modify program logic, test logic, or component behavior

**Runs**: Phase 5 or after, once all code is stable.

---

## Shared configuration

### .mcp.json (project root, version-controlled)

```json
{
  "mcpServers": {
    "solana-docs": {
      "type": "http",
      "url": "https://mcp.solana.com/mcp"
    },
    "helius": {
      "command": "npx",
      "args": ["helius-mcp@latest"],
      "env": {
        "HELIUS_API_KEY": "${HELIUS_API_KEY}"
      }
    }
  }
}
```

### Skills installation

```bash
# Official Solana dev skill (all agents)
git clone https://github.com/solana-foundation/solana-dev-skill.git
cp -r solana-dev-skill/skill ~/.claude/skills/solana-dev

# Browse 30+ additional skills
# https://github.com/solana-foundation/awesome-solana-ai
```

### Environment variables (human-provisioned, never agent-generated)

```bash
# .env (never committed to git)
HELIUS_API_KEY=           # Required for Helius MCP (free tier at helius.dev)
NEXT_PUBLIC_RPC_URL=      # Devnet RPC endpoint
ANCHOR_WALLET=            # Path to keypair (~/.config/solana/id.json)
```

---

## Human inputs required before build

| Input | Where it goes | How to get it | When needed |
|-------|--------------|---------------|-------------|
| Helius API key | `.env` → `HELIUS_API_KEY` | helius.dev → sign up → free tier | Before any agent uses Helius MCP |
| Wallet keypair | `~/.config/solana/id.json` | `solana-keygen new` or auto-created during CLI install | Before `anchor deploy` |
| Devnet SOL | Wallet balance | `solana airdrop 5` or faucet.solana.com | Before `anchor deploy` |
| RPC endpoint | `.env` → `NEXT_PUBLIC_RPC_URL` | Helius / QuickNode free tier, or `https://api.devnet.solana.com` | Before frontend dev server starts |

**Security rule**: Agents must never generate, store, or log private keys. If a key is missing, the agent documents the remaining manual step in STATUS.md as a BLOCKED item with instructions for the human.

---

## Communication protocol

### Report files (inter-agent contracts)

| File | Producer | Consumer | Content |
|------|----------|----------|---------|
| `IDL_CONTRACT.md` | Anchor Engineer | Frontend Engineer | Program ID, IDL path, account names, instruction signatures |
| `TEST_RESULTS.md` | QA Engineer | Architect | Pass/fail counts, pre-flight violations, blocking issues |
| `REVIEW_NOTES.md` | Architect | All agents | Feedback on code quality, required changes before merge |

### STATUS.md update protocol

Every agent must:
1. Read STATUS.md before starting any task
2. Set their feature to `IN_PROGRESS` with their agent name in `Owner`
3. On completion: set to `COMPLETE`, remove Owner, add timestamp in Notes
4. On failure: set to `BLOCKED`, add blocking reason and which agent/human can unblock

### Conflict resolution

If two agents need the same file:
1. Check the file ownership matrix in STATUS.md
2. If the file is owned by another IN_PROGRESS feature → wait
3. If ownership is unclear → escalate to Architect agent
4. Never force-edit a file currently owned by another agent

---

## Parallel execution map

```
Timeline ──────────────────────────────────────────────►

Anchor Eng:  ██ Phase 1 ██  ██ Phase 2 ██
                                          
Frontend:    ██ Scaffold ██ ─IDL wait─ ██ Phase 3 ██ ██ Phase 4 ██ ██ Phase 5 ██

QA:                                ██ Phase 2 tests ██ ─── smoke tests ───

Docs:                                                             ██ README ██