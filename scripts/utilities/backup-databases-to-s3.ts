/**
 * Database Backup to S3 Utility
 * 
 * Creates actual PostgreSQL dumps and uploads them to S3
 * 
 * Usage:
 *   ts-node scripts/utilities/backup-databases-to-s3.ts [options]
 * 
 * Options:
 *   --database <id>       Backup specific database by ID (comma-separated for multiple)
 *   --all                 Backup all databases
 *   --dry-run             Show what would be backed up without executing
 *   --compression <1-9>   Compression level (default: 1 for fastest)
 *   --output-dir <path>   Local temp directory (default: temp/db-backups)
 *   --s3-prefix <path>    S3 path prefix (default: database-backups/YYYY/MM/DD)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);

interface BackupOptions {
  databases?: string[];
  all?: boolean;
  dryRun?: boolean;
  compression?: number;
  outputDir?: string;
  s3Prefix?: string;
}

interface BackupResult {
  timestamp: string;
  databases: Array<{
    id: string;
    name: string;
    status: 'success' | 'failed';
    size?: number;
    s3Key?: string;
    error?: string;
  }>;
}

class DatabaseBackupS3 {
  private doApiToken: string;
  private s3Bucket?: string;
  private s3AccessKey?: string;
  private s3SecretKey?: string;
  private s3Region: string = 'us-east-1';
  private baseUrl = 'https://api.digitalocean.com/v2';

  constructor() {
    const doToken = process.env.DIGITAL_OCEAN_API_KEY;
    if (!doToken) {
      throw new Error('DIGITAL_OCEAN_API_KEY environment variable not set');
    }
    this.doApiToken = doToken;

    // Load S3 credentials
    this.s3Bucket = process.env.AWS_S3_BUCKET;
    this.s3AccessKey = process.env.AWS_S3_KEY;
    this.s3SecretKey = process.env.AWS_S3_SECRET;
    this.s3Region = process.env.AWS_S3_REGION || 'us-east-1';

    if (!this.s3Bucket || !this.s3AccessKey || !this.s3SecretKey) {
      throw new Error('AWS S3 credentials not configured. Set AWS_S3_BUCKET, AWS_S3_KEY, and AWS_S3_SECRET in .env');
    }
  }

  /**
   * Make authenticated request to DigitalOcean API
   */
  private async apiRequest(method: string, endpoint: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}${endpoint}`;
      const parsedUrl = new URL(url);
      
      const options: https.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        headers: {
          'Authorization': `Bearer ${this.doApiToken}`,
          'Content-Type': 'application/json',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(`API Error ${res.statusCode}: ${data}`));
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  /**
   * List all database clusters
   */
  async listDatabases(): Promise<any[]> {
    try {
      const response = await this.apiRequest('GET', '/databases');
      return response.databases || [];
    } catch (error) {
      console.error('Error listing databases:', error);
      return [];
    }
  }

  /**
   * Get database connection details
   */
  async getDatabase(databaseId: string): Promise<any> {
    try {
      const response = await this.apiRequest('GET', `/databases/${databaseId}`);
      return response.database;
    } catch (error) {
      throw new Error(`Failed to get database details: ${error}`);
    }
  }

  /**
   * Upload file to AWS S3
   */
  async uploadToS3(filePath: string, s3Key: string): Promise<void> {
    try {
      console.log(`    ☁️  Uploading to S3: s3://${this.s3Bucket}/${s3Key}`);

      // Read file
      const fileContent = fs.readFileSync(filePath);
      const contentType = 'application/octet-stream';
      const contentLength = Buffer.byteLength(fileContent);

      // Create AWS Signature V4
      const now = new Date();
      const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
      const dateStamp = amzDate.substr(0, 8);

      // Create canonical request
      const canonicalUri = `/${s3Key}`;
      const canonicalQuerystring = '';
      const payloadHash = crypto.createHash('sha256').update(fileContent).digest('hex');
      const canonicalHeaders = 
        `content-type:${contentType}\n` +
        `host:${this.s3Bucket}.s3.${this.s3Region}.amazonaws.com\n` +
        `x-amz-content-sha256:${payloadHash}\n` +
        `x-amz-date:${amzDate}\n`;
      const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

      const canonicalRequest = 
        `PUT\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

      // Create string to sign
      const algorithm = 'AWS4-HMAC-SHA256';
      const credentialScope = `${dateStamp}/${this.s3Region}/s3/aws4_request`;
      const stringToSign = 
        `${algorithm}\n${amzDate}\n${credentialScope}\n` +
        crypto.createHash('sha256').update(canonicalRequest).digest('hex');

      // Calculate signature
      const getSignatureKey = (key: string, dateStamp: string, regionName: string, serviceName: string) => {
        const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
        const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
        const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
        const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
        return kSigning;
      };

      const signingKey = getSignatureKey(this.s3SecretKey!, dateStamp, this.s3Region, 's3');
      const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

      // Create authorization header
      const authorizationHeader = 
        `${algorithm} Credential=${this.s3AccessKey}/${credentialScope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`;

      // Upload to S3
      return new Promise((resolve, reject) => {
        const options: https.RequestOptions = {
          hostname: `${this.s3Bucket}.s3.${this.s3Region}.amazonaws.com`,
          port: 443,
          path: canonicalUri,
          method: 'PUT',
          headers: {
            'Content-Type': contentType,
            'Content-Length': contentLength,
            'x-amz-date': amzDate,
            'x-amz-content-sha256': payloadHash,
            'Authorization': authorizationHeader,
          },
        };

        const req = https.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              console.log(`    ✅ Uploaded to S3 successfully`);
              resolve();
            } else {
              reject(new Error(`S3 Upload failed: ${res.statusCode} ${data}`));
            }
          });
        });

        req.on('error', reject);
        req.write(fileContent);
        req.end();
      });
    } catch (error) {
      throw new Error(`Failed to upload to S3: ${error}`);
    }
  }

  /**
   * Create database dump using pg_dump
   */
  async createDatabaseDump(
    database: any,
    outputDir: string,
    compression: number
  ): Promise<{ filePath: string; size: number }> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const fileName = `${database.name}-${timestamp}.dump`;
    const filePath = path.join(outputDir, fileName);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    try {
      console.log(`    📦 Creating database dump...`);
      
      // Use pg_dump with separate parameters (safer than URL with embedded credentials)
      // This prevents shell injection and handles special characters in passwords
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
        maxBuffer: 1024 * 1024 * 500, // 500MB buffer
        timeout: 600000, // 10 minute timeout
      });

      const stats = fs.statSync(filePath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      
      console.log(`    ✅ Dump created: ${sizeMB}MB`);
      
      return {
        filePath,
        size: stats.size,
      };
    } catch (error) {
      // Clean up failed dump file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      throw new Error(`Failed to create database dump: ${error}`);
    }
  }

  /**
   * Execute backup
   */
  async executeBackup(options: BackupOptions): Promise<BackupResult> {
    const result: BackupResult = {
      timestamp: new Date().toISOString(),
      databases: [],
    };

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║      Database Backup to S3 Utility                        ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    if (options.dryRun) {
      console.log('🔍 DRY RUN MODE - No backups will be created\n');
    }

    // Determine which databases to backup
    let databasesToBackup: any[] = [];
    if (options.all) {
      databasesToBackup = await this.listDatabases();
    } else if (options.databases && options.databases.length > 0) {
      for (const dbId of options.databases) {
        try {
          const db = await this.getDatabase(dbId);
          databasesToBackup.push(db);
        } catch (error) {
          console.error(`❌ Failed to get database ${dbId}:`, error);
          result.databases.push({
            id: dbId,
            name: 'Unknown',
            status: 'failed',
            error: String(error),
          });
        }
      }
    }

    if (databasesToBackup.length === 0) {
      console.log('⚠️  No databases to backup\n');
      return result;
    }

    console.log('💾 Backing up databases...\n');

    for (const db of databasesToBackup) {
      console.log(`  • ${db.name} (${db.id})`);
      console.log(`    Engine: ${db.engine} ${db.version}`);
      console.log(`    Size: ${db.size}`);

      if (options.dryRun) {
        console.log('    [DRY RUN] Would create dump and upload to S3\n');
        result.databases.push({
          id: db.id,
          name: db.name,
          status: 'success',
        });
        continue;
      }

      let dumpFilePath: string | undefined;
      
      try {
        // Create dump
        const { filePath, size } = await this.createDatabaseDump(
          db,
          options.outputDir || 'temp/db-backups',
          options.compression || 1
        );
        dumpFilePath = filePath;  // Store for cleanup on error

        // Generate S3 key
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const fileName = path.basename(filePath);
        
        const s3Key = options.s3Prefix 
          ? `${options.s3Prefix}/${fileName}`
          : `database-backups/${year}/${month}/${day}/${fileName}`;

        // Upload to S3
        await this.uploadToS3(filePath, s3Key);

        console.log(`    📍 S3 Location: s3://${this.s3Bucket}/${s3Key}\n`);

        // Clean up local file after successful upload
        fs.unlinkSync(filePath);

        result.databases.push({
          id: db.id,
          name: db.name,
          status: 'success',
          size,
          s3Key,
        });
      } catch (error) {
        console.error(`    ❌ Failed: ${error}\n`);
        
        // Clean up failed dump file if it exists
        if (dumpFilePath && fs.existsSync(dumpFilePath)) {
          try {
            fs.unlinkSync(dumpFilePath);
            console.log(`    🧹 Cleaned up failed dump file\n`);
          } catch (cleanupError) {
            // Ignore cleanup errors
          }
        }
        
        result.databases.push({
          id: db.id,
          name: db.name,
          status: 'failed',
          error: String(error),
        });
      }
    }

    return result;
  }
}

// Parse command line arguments
function parseArgs(): BackupOptions {
  const args = process.argv.slice(2);
  const options: BackupOptions = {
    databases: [],
    compression: 1,
    outputDir: 'temp/db-backups',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--database':
        options.databases = args[++i].split(',').map(s => s.trim());
        break;
      case '--all':
        options.all = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--compression':
        options.compression = parseInt(args[++i], 10);
        break;
      case '--output-dir':
        options.outputDir = args[++i];
        break;
      case '--s3-prefix':
        options.s3Prefix = args[++i];
        break;
      case '--help':
        console.log(`
Database Backup to S3 Utility

Usage: ts-node scripts/utilities/backup-databases-to-s3.ts [options]

Options:
  --database <id>       Backup specific database by ID (comma-separated for multiple)
  --all                 Backup all databases
  --dry-run             Show what would be backed up without executing
  --compression <1-9>   Compression level (default: 1 for fastest)
  --output-dir <path>   Local temp directory (default: temp/db-backups)
  --s3-prefix <path>    S3 path prefix (default: database-backups/YYYY/MM/DD)
  --help                Show this help message

Examples:
  # Backup all databases
  ts-node scripts/utilities/backup-databases-to-s3.ts --all

  # Backup specific database
  ts-node scripts/utilities/backup-databases-to-s3.ts --database b0f97f57-f399-4727-8abf-dc741cc9a5d2

  # Dry run
  ts-node scripts/utilities/backup-databases-to-s3.ts --all --dry-run

  # Custom compression level (higher = better compression but slower)
  ts-node scripts/utilities/backup-databases-to-s3.ts --all --compression 3
        `);
        process.exit(0);
        break;
    }
  }

  return options;
}

// Main execution
async function main() {
  try {
    const options = parseArgs();
    const backup = new DatabaseBackupS3();

    // Execute backup
    const result = await backup.executeBackup(options);

    // Summary
    const successfulDbs = result.databases.filter(d => d.status === 'success').length;
    const failedDbs = result.databases.filter(d => d.status === 'failed').length;

    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║                    Backup Summary                          ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log(`\nDatabases: ${successfulDbs} succeeded, ${failedDbs} failed`);
    console.log(`Timestamp: ${result.timestamp}\n`);

    // Exit with error if any backups failed
    if (failedDbs > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { DatabaseBackupS3, BackupOptions, BackupResult };

