#!/bin/bash
# Complete Docker fresh start - eliminates all cache issues
# Usage: ./scripts/docker-fresh-start.sh [--keep-data] [--seed] [--skip-migrations]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

# Parse arguments
KEEP_DATA=false
SEED=false
SKIP_MIGRATIONS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --keep-data)
            KEEP_DATA=true
            shift
            ;;
        --seed)
            SEED=true
            shift
            ;;
        --skip-migrations)
            SKIP_MIGRATIONS=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Complete Docker fresh start - eliminates all cache issues"
            echo ""
            echo "Options:"
            echo "  --keep-data        Keep database and Redis volumes (don't reset data)"
            echo "  --seed             Run database seed after migrations"
            echo "  --skip-migrations  Skip database migrations (not recommended)"
            echo "  --help             Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                    # Complete fresh start (removes all data)"
            echo "  $0 --keep-data        # Fresh start but keep database and Redis data"
            echo "  $0 --seed             # Fresh start and seed database with sample data"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Run '$0 --help' for usage information"
            exit 1
            ;;
    esac
done

echo -e "${CYAN}🧹 EasyEscrow Docker Fresh Start${NC}"
echo -e "${CYAN}================================${NC}"
echo ""

# Check if Docker is running
echo -e "${YELLOW}🔍 Checking Docker...${NC}"
if ! docker ps &> /dev/null; then
    echo -e "${RED}❌ Docker is not running. Please start Docker first.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Docker is running${NC}"

# Step 1: Stop and remove containers
echo ""
echo -e "${YELLOW}📦 Step 1: Stopping and removing containers...${NC}"
docker compose down --remove-orphans || echo -e "${YELLOW}⚠️  Warning: Error stopping containers (may not be running)${NC}"
echo -e "${GREEN}✅ Containers stopped and removed${NC}"

# Step 2: Remove volumes (unless --keep-data is specified)
if [ "$KEEP_DATA" = false ]; then
    echo ""
    echo -e "${YELLOW}🗑️  Step 2: Removing volumes (database + Redis data)...${NC}"
    docker compose down -v || echo -e "${YELLOW}⚠️  Warning: Error removing volumes${NC}"
    
    # Also remove named volumes explicitly
    docker volume rm easy-escrow-ai-backend_postgres-data -f 2>/dev/null || true
    docker volume rm easy-escrow-ai-backend_redis-data -f 2>/dev/null || true
    echo -e "${GREEN}✅ Volumes removed${NC}"
else
    echo ""
    echo -e "${YELLOW}⏭️  Step 2: Skipping volume removal (keeping data)${NC}"
fi

# Step 3: Remove images
echo ""
echo -e "${YELLOW}🖼️  Step 3: Removing Docker images...${NC}"
docker compose down --rmi all 2>/dev/null || true
docker image prune -f 2>/dev/null || true
echo -e "${GREEN}✅ Images removed${NC}"

# Step 4: Clean local build artifacts
echo ""
echo -e "${YELLOW}🧹 Step 4: Cleaning local build artifacts...${NC}"

if [ -d "node_modules" ]; then
    echo -e "${GRAY}  Removing node_modules...${NC}"
    rm -rf node_modules
    echo -e "${GRAY}  ✓ node_modules removed${NC}"
fi

if [ -d "dist" ]; then
    echo -e "${GRAY}  Removing dist...${NC}"
    rm -rf dist
    echo -e "${GRAY}  ✓ dist removed${NC}"
fi

if [ -d "src/generated" ]; then
    echo -e "${GRAY}  Removing src/generated...${NC}"
    rm -rf src/generated
    echo -e "${GRAY}  ✓ src/generated removed${NC}"
fi

echo -e "${GRAY}  Cleaning npm cache...${NC}"
npm cache clean --force 2>/dev/null || true
echo -e "${GRAY}  ✓ npm cache cleaned${NC}"

echo -e "${GRAY}  Cleaning Docker build cache...${NC}"
docker builder prune -f 2>/dev/null || true
echo -e "${GRAY}  ✓ Docker build cache cleaned${NC}"

echo -e "${GREEN}✅ All build artifacts cleaned${NC}"

# Step 5: Copy latest IDL if available
echo ""
echo -e "${YELLOW}📋 Step 5: Preparing fresh IDL...${NC}"
if [ -f "target/idl/escrow.json" ]; then
    echo -e "${GRAY}  Copying latest IDL from target/idl/escrow.json...${NC}"
    mkdir -p src/generated/anchor
    cp target/idl/escrow.json src/generated/anchor/escrow.json
    echo -e "${GREEN}✅ Latest IDL copied${NC}"
else
    echo -e "${YELLOW}⚠️  No IDL found at target/idl/escrow.json - will use existing if available${NC}"
fi

# Step 6: Rebuild with --no-cache
echo ""
echo -e "${YELLOW}🏗️  Step 6: Building fresh Docker images (no cache)...${NC}"
echo -e "${GRAY}  This may take several minutes...${NC}"
if ! docker compose build --no-cache --pull; then
    echo -e "${RED}❌ Error building images${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Fresh images built${NC}"

# Step 7: Start services
echo ""
echo -e "${YELLOW}🚀 Step 7: Starting services...${NC}"
if ! docker compose up -d; then
    echo -e "${RED}❌ Error starting services${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Services started${NC}"

# Step 8: Wait for services to be healthy
echo ""
echo -e "${YELLOW}⏳ Step 8: Waiting for services to be healthy...${NC}"
echo -e "${GRAY}  This may take 30-60 seconds...${NC}"

max_attempts=30
attempt=0
all_healthy=false

while [ $attempt -lt $max_attempts ] && [ "$all_healthy" = false ]; do
    sleep 2
    attempt=$((attempt + 1))
    
    # Check if all services are healthy
    unhealthy=$(docker compose ps --format json | jq -r 'select(.Health != "healthy") | .Service' 2>/dev/null || echo "")
    
    if [ -z "$unhealthy" ]; then
        all_healthy=true
    else
        echo -e "${GRAY}  Attempt $attempt/$max_attempts - Waiting for: $unhealthy...${NC}"
    fi
done

if [ "$all_healthy" = true ]; then
    echo -e "${GREEN}✅ All services are healthy${NC}"
else
    echo -e "${YELLOW}⚠️  Services may not be fully healthy yet. Check with: docker compose ps${NC}"
fi

# Step 9: Run database migrations
if [ "$SKIP_MIGRATIONS" = false ]; then
    echo ""
    echo -e "${YELLOW}🗄️  Step 9: Running database migrations...${NC}"
    if docker compose exec -T backend npx prisma migrate deploy; then
        echo -e "${GREEN}✅ Migrations completed${NC}"
    else
        echo -e "${YELLOW}⚠️  Warning: Migration error (database may need initialization)${NC}"
        echo -e "${GRAY}  Try running manually: docker compose exec backend npx prisma migrate deploy${NC}"
    fi
else
    echo ""
    echo -e "${YELLOW}⏭️  Step 9: Skipping migrations${NC}"
fi

# Step 10: Seed database (optional)
if [ "$SEED" = true ]; then
    echo ""
    echo -e "${YELLOW}🌱 Step 10: Seeding database...${NC}"
    if docker compose exec -T backend npm run db:seed; then
        echo -e "${GREEN}✅ Database seeded${NC}"
    else
        echo -e "${YELLOW}⚠️  Warning: Seeding error${NC}"
        echo -e "${GRAY}  Try running manually: docker compose exec backend npm run db:seed${NC}"
    fi
fi

# Final status check
echo ""
echo -e "${CYAN}📊 Final Status Check${NC}"
echo -e "${CYAN}=====================${NC}"
docker compose ps

echo ""
echo -e "${GREEN}✅ Fresh start complete!${NC}"
echo ""
echo -e "${CYAN}📝 Next steps:${NC}"
echo -e "${GRAY}  • View logs: docker compose logs -f${NC}"
echo -e "${GRAY}  • Check health: docker compose ps${NC}"
echo -e "${GRAY}  • Test API: curl http://localhost:3000/health${NC}"
if [ "$SEED" = false ] && [ "$KEEP_DATA" = false ]; then
    echo -e "${GRAY}  • Seed data: docker compose exec backend npm run db:seed${NC}"
fi
echo ""

