/**
 * Stealth Adapter
 *
 * Thin wrapper around the solana-stealth package.
 * All keys in the solana-stealth API are base58-encoded strings.
 *
 * Flow:
 * 1. genKeys(seed) → StealthKeys { pubScan, pubSpend, privScan, privSpend }
 * 2. senderGenAddress(pubScan, pubSpend, ephemPriv) → ed.Point (stealth address)
 * 3. receiverGenDest(privScan, pubSpend, ephemPub) → string (detected stealth address)
 * 4. receiverGenKey(privScan, privSpend, ephemPub) → string (scalar spending key)
 * 5. tokenFromStealth(conn, key, token, dest, amount) → string (tx signature)
 */

import {
  genKeys,
  senderGenAddress,
  stealthTokenTransferTransaction,
  receiverGenDest,
  receiverGenKey,
  tokenFromStealth,
  signTransaction,
} from 'solana-stealth';
import * as ed from '@noble/ed25519';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import crypto from 'crypto';
import bs58 from 'bs58';
import { StealthMetaAddress, StealthPaymentResult } from './privacy.types';

export interface GeneratedMetaAddress {
  scan: { publicKey: string; secretKey: string };
  spend: { publicKey: string; secretKey: string };
}

/**
 * Generate a new stealth meta-address (scan + spend keys).
 * Returns base58-encoded public and private keys.
 */
export async function generateMetaAddress(): Promise<GeneratedMetaAddress> {
  // genKeys expects a Uint8Array seed (min 32 bytes)
  const seed = crypto.randomBytes(64);
  const keys = await genKeys(new Uint8Array(seed));

  return {
    scan: {
      publicKey: keys.pubScan, // base58-encoded Ed25519 point
      secretKey: keys.privScan, // base58-encoded scalar (LE)
    },
    spend: {
      publicKey: keys.pubSpend, // base58-encoded Ed25519 point
      secretKey: keys.privSpend, // base58-encoded scalar (LE)
    },
  };
}

/**
 * Derive a one-time stealth address from a recipient's meta-address.
 * Generates an ephemeral keypair internally for randomness.
 * Each call produces a unique stealth address (unlinkability).
 *
 * Returns base58-encoded stealth address and ephemeral public key.
 */
export async function deriveStealthAddress(
  meta: StealthMetaAddress
): Promise<StealthPaymentResult> {
  // Generate ephemeral private key (32 random bytes)
  const ephemeralPrivBytes = crypto.randomBytes(32);
  const ephemeralPrivBase58 = bs58.encode(ephemeralPrivBytes);

  // Derive ephemeral public key for the receiver
  const ephemeralPubBytes = await ed.getPublicKey(ephemeralPrivBytes);
  const ephemeralPubBase58 = bs58.encode(Buffer.from(ephemeralPubBytes));

  // senderGenAddress returns an ed.Point
  const stealthPoint = await senderGenAddress(
    meta.scanPublicKey,
    meta.spendPublicKey,
    ephemeralPrivBase58
  );

  // Encode the stealth address point as base58
  const stealthAddressBase58 = bs58.encode(Buffer.from(stealthPoint.toRawBytes()));

  return {
    stealthAddress: stealthAddressBase58,
    ephemeralPublicKey: ephemeralPubBase58,
  };
}

/**
 * Build a stealth token transfer transaction (USDC to stealth address).
 */
export async function createStealthTokenTransfer(params: {
  senderPubkey: PublicKey;
  tokenMint: PublicKey;
  scanPublicKey: string;
  spendPublicKey: string;
  amount: number;
}): Promise<Transaction> {
  return await stealthTokenTransferTransaction(
    params.senderPubkey,
    params.tokenMint,
    params.scanPublicKey,
    params.spendPublicKey,
    params.amount
  );
}

/**
 * Derive the stealth destination address for a given ephemeral public key.
 * Used by the recipient to detect payments sent to them.
 * Returns a base58-encoded string.
 */
export async function deriveReceiverDestination(
  scanPrivateKey: string,
  spendPublicKey: string,
  ephemeralPublicKey: string
): Promise<string> {
  return await receiverGenDest(scanPrivateKey, spendPublicKey, ephemeralPublicKey);
}

/**
 * Derive the spending scalar key for a stealth address.
 * Used by the recipient to sign transactions from the stealth address.
 */
export async function deriveSpendingKey(
  scanPrivateKey: string,
  spendPrivateKey: string,
  ephemeralPublicKey: string
): Promise<string> {
  return await receiverGenKey(scanPrivateKey, spendPrivateKey, ephemeralPublicKey);
}

/**
 * Send tokens from a stealth address using the scalar key.
 */
export async function sendTokensFromStealth(params: {
  connection: Connection;
  scalarKey: string;
  tokenMint: PublicKey;
  destination: PublicKey;
  amount: number;
}): Promise<string> {
  return await tokenFromStealth(
    params.connection,
    params.scalarKey,
    params.tokenMint,
    params.destination,
    params.amount
  );
}

/**
 * Sign a transaction using a stealth address scalar key.
 */
export async function signStealthTransaction(
  tx: Transaction,
  scalarKey: string
): Promise<Transaction> {
  return await signTransaction(tx, scalarKey);
}
