# 🧹 Docker Fresh Start - Quick Reference

## Common Commands

```bash
# Complete fresh start (removes all data)
npm run docker:fresh

# Fresh start but keep data
npm run docker:fresh:keep-data

# Fresh start with sample data
npm run docker:fresh:seed

# Quick cleanup only
npm run docker:clean
```

## Direct Script Usage

### PowerShell (Windows)
```powershell
.\scripts\docker-fresh-start.ps1           # Full fresh start
.\scripts\docker-fresh-start.ps1 -KeepData  # Keep data
.\scripts\docker-fresh-start.ps1 -Seed      # With sample data
```

### Bash (Linux/Mac)
```bash
./scripts/docker-fresh-start.sh              # Full fresh start
./scripts/docker-fresh-start.sh --keep-data  # Keep data
./scripts/docker-fresh-start.sh --seed       # With sample data
```

## When to Use What

| Problem | Solution |
|---------|----------|
| Old code still running | `npm run docker:fresh` |
| Old IDL file | `npm run docker:fresh` |
| Stale config | `npm run docker:fresh:keep-data` |
| Bad dependencies | `npm run docker:fresh` |
| Database corrupted | `npm run docker:fresh` |
| Redis stale cache | `npm run docker:fresh` |
| Want test data | `npm run docker:fresh:seed` |
| Minor code change | `npm run docker:rebuild` |

## What Gets Cleaned

- ✅ All containers
- ✅ All Docker images
- ✅ Docker build cache
- ✅ node_modules
- ✅ dist/
- ✅ src/generated/
- ✅ npm cache
- ✅ Database (optional)
- ✅ Redis (optional)

## Time Estimates

- **Full fresh start:** ~5-8 min
- **Keep data:** ~4-7 min
- **Regular rebuild:** ~1.5-2.5 min

## Verification

```bash
# Check services
docker compose ps

# Check logs
docker compose logs backend | tail -n 20

# Test API
curl http://localhost:3000/health

# Test database
docker compose exec backend npx prisma db pull

# Test Redis
docker compose exec redis redis-cli PING
```

## Expected Healthy Output

```
NAME                   STATUS          PORTS
easyescrow-backend     Up (healthy)    0.0.0.0:3000->3000/tcp
easyescrow-postgres    Up (healthy)    0.0.0.0:5432->5432/tcp
easyescrow-redis       Up (healthy)    0.0.0.0:6379->6379/tcp
```

## Common Scenarios

### Scenario 1: Code Changes Not Working
```bash
npm run docker:fresh:keep-data
# ✅ Fresh code, data preserved
```

### Scenario 2: Switching Branches
```bash
git checkout feature/new-feature
npm run docker:fresh
# ✅ Complete fresh build
```

### Scenario 3: Dependency Update
```bash
npm install package@latest
npm run docker:fresh:keep-data
# ✅ Fresh build with new deps
```

### Scenario 4: Demo Preparation
```bash
npm run docker:fresh:seed
# ✅ Clean system with data
```

## Troubleshooting

### Still seeing old code?
1. Check `.dockerignore` exists
2. Verify `target/idl/escrow.json` is current
3. Run: `docker system df` to check disk space

### Services not healthy?
```bash
docker compose logs -f
docker compose ps
```

### Port already in use?
```powershell
# Windows
Get-NetTCPConnection -LocalPort 3000 | Stop-Process

# Linux/Mac
lsof -ti:3000 | xargs kill
```

## Full Documentation

See [docs/DOCKER_CACHE_ELIMINATION.md](docs/DOCKER_CACHE_ELIMINATION.md) for complete guide.

---

**💡 Tip:** Use `docker:fresh:keep-data` during development to save time while still getting fresh builds!

