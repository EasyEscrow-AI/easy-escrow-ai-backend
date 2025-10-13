# EasyEscrow.ai Backend

Backend service for EasyEscrow.ai - an AI-powered escrow platform with Solana blockchain integration.

## Overview

This repository contains:
- Backend API and services for EasyEscrow.ai
- Solana smart contract (Anchor program) for secure NFT and USDC escrow transactions
- Integration layer between backend services and Solana blockchain

## Project Structure

```
/
├── README.md
├── SOLANA_SETUP.md           # Solana development environment setup guide
├── .gitignore
├── src/                       # Backend TypeScript/Node.js source
│   ├── config/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   └── utils/
├── programs/                  # Solana programs
│   └── escrow/               # Escrow smart contract
│       ├── src/
│       │   └── lib.rs        # Main program logic
│       ├── Cargo.toml
│       └── README.md         # Program documentation
├── tests/                     # Anchor tests
│   └── escrow.ts             # Test suite
├── Anchor.toml               # Anchor configuration
├── Cargo.toml                # Rust workspace config
└── package.json              # Node.js dependencies
```

## Quick Start

### Backend Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build
npm run build

# Type check
npm run type-check
```

### Solana Program Development

**Prerequisites:**
- Rust
- Solana CLI
- Anchor Framework

See [SOLANA_SETUP.md](SOLANA_SETUP.md) for detailed installation instructions.

```bash
# Build the Solana program
anchor build

# Run tests
anchor test

# Deploy to devnet
anchor deploy
```

## Solana Escrow Program

The escrow program facilitates trustless transactions between buyers and sellers:

### Features
- **NFT & USDC Escrow**: Secure holding of NFTs and USDC during transactions
- **Automated Settlement**: Exchange assets when both parties fulfill obligations
- **Time-based Expiry**: Automatic cancellation after deadline
- **Admin Controls**: Emergency cancellation capability
- **PDA Security**: Program Derived Addresses ensure secure asset custody

### Instructions
- `init_agreement` - Create a new escrow
- `deposit_usdc` - Buyer deposits USDC
- `deposit_nft` - Seller deposits NFT
- `settle` - Complete the exchange
- `cancel_if_expired` - Cancel expired escrow
- `admin_cancel` - Emergency cancellation

For detailed program documentation, see [programs/escrow/README.md](programs/escrow/README.md).

## Development Workflow

### Setting Up Solana Environment (First Time)

1. Follow the complete setup guide in [SOLANA_SETUP.md](SOLANA_SETUP.md)
2. Install Rust, Solana CLI, and Anchor Framework
3. Configure for devnet and get test SOL
4. Build and test the program

### Making Changes to the Smart Contract

1. Edit `programs/escrow/src/lib.rs`
2. Run `anchor build` to compile
3. Run `anchor test` to verify functionality
4. Deploy with `anchor deploy` when ready

### Backend Integration

The backend will integrate with the deployed Solana program via:
- Anchor TypeScript client
- Web3.js for transaction signing
- WebSocket subscriptions for real-time updates

## Testing

### Backend Tests
```bash
npm test
```

### Solana Program Tests
```bash
anchor test
anchor test -- --show-logs  # With detailed logs
```

## Deployment

### Solana Program Deployment

**Devnet (Testing):**
```bash
solana config set --url devnet
solana airdrop 2
anchor deploy
```

**Mainnet (Production):**
```bash
solana config set --url mainnet-beta
anchor deploy  # Requires SOL for deployment
```

### Backend Deployment

Coming soon...

## Environment Variables

```env
# Backend
PORT=3000
NODE_ENV=development

# Solana
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
ESCROW_PROGRAM_ID=Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS
```

## Current Status

- ✅ Solana escrow program implemented
- ✅ Program structure and tests created
- ✅ Documentation completed
- ⏳ Environment setup required for deployment
- ⏳ Backend API integration pending
- ⏳ Frontend integration pending

## Next Steps

1. Install Solana development tools (see SOLANA_SETUP.md)
2. Build and test the escrow program
3. Deploy to Solana devnet
4. Integrate backend with deployed program
5. Build frontend interface
6. Test end-to-end flow
7. Security audit before mainnet

## Resources

- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Documentation](https://docs.solana.com/)
- [Solana Cookbook](https://solanacookbook.com/)
- [SPL Token Guide](https://spl.solana.com/token)

## Support

For issues or questions:
- Check existing documentation
- Review Anchor/Solana resources
- Open an issue in this repository

## License

All rights reserved.

