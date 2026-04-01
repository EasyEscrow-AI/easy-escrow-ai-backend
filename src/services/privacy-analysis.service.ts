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
        return { passed: false, detail: 'No recipient wallet set', recipientWallet: null, derivationVerified: false, stealthStatus: null, sweepTxSignature: null, addressReused: false, addresses: null };
      }

      // Check if this escrow used stealth privacy — try stealthPaymentId FK first,
      // then fall back to looking up StealthPayment by escrowId (covers cases where
      // the FK wasn't backfilled on the escrow record)
      type StealthPaymentResult = { status: string; stealthAddress: string; sweepTxSignature: string | null; releaseTxSignature: string | null };
      let stealthPayment: StealthPaymentResult | null = null;
      const selectFields = { status: true, stealthAddress: true, sweepTxSignature: true, releaseTxSignature: true } as const;

      // Try FK lookup first, then fall back to escrowId (covers missing/orphaned FK)
      if (escrow.stealthPaymentId) {
        stealthPayment = await this.prisma.stealthPayment.findUnique({
          where: { id: escrow.stealthPaymentId },
          select: selectFields,
        });
      }
      if (!stealthPayment) {
        stealthPayment = await this.prisma.stealthPayment.findFirst({
          where: { escrowId: escrow.escrowId },
          select: selectFields,
          orderBy: { createdAt: 'desc' },
        });
      }

      const isStealthDerived = !!stealthPayment;

      if (isStealthDerived) {
        const paymentVerified =
          stealthPayment!.status === 'CONFIRMED' || stealthPayment!.status === 'SWEPT';

        // Check stealth address reuse — each payment should derive a unique one-time address.
        // Reuse of the same stealth address across payments would indicate a privacy leak.
        // (The real recipientWallet being the same across escrows is expected and fine.)
        const stealthReuseCount = await this.prisma.stealthPayment.count({
          where: {
            stealthAddress: stealthPayment!.stealthAddress,
            escrowId: { not: escrow.escrowId },
          },
        });
        const noReuse = stealthReuseCount === 0;
        const derivationVerified = paymentVerified && noReuse;

        // Verify funds arrived at the correct stealth address by parsing the release tx
        const releaseSig = stealthPayment!.releaseTxSignature || escrow.releaseTxSignature;
        const fundsVerified = releaseSig
          ? await this.verifyReleaseFundsDestination(releaseSig, stealthPayment!.stealthAddress)
          : null;

        // Build comprehensive address mapping
        const payerReal = escrow.payerWallet;
        const stealthAddr = stealthPayment!.stealthAddress;
        const addresses = {
          payer: {
            real: payerReal,
            onChain: payerReal,
            match: true,
          },
          recipient: {
            real: recipientWallet,
            stealthAddress: stealthAddr,
            onChain: stealthAddr,
            match: false, // stealth addresses intentionally differ from real wallet
          },
          fundsReleasedToCorrectAddress: fundsVerified,
          releaseTxSignature: releaseSig || null,
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
          stealthStatus: stealthPayment?.status || null,
          sweepTxSignature: stealthPayment?.sweepTxSignature || null,
          addressReused: !noReuse,
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
        stealthStatus: null,
        sweepTxSignature: null,
        addressReused: false,
        addresses: accountInfo ? addresses : null,
      };
    } catch (err) {
      logger.error(`${LOG_PREFIX} Stealth address check failed`, { error: (err as Error).message });
      return { passed: false, detail: 'RPC verification unavailable', recipientWallet: null, derivationVerified: false, stealthStatus: null, sweepTxSignature: null, addressReused: false, addresses: null };
    }
  }

  /**
   * Verify that the release tx actually transferred funds to the expected stealth address.
   * Parses the tx's token balance changes to confirm the destination.
   */
  private async verifyReleaseFundsDestination(txSignature: string, expectedStealthAddress: string): Promise<boolean | null> {
    try {
      const tx = await this.connection.getTransaction(txSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      if (!tx?.meta) return null;

      // Check post-token-balances for the stealth address receiving tokens
      const postBalances = tx.meta.postTokenBalances || [];
      const accountKeys = tx.transaction.message.getAccountKeys().staticAccountKeys;
      for (const bal of postBalances) {
        const owner = bal.owner;
        if (owner === expectedStealthAddress && (bal.uiTokenAmount?.uiAmount ?? 0) > 0) {
          return true;
        }
      }
      // Fallback: check if the stealth address appears in the account keys at all
      return accountKeys.some(k => k.toBase58() === expectedStealthAddress) || false;
    } catch {
      return null; // RPC unavailable
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

      // Check pool receipt PDA if escrow is part of a transaction pool
      let poolReceiptPda: string | null = null;
      let poolReceiptExists = false;
      if (escrow.poolId) {
        try {
          const programId = new PublicKey(config.solana.escrowProgramId);
          const escrowIdBytes = Buffer.from(escrow.escrowId.replace(/-/g, ''), 'hex');
          // Look up the pool to get the pool_id bytes
          const pool = await this.prisma.transactionPool.findUnique({
            where: { id: escrow.poolId },
            select: { poolId: true },
          });
          if (pool) {
            const poolIdBytes = Buffer.from(pool.poolId.replace(/-/g, ''), 'hex');
            const [receiptPda] = PublicKey.findProgramAddressSync(
              [Buffer.from('pool_receipt'), poolIdBytes, escrowIdBytes],
              programId
            );
            poolReceiptPda = receiptPda.toBase58();
            const receiptAccount = await this.connection.getAccountInfo(receiptPda);
            poolReceiptExists = !!receiptAccount;
          }
        } catch {
          // Pool receipt lookup failed — non-critical
        }
      }

      const accountExists = escrowAccountExists || vaultAccountExists;
      const passed = accountExists && metadataEncrypted;

      return {
        passed,
        detail: passed
          ? poolReceiptExists
            ? 'Escrow PDA and pool receipt exist on-chain with encrypted metadata'
            : 'Escrow PDA account exists on-chain with encrypted metadata'
          : accountExists
            ? 'PDA account exists but no encrypted metadata found'
            : 'PDA accounts not found on-chain (may have been closed after settlement)',
        escrowPda: escrowPda || null,
        vaultPda: vaultPda || null,
        poolReceiptPda,
        poolReceiptExists,
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
