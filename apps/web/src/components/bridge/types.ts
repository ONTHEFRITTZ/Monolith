export type SupportedChain = "ethereum" | "arbitrum" | "solana" | "monad";

export type SupportedToken = "usdc" | "usdt" | "mon";

export type WalletProvider = "metamask" | "phantom" | "backpack";

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
  provider: WalletProvider;
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
  intentId: string;
  txHash: string;
  status: "awaiting_source" | "pending_settlement" | "settled" | "failed";
}

export interface BridgeState {
  isConnected: boolean;
  connectedWallets: WalletConnection[];
  chainConnections: SupportedChain[];
  intents: BalanceIntent[];
  selectedIntent?: BalanceIntent;
  quote?: QuoteResponse;
  submission?: BridgeSubmission;
  isLoading: boolean;
  error?: string;
}

export interface WalletConnection {
  provider: WalletProvider;
  address: string;
  chains: SupportedChain[];
}

export interface BridgeActions {
  connectProvider: (provider: WalletProvider) => Promise<void>;
  disconnectAll: () => Promise<void>;
  removeProvider: (provider: WalletProvider) => Promise<void>;
  refreshBalances: () => Promise<void>;
  selectIntent: (intent: BalanceIntent | undefined) => void;
  requestQuote: (intentId: string, amount: number) => Promise<void>;
  submitBridge: (intentId: string, amount: number) => Promise<void>;
  resetSubmission: () => void;
  clearError: () => void;
}
