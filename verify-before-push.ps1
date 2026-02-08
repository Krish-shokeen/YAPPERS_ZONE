# PowerShell verification script to run before pushing to GitHub
# This checks for common security issues

Write-Host "Verifying repository before push..." -ForegroundColor Cyan
Write-Host ""

$ERRORS = 0

# Check 1: Verify .env files are not staged
Write-Host "Checking for .env files..." -ForegroundColor Yellow
$envFiles = git ls-files --cached | Select-String "\.env$"
if ($envFiles) {
    Write-Host "ERROR: .env files found in git!" -ForegroundColor Red
    $envFiles
    $ERRORS++
} else {
    Write-Host "OK: No .env files in git" -ForegroundColor Green
}
Write-Host ""

# Check 2: Verify service account keys are not staged
Write-Host "Checking for service account keys..." -ForegroundColor Yellow
$keyFiles = git ls-files --cached | Select-String -Pattern "serviceAccountKey|accountkey"
if ($keyFiles) {
    Write-Host "ERROR: Service account key files found in git!" -ForegroundColor Red
    $keyFiles
    $ERRORS++
} else {
    Write-Host "OK: No service account keys in git" -ForegroundColor Green
}
Write-Host ""

# Check 3: Verify .env.example exists
Write-Host "Checking for .env.example files..." -ForegroundColor Yellow
if ((Test-Path "main/backend/.env.example") -and (Test-Path "main/frontend/.env.example")) {
    Write-Host "OK: .env.example files exist" -ForegroundColor Green
} else {
    Write-Host "WARNING: .env.example files missing" -ForegroundColor Yellow
}
Write-Host ""

# Check 4: Check for potential secrets in staged files
Write-Host "Scanning staged files for potential secrets..." -ForegroundColor Yellow
$diffOutput = git diff --cached
if ($diffOutput -match "password.*=|secret.*=|mongodb\+srv://.*:.*@") {
    Write-Host "WARNING: Potential secrets found in staged changes!" -ForegroundColor Red
    Write-Host "Please review your changes carefully." -ForegroundColor Yellow
    $ERRORS++
} else {
    Write-Host "OK: No obvious secrets in staged files" -ForegroundColor Green
}
Write-Host ""

# Check 5: Verify .gitignore exists
Write-Host "Checking .gitignore files..." -ForegroundColor Yellow
if ((Test-Path ".gitignore") -and (Test-Path "main/backend/.gitignore") -and (Test-Path "main/frontend/.gitignore")) {
    Write-Host "OK: All .gitignore files present" -ForegroundColor Green
} else {
    Write-Host "ERROR: Missing .gitignore files!" -ForegroundColor Red
    $ERRORS++
}
Write-Host ""

# Summary
Write-Host "================================" -ForegroundColor Cyan
if ($ERRORS -eq 0) {
    Write-Host "All checks passed! Safe to push." -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  git add ."
    Write-Host "  git commit -m 'Your commit message'"
    Write-Host "  git push origin main"
    exit 0
} else {
    Write-Host "Found $ERRORS issue(s). Please fix before pushing!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Common fixes:" -ForegroundColor Yellow
    Write-Host "  - Remove .env files: git rm --cached main/backend/.env"
    Write-Host "  - Remove keys: git rm --cached main/backend/serviceAccountKey.json"
    Write-Host "  - Review changes: git diff --cached"
    exit 1
}
