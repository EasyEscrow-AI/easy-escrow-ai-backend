# Database setup script for EasyEscrow.ai backend (PowerShell)
# This script sets up the PostgreSQL database and runs migrations

Write-Host "🔧 Setting up database for EasyEscrow.ai..." -ForegroundColor Cyan

# Check if DATABASE_URL is set
$dbUrl = $env:DATABASE_URL
if (-not $dbUrl) {
    $dbUrl = Get-Content .env | Select-String -Pattern "DATABASE_URL" | ForEach-Object { $_.ToString().Split('=')[1].Trim('"') }
}

if (-not $dbUrl) {
    Write-Host "❌ DATABASE_URL environment variable is not set" -ForegroundColor Red
    Write-Host "Please set DATABASE_URL in your .env file" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ DATABASE_URL is set" -ForegroundColor Green

# Check if PostgreSQL is accessible
Write-Host "📡 Checking database connection..." -ForegroundColor Cyan
try {
    $result = npx prisma db pull --force 2>&1
    Write-Host "✅ Database connection successful" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Cannot connect to database. Please ensure PostgreSQL is running." -ForegroundColor Yellow
    Write-Host "For local development, you can start PostgreSQL with Docker:" -ForegroundColor Yellow
    Write-Host "  docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:15" -ForegroundColor Cyan
    exit 1
}

# Generate Prisma client
Write-Host "🔨 Generating Prisma client..." -ForegroundColor Cyan
npx prisma generate

# Run migrations
Write-Host "📦 Running database migrations..." -ForegroundColor Cyan
npx prisma migrate deploy

Write-Host "✅ Database setup complete!" -ForegroundColor Green
Write-Host "🎉 You can now start the application with: npm run dev" -ForegroundColor Cyan

