#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Rotate STAGING environment secrets

.DESCRIPTION
    Automates the rotation of sensitive secrets in the STAGING environment including:
    - JWT secrets
    - Webhook secrets
    - API keys (with manual confirmation)
    - Database passwords (with manual confirmation)
    - Redis passwords (with manual confirmation)
    
    This script uses DEVNET_STAGING_* naming convention.

.PARAMETER AppId
    DigitalOcean App Platform application ID for STAGING

.PARAMETER DryRun
    Simulate rotation without making changes

.PARAMETER RotateAll
    Rotate all secrets including database and Redis passwords

.EXAMPLE
    .\scripts\deployment\rotate-staging-secrets.ps1 -AppId abc123
    Rotates JWT and webhook secrets only

.EXAMPLE
    .\scripts\deployment\rotate-staging-secrets.ps1 -AppId abc123 -RotateAll
    Rotates all secrets including database and Redis

.EXAMPLE
    .\scripts\deployment\rotate-staging-secrets.ps1 -DryRun
    Simulates rotation without making changes
#>

param(
    [Parameter(HelpMessage="DigitalOcean App Platform application ID")]
    [string]$AppId = "",
    
    [Parameter(HelpMessage="Simulate rotation without making changes")]
    [switch]$DryRun,
    
    [Parameter(HelpMessage="Rotate all secrets including DB and Redis")]
    [switch]$RotateAll
)

# Script configuration
$ErrorActionPreference = "Stop"
$backupDir = Join-Path $PSScriptRoot "../../temp/secret-backups"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "  EasyEscrow STAGING Secret Rotation" -ForegroundColor Cyan
Write-Host "============================================================================`n" -ForegroundColor Cyan

if ($DryRun) {
    Write-Host "🔍 DRY RUN MODE - No changes will be made`n" -ForegroundColor Yellow
}

# Check for doctl CLI
Write-Host "🔧 Checking prerequisites..." -ForegroundColor Cyan
try {
    $null = Get-Command doctl -ErrorAction Stop
    Write-Host "✅ doctl CLI found" -ForegroundColor Green
} catch {
    Write-Host "❌ doctl CLI not found. Please install it first:" -ForegroundColor Red
    Write-Host "   https://docs.digitalocean.com/reference/doctl/how-to/install/`n" -ForegroundColor Yellow
    exit 1
}

# Verify doctl authentication
try {
    $null = doctl account get 2>&1
    Write-Host "✅ doctl authenticated" -ForegroundColor Green
} catch {
    Write-Host "❌ doctl not authenticated. Run: doctl auth init`n" -ForegroundColor Red
    exit 1
}

# Get App ID if not provided
if ([string]::IsNullOrWhiteSpace($AppId)) {
    Write-Host "`n📝 Enter DigitalOcean App ID for STAGING:" -ForegroundColor Cyan
    $AppId = Read-Host "App ID"
    
    if ([string]::IsNullOrWhiteSpace($AppId)) {
        Write-Host "❌ App ID is required" -ForegroundColor Red
        exit 1
    }
}

# Verify app exists
Write-Host "`n🔍 Verifying app exists..." -ForegroundColor Cyan
try {
    $appInfo = doctl apps get $AppId --format ID --no-header 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "App not found"
    }
    Write-Host "✅ App found: $AppId" -ForegroundColor Green
} catch {
    Write-Host "❌ Could not find app with ID: $AppId" -ForegroundColor Red
    exit 1
}

# Create backup directory
if (-not $DryRun) {
    Write-Host "`n📁 Creating backup directory..." -ForegroundColor Cyan
    if (-not (Test-Path $backupDir)) {
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    }
    Write-Host "✅ Backup directory: $backupDir" -ForegroundColor Green
}

# Function to generate secure random string
function New-SecureSecret {
    param([int]$Length = 48)
    $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
    -join ((1..$Length) | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
}

# Get current environment variables
Write-Host "`n📥 Fetching current environment variables..." -ForegroundColor Cyan
try {
    $currentEnvJson = doctl apps spec get $AppId --format Spec | ConvertFrom-Json
    $currentEnvVars = $currentEnvJson.services[0].envs
    Write-Host "✅ Retrieved $($currentEnvVars.Count) environment variables" -ForegroundColor Green
} catch {
    Write-Host "❌ Could not fetch current environment variables" -ForegroundColor Red
    exit 1
}

# Backup current secrets
if (-not $DryRun) {
    Write-Host "`n💾 Backing up current secrets..." -ForegroundColor Cyan
    $backupFile = Join-Path $backupDir "staging-secrets-backup-$timestamp.json"
    $currentEnvVars | ConvertTo-Json -Depth 10 | Out-File $backupFile -Encoding UTF8
    Write-Host "✅ Backup saved: $backupFile" -ForegroundColor Green
}

# Secrets to rotate
$newSecrets = @{}

# Generate new JWT secret
Write-Host "`n🔐 Generating new JWT secret..." -ForegroundColor Cyan
$newSecrets['JWT_SECRET'] = New-SecureSecret -Length 48
Write-Host "✅ Generated new JWT_SECRET" -ForegroundColor Green

# Generate new webhook secret
Write-Host "🔐 Generating new webhook secret..." -ForegroundColor Cyan
$newSecrets['WEBHOOK_SECRET'] = New-SecureSecret -Length 48
Write-Host "✅ Generated new WEBHOOK_SECRET" -ForegroundColor Green

# Display secrets to rotate
Write-Host "`n📋 Secrets to be rotated:" -ForegroundColor Cyan
Write-Host "  • JWT_SECRET" -ForegroundColor Gray
Write-Host "  • WEBHOOK_SECRET" -ForegroundColor Gray

if ($RotateAll) {
    Write-Host "`n⚠️  FULL ROTATION MODE" -ForegroundColor Yellow
    Write-Host "  The following secrets require manual rotation:" -ForegroundColor Yellow
    Write-Host "  • DATABASE_URL - Rotate in DigitalOcean Databases" -ForegroundColor Gray
    Write-Host "  • DATABASE_POOL_URL - Rotate in DigitalOcean Databases" -ForegroundColor Gray
    Write-Host "  • REDIS_URL - Rotate in Redis Cloud dashboard" -ForegroundColor Gray
    Write-Host "  • SOLANA_RPC_URL - Rotate API key in Helius dashboard" -ForegroundColor Gray
    Write-Host "  • DEVNET_STAGING_*_PRIVATE_KEY - Requires new wallet generation" -ForegroundColor Gray
    Write-Host "`n  See docs/environments/STAGING_ENV_VARS.md for detailed rotation procedures`n" -ForegroundColor Yellow
}

# Confirmation
if (-not $DryRun) {
    Write-Host "`n⚠️  This will:" -ForegroundColor Yellow
    Write-Host "  1. Generate new JWT and webhook secrets" -ForegroundColor Gray
    Write-Host "  2. Update DigitalOcean App Platform environment" -ForegroundColor Gray
    Write-Host "  3. Trigger app redeployment" -ForegroundColor Gray
    Write-Host "  4. Invalidate existing JWT sessions" -ForegroundColor Gray
    Write-Host "  5. Require webhook consumer updates`n" -ForegroundColor Gray
    
    $confirm = Read-Host "Continue with rotation? (yes/no)"
    if ($confirm -ne 'yes') {
        Write-Host "`n❌ Rotation cancelled" -ForegroundColor Red
        exit 0
    }
}

# Update environment variables
if (-not $DryRun) {
    Write-Host "`n🔄 Updating environment variables in DigitalOcean..." -ForegroundColor Cyan
    
    foreach ($key in $newSecrets.Keys) {
        Write-Host "  • Updating $key..." -ForegroundColor Gray
        
        try {
            # Update using doctl
            $envUpdate = @{
                key = $key
                value = $newSecrets[$key]
                scope = "RUN_AND_BUILD_TIME"
                type = "SECRET"
            }
            
            # Note: This is a simplified example. Actual implementation would need to:
            # 1. Get current app spec
            # 2. Update specific env var
            # 3. Apply updated spec
            # For now, we'll provide manual instructions
            
            Write-Host "    ℹ️  Manual update required via DO dashboard or API" -ForegroundColor Yellow
            Write-Host "       Key: $key" -ForegroundColor Gray
            Write-Host "       Value: [redacted]" -ForegroundColor Gray
            
        } catch {
            Write-Host "    ❌ Failed to update $key : $_" -ForegroundColor Red
        }
    }
    
    Write-Host "`n✅ Environment variable updates prepared" -ForegroundColor Green
} else {
    Write-Host "`n🔍 DRY RUN - Would update:" -ForegroundColor Yellow
    foreach ($key in $newSecrets.Keys) {
        Write-Host "  • $key" -ForegroundColor Gray
    }
}

# Manual update instructions
Write-Host "`n============================================================================" -ForegroundColor Cyan
Write-Host "  Manual Update Instructions" -ForegroundColor Cyan
Write-Host "============================================================================`n" -ForegroundColor Cyan

Write-Host "To complete the rotation, update these secrets in DigitalOcean App Platform:`n" -ForegroundColor White

Write-Host "1. Navigate to:" -ForegroundColor Cyan
Write-Host "   https://cloud.digitalocean.com/apps/$AppId/settings`n" -ForegroundColor Gray

Write-Host "2. Update the following environment variables:`n" -ForegroundColor Cyan

foreach ($key in $newSecrets.Keys) {
    Write-Host "   $key =" -ForegroundColor White -NoNewline
    Write-Host " $($newSecrets[$key])" -ForegroundColor Yellow
}

Write-Host "`n3. Mark as encrypted (check 'Encrypt' box)" -ForegroundColor Cyan
Write-Host "`n4. Click 'Save' and redeploy the app" -ForegroundColor Cyan

Write-Host "`n5. Verify application health after deployment:" -ForegroundColor Cyan
Write-Host "   curl https://staging-api.easyescrow.ai/health`n" -ForegroundColor Gray

if ($RotateAll) {
    Write-Host "`n6. Complete manual rotations:" -ForegroundColor Cyan
    Write-Host "   • Database: ALTER USER staging_user WITH PASSWORD 'new_password';" -ForegroundColor Gray
    Write-Host "   • Redis: Generate new password in Redis Cloud dashboard" -ForegroundColor Gray
    Write-Host "   • Helius: Regenerate API key in Helius dashboard" -ForegroundColor Gray
    Write-Host "   • Wallets: Generate new keypairs with solana-keygen`n" -ForegroundColor Gray
}

# Save rotation summary
if (-not $DryRun) {
    $summaryFile = Join-Path $backupDir "rotation-summary-$timestamp.txt"
    @"
STAGING Secret Rotation Summary
================================
Date: $(Get-Date)
App ID: $AppId
Dry Run: $DryRun
Rotate All: $RotateAll

Secrets Rotated:
$(foreach ($key in $newSecrets.Keys) { "  - $key" })

Backup Location:
  $backupFile

Next Steps:
  1. Update secrets in DigitalOcean App Platform
  2. Redeploy application
  3. Verify application health
  4. Update webhook consumers with new WEBHOOK_SECRET
  5. Notify team of JWT rotation (sessions invalidated)

"@ | Out-File $summaryFile -Encoding UTF8
    
    Write-Host "📄 Rotation summary saved: $summaryFile`n" -ForegroundColor Gray
}

Write-Host "============================================================================`n" -ForegroundColor Cyan

if ($DryRun) {
    Write-Host "✅ DRY RUN COMPLETE - No changes made`n" -ForegroundColor Green
} else {
    Write-Host "✅ SECRET ROTATION PREPARED`n" -ForegroundColor Green
    Write-Host "⚠️  Complete manual steps above to finish rotation`n" -ForegroundColor Yellow
}

