#!/bin/bash
# Production Health Check Script
# Usage: ./scripts/check-production-health.sh

set -e

echo "🔍 Production Health Check"
echo "=========================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Production API URL
API_URL="https://api.easyescrow.ai"

# Check API Health
echo -n "API Health: "
if curl -sf "${API_URL}/health" > /dev/null 2>&1; then
  echo -e "${GREEN}✅ OK${NC}"
else
  echo -e "${RED}❌ FAILED${NC}"
  echo "   Unable to reach ${API_URL}/health"
fi

# Check API Status Endpoint
echo -n "API Status: "
if curl -sf "${API_URL}/api/status" > /dev/null 2>&1; then
  echo -e "${GREEN}✅ OK${NC}"
else
  echo -e "${YELLOW}⚠️  WARNING${NC}"
  echo "   Status endpoint not responding"
fi

# Check Database Health (via health endpoint)
echo -n "Database: "
HEALTH_RESPONSE=$(curl -sf "${API_URL}/health" 2>/dev/null || echo "")
if echo "$HEALTH_RESPONSE" | grep -q "database.*ok\|database.*connected"; then
  echo -e "${GREEN}✅ OK${NC}"
elif echo "$HEALTH_RESPONSE" | grep -q "database"; then
  echo -e "${RED}❌ FAILED${NC}"
  echo "   Database connection issue detected"
else
  echo -e "${YELLOW}⚠️  UNKNOWN${NC}"
  echo "   Cannot determine database status"
fi

# Check Redis Health (via health endpoint)
echo -n "Redis: "
if echo "$HEALTH_RESPONSE" | grep -q "redis.*ok\|redis.*connected"; then
  echo -e "${GREEN}✅ OK${NC}"
elif echo "$HEALTH_RESPONSE" | grep -q "redis"; then
  echo -e "${RED}❌ FAILED${NC}"
  echo "   Redis connection issue detected"
else
  echo -e "${YELLOW}⚠️  UNKNOWN${NC}"
  echo "   Cannot determine Redis status"
fi

# Check Recent Logs (if doctl is available)
if command -v doctl &> /dev/null; then
  echo -n "Recent Errors: "
  
  # Note: Replace <app-id> with actual production app ID
  # ERROR_COUNT=$(doctl apps logs <app-id> --type=run --tail=100 2>/dev/null | grep -c "ERROR" || echo "0")
  
  # For now, skip this check if app ID is not configured
  echo -e "${YELLOW}⏸️  SKIPPED${NC}"
  echo "   Configure app ID in script to enable"
  echo "   Command: doctl apps logs <app-id> --type=run --tail=100"
else
  echo -n "Recent Errors: "
  echo -e "${YELLOW}⏸️  SKIPPED${NC}"
  echo "   Install doctl CLI to check application logs"
  echo "   Install: https://docs.digitalocean.com/reference/doctl/how-to/install/"
fi

echo ""
echo "=========================="

# Overall status
if curl -sf "${API_URL}/health" > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Overall Status: HEALTHY${NC}"
  exit 0
else
  echo -e "${RED}❌ Overall Status: UNHEALTHY${NC}"
  echo ""
  echo "Action Items:"
  echo "1. Check DigitalOcean console: Apps → Production → Insights"
  echo "2. View logs: doctl apps logs <app-id> --type=run --tail=50"
  echo "3. Check component status: Apps → Production → Components"
  exit 1
fi

