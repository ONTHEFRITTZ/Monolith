# Monolith TODO & Progress

_Last updated: 2025-11-05_

This checklist consolidates the remaining implementation items we have discussed so far. Use it to track progress between sessions and to avoid re-scoping work already completed.

## 1. Backend (NestJS + Prisma)

- [x] Finalise the Neon `DATABASE_URL`, run `npm exec --workspace apps/api prisma migrate dev`, and swap all in-memory session/intent maps to Prisma (`AaService`, `BridgeService`).
- [x] Persist onboarding flows (sessions, recovery contacts, linked wallets) via Prisma instead of local storage; ensure `readProfile` uses backend data when available.
- [x] Expose profile endpoints to read and update plan preferences (`GET/PATCH /api/aa/profile/:sessionId`).
- [x] Wire the paymaster policy ID + API key into the Alchemy AA client so sponsorship limits and plan tiers are enforced server-side.
- [ ] Replace the mock AA onboarding responses with real Alchemy session lifecycle (status polling, recovery saves, sponsorship estimates).

## 2. Bridge Engine & Pricing

- [x] Swap the static quote registry for live pricing: pull MON/USDC from Hyperliquid pre-market feed and USDC FX data from Alchemy (or fallback oracle).
- [ ] Enable USDC (Solana) → MON intents and broaden token/chain enums accordingly.
- [ ] Remove the front-end mock bridge client once the Nest routes are complete; update `useBridgeState` to rely on `/api/bridge` exclusively.
- [ ] Implement submit/preview flows that talk to the bridge worker (or temporary stub) so “Preview bridge” exercises real routing logic without mainnet settlement.
- [ ] Add logging + alerting hooks to the bridge service for stuck submissions (ties into future compliance tooling).

## 3. Frontend (Next.js)

- [ ] Gate the “Plans & pricing” modal actions to actual API mutations (upgrade/downgrade) once backend endpoints exist.
- [x] Finish the auto sign-in story: when a profile exists server-side, skip the guest prompt, hydrate state from the API, and auto-connect linked wallets.
- [x] Offer optional Google/Apple SSO during onboarding in addition to wallet login; allow adding/removing socials inside the profile modal.
- [ ] Surface Pro-tier controls (API keys, compliance alerts, marketplace access toggles) once their endpoints return real data.
- [ ] Add Hyperliquid-derived live pricing to the intent list and quick-amount presets so users see current USD values.

## 4. Monetisation & Expansion Tracks

- [ ] Implement Pro-tier API issuance: generate keys, document rate limits, and wire webhook delivery (per `docs/api-partner-guide.md`).
- [ ] Design the fiat off-ramp flow (PayPal/agent network) and outline compliance requirements before integrating provider SDKs.
- [ ] Build the compliance rule engine (thresholds, sanctions screening) and expose plan-based configuration.
- [ ] Draft analytics dashboards + insights opt-in pipeline (aggregate anonymised flow data, rebate model for Starter tier).
- [ ] Scope the partner routing marketplace: external route registry, revenue share contracts, and sponsorship rebate logic.

## 5. Testing & Ops

- [ ] Add integration tests for onboarding (session start → completion) and bridge quoting/submit flows once Prisma backing exists.
- [ ] Set up CI to run lint, type-check, and e2e smoke tests for both `apps/web` and `apps/api`.
- [ ] Document manual QA checklists (guest vs signed-in, multi-wallet linking, tier upgrades, bridge preview) in `docs/status/`.
- [ ] Prepare deployment scripts/Infrastructure notes (Neon migrations, environment secrets, paymaster rotation) ahead of beta launch.

Tick items as they ship and extend the list for any new initiatives that surface during future planning sessions.
