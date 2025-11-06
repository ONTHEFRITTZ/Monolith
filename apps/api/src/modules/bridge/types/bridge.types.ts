export const SupportedChainValues = [
  'ethereum',
  'arbitrum',
  'solana',
  'monad',
] as const;
export type SupportedChain = (typeof SupportedChainValues)[number];

export const SupportedTokenValues = ['usdc', 'usdt', 'mon'] as const;
export type SupportedToken = (typeof SupportedTokenValues)[number];

export const WalletProviderValues = [
  'metamask',
  'phantom',
  'backpack',
] as const;
export type WalletProvider = (typeof WalletProviderValues)[number];

export type BridgeIntentStatus =
  | 'created'
  | 'pending_source'
  | 'pending_settlement'
  | 'settled'
  | 'failed';

export const BridgeSubmissionStatusValues = [
  'awaiting_source',
  'pending_settlement',
  'settled',
  'failed',
] as const;
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
