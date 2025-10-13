import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  AccountMeta,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_CLOCK_PUBKEY,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, createTransferInstruction } from '@solana/spl-token';

export const PROGRAM_ID = new PublicKey('Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS');

export interface EscrowState {
  escrowId: number;
  buyer: PublicKey;
  seller: PublicKey;
  usdcAmount: number;
  nftMint: PublicKey;
  nftTokenAccount: PublicKey;
  status: EscrowStatus;
  expiryTimestamp: number;
  bump: number;
}

export enum EscrowStatus {
  Pending = 0,
  Completed = 1,
  Cancelled = 2,
}

export class EasyEscrowProgram {
  constructor(public programId: PublicKey = PROGRAM_ID) {}

  /**
   * Get the PDA for an escrow account
   */
  getEscrowPDA(escrowId: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), Buffer.from(escrowId.toString().padStart(8, '0'))],
      this.programId
    );
  }

  /**
   * Create instruction to initialize an escrow agreement
   */
  createInitAgreementInstruction(
    escrowId: number,
    usdcAmount: number,
    nftMint: PublicKey,
    expiryTimestamp: number,
    buyer: PublicKey,
    seller: PublicKey,
    nftTokenAccount: PublicKey
  ): TransactionInstruction {
    const [escrowPDA] = this.getEscrowPDA(escrowId);

    const data = Buffer.alloc(8 + 8 + 8 + 32 + 32 + 32 + 32 + 32 + 1 + 8 + 1);
    let offset = 0;

    // Instruction discriminator (8 bytes)
    data.writeUInt32LE(0xafaf6d1f, offset);
    offset += 4;
    data.writeUInt32LE(0x0d989bed, offset);
    offset += 4;

    // escrowId (8 bytes)
    data.writeBigUInt64LE(BigInt(escrowId), offset);
    offset += 8;

    // usdcAmount (8 bytes)
    data.writeBigUInt64LE(BigInt(usdcAmount), offset);
    offset += 8;

    // nftMint (32 bytes)
    nftMint.toBuffer().copy(data, offset);
    offset += 32;

    // expiryTimestamp (8 bytes)
    data.writeBigInt64LE(BigInt(expiryTimestamp), offset);
    offset += 8;

    const keys: AccountMeta[] = [
      { pubkey: escrowPDA, isSigner: false, isWritable: true },
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: seller, isSigner: false, isWritable: false },
      { pubkey: nftTokenAccount, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    return new TransactionInstruction({
      keys,
      programId: this.programId,
      data,
    });
  }

  /**
   * Create instruction to deposit USDC into escrow
   */
  createDepositUsdcInstruction(
    escrowId: number,
    buyer: PublicKey,
    buyerUsdcAccount: PublicKey,
    escrowUsdcAccount: PublicKey,
    usdcMint: PublicKey
  ): TransactionInstruction {
    const [escrowPDA] = this.getEscrowPDA(escrowId);

    const data = Buffer.alloc(8);
    // Instruction discriminator
    data.writeUInt32LE(0x33e685a4, 0);
    data.writeUInt32LE(0x017f83ad, 4);

    const keys: AccountMeta[] = [
      { pubkey: escrowPDA, isSigner: false, isWritable: true },
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: buyerUsdcAccount, isSigner: false, isWritable: true },
      { pubkey: escrowUsdcAccount, isSigner: false, isWritable: true },
      { pubkey: usdcMint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    return new TransactionInstruction({
      keys,
      programId: this.programId,
      data,
    });
  }

  /**
   * Create instruction to deposit NFT into escrow
   */
  createDepositNftInstruction(
    escrowId: number,
    seller: PublicKey,
    sellerNftAccount: PublicKey,
    escrowNftAccount: PublicKey,
    nftMint: PublicKey
  ): TransactionInstruction {
    const [escrowPDA] = this.getEscrowPDA(escrowId);

    const data = Buffer.alloc(8);
    // Instruction discriminator
    data.writeUInt32LE(0xe8db05fd, 0);
    data.writeUInt32LE(0x588cf74f, 4);

    const keys: AccountMeta[] = [
      { pubkey: escrowPDA, isSigner: false, isWritable: true },
      { pubkey: seller, isSigner: true, isWritable: true },
      { pubkey: sellerNftAccount, isSigner: false, isWritable: true },
      { pubkey: escrowNftAccount, isSigner: false, isWritable: true },
      { pubkey: nftMint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    return new TransactionInstruction({
      keys,
      programId: this.programId,
      data,
    });
  }

  /**
   * Create instruction to settle escrow
   */
  createSettleInstruction(
    escrowId: number,
    escrowUsdcAccount: PublicKey,
    sellerUsdcAccount: PublicKey,
    escrowNftAccount: PublicKey,
    buyerNftAccount: PublicKey
  ): TransactionInstruction {
    const [escrowPDA] = this.getEscrowPDA(escrowId);

    const data = Buffer.alloc(8);
    // Instruction discriminator
    data.writeUInt32LE(0x3339e167, 0);
    data.writeUInt32LE(0x4961d7c5, 4);

    const keys: AccountMeta[] = [
      { pubkey: escrowPDA, isSigner: false, isWritable: true },
      { pubkey: escrowUsdcAccount, isSigner: false, isWritable: true },
      { pubkey: sellerUsdcAccount, isSigner: false, isWritable: true },
      { pubkey: escrowNftAccount, isSigner: false, isWritable: true },
      { pubkey: buyerNftAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    return new TransactionInstruction({
      keys,
      programId: this.programId,
      data,
    });
  }

  /**
   * Create instruction to cancel if expired
   */
  createCancelIfExpiredInstruction(
    escrowId: number,
    escrowUsdcAccount: PublicKey,
    buyerUsdcAccount: PublicKey,
    escrowNftAccount: PublicKey,
    sellerNftAccount: PublicKey
  ): TransactionInstruction {
    const [escrowPDA] = this.getEscrowPDA(escrowId);

    const data = Buffer.alloc(8);
    // Instruction discriminator
    data.writeUInt32LE(0xfef3f442, 0);
    data.writeUInt32LE(0xae42e07c, 4);

    const keys: AccountMeta[] = [
      { pubkey: escrowPDA, isSigner: false, isWritable: true },
      { pubkey: escrowUsdcAccount, isSigner: false, isWritable: true },
      { pubkey: buyerUsdcAccount, isSigner: false, isWritable: true },
      { pubkey: escrowNftAccount, isSigner: false, isWritable: true },
      { pubkey: sellerNftAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    return new TransactionInstruction({
      keys,
      programId: this.programId,
      data,
    });
  }

  /**
   * Create instruction for admin cancel
   */
  createAdminCancelInstruction(
    escrowId: number,
    escrowUsdcAccount: PublicKey,
    buyerUsdcAccount: PublicKey,
    escrowNftAccount: PublicKey,
    sellerNftAccount: PublicKey,
    admin: PublicKey
  ): TransactionInstruction {
    const [escrowPDA] = this.getEscrowPDA(escrowId);

    const data = Buffer.alloc(8);
    // Instruction discriminator
    data.writeUInt32LE(0xa334c8e7, 0);
    data.writeUInt32LE(0x8c0345ba, 4);

    const keys: AccountMeta[] = [
      { pubkey: escrowPDA, isSigner: false, isWritable: true },
      { pubkey: escrowUsdcAccount, isSigner: false, isWritable: true },
      { pubkey: buyerUsdcAccount, isSigner: false, isWritable: true },
      { pubkey: escrowNftAccount, isSigner: false, isWritable: true },
      { pubkey: sellerNftAccount, isSigner: false, isWritable: true },
      { pubkey: admin, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    return new TransactionInstruction({
      keys,
      programId: this.programId,
      data,
    });
  }
}

export const easyEscrowProgram = new EasyEscrowProgram();