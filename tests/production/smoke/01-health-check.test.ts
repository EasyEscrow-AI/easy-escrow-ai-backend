/**
 * Production Smoke Test: Health Check
 * 
 * Quick validation that production system is responsive and healthy.
 * No transactions - read-only operations.
 * 
 * Expected duration: < 10 seconds
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { Connection, PublicKey } from '@solana/web3.js';
import * as path from 'path';
import * as fs from 'fs';

// Production configuration
const RPC_URL = process.env.MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID = new PublicKey('2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx');
const TREASURY_PDA = new PublicKey('FPC3dgGpTNxHVRxV9sJKqz1hPWGf59Fn99bNSmwH1iVu');

describe('🔍 Production Smoke Test: Health Check', () => {
  let connection: Connection;
  
  before(function() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║         PRODUCTION SMOKE TEST: HEALTH CHECK                  ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    connection = new Connection(RPC_URL, 'confirmed');
    console.log('📡 RPC:', RPC_URL);
    console.log('🌐 Network: MAINNET-BETA\n');
  });
  
  it('should connect to Solana mainnet-beta', async function() {
    this.timeout(30000);
    
    console.log('✓ Testing Solana RPC connection...');
    
    const version = await connection.getVersion();
    console.log(`  Connected! Solana version: ${version['solana-core']}`);
    
    expect(version).to.have.property('solana-core');
  });
  
  it('should verify program is deployed', async function() {
    this.timeout(30000);
    
    console.log('✓ Checking program deployment...');
    
    const programAccount = await connection.getAccountInfo(PROGRAM_ID);
    
    expect(programAccount).to.not.be.null;
    expect(programAccount!.executable).to.be.true;
    
    console.log(`  Program deployed! Owner: ${programAccount!.owner.toBase58()}`);
    console.log(`  Program size: ${programAccount!.data.length} bytes`);
  });
  
  it('should verify Treasury PDA is initialized', async function() {
    this.timeout(30000);
    
    console.log('✓ Checking Treasury PDA...');
    
    const treasuryAccount = await connection.getAccountInfo(TREASURY_PDA);
    
    expect(treasuryAccount).to.not.be.null;
    expect(treasuryAccount!.owner.toBase58()).to.equal(PROGRAM_ID.toBase58());
    
    const balance = treasuryAccount!.lamports / 1e9;
    console.log(`  Treasury initialized! Balance: ${balance.toFixed(4)} SOL`);
  });
  
  it('should verify production IDL exists', function() {
    console.log('✓ Checking production IDL...');
    
    const idlPath = path.join(__dirname, '../../../src/generated/anchor/escrow-idl-production.json');
    const idlExists = fs.existsSync(idlPath);
    
    expect(idlExists).to.be.true;
    
    if (idlExists) {
      const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
      console.log(`  IDL found! Address: ${idl.address}`);
      expect(idl.address).to.equal(PROGRAM_ID.toBase58());
    }
  });
  
  it('should verify test wallets exist', function() {
    console.log('✓ Checking test wallet files...');
    
    const senderPath = path.join(__dirname, '../../../wallets/production/production-sender.json');
    const receiverPath = path.join(__dirname, '../../../wallets/production/production-receiver.json');
    
    const senderExists = fs.existsSync(senderPath);
    const receiverExists = fs.existsSync(receiverPath);
    
    expect(senderExists).to.be.true;
    expect(receiverExists).to.be.true;
    
    console.log(`  Sender wallet: ${senderExists ? '✅' : '❌'}`);
    console.log(`  Receiver wallet: ${receiverExists ? '✅' : '❌'}`);
  });
  
  after(function() {
    console.log('\n✅ Production health check completed successfully!\n');
  });
});

