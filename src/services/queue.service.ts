import Bull, { Queue, Job, JobOptions, QueueOptions } from 'bull';
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

    const queueOptions: QueueOptions = {
      redis: config.redis.url,
      defaultJobOptions,
      settings: {
        stalledInterval: 30000, // Check for stalled jobs every 30 seconds
        maxStalledCount: 3, // Maximum number of times a job can be recovered from stalled state
        guardInterval: 5000, // Poll interval for delayed jobs
        retryProcessDelay: 5000, // Delay before processing the job after a failure
      },
      ...queueConfig.queueOptions,
    };

    this.queue = new Bull<T>(this.queueName, queueOptions);

    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for the queue
   */
  private setupEventHandlers(): void {
    this.queue.on('error', (error: Error) => {
      console.error(`Queue ${this.queueName} error:`, error);
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

