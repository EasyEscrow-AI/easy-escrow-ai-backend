#!/bin/bash
# Build the Solana escrow program for MAINNET deployment
# Program ID: 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx

set -e

echo "🏗️  Building Solana Program for MAINNET..."
echo "Program ID: 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx"
echo ""

# Build with mainnet feature
anchor build --features mainnet

echo ""
echo "✅ MAINNET build completed successfully!"
echo ""
echo "📦 Binary location: target/deploy/escrow.so"
echo "📄 IDL location: target/idl/escrow.json"
echo ""
echo "⚠️  IMPORTANT: This binary is for MAINNET only!"
echo "   Program ID: 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx"
