# 🚀 Production Program Quick Reference

**Last Updated:** October 27, 2025  
**Status:** READY FOR DEPLOYMENT

---

## 📋 Essential Information

### Production Program ID
```
2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
```

### Recovery Seed Phrase (24 words)
```
doll field resist idle snow artwork keep roof want over silver dog
```

**🚨 CRITICAL:** Backup this seed phrase in 3+ secure locations immediately!

### Deployer Wallet
**Public Address:**
```
GWFUgFT25EUWsQVVmPHaUESKnosJ4adUpWQinCz7CVYH
```

**Keypair Location:**
```
wallets/production/mainnet-deployer.json
```

**Required Funding:** 7 SOL

### Program Keypair Location
```
wallets/production/escrow-program-keypair.json
```

---

## 🔄 Environment Switching

### Switch to Production (No Build)
```bash
npm run program:switch:production
```

### Build for Production
```bash
npm run program:build:production
```

### Manual Switching
```powershell
.\scripts\utilities\switch-program-environment.ps1 -Environment production
.\scripts\utilities\switch-program-environment.ps1 -Environment production -Build
```

---

## 🚀 Deployment Commands

### Pre-Deployment Verification
```bash
# Verify all toolchain versions and configuration
bash scripts/solana/verify-mainnet-deployment.sh
```

### Deploy to Mainnet
```bash
# Option 1: Using Anchor
anchor deploy \
  --provider.wallet wallets/production/mainnet-deployer.json \
  --provider.cluster mainnet \
  --program-id wallets/production/escrow-program-keypair.json

# Option 2: Using custom deployment script
bash scripts/solana/deploy-mainnet.sh
```

### Upload IDL
```bash
anchor idl init \
  --filepath target/idl/escrow.json \
  2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --provider.wallet wallets/production/mainnet-deployer.json \
  --provider.cluster mainnet
```

---

## 💰 Cost Breakdown (OPTIMIZED)

| Item | Cost | Notes |
|------|------|-------|
| **Program Rent** | 1.80 SOL | Permanent (259KB) |
| **IDL Rent** | 0.12 SOL | Permanent (~17KB) |
| **Transaction Fees** | 0.001 SOL | ~105 transactions |
| **Safety Buffer** | 1.50 SOL | Errors/retries |
| **Subtotal (Permanent)** | 3.42 SOL | What you keep |
| **Buffer Account** | 3.69 SOL | **REFUNDED** after deploy |
| **Total Upfront** | 7.11 SOL | What you need initially |

**Recommended funding:** 7 SOL (includes buffer)  
**💰 SAVINGS:** 5 SOL ($1,000) from size optimization!

---

## 🔍 Monitoring Links

### Program
- **Solscan:** https://solscan.io/address/2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
- **Solana Explorer:** https://explorer.solana.com/address/2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx?cluster=mainnet-beta

### Deployer Wallet
- **Solscan:** https://solscan.io/address/GWFUgFT25EUWsQVVmPHaUESKnosJ4adUpWQinCz7CVYH
- **Solana Explorer:** https://explorer.solana.com/address/GWFUgFT25EUWsQVVmPHaUESKnosJ4adUpWQinCz7CVYH?cluster=mainnet-beta

---

## ✅ Pre-Deployment Checklist

### Configuration
- [x] Program ID configured in all files
- [x] Environment switcher updated
- [x] Package.json scripts added
- [x] DigitalOcean app spec updated
- [x] Keypairs stored securely

### Security
- [ ] Program seed phrase backed up (3+ locations)
- [ ] Deployer seed phrase backed up (3+ locations)
- [ ] Backups tested and verified
- [ ] Monitoring set up (Solscan/Explorer)

### Infrastructure
- [x] Program built and optimized (259KB)
- [x] Checksum verified
- [x] QuickNode RPC configured
- [ ] Deployer wallet funded (7 SOL)

### Verification
- [ ] Run `verify-mainnet-deployment.sh`
- [ ] All 10 checks passing
- [ ] Network confirmed: mainnet
- [ ] Balance verified on-chain

---

## 🛠️ Configuration Files

| File | Purpose | Status |
|------|---------|--------|
| `Anchor.mainnet.toml` | Mainnet config | ✅ Updated |
| `production-app.yaml` | DigitalOcean app | ✅ Updated |
| `scripts/utilities/switch-program-environment.ps1` | Env switcher | ✅ Updated |
| `package.json` | npm scripts | ✅ Updated |
| `wallets/production/escrow-program-keypair.json` | Program key | ✅ Created |
| `wallets/production/mainnet-deployer.json` | Deployer key | ✅ Created |

---

## 📚 Documentation References

### Deployment Guides
- [PRODUCTION_ENVIRONMENT_CONFIGURED.md](./PRODUCTION_ENVIRONMENT_CONFIGURED.md) - Complete configuration details
- [MAINNET_DEPLOYMENT_GUIDE.md](./docs/deployment/MAINNET_DEPLOYMENT_GUIDE.md) - Step-by-step deployment
- [PRODUCTION_DEPLOYMENT_GUIDE.md](./docs/deployment/PRODUCTION_DEPLOYMENT_GUIDE.md) - DigitalOcean deployment

### Security Guides
- [PRODUCTION_SECURITY_ROADMAP.md](./docs/deployment/PRODUCTION_SECURITY_ROADMAP.md) - Security phases
- [PRODUCTION_WALLET_ARCHITECTURE.md](./docs/deployment/PRODUCTION_WALLET_ARCHITECTURE.md) - Wallet setup
- [WALLET_GENERATION_GUIDE.md](./docs/deployment/WALLET_GENERATION_GUIDE.md) - Wallet generation

### Cost Analysis
- [ACTUAL_VS_ESTIMATED_COSTS.md](./docs/deployment/ACTUAL_VS_ESTIMATED_COSTS.md) - Cost breakdown
- [MAINNET_COST_ANALYSIS.md](./docs/deployment/MAINNET_COST_ANALYSIS.md) - Original estimates
- [OPTIMIZATION_COMPLETE.md](./OPTIMIZATION_COMPLETE.md) - Size optimization results

---

## 🚨 Emergency Recovery

### If Seed Phrase is Lost
❌ **CANNOT RECOVER** - Program authority is lost forever  
⚠️ **ACTION:** Backup seed phrase NOW before proceeding

### Recover from Seed Phrase
```bash
solana-keygen recover 'prompt://?' \
  -o wallets/production/escrow-program-keypair-recovered.json \
  --force

# When prompted, enter:
# doll field resist idle snow artwork keep roof want over silver dog
```

### Verify Recovery
```bash
solana-keygen pubkey wallets/production/escrow-program-keypair-recovered.json
# Expected: 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
```

---

## 📞 Support

### Solana Resources
- **Documentation:** https://docs.solana.com
- **CLI Reference:** https://docs.solana.com/cli
- **Discord:** https://discord.gg/solana

### Anchor Resources
- **Documentation:** https://www.anchor-lang.com
- **Discord:** https://discord.gg/anchor

### QuickNode Support
- **Dashboard:** https://dashboard.quicknode.com
- **Documentation:** https://www.quicknode.com/docs/solana

---

## ⏭️ Next Steps

1. **IMMEDIATE:** Backup program seed phrase to 3+ locations
2. **TODAY:** Fund deployer wallet with 7 SOL
3. **AFTER FUNDING:** Run pre-deployment verification
4. **DEPLOY:** Execute mainnet deployment
5. **POST-DEPLOY:** Upload IDL, verify, and secure wallets

---

**🎯 Status:** Configuration Complete - Ready for Deployment  
**⏱️ Time to Deploy:** ~5-10 minutes (after funding)  
**💰 Cost:** ~3.42 SOL permanent, 7 SOL upfront (3.69 SOL refunded)

**Generated:** 2025-10-27  
**Program ID:** `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx`

