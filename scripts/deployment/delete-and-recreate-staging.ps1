# Delete and Recreate DigitalOcean Staging App
# This script deletes the existing staging app and recreates it with proper configuration

param(
    [string]$AppId = "acac9246-c6ab-4178-95b1-d4f377883d2b",
    [string]$AppName = "easyescrow-backend-staging",
    [switch]$Force = $false
)

Write-Host "🚀 DigitalOcean Staging App Recreation Script" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

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

# Check if app exists
Write-Host "🔍 Checking if app exists..." -ForegroundColor Yellow
$appExists = doctl apps get $AppId --format ID --no-header 2>$null

if ($appExists) {
    Write-Host "📱 Found existing app: $AppName (ID: $AppId)" -ForegroundColor Yellow
    
    if (-not $Force) {
        $confirm = Read-Host "⚠️  This will DELETE the existing app and all its data. Continue? (y/N)"
        if ($confirm -ne "y" -and $confirm -ne "Y") {
            Write-Host "❌ Operation cancelled by user" -ForegroundColor Red
            exit 0
        }
    }
    
    # Delete the existing app
    Write-Host "🗑️  Deleting existing app..." -ForegroundColor Red
    doctl apps delete $AppId --force
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "❌ Failed to delete existing app"
        exit 1
    }
    
    Write-Host "✅ Existing app deleted successfully" -ForegroundColor Green
    
    # Wait a moment for deletion to complete
    Write-Host "⏳ Waiting for deletion to complete..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
} else {
    Write-Host "ℹ️  No existing app found with ID: $AppId" -ForegroundColor Blue
}

# Create the new app using the staging configuration
Write-Host "🏗️  Creating new staging app..." -ForegroundColor Yellow

# Check if .do/staging.yaml exists
if (-not (Test-Path ".do/staging.yaml")) {
    Write-Error "❌ .do/staging.yaml not found"
    exit 1
}

# Create the app
doctl apps create --spec .do/staging.yaml

if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ Failed to create new staging app"
    exit 1
}

Write-Host "✅ New staging app created successfully!" -ForegroundColor Green

# Get the new app ID
Write-Host "🔍 Getting new app details..." -ForegroundColor Yellow
$newAppId = doctl apps list --format ID,Name --no-header | Where-Object { $_ -match "easyescrow-backend-staging" } | ForEach-Object { ($_ -split '\s+')[0] }

if ($newAppId) {
    Write-Host "📱 New app ID: $newAppId" -ForegroundColor Green
    Write-Host "🌐 App URL: https://$newAppId.ondigitalocean.app" -ForegroundColor Green
} else {
    Write-Host "⚠️  Could not retrieve new app ID automatically" -ForegroundColor Yellow
}

Write-Host "🎉 Staging app recreation completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Check the app status: doctl apps get $newAppId" -ForegroundColor White
Write-Host "2. View app logs: doctl apps logs $newAppId" -ForegroundColor White
Write-Host "3. Set up custom domain: staging.easyescrow.ai" -ForegroundColor White
