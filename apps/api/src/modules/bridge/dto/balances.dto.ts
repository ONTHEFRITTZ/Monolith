import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
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
  SupportedChain,
  SupportedToken,
  WalletProvider,
} from '../types/bridge.types';

export class ProviderBalancesRequestDto {
  @IsString()
  @MaxLength(128)
  address!: string;

  @IsOptional()
  @IsArray()
  @IsEnum(SupportedChain, { each: true })
  chainConnections?: SupportedChain[];
}

export class BalanceIntentDto implements BalanceIntent {
  @IsString()
  id!: string;

  @IsEnum(SupportedChain)
  sourceChain!: SupportedChain;

  @IsEnum(SupportedToken)
  sourceToken!: SupportedToken;

  @IsEnum(SupportedChain)
  destinationChain!: SupportedChain;

  @IsEnum(SupportedToken)
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

  @IsEnum(WalletProvider)
  provider!: WalletProvider;
}

export class ProviderBalancesResponseDto {
  @IsEnum(WalletProvider)
  provider!: WalletProvider;

  @IsString()
  address!: string;

  @IsArray()
  @IsEnum(SupportedChain, { each: true })
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

  @IsEnum(SupportedToken)
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
}

export class SubmitBridgeResponseDto {
  @IsString()
  intentId!: string;

  @IsString()
  txHash!: string;

  @IsEnum(WalletProvider)
  provider!: WalletProvider;

  @IsEnum(SupportedChain)
  sourceChain!: SupportedChain;

  @IsEnum(SupportedChain)
  destinationChain!: SupportedChain;

  @IsEnum(SupportedToken)
  sourceToken!: SupportedToken;

  @IsEnum(SupportedToken)
  destinationToken!: SupportedToken;

  @IsEnum(BridgeSubmissionStatus)
  status!: BridgeSubmissionStatus;
}
