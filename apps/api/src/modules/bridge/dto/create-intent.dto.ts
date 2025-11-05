import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import {
  SupportedChain,
  SupportedToken,
  WalletProvider,
} from '../types/bridge.types';

export class CreateIntentDto {
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
  amount!: number;

  @IsOptional()
  @IsEnum(WalletProvider)
  walletProvider?: WalletProvider;
}

export class IntentResponseDto {
  @IsUUID()
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
  amount!: number;

  @IsNumber()
  @Min(0)
  feeBps!: number;

  @IsNumber()
  @Min(0)
  sourceUsdPrice!: number;

  @IsNumber()
  @Min(0)
  destinationUsdPrice!: number;

  @IsNumber()
  @Min(0)
  estimatedDestinationAmount!: number;

  @IsString()
  status!:
    | 'created'
    | 'pending_source'
    | 'pending_settlement'
    | 'settled'
    | 'failed';

  @IsOptional()
  @IsEnum(WalletProvider)
  walletProvider?: WalletProvider;
}
