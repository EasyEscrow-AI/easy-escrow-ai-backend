# Prepare staging-app.yaml for Deployment
# Replaces placeholder values with real values from .env.staging

param(
    [string]$EnvFile = ".env.staging",
    [string]$TemplateFile = "staging-app.yaml",
    [string]$OutputFile = "staging-app-deploy.yaml",
    [switch]$DryRun = $false
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Prepare STAGING App YAML for Deployment" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check if .env.staging exists
if (-not (Test-Path $EnvFile)) {
    Write-Host "[ERROR] Environment file not found: $EnvFile" -ForegroundColor Red
    Write-Host "   Run: npm run staging:setup-env" -ForegroundColor Yellow
    exit 1
}

# Check if template exists
if (-not (Test-Path $TemplateFile)) {
    Write-Host "[ERROR] Template file not found: $TemplateFile" -ForegroundColor Red
    exit 1
}

Write-Host "[INFO] Reading environment variables from: $EnvFile" -ForegroundColor Yellow

# Parse .env.staging file
$envVars = @{}
Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()
    # Skip comments and empty lines
    if ($line -and -not $line.StartsWith('#')) {
        $parts = $line -split '=', 2
        if ($parts.Length -eq 2) {
            $key = $parts[0].Trim()
            $value = $parts[1].Trim()
            # Remove quotes if present
            $value = $value.Trim('"').Trim("'")
            $envVars[$key] = $value
        }
    }
}

Write-Host "[SUCCESS] Loaded $($envVars.Count) environment variables" -ForegroundColor Green
Write-Host ""

# Read template file
Write-Host "[INFO] Reading template: $TemplateFile" -ForegroundColor Yellow
$templateContent = Get-Content $TemplateFile -Raw

# Define replacements mapping
$replacements = @{
    'YOUR_HELIUS_API_KEY' = $envVars['HELIUS_API_KEY']
    'YOUR_STAGING_SENDER_PRIVATE_KEY' = $envVars['DEVNET_STAGING_SENDER_PRIVATE_KEY']
    'YOUR_STAGING_RECEIVER_PRIVATE_KEY' = $envVars['DEVNET_STAGING_RECEIVER_PRIVATE_KEY']
    'YOUR_STAGING_ADMIN_PRIVATE_KEY' = $envVars['DEVNET_STAGING_ADMIN_PRIVATE_KEY']
    'YOUR_STAGING_FEE_COLLECTOR_PRIVATE_KEY' = $envVars['DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY']
    'YOUR_JWT_SECRET' = $envVars['JWT_SECRET']
    'YOUR_WEBHOOK_SECRET' = $envVars['WEBHOOK_SECRET']
    'YOUR_MAILTRAP_USER' = $envVars['SMTP_USER']
    'YOUR_MAILTRAP_PASS' = $envVars['SMTP_PASS']
    'YOUR_SPACES_KEY' = $envVars['DO_SPACES_KEY']
    'YOUR_SPACES_SECRET' = $envVars['DO_SPACES_SECRET']
    'YOUR_DO_API_KEY' = $envVars['DIGITAL_OCEAN_API_KEY']
}

# Special handling for DATABASE_URL and REDIS_URL (contain passwords)
# Extract from full URLs
if ($envVars['DATABASE_URL']) {
    $replacements['postgresql://staging_user:PASSWORD@host.db.ondigitalocean.com:25060/easyescrow_staging?sslmode=require'] = $envVars['DATABASE_URL']
}

if ($envVars['DATABASE_POOL_URL']) {
    $replacements['postgresql://staging_user:PASSWORD@host-pooler.db.ondigitalocean.com:25061/easyescrow_staging?sslmode=require'] = $envVars['DATABASE_POOL_URL']
}

if ($envVars['REDIS_URL']) {
    $replacements['redis://default:PASSWORD@redis-xxxxx.cloud.redislabs.com:xxxxx'] = $envVars['REDIS_URL']
}

# Special handling for SOLANA_RPC_URL (contains API key)
if ($envVars['SOLANA_RPC_URL']) {
    $replacements['https://devnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY'] = $envVars['SOLANA_RPC_URL']
}

Write-Host "[INFO] Replacing placeholder values..." -ForegroundColor Yellow
Write-Host ""

$replacedCount = 0
$missingValues = @()

foreach ($placeholder in $replacements.Keys) {
    $realValue = $replacements[$placeholder]
    
    if ($templateContent -match [regex]::Escape($placeholder)) {
        if ($realValue) {
            $templateContent = $templateContent -replace [regex]::Escape($placeholder), $realValue
            $replacedCount++
            
            # Show abbreviated value for security
            $displayValue = if ($realValue.Length -gt 20) { 
                "$($realValue.Substring(0, 10))...$($realValue.Substring($realValue.Length - 10))" 
            } else { 
                "***" 
            }
            
            Write-Host "  [OK] Replaced: $placeholder" -ForegroundColor Green
            if ($DryRun) {
                Write-Host "     Value: $displayValue" -ForegroundColor Gray
            }
        } else {
            Write-Host "  [WARN] Missing value for: $placeholder" -ForegroundColor Yellow
            $missingValues += $placeholder
        }
    }
}

Write-Host ""
Write-Host "[INFO] Replacement Summary:" -ForegroundColor Yellow
Write-Host "  Replaced: $replacedCount" -ForegroundColor Green
Write-Host "  Missing:  $($missingValues.Count)" -ForegroundColor $(if ($missingValues.Count -gt 0) { "Yellow" } else { "Green" })
Write-Host ""

if ($missingValues.Count -gt 0) {
    Write-Host "[WARN] Missing values for:" -ForegroundColor Yellow
    foreach ($missing in $missingValues) {
        Write-Host "  - $missing" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "Update your .env.staging file with these values and try again." -ForegroundColor Yellow
    Write-Host ""
}

# Check for remaining placeholders
$remainingPlaceholders = [regex]::Matches($templateContent, 'YOUR_[A-Z_]+')
if ($remainingPlaceholders.Count -gt 0) {
    Write-Host "[WARN] Found $($remainingPlaceholders.Count) remaining placeholders:" -ForegroundColor Yellow
    $remainingPlaceholders | Select-Object -Unique | ForEach-Object {
        Write-Host "  - $($_.Value)" -ForegroundColor Yellow
    }
    Write-Host ""
}

if ($DryRun) {
    Write-Host "[DRY RUN] No file will be written" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Would write to: $OutputFile" -ForegroundColor Cyan
    Write-Host ""
    exit 0
}

# Write output file
Write-Host "[INFO] Writing deployment-ready app spec..." -ForegroundColor Yellow
Set-Content -Path $OutputFile -Value $templateContent
Write-Host "[SUCCESS] Created: $OutputFile" -ForegroundColor Green
Write-Host ""

# Validate with doctl
Write-Host "[INFO] Validating app spec with doctl..." -ForegroundColor Yellow
try {
    $validation = doctl apps spec validate $OutputFile 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[SUCCESS] App spec is valid!" -ForegroundColor Green
    } else {
        Write-Host "[WARN] Validation warnings/errors:" -ForegroundColor Yellow
        Write-Host $validation
    }
} catch {
    Write-Host "[WARN] Could not validate (doctl might not be installed or authenticated)" -ForegroundColor Yellow
}
Write-Host ""

# Summary
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "[SUCCESS] Deployment YAML Ready!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Output File: $OutputFile" -ForegroundColor Cyan
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Review the generated file: cat $OutputFile" -ForegroundColor White
Write-Host "  2. Create the app: doctl apps create --spec $OutputFile" -ForegroundColor White
Write-Host "  3. Monitor deployment: doctl apps list-deployments <app-id>" -ForegroundColor White
Write-Host "  4. Verify deployment: npm run staging:verify" -ForegroundColor White
Write-Host ""

Write-Host "[SECURITY] Important Notes:" -ForegroundColor Yellow
Write-Host "  - The file $OutputFile contains sensitive secrets." -ForegroundColor White
Write-Host "  - Do NOT commit it to git. It is in .gitignore." -ForegroundColor White
Write-Host "  - Delete it after deployment if you wish." -ForegroundColor White
Write-Host ""
