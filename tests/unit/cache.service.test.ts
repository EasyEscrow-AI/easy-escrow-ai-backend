import { expect } from 'chai';
import sinon from 'sinon';
import { CacheService } from '../../src/services/cache.service';
import { redisClient } from '../../src/config/redis';

describe('CacheService', () => {
  let cacheService: CacheService;
  let redisStub: sinon.SinonStubbedInstance<typeof redisClient>;

  beforeEach(() => {
    cacheService = new CacheService({ prefix: 'test:', ttl: 3600 });
    
    // Stub Redis client methods
    redisStub = {
      get: sinon.stub(),
      setex: sinon.stub(),
      del: sinon.stub(),
      keys: sinon.stub(),
      exists: sinon.stub(),
      ttl: sinon.stub(),
      incrby: sinon.stub(),
      expire: sinon.stub(),
      mget: sinon.stub(),
      pipeline: sinon.stub(),
    } as any;
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('get', () => {
    it('should get value from cache', async () => {
      const key = 'test-key';
      const value = { id: '123', name: 'Test' };
      
      sinon.stub(redisClient, 'get').resolves(JSON.stringify(value));
      
      const result = await cacheService.get<typeof value>(key);
      
      expect(result).to.deep.equal(value);
    });

    it('should return null if key does not exist', async () => {
      sinon.stub(redisClient, 'get').resolves(null);
      
      const result = await cacheService.get('non-existent-key');
      
      expect(result).to.be.null;
    });

    it('should return null on error', async () => {
      sinon.stub(redisClient, 'get').rejects(new Error('Redis error'));
      
      const result = await cacheService.get('error-key');
      
      expect(result).to.be.null;
    });
  });

  describe('set', () => {
    it('should set value in cache with default TTL', async () => {
      const key = 'test-key';
      const value = { id: '123', name: 'Test' };
      
      const setexStub = sinon.stub(redisClient, 'setex').resolves('OK');
      
      const result = await cacheService.set(key, value);
      
      expect(result).to.be.true;
      expect(setexStub.calledOnce).to.be.true;
      expect(setexStub.firstCall.args[0]).to.equal('test:test-key');
      expect(setexStub.firstCall.args[1]).to.equal(3600);
      expect(setexStub.firstCall.args[2]).to.equal(JSON.stringify(value));
    });

    it('should set value in cache with custom TTL', async () => {
      const key = 'test-key';
      const value = { id: '123' };
      const ttl = 7200;
      
      const setexStub = sinon.stub(redisClient, 'setex').resolves('OK');
      
      await cacheService.set(key, value, ttl);
      
      expect(setexStub.firstCall.args[1]).to.equal(ttl);
    });

    it('should return false on error', async () => {
      sinon.stub(redisClient, 'setex').rejects(new Error('Redis error'));
      
      const result = await cacheService.set('key', { value: 'test' });
      
      expect(result).to.be.false;
    });
  });

  describe('delete', () => {
    it('should delete value from cache', async () => {
      const key = 'test-key';
      
      sinon.stub(redisClient, 'del').resolves(1);
      
      const result = await cacheService.delete(key);
      
      expect(result).to.be.true;
    });

    it('should return false if key was not deleted', async () => {
      sinon.stub(redisClient, 'del').resolves(0);
      
      const result = await cacheService.delete('non-existent');
      
      expect(result).to.be.false;
    });
  });

  describe('exists', () => {
    it('should return true if key exists', async () => {
      sinon.stub(redisClient, 'exists').resolves(1);
      
      const result = await cacheService.exists('test-key');
      
      expect(result).to.be.true;
    });

    it('should return false if key does not exist', async () => {
      sinon.stub(redisClient, 'exists').resolves(0);
      
      const result = await cacheService.exists('non-existent');
      
      expect(result).to.be.false;
    });
  });

  describe('increment', () => {
    it('should increment counter', async () => {
      const key = 'counter';
      
      sinon.stub(redisClient, 'incrby').resolves(5);
      
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
      
      sinon.stub(redisClient, 'mget').resolves(values.map(v => JSON.stringify(v)));
      
      const result = await cacheService.mget<{ id: string }>(keys);
      
      expect(result).to.deep.equal(values);
    });

    it('should handle null values', async () => {
      const keys = ['key1', 'key2'];
      
      sinon.stub(redisClient, 'mget').resolves([JSON.stringify({ id: '1' }), null]);
      
      const result = await cacheService.mget(keys);
      
      expect(result[0]).to.deep.equal({ id: '1' });
      expect(result[1]).to.be.null;
    });
  });

  describe('clear', () => {
    it('should clear all keys with prefix', async () => {
      sinon.stub(redisClient, 'keys').resolves(['test:key1', 'test:key2']);
      sinon.stub(redisClient, 'del').resolves(2);
      
      const result = await cacheService.clear();
      
      expect(result).to.equal(2);
    });
  });
});

