#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Complete Docker fresh start - eliminates all cache issues
.DESCRIPTION
    This script performs a complete cleanup and rebuild of the Docker environment:
    - Stops and removes all containers
    - Removes all volumes (database + Redis data)
    - Removes all images
    - Cleans local build artifacts (node_modules, dist, generated files)
    - Rebuilds everything from scratch with --no-cache
    - Runs database migrations
    - Optionally seeds database
.PARAMETER KeepData
    Keep database and Redis volumes (don't reset data)
.PARAMETER Seed
    Run database seed after migrations
.PARAMETER SkipMigrations
    Skip database migrations (not recommended)
.EXAMPLE
    .\scripts\docker-fresh-start.ps1
    Complete fresh start (removes all data)
.EXAMPLE
    .\scripts\docker-fresh-start.ps1 -KeepData
    Fresh start but keep database and Redis data
.EXAMPLE
    .\scripts\docker-fresh-start.ps1 -Seed
    Fresh start and seed database with sample data
#>

param(
    [switch]$KeepData,
    [switch]$Seed,
    [switch]$SkipMigrations
)

$ErrorActionPreference = "Stop"

Write-Host "🧹 EasyEscrow Docker Fresh Start" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
Write-Host "🔍 Checking Docker..." -ForegroundColor Yellow
try {
    docker ps | Out-Null
    Write-Host "✅ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not running. Please start Docker first." -ForegroundColor Red
    exit 1
}

# Step 1: Stop and remove containers
Write-Host ""
Write-Host "📦 Step 1: Stopping and removing containers..." -ForegroundColor Yellow
try {
    docker compose down --remove-orphans
    Write-Host "✅ Containers stopped and removed" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Warning: Error stopping containers (may not be running)" -ForegroundColor Yellow
}

# Step 2: Remove volumes (unless -KeepData is specified)
if (-not $KeepData) {
    Write-Host ""
    Write-Host "🗑️  Step 2: Removing volumes (database + Redis data)..." -ForegroundColor Yellow
    try {
        docker compose down -v
        Write-Host "✅ Volumes removed" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Warning: Error removing volumes" -ForegroundColor Yellow
    }
    
    # Also remove named volumes explicitly
    try {
        docker volume rm easy-escrow-ai-backend_postgres-data -f 2>$null
        docker volume rm easy-escrow-ai-backend_redis-data -f 2>$null
        Write-Host "✅ Named volumes removed" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Named volumes may not exist or already removed" -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "⏭️  Step 2: Skipping volume removal (keeping data)" -ForegroundColor Yellow
}

# Step 3: Remove images
Write-Host ""
Write-Host "🖼️  Step 3: Removing Docker images..." -ForegroundColor Yellow
try {
    # Remove project images
    docker compose down --rmi all 2>$null
    
    # Remove any dangling images
    docker image prune -f 2>$null
    
    Write-Host "✅ Images removed" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Warning: Error removing images" -ForegroundColor Yellow
}

# Step 4: Clean local build artifacts
Write-Host ""
Write-Host "🧹 Step 4: Cleaning local build artifacts..." -ForegroundColor Yellow

# Remove node_modules
if (Test-Path "node_modules") {
    Write-Host "  Removing node_modules..." -ForegroundColor Gray
    Remove-Item -Recurse -Force node_modules
    Write-Host "  ✓ node_modules removed" -ForegroundColor Gray
}

# Remove dist
if (Test-Path "dist") {
    Write-Host "  Removing dist..." -ForegroundColor Gray
    Remove-Item -Recurse -Force dist
    Write-Host "  ✓ dist removed" -ForegroundColor Gray
}

# Remove generated Prisma client
if (Test-Path "src/generated") {
    Write-Host "  Removing src/generated..." -ForegroundColor Gray
    Remove-Item -Recurse -Force src/generated
    Write-Host "  ✓ src/generated removed" -ForegroundColor Gray
}

# Remove generated Anchor IDL
if (Test-Path "src/generated/anchor") {
    Write-Host "  Removing src/generated/anchor..." -ForegroundColor Gray
    Remove-Item -Recurse -Force src/generated/anchor -ErrorAction SilentlyContinue
    Write-Host "  ✓ src/generated/anchor removed" -ForegroundColor Gray
}

# Clean npm cache
Write-Host "  Cleaning npm cache..." -ForegroundColor Gray
npm cache clean --force 2>$null
Write-Host "  ✓ npm cache cleaned" -ForegroundColor Gray

# Clean Docker build cache
Write-Host "  Cleaning Docker build cache..." -ForegroundColor Gray
docker builder prune -f 2>$null
Write-Host "  ✓ Docker build cache cleaned" -ForegroundColor Gray

Write-Host "✅ All build artifacts cleaned" -ForegroundColor Green

# Step 5: Copy latest IDL if available
Write-Host ""
Write-Host "📋 Step 5: Preparing fresh IDL..." -ForegroundColor Yellow
if (Test-Path "target/idl/escrow.json") {
    Write-Host "  Copying latest IDL from target/idl/escrow.json..." -ForegroundColor Gray
    New-Item -ItemType Directory -Force -Path "src/generated/anchor" | Out-Null
    Copy-Item "target/idl/escrow.json" "src/generated/anchor/escrow.json"
    Write-Host "✅ Latest IDL copied" -ForegroundColor Green
} else {
    Write-Host "⚠️  No IDL found at target/idl/escrow.json - will use existing if available" -ForegroundColor Yellow
}

# Step 6: Rebuild with --no-cache
Write-Host ""
Write-Host "🏗️  Step 6: Building fresh Docker images (no cache)..." -ForegroundColor Yellow
Write-Host "  This may take several minutes..." -ForegroundColor Gray
try {
    docker compose build --no-cache --pull
    Write-Host "✅ Fresh images built" -ForegroundColor Green
} catch {
    Write-Host "❌ Error building images" -ForegroundColor Red
    exit 1
}

# Step 7: Start services
Write-Host ""
Write-Host "🚀 Step 7: Starting services..." -ForegroundColor Yellow
try {
    docker compose up -d
    Write-Host "✅ Services started" -ForegroundColor Green
} catch {
    Write-Host "❌ Error starting services" -ForegroundColor Red
    exit 1
}

# Step 8: Wait for services to be healthy
Write-Host ""
Write-Host "⏳ Step 8: Waiting for services to be healthy..." -ForegroundColor Yellow
Write-Host "  This may take 30-60 seconds..." -ForegroundColor Gray

$maxAttempts = 30
$attempt = 0
$allHealthy = $false

while ($attempt -lt $maxAttempts -and -not $allHealthy) {
    Start-Sleep -Seconds 2
    $attempt++
    
    $status = docker compose ps --format json | ConvertFrom-Json
    $unhealthy = $status | Where-Object { $_.Health -ne "healthy" }
    
    if ($unhealthy.Count -eq 0) {
        $allHealthy = $true
    } else {
        Write-Host "  Attempt $attempt/$maxAttempts - Waiting for: $($unhealthy.Service -join ', ')..." -ForegroundColor Gray
    }
}

if ($allHealthy) {
    Write-Host "✅ All services are healthy" -ForegroundColor Green
} else {
    Write-Host "⚠️  Services may not be fully healthy yet. Check with: docker compose ps" -ForegroundColor Yellow
}

# Step 9: Run database migrations
if (-not $SkipMigrations) {
    Write-Host ""
    Write-Host "🗄️  Step 9: Running database migrations..." -ForegroundColor Yellow
    try {
        docker compose exec -T backend npx prisma migrate deploy
        Write-Host "✅ Migrations completed" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Warning: Migration error (database may need initialization)" -ForegroundColor Yellow
        Write-Host "  Try running manually: docker compose exec backend npx prisma migrate deploy" -ForegroundColor Gray
    }
} else {
    Write-Host ""
    Write-Host "⏭️  Step 9: Skipping migrations" -ForegroundColor Yellow
}

# Step 10: Seed database (optional)
if ($Seed) {
    Write-Host ""
    Write-Host "🌱 Step 10: Seeding database..." -ForegroundColor Yellow
    try {
        docker compose exec -T backend npm run db:seed
        Write-Host "✅ Database seeded" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Warning: Seeding error" -ForegroundColor Yellow
        Write-Host "  Try running manually: docker compose exec backend npm run db:seed" -ForegroundColor Gray
    }
}

# Final status check
Write-Host ""
Write-Host "📊 Final Status Check" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Cyan
docker compose ps

Write-Host ""
Write-Host "✅ Fresh start complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Next steps:" -ForegroundColor Cyan
Write-Host "  • View logs: docker compose logs -f" -ForegroundColor Gray
Write-Host "  • Check health: docker compose ps" -ForegroundColor Gray
Write-Host "  • Test API: curl http://localhost:3000/health" -ForegroundColor Gray
if (-not $Seed -and -not $KeepData) {
    Write-Host "  • Seed data: docker compose exec backend npm run db:seed" -ForegroundColor Gray
}
Write-Host ""

