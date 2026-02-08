#!/bin/bash

# Verification script to run before pushing to GitHub
# This checks for common security issues

echo "🔍 Verifying repository before push..."
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0

# Check 1: Verify .env files are not staged
echo "📋 Checking for .env files..."
if git ls-files --cached | grep -q "\.env$"; then
    echo -e "${RED}❌ ERROR: .env files found in git!${NC}"
    git ls-files --cached | grep "\.env$"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✅ No .env files in git${NC}"
fi
echo ""

# Check 2: Verify service account keys are not staged
echo "📋 Checking for service account keys..."
if git ls-files --cached | grep -q "serviceAccountKey\|accountkey"; then
    echo -e "${RED}❌ ERROR: Service account key files found in git!${NC}"
    git ls-files --cached | grep "serviceAccountKey\|accountkey"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✅ No service account keys in git${NC}"
fi
echo ""

# Check 3: Verify .env.example exists
echo "📋 Checking for .env.example files..."
if [ -f "main/backend/.env.example" ] && [ -f "main/frontend/.env.example" ]; then
    echo -e "${GREEN}✅ .env.example files exist${NC}"
else
    echo -e "${YELLOW}⚠️  WARNING: .env.example files missing${NC}"
fi
echo ""

# Check 4: Check for potential secrets in staged files
echo "📋 Scanning staged files for potential secrets..."
if git diff --cached | grep -iE "password.*=|secret.*=|mongodb\+srv://.*:.*@" > /dev/null; then
    echo -e "${RED}❌ WARNING: Potential secrets found in staged changes!${NC}"
    echo "Please review your changes carefully."
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✅ No obvious secrets in staged files${NC}"
fi
echo ""

# Check 5: Verify .gitignore exists
echo "📋 Checking .gitignore files..."
if [ -f ".gitignore" ] && [ -f "main/backend/.gitignore" ] && [ -f "main/frontend/.gitignore" ]; then
    echo -e "${GREEN}✅ All .gitignore files present${NC}"
else
    echo -e "${RED}❌ ERROR: Missing .gitignore files!${NC}"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# Summary
echo "================================"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Safe to push.${NC}"
    echo ""
    echo "Next steps:"
    echo "  git add ."
    echo "  git commit -m 'Your commit message'"
    echo "  git push origin main"
    exit 0
else
    echo -e "${RED}❌ Found $ERRORS issue(s). Please fix before pushing!${NC}"
    echo ""
    echo "Common fixes:"
    echo "  - Remove .env files: git rm --cached main/backend/.env"
    echo "  - Remove keys: git rm --cached main/backend/serviceAccountKey.json"
    echo "  - Review changes: git diff --cached"
    exit 1
fi
