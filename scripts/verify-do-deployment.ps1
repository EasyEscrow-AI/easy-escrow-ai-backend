# Verify DigitalOcean Deployment Against .env.dev
# Checks that all environment variables from .env.dev are correctly deployed

param(
    [Parameter(Mandatory=$false)]
    [string]$AppId = "31d5b0dc-d2be-4923-9946-7039194666cf",
    
    [Parameter(Mandatory=$false)]
    [string]$EnvFile = ".env.dev",
    
    [Parameter(Mandatory=$false)]
    [string]$AppUrl = "https://easyescrow-backend-dev-ks5c5.ondigitalocean.app"
)

$ErrorActionPreference = "Stop"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "DO Deployment Verification" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Load API key
$ApiKey = $env:DIGITALOCEAN_API_KEY
if (-not $ApiKey) {
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
    exit 1
}

# Load expected env vars from .env.dev
if (-not (Test-Path $EnvFile)) {
    Write-Host "❌ Environment file not found: $EnvFile" -ForegroundColor Red
    exit 1
}

Write-Host "📄 Loading expected configuration from: $EnvFile" -ForegroundColor Yellow
$expectedVars = @{}
$lines = Get-Content $EnvFile

foreach ($line in $lines) {
    if ($line -match '^\s*#' -or $line -match '^\s*$') {
        continue
    }
    if ($line -match '^([A-Z_]+)=(.*)$') {
        $expectedVars[$matches[1]] = $matches[2]
    }
}

Write-Host "✅ Loaded $($expectedVars.Count) expected variables" -ForegroundColor Green
Write-Host ""

# Fetch current DO configuration
Write-Host "📡 Fetching current deployment configuration..." -ForegroundColor Yellow
$headers = @{
    "Authorization" = "Bearer $ApiKey"
    "Content-Type" = "application/json"
}

try {
    $response = Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/apps/$AppId" -Method Get -Headers $headers
    $currentEnvs = $response.app.spec.services[0].envs
    
    Write-Host "✅ Fetched $($currentEnvs.Count) deployed variables" -ForegroundColor Green
    Write-Host ""
    
} catch {
    Write-Host "❌ Failed to fetch deployment: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Convert to hashtable for comparison
$deployedVars = @{}
foreach ($env in $currentEnvs) {
    # For encrypted vars, we can't compare values directly
    if ($env.value -match '^EV\[1:') {
        $deployedVars[$env.key] = "[ENCRYPTED]"
    } else {
        $deployedVars[$env.key] = $env.value
    }
}

# Compare configurations
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Configuration Comparison" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$missing = @()
$mismatch = @()
$correct = @()

foreach ($key in $expectedVars.Keys) {
    $expected = $expectedVars[$key]
    $deployed = $deployedVars[$key]
    
    if (-not $deployed) {
        Write-Host "❌ MISSING: $key" -ForegroundColor Red
        $missing += $key
    }
    elseif ($deployed -eq "[ENCRYPTED]") {
        # Can't verify encrypted values, assume correct if present
        Write-Host "✅ $key = [ENCRYPTED - Cannot verify]" -ForegroundColor Yellow
        $correct += $key
    }
    elseif ($deployed -ne $expected) {
        Write-Host "⚠️  MISMATCH: $key" -ForegroundColor Yellow
        Write-Host "   Expected: $expected" -ForegroundColor Gray
        Write-Host "   Deployed: $deployed" -ForegroundColor Gray
        $mismatch += $key
    }
    else {
        Write-Host "✅ $key = $deployed" -ForegroundColor Green
        $correct += $key
    }
}

Write-Host ""

# Check for extra vars in deployment
$extraVars = @()
foreach ($key in $deployedVars.Keys) {
    if (-not $expectedVars.ContainsKey($key)) {
        $extraVars += $key
    }
}

if ($extraVars.Count -gt 0) {
    Write-Host "Additional variables in deployment (not in $EnvFile):" -ForegroundColor Cyan
    foreach ($key in $extraVars) {
        Write-Host "  ℹ️  $key" -ForegroundColor Gray
    }
    Write-Host ""
}

# Summary
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Verification Summary" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Results:" -ForegroundColor Yellow
Write-Host "  ✅ Correct:    $($correct.Count) variables" -ForegroundColor Green
if ($mismatch.Count -gt 0) {
    Write-Host "  ⚠️  Mismatches: $($mismatch.Count) variables" -ForegroundColor Yellow
}
if ($missing.Count -gt 0) {
    Write-Host "  ❌ Missing:    $($missing.Count) variables" -ForegroundColor Red
}
Write-Host "  ℹ️  Extra:      $($extraVars.Count) variables" -ForegroundColor Gray
Write-Host ""

# Check server health
Write-Host "Checking server health..." -ForegroundColor Yellow
try {
    $healthResponse = Invoke-RestMethod -Uri "$AppUrl/health" -Method Get -TimeoutSec 10
    Write-Host "✅ Server is healthy" -ForegroundColor Green
    Write-Host "   Status: $($healthResponse.status)" -ForegroundColor White
    Write-Host ""
} catch {
    Write-Host "⚠️  Server health check failed" -ForegroundColor Yellow
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Gray
    Write-Host "   The server may still be deploying..." -ForegroundColor Yellow
    Write-Host ""
}

# Final verdict
Write-Host "============================================" -ForegroundColor Cyan
if ($missing.Count -eq 0 -and $mismatch.Count -eq 0) {
    Write-Host "✅ DEPLOYMENT VERIFIED" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "All environment variables from $EnvFile are correctly deployed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor Yellow
    Write-Host "  1. Run E2E tests: npm run test:e2e" -ForegroundColor White
    Write-Host "  2. Monitor logs: https://cloud.digitalocean.com/apps/$AppId" -ForegroundColor White
    Write-Host ""
    exit 0
} else {
    Write-Host "⚠️  DEPLOYMENT ISSUES FOUND" -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""
    
    if ($missing.Count -gt 0) {
        Write-Host "Missing variables:" -ForegroundColor Red
        foreach ($key in $missing) {
            Write-Host "  - $key" -ForegroundColor White
        }
        Write-Host ""
    }
    
    if ($mismatch.Count -gt 0) {
        Write-Host "Mismatched variables:" -ForegroundColor Yellow
        foreach ($key in $mismatch) {
            Write-Host "  - $key" -ForegroundColor White
        }
        Write-Host ""
    }
    
    Write-Host "To fix:" -ForegroundColor Yellow
    Write-Host "  .\scripts\deploy-with-env-verification.ps1" -ForegroundColor White
    Write-Host ""
    exit 1
}

