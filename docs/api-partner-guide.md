# Monolith Partner API Guide

This guide explains how integrators, market-makers, and automation partners can use Monolith’s HTTP APIs to onboard users, sponsor smart accounts, and submit cross-chain bridge intents. All endpoints are served from the Monolith API (NestJS) and currently return JSON.

- **Base URL (local development):** `http://localhost:3001/api`
- **Environments:** A hosted partner sandbox will expose the same routes once credentials are issued.
- **Authentication:** During development the API is open. In production a partner API key and HMAC signing scheme will scope rate limits, routing tiers, and revenue-share eligibility.

---

## 1. Smart Account Onboarding (`/api/aa`)

| Endpoint                        | Method | Description                                                                                                                                                                                                |
| ------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/aa/session`                   | `POST` | Start a new onboarding session for a MetaMask, email magic-link, or social login. Returns a `sessionId` and freshly generated account owner address. Store the `sessionId` — every follow-up call uses it. |
| `/aa/recovery`                  | `POST` | Persist recovery contacts, passkey enrolment, and quorum threshold for the session.                                                                                                                        |
| `/aa/sponsorships?plan=starter` | `GET`  | Retrieve sponsorship allowance and notes for the selected pricing tier.                                                                                                                                    |
| `/aa/onboard`                   | `POST` | Finalise a smart account. Provide recovery settings, sponsorship plan, and the wallets you linked during onboarding. Returns the smart account address plus the assigned paymaster policy.                 |
| `/aa/status/:sessionId`         | `GET`  | Poll session state (`pending`, `completed`, or `failed`). Also returns the owner address, login type, and previously linked wallets so you can resume onboarding flows after a refresh.                    |

### Linking Wallets

The onboarding payload now accepts a `linkedWallets` array:

```json
{
  "sessionId": "sess_mm_abcd12",
  "accountIntent": {
    "owner": "0x...",
    "loginType": "social",
    "email": "user@example.com",
    "recoveryContacts": [{ "type": "email", "value": "guardian@example.com" }],
    "recoveryThreshold": 1,
    "passkeyEnrolled": true,
    "linkedWallets": [
      { "provider": "metamask", "address": "0x1234...", "chains": ["ethereum", "arbitrum"] },
      { "provider": "phantom", "address": "BH477T...", "chains": ["solana"] }
    ]
  },
  "sponsorship": {
    "plan": "starter",
    "acceptedTermsVersion": "2025-02"
  }
}
```

Linking a Google/Apple account _and_ one or more wallets is now mandatory for bridging. The API persists the linked wallets on both the `session` and `account` records so subsequent calls can auto-detect balances.

---

## 2. Bridge & Intent APIs (`/api/bridge`)

| Endpoint                               | Method | Description                                                                                                                                                                |
| -------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/bridge/providers/:provider/balances` | `POST` | Discover bridgeable balances for a wallet provider (`metamask`, `phantom`, `backpack`). Returns intents with source/destination chains, available amounts, fees, and ETAs. |
| `/bridge/quote`                        | `POST` | Price a specific intent/amount pair. The response includes net destination amount, fee in source units, and an expiry timestamp.                                           |
| `/bridge/submit`                       | `POST` | Submit a bridge intent. Creates a persistent intent record, associates it with the session/account, and returns a simulated transaction hash plus async settlement status. |
| `/bridge/intents`                      | `POST` | (Internal) Create stored intents manually when orchestrating flows server-side.                                                                                            |
| `/bridge/intents/:id/status`           | `GET`  | Poll the status of a previously submitted intent.                                                                                                                          |

### Pricing data

- Stablecoin USD quotes come from Alchemy’s Price API when available.
- Monad’s `MON` token price is sourced from Hyperliquid’s pre-market API with a 30-second cache (`HYPERLIQUID_PRICE_URL` / `HYPERLIQUID_MON_SYMBOL` env vars). If the price feed is unreachable the service falls back to the configured static price.

Partners can integrate the quote + submit flow to automate treasury rebalancing, arbitrage between chains, or pull-through user experiences (e.g., a wallet “Bridge to Monad” button).

---

## 3. Automation Patterns

1. **Programmatic onboarding** — Create sessions server-side and email the magic link to users. Use `/aa/status` to detect completion and unlock product features automatically.
2. **Custodial sponsorship** — Batch create smart accounts, link house-controlled wallets, and fund them via the paymaster to remove UX friction for non-crypto-native users.
3. **Bridge automation** — Desktop apps or bots can poll balances, request quotes, and submit intents without touching the web UI. Useful for market-makers, remittance desks, or DAO treasuries.
4. **Embedded experiences** — By sharing the `sessionId` between mobile and desktop, an app can allow social sign-in on phone and wallet linking on a hardware-secured desktop in one flow.

Rate limiting, API keys, and webhook callbacks (for settled intents) will be rolled out alongside the partner sandbox.

---

## 4. Expansion & Monetisation Roadmap

These features underpin the paid tiers but are purposefully _not_ exposed inside the public pricing modal yet:

- **Fiat off-ramps:** ACH / SEPA payouts through regulated partners or agent networks, enabling direct cash-out from sponsored accounts.
- **Compliance tooling:** Configurable policy engine with OFAC screening, velocity limits, automated SAR drafts, and exportable audit artefacts for enterprise clients.
- **Analytics APIs:** Programmatic access to bridge volume, routing performance, fee share, and SLA metrics; pairs with hosted dashboards for finance teams.
- **Partner routing marketplace:** Revenue-share marketplace where LPs and alternative bridges bid to service intents, sharing upside with sponsored wallets.
- **Curated insights opt-in:** Starter users can contribute anonymised flow telemetry in exchange for fee rebates, lowering sponsorship costs while respecting privacy controls.

These roadmap items help justify the Pro and enterprise pricing while keeping the main UI uncluttered.

---

## 5. Next Steps for Partners

1. Generate a sandbox API key (coming soon) and point to the hosted test environment.
2. Automate session creation + status polling to embed onboarding in your product.
3. Use `/bridge/providers/:provider/balances` to pre-fill intents, then `/bridge/quote` and `/bridge/submit` to transact.
4. Report issues or request additional endpoints via the Monolith Partner Discord.
