# Terminal Command Timeout Utilities

## Overview

This document describes the timeout utilities and policies implemented in the Easy Escrow AI Backend project to prevent commands from hanging indefinitely.

## Files

### 1. `docs/TERMINAL_TIMEOUT_POLICY.md`
Complete policy document defining timeout standards for all terminal operations:
- Timeout categories (Quick, Build, Package Management, Tests, Database, Blockchain, etc.)
- Specific timeout values for each command type
- Implementation guidelines for PowerShell, Bash, and Node.js
- Best practices for timeout handling
- Monitoring and alerting recommendations

### 2. `.cursorrules`
Cursor workspace rules that automatically apply timeout policies when the AI agent executes terminal commands.

### 3. `scripts/run-with-timeout.ts`
TypeScript/Node.js utility for running commands with automatic timeout detection:
- Intelligent timeout detection based on command pattern
- Retry logic with exponential backoff
- Live output streaming
- Warning when commands use >80% of timeout
- Full TypeScript types for integration

### 4. `scripts/run-with-timeout.ps1`
PowerShell implementation of the timeout utility:
- Native PowerShell job-based timeout handling
- Same features as TypeScript version
- Windows-friendly with proper error handling
- Colored output for better visibility

## Quick Start

### Using the TypeScript Version

```bash
# Basic usage - automatic timeout detection
ts-node scripts/run-with-timeout.ts git status

# Override timeout (in milliseconds)
ts-node scripts/run-with-timeout.ts --timeout 120000 npm install

# Configure retry behavior
ts-node scripts/run-with-timeout.ts --retries 5 --retry-delay 2000 anchor deploy

# Disable retry logic
ts-node scripts/run-with-timeout.ts --no-retry npm test
```

### Using the PowerShell Version

```powershell
# Basic usage - automatic timeout detection
.\scripts\run-with-timeout.ps1 -Command "git" -Arguments "status"

# Override timeout (in seconds)
.\scripts\run-with-timeout.ps1 -Command "npm" -Arguments "install" -Timeout 120

# Configure retry behavior
.\scripts\run-with-timeout.ps1 -Command "anchor" -Arguments "deploy" -Retries 5 -RetryDelay 2

# Disable retry logic
.\scripts\run-with-timeout.ps1 -Command "npm" -Arguments "test" -NoRetry
```

## Timeout Values

| Operation Type | Timeout | Commands |
|---------------|---------|----------|
| **Quick Operations** | 10s | `git status`, `ls`, `cat`, `echo` |
| **Build Operations** | 60s | `tsc`, `npm run build`, `anchor build` |
| **Package Management** | 120s | `npm install`, `npm ci`, `cargo update` |
| **Unit Tests** | 60s | `npm test`, `jest` |
| **Integration Tests** | 120s | `npm run test:integration` |
| **E2E Tests** | 180s | `npm run test:e2e` |
| **Database Operations** | 60s | `prisma migrate`, `npx prisma db push` |
| **Prisma Generate** | 30s | `npx prisma generate` |
| **Blockchain Queries** | 90s | `solana airdrop`, `solana balance` |
| **Blockchain Deployments** | 180s | `anchor deploy`, `solana program deploy` |
| **Git Local Operations** | 30s | `git commit`, `git branch` |
| **Git Network Operations** | 60s | `git fetch`, `git pull`, `git push` |
| **Server Startup** | 45s | `npm run dev`, `nodemon` (then background) |
| **Long-Running Scripts** | 300s | Custom setup/migration scripts |

## Automatic Timeout Detection

Both utilities include intelligent timeout detection:

```typescript
// TypeScript example
import { runWithTimeout, detectTimeout } from './scripts/run-with-timeout';

// Automatically detects that git status should use 10s timeout
const result = await runWithTimeout({
  command: 'git',
  args: ['status']
  // timeout is auto-detected as 10000ms
});

// You can also detect timeout without running
const timeout = detectTimeout('npm', ['install']); // Returns 120000 (2 minutes)
```

## Integration in Scripts

### TypeScript Integration

```typescript
import { runWithTimeout, runWithRetry, TIMEOUTS } from './scripts/run-with-timeout';

// Simple usage with auto-detection
async function buildProject() {
  await runWithTimeout({
    command: 'npm',
    args: ['run', 'build']
  });
}

// With custom timeout
async function deployToBlockchain() {
  await runWithTimeout({
    command: 'anchor',
    args: ['deploy'],
    timeout: TIMEOUTS.BLOCKCHAIN_DEPLOY
  });
}

// With retry logic
async function installDependencies() {
  await runWithRetry({
    command: 'npm',
    args: ['install'],
    retries: 3,
    retryDelay: 2000
  });
}
```

### PowerShell Integration

```powershell
# In a PowerShell script
. .\scripts\run-with-timeout.ps1

# Call the function directly
try {
    Invoke-CommandWithTimeout -Command "git" -Arguments @("status") -TimeoutSeconds 10
    Write-Host "Command succeeded" -ForegroundColor Green
} catch {
    Write-Error "Command failed: $_"
}

# Or use the retry version
Invoke-CommandWithRetry `
    -Command "npm" `
    -Arguments @("install") `
    -TimeoutSeconds 120 `
    -MaxRetries 3 `
    -RetryDelaySeconds 1
```

## Advanced Features

### 1. Retry with Exponential Backoff

```typescript
// Retries with increasing delays: 1s, 2s, 3s
const result = await runWithRetry({
  command: 'solana',
  args: ['airdrop', '1'],
  retries: 3,
  retryDelay: 1000  // Base delay, multiplied by attempt number
});
```

### 2. Live Output Streaming

Both utilities stream stdout/stderr in real-time:

```typescript
// You'll see output as it happens
await runWithTimeout({
  command: 'npm',
  args: ['test']
});
```

### 3. Timeout Warnings

Automatic warnings when commands use >80% of their timeout:

```
⚠️  Warning: Command used 85% of timeout
   Command: npm run build
   Duration: 51000ms / Timeout: 60000ms
```

### 4. Graceful Termination

On timeout:
1. Sends SIGTERM (graceful shutdown)
2. Waits 5 seconds
3. Sends SIGKILL if process still running

## Environment-Specific Timeouts

For CI/CD or different environments, you can apply multipliers:

```typescript
const TIMEOUT_MULTIPLIERS = {
  ci: 2.0,        // CI environments may be slower
  local: 1.0,     // Standard timeouts
  production: 0.5 // Production should be faster
};

function getTimeout(baseTimeout: number): number {
  const env = process.env.NODE_ENV || 'local';
  const multiplier = TIMEOUT_MULTIPLIERS[env] || 1.0;
  return baseTimeout * multiplier;
}

// Usage
await runWithTimeout({
  command: 'npm',
  args: ['test'],
  timeout: getTimeout(TIMEOUTS.TEST_UNIT)
});
```

## Monitoring

### Tracking Timeout Events

```typescript
// Add logging wrapper
async function runWithLogging(config: CommandConfig) {
  const startTime = Date.now();
  try {
    const result = await runWithTimeout(config);
    
    // Log success metrics
    console.log({
      command: config.command,
      duration: result.duration,
      timeout: config.timeout,
      utilization: (result.duration / config.timeout!) * 100
    });
    
    return result;
  } catch (error) {
    // Log timeout/failure
    console.error({
      command: config.command,
      error: error.message,
      duration: Date.now() - startTime
    });
    throw error;
  }
}
```

## Testing

### Unit Tests for Timeout Utilities

```typescript
import { runWithTimeout, detectTimeout, TIMEOUTS } from './scripts/run-with-timeout';

describe('Timeout Detection', () => {
  it('detects git status as quick operation', () => {
    expect(detectTimeout('git', ['status'])).toBe(TIMEOUTS.QUICK);
  });
  
  it('detects npm install as package management', () => {
    expect(detectTimeout('npm', ['install'])).toBe(TIMEOUTS.PACKAGE_MGMT);
  });
  
  it('detects anchor deploy as blockchain deployment', () => {
    expect(detectTimeout('anchor', ['deploy'])).toBe(TIMEOUTS.BLOCKCHAIN_DEPLOY);
  });
});

describe('Command Execution', () => {
  it('completes quick command within timeout', async () => {
    const start = Date.now();
    await runWithTimeout({
      command: 'echo',
      args: ['test']
    });
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(TIMEOUTS.QUICK);
  });
  
  it('throws error on timeout', async () => {
    await expect(
      runWithTimeout({
        command: 'sleep',
        args: ['30'],
        timeout: 1000
      })
    ).rejects.toThrow('timed out');
  });
});
```

## Best Practices

### 1. Use Automatic Detection When Possible
```typescript
// Good - uses automatic detection
await runWithTimeout({ command: 'git', args: ['status'] });

// Only override when necessary
await runWithTimeout({ 
  command: 'git', 
  args: ['status'],
  timeout: 30000  // Only if you have a specific reason
});
```

### 2. Enable Retries for Network Operations
```typescript
// Good - retries for flaky network operations
await runWithRetry({
  command: 'solana',
  args: ['airdrop', '1'],
  retries: 3
});
```

### 3. Provide Context in Error Messages
```typescript
try {
  await runWithTimeout({ command: 'npm', args: ['install'] });
} catch (error) {
  console.error('Failed to install dependencies:', error.message);
  console.error('Check your network connection and package.json');
}
```

### 4. Background Processes Don't Need Timeouts
```typescript
// For watch modes and dev servers, don't use timeout utilities
// Instead, run them in background or let them run indefinitely
const devServer = spawn('npm', ['run', 'dev'], {
  detached: true,
  stdio: 'inherit'
});
```

## Troubleshooting

### Command Always Times Out

1. **Check if timeout is appropriate:**
   ```bash
   # Measure actual execution time
   time npm run build
   ```

2. **Increase timeout for specific case:**
   ```typescript
   await runWithTimeout({
     command: 'npm',
     args: ['run', 'build'],
     timeout: TIMEOUTS.BUILD * 2  // Double the timeout
   });
   ```

3. **Check for hanging processes:**
   ```powershell
   Get-Process | Where-Object { $_.ProcessName -like "*node*" }
   ```

### Timeout Not Being Applied

Ensure you're using the timeout utilities:

```typescript
// ❌ Wrong - no timeout
const result = spawn('git', ['status']);

// ✅ Correct - uses timeout
const result = await runWithTimeout({
  command: 'git',
  args: ['status']
});
```

### Retries Not Working

Check retry configuration:

```typescript
// Ensure retries > 1 and retryDelay is reasonable
await runWithRetry({
  command: 'npm',
  args: ['install'],
  retries: 3,        // At least 2 retries
  retryDelay: 1000   // 1 second between retries
});
```

## Related Documentation

- [`docs/TERMINAL_TIMEOUT_POLICY.md`](./TERMINAL_TIMEOUT_POLICY.md) - Complete timeout policy
- [`.cursorrules`](../.cursorrules) - Cursor AI agent rules
- [`scripts/README.md`](../scripts/README.md) - All available scripts

## Version History

- **v1.0.0** (2025-10-15): Initial timeout utilities implementation
  - TypeScript utility with automatic detection
  - PowerShell utility for Windows
  - Comprehensive documentation and policy

