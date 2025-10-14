import { expect } from 'chai';
import sinon from 'sinon';
import { QueueService, BaseJobData } from '../../src/services/queue.service';
import Bull, { Queue, Job } from 'bull';

describe('QueueService', () => {
  let queueService: QueueService;
  let bullQueueStub: sinon.SinonStubbedInstance<Queue>;

  interface TestJobData extends BaseJobData {
    testField: string;
  }

  beforeEach(() => {
    // Stub Bull Queue constructor
    bullQueueStub = {
      add: sinon.stub(),
      addBulk: sinon.stub(),
      process: sinon.stub(),
      getJob: sinon.stub(),
      getFailed: sinon.stub(),
      getCompleted: sinon.stub(),
      getActive: sinon.stub(),
      getWaiting: sinon.stub(),
      getDelayed: sinon.stub(),
      getWaitingCount: sinon.stub(),
      getActiveCount: sinon.stub(),
      getCompletedCount: sinon.stub(),
      getFailedCount: sinon.stub(),
      getDelayedCount: sinon.stub(),
      isPaused: sinon.stub(),
      clean: sinon.stub(),
      pause: sinon.stub(),
      resume: sinon.stub(),
      close: sinon.stub(),
      on: sinon.stub(),
    } as any;

    sinon.stub(Bull.prototype, 'constructor' as any).returns(bullQueueStub);
    
    queueService = new QueueService<TestJobData>({
      name: 'test-queue',
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('addJob', () => {
    it('should add a job to the queue', async () => {
      const jobData: TestJobData = {
        id: 'job-123',
        type: 'test',
        timestamp: Date.now(),
        testField: 'value',
      };

      const mockJob = { id: 'job-123', data: jobData } as Job<TestJobData>;
      
      // Access the underlying queue and stub its add method
      const queue = queueService.getQueue();
      sinon.stub(queue, 'add').resolves(mockJob);

      const result = await queueService.addJob(jobData);

      expect(result).to.deep.equal(mockJob);
    });

    it('should add job with custom options', async () => {
      const jobData: TestJobData = {
        id: 'job-456',
        type: 'test',
        timestamp: Date.now(),
        testField: 'value',
      };

      const options = {
        priority: 1,
        delay: 5000,
      };

      const mockJob = { id: 'job-456', data: jobData, opts: options } as any;
      
      const queue = queueService.getQueue();
      const addStub = sinon.stub(queue, 'add').resolves(mockJob);

      await queueService.addJob(jobData, options);

      expect(addStub.calledOnce).to.be.true;
      const callArgs = addStub.firstCall.args[1];
      expect(callArgs).to.include(options);
    });
  });

  describe('addBulkJobs', () => {
    it('should add multiple jobs to the queue', async () => {
      const jobs = [
        {
          data: {
            id: 'job-1',
            type: 'test',
            timestamp: Date.now(),
            testField: 'value1',
          } as TestJobData,
        },
        {
          data: {
            id: 'job-2',
            type: 'test',
            timestamp: Date.now(),
            testField: 'value2',
          } as TestJobData,
        },
      ];

      const mockJobs = jobs.map((j) => ({ id: j.data.id, data: j.data })) as Job<TestJobData>[];
      
      const queue = queueService.getQueue();
      sinon.stub(queue, 'addBulk').resolves(mockJobs);

      const result = await queueService.addBulkJobs(jobs);

      expect(result).to.have.lengthOf(2);
    });
  });

  describe('getJob', () => {
    it('should get a job by ID', async () => {
      const jobId = 'job-123';
      const mockJob = { id: jobId, data: {} } as Job<TestJobData>;
      
      const queue = queueService.getQueue();
      sinon.stub(queue, 'getJob').resolves(mockJob);

      const result = await queueService.getJob(jobId);

      expect(result).to.equal(mockJob);
    });

    it('should return null if job not found', async () => {
      const queue = queueService.getQueue();
      sinon.stub(queue, 'getJob').resolves(null);

      const result = await queueService.getJob('non-existent');

      expect(result).to.be.null;
    });
  });

  describe('removeJob', () => {
    it('should remove a job from the queue', async () => {
      const jobId = 'job-123';
      const mockJob = {
        id: jobId,
        remove: sinon.stub().resolves(),
      } as any;
      
      const queue = queueService.getQueue();
      sinon.stub(queue, 'getJob').resolves(mockJob);

      await queueService.removeJob(jobId);

      expect(mockJob.remove.calledOnce).to.be.true;
    });
  });

  describe('getFailedJobs', () => {
    it('should get failed jobs', async () => {
      const mockJobs = [
        { id: 'failed-1', data: {} },
        { id: 'failed-2', data: {} },
      ] as Job<TestJobData>[];
      
      const queue = queueService.getQueue();
      sinon.stub(queue, 'getFailed').resolves(mockJobs);

      const result = await queueService.getFailedJobs();

      expect(result).to.have.lengthOf(2);
    });
  });

  describe('retryJob', () => {
    it('should retry a failed job', async () => {
      const jobId = 'failed-job';
      const mockJob = {
        id: jobId,
        retry: sinon.stub().resolves(),
      } as any;
      
      const queue = queueService.getQueue();
      sinon.stub(queue, 'getJob').resolves(mockJob);

      await queueService.retryJob(jobId);

      expect(mockJob.retry.calledOnce).to.be.true;
    });
  });

  describe('getMetrics', () => {
    it('should return queue metrics', async () => {
      const queue = queueService.getQueue();
      sinon.stub(queue, 'getWaitingCount').resolves(5);
      sinon.stub(queue, 'getActiveCount').resolves(2);
      sinon.stub(queue, 'getCompletedCount').resolves(100);
      sinon.stub(queue, 'getFailedCount').resolves(3);
      sinon.stub(queue, 'getDelayedCount').resolves(1);
      sinon.stub(queue, 'isPaused').resolves(false);

      const metrics = await queueService.getMetrics();

      expect(metrics).to.deep.equal({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
        delayed: 1,
        paused: false,
      });
    });
  });

  describe('pause and resume', () => {
    it('should pause the queue', async () => {
      const queue = queueService.getQueue();
      const pauseStub = sinon.stub(queue, 'pause').resolves();

      await queueService.pause();

      expect(pauseStub.calledOnce).to.be.true;
    });

    it('should resume the queue', async () => {
      const queue = queueService.getQueue();
      const resumeStub = sinon.stub(queue, 'resume').resolves();

      await queueService.resume();

      expect(resumeStub.calledOnce).to.be.true;
    });
  });

  describe('cleanOldJobs', () => {
    it('should clean old jobs', async () => {
      const queue = queueService.getQueue();
      const cleanStub = sinon.stub(queue, 'clean').resolves([]);

      await queueService.cleanOldJobs(86400000);

      expect(cleanStub.calledTwice).to.be.true; // Called for completed and failed
    });
  });

  describe('close', () => {
    it('should close the queue connection', async () => {
      const queue = queueService.getQueue();
      const closeStub = sinon.stub(queue, 'close').resolves();

      await queueService.close();

      expect(closeStub.calledOnce).to.be.true;
    });
  });
});

