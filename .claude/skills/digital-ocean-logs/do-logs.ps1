# DigitalOcean App Platform Logs Helper (PowerShell)
# Usage: .\do-logs.ps1 <command> [args...]

param(
    [Parameter(Position=0)]
    [string]$Command,

    [Parameter(Position=1)]
    [string]$AppName,

    [Parameter(Position=2)]
    [string]$Arg1,

    [Parameter(Position=3)]
    [string]$Arg2
)

$ErrorActionPreference = "Stop"

# Load API key from .env if not already set
if (-not $env:DIGITAL_OCEAN_API_KEY) {
    if (Test-Path ".env") {
        $envContent = Get-Content ".env" | Where-Object { $_ -match "^DIGITAL_OCEAN_API_KEY=" }
        if ($envContent) {
            $env:DIGITAL_OCEAN_API_KEY = ($envContent -split "=", 2)[1]
        }
    }
}

if (-not $env:DIGITAL_OCEAN_API_KEY) {
    Write-Error "DIGITAL_OCEAN_API_KEY not found in environment or .env"
    exit 1
}

$ApiBase = "https://api.digitalocean.com/v2"

# App ID mappings
$Apps = @{
    "easyescrow-backend" = "a6e6452b-1ec6-4316-82fe-e4069d089b49"
    "easyescrow-staging" = "ea13cdbb-c74e-40da-a0eb-6c05b0d0432d"
    "easyescrow-frontend" = "26b10833-0b7f-4c80-b4d6-be71c4513e79"
    "nftswap-gg" = "77e46321-1661-4faa-b257-9c8db2d604fa"
    "datasales" = "038c152b-f1a8-421b-b97d-a3340ea19667"
}

# Default components
$DefaultComponents = @{
    "easyescrow-backend" = "api"
    "easyescrow-staging" = "api-staging"
    "easyescrow-frontend" = "easyescrow-api"
    "nftswap-gg" = "backend"
    "datasales" = "datasales-website"
}

function Invoke-DORequest {
    param([string]$Endpoint)

    $headers = @{
        "Authorization" = "Bearer $env:DIGITAL_OCEAN_API_KEY"
        "Content-Type" = "application/json"
    }

    Invoke-RestMethod -Uri "$ApiBase$Endpoint" -Headers $headers -Method Get
}

function Get-AppList {
    Write-Host "=== DigitalOcean Apps ===" -ForegroundColor Cyan
    $response = Invoke-DORequest "/apps"
    foreach ($app in $response.apps) {
        $url = if ($app.live_url) { $app.live_url } else { "no url" }
        Write-Host "$($app.spec.name) ($($app.id)) - $url"
    }
}

function Get-AppLogs {
    param(
        [string]$AppName,
        [string]$Component,
        [int]$Lines = 100
    )

    $appId = $Apps[$AppName]
    if (-not $appId) {
        Write-Error "Unknown app '$AppName'. Available: $($Apps.Keys -join ', ')"
        return
    }

    if (-not $Component) {
        $Component = $DefaultComponents[$AppName]
    }

    Write-Host "=== Logs for $AppName / $Component (last $Lines lines) ===" -ForegroundColor Cyan

    $response = Invoke-DORequest "/apps/$appId/components/$Component/logs?type=RUN&follow=false&tail_lines=$Lines"

    if ($response.url) {
        $logs = Invoke-RestMethod -Uri $response.url -Method Get
        Write-Output $logs
    } else {
        Write-Error "Failed to get logs URL"
        $response | ConvertTo-Json
    }
}

function Get-DeployLogs {
    param(
        [string]$AppName,
        [string]$Component
    )

    $appId = $Apps[$AppName]
    if (-not $appId) {
        Write-Error "Unknown app '$AppName'"
        return
    }

    if (-not $Component) {
        $Component = $DefaultComponents[$AppName]
    }

    Write-Host "=== Deploy Logs for $AppName / $Component ===" -ForegroundColor Cyan

    $response = Invoke-DORequest "/apps/$appId/components/$Component/logs?type=BUILD&follow=false&tail_lines=500"

    if ($response.url) {
        $logs = Invoke-RestMethod -Uri $response.url -Method Get
        Write-Output $logs
    } else {
        Write-Error "Failed to get deploy logs"
    }
}

function Get-AppInfo {
    param([string]$AppName)

    $appId = $Apps[$AppName]
    if (-not $appId) {
        Write-Error "Unknown app '$AppName'"
        return
    }

    Write-Host "=== App Info: $AppName ===" -ForegroundColor Cyan
    $response = Invoke-DORequest "/apps/$appId"

    @{
        name = $response.app.spec.name
        region = $response.app.region.slug
        live_url = $response.app.live_url
        last_deployment = $response.app.last_deployment_active_at
        components = @($response.app.spec.services.name) + @($response.app.spec.static_sites.name) + @($response.app.spec.jobs.name) | Where-Object { $_ }
    } | ConvertTo-Json
}

# Main router
switch ($Command) {
    "list" {
        Get-AppList
    }
    "logs" {
        if (-not $AppName) {
            Write-Host "Usage: .\do-logs.ps1 logs <app-name> [component] [lines]"
            Write-Host "Apps: $($Apps.Keys -join ', ')"
            exit 1
        }
        # Handle numeric arg as lines count
        if ($Arg1 -match '^\d+$') {
            Get-AppLogs -AppName $AppName -Lines ([int]$Arg1)
        } else {
            $lines = if ($Arg2) { [int]$Arg2 } else { 100 }
            Get-AppLogs -AppName $AppName -Component $Arg1 -Lines $lines
        }
    }
    "deploy-logs" {
        if (-not $AppName) {
            Write-Host "Usage: .\do-logs.ps1 deploy-logs <app-name> [component]"
            exit 1
        }
        Get-DeployLogs -AppName $AppName -Component $Arg1
    }
    "info" {
        if (-not $AppName) {
            Write-Host "Usage: .\do-logs.ps1 info <app-name>"
            exit 1
        }
        Get-AppInfo -AppName $AppName
    }
    default {
        Write-Host "DigitalOcean App Platform Logs" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Usage: .\do-logs.ps1 <command> [args...]"
        Write-Host ""
        Write-Host "Commands:"
        Write-Host "  list                          List all apps"
        Write-Host "  logs <app> [component] [n]    Get runtime logs (default 100)"
        Write-Host "  deploy-logs <app> [component] Get build/deploy logs"
        Write-Host "  info <app>                    Get app info"
        Write-Host ""
        Write-Host "Apps: $($Apps.Keys -join ', ')"
    }
}
