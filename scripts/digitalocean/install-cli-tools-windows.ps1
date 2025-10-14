# ============================================
# Install DigitalOcean CLI Tools on Windows
# ============================================

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DigitalOcean CLI Tools Installation" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "⚠️  This script should be run as Administrator" -ForegroundColor Yellow
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to continue anyway (some installations may fail)"
}

# ============================================
# Install Chocolatey (if not installed)
# ============================================

Write-Host "Checking for Chocolatey..." -ForegroundColor Green

try {
    $chocoVersion = choco --version
    Write-Host "✓ Chocolatey is already installed (version $chocoVersion)" -ForegroundColor Green
} catch {
    Write-Host "Chocolatey not found. Installing..." -ForegroundColor Yellow
    
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    
    try {
        Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
        Write-Host "✓ Chocolatey installed successfully" -ForegroundColor Green
        
        # Refresh environment variables
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    } catch {
        Write-Host "✗ Failed to install Chocolatey" -ForegroundColor Red
        Write-Host "Please install manually from: https://chocolatey.org/install" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host ""

# ============================================
# Install doctl (DigitalOcean CLI)
# ============================================

Write-Host "Installing doctl (DigitalOcean CLI)..." -ForegroundColor Green

try {
    $doctlVersion = doctl version 2>$null
    Write-Host "✓ doctl is already installed" -ForegroundColor Green
} catch {
    Write-Host "Installing doctl via Chocolatey..." -ForegroundColor Yellow
    
    try {
        choco install doctl -y
        
        # Refresh environment
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        
        Write-Host "✓ doctl installed successfully" -ForegroundColor Green
    } catch {
        Write-Host "✗ Failed to install doctl via Chocolatey" -ForegroundColor Red
        Write-Host "Try manual installation from: https://github.com/digitalocean/doctl/releases" -ForegroundColor Yellow
    }
}

Write-Host ""

# ============================================
# Install PostgreSQL Client (psql)
# ============================================

Write-Host "Installing psql (PostgreSQL Client)..." -ForegroundColor Green

try {
    $psqlVersion = psql --version 2>$null
    Write-Host "✓ psql is already installed" -ForegroundColor Green
} catch {
    Write-Host "Installing PostgreSQL client via Chocolatey..." -ForegroundColor Yellow
    
    try {
        # Install just the PostgreSQL client tools, not the full server
        choco install postgresql --version=16.0 --params '/Password:notused /Port:5433' -y
        
        # Refresh environment
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        
        Write-Host "✓ PostgreSQL client installed successfully" -ForegroundColor Green
    } catch {
        Write-Host "✗ Failed to install psql via Chocolatey" -ForegroundColor Red
        Write-Host "Try manual installation from: https://www.postgresql.org/download/windows/" -ForegroundColor Yellow
    }
}

Write-Host ""

# ============================================
# Install Redis CLI
# ============================================

Write-Host "Installing redis-cli..." -ForegroundColor Green

try {
    $redisVersion = redis-cli --version 2>$null
    Write-Host "✓ redis-cli is already installed" -ForegroundColor Green
} catch {
    Write-Host "Installing Redis via Chocolatey..." -ForegroundColor Yellow
    
    try {
        choco install redis-64 -y
        
        # Refresh environment
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        
        Write-Host "✓ Redis installed successfully" -ForegroundColor Green
    } catch {
        Write-Host "✗ Failed to install redis-cli via Chocolatey" -ForegroundColor Red
        Write-Host "Try manual installation from: https://github.com/tporadowski/redis/releases" -ForegroundColor Yellow
    }
}

Write-Host ""

# ============================================
# Verification
# ============================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Verifying Installations" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Refresh environment one more time
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

$allInstalled = $true

# Check doctl
Write-Host "Checking doctl..." -ForegroundColor Yellow
try {
    $doctlVersion = doctl version 2>$null
    Write-Host "  ✓ doctl: $doctlVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ doctl: NOT FOUND" -ForegroundColor Red
    $allInstalled = $false
}

# Check psql
Write-Host "Checking psql..." -ForegroundColor Yellow
try {
    $psqlVersion = & psql --version 2>$null
    Write-Host "  ✓ psql: $psqlVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ psql: NOT FOUND" -ForegroundColor Red
    $allInstalled = $false
}

# Check redis-cli
Write-Host "Checking redis-cli..." -ForegroundColor Yellow
try {
    $redisVersion = & redis-cli --version 2>$null
    Write-Host "  ✓ redis-cli: $redisVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ redis-cli: NOT FOUND" -ForegroundColor Red
    $allInstalled = $false
}

Write-Host ""

# ============================================
# Summary
# ============================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Installation Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if ($allInstalled) {
    Write-Host "✓ All tools installed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Close and reopen PowerShell to refresh environment variables"
    Write-Host "2. Authenticate doctl: doctl auth init"
    Write-Host "3. Continue with DigitalOcean setup"
} else {
    Write-Host "⚠️  Some tools failed to install" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Manual Installation Links:" -ForegroundColor Cyan
    Write-Host "- doctl: https://github.com/digitalocean/doctl/releases"
    Write-Host "- psql: https://www.postgresql.org/download/windows/"
    Write-Host "- redis-cli: https://github.com/tporadowski/redis/releases"
    Write-Host ""
    Write-Host "After manual installation, close and reopen PowerShell"
}

Write-Host ""
Write-Host "Press Enter to exit..."
Read-Host

