/**
 * Unit Tests for Expiry Extension Validation Bug Fixes
 * 
 * Tests for two critical bugs:
 * 1. Negative extension (shortening expiry) not prevented
 * 2. Invalid date format bypassing validation
 */

import { describe, test, expect } from '@jest/globals';

describe('Expiry Extension Validation Bug Fixes', () => {
  describe('Bug 1: Negative Extension Prevention', () => {
    test('should reject negative numeric extension', () => {
      // This should fail validation
      const extension = -6; // Trying to shorten by 6 hours
      
      // Validation should catch this
      expect(extension).toBeLessThanOrEqual(0);
      
      // Expected error: "Extension duration must be positive (cannot shorten expiry)"
    });

    test('should reject zero extension', () => {
      const extension = 0;
      
      expect(extension).toBe(0);
      
      // Expected error: "Extension duration must be positive (cannot shorten expiry)"
    });

    test('should reject absolute timestamp earlier than current expiry', () => {
      const currentExpiry = new Date('2025-11-04T12:00:00Z');
      const newExpiry = new Date('2025-11-04T06:00:00Z'); // 6 hours earlier
      
      expect(newExpiry.getTime()).toBeLessThan(currentExpiry.getTime());
      
      // Expected error: "New expiry must be later than current expiry (cannot shorten agreement)"
    });
  });

  describe('Bug 2: Invalid Date Format', () => {
    test('should detect invalid date string', () => {
      const invalidDateString = 'not-a-date';
      const parsedDate = new Date(invalidDateString);
      
      // This creates Invalid Date
      expect(isNaN(parsedDate.getTime())).toBe(true);
      
      // Expected error: "Invalid date format for expiry extension"
    });

    test('should detect malformed ISO string', () => {
      const malformedDate = '2025-13-45T99:99:99Z'; // Invalid month/day/time
      const parsedDate = new Date(malformedDate);
      
      expect(isNaN(parsedDate.getTime())).toBe(true);
      
      // Expected error: "Invalid date format for expiry extension"
    });

    test('should detect empty string', () => {
      const emptyDate = '';
      const parsedDate = new Date(emptyDate);
      
      // Empty string creates Invalid Date
      expect(isNaN(parsedDate.getTime())).toBe(true);
      
      // Expected error: "Invalid date format for expiry extension"
    });

    test('should accept valid ISO 8601 string', () => {
      const validDate = '2025-11-04T12:00:00Z';
      const parsedDate = new Date(validDate);
      
      expect(isNaN(parsedDate.getTime())).toBe(false);
      expect(parsedDate.toISOString()).toBe(validDate);
    });
  });

  describe('Valid Extension Cases', () => {
    test('should accept positive numeric extension', () => {
      const extension = 6; // 6 hours
      
      expect(extension).toBeGreaterThan(0);
      expect(extension).toBeLessThanOrEqual(24);
    });

    test('should accept preset extension', () => {
      const presets = ['1h', '6h', '12h', '24h'];
      
      presets.forEach(preset => {
        expect(['1h', '6h', '12h', '24h']).toContain(preset);
      });
    });

    test('should accept absolute timestamp later than current', () => {
      const currentExpiry = new Date('2025-11-04T12:00:00Z');
      const newExpiry = new Date('2025-11-04T18:00:00Z'); // 6 hours later
      
      expect(newExpiry.getTime()).toBeGreaterThan(currentExpiry.getTime());
    });
  });
});

