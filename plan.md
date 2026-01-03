🧱 Initial Setup (Before Anything Goes Wrong)
Step 0: Normal Life (Account Creation)

User initially has:

1 main key (weight = 1)

Key management threshold = 1

User does one-time setup:

🔐 register_account

User calls:

recovery_registry.register_account(
  user_account,
  guardians = [G1, G2, G3],
  threshold = 2
)


Contract stores:

Guardians list

Threshold = 2

Voting weights

⚠️ Still no power here — just data.

Step 1: User PRE-AUTHORIZES Recovery

User proactively increases security:

Adds guardian keys as associated keys

Sets:

key_management_threshold = 2

Now:

Key	Weight
User old key	1
Guardian 1	1
Guardian 2	1
Guardian 3	1

Threshold = 2

🧠 Meaning:

No single guardian
No single attacker
Can change keys alone

💥 Disaster Happens: User Loses Private Key

User cannot sign anything now.

But guardians still can.

🔄 Recovery Flow (Step by Step)
1️⃣ Guardian Initiates Recovery (NOT the user)
❓ Who calls initiate_recovery?

👉 ANYONE, usually a guardian or UI helper

Why allowed?

This function only creates a proposal

No power is exercised

initiate_recovery(
  user_account,
  new_public_key
)


Contract does:

Creates recovery_id

Stores:

target account

proposed new key

approvals = 0

🚫 No keys changed
🚫 No funds touched

2️⃣ Guardians Approve (Critical Part)

Each guardian independently:

🔐 approve_recovery(recovery_id)

Contract checks:

Caller ∈ guardians list

Caller hasn’t voted already

Contract updates:

Approval weight

Emits event

❗ Can a random attacker approve?

❌ No
They are not in guardian list.

3️⃣ Threshold Reached (Off-chain Decision)

At some point:

is_threshold_met(recovery_id) → true


This is just a view function.

🧠 Important:

The contract does NOT execute anything

It only says: “Enough guardians agree”

🔑 Now Comes the REAL POWER
4️⃣ add_associated_key.wasm Execution
❓ Who executes this?

👉 Guardians jointly

They deploy:

add_associated_key.wasm
args: new_public_key, weight=1

🔐 Why this works

Casper runtime enforces:

Key management threshold = 2

So:

Guardian A signs deploy

Guardian B signs deploy

✅ Threshold satisfied

❓ Can someone run this from console alone?

❌ NO

Why?

Because:

Runtime checks signing keys

Signatures must meet threshold

Contract state is irrelevant here

⚠️ Even if attacker ignores contract completely:

Runtime will reject execution

5️⃣ remove_associated_key.wasm

Now guardians remove the lost key:

remove_associated_key(old_public_key)


Again:

Requires threshold signatures

Cannot be faked

Cannot be bypassed

6️⃣ update_thresholds.wasm (Lock Down)

Final hardening step:

set_action_threshold(1)
set_key_management_threshold(1)


User regains:

Full control

Guardians no longer needed

🔐 Why Frontend Is NOT a Security Risk

You asked:

“Can’t they execute this from console even if consensus is not reached?”

Answer:

They can TRY. Runtime will reject.

Layer	Enforces Security
Contract	Social consensus
Frontend	UX gating
Casper Runtime	Cryptographic authority ✅

Even if someone:

Skips frontend

Skips contract

Uses raw casper-client

❌ They still need guardian signatures.

🧠 Why 3 Session WASMs (Your Earlier Confusion)

Because Casper separates powers:

Action	Runtime API
Add key	add_associated_key
Remove key	remove_associated_key
Adjust security	set_thresholds

Each is:

Auditable

Explicit

Minimizes blast radius

🔁 Final Flow Summary (One Breath)

1. User pre-registers guardians & threshold
2. User loses key
3. Guardian proposes recovery (contract)
4. uardians approve (contract)
5. Threshold reached (contract state)
6. Guardians jointly execute add_associated_key.wasm
7. Guardians remove old key
8. Thresholds reset
9. User is back in control 🎉