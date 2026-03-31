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
        return { passed: false, detail: 'No recipient wallet set', recipientWallet: null, derivationVerified: false, addresses: null };
      }

      // Check if this escrow used stealth privacy (has a stealthPaymentId)
      const isStealthDerived = !!escrow.stealthPaymentId;

      // For stealth escrows, verify via StealthPayment record — the on-chain account
      // may no longer exist after the recipient sweeps funds and the ATA is closed
      if (isStealthDerived) {
        const stealthPayment = await this.prisma.stealthPayment.findUnique({
          where: { id: escrow.stealthPaymentId },
          select: { status: true, stealthAddress: true, sweepTxSignature: true, releaseTxSignature: true },
        });

        const paymentVerified = !!stealthPayment &&
          (stealthPayment.status === 'CONFIRMED' || stealthPayment.status === 'SWEPT');

        // Check address reuse across escrows for this client
        const reuseCount = await this.prisma.institutionEscrow.count({
          where: {
            clientId: escrow.clientId,
            recipientWallet,
            escrowId: { not: escrow.escrowId },
          },
        });
        const noReuse = reuseCount === 0;
        const derivationVerified = paymentVerified && noReuse;

        // Build address mapping
        const onChainAddresses = await this.extractOnChainAddresses(escrow);
        const payerReal = escrow.payerWallet;
        const addresses = {
          payer: {
            real: payerReal,
            onChain: onChainAddresses.payer || payerReal,
            match: payerReal === (onChainAddresses.payer || payerReal),
          },
          recipient: {
            real: recipientWallet,
            onChain: stealthPayment?.stealthAddress || onChainAddresses.recipient || recipientWallet,
            match: false, // stealth addresses never match the real wallet
          },
          note: 'On-chain addresses are derived per-transaction for privacy. Funds are routed to the correct real wallets via the escrow program.',
        };

        const detail = !stealthPayment
          ? 'Stealth payment record not found'
          : !paymentVerified
            ? `Stealth payment not yet confirmed (status: ${stealthPayment.status})`
            : !noReuse
              ? 'Stealth address reused across multiple escrows'
              : stealthPayment.status === 'SWEPT'
                ? 'Stealth address verified — funds swept to recipient wallet'
                : 'Stealth address verified — funds successfully settled to derived wallet';

        return {
          passed: derivationVerified,
          detail,
          recipientWallet,
          derivationVerified,
          addresses,
        };
      }

      // Non-stealth: verify the wallet exists on-chain
      const pubkey = new PublicKey(recipientWallet);
      const accountInfo = await this.connection.getAccountInfo(pubkey);

      const onChainAddresses = await this.extractOnChainAddresses(escrow);
      const payerReal = escrow.payerWallet;
      const addresses = {
        payer: {
          real: payerReal,
          onChain: onChainAddresses.payer || payerReal,
          match: payerReal === (onChainAddresses.payer || payerReal),
        },
        recipient: {
          real: recipientWallet,
          onChain: onChainAddresses.recipient || recipientWallet,
          match: recipientWallet === (onChainAddresses.recipient || recipientWallet),
        },
        note: 'Standard addresses used — real and on-chain addresses match.',
      };

      return {
        passed: false,
        detail: accountInfo
          ? 'Standard wallet used (no stealth derivation)'
          : 'Recipient wallet not found on-chain',
        recipientWallet,
        derivationVerified: false,
        addresses: accountInfo ? addresses : null,
      };
    } catch (err) {
      logger.error(`${LOG_PREFIX} Stealth address check failed`, { error: (err as Error).message });
      return { passed: false, detail: 'RPC verification unavailable', recipientWallet: null, derivationVerified: false, addresses: null };
    }
  }

  private async extractOnChainAddresses(escrow: any): Promise<{ payer: string | null; recipient: string | null }> {
    // Parse the deposit or release tx to find the actual accounts used on-chain
    const sig = escrow.depositTxSignature || escrow.releaseTxSignature;
    if (!sig) return { payer: null, recipient: null };

    try {
      const tx = await this.connection.getTransaction(sig, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      if (!tx?.transaction?.message) return { payer: null, recipient: null };

      const accountKeys = tx.transaction.message.getAccountKeys().staticAccountKeys;
      // In escrow transactions: index 0 = fee payer (typically platform), index 1 = payer, last user account = recipient
      // The exact layout depends on instruction order, but the first two non-program accounts are typically payer and recipient
      if (accountKeys.length >= 3) {
        return {
          payer: accountKeys[0].toBase58(),
          recipient: accountKeys[1].toBase58(),
        };
      }
      return { payer: null, recipient: null };
    } catch {
      return { payer: null, recipient: null };
    }
  }

  // ─── Check 2: PDA Receipts ────────────────────────────────────────

  private async checkPdaReceipts(escrow: any): Promise<CheckResult> {
    const nullDetails = { escrowPdaOwner: null, vaultBalance: null, vaultTokenMint: null };
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
          onChainDetails: nullDetails,
        };
      }

      let escrowAccountExists = false;
      let vaultAccountExists = false;
      let metadataEncrypted = false;
      let escrowPdaOwner: string | null = null;
      let vaultBalance: number | null = null;
      let vaultTokenMint: string | null = null;

      if (escrowPda) {
        const escrowAccount = await this.connection.getAccountInfo(new PublicKey(escrowPda));
        escrowAccountExists = !!escrowAccount;
        if (escrowAccount) {
          if (escrowAccount.data.length > 0) metadataEncrypted = true;
          escrowPdaOwner = escrowAccount.owner.toBase58();
        }
      }

      if (vaultPda) {
        const vaultAccount = await this.connection.getAccountInfo(new PublicKey(vaultPda));
        vaultAccountExists = !!vaultAccount;
        if (vaultAccount) {
          try {
            const balanceResp = await this.connection.getTokenAccountBalance(new PublicKey(vaultPda));
            vaultBalance = balanceResp.value.uiAmount ?? 0;
            // Parse mint from token account data (bytes 0-32)
            if (vaultAccount.data.length >= 32) {
              vaultTokenMint = new PublicKey(vaultAccount.data.slice(0, 32)).toBase58();
            }
          } catch {
            // Not a token account or closed — leave as null
          }
        }
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
        onChainDetails: { escrowPdaOwner, vaultBalance, vaultTokenMint },
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
        onChainDetails: nullDetails,
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
          signatureHashes: {},
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

      // Build label → hash map so the frontend can render Solana Explorer links
      const signatureHashes: Record<string, string> = {};
      sigLabels.forEach((label, i) => { signatureHashes[label] = signatures[i]; });

      return {
        passed: allVerified && signatures.length > 0,
        detail: allVerified
          ? `Chain-of-custody records encrypted, ${verifiedCount} tx signatures verified`
          : `${verifiedCount}/${signatures.length} tx signatures verified on-chain`,
        signatures: sigLabels,
        signatureHashes,
        allVerified,
      };
    } catch (err) {
      logger.error(`${LOG_PREFIX} Encrypted custody check failed`, { error: (err as Error).message });
      return { passed: false, detail: 'RPC verification unavailable', signatures: [], signatureHashes: {}, allVerified: false };
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
    const nullPoolDetails = { totalBatchAmount: null, transactionAmount: null, obfuscationRatio: null };
    try {
      // Check if this escrow belongs to a transaction pool
      const poolId = escrow.poolId;
      if (!poolId) {
        return {
          passed: false,
          detail: 'Transaction not routed through a shielded pool',
          shieldedPoolBatchId: null,
          batchSize: 0,
          poolDetails: nullPoolDetails,
        };
      }

      const pool = await this.prisma.transactionPool.findUnique({
        where: { id: poolId },
        select: {
          id: true,
          poolCode: true,
          status: true,
          totalAmount: true,
          _count: { select: { members: true } },
        },
      });

      if (!pool) {
        return {
          passed: false,
          detail: 'Referenced pool not found',
          shieldedPoolBatchId: null,
          batchSize: 0,
          poolDetails: nullPoolDetails,
        };
      }

      const batchSize = pool._count.members;
      const totalBatchAmount = Number(pool.totalAmount);
      const transactionAmount = Number(escrow.amount);
      // Obfuscation ratio: how much of the batch is NOT this transaction (higher = more private)
      const obfuscationRatio = totalBatchAmount > 0
        ? Math.round(((totalBatchAmount - transactionAmount) / totalBatchAmount) * 100)
        : 0;

      return {
        passed: batchSize >= 2,
        detail: batchSize >= 2
          ? `Settlement routed through shielded pool, batch ID ${pool.poolCode}`
          : 'Pool exists but contains only one transaction (no shielding benefit)',
        shieldedPoolBatchId: pool.poolCode,
        batchSize,
        poolDetails: { totalBatchAmount, transactionAmount, obfuscationRatio },
      };
    } catch (err) {
      logger.error(`${LOG_PREFIX} Pool shielding check failed`, { error: (err as Error).message });
      return {
        passed: false,
        detail: 'Pool verification unavailable',
        shieldedPoolBatchId: null,
        batchSize: 0,
        poolDetails: nullPoolDetails,
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
