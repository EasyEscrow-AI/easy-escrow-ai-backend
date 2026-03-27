# CDP Settlement Authority Architecture

## Overview

The Coinbase Developer Platform (CDP) wallet serves as an independent settlement authority for institution escrows. When enabled, the CDP wallet replaces the platform admin as the on-chain `settlement_authority` for escrows that opt into the `cdp_policy_approval` release condition. This provides a hardware-level separation of concerns: the platform backend cannot unilaterally release or cancel funds, because the CDP wallet's TEE-secured policy engine must independently approve every signing request.

No changes to the on-chain Solana program are required. The existing `settlement_authority: Pubkey` field on the `InstitutionEscrow` PDA already supports any signer -- we simply set it to the CDP wallet's public key instead of the admin's.

## Integration with the On-Chain Program

### Existing PDA Structure

The `InstitutionEscrow` account stores:

```rust
pub settlement_authority: Pubkey,  // whoever can release/cancel funds
```

The `ReleaseInstitutionEscrow` instruction enforces:

```rust
constraint = escrow_state.settlement_authority == authority.key()
```

When CDP is disabled (default), `settlement_authority` is the platform admin keypair. When CDP is enabled and the escrow includes `cdp_policy_approval`, `settlement_authority` is the CDP wallet's Solana public key. The program does not distinguish between the two -- it only checks that the signer matches.

### Settlement Authority Resolution

At escrow creation (and at `fundEscrow` for draft escrows), the service resolves the settlement authority:

1. Default: the platform admin wallet or the client's configured settlement wallet
2. If `releaseConditions` includes `cdp_policy_approval`:
   - Verify `CDP_ENABLED=true` (throw if not)
   - Call `getCdpSettlementService().getPublicKey()` to get the CDP wallet address
   - Override `settlementAuthority` with the CDP wallet address
3. The resolved authority is written to both the database (`institution_escrows.settlement_authority`) and the on-chain PDA

## Multi-Sign Transaction Flow

CDP-protected escrows use a two-signer pattern: the platform admin pays transaction fees, and the CDP wallet signs as the settlement authority.

### Release Flow

```text
1. Backend builds the release instruction
   - authority = CDP wallet pubkey (matches escrow PDA's settlement_authority)
   - feePayer = admin keypair

2. Admin partially signs the transaction (fee payer signature)

3. Serialize with requireAllSignatures: false

4. Send serialized tx to CDP SDK: account.signTransaction({ transaction })
   - CDP's TEE-secured policy engine validates the operation
   - If policy passes, CDP adds its signature
   - If policy fails, signing is refused (transaction cannot be submitted)

5. Submit the fully-signed transaction to Solana RPC
```

Implementation: `InstitutionEscrowProgramService.releaseEscrowWithCdp()` in `src/services/institution-escrow-program.service.ts`.

### Cancel Flow

Same multi-sign pattern as release. The on-chain program's `CancelInstitutionEscrow` instruction checks:

```rust
let is_settlement_authority = caller == escrow_state.settlement_authority;
let is_payer = caller == escrow_state.payer;
let is_expired = clock.unix_timestamp > escrow_state.expiry_timestamp;

require!(is_settlement_authority || (is_payer && is_expired));
```

When CDP is the settlement authority:

- **Non-expired escrows:** Only the CDP wallet can cancel (admin cannot). The platform calls `cancelEscrowWithCdp()` which routes through CDP's policy engine.
- **Expired escrows:** The original payer can also cancel (self-service refund), bypassing CDP entirely. This is enforced on-chain.

Implementation: `InstitutionEscrowProgramService.cancelEscrowWithCdp()` in `src/services/institution-escrow-program.service.ts`.

## CDP Policy Engine

### TEE-Secured Keys

CDP wallet private keys are generated and stored inside a Trusted Execution Environment (TEE). The key material never leaves the enclave:

- The platform backend never has access to the CDP wallet's private key
- Coinbase infrastructure operators cannot extract the key
- Signing requests are validated against the policy engine before the TEE produces a signature

### Policy Validation at Signing Time

When the backend sends a partially-signed transaction to CDP, the policy engine evaluates it before signing. The policy can enforce constraints such as:

- Allowed program IDs — CDP-signed transactions may contain instructions for: the EasyEscrow program, the SPL Token program, the Associated Token Account (ATA) program, the System program, and the SPL Memo program. Operators must permit all of these in the CDP policy evaluation to avoid valid settlements failing.
- Allowed instruction types (only release/cancel)
- Transaction value limits
- Rate limits on signing frequency
- Time-of-day restrictions

If the policy check fails, CDP refuses to sign, and the transaction cannot be submitted to Solana. This provides a hard guarantee that the backend alone cannot move funds.

### Health Check

The `CdpSettlementService.isHealthy()` method verifies that the CDP service is reachable and the account is accessible. This is called during the AI release condition check for `cdp_policy_approval` to ensure the authority is available before attempting settlement.

## Feature Gating (Double-Gate)

CDP settlement uses two independent gates that must both be satisfied:

### Gate 1: Environment Flag

```dotenv
CDP_ENABLED=true
```

Controls whether the CDP service is initialized at all. When `false`, any escrow attempting to use `cdp_policy_approval` will throw at creation time. Validated at startup by `validateCdpConfig()` in `src/config/institution-escrow.config.ts`.

### Gate 2: Per-Escrow Release Condition

```typescript
releaseConditions: ['cdp_policy_approval', ...]
```

Each escrow individually opts in by including `cdp_policy_approval` in its `releaseConditions` array. Escrows without this condition use the standard admin-signed path even when CDP is globally enabled.

### Combined Effect

| CDP_ENABLED | cdp_policy_approval in releaseConditions | Settlement Authority |
|-------------|------------------------------------------|---------------------|
| `false`     | not present                              | Admin wallet        |
| `false`     | present                                  | Error at creation   |
| `true`      | not present                              | Admin wallet        |
| `true`      | present                                  | CDP wallet          |

This double-gate ensures that (a) the infrastructure must be configured before any escrow can use it, and (b) each escrow explicitly opts in, so existing escrows are unaffected when CDP is enabled.

## Transaction Pool Interaction

When a CDP-protected escrow is a member of a transaction pool, the CDP signing path is invoked during pool settlement.

The pool settlement flow for each member calls `escrowService.releaseFunds()`. Inside `releaseFunds()`, the code checks:

```typescript
const useCdpRelease = ((escrow.releaseConditions as string[]) || [])
  .includes('cdp_policy_approval');
```

If true, the release routes through `releaseEscrowWithCdp()` (the multi-sign path). This means a single pool can contain a mix of CDP-protected and standard escrows -- each member follows its own release path based on its `releaseConditions`.

Pool-level operations that interact with CDP:

| Operation      | CDP Behavior                                                       |
|----------------|--------------------------------------------------------------------|
| `settlePool`   | Each member's `releaseFunds()` routes through CDP when applicable |
| `retryFailed`  | Failed CDP members retry through the same CDP signing path        |
| `cancelPool`   | CDP-protected members require CDP cancel signature (non-expired)  |

## Security Model

### Trust Boundaries

```text
Platform Backend (our infra)
  - Builds transactions, manages state, pays fees
  - Cannot sign as settlement authority for CDP escrows
  - Cannot extract CDP private key

CDP TEE (Coinbase infra)
  - Holds the settlement authority private key
  - Validates policy before signing
  - Cannot initiate transactions (only responds to signing requests)

Solana Program (on-chain)
  - Enforces settlement_authority == signer
  - Does not know or care whether signer is admin or CDP
```

### What CDP Prevents

- **Unauthorized release:** Backend cannot release funds without CDP co-signing
- **Unauthorized cancel:** Backend cannot cancel non-expired escrows without CDP
- **Key compromise:** Even if the backend server is compromised, the attacker cannot sign as the CDP authority
- **Insider threat:** Even Coinbase operators cannot extract the key from the TEE or bypass the policy engine

### What CDP Does Not Prevent

- **Expired escrow refunds:** The payer can always cancel after expiry (enforced on-chain, bypasses CDP)
- **Backend state manipulation:** The backend controls off-chain state (DB records, status transitions). CDP only gates on-chain fund movement.

## Environment Configuration

| Variable             | Required (when CDP enabled) | Description                                          |
|----------------------|-----------------------------|------------------------------------------------------|
| `CDP_ENABLED`        | Yes                         | Feature flag. Set to `true` to enable CDP settlement |
| `CDP_API_KEY_ID`     | Yes                         | CDP API key identifier                               |
| `CDP_API_KEY_SECRET` | Yes                         | CDP API key secret                                   |
| `CDP_WALLET_SECRET`  | Yes                         | CDP wallet secret for key derivation                 |
| `CDP_ACCOUNT_NAME`   | No (has default)            | Named Solana account within the CDP wallet           |

All four credentials are validated at startup when `CDP_ENABLED=true`. Missing credentials cause a startup failure with a descriptive error message. See `validateCdpConfig()` in `src/config/institution-escrow.config.ts`.

## Source Files

| File                                                | Purpose                                              |
|-----------------------------------------------------|------------------------------------------------------|
| `src/services/cdp-settlement.service.ts`            | CDP SDK wrapper: account management, tx signing      |
| `src/services/institution-escrow.service.ts`        | Settlement authority resolution, release/cancel routing |
| `src/services/institution-escrow-program.service.ts`| Multi-sign tx building: `releaseEscrowWithCdp()`, `cancelEscrowWithCdp()` |
| `src/config/institution-escrow.config.ts`           | CDP config loading and validation                    |
| `programs/escrow/src/instructions/institution_escrow.rs` | On-chain settlement_authority enforcement       |
