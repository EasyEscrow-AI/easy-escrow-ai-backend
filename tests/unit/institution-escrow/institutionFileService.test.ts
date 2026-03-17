/**
 * Unit Tests for InstitutionFileService
 *
 * Tests file upload, download, deletion, and helper functions:
 * - sanitizeFileName: path traversal, control chars, null bytes
 * - toDocumentType: enum mapping from string input
 * - uploadFile: mime validation, size validation, S3 upload, DB record
 * - getFileUrl: ownership check, presigned URL generation
 * - listFiles: with/without escrowId filter
 * - deleteFile: ownership check, S3 delete, DB delete
 * - getFileBuffer: ownership check, stream-to-buffer conversion
 */

import { expect } from 'chai';
import sinon from 'sinon';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
process.env.INSTITUTION_ESCROW_ENABLED = 'true';
process.env.DO_SPACES_ENDPOINT = 'nyc3.digitaloceanspaces.com';
process.env.DO_SPACES_REGION = 'nyc3';
process.env.DO_SPACES_BUCKET = 'test-bucket';
process.env.DO_SPACES_KEY = 'test-key';
process.env.DO_SPACES_SECRET = 'test-secret';

import { InstitutionFileService } from '../../../src/services/institution-file.service';

describe('InstitutionFileService', () => {
  let sandbox: sinon.SinonSandbox;
  let service: InstitutionFileService;
  let prismaStub: any;
  let s3Stub: any;

  const CLIENT_ID = 'client-123';
  const FILE_ID = 'file-456';
  const ESCROW_ID = 'escrow-789';

  const makeFileRecord = (overrides: Record<string, unknown> = {}) => ({
    id: FILE_ID,
    clientId: CLIENT_ID,
    escrowId: ESCROW_ID,
    fileName: 'invoice.pdf',
    fileKey: `institution/${CLIENT_ID}/${ESCROW_ID}/1234567890_invoice.pdf`,
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    documentType: 'INVOICE',
    uploadedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    prismaStub = {
      institutionFile: {
        findUnique: sandbox.stub(),
        findFirst: sandbox.stub(),
        findMany: sandbox.stub(),
        create: sandbox.stub(),
        delete: sandbox.stub(),
      },
    };

    s3Stub = {
      send: sandbox.stub().resolves({}),
    };

    service = new InstitutionFileService();
    (service as any).prisma = prismaStub;
    (service as any).s3Client = s3Stub;
    (service as any).bucket = 'test-bucket';
  });

  afterEach(() => {
    sandbox.restore();
  });

  // ─── sanitizeFileName (exported helper) ────────────────────

  describe('sanitizeFileName', () => {
    // Access the module-level function via require
    let sanitizeFileName: (name: string) => string;

    before(() => {
      // The function is module-scoped, not exported — access via service internals
      // We re-implement the test against the actual behavior by calling uploadFile
      // with crafted filenames and checking the stored fileName
      const mod = require('../../../src/services/institution-file.service');
      // sanitizeFileName is not exported, so we test it indirectly through uploadFile
    });

    it('should strip path traversal sequences', async () => {
      prismaStub.institutionFile.create.callsFake((args: any) => ({
        ...makeFileRecord(),
        fileName: args.data.fileName,
      }));

      const file = {
        buffer: Buffer.from('test'),
        originalname: '../../../etc/passwd',
        mimetype: 'application/pdf',
        size: 100,
      };

      const result = await service.uploadFile(CLIENT_ID, file, 'INVOICE', ESCROW_ID);
      expect(result.fileName).to.not.include('..');
      expect(result.fileName).to.not.include('/');
    });

    it('should strip null bytes and control characters', async () => {
      prismaStub.institutionFile.create.callsFake((args: any) => ({
        ...makeFileRecord(),
        fileName: args.data.fileName,
      }));

      const file = {
        buffer: Buffer.from('test'),
        originalname: 'file\x00name\x1f.pdf',
        mimetype: 'application/pdf',
        size: 100,
      };

      const result = await service.uploadFile(CLIENT_ID, file, 'INVOICE');
      expect(result.fileName).to.not.match(/[\x00-\x1f\x7f]/);
    });

    it('should strip directory separators', async () => {
      prismaStub.institutionFile.create.callsFake((args: any) => ({
        ...makeFileRecord(),
        fileName: args.data.fileName,
      }));

      const file = {
        buffer: Buffer.from('test'),
        originalname: 'dir/sub\\file.pdf',
        mimetype: 'application/pdf',
        size: 100,
      };

      const result = await service.uploadFile(CLIENT_ID, file, 'INVOICE');
      expect(result.fileName).to.not.include('/');
      expect(result.fileName).to.not.include('\\');
    });

    it('should only keep alphanumeric, dash, underscore, dot', async () => {
      prismaStub.institutionFile.create.callsFake((args: any) => ({
        ...makeFileRecord(),
        fileName: args.data.fileName,
      }));

      const file = {
        buffer: Buffer.from('test'),
        originalname: 'my file (copy)!@#$%.pdf',
        mimetype: 'application/pdf',
        size: 100,
      };

      const result = await service.uploadFile(CLIENT_ID, file, 'INVOICE');
      expect(result.fileName).to.match(/^[a-zA-Z0-9\-_.]+$/);
    });

    it('should return "unnamed" for empty result after sanitization', async () => {
      prismaStub.institutionFile.create.callsFake((args: any) => ({
        ...makeFileRecord(),
        fileName: args.data.fileName,
      }));

      const file = {
        buffer: Buffer.from('test'),
        originalname: '!!!@@@###',
        mimetype: 'application/pdf',
        size: 100,
      };

      const result = await service.uploadFile(CLIENT_ID, file, 'INVOICE');
      expect(result.fileName).to.equal('unnamed');
    });
  });

  // ─── uploadFile ─────────────────────────────────────────────

  describe('uploadFile', () => {
    it('should upload valid PDF and create DB record', async () => {
      const fileRecord = makeFileRecord();
      prismaStub.institutionFile.create.resolves(fileRecord);

      const file = {
        buffer: Buffer.from('pdf content'),
        originalname: 'invoice.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      };

      const result = await service.uploadFile(CLIENT_ID, file, 'INVOICE', ESCROW_ID);

      expect(s3Stub.send.calledOnce).to.be.true;
      expect(prismaStub.institutionFile.create.calledOnce).to.be.true;
      expect(result.id).to.equal(FILE_ID);
    });

    it('should accept JPEG image uploads', async () => {
      prismaStub.institutionFile.create.resolves(makeFileRecord({ mimeType: 'image/jpeg' }));

      const file = {
        buffer: Buffer.from('jpeg content'),
        originalname: 'receipt.jpg',
        mimetype: 'image/jpeg',
        size: 2048,
      };

      const result = await service.uploadFile(CLIENT_ID, file, 'OTHER');
      expect(result).to.have.property('id');
    });

    it('should accept PNG image uploads', async () => {
      prismaStub.institutionFile.create.resolves(makeFileRecord({ mimeType: 'image/png' }));

      const file = {
        buffer: Buffer.from('png content'),
        originalname: 'scan.png',
        mimetype: 'image/png',
        size: 3072,
      };

      const result = await service.uploadFile(CLIENT_ID, file, 'OTHER');
      expect(result).to.have.property('id');
    });

    it('should accept CSV uploads', async () => {
      prismaStub.institutionFile.create.resolves(makeFileRecord({ mimeType: 'text/csv' }));

      const file = {
        buffer: Buffer.from('col1,col2\nval1,val2'),
        originalname: 'data.csv',
        mimetype: 'text/csv',
        size: 512,
      };

      const result = await service.uploadFile(CLIENT_ID, file, 'OTHER');
      expect(result).to.have.property('id');
    });

    it('should accept Excel XLSX uploads', async () => {
      prismaStub.institutionFile.create.resolves(makeFileRecord());

      const file = {
        buffer: Buffer.from('xlsx content'),
        originalname: 'report.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 4096,
      };

      const result = await service.uploadFile(CLIENT_ID, file, 'OTHER');
      expect(result).to.have.property('id');
    });

    it('should reject disallowed mime types', async () => {
      const file = {
        buffer: Buffer.from('exe content'),
        originalname: 'malware.exe',
        mimetype: 'application/x-msdownload',
        size: 1024,
      };

      try {
        await service.uploadFile(CLIENT_ID, file, 'OTHER');
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Invalid file type');
        expect(err.message).to.include('application/x-msdownload');
      }
    });

    it('should reject HTML file uploads', async () => {
      const file = {
        buffer: Buffer.from('<html>'),
        originalname: 'page.html',
        mimetype: 'text/html',
        size: 100,
      };

      try {
        await service.uploadFile(CLIENT_ID, file, 'OTHER');
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Invalid file type');
      }
    });

    it('should reject files exceeding 25MB', async () => {
      const file = {
        buffer: Buffer.alloc(100), // small buffer, but size field is what's checked
        originalname: 'huge.pdf',
        mimetype: 'application/pdf',
        size: 26 * 1024 * 1024, // 26MB
      };

      try {
        await service.uploadFile(CLIENT_ID, file, 'INVOICE');
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('File too large');
        expect(err.message).to.include('25MB');
      }
    });

    it('should accept file exactly at 25MB limit', async () => {
      prismaStub.institutionFile.create.resolves(makeFileRecord());

      const file = {
        buffer: Buffer.from('content'),
        originalname: 'big.pdf',
        mimetype: 'application/pdf',
        size: 25 * 1024 * 1024, // exactly 25MB
      };

      const result = await service.uploadFile(CLIENT_ID, file, 'INVOICE');
      expect(result).to.have.property('id');
    });

    it('should use "general" folder when no escrowId provided', async () => {
      prismaStub.institutionFile.create.callsFake((args: any) => ({
        ...makeFileRecord(),
        fileKey: args.data.fileKey,
        escrowId: null,
      }));

      const file = {
        buffer: Buffer.from('content'),
        originalname: 'doc.pdf',
        mimetype: 'application/pdf',
        size: 100,
      };

      const result = await service.uploadFile(CLIENT_ID, file, 'OTHER');

      const createArgs = prismaStub.institutionFile.create.firstCall.args[0];
      expect(createArgs.data.fileKey).to.include('/general/');
      expect(createArgs.data.escrowId).to.be.null;
    });

    it('should use escrowId as folder when provided', async () => {
      prismaStub.institutionFile.create.callsFake((args: any) => ({
        ...makeFileRecord(),
        fileKey: args.data.fileKey,
      }));

      const file = {
        buffer: Buffer.from('content'),
        originalname: 'doc.pdf',
        mimetype: 'application/pdf',
        size: 100,
      };

      await service.uploadFile(CLIENT_ID, file, 'INVOICE', ESCROW_ID);

      const createArgs = prismaStub.institutionFile.create.firstCall.args[0];
      expect(createArgs.data.fileKey).to.include(`/${ESCROW_ID}/`);
    });

    it('should map document type string to enum correctly', async () => {
      prismaStub.institutionFile.create.callsFake((args: any) => ({
        ...makeFileRecord(),
        documentType: args.data.documentType,
      }));

      const file = {
        buffer: Buffer.from('content'),
        originalname: 'contract.pdf',
        mimetype: 'application/pdf',
        size: 100,
      };

      const result = await service.uploadFile(CLIENT_ID, file, 'CONTRACT');
      const createArgs = prismaStub.institutionFile.create.firstCall.args[0];
      expect(createArgs.data.documentType).to.equal('CONTRACT');
    });

    it('should default to OTHER for unknown document type', async () => {
      prismaStub.institutionFile.create.callsFake((args: any) => ({
        ...makeFileRecord(),
        documentType: args.data.documentType,
      }));

      const file = {
        buffer: Buffer.from('content'),
        originalname: 'misc.pdf',
        mimetype: 'application/pdf',
        size: 100,
      };

      await service.uploadFile(CLIENT_ID, file, 'UNKNOWN_TYPE');
      const createArgs = prismaStub.institutionFile.create.firstCall.args[0];
      expect(createArgs.data.documentType).to.equal('OTHER');
    });
  });

  // ─── getFileUrl ─────────────────────────────────────────────

  describe('getFileUrl', () => {
    it('should throw when file not found', async () => {
      prismaStub.institutionFile.findUnique.resolves(null);

      try {
        await service.getFileUrl(FILE_ID, CLIENT_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.equal('File not found');
      }
    });

    it('should throw when file belongs to different client', async () => {
      prismaStub.institutionFile.findUnique.resolves(
        makeFileRecord({ clientId: 'other-client' }),
      );

      try {
        await service.getFileUrl(FILE_ID, CLIENT_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Unauthorized');
      }
    });

    it('should generate presigned URL for authorized client', async () => {
      prismaStub.institutionFile.findUnique.resolves(makeFileRecord());

      // Mock getSignedUrl at the module level
      const s3Presigner = require('@aws-sdk/s3-request-presigner');
      const originalGetSignedUrl = s3Presigner.getSignedUrl;
      sandbox.stub(s3Presigner, 'getSignedUrl').resolves('https://signed-url.example.com');

      const result = await service.getFileUrl(FILE_ID, CLIENT_ID);

      expect(result).to.have.property('url', 'https://signed-url.example.com');
      expect(result).to.have.property('expiresIn', 3600);

      // Restore
      s3Presigner.getSignedUrl = originalGetSignedUrl;
    });
  });

  // ─── listFiles ──────────────────────────────────────────────

  describe('listFiles', () => {
    it('should list all files for a client', async () => {
      const files = [makeFileRecord(), makeFileRecord({ id: 'file-2' })];
      prismaStub.institutionFile.findMany.resolves(files);

      const result = await service.listFiles(CLIENT_ID);

      expect(result).to.have.length(2);
      expect(prismaStub.institutionFile.findMany.calledOnce).to.be.true;
      const queryArgs = prismaStub.institutionFile.findMany.firstCall.args[0];
      expect(queryArgs.where).to.deep.include({ clientId: CLIENT_ID });
      expect(queryArgs.where).to.not.have.property('escrowId');
    });

    it('should filter by escrowId when provided', async () => {
      prismaStub.institutionFile.findMany.resolves([makeFileRecord()]);

      await service.listFiles(CLIENT_ID, ESCROW_ID);

      const queryArgs = prismaStub.institutionFile.findMany.firstCall.args[0];
      expect(queryArgs.where).to.deep.include({ clientId: CLIENT_ID, escrowId: ESCROW_ID });
    });

    it('should return empty array when no files exist', async () => {
      prismaStub.institutionFile.findMany.resolves([]);

      const result = await service.listFiles(CLIENT_ID);

      expect(result).to.be.an('array').that.is.empty;
    });

    it('should order by uploadedAt descending', async () => {
      prismaStub.institutionFile.findMany.resolves([]);

      await service.listFiles(CLIENT_ID);

      const queryArgs = prismaStub.institutionFile.findMany.firstCall.args[0];
      expect(queryArgs.orderBy).to.deep.equal({ uploadedAt: 'desc' });
    });
  });

  // ─── deleteFile ─────────────────────────────────────────────

  describe('deleteFile', () => {
    it('should throw when file not found', async () => {
      prismaStub.institutionFile.findUnique.resolves(null);

      try {
        await service.deleteFile(FILE_ID, CLIENT_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.equal('File not found');
      }
    });

    it('should throw when file belongs to different client', async () => {
      prismaStub.institutionFile.findUnique.resolves(
        makeFileRecord({ clientId: 'other-client' }),
      );

      try {
        await service.deleteFile(FILE_ID, CLIENT_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Unauthorized');
      }
    });

    it('should delete from S3 and database for authorized client', async () => {
      prismaStub.institutionFile.findUnique.resolves(makeFileRecord());
      prismaStub.institutionFile.delete.resolves(makeFileRecord());

      const result = await service.deleteFile(FILE_ID, CLIENT_ID);

      expect(result).to.deep.equal({ success: true });
      expect(s3Stub.send.calledOnce).to.be.true;
      expect(prismaStub.institutionFile.delete.calledOnce).to.be.true;
    });

    it('should delete from S3 before database', async () => {
      const callOrder: string[] = [];

      s3Stub.send.callsFake(() => {
        callOrder.push('s3');
        return Promise.resolve({});
      });
      prismaStub.institutionFile.findUnique.resolves(makeFileRecord());
      prismaStub.institutionFile.delete.callsFake(() => {
        callOrder.push('db');
        return Promise.resolve(makeFileRecord());
      });

      await service.deleteFile(FILE_ID, CLIENT_ID);

      expect(callOrder).to.deep.equal(['s3', 'db']);
    });
  });

  // ─── getFileBuffer ──────────────────────────────────────────

  describe('getFileBuffer', () => {
    it('should throw when file not found', async () => {
      prismaStub.institutionFile.findUnique.resolves(null);

      try {
        await service.getFileBuffer(FILE_ID, CLIENT_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.equal('File not found');
      }
    });

    it('should throw when file belongs to different client', async () => {
      prismaStub.institutionFile.findUnique.resolves(
        makeFileRecord({ clientId: 'other-client' }),
      );

      try {
        await service.getFileBuffer(FILE_ID, CLIENT_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Unauthorized');
      }
    });

    it('should return buffer with metadata for authorized client', async () => {
      prismaStub.institutionFile.findUnique.resolves(makeFileRecord());

      // Create a mock readable stream
      const { Readable } = require('stream');
      const mockStream = new Readable({
        read() {
          this.push(Buffer.from('file content'));
          this.push(null);
        },
      });

      s3Stub.send.resolves({ Body: mockStream });

      const result = await service.getFileBuffer(FILE_ID, CLIENT_ID);

      expect(result).to.have.property('buffer');
      expect(result).to.have.property('mimeType', 'application/pdf');
      expect(result).to.have.property('fileName', 'invoice.pdf');
      expect(result.buffer.toString()).to.equal('file content');
    });
  });
});
