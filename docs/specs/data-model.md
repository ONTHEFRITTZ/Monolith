# Data Model & Compliance Hooks

## Overview

Monolith needs to ingest intents from multiple USDC supported chains (Ethereum, Arbitrum, Solana, etc.), optionally extend to other stablecoins (USDT, DAI), and always settle to MON on Monad. The platform also has to support smart-account onboarding metadata, gas sponsorship, and compliance review. This document captures the initial relational model and event hooks that will evolve into production services.

## Core Entities

### 1. Accounts & Sessions

- `aa_sessions`: short-lived onboarding sessions.
- `accounts`: canonical smart-account records after onboarding.
- `account_recovery_contacts`: guardians & thresholds.
- `account_sponsorships`: paymaster plans & quotas.
- `account_wallet_links`: track linked EOAs, Solana pubkeys, custodial ids.

### 2. Bridge Intents

- `bridge_intents`: high-level user intent to move funds from source chain/token to Monad MON.
- `bridge_routes`: execution path options (DEX, canonical bridge, partnered market maker).
- `bridge_transfers`: actual movements on source chain (hash, block, confirmations).
- `bridge_settlements`: resulting MON minting/swap on Monad.
- `bridge_events`: audit log of state transitions with metadata snapshots.

### 3. Liquidity & Pricing

- `liquidity_positions`: Monolith owned pools across supported networks.
- `price_feeds`: cached oracle data (Pyth, Switchboard, Chainlink) with freshness.
- `fx_rates`: fiat conversions (USD, EUR) for compliance reporting.

### 4. Compliance & Risk

- `compliance_cases`: flagged intents or accounts requiring review.
- `compliance_rules`: definition of rule set versions applied to intents.
- `kyc_profiles`: optional third-party verification payloads.
- `watchlist_hits`: matches against sanctions/PEP lists.
- `volume_limits`: per-account or per-entity thresholds.

### 5. Partner Integrations

- `offramp_requests`: PayPal/agent cash-out, status callbacks.
- `webhooks`: per partner tokens, secrets, retry metadata.

## Tables (Initial Schema Sketch)

> All timestamps are `TIMESTAMP WITH TIME ZONE`, IDs use ULIDs for sortable uniqueness.

### `accounts`

| column                  | type                                  | notes                                 |
| ----------------------- | ------------------------------------- | ------------------------------------- |
| `id`                    | ulid                                  | PK                                    |
| `smart_account_address` | varchar(80)                           | Monad address, unique                 |
| `primary_owner_address` | varchar(80)                           | EOA or smart account controlling user |
| `login_type`            | enum(`metamask`, `email`, `social`)   |                                       |
| `status`                | enum(`active`, `suspended`, `closed`) |                                       |
| `created_at`            | timestamptz                           |                                       |
| `updated_at`            | timestamptz                           |                                       |

### `aa_sessions`

| column          | type                                              | notes                        |
| --------------- | ------------------------------------------------- | ---------------------------- |
| `id`            | ulid                                              | PK                           |
| `session_id`    | varchar(64)                                       | External identifier, indexed |
| `login_type`    | enum                                              |                              |
| `email`         | citext nullable                                   |                              |
| `owner_address` | varchar(80)                                       |                              |
| `status`        | enum(`pending`, `completed`, `failed`, `expired`) |                              |
| `expires_at`    | timestamptz                                       | TTL                          |
| `created_at`    | timestamptz                                       |                              |
| `updated_at`    | timestamptz                                       |                              |

### `bridge_intents`

| column               | type                                                                                      | notes                                                  |
| -------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `id`                 | ulid                                                                                      | PK                                                     |
| `account_id`         | ulid FK -> accounts.id                                                                    |                                                        |
| `source_chain`       | enum(`ethereum`, `arbitrum`, `solana`, …)                                                 | extendable                                             |
| `source_token`       | enum(`usdc`, `usdt`, `dai`, …)                                                            |                                                        |
| `destination_chain`  | enum (default `monad`)                                                                    | eventually multi-destination                           |
| `amount_source`      | numeric(38,6)                                                                             | raw amount on source chain (token decimals normalized) |
| `amount_destination` | numeric(38,6)                                                                             | MON amount expected                                    |
| `quoted_rate`        | numeric(38,18)                                                                            | rate locked at creation                                |
| `slippage_bps`       | integer                                                                                   | requested slippage tolerance                           |
| `status`             | enum(`created`, `pending_source`, `pending_settlement`, `settled`, `failed`, `cancelled`) |                                                        |
| `risk_score`         | smallint                                                                                  | derived risk rating                                    |
| `created_at`         | timestamptz                                                                               |                                                        |
| `updated_at`         | timestamptz                                                                               |                                                        |

### `bridge_transfers`

| column          | type                                    | notes                          |
| --------------- | --------------------------------------- | ------------------------------ |
| `id`            | ulid                                    | PK                             |
| `intent_id`     | ulid FK -> bridge_intents.id            |                                |
| `tx_hash`       | varchar(128)                            | chain-specific                 |
| `chain`         | enum                                    | duplicates for quick filtering |
| `token`         | enum                                    |                                |
| `amount`        | numeric(38,6)                           |                                |
| `confirmations` | integer                                 |                                |
| `status`        | enum(`awaiting`, `confirmed`, `failed`) |                                |
| `observed_at`   | timestamptz                             |                                |
| `confirmed_at`  | timestamptz                             |                                |

### `bridge_settlements`

| column               | type          | notes                 |
| -------------------- | ------------- | --------------------- |
| `id`                 | ulid          | PK                    |
| `intent_id`          | ulid FK       |
| `settlement_tx_hash` | varchar(128)  | Monad transaction     |
| `mon_amount`         | numeric(38,6) | minted/swapped amount |
| `gas_used`           | numeric(38,6) | MON or USD equivalent |
| `completed_at`       | timestamptz   |                       |

### `compliance_cases`

| column        | type                                                                              | notes               |
| ------------- | --------------------------------------------------------------------------------- | ------------------- |
| `id`          | ulid                                                                              |                     |
| `intent_id`   | ulid FK nullable                                                                  | maybe account-level |
| `account_id`  | ulid FK nullable                                                                  |                     |
| `reason_code` | enum(`velocity_limit`, `blacklist_hit`, `large_amount`, `jurisdiction`, `manual`) |
| `severity`    | enum(`low`, `medium`, `high`)                                                     |
| `status`      | enum(`open`, `investigating`, `resolved`, `rejected`)                             |
| `notes`       | text                                                                              |                     |
| `created_at`  | timestamptz                                                                       |                     |
| `resolved_at` | timestamptz                                                                       |                     |

### `volume_limits`

| column       | type                               | notes |
| ------------ | ---------------------------------- | ----- |
| `id`         | ulid                               |
| `account_id` | ulid FK                            |
| `period`     | enum(`daily`, `weekly`, `monthly`) |
| `limit_usd`  | numeric(38,2)                      |
| `used_usd`   | numeric(38,2)                      |
| `reset_at`   | timestamptz                        |

### `liquidity_positions`

Key for managing cross-chain assets.
| column | type | notes |
| --- | --- | --- |
| `id` | ulid |
| `chain` | enum |
| `token` | enum |
| `balance` | numeric(38,6) |
| `capacity_usd` | numeric(38,2) |
| `updated_at` | timestamptz |

### `price_feeds`

| `id` | ulid |
| `source` | enum(`pyth`, `switchboard`, `chainlink`, `internal`) |
| `symbol` | varchar(32) |
| `price` | numeric(38,18) |
| `confidence` | numeric(38,18) |
| `updated_at` | timestamptz |

## Event Tracking

- `bridge_events`: append-only log with columns (`intent_id`, `event_type`, `payload`, `emitted_at`).
- Emit for: `INTENT_CREATED`, `SOURCE_CONFIRMED`, `RISK_ESCALATED`, `SETTLEMENT_SUBMITTED`, `SETTLEMENT_CONFIRMED`.
- Fed into analytics + compliance dashboards; stored in object storage (S3) for long-term retention.

## Compliance Hooks

1. **Pre-intent scoring**
   - Evaluate `account` risk profile + `volume_limits` before accepting new bridge.
   - Check watchlist/OFAC via 3rd party; log to `watchlist_hits`.
   - Auto-open `compliance_cases` if severity meets threshold.
2. **Source chain monitoring**
   - Confirm source transfers originate from whitelisted wallets (if institution).
   - Track interactions with mixers or flagged contracts using on-chain heuristics.
3. **Velocity checks**
   - Cron job resets `volume_limits`; escalate if `used_usd > limit_usd`.
4. **Post-settlement**
   - Retain settlement proof (receipt) and attach to case when flagged.
   - Generate audit digest anchored to Monad (Merkle root of daily bridge events).
5. **Off-ramp**
   - Offramp requests require account-level KYC. Store references to `kyc_profiles`.
   - Hold funds until compliance case resolved.

## Token Support Strategy

- Start with `USDC` across Ethereum, Arbitrum, Solana (USDC native + wormhole).
- Plug in token metadata via `supported_assets` table:
  | column | type |
  | --- | --- |
  | `id` | ulid |
  | `chain` | enum |
  | `token_symbol` | varchar(16) |
  | `token_address` | varchar(128) nullable (none for Solana native) |
  | `decimals` | smallint |
  | `is_stablecoin` | boolean |
  | `status` | enum(`active`, `maintenance`, `disabled`) |
- Allow toggling additional stablecoins (USDT, DAI) by enabling records; ensure compliance risk differs per asset (e.g., USDT historically higher scrutiny).

## API Updates Needed

- `POST /api/bridge/intents` – accepts `source_chain`, `source_token`, amount, slippage, compliance consent, etc.
- `GET /api/bridge/intents/:id/status` – returns combined view from `bridge_intents`, `bridge_transfers`, `bridge_settlements`.
- `POST /api/bridge/intents/:id/cancel` – for pending intents.
- `POST /api/bridge/events/webhook` – partner callbacks (off-ramp).

## Future Work

- Decide on persistent store (Postgres) + ORM (Prisma/TypeORM/Drizzle).
- Map Solana USDC bridging: track associated token accounts, Wormhole/Vyper flows.
- Implement multi-chain indexers (use Helios for Ethereum, Helius for Solana, custom for Monad).
- Integrate analytics & alerts (Prometheus + Grafana) with compliance feed.
- Document retention & GDPR policies for `kyc_profiles` (encrypted at rest, time-bound).

This schema is intentionally modular: onboarding metadata is decoupled from bridge intents so we can support external AA providers later, and support new destinations by adding enums + routes without schema rewrites.
