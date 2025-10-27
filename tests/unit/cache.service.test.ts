import { expect } from 'chai';
import sinon from 'sinon';
import { CacheService } from '../../src/services/cache.service';
import * as redis from '../../src/config/redis';

describe('CacheService', () => {
  let cacheService: CacheService;
  let redisClientStub: any;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    // Save original NODE_ENV and set to test
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    
    // Create mock Redis client with all required methods
    redisClientStub = {
      get: sinon.stub(),
      setex: sinon.stub(),
      del: sinon.stub(),
      keys: sinon.stub(),
      exists: sinon.stub(),
      ttl: sinon.stub(),
      incrby: sinon.stub(),
      incr: sinon.stub(),
      expire: sinon.stub(),
      mget: sinon.stub(),
      pipeline: sinon.stub().returns({
        del: sinon.stub().returnsThis(),
        setex: sinon.stub().returnsThis(),
        exec: sinon.stub().resolves([]),
      }),
    };
    
    // Inject mock Redis client into CacheService
    cacheService = new CacheService({ 
      prefix: 'test:', 
      ttl: 3600,
      redisClient: redisClientStub as any
    });
  });

  afterEach(() => {
    // Restore NODE_ENV
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
    sinon.restore();
  });

  describe('get', () => {
    it('should get value from cache', async () => {
      const key = 'test-key';
      const value = { id: '123', name: 'Test' };
      
      redisClientStub.get.resolves(JSON.stringify(value));
      
      const result = await cacheService.get<typeof value>(key);
      
      expect(result).to.deep.equal(value);
    });

    it('should return null if key does not exist', async () => {
      redisClientStub.get.resolves(null);
      
      const result = await cacheService.get('non-existent-key');
      
      expect(result).to.be.null;
    });

    it('should return null on error', async () => {
      redisClientStub.get.rejects(new Error('Redis error'));
      
      const result = await cacheService.get('error-key');
      
      expect(result).to.be.null;
    });
  });

  describe('set', () => {
    it('should set value in cache with default TTL', async () => {
      const key = 'test-key';
      const value = { id: '123', name: 'Test' };
      
      redisClientStub.setex.resolves('OK');
      
      const result = await cacheService.set(key, value);
      
      expect(result).to.be.true;
      expect(redisClientStub.setex.calledOnce).to.be.true;
      expect(redisClientStub.setex.firstCall.args[0]).to.equal('test:test-key');
      expect(redisClientStub.setex.firstCall.args[1]).to.equal(3600);
      expect(redisClientStub.setex.firstCall.args[2]).to.equal(JSON.stringify(value));
    });

    it('should set value in cache with custom TTL', async () => {
      const key = 'test-key';
      const value = { id: '123' };
      const ttl = 7200;
      
      redisClientStub.setex.resolves('OK');
      
      await cacheService.set(key, value, ttl);
      
      expect(redisClientStub.setex.firstCall.args[1]).to.equal(ttl);
    });

    it('should return false on error', async () => {
      redisClientStub.setex.rejects(new Error('Redis error'));
      
      const result = await cacheService.set('key', { value: 'test' });
      
      expect(result).to.be.false;
    });
  });

  describe('delete', () => {
    it('should delete value from cache', async () => {
      const key = 'test-key';
      
      redisClientStub.del.resolves(1);
      
      const result = await cacheService.delete(key);
      
      expect(result).to.be.true;
    });

    it('should return false if key was not deleted', async () => {
      redisClientStub.del.resolves(0);
      
      const result = await cacheService.delete('non-existent');
      
      expect(result).to.be.false;
    });
  });

  describe('exists', () => {
    it('should return true if key exists', async () => {
      redisClientStub.exists.resolves(1);
      
      const result = await cacheService.exists('test-key');
      
      expect(result).to.be.true;
    });

    it('should return false if key does not exist', async () => {
      redisClientStub.exists.resolves(0);
      
      const result = await cacheService.exists('non-existent');
      
      expect(result).to.be.false;
    });
  });

  describe('increment', () => {
    it('should increment counter', async () => {
      const key = 'counter';
      
      redisClientStub.incrby.resolves(5);
      
      const result = await cacheService.increment(key, 2);
      
      expect(result).to.equal(5);
    });
  });

  describe('mget', () => {
    it('should get multiple values', async () => {
      const keys = ['key1', 'key2', 'key3'];
      const values = [
        { id: '1' },
        { id: '2' },
        { id: '3' },
      ];
      
      redisClientStub.mget.resolves(values.map(v => JSON.stringify(v)));
      
      const result = await cacheService.mget<{ id: string }>(keys);
      
      expect(result).to.deep.equal(values);
    });

    it('should handle null values', async () => {
      const keys = ['key1', 'key2'];
      
      redisClientStub.mget.resolves([JSON.stringify({ id: '1' }), null]);
      
      const result = await cacheService.mget(keys);
      
      expect(result[0]).to.deep.equal({ id: '1' });
      expect(result[1]).to.be.null;
    });
  });

  describe('clear', () => {
    it('should clear all keys with prefix', async () => {
      redisClientStub.keys.resolves(['test:key1', 'test:key2']);
      redisClientStub.del.resolves(2); // del returns number of keys deleted
      
      const result = await cacheService.clear();
      
      expect(result).to.equal(2);
    });
  });
});

