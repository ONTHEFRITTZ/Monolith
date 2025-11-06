import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Account,
  BridgeIntent as PrismaBridgeIntent,
  Prisma,
  Session,
} from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateIntentDto, IntentResponseDto } from './dto/create-intent.dto';
import {
  ProviderBalancesResponseDto,
  QuoteResponseDto,
  SubmitBridgeResponseDto,
} from './dto/balances.dto';
import { QuoteResult, QuoteService } from './quote.service';
import { TOKEN_REGISTRY, TokenDescriptor } from './token.registry';
import { CctpService } from './cctp.service';
import {
  BalanceIntent,
  BridgeIntentStatus,
  BridgeSubmissionStatus,
  SupportedChain,
  SupportedToken,
  WalletProvider,
  WalletProviderValues,
} from './types/bridge.types';
import { LoginType, SponsorshipPlan } from '../aa/dto/onboard.dto';

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

interface DiscoveredBalance {
  chain: SupportedChain;
  token: SupportedToken;
  amount: number;
}

interface SessionContext {
  session: SessionWithAccount;
  accountId?: string | null;
  plan: SponsorshipPlan;
  allowanceUsd: number;
  paymasterEnabled: boolean;
  linkedProviders: Set<WalletProvider>;
}

type SessionWithAccount = Session & { account: Account | null };

const PROVIDER_INTENT_CATALOG: Record<
  WalletProvider,
  readonly BaseIntentConfig[]
> = {
  metamask: [
    {
      id: 'eth_usdc_monad',
      sourceChain: 'ethereum',
      sourceToken: 'usdc',
      destinationChain: 'monad',
      destinationToken: 'usdc',
      availableAmount: 1250.52,
      usdValue: 1250.52,
      feeBps: 12,
      etaMinutes: 7,
    },
    {
      id: 'arb_usdc_monad',
      sourceChain: 'arbitrum',
      sourceToken: 'usdc',
      destinationChain: 'monad',
      destinationToken: 'usdc',
      availableAmount: 483.1,
      usdValue: 483.1,
      feeBps: 8,
      etaMinutes: 4,
    },
    {
      id: 'monad_usdc_eth',
      sourceChain: 'monad',
      sourceToken: 'usdc',
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
      id: 'sol_usdc_monad',
      sourceChain: 'solana',
      sourceToken: 'usdc',
      destinationChain: 'monad',
      destinationToken: 'usdc',
      availableAmount: 920.75,
      usdValue: 920.75,
      feeBps: 15,
      etaMinutes: 6,
    },
    {
      id: 'monad_usdc_sol',
      sourceChain: 'monad',
      sourceToken: 'usdc',
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
      id: 'sol_usdc_monad_backpack',
      sourceChain: 'solana',
      sourceToken: 'usdc',
      destinationChain: 'monad',
      destinationToken: 'usdc',
      availableAmount: 412.34,
      usdValue: 412.34,
      feeBps: 14,
      etaMinutes: 5,
    },
    {
      id: 'monad_usdc_sol_backpack',
      sourceChain: 'monad',
      sourceToken: 'usdc',
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
const SUPPORTED_CHAIN_VALUES: SupportedChain[] = [
  'ethereum',
  'arbitrum',
  'solana',
  'monad',
];

function isSupportedChainValue(value: string): value is SupportedChain {
  return (SUPPORTED_CHAIN_VALUES as readonly string[]).includes(value);
}

const QUOTE_EXPIRY_MS = 60_000;
const PLAN_ALLOWANCES_USD: Record<SponsorshipPlan, number> = {
  [SponsorshipPlan.STARTER]: 50,
  [SponsorshipPlan.PRO]: 250,
  [SponsorshipPlan.SELF]: 0,
};
const PROVIDER_LABEL: Record<WalletProvider, string> = {
  metamask: 'MetaMask',
  phantom: 'Phantom',
  backpack: 'Backpack',
};

function isWalletProvider(value: string): value is WalletProvider {
  return (WalletProviderValues as readonly string[]).includes(value);
}

@Injectable()
export class BridgeService {
  private readonly logger = new Logger(BridgeService.name);
  private readonly dynamicIntents = new Map<string, BaseIntentConfig>();

  constructor(
    private readonly quoteService: QuoteService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cctpService: CctpService,
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

  private async fetchChainBalances(
    chain: SupportedChain,
    address: string,
  ): Promise<DiscoveredBalance[]> {
    if (chain === 'ethereum' || chain === 'arbitrum') {
      return this.fetchEvmTokenBalances(chain, address);
    }

    if (chain === 'solana') {
      return this.fetchSolanaTokenBalances(address);
    }

    // Monad balances are not yet discoverable via RPC; return empty.
    return [];
  }

  private async fetchEvmTokenBalances(
    chain: 'ethereum' | 'arbitrum',
    address: string,
  ): Promise<DiscoveredBalance[]> {
    const rpcUrl =
      chain === 'ethereum'
        ? this.config.get<string>('ALCHEMY_ETH_RPC_URL')
        : this.config.get<string>('ALCHEMY_ARB_RPC_URL');

    if (!rpcUrl) {
      this.logger.warn(`Missing ${chain} RPC URL; skipping balance discovery.`);
      return [];
    }

    const entries = Object.entries(TOKEN_REGISTRY[chain]).filter(([, meta]) =>
      Boolean(meta.contractAddress),
    ) as Array<[SupportedToken, TokenDescriptor]>;

    if (entries.length === 0) {
      return [];
    }

    const contractAddresses = entries.map(
      ([, meta]) => meta.contractAddress as string,
    );

    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'alchemy_getTokenBalances',
      params: [address, contractAddresses],
    };

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(
        `alchemy_getTokenBalances returned ${response.status} on ${chain}`,
      );
    }

    const data = (await response.json()) as {
      result?: {
        tokenBalances?: Array<{
          contractAddress: string;
          tokenBalance: string;
        }>;
      };
    };

    const balances = data.result?.tokenBalances ?? [];
    const balanceMap = new Map(
      balances.map((item) => [
        (item.contractAddress ?? '').toLowerCase(),
        item.tokenBalance ?? '0x0',
      ]),
    );

    const results: DiscoveredBalance[] = [];
    entries.forEach(([token, meta]) => {
      const rawHex =
        balanceMap.get((meta.contractAddress as string).toLowerCase()) ?? '0x0';
      const normalizedHex = rawHex === '0x' ? '0x0' : rawHex;
      const raw = BigInt(normalizedHex);
      if (raw === 0n) {
        return;
      }
      const amount = Number(raw) / Math.pow(10, Math.max(meta.decimals, 0));
      if (amount <= 0) {
        return;
      }
      results.push({
        chain,
        token,
        amount,
      });
    });

    return results;
  }

  private purgeDynamicIntentsForProvider(provider: WalletProvider): void {
    const prefix = `${provider}:`;
    for (const key of Array.from(this.dynamicIntents.keys())) {
      if (key.startsWith(prefix)) {
        this.dynamicIntents.delete(key);
      }
    }
  }

  private async fetchSolanaTokenBalances(
    address: string,
  ): Promise<DiscoveredBalance[]> {
    const rpcUrl = this.config.get<string>('ALCHEMY_SOL_RPC_URL');
    if (!rpcUrl) {
      this.logger.warn('Missing Solana RPC URL; skipping balance discovery.');
      return [];
    }

    const entries = Object.entries(TOKEN_REGISTRY.solana).filter(([, meta]) =>
      Boolean(meta.contractAddress),
    ) as Array<[SupportedToken, TokenDescriptor]>;

    if (entries.length === 0) {
      return [];
    }

    const results: DiscoveredBalance[] = [];

    for (const [token, meta] of entries) {
      try {
        const payload = {
          jsonrpc: '2.0',
          id: 1,
          method: 'getTokenAccountsByOwner',
          params: [
            address,
            { mint: meta.contractAddress },
            { encoding: 'jsonParsed' },
          ],
        };

        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(
            `getTokenAccountsByOwner returned ${response.status} for mint ${meta.contractAddress}`,
          );
        }

        const data = (await response.json()) as {
          result?: {
            value?: Array<{
              account?: {
                data?: {
                  parsed?: {
                    info?: {
                      tokenAmount?: { amount?: string; decimals?: number };
                    };
                  };
                };
              };
            }>;
          };
        };

        const accounts = data.result?.value ?? [];
        let total = 0;

        accounts.forEach((account) => {
          const amountStr =
            account.account?.data?.parsed?.info?.tokenAmount?.amount ?? '0';
          const decimals =
            account.account?.data?.parsed?.info?.tokenAmount?.decimals ??
            meta.decimals;
          const raw = BigInt(amountStr);
          if (raw === 0n) {
            return;
          }
          total += Number(raw) / Math.pow(10, Math.max(decimals, 0));
        });

        if (total > 0) {
          results.push({
            chain: 'solana',
            token,
            amount: total,
          });
        }
      } catch (error) {
        this.logger.warn(
          `Failed to fetch Solana balance for ${token}: ${(error as Error).message}`,
        );
      }
    }

    return results;
  }

  private async buildDynamicIntentsForChain(
    provider: WalletProvider,
    chain: SupportedChain,
    address: string,
  ): Promise<BalanceIntent[]> {
    const balances = await this.fetchChainBalances(chain, address);
    if (balances.length === 0) {
      return [];
    }

    const intents: BalanceIntent[] = [];
    let index = 0;

    for (const balance of balances) {
      if (balance.amount <= 0) {
        continue;
      }

      const destinationToken: SupportedToken =
        balance.chain === 'monad' ? balance.token : 'mon';

      try {
        const quote = await this.quoteService.quote(
          balance.chain,
          balance.token,
          'monad',
          destinationToken,
          balance.amount,
        );

        const idBase = `${balance.chain}_${balance.token}_to_monad_${destinationToken}_${index}`;
        index += 1;
        const usdValue = Number(
          (balance.amount * quote.sourceUsdPrice).toFixed(2),
        );

        const dynamicBase: BaseIntentConfig = {
          id: idBase,
          sourceChain: balance.chain,
          sourceToken: balance.token,
          destinationChain: 'monad',
          destinationToken,
          availableAmount: Number(balance.amount.toFixed(6)),
          usdValue,
          feeBps: quote.feeBps,
          etaMinutes: this.estimateEtaMinutes(balance.chain),
        };

        const intentBase = this.buildBalanceIntent(provider, dynamicBase, {
          usdValue,
          feeBps: quote.feeBps,
        });

        const intent: BalanceIntent = {
          ...intentBase,
          availableFormatted: this.formatAmount(balance.amount, balance.token),
        };

        intents.push(intent);
        this.dynamicIntents.set(intent.id, {
          ...dynamicBase,
          availableAmount: balance.amount,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to quote ${balance.token} on ${balance.chain}: ${(error as Error).message}`,
        );
      }
    }

    return intents;
  }

  async detectBalances(
    providerInput: string,
    address: string,
    chains?: SupportedChain[],
    sessionId?: string,
  ): Promise<ProviderBalancesResponseDto> {
    const provider = this.assertWalletProvider(providerInput);
    if (sessionId) {
      await this.resolveSessionContext(sessionId, undefined, {
        optional: true,
      });
    }
    const requestedChains =
      chains && chains.length > 0 ? chains : (PROVIDER_CHAINS[provider] ?? []);
    let chainConnections = Array.from(new Set(requestedChains));
    let intents: BalanceIntent[] = [];

    try {
      const discovery = await this.discoverProviderBalances(
        provider,
        address,
        requestedChains,
      );
      if (discovery.intents.length > 0) {
        intents = discovery.intents;
        chainConnections = discovery.chainConnections;
      }
    } catch (error) {
      this.logger.warn(
        `Falling back to static balances for ${provider}: ${(error as Error).message}`,
      );
    }

    if (intents.length === 0) {
      const baseIntents = PROVIDER_INTENT_CATALOG[provider];
      const enriched = await Promise.all(
        baseIntents.map(async (intent) => {
          try {
            const quote = await this.quoteService.quote(
              intent.sourceChain,
              intent.sourceToken,
              intent.destinationChain,
              intent.destinationToken,
              intent.availableAmount,
              intent.feeBps,
            );
            const usdValue = intent.availableAmount * quote.sourceUsdPrice;
            return this.buildBalanceIntent(provider, intent, {
              usdValue,
              feeBps: quote.feeBps,
            });
          } catch (error) {
            this.logger.warn(
              `Falling back to cached USD value for ${intent.sourceToken} on ${intent.sourceChain}: ${
                (error as Error).message
              }`,
            );
            return this.buildBalanceIntent(provider, intent);
          }
        }),
      );
      intents = enriched;
    }

    if (sessionId) {
      await this.ensureProviderLinked(
        sessionId,
        provider,
        address,
        chainConnections,
      );
    }

    return {
      provider,
      address,
      chainConnections,
      intents,
    };
  }

  private async discoverProviderBalances(
    provider: WalletProvider,
    address: string,
    requestedChains: SupportedChain[],
  ): Promise<{
    intents: BalanceIntent[];
    chainConnections: SupportedChain[];
  }> {
    const targets =
      requestedChains.length > 0
        ? Array.from(new Set(requestedChains))
        : (PROVIDER_CHAINS[provider] ?? []);

    this.purgeDynamicIntentsForProvider(provider);

    const results = await Promise.all(
      targets.map(async (chain) => {
        try {
          const intents = await this.buildDynamicIntentsForChain(
            provider,
            chain,
            address,
          );
          return { chain, intents };
        } catch (error) {
          this.logger.warn(
            `Failed to collect balances on ${chain} for ${provider}: ${(error as Error).message}`,
          );
          return { chain, intents: [] as BalanceIntent[] };
        }
      }),
    );

    const activeChains = results
      .filter((item) => item.intents.length > 0)
      .map((item) => item.chain);

    const intents = results.flatMap((item) => item.intents);

    return {
      intents,
      chainConnections:
        activeChains.length > 0 ? activeChains : targets.slice(),
    };
  }

  async quoteIntent(
    intentId: string,
    amount: number,
    sessionId?: string,
    _slippageBps?: number,
  ): Promise<QuoteResponseDto> {
    const { provider, base } = this.resolveBaseIntent(intentId);
    const sessionCtx = await this.resolveSessionContext(sessionId, provider);
    if (!sessionCtx) {
      throw new BadRequestException(
        'Session context is required to generate a sponsored quote. Sign in first.',
      );
    }
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

    const usdAmount = sanitizedAmount * quote.sourceUsdPrice;
    await this.assertAllowance(sessionCtx, usdAmount);

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
    sessionId?: string,
    _slippageBps?: number,
  ): Promise<SubmitBridgeResponseDto> {
    const { provider, base } = this.resolveBaseIntent(intentId);
    const sessionCtx = await this.resolveSessionContext(sessionId, provider);
    if (!sessionCtx) {
      throw new BadRequestException(
        'Session context is required to submit sponsored bridge intents. Sign in first.',
      );
    }
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

    const usdAmount = sanitizedAmount * quote.sourceUsdPrice;
    await this.assertAllowance(sessionCtx, usdAmount);

    const cctpResult = await this.cctpService.simulateTransfer({
      intentId,
      sourceChain: base.sourceChain,
      destinationChain: base.destinationChain,
      amount: sanitizedAmount,
      walletProvider: provider,
    });

    const submissionStatus: BridgeSubmissionStatus = cctpResult.status;

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
      sessionId: sessionCtx.session.sessionId,
      accountId: sessionCtx.accountId ?? undefined,
    });

    const txHash = cctpResult.txHash || this.generateTxHash(base.sourceChain);

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
    sessionId?: string;
    accountId?: string;
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
        sessionId: params.sessionId,
        accountId: params.accountId ?? null,
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
        sessionId: params.sessionId,
        accountId: params.accountId ?? null,
      },
    });
  }

  private async resolveSessionContext(
    sessionId?: string,
    requiredProvider?: WalletProvider,
    options?: { optional?: boolean },
  ): Promise<SessionContext | null> {
    if (!sessionId) {
      if (options?.optional) {
        return null;
      }
      throw new BadRequestException(
        'Session context is required to use sponsored bridging. Sign in first.',
      );
    }

    const session = await this.prisma.session.findUnique({
      where: { sessionId },
      include: { account: true },
    });

    if (!session) {
      if (options?.optional) {
        return null;
      }
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    const planRaw = session.sponsorshipPlan as SponsorshipPlan | null;
    const plan =
      planRaw && Object.values(SponsorshipPlan).includes(planRaw)
        ? planRaw
        : SponsorshipPlan.STARTER;
    const allowanceUsd = PLAN_ALLOWANCES_USD[plan] ?? 0;
    const paymasterEnabled = plan !== SponsorshipPlan.SELF;
    const linkedProviders = this.extractLinkedProviders(session.linkedWallets);

    if (
      requiredProvider &&
      !this.isProviderLinked(
        requiredProvider,
        linkedProviders,
        session.loginType as LoginType | null,
      )
    ) {
      throw new ForbiddenException(
        `The ${PROVIDER_LABEL[requiredProvider]} wallet must be linked via onboarding before bridging.`,
      );
    }

    return {
      session,
      accountId: session.accountId ?? session.account?.id ?? null,
      plan,
      allowanceUsd,
      paymasterEnabled,
      linkedProviders,
    };
  }

  private async assertAllowance(
    context: SessionContext | null,
    additionalUsd: number,
  ): Promise<void> {
    if (!context || context.allowanceUsd <= 0) {
      return;
    }

    if (!context.accountId) {
      this.logger.warn(
        `Missing account linkage for session ${context.session.sessionId}; skipping allowance enforcement.`,
      );
      return;
    }

    const windowStart = this.startOfCurrentMonth();

    const intents = await this.prisma.bridgeIntent.findMany({
      where: {
        accountId: context.accountId,
        createdAt: { gte: windowStart },
        status: { not: 'failed' },
      },
      select: {
        amount: true,
        sourceUsdPrice: true,
      },
    });

    const consumedUsd = intents.reduce((total, record) => {
      const amount = Number(record.amount ?? 0);
      const price = Number(record.sourceUsdPrice ?? 0);
      return total + amount * price;
    }, 0);

    if (consumedUsd + additionalUsd - context.allowanceUsd > 0.01) {
      throw new BadRequestException(
        'Sponsorship allowance exceeded for this plan. Upgrade or wait for the next billing cycle.',
      );
    }
  }

  private startOfCurrentMonth(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }

  private async ensureProviderLinked(
    sessionId: string,
    provider: WalletProvider,
    address: string,
    chains: SupportedChain[],
  ): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { sessionId },
      select: {
        linkedWallets: true,
        accountId: true,
        smartAccountAddress: true,
      },
    });

    if (!session) {
      return;
    }

    const normalizedAddress = address.toLowerCase();
    const records = this.parseLinkedWalletRecords(session.linkedWallets);
    const mergedChains = this.mergeChainLists([], chains);
    let changed = false;

    const nextRecords = records.map((wallet) => {
      if (wallet.provider !== provider) {
        return wallet;
      }

      if (wallet.address.toLowerCase() === normalizedAddress) {
        const updatedChains = this.mergeChainLists(wallet.chains, mergedChains);
        if (
          updatedChains.length !== wallet.chains.length ||
          updatedChains.some((chain, index) => chain !== wallet.chains[index])
        ) {
          changed = true;
          return { provider, address, chains: updatedChains };
        }
        return wallet;
      }

      changed = true;
      return { provider, address, chains: mergedChains };
    });

    const providerExists = records.some(
      (wallet) => wallet.provider === provider,
    );

    let finalRecords = nextRecords;
    if (!providerExists) {
      changed = true;
      finalRecords = [
        ...nextRecords,
        { provider, address, chains: mergedChains },
      ];
    }

    if (!changed) {
      return;
    }

    const linkedWalletsJson = finalRecords.map((wallet) => ({
      provider: wallet.provider,
      address: wallet.address,
      chains: wallet.chains,
    })) as unknown as Prisma.JsonArray;

    await this.prisma.session.update({
      where: { sessionId },
      data: { linkedWallets: linkedWalletsJson },
    });

    if (session.accountId) {
      await this.prisma.account.update({
        where: { id: session.accountId },
        data: { linkedWallets: linkedWalletsJson },
      });
    } else {
      try {
        await this.prisma.account.update({
          where: { smartAccountAddress: session.smartAccountAddress },
          data: { linkedWallets: linkedWalletsJson },
        });
      } catch (error) {
        this.logger.warn(
          `Failed to sync linked wallets for account ${session.smartAccountAddress}: ${(error as Error).message}`,
        );
      }
    }
  }

  private parseLinkedWalletRecords(
    value: Prisma.JsonValue | null | undefined,
  ): Array<{
    provider: WalletProvider;
    address: string;
    chains: SupportedChain[];
  }> {
    if (!Array.isArray(value)) {
      return [];
    }

    const records: Array<{
      provider: WalletProvider;
      address: string;
      chains: SupportedChain[];
    }> = [];

    value.forEach((item) => {
      if (!item || typeof item !== 'object') {
        return;
      }
      const entry = item as Record<string, unknown>;
      const providerRaw = entry.provider;
      const addressRaw = entry.address;
      if (
        typeof providerRaw === 'string' &&
        isWalletProvider(providerRaw) &&
        typeof addressRaw === 'string'
      ) {
        const chainsRaw = Array.isArray(entry.chains) ? entry.chains : [];
        const chains = chainsRaw
          .filter(
            (chain): chain is SupportedChain =>
              typeof chain === 'string' && isSupportedChainValue(chain),
          )
          .reduce<
            SupportedChain[]
          >((acc, chain) => (acc.includes(chain) ? acc : [...acc, chain]), []);

        records.push({
          provider: providerRaw,
          address: addressRaw,
          chains,
        });
      }
    });

    return records;
  }

  private mergeChainLists(
    existing: SupportedChain[],
    incoming: SupportedChain[],
  ): SupportedChain[] {
    const result = [...existing];
    incoming.forEach((chain) => {
      if (!result.includes(chain)) {
        result.push(chain);
      }
    });
    return result;
  }

  private extractLinkedProviders(
    value: Prisma.JsonValue | null | undefined,
  ): Set<WalletProvider> {
    const providers = new Set<WalletProvider>();
    if (!Array.isArray(value)) {
      return providers;
    }

    value.forEach((item) => {
      if (!item || typeof item !== 'object') {
        return;
      }
      const providerRaw = (item as Record<string, unknown>).provider;
      if (typeof providerRaw === 'string' && isWalletProvider(providerRaw)) {
        providers.add(providerRaw);
      }
    });

    return providers;
  }

  private isProviderLinked(
    provider: WalletProvider,
    linkedProviders: Set<WalletProvider>,
    loginType: LoginType | null,
  ): boolean {
    if (linkedProviders.has(provider)) {
      return true;
    }

    if (provider === 'metamask' && loginType === LoginType.METAMASK) {
      return true;
    }

    return false;
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
    options?: { usdValue?: number; feeBps?: number },
  ): BalanceIntent {
    const usdValue =
      typeof options?.usdValue === 'number'
        ? Number(options.usdValue.toFixed(2))
        : base.usdValue;
    const feeBps = options?.feeBps ?? base.feeBps;

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
      usdValue,
      feeBps,
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

    const dynamic = this.dynamicIntents.get(intentId);
    if (dynamic) {
      return { provider: providerRaw, base: dynamic };
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

  private estimateEtaMinutes(chain: SupportedChain): number {
    switch (chain) {
      case 'arbitrum':
        return 4;
      case 'solana':
        return 5;
      case 'ethereum':
        return 7;
      default:
        return 8;
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
