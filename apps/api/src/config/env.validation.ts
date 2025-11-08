import { plainToInstance } from 'class-transformer';
import {
  IsBooleanString,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsInt()
  @Min(1)
  PORT!: number;

  @IsString()
  ALCHEMY_APP_ID!: string;

  @IsUrl()
  ALCHEMY_ETH_RPC_URL!: string;

  @IsUrl()
  ALCHEMY_ARB_RPC_URL!: string;

  @IsUrl()
  ALCHEMY_SOL_RPC_URL!: string;

  @IsUrl()
  MONAD_RPC_URL!: string;

  @IsString()
  DATABASE_URL!: string;

  @IsOptional()
  @IsString()
  PAYMASTER_POLICY_ID?: string;

  @IsOptional()
  @IsString()
  PAYMASTER_API_KEY?: string;

  @IsOptional()
  @IsUrl()
  HYPERLIQUID_PRICE_URL?: string;

  @IsOptional()
  @IsString()
  HYPERLIQUID_MON_SYMBOL?: string;

  @IsOptional()
  @IsBooleanString()
  CIRCLE_CCTP_ENABLED?: string;

  @IsOptional()
  @IsString()
  CIRCLE_BRIDGE_EVM_PRIVATE_KEY?: string;

  @IsOptional()
  @IsString()
  CIRCLE_CCTP_MONAD_CHAIN_NAME?: string;

  @IsOptional()
  @IsString()
  CIRCLE_CCTP_MONAD_TOKEN_MESSENGER?: string;

  @IsOptional()
  @IsString()
  CIRCLE_CCTP_MONAD_MESSAGE_TRANSMITTER?: string;

  @IsOptional()
  @IsString()
  CIRCLE_CCTP_TRANSFER_SPEED?: string;

  @IsOptional()
  @IsString()
  CIRCLE_MINT_API_KEY?: string;

  @IsOptional()
  @IsString()
  CIRCLE_MINT_ENVIRONMENT?: string;

  @IsOptional()
  @IsString()
  CIRCLE_MINT_WIRE_ACCOUNT_ID?: string;

  @IsOptional()
  @IsString()
  CIRCLE_SMART_WALLET_API_KEY?: string;

  @IsOptional()
  @IsString()
  CIRCLE_SMART_WALLET_API_BASE?: string;

  @IsOptional()
  @IsString()
  CIRCLE_SMART_WALLET_ENTITY_ID?: string;

  @IsOptional()
  @IsString()
  CIRCLE_SMART_WALLET_APP_ID?: string;

  @IsOptional()
  @IsString()
  CIRCLE_SMART_WALLET_DEFAULT_POLICY_ID?: string;

  @IsOptional()
  @IsString()
  CIRCLE_SMART_WALLET_START_SESSION_PATH?: string;

  @IsOptional()
  @IsString()
  CIRCLE_SMART_WALLET_SESSION_STATUS_PATH?: string;

  @IsOptional()
  @IsString()
  CIRCLE_SMART_WALLET_FINALIZE_PATH?: string;

  @IsOptional()
  @IsString()
  CIRCLE_SMART_WALLET_RECOVERY_PATH?: string;

  @IsOptional()
  @IsString()
  UNISWAP_ROUTER_ADDRESS?: string;

  @IsOptional()
  @IsString()
  UNISWAP_CHAIN_ID?: string;

  @IsOptional()
  @IsString()
  UNISWAP_USDC_TOKEN_ADDRESS?: string;

  @IsOptional()
  @IsString()
  UNISWAP_USDC_TOKEN_DECIMALS?: string;

  @IsOptional()
  @IsString()
  UNISWAP_MON_TOKEN_ADDRESS?: string;

  @IsOptional()
  @IsString()
  UNISWAP_MON_TOKEN_DECIMALS?: string;

  @IsOptional()
  @IsString()
  UNISWAP_POOL_FEE?: string;

  @IsOptional()
  @IsString()
  UNISWAP_POOL_SQRT_PRICE_X96?: string;

  @IsOptional()
  @IsString()
  UNISWAP_POOL_LIQUIDITY?: string;

  @IsOptional()
  @IsString()
  UNISWAP_POOL_TICK?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Environment validation failed: ${errors
        .map((error) => Object.values(error.constraints ?? {}).join(', '))
        .join('; ')}`,
    );
  }

  return validatedConfig;
}
