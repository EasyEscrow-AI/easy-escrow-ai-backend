/**
 * Unit Tests for InstitutionEmailService
 *
 * Tests Resend integration, email template building, and subject generation.
 */

import { expect } from 'chai';
import sinon from 'sinon';

process.env.NODE_ENV = 'test';
process.env.RESEND_API_KEY = 'test-resend-key';
process.env.RESEND_FROM_ADDRESS = 'test@easyescrow.ai';

if (process.env.NODE_ENV !== 'test') {
  throw new Error('Unit tests must run with NODE_ENV=test');
}

describe('InstitutionEmailService', function () {
  this.timeout(10000);

  let sandbox: sinon.SinonSandbox;
  let emailService: any;
  let resendSendStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Clear module cache
    delete require.cache[require.resolve('../../../src/services/institution-email.service')];

    // Mock Resend before importing the service
    resendSendStub = sandbox.stub().resolves({ id: 'email-123' });

    const resendModule = require('resend');
    sandbox.stub(resendModule, 'Resend').returns({
      emails: {
        send: resendSendStub,
      },
    });

    // Re-import to get fresh instance with mocked Resend
    delete require.cache[require.resolve('../../../src/services/institution-email.service')];
    const emailModule = require('../../../src/services/institution-email.service');
    emailService = emailModule.getEmailService();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('sendNotificationEmail()', () => {
    it('should send email with correct subject for ESCROW_CREATED', async () => {
      await emailService.sendNotificationEmail({
        to: 'user@test.com',
        recipientName: 'Test Corp',
        type: 'ESCROW_CREATED',
        title: 'EE-AB3D-7KMN',
        message: 'New escrow created for 5000 USDC',
      });

      expect(resendSendStub.calledOnce).to.be.true;
      const call = resendSendStub.firstCall.args[0];
      expect(call.to).to.equal('user@test.com');
      expect(call.from).to.equal('test@easyescrow.ai');
      expect(call.subject).to.include('[EasyEscrow]');
      expect(call.subject).to.include('New Escrow');
      expect(call.html).to.include('Test Corp');
      expect(call.html).to.include('New escrow created for 5000 USDC');
    });

    it('should send email with correct subject for SETTLEMENT_COMPLETE', async () => {
      await emailService.sendNotificationEmail({
        to: 'user@test.com',
        recipientName: 'Acme Inc',
        type: 'SETTLEMENT_COMPLETE',
        title: 'Settlement Done',
        message: 'Funds released',
        escrowId: 'escrow-123',
        metadata: { amount: 5000, recipient: 'wallet-abc' },
      });

      const call = resendSendStub.firstCall.args[0];
      expect(call.subject).to.include('Settlement Complete');
      expect(call.html).to.include('Escrow ID: escrow-123');
      expect(call.html).to.include('amount');
      expect(call.html).to.include('5000');
    });

    it('should use generic subject for unmapped notification types', async () => {
      await emailService.sendNotificationEmail({
        to: 'user@test.com',
        recipientName: 'Corp',
        type: 'KYC_APPROVED',
        title: 'KYC Done',
        message: 'Your KYC is approved',
      });

      const call = resendSendStub.firstCall.args[0];
      expect(call.subject).to.include('Notification');
    });

    it('should handle email without metadata or escrowId', async () => {
      await emailService.sendNotificationEmail({
        to: 'user@test.com',
        recipientName: 'Corp',
        type: 'ESCROW_CANCELLED',
        title: 'Cancelled',
        message: 'Escrow has been cancelled',
      });

      const call = resendSendStub.firstCall.args[0];
      expect(call.html).to.not.include('Escrow ID:');
      expect(call.html).to.include('Escrow has been cancelled');
    });

    it('should propagate error when Resend API fails', async () => {
      resendSendStub.rejects(new Error('Resend API error'));

      try {
        await emailService.sendNotificationEmail({
          to: 'user@test.com',
          recipientName: 'Corp',
          type: 'ESCROW_CREATED',
          title: 'Test',
          message: 'Test message',
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.equal('Resend API error');
      }
    });
  });
});
