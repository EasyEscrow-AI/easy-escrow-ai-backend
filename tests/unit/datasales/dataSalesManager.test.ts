/**
 * Unit Tests for DataSalesManager Service
 * Tests agreement lifecycle, state machine transitions, and business logic
 */

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { DataSalesManager, CreateAgreementInput } from '../../../src/services/dataSalesManager';
import { DataSalesStatus } from '../../../src/generated/prisma';

// Mock Prisma client
const createMockPrisma = () => {
  const agreements: Map<string, any> = new Map();

  return {
    dataSalesAgreement: {
      create: async ({ data }: any) => {
        const agreement = {
          id: 'db-id-' + data.agreementId,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
          files: null,
          totalSizeBytes: null,
          sellerDepositedAt: null,
          sellerDepositTxId: null,
          buyerDepositedAt: null,
          buyerDepositTxId: null,
          verifiedAt: null,
          verifiedBy: null,
          rejectionReason: null,
          rejectionCount: 0,
          settleTxSignature: null,
          settledAt: null,
          cancelledAt: null,
          archivedAt: null,
          accessExpiresAt: null,
          escrowBump: null,
        };
        agreements.set(data.agreementId, agreement);
        return agreement;
      },
      findUnique: async ({ where }: any) => {
        return agreements.get(where.agreementId) || null;
      },
      update: async ({ where, data }: any) => {
        const existing = agreements.get(where.agreementId);
        if (!existing) throw new Error('Agreement not found');
        const updated = { ...existing, ...data, updatedAt: new Date() };
        // Handle increment
        if (data.rejectionCount?.increment) {
          updated.rejectionCount = existing.rejectionCount + data.rejectionCount.increment;
        }
        agreements.set(where.agreementId, updated);
        return updated;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const [id, agreement] of agreements.entries()) {
          let matches = true;
          if (where.status?.in && !where.status.in.includes(agreement.status)) {
            matches = false;
          }
          if (where.sellerWallet && agreement.sellerWallet !== where.sellerWallet) {
            matches = false;
          }
          if (matches) {
            agreements.set(id, { ...agreement, ...data, updatedAt: new Date() });
            count++;
          }
        }
        return { count };
      },
      findMany: async ({ where, orderBy, take, skip }: any) => {
        const results: any[] = [];
        for (const agreement of agreements.values()) {
          let matches = true;
          if (where?.sellerWallet && agreement.sellerWallet !== where.sellerWallet) {
            matches = false;
          }
          if (where?.buyerWallet && agreement.buyerWallet !== where.buyerWallet) {
            matches = false;
          }
          if (where?.status?.in && !where.status.in.includes(agreement.status)) {
            matches = false;
          }
          if (where?.status && typeof where.status === 'string' && agreement.status !== where.status) {
            matches = false;
          }
          if (where?.depositWindowEndsAt?.lt && agreement.depositWindowEndsAt >= where.depositWindowEndsAt.lt) {
            matches = false;
          }
          if (where?.accessExpiresAt?.lt && agreement.accessExpiresAt >= where.accessExpiresAt.lt) {
            matches = false;
          }
          if (matches) {
            results.push(agreement);
          }
        }
        // Sort by createdAt desc
        results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return results.slice(skip || 0, (skip || 0) + (take || 20));
      },
    },
    _agreements: agreements, // Expose for testing
  };
};

// Mock S3 Service
const createMockS3Service = () => {
  const buckets: Map<string, Map<string, any>> = new Map();

  return {
    generateBucketName: (agreementId: string) => `datasales-${agreementId.substring(0, 32)}`,
    createBucket: async (bucketName: string) => {
      buckets.set(bucketName, new Map());
    },
    deleteBucket: async (bucketName: string) => {
      buckets.delete(bucketName);
    },
    generateUploadUrls: async (bucketName: string, files: any[]) => {
      return files.map((f) => ({
        url: `https://s3.amazonaws.com/${bucketName}/${f.key}?signed=true`,
        key: f.key,
        expiresAt: new Date(Date.now() + 3600000),
        method: 'PUT' as const,
      }));
    },
    generateDownloadUrls: async (bucketName: string, keys: string[], expiresIn?: number) => {
      return keys.map((key) => ({
        url: `https://s3.amazonaws.com/${bucketName}/${key}?signed=true`,
        key,
        expiresAt: new Date(Date.now() + (expiresIn || 86400) * 1000),
        method: 'GET' as const,
      }));
    },
    listObjects: async (bucketName: string) => {
      const bucket = buckets.get(bucketName);
      if (!bucket) return [];
      return Array.from(bucket.entries()).map(([key, obj]) => ({
        key,
        size: obj.size || 1000,
        lastModified: new Date(),
      }));
    },
    headObject: async (bucketName: string, key: string) => {
      return { key, size: 1000, contentType: 'application/octet-stream' };
    },
    _buckets: buckets, // Expose for testing
    _addFile: (bucketName: string, key: string, size: number) => {
      if (!buckets.has(bucketName)) buckets.set(bucketName, new Map());
      buckets.get(bucketName)!.set(key, { size });
    },
  };
};

// Mock Program Service
const createMockProgramService = () => {
  return {
    deriveEscrowPda: (agreementId: string) => ({
      pda: Keypair.generate().publicKey,
      bump: 255,
    }),
    deriveVaultPda: (agreementId: string) => ({
      pda: Keypair.generate().publicKey,
      bump: 254,
    }),
    buildDepositSolTransaction: async (input: any) => ({
      serializedTransaction: 'mock-serialized-tx',
      escrowPda: Keypair.generate().publicKey.toBase58(),
    }),
    buildSettleTransaction: async (input: any) => ({
      serializedTransaction: 'mock-settle-tx',
    }),
    buildCancelTransaction: async (input: any) => ({
      serializedTransaction: 'mock-cancel-tx',
    }),
    sendAndConfirmTransaction: async (serializedTx: string) => 'mock-tx-signature-123',
  };
};

describe('DataSalesManager', () => {
  let manager: DataSalesManager;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockS3Service: ReturnType<typeof createMockS3Service>;
  let mockProgramService: ReturnType<typeof createMockProgramService>;
  let connection: Connection;

  const sellerWallet = Keypair.generate().publicKey.toBase58();
  const buyerWallet = Keypair.generate().publicKey.toBase58();

  beforeEach(() => {
    connection = new Connection('https://api.devnet.solana.com');
    mockPrisma = createMockPrisma();
    mockS3Service = createMockS3Service();
    mockProgramService = createMockProgramService();

    manager = new DataSalesManager(
      mockPrisma as any,
      connection,
      mockS3Service as any,
      undefined,
      mockProgramService as any
    );
  });

  describe('createAgreement', () => {
    it('should create an agreement with valid inputs', async () => {
      const input: CreateAgreementInput = {
        sellerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
      };

      const result = await manager.createAgreement(input);

      expect(result.agreement).to.exist;
      expect(result.agreement.sellerWallet).to.equal(sellerWallet);
      expect(result.agreement.status).to.equal(DataSalesStatus.PENDING_DEPOSITS);
      expect(result.agreement.priceLamports).to.equal((1 * LAMPORTS_PER_SOL).toString());
      expect(result.payment.solVaultPda).to.be.a('string');
    });

    it('should create agreement with specific buyer', async () => {
      const input: CreateAgreementInput = {
        sellerWallet,
        buyerWallet,
        priceLamports: BigInt(2 * LAMPORTS_PER_SOL),
      };

      const result = await manager.createAgreement(input);

      expect(result.agreement.buyerWallet).to.equal(buyerWallet);
    });

    it('should calculate platform fee correctly', async () => {
      const priceLamports = BigInt(1 * LAMPORTS_PER_SOL);
      const input: CreateAgreementInput = {
        sellerWallet,
        priceLamports,
        platformFeeBps: 250, // 2.5%
      };

      const result = await manager.createAgreement(input);

      const expectedFee = (priceLamports * 250n) / 10000n;
      expect(result.agreement.platformFeeLamports).to.equal(expectedFee.toString());
      expect(result.payment.platformFeeLamports).to.equal(expectedFee.toString());
    });

    it('should generate upload URLs when files provided', async () => {
      const input: CreateAgreementInput = {
        sellerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
        files: [
          { key: 'file1.csv', contentType: 'text/csv' },
          { key: 'file2.json', contentType: 'application/json' },
        ],
      };

      const result = await manager.createAgreement(input);

      expect(result.uploadUrls).to.have.length(2);
      expect(result.uploadUrls[0].key).to.equal('file1.csv');
      expect(result.uploadUrls[0].method).to.equal('PUT');
    });

    it('should throw error when seller wallet missing', async () => {
      const input: CreateAgreementInput = {
        sellerWallet: '',
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
      };

      try {
        await manager.createAgreement(input);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('Seller wallet is required');
      }
    });

    it('should throw error when price is zero or negative', async () => {
      const input: CreateAgreementInput = {
        sellerWallet,
        priceLamports: 0n,
      };

      try {
        await manager.createAgreement(input);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('Price must be greater than 0');
      }
    });

    it('should set correct deposit window', async () => {
      const input: CreateAgreementInput = {
        sellerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
        depositWindowHours: 48,
      };

      const beforeCreate = Date.now();
      const result = await manager.createAgreement(input);
      const afterCreate = Date.now();

      const expectedMinEnd = new Date(beforeCreate + 48 * 60 * 60 * 1000);
      const expectedMaxEnd = new Date(afterCreate + 48 * 60 * 60 * 1000);

      expect(result.agreement.depositWindowEndsAt.getTime()).to.be.at.least(expectedMinEnd.getTime());
      expect(result.agreement.depositWindowEndsAt.getTime()).to.be.at.most(expectedMaxEnd.getTime());
    });
  });

  describe('getAgreement', () => {
    it('should return agreement by ID', async () => {
      const createResult = await manager.createAgreement({
        sellerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
      });

      const agreement = await manager.getAgreement(createResult.agreement.agreementId);

      expect(agreement).to.exist;
      expect(agreement?.agreementId).to.equal(createResult.agreement.agreementId);
    });

    it('should return null for non-existent agreement', async () => {
      const agreement = await manager.getAgreement('non-existent-id');

      expect(agreement).to.be.null;
    });
  });

  describe('getUploadUrls', () => {
    it('should return upload URLs for valid agreement', async () => {
      const createResult = await manager.createAgreement({
        sellerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
      });

      const files = [{ key: 'data.csv', contentType: 'text/csv' }];
      const urls = await manager.getUploadUrls(createResult.agreement.agreementId, files);

      expect(urls).to.have.length(1);
      expect(urls[0].key).to.equal('data.csv');
      expect(urls[0].method).to.equal('PUT');
    });

    it('should throw error for expired deposit window', async () => {
      const createResult = await manager.createAgreement({
        sellerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
        depositWindowHours: 0, // Immediately expired
      });

      // Wait a moment for window to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      try {
        await manager.getUploadUrls(createResult.agreement.agreementId, [{ key: 'file.csv' }]);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('Deposit window has closed');
      }
    });

    it('should throw error for non-existent agreement', async () => {
      try {
        await manager.getUploadUrls('non-existent', [{ key: 'file.csv' }]);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('Agreement not found');
      }
    });
  });

  describe('confirmUpload', () => {
    it('should update status to DATA_LOCKED when seller uploads first', async () => {
      const createResult = await manager.createAgreement({
        sellerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
      });

      // Mock file exists in S3
      mockS3Service._addFile(createResult.agreement.s3BucketName, 'file.csv', 1000);

      await manager.confirmUpload(createResult.agreement.agreementId, [
        { key: 'file.csv', name: 'file.csv', size: 1000, contentType: 'text/csv', sha256: 'abc123' },
      ]);

      const agreement = await manager.getAgreement(createResult.agreement.agreementId);
      expect(agreement?.status).to.equal(DataSalesStatus.DATA_LOCKED);
      expect(agreement?.sellerDepositedAt).to.exist;
    });

    it('should update status to BOTH_LOCKED when buyer deposited first', async () => {
      const createResult = await manager.createAgreement({
        sellerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
      });

      // Simulate buyer deposit first
      await mockPrisma.dataSalesAgreement.update({
        where: { agreementId: createResult.agreement.agreementId },
        data: { status: DataSalesStatus.SOL_LOCKED, buyerDepositedAt: new Date() },
      });

      // Mock file exists in S3
      mockS3Service._addFile(createResult.agreement.s3BucketName, 'file.csv', 1000);

      await manager.confirmUpload(createResult.agreement.agreementId, [
        { key: 'file.csv', name: 'file.csv', size: 1000, contentType: 'text/csv', sha256: 'abc123' },
      ]);

      const agreement = await manager.getAgreement(createResult.agreement.agreementId);
      expect(agreement?.status).to.equal(DataSalesStatus.BOTH_LOCKED);
    });

    it('should throw error when file not found in S3', async () => {
      const createResult = await manager.createAgreement({
        sellerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
      });

      // Don't add file to mock S3

      try {
        await manager.confirmUpload(createResult.agreement.agreementId, [
          { key: 'missing.csv', name: 'missing.csv', size: 1000, contentType: 'text/csv', sha256: 'abc123' },
        ]);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('File not found in S3');
      }
    });
  });

  describe('confirmDeposit', () => {
    it('should update status to SOL_LOCKED when buyer deposits first', async () => {
      const createResult = await manager.createAgreement({
        sellerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
      });

      await manager.confirmDeposit(createResult.agreement.agreementId, 'tx-signature-123');

      const agreement = await manager.getAgreement(createResult.agreement.agreementId);
      expect(agreement?.status).to.equal(DataSalesStatus.SOL_LOCKED);
      expect(agreement?.buyerDepositedAt).to.exist;
      expect(agreement?.buyerDepositTxId).to.equal('tx-signature-123');
    });

    it('should update status to BOTH_LOCKED when seller uploaded first', async () => {
      const createResult = await manager.createAgreement({
        sellerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
      });

      // Simulate seller upload first
      await mockPrisma.dataSalesAgreement.update({
        where: { agreementId: createResult.agreement.agreementId },
        data: { status: DataSalesStatus.DATA_LOCKED, sellerDepositedAt: new Date() },
      });

      await manager.confirmDeposit(createResult.agreement.agreementId, 'tx-signature-456');

      const agreement = await manager.getAgreement(createResult.agreement.agreementId);
      expect(agreement?.status).to.equal(DataSalesStatus.BOTH_LOCKED);
    });
  });

  describe('approve', () => {
    it('should update status to APPROVED when in BOTH_LOCKED', async () => {
      const createResult = await manager.createAgreement({
        sellerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
      });

      // Simulate both deposits
      await mockPrisma.dataSalesAgreement.update({
        where: { agreementId: createResult.agreement.agreementId },
        data: { status: DataSalesStatus.BOTH_LOCKED },
      });

      await manager.approve(createResult.agreement.agreementId, 'verifier-address');

      const agreement = await manager.getAgreement(createResult.agreement.agreementId);
      expect(agreement?.status).to.equal(DataSalesStatus.APPROVED);
      expect(agreement?.verifiedAt).to.exist;
      expect(agreement?.verifiedBy).to.equal('verifier-address');
    });

    it('should throw error when not in BOTH_LOCKED status', async () => {
      const createResult = await manager.createAgreement({
        sellerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
      });

      try {
        await manager.approve(createResult.agreement.agreementId, 'verifier');
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('Cannot approve in status');
        expect(error.message).to.include('Must be BOTH_LOCKED');
      }
    });
  });

  describe('reject', () => {
    it('should add rejection reason and increment count', async () => {
      const createResult = await manager.createAgreement({
        sellerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
      });

      await mockPrisma.dataSalesAgreement.update({
        where: { agreementId: createResult.agreement.agreementId },
        data: { status: DataSalesStatus.BOTH_LOCKED },
      });

      await manager.reject(createResult.agreement.agreementId, 'Data quality issues');

      const agreement = await manager.getAgreement(createResult.agreement.agreementId);
      expect(agreement?.rejectionReason).to.equal('Data quality issues');
      expect(agreement?.rejectionCount).to.equal(1);
    });

    it('should throw error when not in BOTH_LOCKED status', async () => {
      const createResult = await manager.createAgreement({
        sellerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
      });

      try {
        await manager.reject(createResult.agreement.agreementId, 'reason');
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('Cannot reject in status');
      }
    });
  });

  describe('settle', () => {
    it('should execute settlement and set access expiry', async () => {
      const createResult = await manager.createAgreement({
        sellerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
        accessDurationHours: 24,
      });

      // Mock file in S3 for download URLs
      mockS3Service._addFile(createResult.agreement.s3BucketName, 'file.csv', 1000);

      await mockPrisma.dataSalesAgreement.update({
        where: { agreementId: createResult.agreement.agreementId },
        data: {
          status: DataSalesStatus.APPROVED,
          files: [{ key: 'file.csv', name: 'file.csv', size: 1000, contentType: 'text/csv', sha256: 'abc' }],
        },
      });

      const result = await manager.settle(createResult.agreement.agreementId);

      expect(result.agreement.status).to.equal(DataSalesStatus.SETTLED);
      expect(result.agreement.settledAt).to.exist;
      expect(result.agreement.accessExpiresAt).to.exist;
      expect(result.settleTxSignature).to.equal('mock-tx-signature-123');
      expect(result.downloadUrls).to.have.length(1);
    });

    it('should throw error when not in APPROVED status', async () => {
      const createResult = await manager.createAgreement({
        sellerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
      });

      try {
        await manager.settle(createResult.agreement.agreementId);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('Cannot settle in status');
        expect(error.message).to.include('Must be APPROVED');
      }
    });
  });

  describe('cancelAgreement', () => {
    it('should cancel agreement and delete S3 bucket', async () => {
      const createResult = await manager.createAgreement({
        sellerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
      });

      await manager.cancelAgreement(createResult.agreement.agreementId);

      const agreement = await manager.getAgreement(createResult.agreement.agreementId);
      expect(agreement?.status).to.equal(DataSalesStatus.CANCELLED);
      expect(agreement?.cancelledAt).to.exist;
    });

    it('should throw error when already settled', async () => {
      const createResult = await manager.createAgreement({
        sellerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
      });

      await mockPrisma.dataSalesAgreement.update({
        where: { agreementId: createResult.agreement.agreementId },
        data: { status: DataSalesStatus.SETTLED },
      });

      try {
        await manager.cancelAgreement(createResult.agreement.agreementId);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('Cannot cancel agreement in status');
      }
    });
  });

  describe('getDownloadUrls', () => {
    it('should return download URLs for settled agreement', async () => {
      const createResult = await manager.createAgreement({
        sellerWallet,
        buyerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
      });

      await mockPrisma.dataSalesAgreement.update({
        where: { agreementId: createResult.agreement.agreementId },
        data: {
          status: DataSalesStatus.SETTLED,
          accessExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          files: [{ key: 'file.csv', name: 'file.csv', size: 1000, contentType: 'text/csv', sha256: 'abc' }],
        },
      });

      const urls = await manager.getDownloadUrls(createResult.agreement.agreementId, buyerWallet);

      expect(urls).to.have.length(1);
      expect(urls[0].method).to.equal('GET');
    });

    it('should throw error for wrong buyer', async () => {
      const createResult = await manager.createAgreement({
        sellerWallet,
        buyerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
      });

      await mockPrisma.dataSalesAgreement.update({
        where: { agreementId: createResult.agreement.agreementId },
        data: { status: DataSalesStatus.SETTLED },
      });

      const wrongBuyer = Keypair.generate().publicKey.toBase58();

      try {
        await manager.getDownloadUrls(createResult.agreement.agreementId, wrongBuyer);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('Not authorized');
      }
    });

    it('should throw error for expired access', async () => {
      const createResult = await manager.createAgreement({
        sellerWallet,
        buyerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
      });

      await mockPrisma.dataSalesAgreement.update({
        where: { agreementId: createResult.agreement.agreementId },
        data: {
          status: DataSalesStatus.SETTLED,
          accessExpiresAt: new Date(Date.now() - 1000), // Already expired
        },
      });

      try {
        await manager.getDownloadUrls(createResult.agreement.agreementId, buyerWallet);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('Access period has expired');
      }
    });

    it('should throw error for non-settled agreement', async () => {
      const createResult = await manager.createAgreement({
        sellerWallet,
        buyerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
      });

      try {
        await manager.getDownloadUrls(createResult.agreement.agreementId, buyerWallet);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('Agreement has not been settled');
      }
    });
  });

  describe('getFilesForVerification', () => {
    it('should return files with read URLs', async () => {
      const createResult = await manager.createAgreement({
        sellerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
      });

      await mockPrisma.dataSalesAgreement.update({
        where: { agreementId: createResult.agreement.agreementId },
        data: {
          files: [
            { key: 'file1.csv', name: 'file1.csv', size: 1000, contentType: 'text/csv', sha256: 'abc' },
            { key: 'file2.json', name: 'file2.json', size: 500, contentType: 'application/json', sha256: 'def' },
          ],
        },
      });

      const files = await manager.getFilesForVerification(createResult.agreement.agreementId);

      expect(files).to.have.length(2);
      expect(files[0].downloadUrl).to.include('signed=true');
      expect(files[0].downloadUrlExpiresAt).to.exist;
    });

    it('should return empty array when no files uploaded', async () => {
      const createResult = await manager.createAgreement({
        sellerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
      });

      const files = await manager.getFilesForVerification(createResult.agreement.agreementId);

      expect(files).to.have.length(0);
    });
  });

  describe('listBySeller', () => {
    it('should return agreements for seller', async () => {
      await manager.createAgreement({ sellerWallet, priceLamports: BigInt(1 * LAMPORTS_PER_SOL) });
      await manager.createAgreement({ sellerWallet, priceLamports: BigInt(2 * LAMPORTS_PER_SOL) });

      const agreements = await manager.listBySeller(sellerWallet);

      expect(agreements).to.have.length(2);
    });

    it('should filter by status', async () => {
      await manager.createAgreement({ sellerWallet, priceLamports: BigInt(1 * LAMPORTS_PER_SOL) });
      const result2 = await manager.createAgreement({ sellerWallet, priceLamports: BigInt(2 * LAMPORTS_PER_SOL) });

      await mockPrisma.dataSalesAgreement.update({
        where: { agreementId: result2.agreement.agreementId },
        data: { status: DataSalesStatus.CANCELLED },
      });

      const agreements = await manager.listBySeller(sellerWallet, { status: DataSalesStatus.PENDING_DEPOSITS });

      expect(agreements).to.have.length(1);
    });

    it('should support pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await manager.createAgreement({ sellerWallet, priceLamports: BigInt((i + 1) * LAMPORTS_PER_SOL) });
      }

      const page1 = await manager.listBySeller(sellerWallet, { limit: 2, offset: 0 });
      const page2 = await manager.listBySeller(sellerWallet, { limit: 2, offset: 2 });

      expect(page1).to.have.length(2);
      expect(page2).to.have.length(2);
    });
  });

  describe('listByBuyer', () => {
    it('should return agreements for buyer', async () => {
      await manager.createAgreement({ sellerWallet, buyerWallet, priceLamports: BigInt(1 * LAMPORTS_PER_SOL) });

      const agreements = await manager.listByBuyer(buyerWallet);

      expect(agreements).to.have.length(1);
      expect(agreements[0].buyerWallet).to.equal(buyerWallet);
    });
  });

  describe('findExpiredDeposits', () => {
    it('should find agreements with expired deposit windows', async () => {
      const result = await manager.createAgreement({
        sellerWallet,
        priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
        depositWindowHours: 0,
      });

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 10));

      const expired = await manager.findExpiredDeposits();

      expect(expired.length).to.be.at.least(1);
      expect(expired.some((a) => a.agreementId === result.agreement.agreementId)).to.be.true;
    });
  });
});
