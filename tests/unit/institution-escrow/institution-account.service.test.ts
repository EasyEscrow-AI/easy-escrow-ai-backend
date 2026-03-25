/**
 * Unit Tests for InstitutionAccountService
 *
 * Tests listAccounts behavior:
 * - branchId filter
 * - includeBalances opt-in
 * - branchId present in response
 */

import { expect } from 'chai';
import sinon from 'sinon';

const savedEnv = {
  NODE_ENV: process.env.NODE_ENV,
  JWT_SECRET: process.env.JWT_SECRET,
  USDC_MINT_ADDRESS: process.env.USDC_MINT_ADDRESS,
};

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

import { InstitutionAccountService } from '../../../src/services/institution-account.service';

after(() => {
  process.env.NODE_ENV = savedEnv.NODE_ENV;
  process.env.JWT_SECRET = savedEnv.JWT_SECRET;
  process.env.USDC_MINT_ADDRESS = savedEnv.USDC_MINT_ADDRESS;
});

describe('InstitutionAccountService', () => {
  let sandbox: sinon.SinonSandbox;
  let service: InstitutionAccountService;
  let prismaStub: any;

  const CLIENT_ID = 'client-123';
  const BRANCH_ID = 'branch-456';

  const makeAccount = (overrides: Record<string, unknown> = {}) => ({
    id: 'acct-1',
    clientId: CLIENT_ID,
    name: 'SG Operations',
    label: 'SG Operations',
    accountType: 'OPERATIONS',
    description: 'Singapore operations',
    walletAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    chain: 'solana',
    walletProvider: 'Fireblocks',
    custodyType: 'MPC',
    verificationStatus: 'VERIFIED',
    verifiedAt: new Date(),
    maxTransactionAmount: 500000,
    minTransactionAmount: null,
    dailyVolumeLimit: 2000000,
    monthlyVolumeLimit: null,
    dailyTransactionCountLimit: null,
    monthlyTransactionCountLimit: null,
    approvalMode: 'SINGLE_APPROVAL',
    approvalThreshold: null,
    whitelistedAddresses: [],
    whitelistEnforced: false,
    notificationEmail: null,
    webhookUrl: null,
    notifyOnEscrowCreated: true,
    notifyOnEscrowFunded: true,
    notifyOnEscrowReleased: true,
    notifyOnComplianceAlert: true,
    defaultCurrency: 'USDC',
    isDefault: false,
    isActive: true,
    branchId: BRANCH_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    prismaStub = {
      institutionAccount: {
        findMany: sandbox.stub().resolves([makeAccount()]),
        findFirst: sandbox.stub().resolves(makeAccount()),
        findUnique: sandbox.stub().resolves(makeAccount()),
        count: sandbox.stub().resolves(1),
        create: sandbox.stub().resolves(makeAccount()),
        update: sandbox.stub().resolves(makeAccount()),
        updateMany: sandbox.stub().resolves({ count: 1 }),
      },
    };

    service = new InstitutionAccountService();
    (service as any).prisma = prismaStub;
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('listAccounts', () => {
    it('should include branchId in response', async () => {
      const accounts = await service.listAccounts(CLIENT_ID);

      expect(accounts).to.have.length(1);
      expect(accounts[0]).to.have.property('branchId', BRANCH_ID);
    });

    it('should filter by branchId when provided', async () => {
      await service.listAccounts(CLIENT_ID, { branchId: BRANCH_ID });

      const whereArg = prismaStub.institutionAccount.findMany.firstCall.args[0].where;
      expect(whereArg).to.have.property('branchId', BRANCH_ID);
    });

    it('should NOT fetch balances by default', async () => {
      const balanceSpy = sandbox.spy(service, 'getAccountBalance');

      await service.listAccounts(CLIENT_ID);

      expect(balanceSpy.called).to.be.false;
    });

    it('should NOT include balance object when includeBalances is false', async () => {
      const accounts = await service.listAccounts(CLIENT_ID);

      expect(accounts[0]).to.not.have.property('balance');
    });

    it('should fetch balances when includeBalances is true', async () => {
      const mockBalance = {
        sol: 1.5,
        usdc: 10000,
        tokens: [],
        lastUpdated: new Date().toISOString(),
      };
      sandbox.stub(service, 'getAccountBalance').resolves(mockBalance);

      const accounts = await service.listAccounts(CLIENT_ID, { includeBalances: true });

      expect(accounts[0]).to.have.property('balance');
      expect((accounts[0] as any).balance).to.deep.equal(mockBalance);
    });

    it('should return zero balance on fetch failure when includeBalances is true', async () => {
      sandbox.stub(service, 'getAccountBalance').rejects(new Error('RPC error'));

      const accounts = await service.listAccounts(CLIENT_ID, { includeBalances: true });

      expect(accounts[0]).to.have.property('balance');
      expect((accounts[0] as any).balance.sol).to.equal(0);
      expect((accounts[0] as any).balance.usdc).to.equal(0);
    });

    it('should filter by accountType', async () => {
      await service.listAccounts(CLIENT_ID, { accountType: 'TREASURY' as any });

      const whereArg = prismaStub.institutionAccount.findMany.firstCall.args[0].where;
      expect(whereArg).to.have.property('accountType', 'TREASURY');
    });

    it('should not include branchId in where when not provided', async () => {
      await service.listAccounts(CLIENT_ID);

      const whereArg = prismaStub.institutionAccount.findMany.firstCall.args[0].where;
      expect(whereArg).to.not.have.property('branchId');
    });
  });
});
