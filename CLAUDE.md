# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EasyEscrow.ai is a **production-ready Solana atomic swap platform** enabling trustless peer-to-peer NFT/cNFT/SOL exchanges. The backend is a Node.js/Express/TypeScript API with PostgreSQL/Prisma, deployed on DigitalOcean.

**⚠️ IMPORTANT: Two distinct systems with different token models:**
- **Atomic Swaps** use native SOL only for payments and fees - do NOT add USDC to the swap system
- **Institution Escrow** uses USDC (SPL tokens) for cross-border payments between institutions

**Key capabilities:**
- Atomic swaps: NFT↔SOL, NFT↔NFT, cNFT↔SOL, bulk swaps (up to 4 NFTs total)
- Institution escrow: USDC-based cross-border payment escrow with AI-powered compliance analysis
- Compressed NFT (cNFT) support with Merkle proof handling via DAS API
- Jito bundles for multi-transaction swaps (2+ NFTs on one side, or any cNFT) with TwoPhase fallback
- Maximum 4 NFTs per swap (Jito bundle limit: 5 transactions = 1 fee tx + 4 NFT transfers)
- Simple 1-for-1 NFT swaps use escrow-based atomic transactions (no Jito)

## Common Commands

### Development
```bash
npm run dev          # Start development server with nodemon
npm run build        # Build TypeScript to dist/
npm run lint         # Check formatting with Prettier
npm run lint:fix     # Auto-fix formatting
```

### Database (Prisma)
```bash
npm run db:generate        # Generate Prisma client
npm run db:migrate         # Run migrations (dev)
npm run db:migrate:deploy  # Run migrations (production)
npm run db:studio          # Open Prisma Studio
npm run db:push            # Push schema without migration
```

### Testing

**Run single test file correctly** (use `--no-config` flag):
```bash
# Unit tests - use dedicated scripts or direct mocha
npm run test:unit                    # Run working unit tests
cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/unit/YOUR_TEST.test.ts --timeout 10000

# Integration tests
npm run test:integration

# Staging E2E tests
npm run test:staging:e2e:atomic:all

# Production tests
npm run test:production:smoke:all
npm run test:production:e2e:01-nft-for-sol
```

### Docker
```bash
npm run docker:start       # Start all services
npm run docker:restart     # Graceful restart all services
npm run docker:rebuild     # Rebuild and restart
npm run docker:fresh       # Complete fresh build (removes data)
npm run docker:logs        # View all logs
```

### Solana Program (Windows)
```powershell
$env:HOME = $env:USERPROFILE
cd programs/escrow
cargo build-sbf
cd ../..
anchor idl build    # Generate IDL separately
```

### Parallel Development with Git Worktrees

For running multiple Claude Code sessions in parallel on different tasks:

**Branch Naming Convention:**
- Single task: `feat/<date>-task<N>-<description>`
- Multiple tasks: `feat/<date>-tasks<N>-<M>-<description>`

**Examples:**
```bash
# Create worktrees from master with task numbers in branch name
git worktree add ../escrow-19dec-task6-cnft-fix -b feat/19dec-task6-cnft-fix origin/master
git worktree add ../escrow-19dec-tasks1-2-api -b feat/19dec-tasks1-2-api origin/master

# Run npm install in each worktree
cd ../escrow-19dec-task6-cnft-fix && npm install
```

**Worktree Naming:** `escrow-<date>-task<N>-<short-desc>` or `escrow-<date>-<feature>`

**Workflow:**
1. Create worktree with task number(s) in branch name
2. Copy Task Master files: `cp .taskmaster/tasks/tasks.json <worktree>/.taskmaster/tasks/`
3. Copy Claude settings: `cp -r .claude/ <worktree>/.claude/`
4. Open terminal, navigate to worktree, run `claude`
5. Run `/start-task` to auto-detect task from branch name
6. Create PR to master (never push directly to master)

---

## Critical Rules

### 1. Token Usage Rules (CRITICAL)

**Two systems, two token models. Do NOT mix them.**

**Atomic Swaps (SOL only):**
- ✅ All swap payments: Native SOL transfers via System Program
- ✅ All swap fees: Collected in SOL
- ✅ NFT↔SOL, NFT↔NFT (with SOL fee), cNFT↔SOL
- ❌ Do NOT add USDC/SPL tokens to the atomic swap system

**Institution Escrow (USDC only):**
- ✅ Cross-border payment escrow using USDC (SPL token)
- ✅ AI-powered compliance analysis for transaction review
- ✅ Institution authentication with JWT and allowlist
- ✅ File uploads for supporting documents
- ❌ Do NOT use SOL for institution escrow payments

Legacy atomic-swap USDC code was removed during SOL migration. Archived task files in `.taskmaster/tasks/legacy-usdc-archived/` contain historical USDC swap references - do not use these as implementation guides for either system.

### 2. Docker Graceful Restart (CRITICAL)

**NEVER use process killing commands** with Docker services:
- ❌ `pkill node`, `taskkill /F /IM node.exe`, `killall node`, `kill -9`

**ALWAYS use Docker compose commands:**
| Scenario | Command |
|----------|---------|
| Restart all services | `docker compose restart` |
| Restart backend only | `docker compose restart backend` |
| After code change | `docker compose up -d --build backend` |
| After env change | `docker compose down && docker compose up -d` |
| Full reset | `docker compose down && docker compose up -d --build` |
| Check health | `docker compose ps` |

Process killing causes data corruption in PostgreSQL/Redis, incomplete transactions, and orphaned connections.

### 3. Testing Rules (CRITICAL)

**ALWAYS update unit tests when changing logic:**
- When modifying routing, validation, or business logic, find and update related unit tests
- All tests must pass (100% green) before committing
- Run affected tests: `npx cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/unit/AFFECTED_TEST.test.ts --timeout 30000`
- Key test files for swap routing: `swapFlowRouterIntegration.test.ts`, `swapMethodSelection.test.ts`, `apiDelegationRouting.test.ts`

**NEVER use:** `npm test -- path/to/test.ts` - this loads ALL tests due to glob patterns.

**ALWAYS use `--no-config` flag for single tests:**
```bash
# Correct way to run a single test
cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/unit/YOUR_TEST.test.ts --timeout 10000 --reporter spec --colors
```

**Key flags:**
- `--no-config`: Prevents loading all test files from mocha config
- `--require ts-node/register`: Enables TypeScript support
- `--timeout X`: Unit=10s, Integration=20s, E2E=180s
- `cross-env NODE_ENV=test`: Required for unit tests

### 4. IDL Program ID Verification (CRITICAL)

Each environment has a **different program ID**. IDL files must have the correct address:

| Environment | Program ID | IDL File |
|-------------|------------|----------|
| **Production** | `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx` | `escrow-idl-production.json` |
| **Staging** | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` | `escrow-idl-staging.json` |

**After regenerating IDL:**
1. `anchor idl build` uses devnet by default
2. Copy to staging: `Copy-Item target\idl\escrow.json src\generated\anchor\escrow-idl-staging.json`
3. For production: Copy then **manually update the `address` field** to the mainnet program ID

**Verification:**
```powershell
# Check production IDL has correct address
Get-Content src\generated\anchor\escrow-idl-production.json | Select-String "address"
# Must show: 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
```

### 5. Solana Program Build (Windows)

**Problem:** Building from project root fails with path length errors (error 123).

**Solution:** Build from `programs/escrow/` directory:
```powershell
$env:HOME = $env:USERPROFILE
cd programs/escrow
cargo build-sbf          # Builds .so file only
cd ../..
anchor idl build         # Generate IDL separately from project root
```

**Never use:** `anchor build` from project root on Windows.

**Output locations:**
- Program binary: `target/deploy/easyescrow.so`
- IDL file: `target/idl/escrow.json`

### 6. Command Timeout Rules

**Run fast commands DIRECTLY (no timeout wrapper):**
- `git status`, `git branch`, `git log`, `git diff`
- `ls`, `pwd`, `cat`, `echo`, `Write-Host`
- `node --version`, `npm --version`

**Use timeout wrappers ONLY for slow operations:**
- Builds: `npm run build`, `tsc`, `anchor build` (60s)
- Package installs: `npm install` (120s)
- Tests: unit (60s), integration (120s), E2E (180s)
- Database: `prisma migrate` (60s)
- Git network: `git fetch`, `git pull`, `git push` (60s)
- Blockchain: `solana airdrop`, `anchor deploy` (180s)

### 7. Pull Request Rules

**Always create PRs in draft mode:**
```bash
gh pr create --draft --title "..." --body "..."
```

**Automatically fix merge conflicts when updating PRs:**
- Before pushing updates, always fetch and rebase on master
- Resolve any conflicts automatically
- Force push to update the PR branch

```bash
git fetch origin master
git rebase origin/master
# Resolve conflicts if any
git push --force-with-lease
```

---

## Architecture

### Core Services (`src/services/`)

| Service | Purpose |
|---------|---------|
| `offerManager.ts` | Atomic swap offer lifecycle (create/accept/cancel) |
| `transactionBuilder.ts` | Builds swap transaction instructions |
| `transactionGroupBuilder.ts` | Multi-transaction bundles for bulk swaps |
| `bulkSwapExecutor.ts` | Executes Jito bundles for multi-transaction swaps with TwoPhase fallback |
| `assetValidator.ts` | Validates NFT/cNFT/SOL ownership and metadata |
| `cnftService.ts` | DAS API integration for cNFT Merkle proofs |
| `directBubblegumService.ts` | Bubblegum program cNFT transfers |
| `noncePoolManager.ts` | Manages durable nonce accounts |
| `feeCalculator.ts` | Dynamic platform fee calculation |
| `escrow-program.service.ts` | Anchor program interaction |

### Institution Escrow Services (`src/services/institution/`)

| Service | Purpose |
|---------|---------|
| `institutionAuth.service.ts` | JWT-based authentication for institution users |
| `institutionEscrow.service.ts` | USDC escrow lifecycle (create/fund/release/dispute/settle) |
| `aiAnalysis.service.ts` | AI-powered compliance and risk analysis via Claude API |
| `allowlist.service.ts` | Institution allowlist management and verification |
| `compliance.service.ts` | Regulatory compliance checks and reporting |
| `fileUpload.service.ts` | Document upload to DO Spaces for escrow supporting docs |

### Database

- **PostgreSQL** with Prisma ORM
- Schema: `prisma/schema.prisma`
- Generated client: `src/generated/prisma/`
- Key models: `Agreement`, `SwapOffer`, `NoncePoolEntry`, `Receipt`
- Institution escrow models: `Institution`, `InstitutionUser`, `InstitutionEscrow`, `EscrowDocument`, `ComplianceCheck`

### IDL Files

Environment-specific IDL files in `src/generated/anchor/`:
- `escrow-idl-production.json` → `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx`
- `escrow-idl-staging.json` → `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`

### API Routes

- `src/routes/offers.routes.ts` - Atomic swap endpoints (active)
- Swagger docs at `/docs` endpoint

---

## Key Patterns

### cNFT Handling
- Merkle proofs fetched via DAS API (`cnftService.ts`)
- Stale proof retry with progressive delays (up to 3 attempts)
- Canopy optimization for proof trimming
- Rate limiting via `das-http-rate-limiter.ts`

### Jito Integration
- **Jito-first**: Multi-transaction swaps (2+ NFTs on one side, or any cNFT) use Jito bundles
- **Max 4 NFTs**: Jito bundles max 5 transactions (1 fee tx + 4 NFT transfers)
- **1-for-1 exception**: Simple 1 NFT ↔ 1 NFT swaps (no cNFTs) use escrow-based atomic transactions
- **TwoPhase fallback**: On Jito failure (rate limit, simulation error), falls back to TwoPhase delegation
- Regional routing via `jito-region-router.ts`
- Rate limiting via `jito-http-rate-limiter.ts` (1 rps without UUID, 5 rps with JITO_AUTH_UUID)
- See `docs/architecture/SWAP_ROUTING.md` for detailed routing logic

### Institution Escrow
- Feature-flagged via `INSTITUTION_ESCROW_ENABLED` (disabled by default)
- USDC escrow with configurable min/max amounts ($100 - $1M default)
- JWT authentication (access + refresh tokens) for institution users
- Allowlist-based institution registration (not open signup)
- AI compliance analysis via Claude API before escrow release
- Document uploads stored in DigitalOcean Spaces (S3-compatible)
- Settlement authority pattern: separate API key for release operations
- Default escrow expiry: 72 hours (configurable)
- Config validated at startup only when feature is enabled

### Transaction Flow
1. Offer created via `offerManager.ts`
2. Assets validated via `assetValidator.ts`
3. Transaction built via `transactionBuilder.ts`
4. For bulk: transactions grouped via `transactionGroupBuilder.ts`
5. Execution via `bulkSwapExecutor.ts` (Jito) or standard RPC

---

## Environment Variables

Key variables (see `.env.example` for full list):
- `DATABASE_URL` - PostgreSQL connection
- `SOLANA_RPC_URL` - RPC endpoint
- `ESCROW_PROGRAM_ID` - On-chain program address
- `REDIS_URL` - Redis for caching
- `NODE_ENV` - production/staging/development
- `JITO_BUNDLES_ENABLED` - Enable Jito bundles (default: true on mainnet)
- `JITO_AUTH_UUID` - Optional UUID for 5 rps rate limit (default: 1 rps)

**Institution Escrow variables (only required when `INSTITUTION_ESCROW_ENABLED=true`):**
- `INSTITUTION_ESCROW_ENABLED` - Feature flag (default: false)
- `USDC_MINT_ADDRESS` - USDC SPL token mint address
- `INSTITUTION_ESCROW_MIN_USDC` / `MAX_USDC` - Amount limits
- `JWT_SECRET` - Secret for institution JWT tokens (min 32 chars)
- `ANTHROPIC_API_KEY` - Claude API key for AI compliance analysis
- `AI_ANALYSIS_MODEL` - Claude model for analysis (default: claude-sonnet-4-20250514)
- `DO_SPACES_*` - DigitalOcean Spaces config for document uploads
- `SETTLEMENT_AUTHORITY_API_KEY` - API key for settlement operations
