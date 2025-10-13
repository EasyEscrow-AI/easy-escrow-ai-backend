import { PublicKey, TransactionInstruction } from '@solana/web3.js';
export declare const PROGRAM_ID: PublicKey;
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
export declare enum EscrowStatus {
    Pending = 0,
    Completed = 1,
    Cancelled = 2
}
export declare class EasyEscrowProgram {
    programId: PublicKey;
    constructor(programId?: PublicKey);
    /**
     * Get the PDA for an escrow account
     */
    getEscrowPDA(escrowId: number): [PublicKey, number];
    /**
     * Create instruction to initialize an escrow agreement
     */
    createInitAgreementInstruction(escrowId: number, usdcAmount: number, nftMint: PublicKey, expiryTimestamp: number, buyer: PublicKey, seller: PublicKey, nftTokenAccount: PublicKey): TransactionInstruction;
    /**
     * Create instruction to deposit USDC into escrow
     */
    createDepositUsdcInstruction(escrowId: number, buyer: PublicKey, buyerUsdcAccount: PublicKey, escrowUsdcAccount: PublicKey, usdcMint: PublicKey): TransactionInstruction;
    /**
     * Create instruction to deposit NFT into escrow
     */
    createDepositNftInstruction(escrowId: number, seller: PublicKey, sellerNftAccount: PublicKey, escrowNftAccount: PublicKey, nftMint: PublicKey): TransactionInstruction;
    /**
     * Create instruction to settle escrow
     */
    createSettleInstruction(escrowId: number, escrowUsdcAccount: PublicKey, sellerUsdcAccount: PublicKey, escrowNftAccount: PublicKey, buyerNftAccount: PublicKey): TransactionInstruction;
    /**
     * Create instruction to cancel if expired
     */
    createCancelIfExpiredInstruction(escrowId: number, escrowUsdcAccount: PublicKey, buyerUsdcAccount: PublicKey, escrowNftAccount: PublicKey, sellerNftAccount: PublicKey): TransactionInstruction;
    /**
     * Create instruction for admin cancel
     */
    createAdminCancelInstruction(escrowId: number, escrowUsdcAccount: PublicKey, buyerUsdcAccount: PublicKey, escrowNftAccount: PublicKey, sellerNftAccount: PublicKey, admin: PublicKey): TransactionInstruction;
}
export declare const easyEscrowProgram: EasyEscrowProgram;
//# sourceMappingURL=program.d.ts.map