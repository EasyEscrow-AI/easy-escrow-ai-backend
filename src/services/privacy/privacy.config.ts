/**
 * Privacy Configuration
 *
 * Configuration for stealth address privacy features.
 * Privacy is enabled by default for institution endpoints (PRIVACY_ENABLED=true).
 * Follows the same pattern as institution-escrow.config.ts.
 */

import { PrivacyLevel } from './privacy.types';

export interface PrivacyConfig {
  enabled: boolean;
  stealthKeyEncryptionSecret: string;
  defaultPrivacyLevel: PrivacyLevel;
  jitoDefault: boolean;
}

export function loadPrivacyConfig(): PrivacyConfig {
  const enabled = process.env.PRIVACY_ENABLED !== 'false'; // true by default

  return {
    enabled,
    stealthKeyEncryptionSecret: process.env.STEALTH_KEY_ENCRYPTION_SECRET || '',
    defaultPrivacyLevel: (process.env.DEFAULT_PRIVACY_LEVEL as PrivacyLevel) || PrivacyLevel.NONE,
    jitoDefault: process.env.PRIVACY_JITO_DEFAULT?.toLowerCase() === 'true',
  };
}

export function validatePrivacyConfig(config: PrivacyConfig): string[] {
  const errors: string[] = [];

  if (!config.enabled) return errors;

  if (!config.stealthKeyEncryptionSecret || config.stealthKeyEncryptionSecret.length < 32) {
    errors.push(
      'STEALTH_KEY_ENCRYPTION_SECRET must be at least 32 characters when privacy is enabled'
    );
  }

  if (
    config.defaultPrivacyLevel &&
    !Object.values(PrivacyLevel).includes(config.defaultPrivacyLevel)
  ) {
    errors.push(`DEFAULT_PRIVACY_LEVEL must be one of: ${Object.values(PrivacyLevel).join(', ')}`);
  }

  return errors;
}

let _privacyConfig: PrivacyConfig | null = null;

export function getPrivacyConfig(): PrivacyConfig {
  if (!_privacyConfig) {
    _privacyConfig = loadPrivacyConfig();
  }
  return _privacyConfig;
}

export function resetPrivacyConfig(): void {
  _privacyConfig = null;
}

export const privacyConfig = {
  get: getPrivacyConfig,
  load: loadPrivacyConfig,
  reset: resetPrivacyConfig,
  validate: validatePrivacyConfig,
};
