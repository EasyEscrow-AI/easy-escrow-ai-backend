# Production Complete Deployment Script
# Deploys Solana program and backend to production

$ErrorActionPreference = "Stop"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "PRODUCTION DEPLOYMENT" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verify Program ID consistency
Write-Host "Step 1: Verifying program ID consistency..." -ForegroundColor Yellow
& .\scripts\deployment\verify-production-program-id.ps1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Program ID verification failed!" -ForegroundColor Red
    Write-Host "Fix the program ID mismatches before continuing!" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 2. Build Solana Program
Write-Host "Step 2: Building Solana program..." -ForegroundColor Yellow
$env:ANCHOR_PROVIDER_URL = "https://api.mainnet-beta.solana.com"
$env:ANCHOR_WALLET = "wallets/production/mainnet-admin-keypair.json"

anchor build --program-name escrow --arch sbf

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Program build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Program built successfully!" -ForegroundColor Green
Write-Host ""

# 3. Verify built program ID
Write-Host "Step 3: Verifying built program ID..." -ForegroundColor Yellow
$builtProgramId = solana address -k target/deploy/escrow-keypair.json
$expectedProgramId = "HqM2YpP1SdRXfNsuS2EvZyyBvKYoA5x7fR3cGxbQN5Ry"

Write-Host "Built Program ID: $builtProgramId"
Write-Host "Expected Program ID: $expectedProgramId"

if ($builtProgramId -ne $expectedProgramId) {
    Write-Host "❌ Built program ID does not match expected ID!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Built program ID matches expected ID!" -ForegroundColor Green
Write-Host ""

# 4. Check deployer wallet balance
Write-Host "Step 4: Checking deployer wallet balance..." -ForegroundColor Yellow
$balance = solana balance --url mainnet-beta -k wallets/production/mainnet-admin-keypair.json | Select-String -Pattern '[\d.]+' | ForEach-Object { $_.Matches[0].Value }
$balanceFloat = [float]$balance

Write-Host "Deployer balance: $balance SOL"

if ($balanceFloat -lt 5.0) {
    Write-Host "⚠️  Low balance! Recommend at least 5 SOL for deployment" -ForegroundColor Yellow
    $continue = Read-Host "Continue anyway? (y/N)"
    if ($continue -ne 'y') {
        Write-Host "Deployment cancelled" -ForegroundColor Yellow
        exit 0
    }
}
Write-Host ""

# 5. Deploy program (dry run first)
Write-Host "Step 5: Running deployment dry run..." -ForegroundColor Yellow
anchor deploy --program-name escrow --provider.cluster mainnet --dry-run

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Dry run failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Dry run passed!" -ForegroundColor Green
Write-Host ""

# 6. Confirm deployment
Write-Host "⚠️  READY TO DEPLOY TO PRODUCTION MAINNET" -ForegroundColor Yellow
Write-Host ""
Write-Host "Program ID: $expectedProgramId"
Write-Host "Network: mainnet-beta"
Write-Host "Deployer: wallets/production/mainnet-admin-keypair.json"
Write-Host ""
$confirm = Read-Host "Confirm deployment to PRODUCTION? (yes/NO)"

if ($confirm -ne 'yes') {
    Write-Host "Deployment cancelled" -ForegroundColor Yellow
    exit 0
}

# 7. Deploy program
Write-Host ""
Write-Host "Step 6: Deploying program to mainnet..." -ForegroundColor Yellow
anchor deploy --program-name escrow --provider.cluster mainnet

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Program deployment failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Program deployed successfully!" -ForegroundColor Green
Write-Host ""

# 8. Verify on-chain program
Write-Host "Step 7: Verifying on-chain program..." -ForegroundColor Yellow
solana program show $expectedProgramId --url mainnet-beta

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Program verification failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Program verified on-chain!" -ForegroundColor Green
Write-Host ""

# 9. Upload IDL
Write-Host "Step 8: Uploading IDL to chain..." -ForegroundColor Yellow

# Check if IDL already exists
$idlExists = $false
try {
    anchor idl fetch $expectedProgramId --provider.cluster mainnet --out temp/existing-idl.json 2>&1 | Out-Null
    $idlExists = $true
    Write-Host "IDL already exists on-chain, upgrading..." -ForegroundColor Yellow
    
    anchor idl upgrade $expectedProgramId `
      --filepath target/idl/escrow.json `
      --provider.cluster mainnet
} catch {
    Write-Host "No existing IDL found, initializing new one..." -ForegroundColor Yellow
    
    anchor idl init $expectedProgramId `
      --filepath target/idl/escrow.json `
      --provider.cluster mainnet
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ IDL upload failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ IDL uploaded successfully!" -ForegroundColor Green
Write-Host ""

# 10. Verify IDL
Write-Host "Step 9: Verifying uploaded IDL..." -ForegroundColor Yellow
anchor idl fetch $expectedProgramId `
  --provider.cluster mainnet `
  --out temp/fetched-idl.json

# Compare IDL files
$sourceIdl = Get-Content target/idl/escrow.json -Raw
$fetchedIdl = Get-Content temp/fetched-idl.json -Raw

if ($sourceIdl -eq $fetchedIdl) {
    Write-Host "✅ IDL matches source!" -ForegroundColor Green
} else {
    Write-Host "⚠️  IDL differs from source (this may be expected if there are minor differences)" -ForegroundColor Yellow
}
Write-Host ""

# 11. Build backend
Write-Host "Step 10: Building backend..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Backend build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Backend built successfully!" -ForegroundColor Green
Write-Host ""

# 12. Run database migrations
Write-Host "Step 11: Running database migrations..." -ForegroundColor Yellow
Write-Host "⚠️  This will run migrations on PRODUCTION database!" -ForegroundColor Yellow
$confirmMigrations = Read-Host "Confirm running migrations on production database? (yes/NO)"

if ($confirmMigrations -ne 'yes') {
    Write-Host "Skipping migrations..." -ForegroundColor Yellow
} else {
    npx prisma migrate deploy --schema prisma/schema.prisma
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Database migrations failed!" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "✅ Database migrations completed!" -ForegroundColor Green
}
Write-Host ""

# 13. Backend deployment (automatic via GitHub)
Write-Host "Step 12: Backend deployment..." -ForegroundColor Yellow
Write-Host ""
Write-Host "ℹ️  Backend deployment is AUTOMATIC via GitHub CI/CD" -ForegroundColor Cyan
Write-Host "   When code is merged to 'master' branch, DigitalOcean automatically:" -ForegroundColor White
Write-Host "   1. Detects the merge" -ForegroundColor White
Write-Host "   2. Builds the backend" -ForegroundColor White
Write-Host "   3. Deploys to production" -ForegroundColor White
Write-Host ""
Write-Host "📋 To deploy backend changes:" -ForegroundColor Yellow
Write-Host "   1. Ensure all changes are committed to your branch" -ForegroundColor White
Write-Host "   2. Create a Pull Request to 'master'" -ForegroundColor White
Write-Host "   3. Review and approve the PR" -ForegroundColor White
Write-Host "   4. Merge to 'master'" -ForegroundColor White
Write-Host "   5. DigitalOcean will automatically deploy (~5 minutes)" -ForegroundColor White
Write-Host ""
$deployBackend = Read-Host "Have you merged your changes to 'master' for automatic deployment? (y/N)"

if ($deployBackend -ne 'y') {
    Write-Host ""
    Write-Host "⚠️  Backend not deployed yet" -ForegroundColor Yellow
    Write-Host "   Complete these steps:" -ForegroundColor Yellow
    Write-Host "   1. Commit your changes" -ForegroundColor White
    Write-Host "   2. Push to your branch" -ForegroundColor White
    Write-Host "   3. Create PR to master" -ForegroundColor White
    Write-Host "   4. Merge PR (this triggers automatic deployment)" -ForegroundColor White
    Write-Host "   5. Monitor deployment in DigitalOcean console" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "✅ Backend deployment will happen automatically after merge" -ForegroundColor Green
    Write-Host "   Monitor progress: https://cloud.digitalocean.com/apps/" -ForegroundColor Cyan
}
Write-Host ""

# 14. Final summary
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "DEPLOYMENT SUMMARY" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "✅ Program ID verified" -ForegroundColor Green
Write-Host "✅ Program built" -ForegroundColor Green
Write-Host "✅ Program deployed to mainnet" -ForegroundColor Green
Write-Host "✅ IDL uploaded to chain" -ForegroundColor Green
Write-Host "✅ Backend built" -ForegroundColor Green

if ($confirmMigrations -eq 'yes') {
    Write-Host "✅ Database migrations completed" -ForegroundColor Green
}

if ($deployBackend -eq 'y') {
    Write-Host "✅ Backend deployment (automatic via GitHub merge to master)" -ForegroundColor Green
} else {
    Write-Host "⚠️  Backend deployment pending (merge to master required)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
if ($deployBackend -ne 'y') {
    Write-Host "1. Merge changes to 'master' branch (triggers automatic deployment)" -ForegroundColor White
    Write-Host "2. Wait for backend deployment to complete (~5 minutes)" -ForegroundColor White
    Write-Host "3. Run health checks: npm run test:production:smoke" -ForegroundColor White
    Write-Host "4. Run happy path tests: npm run test:production:happy-path" -ForegroundColor White
    Write-Host "5. Run full E2E suite: npm run test:production:e2e" -ForegroundColor White
    Write-Host "6. Monitor production for 24 hours" -ForegroundColor White
} else {
    Write-Host "1. Wait for backend deployment to complete (~5 minutes)" -ForegroundColor White
    Write-Host "2. Monitor deployment: https://cloud.digitalocean.com/apps/" -ForegroundColor White
    Write-Host "3. Run health checks: npm run test:production:smoke" -ForegroundColor White
    Write-Host "4. Run happy path tests: npm run test:production:happy-path" -ForegroundColor White
    Write-Host "5. Run full E2E suite: npm run test:production:e2e" -ForegroundColor White
    Write-Host "6. Monitor production for 24 hours" -ForegroundColor White
}
Write-Host ""
Write-Host "Production API: https://api.easyescrow.xyz" -ForegroundColor Cyan
Write-Host "Program ID: $expectedProgramId" -ForegroundColor Cyan
Write-Host "Network: mainnet-beta" -ForegroundColor Cyan
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "🎉 DEPLOYMENT COMPLETE!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan

