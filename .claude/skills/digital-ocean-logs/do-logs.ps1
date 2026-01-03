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

# Script location for finding cache file
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CacheFile = Join-Path $ScriptDir "apps-cache.json"
$CacheMaxAgeDays = 7

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

function Invoke-DORequest {
    param([string]$Endpoint)

    $headers = @{
        "Authorization" = "Bearer $env:DIGITAL_OCEAN_API_KEY"
        "Content-Type" = "application/json"
    }

    Invoke-RestMethod -Uri "$ApiBase$Endpoint" -Headers $headers -Method Get
}

function Get-CacheAge {
    if (-not (Test-Path $CacheFile)) {
        return [int]::MaxValue
    }
    $cache = Get-Content $CacheFile | ConvertFrom-Json
    if (-not $cache.lastUpdated) {
        return [int]::MaxValue
    }
    $lastUpdated = [DateTime]::Parse($cache.lastUpdated)
    return ((Get-Date) - $lastUpdated).Days
}

function Update-AppCache {
    Write-Host "Refreshing app cache from DigitalOcean..." -ForegroundColor Yellow

    $response = Invoke-DORequest "/apps"

    $apps = @{}
    foreach ($app in $response.apps) {
        $shortName = $app.spec.name -replace '-production$', '' -replace '-staging$', '-staging' -replace '-prod-frontend$', ''

        # Determine default component
        $defaultComponent = $null
        if ($app.spec.services -and $app.spec.services.Count -gt 0) {
            $defaultComponent = $app.spec.services[0].name
        } elseif ($app.spec.static_sites -and $app.spec.static_sites.Count -gt 0) {
            $defaultComponent = $app.spec.static_sites[0].name
        } elseif ($app.spec.jobs -and $app.spec.jobs.Count -gt 0) {
            $defaultComponent = $app.spec.jobs[0].name
        }

        $apps[$shortName] = @{
            id = $app.id
            defaultComponent = $defaultComponent
            fullName = $app.spec.name
        }
    }

    $cache = @{
        lastUpdated = (Get-Date).ToUniversalTime().ToString("o")
        apps = $apps
    }

    $cache | ConvertTo-Json -Depth 3 | Set-Content $CacheFile -Encoding UTF8
    Write-Host "Cache updated with $($apps.Count) apps" -ForegroundColor Green
    return $apps
}

function Get-Apps {
    $cacheAge = Get-CacheAge

    if ($cacheAge -gt $CacheMaxAgeDays) {
        Write-Host "Cache is $cacheAge days old (max: $CacheMaxAgeDays), refreshing..." -ForegroundColor Yellow
        return Update-AppCache
    }

    $cache = Get-Content $CacheFile | ConvertFrom-Json

    # Convert PSCustomObject to hashtable
    $apps = @{}
    foreach ($prop in $cache.apps.PSObject.Properties) {
        $apps[$prop.Name] = @{
            id = $prop.Value.id
            defaultComponent = $prop.Value.defaultComponent
            fullName = $prop.Value.fullName
        }
    }
    return $apps
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

    $apps = Get-Apps
    $appInfo = $apps[$AppName]

    if (-not $appInfo) {
        Write-Error "Unknown app '$AppName'. Available: $($apps.Keys -join ', ')"
        return
    }

    $appId = $appInfo.id
    if (-not $Component) {
        $Component = $appInfo.defaultComponent
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

    $apps = Get-Apps
    $appInfo = $apps[$AppName]

    if (-not $appInfo) {
        Write-Error "Unknown app '$AppName'"
        return
    }

    $appId = $appInfo.id
    if (-not $Component) {
        $Component = $appInfo.defaultComponent
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

    $apps = Get-Apps
    $appInfo = $apps[$AppName]

    if (-not $appInfo) {
        Write-Error "Unknown app '$AppName'"
        return
    }

    $appId = $appInfo.id

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

function Show-CacheStatus {
    if (-not (Test-Path $CacheFile)) {
        Write-Host "No cache file found" -ForegroundColor Yellow
        return
    }

    $cache = Get-Content $CacheFile | ConvertFrom-Json
    $lastUpdated = [DateTime]::Parse($cache.lastUpdated)
    $age = ((Get-Date) - $lastUpdated).Days
    $appCount = ($cache.apps.PSObject.Properties | Measure-Object).Count

    Write-Host "=== Cache Status ===" -ForegroundColor Cyan
    Write-Host "Last updated: $($lastUpdated.ToString('yyyy-MM-dd HH:mm:ss')) ($age days ago)"
    Write-Host "Apps cached: $appCount"
    Write-Host "Auto-refresh: after $CacheMaxAgeDays days"
    Write-Host ""
    Write-Host "Cached apps:" -ForegroundColor Yellow
    foreach ($prop in $cache.apps.PSObject.Properties) {
        Write-Host "  $($prop.Name) -> $($prop.Value.id)"
    }
}

# Main router
switch ($Command) {
    "list" {
        Get-AppList
    }
    "logs" {
        if (-not $AppName) {
            $apps = Get-Apps
            Write-Host "Usage: .\do-logs.ps1 logs <app-name> [component] [lines]"
            Write-Host "Apps: $($apps.Keys -join ', ')"
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
    "refresh" {
        Update-AppCache | Out-Null
    }
    "cache-status" {
        Show-CacheStatus
    }
    default {
        $apps = Get-Apps
        Write-Host "DigitalOcean App Platform Logs" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Usage: .\do-logs.ps1 <command> [args...]"
        Write-Host ""
        Write-Host "Commands:"
        Write-Host "  list                          List all apps (live from API)"
        Write-Host "  logs <app> [component] [n]    Get runtime logs (default 100)"
        Write-Host "  deploy-logs <app> [component] Get build/deploy logs"
        Write-Host "  info <app>                    Get app info"
        Write-Host "  refresh                       Force refresh app cache"
        Write-Host "  cache-status                  Show cache info"
        Write-Host ""
        Write-Host "Apps: $($apps.Keys -join ', ')"
        Write-Host ""
        Write-Host "(Cache auto-refreshes after $CacheMaxAgeDays days)"
    }
}
