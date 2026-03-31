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
import { isTransactionPoolsEnabled } from '../utils/featureFlags';
import { getInstitutionEscrowConfig } from '../config/institution-escrow.config';
import {
  InstitutionEscrowStatus,
  InstitutionConditionType,
  ClientTier,
  ClientStatus,
  DocumentType,
  EntityType,
  KybStatus,
  RiskRating,
  RegulatoryStatus,
  SanctionsStatus,
  WalletCustodyType,
  InstitutionAccountType,
  AccountVerificationStatus,
  ApprovalMode,
  EmployeeCountRange,
  AnnualRevenueRange,
  NotificationType,
  NotificationPriority,
} from '../generated/prisma';

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
      pools: {
        enabled: isTransactionPoolsEnabled(),
        maxMembers: parseInt(process.env.POOL_MAX_MEMBERS || '50', 10),
        defaultExpiryHours: parseInt(process.env.POOL_DEFAULT_EXPIRY_HOURS || '24', 10),
      },
      enums: {
        escrowStatus: Object.values(InstitutionEscrowStatus),
        conditionType: Object.values(InstitutionConditionType),
        clientTier: Object.values(ClientTier),
        clientStatus: Object.values(ClientStatus),
        documentType: Object.values(DocumentType),
        entityType: Object.values(EntityType),
        kybStatus: Object.values(KybStatus),
        riskRating: Object.values(RiskRating),
        regulatoryStatus: Object.values(RegulatoryStatus),
        sanctionsStatus: Object.values(SanctionsStatus),
        walletCustodyType: Object.values(WalletCustodyType),
        accountType: Object.values(InstitutionAccountType),
        accountVerificationStatus: Object.values(AccountVerificationStatus),
        approvalMode: Object.values(ApprovalMode),
        corridorRiskLevel: ['LOW', 'MEDIUM', 'HIGH'],
        releaseMode: ['manual', 'ai'],
        aiReleaseConditions: [
          { value: 'legal_compliance', label: 'All legal compliance checks pass', required: true },
          { value: 'invoice_amount_match', label: 'Invoice amount matches exactly', required: false },
          { value: 'client_info_match', label: 'Client information matches exactly', required: false },
          { value: 'document_signature_verified', label: 'Document signature is verified (via DocuSign)', required: false },
        ],
        notificationType: Object.values(NotificationType),
        notificationPriority: Object.values(NotificationPriority),
        employeeCountRange: Object.values(EmployeeCountRange),
        annualRevenueRange: Object.values(AnnualRevenueRange),
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
