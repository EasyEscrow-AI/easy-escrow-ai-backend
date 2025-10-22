# AUTHORITY_KEYPAIR Explained

## What is AUTHORITY_KEYPAIR?

`AUTHORITY_KEYPAIR` is the **admin/platform keypair** used by the backend to sign blockchain transactions on behalf of the EasyEscrow platform. It's the most critical keypair in the system.

---

## What It's Used For

### 1. **Initialize Escrow Agreements**
When a user creates an escrow agreement via the API, the backend:
- Creates the on-chain escrow account (PDA)
- Sets up token accounts for USDC and NFT
- **Signs the transaction with `AUTHORITY_KEYPAIR`** (pays gas fees)
- Records the admin's public key in the escrow state

**Code Location:** `src/services/escrow-program.service.ts:initAgreement()`

```typescript
// Backend signs and pays for transaction
transaction.feePayer = this.adminKeypair.publicKey;
transaction.sign(this.adminKeypair);
```

### 2. **Settle Escrow Transactions**
When both parties have deposited their assets:
- Backend calls the `settle()` instruction on the Solana program
- **Signs with `AUTHORITY_KEYPAIR`** to authorize the settlement
- Transfers USDC to seller (minus fees)
- Transfers NFT to buyer
- Collects platform fees

**Code Location:** `src/services/escrow-program.service.ts:settle()`

### 3. **Admin Cancellation**
If there's a dispute or issue:
- Admin can cancel the escrow
- **Signs with `AUTHORITY_KEYPAIR`** to prove authorization
- Returns assets to original parties

**Code Location:** `src/services/escrow-program.service.ts:adminCancel()`

### 4. **Pay Transaction Fees**
All on-chain operations require SOL for gas fees:
- Creating accounts
- Transferring tokens
- Closing accounts
- **All paid by `AUTHORITY_KEYPAIR`**

---

## How It Was Created

### STAGING Admin Wallet

The staging admin wallet was generated using standard Solana tooling:

```bash
# Original creation (done during Task 65)
solana-keygen new --outfile wallets/staging/staging-admin.json
```

**Details:**
- **Public Key:** `498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R`
- **Private Key:** Stored in `wallets/staging/staging-admin.json`
- **Format:** Standard Solana keypair (64-byte secret key)
- **Location:** `wallets/staging/staging-admin.json` (git-ignored for security)
- **Backup:** `temp/staging-backups/staging-admin.json`

### Creation History

From documentation (`docs/STAGING_WALLETS.md` and `docs/tasks/TASK_65_COMPLETION.md`):

1. **Initial Generation:** Task 65 - Generate STAGING wallets
   - Created dedicated wallets for staging environment
   - Separate from dev/test wallets to avoid confusion

2. **Security Hardening:** Multiple tasks improved wallet security
   - Added to .gitignore (never commit to Git)
   - Backed up to temp/ directory
   - Documented in multiple places

3. **Wallet Structure:**
   ```
   wallets/staging/
   ├── staging-admin.json           ← AUTHORITY_KEYPAIR
   ├── staging-sender.json          ← Test wallet
   ├── staging-receiver.json        ← Test wallet
   └── staging-fee-collector.json   ← Platform fees
   ```

---

## Solana Program Authority

In the Solana program (`programs/escrow/src/lib.rs`), the admin is verified:

```rust
pub struct AdminCancel<'info> {
    pub escrow_state: Account<'info, EscrowState>,
    pub admin: Signer<'info>,  // ← Must sign the transaction
    // ...
}
```

The program checks:
1. **Signature:** Admin must sign the transaction
2. **Authority:** Admin's public key must match the one set during escrow creation
3. **Permissions:** Only admin can perform certain operations (settle, cancel)

**Stored in Escrow State:**
```rust
pub struct EscrowState {
    pub admin: Pubkey,  // ← Set during initAgreement()
    // ...
}
```

---

## Security Considerations

### Why It's Critical

`AUTHORITY_KEYPAIR` can:
- ✅ Initialize escrow agreements (required for platform to function)
- ✅ Settle transactions (complete trades)
- ✅ Cancel escrows (dispute resolution)
- ✅ Pay gas fees (platform expense)

It **cannot**:
- ❌ Steal user funds (Solana program enforces constraints)
- ❌ Modify completed escrows (state is immutable once settled)
- ❌ Override buyer/seller permissions (program validates owners)

### Protection Measures

1. **Never Committed to Git**
   - Listed in `.gitignore`
   - Stored in `wallets/staging/` (git-ignored directory)

2. **Environment Variable (Encrypted)**
   - Stored as encrypted secret in DigitalOcean
   - Never exposed in logs or responses
   - Only loaded in backend memory

3. **Multiple Formats Supported**
   - JSON array: `[165,5,62,...]`
   - Base58: `4JMoiWVkrn...`
   - Base64: (also supported)

4. **Backup Strategy**
   - Backed up to `temp/staging-backups/`
   - Documented in multiple places
   - Can be regenerated if lost (but with new address)

---

## Environment Variable Setup

### What the Code Expects

From `src/services/escrow-program.service.ts:loadAdminKeypair()`:

```typescript
function loadAdminKeypair(): Keypair {
  // 1. Try AUTHORITY_KEYPAIR first (preferred)
  let envValue = process.env.AUTHORITY_KEYPAIR;
  
  // 2. Fallback to DEVNET_ADMIN_PRIVATE_KEY (for devnet)
  if (!envValue && process.env.SOLANA_NETWORK === 'devnet') {
    envValue = process.env.DEVNET_ADMIN_PRIVATE_KEY;
  }
  
  // 3. Support multiple formats
  if (envValue.startsWith('[')) {
    // JSON array format
    const secretKey = Uint8Array.from(JSON.parse(envValue));
    return Keypair.fromSecretKey(secretKey);
  } else {
    // Base58 format
    const secretKey = bs58.decode(envValue);
    return Keypair.fromSecretKey(secretKey);
  }
}
```

### Recommended Setup

**DigitalOcean Environment Variable:**
```
Key: AUTHORITY_KEYPAIR
Value: 4JMoiWVkrnUxXqdhqCEoPcYu5RjmFSGBPX9Wb2ngRHnoQjCE75zehZWZRtykfhCZPchKo1SYZ1KsZkLWHQoSRz9X
Type: Encrypted ✅
Scope: RUN_TIME
```

---

## Funding Requirements

The admin wallet needs SOL to pay transaction fees:

**Minimum Balance:**
- **Development:** 1-2 SOL (for testing)
- **Staging:** 5+ SOL (for E2E tests and operations)
- **Production:** 20+ SOL (for sustained operations)

**How to Fund:**
```bash
# Devnet (staging)
solana airdrop 5 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R --url devnet

# Mainnet (production) - must purchase
# Transfer SOL from exchange or another wallet
```

**Current Staging Balance:**
```bash
# Check via CLI
solana balance 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R --url devnet

# Or check via E2E tests (shown in test output)
npm run test:staging:e2e:verbose
# Output: admin: 1.0000 SOL
```

---

## Different Names in Different Contexts

To avoid confusion, here are all the names used:

| Context | Variable Name | Purpose |
|---------|---------------|---------|
| **Solana Program** | `admin` | The signer/authority who can settle/cancel |
| **Backend Code** | `AUTHORITY_KEYPAIR` | Environment variable (preferred) |
| **Backend Code** | `DEVNET_ADMIN_PRIVATE_KEY` | Environment variable (fallback) |
| **Backend Code** | `adminKeypair` | Class property holding the loaded keypair |
| **YAML Config** | `DEVNET_STAGING_ADMIN_PRIVATE_KEY` | ❌ **Removed** (was redundant) |
| **Documentation** | "Admin Wallet" | General reference |
| **Wallet File** | `staging-admin.json` | Actual file containing the keypair |

**We standardized on `AUTHORITY_KEYPAIR` to avoid confusion!**

---

## Troubleshooting

### Error: "Admin keypair not configured"
**Cause:** `AUTHORITY_KEYPAIR` environment variable not set

**Solution:**
1. Set `AUTHORITY_KEYPAIR` in DigitalOcean
2. Value: Base58 format (recommended) or JSON array
3. Mark as Encrypted
4. Redeploy

### Error: "provided secretKey is invalid"
**Cause:** Wrong format or incorrect value

**Solution:**
1. Verify exact Base58 string: `4JMoiWVkrnUxXqdhqCEoPcYu5RjmFSGBPX9Wb2ngRHnoQjCE75zehZWZRtykfhCZPchKo1SYZ1KsZkLWHQoSRz9X`
2. No extra spaces or newlines
3. Must be 64 bytes when decoded
4. Should derive to public key: `498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R`

### How to Verify Key Format

```bash
# On your local machine
node temp/convert-keypair.js

# Should output:
# Base58: 4JMoiWVkrnUxXqdhqCEoPcYu5RjmFSGBPX9Wb2ngRHnoQjCE75zehZWZRtykfhCZPchKo1SYZ1KsZkLWHQoSRz9X
# Length: 64 bytes

# Verify public key matches
solana-keygen pubkey wallets/staging/staging-admin.json
# Should output: 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R
```

---

## Related Documentation

- [Staging Wallets Overview](./STAGING_WALLETS.md)
- [Staging Reference](./STAGING_REFERENCE.md)
- [Security: Wallet Protection](./STAGING_WALLET_PROTECTION.md)
- [Deployment: Required Env Vars](./deployment/STAGING_REQUIRED_ENV_VARS.md)

---

## Summary

**AUTHORITY_KEYPAIR is:**
- ✅ The platform admin wallet
- ✅ Used to sign all escrow transactions
- ✅ Required for the backend to function
- ✅ Must be kept secure (encrypted secret)
- ✅ Needs SOL balance for gas fees
- ✅ Cannot steal user funds (Solana program enforces rules)

**For Staging:**
- **Public Key:** `498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R`
- **Set in DigitalOcean as:** `AUTHORITY_KEYPAIR`
- **Value (Base58):** `4JMoiWVkrnUxXqdhqCEoPcYu5RjmFSGBPX9Wb2ngRHnoQjCE75zehZWZRtykfhCZPchKo1SYZ1KsZkLWHQoSRz9X`
- **Encrypted:** ✅ Yes

