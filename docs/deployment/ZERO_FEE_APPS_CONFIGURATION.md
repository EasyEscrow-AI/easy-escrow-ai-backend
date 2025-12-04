# Zero-Fee Authorized Apps Configuration

## Overview

The atomic swap program includes a whitelist system that allows specific authorized applications to execute swaps without paying platform fees. This document outlines the current configuration, security implications, and recommendations for production.

---

## Current Configuration

### Source Code Location
`programs/escrow/src/instructions/atomic_swap.rs` - Lines 20-33

```rust
fn get_zero_fee_authorized_apps() -> Vec<Pubkey> {
    vec![
        // Staging admin for testing (498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R)
        Pubkey::new_from_array([
            0x2e, 0xa7, 0xec, 0x9b, 0xaa, 0xe0, 0xb3, 0xea,
            0xa4, 0x76, 0xd3, 0x1c, 0x53, 0x77, 0xfa, 0x65,
            0xb7, 0x39, 0x8f, 0xa5, 0x1e, 0x26, 0x5e, 0x0b,
            0x9d, 0xe3, 0xdd, 0x7f, 0xc2, 0x01, 0x3a, 0xc2,
        ]),
        // Add more authorized app public keys here as needed
    ]
}
```

### Current Whitelist

| Address | Purpose | Network | Status |
|---------|---------|---------|--------|
| `498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R` | Staging Admin | Staging | ⚠️ Testing Only |

---

## How It Works

### Authorization Flow

1. **Swap Initiated** with `platform_fee_bps = 0`
2. **Program Checks** if `authorized_app` signer is provided
3. **Validates** signer's public key against whitelist
4. **Authorizes** zero-fee swap if match found
5. **Rejects** if no match or no signer provided

### Code Validation

```rust
fn validate_params(params: &SwapParams, authorized_app: Option<&Signer>) -> Result<()> {
    // Check if this is a zero-fee swap (requires authorization)
    if params.platform_fee_bps == 0 {
        // Zero-fee swaps require an authorized app SIGNER (proves ownership)
        let app_signer = authorized_app.ok_or(AtomicSwapError::UnauthorizedZeroFeeSwap)?;
        
        // Check against whitelist
        let authorized_apps = get_zero_fee_authorized_apps();
        require!(
            authorized_apps.contains(&app_signer.key()),
            AtomicSwapError::UnauthorizedZeroFeeSwap
        );
        
        msg!("Zero-fee swap authorized for app: {}", app_signer.key());
    }
    
    Ok(())
}
```

### Security Features

✅ **Requires Signature** - App must prove ownership of private key  
✅ **Hardcoded Whitelist** - Cannot be modified at runtime  
✅ **Compile-Time Only** - Changes require program upgrade  
✅ **Explicit Authorization** - Each app must be individually added  
✅ **Audit Trail** - All zero-fee swaps logged with app ID

---

## Production Recommendations

### Option 1: Start with Empty Whitelist (Recommended)

**Pros:**
- ✅ All swaps generate revenue
- ✅ Simplest configuration
- ✅ No trust requirements
- ✅ Easiest to audit

**Cons:**
- ❌ Cannot offer zero-fee promotions
- ❌ No partnerships with zero-fee incentives
- ❌ Official frontend must charge fees

**Implementation:**
```rust
fn get_zero_fee_authorized_apps() -> Vec<Pubkey> {
    vec![] // No apps authorized for zero-fee swaps
}
```

**Deployment:**
- Remove staging admin from whitelist
- Rebuild program with empty vec
- Deploy updated program to mainnet
- Document that all swaps require fees

---

### Option 2: Authorize Official Frontend Only

**Pros:**
- ✅ Can offer zero-fee promotions
- ✅ Control over fee policy
- ✅ Better user acquisition
- ✅ Marketing flexibility

**Cons:**
- ❌ Requires trusted backend signer
- ❌ Backend complexity increases
- ❌ Lost revenue on zero-fee swaps
- ❌ Monitoring required

**Implementation:**
1. Generate dedicated backend signer keypair
2. Add to whitelist in program code
3. Store private key as secret in backend
4. Backend signs zero-fee swaps when authorized
5. Frontend requests zero-fee when applicable

**Example:**
```rust
fn get_zero_fee_authorized_apps() -> Vec<Pubkey> {
    vec![
        // Official backend signer
        Pubkey::new_from_array([
            // Backend public key bytes here
        ]),
    ]
}
```

---

### Option 3: Partner Ecosystem Approach

**Pros:**
- ✅ Enables strategic partnerships
- ✅ Drives ecosystem growth
- ✅ Revenue sharing opportunities
- ✅ Network effects

**Cons:**
- ❌ Due diligence required for each partner
- ❌ Legal agreements needed
- ❌ Trust and security risks
- ❌ Ongoing monitoring required
- ❌ Potential for abuse

**Implementation:**
1. Establish vetting criteria
2. Legal partnership agreements
3. Add partner public keys to whitelist
4. Monitor partner usage
5. Revoke if terms violated (requires upgrade)

**Partner Criteria:**
- Established reputation
- Legal entity verification
- Security audit passed
- Usage monitoring agreement
- Revenue sharing terms

---

## Current State: Production Readiness

### ❌ **NOT PRODUCTION READY** - Zero-Fee Whitelist Needs Attention

**Issue:** Whitelist contains staging admin address, inappropriate for production

**Impact:**
- Staging admin could execute zero-fee swaps on mainnet
- Security risk if staging key is compromised
- Not aligned with production security model

**Required Actions:**

1. **Decide on Strategy:**
   - Option 1: Empty whitelist (all swaps have fees)
   - Option 2: Official frontend only
   - Option 3: Partner ecosystem

2. **Update Program Code:**
   - Modify `get_zero_fee_authorized_apps()` function
   - Add approved public keys (if any)
   - Remove staging admin address

3. **Rebuild and Deploy:**
   - Build with `--no-default-features --features mainnet`
   - Deploy updated program to mainnet
   - Verify whitelist in deployment

4. **Document Decision:**
   - Record which option chosen
   - Document rationale
   - Update operational procedures

---

## Implementation Guide

### Updating the Whitelist

**File:** `programs/escrow/src/instructions/atomic_swap.rs`

**Steps:**

1. **Edit the function:**
   ```rust
   fn get_zero_fee_authorized_apps() -> Vec<Pubkey> {
       vec![
           // Add your authorized apps here
           // Example:
           // Pubkey::new_from_array([0x12, 0x34, ...]),
       ]
   }
   ```

2. **Rebuild the program:**
   ```powershell
   cd programs/escrow
   $env:HOME = $env:USERPROFILE
   cargo build-sbf --no-default-features --features mainnet
   ```

3. **Deploy upgrade:**
   ```bash
   solana program deploy \
     --url mainnet-beta \
     --keypair wallets/production/mainnet-deployer.json \
     --upgrade-authority wallets/production/mainnet-deployer.json \
     --program-id 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
     target/deploy/easyescrow.so
   ```

4. **Verify:**
   - Test zero-fee swap with authorized app ✅
   - Test zero-fee swap without auth ❌ (should fail)
   - Test regular fee swap ✅
   - Monitor logs for unauthorized attempts

---

## Monitoring and Compliance

### Metrics to Track

1. **Zero-Fee Swap Count**
   - Total zero-fee swaps per day/week
   - Per-app breakdown
   - Revenue impact calculation

2. **Authorization Failures**
   - Attempts to use zero-fee without authorization
   - Potential abuse attempts
   - Security incidents

3. **Fee Revenue**
   - Total fees collected
   - Average fee per swap
   - Impact of zero-fee program

### Audit Requirements

**Monthly:**
- Review all authorized apps
- Verify no unauthorized additions
- Check for security incidents
- Assess revenue impact

**Quarterly:**
- Partner performance review
- Whitelist audit
- Security assessment
- Revenue analysis

**Annually:**
- Comprehensive security audit
- Legal agreement renewals
- Strategic review of zero-fee program
- Cost-benefit analysis

---

## Security Considerations

### Risks of Zero-Fee Whitelist

⚠️ **Revenue Loss**
- Direct impact on platform income
- Must be offset by strategic value
- Monitor closely for abuse

⚠️ **Key Compromise**
- If authorized app key is compromised, attacker can execute zero-fee swaps
- Requires program upgrade to revoke
- Monitoring essential

⚠️ **Trust Requirements**
- Must trust app developers
- Legal recourse if terms violated
- Due diligence mandatory

### Mitigation Strategies

✅ **Start Conservative**
- Begin with empty whitelist
- Add apps gradually after vetting
- Monitor each addition closely

✅ **Legal Protection**
- Written agreements with all partners
- Clear terms of service
- Revocation clauses

✅ **Technical Safeguards**
- Rate limiting on backend
- Usage monitoring and alerts
- Automated anomaly detection

✅ **Operational Controls**
- Regular audits
- Quarterly reviews
- Immediate revocation process documented

---

## Recommended Decision: Backend API Key Authorization (Best Approach)

### Architecture

Instead of hardcoding partner addresses in the program, use **Backend-Controlled Authorization**:

1. **Backend Signers in Whitelist** (Program Code)
   - Staging backend: `498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R`
   - Production backend: `<new-production-signer>` (to be generated)
   - Both added to program whitelist

2. **Third-Party Apps Get API Keys** (Backend Database)
   - Apps request zero-fee access
   - Backend issues unique API key per app
   - Example: `ATOMIC_SWAP_API_KEY=0600de78367cab25c714df205488dd8e059e1a99befed8e72526088a82c5d22b`

3. **Backend Signs Zero-Fee Swaps** (Runtime Control)
   - App sends swap request with API key
   - Backend validates API key against database
   - If valid → backend signs with authorized signer
   - If invalid → reject or charge normal fee

### Benefits

✅ **Flexible:** Add/revoke partners without program upgrade  
✅ **Secure:** Backend controls all authorization  
✅ **Auditable:** Log all zero-fee requests with API key ID  
✅ **Scalable:** Easy to add unlimited partners  
✅ **Cost Effective:** No redeployment for partner changes  
✅ **Granular Control:** Rate limits, usage quotas, temporary access

### Implementation

**Update `atomic_swap.rs` Whitelist:**
```rust
fn get_zero_fee_authorized_apps() -> Vec<Pubkey> {
    vec![
        // Staging backend signer (for devnet/staging testing)
        Pubkey::new_from_array([
            0x2e, 0xa7, 0xec, 0x9b, 0xaa, 0xe0, 0xb3, 0xea,
            0xa4, 0x76, 0xd3, 0x1c, 0x53, 0x77, 0xfa, 0x65,
            0xb7, 0x39, 0x8f, 0xa5, 0x1e, 0x26, 0x5e, 0x0b,
            0x9d, 0xe3, 0xdd, 0x7f, 0xc2, 0x01, 0x3a, 0xc2,
        ]),
        // Production backend signer (for mainnet)
        // Pubkey::new_from_array([...]), // Generate new keypair
    ]
}
```

**Backend Implementation:**
```typescript
// Check API key from request
const apiKey = req.headers['x-atomic-swap-api-key'];

// Validate against database
const authorizedApp = await db.authorizedApps.findOne({ apiKey, active: true });

if (authorizedApp && params.platform_fee_bps === 0) {
    // Sign transaction with backend's authorized signer
    const backendSigner = Keypair.fromSecretKey(process.env.ZERO_FEE_SIGNER_PRIVATE_KEY);
    transaction.partialSign(backendSigner);
    
    // Log for audit
    await logZeroFeeSwap({
        appId: authorizedApp.id,
        appName: authorizedApp.name,
        swapId: params.escrowId,
        timestamp: Date.now()
    });
}
```

**Backend Database Schema:**
```typescript
// authorized_apps table
interface AuthorizedApp {
    id: string;
    name: string;
    apiKey: string; // SHA256 hashed
    active: boolean;
    zeroFeeEnabled: boolean;
    rateLimit: number; // swaps per day
    createdAt: Date;
    lastUsedAt: Date;
}
```

**Generate Production Backend Signer:**
```bash
# Generate new keypair for production backend
solana-keygen new -o wallets/production/backend-zero-fee-signer.json
solana-keygen pubkey wallets/production/backend-zero-fee-signer.json
```

**Update Program Code:**
Add the new production signer public key to the whitelist in `atomic_swap.rs`.

**Rebuild and Deploy:**
```powershell
cd programs/escrow
$env:HOME = $env:USERPROFILE
cargo build-sbf --no-default-features --features mainnet
cd ../..
solana program deploy \
  --url mainnet-beta \
  --keypair wallets/production/mainnet-deployer.json \
  --upgrade-authority wallets/production/mainnet-deployer.json \
  --program-id 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  target/deploy/easyescrow.so
```

**Backend Environment Variable:**
```bash
# Production backend
ZERO_FEE_SIGNER_PRIVATE_KEY=<from backend-zero-fee-signer.json>
```

**Document:**
- API documentation for zero-fee partner integration
- API key request process
- Partner vetting criteria
- Usage monitoring and rate limits

### Future Expansion

When ready to add authorized apps:
1. Establish vetting criteria
2. Create legal templates
3. Set up monitoring infrastructure
4. Add first app to whitelist
5. Monitor closely for 30 days
6. Gradually expand if successful

---

## Conclusion

**Current Status:** ⚠️ **Requires Update Before Production**

**Recommended Action:** Remove staging admin from whitelist, start with empty whitelist

**Timeline:**
- Update code: 15 minutes
- Rebuild: 5 minutes  
- Deploy: 10 minutes
- Verify: 10 minutes
- **Total:** ~40 minutes

**Next Steps:**
1. Decide on zero-fee strategy
2. Update program code
3. Rebuild and redeploy
4. Verify authorization logic
5. Document final configuration
6. Proceed with production launch

---

**Document Version:** 1.0  
**Last Updated:** December 4, 2025  
**Status:** FOR REVIEW  
**Decision Required:** Zero-fee strategy selection

