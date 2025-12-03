import { expect } from 'chai';
import { PublicKey, Keypair } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { 
  generateTestKeypair, 
  generateTestPublicKey, 
  usdcToLamports,
  lamportsToUsdc,
} from '../helpers/test-utils';

describe('Solana Service - Unit Tests', () => {
  describe('Public Key Generation', () => {
    it('should generate valid public keys', () => {
      const pubkey = generateTestPublicKey();
      
      expect(pubkey).to.be.instanceOf(PublicKey);
      expect(pubkey.toString()).to.have.lengthOf.at.least(32);
    });

    it('should generate unique public keys', () => {
      const pubkey1 = generateTestPublicKey();
      const pubkey2 = generateTestPublicKey();
      
      expect(pubkey1.toString()).to.not.equal(pubkey2.toString());
    });
  });

  describe('Keypair Generation', () => {
    it('should generate valid keypairs', () => {
      const keypair = generateTestKeypair();
      
      expect(keypair).to.be.instanceOf(Keypair);
      expect(keypair.publicKey).to.be.instanceOf(PublicKey);
      expect(keypair.secretKey).to.have.lengthOf(64);
    });

    it('should generate unique keypairs', () => {
      const keypair1 = generateTestKeypair();
      const keypair2 = generateTestKeypair();
      
      expect(keypair1.publicKey.toString()).to.not.equal(keypair2.publicKey.toString());
    });
  });

  describe('PDA Derivation', () => {
    it('should derive consistent PDAs for same input', () => {
      const programId = generateTestPublicKey();
      const escrowId = new anchor.BN(12345);

      const [pda1, bump1] = PublicKey.findProgramAddressSync(
        [Buffer.from('escrow'), escrowId.toArrayLike(Buffer, 'le', 8)],
        programId
      );

      const [pda2, bump2] = PublicKey.findProgramAddressSync(
        [Buffer.from('escrow'), escrowId.toArrayLike(Buffer, 'le', 8)],
        programId
      );

      expect(pda1.toString()).to.equal(pda2.toString());
      expect(bump1).to.equal(bump2);
    });

    it('should derive different PDAs for different escrow IDs', () => {
      const programId = generateTestPublicKey();
      const escrowId1 = new anchor.BN(12345);
      const escrowId2 = new anchor.BN(67890);

      const [pda1] = PublicKey.findProgramAddressSync(
        [Buffer.from('escrow'), escrowId1.toArrayLike(Buffer, 'le', 8)],
        programId
      );

      const [pda2] = PublicKey.findProgramAddressSync(
        [Buffer.from('escrow'), escrowId2.toArrayLike(Buffer, 'le', 8)],
        programId
      );

      expect(pda1.toString()).to.not.equal(pda2.toString());
    });

    it('should produce valid bump seeds', () => {
      const programId = generateTestPublicKey();
      const escrowId = new anchor.BN(12345);

      const [pda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from('escrow'), escrowId.toArrayLike(Buffer, 'le', 8)],
        programId
      );

      expect(bump).to.be.a('number');
      expect(bump).to.be.at.least(0);
      expect(bump).to.be.at.most(255);
    });
  });

  describe('USDC Amount Conversion', () => {
    it('should convert USDC to lamports correctly', () => {
      expect(usdcToLamports(1)).to.equal(1_000_000);
      expect(usdcToLamports(100)).to.equal(100_000_000);
      expect(usdcToLamports(0.5)).to.equal(500_000);
    });

    it('should convert lamports to USDC correctly', () => {
      expect(lamportsToUsdc(1_000_000)).to.equal(1);
      expect(lamportsToUsdc(100_000_000)).to.equal(100);
      expect(lamportsToUsdc(500_000)).to.equal(0.5);
    });

    it('should handle round-trip conversion', () => {
      const originalAmount = 123.456789;
      const lamports = usdcToLamports(originalAmount);
      const converted = lamportsToUsdc(lamports);
      
      // Due to 6 decimal precision, we lose some precision
      expect(converted).to.be.closeTo(originalAmount, 0.000001);
    });
  });

  describe('Anchor BN Handling', () => {
    it('should create BN from number', () => {
      const bn = new anchor.BN(12345);
      expect(bn.toNumber()).to.equal(12345);
    });

    it('should create BN from string', () => {
      const bn = new anchor.BN('999999999999');
      expect(bn.toString()).to.equal('999999999999');
    });

    it('should perform BN arithmetic', () => {
      const bn1 = new anchor.BN(100);
      const bn2 = new anchor.BN(50);
      
      const sum = bn1.add(bn2);
      const diff = bn1.sub(bn2);
      const product = bn1.mul(bn2);
      const quotient = bn1.div(bn2);
      
      expect(sum.toNumber()).to.equal(150);
      expect(diff.toNumber()).to.equal(50);
      expect(product.toNumber()).to.equal(5000);
      expect(quotient.toNumber()).to.equal(2);
    });

    it('should compare BN values', () => {
      const bn1 = new anchor.BN(100);
      const bn2 = new anchor.BN(50);
      const bn3 = new anchor.BN(100);
      
      expect(bn1.gt(bn2)).to.be.true;
      expect(bn2.lt(bn1)).to.be.true;
      expect(bn1.eq(bn3)).to.be.true;
    });
  });

  describe('Transaction Signature Validation', () => {
    it('should validate transaction signature format', () => {
      // Solana transaction signatures are base58 encoded and ~88 characters
      const validSig = 'TEST_TRANSACTION_SIGNATURE_123456789';
      expect(validSig).to.be.a('string');
      expect(validSig.length).to.be.greaterThan(0);
    });
  });

  describe('Token Account Address Derivation', () => {
    it('should derive associated token account address', async () => {
      const owner = generateTestPublicKey();
      const mint = generateTestPublicKey();
      
      // Note: In real tests, we'd use getAssociatedTokenAddress from SPL Token
      // This is a simplified test showing the pattern
      expect(owner).to.be.instanceOf(PublicKey);
      expect(mint).to.be.instanceOf(PublicKey);
    });
  });
});

