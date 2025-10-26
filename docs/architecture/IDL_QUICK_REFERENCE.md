# IDL Management - Quick Reference Card

## 🎯 Quick Commands

### Generate Environment IDL
```bash
# Dev
npm run idl:copy-dev

# Staging
npm run idl:copy-staging

# All environments
npm run idl:copy-all
```

### Sync IDLs to Backend
```bash
npm run idl:sync
```

### Build & Deploy
```bash
# Set environment
$env:NODE_ENV="staging"

# Build
npm run build

# Deploy
npm run staging:deploy
```

## 📋 Program IDs

| Environment | Program ID |
|-------------|------------|
| **Dev** | `4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd` |
| **Staging** | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` |
| **Production** | TBD |

## 🚨 Troubleshooting

### Program ID Mismatch Error
```bash
npm run idl:copy-staging
npm run idl:sync
npm run build
```

### Wrong IDL Loading
```bash
# Check NODE_ENV
echo $env:NODE_ENV

# Clean rebuild
rm -rf dist/
npm run build
```

### After New Program Deployment
```bash
# Update with new program ID
.\scripts\utilities\copy-idl-for-env.ps1 -Environment staging -ProgramId <NEW_ID>
npm run idl:sync
npm run build
npm run staging:deploy
```

## 📁 Key Files

- **IDL Source:** `target/idl/escrow-{env}.json`
- **Backend IDLs:** `src/generated/anchor/escrow-idl-{env}.json`
- **IDL Loader:** `src/utils/idl-loader.ts`
- **Service:** `src/services/escrow-program.service.ts`

## 📖 Full Documentation

- [Complete IDL Management Guide](./IDL_MANAGEMENT.md)
- [Implementation Summary](./ENVIRONMENT_SPECIFIC_IDL_IMPLEMENTATION.md)

