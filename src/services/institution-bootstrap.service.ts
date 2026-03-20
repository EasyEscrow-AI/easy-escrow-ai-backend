/**
 * Institution Bootstrap Service
 *
 * Aggregates all app data needed after login into a single response:
 * - Client profile (sanitized)
 * - Client settings
 * - Accounts (with notification prefs)
 * - Wallets
 * - Approved tokens (AMINA whitelist)
 * - Active corridors
 * - Compliance thresholds
 * - Unread notification count
 * - System status (pause state)
 * - All enums/presets for form dropdowns
 */

import { prisma } from '../config/database';
import { getComplianceService } from './compliance.service';
import { getInstitutionEscrowConfig } from '../config/institution-escrow.config';

export class InstitutionBootstrapService {
  async getBootstrapData(clientId: string) {
    // Parallel-fetch all data the frontend needs
    const [
      client,
      settings,
      wallets,
      accounts,
      approvedTokens,
      corridors,
      complianceThresholds,
      unreadCount,
      systemPause,
    ] = await Promise.all([
      prisma.institutionClient.findUnique({
        where: { id: clientId },
      }),
      prisma.institutionClientSettings.findUnique({
        where: { clientId },
      }),
      prisma.institutionWallet.findMany({
        where: { clientId },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.institutionAccount.findMany({
        where: { clientId, isActive: true },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.institutionApprovedToken.findMany({
        where: { isActive: true, aminaApproved: true },
      }),
      prisma.institutionCorridor.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { code: 'asc' },
      }),
      getComplianceService().getComplianceThresholds(),
      prisma.institutionNotification.count({
        where: { clientId, isRead: false },
      }),
      prisma.systemSetting.findUnique({
        where: { key: 'institution.escrow.paused' },
      }),
    ]);

    if (!client) {
      throw new Error('Client not found');
    }

    // Sanitize client (remove passwordHash)
    const { passwordHash, ...sanitizedClient } = client as any;

    const escrowConfig = getInstitutionEscrowConfig();

    return {
      client: sanitizedClient,
      settings: settings || {},
      wallets,
      accounts,
      approvedTokens: approvedTokens.map((t) => ({
        symbol: t.symbol,
        name: t.name,
        mintAddress: t.mintAddress,
        decimals: t.decimals,
        issuer: t.issuer,
        jurisdiction: t.jurisdiction,
        chain: t.chain,
        isDefault: t.isDefault,
      })),
      corridors: corridors.map((c) => ({
        code: c.code,
        sourceCountry: c.sourceCountry,
        destCountry: c.destCountry,
        minAmount: Number(c.minAmount),
        maxAmount: Number(c.maxAmount),
        dailyLimit: Number(c.dailyLimit),
        monthlyLimit: Number(c.monthlyLimit),
        requiredDocuments: c.requiredDocuments,
        riskLevel: c.riskLevel,
      })),
      compliance: {
        thresholds: complianceThresholds,
      },
      notifications: {
        unreadCount,
      },
      system: {
        paused: systemPause?.value === true || (systemPause?.value as any)?.paused === true,
        escrowLimits: {
          minUsdc: escrowConfig.minUsdc,
          maxUsdc: escrowConfig.maxUsdc,
          defaultExpiryHours: escrowConfig.defaultExpiryHours,
          feeBps: parseInt(process.env.INSTITUTION_ESCROW_FEE_BPS || '20', 10),
        },
      },
      enums: {
        escrowStatus: [
          'DRAFT', 'CREATED', 'FUNDED', 'COMPLIANCE_HOLD', 'RELEASING',
          'RELEASED', 'INSUFFICIENT_FUNDS', 'COMPLETE', 'CANCELLING',
          'CANCELLED', 'EXPIRED', 'FAILED',
        ],
        conditionType: ['ADMIN_RELEASE', 'TIME_LOCK', 'COMPLIANCE_CHECK'],
        clientTier: ['STANDARD', 'PREMIUM', 'ENTERPRISE'],
        clientStatus: ['ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'],
        documentType: ['INVOICE', 'CONTRACT', 'SHIPPING_DOC', 'LETTER_OF_CREDIT', 'OTHER'],
        entityType: [
          'CORPORATION', 'LLC', 'PARTNERSHIP', 'SOLE_PROPRIETORSHIP',
          'TRUST', 'FOUNDATION', 'COOPERATIVE', 'NON_PROFIT', 'GOVERNMENT', 'OTHER',
        ],
        kybStatus: ['NOT_STARTED', 'PENDING', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED'],
        riskRating: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNRATED'],
        regulatoryStatus: ['REGULATED', 'UNREGULATED', 'EXEMPT', 'PENDING_LICENSE', 'SUSPENDED'],
        sanctionsStatus: ['CLEAR', 'FLAGGED', 'BLOCKED', 'PENDING_REVIEW'],
        walletCustodyType: ['SELF_CUSTODY', 'THIRD_PARTY', 'MPC', 'MULTISIG', 'EXCHANGE'],
        accountType: ['TREASURY', 'OPERATIONS', 'SETTLEMENT', 'COLLATERAL', 'GENERAL'],
        accountVerificationStatus: ['PENDING', 'VERIFIED', 'SUSPENDED', 'REJECTED'],
        approvalMode: ['AUTO', 'SINGLE_APPROVAL', 'MULTI_APPROVAL'],
        corridorRiskLevel: ['LOW', 'MEDIUM', 'HIGH'],
        notificationType: [
          'ESCROW_CREATED', 'ESCROW_FUNDED', 'DEPOSIT_CONFIRMED', 'ESCROW_RELEASED',
          'SETTLEMENT_COMPLETE', 'ESCROW_CANCELLED', 'ESCROW_EXPIRED',
          'ESCROW_COMPLIANCE_HOLD', 'COMPLIANCE_CHECK_FAILED',
          'COMPLIANCE_REVIEW_REQUIRED', 'SECURITY_ALERT', 'KYC_APPROVED',
          'KYC_REJECTED', 'ACCOUNT_SUSPENDED', 'ACCOUNT_REACTIVATED',
        ],
        notificationPriority: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        employeeCountRange: [
          'RANGE_1_10', 'RANGE_11_50', 'RANGE_51_200', 'RANGE_201_500',
          'RANGE_501_1000', 'RANGE_1001_5000', 'RANGE_5001_PLUS',
        ],
        annualRevenueRange: [
          'UNDER_1M', 'RANGE_1M_10M', 'RANGE_10M_50M', 'RANGE_50M_100M',
          'RANGE_100M_500M', 'RANGE_500M_1B', 'OVER_1B',
        ],
      },
    };
  }
}

let instance: InstitutionBootstrapService | null = null;
export function getInstitutionBootstrapService(): InstitutionBootstrapService {
  if (!instance) {
    instance = new InstitutionBootstrapService();
  }
  return instance;
}
