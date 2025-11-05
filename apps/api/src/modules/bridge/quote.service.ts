import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupportedChain, SupportedToken } from './types/bridge.types';

interface TokenDescriptor {
  contractAddress: string | null;
  decimals: number;
  fallbackUsdPrice: number;
}

const TOKEN_REGISTRY: Record<
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
      fallbackUsdPrice: 1,
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
      fallbackUsdPrice: 1,
    },
  },
  solana: {
    usdc: {
      contractAddress: 'So11111111111111111111111111111111111111112', // placeholder wrapped SOL
      decimals: 6,
      fallbackUsdPrice: 1,
    },
    usdt: {
      contractAddress: 'Es9vMFrzaCERhGquDRcWUxzb5EiiJCEFHKL5XxykJLe', // native USDT
      decimals: 6,
      fallbackUsdPrice: 1,
    },
    mon: {
      contractAddress: null,
      decimals: 18,
      fallbackUsdPrice: 1,
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
      fallbackUsdPrice: 1,
    },
  },
};

export interface QuoteResult {
  sourceUsdPrice: number;
  destinationUsdPrice: number;
  estimatedDestinationAmount: number;
  feeBps: number;
}

@Injectable()
export class QuoteService {
  private readonly logger = new Logger(QuoteService.name);

  constructor(private readonly config: ConfigService) {}

  async quote(
    sourceChain: SupportedChain,
    sourceToken: SupportedToken,
    destinationChain: SupportedChain,
    destinationToken: SupportedToken,
    amount: number,
    feeBpsOverride?: number,
  ): Promise<QuoteResult> {
    const sourceMeta = TOKEN_REGISTRY[sourceChain][sourceToken];
    const destinationMeta = TOKEN_REGISTRY[destinationChain][destinationToken];

    const [sourceUsdPrice, destinationUsdPrice] = await Promise.all([
      this.fetchUsdPrice(sourceChain, sourceToken, sourceMeta),
      this.fetchUsdPrice(destinationChain, destinationToken, destinationMeta),
    ]);

    const feeBps =
      feeBpsOverride ?? this.estimateFeeBps(sourceChain, destinationChain);
    const fee = (feeBps / 10_000) * amount;
    const netAmount = amount - fee;

    const estimatedDestinationAmount = destinationUsdPrice
      ? (netAmount * sourceUsdPrice) / destinationUsdPrice
      : netAmount;

    return {
      sourceUsdPrice,
      destinationUsdPrice,
      estimatedDestinationAmount: Number(estimatedDestinationAmount.toFixed(6)),
      feeBps,
    };
  }

  private async fetchUsdPrice(
    chain: SupportedChain,
    token: SupportedToken,
    meta: TokenDescriptor,
  ): Promise<number> {
    const appId = this.config.get<string>('ALCHEMY_APP_ID');
    if (!meta.contractAddress || !appId) {
      return meta.fallbackUsdPrice;
    }

    try {
      const baseUrl = `https://api.g.alchemy.com/prices/v1/${appId}`;
      const url = `${baseUrl}/tokens/${chain}:${meta.contractAddress}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Alchemy prices API returned ${response.status}`);
      }
      const data = (await response.json()) as {
        data?: { price?: { usd?: number } };
      };
      const usd = data?.data?.price?.usd;
      if (!usd) {
        throw new Error('Price missing in response');
      }
      return usd;
    } catch (error) {
      this.logger.warn(
        `Falling back to static USD price for ${token} on ${chain}: ${(error as Error).message}`,
      );
      return meta.fallbackUsdPrice;
    }
  }

  private estimateFeeBps(
    sourceChain: SupportedChain,
    destinationChain: SupportedChain,
  ): number {
    if (sourceChain === 'solana' || destinationChain === 'solana') {
      return 18;
    }

    if (sourceChain !== destinationChain) {
      return 12;
    }

    return 6;
  }
}
