# SentinelX

**Decentralized Account Recovery for Casper Network**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Casper Network](https://img.shields.io/badge/Casper-Network-red.svg)](https://casper.network)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)

SentinelX enables trustless account recovery through threshold-based guardianship. Designate trusted friends as guardians who can collectively help you recover access if you lose your private key.

## Screenshots

<!-- Add screenshots here -->
| Landing Page | Dashboard | Recovery Flow |
|:------------:|:---------:|:-------------:|
| *Coming soon* | *Coming soon* | *Coming soon* |

## Features

- 🛡️ **Guardian-Based Recovery** — Your trusted contacts act as recovery guardians
- 🔐 **Threshold Signatures** — Requires M-of-N guardian consensus (e.g., 2 of 3)
- ⏱️ **30-Day Safety Period** — Time to cancel unauthorized recovery attempts
- ✅ **On-Chain Verification** — All signatures verified by smart contract
- 🔄 **Replay Protection** — Nonce and timestamp validation
- 📧 **Email Notifications** — Guardians receive approval requests via email

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                    │
│                     Next.js 15 + React 19 + TailwindCSS                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Landing │  │  Setup   │  │ Recovery │  │Dashboard │  │  Admin   │  │
│  │   Page   │  │  Wizard  │  │   Flow   │  │  Panel   │  │  Panel   │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ HTTP/REST
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              BACKEND                                     │
│                   Node.js + Express + TypeScript                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │   Recovery   │  │   Session    │  │   Account    │  │   Email     │  │
│  │   Service    │  │   Service    │  │   Service    │  │   Service   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘  │
└────────┬────────────────────┬────────────────────────────────┬──────────┘
         │                    │                                │
         ▼                    ▼                                ▼
┌─────────────────┐  ┌─────────────────┐              ┌─────────────────┐
│    SUPABASE     │  │  CASPER NETWORK │              │   SMTP SERVER   │
│   (PostgreSQL)  │  │    (Testnet)    │              │   (Nodemailer)  │
│                 │  │                 │              │                 │
│  - users        │  │  - Contracts    │              │  - Notifications│
│  - recoveries   │  │  - Deploys      │              │  - Approvals    │
│  - deploys      │  │  - Signatures   │              │                 │
└─────────────────┘  └─────────────────┘              └─────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          SMART CONTRACTS                                 │
│                          Rust + Casper SDK                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     recovery_registry                            │   │
│  │         (Guardian Management & Recovery Coordination)            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │
│  │  add_key    │ │ remove_key  │ │  update_    │ │ key_rotation    │   │
│  │   .wasm     │ │   .wasm     │ │ thresholds  │ │    .wasm        │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Recovery Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   1. SETUP   │────▶│  2. INITIATE │────▶│  3. APPROVE  │
│              │     │              │     │              │
│ User adds    │     │ Guardian     │     │ Guardians    │
│ guardians    │     │ starts       │     │ sign until   │
│ to account   │     │ recovery     │     │ threshold    │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
                                                 ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  6. DONE!    │◀────│  5. EXECUTE  │◀────│   4. WAIT    │
│              │     │              │     │              │
│ Account      │     │ Key rotation │     │ 30-day       │
│ recovered    │     │ on-chain     │     │ safety       │
└──────────────┘     └──────────────┘     └──────────────┘
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | Next.js 15, React 19, TypeScript | Web application |
| **Styling** | TailwindCSS 4, shadcn/ui, Radix UI | UI components |
| **Backend** | Node.js, Express, TypeScript | API server |
| **Database** | Supabase (PostgreSQL) | Data persistence |
| **Blockchain** | casper-js-sdk | Casper integration |
| **Contracts** | Rust, Casper SDK | On-chain logic |
| **Email** | Nodemailer | Guardian notifications |

## Project Structure

```
guardian-recovery-protocol/
├── contracts/                 # Rust smart contracts
│   ├── recovery_registry/     # Main coordination contract
│   ├── add_associated_key/    # Add key session WASM
│   ├── remove_associated_key/ # Remove key session WASM
│   ├── update_thresholds/     # Update thresholds WASM
│   └── wasm/                  # Compiled WASM output
│
├── backend/                   # Express API server
│   ├── src/
│   │   ├── services/          # Business logic
│   │   ├── routes/            # API endpoints
│   │   └── config/            # Configuration
│   ├── sql/                   # Database migrations
│   └── wasm/                  # Session WASMs for deploys
│
└── frontend/                  # Next.js application
    ├── app/                   # App router pages
    │   ├── setup/             # Guardian setup
    │   ├── recovery/          # Recovery initiation
    │   ├── dashboard/         # Guardian dashboard
    │   └── admin/             # Contract deployment
    ├── components/            # React components
    └── lib/                   # Utilities
```

## Quick Start

### Prerequisites

- Node.js 18+
- Rust (for contracts)
- [Casper Wallet](https://www.casperwallet.io/) browser extension
- Supabase account

### Installation

```bash
# Clone repository
git clone https://github.com/crypticsaiyan/guardian-recovery-protocol.git
cd guardian-recovery-protocol

# Build contracts
cd contracts
make prepare && make build

# Start backend (Terminal 1)
cd ../backend
npm install
cp .env.example .env    # Configure your environment
npm run dev             # Runs on http://localhost:3001

# Start frontend (Terminal 2)
cd ../frontend
npm install
npm run dev             # Runs on http://localhost:3000
```

### Environment Setup

**Backend** (`backend/.env`):
```env
CASPER_NODE_URL=https://rpc.testnet.casperlabs.io/rpc
CASPER_CHAIN_NAME=casper-test
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-key
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email
SMTP_PASS=your-app-password
```

## API Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/recovery/register` | POST | Register guardians for account |
| `/api/recovery/initiate` | POST | Start a recovery request |
| `/api/recovery/approve` | POST | Guardian approves recovery |
| `/api/recovery/status/:id` | GET | Get recovery status |
| `/api/session/add-key` | POST | Build add key deploy |
| `/api/session/remove-key` | POST | Build remove key deploy |
| `/api/multisig-deploy/sign` | POST | Add guardian signature |
| `/api/multisig-deploy/send` | POST | Execute final deploy |

## Security

| Protection | Description |
|------------|-------------|
| **Account Isolation** | Guardian keys are bound to specific accounts |
| **Threshold Enforcement** | Single guardian cannot recover alone |
| **Time-Lock** | 30-day delay before execution |
| **Replay Prevention** | Nonce and timestamp validation |
| **On-Chain Verification** | All signatures verified by smart contract |

## Documentation

| Component | Documentation |
|-----------|---------------|
| Smart Contracts | [contracts/README.md](./contracts/README.md) |
| Backend API | [backend/README.md](./backend/README.md) |
| Frontend App | [frontend/README.md](./frontend/README.md) |

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with ❤️ on <a href="https://casper.network">Casper Network</a>
</p>
