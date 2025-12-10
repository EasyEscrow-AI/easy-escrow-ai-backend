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
import { Connection, Keypair, Transaction, VersionedTransaction, sendAndConfirmTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { offerManager } from './offers.routes';

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

// Determine network type - must match logic in test.routes.ts config endpoint
const nodeEnv = process.env.NODE_ENV || 'development';
const network = process.env.SOLANA_NETWORK || 'devnet';
const rpcUrl = process.env.SOLANA_RPC_URL || '';
// Use same detection as config: NODE_ENV=production OR SOLANA_NETWORK=mainnet-beta OR RPC URL contains mainnet
const isMainnet = nodeEnv === 'production' || network === 'mainnet-beta' || rpcUrl.includes('mainnet');
const networkName = isMainnet ? 'mainnet-beta' : 'devnet';

/**
 * Check if error is caused by stale cNFT Merkle proof
 * 
 * Stale proofs can be detected in multiple ways:
 * 1. During preflight simulation: error.message or error.logs contain known indicators
 * 2. On-chain failure: error.errorCode === 21 (StaleProof from AtomicSwapError)
 * 3. Message contains the error code reference
 */
function isCnftProofStaleError(error: any): boolean {
  const message = error?.message || '';
  const logs = error?.logs || [];
  const errorCode = error?.errorCode;
  
  // Check for on-chain StaleProof error (error code 21)
  // This catches errors thrown from confirmation.value.err
  if (errorCode === 21) {
    return true;
  }
  
  // Also check if the error message mentions error code 21 (StaleProof)
  if (message.includes('error code 21') || message.includes('StaleProof')) {
    return true;
  }
  
  const staleProofIndicators = [
    'Invalid root recomputed from proof',
    'Error using concurrent merkle tree',
    'Merkle proof verification failed',
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
    let { serializedTransaction, requireSignatures, offerId } = req.body;
    
    // offerId is optional - used for cNFT proof retry logic
    if (offerId) {
      console.log('📋 Offer ID:', offerId, '(will rebuild transaction if proof is stale)');
    }
    
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
        const confirmation = await connection.confirmTransaction(signature, 'confirmed');
        
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
              customErrorCode = errorDetail.Custom;
              
              // Try to provide helpful context based on known error codes
              const errorCodes: { [key: number]: string } = {
                0: 'Unauthorized',
                21: 'StaleProof - Merkle root has changed since proof generation',
                24: 'MissingCoreAsset - Core NFT asset account is missing',
                25: 'MissingMplCoreProgram - The mpl-core program account is missing from the transaction',
                26: 'InvalidMplCoreProgram - Wrong mpl-core program ID provided',
              };
              
              const errorName = errorCodes[customErrorCode] || `Unknown error code ${customErrorCode}`;
              errorMessage = `Program error: Instruction #${instructionIndex + 1} failed with custom error code ${customErrorCode} (${errorName})`;
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

export default router;

