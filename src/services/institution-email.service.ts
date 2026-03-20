/**
 * Institution Email Service (Resend)
 *
 * Sends transactional emails for institution escrow notifications.
 */

import { Resend } from 'resend';
import { NotificationType } from '../generated/prisma';

export interface SendNotificationEmailParams {
  to: string;
  recipientName: string;
  type: NotificationType;
  title: string;
  message: string;
  escrowId?: string;
  metadata?: Record<string, unknown>;
}

/** Map notification types to email subject prefixes */
const SUBJECT_PREFIX: Partial<Record<NotificationType, string>> = {
  ESCROW_CREATED: 'New Escrow',
  ESCROW_FUNDED: 'Escrow Funded',
  DEPOSIT_CONFIRMED: 'Deposit Confirmed',
  ESCROW_RELEASED: 'Funds Released',
  SETTLEMENT_COMPLETE: 'Settlement Complete',
  ESCROW_CANCELLED: 'Escrow Cancelled',
  ESCROW_EXPIRED: 'Escrow Expired',
  ESCROW_COMPLIANCE_HOLD: 'Compliance Hold',
  COMPLIANCE_CHECK_FAILED: 'Compliance Alert',
  COMPLIANCE_REVIEW_REQUIRED: 'Review Required',
  SECURITY_ALERT: 'Security Alert',
};

class InstitutionEmailService {
  private resend: Resend;
  private fromAddress: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    this.resend = new Resend(apiKey);
    this.fromAddress = process.env.RESEND_FROM_ADDRESS || 'notifications@easyescrow.ai';
  }

  async sendNotificationEmail(params: SendNotificationEmailParams): Promise<void> {
    const { to, recipientName, type, title, message, escrowId, metadata } = params;

    const subjectPrefix = SUBJECT_PREFIX[type] || 'Notification';
    const subject = `[EasyEscrow] ${subjectPrefix}: ${title}`;

    const html = this.buildEmailHtml({
      recipientName,
      title,
      message,
      escrowId,
      type,
      metadata,
    });

    await this.resend.emails.send({
      from: this.fromAddress,
      to,
      subject,
      html,
    });
  }

  private buildEmailHtml(params: {
    recipientName: string;
    title: string;
    message: string;
    escrowId?: string;
    type: NotificationType;
    metadata?: Record<string, unknown>;
  }): string {
    const { recipientName, title, message, escrowId, metadata } = params;

    const escrowLine = escrowId
      ? `<p style="color:#666;font-size:13px;">Escrow ID: ${escrowId}</p>`
      : '';

    const metadataLines =
      metadata && Object.keys(metadata).length > 0
        ? `<table style="margin-top:16px;font-size:13px;color:#444;border-collapse:collapse;">
            ${Object.entries(metadata)
              .filter(([, v]) => v !== null && v !== undefined)
              .map(
                ([k, v]) =>
                  `<tr><td style="padding:4px 12px 4px 0;font-weight:600;">${k}</td><td style="padding:4px 0;">${v}</td></tr>`
              )
              .join('')}
           </table>`
        : '';

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background:#fff;border-radius:8px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <div style="border-bottom:2px solid #2563eb;padding-bottom:16px;margin-bottom:24px;">
        <h2 style="margin:0;color:#1e293b;font-size:20px;">EasyEscrow.ai</h2>
      </div>
      <p style="color:#374151;margin:0 0 8px;">Hi ${recipientName},</p>
      <h3 style="color:#1e293b;margin:16px 0 8px;">${title}</h3>
      <p style="color:#4b5563;line-height:1.6;">${message}</p>
      ${escrowLine}
      ${metadataLines}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">
        This is an automated notification from EasyEscrow.ai. You can manage your notification preferences in your account settings.
      </p>
    </div>
  </div>
</body>
</html>`;
  }
}

let instance: InstitutionEmailService | null = null;

export function getEmailService(): InstitutionEmailService {
  if (!instance) {
    instance = new InstitutionEmailService();
  }
  return instance;
}
