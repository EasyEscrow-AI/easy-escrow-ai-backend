#!/bin/bash
# Setup Git Hooks for Secret Scanning
# This script installs the pre-commit hook for automatic secret scanning

set -e

HOOK_DIR=".git/hooks"
HOOK_FILE="$HOOK_DIR/pre-commit"
SCRIPT_PATH="scripts/pre-commit-secrets-check.sh"

echo "🔧 Setting up Git hooks for secret scanning..."

# Check if .git directory exists
if [ ! -d ".git" ]; then
    echo "❌ Error: .git directory not found"
    echo "Please run this script from the repository root"
    exit 1
fi

# Create hooks directory if it doesn't exist
mkdir -p "$HOOK_DIR"

# Check if pre-commit hook already exists
if [ -f "$HOOK_FILE" ]; then
    echo "⚠️  Pre-commit hook already exists"
    echo "Backing up existing hook to pre-commit.backup"
    mv "$HOOK_FILE" "$HOOK_FILE.backup"
fi

# Create the pre-commit hook
cat > "$HOOK_FILE" << 'EOF'
#!/bin/bash
# Git pre-commit hook - automatically installed
# Scans for secrets before allowing commits

# Run the secrets check script
bash scripts/pre-commit-secrets-check.sh

# Exit with the script's exit code
exit $?
EOF

# Make the hook executable
chmod +x "$HOOK_FILE"
chmod +x "$SCRIPT_PATH"

echo "✅ Git hooks installed successfully!"
echo ""
echo "📋 What happens now:"
echo "  • Every commit will be scanned for potential secrets"
echo "  • Commits with secrets will be blocked automatically"
echo "  • You can bypass with --no-verify (not recommended)"
echo ""
echo "🔒 Your commits are now protected from accidental secret exposure!"

