/**
 * Configuration
 * 
 * This directory contains application configuration and environment settings.
 * Centralized configuration management.
 */

export * from './database';

// Environment configuration
export const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  
  // Database
  databaseUrl: process.env.DATABASE_URL || '',
  
  // Solana
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'http://localhost:8899',
    network: process.env.SOLANA_NETWORK || 'localnet',
    escrowProgramId: process.env.ESCROW_PROGRAM_ID || '',
  },
  
  // Security
  security: {
    jwtSecret: process.env.JWT_SECRET || '',
    apiKeySecret: process.env.API_KEY_SECRET || '',
    receiptSigningKey: process.env.RECEIPT_SIGNING_KEY || '',
    allowedDomains: process.env.ALLOWED_DOMAINS?.split(',') || ['localhost'],
  },
  
  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  
  // USDC Configuration
  usdc: {
    mintAddress: process.env.USDC_MINT_ADDRESS || '',
  },
  
  // Platform
  platform: {
    feeBps: parseInt(process.env.PLATFORM_FEE_BPS || '250', 10),
    feeCollectorAddress: process.env.PLATFORM_FEE_COLLECTOR_ADDRESS || '',
  },
  
  // Webhooks
  webhooks: {
    secret: process.env.WEBHOOK_SECRET || '',
    maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES || '5', 10),
    retryDelayMs: parseInt(process.env.WEBHOOK_RETRY_DELAY_MS || '1000', 10),
  },
} as const;

export default config;

