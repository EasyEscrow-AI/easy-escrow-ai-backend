/**
 * Institution Notification Service
 *
 * Handles in-app notification creation and email dispatch via Resend.
 * Checks user notification preferences before sending.
 */

import { prisma } from '../config/database';
import { NotificationType, NotificationPriority } from '../generated/prisma';
import { getEmailService } from './institution-email.service';

export interface NotifyParams {
  clientId: string;
  escrowId?: string;
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/** Maps NotificationType to the InstitutionAccount preference flag */
const TYPE_TO_PREF: Partial<Record<NotificationType, string>> = {
  ESCROW_CREATED: 'notifyOnEscrowCreated',
  ESCROW_FUNDED: 'notifyOnEscrowFunded',
  DEPOSIT_CONFIRMED: 'notifyOnEscrowFunded',
  ESCROW_RELEASED: 'notifyOnEscrowReleased',
  SETTLEMENT_COMPLETE: 'notifyOnEscrowReleased',
  ESCROW_CANCELLED: 'notifyOnEscrowReleased',
  ESCROW_EXPIRED: 'notifyOnEscrowReleased',
  ESCROW_COMPLIANCE_HOLD: 'notifyOnComplianceAlert',
  COMPLIANCE_CHECK_FAILED: 'notifyOnComplianceAlert',
  COMPLIANCE_REVIEW_REQUIRED: 'notifyOnComplianceAlert',
};

class InstitutionNotificationService {
  /**
   * Send a notification respecting user preferences.
   * Creates in-app notification and optionally sends email.
   */
  async notify(params: NotifyParams): Promise<void> {
    const { clientId, escrowId, type, priority, title, message, metadata } = params;

    try {
      // Load preferences from the client's default account + settings
      const [account, settings, client] = await Promise.all([
        prisma.institutionAccount.findFirst({
          where: { clientId, isDefault: true, isActive: true },
        }),
        prisma.institutionClientSettings.findUnique({
          where: { clientId },
        }),
        prisma.institutionClient.findUnique({
          where: { id: clientId },
          select: { email: true, companyName: true, contactEmail: true },
        }),
      ]);

      // Check if this notification type is enabled
      const prefKey = TYPE_TO_PREF[type];
      if (prefKey && account) {
        const enabled = (account as any)[prefKey];
        if (enabled === false) {
          return; // User disabled this notification type
        }
      }

      // 1. Always create in-app notification
      await prisma.institutionNotification.create({
        data: {
          clientId,
          escrowId: escrowId || null,
          type,
          priority: priority || 'MEDIUM',
          title,
          message,
          metadata: (metadata || {}) as any,
        },
      });

      // 2. Send email if configured
      const notificationEmail =
        account?.notificationEmail ||
        settings?.notificationEmail ||
        client?.contactEmail ||
        client?.email;

      if (notificationEmail) {
        try {
          const emailService = getEmailService();
          if (!emailService) return;
          await emailService.sendNotificationEmail({
            to: notificationEmail,
            recipientName: client?.companyName || 'Customer',
            type,
            title,
            message,
            escrowId,
            metadata,
          });
        } catch (err) {
          console.error(
            '[NotificationService] Email send failed (non-critical):',
            (err as Error).message
          );
        }
      }
    } catch (err) {
      // Notification failures should never break the main flow
      console.error('[NotificationService] Failed to send notification:', (err as Error).message);
    }
  }

  /**
   * List notifications for a client
   */
  async listNotifications(
    clientId: string,
    options: { unreadOnly?: boolean; limit?: number; offset?: number } = {}
  ) {
    const { unreadOnly = false } = options;
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);

    const where: Record<string, unknown> = { clientId };
    if (unreadOnly) {
      where.isRead = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.institutionNotification.findMany({
        where: where as any,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.institutionNotification.count({ where: where as any }),
      prisma.institutionNotification.count({
        where: { clientId, isRead: false },
      }),
    ]);

    // Enrich notifications with escrowCode (EE-XXX-XXX) for frontend display
    const escrowIds = notifications
      .map((n: any) => n.escrowId)
      .filter(Boolean) as string[];

    let escrowCodeMap: Map<string, string> = new Map();
    if (escrowIds.length > 0) {
      const escrows = await prisma.institutionEscrow.findMany({
        where: { escrowId: { in: escrowIds } },
        select: { escrowId: true, escrowCode: true },
      });
      escrowCodeMap = new Map(escrows.map((e) => [e.escrowId, e.escrowCode]));
    }

    const enriched = notifications.map((n: any) => ({
      ...n,
      escrowCode: n.escrowId ? escrowCodeMap.get(n.escrowId) || null : null,
    }));

    return { notifications: enriched, total, unreadCount, limit, offset };
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(clientId: string, notificationId: string) {
    const notification = await prisma.institutionNotification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new Error('Notification not found');
    }
    if (notification.clientId !== clientId) {
      throw new Error('Access denied');
    }

    return prisma.institutionNotification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  /**
   * Mark all notifications as read for a client
   */
  async markAllAsRead(clientId: string) {
    const result = await prisma.institutionNotification.updateMany({
      where: { clientId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    return { updated: result.count };
  }
}

let instance: InstitutionNotificationService | null = null;
export function getInstitutionNotificationService(): InstitutionNotificationService {
  if (!instance) {
    instance = new InstitutionNotificationService();
  }
  return instance;
}
