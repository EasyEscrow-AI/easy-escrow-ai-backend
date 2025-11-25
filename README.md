<img src="media/easyescrow-logo.png" alt="EasyEscrow.ai Logo" width="800">

# EasyEscrow.ai Backend

🚀 **Production-Ready Atomic Swap Platform** - Trustless peer-to-peer NFT and SOL swaps on Solana blockchain.

## 🎯 Current Focus: Atomic Swaps

EasyEscrow.ai is a **100% Atomic Swap platform** enabling instant, trustless exchanges of NFTs, SOL, and compressed NFTs on Solana mainnet.

### Why Atomic Swaps?

✅ **Instant**: Single transaction execution—no waiting  
✅ **Trustless**: No escrow deposits, no backend coordination  
✅ **Secure**: All-or-nothing atomic execution  
✅ **Low Cost**: Minimal transaction fees  
✅ **Simple**: One transaction, instant settlement  

### Supported Swap Types

| Type | Description | Status |
|------|-------------|--------|
| **NFT ↔ SOL** | Exchange NFT for SOL tokens | ✅ **LIVE** |
| **NFT ↔ NFT (fee)** | NFT for NFT with platform fee | ✅ **LIVE** |
| **NFT ↔ NFT + SOL** | NFT for another NFT plus SOL | ✅ **LIVE** |
| **cNFT ↔ SOL** | Compressed NFT for SOL | 🔄 Coming Soon |
| **NFT ↔ cNFT** | Standard NFT for compressed NFT | 🔄 Coming Soon |

---

## 📌 Strategic Update

⚠️ **The legacy escrow system (multi-step deposits, settlement workflows) has been parked.** The platform now focuses exclusively on atomic swaps for superior UX and reduced complexity. See [Strategic Pivot Documentation](docs/STRATEGIC_PIVOT_ATOMIC_SWAPS.md).

---

## Overview

EasyEscrow.ai is a production-ready atomic swap platform built on Solana blockchain, featuring:

- **⚡ Atomic Swaps**: Instant, trustless peer-to-peer asset exchanges
- **🔐 Nonce-Based Transactions**: Durable transactions with automatic retry logic
- **🎨 NFT Support**: Standard NFTs (Metaplex) and compressed NFTs (upcoming)
- **💸 SOL Integration**: Native SOL token transfers in swaps
- **🌐 Multi-Environment**: Separate deployments for development, staging, and production
- **📡 RESTful API**: Comprehensive REST endpoints with OpenAPI/Swagger documentation
- **🔒 Security First**: Rate limiting, validation, and comprehensive error handling
- **☁️ Production Infrastructure**: Deployed on DigitalOcean with PostgreSQL, Redis, and Helius RPC
- **💰 Flexible Fees**: Dynamic platform fees (percentage or flat-rate)

## Project Structure

```
/
├── README.md
├── SECURITY.md
├── docs/                      # 📚 Comprehensive documentation
│   ├── STRATEGIC_PIVOT_ATOMIC_SWAPS.md  # 🎯 Current focus & roadmap
│   ├── ATOMIC_SWAP_TESTING.md           # Atomic swap test guide
│   ├── api/                  # API documentation
│   │   ├── openapi.yaml      # OpenAPI 3.0 specification
│   │   └── README.md         # API overview
│   ├── architecture/         # System design
│   ├── deployment/           # Deployment guides
│   ├── environments/         # Environment configs
│   ├── security/             # Security documentation
│   ├── setup/                # Installation guides
│   └── testing/              # Testing strategies
├── src/                       # Backend TypeScript/Node.js source
│   ├── config/               # Configuration
│   │   ├── database.ts       # Prisma client
│   │   └── index.ts          # Environment config
│   ├── generated/            # Generated Prisma client
│   ├── middleware/           # Express middleware
│   ├── models/               # Data models & validators
│   │   ├── dto/              # Data Transfer Objects
│   │   └── validators/       # Input validators
│   ├── routes/               # API routes
│   │   ├── offers.routes.ts  # ✅ Atomic swap endpoints (ACTIVE)
│   │   └── index.ts
│   ├── services/             # Business logic
│   │   ├── offerManager.ts          # ✅ Atomic swap manager (ACTIVE)
│   │   ├── assetValidator.ts        # ✅ NFT/cNFT/SOL validation (ACTIVE)
│   │   ├── feeCalculator.ts         # ✅ Dynamic fees (ACTIVE)
│   │   ├── transactionBuilder.ts    # ✅ Swap transactions (ACTIVE)
│   │   ├── noncePoolManager.ts      # ✅ Durable transactions (ACTIVE)
│   │   └── solana.service.ts        # ✅ Blockchain ops (ACTIVE)
│   ├── utils/                # Utility functions
│   │   └── swap-type-validator.ts   # ✅ Swap logic (ACTIVE)
│   ├── public/               # Static assets (Swagger UI)
│   └── index.ts              # Application entry point
├── prisma/                    # Database
│   ├── schema.prisma         # Database schema (atomic swaps)
│   ├── migrations/           # Migration files
│   └── seed.ts               # Dev seed data
├── programs/                  # Solana programs
│   └── escrow/               # Atomic swap smart contract
│       ├── src/lib.rs        # Program logic
│       ├── Cargo.toml
│       └── README.md
├── tests/                     # Test suites
│   ├── unit/                 # Unit tests
│   │   ├── atomic-swap-*.test.ts    # ✅ Atomic swap tests (ACTIVE)
│   │   └── nonce-pool-*.test.ts     # ✅ Nonce tests (ACTIVE)
│   ├── integration/          # Integration tests
│   ├── staging/e2e/          # Staging E2E tests
│   │   └── 01-atomic-nft-for-sol-happy-path.test.ts  # ✅ Primary E2E (ACTIVE)
│   ├── legacy/               # ⏸️ Legacy escrow tests (PARKED)
│   └── helpers/              # Test utilities
├── scripts/                   # Utility scripts
│   ├── deployment/           # Deployment automation
│   ├── development/          # Dev utilities
│   └── testing/              # Test helpers
├── Anchor.toml               # Dev Anchor config
├── Anchor.staging.toml       # Staging Anchor config
├── Anchor.mainnet.toml       # Production Anchor config
├── docker-compose.yml        # Docker services
├── Dockerfile                # Production Docker image
└── package.json              # Node.js dependencies
```

## Quick Start

### Backend Development

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

For detailed database setup instructions, see [DATABASE_SETUP.md](docs/setup/DATABASE_SETUP.md).

### Solana Program Development

**Prerequisites:**
- Rust
- Solana CLI
- Anchor Framework

See [SOLANA_SETUP.md](docs/setup/SOLANA_SETUP.md) for detailed installation instructions.

```bash
# Build the Solana program
anchor build

# Run tests
anchor test

# Deploy to devnet
anchor deploy
```

## Solana Escrow Program

The escrow program facilitates trustless transactions between buyers and sellers across multiple environments.

### Multi-Environment Deployment

| Environment | Network | Program ID | Status | Explorer |
|-------------|---------|------------|--------|----------|
| **DEV** | Devnet | `4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd` | ✅ Active | [View](https://explorer.solana.com/address/4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd?cluster=devnet) |
| **STAGING** | Devnet | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` | ✅ Active | [View](https://explorer.solana.com/address/AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei?cluster=devnet) |
| **PROD** | Mainnet | `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx` | ✅ LIVE | [View](https://solscan.io/account/2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx) |

See [PROGRAM_IDS.md](docs/environments/PROGRAM_IDS.md) for complete program ID registry.

### Features
- **NFT & USDC Escrow**: Non-custodial on-chain secure holding of NFTs and USDC during transactions
- **Automated Settlement**: Exchange assets when both parties fulfill obligations
- **Time-based Expiry**: Automatic cancellation after deadline
- **Admin Controls**: Emergency cancellation capability
- **PDA Security**: Program Derived Addresses ensure secure asset custody
- **Fee Collection**: Configurable platform fees with optional royalty support

### Instructions
- `init_agreement` - Create a new escrow
- `deposit_usdc` - Buyer deposits USDC
- `deposit_nft` - Seller deposits NFT
- `settle` - Complete the exchange
- `cancel_if_expired` - Cancel expired escrow
- `admin_cancel` - Emergency cancellation

For detailed program documentation, see [programs/escrow/README.md](programs/escrow/README.md).

## Backend API Features

### 🔌 Interactive API Documentation

**Swagger UI** is available at `/docs` for interactive API exploration:

- **Local**: http://localhost:3000/docs
- **Staging**: https://api-staging.easyescrow.ai/docs
- **Production**: https://api.easyescrow.ai/docs

Features:
- Try out API endpoints directly from your browser
- Complete request/response schemas with examples
- Authentication testing interface
- Error code reference

See [SWAGGER_IMPLEMENTATION.md](docs/api/SWAGGER_IMPLEMENTATION.md) for details.

### Agreement Management
Complete CRUD operations for escrow agreements:
- **Create Agreement**: Initialize new escrow with NFT and USDC terms
- **Get Agreement**: Retrieve agreement details by ID
- **List Agreements**: Query agreements with filters (status, buyer, seller, NFT)
- **Update Status**: Modify agreement status through lifecycle
- **Delete Agreement**: Remove agreements (admin only)

**Key Endpoints:**
- `POST /v1/agreements` - Create new agreement
- `GET /v1/agreements/:id` - Get agreement details
- `GET /v1/agreements` - List agreements with filters
- `PUT /v1/agreements/:id/status` - Update agreement status
- `DELETE /v1/agreements/:id` - Delete agreement

### Real-Time Deposit Monitoring
Automatic monitoring and processing of deposits:
- **USDC Deposit Monitoring**: Real-time detection of USDC transfers
- **NFT Deposit Monitoring**: Automatic NFT ownership verification
- **WebSocket Subscriptions**: Live monitoring of deposit addresses
- **Status Updates**: Automatic agreement status transitions
- **Event Emission**: Webhooks for deposit events

**Features:**
- Background service monitoring all active agreements
- Automatic restart on failures with exponential backoff
- Health checks and metrics collection
- Comprehensive error handling and logging

See [DEPOSIT_MONITORING.md](docs/architecture/DEPOSIT_MONITORING.md) for details.

### Expiry & Cancellation Management
Automated lifecycle management for agreements:
- **Expiry Checking**: Background service monitoring agreement deadlines
- **Refund Processing**: Automatic refund calculation and execution for partial deposits
- **Admin Cancellation**: Multisig approval workflow for emergency cancellations
- **Status Engine**: Rule-based automatic status transitions
- **Orchestration**: Unified service coordinating all expiry/cancellation operations

**Key Endpoints:**
- `GET /api/expiry-cancellation/status` - Get orchestrator status
- `POST /api/expiry-cancellation/check-expired` - Manual expiry check
- `GET /api/expiry-cancellation/expiring-soon` - Get agreements about to expire
- `POST /api/expiry-cancellation/refund/process/:id` - Process refunds

### Settlement Receipts
Cryptographically signed receipts for completed transactions:
- **Receipt Generation**: Automatic creation on settlement
- **Digital Signatures**: Ed25519 signatures for verification
- **Receipt Verification**: Public API for signature validation
- **Transaction Logs**: Complete audit trail of all operations

**Key Endpoints:**
- `GET /v1/receipts` - List receipts
- `GET /v1/receipts/{id}` - Get receipt by ID
- `GET /v1/receipts/agreement/{id}` - Get receipt by agreement
- `POST /v1/receipts/{id}/verify` - Verify receipt signature

### Webhook System
Real-time event notifications for all escrow lifecycle events:
- **Event Types**: ESCROW_FUNDED, ESCROW_ASSET_LOCKED, ESCROW_SETTLED, ESCROW_EXPIRED, ESCROW_REFUNDED
- **Retry Logic**: Automatic retry with exponential backoff
- **Signature Verification**: HMAC-SHA256 webhook signatures
- **Delivery Tracking**: Monitor webhook delivery status

**Management Endpoints:**
- `GET /api/webhooks/{agreementId}` - Get webhooks for agreement
- `GET /api/webhooks/status/{webhookId}` - Get webhook delivery status
- `POST /api/webhooks/retry/{webhookId}` - Retry webhook delivery

See [WEBHOOK_EVENTS.md](docs/api/WEBHOOK_EVENTS.md) and [WEBHOOK_SYSTEM.md](docs/architecture/WEBHOOK_SYSTEM.md) for complete documentation.

## Development Workflow

### Setting Up Solana Environment (First Time)

1. Follow the complete setup guide in [SOLANA_SETUP.md](SOLANA_SETUP.md)
2. Install Rust, Solana CLI, and Anchor Framework
3. Configure for devnet and get test SOL
4. Build and test the program

### Making Changes to the Smart Contract

1. Edit `programs/escrow/src/lib.rs`
2. Run `anchor build` to compile
3. Run `anchor test` to verify functionality
4. Deploy with `anchor deploy` when ready

### Backend Integration

The backend will integrate with the deployed Solana program via:
- Anchor TypeScript client
- Web3.js for transaction signing
- WebSocket subscriptions for real-time updates

## Testing

### Test Coverage

The project includes comprehensive test coverage across multiple levels:

| Test Type | Location | Coverage | Purpose |
|-----------|----------|----------|---------|
| **Unit Tests** | `tests/unit/` | 80%+ | Service logic, utilities, validators |
| **Integration Tests** | `tests/integration/` | All endpoints | API routes, database operations |
| **E2E Tests** | `tests/staging/` | Critical paths | End-to-end workflows on devnet |
| **On-Chain Tests** | `tests/escrow.ts` | All instructions | Solana program security & functionality |

### Running Tests

#### Backend Tests
```bash
# Run all tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Watch mode (auto-rerun on changes)
npm run test:watch

# Validation suite (types, lint, tests)
npm run validate
```

#### On-Chain Tests - Localnet (Recommended)
Fast, free, and deterministic testing on local validator:

```bash
# Terminal 1: Start local validator
npm run localnet:start

# Terminal 2: Setup and run tests
npm run localnet:setup
anchor build && anchor deploy
npm run test:localnet
```

See [LOCALNET_SETUP.md](docs/setup/LOCALNET_SETUP.md) for complete setup guide.

#### On-Chain Tests - Devnet
```bash
anchor test
anchor test -- --show-logs  # With detailed logs
```

#### E2E Tests - Staging Environment
```bash
# Run staging E2E tests
npm run test:staging

# Run production smoke tests
npm run test:production
```

### Test Documentation

- **[TESTING_STRATEGY.md](docs/testing/TESTING_STRATEGY.md)** - Complete testing strategy and best practices
- **[QUICK_START_E2E_TESTING.md](docs/testing/QUICK_START_E2E_TESTING.md)** - E2E testing guide
- **[TEST_COVERAGE_SUMMARY.md](docs/testing/TEST_COVERAGE_SUMMARY.md)** - Coverage reports

## Deployment

### Solana Program Deployment

⚠️ **CRITICAL:** We use **STATIC program IDs**. Always verify you're upgrading existing programs, not creating new ones!

**Staging (Devnet):**
```bash
# Build for staging
npm run solana:build:staging

# Deploy (script includes safety checks)
./scripts/deployment/staging/deploy-to-staging.ps1
```

**Production (Mainnet):**
```bash
# Build for mainnet
npm run solana:build:mainnet

# Deploy (script includes safety checks)
./scripts/deployment/production/deploy-to-production.ps1
```

**Safety Checks:**
- Scripts validate program ID before deployment
- Blocks accidental new program creation
- See [PROGRAM_DEPLOYMENT_SAFETY.md](docs/deployment/PROGRAM_DEPLOYMENT_SAFETY.md) for details

### Backend Deployment

**Production (DigitalOcean App Platform - Singapore Region):**

Infrastructure deployed in **Singapore (sgp1)** for optimal Asia-Pacific performance:

**Monthly Costs (USD/AUD):**
- **Digital Ocean App Servers:**
  - Dev: $5/m USD (~$8/m AUD)
  - Staging: $5/m USD (~$8/m AUD)
  - Production: $15/m USD (~$23/m AUD)
- **Digital Ocean Droplet Servers:**
  - Production: $6/m USD (~$9/m AUD)
- **Digital Ocean PostgreSQL Databases:**
  - Dev: FREE
  - Staging: $15/m USD (~$23/m AUD)
  - Production: $15/m USD (~$23/m AUD)
- **Digital Ocean Spaces (Object Storage):**
  - Test storage: $5/m USD (~$8/m AUD)
  - Production storage: $5/m USD (~$8/m AUD)
- **Redis Cloud:**
  - Staging: FREE
  - Production: $25/m USD (~$39/m AUD)
- **QuickNode RPC:** $49/m USD (~$75/m AUD)

**Note:** Private VPC (Virtual Private Cloud) is planned for future implementation but not yet deployed.

Quick Deploy:
```bash
# Deploy to DEV (FREE database)
doctl apps create --spec .do/app-dev.yaml

# Deploy to STAGING  
doctl apps create --spec .do/app-staging.yaml

# Deploy to PROD
doctl apps create --spec .do/app.yaml
```

**Deployment Documentation:**
- **[Deployment Scripts Guide](docs/DEPLOYMENT_SCRIPTS_GUIDE.md)** - Automated deployment with devnet secrets ⭐ NEW
- **[Deployment Guide](docs/DEPLOYMENT_GUIDE.md)** - Complete deployment instructions ⭐
- **[Devnet Deployment Guide](docs/DEVNET_DEPLOYMENT_GUIDE.md)** - E2E testing on devnet ⭐ NEW
- **[Deployment Summary](docs/DEPLOYMENT_SUMMARY.md)** - Quick reference with credentials
- [DigitalOcean Setup](docs/DIGITALOCEAN_SETUP.md) - Infrastructure details
- [Redis Infrastructure](docs/setup/REDIS_INFRASTRUCTURE.md) - Redis Cloud configuration
- [Spaces Setup](docs/SPACES_SETUP.md) - Object storage setup

**Environment References:**
- **[STAGING Reference](docs/STAGING_REFERENCE.md)** - Complete STAGING environment reference (program IDs, wallets, infrastructure) ⭐ NEW
- [Program IDs](docs/PROGRAM_IDS.md) - Program IDs across all environments
- [STAGING Wallets](docs/STAGING_WALLETS.md) - STAGING wallet addresses and management

**Docker (Local/Testing):**

Using npm scripts (recommended):
```bash
# Start all services (backend, PostgreSQL, Redis)
npm run docker:start

# Restart services (graceful)
npm run docker:restart                # All services
npm run docker:restart:backend        # Backend only
npm run docker:restart:db             # Database only
npm run docker:restart:redis          # Redis only

# Rebuild and restart (after code changes)
npm run docker:rebuild                # All services
npm run docker:rebuild:backend        # Backend only

# Fresh start (eliminate all cache issues)
npm run docker:fresh                  # Complete fresh build (removes all data)
npm run docker:fresh:keep-data        # Fresh build but keep database/Redis data
npm run docker:fresh:seed             # Fresh build with sample data

# View logs
npm run docker:logs                   # All services
npm run docker:logs:backend           # Backend only
npm run docker:logs:db                # Database only
npm run docker:logs:redis             # Redis only

# Check service health
npm run docker:ps                     # Service status
npm run docker:health                 # Health check

# Stop all services
npm run docker:stop
```

Or using Docker Compose directly:
```bash
# Build the Docker image
docker build -t easyescrow-backend:latest .

# Run with Docker Compose (includes PostgreSQL and Redis)
docker compose up -d

# Graceful restart (ALWAYS use this instead of killing processes)
docker compose restart backend

# Check logs
docker compose logs -f backend

# Health check (PowerShell)
Invoke-WebRequest -Uri "http://localhost:3000/health" -Method GET
```

**Important:** Always use Docker commands for graceful restarts. Never use process killing commands (`pkill`, `taskkill`) with Dockerized services. See [DOCKER_GRACEFUL_RESTART.md](docs/DOCKER_GRACEFUL_RESTART.md) for complete guide.

**Cache Issues?** If you're experiencing Docker cache issues (old code, stale configs, outdated IDLs), use the fresh start script to completely rebuild everything. See [DOCKER_CACHE_ELIMINATION.md](docs/DOCKER_CACHE_ELIMINATION.md) for details.

See [DOCKER_DEPLOYMENT.md](docs/DOCKER_DEPLOYMENT.md) for complete Docker guide including:
- Docker Compose setup
- Production deployment best practices
- Kubernetes deployment examples
- Environment variable configuration
- Graceful restart strategies

**Manual Deployment:**
```bash
# Build the application
npm run build

# Run database migrations
npm run db:migrate:deploy

# Start the production server
npm start
```

## Environment Variables

Create a `.env` file in the project root. See [ENV_TEMPLATE.md](docs/ENV_TEMPLATE.md) for complete template with all variables and devnet wallet configuration.

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/easyescrow_dev?schema=public"

# Solana
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
ESCROW_PROGRAM_ID=

# Wallet Configuration (Required)
# Admin Wallet (for settlement operations)
DEVNET_ADMIN_PRIVATE_KEY=your_admin_private_key_base58
DEVNET_ADMIN_ADDRESS=your_admin_public_key

# Fee Collector Wallet (for platform fees)
DEVNET_FEE_COLLECTOR_PRIVATE_KEY=your_fee_collector_private_key_base58
DEVNET_FEE_COLLECTOR_ADDRESS=your_fee_collector_public_key

# Platform Fee Collector Address
PLATFORM_FEE_COLLECTOR_ADDRESS=your_platform_fee_collector_address

# Security
JWT_SECRET=your_jwt_secret
API_KEY_SECRET=your_api_key_secret

# Redis
REDIS_URL=redis://localhost:6379

# Platform
PLATFORM_FEE_BPS=250
```

**Important:** Replace wallet private keys and addresses with your actual values. Never commit these to version control.

See `.env.example` for complete configuration options.

## Security

EasyEscrow.ai implements comprehensive security measures across all layers:

### Secrets Management
- **No Hardcoded Secrets**: All sensitive data loaded from environment variables
- **Pre-commit Scanning**: Automatic detection of accidentally committed secrets
- **Secure Storage**: Integration with DigitalOcean secrets, AWS Secrets Manager, Kubernetes secrets
- **Keypair Formats**: Support for JSON array, Base58, and Base64 formats
- **Automatic Validation**: Startup validation of all required secrets

See [SECRETS_MANAGEMENT.md](docs/security/SECRETS_MANAGEMENT.md) for complete guide.

### API Security
- **Rate Limiting**: 100 requests per 15 minutes (standard), 10 requests per 15 minutes (strict endpoints)
- **CORS Protection**: Configurable origin whitelist
- **Helmet.js**: Security headers (CSP, HSTS, X-Frame-Options, etc.)
- **Input Validation**: Comprehensive DTO validation with Joi
- **Idempotency Keys**: Prevent duplicate transaction processing
- **Request Signing**: HMAC-SHA256 webhook signatures

### On-Chain Security
- **PDA Security**: Program Derived Addresses prevent unauthorized access
- **Account Validation**: Strict validation of all account ownership and data
- **Amount Verification**: Precise lamport-level amount checking
- **Double-Spend Prevention**: State checks prevent duplicate deposits/settlements
- **Time-Lock Protection**: Expiry-based automatic cancellation
- **Admin Controls**: Multi-signature emergency cancellation (planned for mainnet)

### Infrastructure Security
- **Private VPC**: Planned for future implementation (not yet deployed)
- **Encrypted Secrets**: All secrets encrypted at rest in DigitalOcean
- **TLS/SSL**: HTTPS enforced for all API endpoints
- **Database Security**: SSL-required PostgreSQL connections
- **Redis Security**: Password-protected Redis instances
- **Audit Logging**: Complete transaction logs for all operations

### Security Documentation
- [SECRETS_MANAGEMENT.md](docs/security/SECRETS_MANAGEMENT.md) - Comprehensive secrets management guide
- [SECURITY_POLICY.md](docs/security/SECURITY_POLICY.md) - Security policy and reporting
- [DIGITALOCEAN_SECRETS_CONFIGURATION.md](docs/DIGITALOCEAN_SECRETS_CONFIGURATION.md) - Platform secrets setup

## Documentation

📚 **Complete documentation available in [docs/](docs/) directory**

### Quick Links

#### API Documentation
- **[API Overview](docs/api/README.md)** - Complete API reference
- **[OpenAPI Specification](docs/api/openapi.yaml)** - OpenAPI 3.0 spec
- **[Swagger UI](http://localhost:3000/docs)** - Interactive API documentation
- **[Integration Guide](docs/api/INTEGRATION_GUIDE.md)** - Step-by-step integration
- **[Webhook Events](docs/api/WEBHOOK_EVENTS.md)** - Real-time event notifications
- **[Error Codes](docs/api/ERROR_CODES.md)** - Complete error reference

#### Setup & Getting Started
- [Setup Instructions](docs/setup/SETUP_INSTRUCTIONS.md) - Complete setup guide
- [Solana Setup](docs/setup/SOLANA_SETUP.md) - Solana development setup
- [Database Setup](docs/setup/DATABASE_SETUP.md) - Database configuration
- [Localnet Setup](docs/setup/LOCALNET_SETUP.md) - Local validator testing
- [Environment Variables](docs/environments/ENVIRONMENT_VARIABLES.md) - Configuration reference

#### Testing
- [Testing Strategy](docs/testing/TESTING_STRATEGY.md) - Complete testing approach
- [Quick Start E2E Testing](docs/testing/QUICK_START_E2E_TESTING.md) - E2E test guide
- [Test Coverage Summary](docs/testing/TEST_COVERAGE_SUMMARY.md) - Coverage reports

#### Architecture & Design
- [Deposit Monitoring](docs/architecture/DEPOSIT_MONITORING.md) - Real-time monitoring system
- [Webhook System](docs/architecture/WEBHOOK_SYSTEM.md) - Event notification architecture
- [IDL Management](docs/architecture/IDL_MANAGEMENT.md) - Solana IDL handling
- [Idempotency Implementation](docs/architecture/IDEMPOTENCY_IMPLEMENTATION.md) - Duplicate prevention

#### Deployment
- [Deployment Guide](docs/DEPLOYMENT_GUIDE.md) - Complete deployment instructions
- [Docker Deployment](docs/DOCKER_DEPLOYMENT.md) - Docker deployment guide
- [DigitalOcean Setup](docs/DIGITALOCEAN_SETUP.md) - Infrastructure setup
- [Environment Setup](docs/environments/ENVIRONMENT_SETUP.md) - Multi-environment configuration

#### Security
- **[Secrets Management](docs/security/SECRETS_MANAGEMENT.md)** - Comprehensive secrets guide
- [Security Policy](docs/security/SECURITY_POLICY.md) - Security policy and reporting
- [DigitalOcean Secrets](docs/DIGITALOCEAN_SECRETS_CONFIGURATION.md) - Platform secrets setup

#### Environments
- [Program IDs](docs/environments/PROGRAM_IDS.md) - Program IDs across environments
- [Environment Variables](docs/environments/ENVIRONMENT_VARIABLES.md) - Configuration reference
- [Staging Strategy](docs/architecture/STAGING_STRATEGY.md) - Staging environment approach

### External Resources
- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Documentation](https://docs.solana.com/)
- [Solana Cookbook](https://solanacookbook.com/)
- [SPL Token Guide](https://spl.solana.com/token)

## Support

For issues or questions:
- Check existing documentation
- Review Anchor/Solana resources
- Open an issue in this repository

## License

All rights reserved.

