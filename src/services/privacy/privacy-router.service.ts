/**
 * Privacy Router Service
 *
 * Routes escrow operations to the appropriate privacy strategy based on
 * the requested privacy level. Default is STEALTH for all institutional
 * endpoints — falls back to NONE if the recipient has no meta-address.
 */

import { PrivacyLevel, PrivacyPreferences } from './privacy.types';
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
 *
 * Default behavior (STEALTH):
 *   1. If metaAddressId is provided explicitly, use it
 *   2. Otherwise, auto-lookup a meta-address for the recipient wallet
 *   3. If no meta-address found, gracefully fall back to NONE
 *
 * This means every institution account with a registered meta-address
 * automatically gets stealth privacy — no per-request opt-in needed.
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

  // If privacy disabled or explicitly NONE, return standard recipient
  if (!isPrivacyEnabled() || level === PrivacyLevel.NONE) {
    return {
      recipientAddress: recipientWallet,
      privacyLevel: PrivacyLevel.NONE,
      useJito,
    };
  }

  // STEALTH level: derive stealth address from recipient's meta-address
  if (level === PrivacyLevel.STEALTH) {
    const stealthService = getStealthAddressService();
    let metaAddressId: string | undefined = preferences?.metaAddressId;

    // Auto-lookup: find meta-address linked to the recipient's account/wallet
    if (!metaAddressId) {
      try {
        metaAddressId =
          (await stealthService.findMetaAddressForWallet(recipientWallet)) ?? undefined;
      } catch (error) {
        console.warn('[PrivacyRouter] Auto-lookup failed, falling back to NONE:', error);
      }
    }

    // Graceful fallback: no meta-address → use standard address (NONE)
    if (!metaAddressId) {
      console.log(
        `[PrivacyRouter] No stealth meta-address for wallet ${recipientWallet}, falling back to NONE`
      );
      return {
        recipientAddress: recipientWallet,
        privacyLevel: PrivacyLevel.NONE,
        useJito,
      };
    }

    try {
      const { stealthPaymentId, stealthAddress, ephemeralPublicKey } =
        await stealthService.createStealthPayment({
          metaAddressId,
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
    } catch (error) {
      console.error('[PrivacyRouter] createStealthPayment failed, falling back to NONE:', error);
      return {
        recipientAddress: recipientWallet,
        privacyLevel: PrivacyLevel.NONE,
        useJito,
      };
    }
  }

  throw new Error(`Unknown privacy level: ${level}`);
}

/**
 * Resolve the deposit source — stealth payer address if available.
 * Mirrors resolveReleaseDestination() but for the payer side.
 */
export async function resolveDepositSource(
  payerWallet: string,
  clientId: string,
  escrowId: string,
  tokenMint: string,
  amountRaw: bigint,
  preferences?: PrivacyPreferences
): Promise<PrivacyRouteResult> {
  const config = getPrivacyConfig();
  const level = preferences?.level || config.defaultPrivacyLevel;
  const useJito = preferences?.useJito ?? config.jitoDefault;

  if (!isPrivacyEnabled() || level === PrivacyLevel.NONE) {
    return {
      recipientAddress: payerWallet, // "recipientAddress" is reused — means "resolved address"
      privacyLevel: PrivacyLevel.NONE,
      useJito,
    };
  }

  if (level === PrivacyLevel.STEALTH) {
    const stealthService = getStealthAddressService();
    let metaAddressId: string | undefined = preferences?.metaAddressId;

    if (!metaAddressId) {
      try {
        // Try wallet-based lookup first
        metaAddressId =
          (await stealthService.findMetaAddressForWallet(payerWallet)) ?? undefined;

        // Fallback: look up by clientId directly (payer wallet may not be in accounts table)
        if (!metaAddressId) {
          const { prisma } = await import('../../config/database');
          const meta = await prisma.stealthMetaAddress.findFirst({
            where: { institutionClientId: clientId, isActive: true },
            select: { id: true },
            orderBy: { createdAt: 'desc' },
          });
          metaAddressId = meta?.id ?? undefined;
        }
      } catch (error) {
        console.warn('[PrivacyRouter] Payer stealth auto-lookup failed, falling back to NONE:', error);
      }
    }

    if (!metaAddressId) {
      console.log(
        `[PrivacyRouter] No stealth meta-address for payer wallet ${payerWallet}, falling back to NONE`
      );
      return {
        recipientAddress: payerWallet,
        privacyLevel: PrivacyLevel.NONE,
        useJito,
      };
    }

    try {
      const { stealthPaymentId, stealthAddress, ephemeralPublicKey } =
        await stealthService.createStealthPayment({
          metaAddressId,
          escrowId,
          tokenMint,
          amountRaw,
        });

      return {
        recipientAddress: stealthAddress, // stealth payer address
        privacyLevel: PrivacyLevel.STEALTH,
        stealthPaymentId,
        ephemeralPublicKey,
        useJito,
      };
    } catch (error) {
      console.error('[PrivacyRouter] createStealthPayment for payer failed, falling back to NONE:', error);
      return {
        recipientAddress: payerWallet,
        privacyLevel: PrivacyLevel.NONE,
        useJito,
      };
    }
  }

  throw new Error(`Unknown privacy level: ${level}`);
}
