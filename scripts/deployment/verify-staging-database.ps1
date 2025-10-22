# Verify Staging Database Configuration
# Checks which database the DATABASE_URL is pointing to

param(
    [string]$AppName = "easyescrow-backend-staging"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Verify Staging Database Configuration" -ForegroundColor Cyan
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

# Get app spec
Write-Host "[INFO] Fetching app environment variables..." -ForegroundColor Yellow
try {
    $appSpec = doctl apps spec get $appId --format json 2>&1 | ConvertFrom-Json
    
    foreach ($service in $appSpec.services) {
        if ($service.name -eq "api") {
            Write-Host "[INFO] Checking DATABASE_URL configuration..." -ForegroundColor Yellow
            Write-Host ""
            
            $databaseUrl = $null
            $databasePoolUrl = $null
            
            foreach ($env in $service.envs) {
                if ($env.key -eq "DATABASE_URL") {
                    $databaseUrl = $env.value
                }
                if ($env.key -eq "DATABASE_POOL_URL") {
                    $databasePoolUrl = $env.value
                }
            }
            
            # Check DATABASE_URL
            if ($databaseUrl) {
                Write-Host "DATABASE_URL:" -ForegroundColor Cyan
                
                if ($databaseUrl -match '/([^/?]+)\?') {
                    $dbName = $matches[1]
                    Write-Host "  Database Name: $dbName" -ForegroundColor White
                    
                    if ($dbName -eq "defaultdb") {
                        Write-Host "  [ERROR] ❌ Using WRONG database: defaultdb" -ForegroundColor Red
                        Write-Host "  [FIX] Should be: easyescrow_staging" -ForegroundColor Yellow
                    } elseif ($dbName -eq "easyescrow_staging") {
                        Write-Host "  [OK] ✅ Using CORRECT database: easyescrow_staging" -ForegroundColor Green
                    } else {
                        Write-Host "  [WARN] ⚠️ Using unexpected database: $dbName" -ForegroundColor Yellow
                    }
                } else {
                    Write-Host "  [WARN] Could not parse database name from URL" -ForegroundColor Yellow
                }
                
                # Show partial URL for debugging
                if ($databaseUrl -match '(postgresql://[^:]+:[^@]+@[^/]+)/') {
                    $partialUrl = $matches[1]
                    Write-Host "  Connection: $partialUrl/..." -ForegroundColor Gray
                }
                
                Write-Host ""
            } else {
                Write-Host "[ERROR] DATABASE_URL not found in environment variables!" -ForegroundColor Red
                Write-Host ""
            }
            
            # Check DATABASE_POOL_URL
            if ($databasePoolUrl) {
                Write-Host "DATABASE_POOL_URL:" -ForegroundColor Cyan
                
                if ($databasePoolUrl -match '/([^/?]+)\?') {
                    $dbName = $matches[1]
                    Write-Host "  Database Name: $dbName" -ForegroundColor White
                    
                    if ($dbName -eq "defaultdb") {
                        Write-Host "  [ERROR] ❌ Using WRONG database: defaultdb" -ForegroundColor Red
                        Write-Host "  [FIX] Should be: easyescrow_staging" -ForegroundColor Yellow
                    } elseif ($dbName -eq "easyescrow_staging") {
                        Write-Host "  [OK] ✅ Using CORRECT database: easyescrow_staging" -ForegroundColor Green
                    } else {
                        Write-Host "  [WARN] ⚠️ Using unexpected database: $dbName" -ForegroundColor Yellow
                    }
                }
                
                Write-Host ""
            }
            
            break
        }
    }
    
} catch {
    Write-Host "[ERROR] Failed to get app spec: $_" -ForegroundColor Red
    exit 1
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "If DATABASE_URL points to 'defaultdb':" -ForegroundColor White
Write-Host "  1. Go to DigitalOcean Console → Apps → $AppName" -ForegroundColor White
Write-Host "  2. Settings → Environment Variables" -ForegroundColor White
Write-Host "  3. Edit DATABASE_URL" -ForegroundColor White
Write-Host "  4. Change '/defaultdb?' to '/easyescrow_staging?'" -ForegroundColor White
Write-Host "  5. Do the same for DATABASE_POOL_URL" -ForegroundColor White
Write-Host "  6. Save and redeploy" -ForegroundColor White
Write-Host ""
Write-Host "Correct format:" -ForegroundColor Cyan
Write-Host "  postgresql://USER:PASS@HOST:25060/easyescrow_staging?sslmode=require" -ForegroundColor Gray
Write-Host ""

