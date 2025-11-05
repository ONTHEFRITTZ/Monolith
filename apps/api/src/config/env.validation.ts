import { plainToInstance } from 'class-transformer';
import {
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
