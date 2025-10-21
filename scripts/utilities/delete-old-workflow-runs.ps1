#!/usr/bin/env pwsh
#
# Delete old GitHub Actions workflow runs
#
# This script deletes all runs for workflows that have been removed:
# - Build for STAGING
# - Deploy for STAGING
# - Rollback for STAGING
#
# Prerequisites:
# - GitHub CLI (gh) installed: https://cli.github.com/
# - Authenticated with: gh auth login
#

param(
    [switch]$DryRun = $false
)

$ErrorActionPreference = "Stop"

# Configuration
$repo = "VENTURE-AI-LABS/easy-escrow-ai-backend"
$workflowsToDelete = @(
    "Build for STAGING",
    "Deploy for STAGING",
    "Rollback for STAGING"
)

# Check if gh CLI is installed
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Error: GitHub CLI (gh) is not installed" -ForegroundColor Red
    Write-Host "Install from: https://cli.github.com/" -ForegroundColor Yellow
    exit 1
}

# Check if authenticated
$authStatus = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error: Not authenticated with GitHub" -ForegroundColor Red
    Write-Host "Run: gh auth login" -ForegroundColor Yellow
    exit 1
}

Write-Host "🧹 Cleaning up old workflow runs..." -ForegroundColor Cyan
Write-Host "Repository: $repo" -ForegroundColor Gray
if ($DryRun) {
    Write-Host "Mode: DRY RUN (no deletions will be performed)" -ForegroundColor Yellow
}
Write-Host ""

$totalDeleted = 0

foreach ($workflow in $workflowsToDelete) {
    Write-Host "📋 Processing: $workflow" -ForegroundColor Yellow
    
    # Get all run IDs for this workflow
    $runIdsJson = gh run list `
        --repo $repo `
        --workflow "$workflow" `
        --limit 100 `
        --json databaseId,conclusion,status `
        2>$null
    
    if (-not $runIdsJson) {
        Write-Host "   No runs found" -ForegroundColor Gray
        continue
    }
    
    $runs = $runIdsJson | ConvertFrom-Json
    
    if ($runs.Count -eq 0) {
        Write-Host "   No runs found" -ForegroundColor Gray
        continue
    }
    
    Write-Host "   Found $($runs.Count) run(s)" -ForegroundColor Cyan
    
    foreach ($run in $runs) {
        $runId = $run.databaseId
        $status = $run.status
        $conclusion = $run.conclusion
        
        if ($DryRun) {
            Write-Host "   [DRY RUN] Would delete run ID: $runId (Status: $status, Conclusion: $conclusion)" -ForegroundColor Gray
        } else {
            Write-Host "   Deleting run ID: $runId..." -NoNewline
            gh run delete $runId --repo $repo 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Host " ✅" -ForegroundColor Green
                $totalDeleted++
            } else {
                Write-Host " ❌ (may already be deleted)" -ForegroundColor Red
            }
        }
    }
    
    if (-not $DryRun) {
        Write-Host "   ✅ Processed all runs for: $workflow" -ForegroundColor Green
    }
    Write-Host ""
}

if ($DryRun) {
    Write-Host "✅ Dry run complete! Run without -DryRun to actually delete." -ForegroundColor Green
} else {
    Write-Host "✅ Cleanup complete! Deleted $totalDeleted workflow run(s)." -ForegroundColor Green
}
Write-Host ""
Write-Host "💡 Tip: View remaining runs at:" -ForegroundColor Cyan
Write-Host "   https://github.com/$repo/actions" -ForegroundColor Gray

