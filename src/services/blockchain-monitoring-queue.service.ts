/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PRESERVED FOR POTENTIAL FUTURE USE - Blockchain Monitoring Queue Service
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This file implemented a job queue for blockchain event monitoring and processing.
 * 
 * MIGRATION CONTEXT:
 * - Handled periodic blockchain scanning for deposit events
 * - Verified transaction confirmations
 * - Monitored agreements for state changes
 * - Checked agreement expiry
 * - Processed blockchain reorganizations
 * - Superseded by atomic swap architecture (instant transactions, no monitoring)
 * 
 * DO NOT DELETE:
 * - Contains valuable blockchain monitoring patterns
 * - Shows how to implement async blockchain event processing
 * - Includes retry logic and confirmation tracking
 * - May be needed if agreement-based features return
 * 
 * KEY JOB TYPES (now disabled):
 * - SCAN_DEPOSITS: Scan blockchain for deposits
 * - VERIFY_CONFIRMATION: Verify transaction confirmations
 * - MONITOR_AGREEMENT: Monitor agreement state changes
 * - CHECK_EXPIRY: Check agreement expiry
 * - PROCESS_BLOCKCHAIN_EVENT: Process blockchain events
 * - HANDLE_REORG: Handle blockchain reorganizations
 * 
 * IMPORTANT PATTERNS PRESERVED:
 * - Job queue with Bull
 * - Retry strategies for blockchain operations
 * - Confirmation tracking
 * - Event processing
 * 
 * DISABLED ON: 2025-12-02
 * RELATED FILES: monitoring-orchestrator.service.ts, monitoring.service.ts, queue.service.ts
 * ═══════════════════════════════════════════════════════════════════════════
 */

// This file has been intentionally left empty after migration to atomic swaps
// Blockchain monitoring queue is no longer needed
// Export empty object to prevent import errors
export {};
