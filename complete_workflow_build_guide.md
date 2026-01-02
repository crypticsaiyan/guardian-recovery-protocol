# Complete Workflow: What to Build & When to Sign (Step-by-Step Scenarios)

---

## Overview: Your Protocol Architecture

```
┌──────────────────────────────────────────────────┐
│         YOUR DAPP WEBSITE (React)                │
│  - Guardian setup UI                            │
│  - Recovery initiation UI                       │
│  - Guardian approval dashboard                  │
│  - Status tracking                              │
└────────────┬─────────────────────────────────────┘
             ↓
┌──────────────────────────────────────────────────┐
│    YOUR SMART CONTRACT (Rust on Casper)         │
│  - Guardian registry storage                    │
│  - Recovery request tracking                    │
│  - Approval counting                            │
│  - Key rotation execution                       │
└────────────┬─────────────────────────────────────┘
             ↓
┌──────────────────────────────────────────────────┐
│         CASPER WALLET (Browser Extension)       │
│  - Signs when user clicks approve               │
│  - Manages keys locally                         │
│  - Provides signature                           │
└────────────┬─────────────────────────────────────┘
             ↓
┌──────────────────────────────────────────────────┐
│      CASPER NETWORK (Blockchain)                │
│  - Executes smart contract calls                │
│  - Verifies signatures                          │
│  - Rotates keys                                 │
└──────────────────────────────────────────────────┘
```

---

# SCENARIO 1: USER HAS THEIR PRIMARY KEY (SETUP PHASE)

## User Journey: "I want to set up recovery"

---

## Step 1: User Visits Your Website

```
Alice: Opens your dApp website
Your Website: Shows "Welcome to Guardian Recovery"
Your Website: Displays "Connect Wallet" button
```

### What Alice Sees
```
┌─────────────────────────────────┐
│   Guardian Recovery Protocol    │
│                                 │
│  [Connect Wallet] Button        │
│                                 │
│  Setup recovery with trusted    │
│  guardians for your account     │
└─────────────────────────────────┘
```

---

## Step 2: Alice Connects Casper Wallet

```
Alice: Clicks "Connect Wallet"
Casper Wallet: Pops up
Alice: Selects account (e.g., alice@hash123)
Alice: Clicks "Approve" in Casper Wallet

Your Website: Gets Alice's public key
Your Website: Shows "Connected as alice@hash123"
```

### What Happens Behind Scenes
```
Frontend Code:
  const wallet = window.casperWallet;
  const response = await wallet.requestConnection();
  const publicKey = response.publicKey;
  // Now you know who Alice is
```

### No Wallet Signature Yet
⚠️ **Just connecting the wallet - NO SIGNING happens here**

---

## Step 3: Alice Sets Up Guardians (THIS IS THE FIRST SIGNATURE POINT)

```
Your Website: Shows form
  "Enter Guardian 1 Public Key: ___________"
  "Enter Guardian 2 Public Key: ___________"
  "Enter Guardian 3 Public Key: ___________"
  "Threshold: 3" (need all 3 to approve)
  
Alice: Enters 3 friends' public keys
Alice: Clicks "Save Guardians" button

👇👇👇 CASPER WALLET POPUP 👇👇👇
```

### SIGNATURE POINT #1: Setting Up Guardians

```
Casper Wallet Pops Up:
┌──────────────────────────────────────────┐
│  Sign with Casper Wallet?               │
│                                          │
│  Contract: GuardianRecovery             │
│  Function: set_guardians                │
│  Args:                                   │
│    - guardians: [0x123, 0x456, 0x789]  │
│    - threshold: 3                       │
│                                          │
│  [Approve] [Reject]                     │
└──────────────────────────────────────────┘

Alice: Enters Casper Wallet password
Alice: Clicks "Approve"
Casper Wallet: Signs transaction with Alice's primary key

✅ Transaction Submitted to Casper Network
✅ Smart Contract Stores: "Alice's guardians are 0x123, 0x456, 0x789"
✅ Your Database Logs: "Alice set guardians on Day 0"
```

### What Your Smart Contract Does

```rust
pub fn set_guardians(
    account: Key,
    guardians: Vec<PublicKey>,
    threshold: u32
) {
    // Verify caller is the account owner
    let caller = get_caller();
    assert_eq!(caller, account);
    
    // Store guardians on-chain
    storage::set_guardians(account, guardians);
    storage::set_threshold(account, threshold);
    
    // Emit event
    emit_event("GuardiansSet", {
        account,
        guardians,
        threshold,
        timestamp: get_block_time(),
    });
}
```

### After Transaction Completes

```
Your Website: Shows confirmation
  ✅ "Guardians saved successfully!"
  ✅ "Guardian 1: 0x123..."
  ✅ "Guardian 2: 0x456..."
  ✅ "Guardian 3: 0x789..."
  ✅ "Threshold: 3"
  
Alice: Can now use recovery if needed
```

---

## Step 4: Notify Friends About Guardian Setup (Backend Job)

```
Your Backend Service:
  - Detects guardian setup event
  - Sends email to friends:
    "Hi Friend 1! Alice added you as a guardian.
     If Alice loses their key, she may ask for your approval.
     Keep your guardian key safe!"
```

### No Additional Signing Here
Friends just receive notification, nothing to sign yet.

---

## Summary of Setup Phase

| Action | Signed? | Where? | What Happens |
|--------|---------|--------|--------------|
| Connect wallet | ❌ No | Casper Wallet | Get public key |
| Enter guardian addresses | ❌ No | Your website | Just form input |
| Click "Save Guardians" | ✅ **YES** | Casper Wallet pops up | Sign with primary key |
| Transaction confirmed | ✅ Done | Casper network | Guardians stored on-chain |

---

---

# SCENARIO 2: USER LOST THEIR PRIMARY KEY (RECOVERY PHASE)

## User Journey: "My computer was stolen, I need recovery"

---

## Setup Recap (Days Before Loss)
```
Alice: Set up guardians (signed with primary key)
Casper: Stored [guardian1, guardian2, guardian3] with threshold 3
```

## Day 1: Alice Loses Her Computer

```
Alice's Old Computer: LOST/STOLEN
  ├─ Casper Wallet: INACCESSIBLE
  └─ Primary Key: STUCK ON IT

Alice's New Computer: Fresh installation
  ├─ No Casper Wallet
  ├─ No keys
  └─ No nothing
```

---

## Step 1: Alice Visits Your Website (Without Primary Key)

```
Alice: Opens your dApp
Your Website: "Welcome back, Alice!"
Your Website: "Connect Wallet" button

Alice: Tries to connect Casper Wallet on NEW computer
Casper Wallet: Empty (no keys yet)
Alice: CAN'T connect with primary key (it's lost)

Alice: Looks for recovery option
Your Website: Shows "I Lost My Key" button
```

---

## Step 2: Alice Initiates Recovery

```
Alice: Clicks "I Lost My Key"
Your Website: Shows recovery form
  "Enter your account address: alice@hash123"
  "Enter new recovery key: 0xnewabc..."
  (Alice generated this key on her new computer)
  
  [Start Recovery] button

Alice: Enters her account and new key
Alice: Clicks "Start Recovery"

👇👇👇 QUESTION: DOES CASPER WALLET POP UP HERE? 👇👇👇
```

### The Critical Question: Does Alice Need to Sign?

**Answer: DEPENDS on how you design it.**

---

### Design Option A: Alice Signs Recovery Request (Recommended)

```
Alice: Clicks "Start Recovery"
Casper Wallet: Pops up
  "Wait! I need to sign with a guardian key!"

Alice: Goes to get guardian key from Friend 1
Friend 1: Gives Alice the guardian key backup
Alice: Imports Friend 1's guardian key into Casper Wallet
Casper Wallet: Now has guardian key (weight 1)

Casper Wallet Pops Up:
┌──────────────────────────────────────────┐
│  Sign with Casper Wallet?               │
│                                          │
│  Contract: GuardianRecovery             │
│  Function: start_recovery               │
│  Args:                                   │
│    - account: alice@hash123             │
│    - new_key: 0xnewabc...               │
│                                          │
│  Signing with: Guardian Key 1           │
│                                          │
│  [Approve] [Reject]                     │
└──────────────────────────────────────────┘

Alice: Clicks "Approve"
Casper Wallet: Signs with guardian key

✅ Recovery Request Created
✅ Status: PENDING_VERIFICATION
✅ Waiting for other guardians...
```

### Or Design Option B: Backend Starts Recovery (No Signature)

```
Alice: Enters account and new key
Alice: Clicks "Start Recovery"

Your Backend:
  - Verifies Alice is owner (by email verification)
  - Creates recovery request on-chain
  - Starts 30-day timer
  
No signature needed from Alice (backend does it)
Friends get notified immediately
```

**Recommendation: Use Option A (Alice signs with guardian key)**
- More secure (Alice proves she has access to guardian key)
- Better for recovery logic

---

## Step 3: Guardians Get Notified

```
Your Backend Service:
  - Detects recovery request event
  - Sends email to Friend 1, Friend 2, Friend 3:
    "Alice initiated key recovery for account alice@hash123
     
     New key: 0xnewabc...
     Initiated: Day 1, Time 10:00 AM
     
     Please review and approve if this is legitimate.
     Link: https://yourprotocol.com/approvals"
```

### What Guardians See

```
Friend 1 opens your website
Your Website: "Pending Approvals for You"
  
  ┌─────────────────────────────────┐
  │ Recovery Request                │
  │                                 │
  │ Account: alice@hash123          │
  │ Status: Pending Your Approval   │
  │ Initiated: 1 hour ago           │
  │ Days Remaining: 29              │
  │                                 │
  │ Old Key: 0xprimary...           │
  │ New Key: 0xnewabc...            │
  │                                 │
  │ [Approve] [Reject]              │
  └─────────────────────────────────┘

Friend 1: Calls Alice
  "Hey, did you really lose your key?"
  
Alice: "Yes! My computer was stolen!"
Friend 1: "OK, I'll approve"
```

---

## Step 4: Friend 1 Approves (SIGNATURE POINT #2)

```
Friend 1: Clicks "Approve" button
Your Website: "Connect Wallet to Approve"

Friend 1: Connects Casper Wallet
Friend 1: Has guardian key stored in wallet (weight 1)

👇👇👇 CASPER WALLET POPUP 👇👇👇

Casper Wallet Pops Up:
┌──────────────────────────────────────────┐
│  Sign with Casper Wallet?               │
│                                          │
│  Contract: GuardianRecovery             │
│  Function: approve_recovery             │
│  Args:                                   │
│    - account: alice@hash123             │
│                                          │
│  Signing with: Guardian Key 1           │
│                                          │
│  [Approve] [Reject]                     │
└──────────────────────────────────────────┘

Friend 1: Clicks "Approve"
Casper Wallet: Signs with guardian key (weight 1)

✅ Approval Recorded: 1/3
✅ Your Website: "Approval 1/3 received"
```

### What Your Smart Contract Does

```rust
pub fn approve_recovery(account: Key) {
    // Get the caller (friend approving)
    let caller = get_caller();
    
    // Check if caller is in guardian list
    let guardians = storage::get_guardians(account);
    assert!(guardians.contains(&caller), "Not a guardian");
    
    // Record approval
    storage::add_approval(account, caller);
    
    // Check if threshold reached
    let approvals = storage::get_approvals(account);
    let threshold = storage::get_threshold(account);
    
    if approvals.len() >= threshold {
        // All guardians approved!
        storage::set_status(account, "READY_TO_EXECUTE");
        emit_event("AllApprovalsReceived", account);
    }
}
```

---

## Step 5: Friend 2 & Friend 3 Also Approve

```
Day 2: Friend 2 approves
  - Opens your website
  - Clicks "Approve"
  - Casper Wallet pops up
  - Signs with guardian key (weight 1)
  - ✅ Approval recorded: 2/3

Day 3: Friend 3 approves
  - Opens your website
  - Clicks "Approve"
  - Casper Wallet pops up
  - Signs with guardian key (weight 1)
  - ✅ Approval recorded: 3/3
  - ✅ Status: READY_TO_EXECUTE
```

### Your Website Shows Progress

```
Day 1: ✅ Friend 1 approved (1/3)
       ⏳ Waiting for Friends 2 & 3
       
Day 2: ✅ Friend 2 approved (2/3)
       ⏳ Waiting for Friend 3
       
Day 3: ✅ Friend 3 approved (3/3)
       ✅ All approvals received!
       ⏳ Can execute after Day 30 (7 days remaining)
```

---

## Step 6: Wait 30 Days (Safety Delay)

```
Day 0-30: Guardians approved
          System waits for safety period
          
During these 30 days:
  - Alice could find her old key → Cancel recovery
  - Alice could change her mind → Cancel recovery
  - Malicious actor couldn't fake recovery (need all 3 friends)

Day 31: Time has passed ✓
        All guardians approved ✓
        Ready to execute ✓
```

---

## Step 7: Execute Key Rotation (Backend Job - NO USER SIGNATURE)

```
Your Backend Service (Automated):
  - Detects: All approvals received + 30 days passed
  - Builds key rotation deploy:
    {
      Remove old primary key (weight 3)
      Add new primary key (weight 3)
    }
  - Collects all guardian signatures (already have from Step 4-5)
  - Submits to Casper Network
  
Casper Network:
  - Verifies signatures (weight 1 + 1 + 1 = 3) ✓
  - Removes old primary key ✓
  - Adds new primary key ✓
```

### What Smart Contract Does

```rust
pub fn execute_recovery(account: Key, new_key: PublicKey) {
    // Verify recovery is approved
    let approvals = storage::get_approvals(account);
    let threshold = storage::get_threshold(account);
    assert!(approvals.len() >= threshold);
    
    // Verify time has passed
    let initiated_at = storage::get_initiated_at(account);
    assert!(get_block_time() > initiated_at + 30_DAYS);
    
    // Remove old primary key
    let old_key = get_primary_key(account);
    account::remove_associated_key(old_key);
    
    // Add new primary key
    account::add_associated_key(new_key, 3);
    
    // Clean up recovery request
    storage::remove_recovery_request(account);
    
    emit_event("KeyRotationCompleted", account);
}
```

---

## Step 8: Alice Can Now Sign Again

```
Alice: Tries to use her account
Alice: Opens Casper Wallet
Casper Wallet: Now recognizes Alice's new key
Alice: Can now sign transactions ✓

Account Status:
  Old primary key: REMOVED ✓
  New primary key: ACTIVE ✓
  Guardian keys: STILL THERE (unchanged)
  
Alice: Can manage her account again ✓
```

---

## Summary of Recovery Phase

| Step | Action | Signed? | Where? | Who |
|------|--------|---------|--------|-----|
| 1 | Visit website | ❌ No | Your site | Alice |
| 2 | Initiate recovery | ✅ YES | Casper Wallet | Alice (with guardian key) |
| 3 | Get notified | ❌ No | Email | Friends |
| 4 | Friend 1 approves | ✅ YES | Casper Wallet | Friend 1 |
| 5 | Friend 2 approves | ✅ YES | Casper Wallet | Friend 2 |
| 6 | Friend 3 approves | ✅ YES | Casper Wallet | Friend 3 |
| 7 | Wait 30 days | ❌ No | Time | System |
| 8 | Execute rotation | ❌ No | Backend | Automated |

---

---

# DETAILED: WHERE CASPER WALLET SIGNS

## Summary Table

```
┌─────────────────────────────────────────────────────┐
│           WHERE CASPER WALLET SIGNS                │
├─────────────────────────────────────────────────────┤
│                                                     │
│ 1. SETUP PHASE                                      │
│    ✅ Set Guardians                                │
│       - User signs with PRIMARY key                │
│       - Weight: 3 (sufficient for key management)  │
│       - Casper Wallet pops up automatically        │
│                                                     │
│ 2. RECOVERY PHASE - INITIATION                     │
│    ✅ Start Recovery                               │
│       - User signs with GUARDIAN key               │
│       - Weight: 1 (not enough alone, but OK)       │
│       - Casper Wallet pops up automatically        │
│                                                     │
│ 3. RECOVERY PHASE - GUARDIAN APPROVALS              │
│    ✅ Approve Recovery (×3)                        │
│       - Each guardian signs with their key         │
│       - Weight: 1 each (total 1+1+1=3)            │
│       - Casper Wallet pops up for each friend      │
│                                                     │
│ 4. RECOVERY PHASE - EXECUTION                       │
│    ❌ NO SIGNATURE NEEDED                          │
│       - Backend submits with collected signatures  │
│       - Already have all signatures from step 2-3  │
│       - Casper Wallet doesn't pop up               │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

---

# TECHNICAL: WHAT EXACTLY TO BUILD

## Component 1: Smart Contract (Rust)

```rust
pub mod guardian_recovery {
    
    // 1. SETUP FUNCTIONS
    pub fn set_guardians(
        account: Key,
        guardians: Vec<PublicKey>,
        threshold: u32
    ) {
        // User signs with PRIMARY key
        // Stores guardians on-chain
        // Emits event for backend
    }
    
    // 2. RECOVERY INITIATION
    pub fn start_recovery(
        account: Key,
        new_key: PublicKey
    ) {
        // User signs with GUARDIAN key
        // Creates recovery request
        // Sets 30-day timer
        // Notifies all guardians
    }
    
    // 3. GUARDIAN APPROVALS
    pub fn approve_recovery(account: Key) {
        // Guardian signs with their key
        // Records approval
        // When all approve: status = READY_TO_EXECUTE
    }
    
    // 4. KEY ROTATION
    pub fn execute_recovery(
        account: Key,
        new_key: PublicKey
    ) {
        // Backend submits (no user signature)
        // Uses collected guardian signatures
        // Removes old key, adds new key
        // Cleans up recovery request
    }
}
```

---

## Component 2: Frontend (React)

```typescript
// PAGE 1: Guardian Setup
export function GuardianSetup() {
  return (
    <form onSubmit={handleSetGuardians}>
      <input placeholder="Guardian 1 Key" />
      <input placeholder="Guardian 2 Key" />
      <input placeholder="Guardian 3 Key" />
      <input placeholder="Threshold (3)" />
      <button onClick={connectWalletAndSign}>
        Save Guardians
      </button>
      {/* Casper Wallet pops up here */}
    </form>
  );
}

// PAGE 2: Recovery Initiation
export function RecoveryForm() {
  return (
    <form onSubmit={handleStartRecovery}>
      <input placeholder="Your Account" value={account} />
      <input placeholder="New Key" />
      <button onClick={connectWalletAndSign}>
        Start Recovery
      </button>
      {/* Casper Wallet pops up here */}
    </form>
  );
}

// PAGE 3: Guardian Approvals
export function GuardianDashboard() {
  const [pendingRecoveries] = useState([...]);
  
  return (
    <div>
      {pendingRecoveries.map(recovery => (
        <div key={recovery.account}>
          <h3>Recovery for {recovery.account}</h3>
          <p>Status: {recovery.status}</p>
          <button onClick={connectWalletAndApprove}>
            Approve Recovery
          </button>
          {/* Casper Wallet pops up here */}
        </div>
      ))}
    </div>
  );
}
```

---

## Component 3: Backend Service (Node.js)

```typescript
// Monitoring for events
contract.on("GuardiansSet", async (event) => {
  // Log guardian setup
  // Send email to friends
});

contract.on("RecoveryInitiated", async (event) => {
  // Notify all guardians
  // Create dashboard records
});

contract.on("RecoveryApproved", async (event) => {
  // Update approval count
  // Check if ready to execute
});

// Automated execution (after 30 days)
setInterval(async () => {
  const readyRecoveries = await getReadyRecoveries();
  
  for (const recovery of readyRecoveries) {
    // Collect all guardian signatures
    const signatures = await getGuardianSignatures(recovery);
    
    // Build key rotation deploy
    const deploy = buildKeyRotationDeploy(recovery, signatures);
    
    // Submit to Casper
    const deployHash = await casperClient.putDeploy(deploy);
    
    // Log completion
    logRecoveryExecution(recovery, deployHash);
  }
}, 24 * 60 * 60 * 1000); // Check daily
```

---

---

# FINAL CHECKLIST: WHAT TO BUILD

## Smart Contract Tasks
- [ ] `set_guardians(account, guardians, threshold)` - SETUP
- [ ] `start_recovery(account, new_key)` - RECOVERY INIT
- [ ] `approve_recovery(account)` - GUARDIAN APPROVAL
- [ ] `execute_recovery(account, new_key)` - KEY ROTATION
- [ ] Events for all functions
- [ ] Time delay enforcement (30 days)
- [ ] Threshold checking
- [ ] Prevention of self-locking

## Frontend Tasks
- [ ] Connect Wallet button
- [ ] Guardian setup form
- [ ] Recovery initiation form
- [ ] Guardian approval dashboard
- [ ] Status tracking page
- [ ] Integration with Casper Wallet SDK
- [ ] Handle Wallet pop-ups
- [ ] Display confirmations

## Backend Tasks
- [ ] Monitor contract events
- [ ] Send email notifications
- [ ] Collect guardian signatures
- [ ] Build key rotation deploys
- [ ] Submit to Casper network
- [ ] Track execution status
- [ ] Database for recovery records

---

---

# WALLET SIGNATURE SUMMARY

## When Casper Wallet Pops Up (User Must Click Approve)

**Setup Phase (1 signature):**
1. ✅ Set guardians - User signs with PRIMARY key

**Recovery Phase (4 signatures total):**
2. ✅ Start recovery - Alice signs with GUARDIAN key
3. ✅ Friend 1 approves - Friend 1 signs with their GUARDIAN key
4. ✅ Friend 2 approves - Friend 2 signs with their GUARDIAN key
5. ✅ Friend 3 approves - Friend 3 signs with their GUARDIAN key

**Execution Phase (0 signatures):**
6. ❌ Execute key rotation - Backend does it (no popup)

**Total Signatures: 5 (1 in setup, 4 in recovery)**

---

# KEY ARCHITECTURAL POINTS

## Guardian Keys vs Primary Key

```
Primary Key:
  - Weight: 3
  - Used for: Daily transactions, setting guardians
  - In: Casper Wallet on main device
  - When lost: Can't use, but recovery system activates
  
Guardian Key:
  - Weight: 1 each (need 3 to reach threshold)
  - Used for: Recovery requests, approvals
  - In: Distributed with friends
  - When lost: Account still safe (other guardians exist)
```

## Why This Architecture Works

```
Setup Phase:
  Alice signs with PRIMARY key (she has it)
  ✓ Proves she owns the account
  ✓ Authorizes guardians

Recovery Phase:
  Alice signs with GUARDIAN key (she can get it from friends)
  Friends sign with their GUARDIAN keys
  ✓ 3 separate signatures required
  ✓ No single point of failure
  ✓ Distributed trust

Execution Phase:
  Backend submits with all signatures collected
  ✓ No additional user action needed
  ✓ Automated, trustless execution
```

---

This is your complete implementation guide!
