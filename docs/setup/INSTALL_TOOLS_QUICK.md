# Quick Installation Guide - CLI Tools

Since automated installation is having permission issues, here are direct download links:

## 1. Install doctl (DigitalOcean CLI)

**Download**: [doctl Latest Release](https://github.com/digitalocean/doctl/releases/latest)

### Steps:
1. Download: `doctl-1.109.0-windows-amd64.zip`
2. Extract to: `C:\Program Files\doctl\`
3. Add to PATH:
   ```powershell
   # Run this in PowerShell:
   [Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Program Files\doctl", "Machine")
   ```
4. Restart PowerShell
5. Verify: `doctl version`

**Quick Install (PowerShell)**:
```powershell
# Download and install
$url = "https://github.com/digitalocean/doctl/releases/download/v1.109.0/doctl-1.109.0-windows-amd64.zip"
$output = "$env:TEMP\doctl.zip"
Invoke-WebRequest -Uri $url -OutFile $output
Expand-Archive -Path $output -DestinationPath "C:\Program Files\doctl" -Force
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Program Files\doctl", "User")
$env:Path += ";C:\Program Files\doctl"
```

---

## 2. Install psql (PostgreSQL Client)

**Download**: [PostgreSQL 16](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads)

### Steps:
1. Download PostgreSQL 16 installer for Windows
2. Run installer
3. In "Select Components", choose only:
   - ✅ Command Line Tools
   - ❌ Uncheck everything else (unless you want the full server)
4. Complete installation
5. Default PATH should be added automatically: `C:\Program Files\PostgreSQL\16\bin\`
6. Verify: `psql --version`

**Alternative - Portable Version**:
```powershell
# Just download the binaries
$url = "https://get.enterprisedb.com/postgresql/postgresql-16.1-1-windows-x64-binaries.zip"
$output = "$env:TEMP\postgresql.zip"
Invoke-WebRequest -Uri $url -OutFile $output
Expand-Archive -Path $output -DestinationPath "C:\Program Files\PostgreSQL" -Force
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Program Files\PostgreSQL\pgsql\bin", "User")
$env:Path += ";C:\Program Files\PostgreSQL\pgsql\bin"
```

---

## 3. Install redis-cli

**Download**: [Redis for Windows](https://github.com/tporadowski/redis/releases/latest)

### Steps:
1. Download: `Redis-x64-5.0.14.1.zip`
2. Extract to: `C:\Program Files\Redis\`
3. Add to PATH:
   ```powershell
   [Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Program Files\Redis", "User")
   ```
4. Verify: `redis-cli --version`

**Quick Install (PowerShell)**:
```powershell
# Download and install
$url = "https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip"
$output = "$env:TEMP\redis.zip"
Invoke-WebRequest -Uri $url -OutFile $output
Expand-Archive -Path $output -DestinationPath "C:\Program Files\Redis" -Force
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Program Files\Redis", "User")
$env:Path += ";C:\Program Files\Redis"
```

---

## All-in-One Install Script

Run this in PowerShell (doesn't require Admin):

```powershell
# Install all three tools to user directory
$installDir = "$env:USERPROFILE\DevTools"
New-Item -ItemType Directory -Path $installDir -Force

Write-Host "Installing to: $installDir" -ForegroundColor Cyan

# Install doctl
Write-Host "1. Installing doctl..." -ForegroundColor Green
$url = "https://github.com/digitalocean/doctl/releases/download/v1.109.0/doctl-1.109.0-windows-amd64.zip"
Invoke-WebRequest -Uri $url -OutFile "$env:TEMP\doctl.zip"
Expand-Archive -Path "$env:TEMP\doctl.zip" -DestinationPath "$installDir\doctl" -Force

# Install Redis
Write-Host "2. Installing redis-cli..." -ForegroundColor Green
$url = "https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip"
Invoke-WebRequest -Uri $url -OutFile "$env:TEMP\redis.zip"
Expand-Archive -Path "$env:TEMP\redis.zip" -DestinationPath "$installDir\redis" -Force

# Add to PATH (User level - no admin needed)
Write-Host "3. Adding to PATH..." -ForegroundColor Green
$newPath = "$installDir\doctl;$installDir\redis"
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentPath -notlike "*$newPath*") {
    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$newPath", "User")
}
$env:Path += ";$newPath"

Write-Host ""
Write-Host "Installation Complete!" -ForegroundColor Green
Write-Host "Tools installed to: $installDir" -ForegroundColor Cyan
Write-Host ""
Write-Host "Verifying installations..." -ForegroundColor Yellow
& "$installDir\doctl\doctl.exe" version
& "$installDir\redis\redis-cli.exe" --version
Write-Host ""
Write-Host "Note: Close and reopen PowerShell to use these tools globally" -ForegroundColor Yellow
Write-Host ""
Write-Host "For psql, download from: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads" -ForegroundColor Cyan
```

---

## Verification

After installation, open a **new** PowerShell window and run:

```powershell
doctl version
psql --version
redis-cli --version
```

All three should show version information.

---

## Next: Authenticate doctl

Once doctl is installed:

```powershell
# 1. Get API token from: https://cloud.digitalocean.com/account/api/tokens
# 2. Authenticate
doctl auth init
# Paste your token when prompted

# 3. Verify
doctl account get
```

---

**Quick Start**: Just copy and run the "All-in-One Install Script" above!

