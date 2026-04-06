/**
 * Unit test: Verify pool vault program service account names match the IDL.
 *
 * When the IDL is regenerated, account names can change (e.g. poolState → pool_vault).
 * This test reads the staging IDL and verifies the backend uses the correct camelCase
 * names for each instruction. Catches naming mismatches before deployment.
 */

import { expect } from 'chai';
import fs from 'fs';
import path from 'path';

// Load the staging IDL (same one the backend uses)
const idlPath = path.resolve(__dirname, '../../../src/generated/anchor/escrow-idl-staging.json');
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

// Convert snake_case to camelCase (Anchor convention)
function toCamelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// Extract account names for an instruction from the IDL
function getIdlAccountNames(instructionName: string): string[] {
  const ix = idl.instructions.find((i: any) => i.name === instructionName);
  if (!ix) throw new Error(`Instruction ${instructionName} not found in IDL`);
  return ix.accounts.map((a: any) => toCamelCase(a.name));
}

// Extract arg names for an instruction from the IDL
function getIdlArgNames(instructionName: string): string[] {
  const ix = idl.instructions.find((i: any) => i.name === instructionName);
  if (!ix) throw new Error(`Instruction ${instructionName} not found in IDL`);
  return ix.args.map((a: any) => toCamelCase(a.name));
}

describe('Pool Vault IDL Account Name Verification', () => {

  it('init_pool_vault accounts should match IDL', () => {
    const expected = getIdlAccountNames('init_pool_vault');
    console.log('    IDL accounts:', expected);

    // These are the names used in pool-vault-program.service.ts initPoolVaultOnChain()
    const backendAccounts = [
      'authority', 'poolVault', 'mint', 'vaultTokenAccount',
      'feeCollector', 'systemProgram', 'tokenProgram',
    ];

    for (const name of backendAccounts) {
      expect(expected).to.include(name, `Backend uses '${name}' but IDL doesn't have it`);
    }
  });

  it('init_pool_vault args should include expiry_timestamp', () => {
    const args = getIdlArgNames('init_pool_vault');
    console.log('    IDL args:', args);
    expect(args).to.include('poolId');
    expect(args).to.include('corridor');
    expect(args).to.include('expiryTimestamp');
  });

  it('deposit_to_pool accounts should match IDL', () => {
    const expected = getIdlAccountNames('deposit_to_pool');
    console.log('    IDL accounts:', expected);

    const backendAccounts = [
      'depositor', 'depositorTokenAccount', 'poolVault',
      'vaultTokenAccount', 'mint', 'tokenProgram',
    ];

    for (const name of backendAccounts) {
      expect(expected).to.include(name, `Backend uses '${name}' but IDL doesn't have it`);
    }
  });

  it('release_pool_member accounts should match IDL', () => {
    const expected = getIdlAccountNames('release_pool_member');
    console.log('    IDL accounts:', expected);

    const backendAccounts = [
      'authority', 'poolVault', 'vaultTokenAccount',
      'recipientTokenAccount', 'mint', 'poolReceipt',
      'systemProgram', 'tokenProgram',
    ];

    for (const name of backendAccounts) {
      expect(expected).to.include(name, `Backend uses '${name}' but IDL doesn't have it`);
    }
  });

  it('release_pool_fees accounts should match IDL', () => {
    const expected = getIdlAccountNames('release_pool_fees');
    console.log('    IDL accounts:', expected);

    const backendAccounts = [
      'authority', 'poolVault', 'vaultTokenAccount',
      'feeCollectorTokenAccount', 'mint', 'tokenProgram',
    ];

    for (const name of backendAccounts) {
      expect(expected).to.include(name, `Backend uses '${name}' but IDL doesn't have it`);
    }
  });

  it('cancel_pool_vault accounts should match IDL', () => {
    const expected = getIdlAccountNames('cancel_pool_vault');
    console.log('    IDL accounts:', expected);

    const backendAccounts = [
      'authority', 'poolVault', 'vaultTokenAccount',
      'refundTokenAccount', 'mint', 'tokenProgram',
    ];

    for (const name of backendAccounts) {
      expect(expected).to.include(name, `Backend uses '${name}' but IDL doesn't have it`);
    }
  });

  it('close_pool_vault accounts should match IDL', () => {
    const expected = getIdlAccountNames('close_pool_vault');
    console.log('    IDL accounts:', expected);

    const backendAccounts = [
      'authority', 'poolVault', 'vaultTokenAccount', 'tokenProgram',
    ];

    for (const name of backendAccounts) {
      expect(expected).to.include(name, `Backend uses '${name}' but IDL doesn't have it`);
    }
  });

  it('close_pool_receipt accounts should match IDL', () => {
    const expected = getIdlAccountNames('close_pool_receipt');
    console.log('    IDL accounts:', expected);

    const backendAccounts = ['authority', 'poolVault', 'poolReceipt'];

    for (const name of backendAccounts) {
      expect(expected).to.include(name, `Backend uses '${name}' but IDL doesn't have it`);
    }
  });

  it('release_pool_member args should match IDL (no feeBN)', () => {
    const args = getIdlArgNames('release_pool_member');
    console.log('    IDL args:', args);
    expect(args).to.include('poolId');
    expect(args).to.include('escrowId');
    expect(args).to.include('amount');
    expect(args).to.include('receiptId');
    expect(args).to.include('commitmentHash');
    expect(args).to.include('encryptedPayload');
    // feeMicroUsdc should NOT be an arg (fees released separately)
    expect(args).to.not.include('fee');
    expect(args).to.not.include('feeMicroUsdc');
  });

  it('release_institution_escrow args should include stealth_recipient', () => {
    const args = getIdlArgNames('release_institution_escrow');
    console.log('    IDL args:', args);
    expect(args).to.include('escrowId');
    expect(args).to.include('stealthRecipient');
  });
});
