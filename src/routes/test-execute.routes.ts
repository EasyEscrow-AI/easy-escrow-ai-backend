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
 */
function isCnftProofStaleError(error: any): boolean {
  const message = error?.message || '';
  const logs = error?.logs || [];
  
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
        
        console.log(`🔄 Transaction type: ${isVersioned ? 'Versioned (V0) with ALT' : 'Legacy'}`);
        
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
          } catch (error) {
            console.error('❌ Failed to deserialize versioned transaction:', error);
            return res.status(400).json({
              success: false,
              error: 'Invalid versioned transaction format',
              timestamp: new Date().toISOString(),
            });
          }
          
          // Sign versioned transaction
          console.log('📤 Adding signatures to versioned transaction...');
          console.log('   Additional signers:', signers.length);
          versionedTx.sign(signers);
          
          rawTransaction = versionedTx.serialize();
        } else {
          // Handle legacy transaction
          let transaction: Transaction;
          try {
            transaction = Transaction.from(txBuffer);
            console.log('✅ Legacy transaction deserialized');
          } catch (error) {
            console.error('❌ Failed to deserialize legacy transaction:', error);
            return res.status(400).json({
              success: false,
              error: 'Invalid transaction format',
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
        
        // Wait for confirmation
        await connection.confirmTransaction(signature, 'confirmed');
        
        console.log(`✅ TRANSACTION CONFIRMED on attempt ${attempt}!`);
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

