/**
 * Stealth Key Manager
 *
 * Manages encrypted storage of stealth scanning and spending private keys.
 * Uses AES-256-GCM encryption with per-institution initialization vectors.
 * Keys are only decrypted when needed for scanning or sweeping operations.
 */

import crypto from 'crypto';
import { getPrivacyConfig } from './privacy.config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128-bit IV for GCM
const TAG_LENGTH = 16; // 128-bit auth tag
const KEY_LENGTH = 32; // 256-bit key

export interface EncryptedData {
  encrypted: string; // hex-encoded ciphertext
  iv: string; // hex-encoded IV
  tag: string; // hex-encoded auth tag
}

function deriveKey(secret: string): Buffer {
  // Use HKDF to derive a fixed-length key from the secret (more robust than plain SHA-256)
  const salt = Buffer.alloc(KEY_LENGTH, 0); // fixed zero salt for deterministic derivation
  return Buffer.from(crypto.hkdfSync('sha256', secret, salt, 'stealth-key-encryption', KEY_LENGTH));
}

/**
 * Encrypt a private key using AES-256-GCM.
 * Returns a single string: iv:tag:ciphertext (all hex-encoded).
 */
export function encryptKey(plaintext: string): string {
  const config = getPrivacyConfig();
  if (!config.stealthKeyEncryptionSecret || config.stealthKeyEncryptionSecret.length < 32) {
    throw new Error('STEALTH_KEY_ENCRYPTION_SECRET must be at least 32 characters');
  }

  const key = deriveKey(config.stealthKeyEncryptionSecret);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt an encrypted key using AES-256-GCM.
 * Input format: iv:tag:ciphertext (all hex-encoded).
 */
export function decryptKey(encryptedString: string): string {
  const config = getPrivacyConfig();
  if (!config.stealthKeyEncryptionSecret || config.stealthKeyEncryptionSecret.length < 32) {
    throw new Error('STEALTH_KEY_ENCRYPTION_SECRET must be at least 32 characters');
  }

  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted key format');
  }

  const [ivHex, tagHex, ciphertext] = parts;
  const key = deriveKey(config.stealthKeyEncryptionSecret);
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encrypt a key with a specific secret (for testing or key rotation).
 */
export function encryptKeyWithSecret(plaintext: string, secret: string): string {
  if (!secret || secret.length < 32) {
    throw new Error('Encryption secret must be at least 32 characters');
  }

  const key = deriveKey(secret);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a key with a specific secret (for testing or key rotation).
 */
export function decryptKeyWithSecret(encryptedString: string, secret: string): string {
  if (!secret || secret.length < 32) {
    throw new Error('Encryption secret must be at least 32 characters');
  }

  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted key format');
  }

  const [ivHex, tagHex, ciphertext] = parts;
  const key = deriveKey(secret);
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
