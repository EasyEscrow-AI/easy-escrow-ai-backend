import { expect } from 'chai';
import sinon from 'sinon';
import { AgreementCacheService } from '../../src/services/agreement-cache.service';
import { CacheService } from '../../src/services/cache.service';
import { Agreement } from '../../src/generated/prisma';
import { mockPrismaForTest, teardownPrismaMock } from '../helpers/prisma-mock';

describe('AgreementCacheService', () => {
  let agreementCacheService: AgreementCacheService;
  let cacheStub: sinon.SinonStubbedInstance<CacheService>;
  let prismaStub: any;

  const mockAgreement: Partial<Agreement> = {
    id: 'agreement-123',
    escrowPda: 'EscrowPda123',
    buyer: 'BuyerWallet123',
    seller: 'SellerWallet123',
    price: '1000000' as any,
    status: 'PENDING',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    // Setup Prisma mock
    prismaStub = {
      agreement: {
        findUnique: sinon.stub(),
        findMany: sinon.stub(),
        update: sinon.stub(),
      },
    };
    mockPrismaForTest(prismaStub);
    
    agreementCacheService = new AgreementCacheService();
  });

  afterEach(() => {
    sinon.restore();
    teardownPrismaMock();
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
      prismaStub.agreement.findUnique.resolves(mockAgreement as Agreement);
      
      const result = await agreementCacheService.getAgreementById('agreement-123');
      
      expect(result).to.deep.equal(mockAgreement);
      expect(cacheGetStub.calledOnce).to.be.true;
      expect(prismaStub.agreement.findUnique.calledOnce).to.be.true;
      expect(cacheSetStub.calledTwice).to.be.true; // Called twice (by ID and by address)
    });

    it('should return null if agreement not found', async () => {
      sinon.stub(CacheService.prototype, 'get').resolves(null);
      prismaStub.agreement.findUnique.resolves(null);
      
      const result = await agreementCacheService.getAgreementById('non-existent');
      
      expect(result).to.be.null;
    });

    it('should fallback to database on cache error', async () => {
      sinon.stub(CacheService.prototype, 'get').rejects(new Error('Cache error'));
      prismaStub.agreement.findUnique.resolves(mockAgreement as Agreement);
      
      const result = await agreementCacheService.getAgreementById('agreement-123');
      
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
      
      prismaStub.agreement.update.resolves(updatedAgreement as Agreement);
      const cacheDeleteStub = sinon.stub(CacheService.prototype, 'delete').resolves(true);
      const cacheSetStub = sinon.stub(CacheService.prototype, 'set').resolves(true);
      
      const result = await agreementCacheService.updateAgreement('agreement-123', { status: 'DEPOSITED' as any });
      
      expect(result).to.deep.equal(updatedAgreement);
      expect(prismaStub.agreement.update.calledOnce).to.be.true;
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
      prismaStub.agreement.findMany.resolves(agreements);
      
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
      prismaStub.agreement.findMany.resolves(agreements);
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

