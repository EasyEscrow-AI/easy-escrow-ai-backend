# Production Program ID Verification Script
# Verifies that the production program ID matches across all files

$ErrorActionPreference = "Stop"

$EXPECTED_PROGRAM_ID = "HqM2YpP1SdRXfNsuS2EvZyyBvKYoA5x7fR3cGxbQN5Ry"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Production Program ID Verification" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Expected ID: $EXPECTED_PROGRAM_ID" -ForegroundColor Yellow
Write-Host ""

$allChecksPass = $true
$checksPassed = 0
$checksFailed = 0

function Test-ProgramId {
    param(
        [string]$FilePath,
        [string]$Description,
        [scriptblock]$ExtractId
    )
    
    Write-Host "Checking: $Description..." -NoNewline
    
    if (-not (Test-Path $FilePath)) {
        Write-Host " [FAIL]" -ForegroundColor Red
        Write-Host "  File not found: $FilePath" -ForegroundColor Red
        $script:allChecksPass = $false
        $script:checksFailed++
        return
    }
    
    try {
        $content = Get-Content $FilePath -Raw
        $extractedId = & $ExtractId $content
        
        if ($extractedId -eq $EXPECTED_PROGRAM_ID) {
            Write-Host " [PASS]" -ForegroundColor Green
            $script:checksPassed++
        } else {
            Write-Host " [FAIL]" -ForegroundColor Red
            Write-Host "  Expected: $EXPECTED_PROGRAM_ID" -ForegroundColor Red
            Write-Host "  Found:    $extractedId" -ForegroundColor Red
            $script:allChecksPass = $false
            $script:checksFailed++
        }
    } catch {
        Write-Host " [FAIL]" -ForegroundColor Red
        Write-Host "  Error: $_" -ForegroundColor Red
        $script:allChecksPass = $false
        $script:checksFailed++
    }
}

# Check 1: Anchor.mainnet.toml
Test-ProgramId `
    -FilePath "Anchor.mainnet.toml" `
    -Description "Anchor.mainnet.toml" `
    -ExtractId {
        param($content)
        if ($content -match 'escrow\s*=\s*"([A-Za-z0-9]+)"') {
            return $matches[1]
        }
        throw "Program ID not found in Anchor.mainnet.toml"
    }

# Check 2: lib.rs declare_id!
Test-ProgramId `
    -FilePath "programs/escrow/src/lib.rs" `
    -Description "programs/escrow/src/lib.rs (declare_id!)" `
    -ExtractId {
        param($content)
        if ($content -match 'declare_id!\("([A-Za-z0-9]+)"\)') {
            return $matches[1]
        }
        throw "declare_id! not found in lib.rs"
    }

# Check 3: idl/escrow.json
Test-ProgramId `
    -FilePath "idl/escrow.json" `
    -Description "idl/escrow.json" `
    -ExtractId {
        param($content)
        $json = $content | ConvertFrom-Json
        if ($json.address) {
            return $json.address
        }
        throw "address field not found in IDL JSON"
    }

# Check 4: src/generated/anchor/escrow.ts
Test-ProgramId `
    -FilePath "src/generated/anchor/escrow.ts" `
    -Description "src/generated/anchor/escrow.ts" `
    -ExtractId {
        param($content)
        if ($content -match 'export const PROGRAM_ID\s*=\s*new PublicKey\([''"]([A-Za-z0-9]+)[''"]\)' -or
            $content -match '"address":\s*[''"]([A-Za-z0-9]+)[''"]') {
            return $matches[1]
        }
        throw "PROGRAM_ID not found in escrow.ts"
    }

# Check 5: .env.production (if exists)
if (Test-Path ".env.production") {
    Test-ProgramId `
        -FilePath ".env.production" `
        -Description ".env.production" `
        -ExtractId {
            param($content)
            if ($content -match 'ESCROW_PROGRAM_ID\s*=\s*([A-Za-z0-9]+)') {
                return $matches[1]
            }
            throw "ESCROW_PROGRAM_ID not found in .env.production"
        }
}

# Check 6: target/idl/escrow.json (if built)
if (Test-Path "target/idl/escrow.json") {
    Test-ProgramId `
        -FilePath "target/idl/escrow.json" `
        -Description "target/idl/escrow.json (built)" `
        -ExtractId {
            param($content)
            $json = $content | ConvertFrom-Json
            if ($json.address) {
                return $json.address
            }
            throw "address field not found in built IDL JSON"
        }
} else {
    Write-Host "Checking: target/idl/escrow.json (built)..." -NoNewline
    Write-Host " [SKIP - Not built yet]" -ForegroundColor Yellow
}

# Check 7: target/deploy/escrow-keypair.json (if exists)
if (Test-Path "target/deploy/escrow-keypair.json") {
    Write-Host "Checking: target/deploy/escrow-keypair.json..." -NoNewline
    try {
        $keypairAddress = solana address -k target/deploy/escrow-keypair.json 2>$null
        if ($keypairAddress -eq $EXPECTED_PROGRAM_ID) {
            Write-Host " [PASS]" -ForegroundColor Green
            $checksPassed++
        } else {
            Write-Host " [FAIL]" -ForegroundColor Red
            Write-Host "  Expected: $EXPECTED_PROGRAM_ID" -ForegroundColor Red
            Write-Host "  Found:    $keypairAddress" -ForegroundColor Red
            $allChecksPass = $false
            $checksFailed++
        }
    } catch {
        Write-Host " [FAIL]" -ForegroundColor Red
        Write-Host "  Error: $_" -ForegroundColor Red
        $allChecksPass = $false
        $checksFailed++
    }
} else {
    Write-Host "Checking: target/deploy/escrow-keypair.json..." -NoNewline
    Write-Host " [SKIP - Not built yet]" -ForegroundColor Yellow
}

# Summary
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Verification Summary" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Checks Passed: $checksPassed" -ForegroundColor Green
Write-Host "Checks Failed: $checksFailed" -ForegroundColor Red
Write-Host ""

if ($allChecksPass) {
    Write-Host "✓ All program ID checks PASSED" -ForegroundColor Green
    Write-Host "✓ Production program ID is consistent across all files" -ForegroundColor Green
    Write-Host ""
    Write-Host "Safe to deploy to production!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "✗ Program ID verification FAILED" -ForegroundColor Red
    Write-Host "✗ Fix the inconsistencies before deploying to production" -ForegroundColor Red
    Write-Host ""
    Write-Host "DO NOT DEPLOY - Program IDs do not match!" -ForegroundColor Red
    exit 1
}

