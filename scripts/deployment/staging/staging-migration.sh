#!/bin/bash
#
# STAGING Migration Script
#
# Automated database migration execution with:
# - Pre-migration backup
# - Migration execution with timing
# - Health checks
# - Data integrity verification
# - Result logging
#
# Usage:
#   ./staging-migration.sh [options]
#
# Options:
#   --skip-backup    Skip database backup (not recommended)
#   --skip-health    Skip health checks
#   --skip-tests     Skip data integrity tests
#   --name <name>    Migration name for logging
#

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups/staging}"
LOG_FILE="${LOG_FILE:-./migration-log.txt}"
HEALTH_URL="${HEALTH_URL:-https://staging-api.easyescrow.ai/health}"
SKIP_BACKUP=false
SKIP_HEALTH=false
SKIP_TESTS=false
MIGRATION_NAME="${MIGRATION_NAME:-unnamed}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-backup)
      SKIP_BACKUP=true
      shift
      ;;
    --skip-health)
      SKIP_HEALTH=true
      shift
      ;;
    --skip-tests)
      SKIP_TESTS=true
      shift
      ;;
    --name)
      MIGRATION_NAME="$2"
      shift 2
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Functions
log() {
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo -e "${CYAN}[$timestamp]${NC} $1"
}

log_success() {
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo -e "${GREEN}[$timestamp] ✅ $1${NC}"
  echo "[$timestamp] SUCCESS: $1" >> "$LOG_FILE"
}

log_error() {
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo -e "${RED}[$timestamp] ❌ $1${NC}"
  echo "[$timestamp] ERROR: $1" >> "$LOG_FILE"
}

log_warning() {
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo -e "${YELLOW}[$timestamp] ⚠️  $1${NC}"
  echo "[$timestamp] WARNING: $1" >> "$LOG_FILE"
}

create_backup() {
  if [ "$SKIP_BACKUP" = true ]; then
    log_warning "Skipping database backup (--skip-backup flag set)"
    return 0
  fi

  log "Creating database backup..."
  
  # Ensure backup directory exists
  mkdir -p "$BACKUP_DIR"
  
  # Create backup filename with timestamp
  local backup_file="$BACKUP_DIR/staging-$(date +%Y%m%d-%H%M%S).sql"
  
  # Check if DATABASE_URL is set
  if [ -z "$STAGING_DATABASE_URL" ] && [ -z "$DATABASE_URL" ]; then
    log_error "DATABASE_URL or STAGING_DATABASE_URL not set"
    return 1
  fi
  
  local db_url="${STAGING_DATABASE_URL:-$DATABASE_URL}"
  
  # Parse DATABASE_URL
  # Format: postgresql://user:password@host:port/database
  local user=$(echo "$db_url" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
  local password=$(echo "$db_url" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
  local host=$(echo "$db_url" | sed -n 's/.*@\([^:]*\):.*/\1/p')
  local port=$(echo "$db_url" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
  local database=$(echo "$db_url" | sed -n 's/.*\/\([^?]*\).*/\1/p')
  
  # Execute pg_dump
  export PGPASSWORD="$password"
  
  if pg_dump -h "$host" -p "$port" -U "$user" -d "$database" -f "$backup_file"; then
    log_success "Backup created: $backup_file"
    echo "$backup_file"
    return 0
  else
    log_error "Backup creation failed"
    return 1
  fi
}

run_migration() {
  log "Executing Prisma migrations..."
  
  local start_time=$(date +%s)
  
  if npx prisma migrate deploy; then
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    log_success "Migration completed in ${duration}s"
    return 0
  else
    log_error "Migration execution failed"
    return 1
  fi
}

verify_health() {
  if [ "$SKIP_HEALTH" = true ]; then
    log_warning "Skipping health checks (--skip-health flag set)"
    return 0
  fi

  log "Verifying application health..."
  
  local max_attempts=5
  local attempt=1
  
  while [ $attempt -le $max_attempts ]; do
    log "Health check attempt $attempt/$max_attempts..."
    
    if curl -sf "$HEALTH_URL" > /dev/null; then
      log_success "Health check passed"
      return 0
    fi
    
    if [ $attempt -lt $max_attempts ]; then
      log_warning "Health check failed, retrying in 5s..."
      sleep 5
    fi
    
    attempt=$((attempt + 1))
  done
  
  log_error "Health check failed after $max_attempts attempts"
  return 1
}

run_integrity_tests() {
  if [ "$SKIP_TESTS" = true ]; then
    log_warning "Skipping data integrity tests (--skip-tests flag set)"
    return 0
  fi

  log "Running data integrity tests..."
  
  # Test database connectivity
  if npm run db:test-connection; then
    log_success "Database connection verified"
  else
    log_error "Database connection test failed"
    return 1
  fi
  
  # Run smoke tests if available
  if npm run test:staging:smoke 2>/dev/null; then
    log_success "Smoke tests passed"
  else
    log_warning "Smoke tests not available or failed"
  fi
  
  return 0
}

show_summary() {
  local backup_path=$1
  local duration=$2
  
  echo ""
  echo "========================================"
  echo "Migration Summary"
  echo "========================================"
  echo "Migration Name: $MIGRATION_NAME"
  echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "Duration: ${duration}s"
  echo "Backup: ${backup_path:-SKIPPED}"
  echo "========================================"
  echo ""
}

# Main execution
main() {
  local overall_start=$(date +%s)
  local backup_path=""
  
  echo ""
  echo "========================================"
  echo "STAGING Migration Procedure"
  echo "========================================"
  echo "Migration: $MIGRATION_NAME"
  echo "Started: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "========================================"
  echo ""
  
  # Log start
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting migration: $MIGRATION_NAME" >> "$LOG_FILE"
  
  # Step 1: Create backup
  log "Step 1/4: Creating database backup"
  if backup_path=$(create_backup); then
    log_success "Backup step completed"
  else
    log_error "Backup step failed"
    exit 1
  fi
  echo ""
  
  # Step 2: Run migration
  log "Step 2/4: Running database migrations"
  if run_migration; then
    log_success "Migration step completed"
  else
    log_error "Migration step failed"
    log_error "You can restore from backup: $backup_path"
    exit 1
  fi
  echo ""
  
  # Step 3: Verify health
  log "Step 3/4: Verifying application health"
  if verify_health; then
    log_success "Health verification completed"
  else
    log_error "Health verification failed"
    log_warning "Migration was applied but application may have issues"
    exit 1
  fi
  echo ""
  
  # Step 4: Run integrity tests
  log "Step 4/4: Running data integrity tests"
  if run_integrity_tests; then
    log_success "Integrity tests completed"
  else
    log_error "Integrity tests failed"
    log_warning "Migration was applied but data integrity issues detected"
    exit 1
  fi
  echo ""
  
  # Calculate total duration
  local overall_end=$(date +%s)
  local total_duration=$((overall_end - overall_start))
  
  # Show summary
  show_summary "$backup_path" "$total_duration"
  
  # Log completion
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Migration completed successfully: $MIGRATION_NAME (Duration: ${total_duration}s)" >> "$LOG_FILE"
  
  log_success "Migration procedure completed successfully!"
  echo ""
  echo "Next steps:"
  echo "  1. Monitor application logs for any issues"
  echo "  2. Verify application functionality manually"
  echo "  3. Keep backup for at least 7 days: $backup_path"
  echo ""
}

# Run main function
main "$@"

