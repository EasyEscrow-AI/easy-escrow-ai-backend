import { expect } from 'chai';
import sinon from 'sinon';
import jwt from 'jsonwebtoken';

// Set env for tests before importing middleware
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.SETTLEMENT_AUTHORITY_API_KEY = 'test-settlement-key-12345';

import {
  requireInstitutionAuth,
  optionalInstitutionAuth,
  requireSettlementAuthority,
  InstitutionAuthenticatedRequest,
} from '../../../src/middleware/institution-jwt.middleware';
import { resetInstitutionEscrowConfig } from '../../../src/config/institution-escrow.config';
import { generateTestToken, generateExpiredToken } from '../../helpers/institution-test-utils';

describe('InstitutionJwtMiddleware', () => {
  let sandbox: sinon.SinonSandbox;
  let req: Partial<InstitutionAuthenticatedRequest>;
  let res: any;
  let next: sinon.SinonSpy;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    // Ensure env vars are set correctly for each test
    process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
    process.env.SETTLEMENT_AUTHORITY_API_KEY = 'test-settlement-key-12345';

    req = {
      headers: {},
    };

    res = {
      status: sinon.stub().returnsThis(),
      json: sinon.stub().returnsThis(),
      setHeader: sinon.stub(),
    };

    next = sinon.spy();
  });

  afterEach(() => {
    sandbox.restore();
  });

  // ---------------------------------------------------------------------------
  // requireInstitutionAuth
  // ---------------------------------------------------------------------------
  describe('requireInstitutionAuth', () => {
    it('should set req.institutionClient with valid token', () => {
      const token = generateTestToken({
        clientId: 'client-123',
        email: 'user@example.com',
        tier: 'ENTERPRISE',
      });

      req.headers = { authorization: `Bearer ${token}` };

      requireInstitutionAuth(
        req as InstitutionAuthenticatedRequest,
        res,
        next
      );

      expect(next.calledOnce).to.be.true;
      expect(req.institutionClient).to.deep.include({
        clientId: 'client-123',
        email: 'user@example.com',
        tier: 'ENTERPRISE',
      });
    });

    it('should return 401 TOKEN_MISSING when no auth header', () => {
      req.headers = {};

      requireInstitutionAuth(
        req as InstitutionAuthenticatedRequest,
        res,
        next
      );

      expect(next.called).to.be.false;
      expect(res.status.calledWith(401)).to.be.true;
      const body = res.json.firstCall.args[0];
      expect(body.code).to.equal('TOKEN_MISSING');
    });

    it('should return 401 TOKEN_MISSING when auth header is not Bearer', () => {
      req.headers = { authorization: 'Basic abc123' };

      requireInstitutionAuth(
        req as InstitutionAuthenticatedRequest,
        res,
        next
      );

      expect(next.called).to.be.false;
      expect(res.status.calledWith(401)).to.be.true;
      const body = res.json.firstCall.args[0];
      expect(body.code).to.equal('TOKEN_MISSING');
    });

    it('should return 401 TOKEN_EXPIRED when token is expired', () => {
      const expiredToken = generateExpiredToken();

      // Tiny delay to ensure the token is fully expired
      req.headers = { authorization: `Bearer ${expiredToken}` };

      // Use a real clock tick to ensure expiry
      const clock = sandbox.useFakeTimers(Date.now() + 2000);

      requireInstitutionAuth(
        req as InstitutionAuthenticatedRequest,
        res,
        next
      );

      clock.restore();

      expect(next.called).to.be.false;
      expect(res.status.calledWith(401)).to.be.true;
      const body = res.json.firstCall.args[0];
      expect(body.code).to.equal('TOKEN_EXPIRED');
    });

    it('should return 401 TOKEN_INVALID when token is malformed', () => {
      req.headers = { authorization: 'Bearer not.a.valid.jwt.token' };

      requireInstitutionAuth(
        req as InstitutionAuthenticatedRequest,
        res,
        next
      );

      expect(next.called).to.be.false;
      expect(res.status.calledWith(401)).to.be.true;
      const body = res.json.firstCall.args[0];
      expect(body.code).to.equal('TOKEN_INVALID');
    });

    it('should set X-New-Access-Token header when token is near expiry', () => {
      // Create a token with 1h expiry
      const secret = process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only-32chars!';
      const token = jwt.sign(
        { clientId: 'client-123', email: 'user@example.com', tier: 'ENTERPRISE' },
        secret,
        { expiresIn: 3600 } as jwt.SignOptions, // 1 hour
      );

      req.headers = { authorization: `Bearer ${token}` };

      // Fast-forward to when only 10% of lifetime remains (54 min into a 1h token)
      const clock = sandbox.useFakeTimers(Date.now() + 54 * 60 * 1000);

      requireInstitutionAuth(
        req as InstitutionAuthenticatedRequest,
        res,
        next
      );

      clock.restore();

      expect(next.calledOnce).to.be.true;
      expect(res.setHeader.calledWith('X-New-Access-Token')).to.be.true;
      // Verify the new token is valid
      const newToken = res.setHeader.firstCall.args[1];
      const decoded = jwt.verify(newToken, secret) as any;
      expect(decoded.clientId).to.equal('client-123');
    });

    it('should NOT set X-New-Access-Token when token has plenty of time left', () => {
      const token = generateTestToken({
        clientId: 'client-123',
        email: 'user@example.com',
        tier: 'ENTERPRISE',
      });

      req.headers = { authorization: `Bearer ${token}` };

      requireInstitutionAuth(
        req as InstitutionAuthenticatedRequest,
        res,
        next
      );

      expect(next.calledOnce).to.be.true;
      expect(res.setHeader.called).to.be.false;
    });

    it('should return 401 TOKEN_INVALID when token signed with wrong secret', () => {
      const badToken = jwt.sign(
        { clientId: 'test', email: 'test@example.com', tier: 'STANDARD' },
        'wrong-secret-key-that-is-definitely-not-right',
        { expiresIn: '15m' } as jwt.SignOptions,
      );

      req.headers = { authorization: `Bearer ${badToken}` };

      requireInstitutionAuth(
        req as InstitutionAuthenticatedRequest,
        res,
        next
      );

      expect(next.called).to.be.false;
      expect(res.status.calledWith(401)).to.be.true;
      const body = res.json.firstCall.args[0];
      expect(body.code).to.equal('TOKEN_INVALID');
    });
  });

  // ---------------------------------------------------------------------------
  // optionalInstitutionAuth
  // ---------------------------------------------------------------------------
  describe('optionalInstitutionAuth', () => {
    it('should continue without client when no token provided', () => {
      req.headers = {};

      optionalInstitutionAuth(
        req as InstitutionAuthenticatedRequest,
        res,
        next
      );

      expect(next.calledOnce).to.be.true;
      expect(req.institutionClient).to.be.undefined;
    });

    it('should set client when valid token provided', () => {
      const token = generateTestToken({
        clientId: 'opt-client',
        email: 'optional@example.com',
        tier: 'STANDARD',
      });

      req.headers = { authorization: `Bearer ${token}` };

      optionalInstitutionAuth(
        req as InstitutionAuthenticatedRequest,
        res,
        next
      );

      expect(next.calledOnce).to.be.true;
      expect(req.institutionClient).to.deep.include({
        clientId: 'opt-client',
        email: 'optional@example.com',
        tier: 'STANDARD',
      });
    });

    it('should continue without client when token is invalid', () => {
      req.headers = { authorization: 'Bearer invalid.token.here' };

      optionalInstitutionAuth(
        req as InstitutionAuthenticatedRequest,
        res,
        next
      );

      expect(next.calledOnce).to.be.true;
      expect(req.institutionClient).to.be.undefined;
      // Should NOT send an error response
      expect(res.status.called).to.be.false;
    });

    it('should continue without client when token is expired', () => {
      const expiredToken = generateExpiredToken();
      const clock = sandbox.useFakeTimers(Date.now() + 2000);

      req.headers = { authorization: `Bearer ${expiredToken}` };

      optionalInstitutionAuth(
        req as InstitutionAuthenticatedRequest,
        res,
        next
      );

      clock.restore();

      expect(next.calledOnce).to.be.true;
      expect(req.institutionClient).to.be.undefined;
      expect(res.status.called).to.be.false;
    });
  });

  // ---------------------------------------------------------------------------
  // requireSettlementAuthority
  // ---------------------------------------------------------------------------
  describe('requireSettlementAuthority', () => {
    beforeEach(() => {
      // requireSettlementAuthority expects req.institutionClient to be set
      // (it should be called after requireInstitutionAuth in the middleware chain)
      req.institutionClient = {
        clientId: 'test-client-id',
        email: 'test@example.com',
        tier: 'STANDARD',
      };
      // Ensure CDP is disabled by default for existing tests
      delete process.env.CDP_ENABLED;
      resetInstitutionEscrowConfig();
    });

    it('should pass with valid settlement authority key', () => {
      req.headers = {
        'x-settlement-authority-key': 'test-settlement-key-12345',
      };

      requireSettlementAuthority(
        req as InstitutionAuthenticatedRequest,
        res,
        next
      );

      expect(next.calledOnce).to.be.true;
    });

    it('should return 401 when requireInstitutionAuth has not run', () => {
      req.institutionClient = undefined;
      req.headers = {
        'x-settlement-authority-key': 'test-settlement-key-12345',
      };

      requireSettlementAuthority(
        req as InstitutionAuthenticatedRequest,
        res,
        next
      );

      expect(next.called).to.be.false;
      expect(res.status.calledWith(401)).to.be.true;
      const body = res.json.firstCall.args[0];
      expect(body.code).to.equal('AUTH_REQUIRED');
    });

    it('should return 403 when settlement key is missing', () => {
      req.headers = {};

      requireSettlementAuthority(
        req as InstitutionAuthenticatedRequest,
        res,
        next
      );

      expect(next.called).to.be.false;
      expect(res.status.calledWith(403)).to.be.true;
      const body = res.json.firstCall.args[0];
      expect(body.code).to.equal('SETTLEMENT_UNAUTHORIZED');
    });

    it('should return 403 when settlement key is wrong', () => {
      req.headers = {
        'x-settlement-authority-key': 'wrong-key-value',
      };

      requireSettlementAuthority(
        req as InstitutionAuthenticatedRequest,
        res,
        next
      );

      expect(next.called).to.be.false;
      expect(res.status.calledWith(403)).to.be.true;
      const body = res.json.firstCall.args[0];
      expect(body.code).to.equal('SETTLEMENT_UNAUTHORIZED');
    });

    it('should return 500 when SETTLEMENT_AUTHORITY_API_KEY env is not set', () => {
      const originalKey = process.env.SETTLEMENT_AUTHORITY_API_KEY;
      delete process.env.SETTLEMENT_AUTHORITY_API_KEY;

      req.headers = {
        'x-settlement-authority-key': 'any-key',
      };

      requireSettlementAuthority(
        req as InstitutionAuthenticatedRequest,
        res,
        next
      );

      // Restore
      process.env.SETTLEMENT_AUTHORITY_API_KEY = originalKey;

      expect(next.called).to.be.false;
      expect(res.status.calledWith(500)).to.be.true;
    });

    it('should bypass API key check when CDP is enabled', () => {
      const originalCdp = process.env.CDP_ENABLED;
      process.env.CDP_ENABLED = 'true';
      resetInstitutionEscrowConfig();

      // No settlement authority header — would normally fail
      req.headers = {};

      requireSettlementAuthority(
        req as InstitutionAuthenticatedRequest,
        res,
        next
      );

      // Restore
      process.env.CDP_ENABLED = originalCdp;
      resetInstitutionEscrowConfig();

      expect(next.calledOnce).to.be.true;
      expect(res.status.called).to.be.false;
    });

    it('should still require auth before CDP bypass', () => {
      const originalCdp = process.env.CDP_ENABLED;
      process.env.CDP_ENABLED = 'true';
      resetInstitutionEscrowConfig();

      req.institutionClient = undefined;
      req.headers = {};

      requireSettlementAuthority(
        req as InstitutionAuthenticatedRequest,
        res,
        next
      );

      // Restore
      process.env.CDP_ENABLED = originalCdp;
      resetInstitutionEscrowConfig();

      expect(next.called).to.be.false;
      expect(res.status.calledWith(401)).to.be.true;
      const body = res.json.firstCall.args[0];
      expect(body.code).to.equal('AUTH_REQUIRED');
    });
  });
});
