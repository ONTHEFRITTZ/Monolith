export type SupportedChain = "ethereum" | "arbitrum" | "solana" | "monad";

export type SupportedToken = "usdc" | "usdt" | "mon";

export interface BalanceIntent {
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

export interface QuoteResponse {
  intentId: string;
  sourceAmount: number;
  destinationAmount: number;
  feeAmount: number;
  feeCurrency: SupportedToken;
  rate: number;
  expiresAt: number;
}

export interface BridgeSubmission {
  txHash: string;
  status: "awaiting_source" | "pending_settlement" | "settled" | "failed";
}

export interface BridgeState {
  isConnected: boolean;
  primaryAddress?: string;
  chainConnections: SupportedChain[];
  intents: BalanceIntent[];
  selectedIntent?: BalanceIntent;
  quote?: QuoteResponse;
  submission?: BridgeSubmission;
  isLoading: boolean;
  error?: string;
}

export interface BridgeActions {
  connectWallet: () => Promise<void>;
  disconnect: () => void;
  refreshBalances: () => Promise<void>;
  selectIntent: (intent: BalanceIntent | undefined) => void;
  requestQuote: (intentId: string, amount: number) => Promise<void>;
  submitBridge: (intentId: string, amount: number) => Promise<void>;
  resetSubmission: () => void;
  clearError: () => void;
}
