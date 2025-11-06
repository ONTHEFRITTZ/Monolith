# Monolith TODO & Progress

_Last updated: 2025-11-06_

This checklist consolidates the remaining implementation items we have discussed so far. Use it to track progress between sessions and to avoid re-scoping work already completed.

## 1. Backend (NestJS + Prisma)

- [x] Finalise the Neon `DATABASE_URL`, run `npm exec --workspace apps/api prisma migrate dev`, and swap all in-memory session/intent maps to Prisma (`AaService`, `BridgeService`).
- [x] Persist onboarding flows (sessions, recovery contacts, linked wallets) via Prisma instead of local storage; ensure `readProfile` uses backend data when available.
- [x] Expose profile endpoints to read and update plan preferences (`GET/PATCH /api/aa/profile/:sessionId`).
- [x] Wire the paymaster policy ID + API key into the Alchemy AA client so sponsorship limits and plan tiers are enforced server-side.
- [x] Replace the mock AA onboarding responses with real Alchemy session lifecycle (status polling, recovery saves, sponsorship estimates).
- [ ] Implement Circle CCTP v2 settlement jobs for USDC intents (burn/mint flow, attestation polling, intent status updates).
- [ ] Add relayer job queue + watchdogs for stuck intents (CCTP timeouts, failed mints, retry logic).

## 2. Bridge Engine & Pricing

- [x] Swap the static quote registry for live pricing: pull MON/USDC from Hyperliquid pre-market feed and USDC FX data from Alchemy (or fallback oracle).
- [ ] Enable USDC-only intents for launch (Ethereum/Arbitrum/Solana ↔ Monad) and defer native MON pairs until DEX integration is ready.
- [ ] Remove the front-end mock bridge client once the Nest routes are complete; update `useBridgeState` to rely on `/api/bridge` exclusively.
- [ ] Implement submit/preview flows that talk to the bridge worker (or temporary stub) so “Preview bridge” exercises real routing logic without mainnet settlement.
- [ ] Add logging + alerting hooks to the bridge service for stuck submissions (ties into future compliance tooling).

## 3. Frontend (Next.js)

- [ ] Gate the “Plans & pricing” modal actions to actual API mutations (upgrade/downgrade) once backend endpoints exist.
- [x] Finish the auto sign-in story: when a profile exists server-side, skip the guest prompt, hydrate state from the API, and auto-connect linked wallets.
- [x] Offer optional Google/Apple SSO during onboarding in addition to wallet login; allow adding/removing socials inside the profile modal.
- [x] Surface Pro-tier controls (premium console UI) and add entry points for future API/compliance toggles.
- [ ] Add Hyperliquid-derived live pricing to the intent list and quick-amount presets so users see current USD values.
- [x] Update bridge UI copy/flows to reflect USDC-only launch and highlight the upcoming MON/AMM roadmap.
- [x] Add an On / Off ramp page describing Mint 4 onboarding plus footer CTA from the bridge.

## 4. Settlement, Liquidity & Lending Roadmap

- [ ] Integrate Circle CCTP v2 contracts (TokenMessenger/MessageTransmitter) for Ethereum, Arbitrum, Solana, and Monad; store required contract addresses/ABIs.
- [ ] Build the swap step for Monad: placeholder hook that will call the native MON/USDC AMM once the router address/ABI is provided.
- [ ] Design relayer custody model (hot wallet vs smart account) and ensure all swaps/mints are executed via that relayer while the paymaster covers user gas.
- [ ] Outline future lending integration: ability to deposit bridge-held USDC/MON into the AMM lending vault for yield, with supporting liquidation bots.
- [ ] Spec NFT-collateral lending path (oracle selection, loan contracts) for a future milestone; keep requirements documented here.

## 5. Monetisation & Expansion Tracks

- [ ] Implement Pro-tier API issuance: generate keys, document rate limits, and wire webhook delivery (per `docs/api-partner-guide.md`).
- [ ] Design the fiat off-ramp flow (PayPal/agent network) and outline compliance requirements before integrating provider SDKs.
- [ ] Integrate Circle Mint 4 for institutional on/off ramps (custody accounts, webhooks, fiat payout wiring).
- [ ] Build the compliance rule engine (thresholds, sanctions screening) and expose plan-based configuration.
- [ ] Draft analytics dashboards + insights opt-in pipeline (aggregate anonymised flow data, rebate model for Starter tier).
- [ ] Scope the partner routing marketplace: external route registry, revenue share contracts, and sponsorship rebate logic.

## 6. Testing & Ops

- [ ] Add integration tests for onboarding (session start + completion) and bridge quoting/submit flows once Prisma backing exists.
- [ ] Set up CI to run lint, type-check, and e2e smoke tests for both `apps/web` and `apps/api`.
- [ ] Document manual QA checklists (guest vs signed-in, multi-wallet linking, tier upgrades, bridge preview) in `docs/status/`.
- [ ] Prepare deployment scripts/Infrastructure notes (Neon migrations, environment secrets, paymaster rotation) ahead of beta launch.
