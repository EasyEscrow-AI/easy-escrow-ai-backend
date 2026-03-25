/**
 * Privacy Router Service
 *
 * Routes escrow operations to the appropriate privacy strategy based on
 * the requested privacy level. Acts as the main entry point for privacy-aware
 * escrow operations.
 */

import { PublicKey } from '@solana/web3.js';
import { PrivacyLevel, PrivacyPreferences, StealthPaymentResult } from './privacy.types';
import { getPrivacyConfig } from './privacy.config';
import { isPrivacyEnabled } from '../../utils/featureFlags';
import { getStealthAddressService } from './stealth-address.service';

export interface PrivacyRouteResult {
  recipientAddress: string;
  privacyLevel: PrivacyLevel;
  stealthPaymentId?: string;
  ephemeralPublicKey?: string;
  useJito: boolean;
}

/**
 * Resolve the release destination based on privacy preferences.
 * Returns the address to send funds to (stealth or standard).
 */
export async function resolveReleaseDestination(
  recipientWallet: string,
  clientId: string,
  escrowId: string,
  tokenMint: string,
  amountRaw: bigint,
  preferences?: PrivacyPreferences
): Promise<PrivacyRouteResult> {
  const config = getPrivacyConfig();
  const level = preferences?.level || config.defaultPrivacyLevel;
  const useJito = preferences?.useJito ?? config.jitoDefault;

  // If privacy disabled or level is NONE, return standard recipient
  if (!isPrivacyEnabled() || level === PrivacyLevel.NONE) {
    return {
      recipientAddress: recipientWallet,
      privacyLevel: PrivacyLevel.NONE,
      useJito,
    };
  }

  // STEALTH level: derive stealth address from recipient's meta-address
  if (level === PrivacyLevel.STEALTH) {
    if (!preferences?.metaAddressId) {
      throw new Error('metaAddressId is required for STEALTH privacy level');
    }

    const stealthService = getStealthAddressService();
    const { stealthPaymentId, stealthAddress, ephemeralPublicKey } =
      await stealthService.createStealthPayment({
        metaAddressId: preferences.metaAddressId,
        escrowId,
        tokenMint,
        amountRaw,
      });

    return {
      recipientAddress: stealthAddress,
      privacyLevel: PrivacyLevel.STEALTH,
      stealthPaymentId,
      ephemeralPublicKey,
      useJito,
    };
  }

  throw new Error(`Unknown privacy level: ${level}`);
}
