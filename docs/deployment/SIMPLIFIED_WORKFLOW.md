# Simplified Deployment Workflow

## 📝 Overview

We've simplified the deployment workflow to use **DigitalOcean's native build system** instead of GitHub Actions. This eliminates complexity and network issues.

## 🔄 How It Works Now

### **Automatic Deployment (Staging)**

1. **Push to `staging` branch**
2. **DigitalOcean App Platform automatically:**
   - Detects the push
   - Builds the application using `staging-app.yaml` spec
   - Runs tests
   - Deploys to staging environment
   - All secrets injected from DO environment variables

### **Manual Solana Program Deployment**

If you need to deploy/update the Solana program separately:

```powershell
# Deploy program to devnet
.\scripts\deployment\deploy-program-staging.ps1

# Or deploy using anchor directly
anchor deploy -C Anchor.staging.toml --provider.cluster devnet
```

### **Database Migrations**

DigitalOcean runs migrations automatically via the build command in `staging-app.yaml`:

```yaml
build_command: npm run build && npx prisma generate && npx prisma migrate deploy
```

## ✅ **Why This Is Better**

### **Before (GitHub Actions):**
- ❌ GitHub Actions build workflow (failing with SSL errors)
- ❌ Separate deploy workflow (complex, slow)
- ❌ Artifact management between workflows
- ❌ Manual trigger required for deployment
- ❌ Network issues with Solana CLI installation

### **After (DigitalOcean Native):**
- ✅ Single, automatic deployment on push
- ✅ No SSL/network issues
- ✅ Faster deployments
- ✅ Simpler architecture
- ✅ Built-in rollback support
- ✅ Native health checks and monitoring

## 🔧 **Configuration Files**

- **`staging-app.yaml`** - DigitalOcean App Platform spec
  - All secrets managed via GitHub Secrets → DO environment variables
  - Build commands, health checks, resources defined
  - Safe to commit (no hardcoded secrets)

## 📊 **Monitoring Deployments**

View deployment status:

```bash
# Via doctl CLI
doctl apps list
doctl apps get <app-id>
doctl apps logs <app-id> --follow

# Via DO Dashboard
https://cloud.digitalocean.com/apps
```

## 🚨 **Rollback Process**

DigitalOcean has native rollback support (much simpler than GitHub Actions):

### **Via DigitalOcean Dashboard (Recommended):**
1. Go to https://cloud.digitalocean.com/apps
2. Select your app
3. Click "Deployments" tab
4. Click "⋮" menu on previous deployment
5. Click "Rollback to this deployment"
6. Confirm ✅

### **Via CLI:**
```bash
# List recent deployments
doctl apps deployment list <app-id>

# Rollback to specific deployment
doctl apps deployment rollback <app-id> <deployment-id>

# Verify rollback
doctl apps get <app-id>
```

**Note:** The old GitHub Actions rollback workflow has been removed. DO's native rollback is faster, simpler, and more reliable.

## 📝 **Removed Workflows**

The following GitHub Actions workflows have been **removed**:

- **`build-staging.yml`**
  - **Why:** Failing due to SSL errors with `release.solana.com`
  - **Replaced by:** DigitalOcean native build

- **`deploy-staging.yml`**
  - **Why:** Depends on build workflow, added unnecessary complexity
  - **Replaced by:** DigitalOcean auto-deployment on push

- **`rollback-staging.yml`**
  - **Why:** DigitalOcean has native one-click rollback (faster and simpler)
  - **Replaced by:** `doctl apps deployment rollback` or DO dashboard

### **Remaining Workflows:**

- **`test.yml`** - Still active for PR validation
  - Runs unit tests ✅
  - Runs integration tests ✅
  - On-chain tests commented out (run locally instead)

### **Re-enabling (if needed):**

If you ever need to restore these workflows, retrieve them from git history:

```bash
# View commit that removed them
git log --all --full-history -- .github/workflows/build-staging.yml

# Restore a specific workflow
git checkout <commit-hash> -- .github/workflows/build-staging.yml
```

## 🎯 **Development Workflow**

```bash
# 1. Create feature branch
git checkout -b feature/my-feature

# 2. Make changes, test locally
npm run dev
npm run test

# 3. Commit and push
git add .
git commit -m "feat: my feature"
git push origin feature/my-feature

# 4. Create PR to staging
# ... code review ...

# 5. Merge to staging
# → DigitalOcean automatically builds and deploys! 🚀

# 6. Verify deployment
curl https://staging-api-url.ondigitalocean.app/health
```

## 📚 **Related Documentation**

- [STAGING_SECRETS_MANAGEMENT.md](./STAGING_SECRETS_MANAGEMENT.md)
- [DOCKER_GRACEFUL_RESTART.md](./DOCKER_GRACEFUL_RESTART.md)
- [STAGING_DATABASE_MIGRATION_GUIDE.md](./STAGING_DATABASE_MIGRATION_GUIDE.md)

## ❓ **FAQ**

**Q: What if I need to run tests before deployment?**  
A: Configure `run_command` in `staging-app.yaml` to run tests during build.

**Q: How do I see build logs?**  
A: Use `doctl apps logs <app-id> --type build` or check the DO dashboard.

**Q: Can I still manually trigger deployments?**  
A: Yes! Use `doctl apps create-deployment <app-id>` or the DO dashboard.

**Q: What about the Solana program?**  
A: Deploy separately when needed using local scripts or Anchor CLI directly.

**Q: Is this the same for production?**  
A: Yes, same approach but with `production-app.yaml` and production secrets.

