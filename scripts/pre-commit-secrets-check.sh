#!/bin/bash
# Pre-commit hook to scan for secrets in commits
# This script prevents accidental commits of private keys, passwords, and other sensitive data

set -e

PATTERNS_FILE=".git-secrets-patterns"
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo "🔍 Scanning commit for potential secrets..."

# Check if patterns file exists
if [ ! -f "$PATTERNS_FILE" ]; then
    echo -e "${RED}❌ Error: Secrets patterns file not found: $PATTERNS_FILE${NC}"
    echo "Please ensure .git-secrets-patterns exists in the repository root"
    exit 1
fi

# Get list of staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$STAGED_FILES" ]; then
    echo -e "${GREEN}✓ No files to check${NC}"
    exit 0
fi

# Flag to track if secrets were found
SECRETS_FOUND=0

# Check each staged file
while IFS= read -r file; do
    # Skip binary files and specific directories
    if [[ "$file" == *"node_modules/"* ]] || \
       [[ "$file" == *"dist/"* ]] || \
       [[ "$file" == *"build/"* ]] || \
       [[ "$file" == *".git/"* ]] || \
       [[ "$file" == *"target/"* ]]; then
        continue
    fi

    # Skip if file doesn't exist (deleted files)
    if [ ! -f "$file" ]; then
        continue
    fi

    # Check each pattern
    while IFS= read -r pattern; do
        # Skip empty lines and comments
        if [ -z "$pattern" ] || [[ "$pattern" == \#* ]]; then
            continue
        fi

        # Search for pattern in file
        if grep -qE "$pattern" "$file" 2>/dev/null; then
            echo -e "${RED}❌ Potential secret found in: ${file}${NC}"
            echo -e "${YELLOW}   Pattern matched: ${pattern}${NC}"
            SECRETS_FOUND=1
        fi
    done < "$PATTERNS_FILE"
done <<< "$STAGED_FILES"

# Check for common secret file names in commit
DANGEROUS_FILES=$(echo "$STAGED_FILES" | grep -E "\.(key|pem|p12|pfx)$|id_rsa|\.env|keypair.*\.json|.*-keypair\.json|devnet-config\.json" || true)

if [ ! -z "$DANGEROUS_FILES" ]; then
    echo -e "${RED}❌ Dangerous file types detected:${NC}"
    echo "$DANGEROUS_FILES" | while read -r file; do
        echo -e "${YELLOW}   - ${file}${NC}"
    done
    SECRETS_FOUND=1
fi

# Exit based on findings
if [ $SECRETS_FOUND -eq 1 ]; then
    echo ""
    echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ❌ COMMIT BLOCKED: Potential secrets detected                ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}Security guidelines:${NC}"
    echo "  1. Remove all secrets from the files"
    echo "  2. Store secrets in environment variables or secret management systems"
    echo "  3. Update .gitignore to prevent future commits"
    echo "  4. If this is a false positive, you can bypass with: git commit --no-verify"
    echo ""
    echo -e "${YELLOW}⚠️  WARNING: Only bypass if you are ABSOLUTELY CERTAIN no secrets are present${NC}"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ No secrets detected - commit allowed${NC}"
exit 0

