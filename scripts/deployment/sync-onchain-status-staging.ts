/**
 * Sync On-Chain Escrow Status Script
 * 
 * This script checks the on-chain status of escrow accounts and syncs
 * the database to match reality. Used when settlements completed on-chain
 * but failed to update the database.
 */

import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load staging environment
dotenv.config({ path: path.join(__dirname, '../../.env.staging') });

async function syncOnChainStatus() {
  console.log('\n====================================================================');
  console.log('🔄 SYNC: On-Chain Escrow Status');
  console.log('====================================================================\n');

  // Bypass SSL for DB
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  // Setup Solana connection
  const connection = new Connection(process.env.SOLANA_RPC_URL!, 'confirmed');
  const programIdStr = process.env.DEVNET_STAGING_PROGRAM_ID!;
  const programId = new PublicKey(programIdStr);
  
  // Load IDL
  const idlPath = path.join(__dirname, '../../target/idl/escrow.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
  
  // Override IDL metadata with correct program ID
  idl.metadata = { ...idl.metadata, address: programIdStr };
  
  // Use dummy keypair (we're only reading, not signing)
  const dummyKeypair = Keypair.generate();
  const wallet = new Wallet(dummyKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const program = new Program(idl, provider);

  // Setup DB connection
  const client = new Client({
    connectionString: process.env.DATABASE_ADMIN_URL!,
  });

  try {
    await client.connect();
    console.log('✅ Connected to staging database');
    console.log(`✅ Connected to Solana: ${process.env.SOLANA_RPC_URL}\n`);

    // Get agreements that are stuck
    console.log('📊 Finding agreements that may be out of sync...\n');
    const agreements = await client.query(`
      SELECT 
        agreement_id,
        escrow_pda,
        status,
        nft_mint,
        price,
        seller,
        buyer,
        settle_tx_id
      FROM agreements
      WHERE status = 'BOTH_LOCKED'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    if (agreements.rows.length === 0) {
      console.log('✅ No stuck agreements found!\n');
      return;
    }

    console.log(`Found ${agreements.rows.length} agreements in BOTH_LOCKED status:\n`);

    for (const agreement of agreements.rows) {
      console.log(`─────────────────────────────────────────────────────────────────────`);
      console.log(`Agreement: ${agreement.agreement_id}`);
      console.log(`Escrow PDA: ${agreement.escrow_pda}`);
      console.log(`DB Status: ${agreement.status}`);
      console.log(`Settle TX: ${agreement.settle_tx_id || 'null'}`);

      try {
        // Fetch on-chain escrow account
        const escrowPda = new PublicKey(agreement.escrow_pda);
        // @ts-ignore - IDL types not available
        const escrowAccount: any = await program.account.escrowAccount.fetch(escrowPda);

        console.log(`On-Chain Status: ${JSON.stringify(escrowAccount.status)}`);

        // Check if it's settled on-chain
        const isSettledOnChain = 'settled' in escrowAccount.status;

        if (isSettledOnChain) {
          console.log(`⚠️  MISMATCH: On-chain is SETTLED, DB shows BOTH_LOCKED`);
          
          // Check if settle_tx_id exists
          if (agreement.settle_tx_id) {
            console.log(`   Settlement TX found: ${agreement.settle_tx_id}`);
            
            // Update agreement status to SETTLED
            console.log(`   🔧 Updating agreement status to SETTLED...`);
            await client.query(`
              UPDATE agreements
              SET status = 'SETTLED', updated_at = NOW()
              WHERE agreement_id = $1
            `, [agreement.agreement_id]);

            // Clear idempotency key
            console.log(`   🔧 Clearing idempotency key...`);
            await client.query(`
              DELETE FROM idempotency_keys
              WHERE key = $1
            `, [`settlement_${agreement.agreement_id}`]);

            console.log(`   ✅ Agreement synced!`);
          } else {
            console.log(`   ⚠️  No settlement TX recorded - this is unusual`);
            console.log(`   Manual intervention may be needed`);
          }
        } else {
          console.log(`✅ Status matches: Both show non-settled state`);
        }

      } catch (error: any) {
        if (error.message?.includes('Account does not exist')) {
          console.log(`⚠️  Escrow account does not exist on-chain!`);
          console.log(`   This agreement may need manual cleanup`);
        } else {
          console.log(`❌ Error checking on-chain status:`, error.message);
        }
      }

      console.log('');
    }

    console.log('====================================================================');
    console.log('✅ SYNC COMPLETE');
    console.log('====================================================================\n');

  } catch (error) {
    console.error('❌ Error during sync:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run sync
syncOnChainStatus()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

