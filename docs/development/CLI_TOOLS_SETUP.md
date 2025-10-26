# CLI Tools Setup Guide

Quick guide to install required CLI tools for DigitalOcean deployment.

## Required Tools

1. **doctl** - DigitalOcean CLI
2. **psql** - PostgreSQL Client
3. **redis-cli** - Redis Client

## Windows Installation

### Option 1: Automated Script (Recommended)

Run the automated installation script:

```powershell
# Run as Administrator
cd C:\websites\VENTURE\easy-escrow-ai-backend
.\scripts\digitalocean\install-cli-tools-windows.ps1
```

This will:
- Install Chocolatey (if needed)
- Install doctl
- Install PostgreSQL client (psql)
- Install Redis client (redis-cli)
- Verify all installations

### Option 2: Manual Installation

#### Install doctl

**Via Chocolatey**:
```powershell
choco install doctl
```

**Manual Download**:
1. Download from: https://github.com/digitalocean/doctl/releases
2. Download `doctl-X.X.X-windows-amd64.zip`
3. Extract and add to PATH

#### Install psql

**Via Chocolatey**:
```powershell
choco install postgresql16
```

**Manual Download**:
1. Download from: https://www.postgresql.org/download/windows/
2. Run installer
3. Select "Command Line Tools" only (if you don't need the full server)

#### Install redis-cli

**Via Chocolatey**:
```powershell
choco install redis-64
```

**Manual Download**:
1. Download from: https://github.com/tporadowski/redis/releases
2. Download `Redis-x64-X.X.X.zip`
3. Extract and add to PATH

## Verification

After installation, verify all tools are available:

```powershell
# Check doctl
doctl version

# Check psql
psql --version

# Check redis-cli
redis-cli --version
```

## Authentication

### doctl Authentication

1. Generate API token:
   - Go to: https://cloud.digitalocean.com/account/api/tokens
   - Click "Generate New Token"
   - Name: `easyescrow-deploy`
   - Scopes: Read & Write
   - Copy the token

2. Authenticate:
```powershell
doctl auth init
# Paste your API token when prompted
```

3. Verify:
```powershell
doctl account get
```

## Troubleshooting

### "Command not found" after installation

- **Solution**: Close and reopen PowerShell to refresh environment variables
- Or manually refresh: 
  ```powershell
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
  ```

### Chocolatey install fails

- **Solution**: Run PowerShell as Administrator
- Or install tools manually using the links above

### psql connects to local database

- **Solution**: Always use full connection strings:
  ```powershell
  psql "postgresql://user:pass@host:port/dbname?sslmode=require"
  ```

## Next Steps

Once all tools are installed:

1. ✅ Verify installations
2. ✅ Authenticate doctl
3. → Continue with [DigitalOcean Setup](./DIGITALOCEAN_SETUP.md)
4. → Deploy with Task 34

---

**Last Updated**: October 14, 2025

