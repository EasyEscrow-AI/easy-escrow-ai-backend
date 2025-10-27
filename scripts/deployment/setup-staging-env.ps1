#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Setup STAGING environment variables file (.env.staging)

.DESCRIPTION
    Creates a .env.staging file with proper DEVNET_STAGING_* naming convention.
    Extracts base58 keys from staging wallet keypairs and populates the template.

.PARAMETER Force
    Overwrite existing .env.staging file without prompting

.EXAMPLE
    .\scripts\deployment\setup-staging-env.ps1
    Creates .env.staging file interactively

.EXAMPLE
    .\scripts\deployment\setup-staging-env.ps1 -Force
    Overwrites .env.staging file without confirmation
#>

param(
    [Parameter(HelpMessage="Overwrite existing .env.staging without prompting")]
    [switch]$Force
)

# Script configuration
$ErrorActionPreference = "Stop"
$envFilePath = Join-Path $PSScriptRoot "../../.env.staging"
$walletExtractScript = Join-Path $PSScriptRoot "../utilities/extract-base58-keys.ts"

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "  EasyEscrow STAGING Environment Setup" -ForegroundColor Cyan
Write-Host "============================================================================`n" -ForegroundColor Cyan

# Check if .env.staging already exists
if (Test-Path $envFilePath) {
    if (-not $Force) {
        Write-Host "⚠️  .env.staging file already exists!" -ForegroundColor Yellow
        $response = Read-Host "Overwrite? (y/N)"
        if ($response -ne 'y' -and $response -ne 'Y') {
            Write-Host "`n❌ Setup cancelled" -ForegroundColor Red
            exit 1
        }
    }
    Write-Host "✅ Overwriting existing .env.staging file..." -ForegroundColor Green
}

# Extract wallet keys
Write-Host "`n🔑 Extracting base58 private keys from staging wallets..." -ForegroundColor Cyan

try {
    $keyOutput = & npx ts-node $walletExtractScript 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to extract wallet keys"
    }
    
    # Parse the output to extract keys
    $senderKey = ($keyOutput | Select-String "DEVNET_STAGING_SENDER_PRIVATE_KEY=(.+)").Matches.Groups[1].Value
    $receiverKey = ($keyOutput | Select-String "DEVNET_STAGING_RECEIVER_PRIVATE_KEY=(.+)").Matches.Groups[1].Value
    $adminKey = ($keyOutput | Select-String "DEVNET_STAGING_ADMIN_PRIVATE_KEY=(.+)").Matches.Groups[1].Value
    $feeCollectorKey = ($keyOutput | Select-String "DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY=(.+)").Matches.Groups[1].Value
    
    if (-not $senderKey -or -not $receiverKey -or -not $adminKey -or -not $feeCollectorKey) {
        throw "Could not extract all wallet keys"
    }
    
    Write-Host "✅ Successfully extracted wallet keys" -ForegroundColor Green
} catch {
    Write-Host "❌ Error extracting wallet keys: $_" -ForegroundColor Red
    Write-Host "Make sure wallet files exist in wallets/staging/" -ForegroundColor Yellow
    exit 1
}

# Prompt for required values
Write-Host "`n📝 Enter STAGING configuration values:" -ForegroundColor Cyan
Write-Host "(Press Enter to use default values shown in brackets)`n" -ForegroundColor Gray

# Helius API Key
$heliusApiKey = Read-Host "Helius API Key [YOUR_HELIUS_API_KEY]"
if ([string]::IsNullOrWhiteSpace($heliusApiKey)) {
    $heliusApiKey = "YOUR_HELIUS_API_KEY"
}

# Database Password
$dbPassword = Read-Host "Database Password [YOUR_STAGING_PASSWORD]"
if ([string]::IsNullOrWhiteSpace($dbPassword)) {
    $dbPassword = "YOUR_STAGING_PASSWORD"
}

# Database Host
$dbHost = Read-Host "Database Host [your-cluster.db.ondigitalocean.com]"
if ([string]::IsNullOrWhiteSpace($dbHost)) {
    $dbHost = "your-cluster.db.ondigitalocean.com"
}

# Redis Password
Write-Host "Get from: https://app.redislabs.com/ (Redis Cloud dashboard)" -ForegroundColor Gray
$redisPassword = Read-Host "Redis Password [YOUR_REDIS_PASSWORD]"
if ([string]::IsNullOrWhiteSpace($redisPassword)) {
    $redisPassword = "YOUR_REDIS_PASSWORD"
}

# Redis Host
$redisHost = Read-Host "Redis Host [redis-xxxxx.cloud.redislabs.com]"
if ([string]::IsNullOrWhiteSpace($redisHost)) {
    $redisHost = "redis-xxxxx.cloud.redislabs.com"
}

# Redis Port
$redisPort = Read-Host "Redis Port [6379]"
if ([string]::IsNullOrWhiteSpace($redisPort)) {
    $redisPort = "6379"
}

# JWT Secret
Write-Host "`n🔐 Generating JWT secret..." -ForegroundColor Cyan
$jwtSecret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 48 | ForEach-Object {[char]$_})
Write-Host "✅ Generated JWT secret" -ForegroundColor Green

# Webhook Secret
Write-Host "🔐 Generating webhook secret..." -ForegroundColor Cyan
$webhookSecret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 48 | ForEach-Object {[char]$_})
Write-Host "✅ Generated webhook secret" -ForegroundColor Green

# Create .env.staging file
Write-Host "`n📄 Creating .env.staging file..." -ForegroundColor Cyan

$envContent = @"
# ============================================================================
# EasyEscrow STAGING Environment Configuration
# ============================================================================
# IMPORTANT: This file contains STAGING-specific variables with DEVNET_STAGING_* 
# prefix to differentiate from DEV environment (DEVNET_*) variables.
# Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
# ============================================================================

# Environment
NODE_ENV=staging
SOLANA_NETWORK=devnet

# Server Configuration
PORT=8080
HOST=0.0.0.0
LOG_LEVEL=debug

# ============================================================================
# Solana Configuration (Devnet for Staging)
# ============================================================================

# Primary RPC Endpoint - Helius (Dedicated Provider)
SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=$heliusApiKey

# Fallback RPC Endpoint - Public devnet as backup
SOLANA_RPC_URL_FALLBACK=https://api.devnet.solana.com

# RPC Connection Optimization
SOLANA_RPC_TIMEOUT=30000                      # 30 seconds
SOLANA_RPC_RETRIES=3                          # Number of retry attempts
SOLANA_RPC_HEALTH_CHECK_INTERVAL=30000        # Health check interval in ms

# ============================================================================
# STAGING Program Configuration (Devnet)
# ============================================================================

# STAGING Escrow Program ID (deployed on devnet)
DEVNET_STAGING_PROGRAM_ID=AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei

# ============================================================================
# STAGING Wallet Configuration (Base58 Private Keys)
# ============================================================================
# NOTE: These use DEVNET_STAGING_* prefix to avoid conflicts with DEV environment

# Sender Wallet (Seller side - owns NFTs)
DEVNET_STAGING_SENDER_PRIVATE_KEY=$senderKey

# Receiver Wallet (Buyer side - holds USDC)
DEVNET_STAGING_RECEIVER_PRIVATE_KEY=$receiverKey

# Admin Wallet (Administrative operations)
DEVNET_STAGING_ADMIN_PRIVATE_KEY=$adminKey

# Fee Collector Wallet (Receives platform fees)
DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY=$feeCollectorKey

# ============================================================================
# Token Configuration (Official Devnet USDC)
# ============================================================================

# Official Circle USDC Devnet Mint Address
DEVNET_STAGING_USDC_MINT_ADDRESS=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr

# ============================================================================
# Database Configuration (DigitalOcean Managed PostgreSQL - STAGING)
# ============================================================================

# Primary connection URL (direct connection)
DATABASE_URL=postgresql://staging_user:${dbPassword}@${dbHost}:25060/easyescrow_staging?sslmode=require

# Connection pooler URL (recommended for production-like workloads)
DATABASE_POOL_URL=postgresql://staging_user:${dbPassword}@${dbHost}-pooler:25061/easyescrow_staging?sslmode=require

# Database pool configuration
DATABASE_POOL_SIZE=10
DATABASE_POOL_TIMEOUT=30

# ============================================================================
# Redis Configuration (Redis Cloud - STAGING)
# ============================================================================

REDIS_URL=redis://default:${redisPassword}@${redisHost}:${redisPort}

# ============================================================================
# Platform Fee Configuration
# ============================================================================

# Platform fee in basis points (100 = 1%)
PLATFORM_FEE_BPS=100

# Fee collector address (public key of fee collector wallet)
FEE_COLLECTOR_ADDRESS=8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ

# ============================================================================
# Monitoring & Health Check Configuration
# ============================================================================

MONITORING_ENDPOINT=https://staging-api.easyescrow.ai/health
HEALTH_CHECK_ENABLED=true
HEALTH_CHECK_PATH=/health

# Deposit monitoring configuration
ENABLE_DEPOSIT_MONITORING=true
DEPOSIT_POLL_INTERVAL_MS=10000
TRANSACTION_CONFIRMATION_TIMEOUT=60000

# ============================================================================
# JWT Configuration (STAGING)
# ============================================================================

JWT_SECRET=$jwtSecret
JWT_EXPIRATION=24h

# ============================================================================
# API Rate Limiting (STAGING - more lenient than production)
# ============================================================================

RATE_LIMIT_WINDOW_MS=900000                   # 15 minutes
RATE_LIMIT_MAX_REQUESTS=200

# ============================================================================
# CORS Configuration (STAGING)
# ============================================================================

CORS_ORIGIN=https://staging.easyescrow.ai,http://localhost:3000

# ============================================================================
# Webhook Configuration (STAGING)
# ============================================================================

WEBHOOK_SECRET=$webhookSecret
WEBHOOK_MAX_RETRIES=5
WEBHOOK_RETRY_DELAY=5000

# ============================================================================
# Feature Flags (STAGING)
# ============================================================================

ENABLE_WEBHOOKS=true
ENABLE_RATE_LIMITING=true
ENABLE_REQUEST_LOGGING=true

# ============================================================================
# Swagger/OpenAPI Documentation
# ============================================================================

ENABLE_SWAGGER=true
SWAGGER_PATH=/api/docs

# ============================================================================
# Monitoring & Analytics (Optional)
# ============================================================================

SENTRY_DSN=
SENTRY_ENVIRONMENT=staging
SENTRY_TRACES_SAMPLE_RATE=0.5

# ============================================================================
# Email Configuration (STAGING - use test service)
# ============================================================================

SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your_mailtrap_user
SMTP_PASS=your_mailtrap_pass
SMTP_FROM=noreply@staging.easyescrow.ai

# ============================================================================
# S3/Spaces Configuration (STAGING)
# ============================================================================

DO_SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
DO_SPACES_BUCKET=easyescrow-staging
DO_SPACES_KEY=your_staging_spaces_key
DO_SPACES_SECRET=your_staging_spaces_secret
DO_SPACES_REGION=nyc3

# ============================================================================
# DigitalOcean API Configuration
# ============================================================================

DIGITAL_OCEAN_API_KEY=your_do_api_key_here

# ============================================================================
# Logging Configuration
# ============================================================================

LOG_FORMAT=json
LOG_MAX_SIZE=10m
LOG_MAX_FILES=7

# ============================================================================
# End of STAGING Environment Configuration
# ============================================================================
"@

try {
    $envContent | Out-File -FilePath $envFilePath -Encoding UTF8 -Force
    Write-Host "✅ Successfully created .env.staging file" -ForegroundColor Green
} catch {
    Write-Host "❌ Error writing .env.staging file: $_" -ForegroundColor Red
    exit 1
}

# Summary
Write-Host "`n============================================================================" -ForegroundColor Cyan
Write-Host "  ✅ STAGING Environment Setup Complete!" -ForegroundColor Green
Write-Host "============================================================================`n" -ForegroundColor Cyan

Write-Host "📁 File created: $envFilePath`n" -ForegroundColor White

Write-Host "📝 Configuration Summary:" -ForegroundColor Cyan
Write-Host "  • Program ID: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei" -ForegroundColor Gray
Write-Host "  • USDC Mint: Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr" -ForegroundColor Gray
Write-Host "  • Wallet keys: ✅ Extracted from keypairs" -ForegroundColor Gray
Write-Host "  • JWT/Webhook secrets: ✅ Generated" -ForegroundColor Gray
Write-Host "  • RPC Provider: Helius (devnet)" -ForegroundColor Gray
Write-Host "  • Database: PostgreSQL (staging)" -ForegroundColor Gray
Write-Host "  • Redis: Redis Cloud (staging)`n" -ForegroundColor Gray

Write-Host "⚠️  IMPORTANT:" -ForegroundColor Yellow
Write-Host "  • Review .env.staging and update any placeholder values" -ForegroundColor Yellow
Write-Host "  • NEVER commit .env.staging to git" -ForegroundColor Yellow
Write-Host "  • Store sensitive values in DigitalOcean App Platform secrets`n" -ForegroundColor Yellow

Write-Host "📖 Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Review .env.staging file" -ForegroundColor Gray
Write-Host "  2. Test configuration: npm run test:staging" -ForegroundColor Gray
Write-Host "  3. Deploy to DigitalOcean: See docs/deployment/STAGING_DEPLOYMENT.md`n" -ForegroundColor Gray

Write-Host "============================================================================`n" -ForegroundColor Cyan
"@


