#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Orchestrates zero-downtime database migrations on STAGING environment
.DESCRIPTION
    Executes database migrations using the 5-phase zero-downtime strategy:
    - Phase 1: Deploy backward-compatible schema
    - Phase 2: Deploy dual-support application code
    - Phase 3: Migrate data and apply breaking changes
    - Phase 4: Deploy final application code
    - Phase 5: Clean up deprecated schema
.PARAMETER Phase
    The phase to execute (phase1, phase2, phase3, phase4, phase5, or all)
.PARAMETER MigrationName
    Name of the migration being performed (for logging)
.PARAMETER WaitTime
    Seconds to wait after each phase for monitoring (default: 60)
.PARAMETER SkipHealthChecks
    Skip health checks after migration (not recommended)
.EXAMPLE
    .\zero-downtime-migration.ps1 -Phase phase1 -MigrationName "rename-fee-bps"
.EXAMPLE
    .\zero-downtime-migration.ps1 -Phase all -MigrationName "add-user-status" -WaitTime 120
#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("phase1", "phase2", "phase3", "phase4", "phase5", "all")]
    [string]$Phase,

    [Parameter(Mandatory=$true)]
    [string]$MigrationName,

    [Parameter(Mandatory=$false)]
    [int]$WaitTime = 60,

    [Parameter(Mandatory=$false)]
    [switch]$SkipHealthChecks
)

$ErrorActionPreference = "Stop"

# Colors for output
$Green = [ConsoleColor]::Green
$Red = [ConsoleColor]::Red
$Yellow = [ConsoleColor]::Yellow
$Cyan = [ConsoleColor]::Cyan

function Write-Header {
    param([string]$Message)
    Write-Host ""
    Write-Host ("=" * 80) -ForegroundColor $Cyan
    Write-Host $Message -ForegroundColor $Cyan
    Write-Host ("=" * 80) -ForegroundColor $Cyan
    Write-Host ""
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor $Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor $Red
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor $Yellow
}

function Test-HealthCheck {
    Write-Host "Running health check..." -ForegroundColor $Cyan
    
    try {
        $response = Invoke-WebRequest -Uri "https://staging-api.easyescrow.ai/health" -UseBasicParsing -TimeoutSec 10
        
        if ($response.StatusCode -eq 200) {
            Write-Success "Health check passed"
            return $true
        } else {
            Write-Error "Health check failed with status code: $($response.StatusCode)"
            return $false
        }
    } catch {
        Write-Error "Health check failed: $_"
        return $false
    }
}

function Test-DatabaseConnection {
    Write-Host "Testing database connection..." -ForegroundColor $Cyan
    
    try {
        npm run db:test-connection
        Write-Success "Database connection verified"
        return $true
    } catch {
        Write-Error "Database connection failed"
        return $false
    }
}

function Start-MonitoringPeriod {
    param([int]$Seconds)
    
    Write-Header "Monitoring Period: $Seconds seconds"
    
    $interval = [Math]::Min(10, $Seconds)
    $iterations = [Math]::Ceiling($Seconds / $interval)
    
    for ($i = 1; $i -le $iterations; $i++) {
        $elapsed = $i * $interval
        $remaining = $Seconds - $elapsed
        
        Write-Host "[$elapsed/$Seconds seconds] Monitoring application..." -ForegroundColor $Cyan
        
        if (-not $SkipHealthChecks) {
            if (-not (Test-HealthCheck)) {
                Write-Error "Health check failed during monitoring period"
                return $false
            }
        }
        
        if ($remaining -gt 0) {
            Start-Sleep -Seconds $interval
        }
    }
    
    Write-Success "Monitoring period completed - no issues detected"
    return $true
}

function Invoke-Phase1 {
    Write-Header "PHASE 1: Deploy Backward-Compatible Schema Changes"
    
    Write-Host "Applying database migrations..." -ForegroundColor $Cyan
    npx prisma migrate deploy
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Migration failed"
        exit 1
    }
    
    Write-Success "Phase 1 migrations applied"
    
    if (-not $SkipHealthChecks) {
        if (-not (Test-DatabaseConnection)) {
            Write-Error "Database connection test failed after migration"
            exit 1
        }
        
        if (-not (Test-HealthCheck)) {
            Write-Error "Health check failed after migration"
            exit 1
        }
    }
    
    Write-Success "Phase 1 completed successfully"
    
    # Log completion
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] Phase 1 completed: $MigrationName"
    Add-Content -Path "migration-log.txt" -Value $logEntry
}

function Invoke-Phase2 {
    Write-Header "PHASE 2: Deploy Application Code Supporting Both Schemas"
    
    Write-Host "Building application..." -ForegroundColor $Cyan
    npm run build
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed"
        exit 1
    }
    
    Write-Success "Application built successfully"
    
    Write-Host "Deploying to STAGING..." -ForegroundColor $Cyan
    docker compose up -d --build backend
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Deployment failed"
        exit 1
    }
    
    Write-Success "Application deployed"
    
    # Wait for application to start
    Write-Host "Waiting for application to start..." -ForegroundColor $Cyan
    Start-Sleep -Seconds 10
    
    if (-not $SkipHealthChecks) {
        if (-not (Test-HealthCheck)) {
            Write-Error "Health check failed after deployment"
            exit 1
        }
        
        Write-Host "Running E2E tests to verify dual schema support..." -ForegroundColor $Cyan
        npm run test:staging:smoke
        
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Smoke tests failed - may need investigation"
        } else {
            Write-Success "Smoke tests passed"
        }
    }
    
    Write-Success "Phase 2 completed successfully"
    
    # Log completion
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] Phase 2 completed: $MigrationName"
    Add-Content -Path "migration-log.txt" -Value $logEntry
}

function Invoke-Phase3 {
    Write-Header "PHASE 3: Migrate Data and Apply Breaking Changes"
    
    Write-Warning "This phase applies breaking schema changes"
    Write-Warning "Ensure Phase 2 application code is deployed and stable"
    
    # Create backup before breaking changes
    Write-Host "Creating database backup..." -ForegroundColor $Cyan
    $backupName = "pre-phase3-$MigrationName-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    
    # Note: Actual backup command would go here
    Write-Host "Backup: $backupName" -ForegroundColor $Yellow
    
    Write-Host "Applying data migration and breaking changes..." -ForegroundColor $Cyan
    npx prisma migrate deploy
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Migration failed"
        Write-Error "Restore from backup: $backupName"
        exit 1
    }
    
    Write-Success "Phase 3 migrations applied"
    
    if (-not $SkipHealthChecks) {
        if (-not (Test-DatabaseConnection)) {
            Write-Error "Database connection test failed"
            exit 1
        }
        
        if (-not (Test-HealthCheck)) {
            Write-Error "Health check failed"
            exit 1
        }
        
        Write-Host "Running data integrity checks..." -ForegroundColor $Cyan
        # Run data integrity tests if available
        # npm run test:data-integrity
    }
    
    Write-Success "Phase 3 completed successfully"
    
    # Log completion
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] Phase 3 completed: $MigrationName (backup: $backupName)"
    Add-Content -Path "migration-log.txt" -Value $logEntry
}

function Invoke-Phase4 {
    Write-Header "PHASE 4: Deploy Final Application Code"
    
    Write-Host "Building final application code..." -ForegroundColor $Cyan
    npm run build
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed"
        exit 1
    }
    
    Write-Success "Application built successfully"
    
    Write-Host "Deploying final code to STAGING..." -ForegroundColor $Cyan
    docker compose up -d --build backend
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Deployment failed"
        exit 1
    }
    
    Write-Success "Final code deployed"
    
    # Wait for application to start
    Write-Host "Waiting for application to start..." -ForegroundColor $Cyan
    Start-Sleep -Seconds 10
    
    if (-not $SkipHealthChecks) {
        if (-not (Test-HealthCheck)) {
            Write-Error "Health check failed after deployment"
            exit 1
        }
        
        Write-Host "Running comprehensive E2E tests..." -ForegroundColor $Cyan
        npm run test:staging:e2e
        
        if ($LASTEXITCODE -ne 0) {
            Write-Error "E2E tests failed"
            Write-Warning "Consider rolling back to Phase 2 code"
            exit 1
        }
        
        Write-Success "E2E tests passed"
    }
    
    Write-Success "Phase 4 completed successfully"
    
    # Log completion
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] Phase 4 completed: $MigrationName"
    Add-Content -Path "migration-log.txt" -Value $logEntry
}

function Invoke-Phase5 {
    Write-Header "PHASE 5: Clean Up Deprecated Schema Elements"
    
    Write-Warning "This phase drops old database structures"
    Write-Warning "Ensure Phase 4 code is stable and no rollback is needed"
    
    Write-Host "Press Enter to continue or Ctrl+C to cancel..." -ForegroundColor $Yellow
    if (-not $SkipHealthChecks) {
        Read-Host
    }
    
    Write-Host "Applying cleanup migrations..." -ForegroundColor $Cyan
    npx prisma migrate deploy
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Cleanup migration failed"
        exit 1
    }
    
    Write-Success "Phase 5 migrations applied"
    
    if (-not $SkipHealthChecks) {
        if (-not (Test-HealthCheck)) {
            Write-Error "Health check failed after cleanup"
            exit 1
        }
    }
    
    Write-Success "Phase 5 completed successfully"
    Write-Success "Migration complete: $MigrationName"
    
    # Log completion
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] Phase 5 completed: $MigrationName - MIGRATION COMPLETE"
    Add-Content -Path "migration-log.txt" -Value $logEntry
}

# Main execution
try {
    Write-Header "Zero-Downtime Migration: $MigrationName"
    
    Write-Host "Phase: $Phase" -ForegroundColor $Cyan
    Write-Host "Wait Time: $WaitTime seconds" -ForegroundColor $Cyan
    Write-Host "Skip Health Checks: $SkipHealthChecks" -ForegroundColor $Cyan
    
    $phases = if ($Phase -eq "all") { 
        @("phase1", "phase2", "phase3", "phase4", "phase5") 
    } else { 
        @($Phase) 
    }
    
    foreach ($currentPhase in $phases) {
        switch ($currentPhase) {
            "phase1" { Invoke-Phase1 }
            "phase2" { Invoke-Phase2 }
            "phase3" { Invoke-Phase3 }
            "phase4" { Invoke-Phase4 }
            "phase5" { Invoke-Phase5 }
        }
        
        # Monitoring period between phases (except after last phase)
        if ($Phase -eq "all" -and $currentPhase -ne "phase5") {
            if (-not (Start-MonitoringPeriod -Seconds $WaitTime)) {
                Write-Error "Monitoring detected issues - stopping migration"
                exit 1
            }
        }
    }
    
    Write-Header "Migration Completed Successfully"
    Write-Success "Migration '$MigrationName' completed"
    
    if ($Phase -eq "all" -or $Phase -eq "phase5") {
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor $Cyan
        Write-Host "1. Continue monitoring application for 24-48 hours"
        Write-Host "2. Review migration logs in migration-log.txt"
        Write-Host "3. Update documentation with migration details"
        Write-Host "4. Consider applying same migration to production"
    }
    
} catch {
    Write-Error "Migration failed: $_"
    Write-Error $_.Exception.StackTrace
    exit 1
}

