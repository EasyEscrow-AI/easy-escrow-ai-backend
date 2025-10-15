# DigitalOcean Deployment Script - Unified Deployment for All Environments
# Supports dev, staging, and production deployments with environment-specific configuration

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("dev", "staging", "production")]
    [string]$Environment,
    
    [Parameter(Mandatory=$false)]
    [string]$AppId = "",
    
    [Parameter(Mandatory=$false)]
    [string]$ApiKey = "",
    
    [switch]$IncludeDevnetSecrets = $false,
    
    [switch]$SkipDevnetSecrets = $false,
    
    [switch]$DryRun = $false,
    
    [switch]$NoRedeploy = $false
)

$ErrorActionPreference = "Stop"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "DigitalOcean Deployment Script" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Environment: $Environment" -ForegroundColor $(if ($Environment -eq "production") { "Red" } else { "Yellow" })
Write-Host ""

# Load API key
if (-not $ApiKey) {
    $ApiKey = $env:DIGITALOCEAN_API_KEY
    if (-not $ApiKey) {
        $ApiKey = $env:DO_API_KEY
    }
}

if (-not $ApiKey) {
    Write-Host "❌ DigitalOcean API key not provided" -ForegroundColor Red
    Write-Host ""
    Write-Host "Set DIGITALOCEAN_API_KEY or DO_API_KEY environment variable" -ForegroundColor Yellow
    Write-Host "Or pass via -ApiKey parameter" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ API Key loaded" -ForegroundColor Green
Write-Host ""

# Determine if we should include devnet secrets
$shouldIncludeDevnetSecrets = $false

if ($Environment -eq "production") {
    if ($IncludeDevnetSecrets) {
        Write-Host "⚠️  WARNING: Devnet secrets requested for PRODUCTION" -ForegroundColor Red
        Write-Host "   This is NOT recommended for security reasons." -ForegroundColor Red
        Write-Host ""
        $confirm = Read-Host "Are you sure? (type 'yes' to confirm)"
        if ($confirm -ne "yes") {
            Write-Host "❌ Deployment cancelled" -ForegroundColor Yellow
            exit 1
        }
        $shouldIncludeDevnetSecrets = $true
    }
} else {
    # For dev/staging, include devnet secrets by default unless explicitly skipped
    if (-not $SkipDevnetSecrets) {
        $shouldIncludeDevnetSecrets = $true
        Write-Host "ℹ️  Devnet test wallets will be configured (use -SkipDevnetSecrets to disable)" -ForegroundColor Cyan
    } else {
        Write-Host "ℹ️  Skipping devnet test wallet configuration" -ForegroundColor Cyan
    }
    Write-Host ""
}

# Get App ID if not provided
if (-not $AppId) {
    Write-Host "Fetching app information from DigitalOcean..." -ForegroundColor Yellow
    
    try {
        $headers = @{
            "Authorization" = "Bearer $ApiKey"
            "Content-Type" = "application/json"
        }
        
        $response = Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/apps" -Method Get -Headers $headers
        
        # Try to find app by environment in name
        $app = $response.apps | Where-Object { 
            $_.spec.name -like "*escrow*" -and $_.spec.name -like "*$Environment*" 
        } | Select-Object -First 1
        
        # Fallback: find any escrow app
        if (-not $app) {
            $app = $response.apps | Where-Object { $_.spec.name -like "*escrow*" } | Select-Object -First 1
        }
        
        if ($app) {
            $AppId = $app.id
            Write-Host "✅ Found app: $($app.spec.name) (ID: $AppId)" -ForegroundColor Green
            Write-Host ""
        } else {
            Write-Host "⚠️  Could not auto-detect app. Available apps:" -ForegroundColor Yellow
            $response.apps | ForEach-Object {
                Write-Host "   - $($_.spec.name) (ID: $($_.id))" -ForegroundColor Gray
            }
            Write-Host ""
            
            $AppId = Read-Host "Enter App ID for $Environment"
            if (-not $AppId) {
                Write-Host "❌ App ID required" -ForegroundColor Red
                exit 1
            }
        }
    } catch {
        Write-Host "❌ Failed to fetch apps: $_" -ForegroundColor Red
        exit 1
    }
}

Write-Host "App ID: $AppId" -ForegroundColor Cyan
Write-Host "Environment: $Environment" -ForegroundColor Cyan
Write-Host ""

# Validate environment-specific requirements
Write-Host "Validating deployment requirements..." -ForegroundColor Yellow

$missingEnvVars = @()

# Check required base environment variables
if (-not $env:DATABASE_URL -and -not $env:DATABASE_URL_PROD) {
    $missingEnvVars += "DATABASE_URL"
}

if (-not $env:REDIS_URL) {
    $missingEnvVars += "REDIS_URL"
}

if ($shouldIncludeDevnetSecrets) {
    # Check devnet wallet keys
    if (-not $env:DEVNET_SENDER_PRIVATE_KEY) { $missingEnvVars += "DEVNET_SENDER_PRIVATE_KEY" }
    if (-not $env:DEVNET_RECEIVER_PRIVATE_KEY) { $missingEnvVars += "DEVNET_RECEIVER_PRIVATE_KEY" }
    if (-not $env:DEVNET_ADMIN_PRIVATE_KEY) { $missingEnvVars += "DEVNET_ADMIN_PRIVATE_KEY" }
    if (-not $env:DEVNET_FEE_COLLECTOR_PRIVATE_KEY) { $missingEnvVars += "DEVNET_FEE_COLLECTOR_PRIVATE_KEY" }
}

if ($missingEnvVars.Count -gt 0) {
    Write-Host "⚠️  Warning: Some environment variables are not set locally:" -ForegroundColor Yellow
    foreach ($var in $missingEnvVars) {
        Write-Host "   - $var" -ForegroundColor Gray
    }
    Write-Host ""
    Write-Host "Note: This is OK if they're already configured in DigitalOcean" -ForegroundColor Cyan
    Write-Host ""
}

# Deploy devnet secrets if requested
if ($shouldIncludeDevnetSecrets) {
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "Configuring Devnet Test Wallets" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""
    
    if ($DryRun) {
        Write-Host "🔍 DRY RUN: Would configure devnet secrets" -ForegroundColor Yellow
    } else {
        Write-Host "Running devnet secrets setup..." -ForegroundColor Yellow
        Write-Host ""
        
        $setupScriptPath = Join-Path $PSScriptRoot "setup-devnet-secrets.ps1"
        
        if (Test-Path $setupScriptPath) {
            try {
                # Build arguments for the setup script
                $setupArgs = @{
                    AppId = $AppId
                    ApiKey = $ApiKey
                    FromEnv = $true
                }
                
                if ($DryRun) {
                    $setupArgs.DryRun = $true
                }
                
                & $setupScriptPath @setupArgs
                
                Write-Host ""
                Write-Host "✅ Devnet secrets configured successfully" -ForegroundColor Green
                Write-Host ""
            } catch {
                Write-Host "❌ Failed to configure devnet secrets: $_" -ForegroundColor Red
                Write-Host ""
                Write-Host "Continue without devnet secrets? (y/n)" -ForegroundColor Yellow
                $continue = Read-Host
                if ($continue -ne "y") {
                    exit 1
                }
            }
        } else {
            Write-Host "⚠️  Devnet secrets setup script not found: $setupScriptPath" -ForegroundColor Yellow
            Write-Host "   Skipping devnet configuration" -ForegroundColor Yellow
            Write-Host ""
        }
    }
}

# Deploy or update the app
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Deploying Application" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

if ($DryRun) {
    Write-Host "🔍 DRY RUN: Would trigger deployment for app $AppId" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Environment: $Environment" -ForegroundColor Cyan
    Write-Host "Devnet Secrets: $(if ($shouldIncludeDevnetSecrets) { 'YES' } else { 'NO' })" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Run without -DryRun to actually deploy" -ForegroundColor Yellow
    exit 0
}

if ($NoRedeploy) {
    Write-Host "ℹ️  Skipping redeployment (configuration only)" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host "Triggering deployment..." -ForegroundColor Yellow
    
    try {
        $headers = @{
            "Authorization" = "Bearer $ApiKey"
            "Content-Type" = "application/json"
        }
        
        $deployResponse = Invoke-RestMethod `
            -Uri "https://api.digitalocean.com/v2/apps/$AppId/deployments" `
            -Method Post `
            -Headers $headers
        
        Write-Host "✅ Deployment triggered!" -ForegroundColor Green
        Write-Host "   Deployment ID: $($deployResponse.deployment.id)" -ForegroundColor Gray
        Write-Host ""
        
        # Wait a moment for deployment to start
        Write-Host "Waiting for deployment to start..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
        
        # Get deployment status
        Write-Host "Fetching deployment status..." -ForegroundColor Yellow
        $deployment = Invoke-RestMethod `
            -Uri "https://api.digitalocean.com/v2/apps/$AppId/deployments/$($deployResponse.deployment.id)" `
            -Method Get `
            -Headers $headers
        
        Write-Host ""
        Write-Host "Deployment Status: $($deployment.deployment.phase)" -ForegroundColor Cyan
        Write-Host ""
        
    } catch {
        Write-Host "❌ Deployment failed: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "Error details:" -ForegroundColor Yellow
        Write-Host $_.Exception.Message -ForegroundColor Red
        exit 1
    }
}

# Summary
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "✅ Deployment Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Environment:     $Environment" -ForegroundColor Cyan
Write-Host "App ID:          $AppId" -ForegroundColor Cyan
Write-Host "Devnet Secrets:  $(if ($shouldIncludeDevnetSecrets) { 'Configured ✅' } else { 'Not configured ⊘' })" -ForegroundColor Cyan
Write-Host ""

Write-Host "Monitor deployment at:" -ForegroundColor Yellow
Write-Host "  https://cloud.digitalocean.com/apps/$AppId" -ForegroundColor Cyan
Write-Host ""

if ($shouldIncludeDevnetSecrets) {
    Write-Host "Static Devnet Wallets Configured:" -ForegroundColor Yellow
    Write-Host "  Sender:       CL8c2oMZUq9wdw84MAVGBdhKt6BXfKZb1Hy1Mo1jfyz1" -ForegroundColor Gray
    Write-Host "  Receiver:     8GDAazp6Vm3avTiMDkaHiTCjMyJRzRF1k9n6w8b85x1m" -ForegroundColor Gray
    Write-Host "  Admin:        5wwbtUoPpVw7bEWpZj9kp4gZ265uwQuoPxE5145dTdVh" -ForegroundColor Gray
    Write-Host "  FeeCollector: C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E" -ForegroundColor Gray
    Write-Host ""
    Write-Host "🧪 E2E Tests can now run on this deployment!" -ForegroundColor Green
    Write-Host ""
}

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Monitor deployment logs" -ForegroundColor Gray
Write-Host "  2. Verify application is running" -ForegroundColor Gray
if ($shouldIncludeDevnetSecrets) {
    Write-Host "  3. Fund devnet wallets (if needed)" -ForegroundColor Gray
    Write-Host "  4. Run E2E tests against deployed environment" -ForegroundColor Gray
} else {
    Write-Host "  3. Test production endpoints" -ForegroundColor Gray
}
Write-Host ""

Write-Host "🔐 Security Note:" -ForegroundColor Yellow
if ($Environment -eq "production") {
    Write-Host "  Production deployment complete." -ForegroundColor Gray
    if (-not $shouldIncludeDevnetSecrets) {
        Write-Host "  No test wallets configured (recommended for production)." -ForegroundColor Green
    }
} else {
    Write-Host "  $Environment environment with E2E testing capabilities." -ForegroundColor Gray
}
Write-Host ""

