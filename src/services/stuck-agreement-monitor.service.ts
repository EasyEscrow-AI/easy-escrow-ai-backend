/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PRESERVED FOR POTENTIAL FUTURE USE - Stuck Agreement Monitor Service
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This file implemented monitoring for agreements stuck in BOTH_LOCKED status
 * and automatic refund processing.
 * 
 * MIGRATION CONTEXT:
 * - Detected agreements stuck in deposit states for extended periods
 * - Triggered WARNING and CRITICAL alerts based on duration
 * - Automatically processed refunds for stuck agreements after threshold
 * - Prevented accumulation of stuck funds in escrow
 * - Superseded by atomic swap architecture (no stuck agreements)
 * 
 * DO NOT DELETE:
 * - Contains valuable monitoring patterns and alert logic
 * - Shows how to implement automatic remediation for stuck states
 * - Includes intelligent retry logic and rate limiting
 * - May be needed if agreement-based escrow is reintroduced
 * - Serves as reference for monitoring other entities
 * 
 * KEY METHODS (now disabled):
 * - start/stop: Service lifecycle management
 * - checkForStuckAgreements: Periodic check for stuck agreements
 * - processAutomaticRefund: Automatic refund processing
 * - onAlert: Register callback for alerts
 * - manualCheck: Manual trigger for testing
 * 
 * IMPORTANT PATTERNS PRESERVED:
 * - Alert severity levels (WARNING/CRITICAL)
 * - Automatic remediation with configurable thresholds
 * - Rate limiting for refund processing
 * - Age-based filtering to prevent old agreements from accumulating
 * - Deposit tracking to distinguish stuck funds from normal cleanup
 * 
 * DISABLED ON: 2025-12-02
 * RELATED FILES: agreement.service.ts, refund.service.ts, monitoring-orchestrator.service.ts
 * ═══════════════════════════════════════════════════════════════════════════
 */

// This file has been intentionally left empty after migration to atomic swaps
// Agreement monitoring is no longer needed
// Export empty object to prevent import errors
export {};
