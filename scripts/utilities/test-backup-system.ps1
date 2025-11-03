# Test Backup System
# Tests the backup utility with production credentials safely

param(
    [Parameter(HelpMessage="Path to .env file to use")]
    [string]$EnvFile = ".env.production",
    
    [Parameter(HelpMessage="Skip actual backup/upload (dry-run only)")]
    [switch]$DryRunOnly,
    
    [Parameter(HelpMessage="Test S3 upload")]
    [switch]$TestS3
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║           Backup System Test Suite                        ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Get project root
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $projectRoot

try {
    # Load environment variables from file
    Write-Host "📋 Loading environment from: $EnvFile" -ForegroundColor Yellow
    
    if (-not (Test-Path $EnvFile)) {
        Write-Host "❌ Environment file not found: $EnvFile" -ForegroundColor Red
        exit 1
    }
    
    # Load .env file
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.+)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
    
    Write-Host "✅ Environment loaded" -ForegroundColor Green
    Write-Host ""
    
    # Verify required credentials
    Write-Host "🔍 Verifying credentials..." -ForegroundColor Yellow
    
    $hasDoKey = $null -ne $env:DIGITAL_OCEAN_API_KEY -and $env:DIGITAL_OCEAN_API_KEY -ne ""
    $hasS3Bucket = $null -ne $env:AWS_S3_BUCKET -and $env:AWS_S3_BUCKET -ne ""
    $hasS3Key = $null -ne $env:AWS_S3_KEY -and $env:AWS_S3_KEY -ne ""
    $hasS3Secret = $null -ne $env:AWS_S3_SECRET -and $env:AWS_S3_SECRET -ne ""
    
    if ($hasDoKey) {
        $lastChars = $env:DIGITAL_OCEAN_API_KEY.Substring([Math]::Max(0, $env:DIGITAL_OCEAN_API_KEY.Length - 8))
        Write-Host "  ✅ DIGITAL_OCEAN_API_KEY: dop_***$lastChars" -ForegroundColor Gray
    } else {
        Write-Host "  ❌ DIGITAL_OCEAN_API_KEY: Missing" -ForegroundColor Red
        exit 1
    }
    
    if ($TestS3) {
        if ($hasS3Bucket) {
            Write-Host "  ✅ AWS_S3_BUCKET: $env:AWS_S3_BUCKET" -ForegroundColor Gray
        } else {
            Write-Host "  ❌ AWS_S3_BUCKET: Missing" -ForegroundColor Red
            exit 1
        }
        
        if ($hasS3Key) {
            $keyPrefix = $env:AWS_S3_KEY.Substring(0, [Math]::Min(8, $env:AWS_S3_KEY.Length))
            Write-Host "  ✅ AWS_S3_KEY: $keyPrefix***" -ForegroundColor Gray
        } else {
            Write-Host "  ❌ AWS_S3_KEY: Missing" -ForegroundColor Red
            exit 1
        }
        
        if ($hasS3Secret) {
            Write-Host "  ✅ AWS_S3_SECRET: ****************" -ForegroundColor Gray
        } else {
            Write-Host "  ❌ AWS_S3_SECRET: Missing" -ForegroundColor Red
            exit 1
        }
    }
    
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    
    # Test 1: List Resources
    Write-Host "TEST 1: List DigitalOcean Resources" -ForegroundColor Cyan
    Write-Host "────────────────────────────────────────────────────────────" -ForegroundColor Gray
    Write-Host ""
    
    npm run backup:list
    $listExitCode = $LASTEXITCODE
    
    Write-Host ""
    if ($listExitCode -eq 0) {
        Write-Host "✅ TEST 1 PASSED - Resource listing works" -ForegroundColor Green
    } else {
        Write-Host "❌ TEST 1 FAILED - Could not list resources" -ForegroundColor Red
        Write-Host "Exit code: $listExitCode" -ForegroundColor Red
        exit 1
    }
    
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    
    # Test 2: Dry Run Backup
    Write-Host "TEST 2: Dry Run Backup (No actual backup created)" -ForegroundColor Cyan
    Write-Host "────────────────────────────────────────────────────────────" -ForegroundColor Gray
    Write-Host ""
    
    npm run backup:all:dry-run
    $dryRunExitCode = $LASTEXITCODE
    
    Write-Host ""
    if ($dryRunExitCode -eq 0) {
        Write-Host "✅ TEST 2 PASSED - Dry run successful" -ForegroundColor Green
    } else {
        Write-Host "❌ TEST 2 FAILED - Dry run failed" -ForegroundColor Red
        Write-Host "Exit code: $dryRunExitCode" -ForegroundColor Red
        exit 1
    }
    
    if ($DryRunOnly) {
        Write-Host ""
        Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "🎉 All tests passed (dry-run mode)" -ForegroundColor Green
        Write-Host ""
        Write-Host "To test actual backup creation:" -ForegroundColor Yellow
        Write-Host "  .\scripts\utilities\test-backup-system.ps1 -EnvFile .env.production" -ForegroundColor Gray
        Write-Host ""
        Write-Host "To test with S3 upload:" -ForegroundColor Yellow
        Write-Host "  .\scripts\utilities\test-backup-system.ps1 -EnvFile .env.production -TestS3" -ForegroundColor Gray
        Write-Host ""
        exit 0
    }
    
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    
    # Test 3: Create Actual Backup (Local)
    Write-Host "TEST 3: Create Actual Backup (Local)" -ForegroundColor Cyan
    Write-Host "────────────────────────────────────────────────────────────" -ForegroundColor Gray
    Write-Host ""
    Write-Host "⚠️  This will create actual DigitalOcean snapshots" -ForegroundColor Yellow
    Write-Host ""
    
    $confirmation = Read-Host "Continue with actual backup? (y/N)"
    if ($confirmation -ne 'y' -and $confirmation -ne 'Y') {
        Write-Host "❌ Test cancelled by user" -ForegroundColor Yellow
        exit 0
    }
    
    Write-Host ""
    npm run backup:all
    $backupExitCode = $LASTEXITCODE
    
    Write-Host ""
    if ($backupExitCode -eq 0) {
        Write-Host "✅ TEST 3 PASSED - Backup created successfully" -ForegroundColor Green
        
        # Check for metadata file
        if (Test-Path "temp/backup-metadata.json") {
            Write-Host ""
            Write-Host "📄 Backup metadata:" -ForegroundColor Cyan
            $metadata = Get-Content "temp/backup-metadata.json" | ConvertFrom-Json
            Write-Host "   Timestamp: $($metadata.timestamp)" -ForegroundColor Gray
            Write-Host "   Apps backed up: $($metadata.apps.Count)" -ForegroundColor Gray
            Write-Host "   Databases backed up: $($metadata.databases.Count)" -ForegroundColor Gray
        }
    } else {
        Write-Host "❌ TEST 3 FAILED - Backup creation failed" -ForegroundColor Red
        Write-Host "Exit code: $backupExitCode" -ForegroundColor Red
        exit 1
    }
    
    # Test 4: S3 Upload
    if ($TestS3) {
        Write-Host ""
        Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
        Write-Host ""
        
        Write-Host "TEST 4: Upload Backup to S3" -ForegroundColor Cyan
        Write-Host "────────────────────────────────────────────────────────────" -ForegroundColor Gray
        Write-Host ""
        Write-Host "⚠️  This will upload to S3: s3://$env:AWS_S3_BUCKET/" -ForegroundColor Yellow
        Write-Host ""
        
        $s3Confirmation = Read-Host "Continue with S3 upload test? (y/N)"
        if ($s3Confirmation -ne 'y' -and $s3Confirmation -ne 'Y') {
            Write-Host "❌ S3 test skipped by user" -ForegroundColor Yellow
            exit 0
        }
        
        Write-Host ""
        npm run backup:all:s3
        $s3ExitCode = $LASTEXITCODE
        
        Write-Host ""
        if ($s3ExitCode -eq 0) {
            Write-Host "✅ TEST 4 PASSED - S3 upload successful" -ForegroundColor Green
            
            # Show S3 location
            $now = Get-Date
            $year = $now.Year
            $month = $now.ToString('MM')
            $day = $now.ToString('dd')
            
            Write-Host ""
            Write-Host "📍 Backup uploaded to:" -ForegroundColor Cyan
            Write-Host "   s3://$env:AWS_S3_BUCKET/backups/$year/$month/$day/" -ForegroundColor Gray
            Write-Host ""
            Write-Host "To verify, run:" -ForegroundColor Yellow
            Write-Host "   aws s3 ls s3://$env:AWS_S3_BUCKET/backups/$year/$month/$day/ --recursive" -ForegroundColor Gray
        } else {
            Write-Host "❌ TEST 4 FAILED - S3 upload failed" -ForegroundColor Red
            Write-Host "Exit code: $s3ExitCode" -ForegroundColor Red
            
            Write-Host ""
            Write-Host "Possible issues:" -ForegroundColor Yellow
            Write-Host "  1. Invalid AWS credentials" -ForegroundColor Gray
            Write-Host "  2. Bucket doesn't exist" -ForegroundColor Gray
            Write-Host "  3. Insufficient IAM permissions" -ForegroundColor Gray
            Write-Host "  4. Wrong region" -ForegroundColor Gray
            
            exit 1
        }
    }
    
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "🎉 All tests passed successfully!" -ForegroundColor Green
    Write-Host ""
    
    # Summary
    Write-Host "Test Summary:" -ForegroundColor Cyan
    Write-Host "  ✅ Resource listing works" -ForegroundColor Green
    Write-Host "  ✅ Dry-run validation works" -ForegroundColor Green
    if (-not $DryRunOnly) {
        Write-Host "  ✅ Backup creation works" -ForegroundColor Green
    }
    if ($TestS3) {
        Write-Host "  ✅ S3 upload works" -ForegroundColor Green
    }
    Write-Host ""
    
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Set up automated backups (GitHub Actions, cron, etc.)" -ForegroundColor Gray
    Write-Host "  2. Configure S3 lifecycle policies for retention" -ForegroundColor Gray
    Write-Host "  3. Set up monitoring/alerting for backup failures" -ForegroundColor Gray
    Write-Host "  4. Test restoration process monthly" -ForegroundColor Gray
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "❌ Test failed with error:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    exit 1
} finally {
    Pop-Location
}
