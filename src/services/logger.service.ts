/**
 * Structured Logging Service
 * 
 * Winston-based logger with:
 * - Structured JSON logging for production
 * - Pretty console logging for development
 * - Log levels: ERROR, WARN, INFO, DEBUG
 * - Correlation IDs for request tracking
 * - Log rotation and retention (30 days)
 * - Contextual metadata support
 */

import winston from 'winston';
import path from 'path';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

export interface LogMetadata {
  [key: string]: any;
  correlationId?: string;
  userId?: string;
  offerId?: string;
  transactionSignature?: string;
  nonceAccount?: string;
  errorCode?: string;
}

export class LoggerService {
  private logger: winston.Logger;
  private static instance: LoggerService;
  
  private constructor() {
    const isProduction = process.env.NODE_ENV === 'production';
    const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');
    
    // Custom format for structured logging
    const customFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
      isProduction
        ? winston.format.json() // JSON for production (parseable)
        : winston.format.printf(({ level, message, timestamp, metadata }) => {
            // Pretty format for development
            const meta = metadata as Record<string, any>;
            const metaStr = Object.keys(meta).length > 0
              ? `\n  ${JSON.stringify(meta, null, 2)}`
              : '';
            return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
          })
    );
    
    // Configure transports
    const transports: winston.transport[] = [
      // Console output (always)
      new winston.transports.Console({
        level: logLevel,
        format: customFormat,
      }),
    ];
    
    // File transports for production
    if (isProduction) {
      const logsDir = path.join(process.cwd(), 'logs');
      
      // Error logs (separate file for errors)
      transports.push(
        new winston.transports.File({
          filename: path.join(logsDir, 'error.log'),
          level: 'error',
          format: customFormat,
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 30, // Keep 30 days of logs
        })
      );
      
      // Combined logs (all levels)
      transports.push(
        new winston.transports.File({
          filename: path.join(logsDir, 'combined.log'),
          format: customFormat,
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 30, // Keep 30 days of logs
        })
      );
    }
    
    this.logger = winston.createLogger({
      level: logLevel,
      transports,
      // Don't exit on uncaught exceptions
      exitOnError: false,
    });
    
    console.log(`[LoggerService] Initialized with level: ${logLevel}, environment: ${process.env.NODE_ENV}`);
  }
  
  static getInstance(): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService();
    }
    return LoggerService.instance;
  }
  
  /**
   * Log error message with optional metadata
   */
  error(message: string, metadata?: LogMetadata): void {
    this.logger.error(message, metadata || {});
  }
  
  /**
   * Log warning message with optional metadata
   */
  warn(message: string, metadata?: LogMetadata): void {
    this.logger.warn(message, metadata || {});
  }
  
  /**
   * Log info message with optional metadata
   */
  info(message: string, metadata?: LogMetadata): void {
    this.logger.info(message, metadata || {});
  }
  
  /**
   * Log debug message with optional metadata
   */
  debug(message: string, metadata?: LogMetadata): void {
    this.logger.debug(message, metadata || {});
  }
  
  /**
   * Log swap lifecycle event
   */
  logSwapEvent(
    event: 'offer_created' | 'offer_accepted' | 'transaction_submitted' | 'transaction_confirmed' | 'swap_failed',
    data: {
      offerId: string;
      maker?: string;
      taker?: string;
      transactionSignature?: string;
      nonceAccount?: string;
      error?: any;
      correlationId?: string;
    }
  ): void {
    const metadata: LogMetadata = {
      event,
      offerId: data.offerId,
      correlationId: data.correlationId,
    };
    
    if (data.maker) metadata.maker = data.maker;
    if (data.taker) metadata.taker = data.taker;
    if (data.transactionSignature) metadata.transactionSignature = data.transactionSignature;
    if (data.nonceAccount) metadata.nonceAccount = data.nonceAccount;
    
    if (event === 'swap_failed' && data.error) {
      const errorMessage = data.error instanceof Error ? data.error.message : String(data.error);
      this.error(`Swap failed: ${errorMessage}`, metadata);
    } else {
      this.info(`Swap event: ${event}`, metadata);
    }
  }
  
  /**
   * Log nonce pool event
   */
  logNoncePoolEvent(
    event: 'nonce_assigned' | 'nonce_released' | 'nonce_advanced' | 'nonce_cleanup' | 'pool_replenished',
    data: {
      nonceAccount?: string;
      userId?: string;
      poolStats?: { total: number; available: number; inUse: number };
      error?: any;
      correlationId?: string;
    }
  ): void {
    const metadata: LogMetadata = {
      event,
      correlationId: data.correlationId,
    };
    
    if (data.nonceAccount) metadata.nonceAccount = data.nonceAccount;
    if (data.userId) metadata.userId = data.userId;
    if (data.poolStats) metadata.poolStats = data.poolStats;
    
    if (data.error) {
      const errorMessage = data.error instanceof Error ? data.error.message : String(data.error);
      this.error(`Nonce pool error: ${event} - ${errorMessage}`, metadata);
    } else {
      this.info(`Nonce pool event: ${event}`, metadata);
    }
  }
  
  /**
   * Create child logger with consistent metadata (e.g., for a specific request)
   */
  child(defaultMetadata: LogMetadata): ChildLogger {
    return new ChildLogger(this, defaultMetadata);
  }
  
  /**
   * Get the underlying Winston logger (for advanced use)
   */
  getWinstonLogger(): winston.Logger {
    return this.logger;
  }
}

/**
 * Child logger that includes default metadata in all logs
 * Useful for request-scoped logging with correlation IDs
 */
export class ChildLogger {
  constructor(
    private parent: LoggerService,
    private defaultMetadata: LogMetadata
  ) {}
  
  error(message: string, additionalMetadata?: LogMetadata): void {
    this.parent.error(message, { ...this.defaultMetadata, ...additionalMetadata });
  }
  
  warn(message: string, additionalMetadata?: LogMetadata): void {
    this.parent.warn(message, { ...this.defaultMetadata, ...additionalMetadata });
  }
  
  info(message: string, additionalMetadata?: LogMetadata): void {
    this.parent.info(message, { ...this.defaultMetadata, ...additionalMetadata });
  }
  
  debug(message: string, additionalMetadata?: LogMetadata): void {
    this.parent.debug(message, { ...this.defaultMetadata, ...additionalMetadata });
  }
}

/**
 * Export singleton instance
 */
export const logger = LoggerService.getInstance();

/**
 * Helper function to generate correlation ID
 */
export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}


