#!/usr/bin/env ts-node

/**
 * Utility to run commands with automatic timeout detection and handling
 * Based on docs/TERMINAL_TIMEOUT_POLICY.md
 */

import { spawn, SpawnOptions } from 'child_process';
import * as path from 'path';

// Timeout categories in milliseconds
const TIMEOUTS = {
  QUICK: 10_000,              // 10 seconds
  BUILD: 60_000,              // 60 seconds
  PACKAGE_MGMT: 120_000,      // 120 seconds
  TEST_UNIT: 60_000,          // 60 seconds
  TEST_INTEGRATION: 120_000,  // 120 seconds
  TEST_E2E: 180_000,          // 180 seconds
  DATABASE: 60_000,           // 60 seconds
  DATABASE_QUICK: 30_000,     // 30 seconds
  BLOCKCHAIN_QUERY: 90_000,   // 90 seconds
  BLOCKCHAIN_DEPLOY: 180_000, // 180 seconds
  GIT_LOCAL: 30_000,          // 30 seconds
  GIT_NETWORK: 60_000,        // 60 seconds
  SERVER_STARTUP: 45_000,     // 45 seconds
  LONG_RUNNING: 300_000,      // 300 seconds (5 minutes)
} as const;

interface CommandConfig {
  command: string;
  args?: string[];
  timeout?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  retries?: number;
  retryDelay?: number;
}

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  timedOut: boolean;
}

/**
 * Detect timeout based on command pattern
 */
function detectTimeout(command: string, args: string[] = []): number {
  const fullCommand = `${command} ${args.join(' ')}`.toLowerCase();

  // Git operations
  if (command === 'git') {
    const localOps = ['status', 'branch', 'log', 'diff', 'show'];
    const networkOps = ['fetch', 'pull', 'push', 'clone'];
    
    if (args.some(arg => localOps.includes(arg))) return TIMEOUTS.GIT_LOCAL;
    if (args.some(arg => networkOps.includes(arg))) return TIMEOUTS.GIT_NETWORK;
    return TIMEOUTS.QUICK;
  }

  // NPM operations
  if (command === 'npm' || command === 'pnpm' || command === 'yarn') {
    if (args.includes('install') || args.includes('ci') || args.includes('update')) {
      return TIMEOUTS.PACKAGE_MGMT;
    }
    if (args.includes('test')) {
      if (fullCommand.includes('e2e')) return TIMEOUTS.TEST_E2E;
      if (fullCommand.includes('integration')) return TIMEOUTS.TEST_INTEGRATION;
      return TIMEOUTS.TEST_UNIT;
    }
    if (args.includes('build') || args.includes('compile')) {
      return TIMEOUTS.BUILD;
    }
    return TIMEOUTS.QUICK;
  }

  // TypeScript operations
  if (command === 'tsc' || command === 'typescript') {
    return TIMEOUTS.BUILD;
  }

  // Solana/Anchor operations
  if (command === 'anchor') {
    if (args.includes('build')) return TIMEOUTS.BUILD;
    if (args.includes('deploy')) return TIMEOUTS.BLOCKCHAIN_DEPLOY;
    if (args.includes('test')) return TIMEOUTS.TEST_E2E;
    return TIMEOUTS.BLOCKCHAIN_QUERY;
  }

  if (command === 'solana') {
    if (args.includes('deploy')) return TIMEOUTS.BLOCKCHAIN_DEPLOY;
    if (args.includes('airdrop') || args.includes('confirm')) {
      return TIMEOUTS.BLOCKCHAIN_QUERY;
    }
    return TIMEOUTS.QUICK;
  }

  // Cargo operations
  if (command === 'cargo') {
    if (args.includes('build-sbf') || args.includes('build-bpf')) {
      return TIMEOUTS.BUILD;
    }
    if (args.includes('update')) return TIMEOUTS.PACKAGE_MGMT;
    return TIMEOUTS.BUILD;
  }

  // Prisma operations
  if (command === 'prisma' || command === 'npx' && args.includes('prisma')) {
    if (fullCommand.includes('generate')) return TIMEOUTS.DATABASE_QUICK;
    if (fullCommand.includes('migrate') || fullCommand.includes('push')) {
      return TIMEOUTS.DATABASE;
    }
    return TIMEOUTS.DATABASE;
  }

  // Database operations
  if (command === 'psql' || command === 'mysql' || command === 'pg_dump') {
    return TIMEOUTS.DATABASE;
  }

  // Test runners
  if (command === 'jest' || command === 'mocha' || command === 'vitest') {
    if (fullCommand.includes('e2e')) return TIMEOUTS.TEST_E2E;
    if (fullCommand.includes('integration')) return TIMEOUTS.TEST_INTEGRATION;
    return TIMEOUTS.TEST_UNIT;
  }

  // File operations
  if (['ls', 'dir', 'pwd', 'cat', 'type', 'echo'].includes(command)) {
    return TIMEOUTS.QUICK;
  }

  // Default timeout for unknown commands
  return TIMEOUTS.QUICK;
}

/**
 * Run a command with timeout
 */
async function runWithTimeout(config: CommandConfig): Promise<CommandResult> {
  const {
    command,
    args = [],
    timeout = detectTimeout(command, args),
    cwd = process.cwd(),
    env = process.env,
  } = config;

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const spawnOptions: SpawnOptions = {
      cwd,
      env,
      shell: true,
    };

    const child = spawn(command, args, spawnOptions);

    // Set up timeout
    const timeoutId = setTimeout(() => {
      timedOut = true;
      
      // Try graceful termination first
      child.kill('SIGTERM');
      
      // Force kill after 5 seconds
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 5000);
    }, timeout);

    // Collect stdout
    child.stdout?.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      process.stdout.write(output); // Live output
    });

    // Collect stderr
    child.stderr?.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      process.stderr.write(output); // Live output
    });

    // Handle completion
    child.on('close', (code) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      const result: CommandResult = {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code || 0,
        duration,
        timedOut,
      };

      if (timedOut) {
        const error = new Error(
          `Command timed out after ${timeout}ms\n` +
          `Command: ${command} ${args.join(' ')}\n` +
          `Duration: ${duration}ms\n` +
          `Timeout: ${timeout}ms`
        );
        reject(error);
      } else if (code !== 0 && code !== null) {
        const error = new Error(
          `Command failed with exit code ${code}\n` +
          `Command: ${command} ${args.join(' ')}\n` +
          `stderr: ${stderr}`
        );
        reject(error);
      } else {
        // Warn if command used >80% of timeout
        if (duration > timeout * 0.8) {
          console.warn(
            `⚠️  Warning: Command used ${Math.round((duration / timeout) * 100)}% of timeout\n` +
            `   Command: ${command} ${args.join(' ')}\n` +
            `   Duration: ${duration}ms / Timeout: ${timeout}ms`
          );
        }
        resolve(result);
      }
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });
}

/**
 * Run a command with retry logic
 */
async function runWithRetry(config: CommandConfig): Promise<CommandResult> {
  const { retries = 3, retryDelay = 1000 } = config;
  
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`\n🔄 Attempt ${attempt}/${retries}: ${config.command} ${(config.args || []).join(' ')}`);
      return await runWithTimeout(config);
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < retries) {
        const delay = retryDelay * attempt; // Exponential backoff
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`\n❌ Attempt ${attempt} failed: ${errorMessage}`);
        console.log(`   Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

/**
 * CLI interface
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: ts-node run-with-timeout.ts [options] <command> [args...]

Options:
  --timeout <ms>       Override automatic timeout detection (in milliseconds)
  --retries <n>        Number of retry attempts (default: 3)
  --retry-delay <ms>   Delay between retries in ms (default: 1000)
  --no-retry           Disable retry logic
  --help, -h           Show this help message

Examples:
  ts-node run-with-timeout.ts git status
  ts-node run-with-timeout.ts --timeout 120000 npm install
  ts-node run-with-timeout.ts --retries 5 anchor deploy
  ts-node run-with-timeout.ts --no-retry npm test

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
    `);
    process.exit(0);
  }
  
  // Parse options
  let timeout: number | undefined;
  let retries = 3;
  let retryDelay = 1000;
  let useRetry = true;
  
  const commandArgs: string[] = [];
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--timeout') {
      timeout = parseInt(args[++i], 10);
    } else if (arg === '--retries') {
      retries = parseInt(args[++i], 10);
    } else if (arg === '--retry-delay') {
      retryDelay = parseInt(args[++i], 10);
    } else if (arg === '--no-retry') {
      useRetry = false;
    } else {
      commandArgs.push(arg);
    }
  }
  
  if (commandArgs.length === 0) {
    console.error('❌ Error: No command specified');
    process.exit(1);
  }
  
  const [command, ...cmdArgs] = commandArgs;
  
  const config: CommandConfig = {
    command,
    args: cmdArgs,
    timeout,
    retries: useRetry ? retries : 1,
    retryDelay,
  };
  
  try {
    const result = useRetry 
      ? await runWithRetry(config)
      : await runWithTimeout(config);
    
    console.log(`\n✅ Command completed successfully in ${result.duration}ms`);
    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Command failed: ${errorMessage}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Export for use in other scripts
export { runWithTimeout, runWithRetry, detectTimeout, TIMEOUTS };
export type { CommandConfig, CommandResult };

