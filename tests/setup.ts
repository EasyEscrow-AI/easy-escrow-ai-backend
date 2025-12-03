/**
 * Jest Test Setup
 * 
 * This file runs before all tests to set up the test environment.
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Suppress logs during tests

// Mock console methods to reduce noise in test output
global.console = {
  ...console,
  log: jest.fn(), // Mock console.log
  debug: jest.fn(), // Mock console.debug
  info: jest.fn(), // Mock console.info
  warn: jest.fn(), // Mock console.warn
  // Keep error for important messages
};

// Set longer timeout for async operations
jest.setTimeout(30000);

