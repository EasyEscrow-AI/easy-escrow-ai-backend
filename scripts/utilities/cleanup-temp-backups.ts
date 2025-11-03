/**
 * Cleanup Temporary Backup Files
 * 
 * Removes old backup files from temp directories that weren't cleaned up
 * 
 * Usage:
 *   ts-node scripts/utilities/cleanup-temp-backups.ts [options]
 * 
 * Options:
 *   --older-than <days>   Remove files older than N days (default: 7)
 *   --dry-run             Show what would be deleted without deleting
 *   --all                 Remove all temp backup files regardless of age
 */

import * as fs from 'fs';
import * as path from 'path';

interface CleanupOptions {
  olderThanDays?: number;
  dryRun?: boolean;
  all?: boolean;
}

class BackupCleanup {
  private tempDirs = [
    'temp/backup-metadata.json',
    'temp/db-backups',
  ];

  /**
   * Delete old files from directory
   */
  cleanDirectory(dirPath: string, options: CleanupOptions): { deleted: number; size: number; files: string[] } {
    const results = {
      deleted: 0,
      size: 0,
      files: [] as string[],
    };

    if (!fs.existsSync(dirPath)) {
      return results;
    }

    // Handle single file
    if (fs.statSync(dirPath).isFile()) {
      const stats = fs.statSync(dirPath);
      const ageInDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);

      if (options.all || (options.olderThanDays && ageInDays > options.olderThanDays)) {
        results.files.push(dirPath);
        results.size += stats.size;
        results.deleted++;

        if (!options.dryRun) {
          fs.unlinkSync(dirPath);
        }
      }

      return results;
    }

    // Handle directory
    const files = fs.readdirSync(dirPath);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);

      if (stats.isDirectory()) {
        // Recursively clean subdirectories
        const subResults = this.cleanDirectory(filePath, options);
        results.deleted += subResults.deleted;
        results.size += subResults.size;
        results.files.push(...subResults.files);
      } else {
        const ageInDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);

        if (options.all || (options.olderThanDays && ageInDays > options.olderThanDays)) {
          results.files.push(filePath);
          results.size += stats.size;
          results.deleted++;

          if (!options.dryRun) {
            fs.unlinkSync(filePath);
          }
        }
      }
    }

    // Remove empty directories
    if (fs.existsSync(dirPath) && fs.readdirSync(dirPath).length === 0 && dirPath !== 'temp') {
      if (!options.dryRun) {
        fs.rmdirSync(dirPath);
      }
    }

    return results;
  }

  /**
   * Execute cleanup
   */
  async execute(options: CleanupOptions) {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║      Temp Backup Files Cleanup Utility                    ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    if (options.dryRun) {
      console.log('🔍 DRY RUN MODE - No files will be deleted\n');
    }

    const criteria = options.all
      ? 'All temp backup files'
      : `Files older than ${options.olderThanDays} days`;

    console.log(`Criteria: ${criteria}\n`);

    let totalDeleted = 0;
    let totalSize = 0;
    const allFiles: string[] = [];

    for (const dir of this.tempDirs) {
      if (fs.existsSync(dir)) {
        console.log(`📁 Checking: ${dir}`);
        
        const results = this.cleanDirectory(dir, options);
        
        if (results.deleted > 0) {
          console.log(`   ✅ ${results.deleted} file(s) - ${(results.size / 1024 / 1024).toFixed(2)}MB\n`);
          totalDeleted += results.deleted;
          totalSize += results.size;
          allFiles.push(...results.files);
        } else {
          console.log(`   ✨ No old files to clean\n`);
        }
      } else {
        console.log(`📁 Checking: ${dir}`);
        console.log(`   ℹ️  Directory doesn't exist\n`);
      }
    }

    // Summary
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║                  Cleanup Summary                           ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log(`\nFiles: ${totalDeleted} ${options.dryRun ? 'would be' : ''} deleted`);
    console.log(`Size: ${(totalSize / 1024 / 1024).toFixed(2)}MB freed\n`);

    if (options.dryRun && allFiles.length > 0) {
      console.log('Files that would be deleted:');
      allFiles.forEach(file => console.log(`  - ${file}`));
      console.log('');
    }

    if (totalDeleted === 0) {
      console.log('✨ All clean! No old backup files found.\n');
    } else if (!options.dryRun) {
      console.log('✅ Cleanup complete!\n');
    }
  }
}

// Parse command line arguments
function parseArgs(): CleanupOptions {
  const args = process.argv.slice(2);
  const options: CleanupOptions = {
    olderThanDays: 7,  // Default: 7 days
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--older-than':
        options.olderThanDays = parseInt(args[++i], 10);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--all':
        options.all = true;
        break;
      case '--help':
        console.log(`
Cleanup Temporary Backup Files

Usage: ts-node scripts/utilities/cleanup-temp-backups.ts [options]

Options:
  --older-than <days>   Remove files older than N days (default: 7)
  --dry-run             Show what would be deleted without deleting
  --all                 Remove all temp backup files regardless of age
  --help                Show this help message

Examples:
  # Preview cleanup (dry run)
  ts-node scripts/utilities/cleanup-temp-backups.ts --dry-run

  # Remove files older than 7 days (default)
  ts-node scripts/utilities/cleanup-temp-backups.ts

  # Remove files older than 1 day
  ts-node scripts/utilities/cleanup-temp-backups.ts --older-than 1

  # Remove all temp backup files
  ts-node scripts/utilities/cleanup-temp-backups.ts --all
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
    const cleanup = new BackupCleanup();
    await cleanup.execute(options);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { BackupCleanup, CleanupOptions };

