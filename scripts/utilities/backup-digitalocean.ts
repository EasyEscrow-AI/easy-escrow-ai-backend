/**
 * DigitalOcean Backup Utility with AWS S3 Storage
 * 
 * Creates snapshots/backups of:
 * - App Platform applications
 * - Managed Database clusters
 * - Uploads metadata to AWS S3 (optional)
 * 
 * Usage:
 *   ts-node scripts/utilities/backup-digitalocean.ts [options]
 * 
 * Options:
 *   --app <id>        Backup specific app by ID (comma-separated for multiple)
 *   --database <id>   Backup specific database by ID (comma-separated for multiple)
 *   --all-apps        Backup all App Platform apps
 *   --all-databases   Backup all database clusters
 *   --all             Backup everything
 *   --list            List all resources without backing up
 *   --dry-run         Show what would be backed up without executing
 *   --output <path>   Save backup metadata to file (default: temp/backup-metadata.json)
 *   --s3              Upload backup metadata to AWS S3
 *   --s3-path <path>  Custom S3 path (default: backups/YYYY/MM/DD/backup-TIMESTAMP.json)
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface BackupOptions {
  apps?: string[];
  databases?: string[];
  allApps?: boolean;
  allDatabases?: boolean;
  all?: boolean;
  list?: boolean;
  dryRun?: boolean;
  outputPath?: string;
  s3?: boolean;
  s3Path?: string;
}

interface BackupResult {
  timestamp: string;
  apps: Array<{
    id: string;
    name: string;
    status: 'success' | 'failed';
    deploymentId?: string;
    error?: string;
  }>;
  databases: Array<{
    id: string;
    name: string;
    status: 'success' | 'failed';
    backupId?: string;
    error?: string;
  }>;
}

class DigitalOceanBackup {
  private apiToken: string;
  private baseUrl = 'https://api.digitalocean.com/v2';
  private s3Bucket?: string;
  private s3AccessKey?: string;
  private s3SecretKey?: string;
  private s3Region: string = 'us-east-1';

  constructor() {
    const token = process.env.DIGITAL_OCEAN_API_KEY;
    if (!token) {
      throw new Error('DIGITAL_OCEAN_API_KEY environment variable not set');
    }
    this.apiToken = token;

    // Load S3 credentials if available
    this.s3Bucket = process.env.AWS_S3_BUCKET;
    this.s3AccessKey = process.env.AWS_S3_KEY;
    this.s3SecretKey = process.env.AWS_S3_SECRET;
    this.s3Region = process.env.AWS_S3_REGION || 'us-east-1';
  }

  /**
   * Make authenticated request to DigitalOcean API
   */
  private async apiRequest(method: string, endpoint: string, body?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}${endpoint}`;
      const parsedUrl = new URL(url);
      
      const options: https.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
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

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * List all App Platform applications
   */
  async listApps(): Promise<any[]> {
    try {
      const response = await this.apiRequest('GET', '/apps');
      return response.apps || [];
    } catch (error) {
      console.error('Error listing apps:', error);
      return [];
    }
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
   * Get the active/latest deployment for an app
   * This is read-only and doesn't create new deployments
   */
  async getActiveDeployment(appId: string): Promise<any> {
    try {
      console.log(`Getting active deployment for app ${appId}...`);
      const response = await this.apiRequest('GET', `/apps/${appId}/deployments`);
      const deployments = response.deployments || [];
      
      if (deployments.length === 0) {
        throw new Error('No deployments found');
      }
      
      // Get the most recent active deployment
      const activeDeployment = deployments.find((d: any) => d.phase === 'ACTIVE') || deployments[0];
      return activeDeployment;
    } catch (error) {
      throw new Error(`Failed to get app deployment: ${error}`);
    }
  }

  /**
   * Create a database backup
   */
  async createDatabaseBackup(databaseId: string): Promise<any> {
    try {
      console.log(`Creating backup for database ${databaseId}...`);
      const response = await this.apiRequest('POST', `/databases/${databaseId}/backups`, {});
      return response.backup;
    } catch (error) {
      throw new Error(`Failed to create database backup: ${error}`);
    }
  }

  /**
   * Get app details
   */
  async getApp(appId: string): Promise<any> {
    try {
      const response = await this.apiRequest('GET', `/apps/${appId}`);
      return response.app;
    } catch (error) {
      throw new Error(`Failed to get app details: ${error}`);
    }
  }

  /**
   * Get database details
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
    if (!this.s3Bucket || !this.s3AccessKey || !this.s3SecretKey) {
      throw new Error('AWS S3 credentials not configured. Set AWS_S3_BUCKET, AWS_S3_KEY, and AWS_S3_SECRET in .env');
    }

    try {
      console.log(`☁️  Uploading to S3: s3://${this.s3Bucket}/${s3Key}`);

      // Read file
      const fileContent = fs.readFileSync(filePath);
      const contentType = 'application/json';
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

      const signingKey = getSignatureKey(this.s3SecretKey, dateStamp, this.s3Region, 's3');
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
              console.log(`    ✅ Uploaded successfully to S3`);
              console.log(`    📍 Location: s3://${this.s3Bucket}/${s3Key}\n`);
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
   * Display list of resources
   */
  async displayResourceList() {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║         DigitalOcean Resources Inventory                  ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    // List Apps
    console.log('📱 App Platform Applications:');
    console.log('─────────────────────────────────────────────────────────────');
    const apps = await this.listApps();
    
    if (apps.length === 0) {
      console.log('  No apps found');
    } else {
      apps.forEach((app) => {
        console.log(`  • ${app.spec.name}`);
        console.log(`    ID: ${app.id}`);
        console.log(`    Region: ${app.region?.slug || 'N/A'}`);
        console.log(`    Created: ${new Date(app.created_at).toLocaleString()}`);
        console.log(`    Active Deployment: ${app.active_deployment?.id || 'None'}`);
        console.log('');
      });
    }

    // List Databases
    console.log('\n💾 Database Clusters:');
    console.log('─────────────────────────────────────────────────────────────');
    const databases = await this.listDatabases();
    
    if (databases.length === 0) {
      console.log('  No databases found');
    } else {
      databases.forEach((db) => {
        console.log(`  • ${db.name}`);
        console.log(`    ID: ${db.id}`);
        console.log(`    Engine: ${db.engine} ${db.version}`);
        console.log(`    Region: ${db.region}`);
        console.log(`    Size: ${db.size}`);
        console.log(`    Nodes: ${db.num_nodes}`);
        console.log(`    Created: ${new Date(db.created_at).toLocaleString()}`);
        console.log('');
      });
    }

    console.log('─────────────────────────────────────────────────────────────');
    console.log(`\nTotal: ${apps.length} apps, ${databases.length} databases\n`);
  }

  /**
   * Execute backup based on options
   */
  async executeBackup(options: BackupOptions): Promise<BackupResult> {
    const result: BackupResult = {
      timestamp: new Date().toISOString(),
      apps: [],
      databases: [],
    };

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║         DigitalOcean Backup Utility                       ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    if (options.dryRun) {
      console.log('🔍 DRY RUN MODE - No backups will be created\n');
    }

    // Determine which apps to backup
    let appsToBackup: any[] = [];
    if (options.all || options.allApps) {
      appsToBackup = await this.listApps();
    } else if (options.apps && options.apps.length > 0) {
      for (const appId of options.apps) {
        try {
          const app = await this.getApp(appId);
          appsToBackup.push(app);
        } catch (error) {
          console.error(`❌ Failed to get app ${appId}:`, error);
          result.apps.push({
            id: appId,
            name: 'Unknown',
            status: 'failed',
            error: String(error),
          });
        }
      }
    }

    // Backup apps
    if (appsToBackup.length > 0) {
      console.log('📱 Backing up App Platform applications...\n');
      
      for (const app of appsToBackup) {
        console.log(`  • ${app.spec.name} (${app.id})`);
        
        if (options.dryRun) {
          console.log('    [DRY RUN] Would record active deployment\n');
          result.apps.push({
            id: app.id,
            name: app.spec.name,
            status: 'success',
          });
        } else {
          try {
            const deployment = await this.getActiveDeployment(app.id);
            console.log(`    ✅ Recorded active deployment: ${deployment.id}\n`);
            result.apps.push({
              id: app.id,
              name: app.spec.name,
              status: 'success',
              deploymentId: deployment.id,
            });
          } catch (error) {
            console.error(`    ❌ Failed:`, error);
            result.apps.push({
              id: app.id,
              name: app.spec.name,
              status: 'failed',
              error: String(error),
            });
          }
        }
      }
    }

    // Determine which databases to backup
    let databasesToBackup: any[] = [];
    if (options.all || options.allDatabases) {
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

    // Backup databases
    if (databasesToBackup.length > 0) {
      console.log('\n💾 Backing up Database clusters...\n');
      
      for (const db of databasesToBackup) {
        console.log(`  • ${db.name} (${db.id})`);
        
        if (options.dryRun) {
          console.log('    [DRY RUN] Would create backup\n');
          result.databases.push({
            id: db.id,
            name: db.name,
            status: 'success',
          });
        } else {
          try {
            const backup = await this.createDatabaseBackup(db.id);
            console.log(`    ✅ Created backup: ${backup.name || backup.id}\n`);
            result.databases.push({
              id: db.id,
              name: db.name,
              status: 'success',
              backupId: backup.id || backup.name,
            });
          } catch (error) {
            console.error(`    ❌ Failed:`, error);
            result.databases.push({
              id: db.id,
              name: db.name,
              status: 'failed',
              error: String(error),
            });
          }
        }
      }
    }

    return result;
  }
}

// Parse command line arguments
function parseArgs(): BackupOptions {
  const args = process.argv.slice(2);
  const options: BackupOptions = {
    apps: [],
    databases: [],
    outputPath: 'temp/backup-metadata.json',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--app':
        options.apps = args[++i].split(',').map(s => s.trim());
        break;
      case '--database':
        options.databases = args[++i].split(',').map(s => s.trim());
        break;
      case '--all-apps':
        options.allApps = true;
        break;
      case '--all-databases':
        options.allDatabases = true;
        break;
      case '--all':
        options.all = true;
        break;
      case '--list':
        options.list = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--output':
        options.outputPath = args[++i];
        break;
      case '--s3':
        options.s3 = true;
        break;
      case '--s3-path':
        options.s3Path = args[++i];
        break;
      case '--help':
        console.log(`
DigitalOcean Backup Utility

Usage: ts-node scripts/utilities/backup-digitalocean.ts [options]

Options:
  --app <id>          Backup specific app by ID (comma-separated for multiple)
  --database <id>     Backup specific database by ID (comma-separated for multiple)
  --all-apps          Backup all App Platform apps
  --all-databases     Backup all database clusters
  --all               Backup everything (apps and databases)
  --list              List all resources without backing up
  --dry-run           Show what would be backed up without executing
  --output <path>     Save backup metadata to file (default: temp/backup-metadata.json)
  --s3                Upload backup metadata to AWS S3
  --s3-path <path>    Custom S3 path (default: backups/YYYY/MM/DD/backup-TIMESTAMP.json)
  --help              Show this help message

Examples:
  # List all resources
  ts-node scripts/utilities/backup-digitalocean.ts --list

  # Backup specific app
  ts-node scripts/utilities/backup-digitalocean.ts --app abc123def456

  # Backup all apps (dry run)
  ts-node scripts/utilities/backup-digitalocean.ts --all-apps --dry-run

  # Backup everything
  ts-node scripts/utilities/backup-digitalocean.ts --all

  # Backup specific app and database
  ts-node scripts/utilities/backup-digitalocean.ts --app abc123 --database xyz789

  # Backup everything and upload to S3
  ts-node scripts/utilities/backup-digitalocean.ts --all --s3

  # Backup with custom S3 path
  ts-node scripts/utilities/backup-digitalocean.ts --all --s3 --s3-path production/backup-20251103.json
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
    const backup = new DigitalOceanBackup();

    // If list mode, just display resources and exit
    if (options.list) {
      await backup.displayResourceList();
      return;
    }

    // Execute backup
    const result = await backup.executeBackup(options);

    // Save metadata if not dry run
    if (!options.dryRun && options.outputPath) {
      const outputDir = path.dirname(options.outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      fs.writeFileSync(options.outputPath, JSON.stringify(result, null, 2));
      console.log(`\n💾 Backup metadata saved to: ${options.outputPath}`);

      // Upload to S3 if requested
      if (options.s3) {
        try {
          // Generate S3 path
          let s3Key = options.s3Path;
          if (!s3Key) {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const timestamp = now.toISOString().replace(/[:.]/g, '-').replace(/T/, '_').slice(0, -5);
            s3Key = `backups/${year}/${month}/${day}/backup-${timestamp}.json`;
          }

          await backup.uploadToS3(options.outputPath, s3Key);
          
          // Clean up local metadata file after successful S3 upload
          try {
            fs.unlinkSync(options.outputPath);
            console.log('   🧹 Cleaned up local backup file\n');
          } catch (cleanupError) {
            console.warn('   ⚠️  Warning: Could not clean up local file:', cleanupError);
          }
        } catch (error) {
          console.error('\n❌ Failed to upload to S3:', error);
          console.log('   Backup metadata is still saved locally at:', options.outputPath);
          process.exit(1);
        }
      }
    }

    // Summary
    const successfulApps = result.apps.filter(a => a.status === 'success').length;
    const failedApps = result.apps.filter(a => a.status === 'failed').length;
    const successfulDbs = result.databases.filter(d => d.status === 'success').length;
    const failedDbs = result.databases.filter(d => d.status === 'failed').length;

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                    Backup Summary                          ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log(`\nApps:      ${successfulApps} succeeded, ${failedApps} failed`);
    console.log(`Databases: ${successfulDbs} succeeded, ${failedDbs} failed`);
    console.log(`\nTimestamp: ${result.timestamp}\n`);

    // Exit with error if any backups failed
    if (failedApps > 0 || failedDbs > 0) {
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

export { DigitalOceanBackup, BackupOptions, BackupResult };

