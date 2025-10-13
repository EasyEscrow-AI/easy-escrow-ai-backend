# EasyEscrow Solana Program

A Solana program for secure escrow transactions between NFT sellers and USDC buyers.

## Features

- **Init Agreement**: Create a new escrow agreement with terms
- **Deposit USDC**: Buyer deposits USDC into escrow
- **Deposit NFT**: Seller deposits NFT into escrow
- **Settle**: Complete the transaction (USDC to seller, NFT to buyer)
- **Cancel If Expired**: Return assets if escrow expires
- **Admin Cancel**: Emergency cancellation by admin

## Program Structure

### EscrowState Account

```rust
pub struct EscrowState {
    pub escrow_id: u64,           // Unique identifier
    pub buyer: Pubkey,            // Buyer's public key
    pub seller: Pubkey,           // Seller's public key
    pub usdc_amount: u64,         // Amount of USDC in escrow
    pub nft_mint: Pubkey,         // NFT mint address
    pub nft_token_account: Pubkey, // NFT token account
    pub status: EscrowStatus,     // Current status
    pub expiry_timestamp: i64,    // Expiry timestamp
    pub bump: u8,                 // PDA bump seed
}
```

### EscrowStatus Enum

```rust
pub enum EscrowStatus {
    Pending,    // Waiting for deposits
    Completed,  // Successfully settled
    Cancelled,  // Cancelled or expired
}
```

## Instructions

### 1. init_agreement

Creates a new escrow agreement.

**Accounts:**
- `escrow` (PDA) - The escrow account
- `buyer` (signer) - The buyer
- `seller` - The seller
- `nft_token_account` - NFT token account
- `system_program` - System program

**Args:**
- `escrow_id: u64` - Unique escrow identifier
- `usdc_amount: u64` - Amount of USDC
- `nft_mint: Pubkey` - NFT mint address
- `expiry_timestamp: i64` - Expiry timestamp

### 2. deposit_usdc

Deposits USDC into the escrow.

**Accounts:**
- `escrow` (PDA) - The escrow account
- `buyer` (signer) - The buyer
- `buyer_usdc_account` - Buyer's USDC account
- `escrow_usdc_account` - Escrow's USDC account
- `usdc_mint` - USDC mint
- `token_program` - Token program

### 3. deposit_nft

Deposits NFT into the escrow.

**Accounts:**
- `escrow` (PDA) - The escrow account
- `seller` (signer) - The seller
- `seller_nft_account` - Seller's NFT account
- `escrow_nft_account` - Escrow's NFT account
- `nft_mint` - NFT mint
- `token_program` - Token program

### 4. settle

Settles the escrow (transfers USDC to seller, NFT to buyer).

**Accounts:**
- `escrow` (PDA) - The escrow account
- `escrow_usdc_account` - Escrow's USDC account
- `seller_usdc_account` - Seller's USDC account
- `escrow_nft_account` - Escrow's NFT account
- `buyer_nft_account` - Buyer's NFT account
- `token_program` - Token program

### 5. cancel_if_expired

Cancels the escrow if it has expired.

**Accounts:**
- `escrow` (PDA) - The escrow account
- `escrow_usdc_account` - Escrow's USDC account
- `buyer_usdc_account` - Buyer's USDC account
- `escrow_nft_account` - Escrow's NFT account
- `seller_nft_account` - Seller's NFT account
- `token_program` - Token program

### 6. admin_cancel

Admin emergency cancellation.

**Accounts:**
- `escrow` (PDA) - The escrow account
- `escrow_usdc_account` - Escrow's USDC account
- `buyer_usdc_account` - Buyer's USDC account
- `escrow_nft_account` - Escrow's NFT account
- `seller_nft_account` - Seller's NFT account
- `admin` (signer) - Admin authority
- `token_program` - Token program

## Error Codes

- `InvalidAmount` (6000): Invalid amount
- `InvalidExpiry` (6001): Invalid expiry timestamp
- `InvalidStatus` (6002): Invalid status
- `Unauthorized` (6003): Unauthorized
- `InvalidNftMint` (6004): Invalid NFT mint
- `UsdcNotDeposited` (6005): USDC not deposited
- `NotExpired` (6006): Not expired

## Building and Deploying

```bash
# Build the program
npm run build:program

# Test the program
npm run test:program

# Deploy to devnet
npm run deploy:program
```

## Security Considerations

- All transfers are atomic
- Proper authorization checks
- Expiry validation
- PDA-based account structure
- Comprehensive error handling