# DigitalOcean App Platform Deployment Specs

This directory contains all DigitalOcean App Platform deployment specifications.

## File Organization

### Active Deployment Specs

| File | Environment | Description |
|------|-------------|-------------|
| `staging.yaml` | Staging/Devnet | Active staging environment configuration with pre-deploy validation jobs |
| `production.yaml` | Production/Mainnet | Production environment configuration with jobs |
| `production-no-jobs.yaml` | Production/Mainnet | Alternative production config without pre-deploy jobs |

### Alternative/Legacy Specs

| File | Purpose | Status |
|------|---------|--------|
| `app-staging.yaml` | Legacy staging config | Older version |
| `app-dev.yaml` | Dev environment | Development environment |
| `app-dev-update.yaml` | Dev updates | Development updates |
| `app.yaml` | Generic template | Base template |

## Usage

### Deploying to Staging

```bash
# Validate the spec
npx js-yaml .do/staging.yaml

# Create new app
doctl apps create --spec .do/staging.yaml

# Update existing app
doctl apps update <app-id> --spec .do/staging.yaml
```

### Deploying to Production

```bash
# Validate the spec
npx js-yaml .do/production.yaml

# Create new app (⚠️ PRODUCTION)
doctl apps create --spec .do/production.yaml

# Update existing app
doctl apps update <app-id> --spec .do/production.yaml
```

## Configuration Guidelines

### Security

All deployment specs follow these security rules:
- ✅ Use `${VARIABLE_NAME}` placeholders for secrets
- ✅ Mark sensitive values with `type: SECRET`
- ✅ Never commit actual API keys, private keys, or passwords
- ✅ Store all secrets in DigitalOcean App Platform console

### Environment Variables

Secrets must be configured in DigitalOcean App Platform:
1. Go to App → Settings → Environment Variables
2. Add each secret individually
3. Mark as "Secret" (encrypted)
4. Save and redeploy

### File Structure

Each deployment spec contains:
- **Service configuration**: Build, run, health check settings
- **Pre-deploy jobs**: Tests and migrations that run before deployment
- **Post-deploy workers** (optional): Smoke tests that run after deployment
- **Environment variables**: Both public config and secret placeholders
- **Domains**: Custom domain configuration
- **Alerts**: Notification rules for deployment events

## Related Documentation

- [Staging Deployment Guide](../docs/deployment/STAGING_DEPLOYMENT_GUIDE.md)
- [Production Deployment Guide](../docs/deployment/PRODUCTION_DEPLOYMENT_GUIDE.md)
- [Native CI/CD Pipeline](../docs/deployment/DO_NATIVE_CICD.md)
- [Secrets Management](../docs/SECRETS_MANAGEMENT.md)
- [Deployment Secrets Rule](.cursor/rules/deployment-secrets.mdc)

## Migration from Old Structure

If you're updating scripts or documentation that reference the old file paths:

| Old Path | New Path |
|----------|----------|
| `staging-app.yaml` | `.do/staging.yaml` |
| `production-app.yaml` | `.do/production.yaml` |
| `production-app-no-jobs.yaml` | `.do/production-no-jobs.yaml` |

**Note:** The file `staging-app-with-validation.yaml` was removed as it was obsolete (validation is already in `staging.yaml`).

