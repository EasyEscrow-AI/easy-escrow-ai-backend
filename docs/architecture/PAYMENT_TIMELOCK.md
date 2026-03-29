# Payment Timelock

Configurable cooling-off period between escrow funding and release. Prevents immediate release after deposit, giving parties a dispute window and satisfying regulatory hold requirements.

## Design

**Backend-enforced** — no on-chain program changes. Since CDP is the settlement authority and only the backend can request CDP signing, a backend-enforced timelock is equally secure. Future on-chain hardening can be done in a major program upgrade.

## How It Works

1. **Create escrow** — `timelockHours` is resolved from: per-escrow value > per-client `defaultTimelockHours` setting > global `INSTITUTION_ESCROW_DEFAULT_TIMELOCK_HOURS` env (default 0 = disabled)
2. **Record deposit** — `unlockAt` is computed as `fundedAt + timelockHours` and stored on the escrow
3. **Release funds** — blocked if `unlockAt` is in the future; `forceRelease: true` overrides with audit trail
4. **Fulfill escrow** — AI auto-release is deferred when timelock is active; escrow stays in `PENDING_RELEASE`

## Configuration

| Level | Field | Default | Description |
|-------|-------|---------|-------------|
| Global | `INSTITUTION_ESCROW_DEFAULT_TIMELOCK_HOURS` env | `0` | Applied when no per-escrow or per-client value is set |
| Per-client | `defaultTimelockHours` in `InstitutionClientSettings` | `null` | Set via `PATCH /api/v1/institution/settings` |
| Per-escrow | `timelockHours` in create/draft request body | not set | Overrides all defaults. `0` = explicitly disabled |

## Validation

- `timelockHours` must be 0–72 (hours)
- `timelockHours` must be less than `expiryHours` (prevents un-releasable escrows)
- `0` = disabled (no timelock applied)

## Database Fields

| Table | Column | Type | Description |
|-------|--------|------|-------------|
| `institution_escrows` | `timelock_hours` | `INT?` | Resolved timelock value stored at creation |
| `institution_escrows` | `unlock_at` | `TIMESTAMP?` | Computed at deposit: `funded_at + timelock_hours` |
| `institution_client_settings` | `default_timelock_hours` | `INT?` | Client-level default |

Index: `idx_inst_escrow_unlock_at` on `unlock_at`.

## API

### Request Fields

| Endpoint | Field | Type | Description |
|----------|-------|------|-------------|
| `POST /institution-escrow` | `timelockHours` | `int? (0-72)` | Optional cooling-off period |
| `POST /institution-escrow/draft` | `timelockHours` | `int? (0-72)` | Optional, stored on draft |
| `PUT /institution-escrow/:id/draft` | `timelockHours` | `int? (0-72)` | Update draft timelock |
| `POST /institution-escrow/:id/release` | `forceRelease` | `bool?` | Override active timelock |

### Response

Escrow responses include a `timelock` section when configured:

```json
{
  "timelock": {
    "hours": 24,
    "unlockAt": "2026-03-30T10:00:00.000Z",
    "isLocked": true
  }
}
```

`timelock` is `null` when no timelock is configured. `statusLabel` returns `"Funded — Timelock Active"` when locked.

## Audit Trail

| Action | When |
|--------|------|
| `TIMELOCK_SET` | Deposit recorded with active timelock |
| `TIMELOCK_OVERRIDE` | `forceRelease` used to bypass active timelock |
| `TIMELOCK_DEFERRED` | AI auto-release deferred due to active timelock |
