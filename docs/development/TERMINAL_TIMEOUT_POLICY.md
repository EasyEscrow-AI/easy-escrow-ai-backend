# Terminal Command Timeout Policy

## Overview
This policy defines timeout standards for all terminal commands executed in this workspace to prevent hanging operations and ensure responsive development workflows.

## Timeout Categories

### 1. Quick Operations (5-10 seconds)
Commands that should complete almost instantly:

**Examples:**
- `git status`
- `git branch`
- `ls`, `dir`, `pwd`
- `echo`
- `cat` (small files)
- Environment variable checks
- Simple file operations

**Timeout:** 10 seconds
**Rationale:** These operations access local filesystem or in-memory data

### 2. Build/Compile Operations (30-60 seconds)
TypeScript compilation and build processes:

**Examples:**
- `tsc --noEmit` (type checking)
- `npm run build`
- `npm run lint`
- `anchor build` (Solana program compilation)
- `cargo build-sbf`

**Timeout:** 60 seconds (first build), 30 seconds (incremental)
**Rationale:** Initial builds may require dependency resolution and full compilation

### 3. Package Management (120 seconds)
Dependency installation and updates:

**Examples:**
- `npm install`
- `npm ci`
- `npm update`
- `cargo update`

**Timeout:** 120 seconds
**Rationale:** Network operations downloading multiple packages

### 4. Test Execution (60-180 seconds)
Running test suites:

**Examples:**
- `npm test` (unit tests)
- `npm run test:integration`
- `jest --runInBand`
- Unit test suites: 60 seconds
- Integration tests: 120 seconds
- E2E tests: 180 seconds

**Timeout:** Varies by test type
**Rationale:** Depends on test complexity and external service dependencies

### 5. Database Operations (30-60 seconds)
Database migrations, seeds, and queries:

**Examples:**
- `npx prisma migrate dev`
- `npx prisma db push`
- `npx prisma generate`
- `npm run seed`

**Timeout:** 60 seconds
**Rationale:** Database schema operations and data seeding can be I/O intensive

### 6. Blockchain/Devnet Operations (90-180 seconds)
Solana network interactions:

**Examples:**
- `anchor deploy`
- `solana program deploy`
- `solana airdrop`
- `solana confirm`
- Network requests: 90 seconds
- Program deployment: 180 seconds

**Timeout:** Varies by operation
**Rationale:** Network latency, confirmation times, and on-chain processing

### 7. Git Operations (30-60 seconds)
Version control operations:

**Examples:**
- `git fetch origin`
- `git pull --rebase`
- `git push`
- `git clone`
- Local operations (commit, branch): 30 seconds
- Network operations (fetch, push, pull): 60 seconds

**Timeout:** Varies by operation type
**Rationale:** Network operations depend on repository size and connection speed

### 8. Server/Service Startup (45 seconds)
Starting development servers:

**Examples:**
- `npm run dev`
- `nodemon`
- Local validator startup
- API server initialization

**Timeout:** 45 seconds
**Rationale:** Time to load dependencies, initialize connections, and bind ports

### 9. Long-Running Scripts (300 seconds)
Custom scripts with complex operations:

**Examples:**
- Data migration scripts
- Bulk processing operations
- Full system setup scripts
- Complete E2E test suites

**Timeout:** 300 seconds (5 minutes)
**Rationale:** Multiple sub-operations with various dependencies

### 10. Background/Watch Processes (No Timeout)
Processes that run indefinitely:

**Examples:**
- `npm run dev` (watch mode)
- `jest --watch`
- `nodemon`
- `solana-test-validator`
- File watchers

**Timeout:** None (run in background)
**Rationale:** Designed to run continuously; should be stopped manually

## Implementation Guidelines

### PowerShell Implementation
```powershell
# Quick operation example
$timeoutSeconds = 10
$job = Start-Job -ScriptBlock { git status }
Wait-Job -Job $job -Timeout $timeoutSeconds
if ($job.State -eq 'Running') {
    Stop-Job -Job $job
    Remove-Job -Job $job
    Write-Error "Command timed out after $timeoutSeconds seconds"
    exit 1
}
$result = Receive-Job -Job $job
Remove-Job -Job $job
```

### Bash Implementation
```bash
# Quick operation example
timeout 10s git status || {
    echo "Command timed out after 10 seconds"
    exit 1
}

# With custom error handling
timeout --signal=SIGTERM 30s npm run build || {
    exitCode=$?
    if [ $exitCode -eq 124 ]; then
        echo "Build timed out after 30 seconds"
        exit 1
    fi
}
```

### Node.js/TypeScript Implementation
```typescript
import { spawn } from 'child_process';

async function runWithTimeout(
    command: string,
    args: string[],
    timeoutMs: number
): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args);
        let stdout = '';
        let stderr = '';
        
        const timeoutId = setTimeout(() => {
            child.kill('SIGTERM');
            reject(new Error(`Command timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        
        child.stdout?.on('data', (data) => {
            stdout += data.toString();
        });
        
        child.stderr?.on('data', (data) => {
            stderr += data.toString();
        });
        
        child.on('close', (code) => {
            clearTimeout(timeoutId);
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(new Error(`Command failed: ${stderr}`));
            }
        });
    });
}
```

## Command Timeout Reference Table

| Command Pattern | Timeout | Category |
|----------------|---------|----------|
| `git status`, `git branch`, `git log` | 10s | Quick |
| `git fetch`, `git pull`, `git push` | 60s | Git Network |
| `npm install`, `npm ci` | 120s | Package Mgmt |
| `npm run build`, `tsc` | 60s | Build |
| `npm test` (unit) | 60s | Test |
| `npm run test:integration` | 120s | Test |
| `npm run test:e2e` | 180s | Test |
| `anchor build` | 60s | Build |
| `anchor deploy` | 180s | Blockchain |
| `solana airdrop` | 90s | Blockchain |
| `npx prisma migrate` | 60s | Database |
| `npx prisma generate` | 30s | Build |
| Custom setup scripts | 300s | Long-Running |
| Development servers | 45s (startup) | Service |
| Watch mode processes | None | Background |

## Timeout Handling Best Practices

### 1. Graceful Degradation
- Always send SIGTERM first, then SIGKILL after grace period
- Clean up resources (temp files, connections) on timeout
- Log timeout events for debugging

### 2. Retry Logic
```typescript
async function runWithRetry(
    command: string,
    timeoutMs: number,
    maxRetries: number = 3
): Promise<string> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await runWithTimeout(command, [], timeoutMs);
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
    throw new Error('Max retries exceeded');
}
```

### 3. Progress Indicators
- For operations >30s, provide progress feedback
- Use spinners or progress bars
- Log intermediate steps

### 4. Environment-Specific Timeouts
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
```

## Monitoring and Alerts

### Timeout Metrics to Track
1. Command timeout frequency by type
2. Average execution time vs. timeout threshold
3. Commands frequently hitting timeout limits
4. Failed retry attempts

### Alert Thresholds
- **Warning:** Command uses >80% of timeout
- **Error:** Command times out
- **Critical:** Same command times out >3 times in 1 hour

## Exception Handling

### Commands That May Legitimately Exceed Timeouts
1. Initial project setup (first `npm install`)
2. Large blockchain program deployments
3. Full database migrations with large datasets
4. Complete E2E test suites with external service dependencies

**Action:** Increase timeout with explicit documentation of why

## Testing Timeout Configuration

```typescript
// Test that critical commands complete within timeout
describe('Command Timeout Tests', () => {
    it('should complete git status within 10s', async () => {
        const start = Date.now();
        await runWithTimeout('git', ['status'], 10000);
        const duration = Date.now() - start;
        expect(duration).toBeLessThan(10000);
    });
    
    it('should complete npm run build within 60s', async () => {
        const start = Date.now();
        await runWithTimeout('npm', ['run', 'build'], 60000);
        const duration = Date.now() - start;
        expect(duration).toBeLessThan(60000);
    });
});
```

## Agent Integration

When an AI agent (like Cursor's assistant) executes terminal commands:

1. **Automatic Timeout Application:** Apply appropriate timeout based on command type
2. **Timeout Warnings:** If command exceeds 50% of timeout, log warning
3. **Timeout Failures:** On timeout, provide clear error message with command and duration
4. **Retry Recommendation:** Suggest retry with increased timeout if appropriate
5. **Background Process Detection:** Automatically detect and run watch/dev servers in background

## Review and Updates

This policy should be reviewed:
- **Quarterly:** Analyze timeout metrics and adjust thresholds
- **After Major Changes:** When infrastructure or dependencies change significantly
- **On Repeated Timeouts:** If specific commands consistently timeout

## Version History

- **v1.0.0** (2025-10-15): Initial timeout policy creation

