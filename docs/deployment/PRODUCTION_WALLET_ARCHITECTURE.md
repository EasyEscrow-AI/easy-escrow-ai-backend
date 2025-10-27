# Production Wallet Architecture

**Status:** ✅ Configured for Best Practices  
**Date:** 2025-10-27  
**Security Level:** HIGH

---

## Wallet Separation Strategy

We use **separate wallets** for different roles to maximize security and follow industry best practices.

---

## Wallet Roles

### 1. 🔐 Deployer Wallet (Cold Storage)

**Purpose:** Deploy and upgrade the Solana program

**File:** `wallets/production/mainnet-deployer.json`

**Usage:**
- ✅ Deploy program to mainnet (one-time)
- ✅ Upgrade program (rare, planned upgrades)
- ✅ Transfer upgrade authority (one-time after deployment)

**Security:**
- 🔒 **COLD STORAGE** after initial deployment
- 🔒 Store in hardware wallet or secure offline location
- 🔒 Require multiple approvals for use
- 🔒 Never used for daily operations
- 🔒 Never exposed to API or hot environments

**Funding:**
- Needs: ~10 SOL for deployment
- After deployment: Can be drained to ~0.001 SOL (keep for rent)
- Refund buffer account SOL (~3.5 SOL) back to treasury

**Lifecycle:**
```
1. Generate keypair
2. Fund with 10 SOL
3. Deploy program to mainnet
4. Transfer upgrade authority to multisig
5. Move to cold storage (hardware wallet/safe)
6. ❄️ Offline until next planned upgrade
```

---

### 2. 🔥 Admin Wallet (Hot Wallet)

**Purpose:** Daily operational transactions

**File:** Managed separately (not in git)

**Usage:**
- ✅ Admin cancellations
- ✅ System operations
- ✅ Escrow transaction signing (if needed)
- ✅ Emergency operations

**Security:**
- 🔥 **HOT WALLET** - active in production environment
- 🔒 Stored in DigitalOcean App Platform secrets
- 🔒 Used by backend API
- 🔒 Regular security audits
- 🔒 Rate limiting on operations

**Funding:**
- Needs: ~5-10 SOL for operations
- Monitor balance regularly
- Auto-refill alerts recommended

**Environment Variable:**
```bash
MAINNET_PROD_ADMIN_PRIVATE_KEY=<base58-private-key>
```

---

### 3. 🏦 Fee Collector Wallet (Treasury)

**Purpose:** Receive platform fees

**File:** Managed separately (not in git)

**Usage:**
- ✅ Receives platform fees from escrow transactions
- ✅ Treasury accumulation
- ✅ Periodic withdrawals to cold storage

**Security:**
- 🔥 **HOT WALLET** - receives fees automatically
- 🔒 Stored in DigitalOcean secrets
- 🔒 Regular balance monitoring
- 🔒 Periodic transfers to cold storage recommended

**Funding:**
- Needs: ~1 SOL for rent (receives fees)
- No active funding needed

**Environment Variable:**
```bash
MAINNET_PROD_FEE_COLLECTOR_PRIVATE_KEY=<base58-private-key>
MAINNET_PROD_FEE_COLLECTOR_ADDRESS=<public-address>
```

---

### 4. 🛡️ Multisig Upgrade Authority (Post-Deployment)

**Purpose:** Governance over program upgrades

**Type:** Multisig wallet (e.g., Squads Protocol, Goki, or custom)

**Configuration:**
- 3-of-5 multisig (recommended)
- Key holders: Team leads, trusted advisors
- Requires multiple approvals for upgrades

**Lifecycle:**
```
1. Deploy program with deployer wallet
2. Create multisig wallet (e.g., Squads)
3. Transfer upgrade authority:
   solana program set-upgrade-authority <PROGRAM_ID> \
     --upgrade-authority wallets/production/mainnet-deployer.json \
     --new-upgrade-authority <MULTISIG_ADDRESS>
4. Multisig now controls all program upgrades
5. Deployer wallet goes to cold storage
```

---

## Wallet Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│ Production Mainnet Architecture                     │
└─────────────────────────────────────────────────────┘

┌─────────────────┐
│ Deployer Wallet │ ❄️ COLD STORAGE
│ (One-time use) │
└────────┬────────┘
         │
         │ 1. Deploy Program
         │ 2. Transfer Authority
         ▼
   ┌───────────┐
   │  Program  │ ◄──────────────┐
   │ (Mainnet) │                │ 3. Upgrade Authority
   └─────┬─────┘                │
         │                      │
         │ Used by         ┌────┴──────┐
         │                 │ Multisig  │ 🛡️ GOVERNANCE
         ▼                 │ Wallet    │ (3-of-5)
   ┌──────────┐            └───────────┘
   │ Backend  │
   │   API    │
   └────┬─────┘
        │
        ├─► Admin Wallet        🔥 HOT (daily ops)
        └─► Fee Collector       🔥 HOT (receives fees)
```

---

## Why Separation Matters

### Security Benefits

| Scenario | With Separation | Without Separation |
|----------|----------------|-------------------|
| **Admin wallet compromised** | ✅ Program safe (multisig protected) | ❌ Attacker can upgrade program |
| **API vulnerability** | ✅ Only hot wallets at risk | ❌ Deployer key exposed |
| **Internal threat** | ✅ Requires multiple approvals | ❌ Single person can modify program |
| **Audit trail** | ✅ Clear separation of duties | ❌ Mixed transactions |
| **Routine operations** | ✅ Hot wallet handles all | ❌ Must access cold wallet frequently |

### Compliance & Audit

**Separated wallets enable:**
- ✅ Clear audit trails (who did what)
- ✅ Role-based access control
- ✅ Compliance with security standards
- ✅ Insurance requirements (some providers require separation)
- ✅ Investor confidence (demonstrates security maturity)

---

## Deployment Workflow

### Phase 1: Pre-Deployment (Wallet Setup)

```bash
# 1. Generate deployer wallet (SECURE LOCATION)
solana-keygen new -o wallets/production/mainnet-deployer.json

# Save seed phrase in multiple secure locations:
# - Hardware wallet
# - Encrypted backup
# - Physical safe (written on paper)

# 2. Generate admin wallet (separate process)
solana-keygen new -o /tmp/mainnet-admin.json

# Store in password manager/secrets vault
# DO NOT commit to git

# 3. Generate fee collector wallet
solana-keygen new -o /tmp/mainnet-fee-collector.json

# Store in password manager/secrets vault
# DO NOT commit to git
```

### Phase 2: Funding

```bash
# Fund deployer with 10 SOL (from exchange or funded wallet)
DEPLOYER_ADDRESS=$(solana-keygen pubkey wallets/production/mainnet-deployer.json)
solana transfer $DEPLOYER_ADDRESS 10 --url mainnet-beta

# Fund admin with 5 SOL (for operations)
ADMIN_ADDRESS=$(solana-keygen pubkey /tmp/mainnet-admin.json)
solana transfer $ADMIN_ADDRESS 5 --url mainnet-beta

# Fund fee collector with 1 SOL (for rent)
FEE_COLLECTOR_ADDRESS=$(solana-keygen pubkey /tmp/mainnet-fee-collector.json)
solana transfer $FEE_COLLECTOR_ADDRESS 1 --url mainnet-beta
```

### Phase 3: Program Deployment

```bash
# Deploy using deployer wallet
anchor deploy \
  --provider.cluster mainnet-beta \
  --provider.wallet wallets/production/mainnet-deployer.json \
  --config Anchor.mainnet.toml

# Get program ID
PROGRAM_ID=$(solana address -k target/deploy/escrow-mainnet-keypair.json)
echo "Program deployed: $PROGRAM_ID"
```

### Phase 4: Upgrade Authority Transfer

```bash
# Create multisig wallet (using Squads or similar)
# Get multisig address: <MULTISIG_ADDRESS>

# Transfer upgrade authority from deployer to multisig
solana program set-upgrade-authority $PROGRAM_ID \
  --upgrade-authority wallets/production/mainnet-deployer.json \
  --new-upgrade-authority <MULTISIG_ADDRESS> \
  --url mainnet-beta

# Verify transfer
solana program show $PROGRAM_ID --url mainnet-beta
# Should show: "Upgrade Authority: <MULTISIG_ADDRESS>"
```

### Phase 5: Secure Deployer Wallet

```bash
# 1. Refund unused SOL from deployer (keep minimal for rent)
DEPLOYER_ADDRESS=$(solana-keygen pubkey wallets/production/mainnet-deployer.json)
DEPLOYER_BALANCE=$(solana balance $DEPLOYER_ADDRESS --url mainnet-beta)

# Calculate refund (total - 0.01 SOL for rent)
REFUND_AMOUNT=$(echo "$DEPLOYER_BALANCE - 0.01" | bc)

# Send to treasury
solana transfer <TREASURY_ADDRESS> $REFUND_AMOUNT \
  --keypair wallets/production/mainnet-deployer.json \
  --url mainnet-beta

# 2. Create encrypted backup
tar -czf production-deployer-backup.tar.gz wallets/production/mainnet-deployer.json
gpg -c production-deployer-backup.tar.gz
rm production-deployer-backup.tar.gz

# 3. Store in multiple secure locations
# - Hardware wallet
# - Bank safe deposit box
# - Encrypted cloud storage (with different password)

# 4. Remove from development machine
rm wallets/production/mainnet-deployer.json

# 5. Document location in team password manager
```

---

## Emergency Procedures

### If Admin Wallet is Compromised

**Immediate Actions:**
1. **Pause all API operations**
2. **Generate new admin wallet**
3. **Transfer funds from compromised wallet to new wallet**
4. **Update DigitalOcean secrets with new admin key**
5. **Redeploy backend with new configuration**
6. **Audit all recent transactions**

**Program Security:**
✅ **Program remains safe** - upgrade authority is with multisig, not admin wallet

### If Deployer Wallet is Compromised (Pre-Transfer)

**Immediate Actions:**
1. **URGENT: Transfer upgrade authority to multisig immediately**
2. **Generate new deployer wallet**
3. **Store original as "compromised-do-not-use"**
4. **Audit all program modifications**
5. **Consider redeployment if program was modified**

### If Multisig Key is Compromised

**Immediate Actions:**
1. **Notify all multisig key holders**
2. **Rotate compromised key(s)**
3. **Update multisig configuration**
4. **Audit recent program modifications**
5. **Document incident for security review**

---

## Monitoring & Alerts

### Balance Monitoring

**Set up alerts for:**
- 🚨 Admin wallet balance < 1 SOL
- 🚨 Fee collector balance > 100 SOL (transfer to cold storage)
- 🚨 Deployer wallet activity (should be zero after transfer)
- 🚨 Unusual transaction patterns on any wallet

### Transaction Monitoring

**Monitor for:**
- Unexpected program upgrades
- Large fund transfers
- Failed transaction spikes
- Unauthorized admin operations

---

## Checklist: Wallet Security

### Deployer Wallet ✅
- [ ] Generated in secure environment
- [ ] Seed phrase stored in 3+ secure locations
- [ ] Used only for deployment
- [ ] Upgrade authority transferred to multisig
- [ ] Moved to cold storage after deployment
- [ ] Encrypted backup created
- [ ] Location documented in team vault
- [ ] Never committed to git
- [ ] File permissions set to 600

### Admin Wallet ✅
- [ ] Generated separately from deployer
- [ ] Stored in DigitalOcean secrets (encrypted)
- [ ] Never committed to git
- [ ] Backup in team password manager
- [ ] Balance monitoring configured
- [ ] Rate limiting enabled on API
- [ ] Regular security audits scheduled

### Fee Collector Wallet ✅
- [ ] Generated separately
- [ ] Stored in DigitalOcean secrets
- [ ] Balance monitoring configured
- [ ] Periodic transfer procedure documented
- [ ] Never committed to git

### Multisig Wallet ✅
- [ ] Created with 3-of-5 configuration
- [ ] Key holders documented
- [ ] Approval process documented
- [ ] Upgrade authority successfully transferred
- [ ] Test upgrade process on devnet first
- [ ] Emergency procedures documented

---

## Documentation References

- **Deployment Guide:** `docs/deployment/MAINNET_DEPLOYMENT_GUIDE.md`
- **Wallet Security:** `wallets/production/README.md`
- **Secrets Management:** `docs/SECRETS_MANAGEMENT.md`
- **Emergency Procedures:** `docs/security/INCIDENT_RESPONSE.md`

---

## Key Takeaways

1. ✅ **Deployer = Cold Storage** - Only for deployment, then offline
2. ✅ **Admin = Hot Wallet** - Daily operations, monitored closely
3. ✅ **Multisig = Governance** - Upgrade authority, requires multiple approvals
4. ✅ **Separation = Security** - Compromise of one wallet doesn't endanger program
5. ✅ **Document Everything** - Location, procedures, emergency contacts

---

**Status:** Ready for secure production deployment 🔐

**Last Updated:** 2025-10-27  
**Security Review:** Required before mainnet deployment  
**Next Review:** After deployment and authority transfer

