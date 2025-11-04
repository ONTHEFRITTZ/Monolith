# Bridge UI Specification

## Goals

- Mobile-first interface for bridging USDC ↔︎ MON with minimal cognitive load.
- Auto-detect eligible balances across supported chains (Ethereum, Arbitrum, Solana, etc.) and present intents as “from → to” options.
- Fast path for newcomers (connect wallet → pick intent → enter amount → confirm) with progressive disclosure for desktop enhancements later.

## User Flow

1. **Landing View**
   - Prompt to connect wallet or smart account (reuse AA session if already onboarded).
   - Displays active network connections detected via provider (EVM chains) and connected Solana wallet (Phantom/Backpack) when available.
2. **Eligible Intents**
   - After connection, list cards summarizing each balance eligible for bridging (e.g., “USDC · Ethereum → MON · Monad”).
   - Each card shows available balance, fees estimate, and ETA.
   - Intent selection opens amount entry drawer.
3. **Amount Entry**
   - Mobile bottom sheet with:
     - Max button.
     - Quick percentages (25/50/75/100%).
     - Output preview of destination amount (converted via real-time quote).
   - Warnings for insufficient liquidity or compliance holds.
4. **Review & Confirm**
   - Show source chain/token, destination, fees, expected MON received.
   - Action button: “Sign & Bridge”. Triggers signature / transaction flow.
5. **Status Tracking**
   - Inline state chips: “Awaiting source tx”, “Settling on Monad”.
   - Provide view-all status page later (desktop).

## Responsive Behavior

- **Mobile (≤768px)**: Single column, cards full width, bottom sheet for amount entry, toast updates.
- **Desktop**: Two-column layout (left: intent list, right: details & history). For MVP, reflow to narrower content, hide history placeholder.

## Components

- `BridgeFlow` – orchestrates connection state, balances, selected intent.
- `BalanceIntentList` – renders list of eligible intents.
- `IntentCard` – card for each source→destination option with balance + network icon.
- `AmountSheet` – controlled modal/sheet for entering amount & viewing quote.
- `BridgeReview` – summary and confirm button.
- `BridgeStatusBar` – inline status after submission (show mock progress).
- `useBridgeState` – hook managing wallet connection, balances (mocked), selected intent, quotes.
- `mockBridgeClient` – placeholder fetching balances, quotes, gas/fee estimates.

## Data Model (Frontend)

```ts
type SupportedChain = "ethereum" | "arbitrum" | "solana" | "monad";
type SupportedToken = "usdc" | "usdt" | "mon";

interface BalanceIntent {
  id: string;
  sourceChain: SupportedChain;
  sourceToken: SupportedToken;
  destinationChain: SupportedChain;
  destinationToken: SupportedToken;
  availableAmount: number;
  availableFormatted: string;
  usdValue: number;
  feeBps: number;
  etaMinutes: number;
}
```

## Future Desktop Enhancements (deferred)

- Advanced routing chooser (DEX vs. OTC).
- Historical transfers view with filters.
- Institutional batching / CSV upload.
- Gas sponsorship usage meter.

## Next Steps

1. Implement `BridgeFlow` with mocks matching the above.
2. Connect to actual balance & quote services once backend is ready.
3. Extend to USDT/other stables by toggling `SupportedToken` and adjusting compliance rules.
