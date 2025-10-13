# Install Solana Development Tools
# Run this script to install Solana CLI and Anchor Framework

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Solana Development Tools Installation" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if command exists
function Test-CommandExists {
    param($Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
}

# Check Rust
Write-Host "Checking Rust installation..." -ForegroundColor Yellow
if (Test-CommandExists "rustc") {
    $rustVersion = rustc --version
    Write-Host "✓ Rust is installed: $rustVersion" -ForegroundColor Green
} else {
    Write-Host "✗ Rust is not installed" -ForegroundColor Red
    Write-Host "Installing Rust..." -ForegroundColor Yellow
    
    # Download and install Rust
    Invoke-WebRequest -Uri https://win.rustup.rs/x86_64 -OutFile rustup-init.exe
    .\rustup-init.exe -y
    
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    
    Write-Host "✓ Rust installed successfully" -ForegroundColor Green
    Write-Host "Please restart PowerShell for PATH changes to take effect" -ForegroundColor Yellow
}

Write-Host ""

# Install Solana CLI
Write-Host "Installing Solana CLI..." -ForegroundColor Yellow
Write-Host "Note: This may take several minutes" -ForegroundColor Gray
Write-Host ""

if (Test-CommandExists "solana") {
    $solanaVersion = solana --version
    Write-Host "✓ Solana CLI is already installed: $solanaVersion" -ForegroundColor Green
    
    $response = Read-Host "Do you want to update it? (y/n)"
    if ($response -ne "y") {
        Write-Host "Skipping Solana CLI installation" -ForegroundColor Gray
        $skipSolana = $true
    }
}

if (-not $skipSolana) {
    Write-Host ""
    Write-Host "Choose installation method:" -ForegroundColor Cyan
    Write-Host "1. Download from GitHub (Recommended - Fastest)" -ForegroundColor White
    Write-Host "2. Install via Cargo (Slow - builds from source)" -ForegroundColor White
    Write-Host "3. Manual installation (I'll do it myself)" -ForegroundColor White
    Write-Host ""
    
    $choice = Read-Host "Enter choice (1-3)"
    
    switch ($choice) {
        "1" {
            Write-Host "Downloading Agave (Solana 2.x) installer..." -ForegroundColor Yellow
            
            # Try with TLS 1.2
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            
            try {
                $version = "2.1.13"
                $url = "https://release.anza.xyz/v$version/agave-install-init-x86_64-pc-windows-msvc.exe"
                
                Write-Host "Downloading from: $url" -ForegroundColor Gray
                Invoke-WebRequest -Uri $url -OutFile "agave-install.exe" -UseBasicParsing
                
                Write-Host "Running installer..." -ForegroundColor Yellow
                .\agave-install.exe v$version
                
                # Add to PATH
                $solanaPath = "$env:USERPROFILE\.local\share\solana\install\active_release\bin"
                $currentPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
                if ($currentPath -notlike "*$solanaPath*") {
                    [System.Environment]::SetEnvironmentVariable(
                        "Path",
                        "$currentPath;$solanaPath",
                        "User"
                    )
                }
                
                # Refresh PATH
                $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
                
                Write-Host "✓ Solana CLI installed successfully" -ForegroundColor Green
                
            } catch {
                Write-Host "✗ Download failed: $_" -ForegroundColor Red
                Write-Host ""
                Write-Host "Please try one of these alternatives:" -ForegroundColor Yellow
                Write-Host "1. Manual download from: https://github.com/anza-xyz/agave/releases/latest" -ForegroundColor White
                Write-Host "2. Run this script again and choose option 2 (Cargo)" -ForegroundColor White
                Write-Host "3. Check your internet connection and firewall settings" -ForegroundColor White
                exit 1
            }
        }
        
        "2" {
            Write-Host "Installing via Cargo (this will take 15-30 minutes)..." -ForegroundColor Yellow
            Write-Host "Building Solana from source..." -ForegroundColor Gray
            
            cargo install solana-cli
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✓ Solana CLI installed successfully" -ForegroundColor Green
            } else {
                Write-Host "✗ Installation failed" -ForegroundColor Red
                exit 1
            }
        }
        
        "3" {
            Write-Host ""
            Write-Host "Manual Installation Instructions:" -ForegroundColor Yellow
            Write-Host "1. Visit: https://github.com/anza-xyz/agave/releases/latest" -ForegroundColor White
            Write-Host "2. Download: agave-install-init-x86_64-pc-windows-msvc.exe" -ForegroundColor White
            Write-Host "3. Run the downloaded installer" -ForegroundColor White
            Write-Host "4. Restart PowerShell" -ForegroundColor White
            Write-Host "5. Verify with: solana --version (should show 2.x with client:Agave)" -ForegroundColor White
            Write-Host ""
            Write-Host "After installation, run this script again to install Anchor" -ForegroundColor Yellow
            exit 0
        }
        
        default {
            Write-Host "Invalid choice. Exiting." -ForegroundColor Red
            exit 1
        }
    }
}

Write-Host ""

# Install Anchor
Write-Host "Installing Anchor Framework..." -ForegroundColor Yellow
Write-Host "Note: This may take 10-15 minutes" -ForegroundColor Gray
Write-Host ""

if (Test-CommandExists "anchor") {
    $anchorVersion = anchor --version
    Write-Host "✓ Anchor is already installed: $anchorVersion" -ForegroundColor Green
} else {
    Write-Host "Installing AVM (Anchor Version Manager)..." -ForegroundColor Yellow
    cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ AVM installed successfully" -ForegroundColor Green
        
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        
        Write-Host "Installing Anchor 0.32.1..." -ForegroundColor Yellow
        avm install 0.32.1
        avm use 0.32.1
        
        Write-Host "✓ Anchor installed successfully" -ForegroundColor Green
    } else {
        Write-Host "✗ AVM installation failed" -ForegroundColor Red
        Write-Host "Please ensure Rust and Cargo are properly installed" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Installation Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Verify all installations
Write-Host "Verifying installations:" -ForegroundColor Yellow
Write-Host ""

if (Test-CommandExists "rustc") {
    rustc --version
    Write-Host "✓ Rust working" -ForegroundColor Green
}

if (Test-CommandExists "solana") {
    solana --version
    Write-Host "✓ Solana CLI working" -ForegroundColor Green
}

if (Test-CommandExists "anchor") {
    anchor --version
    Write-Host "✓ Anchor working" -ForegroundColor Green
}

Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Configure Solana: solana config set --url devnet" -ForegroundColor White
Write-Host "2. Create wallet: solana-keygen new" -ForegroundColor White
Write-Host "3. Get devnet SOL: solana airdrop 2" -ForegroundColor White
Write-Host "4. Build program: anchor build" -ForegroundColor White
Write-Host "5. Deploy to devnet: anchor deploy" -ForegroundColor White
Write-Host ""
Write-Host "Or run: .\scripts\deploy-to-devnet.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "See DEVNET_DEPLOYMENT_STATUS.md for detailed instructions" -ForegroundColor Gray
Write-Host ""
Write-Host "NOTE: You may need to restart PowerShell for PATH changes to take effect" -ForegroundColor Yellow
Write-Host ""

