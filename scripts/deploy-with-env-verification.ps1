# Deploy to DigitalOcean Dev Server with Full Environment Verification
# Uses .env.dev file as source of truth for all environment variables

param(
    [Parameter(Mandatory=$false)]
    [string]$AppId = "31d5b0dc-d2be-4923-9946-7039194666cf",
    
    [Parameter(Mandatory=$false)]
    [string]$EnvFile = ".env.dev",
    
    [switch]$DryRun = $false
)

$ErrorActionPreference = "Stop"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "DO Dev Server - Full Environment Deployment" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Load API key
$ApiKey = $env:DIGITALOCEAN_API_KEY
if (-not $ApiKey) {
    # Try loading from .env
    if (Test-Path ".env") {
        Get-Content ".env" | ForEach-Object {
            if ($_ -match '^DIGITAL_OCEAN_API_KEY=(.+)$') {
                $ApiKey = $matches[1]
            }
        }
    }
}

if (-not $ApiKey) {
    Write-Host "❌ DIGITALOCEAN_API_KEY not found" -ForegroundColor Red
    Write-Host "   Set DIGITALOCEAN_API_KEY environment variable or add to .env file" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ API Key loaded" -ForegroundColor Green
Write-Host ""

# Check if .env.dev exists
if (-not (Test-Path $EnvFile)) {
    Write-Host "❌ Environment file not found: $EnvFile" -ForegroundColor Red
    exit 1
}

Write-Host "📄 Loading environment variables from: $EnvFile" -ForegroundColor Yellow
Write-Host ""

# Parse .env.dev file
$envVars = @{}
$lines = Get-Content $EnvFile

foreach ($line in $lines) {
    # Skip comments and empty lines
    if ($line -match '^\s*#' -or $line -match '^\s*$') {
        continue
    }
    
    # Parse KEY=VALUE
    if ($line -match '^([A-Z_]+)=(.*)$') {
        $key = $matches[1]
        $value = $matches[2]
        $envVars[$key] = $value
    }
}

Write-Host "Found $($envVars.Count) environment variables in $EnvFile" -ForegroundColor Green
Write-Host ""

# Display critical variables
Write-Host "Critical Configuration:" -ForegroundColor Cyan
Write-Host "  ESCROW_PROGRAM_ID:    $($envVars['ESCROW_PROGRAM_ID'])" -ForegroundColor White
Write-Host "  USDC_MINT_ADDRESS:    $($envVars['USDC_MINT_ADDRESS'])" -ForegroundColor White
Write-Host "  SOLANA_NETWORK:       $($envVars['SOLANA_NETWORK'])" -ForegroundColor White
Write-Host "  NODE_ENV:             $($envVars['NODE_ENV'])" -ForegroundColor White
Write-Host ""

# Display wallet configuration
Write-Host "Wallet Configuration:" -ForegroundColor Cyan
Write-Host "  DEVNET_SENDER_PRIVATE_KEY:        $(if($envVars['DEVNET_SENDER_PRIVATE_KEY']){'✅ Set'}else{'❌ Missing'})" -ForegroundColor $(if($envVars['DEVNET_SENDER_PRIVATE_KEY']){'Green'}else{'Red'})
Write-Host "  DEVNET_RECEIVER_PRIVATE_KEY:      $(if($envVars['DEVNET_RECEIVER_PRIVATE_KEY']){'✅ Set'}else{'❌ Missing'})" -ForegroundColor $(if($envVars['DEVNET_RECEIVER_PRIVATE_KEY']){'Green'}else{'Red'})
Write-Host "  DEVNET_ADMIN_PRIVATE_KEY:         $(if($envVars['DEVNET_ADMIN_PRIVATE_KEY']){'✅ Set'}else{'❌ Missing'})" -ForegroundColor $(if($envVars['DEVNET_ADMIN_PRIVATE_KEY']){'Green'}else{'Red'})
Write-Host "  DEVNET_FEE_COLLECTOR_PRIVATE_KEY: $(if($envVars['DEVNET_FEE_COLLECTOR_PRIVATE_KEY']){'✅ Set'}else{'❌ Missing'})" -ForegroundColor $(if($envVars['DEVNET_FEE_COLLECTOR_PRIVATE_KEY']){'Green'}else{'Red'})
Write-Host ""

if ($DryRun) {
    Write-Host "🔍 DRY RUN MODE - No changes will be made" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Would update the following variables:" -ForegroundColor Cyan
    $envVars.GetEnumerator() | Sort-Object Name | ForEach-Object {
        $displayValue = if ($_.Key -match "SECRET|KEY|PASSWORD|URL") {
            "$($_.Value.Substring(0, [Math]::Min(20, $_.Value.Length)))..."
        } else {
            $_.Value
        }
        Write-Host "  $($_.Key) = $displayValue" -ForegroundColor White
    }
    Write-Host ""
    Write-Host "Run without -DryRun to apply changes" -ForegroundColor Yellow
    exit 0
}

# Get current app spec
Write-Host "Fetching current app configuration from DigitalOcean..." -ForegroundColor Yellow
$headers = @{
    "Authorization" = "Bearer $ApiKey"
    "Content-Type" = "application/json"
}

try {
    $response = Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/apps/$AppId" -Method Get -Headers $headers
    $appSpec = $response.app.spec
    
    Write-Host "✅ Current configuration fetched" -ForegroundColor Green
    Write-Host ""
    
} catch {
    Write-Host "❌ Failed to fetch app configuration: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Build new environment variables array
Write-Host "Building new environment configuration..." -ForegroundColor Yellow
$service = $appSpec.services[0]
$currentEnvs = $service.envs

# Keep existing env vars that are NOT in .env.dev
$newEnvs = @()
$keysFromFile = $envVars.Keys

foreach ($env in $currentEnvs) {
    if (-not $keysFromFile.Contains($env.key)) {
        Write-Host "  Keeping existing: $($env.key)" -ForegroundColor Gray
        $newEnvs += $env
    }
}

# Add all env vars from .env.dev
foreach ($key in $envVars.Keys) {
    Write-Host "  Setting: $key" -ForegroundColor Cyan
    $newEnvs += @{
        key = $key
        value = $envVars[$key]
        type = "SECRET"  # Mark all as secrets for security
        scope = "RUN_AND_BUILD_TIME"
    }
}

$service.envs = $newEnvs
$appSpec.services[0] = $service

Write-Host "✅ Configuration prepared ($($newEnvs.Count) total variables)" -ForegroundColor Green
Write-Host ""

# Update the app
Write-Host "Applying configuration to DigitalOcean..." -ForegroundColor Yellow

try {
    $updateBody = @{
        spec = $appSpec
    } | ConvertTo-Json -Depth 10
    
    $updateResponse = Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/apps/$AppId" -Method Put -Headers $headers -Body $updateBody
    
    Write-Host "✅ Configuration updated successfully!" -ForegroundColor Green
    Write-Host ""
    
} catch {
    Write-Host "❌ Failed to update configuration: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Trigger deployment
Write-Host "Triggering new deployment..." -ForegroundColor Yellow

try {
    $deployResponse = Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/apps/$AppId/deployments" -Method Post -Headers $headers
    
    $deploymentId = $deployResponse.deployment.id
    Write-Host "✅ Deployment triggered!" -ForegroundColor Green
    Write-Host "   Deployment ID: $deploymentId" -ForegroundColor White
    Write-Host ""
    
} catch {
    Write-Host "❌ Failed to trigger deployment: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Summary
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "✅ Deployment Started Successfully!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Configuration Applied:" -ForegroundColor Yellow
Write-Host "  Source:       $EnvFile" -ForegroundColor White
Write-Host "  Variables:    $($envVars.Count) from file" -ForegroundColor White
Write-Host "  Total:        $($newEnvs.Count) environment variables" -ForegroundColor White
Write-Host ""

Write-Host "Deployment:" -ForegroundColor Yellow
Write-Host "  App ID:       $AppId" -ForegroundColor White
Write-Host "  Deployment:   $deploymentId" -ForegroundColor White
Write-Host "  Status:       Building..." -ForegroundColor Yellow
Write-Host "  Monitor:      https://cloud.digitalocean.com/apps/$AppId" -ForegroundColor White
Write-Host ""

Write-Host "Expected Deployment Time: 3-5 minutes" -ForegroundColor Cyan
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Wait for deployment to complete" -ForegroundColor White
Write-Host "  2. Verify with: .\scripts\verify-do-deployment.ps1" -ForegroundColor White
Write-Host "  3. Run E2E tests: npm run test:e2e" -ForegroundColor White
Write-Host ""

