# Force Update DATABASE_URL to Use Correct Database
# This script updates both DATABASE_URL and DATABASE_POOL_URL to use easyescrow_staging

param(
    [string]$AppName = "easyescrow-backend-staging"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Force Update DATABASE_URL" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Get app ID
Write-Host "[INFO] Finding app: $AppName" -ForegroundColor Yellow
try {
    $appList = doctl apps list --format ID,Spec.Name --no-header 2>&1
    $appLine = $appList | Where-Object { $_ -match $AppName }
    
    if (-not $appLine) {
        Write-Host "[ERROR] App not found: $AppName" -ForegroundColor Red
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

# Update DATABASE_URL and DATABASE_POOL_URL
Write-Host "[INFO] Updating database URLs..." -ForegroundColor Yellow
Write-Host ""

$updated = $false
foreach ($service in $appSpec.services) {
    if ($service.name -eq "api") {
        foreach ($env in $service.envs) {
            if ($env.key -eq "DATABASE_URL") {
                $oldUrl = $env.value
                
                # Replace defaultdb with easyescrow_staging
                if ($oldUrl -match 'defaultdb') {
                    $newUrl = $oldUrl -replace 'defaultdb', 'easyescrow_staging'
                    $env.value = $newUrl
                    Write-Host "  [UPDATED] DATABASE_URL" -ForegroundColor Green
                    Write-Host "    Old: .../$($oldUrl -replace '.*/', '')..." -ForegroundColor Red
                    Write-Host "    New: .../$($newUrl -replace '.*/', '')..." -ForegroundColor Green
                    $updated = $true
                } else {
                    Write-Host "  [OK] DATABASE_URL already uses easyescrow_staging" -ForegroundColor Green
                }
            }
            
            if ($env.key -eq "DATABASE_POOL_URL") {
                $oldUrl = $env.value
                
                # Check various possible values
                if ($oldUrl -match 'defaultdb') {
                    $newUrl = $oldUrl -replace 'defaultdb', 'easyescrow_staging'
                    $env.value = $newUrl
                    Write-Host "  [UPDATED] DATABASE_POOL_URL" -ForegroundColor Green
                    $updated = $true
                } elseif ($oldUrl -match 'easyescrow_staging_pool') {
                    # Fix the _pool suffix issue
                    $newUrl = $oldUrl -replace 'easyescrow_staging_pool', 'easyescrow_staging'
                    $env.value = $newUrl
                    Write-Host "  [UPDATED] DATABASE_POOL_URL (removed _pool suffix)" -ForegroundColor Green
                    $updated = $true
                } else {
                    Write-Host "  [OK] DATABASE_POOL_URL seems correct" -ForegroundColor Green
                }
            }
        }
        break
    }
}

if (-not $updated) {
    Write-Host "[INFO] No changes needed - database URLs already correct" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "But we'll force a redeploy anyway to ensure the app picks up the values." -ForegroundColor Yellow
}

Write-Host ""

# Save updated spec to temp file
$tempSpec = "temp-app-spec-$appId.json"
$appSpec | ConvertTo-Json -Depth 100 | Set-Content $tempSpec

Write-Host "[INFO] Applying updated app spec..." -ForegroundColor Yellow
Write-Host "[INFO] This will trigger a redeploy..." -ForegroundColor Yellow
Write-Host ""

try {
    $updateResult = doctl apps update $appId --spec $tempSpec 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[SUCCESS] App spec updated!" -ForegroundColor Green
        Write-Host ""
        Write-Host "DigitalOcean is now redeploying your app." -ForegroundColor Cyan
        Write-Host "The new deployment will use the correct database." -ForegroundColor Cyan
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
Write-Host "[SUCCESS] Database URLs Updated!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Wait for deployment to complete (~3-5 minutes)" -ForegroundColor White
Write-Host "  2. Monitor: doctl apps logs $appId --follow" -ForegroundColor White
Write-Host "  3. Look for: '[MonitoringService] Loaded X pending agreements'" -ForegroundColor White
Write-Host "  4. Verify: curl https://staging.easyescrow.ai/health" -ForegroundColor White
Write-Host ""
Write-Host "The app should now connect to 'easyescrow_staging' database." -ForegroundColor Cyan
Write-Host ""

