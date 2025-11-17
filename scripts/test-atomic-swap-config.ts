/**
 * Test Atomic Swap Configuration
 * 
 * Quick script to verify all atomic swap configuration loads correctly
 */

import {
  getAtomicSwapProgramConfig,
  validateProgramConfig,
  getFeeConfig,
  getCNFTIndexerConfig,
  getSwapOfferConfig,
  getNoncePoolConfig,
  validateAtomicSwapConfig,
} from '../src/config';

async function testConfig() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Atomic Swap Configuration Test');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // Test program configuration
    console.log('1️⃣  Testing Program Configuration...');
    const programConfig = getAtomicSwapProgramConfig();
    console.log('✅ Program Config:');
    console.log(`   Network: ${programConfig.network}`);
    console.log(`   Program ID: ${programConfig.programIdString}`);
    console.log(`   Fee Collector: ${programConfig.feeCollectorAddressString}`);
    if (programConfig.authorityKeypairPath) {
      console.log(`   Authority Path: ${programConfig.authorityKeypairPath}`);
    }
    console.log('');

    // Test fee configuration
    console.log('2️⃣  Testing Fee Configuration...');
    const feeConfig = getFeeConfig();
    console.log('✅ Fee Config:');
    console.log(`   Flat Fee: ${feeConfig.flatFeeSol} SOL (${feeConfig.flatFeeLamports} lamports)`);
    console.log(`   Percentage Fee: ${feeConfig.percentageFeeBps} BPS (${feeConfig.percentageFeeRate * 100}%)`);
    console.log(`   Max Fee: ${feeConfig.maxFeeSol} SOL (${feeConfig.maxFeeLamports} lamports)`);
    console.log(`   Min Fee: ${feeConfig.minFeeLamports / 1_000_000_000} SOL (${feeConfig.minFeeLamports} lamports)`);
    console.log('');

    // Test cNFT indexer configuration
    console.log('3️⃣  Testing cNFT Indexer Configuration...');
    const cnftConfig = getCNFTIndexerConfig();
    console.log('✅ cNFT Indexer Config:');
    console.log(`   API URL: ${cnftConfig.apiUrl}`);
    console.log(`   API Key: ${cnftConfig.apiKey ? '***' + cnftConfig.apiKey.slice(-4) : '(not set)'}`);
    console.log(`   Timeout: ${cnftConfig.timeoutMs}ms`);
    console.log(`   Max Retries: ${cnftConfig.maxRetries}`);
    console.log(`   Caching: ${cnftConfig.enableCaching ? 'enabled' : 'disabled'} (TTL: ${cnftConfig.cacheTTL}ms)`);
    console.log('');

    // Test swap offer configuration
    console.log('4️⃣  Testing Swap Offer Configuration...');
    const offerConfig = getSwapOfferConfig();
    console.log('✅ Swap Offer Config:');
    console.log(`   Default Expiration: ${offerConfig.defaultExpirationMs / (24 * 60 * 60 * 1000)} days`);
    console.log(`   Min Expiration: ${offerConfig.minExpirationMs / (60 * 60 * 1000)} hours`);
    console.log(`   Max Expiration: ${offerConfig.maxExpirationMs / (24 * 60 * 60 * 1000)} days`);
    console.log(`   Max Assets Per Side: ${offerConfig.maxAssetsPerSide}`);
    console.log(`   Max SOL Amount: ${offerConfig.maxSolAmountLamports / 1_000_000_000} SOL`);
    console.log('');

    // Test nonce pool configuration
    console.log('5️⃣  Testing Nonce Pool Configuration...');
    const nonceConfig = getNoncePoolConfig();
    console.log('✅ Nonce Pool Config:');
    console.log(`   Pool Size: ${nonceConfig.minPoolSize} - ${nonceConfig.maxPoolSize}`);
    console.log(`   Replenishment Threshold: ${nonceConfig.replenishmentThreshold}`);
    console.log(`   Batch Size: ${nonceConfig.replenishmentBatchSize}`);
    console.log(`   Assignment Timeout: ${nonceConfig.assignmentTimeoutMs}ms`);
    console.log(`   Cleanup Interval: ${nonceConfig.cleanupIntervalMs / (60 * 60 * 1000)} hours`);
    console.log(`   Subsidy Enabled: ${nonceConfig.enableSubsidy}`);
    console.log('');

    // Run full validation
    console.log('6️⃣  Running Full Configuration Validation...');
    validateProgramConfig();
    console.log('');

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  ✅ All Configuration Tests Passed!');
    console.log('═══════════════════════════════════════════════════════════════\n');

    process.exit(0);
  } catch (error) {
    console.error('\n═══════════════════════════════════════════════════════════════');
    console.error('  ❌ Configuration Test Failed!');
    console.error('═══════════════════════════════════════════════════════════════\n');
    console.error('Error:', error);
    console.error('\n');
    process.exit(1);
  }
}

testConfig();

