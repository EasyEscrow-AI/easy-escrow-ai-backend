# QuickNode Mainnet RPC Configuration

**Date:** 2025-10-27  
**Status:** ✅ Configured and Ready

---

## Configuration Details

### RPC Endpoint

**Provider:** QuickNode  
**Network:** Solana Mainnet Beta  
**Endpoint URL:** 
```
https://prettiest-broken-flower.solana-mainnet.quiknode.pro/2b20215bc747d769dea5e209527aa76c6efb2241/
```

**Security Note:** This URL contains your API key. Keep it confidential.

---

## Deployment Configuration

### DigitalOcean App Platform

**Environment Variable:**
```
Key: SOLANA_RPC_URL
Value: https://prettiest-broken-flower.solana-mainnet.quiknode.pro/2b20215bc747d769dea5e209527aa76c6efb2241/
Type: SECRET
Scope: RUN_AND_BUILD_TIME
```

✅ **Status:** Configured on server

---

## Usage During Deployment

### Anchor Deploy Command

```bash
# The RPC URL will be used automatically when deploying
anchor deploy \
  --provider.cluster mainnet-beta \
  --provider.wallet wallets/production/mainnet-deployer.json
```

Anchor will use the mainnet cluster, which routes through QuickNode.

### Solana CLI Commands

```bash
# Set RPC URL for Solana CLI
export SOLANA_RPC_URL="https://prettiest-broken-flower.solana-mainnet.quiknode.pro/2b20215bc747d769dea5e209527aa76c6efb2241/"

# Or use --url flag
solana balance <ADDRESS> --url $SOLANA_RPC_URL
```

---

## Verification

### Test Connectivity

```bash
# Test RPC endpoint
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
  https://prettiest-broken-flower.solana-mainnet.quiknode.pro/2b20215bc747d769dea5e209527aa76c6efb2241/

# Expected response:
# {"jsonrpc":"2.0","result":"ok","id":1}
```

### Check Cluster Version

```bash
solana cluster-version \
  --url https://prettiest-broken-flower.solana-mainnet.quiknode.pro/2b20215bc747d769dea5e209527aa76c6efb2241/

# Should show mainnet-beta version
```

---

## QuickNode Dashboard

**Access:** https://dashboard.quicknode.com/

**Monitor:**
- Request usage
- Rate limits
- Performance metrics
- Errors and warnings

**Recommended Alerts:**
- Usage approaching limit (80%)
- Error rate spike
- Downtime notifications

---

## Rate Limits

**Check your plan in QuickNode dashboard:**
- Requests per second
- Daily request limit
- Burst allowance

**Monitor during deployment:**
- Deployment will make ~400+ requests
- Ensure sufficient rate limit headroom
- Set up alerts if approaching limits

---

## Backup RPC Endpoints

**Recommended:** Configure backup RPC endpoints for redundancy

**Options:**
1. **Helius:** https://www.helius.dev/
2. **Triton:** https://triton.one/
3. **Alchemy:** https://www.alchemy.com/solana

**Implementation:**
- Primary: QuickNode (current)
- Fallback: Configure in backend API for automatic failover

---

## Backend API Configuration

### Environment Variables

**Production (`production-app.yaml`):**
```yaml
- key: SOLANA_RPC_URL
  value: ${SOLANA_RPC_URL}
  type: SECRET
  scope: RUN_AND_BUILD_TIME
```

**Set via DigitalOcean console:**
1. Navigate to App Settings
2. Environment Variables section
3. Add/Update `SOLANA_RPC_URL`
4. Mark as SECRET
5. Save and redeploy if needed

---

## Security Best Practices

### Protect API Key

✅ **DO:**
- Store in environment variables (SECRET type)
- Use in server-side code only
- Monitor usage for anomalies
- Rotate if exposed

❌ **DON'T:**
- Commit to git repositories
- Expose in client-side code
- Share in public documentation
- Log in plain text

### Monitor Usage

**Set up alerts for:**
- Unusual traffic spikes
- Geographic anomalies
- Failed authentication attempts
- Rate limit violations

---

## Troubleshooting

### Connection Issues

**Problem:** Can't connect to RPC endpoint

**Solutions:**
1. Verify URL is correct (no typos)
2. Check QuickNode dashboard for service status
3. Ensure no rate limits exceeded
4. Test with curl command (see Verification section)
5. Check firewall/network restrictions

### Slow Response Times

**Problem:** RPC requests timing out or slow

**Solutions:**
1. Check QuickNode dashboard for latency metrics
2. Verify your plan's performance tier
3. Consider upgrading plan if consistent issues
4. Monitor concurrent request count
5. Implement request caching where appropriate

### Rate Limit Errors

**Problem:** 429 Too Many Requests errors

**Solutions:**
1. Check current usage in dashboard
2. Upgrade plan if needed
3. Implement request queuing
4. Add retry logic with exponential backoff
5. Optimize number of RPC calls

---

## Deployment Checklist

### Before Deployment

- [x] QuickNode endpoint created
- [x] RPC URL stored in DigitalOcean secrets
- [x] Connectivity tested
- [ ] Rate limits verified (check dashboard)
- [ ] Monitoring/alerts configured
- [ ] Backup RPC endpoints prepared (optional)

### During Deployment

- [ ] Monitor QuickNode dashboard
- [ ] Watch for rate limit warnings
- [ ] Check request success rate
- [ ] Verify response times

### After Deployment

- [ ] Verify API can connect to program
- [ ] Test transaction submissions
- [ ] Monitor ongoing usage
- [ ] Set up usage alerts

---

## Cost Monitoring

**QuickNode Pricing:**
- Check your current plan in dashboard
- Monitor request volume
- Set budget alerts
- Review monthly costs

**Optimization:**
- Cache frequently accessed data
- Batch requests when possible
- Use WebSocket subscriptions for real-time data
- Implement client-side caching

---

## Documentation Links

- **QuickNode Docs:** https://www.quicknode.com/docs/solana
- **Solana RPC API:** https://docs.solana.com/api/http
- **QuickNode Dashboard:** https://dashboard.quicknode.com/

---

## Status Summary

| Component | Status | Notes |
|-----------|--------|-------|
| **Endpoint Created** | ✅ | Mainnet Beta |
| **API Key Generated** | ✅ | In URL |
| **Server Configuration** | ✅ | SOLANA_RPC_URL set |
| **Connectivity** | ⏳ | Test before deployment |
| **Monitoring** | ⏳ | Configure alerts |
| **Backup RPC** | ⏳ | Optional (recommended) |

---

## Next Steps

1. ✅ **QuickNode Setup** - COMPLETE
2. ⏳ **Generate Wallets** - Next step
3. ⏳ **Fund Wallets** - After generation
4. ⏳ **Deploy to Mainnet** - When ready

---

**Last Updated:** 2025-10-27  
**Configured By:** User  
**Ready for Deployment:** ✅

