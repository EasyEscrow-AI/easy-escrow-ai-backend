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
├── SOLANA_SETUP.md           # Solana development environment setup guide
├── DATABASE_SETUP.md         # Database setup and migration guide
├── MIGRATION_GUIDE.md        # Database migration management guide
├── .gitignore
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

For detailed database setup instructions, see [DATABASE_SETUP.md](DATABASE_SETUP.md).

### Solana Program Development

**Prerequisites:**
- Rust
- Solana CLI
- Anchor Framework

See [SOLANA_SETUP.md](SOLANA_SETUP.md) for detailed installation instructions.

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

See [TASK_28_COMPLETION.md](TASK_28_COMPLETION.md) for detailed API documentation.

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

See [TASK_25_COMPLETION.md](TASK_25_COMPLETION.md) and [DEPOSIT_MONITORING.md](DEPOSIT_MONITORING.md) for details.

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

See [TASK_27_COMPLETION.md](TASK_27_COMPLETION.md) for complete documentation.

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
See [TASK_28_TESTS.md](TASK_28_TESTS.md) for comprehensive API test scenarios and examples.

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

See [LOCALNET_SETUP.md](LOCALNET_SETUP.md) for complete setup guide.

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

Coming soon...

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
- ✅ Security middleware (CORS, Helmet, rate limiting)
- ✅ Comprehensive documentation

### In Progress ⏳
- ⏳ Settlement processing integration
- ⏳ Webhook delivery system
- ⏳ On-chain transaction integration
- ⏳ Frontend development
- ⏳ Production deployment setup

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

### Project Documentation
- [SOLANA_SETUP.md](SOLANA_SETUP.md) - Solana development setup
- [LOCALNET_SETUP.md](LOCALNET_SETUP.md) - Local validator testing setup
- [DATABASE_SETUP.md](DATABASE_SETUP.md) - Database configuration
- [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) - Database migrations
- [API_DOCUMENTATION.md](API_DOCUMENTATION.md) - REST API reference
- [DEPOSIT_MONITORING.md](DEPOSIT_MONITORING.md) - Deposit monitoring system

### Task Completion Reports
- [TASK_25_COMPLETION.md](TASK_25_COMPLETION.md) - Deposit Monitoring Implementation
- [TASK_27_COMPLETION.md](TASK_27_COMPLETION.md) - Expiry & Cancellation Logic
- [TASK_28_COMPLETION.md](TASK_28_COMPLETION.md) - Agreement API Endpoints
- [TASK_28_TESTS.md](TASK_28_TESTS.md) - API Testing Guide
- [TASK_38_COMPLETION.md](TASK_38_COMPLETION.md) - Localnet Testing Setup

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

