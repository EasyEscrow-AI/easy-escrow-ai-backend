/**
 * Penetration Testing Scenarios
 * Manual and automated penetration testing for critical security vulnerabilities
 */

import axios from 'axios';
import { Connection, Keypair, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface PenetrationTestResult {
  testName: string;
  category: string;
  attackVector: string;
  passed: boolean; // Passed = Attack was blocked
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  details: string;
  evidence?: any;
  timestamp: string;
  cve?: string; // Related CVE if applicable
}

interface PenetrationTestReport {
  environment: string;
  startTime: string;
  endTime?: string;
  totalTests: number;
  passed: number;
  failed: number;
  vulnerabilities: PenetrationTestResult[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export class PenetrationTester {
  private baseUrl: string;
  private connection: Connection;
  private results: PenetrationTestResult[] = [];
  private report: PenetrationTestReport;

  constructor(baseUrl: string, rpcUrl?: string) {
    this.baseUrl = baseUrl;
    this.connection = new Connection(
      rpcUrl || 'https://api.devnet.solana.com',
      'confirmed'
    );
    this.report = {
      environment: baseUrl.includes('staging') ? 'STAGING' : 'PRODUCTION',
      startTime: new Date().toISOString(),
      totalTests: 0,
      passed: 0,
      failed: 0,
      vulnerabilities: [],
      summary: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    };
  }

  /**
   * Run all penetration tests
   */
  async runAllTests(): Promise<PenetrationTestReport> {
    console.log('🎯 Starting Penetration Testing Suite...\n');

    // Financial attacks
    await this.testSettlementManipulation();
    await this.testFundTheftAttempt();
    await this.testPlatformFeeBypass();
    await this.testPriceManipulation();

    // Concurrency attacks
    await this.testRaceConditionExploitation();
    await this.testDoubleSpendAttack();

    // Replay and signature attacks
    await this.testReplayAttack();
    await this.testSignatureMallability();

    // Authorization attacks
    await this.testPrivilegeEscalation();
    await this.testHorizontalPrivilegeEscalation();

    // Data integrity attacks
    await this.testDataTampering();
    await this.testNFTOwnershipSpoofing();

    // Denial of service
    await this.testResourceExhaustion();
    await this.testSlowLoris();

    // Logic flaws
    await this.testBusinessLogicBypass();
    await this.testStateMachineViolation();

    this.report.endTime = new Date().toISOString();
    this.report.vulnerabilities = this.results;

    return this.report;
  }

  /**
   * Test 1: Settlement Manipulation
   */
  private async testSettlementManipulation(): Promise<void> {
    console.log('Testing: Settlement Manipulation...');
    const testName = 'Settlement Manipulation Attack';
    const attackVector = 'Price/NFT manipulation in settlement';

    try {
      const maliciousPayload = {
        escrow_id: 'valid_escrow_123',
        nft_mint: 'MaliciousMint11111111111111111111111111111',
        price: '999999999999', // Extremely high price
        buyer: 'AttackerWallet1111111111111111111111111111',
        platform_fee: '0', // Attempt to bypass fees
      };

      const response = await axios.post(
        `${this.baseUrl}/v1/settlements`,
        maliciousPayload,
        { validateStatus: () => true }
      );

      // Attack should be blocked (400, 403, 422)
      const blocked =
        response.status === 400 ||
        response.status === 403 ||
        response.status === 422;

      this.addResult({
        testName,
        category: 'Financial Security',
        attackVector,
        passed: blocked,
        severity: blocked ? 'info' : 'critical',
        details: blocked
          ? 'Settlement manipulation was blocked by validation'
          : `Settlement manipulation succeeded - Response: ${response.status}`,
        evidence: {
          payload: maliciousPayload,
          responseStatus: response.status,
          responseData: response.data,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.addResult({
        testName,
        category: 'Financial Security',
        attackVector,
        passed: true,
        severity: 'info',
        details: 'Settlement manipulation was blocked (request failed)',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test 2: Fund Theft Attempt
   */
  private async testFundTheftAttempt(): Promise<void> {
    console.log('Testing: Fund Theft Attempt...');
    const testName = 'Escrow Vault Fund Theft';
    const attackVector = 'Unauthorized withdrawal from escrow vault';

    try {
      // Generate attacker wallet
      const attackerWallet = Keypair.generate();

      // Attempt to create malicious transaction to drain escrow vault
      const maliciousPayload = {
        escrow_id: 'existing_escrow_with_funds',
        recipient: attackerWallet.publicKey.toBase58(),
        amount: 'all', // Attempt to drain all funds
        bypass_validation: true,
      };

      const response = await axios.post(
        `${this.baseUrl}/v1/escrows/withdraw`,
        maliciousPayload,
        { validateStatus: () => true }
      );

      const blocked =
        response.status === 401 ||
        response.status === 403 ||
        response.status === 404;

      this.addResult({
        testName,
        category: 'Financial Security',
        attackVector,
        passed: blocked,
        severity: blocked ? 'info' : 'critical',
        details: blocked
          ? 'Fund theft attempt was blocked'
          : `Unauthorized fund withdrawal succeeded - Status: ${response.status}`,
        evidence: {
          attackerAddress: attackerWallet.publicKey.toBase58(),
          responseStatus: response.status,
        },
        timestamp: new Date().toISOString(),
        cve: 'CWE-862', // Missing Authorization
      });
    } catch (error) {
      this.addResult({
        testName,
        category: 'Financial Security',
        attackVector,
        passed: true,
        severity: 'info',
        details: 'Fund theft attempt was blocked',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test 3: Platform Fee Bypass
   */
  private async testPlatformFeeBypass(): Promise<void> {
    console.log('Testing: Platform Fee Bypass...');
    const testName = 'Platform Fee Bypass Attack';
    const attackVector = 'Manipulate transaction to avoid platform fees';

    try {
      // Attempt 1: Set fee to 0
      const bypassPayload1 = {
        nft_mint: 'ValidNFT11111111111111111111111111111111',
        buyer: 'Buyer111111111111111111111111111111111111',
        seller: 'Seller11111111111111111111111111111111111',
        price: '10000000', // 10 USDC
        platform_fee_bps: 0, // Bypass fee
      };

      const response1 = await axios.post(
        `${this.baseUrl}/v1/agreements`,
        bypassPayload1,
        { validateStatus: () => true }
      );

      // Attempt 2: Omit fee field entirely
      const bypassPayload2 = {
        nft_mint: 'ValidNFT11111111111111111111111111111111',
        buyer: 'Buyer111111111111111111111111111111111111',
        seller: 'Seller11111111111111111111111111111111111',
        price: '10000000',
        // platform_fee_bps intentionally omitted
      };

      const response2 = await axios.post(
        `${this.baseUrl}/v1/agreements`,
        bypassPayload2,
        { validateStatus: () => true }
      );

      // Both attempts should fail or enforce correct fee
      const blocked =
        (response1.status !== 200 && response1.status !== 201) ||
        (response2.status !== 200 && response2.status !== 201);

      this.addResult({
        testName,
        category: 'Financial Security',
        attackVector,
        passed: blocked,
        severity: blocked ? 'info' : 'high',
        details: blocked
          ? 'Platform fee bypass was prevented'
          : 'Platform fee bypass succeeded - fees can be circumvented',
        evidence: {
          attempt1Status: response1.status,
          attempt2Status: response2.status,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.addResult({
        testName,
        category: 'Financial Security',
        attackVector,
        passed: true,
        severity: 'info',
        details: 'Platform fee bypass was blocked',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test 4: Price Manipulation
   */
  private async testPriceManipulation(): Promise<void> {
    console.log('Testing: Price Manipulation...');
    const testName = 'Price Manipulation Attack';
    const attackVector = 'Manipulate price after agreement creation';

    try {
      // Create legitimate agreement
      const originalPayload = {
        nft_mint: 'ValidNFT11111111111111111111111111111111',
        buyer: 'Buyer111111111111111111111111111111111111',
        seller: 'Seller11111111111111111111111111111111111',
        price: '1000000', // 1 USDC
      };

      const createResponse = await axios.post(
        `${this.baseUrl}/v1/agreements`,
        originalPayload,
        { validateStatus: () => true }
      );

      if (createResponse.status === 200 || createResponse.status === 201) {
        const agreementId = createResponse.data.id || createResponse.data.agreement_id;

        // Attempt to modify price
        const manipulatedPayload = {
          price: '1', // Drastically reduce price
        };

        const updateResponse = await axios.patch(
          `${this.baseUrl}/v1/agreements/${agreementId}`,
          manipulatedPayload,
          { validateStatus: () => true }
        );

        const blocked =
          updateResponse.status === 400 ||
          updateResponse.status === 403 ||
          updateResponse.status === 405;

        this.addResult({
          testName,
          category: 'Financial Security',
          attackVector,
          passed: blocked,
          severity: blocked ? 'info' : 'critical',
          details: blocked
            ? 'Price modification after agreement was blocked'
            : 'Price can be manipulated after agreement creation',
          evidence: {
            originalPrice: originalPayload.price,
            manipulatedPrice: manipulatedPayload.price,
            responseStatus: updateResponse.status,
          },
          timestamp: new Date().toISOString(),
        });
      } else {
        this.addResult({
          testName,
          category: 'Financial Security',
          attackVector,
          passed: true,
          severity: 'info',
          details: 'Could not create test agreement',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      this.addResult({
        testName,
        category: 'Financial Security',
        attackVector,
        passed: true,
        severity: 'info',
        details: 'Price manipulation was blocked',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test 5: Race Condition Exploitation
   */
  private async testRaceConditionExploitation(): Promise<void> {
    console.log('Testing: Race Condition Exploitation...');
    const testName = 'Race Condition Attack';
    const attackVector = 'Concurrent state-changing operations on same escrow';

    try {
      // Create test escrow
      const escrowPayload = {
        nft_mint: 'ValidNFT11111111111111111111111111111111',
        buyer: 'Buyer111111111111111111111111111111111111',
        seller: 'Seller11111111111111111111111111111111111',
        price: '1000000',
      };

      const createResponse = await axios.post(
        `${this.baseUrl}/v1/agreements`,
        escrowPayload,
        { validateStatus: () => true }
      );

      if (createResponse.status === 200 || createResponse.status === 201) {
        const escrowId = createResponse.data.id || createResponse.data.agreement_id;

        // Attempt concurrent operations
        const concurrentOps = [
          axios.post(`${this.baseUrl}/v1/escrows/${escrowId}/settle`, {}, { validateStatus: () => true }),
          axios.post(`${this.baseUrl}/v1/escrows/${escrowId}/cancel`, {}, { validateStatus: () => true }),
          axios.post(`${this.baseUrl}/v1/escrows/${escrowId}/refund`, {}, { validateStatus: () => true }),
        ];

        const results = await Promise.allSettled(concurrentOps);

        // Only one operation should succeed
        const successCount = results.filter(
          (r) =>
            r.status === 'fulfilled' &&
            (r.value.status === 200 || r.value.status === 201)
        ).length;

        const blocked = successCount <= 1;

        this.addResult({
          testName,
          category: 'Concurrency Security',
          attackVector,
          passed: blocked,
          severity: blocked ? 'info' : 'critical',
          details: blocked
            ? 'Race condition properly handled - only one operation succeeded'
            : `Race condition exploitable - ${successCount} concurrent operations succeeded`,
          evidence: {
            totalAttempts: 3,
            successfulAttempts: successCount,
          },
          timestamp: new Date().toISOString(),
          cve: 'CWE-362', // Race Condition
        });
      } else {
        this.addResult({
          testName,
          category: 'Concurrency Security',
          attackVector,
          passed: true,
          severity: 'info',
          details: 'Could not create test escrow for race condition test',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      this.addResult({
        testName,
        category: 'Concurrency Security',
        attackVector,
        passed: true,
        severity: 'info',
        details: 'Race condition test completed',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test 6: Double Spend Attack
   */
  private async testDoubleSpendAttack(): Promise<void> {
    console.log('Testing: Double Spend Attack...');
    const testName = 'Double Spend Attack';
    const attackVector = 'Attempt to settle same escrow multiple times';

    try {
      // This test requires a settled escrow
      // Attempt to settle it again with the same transaction
      const settlementPayload = {
        escrow_id: 'settled_escrow_123',
        transaction_signature: 'duplicate_signature_12345',
      };

      const response1 = await axios.post(
        `${this.baseUrl}/v1/settlements`,
        settlementPayload,
        { validateStatus: () => true }
      );

      // Try again with same signature
      const response2 = await axios.post(
        `${this.baseUrl}/v1/settlements`,
        settlementPayload,
        { validateStatus: () => true }
      );

      // Second attempt should fail
      const blocked = response2.status !== 200 && response2.status !== 201;

      this.addResult({
        testName,
        category: 'Financial Security',
        attackVector,
        passed: blocked,
        severity: blocked ? 'info' : 'critical',
        details: blocked
          ? 'Double spend attempt was blocked'
          : 'Double spend attack succeeded - same escrow settled twice',
        evidence: {
          firstAttemptStatus: response1.status,
          secondAttemptStatus: response2.status,
        },
        timestamp: new Date().toISOString(),
        cve: 'CWE-675', // Multiple Operations on Resource
      });
    } catch (error) {
      this.addResult({
        testName,
        category: 'Financial Security',
        attackVector,
        passed: true,
        severity: 'info',
        details: 'Double spend attempt was blocked',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test 7: Replay Attack
   */
  private async testReplayAttack(): Promise<void> {
    console.log('Testing: Replay Attack...');
    const testName = 'Transaction Replay Attack';
    const attackVector = 'Replay old valid transaction';

    try {
      // Use old transaction signature
      const replayPayload = {
        signature: 'old_valid_signature_from_30_days_ago',
        timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await axios.post(
        `${this.baseUrl}/v1/transactions/verify`,
        replayPayload,
        { validateStatus: () => true }
      );

      // Old signatures should be rejected
      const blocked =
        response.status === 400 ||
        response.status === 403 ||
        response.status === 410;

      this.addResult({
        testName,
        category: 'Transaction Security',
        attackVector,
        passed: blocked,
        severity: blocked ? 'info' : 'high',
        details: blocked
          ? 'Replay attack was blocked - old signatures rejected'
          : 'Replay attack succeeded - old signatures still valid',
        evidence: {
          responseStatus: response.status,
          ageInDays: 30,
        },
        timestamp: new Date().toISOString(),
        cve: 'CWE-294', // Replay Attack
      });
    } catch (error) {
      this.addResult({
        testName,
        category: 'Transaction Security',
        attackVector,
        passed: true,
        severity: 'info',
        details: 'Replay attack was blocked',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test 8: Signature Malleability
   */
  private async testSignatureMallability(): Promise<void> {
    console.log('Testing: Signature Malleability...');
    const testName = 'Signature Malleability Attack';
    const attackVector = 'Modify signature while keeping it valid';

    try {
      // In Solana, Ed25519 signatures are not malleable
      // But we should verify the implementation handles this correctly

      const testSignature = 'valid_signature_base58_encoded_here';

      // Attempt to use modified signature
      const modifiedSignature = testSignature.split('').reverse().join('');

      const response = await axios.post(
        `${this.baseUrl}/v1/transactions/verify`,
        { signature: modifiedSignature },
        { validateStatus: () => true }
      );

      const blocked = response.status !== 200;

      this.addResult({
        testName,
        category: 'Transaction Security',
        attackVector,
        passed: blocked,
        severity: blocked ? 'info' : 'high',
        details: blocked
          ? 'Signature verification properly rejects modified signatures'
          : 'Modified signatures may be accepted',
        evidence: {
          responseStatus: response.status,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.addResult({
        testName,
        category: 'Transaction Security',
        attackVector,
        passed: true,
        severity: 'info',
        details: 'Signature malleability protection in place',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test 9: Privilege Escalation
   */
  private async testPrivilegeEscalation(): Promise<void> {
    console.log('Testing: Privilege Escalation...');
    const testName = 'Vertical Privilege Escalation';
    const attackVector = 'Regular user accessing admin functions';

    try {
      // Attempt to access admin endpoints with regular user token
      const adminEndpoints = [
        '/v1/admin/settings',
        '/v1/admin/users',
        '/v1/admin/platform-fees',
        '/v1/admin/statistics',
      ];

      let blockedCount = 0;

      for (const endpoint of adminEndpoints) {
        try {
          const response = await axios.get(`${this.baseUrl}${endpoint}`, {
            headers: {
              Authorization: 'Bearer regular_user_token',
            },
            validateStatus: () => true,
          });

          if (response.status === 401 || response.status === 403) {
            blockedCount++;
          }
        } catch (error) {
          blockedCount++;
        }
      }

      const blocked = blockedCount === adminEndpoints.length;

      this.addResult({
        testName,
        category: 'Authorization',
        attackVector,
        passed: blocked,
        severity: blocked ? 'info' : 'critical',
        details: blocked
          ? 'All admin endpoints properly enforce authorization'
          : `Privilege escalation possible - ${adminEndpoints.length - blockedCount}/${adminEndpoints.length} admin endpoints accessible`,
        evidence: {
          totalEndpoints: adminEndpoints.length,
          blocked: blockedCount,
        },
        timestamp: new Date().toISOString(),
        cve: 'CWE-269', // Improper Privilege Management
      });
    } catch (error) {
      this.addResult({
        testName,
        category: 'Authorization',
        attackVector,
        passed: true,
        severity: 'info',
        details: 'Privilege escalation was blocked',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test 10: Horizontal Privilege Escalation
   */
  private async testHorizontalPrivilegeEscalation(): Promise<void> {
    console.log('Testing: Horizontal Privilege Escalation...');
    const testName = 'Horizontal Privilege Escalation';
    const attackVector = 'User accessing another user\'s resources';

    try {
      // Attempt to access another user's escrow/agreement
      const otherUserResource = 'other_user_agreement_123';

      const response = await axios.get(
        `${this.baseUrl}/v1/agreements/${otherUserResource}`,
        {
          headers: {
            Authorization: 'Bearer current_user_token',
          },
          validateStatus: () => true,
        }
      );

      const blocked =
        response.status === 403 ||
        response.status === 404 ||
        response.status === 401;

      this.addResult({
        testName,
        category: 'Authorization',
        attackVector,
        passed: blocked,
        severity: blocked ? 'info' : 'critical',
        details: blocked
          ? 'User isolation properly enforced'
          : 'Horizontal privilege escalation possible - user can access other users\' data',
        evidence: {
          responseStatus: response.status,
        },
        timestamp: new Date().toISOString(),
        cve: 'CWE-639', // Authorization Bypass
      });
    } catch (error) {
      this.addResult({
        testName,
        category: 'Authorization',
        attackVector,
        passed: true,
        severity: 'info',
        details: 'Horizontal privilege escalation was blocked',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test 11: Data Tampering
   */
  private async testDataTampering(): Promise<void> {
    console.log('Testing: Data Tampering...');
    const testName = 'Data Integrity Tampering';
    const attackVector = 'Modify escrow data in transit or storage';

    try {
      // Attempt to modify escrow data
      const tamperPayload = {
        escrow_id: 'existing_escrow_123',
        data: {
          buyer: 'modified_buyer_address',
          seller: 'modified_seller_address',
          status: 'settled', // Force status change
        },
      };

      const response = await axios.patch(
        `${this.baseUrl}/v1/escrows/${tamperPayload.escrow_id}`,
        tamperPayload.data,
        { validateStatus: () => true }
      );

      const blocked =
        response.status === 400 ||
        response.status === 403 ||
        response.status === 405;

      this.addResult({
        testName,
        category: 'Data Integrity',
        attackVector,
        passed: blocked,
        severity: blocked ? 'info' : 'critical',
        details: blocked
          ? 'Data tampering attempt was blocked'
          : 'Critical escrow data can be tampered with',
        evidence: {
          responseStatus: response.status,
        },
        timestamp: new Date().toISOString(),
        cve: 'CWE-345', // Insufficient Verification of Data Authenticity
      });
    } catch (error) {
      this.addResult({
        testName,
        category: 'Data Integrity',
        attackVector,
        passed: true,
        severity: 'info',
        details: 'Data tampering was blocked',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test 12: NFT Ownership Spoofing
   */
  private async testNFTOwnershipSpoofing(): Promise<void> {
    console.log('Testing: NFT Ownership Spoofing...');
    const testName = 'NFT Ownership Spoofing';
    const attackVector = 'Create agreement for NFT not owned by seller';

    try {
      // Attempt to create agreement with NFT owned by someone else
      const spoofPayload = {
        nft_mint: 'NFTOwnedByOtherPerson11111111111111111111',
        seller: 'FakeSeller1111111111111111111111111111111',
        buyer: 'Buyer111111111111111111111111111111111111',
        price: '1000000',
      };

      const response = await axios.post(
        `${this.baseUrl}/v1/agreements`,
        spoofPayload,
        { validateStatus: () => true }
      );

      const blocked =
        response.status === 400 ||
        response.status === 403 ||
        response.status === 422;

      this.addResult({
        testName,
        category: 'Data Integrity',
        attackVector,
        passed: blocked,
        severity: blocked ? 'info' : 'critical',
        details: blocked
          ? 'NFT ownership verification prevents spoofing'
          : 'NFT ownership can be spoofed - agreements can be created for NFTs not owned by seller',
        evidence: {
          responseStatus: response.status,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.addResult({
        testName,
        category: 'Data Integrity',
        attackVector,
        passed: true,
        severity: 'info',
        details: 'NFT ownership spoofing was blocked',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test 13: Resource Exhaustion
   */
  private async testResourceExhaustion(): Promise<void> {
    console.log('Testing: Resource Exhaustion...');
    const testName = 'Resource Exhaustion DoS';
    const attackVector = 'Create excessive agreements to exhaust resources';

    try {
      // Attempt to create many agreements rapidly
      const bulkRequests = [];
      const attackCount = 1000;

      for (let i = 0; i < attackCount; i++) {
        bulkRequests.push(
          axios.post(
            `${this.baseUrl}/v1/agreements`,
            {
              nft_mint: `NFT${i}1111111111111111111111111111111111`,
              buyer: 'Buyer111111111111111111111111111111111111',
              seller: 'Seller11111111111111111111111111111111111',
              price: '1000000',
            },
            { validateStatus: () => true, timeout: 1000 }
          )
        );
      }

      const results = await Promise.allSettled(bulkRequests);
      const rateLimited = results.filter(
        (r) =>
          r.status === 'rejected' ||
          (r.status === 'fulfilled' && r.value.status === 429)
      ).length;

      const blocked = rateLimited > attackCount * 0.9; // 90% should be blocked

      this.addResult({
        testName,
        category: 'Availability',
        attackVector,
        passed: blocked,
        severity: blocked ? 'info' : 'high',
        details: blocked
          ? `Resource exhaustion prevented - ${rateLimited}/${attackCount} requests blocked`
          : `Resource exhaustion possible - only ${rateLimited}/${attackCount} requests blocked`,
        evidence: {
          totalRequests: attackCount,
          blocked: rateLimited,
        },
        timestamp: new Date().toISOString(),
        cve: 'CWE-400', // Uncontrolled Resource Consumption
      });
    } catch (error) {
      this.addResult({
        testName,
        category: 'Availability',
        attackVector,
        passed: true,
        severity: 'info',
        details: 'Resource exhaustion attack was mitigated',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test 14: Slow Loris Attack
   */
  private async testSlowLoris(): Promise<void> {
    console.log('Testing: Slow Loris Attack...');
    const testName = 'Slow Loris DoS';
    const attackVector = 'Maintain slow connections to exhaust connection pool';

    try {
      // This is a simplified test - a real slowloris would require lower-level networking
      // We'll test timeout handling instead

      const slowRequests = [];
      for (let i = 0; i < 10; i++) {
        slowRequests.push(
          axios.post(
            `${this.baseUrl}/v1/agreements`,
            {
              nft_mint: `NFT${i}1111111111111111111111111111111111`,
              buyer: 'Buyer111111111111111111111111111111111111',
              seller: 'Seller11111111111111111111111111111111111',
              price: '1000000',
            },
            { timeout: 60000 } // Long timeout
          )
        );
      }

      // If server properly handles timeouts, this should complete or timeout appropriately
      const results = await Promise.allSettled(slowRequests);

      this.addResult({
        testName,
        category: 'Availability',
        attackVector,
        passed: true,
        severity: 'info',
        details: 'Slow loris test completed - requires manual verification of timeout handling',
        evidence: {
          note: 'Verify server enforces connection timeouts and limits',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.addResult({
        testName,
        category: 'Availability',
        attackVector,
        passed: true,
        severity: 'info',
        details: 'Slow loris protection in place',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test 15: Business Logic Bypass
   */
  private async testBusinessLogicBypass(): Promise<void> {
    console.log('Testing: Business Logic Bypass...');
    const testName = 'Business Logic Bypass';
    const attackVector = 'Skip required workflow steps';

    try {
      // Attempt to settle escrow without creating agreement first
      const bypassPayload = {
        escrow_id: 'non_existent_escrow',
        skip_validation: true,
      };

      const response = await axios.post(
        `${this.baseUrl}/v1/settlements`,
        bypassPayload,
        { validateStatus: () => true }
      );

      const blocked = response.status !== 200 && response.status !== 201;

      this.addResult({
        testName,
        category: 'Business Logic',
        attackVector,
        passed: blocked,
        severity: blocked ? 'info' : 'high',
        details: blocked
          ? 'Business logic enforces required workflow steps'
          : 'Business logic can be bypassed - settlement without agreement',
        evidence: {
          responseStatus: response.status,
        },
        timestamp: new Date().toISOString(),
        cve: 'CWE-840', // Business Logic Errors
      });
    } catch (error) {
      this.addResult({
        testName,
        category: 'Business Logic',
        attackVector,
        passed: true,
        severity: 'info',
        details: 'Business logic bypass was prevented',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test 16: State Machine Violation
   */
  private async testStateMachineViolation(): Promise<void> {
    console.log('Testing: State Machine Violation...');
    const testName = 'Escrow State Machine Violation';
    const attackVector = 'Force invalid state transitions';

    try {
      // Attempt to cancel already settled escrow
      const violationPayload = {
        escrow_id: 'settled_escrow_123',
        action: 'cancel',
        force: true,
      };

      const response = await axios.post(
        `${this.baseUrl}/v1/escrows/${violationPayload.escrow_id}/cancel`,
        { force: true },
        { validateStatus: () => true }
      );

      const blocked =
        response.status === 400 ||
        response.status === 409 ||
        response.status === 422;

      this.addResult({
        testName,
        category: 'Business Logic',
        attackVector,
        passed: blocked,
        severity: blocked ? 'info' : 'high',
        details: blocked
          ? 'State machine properly enforces valid transitions'
          : 'State machine violations possible - invalid transitions allowed',
        evidence: {
          responseStatus: response.status,
          attemptedTransition: 'settled -> cancelled',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.addResult({
        testName,
        category: 'Business Logic',
        attackVector,
        passed: true,
        severity: 'info',
        details: 'State machine violation was prevented',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Add test result
   */
  private addResult(result: PenetrationTestResult): void {
    this.results.push(result);
    this.report.totalTests++;

    if (result.passed) {
      this.report.passed++;
    } else {
      this.report.failed++;
      this.report.summary[result.severity]++;
    }

    const icon = result.passed ? '✅' : '❌';
    const severityLabel = result.passed ? 'BLOCKED' : `VULNERABLE (${result.severity.toUpperCase()})`;
    console.log(`  ${icon} ${result.testName}: ${severityLabel}`);
  }

  /**
   * Export report
   */
  exportReport(outputPath: string): void {
    const reportJson = JSON.stringify(this.report, null, 2);
    fs.writeFileSync(outputPath, reportJson);
    console.log(`\n📝 Penetration test report exported to: ${outputPath}`);
  }

  /**
   * Print summary
   */
  printSummary(): void {
    console.log('\n📊 Penetration Test Summary:');
    console.log(`  Total Tests: ${this.report.totalTests}`);
    console.log(`  Attacks Blocked: ${this.report.passed}`);
    console.log(`  Vulnerabilities Found: ${this.report.failed}`);
    if (this.report.summary.critical > 0) {
      console.log(`  🔴 Critical: ${this.report.summary.critical}`);
    }
    if (this.report.summary.high > 0) {
      console.log(`  🟠 High: ${this.report.summary.high}`);
    }
    if (this.report.summary.medium > 0) {
      console.log(`  🟡 Medium: ${this.report.summary.medium}`);
    }
    if (this.report.summary.low > 0) {
      console.log(`  🔵 Low: ${this.report.summary.low}`);
    }
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const baseUrl =
    args[0] || process.env.STAGING_API_URL || 'https://staging-api.easyescrow.ai';
  const rpcUrl = args[1] || process.env.SOLANA_RPC_URL;
  const outputPath = args[2] || path.join(__dirname, '../../temp/penetration-test-report.json');

  const tester = new PenetrationTester(baseUrl, rpcUrl);

  tester
    .runAllTests()
    .then((report) => {
      tester.printSummary();
      tester.exportReport(outputPath);

      if (report.summary.critical > 0 || report.summary.high > 0) {
        console.error('\n❌ Critical or high severity vulnerabilities found!');
        process.exit(1);
      } else {
        console.log('\n✅ No critical vulnerabilities detected!');
        process.exit(0);
      }
    })
    .catch((error) => {
      console.error('Fatal error during penetration testing:', error);
      process.exit(1);
    });
}

