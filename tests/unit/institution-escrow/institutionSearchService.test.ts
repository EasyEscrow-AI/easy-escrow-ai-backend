/**
 * Unit Tests for InstitutionSearchService
 *
 * Tests sitewide search across escrows, clients, accounts, and notifications.
 */

import { expect } from 'chai';
import sinon from 'sinon';

import { setMockPrismaClient, clearMockPrismaClient } from '../../../src/config/database';

describe('InstitutionSearchService', () => {
  let sandbox: sinon.SinonSandbox;
  let prismaStub: any;
  let searchService: any;

  const CLIENT_ID = 'client-123';

  const makeEscrow = (overrides: Record<string, unknown> = {}) => ({
    escrowCode: 'EE-AB3D-7KMN',
    escrowId: 'escrow-uuid-1',
    clientId: CLIENT_ID,
    status: 'FUNDED',
    amount: 5000,
    corridor: 'SG-CH',
    payerWallet: '7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u',
    recipientWallet: '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R',
    createdAt: new Date(),
    ...overrides,
  });

  const makeClient = (overrides: Record<string, unknown> = {}) => ({
    id: 'client-456',
    companyName: 'Acme Corp',
    legalName: 'Acme Corporation Ltd',
    industry: 'Fintech',
    country: 'SG',
    tier: 'PREMIUM',
    status: 'ACTIVE',
    ...overrides,
  });

  const makeAccount = (overrides: Record<string, unknown> = {}) => ({
    id: 'account-1',
    name: 'Treasury Main',
    label: 'Primary Treasury',
    accountType: 'TREASURY',
    walletAddress: '7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u',
    verificationStatus: 'VERIFIED',
    isActive: true,
    ...overrides,
  });

  const makeNotification = (overrides: Record<string, unknown> = {}) => ({
    id: 'notif-1',
    clientId: CLIENT_ID,
    title: 'Escrow Created',
    message: 'New escrow EE-AB3D-7KMN created for 5000 USDC',
    type: 'ESCROW_CREATED',
    priority: 'MEDIUM',
    isRead: false,
    escrowId: 'escrow-uuid-1',
    createdAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    prismaStub = {
      institutionEscrow: {
        findMany: sandbox.stub().resolves([makeEscrow()]),
      },
      institutionClient: {
        findMany: sandbox.stub().resolves([makeClient()]),
      },
      institutionAccount: {
        findMany: sandbox.stub().resolves([makeAccount()]),
      },
      institutionNotification: {
        findMany: sandbox.stub().resolves([makeNotification()]),
      },
    };

    setMockPrismaClient(prismaStub as any);

    delete require.cache[require.resolve('../../../src/services/institution-search.service')];
    const searchModule = require('../../../src/services/institution-search.service');
    searchService = searchModule.getInstitutionSearchService();
  });

  afterEach(() => {
    sandbox.restore();
    clearMockPrismaClient();
  });

  describe('search()', () => {
    it('should search all categories and return combined results', async () => {
      const result = await searchService.search({
        clientId: CLIENT_ID,
        query: 'acme',
      });

      expect(result.query).to.equal('acme');
      expect(result.results).to.have.lengthOf(4);
      expect(result.counts.total).to.equal(4);
      expect(result.counts.escrows).to.equal(1);
      expect(result.counts.clients).to.equal(1);
      expect(result.counts.accounts).to.equal(1);
      expect(result.counts.notifications).to.equal(1);
    });

    it('should filter by categories when specified', async () => {
      const result = await searchService.search({
        clientId: CLIENT_ID,
        query: 'test',
        categories: ['escrow', 'client'],
      });

      expect(result.counts.escrows).to.equal(1);
      expect(result.counts.clients).to.equal(1);
      expect(result.counts.accounts).to.equal(0);
      expect(result.counts.notifications).to.equal(0);

      expect(prismaStub.institutionAccount.findMany.called).to.be.false;
      expect(prismaStub.institutionNotification.findMany.called).to.be.false;
    });

    it('should format escrow results correctly', async () => {
      const result = await searchService.search({
        clientId: CLIENT_ID,
        query: 'EE-AB3D',
        categories: ['escrow'],
      });

      const escrow = result.results[0];
      expect(escrow.category).to.equal('escrow');
      expect(escrow.id).to.equal('EE-AB3D-7KMN');
      expect(escrow.title).to.include('5000 USDC');
      expect(escrow.status).to.equal('FUNDED');
      expect(escrow.metadata).to.have.property('amount', 5000);
      expect(escrow.metadata).to.have.property('corridor', 'SG-CH');
    });

    it('should format client results correctly', async () => {
      const result = await searchService.search({
        clientId: CLIENT_ID,
        query: 'acme',
        categories: ['client'],
      });

      const client = result.results[0];
      expect(client.category).to.equal('client');
      expect(client.title).to.equal('Acme Corp');
      expect(client.subtitle).to.include('Fintech');
      expect(client.status).to.equal('ACTIVE');
    });

    it('should format account results correctly', async () => {
      const result = await searchService.search({
        clientId: CLIENT_ID,
        query: 'treasury',
        categories: ['account'],
      });

      const account = result.results[0];
      expect(account.category).to.equal('account');
      expect(account.title).to.equal('Primary Treasury');
      expect(account.subtitle).to.include('TREASURY');
      expect(account.status).to.equal('VERIFIED');
    });

    it('should format notification results correctly', async () => {
      const result = await searchService.search({
        clientId: CLIENT_ID,
        query: 'escrow',
        categories: ['notification'],
      });

      const notif = result.results[0];
      expect(notif.category).to.equal('notification');
      expect(notif.title).to.equal('Escrow Created');
      expect(notif.status).to.equal('UNREAD');
      expect(notif.metadata).to.have.property('type', 'ESCROW_CREATED');
    });

    it('should mark read notifications as READ status', async () => {
      prismaStub.institutionNotification.findMany.resolves([
        makeNotification({ isRead: true }),
      ]);

      const result = await searchService.search({
        clientId: CLIENT_ID,
        query: 'test',
        categories: ['notification'],
      });

      expect(result.results[0].status).to.equal('READ');
    });

    it('should handle empty results gracefully', async () => {
      prismaStub.institutionEscrow.findMany.resolves([]);
      prismaStub.institutionClient.findMany.resolves([]);
      prismaStub.institutionAccount.findMany.resolves([]);
      prismaStub.institutionNotification.findMany.resolves([]);

      const result = await searchService.search({
        clientId: CLIENT_ID,
        query: 'nonexistent',
      });

      expect(result.results).to.have.lengthOf(0);
      expect(result.counts.total).to.equal(0);
    });

    it('should search by escrow code pattern', async () => {
      await searchService.search({
        clientId: CLIENT_ID,
        query: 'EE-AB3D',
        categories: ['escrow'],
      });

      const call = prismaStub.institutionEscrow.findMany.firstCall.args[0];
      expect(call.where.clientId).to.equal(CLIENT_ID);
      expect(call.where.OR).to.have.lengthOf(1);
      expect(call.where.OR[0]).to.have.property('escrowCode');
    });

    it('should search by wallet address', async () => {
      const wallet = '7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u';
      await searchService.search({
        clientId: CLIENT_ID,
        query: wallet,
        categories: ['escrow'],
      });

      const call = prismaStub.institutionEscrow.findMany.firstCall.args[0];
      expect(call.where.OR.some((c: any) => c.payerWallet?.equals === wallet)).to.be.true;
      expect(call.where.OR.some((c: any) => c.recipientWallet?.equals === wallet)).to.be.true;
    });

    it('should respect the limit parameter', async () => {
      await searchService.search({
        clientId: CLIENT_ID,
        query: 'test',
        limit: 5,
      });

      const escrowCall = prismaStub.institutionEscrow.findMany.firstCall.args[0];
      expect(escrowCall.take).to.equal(5);
    });

    it('should cap limit at 10', async () => {
      await searchService.search({
        clientId: CLIENT_ID,
        query: 'test',
        limit: 50,
      });

      const escrowCall = prismaStub.institutionEscrow.findMany.firstCall.args[0];
      expect(escrowCall.take).to.equal(10);
    });

    it('should search by status name', async () => {
      await searchService.search({
        clientId: CLIENT_ID,
        query: 'funded',
        categories: ['escrow'],
      });

      const call = prismaStub.institutionEscrow.findMany.firstCall.args[0];
      expect(call.where.OR.some((c: any) => c.status === 'FUNDED')).to.be.true;
    });

    it('should truncate long notification messages in subtitle', async () => {
      const longMessage = 'A'.repeat(100);
      prismaStub.institutionNotification.findMany.resolves([
        makeNotification({ message: longMessage }),
      ]);

      const result = await searchService.search({
        clientId: CLIENT_ID,
        query: 'test',
        categories: ['notification'],
      });

      expect(result.results[0].subtitle.length).to.be.lessThan(longMessage.length);
      expect(result.results[0].subtitle).to.include('…');
    });
  });
});
