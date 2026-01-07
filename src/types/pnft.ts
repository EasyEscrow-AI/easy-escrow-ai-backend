/**
 * Programmable NFT (pNFT) Type Definitions
 *
 * pNFTs are NFTs with the Token Metadata tokenStandard = ProgrammableNonFungible.
 * They have permanently frozen token accounts and require Token Metadata
 * program's TransferV1 instruction for transfers.
 *
 * Key differences from standard NFTs:
 * 1. Token accounts are always frozen (managed by Token Metadata program)
 * 2. Transfers use TransferV1 instruction (not SPL Token transfer)
 * 3. Require Token Record PDAs for state tracking
 * 4. May have Authorization Rules that whitelist/blacklist programs
 */

import { PublicKey } from '@solana/web3.js';

/**
 * Token Metadata program ID
 */
export const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
);

/**
 * Token Auth Rules program ID (for authorization rules validation)
 */
export const TOKEN_AUTH_RULES_PROGRAM_ID = new PublicKey(
  'auth9SigNpDKz4sJJ1DfCTuZrZNSAgh9sFD3rboVmgg'
);

/**
 * SPL Token program ID
 */
export const SPL_TOKEN_PROGRAM_ID = new PublicKey(
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
);

/**
 * Associated Token program ID
 */
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
);

/**
 * Sysvar Instructions program ID (required for pNFT transfers)
 */
export const SYSVAR_INSTRUCTIONS_PUBKEY = new PublicKey(
  'Sysvar1nstructions1111111111111111111111111'
);

/**
 * Token Standard values from Token Metadata
 */
export enum TokenStandard {
  NonFungible = 0,
  FungibleAsset = 1,
  Fungible = 2,
  NonFungibleEdition = 3,
  ProgrammableNonFungible = 4,
  ProgrammableNonFungibleEdition = 5,
}

/**
 * pNFT metadata from DAS API
 */
export interface PnftMetadata {
  mint: string;
  owner: string;
  frozen: boolean;
  tokenStandard: 'ProgrammableNonFungible' | TokenStandard.ProgrammableNonFungible;
  programmableConfig?: {
    ruleSet?: string; // Authorization rules account address
  };
  metadata: {
    name?: string;
    symbol?: string;
    uri?: string;
  };
}

/**
 * Parameters for building a pNFT transfer instruction
 */
export interface PnftTransferParams {
  /** pNFT mint address */
  mint: PublicKey;
  /** Current owner wallet (must sign) */
  fromWallet: PublicKey;
  /** New owner wallet */
  toWallet: PublicKey;
  /** Source token account (ATA) */
  sourceAta: PublicKey;
  /** Destination token account (ATA) */
  destinationAta: PublicKey;
  /** Source Token Record PDA */
  sourceTokenRecord: PublicKey;
  /** Destination Token Record PDA */
  destinationTokenRecord: PublicKey;
  /** Metadata account PDA */
  metadataAccount: PublicKey;
  /** Master Edition account PDA */
  masterEditionAccount: PublicKey;
  /** Optional: Authorization Rules account (if pNFT has rules) */
  authorizationRules?: PublicKey;
}

/**
 * Result of building a pNFT transfer instruction
 */
export interface PnftTransferResult {
  /** The transfer instruction */
  instruction: any; // TransactionInstruction
  /** Source token account */
  sourceAta: PublicKey;
  /** Destination token account */
  destinationAta: PublicKey;
  /** Source Token Record PDA */
  sourceTokenRecord: PublicKey;
  /** Destination Token Record PDA */
  destinationTokenRecord: PublicKey;
  /** Whether auth rules are involved */
  hasAuthorizationRules: boolean;
  /** Estimated instruction size in bytes */
  estimatedSize: number;
}

/**
 * Result of checking authorization rules
 */
export interface AuthorizationRulesResult {
  /** Whether the transfer is allowed */
  allowed: boolean;
  /** Rule Set account address (if any) */
  ruleSet?: string;
  /** Error message if blocked */
  error?: string;
}

/**
 * Derive the Metadata PDA for a mint
 */
export function findMetadataPda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

/**
 * Derive the Master Edition PDA for a mint
 */
export function findMasterEditionPda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
      Buffer.from('edition'),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

/**
 * Derive the Token Record PDA for a token account
 */
export function findTokenRecordPda(mint: PublicKey, tokenAccount: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
      Buffer.from('token_record'),
      tokenAccount.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}
