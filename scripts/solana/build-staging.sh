#!/bin/bash
# Build the Solana escrow program for STAGING deployment
# Program ID: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei

set -e

echo "🏗️  Building Solana Program for STAGING..."
echo "Program ID: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei"
echo ""

# Build with staging feature
anchor build --features staging

echo ""
echo "✅ STAGING build completed successfully!"
echo ""
echo "📦 Binary location: target/deploy/escrow.so"
echo "📄 IDL location: target/idl/escrow.json"
echo ""
echo "ℹ️  This binary is for STAGING/DEVNET only!"
echo "   Program ID: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei"

