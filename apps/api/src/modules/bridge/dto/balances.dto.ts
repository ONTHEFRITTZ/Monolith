import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  BalanceIntent,
  BridgeSubmissionStatus,
  BridgeSubmissionStatusValues,
  SupportedChain,
  SupportedChainValues,
  SupportedToken,
  SupportedTokenValues,
  WalletProvider,
  WalletProviderValues,
} from '../types/bridge.types';

export class ProviderBalancesRequestDto {
  @IsString()
  @MaxLength(128)
  address!: string;

  @IsOptional()
  @IsArray()
  @IsIn(SupportedChainValues, { each: true })
  chainConnections?: SupportedChain[];
}

export class BalanceIntentDto implements BalanceIntent {
  @IsString()
  id!: string;

  @IsIn(SupportedChainValues)
  sourceChain!: SupportedChain;

  @IsIn(SupportedTokenValues)
  sourceToken!: SupportedToken;

  @IsIn(SupportedChainValues)
  destinationChain!: SupportedChain;

  @IsIn(SupportedTokenValues)
  destinationToken!: SupportedToken;

  @IsNumber()
  @IsPositive()
  availableAmount!: number;

  @IsString()
  availableFormatted!: string;

  @IsNumber()
  @Min(0)
  usdValue!: number;

  @IsNumber()
  @Min(0)
  feeBps!: number;

  @IsNumber()
  @Min(0)
  etaMinutes!: number;

  @IsIn(WalletProviderValues)
  provider!: WalletProvider;
}

export class ProviderBalancesResponseDto {
  @IsIn(WalletProviderValues)
  provider!: WalletProvider;

  @IsString()
  address!: string;

  @IsArray()
  @IsIn(SupportedChainValues, { each: true })
  chainConnections!: SupportedChain[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BalanceIntentDto)
  intents!: BalanceIntentDto[];
}

export class QuoteRequestDto {
  @IsString()
  @MaxLength(128)
  intentId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  slippageBps?: number;
}

export class QuoteResponseDto {
  @IsString()
  intentId!: string;

  @IsNumber()
  @IsPositive()
  sourceAmount!: number;

  @IsNumber()
  @Min(0)
  destinationAmount!: number;

  @IsNumber()
  @Min(0)
  feeAmount!: number;

  @IsIn(SupportedTokenValues)
  feeCurrency!: SupportedToken;

  @IsNumber()
  @Min(0)
  rate!: number;

  @IsNumber()
  expiresAt!: number;
}

export class SubmitBridgeRequestDto {
  @IsString()
  @MaxLength(128)
  intentId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  slippageBps?: number;
}

export class SubmitBridgeResponseDto {
  @IsString()
  intentId!: string;

  @IsString()
  txHash!: string;

  @IsIn(WalletProviderValues)
  provider!: WalletProvider;

  @IsIn(SupportedChainValues)
  sourceChain!: SupportedChain;

  @IsIn(SupportedChainValues)
  destinationChain!: SupportedChain;

  @IsIn(SupportedTokenValues)
  sourceToken!: SupportedToken;

  @IsIn(SupportedTokenValues)
  destinationToken!: SupportedToken;

  @IsIn(BridgeSubmissionStatusValues)
  status!: BridgeSubmissionStatus;
}
