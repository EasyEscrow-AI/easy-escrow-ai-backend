# Backup Best Practices & Production Guidelines

**Date:** November 3, 2025  
**Status:** ✅ Production Guidelines

---

## Overview

Critical best practices for running backups in production environments, including security considerations, performance optimization, and platform limitations.

---

## 🔒 Security Best Practices

### 1. SSL Certificate Validation

#### ❌ NEVER DO THIS in Production:

```bash
# DANGEROUS - Disables SSL verification
export NODE_TLS_REJECT_UNAUTHORIZED=0

# Or in code
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
```

**Why it's dangerous:**
- Disables all SSL/TLS certificate verification
- Opens vulnerability to man-in-the-middle attacks
- Allows connection to any server with any certificate
- Violates security compliance requirements

#### ✅ Correct Approach:

**For Development (Self-Signed Certificates):**
```typescript
// Only for development/staging with self-signed certs
const dbConfig = {
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: true }  // Strict validation
    : { rejectUnauthorized: false } // Allow self-signed in dev
};
```

**For Production (Managed Databases):**
```typescript
// DigitalOcean, AWS RDS, etc. use proper certificates
const dbConfig = {
  ssl: {
    rejectUnauthorized: true,  // Always validate in production
    ca: fs.readFileSync('/path/to/ca-certificate.crt').toString()  // Optional: specific CA
  }
};
```

**For S3/Spaces:**
```typescript
// AWS SDK handles SSL properly by default
const s3Client = new S3Client({
  region: 'us-east-1',
  // SSL validation is enabled by default
});
```

### 2. Connection String Security

**❌ Don't:**
```bash
# Don't log connection strings
console.log('Connecting to:', DATABASE_URL);

# Don't expose in error messages
throw new Error(`Failed to connect to ${DATABASE_URL}`);
```

**✅ Do:**
```typescript
// Redact sensitive information
const redactedUrl = DATABASE_URL.replace(/:[^:@]+@/, ':****@');
console.log('Connecting to:', redactedUrl);

// Or use structured logging
logger.info('Database connection attempt', {
  host: new URL(DATABASE_URL).hostname,
  database: new URL(DATABASE_URL).pathname.slice(1)
  // Password and username omitted
});
```

---

## 💾 DigitalOcean App Platform Considerations

### Storage Limitations

**Critical Facts:**
- ✅ **Ephemeral filesystem** - Resets after every deployment
- ✅ **2GB limit** - Total filesystem space
- ✅ **No persistent storage** - Files disappear on restart
- ✅ **Read-only after build** - Only build-time writes persist

#### ❌ Don't Store Backups Locally in App Platform:

```typescript
// WRONG - This will be lost on next deployment
const backupPath = '/app/backups/backup.json';
fs.writeFileSync(backupPath, JSON.stringify(data));
```

#### ✅ Always Use External Storage:

```typescript
// CORRECT - Upload to S3/Spaces immediately
fs.writeFileSync('/tmp/backup.json', JSON.stringify(data));
await uploadToS3('/tmp/backup.json', 's3://bucket/backup.json');
fs.unlinkSync('/tmp/backup.json'); // Clean up temp file
```

### Temporary Storage Guidelines

**Use `/tmp` for temporary files:**
```typescript
const tempPath = `/tmp/backup-${Date.now()}.json`;

try {
  // Write temporary file
  fs.writeFileSync(tempPath, JSON.stringify(data));
  
  // Upload to persistent storage
  await uploadToS3(tempPath, s3Key);
  
} finally {
  // Always clean up
  if (fs.existsSync(tempPath)) {
    fs.unlinkSync(tempPath);
  }
}
```

**Why `/tmp`:**
- Only location guaranteed to be writable in App Platform
- Automatically cleaned up by system
- Not counted against 2GB app size limit
- Available across all deployment platforms

---

## 🗃️ Database Backup Optimization

### PostgreSQL Backups with pg_dump

#### Recommended Approach (Compressed)

```bash
# Weekly offsite backup to S3 with compression
pg_dump -Fc -Z1 "$DATABASE_URL" | aws s3 cp - s3://your-bucket/weekly/backup-$(date +%F).dump

# Explanation:
# -Fc: Custom format (binary, compressed, allows selective restore)
# -Z1: Compression level 1 (fastest, good ratio)
# -  : Output to stdout (pipe to S3)
```

**Compression Level Guide:**

| Level | Speed | Ratio | Use Case |
|-------|-------|-------|----------|
| `-Z1` | Fastest | Good | **Recommended** - Daily backups |
| `-Z3` | Fast | Better | Weekly backups |
| `-Z6` | Slower | Best | Monthly archives |
| `-Z9` | Slowest | Maximum | Long-term storage |

#### Why Custom Format (`-Fc`)?

```bash
# Custom format advantages:
# 1. Built-in compression
# 2. Selective table restore
# 3. Parallel restore support
# 4. Smaller file size

pg_dump -Fc -Z1 "$DATABASE_URL" > backup.dump

# Restore entire database
pg_restore -d "$DATABASE_URL" backup.dump

# Restore single table
pg_restore -d "$DATABASE_URL" -t users backup.dump

# Parallel restore (faster)
pg_restore -d "$DATABASE_URL" -j 4 backup.dump
```

#### Alternative: Plain SQL with gzip

```bash
# Plain SQL backup with gzip
pg_dump "$DATABASE_URL" | gzip -1 | aws s3 cp - s3://bucket/backup-$(date +%F).sql.gz

# Explanation:
# gzip -1: Fastest compression
# Good for human-readable SQL if needed
```

### Modern Compression: zstd

**If zstd is available (fastest compression):**

```bash
# Install zstd
sudo apt-get install zstd  # Debian/Ubuntu

# Backup with zstd level 1 (fastest)
pg_dump "$DATABASE_URL" | zstd -1 | aws s3 cp - s3://bucket/backup-$(date +%F).sql.zst

# Restore
aws s3 cp s3://bucket/backup-2025-11-03.sql.zst - | zstd -d | psql "$DATABASE_URL"
```

**Compression Comparison:**

| Method | Speed | Ratio | File Size (1GB DB) |
|--------|-------|-------|-------------------|
| `pg_dump -Fc -Z1` | Fast | Good | ~200MB |
| `gzip -1` | Fast | Good | ~250MB |
| `gzip -6` | Medium | Better | ~150MB |
| `zstd -1` | **Fastest** | **Best** | ~180MB |
| `zstd -3` | Fast | Better | ~150MB |

**Recommendation:** Use `pg_dump -Fc -Z1` (built-in) or `zstd -1` (if available) for best performance.

### Database Backup Script (Enhanced)

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const execAsync = promisify(exec);

async function backupDatabase() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const tempFile = `/tmp/backup-${timestamp}.dump`;
  const s3Key = `database-backups/${new Date().getFullYear()}/${timestamp}.dump`;
  
  try {
    console.log('Starting database backup...');
    
    // Use pg_dump with compression
    await execAsync(
      `pg_dump -Fc -Z1 "${process.env.DATABASE_URL}" -f ${tempFile}`,
      { maxBuffer: 1024 * 1024 * 100 } // 100MB buffer
    );
    
    const stats = fs.statSync(tempFile);
    console.log(`Backup created: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
    
    // Upload to S3
    await uploadToS3(tempFile, s3Key);
    
    console.log('Backup completed successfully');
    
  } catch (error) {
    console.error('Backup failed:', error);
    throw error;
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}
```

---

## 🔌 Connection Management

### S3 SDK Connection Pooling

#### ❌ Don't Create New Clients for Each Request:

```typescript
// WRONG - Creates new connection pool each time
async function uploadFile(file: string) {
  const s3 = new S3Client({ region: 'us-east-1' });
  await s3.send(new PutObjectCommand({...}));
}
```

#### ✅ Reuse Client Instance:

```typescript
// CORRECT - Single client, connection pool managed automatically
const s3Client = new S3Client({ 
  region: 'us-east-1',
  maxAttempts: 3,  // Retry configuration
});

// Reuse for all operations
async function uploadFile(file: string) {
  await s3Client.send(new PutObjectCommand({...}));
}

async function downloadFile(key: string) {
  await s3Client.send(new GetObjectCommand({...}));
}
```

**Why:**
- AWS SDK maintains internal connection pool
- Reusing client prevents connection exhaustion
- Better performance (no handshake overhead)
- Proper resource cleanup

### Database Connection Pooling

```typescript
// Use connection pooling for databases
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                    // Maximum pool size
  idleTimeoutMillis: 30000,   // Close idle connections after 30s
  connectionTimeoutMillis: 2000, // Timeout for getting connection
  ssl: {
    rejectUnauthorized: true  // Always validate SSL
  }
});

// Reuse pool
async function query(sql: string) {
  const client = await pool.connect();
  try {
    return await client.query(sql);
  } finally {
    client.release(); // Return to pool
  }
}
```

---

## ⏱️ Timeouts & Retry Logic

### S3 Operation Timeouts

#### Configure Proper Timeouts:

```typescript
const s3Client = new S3Client({
  region: 'us-east-1',
  requestTimeout: 30000,      // 30s timeout for each request
  maxAttempts: 3,             // Retry up to 3 times
  retryMode: 'adaptive',      // Adaptive retry with backoff
});
```

#### For Native HTTPS Implementation (Our Backup Script):

```typescript
async function uploadToS3WithTimeout(filePath: string, s3Key: string, timeoutMs: number = 60000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`S3 upload timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    
    uploadToS3(filePath, s3Key)
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeout));
  });
}
```

### Exponential Backoff for Retries

```typescript
async function uploadWithRetry(
  filePath: string, 
  s3Key: string, 
  maxRetries: number = 3
): Promise<void> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await uploadToS3WithTimeout(filePath, s3Key, 60000);
      console.log(`Upload succeeded on attempt ${attempt}`);
      return;
      
    } catch (error) {
      lastError = error as Error;
      console.error(`Upload attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries) {
        // Exponential backoff: 2^attempt seconds
        const delayMs = Math.pow(2, attempt) * 1000;
        console.log(`Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  throw new Error(`Upload failed after ${maxRetries} attempts: ${lastError?.message}`);
}
```

### Database Query Timeouts

```typescript
// Set statement timeout
await client.query('SET statement_timeout = 30000'); // 30 seconds

// Or in connection string
const DATABASE_URL = 'postgresql://user:pass@host/db?statement_timeout=30000';

// Or in pool config
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  statement_timeout: 30000,
  query_timeout: 30000,
});
```

---

## 📊 Monitoring & Alerting

### Track Backup Success/Failure

```typescript
interface BackupMetrics {
  timestamp: string;
  duration: number;
  size: number;
  status: 'success' | 'failure';
  error?: string;
}

async function monitoredBackup(): Promise<BackupMetrics> {
  const startTime = Date.now();
  
  try {
    const result = await executeBackup();
    
    return {
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      size: result.size,
      status: 'success'
    };
    
  } catch (error) {
    const metrics: BackupMetrics = {
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      size: 0,
      status: 'failure',
      error: String(error)
    };
    
    // Alert on failure
    await sendAlert('Backup Failed', metrics);
    
    throw error;
  }
}
```

### GitHub Actions Monitoring

```yaml
- name: Backup with Monitoring
  run: |
    if npm run backup:all:s3; then
      echo "✅ Backup succeeded"
      exit 0
    else
      echo "❌ Backup failed"
      # Send alert (Slack, email, etc.)
      curl -X POST $SLACK_WEBHOOK_URL \
        -H 'Content-Type: application/json' \
        -d '{"text":"Backup failed! Check logs."}'
      exit 1
    fi
```

---

## 🚀 Performance Optimization

### Parallel Operations

```typescript
// Backup multiple resources in parallel
async function backupAllResources() {
  const results = await Promise.allSettled([
    backupApps(),
    backupDatabases(),
    backupSpaces()
  ]);
  
  // Check results
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Backup ${index} failed:`, result.reason);
    }
  });
}
```

### Stream Large Files

```typescript
import { createReadStream } from 'fs';
import { Upload } from '@aws-sdk/lib-storage';

async function streamUpload(filePath: string, s3Key: string) {
  const fileStream = createReadStream(filePath);
  
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: 'easyescrow-backups',
      Key: s3Key,
      Body: fileStream
    }
  });
  
  upload.on('httpUploadProgress', (progress) => {
    console.log(`Uploaded: ${progress.loaded} / ${progress.total} bytes`);
  });
  
  await upload.done();
}
```

---

## 🔄 Backup Verification

### Verify Backup Integrity

```typescript
async function verifyBackup(s3Key: string) {
  try {
    // Download backup
    const tempFile = `/tmp/verify-${Date.now()}.dump`;
    await downloadFromS3(s3Key, tempFile);
    
    // Verify it's a valid pg_dump file
    const { stdout } = await execAsync(`pg_restore --list ${tempFile}`);
    
    // Clean up
    fs.unlinkSync(tempFile);
    
    console.log('✅ Backup verified successfully');
    return true;
    
  } catch (error) {
    console.error('❌ Backup verification failed:', error);
    return false;
  }
}
```

### Monthly Restore Tests

```typescript
// Schedule monthly restore test
async function monthlyRestoreTest() {
  const testDbUrl = process.env.TEST_DATABASE_URL;
  const latestBackup = await getLatestBackup();
  
  try {
    console.log('Starting restore test...');
    
    // Download backup
    const tempFile = `/tmp/restore-test.dump`;
    await downloadFromS3(latestBackup.key, tempFile);
    
    // Restore to test database
    await execAsync(`pg_restore -d "${testDbUrl}" ${tempFile}`);
    
    // Verify data
    const result = await queryTestDb('SELECT COUNT(*) FROM users');
    
    console.log(`✅ Restore test passed: ${result.rows[0].count} users restored`);
    
    // Clean up
    fs.unlinkSync(tempFile);
    
  } catch (error) {
    console.error('❌ Restore test failed:', error);
    await sendAlert('Monthly Restore Test Failed', { error });
    throw error;
  }
}
```

---

## 📋 Production Checklist

### Before Going Live

- [ ] **SSL Validation Enabled** - `rejectUnauthorized: true` in production
- [ ] **No Local File Storage** - All backups go to S3/external storage
- [ ] **Connection Pooling Configured** - S3 and database clients reused
- [ ] **Timeouts Set** - 30-60s for S3, 30s for DB queries
- [ ] **Retry Logic Implemented** - Exponential backoff with 3 retries
- [ ] **Compression Enabled** - `pg_dump -Fc -Z1` or `zstd -1`
- [ ] **Monitoring Set Up** - Track success/failure rates
- [ ] **Alerts Configured** - Notify on backup failures
- [ ] **Restore Tested** - Successfully restored from backup
- [ ] **Credentials Secured** - In secret manager, not in code

### Weekly Maintenance

- [ ] Review backup success rate
- [ ] Check S3 storage usage
- [ ] Verify latest backups are valid
- [ ] Clean up old/unnecessary backups
- [ ] Update lifecycle policies if needed

### Monthly Tasks

- [ ] Test full database restore
- [ ] Review and rotate credentials
- [ ] Audit backup retention policies
- [ ] Check backup costs
- [ ] Update documentation

---

## 🎯 Quick Reference

### Database Backup Command

```bash
# Recommended: Custom format with compression
pg_dump -Fc -Z1 "$DATABASE_URL" | aws s3 cp - s3://bucket/backup-$(date +%F).dump

# Alternative: zstd compression (fastest)
pg_dump "$DATABASE_URL" | zstd -1 | aws s3 cp - s3://bucket/backup-$(date +%F).sql.zst
```

### S3 Client Configuration

```typescript
const s3Client = new S3Client({
  region: 'us-east-1',
  requestTimeout: 30000,
  maxAttempts: 3,
  retryMode: 'adaptive'
});
```

### Database Pool Configuration

```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  statement_timeout: 30000,
  ssl: { rejectUnauthorized: true }
});
```

---

## Related Documentation

- [AWS S3 Backup Integration](./AWS_S3_BACKUP_INTEGRATION.md)
- [Complete Backup Guide](./DIGITALOCEAN_BACKUP_GUIDE.md)
- [Backup Quick Start](./BACKUP_QUICK_START.md)
- [PostgreSQL Backup Documentation](https://www.postgresql.org/docs/current/app-pgdump.html)
- [AWS SDK Configuration](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/configuring-the-jssdk.html)

---

**Last Updated:** November 3, 2025  
**Status:** ✅ Production Guidelines

