# Solana Program Deployment Guide

**Purpose:** How to deploy the escrow program to different environments and prevent Program ID mismatches.

---

## 🎯 Program ID Management Strategy

### **Single Source of Truth:**
The program ID is **declared once in Rust** and **referenced everywhere else** via environment variables.

```
programs/escrow/src/lib.rs:
  declare_id!("7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV");
```

This ID is then **set in `.env`** for the backend:
```
ESCROW_PROGRAM_ID=4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd
```

---

## 🔒 Guardrails Against Program ID Mismatches

### 1. **No Dynamic Program Creation**
❌ **NEVER** generate program IDs dynamically:
```typescript
// ❌ BAD - Dynamic generation
const programId = Keypair.generate().publicKey;

// ❌ BAD - Hardcoded different ID
const programId = new PublicKey("SomeOtherAddress...");
```

✅ **ALWAYS** use environment variable:
```typescript
// ✅ GOOD - From environment
const programId = new PublicKey(process.env.ESCROW_PROGRAM_ID);
```

### 2. **Configuration Validation**
The backend validates `ESCROW_PROGRAM_ID` on startup:
```typescript
import { validateConfig } from './config/validation';

// In index.ts or main entry point
validateConfig(); // Throws if ESCROW_PROGRAM_ID is invalid or missing
```

### 3. **No Fallback Values**
The code **rejects** placeholder values:
- `11111111111111111111111111111111` (System program)
- `YOUR_PROGRAM_ID_HERE`
- `REPLACE_ME`
- Empty strings

---

## 📋 Deployment Process

### **Step 1: Initial Program Deployment (One-Time Setup)**

#### For Devnet:
```bash
# Navigate to program directory
cd programs/escrow

# Build the program
cargo build-sbf

# Deploy to devnet (this generates the program ID)
solana program deploy \
  --url devnet \
  --keypair ~/.config/solana/id.json \
  target/deploy/escrow.so

# Output:
# Program Id: 7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV
```

#### For Mainnet-Beta (Production):
```bash
# Build for production
cargo build-sbf

# Deploy to mainnet (CAREFUL - costs SOL)
solana program deploy \
  --url mainnet-beta \
  --keypair ~/.config/solana/id.json \
  target/deploy/escrow.so

# Output:
# Program Id: <NEW_MAINNET_ID>
```

### **Step 2: Update Rust Code with Program ID**

Edit `programs/escrow/src/lib.rs`:
```rust
// Devnet
declare_id!("7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV");

// Mainnet (when deploying to production)
declare_id!("MainnetProgramId...");
```

### **Step 3: Update Environment Variables**

#### Devnet (`.env`):
```bash
ESCROW_PROGRAM_ID=4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_NETWORK=devnet
```

#### Staging (`.env.staging`):
```bash
ESCROW_PROGRAM_ID=4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_NETWORK=devnet
```

#### Production (`.env.production`):
```bash
ESCROW_PROGRAM_ID=<MAINNET_PROGRAM_ID>
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_NETWORK=mainnet-beta
```

### **Step 4: Rebuild and Redeploy Program**

After updating `declare_id!`, rebuild and upgrade:

```bash
# Rebuild with new ID
cargo build-sbf

# Upgrade existing program (keeps same address)
solana program deploy \
  --url devnet \
  --program-id target/deploy/escrow-keypair.json \
  --upgrade-authority ~/.config/solana/id.json \
  target/deploy/escrow.so
```

---

## 🚀 Environment-Specific Deployments

### **Devnet (Current - Already Deployed)**
- **Program ID:** `7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV`
- **Status:** ✅ Deployed and verified
- **Purpose:** Development and testing
- **Cost:** Free (faucet SOL)

### **Staging (Future)**
**Option 1: Use Devnet**
- Same as development
- Separate backend deployment
- Uses same program ID

**Option 2: Dedicated Testnet**
- Deploy to `testnet` cluster
- New program ID
- Update `.env.staging`

### **Production (Mainnet)**
**When Ready for Production:**

1. **Deploy to Mainnet:**
```bash
solana program deploy \
  --url mainnet-beta \
  --keypair ~/.config/solana/id.json \
  target/deploy/escrow.so
```

2. **Save the Program ID:**
```
Program Id: <MAINNET_PROGRAM_ID>
```

3. **Update Production Config:**
```bash
# .env.production
ESCROW_PROGRAM_ID=<MAINNET_PROGRAM_ID>
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_NETWORK=mainnet-beta
```

4. **Update Rust Code:**
```rust
#[cfg(feature = "mainnet")]
declare_id!("<MAINNET_PROGRAM_ID>");

#[cfg(not(feature = "mainnet"))]
declare_id!("7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV");
```

---

## 🔒 Security Best Practices

### 1. **Program Authority Management**
```bash
# Check current upgrade authority
solana program show <PROGRAM_ID> --url devnet

# Transfer authority to multisig (for mainnet)
solana program set-upgrade-authority \
  <PROGRAM_ID> \
  --new-upgrade-authority <MULTISIG_ADDRESS> \
  --url mainnet-beta
```

### 2. **Keypair Management**
- **Devnet/Testnet:** Development keypairs OK
- **Mainnet:** Use hardware wallet or multisig
- **Never commit:** `escrow-keypair.json` to git

### 3. **Environment Variables**
```bash
# Never commit these to git:
.env
.env.production
.env.staging

# Use secrets management:
# - DigitalOcean App Platform: Environment Variables
# - AWS: Secrets Manager
# - Kubernetes: Secrets
```

---

## 🧪 Testing Program ID Configuration

### Test 1: Configuration Validation
```bash
npm run validate:config
```

Expected output:
```
🔍 Validating configuration...
✅ Solana configuration valid
   Program ID: 7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV
   Network: devnet
   RPC: https://api.devnet.solana.com
```

### Test 2: Integration Test
```bash
npm run test:integration
```

Should connect to the program and verify IDL.

### Test 3: E2E Test
```bash
npm run test:e2e
```

Should use the correct program ID for all operations.

---

## ❌ Common Mistakes to Avoid

### 1. **Hardcoding Program IDs**
```typescript
// ❌ BAD
const programId = new PublicKey("7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV");

// ✅ GOOD
const programId = new PublicKey(process.env.ESCROW_PROGRAM_ID);
```

### 2. **Using Fallback IDs**
```typescript
// ❌ BAD - Silent failure
const programId = process.env.ESCROW_PROGRAM_ID || "11111...";

// ✅ GOOD - Fail fast
if (!process.env.ESCROW_PROGRAM_ID) {
  throw new Error("ESCROW_PROGRAM_ID required");
}
```

### 3. **Generating New IDs**
```typescript
// ❌ BAD - Creates new ID every time
const programKeypair = Keypair.generate();

// ✅ GOOD - Use deployed ID
const programId = new PublicKey(process.env.ESCROW_PROGRAM_ID);
```

### 4. **Mismatched `declare_id!` and `.env`**
```rust
// Rust
declare_id!("7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV");
```
```bash
# .env - MUST MATCH
ESCROW_PROGRAM_ID=4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd
```

---

## 📊 Current Status

| Environment | Program ID | Status | Notes |
|-------------|------------|--------|-------|
| **Devnet** | `7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV` | ✅ Deployed | Active development |
| **Staging** | TBD | ⏳ Pending | Use devnet or deploy to testnet |
| **Production** | TBD | ⏳ Pending | Deploy to mainnet when ready |

---

## 🚀 Quick Reference

### Check Program Status:
```bash
solana program show $ESCROW_PROGRAM_ID --url devnet
```

### Upgrade Program:
```bash
solana program deploy \
  --program-id target/deploy/escrow-keypair.json \
  --upgrade-authority ~/.config/solana/id.json \
  target/deploy/escrow.so \
  --url devnet
```

### Verify IDL:
```bash
anchor idl build -p escrow
```

---

## ✅ Checklist for New Environment

- [ ] Deploy program to target network
- [ ] Save program ID
- [ ] Update `declare_id!` in `lib.rs`
- [ ] Update `ESCROW_PROGRAM_ID` in `.env`
- [ ] Rebuild program with new ID
- [ ] Upgrade deployed program
- [ ] Run configuration validation
- [ ] Run integration tests
- [ ] Run E2E tests
- [ ] Verify program on explorer

---

**Last Updated:** 2025-10-16  
**Current Devnet Program:** `7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV`

