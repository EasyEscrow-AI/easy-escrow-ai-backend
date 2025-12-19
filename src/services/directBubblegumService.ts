/**
 * Direct Bubblegum Transfer Service
 * 
 * Builds cNFT transfer instructions that call Bubblegum directly,
 * bypassing our escrow program. This is required because:
 * 1. cNFT transfers with proof nodes exceed single transaction size limits
 * 2. Our escrow program doesn't pass proof nodes to Bubblegum CPI
 * 
 * Used with Jito bundles to achieve atomic cNFT swaps:
 * - Transaction 1: SOL transfers (payment + fee)
 * - Transaction 2: cNFT transfer via Bubblegum directly
 */

import {
  Connection,
  PublicKey,
  TransactionInstruction,
  AccountMeta,
  SystemProgram,
} from '@solana/web3.js';
import { ConcurrentMerkleTreeAccount } from '@solana/spl-account-compression';
import {
  createTransferInstruction,
  PROGRAM_ID as MPL_BUBBLEGUM_PROGRAM_ID,
} from '@metaplex-foundation/mpl-bubblegum';
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  BUBBLEGUM_PROGRAM_ID,
} from '../constants/bubblegum';
import { CnftService, createCnftService } from './cnftService';
import { isJitoBundlesEnabled } from '../utils/featureFlags';

/**
 * Parameters for building a direct Bubblegum transfer instruction
 */
export interface DirectBubblegumTransferParams {
  /** cNFT asset ID */
  assetId: string;
  /** Current owner (must sign) */
  fromWallet: PublicKey;
  /** New owner */
  toWallet: PublicKey;
  /** Optional delegate (if different from owner) */
  delegate?: PublicKey;
}

/**
 * Result of building a direct Bubblegum transfer
 */
export interface DirectBubblegumTransferResult {
  /** The transfer instruction */
  instruction: TransactionInstruction;
  /** Tree address */
  treeAddress: PublicKey;
  /** Tree authority PDA */
  treeAuthority: PublicKey;
  /** Proof nodes used */
  proofNodes: PublicKey[];
  /** Estimated size in bytes */
  estimatedSize: number;
}

/**
 * Service for building direct Bubblegum transfer instructions
 */
export class DirectBubblegumService {
  private connection: Connection;
  private cnftService: CnftService;

  constructor(connection: Connection) {
    this.connection = connection;
    this.cnftService = createCnftService(connection);
    console.log('[DirectBubblegumService] Initialized');
    console.log(`[DirectBubblegumService] JITO bundles: ${isJitoBundlesEnabled() ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Build a direct Bubblegum transfer instruction with proof nodes
   * 
   * This creates a transfer instruction that calls Bubblegum directly,
   * including all necessary proof nodes as remaining accounts.
   * 
   * @param params - Transfer parameters
   * @param retryCount - Retry attempt number (for stale proof retries)
   * @param preFetchedProof - Optional pre-fetched proof from batch fetch (for JITO bundles)
   */
  async buildTransferInstruction(
    params: DirectBubblegumTransferParams,
    retryCount = 0,
    preFetchedProof?: any
  ): Promise<DirectBubblegumTransferResult> {
    console.log('[DirectBubblegumService] Building transfer instruction:', {
      assetId: params.assetId,
      from: params.fromWallet.toBase58(),
      to: params.toWallet.toBase58(),
      retryAttempt: retryCount,
      usingPreFetchedProof: !!preFetchedProof,
    });

    let transferParams: any;
    
    // Use pre-fetched proof if provided (from batch fetch for JITO bundles)
    if (preFetchedProof) {
      console.log(`[DirectBubblegumService] Using batched proof for asset ${params.assetId.substring(0, 12)}...`);
      
      // Validate pre-fetched proof structure
      if (!preFetchedProof.proof || !preFetchedProof.root) {
        console.warn(`[DirectBubblegumService] Invalid pre-fetched proof structure, falling back to individual fetch`);
        // Fallback to individual fetch
        transferParams = await this.cnftService.buildTransferParams(
          params.assetId,
          params.fromWallet,
          params.toWallet,
          true,
          retryCount
        );
      } else {
        // Use pre-fetched proof - still need to fetch asset data for tree/authority
        const assetData = await this.cnftService.getCnftAsset(params.assetId);
        
        // Validate ownership
        if (assetData.ownership.owner !== params.fromWallet.toBase58()) {
          throw new Error(
            `Ownership mismatch: Asset owned by ${assetData.ownership.owner}, expected ${params.fromWallet.toBase58()}`
          );
        }
        
        const treeAddress = new PublicKey(assetData.compression.tree);
        const treeAuthorityAddress = this.cnftService.deriveTreeAuthority(treeAddress);
        
        // Convert pre-fetched proof to CnftProof format
        const cnftProof = await this.cnftService.convertDasProofToCnftProofAsync(preFetchedProof, assetData);
        
        transferParams = {
          treeAddress,
          treeAuthorityAddress,
          fromAddress: params.fromWallet,
          toAddress: params.toWallet,
          proof: cnftProof,
          delegateAddress: assetData.ownership.delegate 
            ? new PublicKey(assetData.ownership.delegate) 
            : undefined,
        };
      }
    } else {
      // Fetch cNFT data and proof from DAS API (individual fetch)
      console.log(`[DirectBubblegumService] Using individual proof for asset ${params.assetId.substring(0, 12)}...`);
      // CRITICAL: On first attempt (retryCount === 0), skip cache to get fresh proof proactively
      // This prevents stale proof errors on the first attempt
      // On retries, also skip cache to ensure fresh proofs
      transferParams = await this.cnftService.buildTransferParams(
        params.assetId,
        params.fromWallet,
        params.toWallet,
        true, // Always skip cache to get fresh proofs (prevents first-attempt failures)
        retryCount // Pass retryCount for cache-busting (via unique JSON-RPC request IDs)
      );
    }

    const {
      treeAddress,
      treeAuthorityAddress,
      proof,
    } = transferParams;

    // Determine canopy type FIRST (needed for validation error handling)
    const proofNodesRaw = proof.proof || [];
    const isFullCanopyTree = proofNodesRaw.length === 0;

    // CRITICAL: Validate proof root against on-chain root to detect stale DAS data
    // For partial canopy trees, this validation is MANDATORY (stale proofs cause failures)
    // For full canopy trees, validation is best-effort (all proof nodes are on-chain)
    try {
      const treeAccount = await ConcurrentMerkleTreeAccount.fromAccountAddress(
        this.connection,
        treeAddress
      );
      const onChainRoot = Buffer.from(treeAccount.getCurrentRoot());
      const proofRoot = Buffer.from(proof.root);
      
      if (!onChainRoot.equals(proofRoot)) {
        // IMPROVEMENT: Significantly increased retries and delays for high-activity trees
        // Research shows: Trees like treeGzx9ZNFS3YwB6NPba8uePLctVRHz8uhWQYqjEys can update
        // faster than DAS APIs can index, requiring much longer delays between retries.
        // QuickNode free tier has 2 req/sec limit, so we need to space retries further apart.
        // Reduced retry count - if DAS is consistently stale, more retries won't help
        // Most swaps should work on first try, second try with delay should catch indexer lag
        const maxRetriesEnv = parseInt(process.env.CNFT_STALE_PROOF_MAX_RETRIES || '3', 10);
        const maxRetries = Number.isFinite(maxRetriesEnv) && maxRetriesEnv > 0 ? maxRetriesEnv : 3;
        // Longer delays to give DAS indexer time to catch up: 3s, 6s, 10s
        const retryDelays = [3000, 6000, 10000];
        
        console.warn('[DirectBubblegumService] ⚠️ STALE PROOF DETECTED:', {
          onChainRoot: onChainRoot.toString('hex'),
          proofRoot: proofRoot.toString('hex'),
          treePubkey: treeAddress.toBase58(),
          currentSeq: treeAccount.getCurrentSeq().toString(),
          isFullCanopyTree,
          retryCount,
          maxRetries,
        });
        
        // If we haven't exhausted retries, clear cache and retry with fresh proof
        if (retryCount < maxRetries) {
          console.log(`[DirectBubblegumService] Clearing proof cache and fetching fresh proof (attempt ${retryCount + 1}/${maxRetries})...`);
          
          // Clear the cached proof for this asset
          this.cnftService.clearCachedProof(params.assetId);
          
          // Progressive delay: longer waits for subsequent retries
          // This gives the DAS API and tree more time to update
          const delay = retryDelays[retryCount] || 2000;
          console.log(`[DirectBubblegumService] Waiting ${delay}ms for tree updates to propagate...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // CRITICAL: Wait for tree sequence to stabilize before retrying
          // If the tree is actively updating, we need to wait until it stops changing
          // This prevents fetching proofs while the tree is mid-update
          // Reduced checks - if tree doesn't stabilize quickly, it's too active to swap
          const maxStabilityChecksEnv = parseInt(process.env.CNFT_STABILITY_MAX_CHECKS || '3', 10);
          const maxStabilityChecks = Number.isFinite(maxStabilityChecksEnv) && maxStabilityChecksEnv > 0 ? maxStabilityChecksEnv : 3;
          const stabilityCheckIntervalEnv = parseInt(process.env.CNFT_STABILITY_CHECK_INTERVAL || '1000', 10);
          const stabilityCheckInterval = Number.isFinite(stabilityCheckIntervalEnv) && stabilityCheckIntervalEnv > 0 ? stabilityCheckIntervalEnv : 1000;
          let lastSeq = treeAccount.getCurrentSeq();
          let stableCount = 0;
          const requiredStableChecksEnv = parseInt(process.env.CNFT_STABILITY_REQUIRED_CHECKS || '2', 10);
          const requiredStableChecks = Number.isFinite(requiredStableChecksEnv) && requiredStableChecksEnv > 0 ? requiredStableChecksEnv : 2;
          
          console.log(`[DirectBubblegumService] Waiting for tree sequence to stabilize (current: ${lastSeq.toString()})...`);
          
          for (let check = 0; check < maxStabilityChecks; check++) {
            await new Promise(resolve => setTimeout(resolve, stabilityCheckInterval));
            
            try {
              const currentTreeAccount = await ConcurrentMerkleTreeAccount.fromAccountAddress(
                this.connection,
                treeAddress
              );
              const currentSeq = currentTreeAccount.getCurrentSeq();
              
              if (currentSeq.toString() === lastSeq.toString()) {
                stableCount++;
                console.log(`[DirectBubblegumService] Tree sequence stable: ${currentSeq.toString()} (${stableCount}/${requiredStableChecks} checks)`);
                
                if (stableCount >= requiredStableChecks) {
                  console.log(`[DirectBubblegumService] ✅ Tree sequence stabilized at ${currentSeq.toString()}`);
                  break;
                }
              } else {
                console.log(`[DirectBubblegumService] Tree sequence changed: ${lastSeq.toString()} → ${currentSeq.toString()} (tree still updating)`);
                lastSeq = currentSeq;
                stableCount = 0; // Reset stability counter
              }
            } catch (seqError) {
              console.warn('[DirectBubblegumService] Could not check tree sequence:', seqError);
              // Continue anyway - we'll retry with fresh proof
              break;
            }
          }
          
          if (stableCount < requiredStableChecks) {
            console.warn(`[DirectBubblegumService] ⚠️ Tree sequence did not fully stabilize (${stableCount}/${requiredStableChecks} stable checks), but proceeding with retry`);
          }
          
          // Retry with fresh proof (skip cache)
          console.log('[DirectBubblegumService] Retrying with fresh proof...');
          return this.buildTransferInstruction(params, retryCount + 1);
        }
        
        // If all retries failed, throw error with detailed information
        throw new Error(
          `Stale Merkle proof detected after ${maxRetries} refresh attempts. ` +
          `DAS root ${proofRoot.toString('hex').slice(0, 16)}... ` +
          `does not match on-chain root ${onChainRoot.toString('hex').slice(0, 16)}... ` +
          `This indicates the Merkle tree is updating faster than the DAS API can provide fresh proofs. ` +
          `Tree: ${treeAddress.toBase58()}, Sequence: ${treeAccount.getCurrentSeq().toString()}`
        );
      }
      console.log('[DirectBubblegumService] ✅ Proof root validated against on-chain');
    } catch (validationError: any) {
      // Always re-throw stale proof errors (unless we're retrying)
      if (validationError.message.includes('Stale Merkle proof') && retryCount > 0) {
        throw validationError;
      }
      
      // For partial canopy trees, validation failure is critical - we can't proceed safely
      // because stale external proof nodes would cause cryptic Bubblegum failures
      if (!isFullCanopyTree) {
        console.error('[DirectBubblegumService] ❌ Proof validation failed for partial canopy tree');
        throw new Error(
          `Cannot validate proof for partial canopy tree: ${validationError.message}. ` +
          `Refusing to proceed as stale proofs would cause transaction failure.`
        );
      }
      
      // For full canopy trees (no external proof nodes), validation failure is non-critical
      // because all proof nodes are stored on-chain - the Bubblegum program will validate
      console.warn(
        '[DirectBubblegumService] ⚠️ Could not validate proof root (full canopy tree, continuing):',
        validationError.message
      );
    }

    // Convert proof nodes to PublicKey array for remaining accounts
    // Each proof node is a 32-byte array
    const proofNodes: PublicKey[] = proofNodesRaw.map((node: number[] | Uint8Array) => {
      // Handle both number[] and Uint8Array types
      const nodeBuffer = node instanceof Uint8Array ? node : Buffer.from(node);
      return new PublicKey(nodeBuffer);
    });

    console.log('[DirectBubblegumService] Proof details:', {
      treeAddress: treeAddress.toBase58(),
      treeAuthority: treeAuthorityAddress.toBase58(),
      proofNodesCount: proofNodes.length,
      leafIndex: proof.index,
    });

    // Build the transfer instruction using mpl-bubblegum
    // The instruction accounts are: treeAuthority, leafOwner, leafDelegate, newLeafOwner,
    // merkleTree, logWrapper, compressionProgram, systemProgram
    const instruction = createTransferInstruction(
      {
        treeAuthority: treeAuthorityAddress,
        leafOwner: params.fromWallet,
        leafDelegate: params.delegate || params.fromWallet,
        newLeafOwner: params.toWallet,
        merkleTree: treeAddress,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      },
      {
        root: Array.from(proof.root),
        dataHash: Array.from(proof.dataHash),
        creatorHash: Array.from(proof.creatorHash),
        // mpl-bubblegum expects nonce as number, not bigint (bignum)
        nonce: typeof proof.nonce === 'bigint' ? Number(proof.nonce) : proof.nonce,
        index: proof.index,
      }
    );

    // CRITICAL FIX: mpl-bubblegum library incorrectly sets leafOwner.isSigner = false
    // Bubblegum actually requires the leafOwner (or leafDelegate if different) to sign
    // Find and fix the signer account
    const signerPubkey = params.delegate || params.fromWallet;
    const signerIndex = instruction.keys.findIndex(
      key => key.pubkey.equals(signerPubkey)
    );
    if (signerIndex !== -1) {
      instruction.keys[signerIndex].isSigner = true;
      console.log('[DirectBubblegumService] Fixed signer flag for:', signerPubkey.toBase58());
    } else {
      console.warn('[DirectBubblegumService] Could not find signer account in instruction keys');
    }

    // Add proof nodes as remaining accounts
    // These are required when canopy depth < max depth
    const proofAccountMetas: AccountMeta[] = proofNodes.map(node => ({
      pubkey: node,
      isSigner: false,
      isWritable: false,
    }));

    // Append proof accounts to the instruction
    instruction.keys.push(...proofAccountMetas);

    // Estimate size: base instruction + proof nodes (32 bytes each)
    const estimatedSize = 200 + (proofNodes.length * 32);

    console.log('[DirectBubblegumService] Transfer instruction built:', {
      accountCount: instruction.keys.length,
      dataSize: instruction.data.length,
      proofNodes: proofNodes.length,
      estimatedSize,
    });

    return {
      instruction,
      treeAddress,
      treeAuthority: treeAuthorityAddress,
      proofNodes,
      estimatedSize,
    };
  }

  /**
   * Verify that a cNFT transfer would succeed (simulation)
   */
  async simulateTransfer(
    params: DirectBubblegumTransferParams
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { instruction } = await this.buildTransferInstruction(params);
      
      // Create a minimal transaction for simulation
      const { Transaction } = await import('@solana/web3.js');
      const recentBlockhash = await this.connection.getLatestBlockhash();
      
      const tx = new Transaction({
        recentBlockhash: recentBlockhash.blockhash,
        feePayer: params.fromWallet,
      }).add(instruction);

      // Simulate
      const simulation = await this.connection.simulateTransaction(tx);
      
      if (simulation.value.err) {
        return {
          success: false,
          error: JSON.stringify(simulation.value.err),
        };
      }

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get the CnftService instance for direct access
   */
  getCnftService(): CnftService {
    return this.cnftService;
  }
}

/**
 * Create a DirectBubblegumService instance
 */
export function createDirectBubblegumService(connection: Connection): DirectBubblegumService {
  return new DirectBubblegumService(connection);
}

