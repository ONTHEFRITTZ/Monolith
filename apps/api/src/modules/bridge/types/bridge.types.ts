export type SupportedChain = 'ethereum' | 'arbitrum' | 'solana' | 'monad';

export type SupportedToken = 'usdc' | 'usdt' | 'mon';

export type BridgeIntentStatus =
  | 'created'
  | 'pending_source'
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
  walletProvider?: string;
  feeBps: number;
  estimatedDestinationAmount: number;
  status: BridgeIntentStatus;
  createdAt: number;
  updatedAt: number;
}
