/**
 * CDP Settlement Authority Service
 *
 * Wraps the Coinbase Developer Platform (CDP) SDK to provide an independent
 * settlement authority for institution escrows. The CDP wallet signs release/cancel
 * transactions after its policy engine validates the operation.
 *
 * The on-chain PDA already has a `settlement_authority: Pubkey` field — when CDP
 * is enabled, we set it to the CDP wallet pubkey instead of the admin pubkey.
 * CDP signs through its TEE-secured policy engine (no program changes needed).
 *
 * NOTE: @coinbase/cdp-sdk is loaded lazily (dynamic require in constructor) because
 * it depends on ESM-only packages (jose) that break ts-node CJS test runners.
 */

import { PublicKey } from '@solana/web3.js';
import { getInstitutionEscrowConfig } from '../config/institution-escrow.config';

export class CdpSettlementService {
  private client: any;
  private account: any | null = null;
  private cachedPublicKey: PublicKey | null = null;
  private accountName: string;

  constructor() {
    const cfg = getInstitutionEscrowConfig();

    if (!cfg.cdp.enabled) {
      throw new Error('CDP settlement authority is not enabled');
    }

    // Lazy-load @coinbase/cdp-sdk to avoid ESM-only dependency (jose) breaking
    // the CJS test runner. The SDK is only loaded when CDP is actually enabled.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { CdpClient } = require('@coinbase/cdp-sdk');

    this.client = new CdpClient({
      apiKeyId: cfg.cdp.apiKeyId,
      apiKeySecret: cfg.cdp.apiKeySecret,
      walletSecret: cfg.cdp.walletSecret,
    });
    this.accountName = cfg.cdp.accountName;

    console.log('[CdpSettlementService] Initialized with account name:', this.accountName);
  }

  /**
   * Get or create the named Solana account via CDP SDK.
   * Caches the account after first call.
   */
  async getOrCreateAccount(): Promise<any> {
    if (this.account) return this.account;

    this.account = await this.client.solana.getOrCreateAccount({
      name: this.accountName,
    });

    console.log(
      '[CdpSettlementService] Account ready:',
      this.account.address
    );
    return this.account;
  }

  /**
   * Returns the CDP wallet's Solana PublicKey.
   * Caches after first derivation.
   */
  async getPublicKey(): Promise<PublicKey> {
    if (this.cachedPublicKey) return this.cachedPublicKey;

    const account = await this.getOrCreateAccount();
    this.cachedPublicKey = new PublicKey(account.address);
    return this.cachedPublicKey;
  }

  /**
   * Send a partially-signed transaction to CDP for authority signature.
   * The transaction must already be partially signed by the admin (fee payer).
   * CDP's policy engine validates the transaction before signing.
   *
   * @param serializedTx - The partially-signed transaction as a Buffer
   * @returns The fully-signed transaction as a Buffer
   */
  async signTransaction(serializedTx: Buffer): Promise<Buffer> {
    const account = await this.getOrCreateAccount();

    const result = await account.signTransaction({
      transaction: serializedTx,
    });

    return Buffer.from(result.signedTransaction);
  }

  /**
   * Check if the CDP service is reachable and the account is accessible.
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.getOrCreateAccount();
      return true;
    } catch (error) {
      console.warn('[CdpSettlementService] Health check failed:', error);
      return false;
    }
  }
}

// Singleton
let _cdpService: CdpSettlementService | null = null;

export function getCdpSettlementService(): CdpSettlementService {
  if (!_cdpService) {
    _cdpService = new CdpSettlementService();
  }
  return _cdpService;
}

export function resetCdpSettlementService(): void {
  _cdpService = null;
}
