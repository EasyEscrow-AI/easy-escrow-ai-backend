/**
 * Stealth Adapter
 *
 * Thin wrapper around the native DKSAP implementation (stealth-crypto.ts).
 * All keys are base58-encoded strings.
 *
 * Flow:
 * 1. genKeys(seed) -> StealthKeys { pubScan, pubSpend, privScan, privSpend }
 * 2. senderGenAddress(pubScan, pubSpend, ephemPriv) -> ed.Point (stealth address)
 * 3. receiverGenDest(privScan, pubSpend, ephemPub) -> string (detected stealth address)
 * 4. receiverGenKey(privScan, privSpend, ephemPub) -> string (scalar spending key)
 * 5. sendTokensFromStealth(conn, key, token, dest, amount) -> string (tx signature)
 */

import { genKeys, senderGenAddress, receiverGenDest, receiverGenKey } from './stealth-crypto';
import * as ed from '@noble/ed25519';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
} from '@solana/spl-token';
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
  const seed = crypto.randomBytes(64);
  const keys = await genKeys(new Uint8Array(seed));

  return {
    scan: {
      publicKey: keys.pubScan,
      secretKey: keys.privScan,
    },
    spend: {
      publicKey: keys.pubSpend,
      secretKey: keys.privSpend,
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
  const ephemeralPrivBytes = crypto.randomBytes(32);
  const ephemeralPrivBase58 = bs58.encode(ephemeralPrivBytes);

  // Derive ephemeral public key using the same scalar reduction as senderGenAddress.
  // We reduce the raw bytes mod L and multiply by G, matching the ECDH scalar derivation.
  const L = BigInt('7237005577332262213973186563042994240857116359379907606001950938285454250989');
  const ephScalar = bytesToNumberLE(ephemeralPrivBytes) % L || 1n;
  const ephPubPoint = ed.Point.BASE.multiply(ephScalar);
  const ephemeralPubBase58 = bs58.encode(Buffer.from(ephPubPoint.toRawBytes()));

  const stealthPoint = await senderGenAddress(
    meta.scanPublicKey,
    meta.spendPublicKey,
    ephemeralPrivBase58
  );

  const stealthAddressBase58 = bs58.encode(Buffer.from(stealthPoint.toRawBytes()));

  return {
    stealthAddress: stealthAddressBase58,
    ephemeralPublicKey: ephemeralPubBase58,
  };
}

/**
 * Convert a little-endian byte array to a BigInt.
 * (Local copy for adapter use)
 */
function bytesToNumberLE(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    result = (result << 8n) + BigInt(bytes[i]);
  }
  return result;
}

/**
 * Convert a base58-encoded scalar key to a Solana Keypair.
 * The scalar is a 32-byte Ed25519 private seed; we derive the public key
 * and combine into the 64-byte format Solana expects.
 */
async function scalarToKeypair(scalarKeyBase58: string): Promise<Keypair> {
  const scalarBytes = bs58.decode(scalarKeyBase58);
  const pubKeyBytes = await ed.getPublicKey(scalarBytes);
  const fullKey = new Uint8Array(64);
  fullKey.set(scalarBytes, 0);
  fullKey.set(pubKeyBytes, 32);
  return Keypair.fromSecretKey(fullKey);
}

/**
 * Build a stealth token transfer transaction (USDC to stealth address ATA).
 * Creates the ATA for the stealth address if it doesn't exist, then transfers tokens.
 */
export async function createStealthTokenTransfer(params: {
  connection: Connection;
  senderPubkey: PublicKey;
  tokenMint: PublicKey;
  scanPublicKey: string;
  spendPublicKey: string;
  amount: number;
}): Promise<Transaction> {
  // Generate ephemeral key and derive stealth address
  const ephemeralPrivBytes = crypto.randomBytes(32);
  const ephemeralPrivBase58 = bs58.encode(ephemeralPrivBytes);

  const stealthPoint = await senderGenAddress(
    params.scanPublicKey,
    params.spendPublicKey,
    ephemeralPrivBase58
  );

  const stealthPubkey = new PublicKey(stealthPoint.toRawBytes());

  // Derive ATAs
  const senderAta = await getAssociatedTokenAddress(params.tokenMint, params.senderPubkey);
  const stealthAta = await getAssociatedTokenAddress(params.tokenMint, stealthPubkey, true);

  const tx = new Transaction();

  // Create stealth ATA if needed (using allowOwnerOffCurve for stealth addresses)
  tx.add(
    createAssociatedTokenAccountInstruction(
      params.senderPubkey, // payer
      stealthAta, // ATA to create
      stealthPubkey, // owner of the ATA
      params.tokenMint // token mint
    )
  );

  // Transfer tokens
  tx.add(
    createTransferInstruction(
      senderAta, // source
      stealthAta, // destination
      params.senderPubkey, // authority
      params.amount // amount
    )
  );

  return tx;
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
 * Derives the keypair from the scalar, creates an ATA for the destination if needed,
 * then transfers all tokens.
 */
export async function sendTokensFromStealth(params: {
  connection: Connection;
  scalarKey: string;
  tokenMint: PublicKey;
  destination: PublicKey;
  amount: number;
}): Promise<string> {
  const stealthKeypair = await scalarToKeypair(params.scalarKey);
  const stealthPubkey = stealthKeypair.publicKey;

  // Source ATA (stealth address token account)
  const sourceAta = await getAssociatedTokenAddress(params.tokenMint, stealthPubkey, true);

  // Destination ATA
  const destAta = await getAssociatedTokenAddress(params.tokenMint, params.destination);

  const tx = new Transaction();

  // Create destination ATA if it doesn't exist (stealth keypair pays for rent)
  try {
    await getAccount(params.connection, destAta);
  } catch {
    tx.add(
      createAssociatedTokenAccountInstruction(
        stealthPubkey, // payer
        destAta, // ATA to create
        params.destination, // owner
        params.tokenMint // mint
      )
    );
  }

  // Transfer tokens
  tx.add(
    createTransferInstruction(
      sourceAta, // source
      destAta, // destination
      stealthPubkey, // authority
      params.amount // amount
    )
  );

  const signature = await sendAndConfirmTransaction(params.connection, tx, [stealthKeypair]);
  return signature;
}

/**
 * Sign a transaction using a stealth address scalar key.
 */
export async function signStealthTransaction(
  tx: Transaction,
  scalarKey: string
): Promise<Transaction> {
  const keypair = await scalarToKeypair(scalarKey);
  tx.partialSign(keypair);
  return tx;
}
