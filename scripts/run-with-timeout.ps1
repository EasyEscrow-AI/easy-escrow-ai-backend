#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Run commands with automatic timeout detection and handling

.DESCRIPTION
    Utility to run commands with automatic timeout detection based on command type.
    Based on docs/TERMINAL_TIMEOUT_POLICY.md

.PARAMETER Command
    The command to execute

.PARAMETER Arguments
    Arguments to pass to the command

.PARAMETER Timeout
    Override automatic timeout detection (in seconds)

.PARAMETER Retries
    Number of retry attempts (default: 3)

.PARAMETER RetryDelay
    Delay between retries in seconds (default: 1)

.PARAMETER NoRetry
    Disable retry logic

.EXAMPLE
    .\run-with-timeout.ps1 -Command "git" -Arguments "status"

.EXAMPLE
    .\run-with-timeout.ps1 -Command "npm" -Arguments "install" -Timeout 180

.EXAMPLE
    .\run-with-timeout.ps1 -Command "anchor" -Arguments "deploy" -Retries 5
#>

param(
    [Parameter(Position = 0)]
    [string]$Command = "",
    
    [Parameter(Position = 1)]
    [string[]]$Arguments = @(),
    
    [int]$Timeout = 0,
    
    [int]$Retries = 3,
    
    [int]$RetryDelay = 1,
    
    [switch]$NoRetry,
    
    [switch]$Help
)

# Timeout constants (in seconds)
$Script:TIMEOUTS = @{
    QUICK              = 10
    BUILD              = 60
    PACKAGE_MGMT       = 120
    TEST_UNIT          = 60
    TEST_INTEGRATION   = 120
    TEST_E2E           = 180
    DATABASE           = 60
    DATABASE_QUICK     = 30
    BLOCKCHAIN_QUERY   = 90
    BLOCKCHAIN_DEPLOY  = 180
    GIT_LOCAL          = 30
    GIT_NETWORK        = 60
    SERVER_STARTUP     = 45
    LONG_RUNNING       = 300
}

function Show-Help {
    Write-Host @"

Usage: .\run-with-timeout.ps1 [options] -Command <command> [-Arguments <args>]

Options:
  -Timeout <seconds>      Override automatic timeout detection (in seconds)
  -Retries <n>           Number of retry attempts (default: 3)
  -RetryDelay <seconds>  Delay between retries in seconds (default: 1)
  -NoRetry               Disable retry logic
  -Help                  Show this help message

Examples:
  .\run-with-timeout.ps1 -Command "git" -Arguments "status"
  .\run-with-timeout.ps1 -Command "npm" -Arguments "install" -Timeout 120
  .\run-with-timeout.ps1 -Command "anchor" -Arguments "deploy" -Retries 5
  .\run-with-timeout.ps1 -Command "npm" -Arguments "test" -NoRetry

Automatic Timeout Detection:
  Quick operations (git status, ls):       10 seconds
  Build operations (tsc, anchor build):    60 seconds
  Package management (npm install):        120 seconds
  Unit tests:                              60 seconds
  Integration tests:                       120 seconds
  E2E tests:                               180 seconds
  Database operations:                     60 seconds
  Blockchain deployments:                  180 seconds
  Git network ops (push, pull):            60 seconds

See docs/TERMINAL_TIMEOUT_POLICY.md for complete policy.

"@
}

function Get-AutomaticTimeout {
    param(
        [string]$Command,
        [string[]]$Arguments
    )
    
    $fullCommand = "$Command $($Arguments -join ' ')".ToLower()
    
    # Git operations
    if ($Command -eq "git") {
        $localOps = @("status", "branch", "log", "diff", "show")
        $networkOps = @("fetch", "pull", "push", "clone")
        
        if ($Arguments | Where-Object { $localOps -contains $_ }) {
            return $Script:TIMEOUTS.GIT_LOCAL
        }
        if ($Arguments | Where-Object { $networkOps -contains $_ }) {
            return $Script:TIMEOUTS.GIT_NETWORK
        }
        return $Script:TIMEOUTS.QUICK
    }
    
    # NPM operations
    if ($Command -in @("npm", "pnpm", "yarn")) {
        if ($Arguments -contains "install" -or $Arguments -contains "ci" -or $Arguments -contains "update") {
            return $Script:TIMEOUTS.PACKAGE_MGMT
        }
        if ($Arguments -contains "test") {
            if ($fullCommand -like "*e2e*") { return $Script:TIMEOUTS.TEST_E2E }
            if ($fullCommand -like "*integration*") { return $Script:TIMEOUTS.TEST_INTEGRATION }
            return $Script:TIMEOUTS.TEST_UNIT
        }
        if ($Arguments -contains "build" -or $Arguments -contains "compile") {
            return $Script:TIMEOUTS.BUILD
        }
        return $Script:TIMEOUTS.QUICK
    }
    
    # TypeScript operations
    if ($Command -in @("tsc", "typescript")) {
        return $Script:TIMEOUTS.BUILD
    }
    
    # Solana/Anchor operations
    if ($Command -eq "anchor") {
        if ($Arguments -contains "build") { return $Script:TIMEOUTS.BUILD }
        if ($Arguments -contains "deploy") { return $Script:TIMEOUTS.BLOCKCHAIN_DEPLOY }
        if ($Arguments -contains "test") { return $Script:TIMEOUTS.TEST_E2E }
        return $Script:TIMEOUTS.BLOCKCHAIN_QUERY
    }
    
    if ($Command -eq "solana") {
        if ($Arguments -contains "deploy") { return $Script:TIMEOUTS.BLOCKCHAIN_DEPLOY }
        if ($Arguments -contains "airdrop" -or $Arguments -contains "confirm") {
            return $Script:TIMEOUTS.BLOCKCHAIN_QUERY
        }
        return $Script:TIMEOUTS.QUICK
    }
    
    # Cargo operations
    if ($Command -eq "cargo") {
        if ($Arguments -contains "build-sbf" -or $Arguments -contains "build-bpf") {
            return $Script:TIMEOUTS.BUILD
        }
        if ($Arguments -contains "update") { return $Script:TIMEOUTS.PACKAGE_MGMT }
        return $Script:TIMEOUTS.BUILD
    }
    
    # Prisma operations
    if ($Command -eq "prisma" -or ($Command -eq "npx" -and $Arguments -contains "prisma")) {
        if ($fullCommand -like "*generate*") { return $Script:TIMEOUTS.DATABASE_QUICK }
        if ($fullCommand -like "*migrate*" -or $fullCommand -like "*push*") {
            return $Script:TIMEOUTS.DATABASE
        }
        return $Script:TIMEOUTS.DATABASE
    }
    
    # Database operations
    if ($Command -in @("psql", "mysql", "pg_dump")) {
        return $Script:TIMEOUTS.DATABASE
    }
    
    # Test runners
    if ($Command -in @("jest", "mocha", "vitest")) {
        if ($fullCommand -like "*e2e*") { return $Script:TIMEOUTS.TEST_E2E }
        if ($fullCommand -like "*integration*") { return $Script:TIMEOUTS.TEST_INTEGRATION }
        return $Script:TIMEOUTS.TEST_UNIT
    }
    
    # File operations
    if ($Command -in @("ls", "dir", "pwd", "cat", "type", "echo", "Get-ChildItem", "Get-Location")) {
        return $Script:TIMEOUTS.QUICK
    }
    
    # Default timeout
    return $Script:TIMEOUTS.QUICK
}

function Invoke-CommandWithTimeout {
    param(
        [string]$Command,
        [string[]]$Arguments,
        [int]$TimeoutSeconds
    )
    
    $startTime = Get-Date
    $timedOut = $false
    
    # Build full command
    $argString = $Arguments -join " "
    $fullCommand = if ($argString) { "$Command $argString" } else { $Command }
    
    # Create script block
    $scriptBlock = {
        param($cmd, [string[]]$cmdArgs, $workDir)
        Set-Location $workDir
        if ($cmdArgs) {
            & $cmd @cmdArgs 2>&1
        } else {
            & $cmd 2>&1
        }
    }
    
    # Start job
    $job = Start-Job -ScriptBlock $scriptBlock -ArgumentList $Command, $Arguments, $PWD
    
    # Wait for job with timeout
    $completed = Wait-Job -Job $job -Timeout $TimeoutSeconds
    
    if ($null -eq $completed) {
        # Timeout occurred
        $timedOut = $true
        Stop-Job -Job $job -ErrorAction SilentlyContinue
        Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
        
        $duration = ((Get-Date) - $startTime).TotalSeconds
        
        throw "Command timed out after $TimeoutSeconds seconds`n" +
              "Command: $fullCommand`n" +
              "Duration: $([math]::Round($duration, 2))s`n" +
              "Timeout: ${TimeoutSeconds}s"
    }
    
    # Get job results
    $output = Receive-Job -Job $job
    $exitCode = 0
    
    if ($job.State -eq "Failed") {
        $exitCode = 1
    }
    
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    
    $duration = ((Get-Date) - $startTime).TotalSeconds
    
    # Warn if command used >80% of timeout
    if ($duration -gt ($TimeoutSeconds * 0.8)) {
        $percentage = [math]::Round(($duration / $TimeoutSeconds) * 100, 0)
        Write-Warning "Command used ${percentage}% of timeout"
        Write-Host "   Command: $fullCommand" -ForegroundColor Yellow
        Write-Host "   Duration: $([math]::Round($duration, 2))s / Timeout: ${TimeoutSeconds}s" -ForegroundColor Yellow
    }
    
    return @{
        Output    = $output
        ExitCode  = $exitCode
        Duration  = $duration
        TimedOut  = $timedOut
    }
}

function Invoke-CommandWithRetry {
    param(
        [string]$Command,
        [string[]]$Arguments,
        [int]$TimeoutSeconds,
        [int]$MaxRetries,
        [int]$RetryDelaySeconds
    )
    
    $lastError = $null
    
    for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
        try {
            $argString = $Arguments -join " "
            $fullCommand = if ($argString) { "$Command $argString" } else { $Command }
            
            Write-Host "`n🔄 Attempt $attempt/$MaxRetries : $fullCommand" -ForegroundColor Cyan
            
            $result = Invoke-CommandWithTimeout -Command $Command -Arguments $Arguments -TimeoutSeconds $TimeoutSeconds
            
            # Display output
            if ($result.Output) {
                $result.Output | ForEach-Object { Write-Host $_ }
            }
            
            if ($result.ExitCode -ne 0) {
                throw "Command exited with code $($result.ExitCode)"
            }
            
            return $result
        }
        catch {
            $lastError = $_
            
            if ($attempt -lt $MaxRetries) {
                $delay = $RetryDelaySeconds * $attempt
                Write-Host "`n❌ Attempt $attempt failed: $($_.Exception.Message)" -ForegroundColor Red
                Write-Host "   Retrying in ${delay}s..." -ForegroundColor Yellow
                Start-Sleep -Seconds $delay
            }
        }
    }
    
    throw $lastError
}

# Main execution
if ($Help) {
    Show-Help
    exit 0
}

if (-not $Command) {
    Write-Error "Error: No command specified. Use -Help for usage information."
    exit 1
}

try {
    # Determine timeout
    $timeoutSeconds = if ($Timeout -gt 0) {
        $Timeout
    }
    else {
        Get-AutomaticTimeout -Command $Command -Arguments $Arguments
    }
    
    Write-Host "Running command with ${timeoutSeconds}s timeout..." -ForegroundColor Cyan
    
    # Run with or without retry
    if ($NoRetry) {
        $result = Invoke-CommandWithTimeout -Command $Command -Arguments $Arguments -TimeoutSeconds $timeoutSeconds
        
        # Display output
        if ($result.Output) {
            $result.Output | ForEach-Object { Write-Host $_ }
        }
        
        Write-Host "`n✅ Command completed successfully in $([math]::Round($result.Duration, 2))s" -ForegroundColor Green
    }
    else {
        $result = Invoke-CommandWithRetry `
            -Command $Command `
            -Arguments $Arguments `
            -TimeoutSeconds $timeoutSeconds `
            -MaxRetries $Retries `
            -RetryDelaySeconds $RetryDelay
        
        Write-Host "`n✅ Command completed successfully in $([math]::Round($result.Duration, 2))s" -ForegroundColor Green
    }
    
    exit 0
}
catch {
    Write-Host "`n❌ Command failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

