export type SupportedChain = 'ethereum' | 'arbitrum' | 'solana' | 'monad';

export type SupportedToken = 'usdc' | 'usdt' | 'mon';

export type WalletProvider = 'metamask' | 'phantom' | 'backpack';

export type BridgeIntentStatus =
  | 'created'
  | 'pending_source'
  | 'pending_settlement'
  | 'settled'
  | 'failed';

export type BridgeSubmissionStatus =
  | 'awaiting_source'
  | 'pending_settlement'
  | 'settled'
  | 'failed';

export interface BridgeIntent {
  id: string;
  sourceChain: SupportedChain;
  sourceToken: SupportedToken;
  destinationChain: SupportedChain;
  destinationToken: SupportedToken;
  amount: number;
  walletProvider?: WalletProvider;
  feeBps: number;
  sourceUsdPrice: number;
  destinationUsdPrice: number;
  estimatedDestinationAmount: number;
  status: BridgeIntentStatus;
  createdAt: number;
  updatedAt: number;
}

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
