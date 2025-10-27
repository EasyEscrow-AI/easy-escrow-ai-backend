#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Pre-Deployment Validation for STAGING Environment

.DESCRIPTION
    Comprehensive validation script that runs all critical tests to ensure
    STAGING environment is production-ready before merging to master branch.
    
    This script:
    1. Runs smoke tests (8 critical health checks)
    2. Runs E2E tests (18 comprehensive test scenarios)
    3. Generates detailed validation reports
    4. Returns appropriate exit codes for CI/CD integration

.PARAMETER SkipSmokeTests
    Skip smoke tests and run only E2E tests

.PARAMETER SkipE2ETests
    Skip E2E tests and run only smoke tests

.PARAMETER Verbose
    Enable verbose output

.EXAMPLE
    .\scripts\deployment\pre-deployment-validation.ps1
    Run full validation suite

.EXAMPLE
    .\scripts\deployment\pre-deployment-validation.ps1 -Verbose
    Run with verbose output

.EXAMPLE
    .\scripts\deployment\pre-deployment-validation.ps1 -SkipE2ETests
    Run only smoke tests

.NOTES
    Exit Codes:
    0 - All tests passed, production ready
    1 - Tests failed, DO NOT merge to master
#>

param(
    [switch]$SkipSmokeTests,
    [switch]$SkipE2ETests,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

# Colors
function Write-Header {
    param([string]$Message)
    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor Blue
    Write-Host "  $Message" -ForegroundColor Blue -NoNewline
    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor Blue
    Write-Host ""
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Failure {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Cyan
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

# Main validation
try {
    Write-Header "PRE-DEPLOYMENT VALIDATION - STAGING ENVIRONMENT"
    
    Write-Host "Validating production readiness before master merge..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Environment: STAGING" -ForegroundColor White
    Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor White
    Write-Host ""
    
    # Check if we're in the project root
    if (-not (Test-Path "package.json")) {
        Write-Failure "Must be run from project root directory"
        exit 1
    }
    
    # Use the TypeScript validator
    Write-Info "Executing comprehensive validation suite..."
    Write-Host ""
    
    $env:NODE_ENV = "staging"
    $env:STAGING_VALIDATION = "true"
    
    if ($Verbose) {
        $env:DEBUG = "*"
    }
    
    # Run the validator
    $result = & npm run validate:pre-deployment
    $exitCode = $LASTEXITCODE
    
    Write-Host ""
    
    if ($exitCode -eq 0) {
        Write-Header "VALIDATION COMPLETE"
        Write-Success "All tests passed - STAGING is production-ready"
        Write-Success "Safe to merge to master branch"
        Write-Host ""
        Write-Host "Next Steps:" -ForegroundColor Cyan
        Write-Host "  1. Review validation report: .taskmaster/reports/pre-deployment-validation.md" -ForegroundColor White
        Write-Host "  2. Merge staging branch to master" -ForegroundColor White
        Write-Host "  3. Proceed with production deployment" -ForegroundColor White
        Write-Host ""
        exit 0
    } else {
        Write-Header "VALIDATION FAILED"
        Write-Failure "Tests failed - STAGING is NOT production-ready"
        Write-Failure "DO NOT merge to master branch"
        Write-Host ""
        Write-Host "Next Steps:" -ForegroundColor Cyan
        Write-Host "  1. Review test failures above" -ForegroundColor White
        Write-Host "  2. Fix all failing tests" -ForegroundColor White
        Write-Host "  3. Re-run validation: .\scripts\deployment\pre-deployment-validation.ps1" -ForegroundColor White
        Write-Host "  4. Review validation report: .taskmaster/reports/pre-deployment-validation.md" -ForegroundColor White
        Write-Host ""
        exit 1
    }
    
} catch {
    Write-Host ""
    Write-Failure "Fatal error during validation"
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Stack trace:" -ForegroundColor Gray
    Write-Host $_.ScriptStackTrace -ForegroundColor Gray
    exit 1
}

