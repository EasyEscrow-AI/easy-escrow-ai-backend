/**
 * TEST-ONLY Swap Execution Routes
 * 
 * ⚠️ SECURITY WARNING ⚠️
 * This file contains DANGEROUS functionality that signs transactions
 * using private keys stored in environment variables.
 * 
 * Protected by:
 * - Password protection on the test page
 * - X-Test-Execution header requirement
 * - Environment-specific private keys
 */

import { Router, Request, Response } from 'express';
import { Connection, Keypair, Transaction, VersionedTransaction, sendAndConfirmTransaction, SystemProgram, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { PrismaClient } from '../generated/prisma';
import { offerManager } from './offers.routes';
import { getEscrowProgramService } from '../services/escrow-program.service';
import { createTwoPhaseSwapLockService } from '../services/twoPhaseSwapLockService';
import { createCnftDelegationService } from '../services/cnftDelegationService';
import { createSwapStateMachine } from '../services/swapStateMachine';
import { createCnftService } from '../services/cnftService';
import { createTransactionGroupBuilder } from '../services/transactionGroupBuilder';

// Helper function to detect if transaction is versioned (V0)
function isVersionedTransaction(buffer: Buffer): boolean {
  // Versioned transactions start with a version byte
  // Legacy transactions start with signature count (compact-u16)
  // Version 0 is indicated by setting the high bit of the first byte
  return buffer.length > 0 && (buffer[0] & 0x80) !== 0;
}

const router = Router();

// Initialize connection
const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

// Initialize CnftService for cache management during stale proof retry
const cnftService = createCnftService(connection);

// Determine network type - must match logic in test.routes.ts config endpoint
const nodeEnv = process.env.NODE_ENV || 'development';
const network = process.env.SOLANA_NETWORK || 'devnet';
const rpcUrl = process.env.SOLANA_RPC_URL || '';
// Use same detection as config: NODE_ENV=production OR SOLANA_NETWORK=mainnet-beta OR RPC URL contains mainnet
const isMainnet = nodeEnv === 'production' || network === 'mainnet-beta' || rpcUrl.includes('mainnet');
const networkName = isMainnet ? 'mainnet-beta' : 'devnet';

// Initialize Prisma and TwoPhaseSwapLockService for lock transaction rebuilding
const prisma = new PrismaClient();
const programId = new PublicKey(process.env.ESCROW_PROGRAM_ID || 'AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei');
const feeCollector = new PublicKey(process.env.PLATFORM_FEE_COLLECTOR || 'Fyh6zX7qN5WoR3T22N8r9L3KSr6yB8J6wz2CQkhwGDWP');

// Load platform admin keypair for delegate - required for cNFT settlement and JIT rebuilding
// MUST use same env vars as offers.routes.ts: DEVNET_STAGING_ADMIN_PRIVATE_KEY / MAINNET_PROD_ADMIN_PRIVATE_KEY
const adminPrivateKey = isMainnet
  ? process.env.MAINNET_PROD_ADMIN_PRIVATE_KEY
  : process.env.DEVNET_STAGING_ADMIN_PRIVATE_KEY;
let platformAuthorityKeypair: Keypair;
let delegateAuthority: PublicKey;
if (adminPrivateKey) {
  try {
    platformAuthorityKeypair = Keypair.fromSecretKey(bs58.decode(adminPrivateKey));
    delegateAuthority = platformAuthorityKeypair.publicKey;
  } catch {
    throw new Error('[TestExecuteRoutes] Invalid admin private key format - cannot initialize delegate authority');
  }
} else {
  throw new Error(
    '[TestExecuteRoutes] Admin private key required for cNFT settlement. ' +
    'Use DEVNET_STAGING_ADMIN_PRIVATE_KEY for staging or MAINNET_PROD_ADMIN_PRIVATE_KEY for production.'
  );
}

const twoPhaseSwapLockService = createTwoPhaseSwapLockService(
  connection,
  prisma,
  programId,
  feeCollector,
  delegateAuthority // Backend signer's public key for cNFT settlement
);
console.log('[TestExecuteRoutes] TwoPhaseSwapLockService initialized for lock transaction rebuilding');
console.log('[TestExecuteRoutes] Delegate authority:', delegateAuthority.toBase58());

// Initialize swap state machine for delegation cleanup
const swapStateMachine = createSwapStateMachine(prisma);

// Initialize TransactionGroupBuilder for JIT cNFT transaction rebuilding
// This is used when sequential RPC execution encounters stale proofs
const transactionGroupBuilder = createTransactionGroupBuilder(
  connection,
  platformAuthorityKeypair,
  feeCollector // Treasury PDA for platform fees
);
console.log('[TestExecuteRoutes] TransactionGroupBuilder initialized for JIT cNFT rebuilding');

// Export for explicit cleanup on shutdown
export { transactionGroupBuilder };

/**
 * Cleanup delegations for a failed swap
 *
 * This function revokes all cNFT delegations that were made as part of a swap
 * but not yet settled. Called when a swap fails to prevent stale delegations.
 *
 * @param swapId - The swap ID to cleanup
 * @param testWallets - Map of wallet addresses to their keypairs (for signing revokes)
 */
async function cleanupFailedSwapDelegations(
  swapId: string,
  testWallets: Map<string, Keypair>
): Promise<{ success: boolean; revokedCount: number; errors: string[] }> {
  console.log(`\n🧹 CLEANING UP DELEGATIONS FOR FAILED SWAP ${swapId}`);

  const errors: string[] = [];
  let revokedCount = 0;

  try {
    // Get all delegated assets that need cleanup
    const result = await swapStateMachine.getDelegatedAssetsForCleanup(swapId);

    if (!result.success) {
      console.warn(`   ⚠️ Could not get delegated assets: ${result.error}`);
      return { success: false, revokedCount: 0, errors: [result.error || 'Unknown error'] };
    }

    if (result.assets.length === 0) {
      console.log('   ✅ No delegated assets to clean up');
      return { success: true, revokedCount: 0, errors: [] };
    }

    console.log(`   📋 Found ${result.assets.length} delegated asset(s) to revoke`);

    const delegationService = createCnftDelegationService(connection);

    for (const asset of result.assets) {
      console.log(`   🔄 Revoking delegation for ${asset.assetId} (Party ${asset.party})`);

      // Get the owner's keypair from test wallets
      const ownerKeypair = testWallets.get(asset.owner);
      if (!ownerKeypair) {
        const error = `No keypair available for owner ${asset.owner}`;
        console.warn(`   ⚠️ ${error}`);
        errors.push(error);
        continue;
      }

      try {
        // Build revoke instruction
        const revokeResult = await delegationService.buildRevokeInstruction({
          assetId: asset.assetId,
          ownerPubkey: ownerKeypair.publicKey,
        });

        // Build and send transaction
        const transaction = new Transaction();
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.feePayer = ownerKeypair.publicKey;
        transaction.add(revokeResult.instruction);
        transaction.sign(ownerKeypair);

        const signature = await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

        await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

        console.log(`   ✅ Revoked delegation for ${asset.assetId}: ${signature}`);
        revokedCount++;
      } catch (revokeError: any) {
        const error = `Failed to revoke ${asset.assetId}: ${revokeError.message}`;
        console.error(`   ❌ ${error}`);
        errors.push(error);
      }
    }

    console.log(`\n🧹 CLEANUP COMPLETE: ${revokedCount}/${result.assets.length} delegations revoked`);

    return {
      success: errors.length === 0,
      revokedCount,
      errors,
    };
  } catch (error: any) {
    console.error('   ❌ Cleanup failed:', error.message);
    return { success: false, revokedCount, errors: [error.message] };
  }
}

/**
 * Check if error is caused by stale cNFT Merkle proof
 *
 * Stale proofs can be detected in multiple ways:
 * 1. During preflight simulation: error.message or error.logs contain known indicators
 * 2. On-chain failure: error.errorCode === 21 (StaleProof from AtomicSwapError)
 * 3. Bubblegum program error 6001 (AssetOwnerMismatch or invalid proof)
 * 4. Message contains the error code reference
 *
 * Bubblegum error codes relevant to stale proofs:
 * - 6001: AssetOwnerMismatch / Invalid proof (most common for stale proofs after tree change)
 * - 6002: PublicKeyMismatch
 */
function isCnftProofStaleError(error: any): boolean {
  const message = error?.message || '';
  const logs = error?.logs || [];
  const errorCode = error?.errorCode;

  // Check for on-chain StaleProof error (error code 21 from our escrow program)
  // This catches errors thrown from confirmation.value.err
  if (errorCode === 21) {
    return true;
  }

  // Check for Bubblegum program stale proof errors
  // Error 6001 typically indicates the Merkle root has changed since proof generation
  if (errorCode === 6001) {
    return true;
  }

  // Also check if the error message mentions error codes (StaleProof or Bubblegum 6001)
  if (message.includes('error code 21') || message.includes('StaleProof')) {
    return true;
  }
  if (message.includes('error code 6001') || message.includes('custom error code 6001')) {
    return true;
  }

  const staleProofIndicators = [
    'Invalid root recomputed from proof',
    'Error using concurrent merkle tree',
    'Merkle proof verification failed',
    'AssetOwnerMismatch',
    'Custom(6001)',
    '{"Custom":6001}',    // JSON format from on-chain error (with delimiters to prevent false positives)
  ];

  return staleProofIndicators.some(indicator =>
    message.includes(indicator) ||
    logs.some((log: string) => log.includes(indicator))
  );
}

/**
 * Security middleware - requires test header for execution
 * Works on both devnet (staging) and mainnet (production)
 */
function requireTestEnvironment(req: Request, res: Response, next: any) {
  // Check: Must have test header (prevents accidental calls)
  const testHeader = req.headers['x-test-execution'];
  
  if (testHeader !== 'true') {
    console.error('🚨 SECURITY: Missing X-Test-Execution header');
    return res.status(403).json({
      success: false,
      error: 'Missing required test header',
      timestamp: new Date().toISOString(),
    });
  }
  
  console.log(`✅ Test environment check passed - executing on ${networkName}`);
  next();
}

/**
 * POST /api/test/execute-swap
 * 
 * ⚠️ TEST ONLY - Executes a real atomic swap using private keys from ENV
 * 
 * Security:
 * - Only works on devnet
 * - Requires X-Test-Execution: true header
 * - Private keys never exposed to frontend
 * - Extensive logging for audit trail
 */
router.post('/api/test/execute-swap', requireTestEnvironment, async (req: Request, res: Response) => {
  console.log('\n🧪 TEST SWAP EXECUTION REQUEST');
  console.log('⏰ Timestamp:', new Date().toISOString());
  console.log('📍 Network:', process.env.SOLANA_RPC_URL);
  
  try {
    let { serializedTransaction, requireSignatures, offerId, bulkSwapInfo } = req.body;
    
    // offerId is optional - used for cNFT proof retry logic
    if (offerId) {
      console.log('📋 Offer ID:', offerId, '(will rebuild transaction if proof is stale)');
    }
    
    // ========== BULK SWAP HANDLING ==========
    // Bulk swaps can use Jito bundles (mainnet) or sequential execution (devnet)
    if (bulkSwapInfo && bulkSwapInfo.transactions && bulkSwapInfo.transactions.length > 1) {
      console.log(`\n🚀 BULK SWAP DETECTED: ${bulkSwapInfo.transactions.length} transactions`);
      console.log(`   Strategy: ${bulkSwapInfo.strategy}`);
      console.log(`   Requires Jito Bundle: ${bulkSwapInfo.requiresJitoBundle || false}`);
      
      // Load keypairs first
      let makerPrivateKey: string | undefined;
      let takerPrivateKey: string | undefined;
      
      if (isMainnet) {
        makerPrivateKey = process.env.MAINNET_PROD_SENDER_PRIVATE_KEY;
        takerPrivateKey = process.env.MAINNET_PROD_RECEIVER_PRIVATE_KEY;
      } else {
        makerPrivateKey = process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY;
        takerPrivateKey = process.env.DEVNET_STAGING_RECEIVER_PRIVATE_KEY;
      }
      
      if (!makerPrivateKey || !takerPrivateKey) {
        return res.status(500).json({
          success: false,
          error: `Test wallet private keys not configured for ${networkName}`,
          timestamp: new Date().toISOString(),
        });
      }
      
      const makerKeypair = Keypair.fromSecretKey(bs58.decode(makerPrivateKey));
      const takerKeypair = Keypair.fromSecretKey(bs58.decode(takerPrivateKey));
      const makerAddress = makerKeypair.publicKey.toBase58();
      const takerAddress = takerKeypair.publicKey.toBase58();
      
      console.log('✅ Keypairs loaded for bulk swap');
      console.log('   Maker:', makerAddress);
      console.log('   Taker:', takerAddress);

      // Check if Jito bundle is required (mainnet with requiresJitoBundle flag)
      // Note: cNFT-to-cNFT swaps are routed to two-phase delegation at accept time,
      // so they won't have requiresJitoBundle=true. This path is for SPL/Core NFT bundles.
      if (bulkSwapInfo.requiresJitoBundle && isMainnet) {
        console.log('\n📦 Using Jito Bundle for atomic execution...');

        try {
          // ========== PROACTIVE STALE PROOF VALIDATION ==========
          // Validate all cNFT proofs BEFORE signing to prevent stale proof errors
          // This is critical because proofs can become stale during the 5+ second signing window
          const cnftTransactions = bulkSwapInfo.transactions.filter(
            (tx: any) => tx.purpose && tx.purpose.includes('cNFT transfer')
          );

          if (cnftTransactions.length > 0 && offerId) {
            console.log(`\n🔍 Proactively validating ${cnftTransactions.length} cNFT proof(s) before submission...`);

            // Create CnftService to validate proofs
            const cnftService = createCnftService(connection);

            // Extract asset IDs from cNFT transactions
            // Note: We extract from tx.assets directly, not from purpose string regex
            // This handles both single cNFT transfers and batch transfers correctly
            const assetIds: string[] = [];
            for (const tx of cnftTransactions) {
              // Find cNFT assets in both maker and taker assets arrays
              const makerCnfts = (tx.assets?.makerAssets || []).filter((a: any) =>
                a.type === 'cnft' || a.type === 'CNFT'
              );
              const takerCnfts = (tx.assets?.takerAssets || []).filter((a: any) =>
                a.type === 'cnft' || a.type === 'CNFT'
              );

              // Add all cNFT asset IDs (supports batch transfers with multiple cNFTs)
              for (const asset of [...makerCnfts, ...takerCnfts]) {
                if (asset?.identifier) {
                  assetIds.push(asset.identifier);
                }
              }
            }

            // Fallback: If no assets in transaction data, load from offer
            if (assetIds.length === 0 && offerId) {
              console.log('   📋 No assets in transaction data, loading from offer...');
              try {
                const offer = await offerManager.getOffer(offerId);
                if (offer) {
                  // OfferSummary uses offeredAssets/requestedAssets (maker's offered = makerAssets)
                  for (const asset of (offer.offeredAssets || [])) {
                    if ((asset.type === 'cnft' || asset.type === 'CNFT') && asset.identifier) {
                      assetIds.push(asset.identifier);
                    }
                  }
                  for (const asset of (offer.requestedAssets || [])) {
                    if ((asset.type === 'cnft' || asset.type === 'CNFT') && asset.identifier) {
                      assetIds.push(asset.identifier);
                    }
                  }
                  if (assetIds.length > 0) {
                    console.log(`   ✅ Loaded ${assetIds.length} cNFT asset ID(s) from offer`);
                  }
                }
              } catch (offerError: any) {
                console.warn('   ⚠️  Could not load offer for asset IDs:', offerError.message);
              }
            }

            if (assetIds.length > 0) {
              // Validate each proof against on-chain root
              let hasStaleProof = false;

              for (const assetId of assetIds) {
                try {
                  // Get cached proof root
                  const cachedProof = await cnftService.getCnftProof(assetId, false, 0);
                  if (cachedProof) {
                    const validation = await cnftService.validateProofRoot(assetId, cachedProof.root);

                    if (!validation.isValid) {
                      console.warn(`   ⚠️  Stale proof detected for asset ${assetId.substring(0, 12)}...`);
                      hasStaleProof = true;
                    } else {
                      console.log(`   ✅ Proof valid for asset ${assetId.substring(0, 12)}...`);
                    }
                  }
                } catch (validationError: any) {
                  console.warn(`   ⚠️  Could not validate proof for ${assetId.substring(0, 12)}...:`, validationError.message);
                }
              }

              if (hasStaleProof) {
                console.log('\n🔄 Stale proofs detected! Rebuilding transactions with fresh proofs...');

                // Rebuild all transactions with fresh proofs
                const rebuildResult = await offerManager.rebuildTransaction(offerId);

                if (rebuildResult.transactionGroup?.transactions) {
                  console.log(`   ✅ Transactions rebuilt (${rebuildResult.transactionGroup.transactions.length} total)`);

                  // Replace bulkSwapInfo.transactions with fresh transactions (include cNFT JIT metadata)
                  bulkSwapInfo.transactions = rebuildResult.transactionGroup.transactions.map((tx: any) => ({
                    purpose: tx.purpose,
                    assets: tx.assets,
                    serialized: tx.transaction?.serializedTransaction,
                    requiredSigners: tx.transaction?.requiredSigners,
                    // cNFT JIT rebuild metadata
                    cnftAssetId: tx.cnftAssetId,
                    cnftFromWallet: tx.cnftFromWallet,
                    cnftToWallet: tx.cnftToWallet,
                  }));

                  console.log('   ✅ Using fresh transactions for bundle submission');
                } else {
                  console.error('   ❌ Rebuild did not return valid transactions');
                  return res.status(500).json({
                    success: false,
                    error: 'Failed to rebuild transactions with fresh proofs',
                    errorCode: 'STALE_PROOF_REBUILD_FAILED',
                    timestamp: new Date().toISOString(),
                  });
                }
              } else {
                console.log('   ✅ All proofs are fresh, proceeding with original transactions');
              }
            }
          }
          // ========== END PROACTIVE VALIDATION ==========

          // ========== INJECT JITO TIP IF MISSING ==========
          // Transactions built when ENABLE_JITO_BUNDLES=false won't have a JITO tip.
          // When we force JITO mode for cNFT↔cNFT swaps, we need to add the tip.
          // JITO requires at least one transaction to write-lock an official tip account.
          // Official JITO tip accounts - https://jito-labs.gitbook.io/mev/searcher-resources/tip-accounts
          const JITO_TIP_ACCOUNTS = new Set([
            'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
            'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
            'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe', // Corrected address
            '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
            '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
            'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
            'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
            'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
          ]);
          // JITO tip amount - configurable via env var for congestion periods
          // Default: 1,000,000 lamports (0.001 SOL) - reasonable for normal conditions
          const JITO_TIP_AMOUNT = parseInt(process.env.JITO_TIP_LAMPORTS || '1000000', 10);
          const SOLANA_TX_SIZE_LIMIT = 1232; // Solana transaction size limit in bytes

          // Check last transaction for JITO tip
          const lastTxIndex = bulkSwapInfo.transactions.length - 1;
          const lastTxInfo = bulkSwapInfo.transactions[lastTxIndex];

          if (lastTxInfo?.serialized) {
            const lastTxBuffer = Buffer.from(lastTxInfo.serialized, 'base64');
            const isVersionedLastTx = (lastTxBuffer[0] & 0x80) !== 0;

            if (!isVersionedLastTx) {
              const lastTx = Transaction.from(lastTxBuffer);

              // Check if any instruction writes to a JITO tip account
              let hasTip = false;
              for (const ix of lastTx.instructions) {
                if (ix.programId.equals(SystemProgram.programId)) {
                  // Check writable accounts for JITO tip accounts
                  for (const key of ix.keys) {
                    if (key.isWritable && JITO_TIP_ACCOUNTS.has(key.pubkey.toBase58())) {
                      hasTip = true;
                      console.log(`   ✅ JITO tip already present (to ${key.pubkey.toBase58().substring(0, 8)}...)`);
                      break;
                    }
                  }
                }
                if (hasTip) break;
              }

              if (!hasTip) {
                console.log('\n💰 Adding JITO tip to last transaction (not present in pre-built TX)...');

                // Select a random tip account for load balancing
                const tipAccountsArray = Array.from(JITO_TIP_ACCOUNTS);
                const randomTipAccount = new PublicKey(
                  tipAccountsArray[Math.floor(Math.random() * tipAccountsArray.length)]
                );

                // Add tip instruction
                lastTx.add(
                  SystemProgram.transfer({
                    fromPubkey: platformAuthorityKeypair.publicKey,
                    toPubkey: randomTipAccount,
                    lamports: JITO_TIP_AMOUNT,
                  })
                );

                const tipSol = (JITO_TIP_AMOUNT / 1_000_000_000).toFixed(4);
                console.log(`   💸 Added ${JITO_TIP_AMOUNT} lamports (${tipSol} SOL) tip to ${randomTipAccount.toBase58().substring(0, 12)}...`);

                // Re-sign with platform authority (transaction message changed)
                // IMPORTANT: Adding an instruction changes the transaction message hash,
                // which invalidates ALL existing signatures. We must clear them and re-sign.
                // This is different from partialSign() elsewhere which preserves existing sigs.
                lastTx.signatures = lastTx.signatures.map(sig => ({
                  publicKey: sig.publicKey,
                  signature: null, // Intentionally clear - message changed, old sigs invalid
                }));
                lastTx.partialSign(platformAuthorityKeypair);

                // Update the serialized transaction
                const newSerializedTx = lastTx.serialize({ requireAllSignatures: false });

                // Validate transaction size after adding tip instruction
                if (newSerializedTx.length > SOLANA_TX_SIZE_LIMIT) {
                  console.error(`   ❌ Transaction size ${newSerializedTx.length} exceeds limit ${SOLANA_TX_SIZE_LIMIT} after adding JITO tip`);
                  return res.status(400).json({
                    success: false,
                    error: `Transaction exceeds size limit (${newSerializedTx.length}/${SOLANA_TX_SIZE_LIMIT} bytes) after adding JITO tip. ` +
                           'The cNFT Merkle proof may be too large. Try enabling ENABLE_JITO_BUNDLES=true before creating the offer.',
                    errorCode: 'TX_SIZE_EXCEEDED_AFTER_TIP',
                    txSize: newSerializedTx.length,
                    limit: SOLANA_TX_SIZE_LIMIT,
                    timestamp: new Date().toISOString(),
                  });
                }

                bulkSwapInfo.transactions[lastTxIndex].serialized = newSerializedTx.toString('base64');
                console.log(`   ✅ Last transaction updated with JITO tip (size: ${newSerializedTx.length}/${SOLANA_TX_SIZE_LIMIT} bytes)`);
              }
            } else {
              // Versioned transaction - validate that it already contains a JITO tip
              // We cannot easily inject tips into versioned transactions due to ALT complexity,
              // so we verify the tip exists and fail if not.
              console.log('   🔍 Checking versioned transaction for JITO tip...');

              const versionedTx = VersionedTransaction.deserialize(lastTxBuffer);
              const message = versionedTx.message;

              // Collect all account keys (static + any from address lookup tables)
              const allAccountKeys: string[] = [];

              // Add static account keys
              for (const key of message.staticAccountKeys) {
                allAccountKeys.push(key.toBase58());
              }

              // For V0 messages, also check address lookup table entries
              // The loaded addresses would be resolved at runtime, but we can check
              // if the transaction is configured to use ALTs that might contain tip accounts
              if ('addressTableLookups' in message && message.addressTableLookups) {
                // Note: We can't resolve ALT addresses without fetching the ALT account data.
                // For now, we only check static keys. If using ALTs, the tip should be in static keys.
                console.log(`   📋 Transaction has ${message.addressTableLookups.length} address lookup table(s)`);
              }

              // Check if any static account key is a JITO tip account
              let versionedHasTip = false;
              for (const accountKey of allAccountKeys) {
                if (JITO_TIP_ACCOUNTS.has(accountKey)) {
                  versionedHasTip = true;
                  console.log(`   ✅ JITO tip account found in versioned TX: ${accountKey.substring(0, 12)}...`);
                  break;
                }
              }

              if (!versionedHasTip) {
                console.error('   ❌ Versioned transaction missing JITO tip account');
                return res.status(400).json({
                  success: false,
                  error: 'JITO bundle requires a tip but versioned transaction has no tip account. ' +
                         'Rebuild the transaction with ENABLE_JITO_BUNDLES=true to include the tip.',
                  errorCode: 'VERSIONED_TX_MISSING_JITO_TIP',
                  suggestion: 'Set ENABLE_JITO_BUNDLES=true and recreate the offer to include JITO tips in transactions.',
                  timestamp: new Date().toISOString(),
                });
              }
            }
          }
          // ========== END INJECT JITO TIP ==========

          // Collect and sign all transactions
          const signedTransactions: string[] = [];

          for (let i = 0; i < bulkSwapInfo.transactions.length; i++) {
            const txInfo = bulkSwapInfo.transactions[i];
            console.log(`\n📝 Signing TX ${i + 1}/${bulkSwapInfo.transactions.length}: ${txInfo.purpose}`);
            
            if (!txInfo.serialized) {
              return res.status(400).json({
                success: false,
                error: `Transaction ${i + 1} missing serialized data`,
                timestamp: new Date().toISOString(),
              });
            }
            
            const txBuffer = Buffer.from(txInfo.serialized, 'base64');
            const isVersioned = (txBuffer[0] & 0x80) !== 0;
            
            // Determine signers for THIS specific transaction
            const txRequiredSigners = txInfo.requiredSigners || requireSignatures || [];
            const signers: Keypair[] = [];
            
            if (txRequiredSigners.includes(makerAddress)) {
              signers.push(makerKeypair);
              console.log('   🔐 Adding Maker signature');
            }
            
            if (txRequiredSigners.includes(takerAddress)) {
              signers.push(takerKeypair);
              console.log('   🔐 Adding Taker signature');
            }
            
            // Sign the transaction
            let signedTxBuffer: Buffer;
            if (isVersioned) {
              const versionedTx = VersionedTransaction.deserialize(txBuffer);
              if (signers.length > 0) {
                versionedTx.sign(signers);
              }
              signedTxBuffer = Buffer.from(versionedTx.serialize());
            } else {
              const tx = Transaction.from(txBuffer);
              
              // Debug: Log transaction structure for troubleshooting
              if (i === 0) {
                // Extract account keys from instructions to see if nonce account is included
                const accountKeys = new Set<string>();
                tx.instructions.forEach(ix => {
                  ix.keys.forEach(key => {
                    accountKeys.add(key.pubkey.toBase58());
                  });
                });
                
                // Check if this is a durable nonce transaction by looking for nonce advance instruction
                // SystemProgram.nonceAdvance() creates an instruction with:
                // - programId = SystemProgram.programId
                // - data = [4, 0, 0, 0] (instruction discriminator for nonceAdvance)
                const hasNonceAdvance = tx.instructions.some(ix => {
                  if (!ix.programId.equals(SystemProgram.programId)) return false;
                  if (ix.data.length !== 4) return false;
                  // SystemProgram instruction 4 = nonceAdvance
                  // Data format: [instruction_discriminator (4 bytes)]
                  return ix.data[0] === 4 && ix.data[1] === 0 && ix.data[2] === 0 && ix.data[3] === 0;
                });
                
                // Note: We can't reliably detect durable nonces by blockhash length alone
                // Both regular blockhashes and nonce values are 32-byte base58-encoded (43-44 chars)
                // The presence of a nonce advance instruction is the definitive indicator
                
                console.log(`   🔍 TX ${i + 1} structure:`, {
                  instructionCount: tx.instructions.length,
                  signatureCount: tx.signatures.length,
                  feePayer: tx.feePayer?.toBase58(),
                  recentBlockhash: tx.recentBlockhash?.substring(0, 16) + '...',
                  recentBlockhashLength: tx.recentBlockhash?.length,
                  isDurableNonce: hasNonceAdvance, // Use instruction check, not length
                  hasNonceAdvance: hasNonceAdvance,
                  firstInstructionProgram: tx.instructions[0]?.programId?.toBase58(),
                  firstInstructionDataLength: tx.instructions[0]?.data.length,
                  firstInstructionData: tx.instructions[0]?.data.slice(0, 4).toString('hex'),
                  accountKeysCount: accountKeys.size,
                  accountKeys: Array.from(accountKeys).slice(0, 5), // First 5 account keys
                });
              }
              
              if (signers.length > 0) {
                // CRITICAL: Use partialSign() to preserve platform authority signature
                // Transaction already has platform authority signature from TransactionGroupBuilder
                // partialSign() adds maker/taker signatures without overwriting existing signatures
                tx.partialSign(...signers);
              }
              
              // Verify all signatures are present before serializing
              const validSignatures = tx.signatures.filter(sig => 
                sig && sig.signature && sig.signature.length === 64 && !sig.signature.every(byte => byte === 0)
              );
              if (validSignatures.length !== tx.signatures.length) {
                console.warn(`   ⚠️ TX ${i + 1} has ${tx.signatures.length} signature slots but only ${validSignatures.length} are valid`);
              }
              
              // For durable nonce transactions, we need to serialize carefully
              // Jito requires fully signed transactions, but requireAllSignatures: true
              // might cause issues with nonce account validation
              // Try with requireAllSignatures: true first, fallback to false if it fails
              try {
                // First try with requireAllSignatures: true (preferred for Jito)
                signedTxBuffer = tx.serialize({ requireAllSignatures: true });
                if (i === 0) {
                  console.log(`   ✅ TX ${i + 1} serialized with requireAllSignatures: true`);
                }
              } catch (serializeError: any) {
                // If that fails, try without the requirement (for durable nonce transactions)
                console.warn(`   ⚠️ TX ${i + 1} serialization with requireAllSignatures: true failed, trying without:`, serializeError.message);
                try {
                  signedTxBuffer = tx.serialize({ requireAllSignatures: false });
                  if (i === 0) {
                    console.log(`   ✅ TX ${i + 1} serialized with requireAllSignatures: false (durable nonce transaction)`);
                  }
                } catch (fallbackError: any) {
                  console.error(`   ❌ TX ${i + 1} serialization failed completely:`, fallbackError.message);
                  return res.status(400).json({
                    success: false,
                    error: `Transaction ${i + 1} cannot be serialized: ${fallbackError.message}. Ensure all required signers have signed.`,
                    timestamp: new Date().toISOString(),
                  });
                }
              }
            }
            
            // Convert to base64 for Jito bundle submission
            signedTransactions.push(signedTxBuffer.toString('base64'));
            console.log(`   ✅ TX ${i + 1} signed`);
          }
          
          // Submit bundle to Jito
          console.log(`\n🚀 Submitting ${signedTransactions.length} transactions as Jito bundle...`);
          const escrowProgramService = getEscrowProgramService();
          
          const bundleResult = await escrowProgramService.sendBundleViaJito(signedTransactions, {
            skipSimulation: true, // Jito doesn't support simulateBundle method
            description: `Bulk swap: ${bulkSwapInfo.strategy}`,
          });
          
          if (!bundleResult.success || !bundleResult.bundleId) {
            return res.status(500).json({
              success: false,
              error: `Jito bundle submission failed: ${bundleResult.error || 'Unknown error'}`,
              timestamp: new Date().toISOString(),
            });
          }
          
          const bundleId = bundleResult.bundleId;
          console.log(`✅ Bundle submitted to Jito: ${bundleId}`);
          
          // Wait for bundle confirmation
          console.log('⏳ Waiting for bundle confirmation...');
          const confirmation = await escrowProgramService.waitForBundleConfirmation(
            bundleId,
            60, // 60s timeout for mainnet
            bundleResult.signatures
          );
          
          if (!confirmation.confirmed) {
            return res.status(500).json({
              success: false,
              error: `Jito bundle ${confirmation.status}: ${confirmation.error || 'Bundle did not land'}`,
              bundleId,
              bundleStatus: confirmation.status,
              timestamp: new Date().toISOString(),
            });
          }
          
          console.log(`✅ Bundle landed in slot ${confirmation.slot}`);
          
          return res.json({
            success: true,
            data: {
              bundleId,
              bundleStatus: confirmation.status,
              slot: confirmation.slot,
              network: networkName,
              isBulkSwap: true,
              transactionCount: bulkSwapInfo.transactions.length,
            },
            timestamp: new Date().toISOString(),
          });
          
        } catch (bundleError: any) {
          console.error('❌ Jito bundle error:', bundleError);
          return res.status(500).json({
            success: false,
            error: `Jito bundle execution failed: ${bundleError.message || 'Unknown error'}`,
            timestamp: new Date().toISOString(),
          });
        }
      }
      
      // Fallback: Execute each transaction sequentially (for devnet or when Jito not required)
      console.log('\n📦 Executing transactions sequentially...');

      // ========== PROACTIVE STALE PROOF VALIDATION FOR SEQUENTIAL EXECUTION ==========
      // Validate all cNFT proofs BEFORE execution to prevent stale proof errors
      const cnftTransactionsSeq = bulkSwapInfo.transactions.filter(
        (tx: any) => tx.purpose && tx.purpose.includes('cNFT transfer')
      );

      if (cnftTransactionsSeq.length > 0 && offerId) {
        console.log(`\n🔍 Proactively validating ${cnftTransactionsSeq.length} cNFT proof(s) before sequential execution...`);

        // Extract asset IDs from cNFT transactions
        const assetIdsSeq: string[] = [];
        for (const tx of cnftTransactionsSeq) {
          const makerCnfts = (tx.assets?.makerAssets || []).filter((a: any) =>
            a.type === 'cnft' || a.type === 'CNFT'
          );
          const takerCnfts = (tx.assets?.takerAssets || []).filter((a: any) =>
            a.type === 'cnft' || a.type === 'CNFT'
          );
          for (const asset of [...makerCnfts, ...takerCnfts]) {
            if (asset?.identifier) {
              assetIdsSeq.push(asset.identifier);
            }
          }
        }

        // Fallback: If no assets in transaction data, load from offer
        if (assetIdsSeq.length === 0 && offerId) {
          console.log('   📋 No assets in transaction data, loading from offer...');
          try {
            const offer = await offerManager.getOffer(offerId);
            if (offer) {
              // OfferSummary uses offeredAssets/requestedAssets (maker's offered = makerAssets)
              for (const asset of (offer.offeredAssets || [])) {
                if ((asset.type === 'cnft' || asset.type === 'CNFT') && asset.identifier) {
                  assetIdsSeq.push(asset.identifier);
                }
              }
              for (const asset of (offer.requestedAssets || [])) {
                if ((asset.type === 'cnft' || asset.type === 'CNFT') && asset.identifier) {
                  assetIdsSeq.push(asset.identifier);
                }
              }
              if (assetIdsSeq.length > 0) {
                console.log(`   ✅ Loaded ${assetIdsSeq.length} cNFT asset ID(s) from offer`);
              }
            }
          } catch (offerError: any) {
            console.warn('   ⚠️  Could not load offer for asset IDs:', offerError.message);
          }
        }

        if (assetIdsSeq.length > 0) {
          let hasStaleProofSeq = false;

          for (const assetId of assetIdsSeq) {
            try {
              const cachedProof = await cnftService.getCnftProof(assetId, false, 0);
              if (cachedProof) {
                const validation = await cnftService.validateProofRoot(assetId, cachedProof.root);

                if (!validation.isValid) {
                  console.warn(`   ⚠️  Stale proof detected for asset ${assetId.substring(0, 12)}...`);
                  hasStaleProofSeq = true;
                } else {
                  console.log(`   ✅ Proof valid for asset ${assetId.substring(0, 12)}...`);
                }
              }
            } catch (validationError: any) {
              console.warn(`   ⚠️  Could not validate proof for ${assetId.substring(0, 12)}...:`, validationError.message);
            }
          }

          if (hasStaleProofSeq) {
            console.log('\n🔄 Stale proofs detected! Rebuilding transactions with fresh proofs...');

            // Clear proof cache and rebuild
            cnftService.clearAllCachedProofs();
            const rebuildResult = await offerManager.rebuildTransaction(offerId);

            if (rebuildResult.transactionGroup?.transactions) {
              console.log(`   ✅ Transactions rebuilt (${rebuildResult.transactionGroup.transactions.length} total)`);

              // Replace bulkSwapInfo.transactions with fresh transactions (include cNFT JIT metadata)
              bulkSwapInfo.transactions = rebuildResult.transactionGroup.transactions.map((tx: any) => ({
                purpose: tx.purpose,
                assets: tx.assets,
                serialized: tx.transaction?.serializedTransaction,
                requiredSigners: tx.transaction?.requiredSigners,
                // cNFT JIT rebuild metadata
                cnftAssetId: tx.cnftAssetId,
                cnftFromWallet: tx.cnftFromWallet,
                cnftToWallet: tx.cnftToWallet,
              }));

              console.log('   ✅ Using fresh transactions for sequential execution');
            } else {
              console.error('   ❌ Rebuild did not return valid transactions');
              return res.status(500).json({
                success: false,
                error: 'Failed to rebuild transactions with fresh proofs',
                errorCode: 'STALE_PROOF_REBUILD_FAILED',
                timestamp: new Date().toISOString(),
              });
            }
          } else {
            console.log('   ✅ All proofs are fresh, proceeding with original transactions');
          }
        }
      }
      // ========== END PROACTIVE VALIDATION ==========

      // ========== POPULATE cNFT JIT METADATA ==========
      // Ensure all cNFT transactions have metadata for JIT rebuild (even if not rebuilt)
      // This extracts cnftAssetId/cnftFromWallet/cnftToWallet from the assets field
      for (const tx of bulkSwapInfo.transactions) {
        if (tx.purpose && tx.purpose.includes('cNFT transfer') && !tx.cnftAssetId) {
          // Extract cNFT asset from maker or taker assets
          const makerCnft = (tx.assets?.makerAssets || []).find((a: any) =>
            a.type === 'cnft' || a.type === 'CNFT'
          );
          const takerCnft = (tx.assets?.takerAssets || []).find((a: any) =>
            a.type === 'cnft' || a.type === 'CNFT'
          );

          if (makerCnft) {
            tx.cnftAssetId = makerCnft.identifier;
            tx.cnftFromWallet = makerAddress; // Maker sends to taker
            tx.cnftToWallet = takerAddress;
          } else if (takerCnft) {
            tx.cnftAssetId = takerCnft.identifier;
            tx.cnftFromWallet = takerAddress; // Taker sends to maker
            tx.cnftToWallet = makerAddress;
          }

          if (tx.cnftAssetId) {
            console.log(`   📋 Populated JIT metadata for ${tx.cnftAssetId.substring(0, 8)}...`);
          }
        }
      }
      // ========== END POPULATE cNFT JIT METADATA ==========

      const signatures: string[] = [];

      for (let i = 0; i < bulkSwapInfo.transactions.length; i++) {
        const txInfo = bulkSwapInfo.transactions[i];
        console.log(`\n📝 Processing TX ${i + 1}/${bulkSwapInfo.transactions.length}: ${txInfo.purpose}`);
        
        if (!txInfo.serialized) {
          console.error(`❌ TX ${i + 1} missing serialized data`);
          return res.status(400).json({
            success: false,
            error: `Transaction ${i + 1} missing serialized data`,
            timestamp: new Date().toISOString(),
          });
        }

        // ========== cNFT RAPID JIT RETRY LOOP ==========
        // For cNFT transactions (TX 2+), use rapid JIT retry with fresh proof on each attempt.
        // Hyperactive Merkle trees can change multiple times per second, so we need to:
        // 1. JIT rebuild with fresh proof
        // 2. Sign and send immediately
        // 3. If stale proof error, immediately retry (up to MAX_JIT_ATTEMPTS)
        //
        // This is more aggressive than single JIT + slow rebuild fallback.
        if (txInfo.cnftAssetId && i > 0) {
          const MAX_JIT_ATTEMPTS = 3;
          let jitSuccess = false;
          let lastSignature = '';

          console.log(`\n🔄 cNFT TX ${i + 1}: Starting rapid JIT retry loop (max ${MAX_JIT_ATTEMPTS} attempts)`);
          console.log(`   Asset: ${txInfo.cnftAssetId.substring(0, 12)}...`);
          console.log(`   From: ${txInfo.cnftFromWallet?.substring(0, 8)}... → To: ${txInfo.cnftToWallet?.substring(0, 8)}...`);

          for (let attempt = 1; attempt <= MAX_JIT_ATTEMPTS && !jitSuccess; attempt++) {
            console.log(`\n   🔄 JIT attempt ${attempt}/${MAX_JIT_ATTEMPTS}...`);

            try {
              // 1. JIT rebuild with fresh proof
              const freshTxItem = await transactionGroupBuilder.buildSingleCnftTransactionJIT(
                txInfo.cnftAssetId,
                new PublicKey(txInfo.cnftFromWallet),
                new PublicKey(txInfo.cnftToWallet),
                `${txInfo.purpose} (attempt ${attempt})`
              );

              if (!freshTxItem.transaction?.serializedTransaction) {
                throw new Error('JIT rebuild returned empty transaction');
              }

              // 2. Determine signers and sign
              const freshRequiredSigners = freshTxItem.transaction.requiredSigners || [];
              const freshSigners: Keypair[] = [];

              if (freshRequiredSigners.includes(makerAddress)) {
                freshSigners.push(makerKeypair);
              }
              if (freshRequiredSigners.includes(takerAddress)) {
                freshSigners.push(takerKeypair);
              }

              const txBuffer = Buffer.from(freshTxItem.transaction.serializedTransaction, 'base64');
              const tx = Transaction.from(txBuffer);
              if (freshSigners.length > 0) {
                tx.partialSign(...freshSigners);
              }

              // 3. Send immediately
              const signature = await connection.sendRawTransaction(tx.serialize(), {
                skipPreflight: false,
                preflightCommitment: 'confirmed',
              });
              lastSignature = signature;
              console.log(`      📤 Sent: ${signature.substring(0, 16)}...`);

              // 4. Wait for confirmation (shorter timeout for rapid retry)
              const confirmation = await Promise.race([
                connection.confirmTransaction(signature, 'confirmed'),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('ConfirmationTimeout')), 15000)
                ),
              ]) as any;

              if (confirmation.value.err) {
                const errorStr = JSON.stringify(confirmation.value.err);
                // Check if stale proof error (6001)
                if (errorStr.includes('6001')) {
                  console.log(`      ⚠️ Stale proof (attempt ${attempt}), retrying immediately...`);
                  continue; // Retry with fresh JIT
                }
                throw new Error(`TX failed on-chain: ${errorStr}`);
              }

              // Success!
              jitSuccess = true;
              signatures.push(signature);
              console.log(`   ✅ TX ${i + 1} confirmed after ${attempt} attempt(s)`);

            } catch (attemptError: any) {
              const errorMsg = attemptError.message || '';

              // Check if this is a stale proof error we can retry
              if (errorMsg.includes('6001') || isCnftProofStaleError(attemptError)) {
                console.log(`      ⚠️ Stale proof error (attempt ${attempt}), retrying...`);
                continue; // Retry with fresh JIT
              }

              // Check if confirmation timeout (might still have landed)
              if (errorMsg.includes('ConfirmationTimeout') && lastSignature) {
                console.log(`      ⏳ Confirmation timeout, checking if TX landed...`);
                await new Promise(r => setTimeout(r, 2000));
                const txStatus = await connection.getTransaction(lastSignature, {
                  commitment: 'confirmed',
                  maxSupportedTransactionVersion: 0,
                });
                if (txStatus && !txStatus.meta?.err) {
                  jitSuccess = true;
                  signatures.push(lastSignature);
                  console.log(`   ✅ TX ${i + 1} confirmed (via fallback check) after ${attempt} attempt(s)`);
                  break;
                }
                // TX didn't land or failed, retry
                console.log(`      ⚠️ TX not found or failed, retrying...`);
                continue;
              }

              // Non-recoverable error - return immediately with partial signatures
              console.error(`      ❌ Attempt ${attempt} failed with non-recoverable error: ${errorMsg}`);
              return res.status(500).json({
                success: false,
                error: `TX ${i + 1} (cNFT transfer) failed with non-recoverable error: ${errorMsg}`,
                errorCode: 'CNFT_TX_FAILED',
                partialSuccess: signatures.length > 0,
                signatures,
                failedTransactionIndex: i,
                timestamp: new Date().toISOString(),
              });
            }
          }

          if (!jitSuccess) {
            const errorMsg = `TX ${i + 1} failed after ${MAX_JIT_ATTEMPTS} rapid JIT attempts. ` +
              `The Merkle tree for this cNFT is too active for sequential RPC execution. ` +
              `Enable JITO bundles (ENABLE_JITO_BUNDLES=true) for atomic cNFT swaps.`;
            console.error(`   ❌ ${errorMsg}`);
            return res.status(500).json({
              success: false,
              error: errorMsg,
              errorCode: 'TREE_TOO_ACTIVE',
              suggestion: 'Enable JITO bundles for mainnet cNFT swaps',
              signatures,
              timestamp: new Date().toISOString(),
            });
          }

          // Small delay before next transaction
          if (i < bulkSwapInfo.transactions.length - 1) {
            await new Promise(r => setTimeout(r, 200));
          }
          continue; // Skip the non-cNFT flow below
        }
        // ========== END cNFT RAPID JIT RETRY LOOP ==========

        // ========== NON-cNFT TRANSACTION FLOW (TX 1: SOL transfers) ==========
        // Determine signers for THIS specific transaction
        const txRequiredSigners = txInfo.requiredSigners || requireSignatures || [];
        const signers: Keypair[] = [];
        
        if (txRequiredSigners.includes(makerAddress)) {
          signers.push(makerKeypair);
          console.log('   🔐 Adding Maker signature');
        }
        
        if (txRequiredSigners.includes(takerAddress)) {
          signers.push(takerKeypair);
          console.log('   🔐 Adding Taker signature');
        }
        
        if (signers.length === 0) {
          console.warn(`   ⚠️ No test wallet signatures needed for TX ${i + 1} (platform-only?)`);
        }
        
        try {
          const txBuffer = Buffer.from(txInfo.serialized, 'base64');
          const isVersioned = (txBuffer[0] & 0x80) !== 0;
          
          let signature: string;
          
          if (isVersioned) {
            const versionedTx = VersionedTransaction.deserialize(txBuffer);
            if (signers.length > 0) {
              versionedTx.sign(signers);
            }
            signature = await connection.sendRawTransaction(versionedTx.serialize(), {
              skipPreflight: false,
              preflightCommitment: 'confirmed',
            });
          } else {
            const tx = Transaction.from(txBuffer);
            if (signers.length > 0) {
              tx.partialSign(...signers);
            }
            signature = await connection.sendRawTransaction(tx.serialize(), {
              skipPreflight: false,
              preflightCommitment: 'confirmed',
            });
          }
          
          console.log(`   ✅ TX ${i + 1} sent: ${signature.substring(0, 20)}...`);
          
          // Wait for confirmation
          // Production transactions should complete within 30s - if they don't, something is wrong
          const confirmationTimeout = 30; // 30s for all networks - if it takes longer, investigate root cause
          try {
            // Use confirmTransaction with commitment level
            // The default timeout is 30s, but we'll catch timeout errors and check status
            const confirmation = await Promise.race([
              connection.confirmTransaction(signature, 'confirmed'),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('TransactionExpiredTimeoutError')), confirmationTimeout * 1000)
              ),
            ]) as any;
            
            if (confirmation.value.err) {
              throw new Error(`TX ${i + 1} failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
            }
            console.log(`   ✅ TX ${i + 1} confirmed`);
          } catch (confirmError: any) {
            // If confirmation timed out, check if transaction actually succeeded
            if (confirmError.name === 'TransactionExpiredTimeoutError' || 
                confirmError.message === 'TransactionExpiredTimeoutError' ||
                confirmError.message?.includes('not confirmed in')) {
              console.warn(`   ⚠️  TX ${i + 1} confirmation timeout after ${confirmationTimeout}s - checking transaction status...`);
              
              // Wait a bit more for transaction to potentially land
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              // Fallback: Check if transaction actually succeeded
              const txInfo = await connection.getTransaction(signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0,
              });
              
              if (txInfo) {
                if (txInfo.meta?.err) {
                  throw new Error(`TX ${i + 1} failed on-chain: ${JSON.stringify(txInfo.meta.err)}`);
                }
                // Transaction succeeded, just slow confirmation
                console.log(`   ✅ TX ${i + 1} succeeded (confirmed via fallback check)`);
              } else {
                // Transaction not found - might still be processing or dropped
                // Provide helpful error with explorer link
                const explorerUrl = isMainnet 
                  ? `https://solscan.io/tx/${signature}`
                  : `https://solscan.io/tx/${signature}?cluster=devnet`;
                throw new Error(
                  `TX ${i + 1} not confirmed in ${confirmationTimeout}s. ` +
                  `It is unknown if it succeeded or failed. Check signature ${signature} using the Solana Explorer or CLI tools. ` +
                  `Explorer: ${explorerUrl}`
                );
              }
            } else {
              // Re-throw non-timeout errors
              throw confirmError;
            }
          }
          signatures.push(signature);
          
          // Small delay between transactions to avoid rate limiting
          if (i < bulkSwapInfo.transactions.length - 1) {
            await new Promise(r => setTimeout(r, 200));
          }
          
        } catch (txError: any) {
          console.error(`   ❌ TX ${i + 1} failed:`, txError.message);
          // For non-cNFT transactions (TX 1: SOL transfers), just fail - no stale proof retry needed
          // cNFT transactions use the rapid JIT retry loop above and won't reach here
          return res.status(500).json({
            success: false,
            error: `Transaction ${i + 1} (${txInfo.purpose}) failed: ${txError.message}`,
            signatures,
            timestamp: new Date().toISOString(),
          });
        }
        // ========== END NON-cNFT TRANSACTION FLOW ==========
      }

      // All transactions completed successfully
      console.log(`\n✅ All ${bulkSwapInfo.transactions.length} transactions completed successfully!`);
      console.log('📝 Signatures:', signatures);

      return res.json({
        success: true,
        data: {
          signatures,
          signature: signatures[signatures.length - 1], // Last signature for backwards compatibility
          transactionCount: bulkSwapInfo.transactions.length,
          strategy: bulkSwapInfo.strategy || 'DIRECT_BUBBLEGUM_BUNDLE',
          network: networkName,
          isBulkSwap: true,
        },
        // Also include at top level for backwards compatibility
        signatures,
        timestamp: new Date().toISOString(),
      });
    }
    // ========== END BULK SWAP HANDLING ==========
    
    if (!serializedTransaction) {
      return res.status(400).json({
        success: false,
        error: 'Missing serializedTransaction',
        timestamp: new Date().toISOString(),
      });
    }
    
    // Validate signatures needed
    if (!requireSignatures || !Array.isArray(requireSignatures)) {
      return res.status(400).json({
        success: false,
        error: 'Missing requireSignatures array',
        timestamp: new Date().toISOString(),
      });
    }
    
    console.log('📋 Required signatures:', requireSignatures);
    
    // Load private keys from ENV based on network
    let makerPrivateKey: string | undefined;
    let takerPrivateKey: string | undefined;
    
    if (isMainnet) {
      makerPrivateKey = process.env.MAINNET_PROD_SENDER_PRIVATE_KEY;
      takerPrivateKey = process.env.MAINNET_PROD_RECEIVER_PRIVATE_KEY;
      console.log('🔐 Using MAINNET production test wallet keys');
    } else {
      makerPrivateKey = process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY;
      takerPrivateKey = process.env.DEVNET_STAGING_RECEIVER_PRIVATE_KEY;
      console.log('🔐 Using DEVNET staging test wallet keys');
    }
    
    if (!makerPrivateKey || !takerPrivateKey) {
      console.error(`❌ Missing private keys in environment for ${networkName}`);
      return res.status(500).json({
        success: false,
        error: `Test wallet private keys not configured for ${networkName}`,
        timestamp: new Date().toISOString(),
      });
    }
    
    // Load keypairs
    let makerKeypair: Keypair;
    let takerKeypair: Keypair;
    
    try {
      makerKeypair = Keypair.fromSecretKey(bs58.decode(makerPrivateKey));
      takerKeypair = Keypair.fromSecretKey(bs58.decode(takerPrivateKey));
      console.log('✅ Keypairs loaded successfully');
      console.log('   Maker:', makerKeypair.publicKey.toBase58());
      console.log('   Taker:', takerKeypair.publicKey.toBase58());
    } catch (error) {
      console.error('❌ Failed to load keypairs:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to load test wallet keypairs',
        timestamp: new Date().toISOString(),
      });
    }
    
    // === RETRY LOOP: Single retry on stale proof ===
    const MAX_ATTEMPTS = 2; // Initial attempt + 1 retry
    let signature: string | null = null;
    
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.log(`\n🔄 Execution attempt ${attempt}/${MAX_ATTEMPTS}`);
      
      try {
        // Deserialize transaction (handles both legacy and versioned)
        const txBuffer = Buffer.from(serializedTransaction, 'base64');
        const isVersioned = isVersionedTransaction(txBuffer);
        
        console.log(`🔄 Transaction buffer info:`, {
          length: txBuffer.length,
          firstByte: txBuffer[0],
          firstByteHex: txBuffer[0]?.toString(16),
          isVersioned,
          base64Preview: serializedTransaction.substring(0, 50) + '...',
        });
        
        // Determine which signers are needed
        const signers: Keypair[] = [];
        const makerAddress = makerKeypair.publicKey.toBase58();
        const takerAddress = takerKeypair.publicKey.toBase58();
        
        if (requireSignatures.includes(makerAddress)) {
          signers.push(makerKeypair);
          console.log('🔐 Adding Maker signature');
        }
        
        if (requireSignatures.includes(takerAddress)) {
          signers.push(takerKeypair);
          console.log('🔐 Adding Taker signature');
        }
        
        if (signers.length === 0) {
          console.error('❌ No valid signers found');
          return res.status(400).json({
            success: false,
            error: 'No valid signers found for this transaction',
            timestamp: new Date().toISOString(),
          });
        }
        
        let rawTransaction: Buffer | Uint8Array;
        
        if (isVersioned) {
          // Handle versioned transaction (V0 with ALT)
          let versionedTx: VersionedTransaction;
          try {
            versionedTx = VersionedTransaction.deserialize(txBuffer);
            console.log('✅ Versioned transaction deserialized');
            console.log('   Existing signatures:', versionedTx.signatures.length);
          } catch (error) {
            console.error('❌ Failed to deserialize versioned transaction:', error);
            return res.status(400).json({
              success: false,
              error: 'Invalid versioned transaction format',
              timestamp: new Date().toISOString(),
            });
          }
          
          // CRITICAL: VersionedTransaction.sign() REPLACES all signatures!
          // We must preserve existing signatures (platform authority) and add new ones.
          // The platform authority already signed during transaction building.
          console.log('📤 Adding signatures to versioned transaction...');
          console.log('   Preserving existing signatures and adding:', signers.length);
          
          // Store existing signatures before signing
          const existingSignatures = [...versionedTx.signatures];
          
          // Sign with new signers (this replaces all signatures)
          versionedTx.sign(signers);
          
          // Restore non-null existing signatures that were overwritten
          // The message.staticAccountKeys order determines signature indices
          const staticKeys = versionedTx.message.staticAccountKeys;
          for (let i = 0; i < existingSignatures.length && i < staticKeys.length; i++) {
            const existingSig = existingSignatures[i];
            // Check if this signature was non-null and got overwritten
            if (existingSig && !existingSig.every(b => b === 0)) {
              // Check if the new signature at this index is null (all zeros)
              const newSig = versionedTx.signatures[i];
              if (!newSig || newSig.every(b => b === 0)) {
                // Restore the existing signature
                versionedTx.signatures[i] = existingSig;
                console.log(`   Restored signature at index ${i} for ${staticKeys[i].toBase58()}`);
              }
            }
          }
          
          rawTransaction = versionedTx.serialize();
        } else {
          // Handle legacy transaction
          let transaction: Transaction;
          try {
            transaction = Transaction.from(txBuffer);
            console.log('✅ Legacy transaction deserialized');
          } catch (error) {
            console.error('❌ Failed to deserialize legacy transaction:', error);
            console.error('❌ Transaction buffer info:', {
              length: txBuffer.length,
              firstByte: txBuffer[0],
              firstByteHex: txBuffer[0]?.toString(16),
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
            });
            return res.status(400).json({
              success: false,
              error: `Invalid transaction format. Buffer length: ${txBuffer.length}, first byte: 0x${txBuffer[0]?.toString(16) || 'undefined'}. This may indicate a versioned transaction being incorrectly detected as legacy.`,
              timestamp: new Date().toISOString(),
            });
          }
          
          // CRITICAL: Transaction already has platform authority signature from creation
          // Use partialSign to add maker/taker signatures without overwriting existing signature
          console.log('📤 Adding remaining signatures to transaction...');
          console.log('   Additional signers:', signers.length);
          transaction.partialSign(...signers);
          
          rawTransaction = transaction.serialize();
        }
        
        // Send the fully-signed transaction
        console.log('📤 Submitting transaction to blockchain...');
        
        // Send and confirm using raw transaction (preserves all signatures)
        signature = await connection.sendRawTransaction(rawTransaction, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
        
        // Wait for confirmation AND check for errors
        // Production transactions should complete within 30s - if they don't, something is wrong
        const confirmationTimeout = 30; // 30s for all networks - if it takes longer, investigate root cause
        let confirmation;
        try {
          // Use Promise.race to implement custom timeout
          confirmation = await Promise.race([
            connection.confirmTransaction(signature, 'confirmed'),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('TransactionExpiredTimeoutError')), confirmationTimeout * 1000)
            ),
          ]) as any;
        } catch (confirmError: any) {
          // If confirmation timed out, check if transaction actually succeeded
          if (confirmError.name === 'TransactionExpiredTimeoutError' || 
              confirmError.message === 'TransactionExpiredTimeoutError' ||
              confirmError.message?.includes('not confirmed in')) {
            console.warn(`⚠️  Transaction confirmation timeout after ${confirmationTimeout}s - checking transaction status...`);
            
            // Wait a bit more for transaction to potentially land
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Fallback: Check if transaction actually succeeded
            const txInfo = await connection.getTransaction(signature, {
              commitment: 'confirmed',
              maxSupportedTransactionVersion: 0,
            });
            
            if (txInfo) {
              if (txInfo.meta?.err) {
                throw new Error(`Transaction failed: ${JSON.stringify(txInfo.meta.err)}`);
              }
              // Transaction succeeded, just slow confirmation
              console.log(`✅ Transaction succeeded (confirmed via fallback check)`);
              // Create a mock confirmation object for consistency
              confirmation = { value: { err: null } };
            } else {
              // Transaction not found - might still be processing or dropped
              const explorerUrl = isMainnet 
                ? `https://solscan.io/tx/${signature}`
                : `https://solscan.io/tx/${signature}?cluster=devnet`;
              throw new Error(
                `Transaction was not confirmed in ${confirmationTimeout}.00 seconds. ` +
                `It is unknown if it succeeded or failed. Check signature ${signature} using the Solana Explorer or CLI tools. ` +
                `Explorer: ${explorerUrl}`
              );
            }
          } else {
            // Re-throw non-timeout errors
            throw confirmError;
          }
        }
        
        // CRITICAL: Check if transaction had errors (program errors are NOT thrown by confirmTransaction!)
        // A transaction can be "confirmed" but still have failed at the program level
        if (confirmation.value.err) {
          const errorJson = JSON.stringify(confirmation.value.err);
          console.error('❌ Transaction confirmed but FAILED with program error:', errorJson);
          
          // Parse error to give a better message
          let errorMessage = `Transaction failed: ${errorJson}`;
          let customErrorCode: number | undefined;
          const err = confirmation.value.err as any;
          
          // Check for custom program error (InstructionError with Custom code)
          if (err.InstructionError) {
            const [instructionIndex, errorDetail] = err.InstructionError;
            if (errorDetail?.Custom !== undefined) {
              const code = errorDetail.Custom as number;
              customErrorCode = code;
              
              // Try to provide helpful context based on known error codes
              const errorCodes: { [key: number]: string } = {
                0: 'Unauthorized',
                21: 'StaleProof - Merkle root has changed since proof generation',
                24: 'MissingCoreAsset - Core NFT asset account is missing',
                25: 'MissingMplCoreProgram - The mpl-core program account is missing from the transaction',
                26: 'InvalidMplCoreProgram - Wrong mpl-core program ID provided',
              };
              
              const errorName = errorCodes[code] || `Unknown error code ${code}`;
              errorMessage = `Program error: Instruction #${instructionIndex + 1} failed with custom error code ${code} (${errorName})`;
            }
          }
          
          // Create error with additional properties for retry logic
          // The stale proof check in isCnftProofStaleError needs errorCode to detect on-chain failures
          const programError = new Error(errorMessage) as any;
          programError.errorCode = customErrorCode;
          
          // Try to fetch transaction logs for debugging and stale proof detection
          try {
            const txInfo = await connection.getTransaction(signature, {
              commitment: 'confirmed',
              maxSupportedTransactionVersion: 0,
            });
            if (txInfo?.meta?.logMessages) {
              programError.logs = txInfo.meta.logMessages;
              console.error('Transaction logs:', programError.logs);
            }
          } catch (logError) {
            console.warn('Could not fetch transaction logs:', logError);
          }
          
          throw programError;
        }
        
        console.log(`✅ TRANSACTION CONFIRMED AND SUCCEEDED on attempt ${attempt}!`);
        console.log('   Signature:', signature);
        const explorerUrl = isMainnet 
          ? `https://solscan.io/tx/${signature}`
          : `https://solscan.io/tx/${signature}?cluster=devnet`;
        console.log('   Solscan:', explorerUrl);
        
        // Success! Break out of retry loop
        break;
        
      } catch (error: any) {
        const isLastAttempt = attempt === MAX_ATTEMPTS;
        const isStaleProof = isCnftProofStaleError(error);
        
        console.error(`❌ Attempt ${attempt} failed:`, error.message || error);
        if (error.logs) {
          console.error('Transaction logs:', error.logs);
        }
        
        // If stale proof and we have more attempts and offerId, rebuild immediately
        if (isStaleProof && !isLastAttempt && offerId) {
          console.warn(`⚠️  Stale cNFT proof detected on attempt ${attempt}/${MAX_ATTEMPTS}`);
          console.warn('   Rebuilding transaction with fresh proofs immediately...');

          try {
            // Clear proof cache to ensure fresh proofs are fetched
            cnftService.clearAllCachedProofs();

            // Rebuild transaction with fresh proofs
            const rebuildResult = await offerManager.rebuildTransaction(offerId);
            
            // Use the fresh transaction for next attempt
            serializedTransaction = rebuildResult.serializedTransaction;
            
            console.log('✅ Transaction rebuilt with fresh cNFT proofs');
            console.log(`   Retrying execution immediately (attempt ${attempt + 1})...`);
            
            // No delay - execute immediately while proof is fresh
            continue;
            
          } catch (rebuildError: any) {
            console.error('❌ Failed to rebuild transaction:', rebuildError.message);
            // Fall through to error response
          }
        }
        
        // Either not a stale proof, or we've exhausted retries, or rebuild failed
        if (isLastAttempt) {
          console.error(`❌ All ${MAX_ATTEMPTS} attempts exhausted`);
          
          if (isStaleProof) {
            return res.status(409).json({
              success: false,
              error: 'Stale cNFT proof detected',
              errorCode: 'STALE_CNFT_PROOF',
              message: `cNFT proof became stale after ${MAX_ATTEMPTS} attempts. This indicates high activity on the Merkle tree.`,
              offerId,
              logs: error.logs || [],
              timestamp: new Date().toISOString(),
            });
          }
          
          return res.status(500).json({
            success: false,
            error: error.message || 'Transaction failed',
            logs: error.logs || [],
            timestamp: new Date().toISOString(),
          });
        }
        
        // Non-stale proof error - don't retry
        return res.status(500).json({
          success: false,
          error: error.message || 'Transaction failed',
          logs: error.logs || [],
          timestamp: new Date().toISOString(),
        });
      }
    }
    
    // Success response (only reached if signature was set)
    if (!signature) {
      throw new Error('No signature generated after retry loop');
    }
    
    const finalExplorerUrl = isMainnet 
      ? `https://solscan.io/tx/${signature}`
      : `https://solscan.io/tx/${signature}?cluster=devnet`;
    
    return res.status(200).json({
      success: true,
      data: {
        signature,
        explorerUrl: finalExplorerUrl,
        network: networkName,
      },
      message: `Swap executed successfully on ${networkName}`,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error: any) {
    console.error('❌ Unexpected error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/test/execute-listing-delegation
 *
 * TEST ONLY - Executes a cNFT delegation transaction for listings
 * Uses the maker (seller) wallet to sign the delegation
 */
router.post('/api/test/execute-listing-delegation', requireTestEnvironment, async (req: Request, res: Response) => {
  console.log('\n🧪 TEST LISTING DELEGATION EXECUTION');
  console.log('⏰ Timestamp:', new Date().toISOString());

  try {
    const { listingId, serializedTransaction } = req.body;

    if (!serializedTransaction) {
      return res.status(400).json({
        success: false,
        error: 'Missing serializedTransaction',
        timestamp: new Date().toISOString(),
      });
    }

    console.log('📋 Listing ID:', listingId);

    // Load maker (seller) private key
    let makerPrivateKey: string | undefined;

    if (isMainnet) {
      makerPrivateKey = process.env.MAINNET_PROD_SENDER_PRIVATE_KEY;
    } else {
      makerPrivateKey = process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY;
    }

    if (!makerPrivateKey) {
      return res.status(500).json({
        success: false,
        error: `Test wallet private key not configured for ${networkName}`,
        timestamp: new Date().toISOString(),
      });
    }

    const makerKeypair = Keypair.fromSecretKey(bs58.decode(makerPrivateKey));
    console.log('✅ Maker keypair loaded:', makerKeypair.publicKey.toBase58());

    // Deserialize and sign transaction
    const txBuffer = Buffer.from(serializedTransaction, 'base64');
    const isVersioned = isVersionedTransaction(txBuffer);

    let signature: string;

    if (isVersioned) {
      const versionedTx = VersionedTransaction.deserialize(txBuffer);
      versionedTx.sign([makerKeypair]);
      signature = await connection.sendRawTransaction(versionedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
    } else {
      const transaction = Transaction.from(txBuffer);
      transaction.partialSign(makerKeypair);
      signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
    }

    console.log('📤 Transaction sent:', signature);

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log('✅ Delegation transaction confirmed!');

    const explorerUrl = isMainnet
      ? `https://solscan.io/tx/${signature}`
      : `https://solscan.io/tx/${signature}?cluster=devnet`;

    return res.status(200).json({
      success: true,
      data: {
        signature,
        explorerUrl,
        network: networkName,
        listingId,
      },
      message: 'Delegation transaction executed successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('❌ Delegation execution error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Delegation transaction failed',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/test/execute-buy-transaction
 *
 * TEST ONLY - Executes a buy transaction for marketplace listings (Task 18)
 * Uses the taker (buyer) wallet to sign the buy transaction
 *
 * The buy transaction:
 * 1. Transfers SOL from buyer to seller
 * 2. Transfers platform fee to fee collector
 * 3. Transfers cNFT from seller to buyer via delegation
 */
router.post('/api/test/execute-buy-transaction', requireTestEnvironment, async (req: Request, res: Response) => {
  console.log('\n🧪 TEST BUY TRANSACTION EXECUTION (Task 18)');
  console.log('⏰ Timestamp:', new Date().toISOString());

  try {
    const { listingId, serializedTransaction, buyer } = req.body;

    if (!serializedTransaction) {
      return res.status(400).json({
        success: false,
        error: 'Missing serializedTransaction',
        timestamp: new Date().toISOString(),
      });
    }

    console.log('📋 Listing ID:', listingId);
    console.log('👤 Buyer:', buyer);

    // Load taker (buyer) private key
    let takerPrivateKey: string | undefined;

    if (isMainnet) {
      takerPrivateKey = process.env.MAINNET_PROD_RECEIVER_PRIVATE_KEY;
    } else {
      takerPrivateKey = process.env.DEVNET_STAGING_RECEIVER_PRIVATE_KEY;
    }

    if (!takerPrivateKey) {
      return res.status(500).json({
        success: false,
        error: `Test wallet private key not configured for ${networkName}`,
        timestamp: new Date().toISOString(),
      });
    }

    const takerKeypair = Keypair.fromSecretKey(bs58.decode(takerPrivateKey));
    console.log('✅ Taker (buyer) keypair loaded:', takerKeypair.publicKey.toBase58());

    // Verify buyer address matches taker keypair
    if (buyer && buyer !== takerKeypair.publicKey.toBase58()) {
      console.warn('⚠️ Buyer address does not match taker keypair');
      console.warn('   Expected:', takerKeypair.publicKey.toBase58());
      console.warn('   Got:', buyer);
    }

    // Deserialize and sign transaction
    const txBuffer = Buffer.from(serializedTransaction, 'base64');
    const isVersioned = isVersionedTransaction(txBuffer);

    let signature: string;

    if (isVersioned) {
      const versionedTx = VersionedTransaction.deserialize(txBuffer);

      // Store existing signatures before signing
      const existingSignatures = [...versionedTx.signatures];

      // Sign with buyer
      versionedTx.sign([takerKeypair]);

      // Restore non-null existing signatures that were overwritten (platform authority)
      const staticKeys = versionedTx.message.staticAccountKeys;
      for (let i = 0; i < existingSignatures.length && i < staticKeys.length; i++) {
        const existingSig = existingSignatures[i];
        if (existingSig && !existingSig.every(b => b === 0)) {
          const newSig = versionedTx.signatures[i];
          if (!newSig || newSig.every(b => b === 0)) {
            versionedTx.signatures[i] = existingSig;
            console.log(`   Restored signature at index ${i}`);
          }
        }
      }

      signature = await connection.sendRawTransaction(versionedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
    } else {
      const transaction = Transaction.from(txBuffer);
      transaction.partialSign(takerKeypair);
      signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
    }

    console.log('📤 Buy transaction sent:', signature);

    // Wait for confirmation with timeout
    const confirmationTimeout = 30; // 30s timeout
    let confirmation;

    try {
      confirmation = await Promise.race([
        connection.confirmTransaction(signature, 'confirmed'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TransactionExpiredTimeoutError')), confirmationTimeout * 1000)
        ),
      ]) as any;
    } catch (confirmError: any) {
      if (confirmError.message === 'TransactionExpiredTimeoutError' ||
        confirmError.message?.includes('not confirmed in')) {
        console.warn('⚠️ Confirmation timeout - checking transaction status...');

        await new Promise(resolve => setTimeout(resolve, 2000));

        const txInfo = await connection.getTransaction(signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });

        if (txInfo) {
          if (txInfo.meta?.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(txInfo.meta.err)}`);
          }
          console.log('✅ Buy transaction succeeded (confirmed via fallback check)');
          confirmation = { value: { err: null } };
        } else {
          const explorerUrl = isMainnet
            ? `https://solscan.io/tx/${signature}`
            : `https://solscan.io/tx/${signature}?cluster=devnet`;
          throw new Error(
            `Transaction not confirmed in ${confirmationTimeout}s. Check: ${explorerUrl}`
          );
        }
      } else {
        throw confirmError;
      }
    }

    if (confirmation.value.err) {
      const errorJson = JSON.stringify(confirmation.value.err);
      console.error('❌ Buy transaction failed:', errorJson);

      // Parse error for helpful message
      let errorMessage = `Transaction failed: ${errorJson}`;
      const err = confirmation.value.err as any;

      if (err.InstructionError) {
        const [instructionIndex, errorDetail] = err.InstructionError;
        if (errorDetail?.Custom !== undefined) {
          const code = errorDetail.Custom as number;
          const errorCodes: { [key: number]: string } = {
            0: 'Unauthorized',
            21: 'StaleProof - Merkle root has changed',
          };
          const errorName = errorCodes[code] || `Error code ${code}`;
          errorMessage = `Program error: Instruction #${instructionIndex + 1} failed with ${errorName}`;
        }
      }

      throw new Error(errorMessage);
    }

    console.log('✅ Buy transaction confirmed!');

    const explorerUrl = isMainnet
      ? `https://solscan.io/tx/${signature}`
      : `https://solscan.io/tx/${signature}?cluster=devnet`;

    return res.status(200).json({
      success: true,
      data: {
        signature,
        explorerUrl,
        network: networkName,
        listingId,
      },
      message: 'Buy transaction executed successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('❌ Buy transaction execution error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Buy transaction failed',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/test/execute-listing-revoke
 *
 * TEST ONLY - Executes a cNFT revoke transaction for cancelled listings
 * Uses the maker (seller) wallet to sign the revoke
 */
router.post('/api/test/execute-listing-revoke', requireTestEnvironment, async (req: Request, res: Response) => {
  console.log('\n🧪 TEST LISTING REVOKE EXECUTION');
  console.log('⏰ Timestamp:', new Date().toISOString());

  try {
    const { listingId, serializedTransaction } = req.body;

    if (!serializedTransaction) {
      return res.status(400).json({
        success: false,
        error: 'Missing serializedTransaction',
        timestamp: new Date().toISOString(),
      });
    }

    console.log('📋 Listing ID:', listingId);

    // Load maker (seller) private key
    let makerPrivateKey: string | undefined;

    if (isMainnet) {
      makerPrivateKey = process.env.MAINNET_PROD_SENDER_PRIVATE_KEY;
    } else {
      makerPrivateKey = process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY;
    }

    if (!makerPrivateKey) {
      return res.status(500).json({
        success: false,
        error: `Test wallet private key not configured for ${networkName}`,
        timestamp: new Date().toISOString(),
      });
    }

    const makerKeypair = Keypair.fromSecretKey(bs58.decode(makerPrivateKey));
    console.log('✅ Maker keypair loaded:', makerKeypair.publicKey.toBase58());

    // Deserialize and sign transaction
    const txBuffer = Buffer.from(serializedTransaction, 'base64');
    const isVersioned = isVersionedTransaction(txBuffer);

    let signature: string;

    if (isVersioned) {
      const versionedTx = VersionedTransaction.deserialize(txBuffer);
      versionedTx.sign([makerKeypair]);
      signature = await connection.sendRawTransaction(versionedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
    } else {
      const transaction = Transaction.from(txBuffer);
      transaction.partialSign(makerKeypair);
      signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
    }

    console.log('📤 Transaction sent:', signature);

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log('✅ Revoke transaction confirmed!');

    const explorerUrl = isMainnet
      ? `https://solscan.io/tx/${signature}`
      : `https://solscan.io/tx/${signature}?cluster=devnet`;

    return res.status(200).json({
      success: true,
      data: {
        signature,
        explorerUrl,
        network: networkName,
        listingId,
      },
      message: 'Revoke transaction executed successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('❌ Revoke execution error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Revoke transaction failed',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/test/revoke-cnft-delegation
 *
 * TEST ONLY - Revokes a stale cNFT delegation from a failed swap
 * This is used to clean up cNFTs that were left delegated after a swap failure.
 *
 * The owner must sign the revoke transaction.
 */
router.post('/api/test/revoke-cnft-delegation', requireTestEnvironment, async (req: Request, res: Response) => {
  console.log('\n🧪 TEST CNFT DELEGATION REVOKE');
  console.log('⏰ Timestamp:', new Date().toISOString());

  try {
    const { assetId, ownerWallet } = req.body;

    if (!assetId) {
      return res.status(400).json({
        success: false,
        error: 'Missing assetId',
        timestamp: new Date().toISOString(),
      });
    }

    console.log('📋 Asset ID:', assetId);
    console.log('👤 Owner Wallet:', ownerWallet || '(will use test wallet)');

    // Check which test wallet matches the owner
    const makerPrivateKey = isMainnet
      ? process.env.MAINNET_PROD_SENDER_PRIVATE_KEY
      : process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY;
    const takerPrivateKey = isMainnet
      ? process.env.MAINNET_PROD_RECEIVER_PRIVATE_KEY
      : process.env.DEVNET_STAGING_RECEIVER_PRIVATE_KEY;

    if (!makerPrivateKey || !takerPrivateKey) {
      return res.status(500).json({
        success: false,
        error: `Test wallet private keys not configured for ${networkName}`,
        timestamp: new Date().toISOString(),
      });
    }

    const makerKeypair = Keypair.fromSecretKey(bs58.decode(makerPrivateKey));
    const takerKeypair = Keypair.fromSecretKey(bs58.decode(takerPrivateKey));

    // Determine owner based on ownerWallet param or fetch from DAS
    let ownerKeypair: Keypair;

    if (ownerWallet) {
      if (ownerWallet === makerKeypair.publicKey.toBase58()) {
        ownerKeypair = makerKeypair;
      } else if (ownerWallet === takerKeypair.publicKey.toBase58()) {
        ownerKeypair = takerKeypair;
      } else {
        return res.status(400).json({
          success: false,
          error: `Owner wallet ${ownerWallet} is not a test wallet. Available: ${makerKeypair.publicKey.toBase58()}, ${takerKeypair.publicKey.toBase58()}`,
          timestamp: new Date().toISOString(),
        });
      }
    } else {
      // Auto-detect owner from DAS API
      const delegationService = createCnftDelegationService(connection);
      try {
        // We'll try maker first, then taker
        // The service will validate ownership when building the instruction
        ownerKeypair = makerKeypair;
      } catch {
        ownerKeypair = takerKeypair;
      }
    }

    console.log('✅ Owner keypair loaded:', ownerKeypair.publicKey.toBase58());

    // Create delegation service and build revoke instruction
    const delegationService = createCnftDelegationService(connection);

    console.log('🔧 Building revoke instruction...');
    const revokeResult = await delegationService.buildRevokeInstruction({
      assetId,
      ownerPubkey: ownerKeypair.publicKey,
    });

    console.log('✅ Revoke instruction built:', {
      treeAddress: revokeResult.treeAddress.toBase58(),
      proofNodes: revokeResult.proofNodes.length,
      estimatedSize: revokeResult.estimatedSize,
    });

    // Build transaction with the revoke instruction
    const transaction = new Transaction();

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = ownerKeypair.publicKey;

    // Add revoke instruction
    transaction.add(revokeResult.instruction);

    // Sign and send
    transaction.sign(ownerKeypair);

    console.log('📤 Sending revoke transaction...');
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    console.log('📤 Transaction sent:', signature);

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log('✅ Revoke transaction confirmed!');

    const explorerUrl = isMainnet
      ? `https://solscan.io/tx/${signature}`
      : `https://solscan.io/tx/${signature}?cluster=devnet`;

    return res.status(200).json({
      success: true,
      data: {
        signature,
        explorerUrl,
        network: networkName,
        assetId,
        owner: ownerKeypair.publicKey.toBase58(),
      },
      message: 'cNFT delegation revoked successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('❌ Revoke execution error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Revoke transaction failed',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Execute Lock Transaction (Two-Phase Swap)
 *
 * Signs and submits a lock transaction for two-phase swaps.
 * Used by the test page to execute cNFT delegation transactions.
 *
 * Includes automatic retry logic for stale Merkle proof errors:
 * - When a cNFT delegation changes the Merkle tree, subsequent transactions
 *   may have stale proofs that fail with error 6001.
 * - This endpoint automatically rebuilds the transaction with fresh proofs
 *   from the DAS API and retries up to 3 times.
 *
 * POST /api/test/execute-lock
 */
router.post('/api/test/execute-lock', async (req: Request, res: Response) => {
  console.log('\n========================================');
  console.log('🔒 TEST LOCK TRANSACTION EXECUTION');
  console.log('========================================');

  const MAX_ATTEMPTS = 3;
  let { swapId, serializedTransaction, transactionIndex, totalTransactions, party } = req.body;

  // Default party to 'A' if not provided
  const partyValue: 'A' | 'B' = party === 'B' ? 'B' : 'A';

  console.log(`📋 Swap ID: ${swapId}`);
  console.log(`📝 Transaction: ${(transactionIndex ?? 0) + 1}/${totalTransactions ?? 1}`);
  console.log(`👤 Party: ${partyValue}`);

  if (!serializedTransaction) {
    return res.status(400).json({
      success: false,
      error: 'Missing serializedTransaction',
      timestamp: new Date().toISOString(),
    });
  }

  // Load keypairs - we need both for cleanup purposes
  const makerPrivateKey = isMainnet
    ? process.env.MAINNET_PROD_SENDER_PRIVATE_KEY
    : process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY;
  const takerPrivateKey = isMainnet
    ? process.env.MAINNET_PROD_RECEIVER_PRIVATE_KEY
    : process.env.DEVNET_STAGING_RECEIVER_PRIVATE_KEY;

  const signerPrivateKey = partyValue === 'B' ? takerPrivateKey : makerPrivateKey;

  if (!signerPrivateKey) {
    return res.status(500).json({
      success: false,
      error: `Missing ${isMainnet ? 'mainnet' : 'devnet'} ${partyValue === 'B' ? 'receiver' : 'sender'} private key`,
      timestamp: new Date().toISOString(),
    });
  }

  // Parse keypairs
  let signer: Keypair;
  let makerKeypair: Keypair | undefined;
  let takerKeypair: Keypair | undefined;
  const testWallets = new Map<string, Keypair>();

  try {
    signer = Keypair.fromSecretKey(bs58.decode(signerPrivateKey));
    console.log(`   🔑 Signer: ${signer.publicKey.toBase58()}`);

    // Load both keypairs for cleanup
    if (makerPrivateKey) {
      makerKeypair = Keypair.fromSecretKey(bs58.decode(makerPrivateKey));
      testWallets.set(makerKeypair.publicKey.toBase58(), makerKeypair);
    }
    if (takerPrivateKey) {
      takerKeypair = Keypair.fromSecretKey(bs58.decode(takerPrivateKey));
      testWallets.set(takerKeypair.publicKey.toBase58(), takerKeypair);
    }
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: 'Invalid signer private key format',
      timestamp: new Date().toISOString(),
    });
  }

  // ========== PROACTIVE STALE PROOF VALIDATION FOR LOCK PHASE ==========
  // Validate cNFT proofs BEFORE attempting submission to prevent stale proof errors
  if (swapId) {
    try {
      console.log('\n   🔍 Proactively validating cNFT proofs before lock submission...');

      // Load swap data to get cNFT assets
      const swap = await prisma.twoPhaseSwap.findUnique({
        where: { id: swapId },
      });

      if (swap) {
        const assets = partyValue === 'A' ? swap.assetsA : swap.assetsB;
        const cnftAssets = (assets as any[]).filter((a: any) => a.type === 'CNFT' || a.type === 'cnft');

        if (cnftAssets.length > 0) {
          const cnftService = createCnftService(connection);
          let hasStaleProof = false;
          let hasValidationError = false;
          let validationErrorMessage = '';

          for (const asset of cnftAssets) {
            try {
              const cachedProof = await cnftService.getCnftProof(asset.identifier, false, 0);
              if (cachedProof) {
                const validation = await cnftService.validateProofRoot(asset.identifier, cachedProof.root);

                if (!validation.isValid) {
                  console.warn(`   ⚠️  Stale proof detected for ${asset.identifier.substring(0, 12)}...`);
                  hasStaleProof = true;
                } else {
                  console.log(`   ✅ Proof valid for ${asset.identifier.substring(0, 12)}...`);
                }
              }
            } catch (validationError: any) {
              const errorMsg = validationError.message || 'Unknown error';
              console.error(`   ❌ Validation failed for ${asset.identifier.substring(0, 12)}...:`, errorMsg);

              // Check if this is a fatal "Asset Not Found" error
              if (errorMsg.includes('Asset Not Found') || errorMsg.includes('RecordNotFound')) {
                console.error(`   ❌ FATAL: cNFT ${asset.identifier.substring(0, 12)}... does not exist or was burned`);
                hasValidationError = true;
                validationErrorMessage = `cNFT ${asset.identifier} not found - may have been burned or transferred`;
              } else {
                // Other validation errors - treat as stale proof and try to rebuild
                console.warn(`   ⚠️  Treating validation error as stale proof, will attempt rebuild`);
                hasStaleProof = true;
              }
            }
          }

          // Fatal error - asset doesn't exist, can't proceed
          if (hasValidationError) {
            return res.status(400).json({
              success: false,
              error: validationErrorMessage,
              errorCode: 'CNFT_NOT_FOUND',
              timestamp: new Date().toISOString(),
            });
          }

          if (hasStaleProof) {
            console.log('\n   🔄 Stale proofs detected! Rebuilding lock transaction...');

            // Rebuild the lock transaction with fresh proofs
            const lockService = createTwoPhaseSwapLockService(
              connection,
              prisma,
              programId,
              feeCollector,
              delegateAuthority
            );

            const rebuildResult = await lockService.rebuildSingleLockTransaction({
              swapId,
              walletAddress: signer.publicKey.toBase58(),
              party: partyValue,
            }, transactionIndex || 0);

            if (rebuildResult.serialized) {
              serializedTransaction = rebuildResult.serialized;
              console.log('   ✅ Lock transaction rebuilt with fresh proofs');
            } else {
              console.error('   ❌ Rebuild did not return valid transaction');
              return res.status(500).json({
                success: false,
                error: 'Failed to rebuild lock transaction with fresh proofs',
                errorCode: 'STALE_PROOF_REBUILD_FAILED',
                timestamp: new Date().toISOString(),
              });
            }
          } else {
            console.log('   ✅ All proofs are fresh, proceeding with original transaction');
          }
        }
      }
    } catch (validationError: any) {
      console.warn('   ⚠️  Proactive validation failed, proceeding with original transaction:', validationError.message);
    }
  }
  // ========== END PROACTIVE VALIDATION ==========

  // Retry loop for stale proof handling
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`\n   🔄 Attempt ${attempt}/${MAX_ATTEMPTS}`);

      // Validate serializedTransaction is a non-empty string
      if (typeof serializedTransaction !== 'string' || serializedTransaction.length === 0) {
        console.error('   ❌ Invalid serializedTransaction:', {
          type: typeof serializedTransaction,
          value: serializedTransaction,
        });
        throw new Error(`Invalid serializedTransaction: expected non-empty string, got ${typeof serializedTransaction}`);
      }

      // Validate base64 format
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(serializedTransaction)) {
        console.error('   ❌ Invalid base64 format:', {
          length: serializedTransaction.length,
          preview: serializedTransaction.substring(0, 100),
          invalidChars: serializedTransaction.match(/[^A-Za-z0-9+/=]/g)?.slice(0, 10),
        });
        throw new Error(`Invalid base64 format in serializedTransaction`);
      }

      // Deserialize and sign transaction
      const txBuffer = Buffer.from(serializedTransaction, 'base64');
      let signature: string;

      // Debug: Log buffer details
      console.log('   🔍 Transaction buffer info:', {
        inputType: typeof serializedTransaction,
        inputLength: serializedTransaction?.length,
        bufferLength: txBuffer.length,
        firstByte: txBuffer[0],
        firstByteHex: '0x' + (txBuffer[0]?.toString(16) ?? 'undefined'),
        lastBytes: txBuffer.length > 4 ? `[${txBuffer.slice(-4).join(', ')}]` : 'buffer too short',
        base64Preview: serializedTransaction.substring(0, 50) + '...',
      });

      if (isVersionedTransaction(txBuffer)) {
        console.log('   📄 Versioned (V0) transaction detected');
        const versionedTx = VersionedTransaction.deserialize(txBuffer);
        versionedTx.sign([signer]);
        signature = await connection.sendTransaction(versionedTx, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
      } else {
        console.log('   📄 Legacy transaction detected');
        // Wrap deserialization in try-catch for detailed error reporting
        let transaction: Transaction;
        try {
          transaction = Transaction.from(txBuffer);
        } catch (deserializeError: any) {
          // Detailed buffer analysis for debugging
          const signatureCount = txBuffer[0];
          const expectedMinSize = 1 + (signatureCount * 64) + 3; // compact-u16 + signatures + min message header
          const hasEnoughForSignatures = txBuffer.length >= 1 + (signatureCount * 64);

          console.error('   ❌ Transaction deserialization failed:', {
            error: deserializeError.message,
            bufferLength: txBuffer.length,
            signatureCount: signatureCount,
            expectedMinSize: expectedMinSize,
            hasEnoughForSignatures: hasEnoughForSignatures,
            firstBytes: txBuffer.slice(0, Math.min(40, txBuffer.length)).toString('hex'),
            lastBytes: txBuffer.slice(Math.max(0, txBuffer.length - 20)).toString('hex'),
            isValidBase64: /^[A-Za-z0-9+/]*={0,2}$/.test(serializedTransaction || ''),
            inputPreview: typeof serializedTransaction === 'string' ? serializedTransaction.substring(0, 80) : 'not a string',
          });

          // Check for common issues
          if (signatureCount > 10) {
            console.error('   ⚠️ Unusually high signature count - may indicate buffer corruption or wrong format');
          }
          if (!hasEnoughForSignatures) {
            console.error(`   ⚠️ Buffer too short: need at least ${1 + signatureCount * 64} bytes for signatures, but only have ${txBuffer.length}`);
          }

          throw new Error(`Failed to deserialize legacy transaction: ${deserializeError.message}. Buffer length: ${txBuffer.length}, signature count: ${signatureCount}, first byte: 0x${txBuffer[0]?.toString(16)}`);
        }
        transaction.partialSign(signer);
        signature = await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
      }

      console.log(`   ✅ Transaction sent: ${signature}`);

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');

      if (confirmation.value.err) {
        // Parse custom error code from confirmation error
        const err = confirmation.value.err as any;
        let customErrorCode: number | undefined;

        if (err.InstructionError) {
          const [, errorDetail] = err.InstructionError;
          if (errorDetail?.Custom !== undefined) {
            customErrorCode = errorDetail.Custom as number;
          }
        }

        const programError = new Error(
          `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
        ) as any;
        programError.errorCode = customErrorCode;

        throw programError;
      }

      console.log('   ✅ Transaction confirmed!');

      const explorerUrl = isMainnet
        ? `https://solscan.io/tx/${signature}`
        : `https://solscan.io/tx/${signature}?cluster=devnet`;

      return res.status(200).json({
        success: true,
        data: {
          signature,
          explorerUrl,
          network: networkName,
          swapId,
          transactionIndex,
          attempt,
        },
        message: `Lock transaction ${(transactionIndex ?? 0) + 1}/${totalTransactions ?? 1} executed successfully${attempt > 1 ? ` (after ${attempt} attempts)` : ''}`,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const isStaleProof = isCnftProofStaleError(error);
      const isLastAttempt = attempt === MAX_ATTEMPTS;

      console.error(`   ❌ Attempt ${attempt} failed:`, error.message);

      if (isStaleProof && !isLastAttempt && swapId && transactionIndex !== undefined) {
        // Progressive delay: wait longer on each retry to give DAS indexers time to sync
        // Attempt 1 failed → wait 1.5s, Attempt 2 failed → wait 3s
        const retryDelayMs = 1500 * attempt;
        console.warn(
          `   ⚠️  Stale Merkle proof detected (error 6001) - waiting ${retryDelayMs}ms for DAS indexer sync...`
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));

        try {
          // Rebuild the transaction with fresh Merkle proofs from DAS API
          const rebuiltTx = await twoPhaseSwapLockService.rebuildSingleLockTransaction(
            {
              swapId,
              walletAddress: signer.publicKey.toBase58(),
              party: partyValue,
            },
            transactionIndex
          );

          // Update serializedTransaction for next attempt
          serializedTransaction = rebuiltTx.serialized;
          console.log(`   ✅ Transaction rebuilt with fresh proof for cNFT at index ${transactionIndex}`);

          continue; // Retry with fresh transaction
        } catch (rebuildError: any) {
          console.error(`   ❌ Failed to rebuild transaction:`, rebuildError.message);

          // Cleanup delegations before returning error
          if (swapId) {
            await cleanupFailedSwapDelegations(swapId, testWallets);
          }

          return res.status(500).json({
            success: false,
            error: `Lock transaction failed: ${error.message}. Rebuild also failed: ${rebuildError.message}`,
            errorCode: 'STALE_PROOF_REBUILD_FAILED',
            attempt,
            cleanupAttempted: !!swapId,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Non-stale-proof error or last attempt - return error
      if (isLastAttempt && isStaleProof) {
        // Cleanup delegations before returning error
        if (swapId) {
          await cleanupFailedSwapDelegations(swapId, testWallets);
        }

        return res.status(409).json({
          success: false,
          error: `Stale Merkle proof persisted after ${MAX_ATTEMPTS} attempts. The Merkle tree is experiencing high activity.`,
          errorCode: 'STALE_PROOF_EXHAUSTED',
          swapId,
          transactionIndex,
          cleanupAttempted: !!swapId,
          timestamp: new Date().toISOString(),
        });
      }

      // Cleanup delegations before returning error
      if (swapId) {
        await cleanupFailedSwapDelegations(swapId, testWallets);
      }

      return res.status(500).json({
        success: false,
        error: error.message || 'Lock transaction failed',
        cleanupAttempted: !!swapId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Should not reach here, but just in case
  return res.status(500).json({
    success: false,
    error: 'Unexpected error in retry loop',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Diagnostic endpoint to check DAS vs on-chain state for a cNFT
 * Helps debug stale proof issues by showing exact roots
 */
router.get('/api/test/diagnose-cnft/:assetId', async (req: Request, res: Response) => {
  const { assetId } = req.params;

  console.log(`\n🔍 DIAGNOSING cNFT: ${assetId}`);

  try {
    const diagService = createCnftService(connection);

    // 1. Get asset data
    console.log('   Fetching asset data from DAS...');
    const asset = await diagService.getCnftAsset(assetId);
    console.log('   Asset tree:', asset.compression.tree);

    // 2. Get proof from DAS (skip cache)
    console.log('   Fetching fresh proof from DAS...');
    const proof = await diagService.getCnftProof(assetId, true, 0);
    console.log('   DAS proof root:', proof.root);

    // 3. Validate against on-chain
    console.log('   Validating against on-chain state...');
    const validation = await diagService.validateProofRoot(assetId, proof.root);

    const result = {
      assetId,
      treeAddress: asset.compression.tree,
      leafIndex: asset.compression.leaf_id,
      owner: asset.ownership.owner,
      delegate: asset.ownership.delegate,
      dasProofRoot: proof.root,
      onChainRoot: validation.onChainRoot,
      treeSequence: validation.treeSequence,
      isProofValid: validation.isValid,
      diagnosis: validation.isValid
        ? '✅ DAS and on-chain roots match - proof is fresh'
        : '❌ DAS proof root does NOT match on-chain - indexer is stale',
    };

    console.log('   Diagnosis result:', JSON.stringify(result, null, 2));

    return res.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('   Diagnosis failed:', error.message);

    // Provide helpful error message
    let diagnosis = 'Unknown error';
    if (error.message.includes('Asset Not Found') || error.message.includes('RecordNotFound')) {
      diagnosis = '❌ cNFT does not exist in DAS - may have been burned or never minted';
    } else if (error.message.includes('CMT account data unexpectedly null')) {
      diagnosis = '❌ Merkle tree account not found on-chain - tree may have been closed';
    }

    return res.status(500).json({
      success: false,
      error: error.message,
      diagnosis,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Get swap history for a specific NFT/cNFT
 * Returns completed swaps involving this asset
 */
router.get('/api/test/nft-swap-history/:assetId', async (req: Request, res: Response) => {
  const { assetId } = req.params;

  try {
    // Query filled swaps and filter by asset in application code
    // (Prisma's JSON filtering is limited, so we fetch recent swaps and filter)
    const swaps = await prisma.swapOffer.findMany({
      where: {
        status: 'FILLED',
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 100, // Fetch more, filter in-memory
      select: {
        id: true,
        makerWallet: true,
        takerWallet: true,
        offeredAssets: true,
        requestedAssets: true,
        offeredSolLamports: true,
        requestedSolLamports: true,
        transactionSignature: true,
        updatedAt: true,
        createdAt: true,
      },
    });

    // Filter swaps that involve this asset
    const filteredSwaps = swaps.filter((swap) => {
      const offeredAssets = swap.offeredAssets as Array<{ mint: string }> | null;
      const requestedAssets = swap.requestedAssets as Array<{ mint: string }> | null;

      const inOffered = offeredAssets?.some((a) => a.mint === assetId);
      const inRequested = requestedAssets?.some((a) => a.mint === assetId);

      return inOffered || inRequested;
    }).slice(0, 20); // Limit to 20 results

    // Transform into history format
    const history = filteredSwaps.map((swap) => {
      // Determine if asset was offered or requested
      const offeredAssets = swap.offeredAssets as Array<{ mint: string }> | null;

      const wasOffered = offeredAssets?.some((a) => a.mint === assetId);
      const from = wasOffered ? swap.makerWallet : swap.takerWallet;
      const to = wasOffered ? swap.takerWallet : swap.makerWallet;

      // Get SOL amount (if any)
      const solAmount = wasOffered
        ? swap.requestedSolLamports
          ? swap.requestedSolLamports
          : BigInt(0)
        : swap.offeredSolLamports
          ? swap.offeredSolLamports
          : BigInt(0);

      return {
        swapId: swap.id,
        from,
        to,
        solAmount: solAmount.toString(),
        signature: swap.transactionSignature,
        completedAt: swap.updatedAt?.toISOString() || swap.createdAt.toISOString(),
      };
    });

    return res.json({
      success: true,
      data: {
        assetId,
        history,
        count: history.length,
      },
    });
  } catch (error: any) {
    console.error('Error fetching NFT swap history:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;

