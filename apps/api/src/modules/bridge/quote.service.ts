import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupportedChain, SupportedToken } from './types/bridge.types';
import { TOKEN_REGISTRY, TokenDescriptor } from './token.registry';

const ALCHEMY_CHAIN_IDS: Record<SupportedChain, string | null> = {
  ethereum: 'eth-mainnet',
  arbitrum: 'arb-mainnet',
  solana: 'sol-mainnet',
  monad: null,
};

const MON_PRICE_CACHE_TTL_MS = 30_000;

export interface QuoteResult {
  sourceUsdPrice: number;
  destinationUsdPrice: number;
  estimatedDestinationAmount: number;
  feeBps: number;
}

@Injectable()
export class QuoteService {
  private readonly logger = new Logger(QuoteService.name);
  private monPriceCache?:
    | {
        price: number;
        expiresAt: number;
      }
    | undefined;

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
    if (token === 'mon') {
      const monPrice = await this.fetchMonUsdPrice();
      if (typeof monPrice === 'number' && Number.isFinite(monPrice)) {
        return monPrice;
      }
    }

    const apiBase = this.config.get<string>('ALCHEMY_TOKEN_API_BASE');
    const apiKey = this.config.get<string>('ALCHEMY_TOKEN_API_KEY');
    const chainId = ALCHEMY_CHAIN_IDS[chain];

    if (
      !meta.contractAddress ||
      !apiBase ||
      !apiKey ||
      !chainId ||
      chainId.length === 0
    ) {
      return meta.fallbackUsdPrice;
    }

    try {
      const url = `${apiBase.replace(/\/$/, '')}/${chainId}/tokens/${meta.contractAddress}/price`;
      const response = await fetch(url, {
        headers: { 'X-Alchemy-Token': apiKey },
      });
      if (!response.ok) {
        throw new Error(`Token API returned ${response.status}`);
      }
      const data = (await response.json()) as {
        price?: { usd?: number };
        data?: { price?: { usd?: number } };
      };
      const usd = data.price?.usd ?? data.data?.price?.usd;
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

  private async fetchMonUsdPrice(): Promise<number | undefined> {
    const now = Date.now();
    if (this.monPriceCache && this.monPriceCache.expiresAt > now) {
      return this.monPriceCache.price;
    }

    const endpoint =
      this.config.get<string>('HYPERLIQUID_PRICE_URL') ??
      'https://api.hyperliquid.xyz/info';
    const symbol = this.config.get<string>('HYPERLIQUID_MON_SYMBOL') ?? 'MON';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ticker', coin: symbol }),
      });

      if (!response.ok) {
        throw new Error(`Hyperliquid returned ${response.status}`);
      }

      const data = (await response.json()) as {
        result?: {
          markPx?: string;
          last?: string;
          lastPx?: string;
          midPx?: string;
        };
      };

      const candidates = [
        data.result?.markPx,
        data.result?.lastPx,
        data.result?.last,
        data.result?.midPx,
      ]
        .map((value) => (value ? Number.parseFloat(value) : undefined))
        .filter(
          (value): value is number =>
            typeof value === 'number' && Number.isFinite(value) && value > 0,
        );

      const price = candidates.at(0);
      if (!price) {
        throw new Error('USD price missing from Hyperliquid payload');
      }

      this.monPriceCache = {
        price,
        expiresAt: now + MON_PRICE_CACHE_TTL_MS,
      };

      return price;
    } catch (error) {
      this.logger.warn(
        `Failed to retrieve MON price from Hyperliquid: ${(error as Error).message}`,
      );
      return this.monPriceCache?.price;
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
