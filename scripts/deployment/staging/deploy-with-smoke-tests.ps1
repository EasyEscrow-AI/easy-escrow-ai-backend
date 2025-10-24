# Deploy to STAGING with Automated Smoke Tests
# This script deploys to STAGING and automatically runs smoke tests to verify the deployment

param(
    [switch]$SkipChecksumVerification = $false,
    [switch]$SkipIDLUpload = $false,
    [switch]$DryRun = $false,
    [switch]$NotifyOnFailure = $false,
    [string]$WebhookUrl = $env:SLACK_WEBHOOK_URL
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "STAGING Deployment with Smoke Tests" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$scriptStart = Get-Date

# Step 1: Run deployment
Write-Host "📦 Step 1: Deploying to STAGING..." -ForegroundColor Yellow
Write-Host ""

$deployArgs = @()
if ($SkipChecksumVerification) { $deployArgs += "-SkipChecksumVerification" }
if ($SkipIDLUpload) { $deployArgs += "-SkipIDLUpload" }
if ($DryRun) { $deployArgs += "-DryRun" }

try {
    & "$PSScriptRoot\deploy-to-staging.ps1" @deployArgs
    
    if ($LASTEXITCODE -ne 0) {
        throw "Deployment failed with exit code $LASTEXITCODE"
    }
    
    Write-Host ""
    Write-Host "✅ Deployment completed successfully" -ForegroundColor Green
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "❌ Deployment failed: $_" -ForegroundColor Red
    Write-Host ""
    
    if ($NotifyOnFailure -and $WebhookUrl) {
        Send-FailureNotification -WebhookUrl $WebhookUrl -Stage "Deployment" -Error $_
    }
    
    exit 1
}

if ($DryRun) {
    Write-Host "🔍 DRY RUN MODE - Skipping smoke tests" -ForegroundColor Yellow
    Write-Host ""
    exit 0
}

# Wait a moment for deployment to fully propagate
Write-Host "⏳ Waiting for deployment to propagate..." -ForegroundColor Gray
Start-Sleep -Seconds 5

# Step 2: Run smoke tests
Write-Host ""
Write-Host "🚬 Step 2: Running Smoke Tests..." -ForegroundColor Yellow
Write-Host ""

$smokeTestStart = Get-Date

try {
    # Run smoke tests with CI reporter
    npm run test:staging:smoke
    
    if ($LASTEXITCODE -ne 0) {
        throw "Smoke tests failed with exit code $LASTEXITCODE"
    }
    
    $smokeTestEnd = Get-Date
    $smokeTestDuration = ($smokeTestEnd - $smokeTestStart).TotalSeconds
    
    Write-Host ""
    Write-Host "✅ Smoke tests passed in $([math]::Round($smokeTestDuration, 2)) seconds!" -ForegroundColor Green
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "❌ Smoke tests failed: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Deployment completed but smoke tests failed." -ForegroundColor Yellow
    Write-Host "This may indicate an issue with the deployment or environment." -ForegroundColor Yellow
    Write-Host ""
    
    if ($NotifyOnFailure -and $WebhookUrl) {
        Send-FailureNotification -WebhookUrl $WebhookUrl -Stage "Smoke Tests" -Error $_
    }
    
    Write-Host "Troubleshooting:" -ForegroundColor Cyan
    Write-Host "  1. Check Solana Explorer:" -ForegroundColor White
    Write-Host "     https://explorer.solana.com/address/AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei?cluster=devnet" -ForegroundColor Gray
    Write-Host "  2. Verify admin wallet has SOL:" -ForegroundColor White
    Write-Host "     solana balance `$(solana-keygen pubkey wallets/staging/staging-admin.json) --url devnet" -ForegroundColor Gray
    Write-Host "  3. Check deployment logs above for errors" -ForegroundColor White
    Write-Host "  4. Review smoke test output for specific failures" -ForegroundColor White
    Write-Host ""
    
    exit 1
}

# Step 3: Summary
$scriptEnd = Get-Date
$totalDuration = ($scriptEnd - $scriptStart).TotalSeconds

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "✅ Deployment & Validation Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "  Total Duration:     $([math]::Round($totalDuration, 2))s" -ForegroundColor White
Write-Host "  Smoke Test Time:    $([math]::Round($smokeTestDuration, 2))s" -ForegroundColor White
Write-Host "  Status:             Ready for Testing ✅" -ForegroundColor White
Write-Host ""

Write-Host "STAGING Environment:" -ForegroundColor Yellow
Write-Host "  Program ID:    AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei" -ForegroundColor White
Write-Host "  Network:       Devnet" -ForegroundColor White
Write-Host "  Explorer:      https://explorer.solana.com/address/AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei?cluster=devnet" -ForegroundColor Cyan
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Run E2E tests: npm run test:staging:e2e" -ForegroundColor White
Write-Host "  2. Verify API endpoints are accessible" -ForegroundColor White
Write-Host "  3. Check monitoring dashboards" -ForegroundColor White
Write-Host ""

# Optional: Send success notification
if ($NotifyOnFailure -and $WebhookUrl) {
    Send-SuccessNotification -WebhookUrl $WebhookUrl -Duration $totalDuration
}

# Function to send failure notification
function Send-FailureNotification {
    param(
        [string]$WebhookUrl,
        [string]$Stage,
        [string]$Error
    )
    
    Write-Host "📢 Sending failure notification..." -ForegroundColor Gray
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss UTC"
    $gitCommit = git rev-parse --short HEAD 2>&1
    $gitBranch = git branch --show-current 2>&1
    
    $payload = @{
        text = "❌ STAGING $Stage Failed"
        blocks = @(
            @{
                type = "header"
                text = @{
                    type = "plain_text"
                    text = "❌ STAGING $Stage Failed"
                }
            },
            @{
                type = "section"
                fields = @(
                    @{
                        type = "mrkdwn"
                        text = "*Environment:*`nSTAGING (Devnet)"
                    },
                    @{
                        type = "mrkdwn"
                        text = "*Stage:*`n$Stage"
                    },
                    @{
                        type = "mrkdwn"
                        text = "*Branch:*`n$gitBranch"
                    },
                    @{
                        type = "mrkdwn"
                        text = "*Commit:*`n$gitCommit"
                    }
                )
            },
            @{
                type = "section"
                text = @{
                    type = "mrkdwn"
                    text = "*Error:*`n``````$Error``````"
                }
            },
            @{
                type = "section"
                text = @{
                    type = "mrkdwn"
                    text = "*Timestamp:*`n$timestamp"
                }
            }
        )
    } | ConvertTo-Json -Depth 10
    
    try {
        Invoke-RestMethod -Uri $WebhookUrl -Method Post -Body $payload -ContentType 'application/json' | Out-Null
        Write-Host "✅ Notification sent" -ForegroundColor Gray
    } catch {
        Write-Host "⚠️  Failed to send notification: $_" -ForegroundColor Yellow
    }
}

# Function to send success notification
function Send-SuccessNotification {
    param(
        [string]$WebhookUrl,
        [double]$Duration
    )
    
    Write-Host "📢 Sending success notification..." -ForegroundColor Gray
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss UTC"
    $gitCommit = git rev-parse --short HEAD 2>&1
    $gitBranch = git branch --show-current 2>&1
    
    $payload = @{
        text = "✅ STAGING Deployment Successful"
        blocks = @(
            @{
                type = "header"
                text = @{
                    type = "plain_text"
                    text = "✅ STAGING Deployment Successful"
                }
            },
            @{
                type = "section"
                fields = @(
                    @{
                        type = "mrkdwn"
                        text = "*Environment:*`nSTAGING (Devnet)"
                    },
                    @{
                        type = "mrkdwn"
                        text = "*Duration:*`n$([math]::Round($Duration, 2))s"
                    },
                    @{
                        type = "mrkdwn"
                        text = "*Branch:*`n$gitBranch"
                    },
                    @{
                        type = "mrkdwn"
                        text = "*Commit:*`n$gitCommit"
                    }
                )
            },
            @{
                type = "section"
                text = @{
                    type = "mrkdwn"
                    text = "*Status:*`nAll smoke tests passed ✅`nEnvironment ready for testing"
                }
            },
            @{
                type = "section"
                text = @{
                    type = "mrkdwn"
                    text = "<https://explorer.solana.com/address/AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei?cluster=devnet|View on Solana Explorer>"
                }
            },
            @{
                type = "section"
                text = @{
                    type = "mrkdwn"
                    text = "*Timestamp:*`n$timestamp"
                }
            }
        )
    } | ConvertTo-Json -Depth 10
    
    try {
        Invoke-RestMethod -Uri $WebhookUrl -Method Post -Body $payload -ContentType 'application/json' | Out-Null
        Write-Host "✅ Notification sent" -ForegroundColor Gray
    } catch {
        Write-Host "⚠️  Failed to send notification: $_" -ForegroundColor Yellow
    }
}

