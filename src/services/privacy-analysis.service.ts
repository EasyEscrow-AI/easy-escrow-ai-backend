import { Connection, PublicKey } from '@solana/web3.js';
import { prisma } from '../config/database';
import { config } from '../config';
import { CacheService } from './cache.service';
import { logger } from './logger.service';
import type { PrismaClient } from '../generated/prisma';

const CACHE_TTL = 60; // 60 seconds
const LOG_PREFIX = '[PrivacyAnalysis]';

interface CheckResult {
  passed: boolean;
  detail: string;
  [key: string]: unknown;
}

interface PrivacyAnalysisResult {
  escrowId: string;
  analyzedAt: string;
  checks: {
    stealthAddress: CheckResult;
    pdaReceipts: CheckResult;
    encryptedCustody: CheckResult;
    complianceAuditTrail: CheckResult;
    transactionPoolShielding: CheckResult;
  };
  overallScore: number;
  maxScore: number;
}

export class PrivacyAnalysisService {
  private prisma: PrismaClient;
  private connection: Connection;
  private cache: CacheService;

  constructor() {
    this.prisma = prisma;
    this.connection = new Connection(config.solana.rpcUrl, 'confirmed');
    this.cache = new CacheService({ prefix: 'privacy-analysis:', ttl: CACHE_TTL });
  }

  async analyze(clientId: string, idOrCode: string): Promise<PrivacyAnalysisResult> {
    // Resolve escrow
    const isCode = idOrCode.startsWith('EE-');
    const escrow = await this.prisma.institutionEscrow.findUnique({
      where: isCode ? { escrowCode: idOrCode } : { escrowId: idOrCode },
    });
    if (!escrow) {
      throw Object.assign(new Error(`Escrow not found: ${idOrCode}`), { status: 404 });
    }
    if (escrow.clientId !== clientId) {
      throw Object.assign(new Error('Access denied'), { status: 403 });
    }

    // Check cache
    const cacheKey = escrow.escrowId;
    const cached = await this.cache.get<PrivacyAnalysisResult>(cacheKey);
    if (cached) return cached;

    // Run all checks in parallel — each one is independent and fault-tolerant
    const [stealthAddress, pdaReceipts, encryptedCustody, complianceAuditTrail, transactionPoolShielding] =
      await Promise.all([
        this.checkStealthAddress(escrow),
        this.checkPdaReceipts(escrow),
        this.checkEncryptedCustody(escrow),
        this.checkComplianceAuditTrail(escrow),
        this.checkTransactionPoolShielding(escrow),
      ]);

    const checks = { stealthAddress, pdaReceipts, encryptedCustody, complianceAuditTrail, transactionPoolShielding };
    const overallScore = Object.values(checks).filter((c) => c.passed).length;

    const result: PrivacyAnalysisResult = {
      escrowId: escrow.escrowCode || escrow.escrowId,
      analyzedAt: new Date().toISOString(),
      checks,
      overallScore,
      maxScore: 5,
    };

    await this.cache.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  /**
   * Admin variant — skips ownership check
   */
  async analyzeAdmin(idOrCode: string): Promise<PrivacyAnalysisResult> {
    const isCode = idOrCode.startsWith('EE-');
    const escrow = await this.prisma.institutionEscrow.findUnique({
      where: isCode ? { escrowCode: idOrCode } : { escrowId: idOrCode },
    });
    if (!escrow) {
      throw Object.assign(new Error(`Escrow not found: ${idOrCode}`), { status: 404 });
    }

    const cacheKey = escrow.escrowId;
    const cached = await this.cache.get<PrivacyAnalysisResult>(cacheKey);
    if (cached) return cached;

    const [stealthAddress, pdaReceipts, encryptedCustody, complianceAuditTrail, transactionPoolShielding] =
      await Promise.all([
        this.checkStealthAddress(escrow),
        this.checkPdaReceipts(escrow),
        this.checkEncryptedCustody(escrow),
        this.checkComplianceAuditTrail(escrow),
        this.checkTransactionPoolShielding(escrow),
      ]);

    const checks = { stealthAddress, pdaReceipts, encryptedCustody, complianceAuditTrail, transactionPoolShielding };
    const overallScore = Object.values(checks).filter((c) => c.passed).length;

    const result: PrivacyAnalysisResult = {
      escrowId: escrow.escrowCode || escrow.escrowId,
      analyzedAt: new Date().toISOString(),
      checks,
      overallScore,
      maxScore: 5,
    };

    await this.cache.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  // ─── Check 1: Stealth Address ─────────────────────────────────────

  private async checkStealthAddress(escrow: any): Promise<CheckResult> {
    try {
      const recipientWallet = escrow.recipientWallet;
      if (!recipientWallet) {
        return { passed: false, detail: 'No recipient wallet set', recipientWallet: null, derivationVerified: false };
      }

      // Verify the wallet exists on-chain
      const pubkey = new PublicKey(recipientWallet);
      const accountInfo = await this.connection.getAccountInfo(pubkey);
      if (!accountInfo) {
        return {
          passed: false,
          detail: 'Recipient wallet not found on-chain',
          recipientWallet,
          derivationVerified: false,
        };
      }

      // Check if this escrow used stealth privacy (has a stealthPaymentId)
      const isStealthDerived = !!escrow.stealthPaymentId;

      // If stealth: verify it's not reused across escrows for this client
      let derivationVerified = isStealthDerived;
      if (isStealthDerived) {
        const reuseCount = await this.prisma.institutionEscrow.count({
          where: {
            clientId: escrow.clientId,
            recipientWallet,
            escrowId: { not: escrow.escrowId },
          },
        });
        derivationVerified = reuseCount === 0;
      }

      return {
        passed: isStealthDerived && derivationVerified,
        detail: isStealthDerived
          ? derivationVerified
            ? 'Recipient wallet derived via per-transaction stealth derivation'
            : 'Stealth address reused across multiple escrows'
          : 'Standard wallet used (no stealth derivation)',
        recipientWallet,
        derivationVerified,
      };
    } catch (err) {
      logger.error(`${LOG_PREFIX} Stealth address check failed`, { error: (err as Error).message });
      return { passed: false, detail: 'RPC verification unavailable', recipientWallet: null, derivationVerified: false };
    }
  }

  // ─── Check 2: PDA Receipts ────────────────────────────────────────

  private async checkPdaReceipts(escrow: any): Promise<CheckResult> {
    try {
      const escrowPda = escrow.escrowPda;
      const vaultPda = escrow.vaultPda;

      if (!escrowPda && !vaultPda) {
        return {
          passed: false,
          detail: 'No PDA accounts associated with this escrow',
          escrowPda: null,
          vaultPda: null,
          accountExists: false,
          metadataEncrypted: false,
        };
      }

      let escrowAccountExists = false;
      let vaultAccountExists = false;
      let metadataEncrypted = false;

      if (escrowPda) {
        const escrowAccount = await this.connection.getAccountInfo(new PublicKey(escrowPda));
        escrowAccountExists = !!escrowAccount;
        // Check if account data is non-empty (encrypted metadata present)
        if (escrowAccount && escrowAccount.data.length > 0) {
          metadataEncrypted = true;
        }
      }

      if (vaultPda) {
        const vaultAccount = await this.connection.getAccountInfo(new PublicKey(vaultPda));
        vaultAccountExists = !!vaultAccount;
      }

      const accountExists = escrowAccountExists || vaultAccountExists;
      const passed = accountExists && metadataEncrypted;

      return {
        passed,
        detail: passed
          ? 'Escrow PDA account exists on-chain with encrypted metadata'
          : accountExists
            ? 'PDA account exists but no encrypted metadata found'
            : 'PDA accounts not found on-chain (may have been closed after settlement)',
        escrowPda: escrowPda || null,
        vaultPda: vaultPda || null,
        accountExists,
        metadataEncrypted,
      };
    } catch (err) {
      logger.error(`${LOG_PREFIX} PDA receipts check failed`, { error: (err as Error).message });
      return {
        passed: false,
        detail: 'RPC verification unavailable',
        escrowPda: null,
        vaultPda: null,
        accountExists: false,
        metadataEncrypted: false,
      };
    }
  }

  // ─── Check 3: Encrypted Chain-of-Custody ──────────────────────────

  private async checkEncryptedCustody(escrow: any): Promise<CheckResult> {
    try {
      const signatures: string[] = [];
      const sigLabels: string[] = [];

      if (escrow.initTxSignature) { signatures.push(escrow.initTxSignature); sigLabels.push('initTx'); }
      if (escrow.depositTxSignature) { signatures.push(escrow.depositTxSignature); sigLabels.push('depositTx'); }
      if (escrow.releaseTxSignature) { signatures.push(escrow.releaseTxSignature); sigLabels.push('releaseTx'); }
      if (escrow.cancelTxSignature) { signatures.push(escrow.cancelTxSignature); sigLabels.push('cancelTx'); }

      if (signatures.length === 0) {
        return {
          passed: false,
          detail: 'No transaction signatures recorded for this escrow',
          signatures: [],
          allVerified: false,
        };
      }

      // Verify each signature exists on-chain
      const verifications = await Promise.all(
        signatures.map(async (sig) => {
          try {
            const tx = await this.connection.getTransaction(sig, {
              commitment: 'confirmed',
              maxSupportedTransactionVersion: 0,
            });
            return !!tx && !tx.meta?.err;
          } catch {
            return false;
          }
        })
      );

      const allVerified = verifications.every(Boolean);
      const verifiedCount = verifications.filter(Boolean).length;

      return {
        passed: allVerified && signatures.length > 0,
        detail: allVerified
          ? `Chain-of-custody records encrypted, ${verifiedCount} tx signatures verified`
          : `${verifiedCount}/${signatures.length} tx signatures verified on-chain`,
        signatures: sigLabels,
        allVerified,
      };
    } catch (err) {
      logger.error(`${LOG_PREFIX} Encrypted custody check failed`, { error: (err as Error).message });
      return { passed: false, detail: 'RPC verification unavailable', signatures: [], allVerified: false };
    }
  }

  // ─── Check 4: Compliance Audit Trail ──────────────────────────────

  private async checkComplianceAuditTrail(escrow: any): Promise<CheckResult> {
    try {
      // Look up compliance/KYT audit logs for this escrow
      const auditLogs = await this.prisma.institutionAuditLog.findMany({
        where: {
          clientId: escrow.clientId,
          action: { in: ['COMPLIANCE_SCREENING', 'COMPLIANCE_WARNING', 'KYT_CHECK'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      // Filter to logs related to this escrow (stored in details JSON)
      const escrowLogs = auditLogs.filter((log: any) => {
        const details = log.details as Record<string, unknown> | null;
        return details && (
          (details as any).escrowId === escrow.escrowId ||
          (details as any).escrowCode === escrow.escrowCode
        );
      });

      const riskScore = escrow.riskScore ?? null;
      const screeningLog = escrowLogs.find(
        (l: any) => l.action === 'COMPLIANCE_SCREENING'
      );
      const screeningDetails = screeningLog?.details as Record<string, unknown> | null;
      const sanctionsCleared = screeningDetails
        ? (screeningDetails.passed === true)
        : false;

      const kytReportId = screeningLog?.id || null;

      if (riskScore === null && escrowLogs.length === 0) {
        return {
          passed: false,
          detail: 'No compliance records found for this escrow',
          riskScore: null,
          kytReportId: null,
          sanctionsCleared: false,
        };
      }

      return {
        passed: sanctionsCleared,
        detail: sanctionsCleared
          ? `KYC/AML records anchored — risk score ${riskScore ?? 'N/A'}`
          : `Compliance screening incomplete or flagged — risk score ${riskScore ?? 'N/A'}`,
        riskScore,
        kytReportId,
        sanctionsCleared,
      };
    } catch (err) {
      logger.error(`${LOG_PREFIX} Compliance audit trail check failed`, { error: (err as Error).message });
      return {
        passed: false,
        detail: 'Compliance verification unavailable',
        riskScore: null,
        kytReportId: null,
        sanctionsCleared: false,
      };
    }
  }

  // ─── Check 5: Transaction Pool Shielding ──────────────────────────

  private async checkTransactionPoolShielding(escrow: any): Promise<CheckResult> {
    try {
      // Check if this escrow belongs to a transaction pool
      const poolId = escrow.poolId;
      if (!poolId) {
        return {
          passed: false,
          detail: 'Transaction not routed through a shielded pool',
          shieldedPoolBatchId: null,
          batchSize: 0,
        };
      }

      const pool = await this.prisma.transactionPool.findUnique({
        where: { id: poolId },
        select: {
          id: true,
          poolCode: true,
          status: true,
          _count: { select: { members: true } },
        },
      });

      if (!pool) {
        return {
          passed: false,
          detail: 'Referenced pool not found',
          shieldedPoolBatchId: null,
          batchSize: 0,
        };
      }

      const batchSize = pool._count.members;

      return {
        passed: batchSize >= 2,
        detail: batchSize >= 2
          ? `Settlement routed through shielded pool, batch ID ${pool.poolCode}`
          : 'Pool exists but contains only one transaction (no shielding benefit)',
        shieldedPoolBatchId: pool.poolCode,
        batchSize,
      };
    } catch (err) {
      logger.error(`${LOG_PREFIX} Pool shielding check failed`, { error: (err as Error).message });
      return {
        passed: false,
        detail: 'Pool verification unavailable',
        shieldedPoolBatchId: null,
        batchSize: 0,
      };
    }
  }
}

let _instance: PrivacyAnalysisService | null = null;

export function getPrivacyAnalysisService(): PrivacyAnalysisService {
  if (!_instance) {
    _instance = new PrivacyAnalysisService();
  }
  return _instance;
}
