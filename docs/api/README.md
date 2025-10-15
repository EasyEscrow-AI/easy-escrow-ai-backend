# EasyEscrow.ai API Documentation

Welcome to the EasyEscrow.ai API documentation. This comprehensive guide covers everything you need to integrate with our escrow platform.

## Quick Links

- **[OpenAPI Specification](./openapi.yaml)** - Complete API reference in OpenAPI 3.0 format
- **[Integration Guide](./INTEGRATION_GUIDE.md)** - Step-by-step integration guide with code examples
- **[Webhook Events](./WEBHOOK_EVENTS.md)** - Real-time webhook event documentation
- **[Error Codes](./ERROR_CODES.md)** - Complete error reference and troubleshooting

## Overview

EasyEscrow.ai provides a secure escrow platform for NFT purchases on the Solana blockchain. Our API enables you to:

- Create and manage escrow agreements
- Track USDC and NFT deposits
- Receive real-time webhook notifications
- Generate and verify settlement receipts
- Monitor transaction logs
- Handle expiry and refunds

## Getting Started

### 1. Choose Your Environment

| Environment | Base URL | Purpose |
|-------------|----------|---------|
| Development | `http://localhost:3000` | Local development |
| Devnet | `https://devnet-api.easyescrow.ai` | Testing with devnet tokens |
| Mainnet | `https://api.easyescrow.ai` | Production |

### 2. Review the Documentation

Start with the **[Integration Guide](./INTEGRATION_GUIDE.md)** for a complete walkthrough.

### 3. Set Up Webhooks

Configure webhooks to receive real-time event notifications. See **[Webhook Events](./WEBHOOK_EVENTS.md)**.

### 4. Test Your Integration

Use the devnet environment to test your integration before going live.

## API Structure

### Core Endpoints

#### Agreements
- `POST /v1/agreements` - Create escrow agreement
- `GET /v1/agreements` - List agreements
- `GET /v1/agreements/{id}` - Get agreement details
- `POST /v1/agreements/{id}/cancel` - Cancel expired agreement

#### Receipts
- `GET /v1/receipts` - List receipts
- `GET /v1/receipts/{id}` - Get receipt by ID
- `GET /v1/receipts/agreement/{id}` - Get receipt by agreement
- `POST /v1/receipts/{id}/verify` - Verify receipt signature

#### Transactions
- `GET /v1/transactions` - List transaction logs
- `GET /v1/transactions/logs/{txId}` - Get transaction by ID
- `GET /v1/transactions/agreements/{id}` - Get agreement transactions
- `GET /v1/transactions/stats/{id}` - Get transaction statistics

#### Webhooks
- `GET /api/webhooks/{agreementId}` - Get webhooks for agreement
- `GET /api/webhooks/status/{webhookId}` - Get webhook delivery status
- `POST /api/webhooks/retry/{webhookId}` - Retry webhook delivery
- `GET /api/webhooks/config` - Get webhook configurations

## Quick Start

### Create an Escrow Agreement

```bash
curl -X POST https://api.easyescrow.ai/v1/agreements \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: unique-key-12345" \
  -d '{
    "nftMint": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "price": "1000000000",
    "seller": "SellerPublicKey...",
    "buyer": "BuyerPublicKey...",
    "expiry": "2024-12-31T23:59:59Z",
    "feeBps": 250,
    "honorRoyalties": true
  }'
```

### Check Agreement Status

```bash
curl https://api.easyescrow.ai/v1/agreements/AGR-1234567890
```

### Get Settlement Receipt

```bash
curl https://api.easyescrow.ai/v1/receipts/agreement/AGR-1234567890
```

## Rate Limits

| Endpoint Type | Rate Limit | Window |
|---------------|------------|--------|
| Standard | 100 requests | 15 minutes |
| Strict (Agreement Creation) | 10 requests | 15 minutes |

Rate limit headers are included in all responses:
- `X-RateLimit-Limit` - Total allowed requests
- `X-RateLimit-Remaining` - Remaining requests
- `X-RateLimit-Reset` - Unix timestamp when limit resets

## Webhook Events

All escrow lifecycle events trigger webhooks:

- `ESCROW_FUNDED` - First deposit received
- `ESCROW_ASSET_LOCKED` - USDC or NFT locked
- `ESCROW_SETTLED` - Escrow successfully settled
- `ESCROW_EXPIRED` - Agreement expired
- `ESCROW_REFUNDED` - Funds refunded

See **[Webhook Events](./WEBHOOK_EVENTS.md)** for complete documentation.

## Error Handling

All errors follow a consistent format:

```json
{
  "success": false,
  "error": "Error Type",
  "message": "Detailed error message",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

See **[Error Codes](./ERROR_CODES.md)** for complete error reference.

## Support

- **Email**: support@easyescrow.ai
- **Discord**: [Join our community](https://discord.gg/easyescrow)
- **Documentation**: https://docs.easyescrow.ai

## API Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-01-15 | Initial API release |

## Additional Resources

- **Architecture Docs**: `../architecture/`
- **Testing Docs**: `../testing/`
- **Deployment Guide**: `../DEPLOYMENT_GUIDE.md`

---

**Built with ❤️ by the EasyEscrow.ai team**

