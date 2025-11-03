# BETA Launch Limits

**Status:** Active (BETA Period)  
**Last Updated:** November 3, 2024  
**Review Date:** After BETA Period

---

## Overview

During the BETA launch period, EasyEscrow.ai enforces minimum and maximum transaction limits to ensure platform stability and manage risk while gathering user feedback.

These limits apply to all escrow agreements and are enforced both at the API level and on-chain in the smart contract.

---

## Current Limits

| Limit Type | Amount | Reason |
|------------|--------|--------|
| **Minimum** | $1.00 USD | Ensures meaningful transactions, prevents spam/abuse |
| **Maximum** | $3,000.00 USD | Conservative risk management during BETA, gradual scaling approach |

---

## Implementation Details

### Backend Validation

**File:** `src/models/validators/solana.validator.ts`

```typescript
export const ESCROW_LIMITS = {
  MIN_USDC: 1.0,      // $1.00 minimum
  MAX_USDC: 3000.0,   // $3,000.00 maximum
} as const;
```

The `isValidUSDCAmount()` function validates amounts against these limits before allowing agreement creation.

**Error Message:**
```
Price must be between $1.00 and $3,000.00 (BETA limits)
```

### Smart Contract Validation

**File:** `programs/escrow/src/lib.rs`

USDC has 6 decimals, so amounts are represented in lamports:

```rust
const MIN_USDC_AMOUNT: u64 = 1_000_000;      // $1.00
const MAX_USDC_AMOUNT: u64 = 3_000_000_000;  // $3,000.00
```

The smart contract enforces these limits during escrow initialization:

```rust
require!(usdc_amount >= MIN_USDC_AMOUNT, EscrowError::AmountTooLow);
require!(usdc_amount <= MAX_USDC_AMOUNT, EscrowError::AmountTooHigh);
```

**On-Chain Error Messages:**
- `AmountTooLow`: "Amount below minimum: $1.00 (BETA limit)"
- `AmountTooHigh`: "Amount exceeds maximum: $3,000.00 (BETA limit)"

---

## Testing Coverage

**Test File:** `tests/unit/amount-validation.test.ts`

Comprehensive test suite covering:
- ✅ Minimum limit validation ($1.00)
- ✅ Maximum limit validation ($3,000.00)
- ✅ Boundary value testing (exactly at limits)
- ✅ Valid range testing
- ✅ Edge cases (NaN, Infinity, negative values)
- ✅ Different input types (number, string, Decimal)

**Run tests:**
```bash
npm run test:unit:amount-validation
```

---

## User Experience

### API Response Examples

**Request Below Minimum ($0.50):**
```json
{
  "success": false,
  "error": "Validation Error",
  "message": "Price must be between $1.00 and $10,000.00 (BETA limits)",
  "timestamp": "2024-11-03T12:00:00.000Z"
}
```

**Request Above Maximum ($15,000):**
```json
{
  "success": false,
  "error": "Validation Error",
  "message": "Price must be between $1.00 and $10,000.00 (BETA limits)",
  "timestamp": "2024-11-03T12:00:00.000Z"
}
```

**Valid Request ($5,000):**
```json
{
  "success": true,
  "data": {
    "agreementId": "...",
    "escrowPda": "...",
    "price": "5000.00",
    ...
  }
}
```

---

## Rationale

### Why $1.00 Minimum?

1. **Meaningful Transactions**: Ensures users are creating real escrows, not testing/spam
2. **Fee Coverage**: Platform fees and transaction costs make sense at this level
3. **UX Quality**: Prevents confusion from micro-transactions
4. **Network Efficiency**: Reduces unnecessary blockchain transactions

### Why $10,000 Maximum?

1. **Risk Management**: Conservative approach during BETA testing period
2. **Gradual Scaling**: Allows us to:
   - Monitor platform behavior under load
   - Gather user feedback
   - Identify edge cases
   - Ensure security measures are robust
3. **BETA User Protection**: Limits exposure for early adopters
4. **Operational Capacity**: Ensures customer support can handle disputes effectively

---

## Future Adjustments

### Post-BETA Plans

After the BETA period, we plan to:

1. **Analyze Data**
   - Transaction patterns
   - User feedback
   - System performance
   - Security incidents

2. **Increase Limits** (likely scenarios):
   - Raise maximum to $50,000 - $100,000
   - Keep minimum at $1.00 or adjust based on usage patterns

3. **Tiered Limits** (potential):
   - Basic accounts: $1 - $10,000
   - Verified accounts: $1 - $100,000
   - Enterprise accounts: Custom limits

### Timeline

Limits will be reassessed:
- **During BETA**: Monthly reviews of transaction data
- **Post-BETA**: Major review before mainnet launch
- **Ongoing**: Quarterly reviews for adjustments

---

## For Developers

### Modifying Limits

To update these limits in the future:

1. **Backend:**
   - Update `ESCROW_LIMITS` in `src/models/validators/solana.validator.ts`
   - Run tests: `npm run test:unit:amount-validation`

2. **Smart Contract:**
   - Update constants in `programs/escrow/src/lib.rs`:
     - `MIN_USDC_AMOUNT`
     - `MAX_USDC_AMOUNT`
   - Rebuild all environments:
     ```bash
     npm run solana:build:devnet
     npm run solana:build:staging
     npm run solana:build:mainnet
     ```
   - Redeploy programs to all networks

3. **Documentation:**
   - Update this file
   - Update API documentation
   - Update user-facing documentation

4. **Testing:**
   - Update test cases in `tests/unit/amount-validation.test.ts`
   - Run full test suite
   - Test on devnet before deploying

### USDC Decimal Conversion

Remember: **1 USDC = 1,000,000 lamports (6 decimals)**

**Conversion formulas:**
- USD to lamports: `amount_usd * 1_000_000`
- Lamports to USD: `amount_lamports / 1_000_000`

**Examples:**
- $1.00 = 1,000,000 lamports
- $100.50 = 100,500,000 lamports
- $3,000.00 = 3,000,000,000 lamports

---

## Support & Questions

For questions about these limits:
- **Technical:** See implementation files listed above
- **Business:** Contact product team for limit adjustment requests
- **Users:** Support documentation will explain limits clearly

---

## Related Documentation

- [API Documentation](./api/SWAGGER_API.md)
- [Smart Contract Documentation](./architecture/SMART_CONTRACT_ARCHITECTURE.md)
- [Testing Documentation](../tests/README.md)
- [Deployment Guide](./deployment/DEPLOYMENT_GUIDE.md)

---

**Note:** This document should be updated whenever limits are modified. Always maintain consistency between backend validation, smart contract validation, tests, and documentation.

