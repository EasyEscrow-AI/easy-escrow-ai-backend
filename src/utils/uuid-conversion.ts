/**
 * UUID Conversion Utilities
 *
 * Shared utilities for converting UUIDs to/from buffers for on-chain program interaction.
 * Used by two-phase swap services for PDA derivation.
 */

/**
 * Convert a UUID string to a 16-byte Buffer for PDA seeds.
 *
 * @param uuid - A standard UUID string (e.g., "550e8400-e29b-41d4-a716-446655440000")
 * @returns A 16-byte Buffer containing the UUID bytes
 * @throws Error if the UUID format is invalid
 *
 * @example
 * ```typescript
 * const swapId = "550e8400-e29b-41d4-a716-446655440000";
 * const bytes = uuidToBuffer(swapId);
 * // Use for PDA derivation: [Buffer.from('two_phase_sol_vault'), bytes]
 * ```
 */
export function uuidToBuffer(uuid: string): Buffer {
  // Remove hyphens from UUID
  const hex = uuid.replace(/-/g, '');

  // Validate hex string length (16 bytes = 32 hex chars)
  if (hex.length !== 32) {
    throw new Error(`Invalid UUID format: expected 32 hex characters, got ${hex.length}`);
  }

  // Validate all characters are valid hex
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error('Invalid UUID format: contains non-hexadecimal characters');
  }

  return Buffer.from(hex, 'hex');
}

/**
 * Convert a 16-byte Buffer back to a UUID string.
 *
 * @param buffer - A 16-byte Buffer containing UUID bytes
 * @returns A standard UUID string with hyphens
 * @throws Error if the buffer is not exactly 16 bytes
 *
 * @example
 * ```typescript
 * const buffer = Buffer.from("550e8400e29b41d4a716446655440000", "hex");
 * const uuid = bufferToUuid(buffer);
 * // "550e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export function bufferToUuid(buffer: Buffer): string {
  if (buffer.length !== 16) {
    throw new Error(`Invalid buffer length: expected 16 bytes, got ${buffer.length}`);
  }

  const hex = buffer.toString('hex');

  // Format as UUID with hyphens: 8-4-4-4-12
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Convert a UUID string to a Uint8Array (for Anchor instruction arguments).
 *
 * @param uuid - A standard UUID string
 * @returns A 16-element Uint8Array
 */
export function uuidToUint8Array(uuid: string): Uint8Array {
  return new Uint8Array(uuidToBuffer(uuid));
}

/**
 * Validate that a string is a valid UUID format.
 *
 * @param uuid - String to validate
 * @returns true if valid UUID format, false otherwise
 */
export function isValidUuid(uuid: string): boolean {
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  return uuidRegex.test(uuid);
}

/**
 * Build a Prisma where clause for looking up an escrow by either
 * escrowCode (EE-XXXX-XXXX) or escrowId (UUID).
 */
export function escrowWhere(idOrCode: string): { escrowCode: string } | { escrowId: string } {
  return idOrCode.startsWith('EE-') ? { escrowCode: idOrCode } : { escrowId: idOrCode };
}
