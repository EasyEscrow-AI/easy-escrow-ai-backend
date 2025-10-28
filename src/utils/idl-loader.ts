/**
 * IDL Loader Utility
 * 
 * Dynamically loads the correct environment-specific IDL file based on NODE_ENV.
 * This ensures the backend always uses the IDL matching the deployed program.
 */

import devIdl from '../generated/anchor/escrow-idl-dev.json';
import stagingIdl from '../generated/anchor/escrow-idl-staging.json';
import productionIdl from '../generated/anchor/escrow-idl-production.json';

/**
 * Environment-to-IDL mapping
 */
const IDL_MAP = {
  development: devIdl,
  dev: devIdl,
  staging: stagingIdl,
  production: productionIdl,
} as const;

/**
 * Get the appropriate IDL for the current environment
 */
export function getEscrowIdl(): any {
  const env = (process.env.NODE_ENV || 'development').toLowerCase();
  
  // Try exact match first
  if (env in IDL_MAP) {
    const idl = IDL_MAP[env as keyof typeof IDL_MAP];
    console.log(`[IDL Loader] Loaded ${env} IDL with program ID: ${idl.address}`);
    return idl;
  }
  
  // Fallback to development
  console.warn(`[IDL Loader] Unknown environment '${env}', falling back to development IDL`);
  return devIdl;
}

/**
 * Get the program ID from the current environment's IDL
 */
export function getProgramIdFromIdl(): string {
  const idl = getEscrowIdl();
  return idl.address;
}

/**
 * Verify that the IDL program ID matches the configured program ID
 */
export function verifyProgramId(configProgramId: string): boolean {
  const idlProgramId = getProgramIdFromIdl();
  const match = idlProgramId === configProgramId;
  
  if (!match) {
    console.error(
      `[IDL Loader] Program ID mismatch!\n` +
      `  IDL:    ${idlProgramId}\n` +
      `  Config: ${configProgramId}\n` +
      `  Env:    ${process.env.NODE_ENV || 'development'}`
    );
  }
  
  return match;
}

