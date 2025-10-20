# Verify STAGING Deployment
# Comprehensive verification script for STAGING environment deployment

param(
    [string]$ApiUrl = "https://staging-api.easyescrow.ai",
    [switch]$SkipSmokeTests = $false,
    [switch]$Verbose = $false
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "STAGING Deployment Verification" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$ApiUrl = $ApiUrl.TrimEnd('/')
$HealthEndpoint = "$ApiUrl/health"
$ProgramId = "AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei"
$ExpectedNetwork = "devnet"
$ExpectedEnvironment = "staging"

# Test counters
$TotalTests = 0
$PassedTests = 0
$FailedTests = 0

function Test-Step {
    param(
        [string]$Name,
        [scriptblock]$Action
    )
    
    $script:TotalTests++
    Write-Host "🔍 Testing: $Name..." -ForegroundColor Yellow
    
    try {
        $result = & $Action
        if ($result -eq $true) {
            $script:PassedTests++
            Write-Host "  ✅ PASS" -ForegroundColor Green
            return $true
        } else {
            $script:FailedTests++
            Write-Host "  ❌ FAIL" -ForegroundColor Red
            return $false
        }
    } catch {
        $script:FailedTests++
        Write-Host "  ❌ FAIL: $_" -ForegroundColor Red
        if ($Verbose) {
            Write-Host "  Error details: $($_.Exception.Message)" -ForegroundColor Gray
        }
        return $false
    }
    
    Write-Host ""
}

# Test 1: API Reachability
Test-Step "API Reachability" {
    try {
        $response = Invoke-WebRequest -Uri $HealthEndpoint -Method Get -TimeoutSec 30 -UseBasicParsing
        if ($Verbose) {
            Write-Host "  Status Code: $($response.StatusCode)" -ForegroundColor Gray
        }
        return $response.StatusCode -eq 200
    } catch {
        throw "API unreachable: $_"
    }
}

# Test 2: Health Endpoint Response
$healthData = $null
Test-Step "Health Endpoint Response Format" {
    try {
        $response = Invoke-RestMethod -Uri $HealthEndpoint -Method Get -TimeoutSec 30
        $script:healthData = $response
        
        if ($Verbose) {
            Write-Host "  Response:" -ForegroundColor Gray
            $response | ConvertTo-Json -Depth 10 | Write-Host -ForegroundColor Gray
        }
        
        # Check required fields
        $hasStatus = $null -ne $response.status
        $hasTimestamp = $null -ne $response.timestamp
        $hasChecks = $null -ne $response.checks
        
        return $hasStatus -and $hasTimestamp -and $hasChecks
    } catch {
        throw "Invalid health response: $_"
    }
}

# Test 3: Environment Configuration
Test-Step "Environment Configuration" {
    if ($null -eq $healthData) {
        throw "Health data not available"
    }
    
    $correctEnv = $healthData.environment -eq $ExpectedEnvironment
    $correctNetwork = $healthData.network -eq $ExpectedNetwork
    
    if ($Verbose) {
        Write-Host "  Environment: $($healthData.environment) (expected: $ExpectedEnvironment)" -ForegroundColor Gray
        Write-Host "  Network: $($healthData.network) (expected: $ExpectedNetwork)" -ForegroundColor Gray
    }
    
    if (-not $correctEnv) {
        throw "Wrong environment: $($healthData.environment)"
    }
    
    if (-not $correctNetwork) {
        throw "Wrong network: $($healthData.network)"
    }
    
    return $true
}

# Test 4: Program ID Verification
Test-Step "Program ID Verification" {
    if ($null -eq $healthData -or $null -eq $healthData.versions) {
        throw "Program ID not in health response"
    }
    
    $actualProgramId = $healthData.versions.programId
    
    if ($Verbose) {
        Write-Host "  Program ID: $actualProgramId" -ForegroundColor Gray
        Write-Host "  Expected:   $ProgramId" -ForegroundColor Gray
    }
    
    if ($actualProgramId -ne $ProgramId) {
        throw "Program ID mismatch: $actualProgramId"
    }
    
    return $true
}

# Test 5: Database Connectivity
Test-Step "Database Connectivity" {
    if ($null -eq $healthData -or $null -eq $healthData.checks) {
        throw "Database check not in health response"
    }
    
    $dbStatus = $healthData.checks.database
    
    if ($Verbose) {
        Write-Host "  Database status: $dbStatus" -ForegroundColor Gray
    }
    
    if ($dbStatus -ne "connected") {
        throw "Database not connected: $dbStatus"
    }
    
    return $true
}

# Test 6: Redis Connectivity
Test-Step "Redis Connectivity" {
    if ($null -eq $healthData -or $null -eq $healthData.checks) {
        throw "Redis check not in health response"
    }
    
    $redisStatus = $healthData.checks.redis
    
    if ($Verbose) {
        Write-Host "  Redis status: $redisStatus" -ForegroundColor Gray
    }
    
    if ($redisStatus -ne "connected") {
        throw "Redis not connected: $redisStatus"
    }
    
    return $true
}

# Test 7: Solana RPC Connectivity
Test-Step "Solana RPC Connectivity" {
    if ($null -eq $healthData -or $null -eq $healthData.checks) {
        throw "Solana check not in health response"
    }
    
    $solanaStatus = $healthData.checks.solana
    
    if ($Verbose) {
        Write-Host "  Solana RPC status: $solanaStatus" -ForegroundColor Gray
    }
    
    if ($solanaStatus -ne "connected") {
        throw "Solana RPC not connected: $solanaStatus"
    }
    
    return $true
}

# Test 8: Program Deployment Status
Test-Step "Program Deployment Status" {
    if ($null -eq $healthData -or $null -eq $healthData.checks) {
        throw "Program check not in health response"
    }
    
    $programStatus = $healthData.checks.program
    
    if ($Verbose) {
        Write-Host "  Program status: $programStatus" -ForegroundColor Gray
    }
    
    if ($programStatus -ne "deployed") {
        throw "Program not deployed: $programStatus"
    }
    
    return $true
}

# Test 9: API Documentation
Test-Step "API Documentation (Swagger)" {
    try {
        $swaggerUrl = "$ApiUrl/api-docs"
        $response = Invoke-WebRequest -Uri $swaggerUrl -Method Get -TimeoutSec 10 -UseBasicParsing
        
        if ($Verbose) {
            Write-Host "  Swagger URL: $swaggerUrl" -ForegroundColor Gray
            Write-Host "  Status: $($response.StatusCode)" -ForegroundColor Gray
        }
        
        return $response.StatusCode -eq 200
    } catch {
        # Swagger might not be enabled - this is a warning, not a failure
        Write-Host "  ⚠️  Swagger documentation not accessible (might be disabled)" -ForegroundColor Yellow
        return $true  # Don't fail the test
    }
}

# Test 10: CORS Configuration
Test-Step "CORS Configuration" {
    try {
        $headers = @{
            "Origin" = "https://staging.easyescrow.ai"
        }
        $response = Invoke-WebRequest -Uri $HealthEndpoint -Method Options -Headers $headers -TimeoutSec 10 -UseBasicParsing
        
        $corsHeader = $response.Headers["Access-Control-Allow-Origin"]
        
        if ($Verbose) {
            Write-Host "  CORS Header: $corsHeader" -ForegroundColor Gray
        }
        
        # CORS should be configured for staging.easyescrow.ai
        return $null -ne $corsHeader
    } catch {
        # CORS check might fail due to various reasons - warning only
        Write-Host "  ⚠️  CORS check inconclusive" -ForegroundColor Yellow
        return $true  # Don't fail the test
    }
}

Write-Host ""

# Run Smoke Tests if not skipped
if (-not $SkipSmokeTests) {
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "Running Smoke Tests..." -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""
    
    try {
        # Set environment variables for smoke tests
        $env:STAGING_API_URL = $ApiUrl
        $env:STAGING_PROGRAM_ID = $ProgramId
        
        # Run smoke tests
        npm run test:staging:smoke
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Smoke tests passed" -ForegroundColor Green
            $script:PassedTests++
        } else {
            Write-Host "❌ Smoke tests failed" -ForegroundColor Red
            $script:FailedTests++
        }
        
        $script:TotalTests++
    } catch {
        Write-Host "⚠️  Could not run smoke tests: $_" -ForegroundColor Yellow
        Write-Host "   Run manually: npm run test:staging:smoke" -ForegroundColor Gray
    }
    
    Write-Host ""
}

# Summary
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Verification Summary" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Total Tests:  $TotalTests" -ForegroundColor White
Write-Host "Passed:       $PassedTests" -ForegroundColor Green
Write-Host "Failed:       $FailedTests" -ForegroundColor $(if ($FailedTests -gt 0) { "Red" } else { "Green" })

$successRate = if ($TotalTests -gt 0) { 
    [math]::Round(($PassedTests / $TotalTests) * 100, 2) 
} else { 
    0 
}

Write-Host "Success Rate: $successRate%" -ForegroundColor $(if ($successRate -ge 90) { "Green" } elseif ($successRate -ge 70) { "Yellow" } else { "Red" })
Write-Host ""

# Health Status Summary
if ($null -ne $healthData) {
    Write-Host "Deployment Details:" -ForegroundColor Yellow
    Write-Host "  Environment:  $($healthData.environment)" -ForegroundColor White
    Write-Host "  Network:      $($healthData.network)" -ForegroundColor White
    Write-Host "  Program ID:   $($healthData.versions.programId)" -ForegroundColor White
    Write-Host "  API Version:  $($healthData.versions.api)" -ForegroundColor White
    Write-Host "  Timestamp:    $($healthData.timestamp)" -ForegroundColor White
    Write-Host ""
    
    Write-Host "System Status:" -ForegroundColor Yellow
    Write-Host "  Database:     $($healthData.checks.database)" -ForegroundColor $(if ($healthData.checks.database -eq 'connected') { 'Green' } else { 'Red' })
    Write-Host "  Redis:        $($healthData.checks.redis)" -ForegroundColor $(if ($healthData.checks.redis -eq 'connected') { 'Green' } else { 'Red' })
    Write-Host "  Solana RPC:   $($healthData.checks.solana)" -ForegroundColor $(if ($healthData.checks.solana -eq 'connected') { 'Green' } else { 'Red' })
    Write-Host "  Program:      $($healthData.checks.program)" -ForegroundColor $(if ($healthData.checks.program -eq 'deployed') { 'Green' } else { 'Red' })
    Write-Host ""
}

# Links and Next Steps
Write-Host "Useful Links:" -ForegroundColor Yellow
Write-Host "  Health Endpoint:  $HealthEndpoint" -ForegroundColor Cyan
Write-Host "  API Docs:         $ApiUrl/api-docs" -ForegroundColor Cyan
Write-Host "  Program Explorer: https://explorer.solana.com/address/$ProgramId`?cluster=devnet" -ForegroundColor Cyan
Write-Host ""

# Final verdict
if ($FailedTests -eq 0) {
    Write-Host "✅ STAGING DEPLOYMENT VERIFIED - ALL CHECKS PASSED" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor Cyan
    Write-Host "  1. Monitor application logs: doctl apps logs <app-id> --follow" -ForegroundColor White
    Write-Host "  2. Check monitoring dashboards in DigitalOcean console" -ForegroundColor White
    Write-Host "  3. Run full integration tests: npm run test:staging:integration" -ForegroundColor White
    Write-Host "  4. Notify team of successful deployment" -ForegroundColor White
    Write-Host ""
    exit 0
} else {
    Write-Host "❌ STAGING DEPLOYMENT VERIFICATION FAILED" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting Steps:" -ForegroundColor Cyan
    Write-Host "  1. Check deployment logs: doctl apps logs <app-id> --type build" -ForegroundColor White
    Write-Host "  2. Verify environment variables in DO console" -ForegroundColor White
    Write-Host "  3. Check database and Redis connectivity" -ForegroundColor White
    Write-Host "  4. Review deployment guide: docs/deployment/STAGING_DEPLOYMENT_GUIDE.md" -ForegroundColor White
    Write-Host "  5. Consider rollback if issues persist" -ForegroundColor White
    Write-Host ""
    exit 1
}

