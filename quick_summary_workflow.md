# Quick Summary: What to Build & When to Sign

---

## THE BIG PICTURE

```
YOUR PROTOCOL has TWO PHASES:

┌─────────────────────────────────────┐
│  PHASE 1: SETUP (User Has Key)      │
├─────────────────────────────────────┤
│  Alice: Setup guardians             │
│  Action: Signs 1 transaction        │
│  Wallet: Casper Wallet pops up      │
│  Key: PRIMARY key (weight 3)        │
└─────────────────────────────────────┘
           ↓ Time passes ↓
┌─────────────────────────────────────┐
│  PHASE 2: RECOVERY (Key is Lost)    │
├─────────────────────────────────────┤
│  Alice: Initiate recovery           │
│  Friends: Each approve              │
│  Signatures: 4 total (Alice + 3x)   │
│  Wallet: Casper Wallet pops up ×4   │
│  Then: Backend executes (no sig)    │
└─────────────────────────────────────┘
```

---

## PHASE 1: SETUP (When User Has Their Key)

### What Alice Does
```
1. Opens your website
2. Clicks "Connect Wallet"
3. Selects her Casper Wallet account
4. Enters 3 guardian public keys
5. Clicks "Save Guardians"

👇 CASPER WALLET POPS UP 👇

6. Casper Wallet: "Sign with your primary key?"
7. Alice: Clicks "Approve"
8. Alice: Wallet signs transaction

✅ Guardians are now set on-chain
✅ Friends get notified
```

### Casper Wallet Signature #1
```
Function: set_guardians()
Who Signs: Alice (with PRIMARY key)
Weight: 3 (enough to authorize key management)
What Happens: Guardians stored on-chain
```

---

## PHASE 2: RECOVERY (When User Lost Their Key)

### Day 1: Alice Initiates Recovery

```
Alice: Visits your website
Alice: Clicks "I Lost My Key"
Alice: Enters her account & new key
Alice: Clicks "Start Recovery"

👇 CASPER WALLET POPS UP 👇

Alice: Needs guardian key
Alice: Calls Friend 1, asks for guardian key
Friend 1: Shares guardian key with Alice
Alice: Imports into Casper Wallet
Alice: Casper Wallet asks: "Sign?"
Alice: Clicks "Approve"

✅ Recovery request created
✅ Friends get email notifications
```

### Casper Wallet Signature #2
```
Function: start_recovery()
Who Signs: Alice (with GUARDIAN key)
Weight: 1 (proof she can access recovery)
What Happens: Recovery initiated, 30-day timer starts
```

---

### Day 1-3: Friends Approve (3 More Signatures)

```
Friend 1:
  - Opens your website
  - Clicks "Approve Recovery"
  - Casper Wallet pops up
  - Signs with his guardian key
  - ✅ Approval 1/3 recorded

Friend 2:
  - Same process
  - ✅ Approval 2/3 recorded

Friend 3:
  - Same process
  - ✅ Approval 3/3 recorded

Status: "All approvals received! Waiting 30 days..."
```

### Casper Wallet Signatures #3, #4, #5
```
Function: approve_recovery() (called 3 times)
Who Signs: Friend 1, Friend 2, Friend 3
Weight: 1 each (1 + 1 + 1 = 3 total)
What Happens: Approvals recorded, key rotation queued
```

---

### Day 31: Backend Executes (No User Signature)

```
Your Backend (Automated):
  - Detects: 30 days passed + all 3 approved
  - Collects: All signatures (already have from Day 1-3)
  - Builds: Key rotation deployment
  - Submits: To Casper Network
  - Casper: Verifies signatures (3 = 3 ✓)
  - Casper: Removes old key, adds new key

✅ Alice: Can now use her account again
```

### No Casper Wallet Signature Here
```
Function: execute_recovery()
Who Signs: Nobody (backend submits with collected sigs)
Why: All signatures collected in previous steps
Casper Wallet: Does NOT pop up
```

---

## COMPLETE SIGNING SUMMARY

```
┌──────────────────────────────────────────────────────┐
│         WHEN CASPER WALLET POPS UP                  │
├──────────────────────────────────────────────────────┤
│                                                      │
│ SETUP PHASE (1 signature):                          │
│  ✅ Set Guardians (Alice, PRIMARY key, weight 3)   │
│                                                      │
│ RECOVERY PHASE (4 signatures):                       │
│  ✅ Start Recovery (Alice, GUARDIAN key, weight 1) │
│  ✅ Approve 1 (Friend 1, GUARDIAN key, weight 1)  │
│  ✅ Approve 2 (Friend 2, GUARDIAN key, weight 1)  │
│  ✅ Approve 3 (Friend 3, GUARDIAN key, weight 1)  │
│                                                      │
│ TOTAL: 5 signatures                                 │
│                                                      │
│ Then: Backend executes (collected sigs, no popup)   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## WHAT YOU BUILD (3 Components)

### Component 1: Smart Contract (Rust)
```
4 Functions:
  1. set_guardians(account, guardians, threshold)
  2. start_recovery(account, new_key)
  3. approve_recovery(account)
  4. execute_recovery(account, new_key)

Storage:
  - Guardian registry
  - Recovery requests
  - Approval tracking
  - Timer (30 days)

Events:
  - GuardiansSet
  - RecoveryInitiated
  - RecoveryApproved
  - KeyRotationCompleted
```

### Component 2: Frontend (React Website)
```
3 Pages:
  1. Guardian Setup Page
     - Input 3 guardian keys
     - Connect wallet button
     - Save guardians button
  
  2. Recovery Initiation Page
     - Input account & new key
     - Start recovery button
  
  3. Guardian Dashboard Page
     - Show pending approvals
     - Approve/Reject buttons

Integration:
  - Casper Wallet SDK
  - Connect wallet
  - Sign transactions
  - Handle popups
```

### Component 3: Backend Service (Node.js)
```
Monitoring:
  - Listen for contract events
  - Send email notifications
  - Track recovery status

Automation:
  - Collect guardian signatures
  - Build key rotation deploy
  - Submit after 30 days
  - Log execution

Database:
  - Recovery records
  - Approval status
  - Execution history
```

---

## WHO SIGNS WHAT (Key Details)

### Setup Phase

```
Alice has: PRIMARY KEY (weight 3)
Alice does: Click "Save Guardians"
Wallet pops: Yes
Alice signs: With PRIMARY key
Result: Guardians stored on-chain
```

### Recovery Initiation

```
Alice has: GUARDIAN KEY (from Friend 1, weight 1)
Alice does: Click "Start Recovery"
Wallet pops: Yes
Alice signs: With GUARDIAN key
Result: Recovery request created
```

### Guardian Approvals

```
Friend has: GUARDIAN KEY (weight 1)
Friend does: Click "Approve"
Wallet pops: Yes
Friend signs: With their GUARDIAN key
Result: Approval counted (1, 2, or 3)
```

### Execution

```
Backend has: All collected signatures
Backend does: Submit deployment
Wallet pops: NO
Backend signs: With pre-collected signatures
Result: Key rotated, account recovered
```

---

## KEY INSIGHT: Why Guardian Key for Recovery Initiation?

```
Alice lost her PRIMARY key (can't sign)
Alice still has GUARDIAN key (Friend 1 gave it to her)
Alice signs recovery request with GUARDIAN key

Why?
  ✅ Proves Alice can access recovery system
  ✅ Proves Alice has connection to guardians
  ✅ Prevents complete strangers from faking recovery
  ✅ Guardian key is low-weight (1), so alone can't authorize
  ✅ Forces collaboration with real guardians
```

---

## Timeline Example

```
Day 0: Alice sets up guardians
       Alice: Signs with PRIMARY key
       Status: Setup complete ✓

Day 100: Alice loses computer
         Alice: Lost primary key 😞

Day 101: Alice initiates recovery
         Alice: Signs with GUARDIAN key (from Friend 1)
         Status: Recovery pending

Day 101: Friend 1 approves
         Friend 1: Clicks approve
         Friend 1: Wallet pops up
         Friend 1: Signs with GUARDIAN key
         Status: 1/3 approvals

Day 102: Friend 2 approves
         Friend 2: Signs with GUARDIAN key
         Status: 2/3 approvals

Day 103: Friend 3 approves
         Friend 3: Signs with GUARDIAN key
         Status: 3/3 approvals ✓

Day 104-131: Waiting period (30 days)
             No action needed
             Time passes...

Day 132: Backend executes
         Backend: Submits with collected signatures
         Casper: Verifies (3 guardians = weight 3 ✓)
         Casper: Removes old key, adds new key
         Status: Key rotation complete ✓

Day 133: Alice recovers
         Alice: Imports new key into Casper Wallet
         Alice: Can sign transactions again ✓
```

---

## Quick Checklist: Build Order

```
WEEK 1: Smart Contract
  ☐ Design RecoveryRegistry contract
  ☐ Implement set_guardians()
  ☐ Implement start_recovery()
  ☐ Implement approve_recovery()
  ☐ Implement execute_recovery()
  ☐ Add events and logging

WEEK 2: Frontend
  ☐ Create guardian setup page
  ☐ Create recovery page
  ☐ Create approval dashboard
  ☐ Integrate Casper Wallet SDK
  ☐ Handle wallet popups
  ☐ Display status/confirmations

WEEK 3: Backend
  ☐ Setup event monitoring
  ☐ Create email notification system
  ☐ Implement signature collection
  ☐ Build key rotation deploy logic
  ☐ Setup automated execution
  ☐ Database for tracking

WEEK 4: Testing & Polish
  ☐ Test on testnet
  ☐ End-to-end testing
  ☐ Security review
  ☐ Documentation
```

---

## Document Created: `complete_workflow_build_guide.md`

This has:
- ✅ Step-by-step scenarios
- ✅ Where Casper Wallet signs (exact points)
- ✅ What happens at each step
- ✅ Code examples for smart contract
- ✅ Frontend pseudocode
- ✅ Backend logic
- ✅ Complete checklist

This is your complete implementation blueprint! 🎯
