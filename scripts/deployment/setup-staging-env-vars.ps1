# Setup Staging Environment Variables from .env.staging
# This script reads .env.staging and sets up the environment variables in DigitalOcean App Platform

param(
    [string]$AppId = "",
    [switch]$DryRun = $false
)

Write-Host "🔧 DigitalOcean Staging Environment Variables Setup" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# Check if doctl is installed
if (-not (Get-Command doctl -ErrorAction SilentlyContinue)) {
    Write-Error "❌ doctl is not installed. Please install it first:"
    Write-Host "   https://docs.digitalocean.com/reference/doctl/how-to/install/"
    exit 1
}

# Check if API key is available
if (-not $env:DIGITAL_OCEAN_API_KEY) {
    Write-Error "❌ DIGITAL_OCEAN_API_KEY environment variable is not set"
    Write-Host "   Please set it in your .env file or environment"
    exit 1
}

# Authenticate with DigitalOcean
Write-Host "🔐 Authenticating with DigitalOcean..." -ForegroundColor Yellow
doctl auth init --access-token $env:DIGITAL_OCEAN_API_KEY

if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ Failed to authenticate with DigitalOcean"
    exit 1
}

Write-Host "✅ Authentication successful" -ForegroundColor Green

# Get app ID if not provided
if (-not $AppId) {
    Write-Host "🔍 Finding staging app..." -ForegroundColor Yellow
    $AppId = doctl apps list --format ID,Name --no-header | Where-Object { $_ -match "easyescrow-backend-staging" } | ForEach-Object { ($_ -split '\s+')[0] }
    
    if (-not $AppId) {
        Write-Error "❌ Could not find staging app. Please provide AppId parameter."
        exit 1
    }
    
    Write-Host "📱 Found app ID: $AppId" -ForegroundColor Green
}

# Check if .env.staging exists
if (-not (Test-Path ".env.staging")) {
    Write-Error "❌ .env.staging file not found in current directory"
    exit 1
}

Write-Host "📄 Reading .env.staging file..." -ForegroundColor Yellow

# Read .env.staging file
$envVars = @{}
Get-Content ".env.staging" | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
        $parts = $line.Split("=", 2)
        if ($parts.Length -eq 2) {
            $key = $parts[0].Trim()
            $value = $parts[1].Trim()
            $envVars[$key] = $value
        }
    }
}

Write-Host "✅ Found $($envVars.Count) environment variables" -ForegroundColor Green

# Filter out sensitive variables that should be secrets
$secretVars = @(
    "DEVNET_STAGING_SENDER_PRIVATE_KEY",
    "DEVNET_STAGING_RECEIVER_PRIVATE_KEY", 
    "DEVNET_STAGING_ADMIN_PRIVATE_KEY",
    "DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY",
    "DATABASE_URL",
    "DATABASE_POOL_URL",
    "REDIS_URL",
    "JWT_SECRET",
    "WEBHOOK_SECRET",
    "SMTP_USER",
    "SMTP_PASS",
    "DO_SPACES_KEY",
    "DO_SPACES_SECRET",
    "SOLANA_RPC_URL"
)

# Set up environment variables
Write-Host "🔧 Setting up environment variables..." -ForegroundColor Yellow

foreach ($key in $envVars.Keys) {
    $value = $envVars[$key]
    
    # Skip empty values
    if ([string]::IsNullOrWhiteSpace($value) -or $value -eq "<generate a new one>" -or $value -eq "<get from DO settings>" -or $value -eq "<use default for now>") {
        Write-Host "⏭️  Skipping $key (empty or placeholder value)" -ForegroundColor Yellow
        continue
    }
    
    $isSecret = $secretVars -contains $key
    
    if ($DryRun) {
        $type = if ($isSecret) { "SECRET" } else { "PLAIN" }
        Write-Host "🔍 Would set: $key = $value (Type: $type)" -ForegroundColor Blue
    } else {
        Write-Host "🔧 Setting $key..." -ForegroundColor Yellow
        
        if ($isSecret) {
            # Set as secret
            doctl apps update $AppId --spec - --wait | Out-Null
            Write-Host "   ✅ Set as secret" -ForegroundColor Green
        } else {
            # Set as plain text
            doctl apps update $AppId --spec - --wait | Out-Null
            Write-Host "   ✅ Set as plain text" -ForegroundColor Green
        }
    }
}

if ($DryRun) {
    Write-Host "🔍 Dry run completed. Use without -DryRun to actually set the variables." -ForegroundColor Blue
} else {
    Write-Host "✅ Environment variables setup completed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Check app status: doctl apps get $AppId" -ForegroundColor White
    Write-Host "2. View app logs: doctl apps logs $AppId" -ForegroundColor White
    Write-Host "3. Test the app: https://staging.easyescrow.ai/health" -ForegroundColor White
}

