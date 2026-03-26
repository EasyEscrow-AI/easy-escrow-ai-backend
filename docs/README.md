# EasyEscrow.ai Backend Documentation

Welcome to the EasyEscrow.ai backend documentation. This directory contains comprehensive guides for setup, testing, deployment, and architecture.

## 📁 Documentation Structure

### 🚀 Setup & Installation
Located in `/docs/setup/`

- **[Setup Instructions](setup/SETUP_INSTRUCTIONS.md)** - Complete setup guide for the backend
- **[Database Setup](setup/DATABASE_SETUP.md)** - PostgreSQL database configuration
- **[Solana Setup](setup/SOLANA_SETUP.md)** - Solana blockchain tools and wallet setup
- **[Localnet Setup](setup/LOCALNET_SETUP.md)** - Local Solana validator configuration
- **[Redis Configuration](setup/REDIS_CONFIGURATION.md)** - Redis services and usage guide
- **[Redis Infrastructure](setup/REDIS_INFRASTRUCTURE.md)** - Redis provider options and setup
- **[Install Tools Quick](setup/INSTALL_TOOLS_QUICK.md)** - Quick installation reference

### 🧪 Testing
Located in `/docs/testing/`

- **[Testing Strategy](testing/TESTING_STRATEGY.md)** - Overall testing approach and methodology
- **[Quick Start E2E Testing](testing/QUICK_START_E2E_TESTING.md)** - Quick guide to run E2E tests
- **[Devnet E2E Manual Funding Guide](testing/DEVNET_E2E_MANUAL_FUNDING_GUIDE.md)** - Manual testing on devnet
- **[Critical Test Alignment Issue](testing/CRITICAL_TEST_ALIGNMENT_ISSUE.md)** - Known testing issues
- **[E2E Test Alignment Needed](testing/E2E_TEST_ALIGNMENT_NEEDED.md)** - Test alignment requirements

### 🏗️ Architecture & Design
Located in `/docs/architecture/`

- **[API Documentation](architecture/API_DOCUMENTATION.md)** - REST API endpoints and usage
- **[Security Middleware](architecture/SECURITY_MIDDLEWARE.md)** - Security implementation and best practices
- **[Webhook System](architecture/WEBHOOK_SYSTEM.md)** - Webhook implementation and handling
- **[Idempotency Implementation](architecture/IDEMPOTENCY_IMPLEMENTATION.md)** - Idempotency design
- **[Deposit Monitoring](architecture/DEPOSIT_MONITORING.md)** - Blockchain deposit monitoring system
- **[IDL Management](architecture/IDL_MANAGEMENT.md)** - Interface Definition Language management
- **[IDL Quick Reference](architecture/IDL_QUICK_REFERENCE.md)** - IDL usage quick reference
- **[NFT Mint Terminology](architecture/NFT_MINT_TERMINOLOGY_CLARIFICATION.md)** - NFT terminology clarification

### 🚢 Deployment
Located in `/docs/deployment/`

- **[Deployment Guide](deployment/DEPLOYMENT_GUIDE.md)** - Complete deployment instructions
- **[Deployment Summary](deployment/DEPLOYMENT_SUMMARY.md)** - Deployment overview
- **[Deployment Scripts Guide](deployment/DEPLOYMENT_SCRIPTS_GUIDE.md)** - Deployment automation scripts
- **[Program Deployment Guide](deployment/PROGRAM_DEPLOYMENT_GUIDE.md)** - Solana program deployment
- **[Devnet Deployment Guide](deployment/DEVNET_DEPLOYMENT_GUIDE.md)** - Devnet-specific deployment
- **[DigitalOcean Setup](deployment/DIGITALOCEAN_SETUP.md)** - DigitalOcean App Platform setup
- **[DigitalOcean Secrets](deployment/DIGITALOCEAN_SECRETS_CONFIGURATION.md)** - Secrets management for DO
- **[Authority Keypair Explained](deployment/AUTHORITY_KEYPAIR_EXPLAINED.md)** - Keypair management
- **[Staging Deployment Guide](deployment/STAGING_DEPLOYMENT_GUIDE.md)** - Staging environment deployment

### 🌍 Environments
Located in `/docs/environments/`

- **[Environment Setup](environments/ENVIRONMENT_SETUP.md)** - General environment configuration
- **[Environment Variables](environments/ENVIRONMENT_VARIABLES.md)** - Complete environment variable reference
- **[Environment Template](environments/ENV_TEMPLATE.md)** - Environment file template
- **[Program Environments](environments/PROGRAM_ENVIRONMENTS.md)** - Solana program environments
- **[Program IDs](environments/PROGRAM_IDS.md)** - Program ID reference

#### Staging Environment
Located in `/docs/environments/staging/`

- **[Staging Reference](environments/staging/STAGING_REFERENCE.md)** - Staging environment overview
- **[Staging Wallets](environments/staging/STAGING_WALLETS.md)** - Staging wallet management
- **[Staging Token Addresses](environments/staging/STAGING_TOKEN_ADDRESSES.md)** - Token addresses reference
- **[Staging Migration Steps](environments/staging/STAGING_MIGRATION_STEPS.md)** - Migration procedures

#### Devnet Environment
Located in `/docs/environments/devnet/`

- **[Devnet Wallet Standardization](environments/devnet/DEVNET_WALLET_STANDARDIZATION.md)** - Wallet standards
- **[Static Devnet Wallets](environments/devnet/STATIC_DEVNET_WALLETS.md)** - Static wallet configuration

### 🗄️ Database
Located in `/docs/database/`

- **[Migration Guide](database/MIGRATION_GUIDE.md)** - Database migration procedures
- **[Staging Migration Procedures](database/STAGING_MIGRATION_PROCEDURES.md)** - Staging-specific migrations
- **[Zero Downtime Migrations](database/ZERO_DOWNTIME_MIGRATIONS.md)** - Production-safe migrations

### 🔒 Security
Located in `/docs/security/`

- **[Secrets Management](security/SECRETS_MANAGEMENT.md)** - Comprehensive secrets management guide
- **[Security Incident - Credential Exposure](security/SECURITY_INCIDENT_CREDENTIAL_EXPOSURE.md)** - Security incident documentation
- **[Leaked Secrets Audit](security/LEAKED_SECRETS_AUDIT.md)** - Audit results and remediation
- **[Wallet Generation Guardrails](security/WALLET_GENERATION_GUARDRAILS.md)** - Safe wallet generation practices

### 🏢 Infrastructure
Located in `/docs/infrastructure/`

- **[Spaces Setup](infrastructure/SPACES_SETUP.md)** - DigitalOcean Spaces configuration
- **[Staging Database Setup](infrastructure/STAGING_DATABASE_SETUP.md)** - Database infrastructure
- **[Staging Redis Setup](infrastructure/STAGING_REDIS_SETUP.md)** - Redis infrastructure
- **[Staging RPC Setup](infrastructure/STAGING_RPC_SETUP.md)** - RPC endpoint configuration

#### Docker
Located in `/docs/infrastructure/docker/`

- **[Docker Deployment](infrastructure/docker/DOCKER_DEPLOYMENT.md)** - Docker-based deployment
- **[Docker Graceful Restart](infrastructure/docker/DOCKER_GRACEFUL_RESTART.md)** - Graceful service restarts
- **[Docker Fresh Start Quick Ref](infrastructure/docker/DOCKER_FRESH_START_QUICK_REF.md)** - Quick restart guide
- **[Docker Cache Elimination](infrastructure/docker/DOCKER_CACHE_ELIMINATION.md)** - Cache management

### 🛠️ Development
Located in `/docs/development/`

- **[CLI Tools Setup](development/CLI_TOOLS_SETUP.md)** - Command-line tools configuration
- **[Terminal Timeout Policy](development/TERMINAL_TIMEOUT_POLICY.md)** - Terminal command timeout handling
- **[Timeout Utilities](development/TIMEOUT_UTILITIES.md)** - Timeout utility scripts
- **[Cursor Hanging Fix](development/CURSOR_HANGING_FIX.md)** - IDE-specific fixes

### 🔧 Troubleshooting
Located in `/docs/troubleshooting/`

- **[Bug Fix - Incorrect Subdomain](troubleshooting/BUG_FIX_INCORRECT_SUBDOMAIN.md)** - Subdomain configuration fix
- **[Solana RPC Validation Fix](troubleshooting/SOLANA_RPC_VALIDATION_FIX.md)** - RPC validation issues

### 📋 Task Documentation
Located in `/docs/tasks/`

Contains completion reports and test results for completed development tasks. See [Task Documentation README](tasks/README.md) for details.

### 🎛️ API Documentation
Located in `/docs/api/`

- **[API README](api/README.md)** - API overview and getting started
- **[Integration Guide](api/INTEGRATION_GUIDE.md)** - Third-party integration guide
- **[Error Codes](api/ERROR_CODES.md)** - Complete error code reference
- **[Webhook Events](api/WEBHOOK_EVENTS.md)** - Webhook event types and payloads
- **[Manual Trigger Endpoints](api/MANUAL_TRIGGER_ENDPOINTS.md)** - Manual trigger API reference
- **[OpenAPI Specification](api/openapi.yaml)** - OpenAPI 3.0 specification
- **[Privacy API](api/PRIVACY_API.md)** - Privacy and stealth address API reference

### 🏊 Transaction Pools
Located in `/docs/api/`

- **Transaction Pool API** - Batch escrow settlement endpoints (see OpenAPI spec)

### ⚙️ Operations
Located in `/docs/operations/`

- **[Staging Resource Tracking](operations/STAGING_RESOURCE_TRACKING.md)** - Resource monitoring and tracking

## 🔗 Quick Links

### For New Developers
1. [Setup Instructions](setup/SETUP_INSTRUCTIONS.md)
2. [Database Setup](setup/DATABASE_SETUP.md)
3. [Environment Variables](environments/ENVIRONMENT_VARIABLES.md)
4. [Testing Strategy](testing/TESTING_STRATEGY.md)

### For DevOps/Deployment
1. [Deployment Guide](deployment/DEPLOYMENT_GUIDE.md)
2. [Docker Deployment](infrastructure/docker/DOCKER_DEPLOYMENT.md)
3. [DigitalOcean Setup](deployment/DIGITALOCEAN_SETUP.md)
4. [Migration Guide](database/MIGRATION_GUIDE.md)
5. [Secrets Management](security/SECRETS_MANAGEMENT.md)

### For API Integration
1. [API Documentation](architecture/API_DOCUMENTATION.md)
2. [Integration Guide](api/INTEGRATION_GUIDE.md)
3. [Security Middleware](architecture/SECURITY_MIDDLEWARE.md)
4. [Webhook System](architecture/WEBHOOK_SYSTEM.md)
5. [Error Codes](api/ERROR_CODES.md)

### For Testing
1. [Quick Start E2E Testing](testing/QUICK_START_E2E_TESTING.md)
2. [Testing Strategy](testing/TESTING_STRATEGY.md)
3. [Devnet E2E Manual Funding Guide](testing/DEVNET_E2E_MANUAL_FUNDING_GUIDE.md)

## 🛠️ Tech Stack Reference

- **Backend**: Node.js, TypeScript, Express
- **Database**: PostgreSQL (Prisma ORM)
- **Cache/Queue**: Redis (ioredis, Bull)
- **Blockchain**: Solana (Anchor framework)
- **Testing**: Jest, Supertest
- **Deployment**: DigitalOcean App Platform, Docker

## 📝 Contributing to Documentation

When adding new documentation:
1. Place setup guides in `/docs/setup/`
2. Place testing guides in `/docs/testing/`
3. Place architecture docs in `/docs/architecture/`
4. Place deployment guides in `/docs/deployment/`
5. Place environment configs in `/docs/environments/`
6. Place security docs in `/docs/security/`
7. Place infrastructure docs in `/docs/infrastructure/`
8. Place development tools docs in `/docs/development/`
9. Place troubleshooting guides in `/docs/troubleshooting/`
10. Place API docs in `/docs/api/`
11. Place task completion docs in `/docs/tasks/`
12. Update this README with links to new documents
13. Follow the existing naming conventions

## 📞 Support

For questions or issues:
- Check the relevant documentation section above
- Review task completion documents for implementation details
- Refer to inline code comments for specific functionality

---

*Last Updated: October 27, 2025*

