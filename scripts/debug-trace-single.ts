/**
 * Debug: Inspect a single escrow's transactions to understand the structure
 */

import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://prettiest-broken-flower.solana-mainnet.quiknode.pro/2b20215bc747d769dea5e209527aa76c6efb2241/';

// Pick an escrow with an actual NFT (amount: 1)
// From the output: BGrvzMqy has 2 token accounts, one with amount: 1
const ESCROW_PDA = 'BGrvzMqyQcTZm4TxFRzkYQv8MJTA1c4hS66xKqYqvqJp';
const TOKEN_ACCOUNT = '4g1xLLc8UXbBT18UgpJTFiFxWWXTY6yPwkZnuUmSr6A9'; // Has amount: 1

async function debugTrace() {
  const connection = new Connection(RPC_URL, 'confirmed');
  
  console.log('🔍 Inspecting escrow:', ESCROW_PDA);
  console.log('🔍 Token account:', TOKEN_ACCOUNT);
  console.log('');
  
  // Get signatures
  const escrowPubkey = new PublicKey(ESCROW_PDA);
  const signatures = await connection.getSignaturesForAddress(escrowPubkey, { limit: 100 });
  
  console.log(`Found ${signatures.length} transactions\n`);
  
  // Get each transaction
  for (let i = 0; i < Math.min(signatures.length, 10); i++) {
    const sig = signatures[i];
    console.log(`\nTransaction ${i + 1}: ${sig.signature}`);
    console.log(`  Slot: ${sig.slot}`);
    console.log(`  Time: ${new Date(sig.blockTime! * 1000).toISOString()}`);
    
    try {
      const tx = await connection.getParsedTransaction(sig.signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      
      if (!tx) {
        console.log('  ❌ Transaction not found');
        continue;
      }
      
      console.log(`  Instructions: ${tx.transaction.message.instructions.length}`);
      
      // Inspect each instruction
      tx.transaction.message.instructions.forEach((ix: any, idx: number) => {
        console.log(`\n  Instruction ${idx + 1}:`);
        
        if ('parsed' in ix) {
          console.log(`    Program: ${ix.program}`);
          console.log(`    Type: ${ix.parsed.type}`);
          console.log(`    Info:`, JSON.stringify(ix.parsed.info, null, 6));
        } else {
          console.log(`    Program: ${ix.programId.toString()}`);
          console.log(`    [Not parsed - custom program]`);
        }
      });
      
    } catch (error: any) {
      console.log(`  ❌ Error: ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

debugTrace().catch(console.error);




