# Docker Cache Elimination Guide

## Problem

Docker caching can cause persistent issues where old code, configurations, or data continue to be served despite making changes:

- **Old compiled JavaScript** from cached build layers
- **Stale IDL files** from previous Anchor builds
- **Outdated configurations** in environment variables
- **Cached npm packages** with wrong versions
- **Old database records** (agreements, transactions)
- **Stale Redis cache** data
- **Docker build cache** serving old layers

## Solution: Complete Fresh Start

We've created comprehensive scripts that perform a **nuclear cleanup** of all Docker-related cache and data, ensuring a completely fresh build.

## Quick Start

### Full Fresh Start (Removes All Data)

```bash
# PowerShell (Windows)
npm run docker:fresh

# Or directly
.\scripts\docker-fresh-start.ps1

# Bash (Linux/Mac)
./scripts/docker-fresh-start.sh
```

This will:
1. Stop and remove all containers
2. **Remove all volumes** (database + Redis data)
3. Remove all Docker images
4. Clean local build artifacts (node_modules, dist, src/generated)
5. Clear npm and Docker build caches
6. Rebuild everything from scratch with `--no-cache`
7. Start services and wait for health checks
8. Run database migrations

### Fresh Start but Keep Data

If you want to eliminate cache issues but preserve your database and Redis data:

```bash
# PowerShell (Windows)
npm run docker:fresh:keep-data

# Or directly
.\scripts\docker-fresh-start.ps1 -KeepData

# Bash (Linux/Mac)
./scripts/docker-fresh-start.sh --keep-data
```

### Fresh Start with Sample Data

To start fresh and seed the database with sample data:

```bash
# PowerShell (Windows)
npm run docker:fresh:seed

# Or directly
.\scripts\docker-fresh-start.ps1 -Seed

# Bash (Linux/Mac)
./scripts/docker-fresh-start.sh --seed
```

## What Gets Cleaned?

### Docker Artifacts
- ✅ All containers (stopped and removed)
- ✅ All volumes (optional - database and Redis data)
- ✅ All project images
- ✅ All dangling images
- ✅ Docker build cache

### Local Artifacts
- ✅ `node_modules/` - Force fresh npm install
- ✅ `dist/` - Compiled JavaScript removed
- ✅ `src/generated/` - Generated Prisma client and Anchor IDL
- ✅ npm cache - `npm cache clean --force`

### Data (Optional)
- ✅ PostgreSQL database (all tables, records)
- ✅ Redis cache (all keys)
- ✅ Old agreements and transactions

## Script Options

### PowerShell (Windows)

```powershell
.\scripts\docker-fresh-start.ps1 [OPTIONS]

Options:
  -KeepData         Keep database and Redis volumes
  -Seed             Run database seed after migrations
  -SkipMigrations   Skip database migrations (not recommended)
```

**Examples:**
```powershell
# Complete fresh start
.\scripts\docker-fresh-start.ps1

# Keep data but refresh code
.\scripts\docker-fresh-start.ps1 -KeepData

# Fresh start with seeded data
.\scripts\docker-fresh-start.ps1 -Seed

# Keep data and seed
.\scripts\docker-fresh-start.ps1 -KeepData -Seed
```

### Bash (Linux/Mac)

```bash
./scripts/docker-fresh-start.sh [OPTIONS]

Options:
  --keep-data        Keep database and Redis volumes
  --seed             Run database seed after migrations
  --skip-migrations  Skip database migrations (not recommended)
  --help             Show help message
```

**Examples:**
```bash
# Complete fresh start
./scripts/docker-fresh-start.sh

# Keep data but refresh code
./scripts/docker-fresh-start.sh --keep-data

# Fresh start with seeded data
./scripts/docker-fresh-start.sh --seed

# Keep data and seed
./scripts/docker-fresh-start.sh --keep-data --seed
```

## NPM Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run docker:fresh` | Complete fresh start (removes all data) |
| `npm run docker:fresh:keep-data` | Fresh start but keep database/Redis |
| `npm run docker:fresh:seed` | Fresh start and seed database |
| `npm run docker:clean` | Quick cleanup (down, remove volumes/images) |
| `npm run docker:rebuild` | Standard rebuild (with cache) |
| `npm run docker:rebuild:backend` | Rebuild backend only (with cache) |

## When to Use Each Option

### Use Full Fresh Start When:
- ❌ Old code is still running despite changes
- ❌ IDL changes aren't being picked up
- ❌ Environment variable changes aren't working
- ❌ Dependency updates aren't taking effect
- ❌ Database schema is corrupted or inconsistent
- ❌ Redis cache has stale data causing issues
- ❌ "It works on my machine but not in Docker"

### Use Keep Data When:
- ✅ You want to test code changes without losing data
- ✅ You have important test data in the database
- ✅ You're debugging a specific issue without needing fresh data
- ✅ You want faster restart times

### Use Regular Rebuild When:
- ✅ Minor code changes only
- ✅ No dependency updates
- ✅ No schema changes
- ✅ Caching is working correctly

## Process Steps

The script performs these steps in order:

1. **🔍 Check Docker** - Verify Docker is running
2. **📦 Stop Containers** - Gracefully stop all services
3. **🗑️ Remove Volumes** - Delete database and Redis data (optional)
4. **🖼️ Remove Images** - Delete all project Docker images
5. **🧹 Clean Local Artifacts** - Remove node_modules, dist, generated files
6. **📋 Copy Fresh IDL** - Use latest IDL from target/idl/escrow.json
7. **🏗️ Rebuild Images** - Build with `--no-cache` and `--pull`
8. **🚀 Start Services** - Start all containers
9. **⏳ Wait for Health** - Wait for all services to be healthy
10. **🗄️ Run Migrations** - Apply database migrations (optional)
11. **🌱 Seed Database** - Add sample data (optional)
12. **📊 Status Check** - Show final service status

## Troubleshooting

### Services Not Starting

```bash
# Check logs for errors
docker compose logs -f

# Check specific service
docker compose logs backend

# Check service health
docker compose ps
```

### Migration Errors

```bash
# Run migrations manually
docker compose exec backend npx prisma migrate deploy

# Reset database completely
docker compose exec backend npx prisma migrate reset
```

### Port Already in Use

```bash
# Find and stop conflicting processes
# Windows (PowerShell)
Get-NetTCPConnection -LocalPort 3000,5432,6379 | Select-Object OwningProcess | Stop-Process

# Linux/Mac
lsof -ti:3000,5432,6379 | xargs kill -9
```

### Disk Space Issues

```bash
# Check Docker disk usage
docker system df

# Clean everything (careful!)
docker system prune -a --volumes
```

### Still Seeing Old Code?

1. Verify `.dockerignore` is present (prevents copying old artifacts)
2. Check if local node_modules is being mounted (remove volume mounts)
3. Ensure you're not using cached layers (script uses `--no-cache`)
4. Verify IDL file is up to date at `target/idl/escrow.json`

## Performance Considerations

### Full Fresh Start Time
- **Clean**: ~2-3 minutes
- **Build**: ~3-5 minutes
- **Startup**: ~30-60 seconds
- **Total**: ~5-8 minutes

### Keep Data Time
- **Clean**: ~1-2 minutes
- **Build**: ~3-5 minutes
- **Startup**: ~20-40 seconds
- **Total**: ~4-7 minutes

### Regular Rebuild Time
- **Build**: ~1-2 minutes (with cache)
- **Startup**: ~20-30 seconds
- **Total**: ~1.5-2.5 minutes

## Best Practices

### ✅ DO

- Run fresh start when switching branches
- Use fresh start after dependency updates
- Keep data during active development
- Run fresh start before important testing
- Use regular rebuilds for minor changes

### ❌ DON'T

- Run fresh start every time (unnecessary)
- Forget to back up important data before full fresh start
- Skip migrations unless you know what you're doing
- Force stop Docker processes (use graceful shutdown)

## Docker Compose Integration

The scripts work seamlessly with your existing `docker-compose.yml`:

```yaml
services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        NODE_ENV: production
    # Health checks ensure proper startup
    healthcheck:
      test: ["CMD", "node", "-e", "..."]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
```

## .dockerignore

A comprehensive `.dockerignore` file prevents old artifacts from being copied into builds:

```
node_modules/
dist/
src/generated/
*.log
.env
tests/
docs/
```

See [`.dockerignore`](../.dockerignore) for the complete list.

## Verification

After fresh start, verify everything is working:

```bash
# 1. Check all services are healthy
docker compose ps

# Expected output:
# NAME                   STATUS          PORTS
# easyescrow-backend     Up (healthy)    0.0.0.0:3000->3000/tcp
# easyescrow-postgres    Up (healthy)    0.0.0.0:5432->5432/tcp
# easyescrow-redis       Up (healthy)    0.0.0.0:6379->6379/tcp

# 2. Check backend logs
docker compose logs backend | tail -n 20

# 3. Test health endpoint
curl http://localhost:3000/health

# 4. Test database connection
docker compose exec backend npx prisma db pull

# 5. Test Redis connection
docker compose exec redis redis-cli PING
```

## Integration with CI/CD

For automated builds and testing:

```yaml
# GitHub Actions example
- name: Fresh Docker Build
  run: |
    ./scripts/docker-fresh-start.sh --seed
    npm run test:e2e
```

## Related Documentation

- [Docker Graceful Restart](./DOCKER_GRACEFUL_RESTART.md) - For graceful service restarts
- [Deployment Guide](./DEPLOYMENT_GUIDE.md) - Production deployment
- [Docker Deployment](./DOCKER_DEPLOYMENT.md) - Docker-specific deployment
- [Environment Setup](./ENVIRONMENT_SETUP.md) - Environment configuration

## FAQ

### Q: How often should I run a fresh start?

**A:** Only when you're experiencing cache issues or after major changes:
- Switching branches with different dependencies
- After dependency updates (npm install)
- After schema changes
- When old code persists despite changes
- Before important testing or demos

### Q: Will I lose my data?

**A:** Only if you run without `--keep-data`. By default, yes, all database and Redis data is removed. Use `--keep-data` to preserve data.

### Q: Why is it so slow?

**A:** Fresh starts rebuild everything from scratch without cache, which takes time. Use `--keep-data` for faster rebuilds, or use regular rebuilds (`npm run docker:rebuild`) for minor changes.

### Q: Can I automate this?

**A:** Yes, you can add it to git hooks or CI/CD:

```bash
# .git/hooks/post-checkout
#!/bin/bash
./scripts/docker-fresh-start.sh --keep-data
```

### Q: What if I only want to clean Docker, not local files?

**A:** Use `docker:clean`:

```bash
npm run docker:clean
```

This removes containers, volumes, and images but leaves local files intact.

## Support

If you continue experiencing cache issues after a fresh start:

1. Check `.dockerignore` is present and comprehensive
2. Verify `target/idl/escrow.json` is up to date
3. Ensure no volume mounts are in docker-compose.yml pointing to local directories
4. Check Docker disk space: `docker system df`
5. Try a complete Docker system prune: `docker system prune -a --volumes` (⚠️ affects all Docker projects)

---

**Last Updated:** January 2025  
**Maintained By:** EasyEscrow.ai Team

