/**
 * TEST-ONLY Swap Execution Routes
 * 
 * ⚠️ SECURITY WARNING ⚠️
 * This file contains DANGEROUS functionality that signs transactions
 * using private keys stored in environment variables.
 * 
 * ONLY FOR DEVNET/STAGING TESTING - NEVER USE IN PRODUCTION
 */

import { Router, Request, Response } from 'express';
import { Connection, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

const router = Router();

// Initialize connection
const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

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
 * Security middleware - ONLY allow on devnet/staging
 */
function requireTestEnvironment(req: Request, res: Response, next: any) {
  // Check 1: Must be devnet RPC
  const rpcUrl = process.env.SOLANA_RPC_URL || '';
  const isDevnet = rpcUrl.includes('devnet');
  
  // Check 2: Must have test header (prevents accidental calls)
  const testHeader = req.headers['x-test-execution'];
  
  if (!isDevnet) {
    console.error('🚨 SECURITY: Attempted test execution on non-devnet network!');
    return res.status(403).json({
      success: false,
      error: 'Test execution only available on devnet',
      timestamp: new Date().toISOString(),
    });
  }
  
  if (testHeader !== 'true') {
    console.error('🚨 SECURITY: Missing X-Test-Execution header');
    return res.status(403).json({
      success: false,
      error: 'Missing required test header',
      timestamp: new Date().toISOString(),
    });
  }
  
  console.log('✅ Test environment check passed - executing on devnet');
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
    const { serializedTransaction, requireSignatures, offerId } = req.body;
    
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
    
    // Load private keys from ENV
    const makerPrivateKey = process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY;
    const takerPrivateKey = process.env.DEVNET_STAGING_RECEIVER_PRIVATE_KEY;
    
    if (!makerPrivateKey || !takerPrivateKey) {
      console.error('❌ Missing private keys in environment');
      return res.status(500).json({
        success: false,
        error: 'Test wallet private keys not configured',
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
    
    // Deserialize transaction
    let transaction: Transaction;
    try {
      const txBuffer = Buffer.from(serializedTransaction, 'base64');
      transaction = Transaction.from(txBuffer);
      console.log('✅ Transaction deserialized');
    } catch (error) {
      console.error('❌ Failed to deserialize transaction:', error);
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction format',
        timestamp: new Date().toISOString(),
      });
    }
    
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
    
    // CRITICAL: Transaction already has platform authority signature from creation
    // Use partialSign to add maker/taker signatures without overwriting existing signature
    console.log('📤 Adding remaining signatures to transaction...');
    console.log('   Additional signers:', signers.length);
    transaction.partialSign(...signers);
    
    // Send the fully-signed transaction
    console.log('📤 Submitting transaction to blockchain...');
    
    let signature: string;
    try {
      // Serialize the fully-signed transaction
      const rawTransaction = transaction.serialize();
      
      // Send and confirm using raw transaction (preserves all signatures)
      signature = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      
      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');
      
      console.log('✅ TRANSACTION CONFIRMED!');
      console.log('   Signature:', signature);
      console.log('   Solscan:', `https://solscan.io/tx/${signature}?cluster=devnet`);
      
    } catch (error: any) {
      console.error('❌ Transaction failed:', error.message || error);
      if (error.logs) {
        console.error('Transaction logs:', error.logs);
      }
      
      // Check if this is a stale cNFT proof error
      const isStaleProof = isCnftProofStaleError(error);
      
      if (isStaleProof && offerId) {
        console.warn('⚠️  Detected stale cNFT proof during execution');
        console.warn('   This transaction was built with a proof that became invalid');
        console.warn('   Suggest rebuilding transaction by re-accepting offer');
        
        return res.status(409).json({
          success: false,
          error: 'Stale cNFT proof detected',
          errorCode: 'STALE_CNFT_PROOF',
          message: 'The cNFT Merkle proof became stale between transaction building and execution. Please retry the swap.',
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
    
    // Success response
    return res.status(200).json({
      success: true,
      data: {
        signature,
        explorerUrl: `https://solscan.io/tx/${signature}?cluster=devnet`,
      },
      message: 'Swap executed successfully on-chain',
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

