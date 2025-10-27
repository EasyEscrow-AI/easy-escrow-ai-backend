# Update Staging App Environment Variables
# This script updates the existing staging app with environment variables from .env.staging

param(
    [string]$AppId = "ea13cdbb-c74e-40da-a0eb-6c05b0d0432d"
)

Write-Host "🔧 DigitalOcean Staging Environment Update" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

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

# Check if .do/staging.yaml exists
if (-not (Test-Path ".do/staging.yaml")) {
    Write-Error "❌ .do/staging.yaml not found"
    exit 1
}

# Update the app using the existing spec
Write-Host "🔄 Updating app with staging configuration..." -ForegroundColor Yellow
doctl apps update $AppId --spec .do/staging.yaml

if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ Failed to update app with staging configuration"
    exit 1
}

Write-Host "✅ App updated successfully!" -ForegroundColor Green

# Get app status
Write-Host "📊 Getting app status..." -ForegroundColor Yellow
doctl apps get $AppId

Write-Host ""
Write-Host "🎉 Staging app update completed!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Check app status: doctl apps get $AppId" -ForegroundColor White
Write-Host "2. View app logs: doctl apps logs $AppId" -ForegroundColor White
Write-Host "3. Test the app: https://staging.easyescrow.ai/health" -ForegroundColor White
Write-Host "4. Monitor deployment: doctl apps logs $AppId --follow" -ForegroundColor White

