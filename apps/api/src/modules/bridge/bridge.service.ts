import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BridgeIntent as PrismaBridgeIntent, Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateIntentDto, IntentResponseDto } from './dto/create-intent.dto';
import {
  ProviderBalancesResponseDto,
  QuoteResponseDto,
  SubmitBridgeResponseDto,
} from './dto/balances.dto';
import { QuoteResult, QuoteService } from './quote.service';
import {
  BalanceIntent,
  BridgeIntentStatus,
  BridgeSubmissionStatus,
  SupportedChain,
  SupportedToken,
  WalletProvider,
} from './types/bridge.types';

interface BaseIntentConfig {
  id: string;
  sourceChain: SupportedChain;
  sourceToken: SupportedToken;
  destinationChain: SupportedChain;
  destinationToken: SupportedToken;
  availableAmount: number;
  usdValue: number;
  feeBps: number;
  etaMinutes: number;
}

const WALLET_PROVIDER_VALUES = ['metamask', 'phantom', 'backpack'] as const;

const PROVIDER_INTENT_CATALOG: Record<
  WalletProvider,
  readonly BaseIntentConfig[]
> = {
  metamask: [
    {
      id: 'eth_usdc_mon',
      sourceChain: 'ethereum',
      sourceToken: 'usdc',
      destinationChain: 'monad',
      destinationToken: 'mon',
      availableAmount: 1250.52,
      usdValue: 1250.52,
      feeBps: 12,
      etaMinutes: 7,
    },
    {
      id: 'arb_usdc_mon',
      sourceChain: 'arbitrum',
      sourceToken: 'usdc',
      destinationChain: 'monad',
      destinationToken: 'mon',
      availableAmount: 483.1,
      usdValue: 483.1,
      feeBps: 8,
      etaMinutes: 4,
    },
    {
      id: 'mon_mon_usdc_eth',
      sourceChain: 'monad',
      sourceToken: 'mon',
      destinationChain: 'ethereum',
      destinationToken: 'usdc',
      availableAmount: 1500,
      usdValue: 1500,
      feeBps: 18,
      etaMinutes: 9,
    },
  ],
  phantom: [
    {
      id: 'sol_usdc_mon',
      sourceChain: 'solana',
      sourceToken: 'usdc',
      destinationChain: 'monad',
      destinationToken: 'mon',
      availableAmount: 920.75,
      usdValue: 920.75,
      feeBps: 15,
      etaMinutes: 6,
    },
    {
      id: 'mon_mon_usdc_sol',
      sourceChain: 'monad',
      sourceToken: 'mon',
      destinationChain: 'solana',
      destinationToken: 'usdc',
      availableAmount: 640,
      usdValue: 640,
      feeBps: 20,
      etaMinutes: 8,
    },
  ],
  backpack: [
    {
      id: 'sol_usdc_mon_backpack',
      sourceChain: 'solana',
      sourceToken: 'usdc',
      destinationChain: 'monad',
      destinationToken: 'mon',
      availableAmount: 412.34,
      usdValue: 412.34,
      feeBps: 14,
      etaMinutes: 5,
    },
    {
      id: 'mon_mon_usdc_sol_backpack',
      sourceChain: 'monad',
      sourceToken: 'mon',
      destinationChain: 'solana',
      destinationToken: 'usdc',
      availableAmount: 860.12,
      usdValue: 860.12,
      feeBps: 19,
      etaMinutes: 8,
    },
  ],
};

const PROVIDER_CHAINS: Record<WalletProvider, SupportedChain[]> = {
  metamask: ['ethereum', 'arbitrum'],
  phantom: ['solana'],
  backpack: ['solana'],
};

const TOKEN_DECIMALS: Record<SupportedToken, number> = {
  usdc: 6,
  usdt: 6,
  mon: 18,
};

const QUOTE_EXPIRY_MS = 60_000;

function isWalletProvider(value: string): value is WalletProvider {
  return (WALLET_PROVIDER_VALUES as readonly string[]).includes(value);
}

@Injectable()
export class BridgeService {
  constructor(
    private readonly quoteService: QuoteService,
    private readonly prisma: PrismaService,
  ) {}

  async createIntent(payload: CreateIntentDto): Promise<IntentResponseDto> {
    const quote = await this.quoteService.quote(
      payload.sourceChain,
      payload.sourceToken,
      payload.destinationChain,
      payload.destinationToken,
      payload.amount,
    );

    const record = await this.persistIntent({
      payload: {
        sourceChain: payload.sourceChain,
        sourceToken: payload.sourceToken,
        destinationChain: payload.destinationChain,
        destinationToken: payload.destinationToken,
        amount: payload.amount,
      },
      quote,
      walletProvider: payload.walletProvider,
      status: 'created',
    });

    return this.mapIntentToResponse(record);
  }

  async detectBalances(
    providerInput: string,
    address: string,
    chains?: SupportedChain[],
  ): Promise<ProviderBalancesResponseDto> {
    const provider = this.assertWalletProvider(providerInput);
    const baseIntents = PROVIDER_INTENT_CATALOG[provider];

    const chainConnectionsSource =
      chains && chains.length > 0 ? chains : (PROVIDER_CHAINS[provider] ?? []);
    const chainConnections = Array.from(new Set(chainConnectionsSource));

    const intents = baseIntents.map((intent) =>
      this.buildBalanceIntent(provider, intent),
    );

    return {
      provider,
      address,
      chainConnections,
      intents,
    };
  }

  async quoteIntent(
    intentId: string,
    amount: number,
  ): Promise<QuoteResponseDto> {
    const { provider, base } = this.resolveBaseIntent(intentId);
    const sanitizedAmount = this.sanitizeAmount(amount, base.availableAmount);
    if (sanitizedAmount <= 0) {
      throw new BadRequestException(
        'Amount must be greater than zero and within your available balance.',
      );
    }

    const quote = await this.quoteService.quote(
      base.sourceChain,
      base.sourceToken,
      base.destinationChain,
      base.destinationToken,
      sanitizedAmount,
      base.feeBps,
    );

    const feeAmount = (base.feeBps / 10_000) * sanitizedAmount;
    const netAmount = sanitizedAmount - feeAmount;
    const rate =
      netAmount > 0 ? quote.estimatedDestinationAmount / netAmount : 0;

    return {
      intentId: this.composeIntentId(provider, base.id),
      sourceAmount: Number(sanitizedAmount.toFixed(6)),
      destinationAmount: Number(quote.estimatedDestinationAmount.toFixed(6)),
      feeAmount: Number(feeAmount.toFixed(6)),
      feeCurrency: base.sourceToken,
      rate: Number(rate.toFixed(6)),
      expiresAt: Date.now() + QUOTE_EXPIRY_MS,
    };
  }

  async submitIntent(
    intentId: string,
    amount: number,
  ): Promise<SubmitBridgeResponseDto> {
    const { provider, base } = this.resolveBaseIntent(intentId);
    const sanitizedAmount = this.sanitizeAmount(amount, base.availableAmount);
    if (sanitizedAmount <= 0) {
      throw new BadRequestException(
        'Amount must be greater than zero and within your available balance.',
      );
    }

    const submissionStatus: BridgeSubmissionStatus =
      sanitizedAmount <= base.availableAmount * 0.1
        ? 'awaiting_source'
        : 'pending_settlement';

    const quote = await this.quoteService.quote(
      base.sourceChain,
      base.sourceToken,
      base.destinationChain,
      base.destinationToken,
      sanitizedAmount,
      base.feeBps,
    );

    const record = await this.persistIntent({
      payload: {
        sourceChain: base.sourceChain,
        sourceToken: base.sourceToken,
        destinationChain: base.destinationChain,
        destinationToken: base.destinationToken,
        amount: sanitizedAmount,
      },
      quote,
      walletProvider: provider,
      status: this.mapSubmissionToIntentStatus(submissionStatus),
    });

    const txHash = this.generateTxHash(base.sourceChain);

    return {
      intentId: record.intentId,
      txHash,
      provider,
      sourceChain: base.sourceChain,
      destinationChain: base.destinationChain,
      sourceToken: base.sourceToken,
      destinationToken: base.destinationToken,
      status: submissionStatus,
    };
  }

  async getIntentStatus(id: string): Promise<IntentResponseDto> {
    const intent = await this.prisma.bridgeIntent.findUnique({
      where: { intentId: id },
    });
    if (!intent) {
      throw new NotFoundException(`Bridge intent ${id} not found`);
    }

    return this.mapIntentToResponse(intent);
  }

  private async persistIntent(params: {
    payload: {
      sourceChain: SupportedChain;
      sourceToken: SupportedToken;
      destinationChain: SupportedChain;
      destinationToken: SupportedToken;
      amount: number;
    };
    quote: QuoteResult;
    walletProvider?: WalletProvider;
    status?: BridgeIntentStatus;
    intentId?: string;
  }): Promise<PrismaBridgeIntent> {
    const intentId = params.intentId ?? randomUUID();

    return this.prisma.bridgeIntent.upsert({
      where: { intentId },
      update: {
        sourceChain: params.payload.sourceChain,
        sourceToken: params.payload.sourceToken,
        destinationChain: params.payload.destinationChain,
        destinationToken: params.payload.destinationToken,
        amount: new Prisma.Decimal(params.payload.amount),
        walletProvider: params.walletProvider,
        feeBps: params.quote.feeBps,
        estimatedDestination: new Prisma.Decimal(
          params.quote.estimatedDestinationAmount,
        ),
        status: params.status ?? 'created',
        destinationUsdPrice: new Prisma.Decimal(
          params.quote.destinationUsdPrice,
        ),
        sourceUsdPrice: new Prisma.Decimal(params.quote.sourceUsdPrice),
      },
      create: {
        intentId,
        sourceChain: params.payload.sourceChain,
        sourceToken: params.payload.sourceToken,
        destinationChain: params.payload.destinationChain,
        destinationToken: params.payload.destinationToken,
        amount: new Prisma.Decimal(params.payload.amount),
        walletProvider: params.walletProvider,
        feeBps: params.quote.feeBps,
        estimatedDestination: new Prisma.Decimal(
          params.quote.estimatedDestinationAmount,
        ),
        status: params.status ?? 'created',
        destinationUsdPrice: new Prisma.Decimal(
          params.quote.destinationUsdPrice,
        ),
        sourceUsdPrice: new Prisma.Decimal(params.quote.sourceUsdPrice),
      },
    });
  }

  private mapIntentToResponse(intent: PrismaBridgeIntent): IntentResponseDto {
    return {
      id: intent.intentId,
      sourceChain: intent.sourceChain as SupportedChain,
      sourceToken: intent.sourceToken as SupportedToken,
      destinationChain: intent.destinationChain as SupportedChain,
      destinationToken: intent.destinationToken as SupportedToken,
      amount: Number(intent.amount),
      feeBps: intent.feeBps,
      sourceUsdPrice: intent.sourceUsdPrice ? Number(intent.sourceUsdPrice) : 0,
      destinationUsdPrice: intent.destinationUsdPrice
        ? Number(intent.destinationUsdPrice)
        : 0,
      estimatedDestinationAmount: Number(intent.estimatedDestination),
      status: intent.status as IntentResponseDto['status'],
      walletProvider: intent.walletProvider as WalletProvider | undefined,
    };
  }

  private buildBalanceIntent(
    provider: WalletProvider,
    base: BaseIntentConfig,
  ): BalanceIntent {
    return {
      id: this.composeIntentId(provider, base.id),
      sourceChain: base.sourceChain,
      sourceToken: base.sourceToken,
      destinationChain: base.destinationChain,
      destinationToken: base.destinationToken,
      availableAmount: base.availableAmount,
      availableFormatted: this.formatAmount(
        base.availableAmount,
        base.sourceToken,
      ),
      usdValue: base.usdValue,
      feeBps: base.feeBps,
      etaMinutes: base.etaMinutes,
      provider,
    };
  }

  private composeIntentId(provider: WalletProvider, baseId: string): string {
    return `${provider}:${baseId}`;
  }

  private resolveBaseIntent(intentId: string): {
    provider: WalletProvider;
    base: BaseIntentConfig;
  } {
    const [providerRaw, rawId] = intentId.split(':');
    if (!providerRaw || !rawId) {
      throw new NotFoundException(`Bridge intent ${intentId} not found`);
    }

    if (!isWalletProvider(providerRaw)) {
      throw new NotFoundException(`Provider ${providerRaw} is not supported.`);
    }

    const base = PROVIDER_INTENT_CATALOG[providerRaw].find(
      (item) => item.id === rawId,
    );

    if (!base) {
      throw new NotFoundException(`Bridge intent ${intentId} not found`);
    }

    return { provider: providerRaw, base };
  }

  private sanitizeAmount(amount: number, max: number): number {
    if (!Number.isFinite(amount) || amount <= 0) {
      return 0;
    }
    return Math.min(Number(amount.toFixed(6)), max);
  }

  private mapSubmissionToIntentStatus(
    status: BridgeSubmissionStatus,
  ): BridgeIntentStatus {
    switch (status) {
      case 'awaiting_source':
        return 'pending_source';
      case 'pending_settlement':
        return 'pending_settlement';
      case 'settled':
        return 'settled';
      default:
        return 'failed';
    }
  }

  private generateTxHash(chain: SupportedChain): string {
    if (chain === 'solana') {
      return this.randomBase58(44);
    }
    return `0x${randomBytes(32).toString('hex')}`;
  }

  private randomBase58(length: number): string {
    const alphabet =
      '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const bytes = randomBytes(length);
    let output = '';
    for (let i = 0; i < length; i += 1) {
      output += alphabet[bytes[i] % alphabet.length];
    }
    return output;
  }

  private formatAmount(amount: number, token: SupportedToken): string {
    const decimals = TOKEN_DECIMALS[token];
    const minimumFractionDigits = decimals > 8 ? 4 : 2;
    const maximumFractionDigits = decimals > 8 ? 6 : 4;
    return `${amount.toLocaleString('en-US', {
      minimumFractionDigits,
      maximumFractionDigits,
    })} ${token.toUpperCase()}`;
  }

  private assertWalletProvider(value: string): WalletProvider {
    if (isWalletProvider(value)) {
      return value;
    }
    throw new NotFoundException(`Provider ${value} is not supported.`);
  }
}
