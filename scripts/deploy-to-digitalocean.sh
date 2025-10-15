#!/bin/bash
# Quick Deployment Wrapper - Bash version
# Delegates to PowerShell script via pwsh

set -e

ENVIRONMENT="dev"
NO_DEVNET_SECRETS=""
DRY_RUN=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --production)
            ENVIRONMENT="production"
            shift
            ;;
        --staging)
            ENVIRONMENT="staging"
            shift
            ;;
        --no-devnet-secrets)
            NO_DEVNET_SECRETS="-NoDevnetSecrets"
            shift
            ;;
        --dry-run)
            DRY_RUN="-DryRun"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--production|--staging] [--no-devnet-secrets] [--dry-run]"
            exit 1
            ;;
    esac
done

echo "============================================"
echo "Easy Escrow - DigitalOcean Deployment"
echo "============================================"
echo ""
echo "Environment: $ENVIRONMENT"
echo ""

# Check if PowerShell is available
if ! command -v pwsh &> /dev/null; then
    echo "❌ PowerShell (pwsh) is required but not installed"
    echo ""
    echo "Install PowerShell:"
    echo "  Ubuntu/Debian: sudo apt-get install -y powershell"
    echo "  macOS: brew install --cask powershell"
    echo "  Other: https://docs.microsoft.com/en-us/powershell/scripting/install/installing-powershell"
    exit 1
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Call PowerShell deployment script
pwsh "$SCRIPT_DIR/deploy-to-digitalocean.ps1" \
    -Environment "$ENVIRONMENT" \
    $NO_DEVNET_SECRETS \
    $DRY_RUN

