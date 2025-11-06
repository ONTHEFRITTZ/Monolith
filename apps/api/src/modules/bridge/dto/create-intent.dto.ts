import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import {
  SupportedChain,
  SupportedChainValues,
  SupportedToken,
  SupportedTokenValues,
  WalletProvider,
  WalletProviderValues,
} from '../types/bridge.types';

export class CreateIntentDto {
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
  amount!: number;

  @IsOptional()
  @IsIn(WalletProviderValues)
  walletProvider?: WalletProvider;
}

export class IntentResponseDto {
  @IsUUID()
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
  @IsIn(WalletProviderValues)
  walletProvider?: WalletProvider;
}
