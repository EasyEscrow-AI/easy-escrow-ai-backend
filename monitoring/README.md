# EasyEscrow Monitoring Setup

This directory contains Prometheus metrics and Grafana dashboard configurations for monitoring delegation-based settlement operations.

## Overview

The monitoring system tracks:
- **Delegation Metrics**: cNFT delegation operations (success/failure/latency)
- **Settlement Metrics**: Settlement execution, chunking, and retries
- **Swap Metrics**: Two-phase swap lifecycle (created/completed/failed/cancelled/expired)
- **Error Metrics**: Categorized errors and rate limit tracking
- **Health Metrics**: Service component health status

## Metrics Endpoint

The `/metrics` endpoint exposes Prometheus-compatible metrics:

```bash
# Fetch metrics
curl http://localhost:3000/metrics

# Health check for metrics service
curl http://localhost:3000/metrics/health

# Metrics in JSON format (debugging)
curl http://localhost:3000/metrics/json
```

## Available Metrics

### Delegation Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `easyescrow_delegation_total` | Counter | Total delegation operations |
| `easyescrow_delegation_success_total` | Counter | Successful delegations |
| `easyescrow_delegation_failure_total` | Counter | Failed delegations |
| `easyescrow_delegation_latency_seconds` | Histogram | Delegation latency |
| `easyescrow_active_delegations` | Gauge | Currently active delegations |

### Settlement Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `easyescrow_settlement_total` | Counter | Total settlement attempts |
| `easyescrow_settlement_success_total` | Counter | Successful settlements |
| `easyescrow_settlement_failure_total` | Counter | Failed settlements |
| `easyescrow_settlement_duration_seconds` | Histogram | Settlement duration |
| `easyescrow_settlement_chunks_total` | Counter | Settlement chunks processed |
| `easyescrow_settlement_retries_total` | Counter | Settlement retries |
| `easyescrow_settlement_in_progress` | Gauge | Settlements in progress |

### Swap Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `easyescrow_swap_created_total` | Counter | Swaps created |
| `easyescrow_swap_completed_total` | Counter | Swaps completed |
| `easyescrow_swap_failed_total` | Counter | Swaps failed |
| `easyescrow_swap_cancelled_total` | Counter | Swaps cancelled |
| `easyescrow_swap_expired_total` | Counter | Swaps expired |
| `easyescrow_swap_phase_duration_seconds` | Histogram | Phase durations |
| `easyescrow_active_swaps_by_status` | Gauge | Active swaps by status |
| `easyescrow_swap_phase_transitions_total` | Counter | Phase transitions |

### Error Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `easyescrow_errors_by_category_total` | Counter | Errors by category |
| `easyescrow_rate_limit_hits_total` | Counter | Rate limit hits |

### Health Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `easyescrow_service_health` | Gauge | Service health (1=healthy, 0=unhealthy) |
| `easyescrow_last_successful_operation_timestamp` | Gauge | Last successful operation timestamp |

## Prometheus Configuration

Add the following to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'easyescrow'
    scrape_interval: 15s
    static_configs:
      - targets: ['api.easyescrow.ai:443']
    scheme: https
    metrics_path: /metrics
```

## Alerting Rules

Import the alerting rules from `prometheus/alerts.yml`:

```yaml
rule_files:
  - /path/to/monitoring/prometheus/alerts.yml
```

### Alert Summary

| Alert | Severity | Description |
|-------|----------|-------------|
| HighSwapFailureRate | Critical | Swap failure rate > 5% |
| StuckSwaps | Warning | Swaps stuck for > 10 min |
| SettlementTimeout | Warning | Settlement p99 > 5 min |
| HighDelegationFailureRate | Critical | Delegation failure rate > 5% |
| HighDelegationLatency | Warning | Delegation p95 > 10 seconds |
| NetworkErrorsSpike | Warning | Network errors > 1/sec |
| RateLimitingActive | Warning | Rate limiting triggered |
| StaleProofErrors | Warning | Stale proof errors detected |
| ServiceUnhealthy | Critical | Service component unhealthy |
| NoRecentOperations | Warning | No successful swaps in 30 min |

## Grafana Dashboard

Import the dashboard from `grafana/delegation-settlement-dashboard.json`:

1. Open Grafana
2. Go to Dashboards > Import
3. Upload the JSON file or paste its contents
4. Select your Prometheus data source
5. Click Import

### Dashboard Panels

- **Overview**: Swap counts and success rate (24h)
- **Delegation Metrics**: Operations rate and latency percentiles
- **Settlement Metrics**: Operations rate, duration, chunks, and in-progress
- **Swap Lifecycle**: Active swaps by status over time
- **Errors**: Errors by category and rate limit hits

## Integration

### Using the Metrics Service

```typescript
import { getDelegationMetricsService } from './services/delegationMetrics.service';

const metrics = getDelegationMetricsService();

// Record a delegation operation
const timer = metrics.startTimer();
try {
  await performDelegation();
  const duration = timer();
  metrics.recordDelegation('success', 'CNFT', duration);
} catch (error) {
  const duration = timer();
  metrics.recordDelegation('failure', 'CNFT', duration, 'network');
}

// Record swap lifecycle events
metrics.recordSwapCreated('cnft_for_sol');
metrics.recordSwapPhaseTransition('created', 'accepted', 'cnft_for_sol');
metrics.recordSwapCompleted('cnft_for_sol');

// Record settlements
metrics.recordSettlement('success', 'cnft_for_sol', duration);
metrics.recordSettlementChunk('cnft_for_sol');

// Track errors
metrics.recordError('network', 'delegation');
metrics.recordRateLimitHit('das_api', 'getAssetProof');
```

## Troubleshooting

### Metrics Not Showing

1. Verify the metrics endpoint is accessible:
   ```bash
   curl http://localhost:3000/metrics/health
   ```

2. Check Prometheus scrape status in the Prometheus UI targets page

3. Ensure the service is properly initialized:
   ```bash
   curl http://localhost:3000/metrics/json | jq '.metricsCount'
   ```

### Missing Labels

Labels are applied based on the operation context. Ensure you're passing the correct parameters when recording metrics:

- `asset_type`: 'NFT' | 'CNFT'
- `swap_type`: 'nft_for_sol' | 'cnft_for_sol' | etc.
- `error_category`: 'network' | 'validation' | 'timeout' | etc.

## Related Documentation

- [Task 16: Monitoring and Observability](../.taskmaster/tasks/)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
