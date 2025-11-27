# Treasury Withdrawal Security: Locked Destination Wallet

**Status:** 🟡 Recommended for Implementation  
**Priority:** HIGH  
**Security Impact:** Prevents unauthorized fund redirection

---

## 🎯 Security Proposal

**Lock the Treasury PDA to only allow withdrawals to a pre-designated treasury wallet.**

### Current State (VULNERABLE)

```rust
// programs/escrow/src/instructions/withdraw.rs
pub fn withdraw_treasury_fees_handler(
    ctx: Context<WithdrawTreasuryFees>,
    amount: u64,
) -> Result<()> {
    // ❌ Can withdraw to ANY wallet provided by caller!
    let treasury_wallet_account_info = ctx.accounts.treasury_wallet.to_account_info();
    **treasury_wallet_account_info.try_borrow_mut_lamports()? += amount;
    // ...
}
```

**Risk:** If platform authority is compromised, attacker can drain Treasury to their own wallet.

### Proposed State (SECURE)

```rust
// programs/escrow/src/state/treasury.rs
#[account]
pub struct Treasury {
    pub authority: Pubkey,
    pub total_fees_collected: u64,
    pub total_swaps_executed: u64,
    pub total_fees_withdrawn: u64,
    pub is_paused: bool,
    pub paused_at: i64,
    pub last_withdrawal_at: i64,
    
    /// SECURITY: Locked destination wallet for withdrawals
    /// Can only be changed via program upgrade
    pub authorized_withdrawal_wallet: Pubkey,  // +32 bytes
    
    pub bump: u8,
}

// NEW SIZE: 114 bytes (was 82 bytes)
```

```rust
// programs/escrow/src/instructions/withdraw.rs
pub fn withdraw_treasury_fees_handler(
    ctx: Context<WithdrawTreasuryFees>,
    amount: u64,
) -> Result<()> {
    let treasury = &mut ctx.accounts.treasury;
    
    // ✅ SECURITY: Validate withdrawal destination
    require!(
        ctx.accounts.treasury_wallet.key() == treasury.authorized_withdrawal_wallet,
        AtomicSwapError::UnauthorizedWithdrawalDestination
    );
    
    // ... rest of withdrawal logic
}
```

---

## 🛡️ Security Benefits

### 1. **Prevents Fund Redirection**
Even if platform authority private key is compromised, attacker CANNOT:
- Change withdrawal destination
- Drain funds to their own wallet
- Redirect fees to arbitrary addresses

### 2. **Requires Program Upgrade to Change**
To change the authorized wallet:
1. Must upgrade the Solana program (requires authority)
2. Run migration to update Treasury PDA
3. Provides audit trail and time for detection
4. Much harder than just signing a transaction

### 3. **Environment-Specific Security**
- **Staging:** Can use hot wallet for testing
- **Production:** Can use hardware wallet / multisig
- Different authorized wallets per environment

### 4. **Defense in Depth**
Adds an extra security layer even if:
- Platform authority is compromised
- Backend server is hacked
- Unauthorized access to signing keys

---

## 📐 Implementation Plan

### Phase 1: Update Treasury Structure

**1. Update Treasury Account (Size: 82 → 114 bytes)**

```rust
// programs/escrow/src/state/treasury.rs
impl Treasury {
    /// Space required for Treasury account
    /// Discriminator (8) + Pubkey (32) + u64 (8) + u64 (8) + u64 (8) + 
    /// bool (1) + i64 (8) + i64 (8) + Pubkey (32) + u8 (1) = 114 bytes
    pub const LEN: usize = 8 + 32 + 8 + 8 + 8 + 1 + 8 + 8 + 32 + 1;
}
```

**2. Update Initialize Instruction**

```rust
// programs/escrow/src/instructions/initialize.rs
pub fn initialize_treasury_handler(
    ctx: Context<InitializeTreasury>,
    authorized_withdrawal_wallet: Pubkey,  // NEW PARAMETER
) -> Result<()> {
    let treasury = &mut ctx.accounts.treasury;
    
    treasury.authority = ctx.accounts.authority.key();
    treasury.total_fees_collected = 0;
    treasury.total_swaps_executed = 0;
    treasury.total_fees_withdrawn = 0;
    treasury.is_paused = false;
    treasury.paused_at = 0;
    treasury.last_withdrawal_at = 0;
    treasury.authorized_withdrawal_wallet = authorized_withdrawal_wallet;  // NEW
    treasury.bump = ctx.bumps.treasury;
    
    msg!("Treasury initialized with authority: {}", treasury.authority);
    msg!("Authorized withdrawal wallet: {}", authorized_withdrawal_wallet);
    
    Ok(())
}
```

**3. Update Withdraw Instruction**

```rust
// programs/escrow/src/instructions/withdraw.rs
#[derive(Accounts)]
pub struct WithdrawTreasuryFees<'info> {
    #[account(mut, signer)]
    pub authority: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [Treasury::SEED_PREFIX, authority.key().as_ref()],
        bump = treasury.bump,
        constraint = treasury.authority == authority.key() @ AtomicSwapError::Unauthorized,
        constraint = !treasury.is_paused @ AtomicSwapError::ProgramPaused
    )]
    pub treasury: Account<'info, Treasury>,

    /// SECURITY: Must match treasury.authorized_withdrawal_wallet
    #[account(
        mut,
        constraint = treasury_wallet.key() == treasury.authorized_withdrawal_wallet 
            @ AtomicSwapError::UnauthorizedWithdrawalDestination
    )]
    pub treasury_wallet: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}
```

**4. Add Error Code**

```rust
// programs/escrow/src/errors.rs
#[error_code]
pub enum AtomicSwapError {
    // ... existing errors ...
    
    #[msg("Unauthorized withdrawal destination: Treasury can only withdraw to authorized wallet")]
    UnauthorizedWithdrawalDestination,
}
```

### Phase 2: Migration Strategy

Since we just deployed `treasury_v2` (82 bytes), we need to migrate to `treasury_v3` (114 bytes):

**Option A: New Seeds (Recommended for Staging)**
```rust
// Use treasury_v3 seeds
pub const SEED_PREFIX: &'static [u8] = b"treasury_v3";
```

**Option B: Close & Reinitialize (if no significant funds)**
1. Run `close_treasury` on existing v2 PDA
2. Reinitialize with new 114-byte structure
3. Provide `authorized_withdrawal_wallet` during init

**For Production:** Must be implemented BEFORE production deployment (no migration needed).

### Phase 3: Backend Updates

**1. Update Initialization Script**

```typescript
// scripts/treasury/migrate-treasury.ts
async function initializeTreasury() {
    const authorizedWallet = new PublicKey(
        environment === 'staging'
            ? config.platform.treasuryAddress  // Staging treasury wallet
            : 'HMtLHzJZ5AUUaKjYBGZpB4RbjN4gYvcd69esNwtaUBFF'  // Production treasury wallet
    );
    
    const tx = await program.methods
        .initializeTreasury(authorizedWallet)  // Pass authorized wallet
        .accounts({
            authority: adminKeypair.publicKey,
            treasury: treasuryPda,
            systemProgram: SystemProgram.programId,
        })
        .signers([adminKeypair])
        .rpc();
    
    console.log('✅ Treasury initialized');
    console.log(`   Authorized withdrawal wallet: ${authorizedWallet.toBase58()}`);
}
```

**2. Update Withdrawal Script**

```typescript
// scripts/treasury/weekly-withdrawal.ts
// No changes needed! Script already uses config.platform.treasuryAddress
// But now it's enforced on-chain too!

const treasuryWalletPubkey = new PublicKey(config.platform.treasuryAddress);

const tx = await program.methods
    .withdrawTreasuryFees(new anchor.BN(withdrawAmount))
    .accounts({
        authority: adminKeypair.publicKey,
        treasury: treasuryPda,
        treasuryWallet: treasuryWalletPubkey,  // ✅ Must match on-chain authorized wallet
        systemProgram: SystemProgram.programId,
    })
    .signers([adminKeypair])
    .rpc();
```

### Phase 4: Testing

**1. Unit Tests**

```rust
// programs/escrow/src/tests/withdraw.rs
#[test]
fn test_withdraw_to_unauthorized_wallet_fails() {
    let mut program = setup_program();
    
    // Initialize with wallet A
    let authorized_wallet = Pubkey::new_unique();
    program.initialize_treasury(authorized_wallet).unwrap();
    
    // Try to withdraw to wallet B (should fail)
    let unauthorized_wallet = Pubkey::new_unique();
    let result = program.withdraw_treasury_fees(
        1000000,  // amount
        unauthorized_wallet  // wrong wallet!
    );
    
    assert_eq!(
        result.unwrap_err(),
        AtomicSwapError::UnauthorizedWithdrawalDestination
    );
}

#[test]
fn test_withdraw_to_authorized_wallet_succeeds() {
    let mut program = setup_program();
    
    let authorized_wallet = Pubkey::new_unique();
    program.initialize_treasury(authorized_wallet).unwrap();
    
    // Withdraw to correct wallet (should succeed)
    let result = program.withdraw_treasury_fees(1000000, authorized_wallet);
    assert!(result.is_ok());
}
```

**2. E2E Tests**

```typescript
// tests/staging/e2e/treasury-withdrawal.test.ts
it('should reject withdrawal to unauthorized wallet', async () => {
    const unauthorizedWallet = Keypair.generate();
    
    try {
        await program.methods
            .withdrawTreasuryFees(new BN(1000000))
            .accounts({
                authority: adminKeypair.publicKey,
                treasury: treasuryPda,
                treasuryWallet: unauthorizedWallet.publicKey,  // Wrong wallet!
                systemProgram: SystemProgram.programId,
            })
            .signers([adminKeypair])
            .rpc();
        
        assert.fail('Should have rejected unauthorized wallet');
    } catch (error) {
        expect(error.message).to.include('UnauthorizedWithdrawalDestination');
    }
});
```

---

## 📊 Security Comparison

| Scenario | Without Lock | With Lock |
|----------|-------------|-----------|
| **Platform authority compromised** | ❌ Funds stolen | ✅ Cannot redirect |
| **Backend server hacked** | ❌ Arbitrary withdrawals | ✅ Only to authorized wallet |
| **Malicious insider** | ❌ Can drain to own wallet | ✅ Audit trail required |
| **Change withdrawal wallet** | Easy (just sign tx) | Requires program upgrade |
| **Emergency response time** | None | Time to detect & respond |

---

## 🚨 Considerations

### Pros ✅

1. **Strong Security:** Prevents unauthorized fund redirection
2. **Simple Implementation:** Just one extra field + validation
3. **Environment-Specific:** Different wallets for staging/production
4. **Audit Trail:** Changes require program upgrade (visible)
5. **Low Overhead:** No performance impact

### Cons ⚠️

1. **Less Flexible:** Can't easily change withdrawal wallet
2. **Requires Migration:** Need treasury_v3 deployment
3. **One-Time Decision:** Wallet address locked at initialization
4. **Account Size:** Increases from 82 to 114 bytes (+32 bytes)

### Migration Impact

- **Staging:** Already have treasury_v2, need to migrate to v3
- **Production:** Can implement directly (not deployed yet)
- **Minimal Risk:** Just adds validation, doesn't change core logic

---

## 🎯 Recommendation

### For Production: **IMPLEMENT BEFORE LAUNCH** ✅

This should be **mandatory** for production. The security benefit far outweighs the flexibility cost.

### For Staging: **IMPLEMENT SOON** 🟡

Not urgent since staging has minimal funds, but good for testing the migration process.

---

## 📋 Implementation Checklist

### Immediate (Before Production)
- [ ] Update Treasury struct to 114 bytes
- [ ] Add `authorized_withdrawal_wallet` field
- [ ] Update `initialize_treasury` to accept wallet parameter
- [ ] Add validation in `withdraw_treasury_fees`
- [ ] Add `UnauthorizedWithdrawalDestination` error
- [ ] Write unit tests
- [ ] Write E2E tests

### Migration (Staging)
- [ ] Use `treasury_v3` seeds OR close/reinit v2
- [ ] Deploy updated program
- [ ] Initialize with authorized wallet
- [ ] Test withdrawal to correct wallet (succeeds)
- [ ] Test withdrawal to wrong wallet (fails)
- [ ] Update scripts to use new structure

### Documentation
- [ ] Update Treasury management docs
- [ ] Add to production deployment checklist
- [ ] Document authorized wallet addresses
- [ ] Update security documentation

---

## 🔗 Related Security Measures

1. **Multisig Authority** (Future): Use multisig for platform authority
2. **Timelock Withdrawals** (Future): Add delay between request & execution
3. **Withdrawal Limits** (Future): Cap maximum per withdrawal
4. **Emergency Pause** (Already Implemented): Can pause all operations

---

## 📚 References

- [Solana Security Best Practices](https://docs.solana.com/developing/programming-model/security)
- [Anchor Account Constraints](https://www.anchor-lang.com/docs/account-constraints)
- [TREASURY_MANAGEMENT.md](../operations/TREASURY_MANAGEMENT.md)
- [PRODUCTION_DEPLOYMENT_RUNBOOK.md](../deployment/PRODUCTION_DEPLOYMENT_RUNBOOK.md)

---

**Created:** November 27, 2025  
**Status:** Recommended for Implementation  
**Next Review:** Before production deployment

