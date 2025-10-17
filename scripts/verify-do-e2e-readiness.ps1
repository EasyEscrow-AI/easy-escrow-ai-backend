# Verification script for DigitalOcean E2E Test Readiness (PowerShell)
# Run this to check if the DO dev server has everything needed for E2E tests

param(
    [switch]$Detailed = $false
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "DO Server E2E Test Readiness Check" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Counters
$script:PassCount = 0
$script:FailCount = 0
$script:WarnCount = 0

# Expected values
$EXPECTED_ANCHOR_VERSION = "0.32.1"
$EXPECTED_PROGRAM_ID = "4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd"
$EXPECTED_NETWORK = "devnet"
$MIN_SOL_BALANCE = 0.05

$SENDER_ADDRESS = "FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71"
$RECEIVER_ADDRESS = "Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk"
$ADMIN_ADDRESS = "7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u"
$FEE_COLLECTOR_ADDRESS = "C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E"

# Helper functions
function Pass($message) {
    Write-Host "✅ PASS: " -ForegroundColor Green -NoNewline
    Write-Host $message
    $script:PassCount++
}

function Fail($message) {
    Write-Host "❌ FAIL: " -ForegroundColor Red -NoNewline
    Write-Host $message
    $script:FailCount++
}

function Warn($message) {
    Write-Host "⚠️  WARN: " -ForegroundColor Yellow -NoNewline
    Write-Host $message
    $script:WarnCount++
}

function Info($message) {
    Write-Host "ℹ️  INFO: " -ForegroundColor Blue -NoNewline
    Write-Host $message
}

function Section($title) {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host $title -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
}

# 1. Check Node.js and npm
Section "1. Node.js Environment"

try {
    $nodeVersion = node --version
    Pass "Node.js installed: $nodeVersion"
} catch {
    Fail "Node.js not installed"
}

try {
    $npmVersion = npm --version
    Pass "npm installed: $npmVersion"
} catch {
    Fail "npm not installed"
}

# 2. Check Solana CLI
Section "2. Solana CLI"

try {
    $solanaVersion = solana --version 2>&1 | Select-Object -First 1
    Pass "Solana CLI installed: $solanaVersion"
    
    # Check Solana configuration
    $configOutput = solana config get 2>&1
    $currentRpc = $configOutput | Select-String "RPC URL" | ForEach-Object { $_.Line.Split()[-1] }
    
    if ($currentRpc -like "*devnet*") {
        Pass "Solana configured for devnet: $currentRpc"
    } else {
        Fail "Solana NOT configured for devnet (current: $currentRpc)"
        Info "Run: solana config set --url devnet"
    }
} catch {
    Fail "Solana CLI not installed"
    Info "Install: https://docs.solana.com/cli/install-solana-cli-tools"
}

# 3. Check Anchor CLI
Section "3. Anchor Framework"

try {
    $anchorOutput = anchor --version 2>&1
    if ($anchorOutput -match "anchor-cli (\d+\.\d+\.\d+)") {
        $anchorVersion = $matches[1]
        
        if ($anchorVersion -eq $EXPECTED_ANCHOR_VERSION) {
            Pass "Anchor CLI version correct: $anchorVersion"
        } else {
            Fail "Anchor CLI version mismatch: expected $EXPECTED_ANCHOR_VERSION, got $anchorVersion"
            Info "Install correct version:"
            Info "  cargo install --git https://github.com/coral-xyz/anchor avm --locked --force"
            Info "  avm install $EXPECTED_ANCHOR_VERSION"
            Info "  avm use $EXPECTED_ANCHOR_VERSION"
        }
    } else {
        Warn "Could not parse Anchor version: $anchorOutput"
    }
} catch {
    Fail "Anchor CLI not installed"
    Info "Install:"
    Info "  cargo install --git https://github.com/coral-xyz/anchor avm --locked --force"
    Info "  avm install $EXPECTED_ANCHOR_VERSION"
    Info "  avm use $EXPECTED_ANCHOR_VERSION"
}

# 4. Check Environment Variables
Section "4. Environment Variables"

function Check-Env($varName, $expectedValue = "", $isSecret = $false) {
    $value = [Environment]::GetEnvironmentVariable($varName)
    
    if ($value) {
        if ($isSecret) {
            Pass "$varName is set (value masked for security)"
        } else {
            if ($expectedValue -and $value -ne $expectedValue) {
                Warn "$varName is set but value differs: expected '$expectedValue', got '$value'"
            } else {
                Pass "$varName is set: $value"
            }
        }
    } else {
        Fail "$varName is NOT set"
    }
}

# Core environment variables
Check-Env "NODE_ENV"
Check-Env "SOLANA_NETWORK" $EXPECTED_NETWORK
Check-Env "SOLANA_RPC_URL" "https://api.devnet.solana.com"
Check-Env "ESCROW_PROGRAM_ID" $EXPECTED_PROGRAM_ID
Check-Env "USDC_MINT_ADDRESS"

# Wallet private keys (secrets)
Check-Env "DEVNET_SENDER_PRIVATE_KEY" "" $true
Check-Env "DEVNET_RECEIVER_PRIVATE_KEY" "" $true
Check-Env "DEVNET_ADMIN_PRIVATE_KEY" "" $true
Check-Env "DEVNET_FEE_COLLECTOR_PRIVATE_KEY" "" $true

# 5. Check Program Deployment
Section "5. Program Deployment"

try {
    Info "Checking program: $EXPECTED_PROGRAM_ID"
    
    $programCheck = solana account $EXPECTED_PROGRAM_ID --url devnet 2>&1
    if ($LASTEXITCODE -eq 0) {
        Pass "Program deployed on devnet: $EXPECTED_PROGRAM_ID"
        
        if ($Detailed) {
            $programInfo = $programCheck | Select-Object -First 5
            Write-Host $programInfo -ForegroundColor Gray
        }
        
        Info "  Explorer: https://explorer.solana.com/address/$EXPECTED_PROGRAM_ID`?cluster=devnet"
    } else {
        Fail "Program NOT found on devnet: $EXPECTED_PROGRAM_ID"
        Info "Deploy with: anchor deploy --provider.cluster devnet"
    }
} catch {
    Warn "Cannot check program (Solana CLI not available)"
}

# 6. Check Wallet Balances
Section "6. Devnet Wallet Balances"

function Check-WalletBalance($name, $address, $minBalance) {
    Info "Checking $name : $address"
    
    try {
        $balanceOutput = solana balance $address --url devnet 2>&1
        
        if ($balanceOutput -match "(\d+\.?\d*)\s*SOL") {
            $balance = [float]$matches[1]
            
            if ($balance -ge $minBalance) {
                Pass "$name balance sufficient: $balance SOL (min: $minBalance SOL)"
            } else {
                Warn "$name balance LOW: $balance SOL (min: $minBalance SOL)"
                Info "  Fund with: solana transfer $address 2 --url devnet"
            }
            Info "  Explorer: https://explorer.solana.com/address/$address`?cluster=devnet"
        } else {
            Fail "$name account not found or error: $balanceOutput"
            Info "  Fund to activate: solana transfer $address 0.5 --url devnet"
        }
    } catch {
        Warn "Cannot check balance for $name"
    }
    Write-Host ""
}

Check-WalletBalance "Sender (Seller)" $SENDER_ADDRESS 0.5
Check-WalletBalance "Receiver (Buyer)" $RECEIVER_ADDRESS 0.5
Check-WalletBalance "Admin" $ADMIN_ADDRESS 0.5
Check-WalletBalance "FeeCollector" $FEE_COLLECTOR_ADDRESS 0.1

# 7. Check Node Dependencies
Section "7. Node.js Dependencies"

if (Test-Path "package.json") {
    Pass "package.json exists"
    
    if (Test-Path "node_modules") {
        Pass "node_modules directory exists"
        
        function Check-Dep($dep) {
            $depPath = "node_modules\$dep"
            if (Test-Path $depPath) {
                try {
                    $pkgJson = Get-Content "$depPath\package.json" -Raw | ConvertFrom-Json
                    $version = $pkgJson.version
                    Pass "$dep installed: $version"
                } catch {
                    Pass "$dep installed (version unknown)"
                }
            } else {
                Fail "$dep NOT installed"
            }
        }
        
        Check-Dep "@coral-xyz/anchor"
        Check-Dep "@solana/web3.js"
        Check-Dep "@solana/spl-token"
        Check-Dep "@metaplex-foundation/js"
        Check-Dep "bs58"
        Check-Dep "mocha"
        Check-Dep "chai"
    } else {
        Warn "node_modules not found"
        Info "Run: npm ci"
    }
} else {
    Fail "package.json not found (wrong directory?)"
}

# 8. Check Test Files
Section "8. Test Files"

function Check-File($file) {
    if (Test-Path $file) {
        Pass "File exists: $file"
    } else {
        Fail "File missing: $file"
    }
}

Check-File "tests\e2e\devnet-nft-usdc-swap.test.ts"
Check-File "tests\integration-test-devnet.ts"
Check-File "tests\helpers\devnet-wallet-manager.ts"
Check-File "tests\helpers\devnet-token-setup.ts"
Check-File "tests\helpers\devnet-nft-setup.ts"
Check-File "Anchor.toml"

# 9. Check Database and Redis
Section "9. Database & Redis Connections"

Check-Env "DATABASE_URL"
Check-Env "REDIS_URL"

# Summary
Section "SUMMARY"

$total = $script:PassCount + $script:FailCount + $script:WarnCount

Write-Host "Results:" -ForegroundColor White
Write-Host "  ✅ Passed: $script:PassCount" -ForegroundColor Green
Write-Host "  ❌ Failed: $script:FailCount" -ForegroundColor Red
Write-Host "  ⚠️  Warnings: $script:WarnCount" -ForegroundColor Yellow
Write-Host "  ━━━━━━━━━━━━━━━━━━"
Write-Host "  Total: $total checks"
Write-Host ""

if ($script:FailCount -eq 0) {
    if ($script:WarnCount -eq 0) {
        Write-Host "🎉 ALL CHECKS PASSED!" -ForegroundColor Green
        Write-Host "Server is ready for E2E tests." -ForegroundColor Green
    } else {
        Write-Host "⚠️  PASSED WITH WARNINGS" -ForegroundColor Yellow
        Write-Host "Server is mostly ready, but some issues need attention." -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Run E2E tests with:" -ForegroundColor White
    Write-Host "  npm run test:e2e" -ForegroundColor Cyan
    $exitCode = 0
} else {
    Write-Host "❌ CHECKS FAILED" -ForegroundColor Red
    Write-Host "Server is NOT ready for E2E tests." -ForegroundColor Red
    Write-Host "Please fix the issues above before running tests." -ForegroundColor Yellow
    $exitCode = 1
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan

exit $exitCode

