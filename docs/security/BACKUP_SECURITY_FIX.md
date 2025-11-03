# Security Fix: Shell Injection Vulnerability in Backup Scripts

## 🔒 Vulnerability Details

**Severity**: High  
**Type**: Command Injection / Shell Injection  
**Affected**: `backup-databases-to-s3.ts`, `backup-databases-docker.ps1`  
**Fixed**: November 3, 2025

### Description

The backup scripts were constructing PostgreSQL connection URLs by directly interpolating database credentials into shell commands. This created two security issues:

1. **Command Injection**: If database parameters contained shell metacharacters, they could be used to inject arbitrary commands
2. **Connection Failures**: Passwords with special characters (e.g., `@`, `:`, `&`, `?`) would cause URL parsing errors and connection failures

### Vulnerable Code

**Before (VULNERABLE)**:
```typescript
// ❌ UNSAFE: Direct string interpolation in shell command
const connectionUrl = `postgresql://${database.connection.user}:${database.connection.password}@${database.connection.host}:${database.connection.port}/${database.connection.database}?sslmode=require`;

const command = `pg_dump -Fc -Z${compression} "${connectionUrl}" -f "${filePath}"`;

await execAsync(command);
```

### Attack Scenario

If a database password contained shell metacharacters:
```
Password: mypass`whoami`@123
```

The resulting command would be:
```bash
pg_dump -Fc -Z1 "postgresql://user:mypass`whoami`@123@host:5432/db?sslmode=require" -f "output.dump"
```

The backticks would execute the `whoami` command, allowing arbitrary code execution.

---

## ✅ Fix Applied

### Secure Implementation

**After (SECURE)**:
```typescript
// ✅ SAFE: Use environment variables for credentials
const command = `pg_dump -Fc -Z${compression} -f "${filePath}"`;

await execAsync(command, {
  env: {
    ...process.env,
    PGHOST: database.connection.host,
    PGPORT: String(database.connection.port),
    PGDATABASE: database.connection.database,
    PGUSER: database.connection.user,
    PGPASSWORD: database.connection.password,
    PGSSLMODE: 'require',
  },
  maxBuffer: 1024 * 1024 * 500,
  timeout: 600000,
});
```

### Why This Is Secure

1. **No Shell Interpolation**: Credentials are passed via environment variables, not shell command strings
2. **PostgreSQL Native Support**: `pg_dump` reads `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` environment variables
3. **Special Characters**: Passwords with special characters work correctly
4. **No URL Encoding Needed**: Direct parameter passing avoids URL encoding issues

---

## 🛡️ Docker Script Fix

**Before (VULNERABLE)**:
```powershell
# ❌ UNSAFE: Password in connection string
$connString = "postgresql://${user}:${password}@${host}:${port}/${db}?sslmode=require"
docker run postgres:15-alpine pg_dump "$connString" -f "/backup/file.dump"
```

**After (SECURE)**:
```powershell
# ✅ SAFE: Pass credentials as environment variables
docker run --rm `
    -e PGHOST=$host `
    -e PGPORT=$port `
    -e PGDATABASE=$db `
    -e PGUSER=$user `
    -e PGPASSWORD=$password `
    -e PGSSLMODE=require `
    postgres:15-alpine `
    pg_dump -Fc -Z1 -f "/backup/file.dump"
```

---

## 📊 Impact Assessment

### Before Fix

| Risk | Level | Description |
|------|-------|-------------|
| **Command Injection** | High | Attacker with DB access could execute arbitrary commands |
| **Special Characters** | Medium | Passwords with special chars would fail |
| **URL Encoding** | Low | Some characters needed percent-encoding |

### After Fix

| Security Measure | Status |
|------------------|--------|
| **Command Injection** | ✅ Eliminated |
| **Special Characters** | ✅ Handled correctly |
| **URL Encoding** | ✅ Not needed |
| **PostgreSQL Best Practice** | ✅ Using official env vars |

---

## 🔍 How to Verify Fix

### Test with Special Characters

Create a test database password with special characters:
```
P@ssw0rd!#$%^&*(){}[]|;':"<>?,./`~
```

**Before Fix**: Would fail or potentially execute injected commands  
**After Fix**: Works correctly ✅

### Test Backup

```bash
# Run backup with fixed code
npm run backup:db-dumps

# Should complete successfully with any password
✅ Dump created: X.XXmb
✅ Uploaded to S3 successfully
```

---

## 🚨 Mitigation for Previous Versions

If you were using the vulnerable version:

### Immediate Actions

1. **Audit Database Passwords**
   - Check if any passwords contained shell metacharacters
   - Review backup logs for suspicious activity
   - Check database audit logs for unexpected commands

2. **Rotate Credentials**
   - Change database passwords (use safe characters if needed)
   - Rotate API keys
   - Update `.env` files

3. **Update Code**
   - Pull latest changes from this PR
   - Verify fix is applied
   - Test backup process

### Prevention

1. **Code Review**: Always review code that constructs shell commands
2. **Static Analysis**: Use linters that detect shell injection
3. **Environment Variables**: Prefer env vars over command-line arguments for sensitive data
4. **Input Validation**: Validate and sanitize all user inputs

---

## 📚 Related Security Best Practices

### General Command Execution

**DO** ✅:
```typescript
// Use environment variables
await execAsync('command', {
  env: { VAR: value }
});

// Use parameterized commands
await execAsync('command', ['arg1', 'arg2']);

// Use dedicated libraries
const { Client } = require('pg');
const client = new Client({ ... });
```

**DON'T** ❌:
```typescript
// Don't interpolate into shell commands
await execAsync(`command ${userInput}`);

// Don't build connection URLs with credentials
const url = `postgres://${user}:${pass}@host/db`;

// Don't use eval or similar
eval(`code ${userInput}`);
```

### PostgreSQL Connections

**Recommended Order**:
1. **Environment Variables** (most secure)
   - `PGHOST`, `PGUSER`, `PGPASSWORD`, etc.
   
2. **Configuration File** (secure if file permissions are correct)
   - `.pgpass` file with proper permissions (0600)
   
3. **Connection Object** (programmatic)
   - Using PostgreSQL client library
   
4. **Connection URL** (avoid with user input)
   - Only if credentials are hardcoded and trusted

---

## 🔗 References

- [PostgreSQL Environment Variables](https://www.postgresql.org/docs/current/libpq-envars.html)
- [OWASP Command Injection](https://owasp.org/www-community/attacks/Command_Injection)
- [pg_dump Documentation](https://www.postgresql.org/docs/current/app-pgdump.html)
- [Docker Environment Variables](https://docs.docker.com/engine/reference/commandline/run/#env)

---

## ✅ Checklist

After applying this fix:

- [x] Update `backup-databases-to-s3.ts`
- [x] Update `backup-databases-docker.ps1`
- [x] Test with special characters in password
- [x] Verify backups complete successfully
- [x] Update documentation
- [x] Security advisory created
- [ ] Notify team of fix
- [ ] Test in staging environment
- [ ] Deploy to production

---

**Status**: ✅ Fixed and Verified  
**Version**: 1.0.0  
**Date**: November 3, 2025

---

## 📝 Commit Message

```
fix(security): Prevent shell injection in database backup scripts

SECURITY FIX: Command injection vulnerability in pg_dump execution

The backup scripts were constructing PostgreSQL connection URLs by
directly interpolating database credentials into shell commands.
This could allow command injection if credentials contained shell
metacharacters and caused failures with special characters.

Changes:
- Use PostgreSQL environment variables (PGHOST, PGUSER, PGPASSWORD)
- Remove connection URL string interpolation
- Fix both TypeScript and PowerShell Docker scripts
- Add security advisory documentation

Impact:
- Eliminates command injection risk
- Supports passwords with special characters
- Follows PostgreSQL best practices

Affected files:
- scripts/utilities/backup-databases-to-s3.ts
- scripts/utilities/backup-databases-docker.ps1

References:
- PostgreSQL libpq environment variables
- OWASP Command Injection prevention
```

