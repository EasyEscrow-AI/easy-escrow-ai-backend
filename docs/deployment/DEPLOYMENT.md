# Solana Escrow Program - Deployment Guide

## Pre-Deployment Checklist

Before deploying the escrow program to devnet or mainnet, ensure all requirements are met:

### ✅ Development Environment
- [ ] Rust installed and configured
- [ ] Solana CLI installed (v1.17.0+)
- [ ] Anchor Framework installed (v0.29.0)
- [ ] Node.js and Yarn installed
- [ ] Git repository up to date

### ✅ Program Validation
- [ ] All tests passing (`anchor test`)
- [ ] Code compiled without errors (`anchor build`)
- [ ] Program ID generated (`anchor keys list`)
- [ ] Program ID updated in `lib.rs` declare_id!()
- [ ] Program ID updated in `Anchor.toml`
- [ ] Code reviewed for security issues
- [ ] All edge cases tested

### ✅ Configuration
- [ ] `Anchor.toml` configured for target network
- [ ] Wallet configured with sufficient SOL
- [ ] RPC endpoint configured (devnet/mainnet)
- [ ] Environment variables set

### ✅ Documentation
- [ ] README.md updated with program details
- [ ] All instructions documented
- [ ] Test coverage documented
- [ ] Known issues/limitations documented

## Step-by-Step Deployment

### Phase 1: Install Required Tools

Follow the complete setup guide in [SOLANA_SETUP.md](SOLANA_SETUP.md).

**Summary:**
1. Install Rust: https://rustup.rs/
2. Install Solana CLI: https://docs.solana.com/cli/install-solana-cli-tools
3. Install Anchor: `cargo install --git https://github.com/coral-xyz/anchor avm --locked --force`
4. Install Anchor version: `avm install latest && avm use latest`

**Verify Installation:**
```powershell
rustc --version
solana --version
anchor --version
```

### Phase 2: Initial Build and Configuration

```powershell
# Navigate to project root
cd c:\websites\VENTURE\easy-escrow-ai-backend

# Build the program for the first time
anchor build

# This will generate a program ID
# Get the program ID
anchor keys list
```

**Output Example:**
```
escrow: Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS
```

### Phase 3: Update Program ID

After first build, update the program ID in two places:

**1. Update `programs/escrow/src/lib.rs`:**
```rust
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");
```

**2. Update `Anchor.toml`:**
```toml
[programs.devnet]
escrow = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"

[programs.localnet]
escrow = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
```

**Rebuild after updating:**
```powershell
anchor build
```

### Phase 4: Run Tests

```powershell
# Run all tests
anchor test

# Run with detailed logs
anchor test -- --show-logs

# If tests fail, fix issues and re-run
```

**Expected Output:**
- All tests passing ✓
- No compilation errors
- Program behaves as expected

### Phase 5: Deploy to Devnet

**Configure Solana for Devnet:**
```powershell
# Set cluster to devnet
solana config set --url devnet

# Create or use existing wallet
solana-keygen new --outfile ~/.config/solana/id.json
# OR use existing: solana config set --keypair <path-to-keypair>

# Check your address
solana address

# Airdrop devnet SOL (repeat as needed)
solana airdrop 2
solana airdrop 2

# Verify balance (need ~5 SOL)
solana balance
```

**Deploy the Program:**
```powershell
# Deploy to devnet
anchor deploy

# This will take a few minutes
# Watch for successful deployment message
```

**Expected Output:**
```
Deploying workspace: https://api.devnet.solana.com
Upgrade authority: <YOUR_ADDRESS>
Deploying program "escrow"...
Program path: target/deploy/escrow.so
Program Id: Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS

Deploy success
```

### Phase 6: Verify Deployment

```powershell
# Check program exists on devnet
solana program show Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS

# Check program account
solana account Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS

# Test with actual transaction (optional)
# Use Solana Explorer: https://explorer.solana.com/?cluster=devnet
# Enter program ID to view transactions
```

### Phase 7: Integration Testing on Devnet

After successful deployment, test all program instructions:

1. **Test init_agreement**
   - Create test escrow with realistic parameters
   - Verify PDA creation
   - Check account state

2. **Test deposit_usdc**
   - Use devnet USDC or test token
   - Verify transfer to escrow PDA
   - Check deposit flag

3. **Test deposit_nft**
   - Mint test NFT on devnet
   - Transfer to escrow
   - Verify ownership

4. **Test settle**
   - Complete full escrow flow
   - Verify asset exchange
   - Check final balances

5. **Test cancellation**
   - Test expiration cancellation
   - Test admin cancellation
   - Verify asset returns

### Phase 8: Mainnet Deployment (Production)

**⚠️ WARNING: Only deploy to mainnet after thorough testing and security audit!**

**Mainnet Requirements:**
- [ ] Complete security audit
- [ ] All devnet testing passed
- [ ] Code review completed
- [ ] Bug bounty program considered
- [ ] Upgrade authority plan established
- [ ] Monitoring and alerting setup
- [ ] 10-15 SOL for deployment

**Mainnet Deployment Steps:**

```powershell
# Switch to mainnet
solana config set --url mainnet-beta

# Verify you have sufficient SOL
solana balance

# Deploy (THIS IS PERMANENT!)
anchor deploy

# Verify deployment
solana program show <PROGRAM_ID>
```

## Post-Deployment Tasks

### Monitor Program Activity

```powershell
# Watch program logs
solana logs <PROGRAM_ID>

# View transactions
# Visit: https://explorer.solana.com/address/<PROGRAM_ID>
```

### Update Backend Configuration

Update environment variables:
```env
SOLANA_NETWORK=devnet
ESCROW_PROGRAM_ID=Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS
SOLANA_RPC_URL=https://api.devnet.solana.com
```

### Update Documentation

- [ ] Update README with deployed program ID
- [ ] Document any deployment issues encountered
- [ ] Share devnet program ID with team
- [ ] Create integration examples

## Troubleshooting

### Common Deployment Issues

**Issue: Insufficient SOL for deployment**
```powershell
# Solution: Airdrop more SOL (devnet only)
solana airdrop 2
# Mainnet: Transfer SOL from exchange
```

**Issue: Program already exists**
```
Error: Program already deployed
```
```powershell
# Solution: Use upgrade instead
anchor upgrade <PROGRAM_ID> target/deploy/escrow.so
```

**Issue: Transaction timeout**
```powershell
# Solution: Retry deployment
anchor deploy --provider.cluster devnet
```

**Issue: RPC errors**
```powershell
# Solution: Use different RPC endpoint
solana config set --url https://api.devnet.solana.com
# or try: https://rpc.ankr.com/solana_devnet
```

### Rollback Procedure

If deployment fails or critical bug found:

```powershell
# Close program account (devnet only)
solana program close <PROGRAM_ID>

# Fix issues
# Rebuild
anchor build

# Redeploy
anchor deploy
```

**Mainnet Rollback:**
- Program upgrades are permanent
- Cannot delete deployed programs
- Can only upgrade to newer version
- Ensure upgrade authority is secured

## Cost Breakdown

### Devnet Deployment
- **Cost**: FREE (use airdropped SOL)
- **Time**: 2-5 minutes
- **SOL Required**: ~5 SOL (from airdrops)

### Mainnet Deployment
- **Program Deployment**: ~2-3 SOL
- **Account Rent**: ~2-3 SOL (refundable if closed)
- **Transaction Fees**: ~0.01 SOL
- **Total**: ~5-7 SOL
- **Time**: 5-10 minutes

## Security Considerations

### Pre-Deployment Security Checklist

- [ ] All PDAs use proper seeds
- [ ] Authority checks on all sensitive operations
- [ ] No integer overflow/underflow vulnerabilities
- [ ] Proper CPI invocation security
- [ ] Signer verification on all instructions
- [ ] Account validation checks
- [ ] Re-entrancy protection (if applicable)
- [ ] Time-based logic reviewed
- [ ] Error handling comprehensive
- [ ] No hardcoded addresses (except program ID)

### Post-Deployment Security

- [ ] Monitor for unusual transactions
- [ ] Set up alerts for high-value transfers
- [ ] Document upgrade procedure
- [ ] Establish emergency response plan
- [ ] Consider multisig for upgrade authority
- [ ] Regular security audits scheduled

## Upgrade Strategy

### When to Upgrade

- Security vulnerabilities discovered
- Feature additions required
- Bug fixes needed
- Performance improvements

### How to Upgrade

```powershell
# Make changes to code
# Test thoroughly
anchor build

# Upgrade program
anchor upgrade <PROGRAM_ID> target/deploy/escrow.so

# Verify upgrade
solana program show <PROGRAM_ID>
```

### Upgrade Authority

**Best Practices:**
- Use multisig for mainnet
- Document upgrade process
- Test upgrades on devnet first
- Notify users before mainnet upgrades
- Have rollback plan

## Support and Resources

### If Deployment Fails

1. Check error messages carefully
2. Verify all prerequisites met
3. Review troubleshooting section
4. Check Solana status: https://status.solana.com/
5. Ask on Discord: https://discord.gg/anchor

### Useful Commands

```powershell
# Check Solana cluster status
solana cluster-version

# Check validator health
solana validators

# View recent block time
solana block-time

# Check transaction
solana confirm <SIGNATURE>

# View program buffer
solana program dump <PROGRAM_ID> dump.so
```

## Next Steps After Deployment

1. ✅ Verify deployment successful
2. ✅ Test all instructions on devnet
3. ✅ Update backend to use deployed program
4. ✅ Build frontend integration
5. ✅ Create user documentation
6. ✅ Set up monitoring
7. ✅ Plan mainnet deployment
8. ✅ Conduct security audit
9. ✅ Launch on mainnet

## Deployment Log Template

Keep track of deployments:

```
Date: YYYY-MM-DD
Network: Devnet/Mainnet
Program ID: <PROGRAM_ID>
Deployer: <WALLET_ADDRESS>
Version: v0.1.0
Git Commit: <COMMIT_HASH>
Status: Success/Failed
Notes: <ANY_SPECIAL_NOTES>
```

---

**Ready to Deploy?** Make sure all checklist items are completed before proceeding!

