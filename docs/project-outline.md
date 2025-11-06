# Monolith Project Outline

## 1. Vision & Value Proposition

- Deliver a low-cost, high-trust USDC ⇄ MON bridge tailored to the Monad ecosystem.
- Simplify onboarding for mainstream users through smart accounts and intuitive UX.
- Establish an extensible platform for future off-ramps, merchant tools, and institutional workflows.

## 2. Core Pillars

- **User Experience:** Minimal friction, progressive disclosure, responsive and mobile-ready.
- **Smart Accounts:** Default account abstraction via MetaMask Smart Accounts + Alchemy Smart Wallet SDK, with social recovery and session key support.
- **Bridge Reliability:** Deterministic settlement flow, slippage-aware routing, transparent fees.
- **Compliance & Observability:** Event audit trail, configurable limits, real-time monitoring.
- **Extensibility:** Modular architecture enabling new chains, tokens, and off-ramp services.

## 3. Architecture Overview

- **Frontend (Next.js + React + TypeScript):** Multi-tenant shell with landing, dashboard, and admin surfaces. Shared component library with design tokens.
- **Backend (NestJS + Node.js/TypeScript):** API gateway for bridge intents, account management, paymaster coordination, and notification services.
- **Relayer/Bridge Service (Rust microservice roadmap):** High-throughput settlement engine interfacing with Monad smart contracts; starts as Node-based worker for speed.
- **Smart Contracts (Solidity on Monad):** Bridge contracts, on-chain registry, paymaster integrations. Managed via Foundry tooling.
- **Data & Storage:** PostgreSQL for transactional/state data, Redis for caching + rate limiting, object storage (S3-compatible) for logs/exports.
- **Observability:** OpenTelemetry instrumentation, Prometheus/Grafana stack, with alerting hooks.
- **Infrastructure:** Monorepo managed with Turborepo + pnpm; CI/CD via GitHub Actions; IaC with Terraform (phase 2).

## 4. Feature Backlog

1. **MVP Bridge**
   - Smart-account onboarding (email/passkey + MetaMask fallback).
   - USDC ⇄ MON quote UI with instant feedback and fee breakdown.
   - Intent submission API, relayer execution, and status polling.
   - Notification tray for pending signature requests and confirmations.
2. **Compliance Layer**
   - Threshold and velocity checks with rule engine.
   - KYB/KYC provider integration toggle for enterprise users.
   - Audit log anchoring hashes on-chain.
3. **Liquidity & Pricing**
   - Router supporting DEX aggregation and internal liquidity pool.
   - Oracle cache for FX data (Pyth/Switchboard) with graceful degradation.
4. **Account Abstraction Enhancements**
   - Paymaster-backed gas sponsorship with usage quotas.
   - Session key management and hardware wallet linking.
5. **Analytics & Insights**
   - Dashboard for volume, fees, and latency metrics.
   - Exportable reports (CSV, API).
6. **Expansion & Monetisation Tracks**
   - **Fiat off-ramps:** Integrate regulated partners (PayPal or agent network) with KYC hooks and instant ACH/SEPA payouts so sponsored users can exit directly to fiat.
   - **Compliance tooling:** Policy engine with OFAC screening, velocity limits, rule-based approvals, and exportable audit artefacts for enterprise plans.
   - **Analytics APIs & dashboards:** Programmatic access to bridge volume, fee share, and latency metrics plus web dashboards for revenue reconciliation.
   - **Partner routing marketplace:** Allow LPs, market makers, and alternative bridges to plug in custom routes; share revenue with sponsored wallets via referral rebates.
   - **Data insights opt-in:** Starter users can opt into anonymised flow telemetry; rebates from aggregated insights offset sponsorship costs while respecting privacy controls.
   - **Merchant SDK & checkout widget:** Drop-in component for ecommerce platforms needing fast MON settlement.
   - **Institutional workspace:** Multi-user roles, delegated approvals, treasury reporting, and SOC2 audit support.
   - **Cross-chain asset expansion:** LayerZero/Wormhole connectors for additional stables post-mainnet.

## 5. Workstreams & Owners (to assign)

- **Product & Design:** UX flows, design system, user research.
- **Frontend Engineering:** Web app shell, AA integration, state management.
- **Backend Engineering:** API design, services, job runners, observability.
- **Protocol Engineering:** Smart contracts, Foundry tests, relayer logic.
- **DevOps & Security:** CI/CD, infrastructure, secrets management, audits.
- **Partnerships & Compliance:** Off-ramp relationships, policy frameworks.

## 6. Milestones & Timeline (indicative)

| Phase   | Goal                     | Target Deliverables                                                            |
| ------- | ------------------------ | ------------------------------------------------------------------------------ |
| Phase 0 | Foundations (Weeks 1-2)  | Repo setup, CI baseline, contracts skeleton, mock data pipeline, UI wireframes |
| Phase 1 | MVP Alpha (Weeks 3-6)    | Functional bridge demo w/ testnet, basic compliance hooks, paymaster beta      |
| Phase 2 | Beta Launch (Weeks 7-10) | Mainnet-readiness hardening, observability, documentation, support tooling     |
| Phase 3 | Expansion (Weeks 11+)    | Off-ramp pilot, institutional dashboard, additional chain integrations         |

## 7. KPI & Success Metrics

- Time-to-first-bridge under 2 minutes for new users.
- Sub-30 second average settlement confirmation.
- Fee spread vs benchmark bridges within ±10 bps.
- User retention (repeat bridging) ≥ 40% in first 30 days.
- Operational uptime ≥ 99.5% with alerting SLAs.

## 8. Risks & Mitigations

- **Smart contract vulnerabilities:** Enforce audits, fuzzing, bug bounty program.
- **Liquidity constraints:** Partner LP pools, dynamic fee adjustments, treasury buffer.
- **Regulatory shifts:** Pluggable compliance providers, modular policy engine.
- **User trust:** Transparent status, dispute resolution SLAs, public dashboards.
- **Scalability:** Stateless services, autoscaling, future Rust rewrite for relayer bottlenecks.

## 9. Documentation & Tracking

- Maintain living specs in `docs/` with versioned ADRs.
- Use GitHub Projects for roadmap tracking and milestone dashboards.
- Weekly progress summary meeting notes stored in `docs/status/`.
- Establish release checklist covering smart contracts, backend, and UI.

## 10. Next Steps

1. Confirm tech stack selections and repository governance.
2. Scaffold monorepo with Turborepo, Next.js app, and NestJS API.
3. Initialize Foundry project for Monad smart contracts.
4. Draft UX wireframes and onboarding journey.
5. Engage potential off-ramp partners for API exploration.
