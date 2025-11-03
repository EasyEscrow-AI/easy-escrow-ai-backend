/**
 * Backup Scheduler Service
 * 
 * Schedules automated database backups from within App Platform
 * Runs in DigitalOcean network, bypassing firewall restrictions
 */

import * as cron from 'node-cron';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class BackupScheduler {
  private static instance: BackupScheduler;
  private jobs: any[] = []; // node-cron ScheduledTask type
  private isLeader: boolean = false;

  private constructor() {
    this.determineLeadership();
  }

  static getInstance(): BackupScheduler {
    if (!BackupScheduler.instance) {
      BackupScheduler.instance = new BackupScheduler();
    }
    return BackupScheduler.instance;
  }

  /**
   * Determine if this instance should run cron jobs
   * In App Platform, only the first instance should run scheduled tasks
   */
  private determineLeadership(): void {
    // Check if we're in App Platform
    const hostname = process.env.HOSTNAME || '';
    const dyno = process.env.DYNO || '';
    
    // App Platform instances typically have hostnames like: app-name-xxxx-xxxxx
    // We designate the first alphabetically as leader
    // Alternative: Use Redis/DB for leader election in production
    
    if (process.env.BACKUP_LEADER === 'true') {
      // Explicit leader designation via environment variable
      this.isLeader = true;
      console.log('📍 This instance is designated as backup leader (BACKUP_LEADER=true)');
    } else if (!hostname && !dyno) {
      // Local development - always leader
      this.isLeader = true;
      console.log('📍 Running locally - backup leader enabled');
    } else {
      // In production, only run on first instance
      // This prevents multiple concurrent backups
      this.isLeader = hostname.includes('web-0') || dyno === 'web.1';
      console.log(`📍 Instance: ${hostname || dyno} - Leader: ${this.isLeader}`);
    }
  }

  /**
   * Start weekly backup schedule
   * Runs every Sunday at 2 AM server time
   */
  startWeeklyBackup(): void {
    if (!this.isLeader) {
      console.log('⏭️  Skipping backup scheduler - not leader instance');
      return;
    }

    // Every Sunday at 2 AM
    const job = cron.schedule('0 2 * * 0', async () => {
      await this.executeBackup();
    }, {
      timezone: process.env.TZ || "America/Los_Angeles"
    });

    this.jobs.push(job);
    console.log('📅 Weekly backup scheduled: Every Sunday at 2 AM');
    console.log(`   Timezone: ${process.env.TZ || "America/Los_Angeles"}`);
  }

  /**
   * Start daily backup schedule
   * Runs every day at 2 AM server time
   */
  startDailyBackup(): void {
    if (!this.isLeader) {
      console.log('⏭️  Skipping backup scheduler - not leader instance');
      return;
    }

    // Every day at 2 AM
    const job = cron.schedule('0 2 * * *', async () => {
      await this.executeBackup();
    }, {
      timezone: process.env.TZ || "America/Los_Angeles"
    });

    this.jobs.push(job);
    console.log('📅 Daily backup scheduled: Every day at 2 AM');
    console.log(`   Timezone: ${process.env.TZ || "America/Los_Angeles"}`);
  }

  /**
   * Execute backup command
   */
  private async executeBackup(): Promise<void> {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║         Scheduled Backup Started                          ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log(`\n🚀 Starting backup at ${new Date().toISOString()}`);
    
    try {
      // Run the complete backup command
      const { stdout, stderr } = await execAsync('npm run backup:complete', {
        timeout: 600000, // 10 minute timeout
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer for output
      });

      console.log('\n✅ Backup completed successfully');
      console.log('\n--- Backup Output ---');
      console.log(stdout);
      
      if (stderr && stderr.trim().length > 0) {
        console.warn('\n--- Warnings ---');
        console.warn(stderr);
      }

      console.log('\n╔═══════════════════════════════════════════════════════════╗');
      console.log('║         Backup Summary                                     ║');
      console.log('╚═══════════════════════════════════════════════════════════╝');
      console.log(`✅ Completed at: ${new Date().toISOString()}`);
      console.log('📧 Notification: Success\n');

      // TODO: Send success notification (email, Slack, etc.)
      
    } catch (error: any) {
      console.error('\n❌ Backup failed!');
      console.error('\n--- Error Details ---');
      console.error('Message:', error.message);
      if (error.stdout) {
        console.error('\n--- Partial Output ---');
        console.error(error.stdout);
      }
      if (error.stderr) {
        console.error('\n--- Error Output ---');
        console.error(error.stderr);
      }

      console.log('\n╔═══════════════════════════════════════════════════════════╗');
      console.log('║         Backup Failed                                      ║');
      console.log('╚═══════════════════════════════════════════════════════════╝');
      console.log(`❌ Failed at: ${new Date().toISOString()}`);
      console.log('📧 Notification: Failure\n');

      // TODO: Send failure notification (email, Slack, PagerDuty, etc.)
      // This is critical - backups failing should alert the team
    }
  }

  /**
   * Manually trigger backup (for testing)
   */
  async triggerManualBackup(): Promise<void> {
    console.log('🔧 Manual backup triggered');
    await this.executeBackup();
  }

  /**
   * Stop all scheduled jobs
   */
  stopAll(): void {
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
    console.log('🛑 All backup schedules stopped');
  }

  /**
   * Get scheduler status
   */
  getStatus(): { isLeader: boolean; activeJobs: number } {
    return {
      isLeader: this.isLeader,
      activeJobs: this.jobs.length,
    };
  }
}

// Export singleton instance
export const backupScheduler = BackupScheduler.getInstance();

