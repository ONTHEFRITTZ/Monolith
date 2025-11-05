# Mon-olith

Low-cost USDC <-> MON bridge for the Monad ecosystem with smart-account onboarding and mobile-first UX.

## Monorepo Layout

- `apps/web` - Next.js front-end (landing page, onboarding flow, bridge UI).
- `apps/api` - NestJS backend (AA onboarding, bridge API surface).
- `packages` - Reserved for shared libraries/modules.
- `docs` - Project outline, specs, and status notes.

## Prerequisites

- Node.js >= 18 (repo tested with v22.21.0).
- npm (workspace-aware) - run `npm install` at repo root.
- Browser wallets for testing: MetaMask, Phantom, Backpack.

## Environment Setup

Templates are provided so you can populate secrets later:

- `apps/web/.env.local.example` - copy to `.env.local` for front-end keys.
- `apps/api/.env.example` - copy to `.env` for backend keys.

Populate with your Alchemy credentials when ready:

```
NEXT_PUBLIC_ALCHEMY_APP_ID=...
NEXT_PUBLIC_ALCHEMY_ETH_API_URL=https://eth-mainnet.g.alchemy.com/v2/<key>
NEXT_PUBLIC_ALCHEMY_ARB_API_URL=https://arb-mainnet.g.alchemy.com/v2/<key>
NEXT_PUBLIC_ALCHEMY_SOL_API_URL=https://solana-mainnet.g.alchemy.com/v2/<key>
NEXT_PUBLIC_MONAD_RPC_URL=...
NEXT_PUBLIC_PAYMASTER_NAME=monolith
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
NEXT_PUBLIC_ENABLE_MOCK_BALANCES=true
```

- Set `NEXT_PUBLIC_ENABLE_MOCK_BALANCES=false` to route the bridge UI through the Nest API at `NEXT_PUBLIC_API_BASE_URL`.
- Backend variables mirror the same RPC URLs plus paymaster credentials:

```
PORT=3001
ALCHEMY_APP_ID=...
ALCHEMY_ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/<key>
ALCHEMY_ARB_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/<key>
ALCHEMY_SOL_RPC_URL=https://solana-mainnet.g.alchemy.com/v2/<key>
MONAD_RPC_URL=...
PAYMASTER_POLICY_ID=...
PAYMASTER_API_KEY=...
DATABASE_URL=postgresql://<user>:<password>@<host>/<database>?sslmode=require
```

- For development you can point `DATABASE_URL` at a hosted Postgres. See the Neon quickstart below.

> Leave the keys blank for now - mock data remains enabled until real endpoints are configured.

### Managed Postgres (Neon quickstart)

1. Visit https://neon.tech and create a free project (the “Starter” tier is fine for dev).
2. Once the project is created, open the “Connection Details” panel and copy the **Prisma** connection string. It already includes `?sslmode=require`.
3. Paste that URL into `apps/api/.env` as `DATABASE_URL`. Example:
   ```
   DATABASE_URL="postgresql://neondb_owner:...@ep-steel-123456.us-east-2.aws.neon.tech/neondb?sslmode=require"
   ```
4. Generate the Prisma client after updating the schema:
   ```bash
   cd apps/api
   npx prisma generate
   ```
5. Apply migrations once you are ready (`npx prisma migrate deploy`). The generated DB now stores AA sessions, recovery data, and bridge intents instead of the in-memory maps.

You can swap Neon for Supabase, Railway, or your own Postgres instance—just update `DATABASE_URL` accordingly.

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
- `apps/api` listens on http://localhost:3001 (via the `PORT` env).

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
2. Open http://localhost:3000/bridge.
3. Connect MetaMask, Phantom, or Backpack (official SDKs/adapters are pre-integrated).
4. To test with live API responses, set `NEXT_PUBLIC_ENABLE_MOCK_BALANCES=false` and ensure the Nest API is running. Leave the flag as `true` to keep using mock balances.

## Verification

Run lint checks across the monorepo:

```bash
npm run lint
```

## Next Steps

- Drop your Alchemy Smart Wallet App ID, RPC URLs, and paymaster credentials into the `.env` files.
- Toggle off the mock bridge client once you're ready to exercise the new bridge endpoints.
- Provision Postgres and connect the Nest API to persist sessions/intents per `docs/specs/data-model.md`.
