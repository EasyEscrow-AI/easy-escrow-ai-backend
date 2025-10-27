# Run All Unit Tests Script
# Description: Runs all unit tests with staging environment configuration

param(
    [switch]$Verbose,
    [switch]$Watch
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Running All Unit Tests" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Set environment to staging
$env:NODE_ENV = "staging"
$env:SOLANA_NETWORK = "devnet"

Write-Host "Environment: $env:NODE_ENV" -ForegroundColor Green
Write-Host "Network: $env:SOLANA_NETWORK" -ForegroundColor Green
Write-Host ""

# Build the npm command
$command = "npm run test:unit"

if ($Watch) {
    Write-Host "Running in watch mode..." -ForegroundColor Yellow
    $command += " -- --watch"
}

if ($Verbose) {
    Write-Host "Running in verbose mode..." -ForegroundColor Yellow
    $command += " -- --reporter spec"
}

Write-Host "Executing: $command" -ForegroundColor Cyan
Write-Host ""

# Execute the command
Invoke-Expression $command

# Capture exit code
$exitCode = $LASTEXITCODE

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if ($exitCode -eq 0) {
    Write-Host "All unit tests passed!" -ForegroundColor Green
} else {
    Write-Host "Some unit tests failed (Exit code: $exitCode)" -ForegroundColor Red
}
Write-Host "========================================" -ForegroundColor Cyan

exit $exitCode

