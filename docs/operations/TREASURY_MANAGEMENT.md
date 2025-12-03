# Treasury Management Guide

This guide covers the management of the Easy Escrow Treasury system, including weekly fee withdrawals and emergency pause mechanisms.

## Overview

The Treasury system is a two-tier platform fee collection architecture:

1. **Treasury PDA** (On-Chain) - Receives fees during swaps
2. **Treasury Wallet** (Backend-Controlled Hot Wallet) - Receives weekly withdrawals
3. **Fee Collector** (Cold Storage) - Final destination after prize distribution

```
┌─────────────┐
│ Swap Event  │ ──► Platform fees collected
└─────────────┘
       │
       ▼
┌──────────────────┐
│  Treasury PDA    │ (On-chain, program-controlled)
│  Tracks fees &   │
│  swap statistics │
└──────────────────┘
       │
       │ Weekly withdrawal (Sunday 23:59 UTC)
       ▼
┌──────────────────┐
│ Treasury Wallet  │ (Hot wallet, backend-controlled)
│ AScijL... (dev)  │
│ 9VN2bz... (prod) │
└──────────────────┘
       │
       │ Weekly reconciliation (manual)
       ▼
┌──────────────────┐
│ Fee Collector    │ (Cold storage)
│ 8LL197...        │
└──────────────────┘
```

## Treasury PDA Features

### Tracking

The Treasury PDA maintains:
- `total_fees_collected` - Total platform fees received
- `total_swaps_executed` - Number of successful swaps
- `total_fees_withdrawn` - Total fees withdrawn to treasury wallet
- `last_withdrawal_at` - Timestamp of last withdrawal
- `is_paused` - Emergency pause flag
- `paused_at` - Timestamp when pause was activated

### Security

- Only platform authority can withdraw funds
- Withdrawals rate-limited to once per week (7 days minimum)
- Maintains rent-exempt minimum balance
- Emergency pause capability to halt all operations

## Weekly Withdrawal Process

### Automatic Withdrawal (Cron Job)

**Schedule:** Every Sunday at 23:59 UTC

```bash
# Add to crontab
59 23 * * 0 cd /path/to/project && npm run treasury:withdraw >> /var/log/treasury-withdrawal.log 2>&1
```

### Manual Withdrawal

```bash
# Check treasury status
npm run treasury:status

# Dry run (preview without executing)
npm run treasury:withdraw:dry-run

# Execute withdrawal (only works on Sunday 23:59 UTC)
npm run treasury:withdraw

# Force withdrawal (bypass time check)
npm run treasury:withdraw:force
```

### Withdrawal Constraints

1. **Time-Based**: At least 7 days since last withdrawal
2. **Balance**: Must maintain rent-exempt minimum + 10 SOL buffer
3. **Pause State**: Cannot withdraw if program is paused
4. **Authority**: Must be signed by platform authority

### Example Output

```
════════════════════════════════════════════════════════════
📅 WEEKLY TREASURY WITHDRAWAL - Sunday 23:59 UTC
════════════════════════════════════════════════════════════

🔑 Platform Authority: 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R
🏛️  Treasury PDA: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

💰 Treasury Status:
  Total Fees Collected: 125.50 SOL
  Total Fees Withdrawn: 100.00 SOL
  Current Balance: 35.50 SOL
  Total Swaps: 1,247
  Paused: ✅ NO
  Last Withdrawal: 2024-11-17T23:59:00.000Z

📊 Withdrawal Calculation:
  Rent Exempt: 0.001 SOL
  Buffer: 10.000 SOL
  Minimum to Keep: 10.001 SOL
  Available to Withdraw: 25.499 SOL

🎯 Destination: AScijLJ1ApcQftktBRN818b8LDH4JJovQ5qrGDHfHuPu

📤 Executing withdrawal transaction...

✅ Withdrawal successful!
  Transaction: 5Gz3...7Y2k
  Amount: 25.499 SOL
  Destination: AScijLJ1ApcQftktBRN818b8LDH4JJovQ5qrGDHfHuPu

📝 Next steps:
   1. Verify funds received in treasury wallet
   2. Distribute prizes from treasury wallet
   3. Transfer remaining to cold storage fee collector
```

## Emergency Pause System

### When to Use

Activate emergency pause in case of:
- **Security vulnerability** detected in smart contract
- **Critical bug** discovered in swap logic
- **Malicious activity** or exploit attempt
- **Regulatory requirement** to halt operations
- **Maintenance** requiring zero activity

### Activating Pause

```bash
# Activate emergency pause
npm run treasury:pause
```

**Effect:**
- All swaps immediately rejected with "Program is paused" error
- Withdrawals blocked
- Fees remain safe in Treasury PDA
- Platform authority can still unpause

### Deactivating Pause

```bash
# Resume operations
npm run treasury:unpause
```

**Effect:**
- Swaps resume normally
- Withdrawals enabled
- Operations return to normal

### Example Pause Flow

```bash
# 1. Security issue detected
npm run treasury:pause

# Output:
🚨 ACTIVATING EMERGENCY PAUSE
✅ Emergency pause activated
   Transaction: 3Hk...9Zm
📝 All swap operations are now blocked
   To resume: npm run treasury:unpause

# ... Investigate and fix issue ...

# 2. Resume operations
npm run treasury:unpause

# Output:
✅ RESUMING OPERATIONS
✅ Operations resumed successfully
   Transaction: 7Yt...2Qp
   Pause duration: 7200 seconds (2 hours)
```

## Post-Withdrawal Process

After weekly withdrawal to treasury wallet:

### 1. Verify Receipt

```bash
solana balance AScijLJ1ApcQftktBRN818b8LDH4JJovQ5qrGDHfHuPu --url devnet
# or
solana balance HMtLHzJZ5AUUaKjYBGZpB4RbjN4gYvcd69esNwtaUBFF --url mainnet-beta
```

### 2. Distribute Prizes

Execute prize distribution to winners from treasury wallet.

```bash
# Custom prize distribution script
npm run prizes:distribute
```

### 3. Transfer to Cold Storage

Transfer remaining balance to cold storage fee collector wallet.

```bash
# Manual transfer or automated script
solana transfer 8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ <amount> \
  --from wallets/staging/staging-treasury.json \
  --url devnet
```

## Monitoring & Alerts

### Recommended Monitoring

1. **Treasury Balance**
   ```bash
   npm run treasury:status
   ```

2. **Weekly Withdrawal Success**
   - Monitor cron job logs
   - Alert if withdrawal fails
   - Verify transaction on Solana explorer

3. **Pause State**
   - Dashboard indicator for pause status
   - Alert if pause activated unexpectedly

4. **Withdrawal Timing**
   - Ensure 7-day interval maintained
   - Alert if withdrawal attempted too frequently

### Health Checks

```bash
# Check treasury status
npm run treasury:status

# Output:
📊 TREASURY STATUS CHECK

Treasury PDA: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

Current Balance: 35.50 SOL
Total Fees Collected: 125.50 SOL
Total Fees Withdrawn: 100.00 SOL
Pending Withdrawal: 25.50 SOL
Total Swaps: 1,247
Status: ✅ ACTIVE
Last Withdrawal: 2024-11-17T23:59:00.000Z
```

## Security Best Practices

### Treasury Wallet Security

1. **Environment Variables**
   - Never commit private keys
   - Use `.env` files (gitignored)
   - Rotate keys periodically

2. **Access Control**
   - Limit who can execute withdrawal scripts
   - Use separate admin accounts for different environments
   - Audit withdrawal transactions

3. **Cold Storage Transfer**
   - Transfer to cold storage weekly
   - Never store large amounts in hot wallet
   - Use hardware wallet for cold storage

### Platform Authority Key

1. **Storage**
   - Encrypted in production
   - Separate key per environment
   - Backup in secure location

2. **Access**
   - Limited to authorized personnel
   - Logged and audited
   - Rotated periodically

## Troubleshooting

### Withdrawal Failed: "WithdrawalTooFrequent"

**Cause:** Less than 7 days since last withdrawal

**Solution:**
```bash
# Check last withdrawal time
npm run treasury:status

# Wait until 7 days have passed
# Or use --force for emergency (requires manual approval)
```

### Withdrawal Failed: "InsufficientTreasuryBalance"

**Cause:** Not enough funds available after rent-exempt + buffer

**Solution:**
```bash
# Check current balance
npm run treasury:status

# Wait for more swaps to accumulate fees
# Or reduce buffer in withdrawal config
```

### Withdrawal Failed: "ProgramPaused"

**Cause:** Program is in emergency pause state

**Solution:**
```bash
# Check pause status
npm run treasury:status

# If pause was unintentional, unpause
npm run treasury:unpause

# Then retry withdrawal
npm run treasury:withdraw:force
```

### Emergency Pause Failed: "AlreadyPaused"

**Cause:** Program is already in paused state

**Solution:**
```bash
# Check status
npm run treasury:status

# If need to resume, unpause first
npm run treasury:unpause
```

## Environment Configuration

### Staging (Devnet)

```bash
# .env.staging
DEVNET_STAGING_TREASURY_ADDRESS=AScijLJ1ApcQftktBRN818b8LDH4JJovQ5qrGDHfHuPu
DEVNET_STAGING_TREASURY_PRIVATE_KEY=<your-base58-private-key>  # NEVER commit real keys!
```

### Production (Mainnet)

```bash
# .env.production
MAINNET_PRODUCTION_TREASURY_ADDRESS=HMtLHzJZ5AUUaKjYBGZpB4RbjN4gYvcd69esNwtaUBFF
MAINNET_PRODUCTION_TREASURY_PRIVATE_KEY=<your-base58-private-key>  # NEVER commit real keys!
```

## Related Documentation

- [Environment Variables](../environments/ENVIRONMENT_VARIABLES.md)
- [Wallet Management](../wallets/README.md)
- [Security Best Practices](../security/SECURITY_BEST_PRACTICES.md)
- [Program Deployment](../deployment/PROGRAM_DEPLOYMENT_GUIDE.md)

## Support

For issues with treasury management:
- Check logs: `/var/log/treasury-withdrawal.log`
- Review transaction on Solana explorer
- Contact platform team lead
- Emergency: Use pause mechanism immediately

