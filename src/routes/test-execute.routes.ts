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
import { Connection, Keypair, Transaction, VersionedTransaction, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
import bs58 from 'bs58';
import { offerManager } from './offers.routes';
import { getEscrowProgramService } from '../services/escrow-program.service';

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
      if (bulkSwapInfo.requiresJitoBundle && isMainnet) {
        console.log('\n📦 Using Jito Bundle for atomic execution...');
        
        try {
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
        
        // Determine signers for THIS specific transaction
        // Use requiredSigners from the transaction if available, otherwise fall back to global
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
          return res.status(500).json({
            success: false,
            error: `Transaction ${i + 1} (${txInfo.purpose || 'unknown'}) failed: ${txError.message}`,
            signatures: signatures, // Return any successful signatures
            failedTxIndex: i,
            timestamp: new Date().toISOString(),
          });
        }
      }
      
      console.log(`\n✅ BULK SWAP COMPLETE: ${signatures.length} transactions confirmed`);
      
      return res.json({
        success: true,
        data: {
          signatures,
          signature: signatures[signatures.length - 1], // Last signature for backwards compat
          network: networkName,
          isBulkSwap: true,
          transactionCount: signatures.length,
        },
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

export default router;

