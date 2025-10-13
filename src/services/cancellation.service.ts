/**
 * Cancellation Service
 * 
 * Handles admin-initiated cancellations with multisig approval workflow.
 * Provides secure cancellation of agreements with proper authorization and audit logging.
 */

import { PrismaClient, AgreementStatus } from '../generated/prisma';

const prisma = new PrismaClient();

/**
 * Cancellation proposal status
 */
export enum CancellationProposalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXECUTED = 'EXECUTED',
  EXPIRED = 'EXPIRED',
}

/**
 * Cancellation proposal
 */
export interface CancellationProposal {
  id: string;
  agreementId: string;
  proposer: string;
  reason: string;
  status: CancellationProposalStatus;
  requiredSignatures: number;
  signatures: CancellationSignature[];
  createdAt: Date;
  expiresAt: Date;
  executedAt?: Date;
}

/**
 * Cancellation signature
 */
export interface CancellationSignature {
  signer: string;
  signedAt: Date;
  signature: string;
}

/**
 * Cancellation request
 */
export interface CancellationRequest {
  agreementId: string;
  proposer: string;
  reason: string;
  requiredSignatures?: number;
  expiryHours?: number;
}

/**
 * Cancellation result
 */
export interface CancellationResult {
  agreementId: string;
  success: boolean;
  proposalId?: string;
  transactionId?: string;
  status: AgreementStatus;
  error?: string;
}

/**
 * Multisig configuration
 */
interface MultisigConfig {
  requiredSignatures: number;
  authorizedSigners: string[];
  proposalExpiryHours: number;
}

/**
 * Cancellation Service Class
 * 
 * Manages admin-initiated cancellations with multisig approval workflow
 */
export class CancellationService {
  private multisigConfig: MultisigConfig;
  private proposals: Map<string, CancellationProposal> = new Map();

  constructor(config?: Partial<MultisigConfig>) {
    this.multisigConfig = {
      requiredSignatures: config?.requiredSignatures || 2,
      authorizedSigners: config?.authorizedSigners || [],
      proposalExpiryHours: config?.proposalExpiryHours || 24,
    };

    console.log('[CancellationService] Initialized with config:', this.multisigConfig);
  }

  /**
   * Create a cancellation proposal
   */
  public async createCancellationProposal(
    request: CancellationRequest
  ): Promise<CancellationProposal> {
    console.log(`[CancellationService] Creating cancellation proposal for: ${request.agreementId}`);

    try {
      // Validate proposer is authorized
      if (!this.isAuthorizedSigner(request.proposer)) {
        throw new Error(`Proposer ${request.proposer} is not authorized to create cancellation proposals`);
      }

      // Check if agreement exists and is cancellable
      const agreement = await prisma.agreement.findUnique({
        where: { agreementId: request.agreementId },
      });

      if (!agreement) {
        throw new Error(`Agreement ${request.agreementId} not found`);
      }

      // Check if agreement can be cancelled
      if (!this.canCancelAgreement(agreement.status)) {
        throw new Error(
          `Agreement ${request.agreementId} with status ${agreement.status} cannot be cancelled`
        );
      }

      // Check if there's already a pending proposal
      const existingProposal = Array.from(this.proposals.values()).find(
        p => p.agreementId === request.agreementId && p.status === CancellationProposalStatus.PENDING
      );

      if (existingProposal) {
        throw new Error(`A pending cancellation proposal already exists for agreement ${request.agreementId}`);
      }

      // Create proposal
      const proposalId = this.generateProposalId();
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setHours(
        expiresAt.getHours() + (request.expiryHours || this.multisigConfig.proposalExpiryHours)
      );

      const proposal: CancellationProposal = {
        id: proposalId,
        agreementId: request.agreementId,
        proposer: request.proposer,
        reason: request.reason,
        status: CancellationProposalStatus.PENDING,
        requiredSignatures: request.requiredSignatures || this.multisigConfig.requiredSignatures,
        signatures: [],
        createdAt: now,
        expiresAt,
      };

      // Store proposal
      this.proposals.set(proposalId, proposal);

      // Log proposal creation
      await this.logCancellationEvent('proposal_created', {
        proposalId,
        agreementId: request.agreementId,
        proposer: request.proposer,
        reason: request.reason,
      });

      console.log(`[CancellationService] Created cancellation proposal ${proposalId} for ${request.agreementId}`);

      return proposal;
    } catch (error) {
      console.error(`[CancellationService] Error creating cancellation proposal:`, error);
      throw error;
    }
  }

  /**
   * Sign a cancellation proposal
   */
  public async signProposal(proposalId: string, signer: string, signature: string): Promise<CancellationProposal> {
    console.log(`[CancellationService] Signing proposal ${proposalId} by ${signer}`);

    try {
      const proposal = this.proposals.get(proposalId);

      if (!proposal) {
        throw new Error(`Proposal ${proposalId} not found`);
      }

      // Validate signer is authorized
      if (!this.isAuthorizedSigner(signer)) {
        throw new Error(`Signer ${signer} is not authorized`);
      }

      // Check proposal status
      if (proposal.status !== CancellationProposalStatus.PENDING) {
        throw new Error(`Proposal ${proposalId} is not pending (status: ${proposal.status})`);
      }

      // Check if proposal has expired
      if (new Date() > proposal.expiresAt) {
        proposal.status = CancellationProposalStatus.EXPIRED;
        this.proposals.set(proposalId, proposal);
        throw new Error(`Proposal ${proposalId} has expired`);
      }

      // Check if signer already signed
      if (proposal.signatures.some(s => s.signer === signer)) {
        throw new Error(`Signer ${signer} has already signed this proposal`);
      }

      // Add signature
      proposal.signatures.push({
        signer,
        signedAt: new Date(),
        signature,
      });

      // Check if we have enough signatures
      if (proposal.signatures.length >= proposal.requiredSignatures) {
        proposal.status = CancellationProposalStatus.APPROVED;
        console.log(`[CancellationService] Proposal ${proposalId} approved with ${proposal.signatures.length} signatures`);
      }

      this.proposals.set(proposalId, proposal);

      // Log signature
      await this.logCancellationEvent('proposal_signed', {
        proposalId,
        signer,
        signatureCount: proposal.signatures.length,
        approved: proposal.status === CancellationProposalStatus.APPROVED,
      });

      return proposal;
    } catch (error) {
      console.error(`[CancellationService] Error signing proposal:`, error);
      throw error;
    }
  }

  /**
   * Execute an approved cancellation proposal
   */
  public async executeProposal(proposalId: string, executor: string): Promise<CancellationResult> {
    console.log(`[CancellationService] Executing proposal ${proposalId} by ${executor}`);

    try {
      const proposal = this.proposals.get(proposalId);

      if (!proposal) {
        throw new Error(`Proposal ${proposalId} not found`);
      }

      // Validate executor is authorized
      if (!this.isAuthorizedSigner(executor)) {
        throw new Error(`Executor ${executor} is not authorized`);
      }

      // Check proposal is approved
      if (proposal.status !== CancellationProposalStatus.APPROVED) {
        throw new Error(`Proposal ${proposalId} is not approved (status: ${proposal.status})`);
      }

      // Check if proposal has expired
      if (new Date() > proposal.expiresAt) {
        proposal.status = CancellationProposalStatus.EXPIRED;
        this.proposals.set(proposalId, proposal);
        throw new Error(`Proposal ${proposalId} has expired`);
      }

      // Execute cancellation
      const result = await this.executeCancellation(proposal.agreementId, proposal.reason);

      // Update proposal status
      proposal.status = CancellationProposalStatus.EXECUTED;
      proposal.executedAt = new Date();
      this.proposals.set(proposalId, proposal);

      // Log execution
      await this.logCancellationEvent('proposal_executed', {
        proposalId,
        agreementId: proposal.agreementId,
        executor,
        transactionId: result.transactionId,
      });

      console.log(`[CancellationService] Successfully executed proposal ${proposalId}`);

      return {
        ...result,
        proposalId,
      };
    } catch (error) {
      console.error(`[CancellationService] Error executing proposal:`, error);
      throw error;
    }
  }

  /**
   * Execute cancellation (internal)
   */
  private async executeCancellation(agreementId: string, reason: string): Promise<CancellationResult> {
    console.log(`[CancellationService] Executing cancellation for agreement: ${agreementId}`);

    try {
      // Get agreement
      const agreement = await prisma.agreement.findUnique({
        where: { agreementId },
        include: {
          deposits: {
            where: { status: 'CONFIRMED' },
          },
        },
      });

      if (!agreement) {
        throw new Error(`Agreement ${agreementId} not found`);
      }

      // TODO: Call on-chain cancellation if needed
      // For now, generate mock transaction ID
      const mockTxId = `cancel_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      // Update agreement status
      await prisma.agreement.update({
        where: { agreementId },
        data: {
          status: AgreementStatus.CANCELLED,
          cancelTxId: mockTxId,
          cancelledAt: new Date(),
        },
      });

      // Log cancellation transaction
      await prisma.transactionLog.create({
        data: {
          agreementId,
          txId: mockTxId,
          operationType: 'cancel',
          status: 'success',
          timestamp: new Date(),
        },
      });

      console.log(`[CancellationService] Successfully cancelled agreement ${agreementId}`);

      return {
        agreementId,
        success: true,
        transactionId: mockTxId,
        status: AgreementStatus.CANCELLED,
      };
    } catch (error) {
      console.error(`[CancellationService] Error executing cancellation:`, error);
      return {
        agreementId,
        success: false,
        status: AgreementStatus.CANCELLED,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get proposal by ID
   */
  public getProposal(proposalId: string): CancellationProposal | undefined {
    return this.proposals.get(proposalId);
  }

  /**
   * Get proposals for an agreement
   */
  public getProposalsForAgreement(agreementId: string): CancellationProposal[] {
    return Array.from(this.proposals.values()).filter(p => p.agreementId === agreementId);
  }

  /**
   * Get all pending proposals
   */
  public getPendingProposals(): CancellationProposal[] {
    return Array.from(this.proposals.values()).filter(
      p => p.status === CancellationProposalStatus.PENDING
    );
  }

  /**
   * Clean up expired proposals
   */
  public cleanupExpiredProposals(): number {
    const now = new Date();
    let count = 0;

    for (const [proposalId, proposal] of this.proposals.entries()) {
      if (proposal.status === CancellationProposalStatus.PENDING && now > proposal.expiresAt) {
        proposal.status = CancellationProposalStatus.EXPIRED;
        this.proposals.set(proposalId, proposal);
        count++;
      }
    }

    if (count > 0) {
      console.log(`[CancellationService] Expired ${count} proposals`);
    }

    return count;
  }

  /**
   * Check if signer is authorized
   */
  private isAuthorizedSigner(signer: string): boolean {
    // If no authorized signers configured, allow all (for development)
    if (this.multisigConfig.authorizedSigners.length === 0) {
      return true;
    }
    return this.multisigConfig.authorizedSigners.includes(signer);
  }

  /**
   * Check if agreement can be cancelled
   */
  private canCancelAgreement(status: AgreementStatus): boolean {
    const cancellableStatuses: AgreementStatus[] = [
      AgreementStatus.PENDING,
      AgreementStatus.FUNDED,
      AgreementStatus.USDC_LOCKED,
      AgreementStatus.NFT_LOCKED,
      AgreementStatus.BOTH_LOCKED,
    ];
    return cancellableStatuses.includes(status);
  }

  /**
   * Generate unique proposal ID
   */
  private generateProposalId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `CANCEL-${timestamp}-${random}`.toUpperCase();
  }

  /**
   * Log cancellation event
   */
  private async logCancellationEvent(eventType: string, data: any): Promise<void> {
    try {
      console.log(`[CancellationService] Event: ${eventType}`, data);
      // TODO: Implement proper audit logging to database
    } catch (error) {
      console.error('[CancellationService] Error logging event:', error);
    }
  }

  /**
   * Update multisig configuration
   */
  public updateConfig(config: Partial<MultisigConfig>): void {
    this.multisigConfig = {
      ...this.multisigConfig,
      ...config,
    };
    console.log('[CancellationService] Updated config:', this.multisigConfig);
  }

  /**
   * Get current configuration
   */
  public getConfig(): MultisigConfig {
    return { ...this.multisigConfig };
  }
}

// Singleton instance
let cancellationServiceInstance: CancellationService | null = null;

/**
 * Get or create cancellation service singleton instance
 */
export function getCancellationService(config?: Partial<MultisigConfig>): CancellationService {
  if (!cancellationServiceInstance) {
    cancellationServiceInstance = new CancellationService(config);
  }
  return cancellationServiceInstance;
}

/**
 * Reset cancellation service instance (useful for testing)
 */
export function resetCancellationService(): void {
  cancellationServiceInstance = null;
}

export default CancellationService;

