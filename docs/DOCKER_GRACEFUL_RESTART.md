# Docker Graceful Restart Rule

## Overview

**ALWAYS use Docker commands for graceful restarts instead of killing processes.** Killing processes directly can cause data corruption, incomplete transactions, and resource cleanup issues.

## Critical Rule

🚫 **NEVER USE:** `pkill`, `taskkill`, `killall`, `kill -9`, or similar process termination commands for backend, database, or Redis services when running in Docker.

✅ **ALWAYS USE:** Docker compose commands for graceful shutdowns and restarts.

## Why This Matters

### Problems with Process Killing
1. **Data Corruption**: PostgreSQL and Redis may not flush data to disk
2. **Incomplete Transactions**: Active database transactions get rolled back unexpectedly
3. **Dirty Shutdown**: Services don't execute cleanup handlers
4. **Orphaned Connections**: Database connections remain open
5. **Cache Inconsistency**: Redis cache may be in inconsistent state
6. **File Locks**: Process locks on files remain, preventing restart
7. **Resource Leaks**: Memory and file handles not properly released

### Benefits of Docker Graceful Restart
1. **Clean Shutdown**: Services receive SIGTERM and execute cleanup
2. **Data Safety**: Databases flush pending writes to disk
3. **Transaction Integrity**: Active transactions properly committed or rolled back
4. **Connection Cleanup**: All connections properly closed
5. **Health Checks**: Docker waits for service health before routing traffic
6. **Dependency Management**: Services restart in correct order (DB → Redis → Backend)

## Restart Commands

### 1. Restart All Services (Recommended)

```bash
# Graceful restart of all services with dependency order
docker compose restart

# Or with specific timeout (default is 10s)
docker compose restart -t 30
```

### 2. Restart Individual Services

```bash
# Restart backend only
docker compose restart backend

# Restart database only
docker compose restart postgres

# Restart Redis only
docker compose restart redis
```

### 3. Restart with Rebuild (After Code Changes)

```bash
# Stop, rebuild, and start backend
docker compose up -d --build backend

# Or rebuild all services
docker compose up -d --build
```

### 4. Full Reset (Nuclear Option)

```bash
# Stop all services
docker compose down

# Start all services fresh
docker compose up -d

# Or with rebuild
docker compose down && docker compose up -d --build
```

### 5. Restart with Logs (For Debugging)

```bash
# Restart and follow logs
docker compose restart backend && docker compose logs -f backend

# Or for all services
docker compose restart && docker compose logs -f
```

## Windows PowerShell Commands

Since this project runs on Windows, use these PowerShell commands:

```powershell
# Check if Docker is running
docker version

# Restart all services gracefully
docker compose restart

# Restart with specific timeout (30 seconds)
docker compose restart -t 30

# Restart backend service only
docker compose restart backend

# Restart with rebuild
docker compose up -d --build

# Full reset
docker compose down
docker compose up -d

# View logs after restart
docker compose logs -f backend
docker compose logs -f postgres
docker compose logs -f redis

# Check service health
docker compose ps
```

## Restart Decision Tree

```
Need to restart?
├─ Code changes?
│  └─ Yes → docker compose up -d --build backend
│  └─ No → Continue...
├─ Configuration changes?
│  └─ Yes → docker compose down && docker compose up -d
│  └─ No → Continue...
├─ Just need to restart?
│  ├─ All services → docker compose restart
│  ├─ Backend only → docker compose restart backend
│  ├─ Database only → docker compose restart postgres
│  └─ Redis only → docker compose restart redis
├─ Services unresponsive?
│  └─ Yes → docker compose down && docker compose up -d
└─ Data corruption suspected?
   └─ Yes → STOP! Backup data first, then investigate
```

## Common Scenarios

### Scenario 1: Backend code changes
```powershell
# Build and restart backend only
docker compose up -d --build backend

# View logs to verify
docker compose logs -f backend
```

### Scenario 2: Environment variable changes
```powershell
# Stop all services
docker compose down

# Start with new environment
docker compose up -d

# Verify all services are healthy
docker compose ps
```

### Scenario 3: Database migration
```powershell
# Restart backend to trigger migrations
docker compose restart backend

# Or run migration explicitly
docker compose exec backend npm run db:migrate:deploy
```

### Scenario 4: Redis cache clear needed
```powershell
# Restart Redis (clears cache)
docker compose restart redis

# Or flush cache without restart
docker compose exec redis redis-cli FLUSHALL
```

### Scenario 5: Services hanging or unresponsive
```powershell
# Force stop and restart (still graceful via Docker)
docker compose down
docker compose up -d

# Check health
docker compose ps
docker compose logs -f
```

## Health Check Verification

After restarting, always verify service health:

```powershell
# Check all services status
docker compose ps

# Expected output:
# NAME                    STATUS                   PORTS
# easyescrow-backend      Up (healthy)             0.0.0.0:3000->3000/tcp
# easyescrow-postgres     Up (healthy)             0.0.0.0:5432->5432/tcp
# easyescrow-redis        Up (healthy)             0.0.0.0:6379->6379/tcp

# Check specific service health (using Node.js built-in http module)
docker compose exec backend node -e "require('http').get('http://localhost:3000/health', (r) => {let d='';r.on('data',c=>d+=c);r.on('end',()=>{console.log(d);process.exit(r.statusCode===200?0:1)})}).on('error',()=>process.exit(1))"

# Check database connectivity
docker compose exec postgres pg_isready -U postgres

# Check Redis connectivity
docker compose exec redis redis-cli ping
```

## Timeout Configuration

The Docker Compose configuration includes appropriate restart timeouts:

- **Backend**: 40s start period, 30s health check interval
- **PostgreSQL**: 10s health check interval, 5 retries
- **Redis**: 10s health check interval, 5 retries

Docker `restart` command default timeout: **10 seconds**

If services need more time:
```powershell
# Increase timeout to 30 seconds
docker compose restart -t 30
```

## Service Dependencies

Docker Compose handles dependency order automatically:

1. **PostgreSQL** starts first (backend depends on it)
2. **Redis** starts second (backend depends on it)
3. **Backend** starts last (depends on both DB and Redis)

On restart, Docker respects these dependencies and waits for health checks.

## npm Scripts (DO NOT USE for Docker)

The following npm scripts are for **local development only**:

```json
"dev": "nodemon",           // ❌ Don't use in Docker
"restart": "pkill..."       // ❌ Don't use in Docker
```

These scripts kill processes directly and should **NEVER** be used when running in Docker.

## Agent Instructions

When the user requests a restart or when services need restarting:

1. **First, check if running in Docker:**
   ```powershell
   docker compose ps
   ```

2. **If services are running in Docker, use Docker commands:**
   ```powershell
   # Standard restart
   docker compose restart backend
   
   # Or full restart
   docker compose restart
   ```

3. **Never suggest or use:**
   - `npm run restart`
   - `pkill node`
   - `taskkill /F /IM node.exe`
   - `killall node`
   - Any direct process termination commands

4. **After restart, verify health:**
   ```powershell
   docker compose ps
   docker compose logs -f backend
   ```

5. **If restart fails, escalate with diagnostics:**
   ```powershell
   docker compose ps
   docker compose logs backend
   docker compose logs postgres
   docker compose logs redis
   ```

## Quick Reference

| Scenario | Command |
|----------|---------|
| Restart all services | `docker compose restart` |
| Restart backend only | `docker compose restart backend` |
| Restart after code change | `docker compose up -d --build backend` |
| Restart after env change | `docker compose down && docker compose up -d` |
| Full reset | `docker compose down && docker compose up -d --build` |
| Check health | `docker compose ps` |
| View logs | `docker compose logs -f backend` |
| Increase timeout | `docker compose restart -t 30` |

## Summary

✅ **DO:**
- Use `docker compose restart` for graceful restarts
- Wait for health checks to pass
- Verify service health after restart
- Use appropriate timeout values
- Follow dependency order

❌ **DON'T:**
- Use `pkill`, `killall`, or `taskkill` on Dockerized services
- Force kill processes with `-9` or `/F` flags
- Ignore health check failures
- Restart services without verifying dependencies
- Use npm scripts that kill processes when running in Docker

---

**Last Updated:** October 16, 2025
**Related Docs:** 
- `docker-compose.yml` - Service configuration
- `docs/DOCKER_DEPLOYMENT.md` - Docker deployment guide
- `docs/TERMINAL_TIMEOUT_POLICY.md` - Timeout policies

