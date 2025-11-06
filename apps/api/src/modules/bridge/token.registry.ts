import type { SupportedChain, SupportedToken } from './types/bridge.types';

export interface TokenDescriptor {
  contractAddress: string | null;
  decimals: number;
  fallbackUsdPrice: number;
}

export const TOKEN_REGISTRY: Record<
  SupportedChain,
  Record<SupportedToken, TokenDescriptor>
> = {
  ethereum: {
    usdc: {
      contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      decimals: 6,
      fallbackUsdPrice: 1,
    },
    usdt: {
      contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      decimals: 6,
      fallbackUsdPrice: 1,
    },
    mon: {
      contractAddress: null,
      decimals: 18,
      fallbackUsdPrice: 3,
    },
  },
  arbitrum: {
    usdc: {
      contractAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
      decimals: 6,
      fallbackUsdPrice: 1,
    },
    usdt: {
      contractAddress: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
      decimals: 6,
      fallbackUsdPrice: 1,
    },
    mon: {
      contractAddress: null,
      decimals: 18,
      fallbackUsdPrice: 3,
    },
  },
  solana: {
    usdc: {
      contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      decimals: 6,
      fallbackUsdPrice: 1,
    },
    usdt: {
      contractAddress: 'Es9vMFrzaCERhGquDRcWUxzb5EiiJCEFHKL5XxykJLe',
      decimals: 6,
      fallbackUsdPrice: 1,
    },
    mon: {
      contractAddress: null,
      decimals: 18,
      fallbackUsdPrice: 3,
    },
  },
  monad: {
    usdc: {
      contractAddress: null,
      decimals: 6,
      fallbackUsdPrice: 1,
    },
    usdt: {
      contractAddress: null,
      decimals: 6,
      fallbackUsdPrice: 1,
    },
    mon: {
      contractAddress: null,
      decimals: 18,
      fallbackUsdPrice: 3,
    },
  },
};
