# Pre-commit hook to scan for secrets in commits (PowerShell version)
# This script prevents accidental commits of private keys, passwords, and other sensitive data

$ErrorActionPreference = "Stop"

$PATTERNS_FILE = ".git-secrets-patterns"

Write-Host "🔍 Scanning commit for potential secrets..." -ForegroundColor Cyan

# Check if patterns file exists
if (-not (Test-Path $PATTERNS_FILE)) {
    Write-Host "❌ Error: Secrets patterns file not found: $PATTERNS_FILE" -ForegroundColor Red
    Write-Host "Please ensure .git-secrets-patterns exists in the repository root" -ForegroundColor Yellow
    exit 1
}

# Get list of staged files
$stagedFiles = git diff --cached --name-only --diff-filter=ACM

if (-not $stagedFiles) {
    Write-Host "✓ No files to check" -ForegroundColor Green
    exit 0
}

# Flag to track if secrets were found
$secretsFound = $false

# Read patterns from file
$patterns = Get-Content $PATTERNS_FILE | Where-Object { 
    $_ -and (-not $_.StartsWith("#")) 
}

# Check each staged file
foreach ($file in $stagedFiles) {
    # Skip binary files and specific directories
    if ($file -match "node_modules/|dist/|build/|\.git/|target/") {
        continue
    }

    # Skip if file doesn't exist (deleted files)
    if (-not (Test-Path $file)) {
        continue
    }

    # Skip binary files
    try {
        $content = Get-Content $file -Raw -ErrorAction Stop
    } catch {
        continue
    }

    # Check each pattern
    foreach ($pattern in $patterns) {
        if ($content -match $pattern) {
            Write-Host "❌ Potential secret found in: $file" -ForegroundColor Red
            Write-Host "   Pattern matched: $pattern" -ForegroundColor Yellow
            $secretsFound = $true
        }
    }
}

# Check for common secret file names in commit
$dangerousFiles = $stagedFiles | Where-Object {
    $_ -match "\.(key|pem|p12|pfx)$|id_rsa|\.env|keypair.*\.json|.*-keypair\.json|devnet-config\.json"
}

if ($dangerousFiles) {
    Write-Host "❌ Dangerous file types detected:" -ForegroundColor Red
    foreach ($file in $dangerousFiles) {
        Write-Host "   - $file" -ForegroundColor Yellow
    }
    $secretsFound = $true
}

# Exit based on findings
if ($secretsFound) {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Red
    Write-Host "║  ❌ COMMIT BLOCKED: Potential secrets detected                ║" -ForegroundColor Red
    Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Red
    Write-Host ""
    Write-Host "Security guidelines:" -ForegroundColor Yellow
    Write-Host "  1. Remove all secrets from the files"
    Write-Host "  2. Store secrets in environment variables or secret management systems"
    Write-Host "  3. Update .gitignore to prevent future commits"
    Write-Host "  4. If this is a false positive, you can bypass with: git commit --no-verify"
    Write-Host ""
    Write-Host "⚠️  WARNING: Only bypass if you are ABSOLUTELY CERTAIN no secrets are present" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "✓ No secrets detected - commit allowed" -ForegroundColor Green
exit 0

