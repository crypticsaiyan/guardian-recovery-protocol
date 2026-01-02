# Guardian Recovery Protocol - Issues and Fixes

## Issue 1: Deploy Submission Error ✅ FIXED

### Problem
The frontend was failing to submit the deploy with error: "Failed to submit deploy"

### Root Cause
The signature from Casper Wallet was not being properly added to the deploy. The code was trying to use `DeployUtil.setSignature()` which expects a `Uint8Array`, but we were passing a hex string.

### Solution
Fixed the signature handling in `/frontend/app/setup/page.tsx`:
- Properly prefix the signature with the algorithm tag (01 for Ed25519, 02 for Secp256k1)
- Manually construct the approval object and add it to the deploy's approvals array
- This matches the approach from your previous Casper Wallet integration work

## Issue 2: Incomplete Implementation vs Plan ⚠️ NEEDS ATTENTION

### According to Your Plan (plan.md)

The guardian recovery setup should have TWO steps:

#### Step 0: Register Guardians (Currently Implemented ✅)
```
User calls: recovery_registry.register_account(
  user_account,
  guardians = [G1, G2, G3],
  threshold = 2
)
```
- Contract stores guardians list, threshold, voting weights
- ⚠️ **Still no power here — just data**

#### Step 1: PRE-AUTHORIZE Recovery (NOT Implemented ❌)
```
User adds guardian keys as associated keys
Sets: key_management_threshold = 2
```

**Result should be:**
| Key | Weight |
|-----|--------|
| User old key | 1 |
| Guardian 1 | 1 |
| Guardian 2 | 1 |
| Guardian 3 | 1 |
| Threshold | 2 |

**Meaning:**
- No single guardian can change keys alone
- No single attacker can change keys alone
- Guardians can jointly execute recovery

### Current Implementation Gap

Your current setup page ONLY does Step 0 (register guardians in contract).

It does NOT do Step 1 (add guardians as associated keys with proper thresholds).

This means:
- ✅ Guardians are registered in the contract
- ❌ Guardians have NO actual power to execute recovery
- ❌ If user loses their key, guardians CANNOT help

### What Needs to Be Done

To follow your plan, the setup flow should be:

1. **Register Guardians** (current implementation)
   - Call `recovery_registry.register_account()`
   - Sign with user's key
   - Submit to network

2. **Add Guardian Keys** (MISSING)
   - For each guardian, call `add_associated_key.wasm`
   - Set weight = 1 for each guardian
   - Sign with user's key

3. **Update Thresholds** (MISSING)
   - Call `update_thresholds.wasm`
   - Set `key_management_threshold = 2`
   - Set `deployment_threshold = 1` (or as needed)
   - Sign with user's key

### Recommended Approach

You have two options:

#### Option A: Multi-Step Setup (Recommended)
Create a wizard-style setup with 3 steps:
1. Register guardians in contract
2. Add guardian keys to account
3. Update account thresholds

This is clearer and allows users to understand each step.

#### Option B: Single Transaction
Combine all three operations into a single transaction that:
1. Registers guardians
2. Adds all guardian keys
3. Updates thresholds

This is simpler UX but requires more complex backend logic.

## Issue 3: Missing Session WASM Calls

Your backend has the functions to build these deploys:
- `sessionService.buildAddKeyDeploy()` ✅
- `sessionService.buildUpdateThresholdsDeploy()` ✅

But the frontend doesn't call them during setup.

## Next Steps

1. **Test Current Fix**: Try registering guardians again. The signature error should be fixed.

2. **Decide on Approach**: Choose Option A or Option B above.

3. **Implement Missing Steps**: Add the guardian key addition and threshold update steps.

4. **Update UI**: Make it clear to users what each step does and why it's important.

## Security Note

According to your plan:
- **Contract layer**: Social consensus (who are the guardians)
- **Frontend layer**: UX gating (nice UI)
- **Casper Runtime layer**: Cryptographic authority (actual security) ✅

The real security comes from the account's associated keys and thresholds, NOT just the contract registration. That's why Step 1 is critical.
