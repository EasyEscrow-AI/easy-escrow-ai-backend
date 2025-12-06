# 🚨 CREDENTIAL ROTATION REQUIRED - December 6, 2025

**Severity:** HIGH  
**Status:** ACTION REQUIRED  
**Date Detected:** December 6, 2025

---

## 🔴 **Security Issue**

Production credentials were accidentally committed to git in documentation files and pushed to the repository.

**Exposed Credentials:**
1. **Test Page Password:** `06****` (6-digit numeric - REDACTED)
2. **Production API Key:** `0600de78...5d22b` (64-char hex - REDACTED)

**Files Affected:**
- `docs/deployment/PRODUCTION_MONITORING_SETUP.md` (lines 477, 505)
- `docs/tasks/TASK_37_COMPLETION.md` (line 139)

**Git Commits:**
- Exposed in commits: 1355e2d, 489920a (on master branch)
- Fixed in PR #362 (branch: fix/production-cors-and-idl)

---

## ⚠️ **Impact Assessment**

### **Test Page Password (06****)**

**Risk Level:** MEDIUM
- Provides access to production test page at `/test`
- Allows creation/acceptance of real mainnet swaps
- No access to admin functions or backend

**Exposure:**
- Committed to public/private repository
- Visible in git history
- May be cached on GitHub

**Recommendation:** **ROTATE IMMEDIATELY**

### **Production API Key (0600de78...)**

**Risk Level:** HIGH
- Grants zero-fee swap authorization
- Could be abused for unlimited free swaps
- Tracked in `authorized_apps` table (usage auditable)

**Exposure:**
- Committed to public/private repository
- Visible in git history
- May be cached on GitHub

**Recommendation:** **ROTATE IMMEDIATELY**

---

## ✅ **Immediate Actions Required**

### **1. Rotate Test Page Password (5 minutes)**

**Current Password:** `06****` (6-digit numeric - EXPOSED - DO NOT USE)

**Steps:**
1. Generate new strong password:
   ```bash
   # Generate random 6-digit password
   openssl rand -hex 3
   # Or use: https://www.random.org/integers/?num=1&min=100000&max=999999
   ```

2. Update in source code:
   ```typescript
   // File: src/routes/test.routes.ts
   const CORRECT_PASSWORD = 'NEW_PASSWORD_HERE'; // Replace
   ```

3. Update environment variable:
   ```bash
   # Add to .env.production (local)
   TEST_PAGE_PASSWORD=NEW_PASSWORD_HERE
   
   # Set in DigitalOcean Console
   Apps → Production → Settings → Environment Variables
   Key: TEST_PAGE_PASSWORD
   Value: NEW_PASSWORD_HERE
   Type: SECRET
   Scope: RUN_TIME
   ```

4. Deploy updated code
5. Test new password works
6. Document new password in secure location (NOT in git)

### **2. Rotate Production API Key (10 minutes)**

**Current Key:** `0600de78...5d22b` (64-char hex - EXPOSED - DO NOT USE)

**Steps:**
1. Generate new API key:
   ```bash
   openssl rand -hex 32
   ```

2. Hash the new key:
   ```bash
   # Use bcrypt with salt rounds = 12
   # Or use online tool: https://bcrypt-generator.com/
   ```

3. Update database:
   ```sql
   -- Production database
   UPDATE authorized_apps
   SET api_key_hash = '<NEW_HASHED_KEY>',
       updated_at = NOW()
   WHERE id = 1;
   ```

4. Update environment variable:
   ```bash
   # Add to .env.production (local)
   ATOMIC_SWAP_API_KEY=<NEW_RAW_KEY>
   
   # Set in DigitalOcean Console
   Apps → Production → Settings → Environment Variables
   Key: ATOMIC_SWAP_API_KEY
   Value: <NEW_RAW_KEY>
   Type: SECRET
   Scope: RUN_TIME
   ```

5. Test new API key works on /test page
6. Revoke old key by deactivating in database:
   ```sql
   -- Mark old key as inactive (if you kept old record)
   UPDATE authorized_apps
   SET active = false
   WHERE api_key_hash = '<OLD_HASHED_KEY>';
   ```

7. Document new key in secure location (NOT in git)

### **3. Clean Git History (Optional but Recommended)**

**Warning:** This is a destructive operation and requires coordination with team.

**Option A: Rewrite History (Advanced)**
```bash
# Use git-filter-repo to remove sensitive data
pip install git-filter-repo
git filter-repo --invert-paths --path docs/deployment/PRODUCTION_MONITORING_SETUP.md
git filter-repo --invert-paths --path docs/tasks/TASK_37_COMPLETION.md
```

**Option B: Accept Risk**
- Credentials already rotated
- Repository is private
- Monitor for unauthorized usage
- Document incident

**Recommendation:** Option B + monitor closely

---

## 🔐 **Post-Rotation Verification**

### **Test Page Password:**
- [ ] New password set in code
- [ ] New password set in DigitalOcean
- [ ] Deployed to production
- [ ] Tested and working
- [ ] Old password documented as INVALID

### **API Key:**
- [ ] New key generated
- [ ] New key hashed
- [ ] Database updated with new hash
- [ ] Environment variable updated in DO
- [ ] Tested zero-fee authorization working
- [ ] Old key marked inactive in database
- [ ] Usage monitored for 24 hours

---

## 📊 **Monitoring for Unauthorized Usage**

### **Watch for:**

**Test Page:**
```sql
-- Check for suspicious test page activity
SELECT *
FROM swap_transactions
WHERE maker_wallet IN ('B7jiNm8TKvaoad3N36pyDeXMSVPmvHLaXZMDC7udhTfr', '3qYD5LwHSuxwLi2mECzoVEmH2M7aehNjodUZCdmnCwtY')
  AND created_at > '2025-12-06'
ORDER BY created_at DESC;
```

**Zero-Fee API Key:**
```sql
-- Check for zero-fee swap usage
SELECT *
FROM zero_fee_swap_logs
WHERE created_at > '2025-12-06'
ORDER BY created_at DESC;

-- Check authorized app usage
SELECT 
  name,
  COUNT(*) as swaps_count,
  MAX(last_used_at) as last_used
FROM authorized_apps
WHERE active = true
GROUP BY id, name;
```

**Application Logs:**
```bash
# Watch for failed auth attempts
doctl apps logs <app-id> --type=run --follow | grep "test.*auth"

# Watch for API key usage
doctl apps logs <app-id> --type=run --follow | grep "x-atomic-swap-api-key"
```

---

## 📝 **Incident Documentation**

### **Timeline:**

| Time | Event |
|------|-------|
| 2025-12-06 01:55 UTC | Credentials committed to git (Task 37/38 docs) |
| 2025-12-06 02:00 UTC | Pushed to master branch |
| 2025-12-06 02:20 UTC | Cursor bot detected issue |
| 2025-12-06 02:25 UTC | Fixed in PR #362 |
| 2025-12-06 TBD | Credentials rotated |

### **Lessons Learned:**

1. **Never commit actual secrets** to documentation
2. **Always use placeholders** like `<your-password>` or `<from-env:VAR_NAME>`
3. **Review commits** before pushing
4. **Implement pre-commit hooks** to catch secrets
5. **Use secret scanning tools** (e.g., git-secrets, gitleaks)

### **Prevention Measures:**

- [ ] Install git-secrets or gitleaks
- [ ] Add pre-commit hooks to scan for secrets
- [ ] Update documentation guidelines
- [ ] Team training on secrets management
- [ ] Regular security audits

---

## 🎯 **Action Checklist**

### **Immediate (Next 30 Minutes):**
- [ ] Rotate test page password
- [ ] Rotate production API key
- [ ] Update environment variables in DigitalOcean
- [ ] Deploy updated credentials
- [ ] Test new credentials work

### **Short-Term (Next 24 Hours):**
- [ ] Monitor for unauthorized usage
- [ ] Verify old credentials no longer work
- [ ] Document new credentials securely (NOT in git)
- [ ] Review all documentation for other exposed secrets

### **Long-Term (Next Week):**
- [ ] Implement secret scanning in CI/CD
- [ ] Add pre-commit hooks for secret detection
- [ ] Conduct security audit of all documentation
- [ ] Update secrets management policy
- [ ] Team training on security best practices

---

## 📚 **Related Documentation**

- [SECRETS_MANAGEMENT.md](../deployment/SECRETS_MANAGEMENT.md)
- [SECURITY_INCIDENT_CREDENTIAL_EXPOSURE.md](../security/SECURITY_INCIDENT_CREDENTIAL_EXPOSURE.md)
- [Deployment Secrets Security Rules](.cursor/rules/deployment-secrets.mdc)

---

## ✅ **Resolution Status**

- [x] Credentials removed from documentation (PR #362)
- [ ] Credentials rotated in production
- [ ] New credentials tested and working
- [ ] Monitoring for unauthorized usage
- [ ] Incident documented

---

**Priority:** HIGH - Rotate credentials immediately after PR merge.

**Owner:** DevOps/Security Team  
**Due Date:** Within 24 hours of detection

---

**Last Updated:** December 6, 2025  
**Status:** PENDING ROTATION

