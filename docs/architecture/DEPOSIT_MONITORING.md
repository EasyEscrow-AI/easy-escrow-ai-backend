# Deposit Monitoring System

## Overview

The Deposit Monitoring System is a comprehensive service that automatically monitors Solana blockchain accounts for USDC and NFT deposits related to escrow agreements. This system ensures that deposits are detected, validated, and processed in real-time.

## Architecture

### Components

1. **MonitoringOrchestratorService** (`src/services/monitoring-orchestrator.service.ts`)
   - High-level orchestration of monitoring operations
   - Service lifecycle management (start/stop/restart)
   - Health checks and metrics collection
   - Error recovery with automatic restarts
   - Coordinates deposit monitoring and settlement services

2. **MonitoringService** (`src/services/monitoring.service.ts`)
   - Core monitoring logic for escrow accounts
   - WebSocket subscriptions to Solana accounts
   - Fallback polling mechanism for reliability
   - Account change event handling
   - Dynamic monitoring of new agreements

3. **UsdcDepositService** (`src/services/usdc-deposit.service.ts`)
   - USDC deposit detection and validation
   - Token account balance verification
   - Deposit confirmation and database updates

4. **NftDepositService** (`src/services/nft-deposit.service.ts`)
   - NFT deposit detection and validation
   - NFT ownership verification
   - Metadata extraction and storage

5. **DepositDatabaseService** (`src/services/deposit-database.service.ts`)
   - Atomic database operations for deposits
   - Transaction logging and audit trails
   - Agreement status updates

## Features

### Real-time Monitoring
- **WebSocket Subscriptions**: Primary mechanism for detecting account changes
- **Fallback Polling**: Periodic polling every 10 seconds for reliability
- **Auto-reload**: Automatically starts monitoring new agreements when created

### Error Handling & Reliability
- **Automatic Restarts**: Up to 5 automatic restarts with 5-second delays
- **Health Checks**: Periodic health checks every 30 seconds
- **Graceful Degradation**: Continues monitoring other accounts if one fails
- **Error Logging**: Comprehensive error tracking and reporting

### Metrics & Monitoring
- **Real-time Metrics**: Track deposits detected, processed, and failed
- **Uptime Tracking**: Monitor service uptime and restart count
- **Account Tracking**: Number of accounts currently being monitored
- **Periodic Reporting**: Metrics logged every 60 seconds

## Configuration

The monitoring orchestrator can be configured with the following options:

```typescript
{
  autoRestart: true,              // Enable automatic restarts on failure
  maxRestarts: 5,                 // Maximum number of restart attempts
  restartDelayMs: 5000,          // Delay between restart attempts (ms)
  healthCheckIntervalMs: 30000,  // Health check interval (ms)
  metricsIntervalMs: 60000       // Metrics collection interval (ms)
}
```

## Usage

### Starting the Monitoring Service

The monitoring service starts automatically when the application starts:

```typescript
// In src/index.ts
const monitoringOrchestrator = getMonitoringOrchestrator({
  autoRestart: true,
  maxRestarts: 5,
  restartDelayMs: 5000,
  healthCheckIntervalMs: 30000,
  metricsIntervalMs: 60000,
});

await monitoringOrchestrator.start();
```

### Creating New Agreements

When a new agreement is created, monitoring is automatically triggered:

```typescript
// In src/services/agreement.service.ts
const orchestrator = getMonitoringOrchestrator();
if (orchestrator.isServiceRunning()) {
  await orchestrator.reloadAgreements();
}
```

### Health Check

Check the monitoring service health via the `/health` endpoint:

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-13T10:45:00.000Z",
  "service": "easy-escrow-ai-backend",
  "database": "connected",
  "monitoring": {
    "status": "running",
    "monitoredAccounts": 5,
    "uptime": "120 minutes",
    "restartCount": 0,
    "solanaHealthy": true
  }
}
```

## Monitoring Flow

### 1. Agreement Creation
```
User creates agreement
    ↓
Agreement stored in database with PENDING status
    ↓
Monitoring orchestrator reloads agreements
    ↓
MonitoringService subscribes to USDC and NFT deposit addresses
```

### 2. Deposit Detection
```
Deposit made to monitored address
    ↓
WebSocket notification received
    ↓
Account change handler triggered
    ↓
Deposit validation (amount, owner, etc.)
    ↓
Database updated with deposit record
    ↓
Agreement status updated (USDC_LOCKED or NFT_LOCKED)
    ↓
If both deposits locked: Status = BOTH_LOCKED
    ↓
Stop monitoring that address
```

### 3. Settlement Trigger
```
Both USDC and NFT deposited (BOTH_LOCKED)
    ↓
Settlement service processes the trade
    ↓
Agreement status updated to SETTLED
```

## Database Schema

### Deposit Table
```sql
CREATE TABLE "Deposit" (
  "id" TEXT PRIMARY KEY,
  "agreementId" TEXT NOT NULL,
  "type" "DepositType" NOT NULL,  -- USDC or NFT
  "depositor" TEXT NOT NULL,
  "amount" DECIMAL,
  "tokenAccount" TEXT NOT NULL,
  "status" "DepositStatus" NOT NULL,  -- PENDING or CONFIRMED
  "txId" TEXT,
  "blockHeight" BIGINT,
  "nftMetadata" JSONB,
  "createdAt" TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP NOT NULL,
  FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id")
);
```

### Transaction Log Table
```sql
CREATE TABLE "TransactionLog" (
  "id" TEXT PRIMARY KEY,
  "agreementId" TEXT NOT NULL,
  "txId" TEXT NOT NULL,
  "operationType" TEXT NOT NULL,  -- init, deposit, settle, cancel
  "status" TEXT NOT NULL,         -- success, failed, pending
  "blockHeight" BIGINT,
  "slot" BIGINT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP NOT NULL,
  FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id")
);
```

## Graceful Shutdown

The system supports graceful shutdown to ensure clean service termination:

```typescript
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Starting graceful shutdown...');
  await monitoringOrchestrator.stop();
  process.exit(0);
});
```

This ensures:
- All WebSocket subscriptions are closed
- Monitoring timers are cleared
- Database connections are cleaned up
- Settlement service is stopped

## Logging

The system provides comprehensive logging:

### Info Logs
- Service start/stop events
- Account monitoring start/stop
- Deposit detection and processing
- Health check results
- Metrics collection

### Error Logs
- Monitoring failures
- Deposit validation errors
- Database operation failures
- Restart attempts

### Example Logs
```
[MonitoringOrchestrator] Starting orchestrator...
[MonitoringService] Initialized
[MonitoringService] Loading pending agreements...
[MonitoringService] Found 3 agreements to monitor
[MonitoringService] Starting to monitor usdc account: ABC123...
[MonitoringService] Account change detected for usdc account: ABC123...
[MonitoringService] Successfully processed USDC deposit: 100.5 USDC
[MonitoringOrchestrator] Health check: { solanaHealthy: true, monitoringRunning: true, monitoredAccounts: 6 }
```

## Performance Considerations

### WebSocket vs Polling
- **Primary**: WebSocket subscriptions for instant notifications
- **Fallback**: Polling every 10 seconds for reliability
- **Reason**: WebSocket connections can drop; polling ensures no missed events

### Resource Usage
- **Memory**: Minimal overhead per monitored account (~1KB)
- **Network**: WebSocket connections + periodic polling
- **Database**: Efficient queries with proper indexing

### Scalability
- Supports monitoring hundreds of agreements simultaneously
- Efficient batch account info fetching
- Configurable polling intervals for performance tuning

## Testing

### Manual Testing

1. Start the server:
```bash
npm run dev
```

2. Create an agreement:
```bash
curl -X POST http://localhost:3000/v1/agreements \
  -H "Content-Type: application/json" \
  -d '{
    "nft_mint": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "price": 100.50,
    "seller": "SellerPublicKey11111111111111111111111111111",
    "buyer": "BuyerPublicKey111111111111111111111111111111",
    "expiry": "2025-12-31T23:59:59Z",
    "fee_bps": 250,
    "honor_royalties": true
  }'
```

3. Check monitoring status:
```bash
curl http://localhost:3000/health
```

4. Monitor console logs for deposit detection

### Automated Testing
```bash
npm test
```

## Troubleshooting

### Monitoring Service Not Starting
- Check Solana RPC connection
- Verify database connectivity
- Check environment variables

### Deposits Not Detected
- Verify account subscriptions in logs
- Check Solana network status
- Ensure correct deposit addresses

### High Restart Count
- Check Solana RPC endpoint health
- Verify network connectivity
- Review error logs for root cause

## Future Enhancements

1. **Webhook Notifications**: Alert external systems of deposit events
2. **Retry Logic**: Enhanced retry mechanisms for failed deposits
3. **Multiple RPC Endpoints**: Failover to backup RPC endpoints
4. **Dashboard**: Real-time monitoring dashboard
5. **Alerting**: Email/SMS alerts for critical issues

## Related Documentation

- [API Documentation](./API_DOCUMENTATION.md)
- [Database Setup](./DATABASE_SETUP.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Solana Setup](./SOLANA_SETUP.md)

## Support

For issues or questions about deposit monitoring, please:
1. Check the logs for detailed error messages
2. Review the health check endpoint
3. Consult this documentation
4. Contact the development team

---

**Status**: ✅ Implemented (Task 25)  
**Version**: 1.0.0  
**Last Updated**: October 13, 2025

