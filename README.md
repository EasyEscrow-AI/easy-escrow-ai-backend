<img src="media/easyescrow-logo.png" alt="EasyEscrow.ai Logo" width="400">

# EasyEscrow.ai Backend

Backend service for EasyEscrow.ai - an AI-powered escrow platform with Solana blockchain integration.

## Overview

This repository contains:
- Backend API and services for EasyEscrow.ai
- Solana smart contract (Anchor program) for secure NFT and USDC escrow transactions
- Integration layer between backend services and Solana blockchain
- Real-time deposit monitoring and agreement lifecycle management
- Automated expiry checking and refund processing

## Project Structure

```
/
├── README.md
├── SECURITY.md
├── docs/                      # 📚 Comprehensive documentation (see docs/README.md)
│   ├── setup/                # Setup and installation guides
│   ├── testing/              # Testing documentation
│   ├── architecture/         # System architecture and design
│   └── tasks/                # Task completion reports
├── src/                       # Backend TypeScript/Node.js source
│   ├── config/               # Configuration and database
│   │   ├── database.ts       # Prisma client setup
│   │   └── index.ts          # Environment config
│   ├── generated/            # Generated Prisma client
│   │   └── prisma/
│   ├── middleware/
│   ├── models/               # Data models and DTOs
│   │   ├── dto/              # Data Transfer Objects
│   │   └── validators/       # Input validators
│   ├── routes/
│   ├── services/
│   └── utils/
├── prisma/                    # Database schema and migrations
│   ├── schema.prisma         # Database schema definition
│   ├── migrations/           # Migration files
│   └── seed.ts               # Database seed script
├── programs/                  # Solana programs
│   └── escrow/               # Escrow smart contract
│       ├── src/
│       │   └── lib.rs        # Main program logic
│       ├── Cargo.toml
│       └── README.md         # Program documentation
├── tests/                     # Anchor tests
│   └── escrow.ts             # Test suite
├── scripts/                   # Utility scripts
│   ├── setup-database.sh     # Database setup (Unix)
│   └── setup-database.ps1    # Database setup (Windows)
├── Anchor.toml               # Anchor configuration
├── Cargo.toml                # Rust workspace config
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

The escrow program facilitates trustless transactions between buyers and sellers:

### Features
- **NFT & USDC Escrow**: Secure holding of NFTs and USDC during transactions
- **Automated Settlement**: Exchange assets when both parties fulfill obligations
- **Time-based Expiry**: Automatic cancellation after deadline
- **Admin Controls**: Emergency cancellation capability
- **PDA Security**: Program Derived Addresses ensure secure asset custody

### Instructions
- `init_agreement` - Create a new escrow
- `deposit_usdc` - Buyer deposits USDC
- `deposit_nft` - Seller deposits NFT
- `settle` - Complete the exchange
- `cancel_if_expired` - Cancel expired escrow
- `admin_cancel` - Emergency cancellation

For detailed program documentation, see [programs/escrow/README.md](programs/escrow/README.md).

## Backend API Features

### Agreement Management (Task 28)
Complete CRUD operations for escrow agreements:
- **Create Agreement**: Initialize new escrow with NFT and USDC terms
- **Get Agreement**: Retrieve agreement details by ID
- **List Agreements**: Query agreements with filters (status, buyer, seller, NFT)
- **Update Status**: Modify agreement status through lifecycle
- **Delete Agreement**: Remove agreements (admin only)

**Endpoints:**
- `POST /v1/agreements` - Create new agreement
- `GET /v1/agreements/:id` - Get agreement details
- `GET /v1/agreements` - List agreements with filters
- `PUT /v1/agreements/:id/status` - Update agreement status
- `DELETE /v1/agreements/:id` - Delete agreement

See [TASK_28_COMPLETION.md](docs/tasks/TASK_28_COMPLETION.md) for detailed API documentation.

### Real-Time Deposit Monitoring (Task 25)
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

See [TASK_25_COMPLETION.md](docs/tasks/TASK_25_COMPLETION.md) and [DEPOSIT_MONITORING.md](docs/architecture/DEPOSIT_MONITORING.md) for details.

### Expiry & Cancellation Management (Task 27)
Automated lifecycle management for agreements:
- **Expiry Checking**: Background service monitoring agreement deadlines
- **Refund Processing**: Automatic refund calculation and execution for partial deposits
- **Admin Cancellation**: Multisig approval workflow for emergency cancellations
- **Status Engine**: Rule-based automatic status transitions
- **Orchestration**: Unified service coordinating all expiry/cancellation operations

**API Endpoints:**
- `GET /api/expiry-cancellation/status` - Get orchestrator status
- `POST /api/expiry-cancellation/check-expired` - Manual expiry check
- `GET /api/expiry-cancellation/expiring-soon` - Get agreements about to expire
- `POST /api/expiry-cancellation/refund/process/:id` - Process refunds
- `POST /api/expiry-cancellation/cancellation/propose` - Create cancellation proposal
- `POST /api/expiry-cancellation/cancellation/sign/:id` - Sign proposal
- `POST /api/expiry-cancellation/cancellation/execute/:id` - Execute cancellation

See [TASK_27_COMPLETION.md](docs/tasks/TASK_27_COMPLETION.md) for complete documentation.

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

### Backend Tests
```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run lint          # Run linter
npm run type-check    # TypeScript type checking
npm run validate      # Run all checks (types, lint, tests)
```

### API Testing
See [TASK_28_TESTS.md](docs/tasks/TASK_28_TESTS.md) for comprehensive API test scenarios and examples.

### Solana Program Tests - Localnet (Recommended for Development)
Fast, free, and deterministic testing on local validator:

```bash
# Terminal 1: Start local validator
npm run localnet:start

# Terminal 2: Setup environment and run tests
npm run localnet:setup
anchor build && anchor deploy
npm run test:localnet
```

See [LOCALNET_SETUP.md](docs/setup/LOCALNET_SETUP.md) for complete setup guide.

### Solana Program Tests - Devnet
```bash
anchor test
anchor test -- --show-logs  # With detailed logs
```

## Deployment

### Solana Program Deployment

**Devnet (Testing):**
```bash
solana config set --url devnet
solana airdrop 2
anchor deploy
```

**Mainnet (Production):**
```bash
solana config set --url mainnet-beta
anchor deploy  # Requires SOL for deployment
```

### Backend Deployment

**Production (DigitalOcean App Platform - Singapore Region):**

Infrastructure deployed in **Singapore (sgp1)** for optimal Asia-Pacific performance:
- VPC Network (secure networking) - FREE
- PostgreSQL Clusters (STAGING + PROD) - $30/month
- Redis via Upstash (managed service) - FREE tier
- Spaces Object Storage (S3-compatible) - $5/month  
- App Platform instances - $15/month

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
- **[Deployment Guide](docs/DEPLOYMENT_GUIDE.md)** - Complete deployment instructions ⭐
- **[Deployment Summary](docs/DEPLOYMENT_SUMMARY.md)** - Quick reference with credentials
- [DigitalOcean Setup](docs/DIGITALOCEAN_SETUP.md) - Infrastructure details
- [Redis Infrastructure](docs/setup/REDIS_INFRASTRUCTURE.md) - Upstash Redis configuration
- [Spaces Setup](docs/SPACES_SETUP.md) - Object storage setup

**Docker (Local/Testing):**
```bash
# Build the Docker image
docker build -t easyescrow-backend:latest .

# Run with Docker Compose (includes PostgreSQL and Redis)
docker-compose up -d

# Check logs
docker-compose logs -f backend

# Health check
curl http://localhost:3000/health
```

See [DOCKER_DEPLOYMENT.md](docs/DOCKER_DEPLOYMENT.md) for complete Docker guide including:
- Docker Compose setup
- Production deployment best practices
- Kubernetes deployment examples
- Environment variable configuration

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

Create a `.env` file based on `.env.example`:

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

# Security
JWT_SECRET=your_jwt_secret
API_KEY_SECRET=your_api_key_secret

# Redis
REDIS_URL=redis://localhost:6379

# Platform
PLATFORM_FEE_BPS=250
```

See `.env.example` for complete configuration options.

## Current Status

### Completed ✅
- ✅ Solana escrow program implemented
- ✅ Program structure and tests created
- ✅ Backend project structure setup
- ✅ Database schema and migrations configured
- ✅ Models, DTOs, and validators implemented
- ✅ **Agreement API endpoints** (Task 28)
- ✅ **Real-time deposit monitoring** (Task 25)
- ✅ **Expiry and cancellation logic** (Task 27)
- ✅ **Docker configuration** (Task 33)
- ✅ Security middleware (CORS, Helmet, rate limiting)
- ✅ Comprehensive documentation

### In Progress ⏳
- ⏳ Settlement processing integration
- ⏳ Webhook delivery system
- ⏳ On-chain transaction integration
- ⏳ Frontend development
- ✅ **Production deployment setup** (Task 34) - DigitalOcean infrastructure ready

## Next Steps

1. ~~Install Solana development tools~~ ✅ (see SOLANA_SETUP.md)
2. ~~Build and test the escrow program~~ ✅
3. ~~Deploy to Solana devnet~~ ✅
4. ~~Implement backend API and services~~ ✅
5. Replace mock on-chain transactions with actual Solana program calls
6. Complete settlement processing integration
7. Implement webhook delivery system
8. Build frontend interface
9. End-to-end testing with real blockchain transactions
10. Security audit before mainnet

## Documentation

📚 **See [docs/README.md](docs/README.md) for comprehensive documentation index**

### Quick Links

**Setup & Getting Started:**
- [Setup Instructions](docs/setup/SETUP_INSTRUCTIONS.md) - Complete setup guide
- [Solana Setup](docs/setup/SOLANA_SETUP.md) - Solana development setup
- [Database Setup](docs/setup/DATABASE_SETUP.md) - Database configuration
- [Localnet Setup](docs/setup/LOCALNET_SETUP.md) - Local validator testing setup

**Testing:**
- [Testing Strategy](docs/testing/TESTING_STRATEGY.md) - Testing approach
- [Quick Start E2E Testing](docs/testing/QUICK_START_E2E_TESTING.md) - E2E test guide

**Architecture:**
- [API Documentation](docs/architecture/API_DOCUMENTATION.md) - REST API reference
- [Webhook System](docs/architecture/WEBHOOK_SYSTEM.md) - Webhook implementation
- [Deposit Monitoring](docs/architecture/DEPOSIT_MONITORING.md) - Deposit monitoring system

**Deployment:**
- **[Deployment Guide](docs/DEPLOYMENT_GUIDE.md)** - Complete deployment guide ⭐
- [Docker Deployment](docs/DOCKER_DEPLOYMENT.md) - Docker deployment guide
- [Migration Guide](docs/MIGRATION_GUIDE.md) - Database migrations
- [Environment Variables](docs/ENVIRONMENT_VARIABLES.md) - Environment configuration
- [DigitalOcean Setup](docs/DIGITALOCEAN_SETUP.md) - Infrastructure setup

**Security & Secrets Management:**
- **[Secrets Management Guide](docs/SECRETS_MANAGEMENT.md)** - Comprehensive secrets management 🔒
- [DigitalOcean Secrets Configuration](docs/DIGITALOCEAN_SECRETS_CONFIGURATION.md) - Platform secrets setup

### Task Completion Reports
- [TASK_25_COMPLETION.md](docs/tasks/TASK_25_COMPLETION.md) - Deposit Monitoring Implementation
- [TASK_27_COMPLETION.md](docs/tasks/TASK_27_COMPLETION.md) - Expiry & Cancellation Logic
- [TASK_39_COMPLETION.md](docs/tasks/TASK_39_COMPLETION.md) - Keypair & Secrets Management Implementation
- [TASK_28_COMPLETION.md](docs/tasks/TASK_28_COMPLETION.md) - Agreement API Endpoints
- [TASK_28_TESTS.md](docs/tasks/TASK_28_TESTS.md) - API Testing Guide
- [TASK_30_COMPLETION.md](docs/tasks/TASK_30_COMPLETION.md) - Settlement Receipt Generation
- [TASK_30_TEST_RESULTS.md](docs/tasks/TASK_30_TEST_RESULTS.md) - Task 30 Test Results
- [TASK_31_COMPLETION.md](docs/tasks/TASK_31_COMPLETION.md) - Redis Caching and Job Queues
- [TASK_33_COMPLETION.md](docs/tasks/TASK_33_COMPLETION.md) - Docker Configuration
- [TASK_35_COMPLETION.md](docs/tasks/TASK_35_COMPLETION.md) - Task 35 Completion
- [TASK_37_COMPLETION.md](docs/tasks/TASK_37_COMPLETION.md) - Task 37 Completion
- [TASK_37_SUMMARY.md](docs/tasks/TASK_37_SUMMARY.md) - Task 37 Summary
- [TASK_38_COMPLETION.md](docs/tasks/TASK_38_COMPLETION.md) - Localnet Testing Setup
- [PR_TASK_29_SUMMARY.md](docs/tasks/PR_TASK_29_SUMMARY.md) - PR Task 29 Summary
- [PR_TASK_38_SUMMARY.md](docs/tasks/PR_TASK_38_SUMMARY.md) - PR Task 38 Summary
- [PR_TASK_40_SUMMARY.md](docs/tasks/PR_TASK_40_SUMMARY.md) - PR Task 40 Summary

For more information, see the [Task Documentation Directory](docs/tasks/)

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

