/**
 * Delegation Metrics Service
 *
 * Provides Prometheus metrics for monitoring delegation-based settlement operations.
 * Tracks delegation, settlement, and swap lifecycle metrics for observability.
 *
 * Metrics Categories:
 * 1. Delegation Metrics - cNFT delegation operations
 * 2. Settlement Metrics - Settlement execution and chunking
 * 3. Swap Metrics - Two-phase swap lifecycle
 * 4. System Metrics - Health and resource monitoring
 *
 * @see Task 16: Add Monitoring and Observability for Delegation Settlement
 */

import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
  register as defaultRegister,
} from 'prom-client';

// =============================================================================
// Types
// =============================================================================

/**
 * Delegation operation outcomes
 */
export type DelegationOutcome = 'success' | 'failure' | 'timeout' | 'invalid_ownership';

/**
 * Settlement outcomes
 */
export type SettlementOutcome = 'success' | 'failure' | 'partial' | 'timeout' | 'reverted';

/**
 * Swap phase labels for duration tracking
 */
export type SwapPhase =
  | 'created'
  | 'accepted'
  | 'locking_party_a'
  | 'party_a_locked'
  | 'locking_party_b'
  | 'fully_locked'
  | 'settling'
  | 'partial_settle'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired';

/**
 * Error categories for classification
 */
export type ErrorCategory =
  | 'network'
  | 'validation'
  | 'timeout'
  | 'on_chain'
  | 'stale_proof'
  | 'rate_limit'
  | 'unknown';

/**
 * Swap types for labeling
 */
export type SwapTypeLabel =
  | 'nft_for_sol'
  | 'nft_for_nft'
  | 'cnft_for_sol'
  | 'cnft_for_cnft'
  | 'cnft_for_nft'
  | 'bulk';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Metrics configuration
 */
export interface MetricsConfig {
  /** Prefix for all metric names */
  prefix: string;
  /** Enable default Node.js metrics */
  enableDefaultMetrics: boolean;
  /** Default labels applied to all metrics */
  defaultLabels?: Record<string, string>;
  /** Custom histogram buckets for duration metrics */
  durationBuckets?: number[];
}

const DEFAULT_CONFIG: MetricsConfig = {
  prefix: 'easyescrow_',
  enableDefaultMetrics: true,
  defaultLabels: {
    app: 'easyescrow',
    service: 'backend',
  },
  // Duration buckets in seconds: 10ms to 5min
  durationBuckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300],
};

// =============================================================================
// Metrics Service Class
// =============================================================================

/**
 * Delegation Metrics Service
 *
 * Singleton service providing Prometheus metrics for delegation-based settlement.
 */
export class DelegationMetricsService {
  private registry: Registry;
  private config: MetricsConfig;
  private initialized: boolean = false;

  // =========================================================================
  // Delegation Metrics
  // =========================================================================

  /** Total delegation operations counter */
  public delegationTotal!: Counter;

  /** Delegation success counter */
  public delegationSuccess!: Counter;

  /** Delegation failure counter */
  public delegationFailure!: Counter;

  /** Delegation operation duration histogram */
  public delegationLatency!: Histogram;

  /** Currently active delegations gauge */
  public activeDelegations!: Gauge;

  // =========================================================================
  // Settlement Metrics
  // =========================================================================

  /** Total settlement attempts counter */
  public settlementTotal!: Counter;

  /** Settlement success counter */
  public settlementSuccess!: Counter;

  /** Settlement failure counter */
  public settlementFailure!: Counter;

  /** Settlement duration histogram */
  public settlementDuration!: Histogram;

  /** Settlement chunks counter (for multi-tx settlements) */
  public settlementChunks!: Counter;

  /** Settlement retry counter */
  public settlementRetries!: Counter;

  /** Currently settling swaps gauge */
  public settlementInProgress!: Gauge;

  // =========================================================================
  // Swap Metrics
  // =========================================================================

  /** Swaps created counter */
  public swapCreated!: Counter;

  /** Swaps completed counter */
  public swapCompleted!: Counter;

  /** Swaps failed counter */
  public swapFailed!: Counter;

  /** Swaps cancelled counter */
  public swapCancelled!: Counter;

  /** Swaps expired counter */
  public swapExpired!: Counter;

  /** Swap phase duration histogram */
  public swapPhaseDuration!: Histogram;

  /** Currently active swaps by status gauge */
  public activeSwapsByStatus!: Gauge;

  /** Swap phase transitions counter */
  public swapPhaseTransitions!: Counter;

  // =========================================================================
  // Error Metrics
  // =========================================================================

  /** Errors by category counter */
  public errorsByCategory!: Counter;

  /** Rate limit hits counter */
  public rateLimitHits!: Counter;

  // =========================================================================
  // Health Metrics
  // =========================================================================

  /** Service health gauge (1 = healthy, 0 = unhealthy) */
  public serviceHealth!: Gauge;

  /** Last successful operation timestamp gauge */
  public lastSuccessfulOperation!: Gauge;

  constructor(config?: Partial<MetricsConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registry = new Registry();

    // Set default labels
    if (this.config.defaultLabels) {
      this.registry.setDefaultLabels(this.config.defaultLabels);
    }

    // Initialize metrics
    this.initializeMetrics();

    console.log('[DelegationMetricsService] Initialized with prefix:', this.config.prefix);
  }

  // =========================================================================
  // Initialization
  // =========================================================================

  private initializeMetrics(): void {
    const prefix = this.config.prefix;
    const buckets = this.config.durationBuckets!;

    // -------------------------------------------------------------------
    // Delegation Metrics
    // -------------------------------------------------------------------

    this.delegationTotal = new Counter({
      name: `${prefix}delegation_total`,
      help: 'Total number of delegation operations',
      labelNames: ['outcome', 'asset_type'],
      registers: [this.registry],
    });

    this.delegationSuccess = new Counter({
      name: `${prefix}delegation_success_total`,
      help: 'Total number of successful delegations',
      labelNames: ['asset_type'],
      registers: [this.registry],
    });

    this.delegationFailure = new Counter({
      name: `${prefix}delegation_failure_total`,
      help: 'Total number of failed delegations',
      labelNames: ['asset_type', 'error_category'],
      registers: [this.registry],
    });

    this.delegationLatency = new Histogram({
      name: `${prefix}delegation_latency_seconds`,
      help: 'Delegation operation latency in seconds',
      labelNames: ['outcome', 'asset_type'],
      buckets,
      registers: [this.registry],
    });

    this.activeDelegations = new Gauge({
      name: `${prefix}active_delegations`,
      help: 'Number of currently active delegations',
      labelNames: ['asset_type'],
      registers: [this.registry],
    });

    // -------------------------------------------------------------------
    // Settlement Metrics
    // -------------------------------------------------------------------

    this.settlementTotal = new Counter({
      name: `${prefix}settlement_total`,
      help: 'Total number of settlement attempts',
      labelNames: ['outcome', 'swap_type'],
      registers: [this.registry],
    });

    this.settlementSuccess = new Counter({
      name: `${prefix}settlement_success_total`,
      help: 'Total number of successful settlements',
      labelNames: ['swap_type'],
      registers: [this.registry],
    });

    this.settlementFailure = new Counter({
      name: `${prefix}settlement_failure_total`,
      help: 'Total number of failed settlements',
      labelNames: ['swap_type', 'error_category'],
      registers: [this.registry],
    });

    this.settlementDuration = new Histogram({
      name: `${prefix}settlement_duration_seconds`,
      help: 'Settlement operation duration in seconds',
      labelNames: ['outcome', 'swap_type'],
      buckets,
      registers: [this.registry],
    });

    this.settlementChunks = new Counter({
      name: `${prefix}settlement_chunks_total`,
      help: 'Total number of settlement chunks processed',
      labelNames: ['swap_type'],
      registers: [this.registry],
    });

    this.settlementRetries = new Counter({
      name: `${prefix}settlement_retries_total`,
      help: 'Total number of settlement retries',
      labelNames: ['swap_type', 'retry_reason'],
      registers: [this.registry],
    });

    this.settlementInProgress = new Gauge({
      name: `${prefix}settlement_in_progress`,
      help: 'Number of settlements currently in progress',
      labelNames: ['swap_type'],
      registers: [this.registry],
    });

    // -------------------------------------------------------------------
    // Swap Lifecycle Metrics
    // -------------------------------------------------------------------

    this.swapCreated = new Counter({
      name: `${prefix}swap_created_total`,
      help: 'Total number of swaps created',
      labelNames: ['swap_type'],
      registers: [this.registry],
    });

    this.swapCompleted = new Counter({
      name: `${prefix}swap_completed_total`,
      help: 'Total number of swaps completed successfully',
      labelNames: ['swap_type'],
      registers: [this.registry],
    });

    this.swapFailed = new Counter({
      name: `${prefix}swap_failed_total`,
      help: 'Total number of failed swaps',
      labelNames: ['swap_type', 'error_category'],
      registers: [this.registry],
    });

    this.swapCancelled = new Counter({
      name: `${prefix}swap_cancelled_total`,
      help: 'Total number of cancelled swaps',
      labelNames: ['swap_type', 'cancelled_by'],
      registers: [this.registry],
    });

    this.swapExpired = new Counter({
      name: `${prefix}swap_expired_total`,
      help: 'Total number of expired swaps',
      labelNames: ['swap_type', 'expired_at_phase'],
      registers: [this.registry],
    });

    this.swapPhaseDuration = new Histogram({
      name: `${prefix}swap_phase_duration_seconds`,
      help: 'Duration of each swap phase in seconds',
      labelNames: ['phase', 'swap_type'],
      buckets,
      registers: [this.registry],
    });

    this.activeSwapsByStatus = new Gauge({
      name: `${prefix}active_swaps_by_status`,
      help: 'Number of active swaps by status',
      labelNames: ['status', 'swap_type'],
      registers: [this.registry],
    });

    this.swapPhaseTransitions = new Counter({
      name: `${prefix}swap_phase_transitions_total`,
      help: 'Total number of swap phase transitions',
      labelNames: ['from_phase', 'to_phase', 'swap_type'],
      registers: [this.registry],
    });

    // -------------------------------------------------------------------
    // Error Metrics
    // -------------------------------------------------------------------

    this.errorsByCategory = new Counter({
      name: `${prefix}errors_by_category_total`,
      help: 'Total errors categorized by type',
      labelNames: ['category', 'operation'],
      registers: [this.registry],
    });

    this.rateLimitHits = new Counter({
      name: `${prefix}rate_limit_hits_total`,
      help: 'Total number of rate limit hits',
      labelNames: ['service', 'endpoint'],
      registers: [this.registry],
    });

    // -------------------------------------------------------------------
    // Health Metrics
    // -------------------------------------------------------------------

    this.serviceHealth = new Gauge({
      name: `${prefix}service_health`,
      help: 'Service health status (1 = healthy, 0 = unhealthy)',
      labelNames: ['component'],
      registers: [this.registry],
    });

    this.lastSuccessfulOperation = new Gauge({
      name: `${prefix}last_successful_operation_timestamp`,
      help: 'Timestamp of last successful operation',
      labelNames: ['operation'],
      registers: [this.registry],
    });

    // Enable default metrics if configured
    if (this.config.enableDefaultMetrics) {
      collectDefaultMetrics({
        register: this.registry,
        prefix: this.config.prefix,
      });
    }

    this.initialized = true;
  }

  // =========================================================================
  // Delegation Tracking Methods
  // =========================================================================

  /**
   * Record a delegation operation
   */
  recordDelegation(
    outcome: DelegationOutcome,
    assetType: 'NFT' | 'CNFT',
    durationSeconds: number,
    errorCategory?: ErrorCategory
  ): void {
    this.delegationTotal.inc({ outcome, asset_type: assetType });
    this.delegationLatency.observe({ outcome, asset_type: assetType }, durationSeconds);

    if (outcome === 'success') {
      this.delegationSuccess.inc({ asset_type: assetType });
      this.lastSuccessfulOperation.set({ operation: 'delegation' }, Date.now() / 1000);
    } else {
      this.delegationFailure.inc({
        asset_type: assetType,
        error_category: errorCategory || 'unknown',
      });
    }
  }

  /**
   * Update active delegations count
   */
  setActiveDelegations(assetType: 'NFT' | 'CNFT', count: number): void {
    this.activeDelegations.set({ asset_type: assetType }, count);
  }

  /**
   * Increment active delegations
   */
  incrementActiveDelegations(assetType: 'NFT' | 'CNFT'): void {
    this.activeDelegations.inc({ asset_type: assetType });
  }

  /**
   * Decrement active delegations
   */
  decrementActiveDelegations(assetType: 'NFT' | 'CNFT'): void {
    this.activeDelegations.dec({ asset_type: assetType });
  }

  // =========================================================================
  // Settlement Tracking Methods
  // =========================================================================

  /**
   * Record a settlement operation
   */
  recordSettlement(
    outcome: SettlementOutcome,
    swapType: SwapTypeLabel,
    durationSeconds: number,
    errorCategory?: ErrorCategory
  ): void {
    this.settlementTotal.inc({ outcome, swap_type: swapType });
    this.settlementDuration.observe({ outcome, swap_type: swapType }, durationSeconds);

    if (outcome === 'success') {
      this.settlementSuccess.inc({ swap_type: swapType });
      this.lastSuccessfulOperation.set({ operation: 'settlement' }, Date.now() / 1000);
    } else if (outcome !== 'partial') {
      this.settlementFailure.inc({
        swap_type: swapType,
        error_category: errorCategory || 'unknown',
      });
    }
  }

  /**
   * Record a settlement chunk completion
   */
  recordSettlementChunk(swapType: SwapTypeLabel): void {
    this.settlementChunks.inc({ swap_type: swapType });
  }

  /**
   * Record a settlement retry
   */
  recordSettlementRetry(swapType: SwapTypeLabel, reason: string): void {
    this.settlementRetries.inc({ swap_type: swapType, retry_reason: reason });
  }

  /**
   * Update settlements in progress count
   */
  setSettlementInProgress(swapType: SwapTypeLabel, count: number): void {
    this.settlementInProgress.set({ swap_type: swapType }, count);
  }

  /**
   * Increment settlements in progress
   */
  incrementSettlementInProgress(swapType: SwapTypeLabel): void {
    this.settlementInProgress.inc({ swap_type: swapType });
  }

  /**
   * Decrement settlements in progress
   */
  decrementSettlementInProgress(swapType: SwapTypeLabel): void {
    this.settlementInProgress.dec({ swap_type: swapType });
  }

  // =========================================================================
  // Swap Lifecycle Tracking Methods
  // =========================================================================

  /**
   * Record swap creation
   */
  recordSwapCreated(swapType: SwapTypeLabel): void {
    this.swapCreated.inc({ swap_type: swapType });
    this.lastSuccessfulOperation.set({ operation: 'swap_create' }, Date.now() / 1000);
  }

  /**
   * Record swap completion
   */
  recordSwapCompleted(swapType: SwapTypeLabel): void {
    this.swapCompleted.inc({ swap_type: swapType });
    this.lastSuccessfulOperation.set({ operation: 'swap_complete' }, Date.now() / 1000);
  }

  /**
   * Record swap failure
   */
  recordSwapFailed(swapType: SwapTypeLabel, errorCategory: ErrorCategory): void {
    this.swapFailed.inc({ swap_type: swapType, error_category: errorCategory });
  }

  /**
   * Record swap cancellation
   */
  recordSwapCancelled(swapType: SwapTypeLabel, cancelledBy: 'party_a' | 'party_b' | 'system'): void {
    this.swapCancelled.inc({ swap_type: swapType, cancelled_by: cancelledBy });
  }

  /**
   * Record swap expiration
   */
  recordSwapExpired(swapType: SwapTypeLabel, expiredAtPhase: SwapPhase): void {
    this.swapExpired.inc({ swap_type: swapType, expired_at_phase: expiredAtPhase });
  }

  /**
   * Record swap phase duration
   */
  recordSwapPhaseDuration(phase: SwapPhase, swapType: SwapTypeLabel, durationSeconds: number): void {
    this.swapPhaseDuration.observe({ phase, swap_type: swapType }, durationSeconds);
  }

  /**
   * Record swap phase transition
   */
  recordSwapPhaseTransition(
    fromPhase: SwapPhase,
    toPhase: SwapPhase,
    swapType: SwapTypeLabel
  ): void {
    this.swapPhaseTransitions.inc({
      from_phase: fromPhase,
      to_phase: toPhase,
      swap_type: swapType,
    });
  }

  /**
   * Update active swaps by status
   */
  setActiveSwapsByStatus(status: SwapPhase, swapType: SwapTypeLabel, count: number): void {
    this.activeSwapsByStatus.set({ status, swap_type: swapType }, count);
  }

  // =========================================================================
  // Error Tracking Methods
  // =========================================================================

  /**
   * Record an error by category
   */
  recordError(category: ErrorCategory, operation: string): void {
    this.errorsByCategory.inc({ category, operation });
  }

  /**
   * Record a rate limit hit
   */
  recordRateLimitHit(service: string, endpoint: string): void {
    this.rateLimitHits.inc({ service, endpoint });
  }

  // =========================================================================
  // Health Tracking Methods
  // =========================================================================

  /**
   * Set service health status
   */
  setServiceHealth(component: string, healthy: boolean): void {
    this.serviceHealth.set({ component }, healthy ? 1 : 0);
  }

  // =========================================================================
  // Utility Methods
  // =========================================================================

  /**
   * Create a timer for measuring operation duration
   * Returns a function that when called, records the duration
   */
  startTimer(): () => number {
    const start = process.hrtime.bigint();
    return () => {
      const end = process.hrtime.bigint();
      return Number(end - start) / 1e9; // Convert nanoseconds to seconds
    };
  }

  /**
   * Get the Prometheus registry
   */
  getRegistry(): Registry {
    return this.registry;
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Get metrics content type
   */
  getContentType(): string {
    return this.registry.contentType;
  }

  /**
   * Reset all metrics (useful for testing)
   */
  resetMetrics(): void {
    this.registry.resetMetrics();
    console.log('[DelegationMetricsService] All metrics reset');
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let metricsServiceInstance: DelegationMetricsService | null = null;

/**
 * Get or create the metrics service singleton
 */
export function getDelegationMetricsService(config?: Partial<MetricsConfig>): DelegationMetricsService {
  if (!metricsServiceInstance) {
    metricsServiceInstance = new DelegationMetricsService(config);
  }
  return metricsServiceInstance;
}

/**
 * Reset the metrics service singleton (useful for testing)
 */
export function resetDelegationMetricsService(): void {
  if (metricsServiceInstance) {
    metricsServiceInstance.resetMetrics();
    metricsServiceInstance = null;
  }
}

export default DelegationMetricsService;
