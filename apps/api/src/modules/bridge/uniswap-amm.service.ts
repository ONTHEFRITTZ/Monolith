import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Token, CurrencyAmount, TradeType, Percent } from '@uniswap/sdk-core';
import { Pool, Route, SwapRouter, Trade } from '@uniswap/v3-sdk';
import JSBI from 'jsbi';

type SwapDirection = 'usdc_to_mon' | 'mon_to_usdc';

export interface AmmQuote {
  amountInRaw: string;
  amountOutRaw: string;
  amountOutExact: string;
}

export interface SwapCalldataRequest {
  direction: SwapDirection;
  amountInRaw: string;
  recipient: string;
  slippageBps?: number;
  deadlineSeconds?: number;
}

export interface SwapCalldataResult {
  calldata: string;
  value: string;
  router: string;
}

@Injectable()
export class UniswapAmmService {
  private readonly logger = new Logger(UniswapAmmService.name);
  private readonly routerAddress?: string;
  private readonly chainId?: number;
  private readonly usdcToken?: Token;
  private readonly monToken?: Token;
  private readonly pool?: Pool;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.routerAddress = this.normalizeAddress(
      this.config.get<string>('UNISWAP_ROUTER_ADDRESS'),
    );
    this.chainId = this.parseNumber(
      this.config.get<string>('UNISWAP_CHAIN_ID'),
    );

    const usdcAddress = this.normalizeAddress(
      this.config.get<string>('UNISWAP_USDC_TOKEN_ADDRESS'),
    );
    const monAddress = this.normalizeAddress(
      this.config.get<string>('UNISWAP_MON_TOKEN_ADDRESS'),
    );
    const usdcDecimals = this.parseNumber(
      this.config.get<string>('UNISWAP_USDC_TOKEN_DECIMALS'),
    );
    const monDecimals = this.parseNumber(
      this.config.get<string>('UNISWAP_MON_TOKEN_DECIMALS'),
    );
    const fee = this.parseNumber(this.config.get<string>('UNISWAP_POOL_FEE'));
    const sqrtPriceX96Raw = this.config.get<string>(
      'UNISWAP_POOL_SQRT_PRICE_X96',
    );
    const liquidityRaw = this.config.get<string>('UNISWAP_POOL_LIQUIDITY');
    const tickRaw = this.config.get<string>('UNISWAP_POOL_TICK');

    if (
      this.routerAddress &&
      this.chainId !== undefined &&
      usdcAddress &&
      monAddress &&
      usdcDecimals !== undefined &&
      monDecimals !== undefined &&
      fee !== undefined &&
      sqrtPriceX96Raw &&
      liquidityRaw &&
      tickRaw
    ) {
      try {
        const usdcToken = new Token(
          this.chainId,
          usdcAddress,
          usdcDecimals,
          'USDC',
          'USD Coin',
        );
        const monToken = new Token(
          this.chainId,
          monAddress,
          monDecimals,
          'MON',
          'Monad',
        );
        const [token0, token1] = this.sortTokens(usdcToken, monToken);

        this.pool = new Pool(
          token0,
          token1,
          fee,
          JSBI.BigInt(sqrtPriceX96Raw),
          JSBI.BigInt(liquidityRaw),
          Number(tickRaw),
        );

        this.usdcToken = usdcToken;
        this.monToken = monToken;
        this.enabled = true;
        this.logger.log('Uniswap AMM integration ready (static pool state).');
        return;
      } catch (error) {
        this.logger.warn(
          `Failed to initialize Uniswap pool: ${(error as Error).message}`,
        );
      }
    }

    this.enabled = false;
    this.logger.log(
      'Uniswap AMM integration disabled (missing pool configuration).',
    );
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  quoteExactInput(amount: number, direction: SwapDirection): AmmQuote | null {
    if (!this.enabled || !this.usdcToken || !this.monToken || !this.pool) {
      return null;
    }
    if (amount <= 0) {
      return null;
    }

    const inputToken =
      direction === 'usdc_to_mon' ? this.usdcToken : this.monToken;
    const raw = this.toRawAmount(amount, inputToken.decimals);
    if (JSBI.lessThanOrEqual(raw, JSBI.BigInt(0))) {
      return null;
    }

    return this.quoteWithRaw(raw, direction);
  }

  buildSwapCalldata(params: SwapCalldataRequest): SwapCalldataResult | null {
    if (!this.enabled || !this.pool || !this.usdcToken || !this.monToken) {
      return null;
    }
    if (!this.routerAddress) {
      return null;
    }

    const amountInRaw = JSBI.BigInt(params.amountInRaw);
    if (JSBI.lessThanOrEqual(amountInRaw, JSBI.BigInt(0))) {
      return null;
    }

    const quote = this.quoteWithRaw(amountInRaw, params.direction);
    if (!quote) {
      return null;
    }

    const inputToken =
      params.direction === 'usdc_to_mon' ? this.usdcToken : this.monToken;
    const outputToken =
      params.direction === 'usdc_to_mon' ? this.monToken : this.usdcToken;

    const route = new Route([this.pool], inputToken, outputToken);
    const trade = Trade.createUncheckedTrade({
      route,
      inputAmount: CurrencyAmount.fromRawAmount(inputToken, amountInRaw),
      outputAmount: CurrencyAmount.fromRawAmount(
        outputToken,
        JSBI.BigInt(quote.amountOutRaw),
      ),
      tradeType: TradeType.EXACT_INPUT,
    });

    const slippageTolerance = new Percent(params.slippageBps ?? 50, 10_000);
    const deadline =
      params.deadlineSeconds ?? Math.floor(Date.now() / 1000) + 15 * 60;

    const { calldata, value } = SwapRouter.swapCallParameters(trade, {
      slippageTolerance,
      recipient: params.recipient,
      deadline,
    });

    return {
      calldata,
      value: value ?? '0x0',
      router: this.routerAddress,
    };
  }

  private quoteWithRaw(
    amountInRaw: JSBI,
    direction: SwapDirection,
  ): AmmQuote | null {
    if (!this.pool || !this.usdcToken || !this.monToken) {
      return null;
    }

    const inputToken =
      direction === 'usdc_to_mon' ? this.usdcToken : this.monToken;
    const amountIn = CurrencyAmount.fromRawAmount(inputToken, amountInRaw);
    const [amountOut] = this.pool.getOutputAmount(amountIn);

    return {
      amountInRaw: amountInRaw.toString(),
      amountOutRaw: amountOut.quotient.toString(),
      amountOutExact: amountOut.toExact(),
    };
  }

  private toRawAmount(amount: number, decimals: number): JSBI {
    const factor = 10 ** decimals;
    const scaled = Math.floor(amount * factor);
    return JSBI.BigInt(scaled);
  }

  private sortTokens(tokenA: Token, tokenB: Token): [Token, Token] {
    if (tokenA.sortsBefore(tokenB)) {
      return [tokenA, tokenB];
    }
    return [tokenB, tokenA];
  }

  private normalizeAddress(value?: string | null): string | undefined {
    if (!value) {
      return undefined;
    }
    return value.toLowerCase();
  }

  private parseNumber(value?: string | null): number | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
}
