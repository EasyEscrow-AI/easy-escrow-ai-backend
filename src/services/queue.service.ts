import Bull, { Queue, Job, JobOptions, QueueOptions } from 'bull';
import Redis from 'ioredis';
import { config } from '../config';

/**
 * Queue Service
 * 
 * Implements Redis-based job queue system for asynchronous task processing
 * with job priority handling, dead letter queue for failed jobs, and retry mechanisms
 */

export interface BaseJobData {
  id: string;
  type: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface QueueConfig {
  name: string;
  defaultJobOptions?: JobOptions;
  queueOptions?: Partial<QueueOptions>;
}

export class QueueService<T extends BaseJobData = BaseJobData> {
  private queue: Queue<T>;
  private queueName: string;
  private errorCount = 0;
  private lastErrorTime = Date.now();
  private readonly ERROR_LOG_THRESHOLD = 10; // Only log every 10th error
  private readonly ERROR_RESET_INTERVAL = 60000; // Reset count every minute

  constructor(queueConfig: QueueConfig) {
    this.queueName = queueConfig.name;

    const defaultJobOptions: JobOptions = {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 86400, // Keep completed jobs for 24 hours
        count: 1000, // Keep last 1000 completed jobs
      },
      removeOnFail: false, // Keep failed jobs for inspection
      ...queueConfig.defaultJobOptions,
    };

    // Parse Upstash URL for connection details
    const redisConnectionInfo = this.parseRedisUrl(config.redis.url);

    const queueOptions: QueueOptions = {
      // Use createClient pattern to ensure all 3 Bull connections (client, subscriber, bclient) have proper TLS
      createClient: (type: string) => {
        console.log(`[${this.queueName}] Creating ${type} Redis connection`);
        
        if (!redisConnectionInfo) {
          return new Redis(); // localhost fallback
        }

        return new Redis({
          host: redisConnectionInfo.host,
          port: redisConnectionInfo.port,
          username: redisConnectionInfo.username,
          password: redisConnectionInfo.password,
          // Enable TLS for Upstash - empty object is sufficient!
          tls: redisConnectionInfo.isTLS ? {} : undefined,
          // Subscriber needs null (retry forever), others need finite retries
          maxRetriesPerRequest: type === 'subscriber' ? null : 3,
          // Critical for Upstash compatibility
          enableReadyCheck: false,
          enableOfflineQueue: true,
          connectTimeout: 30000,
          keepAlive: 30000,
          commandTimeout: 5000,
          // Retry strategy
          retryStrategy: (times: number) => {
            const delay = Math.min(times * 1000, 30000);
            if (times > 10) {
              console.error(`[${this.queueName}:${type}] Redis connection failed after ${times} attempts`);
              return null;
            }
            console.log(`[${this.queueName}:${type}] Redis retry attempt ${times}, waiting ${delay}ms`);
            return delay;
          },
          // Reconnect on errors
          reconnectOnError: (err: Error) => {
            const targetErrors = /READONLY|ECONNRESET|ETIMEDOUT|EPIPE/;
            if (targetErrors.test(err.message)) {
              console.log(`[${this.queueName}:${type}] Reconnecting due to: ${err.message}`);
              return true;
            }
            return false;
          },
        });
      },
      defaultJobOptions,
      // Optimize for Upstash: reduce polling to minimize costs
      settings: {
        stalledInterval: 300000, // 5 min (reduced from 30s to save costs)
        maxStalledCount: 3,
        guardInterval: 300000, // 5 min (reduced from 5s to save costs)
        retryProcessDelay: 5000,
        drainDelay: 300, // 300ms pause when queue empty (reduced from 5ms)
      },
      ...queueConfig.queueOptions,
    };

    this.queue = new Bull<T>(this.queueName, queueOptions);

    this.setupEventHandlers();
  }

  /**
   * Parse Redis URL using simple string matching (avoids new URL() issues)
   */
  private parseRedisUrl(redisUrl: string): {
    host: string;
    port: number;
    username: string;
    password: string;
    isTLS: boolean;
  } | null {
    if (!redisUrl) {
      return null;
    }

    try {
      // Match pattern: redis[s]://[username]:password@host:port
      const match = redisUrl.match(/^(rediss?):\/\/([^:]+):([^@]+)@([^:]+):(\d+)/);
      if (!match) {
        console.error(`[${this.queueName}] Invalid Redis URL format`);
        return null;
      }

      return {
        isTLS: match[1] === 'rediss',
        username: match[2] || 'default',
        password: match[3],
        host: match[4],
        port: parseInt(match[5], 10),
      };
    } catch (error) {
      console.error(`[${this.queueName}] Error parsing Redis URL:`, error);
      return null;
    }
  }

  /**
   * Setup event handlers for the queue with rate-limited error logging
   */
  private setupEventHandlers(): void {
    this.queue.on('error', (error: Error) => {
      const now = Date.now();
      
      // Reset error count if more than 1 minute has passed
      if (now - this.lastErrorTime > this.ERROR_RESET_INTERVAL) {
        this.errorCount = 0;
      }
      
      this.errorCount++;
      this.lastErrorTime = now;
      
      // Only log every Nth error to prevent log flooding
      // Skip logging for Redis connection errors (EPIPE, ECONNRESET) as they're logged elsewhere
      const isRedisConnError = error.message && (
        error.message.includes('EPIPE') || 
        error.message.includes('ECONNRESET') ||
        error.message.includes('ETIMEDOUT')
      );
      
      if (!isRedisConnError && this.errorCount % this.ERROR_LOG_THRESHOLD === 0) {
        console.error(`Queue ${this.queueName} error (${this.errorCount} errors): ${error.message}`);
      } else if (!isRedisConnError && this.errorCount === 1) {
        // Log first error immediately
        console.error(`Queue ${this.queueName} error:`, error.message);
      }
    });

    this.queue.on('waiting', (jobId: string) => {
      console.log(`Job ${jobId} is waiting in queue ${this.queueName}`);
    });

    this.queue.on('active', (job: Job<T>) => {
      console.log(`Job ${job.id} started in queue ${this.queueName}`);
    });

    this.queue.on('completed', (job: Job<T>, result: any) => {
      console.log(`Job ${job.id} completed in queue ${this.queueName}:`, result);
    });

    this.queue.on('failed', (job: Job<T>, error: Error) => {
      console.error(`Job ${job.id} failed in queue ${this.queueName}:`, error.message);
      this.handleFailedJob(job, error);
    });

    this.queue.on('stalled', (job: Job<T>) => {
      console.warn(`Job ${job.id} stalled in queue ${this.queueName}`);
    });

    this.queue.on('removed', (job: Job<T>) => {
      console.log(`Job ${job.id} removed from queue ${this.queueName}`);
    });
  }

  /**
   * Add a job to the queue
   */
  async addJob(
    data: T,
    options?: JobOptions
  ): Promise<Job<T>> {
    try {
      const job = await this.queue.add(data, {
        jobId: data.id, // Use the data ID as job ID for idempotency
        ...options,
      });

      console.log(`Job ${job.id} added to queue ${this.queueName}`);
      return job;
    } catch (error) {
      console.error(`Error adding job to queue ${this.queueName}:`, error);
      throw error;
    }
  }

  /**
   * Add multiple jobs to the queue in bulk
   */
  async addBulkJobs(
    jobs: Array<{ data: T; options?: JobOptions }>
  ): Promise<Job<T>[]> {
    try {
      const bulkJobs = jobs.map(job => ({
        name: this.queueName,
        data: job.data,
        opts: {
          jobId: job.data.id,
          ...job.options,
        },
      }));

      const addedJobs = await this.queue.addBulk(bulkJobs);
      console.log(`${addedJobs.length} jobs added to queue ${this.queueName}`);
      return addedJobs;
    } catch (error) {
      console.error(`Error adding bulk jobs to queue ${this.queueName}:`, error);
      throw error;
    }
  }

  /**
   * Process jobs from the queue
   */
  process(
    concurrency: number,
    processor: (job: Job<T>) => Promise<any>
  ): void {
    this.queue.process(concurrency, async (job: Job<T>) => {
      console.log(`Processing job ${job.id} in queue ${this.queueName}`);
      
      try {
        const result = await processor(job);
        return result;
      } catch (error) {
        console.error(`Error processing job ${job.id}:`, error);
        throw error;
      }
    });
  }

  /**
   * Get a job by ID
   */
  async getJob(jobId: string): Promise<Job<T> | null> {
    try {
      return await this.queue.getJob(jobId);
    } catch (error) {
      console.error(`Error getting job ${jobId}:`, error);
      return null;
    }
  }

  /**
   * Remove a job from the queue
   */
  async removeJob(jobId: string): Promise<void> {
    try {
      const job = await this.getJob(jobId);
      if (job) {
        await job.remove();
        console.log(`Job ${jobId} removed from queue ${this.queueName}`);
      }
    } catch (error) {
      console.error(`Error removing job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Get failed jobs (Dead Letter Queue)
   */
  async getFailedJobs(start = 0, end = -1): Promise<Job<T>[]> {
    try {
      return await this.queue.getFailed(start, end);
    } catch (error) {
      console.error(`Error getting failed jobs:`, error);
      return [];
    }
  }

  /**
   * Get completed jobs
   */
  async getCompletedJobs(start = 0, end = -1): Promise<Job<T>[]> {
    try {
      return await this.queue.getCompleted(start, end);
    } catch (error) {
      console.error(`Error getting completed jobs:`, error);
      return [];
    }
  }

  /**
   * Get active jobs
   */
  async getActiveJobs(): Promise<Job<T>[]> {
    try {
      return await this.queue.getActive();
    } catch (error) {
      console.error(`Error getting active jobs:`, error);
      return [];
    }
  }

  /**
   * Get waiting jobs
   */
  async getWaitingJobs(): Promise<Job<T>[]> {
    try {
      return await this.queue.getWaiting();
    } catch (error) {
      console.error(`Error getting waiting jobs:`, error);
      return [];
    }
  }

  /**
   * Get delayed jobs
   */
  async getDelayedJobs(): Promise<Job<T>[]> {
    try {
      return await this.queue.getDelayed();
    } catch (error) {
      console.error(`Error getting delayed jobs:`, error);
      return [];
    }
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string): Promise<void> {
    try {
      const job = await this.getJob(jobId);
      if (job) {
        await job.retry();
        console.log(`Job ${jobId} retried in queue ${this.queueName}`);
      }
    } catch (error) {
      console.error(`Error retrying job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Retry all failed jobs
   */
  async retryFailedJobs(): Promise<number> {
    try {
      const failedJobs = await this.getFailedJobs();
      let retriedCount = 0;

      for (const job of failedJobs) {
        try {
          await job.retry();
          retriedCount++;
        } catch (error) {
          console.error(`Failed to retry job ${job.id}:`, error);
        }
      }

      console.log(`Retried ${retriedCount} failed jobs in queue ${this.queueName}`);
      return retriedCount;
    } catch (error) {
      console.error(`Error retrying failed jobs:`, error);
      return 0;
    }
  }

  /**
   * Handle failed job (Dead Letter Queue)
   */
  private async handleFailedJob(job: Job<T>, error: Error): Promise<void> {
    try {
      // Check if job has exhausted all retry attempts
      if (job.attemptsMade >= (job.opts.attempts || 3)) {
        console.error(
          `Job ${job.id} moved to dead letter queue after ${job.attemptsMade} attempts:`,
          error.message
        );

        // Here you could send alerts, log to external service, etc.
        // For now, we just log and keep the failed job in the failed set
      }
    } catch (err) {
      console.error(`Error handling failed job ${job.id}:`, err);
    }
  }

  /**
   * Clean old jobs from the queue
   */
  async cleanOldJobs(grace: number = 86400000): Promise<void> {
    try {
      // Clean completed jobs older than grace period (default 24 hours)
      await this.queue.clean(grace, 'completed');
      // Clean failed jobs older than grace period
      await this.queue.clean(grace, 'failed');
      console.log(`Cleaned old jobs from queue ${this.queueName}`);
    } catch (error) {
      console.error(`Error cleaning old jobs:`, error);
    }
  }

  /**
   * Pause the queue
   */
  async pause(): Promise<void> {
    await this.queue.pause();
    console.log(`Queue ${this.queueName} paused`);
  }

  /**
   * Resume the queue
   */
  async resume(): Promise<void> {
    await this.queue.resume();
    console.log(`Queue ${this.queueName} resumed`);
  }

  /**
   * Get queue metrics
   */
  async getMetrics(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: boolean;
  }> {
    try {
      const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
        this.queue.getWaitingCount(),
        this.queue.getActiveCount(),
        this.queue.getCompletedCount(),
        this.queue.getFailedCount(),
        this.queue.getDelayedCount(),
        this.queue.isPaused(),
      ]);

      return {
        waiting,
        active,
        completed,
        failed,
        delayed,
        paused: isPaused,
      };
    } catch (error) {
      console.error(`Error getting queue metrics:`, error);
      throw error;
    }
  }

  /**
   * Close the queue connection
   */
  async close(): Promise<void> {
    await this.queue.close();
    console.log(`Queue ${this.queueName} closed`);
  }

  /**
   * Get the underlying Bull queue instance
   */
  getQueue(): Queue<T> {
    return this.queue;
  }
}

export default QueueService;

