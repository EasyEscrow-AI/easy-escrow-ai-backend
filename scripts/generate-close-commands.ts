/**
 * Generate Solana CLI commands to close escrow PDAs
 * Outputs commands to close accounts in batches
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const RPC_URL = 'https://prettiest-broken-flower.solana-mainnet.quiknode.pro/2b20215bc747d769dea5e209527aa76c6efb2241/';
const PROGRAM_ID = '2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx';
const ADMIN_WALLET = 'HGrfPKZuKR8BSYYJfZRFfdF1y2ApU9LSf6USQ6tpSDj2';

async function generateCloseCommands() {
  console.log('🔍 Scanning blockchain for escrow PDAs...\n');

  const connection = new Connection(RPC_URL, 'confirmed');
  const programId = new PublicKey(PROGRAM_ID);

  const accounts = await connection.getProgramAccounts(programId);

  console.log(`Found ${accounts.length} escrow PDAs\n`);

  // Create output directory
  const outputDir = path.join(__dirname, '../temp');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate list of PDAs
  const pdaListPath = path.join(outputDir, 'escrow-pdas.txt');
  const pdaList = accounts.map(acc => acc.pubkey.toString()).join('\n');
  fs.writeFileSync(pdaListPath, pdaList);
  console.log(`✅ PDA list saved to: ${pdaListPath}\n`);

  // Generate batch close script (PowerShell)
  const batchSize = 10;
  const batches = [];
  
  for (let i = 0; i < accounts.length; i += batchSize) {
    const batch = accounts.slice(i, i + batchSize);
    batches.push(batch);
  }

  let powershellScript = `# Solana CLI Batch Close Script
# Total Accounts: ${accounts.length}
# Batches: ${batches.length}
# Batch Size: ${batchSize}
# Admin Wallet: ${ADMIN_WALLET}
# Estimated Total Rent: ${(accounts.reduce((sum, acc) => sum + acc.account.lamports, 0) / 1e9).toFixed(6)} SOL

`;

  powershellScript += `# Prerequisites:
# 1. solana CLI installed and in PATH
# 2. Wallet configured: solana config set --url mainnet-beta
# 3. Admin keypair loaded (or specify with --keypair flag)

Write-Host "═══════════════════════════════════════════════════════════"
Write-Host "🏦 ESCROW RENT RECOVERY - Solana CLI Method"
Write-Host "═══════════════════════════════════════════════════════════"
Write-Host ""
Write-Host "Total Accounts: ${accounts.length}"
Write-Host "Batches: ${batches.length} (${batchSize} accounts per batch)"
Write-Host "Estimated Rent: ${(accounts.reduce((sum, acc) => sum + acc.account.lamports, 0) / 1e9).toFixed(6)} SOL"
Write-Host ""
Write-Host "⚠️  This will close ALL escrow accounts and recover rent."
Write-Host ""
$confirm = Read-Host "Continue? (yes/no)"
if ($confirm -ne "yes") {
    Write-Host "Aborted."
    exit
}
Write-Host ""

$closed = 0
$failed = 0
$totalRecovered = 0

`;

  batches.forEach((batch, batchIdx) => {
    powershellScript += `
# Batch ${batchIdx + 1}/${batches.length}
Write-Host "📦 Processing Batch ${batchIdx + 1}/${batches.length}..."
`;

    batch.forEach((account, idx) => {
      const globalIdx = batchIdx * batchSize + idx + 1;
      const lamports = account.account.lamports;
      const sol = (lamports / 1e9).toFixed(6);
      
      powershellScript += `
# Account ${globalIdx}/${accounts.length} - ${account.pubkey.toString().slice(0, 8)}... (${sol} SOL)
try {
    solana program close ${account.pubkey.toString()} --bypass-warning 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ ${globalIdx}/${accounts.length} Closed ${account.pubkey.toString().slice(0, 8)}... (+${sol} SOL)"
        $closed++
        $totalRecovered += ${lamports}
    } else {
        Write-Host "  ❌ ${globalIdx}/${accounts.length} Failed ${account.pubkey.toString().slice(0, 8)}..."
        $failed++
    }
} catch {
    Write-Host "  ❌ ${globalIdx}/${accounts.length} Failed ${account.pubkey.toString().slice(0, 8)}..."
    $failed++
}
Start-Sleep -Milliseconds 500
`;
    });

    powershellScript += `
Write-Host ""
`;
  });

  powershellScript += `
Write-Host "═══════════════════════════════════════════════════════════"
Write-Host "✅ RECOVERY COMPLETE"
Write-Host "═══════════════════════════════════════════════════════════"
Write-Host "Closed: $closed"
Write-Host "Failed: $failed"
Write-Host "Total Recovered: $($totalRecovered / 1000000000) SOL"
Write-Host "═══════════════════════════════════════════════════════════"
`;

  const scriptPath = path.join(outputDir, 'close-escrow-accounts.ps1');
  fs.writeFileSync(scriptPath, powershellScript);
  console.log(`✅ PowerShell script saved to: ${scriptPath}\n`);

  // Generate summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total Accounts: ${accounts.length}`);
  console.log(`Batches: ${batches.length} (${batchSize} per batch)`);
  console.log(`Estimated Rent: ${(accounts.reduce((sum, acc) => sum + acc.account.lamports, 0) / 1e9).toFixed(6)} SOL`);
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('🚀 Next Steps:');
  console.log('');
  console.log('1. Configure Solana CLI:');
  console.log('   solana config set --url mainnet-beta');
  console.log('');
  console.log('2. Set admin keypair (use the private key from .env.production):');
  console.log('   solana config set --keypair <path-to-admin-keypair.json>');
  console.log('   OR specify in each command: --keypair <path>');
  console.log('');
  console.log('3. Run the script:');
  console.log(`   .\\temp\\close-escrow-accounts.ps1`);
  console.log('');
}

generateCloseCommands().catch(console.error);



