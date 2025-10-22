# Setup Staging Secrets and Environment Variables
# This script sets up all the environment variables for the staging app

param(
    [string]$AppId = "ea13cdbb-c74e-40da-a0eb-6c05b0d0432d"
)

Write-Host "🔧 DigitalOcean Staging Secrets Setup" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

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

# Create a temporary spec file for updating the app
$tempSpecFile = "temp-staging-spec.yaml"

# Start building the spec
$specContent = @"
name: easyescrow-backend-staging
region: sgp1

services:
  - name: api
    github:
      repo: VENTURE-AI-LABS/easy-escrow-ai-backend
      branch: staging
      deploy_on_push: true
    
    dockerfile_path: Dockerfile
    
    instance_count: 1
    instance_size_slug: basic-xxs
    
    health_check:
      http_path: /health
      initial_delay_seconds: 60
      period_seconds: 30
      timeout_seconds: 20
      success_threshold: 1
      failure_threshold: 5
    
    http_port: 8080
    
    routes:
      - path: /
    
    envs:
"@

# Add environment variables
foreach ($key in $envVars.Keys) {
    $value = $envVars[$key]
    
    # Skip empty values and placeholders
    if ([string]::IsNullOrWhiteSpace($value) -or $value -eq "<generate a new one>" -or $value -eq "<get from DO settings>" -or $value -eq "<use default for now>") {
        Write-Host "⏭️  Skipping $key (empty or placeholder value)" -ForegroundColor Yellow
        continue
    }
    
    # Determine if it should be a secret
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
    
    $isSecret = $secretVars -contains $key
    
    if ($isSecret) {
        $specContent += "`n      - key: $key`n        value: `$$key`n        type: SECRET`n        scope: RUN_TIME"
    } else {
        # Handle boolean and numeric values by quoting them
        if ($value -eq "true" -or $value -eq "false" -or ($value -match "^\d+$")) {
            $specContent += "`n      - key: $key`n        value: `"$value`"`n        scope: RUN_TIME"
        } else {
            $specContent += "`n      - key: $key`n        value: $value`n        scope: RUN_TIME"
        }
    }
}

# Add domain configuration
$specContent += @"

domains:
  - domain: staging.easyescrow.ai
    type: PRIMARY

alerts:
  - rule: DEPLOYMENT_FAILED
  - rule: DOMAIN_FAILED
"@

# Write the spec to temporary file
$specContent | Out-File -FilePath $tempSpecFile -Encoding UTF8

Write-Host "📝 Created temporary spec file: $tempSpecFile" -ForegroundColor Green

# Update the app with the new spec
Write-Host "🔄 Updating app with environment variables..." -ForegroundColor Yellow
doctl apps update $AppId --spec $tempSpecFile

if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ Failed to update app with environment variables"
    Remove-Item $tempSpecFile -ErrorAction SilentlyContinue
    exit 1
}

Write-Host "✅ App updated successfully!" -ForegroundColor Green

# Clean up temporary file
Remove-Item $tempSpecFile -ErrorAction SilentlyContinue

# Get app status
Write-Host "📊 Getting app status..." -ForegroundColor Yellow
doctl apps get $AppId

Write-Host ""
Write-Host "🎉 Staging app setup completed!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Check app status: doctl apps get $AppId" -ForegroundColor White
Write-Host "2. View app logs: doctl apps logs $AppId" -ForegroundColor White
Write-Host "3. Test the app: https://staging.easyescrow.ai/health" -ForegroundColor White
Write-Host "4. Monitor deployment: doctl apps logs $AppId --follow" -ForegroundColor White
