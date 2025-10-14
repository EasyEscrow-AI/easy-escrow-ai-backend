# Task 28: Agreement Query and Cancel Endpoints - Testing Guide

## Overview
This document provides comprehensive testing instructions for the enhanced agreement query endpoint and new cancellation endpoint implemented in Task 28.

## Prerequisites
- Backend server running on `http://localhost:3000`
- Database properly configured and running
- At least one test agreement created

## Test Scenarios

### Scenario 1: Enhanced Agreement Query

#### Test 1.1: Get Agreement with Deposits
**Objective:** Verify enhanced GET endpoint returns detailed information including deposits and balances.

**Steps:**
1. Create an agreement (save the agreementId)
2. Query the agreement

**PowerShell:**
```powershell
# Create agreement
$body = @{
  nft_mint = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
  price = 100.50
  seller = "SellerPublicKey11111111111111111111111111111"
  buyer = "BuyerPublicKey111111111111111111111111111111"
  expiry = "2025-12-31T23:59:59Z"
  fee_bps = 250
  honor_royalties = $true
} | ConvertTo-Json

$agreement = Invoke-RestMethod -Uri "http://localhost:3000/v1/agreements" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body

# Get agreement details
$details = Invoke-RestMethod -Uri "http://localhost:3000/v1/agreements/$($agreement.data.agreementId)"

# Display results
$details.data | ConvertTo-Json -Depth 10
```

**Expected Response:**
- ✅ Status 200 OK
- ✅ Response includes all standard agreement fields
- ✅ `deposits` array is present (may be empty if no deposits yet)
- ✅ `balances` object with `usdcLocked`, `nftLocked`, `actualUsdcAmount`
- ✅ `isExpired` boolean field
- ✅ `canBeCancelled` boolean field

**Validation:**
```powershell
# Check response structure
$details.success -eq $true
$details.data.deposits -is [Array]
$details.data.balances.usdcLocked -is [Boolean]
$details.data.balances.nftLocked -is [Boolean]
$details.data.isExpired -is [Boolean]
$details.data.canBeCancelled -is [Boolean]
```

#### Test 1.2: Get Non-Existent Agreement
**Objective:** Verify proper 404 error handling.

**PowerShell:**
```powershell
try {
  Invoke-RestMethod -Uri "http://localhost:3000/v1/agreements/INVALID-ID"
} catch {
  $error = $_.ErrorDetails.Message | ConvertFrom-Json
  $error | ConvertTo-Json
}
```

**Expected Response:**
- ✅ Status 404 Not Found
- ✅ Error message: "Agreement not found"

---

### Scenario 2: Agreement Cancellation

#### Test 2.1: Cancel Expired Agreement (Happy Path)
**Objective:** Successfully cancel an agreement that has expired.

**Steps:**
1. Create agreement with past expiry date
2. Attempt to cancel it

**PowerShell:**
```powershell
# Create agreement with past expiry
$body = @{
  nft_mint = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
  price = 100.50
  seller = "SellerPublicKey11111111111111111111111111111"
  buyer = "BuyerPublicKey111111111111111111111111111111"
  expiry = "2025-10-01T00:00:00Z"  # Past date
  fee_bps = 250
  honor_royalties = $true
} | ConvertTo-Json

$agreement = Invoke-RestMethod -Uri "http://localhost:3000/v1/agreements" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body

# Cancel the agreement
$cancelResult = Invoke-RestMethod `
  -Uri "http://localhost:3000/v1/agreements/$($agreement.data.agreementId)/cancel" `
  -Method Post

$cancelResult | ConvertTo-Json -Depth 5
```

**Expected Response:**
- ✅ Status 200 OK
- ✅ `data.status` = "CANCELLED"
- ✅ `data.cancelledAt` timestamp present
- ✅ `data.message` confirmation message

**Validation:**
```powershell
$cancelResult.success -eq $true
$cancelResult.data.status -eq "CANCELLED"
$cancelResult.data.cancelledAt -ne $null
```

#### Test 2.2: Try to Cancel Non-Expired Agreement
**Objective:** Verify cancellation is blocked for non-expired agreements.

**PowerShell:**
```powershell
# Create agreement with future expiry
$body = @{
  nft_mint = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
  price = 100.50
  seller = "SellerPublicKey11111111111111111111111111111"
  expiry = "2025-12-31T23:59:59Z"  # Future date
  fee_bps = 250
  honor_royalties = $true
} | ConvertTo-Json

$agreement = Invoke-RestMethod -Uri "http://localhost:3000/v1/agreements" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body

# Try to cancel
try {
  Invoke-RestMethod `
    -Uri "http://localhost:3000/v1/agreements/$($agreement.data.agreementId)/cancel" `
    -Method Post
} catch {
  $error = $_.ErrorDetails.Message | ConvertFrom-Json
  $error | ConvertTo-Json
}
```

**Expected Response:**
- ✅ Status 400 Bad Request
- ✅ Error message: "Agreement has not expired yet. Cannot cancel before expiry."

#### Test 2.3: Try to Cancel Already Cancelled Agreement
**Objective:** Verify double-cancellation is prevented.

**PowerShell:**
```powershell
# Use previously cancelled agreement
$agreementId = $agreement.data.agreementId

# Try to cancel again
try {
  Invoke-RestMethod `
    -Uri "http://localhost:3000/v1/agreements/$agreementId/cancel" `
    -Method Post
} catch {
  $error = $_.ErrorDetails.Message | ConvertFrom-Json
  $error | ConvertTo-Json
}
```

**Expected Response:**
- ✅ Status 400 Bad Request
- ✅ Error message: "Agreement is already cancelled"

#### Test 2.4: Try to Cancel Non-Existent Agreement
**Objective:** Verify proper 404 handling.

**PowerShell:**
```powershell
try {
  Invoke-RestMethod `
    -Uri "http://localhost:3000/v1/agreements/INVALID-ID/cancel" `
    -Method Post
} catch {
  $error = $_.ErrorDetails.Message | ConvertFrom-Json
  $error | ConvertTo-Json
}
```

**Expected Response:**
- ✅ Status 404 Not Found
- ✅ Error message: "Agreement not found"

---

### Scenario 3: Integration Tests

#### Test 3.1: Complete Workflow
**Objective:** Test complete agreement lifecycle with query and cancel.

**PowerShell:**
```powershell
# 1. Create expired agreement
$createBody = @{
  nft_mint = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
  price = 50.25
  seller = "SellerPubKey123"
  expiry = "2025-09-01T00:00:00Z"  # Expired
  fee_bps = 250
  honor_royalties = $true
} | ConvertTo-Json

$created = Invoke-RestMethod -Uri "http://localhost:3000/v1/agreements" `
  -Method Post -ContentType "application/json" -Body $createBody

Write-Host "✓ Created agreement: $($created.data.agreementId)"

# 2. Query agreement details
$details = Invoke-RestMethod -Uri "http://localhost:3000/v1/agreements/$($created.data.agreementId)"
Write-Host "✓ Status: $($details.data.status)"
Write-Host "✓ Is Expired: $($details.data.isExpired)"
Write-Host "✓ Can Be Cancelled: $($details.data.canBeCancelled)"

# 3. Cancel agreement
$cancelled = Invoke-RestMethod `
  -Uri "http://localhost:3000/v1/agreements/$($created.data.agreementId)/cancel" `
  -Method Post

Write-Host "✓ Cancelled at: $($cancelled.data.cancelledAt)"

# 4. Query again to verify cancellation
$afterCancel = Invoke-RestMethod `
  -Uri "http://localhost:3000/v1/agreements/$($created.data.agreementId)"

Write-Host "✓ New status: $($afterCancel.data.status)"
Write-Host "✓ Can still be cancelled: $($afterCancel.data.canBeCancelled)"

# Verify final state
if ($afterCancel.data.status -eq "CANCELLED" -and $afterCancel.data.canBeCancelled -eq $false) {
  Write-Host "`n✅ Integration test PASSED"
} else {
  Write-Host "`n❌ Integration test FAILED"
}
```

**Expected Results:**
1. ✅ Agreement created successfully
2. ✅ Initial query shows `isExpired: true`, `canBeCancelled: true`
3. ✅ Cancellation succeeds
4. ✅ Post-cancel query shows `status: CANCELLED`, `canBeCancelled: false`

---

## Automated Test Suite

### Unit Tests (Recommended)

Create `tests/agreement-cancel.test.ts`:

```typescript
import { cancelAgreement, getAgreementDetailById } from '../src/services/agreement.service';

describe('Agreement Cancellation', () => {
  test('should cancel expired agreement', async () => {
    // Test implementation
  });

  test('should reject cancellation of non-expired agreement', async () => {
    // Test implementation
  });

  test('should reject double cancellation', async () => {
    // Test implementation
  });
});

describe('Agreement Detail Query', () => {
  test('should return agreement with deposits', async () => {
    // Test implementation
  });

  test('should calculate balances correctly', async () => {
    // Test implementation
  });

  test('should determine expiry status correctly', async () => {
    // Test implementation
  });
});
```

---

## Performance Tests

### Load Test: Concurrent Queries
```powershell
# Test concurrent agreement queries
$jobs = 1..10 | ForEach-Object {
  Start-Job -ScriptBlock {
    Invoke-RestMethod -Uri "http://localhost:3000/v1/agreements/$using:agreementId"
  }
}

$results = $jobs | Wait-Job | Receive-Job
$results | Measure-Object -Property success -Sum
```

**Expected:**
- ✅ All requests complete successfully
- ✅ Response time < 200ms per request

---

## Edge Cases

### Edge Case 1: Agreement at Exact Expiry Time
Test behavior when current time equals expiry time.

### Edge Case 2: Multiple Deposits
Verify correct balance calculation with multiple USDC deposits.

### Edge Case 3: Failed Deposits
Check that failed deposits don't affect `usdcLocked`/`nftLocked` status.

---

## Regression Tests

Verify that existing functionality still works:
1. ✅ POST /v1/agreements (creation) still works
2. ✅ GET /v1/agreements (list) still works
3. ✅ Health check endpoint still works

---

## Test Results Template

```
Task 28 Testing Results
Date: [DATE]
Tester: [NAME]

Scenario 1: Enhanced Agreement Query
- Test 1.1: [ ] PASS [ ] FAIL
- Test 1.2: [ ] PASS [ ] FAIL

Scenario 2: Agreement Cancellation
- Test 2.1: [ ] PASS [ ] FAIL
- Test 2.2: [ ] PASS [ ] FAIL
- Test 2.3: [ ] PASS [ ] FAIL
- Test 2.4: [ ] PASS [ ] FAIL

Scenario 3: Integration Tests
- Test 3.1: [ ] PASS [ ] FAIL

Performance:
- Average response time: ___ ms
- Concurrent requests: [ ] PASS [ ] FAIL

Overall Status: [ ] ALL TESTS PASSED [ ] FAILURES DETECTED

Notes:
[Additional observations]
```

---

## Troubleshooting

### Issue: "Agreement not found" for valid ID
**Solution:** Check database connection and verify agreement exists in database.

### Issue: Cancellation not working
**Solution:** Verify system clock is accurate and agreement expiry is truly in the past.

### Issue: Balance information missing
**Solution:** Ensure deposit monitoring service is running and has processed deposits.

---

## Next Steps After Testing

1. Run all tests and document results
2. Fix any bugs discovered
3. Create pull request with test results
4. Deploy to staging environment
5. Perform end-to-end testing with frontend

