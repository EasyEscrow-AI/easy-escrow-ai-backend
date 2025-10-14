# Webhook System Documentation

## Overview

The EasyEscrow.ai webhook system provides real-time notifications for escrow lifecycle events. This allows external systems to react to escrow state changes without polling the API.

## Features

- **Event Types**: Support for all escrow lifecycle events
- **Reliable Delivery**: Exponential backoff retry mechanism with up to 5 attempts
- **Security**: HMAC-SHA256 signature verification for webhook authenticity
- **Async Processing**: Non-blocking webhook delivery with queue system
- **Status Tracking**: Full delivery status and retry history

## Supported Events

The webhook system publishes the following event types:

### 1. `ESCROW_FUNDED`
Triggered when the first deposit is received for an escrow agreement.

**Payload:**
```json
{
  "eventType": "ESCROW_FUNDED",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "agreementId": "AGR-123456",
  "price": "1000000000",
  "seller": "SellerPublicKey...",
  "buyer": "BuyerPublicKey...",
  "nftMint": "NFTMintAddress...",
  "escrowPda": "EscrowPDAAddress..."
}
```

### 2. `ESCROW_ASSET_LOCKED`
Triggered when USDC or NFT is locked in the escrow.

**Payload:**
```json
{
  "eventType": "ESCROW_ASSET_LOCKED",
  "timestamp": "2024-01-01T12:05:00.000Z",
  "agreementId": "AGR-123456",
  "assetType": "USDC",
  "depositor": "DepositorPublicKey...",
  "amount": "1000000000",
  "tokenAccount": "TokenAccountAddress...",
  "txId": "TransactionSignature..."
}
```

### 3. `ESCROW_SETTLED`
Triggered when an escrow is successfully settled and all parties receive their assets.

**Payload:**
```json
{
  "eventType": "ESCROW_SETTLED",
  "timestamp": "2024-01-01T12:10:00.000Z",
  "agreementId": "AGR-123456",
  "nftMint": "NFTMintAddress...",
  "price": "1000000000",
  "platformFee": "25000000",
  "creatorRoyalty": "50000000",
  "sellerReceived": "925000000",
  "buyer": "BuyerPublicKey...",
  "seller": "SellerPublicKey...",
  "settleTxId": "SettlementTransactionSignature..."
}
```

### 4. `ESCROW_EXPIRED`
Triggered when an escrow agreement expires without settlement.

**Payload:**
```json
{
  "eventType": "ESCROW_EXPIRED",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "agreementId": "AGR-123456",
  "expiry": "2024-01-01T11:59:59.000Z",
  "status": "BOTH_LOCKED"
}
```

### 5. `ESCROW_REFUNDED`
Triggered when an escrow is cancelled and funds are refunded to depositors.

**Payload:**
```json
{
  "eventType": "ESCROW_REFUNDED",
  "timestamp": "2024-01-01T12:15:00.000Z",
  "agreementId": "AGR-123456",
  "cancelTxId": "CancellationTransactionSignature...",
  "refundedTo": "RefundRecipientPublicKey..."
}
```

## Configuration

Configure webhooks using environment variables:

```env
# Webhook Configuration
WEBHOOK_URL=https://your-domain.com/webhook
WEBHOOK_SECRET=your-secret-key-at-least-16-characters
WEBHOOK_EVENTS=ESCROW_FUNDED,ESCROW_SETTLED  # Optional, defaults to all events
```

### Multiple Webhook Endpoints

For multiple webhook endpoints, you can programmatically register them using the webhook service:

```typescript
import { webhookService } from './services/webhook.service';

webhookService.registerWebhook({
  id: 'production-webhook',
  url: 'https://prod.example.com/webhook',
  secret: 'your-production-secret',
  events: ['ESCROW_SETTLED', 'ESCROW_REFUNDED'],
  enabled: true,
});
```

## Webhook Signature Verification

All webhook requests include an `X-Webhook-Signature` header containing an HMAC-SHA256 signature of the payload.

### Verification Example (Node.js)

```typescript
import crypto from 'crypto';

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
    
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// In your webhook endpoint
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = JSON.stringify(req.body);
  
  if (!verifyWebhookSignature(payload, signature, process.env.WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Process webhook...
  res.status(200).json({ received: true });
});
```

### Verification Example (Python)

```python
import hmac
import hashlib

def verify_webhook_signature(payload: str, signature: str, secret: str) -> bool:
    expected_signature = hmac.new(
        secret.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(signature, expected_signature)
```

## Retry Logic

The webhook system implements exponential backoff retry logic:

- **Max Attempts**: 5
- **Retry Schedule**: 2s, 4s, 8s, 16s, 32s (exponential backoff)
- **Success Criteria**: HTTP 2xx response
- **Timeout**: 10 seconds per attempt

Failed webhooks are automatically retried. After 5 failed attempts, the webhook is marked as `FAILED`.

## API Endpoints

### Get Webhooks for Agreement

```http
GET /api/webhooks/:agreementId
```

**Response:**
```json
{
  "success": true,
  "agreementId": "AGR-123456",
  "count": 3,
  "webhooks": [
    {
      "id": "webhook-uuid",
      "eventType": "ESCROW_FUNDED",
      "targetUrl": "https://example.com/webhook",
      "status": "DELIVERED",
      "attempts": 1,
      "maxAttempts": 5,
      "lastAttemptAt": "2024-01-01T12:00:00.000Z",
      "lastResponseCode": 200,
      "deliveredAt": "2024-01-01T12:00:00.000Z",
      "createdAt": "2024-01-01T12:00:00.000Z",
      "scheduledFor": "2024-01-01T12:00:00.000Z"
    }
  ]
}
```

### Get Webhook Status

```http
GET /api/webhooks/status/:webhookId
```

**Response:**
```json
{
  "success": true,
  "webhook": {
    "id": "webhook-uuid",
    "agreementId": "AGR-123456",
    "eventType": "ESCROW_SETTLED",
    "status": "DELIVERED",
    "attempts": 1,
    "lastResponseCode": 200,
    "lastResponseBody": "{\"received\":true}",
    "payload": { ... }
  }
}
```

### Retry Failed Webhook

```http
POST /api/webhooks/retry/:webhookId
```

**Response:**
```json
{
  "success": true,
  "message": "Webhook retry initiated",
  "webhookId": "webhook-uuid"
}
```

### Get Webhook Configurations

```http
GET /api/webhooks/config
```

**Response:**
```json
{
  "success": true,
  "count": 1,
  "configs": [
    {
      "id": "default",
      "url": "https://example.com/webhook",
      "events": ["ESCROW_FUNDED", "ESCROW_SETTLED"],
      "enabled": true
    }
  ]
}
```

### Cleanup Old Webhooks

```http
POST /api/webhooks/cleanup?days=30
```

**Response:**
```json
{
  "success": true,
  "message": "Cleaned up 150 old webhook records",
  "deletedCount": 150,
  "daysOld": 30
}
```

## Webhook Endpoint Requirements

Your webhook endpoint should:

1. **Respond quickly**: Return HTTP 2xx within 10 seconds
2. **Verify signatures**: Always verify the HMAC signature before processing
3. **Be idempotent**: Handle duplicate deliveries gracefully (same webhook may be sent multiple times)
4. **Process asynchronously**: Queue webhook for processing and respond immediately
5. **Return appropriate status codes**:
   - `200-299`: Success (webhook marked as delivered)
   - `4xx-5xx`: Failure (webhook will be retried)

## Example Webhook Handler

```typescript
import express from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.json());

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    // 1. Verify signature
    const signature = req.headers['x-webhook-signature'] as string;
    const payload = JSON.stringify(req.body);
    
    if (!verifySignature(payload, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    // 2. Parse event
    const event = req.body;
    console.log(`Received webhook: ${event.eventType} for ${event.agreementId}`);
    
    // 3. Queue for async processing (recommended)
    await queueWebhookProcessing(event);
    
    // 4. Respond quickly
    res.status(200).json({ received: true });
    
    // 5. Process event asynchronously
    // (processing happens in background queue)
    
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Processing failed' });
  }
});

function verifySignature(payload: string, signature: string): boolean {
  const secret = process.env.WEBHOOK_SECRET!;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

async function queueWebhookProcessing(event: any): Promise<void> {
  // Add to your job queue (e.g., Bull, RabbitMQ, SQS)
  // This ensures quick response to webhook sender
}

app.listen(3000, () => {
  console.log('Webhook handler listening on port 3000');
});
```

## Database Schema

The webhook system uses the following database table:

```prisma
model Webhook {
  id                String                @id @default(uuid())
  agreementId       String
  agreement         Agreement             @relation(fields: [agreementId], references: [id])
  eventType         WebhookEventType
  targetUrl         String
  payload           Json
  status            WebhookDeliveryStatus @default(PENDING)
  attempts          Int                   @default(0)
  maxAttempts       Int                   @default(5)
  lastAttemptAt     DateTime?
  lastResponseCode  Int?
  lastResponseBody  String?
  deliveredAt       DateTime?
  signature         String?
  createdAt         DateTime              @default(now())
  scheduledFor      DateTime              @default(now())
  
  @@index([agreementId])
  @@index([eventType])
  @@index([status])
  @@index([scheduledFor])
}
```

## Testing Webhooks

### Using ngrok for Local Development

```bash
# Start ngrok tunnel
ngrok http 3000

# Set webhook URL to ngrok URL
export WEBHOOK_URL=https://your-ngrok-url.ngrok.io/webhook
```

### Using webhook.site for Testing

1. Go to https://webhook.site
2. Copy the unique URL
3. Set as your webhook URL:
   ```env
   WEBHOOK_URL=https://webhook.site/unique-id
   ```

## Best Practices

1. **Always verify signatures**: Never trust unsigned webhooks
2. **Respond quickly**: Return 200 within 10 seconds
3. **Process asynchronously**: Queue webhooks for background processing
4. **Handle duplicates**: Use idempotency keys to prevent duplicate processing
5. **Log everything**: Keep detailed logs of webhook deliveries
6. **Monitor failures**: Alert on repeated webhook failures
7. **Secure your endpoint**: Use HTTPS and signature verification

## Troubleshooting

### Webhooks Not Being Delivered

1. Check webhook configuration:
   ```http
   GET /api/webhooks/config
   ```

2. Verify your endpoint is accessible:
   ```bash
   curl -X POST https://your-domain.com/webhook \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
   ```

3. Check webhook status:
   ```http
   GET /api/webhooks/:agreementId
   ```

### Failed Webhooks

1. Check webhook delivery status:
   ```http
   GET /api/webhooks/status/:webhookId
   ```

2. Review error response:
   - Check `lastResponseCode`
   - Check `lastResponseBody`

3. Manually retry:
   ```http
   POST /api/webhooks/retry/:webhookId
   ```

## Support

For webhook system support:
- Check logs: Review application logs for webhook delivery errors
- Check database: Query the `webhooks` table for delivery history
- Manual retry: Use the retry endpoint to resend failed webhooks
- Contact: Open an issue on GitHub

## Architecture

```
┌─────────────────┐
│  Escrow Event   │
│   (Settlement,  │
│   Deposit, etc) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Status Update   │
│    Service      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Webhook Events  │
│    Service      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Webhook Service │
│  (Queue + DB)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  HTTP Delivery  │
│  with Retries   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Your Webhook   │
│    Endpoint     │
└─────────────────┘
```

## Security Considerations

1. **Signature Verification**: Always verify HMAC signatures
2. **Secret Management**: Store webhook secrets securely (e.g., environment variables, secrets manager)
3. **HTTPS Only**: Use HTTPS for webhook endpoints
4. **Rate Limiting**: Implement rate limiting on your webhook endpoint
5. **IP Allowlisting**: Consider allowlisting webhook source IPs
6. **Audit Logging**: Log all webhook deliveries for audit purposes

## Performance

- **Async Processing**: Webhooks are delivered asynchronously without blocking main operations
- **Batched Processing**: Processes up to 10 webhooks at a time
- **Non-blocking**: Failed webhook deliveries don't impact escrow operations
- **Scalable**: Queue-based architecture supports high throughput

## Monitoring

Monitor webhook health:
- Delivery success rate
- Average delivery time
- Failed webhook count
- Retry attempts per webhook
- Response time percentiles

## Future Enhancements

- [ ] Dead letter queue for permanently failed webhooks
- [ ] Webhook event filtering per endpoint
- [ ] Custom retry schedules
- [ ] Webhook analytics dashboard
- [ ] Webhook test/simulation endpoint
- [ ] Multiple webhook URLs per user/organization
- [ ] User-specific webhook configuration UI

---

**Version**: 1.0.0  
**Last Updated**: 2024  
**Status**: Production Ready

