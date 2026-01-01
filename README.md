# Guardian Recovery Protocol

**Your Keys. Your Friends. Your Recovery.**

Decentralized account recovery through threshold-based guardianship on Casper Network. Never lose access to your cryptocurrency account again. Even if you lose your private key, your trusted guardians can help you recover it securely.

## Overview

Guardian Recovery Protocol is an open-source, decentralized account recovery system that enables users to regain access to lost or stolen private keys through a network of trusted guardians. It combines threshold-based multi-signature cryptography with a 30-day safety period to ensure both security and recoverability.

Built on Casper Network's native multi-signature infrastructure.

## Problem Statement

**The Dilemma:**
- Lose your private key → Lose your account forever
- Use a centralized recovery → Compromises security and decentralization
- Use a password recovery → Weak against sophisticated attacks

**Our Solution:**
Guardian Recovery Protocol enables **decentralized, cryptographic account recovery** through friends, family, or trusted services you choose as guardians.

## Key Features

✅ **Decentralized & Trustless** - No centralized authority controls recovery
✅ **Guardian-Based Recovery** - Your trusted friends/services act as guardians
✅ **Multi-Signature Threshold** - Requires consensus (e.g., 2 of 3 guardians)
✅ **Cryptographically Secure** - All signatures verified on-chain
✅ **30-Day Safety Period** - Time to cancel or find your original key
✅ **Open-Source & Auditable** - Complete transparency, anyone can verify
✅ **Built on Casper Network** - Leverages Casper's native multi-sig capabilities
✅ **Replay Attack Prevention** - Nonce and timestamp validation
✅ **Account Isolation** - Cross-account hijacking is cryptographically impossible

## Architecture

### The Three Keys

| Aspect | Account Hash | Guardian Key | New Primary Key |
|--------|--------------|--------------|-----------------|
| **What is it?** | Unique ID for account | Friend's guardian key | Alice's new key |
| **Example** | account-hash-8f2a... | 0xguardian1abc... | 0xnewkey789ghi... |
| **Who has it?** | Everyone (public) | Friend 1 (private) | Alice (private) |
| **Used for** | Identify which account | Sign approvals | Replace lost key |
| **Never changes** | YES (immutable) | NO | NO |
| **Where stored** | On-chain | Friend's wallet | Alice's wallet |
| **Purpose** | "Which account?" | "Prove you're guardian" | "Here's my new key" |

### Recovery Flow

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: User enters account hash (public information)       │
├─────────────────────────────────────────────────────────────┤
│ Backend validates account exists on-chain                   │
│ Retrieves guardians for this specific account               │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: User connects Casper Wallet with guardian key       │
├─────────────────────────────────────────────────────────────┤
│ User selects guardian key to sign with                      │
│ Signs recovery request message                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Smart Contract Verification (THE CRITICAL STEP)     │
├─────────────────────────────────────────────────────────────┤
│ ✓ Is signature cryptographically valid?                     │
│ ✓ Get guardians FOR THIS SPECIFIC ACCOUNT                   │
│ ✓ Is signer in THIS account's guardian list?                │
│ ✓ Is timestamp recent? (prevent replay)                     │
│ ✓ Is nonce new? (prevent reuse)                             │
│                                                             │
│ RESULT: ✅ PERSON IS VERIFIED!                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: Recovery Request Created                            │
├─────────────────────────────────────────────────────────────┤
│ Recovery request bound to account                           │
│ Guardians notified via email                                │
│ User specified in recovery request                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 5: Guardian Approvals (Days 1-3)                       │
├─────────────────────────────────────────────────────────────┤
│ Each guardian signs approval with their key                 │
│ Each approval verified on-chain                             │
│ Threshold enforcement (e.g., need 2 of 3)                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 6: 30-Day Safety Period (Days 4-34)                    │
├─────────────────────────────────────────────────────────────┤
│ User has time to:                                           │
│  • Find original key and cancel recovery                    │
│  • Verify legitimacy of request                             │
│  • Contact guardians if unauthorized                        │
│                                                             │
│ Guardians:                                                  │
│  • Cannot reverse approval                                  │
│  • Cannot execute early                                     │
│  • Just have to wait                                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 7: Execution & Key Rotation (Day 35+)                  │
├─────────────────────────────────────────────────────────────┤
│ Backend service checks:                                     │
│  ✓ All guardians approved?                                  │
│  ✓ 30 days have passed?                                     │
│                                                             │
│ Submits key rotation deploy to Casper:                      │
│  • Remove old (lost) key                                    │
│  • Add new key with weight 3                                │
│  • Keep guardians intact                                    │
│                                                             │
│ RESULT: ✅ KEY ROTATION COMPLETE!                           │
└─────────────────────────────────────────────────────────────┘
```

## Why Guardian Recovery Protocol is Secure

### Layer 1: Database Isolation
Each account's guardians are stored separately in smart contract storage. Alice's guardians cannot be used for Bob's account recovery because they're in different storage locations.

### Layer 2: Account-Specific Verification
Smart contract checks: "Is signer in **THIS account's** guardian list?" 
Not: "Is signer any guardian?" but specifically "Is signer in guardians[account_hash]?"

### Layer 3: Cryptographic Signature
Signature must be cryptographically valid for the signer's public key. Cannot forge signatures without the private key.

### Layer 4: Recovery Request Binding
Recovery requests are bound to specific accounts with `UNIQUE(account_hash)` constraint. Cannot link one recovery request to another account.

### Layer 5: Replay Attack Prevention
- **Nonce Tracking:** Each recovery request must have a unique nonce
- **Timestamp Validation:** Request must be recent (within 5 minutes)

### Layer 6: Threshold Enforcement
Requires multiple guardians to approve (e.g., 2 of 3). Single guardian cannot recover account alone.

### Layer 7: 30-Day Time Lock
Cannot execute immediately. 30-day delay provides safety net to cancel or verify legitimacy.

## Security Guarantees

**Q: Can someone enter a random account hash and hijack it?**
A: No. Smart contract verifies signer is in THAT account's guardian list. Wrong key = rejected.

**Q: Can someone use their guardian key on another's account?**
A: No. Guardian keys are account-specific. Database stores separate guardian lists per account.

**Q: Can signatures be forged?**
A: No. Cryptographic signature verification makes forgery mathematically impossible.

**Q: Can recovery happen before 30 days?**
A: No. Smart contract checks block time. Before 30 days = execution fails.

**Q: Can a single guardian recover the account alone?**
A: No. Threshold enforcement requires consensus (e.g., 2 of 3 guardians).

## Use Cases

### For Individual Users
- Never lose access to your crypto account
- Designate trusted friends as guardians
- Sleep better knowing you have a recovery path

### For Cryptocurrency Wallets
- Integrate account recovery for your users
- Provide competitive advantage (safety feature)
- All-in-one open-source solution

### For DeFi Platforms
- Add recovery feature to platform
- Increase user trust and adoption
- Enable safer long-term holdings

### For Institutions
- Enterprise custody solutions
- Multiple approval hierarchy
- Audit trails and compliance ready
- Custom threshold configurations

### For DAOs
- Decentralized governance recovery
- Multi-sig account protection
- Treasury asset safeguarding

## How It Works: Complete Example

### Setup Phase (Day 0)

**Alice's Original Setup:**
```
Casper Wallet:
  - Primary Key: 0xaliceprimary123 (weight 3)
  - Account Hash: account-hash-alice-abc

Guardian Setup:
  - Friend 1: 0xguardian1_abc (weight 1)
  - Friend 2: 0xguardian2_def (weight 1)
  - Friend 3: 0xguardian3_ghi (weight 1)
  - Threshold: 3 (all must approve)

On Casper Network:
  account-hash-alice-abc {
    "guardians": [0xg1, 0xg2, 0xg3],
    "threshold": 3
  }
```

### Key Loss Day (Day 100)

**Alice loses her computer with the private key**

```
Alice's old computer: LOST (had 0xaliceprimary123)
Alice's new computer: Fresh Casper Wallet

New Setup:
  - New Primary Key: 0xalicenew789
  - Imports guardian key from Friend 1: 0xguardian1_abc
  - Friend 1 sends this key securely to Alice
```

### Recovery Initiation (Day 101)

**Alice opens Guardian Recovery Protocol dApp**

```
Form:
  Field 1: account-hash-alice-abc
  Field 2: 0xalicenew789

Clicks: "Start Recovery"

Casper Wallet Popup:
  Question: "Sign with which key?"
  Alice: Selects guardian key (0xguardian1_abc)
  Alice: Enters password to confirm

Smart Contract Receives:
  {
    "account": "account-hash-alice-abc",
    "new_key": "0xalicenew789",
    "signed_by": "0xguardian1_abc",
    "signature": "0xsig_from_g1_alice",
    "timestamp": 1704110400,
    "nonce": "unique-random-value"
  }

Smart Contract Verification:
  1. Is signature valid for 0xguardian1_abc?
     → YES ✓
  
  2. Get guardians[account-hash-alice-abc]
     → [0xg1_alice, 0xg2_alice, 0xg3_alice]
  
  3. Is 0xguardian1_abc in this list?
     → YES ✓
  
  4. Is timestamp recent?
     → YES (within 5 minutes) ✓
  
  5. Is nonce new?
     → YES (first time) ✓

Result: ✅ VERIFIED! Recovery request created!
```

### Guardian Approvals (Days 101-103)

**Each guardian receives email and approves**

```
Friend 1 Email:
  "Alice wants to recover account-hash-alice-abc
   New key: 0xalicenew789
   [Approve] [Reject]"

Friend 1:
  - Clicks approval link
  - Connects wallet with 0xguardian1_abc
  - Signs approval message
  - Smart Contract: Records approval ✓

Friend 2:
  - Same process
  - Signs with 0xguardian2_def
  - Smart Contract: Records approval ✓

Friend 3:
  - Same process
  - Signs with 0xguardian3_ghi
  - Smart Contract: Records approval ✓

Status: 3/3 APPROVALS COLLECTED ✓
```

### Waiting Period (Days 104-131)

**30-day safety window**

```
System Tracking:
  - Recovery initiated: Day 101
  - Execute after: Day 101 + 30 days = Day 131
  - Current day: Day 110
  - Days remaining: 21

User Can Still:
  ✓ Cancel recovery (if finds original key)
  ✓ Contact guardians if unauthorized
  ✓ Change mind about new key

Guardians:
  ✗ Cannot reverse approval
  ✗ Cannot execute before 30 days
  ✓ Just wait
```

### Execution & Key Rotation (Day 132)

**After 30 days and all approvals**

```
Backend Service (Automated):
  - Checks: All 3 guardians approved? YES ✓
  - Checks: 30 days passed? YES ✓
  
  Collects signatures:
    - Guardian 1 approval: 0xsig1
    - Guardian 2 approval: 0xsig2
    - Guardian 3 approval: 0xsig3
  
  Builds key rotation deploy:
    - Remove: 0xaliceprimary123 (weight 3)
    - Add: 0xalicenew789 (weight 3)
    - Keep guardians: 0xg1, 0xg2, 0xg3

Casper Verifies:
  ✓ Signatures valid? YES
  ✓ Weight sum ≥ threshold? (1+1+1 ≥ 3) YES
  ✓ Remove old key? YES
  ✓ Add new key? YES

Result: ✅ KEY ROTATION COMPLETE!
```

### After Recovery (Day 133+)

**Alice's account is recovered**

```
Alice's Account Now:
  account-hash-alice-abc {
    "associated_keys": [
      {
        "key": "0xalicenew789",
        "weight": 3  // NEW PRIMARY KEY
      },
      {
        "key": "0xguardian1_abc",
        "weight": 1  // Guardian 1
      },
      {
        "key": "0xguardian2_def",
        "weight": 1  // Guardian 2
      },
      {
        "key": "0xguardian3_ghi",
        "weight": 1  // Guardian 3
      }
    ]
  }

Alice Can Now:
  ✓ Sign transactions with new key (0xalicenew789)
  ✓ Use account normally
  ✓ Keep guardians intact for future recovery
  ✓ Set up new guardians if desired
  ✓ Access all her cryptocurrency
```

## Protocol Components

### Smart Contract (Rust/Casper)
- Guardian registry mapping (guardians per account)
- Recovery request storage (bound to accounts)
- Signature verification (cryptographic validation)
- Approval tracking (threshold enforcement)
- Time-lock enforcement (30-day delay)
- Replay attack prevention (nonce & timestamp)

### Backend Service (Python/Node.js)
- Account existence validation
- Guardian list retrieval (account-specific)
- Email notification system
- Recovery request management
- Approval tracking database
- Signature collection for execution
- Automated key rotation deployment

### Frontend dApp (React/Web3)
- Recovery initiation form
- Casper Wallet integration
- Guardian approval interface
- Recovery status dashboard
- Timeline visualization
- Cancellation interface

### Database (PostgreSQL)
- Account registry
- Guardian mappings (per account)
- Recovery requests (bound to accounts)
- Approval records (linked to recovery)
- Audit log (complete history)
- Nonce tracking (replay prevention)

## Getting Started

### Prerequisites
- Casper Network account
- Trusted guardians (friends/services)
- Casper Wallet

### Steps to Recover

1. **Visit the dApp** - Go to the Guardian Recovery Protocol website
2. **Enter Account Hash** - Paste your lost account's hash
3. **Enter New Key** - Paste your new public key from new computer
4. **Connect Wallet** - Connect Casper Wallet with guardian key
5. **Sign Request** - Sign the recovery request message
6. **Notify Guardians** - Guardians receive notification emails
7. **Wait for Approvals** - Guardians approve recovery (1-3 days typically)
8. **Wait 30 Days** - Safety period passes
9. **Recovery Executes** - Key rotation happens automatically
10. **Account Recovered** - You regain access!

## Installation & Development

### Clone Repository
```bash
git clone https://github.com/guardian-labs/guardian-recovery-protocol.git
cd guardian-recovery-protocol
```

### Smart Contracts (Rust)
```bash
cd contracts
cargo build --release
cargo test
```

### Backend Service
```bash
cd backend
pip install -r requirements.txt
python app.py
```

### Frontend dApp
```bash
cd frontend
npm install
npm start
```

### Run Tests
```bash
cargo test                    # Smart contract tests
pytest                        # Backend tests
npm test                      # Frontend tests
```

## Security Considerations

### For Users
- **Guardian Selection:** Choose guardians you absolutely trust
- **Key Storage:** Keep your new key secure on new computer
- **Account Hash:** Account hash is public; keep your recovery secure
- **Email Security:** Use secure email for guardian communications

### For Guardians
- **Private Key Security:** Never share your guardian private key
- **Verify Requests:** Always verify recovery requests are legitimate
- **Emergency Contacts:** Have direct way to contact account owner

### For Developers
- Smart contracts audited by [Audit Firm]
- Nonce tracking prevents replay attacks
- Account-specific verification prevents cross-account hijacking
- 30-day delay provides time for detection and cancellation

## Threat Model

### Threats Mitigated
✅ Private key loss (account recovery enabled)
✅ Private key theft (30-day delay + guardian consensus)
✅ Unauthorized recovery (guardian key required + threshold)
✅ Replay attacks (nonce & timestamp validation)
✅ Cross-account hijacking (account-specific verification)
✅ Single guardian attack (threshold enforcement)
✅ Centralized authority control (smart contract is truth)

### Threats Not Covered
❌ Guardian key compromise (mitigated by threshold + 30-day delay)
❌ Loss of all guardian keys (design trade-off: human recovery needed)
❌ Social engineering of all guardians (requires multiple coordinated attacks)


## Acknowledgments

- **Casper Network** - For excellent multi-signature infrastructure
- **Contributors** - For building and improving the protocol
- **Community** - For feedback and support
- **Security Auditors** - For thorough review and recommendations

## Disclaimer

Guardian Recovery Protocol is provided as-is for educational and experimental purposes. Users assume all risks associated with key recovery. Always backup your keys and test recovery flows in non-critical scenarios before relying on them for account access.

---

**Guardian Recovery Protocol: Your Keys. Your Friends. Your Recovery.** 🔐

Built with ❤️ for the Casper ecosystem.
