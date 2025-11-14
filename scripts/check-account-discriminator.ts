/**
 * Check account discriminators to understand data structure
 */

import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://prettiest-broken-flower.solana-mainnet.quiknode.pro/2b20215bc747d769dea5e209527aa76c6efb2241/';
const PROGRAM_ID = '2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx';

async function checkDiscriminators() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const programId = new PublicKey(PROGRAM_ID);

  const accounts = await connection.getProgramAccounts(programId);
  
  console.log(`Analyzing ${Math.min(20, accounts.length)} accounts...\n`);

  const discriminatorCounts = new Map<string, number>();
  const sizeDistribution = new Map<number, number>();

  for (let i = 0; i < Math.min(20, accounts.length); i++) {
    const account = accounts[i];
    const data = account.account.data;
    const shortPda = account.pubkey.toString().slice(0, 8);
    
    // First 8 bytes are the account discriminator in Anchor
    const discriminator = data.slice(0, 8).toString('hex');
    const size = data.length;
    
    console.log(`${i + 1}. ${shortPda}... | Size: ${size} bytes | Discriminator: ${discriminator}`);
    
    discriminatorCounts.set(discriminator, (discriminatorCounts.get(discriminator) || 0) + 1);
    sizeDistribution.set(size, (sizeDistribution.get(size) || 0) + 1);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 ACCOUNT STRUCTURE ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\nDiscriminator Distribution:');
  for (const [disc, count] of discriminatorCounts) {
    console.log(`  ${disc}: ${count} accounts`);
  }
  
  console.log('\nSize Distribution:');
  for (const [size, count] of sizeDistribution) {
    console.log(`  ${size} bytes: ${count} accounts`);
  }
  
  console.log('\n💡 Insight:');
  console.log('- Different discriminators = Different account types or program versions');
  console.log('- Different sizes = Different data structures');
  console.log('\nIf multiple discriminators exist, accounts were created with different');
  console.log('program versions and may need version-specific handling for closure.');
}

checkDiscriminators().catch(console.error);



