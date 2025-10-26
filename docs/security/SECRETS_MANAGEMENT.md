# Secrets Management Guide

Comprehensive guide for managing keypairs, private keys, API secrets, and other sensitive data in the Easy Escrow AI Backend.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Secrets Management Service](#secrets-management-service)
- [Development Setup](#development-setup)
- [Production Deployment](#production-deployment)
- [Secret Types](#secret-types)
- [Security Scanning](#security-scanning)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

The Easy Escrow AI Backend implements a comprehensive secrets management system to ensure:

- ✅ No secrets are committed to the repository
- ✅ All secrets are loaded from environment variables
- ✅ Automatic scanning prevents accidental secret exposure
- ✅ Secure in-memory storage during runtime
- ✅ Support for multiple secret formats
- ✅ Environment-specific configuration
- ✅ Easy secret rotation without code changes

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                     │
│  (Services, Routes, Middleware)                          │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│           SecretsManagementService                       │
│  • Loads secrets from environment variables              │
│  • Validates secret format and presence                  │
│  • Provides secure access methods                        │
│  • Handles multiple secret formats                       │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Environment Variables                       │
│  • DigitalOcean App Platform Secrets (Production)       │
│  • .env files (Development - not committed)              │
│  • System environment variables                          │
└─────────────────────────────────────────────────────────┘
```

### Security Layers

1. **Prevention Layer**: `.gitignore` rules prevent secret files from being committed
2. **Detection Layer**: Pre-commit hooks scan for secrets before commits
3. **Runtime Layer**: SecretsManagementService validates and securely loads secrets
4. **Access Layer**: Controlled access to secrets through service interface

## Quick Start

### 1. Install Git Hooks

```bash
# Linux/Mac
bash scripts/setup-git-hooks.sh

# Windows PowerShell
.\scripts\setup-git-hooks.ps1
```

### 2. Generate Required Secrets

```bash
# Generate Solana keypair
solana-keygen new --outfile authority-keypair.json --no-bip39-passphrase

# Copy the keypair content (JSON array format)
cat authority-keypair.json

# Generate receipt signing key
openssl rand -base64 48

# Generate webhook secret
openssl rand -hex 32
```

### 3. Configure Environment Variables

Create `.env.local` file (do NOT commit):

```bash
# Required Secrets
AUTHORITY_KEYPAIR='[1,2,3,4,5,...,64]'
RECEIPT_SIGNING_KEY='your-receipt-signing-key-here'
DATABASE_URL='postgresql://localhost:5432/escrow_dev'
REDIS_URL='redis://localhost:6379'

# Optional Secrets
WEBHOOK_SECRET='your-webhook-secret-here'
JWT_SECRET='your-jwt-secret-here'
API_KEY_SECRET='your-api-key-secret-here'

# Public Configuration
SOLANA_RPC_URL='http://localhost:8899'
SOLANA_NETWORK='localnet'
NODE_ENV='development'
PORT=3000
```

### 4. Securely Delete Keypair Files

```bash
# IMPORTANT: Delete the keypair file after copying to environment
rm authority-keypair.json

# Verify it's deleted
ls *.json | grep keypair  # Should return nothing
```

### 5. Verify Setup

```bash
# Start the application
npm run dev

# Check logs for successful initialization
# Should see: "[SecretsManagementService] Secrets management initialized successfully"
```

## Secrets Management Service

### API Usage

```typescript
import { getSecretsManagementService } from './services/secrets-management.service';

// Initialize the service (called once at application startup)
const secretsService = getSecretsManagementService();
await secretsService.initialize();

// Get a Solana keypair
const authorityKeypair = secretsService.getKeypair('AUTHORITY_KEYPAIR');
if (!authorityKeypair) {
  throw new Error('Authority keypair not configured');
}

// Get an API secret
const jwtSecret = secretsService.getSecret('JWT_SECRET');

// Check if a secret exists
if (secretsService.hasSecret('WEBHOOK_SECRET')) {
  const webhookSecret = secretsService.getSecret('WEBHOOK_SECRET');
  // Use webhook secret
}

// Validate all required secrets
const validationResults = secretsService.validateSecrets();
for (const result of validationResults) {
  if (!result.valid) {
    console.error(`Secret validation failed: ${result.error}`);
  }
}
```

### Supported Keypair Formats

The service automatically detects and supports multiple formats:

#### 1. JSON Array Format (Solana CLI default)
```json
[1,2,3,4,5,6,7,8,9,10,...,64]
```

#### 2. Base58 Format
```
5J7XqR9pZt8F3nK4mH2wV9xQ1pY7cD8tA6bE9fG3hJ5kL2mN4pR6sT8vW1xY3zA5
```

#### 3. Base64 Format
```
AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyAhIiMkJSYnKCkqKywtLi8wMTIzNDU2Nzg5Ojs8PT4/QA==
```

### Configuration Guide

The service provides a built-in configuration guide:

```typescript
import { SecretsManagementService } from './services/secrets-management.service';

console.log(SecretsManagementService.getConfigurationGuide());
```

## Development Setup

### Local Development Environment

1. **Create `.env.local` file** (automatically ignored by git):

```bash
# Copy the example
cp .env.example .env.local

# Edit with your development secrets
nano .env.local
```

2. **Use test keypairs for development**:

```bash
# Generate a development keypair
solana-keygen new --outfile dev-keypair.json --no-bip39-passphrase

# Use it in .env.local
AUTHORITY_KEYPAIR="$(cat dev-keypair.json)"

# Delete the file
rm dev-keypair.json
```

3. **Never use production secrets in development**

### Testing Without Real Secrets

For testing, you can use the optional configuration:

```typescript
// In test files
import { SecretsManagementService } from './services/secrets-management.service';

// Mock secrets are optional, so tests can run without real secrets
const secretsService = new SecretsManagementService();
await secretsService.initialize();

// Required secrets must be set in test environment
process.env.AUTHORITY_KEYPAIR = '[...]';
process.env.RECEIPT_SIGNING_KEY = 'test-key';
```

## Production Deployment

### DigitalOcean App Platform

See detailed guide: [DigitalOcean Secrets Configuration](./DIGITALOCEAN_SECRETS_CONFIGURATION.md)

Quick summary:

1. Navigate to App Settings → Environment Variables
2. Add each secret with "Encrypt" checkbox enabled
3. Deploy the application
4. Verify in logs: "Secrets management initialized successfully"

### Other Platforms

#### AWS Secrets Manager

```bash
# Store secrets in AWS Secrets Manager
aws secretsmanager create-secret \
  --name /escrow/production/authority-keypair \
  --secret-string '[1,2,3,...]'

# Retrieve in application startup script
export AUTHORITY_KEYPAIR=$(aws secretsmanager get-secret-value \
  --secret-id /escrow/production/authority-keypair \
  --query SecretString --output text)

# Start application
npm start
```

#### Docker Secrets

```yaml
# docker-compose.yml
services:
  app:
    image: escrow-backend:latest
    secrets:
      - authority_keypair
      - receipt_signing_key
    environment:
      AUTHORITY_KEYPAIR_FILE: /run/secrets/authority_keypair
      RECEIPT_SIGNING_KEY_FILE: /run/secrets/receipt_signing_key

secrets:
  authority_keypair:
    external: true
  receipt_signing_key:
    external: true
```

#### Kubernetes Secrets

```yaml
# secrets.yaml (apply with kubectl)
apiVersion: v1
kind: Secret
metadata:
  name: escrow-secrets
type: Opaque
stringData:
  AUTHORITY_KEYPAIR: '[1,2,3,...]'
  RECEIPT_SIGNING_KEY: 'your-key-here'
---
# deployment.yaml
spec:
  containers:
  - name: app
    envFrom:
    - secretRef:
        name: escrow-secrets
```

## Secret Types

### 1. Solana Keypairs

**Purpose**: Sign transactions on Solana blockchain

**Required**: AUTHORITY_KEYPAIR
**Optional**: PLATFORM_KEYPAIR, BACKUP_KEYPAIR

**Generation**:
```bash
solana-keygen new --outfile keypair.json --no-bip39-passphrase
cat keypair.json  # Copy this value
rm keypair.json   # Delete immediately
```

**Format**: JSON array `[1,2,3,...,64]` or Base58

### 2. API Secrets

**Purpose**: Authentication and authorization

**Required**: RECEIPT_SIGNING_KEY
**Optional**: JWT_SECRET, API_KEY_SECRET

**Generation**:
```bash
# Strong random secret (recommended)
openssl rand -base64 48

# Hex format
openssl rand -hex 32

# UUID format
uuidgen
```

**Format**: Any secure random string (minimum 32 characters)

### 3. Database Credentials

**Purpose**: Database connection

**Required**: DATABASE_URL

**Format**: 
```
postgresql://username:password@host:port/database?sslmode=require
```

**Note**: Use managed database service connection strings when available

### 4. Webhook Secrets

**Purpose**: Validate webhook signatures

**Optional**: WEBHOOK_SECRET

**Generation**:
```bash
openssl rand -hex 32
```

**Format**: Hex or base64 string

## Security Scanning

### Pre-commit Hooks

Automatically scan commits for potential secrets:

```bash
# Install hooks
bash scripts/setup-git-hooks.sh  # Linux/Mac
.\scripts\setup-git-hooks.ps1    # Windows

# Hooks will run automatically on every commit
git commit -m "Your message"

# Bypass if necessary (not recommended)
git commit --no-verify -m "Your message"
```

### Manual Scanning

```bash
# Scan staged files
bash scripts/pre-commit-secrets-check.sh

# Scan specific file
grep -f .git-secrets-patterns your-file.ts
```

### CI/CD Integration

Add to your CI pipeline:

```yaml
# GitHub Actions example
- name: Scan for secrets
  run: bash scripts/pre-commit-secrets-check.sh
```

### Detected Patterns

The scanner detects:
- Private keys (PEM, OpenSSH)
- Solana keypairs (Base58, JSON array)
- API keys and tokens
- Database connection strings
- JWT tokens
- AWS credentials
- Hex-encoded keys
- Base64-encoded secrets
- Password assignments

## Best Practices

### ✅ DO

1. **Use environment variables** for all secrets
2. **Rotate secrets regularly** (every 90 days)
3. **Use different secrets** for each environment
4. **Generate strong random secrets** using cryptographic tools
5. **Delete keypair files** immediately after copying to environment
6. **Validate secrets** at application startup
7. **Monitor secret access** and usage
8. **Document secret rotation** procedures
9. **Use managed secret services** in production
10. **Test secret rotation** in staging first

### ❌ DON'T

1. **Never commit secrets** to version control
2. **Never log secret values** in application logs
3. **Never share secrets** via email or chat
4. **Never use production secrets** in development
5. **Never hardcode secrets** in source code
6. **Never store secrets** in plain text files
7. **Never reuse secrets** across environments
8. **Never skip secret validation** in production
9. **Never bypass security scans** without review
10. **Never leave keypair files** on disk

### Secret Strength Requirements

| Secret Type | Minimum Length | Recommended Length | Entropy |
|-------------|----------------|-------------------|---------|
| Passwords | 16 characters | 32 characters | 128 bits |
| API Keys | 24 characters | 32 characters | 128 bits |
| JWT Secrets | 32 characters | 48 characters | 256 bits |
| Webhook Secrets | 32 characters | 48 characters | 256 bits |
| Keypairs | 64 bytes | 64 bytes | 512 bits |

### Rotation Schedule

| Environment | Rotation Frequency | Reason |
|-------------|-------------------|---------|
| Development | As needed | When compromised |
| Staging | Every 90 days | Test rotation procedures |
| Production | Every 90 days | Security best practice |
| All | Immediately | On compromise or staff changes |

## Troubleshooting

### "Required secret X is not set"

**Cause**: Environment variable is missing

**Solution**:
1. Check `.env.local` file exists
2. Verify the secret name matches exactly
3. Restart the application after adding secrets
4. Check for typos in environment variable names

### "Failed to parse keypair"

**Cause**: Invalid keypair format

**Solution**:
1. Verify JSON array has exactly 64 numbers
2. Check for extra whitespace or characters
3. Try Base58 format instead
4. Regenerate the keypair if corrupted

### "Secrets management initialization failed"

**Cause**: Multiple possible issues

**Solution**:
1. Check application logs for specific error
2. Verify all required secrets are set
3. Validate secret formats
4. Test with minimal configuration first

### Secrets Not Loading in Production

**Cause**: Platform-specific configuration issues

**Solution**:
1. Verify secrets are configured in platform dashboard
2. Check environment variable names match
3. Ensure "Encrypt" option is enabled (DigitalOcean)
4. Verify application has been redeployed
5. Check runtime logs for errors

### Pre-commit Hook Not Running

**Cause**: Hook not installed or not executable

**Solution**:
```bash
# Reinstall hooks
bash scripts/setup-git-hooks.sh

# Make scripts executable
chmod +x scripts/pre-commit-secrets-check.sh
chmod +x .git/hooks/pre-commit

# Verify installation
ls -la .git/hooks/pre-commit
```

## Additional Resources

### Documentation

- [DigitalOcean Secrets Configuration](./DIGITALOCEAN_SECRETS_CONFIGURATION.md)
- [Environment Variables Guide](./ENVIRONMENT_VARIABLES.md)
- [Deployment Guide](./DEPLOYMENT_GUIDE.md)
- [Security Policy](../SECURITY.md)

### External Resources

- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [Solana CLI Documentation](https://docs.solana.com/cli)
- [DigitalOcean App Platform Docs](https://docs.digitalocean.com/products/app-platform/)
- [Git Secrets Tool](https://github.com/awslabs/git-secrets)

### Source Code

- [SecretsManagementService](../src/services/secrets-management.service.ts)
- [Pre-commit Hook Scripts](../scripts/)
- [.gitignore Rules](../.gitignore)

## Support

For issues or questions:

1. Check this documentation and troubleshooting section
2. Review application logs for errors
3. Verify all prerequisites are met
4. Contact the development team
5. Create an issue in the repository (do not include secrets!)

---

**Security Notice**: If you discover a security vulnerability related to secrets management, please report it immediately to the security team. Do not create public issues containing sensitive information.

**Last Updated**: Task 39 Implementation  
**Maintained By**: Development Team

