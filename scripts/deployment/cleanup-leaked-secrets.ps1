# Cleanup Leaked Secrets from Documentation
# This script removes actual secrets from committed files and replaces them with placeholders

Write-Host "🔐 Leaked Secrets Cleanup Script" -ForegroundColor Cyan
Write-Host "===============================" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  WARNING: This script will modify multiple files" -ForegroundColor Yellow
Write-Host "   Make sure you have committed any pending changes first" -ForegroundColor Yellow
Write-Host ""

$confirm = Read-Host "Continue with cleanup? (y/N)"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "❌ Operation cancelled" -ForegroundColor Red
    exit 0
}

# Define secrets to redact
$secrets = @{
    # Private keys
    "21YtDf3GptHmEL414KRMjJs9yV6R7A61tjvWc6ZXi8yodGekfQA56sfqgxBKWVGfJRfMBomaxqpDH2sp7HYiqiGp" = "<REDACTED_PRIVATE_KEY>"
    "4JMoiWVkrnUxXqdhqCEoPcYu5RjmFSGBPX9Wb2ngRHnoQjCE75SjfuwRoNe87GUK2gYkiWk15xGYH9uXqDRf6Cw8" = "<REDACTED_PRIVATE_KEY>"
    "57CjnFUDN2rJwYfSTunKb22raU4ffzPTi5jU1FXY9mVSyf1LrJp8hLvDUFx4fbTVGoTeyk3LypFCn48MrwRWkWQo" = "<REDACTED_PRIVATE_KEY>"
    
    # API keys
    "5a8c5d8d-15c2-4dc3-8ceb-109cd9baa8b8" = "<your-helius-api-key>"
    "5a8c5d8d-15c2-4dc3-8ceb-109cd9baa8b9" = "<your-helius-api-key>"
    
    # Database passwords
    "AVNS_Eat2QwFGOloJzUY0WrF" = "<database-password>"
    "AVNS_DG9maU3rRLpkAsMIZBw" = "<database-password>"
    
    # Redis passwords
    "C2FFCNjuy43x5U0GwWCdMIFjNoLpbEQJ" = "<redis-password>"
    "AWCnAAIncDIzN2Q1ZWRkNzI0M2Q0ZmZhYmIwNGVlY2ViM2Y2MTYzZXAyMjQ3NDM" = "<redis-password>"
}

# Files to clean
$filesToClean = @(
    "docs\DO_STAGING_RECREATION_SUMMARY.md",
    "docs\setup\STAGING_KEY_FORMAT_DECISION.md",
    "docs\setup\BASE58_VS_BYTE_ARRAY.md",
    "docs\SECRETS_REMOVED_FROM_DOCS.md",
    "docs\tasks\TASK_77_TEST_RESULTS.md",
    ".do\upstash.yaml",
    ".do\redis-cloud.yaml",
    "docs\SECURITY_INCIDENT_CREDENTIAL_EXPOSURE.md"
)

$filesModified = 0
$secretsRedacted = 0

foreach ($file in $filesToClean) {
    if (-not (Test-Path $file)) {
        Write-Host "⏭️  Skipping $file (not found)" -ForegroundColor Yellow
        continue
    }
    
    Write-Host "🔍 Processing: $file" -ForegroundColor Cyan
    
    $content = Get-Content $file -Raw
    $originalContent = $content
    $fileSecrets = 0
    
    foreach ($secret in $secrets.Keys) {
        $replacement = $secrets[$secret]
        if ($content -match [regex]::Escape($secret)) {
            $content = $content -replace [regex]::Escape($secret), $replacement
            $fileSecrets++
            $secretsRedacted++
        }
    }
    
    if ($content -ne $originalContent) {
        Set-Content -Path $file -Value $content -NoNewline
        Write-Host "   ✅ Redacted $fileSecrets secret(s)" -ForegroundColor Green
        $filesModified++
    } else {
        Write-Host "   ℹ️  No secrets found" -ForegroundColor Blue
    }
}

Write-Host ""
Write-Host "📊 Cleanup Summary:" -ForegroundColor Cyan
Write-Host "   Files processed: $($filesToClean.Count)" -ForegroundColor White
Write-Host "   Files modified: $filesModified" -ForegroundColor Green
Write-Host "   Secrets redacted: $secretsRedacted" -ForegroundColor Green

if ($filesModified -gt 0) {
    Write-Host ""
    Write-Host "✅ Cleanup completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Review the changes: git diff" -ForegroundColor White
    Write-Host "2. Commit the changes: git add . && git commit -m 'security: redact leaked secrets from documentation'" -ForegroundColor White
    Write-Host "3. ROTATE ALL EXPOSED SECRETS (see docs/LEAKED_SECRETS_AUDIT.md)" -ForegroundColor Red
    Write-Host "4. Remove from Git history (use git-filter-repo or BFG)" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "ℹ️  No secrets found to redact" -ForegroundColor Blue
}

