/**
 * Expiry Validation Rules
 * 
 * Enforces custom expiry duration constraints for agreements:
 * - Minimum: 5 minutes
 * - Maximum: 24 hours
 * - Default: 5 minutes (when not specified)
 * - Supports both duration and absolute timestamp
 * - Provides preset durations for common use cases
 */

export const EXPIRY_CONSTANTS = {
  // Duration limits in milliseconds
  MIN_DURATION_MS: 5 * 60 * 1000, // 5 minutes
  MAX_DURATION_MS: 24 * 60 * 60 * 1000, // 24 hours
  DEFAULT_DURATION_MS: 5 * 60 * 1000, // 5 minutes (default when not specified)

  // Duration limits in hours (for convenience)
  MIN_DURATION_HOURS: 5 / 60, // 0.0833... hours (5 minutes)
  MAX_DURATION_HOURS: 24,
  DEFAULT_DURATION_HOURS: 5 / 60, // 0.0833... hours (5 minutes)

  // On-chain buffer for clock skew/latency (60 seconds as per design)
  ON_CHAIN_BUFFER_MS: 60 * 1000,

  // Preset durations (in milliseconds)
  PRESETS: {
    FIVE_MINUTES: 5 * 60 * 1000,
    ONE_HOUR: 60 * 60 * 1000,
    SIX_HOURS: 6 * 60 * 60 * 1000,
    TWELVE_HOURS: 12 * 60 * 60 * 1000,
    TWENTY_FOUR_HOURS: 24 * 60 * 60 * 1000,
  } as const,

  // Preset names for API
  PRESET_NAMES: ['5m', '1h', '6h', '12h', '24h'] as const,
} as const;

export type ExpiryPreset = (typeof EXPIRY_CONSTANTS.PRESET_NAMES)[number];

export interface ExpiryValidationResult {
  valid: boolean;
  error?: string;
  expiryDate?: Date;
  durationHours?: number;
}

/**
 * Convert expiry preset to milliseconds
 */
export function presetToDuration(preset: ExpiryPreset): number {
  switch (preset) {
    case '5m':
      return EXPIRY_CONSTANTS.PRESETS.FIVE_MINUTES;
    case '1h':
      return EXPIRY_CONSTANTS.PRESETS.ONE_HOUR;
    case '6h':
      return EXPIRY_CONSTANTS.PRESETS.SIX_HOURS;
    case '12h':
      return EXPIRY_CONSTANTS.PRESETS.TWELVE_HOURS;
    case '24h':
      return EXPIRY_CONSTANTS.PRESETS.TWENTY_FOUR_HOURS;
    default:
      throw new Error(`Invalid preset: ${preset}`);
  }
}

/**
 * Check if a string is a valid expiry preset
 */
export function isValidPreset(preset: string): preset is ExpiryPreset {
  return EXPIRY_CONSTANTS.PRESET_NAMES.includes(preset as ExpiryPreset);
}

/**
 * Validate expiry duration in hours
 */
export function isValidExpiryDuration(durationHours: number): boolean {
  // BYPASS: Allow short expiry durations for E2E testing
  const isE2ETesting = process.env.ENABLE_E2E_TESTING === 'true';
  const minDuration = isE2ETesting ? 0 : EXPIRY_CONSTANTS.MIN_DURATION_HOURS;
  
  return (
    Number.isFinite(durationHours) &&
    durationHours >= minDuration &&
    durationHours <= EXPIRY_CONSTANTS.MAX_DURATION_HOURS
  );
}

/**
 * Validate expiry timestamp (must be in the future and within allowed duration)
 */
export function validateExpiryTimestamp(
  expiry: Date | string,
  now: Date = new Date()
): ExpiryValidationResult {
  const expiryDate = typeof expiry === 'string' ? new Date(expiry) : expiry;

  // Check if date is valid
  if (isNaN(expiryDate.getTime())) {
    return {
      valid: false,
      error: 'Invalid date format',
    };
  }

  // Check if expiry is in the future
  if (expiryDate <= now) {
    return {
      valid: false,
      error: 'Expiry date must be in the future',
    };
  }

  // Calculate duration from now
  const durationMs = expiryDate.getTime() - now.getTime();
  const durationHours = durationMs / (1000 * 60 * 60);

  // Check if duration is within allowed range
  // BYPASS: Allow short expiry durations for E2E testing (e.g., 15 seconds for expiry tests)
  const isE2ETesting = process.env.ENABLE_E2E_TESTING === 'true';
  
  if (!isE2ETesting && durationMs < EXPIRY_CONSTANTS.MIN_DURATION_MS) {
    return {
      valid: false,
      error: `Expiry duration must be at least 5 minutes`,
      durationHours,
    };
  }

  if (durationMs > EXPIRY_CONSTANTS.MAX_DURATION_MS) {
    return {
      valid: false,
      error: `Expiry duration must not exceed ${EXPIRY_CONSTANTS.MAX_DURATION_HOURS} hours`,
      durationHours,
    };
  }

  return {
    valid: true,
    expiryDate,
    durationHours,
  };
}

/**
 * Create expiry date from duration in hours
 */
export function createExpiryFromDuration(
  durationHours: number,
  now: Date = new Date()
): ExpiryValidationResult {
  if (!isValidExpiryDuration(durationHours)) {
    const isE2ETesting = process.env.ENABLE_E2E_TESTING === 'true';
    const minDurationMsg = isE2ETesting ? 'positive' : 'at least 5 minutes (0.0833 hours)';
    
    return {
      valid: false,
      error: `Duration must be ${minDurationMsg} and not exceed ${EXPIRY_CONSTANTS.MAX_DURATION_HOURS} hours`,
      durationHours,
    };
  }

  const durationMs = durationHours * 60 * 60 * 1000;
  const expiryDate = new Date(now.getTime() + durationMs);

  return {
    valid: true,
    expiryDate,
    durationHours,
  };
}

/**
 * Create expiry date from preset
 */
export function createExpiryFromPreset(
  preset: ExpiryPreset,
  now: Date = new Date()
): Date {
  const durationMs = presetToDuration(preset);
  return new Date(now.getTime() + durationMs);
}

/**
 * Get the on-chain expiry timestamp with buffer
 * 
 * The on-chain program adds a 60-second buffer to prevent
 * validation failures due to network latency/clock skew.
 * This function returns what the on-chain timestamp will be.
 */
export function getOnChainExpiry(expiry: Date): Date {
  return new Date(expiry.getTime() + EXPIRY_CONSTANTS.ON_CHAIN_BUFFER_MS);
}

/**
 * Check if agreement has expired
 */
export function isExpired(expiry: Date | string, now: Date = new Date()): boolean {
  const expiryDate = typeof expiry === 'string' ? new Date(expiry) : expiry;
  return expiryDate <= now;
}

/**
 * Get time remaining until expiry
 */
export function getTimeRemaining(expiry: Date | string, now: Date = new Date()): {
  expired: boolean;
  milliseconds: number;
  seconds: number;
  minutes: number;
  hours: number;
} {
  const expiryDate = typeof expiry === 'string' ? new Date(expiry) : expiry;
  const remainingMs = expiryDate.getTime() - now.getTime();
  const expired = remainingMs <= 0;

  return {
    expired,
    milliseconds: Math.max(0, remainingMs),
    seconds: Math.max(0, Math.floor(remainingMs / 1000)),
    minutes: Math.max(0, Math.floor(remainingMs / (1000 * 60))),
    hours: Math.max(0, remainingMs / (1000 * 60 * 60)),
  };
}

/**
 * Format duration for display
 */
export function formatDuration(durationHours: number): string {
  if (durationHours < 1) {
    return `${Math.round(durationHours * 60)} minutes`;
  } else if (durationHours === 1) {
    return '1 hour';
  } else if (durationHours < 24) {
    return `${durationHours} hours`;
  } else {
    return `${durationHours / 24} days`;
  }
}

/**
 * Get default expiry date (5 minutes from now)
 */
export function getDefaultExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + EXPIRY_CONSTANTS.DEFAULT_DURATION_MS);
}

/**
 * Comprehensive expiry validation (supports multiple input formats)
 * 
 * Accepts:
 * - Absolute Date/timestamp
 * - Duration in hours (number)
 * - Preset string ('5m', '1h', '6h', '12h', '24h')
 * 
 * If no input provided, returns default expiry (5 minutes from now)
 */
export function validateExpiry(
  input: Date | string | number | undefined,
  now: Date = new Date()
): ExpiryValidationResult {
  // Handle undefined/null - use default
  if (input === undefined || input === null) {
    const expiryDate = getDefaultExpiry(now);
    const durationHours = EXPIRY_CONSTANTS.DEFAULT_DURATION_HOURS;
    return {
      valid: true,
      expiryDate,
      durationHours,
    };
  }

  // Handle preset strings
  if (typeof input === 'string' && isValidPreset(input)) {
    const expiryDate = createExpiryFromPreset(input, now);
    const durationHours = (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    return {
      valid: true,
      expiryDate,
      durationHours,
    };
  }

  // Handle duration in hours
  if (typeof input === 'number') {
    return createExpiryFromDuration(input, now);
  }

  // Handle Date or timestamp string
  return validateExpiryTimestamp(input, now);
}

