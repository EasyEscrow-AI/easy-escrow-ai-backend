# Fix SOLANA_RPC_URL in DigitalOcean App Platform
# This script removes and re-adds the SOLANA_RPC_URL to clear the placeholder value

param(
    [Parameter(Mandatory=$true)]
    [string]$SolanaRpcUrl,
    
    [string]$AppName = "easyescrow-backend-staging"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Fix SOLANA_RPC_URL in DigitalOcean" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Validate RPC URL format
if (-not ($SolanaRpcUrl -match '^https?://')) {
    Write-Host "[ERROR] RPC URL must start with http:// or https://" -ForegroundColor Red
    Write-Host "Got: $SolanaRpcUrl" -ForegroundColor Yellow
    exit 1
}

Write-Host "[INFO] RPC URL: $($SolanaRpcUrl.Substring(0, [Math]::Min(40, $SolanaRpcUrl.Length)))..." -ForegroundColor Yellow
Write-Host ""

# Get app ID
Write-Host "[INFO] Finding app: $AppName" -ForegroundColor Yellow
try {
    $appList = doctl apps list --format ID,Spec.Name --no-header 2>&1
    $appLine = $appList | Where-Object { $_ -match $AppName }
    
    if (-not $appLine) {
        Write-Host "[ERROR] App not found: $AppName" -ForegroundColor Red
        Write-Host "Available apps:" -ForegroundColor Yellow
        Write-Host $appList
        exit 1
    }
    
    $appId = ($appLine -split '\s+')[0]
    Write-Host "[SUCCESS] Found app ID: $appId" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "[ERROR] Failed to get app ID: $_" -ForegroundColor Red
    exit 1
}

# Get current app spec
Write-Host "[INFO] Fetching current app spec..." -ForegroundColor Yellow
try {
    $appSpec = doctl apps spec get $appId --format json 2>&1 | ConvertFrom-Json
    Write-Host "[SUCCESS] Retrieved app spec" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "[ERROR] Failed to get app spec: $_" -ForegroundColor Red
    exit 1
}

# Find and update SOLANA_RPC_URL in the api service
Write-Host "[INFO] Updating SOLANA_RPC_URL environment variable..." -ForegroundColor Yellow

$updated = $false
foreach ($service in $appSpec.services) {
    if ($service.name -eq "api") {
        $envVars = @()
        $found = $false
        
        foreach ($env in $service.envs) {
            if ($env.key -eq "SOLANA_RPC_URL") {
                # Update the value
                $env.value = $SolanaRpcUrl
                $env.type = "SECRET"
                $env.scope = "RUN_TIME"
                $found = $true
                Write-Host "  [OK] Updated existing SOLANA_RPC_URL" -ForegroundColor Green
            }
            $envVars += $env
        }
        
        if (-not $found) {
            # Add new variable
            $newEnv = @{
                key = "SOLANA_RPC_URL"
                value = $SolanaRpcUrl
                type = "SECRET"
                scope = "RUN_TIME"
            }
            $envVars += $newEnv
            Write-Host "  [OK] Added new SOLANA_RPC_URL" -ForegroundColor Green
        }
        
        $service.envs = $envVars
        $updated = $true
        break
    }
}

if (-not $updated) {
    Write-Host "[ERROR] Could not find 'api' service in app spec" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Save updated spec to temp file
$tempSpec = "temp-app-spec-$appId.json"
$appSpec | ConvertTo-Json -Depth 100 | Set-Content $tempSpec

Write-Host "[INFO] Applying updated app spec..." -ForegroundColor Yellow
try {
    $updateResult = doctl apps update $appId --spec $tempSpec 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[SUCCESS] App spec updated!" -ForegroundColor Green
        Write-Host ""
        Write-Host "DigitalOcean will now redeploy your app with the correct RPC URL." -ForegroundColor Cyan
        Write-Host ""
    } else {
        Write-Host "[ERROR] Failed to update app spec:" -ForegroundColor Red
        Write-Host $updateResult
        exit 1
    }
} catch {
    Write-Host "[ERROR] Failed to update app: $_" -ForegroundColor Red
    exit 1
} finally {
    # Clean up temp file
    if (Test-Path $tempSpec) {
        Remove-Item $tempSpec
    }
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "[SUCCESS] SOLANA_RPC_URL Updated!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Monitor deployment: doctl apps list-deployments $appId" -ForegroundColor White
Write-Host "  2. View logs: doctl apps logs $appId --follow" -ForegroundColor White
Write-Host "  3. Check health: curl https://staging.easyescrow.ai/health" -ForegroundColor White
Write-Host ""

