# SentinelX Demo Guide

## Prerequisites

1. **Casper Wallet** - Install from [casperwallet.io](https://www.casperwallet.io/)
2. **3 Test Accounts** in Casper Wallet:
   - ACC1 (Alice) - Main account to protect (~150 CSPR)
   - ACC2 (Bob) - Guardian 1 (~10 CSPR)
   - ACC3 (Carol) - Guardian 2 (~10 CSPR)
3. **Testnet CSPR** - Get from [faucet](https://testnet.cspr.live/tools/faucet)

## Start the App

**Terminal 1 - Backend:**
```bash
cd backend
npm install
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm install
npm run dev
```

---

## STEP 0: Deploy Contract (One-Time Admin Setup)

**Who:** Anyone with ~100 CSPR (e.g., Alice)
**Page:** http://localhost:3000/admin

1. Connect wallet (ACC1 - Alice)
2. Click "Deploy Contract"
3. Sign the transaction in Casper Wallet
4. Wait for confirmation (~1-2 minutes)
5. Go to https://testnet.cspr.live/account/YOUR_ACCOUNT
6. Find `recovery_registry_hash` in Named Keys
7. Copy the hash value (e.g., `abc123def456...`)
8. Edit `backend/.env`:
   ```
   RECOVERY_CONTRACT_HASH=abc123def456...
   ```
9. Restart the backend (Ctrl+C, then `npm run dev`)

---

## STEP 1: Setup Guardians (Alice Protects Her Account)

**Who:** Alice (ACC1)
**Page:** http://localhost:3000/setup

1. Connect wallet as Alice (ACC1)
2. Enter guardian public keys:
   - Guardian 1: Bob's public key (ACC2)
   - Guardian 2: Carol's public key (ACC3)
3. Click "Setup Protectors"
4. Sign the transaction
5. Wait for confirmation

**Result:** Alice's account now has Bob and Carol as guardians.

---

## STEP 2: Initiate Recovery (Simulating Lost Key)

**Who:** Bob (ACC2) - helping Alice
**Page:** http://localhost:3000/recovery

**Scenario:** Alice lost her private key and asks Bob for help.

1. Switch to Bob's wallet (ACC2) in Casper Wallet
2. Refresh the page and connect as Bob
3. Fill in:
   - **Account to recover:** Alice's public key (ACC1)
   - **New Recovery Key:** A new public key for Alice
     - Generate in Casper Wallet: Create Account → copy public key
4. Click "Start Recovery"
5. Sign the transaction
6. Note the **Recovery ID** (shown after confirmation)

---

## STEP 3: Guardians Approve

### Bob Approves
**Who:** Bob (ACC2)
**Page:** http://localhost:3000/approve

1. Connect as Bob (ACC2)
2. Enter Recovery ID from Step 2
3. Click "Approve Recovery"
4. Sign the transaction

### Carol Approves
**Who:** Carol (ACC3)
**Page:** http://localhost:3000/approve

1. Switch to Carol's wallet (ACC3)
2. Refresh and connect as Carol
3. Enter the same Recovery ID
4. Click "Approve Recovery"
5. Sign the transaction

**Result:** Threshold met! (2/2 guardians approved)

---

## STEP 4: Execute Recovery (Key Rotation)

**Who:** Bob or Carol (guardian)
**Page:** http://localhost:3000/execute

1. Connect as a guardian (Bob or Carol)
2. **Step 1 - Add New Key:**
   - Enter Alice's new public key
   - Click "Execute Step"
   - Sign transaction
3. **Step 2 - Remove Old Key:**
   - Enter Alice's old public key
   - Click "Execute Step"
   - Sign transaction
4. **Step 3 - Reset Thresholds:**
   - Click "Execute Step"
   - Sign transaction

**Result:** Alice's account is recovered! 🎉

---

## Verification

Check Alice's account on https://testnet.cspr.live:
- Old key should be removed
- New key should be the only associated key
- Thresholds should be reset to 1

Alice can now import her new private key into Casper Wallet and access her account.

---

## Quick Reference

| Page | URL | Purpose |
|------|-----|---------|
| Admin | /admin | Deploy contract (one-time) |
| Setup | /setup | Register guardians |
| Recovery | /recovery | Initiate recovery |
| Approve | /approve | Guardian approval |
| Execute | /execute | Key rotation |
| Dashboard | /dashboard | Track progress |

## Troubleshooting

**"Contract not deployed" error:**
- Complete Step 0 first
- Make sure RECOVERY_CONTRACT_HASH is set in .env
- Restart the backend

**"NotInitialized" error (Error 10):**
- The target account doesn't have guardians set up
- Complete Step 1 first

**"NotGuardian" error (Error 5):**
- The connected wallet is not a registered guardian
- Switch to a guardian wallet

**Transaction stuck on "Waiting...":**
- Check the deploy on testnet.cspr.live
- Casper testnet can take 1-2 minutes
