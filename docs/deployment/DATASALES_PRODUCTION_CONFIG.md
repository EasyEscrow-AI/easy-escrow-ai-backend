# DataSales Production Configuration

## Environment Variables Required

Set these in DigitalOcean App Platform for the production backend:

```bash
# DataSales Feature Flag
DATASALES_ENABLED=true

# DataSales API Key (generated)
DATASALES_API_KEY=1af6b4a10d723f3e9d15623d46290c7a915a4ed820fc026d26077ebe017d4f18

# AWS S3 Configuration (reuse staging credentials or create production-specific)
AWS_ACCESS_KEY_ID=<your-aws-access-key>
AWS_SECRET_ACCESS_KEY=<your-aws-secret-key>
AWS_S3_REGION=us-east-1
AWS_S3_BUCKET_PREFIX=datasales-

# CORS Origins for S3 Buckets
DATASALES_ALLOWED_ORIGINS=https://datasales.ai,https://www.datasales.ai
```

## Database Migration

Run the production migration script with admin credentials:

```bash
# Set the production database URL and run migration
PRODUCTION_DATABASE_URL="postgresql://doadmin:PASSWORD@HOST:25060/easyescrow_production" \
  node scripts/run-production-migration.js
```

This creates:
- `DataSalesStatus` enum with all status values
- `datasales_agreements` table with all required columns
- All necessary indexes for performance

## Production API Endpoints

Base URL: `https://api.easyescrow.ai`

All DataSales endpoints are under `/api/datasales/*`:
- `POST /api/datasales/agreements` - Create agreement
- `GET /api/datasales/agreements/:id` - Get agreement
- `POST /api/datasales/agreements/:id/approve` - Approve data (API key required)
- `POST /api/datasales/agreements/:id/settle` - Execute settlement (API key required)
- See `docs/api/DATASALES_API.md` for full endpoint reference

## On-Chain Program

- **Program ID:** `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx`
- **IDL:** 33 instructions including DataSales escrow operations
- **Deploy TX:** `4UXeVqTYxMjvDfPhvHALa3RDQ5qKmEtVLT1qE57rq38ea2z5fgEwziQNWwNHdbLAK7cfR8hTxYZUq7pycLKaATFv`

## Credentials to Share with DataSales.ai Team

| Item | Value |
|------|-------|
| Production API Base URL | `https://api.easyescrow.ai` |
| API Key Header | `X-DataSales-API-Key` |
| API Key Value | `1af6b4a10d723f3e9d15623d46290c7a915a4ed820fc026d26077ebe017d4f18` |
| Documentation | `docs/api/DATASALES_API.md` |

## Verification Checklist

After configuration:

1. [ ] Environment variables set in DigitalOcean
2. [ ] Database migration completed successfully
3. [ ] Backend redeployed with new env vars
4. [ ] Health check passes: `curl https://api.easyescrow.ai/health`
5. [ ] Test API key authentication:
   ```bash
   curl -H "X-DataSales-API-Key: 1af6b4a10d723f3e9d15623d46290c7a915a4ed820fc026d26077ebe017d4f18" \
     https://api.easyescrow.ai/api/datasales/agreements
   ```

## Rate Limiting

The existing rate limiting middleware applies to DataSales endpoints:
- 100 requests per minute per IP (general)
- Protected endpoints require valid API key

## Monitoring

Monitor these for DataSales operations:
- Failed settlement transactions
- S3 bucket creation errors
- High error rates on DataSales endpoints
- Scheduler job failures (timeout handler, cleanup handler)
