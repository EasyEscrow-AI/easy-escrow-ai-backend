# Jito Congestion Tuning (Production)

This project supports several environment variables to improve reliability during periods of high Solana/Jito congestion.

These settings are designed to:
- Reduce `HTTP 429` / `-32097` errors from Jito Block Engine status endpoints
- Keep bundle submission and confirmation working when status endpoints are rate limited
- Avoid DAS proof failures when the primary DAS RPC (e.g. QuickNode) is rate limited

## 1) Use a regional Jito Block Engine URL (highest impact)

Configure the Jito Block Engine base URL to a regional endpoint closest to your server, and ensure **all** Jito calls use that same region (send + status).

- **Env var**: `JITO_BLOCK_ENGINE_URL`
- **Example**: `https://singapore.mainnet.block-engine.jito.wtf`

Why: the global endpoint can be more congested; regional endpoints often have better availability during spikes.

Reference:
- QuickNode guide on bundles and tipping: `https://www.quicknode.com/guides/solana-development/transactions/jito-bundles#what-you-will-need`

## 2) Optional auth for higher limits

If you have a UUID allowlist / higher-tier access, configure it as a secret.

- **Env var**: `JITO_AUTH_UUID`
- **Behavior**: sent as `x-jito-auth` header on Jito HTTP requests

## 3) Status cooldown (avoid hammering Jito status endpoints)

When Jito returns global rate limiting (`HTTP 429` or `-32097`), the service enters a short cooldown window:
- Jito status calls return "Pending" (no-signal)
- Confirmation relies more heavily on Solana RPC signature status checks

- **Env var**: `JITO_STATUS_COOLDOWN_MS`
- **Default**: `10000` (10s)

Related concept: Jito low-latency send rate limiting guidance:
- `https://docs.jito.wtf/lowlatencytxnsend/`

## 4) Global Jito HTTP request pacing (cross-pod)

Jito rate limits are effectively per public IP / region. In production with multiple instances behind one NAT, this project uses a **Redis-backed distributed limiter** to coordinate pacing across instances.

- **Env var**: `JITO_HTTP_MIN_INTERVAL_MS`
- **Default**: `1000` (1 request / second)

Notes:
- The limiter is shared across bundle submission and status checks.
- Invalid values fall back safely to the default.

## 5) DAS proof failover (QuickNode 429 / -32007)

If the primary DAS RPC is rate limited when fetching `getAssetProof`, the service retries once against the configured batch RPC (typically Helius).

To ensure this works:
- Set `SOLANA_RPC_URL` to your preferred primary RPC
- Set `SOLANA_RPC_URL_BATCH` to a DAS-friendly RPC (Helius recommended)

## Security note (secrets)

Do **not** commit real values for:
- `JITO_AUTH_UUID`
- RPC URLs containing provider API keys

Use your deployment platform’s secret manager for production values.


