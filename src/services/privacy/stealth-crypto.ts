/**
 * Native DKSAP (Dual-Key Stealth Address Protocol) Implementation
 *
 * Replaces the non-existent `solana-stealth` npm package with a native
 * implementation using @noble/ed25519 for all elliptic curve operations.
 *
 * Protocol:
 * - Two key pairs: scan (for detecting payments) and spend (for spending)
 * - Sender uses recipient's public keys + ephemeral key to derive stealth address
 * - Recipient uses private scan key to detect, private spend key to spend
 *
 * All keys are base58-encoded. Scalars are little-endian 32-byte arrays.
 */

import * as ed from '@noble/ed25519';
import crypto from 'crypto';
import bs58 from 'bs58';

// Ed25519 group order
const L = BigInt('7237005577332262213973186563042994240857116359379907606001950938285454250989');

/**
 * Convert a little-endian byte array to a BigInt.
 */
function bytesToNumberLE(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    result = (result << 8n) + BigInt(bytes[i]);
  }
  return result;
}

/**
 * Convert a BigInt to a 32-byte little-endian Uint8Array.
 */
function numberToBytes32LE(num: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let n = num;
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return bytes;
}

/**
 * Positive modulo (always returns non-negative result).
 */
function mod(a: bigint, m: bigint): bigint {
  const result = a % m;
  return result >= 0n ? result : result + m;
}

/**
 * Clamp a 32-byte scalar per Ed25519 rules:
 * - Clear the lowest 3 bits of the first byte
 * - Clear bit 255 (top bit of last byte)
 * - Set bit 254 (second-highest bit of last byte)
 */
function clampScalar(bytes: Uint8Array): Uint8Array {
  const clamped = new Uint8Array(bytes);
  clamped[0] &= 248; // clear low 3 bits
  clamped[31] &= 127; // clear bit 255
  clamped[31] |= 64; // set bit 254
  return clamped;
}

/**
 * SHA-256 hash (uses Node's built-in crypto).
 */
function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(crypto.createHash('sha256').update(data).digest());
}

/**
 * SHA-512 hash (uses Node's built-in crypto).
 */
function sha512(data: Uint8Array): Uint8Array {
  return new Uint8Array(crypto.createHash('sha512').update(data).digest());
}

/**
 * Generate stealth meta-address keys from a 64-byte seed.
 *
 * Takes 64 random bytes, hashes with SHA-512, splits into two 32-byte halves,
 * clamps each as an Ed25519 scalar, and derives public keys.
 *
 * Returns base58-encoded keys: { pubScan, pubSpend, privScan, privSpend }
 */
export async function genKeys(
  seed: Uint8Array
): Promise<{ pubScan: string; pubSpend: string; privScan: string; privSpend: string }> {
  if (seed.length < 64) {
    throw new Error('Seed must be at least 64 bytes');
  }

  const hash = sha512(seed);

  // Split into two 32-byte halves, clamp per Ed25519 rules, then reduce mod L
  const scanScalarBytes = clampScalar(hash.slice(0, 32));
  const spendScalarBytes = clampScalar(hash.slice(32, 64));

  // Reduce mod L so the scalar is valid for Point.multiply (must be < L)
  const scanScalar = mod(bytesToNumberLE(scanScalarBytes), L);
  const spendScalar = mod(bytesToNumberLE(spendScalarBytes), L);

  // Derive public keys: P = scalar * G
  const pubScanPoint = ed.Point.BASE.multiply(scanScalar);
  const pubSpendPoint = ed.Point.BASE.multiply(spendScalar);

  // Store the reduced scalars as the private keys
  const scanPrivBytes = numberToBytes32LE(scanScalar);
  const spendPrivBytes = numberToBytes32LE(spendScalar);

  return {
    pubScan: bs58.encode(pubScanPoint.toRawBytes()),
    pubSpend: bs58.encode(pubSpendPoint.toRawBytes()),
    privScan: bs58.encode(Buffer.from(scanPrivBytes)),
    privSpend: bs58.encode(Buffer.from(spendPrivBytes)),
  };
}

/**
 * Sender derives a one-time stealth address from the recipient's meta-address.
 *
 * ECDH: S = ephPriv * pubScan
 * Hash: h = SHA-256(S) mod L
 * Stealth pubkey: P = pubSpend + h*G
 *
 * Returns the stealth address as an ed.Point.
 */
export async function senderGenAddress(
  pubScan: string,
  pubSpend: string,
  ephPriv: string
): Promise<ed.Point> {
  const pubScanPoint = ed.Point.fromHex(bs58.decode(pubScan));
  const pubSpendPoint = ed.Point.fromHex(bs58.decode(pubSpend));
  const ephPrivBytes = bs58.decode(ephPriv);
  const ephScalar = mod(bytesToNumberLE(ephPrivBytes), L);

  // ECDH shared secret
  const sharedPoint = pubScanPoint.multiply(ephScalar);
  const sharedBytes = sharedPoint.toRawBytes();

  // Hash to scalar
  const h = sha256(sharedBytes);
  const hScalar = mod(bytesToNumberLE(h), L);

  // Stealth public key: pubSpend + h*G
  const hPoint = ed.Point.BASE.multiply(hScalar);
  const stealthPoint = pubSpendPoint.add(hPoint);

  return stealthPoint;
}

/**
 * Receiver derives the stealth destination address to detect incoming payments.
 *
 * ECDH: S' = privScan * ephPub
 * Hash: h' = SHA-256(S') mod L
 * Stealth address: P' = pubSpend + h'*G
 *
 * Returns the stealth address as a base58 string.
 */
export async function receiverGenDest(
  privScan: string,
  pubSpend: string,
  ephPub: string
): Promise<string> {
  const privScanBytes = bs58.decode(privScan);
  const privScanScalar = mod(bytesToNumberLE(privScanBytes), L);
  const pubSpendPoint = ed.Point.fromHex(bs58.decode(pubSpend));
  const ephPubPoint = ed.Point.fromHex(bs58.decode(ephPub));

  // ECDH shared secret
  const sharedPoint = ephPubPoint.multiply(privScanScalar);
  const sharedBytes = sharedPoint.toRawBytes();

  // Hash to scalar
  const h = sha256(sharedBytes);
  const hScalar = mod(bytesToNumberLE(h), L);

  // Stealth address: pubSpend + h'*G
  const hPoint = ed.Point.BASE.multiply(hScalar);
  const stealthPoint = pubSpendPoint.add(hPoint);

  return bs58.encode(stealthPoint.toRawBytes());
}

/**
 * Receiver derives the spending scalar key for a stealth address.
 *
 * ECDH: S' = privScan * ephPub
 * Hash: h' = SHA-256(S') mod L
 * Spending key: (privSpend + h') mod L
 *
 * Returns the spending scalar as a base58-encoded 32-byte little-endian array.
 */
export async function receiverGenKey(
  privScan: string,
  privSpend: string,
  ephPub: string
): Promise<string> {
  const privScanBytes = bs58.decode(privScan);
  const privScanScalar = mod(bytesToNumberLE(privScanBytes), L);
  const privSpendBytes = bs58.decode(privSpend);
  const privSpendScalar = mod(bytesToNumberLE(privSpendBytes), L);
  const ephPubPoint = ed.Point.fromHex(bs58.decode(ephPub));

  // ECDH shared secret
  const sharedPoint = ephPubPoint.multiply(privScanScalar);
  const sharedBytes = sharedPoint.toRawBytes();

  // Hash to scalar
  const h = sha256(sharedBytes);
  const hScalar = mod(bytesToNumberLE(h), L);

  // Spending scalar: (privSpend + h') mod L
  const spendingScalar = mod(privSpendScalar + hScalar, L);

  return bs58.encode(Buffer.from(numberToBytes32LE(spendingScalar)));
}
