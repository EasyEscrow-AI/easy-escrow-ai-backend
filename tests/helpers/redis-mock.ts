/**
 * Redis Mock Helper for Unit Tests
 * 
 * Provides utilities for mocking Redis client in unit tests
 */

import sinon from 'sinon';

export interface MockRedisClient {
  get: sinon.SinonStub;
  set: sinon.SinonStub;
  setex: sinon.SinonStub;
  del: sinon.SinonStub;
  exists: sinon.SinonStub;
  keys: sinon.SinonStub;
  ttl: sinon.SinonStub;
  incrby: sinon.SinonStub;
  incr: sinon.SinonStub;
  expire: sinon.SinonStub;
  mget: sinon.SinonStub;
  pipeline: sinon.SinonStub;
  ping: sinon.SinonStub;
  quit: sinon.SinonStub;
  flushdb: sinon.SinonStub;
  info: sinon.SinonStub;
}

/**
 * Create a mock Redis client with stubbed methods
 */
export function createMockRedisClient(): MockRedisClient {
  return {
    get: sinon.stub(),
    set: sinon.stub(),
    setex: sinon.stub(),
    del: sinon.stub(),
    exists: sinon.stub(),
    keys: sinon.stub(),
    ttl: sinon.stub(),
    incrby: sinon.stub(),
    incr: sinon.stub(),
    expire: sinon.stub(),
    mget: sinon.stub(),
    pipeline: sinon.stub().returns({
      del: sinon.stub().returnsThis(),
      exec: sinon.stub().resolves([]),
    }),
    ping: sinon.stub().resolves('PONG'),
    quit: sinon.stub().resolves(),
    flushdb: sinon.stub().resolves(),
    info: sinon.stub().resolves(''),
  };
}

/**
 * Setup Redis client mock by stubbing the redisClient proxy getter
 * This allows tests to intercept Redis operations
 */
export function setupRedisMock(mockClient: MockRedisClient, redis: any): void {
  // Stub the proxy's getter to return our mock methods
  const originalGet = redis.get;
  redis.get = function(target: any, prop: string) {
    if (prop in mockClient) {
      const value = (mockClient as any)[prop];
      return typeof value === 'function' ? value.bind(mockClient) : value;
    }
    return originalGet ? originalGet.call(this, target, prop) : undefined;
  };
}

/**
 * Teardown Redis mock
 */
export function teardownRedisMock(): void {
  // Restore will be handled by sinon.restore() in test cleanup
}












