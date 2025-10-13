# Solana Escrow Program

A secure escrow smart contract for facilitating NFT and USDC transactions on the Solana blockchain using Anchor framework.

## Overview

This program enables trustless escrow transactions where:
- A buyer deposits USDC
- A seller deposits an NFT
- Upon both deposits, either party can settle the escrow to exchange assets
- Built-in expiration mechanism for automatic cancellation
- Admin emergency cancellation capability

## Features

### Core Instructions

1. **init_agreement** - Initialize a new escrow agreement
   - Creates a PDA account with escrow terms
   - Sets buyer, seller, USDC amount, NFT mint, and expiry timestamp
   - Assigns an admin for emergency controls

2. **deposit_usdc** - Buyer deposits USDC into escrow
   - Transfers specified USDC amount from buyer to escrow PDA
   - Validates that escrow is in pending status
   - Updates deposit status flag

3. **deposit_nft** - Seller deposits NFT into escrow
   - Transfers NFT from seller to escrow PDA
   - Validates NFT mint matches agreement
   - Updates deposit status flag

4. **settle** - Complete the escrow transaction
   - Transfers USDC from escrow to seller
   - Transfers NFT from escrow to buyer
   - Requires both deposits to be complete
   - Must be called before expiry timestamp
   - Updates status to completed

5. **cancel_if_expired** - Cancel expired escrow
   - Returns deposited assets to original owners
   - Can only be called after expiry timestamp
   - Updates status to cancelled

6. **admin_cancel** - Emergency cancellation by admin
   - Returns deposited assets to original owners
   - Can be called at any time by designated admin
   - Updates status to cancelled

## Account Structure

### EscrowState PDA
```rust
pub struct EscrowState {
    pub escrow_id: u64,              // Unique escrow identifier
    pub buyer: Pubkey,                // Buyer's public key
    pub seller: Pubkey,               // Seller's public key
    pub usdc_amount: u64,             // Amount of USDC in escrow
    pub nft_mint: Pubkey,             // NFT mint address
    pub buyer_usdc_deposited: bool,   // USDC deposit status
    pub seller_nft_deposited: bool,   // NFT deposit status
    pub status: EscrowStatus,         // Current escrow status
    pub expiry_timestamp: i64,        // Expiration unix timestamp
    pub bump: u8,                     // PDA bump seed
    pub admin: Pubkey,                // Admin public key
}
```

### Escrow Status
- **Pending** - Awaiting deposits or settlement
- **Completed** - Successfully settled
- **Cancelled** - Cancelled (expired or admin)

## Installation & Setup

### Prerequisites

1. **Install Rust**
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source $HOME/.cargo/env
   rustup component add rustfmt
   ```

2. **Install Solana CLI**
   ```bash
   sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
   export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
   ```

3. **Install Anchor**
   ```bash
   cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
   avm install latest
   avm use latest
   ```

4. **Configure Solana for Devnet**
   ```bash
   solana config set --url devnet
   solana-keygen new  # Create a new wallet if needed
   solana airdrop 2   # Get devnet SOL
   ```

### Windows-Specific Installation

For Windows users:

1. Install Rust from: https://rustup.rs/
2. Install Solana from: https://docs.solana.com/cli/install-solana-cli-tools
3. Install Anchor following: https://www.anchor-lang.com/docs/installation

## Building & Testing

### Build the Program
```bash
anchor build
```

### Run Tests
```bash
anchor test
```

### Get Program ID
```bash
anchor keys list
```

Update the program ID in:
- `Anchor.toml` under `[programs.devnet]`
- `lib.rs` in the `declare_id!()` macro

## Deployment

### Deploy to Devnet
```bash
# Ensure you're on devnet
solana config set --url devnet

# Get some devnet SOL
solana airdrop 2

# Deploy the program
anchor deploy

# Verify deployment
solana program show <PROGRAM_ID>
```

### Deploy to Mainnet
```bash
# Switch to mainnet
solana config set --url mainnet-beta

# Deploy (ensure you have enough SOL for deployment fees)
anchor deploy

# Verify deployment
solana program show <PROGRAM_ID>
```

## Usage Example

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Escrow } from "./target/types/escrow";

// Initialize provider and program
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.Escrow as Program<Escrow>;

// Generate escrow ID and derive PDA
const escrowId = new anchor.BN(Date.now());
const [escrowState] = PublicKey.findProgramAddressSync(
  [Buffer.from("escrow"), escrowId.toArrayLike(Buffer, "le", 8)],
  program.programId
);

// Initialize escrow
await program.methods
  .initAgreement(
    escrowId,
    new anchor.BN(100_000_000), // 100 USDC (6 decimals)
    new anchor.BN(Math.floor(Date.now() / 1000) + 3600) // 1 hour expiry
  )
  .accounts({
    escrowState,
    buyer: buyer.publicKey,
    seller: seller.publicKey,
    nftMint: nftMint.publicKey,
    admin: admin.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .signers([buyer])
  .rpc();
```

## Security Considerations

1. **PDA Authority** - Escrow PDA has authority over deposited assets
2. **Time-based Expiry** - Automatic cancellation after expiry timestamp
3. **Admin Controls** - Emergency cancellation capability
4. **Validation** - Strict validation of all inputs and state transitions
5. **CPI Security** - Secure cross-program invocations to token program

## Error Codes

- `InvalidAmount` - Amount must be greater than 0
- `InvalidExpiry` - Expiry must be in the future
- `InvalidStatus` - Invalid escrow status for operation
- `AlreadyDeposited` - Assets already deposited
- `Unauthorized` - Unauthorized to perform action
- `InvalidNftMint` - NFT mint doesn't match agreement
- `DepositNotComplete` - Both deposits must be complete
- `Expired` - Escrow has expired
- `NotExpired` - Escrow hasn't expired yet

## Testing on Devnet

After deployment, you can test the program with:

1. Create test USDC and NFT tokens
2. Initialize an escrow agreement
3. Deposit USDC as buyer
4. Deposit NFT as seller
5. Settle the escrow to complete the exchange

## License

MIT

## Support

For issues or questions, please open an issue in the repository.

