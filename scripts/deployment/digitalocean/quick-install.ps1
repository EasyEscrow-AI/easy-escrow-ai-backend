# Quick CLI Tools Installation (No Admin Required)
$ErrorActionPreference = "Continue"

$installDir = "$env:USERPROFILE\DevTools"
New-Item -ItemType Directory -Path $installDir -Force | Out-Null

Write-Host "Installing CLI Tools to: $installDir" -ForegroundColor Cyan
Write-Host ""

# Install doctl
Write-Host "1. Installing doctl..." -ForegroundColor Green
try {
    $url = "https://github.com/digitalocean/doctl/releases/download/v1.109.0/doctl-1.109.0-windows-amd64.zip"
    Invoke-WebRequest -Uri $url -OutFile "$env:TEMP\doctl.zip"
    Expand-Archive -Path "$env:TEMP\doctl.zip" -DestinationPath "$installDir\doctl" -Force
    Write-Host "   doctl installed!" -ForegroundColor Green
} catch {
    Write-Host "   doctl install failed: $_" -ForegroundColor Red
}

# Install Redis
Write-Host "2. Installing redis-cli..." -ForegroundColor Green
try {
    $url = "https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip"
    Invoke-WebRequest -Uri $url -OutFile "$env:TEMP\redis.zip"
    Expand-Archive -Path "$env:TEMP\redis.zip" -DestinationPath "$installDir\redis" -Force
    Write-Host "   redis-cli installed!" -ForegroundColor Green
} catch {
    Write-Host "   redis-cli install failed: $_" -ForegroundColor Red
}

# Add to PATH
Write-Host "3. Adding to PATH..." -ForegroundColor Green
$newPath = "$installDir\doctl;$installDir\redis"
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentPath -notlike "*$installDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$newPath", "User")
    Write-Host "   PATH updated!" -ForegroundColor Green
} else {
    Write-Host "   Already in PATH" -ForegroundColor Yellow
}

# Update current session PATH
$env:Path += ";$newPath"

Write-Host ""
Write-Host "Installation Complete!" -ForegroundColor Green
Write-Host ""

# Verify
Write-Host "Verifying installations..." -ForegroundColor Yellow
Write-Host ""

try {
    $doctlVersion = & "$installDir\doctl\doctl.exe" version 2>&1
    Write-Host "doctl: $doctlVersion" -ForegroundColor Green
} catch {
    Write-Host "doctl: NOT FOUND" -ForegroundColor Red
}

try {
    $redisVersion = & "$installDir\redis\redis-cli.exe" --version 2>&1
    Write-Host "redis-cli: $redisVersion" -ForegroundColor Green
} catch {
    Write-Host "redis-cli: NOT FOUND" -ForegroundColor Red
}

Write-Host ""
Write-Host "Note for psql:" -ForegroundColor Cyan
Write-Host "Download PostgreSQL from: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads" -ForegroundColor Yellow
Write-Host ""
Write-Host "Tools are ready to use in this session!" -ForegroundColor Green
Write-Host "Close and reopen PowerShell for global access" -ForegroundColor Yellow

