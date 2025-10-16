# Setup Devnet Wallet Secrets on DigitalOcean - PowerShell Script
# Uses DigitalOcean API to securely configure devnet wallet private keys

param(
    [Parameter(Mandatory=$false)]
    [string]$AppId = "",
    
    [Parameter(Mandatory=$false)]
    [string]$ApiKey = "",
    
    [Parameter(Mandatory=$false)]
    [string]$SenderKey = "",
    
    [Parameter(Mandatory=$false)]
    [string]$ReceiverKey = "",
    
    [Parameter(Mandatory=$false)]
    [string]$AdminKey = "",
    
    [Parameter(Mandatory=$false)]
    [string]$FeeCollectorKey = "",
    
    [switch]$FromEnv = $false,
    
    [switch]$DryRun = $false
)

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Setup Devnet Secrets on DigitalOcean" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Load API key from environment if not provided
if (-not $ApiKey) {
    $ApiKey = $env:DIGITALOCEAN_API_KEY
    if (-not $ApiKey) {
        $ApiKey = $env:DO_API_KEY
    }
}

if (-not $ApiKey) {
    Write-Host "❌ DigitalOcean API key not provided" -ForegroundColor Red
    Write-Host ""
    Write-Host "Provide API key via:" -ForegroundColor White
    Write-Host "  1. -ApiKey parameter" -ForegroundColor Gray
    Write-Host "  2. DIGITALOCEAN_API_KEY environment variable" -ForegroundColor Gray
    Write-Host "  3. DO_API_KEY environment variable" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Get your API key from: https://cloud.digitalocean.com/account/api/tokens" -ForegroundColor Cyan
    exit 1
}

# Load wallet private keys from environment if requested
if ($FromEnv) {
    Write-Host "Loading wallet keys from environment variables..." -ForegroundColor Yellow
    
    if (-not $SenderKey) { $SenderKey = $env:DEVNET_SENDER_PRIVATE_KEY }
    if (-not $ReceiverKey) { $ReceiverKey = $env:DEVNET_RECEIVER_PRIVATE_KEY }
    if (-not $AdminKey) { $AdminKey = $env:DEVNET_ADMIN_PRIVATE_KEY }
    if (-not $FeeCollectorKey) { $FeeCollectorKey = $env:DEVNET_FEE_COLLECTOR_PRIVATE_KEY }
    
    Write-Host "✅ Loaded keys from environment" -ForegroundColor Green
    Write-Host ""
}

# Validate required parameters
$missingKeys = @()
if (-not $SenderKey) { $missingKeys += "Sender" }
if (-not $ReceiverKey) { $missingKeys += "Receiver" }
if (-not $AdminKey) { $missingKeys += "Admin" }
if (-not $FeeCollectorKey) { $missingKeys += "FeeCollector" }

if ($missingKeys.Count -gt 0) {
    Write-Host "❌ Missing private keys: $($missingKeys -join ', ')" -ForegroundColor Red
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor White
    Write-Host "  Option 1: Provide keys as parameters" -ForegroundColor Cyan
    Write-Host "    .\setup-devnet-secrets.ps1 -AppId <ID> -SenderKey <KEY> -ReceiverKey <KEY> -AdminKey <KEY> -FeeCollectorKey <KEY>" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Option 2: Load from environment variables" -ForegroundColor Cyan
    Write-Host "    .\set-devnet-env-vars.ps1 -SenderKey <KEY> -ReceiverKey <KEY> -AdminKey <KEY> -FeeCollectorKey <KEY>" -ForegroundColor Gray
    Write-Host "    .\setup-devnet-secrets.ps1 -AppId <ID> -FromEnv" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

# Get App ID if not provided
if (-not $AppId) {
    Write-Host "ℹ️  App ID not provided. Fetching from DigitalOcean..." -ForegroundColor Cyan
    Write-Host ""
    
    try {
        $headers = @{
            "Authorization" = "Bearer $ApiKey"
            "Content-Type" = "application/json"
        }
        
        $response = Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/apps" -Method Get -Headers $headers
        
        # Find app with easy-escrow in name
        $app = $response.apps | Where-Object { $_.spec.name -like "*escrow*" } | Select-Object -First 1
        
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
            
            $AppId = Read-Host "Enter App ID"
            if (-not $AppId) {
                Write-Host "❌ App ID required" -ForegroundColor Red
                exit 1
            }
        }
    } catch {
        Write-Host "❌ Failed to fetch apps: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please provide App ID manually with -AppId parameter" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "App ID: $AppId" -ForegroundColor Cyan
Write-Host ""

# Define secrets to set
$secrets = @(
    @{
        Name = "DEVNET_SENDER_PRIVATE_KEY"
        Value = $SenderKey
        Description = "Devnet sender wallet private key (Seller - NFT owner)"
    },
    @{
        Name = "DEVNET_RECEIVER_PRIVATE_KEY"
        Value = $ReceiverKey
        Description = "Devnet receiver wallet private key (Buyer - USDC payer)"
    },
    @{
        Name = "DEVNET_ADMIN_PRIVATE_KEY"
        Value = $AdminKey
        Description = "Devnet admin wallet private key (Escrow operations)"
    },
    @{
        Name = "DEVNET_FEE_COLLECTOR_PRIVATE_KEY"
        Value = $FeeCollectorKey
        Description = "Devnet fee collector wallet private key (Treasury - 1% fees)"
    }
)

if ($DryRun) {
    Write-Host "🔍 DRY RUN MODE - No changes will be made" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Would set the following secrets:" -ForegroundColor Cyan
    foreach ($secret in $secrets) {
        $masked = $secret.Value.Substring(0, 8) + "..." + $secret.Value.Substring($secret.Value.Length - 8)
        Write-Host "  ✓ $($secret.Name): $masked" -ForegroundColor Gray
        Write-Host "    Description: $($secret.Description)" -ForegroundColor DarkGray
    }
    Write-Host ""
    Write-Host "Run without -DryRun flag to apply changes" -ForegroundColor Yellow
    exit 0
}

# Get current app configuration
Write-Host "Fetching current app configuration..." -ForegroundColor Yellow

try {
    $headers = @{
        "Authorization" = "Bearer $ApiKey"
        "Content-Type" = "application/json"
    }
    
    $app = Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/apps/$AppId" -Method Get -Headers $headers
    
    Write-Host "✅ Fetched app: $($app.app.spec.name)" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "❌ Failed to fetch app: $_" -ForegroundColor Red
    exit 1
}

# Update app spec with secrets
Write-Host "Updating app environment variables..." -ForegroundColor Yellow
Write-Host ""

# Get the service component (usually the first one)
$service = $app.app.spec.services[0]

if (-not $service) {
    Write-Host "❌ No service component found in app" -ForegroundColor Red
    exit 1
}

# Initialize envs array if it doesn't exist
if (-not $service.envs) {
    $service.envs = @()
}

# Add/update each secret
foreach ($secret in $secrets) {
    # Check if env var already exists
    $existing = $service.envs | Where-Object { $_.key -eq $secret.Name }
    
    if ($existing) {
        Write-Host "  ↻ Updating: $($secret.Name)" -ForegroundColor Cyan
        $existing.value = $secret.Value
        $existing.type = "SECRET"
    } else {
        Write-Host "  + Adding: $($secret.Name)" -ForegroundColor Green
        $service.envs += @{
            key = $secret.Name
            value = $secret.Value
            scope = "RUN_TIME"
            type = "SECRET"
        }
    }
}

# Apply the update
Write-Host ""
Write-Host "Applying changes to DigitalOcean..." -ForegroundColor Yellow

try {
    $body = @{
        spec = $app.app.spec
    } | ConvertTo-Json -Depth 20
    
    $response = Invoke-RestMethod `
        -Uri "https://api.digitalocean.com/v2/apps/$AppId" `
        -Method Put `
        -Headers $headers `
        -Body $body
    
    Write-Host "✅ Secrets updated successfully!" -ForegroundColor Green
    Write-Host ""
    
    # Trigger deployment
    Write-Host "Triggering deployment..." -ForegroundColor Yellow
    
    $deployResponse = Invoke-RestMethod `
        -Uri "https://api.digitalocean.com/v2/apps/$AppId/deployments" `
        -Method Post `
        -Headers $headers
    
    Write-Host "✅ Deployment triggered!" -ForegroundColor Green
    Write-Host "   Deployment ID: $($deployResponse.deployment.id)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Failed to update app: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Error details:" -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "✅ Devnet Secrets Configured!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Static Wallet Addresses:" -ForegroundColor Yellow
Write-Host "  Sender:       CL8c2oMZUq9wdw84MAVGBdhKt6BXfKZb1Hy1Mo1jfyz1" -ForegroundColor Gray
Write-Host "  Receiver:     8GDAazp6Vm3avTiMDkaHiTCjMyJRzRF1k9n6w8b85x1m" -ForegroundColor Gray
Write-Host "  Admin:        5wwbtUoPpVw7bEWpZj9kp4gZ265uwQuoPxE5145dTdVh" -ForegroundColor Gray
Write-Host "  FeeCollector: C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E" -ForegroundColor Gray
Write-Host ""

Write-Host "The app will redeploy with the new secrets." -ForegroundColor Cyan
Write-Host "Monitor deployment at: https://cloud.digitalocean.com/apps/$AppId" -ForegroundColor Cyan
Write-Host ""

Write-Host "🔐 Security Notes:" -ForegroundColor Yellow
Write-Host "  - Secrets are encrypted at rest by DigitalOcean" -ForegroundColor Gray
Write-Host "  - Secrets are injected as environment variables at runtime" -ForegroundColor Gray
Write-Host "  - Secrets are not visible in logs or app console" -ForegroundColor Gray
Write-Host "  - Rotate keys regularly for security" -ForegroundColor Gray
Write-Host ""

