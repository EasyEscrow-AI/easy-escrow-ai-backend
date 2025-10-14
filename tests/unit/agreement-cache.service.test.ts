import { expect } from 'chai';
import sinon from 'sinon';
import { AgreementCacheService } from '../../src/services/agreement-cache.service';
import { CacheService } from '../../src/services/cache.service';
import { prisma } from '../../src/config/database';
import { Agreement } from '../../src/generated/prisma';

describe('AgreementCacheService', () => {
  let agreementCacheService: AgreementCacheService;
  let cacheStub: sinon.SinonStubbedInstance<CacheService>;
  let prismaStub: sinon.SinonStub;

  const mockAgreement: Partial<Agreement> = {
    id: 'agreement-123',
    escrowAddress: 'EscrowAddress123',
    buyerWallet: 'BuyerWallet123',
    sellerWallet: 'SellerWallet123',
    amount: '1000000',
    status: 'PENDING_DEPOSIT',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    agreementCacheService = new AgreementCacheService();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('getAgreementById', () => {
    it('should return agreement from cache if available', async () => {
      const cacheGetStub = sinon.stub(CacheService.prototype, 'get').resolves(mockAgreement as Agreement);
      
      const result = await agreementCacheService.getAgreementById('agreement-123');
      
      expect(result).to.deep.equal(mockAgreement);
      expect(cacheGetStub.calledOnce).to.be.true;
    });

    it('should fetch from database and cache if not in cache', async () => {
      const cacheGetStub = sinon.stub(CacheService.prototype, 'get').resolves(null);
      const cacheSetStub = sinon.stub(CacheService.prototype, 'set').resolves(true);
      const prismaStu = sinon.stub(prisma.agreement, 'findUnique').resolves(mockAgreement as Agreement);
      
      const result = await agreementCacheService.getAgreementById('agreement-123');
      
      expect(result).to.deep.equal(mockAgreement);
      expect(cacheGetStub.calledOnce).to.be.true;
      expect(prismaStu.calledOnce).to.be.true;
      expect(cacheSetStub.calledTwice).to.be.true; // Called twice (by ID and by address)
    });

    it('should return null if agreement not found', async () => {
      sinon.stub(CacheService.prototype, 'get').resolves(null);
      sinon.stub(prisma.agreement, 'findUnique').resolves(null);
      
      const result = await agreementCacheService.getAgreementById('non-existent');
      
      expect(result).to.be.null;
    });

    it('should fallback to database on cache error', async () => {
      sinon.stub(CacheService.prototype, 'get').rejects(new Error('Cache error'));
      sinon.stub(prisma.agreement, 'findUnique').resolves(mockAgreement as Agreement);
      
      const result = await agreementCacheService.getAgreementById('agreement-123');
      
      expect(result).to.deep.equal(mockAgreement);
    });
  });

  describe('getAgreementByAddress', () => {
    it('should return agreement from cache if available', async () => {
      sinon.stub(CacheService.prototype, 'get').resolves(mockAgreement as Agreement);
      
      const result = await agreementCacheService.getAgreementByAddress('EscrowAddress123');
      
      expect(result).to.deep.equal(mockAgreement);
    });

    it('should fetch from database and cache if not in cache', async () => {
      sinon.stub(CacheService.prototype, 'get').resolves(null);
      sinon.stub(CacheService.prototype, 'set').resolves(true);
      sinon.stub(prisma.agreement, 'findUnique').resolves(mockAgreement as Agreement);
      
      const result = await agreementCacheService.getAgreementByAddress('EscrowAddress123');
      
      expect(result).to.deep.equal(mockAgreement);
    });
  });

  describe('cacheAgreement', () => {
    it('should cache agreement by both ID and address', async () => {
      const cacheSetStub = sinon.stub(CacheService.prototype, 'set').resolves(true);
      
      await agreementCacheService.cacheAgreement(mockAgreement as Agreement);
      
      expect(cacheSetStub.calledTwice).to.be.true;
    });
  });

  describe('invalidateAgreement', () => {
    it('should invalidate cache for agreement', async () => {
      const cacheDeleteStub = sinon.stub(CacheService.prototype, 'delete').resolves(true);
      
      await agreementCacheService.invalidateAgreement(mockAgreement as Agreement);
      
      expect(cacheDeleteStub.calledTwice).to.be.true;
    });
  });

  describe('updateAgreement', () => {
    it('should update agreement in database and cache', async () => {
      const updatedAgreement = { ...mockAgreement, status: 'DEPOSITED' as any };
      
      const prismaUpdateStub = sinon.stub(prisma.agreement, 'update').resolves(updatedAgreement as Agreement);
      const cacheDeleteStub = sinon.stub(CacheService.prototype, 'delete').resolves(true);
      const cacheSetStub = sinon.stub(CacheService.prototype, 'set').resolves(true);
      
      const result = await agreementCacheService.updateAgreement('agreement-123', { status: 'DEPOSITED' as any });
      
      expect(result).to.deep.equal(updatedAgreement);
      expect(prismaUpdateStub.calledOnce).to.be.true;
      expect(cacheDeleteStub.calledTwice).to.be.true; // Invalidate old cache
      expect(cacheSetStub.calledTwice).to.be.true; // Cache new data
    });
  });

  describe('getUserAgreements', () => {
    it('should return agreements from cache if available', async () => {
      const agreements = [mockAgreement] as Agreement[];
      sinon.stub(CacheService.prototype, 'get').resolves(agreements);
      
      const result = await agreementCacheService.getUserAgreements('BuyerWallet123');
      
      expect(result).to.deep.equal(agreements);
    });

    it('should fetch from database and cache if not in cache', async () => {
      const agreements = [mockAgreement] as Agreement[];
      sinon.stub(CacheService.prototype, 'get').resolves(null);
      sinon.stub(CacheService.prototype, 'set').resolves(true);
      sinon.stub(prisma.agreement, 'findMany').resolves(agreements);
      
      const result = await agreementCacheService.getUserAgreements('BuyerWallet123');
      
      expect(result).to.deep.equal(agreements);
    });
  });

  describe('invalidateUserCache', () => {
    it('should invalidate user agreements cache', async () => {
      const cacheDeleteStub = sinon.stub(CacheService.prototype, 'delete').resolves(true);
      
      await agreementCacheService.invalidateUserCache('BuyerWallet123');
      
      expect(cacheDeleteStub.calledOnce).to.be.true;
    });
  });

  describe('warmupCache', () => {
    it('should warm up cache with specified agreements', async () => {
      const agreements = [mockAgreement] as Agreement[];
      sinon.stub(prisma.agreement, 'findMany').resolves(agreements);
      const cacheSetStub = sinon.stub(CacheService.prototype, 'set').resolves(true);
      
      await agreementCacheService.warmupCache(['agreement-123']);
      
      expect(cacheSetStub.calledTwice).to.be.true; // Once for ID, once for address
    });
  });

  describe('clearAllCache', () => {
    it('should clear all agreement caches', async () => {
      const cacheClearStub = sinon.stub(CacheService.prototype, 'clear').resolves(5);
      
      await agreementCacheService.clearAllCache();
      
      expect(cacheClearStub.calledOnce).to.be.true;
    });
  });
});

