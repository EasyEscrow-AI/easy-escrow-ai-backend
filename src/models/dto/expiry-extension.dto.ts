/**
 * DTOs for Expiry Extension Feature
 */

import { ExpiryPreset } from '../validators/expiry.validator';

/**
 * Request to extend agreement expiry
 */
export interface ExtendExpiryRequestDTO {
  /**
   * Extension duration. Supports multiple formats:
   * - Duration in hours (number 1-24)
   * - Preset string: '1h', '6h', '12h', '24h'
   * - Absolute timestamp (extends to this specific time)
   * 
   * Examples:
   * - 6 (extend by 6 hours)
   * - "12h" (extend by 12 hours)
   * - "2025-11-04T12:00:00Z" (extend to specific time)
   * 
   * Constraints:
   * - New expiry must not exceed 24 hours from now
   * - Agreement must not already be expired
   */
  extension: number | string | ExpiryPreset | Date;
}

/**
 * Response from expiry extension
 */
export interface ExtendExpiryResponseDTO {
  agreementId: string;
  oldExpiry: string;
  newExpiry: string;
  extensionHours: number;
  message: string;
}

