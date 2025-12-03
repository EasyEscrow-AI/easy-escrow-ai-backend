# Migration script with automatic failed migration resolution
# This script marks any failed migration as rolled back before deploying new migrations

Write-Host "🔄 Checking for failed migrations..." -ForegroundColor Cyan

# Try to mark the known failed migration as rolled back (ignore errors if it doesn't exist)
try {
    npx prisma migrate resolve --rolled-back 20251117192727_add_atomic_swap_models 2>&1 | Out-Null
    Write-Host "✅ Failed migration resolved" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Migration 20251117192727_add_atomic_swap_models not found or already resolved" -ForegroundColor Yellow
}

Write-Host "📦 Deploying migrations..." -ForegroundColor Cyan

# Deploy migrations
npx prisma migrate deploy

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Migrations deployed successfully" -ForegroundColor Green
    exit 0
} else {
    Write-Host "❌ Migration deployment failed" -ForegroundColor Red
    exit 1
}

