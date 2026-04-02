# Building on Solana with AI Agents — Workshop Resource Guide

> Everything you need to continue building after the workshop. Bookmark this doc.

---

## 1. Get Set Up (5 minutes)

### Install the full toolchain (one command)

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
```

This installs: Rust, Solana CLI (Agave), Anchor, Surfpool, Node.js, and Yarn.

### Get a wallet

- **Phantom** (recommended): [phantom.app](https://phantom.app) — Switch to devnet: Settings → Developer Settings → Change Network → Devnet
- **Solflare**: [solflare.com](https://solflare.com)
- **CLI wallet**: Already created during toolchain install at `~/.config/solana/id.json`

### Get devnet SOL

- CLI: `solana airdrop 5`
- Browser: [faucet.solana.com](https://faucet.solana.com) (up to 5 SOL, 2x/hour)
- Backup: [DevnetFaucet.org](https://devnetfaucet.org) (up to 20 SOL with GitHub auth)

### Scaffold your first project

```bash
# Full-stack app (Anchor + Next.js + wallet adapter)
npx create-solana-dapp@latest

# Anchor program only
anchor init my-program
```

---

## 2. The Solana Development Stack

### Smart Contract / On-Chain Program Development

| Tool | What it does | Link |
|------|-------------|------|
| **Rust** | Language for on-chain programs | [rust-lang.org](https://www.rust-lang.org/) |
| **Solana CLI (Agave)** | Build, deploy, airdrop, manage local validator | [docs.solanalabs.com](https://docs.solanalabs.com/cli) |
| **Anchor** | Framework with Rust macros, IDL gen, TS client gen, CLI tooling | [anchor-lang.com](https://www.anchor-lang.com/) · [GitHub](https://github.com/coral-xyz/anchor) |
| **LiteSVM** | Fast in-process Solana VM for unit tests | [GitHub](https://github.com/LiteSVM/litesvm) |
| **Mollusk** | Lightweight SVM test harness for deterministic instruction testing | [GitHub](https://github.com/buffalojoec/mollusk) |
| **solana-test-validator** | Local validator for integration testing (included in CLI) | Built into Solana CLI |
| **Codama** | Code generation from Solana IDL — JS, Rust, Go, Python clients | [GitHub](https://github.com/codama-idl/codama) |
| **solana-verify** | Deterministic builds + on-chain binary verification | [GitHub](https://github.com/Ellipsis-Labs/solana-verifiable-build) |
| **Surfpool** | Mainnet-forking local environment with cheatcodes | [surfpool.run](https://www.surfpool.run/) · [Docs](https://docs.surfpool.run/) |

### Frontend / dApp Development

| Tool | What it does | Link |
|------|-------------|------|
| **@solana/kit** | Modern TS/JS SDK (formerly web3.js v2) — RPC, transactions, accounts | [GitHub](https://github.com/solana-labs/solana-web3.js) |
| **@solana/web3.js v1** | Legacy SDK (still widely used, simpler API) | [npm](https://www.npmjs.com/package/@solana/web3.js) |
| **create-solana-dapp** | Official project scaffolder (Anchor + Next.js templates) | [GitHub](https://github.com/solana-developers/create-solana-dapp) |
| **ConnectorKit** | Wallet connector (Phantom, Solflare, Backpack, etc.) | Built on Wallet Standard |
| **Framework Kit** | React hooks, wallet orchestration, RPC helpers | Solana Foundation repos |
| **Solana Pay** | Payment links, QR flows, checkout experiences | [GitHub](https://github.com/solana-labs/solana-pay) |

### Browser-Based (Zero Install)

| Tool | What it does | Link |
|------|-------------|------|
| **Solana Playground** | Full browser IDE — write, build, deploy Anchor programs | [beta.solpg.io](https://beta.solpg.io) |
| **Solana Explorer** | Inspect transactions, accounts, programs on any cluster | [explorer.solana.com](https://explorer.solana.com) |
| **SolanaFM** | Alternative explorer with decoded instruction data | [solana.fm](https://solana.fm) |

---

## 3. AI-Assisted Solana Development (Vibe Coding)

### Claude Code + Official Solana Skill

The Solana Foundation maintains an official Claude Code skill with up-to-date best practices.

```bash
# Install the skill
git clone https://github.com/solana-foundation/solana-dev-skill.git
cp -r solana-dev-skill/skill ~/.claude/skills/solana-dev
```

- **Solana Dev Skill**: [github.com/solana-foundation/solana-dev-skill](https://github.com/solana-foundation/solana-dev-skill)
- **Awesome Solana AI** (30+ skills, 15+ MCP servers): [github.com/solana-foundation/awesome-solana-ai](https://github.com/solana-foundation/awesome-solana-ai)

### Cursor + Solana MCP Server

Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "solanaMcp": {
      "command": "npx",
      "args": ["mcp-remote", "https://mcp.solana.com/mcp"]
    }
  }
}
```

Gives you: Solana expert Q&A, full docs search, Anchor API expert.

- **Solana Developer MCP**: [mcp.solana.com](https://mcp.solana.com/)
- **Helius MCP** (60+ tools — DAS API, webhooks, wallet analysis): [helius.dev/docs/agents/mcp](https://www.helius.dev/docs/agents/mcp)

### No-Code / Low-Code Platforms

| Platform | What it does | Link |
|----------|-------------|------|
| **Poof.new** | Build and deploy Solana dApps from prompts | [poof.new](https://poof.new/) |
| **Noah AI** | Generate contracts + frontends from natural language | Search for latest link |

---

## 4. Core Solana Concepts Cheat Sheet

**Accounts model**: Everything is an account — programs, tokens, wallets, data. Programs are stateless; code and data live separately. Only the owning program can modify an account's data.

**Program Derived Addresses (PDAs)**: Deterministic addresses from seeds + program ID. No private key. Used for per-user state, program vaults, and deterministic addressing.

**Cross-Program Invocations (CPIs)**: One program calling another on-chain. Max 4 levels deep.

**Transaction limits**: Max 1,232 bytes per transaction. Contains instructions (program ID + accounts + data), signatures, and a recent blockhash.

**Rent exemption**: Accounts must deposit enough SOL (~2 years' rent) to persist. Anchor's `init` constraint handles this automatically.

**Compute units**: Each transaction has a compute budget (default 200K CU, max 1.4M). Complex operations may need `ComputeBudgetProgram.setComputeUnitLimit()`.

---

## 5. Learning Paths

### Beginner → Intermediate

1. **Solana Official Docs** — [solana.com/developers](https://solana.com/developers)
2. **Solana Cookbook** — [solana.com/developers/cookbook](https://solana.com/developers/cookbook)
3. **Anchor Book** — [anchor-lang.com/docs](https://www.anchor-lang.com/docs)
4. **Helius: Beginner's Guide to Anchor** — [helius.dev/blog/an-introduction-to-anchor](https://www.helius.dev/blog/an-introduction-to-anchor-a-beginners-guide-to-building-solana-programs)
5. **Anchor by Example** — [examples.anchor-lang.com](https://examples.anchor-lang.com)

### Intermediate → Advanced

6. **RareSkills: 60 Days of Solana** — [rareskills.io/solana-tutorial](https://rareskills.io/solana-tutorial)
7. **Program Examples** — [github.com/solana-developers/program-examples](https://github.com/solana-developers/program-examples)
8. **Helius: How to Use AI to Build Solana Apps** — [helius.dev/blog/how-to-use-ai-to-build-solana-apps](https://www.helius.dev/blog/how-to-use-ai-to-build-solana-apps)
9. **Solana AI Getting Started** — [solana.com/developers/guides/getstarted/intro-to-ai](https://solana.com/developers/guides/getstarted/intro-to-ai)

### Rust Foundations

10. **The Rust Book** (chapters 1–9 minimum) — [doc.rust-lang.org/book](https://doc.rust-lang.org/book/)
11. **Rustlings** (hands-on exercises) — [github.com/rust-lang/rustlings](https://github.com/rust-lang/rustlings)

---

## 6. Useful CLI Commands Reference

```bash
# Configuration
solana config set --url devnet          # Target devnet
solana config set --url localhost        # Target local validator
solana config get                        # Show current config

# Wallet
solana address                           # Show your public key
solana balance                           # Check SOL balance
solana airdrop 5                         # Get 5 devnet SOL

# Local development
solana-test-validator                    # Start local validator
solana logs                              # Stream program logs

# Anchor workflow
anchor init my-project                   # New project
anchor build                             # Compile program
anchor deploy                            # Deploy to configured cluster
anchor test                              # Build + deploy + run tests
anchor keys list                         # Show program IDs

# Scaffolding
npx create-solana-dapp@latest            # Full-stack project generator
```

---

## 7. Community & Support

- **Solana Stack Exchange**: [solana.stackexchange.com](https://solana.stackexchange.com/)
- **Solana Discord**: [discord.gg/solana](https://discord.gg/solana)
- **Superteam**: [superteam.fun](https://superteam.fun/) (regional communities, bounties, events)
- **Helius Discord**: Active dev support for RPC/API questions
- **Anchor Discord**: Framework-specific help

---

*Built for the "Building on Solana with AI Agents" workshop. Last updated April 2026.*
