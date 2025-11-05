# Mon-olith

Low-cost USDC ⇄ MON bridge for the Monad ecosystem with smart-account onboarding and mobile-first UX.

## Monorepo Layout

- `apps/web` – Next.js front-end (landing page, onboarding flow, bridge UI).
- `apps/api` – NestJS backend (AA onboarding, bridge API surface).
- `packages` – Reserved for shared libraries/modules.
- `docs` – Project outline, specs, and status notes.

## Prerequisites

- Node.js ≥ 18 (repo tested with v22.21.0).
- npm (workspace-aware) – run `npm install` at repo root.
- Browser wallets for testing: MetaMask, Phantom, Backpack.

## Environment Setup

Templates are provided so you can populate secrets later:

- `apps/web/.env.local.example` → copy to `.env.local` for front-end keys.
- `apps/api/.env.example` → copy to `.env` for backend keys.

Populate with your Alchemy credentials when ready:

```
NEXT_PUBLIC_ALCHEMY_APP_ID=...
NEXT_PUBLIC_ALCHEMY_ETH_API_URL=https://eth-mainnet.g.alchemy.com/v2/<key>
NEXT_PUBLIC_ALCHEMY_ARB_API_URL=https://arb-mainnet.g.alchemy.com/v2/<key>
NEXT_PUBLIC_ALCHEMY_SOL_API_URL=https://solana-mainnet.g.alchemy.com/v2/<key>
NEXT_PUBLIC_MONAD_RPC_URL=...
NEXT_PUBLIC_PAYMASTER_NAME=monolith
NEXT_PUBLIC_ENABLE_MOCK_BALANCES=true
```

Backend variables mirror the same RPC URLs plus paymaster secrets.

> Leave the keys blank for now—mock data remains enabled until real endpoints are configured.

## Install Dependencies

```bash
npm install
```

## Run the Apps Locally

In one terminal, launch both front-end and API with Turborepo:

```bash
npm run dev
```

- `apps/web` serves at http://localhost:3000 by default.
- `apps/api` listens on http://localhost:3001 (via Nest `PORT` env).

Alternatively, run them individually:

```bash
# Front-end
cd apps/web
npm run dev

# Backend
cd apps/api
npm run dev
```

## Preview the Bridge

1. Start the dev server (`npm run dev`).
2. Open http://localhost:3000/bridge
3. Connect MetaMask, Phantom, or Backpack (official SDKs/adapters are pre-integrated).
4. Mock balances appear per wallet provider; submit flows use simulated quotes until real RPC keys are supplied.

## Verification

Run lint checks across the monorepo:

```bash
npm run lint
```

## Next Steps

- Drop your Alchemy Smart Wallet App ID, RPC URLs, and paymaster credentials into the `.env` files.
- Swap the mock bridge client for real balance/quote services once backend endpoints are live.
- Provision Postgres and connect the Nest API to persist sessions/intents per `docs/specs/data-model.md`.
