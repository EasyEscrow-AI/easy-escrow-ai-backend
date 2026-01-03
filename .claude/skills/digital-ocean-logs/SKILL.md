---
name: digital-ocean-logs
description: Fetch and analyze server logs from DigitalOcean App Platform. Use when debugging production issues, checking error logs, or investigating deployment failures. Supports easyescrow-api, nftswap-gg, and other DO apps.
allowed-tools: Bash, Read
---

# DigitalOcean Logs Skill

Fetch runtime and deployment logs from DigitalOcean App Platform apps.

## App Cache

The app list is cached in `apps-cache.json` and auto-refreshes when older than 7 days. This means new apps added to DigitalOcean will be discovered automatically the next time you use the skill after the cache expires.

- **Auto-refresh**: Cache updates automatically after 7 days
- **Manual refresh**: Use `refresh` command to update immediately
- **Check status**: Use `cache-status` to see cache age and contents

## Usage (PowerShell - Windows)

```powershell
# List all apps (live from API)
.\.claude\skills\digital-ocean-logs\do-logs.ps1 list

# Get runtime logs for easyescrow backend (last 100 lines)
.\.claude\skills\digital-ocean-logs\do-logs.ps1 logs easyescrow-backend

# Get logs with custom line count
.\.claude\skills\digital-ocean-logs\do-logs.ps1 logs easyescrow-backend 500

# Get logs for staging
.\.claude\skills\digital-ocean-logs\do-logs.ps1 logs easyescrow-staging 200

# Get deployment/build logs
.\.claude\skills\digital-ocean-logs\do-logs.ps1 deploy-logs easyescrow-backend

# Get logs and filter for errors
.\.claude\skills\digital-ocean-logs\do-logs.ps1 logs easyescrow-backend 500 | Select-String -Pattern "error|exception|failed"

# Force refresh app cache (fetches latest apps from DO)
.\.claude\skills\digital-ocean-logs\do-logs.ps1 refresh

# Check cache status
.\.claude\skills\digital-ocean-logs\do-logs.ps1 cache-status
```

## Common Debugging Patterns

1. **Check for recent errors:**
   ```powershell
   .\.claude\skills\digital-ocean-logs\do-logs.ps1 logs easyescrow-backend 500 | Select-String -Pattern "error|exception|failed"
   ```

2. **Check swap/transaction issues:**
   ```powershell
   .\.claude\skills\digital-ocean-logs\do-logs.ps1 logs easyescrow-backend 1000 | Select-String -Pattern "swap|offer|transaction"
   ```

3. **Check deployment issues:**
   ```powershell
   .\.claude\skills\digital-ocean-logs\do-logs.ps1 deploy-logs easyescrow-backend
   ```

4. **Compare staging vs production:**
   ```powershell
   .\.claude\skills\digital-ocean-logs\do-logs.ps1 logs easyescrow-staging 100
   .\.claude\skills\digital-ocean-logs\do-logs.ps1 logs easyescrow-backend 100
   ```

5. **After adding new apps to DigitalOcean:**
   ```powershell
   .\.claude\skills\digital-ocean-logs\do-logs.ps1 refresh
   ```

## Requirements

- `DIGITAL_OCEAN_API_KEY` must be set in `.env`
- `curl` and `jq` available in PATH
