<img src="media/easyescrow-logo.png" alt="EasyEscrow.ai Logo" width="800">

# EasyEscrow.ai Backend

Non-custodial digital escrow platform on Solana. Backend API service powering atomic swaps and institutional cross-border stablecoin escrow payments.

**Live Documentation:** [staging-api.easyescrow.ai/docs](https://staging-api.easyescrow.ai/docs)

---

## Changelog

### v1.1.0 — Institutional Escrow (March 2026)

Cross-border stablecoin escrow payments for institutional clients.

- Institution client authentication (JWT) with registration, login, and token refresh
- USDC escrow lifecycle: create, deposit, release, and cancel
- AI-powered document analysis for compliance risk scoring
- Wallet whitelists and jurisdiction payment corridors
- File uploads for escrow supporting documents (PDF, images, Excel, CSV)
- KYB profile management and client search/discovery
- API key management for programmatic access
- Admin endpoints for allowlist and corridor configuration
- Settlement authority pattern for release operations
- AI data anonymisation (PII redaction before model processing)
- Escrow Settlement Mode: Atomic (non-custodial proof of funds) / Escrow (full PDA escrow)
- Escrow Release Terms: programmable release mechanisms
- Full blockchain audit of payment escrows and downloadable compliance & audit reports
- Supports KYC/KYB compliance integrations (not activated for hackathon)
- Supports AMINA Payment Network (APN) integrations (not activated for hackathon)

### v1.0.0 — Atomic Swaps (October 2025)

Non-custodial peer-to-peer NFT and SOL atomic swaps on Solana.

- NFT <> SOL, NFT <> NFT, and NFT + SOL <> NFT swap types
- Support for SPL NFTs, Core NFTs, Compressed NFTs (cNFTs), and Programmable NFTs (pNFTs)
- Jito bundle swaps for multi-NFT transactions (up to 4 NFTs)
- TwoPhase fallback for bundle failures
- Compressed NFT support with Merkle proof handling via DAS API
- Dynamic platform fee calculation (1% SOL swaps, 0.005 SOL flat for NFT-only)
- Offer lifecycle management (create, accept, cancel, counter, expire)
- Durable nonce pool for reliable transaction submission
- Health monitoring and service status endpoints

---

## Atomic Swaps

Instant, non-custodial digital swaps that execute in a single transaction. Your assets are NEVER held in escrow — they only leave your wallet upon instant settlement. The swap happens atomically or not at all (no partial settlement, no MEV attacks, no stuck assets).

### Supported Swap Types

| Type | Description | Status |
|------|-------------|--------|
| **NFT <> SOL** | Exchange NFT for SOL tokens | LIVE |
| **NFT <> NFT (fee)** | NFT for NFT with platform fee | LIVE |
| **NFT <> NFT + SOL** | NFT for another NFT plus SOL | LIVE |
| **cNFT <> SOL** | Compressed NFT for SOL | LIVE |
| **NFT <> cNFT** | Standard NFT for compressed NFT | LIVE |
| **Bulk Swaps** | Multiple NFTs (up to 4 total) | LIVE |

### Supported Assets

| Asset | Description | Status |
|-------|-------------|--------|
| **SPL NFT** | Solana SPL Token NFT (Metaplex standard) | Supported |
| **Core NFT** | Solana Metaplex Core NFT | Supported |
| **cNFT** | Solana Compressed NFT (Metaplex Bubblegum) | Supported |
| **pNFT** | Programmable NFT (on-chain royalty enforcement) | Supported |
| **SOL** | Solana native token | Supported |

### Bulk Swap & cNFT Features

- **Multi-Asset Swaps**: Up to 4 NFTs total per swap via Jito bundles for atomic execution
- **Direct Bubblegum transfers**: cNFTs transfer directly without escrow custody
- **Merkle proof handling**: Automatic proof fetching from DAS API with stale proof retry
- **Canopy optimization**: Automatic proof trimming based on on-chain canopy depth
- **Address Lookup Tables**: Automatic ALT usage for transaction size optimization

### Platform Fees & Limits

| Parameter | Value |
|-----------|-------|
| NFT-only swaps | 0.005 SOL flat fee |
| Swaps with SOL | 1% of total SOL amount |
| Minimum fee | 0.001 SOL |
| Maximum fee | 0.5 SOL (fee cap) |
| Min SOL | 0.1 SOL |
| Max SOL | 15 SOL (~$5,000 AUD limit) |
| Max NFTs per swap | 4 (Jito bundle limit) |
| Offer expiry | 1 hour to 30 days (default: 7 days) |

### Offer Management

- **Private Sales**: Restrict offers to specific taker wallets
- **Counter-Offers**: Full counter-offer chain support with asset modification
- **Offer Updates**: Update SOL amounts via `PUT /api/offers/:id`
- **Offer Cancellation**: Maker and admin cancellation with nonce advancement

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

### Escrow Lifecycle

```
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

| Category | Endpoints | Description |
|----------|-----------|-------------|
| **Auth** | register, login, refresh, logout, me, password | JWT authentication with rate limiting |
| **Settings** | get/update settings, wallet management, API keys | Client configuration |
| **Clients** | search, list, profile, archive | Client discovery and management |
| **Files** | upload, list, download, delete | Document management for compliance |
| **Escrow** | create, deposit, release, cancel, get, list | USDC escrow payment lifecycle |
| **AI Analysis** | analyze document, get results | AI compliance risk scoring |
| **Admin** | allowlist CRUD, corridor configuration | Administrative operations |

### Settlement Authority

Release operations require a separate settlement authority API key, enforcing separation of duties between escrow creation and fund release. This is validated via the `requireSettlementAuthority` middleware.

---

## Architecture

### Tech Stack

- **Runtime**: Node.js + Express + TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis (rate limiting, session management, caching)
- **Blockchain**: Solana (web3.js, Anchor, SPL Token)
- **AI**: Anthropic Claude API (document analysis)
- **Storage**: DigitalOcean Spaces (S3-compatible, document uploads)
- **Documentation**: OpenAPI 3.0 with Redoc
- **Deployment**: DigitalOcean App Platform

### Core Services

| Service | Purpose |
|---------|---------|
| `offerManager.ts` | Atomic swap offer lifecycle (create/accept/cancel) |
| `transactionBuilder.ts` | Builds swap transaction instructions |
| `transactionGroupBuilder.ts` | Multi-transaction bundles for bulk swaps |
| `bulkSwapExecutor.ts` | Jito bundle execution with TwoPhase fallback |
| `assetValidator.ts` | NFT/cNFT/SOL ownership and metadata validation |
| `cnftService.ts` | DAS API integration for cNFT Merkle proofs |
| `feeCalculator.ts` | Dynamic platform fee calculation |
| `noncePoolManager.ts` | Durable nonce account management |

### Institution Escrow Services

| Service | Purpose |
|---------|---------|
| `institution-auth.service.ts` | JWT authentication (access + refresh tokens) |
| `institution-escrow.service.ts` | USDC escrow lifecycle (create/fund/release/cancel) |
| `institution-escrow-program.service.ts` | On-chain transaction building (PDA derivation, ATA management) |
| `institution-client-settings.service.ts` | Client settings, wallet, and API key management |
| `institution-file.service.ts` | Document uploads to DigitalOcean Spaces |
| `ai-analysis.service.ts` | AI compliance analysis via Claude API |
| `allowlist.service.ts` | Wallet allowlist management (Redis + Prisma) |
| `compliance.service.ts` | Corridor validation, risk scoring, volume limits |

### Database Models

**Atomic Swaps**: `Agreement`, `SwapOffer`, `NoncePoolEntry`, `Receipt`

**Institution Escrow**: `InstitutionClient`, `InstitutionWallet`, `InstitutionRefreshToken`, `InstitutionClientSettings`, `InstitutionApiKey`, `InstitutionEscrow`, `InstitutionDeposit`, `InstitutionAuditLog`, `InstitutionAiAnalysis`, `InstitutionCorridor`, `InstitutionFile`

### Solana Program

| Environment | Network | Program ID | Status |
|-------------|---------|------------|--------|
| **DEV** | Devnet | `4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd` | Active |
| **STAGING** | Devnet | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` | Active |
| **PROD** | Mainnet | `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx` | LIVE |

---

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

**Important**: Always use Docker compose commands for restarts. Never use process killing commands (`pkill`, `taskkill`) with Dockerized services.

---

## Testing

| Test Type | Command | Timeout |
|-----------|---------|---------|
| Unit tests | `npm run test:unit` | 10s |
| Single test file | `npx cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/unit/YOUR_TEST.test.ts --timeout 10000` | 10s |
| Integration tests | `npm run test:integration` | 20s |
| Staging E2E | `npm run test:staging:e2e:atomic:all` | 180s |
| Production smoke | `npm run test:production:smoke:all` | 180s |

### Test Coverage

| Area | Files | Tests |
|------|-------|-------|
| Atomic Swap Routing | `swapFlowRouterIntegration`, `swapMethodSelection`, `apiDelegationRouting` | 50+ |
| Institution Auth | `institutionAuthService`, `institutionJwtMiddleware` | 40+ |
| Institution Escrow | `institutionEscrowService`, `institutionEscrowStateMachine` | 40+ |
| Institution Settings | `institutionClientSettings` | 25+ |
| Compliance & Allowlist | `complianceService`, `allowlistService` | 30+ |
| AI Analysis | `aiAnalysisService` | 22 |
| File Service | `institutionFileService` | 32 |
| Program Service | `institutionEscrowProgramService` | 28 |
| Validators | `solanaValidator` | 48 |
| Validation Middleware | `institutionEscrowValidation` | 57 |

---

## Environment Variables

### Core

```env
PORT=3000
NODE_ENV=development
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/easyescrow_dev?schema=public"
SOLANA_RPC_URL=https://api.devnet.solana.com
ESCROW_PROGRAM_ID=AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret_min_32_chars
```

### Atomic Swaps

```env
JITO_BUNDLES_ENABLED=true
JITO_AUTH_UUID=                         # Optional, 5 rps with UUID vs 1 rps without
PLATFORM_FEE_BPS=250
PLATFORM_FEE_COLLECTOR_ADDRESS=your_fee_collector_address
```

### Institution Escrow (required when `INSTITUTION_ESCROW_ENABLED=true`)

```env
INSTITUTION_ESCROW_ENABLED=false        # Feature flag
USDC_MINT_ADDRESS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
INSTITUTION_ESCROW_MIN_USDC=1           # $1 minimum
INSTITUTION_ESCROW_MAX_USDC=3000        # $3,000 maximum
ANTHROPIC_API_KEY=your_claude_api_key   # AI compliance analysis
AI_ANALYSIS_MODEL=claude-sonnet-4-20250514
SETTLEMENT_AUTHORITY_API_KEY=your_settlement_key
DO_SPACES_ENDPOINT=nyc3.digitaloceanspaces.com
DO_SPACES_REGION=nyc3
DO_SPACES_BUCKET=your_bucket_name
DO_SPACES_KEY=your_spaces_key
DO_SPACES_SECRET=your_spaces_secret
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

---

## Security

- **Rate Limiting**: Per-endpoint rate limits (5/15min for auth, 30/min standard, 10/min for sensitive operations)
- **JWT Authentication**: Access + refresh token pattern for institution clients
- **Settlement Authority**: Separate API key required for fund release operations
- **PDA Security**: Program Derived Addresses for on-chain asset custody
- **Input Validation**: Express-validator chains on all endpoints
- **AI Data Anonymisation**: PII redacted before document analysis
- **File Upload Security**: Mime type validation, size limits, filename sanitisation
- **CORS & Helmet**: Security headers and origin whitelisting
- **Constant-Time Comparison**: Timing-safe token verification

---

## Documentation

- [OpenAPI Specification](docs/api/openapi.yaml) — Complete API spec
- [Swagger Implementation](docs/api/SWAGGER_IMPLEMENTATION.md) — Docs setup guide
- [Bulk Swap Architecture](docs/BULK_CNFT_SWAP_ARCHITECTURE.md) — Multi-NFT swap design
- [Swap Routing](docs/architecture/SWAP_ROUTING.md) — Jito vs escrow routing logic
- [Deployment Guide](docs/DEPLOYMENT_GUIDE.md) — Full deployment instructions
- [Docker Guide](docs/DOCKER_DEPLOYMENT.md) — Docker deployment
- [Testing Strategy](docs/testing/TESTING_STRATEGY.md) — Test approach and best practices
- [Secrets Management](docs/security/SECRETS_MANAGEMENT.md) — Secrets handling guide

---

## Support

For issues or questions: support@easyescrow.ai

## License

All rights reserved.
