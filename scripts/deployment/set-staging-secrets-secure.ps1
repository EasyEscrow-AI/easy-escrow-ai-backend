# Set Staging Secrets Securely via DigitalOcean API
# This script reads secrets from .env.staging and sets them in DigitalOcean App Platform
# WITHOUT exposing them in YAML files or command history

param(
    [string]$AppId = "ea13cdbb-c74e-40da-a0eb-6c05b0d0432d",
    [switch]$DryRun = $false
)

Write-Host "🔐 DigitalOcean Staging Secrets Setup (Secure Method)" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# Check if API key is available
if (-not $env:DIGITAL_OCEAN_API_KEY) {
    Write-Error "❌ DIGITAL_OCEAN_API_KEY environment variable is not set"
    exit 1
}

# Check if .env.staging exists
if (-not (Test-Path ".env.staging")) {
    Write-Error "❌ .env.staging file not found in current directory"
    exit 1
}

Write-Host "📄 Reading secrets from .env.staging..." -ForegroundColor Yellow

# Define which variables are secrets
$secretVars = @(
    "SOLANA_RPC_URL",
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
    "DIGITAL_OCEAN_API_KEY"
)

# Read .env.staging file
$envVars = @{}
Get-Content ".env.staging" | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
        $parts = $line.Split("=", 2)
        if ($parts.Length -eq 2) {
            $key = $parts[0].Trim()
            $value = $parts[1].Trim()
            
            # Only store if it's a secret variable
            if ($secretVars -contains $key) {
                # Skip empty values and placeholders
                if (-not ([string]::IsNullOrWhiteSpace($value)) -and 
                    $value -ne "<generate a new one>" -and 
                    $value -ne "<get from DO settings>" -and 
                    $value -ne "<use default for now>") {
                    $envVars[$key] = $value
                }
            }
        }
    }
}

Write-Host "✅ Found $($envVars.Count) secrets to set" -ForegroundColor Green

if ($DryRun) {
    Write-Host "`n🔍 DRY RUN - Would set the following secrets:" -ForegroundColor Blue
    foreach ($key in $envVars.Keys) {
        $maskedValue = $envVars[$key].Substring(0, [Math]::Min(10, $envVars[$key].Length)) + "..."
        Write-Host "   - $key = $maskedValue" -ForegroundColor Blue
    }
    Write-Host "`nRun without -DryRun to actually set the secrets." -ForegroundColor Blue
    exit 0
}

Write-Host "`n⚠️  WARNING: This will set secrets in DigitalOcean App Platform" -ForegroundColor Yellow
Write-Host "The following secrets will be configured:" -ForegroundColor Yellow
foreach ($key in $envVars.Keys) {
    Write-Host "   - $key" -ForegroundColor Yellow
}

$confirm = Read-Host "`nContinue? (y/N)"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "❌ Operation cancelled by user" -ForegroundColor Red
    exit 0
}

Write-Host "`n🔧 Setting secrets via DigitalOcean API..." -ForegroundColor Yellow

# Get current app spec
Write-Host "📥 Fetching current app spec..." -ForegroundColor Yellow
$appSpec = doctl apps spec get $AppId --format json | ConvertFrom-Json

if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ Failed to fetch app spec"
    exit 1
}

# Update environment variables in the spec
$service = $appSpec.services[0]
$existingEnvs = $service.envs

# Update or add secret environment variables
foreach ($key in $envVars.Keys) {
    $value = $envVars[$key]
    
    # Find if env var already exists
    $existingEnv = $existingEnvs | Where-Object { $_.key -eq $key }
    
    if ($existingEnv) {
        Write-Host "🔄 Updating $key..." -ForegroundColor Yellow
        $existingEnv.value = $value
        $existingEnv.type = "SECRET"
        $existingEnv.scope = "RUN_TIME"
    } else {
        Write-Host "➕ Adding $key..." -ForegroundColor Yellow
        $newEnv = @{
            key = $key
            value = $value
            type = "SECRET"
            scope = "RUN_TIME"
        }
        $existingEnvs += $newEnv
    }
}

# Update the service envs
$service.envs = $existingEnvs

# Save updated spec to temporary file
$tempSpec = "temp-secrets-spec.json"
$appSpec | ConvertTo-Json -Depth 10 | Out-File -FilePath $tempSpec -Encoding UTF8

Write-Host "📤 Uploading updated spec to DigitalOcean..." -ForegroundColor Yellow
doctl apps update $AppId --spec $tempSpec

if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ Failed to update app with secrets"
    Remove-Item $tempSpec -ErrorAction SilentlyContinue
    exit 1
}

# Clean up
Remove-Item $tempSpec -ErrorAction SilentlyContinue

Write-Host "✅ Secrets set successfully!" -ForegroundColor Green
Write-Host "`n⚠️  IMPORTANT: Clear your PowerShell history to remove secret values:" -ForegroundColor Yellow
Write-Host "   Clear-History" -ForegroundColor White
Write-Host "`n📊 Next steps:" -ForegroundColor Cyan
Write-Host "1. Check app status: doctl apps get $AppId" -ForegroundColor White
Write-Host "2. Monitor deployment: doctl apps logs $AppId --follow" -ForegroundColor White
Write-Host "3. Test the app: https://staging.easyescrow.ai/health" -ForegroundColor White

