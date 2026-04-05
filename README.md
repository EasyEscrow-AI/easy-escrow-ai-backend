<img src="media/easyescrow-logo.png" alt="EasyEscrow.ai Logo" width="800">

# EasyEscrow.ai Backend

Non-custodial digital escrow platform on Solana. Backend API service powering institutional cross-border stablecoin escrow payments and atomic swaps.

---

## Environments

| Environment    | Institutional Portal                                                 | Backend API                                                              |
| -------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **STAGING**    | [staging-portal.easyescrow.ai](https://staging-portal.easyescrow.ai) | [staging-api.easyescrow.ai/docs](https://staging-api.easyescrow.ai/docs) |
| **PRODUCTION** | [portal.easyescrow.ai](https://portal.easyescrow.ai)                 | [api.easyescrow.ai/docs](https://api.easyescrow.ai/docs)                 |

## Solana Program

| Environment    | Network | Program ID                                     | Status    |
| -------------- | ------- | ---------------------------------------------- | --------- |
| **STAGING**    | Devnet  | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` | ✅ ACTIVE |
| **PRODUCTION** | Mainnet | `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx` | ✅ LIVE   |

---

## Changelog

### v1.2.0 — Blockchain Privacy Verification (April 2026)

Privacy-preserving infrastructure for institutional escrow payments with on-chain verification.

- ✅ **Stealth Address Derivation**: Dual-Key Stealth Address Protocol (DKSAP) hides real wallet addresses of both payer and recipient on blockchain transactions. Auto-enabled for all institution accounts — each receives a stealth meta-address on creation. One-time stealth addresses derived per payment ensure address unlinkability.
- ✅ **Chain of Custody**: Cryptographically signed blockchain transactions tracking escrow actors and state transitions. Full audit trail from creation through settlement with on-chain transaction signatures at every lifecycle stage.
- ✅ **Compliance Audit Trail**: Complete compliance audit trail for payments from creation to settlement. Lifecycle completeness verification, risk scoring, AI-powered document analysis, and downloadable audit reports.
- ✅ **On-Chain PDA Receipts**: Encrypted receipt PDA accounts store escrow metadata on-chain for every settlement (pooled and standalone). AES-256-GCM encryption with fixed 512-byte payloads prevents information leakage. Publicly verifiable on-chain, decryptable only by the pool operator.
- ✅ **Transaction Pool Shielding**: Transaction pools batch escrow settlements with decoy members for privacy shielding. Transparent auto-pooling, configurable sequential/parallel settlement modes, and on-chain vault management with encrypted receipts.
- ✅ **Stealth Sender Addresses**: Server-side vault deposit flow enables payer privacy — deposits route through one-time stealth addresses so the sender's real wallet is not visible on-chain.
- ✅ **Privacy Analysis API**: On-chain privacy verification endpoint with enriched analysis including stealth status, address mapping, transaction hashes, and pool shielding details. Admin and per-client privacy summaries.

### v1.1.0 — Institutional Escrow (March 2026)

Cross-border stablecoin escrow payments for institutional clients.

- ✅ Institution client authentication (JWT) with registration, login, and token refresh
- ✅ USDC escrow lifecycle: create, deposit, release, and cancel
- ✅ AI-powered document analysis for compliance risk scoring
- ✅ Wallet whitelists and jurisdiction payment corridors
- ✅ File uploads for escrow supporting documents (PDF, images, Excel, CSV)
- ✅ KYB profile management and client search/discovery
- ✅ API key management for programmatic access
- ✅ Admin endpoints for allowlist and corridor configuration
- ✅ Settlement authority pattern for release operations
- ✅ AI data anonymisation (PII redaction before model processing)
- ✅ Escrow Settlement Mode: Atomic (non-custodial proof of funds) / Escrow (full PDA escrow)
- ✅ Escrow Release Terms: programmable release mechanisms
- ✅ Full blockchain audit of payment escrows and downloadable compliance & audit reports
- ✅ Supports KYC/KYB compliance integrations (not activated for hackathon)
- ✅ Supports AMINA Payment Network (APN) integrations (not activated for hackathon)
- ✅ Transaction Pools: batch multiple escrow settlements into pooled operations with sequential/parallel settlement modes (feature-flagged: off by default -- enable via `TRANSACTION_POOLS_ENABLED`)
- ✅ CDP Settlement Authority: optional Coinbase Developer Platform (CDP) wallet as independent settlement authority with TEE-secured policy engine (feature-flagged: off by default -- enable via `CDP_ENABLED`)

### v1.0.0 — Atomic Swaps (October 2025)

Non-custodial peer-to-peer NFT and SOL atomic swaps on Solana.

- ✅ NFT <> SOL, NFT <> NFT, and NFT + SOL <> NFT swap types
- ✅ Support for SPL NFTs, Core NFTs, Compressed NFTs (cNFTs), and Programmable NFTs (pNFTs)
- ✅ Jito bundle swaps for multi-NFT transactions (up to 4 NFTs)
- ✅ TwoPhase fallback for bundle failures
- ✅ Compressed NFT support with Merkle proof handling via DAS API
- ✅ Dynamic platform fee calculation (1% SOL swaps, 0.005 SOL flat for NFT-only)
- ✅ Offer lifecycle management (create, accept, cancel, counter, expire)
- ✅ Durable nonce pool for reliable transaction submission
- ✅ Health monitoring and service status endpoints

---

## Institutional Escrow

Programmable cross-border stablecoin escrow payments, built for institutions compliance and auditability.

### Key Features

- **Client Portal Integration**: Front-end integration with EasyEscrow Institution client portal app
- **Stablecoin Settlement**: Solana DeFi stablecoin escrow settlement using USDC
- **AI-Assisted Compliance**: AI-powered document analysis for risk scoring (verifies only, does not automate payments)
- **AI Data Anonymisation**: PII redaction before sending documents to AI models
- **Wallet Whitelists**: Allowlist-based wallet management with jurisdiction payment corridors
- **Escrow Settlement Modes**: Atomic (non-custodial proof of funds) / Escrow (full PDA escrow)
- **Programmable Release**: Configurable release mechanisms (admin release, time lock, compliance check)
- **Blockchain Audit Trail**: Full audit of payment escrows with downloadable compliance & audit reports
- **Document Management**: Secure file uploads to DigitalOcean Spaces (PDF, images, Excel, CSV)
- **KYB Profile Management**: Extended institution profiles with legal entity details, industry, and registration info
- **API Key Management**: Programmatic access via generated API keys with configurable permissions
- **Token Support**: Primary support for USDC and AMINA-approved whitelist only tokens
- **KYC/KYB Integrations**: Compliance integration support (not activated for hackathon)
- **AMINA Payment Network**: APN integration support (not activated for hackathon)
- **Transaction Pools**: Batch multiple escrow settlements into pooled operations with configurable settlement modes (sequential/parallel) (feature-flagged: off by default -- enable via `TRANSACTION_POOLS_ENABLED`)
- **CDP Settlement Authority**: Optional independent settlement authority via Coinbase Developer Platform (CDP) wallet with TEE-secured policy engine. When enabled, the CDP wallet replaces the admin as the on-chain settlement authority, requiring policy approval before signing release/cancel transactions (feature-flagged: off by default -- enable via `CDP_ENABLED`)
- **Blockchain Privacy**: Stealth addresses (DKSAP), on-chain encrypted receipt PDAs, transaction pool shielding with decoy members, and privacy analysis API. See [Blockchain Privacy Verification](#blockchain-privacy-verification) for details.

### Escrow Lifecycle

```text
Create --> Deposit --> Release / Cancel
             |
     [Compliance Hold] --> Approve --> Release
                       --> Reject  --> Cancel
```

1. **Register** an institution client account (email + password, JWT authentication)
2. **Configure** wallets, API keys, and settings via the settings endpoints
3. **Create** an escrow specifying payer/recipient wallets, USDC amount, corridor, and release conditions
4. **Deposit** USDC on-chain and record the transaction signature
5. **Analyze** (optional) upload documents for AI-powered compliance risk scoring
6. **Release** funds (requires settlement authority) or **Cancel** the escrow

### Institution API Endpoints

| Category        | Endpoints                                        | Description                           |
| --------------- | ------------------------------------------------ | ------------------------------------- |
| **Auth**        | register, login, refresh, logout, me, password   | JWT authentication with rate limiting |
| **Settings**    | get/update settings, wallet management, API keys | Client configuration                  |
| **Clients**     | search, list, profile, archive                   | Client discovery and management       |
| **Files**       | upload, list, download, delete                   | Document management for compliance    |
| **Escrow**      | create, deposit, release, cancel, get, list      | USDC escrow payment lifecycle         |
| **AI Analysis** | analyze document, get results                    | AI compliance risk scoring            |
| **AI Chat**     | chat with AI assistant                           | AI-powered escrow assistant           |
| **Receipts**    | get, list, download                              | Settlement receipt management         |
| **Pools**       | create, add/remove member, lock, settle, cancel  | Transaction pool lifecycle            |
| **Privacy**     | privacy-analysis, privacy-summary                | On-chain privacy verification         |
| **Admin**       | allowlist CRUD, corridor configuration           | Administrative operations             |

### Settlement Authority

Release operations require a separate settlement authority API key, enforcing separation of duties between escrow creation and fund release. This is validated via the `requireSettlementAuthority` middleware.

Optionally, escrows can use a **CDP (Coinbase Developer Platform) wallet** as an independent settlement authority. When the `cdp_policy_approval` release condition is selected, the CDP wallet's public key is stored as the on-chain `settlement_authority` instead of the admin. Release and cancel transactions require multi-sign: the admin partially signs as fee payer, then CDP signs as authority after its TEE-secured policy engine validates the operation. See [CDP Settlement Authority Architecture](docs/architecture/CDP_SETTLEMENT_AUTHORITY.md) for details.

---

## Blockchain Privacy Verification

Privacy-preserving infrastructure for institutional escrow payments, providing on-chain verification of payment confidentiality.

### Privacy Features

| Feature | Description | Status |
| --- | --- | --- |
| **Stealth Address Derivation** | Stealth addresses hide the real wallet addresses of both payer and recipient on blockchain transactions. Uses Dual-Key Stealth Address Protocol (DKSAP) with `@noble/ed25519`. Auto-enabled for all institution accounts. | ✅ Verified |
| **Chain of Custody** | Cryptographically signed blockchain transactions tracking the escrow actors and states. On-chain transaction signatures at every lifecycle stage. | ✅ Verified |
| **Compliance Audit Trail** | Complete compliance audit trail for the payment from creation to settlement. Lifecycle completeness verification, risk scoring, and downloadable reports. | ✅ Verified |
| **On-Chain PDA Receipts** | Escrow PDA account stores encrypted metadata for the payments on-chain, publicly verifiable. AES-256-GCM encryption with fixed 512-byte payloads. Decryptable only by the pool operator. | ✅ Verified |
| **Transaction Pool Shielding** | Transaction pools provide confidential payment details enforced at the blockchain protocol level. Decoy members, auto-pooling, and encrypted on-chain receipts. | ✅ Verified |

### How Stealth Addresses Work

1. **Account creation** auto-generates a **stealth meta-address** (scan key + spend key pair)
2. **Sender** (or backend on release) derives a one-time **stealth address** from the meta-address using an ephemeral keypair
3. Funds are sent to the stealth address — a standard Solana pubkey, no program changes required
4. **Recipient** scans for payments using their scan private key + the ephemeral public key
5. **Recipient** derives the spending key to sweep funds from the stealth address

**Key properties**: address unlinkability (each payment uses a unique address), selective disclosure (scan key shareable with auditors for compliance), and graceful fallback (standard transfer when no meta-address exists).

### Privacy Analysis API

The `GET /institution-escrow/privacy-summary` and `GET /institution-escrow/:id/privacy-analysis` endpoints provide on-chain verification of privacy features for each escrow, including:

- Stealth address status and address mapping
- Chain of custody verification with transaction signatures
- Compliance audit trail completeness
- On-chain PDA receipt verification
- Transaction pool shielding details with decoy member analysis

### Privacy Services

| Service | Purpose |
| --- | --- |
| `privacy/stealth-address.service.ts` | DKSAP stealth address generation and derivation |
| `privacy/stealth-crypto.ts` | Ed25519 elliptic curve operations for DKSAP |
| `privacy/stealth-key-manager.ts` | Meta-address key generation and storage |
| `privacy/stealth-adapter.ts` | Integrates stealth addresses into escrow release flow |
| `privacy/privacy-router.service.ts` | Routes escrow operations through privacy pipeline |
| `privacy-analysis.service.ts` | On-chain privacy verification and analysis |
| `transaction-pool.service.ts` | Pool lifecycle, settlement, and receipt encryption |
| `pool-decoy.service.ts` | Decoy member generation for pool shielding |
| `pool-vault-program.service.ts` | On-chain vault and receipt PDA management |

### Architecture Docs

- [Stealth Addresses](docs/architecture/STEALTH_ADDRESSES.md) — DKSAP implementation details
- [Transaction Pools](docs/architecture/TRANSACTION_POOLS.md) — Pool lifecycle and settlement
- [Pool Receipt Encryption](docs/architecture/POOL_RECEIPT_ENCRYPTION.md) — AES-256-GCM on-chain receipt encryption
- [Payment Timelock](docs/architecture/PAYMENT_TIMELOCK.md) — Cooling-off period between funding and release

---

## Atomic Swaps

Instant, non-custodial digital swaps that execute in a single transaction. Your assets are NEVER held in escrow — they only leave your wallet upon instant settlement. The swap happens atomically or not at all (no partial settlement, no MEV attacks, no stuck assets).

### Supported Swap Types

| Type                 | Description                     | Status       |
| -------------------- | ------------------------------- | ------------ |
| **NFT <> SOL**       | Exchange NFT for SOL tokens     | ✅ Supported |
| **NFT <> NFT (fee)** | NFT for NFT with platform fee   | ✅ Supported |
| **NFT <> NFT + SOL** | NFT for another NFT plus SOL    | ✅ Supported |
| **cNFT <> SOL**      | Compressed NFT for SOL          | ✅ Supported |
| **NFT <> cNFT**      | Standard NFT for compressed NFT | ✅ Supported |
| **Bulk Swaps**       | Multiple NFTs (up to 4 total)   | ✅ Supported |

### Supported Assets

| Asset        | Description                                     | Status       |
| ------------ | ----------------------------------------------- | ------------ |
| **SPL NFT**  | Solana SPL Token NFT (Metaplex standard)        | ✅ Supported |
| **Core NFT** | Solana Metaplex Core NFT                        | ✅ Supported |
| **cNFT**     | Solana Compressed NFT (Metaplex Bubblegum)      | ✅ Supported |
| **pNFT**     | Programmable NFT (on-chain royalty enforcement) | ✅ Supported |
| **SOL**      | Solana native token                             | ✅ Supported |

### Bulk Swap & cNFT Features

- **Multi-Asset Swaps**: Up to 4 NFTs total per swap via Jito bundles for atomic execution
- **Direct Bubblegum transfers**: cNFTs transfer directly without escrow custody
- **Merkle proof handling**: Automatic proof fetching from DAS API with stale proof retry
- **Canopy optimization**: Automatic proof trimming based on on-chain canopy depth
- **Address Lookup Tables**: Automatic ALT usage for transaction size optimization

### Platform Fees & Limits

| Parameter         | Value                               |
| ----------------- | ----------------------------------- |
| NFT-only swaps    | 0.005 SOL flat fee                  |
| Swaps with SOL    | 1% of total SOL amount              |
| Minimum fee       | 0.001 SOL                           |
| Maximum fee       | 0.5 SOL (fee cap)                   |
| Min SOL           | 0.1 SOL                             |
| Max SOL           | 15 SOL (~$5,000 AUD limit)          |
| Max NFTs per swap | 4 (Jito bundle limit)               |
| Offer expiry      | 1 hour to 30 days (default: 7 days) |

### Offer Management

- **Private Sales**: Restrict offers to specific taker wallets
- **Counter-Offers**: Full counter-offer chain support with asset modification
- **Offer Updates**: Update SOL amounts via `PUT /api/offers/:id`
- **Offer Cancellation**: Maker and admin cancellation with nonce advancement

---

## Architecture

### Tech Stack

- **Runtime**: Node.js + Express + TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis (rate limiting, session management, caching)
- **Blockchain**: Solana (web3.js, Anchor, SPL Token)
- **AI**: Anthropic Claude API (document analysis, AI chat)
- **Storage**: DigitalOcean Spaces (S3-compatible, document uploads)
- **Documentation**: OpenAPI 3.0 with Redoc
- **Deployment**: DigitalOcean App Platform

### Core Services

| Service                      | Purpose                                            |
| ---------------------------- | -------------------------------------------------- |
| `offerManager.ts`            | Atomic swap offer lifecycle (create/accept/cancel) |
| `transactionBuilder.ts`      | Builds swap transaction instructions               |
| `transactionGroupBuilder.ts` | Multi-transaction bundles for bulk swaps           |
| `bulkSwapExecutor.ts`        | Jito bundle execution with TwoPhase fallback       |
| `assetValidator.ts`          | NFT/cNFT/SOL ownership and metadata validation     |
| `cnftService.ts`             | DAS API integration for cNFT Merkle proofs         |
| `feeCalculator.ts`           | Dynamic platform fee calculation                   |
| `noncePoolManager.ts`        | Durable nonce account management                   |

### Institution Escrow Services

| Service                                  | Purpose                                                        |
| ---------------------------------------- | -------------------------------------------------------------- |
| `institution-auth.service.ts`            | JWT authentication (access + refresh tokens)                   |
| `institution-escrow.service.ts`          | USDC escrow lifecycle (create/fund/release/cancel)             |
| `institution-escrow-program.service.ts`  | On-chain transaction building (PDA derivation, ATA management) |
| `institution-client-settings.service.ts` | Client settings, wallet, and API key management                |
| `institution-file.service.ts`            | Document uploads to DigitalOcean Spaces                        |
| `institution-receipt.service.ts`         | Settlement receipt generation and management                   |
| `ai-analysis.service.ts`                 | AI compliance analysis via Claude API                          |
| `ai-chat.service.ts`                     | AI-powered escrow assistant                                    |
| `allowlist.service.ts`                   | Wallet allowlist management (Redis + Prisma)                   |
| `compliance.service.ts`                  | Corridor validation, risk scoring, volume limits               |
| `cdp-settlement.service.ts`              | CDP wallet integration for independent settlement authority    |
| `privacy-analysis.service.ts`            | On-chain privacy verification and analysis                     |
| `privacy/stealth-address.service.ts`     | DKSAP stealth address generation and derivation                |
| `privacy/stealth-crypto.ts`              | Ed25519 elliptic curve operations for DKSAP                    |
| `privacy/stealth-key-manager.ts`         | Meta-address key generation and storage                        |
| `privacy/stealth-adapter.ts`             | Stealth address integration into escrow release flow           |
| `transaction-pool.service.ts`            | Pool lifecycle, settlement, and receipt encryption              |
| `pool-decoy.service.ts`                  | Decoy member generation for pool privacy shielding             |
| `pool-vault-program.service.ts`          | On-chain vault and encrypted receipt PDA management            |

### Database Models

**Atomic Swaps**: `Agreement`, `SwapOffer`, `NoncePoolEntry`, `Receipt`

**Institution Escrow**: `InstitutionClient`, `InstitutionWallet`, `InstitutionRefreshToken`, `InstitutionClientSettings`, `InstitutionApiKey`, `InstitutionEscrow`, `InstitutionDeposit`, `InstitutionAuditLog`, `InstitutionAiAnalysis`, `InstitutionCorridor`, `InstitutionFile`

---

## Project Structure

```
/
├── README.md
├── CLAUDE.md
├── docs/                      # Comprehensive documentation
│   ├── api/                   # API documentation
│   │   ├── openapi.yaml       # OpenAPI 3.0 specification
│   │   └── SWAGGER_IMPLEMENTATION.md
│   ├── architecture/          # System design
│   │   └── SWAP_ROUTING.md    # Jito vs escrow routing logic
│   ├── deployment/            # Deployment guides
│   ├── environments/          # Environment configs
│   ├── security/              # Security documentation
│   ├── setup/                 # Installation guides
│   └── testing/               # Testing strategies
├── src/                       # Backend TypeScript/Node.js source
│   ├── config/                # Configuration
│   │   ├── index.ts           # Environment config
│   │   ├── database.ts        # Prisma client
│   │   ├── redis.ts           # Redis config
│   │   ├── atomicSwap.config.ts
│   │   └── institution-escrow.config.ts
│   ├── generated/             # Generated code
│   │   ├── prisma/            # Prisma client
│   │   └── anchor/            # IDL files (staging + production)
│   ├── middleware/             # Express middleware
│   ├── models/                # Data models & validators
│   │   ├── dto/               # Data Transfer Objects
│   │   └── validators/        # Input validators
│   ├── routes/                # API routes
│   │   ├── offers.routes.ts           # Atomic swap endpoints
│   │   ├── institution-auth.routes.ts # Institution authentication
│   │   ├── institution-escrow.routes.ts # Escrow lifecycle
│   │   ├── institution-files.routes.ts  # Document uploads
│   │   ├── institution-settings.routes.ts # Client settings
│   │   ├── institution-clients.routes.ts  # Client discovery
│   │   ├── institution-receipt.routes.ts  # Receipt management
│   │   ├── institution-tokens.routes.ts   # Token whitelist
│   │   ├── ai-analysis.routes.ts      # AI compliance analysis
│   │   ├── ai-chat.routes.ts          # AI chat assistant
│   │   └── admin/                     # Admin endpoints
│   ├── services/              # Business logic
│   │   ├── offerManager.ts            # Atomic swap manager
│   │   ├── assetValidator.ts          # NFT/cNFT/SOL validation
│   │   ├── feeCalculator.ts           # Dynamic fees
│   │   ├── transactionBuilder.ts      # Swap transactions
│   │   ├── transactionGroupBuilder.ts # Multi-tx bundles
│   │   ├── bulkSwapExecutor.ts        # Jito bundle execution
│   │   ├── cnftService.ts             # DAS API / cNFT proofs
│   │   ├── noncePoolManager.ts        # Durable transactions
│   │   ├── institution-auth.service.ts
│   │   ├── institution-escrow.service.ts
│   │   ├── institution-escrow-program.service.ts
│   │   ├── institution-client-settings.service.ts
│   │   ├── institution-file.service.ts
│   │   ├── institution-receipt.service.ts
│   │   ├── ai-analysis.service.ts
│   │   ├── ai-chat.service.ts
│   │   ├── allowlist.service.ts
│   │   ├── compliance.service.ts
│   │   ├── cdp-settlement.service.ts  # CDP wallet settlement authority
│   │   └── solana.service.ts          # Blockchain ops
│   ├── data/                  # Static data & knowledgebases
│   ├── utils/                 # Utility functions
│   ├── public/                # Static assets (Swagger UI)
│   └── index.ts               # Application entry point
├── prisma/                    # Database
│   ├── schema.prisma          # Database schema
│   └── migrations/            # Migration files
├── programs/                  # Solana programs
│   └── escrow/                # Atomic swap smart contract
│       └── src/lib.rs         # Program logic
├── tests/                     # Test suites
│   ├── unit/                  # Unit tests
│   │   ├── institution-client/  # Institution auth & settings tests
│   │   ├── institution-escrow/  # Escrow, compliance, AI tests
│   │   └── admin/               # Admin auth tests
│   ├── integration/           # Integration tests
│   ├── staging/e2e/           # Staging E2E tests
│   └── production/            # Production smoke & E2E tests
│       ├── smoke/             # Health & connectivity checks
│       └── e2e/               # Full production E2E tests
├── scripts/                   # Utility scripts
│   ├── deployment/            # Deployment automation
│   ├── development/           # Dev utilities
│   └── testing/               # Test helpers
├── docker-compose.yml         # Docker services
├── Dockerfile                 # Production Docker image
└── package.json               # Node.js dependencies
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Solana CLI (for program development)
- Anchor Framework (for program development)

### Development

```bash
# Install dependencies
npm install

# Setup database
npm run db:setup

# Run in development mode
npm run dev

# Build
npm run build
```

### Docker

```bash
# Start all services (backend, PostgreSQL, Redis)
npm run docker:start

# Graceful restart
npm run docker:restart

# Rebuild after code changes
npm run docker:rebuild

# Fresh start (removes all data)
npm run docker:fresh

# View logs
npm run docker:logs
```

**Important**: Always use Docker compose commands for restarts. Never use process-killing commands (`pkill`, `taskkill`) with Dockerized services.

---

## Testing

| Test Type                 | Command                                                                                                                 | Timeout |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------- |
| Unit tests                | `npm run test:unit`                                                                                                     | 10s     |
| Single test file          | `npx cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/unit/YOUR_TEST.test.ts --timeout 10000` | 10s     |
| Integration tests         | `npm run test:integration`                                                                                              | 20s     |
| Staging E2E (atomic)      | `npm run test:staging:e2e:atomic:all`                                                                                   | 180s    |
| Staging E2E (institution) | Individual test files (`20-` through `26-`)                                                                             | 180s    |
| Production smoke          | `npm run test:production:smoke:all`                                                                                     | 180s    |
| Production E2E            | `npm run test:production:e2e:01-nft-for-sol`                                                                            | 180s    |

### Test Coverage

| Area                   | Files                                                                                      | Tests     |
| ---------------------- | ------------------------------------------------------------------------------------------ | --------- |
| **Atomic Swaps**       |                                                                                            |           |
| Swap Routing           | `swapFlowRouterIntegration`, `swapMethodSelection`, `apiDelegationRouting`                 | 98        |
| **Institution Client** |                                                                                            |           |
| Auth                   | `institutionAuthService`, `institutionJwtMiddleware`                                       | 35        |
| Client Settings        | `institutionClientSettings`                                                                | 18        |
| **Institution Escrow** |                                                                                            |           |
| Escrow Service         | `institutionEscrowService`, `institutionEscrowStateMachine`                                | 59        |
| Escrow Validation      | `institutionEscrowValidation`                                                              | 74        |
| Escrow Program         | `institutionEscrowProgramService`                                                          | 47        |
| CDP Settlement         | `cdpSettlementService`                                                                     | 10        |
| Compliance & Allowlist | `complianceService`, `allowlistService`                                                    | 32        |
| AI Analysis            | `aiAnalysisService`                                                                        | 37        |
| File Service           | `institutionFileService`                                                                   | 57        |
| Receipt Service        | `institutionReceiptService`                                                                | 34        |
| Token Whitelist        | `institutionTokenWhitelist`                                                                | 19        |
| Data Anonymizer        | `dataAnonymizer`                                                                           | 26        |
| Solana Validators      | `solanaValidator`                                                                          | 49        |
| **Admin**              |                                                                                            |           |
| Admin Auth             | `adminAuthService`                                                                         | 17        |
| **Staging E2E**        |                                                                                            |           |
| Atomic Swaps           | `01-atomic-nft-for-sol`, `03-atomic-nft-for-nft`, `06-admin-cancel`, `09-api-key-zero-fee` | 4 suites  |
| Institution Auth       | `20-institution-auth-registration`                                                         | 1 suite   |
| Institution Escrow     | `21-create-deposit`, `22-settlement`, `23-cancellation-refund`, `25-primary-path`          | 4 suites  |
| Institution AI         | `24-institution-escrow-ai-analysis`, `26-ai-chat-guardrails`                               | 2 suites  |
| **Production**         |                                                                                            |           |
| Smoke Tests            | `01-health`, `02-api-health`, `03-database-redis`, `04-service-initialization`             | 4 suites  |
| E2E Tests              | `01` through `14` (NFT, cNFT, Core NFT, bulk, admin)                                       | 14 suites |

---

## Environment Variables

### Core

```env
PORT=3000
NODE_ENV=development
DATABASE_URL=                          # PostgreSQL connection string
SOLANA_RPC_URL=
SOLANA_RPC_URL_FALLBACK=               # Optional fallback RPC
SOLANA_NETWORK=devnet
ESCROW_PROGRAM_ID=
REDIS_URL=
JWT_SECRET=                            # Min 32 chars
API_KEY_SECRET=
ALLOWED_DOMAINS=easyescrow.ai,*.easyescrow.ai
```

### Atomic Swaps

```env
ENABLE_JITO_BUNDLES=true
JITO_TIP_LAMPORTS=1000000             # 0.001 SOL default tip
JITO_AUTH_UUID=                        # Optional, 5 rps with UUID vs 1 rps without
PLATFORM_FEE_BPS=250
PLATFORM_FEE_COLLECTOR_ADDRESS=
FEE_COLLECTOR_PRIVATE_KEY=
ADMIN_PRIVATE_KEY=
WEBHOOK_SECRET=
WEBHOOK_MAX_RETRIES=5
WEBHOOK_RETRY_DELAY_MS=1000
```

### cNFT / DAS API

```env
CNFT_STALE_PROOF_MAX_RETRIES=3
CNFT_STALE_OWNERSHIP_MAX_RETRIES=3
CNFT_STABILITY_MAX_CHECKS=3
CNFT_STABILITY_CHECK_INTERVAL=1000
CNFT_STABILITY_REQUIRED_CHECKS=2
DAS_RATE_LIMIT_INTERVAL_MS=750
```

### Institution Escrow (required when `INSTITUTION_ESCROW_ENABLED=true`)

```env
INSTITUTION_ESCROW_ENABLED=false       # Feature flag
USDC_MINT_ADDRESS=
INSTITUTION_ESCROW_MIN_USDC=100        # $100 minimum
INSTITUTION_ESCROW_MAX_USDC=1000000    # $1,000,000 maximum
INSTITUTION_ESCROW_DEFAULT_EXPIRY_HOURS=72
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d
ANTHROPIC_API_KEY=                     # AI compliance analysis
AI_ANALYSIS_MODEL=claude-sonnet-4-20250514
SETTLEMENT_AUTHORITY_API_KEY=
DO_SPACES_KEY=
DO_SPACES_SECRET=
DO_SPACES_ENDPOINT=
DO_SPACES_BUCKET=
DO_SPACES_REGION=
```

### CDP Settlement Authority (optional, when `CDP_ENABLED=true`)

```env
CDP_ENABLED=false                         # Feature flag
CDP_API_KEY_ID=                           # CDP API key ID
CDP_API_KEY_SECRET=                       # CDP API key secret
CDP_WALLET_SECRET=                        # CDP wallet secret
CDP_ACCOUNT_NAME=easyescrow-settlement-devnet  # Named Solana account
```

See `.env.example` for the complete list of all configuration options.

---

## Deployment

### DigitalOcean App Platform (Production)

Infrastructure deployed in **Singapore (sgp1)** for optimal Asia-Pacific performance.

```bash
# Deploy to staging
doctl apps create --spec .do/app-staging.yaml

# Deploy to production
doctl apps create --spec .do/app.yaml
```

### API Documentation

Interactive API docs are available at `/docs` on each environment:

- **Local**: http://localhost:3000/docs
- **Staging**: https://staging-api.easyescrow.ai/docs
- **Production**: https://api.easyescrow.ai/docs

OpenAPI spec (JSON):

- **Staging**: https://staging-api.easyescrow.ai/openapi.json
- **Production**: https://api.easyescrow.ai/openapi.json
- **Redoc (Staging)**: https://staging-api.easyescrow.ai/openapi-redoc.json
- **Redoc (Production)**: https://api.easyescrow.ai/openapi-redoc.json

---

## Security

- **Rate Limiting**: Per-endpoint rate limits (5/15min for auth, 30/min standard, 10/min for sensitive operations)
- **JWT Authentication**: Access + refresh token pattern for institution clients
- **Settlement Authority**: Separate API key required for fund release operations (optional CDP wallet for independent policy-gated signing)
- **PDA Security**: Program Derived Addresses for on-chain asset custody
- **Input Validation**: Express-validator chains on all endpoints
- **AI Data Anonymisation**: PII redacted before document analysis
- **File Upload Security**: Mime type validation, size limits, filename sanitisation
- **CORS & Helmet**: Security headers and origin whitelisting
- **Constant-Time Comparison**: Timing-safe token verification
- **Stealth Addresses (DKSAP)**: Address unlinkability via Dual-Key Stealth Address Protocol
- **On-Chain Receipt Encryption**: AES-256-GCM encrypted PDA receipts with fixed-size payloads
- **Transaction Pool Shielding**: Decoy members obscure real payment participants

---

## Documentation

### API Documentation

- [OpenAPI Specification](docs/api/openapi.yaml) — Complete API spec
- [Swagger Implementation](docs/api/SWAGGER_IMPLEMENTATION.md) — Docs setup guide
- [Interactive Swagger UI](https://api.easyescrow.ai/docs) — Live API explorer

### Architecture & Design

- [Swap Routing](docs/architecture/SWAP_ROUTING.md) — Jito vs escrow routing logic
- [Bulk Swap Architecture](docs/BULK_CNFT_SWAP_ARCHITECTURE.md) — Multi-NFT swap design
- [CDP Settlement Authority](docs/architecture/CDP_SETTLEMENT_AUTHORITY.md) — Independent settlement authority via Coinbase CDP
- [Stealth Addresses](docs/architecture/STEALTH_ADDRESSES.md) — DKSAP implementation for address unlinkability
- [Transaction Pools](docs/architecture/TRANSACTION_POOLS.md) — Batched settlement with pool lifecycle
- [Pool Receipt Encryption](docs/architecture/POOL_RECEIPT_ENCRYPTION.md) — AES-256-GCM on-chain receipt encryption
- [Payment Timelock](docs/architecture/PAYMENT_TIMELOCK.md) — Cooling-off period between funding and release

### Deployment

- [Deployment Guide](docs/DEPLOYMENT_GUIDE.md) — Full deployment instructions
- [Docker Guide](docs/DOCKER_DEPLOYMENT.md) — Docker deployment

### Testing

- [Testing Strategy](docs/testing/TESTING_STRATEGY.md) — Test approach and best practices

### Security

- [Secrets Management](docs/security/SECRETS_MANAGEMENT.md) — Secrets handling guide

---

## Support

For issues or questions: support@easyescrow.ai

## License

Copyright (c) 2025-2026 EasyEscrow.ai. All rights reserved.

This software and associated documentation files (the "Software") are proprietary and confidential. No part of this Software may be reproduced, distributed, transmitted, sublicensed, or otherwise made available to any third party, in any form or by any means, without the prior written permission of EasyEscrow.ai.

Unauthorized copying, modification, merging, publishing, distribution, sublicensing, selling, or any other use of this Software is strictly prohibited.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
