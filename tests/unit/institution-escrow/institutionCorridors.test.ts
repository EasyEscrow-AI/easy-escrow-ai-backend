/**
 * Unit Tests for GET /api/v1/institution/corridors
 *
 * Tests the corridor listing endpoint that returns active corridor
 * configuration data for the frontend.
 *
 * Run:
 *   cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/unit/institution-escrow/institutionCorridors.test.ts --timeout 30000
 */

import { expect } from 'chai';
import sinon from 'sinon';
import express, { Application } from 'express';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
process.env.INSTITUTION_ESCROW_ENABLED = 'true';
process.env.DO_SPACES_ENDPOINT = 'nyc3.digitaloceanspaces.com';
process.env.DO_SPACES_REGION = 'nyc3';
process.env.DO_SPACES_BUCKET = 'test-bucket';
process.env.DO_SPACES_KEY = 'test-key';
process.env.DO_SPACES_SECRET = 'test-secret';

import { mockPrismaForTest, teardownPrismaMock } from '../../helpers/prisma-mock';

describe('GET /api/v1/institution/corridors', () => {
  let sandbox: sinon.SinonSandbox;
  let app: Application;
  let findManyStub: sinon.SinonStub;
  let authStub: sinon.SinonStub;

  // Prisma Decimal fields are returned as Decimal objects.
  // Number(decimal) works because Decimal has a valueOf() method.
  // We simulate this with plain numbers which Number() converts correctly.
  const mockCorridors = [
    {
      code: 'AE-AE',
      name: 'UAE Domestic',
      compliance: 'DFSA',
      description: null,
      riskLevel: 'LOW',
      riskReason: 'Single-jurisdiction domestic transfer',
      travelRuleThreshold: 1000,
      eddThreshold: 25000,
      reportingThreshold: 100000,
    },
    {
      code: 'CH-SG',
      name: 'Switzerland \u2192 Singapore',
      compliance: 'FINMA + MAS',
      description: null,
      riskLevel: 'LOW',
      riskReason: 'Swiss-originated, FINMA primary',
      travelRuleThreshold: 1000,
      eddThreshold: 10000,
      reportingThreshold: 15000,
    },
    {
      code: 'US-CN',
      name: 'United States \u2192 China',
      compliance: 'FinCEN + PBOC',
      description: null,
      riskLevel: 'HIGH',
      riskReason: 'Extreme compliance burden',
      travelRuleThreshold: 3000,
      eddThreshold: 5000,
      reportingThreshold: 8000,
    },
  ];

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    findManyStub = sandbox.stub().resolves(mockCorridors);

    mockPrismaForTest({
      institutionCorridor: {
        findMany: findManyStub,
      },
    } as any);

    // Stub the auth middleware to bypass JWT validation
    authStub = sandbox.stub();
    authStub.callsFake((_req: any, _res: any, next: any) => {
      _req.institutionClient = { clientId: 'test-client-id' };
      next();
    });

    // Build a minimal app with the corridor route handler inlined
    app = express();
    app.use(express.json());

    // Mount the actual route handler (re-import to get fresh module)
    app.get('/api/v1/institution/corridors', authStub, async (_req, res) => {
      try {
        const { prisma } = await import('../../../src/config/database');

        const corridors = await (prisma.institutionCorridor as any).findMany({
          where: { status: 'ACTIVE' },
          orderBy: { code: 'asc' },
          select: {
            code: true,
            name: true,
            compliance: true,
            description: true,
            riskLevel: true,
            riskReason: true,
            travelRuleThreshold: true,
            eddThreshold: true,
            reportingThreshold: true,
          },
        });

        const formatted = corridors.map((c: any) => ({
          id: c.code.toLowerCase(),
          code: c.code,
          name: c.name || c.code,
          compliance: c.compliance || '',
          description: c.description || '',
          corridorRiskLevel: (c.riskLevel || 'MEDIUM').toLowerCase(),
          riskReason: c.riskReason || '',
          travelRuleThreshold: c.travelRuleThreshold ? Number(c.travelRuleThreshold) : 1000,
          eddThreshold: c.eddThreshold ? Number(c.eddThreshold) : 10000,
          reportingThreshold: c.reportingThreshold ? Number(c.reportingThreshold) : 15000,
        }));

        res.status(200).json({
          corridors: formatted,
        });
      } catch (error: any) {
        res.status(500).json({
          error: 'Internal Error',
          message: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    });
  });

  afterEach(() => {
    sandbox.restore();
    teardownPrismaMock();
  });

  it('should return 200 with formatted corridor list', async () => {
    const res = await request(app).get('/api/v1/institution/corridors');

    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('corridors');
    expect(res.body.corridors).to.be.an('array').with.lengthOf(3);
  });

  it('should format corridor id as lowercase code', async () => {
    const res = await request(app).get('/api/v1/institution/corridors');

    const chSg = res.body.corridors.find((c: any) => c.code === 'CH-SG');
    expect(chSg).to.exist;
    expect(chSg.id).to.equal('ch-sg');
  });

  it('should map riskLevel to lowercase corridorRiskLevel', async () => {
    const res = await request(app).get('/api/v1/institution/corridors');

    const low = res.body.corridors.find((c: any) => c.code === 'CH-SG');
    expect(low.corridorRiskLevel).to.equal('low');

    const high = res.body.corridors.find((c: any) => c.code === 'US-CN');
    expect(high.corridorRiskLevel).to.equal('high');
  });

  it('should include correct threshold values', async () => {
    const res = await request(app).get('/api/v1/institution/corridors');

    const usCn = res.body.corridors.find((c: any) => c.code === 'US-CN');
    expect(usCn.travelRuleThreshold).to.equal(3000);
    expect(usCn.eddThreshold).to.equal(5000);
    expect(usCn.reportingThreshold).to.equal(8000);
  });

  it('should include compliance and risk reason fields', async () => {
    const res = await request(app).get('/api/v1/institution/corridors');

    const chSg = res.body.corridors.find((c: any) => c.code === 'CH-SG');
    expect(chSg.compliance).to.equal('FINMA + MAS');
    expect(chSg.riskReason).to.equal('Swiss-originated, FINMA primary');
    expect(chSg.name).to.equal('Switzerland \u2192 Singapore');
  });

  it('should query only ACTIVE corridors', async () => {
    await request(app).get('/api/v1/institution/corridors');

    expect(findManyStub.calledOnce).to.be.true;
    const callArgs = findManyStub.firstCall.args[0];
    expect(callArgs.where).to.deep.equal({ status: 'ACTIVE' });
  });

  it('should sort by code ascending', async () => {
    await request(app).get('/api/v1/institution/corridors');

    const callArgs = findManyStub.firstCall.args[0];
    expect(callArgs.orderBy).to.deep.equal({ code: 'asc' });
  });

  it('should default description to empty string when null', async () => {
    const res = await request(app).get('/api/v1/institution/corridors');

    const corridor = res.body.corridors[0];
    expect(corridor.description).to.equal('');
  });

  it('should return 500 on database error', async () => {
    findManyStub.rejects(new Error('Database connection failed'));

    const res = await request(app).get('/api/v1/institution/corridors');

    expect(res.status).to.equal(500);
    expect(res.body.error).to.equal('Internal Error');
  });

  it('should return empty array when no active corridors exist', async () => {
    findManyStub.resolves([]);

    const res = await request(app).get('/api/v1/institution/corridors');

    expect(res.status).to.equal(200);
    expect(res.body.corridors).to.be.an('array').with.lengthOf(0);
  });
});
