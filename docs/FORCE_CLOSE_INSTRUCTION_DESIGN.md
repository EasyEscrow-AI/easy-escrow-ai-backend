# Admin Force Close with Asset Recovery - Design Document

## Overview

A new smart contract instruction to close legacy escrow accounts and recover trapped assets without requiring state deserialization.

## Problem Statement

172 escrow PDAs exist on mainnet with:
- ~0.4 SOL in rent-exempt reserves
- 5+ trapped NFTs
- ~0.04 SOL extra deposits
- Cannot be closed via normal methods due to:
  - State deserialization failures (old program versions)
  - Non-terminal states (pending, but abandoned)

## Solution: `admin_force_close_with_recovery`

### Instruction Features

✅ **Admin-Only** - Requires admin signature (security)  
✅ **No State Deserialization** - Works on any account structure  
✅ **Asset Recovery** - Returns NFTs and SOL to original depositors  
✅ **Blockchain Tracing** - Derives owners from on-chain history  
✅ **Rent Recovery** - Returns rent-exempt reserve to admin  

### Instruction Flow

```rust
pub fn admin_force_close_with_recovery<'info>(
    ctx: Context<'_, '_, '_, 'info, AdminForceClose<'info>>
) -> Result<()> {
    // 1. Verify admin authority
    require!(
        ctx.accounts.admin.key() == ADMIN_PUBKEY,
        EscrowError::Unauthorized
    );

    // 2. Handle remaining_accounts for assets
    // remaining_accounts format:
    // [0..n] = Token accounts owned by escrow (NFTs to return)
    // [n+1] = SOL vault PDA (if exists)
    // [n+2] = Recipient wallet for SOL
    // [n+3] = Recipient for each NFT

    // 3. Return NFTs (if any)
    for account in remaining_accounts for NFTs {
        // Transfer NFT from escrow token account to recipient
        // Recipient derived from blockchain history (off-chain prep)
        token::transfer(
            CpiContext::new_with_signer(
                token_program,
                Transfer {
                    from: escrow_token_account,
                    to: recipient_token_account,
                    authority: escrow_pda,
                },
                signer_seeds,
            ),
            1, // NFTs are always 1 token
        )?;
        
        // Close the token account, return rent to admin
        token::close_account(
            CpiContext::new_with_signer(
                token_program,
                CloseAccount {
                    account: escrow_token_account,
                    destination: admin,
                    authority: escrow_pda,
                },
                signer_seeds,
            ),
        )?;
    }

    // 4. Return SOL from sol_vault (if exists and has balance > rent)
    if sol_vault exists {
        let vault_balance = sol_vault.lamports();
        let rent_exempt = Rent::get()?.minimum_balance(0);
        
        if vault_balance > rent_exempt {
            let refund_amount = vault_balance - rent_exempt;
            
            // Transfer SOL to recipient
            **sol_vault.lamports.borrow_mut() -= refund_amount;
            **recipient.lamports.borrow_mut() += refund_amount;
        }
        
        // Close sol_vault, return rent to admin
        **sol_vault.lamports.borrow_mut() = 0;
        **admin.lamports.borrow_mut() += sol_vault.lamports();
    }

    // 5. Close escrow PDA, return rent to admin
    let escrow_lamports = ctx.accounts.escrow_state.to_account_info().lamports();
    **ctx.accounts.escrow_state.to_account_info().try_borrow_mut_lamports()? = 0;
    **ctx.accounts.admin.to_account_info().try_borrow_mut_lamports()? += escrow_lamports;

    Ok(())
}
```

### Account Structure

```rust
#[derive(Accounts)]
pub struct AdminForceClose<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    
    /// Escrow PDA to close (any structure, no deserialization)
    /// CHECK: We don't deserialize, just close it
    #[account(mut)]
    pub escrow_state: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    
    // remaining_accounts:
    // - Token accounts owned by escrow (NFTs)
    // - Recipient token accounts (for NFT transfers)
    // - SOL vault PDA (optional)
    // - SOL recipient (optional)
}
```

## Off-Chain Preparation

Before calling the instruction, an off-chain script must:

1. **Scan escrow PDA** for owned token accounts
2. **Trace blockchain history** to find original depositor for each NFT
3. **Check for sol_vault** existence and balance
4. **Trace SOL deposits** to find original depositor
5. **Prepare recipient accounts** (create ATAs if needed)
6. **Build remaining_accounts** array with correct order

### Tracing Algorithm

```typescript
// For NFTs
async function traceNFTDepositor(escrowPda: PublicKey, nftMint: PublicKey): Promise<PublicKey> {
  // 1. Get all signatures for escrow PDA
  const signatures = await connection.getSignaturesForAddress(escrowPda);
  
  // 2. Find deposit transaction (transfer TO escrow)
  for (const sig of signatures) {
    const tx = await connection.getTransaction(sig.signature);
    
    // Find token transfer where destination is escrow
    const transfer = findTokenTransfer(tx, nftMint, escrowPda);
    if (transfer) {
      return transfer.source_owner; // Original depositor
    }
  }
  
  throw new Error('Could not find depositor');
}

// For SOL
async function traceSOLDepositor(escrowPda: PublicKey): Promise<PublicKey> {
  // Similar process, but look for SOL transfers to sol_vault PDA
  // Fall back to seller/buyer from escrow creation tx
}
```

## Safety Features

1. **Admin-Only**: Only admin can call this instruction
2. **No State Mutation**: Doesn't try to read/update corrupted state
3. **Asset Tracing**: Always returns to original depositor (verifiable on-chain)
4. **Fail-Safe**: If tracing fails, script reports for manual review
5. **Audit Trail**: All transfers logged on-chain

## Cost Analysis

**Per Account:**
- Transaction fee: ~0.000005 SOL (standard Solana, no Jito)
- Priority fee: ~0.00001 SOL (optional)
- **Total Cost**: ~0.000015 SOL per account

**For 172 Accounts:**
- Total cost: ~0.00258 SOL (~$0.50)
- Total recovery: ~0.44 SOL (~$90)
- **Net gain**: ~0.437 SOL (~$89.50)

## Implementation Plan

### Phase 1: Smart Contract
1. Add `admin_force_close_with_recovery` instruction
2. Add unit tests for various scenarios
3. Test on devnet with sample accounts
4. Deploy to mainnet via program upgrade

### Phase 2: Off-Chain Tool
1. Build asset tracing script
2. Build recipient preparation script
3. Build batch execution script
4. Test on devnet clones of mainnet accounts

### Phase 3: Execution
1. Dry run on first 5 accounts
2. Verify assets returned correctly
3. Execute full batch (172 accounts)
4. Verify all rent recovered

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Can't determine depositor | Manual review, contact users |
| Recipient ATA doesn't exist | Script creates it before calling instruction |
| SOL vault PDA derivation wrong | Multiple derivation attempts, verify balance |
| Transaction fails mid-batch | Resume from last successful index |
| Assets sent to wrong address | Thorough testing, manual verification of first 5 |

## Testing Strategy

1. **Unit Tests**: Test instruction with various account configurations
2. **Integration Tests**: End-to-end on devnet with real scenarios
3. **Mainnet Test**: Run on 3-5 accounts first, verify manually
4. **Full Batch**: Execute remaining accounts after verification

## Rollback Plan

If issues discovered:
1. Stop batch execution immediately
2. Analyze failed transactions
3. Fix tracing logic if needed
4. Resume from last successful account

---

**Status**: Design Complete - Ready for Implementation  
**Next Step**: Implement smart contract instruction



