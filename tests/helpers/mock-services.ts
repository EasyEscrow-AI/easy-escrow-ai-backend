import sinon, { SinonStub } from 'sinon';
import * as solanaService from '../../src/services/solana.service';
import * as agreementService from '../../src/services/agreement.service';

export interface MockedSolanaService {
  initializeEscrow: SinonStub;
  restore: () => void;
}

export interface MockedAgreementService {
  createAgreement: SinonStub;
  getAgreementById: SinonStub;
  updateAgreementStatus: SinonStub;
  restore: () => void;
}

/**
 * Mock Solana service functions
 */
export const mockSolanaService = (): MockedSolanaService => {
  const initializeEscrow = sinon.stub(solanaService, 'initializeEscrow');

  return {
    initializeEscrow,
    restore: () => {
      initializeEscrow.restore();
    },
  };
};

/**
 * Mock Agreement service functions
 */
export const mockAgreementService = (): MockedAgreementService => {
  const createAgreement = sinon.stub(agreementService, 'createAgreement');
  const getAgreementById = sinon.stub(agreementService, 'getAgreementById');
  const updateAgreementStatus = sinon.stub(agreementService, 'updateAgreementStatus');

  return {
    createAgreement,
    getAgreementById,
    updateAgreementStatus,
    restore: () => {
      createAgreement.restore();
      getAgreementById.restore();
      updateAgreementStatus.restore();
    },
  };
};

/**
 * Create mock Solana initialization result
 */
export const createMockEscrowResult = (overrides?: Partial<{
  escrowPda: string;
  depositAddresses: { usdc: string; nft: string };
  transactionId: string;
}>) => {
  return {
    escrowPda: overrides?.escrowPda || 'MOCK_ESCROW_PDA_ADDRESS',
    depositAddresses: overrides?.depositAddresses || {
      usdc: 'MOCK_USDC_DEPOSIT_ADDRESS',
      nft: 'MOCK_NFT_DEPOSIT_ADDRESS',
    },
    transactionId: overrides?.transactionId || 'MOCK_TRANSACTION_ID',
  };
};

