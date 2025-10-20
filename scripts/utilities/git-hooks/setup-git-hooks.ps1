# Setup Git Hooks for Secret Scanning (PowerShell)
# This script installs the pre-commit hook for automatic secret scanning

$ErrorActionPreference = "Stop"

$HOOK_DIR = ".git\hooks"
$HOOK_FILE = "$HOOK_DIR\pre-commit"
$SCRIPT_PATH = "scripts\utilities\git-hooks\pre-commit-secrets-check.ps1"

Write-Host "🔧 Setting up Git hooks for secret scanning..." -ForegroundColor Cyan

# Check if .git directory exists
if (-not (Test-Path ".git")) {
    Write-Host "❌ Error: .git directory not found" -ForegroundColor Red
    Write-Host "Please run this script from the repository root" -ForegroundColor Yellow
    exit 1
}

# Create hooks directory if it doesn't exist
if (-not (Test-Path $HOOK_DIR)) {
    New-Item -ItemType Directory -Path $HOOK_DIR -Force | Out-Null
}

# Check if pre-commit hook already exists
if (Test-Path $HOOK_FILE) {
    Write-Host "⚠️  Pre-commit hook already exists" -ForegroundColor Yellow
    Write-Host "Backing up existing hook to pre-commit.backup" -ForegroundColor Yellow
    Move-Item -Path $HOOK_FILE -Destination "$HOOK_FILE.backup" -Force
}

# Create the pre-commit hook
$hookContent = @'
#!/bin/sh
# Git pre-commit hook - automatically installed
# Scans for secrets before allowing commits

# Detect OS and run appropriate script
if command -v pwsh &> /dev/null; then
    # PowerShell available
    pwsh -File scripts/utilities/git-hooks/pre-commit-secrets-check.ps1
    exit $?
elif command -v powershell &> /dev/null; then
    # Windows PowerShell available
    powershell -ExecutionPolicy Bypass -File scripts/utilities/git-hooks/pre-commit-secrets-check.ps1
    exit $?
else
    # Use bash script
    bash scripts/utilities/git-hooks/pre-commit-secrets-check.sh
    exit $?
fi
'@

Set-Content -Path $HOOK_FILE -Value $hookContent -NoNewline

Write-Host "✅ Git hooks installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 What happens now:" -ForegroundColor Cyan
Write-Host "  • Every commit will be scanned for potential secrets"
Write-Host "  • Commits with secrets will be blocked automatically"
Write-Host "  • You can bypass with --no-verify (not recommended)"
Write-Host ""
Write-Host "🔒 Your commits are now protected from accidental secret exposure!" -ForegroundColor Green

