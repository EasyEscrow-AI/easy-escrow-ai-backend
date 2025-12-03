/**
 * Fee Calculator Service
 * 
 * Calculates platform fees for atomic swap transactions based on SOL transfer amounts.
 * Implements tiered fee structure with flat fees for NFT-only swaps and percentage-based
 * fees for swaps involving SOL transfers.
 */

export interface FeeBreakdown {
  /** Fee amount in lamports */
  feeLamports: bigint;
  
  /** Fee amount in SOL (decimal) */
  feeSol: number;
  
  /** Type of fee applied */
  feeType: 'flat' | 'percentage';
  
  /** Fee rate used (percentage as decimal or flat amount in SOL) */
  rate: number;
  
  /** Total swap value in lamports (both sides combined) */
  totalSwapValueLamports: bigint;
  
  /** Total swap value in SOL (decimal) */
  totalSwapValueSol: number;
  
  /** Whether fee was capped at maximum */
  wasCapped: boolean;
}

export interface FeeConfig {
  /** Flat fee in lamports for NFT-only swaps (no SOL transfer) */
  flatFeeLamports: bigint;
  
  /** Percentage fee rate (as decimal, e.g., 0.01 for 1%) */
  percentageRate: number;
  
  /** Maximum fee cap in lamports */
  maxFeeLamports: bigint;
  
  /** Minimum fee in lamports (floor) */
  minFeeLamports: bigint;
}

export class FeeCalculator {
  private config: FeeConfig;
  
  // Constants
  private static readonly LAMPORTS_PER_SOL = 1_000_000_000;
  
  // Default configuration
  private static readonly DEFAULT_CONFIG: FeeConfig = {
    flatFeeLamports: BigInt(5_000_000), // 0.005 SOL for NFT-only swaps
    percentageRate: 0.01, // 1% for swaps involving SOL
    maxFeeLamports: BigInt(500_000_000), // 0.5 SOL maximum
    minFeeLamports: BigInt(1_000_000), // 0.001 SOL minimum
  };
  
  constructor(config?: Partial<FeeConfig>) {
    this.config = config
      ? { ...FeeCalculator.DEFAULT_CONFIG, ...this.normalizeBigIntConfig(config) }
      : FeeCalculator.DEFAULT_CONFIG;
    
    this.validateConfig();
    
    console.log('[FeeCalculator] Initialized with config:', {
      flatFeeSol: this.lamportsToSol(this.config.flatFeeLamports),
      percentageRate: `${this.config.percentageRate * 100}%`,
      maxFeeSol: this.lamportsToSol(this.config.maxFeeLamports),
      minFeeSol: this.lamportsToSol(this.config.minFeeLamports),
    });
  }
  
  /**
   * Normalize config with potential string/number BigInt values
   */
  private normalizeBigIntConfig(config: Partial<FeeConfig>): Partial<FeeConfig> {
    const normalized: Partial<FeeConfig> = {};
    
    if (config.flatFeeLamports !== undefined) {
      normalized.flatFeeLamports = BigInt(config.flatFeeLamports);
    }
    if (config.maxFeeLamports !== undefined) {
      normalized.maxFeeLamports = BigInt(config.maxFeeLamports);
    }
    if (config.minFeeLamports !== undefined) {
      normalized.minFeeLamports = BigInt(config.minFeeLamports);
    }
    if (config.percentageRate !== undefined) {
      normalized.percentageRate = config.percentageRate;
    }
    
    return normalized;
  }
  
  /**
   * Validate fee configuration
   */
  private validateConfig(): void {
    if (this.config.flatFeeLamports < BigInt(0)) {
      throw new Error('Flat fee cannot be negative');
    }
    
    if (this.config.percentageRate < 0 || this.config.percentageRate > 1) {
      throw new Error('Percentage rate must be between 0 and 1 (0% - 100%)');
    }
    
    if (this.config.maxFeeLamports < BigInt(0)) {
      throw new Error('Maximum fee cannot be negative');
    }
    
    if (this.config.minFeeLamports < BigInt(0)) {
      throw new Error('Minimum fee cannot be negative');
    }
    
    if (this.config.minFeeLamports > this.config.maxFeeLamports) {
      throw new Error('Minimum fee cannot exceed maximum fee');
    }
    
    if (this.config.flatFeeLamports < this.config.minFeeLamports) {
      throw new Error('Flat fee cannot be less than minimum fee');
    }
    
    if (this.config.flatFeeLamports > this.config.maxFeeLamports) {
      throw new Error('Flat fee cannot exceed maximum fee');
    }
  }
  
  /**
   * Calculate platform fee for a swap
   * 
   * @param makerSolLamports - SOL amount offered by maker (in lamports)
   * @param takerSolLamports - SOL amount offered by taker (in lamports)
   * @returns Fee breakdown with detailed information
   */
  calculateFee(makerSolLamports: bigint, takerSolLamports: bigint): FeeBreakdown {
    // Calculate total SOL in the swap
    const totalSwapValueLamports = makerSolLamports + takerSolLamports;
    const totalSwapValueSol = this.lamportsToSol(totalSwapValueLamports);
    
    let feeLamports: bigint;
    let feeType: 'flat' | 'percentage';
    let rate: number;
    
    // Determine fee type based on SOL involvement
    if (totalSwapValueLamports === BigInt(0)) {
      // Pure NFT↔NFT or cNFT↔cNFT swap - use flat fee
      feeLamports = this.config.flatFeeLamports;
      feeType = 'flat';
      rate = this.lamportsToSol(this.config.flatFeeLamports);
    } else {
      // SOL is involved - use percentage fee
      const percentageFeeLamports = (totalSwapValueLamports * BigInt(Math.floor(this.config.percentageRate * 10000))) / BigInt(10000);
      feeLamports = percentageFeeLamports;
      feeType = 'percentage';
      rate = this.config.percentageRate;
    }
    
    // Apply minimum fee floor
    const beforeCap = feeLamports;
    if (feeLamports < this.config.minFeeLamports) {
      feeLamports = this.config.minFeeLamports;
    }
    
    // Apply maximum fee cap
    let wasCapped = false;
    if (feeLamports > this.config.maxFeeLamports) {
      feeLamports = this.config.maxFeeLamports;
      wasCapped = true;
    }
    
    const feeSol = this.lamportsToSol(feeLamports);
    
    console.log('[FeeCalculator] Fee calculation:', {
      makerSol: this.lamportsToSol(makerSolLamports),
      takerSol: this.lamportsToSol(takerSolLamports),
      totalSwapValueSol,
      feeType,
      feeSol,
      wasCapped,
    });
    
    return {
      feeLamports,
      feeSol,
      feeType,
      rate,
      totalSwapValueLamports,
      totalSwapValueSol,
      wasCapped,
    };
  }
  
  /**
   * Validate that a proposed fee is acceptable
   * 
   * @param proposedFeeLamports - Proposed fee amount in lamports
   * @param makerSolLamports - SOL amount offered by maker (in lamports)
   * @param takerSolLamports - SOL amount offered by taker (in lamports)
   * @returns true if fee is valid, false otherwise
   */
  validateFee(proposedFeeLamports: bigint, makerSolLamports: bigint, takerSolLamports: bigint): boolean {
    if (proposedFeeLamports < BigInt(0)) {
      console.warn('[FeeCalculator] Fee validation failed: negative fee');
      return false;
    }
    
    if (proposedFeeLamports > this.config.maxFeeLamports) {
      console.warn('[FeeCalculator] Fee validation failed: exceeds maximum');
      return false;
    }
    
    if (proposedFeeLamports < this.config.minFeeLamports) {
      console.warn('[FeeCalculator] Fee validation failed: below minimum');
      return false;
    }
    
    const calculated = this.calculateFee(makerSolLamports, takerSolLamports);
    
    // Allow proposed fee to match calculated fee (with small tolerance for rounding)
    const tolerance = BigInt(1000); // 0.000001 SOL tolerance
    const difference = proposedFeeLamports > calculated.feeLamports
      ? proposedFeeLamports - calculated.feeLamports
      : calculated.feeLamports - proposedFeeLamports;
    
    if (difference > tolerance) {
      console.warn('[FeeCalculator] Fee validation failed: does not match calculated fee', {
        proposed: this.lamportsToSol(proposedFeeLamports),
        calculated: calculated.feeSol,
        difference: this.lamportsToSol(difference),
      });
      return false;
    }
    
    return true;
  }
  
  /**
   * Get fee breakdown for a swap without SOL transfers (NFT-only)
   * Convenience method for common use case
   */
  getFlatFee(): FeeBreakdown {
    return this.calculateFee(BigInt(0), BigInt(0));
  }
  
  /**
   * Convert lamports to SOL (decimal)
   */
  lamportsToSol(lamports: bigint): number {
    return Number(lamports) / FeeCalculator.LAMPORTS_PER_SOL;
  }
  
  /**
   * Convert SOL (decimal) to lamports
   */
  solToLamports(sol: number): bigint {
    return BigInt(Math.floor(sol * FeeCalculator.LAMPORTS_PER_SOL));
  }
  
  /**
   * Get current fee configuration
   */
  getConfig(): Readonly<FeeConfig> {
    return Object.freeze({ ...this.config });
  }
  
  /**
   * Update fee configuration (creates new instance with updated config)
   */
  static withConfig(config: Partial<FeeConfig>): FeeCalculator {
    return new FeeCalculator(config);
  }
}

/**
 * Create default fee calculator instance
 */
export function createFeeCalculator(config?: Partial<FeeConfig>): FeeCalculator {
  return new FeeCalculator(config);
}

/**
 * Load fee configuration from environment variables
 */
export function loadFeeConfigFromEnv(): Partial<FeeConfig> {
  const config: Partial<FeeConfig> = {};
  
  if (process.env.PLATFORM_FEE_FLAT_LAMPORTS) {
    config.flatFeeLamports = BigInt(process.env.PLATFORM_FEE_FLAT_LAMPORTS);
  }
  
  if (process.env.PLATFORM_FEE_PERCENTAGE_RATE) {
    config.percentageRate = parseFloat(process.env.PLATFORM_FEE_PERCENTAGE_RATE);
  }
  
  if (process.env.PLATFORM_FEE_MAX_LAMPORTS) {
    config.maxFeeLamports = BigInt(process.env.PLATFORM_FEE_MAX_LAMPORTS);
  }
  
  if (process.env.PLATFORM_FEE_MIN_LAMPORTS) {
    config.minFeeLamports = BigInt(process.env.PLATFORM_FEE_MIN_LAMPORTS);
  }
  
  return config;
}

/**
 * Create fee calculator from environment variables
 */
export function createFeeCalculatorFromEnv(): FeeCalculator {
  const envConfig = loadFeeConfigFromEnv();
  return new FeeCalculator(envConfig);
}

