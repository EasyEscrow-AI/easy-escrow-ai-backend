/**
 * Unit Tests for InstitutionNotificationService
 *
 * Tests notification creation, preference checking, email dispatch,
 * listing, and mark-as-read operations.
 */

import { expect } from 'chai';
import sinon from 'sinon';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.RESEND_API_KEY = 'test-resend-key';

import { setMockPrismaClient, clearMockPrismaClient } from '../../../src/config/database';

describe('InstitutionNotificationService', () => {
  let sandbox: sinon.SinonSandbox;
  let prismaStub: any;
  let emailServiceStub: any;
  let notificationService: any;

  const CLIENT_ID = 'client-123';
  const ESCROW_ID = 'escrow-456';
  const NOTIFICATION_ID = 'notif-789';

  const makeAccount = (overrides: Record<string, unknown> = {}) => ({
    id: 'account-1',
    clientId: CLIENT_ID,
    isDefault: true,
    isActive: true,
    notificationEmail: 'ops@testcorp.com',
    notifyOnEscrowCreated: true,
    notifyOnEscrowFunded: true,
    notifyOnEscrowReleased: true,
    notifyOnComplianceAlert: true,
    ...overrides,
  });

  const makeClient = (overrides: Record<string, unknown> = {}) => ({
    email: 'admin@testcorp.com',
    companyName: 'Test Corp',
    contactEmail: 'contact@testcorp.com',
    ...overrides,
  });

  const makeNotification = (overrides: Record<string, unknown> = {}) => ({
    id: NOTIFICATION_ID,
    clientId: CLIENT_ID,
    escrowId: ESCROW_ID,
    type: 'ESCROW_CREATED',
    priority: 'MEDIUM',
    title: 'Escrow Created',
    message: 'Test message',
    metadata: {},
    isRead: false,
    readAt: null,
    createdAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    prismaStub = {
      institutionAccount: {
        findFirst: sandbox.stub().resolves(makeAccount()),
      },
      institutionClientSettings: {
        findUnique: sandbox.stub().resolves(null),
      },
      institutionClient: {
        findUnique: sandbox.stub().resolves(makeClient()),
      },
      institutionNotification: {
        create: sandbox.stub().resolves(makeNotification()),
        findUnique: sandbox.stub().resolves(makeNotification()),
        findMany: sandbox.stub().resolves([makeNotification()]),
        count: sandbox.stub().resolves(1),
        update: sandbox.stub().resolves(makeNotification({ isRead: true, readAt: new Date() })),
        updateMany: sandbox.stub().resolves({ count: 3 }),
      },
    };

    setMockPrismaClient(prismaStub as any);

    // Mock the email service to avoid actually sending emails
    emailServiceStub = {
      sendNotificationEmail: sandbox.stub().resolves(),
    };

    // Clear module cache to get fresh instances
    delete require.cache[require.resolve('../../../src/services/institution-notification.service')];
    delete require.cache[require.resolve('../../../src/services/institution-email.service')];

    // Mock the email service module
    const emailModule = require('../../../src/services/institution-email.service');
    sandbox.stub(emailModule, 'getEmailService').returns(emailServiceStub);

    const notifModule = require('../../../src/services/institution-notification.service');
    notificationService = notifModule.getInstitutionNotificationService();
  });

  afterEach(() => {
    sandbox.restore();
    clearMockPrismaClient();
  });

  describe('notify()', () => {
    it('should create in-app notification and send email', async () => {
      await notificationService.notify({
        clientId: CLIENT_ID,
        escrowId: ESCROW_ID,
        type: 'ESCROW_CREATED',
        title: 'Escrow Created',
        message: 'New escrow created',
      });

      expect(prismaStub.institutionNotification.create.calledOnce).to.be.true;
      const createCall = prismaStub.institutionNotification.create.firstCall.args[0];
      expect(createCall.data.clientId).to.equal(CLIENT_ID);
      expect(createCall.data.type).to.equal('ESCROW_CREATED');
      expect(createCall.data.title).to.equal('Escrow Created');

      expect(emailServiceStub.sendNotificationEmail.calledOnce).to.be.true;
      const emailCall = emailServiceStub.sendNotificationEmail.firstCall.args[0];
      expect(emailCall.to).to.equal('ops@testcorp.com');
      expect(emailCall.type).to.equal('ESCROW_CREATED');
    });

    it('should skip notification when preference is disabled', async () => {
      prismaStub.institutionAccount.findFirst.resolves(
        makeAccount({ notifyOnEscrowCreated: false })
      );

      await notificationService.notify({
        clientId: CLIENT_ID,
        escrowId: ESCROW_ID,
        type: 'ESCROW_CREATED',
        title: 'Escrow Created',
        message: 'New escrow created',
      });

      expect(prismaStub.institutionNotification.create.called).to.be.false;
      expect(emailServiceStub.sendNotificationEmail.called).to.be.false;
    });

    it('should use contactEmail fallback when no notificationEmail configured', async () => {
      prismaStub.institutionAccount.findFirst.resolves(makeAccount({ notificationEmail: null }));

      await notificationService.notify({
        clientId: CLIENT_ID,
        type: 'ESCROW_FUNDED',
        title: 'Funded',
        message: 'Escrow funded',
      });

      expect(emailServiceStub.sendNotificationEmail.calledOnce).to.be.true;
      expect(emailServiceStub.sendNotificationEmail.firstCall.args[0].to).to.equal(
        'contact@testcorp.com'
      );
    });

    it('should not send email when no email address available', async () => {
      prismaStub.institutionAccount.findFirst.resolves(makeAccount({ notificationEmail: null }));
      prismaStub.institutionClient.findUnique.resolves(
        makeClient({ email: null, contactEmail: null })
      );

      await notificationService.notify({
        clientId: CLIENT_ID,
        type: 'ESCROW_FUNDED',
        title: 'Funded',
        message: 'Escrow funded',
      });

      // In-app notification still created
      expect(prismaStub.institutionNotification.create.calledOnce).to.be.true;
      // No email sent
      expect(emailServiceStub.sendNotificationEmail.called).to.be.false;
    });

    it('should not throw when email service fails', async () => {
      emailServiceStub.sendNotificationEmail.rejects(new Error('Resend API error'));

      // Should not throw
      await notificationService.notify({
        clientId: CLIENT_ID,
        type: 'ESCROW_CREATED',
        title: 'Test',
        message: 'Test',
      });

      // In-app notification still created
      expect(prismaStub.institutionNotification.create.calledOnce).to.be.true;
    });

    it('should not throw when entire notification flow fails', async () => {
      prismaStub.institutionAccount.findFirst.rejects(new Error('DB error'));

      // Should not throw — notifications should never break the main flow
      await notificationService.notify({
        clientId: CLIENT_ID,
        type: 'ESCROW_CREATED',
        title: 'Test',
        message: 'Test',
      });
    });

    it('should map ESCROW_COMPLIANCE_HOLD to notifyOnComplianceAlert preference', async () => {
      prismaStub.institutionAccount.findFirst.resolves(
        makeAccount({ notifyOnComplianceAlert: false })
      );

      await notificationService.notify({
        clientId: CLIENT_ID,
        type: 'ESCROW_COMPLIANCE_HOLD',
        title: 'Compliance Hold',
        message: 'Hold',
      });

      expect(prismaStub.institutionNotification.create.called).to.be.false;
    });

    it('should send notification for types without a preference mapping', async () => {
      await notificationService.notify({
        clientId: CLIENT_ID,
        type: 'SECURITY_ALERT',
        priority: 'CRITICAL',
        title: 'Security Alert',
        message: 'Suspicious activity',
      });

      // No preference key for SECURITY_ALERT, so it should always send
      expect(prismaStub.institutionNotification.create.calledOnce).to.be.true;
    });
  });

  describe('listNotifications()', () => {
    it('should list all notifications for a client', async () => {
      const result = await notificationService.listNotifications(CLIENT_ID);

      expect(result.notifications).to.have.lengthOf(1);
      expect(result.total).to.equal(1);
      expect(prismaStub.institutionNotification.findMany.calledOnce).to.be.true;
    });

    it('should filter unread only', async () => {
      await notificationService.listNotifications(CLIENT_ID, { unreadOnly: true });

      const findManyCall = prismaStub.institutionNotification.findMany.firstCall.args[0];
      expect(findManyCall.where.isRead).to.equal(false);
    });

    it('should support pagination', async () => {
      await notificationService.listNotifications(CLIENT_ID, { limit: 10, offset: 5 });

      const findManyCall = prismaStub.institutionNotification.findMany.firstCall.args[0];
      expect(findManyCall.take).to.equal(10);
      expect(findManyCall.skip).to.equal(5);
    });
  });

  describe('markAsRead()', () => {
    it('should mark a notification as read', async () => {
      const result = await notificationService.markAsRead(CLIENT_ID, NOTIFICATION_ID);

      expect(prismaStub.institutionNotification.update.calledOnce).to.be.true;
      const updateCall = prismaStub.institutionNotification.update.firstCall.args[0];
      expect(updateCall.data.isRead).to.be.true;
      expect(updateCall.data.readAt).to.be.an.instanceOf(Date);
    });

    it('should throw when notification not found', async () => {
      prismaStub.institutionNotification.findUnique.resolves(null);

      try {
        await notificationService.markAsRead(CLIENT_ID, 'nonexistent');
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.equal('Notification not found');
      }
    });

    it('should throw when notification belongs to another client', async () => {
      prismaStub.institutionNotification.findUnique.resolves(
        makeNotification({ clientId: 'other-client' })
      );

      try {
        await notificationService.markAsRead(CLIENT_ID, NOTIFICATION_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.equal('Access denied');
      }
    });
  });

  describe('markAllAsRead()', () => {
    it('should mark all unread notifications as read', async () => {
      const result = await notificationService.markAllAsRead(CLIENT_ID);

      expect(result.updated).to.equal(3);
      expect(prismaStub.institutionNotification.updateMany.calledOnce).to.be.true;
      const updateCall = prismaStub.institutionNotification.updateMany.firstCall.args[0];
      expect(updateCall.where.clientId).to.equal(CLIENT_ID);
      expect(updateCall.where.isRead).to.equal(false);
    });
  });
});
