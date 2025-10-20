#!/usr/bin/env node
/**
 * DO Server E2E Readiness Verification Script
 * Simple Node.js script to check if server has everything needed for E2E tests
 * Run with: node scripts/verify-do-server.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

let passCount = 0;
let failCount = 0;
let warnCount = 0;

function pass(msg) {
  console.log(`${colors.green}✅ PASS${colors.reset}: ${msg}`);
  passCount++;
}

function fail(msg) {
  console.log(`${colors.red}❌ FAIL${colors.reset}: ${msg}`);
  failCount++;
}

function warn(msg) {
  console.log(`${colors.yellow}⚠️  WARN${colors.reset}: ${msg}`);
  warnCount++;
}

function info(msg) {
  console.log(`${colors.cyan}ℹ️  INFO${colors.reset}: ${msg}`);
}

function section(title) {
  console.log('\n' + '='.repeat(50));
  console.log(colors.cyan + title + colors.reset);
  console.log('='.repeat(50) + '\n');
}

function runCommand(cmd, silent = true) {
  try {
    const result = execSync(cmd, { encoding: 'utf8', stdio: silent ? 'pipe' : 'inherit' });
    return { success: true, output: result.trim() };
  } catch (error) {
    return { success: false, output: error.message };
  }
}

function checkEnv(varName, isSecret = false) {
  if (process.env[varName]) {
    if (isSecret) {
      pass(`${varName} is set (value masked for security)`);
    } else {
      pass(`${varName} is set: ${process.env[varName]}`);
    }
    return true;
  } else {
    fail(`${varName} is NOT set`);
    return false;
  }
}

console.log(colors.cyan + '='.repeat(50));
console.log('DO Server E2E Test Readiness Check');
console.log('='.repeat(50) + colors.reset + '\n');

// 1. Node.js and npm
section('1. Node.js Environment');
const nodeVersion = process.version;
pass(`Node.js installed: ${nodeVersion}`);

const npmResult = runCommand('npm --version');
if (npmResult.success) {
  pass(`npm installed: ${npmResult.output}`);
} else {
  fail('npm not installed');
}

// 2. Solana CLI
section('2. Solana CLI');
const solanaResult = runCommand('solana --version');
if (solanaResult.success) {
  pass(`Solana CLI installed: ${solanaResult.output}`);
  
  // Check Solana config
  const configResult = runCommand('solana config get');
  if (configResult.success) {
    if (configResult.output.includes('devnet')) {
      pass('Solana configured for devnet');
    } else {
      warn('Solana NOT configured for devnet');
      info('Run: solana config set --url devnet');
    }
  }
} else {
  fail('Solana CLI not installed');
  info('Install: sh -c "$(curl -sSfL https://release.solana.com/stable/install)"');
}

// 3. Anchor CLI
section('3. Anchor Framework');
const anchorResult = runCommand('anchor --version');
if (anchorResult.success) {
  const versionMatch = anchorResult.output.match(/anchor-cli ([0-9.]+)/);
  const anchorVersion = versionMatch ? versionMatch[1] : 'unknown';
  
  if (anchorVersion === '0.32.1') {
    pass(`Anchor CLI version correct: ${anchorVersion}`);
  } else {
    fail(`Anchor CLI version mismatch: expected 0.32.1, got ${anchorVersion}`);
    info('Install correct version:');
    info('  cargo install --git https://github.com/coral-xyz/anchor avm --locked --force');
    info('  avm install 0.32.1');
    info('  avm use 0.32.1');
  }
} else {
  fail('Anchor CLI not installed');
  info('This is the most critical missing component for E2E tests!');
  info('Install:');
  info('  cargo install --git https://github.com/coral-xyz/anchor avm --locked --force');
  info('  avm install 0.32.1');
  info('  avm use 0.32.1');
}

// 4. Environment Variables
section('4. Environment Variables');
checkEnv('NODE_ENV', false);
checkEnv('SOLANA_NETWORK', false);
checkEnv('SOLANA_RPC_URL', false);
checkEnv('ESCROW_PROGRAM_ID', false);
checkEnv('USDC_MINT_ADDRESS', false);

// Wallet secrets
checkEnv('DEVNET_SENDER_PRIVATE_KEY', true);
checkEnv('DEVNET_RECEIVER_PRIVATE_KEY', true);
checkEnv('DEVNET_ADMIN_PRIVATE_KEY', true);
checkEnv('DEVNET_FEE_COLLECTOR_PRIVATE_KEY', true);

// 5. Node Dependencies
section('5. Node.js Dependencies');
const nodeModulesPath = path.join(process.cwd(), 'node_modules');
if (fs.existsSync(nodeModulesPath)) {
  pass('node_modules directory exists');
  
  const deps = [
    '@coral-xyz/anchor',
    '@solana/web3.js',
    '@solana/spl-token',
    '@metaplex-foundation/js',
    'bs58',
    'mocha',
    'chai'
  ];
  
  deps.forEach(dep => {
    const depPath = path.join(nodeModulesPath, dep);
    if (fs.existsSync(depPath)) {
      try {
        const pkgJson = JSON.parse(fs.readFileSync(path.join(depPath, 'package.json'), 'utf8'));
        pass(`${dep} installed: ${pkgJson.version}`);
      } catch (e) {
        pass(`${dep} installed`);
      }
    } else {
      fail(`${dep} NOT installed`);
    }
  });
} else {
  warn('node_modules not found');
  info('Run: npm ci');
}

// 6. Test Files
section('6. Test Files');
const testFiles = [
  'tests/e2e/devnet-nft-usdc-swap.test.ts',
  'tests/integration-test-devnet.ts',
  'tests/helpers/devnet-wallet-manager.ts',
  'tests/helpers/devnet-token-setup.ts',
  'tests/helpers/devnet-nft-setup.ts',
  'Anchor.toml'
];

testFiles.forEach(file => {
  if (fs.existsSync(file)) {
    pass(`File exists: ${file}`);
  } else {
    fail(`File missing: ${file}`);
  }
});

// 7. Database & Redis
section('7. Database & Redis Connections');
checkEnv('DATABASE_URL', false);
checkEnv('REDIS_URL', false);

// Summary
section('SUMMARY');
const total = passCount + failCount + warnCount;
console.log(`Results:`);
console.log(`  ${colors.green}✅ Passed: ${passCount}${colors.reset}`);
console.log(`  ${colors.red}❌ Failed: ${failCount}${colors.reset}`);
console.log(`  ${colors.yellow}⚠️  Warnings: ${warnCount}${colors.reset}`);
console.log(`  ━━━━━━━━━━━━━━━━━━`);
console.log(`  Total: ${total} checks\n`);

if (failCount === 0) {
  if (warnCount === 0) {
    console.log(`${colors.green}🎉 ALL CHECKS PASSED!${colors.reset}`);
    console.log('Server is ready for E2E tests.\n');
  } else {
    console.log(`${colors.yellow}⚠️  PASSED WITH WARNINGS${colors.reset}`);
    console.log('Server is mostly ready, but some issues need attention.\n');
  }
  console.log('Run E2E tests with:');
  console.log('  npm run test:e2e\n');
  process.exit(0);
} else {
  console.log(`${colors.red}❌ CHECKS FAILED${colors.reset}`);
  console.log('Server is NOT ready for E2E tests.');
  console.log('Please fix the issues above before running tests.\n');
  process.exit(1);
}

