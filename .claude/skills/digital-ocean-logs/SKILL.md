---
name: digital-ocean-logs
description: Fetch and analyze server logs from DigitalOcean App Platform. Use when debugging production issues, checking error logs, or investigating deployment failures. Supports easyescrow-api, nftswap-gg, and other DO apps.
allowed-tools: Bash, Read
---

# DigitalOcean Logs Skill

Fetch runtime and deployment logs from DigitalOcean App Platform apps.

## Available Apps

| Short Name | Full App Name | App ID | Component |
|------------|---------------|--------|-----------|
| easyescrow-backend | easyescrow-backend-production | `a6e6452b-1ec6-4316-82fe-e4069d089b49` | api |
| easyescrow-staging | easyescrow-backend-staging | `ea13cdbb-c74e-40da-a0eb-6c05b0d0432d` | api-staging |
| easyescrow-frontend | easyescrow-frontend-production | `26b10833-0b7f-4c80-b4d6-be71c4513e79` | easyescrow-api |
| nftswap-gg | nftswap-gg | `77e46321-1661-4faa-b257-9c8db2d604fa` | backend, frontend |
| datasales | datasales-prod-frontend | `038c152b-f1a8-421b-b97d-a3340ea19667` | datasales-website |

## Usage (PowerShell - Windows)

```powershell
# List all apps
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

## Requirements

- `DIGITAL_OCEAN_API_KEY` must be set in `.env`
- `curl` and `jq` available in PATH
